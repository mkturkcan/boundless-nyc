# CP32 relief bake (city/cpRelief.js): Central Park's ground over a smooth surface spanning its perimeter.
#
# The city is compiled on a flat datum, so the park's relief is put back at runtime from the USGS 3DEP points the
# compiler sampled for it (data/raw/park_elev_1.json: [x, z, h] on a 14 m lattice, h NAVD88 m). The reference surface
# is the harmonic membrane through the park's edge (Laplace's equation inside the NYC Parks polygon M010 with the
# ground along the edge as the boundary), so relief = ground - membrane is 0 all along the edge, where the park meets
# the flat streets, and is the real relief inside. It is tapered to 0 over the last 28 m inside the edge and over 20 m
# either side of the four transverse roads (they stay on the city's datum and pass through the park sunken, as they do).
#
# Water stays level: the membrane varies across a lake, so a lake's one level came out tilted (the Pond 1.35 m over 50 m,
# the Reservoir 1.2 m); over each lake, pond and basin (LAND's bodies, city/cpLandData.js WATER, dumped to JSON) the
# membrane is held at its mean and blended back over 60 m round it, and the tapers do not act inside a body.
# Bridges: 3DEP is bare earth, so a drive or path on a bridge followed the ground down into the valley or the Lake (West
# Drive at Balcony Bridge to -7.95 under water at -4.5). Each OSM highway way tagged bridge inside the park is extended
# from both ends to the approach's shoulder (the relief's local maximum along its line, at most 40 m) and baked as a deck
# line whose relief runs straight between those two points (city/cpRelief.js cpBridgeRelief; centralPark.js lifts the
# hard sections in its corridor to it).
#
#   python client/tools/cp/relief_bake.py <water_bodies.json> <bridges.json>   -> client/src/city/cpReliefData.js
import base64, json, math, os, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data', 'raw')
LAT0, LON0 = 40.7831, -73.9712
M_LAT = 111132.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
proj = lambda lon, lat: ((lon - LON0) * M_LON, -(lat - LAT0) * M_LAT)
STEP = 14.0
EDGE_TAPER = 28.0      # m inside the park's edge over which the relief rises from 0
TV_CLEAR, TV_TAPER = 4.0, 20.0   # m beyond a transverse's half width: flat, then rising

# the park polygon (NYC Parks properties, M010), every ring (even-odd inside test)
parks = json.load(open(os.path.join(RAW, 'parks_1.geojson'), encoding='utf8'))
cp = next(f for f in parks['features'] if f['properties'].get('gispropnum') == 'M010')
g = cp['geometry']
polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
rings = [np.array([proj(*p[:2]) for p in ring]) for poly in polys for ring in poly]
allv = np.vstack(rings)
X0, X1 = allv[:, 0].min() - 3 * STEP, allv[:, 0].max() + 3 * STEP
Z0, Z1 = allv[:, 1].min() - 3 * STEP, allv[:, 1].max() + 3 * STEP

# the 3DEP lattice
P = np.array(json.load(open(os.path.join(RAW, 'park_elev_1.json'))))
P = P[(P[:, 0] > X0) & (P[:, 0] < X1) & (P[:, 1] > Z0) & (P[:, 1] < Z1)]
ox = P[:, 0].min() - STEP * math.floor((P[:, 0].min() - X0) / STEP)
oz = P[:, 1].min() - STEP * math.floor((P[:, 1].min() - Z0) / STEP)
nx = int(math.ceil((X1 - ox) / STEP)) + 1
nz = int(math.ceil((Z1 - oz) / STEP)) + 1
D = np.full((nz, nx), np.nan)
ii = np.rint((P[:, 0] - ox) / STEP).astype(int)
jj = np.rint((P[:, 1] - oz) / STEP).astype(int)
ok = (ii >= 0) & (ii < nx) & (jj >= 0) & (jj < nz)
D[jj[ok], ii[ok]] = P[ok, 2]
off = np.abs((P[:, 0] - ox) / STEP - np.rint((P[:, 0] - ox) / STEP)).max()
print(f'lattice {nx} x {nz} at {STEP} m from ({ox:.1f}, {oz:.1f}); {ok.sum()} points, max lattice offset {off:.3f} cells')

gx = ox + np.arange(nx) * STEP
gz = oz + np.arange(nz) * STEP
GX, GZ = np.meshgrid(gx, gz)

# inside the park (even-odd over all rings) and the distance to its edge
inside = np.zeros(GX.shape, bool)
dist = np.full(GX.shape, 1e9)
for R in rings:
    A, B = R[:-1], R[1:]
    for (ax, az), (bx, bz) in zip(A, B):
        c = ((az > GZ) != (bz > GZ)) & (GX < (bx - ax) * (GZ - az) / ((bz - az) if bz != az else 1e-12) + ax)
        inside ^= c
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-12
        t = np.clip(((GX - ax) * dx + (GZ - az) * dz) / L2, 0, 1)
        dist = np.minimum(dist, np.hypot(GX - ax - dx * t, GZ - az - dz * t))
print('park cells', inside.sum(), 'with ground', (inside & ~np.isnan(D)).sum())

# fill ground holes inside the park (under buildings the compiler did not sample) from the neighbours
Dfill = D.copy()
for _ in range(400):
    miss = inside & np.isnan(Dfill)
    if not miss.any(): break
    pad = np.pad(Dfill, 1, constant_values=np.nan)
    nb = np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
    m = np.nanmean(np.where(np.isnan(nb), np.nan, nb), axis=0) if np.isfinite(nb).any() else None
    Dfill[miss & np.isfinite(m)] = m[miss & np.isfinite(m)]
# and outside, for the membrane's boundary ring and the bilinear taps across the edge
for _ in range(6):
    pad = np.pad(Dfill, 1, constant_values=np.nan)
    nb = np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
    with np.errstate(all='ignore'):
        import warnings; warnings.simplefilter('ignore')
        m = np.nanmean(nb, axis=0)
    miss = np.isnan(Dfill) & np.isfinite(m)
    Dfill[miss] = m[miss]

# the membrane: the edge band (the cells within one lattice step of the edge, or outside) holds the ground; Laplace inside
fixed = (~inside) | (dist < STEP)
free = inside & ~fixed
Ref = np.where(np.isfinite(Dfill), Dfill, np.nanmean(Dfill[inside]))
Ref[free] = np.nanmean(Dfill[fixed & inside])
# red-black successive over-relaxation (a simultaneous over-relaxed update diverges)
JJ, II = np.indices(Ref.shape)
halves = [free & ((II + JJ) % 2 == 0), free & ((II + JJ) % 2 == 1)]
for it in range(20000):
    delta = 0.0
    for M in halves:
        pad = np.pad(Ref, 1, mode='edge')
        avg = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]) * 0.25
        step = 1.9 * (avg[M] - Ref[M])
        Ref[M] += step
        delta = max(delta, float(np.abs(step).max()))
    if delta < 2e-4: break
print(f'membrane: {it} iterations, last change {delta:.2e} m')

# the transverse roads (CSCL), kept on the city's datum
streets = json.load(open(os.path.join(RAW, 'streets_1.geojson'), encoding='utf8'))
tv = []
for f in streets['features']:
    p, gg = f['properties'], f['geometry']
    nm = ' '.join(((p.get('stname_label') or p.get('full_street_name') or '')).split())
    if not gg or 'TRANSVERSE' not in nm: continue
    w = (float(p.get('streetwidth') or 30) * 0.3048) / 2
    lines = gg['coordinates'] if gg['type'] == 'MultiLineString' else [gg['coordinates']]
    for line in lines:
        pts = np.array([proj(*q[:2]) for q in line])
        if ((pts[:, 0] > X0) & (pts[:, 0] < X1) & (pts[:, 1] > Z0) & (pts[:, 1] < Z1)).any(): tv.append((pts, w, nm))
print('transverse pieces', len(tv), sorted(set(t[2] for t in tv)))
tvT = np.ones(GX.shape)
for pts, w, _ in tv:
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-12
        t = np.clip(((GX - ax) * dx + (GZ - az) * dz) / L2, 0, 1)
        d = np.hypot(GX - ax - dx * t, GZ - az - dz * t)
        s = np.clip((d - w - TV_CLEAR) / TV_TAPER, 0, 1)
        tvT = np.minimum(tvT, s * s * (3 - 2 * s))

def ring_mask(ring, pad):
    # cells inside the ring (even-odd), and their distance to it, within the ring's box + pad
    x0, z0 = ring[:, 0].min() - pad, ring[:, 1].min() - pad
    x1, z1 = ring[:, 0].max() + pad, ring[:, 1].max() + pad
    sel = (GX > x0) & (GX < x1) & (GZ > z0) & (GZ < z1)
    ins = np.zeros(GX.shape, bool); dd = np.full(GX.shape, 1e9)
    X, Z = GX[sel], GZ[sel]
    ii2 = np.zeros(X.shape, bool); d2 = np.full(X.shape, 1e9)
    for (ax, az), (bx, bz) in zip(ring, np.roll(ring, -1, axis=0)):
        c = ((az > Z) != (bz > Z)) & (X < (bx - ax) * (Z - az) / ((bz - az) if bz != az else 1e-12) + ax)
        ii2 ^= c
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-12
        t = np.clip(((X - ax) * dx + (Z - az) * dz) / L2, 0, 1)
        d2 = np.minimum(d2, np.hypot(X - ax - dx * t, Z - az - dz * t))
    ins[sel] = ii2; dd[sel] = d2
    return ins, dd
water = json.load(open(sys.argv[1], encoding='utf8')) if len(sys.argv) > 1 else []
inWater = np.zeros(GX.shape, bool)
for w in water:
    if w['kind'] == 'stream': continue
    ring = np.array(w['outer'], float).reshape(-1, 2)
    ins, dd = ring_mask(ring, 70.0)
    if not ins.any(): continue
    Sb = float(Ref[ins].mean())
    s = np.clip(dd / 60.0, 0, 1)
    wgt = np.where(ins, 1.0, 1 - s * s * (3 - 2 * s))
    Ref = Ref + wgt * (Sb - Ref)
    inWater |= ins
    print(f"  level {w['name'][:26]:26s} membrane held at {Sb:6.2f} (it spanned {float(Ref[ins].min()):6.2f}..{float(Ref[ins].max()):6.2f} after)")

se = np.clip(dist / EDGE_TAPER, 0, 1)
edgeT = np.where(inside, se * se * (3 - 2 * se), 0.0)
rel = np.where(inside & np.isfinite(Dfill), (Dfill - Ref) * np.where(inWater, 1.0, edgeT) * np.where(inWater, 1.0, tvT), 0.0)
print(f'relief: min {rel.min():.2f}  max {rel.max():.2f}  mean |r| {np.abs(rel[inside]).mean():.2f} m')

def at(x, z):
    fx, fz = (x - ox) / STEP, (z - oz) / STEP
    i, j = int(fx), int(fz); u, v = fx - i, fz - j
    b = lambda a: a[j, i] * (1 - u) * (1 - v) + a[j, i + 1] * u * (1 - v) + a[j + 1, i] * (1 - u) * v + a[j + 1, i + 1] * u * v
    return b(Dfill), b(Ref), b(rel)
for n, x, z in [('lake near Bow', 20, 850), ('Bethesda lower terrace', 25, 1000), ('fountain', 30.9, 976.2), ('drive at the Arcade', 12, 1045),
                ('Mall north', 0, 1080), ('Mall south', -105, 1440), ('Bow Bridge', -47.9, 815.8), ('Cherry Hill', -127, 934), ('Boathouse', 205, 864),
                ('Turtle Pond', 275, 404), ('Belvedere', 194.5, 420), ('Great Lawn', 390, 196), ('Reservoir', 769, -264), ('the Pond', -290, 1871),
                ('Gapstow', -222, 1797), ('Harlem Meer', 1603, -1456), ('Conservatory Water', 343, 987), ('Sheep Meadow', -327, 1286)]:
    d, r, e = at(x, z)
    print(f'  {n:24s} ground {d:6.2f}  membrane {r:6.2f}  relief {e:+6.2f}  -> world y {3.51 + e:6.2f}')

# the bridges' deck lines (see the header): the relief on the grid's triangles, as city/cpRelief.js has it
def relAt(x, z):
    fx, fz = (x - ox) / STEP, (z - oz) / STEP
    i, j = int(math.floor(fx)), int(math.floor(fz)); u, v = fx - i, fz - j
    if i < 0 or j < 0 or i >= nx - 1 or j >= nz - 1: return 0.0
    a00, a10, a01, a11 = rel[j, i], rel[j, i + 1], rel[j + 1, i], rel[j + 1, i + 1]
    return float(a00 + (a10 - a00) * u + (a11 - a10) * v if u >= v else a00 + (a01 - a00) * v + (a11 - a01) * u)
def inPark(x, z):
    i, j = int(round((x - ox) / STEP)), int(round((z - oz) / STEP))
    return 0 <= i < nx and 0 <= j < nz and bool(inside[j, i])
# half widths: the drives (tagged pedestrian or unclassified since they closed) carry the compiled carriageway and a
# sidewalk each side, ~18 m in all
HW = {'footway': 2.2, 'path': 2.0, 'cycleway': 2.2, 'bridleway': 2.6, 'steps': 2.0, 'pedestrian': 9.0, 'service': 4.0, 'unclassified': 9.0, 'secondary': 9.0, 'tertiary': 9.0}
# the footbridges the landmarks part builds itself (city/cpLandmarks.js cuts their paths and lays its own): Bow Bridge,
# Gapstow Bridge, Oak Bridge
OWN = {306771373, 113049812, 302774807}
ROADS = {'pedestrian', 'unclassified', 'secondary', 'tertiary', 'service'}
decks = []
for b in (json.load(open(sys.argv[2], encoding='utf8')) if len(sys.argv) > 2 else []):
    if b['kind'] in ('area', 'motorway') or len(b['pts']) < 2 or b['id'] in OWN: continue
    P = np.array(b['pts'], float)
    if not inPark(*P.mean(0)): continue
    # a drive's shoulder is found wherever the approach tops out (the 14 m grid smooths a 5 m valley under it: West Drive
    # at Balcony Bridge); a footway's is held within 1.5 m of its own end (a low footbridge's path otherwise climbed to
    # the next knoll 40 m out: Oak Bridge's rose 7 m over the Lake)
    cap = 1e9 if b['kind'] in ROADS else 1.5
    def shoulder(p, d):
        best, rb = p, relAt(*p)
        top = rb + cap
        for s in range(2, 42, 2):
            q = p + d * s
            rq = relAt(*q)
            if rq < rb - 0.02 or rq > top: break
            if rq > rb: best, rb = q, rq
        return best, rb
    dA = P[0] - P[1]; dA /= (np.hypot(*dA) or 1); dB = P[-1] - P[-2]; dB /= (np.hypot(*dB) or 1)
    A, rA = shoulder(P[0], dA); B, rB = shoulder(P[-1], dB)
    line = ([A] if np.hypot(*(A - P[0])) > 0.5 else []) + list(P) + ([B] if np.hypot(*(B - P[-1])) > 0.5 else [])
    cum = [0.0]
    for q0, q1 in zip(line, line[1:]): cum.append(cum[-1] + float(np.hypot(*(q1 - q0))))
    L = cum[-1] or 1.0
    ground = [relAt(*q) for q in line]
    deck = [rA + (rB - rA) * c / L for c in cum]
    lift = max(d - g for d, g in zip(deck, ground))
    decks.append({'hw': HW.get(b['kind'], 2.5) + 1.0, 'pts': [round(float(v), 2) for q, r in zip(line, deck) for v in (q[0], q[1], r)]})
    if lift > 0.5: print(f"  deck {b['kind']:12s} {(b['name'] or '')[:24]:24s} {L:5.1f} m, lifts the way up to {lift:4.1f} m over the ground")
print(f'bridge decks: {len(decks)}')

enc = lambda a: base64.b64encode(np.rint(a * 100).clip(-32767, 32767).astype('<i2').tobytes()).decode()
out = os.path.join(ROOT, 'src', 'city', 'cpReliefData.js')
with open(out, 'w', encoding='utf8', newline='\n') as fo:
    fo.write('// CP32 relief grid, baked by client/tools/cp/relief_bake.py from the USGS 3DEP points in data/raw/park_elev_1.json\n')
    fo.write('// (public domain) and the NYC Parks polygon M010: rel = the ground over the membrane through the park\'s edge,\n')
    fo.write('// dem = the ground itself, both int16 centimetres, row-major z then x, on the 14 m lattice from (x0, z0).\n')
    fo.write(f'export const CP_RELIEF = {{ x0: {ox:.3f}, z0: {oz:.3f}, step: {STEP}, nx: {nx}, nz: {nz},\n')
    fo.write(f"  rel: '{enc(rel)}',\n")
    fo.write(f"  dem: '{enc(np.where(np.isfinite(Dfill), Dfill, 0))}',\n")
    fo.write('  // bridges: deck lines [x, z, relief, ...] and their half widths (OSM highway ways tagged bridge, (c) OpenStreetMap contributors, ODbL)\n')
    fo.write(f"  decks: {json.dumps(decks, separators=(',', ':'))} }};\n")
print('wrote', out, os.path.getsize(out), 'bytes')
