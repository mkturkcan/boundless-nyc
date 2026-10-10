# Geometry helpers for the delivery fleet (build_delivery.py). Everything is authored in the RUNTIME frame of
# sim/fleet24.js (x = the vehicle's left, y up, z forward, metres, ground at y = 0) and written to Blender as
# (x, -z, y), which the glTF exporter's +Y-up conversion turns back into (x, y, z).
# Parts are separate objects while a LOD is built; finish_lod() applies their modifiers and joins them into one mesh
# (one glTF primitive per material). Every part carries the two per-vertex attributes the sim reads: _WHEEL (1..4 =
# FL FR RL RR) and _LAMP (lamp role, sim/fleet24.js ROLE).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

S = {'lod': 0, 'texdir': '.', 'parts': []}
MATS = {}


def BL(p):
    return (p[0], -p[2], p[1])


def RT(v):
    return (v[0], v[2], -v[1])


def mat(name, col=(0.5, 0.5, 0.5), metal=0.0, rough=0.5, tex=None, normal=None, double=False):
    """name = '<cls>:<label>' (paint, detail, glass, lens, lamp, lampInner). col is LINEAR."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (col[0], col[1], col[2], 1.0)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if tex:
        im = bpy.data.images.load(os.path.join(S['texdir'], tex))
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = im
        nt.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
    if normal:
        im = bpy.data.images.load(os.path.join(S['texdir'], normal))
        im.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = im
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    m.use_backface_culling = not double
    MATS[name] = m
    return m


def _uv_default(p, n):
    # box projection in metres (u to the viewer's right on every side face, v up)
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ax >= ay and ax >= az:
        return ((-p[2] if n[0] > 0 else p[2]), p[1])
    if az >= ay:
        return ((p[0] if n[2] > 0 else -p[0]), p[1])
    return (p[0], p[2])


def make(name, verts, faces, m, uv=None, wheel=0, lamp=0, smooth=False, sharp=35, bevel=0.0, bseg=2, recalc=True,
         bangle=40, shadow=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([BL(v) for v in verts], [], faces)
    me.validate(clean_customdata=False)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    me.materials.append(m)
    # UVs (runtime-frame function of position and face normal)
    uvl = me.uv_layers.new(name='UVMap')
    fn = uv or _uv_default
    for poly in me.polygons:
        n = RT(poly.normal)
        for li in poly.loop_indices:
            p = RT(me.vertices[me.loops[li].vertex_index].co)
            uvl.data[li].uv = fn(p, n)
    for an, val in (('_WHEEL', wheel), ('_LAMP', lamp)):
        at = me.attributes.new(an, 'FLOAT', 'POINT')
        at.data.foreach_set('value', [float(val)] * len(me.vertices))
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(sharp))
        except Exception:
            pass
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if bevel > 0 and S['lod'] < 2:
        md = ob.modifiers.new('bv', 'BEVEL')
        md.width = bevel
        md.segments = bseg if S['lod'] == 0 else 1
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(bangle)
        md.use_clamp_overlap = True
        try:
            md.harden_normals = True
        except Exception:
            pass
        if not smooth:
            for poly in me.polygons:
                poly.use_smooth = True
            try:
                me.set_sharp_from_angle(angle=math.radians(sharp))
            except Exception:
                pass
    S['parts'].append(ob)
    return ob


def box(name, m, x0, x1, y0, y1, z0, z1, **kw):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    return make(name, v, f, m, **kw)


def boxc(name, m, c, s, **kw):
    return box(name, m, c[0] - s[0] / 2, c[0] + s[0] / 2, c[1] - s[1] / 2, c[1] + s[1] / 2, c[2] - s[2] / 2, c[2] + s[2] / 2, **kw)


def prism(name, m, prof, a0, a1, axis='x', **kw):
    """prof: closed polygon in the plane normal to `axis` ((z, y) for x, (x, y) for z, (x, z) for y), extruded a0..a1"""
    n = len(prof)
    v = []
    for a in (a0, a1):
        for (s, t) in prof:
            v.append((a, t, s) if axis == 'x' else (s, t, a) if axis == 'z' else (s, a, t))
    f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
    return make(name, v, f, m, **kw)


def lathe(name, m, prof, c, segs, axis='x', cap0=False, cap1=False, phase=0.0, **kw):
    """prof: [(offset along the axis, radius)], revolved about the axis through c"""
    v, f = [], []
    rings = []
    for (o, r) in prof:
        ring = []
        for k in range(segs):
            t = phase + 2 * math.pi * k / segs
            a, b = r * math.cos(t), r * math.sin(t)
            if axis == 'x':
                p = (c[0] + o, c[1] + a, c[2] + b)
            elif axis == 'z':
                p = (c[0] + a, c[1] + b, c[2] + o)
            else:
                p = (c[0] + a, c[1] + o, c[2] + b)
            ring.append(len(v))
            v.append(p)
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, Bq = rings[i], rings[i + 1]
        for k in range(segs):
            k2 = (k + 1) % segs
            f.append((A[k], A[k2], Bq[k2], Bq[k]))
    if cap0:
        f.append(tuple(reversed(rings[0])))
    if cap1:
        f.append(tuple(rings[-1]))
    return make(name, v, f, m, **kw)


def tube(name, m, p0, p1, r, segs=10, cap=True, **kw):
    """a cylinder between two points"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    z = d.normalized()
    x = Vector((0, 1, 0)).cross(z) if abs(z.y) < 0.9 else Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    v, f = [], []
    for e in (0, 1):
        for k in range(segs):
            t = 2 * math.pi * k / segs
            q = p0 + z * (L * e) + x * (r * math.cos(t)) + y * (r * math.sin(t))
            v.append(tuple(q))
    for k in range(segs):
        k2 = (k + 1) % segs
        f.append((k, k2, segs + k2, segs + k))
    if cap:
        f.append(tuple(reversed(range(segs))))
        f.append(tuple(range(segs, 2 * segs)))
    return make(name, v, f, m, **kw)


def torus(name, m, c, axis, R, r, segs=24, rsegs=8, **kw):
    ax = Vector(axis).normalized()
    x = Vector((0, 1, 0)).cross(ax) if abs(ax.y) < 0.9 else Vector((1, 0, 0)).cross(ax)
    x.normalize()
    y = ax.cross(x)
    c = Vector(c)
    v, f = [], []
    for i in range(segs):
        t = 2 * math.pi * i / segs
        rd = x * math.cos(t) + y * math.sin(t)
        for j in range(rsegs):
            s = 2 * math.pi * j / rsegs
            v.append(tuple(c + rd * (R + r * math.cos(s)) + ax * (r * math.sin(s))))
    for i in range(segs):
        for j in range(rsegs):
            a = i * rsegs + j
            b = i * rsegs + (j + 1) % rsegs
            cc = ((i + 1) % segs) * rsegs + (j + 1) % rsegs
            d = ((i + 1) % segs) * rsegs + j
            f.append((a, b, cc, d))
    return make(name, v, f, m, smooth=True, **kw)


def quad(name, m, pts, out, uvq=None, **kw):
    """one-sided polygon facing `out` (runtime direction); uvq: per-vertex uv list"""
    a, b, c = Vector(pts[0]), Vector(pts[1]), Vector(pts[2])
    n = (b - a).cross(c - a)
    pts = list(pts)
    idx = list(range(len(pts)))
    if n.dot(Vector(out)) < 0:
        pts = pts[::-1]
        if uvq:
            uvq = uvq[::-1]
    if uvq:
        lut = {tuple(round(c, 6) for c in p): uvq[i] for i, p in enumerate(pts)}
        kw['uv'] = lambda p, n: lut.get(tuple(round(c, 6) for c in p), (0, 0))
    return make(name, pts, [tuple(idx)], m, recalc=False, **kw)


def mirror_x(fn, *a, **kw):
    """call fn twice: as given (left, +x) and mirrored (right, -x) by passing side=+1/-1"""
    fn(1, *a, **kw)
    fn(-1, *a, **kw)


def deform(fn, parts=None):
    """move the vertices of the parts built so far (runtime frame): fn((x, y, z)) -> (x, y, z)"""
    for ob in (parts if parts is not None else S['parts']):
        for v in ob.data.vertices:
            v.co = BL(fn(RT(v.co)))
        ob.data.update()


def finish_lod(name, parent):
    dg = bpy.context.evaluated_depsgraph_get()
    objs = list(S['parts'])
    for ob in objs:
        if len(ob.modifiers):
            ev = ob.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
            ob.modifiers.clear()
            ob.data = me
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs,
                                   object=objs[0]):
        bpy.ops.object.join()
    J = objs[0]
    J.name = name
    J.data.name = name
    J.parent = parent
    S['parts'] = []
    return J


def tris_of(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)
