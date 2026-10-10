# CP32F step 4: the park's trees. Every crown of tools/cp/flora_crowns.py becomes a tree (a crown too big for one tree
# of the city's kit, over 170 m2, is split among k trees by k-means on its cells), standing at the crown's centroid
# unless that is in the water, on a drive, a path, steps, a building, a hard pitch or a plaza, in which case the trunk
# moves to the nearest free cell of its own crown (or the crown is dropped). The OpenStreetMap trees (natural=tree) take
# the place of the detected crowns they stand in. Each tree gets a form of the city's kit (furnitureKit TREE_FORMS) by
# the part of the park it stands in (woodland, lawn edge, drive, the Reservoir's cherries, the Conservatory Garden's
# crabapples, the Pinetum) and a crown width from its crown; cpFlora.js turns (form, crown width) into the kit's species
# and trunk diameter. The Mall's four rows of American elms are planted by rule (the rows are closed canopy from above).
#
# SP37 (2026-10-03, docs/notes/cp-species.md): the forms now come from a species model fitted to the published composition of
# the park (tools/cp/flora_species.py); the CP32 form mix (pick() below) is kept and baked beside it as CP_OLD, which the
# page restores with `?sp37=0`. The module also bakes the species of every tree (CP_SP, CP_SPECIES).
#
#   python tools/cp/flora_place.py <scratchDir> <out cpFloraData.js>
import sys, os, json, math
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flora_species as SPM

D = sys.argv[1]; OUT = sys.argv[2]
G = json.load(open(os.path.join(D, 'grid.json'))); RES = G['RES']; U0, V0 = G['U0'], G['V0']
A = math.radians(G['A']); DU = (math.sin(A), -math.cos(A)); DV = (math.cos(A), math.sin(A)); OO = G['O']
def g2w(u, v): return (OO[0] + u * DU[0] + v * DV[0], OO[1] + u * DU[1] + v * DV[1])
def w2uv(x, z):
    dx, dz = x - OO[0], z - OO[1]; return (dx * DU[0] + dz * DU[1], dx * DV[0] + dz * DV[1])
O = np.load(os.path.join(D, 'grid_osm.npz'))
C = np.load(os.path.join(D, 'grid_canopy.npy'))
lab = np.load(os.path.join(D, 'crown_lab.npy'))
park = O['park']
dil = lambda m, k: ndimage.binary_dilation(m, iterations=k) if k > 0 else m
bad = (dil(O['water'], 3) | dil(O['drives'], 2) | dil(O['paths'], 1) | dil(O['steps'], 1) | dil(O['bldg'], 2) | O['pitch']
       | O['plaza'] | ndimage.binary_erosion(O['play'], iterations=6) | ~park)
# Bethesda Terrace (the BETHESDA part builds it; docs/notes/central-park-bethesda.md): its frame has the origin at the
# fountain's centre, world (31.313, 976.286), a toward the Lake along the Mall's axis (16.85 deg east of north), b east.
# No tree on the structure: from the Mall stair (a -104) over the drive, the upper terrace, the stairs and the lower
# terrace to its lake-front landing (a 29), 28.5 m each side of the axis (the side bays reach |b| 27.2)
BT_O = (31.313, 976.286); BT_A = math.radians(16.85)
BT_DA = (math.sin(BT_A), -math.cos(BT_A)); BT_DB = (math.cos(BT_A), math.sin(BT_A))
def bt_ab(x, z): dx, dz = x - BT_O[0], z - BT_O[1]; return (dx * BT_DA[0] + dz * BT_DA[1], dx * BT_DB[0] + dz * BT_DB[1])
cc_, rr_ = np.meshgrid(np.arange(C.shape[1]), np.arange(C.shape[0]))
bu, bv = w2uv(*BT_O)
b0r, b1r = int((bv - 140 - V0) / RES), int((bv + 140 - V0) / RES); b0c, b1c = int((bu - 140 - U0) / RES), int((bu + 140 - U0) / RES)
sub = (slice(b0r, b1r), slice(b0c, b1c))
uu = U0 + (cc_[sub] + 0.5) * RES; vv = V0 + (rr_[sub] + 0.5) * RES
wx_ = OO[0] + uu * DU[0] + vv * DV[0]; wz_ = OO[1] + uu * DU[1] + vv * DV[1]
aa_ = (wx_ - BT_O[0]) * BT_DA[0] + (wz_ - BT_O[1]) * BT_DA[1]; bb_ = (wx_ - BT_O[0]) * BT_DB[0] + (wz_ - BT_O[1]) * BT_DB[1]
bad[sub] |= (aa_ > -104) & (aa_ < 29) & (np.abs(bb_) < 28.5)
# (BETHESDA, 07:52: the Mall stair's head, its piers and lamps at a -104.1..-104.6, where walkers come up onto the Mall)
bad[sub] |= (aa_ > -107) & (aa_ <= -104) & (np.abs(bb_) < 6.5)
# the Cherry Hill Fountain (BETHESDA builds it: a 6.3 m basin at world (-127.2, 934.0), OSM way 959007357): 4.5 m clear
CH = (-127.2, 934.0)
bad[sub] |= (wx_ - CH[0]) ** 2 + (wz_ - CH[1]) ** 2 < 4.5 ** 2
del cc_, rr_
# LANDMARKS' structures (their list, 07:52; world x, z quads): no trunk inside, with a margin so the crowns stay off
# Belvedere's plateau and the Boathouse's dock (4 m) and the bridges' decks (2.5 m); Wollman Rink's box; 2.5 m round
# each Literary Walk pedestal
from shapely.geometry import Polygon as _Poly, Point as _Pt, box as _box
from PIL import Image as _Im, ImageDraw as _Dr
LM_KEEP = [([[172.1, 376.5], [223.1, 405.2], [202.5, 441.8], [151.5, 413.1]], 4.0),      # Belvedere's plateau, Vista Rock ring
           ([[221, 829], [233.8, 890.7], [186.6, 900.5], [173.8, 838.8]], 4.0),          # the Loeb Boathouse, its dock and boats
           ([[-39.3, 837.3], [-63.1, 798], [-57, 794.2], [-33.1, 833.6]], 2.5),          # Bow Bridge
           ([[-35.7, 790.2], [-35.7, 797], [-40.7, 797], [-40.7, 790.2]], 2.0),          # Bow Bridge's boat landing
           ([[-247.2, 1805.8], [-200, 1781.7], [-196.4, 1788.8], [-243.6, 1812.9]], 2.5),  # Gapstow Bridge and its approaches
           ([[485.6, 378.1], [496.2, 381.3], [493, 391.8], [482.5, 388.7]], 2.0),        # Cleopatra's Needle's steps
           ([[-115.3, 491.8], [-105.6, 484.8], [-93.9, 501], [-103.6, 508]], 2.5),       # Balcony Bridge
           ([[-305.2, 1672.4], [-246.2, 1672.4], [-246.2, 1741.2], [-305.2, 1741.2]], 2.0)]  # Wollman Rink
LM_STATUES = [(-98.7, 1478.2), (-132.6, 1466.3), (-115.2, 1434.4), (-96.1, 1440.2), (-79.0, 1382.0)]
_km = _Im.new('L', (C.shape[1], C.shape[0]), 0); _kd = _Dr.Draw(_km)
def _g(x, z): u, v = w2uv(x, z); return ((u - U0) / RES, (v - V0) / RES)
for q, m in LM_KEEP:
    pg = _Poly(q).buffer(m)
    _kd.polygon([_g(*c) for c in pg.exterior.coords], fill=255)
for (x, z) in LM_STATUES:
    pg = _Pt(x, z).buffer(2.5)
    _kd.polygon([_g(*c) for c in pg.exterior.coords], fill=255)
bad |= np.asarray(_km) > 0
# distances for the zones (m)
dDrive = ndimage.distance_transform_edt(~O['drives']) * RES
wl, wn = ndimage.label(O['water'])
ws = ndimage.sum(np.ones_like(wl), wl, index=np.arange(1, wn + 1))
res_id = 1 + int(np.argmax(ws))
dRes = ndimage.distance_transform_edt(wl != res_id) * RES
# the Reservoir's embankment (LAND, cpLand.js): raised 1.25 m over the water out to 7 m from its shore, the track on it,
# the fence 1.4 m back from the water: no trunk on its first 4.5 m
bad |= dRes < 4.5
wood = O['wood']; garden = O['garden']
dEdge = ndimage.distance_transform_edt(park) * RES

objs = ndimage.find_objects(lab)
trees = []      # [u, v, cw, zoneflags, src]
def cellof(u, v): return int((v - V0) / RES), int((u - U0) / RES)
rng = np.random.default_rng(32)
for i, sl in enumerate(objs):
    if sl is None: continue
    m = lab[sl] == i + 1
    rr, cc = np.nonzero(m)
    if len(rr) == 0: continue
    area = len(rr) * RES * RES
    if area < 6: continue
    pts = np.stack([rr + sl[0].start, cc + sl[1].start], -1).astype(np.float32)
    k = max(1, int(math.ceil(area / 170.0)))
    if k == 1: groups = [pts]
    else:
        cen = pts[rng.choice(len(pts), k, replace=False)]
        for _ in range(8):
            d2 = ((pts[:, None, :] - cen[None, :, :]) ** 2).sum(-1)
            a = d2.argmin(1)
            cen = np.stack([pts[a == j].mean(0) if (a == j).any() else cen[j] for j in range(k)])
        groups = [pts[a == j] for j in range(k) if (a == j).sum() > 8]
    for gp in groups:
        r0, c0 = gp.mean(0)
        ar = len(gp) * RES * RES
        ri, ci = int(round(r0)), int(round(c0))
        if bad[ri, ci]:
            # the nearest free cell of this crown (piece), within 0.6 of its radius
            ok = ~bad[gp[:, 0].astype(int), gp[:, 1].astype(int)]
            if not ok.any(): continue
            q = gp[ok]
            d2 = ((q - np.array([r0, c0])) ** 2).sum(-1)
            j = int(d2.argmin())
            if math.sqrt(d2[j]) * RES > 0.6 * math.sqrt(ar / math.pi) + 1.0: continue
            ri, ci = int(q[j, 0]), int(q[j, 1])
        u = U0 + (ci + 0.5) * RES; v = V0 + (ri + 0.5) * RES
        trees.append([u, v, 2 * math.sqrt(ar / math.pi) * 1.08, i + 1, 0])
print('detected trees', len(trees))

# ---- OpenStreetMap trees (ODbL): they replace the detected crowns they stand in
osm = json.load(open(os.path.join(D, 'osm_trees_park.json')))
by_lab = {}
extra = []
for (u, v, tg, oid) in osm:
    r, c = cellof(u, v)
    if bad[r, c]:
        continue
    L = int(lab[r, c])
    if L: by_lab.setdefault(L, []).append((u, v, tg))
    else: extra.append((u, v, tg))
area_of = {}
for t in trees: area_of[t[3]] = area_of.get(t[3], 0) + (t[2] / 1.08 / 2) ** 2 * math.pi
kept = [t for t in trees if t[3] not in by_lab]
osm_n = 0
for L, lst in by_lab.items():
    ar = area_of.get(L, 60.0)
    cw = 2 * math.sqrt(ar / len(lst) / math.pi) * 1.08
    for (u, v, tg) in lst:
        kept.append([u, v, max(5.0, min(cw, 16.0)), L, 1, tg]); osm_n += 1
for (u, v, tg) in extra:
    kept.append([u, v, 6.0, 0, 1, tg]); osm_n += 1
trees = kept
print('with OSM trees', len(trees), 'of which OSM', osm_n)

# ---- the Mall: four rows of American elms along the central walk (OSM way 1315433305, the Literary Walk area
# 1315432496: 12.6 m wide), from the Literary Walk's south end to the Concert Ground (272 m). "The forty foot wide Mall
# is flanked by its majestic rows of American elms", double rows each side (centralpark.org, centralparknyc.org). Rows at
# 8.3 m (behind the benches at the walk's edge) and 16.8 m from the axis, trees every 8.4 m: a measured plan was not
# found; the spacing is the one that gives the ~130 elms and the closed vault of the photographs.
P1 = np.array([569.0, 589.9]); P2 = np.array([956.0, 504.3])
ax = (P2 - P1) / np.linalg.norm(P2 - P1); nx = np.array([-ax[1], ax[0]])
def mall_sc(u, v):
    d = np.array([u, v]) - P1; return float(d @ ax), float(d @ nx)
MALL_S0, MALL_S1 = 2.0, 268.0
trees = [t for t in trees if not (MALL_S0 - 6 < mall_sc(t[0], t[1])[0] < MALL_S1 + 4 and abs(mall_sc(t[0], t[1])[1]) < 21.5)]
mall = []
for row, off in enumerate((-16.8, -8.3, 8.3, 16.8)):
    s = MALL_S0 + (2.1 if abs(off) > 10 else 0.0)
    k = 0
    while s <= MALL_S1:
        h = (math.sin(row * 91.7 + k * 12.9898) * 43758.5453) % 1.0
        # a replaced elm here and there (the Conservancy replants lost elms: younger, smaller crowns); 1 in 30 missing
        if h > 0.033:
            p = P1 + ax * s + nx * (off + (h - 0.5) * 0.5)
            if bad[cellof(float(p[0]), float(p[1]))]: s += 8.4; k += 1; continue
            cw = 15.8 if h > 0.22 else 11.0 + h * 20
            mall.append([float(p[0]), float(p[1]), cw, -1, 2])
        s += 8.4; k += 1
trees += mall
print('mall elms', len(mall))

# ---- forms by zone (letters: furnitureKit TREE_FORMS)
FORMS = 'PHRQMLGYZSXW'
def pick(u, v, h, cw, tg=None):
    r, c = cellof(u, v)
    if tg:
        g = (tg.get('genus') or tg.get('species') or '').split(' ')[0].lower()
        sp = (tg.get('species') or '').lower()
        if tg.get('leaf_type') == 'needleleaved': return 'q'
        tab = {'platanus': 'P', 'ulmus': 'Z', 'ginkgo': 'G', 'tilia': 'L', 'robinia': 'H', 'gleditsia': 'H', 'sophora': 'H',
               'styphnolobium': 'H', 'acer': 'M', 'magnolia': 'W', 'malus': 'W', 'syringa': 'W', 'cercis': 'W', 'betula': 'W',
               'pyrus': 'R', 'liriodendron': 'Q', 'liquidambar': 'Q', 'prunus': 'Y', 'zelkova': 'Z', 'celtis': 'S',
               'phellodendron': 'S', 'broussonetia': 'W', 'oxydendrum': 'W', 'cornus': 'W', 'crataegus': 'W', 'fagus': 'S'}
        if g == 'quercus': return 'Q' if 'palustris' in sp else 'S'
        if g in tab: return tab[g]
    if 3584 < u < 3811 and 722 < v < 842 and garden[r, c]: return 'W' if h < 0.7 else ('Y' if h < 0.85 else 'L')   # crabapple allees
    if 2029 < u < 2163 and 220 < v < 367 and wood[r, c]: return 'q' if h < 0.8 else 'S'                              # the Pinetum ('q': a conifer stand-in)
    if dRes[r, c] < 28: return 'Y' if h < 0.62 else ('Z' if h < 0.75 else ('P' if h < 0.87 else 'Q'))                # Reservoir cherries
    if 960 < u < 1075 and 250 < v < 380: return 'Y' if h < 0.55 else ('Z' if h < 0.75 else 'S')                      # Cherry Hill
    if 1022 < u < 1139 and 626 < v < 802: return 'Y' if h < 0.4 else ('Z' if h < 0.6 else ('M' if h < 0.8 else 'S')) # Pilgrim Hill
    if cw < 6.4: return 'W' if h < 0.7 else 'Y'
    if wood[r, c]:
        T = (('S', .30), ('M', .20), ('W', .12), ('H', .12), ('Q', .12), ('Z', .08), ('L', .03), ('Y', .03))
    elif dDrive[r, c] < 14:
        T = (('P', .30), ('Z', .26), ('Q', .16), ('S', .12), ('M', .08), ('L', .05), ('H', .03))
    elif dEdge[r, c] < 18:
        T = (('Z', .30), ('P', .20), ('S', .18), ('Q', .12), ('M', .10), ('L', .06), ('H', .04))
    else:
        T = (('S', .22), ('Z', .20), ('P', .14), ('Q', .13), ('M', .12), ('L', .07), ('H', .07), ('W', .03), ('G', .02))
    for f, w in T:
        h -= w
        if h < 0: return f
    return T[0][0]
# ---- SP37: the zone of each tree (the order of pick()'s rules) and its species
def zone_of(u, v, cw):
    r, c = cellof(u, v)
    if 3584 < u < 3811 and 722 < v < 842 and garden[r, c]: return 'crab'
    if 2029 < u < 2163 and 220 < v < 367 and wood[r, c]: return 'pine'
    if dRes[r, c] < 28: return 'res'
    if 960 < u < 1075 and 250 < v < 380: return 'chill'
    if 1022 < u < 1139 and 626 < v < 802: return 'pilg'
    if wood[r, c]: return 'wood'
    if dDrive[r, c] < 14: return 'drive'
    if dEdge[r, c] < 18: return 'edgew' if v < 400 else 'edgee'   # v runs from Central Park West (0) toward Fifth Avenue (~800)
    return 'else'
zones = [zone_of(t[0], t[1], t[2]) for t in trees]
fixed = []
for t in trees:
    k = 'ae' if t[4] == 2 else SPM.tag_species(t[5] if len(t) > 5 else None)
    fixed.append(k)
species = SPM.assign(zones, [t[2] for t in trees], [t[0] for t in trees], [t[1] for t in trees], fixed)

recs = []
cnt = {}          # the new forms
cnt_old = {}      # the CP32 forms
old_forms = []    # per tree, the CP32 form ('q' = the conifer stand-in)
sp_chars = []
cnt_sp = {}
cnt_zone = {}
for i, t in enumerate(trees):
    u, v, cw = t[0], t[1], t[2]
    h = (math.sin(u * 12.9898 + v * 78.233 + 4.1) * 43758.5453) % 1.0
    f_old = 'Z' if t[4] == 2 else pick(u, v, h, cw, t[5] if len(t) > 5 else None)
    old_forms.append(f_old)
    cnt_old[f_old] = cnt_old.get(f_old, 0) + 1
    key = species[i]
    _, _, f, con = SPM.SPECIES[key]
    con = bool(con)
    x, z = g2w(u, v)
    rw, cw_ = cellof(u, v)
    inwood = bool(wood[rw, cw_])
    recs.append((int(round(x * 10)), int(round(z * 10)), int(round(min(cw, 18.0) * 10)), FORMS.index(f) + 64 * con + 128 * inwood, t[4]))
    sp_chars.append(SPM.SPCH[SPM.IDX[key]])
    cnt[f + ('*' if con else '')] = cnt.get(f + ('*' if con else ''), 0) + 1
    cnt_sp[key] = cnt_sp.get(key, 0) + 1
    zk = (zones[i], f)
    cnt_zone[zk] = cnt_zone.get(zk, 0) + 1
print('old forms', sorted(cnt_old.items(), key=lambda kv: -kv[1]))
print('species', sorted(cnt_sp.items(), key=lambda kv: -kv[1]))
print('zones', {z: sum(1 for q in zones if q == z) for z in sorted(set(zones))})
print('forms', sorted(cnt.items(), key=lambda kv: -kv[1]))
cws = np.array([r[2] for r in recs]) / 10
print('crown width p10/p50/p90 %.1f / %.1f / %.1f m' % tuple(np.percentile(cws, [10, 50, 90])))
# per 512 m tile
tc = {}
for r in recs:
    k = (math.floor(r[0] / 5120), math.floor(r[1] / 5120)); tc[k] = tc.get(k, 0) + 1
print('trees per tile', sorted(tc.items()))
json.dump({'n': len(recs), 'tiles': {f'{a}_{b}': n for (a, b), n in tc.items()}, 'forms': cnt, 'forms_cp32': cnt_old, 'species': cnt_sp}, open(os.path.join(D, 'place_stats.json'), 'w'))
np.save(os.path.join(D, 'trees_recs.npy'), np.array(recs, np.int32))
# SP37: the species layer in one table (world x, z in decimetres, crown width in dm, form, conifer, source, wood, zone, species key, CP32 form)
with open(os.path.join(D, 'trees_species.csv'), 'w', encoding='utf-8', newline='\n') as _f:
    _f.write('x_dm,z_dm,cw_dm,form,conifer,source,wood,zone,species,form_cp32\n')
    for i, r in enumerate(recs):
        _f.write('%d,%d,%d,%s,%d,%d,%d,%s,%s,%s\n' % (r[0], r[1], r[2], FORMS[r[3] & 15], (r[3] >> 6) & 1, r[4], (r[3] >> 7) & 1, zones[i], species[i], old_forms[i]))

# ---- the baked data module (city/cpFloraData.js); lamps and benches are appended by tools/cp/flora_furn.py
def flat(nums, per_line=24):
    out, line = [], []
    for n in nums:
        line.append(str(n))
        if len(line) >= per_line: out.append('  ' + ','.join(line) + ','); line = []
    if line: out.append('  ' + ','.join(line) + ',')
    return '\n'.join(out)
hdr = '''// CP32F: Central Park's trees (city/cpFlora.js), baked by tools/cp/flora_grid.py, flora_canopy.py, flora_crowns.py,
// flora_place.py and flora_species.py (docs/notes/central-park-flora.md, docs/notes/cp-species.md). Sources: USGS NAIP
// orthoimagery (public domain; red, green, blue, near-infrared at 0.6 m) classified into canopy and lawn, the canopy split into
// crowns; OpenStreetMap (natural=tree, the water bodies, paths, drives, buildings and pitches, extracted 2026-09-30; (c)
// OpenStreetMap contributors, ODbL 1.0, credited in the READMEs with the building gap-fill); the Mall's four rows of elms
// planted by rule; the species by zone fitted to the Central Park Conservancy's 1982 survey (Loeb 1993) and its recent counts.
// CP_TREES: 4 integers a tree: world x, z in decimetres, crown width in decimetres, code = form + 16 * source + 64 *
// conifer, where form indexes CP_FORMS (furnitureKit TREE_FORMS letters), source is 0 a crown measured from the imagery,
// 1 an OpenStreetMap tree, 2 one of the Mall's elms, conifer marks a pine or other needle tree drawn by a stand-in, and
// + 128 marks a tree in the woods (OSM natural=wood: the Ramble, the North Woods, the Hallett Nature Sanctuary ...).
// SP37: CP_SP has one character a tree (CP_SPECIES indexed by its position in CP_SPCH: key, name, scientific name, form,
// conifer); CP_OLD the CP32 form of every tree ('q' the conifer stand-in), which `?sp37=0` puts back into CP_TREES.
export const CP_FORMS = 'PHRQMLGYZSXW';
'''
nums = []
for r in recs: nums += [r[0], r[1], r[2], (r[3] & 15) + 16 * r[4] + (r[3] & 64) + (r[3] & 128)]
def chunks(txt, n=118):
    return ',\n'.join("  '" + txt[i:i + n] + "'" for i in range(0, len(txt), n))
sp_tab = '[\n' + ',\n'.join('  ' + json.dumps([k, SPM.SPECIES[k][0], SPM.SPECIES[k][1], SPM.SPECIES[k][2], SPM.SPECIES[k][3]]) for k in SPM.KEYS) + ',\n]'
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(hdr)
    f.write('const CP_TREES_37 = [\n' + flat(nums) + '\n];\n')
    f.write("export const CP_SPCH = '" + SPM.SPCH + "';\n")
    f.write('export const CP_SPECIES = ' + sp_tab + ';\n')
    f.write('export const CP_SP = [\n' + chunks(''.join(sp_chars)) + ',\n].join(\'\');\n')
    # the lattice fill's woodland mix (cpFlora.js fillWoods, cpFarRaster.js): 60 slots in the proportions of the woods' trees
    wc = {}
    for i, q in enumerate(zones):
        if q == 'wood': wc[species[i]] = wc.get(species[i], 0) + 1
    tot = max(sum(wc.values()), 1)
    slots = {k: 60.0 * v / tot for k, v in wc.items()}
    alloc = {k: int(x) for k, x in slots.items()}
    for k in sorted(slots, key=lambda k: -(slots[k] - alloc[k]))[:60 - sum(alloc.values())]: alloc[k] += 1
    wood_mix = ''.join(SPM.SPCH[SPM.IDX[k]] * n for k, n in sorted(alloc.items(), key=lambda kv: -kv[1]))
    f.write("// the lattice fill's woodland mix (one species character a slot, in the proportions of the woods' trees)\n")
    f.write("export const CP_WOODMIX = '" + (wood_mix or '0') + "';\n")
    print('wood mix', {k: n for k, n in sorted(alloc.items(), key=lambda kv: -kv[1])})
    f.write('export const CP_OLD = [\n' + chunks(''.join(old_forms)) + ',\n].join(\'\');\n')
    f.write('''// `?sp37=0`: the CP32 mix (form and conifer stand-in of every tree from CP_OLD), the species layer off
export const CP_SP37 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('sp37') === '0');
export const CP_TREES = CP_SP37 ? CP_TREES_37 : (() => {
  const a = CP_TREES_37.slice();
  for (let i = 0; i < a.length; i += 4) { const o = CP_OLD[i >> 2], q = o === 'q'; a[i + 3] = (a[i + 3] & ~(15 | 64)) | CP_FORMS.indexOf(q ? 'Q' : o) | (q ? 64 : 0); }
  return a;
})();
''')
print('wrote', OUT, len(recs), 'trees')

# ---- the park's outline (OSM way 427818536, simplified to 0.5 m) and the four transverse roads' centrelines (OSM
# highway=secondary, the sunken city streets across the park: their compiled lamps and signs are real and stay)
from shapely.geometry import Polygon, LineString
from shapely.ops import linemerge, unary_union
LAT0, LON0 = 40.7831, -73.9712; MLON = 111320.0 * math.cos(LAT0 * math.pi / 180)
proj = lambda lon, lat: ((lon - LON0) * MLON, -(lat - LAT0) * 111132.0)
J = json.load(open(os.path.join(D, 'osm_flora.json'), encoding='utf-8'))
pk = [e for e in J['elements'] if e['type'] == 'way' and e['id'] == 427818536][0]
PP = Polygon([proj(q['lon'], q['lat']) for q in pk['geometry']]).simplify(0.5)
tv = []
for e in J['elements']:
    t = e.get('tags', {})
    if e['type'] == 'way' and t.get('highway') == 'secondary' and 'Transverse' in t.get('name', ''):
        L = LineString([proj(q['lon'], q['lat']) for q in e['geometry']])
        if L.intersects(PP): tv.append(L)
tvm = linemerge(unary_union(tv))
tvl = list(tvm.geoms) if hasattr(tvm, 'geoms') else [tvm]
with open(OUT, 'a', encoding='utf-8', newline='\n') as f:
    f.write('// the park outline (OpenStreetMap way 427818536, simplified to 0.5 m): world x, z in decimetres\n')
    f.write('export const CP_PARK = [\n' + flat([int(round(c * 10)) for p in PP.exterior.coords[:-1] for c in p]) + '\n];\n')
    f.write('// the transverse roads (65th, 79th, 86th, 97th St; OpenStreetMap highway=secondary): polylines, world x, z in decimetres\n')
    f.write('export const CP_TRANSVERSE = [\n' + '\n'.join('  [' + ','.join(str(int(round(c * 10))) for p in l.simplify(0.5).coords for c in p) + '],' for l in tvl) + '\n];\n')
print('park outline', len(PP.exterior.coords) - 1, 'points; transverse pieces', len(tvl))
