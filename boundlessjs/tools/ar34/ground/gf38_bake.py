# GF38 (docs/notes/ar34-groundfix.md): the ground the compiled tiles leave bare on the 125th Street tiles, paved from the
# NYC Planimetric Database (Sidewalk 52n9-sdep, Roadbed i36f-5ih7, Median ees7-4ufv, Parking Lot 7cgt-uhhz, Public Plazas
# ue2e-9jm2, Open Space (Parks) y6ja-fw4f and (Other) b7j8-z8a7; boundlessjs/data/raw/planimetric/, fetched 2026-10-05). Per tile:
#   covered  = the ground-level sections as world/assemble.js has them where GF38 applies (gf38_dump.mjs: after CP32, AR32
#              and ST38's corner paving)
#   fill(k)  = planimetric class k - covered - building footprints (5 cm under their walls), slivers under 4 cm dropped
#   leftover = what the probe (tools/qa/ground_gaps.mjs) still calls a gap after that: cells no section covers within 1.5 m
#              of a roadway and of a raised surface, with no planimetric class (the twin's roadway or walk runs beside them
#              where the city's polygons put a building line, a lot or a park edge): paved as the surface beside them
#   kerbs    = a walk fill's edge that meets roadway (compiled or filled) and has no compiled kerb face within 12 cm gets a
#              kerb face (the compiled kerb's section: 3.26 m to the walk)
# Heights: the compiled surface of the same class nearest each vertex (roadway 3 mm under it, walks 4 mm under it), so the
# fills meet the compiled ground flush and run under it by a few cm (no crack at the seam); under an elevated deck, the
# ground-level roadway. Output: boundlessjs/public/data/gf38/<tile>.bin (Float32 tile-local triangles per section) + index.json.
#   python3 gf38_bake.py --chain <dir of gf38_dump.mjs output> [--tiles 4_-6,...] [--out boundlessjs/public/data/gf38] [-j 24]
import argparse, collections, glob, json, math, os, struct, sys
from multiprocessing import Pool
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, box, shape, LineString
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PLAN = os.path.join(ROOT, 'data', 'raw', 'planimetric')
LAT0, LON0 = 40.7831, -73.9712; ML = 111132.0; MO = 111320.0 * math.cos(math.radians(LAT0))
ROADK = ('asphalt', 'gutter', 'busred')
WALKK = ('sidewalk', 'plaza', 'brick', 'warn', 'warnIron', 'path', 'gravel')   # the raised surfaces a walk fill meets
WALK_KIND = ('sidewalk', 'plaza', 'brick', 'path', 'gravel')   # the kinds a walk fill takes (its neighbours' own)
Y_ROAD, Y_WALK, Y_KERB0 = 3.385, 3.52, 3.26
# Planimetric median subtypes: 360010 painted, 360060 barrier (road level); 360020 curb, 360030 rail, 360040 fence, 360050 grass,
# 360070 other, 360080 traffic island (raised, kerbed)
MED_FLAT = ('360010', '360060'); MED_RAISED = ('360020', '360030', '360040', '360050', '360070', '360080')
GRID = 0.0005   # the unions snap to 0.5 mm (GEOS's overlay is robust on a grid; exact unions of 10^5 triangles can fail)
R = 0.25   # raster for heights and the leftover pass

def rd(fn):
    b = open(fn, 'rb').read(); n = struct.unpack('<I', b[:4])[0]; h = json.loads(b[4:4 + n]); f = np.frombuffer(b[4 + n:], dtype=np.float32)
    return h, {k: f[o:o + c] for k, (o, c) in h['kinds'].items()}

def load_plan(ox, oz):
    tb = box(ox - 1, oz - 1, ox + 513, oz + 513)
    out = {}
    for name, src, subs in (('sidewalk', 'sidewalk', None), ('roadbed', 'roadbed', None), ('median', 'median', MED_RAISED),
                            ('median_flat', 'median', MED_FLAT), ('parking', 'parking', None), ('plaza', 'plaza', None),
                            ('parks', 'parks', None), ('openother', 'openother', None)):
        gs = []
        for f in json.load(open(os.path.join(PLAN, src + '.geojson')))['features']:
            if not f['geometry']: continue
            if subs is not None and f['properties'].get('sub_code') not in subs: continue
            g = transform(lambda x, y, z=None: ((x - LON0) * MO - ox, -(y - LAT0) * ML - oz), shape(f['geometry']))
            if not g.is_valid: g = g.buffer(0)
            if g.intersects(box(-1, -1, 513, 513)): gs.append(g)
        out[name] = unary_union(gs).intersection(box(0, 0, 512, 512)) if gs else Polygon()
    return out

def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon) and not p.is_empty] + [q for p in getattr(g, 'geoms', []) if not isinstance(p, Polygon) for q in polys(p)]

def areal(g):
    # the polygons of a geometry (make_valid and overlays can hand back lines and points with them)
    if g is None or g.is_empty: return Polygon()
    if not g.is_valid: g = shapely.make_valid(g)
    ps = polys(g)
    return ps[0] if len(ps) == 1 else (MultiPolygon(ps) if ps else Polygon())

def tri_polys(a, keep):
    t = a.reshape(-1, 3, 3)
    xz = t[:, :, [0, 2]].astype(np.float64)
    area2 = (xz[:, 1, 0] - xz[:, 0, 0]) * (xz[:, 2, 1] - xz[:, 0, 1]) - (xz[:, 2, 0] - xz[:, 0, 0]) * (xz[:, 1, 1] - xz[:, 0, 1])
    m = (np.abs(area2) > 1e-6) & keep(t)
    return shapely.polygons(xz[m]), t[m]

def bake(args):
    fn, outdir = args
    h, K = rd(fn); key = h['key']; ox, oz = h['ox'], h['oz']; res = h['res']; n = res + 1
    terr = K['_terrain'].reshape(n, n)
    def terrain(x, z):
        # the terrain samples on the drawn grid's two triangles a cell (world/assemble.js), without TL26's lowering
        fx = np.clip(x / 512 * res, 0, res - 1e-3); fz = np.clip(z / 512 * res, 0, res - 1e-3); i = fx.astype(int); j = fz.astype(int); u = fx - i; v = fz - j
        y00, y10, y01, y11 = terr[j, i], terr[j, i + 1], terr[j + 1, i], terr[j + 1, i + 1]
        return np.where(u >= v, y00 + u * (y10 - y00) + v * (y11 - y10), y00 + v * (y01 - y00) + u * (y11 - y01))
    ground = lambda t: (t[:, :, 1].min(1) - terrain(t[:, :, 0].mean(1), t[:, :, 2].mean(1))) < 1.2
    cov_parts, road_parts, walk_parts = [], [], []
    N = int(512 / R); hRoad = np.full((N, N), np.nan, np.float32); hWalk = np.full((N, N), np.nan, np.float32)
    def rast_h(t, H, mode):
        # cell centres inside each triangle get its plane height (min for roads, max for walks)
        for tri in t:
            xs, ys, zs = tri[:, 0], tri[:, 1], tri[:, 2]
            i0, i1 = max(0, int(xs.min() / R)), min(N - 1, int(xs.max() / R)); j0, j1 = max(0, int(zs.min() / R)), min(N - 1, int(zs.max() / R))
            if i1 < i0 or j1 < j0: continue
            X, Z = np.meshgrid((np.arange(i0, i1 + 1) + 0.5) * R, (np.arange(j0, j1 + 1) + 0.5) * R)
            d = (zs[1] - zs[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (zs[0] - zs[2])
            if abs(d) < 1e-9: continue
            w1 = ((zs[1] - zs[2]) * (X - xs[2]) + (xs[2] - xs[1]) * (Z - zs[2])) / d; w2 = ((zs[2] - zs[0]) * (X - xs[2]) + (xs[0] - xs[2]) * (Z - zs[2])) / d; w3 = 1 - w1 - w2
            m = (w1 >= -1e-6) & (w2 >= -1e-6) & (w3 >= -1e-6)
            if not m.any(): continue
            y = w1 * ys[0] + w2 * ys[1] + w3 * ys[2]; sub = H[j0:j1 + 1, i0:i1 + 1]
            if mode == 'min': sub[m] = np.where(np.isnan(sub[m]), y[m], np.minimum(sub[m], y[m]))
            else: sub[m] = np.where(np.isnan(sub[m]), y[m], np.maximum(sub[m], y[m]))
    hGrass = np.full((N, N), np.nan, np.float32); grass_parts = []; paint_parts = []; hK = {}; walk_parts_all = []
    # this tile's sections, and the neighbours' where they reach over its edge (a compiled triangle belongs to one tile)
    srcs = [(K, 0.0, 0.0, ground)]
    tx, tz = map(int, key.split('_'))
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            nf = os.path.join(os.path.dirname(fn), f'{tx + dx}_{tz + dz}.bin')
            if (dx or dz) and os.path.exists(nf):
                hn, Kn = rd(nf); resn = hn['res']; tn = Kn['_terrain'].reshape(resn + 1, resn + 1)
                def gnd(t, tn=tn, resn=resn, sx=dx * 512.0, sz=dz * 512.0):
                    fx = np.clip((t[:, :, 0].mean(1) + 0) / 512 * resn, 0, resn - 1e-3); fz = np.clip((t[:, :, 2].mean(1)) / 512 * resn, 0, resn - 1e-3)
                    return (t[:, :, 1].min(1) - tn[fz.astype(int), fx.astype(int)]) < 1.2
                srcs.append((Kn, dx * 512.0, dz * 512.0, gnd))
    for KK, sx, sz, gfun in srcs:
        for k, a in KK.items():
            if k.startswith('_') or not len(a) or len(a) % 9: continue
            if sx or sz:
                t3 = a.reshape(-1, 3, 3)
                lo = t3[:, :, [0, 2]].min(1) + (sx, sz); hi = t3[:, :, [0, 2]].max(1) + (sx, sz)
                m = (hi[:, 0] > -0.5) & (lo[:, 0] < 512.5) & (hi[:, 1] > -0.5) & (lo[:, 1] < 512.5)
                if not m.any(): continue
                gm = gfun(t3[m]); t3 = t3[m][gm].copy()
                if not len(t3): continue
                t3[:, :, 0] += sx; t3[:, :, 2] += sz
                a = t3.reshape(-1); keep = lambda t: np.ones(len(t), bool)
            else: keep = gfun
            P, t = tri_polys(a, keep)
            if not len(P): continue
            cov_parts.append(P)
            if k in ROADK: road_parts.append(P); rast_h(t, hRoad, 'min')
            elif k in WALKK:
                walk_parts.append(P); rast_h(t, hWalk, 'max')
                walk_parts_all.extend(list(P))
                kk = k if k in WALK_KIND else 'sidewalk'
                if kk not in hK: hK[kk] = np.full((N, N), np.nan, np.float32)
                rast_h(t, hK[kk], 'max')
            elif k in ('grass', 'grassU'): grass_parts.append(P); rast_h(t, hGrass, 'max')
            elif k in ('paintW', 'paintY', 'paintG'): paint_parts.append(P)
    # the probe's roadway level: every roadway and paint triangle at any height (decks too), its lowest per cell
    hRoadAny = np.full((N, N), np.nan, np.float32)
    for k in ROADK + ('paintW', 'paintY', 'paintG'):
        if k in K and len(K[k]) and len(K[k]) % 9 == 0: rast_h(K[k].reshape(-1, 3, 3), hRoadAny, 'min')
    dk = [tri_polys(K[k], lambda t: ~ground(t))[0] for k in ROADK if k in K and len(K[k])]
    dk = [d for d in dk if len(d)]
    deck = shapely.union_all(np.concatenate(dk), grid_size=GRID) if dk else Polygon()
    # elevated walks and other raised surfaces over a deck (the probe counts them as raised in plan)
    ek = [tri_polys(K[k], lambda t: ~ground(t))[0] for k in K if not k.startswith('_') and k not in ROADK and k not in ('curb', 'paintW', 'paintY', 'paintG') and len(K[k]) and len(K[k]) % 9 == 0]
    ek = [d for d in ek if len(d)]
    elev_raised = shapely.union_all(np.concatenate(ek), grid_size=GRID) if ek else Polygon()
    covered = shapely.union_all(np.concatenate(cov_parts), grid_size=GRID) if cov_parts else Polygon()
    road = shapely.union_all(np.concatenate(road_parts), grid_size=GRID) if road_parts else Polygon()
    walkc = shapely.union_all(np.concatenate(walk_parts), grid_size=GRID) if walk_parts else Polygon()
    # building footprints (compiled), 5 cm in from their walls
    XZ = K['_bldXZ'].reshape(-1, 2).astype(np.float64); bl = h['bld']; bps = []
    for q in range(0, len(bl), 4):
        s, ln = int(bl[q]), int(bl[q + 1])
        if ln < 3: continue
        p = Polygon(XZ[s:s + ln])
        if not p.is_valid: p = p.buffer(0)
        bps.append(p)
    bld = unary_union(bps).buffer(-0.05, join_style='mitre') if bps else Polygon()
    plan = load_plan(ox, oz)
    tb = box(0, 0, 512, 512)
    # the ST38 openings stay open
    holes = []
    for hh in h.get('holes', []):
        c, s = math.cos(hh['yaw']), math.sin(hh['yaw'])
        loc = [(hh['x0'] - 0.3, hh['z0'] - 0.3), (hh['x1'] + 0.3, hh['z0'] - 0.3), (hh['x1'] + 0.3, hh['z1'] + 0.3), (hh['x0'] - 0.3, hh['z1'] + 0.3)]
        holes.append(Polygon([(hh['x'] + u * c + v * s - ox, hh['z'] - u * s + v * c - oz) for u, v in loc]))
    # heights: nearest compiled surface of the class (raster), else the base plane
    def nearest_field(H, lift):
        # the nearest compiled surface of the class within 8 m, else the terrain + the base plane's step (3.24 -> 3.385 / 3.52)
        m = np.isnan(H)
        if m.all(): return lambda x, z: terrain(np.asarray(x), np.asarray(z)) + lift
        dist, idx = ndimage.distance_transform_edt(m, return_distances=True, return_indices=True)
        F = H[idx[0], idx[1]]; far = dist * R > 8
        def f(x, z):
            x = np.asarray(x, float); z = np.asarray(z, float); j = np.clip((z / R).astype(int), 0, N - 1); i = np.clip((x / R).astype(int), 0, N - 1)
            return np.where(far[j, i], terrain(x, z) + lift, F[j, i])
        return f
    yR, yW = nearest_field(hRoad, Y_ROAD - 3.24), nearest_field(hWalk, Y_WALK - 3.24)
    yG = nearest_field(hGrass, 3.51 - 3.24)
    # ground that is not at grade: the river (the drawn grid under the water plane at y 0), its banks, embankments and cuts,
    # the terrain more than 0.6 m under the base plane: no fill goes there (a slab over the water, or floating over a
    # slope); the line is smoothed (closed by 0.5 m; the last pass below paves what the probe still
    # counts at grade there)
    XC, ZC = np.meshgrid((np.arange(N) + 0.5) * R, (np.arange(N) + 0.5) * R)
    tC = terrain(XC, ZC)
    lowM = tC < 3.24 - 0.6   # the compiled base plane is flat at 3.24 (world/assemble.js's surface sampler notes)
    lowPoly = Polygon()
    if lowM.any():
        lm = lowM
        rects = []
        for j in range(N):
            row = lm[j]
            if not row.any(): continue
            d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
            for a0, a1 in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]): rects.append(box(a0 * R, j * R, a1 * R, (j + 1) * R))
        lowPoly = areal(unary_union(rects).buffer(0.5, join_style='round', quad_segs=4).buffer(-0.5, join_style='round', quad_segs=4))
    nst38 = len(holes)
    holes = holes + polys(lowPoly)
    blocked = unary_union([covered, bld] + holes)
    fills = {}; taken = Polygon()
    for cls in ('roadbed', 'median_flat', 'parking', 'median', 'sidewalk', 'plaza'):
        f = plan[cls].difference(blocked).difference(taken)
        f = f.buffer(-0.02, join_style='mitre').buffer(0.02, join_style='mitre').intersection(plan[cls]).difference(blocked)
        f = unary_union([p for p in polys(f) if p.area >= 0.05])
        fills[cls] = f; taken = taken.union(f)
    # leftover: the probe's gap cells (no section, within 1.5 m of roadway and of a raised surface) not filled above
    XC, ZC = np.meshgrid((np.arange(N) + 0.5) * R, (np.arange(N) + 0.5) * R)
    def rast_mask(g):
        # the cells whose centre lies in g (the probe's own test: a cell is covered when its centre is in a triangle)
        if g.is_empty: return np.zeros((N, N), bool)
        g = shapely.make_valid(g); shapely.prepare(g)
        x0, z0, x1, z1 = g.bounds
        i0, i1 = max(0, int(x0 / R) - 1), min(N, int(x1 / R) + 2); j0, j1 = max(0, int(z0 / R) - 1), min(N, int(z1 / R) + 2)
        m = np.zeros((N, N), bool)
        m[j0:j1, i0:i1] = shapely.contains_xy(g, XC[j0:j1, i0:i1], ZC[j0:j1, i0:i1])
        return m
    # the traffic's carriageways (the street graph at the roadway's level, half its width and at least 2.5 m each side of the line):
    # a walk fill there is roadway (a driveway, a service road the city's polygons call walk), so no car drives on a walk
    RV = K.get('_roadV', np.zeros(0, np.float32)).reshape(-1, 3); rl = h.get('roads', []); cor = []
    for q in range(0, len(rl), 4):
        s0, ln, wd = int(rl[q]), int(rl[q + 1]), float(rl[q + 2])
        if ln < 2: continue
        P3 = RV[s0:s0 + ln].astype(np.float64)
        # at the roadway's own level only (3.385 on the base plane; a line drawn over a walk or a path at 3.5, a campus
        # service way, is the walk's), segment by segment (a road that climbs a ramp keeps its ground part)
        gl = P3[:, 1] < 3.45
        for a in range(ln - 1):
            if gl[a] and gl[a + 1]:
                cor.append(LineString(P3[a:a + 2][:, [0, 2]]).buffer(max(wd / 2, 2.5), cap_style='round', quad_segs=4))
    corridor = areal(unary_union(cor)) if cor else Polygon()
    corM = rast_mask(corridor) if not corridor.is_empty else np.zeros((N, N), bool)
    if not corridor.is_empty:
        moved = Polygon()
        for kk in ('sidewalk', 'median', 'plaza'):
            hit = areal(shapely.intersection(fills[kk], corridor, grid_size=GRID))
            if not hit.is_empty:
                fills[kk] = areal(shapely.difference(fills[kk], corridor, grid_size=GRID)); moved = moved.union(hit)
        fills['carriage'] = moved
        stats_moved = round(moved.area, 1)
    else: stats_moved = 0.0; fills['carriage'] = Polygon()
    taken = unary_union([fills[k] for k in fills])
    covM = rast_mask(unary_union([covered, taken]))
    roadM = rast_mask(unary_union([road, fills['roadbed'], fills['median_flat'], fills['parking'], fills['carriage']]))
    deckM = rast_mask(deck) if not deck.is_empty else np.zeros((N, N), bool)
    if paint_parts: deckM |= rast_mask(shapely.union_all(np.concatenate(paint_parts), grid_size=GRID))   # paint counts as roadway for the reach (the probe's)
    raisedM = rast_mask(unary_union([walkc, fills['sidewalk'], fills['median'], fills['plaza']])) | (covM & ~roadM)
    raisedM |= rast_mask(elev_raised) if not elev_raised.is_empty else False
    parkM = rast_mask(unary_union([plan['parks'], plan['openother']]))
    blockM = rast_mask(unary_union([bld] + holes))

    D = int(round(1.5 / R)); st = np.ones((2 * D + 1, 2 * D + 1), bool); s8 = np.ones((3, 3), bool)
    nearDeck = ndimage.binary_dilation(deckM, st)
    leftM = {'left_road': np.zeros((N, N), bool), 'left_walk': np.zeros((N, N), bool), 'left_grass': np.zeros((N, N), bool)}
    passes = 0
    border = np.zeros((N, N), bool); border[:8, :] = border[-8:, :] = border[:, :8] = border[:, -8:] = True
    for passes in range(1, 25):
        nearR = ndimage.binary_dilation(roadM | deckM, st) | corM; nearW = ndimage.binary_dilation(raisedM, st)
        seeds = ~covM & ((nearR & nearW) | corM) & ~blockM & ~border   # bare ground on a carriageway is a gap too
        if not seeds.any(): break
        # each gap takes the bare ground it is connected to: the whole pocket when it is small (a corner, a sliver between
        # surfaces, a gap between buildings: 600 m2 or less), else the part within the roadway's reach (1.5 m), its stepped
        # outline closed (a lot or a yard beyond keeps its ground)
        bare = ~covM & ~blockM & ~border
        labA, nA = ndimage.label(bare, s8)
        ids = np.unique(labA[seeds]); ids = ids[ids > 0]
        sizes = ndimage.sum(bare, labA, ids)
        small = np.zeros(nA + 1, bool); small[ids[sizes * R * R <= 600]] = True
        bigc = np.zeros(nA + 1, bool); bigc[ids[sizes * R * R > 600]] = True
        band = bigc[labA] & nearR
        band = ndimage.binary_closing(band, np.ones((5, 5), bool)) & bigc[labA]
        zone = small[labA] | band
        lab, nl = ndimage.label(zone, s8)
        rb = ndimage.binary_dilation(roadM, s8) & ~roadM; wb = ndimage.binary_dilation(raisedM & ~roadM, s8)
        ix = np.arange(1, nl + 1)
        cr = ndimage.sum(rb, lab, ix); cw = ndimage.sum(wb, lab, ix); cp = ndimage.mean(parkM, lab, ix); cd = ndimage.sum(nearDeck, lab, ix)
        cn = ndimage.sum(lab > 0, lab, ix)
        # walk unless the cluster lies in a park (lawn), by an elevated deck (roadway at grade) or is a small pocket the
        # roadway closes round (roadway): a walk fill does not widen the roadway's reach, so the passes end
        cc = ndimage.mean(corM, lab, ix)   # on a carriageway the street graph drives: roadway
        kind = np.where(cc > 0.5, 0, np.where(cp > 0.5, 2, np.where(cd > 0, 0, np.where((cr > 2 * cw) & (cn <= 64), 0, 1))))   # 0 road, 1 walk, 2 lawn
        km = np.concatenate([[3], kind])[lab]; gapM = lab > 0
        km = np.where(gapM & corM, 0, km)   # the carriageway's own cells are roadway whatever the pocket is
        for kk, name in ((0, 'left_road'), (1, 'left_walk'), (2, 'left_grass')):
            m = gapM & (km == kk)
            leftM[name] |= m; covM |= m
            if kk == 0: roadM |= m
            else: raisedM |= m
    def cells_poly(m):
        # horizontal runs of cells as rectangles, merged, smoothed and cut back by what is there: the edge toward a compiled
        # surface is that surface's own edge (a kerb face along it is straight), toward bare ground a smooth outline
        rects = []
        for j in range(N):
            row = m[j]
            if not row.any(): continue
            d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
            for a0, a1 in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]): rects.append(box(a0 * R, j * R, a1 * R, (j + 1) * R))
        if not rects: return Polygon()
        # closed by 0.6 m (the cells' steps become one smooth outline, never smaller than the cells), net 15 cm grown
        g = unary_union(rects).buffer(0.6, join_style='round', quad_segs=4).buffer(-0.45, join_style='round', quad_segs=4)
        return areal(shapely.difference(areal(g), areal(unary_union([covered, taken, bld] + holes)), grid_size=GRID).intersection(tb))
    for name, m in leftM.items():
        fills[name] = cells_poly(m).difference(taken); taken = taken.union(fills[name])
    out = {}
    walk_tris = None
    def clip_walk(c):
        # a walk fill triangle with the compiled walks cut out of it exactly (no snapping): the street kit lays flags on every
        # walk triangle, and a sliver of fill over a compiled walk puts flags on flags (the export lifts the flag mesh)
        nonlocal walk_tris
        if walk_tris is None:
            walk_tris = (shapely.STRtree(walk_parts_all), walk_parts_all) if len(walk_parts_all) else (None, None)
        tree, polys_ = walk_tris
        t = Polygon(c)
        if tree is None: return [c]
        hit = [polys_[i] for i in tree.query(t) if polys_[i].intersection(t).area > 1e-7]
        if not hit: return [c]
        try: rest = areal(t.difference(unary_union(hit)))
        except Exception: return []
        out_ = []
        for p in polys(rest):
            if p.area < 1e-5: continue
            for q in polys(shapely.constrained_delaunay_triangles(p)): out_.append(np.array(q.exterior.coords[:3]))
        return out_
    def emit(kind, g, yf, dy, grow_into):
        if g.is_empty: return 0
        g = areal(g.simplify(0.002, preserve_topology=True))   # collinear points only: the edges stay where the neighbours' are
        if g.is_empty: return 0
        if grow_into is not None:
            g2 = areal(shapely.intersection(areal(g.buffer(0.05, join_style='mitre')), areal(shapely.union(g, areal(grow_into), grid_size=GRID)), grid_size=GRID))
            g2 = areal(shapely.intersection(g2, tb, grid_size=GRID))
        else: g2 = g
        g2 = areal(shapely.difference(g2, areal(unary_union([bld] + holes)), grid_size=GRID))
        nt = 0
        for p in polys(g2):
            if p.area < 0.01: continue
            p = shapely.segmentize(p, 12.0)
            tris = shapely.constrained_delaunay_triangles(p)
            cs = [np.array(t.exterior.coords[:3]) for t in polys(tris)]
            if grow_into is None and kind != 'grass': cs = [q for c in cs for q in clip_walk(c)]
            for c in cs:
                y = yf(c[:, 0], c[:, 1]) - dy
                sh = (c[1, 0] - c[0, 0]) * (c[2, 1] - c[0, 1]) - (c[2, 0] - c[0, 0]) * (c[1, 1] - c[0, 1])
                order = [0, 1, 2] if sh < 0 else [0, 2, 1]
                out.setdefault(kind, []).extend([v for o in order for v in (c[o, 0], y[o], c[o, 1])]); nt += 1
        return nt
    walk_all = unary_union([walkc, fills['sidewalk'], fills['median'], fills['plaza'], fills['left_walk']])
    road_all = unary_union([road, fills['roadbed'], fills['median_flat'], fills['parking'], fills['carriage'], fills['left_road']])
    stats = {'key': key, 'walk_to_road_m2': stats_moved}
    roadfill = unary_union([fills['roadbed'], fills['median_flat'], fills['parking'], fills['carriage'], fills['left_road']])
    stats['road'] = emit('asphalt', roadfill, yR, 0.003, covered)
    walkfill = unary_union([fills['sidewalk'], fills['median'], fills['plaza'], fills['left_walk']])
    # a walk fill takes the kind and the height of the compiled walk it meets most (a park's path, a plaza, the sidewalk), so
    # its seams with them show neither a step nor a change of paving; sidewalk where it meets none
    kinds = [k for k in WALK_KIND if k in hK]
    if kinds:
        st_k = np.stack([np.nan_to_num(hK[k], nan=-1e9) for k in kinds]); top = np.argmax(st_k, axis=0); anyK = np.max(st_k, axis=0) > -1e8
    fields = {}
    def kfield(k):
        if k not in fields: fields[k] = nearest_field(hK[k], Y_WALK - 3.24) if k in hK else yW
        return fields[k]
    stats['walk'] = 0; wk = collections.Counter()
    for p in polys(walkfill):
        k = 'sidewalk'
        if kinds:
            ringM = rast_mask(p.buffer(0.6, join_style='round', quad_segs=2)) & anyK
            if ringM.any():
                cnt = np.bincount(top[ringM], minlength=len(kinds)); k = kinds[int(np.argmax(cnt))]
        wk[k] += 1
        stats['walk'] += emit(k, p, kfield(k), 0.0, None)
    stats['walk_kinds'] = dict(wk)
    grass_c = shapely.union_all(np.concatenate(grass_parts), grid_size=GRID) if grass_parts else Polygon()
    stats['lawn'] = emit('grass', fills['left_grass'], yG, 0.004, grass_c)
    stats['passes'] = passes
    # kerbs: walk-fill edges that meet roadway, where no compiled kerb face stands within 12 cm
    kc = K.get('curb', np.zeros(0, np.float32)).reshape(-1, 3, 3)
    segs = []
    for t in kc:
        xz = t[:, [0, 2]]
        if abs((xz[1, 0] - xz[0, 0]) * (xz[2, 1] - xz[0, 1]) - (xz[2, 0] - xz[0, 0]) * (xz[1, 1] - xz[0, 1])) < 1e-4:
            d = [np.hypot(*(xz[a] - xz[b])) for a, b in ((0, 1), (1, 2), (0, 2))]; a, b = ((0, 1), (1, 2), (0, 2))[int(np.argmax(d))]
            if d[int(np.argmax(d))] > 1e-3: segs.append(LineString([xz[a], xz[b]]))
    kt = STRtree(segs) if segs else None
    roadish = road_all.buffer(0.02)
    nk = 0; kerbs = []
    walkish = walk_all.buffer(0.02); road_in = road_all.buffer(-0.01); walk_in = walk_all.buffer(-0.01)
    for g in (walkish, road_in, walk_in, roadish): shapely.prepare(g)
    def walk_y(pt): return float(yW(np.array([pt[0]]), np.array([pt[1]]))[0]) - 0.004
    for p in polys(roadfill.simplify(0.03, preserve_topology=True)):
        # a road fill's edge against a walk (compiled or filled) with no kerb face: the face, toward the road
        pb = p.buffer(1e-3); shapely.prepare(pb)
        for ring in [p.exterior] + list(p.interiors):
            cs = np.array(ring.coords)
            for a, b in zip(cs[:-1], cs[1:]):
                L = np.hypot(*(b - a))
                if L < 0.1: continue
                mid = (a + b) / 2; nrm = np.array([-(b - a)[1], (b - a)[0]]) / L
                o1, o2 = mid + nrm * 0.15, mid - nrm * 0.15
                inside, out_pt = (o1, o2) if pb.contains(shapely.Point(o1)) else (o2, o1)
                if not walkish.contains(shapely.Point(out_pt)) or road_in.contains(shapely.Point(out_pt)): continue
                if kt is not None:
                    seg = LineString([a, b]); near = kt.query(seg.buffer(0.12))
                    if len(near) and sum(segs[i].intersection(seg.buffer(0.12)).length for i in near) > 0.6 * L: continue
                yt = walk_y(mid)
                if yt - float(yR(np.array([mid[0]]), np.array([mid[1]]))[0]) < 0.05: continue
                side = np.sign((b - a)[0] * (inside - a)[1] - (b - a)[1] * (inside - a)[0])
                A, Bp = (a, b) if side > 0 else (b, a)
                q = [(A[0], Y_KERB0, A[1]), (Bp[0], Y_KERB0, Bp[1]), (Bp[0], yt, Bp[1]), (A[0], yt, A[1])]
                for tri in ((q[0], q[1], q[2]), (q[0], q[2], q[3])): out.setdefault('curb', []).extend([v for pt in tri for v in pt])
                nk += 1; kerbs.append(L)
    for p in polys(walkfill.simplify(0.03, preserve_topology=True)):
        pb = p.buffer(1e-3); shapely.prepare(pb)
        for ring in [p.exterior] + list(p.interiors):
            cs = np.array(ring.coords)
            for a, b in zip(cs[:-1], cs[1:]):
                L = np.hypot(*(b - a))
                if L < 0.05: continue
                mid = (a + b) / 2; nrm = np.array([-(b - a)[1], (b - a)[0]]) / L
                o1, o2 = mid + nrm * 0.15, mid - nrm * 0.15
                out_pt = o1 if not pb.contains(shapely.Point(o1)) else o2
                if not roadish.contains(shapely.Point(out_pt)) or walk_in.contains(shapely.Point(out_pt)): continue
                if kt is not None:
                    seg = LineString([a, b]); near = kt.query(seg.buffer(0.12))
                    if len(near) and sum(segs[i].intersection(seg.buffer(0.12)).length for i in near) > 0.6 * L: continue
                yt = float(yW(np.array([mid[0]]), np.array([mid[1]]))[0]) - 0.004
                if yt - float(yR(np.array([mid[0]]), np.array([mid[1]]))[0]) < 0.05: continue
                # face toward the roadway: (b - a) x up points outward when the outward side is on the right
                side = np.sign((b - a)[0] * (out_pt - a)[1] - (b - a)[1] * (out_pt - a)[0])
                A, Bp = (a, b) if side > 0 else (b, a)
                q = [(A[0], Y_KERB0, A[1]), (Bp[0], Y_KERB0, Bp[1]), (Bp[0], yt, Bp[1]), (A[0], yt, A[1])]
                for tri in ((q[0], q[1], q[2]), (q[0], q[2], q[3])): out.setdefault('curb', []).extend([v for pt in tri for v in pt])
                nk += 1; kerbs.append(L)
    # last: the emitted triangles rasterized as the probe does (a cell centre inside a triangle), and any cell the probe would
    # still call a gap gets a quad of the surface beside it (1 cm over the cell's edges): what the outlines' snapping and the
    # triangulation leave, a few cells a tile
    emR = np.zeros((N, N), bool); emW = np.zeros((N, N), bool)
    for k in [k for k in out if k != 'curb']:
        T = np.asarray(out[k], np.float64).reshape(-1, 3, 3)
        if not len(T): continue
        H = np.full((N, N), np.nan, np.float32); rast_h(T.astype(np.float32), H, 'max')
        if k == 'asphalt': emR |= ~np.isnan(H)
        else: emW |= ~np.isnan(H)
    covC = rast_mask(covered)
    blockF = rast_mask(unary_union([bld] + holes[:nst38])) if (len(holes[:nst38]) or not bld.is_empty) else np.zeros((N, N), bool)
    hRF = np.where(np.isnan(hRoadAny), hRoad, hRoadAny)
    if 'asphalt' in out:
        T = np.asarray(out['asphalt'], np.float64).reshape(-1, 3, 3); HA = np.full((N, N), np.nan, np.float32); rast_h(T.astype(np.float32), HA, 'min')
        hRF = np.where(np.isnan(hRF), HA, np.fmin(hRF, HA))
    if np.isnan(hRF).all(): atGrade = np.ones((N, N), bool)
    else:
        dR, iR = ndimage.distance_transform_edt(np.isnan(hRF), return_distances=True, return_indices=True)
        atGrade = ~((dR <= 6) & (tC - 0.12 < hRF[iR[0], iR[1]] - 0.6)) & ~(tC - 0.12 < 0)
    nq = 0; quads = {}
    for it in range(4):
        gapF = ~(covC | emR | emW) & ndimage.binary_dilation(roadM | deckM | emR, st) & ndimage.binary_dilation(raisedM | emW, st) & ~blockF & ~border & atGrade & ~lowM
        if not gapF.any(): break
        for j, i in np.argwhere(gapF):
            x0, z0 = i * R - 0.01, j * R - 0.01; x1, z1 = x0 + R + 0.02, z0 + R + 0.02
            cx, cz = (i + 0.5) * R, (j + 0.5) * R
            # walk or lawn (the quads do not widen the roadway's reach), never on ground under grade, never on a carriageway
            if corM[j, i]: continue
            if parkM[j, i]: kind, y = 'grass', float(yG(np.array([cx]), np.array([cz]))[0]) - 0.004; emW[j, i] = True
            else: kind, y = 'sidewalk', float(yW(np.array([cx]), np.array([cz]))[0]); emW[j, i] = True
            quads.setdefault((kind, round(y, 4)), []).append(box(i * R, j * R, (i + 1) * R, (j + 1) * R)); nq += 1
        gapF &= ~corM
    # the cells as pieces clipped to what is not there yet (no overlap with a compiled surface or a fill: same-kind overlaps
    # double the street kit's flags), at their surface's height
    if quads:
        taken_all = areal(unary_union([covered, roadfill, walkfill, fills['left_grass']]))
        for (kind, y), bx_ in quads.items():
            g = areal(shapely.difference(areal(unary_union(bx_)), taken_all, grid_size=GRID))
            for p in polys(g):
                if p.area < 0.002: continue
                cs = [np.array(t.exterior.coords[:3]) for t in polys(shapely.constrained_delaunay_triangles(p))]
                if kind != 'grass': cs = [q for c in cs for q in clip_walk(c)]
                for c in cs:
                    sh = (c[1, 0] - c[0, 0]) * (c[2, 1] - c[0, 1]) - (c[2, 0] - c[0, 0]) * (c[1, 1] - c[0, 1])
                    for o in ([0, 1, 2] if sh < 0 else [0, 2, 1]): out.setdefault(kind, []).extend([c[o, 0], y, c[o, 1]])
    stats['cell_quads'] = nq
    stats['kerb_m'] = round(float(sum(kerbs)), 1)
    stats['area'] = {k: round(v.area, 1) for k, v in fills.items()}
    # write
    parts, idx, off = [], {}, 0
    for k, v in out.items():
        f = np.asarray(v, np.float32); idx[k] = [off, len(f)]; parts.append(f); off += len(f)
    os.makedirs(outdir, exist_ok=True)
    J = json.dumps({'key': key, 'kinds': idx}).encode()
    with open(os.path.join(outdir, key + '.bin'), 'wb') as fo:
        fo.write(struct.pack('<I', len(J))); fo.write(J)
        for f in parts: fo.write(f.tobytes())
    stats['tris'] = {k: len(v) // 9 for k, v in out.items()}
    return stats

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--chain', required=True); ap.add_argument('--tiles'); ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'data', 'gf38')); ap.add_argument('-j', type=int, default=24)
    a = ap.parse_args()
    fns = sorted(glob.glob(os.path.join(a.chain, '*.bin')))
    # the 49 tiles of the 125th Street box (city/areas.js B125; the dump's ring round them is context only)
    want = a.tiles.split(',') if a.tiles else [f'{x}_{z}' for x in range(1, 8) for z in range(-9, -2)]
    fns = [f for f in fns if os.path.basename(f)[:-4] in want]
    with Pool(a.j) as pool: S = pool.map(bake, [(f, a.out) for f in fns])
    man = json.load(open(os.path.join(ROOT, 'public', 'tiles', 'manifest.json')))
    ip = os.path.join(a.out, 'index.json')
    idx = json.load(open(ip)) if os.path.exists(ip) else {'tiles': {}}
    for s in S:
        idx['tiles'][s['key']] = {'bytes': os.path.getsize(os.path.join(ROOT, 'public', 'tiles', man['tiles'][s['key']]['f'])), **{k: v for k, v in s.items() if k != 'key'}}
    idx['source'] = 'NYC Planimetric Database (data.cityofnewyork.us 52n9-sdep, i36f-5ih7, ees7-4ufv, 7cgt-uhhz, ue2e-9jm2), fetched 2026-10-05'
    json.dump(idx, open(ip, 'w'), indent=0)
    for s in S: print(json.dumps(s))
