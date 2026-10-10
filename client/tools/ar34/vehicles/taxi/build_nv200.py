# NV200 NYC cab (kind `taxinv200`): memoov's Nissan NV200 delivery van (Sketchfab / Objaverse 1.0, CC-BY 4.0,
# https://sketchfab.com/3d-models/6f952a34d1f44905af42c803cba2805f) re-proportioned to Nissan's North American sheet,
# re-wheeled, glazed, fitted with a cab interior and roof equipment, re-materialised into the fleet's runtime classes and
# LoD'd. Blender 4.5, headless:
#   blender --background --python build_nv200.py -- <source.glb> <out.glb> <out_meta.json>
# then finish.mjs (extras, KTX2, meshopt) writes client/public/models/fleet24/taxinv200.glb.
# Frame: Blender Z up, the van's front at -Y, right side at -X (the glTF exporter turns that into +Z forward, +Y up).
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_GLB, OUT_META = argv[0], argv[1], argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'tex')
ATL = json.load(open(os.path.join(TEX, 'taxi_detail.json')))
CELL, REG = ATL['cells'], ATL['regions']

# Nissan NV200 North America (en.wikipedia.org/wiki/Nissan_NV200 infobox): length 186.2 in (4,729 mm), width 68.1 in
# (1,730 mm), height 73.5 in (1,867 mm), wheelbase 115.2 in (2,926 mm)
L_REAL, WB_REAL = 4.729, 2.926
TYRE_D = 0.603          # 185/60R15 (the US NV200's tyre size; see notes: not verified on the taxi itself)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        continue
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def mname(o, idx):
    ms = o.data.materials
    return ms[idx].name if ms and idx < len(ms) and ms[idx] else ''

# ---------------------------------------------------------------- classes per face
# source material -> (class, swatch); objects override
PAINT_SRC = {'CARROCERIA', 'cajuela', 'cofre', 'puertasbake', 'puertastras'}
GLASS_SRC = {'Material.006', 'CRIST_LAT', 'CRIST_LAT.001', 'cristtras'}
WHEEL_SRC = {'Rim_Tyre': 'tyre', 'Stainless_Steel': 'rim_silver', 'Material.004': 'steel_dark'}
DROP_OBJ = ('antena', 'Circle.005', 'Plane.032', 'Plane.034')     # whip antenna, plate backings (the runtime adds plates)
def cls_of(o, mat):
    n = o.name
    if any(n.startswith(d) for d in DROP_OBJ):
        return None
    if mat in WHEEL_SRC:
        return ('wheel', WHEEL_SRC[mat])
    if mat in PAINT_SRC or n.startswith('defensa front'):
        return ('paint', None)
    if n.startswith('cristal puerta'):
        return ('glass', None)                      # the front door glass is an opaque black sheet in the source
    if mat in GLASS_SRC:
        return ('glass', None)
    if mat == 'Material.009':
        if n.startswith('Cube.004'):
            return ('detail', 'mirror')
        return ('lens', None)
    if n.startswith('soporte faro'):
        return ('lamp', None)
    if n.startswith('Sphere'):
        return ('lamp', None)                       # bulbs / reflector balls behind the head and fog lenses
    if n.startswith('3d-model') or n.startswith('Text') or mat == 'Material.002':
        return ('detail', 'chrome')
    if mat == 'Iron_brushed':
        return ('detail', 'grille')
    if mat == 'Material.008':
        return ('detail', 'steel_dark')
    if mat == 'Cube__0':
        return ('detail', 'under')
    if mat == 'Material.007':
        return ('detail', 'gloss_black')
    return ('detail', 'trim_black')

# texture lookups for the paint parts: the source livery (DHL yellow / red, black trims) tells body colour from trim
IMG_CACHE = {}
def img_px(mat):
    if mat in IMG_CACHE:
        return IMG_CACHE[mat]
    m = bpy.data.materials.get(mat)
    im = None
    if m and m.use_nodes:
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image:
                im = nd.image; break
    if im is None:
        IMG_CACHE[mat] = None; return None
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    IMG_CACHE[mat] = a
    return a

# ---------------------------------------------------------------- gather everything into one bmesh with face layers
bm = bmesh.new()
cls_layer = bm.faces.layers.int.new('cls')       # 0 paint 1 detail 2 glass 3 lens 4 lamp 5 lampInner 6 wheel
sw_layer = bm.faces.layers.int.new('sw')         # swatch index into SWATCHES
lamp_layer = bm.faces.layers.int.new('lamp')
CLS = {'paint': 0, 'detail': 1, 'glass': 2, 'lens': 3, 'lamp': 4, 'lampInner': 5, 'wheel': 6}
SWATCHES = list(CELL.keys())
stats = {}
diag7 = 0
for o in list(bpy.context.scene.objects):
    me = o.data
    uvl = me.uv_layers.active
    vmap = {}
    for p in me.polygons:
        mat = mname(o, p.material_index)
        c = cls_of(o, mat)
        if c is None:
            continue
        cl, sw = c
        if mat == 'Material.007':
            # an opaque black sheet fills the whole windscreen opening in the source: keep only its border (the frit)
            fc = o.matrix_world @ p.center
            if abs(fc.x) < 0.63 and 1.19 < fc.z < 1.55:
                diag7 += 1
                continue
        if cl == 'paint':
            px = img_px(mat)
            if px is not None and uvl is not None:
                uv = Vector((0, 0))
                for li in p.loop_indices:
                    uv += uvl.data[li].uv
                uv /= len(p.loop_indices)
                h, w = px.shape[:2]
                x = int((uv.x % 1.0) * (w - 1)); y = int((uv.y % 1.0) * (h - 1))
                r, g, b = px[y, x, :3]
                v = max(r, g, b)
                if v < 0.10 and (o.matrix_world @ p.center).z > 1.0:
                    cl, sw = 'detail', 'trim_black'
                elif r > 0.35 and g < 0.12 and b < 0.12:
                    cl = 'redsrc'
        verts = []
        for vi in p.vertices:
            v = vmap.get(vi)
            if v is None:
                v = vmap[vi] = bm.verts.new(o.matrix_world @ me.vertices[vi].co)
            verts.append(v)
        try:
            f = bm.faces.new(verts)
        except ValueError:
            continue
        if cl == 'redsrc':
            f[cls_layer] = 99
        else:
            f[cls_layer] = CLS[cl]
        f[sw_layer] = SWATCHES.index(sw) if sw else -1
        stats[cl] = stats.get(cl, 0) + 1
print('[nv200] faces by class', stats, 'windscreen sheet faces dropped', diag7)
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
nv0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0002)
print('[nv200] welded verts %d -> %d' % (nv0, len(bm.verts)))
# the source's black sheet behind the windscreen (Material.007): how much of it lies in the glass's middle
m7 = [f for f in bm.faces if f[sw_layer] == SWATCHES.index('gloss_black') and abs(f.calc_center_median().x) < 0.3]
print('[nv200] gloss_black faces with |x| < 0.3:', len(m7), 'z range', (min((f.calc_center_median().z for f in m7), default=0), max((f.calc_center_median().z for f in m7), default=0)))

# ---------------------------------------------------------------- wheels: hubs, re-size to the real tyre, length scale
wheel_f = [f for f in bm.faces if f[cls_layer] == 6]
wv = set(v for f in wheel_f for v in f.verts)
tyre_sw = SWATCHES.index('tyre')
hubs = {}
for k in (1, 2, 3, 4):
    front = k <= 2
    left = k in (1, 3)
    vs = [v for v in wv if ((v.co.y < 0) == front) and ((v.co.x > 0) == left)]
    tv = [v for f in wheel_f if f[sw_layer] == tyre_sw for v in f.verts if ((v.co.y < 0) == front) and ((v.co.x > 0) == left)]
    ys = [v.co.y for v in tv]; zs = [v.co.z for v in tv]; xs = [v.co.x for v in tv]
    c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    r = (max(zs) - min(zs)) / 2
    hubs[k] = {'c': c, 'r': r, 'w': max(xs) - min(xs), 'verts': vs}
    print('[nv200] wheel', k, 'centre', tuple(round(x, 3) for x in c), 'r', round(r, 3), 'w', round(max(xs) - min(xs), 3))
src_wb = abs(((hubs[3]['c'].y + hubs[4]['c'].y) / 2) - ((hubs[1]['c'].y + hubs[2]['c'].y) / 2))
ys = [v.co.y for v in bm.verts if v not in wv]
src_L = max(ys) - min(ys)
SY = L_REAL / src_L
print('[nv200] source length %.3f wheelbase %.3f -> length scale %.4f (wheelbase becomes %.3f, sheet %.3f)' % (src_L, src_wb, SY, src_wb * SY, WB_REAL))
for v in bm.verts:
    if v in wv:
        continue
    v.co.y *= SY
for k, hb in hubs.items():
    s = (TYRE_D / 2) / hb['r']
    c0 = hb['c']; c1 = Vector((c0.x, c0.y * SY, c0.z))
    for v in hb['verts']:
        v.co = c1 + (v.co - c0) * s
    hb['c1'] = c1; hb['r1'] = TYRE_D / 2; hb['w1'] = hb['w'] * s
ground = min(hb['c1'].z - hb['r1'] for hb in hubs.values())
ymid = None
for v in bm.verts:
    v.co.z -= ground
ys = [v.co.y for v in bm.verts]
ymid = (max(ys) + min(ys)) / 2
for v in bm.verts:
    v.co.y -= ymid
for hb in hubs.values():
    hb['c1'] = Vector((hb['c1'].x, hb['c1'].y - ymid, hb['c1'].z - ground))
YF = min(v.co.y for v in bm.verts)     # front bumper (Blender -Y)
YR = max(v.co.y for v in bm.verts)
ROOF = max(v.co.z for f in bm.faces if f[cls_layer] == 0 for v in f.verts)
XW = max(abs(v.co.x) for f in bm.faces if f[cls_layer] in (0,) for v in f.verts)
print('[nv200] length %.3f  roof %.3f  half width (paint) %.3f' % (YR - YF, ROOF, XW))

# source red at the rear corners = the tail lamps; red elsewhere (the source's fleet stripes) = body paint
for f in bm.faces:
    if f[cls_layer] == 99:
        c = f.calc_center_median()
        if c.y > YR - 0.35 and abs(c.x) > 0.45 and 0.55 < c.z < 1.35:
            f[cls_layer] = CLS['lamp']; f[lamp_layer] = 4
        else:
            f[cls_layer] = CLS['paint']

# tail lamps: the NV200's tall rear clusters sit in the D-pillars outboard of the tailgate opening (Commons rear-quarter
# photograph); the source van has none, so the body faces there become the lamp (tail + brake above, amber blinker below)
ntail = 0
for f in bm.faces:
    if f[cls_layer] != CLS['paint']:
        continue
    c = f.calc_center_median()
    if c.y > YR - 0.30 and abs(c.x) > 0.69 and 0.80 < c.z < 1.22:
        f[cls_layer] = CLS['lamp']; f[lamp_layer] = 4 if c.z > 0.93 else (5 if c.x > 0 else 6); ntail += 1
print('[nv200] tail lamp faces', ntail)
# lamp roles: head lamp housing inner part = head, the outer amber segment = front blinker
for f in bm.faces:
    if f[cls_layer] == CLS['lamp'] and f[lamp_layer] == 0:
        c = f.calc_center_median()
        if c.y < 0:
            f[lamp_layer] = (2 if c.x > 0 else 3) if abs(c.x) > 0.60 else 1
    if f[cls_layer] == CLS['lampInner']:
        pass

# ---------------------------------------------------------------- added parts (detail swatches / atlas regions)
added = []      # (verts list of faces, cls, swatch or region, lamp role)
def box(x0, x1, y0, y1, z0, z1, sw, cl='detail', inward=False, role=0, faces=('all',)):
    vs = [Vector((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    q = {'-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4), '+y': (3, 2, 6, 7), '-x': (2, 0, 4, 6), '+x': (1, 3, 7, 5)}
    for k, idx in q.items():
        if faces != ('all',) and k not in faces:
            continue
        ids = idx[::-1] if inward else idx
        added.append(([vs[i].copy() for i in ids], cl, sw, role))
def quad(pts, sw, cl='detail', role=0):
    added.append(([Vector(p) for p in pts], cl, sw, role))

FLOOR, CEIL = 0.40, ROOF - 0.10
XI = 0.70
y_dash = YF + 1.02      # behind the windscreen base
# windscreen and tailgate glass lines on the centre line (the tub must stay inside both)
gv = [v.co for f in bm.faces if f[cls_layer] == CLS['glass'] and abs(f.calc_center_median().x) < 0.3 for v in f.verts]
ws = [c for c in gv if c.y < 0]
tg = [c for c in gv if c.y > 0]
ws_top = min(ws, key=lambda c: -c.z); ws_bot = min(ws, key=lambda c: c.z)
y_tail = min(c.y for c in tg) - 0.06
print('[nv200] windscreen bottom (y %.3f z %.3f) top (y %.3f z %.3f), tub rear wall y %.3f (YR %.3f)' % (ws_bot.y, ws_bot.z, ws_top.y, ws_top.z, y_tail, YR))
def ws_y(z):                                        # windscreen y at height z, moved 0.08 m into the cabin
    t = (z - ws_bot.z) / max(ws_top.z - ws_bot.z, 1e-6)
    return ws_bot.y + t * (ws_top.y - ws_bot.y) + 0.08
# cabin tub (seen through every window): floor, headliner, side walls following the screen, rear wall; faces inward
y_ceil0 = ws_y(CEIL)
quad([(XI, y_dash, FLOOR), (-XI, y_dash, FLOOR), (-XI, y_tail, FLOOR), (XI, y_tail, FLOOR)][::-1], 'fabric')
quad([(-XI, y_tail, CEIL), (XI, y_tail, CEIL), (XI, y_ceil0, CEIL), (-XI, y_ceil0, CEIL)], 'fabric')
quad([(-XI, y_tail, FLOOR), (XI, y_tail, FLOOR), (XI, y_tail, CEIL), (-XI, y_tail, CEIL)], 'fabric')
for sx in (-1, 1):
    zb = max(1.02, ws_bot.z)
    poly = [(sx * XI, y_dash, FLOOR), (sx * XI, y_tail, FLOOR), (sx * XI, y_tail, CEIL), (sx * XI, y_ceil0, CEIL), (sx * XI, ws_y(zb), zb), (sx * XI, y_dash, zb)]
    if sx > 0:
        poly = poly[::-1]
    quad(poly, 'fabric')
box(-XI, XI, y_dash - 0.02, y_dash + 0.32, 0.70, 1.02, 'dash')                       # dashboard
box(-0.55, 0.55, y_dash + 0.05, y_dash + 0.30, 1.02, 1.05, 'gloss_black', faces=('+z',))
for sx in (-1, 1):                                                                      # front seats
    x0, x1 = sorted((sx * 0.12, sx * 0.62))
    box(x0, x1, y_dash + 0.62, y_dash + 1.12, 0.52, 0.66, 'leather_black')
    box(x0, x1, y_dash + 1.06, y_dash + 1.18, 0.66, 1.30, 'leather_black')
    box(x0 + 0.12, x1 - 0.12, y_dash + 1.08, y_dash + 1.16, 1.30, 1.46, 'leather_black')
y_part = y_dash + 1.30
box(-XI, XI, y_part, y_part + 0.04, FLOOR, 1.02, 'partition')                         # partition: solid lower half
box(-0.10, 0.10, y_part + 0.04, y_part + 0.06, 0.86, 0.98, 'screen')                   # passenger screen
for x0, x1 in ((-XI, -XI + 0.06), (XI - 0.06, XI), (-0.03, 0.03)):
    box(x0, x1, y_part, y_part + 0.04, 1.02, CEIL, 'partition')                        # partition posts
box(-XI, XI, y_part, y_part + 0.04, CEIL - 0.05, CEIL, 'partition')
quad([(-XI, y_part + 0.02, 1.02), (XI, y_part + 0.02, 1.02), (XI, y_part + 0.02, CEIL - 0.05), (-XI, y_part + 0.02, CEIL - 0.05)], None, 'glass')
quad([(XI, y_part + 0.021, 1.02), (-XI, y_part + 0.021, 1.02), (-XI, y_part + 0.021, CEIL - 0.05), (XI, y_part + 0.021, CEIL - 0.05)], None, 'glass')
yb = YR - 0.75                                                                          # rear bench
box(-0.68, 0.68, yb - 0.50, yb, 0.50, 0.66, 'fabric')
box(-0.68, 0.68, yb, yb + 0.14, 0.66, 1.28, 'fabric')
box(-0.70, 0.70, y_part + 0.30, yb - 0.50, FLOOR, FLOOR + 0.02, 'carpet', faces=('+z',))

# roof: the medallion light dome at the front of the roof and the ad topper on a rack behind it
def ellipse_dome(cx, cy, z0, rx, ry, hgt, n=28):
    top = [Vector((cx + rx * 0.92 * math.cos(a), cy + ry * 0.85 * math.sin(a), z0 + hgt)) for a in [2 * math.pi * i / n for i in range(n)]]
    bot = [Vector((cx + rx * math.cos(a), cy + ry * math.sin(a), z0)) for a in [2 * math.pi * i / n for i in range(n)]]
    for i in range(n):
        j = (i + 1) % n
        added.append(([bot[i], bot[j], top[j], top[i]], 'detail', 'sign_black', 0))
    added.append((top[::-1][::-1], 'detail', 'sign_black', 0))
    return top
roof_y0 = YF + 1.55
dome_c = roof_y0 + 0.30
ellipse_dome(0.0, dome_c, ROOF + 0.035, 0.42, 0.16, 0.10)
for sx in (-1, 1):
    box(sx * 0.30 - 0.02, sx * 0.30 + 0.02, dome_c - 0.08, dome_c + 0.08, ROOF - 0.01, ROOF + 0.04, 'trim_black')
# number panels (front and rear faces of the dome)
for side, yy in ((-1, dome_c - 0.16 * 0.80), (1, dome_c + 0.16 * 0.80)):
    x0, x1 = (-0.17, 0.17) if side < 0 else (0.17, -0.17)
    quad([(x0, yy + side * 0.012, ROOF + 0.055), (x1, yy + side * 0.012, ROOF + 0.055), (x1, yy + side * 0.012, ROOF + 0.115), (x0, yy + side * 0.012, ROOF + 0.115)], 'R:dome_num')
# ad topper: 1.20 m x 0.36 m two-sided billboard, its frame dark grey, on two cross bars
tp_y0, tp_y1 = YR - 1.95, YR - 0.75
for yy in (tp_y0 + 0.15, tp_y1 - 0.15):
    box(-0.62, 0.62, yy - 0.025, yy + 0.025, ROOF - 0.01, ROOF + 0.05, 'step_alu')
box(-0.06, 0.06, tp_y0, tp_y1, ROOF + 0.05, ROOF + 0.09, 'trim_black')
box(-0.065, 0.065, tp_y0, tp_y1, ROOF + 0.09, ROOF + 0.47, 'plastic_grey', faces=('-y', '+y', '+z'))
quad([(0.066, tp_y0 + 0.03, ROOF + 0.11), (0.066, tp_y1 - 0.03, ROOF + 0.11), (0.066, tp_y1 - 0.03, ROOF + 0.45), (0.066, tp_y0 + 0.03, ROOF + 0.45)], 'R:topper_a')
quad([(-0.066, tp_y1 - 0.03, ROOF + 0.11), (-0.066, tp_y0 + 0.03, ROOF + 0.11), (-0.066, tp_y0 + 0.03, ROOF + 0.45), (-0.066, tp_y1 - 0.03, ROOF + 0.45)], 'R:topper_b')
for x0, x1 in ((0.062, 0.066), (-0.066, -0.062)):
    box(x0, x1, tp_y0, tp_y0 + 0.03, ROOF + 0.09, ROOF + 0.47, 'plastic_grey')
    box(x0, x1, tp_y1 - 0.03, tp_y1, ROOF + 0.09, ROOF + 0.47, 'plastic_grey')
    box(x0, x1, tp_y0, tp_y1, ROOF + 0.09, ROOF + 0.11, 'plastic_grey')
    box(x0, x1, tp_y0, tp_y1, ROOF + 0.45, ROOF + 0.47, 'plastic_grey')

for verts, cl, sw, role in added:
    vs = [bm.verts.new(v) for v in verts]
    try:
        f = bm.faces.new(vs)
    except ValueError:
        continue
    f[cls_layer] = CLS[cl]
    if sw and sw.startswith('R:'):
        f[sw_layer] = 1000 + list(REG.keys()).index(sw[2:])
    else:
        f[sw_layer] = SWATCHES.index(sw) if sw else -1
    f[lamp_layer] = role

bm.normal_update()
for o in list(bpy.context.scene.objects):
    bpy.data.objects.remove(o)
me = bpy.data.meshes.new('nv200_src')
bm.to_mesh(me)
bm.free()
src = bpy.data.objects.new('nv200_src', me)
bpy.context.scene.collection.objects.link(src)

# ---------------------------------------------------------------- materials
def img(name):
    p = os.path.join(TEX, name + '.png')
    im = bpy.data.images.load(p, check_existing=True)
    im.name = name
    return im
def principled(name, cls, base=(1, 1, 1, 1), rough=0.5, metal=0.0, alpha=1.0, tex=None, mr=None, clearcoat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = base
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if clearcoat:
        b.inputs['Coat Weight'].default_value = clearcoat
        b.inputs['Coat Roughness'].default_value = 0.04
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(tex)
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if mr:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(mr); t.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m['cls'] = cls
    m.use_backface_culling = True
    return m
MATS = [
    principled('taxinv200_paint', 'paint', rough=0.35, tex='nv200_livery', clearcoat=1.0),
    principled('taxi_detail', 'detail', tex='taxi_detail', mr='taxi_detail_mr'),
    principled('taxi_glass', 'glass', base=(0.02, 0.025, 0.03, 1), rough=0.03, alpha=0.35),
    principled('taxi_lens', 'lens', base=(0.9, 0.9, 0.9, 1), rough=0.02, alpha=0.12),
    principled('taxi_lamp', 'lamp', base=(0.85, 0.85, 0.85, 1), rough=0.2, metal=0.6),
    principled('taxi_lampInner', 'lampInner', base=(0.02, 0.02, 0.02, 1), rough=0.25, metal=0.2),
]
for m in MATS:
    src.data.materials.append(m)

# ---------------------------------------------------------------- LoDs
def make_lod(name, ratio, protect=True):
    me = src.data.copy()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    if ratio < 1:
        # class borders (paint / trim / lamp / glass ...) are protected from collapsing: an unweighted collapse drags
        # them across each other and leaves saw-tooth edges (the rear quarter's lamp and bumper line in w2r1 v2)
        bmw = bmesh.new(); bmw.from_mesh(ob.data)
        fl = [bmw.faces.layers.int[k] for k in ('cls', 'sw', 'lamp')]
        border = [len(set(tuple(f[l] for l in fl) for f in v.link_faces)) > 1 for v in bmw.verts]
        bmw.free()
        vg = ob.vertex_groups.new(name='dec')
        keep = [i for i, b in enumerate(border) if b]
        free = [i for i, b in enumerate(border) if not b]
        vg.add(free, 1.0, 'REPLACE'); vg.add(keep, 0.0 if protect else 1.0, 'REPLACE')
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
        mod.vertex_group = 'dec'; mod.vertex_group_factor = 50.0
        bpy.ops.object.modifier_apply(modifier='dec')
        g = ob.vertex_groups.get('dec')
        if g is not None:
            ob.vertex_groups.remove(g)
        print('[nv200] %s: %d border vertices protected' % (name, len(keep)))
    bm = bmesh.from_edit_mesh(ob.data) if False else bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    cl = bm.faces.layers.int['cls']; sw = bm.faces.layers.int['sw']; lp = bm.faces.layers.int['lamp']
    uv = bm.loops.layers.uv.new('UVMap')
    W = bm.verts.layers.float.new('_WHEEL'); LA = bm.verts.layers.float.new('_LAMP')
    regs = list(REG.values())
    Lc = YR - YF
    for f in bm.faces:
        c = f[cl]
        f.material_index = {0: 0, 1: 1, 6: 1, 2: 2, 3: 3, 4: 4, 5: 5}[c]
        n = f.normal
        if c == 0:
            # side projection onto the livery sheet; faces not facing sideways sample the plain roof-line strip
            for lo in f.loops:
                p = lo.vert.co
                t = (p.y - YF) / Lc
                if abs(n.x) > 0.35:
                    side = 0 if n.x > 0 else 1
                    u = t if side == 0 else 1 - t
                    vimg = side * 0.5 + (1 - min(max(p.z, 0), 2.1) / 2.1) * 0.5
                else:
                    u, vimg = min(max(t, 0.02), 0.98), 0.004
                lo[uv].uv = (u, 1 - vimg)
        elif f[sw] >= 1000:
            r = regs[f[sw] - 1000]
            # quads were triangulated: map by the face's own corners in the plane of the panel
            pass
        else:
            s = SWATCHES[f[sw]] if f[sw] >= 0 else 'trim_black'
            cu, cv = CELL[s]
            for lo in f.loops:
                lo[uv].uv = (cu, 1 - cv)
        if c == 4 and f[lp] > 0:
            for v in f.verts:
                v[LA] = float(f[lp])
    # atlas-region panels: planar map by the panel's bounding box in its own plane
    groups = {}
    for f in bm.faces:
        if f[sw] >= 1000:
            groups.setdefault((f[sw], round(f.normal.x, 1), round(f.normal.y, 1)), []).append(f)
    for (key, nx, ny), fs in groups.items():
        r = regs[key - 1000]
        vs = [lo.vert.co for f in fs for lo in f.loops]
        horiz = 'y' if abs(nx) > abs(ny) else 'x'
        hs = [getattr(v, horiz) for v in vs]; zs = [v.z for v in vs]
        h0, h1, z0, z1 = min(hs), max(hs), min(zs), max(zs)
        # reading direction: the panel's right is (normal x up) projected on the horizontal axis
        right = Vector((-nx, -ny, 0)).cross(Vector((0, 0, 1)))
        rsign = getattr(right, horiz) >= 0
        for f in fs:
            for lo in f.loops:
                p = lo.vert.co
                a = (getattr(p, horiz) - h0) / max(h1 - h0, 1e-6)
                if not rsign:
                    a = 1 - a
                b = (p.z - z0) / max(z1 - z0, 1e-6)
                # image region [u0, v0 (top), u1, v1 (bottom)]
                u = r[0] + a * (r[2] - r[0]); vimg = r[3] - b * (r[3] - r[1])
                lo[uv].uv = (u, 1 - vimg)
    # wheels: tag by hub proximity
    for v in bm.verts:
        v[W] = 0.0
    for f in bm.faces:
        if f[cl] != 6:
            continue
        for v in f.verts:
            best = min(hubs.items(), key=lambda kv: (kv[1]['c1'] - v.co).length)
            v[W] = float(best[0])
    bm.to_mesh(ob.data)
    bm.free()
    # remove the bookkeeping layers before export
    for a in ('cls', 'sw', 'lamp'):
        if a in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes[a])
    ob.data.shade_smooth()
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(32))
    except Exception as e:
        print('[nv200] sharp edges:', e)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('[nv200] %s ratio %.4f -> %d tris' % (name, ratio, tris))
    return ob, tris

src_tris = sum(len(p.vertices) - 2 for p in src.data.polygons)
print('[nv200] source tris', src_tris)
lod0, t0 = make_lod('LOD0', min(1.0, 175000 / src_tris))
lod1, t1 = make_lod('LOD1', 18000 / src_tris)
lod2, t2 = make_lod('LOD2', 3600 / src_tris, protect=False)    # far: borders need not hold, the budget does
bpy.data.objects.remove(src)

root = bpy.data.objects.new('taxinv200', None)
bpy.context.scene.collection.objects.link(root)
for ob in (lod0, lod1, lod2):
    ob.parent = root

# runtime frame: Blender (x, y, z) -> glTF (x, z, -y): +Z forward (front at Blender -Y), right side at -X
def rt(v):
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
xs = [abs(v.co.x) for v in lod0.data.vertices]
size = [round(2 * max(xs), 3), round(max(v.co.z for v in lod0.data.vertices), 3), round(YR - YF, 3)]
meta = {
    'kind': 'taxinv200', 'size': size,
    'hubs': [{'id': k, 'p': rt(hb['c1']), 'r': round(hb['r1'], 4), 'w': round(hb['w1'], 4)} for k, hb in sorted(hubs.items())],
    'wheelbase': round(abs(hubs[1]['c1'].y - hubs[3]['c1'].y), 3),
    'roof': round(ROOF, 3), 'tris': [t0, t1, t2],
    'source': "memoov, 'Dhl delivery van' (Nissan NV200), sketchfab.com/3d-models/6f952a34d1f44905af42c803cba2805f, CC-BY 4.0; re-proportioned, re-wheeled, glazed, interior, roof equipment and TLC livery: Valdrada",
}
json.dump(meta, open(OUT_META, 'w'), indent=1)
print('[nv200] meta', json.dumps(meta))
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=False, export_extras=True, export_attributes=True,
                          export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_tangents=False,
                          export_animations=False, export_skins=False, export_morph=False, export_lights=False, export_cameras=False,
                          export_materials='EXPORT', export_image_format='AUTO')
print('[nv200] wrote', OUT_GLB)
