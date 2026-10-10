# UE (AR34, 2026-10-07): a UE take's raw Movie Render Queue passes -> the take folder (ue_take.py runs this with numpy,
# Pillow and OpenEXR after the render).
#   <raw>/frame_<n>_FinalImage.png  -> <out>/frame_%05d.jpg (JPEG q95, like the web and Cycles takes)
#   <raw>/frame_<n>_Data.exr        -> <out>/_ue/regions/frame_%05d.png (the region ids of ue_families.json, 8-bit) and
#                                      <out>/_depth/depth_%04d.png (planar depth, 16-bit, v / 65535 * 18 - 2 = log2 metres)
#   the take's cameras              -> <out>/_depth/cams.json (camera-to-world in metres and the view frame, per frame), so
#                                      bx_leafcheck.py reprojects a UE take as it does a Cycles one
# Prints the per-frame records (seconds between the frames' files; the first from the render's start) as JSON (--json).
import argparse, glob, json, os, re
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--raw'); ap.add_argument('--out'); ap.add_argument('--side')
ap.add_argument('--res', default='2560x1440'); ap.add_argument('--quality', type=int, default=95)
ap.add_argument('--t0', type=float, default=0.0); ap.add_argument('--json', required=True)
ap.add_argument('--focus', help='R4-CINE: a take\'s _depth folder -> the subject\'s distance per frame (--json)')
a = ap.parse_args()
if a.focus:
    # R4-CINE: the cinematic preset's focus: per frame the 30th percentile of the planar depth over the frame's central
    # third (what the lens is pointed at, the nearer side of it), a 9-frame median against flicker, then eased (0.25 a frame)
    fs = sorted(int(f[6:10]) for f in os.listdir(a.focus) if f.startswith('depth_') and f.endswith('.png'))
    raw = {}
    for f in fs:
        v = np.asarray(Image.open(os.path.join(a.focus, 'depth_%04d.png' % f)), np.float64)
        h, w = v.shape[:2]
        c = v[h // 3: 2 * h // 3, w // 3: 2 * w // 3].ravel()
        raw[f] = float(2.0 ** (np.percentile(c, 30) / 65535.0 * 18.0 - 2.0))
    keys = sorted(raw); med = {}
    for i, f in enumerate(keys):
        win = [raw[keys[j]] for j in range(max(0, i - 4), min(len(keys), i + 5))]
        med[f] = float(np.median(win))
    out, prev = {}, None
    for f in keys:
        prev = med[f] if prev is None else prev + (med[f] - prev) * 0.25
        out[str(f)] = round(prev, 3)
    json.dump({'focus': out, 'frames': len(out), 'from': a.focus}, open(a.json, 'w'))
    print('UE_FOCUS ' + json.dumps({'frames': len(out), 'min_m': min(out.values()) if out else None, 'max_m': max(out.values()) if out else None}))
    raise SystemExit(0)
if not (a.raw and a.out and a.side): ap.error('--raw, --out and --side are required')
side = json.load(open(a.side))
W, H = [int(v) for v in a.res.split('x')]
reg_dir = os.path.join(a.out, '_ue', 'regions'); dep_dir = os.path.join(a.out, '_depth')
os.makedirs(reg_dir, exist_ok=True); os.makedirs(dep_dir, exist_ok=True)


def read_exr(path):
    """the data pass's layer of Movie Render Queue's multilayer EXR (<pass>Data.R region, .G depth in metres)."""
    import OpenEXR
    with OpenEXR.File(path, separate_channels=True) as f:
        ch = f.channels()
        lay = next((k[:-2] for k in ch if k.endswith('Data.R')), None)
        if lay is None: raise KeyError(f'no data layer in {list(ch)}')
        return np.asarray(ch[lay + '.R'].pixels, np.float32), np.asarray(ch[lay + '.G'].pixels, np.float32)


frames = {}
for p in glob.glob(os.path.join(a.raw, 'frame_*')):
    # (Movie Render Queue: frame_<n>_FinalImage.png, frame_<n>_FinalImageData.png, and one multilayer frame_<n>_.exr)
    m = re.match(r'frame_(\d+)_(FinalImage|FinalImageData|)\.(png|exr|jpe?g)$', os.path.basename(p))
    if m: frames.setdefault(int(m.group(1)), {})[('Data' if m.group(3) == 'exr' else m.group(2), m.group(3))] = p
per, prev, nreg, ndep = [], a.t0, 0, 0
cams = {'res': [W, H], 'frames': {}}
U = (side.get('camera') or {}).get('ue') or []
cam = side.get('camera') or {}
f0 = side['frames'][0]
d0 = float(cam.get('focal', 21.65)) / max(1e-6, float(cam.get('hap', 42.67)))
hh = 0.5 * H / W
vf = [[0.5, hh, -d0], [0.5, -hh, -d0], [-0.5, -hh, -d0], [-0.5, hh, -d0]]
order = sorted(frames, key=lambda f: os.path.getmtime(frames[f].get(('FinalImage', 'png')) or next(iter(frames[f].values()))))
for f in order:
    src = frames[f].get(('FinalImage', 'png')) or frames[f].get(('FinalImage', 'jpg')) or frames[f].get(('FinalImage', 'jpeg'))
    if not src: continue
    mt = os.path.getmtime(src)
    Image.open(src).convert('RGB').save(os.path.join(a.out, f'frame_{f:05d}.jpg'), quality=a.quality)
    per.append({'frame': f, 'secs': round(mt - prev, 2)}); prev = mt
    ex = frames[f].get(('Data', 'exr'))
    if ex:
        R, G = read_exr(ex)
        Image.fromarray(np.clip(np.round(R), 0, 255).astype(np.uint8)).save(os.path.join(reg_dir, f'frame_{f:05d}.png'))
        z = np.clip(G, 0.25, 65536.0)
        v = np.clip((np.log2(z) + 2.0) / 18.0 * 65535.0, 0, 65535).astype(np.uint16)
        Image.fromarray(v).save(os.path.join(dep_dir, 'depth_%04d.png' % f))
        nreg += 1; ndep += 1
    k = f - f0
    if 0 <= k < len(U) and U[k].get('m'):
        cams['frames'][str(f)] = {'m': U[k]['m'], 'vf': vf}
if cams['frames']:
    old = {}
    try: old = json.load(open(os.path.join(dep_dir, 'cams.json')))
    except Exception: pass
    if old.get('res') == cams['res']: old.get('frames', {}).update(cams['frames']); cams['frames'] = old['frames']
    json.dump(cams, open(os.path.join(dep_dir, 'cams.json'), 'w'))
json.dump({'per_frame': per, 'regions': nreg, 'depth': ndep}, open(a.json, 'w'))
print('UE_FRAMES ' + json.dumps({'frames': len(per), 'regions': nreg, 'depth': ndep}))
