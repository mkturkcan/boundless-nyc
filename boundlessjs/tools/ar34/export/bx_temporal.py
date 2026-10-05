# BX-FIX (AR34 BX, 2026-10-04): a temporal filter for Cycles takes, by exact reprojection.
#
#   python bx_temporal.py <take dir> [--radius 3] [--ztol 0.012] [--ltol 0.6] [--jobs 24] [--frames a-b]
#
# A night take's street lamps leave the per-frame denoiser blotches that differ from frame to frame (the lamps' light
# reaches a point through few samples; the denoiser makes low-frequency patches of them), so lamp-lit roads, walls and
# crowns crawl. The web's take has no such noise. This filter averages each frame with its neighbours (k - R .. k + R)
# where they show the same surface: every pixel of frame k goes to world space through its depth (blender_take.py writes
# Cycles' Depth pass and the camera at the shutter's middle per frame into <take>/_depth/: depth_<ffff>.png, 16-bit
# (log2(z) + 2) / 18, and cams.json), into frame j's camera, and frame j's depth there is compared with the expected one
# (within --ztol relative): a surface that moved (cars, walkers, trains, leaves in the wind), a disocclusion or the sky
# fails it and keeps frame k's own colour. Frame j's colour is read there with a cubic spline (no softening of fine
# texture), the colours averaged in linear light with weights 1 at k and exp(-(d / R)^2) at distance d; a neighbour whose
# 5 x 5 mean luminance differs from frame k's by more than --ltol of the brighter of the two is left out (a moving shadow,
# a beam's pool, a blinker, a changing signal: they change far more than the denoiser's blotches). The raw frames move to <take>/_raw/ once and the filtered ones replace them; a second run reads
# _raw again (idempotent). docs/notes/ar34-bx-fix.md has the calibration.
import os, sys, json, time, argparse
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('take')
ap.add_argument('--radius', type=int, default=3)
ap.add_argument('--ztol', type=float, default=0.012)
ap.add_argument('--ltol', type=float, default=0.6)
ap.add_argument('--jobs', type=int, default=24)
ap.add_argument('--edge', type=float, default=1.3, help='a depth edge: the depth ratio over 5 px past this keeps the pixel\'s own colour')
ap.add_argument('--frames', default=None)
# BX-LEAF (2026-10-04): crowns. A crown is depth edges everywhere, so the edge rule left every crown unfiltered and the depth
# test (one depth sample, 1.2 %) rejected most of what was left: the lamp-lit crowns kept the per-frame denoiser's blotches
# (the owner's "flickering with lights and trees"). In foliage (found in the depth: a pixel whose 3 x 3 log depth spans
# more than 5 %, where such pixels fill over 35 % of a 15 x 15 window, nearer than 400 m) a neighbour is accepted where the
# expected depth lies within frame j's 3 x 3 min / max there (+-3 %), and the edge rule does not apply; elsewhere as before.
ap.add_argument('--nofoliage', action='store_true', help='crowns as everything else (the BX-FIX filter)')
ap.add_argument('--src', default=None, help='read the frames from this folder (frame_%%05d.jpg or .png) instead of <take>/_raw (a test)')
ap.add_argument('--out', default=None, help='write the filtered frames here instead of the take (a test)')
ap.add_argument('--quality', type=int, default=95)
A = ap.parse_args()

TAKE = os.path.abspath(A.take)
RAW = os.path.join(TAKE, '_raw')
DEP = os.path.join(TAKE, '_depth')


def srgb2lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).astype(np.float32)


def lin2srgb(a):
    a = np.clip(a, 0, 1)
    return np.round(255.0 * np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)).astype(np.uint8)


def frames_list():
    src = A.src if A.src else (RAW if os.path.isdir(RAW) else TAKE)
    ks = sorted(int(f[6:11]) for f in os.listdir(src) if f.startswith('frame_') and f[-4:] in ('.jpg', '.png'))
    if A.frames:
        a, b = map(int, A.frames.split('-')); ks = [k for k in ks if a <= k <= b]
    return ks


CAMS = json.load(open(os.path.join(DEP, 'cams.json')))
W, H = CAMS['res']


def cam(k):
    c = CAMS['frames'][str(k)]
    M = np.array(c['m'], dtype=np.float64)
    vf = np.array(c['vf'], dtype=np.float64)   # camera-space frame corners: top right, bottom right, bottom left, top left
    return M, np.linalg.inv(M), vf


def depth(k):
    a = np.asarray(Image.open(os.path.join(DEP, 'depth_%04d.png' % k)), dtype=np.float64)
    mx = 65535.0 if a.max() > 255 else 255.0
    return np.power(2.0, a / mx * 18.0 - 2.0)


def raw(k):
    if A.src:
        for ext in ('jpg', 'png'):
            p_ = os.path.join(A.src, 'frame_%05d.%s' % (k, ext))
            if os.path.exists(p_): return np.asarray(Image.open(p_).convert('RGB'), dtype=np.float32)
    return np.asarray(Image.open(os.path.join(RAW, 'frame_%05d.jpg' % k)).convert('RGB'), dtype=np.float32)


def foliage(z):
    lz = np.log2(np.maximum(z, 1e-3))
    r = (ndimage.maximum_filter(lz, 3) - ndimage.minimum_filter(lz, 3)) > np.log2(1.05)
    return (ndimage.uniform_filter(r.astype(np.float32), 15) > 0.35) & (z < 400.0)


_grid = None
def pix_dirs(vf):
    """camera-space points on the frame plane per pixel centre (x, y, z = -d0)."""
    global _grid
    if _grid is None:
        u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
        _grid = np.meshgrid(u, v)
    u, v = _grid
    tr, br, bl, tl = vf
    P = tl[None, None, :] + u[..., None] * (tr - tl)[None, None, :] + v[..., None] * (bl - tl)[None, None, :]
    return P


def filt(k, ks):
    t0 = time.time()
    M, Mi, vf = cam(k)
    z = depth(k)
    C = srgb2lin(raw(k))
    Pf = pix_dirs(vf)
    d0 = -vf[0][2]
    lz_k = np.log2(z)
    # (a crown's leaves lie within a few tens of percent of each other: that is not an edge, or the trees stay unfiltered)
    flat = (ndimage.maximum_filter(lz_k, 5) - ndimage.minimum_filter(lz_k, 5)) < np.log2(A.edge)
    fol = foliage(z) if not A.nofoliage else np.zeros_like(flat)
    flat |= fol
    # BX-LEAF: in a crown the depth pass (one sample a pixel) jumps between a leaf and what is behind it from pixel to pixel,
    # and reprojecting through it pulled each pixel from a slightly different place (speckle along every branch): a crown is
    # reprojected through its smoothed log depth (sigma 1.5 px), one coherent motion per patch
    zr = np.where(fol, np.power(2.0, ndimage.gaussian_filter(lz_k, 1.5)), z) if fol.any() else z
    Pc = Pf * (zr / d0)[..., None]                             # camera space at planar depth z
    Pw = Pc @ M[:3, :3].T + M[:3, 3]
    Lk = C @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    Lm = ndimage.uniform_filter(Lk, 5)
    # a depth edge (a near object's outline, smeared by the motion blur, its pixels' depth jumping between the object
    # and what is behind it from sample to sample) keeps its own colour: averaging there left salt-and-pepper speckle
    acc = C.copy(); wsum = np.ones((H, W), np.float32)
    used = 0
    for j in range(k - A.radius, k + A.radius + 1):
        if j == k or j not in ks or str(j) not in CAMS['frames']: continue
        Mj, Mij, vfj = cam(j)
        Q = Pw @ Mij[:3, :3].T + Mij[:3, 3]
        zj = -Q[..., 2]
        d0j = -vfj[0][2]
        ok = zj > 0.05
        xf = np.where(ok, Q[..., 0] * d0j / np.maximum(zj, 1e-6), 0); yf = np.where(ok, Q[..., 1] * d0j / np.maximum(zj, 1e-6), 0)
        tr, br, bl, tl = vfj
        px = (xf - tl[0]) / (tr[0] - tl[0]) * W - 0.5
        py = (tl[1] - yf) / (tl[1] - bl[1]) * H - 0.5
        ok &= (px >= 1) & (px <= W - 2) & (py >= 1) & (py <= H - 2)
        zjo = depth(j)
        lz = ndimage.map_coordinates(np.log2(zjo), [py, px], order=1, mode='nearest')
        okz = np.abs(np.power(2.0, lz) - zj) < A.ztol * zj
        if fol.any():   # BX-LEAF: in foliage, the expected depth within frame j's 3 x 3 min / max (+-3 %)
            ix = np.clip(np.round(px).astype(int), 0, W - 1); iy = np.clip(np.round(py).astype(int), 0, H - 1)
            okb = (zj >= 0.97 * ndimage.minimum_filter(zjo, 3)[iy, ix]) & (zj <= 1.03 * ndimage.maximum_filter(zjo, 3)[iy, ix])
            okz = np.where(fol, okb, okz)
        inview = ok.copy()
        ok &= okz
        if not ok.any(): continue
        Cj = srgb2lin(raw(j))
        S = np.stack([ndimage.map_coordinates(Cj[..., c], [py, px], order=3, mode='nearest') for c in range(3)], -1)
        Ls = ndimage.uniform_filter(S @ np.array([0.2126, 0.7152, 0.0722], np.float32), 5)
        # the two 5 x 5 means within --ltol of the brighter one: a moving shadow, a beam's pool, a blinker or a signal
        # changes far more than the denoiser's blotches do (both ways: a lit pixel takes no shadowed neighbour either)
        okl = np.abs(Ls - Lm) < A.ltol * np.maximum(np.maximum(Lm, Ls), 0.02)
        ok &= okl
        okf = (ok & flat).astype(np.float32)
        okf *= ndimage.uniform_filter(okf, 5)   # soft: an accepted pixel among rejected ones counts for little (no speckle)
        if fol.any():
            # BX-LEAF: in a crown the depth test passes at most pixels but in a fine pattern, and per-pixel weights left
            # salt-and-pepper along the branches; the weight is the 9 x 9 share of accepted pixels instead, and a pixel that
            # failed takes the neighbour's colour clamped to its own 3 x 3 range (no leaf smudged over the sky beside it)
            share = ndimage.uniform_filter(ok.astype(np.float32), 9)
            lo = np.stack([ndimage.minimum_filter(C[..., c], 3) for c in range(3)], -1)
            hi = np.stack([ndimage.maximum_filter(C[..., c], 3) for c in range(3)], -1)
            S = np.where((fol & ~ok)[..., None], np.clip(S, lo, hi), S)
            okf = np.where(fol, share * (inview & okl), okf)
        w = np.float32(np.exp(-((j - k) / max(1, A.radius)) ** 2)) * okf
        acc += S * w[..., None]; wsum += w
        used += 1
    out = acc / wsum[..., None]
    Image.fromarray(lin2srgb(out)).save(os.path.join(A.out or TAKE, 'frame_%05d.jpg' % k), quality=A.quality)
    return k, round(time.time() - t0, 1), float(wsum.mean()), used


def main():
    ks = frames_list()
    if not ks: print('BX_TEMPORAL no frames'); return 2
    missing = [k for k in ks if not os.path.exists(os.path.join(DEP, 'depth_%04d.png' % k)) or str(k) not in CAMS['frames']]
    if missing: print('BX_TEMPORAL no depth / camera for %d frames (first %d): not filtered' % (len(missing), missing[0])); return 2
    if A.out: os.makedirs(A.out, exist_ok=True)
    elif not os.path.isdir(RAW):
        os.makedirs(RAW)
        for k in ks: os.replace(os.path.join(TAKE, 'frame_%05d.jpg' % k), os.path.join(RAW, 'frame_%05d.jpg' % k))
    t0 = time.time()
    kset = set(ks)
    from concurrent.futures import ProcessPoolExecutor
    res = []
    with ProcessPoolExecutor(max_workers=A.jobs) as ex:
        for r in ex.map(filt, ks, [kset] * len(ks)): res.append(r)
    st = {'frames': len(res), 'secs': round(time.time() - t0, 1), 'mean_weight': round(float(np.mean([r[2] for r in res])), 2),
          'radius': A.radius, 'ztol': A.ztol, 'ltol': A.ltol, 'foliage': not A.nofoliage}
    json.dump(st, open(os.path.join(A.out or TAKE, '_temporal.json'), 'w'), indent=1)
    print('BX_TEMPORAL ' + json.dumps(st))
    return 0


if __name__ == '__main__':
    sys.exit(main())
