# VH36 boxtruck26: a Class 6 cab-over with a 26 ft dry-van box (the Isuzu F-series cab sold in the US as the FTR, the
# common 26 ft rental and delivery truck on 125th Street). The cab and chassis are mekanismo's "Isuzu FFR"
# (Sketchfab / Objaverse 1.0 uid 29931659dfe84909a226a625cf5a8f75, CC-BY 4.0): re-materialised into the fleet's runtime
# classes, the chassis lengthened to a 6.10 m wheelbase, and a 7.92 m (26 ft) box built here (side and front panels, top
# and bottom rails, crossmembers, corner posts, header, roll-up door with its seams and handle, rear sill, ICC bumper, mud
# flaps, US lamps and markers, DOT-C2 tape). The box's panels and door are PAINT, as the CARLA box truck's box is: the
# instance colour of the 'truck' palette (78 % white) and the paint shader's road film. Blender 4.5, headless:
#   blender --background --python build_ftr26.py -- <source.glb> <out.glb> <out_meta.json> <tex_dir>
# then finish_vh36.mjs (root extras, KTX2, meshopt) writes public/models/fleet24/boxtruck26_vh36.glb.
# Frame: Blender Z up, front at -Y, the truck's left at +X (the glTF exporter makes it +Z forward, +Y up, left at +X).
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_GLB, OUT_META, TEX = argv[0], argv[1], argv[2], argv[3]
os.makedirs(TEX, exist_ok=True)
KIND = 'boxtruck26'
CM = 0.01                     # the source is in centimetres
WB = 6.10                     # wheelbase (the NV34 boxtruck26's, a 248 in chassis for a 26 ft body)
BOX_L, BOX_HW = 7.92, 1.25    # 26 ft box, 2.50 m (98 in) outside width
GAP = 0.10                    # cab to box
Z_SILL, Z_FLOOR, Z_TOP = 0.95, 1.07, 3.85   # under the crossmembers, bottom of the side panel rail, roof

# ---------------------------------------------------------------- swatches (atlas cells: sRGB colour, roughness, metalness)
SW = {
    'black_trim': ((0.035, 0.035, 0.037), 0.42, 0.0), 'frame_black': ((0.03, 0.03, 0.032), 0.62, 0.35),
    'tyre': ((0.028, 0.028, 0.03), 0.88, 0.0), 'rim': ((0.70, 0.71, 0.72), 0.38, 0.65), 'hub': ((0.12, 0.12, 0.13), 0.5, 0.5),
    'chrome': ((0.80, 0.80, 0.82), 0.10, 1.0), 'interior': ((0.20, 0.20, 0.21), 0.85, 0.0), 'seat': ((0.11, 0.11, 0.12), 0.8, 0.0),
    'matte_metal': ((0.55, 0.55, 0.56), 0.5, 0.8), 'mirror': ((0.75, 0.78, 0.80), 0.04, 1.0), 'blue': ((0.10, 0.12, 0.45), 0.5, 0.0),
    'frp': ((0.86, 0.86, 0.85), 0.38, 0.0), 'alu': ((0.72, 0.73, 0.74), 0.32, 0.85), 'alu_dark': ((0.45, 0.46, 0.47), 0.45, 0.7),
    'tape_red': ((0.62, 0.03, 0.03), 0.30, 0.0), 'tape_white': ((0.90, 0.90, 0.88), 0.30, 0.0), 'rubber': ((0.035, 0.035, 0.035), 0.9, 0.0),
    'amber_lens': ((0.85, 0.42, 0.03), 0.18, 0.0), 'door': ((0.84, 0.84, 0.83), 0.45, 0.0), 'seam': ((0.52, 0.53, 0.54), 0.45, 0.6),
    'steel': ((0.20, 0.20, 0.21), 0.55, 0.6), 'scuff': ((0.50, 0.50, 0.50), 0.55, 0.8), 'plate_black': ((0.02, 0.02, 0.02), 0.6, 0.0),
}
NAMES = list(SW.keys())
N = 8; CPX = 32               # 8 x 8 cells of 32 px
assert len(NAMES) <= N * N
def cell_uv(name):
    i = NAMES.index(name)
    return ((i % N + 0.5) / N, 1 - (i // N + 0.5) / N)
alb = np.zeros((N * CPX, N * CPX, 4), np.float32); alb[..., 3] = 1
mr = np.zeros((N * CPX, N * CPX, 4), np.float32); mr[..., 3] = 1
for i, nm in enumerate(NAMES):
    (r, g, b), ro, me = SW[nm]
    y0 = (N - 1 - i // N) * CPX; x0 = (i % N) * CPX     # Blender image rows run bottom-up
    alb[y0:y0 + CPX, x0:x0 + CPX, :3] = (r, g, b)
    mr[y0:y0 + CPX, x0:x0 + CPX, :3] = (1.0, ro, me)
def save_img(name, arr, srgb):
    im = bpy.data.images.new(name, arr.shape[1], arr.shape[0], alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im.pixels[:] = arr.ravel().tolist()
    im.filepath_raw = os.path.join(TEX, name + '.png'); im.file_format = 'PNG'; im.save()
    return im

bpy.ops.wm.read_factory_settings(use_empty=True)
IM_ALB = save_img('ftr26_detail', alb, True)
IM_MR = save_img('ftr26_detail_mr', mr, False)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH':
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o)

# ---------------------------------------------------------------- classes per source object / material
CLS = {'paint': 0, 'detail': 1, 'glass': 2, 'lens': 3, 'lamp': 4, 'lampInner': 5, 'wheel': 6}
ROLE = {'head': 1, 'fbl': 2, 'fbr': 3, 'tail': 4, 'rbl': 5, 'rbr': 6, 'rev': 7}
def classify(on, mat, cx):
    n = on.lower()
    side_b = 'fbl' if cx > 0 else 'fbr'          # +X is the truck's left
    if n.startswith(('cube_licplate', 'headlamplamp_base_b', 'headlamplamp_reflector_b', 'chassi_detal61')):
        return None                                # plate block; the chassis-end tail lamps (the box carries its own)
    if n.startswith(('tire48', 'rim23')):          # the spare under the frame: not a running wheel
        return ('detail', 'tyre' if n.startswith('tire') else 'rim', 0)
    if n.startswith('tire'):
        return ('wheel', 'tyre', 0)
    if n.startswith(('rim_detail5', 'rim_detail6')):
        return ('wheel', 'hub', 0)
    if n.startswith(('rim', 'bolt43', 'bolt45', 'bolt46', 'bolt47', 'axis_detal4', 'axis_detal6', 'axis_detal7')):
        return ('wheel', 'matte_metal' if n.startswith('bolt') else 'hub' if n.startswith('axis') else 'rim', 0)
    if mat == 'carpaint':
        if n.startswith('fog_light_glass'):
            return ('lens', None, 0)
        return ('paint', None, 0)
    if mat == 'windowglass':
        return ('glass', None, 0)
    if mat == 'clearglass':
        if n.startswith('headlamplamp_glass') or n.startswith('side_light_glass1'):
            return ('lens', None, 0)
        if n.startswith('headlamplamp_lamp1'):
            return ('lamp', None, ROLE['head'])
        if n.startswith('side_light_lamp1'):
            return ('lamp', None, ROLE['head'])
        return ('detail', 'amber_lens', 0)         # roof clearance lamps (amber in the US)
    if mat == 'orangeglass':
        return ('lamp', None, ROLE[side_b])
    if mat == 'chrome':
        if n.startswith('headlamplamp_reflector'):
            return ('lamp', None, ROLE['head'])
        if n.startswith('side_light_refl1'):
            return ('lamp', None, ROLE['head'])
        if n.startswith('side_light_refl'):
            return ('lamp', None, ROLE[side_b])
        return ('detail', 'chrome', 0)
    if mat == 'tire':
        return ('detail', 'tyre', 0)
    if mat == 'material':
        return ('detail', 'rim', 0)
    if mat == 'interior':
        return ('detail', 'interior', 0)
    if mat == 'mattemetal':
        return ('detail', 'matte_metal', 0)
    if mat == 'mirror':
        return ('detail', 'mirror', 0)
    if mat == 'blue':
        return ('detail', 'blue', 0)
    if mat == 'black':
        if n.startswith(('chassi', 'axis', 'pan_', 'bolt53', 'tube', 'fender_detail1', 'step')):
            return ('detail', 'frame_black', 0)
        return ('detail', 'black_trim', 0)
    return ('detail', 'black_trim', 0)

bm = bmesh.new()
L_CLS = bm.faces.layers.int.new('cls'); L_SW = bm.faces.layers.int.new('sw'); L_LAMP = bm.faces.layers.int.new('lamp')
L_WH = bm.faces.layers.int.new('wid')
L_KEEP = bm.faces.layers.int.new('keep')
stats = {}
for o in list(bpy.context.scene.objects):
    me = o.data
    mw = o.matrix_world
    ctr = sum((mw @ Vector(c) for c in o.bound_box), Vector()) / 8
    vmap = {}
    for p in me.polygons:
        mat = me.materials[p.material_index].name if me.materials and p.material_index < len(me.materials) and me.materials[p.material_index] else ''
        c = classify(o.name, mat, ctr.x)
        if c is None:
            continue
        cl, sw, role = c
        vs = []
        for vi in p.vertices:
            v = vmap.get(vi)
            if v is None:
                v = vmap[vi] = bm.verts.new((mw @ me.vertices[vi].co) * CM)
            vs.append(v)
        try:
            f = bm.faces.new(vs)
        except ValueError:
            continue
        f[L_CLS] = CLS[cl]; f[L_SW] = NAMES.index(sw) if sw else -1; f[L_LAMP] = role; f[L_WH] = 0
        stats[cl] = stats.get(cl, 0) + 1
print('[ftr26] source faces by class', stats)
for o in list(bpy.context.scene.objects):
    bpy.data.objects.remove(o)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0001)
bm.verts.ensure_lookup_table()

# ---------------------------------------------------------------- wheels: hubs from the running tyres
wheel_faces = [f for f in bm.faces if f[L_CLS] == CLS['wheel']]
tyre_i = NAMES.index('tyre')
def hub_of(c):
    front = c.y < 0
    left = c.x > 0
    return (1 if left else 2) if front else (3 if left else 4)
for f in wheel_faces:
    f[L_WH] = hub_of(f.calc_center_median())
hubs = {}
for k in (1, 2, 3, 4):
    tv = [v.co for f in wheel_faces if f[L_WH] == k and f[L_SW] == tyre_i for v in f.verts]
    xs = [p.x for p in tv]; ys = [p.y for p in tv]; zs = [p.z for p in tv]
    hubs[k] = {'c': Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)),
               'r': (max(zs) - min(zs)) / 2, 'w': max(xs) - min(xs)}
    print('[ftr26] hub', k, tuple(round(x, 3) for x in hubs[k]['c']), 'r %.3f w %.3f' % (hubs[k]['r'], hubs[k]['w']))
wb0 = (hubs[3]['c'].y + hubs[4]['c'].y) / 2 - (hubs[1]['c'].y + hubs[2]['c'].y) / 2
D = WB - wb0
# the cut: the widest vertex-free band between the cab and the rear tyres (nothing but rails and the shaft cross it)
cab_back = max(v.co.y for f in bm.faces if f[L_CLS] == CLS['paint'] for v in f.verts)
rear_front = min(v.co.y for f in wheel_faces if f[L_WH] >= 3 for v in f.verts)
lo, hi, B = cab_back + 0.4, rear_front - 0.3, 0.005
nb = int((hi - lo) / B)
occ = np.zeros(nb, bool)
for v in bm.verts:
    b = int((v.co.y - lo) / B)
    if 0 <= b < nb:
        occ[b] = True
best, s = (0, 0), None
for i in range(nb + 1):
    if i < nb and not occ[i]:
        s = i if s is None else s
    elif s is not None:
        if i - s > best[1] - best[0]:
            best = (s, i)
        s = None
CUT = lo + (best[0] + best[1]) / 2 * B
print('[ftr26] wheelbase %.3f -> %.3f (+%.3f); cab back y %.3f, rear tyres from %.3f; cut at y %.3f (free band %.0f mm)' % (wb0, WB, D, cab_back, rear_front, CUT, (best[1] - best[0]) * B * 1000))
for v in bm.verts:
    if v.co.y > CUT:
        v.co.y += D
for k in (3, 4):
    hubs[k]['c'].y += D

# ---------------------------------------------------------------- the 26 ft box and its running gear
added = []    # (verts, cls, swatch, role)
def box(x0, x1, y0, y1, z0, z1, sw, cl='detail', role=0, faces=None):
    x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1); z0, z1 = min(z0, z1), max(z0, z1)
    vs = [Vector((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    q = {'-z': (0, 2, 3, 1), '+z': (4, 5, 7, 6), '-y': (0, 1, 5, 4), '+y': (3, 2, 6, 7), '-x': (2, 0, 4, 6), '+x': (1, 3, 7, 5)}
    for k, idx in q.items():
        if faces and k not in faces:
            continue
        added.append(([vs[i].copy() for i in idx], cl, sw, role))
def quad(pts, sw, cl='detail', role=0):
    added.append(([Vector(p) for p in pts], cl, sw, role))
def side_quad(x, y0, y1, z0, z1, sw, cl='detail', role=0):
    # a panel in the plane x = const, facing outward (+x on the left side, -x on the right); counter-clockwise seen
    # from outside (the runtime culls back faces: the first build had every one of these facing in)
    if x > 0:
        quad([(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)], sw, cl, role)
    else:
        quad([(x, y1, z0), (x, y0, z0), (x, y0, z1), (x, y1, z1)], sw, cl, role)
def rear_quad(y, x0, x1, z0, z1, sw, cl='detail', role=0):
    quad([(x1, y, z0), (x0, y, z0), (x0, y, z1), (x1, y, z1)], sw, cl, role)       # faces +y (the rear)
def front_quad(y, x0, x1, z0, z1, sw, cl='detail', role=0):
    quad([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], sw, cl, role)       # faces -y (the front)

Y0 = max(cab_back, max(v.co.y for f in bm.faces if f[L_CLS] != CLS['wheel'] and f.calc_center_median().z > 1.0 and f.calc_center_median().y < CUT for v in f.verts)) + GAP
Y1 = Y0 + BOX_L
W = BOX_HW
frame_top = max(v.co.z for f in bm.faces if f[L_SW] == NAMES.index('frame_black') and abs(f.calc_center_median().x) < 0.5 and -1 < f.calc_center_median().y < 3 for v in f.verts)
print('[ftr26] box y %.3f..%.3f; frame top z %.3f' % (Y0, Y1, frame_top))
ZS = max(Z_SILL, frame_top + 0.10)                       # bottom of the crossmembers
ZF = ZS + 0.12                                           # bottom of the side panels (top of the bottom rail band)
# long sills on the frame rails, crossmembers every 0.305 m (12 in)
for sx in (-1, 1):
    box(sx * 0.37, sx * 0.45, Y0 + 0.05, Y1 - 0.05, frame_top, ZS, 'alu_dark')
y = Y0 + 0.12
while y < Y1 - 0.15:
    box(-W + 0.01, W - 0.01, y, y + 0.045, ZS, ZS + 0.10, 'alu_dark', faces=('-z', '-y', '+y', '-x', '+x'))
    y += 0.305
# floor underside (between the crossmembers) and the box shell
quad([(-W, Y0, ZS + 0.10), (W, Y0, ZS + 0.10), (W, Y1, ZS + 0.10), (-W, Y1, ZS + 0.10)][::-1], 'alu_dark')   # faces down
for sx in (-1, 1):
    x = sx * W
    side_quad(x, Y0 + 0.06, Y1 - 0.10, ZF, Z_TOP - 0.12, None, 'paint')                      # side panel (paint: road film)
    box(sx * (W - 0.004), sx * (W + 0.012), Y0, Y1 - 0.10, ZS, ZF, 'alu', faces=('-z', '+z', '+x' if sx > 0 else '-x'))   # bottom rail
    box(sx * (W - 0.004), sx * (W + 0.010), Y0, Y1 - 0.10, Z_TOP - 0.12, Z_TOP, 'alu', faces=('+z', '-z', '+x' if sx > 0 else '-x'))   # top rail
    box(sx * (W - 0.07), sx * (W + 0.012), Y0 - 0.012, Y0 + 0.06, ZS, Z_TOP, 'alu')       # front corner cap
    box(sx * (W - 0.13), sx * (W + 0.014), Y1 - 0.10, Y1 + 0.012, ZS, Z_TOP, 'alu')       # rear corner post
    for t in (0.34, 0.67):                                                                   # FRP panel joints
        yy = Y0 + t * BOX_L
        box(sx * (W - 0.002), sx * (W + 0.006), yy - 0.022, yy + 0.022, ZF, Z_TOP - 0.12, 'alu', faces=('+x' if sx > 0 else '-x', '-y', '+y'))
    # DOT-C2 tape on the bottom rail: 7 in red / 11 in white, half the length
    yy = Y0 + 0.25
    k = 0
    while yy < Y1 - 0.4:
        side_quad(sx * (W + 0.0135), yy, yy + (0.18 if k % 2 == 0 else 0.28), ZS + 0.035, ZS + 0.085, 'tape_red' if k % 2 == 0 else 'tape_white')
        yy += 0.18 if k % 2 == 0 else 0.28
        k += 1
        if k % 2 == 0:
            yy += 0.45
    # side markers: amber at the front, mid-length, red at the rear
    for yy, sw, role in ((Y0 + 0.18, None, 0), (Y0 + BOX_L / 2, None, 0), (Y1 - 0.30, None, ROLE['tail'])):
        if role:
            box(sx * (W + 0.012), sx * (W + 0.035), yy - 0.05, yy + 0.05, ZS + 0.02, ZS + 0.10, None, 'lamp', role)
        else:
            box(sx * (W + 0.012), sx * (W + 0.035), yy - 0.05, yy + 0.05, ZS + 0.02, ZS + 0.10, 'amber_lens')
front_quad(Y0, -W + 0.07, W - 0.07, ZS, Z_TOP, None, 'paint')                               # front wall
quad([(-W, Y0, Z_TOP - 0.004), (W, Y0, Z_TOP - 0.004), (W, Y1, Z_TOP - 0.004), (-W, Y1, Z_TOP - 0.004)], None, 'paint')   # roof, faces up
for xx in (-0.95, 0.95):                                                                     # front clearance lamps (amber)
    box(xx - 0.05, xx + 0.05, Y0 - 0.035, Y0 - 0.012, Z_TOP - 0.10, Z_TOP - 0.04, 'amber_lens')
# rear: header, sill, roll-up door with its seams, handle and latch
box(-W + 0.13, W - 0.13, Y1 - 0.10, Y1 + 0.010, Z_TOP - 0.24, Z_TOP, 'alu')                 # header
box(-W, W, Y1 - 0.10, Y1 + 0.025, ZS, ZF + 0.05, 'alu')                                       # rear sill
rear_quad(Y1 + 0.0265, -W + 0.05, W - 0.05, ZS + 0.025, ZS + 0.075, 'tape_red')             # DOT tape across the sill
for sx in (-1, 1):                                                                            # the tape's upper corner marks
    rear_quad(Y1 + 0.0125, sx * (W - 0.11), sx * (W - 0.03), Z_TOP - 0.36, Z_TOP - 0.06, 'tape_white')
rear_quad(Y1 - 0.025, -W + 0.13, W - 0.13, ZF + 0.05, Z_TOP - 0.24, None, 'paint')          # the door, recessed
zz = ZF + 0.05 + 0.29
while zz < Z_TOP - 0.30:
    rear_quad(Y1 - 0.0235, -W + 0.13, W - 0.13, zz - 0.005, zz + 0.005, 'seam')              # panel joints
    zz += 0.29
box(-0.13, 0.13, Y1 - 0.025, Y1 + 0.005, ZF + 0.14, ZF + 0.20, 'black_trim')                 # lift handle
box(-0.03, 0.03, Y1 - 0.025, Y1 + 0.012, ZF + 0.06, ZF + 0.12, 'steel')                      # latch
box(-W + 0.13, -W + 0.17, Y1 - 0.025, Y1 + 0.004, ZF + 0.05, Z_TOP - 0.24, 'alu_dark')         # door tracks
box(W - 0.17, W - 0.13, Y1 - 0.025, Y1 + 0.004, ZF + 0.05, Z_TOP - 0.24, 'alu_dark')
for xx in (-0.16, 0.0, 0.16):                                                                 # ID lamps (red)
    box(xx - 0.04, xx + 0.04, Y1 + 0.010, Y1 + 0.030, Z_TOP - 0.15, Z_TOP - 0.09, None, 'lamp', ROLE['tail'])
for sx in (-1, 1):                                                                            # rear clearance lamps
    box(sx * (W - 0.10) - 0.035, sx * (W - 0.10) + 0.035, Y1 + 0.012, Y1 + 0.032, Z_TOP - 0.17, Z_TOP - 0.10, None, 'lamp', ROLE['tail'])
# ICC bumper on two brackets from the sill; tail / stop / turn and reverse lamps in it; plate on the left
ZB0, ZB1 = 0.46, 0.60
box(-1.10, 1.10, Y1 - 0.12, Y1 - 0.01, ZB0, ZB1, 'steel')
for sx in (-1, 1):
    box(sx * 0.58, sx * 0.66, Y1 - 0.16, Y1 - 0.08, ZB1, ZS, 'steel')
    box(sx * 0.70, sx * 1.04, Y1 - 0.06, Y1 + 0.005, ZB1 + 0.02, ZB1 + 0.30, 'steel')       # lamp boards
    box(sx * 0.80, sx * 1.00, Y1 + 0.005, Y1 + 0.03, ZB1 + 0.16, ZB1 + 0.28, None, 'lamp', ROLE['tail'])      # stop / tail
    box(sx * 0.80, sx * 0.90, Y1 + 0.005, Y1 + 0.03, ZB1 + 0.04, ZB1 + 0.14, None, 'lamp', ROLE['rbl'] if sx > 0 else ROLE['rbr'])   # turn
    box(sx * 0.91, sx * 1.00, Y1 + 0.005, Y1 + 0.03, ZB1 + 0.04, ZB1 + 0.14, None, 'lamp', ROLE['rev'])       # reverse
rear_quad(Y1 - 0.009, -1.10, 1.10, ZB0 + 0.02, ZB1 - 0.02, 'tape_red')
box(0.20, 0.52, Y1 - 0.065, Y1 - 0.05, ZB1 + 0.05, ZB1 + 0.21, 'plate_black')                 # plate bracket (the runtime adds no plate to box trucks)
# mud flaps behind the rear duals, on a cross bar under the box
yf = hubs[3]['c'].y + hubs[3]['r'] + 0.10
box(-1.12, 1.12, yf - 0.02, yf + 0.02, ZS - 0.06, ZS - 0.02, 'steel')
for sx in (-1, 1):
    box(sx * 0.55, sx * 1.10, yf + 0.02, yf + 0.032, 0.30, ZS - 0.04, 'rubber')

for verts, cl, sw, role in added:
    vs = [bm.verts.new(v) for v in verts]
    try:
        f = bm.faces.new(vs)
    except ValueError:
        continue
    f[L_CLS] = CLS[cl]; f[L_SW] = NAMES.index(sw) if sw else -1; f[L_LAMP] = role; f[L_WH] = 0; f[L_KEEP] = 1
print('[ftr26] box faces added', len(added))
_bc = Vector((0.0, (Y0 + Y1) / 2, (ZS + Z_TOP) / 2))
_bad = 0
for verts, cl, sw, role in added:
    if len(verts) != 4:
        continue
    n = (verts[1] - verts[0]).cross(verts[2] - verts[1])
    c = sum(verts, Vector()) / 4
    d = c - _bc
    # only the shell's own planes: a quad on the box's outer planes must face out along its axis
    for ax in range(3):
        if abs(n[ax]) > 0.9 * n.length and ((ax == 0 and abs(abs(c.x) - W) < 0.03) or (ax == 1 and (abs(c.y - Y0) < 0.04 or abs(c.y - Y1) < 0.04)) or (ax == 2 and abs(c.z - Z_TOP) < 0.01)):
            if n[ax] * d[ax] < 0:
                _bad += 1
print('[ftr26] shell quads facing in: %d' % _bad)

# ---------------------------------------------------------------- centre on the ground origin
ys = [v.co.y for v in bm.verts]
ymid = (max(ys) + min(ys)) / 2
zmin = min(v.co.z for f in wheel_faces for v in f.verts)
for v in bm.verts:
    v.co.y -= ymid; v.co.z -= zmin
for hb in hubs.values():
    hb['c'] = Vector((hb['c'].x, hb['c'].y - ymid, hb['c'].z - zmin))
YF, YR = min(ys) - ymid, max(ys) - ymid
bm.normal_update()
me = bpy.data.meshes.new('ftr_src'); bm.to_mesh(me); bm.free()
src = bpy.data.objects.new('ftr_src', me); bpy.context.scene.collection.objects.link(src)

# ---------------------------------------------------------------- materials
def principled(name, cls, base=(1, 1, 1, 1), rough=0.5, metal=0.0, alpha=1.0, tex=None, mrt=None, clearcoat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = base; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if clearcoat:
        b.inputs['Coat Weight'].default_value = clearcoat; b.inputs['Coat Roughness'].default_value = 0.04
    if tex is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex; t.interpolation = 'Closest'
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if mrt is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = mrt; t.interpolation = 'Closest'
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        b.inputs['Roughness'].default_value = 1.0; b.inputs['Metallic'].default_value = 1.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m['cls'] = cls
    m.use_backface_culling = True
    return m
MATS = [principled('boxtruck26_paint', 'paint', base=(0.8, 0.8, 0.8, 1), rough=0.35, clearcoat=1.0),
        principled('ftr26_detail', 'detail', tex=IM_ALB, mrt=IM_MR),
        principled('ftr26_glass', 'glass', base=(0.02, 0.025, 0.03, 1), rough=0.03, alpha=0.35),
        principled('ftr26_lens', 'lens', base=(0.9, 0.9, 0.9, 1), rough=0.02, alpha=0.12),
        principled('ftr26_lamp', 'lamp', base=(0.85, 0.85, 0.85, 1), rough=0.2, metal=0.6),
        principled('ftr26_lampInner', 'lampInner', base=(0.02, 0.02, 0.02, 1), rough=0.25, metal=0.2)]
for m in MATS:
    src.data.materials.append(m)

# ---------------------------------------------------------------- LoDs (class borders held while collapsing, as build_nv200.py)
DROP_FAR = {NAMES.index(n) for n in ('interior', 'seat', 'matte_metal', 'blue', 'chrome')}
def make_lod(name, ratio, protect=True, far=False):
    ob = bpy.data.objects.new(name, src.data.copy()); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    if far:
        bmf = bmesh.new(); bmf.from_mesh(ob.data)
        swl = bmf.faces.layers.int['sw']; cll = bmf.faces.layers.int['cls']
        gone = [f for f in bmf.faces if f[swl] in DROP_FAR and f[cll] == CLS['detail']]
        bmesh.ops.delete(bmf, geom=gone, context='FACES')
        bmf.to_mesh(ob.data); bmf.free()
        ratio = min(1.0, ratio * src_tris / max(1, sum(len(p.vertices) - 2 for p in ob.data.polygons)))
    if ratio < 1:
        bmw = bmesh.new(); bmw.from_mesh(ob.data)
        fl = [bmw.faces.layers.int[k] for k in ('cls', 'sw', 'lamp', 'wid')]
        kl = bmw.faces.layers.int['keep']
        border = [len(set(tuple(f[l] for l in fl) for f in v.link_faces)) > 1 or any(f[kl] for f in v.link_faces) for v in bmw.verts]
        bmw.free()
        vg = ob.vertex_groups.new(name='dec')
        vg.add([i for i, b in enumerate(border) if not b], 1.0, 'REPLACE')
        vg.add([i for i, b in enumerate(border) if b], 0.0 if protect else 1.0, 'REPLACE')
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
        mod.vertex_group = 'dec'; mod.vertex_group_factor = 50.0
        bpy.ops.object.modifier_apply(modifier='dec')
        g = ob.vertex_groups.get('dec')
        if g is not None:
            ob.vertex_groups.remove(g)
    b2 = bmesh.new(); b2.from_mesh(ob.data)
    bmesh.ops.triangulate(b2, faces=b2.faces[:])
    cl = b2.faces.layers.int['cls']; sw = b2.faces.layers.int['sw']; lp = b2.faces.layers.int['lamp']; wh = b2.faces.layers.int['wid']
    uv = b2.loops.layers.uv.new('UVMap')
    WL = b2.verts.layers.float.new('_WHEEL'); LA = b2.verts.layers.float.new('_LAMP')
    for v in b2.verts:
        v[WL] = 0.0; v[LA] = 0.0
    for f in b2.faces:
        c = f[cl]
        f.material_index = {0: 0, 1: 1, 6: 1, 2: 2, 3: 3, 4: 4, 5: 5}[c]
        s = NAMES[f[sw]] if f[sw] >= 0 else 'black_trim'
        cu, cv = cell_uv(s)
        for lo in f.loops:
            lo[uv].uv = (cu, cv)
        if c == CLS['wheel'] and f[wh] > 0:
            for v in f.verts:
                v[WL] = float(f[wh])
        if c == CLS['lamp'] and f[lp] > 0:
            for v in f.verts:
                v[LA] = float(f[lp])
    b2.to_mesh(ob.data); b2.free()
    for a in ('cls', 'sw', 'lamp', 'wid', 'keep'):
        if a in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes[a])
    ob.data.shade_smooth()
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(35))
    except Exception as e:
        print('[ftr26] sharp edges:', e)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('[ftr26] %s ratio %.4f -> %d tris' % (name, ratio, tris))
    return ob, tris

src_tris = sum(len(p.vertices) - 2 for p in src.data.polygons)
print('[ftr26] source tris', src_tris)
lod0, t0 = make_lod('LOD0', 1.0)
lod1, t1 = make_lod('LOD1', 22000 / src_tris)
lod2, t2 = make_lod('LOD2', 13000 / src_tris, far=True)
bpy.data.objects.remove(src)
root = bpy.data.objects.new(KIND, None); bpy.context.scene.collection.objects.link(root)
for ob in (lod0, lod1, lod2):
    ob.parent = root

def rt(v):     # Blender (x, y, z) -> glTF (x, z, -y)
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
xs = [abs(v.co.x) for v in lod0.data.vertices]
size = [round(2 * max(xs), 3), round(max(v.co.z for v in lod0.data.vertices), 3), round(YR - YF, 3)]
meta = {
    'kind': KIND, 'size': size,
    'hubs': [{'id': k, 'p': rt(hb['c']), 'r': round(hb['r'], 4), 'w': round(hb['w'], 4)} for k, hb in sorted(hubs.items())],
    'wheelbase': round(abs(hubs[1]['c'].y - hubs[3]['c'].y), 3), 'tris': [t0, t1, t2],
    'box': {'y0': round(-(Y0 - ymid), 3), 'y1': round(-(Y1 - ymid), 3), 'top': Z_TOP - zmin},
    'source': "mekanismo, 'Isuzu FFR' (cab and chassis), sketchfab.com/3d-models/29931659dfe84909a226a625cf5a8f75, CC-BY 4.0; "
              "re-materialised, chassis lengthened to a 6.10 m wheelbase, 26 ft box, lamps and markers: Valdrada "
              "(boundlessjs/tools/ar34/vehicles/vh36/build_ftr26.py)",
}
json.dump(meta, open(OUT_META, 'w'), indent=1)
print('[ftr26] meta', json.dumps(meta))
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=False, export_extras=True, export_attributes=True,
                          export_yup=True, export_apply=True, export_texcoords=True, export_normals=True, export_tangents=False,
                          export_animations=False, export_skins=False, export_morph=False, export_lights=False, export_cameras=False,
                          export_materials='EXPORT', export_image_format='AUTO')
print('[ftr26] wrote', OUT_GLB)
