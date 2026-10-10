# TREEUE (AR34, 2026-10-07): the second tree set's generator (numpy only; Blender's Python runs it in build_trees2.py, so
# does any Python 3 with numpy). It grows the first set's trees (treegen.py: the species' habit as a lumpy envelope, trunk,
# scaffolds, secondaries, tertiaries and twigs, pipe-model radii, crown gaps) with:
#   sizes     'y' young (the pools' suffix 9: a nursery tree on a central leader), 'm' mature, 'l' large (an older tree:
#             a heavier, lower, more lopsided crown on more and gnarlier scaffolds, a thicker flared trunk), each normalised
#             to the same pool box, so the pool's matrices place it unchanged;
#   variants  seeded per species, size and variant (habit terms, scaffold count and angles, gaps all follow the seed);
#   ginkgo    G, the web's columnar form (whorled ascending limbs on a leader), its fan leaves in spur clusters of 3-5;
#   leaves    geometry: one star polygon per leaf (leaves2.py's outline of the scanned or drawn leaf, 10-14 rim points, a
#             fan about the blade's centre), folded on its midrib and drooping toward its tip, drawn opaque (no alpha test);
#             the compound leaves (honeylocust spur clusters, sophora) stay alpha cards (their octagon). Leaves sit on the
#             twigs and the tertiaries' tips, shade leaves inside the crown 15 % larger than the sun leaves on its shell; the
#             count follows the species' leaf area index over the crown's disc within a per-tree budget (leaves grow up to
#             1.75x before the area is cut);
#   data      per leaf vertex st1 = (a random value per leaf, the leaf's depth in the crown 0 inside .. 1 on the shell), for
#             the shaders' per-leaf hue and the inner crown's shade; bark vertices st1 = (0.5, 1).
import math
import numpy as np
import treegen as tg

TAU = tg.TAU
FORMS = dict(tg.FORMS)
# the web's ginkgo (furnitureKit.js TREE_FORMS G): columnar-irregular, sparse, ascending limbs on a leader, spur clusters
FORMS['G'] = dict(name='ginkgo', profile='columnar', crownBase=0.22, lump=0.2, lopside=0.08, trunkR=0.02, lean=0.02, excurrent=True,
                  leader=0.9, scaffolds=(6, 9), whorlAngle=(62, 34), scafReach=(0.78, 0.96), scafUp=0.05, gnarl=(0.02, 0.07, 0.14, 0.2, 0.25),
                  d2=2.0, a2=(28, 50), l2=0.42, d3=4.0, a3=(30, 55), l3=(0.3, 0.9), d4=9, l4=(0.04, 0.10),
                  gap=(0.5, 2.0, 0.44), shell=0.55, leafK=7.0, fold=4, droop=0.08, gravity=0.0, bark='ginkgo', lai=3.0, spur=(3, 5))
# per species: the leaf budget (leaves on a mature tree) and the shoot density boost for the second set
BUDGET = {'y': 26000, 'm': 64000, 'l': 78000}
LEAF_SCALE_MAX = 1.75   # (small leaves grow to meet the leaf area within the budget; at 10 m a 15 cm leaf reads as a leaf)

def form(F, size):
    f = dict(FORMS[F])
    # (the second set's crowns: the first set's read sparse at street level (gaps of whole tertiaries, leaves spread through
    # the crown's volume, blades facing the sky so edge-on from the street); fewer gaps, leaves pushed to the shell, more
    # leaf area)
    gs, gc, gt = f['gap']
    f.update(gap=(gs * 0.55, gc, gt), shell=min(f['shell'], 0.45), lai=f.get('lai', 4.0) * 1.15)
    if F == 'M': f['scafEase'] = True     # (a scaffold that leaves the envelope early turns up instead of stopping: 4-6 limbs)
    if F == 'Q': f['leafK'] = 7.0
    if size == 'y':
        f.update(tg.YOUNG)
        if F in ('H', 'Z'): f.update(profile='vase', excurrent=False, scaffolds=(5, 7), forkSpread=0.25, scafAngle=(14, 30))
        if F == 'Q': f.update(profile='pyramid', whorlAngle=(88, 45))
        if F == 'G': f.update(profile='columnar', whorlAngle=(55, 30), scaffolds=(6, 8))
    elif size == 'l':
        s0, s1 = f['scaffolds']
        f.update(trunkR=f['trunkR'] * 1.32, scaffolds=(s0 + 1, s1 + 2), lump=f.get('lump', 0.12) + 0.05, lopside=f.get('lopside', 0.06) * 1.5,
                 crownBase=f['crownBase'] * 0.88, d2=f['d2'] * 1.15, l2=f['l2'] * 1.1, lean=f.get('lean', 0.03) * 1.3)
        g = f.get('gnarl', (0.03, 0.12, 0.2, 0.28, 0.3))
        f['gnarl'] = (g[0] * 1.2, g[1] * 1.35, g[2] * 1.3, g[3] * 1.15, g[4])
        if f.get('excurrent'): f['leader'] = f.get('leader', 0.9) * 0.9
    return f

class Tree2(tg.Tree):
    def __init__(self, F, size, H, W, seed, leafmeta):
        self.F, self.size = F, size
        self.f = form(F, size)
        self.H, self.W = H, W
        self.rng = np.random.default_rng(seed)
        self.env = tg.Envelope(self.f, H, W, self.rng)
        self.gapn = tg.Noise3(seed + 7, self.f['gap'][1])
        self.lm = leafmeta
        self.B = []

    def radii(self, e=2.3):
        super().radii(e)
        if self.size == 'l':   # an older trunk: a wider root flare
            b = self.B[0]
            y = b['pts'][:, 1]
            b['r'] = b['r'] * (1 + 0.35 * np.clip(1 - y / 1.1, 0, 1) ** 2)

    def leaves(self):
        f, rng, env = self.f, self.rng, self.env
        sp = self.lm
        Lm = sp['len']
        cells = sp['cells']
        opaque = sp.get('cut', 'near') != 'mask'   # (a drawn polygon per leaf: its area is the leaf's)
        pos, ax, sd, nm, cell, sz, depth = [], [], [], [], [], [], []
        hosts = [k for k in self.levels['tw']] + [k for k in self.levels['ter'] if not self.B[k].get('gap')]
        spur = f.get('spur')
        if spur:   # spur shoots on the older wood too (the ginkgo's leaves crowd the limbs)
            hosts += [k for k in self.levels['sec']]
        up = np.array([0.0, 1.0, 0.0])
        for k in hosts:
            b = self.B[k]
            L = self.blen(b)
            lvl = b['lvl']
            dens = 5.0 * f['leafK'] / Lm * (1.0 if lvl == 4 else 0.45 if lvl == 3 else 0.25)   # (candidates: 5x, thinned to the LAI below)
            if spur: dens /= (spur[0] + spur[1]) / 2.0   # (per cluster)
            n = int(round(dens * L * rng.uniform(0.8, 1.2)))
            if n <= 0: continue
            s0 = 0.25 if lvl == 4 else 0.55 if lvl == 3 else 0.35
            psi = rng.uniform(0, TAU)
            for j in range(n):
                s = s0 + (1 - s0) * (j + rng.random()) / n
                p, d, _ = self.sample(k, s)
                rr = float(env.ratio(p))
                if rng.random() > f['shell'] + (1 - f['shell']) * min(1.0, rr) ** 2: continue
                nclu = int(rng.integers(spur[0], spur[1] + 1)) if spur else 1
                for c in range(nclu):
                    psi += tg.GOLD + rng.uniform(-0.2, 0.2)
                    a = math.radians(rng.uniform(40, 75) if not spur else rng.uniform(25, 70))
                    u = tg.nrm(np.cross(d, up) if abs(d[1]) < 0.95 else np.cross(d, [1.0, 0, 0]))
                    v = np.cross(d, u)
                    axis = tg.nrm(d * math.cos(a) + (u * math.cos(psi) + v * math.sin(psi)) * math.sin(a))
                    cx, cz = env.centre(p[1])
                    o = np.array([p[0] - cx, 0, p[2] - cz]); ol = np.linalg.norm(o)
                    o = o / ol if ol > 1e-3 else np.zeros(3)
                    tgt = tg.nrm(up * 0.55 + o * 0.85 + rng.normal(0, 0.4, 3))   # (facing out of the crown as much as up)
                    side = np.cross(tgt, axis)
                    if np.linalg.norm(side) < 1e-3: side = u
                    side = tg.nrm(side)
                    nn = tg.nrm(np.cross(axis, side))
                    if nn[1] < -0.2: side, nn = -side, -nn
                    pos.append(p + (axis * rng.uniform(0.0, 0.015) if spur else 0)); ax.append(axis); sd.append(side); nm.append(nn)
                    cell.append(int(rng.integers(4)))
                    # shade leaves (inside) larger than the sun leaves on the shell
                    sz.append(rng.uniform(0.85, 1.15) * (1.15 - 0.25 * min(1.0, rr)))
                    depth.append(min(1.3, rr))
        cell = np.array(cell, np.int32); sz = np.array(sz)
        # leaf area per card: the drawn polygon's area (opaque) or the cell's opaque share (alpha cards), in m2
        def poly_area(P):
            P = np.asarray(P); x, y = P[:, 0], P[:, 1]
            return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
        if opaque: a_cell = np.array([poly_area(c['poly']) for c in cells])
        else: a_cell = np.array([c['cover'] for c in cells])
        cl = np.array([c['len'] for c in cells])
        disc = math.pi * (0.5 * self.W) ** 2
        target = f.get('lai', 4.0) * disc
        budget = BUDGET.get(self.size, 80000)
        # leaves grow (up to 1.45x) before the leaf area is cut to the budget
        self.leaf_scale = 1.0
        area1 = a_cell[cell] * (Lm * sz / cl[cell]) ** 2
        n_need = target / max(1e-9, area1.mean())
        if n_need > budget:
            self.leaf_scale = float(min(LEAF_SCALE_MAX, math.sqrt(n_need / budget)))
        sz = sz * self.leaf_scale
        area = a_cell[cell] * (Lm * sz / cl[cell]) ** 2
        keep = np.ones(len(area), bool)
        if area.sum() > target:
            keep = rng.random(len(area)) < target / area.sum()
        if keep.sum() > budget:
            idx = np.nonzero(keep)[0]; keep[:] = False; keep[rng.choice(idx, budget, replace=False)] = True
        self.lai = float(area[keep].sum() / disc)
        sel = np.nonzero(keep)[0]
        self.leafs = dict(pos=np.array(pos)[sel], axis=np.array(ax)[sel], side=np.array(sd)[sel], nrm=np.array(nm)[sel], cell=cell[sel],
                          size=sz[sel], depth=np.array(depth)[sel], rand=rng.random(len(sel)))
        return self.leafs

def leaf_mesh(tree, sel=None, scale=1.0, fold_deg=None, droop=None):
    """one star polygon (a fan about the blade's centre: rim + 1 vertices, rim triangles) per leaf, folded on the midrib and
    drooping; uv in the species' 2 x 2 atlas; st1 = (the leaf's random value, its depth in the crown)"""
    Lf = tree.leafs
    sp = tree.lm
    if sel is None: sel = np.arange(len(Lf['pos']))
    nL = len(sel)
    fold = math.radians(tree.f['fold'] if fold_deg is None else fold_deg)
    dr = tree.f['droop'] if droop is None else droop
    cells = sp['cells']
    R = len(cells[0]['poly'])
    poly = np.array([[c['centre']] + c['poly'] for c in cells], np.float64)   # (4, R+1, 2)
    basev = np.array([c['base'][1] for c in cells]); lens = np.array([c['len'] for c in cells])
    ci = Lf['cell'][sel]
    uvc = poly[ci]                                                         # (nL, R+1, 2)
    k = (sp['len'] * Lf['size'][sel] * scale / lens[ci])[:, None]
    x = (uvc[..., 0] - 0.5) * k
    y = (uvc[..., 1] - basev[ci][:, None]) * k
    Lr = sp['len'] * Lf['size'][sel] * scale
    z = np.abs(x) * math.tan(fold) - dr * (y ** 2) / Lr[:, None]
    p0 = Lf['pos'][sel][:, None, :]; A = Lf['axis'][sel][:, None, :]; S = Lf['side'][sel][:, None, :]; Nn = Lf['nrm'][sel][:, None, :]
    V = p0 + S * x[..., None] + A * y[..., None] + Nn * z[..., None]
    sgn = np.sign(x)[..., None]
    VN = Nn * math.cos(fold) - S * sgn * math.sin(fold)
    VN = VN / np.linalg.norm(VN, axis=-1, keepdims=True)
    cx, cy = ci % 2, ci // 2
    U = (cx[:, None] + uvc[..., 0]) / 2.0
    Vv = (cy[:, None] + uvc[..., 1]) / 2.0
    # a fan about the centre (vertex 0), wound so the face normal is the blade's +n (the rim runs counter-clockwise in
    # (side, axis), whose own normal is -n: as treegen.leaf_mesh)
    i = np.arange(R)
    tri = np.stack([np.zeros(R, np.int64), 1 + (i + 1) % R, 1 + i], -1)
    I = (np.arange(nL)[:, None, None] * (R + 1) + tri[None]).reshape(-1, 3)
    st1 = np.stack([np.repeat(Lf['rand'][sel][:, None], R + 1, 1), np.repeat(np.clip(Lf['depth'][sel], 0, 1)[:, None], R + 1, 1)], -1)
    d = Lf['depth'][sel]
    shade = 0.45 + 0.55 * np.clip(d, 0, 1) ** 1.5
    C = np.repeat(shade[:, None], R + 1, axis=1)
    return dict(P=V.reshape(-1, 3).astype(np.float32), N=VN.reshape(-1, 3).astype(np.float32),
                UV=np.stack([U, Vv], -1).reshape(-1, 2).astype(np.float32), UV1=st1.reshape(-1, 2).astype(np.float32),
                I=I.astype(np.uint32), C=C.reshape(-1).astype(np.float32))

def tube_mesh(tree, **kw):
    M = tg.tube_mesh(tree, **kw)
    M['UV1'] = np.tile(np.array([[0.5, 1.0]], np.float32), (len(M['P']), 1))
    return M

def build(F, size, H, W, seed, leafmeta):
    t = Tree2(F, size, H * 0.97, W * 0.92, seed, leafmeta).build()
    t.leaves()
    tg.normalise(t, H, W)
    return t
