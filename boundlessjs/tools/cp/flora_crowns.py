# CP32F step 3: crowns from the canopy (tools/cp/flora_canopy.py). The canopy's near-infrared, smoothed at the scale of a
# clump, peaks on each sunlit crown top and falls into the shaded gaps between crowns; a watershed of it from those peaks,
# inside the canopy mask, splits the canopy into crowns. Each crown: its centroid, its area -> radius, its mean NDVI and
# green/NIR ratio (conifers read darker and bluer in NIR). Heights come later, from the crown width (allometry).
#
#   python tools/cp/flora_crowns.py <scratchDir> [sigma_m=1.2] [minDist_m=2.5]
import sys, os, json, math
import numpy as np
from scipy import ndimage
from skimage.segmentation import watershed
from skimage.feature import peak_local_max
from PIL import Image, ImageDraw

D = sys.argv[1]
SIG = float(sys.argv[2]) if len(sys.argv) > 2 else 1.2
MIND = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5
G = json.load(open(os.path.join(D, 'grid.json'))); RES = G['RES']
B = np.load(os.path.join(D, 'grid_rgbn.npy'))
C = np.load(os.path.join(D, 'grid_canopy.npy'))
R, Gc, Bl, N = [B[..., i].astype(np.float32) for i in range(4)]
ndvi = (N - R) / (N + R + 1)
S = ndimage.gaussian_filter(N, SIG / RES)
S[~C] = 0
pk = peak_local_max(S, min_distance=max(1, int(round(MIND / RES))), labels=C.astype(np.int32), exclude_border=False)
mk = np.zeros(C.shape, np.int32)
mk[pk[:, 0], pk[:, 1]] = np.arange(1, len(pk) + 1)
lab = watershed(-S, mk, mask=C)
n = len(pk)
idx = np.arange(1, n + 1)
area = ndimage.sum(np.ones_like(lab, np.float32), lab, idx) * RES * RES
cr = ndimage.mean(np.indices(C.shape)[0].astype(np.float32), lab, idx)
cc = ndimage.mean(np.indices(C.shape)[1].astype(np.float32), lab, idx)
mnd = ndimage.mean(ndvi, lab, idx)
mgn = ndimage.mean(Gc / np.maximum(N, 1), lab, idx)
mN = ndimage.mean(N, lab, idx)
rad = np.sqrt(area / math.pi)
u = G['U0'] + (cc + 0.5) * RES; v = G['V0'] + (cr + 0.5) * RES
ok = area >= 6
print('peaks %d, crowns (>= 6 m2) %d; radius p10/p50/p90 %.1f / %.1f / %.1f m; canopy %.0f m2' % (n, ok.sum(), *np.percentile(rad[ok], [10, 50, 90]), C.sum() * RES * RES))
np.save(os.path.join(D, 'crowns.npy'), np.stack([u[ok], v[ok], rad[ok], mnd[ok], mgn[ok], mN[ok], area[ok]], -1).astype(np.float32))
np.save(os.path.join(D, 'crown_lab.npy'), lab.astype(np.int32))
# preview: the south quarter at 1 m, crowns as circles
g = ((R + Gc + Bl) / 3).astype(np.uint8)
im = Image.fromarray(np.stack([g, g, g], -1)[::2, 1800:3800:2])
dr = ImageDraw.Draw(im)
for i in np.nonzero(ok)[0]:
    x = (cc[i] - 1800) / 2; y = cr[i] / 2; r = rad[i] / RES / 2
    if -20 < x < 1020: dr.ellipse([x - r, y - r, x + r, y + r], outline=(255, 60, 40))
im.save(os.path.join(D, 'prev_crowns.png'))
