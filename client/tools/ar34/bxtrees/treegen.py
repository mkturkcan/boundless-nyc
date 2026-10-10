# BX-TREES (AR34 BX, 2026-10-02): the street-tree generator of the asset set (numpy only; Blender's Python runs it, so does
# any Python 3 with numpy).
#
# A tree is grown from its species' habit, one level deeper than the web:
# envelope a surface of revolution R(t, azimuth) per habit (broad, vase, pyramid, oval, round, columnar), lumpy and
# lopsided per seed; branches are steered along it and stop at it;
# levels trunk (to a fork, or a leader to the top), scaffold limbs, secondaries, tertiaries and twigs (levels 0-4);
# leaves only on the twigs and the tertiaries' tips, so the crown's leaf mass sits in clumps on its shell;
# gaps a two-octave value noise over the crown drops whole tertiaries (sky between the clumps: the web's TR39);
# radii the pipe model: a branch's radius at a node goes with the twig tips it carries (exponent 2.3), scaled so the
# trunk's base radius is the species' (trunkR x height), with a root flare;
# leaves one card per leaf (or per compound leaf / spray, by the species' atlas), the octagon of leaves.json, folded
# on its midrib and drooping toward its tip, its blade turned toward the sky and outward.
# Output (Y up, metres, the trunk's base at the origin, normalised to the height and crown width the caller passes, which
# are the web's pool box at instance scale 1): per LOD a bark mesh and a leaf mesh as numpy arrays.
import math
import numpy as np

TAU = 2 * math.pi
GOLD = 2.39996323

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def nrm(v):
    v = np.asarray(v, np.float64)
    return v / max(1e-12, float(np.linalg.norm(v)))

class Noise3:
    """a smooth value noise (trilinear over a hashed lattice), two octaves"""
    def __init__(self, seed, cell):
        self.r = np.random.default_rng(seed).random(4096)
        self.cell = cell
    def _v(self, ix, iy, iz):
        h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
        return self.r[np.asarray(h) % 4096]
    def _oct(self, p):
        p = np.asarray(p, np.float64)
        f = np.floor(p).astype(np.int64)
        t = p - f
        t = t * t * (3 - 2 * t)
        out = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (t[..., 0] if dx else 1 - t[..., 0]) * (t[..., 1] if dy else 1 - t[..., 1]) * (t[..., 2] if dz else 1 - t[..., 2])
                    out = out + w * self._v(f[..., 0] + dx, f[..., 1] + dy, f[..., 2] + dz)
        return out
    def __call__(self, p):
        p = np.asarray(p, np.float64) / self.cell
        return 0.65 * self._oct(p) + 0.35 * self._oct(p * 2.03 + 17.1)

# ---------------------------------------------------------------- habits
def profile(name, t):
    """relative crown radius at t (0 crown base .. 1 top)"""
    t = np.clip(t, 0.0, 1.0)
    if name == 'broad':
        return np.power(np.sin(math.pi * np.power(t, 0.85)), 0.62)
    if name == 'round':
        return np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) ** 0.85
    if name == 'oval':
        u = (t - 0.42) / np.where(t < 0.42, 0.42, 0.58)
        return np.sqrt(np.clip(1 - u * u, 0, 1)) ** 0.8
    if name == 'vase':
        lo = 0.28 + 0.72 * np.sin(np.clip(t / 0.72, 0, 1) * math.pi / 2)
        hi = np.sqrt(np.clip(1 - ((t - 0.72) / 0.28) ** 2, 0, 1))
        return np.where(t < 0.72, lo, hi) ** 0.9
    if name == 'pyramid':
        return np.clip(np.power(1 - t, 0.8) * smooth(-0.15, 0.12, t) * 1.05, 0, 1)
    if name == 'columnar':
        return 0.62 * np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) ** 0.5
    if name == 'spreading':
        return np.power(np.sin(math.pi * np.power(t, 0.7)), 0.5)
    return np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))

class Envelope:
    def __init__(self, F, H, W, rng):
        self.F, self.H, self.W = F, H, W
        self.yb = F['crownBase'] * H
        self.cH = H - self.yb
        self.prof = F['profile']
        self.lump = F.get('lump', 0.12)
        self.terms = [(int(rng.integers(1, 4)), rng.uniform(0, TAU), rng.uniform(0.5, 2.0), rng.uniform(0, TAU), rng.uniform(0.5, 1.0)) for _ in range(5)]
        la = rng.uniform(0, TAU); lo = F.get('lopside', 0.06) * W
        self.off = (math.cos(la) * lo, math.sin(la) * lo)
    def centre(self, y):
        t = np.clip((np.asarray(y) - self.yb) / self.cH, 0, 1)
        return self.off[0] * t, self.off[1] * t
    def R(self, y, az):
        t = (np.asarray(y, np.float64) - self.yb) / self.cH
        n = 0
        for m, ph, k, ps, a in self.terms:
            n = n + a * np.sin(m * az + ph) * np.cos(k * math.pi * t + ps)
        n = n / 2.2
        r = 0.5 * self.W * profile(self.prof, t) * (1 + self.lump * n)
        return np.where((t < -0.02) | (t > 1.0), 0.0, r)
    def ratio(self, p):
        """|p - axis| / R at p's height (>1 outside); above the top or below the base: large"""
        p = np.asarray(p, np.float64)
        cx, cz = self.centre(p[..., 1])
        dx, dz = p[..., 0] - cx, p[..., 2] - cz
        r = np.hypot(dx, dz)
        R = self.R(p[..., 1], np.arctan2(dz, dx))
        return np.where(R > 1e-3, r / np.maximum(R, 1e-3), 9.0)
    def inside(self, p, k=1.0):
        return self.ratio(p) <= k
    def reach(self, p, d, maxd):
        """distance along d from p to the envelope's surface"""
        s = np.arange(0.15, maxd, 0.15)
        q = np.asarray(p)[None, :] + s[:, None] * np.asarray(d)[None, :]
        out = ~self.inside(q, 1.0)
        i = np.argmax(out) if out.any() else len(s) - 1
        return float(s[i])

# ---------------------------------------------------------------- species (heights and widths come from the caller)
# profile / crownBase / scaffolds as the web's TREE_FORMS; the levels' densities (per metre), angles (deg from the parent) and
# lengths are this generator's; leaf: the atlas species (leaves.json), its card length, the cards per twig metre, the blade's
# fold and droop; bark: the scan set (blender_trees.py / the web's bark maps).
FORMS = {
    'P': dict(name='London plane', profile='broad', crownBase=0.27, lump=0.15, lopside=0.08, trunkR=0.019, lean=0.04, excurrent=False,
              scaffolds=(5, 7), forkSpread=0.35, scafAngle=(28, 60), scafReach=(0.85, 0.97), scafUp=0.06,
              d2=2.4, a2=(35, 65), l2=0.40, d3=4.2, a3=(35, 70), l3=(0.5, 1.5), d4=10, l4=(0.12, 0.32),
              gap=(0.6, 2.4, 0.40), shell=0.6, leafK=6.0, fold=14, droop=0.25, gravity=0.04, bark='plane', lai=4.2),
    'H': dict(name='honeylocust', profile='vase', crownBase=0.30, lump=0.18, lopside=0.10, trunkR=0.017, lean=0.06, excurrent=False,
              scaffolds=(3, 5), forkSpread=0.2, scafAngle=(18, 42), scafReach=(0.88, 0.98), scafUp=0.04, gnarl=(0.03, 0.2, 0.3, 0.35, 0.4),
              d2=1.8, a2=(40, 70), l2=0.42, d3=3.8, a3=(40, 75), l3=(0.5, 1.5), d4=8, l4=(0.12, 0.30),
              gap=(0.6, 2.4, 0.42), shell=0.5, leafK=7.0, fold=8, droop=0.35, gravity=0.06, bark='willow', lai=2.6),
    'Q': dict(name='pin oak', profile='pyramid', crownBase=0.22, lump=0.10, lopside=0.05, trunkR=0.017, lean=0.02, excurrent=True,
              leader=0.96, scaffolds=(12, 16), whorlAngle=(100, 45), scafReach=(0.82, 0.96), scafUp=-0.02,
              d2=2.0, a2=(35, 60), l2=0.30, d3=3.8, a3=(35, 65), l3=(0.4, 1.2), d4=9, l4=(0.10, 0.28),
              gap=(0.4, 2.6, 0.38), shell=0.7, leafK=5.0, fold=12, droop=0.2, gravity=0.02, bark='oak', lai=4.6),
    'Z': dict(name='zelkova', profile='vase', crownBase=0.24, lump=0.12, lopside=0.06, trunkR=0.017, lean=0.03, excurrent=False,
              scaffolds=(5, 8), forkSpread=0.2, scafAngle=(14, 34), scafReach=(0.9, 0.98), scafUp=0.05,
              d2=2.2, a2=(30, 60), l2=0.34, d3=4.0, a3=(35, 65), l3=(0.4, 1.3), d4=9, l4=(0.10, 0.28),
              gap=(0.45, 2.6, 0.40), shell=0.7, leafK=4.5, fold=10, droop=0.3, gravity=0.05, bark='zelkova', lai=4.2),
    'R': dict(name='Callery pear', profile='oval', crownBase=0.20, lump=0.08, lopside=0.04, trunkR=0.016, lean=0.02, excurrent=False,
              scaffolds=(6, 9), forkSpread=0.14, scafAngle=(10, 30), scafReach=(0.88, 0.97), scafUp=0.08,
              d2=2.4, a2=(25, 50), l2=0.30, d3=4.0, a3=(30, 55), l3=(0.35, 1.0), d4=9, l4=(0.08, 0.22),
              gap=(0.3, 2.2, 0.32), shell=0.75, leafK=4.0, fold=12, droop=0.15, gravity=0.0, bark='pear', lai=4.8),
    'L': dict(name='littleleaf linden', profile='oval', crownBase=0.20, lump=0.08, lopside=0.04, trunkR=0.016, lean=0.02, excurrent=True,
              leader=0.85, scaffolds=(10, 14), whorlAngle=(85, 45), scafReach=(0.82, 0.96), scafUp=0.0,
              d2=2.2, a2=(35, 60), l2=0.28, d3=4.0, a3=(35, 60), l3=(0.35, 1.1), d4=9, l4=(0.10, 0.26),
              gap=(0.3, 2.4, 0.34), shell=0.75, leafK=4.0, fold=10, droop=0.25, gravity=0.03, bark='linden', lai=4.8),
    'M': dict(name='Norway / red maple', profile='broad', crownBase=0.24, lump=0.10, lopside=0.06, trunkR=0.018, lean=0.03, excurrent=False,
              scaffolds=(4, 6), forkSpread=0.3, scafAngle=(40, 66), scafReach=(0.85, 0.96), scafUp=0.05,
              d2=2.4, a2=(35, 60), l2=0.34, d3=4.2, a3=(35, 60), l3=(0.4, 1.3), d4=10, l4=(0.10, 0.28),
              gap=(0.35, 2.4, 0.36), shell=0.75, leafK=4.0, fold=12, droop=0.25, gravity=0.03, bark='maple', lai=5.0),
    'S': dict(name='sophora', profile='broad', crownBase=0.30, lump=0.14, lopside=0.07, trunkR=0.017, lean=0.04, excurrent=False,
              scaffolds=(4, 6), forkSpread=0.26, scafAngle=(40, 66), scafReach=(0.85, 0.96), scafUp=0.04,
              d2=2.0, a2=(35, 65), l2=0.38, d3=3.8, a3=(35, 70), l3=(0.5, 1.5), d4=8, l4=(0.12, 0.30),
              gap=(0.5, 2.4, 0.40), shell=0.6, leafK=6.0, fold=8, droop=0.3, gravity=0.05, bark='linden', lai=3.4),
    'Y': dict(name='cherry', profile='spreading', crownBase=0.24, lump=0.14, lopside=0.08, trunkR=0.017, lean=0.05, excurrent=False,
              scaffolds=(3, 5), forkSpread=0.16, scafAngle=(35, 58), scafReach=(0.85, 0.97), scafUp=0.03,
              d2=2.2, a2=(35, 65), l2=0.40, d3=4.0, a3=(35, 70), l3=(0.4, 1.3), d4=10, l4=(0.10, 0.26),
              gap=(0.4, 2.2, 0.38), shell=0.65, leafK=4.0, fold=10, droop=0.3, gravity=0.04, bark='cherry', lai=4.0),
    'X': dict(name='purple-leaf plum', profile='broad', crownBase=0.25, lump=0.12, lopside=0.07, trunkR=0.02, lean=0.05, excurrent=False,
              scaffolds=(3, 5), forkSpread=0.18, scafAngle=(35, 60), scafReach=(0.85, 0.97), scafUp=0.04,
              d2=2.4, a2=(35, 60), l2=0.40, d3=4.2, a3=(35, 65), l3=(0.3, 1.0), d4=10, l4=(0.08, 0.22),
              gap=(0.35, 2.0, 0.36), shell=0.7, leafK=4.0, fold=10, droop=0.2, gravity=0.03, bark='cherry', lai=4.2),
    'W': dict(name='small ornamental', profile='spreading', crownBase=0.25, lump=0.16, lopside=0.10, trunkR=0.019, lean=0.06, excurrent=False,
              scaffolds=(3, 6), forkSpread=0.2, scafAngle=(30, 62), scafReach=(0.85, 0.97), scafUp=0.03,
              d2=2.4, a2=(35, 65), l2=0.40, d3=4.2, a3=(35, 65), l3=(0.3, 1.0), d4=10, l4=(0.08, 0.22),
              gap=(0.4, 2.0, 0.38), shell=0.7, leafK=4.0, fold=10, droop=0.25, gravity=0.04, bark='oak', lai=3.8),
}
# young street trees (the web's suffix-9 pools): a nursery tree on a central leader, limbed up high, a narrow sparse egg
YOUNG = dict(profile='oval', crownBase=0.36, lump=0.18, lopside=0.1, trunkR=0.011, lean=0.03, excurrent=True, leader=0.92,
             scaffolds=(8, 11), whorlAngle=(62, 36), scafReach=(0.8, 0.95), scafUp=0.02, l2=0.26, d3=4.0, d4=10, gap=(0.25, 2.0, 0.3), shell=0.75)

def form(F, size):
    f = dict(FORMS[F])
    if size == 'y':
        f.update(YOUNG)
        if F in ('H', 'Z'): f.update(profile='vase', excurrent=False, scaffolds=(5, 7), forkSpread=0.25, scafAngle=(14, 30))
        if F == 'Q': f.update(profile='pyramid', whorlAngle=(88, 45))
    return f

# ---------------------------------------------------------------- skeleton
class Tree:
    def __init__(self, F, size, H, W, seed, leafmeta):
        self.F, self.size = F, size
        self.f = form(F, size)
        self.H, self.W = H, W
        self.rng = np.random.default_rng(seed)
        self.env = Envelope(self.f, H, W, self.rng)
        self.gapn = Noise3(seed + 7, self.f['gap'][1])
        self.lm = leafmeta
        self.B = []   # branches: dict(lvl, pts (n,3), parent, pidx, kids [(node, branch)])

    def grow(self, p0, d0, length, lvl, parent=-1, pidx=0):
        f, env, rng = self.f, self.env, self.rng
        step = [0.45, 0.4, 0.3, 0.18, 0.07][lvl]
        n = max(2, int(math.ceil(length / step)))
        seg = length / n
        gn = f.get('gnarl', (0.03, 0.12, 0.2, 0.28, 0.3))[lvl]
        trop = [0.0, f.get('scafUp', 0.04), 0.03, 0.02 - f.get('gravity', 0.03), 0.06][lvl]
        p = np.array(p0, np.float64); d = nrm(d0)
        pts = [p.copy()]
        for i in range(1, n + 1):
            d = d + np.array([0, trop * seg, 0]) + rng.normal(0, gn * 0.5, 3) * np.array([1, 0.5, 1]) * min(1.0, seg / 0.3)
            d = nrm(d)
            q = p + d * seg
            # (scafEase, the round habits: a scaffold leaving the fork at 40-66 deg is outside a crown that is narrow at its
            # base after a step and stopped there (the first sophora and maple were two stubs and a limb); for its first 35 %
            # it is turned up instead and never stopped)
            if f.get('scafEase') and lvl == 1 and i * seg < 0.35 * length and not env.inside(q, 1.0):
                d = nrm(d + np.array([0, 0.45, 0])); q = p + d * seg
            elif lvl >= 1 and i > 1 and not env.inside(q, 1.0):
                cx, cz = env.centre(q[1])
                o = np.array([q[0] - cx, 0, q[2] - cz]); ol = np.linalg.norm(o) or 1.0
                o /= ol
                do = float(d @ o)
                if do > 0: d = d - o * do * 1.15
                if q[1] > self.H * 0.97: d[1] = min(d[1], -0.1)
                d = nrm(d)
                q = p + d * seg
                if not env.inside(q, 1.06): break
            p = q
            pts.append(p.copy())
        if len(pts) < 2: return -1
        b = dict(lvl=lvl, pts=np.array(pts), parent=parent, pidx=pidx, kids=[])
        self.B.append(b)
        k = len(self.B) - 1
        if parent >= 0: self.B[parent]['kids'].append((pidx, k))
        return k

    @staticmethod
    def blen(b):
        return float(np.linalg.norm(np.diff(b['pts'], axis=0), axis=1).sum())

    def sample(self, bi, s):
        """point, tangent and node index at the arc fraction s"""
        P = self.B[bi]['pts']
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
        cum = np.concatenate([[0], np.cumsum(seg)])
        L = cum[-1]
        x = np.clip(s, 0, 1) * L
        i = int(np.clip(np.searchsorted(cum, x) - 1, 0, len(seg) - 1))
        t = (x - cum[i]) / max(seg[i], 1e-9)
        return P[i] + (P[i + 1] - P[i]) * t, nrm(P[i + 1] - P[i]), (i + 1 if t > 0.5 else i)

    def children(self, bi, lvl, dens, ang, lenf, s0=0.15, shell_bias=0.0):
        """lateral branches of level lvl along branch bi: phyllotaxis, outward / up bias, length to the envelope"""
        f, env, rng = self.f, self.env, self.rng
        b = self.B[bi]
        L = self.blen(b)
        n = int(round(dens * L * rng.uniform(0.8, 1.2)))
        psi = rng.uniform(0, TAU)
        out = []
        for k in range(n):
            s = s0 + (1 - s0) * min(1.0, (k + 0.15 + 0.7 * rng.random()) / max(1, n))
            p, d, node = self.sample(bi, s)
            psi += GOLD + rng.uniform(-0.3, 0.3)
            # a direction at `a` degrees from the parent, turned psi about it
            a = math.radians(rng.uniform(*ang))
            u = nrm(np.cross(d, [0.0, 1.0, 0.0]) if abs(d[1]) < 0.95 else np.cross(d, [1.0, 0.0, 0.0]))
            v = np.cross(d, u)
            cd = d * math.cos(a) + (u * math.cos(psi) + v * math.sin(psi)) * math.sin(a)
            cx, cz = env.centre(p[1])
            o = np.array([p[0] - cx, 0, p[2] - cz]); ol = np.linalg.norm(o)
            if ol > 1e-3: cd = cd + o / ol * 0.35
            cd = nrm(cd + np.array([0, 0.1 if lvl < 4 else 0.25, 0]))
            if cd[1] < -0.6: cd = nrm(np.array([cd[0], -0.6, cd[2]]))
            if callable(lenf): ln = lenf(p, cd, s)
            else: ln = lenf
            if ln < 0.06: continue
            k2 = self.grow(p, cd, ln, lvl, bi, node)
            if k2 >= 0: out.append(k2)
        return out

    def build(self):
        f, env, rng, H, W = self.f, self.env, self.rng, self.H, self.W
        yb, cH = env.yb, env.cH
        ex = f['excurrent']
        # ---- trunk
        topY = yb + (f.get('leader', 0.95) * cH if ex else rng.uniform(0.03, 0.10) * cH)
        la = rng.uniform(0, TAU); lean = f.get('lean', 0.03) * rng.uniform(0.3, 1.0)
        n = 14 if ex else 9
        pts = []
        ph1, ph2 = rng.uniform(0, TAU, 2)
        for i in range(n + 1):
            t = i / n
            y = -0.12 + t * (topY + 0.12)
            cx, cz = env.centre(y)
            pull = smooth(0.1, 1.0, t)
            wig = 0.012 * H * t
            x = math.cos(la) * lean * y + math.sin(y * 0.9 + ph1) * wig + cx * pull * 0.85
            z = math.sin(la) * lean * y + math.sin(y * 0.7 + ph2) * wig + cz * pull * 0.85
            pts.append([x, y, z])
        self.B.append(dict(lvl=0, pts=np.array(pts), parent=-1, pidx=0, kids=[]))
        # ---- scaffolds
        nS = int(rng.integers(f['scaffolds'][0], f['scaffolds'][1] + 1))
        az0 = rng.uniform(0, TAU)
        scaf = []
        for i in range(nS):
            if ex:
                t = np.clip((i + 0.5 + rng.uniform(-0.35, 0.35)) / nS, 0.02, 0.98)
                y0 = yb - 0.02 * cH + t * (topY - yb) * 0.92
                e = f['whorlAngle']; elev = e[0] + (e[1] - e[0]) * t + rng.uniform(-8, 8)
                az = az0 + i * GOLD + rng.uniform(-0.25, 0.25)
            else:
                # (never below the crown base: a scaffold born where the envelope has no width dies after a step; the first
                # maple kept 0 of its 4 scaffolds, forkSpread 0.3 of the crown's height reached 2.6 m under the base)
                y0 = max(topY - rng.random() * f.get('forkSpread', 0.15) * cH, min(topY, yb + 0.02 * cH))
                e = f['scafAngle']; elev = rng.uniform(e[0], e[1])
                az = az0 + i / nS * TAU + rng.uniform(-0.3, 0.3) * TAU / nS
            s = np.clip((y0 + 0.12) / (topY + 0.12), 0, 1)
            p, _, node = self.sample(0, s)
            er = math.radians(elev)
            d = nrm([math.sin(er) * math.cos(az), math.cos(er), math.sin(er) * math.sin(az)])
            reach = env.reach(p, d, 2.5 * max(W, cH))
            ln = max(0.3 * cH, reach * rng.uniform(*f['scafReach']))
            k = self.grow(p, d, ln, 1, 0, node)
            if k >= 0: scaf.append(k)
        bearers = scaf + ([0] if ex else [])
        # ---- secondaries
        sec = []
        for bi in bearers:
            def l2(p, d, s, bi=bi):
                r = env.reach(p, d, 1.6 * W)
                return min(f['l2'] * W, r * rng.uniform(0.55, 0.95)) * (1 - 0.3 * s)
            s0 = 0.2 if bi != 0 else max(0.0, (yb + 0.1 * cH + 0.12) / (topY + 0.12))
            sec += self.children(bi, 2, f['d2'], f['a2'], l2, s0=s0)
        # ---- tertiaries (dropped whole in the crown's gaps)
        ter = []
        gs, _, gth = f['gap']
        for bi in sec + scaf:
            def l3(p, d, s):
                r = env.reach(p, d, 3.0)
                return min(rng.uniform(*f['l3']), r * 0.95) * (1 - 0.25 * s)
            for k in self.children(bi, 3, f['d3'], f['a3'], l3, s0=0.25):
                b = self.B[k]
                mid = b['pts'][len(b['pts']) // 2]
                g = float(self.gapn(mid))
                keep = rng.random() < (1 - gs) + gs * float(smooth(gth - 0.06, gth + 0.06, g))
                b['gap'] = not keep
                ter.append(k)
        # ---- twigs on the tertiaries (and the secondaries' outer thirds), none in a gap
        tw = []
        for bi in ter + sec:
            b = self.B[bi]
            if b.get('gap'): continue
            s0 = 0.3 if b['lvl'] == 3 else 0.62
            def l4(p, d, s): return rng.uniform(*f['l4'])
            # (0.55: with every scaffold alive the d4 densities gave ~2 leaves a twig; ~4-6 now, the leaves in clumps)
            tw += self.children(bi, 4, f['d4'] * 0.55, (35, 70), l4, s0=s0)
        self.levels = dict(scaf=scaf, sec=sec, ter=ter, tw=tw)
        self.radii()
        return self

    def radii(self, e=2.3):
        B = self.B
        W = [None] * len(B)
        for k in range(len(B) - 1, -1, -1):
            b = B[k]
            n = len(b['pts'])
            w = np.zeros(n)
            w[-1] += 1.0
            for node, c in b['kids']:
                w[min(node, n - 1)] += W[c][0] if not B[c].get('gap') else 0.35 * W[c][0]
            W[k] = np.cumsum(w[::-1])[::-1]
        r0 = self.f['trunkR'] * self.H * 0.8   # (0.8: the web's trunkR read thick on these pipe-model trunks, hero_near A/B)
        rt = r0 / W[0][0] ** (1 / e)
        for k, b in enumerate(B):
            r = rt * W[k] ** (1 / e)
            r = np.maximum(r, [0.05, 0.012, 0.006, 0.004, 0.0025][b['lvl']])
            if b['lvl'] == 0:
                y = b['pts'][:, 1]
                r = r * (1 + 0.45 * np.clip(1 - y / 0.6, 0, 1) ** 2)
            else:   # never fatter than the parent where it leaves it
                pr = B[b['parent']]['r'][min(b['pidx'], len(B[b['parent']]['r']) - 1)]
                r = np.minimum(r, pr * 0.92)
            b['r'] = r

    # ---------------------------------------------------------------- leaves
    def leaves(self):
        f, rng, env = self.f, self.rng, self.env
        sp = self.lm
        Lm = sp['len']
        pos, ax, sd, nm, cell, sz, depth = [], [], [], [], [], [], []
        hosts = [k for k in self.levels['tw']] + [k for k in self.levels['ter'] if not self.B[k].get('gap')]
        up = np.array([0.0, 1.0, 0.0])
        for k in hosts:
            b = self.B[k]
            P = b['pts']
            L = self.blen(b)
            dens = 3.0 * f['leafK'] / Lm * (1.0 if b['lvl'] == 4 else 0.45)   # candidate cards per metre of shoot (3x: thinned to the LAI below)
            n = int(round(dens * L * rng.uniform(0.8, 1.2)))
            if n <= 0: continue
            s0 = 0.25 if b['lvl'] == 4 else 0.55
            psi = rng.uniform(0, TAU)
            for j in range(n):
                s = s0 + (1 - s0) * (j + rng.random()) / n
                p, d, _ = self.sample(k, s)
                psi += GOLD
                # shell preference: inner leaves are shed
                rr = float(env.ratio(p))
                if rng.random() > f['shell'] + (1 - f['shell']) * min(1.0, rr) ** 2: continue
                a = math.radians(rng.uniform(40, 75))
                u = nrm(np.cross(d, up) if abs(d[1]) < 0.95 else np.cross(d, [1.0, 0, 0]))
                v = np.cross(d, u)
                axis = nrm(d * math.cos(a) + (u * math.cos(psi) + v * math.sin(psi)) * math.sin(a))
                # the blade's normal toward the sky and out of the crown
                cx, cz = env.centre(p[1])
                o = np.array([p[0] - cx, 0, p[2] - cz]); ol = np.linalg.norm(o)
                o = o / ol if ol > 1e-3 else np.zeros(3)
                tgt = nrm(up * 0.8 + o * 0.55 + rng.normal(0, 0.35, 3))
                side = np.cross(tgt, axis)
                if np.linalg.norm(side) < 1e-3: side = u
                side = nrm(side)
                nn = nrm(np.cross(axis, side))
                if nn[1] < -0.2: side, nn = -side, -nn
                pos.append(p); ax.append(axis); sd.append(side); nm.append(nn)
                cell.append(int(rng.integers(4))); sz.append(rng.uniform(0.85, 1.15)); depth.append(min(1.3, rr))
        cell = np.array(cell, np.int32); sz = np.array(sz)
        # the leaf area: each card's opaque share of its cell times the cell's area in metres; kept to the species' LAI
        cov = np.array([c['cover'] for c in sp['cells']]); cl = np.array([c['len'] for c in sp['cells']])
        area = cov[cell] * (Lm * sz / cl[cell]) ** 2
        target = f.get('lai', 4.0) * math.pi * (0.5 * self.W) ** 2
        keep = np.ones(len(area), bool)
        if area.sum() > target:
            keep = rng.random(len(area)) < target / area.sum()
        self.lai = float(area[keep].sum() / (math.pi * (0.5 * self.W) ** 2))
        sel = np.nonzero(keep)[0]
        self.leafs = dict(pos=np.array(pos)[sel], axis=np.array(ax)[sel], side=np.array(sd)[sel], nrm=np.array(nm)[sel], cell=cell[sel],
                          size=sz[sel], depth=np.array(depth)[sel])
        return self.leafs

# ---------------------------------------------------------------- meshes
def tube_mesh(tree, lvl_max=4, sides_k=1.0, ring_step=1, tile=1.2, min_r=0.0):
    """bark: a tube per branch, rings by parallel transport, uv: u round (whole repeats), v along (metres / tile)"""
    P_all, N_all, UV_all, I_all = [], [], [], []
    base = 0
    for b in tree.B:
        if b['lvl'] > lvl_max or b.get('gap') and b['lvl'] >= 3 and lvl_max < 4: continue
        P = b['pts']; r = b['r']
        if ring_step > 1 and len(P) > 3:
            keep = list(range(0, len(P) - 1, ring_step)) + [len(P) - 1]
            P, r = P[keep], r[keep]
        if r.max() < min_r: continue
        n = len(P)
        sides = int(np.clip(round((3 + r[0] * 75) * sides_k), 3, 18))
        T = np.zeros_like(P)
        T[1:-1] = P[2:] - P[:-2]; T[0] = P[1] - P[0]; T[-1] = P[-1] - P[-2]
        T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
        Nn = np.zeros_like(P)
        a = np.cross(T[0], [0, 1, 0]) if abs(T[0][1]) < 0.9 else np.cross(T[0], [1, 0, 0])
        Nn[0] = a / np.linalg.norm(a)
        for i in range(1, n):
            v = Nn[i - 1] - T[i] * (Nn[i - 1] @ T[i])
            l = np.linalg.norm(v)
            Nn[i] = v / l if l > 1e-9 else Nn[i - 1]
        Bn = np.cross(T, Nn)
        th = np.linspace(0, TAU, sides + 1)
        c, s = np.cos(th), np.sin(th)
        dirs = Nn[:, None, :] * c[None, :, None] + Bn[:, None, :] * s[None, :, None]   # (n, sides+1, 3)
        rr = r.copy(); rr[-1] = max(rr[-1] * 0.35, 0.0015)
        V = P[:, None, :] + dirs * rr[:, None, None]
        rep = max(1, int(round(TAU * r[0] / tile)))
        cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        U = np.broadcast_to((th / TAU * rep)[None, :], (n, sides + 1))
        Vv = np.broadcast_to((cum / tile)[:, None], (n, sides + 1))
        uv = np.stack([U, Vv], -1)
        i0 = np.arange(n - 1)[:, None] * (sides + 1) + np.arange(sides)[None, :]
        q = np.stack([i0, i0 + 1, i0 + sides + 2, i0, i0 + sides + 2, i0 + sides + 1], -1).reshape(-1, 3) + base
        P_all.append(V.reshape(-1, 3)); N_all.append(dirs.reshape(-1, 3)); UV_all.append(uv.reshape(-1, 2)); I_all.append(q)
        base += n * (sides + 1)
    return dict(P=np.concatenate(P_all).astype(np.float32), N=np.concatenate(N_all).astype(np.float32),
                UV=np.concatenate(UV_all).astype(np.float32), I=np.concatenate(I_all).astype(np.uint32))

def leaf_mesh(tree, sel=None, scale=1.0, fold_deg=None, droop=None):
    """one folded octagon card per leaf; uv in the species' 2 x 2 atlas; colour = a crown-depth shade (web use)"""
    Lf = tree.leafs
    sp = tree.lm
    if sel is None: sel = np.arange(len(Lf['pos']))
    nL = len(sel)
    fold = math.radians(tree.f['fold'] if fold_deg is None else fold_deg)
    dr = tree.f['droop'] if droop is None else droop
    cells = sp['cells']
    oct_uv = np.array([c['octagon'] for c in cells], np.float64)      # (4, 8, 2)
    basev = np.array([c['base'][1] for c in cells]); lens = np.array([c['len'] for c in cells])
    ci = Lf['cell'][sel]
    uvc = oct_uv[ci]                                                    # (nL, 8, 2)
    k = (sp['len'] * Lf['size'][sel] * scale / lens[ci])[:, None]       # metres per cell unit
    x = (uvc[..., 0] - 0.5) * k
    y = (uvc[..., 1] - basev[ci][:, None]) * k
    Lr = sp['len'] * Lf['size'][sel] * scale
    z = np.abs(x) * math.tan(fold) - dr * (y ** 2) / Lr[:, None]
    p0 = Lf['pos'][sel][:, None, :]; A = Lf['axis'][sel][:, None, :]; S = Lf['side'][sel][:, None, :]; Nn = Lf['nrm'][sel][:, None, :]
    V = p0 + S * x[..., None] + A * y[..., None] + Nn * z[..., None]
    # normals: the fold tilts each half's normal toward its own side's outward slope
    sgn = np.sign(x)[..., None]
    VN = Nn * math.cos(fold) - S * sgn * math.sin(fold)
    VN = VN / np.linalg.norm(VN, axis=-1, keepdims=True)
    cx, cy = ci % 2, ci // 2
    U = (cx[:, None] + uvc[..., 0]) / 2.0
    Vv = (cy[:, None] + uvc[..., 1]) / 2.0
    # wound so the face normal is the blade's normal (+n: the octagon is counter-clockwise in (side, axis), whose own normal is -n)
    tri = np.array([[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 5, 4], [0, 6, 5], [0, 7, 6]])
    I = (np.arange(nL)[:, None, None] * 8 + tri[None]).reshape(-1, 3)
    d = Lf['depth'][sel]
    shade = 0.45 + 0.55 * np.clip(d, 0, 1) ** 1.5
    C = np.repeat(shade[:, None], 8, axis=1)
    return dict(P=V.reshape(-1, 3).astype(np.float32), N=VN.reshape(-1, 3).astype(np.float32),
                UV=np.stack([U, Vv], -1).reshape(-1, 2).astype(np.float32), I=I.astype(np.uint32), C=C.reshape(-1).astype(np.float32))

def normalise(tree, H, W):
    """scale the whole tree (branches and leaves) so its leafy height and crown width are the target box's"""
    allp = np.concatenate([b['pts'] for b in tree.B] + ([tree.leafs['pos']] if len(tree.leafs['pos']) else []))
    h = allp[:, 1].max()
    w = 0.5 * ((allp[:, 0].max() - allp[:, 0].min()) + (allp[:, 2].max() - allp[:, 2].min()))
    sy = H / max(h, 1e-3)
    sxz = float(np.clip(W / max(w, 1e-3), sy * 0.8, sy * 1.25))
    S = np.array([sxz, sy, sxz])
    for b in tree.B:
        b['pts'] = b['pts'] * S
        b['r'] = b['r'] * math.sqrt(sxz * sy) ** 0.0 * 1.0
    tree.leafs['pos'] = tree.leafs['pos'] * S
    return sy, sxz

def build(F, size, H, W, seed, leafmeta):
    t = Tree(F, size, H * 0.97, W * 0.92, seed, leafmeta).build()
    t.leaves()
    sy, sxz = normalise(t, H, W)
    return t
