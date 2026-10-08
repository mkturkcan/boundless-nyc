# HQ (AR34 UE round 3, 2026-10-07): the CC0 material sets for the Unreal target's layered materials (asphalt, sidewalk
# concrete, granite kerbs, the viaduct's painted steel and rust, the walls by class), downloaded at 4K into
# /data0/projectnyc_aux/assets/hq/<id>/ (never into git), with hq.json beside them: per set its source, licence, page,
# real size in metres, files (albedo, OpenGL normal, AO / roughness / metalness packed as R / G / B) and the albedo's
# mean in linear RGB (the tint that puts a set at a material's own colour). The table from family and pbrLib set to these
# sets is ue_families.json 'hq'.
#
#   source /data0/projectnyc_aux/env.sh
#   uv run --no-project --with pillow --with numpy python tools/assets/fetch_hq.py [--res 4k] [--only a,b] [--out <dir>]
#
# Every set here is CC0 (Poly Haven: https://polyhaven.com/license). A set that is already complete is not downloaded again.
import argparse, json, os, sys, time, urllib.request
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
# (id, source, what it stands for)
SETS = [
    ('asphalt_02', 'polyhaven', 'street asphalt'),
    ('concrete_pavement', 'polyhaven', 'sidewalk concrete flags'),
    ('granite_wall', 'polyhaven', 'granite kerbs, granite walls'),
    ('green_metal_rust', 'polyhaven', 'the viaduct paint over steel'),
    ('rust_coarse_01', 'polyhaven', 'the viaduct rust'),
    ('red_brick', 'polyhaven', 'red brick walls'),
    ('brick_wall_10', 'polyhaven', 'dark brown brick walls'),
    ('brown_brick_02', 'polyhaven', 'tan and buff brick walls'),
    ('painted_brick', 'polyhaven', 'painted brick walls'),
    ('large_sandstone_blocks', 'polyhaven', 'limestone, cast stone, brownstone'),
    ('concrete_wall_008', 'polyhaven', 'cast-in-place concrete walls'),
    ('preconcrete_wall_001', 'polyhaven', 'precast concrete panels'),
    ('white_stucco', 'polyhaven', 'stucco'),
]
LICENCE = {'polyhaven': 'CC0 1.0 (https://polyhaven.com/license)'}
UA = {'User-Agent': 'boundless-nyc-hq-fetch/1.0'}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def download(url, dst):
    tmp = dst + '.part'
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(tmp, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    os.replace(tmp, dst)


def pick(files, key, res):
    """a map's jpg (else png) at res, else the nearest lower resolution."""
    m = files.get(key) or {}
    for r in [res] + [x for x in ('8k', '4k', '2k', '1k') if x != res]:
        if r in m:
            for fmt in ('jpg', 'png'):
                if fmt in m[r]: return m[r][fmt]['url'], r
    return None, None


def mean_linear(path):
    im = Image.open(path).convert('RGB')
    im.thumbnail((256, 256))
    a = np.asarray(im, np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)]


def fetch_polyhaven(sid, out, res):
    info = get_json(f'https://api.polyhaven.com/info/{sid}')
    files = get_json(f'https://api.polyhaven.com/files/{sid}')
    d = os.path.join(out, sid); os.makedirs(d, exist_ok=True)
    rec = {'source': 'polyhaven', 'licence': LICENCE['polyhaven'], 'page': f'https://polyhaven.com/a/{sid}',
           'size_m': [round(float(v) / 1000.0, 3) for v in (info.get('dimensions') or [2000, 2000])[:2]], 'files': {}, 'urls': {}}
    for key, name in (('Diffuse', 'alb'), ('nor_gl', 'nrm'), ('arm', 'arm')):
        url, r = pick(files, key, res)
        if not url: continue
        dst = os.path.join(d, f'{sid}_{name}_{r}{os.path.splitext(url)[1]}')
        if not os.path.exists(dst): download(url, dst)
        rec['files'][name] = dst; rec['urls'][name] = url
    if 'arm' not in rec['files']:
        # no packed map: AO, roughness (and no metalness) packed here as R, G, B
        parts = {}
        for key in ('AO', 'Rough'):
            url, r = pick(files, key, res)
            if url:
                dst = os.path.join(d, f'{sid}_{key.lower()}_{r}{os.path.splitext(url)[1]}')
                if not os.path.exists(dst): download(url, dst)
                parts[key] = dst; rec['urls'][key.lower()] = url
        if 'Rough' in parts:
            R = Image.open(parts['Rough']).convert('L')
            A = Image.open(parts['AO']).convert('L').resize(R.size) if 'AO' in parts else Image.new('L', R.size, 255)
            dst = os.path.join(d, f'{sid}_arm_{res}.jpg')
            Image.merge('RGB', (A, R, Image.new('L', R.size, 0))).save(dst, quality=95)
            rec['files']['arm'] = dst
    if 'alb' in rec['files']: rec['albedo_mean'] = mean_linear(rec['files']['alb'])
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', default='4k'); ap.add_argument('--only'); ap.add_argument('--out', default='/data0/projectnyc_aux/assets/hq')
    A = ap.parse_args()
    os.makedirs(A.out, exist_ok=True)
    jp = os.path.join(A.out, 'hq.json')
    man = json.load(open(jp)) if os.path.exists(jp) else {}
    only = set(A.only.split(',')) if A.only else None
    for sid, src, what in SETS:
        if only and sid not in only: continue
        if sid in man and all(os.path.exists(f) for f in man[sid].get('files', {}).values()) and len(man[sid].get('files', {})) >= 3:
            print(f'HQ {sid}: have it'); continue
        t0 = time.time()
        try:
            rec = fetch_polyhaven(sid, A.out, A.res) if src == 'polyhaven' else None
        except Exception as e:
            print(f'HQ {sid}: FAILED {e}'); continue
        rec['use'] = what
        man[sid] = rec
        json.dump(man, open(jp, 'w'), indent=1)
        print(f'HQ {sid}: {len(rec["files"])} maps, {rec["size_m"]} m, mean {rec.get("albedo_mean")}, {time.time() - t0:.0f} s')
    print('HQ_DONE ' + json.dumps({'sets': len(man), 'out': jp}))


if __name__ == '__main__':
    sys.exit(main())
