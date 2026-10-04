#!/usr/bin/env python3
# Foliage statistics of a frame region (TR36 side-by-sides): green-dominant pixels (G > R, G > B, HSV saturation > 0.12,
# value > 0.06), their share of the region, median luma (Rec. 709 on sRGB values), mean HSV saturation and mean sRGB.
#   python3 tools/ar35/trees/foliage36.py <image> [x0 y0 x1 y1] [more images ...]   (region in pixels of a 1600 x 900 frame)
import sys
import numpy as np
from PIL import Image

def stats(path, box=None):
    im = Image.open(path).convert('RGB')
    if im.size != (1600, 900): im = im.resize((1600, 900), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    if box: a = a[box[1]:box[3], box[0]:box[2]]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    m = (g > r) & (g > b) & (sat > 0.12) & (mx > 15)
    if m.sum() < 50: return {'share': round(float(m.mean()), 3)}
    L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return {'share': round(float(m.mean()), 3), 'L50': round(float(np.median(L[m])), 1), 'sat': round(float(sat[m].mean()), 3),
            'rgb': [round(float(v), 1) for v in a[m].mean(0)]}

if __name__ == '__main__':
    args = sys.argv[1:]
    box = None
    if len(args) >= 5 and all(x.lstrip('-').isdigit() for x in args[1:5]):
        box = [int(x) for x in args[1:5]]; files = [args[0]] + args[5:]
    else: files = args
    for f in files: print(f, stats(f, box))
