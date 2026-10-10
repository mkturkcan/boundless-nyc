# Shared Blender helpers for the SERVICES vehicles (build_<kind>.py): polygon accumulation in the fleet's frame, simple
# solids, lathes, materials by runtime class, LOD nodes and the glTF export that pack.mjs finishes.
# Frame (sim/fleet24.js): +Z forward, +Y up, left side at +X, origin at the ground centre, metres. A runtime point
# (x, y, z) is written to Blender as (x, -z, y); the glTF exporter's +Y-up conversion turns it back.
import bpy, bmesh, math, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'tex')

def clamp(v, a, b): return a if v < a else b if v > b else v
def mix(a, b, t): return a + (b - a) * t
def smooth(t): t = clamp(t, 0, 1); return t * t * (3 - 2 * t)

class Part:
    def __init__(self, name, cls, mat):
        self.name, self.cls, self.mat = name, cls, mat
        self.v, self.f, self.uv, self.wheel, self.lamp = [], [], [], [], []
    def add_v(self, p, wheel=0, lamp=0):
        self.v.append(p); self.wheel.append(wheel); self.lamp.append(lamp); return len(self.v) - 1
    def face(self, idx, uvs):
        self.f.append(list(idx)); self.uv.append(list(uvs))

class Kit:
    """one LOD's parts; `uvfn(p, n)` maps a paint vertex to the livery atlas"""
    def __init__(self, prefix, uvfn=None):
        self.prefix, self.parts, self.uvfn = prefix, {}, uvfn
    def part(self, key, cls, mat=None):
        if key not in self.parts: self.parts[key] = Part(key, cls, mat or f'{self.prefix}_{key}')
        return self.parts[key]

SWN = 8
def sw_uv(i):
    return ((i % SWN) + 0.5) / SWN, 1 - ((i // SWN) + 0.5) / SWN

def cell_uv(i, u, v):
    """detail atlas (4 x 4 cells): u, v in 0..1 inside cell i, v down from the cell's top"""
    u = clamp(u, 0.004, 0.996); v = clamp(v, 0.004, 0.996)
    return ((i % 4) + u) / 4, 1 - ((i // 4) + v) / 4

def fnormal(ps):
    # Newell's method: robust for any planar-ish polygon
    nx = ny = nz = 0.0
    for i in range(len(ps)):
        (x0, y0, z0), (x1, y1, z1) = ps[i], ps[(i + 1) % len(ps)]
        nx += (y0 - y1) * (z0 + z1); ny += (z0 - z1) * (x0 + x1); nz += (x0 - x1) * (y0 + y1)
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    return (nx / l, ny / l, nz / l)

def poly(kit, pt, ps, uvs=None, wheel=0, lamp=0, sw=None):
    """a polygon (runtime-frame points, counter-clockwise seen from outside)"""
    n = fnormal(ps)
    if uvs is None:
        if sw is not None or kit.uvfn is None: uvs = [sw_uv(sw or 0)] * len(ps)
        else: uvs = [kit.uvfn(p, n) for p in ps]
    idx = [pt.add_v(p, wheel, lamp) for p in ps]
    pt.face(idx, uvs)

def box(kit, pt, c, s, sw=None, lamp=0, wheel=0, skip=()):
    x, y, z = c; hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    P = [(x + dx * hx, y + dy * hy, z + dz * hz) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
    def v(i, j, k): return P[(i * 4) + (j * 2) + k]
    faces = {
        '+x': [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)], '-x': [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)],
        '+y': [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)], '-y': [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
        '+z': [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], '-z': [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)],
    }
    for k, f in faces.items():
        if k in skip: continue
        poly(kit, pt, f, sw=sw, lamp=lamp, wheel=wheel)

def bevel_box(kit, pt, c, s, r, sw=None, lamp=0, seg=2):
    """a box with rounded vertical edges (plan corners of radius r): sides, top and bottom"""
    x, y, z = c; hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = min(r, hx * 0.95, hz * 0.95)
    ring = []
    for (cx, cz, a0) in ((hx - r, hz - r, 0), (-hx + r, hz - r, 90), (-hx + r, -hz + r, 180), (hx - r, -hz + r, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            ring.append((x + cx + r * math.cos(a), z + cz + r * math.sin(a)))
    n = len(ring)
    for i in range(n):
        (x0, z0), (x1, z1) = ring[i], ring[(i + 1) % n]
        poly(kit, pt, [(x0, y - hy, z0), (x1, y - hy, z1), (x1, y + hy, z1), (x0, y + hy, z0)][::-1], sw=sw, lamp=lamp)
    poly(kit, pt, [(p[0], y + hy, p[1]) for p in ring][::-1], sw=sw, lamp=lamp)
    poly(kit, pt, [(p[0], y - hy, p[1]) for p in ring], sw=sw, lamp=lamp)

def lathe_x(kit, pt, cx, cy, cz, prof, nseg, side, sw, wheel=0, lamp=0, uvf=None):
    """surface of revolution about the X axis through (cx, cy, cz); prof = [(dx, r)] (dx outboard positive for
    side = +1, mirrored for side = -1), faces outward"""
    for k in range(nseg):
        a0, a1 = 2 * math.pi * k / nseg, 2 * math.pi * (k + 1) / nseg
        for j in range(len(prof) - 1):
            (x0, r0), (x1, r1) = prof[j], prof[j + 1]
            if r0 < 1e-6 and r1 < 1e-6: continue
            p = [(cx + side * x0, cy + r0 * math.sin(a0), cz + r0 * math.cos(a0)), (cx + side * x1, cy + r1 * math.sin(a0), cz + r1 * math.cos(a0)),
                 (cx + side * x1, cy + r1 * math.sin(a1), cz + r1 * math.cos(a1)), (cx + side * x0, cy + r0 * math.sin(a1), cz + r0 * math.cos(a1))]
            if side < 0: p = [p[0], p[3], p[2], p[1]]
            if r0 < 1e-6: p = [p[0], p[1], p[2]] if side > 0 else [p[0], p[1], p[2]]
            poly(kit, pt, p, uvs=[uvf(q) for q in p] if uvf else None, sw=sw, wheel=wheel, lamp=lamp)

def disc_x(kit, pt, cx, cy, cz, r, nseg, facing, sw, wheel=0, lamp=0):
    """flat disc in the YZ plane facing +X (facing = 1) or -X (-1)"""
    ps = [(cx, cy + r * math.sin(2 * math.pi * k / nseg), cz + r * math.cos(2 * math.pi * k / nseg)) for k in range(nseg)]
    poly(kit, pt, ps if facing > 0 else ps[::-1], sw=sw, wheel=wheel, lamp=lamp)

# ---------------------------------------------------------------- Blender
ROUGH = {'chrome': (0.14, 1.0), 'alu': (0.30, 1.0), 'wheel': (0.38, 0.2), 'tyre': (0.86, 0.0), 'interior': (0.85, 0.0),
         'plate': (0.45, 0.0), 'trim': (0.55, 0.0), 'diamond': (0.32, 1.0), 'reflect': (0.35, 0.0)}

def material(kind, name, cls, livery_png):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    m['cls'] = cls
    def img(path):
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.get(os.path.basename(path)) or bpy.data.images.load(path)
        m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    rough, metal = {'paint': 0.35, 'detail': 0.6}.get(cls, 0.2), 0.0
    if cls == 'paint': img(livery_png)
    elif cls == 'detail':
        # '_dtl' parts map the detail atlas (grille mesh, plates, wheel faces), the rest the colour swatches
        img(os.path.join(TEX, 'svc_detail.png' if 'dtl' in name else 'svc_swatch.png'))
        for k, (r, mt) in ROUGH.items():
            if k in name: rough, metal = r, mt; break
    elif cls == 'glass':
        bsdf.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m

def emit(kind, kit, lodname, parent, livery_png, sharp_deg=None):
    sharp_deg = sharp_deg or {}
    for key, pt in kit.parts.items():
        if not pt.f: continue
        me = bpy.data.meshes.new(f'{kind}_{lodname}_{key}')
        me.from_pydata([(x, -z, y) for (x, y, z) in pt.v], [], pt.f)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        for poly_, uvs in zip(me.polygons, pt.uv):
            for k, loop in enumerate(poly_.loop_indices): uvl.data[loop].uv = uvs[k]
        if any(pt.wheel):
            a = me.attributes.new('_wheel', 'FLOAT', 'POINT'); a.data.foreach_set('value', [float(w) for w in pt.wheel])
        if any(pt.lamp):
            a = me.attributes.new('_lamp', 'FLOAT', 'POINT'); a.data.foreach_set('value', [float(w) for w in pt.lamp])
        me.materials.append(material(kind, pt.mat, pt.cls, livery_png))
        ob = bpy.data.objects.new(f'{kind}_{lodname}_{key}', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
        bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(sharp_deg.get(key, 30)))

def merge_into(kit, dst_key, src_keys, cls='detail'):
    dst = kit.part(dst_key, cls)
    for k in src_keys:
        if k not in kit.parts or k == dst_key: continue
        src = kit.parts.pop(k)
        off = len(dst.v)
        dst.v += src.v; dst.wheel += src.wheel; dst.lamp += [0] * len(src.v)
        dst.f += [[i + off for i in f] for f in src.f]; dst.uv += src.uv

def start(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new(kind, None)
    bpy.context.scene.collection.objects.link(root)
    return root

def lod_node(root, i):
    node = bpy.data.objects.new(f'LOD{i}', None)
    bpy.context.scene.collection.objects.link(node)
    node.parent = root
    return node

def export(out, hubs, source, extra):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_attributes=True, export_extras=True, export_yup=True,
                              export_apply=True, export_image_format='AUTO', export_materials='EXPORT')
    json.dump({'hubs': hubs, 'source': source, 'extra': extra}, open(out + '.json', 'w'), indent=1)
    print('wrote', out)
