# CP32F step 2: canopy vs lawn from NAIP (the park grid of tools/cp/flora_grid.py). A cell is vegetation where the
# near-infrared is strong against the red (NDVI) and bright (water and shade are dark in NIR); vegetation is CANOPY where
# it is darker in the visible than a mown lawn or textured (a crown's sunlit and shaded clumps; a lawn is smooth).
# Thresholds measured on the grid (look.py samples, 2026-09-30): Sheep Meadow and the Great Lawn read G 106-109,
# NDVI 0.35-0.39, local NIR std 2.5-3.9; the Ramble and the North Woods G 72-79, NDVI 0.47, NIR std 12-28; the Reservoir
# N 66.
#
#   python tools/cp/flora_canopy.py <scratchDir>       (writes grid_canopy.npy and previews)
import sys, os, json
import numpy as np
from scipy import ndimage
from PIL import Image

D = sys.argv[1]
G = json.load(open(os.path.join(D, 'grid.json'))); RES = G['RES']
B = np.load(os.path.join(D, 'grid_rgbn.npy'))
O = np.load(os.path.join(D, 'grid_osm.npz'))
have = np.load(os.path.join(D, 'grid_have.npy'))
R, Gc, Bl, N = [B[..., i].astype(np.float32) for i in range(4)]
ndvi = (N - R) / (N + R + 1)
vis = (R + Gc + Bl) / 3
def lstd(a, k):
    m = ndimage.uniform_filter(a, k); m2 = ndimage.uniform_filter(a * a, k)
    return np.sqrt(np.maximum(m2 - m * m, 0))
sN = lstd(N, 5)                                # 2.5 m window
Nm = ndimage.uniform_filter(N, 5)
Gs = ndimage.uniform_filter(Gc, 5)
ndviS = ndimage.uniform_filter(ndvi, 3)
park = O['park'] & have
water = ndimage.binary_dilation(O['water'], iterations=2)
veg = (ndviS > 0.30) & (Nm > 95) & park & ~water & ~O['bldg']
# ratios, not levels: a building's shadow across a lawn darkens every band together, so a level test ("darker than a
# lawn") calls it canopy; NDVI, G/N and the NIR texture relative to its mean hold in the shade.
gn = Gs / np.maximum(Nm, 1)
rt = sN / np.maximum(Nm, 1)
# (sunlit light-green crowns, a honeylocust or an elm in full sun, are smooth at 2.5 m and bright; over 5.5 m the shade
# between crowns shows, where a mown lawn stays smooth)
Nm11 = ndimage.uniform_filter(N, 11)
rt11 = lstd(N, 11) / np.maximum(Nm11, 1)
tree = veg & ((ndviS > 0.43) | (gn < 0.53) | (rt > 0.055) | (rt11 > 0.085))
# shaded vegetation (NIR and the visible both low): canopy only where textured
shade = (Nm < 125) & (vis < 50)
tree = np.where(shade, (ndviS > 0.28) & park & ~water & ~O['bldg'] & (rt > 0.09), tree)
lawn = veg & ~tree
# clean-up: speckle out, gaps in a crown closed, blobs under 12 m2 dropped
tree = ndimage.binary_opening(tree, iterations=1)
tree = ndimage.binary_closing(tree, iterations=2)
lab, n = ndimage.label(tree)
sz = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
keep = np.zeros(n + 1, bool); keep[1:] = sz * RES * RES >= 12
tree = keep[lab] & park & ~water
# holes under 150 m2 inside the canopy are crowns the tests missed (a sunlit light-green crown among dark ones), not
# clearings: filled (a path or a lawn is one large connected piece, so it stays open)
hol = ~tree & park & ~water & ~O['bldg'] & ~O['drives']
hl, hn = ndimage.label(hol)
hs = ndimage.sum(np.ones_like(hl), hl, index=np.arange(1, hn + 1))
fill = np.zeros(hn + 1, bool); fill[1:] = hs * RES * RES < 150
tree |= fill[hl]
np.save(os.path.join(D, 'grid_canopy.npy'), tree)
pa = park.sum()
print('canopy %.1f %% of the park (%.0f m2), vegetation %.1f %%, water %.1f %%' % (100 * tree.sum() / pa, tree.sum() * RES * RES, 100 * (veg | tree).sum() / pa, 100 * (O['water'] & park).sum() / pa))
# previews at 1 m (a third of the park each) and 2 m (all of it)
g = (vis / max(1, vis.max()) * 255).astype(np.uint8)
ov = np.stack([g, g, g], -1)
ov[tree] = (ov[tree] * 0.35 + np.array([230, 40, 40]) * 0.65).astype(np.uint8)
ov[O['water'] & park] = (60, 90, 200)
Image.fromarray(ov[::4, ::4]).save(os.path.join(D, 'prev_canopy.png'))
for i in range(3):
    a = ov[::2, i * 2800 // 2 * 2 // 2 * 1: (i + 1) * 2800][:, ::1]
Image.fromarray(ov[::2, 0:2900:2]).save(os.path.join(D, 'prev_canopy_s.png'))
Image.fromarray(ov[::2, 2800:5700:2]).save(os.path.join(D, 'prev_canopy_m.png'))
Image.fromarray(ov[::2, 5600:8420:2]).save(os.path.join(D, 'prev_canopy_n.png'))
