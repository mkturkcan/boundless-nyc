# CP32F step 1: the park grid. Resamples the NAIP tiles (tools/cp/flora_naip.mjs) and rasterises the OSM features
# (tools/cp/flora_osm.mjs) onto one grid in the PARK FRAME: u along the park's long axis (the Manhattan grid's 29 deg,
# from the Central Park South / Central Park West corner toward 110th St), v across it toward Fifth Avenue, 0.5 m cells.
# World frame as shared/geo.js: x east, z south, x = (lon - LON0) * M_LON, z = -(lat - LAT0) * M_LAT.
#
#   python tools/cp/flora_grid.py <scratchDir>        (reads naip/, osm_flora.json; writes grid_*.npy, grid.json)
import sys, os, json, math
import numpy as np
import tifffile
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString
from shapely.ops import linemerge, polygonize, unary_union

D = sys.argv[1]
LAT0, LON0 = 40.7831, -73.9712
MLAT = 111132.0
MLON = 111320.0 * math.cos(LAT0 * math.pi / 180)
def proj(lon, lat): return ((lon - LON0) * MLON, -(lat - LAT0) * MLAT)
def unproj(x, z): return (x / MLON + LON0, -z / MLAT + LAT0)

# ---- the park frame
A = math.radians(29.0)
DU = (math.sin(A), -math.cos(A))      # along the park, toward 110th St
DV = (math.cos(A), math.sin(A))       # across it, toward Fifth Avenue
O = (-902.0, 1667.0)                  # CPW & 59th St (Columbus Circle side corner)
RES = 0.5
U0, U1, V0, V1 = -40.0, 4170.0, -40.0, 890.0
NU, NV = int((U1 - U0) / RES), int((V1 - V0) / RES)
def w2g(x, z):
    dx, dz = x - O[0], z - O[1]
    u = dx * DU[0] + dz * DU[1]; v = dx * DV[0] + dz * DV[1]
    return ((u - U0) / RES, (v - V0) / RES)      # (col, row)
def g2w(col, row):
    u = U0 + (col + 0.5) * RES; v = V0 + (row + 0.5) * RES
    return (O[0] + u * DU[0] + v * DV[0], O[1] + u * DU[1] + v * DV[1])

# ---- NAIP mosaic in lon/lat, then sampled at every grid cell
T = json.load(open(os.path.join(D, 'naip', 'naip_tiles.json')))
lo0 = min(t['lon0'] for t in T); lo1 = max(t['lon1'] for t in T); la0 = min(t['lat0'] for t in T); la1 = max(t['lat1'] for t in T)
tw, th = T[0]['w'], T[0]['h']
dlon = T[0]['lon1'] - T[0]['lon0']; dlat = T[0]['lat1'] - T[0]['lat0']
NCOL = round((lo1 - lo0) / dlon); NROW = round((la1 - la0) / dlat)
M = np.zeros((NROW * th, NCOL * tw, 4), np.uint8)
have = np.zeros((NROW * th, NCOL * tw), bool)
for t in T:
    f = os.path.join(D, 'naip', t['file'])
    if not os.path.exists(f): print('missing', t['file']); continue
    a = tifffile.imread(f)
    c = round((t['lon0'] - lo0) / dlon); r = round((la1 - t['lat1']) / dlat)
    M[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = a[:th, :tw, :4]
    have[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = True
print('mosaic', M.shape)
cols = np.arange(NU); rows = np.arange(NV)
CC, RR = np.meshgrid(cols, rows)
u = U0 + (CC + 0.5) * RES; v = V0 + (RR + 0.5) * RES
X = O[0] + u * DU[0] + v * DV[0]; Z = O[1] + u * DU[1] + v * DV[1]
LON = X / MLON + LON0; LAT = -Z / MLAT + LAT0
mc = (LON - lo0) / (lo1 - lo0) * M.shape[1] - 0.5
mr = (la1 - LAT) / (la1 - la0) * M.shape[0] - 0.5
bands = []
for b in range(4):
    bands.append(ndimage.map_coordinates(M[..., b], [mr, mc], order=1, mode='nearest').astype(np.uint8))
hv = ndimage.map_coordinates(have.astype(np.uint8), [mr, mc], order=0, mode='constant', cval=0).astype(bool)
np.save(os.path.join(D, 'grid_rgbn.npy'), np.stack(bands, -1))
np.save(os.path.join(D, 'grid_have.npy'), hv)
del M, have, LON, LAT, mc, mr
print('bands sampled', bands[0].shape)

# ---- OSM rasters
j = json.load(open(os.path.join(D, 'osm_flora.json'), encoding='utf-8'))
E = j['elements']
def ring(geom): return [w2g(*proj(g['lon'], g['lat'])) for g in geom if g]
def img(): return Image.new('L', (NU, NV), 0)
park = img(); water = img(); paths = img(); drives = img(); bldg = img(); pitch = img(); play = img(); plaza = img(); steps = img(); wood = img(); garden = img()
dP, dW, dPa, dDr, dB, dPi, dPl, dPz, dSt, dWo, dGa = [ImageDraw.Draw(i) for i in (park, water, paths, drives, bldg, pitch, play, plaza, steps, wood, garden)]
def poly(dr, geom, val=255):
    r = ring(geom)
    if len(r) >= 3: dr.polygon(r, fill=val)
def line(dr, geom, wm):
    r = ring(geom)
    if len(r) >= 2: dr.line(r, fill=255, width=max(1, int(round(wm / RES))), joint='curve')
    for p in (r[0], r[-1]) if len(r) >= 2 else []:
        rr = wm / RES / 2
        dr.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=255)
nW = 0
for e in E:
    t = e.get('tags', {})
    if e['type'] == 'way' and e['id'] == 427818536: poly(dP, e['geometry'])
    geoms = []
    if e['type'] == 'way' and e.get('geometry'): geoms = [('outer', e['geometry'])]
    elif e['type'] == 'relation': geoms = [(m.get('role', 'outer'), m['geometry']) for m in e.get('members', []) if m.get('geometry')]
    if not geoms: continue
    closed = e['type'] == 'relation' or (len(geoms[0][1]) > 3 and geoms[0][1][0] == geoms[0][1][-1])
    hw = t.get('highway')
    if t.get('natural') == 'water' or t.get('water'):
        # a relation's rings come in pieces (member ways end to end): merge them before filling, or every piece is
        # filled as its own chord-closed polygon
        for role in ('outer', 'inner'):
            ls = [LineString([proj(q['lon'], q['lat']) for q in g if q]) for r2, g in geoms if r2 == role and len(g) >= 2]
            if not ls: continue
            for pg in polygonize(unary_union(ls)):
                dW.polygon([w2g(*c) for c in pg.exterior.coords], fill=255 if role == 'outer' else 0)
        nW += 1
    elif t.get('building') or t.get('building:part') or t.get('man_made') == 'bridge':
        for role, g in geoms:
            if role == 'outer' and closed: poly(dB, g)
    elif t.get('leisure') == 'pitch':
        # a hard pitch (a ballfield's clay, a court): no tree stands on it. A grass pitch (the Great Lawn, the North
        # Meadow) keeps the trees round its edge, so it is left to the canopy
        if t.get('surface', 'grass') not in ('grass', 'artificial_turf'):
            for role, g in geoms: poly(dPi, g)
    elif t.get('leisure') == 'playground':
        for role, g in geoms: poly(dPl, g)
    elif t.get('natural') == 'wood':
        for role, g in geoms:
            if role == 'outer': poly(dWo, g)
    elif t.get('leisure') == 'garden':
        for role, g in geoms: poly(dGa, g)
    if t.get('area:highway') or (hw in ('pedestrian', 'footway') and t.get('area') == 'yes') or t.get('place') == 'square':
        for role, g in geoms: poly(dPz, g)
        continue
    if hw:
        g = geoms[0][1]
        if hw in ('secondary', 'primary', 'tertiary', 'residential', 'unclassified', 'motorway', 'motorway_link'):
            line(dDr, g, 11.0)
        elif hw == 'pedestrian' and t.get('name') in ('West Drive', 'East Drive', 'Center Drive'):
            line(dDr, g, 11.0)
        elif hw == 'service':
            line(dDr, g, 7.0)
        elif hw == 'steps':
            line(dSt, g, 3.0)
        elif hw in ('footway', 'path', 'pedestrian', 'cycleway', 'bridleway', 'track'):
            wd = t.get('width')
            try: wm = float(wd)
            except Exception: wm = {'bridleway': 3.5, 'pedestrian': 6.0, 'track': 3.0, 'cycleway': 3.0}.get(hw, 2.6)
            if t.get('surface') in ('unpaved', 'ground', 'dirt', 'woodchips', 'grass', 'compacted') and not wd: wm = 1.6
            line(dPa, g, wm)
arr = lambda i: np.asarray(i) > 0
out = dict(park=arr(park), water=arr(water), paths=arr(paths), drives=arr(drives), bldg=arr(bldg), pitch=arr(pitch),
           play=arr(play), plaza=arr(plaza), steps=arr(steps), wood=arr(wood), garden=arr(garden))
np.savez_compressed(os.path.join(D, 'grid_osm.npz'), **out)
json.dump(dict(O=O, A=29.0, RES=RES, U0=U0, U1=U1, V0=V0, V1=V1, NU=NU, NV=NV, water=nW), open(os.path.join(D, 'grid.json'), 'w'))
print({k: int(v.sum() * RES * RES) for k, v in out.items()}, 'm2')
