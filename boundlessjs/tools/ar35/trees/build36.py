#!/usr/bin/env python3
# TR36 street trees: the leaf atlas and the bark maps, composed from CC0 scans (tools/ar35/trees/fetch36.sh fetches them).
#
#   python3 tools/ar35/trees/build36.py [srcDir] [outDir]
#     srcDir  the scan cache (default /data0/projectnyc_aux/tmp/trees/src)
#     outDir  the bake's input folder (default /data0/projectnyc_aux/tmp/trees/tex36); tools/ar35/trees/bake36.mjs packs it
#
# Leaf atlas (2048 x 2048, four 1024 px cells; cell index = cx + 2 cy, v up as in treeAtlas.js):
#   0  honeylocust spur cluster A: five to seven once-pinnate leaves fanned from a spur, 9-13 leaflet pairs each
#   1  honeylocust spur cluster B (another draw), with the trunk-proxy bark swatch in its lower left corner
#   2  sophora shoot: a twig tip with four alternate pinnate leaves, 9-15 ovate leaflets each
#   3  sophora leaves: three pinnate leaves fanned from a node
# Every leaflet is a scanned leaf (ambientCG LeafSet022, CC0) cut out, scaled, turned and recoloured: colour from the
# scan's Color map, the cut from its Opacity map, the relief from its NormalGL map (its x/y turned with the leaflet).
# The rachis, petiole and twig strokes are drawn. Composed at 2x and reduced (premultiplied) to 1x.
# Outputs: leaf36_col.png (sRGB RGBA: albedo + coverage), leaf36_nrm.png (RGB tangent-space normal, OpenGL; A translucency),
# bark_<f>_col.jpg / bark_<f>_nrm.jpg per species f (H, S, P, Z, Y, Q, M: CC0 scans, see barkMeans below; nrm.b = height),
# meta36.json (cells, swatch, card sizes, colour calibration).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/data0/projectnyc_aux/tmp/trees/src'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/data0/projectnyc_aux/tmp/trees/tex36'
os.makedirs(OUT, exist_ok=True)
SS = 2                      # supersampling
# TR37: 4 x 4 cells of 512 px (was 2 x 2 of 1024): room for more species in the same 2048 px atlas; a 0.36 m honeylocust cell
# at 512 px is 0.7 mm a texel, finer than a 1600 px frame resolves at 5 m (2.4 mm a pixel)
CELL = 512                  # px per cell at 1x
N = 4                       # cells per side
W = CELL * N * SS
PXK = CELL / 1024           # stroke widths and offsets were set for 1024 px cells

def s2l(c): c = np.asarray(c, np.float32) / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055) * 255.0

# ---------------------------------------------------------------- leaflet stamps from the scan
def load_leaves(set_id, min_area=2000):
    d = f'{SRC}/LeafSet{set_id}/LeafSet{set_id}_2K-PNG_'
    col = np.array(Image.open(d + 'Color.png').convert('RGB'), np.float32)
    op = np.array(Image.open(d + 'Opacity.png').convert('L'), np.float32) / 255.0
    nrm = np.array(Image.open(d + 'NormalGL.png').convert('RGB'), np.float32) / 127.5 - 1.0
    lab, n = ndimage.label(op > 0.5)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None: continue
        ys, xs = sl
        if (ys.stop - ys.start) * (xs.stop - xs.start) < min_area * 4: continue
        y0, y1, x0, x1 = max(0, ys.start - 6), min(op.shape[0], ys.stop + 6), max(0, xs.start - 6), min(op.shape[1], xs.stop + 6)
        m = (lab[y0:y1, x0:x1] == i + 1).astype(np.float32)
        m = ndimage.binary_dilation(m > 0, iterations=3).astype(np.float32)
        a = op[y0:y1, x0:x1] * m
        out.append({'col': s2l(col[y0:y1, x0:x1]), 'a': a, 'n': nrm[y0:y1, x0:x1], 'h': y1 - y0, 'w': x1 - x0})
    return out

LEAVES = load_leaves('022')
# the two scan leaves with brown spots / yellowing (labels in raster order: top left 0, bottom left 4) only now and then
SPOTTY = {0, 4}
print('leaflets from LeafSet022:', len(LEAVES), [(L['h'], L['w']) for L in LEAVES])

C = np.zeros((W, W, 3), np.float32)      # premultiplied linear colour
A = np.zeros((W, W), np.float32)
NV = np.zeros((W, W, 3), np.float32)     # premultiplied normal
TR = np.zeros((W, W), np.float32)        # premultiplied translucency

CLIP = [0, 0, W, W]          # the cell being drawn (canvas px): nothing spills into a neighbour
def over(y0, x0, col, a, nv, tr):
    h, w = a.shape
    cx0, cy0, cx1, cy1 = CLIP
    if x0 < cx0: col, a, nv, tr = (v[:, cx0 - x0:] if np.ndim(v) else v for v in (col, a, nv, tr)); x0 = cx0
    if y0 < cy0: col, a, nv, tr = (v[cy0 - y0:] if np.ndim(v) else v for v in (col, a, nv, tr)); y0 = cy0
    h, w = a.shape
    if x0 + w > cx1: col, a, nv, tr = (v[:, :max(0, cx1 - x0)] if np.ndim(v) else v for v in (col, a, nv, tr))
    if y0 + h > cy1: col, a, nv, tr = (v[:max(0, cy1 - y0)] if np.ndim(v) else v for v in (col, a, nv, tr))
    h, w = a.shape
    if h <= 0 or w <= 0: return
    ys, xs = slice(y0, y0 + h), slice(x0, x0 + w)
    k = 1.0 - a
    C[ys, xs] = col * a[..., None] + C[ys, xs] * k[..., None]
    NV[ys, xs] = nv * a[..., None] + NV[ys, xs] * k[..., None]
    TR[ys, xs] = tr * a + TR[ys, xs] * k
    A[ys, xs] = a + A[ys, xs] * k

def stamp(L, bx, by, length, ang, mirror, tint, val, tr=0.9):
    """a leaflet with its base (petiole end) at (bx, by) in canvas px, pointing at `ang` (rad, 0 = up the image, + = clockwise)."""
    h, w = L['h'], L['w']
    s = length / h
    hw = w * s * 0.5 + 2
    ca, sa = math.cos(ang), math.sin(ang)
    # target bbox: the rotated leaflet rectangle
    corners = []
    for (u, v) in [(-hw, 0), (hw, 0), (-hw, length), (hw, length)]:
        corners.append((bx + u * ca + v * sa, by + u * sa - v * ca))
    xs = [c[0] for c in corners]; ys = [c[1] for c in corners]
    x0, x1 = int(math.floor(min(xs))) - 1, int(math.ceil(max(xs))) + 1
    y0, y1 = int(math.floor(min(ys))) - 1, int(math.ceil(max(ys))) + 1
    x0c, y0c, x1c, y1c = max(0, x0), max(0, y0), min(W, x1), min(W, y1)
    if x1c <= x0c or y1c <= y0c: return
    gy, gx = np.mgrid[y0c:y1c, x0c:x1c].astype(np.float32)
    dx, dy = gx - bx, gy - by
    # canvas -> leaflet frame (u across, v from the base toward the tip)
    u = dx * ca + dy * sa
    v = dx * sa - dy * ca
    if mirror: u = -u
    sx = u / s + w * 0.5
    sy = (h - 1) - v / s           # the scan's petiole is at its bottom row
    ok = (sx >= 0) & (sx <= w - 1) & (sy >= 0) & (sy <= h - 1)
    if not ok.any(): return
    coords = [sy, sx]
    a = ndimage.map_coordinates(L['a'], coords, order=1, mode='constant') * ok
    col = np.stack([ndimage.map_coordinates(L['col'][..., c], coords, order=1, mode='nearest') for c in range(3)], -1)
    nx = ndimage.map_coordinates(L['n'][..., 0], coords, order=1, mode='nearest')
    ny = ndimage.map_coordinates(L['n'][..., 1], coords, order=1, mode='nearest')
    nz = ndimage.map_coordinates(L['n'][..., 2], coords, order=1, mode='nearest')
    if mirror: nx = -nx
    # the leaflet frame turned by ang (clockwise on the image); GL normal maps are y-up, the canvas y-down
    rx = nx * ca - ny * sa
    ry = nx * sa + ny * ca
    # a gentle fold along the midrib (the halves tilt up and out) and a stronger relief than the flat-scanned leaf
    fold = np.clip(u / max(1.0, hw - 2), -1, 1) * 0.28
    rx += fold * ca; ry += fold * sa
    nv = np.stack([rx, ry, np.maximum(0.2, nz)], -1)
    nv /= np.linalg.norm(nv, axis=-1, keepdims=True)
    col = col * tint[None, None, :] * val
    over(y0c, x0c, col, a.astype(np.float32), nv, tr)

def stroke(pts, width, rgb, tr=0.12):
    """a petiole / rachis / twig: polyline (canvas px) with a width taper (w0 -> w1), drawn as a soft line with a round normal."""
    (w0, w1) = (width[0] * PXK, width[1] * PXK)
    layer = Image.new('L', (W, W), 0)
    nxL = Image.new('F', (W, W), 0.0)
    nyL = Image.new('F', (W, W), 0.0)
    d = ImageDraw.Draw(layer)
    bb = [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]
    n = len(pts)
    for i in range(n - 1):
        t = i / max(1, n - 2)
        wd = max(1, int(round(w0 + (w1 - w0) * t)))
        d.line([tuple(pts[i]), tuple(pts[i + 1])], fill=255, width=wd)
        r = wd / 2
        d.ellipse([pts[i + 1][0] - r, pts[i + 1][1] - r, pts[i + 1][0] + r, pts[i + 1][1] + r], fill=255)
    x0, y0 = max(0, int(bb[0] - w0 - 4)), max(0, int(bb[1] - w0 - 4))
    x1, y1 = min(W, int(bb[2] + w0 + 4)), min(W, int(bb[3] + w0 + 4))
    a = np.array(layer, np.float32)[y0:y1, x0:x1] / 255.0
    if a.size == 0: return
    a = ndimage.gaussian_filter(a, 0.6)
    # round cross-section: the normal follows the gradient of the stroke's distance field
    dist = ndimage.distance_transform_edt(a > 0.5)
    gy, gx = np.gradient(ndimage.gaussian_filter(dist, 1.0))
    g = np.sqrt(gx * gx + gy * gy) + 1e-6
    rad = max(1.0, dist.max())
    k = np.clip(1.0 - dist / rad, 0, 1) * 0.8
    nv = np.stack([-gx / g * k, gy / g * k, np.ones_like(k)], -1)
    nv /= np.linalg.norm(nv, axis=-1, keepdims=True)
    col = np.broadcast_to(s2l(np.array(rgb, np.float32)), a.shape + (3,)).copy()
    over(y0, x0, col, a, nv, tr)

def bez(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]

def along(pts, t):
    """point and direction (rad, 0 = up, clockwise +) at arc fraction t of a polyline"""
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    L = sum(seg); target = t * L; acc = 0
    for i, s in enumerate(seg):
        if acc + s >= target or i == len(seg) - 1:
            f = 0 if s < 1e-6 else (target - acc) / s
            x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f
            y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
            ang = math.atan2(pts[i + 1][0] - pts[i][0], -(pts[i + 1][1] - pts[i][1]))
            return x, y, ang
        acc += s
    return pts[-1][0], pts[-1][1], 0.0

def hsv_tint(rng, hue_j, sat_k, val_j):
    """a per-leaflet multiplier (linear): a small hue swing toward yellow or blue, a value jitter"""
    h = rng.uniform(-hue_j, hue_j)
    t = np.array([1.0 + h * 0.9, 1.0, 1.0 - h * 1.4], np.float32)
    return t, rng.uniform(1 - val_j, 1 + val_j)

def pinnate(rng, base, ang, length, curve, pairs, lf_len, lf_ang, opposite=True, terminal=True, leaf_tint=None, leaf_val=1.0,
            rach_w=(5, 2), rach_rgb=(96, 110, 58), spotty=0.06, leaflet_pool=None, droop=0.0):
    """one pinnate leaf: rachis from `base` at `ang`, `pairs` leaflet pairs from 12 % of its length to the tip"""
    bx, by = base
    tip = (bx + math.sin(ang) * length, by - math.cos(ang) * length)
    mid = (bx + math.sin(ang) * length * 0.5 + math.cos(ang) * curve * length, by - math.cos(ang) * length * 0.5 + math.sin(ang) * curve * length)
    pts = bez(base, mid, tip)
    stroke(pts, rach_w, rach_rgb)
    pool = leaflet_pool or [i for i in range(len(LEAVES)) if i not in SPOTTY]
    for k in range(pairs):
        t = 0.12 + 0.86 * (k + 0.5) / pairs
        for side in (-1, 1):
            tt = t if opposite else min(0.99, t + (0.5 / pairs) * (side > 0))
            x, y, a = along(pts, tt)
            size = lf_len * (0.82 + 0.18 * math.sin(math.pi * min(1, tt * 1.1))) * rng.uniform(0.9, 1.08)
            la = a + side * math.radians(lf_ang + rng.uniform(-8, 8)) + droop * side * 0.0
            li = rng.choice(list(SPOTTY)) if rng.random() < spotty else rng.choice(pool)
            tint, val = hsv_tint(rng, 0.05, 1.0, 0.1)
            if leaf_tint is not None: tint = tint * leaf_tint
            stamp(LEAVES[li], x, y, size, la, side < 0, tint, val * leaf_val)
    if terminal:
        x, y, a = along(pts, 1.0)
        li = rng.choice(pool)
        tint, val = hsv_tint(rng, 0.05, 1.0, 0.1)
        if leaf_tint is not None: tint = tint * leaf_tint
        stamp(LEAVES[li], x, y, lf_len * 0.9, a + rng.uniform(-0.15, 0.15), rng.random() < 0.5, tint, val * leaf_val)
    return pts

CELLRECT = {}
def cell_origin(c):
    cx, cy = c % N, c // N
    # cell index v-up (treeAtlas.js convention): cell row 0 is the BOTTOM of the image
    ox, oy = cx * CELL * SS, (N - 1 - cy) * CELL * SS
    CLIP[:] = [ox + 2 * SS, oy + 2 * SS, ox + CELL * SS - 2 * SS, oy + CELL * SS - 2 * SS]
    return ox, oy

# ---------------------------------------------------------------- honeylocust spur clusters (cells 0, 1)
def honeylocust(c, seed, nleaf):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    base = (ox + S * 0.5, oy + S * 0.965)
    spur_top = (base[0] + rng.uniform(-6, 6), base[1] - S * 0.05)
    stroke([base, spur_top], (16, 12), (58, 52, 44), tr=0.05)
    angs = np.linspace(-1, 1, nleaf)
    for i in range(nleaf):
        a = math.radians(angs[i] * rng.uniform(64, 72) + rng.uniform(-5, 5))
        # (the tip stays inside the cell: the half width over |sin|, the height over cos)
        lmax = min(S * 0.47 / max(0.2, abs(math.sin(a))), S * 0.9 / max(0.2, math.cos(a)))
        length = min(lmax * 0.93, S * rng.uniform(0.5, 0.62))
        # the leaves arch outward (gravity on a horizontal leaf seen from above reads as a curve on the card)
        curve = (0.12 if angs[i] >= 0 else -0.12) * abs(angs[i]) + rng.uniform(-0.04, 0.04)
        pairs = int(rng.integers(9, 14))
        lt = np.array([1.0, 1.0, 1.0], np.float32) * rng.uniform(0.92, 1.06)
        pinnate(rng, spur_top, a, length, curve, pairs, S * rng.uniform(0.07, 0.082), rng.uniform(56, 70), opposite=True,
                terminal=rng.random() < 0.35, leaf_tint=lt, rach_w=(5, 2), rach_rgb=(104, 116, 64), spotty=0.04)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

# ---------------------------------------------------------------- sophora (cells 2, 3)
def sophora_shoot(c, seed):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    base = (ox + S * 0.5, oy + S * 0.985)
    tip = (ox + S * rng.uniform(0.44, 0.56), oy + S * 0.35)
    twig = bez(base, (ox + S * rng.uniform(0.42, 0.58), oy + S * 0.65), tip)
    stroke(twig, (18, 8), (70, 74, 52), tr=0.05)
    nl = 7
    for i in range(nl):
        t = 0.12 + 0.83 * i / (nl - 1)
        x, y, a = along(twig, t)
        side = -1 if i % 2 == 0 else 1
        la = a + side * math.radians(rng.uniform(38, 55))
        length = S * rng.uniform(0.44, 0.54) * (1.0 - 0.25 * t)
        pairs = int(rng.integers(5, 8))
        pinnate(rng, (x, y), la, length, side * rng.uniform(0.04, 0.1), pairs, S * rng.uniform(0.085, 0.1), rng.uniform(50, 62),
                opposite=False, terminal=True, rach_w=(6, 3), rach_rgb=(98, 116, 62), spotty=0.05)
    # the terminal leaf
    x, y, a = along(twig, 1.0)
    pinnate(rng, (x, y), a + rng.uniform(-0.2, 0.2), S * 0.3, 0.05, 4, S * 0.085, 55, opposite=False, terminal=True,
            rach_w=(6, 3), rach_rgb=(98, 116, 62), spotty=0.05)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

def sophora_leaves(c, seed):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    node = (ox + S * 0.5, oy + S * 0.96)
    stroke([node, (node[0], node[1] - S * 0.03)], (16, 12), (70, 74, 52), tr=0.05)
    for i, a0 in enumerate([-62, -32, -4, 24, 52]):
        a = math.radians(a0 + rng.uniform(-6, 6))
        length = S * rng.uniform(0.6, 0.78)
        pinnate(rng, (node[0], node[1] - S * 0.03), a, length, (0.08 if a0 > 0 else -0.08) + rng.uniform(-0.03, 0.03),
                int(rng.integers(4, 7)), S * rng.uniform(0.09, 0.105), rng.uniform(48, 60), opposite=False, terminal=True,
                rach_w=(7, 3), rach_rgb=(98, 116, 62), spotty=0.05)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

# ---------------------------------------------------------------- London plane (cells 4, 5; TR37)
# Leaves from ambientCG LeafSet010 (CC0: four green palmate maple leaves, each with its petiole): the London plane's leaf is
# palmately 3-5 lobed like a maple's, 12-25 cm across; no CC0 scan of a plane leaf was found. Each leaf is fitted inside the
# cell (shrunk until its turned box is clear of the edges: a leaf cut by the cell edge draws a straight line on the card).
LEAVES_P = load_leaves('010', min_area=6000)
print('leaves from LeafSet010:', len(LEAVES_P), [(L['h'], L['w']) for L in LEAVES_P])
def fit_leaf(L, x, y, ang, size, ox, oy, S, m=0.02):
    asp = L['w'] / L['h']
    for _ in range(30):
        hw = 0.5 * size * asp
        ca, sa = math.cos(ang), math.sin(ang)
        pts = [(x + u * ca + v * sa, y + u * sa - v * ca) for (u, v) in [(-hw, 0), (hw, 0), (-hw, size), (hw, size)]]
        if all(ox + S * m <= px <= ox + S * (1 - m) and oy + S * m <= py <= oy + S * (1 - m) for px, py in pts): return size
        size *= 0.93
    return size
def plane_leaf(rng, x, y, ang, size, ox, oy, S, val=1.0):
    li = int(rng.integers(0, len(LEAVES_P)))
    L = LEAVES_P[li]
    size = fit_leaf(L, x, y, ang, size, ox, oy, S)
    tint, v = hsv_tint(rng, 0.05, 1.0, 0.1)
    stamp(L, x, y, size, ang, rng.random() < 0.5, tint, v * val, tr=0.85)
def plane_shoot(c, seed):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    base = (ox + S * 0.5, oy + S * 0.985)
    tip = (ox + S * rng.uniform(0.45, 0.55), oy + S * 0.45)
    twig = bez(base, (ox + S * rng.uniform(0.42, 0.58), oy + S * 0.72), tip)
    stroke(twig, (20, 10), (92, 84, 62), tr=0.05)
    for i, t in enumerate([0.22, 0.5, 0.76]):
        x, y, a = along(twig, t)
        side = -1 if i % 2 == 0 else 1
        plane_leaf(rng, x, y, a + side * math.radians(rng.uniform(42, 62)), S * rng.uniform(0.46, 0.56), ox, oy, S)
    x, y, a = along(twig, 1.0)
    plane_leaf(rng, x, y, a + rng.uniform(-0.2, 0.2), S * 0.5, ox, oy, S)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]
def plane_cluster(c, seed):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    node = (ox + S * 0.5, oy + S * 0.97)
    stroke([node, (node[0], node[1] - S * 0.04)], (20, 14), (92, 84, 62), tr=0.05)
    for a0 in (-48, -16, 16, 48):
        plane_leaf(rng, node[0], node[1] - S * 0.04, math.radians(a0 + rng.uniform(-7, 7)), S * rng.uniform(0.52, 0.62), ox, oy, S)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

# ---------------------------------------------------------------- zelkova / elm (cells 6, 7; TR37)
# Leaves from ambientCG LeafSet014 (CC0: six ovate, serrate, pinnately veined leaves, the zelkova's and the elm's leaf shape),
# 5-8 cm, in two ranks along a zig-zag twig (distichous sprays, as zelkova and elm carry them)
LEAVES_Z = load_leaves('014', min_area=6000)
print('leaves from LeafSet014:', len(LEAVES_Z), [(L['h'], L['w']) for L in LEAVES_Z])
def zelkova_spray(c, seed, nl):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    base = (ox + S * 0.5, oy + S * 0.985)
    tip = (ox + S * rng.uniform(0.46, 0.54), oy + S * 0.16)
    twig = bez(base, (ox + S * rng.uniform(0.44, 0.56), oy + S * 0.6), tip, n=32)
    # a slight zig-zag at the nodes
    twig = [(x + (S * 0.006 * (1 if i % 6 < 3 else -1) if 0 < i < len(twig) - 1 else 0), y) for i, (x, y) in enumerate(twig)]
    stroke(twig, (12, 5), (88, 80, 60), tr=0.05)
    for i in range(nl):
        t = 0.1 + 0.86 * i / (nl - 1)
        x, y, a = along(twig, t)
        side = -1 if i % 2 == 0 else 1
        L = LEAVES_Z[int(rng.integers(0, len(LEAVES_Z)))]
        size = S * rng.uniform(0.2, 0.25) * (1.0 - 0.3 * t)
        ang = a + side * math.radians(rng.uniform(50, 68))
        size = fit_leaf(L, x, y, ang, size, ox, oy, S)
        tint, v = hsv_tint(rng, 0.05, 1.0, 0.1)
        stamp(L, x, y, size, ang, rng.random() < 0.5, tint, v, tr=0.88)
    x, y, a = along(twig, 1.0)
    L = LEAVES_Z[int(rng.integers(0, len(LEAVES_Z)))]
    tint, v = hsv_tint(rng, 0.05, 1.0, 0.1)
    stamp(L, x, y, fit_leaf(L, x, y, a, S * 0.18, ox, oy, S), a + rng.uniform(-0.2, 0.2), rng.random() < 0.5, tint, v, tr=0.88)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

# ---------------------------------------------------------------- oak (cells 8, 9; TR37)
# Leaves from ambientCG LeafSet016 (CC0: six green oak leaves with rounded lobes, the swamp white oak's shape; the pin oak's
# lobes are sharper): an oak carries its leaves clustered at the shoot tips, so each cell is a short twig ending in a whorl of
# five to six leaves fanned upward, 9-12 cm each
LEAVES_Q = load_leaves('016', min_area=6000)
print('leaves from LeafSet016:', len(LEAVES_Q), [(L['h'], L['w']) for L in LEAVES_Q])
def oak_cluster(c, seed, nl):
    rng = np.random.default_rng(seed)
    ox, oy = cell_origin(c)
    S = CELL * SS
    base = (ox + S * 0.5, oy + S * 0.985)
    node = (ox + S * rng.uniform(0.47, 0.53), oy + S * 0.56)
    twig = bez(base, (ox + S * rng.uniform(0.45, 0.55), oy + S * 0.8), node)
    stroke(twig, (14, 9), (86, 76, 58), tr=0.05)
    angs = np.linspace(-1, 1, nl)
    for i in range(nl):
        a = math.radians(angs[i] * rng.uniform(74, 86) + rng.uniform(-6, 6))
        L = LEAVES_Q[int(rng.integers(0, len(LEAVES_Q)))]
        size = fit_leaf(L, node[0], node[1], a, S * rng.uniform(0.32, 0.38), ox, oy, S)
        tint, v = hsv_tint(rng, 0.05, 1.0, 0.1)
        stamp(L, node[0], node[1], size, a, rng.random() < 0.5, tint, v, tr=0.82)
    # two leaves lower on the twig
    for t, side in ((0.45, -1), (0.7, 1)):
        x, y, a = along(twig, t)
        L = LEAVES_Q[int(rng.integers(0, len(LEAVES_Q)))]
        ang = a + side * math.radians(rng.uniform(55, 70))
        tint, v = hsv_tint(rng, 0.05, 1.0, 0.1)
        stamp(L, x, y, fit_leaf(L, x, y, ang, S * 0.28, ox, oy, S), ang, rng.random() < 0.5, tint, v, tr=0.82)
    CELLRECT[c] = [ox // SS, oy // SS, S // SS, S // SS]

honeylocust(0, 3601, 10)
honeylocust(1, 3602, 9)
sophora_shoot(2, 3603)
sophora_leaves(3, 3604)
plane_shoot(4, 3605)
plane_shoot(5, 3607)   # (a second draw: fanned from a node the outer leaves were shrunk to fit the cell)
zelkova_spray(6, 3608, 12)
zelkova_spray(7, 3609, 10)
oak_cluster(8, 3610, 6)
oak_cluster(9, 3611, 5)

# ---------------------------------------------------------------- reduce to 1x, unpremultiply, calibrate
def reduce(x):
    if x.ndim == 2: return x.reshape(W // SS, SS, W // SS, SS).mean(axis=(1, 3))
    return x.reshape(W // SS, SS, W // SS, SS, x.shape[-1]).mean(axis=(1, 3))
a1 = reduce(A); c1 = reduce(C); n1 = reduce(NV); t1 = reduce(TR)
inv = np.where(a1 > 1e-4, 1.0 / np.maximum(a1, 1e-4), 0.0)
col = c1 * inv[..., None]
nv = n1 * inv[..., None]
nv[a1 <= 1e-4] = (0, 0, 1)
nv /= np.maximum(1e-6, np.linalg.norm(nv, axis=-1, keepdims=True))
tr = np.clip(t1 * inv, 0, 1)
# fill the colour of empty texels from their neighbours (mip bleed: the cut edge must not average toward black)
mask = a1 > 0.02
if (~mask).any():
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    col = col[idx[0], idx[1]]
    tr = tr[idx[0], idx[1]]

# colour calibration: each species' cells to the linear mean of its calibrated TR35 street cell (trees25 atlas, texels with
# alpha >= 0.42): honeylocust cell 16 (0.0658, 0.0954, 0.0427), sophora cell 18 (0.0874, 0.1349, 0.0602)
TARGET = {0: (0.0658, 0.0954, 0.0427), 1: (0.0658, 0.0954, 0.0427), 2: (0.0874, 0.1349, 0.0602), 3: (0.0874, 0.1349, 0.0602),
          # TR37: the London plane to the trees25 plane cells 3 / 11 (no TR35 street copy of the plane)
          4: (0.0688, 0.1042, 0.0270), 5: (0.0688, 0.1042, 0.0270),
          # zelkova / elm to the trees25 zelkova cell 8
          6: (0.0373, 0.0662, 0.0199), 7: (0.0373, 0.0662, 0.0199),
          # oak to the TR35 street oak cell 19 (outside the 125th Street / Hunters Point boxes trees.js PARK36 takes it to cell 0)
          8: (0.0934, 0.1364, 0.0586), 9: (0.0934, 0.1364, 0.0586)}
calib = {}
for c, tgt in TARGET.items():
    x0, y0, w, h = CELLRECT[c]
    sl = (slice(y0, y0 + h), slice(x0, x0 + w))
    m = a1[sl] >= 0.42
    mean = col[sl][m].mean(axis=0)
    k = np.array(tgt, np.float32) / np.maximum(mean, 1e-5)
    col[sl] = col[sl] * k
    calib[c] = {'scanMean': [round(float(v), 4) for v in mean], 'k': [round(float(v), 3) for v in k], 'coverage': round(float(m.mean()), 3)}
print('calibration', json.dumps(calib))

# the trunk-proxy bark swatch (LOD1's crossed quads): the honeylocust bark, 192 x 256 px in the empty top of cell 1 (the spur
# clusters fill the lower two thirds of their cells; v5 had it at the cell's left edge, inside cell 1's content box, and the
# cards that mapped that corner drew light bark squares among the leaves: tr36c_wind)
SW_W, SW_H = int(192 * PXK), int(256 * PXK)
bark = np.array(Image.open(f'{SRC}/bark_willow_02/bark_willow_02_diff_2k.jpg').convert('RGB').resize((SW_W, SW_H), Image.LANCZOS), np.float32)
x0, y0 = CELLRECT[1][0] + int(16 * PXK), CELLRECT[1][1] + int(16 * PXK)
assert a1[y0:y0 + SW_H, x0:x0 + SW_W].max() < 0.01, 'swatch area not empty'
col[y0:y0 + SW_H, x0:x0 + SW_W] = s2l(bark) * 0.45
a1[y0:y0 + SW_H, x0:x0 + SW_W] = 1.0
nv[y0:y0 + SW_H, x0:x0 + SW_W] = (0, 0, 1)
tr[y0:y0 + SW_H, x0:x0 + SW_W] = 0.0
SWATCH = [x0, y0, SW_W, SW_H]

# the content box of every cell (texels with any coverage, 6 px margin): the cards map only this part of the cell
CONTENT = {}
for c in range(N * N):
    if c not in CELLRECT: continue
    x0c, y0c, w, h = CELLRECT[c]
    m = a1[y0c:y0c + h, x0c:x0c + w] > 0.01
    q = int(16 * PXK)
    if c == 1: m[q - 8:q + SW_H + 8, q - 8:q + SW_W + 8] = False     # (not the swatch)
    ys, xs = np.nonzero(m)
    bx0, bx1 = max(0, xs.min() - 6), min(w, xs.max() + 7)
    by0, by1 = max(0, ys.min() - 6), min(h, ys.max() + 7)
    CONTENT[c] = [int(x0c + bx0), int(y0c + by0), int(bx1 - bx0), int(by1 - by0)]
print('content', CONTENT)
rgba = np.dstack([l2s(col), np.clip(a1, 0, 1) * 255]).round().astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(f'{OUT}/leaf36_col.png')
nrgba = np.dstack([(nv * 0.5 + 0.5) * 255, tr * 255]).round().astype(np.uint8)
Image.fromarray(nrgba, 'RGBA').save(f'{OUT}/leaf36_nrm.png')

# ---------------------------------------------------------------- bark maps
# TR37 (session 2): every species' bark from a CC0 scan at 1024 px across (a tile is ~0.9 m of bark round the trunk: 1.1 px
# a mm, finer than a 1600 px frame resolves at 3 m), the scan's height in the normal map's BLUE channel (the shader rebuilds
# the normal's z and marches the height for its relief: trees.js makeBark36), 4:4:4 JPEG so no channel is chroma-subsampled.
# `rep`: the v repeat that keeps the scan's aspect on the trunk (the u repeat must stay whole round the circumference).
def bark_set(name, col_path, nrm_path, k, cav_path=None, cav_k=0.0, h_path=None, aspect=1.0):
    W_ = 1024
    H_ = int(round(W_ / aspect))
    c = np.array(Image.open(col_path).convert('RGB').resize((W_, H_), Image.LANCZOS), np.float32)
    lin = s2l(c) * k
    if cav_path:
        # (v7, the lead's 05:59 review: "flat bark") the furrows darker: the set's AO / height as a cavity term, mean-preserving
        # (the bark's mean colour is calibrated in trees.js BARK36), so only the contrast between ridges and furrows grows
        cv = np.array(Image.open(cav_path).convert('L').resize((W_, H_), Image.LANCZOS), np.float32) / 255.0
        cav = (1.0 - cav_k) + cav_k * cv
        lin = lin * (cav / cav.mean())[..., None]
    Image.fromarray(l2s(lin).round().astype(np.uint8), 'RGB').save(f'{OUT}/bark_{name}_col.jpg', quality=88, subsampling=0)
    n = np.array(Image.open(nrm_path).convert('RGB').resize((W_, H_), Image.LANCZOS), np.float32)
    if h_path:
        hh = np.array(Image.open(h_path).convert('L').resize((W_, H_), Image.LANCZOS), np.float32)
        lo, hi = np.percentile(hh, 1), np.percentile(hh, 99)
        n[..., 2] = np.clip((hh - lo) / max(1e-3, hi - lo), 0, 1) * 255.0
    else:
        n[..., 2] = 255.0
    Image.fromarray(n.round().astype(np.uint8), 'RGB').save(f'{OUT}/bark_{name}_nrm.jpg', quality=86, subsampling=0)
    return {'mean': [round(float(v), 4) for v in lin.reshape(-1, 3).mean(axis=0)], 'rep': round(float(aspect), 3), 'px': [W_, H_]}
PH = lambda a, m: f'{SRC}/{a}/{a}_{m}_2k.jpg'
barkMeans = {
    # honeylocust: Poly Haven bark_willow_02 (2.15 m square scan: dark grey-brown scaly ridges)
    'H': bark_set('H', PH('bark_willow_02', 'diff'), PH('bark_willow_02', 'nor_gl'), 1.0, PH('bark_willow_02', 'ao'), 0.75, PH('bark_willow_02', 'disp')),
    # sophora (and ash, linden, pear, ginkgo): ambientCG Bark001 (grey, deep interlacing furrows; 1:2 scan)
    'S': bark_set('S', f'{SRC}/Bark001/Bark001_2K-JPG_Color.jpg', f'{SRC}/Bark001/Bark001_2K-JPG_NormalGL.jpg', 1.0,
                  f'{SRC}/Bark001/Bark001_2K-JPG_Displacement.jpg', 0.65, f'{SRC}/Bark001/Bark001_2K-JPG_Displacement.jpg', 0.5),
    # London plane: Poly Haven japanese_sycamore (Platanus: mottled pale grey and tan plates peeling over olive; 1.1 x 2.2 m)
    'P': bark_set('P', PH('japanese_sycamore', 'diff'), PH('japanese_sycamore', 'nor_gl'), 1.0, PH('japanese_sycamore', 'ao'), 0.5, PH('japanese_sycamore', 'disp'), 0.5),
    # zelkova and elm: Poly Haven japanese_zelkova_bark (flaking patches over orange under-bark; 1.8 m)
    'Z': bark_set('Z', PH('japanese_zelkova_bark', 'diff'), PH('japanese_zelkova_bark', 'nor_gl'), 1.0, PH('japanese_zelkova_bark', 'ao'), 0.6, PH('japanese_zelkova_bark', 'disp')),
    # cherry, plum and the small ornamentals: Poly Haven sakura_bark (horizontal lenticels, flaky ridges; 1.6 m)
    'Y': bark_set('Y', PH('sakura_bark', 'diff'), PH('sakura_bark', 'nor_gl'), 1.0, PH('sakura_bark', 'ao'), 0.6, PH('sakura_bark', 'disp')),
    # pin oak: Poly Haven jolcham_oak_bark_01 (rough fissured oak bark with lichen; 1 x 2 m)
    'Q': bark_set('Q', PH('jolcham_oak_bark_01', 'diff'), PH('jolcham_oak_bark_01', 'nor_gl'), 1.0, PH('jolcham_oak_bark_01', 'ao'), 0.6, PH('jolcham_oak_bark_01', 'disp'), 0.5),
    # maple: Poly Haven trident_maple_bark (vertical ridges, flaky plates; 1.8 m)
    'M': bark_set('M', PH('trident_maple_bark', 'diff'), PH('trident_maple_bark', 'nor_gl'), 1.0, PH('trident_maple_bark', 'ao'), 0.6, PH('trident_maple_bark', 'disp')),
}
meta = {
    'size': CELL * N, 'cells': N, 'cellRect': CELLRECT, 'content': CONTENT, 'swatch': SWATCH, 'calib': calib, 'barkMeans': barkMeans,
    # the physical size of one cell on a card (metres): the generator sizes its cards from these
    'cardM': {'0': 0.36, '1': 0.36, '2': 0.5, '3': 0.42, '4': 0.62, '5': 0.62, '6': 0.42, '7': 0.42, '8': 0.46, '9': 0.46},
}
json.dump(meta, open(f'{OUT}/meta36.json', 'w'), indent=1)
print('wrote', OUT, 'swatch', SWATCH, 'bark means', barkMeans)
