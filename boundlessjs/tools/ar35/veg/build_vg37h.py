#!/usr/bin/env python3
# VG37H the clipped hedge's face for relief mapping (GROUND, docs/notes/ar35-veg.md, session 3): a tiling 0.5 m square of a
# clipped small-leaved hedge (boxwood / Japanese holly / privet) built as a HEIGHT FIELD, not a picture: every leaf is a
# scanned leaf (ambientCG LeafSet022, CC0; fetched by fetch_vg37.sh) placed in 3D on the hedge's clipped surface and drawn
# through a z-buffer, so the texture knows how deep each texel is.
#
#   python3 boundlessjs/tools/ar35/veg/build_vg37h.py [srcDir] [outDir]
#
# The surface: clumps of shoots (domes 4-8 cm across, the clipped hedge's cauliflower relief) over a 9 cm deep volume;
# leaves 1.5-2.6 cm long on the clumps, their blades facing out within a cone, cupped along the midrib, layered (most at
# the clipped surface, fewer deeper, darker and older), twigs in the deep layer, the dark inside behind everything.
# Outputs (1024 px for 0.5 m, from a 2048 px render):
#   vg37_hedge_col.webp  sRGB albedo, A = the cavity's ambient occlusion (from the height field)
#   vg37_hedge_nrm.webp  RGB tangent normal (OpenGL: +x right, +y up the image), A = height (1 the clipped surface, 0 the
#                        inside, 9 cm deep: VG37H_DEPTH in world/vg37.js)
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/data0/projectnyc_aux/tmp/veg/src'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '../../../public/textures/veg')
PREV = '/data0/projectnyc_aux/tmp/veg'
N = 2048                      # work resolution (0.5 m): 0.244 mm a texel
TILE_M = 0.5
PX = N / TILE_M               # px per metre
DEPTH_M = 0.09                # the relief's depth (the shader's VG37H_DEPTH)
DPX = DEPTH_M * PX
rng = np.random.default_rng(3801)

def s2l(c): c = np.asarray(c, np.float32) / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055) * 255.0
def hexl(h): return s2l([int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)])

# ---------------------------------------------------------------- the scanned leaves (LeafSet022: elliptic, entire margins)
def load_leaves(set_id, min_area=1500):
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
        y0, y1, x0, x1 = max(0, ys.start - 3), min(op.shape[0], ys.stop + 3), max(0, xs.start - 3), min(op.shape[1], xs.stop + 3)
        m = ndimage.binary_dilation(lab[y0:y1, x0:x1] == i + 1, iterations=1).astype(np.float32)
        a = op[y0:y1, x0:x1] * m
        c = s2l(col[y0:y1, x0:x1])
        w = a > 0.5
        lum = (c[w] @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean()
        # the leaf's own variation kept as a luminance ratio (veins, blemishes); its hue replaced by the species' colour
        L = (c @ np.array([0.2126, 0.7152, 0.0722], np.float32)) / max(lum, 1e-4)
        out.append({'L': np.clip(L, 0.3, 2.2).astype(np.float32), 'a': a.astype(np.float32), 'n': nrm[y0:y1, x0:x1].astype(np.float32),
                    'h': y1 - y0, 'w': x1 - x0})
    return out

LEAVES = load_leaves('022')
print('leaves', len(LEAVES), [(l['h'], l['w']) for l in LEAVES])

# ---------------------------------------------------------------- the clumps: the clipped surface's relief (tileable)
# Z: 0 at the clipped surface, negative inward (px). A clump is a dome; the surface is the highest dome over each texel.
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
S = np.full((N, N), -DPX * 0.5, np.float32)
# Poisson-ish clump centres
cents = []
tries = 0
while len(cents) < 150 and tries < 20000:
    tries += 1
    c = rng.uniform(0, N, 2)
    r = rng.uniform(0.022, 0.040) * PX
    ok = True
    for (cx, cy, cr) in cents:
        dx = (c[0] - cx + N / 2) % N - N / 2; dy = (c[1] - cy + N / 2) % N - N / 2
        if dx * dx + dy * dy < (0.75 * (r + cr)) ** 2: ok = False; break
    if ok: cents.append((c[0], c[1], r))
print('clumps', len(cents))
for (cx, cy, r) in cents:
    dx = (xx - cx + N / 2) % N - N / 2; dy = (yy - cy + N / 2) % N - N / 2
    d2 = (dx * dx + dy * dy) / (r * r)
    top = -rng.uniform(0.0, 0.016) * PX            # clumps stand a little proud of each other (the last cut)
    dome = top - (0.030 * PX) * d2                   # a dome: 3 cm down at its rim
    S = np.maximum(S, dome)
S = ndimage.gaussian_filter(S, 6, mode='wrap')
gy_, gx_ = np.gradient(S)                            # the clump's slope (px / px): the leaves face out of it

# ---------------------------------------------------------------- the z-buffer
ZB = np.full((N, N), -DPX, np.float32)               # the inside
ALB = np.zeros((N, N, 3), np.float32) + hexl('#1a1a10') * 0.55
NRM = np.zeros((N, N, 3), np.float32); NRM[..., 2] = 1.0
GREEN = hexl('#35532a') * 0.8                        # the clipped hedges' deep green (the Conservatory Garden's photographs)
NEW = hexl('#56702c') * 0.85                         # this year's shoots, at the clipped surface
OLD = hexl('#263e24') * 0.75                         # older leaves inside, bluer and darker
TAN = hexl('#9a8240') * 0.75                         # a few yellowed leaves (October)

def leaf(cx, cy, cz, nrm, axis, length, cup, colr, flip):
    """one scanned leaf: centre (cx, cy, cz) px (x right, y DOWN the image, z out), unit blade normal `nrm` and axis `axis` (3D,
    the same frame), `length` px tip to petiole; drawn through the z-buffer"""
    L = LEAVES[rng.integers(0, len(LEAVES))]
    hgt, wid = L['h'], L['w']
    s = length / hgt                                 # px of the tile per px of the scan
    a = np.asarray(axis, np.float32); n = np.asarray(nrm, np.float32)
    b = np.cross(n, a); b /= np.linalg.norm(b) + 1e-9
    if flip: b = -b
    # the leaf's local (t across, q along, from its centre) -> tile (x, y, z) = c + t b + q a
    half = 0.5 * hgt * s
    ext = abs(a[0]) * half + abs(b[0]) * 0.5 * wid * s, abs(a[1]) * half + abs(b[1]) * 0.5 * wid * s
    x0, x1 = int(math.floor(cx - ext[0] - 2)), int(math.ceil(cx + ext[0] + 2))
    y0, y1 = int(math.floor(cy - ext[1] - 2)), int(math.ceil(cy + ext[1] + 2))
    gx, gy = np.meshgrid(np.arange(x0, x1, dtype=np.float32), np.arange(y0, y1, dtype=np.float32))
    px, py = gx - cx, gy - cy
    # solve [b.xy a.xy] [t q]^T = (px, py)
    det = b[0] * a[1] - a[0] * b[1]
    if abs(det) < 0.12: return                       # edge-on: skip (a sliver)
    t = (px * a[1] - py * a[0]) / det
    q = (b[0] * py - b[1] * px) / det
    # scan coordinates: column = centre + t / s, row = centre - q / s (the tip up the scan)
    sc = (wid - 1) / 2.0 + t / s
    sr = (hgt - 1) / 2.0 - q / s
    inside = (sc >= 0) & (sc <= wid - 1) & (sr >= 0) & (sr <= hgt - 1)
    if not inside.any(): return
    c0 = np.clip(np.floor(sc).astype(np.int32), 0, wid - 2); r0 = np.clip(np.floor(sr).astype(np.int32), 0, hgt - 2)
    fc = np.clip(sc - c0, 0, 1); fr = np.clip(sr - r0, 0, 1)
    def samp(img):
        v00 = img[r0, c0]; v01 = img[r0, c0 + 1]; v10 = img[r0 + 1, c0]; v11 = img[r0 + 1, c0 + 1]
        if img.ndim == 3: f1, f2 = fc[..., None], fr[..., None]
        else: f1, f2 = fc, fr
        return (v00 * (1 - f1) + v01 * f1) * (1 - f2) + (v10 * (1 - f1) + v11 * f1) * f2
    al = samp(L['a']) * inside
    m = al > 0.5
    if not m.any(): return
    lum = samp(L['L'])
    ns = samp(L['n'])
    if flip: ns[..., 0] = -ns[..., 0]
    # the cup: the blade rises to its midrib (convex), a little along its length too
    tw = t / (0.5 * wid * s + 1e-6)
    qw = q / (half + 1e-6)
    dz = cup * (1.0 - tw * tw) - 0.35 * cup * qw * qw
    z = cz + t * b[2] + q * a[2] + dz * n[2]
    # the normal: the scan's (veins) in the blade's frame, tilted by the cup's slope
    dcup_t = -2.0 * cup * tw / (0.5 * wid * s + 1e-6)
    nx = ns[..., 0][..., None] * b[None, None, :] + ns[..., 1][..., None] * a[None, None, :] + ns[..., 2][..., None] * n[None, None, :]
    nx = nx - dcup_t[..., None] * b[None, None, :] * 0.7
    nx /= np.linalg.norm(nx, axis=-1, keepdims=True) + 1e-6
    # wrap and z-test
    rows = (np.arange(y0, y1) % N); cols = (np.arange(x0, x1) % N)
    zb = ZB[np.ix_(rows, cols)]
    win = m & (z > zb)
    if not win.any(): return
    zb[win] = z[win]
    ZB[np.ix_(rows, cols)] = zb
    al_ = ALB[np.ix_(rows, cols)]
    al_[win] = (colr[None, :] * lum[win][:, None])
    ALB[np.ix_(rows, cols)] = al_
    nr_ = NRM[np.ix_(rows, cols)]
    # into the image's frame: y down -> the normal map's y is UP the image
    nn = nx[win]; nn[:, 1] = -nn[:, 1]
    nr_[win] = nn
    NRM[np.ix_(rows, cols)] = nr_

def twig(x0, y0, z0, ang, length, rad, tilt):
    """a thin twig in the deep layer: a capsule through the z-buffer"""
    dx, dy = math.cos(ang), math.sin(ang)
    steps = int(length / max(1.0, rad * 0.6))
    for k in range(steps):
        f = k / max(1, steps - 1)
        x, y, z = x0 + dx * length * f, y0 + dy * length * f, z0 + tilt * length * f
        r = rad * (1 - 0.4 * f)
        xa, xb, ya, yb = int(x - r - 1), int(x + r + 2), int(y - r - 1), int(y + r + 2)
        gx, gy = np.meshgrid(np.arange(xa, xb), np.arange(ya, yb))
        d2 = ((gx - x) ** 2 + (gy - y) ** 2) / (r * r)
        m = d2 < 1
        zz = z + r * np.sqrt(np.clip(1 - d2, 0, 1))
        rows, cols = np.arange(ya, yb) % N, np.arange(xa, xb) % N
        zb = ZB[np.ix_(rows, cols)]
        win = m & (zz > zb)
        if not win.any(): continue
        zb[win] = zz[win]; ZB[np.ix_(rows, cols)] = zb
        al_ = ALB[np.ix_(rows, cols)]; al_[win] = hexl('#5a4a3a') * 0.55 * (0.8 + 0.4 * rng.random()); ALB[np.ix_(rows, cols)] = al_
        nr_ = NRM[np.ix_(rows, cols)]
        ex, ey = (gx - x) / r, (gy - y) / r
        nz = np.sqrt(np.clip(1 - ex * ex - ey * ey, 0.05, 1))
        nn = np.stack([ex, -ey, nz], -1)
        nr_[win] = nn[win]; NRM[np.ix_(rows, cols)] = nr_

print('twigs')
for k in range(260):
    twig(rng.uniform(0, N), rng.uniform(0, N), -DPX * rng.uniform(0.55, 0.92), rng.uniform(0, 2 * math.pi), rng.uniform(0.02, 0.07) * PX,
         rng.uniform(0.0008, 0.0016) * PX, rng.uniform(-0.15, 0.25))

def put_leaf(depth_k):
    cx, cy = rng.uniform(0, N), rng.uniform(0, N)
    ix, iy = int(cx) % N, int(cy) % N
    surf = S[iy, ix]
    # the blade faces out of the clump (its slope), within a cone; deeper leaves face any way
    sn = np.array([-gx_[iy, ix], -gy_[iy, ix], 1.0], np.float32)   # (x, y down, z): the slope's outward normal
    sn /= np.linalg.norm(sn)
    cone = 0.75 + 0.9 * depth_k
    rnd = rng.normal(0, 1, 3).astype(np.float32); rnd[2] = abs(rnd[2])
    n = sn + cone * 0.55 * rnd
    n /= np.linalg.norm(n)
    if n[2] < 0.12: n[2] = 0.12; n /= np.linalg.norm(n)
    # the axis: any way across the blade, a little more often pointing up and out (shoots grow up the hedge's face)
    a = rng.normal(0, 1, 3).astype(np.float32); a[1] -= 0.6
    a = a - n * float(a @ n); a /= np.linalg.norm(a) + 1e-9
    length = rng.uniform(0.015, 0.026) * PX
    cup = rng.uniform(0.0006, 0.0018) * PX
    z = surf - depth_k * DPX * 0.85 - abs(rng.normal(0, 0.004)) * PX
    # the colour by depth and by chance
    r = rng.random()
    if depth_k < 0.08 and r < 0.12: base = NEW
    elif r < 0.015: base = TAN
    else: base = GREEN * (1 - depth_k) + OLD * depth_k
    col = base * (0.8 + 0.4 * rng.random()) * np.array([0.92 + 0.16 * rng.random(), 1.0, 0.9 + 0.2 * rng.random()], np.float32)
    leaf(cx, cy, z, n, a, length, cup, col.astype(np.float32), rng.random() < 0.5)

print('leaves: deep')
for k in range(1600): put_leaf(rng.uniform(0.35, 0.8))
print('leaves: mid')
for k in range(2600): put_leaf(rng.uniform(0.1, 0.35))
print('leaves: surface')
for k in range(4200): put_leaf(rng.uniform(0.0, 0.1))

# ---------------------------------------------------------------- AO from the height field (the cavity: how much higher the
# neighbourhood stands, at three radii), and the height
H = np.clip(1.0 + ZB / DPX, 0, 1)
ao = np.ones((N, N), np.float32)
for sig, k in ((4, 0.9), (12, 0.7), (32, 0.5)):
    bl = ndimage.gaussian_filter(H, sig, mode='wrap')
    ao *= np.clip(1.0 - k * np.maximum(bl - H, 0) * 4.0, 0.0, 1.0)
ao = np.clip(ao * (0.25 + 0.75 * np.power(H, 0.6)), 0.05, 1)

# ---------------------------------------------------------------- reduce to 1024 and write
def red(x):
    if x.ndim == 2: return x.reshape(N // 2, 2, N // 2, 2).mean((1, 3))
    return x.reshape(N // 2, 2, N // 2, 2, x.shape[2]).mean((1, 3))
alb, nrm, hgt, aoo = red(ALB), red(NRM), red(H), red(ao)
nrm[..., 2] = np.maximum(nrm[..., 2], 0.08)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-6
col = np.concatenate([l2s(alb), (aoo * 255)[..., None]], -1).astype(np.uint8)
Image.fromarray(col, 'RGBA').save(os.path.join(OUT, 'vg37_hedge_col.webp'), quality=90, method=6, exact=True)
nr = np.concatenate([(nrm * 0.5 + 0.5) * 255, (hgt * 255)[..., None]], -1).astype(np.uint8)
Image.fromarray(nr, 'RGBA').save(os.path.join(OUT, 'vg37_hedge_nrm.webp'), quality=92, method=6, exact=True)
# previews: the albedo times the AO, the height, the normal
p = l2s(alb * aoo[..., None] * 2.2).astype(np.uint8)
Image.fromarray(np.concatenate([p, np.repeat((hgt * 255).astype(np.uint8)[..., None], 3, -1), ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)], 1)).resize((1536, 512)).save(os.path.join(PREV, 'vg37h_prev.jpg'), quality=88)
surf = hgt > 0.8
meta_p = os.path.join(OUT, 'vg37_meta.json')
META = json.load(open(meta_p))
META['hedge'] = {'m': TILE_M, 'depth': DEPTH_M, 'mean': [round(float(v), 4) for v in alb.reshape(-1, 3).mean(0)],
                 'surfMean': [round(float(v), 4) for v in alb[surf].mean(0)], 'surfShare': round(float(surf.mean()), 3),
                 'aoMean': round(float(aoo.mean()), 3), 'hMean': round(float(hgt.mean()), 3)}
json.dump(META, open(meta_p, 'w'), indent=1)
print('done', META['hedge'])
