# OFFLINE TARGETS (AR34 LOOK, 2026-10-02): the speed variants of bench_cycles.py against the 128 spp reference, at full
# resolution: PSNR and a windowed SSIM on luma, and a sheet of 1:1 crops (three regions) per variant.
#   python bench_compare.py --dir <bench out dir> --out <sheet.jpg> [--ref bench_ref.png]
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--dir', required=True); ap.add_argument('--out', required=True); ap.add_argument('--ref', default='bench_ref.png')
ap.add_argument('--variants', default='persist_f0,s64,s32,s16,s8,s1,nomb32_vecblur,nomb32,bnc32,eevee')
A = ap.parse_args()
def luma(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def load(f): return np.asarray(Image.open(f).convert('RGB')).astype(np.float64)
def ssim(x, y, k=8):
    # mean SSIM over k x k blocks (luma, 8-bit range)
    H, W = x.shape; H -= H % k; W -= W % k
    xb = x[:H, :W].reshape(H // k, k, W // k, k); yb = y[:H, :W].reshape(H // k, k, W // k, k)
    mx, my = xb.mean((1, 3)), yb.mean((1, 3))
    vx, vy = xb.var((1, 3)), yb.var((1, 3)); cxy = ((xb - mx[:, None, :, None]) * (yb - my[:, None, :, None])).mean((1, 3))
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    return float((((2 * mx * my + C1) * (2 * cxy + C2)) / ((mx ** 2 + my ** 2 + C1) * (vx + vy + C2))).mean())
ref = load(os.path.join(A.dir, A.ref)); rl = luma(ref)
bench = json.load(open(os.path.join(A.dir, 'bench.json'))) if os.path.exists(os.path.join(A.dir, 'bench.json')) else {}
# the split from Blender's own status lines in bench.log: per variant, Cycles' clock at the first sample (sync, BVH,
# images, kernels) and at "Finished" (the render); the lines before a 'BENCH <name>' line belong to that variant
import re
def split_log(f):
    out, block = {}, []
    if not os.path.exists(f): return out
    for line in open(f, errors='replace'):
        m = re.match(r'BENCH (\S+) (\{.*\})', line.strip())
        if m:
            t_first = t_fin = None
            for l in block:
                tm = re.search(r'Time:(\d+):(\d+\.\d+)', l)
                if not tm: continue
                t = int(tm.group(1)) * 60 + float(tm.group(2))
                if t_first is None and re.search(r'Sample [01]/', l): t_first = t
                if 'Finished' in l: t_fin = t
            if t_fin is not None: out[m.group(1)] = {'setup': round(t_first, 2) if t_first is not None else None, 'render': round(t_fin, 2), 'sampling': round(t_fin - t_first, 2) if t_first is not None else None}
            block = []
        else: block.append(line)
    return out
SPLIT = split_log(os.path.join(A.dir, 'bench.log'))
for k, v in SPLIT.items(): bench.setdefault(k, {}).update(v)
print('split', json.dumps(SPLIT))
rows = []
for v in A.variants.split(','):
    f = os.path.join(A.dir, f'bench_{v}.png')
    if not os.path.exists(f): continue
    im = load(f); l = luma(im)
    mse = ((l - rl) ** 2).mean(); psnr = 10 * np.log10(255 ** 2 / max(mse, 1e-9))
    rows.append({'variant': v, 'psnr': round(float(psnr), 2), 'ssim': round(ssim(l, rl), 4), **(bench.get(v) or {})})
print(json.dumps(rows, indent=1))
json.dump(rows, open(os.path.join(A.dir, 'compare.json'), 'w'), indent=1)
# 1:1 crops: the street (bottom left), the viaduct's lattice and deck (top middle), trees and background (middle)
boxes = [(0, 1040, 640, 1400), (900, 200, 1540, 560), (760, 760, 1400, 1120)]
show = ['ref'] + [r['variant'] for r in rows if r['variant'] in ('s64', 's32', 's16', 's8', 's1', 'nomb32_vecblur', 'eevee')]
try: font = ImageFont.truetype('DejaVuSans.ttf', 20)
except Exception: font = ImageFont.load_default()
cw, ch = 640, 360
S = Image.new('RGB', (len(boxes) * (cw + 6), len(show) * (ch + 30)), (16, 16, 16)); d = ImageDraw.Draw(S)
for j, v in enumerate(show):
    im = Image.open(os.path.join(A.dir, A.ref if v == 'ref' else f'bench_{v}.png')).convert('RGB')
    r = next((x for x in rows if x['variant'] == v), {})
    cap = f"{v}: {r.get('wall', bench.get('ref', {}).get('wall', ''))} s" + (f", PSNR {r['psnr']} dB, SSIM {r['ssim']}" if r else ' (reference, 128 spp)')
    for i, b in enumerate(boxes):
        S.paste(im.crop(b), (i * (cw + 6), j * (ch + 30)))
    d.text((6, j * (ch + 30) + ch + 4), cap, fill=(235, 235, 235), font=font)
S.save(A.out, quality=92)
print('sheet', A.out, S.size)
