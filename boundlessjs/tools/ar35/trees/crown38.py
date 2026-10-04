#!/usr/bin/env python3
# TR38 crown statistics inside a crown box (1600 x 900 frame pixels): foliage = green-dominant pixels (as foliage36.py);
# sky = bright (L > 120), blue >= red, saturation < 0.5, not foliage. Prints the foliage share of the box, the sky share,
# foliage L10 / L50 / L90 (Rec. 709 luma of sRGB values), the share of foliage brighter than 120 (sunlit leaves), mean
# saturation and mean sRGB of the foliage, and the hue (degrees) of the sunlit foliage.
#   python3 tools/ar35/trees/crown38.py x0 y0 x1 y1 image [image ...]
import sys, colorsys
import numpy as np
from PIL import Image

def stats(path, box):
    im = Image.open(path).convert('RGB')
    if im.size != (1600, 900): im = im.resize((1600, 900), Image.LANCZOS)
    a = np.asarray(im, np.float32)[box[1]:box[3], box[0]:box[2]]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    fol = (g > r) & (g > b) & (sat > 0.12) & (mx > 15)
    sky = ~fol & (L > 120) & (b >= r) & (sat < 0.5)
    if fol.sum() < 50: return {'fol': round(float(fol.mean()), 3)}
    Lf = L[fol]
    lit = fol & (L > 120)
    hue = None
    if lit.sum() > 50:
        m = a[lit].mean(0) / 255.0
        hue = round(colorsys.rgb_to_hsv(*m)[0] * 360, 1)
    return {'fol': round(float(fol.mean()), 3), 'sky': round(float(sky.mean()), 3),
            'L10/50/90': [round(float(np.percentile(Lf, q)), 1) for q in (10, 50, 90)],
            'lit': round(float((Lf > 120).mean()), 3), 'sat': round(float(sat[fol].mean()), 3),
            'rgb': [round(float(v), 1) for v in a[fol].mean(0)], 'litHue': hue}

if __name__ == '__main__':
    box = [int(x) for x in sys.argv[1:5]]
    for f in sys.argv[5:]: print(f.split('/')[-2] + '/' + f.split('/')[-1], stats(f, box))
