#!/usr/bin/env python3
# TREEUE (AR34, 2026-10-07): the leaf atlases of the second tree set (bxtrees2), for geometry leaves.
#
#   python3 tools/ar34/bxtrees/leaves2.py [--out /data0/projectnyc_aux/assets/bxtrees2/tex] [--src <scan cache>]
#
# As leaves.py (one 2 x 2 atlas per species, 1024 px cells, the CC0 ambientCG LeafSet scans, colour scaled to the web's
# calibrated linear mean, colour bled under the cut), with two changes for geometry leaves:
#   - every broadleaf species is a single leaf per cell (the sprays of the first set become leaves the generator places one
#     by one on its shoots), and the ginkgo's fan leaf is drawn here (no CC0 scan exists): a bilobed fan with dichotomous
#     veins, our own work;
#   - each cell carries the leaf's outline as a star polygon about the blade's centre (`poly`, cell uv, counter-clockwise,
#     `rim` points: 16 for the lobed plane, maple and oak, 12 for the rest), at each ray the farthest texel of the alpha cut
#     (opened by 6 px: no petiole; dilated by 2 px): the polygon holds 89-97 % of the leaf and little else (1-13 % of it is
#     bled leaf colour). `cut` 'near': the alpha cuts the true outline in Cycles and, in UE, near the lens only (past
#     ~22 m the leaf draws as its polygon, without an alpha test: no alpha flicker where leaves are a few pixels; the first
#     smoke take showed that an opaque polygon of 8 points reads as a shard within a few metres). The compound leaves
#     (honeylocust spur clusters, sophora) keep alpha cards (`cut` 'mask', the octagon of leaves.py).
# Outputs per species F into --out: F_leaf_col.png (sRGB RGBA), F_leaf_nrm.png (OpenGL normal), leaves.json (per cell: poly,
# centre, base, len, cover, poly_cover = the polygon's share of the leaf's opaque texels; per species: len in metres, cut).
import argparse, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_argv = sys.argv; sys.argv = sys.argv[:1]
import leaves as lv   # (the first set's helpers; its build runs only as a script)
sys.argv = _argv

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='/data0/projectnyc_aux/assets/bxtrees2/tex')
ap.add_argument('--src', default='/data0/projectnyc_aux/tmp/trees/src')
ap.add_argument('--only', default=None)
a = ap.parse_args()
lv.SRC = a.src
OUT = a.out
os.makedirs(OUT, exist_ok=True)
CELL, NC = lv.CELL, lv.NC
rng = np.random.default_rng(20261007)

# len: the card's length in metres (the cell's leaf from base to tip); rim: the outline's points (lobed leaves more)
SPECIES = {
    'P': {'set': '010', 'kind': 'single', 'len': 0.22, 'rim': 16, 'target': (0.0688, 0.1042, 0.0270)},   # London plane
    'M': {'set': '010', 'kind': 'single', 'len': 0.14, 'rim': 16, 'target': (0.0349, 0.0613, 0.0171)},   # Norway / red maple
    'Q': {'set': '016', 'kind': 'single', 'len': 0.13, 'rim': 16, 'target': (0.0934, 0.1364, 0.0586)},   # pin oak
    'Z': {'set': '014', 'kind': 'single', 'len': 0.085, 'rim': 12, 'target': (0.0373, 0.0662, 0.0199)},  # zelkova
    'R': {'set': '024', 'kind': 'single', 'len': 0.08, 'rim': 12, 'target': (0.0312, 0.0740, 0.0326)},   # Callery pear
    'L': {'set': '024', 'kind': 'single', 'len': 0.075, 'rim': 12, 'target': (0.0699, 0.1024, 0.0412)},  # littleleaf linden
    'Y': {'set': '014', 'kind': 'single', 'len': 0.11, 'rim': 12, 'target': (0.0378, 0.0630, 0.0182)},   # cherry
    'X': {'set': '024', 'kind': 'single', 'len': 0.07, 'rim': 12, 'target': (0.0670, 0.0178, 0.0255)},   # purple-leaf plum
    'W': {'set': '024', 'kind': 'single', 'len': 0.07, 'rim': 12, 'target': (0.0400, 0.0660, 0.0200)},   # small ornamentals
    'G': {'set': None, 'kind': 'ginkgo', 'len': 0.085, 'rim': 12, 'target': (0.0820, 0.1180, 0.0260)},   # ginkgo (drawn)
    'H': {'set': '022', 'kind': 'spur', 'len': 0.30, 'rim': 8, 'target': (0.0658, 0.0954, 0.0427), 'cut': 'mask'},     # honeylocust
    'S': {'set': '022', 'kind': 'pinnate', 'len': 0.26, 'rim': 8, 'target': (0.0874, 0.1349, 0.0602), 'cut': 'mask'},  # sophora
}

def vnoise(shape, cell, seed):
    r = np.random.default_rng(seed)
    gy, gx = shape[0] // cell + 2, shape[1] // cell + 2
    g = r.random((gy, gx)).astype(np.float32)
    return np.array(Image.fromarray(g, 'F').resize((shape[1] + 2 * cell, shape[0] + 2 * cell), Image.BICUBIC), np.float32)[cell:cell + shape[0], cell:cell + shape[1]]

def cell_ginkgo(k):
    """a ginkgo leaf: a fan (sector) from the petiole's top, bilobed by a central notch, a finely wavy outer edge, the
    dichotomous veins radiating from the base; linear colour (scaled to the target later), alpha, OpenGL normal"""
    cv = lv.Canvas()
    n = CELL
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    Y = (n - 1 - yy)                                   # px, up
    ax, ay = n / 2 + rng.uniform(-8, 8), 300.0 + rng.uniform(-20, 20)   # the fan's apex (the petiole's top)
    R0 = [560, 600, 520, 580][k] * rng.uniform(0.96, 1.02)
    half = math.radians([62, 58, 66, 55][k])
    notch = [0.24, 0.18, 0.08, 0.0][k]
    dx, dy = xx - ax, Y - ay
    r = np.hypot(dx, dy)
    phi = np.arctan2(dx, dy)                          # 0 straight up, + right
    skew = rng.uniform(-0.06, 0.06)
    p = phi - skew
    R = R0 * (1 + 0.035 * np.sin(7 * p + rng.uniform(0, 6.28))) * (1 + 0.012 * np.sin(44 * p))
    R = R * (1 - notch * np.exp(-(p / 0.075) ** 2))
    # the sides: slightly concave toward the petiole (the blade narrows into it)
    side = half * (0.82 + 0.18 * np.clip(r / (0.35 * R0), 0, 1))
    blade = (np.abs(p) < side) & (r < R) & (dy > -4)
    edge = np.clip((R - r) / 3.0, 0, 1) * np.clip((side - np.abs(p)) * r / 3.0, 0, 1)
    A = np.where(blade, edge, 0.0).astype(np.float32)
    # the petiole
    img = Image.new('F', (n, n), 0.0); d = ImageDraw.Draw(img)
    d.line([(ax, n - 1 - ay + 6), (n / 2, n - 12)], fill=1.0, width=9)
    pet = ndimage.gaussian_filter(np.array(img, np.float32), 0.7)
    # veins: dichotomous, ~ 48 at the edge, fewer near the base (they fork outward)
    nv = 18 + 30 * np.clip(r / R0, 0, 1)
    vein = np.cos(p / half * math.pi * nv / 2) ** 2
    vein = np.clip((vein - 0.82) / 0.18, 0, 1) * np.clip(r / 60.0, 0, 1)
    mott = vnoise((n, n), 48, 31 + k) - 0.5
    shade = 1.0 + 0.10 * vein + 0.10 * mott - 0.10 * np.clip(r / R0, 0, 1) ** 3 + 0.06 * np.clip(1 - r / (0.3 * R0), 0, 1)
    base = np.array([0.0820, 0.1180, 0.0260], np.float32)
    yel = np.array([0.110, 0.130, 0.022], np.float32)
    t = np.clip(0.25 + 0.5 * (mott + 0.5) * np.clip(r / R0, 0, 1), 0, 1)[..., None] * 0.35
    col = (base * (1 - t) + yel * t) * shade[..., None]
    # relief: vein ridges and a slight cup, as a height field
    h = 0.8 * vein + 3.0 * (np.clip(r / R0, 0, 1) ** 2) + 0.3 * mott
    gy_, gx_ = np.gradient(ndimage.gaussian_filter(h, 1.2))
    nrm = np.stack([-gx_ * 2.0, gy_ * 2.0, np.ones_like(h)], -1)   # (image y is down: the GL y is up)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    pc = np.array([0.075, 0.085, 0.030], np.float32)
    cv.over(0, 0, col.astype(np.float32), A, nrm.astype(np.float32))
    cv.over(0, 0, np.broadcast_to(pc, (n, n, 3)).astype(np.float32), np.clip(pet, 0, 1) * (A < 0.5), np.broadcast_to(np.array([0, 0, 1], np.float32), (n, n, 3)))
    return cv

def star_polygon(a, rim, dilate=2, opening=6):
    """the leaf's outline as a star polygon about the blade's centre: at each of `rim` rays from the centre the FARTHEST
    texel of the cut (alpha >= 0.5, opened by `opening` px so the petiole and stray texels go, dilated by `dilate` px); the
    polygon holds the leaf but for the chords' tips (89-97 %), and little else (the leak: 1-13 % of it, bled leaf colour);
    the alpha cuts the true outline (Cycles always; UE near the lens, ue_foliage.py's M_bx_foliage_mask)"""
    m = a >= 0.5
    if opening: m = ndimage.binary_opening(m, iterations=opening // 2)
    lab, nl = ndimage.label(m)
    if nl > 1:
        sizes = ndimage.sum(m, lab, range(1, nl + 1)); m = lab == (1 + int(np.argmax(sizes)))
    if dilate: m = ndimage.binary_dilation(m, iterations=dilate)
    ys, xs = np.nonzero(m)
    cy, cx = ys.mean(), xs.mean()
    pts = []
    s = np.arange(0.5, 1500, 0.5)
    for i in range(rim):
        th = 2 * math.pi * (i + 0.5) / rim - math.pi / 2   # (counter-clockwise in uv: v up, so -y in image rows)
        dx, dy = math.cos(th), -math.sin(th)
        X, Y = cx + dx * s, cy + dy * s
        ok = (X >= 0) & (X < m.shape[1]) & (Y >= 0) & (Y < m.shape[0])
        qx = np.clip(np.round(X).astype(int), 0, m.shape[1] - 1); qy = np.clip(np.round(Y).astype(int), 0, m.shape[0] - 1)
        j = np.nonzero(m[qy, qx] & ok)[0]
        rr = s[j[-1]] if len(j) else 1.0
        pts.append((cx + dx * rr, cy + dy * rr))
    uv = [[(x + 0.5) / CELL, 1.0 - (y + 0.5) / CELL] for x, y in pts]
    cen = [(cx + 0.5) / CELL, 1.0 - (cy + 0.5) / CELL]
    img = Image.new('L', (m.shape[1], m.shape[0]), 0); ImageDraw.Draw(img).polygon([(x, y) for x, y in pts], fill=1)
    pm = np.array(img, bool)
    full = a >= 0.5
    pcov = float((pm & full).sum() / max(1, full.sum()))
    leak = float((pm & ~full).sum() / max(1, pm.sum()))
    return uv, cen, pcov, leak

def main():
    meta = {'cell': CELL, 'nc': NC, 'gen': 2, 'species': {}}
    try: meta = json.load(open(f'{OUT}/leaves.json')) if a.only else meta
    except Exception: pass
    for F, sp in SPECIES.items():
        if a.only and F not in a.only.split(','): continue
        Ls = lv.load_set(sp['set']) if sp['set'] else None
        cells = []
        for k in range(NC * NC):
            if sp['kind'] == 'single': cv = lv.cell_single(Ls[[0, 1, 2, 3, 4, 5][k] % len(Ls)])
            elif sp['kind'] == 'ginkgo': cv = cell_ginkgo(k)
            elif sp['kind'] == 'spur': cv = lv.cell_pinnate(Ls, k, (11, 14), 0.115, curve=0.08, fan=int(rng.integers(5, 7)))
            else: cv = lv.cell_pinnate(Ls, k, (5, 7), 0.19, curve=0.05, fan=1)
            cells.append(cv)
        atl_c = np.zeros((CELL * NC, CELL * NC, 3), np.float32)
        atl_a = np.zeros((CELL * NC, CELL * NC), np.float32)
        atl_n = np.zeros((CELL * NC, CELL * NC, 3), np.float32)
        info = []
        for k, cv in enumerate(cells):
            A = cv.A
            col = cv.C / np.maximum(A, 1e-4)[..., None]
            nv = cv.N / np.maximum(A, 1e-4)[..., None]
            m = A >= 0.42
            mean = col[m].mean(axis=0)
            col = col * (np.asarray(sp['target'], np.float32) / np.maximum(mean, 1e-4))
            col = lv.bleed(col, A)
            nv[~m] = (0, 0, 1)
            nv = nv / np.maximum(np.linalg.norm(nv, axis=-1, keepdims=True), 1e-4)
            nv = lv.bleed(nv, A)
            cx, cy = k % NC, k // NC
            ys = slice((NC - 1 - cy) * CELL, (NC - cy) * CELL); xs = slice(cx * CELL, (cx + 1) * CELL)
            atl_c[ys, xs], atl_a[ys, xs], atl_n[ys, xs] = col, A, nv
            oc = lv.octagon(A)
            vs = [q[1] for q in oc]
            rec = {'octagon': oc, 'base': [0.5, float(min(vs))], 'len': float(max(vs) - min(vs)), 'cover': float((A >= 0.42).mean()),
                   'mean': [float(x) for x in col[m].mean(axis=0)]}
            if sp.get('cut', 'near') != 'mask':
                poly, cen, pcov, leak = star_polygon(A, sp['rim'])
                rec.update(poly=poly, centre=cen, poly_cover=round(pcov, 3), poly_leak=round(leak, 4))
            else:   # the alpha card: the octagon about its centre
                c = np.mean(np.array(oc), axis=0)
                rec.update(poly=oc, centre=[float(c[0]), float(c[1])], poly_cover=1.0, poly_leak=None)
            info.append(rec)
        rgba = np.concatenate([lv.l2s(atl_c), np.clip(atl_a, 0, 1)[..., None] * 255.0], -1).round().astype(np.uint8)
        nrm8 = ((atl_n * 0.5 + 0.5) * 255.0).round().clip(0, 255).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(f'{OUT}/{F}_leaf_col.png', compress_level=6)
        Image.fromarray(nrm8, 'RGB').save(f'{OUT}/{F}_leaf_nrm.png', compress_level=6)
        meta['species'][F] = {'set': ('ambientCG LeafSet' + sp['set']) if sp['set'] else 'drawn (TREEUE leaves2.py)', 'kind': sp['kind'],
                              'len': sp['len'], 'target': sp['target'], 'cut': sp.get('cut', 'near'), 'rim': sp['rim'], 'cells': info}
        print(F, sp['kind'], 'cover', [round(c['cover'], 3) for c in info], 'poly', [c['poly_cover'] for c in info], 'leak', [c['poly_leak'] for c in info], flush=True)
    json.dump(meta, open(f'{OUT}/leaves.json', 'w'), indent=1)
    # a contact sheet: each atlas over grey with the outlines drawn
    sheet = []
    for F in SPECIES:
        if F not in meta['species']: continue
        im = Image.open(f'{OUT}/{F}_leaf_col.png').resize((512, 512), Image.LANCZOS)
        bg = Image.new('RGBA', im.size, (200, 200, 205, 255)); bg.alpha_composite(im)
        d = ImageDraw.Draw(bg); d.text((6, 4), F, fill=(0, 0, 0, 255))
        for k, c in enumerate(meta['species'][F]['cells']):
            cx, cy = k % NC, k // NC
            P = [((cx + u) / NC * 512, (1 - (cy + v) / NC) * 512) for u, v in c['poly']]
            d.line(P + [P[0]], fill=(255, 0, 0, 255), width=1)
        sheet.append(bg.convert('RGB'))
    S = Image.new('RGB', (512 * 6, 512 * ((len(sheet) + 5) // 6)), (40, 40, 40))
    for i, im in enumerate(sheet): S.paste(im, (512 * (i % 6), 512 * (i // 6)))
    S.save(f'{OUT}/leaves_sheet.jpg', quality=88)
    print('wrote', OUT)

if __name__ == '__main__':
    main()
