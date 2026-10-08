#!/usr/bin/env python3
# BX-TREES (AR34 BX, 2026-10-02): the leaf atlases of the tree asset set.
#
#   python3 tools/ar34/bxtrees/leaves.py [srcDir] [outDir]
#     srcDir  the CC0 scan cache (default /data0/projectnyc_aux/tmp/trees/src, fetched by tools/ar35/trees/fetch36.sh)
#     outDir  default /data0/projectnyc_aux/assets/bxtrees/tex
#
# One atlas per species, 2 x 2 cells of 1024 px (cell index = cx + 2 cy, v up). Each cell is one card: a single leaf, a
# three-leaf spray (a twig tip with a terminal and two lateral leaves) or a compound leaf (leaflets on a drawn rachis), the
# card's base (petiole or twig end) at the cell's bottom centre. Every leaf is a scanned leaf of ambientCG (CC0) cut out of
# its LeafSet: colour from the Color map, the cut from Opacity, the relief from NormalGL (x / y turned with the leaf).
# Per cell the opaque texels' linear mean is scaled to the web's calibrated leaf colour for the species (build36.py TARGET,
# the trees25 cell means; docs/notes/ar34-trees.md), so both targets start from the same albedo.
# Outputs per species F: F_leaf_col.png (sRGB RGBA, colour bled into the cut-away texels), F_leaf_nrm.png (OpenGL normal),
# the web's 1024 px WebP copies F_leaf_col.webp / F_leaf_nrm.webp, and leaves.json (per cell: the card's octagon in cell
# uv, its base point, its length in cell units; per species: the card's length in metres).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/data0/projectnyc_aux/tmp/trees/src'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/data0/projectnyc_aux/assets/bxtrees/tex'
os.makedirs(OUT, exist_ok=True)
CELL = 1024
NC = 2
rng = np.random.default_rng(20261002)

def s2l(c): c = np.asarray(c, np.float32) / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055) * 255.0

_sets = {}
def load_set(sid, min_area=4000):
    """the scan's leaves: linear colour, alpha, normal (-1..1), each cropped with the petiole end at the bottom"""
    if sid in _sets: return _sets[sid]
    d = f'{SRC}/LeafSet{sid}/LeafSet{sid}_2K-PNG_'
    col = s2l(np.array(Image.open(d + 'Color.png').convert('RGB')))
    op = np.array(Image.open(d + 'Opacity.png').convert('L'), np.float32) / 255.0
    nrm = np.array(Image.open(d + 'NormalGL.png').convert('RGB'), np.float32) / 127.5 - 1.0
    lab, n = ndimage.label(op > 0.5)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None: continue
        ys, xs = sl
        if (ys.stop - ys.start) * (xs.stop - xs.start) < min_area: continue
        y0, y1 = max(0, ys.start - 4), min(op.shape[0], ys.stop + 4)
        x0, x1 = max(0, xs.start - 4), min(op.shape[1], xs.stop + 4)
        m = ndimage.binary_dilation(lab[y0:y1, x0:x1] == i + 1, iterations=2)
        a = op[y0:y1, x0:x1] * m
        out.append({'col': col[y0:y1, x0:x1], 'a': a, 'n': nrm[y0:y1, x0:x1], 'h': y1 - y0, 'w': x1 - x0})
    out.sort(key=lambda L: -(L['h'] * L['w']))
    _sets[sid] = out
    return out

class Canvas:
    def __init__(self, n=CELL):
        self.n = n
        self.C = np.zeros((n, n, 3), np.float32)   # premultiplied linear colour
        self.A = np.zeros((n, n), np.float32)
        self.N = np.zeros((n, n, 3), np.float32)   # premultiplied normal
    def over(self, y0, x0, col, a, nv):
        h, w = a.shape
        ya, xa = max(0, y0), max(0, x0)
        yb, xb = min(self.n, y0 + h), min(self.n, x0 + w)
        if yb <= ya or xb <= xa: return
        sy, sx = slice(ya - y0, yb - y0), slice(xa - x0, xb - x0)
        col, a, nv = col[sy, sx], a[sy, sx], nv[sy, sx]
        ys, xs = slice(ya, yb), slice(xa, xb)
        k = 1.0 - a
        self.C[ys, xs] = col * a[..., None] + self.C[ys, xs] * k[..., None]
        self.N[ys, xs] = nv * a[..., None] + self.N[ys, xs] * k[..., None]
        self.A[ys, xs] = a + self.A[ys, xs] * k
    def stroke(self, pts, w0, w1, col):
        """a twig / rachis: a tapered polyline (canvas px, y down), flat normal"""
        img = Image.new('F', (self.n, self.n), 0.0)
        dr = ImageDraw.Draw(img)
        for i in range(len(pts) - 1):
            t = i / max(1, len(pts) - 2)
            w = w0 + (w1 - w0) * t
            dr.line([tuple(pts[i]), tuple(pts[i + 1])], fill=1.0, width=max(1, int(round(w))))
            r = w / 2
            dr.ellipse([pts[i + 1][0] - r, pts[i + 1][1] - r, pts[i + 1][0] + r, pts[i + 1][1] + r], fill=1.0)
        a = np.array(img, np.float32)
        a = ndimage.gaussian_filter(a, 0.6)
        c = np.broadcast_to(np.asarray(col, np.float32), (self.n, self.n, 3))
        nv = np.broadcast_to(np.array([0, 0, 1], np.float32), (self.n, self.n, 3))
        self.over(0, 0, c, np.clip(a, 0, 1), nv)

def stamp(L, length_px, ang_deg, flip=False):
    """a leaf scaled to length_px (its height), turned ang_deg counter-clockwise about its base; returns arrays and the
    base point's offset inside the turned stamp (x, y in px, y down)"""
    h, w = L['a'].shape
    s = length_px / h
    nw, nh = max(2, int(round(w * s))), max(2, int(round(h * s)))
    def rs(x, mode=Image.BILINEAR):
        return np.array(Image.fromarray(x.astype(np.float32), 'F').resize((nw, nh), mode), np.float32)
    col = np.stack([rs(L['col'][..., k]) for k in range(3)], -1)
    a = rs(L['a'])
    nv = np.stack([rs(L['n'][..., k]) for k in range(3)], -1)
    if flip:
        col, a, nv = col[:, ::-1], a[:, ::-1], nv[:, ::-1].copy(); nv[..., 0] *= -1
    # the base point: the lowest opaque row's centre
    rows = np.nonzero(a.max(axis=1) > 0.5)[0]
    by = rows.max() if len(rows) else nh - 1
    xs = np.nonzero(a[by] > 0.3)[0]
    bx = xs.mean() if len(xs) else nw / 2
    # pad to a square about the base so the rotation keeps it in place
    R = int(math.ceil(math.hypot(max(bx, nw - bx), max(by, nh - by)))) + 2
    P = 2 * R
    def pad(x):
        z = np.zeros((P, P) + x.shape[2:], np.float32)
        oy, ox = R - int(round(by)), R - int(round(bx))
        z[oy:oy + nh, ox:ox + nw] = x
        return z
    col, a, nv = pad(col), pad(a), pad(nv)
    if ang_deg:
        def rot(x): return np.array(Image.fromarray(x, 'F').rotate(ang_deg, resample=Image.BICUBIC, center=(R, R)), np.float32)
        col = np.stack([rot(col[..., k]) for k in range(3)], -1)
        a = np.clip(rot(a), 0, 1)
        nx, ny, nz = rot(nv[..., 0]), rot(nv[..., 1]), rot(nv[..., 2])
        t = math.radians(ang_deg)   # image y is down: a CCW turn on screen turns the GL (y up) vector by +t
        c, s_ = math.cos(t), math.sin(t)
        nv = np.stack([nx * c - ny * s_, nx * s_ + ny * c, nz], -1)
    return col, a, nv, R, R

def put(cv, L, base_xy, length_px, ang_deg, flip=False):
    col, a, nv, ox, oy = stamp(L, length_px, ang_deg, flip)
    cv.over(int(round(base_xy[1] - oy)), int(round(base_xy[0] - ox)), col, a, nv)

TWIG = s2l(np.array([92, 78, 58]))
RACHIS = s2l(np.array([96, 112, 58]))

def cell_single(L):
    cv = Canvas()
    put(cv, L, (CELL / 2, CELL - 12), CELL - 40, 0.0)
    return cv

def cell_spray(Ls, k):
    """a twig tip: a terminal leaf and two laterals, alternate, on a drawn twig"""
    cv = Canvas()
    bx, by = CELL / 2, CELL - 10
    top = (CELL / 2 + rng.uniform(-30, 30), CELL * 0.50)
    cv.stroke([(bx, by), ((bx + top[0]) / 2 + rng.uniform(-12, 12), (by + top[1]) / 2), top], 9, 5, TWIG)
    lp = CELL * 0.46
    put(cv, Ls[(k + 1) % len(Ls)], (bx + (top[0] - bx) * 0.32, by + (top[1] - by) * 0.32), lp * 0.92, 52 + rng.uniform(-8, 8))
    put(cv, Ls[(k + 2) % len(Ls)], (bx + (top[0] - bx) * 0.68, by + (top[1] - by) * 0.68), lp * 0.96, -48 + rng.uniform(-8, 8), flip=True)
    put(cv, Ls[k % len(Ls)], top, lp, rng.uniform(-6, 6))
    return cv

def cell_pinnate(Ls, k, pairs, leaflet, curve=0.06, fan=1):
    """a pinnate leaf (fan=1) or a spur cluster of `fan` pinnate leaves fanned from the base (the honeylocust)"""
    cv = Canvas()
    bx, by = CELL / 2, CELL - 8
    angs = [0.0] if fan == 1 else list(np.linspace(-34, 34, fan) + rng.uniform(-5, 5, fan))
    for j, ang in enumerate(angs):
        Lr = (CELL - 30) * (1.0 if fan == 1 else rng.uniform(0.72, 0.92))
        t = math.radians(ang)
        cb = rng.uniform(-curve, curve)
        pts = []
        for i in range(17):
            f = i / 16
            bend = cb * f * f * Lr
            px = bx + math.sin(t) * f * Lr + math.cos(t) * bend
            py = by - math.cos(t) * f * Lr + math.sin(t) * bend
            pts.append((px, py))
        cv.stroke(pts, 6 if fan == 1 else 4.5, 2.5, RACHIS)
        npair = int(rng.integers(pairs[0], pairs[1] + 1))
        for i in range(npair):
            f = 0.14 + 0.84 * (i + 0.5) / npair
            q = int(f * 16); q = min(q, 15)
            px, py = pts[q][0] + (pts[q + 1][0] - pts[q][0]) * (f * 16 - q), pts[q][1] + (pts[q + 1][1] - pts[q][1]) * (f * 16 - q)
            size = leaflet * Lr * (0.75 + 0.25 * math.sin(math.pi * min(1.0, f * 1.15))) * rng.uniform(0.92, 1.06)
            for side in (-1, 1):
                a = ang + side * rng.uniform(62, 78)
                put(cv, Ls[int(rng.integers(len(Ls)))], (px, py), size, -a, flip=side > 0)
        # the terminal leaflet (the sophora is odd-pinnate)
        if fan == 1:
            put(cv, Ls[int(rng.integers(len(Ls)))], pts[-1], leaflet * Lr * 0.9, -ang)
    return cv

# species: the leaf scan, the card kind, the card's length in metres (the octagon's height), the colour target (linear
# mean of the opaque texels; the web's calibrated values: build36.py TARGET and the trees25 cells, docs/notes/ar34-trees.md)
SPECIES = {
    'P': {'set': '010', 'kind': 'single', 'len': 0.24, 'target': (0.0688, 0.1042, 0.0270)},   # London plane: palmate
    'M': {'set': '010', 'kind': 'single', 'len': 0.15, 'target': (0.0349, 0.0613, 0.0171)},   # Norway / red maple
    'Q': {'set': '016', 'kind': 'single', 'len': 0.15, 'target': (0.0934, 0.1364, 0.0586)},   # pin oak
    'Z': {'set': '014', 'kind': 'spray', 'len': 0.17, 'target': (0.0373, 0.0662, 0.0199)},    # zelkova: 6-8 cm leaves
    'R': {'set': '024', 'kind': 'spray', 'len': 0.15, 'target': (0.0312, 0.0740, 0.0326)},    # Callery pear
    'L': {'set': '024', 'kind': 'spray', 'len': 0.15, 'target': (0.0699, 0.1024, 0.0412)},    # littleleaf linden
    'H': {'set': '022', 'kind': 'spur', 'len': 0.30, 'target': (0.0658, 0.0954, 0.0427)},     # honeylocust: spur clusters
    'S': {'set': '022', 'kind': 'pinnate', 'len': 0.26, 'target': (0.0874, 0.1349, 0.0602)},  # sophora
    'Y': {'set': '014', 'kind': 'spray', 'len': 0.20, 'target': (0.0378, 0.0630, 0.0182)},    # cherry (trees25 cell 9)
    'X': {'set': '024', 'kind': 'spray', 'len': 0.14, 'target': (0.0670, 0.0178, 0.0255)},    # purple-leaf plum (cell 10)
    'W': {'set': '024', 'kind': 'spray', 'len': 0.14, 'target': (0.0400, 0.0660, 0.0200)},    # small green ornamentals
}

def octagon(a, thr=0.25, pad=3):
    """the tight octagon round the card's opaque texels, in cell uv (u right, v up), counter-clockwise"""
    ys, xs = np.nonzero(a >= thr)
    if not len(xs): return [[0, 0], [1, 0], [1, 1], [0, 1]]
    u = (xs + 0.5) / CELL; v = 1.0 - (ys + 0.5) / CELL
    p = pad / CELL
    x0, x1, y0, y1 = u.min() - p, u.max() + p, v.min() - p, v.max() + p
    s0, s1 = (u + v).min() - p * 1.41, (u + v).max() + p * 1.41
    d0, d1 = (u - v).min() - p * 1.41, (u - v).max() + p * 1.41
    # the 8 corners of the intersection of the box and the two diagonal slabs (consecutive, counter-clockwise from the bottom)
    P = [(s0 - y0, y0), (d1 + y0, y0), (x1, x1 - d1), (x1, s1 - x1), (s1 - y1, y1), (d0 + y1, y1), (x0, x0 - d0), (x0, s0 - x0)]
    P = [[float(np.clip(x, 0, 1)), float(np.clip(y, 0, 1))] for x, y in P]
    return P

def bleed(col, a):
    """the colour of the nearest covered texel under the cut-away ones (no dark fringe in the mips)"""
    m = a >= 0.35
    if not m.any(): return col
    idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    return col[idx[0], idx[1]]

# (TREEUE 2026-10-07: guarded, so leaves2.py can import the helpers above without building this set)
def main():
    meta = {'cell': CELL, 'nc': NC, 'species': {}}
    for F, sp in SPECIES.items():
        Ls = load_set(sp['set'])
        # (spray / pinnate leaflets: the scan's cleaner leaves; the honeylocust and sophora leaflets from LeafSet022 as the web's)
        cells = []
        for k in range(NC * NC):
            if sp['kind'] == 'single': cv = cell_single(Ls[k % len(Ls)])
            elif sp['kind'] == 'spray': cv = cell_spray(Ls, k)
            elif sp['kind'] == 'spur': cv = cell_pinnate(Ls, k, (11, 14), 0.115, curve=0.08, fan=int(rng.integers(5, 7)))
            else: cv = cell_pinnate(Ls, k, (5, 7), 0.19, curve=0.05, fan=1)
            cells.append(cv)
        # colour: each cell's covered texels scaled to the species' target (linear, per channel)
        atl_c = np.zeros((CELL * NC, CELL * NC, 3), np.float32)
        atl_a = np.zeros((CELL * NC, CELL * NC), np.float32)
        atl_n = np.zeros((CELL * NC, CELL * NC, 3), np.float32)
        info = []
        for k, cv in enumerate(cells):
            a = cv.A
            col = cv.C / np.maximum(a, 1e-4)[..., None]
            nv = cv.N / np.maximum(a, 1e-4)[..., None]
            m = a >= 0.42
            mean = col[m].mean(axis=0)
            col = col * (np.asarray(sp['target'], np.float32) / np.maximum(mean, 1e-4))
            col = bleed(col, a)
            nv[~m] = (0, 0, 1)
            nv = nv / np.maximum(np.linalg.norm(nv, axis=-1, keepdims=True), 1e-4)
            nv = bleed(nv, a)
            cx, cy = k % NC, k // NC
            ys = slice((NC - 1 - cy) * CELL, (NC - cy) * CELL); xs = slice(cx * CELL, (cx + 1) * CELL)   # v up: row 0 is the top
            atl_c[ys, xs], atl_a[ys, xs], atl_n[ys, xs] = col, a, nv
            oc = octagon(a)
            vs = [p[1] for p in oc]
            info.append({'octagon': oc, 'base': [0.5, float(min(vs))], 'len': float(max(vs) - min(vs)),
                         'cover': float((a >= 0.42).mean()), 'mean': [float(x) for x in (col[m].mean(axis=0))]})
        rgba = np.concatenate([l2s(atl_c), np.clip(atl_a, 0, 1)[..., None] * 255.0], -1).round().astype(np.uint8)
        nrm8 = ((atl_n * 0.5 + 0.5) * 255.0).round().clip(0, 255).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(f'{OUT}/{F}_leaf_col.png', optimize=False, compress_level=6)
        Image.fromarray(nrm8, 'RGB').save(f'{OUT}/{F}_leaf_nrm.png', compress_level=6)
        Image.fromarray(rgba, 'RGBA').resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/{F}_leaf_col.webp', quality=90, method=6)
        Image.fromarray(nrm8, 'RGB').resize((1024, 1024), Image.LANCZOS).save(f'{OUT}/{F}_leaf_nrm.webp', quality=88, method=6)
        meta['species'][F] = {'set': 'ambientCG LeafSet' + sp['set'], 'kind': sp['kind'], 'len': sp['len'], 'target': sp['target'], 'cells': info}
        print(F, sp['kind'], [round(c['cover'], 3) for c in info], [round(c['len'], 3) for c in info])
    json.dump(meta, open(f'{OUT}/leaves.json', 'w'), indent=1)
    # a contact sheet of the atlases over grey
    sheet = []
    for F in SPECIES:
        im = Image.open(f'{OUT}/{F}_leaf_col.png').resize((512, 512), Image.LANCZOS)
        bg = Image.new('RGBA', im.size, (200, 200, 205, 255)); bg.alpha_composite(im)
        d = ImageDraw.Draw(bg); d.text((6, 4), F, fill=(0, 0, 0, 255))
        sheet.append(bg.convert('RGB'))
    S = Image.new('RGB', (512 * len(sheet), 512))
    for i, im in enumerate(sheet): S.paste(im, (512 * i, 0))
    S.save(f'{OUT}/leaves_sheet.jpg', quality=88)
    print('wrote', OUT)

if __name__ == '__main__':
    main()
