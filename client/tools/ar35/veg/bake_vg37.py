#!/usr/bin/env python3
# VG37 (GROUND): bake OpenStreetMap's hedges, planted beds and scrub (tools/ar35/veg/osm_vg37.mjs fetched them) into
# client/src/world/vg37Data.js. World metres (shared/geo.js project()), coordinates in decimetres.
#   python3 client/tools/ar35/veg/bake_vg37.py /data0/projectnyc_aux/tmp/veg/osm/vg37.json
import json, math, sys, os
from shapely.geometry import Polygon, LineString, Point

src = sys.argv[1] if len(sys.argv) > 1 else '/data0/projectnyc_aux/tmp/veg/osm/vg37.json'
out = os.path.join(os.path.dirname(__file__), '../../../src/world/vg37Data.js')
LAT0, LON0 = 40.7831, -73.9712
MLON = 111320.0 * math.cos(math.radians(LAT0))
proj = lambda q: ((q['lon'] - LON0) * MLON, -(q['lat'] - LAT0) * 111132.0)
J = json.load(open(src))
# the named gardens a bed or hedge may stand in (their planting differs)
G = {}
for e in J['elements']:
    t = e.get('tags', {})
    if t.get('leisure') == 'garden' and t.get('name') in ('North Garden (French)', 'South Garden (English)', 'Center Garden (Italian)', 'Conservatory Garden', 'Shakespeare Garden'):
        g = e.get('geometry') or []
        if len(g) >= 4: G[t['name']] = Polygon([proj(q) for q in g]).buffer(2.0)
def garden(p):
    for k in ('North Garden (French)', 'South Garden (English)', 'Center Garden (Italian)', 'Shakespeare Garden', 'Conservatory Garden'):
        if k in G and G[k].contains(p): return {'North Garden (French)': 'french', 'South Garden (English)': 'english', 'Center Garden (Italian)': 'italian', 'Shakespeare Garden': 'shakespeare', 'Conservatory Garden': 'conservatory'}[k]
    return ''
BOX = {'cp': (40.7630, -73.9830, 40.8015, -73.9480), 'bp': (40.7525, -73.9845, 40.7545, -73.9808), 'col': (40.8045, -73.9650, 40.8105, -73.9575),
       'h125': (40.8030, -73.9600, 40.8130, -73.9300), 'gp': (40.7420, -73.9620, 40.7500, -73.9560)}
def area(q):
    for k, (s, w, n, e) in BOX.items():
        if s <= q['lat'] <= n and w <= q['lon'] <= e: return k
    return ''
hedges, beds, scrub = [], [], []
dm = lambda xs: [int(round(v * 10)) for p in xs for v in p]
for e in J['elements']:
    t = e.get('tags', {}); g = e.get('geometry') or []
    if e['type'] != 'way' or len(g) < 2: continue
    xs = [proj(q) for q in g]
    closed = len(xs) >= 4 and math.hypot(xs[0][0] - xs[-1][0], xs[0][1] - xs[-1][1]) < 0.05
    if t.get('barrier') == 'hedge':
        isArea = closed and (t.get('area') == 'yes' or Polygon(xs).area > 1.5)
        if isArea: xs = xs[:-1]
        c = Polygon(xs).centroid if isArea else LineString(xs).centroid
        h = float(t.get('height', '0') or 0) if str(t.get('height', '')).replace('.', '', 1).isdigit() else 0
        hedges.append({'id': e['id'], 'a': 1 if isArea else 0, 'g': garden(c), 'z': area(g[0]), 'h': h, 'p': dm(xs)})
    elif t.get('landuse') == 'flowerbed' and closed:
        P = Polygon(xs[:-1])
        if not P.is_valid or P.area < 1.0: continue
        beds.append({'id': e['id'], 'g': garden(P.centroid), 'z': area(g[0]), 'p': dm(xs[:-1])})
    elif t.get('natural') in ('scrub', 'shrubbery') and closed:
        P = Polygon(xs[:-1])
        if not P.is_valid or P.area < 4.0: continue
        scrub.append({'id': e['id'], 'z': area(g[0]), 'p': dm(xs[:-1])})
with open(out, 'w') as f:
    f.write('// VG37 (GROUND, docs/notes/ar35-veg.md): hedges, planted beds and scrub from OpenStreetMap (© OpenStreetMap contributors,\n')
    f.write('// ODbL 1.0; tools/ar35/veg/osm_vg37.mjs fetched, tools/ar35/veg/bake_vg37.py baked). World decimetres [x, z, x, z, ...].\n')
    f.write('// hedge: a = 1 an area (its outline), 0 a line; g the garden it stands in; z the area (cp, bp, col, h125, gp); h its mapped height (0: none).\n')
    f.write('export const VG37_HEDGES = ' + json.dumps(hedges, separators=(',', ':')).replace('},{', '},\n{') + ';\n')
    f.write('export const VG37_BEDS = ' + json.dumps(beds, separators=(',', ':')).replace('},{', '},\n{') + ';\n')
    f.write('export const VG37_SCRUB = ' + json.dumps(scrub, separators=(',', ':')).replace('},{', '},\n{') + ';\n')
print('hedges', len(hedges), 'beds', len(beds), 'scrub', len(scrub), 'gardens', list(G.keys()))
from collections import Counter
print('beds by garden', Counter(b['g'] for b in beds), 'by area', Counter(b['z'] for b in beds))
print('hedges by garden', Counter(h['g'] for h in hedges), Counter(h['a'] for h in hedges))
