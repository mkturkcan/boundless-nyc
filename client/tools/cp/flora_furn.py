# CP32F step 5: the park's lamps, benches and litter baskets, appended to city/cpFloraData.js (after flora_place.py).
# LAMPS: OpenStreetMap's 121 mapped park lamps (highway=street_lamp) where they are; elsewhere one every 34 m along the
# paved paths (a side chosen per path, 0.5 m off its edge), every 30 m staggered along both edges of the drives, and
# along the Mall midway between its elms behind the benches. A generated lamp keeps 12 m from any other, 15 m from a
# mapped one, 1.2 m from a trunk, and out of the water, buildings and pavement. The real park has over 1,800 posts.
# BENCHES (the 1939 World's Fair settee, 8 ft = 2.44 m): OpenStreetMap's 454 mapped benches turned to face their
# nearest path; the Mall's continuous runs along both sides of the central walk; runs of 3-7 along the paved paths
# (fewer in the woods). LITTER BASKETS: OSM's 40, and one at the end of each generated run.
#
#   python tools/cp/flora_furn.py <scratchDir> <cpFloraData.js to append to>
import sys, os, json, math
import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon, Point, LineString
from shapely.strtree import STRtree

D = sys.argv[1]; OUT = sys.argv[2]
G = json.load(open(os.path.join(D, 'grid.json'))); RES = G['RES']; U0, V0 = G['U0'], G['V0']
A = math.radians(G['A']); DU = (math.sin(A), -math.cos(A)); DV = (math.cos(A), math.sin(A)); OO = G['O']
def w2uv(x, z):
    dx, dz = x - OO[0], z - OO[1]; return (dx * DU[0] + dz * DU[1], dx * DV[0] + dz * DV[1])
def uv2w(u, v): return (OO[0] + u * DU[0] + v * DV[0], OO[1] + u * DU[1] + v * DV[1])
O = np.load(os.path.join(D, 'grid_osm.npz'))
paved = O['paths'] | O['drives'] | O['steps'] | O['plaza']
blocked = O['water'] | O['bldg'] | O['pitch'] | ~O['park']
wood = O['wood']
SHAPE = wood.shape
# the Reservoir (the largest water body): its embankment's first 4.5 m hold the fence and the track (LAND)
_wl, _wn = ndimage.label(O['water'])
_ws = ndimage.sum(np.ones_like(_wl), _wl, index=np.arange(1, _wn + 1))
dRes = ndimage.distance_transform_edt(_wl != 1 + int(np.argmax(_ws))) * RES
def res_d(x, z):
    rc = cell(x, z)
    return 1e9 if rc is None else float(dRes[rc])
def cell(x, z):
    u, v = w2uv(x, z); r, c = int((v - V0) / RES), int((u - U0) / RES)
    if r < 0 or c < 0 or r >= SHAPE[0] or c >= SHAPE[1]: return None
    return r, c
BT_O = (31.313, 976.286); BT_A = math.radians(16.85)
def on_terrace(x, z):
    # Bethesda Terrace's footprint (flora_place.py; the BETHESDA part lights and furnishes it itself)
    dx, dz = x - BT_O[0], z - BT_O[1]
    a = dx * math.sin(BT_A) - dz * math.cos(BT_A); b = dx * math.cos(BT_A) + dz * math.sin(BT_A)
    if -106 < a < 31 and abs(b) < 30: return True
    if -109 < a <= -106 and abs(b) < 7.5: return True          # the Mall stair's head (BETHESDA)
    return (x + 127.2) ** 2 + (z - 934.0) ** 2 < 5.5 ** 2      # the Cherry Hill Fountain (BETHESDA)
# LANDMARKS' structures (their list, 07:52): no lamp, bench or basket inside (+1 m); 2.5 m round the pedestals
from shapely.geometry import Polygon as _Poly
LM_KEEP = [_Poly(q).buffer(1.0) for q in (
    [[172.1, 376.5], [223.1, 405.2], [202.5, 441.8], [151.5, 413.1]], [[221, 829], [233.8, 890.7], [186.6, 900.5], [173.8, 838.8]],
    [[-39.3, 837.3], [-63.1, 798], [-57, 794.2], [-33.1, 833.6]], [[-35.7, 790.2], [-35.7, 797], [-40.7, 797], [-40.7, 790.2]],
    [[-247.2, 1805.8], [-200, 1781.7], [-196.4, 1788.8], [-243.6, 1812.9]], [[485.6, 378.1], [496.2, 381.3], [493, 391.8], [482.5, 388.7]],
    [[-115.3, 491.8], [-105.6, 484.8], [-93.9, 501], [-103.6, 508]], [[-305.2, 1672.4], [-246.2, 1672.4], [-246.2, 1741.2], [-305.2, 1741.2]])]
LM_STATUES = [(-98.7, 1478.2), (-132.6, 1466.3), (-115.2, 1434.4), (-96.1, 1440.2), (-79.0, 1382.0)]
def on_landmark(x, z):
    if any((x - a) ** 2 + (z - b) ** 2 < 2.5 ** 2 for (a, b) in LM_STATUES): return True
    return any(q.bounds[0] <= x <= q.bounds[2] and q.bounds[1] <= z <= q.bounds[3] and q.contains(Point(x, z)) for q in LM_KEEP)
def free(x, z, pad=0):
    if on_terrace(x, z) or on_landmark(x, z): return False
    rc = cell(x, z)
    if rc is not None and dRes[rc] < 4.5: return False
    if rc is None: return False
    r, c = rc
    sl = (slice(max(0, r - pad), r + pad + 1), slice(max(0, c - pad), c + pad + 1))
    return not (paved[sl].any() or blocked[sl].any())
LAT0, LON0 = 40.7831, -73.9712; MLON = 111320.0 * math.cos(LAT0 * math.pi / 180)
proj = lambda lon, lat: ((lon - LON0) * MLON, -(lat - LAT0) * 111132.0)
J = json.load(open(os.path.join(D, 'osm_flora.json'), encoding='utf-8'))
pk = [e for e in J['elements'] if e['type'] == 'way' and e['id'] == 427818536][0]
PP = Polygon([proj(q['lon'], q['lat']) for q in pk['geometry']])
recs = np.load(os.path.join(D, 'trees_recs.npy'))
TX = recs[:, 0] / 10.0; TZ = recs[:, 1] / 10.0
tgrid = {}
for i, (x, z) in enumerate(zip(TX, TZ)): tgrid.setdefault((int(x // 8), int(z // 8)), []).append(i)
def near_trunk(x, z, r):
    gx, gz = int(x // 8), int(z // 8)
    for a in (gx - 1, gx, gx + 1):
        for b in (gz - 1, gz, gz + 1):
            for i in tgrid.get((a, b), ()):
                if (TX[i] - x) ** 2 + (TZ[i] - z) ** 2 < r * r: return True
    return False
hsh = lambda a, b, k=0: (math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453) % 1.0

# ---- the path network (world metres)
PATHS = []   # (LineString, kind, width, id)
for e in J['elements']:
    t = e.get('tags', {})
    if e['type'] != 'way' or 'highway' not in t or not e.get('geometry'): continue
    hw = t['highway']
    L = LineString([proj(q['lon'], q['lat']) for q in e['geometry']])
    if not PP.intersects(L): continue
    L = L.intersection(PP)
    if L.is_empty or L.geom_type not in ('LineString', 'MultiLineString'): continue
    parts = list(L.geoms) if L.geom_type == 'MultiLineString' else [L]
    surf = t.get('surface', '')
    drive = hw == 'pedestrian' and t.get('name') in ('West Drive', 'East Drive', 'Center Drive') or (hw == 'service' and t.get('name') == 'Terrace Drive')
    if hw in ('secondary', 'primary', 'tertiary', 'motorway', 'motorway_link', 'steps', 'bridleway', 'track', 'elevator'): continue
    if t.get('footway') in ('crossing',) or t.get('bridge') == 'yes' or t.get('tunnel') == 'yes' or t.get('area') == 'yes': continue
    unpaved = surf in ('unpaved', 'ground', 'dirt', 'woodchips', 'grass', 'compacted', 'gravel', 'pebblestone', 'wood', 'rock')
    track = 'Reservoir' in t.get('name', '')
    if unpaved and not track: continue
    if surf == 'fine_gravel' and not track: continue
    try: wd = float(t.get('width'))
    except Exception: wd = 11.0 if drive else {'pedestrian': 6.0, 'service': 6.0, 'cycleway': 3.0}.get(hw, 3.0 if track else 2.6)
    for p in parts:
        if p.length > 4: PATHS.append((p, 'drive' if drive else ('track' if track else hw), wd, e['id']))
print('lit paths', len(PATHS), 'km', round(sum(p[0].length for p in PATHS) / 1000, 1))

# ---- lamps
lamps = []
lgrid = {}
def lamp_ok(x, z, dmin):
    gx, gz = int(x // 16), int(z // 16)
    for a in (gx - 1, gx, gx + 1):
        for b in (gz - 1, gz, gz + 1):
            for (lx, lz, _) in lgrid.get((a, b), ()):
                if (lx - x) ** 2 + (lz - z) ** 2 < dmin * dmin: return False
    return True
def add_lamp(x, z, src):
    lamps.append((x, z, src)); lgrid.setdefault((int(x // 16), int(z // 16)), []).append((x, z, src))
osm_l = 0
for e in J['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('highway') == 'street_lamp':
        x, z = proj(e['lon'], e['lat'])
        if PP.contains(Point(x, z)) and not on_terrace(x, z) and not on_landmark(x, z): add_lamp(x, z, 1); osm_l += 1
# the Mall: midway between elms (s = 6.2 + 25.2 k), 7.6 m each side of the axis, behind the benches
P1 = np.array(uv2w(569.0, 589.9)); P2 = np.array(uv2w(956.0, 504.3))
ax = (P2 - P1) / np.linalg.norm(P2 - P1); nx = np.array([-ax[1], ax[0]])
MALL = []
for side in (-1, 1):
    s = 6.2
    while s < 268:
        p = P1 + ax * s + nx * side * 7.6
        if free(float(p[0]), float(p[1]), 0): add_lamp(float(p[0]), float(p[1]), 2)
        s += 25.2
def mall_band(x, z):
    d = np.array([x, z]) - P1; s, c = float(d @ ax), float(d @ nx)
    return -8 < s < 280 and abs(c) < 22
for (L, kind, wd, oid) in sorted(PATHS, key=lambda p: (p[1] != 'drive', -p[0].length)):
    n = L.length
    if kind == 'drive':
        sides, step, off, s0 = (1, -1), 60.0, wd / 2 + 0.7, 0.0
    else:
        sides, step, off, s0 = ((1 if hsh(oid, 3) < 0.5 else -1),), 34.0, wd / 2 + 0.5, 8.0 + 10 * hsh(oid, 4)
        if n < 18: continue
    for si, side in enumerate(sides):
        s = s0 + (step / 2 if (kind == 'drive' and si) else 0)
        while s < n - 3:
            placed = False
            for ds in (0, 2.5, -2.5, 5, -5):
                ss = min(max(s + ds, 0.5), n - 0.5)
                a = L.interpolate(ss); b = L.interpolate(min(ss + 1.0, n))
                dx, dz = b.x - a.x, b.y - a.y; ln = math.hypot(dx, dz) or 1
                x, z = a.x - dz / ln * off * side, a.y + dx / ln * off * side
                if kind == 'track':   # the Reservoir's track: always on its landward side (the fence is on the other)
                    x2, z2 = a.x + dz / ln * off * side, a.y - dx / ln * off * side
                    if res_d(x2, z2) > res_d(x, z): x, z = x2, z2
                if mall_band(x, z): break
                if not free(x, z, 0) or near_trunk(x, z, 1.2): continue
                if not lamp_ok(x, z, 15 if any(q[2] == 1 for q in lgrid.get((int(x // 16), int(z // 16)), ())) else (10 if kind == 'drive' else 12)): break
                add_lamp(x, z, 0); placed = True; break
            s += step
print('lamps', len(lamps), '(OSM %d, Mall %d)' % (osm_l, sum(1 for l in lamps if l[2] == 2)))

# ---- benches: (x, z, yaw, len); yaw = the way a seated person faces, three's rotation.y for a +z-forward model
benches = []
bgrid = {}
def bench_ok(x, z, dmin=2.3):
    gx, gz = int(x // 8), int(z // 8)
    for a in (gx - 1, gx, gx + 1):
        for b in (gz - 1, gz, gz + 1):
            for (bx, bz) in bgrid.get((a, b), ()):
                if (bx - x) ** 2 + (bz - z) ** 2 < dmin * dmin: return False
    return True
def add_bench(x, z, yaw, ln, src):
    benches.append((x, z, yaw, ln, src)); bgrid.setdefault((int(x // 8), int(z // 8)), []).append((x, z))
# the Mall: continuous both sides, seat front 6.3 m from the axis, facing it
for side in (-1, 1):
    s = 1.5
    k = 0
    while s < 266:
        # gaps where the Literary Walk's statues stand at the walk's edge (Shakespeare, Columbus, Scott, Burns, Halleck)
        p = P1 + ax * (s + 1.22) + nx * side * 6.75
        # (the rows break where a cross path meets the walk, and round the Literary Walk's pedestals)
        if free(float(p[0]), float(p[1]), 0) and not any((p[0] - a) ** 2 + (p[1] - b) ** 2 < 3.6 ** 2 for (a, b) in LM_STATUES):
            f = -nx * side                      # facing the axis
            add_bench(float(p[0]), float(p[1]), math.atan2(f[0], f[1]), 2.44, 2)
        s += 2.44 + 0.4; k += 1
tree = STRtree([p[0] for p in PATHS])
def nearest_path(x, z):
    i = tree.nearest(Point(x, z))
    return PATHS[int(i)]
osm_b = 0
for e in J['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('amenity') == 'bench':
        x, z = proj(e['lon'], e['lat'])
        if not PP.contains(Point(x, z)) or mall_band(x, z) or on_terrace(x, z) or on_landmark(x, z): continue
        L, kind, wd, oid = nearest_path(x, z)
        q = L.interpolate(L.project(Point(x, z)))
        dx, dz = q.x - x, q.y - z; d = math.hypot(dx, dz)
        if d > 12: yaw = hsh(x, z, 5) * 6.2832
        else:
            yaw = math.atan2(dx, dz)
            if d < wd / 2 + 0.45:            # on the pavement: set it back to the path's edge
                x, z = q.x - dx / (d or 1) * (wd / 2 + 0.45), q.y - dz / (d or 1) * (wd / 2 + 0.45)
        if bench_ok(x, z, 1.5): add_bench(x, z, yaw, 2.44, 1); osm_b += 1
# runs along the paved paths: every ~55 m a run of 3-7 on the side away from the lamps (fewer in the woods)
runs = []
for (L, kind, wd, oid) in PATHS:
    if kind in ('drive', 'service') or L.length < 30: continue
    side = -(1 if hsh(oid, 3) < 0.5 else -1)
    s = 12 + 20 * hsh(oid, 6)
    while s < L.length - 12:
        a = L.interpolate(s)
        if (hsh(a.x, a.y, 7) < (0.35 if wood[cell(a.x, a.y) or (0, 0)] else 0.8)) and not mall_band(a.x, a.y):
            nrun = 3 + int(hsh(a.x, a.y, 8) * 5)
            run = []
            for j in range(nrun):
                ss = s + j * 2.74
                if ss > L.length - 2: break
                p = L.interpolate(ss); b = L.interpolate(min(ss + 1.0, L.length))
                dx, dz = b.x - p.x, b.y - p.y; ln = math.hypot(dx, dz) or 1
                off = wd / 2 + 0.45
                x, z = p.x - dz / ln * off * side, p.y + dx / ln * off * side
                if kind == 'track':
                    x2, z2 = p.x + dz / ln * off * side, p.y - dx / ln * off * side
                    if res_d(x2, z2) > res_d(x, z): x, z = x2, z2
                if not free(x, z, 0) or near_trunk(x, z, 1.0) or not bench_ok(x, z) or not lamp_ok(x, z, 1.0): break
                yaw = math.atan2(p.x - x, p.y - z)
                run.append((x, z, yaw))
            if len(run) >= 2:
                for (x, z, yaw) in run: add_bench(x, z, yaw, 2.44, 0)
                runs.append(run)
        s += 55
print('benches', len(benches), '(OSM %d, Mall %d, runs %d)' % (osm_b, sum(1 for b in benches if b[4] == 2), len(runs)))
# ---- litter baskets: OSM's, and one past the end of each run
baskets = []
for e in J['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('amenity') == 'waste_basket':
        x, z = proj(e['lon'], e['lat'])
        if PP.contains(Point(x, z)) and not on_terrace(x, z) and not on_landmark(x, z): baskets.append((x, z))
for run in runs:
    (x0, z0, _), (x1, z1, _) = run[-2], run[-1]
    x, z = x1 + (x1 - x0) * 0.62, z1 + (z1 - z0) * 0.62
    if free(x, z, 0) and not near_trunk(x, z, 0.8): baskets.append((x, z))
# the Mall: a basket every 60 m each side, at the bench line's gaps
print('baskets', len(baskets))

def flat(nums, per_line=24):
    out, line = [], []
    for n in nums:
        line.append(str(n))
        if len(line) >= per_line: out.append('  ' + ','.join(line) + ','); line = []
    if line: out.append('  ' + ','.join(line) + ',')
    return '\n'.join(out)
with open(OUT, 'a', encoding='utf-8', newline='\n') as f:
    f.write('// lamps (tools/cp/flora_furn.py): world x, z in decimetres, source (0 along a path, 1 OpenStreetMap, 2 the Mall)\n')
    f.write('export const CP_LAMPS = [\n' + flat([v for (x, z, s) in lamps for v in (int(round(x * 10)), int(round(z * 10)), s)]) + '\n];\n')
    f.write('// benches: world x, z in decimetres (the seat\'s centre), yaw in milliradians (the way a seated person faces), source\n')
    f.write('export const CP_BENCHES = [\n' + flat([v for (x, z, y, l, s) in benches for v in (int(round(x * 10)), int(round(z * 10)), int(round(y * 1000)), s)]) + '\n];\n')
    f.write('// litter baskets: world x, z in decimetres\n')
    f.write('export const CP_BASKETS = [\n' + flat([v for (x, z) in baskets for v in (int(round(x * 10)), int(round(z * 10)))]) + '\n];\n')
print('appended to', OUT)
