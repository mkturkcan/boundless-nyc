# BX-LEAF (AR34 BX, 2026-10-04): the foliage-and-light flicker test of a Cycles take.
#
#   python bx_leafcheck.py <take dir> [--src <frames dir>] [--frames a-b] [--box x0,y0,x1,y1] [--json f] [--map f.jpg]
#                          [--jobs 24]
#
# The owner's verdict on teaser 8's night takes ("flickering with lights and trees", lamp-lit crowns changing from frame to
# frame) was missed by temporal_scan.py: its block vectors at 320 x 180 and 40 / 80 px cells average a crown's blotches away,
# and its slow-surface rule leaves out crowns near a moving lens. This test looks at the crowns only, at half resolution,
# with exact motion: every pixel of frame k goes to world space through the take's own depth (blender_take.py writes it with
# the cameras into <take>/_depth/), into frames k - 1 and k + 1, where it is accepted when the depth there (the min / max
# over 3 x 3 px) brackets the expected one (a crown is full of depth edges: a single depth sample would reject most of it).
# Flicker is the temporal extremum of the low-passed luma (Gaussian sigma --lp 4 px at half resolution: the denoiser's
# blotches stay, fine shimmer and the reprojection's sub-pixel errors go), z = sqrt(max(0, (L_k - L_a)(L_k - L_b))) in sRGB
# levels (a smooth change, the lens moving or a leaf turning, has both differences of one sign and gives 0; a blotch that
# comes and goes gives |change|); pixels moving more than --vmax 8 px a frame at half resolution are left out (a crown
# passing the lens is a motion-blur streak that one depth sample does not register). Foliage is found in the depth itself: a pixel whose 3 x 3 log depth spans more than 5 % (a leaf edge),
# where such pixels fill over 35 % of a 15 x 15 window, nearer than 400 m, and whose 5 x 5 mean colour is yellow to green
# (hue 50-170 deg, saturation over 0.1: not a truss or a fire escape). Per frame, a cell (32 x 32 px at 2560) counts when
# half of it is foliage, a third of it was matched in both neighbours and its mean z over those pixels exceeds LEAF_T levels;
# a take FAILS when LEAF_N (8) or more cells count in LEAF_F (6) or more frames, LEAF_T 3 levels (calibration: the night and
# dusk takes the owner rejected 35-98 frames, the golden takes 0-3, the fixed takes 0; docs/notes/ar34-bx-leaf.md).
# Exit 3 when the take fails, 2 when it cannot be tested (no depth), else 0.
import os, sys, json, argparse
import numpy as np
from PIL import Image
from scipy import ndimage

LEAF_T, LEAF_N, LEAF_F = 3.0, 8, 6
ap = argparse.ArgumentParser()
ap.add_argument('take')
ap.add_argument('--src', default=None, help='frames to test (default: the take; a folder of frame_%%05d.jpg / .png)')
ap.add_argument('--frames', default=None)
ap.add_argument('--box', default=None, help='x0,y0,x1,y1 at full resolution: test only this region (a border render)')
ap.add_argument('--json', default=None)
ap.add_argument('--map', default=None, help='a heat map of the counted cells over the take (jpg)')
ap.add_argument('--jobs', type=int, default=24)
ap.add_argument('--t', type=float, default=LEAF_T)
ap.add_argument('--n', type=int, default=LEAF_N)
ap.add_argument('--f', type=int, default=LEAF_F)
ap.add_argument('--vmax', type=float, default=8.0, help='largest motion (half-res px a frame) of a tested pixel')
ap.add_argument('--lp', type=float, default=4.0, help='low-pass (Gaussian sigma, half-res px) of the luma before the test: blotches stay, fine shimmer goes')
ap.add_argument('--dump', default=None, help='a,b:dir  write the z map and the masks of frames a, b ... (debug)')
A = ap.parse_args()

TAKE = os.path.abspath(A.take)
SRC = os.path.abspath(A.src) if A.src else TAKE
DEP = os.path.join(TAKE, '_depth')
CELL = 16          # half-res px (32 at 2560)


def fpath(k):
    for ext in ('jpg', 'png'):
        p = os.path.join(SRC, 'frame_%05d.%s' % (k, ext))
        if os.path.exists(p): return p
    return None


def frames_list():
    ks = sorted(int(f[6:11]) for f in os.listdir(SRC) if f.startswith('frame_') and f[-4:] in ('.jpg', '.png'))
    if A.frames:
        a, b = map(int, A.frames.split('-')); ks = [k for k in ks if a <= k <= b]
    return ks


CAMS = json.load(open(os.path.join(DEP, 'cams.json'))) if os.path.exists(os.path.join(DEP, 'cams.json')) else None


def cam(k):
    c = CAMS['frames'][str(k)]
    M = np.array(c['m'], dtype=np.float64)
    return M, np.linalg.inv(M), np.array(c['vf'], dtype=np.float64)


def depth_full(k):
    a = np.asarray(Image.open(os.path.join(DEP, 'depth_%04d.png' % k)), dtype=np.float64)
    mx = 65535.0 if a.max() > 255 else 255.0
    return np.power(2.0, a / mx * 18.0 - 2.0)


def pool2(a, fn):
    h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    return fn(a[:h, :w].reshape(h // 2, 2, w // 2, 2), axis=(1, 3))


def luma_half(k):
    im = np.asarray(Image.open(fpath(k)).convert('RGB'), np.float32)
    L = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    return ndimage.gaussian_filter(pool2(L, np.mean), A.lp)


def foliage_half(z, k):
    lz = np.log2(np.maximum(z, 1e-3))
    r = (ndimage.maximum_filter(lz, 3) - ndimage.minimum_filter(lz, 3)) > np.log2(1.05)
    d = ndimage.uniform_filter(r.astype(np.float32), 15)
    m = pool2(((d > 0.35) & (z < 400.0)).astype(np.float32), np.mean) >= 0.5
    # leaves, not lattices: the viaducts' trusses, fire escapes and sign frames are depth edges everywhere too; a crown's
    # 5 x 5 mean colour is yellow to green (hue 50-170 deg, saturation over 0.1), lamp-lit or in the sun
    im = np.asarray(Image.open(fpath(k)).convert('RGB'), np.float32) / 255.0
    c = np.stack([ndimage.uniform_filter(pool2(im[..., i], np.mean), 5) for i in range(3)], -1)
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    r_, g_, b_ = c[..., 0], c[..., 1], c[..., 2]
    hue = np.degrees(np.arctan2(np.sqrt(3.0) * (g_ - b_), 2 * r_ - g_ - b_)) % 360.0
    return m & (sat > 0.1) & (hue >= 50.0) & (hue <= 170.0)


def test(k):
    W, H = CAMS['res']; w, h = W // 2, H // 2
    zf = depth_full(k)
    zk = pool2(zf, np.min)
    fol = foliage_half(zf, k)
    M, Mi, vf = cam(k)
    u = (np.arange(w) + 0.5) / w; v = (np.arange(h) + 0.5) / h
    uu, vv = np.meshgrid(u, v)
    tr, br, bl, tl = vf
    P = tl[None, None, :] + uu[..., None] * (tr - tl)[None, None, :] + vv[..., None] * (bl - tl)[None, None, :]
    Pw = (P * (zk / -vf[0][2])[..., None]) @ M[:3, :3].T + M[:3, 3]
    Lk = luma_half(k)
    samp, okall = [], np.ones((h, w), bool)
    for j in (k - 1, k + 1):
        Mj, Mij, vfj = cam(j)
        Q = Pw @ Mij[:3, :3].T + Mij[:3, 3]
        zj = -Q[..., 2]; d0 = -vfj[0][2]
        ok = zj > 0.05
        xf = np.where(ok, Q[..., 0] * d0 / np.maximum(zj, 1e-6), 0); yf = np.where(ok, Q[..., 1] * d0 / np.maximum(zj, 1e-6), 0)
        trj, brj, blj, tlj = vfj
        px = (xf - tlj[0]) / (trj[0] - tlj[0]) * w - 0.5
        py = (tlj[1] - yf) / (tlj[1] - blj[1]) * h - 0.5
        ok &= (px >= 1) & (px <= w - 2) & (py >= 1) & (py <= h - 2)
        zjf = depth_full(j)
        zmin = ndimage.minimum_filter(pool2(zjf, np.min), 3); zmax = ndimage.maximum_filter(pool2(zjf, np.max), 3)
        ix = np.clip(np.round(px).astype(int), 0, w - 1); iy = np.clip(np.round(py).astype(int), 0, h - 1)
        ok &= (zj >= 0.97 * zmin[iy, ix]) & (zj <= 1.03 * zmax[iy, ix])
        # surfaces moving more than --vmax px a frame (half res) are left out: a crown passing the lens is a motion-blur
        # streak whose one depth sample does not register it (the golden t8ApolloGlide's near crown, frames 14-21)
        ok &= np.hypot(px - (uu * w - 0.5), py - (vv * h - 0.5)) <= A.vmax
        Lj = luma_half(j)
        samp.append(ndimage.map_coordinates(Lj, [py, px], order=1, mode='nearest'))
        okall &= ok
    z = np.sqrt(np.maximum(0.0, (Lk - samp[0]) * (Lk - samp[1])))
    m = okall & fol & (zk < 400.0)
    if A.box:
        x0, y0, x1, y1 = [int(t) // 2 for t in A.box.split(',')]
        bm = np.zeros_like(m); bm[y0 + 4:y1 - 4, x0 + 4:x1 - 4] = True   # (4 px in: the denoiser's and the bloom's border)
        m &= bm; fol = fol & bm
    gh, gw = h // CELL, w // CELL
    cut = lambda a: a[:gh * CELL, :gw * CELL].reshape(gh, CELL, gw, CELL).astype(np.float64)
    nf = cut(fol).mean(axis=(1, 3)); nm = cut(m).mean(axis=(1, 3))
    zs = cut(np.where(m, z, 0)).sum(axis=(1, 3)) / np.maximum(cut(m).sum(axis=(1, 3)), 1)
    cnt = (nf >= 0.5) & (nm >= 0.33) & (zs > A.t)
    if A.dump and k in [int(t) for t in A.dump.split(':')[0].split(',')]:
        dd = A.dump.split(':', 1)[1]; os.makedirs(dd, exist_ok=True)
        vis = np.stack([np.clip(z * 8, 0, 255), np.clip(Lk, 0, 255) * 0.5 + 60 * fol, 120.0 * okall], -1)
        Image.fromarray(vis.astype(np.uint8)).save(os.path.join(dd, 'dump_%05d.png' % k))
    zfol = float(z[m].mean()) if m.any() else 0.0
    p95 = float(np.percentile(z[m], 95)) if m.any() else 0.0
    return k, int(cnt.sum()), zs * ((nf >= 0.5) & (nm >= 0.33)), zfol, p95, float(m.mean())


def main():
    if CAMS is None: print('BX_LEAFCHECK no depth (_depth/cams.json): not tested'); return 2
    ks = [k for k in frames_list() if str(k) in CAMS['frames'] and os.path.exists(os.path.join(DEP, 'depth_%04d.png' % k))]
    ks = [k for k in ks if k - 1 in ks and k + 1 in ks]
    if not ks: print('BX_LEAFCHECK no testable frames'); return 2
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=A.jobs) as ex:
        res = list(ex.map(test, ks))
    per = {k: n for k, n, _, _, _, _ in res}
    bad = [k for k, n in per.items() if n >= A.n]
    hm = np.max([r[2] for r in res], axis=0)
    worst = sorted(res, key=lambda r: -r[1])[:5]
    rep = {'take': TAKE, 'src': SRC, 'frames': len(ks), 'T': A.t, 'N': A.n, 'F': A.f, 'fail': len(bad) >= A.f,
           'frames_over': len(bad), 'max_cells': max(per.values()), 'mean_cells': round(float(np.mean(list(per.values()))), 2),
           'z_foliage_mean': round(float(np.mean([r[3] for r in res])), 3), 'z_foliage_p95': round(float(np.mean([r[4] for r in res])), 3),
           'foliage_share': round(float(np.mean([r[5] for r in res])), 4),
           'worst': [{'frame': r[0], 'cells': r[1], 'cell': [int(i) for i in np.unravel_index(np.argmax(r[2]), r[2].shape)][::-1], 'cell_z': round(float(r[2].max()), 2)} for r in worst],
           'per_frame': per, 'box': A.box}
    rep['why'] = [f'LEAF FLICKER: {len(bad)} frames with >= {A.n} foliage cells over {A.t} levels (limit {A.f} frames)'] if rep['fail'] else []
    if A.json: json.dump(rep, open(A.json, 'w'), indent=1)
    if A.map:
        im = np.asarray(Image.open(fpath(ks[len(ks) // 2])).convert('RGB'), np.float32)
        H, W = im.shape[:2]
        heat = np.kron(np.clip(hm / (2 * A.t), 0, 1), np.ones((CELL * 2, CELL * 2)))
        heat = np.pad(heat, ((0, max(0, H - heat.shape[0])), (0, max(0, W - heat.shape[1]))))[:H, :W]
        out = im * (1 - 0.6 * heat[..., None]) + np.array([255, 0, 64], np.float32) * 0.6 * heat[..., None]
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BOX).save(A.map, quality=88)
    print('BX_LEAFCHECK ' + json.dumps({k: v for k, v in rep.items() if k not in ('per_frame',)}))
    return 3 if rep['fail'] else 0


if __name__ == '__main__':
    sys.exit(main())
