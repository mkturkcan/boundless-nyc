#!/usr/bin/env python3
# VG37 shrubs, hedges and beds (GROUND, docs/notes/ar35-veg.md): the leaf atlas and the hedge surface, composed from CC0 scans
# (boundlessjs/tools/ar35/veg/fetch_vg37.sh fetches them; nothing fetched is committed, the composed textures are).
#
#   python3 boundlessjs/tools/ar35/veg/build_vg37.py [srcDir] [outDir]
#     srcDir  the scan cache (default /data0/projectnyc_aux/tmp/veg/src)
#     outDir  default boundlessjs/public/textures/veg
#
# The atlas: 2048 x 2048, a 4 x 4 grid of 512 px cells (cell k: column k % 4, row k // 4 from the top; v up in the shader,
# so cell k spans u [k%4, k%4+1] / 4, v [3 - k//4, 4 - k//4] / 4). A sprig cell has its stem's foot at the bottom centre and
# grows up; a rosette or a cushion cell is centred. Every leaf is a scanned leaf (ambientCG LeafSet001 / 013 / 017 / 019 /
# 020 / 022 / 024 / 026, CC0) cut out by its opacity, scaled to the species' leaf size, turned, mirrored, recoloured in
# linear light toward the species' colour (the scan's own veins, blemishes and gloss variation kept) with its NormalGL map
# turned with it. Stems, grass blades, flower heads and florets are drawn. Composed at 2x and reduced (premultiplied).
#   0 boxwood sprig        1 boxwood cushion      2 yew spray A          3 yew spray B
#   4 privet sprig         5 rhododendron whorl   6 hydrangea leaves     7 hydrangea head (October: aged pink / green)
#   8 understorey A        9 understorey B       10 ivy runner          11 fountain grass (arching blades, buff plumes)
#  12 liriope (straps)    13 dandelion rosette   14 chrysanthemum mound 15 stem bark swatch (left half) / spare
# Outputs: vg37_leaf_col.webp (sRGB RGBA: albedo + coverage), vg37_leaf_nrm.webp (RGB tangent normal, OpenGL; A translucency),
# vg37_hull_col.jpg / vg37_hull_nrm.jpg (a tiling 1024 px, 0.5 m square of a clipped small-leaved hedge's face: leaves on
# leaves, the gaps dark), vg37_meta.json (cell sizes in metres, mean colours).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/data0/projectnyc_aux/tmp/veg/src'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '../../../public/textures/veg')
os.makedirs(OUT, exist_ok=True)
SS = 2
CELL = 512
NC = 4
W = CELL * NC * SS
rng = np.random.default_rng(3707)

def s2l(c): c = np.asarray(c, np.float32) / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055) * 255.0
def hexl(h): return s2l([int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)])

# ---------------------------------------------------------------- the scans' leaves
def load_leaves(set_id, min_area=1500, keep=None):
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
        y0, y1, x0, x1 = max(0, ys.start - 4), min(op.shape[0], ys.stop + 4), max(0, xs.start - 4), min(op.shape[1], xs.stop + 4)
        m = ndimage.binary_dilation(lab[y0:y1, x0:x1] == i + 1, iterations=2).astype(np.float32)
        a = op[y0:y1, x0:x1] * m
        c = s2l(col[y0:y1, x0:x1])
        w = a > 0.5
        mean = (c[w].mean(0) if w.any() else np.array([0.1, 0.2, 0.05]))
        out.append({'col': c, 'a': a, 'n': nrm[y0:y1, x0:x1], 'h': y1 - y0, 'w': x1 - x0, 'mean': mean})
    if keep is not None: out = [out[k] for k in keep if k < len(out)]
    return out

def orient_up(L, axis):
    # make every leaf point up (its petiole at the bottom): axis 'v' scans already are; 'h' scans lie with the tip to the left
    if axis == 'v': return L
    R = []
    for l in L:
        # turn 90 deg clockwise: the left tip goes up
        col = np.rot90(l['col'], k=-1).copy(); a = np.rot90(l['a'], k=-1).copy(); n = np.rot90(l['n'], k=-1).copy()
        # the normal's x / y turn with the image (clockwise 90: (x, y) -> (y, -x) in a y-up frame)
        nx, ny = n[..., 0].copy(), n[..., 1].copy()
        n[..., 0] = ny; n[..., 1] = -nx
        R.append({**l, 'col': col, 'a': a, 'n': n, 'h': l['w'], 'w': l['h']})
    return R

print('loading scans')
LV = {
    '001': load_leaves('001'), '013': load_leaves('013'), '017': load_leaves('017'), '019': load_leaves('019', 4000),
    '020': load_leaves('020'), '022': load_leaves('022'), '024': load_leaves('024'), '026': orient_up(load_leaves('026'), 'h'),
}
LV['019'] = orient_up(LV['019'], 'h')   # the needle sprays lie along x with the foot on the right: turned
for k, v in LV.items(): print(' LeafSet' + k, len(v), [(l['h'], l['w']) for l in v][:9])

# ---------------------------------------------------------------- the canvases (premultiplied, linear)
C = np.zeros((W, W, 3), np.float32)
A = np.zeros((W, W), np.float32)
NN = np.zeros((W, W, 3), np.float32)
T = np.zeros((W, W), np.float32)

def cell_origin(k):
    i, r = k % NC, k // NC
    return i * CELL * SS, r * CELL * SS   # x0, y0 (image rows down)

def over(x0, y0, col, a, n, tr):
    h, w = a.shape
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(W, x0 + w), min(W, y0 + h)
    if X1 <= X0 or Y1 <= Y0: return
    sx, sy = X0 - x0, Y0 - y0
    aa = a[sy:sy + Y1 - Y0, sx:sx + X1 - X0][..., None]
    C[Y0:Y1, X0:X1] = col[sy:sy + Y1 - Y0, sx:sx + X1 - X0] * aa + C[Y0:Y1, X0:X1] * (1 - aa)
    NN[Y0:Y1, X0:X1] = n[sy:sy + Y1 - Y0, sx:sx + X1 - X0] * aa + NN[Y0:Y1, X0:X1] * (1 - aa)
    T[Y0:Y1, X0:X1] = tr * aa[..., 0] + T[Y0:Y1, X0:X1] * (1 - aa[..., 0])
    A[Y0:Y1, X0:X1] = aa[..., 0] + A[Y0:Y1, X0:X1] * (1 - aa[..., 0])

def fimg(a): return Image.fromarray(np.ascontiguousarray(a, np.float32), 'F')

def stamp(leaf, bx, by, length, ang, tint, shade=1.0, flip=False, squash=1.0, tr=0.8, clip=None):
    """leaf's foot at (bx, by) (canvas px), pointing at `ang` degrees (0 up, + counter-clockwise), `length` px long"""
    s = length / leaf['h']
    w = max(2, int(round(leaf['w'] * s * squash))); h = max(2, int(round(leaf['h'] * s)))
    chans = [leaf['col'][..., 0], leaf['col'][..., 1], leaf['col'][..., 2], leaf['a'], leaf['n'][..., 0], leaf['n'][..., 1], leaf['n'][..., 2]]
    out = []
    for q, ch in enumerate(chans):
        im = fimg(ch[:, ::-1] if flip else ch).resize((w, h), Image.BILINEAR)
        im = im.rotate(ang, resample=Image.BILINEAR, expand=True)
        out.append(np.asarray(im, np.float32))
    col = np.stack(out[0:3], -1); a = np.clip(out[3], 0, 1); n = np.stack(out[4:7], -1)
    if flip: n[..., 0] *= -1   # mirrored: the normal's x mirrors (applied after resize: the order of the channel flip is the same)
    # turn the normal's xy with the image (PIL rotates counter-clockwise; image y is down, the normal's y is up)
    t = math.radians(ang); ct, st = math.cos(t), math.sin(t)
    nx, ny = n[..., 0].copy(), n[..., 1].copy()
    n[..., 0] = nx * ct - ny * st; n[..., 1] = nx * st + ny * ct
    if squash < 1.0: n[..., 0] *= 1.0 / max(0.4, squash)   # a foreshortened leaf: its cross slope steeper
    ln = np.sqrt((n ** 2).sum(-1, keepdims=True)) + 1e-6; n = n / ln
    # recolour toward the species' tint, keeping the scan's variation
    k = np.asarray(tint, np.float32) / np.maximum(leaf['mean'], 1e-3)
    col = np.clip(col * k * shade, 0, 1)
    # where the foot lands after the turn: the foot was the bottom centre of the unrotated (w x h) image
    fx, fy = 0.0, h / 2.0   # relative to the centre, y down
    rx, ry = fx * ct + fy * st, -fx * st + fy * ct
    H2, W2 = a.shape
    x0 = int(round(bx - (W2 / 2.0 + rx))); y0 = int(round(by - (H2 / 2.0 + ry)))
    if clip is not None:
        cx0, cy0, cx1, cy1 = clip
        m = np.ones_like(a)
        yy, xx = np.mgrid[0:H2, 0:W2]
        m[(xx + x0 < cx0) | (xx + x0 >= cx1) | (yy + y0 < cy0) | (yy + y0 >= cy1)] = 0
        a = a * m
    over(x0, y0, col, a, n, tr)

def stroke(pts, width, colhex, k, tr=0.1):
    """a stem through canvas points (px), drawn under what follows"""
    x0, y0 = cell_origin(k)
    im = Image.new('L', (CELL * SS, CELL * SS), 0)
    d = ImageDraw.Draw(im)
    P = [(p[0] - x0, p[1] - y0) for p in pts]
    if isinstance(width, (list, tuple)):
        for i in range(len(P) - 1):
            wv = width[0] + (width[1] - width[0]) * i / max(1, len(P) - 2)
            d.line([P[i], P[i + 1]], fill=255, width=max(1, int(round(wv))))
            r = wv / 2; d.ellipse([P[i + 1][0] - r, P[i + 1][1] - r, P[i + 1][0] + r, P[i + 1][1] + r], fill=255)
    else:
        d.line(P, fill=255, width=int(width), joint='curve')
    a = np.asarray(im, np.float32) / 255.0
    col = np.ones((CELL * SS, CELL * SS, 3), np.float32) * hexl(colhex)
    # a round stem: its normal across the stroke from the distance to its edge
    dist = ndimage.distance_transform_edt(a > 0.5)
    n = np.zeros((CELL * SS, CELL * SS, 3), np.float32); n[..., 2] = 1.0
    over(x0, y0, col * (0.75 + 0.25 * np.clip(dist / 3.0, 0, 1))[..., None], a, n, tr)

def jit(c, v=0.08, hue=0.05):
    c = np.asarray(c, np.float32) * (1 + rng.uniform(-v, v))
    h = rng.uniform(-hue, hue)
    return np.clip(c * np.array([1 + h, 1, 1 - h * 0.6], np.float32), 0, 1)

def bez(p0, p1, p2, n=12):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(lambda q: np.asarray(q, np.float32), (p0, p1, p2))
    return ((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2).tolist()

CS = CELL * SS   # cell size at 2x
META = {'cells': {}, 'grid': NC}
def foot(k, fx=0.5, fy=0.97):
    x0, y0 = cell_origin(k); return x0 + fx * CS, y0 + fy * CS

# ---------------------------------------------------------------- 0 / 1: boxwood (Buxus: 1.5-2.5 cm glossy elliptic leaves, opposite)
BOXC = hexl('#3c5a28') * 0.85
def boxwood_sprig(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k)
    pxm = CS / 0.16   # px per metre: the cell is 16 cm
    x0, y0 = cell_origin(k)
    # a main twig with 3-4 side twigs, opposite leaf pairs every ~6 mm, the youngest leaves at the tips lighter
    twigs = []
    main = bez((bx, by), (bx + rng.uniform(-30, 30), by - CS * 0.5), (bx + rng.uniform(-60, 60), y0 + CS * 0.08), 16)
    twigs.append(main)
    for s in range(4):
        t = rng.uniform(0.2, 0.75); i = int(t * 15)
        p = main[i]; side = -1 if s % 2 else 1
        end = (p[0] + side * rng.uniform(0.18, 0.32) * CS, p[1] - rng.uniform(0.12, 0.3) * CS)
        twigs.append(bez(p, (p[0] + side * 0.1 * CS, p[1] - 0.12 * CS), end, 10))
    for tw in twigs: stroke(tw, [5, 2.5], '#6b5a3c', k)
    for tw in twigs:
        L = len(tw)
        for i in range(1, L):
            p, q = np.array(tw[i - 1]), np.array(tw[i])
            d = q - p; a0 = math.degrees(math.atan2(-d[0], -d[1]))   # the twig's heading (0 = up)
            for side in (-1, 1):
                if rng.random() < 0.12: continue
                young = i / L
                ln = (0.017 + 0.007 * rng.random()) * pxm * (0.75 + 0.35 * (1 - abs(young - 0.6)))
                tint = jit(BOXC * (0.9 + 0.35 * young), 0.1, 0.06)
                stamp(LV['022'][rng.integers(0, len(LV['022']))], q[0], q[1], ln, a0 + side * rng.uniform(35, 70),
                      tint, shade=0.7 + 0.3 * rng.random(), flip=rng.random() < 0.5, squash=rng.uniform(0.6, 1.0), tr=0.45)
        # the tip's bud of young leaves
        q = tw[-1]
        for j in range(3):
            stamp(LV['022'][rng.integers(0, len(LV['022']))], q[0], q[1], 0.013 * pxm, rng.uniform(-40, 40), jit(BOXC * 1.3), tr=0.5)
    META['cells'][k] = {'m': 0.16, 'kind': 'sprig'}

def boxwood_cushion(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    pxm = CS / 0.16
    cx, cy = x0 + CS / 2, y0 + CS / 2
    # leaves on leaves over a round cushion: the deeper ones darker
    for layer in range(5):
        nl = 70 + 30 * layer
        for j in range(nl):
            r = (CS * 0.44) * math.sqrt(rng.random()) * (1.0 - 0.1 * layer / 4)
            th = rng.uniform(0, 2 * math.pi)
            px, py = cx + r * math.cos(th), cy + r * math.sin(th)
            ln = (0.016 + 0.008 * rng.random()) * pxm
            sh = 0.45 + 0.55 * (layer / 4) ** 0.8
            stamp(LV['022'][rng.integers(0, len(LV['022']))], px, py, ln, rng.uniform(0, 360), jit(BOXC, 0.12, 0.06), shade=sh,
                  flip=rng.random() < 0.5, squash=rng.uniform(0.55, 1.0), tr=0.45, clip=(x0, y0, x0 + CS, y0 + CS))
    META['cells'][k] = {'m': 0.16, 'kind': 'cushion'}

# ---------------------------------------------------------------- 2 / 3: yew (Taxus: flat dark needles in two ranks; the scan's needle sprays darkened)
YEWC = hexl('#2a4a24') * 0.95
def yew(k, seed, idx):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k)
    sprays = LV['019']
    sp = sprays[idx % len(sprays)]
    stamp(sp, bx, by, CS * 0.95, rng.uniform(-6, 6), jit(YEWC, 0.06, 0.03), tr=0.4)
    sp2 = sprays[(idx + 1) % len(sprays)]
    stamp(sp2, bx - CS * 0.05, by - CS * 0.25, CS * 0.6, rng.uniform(25, 40), jit(YEWC * 1.15, 0.06), shade=0.85, flip=True, tr=0.4)
    stamp(sp2, bx + CS * 0.05, by - CS * 0.35, CS * 0.55, rng.uniform(-40, -25), jit(YEWC * 1.25, 0.06), shade=0.9, tr=0.4)
    META['cells'][k] = {'m': 0.3, 'kind': 'sprig'}

# ---------------------------------------------------------------- 4: privet (Ligustrum: 3-6 cm elliptic leaves, opposite, mid green)
PRIVC = hexl('#46642c') * 0.85
def privet(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k); x0, y0 = cell_origin(k)
    pxm = CS / 0.3
    main = bez((bx, by), (bx + rng.uniform(-40, 40), by - CS * 0.5), (bx + rng.uniform(-50, 50), y0 + CS * 0.08), 9)
    shoots = [main]
    for s_ in range(3):
        i = int(rng.uniform(0.25, 0.7) * 8); p = main[i]; side = -1 if s_ % 2 else 1
        shoots.append(bez(p, (p[0] + side * 0.12 * CS, p[1] - 0.1 * CS), (p[0] + side * rng.uniform(0.25, 0.4) * CS, p[1] - rng.uniform(0.2, 0.35) * CS), 7))
    for sh_ in shoots: stroke(sh_, [5, 2], '#5e5038', k)
    for sh_ in shoots:
        for i in range(1, len(sh_)):
            p, q = np.array(sh_[i - 1]), np.array(sh_[i])
            d = q - p; a0 = math.degrees(math.atan2(-d[0], -d[1]))
            for side in (-1, 1):
                ln = (0.042 + 0.02 * rng.random()) * pxm * (0.75 + 0.35 * (1 - i / len(sh_)))
                stamp(LV['022'][rng.integers(0, len(LV['022']))], q[0], q[1], ln, a0 + side * rng.uniform(40, 75), jit(PRIVC, 0.1, 0.05),
                      shade=0.7 + 0.3 * rng.random(), flip=rng.random() < 0.5, squash=rng.uniform(0.55, 0.95), tr=0.75, clip=(x0, y0, x0 + CS, y0 + CS))
    META['cells'][k] = {'m': 0.3, 'kind': 'sprig'}

# ---------------------------------------------------------------- 5: rhododendron (8-14 cm leathery elongated leaves in a whorl at the tip)
RHOC = hexl('#2f4a22') * 0.85
def rhodo(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    pxm = CS / 0.45
    for (fx, fy, sc, sh0) in ((0.36, 0.62, 0.85, 0.75), (0.56, 0.4, 1.0, 1.0)):
        cx, cy = x0 + CS * fx, y0 + CS * fy
        stroke([(x0 + CS * 0.5, y0 + CS * 0.99), (cx + 6, (cy + y0 + CS) / 2), (cx, cy)], [9, 6], '#5a4a36', k)
        n = 8
        for j in range(n):
            ang = (j / n) * 360 + rng.uniform(-14, 14)
            ln = (0.11 + 0.04 * rng.random()) * pxm * sc
            stamp(LV['022'][rng.integers(0, len(LV['022']))], cx, cy, ln, ang, jit(RHOC, 0.1, 0.04), shade=sh0 * (0.75 + 0.25 * rng.random()),
                  flip=rng.random() < 0.5, squash=rng.uniform(0.5, 0.68), tr=0.35, clip=(x0, y0, x0 + CS, y0 + CS))
        stamp(LV['022'][0], cx, cy, 0.03 * pxm, 0, jit(hexl('#6a7a3a')), tr=0.3)
    META['cells'][k] = {'m': 0.45, 'kind': 'whorl'}

# ---------------------------------------------------------------- 6: hydrangea leaves (10-15 cm ovate, serrate, opposite pairs)
HYDC = hexl('#4b6a2c') * 0.85
def hyd_leaf(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k)
    pxm = CS / 0.5
    main = bez((bx, by), (bx + rng.uniform(-20, 20), by - CS * 0.45), (bx + rng.uniform(-30, 30), by - CS * 0.82), 5)
    stroke(main, [10, 6], '#6f6a3e', k)
    for i in range(1, len(main)):
        q = main[i]
        for side in (-1, 1):
            ln = (0.11 + 0.04 * rng.random()) * pxm * (1.0 - 0.15 * i / len(main))
            stamp(LV['024'][rng.integers(0, len(LV['024']))], q[0], q[1], ln, side * rng.uniform(45, 80), jit(HYDC, 0.1, 0.05),
                  shade=0.75 + 0.25 * rng.random(), flip=side < 0, squash=rng.uniform(0.65, 1.0), tr=0.85)
    META['cells'][k] = {'m': 0.5, 'kind': 'sprig'}

# ---------------------------------------------------------------- 7: hydrangea head (mophead in October: sepals aged to dusty pink / green / cream)
def hyd_head(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    cx, cy, R = x0 + CS / 2, y0 + CS * 0.47, CS * 0.42
    stroke([(cx, y0 + CS * 0.99), (cx, cy + R * 0.5)], [8, 6], '#6f6a3e', k)
    pal = [hexl('#b9979a'), hexl('#a99a88'), hexl('#9fa983'), hexl('#c7bda4')]
    base = pal[rng.integers(0, len(pal))]
    im = Image.new('L', (CS, CS), 0)
    for j in range(760):
        r = R * math.sqrt(rng.random()); th = rng.uniform(0, 2 * math.pi)
        px, py = cx - x0 + r * math.cos(th), cy - y0 + r * math.sin(th) * 0.92
        depth = 1 - (r / R) ** 2   # the dome's front is lighter
        s = rng.uniform(11, 17)
        fl = Image.new('L', (int(s * 4), int(s * 4)), 0); d = ImageDraw.Draw(fl)
        c0 = s * 2
        for q in range(4):   # four sepals
            a = q * math.pi / 2 + rng.uniform(0, 0.5)
            ex, ey = c0 + math.cos(a) * s * 0.9, c0 + math.sin(a) * s * 0.9
            d.ellipse([ex - s * 0.62, ey - s * 0.62, ex + s * 0.62, ey + s * 0.62], fill=255)
        fa = np.asarray(fl, np.float32) / 255.0
        tint = jit(base * (0.55 + 0.45 * depth) * rng.uniform(0.85, 1.1), 0.06, 0.08)
        col = np.ones(fa.shape + (3,), np.float32) * tint
        n = np.zeros(fa.shape + (3,), np.float32); n[..., 2] = 1
        over(int(px + x0 - c0), int(py + y0 - c0), col, fa, n, 0.6)
    META['cells'][k] = {'m': 0.28, 'kind': 'head'}

# ---------------------------------------------------------------- 8 / 9: the woodland understorey (viburnum, spicebush: 6-10 cm leaves on a twig)
def under(k, seed, setid, tint0):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k); x0, y0 = cell_origin(k)
    pxm = CS / 0.45
    main = bez((bx, by), (bx + rng.uniform(-50, 50), by - CS * 0.5), (bx + rng.uniform(-70, 70), y0 + CS * 0.12), 7)
    shoots = [main]
    for s_ in range(2):
        i = int(rng.uniform(0.3, 0.6) * 6); p = main[i]; side = -1 if s_ % 2 else 1
        shoots.append(bez(p, (p[0] + side * 0.12 * CS, p[1] - 0.08 * CS), (p[0] + side * rng.uniform(0.28, 0.38) * CS, p[1] - rng.uniform(0.18, 0.3) * CS), 5))
    for sh_ in shoots: stroke(sh_, [6, 3], '#5a4a36', k)
    L = LV[setid]
    for sh_ in shoots:
        side = 1
        for i in range(1, len(sh_)):
            q = sh_[i]; side = -side
            p0 = np.array(sh_[i - 1]); d = np.array(q) - p0; a0 = math.degrees(math.atan2(-d[0], -d[1]))
            ln = (0.085 + 0.035 * rng.random()) * pxm * (1.0 - 0.2 * i / len(sh_))
            stamp(L[rng.integers(0, len(L))], q[0], q[1], ln, a0 + side * rng.uniform(35, 70), jit(tint0, 0.1, 0.06), shade=0.7 + 0.3 * rng.random(),
                  flip=side < 0, squash=rng.uniform(0.6, 1.0), tr=0.85, clip=(x0, y0, x0 + CS, y0 + CS))
        q = sh_[-1]
        stamp(L[rng.integers(0, len(L))], q[0], q[1], 0.07 * pxm, rng.uniform(-15, 15), jit(tint0 * 1.1), tr=0.85, clip=(x0, y0, x0 + CS, y0 + CS))
    META['cells'][k] = {'m': 0.45, 'kind': 'sprig'}

# ---------------------------------------------------------------- 10: English ivy (Hedera helix runner: 4-8 cm leaves alternate on a creeping stem)
IVYC = hexl('#2c4a22') * 0.8
def ivy(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    bx, by = foot(k); x0, y0 = cell_origin(k)
    pxm = CS / 0.4
    for (dx, sc) in ((-0.18, 0.85), (0.16, 1.0)):
        main = bez((bx + dx * CS * 0.3, by), (bx + dx * CS + rng.uniform(-60, 60), by - CS * 0.5), (bx + dx * CS * 0.8 + rng.uniform(-40, 40), y0 + CS * 0.08), 10)
        stroke(main, [4, 2.5], '#6a5a3a', k)
        side = 1
        for i in range(1, len(main)):
            q = main[i]; side = -side
            ln = (0.055 + 0.03 * rng.random()) * pxm * sc
            L = LV['017']
            stamp(L[rng.integers(0, len(L))], q[0], q[1], ln, side * rng.uniform(30, 80), jit(IVYC, 0.12, 0.05), shade=0.75 + 0.25 * rng.random(),
                  flip=rng.random() < 0.5, squash=rng.uniform(0.7, 1.0), tr=0.4, clip=(x0, y0, x0 + CS, y0 + CS))
    META['cells'][k] = {'m': 0.4, 'kind': 'sprig'}

# ---------------------------------------------------------------- 11 / 12: grasses, drawn (the scans have no grass blades)
def blades(k, seed, n, hmin, hmax, wpx, arch, cols, plumes=0, plumeCol=None, tr=0.45):
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    bx = x0 + CS / 2; by = y0 + CS * 0.995
    order = rng.permutation(n)
    for j in order:
        lean = rng.uniform(-1, 1)
        hgt = CS * rng.uniform(hmin, hmax)
        tipx = bx + lean * CS * arch * rng.uniform(0.6, 1.0)
        tipy = by - hgt * (1 - 0.35 * abs(lean) * arch)
        ctrl = (bx + lean * CS * 0.12, by - hgt * 1.05)
        pts = bez((bx + rng.uniform(-14, 14), by), ctrl, (tipx, tipy), 14)
        im = Image.new('L', (CS, CS), 0); d = ImageDraw.Draw(im)
        P = [(p[0] - x0, p[1] - y0) for p in pts]
        for i in range(len(P) - 1):
            w = wpx * (1 - i / len(P)) ** 0.6 + 1
            d.line([P[i], P[i + 1]], fill=255, width=max(1, int(w)))
        a = np.asarray(im, np.float32) / 255.0
        c = cols[rng.integers(0, len(cols))] * rng.uniform(0.75, 1.1)
        yy = np.linspace(0, 1, CS)[:, None, None]
        col = np.ones((CS, CS, 3), np.float32) * c * (0.75 + 0.35 * (1 - yy))   # lighter toward the tips
        nrm = np.zeros((CS, CS, 3), np.float32); nrm[..., 2] = 1; nrm[..., 0] = 0.3 * lean
        over(x0, y0, col, a, nrm, tr)
    for j in range(plumes):
        lean = rng.uniform(-0.6, 0.6)
        sx, sy = bx + lean * CS * 0.25, y0 + CS * rng.uniform(0.05, 0.18)
        stroke([(bx, by), (bx + lean * CS * 0.1, (by + sy) / 2), (sx, sy + CS * 0.12)], 2.5, '#8a7a5c', k)
        for q in range(70):
            t = rng.random()
            px = sx + rng.normal(0, CS * 0.022) + lean * 10 * t; py = sy + t * CS * 0.16
            s = rng.uniform(3, 6)
            im = Image.new('L', (int(s * 6), int(s * 6)), 0); d = ImageDraw.Draw(im)
            d.ellipse([s * 2.5, s, s * 3.5, s * 5], fill=200)
            fa = np.asarray(im, np.float32) / 255.0
            col = np.ones(fa.shape + (3,), np.float32) * jit(plumeCol, 0.1, 0.03)
            nrm = np.zeros(fa.shape + (3,), np.float32); nrm[..., 2] = 1
            over(int(px - s * 3), int(py - s * 3), col, fa, nrm, 0.35)
    META['cells'][k] = {'m': 1.1 if plumes else 0.5, 'kind': 'tuft'}

# ---------------------------------------------------------------- 13: dandelion rosette (LeafSet020's leaves fanned flat from a crown)
def dandelion(k, seed):
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    cx, cy = x0 + CS / 2, y0 + CS / 2
    n = 11
    for j in range(n):
        ang = j * 360 / n + rng.uniform(-14, 14)
        ln = CS * rng.uniform(0.3, 0.47)
        stamp(LV['020'][rng.integers(0, len(LV['020']))], cx, cy, ln, ang, jit(hexl('#4f6e2a') * 0.85, 0.12, 0.05), shade=0.75 + 0.25 * rng.random(),
              flip=rng.random() < 0.5, tr=0.8, clip=(x0, y0, x0 + CS, y0 + CS))
    META['cells'][k] = {'m': 0.3, 'kind': 'rosette'}

# ---------------------------------------------------------------- 14: chrysanthemum mound (the Conservatory Garden's October display: daisy heads over lobed leaves)
def mums(k, seed):
    # a bunch of chrysanthemum shoots: stems fanned from the foot, lobed leaves (LeafSet026) along them, each shoot topped by a
    # cluster of small daisy heads (pale peach: the instance tint makes them bronze, gold, rust, rose or white); the flowers fill
    # the card's upper half, so a dome of these cards is a mound of flowers over its leaves
    global rng
    rng = np.random.default_rng(seed)
    x0, y0 = cell_origin(k)
    pxm = CS / 0.35
    bx, by = x0 + CS / 2, y0 + CS * 0.99
    base = hexl('#ecc9a0')
    tips = []
    for j in range(7):
        ang = rng.uniform(-0.75, 0.75)
        tx, ty = bx + math.sin(ang) * CS * rng.uniform(0.3, 0.42), y0 + CS * rng.uniform(0.18, 0.36)
        pts = bez((bx + rng.uniform(-8, 8), by), (bx + math.sin(ang) * CS * 0.12, (by + ty) / 2), (tx, ty), 8)
        stroke(pts, [4, 2.5], '#4e5a32', k)
        tips.append((tx, ty))
        for q in range(2, 7):   # leaves along the shoot
            p_ = pts[q]
            stamp(LV['026'][rng.integers(0, len(LV['026']))], p_[0], p_[1], (0.035 + 0.015 * rng.random()) * pxm, (-1 if q % 2 else 1) * rng.uniform(40, 80),
                  jit(hexl('#3e5a2a') * 0.8, 0.1, 0.05), shade=0.6 + 0.4 * rng.random(), flip=rng.random() < 0.5, tr=0.7, clip=(x0, y0, x0 + CS, y0 + CS))
    for (tx, ty) in tips:
        for f in range(rng.integers(5, 9)):
            px, py = tx + rng.normal(0, CS * 0.05), ty + rng.normal(0, CS * 0.035)
            s_ = (0.017 + 0.009 * rng.random()) * pxm
            im = Image.new('L', (int(s_ * 2.4) + 2, int(s_ * 2.4) + 2), 0); d = ImageDraw.Draw(im)
            c0 = s_ * 1.2 + 1
            for q in range(16):   # ray florets
                a_ = q * 2 * math.pi / 16 + rng.uniform(-0.1, 0.1)
                d.line([(c0, c0), (c0 + math.cos(a_) * s_, c0 + math.sin(a_) * s_)], fill=255, width=max(1, int(s_ * 0.3)))
            d.ellipse([c0 - s_ * 0.3, c0 - s_ * 0.3, c0 + s_ * 0.3, c0 + s_ * 0.3], fill=255)
            fa = np.asarray(im, np.float32) / 255.0
            yy, xx = np.mgrid[0:fa.shape[0], 0:fa.shape[1]]
            rr = np.hypot(xx - c0, yy - c0) / s_
            col = (np.ones(fa.shape + (3,), np.float32) * jit(base, 0.08, 0.03)) * (0.72 + 0.28 * np.clip(rr, 0, 1))[..., None]
            col[rr < 0.3] = hexl('#b08a2a')
            nrm = np.zeros(fa.shape + (3,), np.float32); nrm[..., 2] = 1
            over(int(px - c0), int(py - c0), col, fa, nrm, 0.6)
    META['cells'][k] = {'m': 0.35, 'kind': 'sprig'}

# ---------------------------------------------------------------- 15: the stems' bark swatch (left half), solid
def stem_swatch(k):
    x0, y0 = cell_origin(k)
    h = CS
    rnd = np.random.default_rng(15)
    base = hexl('#5b4c3a')
    noise = ndimage.gaussian_filter(rnd.normal(0, 1, (h, CS // 2)), 3)
    col = base[None, None, :] * (0.85 + 0.15 * noise[..., None] / (np.abs(noise).max() + 1e-6))
    a = np.ones((h, CS // 2), np.float32)
    n = np.zeros((h, CS // 2, 3), np.float32); n[..., 2] = 1
    over(x0, y0, col.astype(np.float32), a, n, 0.05)
    META['cells'][k] = {'m': 0.5, 'kind': 'bark'}

# ---------------------------------------------------------------- 15, right half: chrysanthemum flower heads, drawn (session 3)
# top square: a single (Korean) daisy head, 22 ray florets in two rings round a gold disc; bottom square: a pompon /
# decorative head, incurved florets in rings on a dome. The florets are pale (the instance's tint colours them: world/vg37.js),
# the disc gold (kept); the normals cup the head (the rays rise to their tips, the pompon is a dome).
def flower_heads(k):
    rnd = np.random.default_rng(116)
    x0, y0 = cell_origin(k)
    Q = CS // 2                      # a head's square (512 px at 2x)
    R = Q * 0.47
    yy, xx = np.mgrid[0:Q, 0:Q].astype(np.float32)
    X, Y = xx - Q / 2 + 0.5, yy - Q / 2 + 0.5   # image frame: y down
    PALE = hexl('#f3ebe2')
    for sq in (0, 1):
        col = np.zeros((Q, Q, 3), np.float32); a = np.zeros((Q, Q), np.float32)
        n = np.zeros((Q, Q, 3), np.float32); n[..., 2] = 1
        def lay(m, c, nn):
            m = np.clip(m, 0, 1)[..., None]
            col[:] = c * m + col * (1 - m); n[:] = nn * m + n * (1 - m); a[:] = np.maximum(a, m[..., 0])
        if sq == 0:
            for ring, (cnt, L0, W0, sh) in enumerate(((11, 0.97, 0.15, 0.78), (11, 0.93, 0.14, 1.0))):
                off = (math.pi / cnt) * ring
                for j in range(cnt):
                    ang = off + j * 2 * math.pi / cnt + rnd.uniform(-0.08, 0.08)
                    L = R * L0 * rnd.uniform(0.9, 1.04); r0 = R * 0.12; W = R * W0 * rnd.uniform(0.85, 1.1)
                    ca, sa = math.cos(ang), math.sin(ang)
                    al = X * ca + Y * sa; ac = -X * sa + Y * ca
                    mid, hl = (L + r0) / 2, (L - r0) / 2
                    e = 1 - ((al - mid) / hl) ** 2
                    hw = W * np.sqrt(np.clip(e, 0, 1)) * (0.55 + 0.45 * np.clip((al - r0) / (0.5 * hl), 0, 1))
                    m = np.clip((hw - np.abs(ac)) / 1.5, 0, 1) * (al > r0)
                    t = np.clip((al - r0) / (L - r0), 0, 1)
                    shade = sh * (0.72 + 0.28 * t) * (1 - 0.12 * np.exp(-(ac / (0.18 * W + 1e-3)) ** 2)) * (0.86 + 0.14 * np.clip(1 - np.abs(ac) / (hw + 1e-3), 0, 1))
                    c = PALE[None, None, :] * shade[..., None]
                    # the ray rises toward its tip (a cupped head) and curls a little across
                    nx_i = -0.32 * ca - 0.25 * (ac / (W + 1e-3)) * (-sa); ny_i = -0.32 * sa - 0.25 * (ac / (W + 1e-3)) * ca
                    nn = np.stack([nx_i * np.ones_like(X), -(ny_i * np.ones_like(X)), np.ones_like(X)], -1)
                    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
                    lay(m, c, nn)
            rr = np.hypot(X, Y) / (R * 0.2)
            dm = np.clip((1 - rr) * R * 0.2 / 1.5, 0, 1)
            spots = 0.75 + 0.25 * np.sin(X * 0.9) * np.sin(Y * 0.9)
            c = hexl('#b48a26')[None, None, :] * spots[..., None] * (0.8 + 0.2 * np.clip(1 - rr, 0, 1))[..., None]
            nn = np.stack([X / (R * 0.2) * 0.6, -Y / (R * 0.2) * 0.6, np.ones_like(X)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
            lay(dm, c, nn)
        else:
            rings = 9
            for i in range(rings):
                rr_ = R * (0.95 - 0.85 * i / (rings - 1)); ln = R * (0.26 - 0.12 * i / (rings - 1)); W = R * 0.075
                cnt = max(5, int(round(2 * math.pi * rr_ / (R * 0.17))))
                off = rnd.uniform(0, 2 * math.pi)
                for j in range(cnt):
                    ang = off + j * 2 * math.pi / cnt + rnd.uniform(-0.1, 0.1)
                    ca, sa = math.cos(ang), math.sin(ang)
                    al = X * ca + Y * sa; ac = -X * sa + Y * ca
                    mid, hl = rr_ - ln / 2, ln / 2
                    e = 1 - ((al - mid) / hl) ** 2
                    hw = W * np.sqrt(np.clip(e, 0, 1))
                    m = np.clip((hw - np.abs(ac)) / 1.5, 0, 1)
                    t = np.clip((al - (rr_ - ln)) / ln, 0, 1)
                    shade = (0.78 + 0.22 * t) * (0.8 + 0.2 * (1 - i / rings))
                    c = PALE[None, None, :] * shade[..., None]
                    # a dome: the head's sphere normal, each incurved floret rounded across
                    sx, sy = X / R * 0.75, Y / R * 0.75
                    nn = np.stack([sx - 0.3 * (ac / (W + 1e-3)) * (-sa), -(sy - 0.3 * (ac / (W + 1e-3)) * ca), np.ones_like(X)], -1)
                    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
                    lay(m, c, nn)
        over(x0 + Q, y0 + sq * Q, col, a, n, 0.45)

print('composing cells')
boxwood_sprig(0, 101); boxwood_cushion(1, 102)
yew(2, 103, 0); yew(3, 104, 1)
privet(4, 105); rhodo(5, 106); hyd_leaf(6, 107); hyd_head(7, 108)
under(8, 109, '001', hexl('#4a5f2c') * 0.8); under(9, 110, '022', hexl('#4f6a2e') * 0.8)
ivy(10, 111)
blades(11, 112, 70, 0.55, 0.95, 7, 0.42, [hexl('#5e6a36'), hexl('#77703f'), hexl('#4f5c2b'), hexl('#857a50')], plumes=5, plumeCol=hexl('#6f5848'))   # (session 3: plumes buff-brown, were #86765e: pale at 2 m)
blades(12, 113, 55, 0.45, 0.8, 9, 0.5, [hexl('#2c4422'), hexl('#355028'), hexl('#26381c')], tr=0.5)
dandelion(13, 114); mums(14, 115); stem_swatch(15); flower_heads(15)

# ---------------------------------------------------------------- reduce, unpremultiply, bleed
def reduce(x):
    if x.ndim == 2: return x.reshape(W // SS, SS, W // SS, SS).mean((1, 3))
    return x.reshape(W // SS, SS, W // SS, SS, x.shape[2]).mean((1, 3))
a1 = reduce(A); c1 = reduce(C); n1 = reduce(NN); t1 = reduce(T)
cov = a1 > 1e-4
col = np.where(cov[..., None], c1 / np.maximum(a1, 1e-4)[..., None], 0)
nrm = np.where(cov[..., None], n1 / np.maximum(a1, 1e-4)[..., None], 0)
tr = np.where(cov, t1 / np.maximum(a1, 1e-4), 0)
# bleed the colours and normals into the transparent texels (the mips' fringes keep the leaf's colour)
idx = ndimage.distance_transform_edt(~(a1 > 0.3), return_distances=False, return_indices=True)
col = col[idx[0], idx[1]]; nrm = nrm[idx[0], idx[1]]; tr = tr[idx[0], idx[1]]
nrm[..., 2] = np.maximum(nrm[..., 2], 0.05)
nrm = nrm / (np.sqrt((nrm ** 2).sum(-1, keepdims=True)) + 1e-6)
rgba = np.concatenate([l2s(col), (np.clip(a1, 0, 1) * 255)[..., None]], -1).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'vg37_leaf_col.webp'), quality=92, method=6)
nrgba = np.concatenate([((nrm * 0.5 + 0.5) * 255), (np.clip(tr, 0, 1) * 255)[..., None]], -1).astype(np.uint8)
Image.fromarray(nrgba, 'RGBA').save(os.path.join(OUT, 'vg37_leaf_nrm.webp'), quality=92, method=6)
# a preview on grey
prev = Image.new('RGB', (W // SS, W // SS), (70, 74, 80)); prev.paste(Image.fromarray(rgba, 'RGBA'), (0, 0), Image.fromarray(rgba, 'RGBA'))
prev.resize((1024, 1024)).save('/data0/projectnyc_aux/tmp/veg/vg37_atlas_prev.jpg', quality=88)
for k in range(16):
    i, r = k % NC, k // NC
    m = a1[r * CELL:(r + 1) * CELL, i * CELL:(i + 1) * CELL] > 0.5
    cc = col[r * CELL:(r + 1) * CELL, i * CELL:(i + 1) * CELL][m]
    if k in META['cells']: META['cells'][k]['mean'] = [round(float(v), 4) for v in (cc.mean(0) if len(cc) else [0, 0, 0])]; META['cells'][k]['cover'] = round(float(m.mean()), 3)

# ---------------------------------------------------------------- the hedge's face: a tiling 0.5 m square of small leaves, the gaps dark
HS = 1024 * SS
HC = np.zeros((HS, HS, 3), np.float32) + hexl('#0e160b') * 0.6   # the dark inside
HN = np.zeros((HS, HS, 3), np.float32); HN[..., 2] = 1
rng = np.random.default_rng(377)
pxm = HS / 0.5
def hstamp(leaf, px, py, ln, ang, tint, shade, flip, squash):
    s = ln / leaf['h']; w = max(2, int(leaf['w'] * s * squash)); h = max(2, int(leaf['h'] * s))
    ch = [leaf['col'][..., q] for q in range(3)] + [leaf['a']] + [leaf['n'][..., q] for q in range(3)]
    o = []
    for c in ch:
        im = fimg(c[:, ::-1] if flip else c).resize((w, h), Image.BILINEAR).rotate(ang, resample=Image.BILINEAR, expand=True)
        o.append(np.asarray(im, np.float32))
    a = np.clip(o[3], 0, 1); col = np.stack(o[:3], -1) * (np.asarray(tint) / np.maximum(leaf['mean'], 1e-3)) * shade
    n = np.stack(o[4:], -1)
    if flip: n[..., 0] *= -1
    t = math.radians(ang); nx, ny = n[..., 0].copy(), n[..., 1].copy()
    n[..., 0] = nx * math.cos(t) - ny * math.sin(t); n[..., 1] = nx * math.sin(t) + ny * math.cos(t)
    hh, ww = a.shape
    x0, y0 = int(px - ww / 2), int(py - hh / 2)
    for ox in (-HS, 0, HS):   # wrap: the tile repeats
        for oy in (-HS, 0, HS):
            X0, Y0 = x0 + ox, y0 + oy
            xa, ya = max(0, X0), max(0, Y0); xb, yb = min(HS, X0 + ww), min(HS, Y0 + hh)
            if xb <= xa or yb <= ya: continue
            sa = a[ya - Y0:yb - Y0, xa - X0:xb - X0][..., None]
            HC[ya:yb, xa:xb] = col[ya - Y0:yb - Y0, xa - X0:xb - X0] * sa + HC[ya:yb, xa:xb] * (1 - sa)
            HN[ya:yb, xa:xb] = n[ya - Y0:yb - Y0, xa - X0:xb - X0] * sa + HN[ya:yb, xa:xb] * (1 - sa)
print('hedge face')
for layer in range(6):
    nl = 900 + 260 * layer
    sh = 0.32 + 0.68 * (layer / 5) ** 0.9
    for j in range(nl):
        hstamp(LV['022'][rng.integers(0, len(LV['022']))], rng.uniform(0, HS), rng.uniform(0, HS), (0.016 + 0.009 * rng.random()) * pxm,
               rng.uniform(0, 360), jit(BOXC, 0.12, 0.06), sh * (0.85 + 0.3 * rng.random()), rng.random() < 0.5, rng.uniform(0.5, 1.0))
hc = HC.reshape(HS // SS, SS, HS // SS, SS, 3).mean((1, 3)); hn = HN.reshape(HS // SS, SS, HS // SS, SS, 3).mean((1, 3))
hn[..., 2] = np.maximum(hn[..., 2], 0.1); hn = hn / (np.sqrt((hn ** 2).sum(-1, keepdims=True)) + 1e-6)
Image.fromarray(l2s(hc).astype(np.uint8)).save(os.path.join(OUT, 'vg37_hull_col.jpg'), quality=90)
Image.fromarray(((hn * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(OUT, 'vg37_hull_nrm.jpg'), quality=92)
META['hull'] = {'m': 0.5, 'mean': [round(float(v), 4) for v in hc.reshape(-1, 3).mean(0)]}
_mp = os.path.join(OUT, 'vg37_meta.json')
try: _old = json.load(open(_mp))
except Exception: _old = {}
_old.update(META)   # (keeps what other builders wrote: build_vg37h.py's 'hedge')
json.dump(_old, open(_mp, 'w'), indent=1)
print('done', OUT, json.dumps(META)[:900])
