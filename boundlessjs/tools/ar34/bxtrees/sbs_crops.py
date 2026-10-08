#!/usr/bin/env python3
# TREEUE (AR34, 2026-10-07): 1:1 crops of the same window from several takes, side by side with labels (before / after
# reviews of the street trees).
#
#   python3 tools/ar34/bxtrees/sbs_crops.py --out sheet.jpg --box x0,y0,x1,y1 [--box ...] --frame 54 \
#       --take "web=boundlessjs/shots/ad/clips/t7ArchTrack" --take "UE before=..." --take "UE after=..." [--cols 2] [--scale 1]
# Each --box is one row of the sheet; each --take one column (its frame_%05d.jpg). --scale 2 doubles the crops (nearest).
import argparse, os
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--box', action='append', required=True)
ap.add_argument('--take', action='append', required=True)
ap.add_argument('--frame', type=int, default=54)
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--title', default='')
a = ap.parse_args()
takes = [t.split('=', 1) for t in a.take]
boxes = [[int(v) for v in b.split(',')] for b in a.box]
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
except Exception: font = ImageFont.load_default()
cw = max(int((b[2] - b[0]) * a.scale) for b in boxes)
rows = []
for b in boxes:
    w, h = int((b[2] - b[0]) * a.scale), int((b[3] - b[1]) * a.scale)
    rows.append((b, w, h))
pad, lab = 6, 26
W = len(takes) * (cw + pad) + pad
H = sum(h + lab + pad for _, _, h in rows) + pad + (30 if a.title else 0)
S = Image.new('RGB', (W, H), (18, 18, 18))
d = ImageDraw.Draw(S)
y = pad
if a.title:
    d.text((pad, y), a.title, fill=(235, 235, 235), font=font); y += 30
for b, w, h in rows:
    for j, (name, path) in enumerate(takes):
        x = pad + j * (cw + pad)
        p = os.path.join(path, f'frame_{a.frame:05d}.jpg') if os.path.isdir(path) else path
        d.text((x, y + 3), f'{name}  f{a.frame:03d}  [{b[0]},{b[1]}-{b[2]},{b[3]}]', fill=(230, 230, 120), font=font)
        if os.path.exists(p):
            im = Image.open(p).convert('RGB').crop(tuple(b))
            if a.scale != 1.0: im = im.resize((w, h), Image.NEAREST)
            S.paste(im, (x, y + lab))
        else:
            d.text((x + 10, y + lab + 10), 'missing: ' + p, fill=(255, 80, 80), font=font)
    y += h + lab + pad
S.save(a.out, quality=92)
print(a.out, S.size)
