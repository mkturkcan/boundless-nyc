# R7-RAMP (UE track, 2026-10-08): the web's road graph joins some elevated roads (the Henry Hudson Parkway's decks at
# 10.26 m by W 125th St) to the street by ramps its traffic follows but its road builder never decks: the deck stops
# where the elevated segment ends, and the cars' lanes go on down through the air (t7ArchSoffit f100-107: a box truck at
# roof height over 12th Avenue, in the harvest itself, so in every renderer). No vehicle may be drawn on a surface the
# export lacks, so the take gets the missing decks: wherever a moving vehicle has no exported surface under it at its
# height, a deck is laid under its path (and carried on along its slope to the surface it was heading for), in the
# material of the deck it left, asphalt on top and the kerb's concrete on its sides and underside.
#
# As a writer hook (usd_write.py HOOKS): moving(H, stage, shot) adds /World/City/r7_ramps to the take's moving layer.
# Alone, for a take already written:
#   python usd_ramps.py --udir <usd dir> --shot <shot> [--harvest <dir>]   (writes ramps_<shot>.usdc, first in the
#   root's sublayers; --dry: the floating spans only)
import argparse, json, math, os, sys
import numpy as np

CELL = 2.0          # m, the triangle lookup grid
GRID = 0.5          # m, the deck's height grid
HALF_L, HALF_W = 3.2, 1.9   # m, a vehicle's footprint about its contact point (a box truck: 8.5 x 2.6 m)
TOL_DOWN, TOL_UP = 0.6, 0.35   # m, a surface between y - TOL_DOWN and y + TOL_UP carries the vehicle
THICK = 0.9         # m, the deck's slab
MAX_GAP = 12.0      # m, higher over the surface below: not a ramp (left as it is, reported)
EXTEND = 40.0       # m, how far a deck is carried on along the vehicle's slope to meet the surface it heads for
SIDE = 0            # the ground's surface kind on the deck's sides, underside and parapets (R8): the asphalt's dark
                    # aggregate, read as the parkway's dark weathered concrete; the kerb's granite (2, the parkway slab's
                    # own sides) read as a pale plank in the low sun (L* 85 against the tan facade's 82)


def _geo(IN, G, gid):
    g = G[gid]; lay = {L['name']: L for L in g['layout']}; out = {}
    for nm in ('position', 'index'):
        if nm in lay:
            L = lay[nm]; dt = np.float32 if L['type'] == 'f32' else np.uint32
            a = np.fromfile(os.path.join(IN, g['file']), dtype=dt, count=L['count'] * L['itemSize'], offset=L['offset'])
            out[nm] = a.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else a
    out['groups'] = g.get('groups') or []
    return out


class Surfaces:
    """the exported static triangles that can carry a wheel (up to 70 deg from level) near the vehicles' paths, looked up
    by a 2 m grid: heights under a point."""
    def __init__(self, IN, S, G, path_cells):
        want = path_cells
        cx_, cz_ = np.array([c[0] for c in want]), np.array([c[1] for c in want])
        x0, z0, x1, z1 = cx_.min() * CELL, cz_.min() * CELL, (cx_.max() + 1) * CELL, (cz_.max() + 1) * CELL
        T, M = [], []
        for o in S.get('objects', []):
            gid = o.get('geo', -1)
            if gid is None or gid < 0 or o.get('far'): continue
            g = _geo(IN, G, gid)
            if 'position' not in g: continue
            P = g['position'][:, :3].astype(np.float64)
            if o.get('matrix') is not None:
                m = np.array(o['matrix'], np.float64).reshape(4, 4).T; P = (np.c_[P, np.ones(len(P))] @ m.T)[:, :3]
            I = g['index'].reshape(-1, 3).astype(np.int64) if 'index' in g else np.arange(len(P) // 3 * 3).reshape(-1, 3)
            Tr = P[I]; lo = Tr.min(1); hi = Tr.max(1)
            nrm = np.cross(Tr[:, 1] - Tr[:, 0], Tr[:, 2] - Tr[:, 0]); nl = np.linalg.norm(nrm, axis=1)
            sel = (hi[:, 0] >= x0) & (lo[:, 0] <= x1) & (hi[:, 2] >= z0) & (lo[:, 2] <= z1) & (nl > 1e-9)
            sel &= np.abs(nrm[:, 1]) > 0.34 * np.where(nl > 0, nl, 1.0)
            if not sel.any(): continue
            mi = np.zeros(len(I), np.int64)
            for q in g['groups']:
                a_, b_ = max(0, q['start'] // 3), min(len(I), (q['start'] + q['count']) // 3)
                if b_ > a_: mi[a_:b_] = q.get('mi', 0)
            mats = o.get('mats') or [-1]
            T.append(Tr[sel]); M.append(np.array([mats[k] if k < len(mats) else mats[0] for k in mi[sel]], np.int64))
        self.T = np.concatenate(T) if T else np.zeros((0, 3, 3)); self.M = np.concatenate(M) if M else np.zeros(0, np.int64)
        self.cells = {}
        lo = np.floor(self.T.min(1)[:, [0, 2]] / CELL).astype(np.int64); hi = np.floor(self.T.max(1)[:, [0, 2]] / CELL).astype(np.int64)
        self._lo, self._hi, self.want = lo, hi, set(want)
        for t in range(len(self.T)):
            nx, nz = hi[t, 0] - lo[t, 0] + 1, hi[t, 1] - lo[t, 1] + 1
            if nx * nz <= 64:
                for cx in range(lo[t, 0], hi[t, 0] + 1):
                    for cz in range(lo[t, 1], hi[t, 1] + 1):
                        if (cx, cz) in want: self.cells.setdefault((cx, cz), []).append(t)
            else:   # (a large sheet: only the path's cells it spans)
                for (cx, cz) in want:
                    if lo[t, 0] <= cx <= hi[t, 0] and lo[t, 1] <= cz <= hi[t, 1]: self.cells.setdefault((cx, cz), []).append(t)

    def heights(self, x, z):
        """[(height, material id)] of every triangle over (x, z)."""
        key = (int(math.floor(x / CELL)), int(math.floor(z / CELL)))
        if key not in self.want:   # (a cell off the paths, as a deck is carried on: indexed when first asked)
            self.want.add(key)
            ids_ = np.nonzero((self._lo[:, 0] <= key[0]) & (self._hi[:, 0] >= key[0]) & (self._lo[:, 1] <= key[1]) & (self._hi[:, 1] >= key[1]))[0]
            if len(ids_): self.cells[key] = ids_.tolist()
        ids = self.cells.get(key)
        if not ids: return []
        Ts = self.T[ids]; a, b, c = Ts[:, 0], Ts[:, 1], Ts[:, 2]
        v0 = c[:, [0, 2]] - a[:, [0, 2]]; v1 = b[:, [0, 2]] - a[:, [0, 2]]; v2 = np.array([x, z]) - a[:, [0, 2]]
        d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
        den = d00 * d11 - d01 * d01; den = np.where(np.abs(den) < 1e-12, 1e-12, den)
        u = (d11 * d20 - d01 * d21) / den; v = (d00 * d21 - d01 * d20) / den
        ins = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
        if not ins.any(): return []
        y = a[ins, 1] + u[ins] * (c[ins, 1] - a[ins, 1]) + v[ins] * (b[ins, 1] - a[ins, 1])
        ids_ = np.asarray(ids)[ins]
        return list(zip(y.tolist(), self.M[ids_].tolist()))

    def carried(self, x, z, y):
        """the surface that carries a contact point at height y (its material), or None."""
        hs = [h for h in self.heights(x, z) if y - TOL_DOWN <= h[0] <= y + TOL_UP]
        return max(hs)[1] if hs else None

    def below(self, x, z, y):
        hs = [h[0] for h in self.heights(x, z) if h[0] <= y + TOL_UP]
        return max(hs) if hs else None


def find_spans(IN, S, G, MV):
    """the moving vehicles' frames with no surface under them: per vehicle, runs of (x, y, z, forward) and the deck's
    material (the surface it left or meets)."""
    cars = MV.get('cars') or []
    pts = []
    for c in cars:
        ms = json.loads(c['m']) if isinstance(c['m'], str) else c['m']
        for m in ms: pts.append((m[9], m[11]))
    if not pts: return [], None
    # the 2 m cells within reach of the paths (and of a deck carried on past them)
    P = np.array(pts)
    base = {(int(math.floor(x / CELL)), int(math.floor(z / CELL))) for x, z in P.tolist()}
    r = int(math.ceil((HALF_L + 2.0) / CELL))
    near = {(cx + i, cz + j) for (cx, cz) in base for i in range(-r, r + 1) for j in range(-r, r + 1)}
    SF = Surfaces(IN, S, G, near)
    SF.reach = near
    spans = []
    for c in cars:
        ms = json.loads(c['m']) if isinstance(c['m'], str) else c['m']
        f0 = int(c.get('f0', 0))
        run, mat = [], None
        def close():
            nonlocal run, mat
            if run: spans.append({'id': c['id'], 'kind': c.get('kind'), 'pts': run, 'mat': mat})
            run, mat = [], None
        last_mat = None
        for k, m in enumerate(ms):
            x, y, z = m[9], m[10], m[11]
            fw = np.array([m[6], m[7], m[8]], np.float64); fw[1] = 0.0
            n = np.linalg.norm(fw); fw = fw / n if n > 1e-6 else np.array([0.0, 0.0, 1.0])
            got = SF.carried(x, z, y)
            if got is not None:
                last_mat = got; close(); continue
            gnd = SF.below(x, z, y)
            if gnd is None or y - gnd < TOL_DOWN or y - gnd > MAX_GAP: close(); continue
            if not run: mat = last_mat
            run.append((x, y, z, fw[0], fw[2], f0 + k))
        close()
    return spans, SF


def deck_grid(spans, SF):
    """the deck's top heights on a 0.5 m grid: each floating frame's footprint, and each span carried on along its slope
    (forward past its last frame, back before its first) until it meets the surface below."""
    top = {}
    head = {}   # (R8) the travel direction over each cell, for the parapets along the deck's sides
    def stamp(x, y, z, fx, fz):
        rx, rz = fz, -fx
        for s in np.arange(-HALF_L, HALF_L + 1e-6, GRID * 0.7):
            for w in np.arange(-HALF_W, HALF_W + 1e-6, GRID * 0.7):
                px, pz = x + fx * s + rx * w, z + fz * s + rz * w
                key = (int(math.floor(px / GRID)), int(math.floor(pz / GRID)))
                h = y - 0.01
                if key not in top or h > top[key]: top[key] = h; head[key] = (fx, fz)
    mats = {}
    for sp in spans:
        pts = sp['pts']
        for (x, y, z, fx, fz, f) in pts: stamp(x, y, z, fx, fz)
        if sp['mat'] is not None: mats[sp['mat']] = mats.get(sp['mat'], 0) + len(pts)
        # carried on: the slope over the span's last (first) metres, along the heading
        for end, sgn in ((pts[-1], 1.0), (pts[0], -1.0)):
            ref = pts[max(0, len(pts) - 6)] if sgn > 0 else pts[min(len(pts) - 1, 5)]
            ds = math.hypot(end[0] - ref[0], end[2] - ref[2])
            if ds < 0.3: continue
            slope = (end[1] - ref[1]) / ds * sgn
            if slope >= -0.01: continue   # (only a descent away from the span's end reaches the ground)
            x, y, z, fx, fz = end[0], end[1], end[2], end[3] * sgn, end[4] * sgn
            s = 0.0
            while s < EXTEND:
                s += GRID; x += fx * GRID; z += fz * GRID; y += slope * GRID
                g = SF.below(x, z, y + TOL_DOWN)
                if g is not None and y <= g + 0.05: break
                stamp(x, y, z, fx, fz)
    top['_head'] = head
    return top, (max(mats, key=mats.get) if mats else None)


def deck_mesh(top):
    """points, face counts, indices and per-vertex surface kinds of the deck over the grid's cells, the top's corner
    heights the mean of the cells meeting there: matId 0 (asphalt) on top; SIDE (dark weathered concrete) on the
    sides, the underside and the parapets, 1 m walls on the deck's edges along the travel direction (not across its ends)."""
    head = top.get('_head', {})
    keys = set(k for k in top if k != '_head')
    corner = {}
    for k in keys:
        i, j = k; h = top[k]
        for c in ((i, j), (i + 1, j), (i, j + 1), (i + 1, j + 1)): corner.setdefault(c, []).append(h)
    ch = {c: sum(v) / len(v) for c, v in corner.items()}
    P, K, F = [], [], []
    PAR, PT = 1.0, 0.3   # m, the parapet's height and thickness
    def quad(a, b, c, d, kind):
        n = len(P); P.extend([a, b, c, d]); K.extend([kind] * 4); F.append((n, n + 1, n + 2, n + 3))
    for (i, j) in keys:
        x0, z0, x1, z1 = i * GRID, j * GRID, (i + 1) * GRID, (j + 1) * GRID
        h00, h10, h01, h11 = ch[(i, j)], ch[(i + 1, j)], ch[(i, j + 1)], ch[(i + 1, j + 1)]
        quad((x0, h00, z0), (x0, h01, z1), (x1, h11, z1), (x1, h10, z0), 0)                                       # top (up)
        quad((x0, h00 - THICK, z0), (x1, h10 - THICK, z0), (x1, h11 - THICK, z1), (x0, h01 - THICK, z1), SIDE)      # underside
        fx, fz = head.get((i, j), (0.0, 0.0))
        for (di, dj), (ca, cb) in (((0, -1), ((i, j), (i + 1, j))), ((1, 0), ((i + 1, j), (i + 1, j + 1))),
                                   ((0, 1), ((i + 1, j + 1), (i, j + 1))), ((-1, 0), ((i, j + 1), (i, j)))):
            if (i + di, j + dj) in keys: continue
            (ai, aj), (bi, bj) = ca, cb
            ha, hb = ch[ca], ch[cb]
            ex, ez = (bi - ai), (bj - aj)
            par = abs(ex * fx + ez * fz) > 0.7   # (an edge along the travel direction: a side, not an end)
            ta, tb = (ha + PAR, hb + PAR) if par else (ha, hb)
            A, B = (ai * GRID, aj * GRID), (bi * GRID, bj * GRID)
            quad((A[0], ta, A[1]), (B[0], tb, B[1]), (B[0], hb - THICK, B[1]), (A[0], ha - THICK, A[1]), SIDE)          # outer face
            if par:   # the parapet's inner face and cap, PT inside the edge
                ox, oz = -di * PT, -dj * PT
                Ai, Bi = (A[0] + ox, A[1] + oz), (B[0] + ox, B[1] + oz)
                quad((Bi[0], tb, Bi[1]), (Ai[0], ta, Ai[1]), (Ai[0], ha, Ai[1]), (Bi[0], hb, Bi[1]), SIDE)
                quad((A[0], ta, A[1]), (Ai[0], ta, Ai[1]), (Bi[0], tb, Bi[1]), (B[0], tb, B[1]), SIDE)
    return np.array(P, np.float32), F, np.array(K, np.float32)


def author(stage, top, mat, path='/World/City/r7_ramps'):
    from pxr import UsdGeom, UsdShade, Sdf, Vt
    P, F, K = deck_mesh(top)
    if not len(P): return 0
    m = UsdGeom.Mesh.Define(stage, path)
    m.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P)))
    m.GetFaceVertexCountsAttr().Set(Vt.IntArray([4] * len(F)))
    m.GetFaceVertexIndicesAttr().Set(Vt.IntArray([v for f in F for v in f]))
    m.GetSubdivisionSchemeAttr().Set(UsdGeom.Tokens.none)
    m.GetExtentAttr().Set(Vt.Vec3fArray.FromNumpy(np.stack([P.min(0), P.max(0)]).astype(np.float32)))
    m.GetDoubleSidedAttr().Set(False)
    UsdGeom.PrimvarsAPI(m.GetPrim()).CreatePrimvar('matId', Sdf.ValueTypeNames.FloatArray, UsdGeom.Tokens.vertex).Set(Vt.FloatArray.FromNumpy(np.ascontiguousarray(K)))
    UsdGeom.PrimvarsAPI(m.GetPrim()).CreatePrimvar('gpK', Sdf.ValueTypeNames.Float4Array, UsdGeom.Tokens.vertex).Set(Vt.Vec4fArray.FromNumpy(np.zeros((len(P), 4), np.float32)))
    if mat is not None:
        # (R8: the writer names a ground material's looks by variant, m<id>_g0; a binding to m<id> alone found nothing and
        # the deck rendered with the importer's default white)
        mp = mat if isinstance(mat, str) else f'/World/Looks/m{int(mat)}_g0'
        lk = stage.GetPrimAtPath(mp)
        UsdShade.MaterialBindingAPI.Apply(m.GetPrim()).Bind(UsdShade.Material(lk) if lk else UsdShade.Material(stage.OverridePrim(mp)))
    return len(F)


def build(IN, S, G, MV):
    spans, SF = find_spans(IN, S, G, MV)
    if not spans: return None, None, {'spans': 0}
    top, mat = deck_grid(spans, SF)
    st = {'spans': len(spans), 'frames': sum(len(s['pts']) for s in spans), 'cells': len(top) - 1, 'material': mat,
          'vehicles': sorted({s['id'] for s in spans})[:40]}
    return top, mat, st


def moving(H, stage, shot):
    """usd_write.py hook: the decks under the take's floating vehicles, in its moving layer."""
    try: MV = json.load(open(os.path.join(H.IN, f'mov_{shot}.json')))
    except Exception: return None
    sp = os.path.join(H.IN, f'static_{shot}.json')
    S = json.load(open(sp)) if os.path.exists(sp) else (H.S if isinstance(H.S, dict) else {})
    top, mat, st = build(H.IN, S, H.GEOS, MV)
    if top: st['faces'] = author(stage, top, mat)
    H.stats.setdefault('ramps', {})[shot] = st
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--udir', required=True); ap.add_argument('--shot', required=True); ap.add_argument('--harvest')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    from pxr import Usd, Sdf
    root = os.path.join(a.udir, f'{a.shot}.usda')
    rl = Sdf.Layer.FindOrOpen(root)
    IN = a.harvest or dict(rl.customLayerData).get('harvest')
    man = json.load(open(os.path.join(IN, 'manifest.json')))
    S = json.load(open(os.path.join(IN, f'static_{a.shot}.json'))) if os.path.exists(os.path.join(IN, f'static_{a.shot}.json')) else json.load(open(os.path.join(IN, 'static.json')))
    MV = json.load(open(os.path.join(IN, f'mov_{a.shot}.json')))
    top, mat, st = build(IN, S, man['geos'], MV)
    print('RAMPS ' + json.dumps(st))
    if a.dry or not top: return
    fn = f'ramps_{a.shot}.usdc'
    path = os.path.join(a.udir, fn)
    if os.path.exists(path): os.remove(path)
    # the deck's material as the take's looks name it (m<id>_g0 for a ground variant, else m<id>)
    mpath = None
    if mat is not None:
        full = Usd.Stage.Open(root)
        names = [c.GetName() for c in (full.GetPrimAtPath('/World/Looks').GetChildren() if full.GetPrimAtPath('/World/Looks') else [])]
        for cand in (f'm{int(mat)}_g0', f'm{int(mat)}'):
            if cand in names: mpath = f'/World/Looks/{cand}'; break
        if mpath is None:
            mpath = next((f'/World/Looks/{n_}' for n_ in names if n_.startswith(f'm{int(mat)}_')), None)
        st['material_path'] = mpath
    stg = Usd.Stage.CreateNew(path)
    stg.SetDefaultPrim(stg.DefinePrim('/World'))
    st['faces'] = author(stg, top, mpath or mat)
    stg.GetRootLayer().Save()
    subs = list(rl.subLayerPaths)
    if fn not in subs:
        rl.subLayerPaths.insert(0, fn); rl.Save()
    print('RAMPS_WRITTEN ' + json.dumps({'layer': path, 'faces': st['faces'], 'root': root}))


if __name__ == '__main__':
    main()
