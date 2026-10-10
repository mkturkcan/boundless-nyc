# BX-MAT (AR34 BX, 2026-10-02): the web's surface shaders rebuilt as Cycles node groups.
#
# A blender_render.py / blender_take.py hook (docs/notes/ar34-bx-seq.md: HOOKS 'blender_nodes', `after_import(ctx)`). The
# USD written with usd_write.py --bxmat carries one material per three material, tagged with customData `bx` (usd_mat.py:
# the family, the web shader's uniforms, the texture files) and the per-vertex data as primvars (aFkTr, aWeather, aGrime,
# bxCol, matId, gpK, aRv, aJ). This module swaps the importer's UsdPreviewSurface translation of every tagged material for
# a node tree that computes what the web's shader computes:
#   pbr     pbrLib.js makeSurface: the two-tap anti-tiling (pattern-snapped offsets picked by a low-frequency noise, the
#           brick sets switching along their joints), the tint ratio (x aFkTr: the kit's shared set materials), paint over a
#           chipped substrate, worn paint-over (line paint), the world-space tone drift, the weathering (splash zone, run-off
#           streaks under openings (aGrime), soot under the roof line, ledge dust, soffits, cavity dirt, soot patches; per
#           building from aWeather), the street sets' blotches and gum, the facade value curve; ORM roughness / metalness /
#           AO and the normal map in the web's frames (world mapping on walls and ground, the uv frame otherwise)
#   vk      vk/vkMats.js steelMat: rivet heads from the rivet rows each face carries (aRv, aJ), bevelled arrises, the patchy
#           repaint, rust (chipped arrises, joints, run streaks, pooled rust, halos, rust bleed under rivets, the splash
#           zone), soot, chalking, pigeon guano, corrugation; roughness, metalness and the normal perturbation
#   ground  world/materials.js GP31 / GP32: the scanned sets of the t_gpA / t_gpN arrays hex-tiled (three taps, the
#           variance-preserving blend) relative to each set's mean, the 30 m aerial scan, the block-face pour lottery
#           (tone, young / weathered scan, cold joints), the kerb frame (gpK: lanes, tyre tracks, dust at the kerb), the
#           crack net, thermoplastic paint per bar (age, tone, rubber, wear off the scan's chip tops, worn edges), the
#           sidewalk's flags (per-flag pour, scan offset, tooled joints), the granite kerb face; LB14 calibration
#   plain   a kit or prop material whose colour the web multiplies per vertex (aFkTr, vertex colour)
#   decal   decals.js's atlas (graffiti tags, wheat-paste posters, grime runs): alpha-blended (the importer's 0.012 clip drew
#           the 10-56 % grime as opaque cards), paper / paint response
# Values: the node trees end at the web's NET diffuse albedo (what three's lighting multiplies): the facade value curve
# pow(alb, 1.22) x 0.88 for the wall sets, alb x mix(0.30, 0.88, night) x the material's trim for everything that goes
# through applyLightTrim (the street sets x 1.94 / 1.70 / 1.47, the ground with its LB14 calibration). The page's sun and
# sky intensities then give the web's values in Cycles. `--bxtrim phys` drops the trims (physical albedos; LIGHT's call).
# Noise: the web's value noise (hashed lattice, smoothstep fade; Blender's White Noise as the hash), so the thresholds
# the weathering is tuned with cover what they cover in the web. Pixel-footprint fades (fwidth) are left to the path
# tracer's pixel filter, except where the web changes the look with distance (the ground's macro scan and chip contrast:
# the footprint from the camera distance and the lens).
import bpy, json, math, os, re, time

# ----------------------------------------------------------------------------------------------------------------------
# expression builder: arithmetic on sockets emits Math / Vector Math nodes, constants fold
# ----------------------------------------------------------------------------------------------------------------------
CUR = []     # the builders of the open sub-groups (innermost last): new nodes go to the innermost


class B:
    def __init__(self, nt, sub=None):
        self.nt = nt
        self.n = 0
        self.cache = {}
        self.sub = sub      # a Sub when this builder fills a sub-group

    def imp(self, v):
        """a value of an enclosing tree used in this one: a group input of the sub-group (Blender trees cannot link
        across groups)"""
        if v.b is self or self.sub is None:
            return v
        return self.sub.imp(v)

    def node(self, typ, **props):
        nd = self.nt.nodes.new(typ)
        nd.location = ((self.n // 60) * 260, -(self.n % 60) * 140)
        self.n += 1
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def link(self, sock, v):
        if isinstance(v, X):
            if v.b is not self and isinstance(v.s, bpy.types.NodeSocket):
                v = self.imp(v)
            v = v.s
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
            return
        if v is None:
            return
        if sock.type == 'RGBA':
            v = tuple(v) if isinstance(v, (tuple, list)) else (v, v, v)
            sock.default_value = tuple(v[:3]) + ((v[3],) if len(v) > 3 else (1.0,))
        elif sock.type == 'VECTOR':
            v = tuple(v) if isinstance(v, (tuple, list)) else (v, v, v)
            sock.default_value = (tuple(v) + (0.0, 0.0, 0.0))[:3]
        else:
            sock.default_value = float(v) if not isinstance(v, (tuple, list)) else float(v[0])

    def c(self, v):
        if isinstance(v, X):
            return v
        if isinstance(v, (tuple, list)):
            return X(self, (tuple(float(a) for a in v) + (0.0, 0.0, 0.0))[:3], True)
        return X(self, float(v), False)

    def sock(self, s, vec=None):
        if vec is None:
            vec = s.type in ('VECTOR', 'RGBA')
        return X(self, s, vec)

    # ---- float ops
    def m(self, op, a, b=None, c=None):
        a, b = self.c(a), (self.c(b) if b is not None else None)
        c = self.c(c) if c is not None else None
        nd = self.node('ShaderNodeMath', operation=op)
        self.link(nd.inputs[0], a)
        if b is not None:
            self.link(nd.inputs[1], b)
        if c is not None:
            self.link(nd.inputs[2], c)
        return X(self, nd.outputs[0], False)

    def vm(self, op, a, b=None, sc=None, out='Vector'):
        nd = self.node('ShaderNodeVectorMath', operation=op)
        self.link(nd.inputs[0], self.vec(a))
        if b is not None:
            self.link(nd.inputs[1], self.vec(b))
        if sc is not None:
            self.link(nd.inputs[3], self.c(sc))
        return X(self, nd.outputs[out], out == 'Vector')

    def vec(self, a):
        a = self.c(a)
        if a.v:
            return a
        if isinstance(a.s, float):
            return X(self, (a.s, a.s, a.s), True)
        return self.v3(a, a, a)

    def v3(self, x, y, z=0.0):
        x, y, z = self.c(x), self.c(y), self.c(z)
        if all(isinstance(t.s, float) for t in (x, y, z)):
            return X(self, (x.s, y.s, z.s), True)
        nd = self.node('ShaderNodeCombineXYZ')
        self.link(nd.inputs[0], x)
        self.link(nd.inputs[1], y)
        self.link(nd.inputs[2], z)
        return X(self, nd.outputs[0], True)

    def split(self, a):
        a = self.c(a)
        if isinstance(a.s, tuple):
            return tuple(X(self, float(t), False) for t in a.s)
        if a.b is not self:
            a = self.imp(a)
        # (keyed by the socket wrapper's id, so the entry keeps the wrapper alive: bpy hands out a new wrapper per access,
        # and a freed one's id is reused by the next, which once returned the Position's split for a colour attribute)
        key = ('sep', id(a.s))
        hit = self.cache.get(key)
        if hit is None or hit[0] is not a.s:
            nd = self.node('ShaderNodeSeparateXYZ')
            self.link(nd.inputs[0], a)
            hit = (a.s, (X(self, nd.outputs[0], False), X(self, nd.outputs[1], False), X(self, nd.outputs[2], False)))
            self.cache[key] = hit
        return hit[1]

    # ---- helpers mirroring GLSL
    def smoothstep(self, e0, e1, x):
        e0, e1, x = self.c(e0), self.c(e1), self.c(x)
        if all(isinstance(t.s, float) for t in (e0, e1, x)):
            t = min(1.0, max(0.0, (x.s - e0.s) / (e1.s - e0.s))) if e1.s != e0.s else 0.0
            return self.c(t * t * (3 - 2 * t))
        nd = self.node('ShaderNodeMapRange', data_type='FLOAT', interpolation_type='SMOOTHSTEP', clamp=True)
        self.link(nd.inputs[0], x)
        self.link(nd.inputs[1], e0)
        self.link(nd.inputs[2], e1)
        nd.inputs[3].default_value = 0.0
        nd.inputs[4].default_value = 1.0
        return X(self, nd.outputs[0], False)

    def mix(self, a, b, t):
        a, b, t = self.c(a), self.c(b), self.c(t)
        if isinstance(t.s, float):
            if t.s == 0.0:
                return a
            if t.s == 1.0:
                return b
        if a.v or b.v:
            nd = self.node('ShaderNodeMix', data_type='VECTOR', clamp_factor=False)
            if t.v:
                nd.factor_mode = 'NON_UNIFORM'
                self.link(next(s for s in nd.inputs if s.identifier == 'Factor_Vector'), t)
            else:
                self.link(next(s for s in nd.inputs if s.identifier == 'Factor_Float'), t)
            self.link(next(s for s in nd.inputs if s.identifier == 'A_Vector'), self.vec(a))
            self.link(next(s for s in nd.inputs if s.identifier == 'B_Vector'), self.vec(b))
            return X(self, next(s for s in nd.outputs if s.identifier == 'Result_Vector'), True)
        if isinstance(a.s, float) and isinstance(b.s, float) and isinstance(t.s, float):
            return self.c(a.s + (b.s - a.s) * t.s)
        nd = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=False)
        self.link(next(s for s in nd.inputs if s.identifier == 'Factor_Float'), t)
        self.link(next(s for s in nd.inputs if s.identifier == 'A_Float'), a)
        self.link(next(s for s in nd.inputs if s.identifier == 'B_Float'), b)
        return X(self, next(s for s in nd.outputs if s.identifier == 'Result_Float'), False)

    def clamp(self, x, lo, hi):
        x = self.c(x)
        if x.v:
            return self.vm('MINIMUM', self.vm('MAXIMUM', x, self.vec(lo)), self.vec(hi))
        if isinstance(x.s, float):
            return self.c(min(max(x.s, float(lo)), float(hi)))
        nd = self.node('ShaderNodeClamp', clamp_type='MINMAX')
        self.link(nd.inputs[0], x)
        self.link(nd.inputs[1], self.c(lo))
        self.link(nd.inputs[2], self.c(hi))
        return X(self, nd.outputs[0], False)

    def step(self, edge, x):     # GLSL step: x >= edge
        return 1.0 - self.lt(x, edge)

    def lt(self, a, b):          # a < b
        a, b = self.c(a), self.c(b)
        if isinstance(a.s, float) and isinstance(b.s, float):
            return self.c(1.0 if a.s < b.s else 0.0)
        return self.m('LESS_THAN', a, b)

    def gt(self, a, b):
        return self.lt(b, a)

    def sel(self, cond, a, b):   # cond ? a : b (cond 0 / 1)
        return self.mix(b, a, cond)

    def floor(self, a):
        a = self.c(a)
        return self.vm('FLOOR', a) if a.v else (self.c(math.floor(a.s)) if isinstance(a.s, float) else self.m('FLOOR', a))

    def fract(self, a):
        a = self.c(a)
        return self.vm('FRACTION', a) if a.v else (self.c(a.s - math.floor(a.s)) if isinstance(a.s, float) else self.m('FRACT', a))

    def abs(self, a):
        a = self.c(a)
        return self.vm('ABSOLUTE', a) if a.v else (self.c(abs(a.s)) if isinstance(a.s, float) else self.m('ABSOLUTE', a))

    def min(self, a, b):
        a, b = self.c(a), self.c(b)
        if a.v or b.v:
            return self.vm('MINIMUM', a, b)
        if isinstance(a.s, float) and isinstance(b.s, float):
            return self.c(min(a.s, b.s))
        return self.m('MINIMUM', a, b)

    def max(self, a, b):
        a, b = self.c(a), self.c(b)
        if a.v or b.v:
            return self.vm('MAXIMUM', a, b)
        if isinstance(a.s, float) and isinstance(b.s, float):
            return self.c(max(a.s, b.s))
        return self.m('MAXIMUM', a, b)

    def sqrt(self, a):
        return self.m('SQRT', self.max(a, 0.0))

    def pow(self, a, e):
        a = self.c(a)
        if a.v:
            x, y, z = self.split(a)
            return self.v3(self.m('POWER', x, e), self.m('POWER', y, e), self.m('POWER', z, e))
        return self.m('POWER', a, e)

    def sin(self, a):
        return self.m('SINE', a)

    def cos(self, a):
        return self.m('COSINE', a)

    def dot(self, a, b):
        return self.vm('DOT_PRODUCT', a, b, out='Value')

    def length(self, a):
        return self.vm('LENGTH', a, out='Value')

    def normalize(self, a):
        return self.vm('NORMALIZE', a)

    def cross(self, a, b):
        return self.vm('CROSS_PRODUCT', a, b)

    def lum(self, c):
        return self.dot(c, (0.2126, 0.7152, 0.0722))

    # ---- inputs
    def attr(self, name):
        key = ('attr', name)
        if key not in self.cache:
            nd = self.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name=name)
            self.cache[key] = nd
        return self.cache[key]

    def geo(self):
        if 'geo' not in self.cache:
            self.cache['geo'] = self.node('ShaderNodeNewGeometry')
        return self.cache['geo']

    def uv(self, name='st'):
        key = ('uv', name)
        if key not in self.cache:
            nd = self.node('ShaderNodeUVMap')
            nd.uv_map = name
            self.cache[key] = X(self, nd.outputs['UV'], True)
        return self.cache[key]

    def group(self, ng, ins, outs=None):
        nd = self.node('ShaderNodeGroup')
        nd.node_tree = ng
        for k, v in ins.items():
            self.link(nd.inputs[k], v)
        if outs is None:
            return {s.name: X(self, s, s.type in ('VECTOR', 'RGBA')) for s in nd.outputs}
        return nd

    def white2(self, v):
        """hash of a 2D lattice point (x, y): one White Noise node (value, and a colour of three more)"""
        nd = self.node('ShaderNodeTexWhiteNoise', noise_dimensions='2D')
        self.link(nd.inputs['Vector'], self.vec(v))
        return X(self, nd.outputs['Value'], False), X(self, nd.outputs['Color'], True)

    def white3(self, v):
        nd = self.node('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
        self.link(nd.inputs['Vector'], self.vec(v))
        return X(self, nd.outputs['Value'], False), X(self, nd.outputs['Color'], True)

    def h2(self, v):             # GLSL hash12 / pbH12: one value per lattice point
        return self.white2(v)[0]

    def h22(self, v):            # pbH22 / gpH2: two values per lattice point (x, y; z = 0)
        c = self.white2(v)[1]
        x, y, _ = self.split(c)
        return self.v3(x, y, 0.0)

    # The web's noises are value noise (a hashed lattice with a smoothstep fade). Built from hashed corners in nodes they
    # overflowed Cycles' SVM stack (255 slots: "out of SVM stack space, shader too big", the shader then renders black),
    # so each is Blender's Noise Texture (Perlin, the same octaves, lacunarity and weights) stretched about 0.5 to the
    # value noise's spread, measured: std 0.214 (2D) against Perlin's 0.160, the 5 / 95 % points 0.149 / 0.853 against
    # the stretched 0.144 / 0.857; the fbms 0.137 / 0.143 against 0.105 / 0.110 (BX-MAT notes).
    def _noise(self, p, dims, detail, rough, lac, k):
        nd = self.node('ShaderNodeTexNoise', noise_dimensions=dims)
        self.link(nd.inputs['Vector'], self.vec(p))
        nd.inputs['Scale'].default_value = 1.0
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Lacunarity'].default_value = lac
        nd.inputs['Distortion'].default_value = 0.0
        f = X(self, nd.outputs['Fac'], False)
        return self.m('MULTIPLY_ADD', f, k, 0.5 - 0.5 * k)

    def vnoise(self, p):         # GLSL vnoise / pbN (2D value noise)
        return self._noise(p, '2D', 0.0, 0.5, 2.0, 1.342)

    def vnoise3(self, p):        # vkN3 (3D value noise)
        return self._noise(p, '3D', 0.0, 0.5, 2.0, 1.32)

    def fbmG(self, p):           # world/materials.js fbm: 0.6 / 0.25 / 0.15 at 1 / 2.7 / 7.1
        return self._noise(p, '2D', 2.0, 0.42, 2.7, 1.301)

    def pbF(self, p):            # pbrLib pbF: 0.55 / 0.28 / 0.17 at 1 / 2.03 / 4.11
        return self._noise(p, '2D', 2.0, 0.5, 2.03, 1.311)

    def image(self, path, vec, srgb=True, interp='Linear'):
        img = load_image(path, srgb)
        nd = self.node('ShaderNodeTexImage', interpolation=interp, extension='REPEAT')
        nd.image = img
        self.link(nd.inputs['Vector'], self.vec(vec))
        return X(self, nd.outputs['Color'], True), X(self, nd.outputs['Alpha'], False)


class X:
    __slots__ = ('b', 's', 'v')

    def __init__(self, b, s, v):
        self.b, self.s, self.v = b, s, v

    def _op(self, o, fop, vop, rev=False):
        b = CUR[-1] if CUR else self.b
        a, c = (b.c(o), self) if rev else (self, b.c(o))
        if isinstance(a.s, float) and isinstance(c.s, float):
            return b.c(fop(a.s, c.s))
        if isinstance(a.s, tuple) and isinstance(c.s, (tuple, float)) and not isinstance(c.s, bpy.types.NodeSocket):
            cc = c.s if isinstance(c.s, tuple) else (c.s, c.s, c.s)
            return b.c(tuple(fop(p, q) for p, q in zip(a.s, cc)))
        if isinstance(c.s, tuple) and isinstance(a.s, float):
            return b.c(tuple(fop(a.s, q) for q in c.s))
        if a.v or c.v:
            if vop == 'MULTIPLY' and (not a.v or not c.v):
                vv, ff = (a, c) if a.v else (c, a)
                return b.vm('SCALE', vv, sc=ff)
            return b.vm(vop, b.vec(a), b.vec(c))
        return b.m(vop, a, c)

    def __add__(self, o):
        if not isinstance(o, X) and not isinstance(o, (tuple, list)) and float(o) == 0.0:
            return self
        return self._op(o, lambda p, q: p + q, 'ADD')

    def __radd__(self, o):
        return self.__add__(o)

    def __sub__(self, o):
        if not isinstance(o, X) and not isinstance(o, (tuple, list)) and float(o) == 0.0:
            return self
        return self._op(o, lambda p, q: p - q, 'SUBTRACT')

    def __rsub__(self, o):
        return self._op(o, lambda p, q: p - q, 'SUBTRACT', rev=True)

    def __mul__(self, o):
        if not isinstance(o, X) and not isinstance(o, (tuple, list)):
            if float(o) == 1.0:
                return self
        return self._op(o, lambda p, q: p * q, 'MULTIPLY')

    def __rmul__(self, o):
        return self.__mul__(o)

    def __truediv__(self, o):
        if not isinstance(o, X) and not isinstance(o, (tuple, list)):
            return self.__mul__(1.0 / float(o))
        return self._op(o, lambda p, q: p / q if q else 0.0, 'DIVIDE')

    def __rtruediv__(self, o):
        return self._op(o, lambda p, q: p / q if q else 0.0, 'DIVIDE', rev=True)

    def __neg__(self):
        return self.__mul__(-1.0)

    @property
    def x(self):
        return (CUR[-1] if CUR else self.b).split(self)[0]

    @property
    def y(self):
        return (CUR[-1] if CUR else self.b).split(self)[1]

    @property
    def z(self):
        return (CUR[-1] if CUR else self.b).split(self)[2]


class Sub:
    """a section of a large tree built as its own node group (Blender's node creation is quadratic in the tree's size:
    250 nodes 0.25 s, 1,000 nodes 3.2 s, 2,000 nodes 15.6 s). `with Sub(b, name) as sb:` then build with sb; values of
    the enclosing tree become group inputs; sb.out(name, value) declares an output; after the block, sub.o[name] is the
    output in the enclosing tree."""
    _n = 0

    def __init__(self, parent, name):
        Sub._n += 1
        self.parent = parent
        self.ng = bpy.data.node_groups.new(f'{name}_{Sub._n}', 'ShaderNodeTree')
        self.b = B(self.ng, sub=self)
        self.imports = {}
        self.outs = []
        self.o = {}

    def __enter__(self):
        CUR.append(self.b)
        return self.b

    def imp(self, v):
        if v.b is not self.parent:
            v = self.parent.imp(v)   # from further out: through the enclosing sub-group first
        key = id(v.s)
        if key in self.imports:
            return self.imports[key][2]
        name = 'i%d' % len(self.imports)
        self.ng.interface.new_socket(name, in_out='INPUT', socket_type='NodeSocketVector' if v.v else 'NodeSocketFloat')
        sk = self.ng.interface.items_tree[name]
        if not v.v:
            sk.min_value, sk.max_value = -1e9, 1e9
        gi = self.b.node('NodeGroupInput')
        x = X(self.b, gi.outputs[name], v.v)
        self.imports[key] = (v, name, x)
        return x

    def out(self, name, v):
        self.outs.append((name, self.b.c(v)))

    def __exit__(self, *exc):
        CUR.pop()
        if exc[0] is not None:
            return False
        for name, v in self.outs:
            self.ng.interface.new_socket(name, in_out='OUTPUT', socket_type='NodeSocketVector' if v.v else 'NodeSocketFloat')
        go = self.b.node('NodeGroupOutput')
        for name, v in self.outs:
            self.b.link(go.inputs[name], v)
        pb = self.parent
        nd = pb.node('ShaderNodeGroup')
        nd.node_tree = self.ng
        for key, (v, name, x) in self.imports.items():
            pb.link(nd.inputs[name], v)
        for name, v in self.outs:
            self.o[name] = X(pb, nd.outputs[name], v.v)
        return False


# ----------------------------------------------------------------------------------------------------------------------
# library groups (built once per .blend)
# ----------------------------------------------------------------------------------------------------------------------
def new_group(name, ins, outs):
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        return ng, None
    ng = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    T = {'F': 'NodeSocketFloat', 'V': 'NodeSocketVector', 'C': 'NodeSocketColor'}
    for n, t, *dv in ins:
        s = ng.interface.new_socket(n, in_out='INPUT', socket_type=T[t])
        if dv:
            try:
                s.default_value = dv[0]
            except Exception:
                pass
        if t == 'F':
            s.min_value, s.max_value = -1e9, 1e9
    for n, t in outs:
        ng.interface.new_socket(n, in_out='OUTPUT', socket_type=T[t])
    b = B(ng)
    gi = b.node('NodeGroupInput')
    go = b.node('NodeGroupOutput')
    I = {s.name: X(b, s, s.type in ('VECTOR', 'RGBA')) for s in gi.outputs if s.name}
    b.cache['out'] = go
    return ng, (b, I, go)


def set_out(b, go, name, v):
    b.link(go.inputs[name], v)


def lib_vnoise2():
    ng, bb = new_group('BX_VNoise2', [('Vector', 'V')], [('Value', 'F')])
    if bb:
        b, I, go = bb
        p = I['Vector']
        i = b.floor(p)
        f = b.fract(p)
        fx, fy, _ = b.split(f)
        ux = fx * fx * (3.0 - 2.0 * fx)
        uy = fy * fy * (3.0 - 2.0 * fy)
        ix, iy, _ = b.split(i)
        a = b.h2(b.v3(ix, iy))
        bq = b.h2(b.v3(ix + 1.0, iy))
        c = b.h2(b.v3(ix, iy + 1.0))
        d = b.h2(b.v3(ix + 1.0, iy + 1.0))
        set_out(b, go, 'Value', b.mix(b.mix(a, bq, ux), b.mix(c, d, ux), uy))
    return ng


def lib_vnoise3():
    ng, bb = new_group('BX_VNoise3', [('Vector', 'V')], [('Value', 'F')])
    if bb:
        b, I, go = bb
        p = I['Vector']
        i = b.floor(p)
        f = b.fract(p)
        fx, fy, fz = b.split(f)
        u = [t * t * (3.0 - 2.0 * t) for t in (fx, fy, fz)]
        ix, iy, iz = b.split(i)
        H = {}
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    H[(dx, dy, dz)] = b.white3(b.v3(ix + float(dx), iy + float(dy), iz + float(dz)))[0]
        x00 = b.mix(H[(0, 0, 0)], H[(1, 0, 0)], u[0]); x10 = b.mix(H[(0, 1, 0)], H[(1, 1, 0)], u[0])
        x01 = b.mix(H[(0, 0, 1)], H[(1, 0, 1)], u[0]); x11 = b.mix(H[(0, 1, 1)], H[(1, 1, 1)], u[0])
        set_out(b, go, 'Value', b.mix(b.mix(x00, x10, u[1]), b.mix(x01, x11, u[1]), u[2]))
    return ng


def lib_fbm(name, octs):
    ng, bb = new_group(name, [('Vector', 'V')], [('Value', 'F')])
    if bb:
        b, I, go = bb
        p = I['Vector']
        acc = None
        for sc, off, w in octs:
            v = b.vnoise(p * sc + (off, off, 0.0) if off else p * sc) * w
            acc = v if acc is None else acc + v
        set_out(b, go, 'Value', acc)
    return ng


_IMG = {}


def load_image(path, srgb=True):
    key = (path, srgb)
    if key in _IMG:
        return _IMG[key]
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.alpha_mode = 'CHANNEL_PACKED'
    _IMG[key] = img
    return img


# ----------------------------------------------------------------------------------------------------------------------
# the shared frame: the web's world (three.js: x east, y up, z south; the root's recentring undone) from Blender's
# ----------------------------------------------------------------------------------------------------------------------
ORIGIN = [0.0, 0.0, 0.0]


def frame3(b):
    """(P3, N3, Ng3): the position, the shading normal and the geometric normal in the web's world frame."""
    if 'frame3' in b.cache:
        return b.cache['frame3']
    g = b.geo()
    P = b.sock(g.outputs['Position'])
    N = b.sock(g.outputs['Normal'])
    Ng = b.sock(g.outputs['True Normal'])
    px, py, pz = b.split(P)
    nx, ny, nz = b.split(N)
    gx, gy, gz = b.split(Ng)
    P3 = b.v3(px + ORIGIN[0], pz, ORIGIN[2] - py)
    N3 = b.v3(nx, nz, -ny)
    G3 = b.v3(gx, gz, -gy)
    b.cache['frame3'] = (P3, N3, G3)
    return b.cache['frame3']


def to_blender(b, v3):
    """a direction in the web's frame -> Blender's world frame."""
    x, y, z = b.split(v3)
    return b.v3(x, -z, y)


def bsdf_out(b, mat, albedo, rough, metal=0.0, normal=None, spec=0.5, alpha=None, emission=None, nt=None):
    """a Principled BSDF fed by the computed values, and the material output."""
    dbg = os.environ.get('BXDBG', '')
    if dbg in ('albedo', 'rough', 'normal'):
        # inspection: the computed albedo / roughness / normal as an unlit colour
        em = b.node('ShaderNodeEmission')
        v = albedo if dbg == 'albedo' else (b.vec(rough) if dbg == 'rough' else (normal * 0.5 + 0.5 if normal is not None else b.c((0.5, 0.5, 1.0))))
        b.link(em.inputs['Color'], v)
        out = b.node('ShaderNodeOutputMaterial', target='ALL')
        b.nt.links.new(em.outputs[0], out.inputs['Surface'])
        return em
    if dbg == 'nonormal':
        normal = None
    bs = b.node('ShaderNodeBsdfPrincipled')
    b.link(bs.inputs['Base Color'], b.clamp(albedo, 0.0, 1.0))
    b.link(bs.inputs['Roughness'], b.clamp(rough, 0.0, 1.0))
    b.link(bs.inputs['Metallic'], metal)
    b.link(bs.inputs['Specular IOR Level'], spec)
    if normal is not None:
        b.link(bs.inputs['Normal'], normal)
    out = b.node('ShaderNodeOutputMaterial', target='ALL')
    last = bs.outputs['BSDF']
    if alpha is not None:
        tp = b.node('ShaderNodeBsdfTransparent')
        mx = b.node('ShaderNodeMixShader')
        b.link(mx.inputs[0], b.clamp(alpha, 0.0, 1.0))
        b.nt.links.new(tp.outputs[0], mx.inputs[1])
        b.nt.links.new(bs.outputs['BSDF'], mx.inputs[2])
        last = mx.outputs[0]
    if emission is not None:
        b.link(bs.inputs['Emission Color'], emission[0])
        b.link(bs.inputs['Emission Strength'], emission[1])
    b.nt.links.new(last, out.inputs['Surface'])
    return bs


# ----------------------------------------------------------------------------------------------------------------------
# vk: the viaducts' painted riveted steel (vk/vkMats.js), one group with the uniforms as inputs
# ----------------------------------------------------------------------------------------------------------------------
VK_INS = [('vkPaint', 'V', (0.27, 0.39, 0.36)), ('vkPaint2', 'V', (0.27, 0.39, 0.36)), ('vkRustC', 'V', (0.25, 0.07, 0.02)),
          ('vkRustD', 'V', (0.07, 0.02, 0.01)), ('vkRustAmt', 'F', 0.6), ('vkGround', 'F', 3.38), ('vkSeed', 'F', 0.0),
          ('vkRivOn', 'F', 1.0), ('vkBandY', 'F', -1e4), ('vkBandC', 'V', (0.0, 0.0, 0.0)), ('vkBandR2', 'F', 0.0),
          ('vkGuanoAmt', 'F', 0.55), ('vkChalk', 'F', 0.0), ('vkCorr', 'F', 0.0), ('vkGrime', 'F', 0.0),
          ('rough0', 'F', 0.62), ('metal0', 'F', 0.08), ('trim', 'F', 0.329)]


def uv_frame(b, uv='st'):
    """(T, B): the world directions of growing u and v on the 'st' uv, from two Normal Map nodes (MikkTSpace, with its
    handedness sign: cross(N, T) mirrored the rust bleed on faces whose uv is left-handed)."""
    key = ('uvframe', uv)
    if key in b.cache:
        return b.cache[key]
    out = []
    for col in ((1.0, 0.5, 0.5, 1.0), (0.5, 1.0, 0.5, 1.0)):
        nm = b.node('ShaderNodeNormalMap', space='TANGENT')
        nm.uv_map = uv
        nm.inputs['Color'].default_value = col
        out.append(b.sock(nm.outputs['Normal']))
    b.cache[key] = tuple(out)
    return b.cache[key]


def lib_vk():
    ng, bb = new_group('BX_VkSteel', VK_INS, [('Albedo', 'V'), ('Roughness', 'F'), ('Metallic', 'F'), ('TangentNormal', 'V'), ('Dbg', 'V')])
    if not bb:
        return ng
    b, I, go = bb
    P3, N3, _ = frame3(b)
    uv = b.uv('st')
    ux, uy, _ = b.split(uv)
    rva = b.attr('aRv')
    rvc = b.sock(rva.outputs['Color'])
    W, e, cc = b.split(rvc)
    p = b.sock(rva.outputs['Alpha'], False)
    aj = b.sock(b.attr('aJ').outputs['Vector'])
    L, jy, _ = b.split(aj)
    # vkRivet: the nearest rivet on this face
    has = b.gt(b.abs(p), 1e-4)
    pp = b.sel(has, p, 1.0)
    ua_pos = (b.floor(ux / pp) + 0.5) * pp
    ua_neg = b.sel(b.lt(ux, L * 0.5), -pp, L + pp)
    ua = b.sel(b.gt(p, 0.0), ua_pos, ua_neg)
    g = -cc
    gg = b.sel(b.lt(cc, 0.0), g, 1.0)
    nMax = b.max(b.floor((W - e * 2.0) / gg + 1e-3), 0.0)
    va_rows = e + b.clamp(b.floor((uy - e) / gg + 0.5), 0.0, 1e6) * gg
    va_rows = b.min(va_rows, e + nMax * gg)
    a1, b1 = e, W - e
    va_e = b.sel(b.lt(b.abs(uy - a1), b.abs(uy - b1)), a1, b1)
    best_e = b.abs(uy - va_e)
    va0 = b.sel(b.gt(e, 0.0), va_e, W * 0.5)
    best = b.sel(b.gt(e, 0.0), best_e, 1e3)
    a2, b2 = W * 0.5 - cc, W * 0.5 + cc
    vb = b.sel(b.lt(b.abs(uy - a2), b.abs(uy - b2)), a2, b2)
    va_c = b.sel(b.gt(cc, 0.0) * b.lt(b.abs(uy - vb), best), vb, va0)
    va = b.sel(b.lt(cc, 0.0), va_rows, va_c)
    rx = ux - ua
    ry = uy - va
    rz = has
    Rr = 0.018
    P3x, P3y, P3z = b.split(P3)
    # instanced heads in the band zone (vkBand): none drawn there
    bdx = P3x - b.split(I['vkBandC'])[0]
    bdz = P3z - b.split(I['vkBandC'])[1]
    inBand = b.step(P3y, I['vkBandY']) * b.step(bdx * bdx + bdz * bdz, I['vkBandR2'])
    AA = rz * I['vkRivOn'] * (1.0 - inBand)
    D = b.length(b.v3(rx, ry)) / Rr
    vIn = (1.0 - b.smoothstep(0.86, 1.0, D)) * AA
    ring = b.smoothstep(0.75, 1.0, D) * (1.0 - b.smoothstep(1.0, 1.9, D)) * AA
    halo = (1.0 - b.smoothstep(1.0, 3.2, D)) * rz
    up = b.split(b.normalize(N3))[1]
    seed = I['vkSeed']
    vkP = P3 + b.v3(seed * 17.3, 0.0, seed * 5.1) + b.vec(jy * 0.37)
    blot = b.vnoise3(vkP * 0.33)
    blot2 = b.vnoise3(vkP * 0.9 + (7.0, 7.0, 7.0))
    fine = b.vnoise3(vkP * 4.3)
    mic = b.vnoise3(vkP * 21.0)
    qx, qy, qz = b.split(vkP)
    streak = b.vnoise3(b.v3(qx * 7.0, qy * 0.28, qz * 7.0))
    streak2 = b.vnoise3(b.v3(qx * 23.0, qy * 0.9, qz * 23.0))
    vert = 1.0 - b.smoothstep(0.3, 0.7, b.abs(up))
    edgeV = b.min(uy, W - uy)
    edgeU = b.min(ux, L - ux)
    edge = b.min(edgeV, edgeU)
    chip = (1.0 - b.smoothstep(0.0, 0.016, edge)) * b.smoothstep(0.5, 0.78, fine * 0.6 + mic * 0.4)
    joint = (1.0 - b.smoothstep(0.03, 0.4, edgeU)) * b.smoothstep(0.5, 0.8, blot2 * 0.55 + fine * 0.45)
    sk_ = streak * 0.7 + streak2 * 0.3
    run = vert * b.smoothstep(0.6, 0.86, sk_) * b.smoothstep(0.35, 0.75, blot)
    runG = run
    if VK_LOOK:
        # (look calibration, round 2: the web's run streaks cover its plates as broad dark bands of grime; in Cycles the
        # large-scale gate and the stretched Perlin left most plates clean. The wider coverage darkens only: the rust
        # keeps the literal runs, or the deck's streaks went brown)
        runG = vert * b.smoothstep(0.50, 0.80, sk_) * b.smoothstep(0.20, 0.62, blot)
    pool = b.smoothstep(0.65, 0.95, up) * b.smoothstep(0.45, 0.8, fine * 0.7 + blot * 0.3)
    # rust bleed under each rivet: the face's down direction in its uv (the uv tangent frame), a run of its own length
    T, Bt = uv_frame(b)
    down = (0.0, 0.0, -1.0)
    dux = b.dot(down, T)
    duy = b.dot(down, Bt)
    dl = b.length(b.v3(dux, duy))
    dlS = b.max(dl, 1e-6)
    dux, duy = dux / dlS, duy / dlS
    cid = b.floor(b.v3(ux - rx, uy - ry) * 97.0 + (0.5, 0.5, 0.0))
    rid = b.h2(cid + b.v3(jy, jy * 0.7))
    Ls = (0.10 + rid * rid * 0.50) if VK_LOOK else (0.06 + rid * rid * 0.32)
    S = rx * dux + ry * duy
    lat = b.abs(rx * (-duy) + ry * dux)
    Wb = Rr * (0.55 + (1.0 - S / Ls) * 0.5) * (1.3 if VK_LOOK else 1.0)
    bleed = (b.smoothstep(Rr * 0.7, Rr * 1.4, S) * (1.0 - b.smoothstep(Ls * 0.4, Ls, S)) * (1.0 - b.smoothstep(Wb * 0.5, Wb, lat))
             * b.step(0.25 if VK_LOOK else 0.42, rid) * vert * (0.6 + streak2 * 0.4) * rz * b.gt(dl, 1e-6) * b.gt(vert, 0.05))
    low = 1.0 - b.smoothstep(0.0, 1.4, P3y - I['vkGround'])
    rust = b.clamp(I['vkRustAmt'] * (chip * 1.1 + joint * 0.75 + run * 0.6 + pool * 0.55 + halo * 0.4 * b.smoothstep(0.3, 0.7, fine)
                                    + ring * 0.35 + low * b.smoothstep(0.45, 0.8, fine * 0.5 + blot2 * 0.5) * 0.8) + bleed * (1.0 if VK_LOOK else 0.75), 0.0, 1.0)
    col = b.mix(I['vkPaint'], I['vkPaint2'], b.smoothstep(0.35, 0.65, blot)) * ((0.95 + blot2 * 0.1) * (0.96 + fine * 0.08))
    rc = b.mix(I['vkRustD'], I['vkRustC'], b.smoothstep(0.2, 0.8, fine * 0.6 + mic * 0.4))
    rc = b.mix(rc, col * (0.85, 0.72, 0.62), 0.3)
    col = b.mix(col, rc, rust)
    under = b.smoothstep(0.25, 0.9, -up)
    splash = 1.0 - b.smoothstep(0.0, 2.2, P3y - I['vkGround'])
    col = col * (1.0 - under * 0.22 - splash * (0.55 + fine * 0.45) * 0.28 - ring * 0.35)
    col = col * (1.0 - (I['vkGrime'] + 0.12) * runG * (1.0 - rust) * (1.6 if VK_LOOK else 1.0))
    if VK_LOOK:
        # grime in the panel fields: a broad dirty film on upright faces, heavier towards the panels' lower parts
        pf = b.smoothstep(0.38, 0.78, blot2 * 0.6 + fine * 0.25 + streak * 0.15) * vert
        col = col * (1.0 - pf * (0.22 + I['vkGrime'] * 0.5) * (1.0 - rust))
        # and the repaint's patchiness, stronger
        col = col * (0.86 + blot2 * 0.28)
    col = b.mix(col, col * 1.45 + (0.018, 0.022, 0.02), I['vkChalk'] * b.smoothstep(0.5, 0.95, up) * (0.35 + blot2 * 0.65) * (1.0 - rust))
    guano = b.smoothstep(0.6, 0.95, up) * b.smoothstep(0.74, 0.9, b.vnoise3(vkP * 7.0) * 0.6 + mic * 0.4) * b.smoothstep(0.35, 0.7, blot2)
    guano = guano + vert * b.smoothstep(0.86, 0.97, b.vnoise3(b.v3(qx * 31.0, qy * 2.2, qz * 31.0))) * b.smoothstep(0.55, 0.85, blot) * 0.5
    col = b.mix(col, (0.72, 0.71, 0.66), b.clamp(guano, 0.0, 0.85) * I['vkGuanoAmt'])
    hasC = b.gt(I['vkCorr'], 0.0)
    cph = uy / b.max(I['vkCorr'], 1e-4) * 6.2831853 * hasC
    col = col * (1.0 - (0.5 - b.cos(cph) * 0.5) * 0.2 * hasC)
    rough = b.clamp(b.mix(I['rough0'] * (0.9 + fine * 0.25), 0.88, rust) + splash * 0.12 + under * 0.08, 0.25, 1.0)
    metal = b.mix(I['metal0'], 0.0, rust)
    # the tangent-space normal: rivet domes, 6 mm bevels on every arris, corrugation, orange peel over pitted steel
    gxr, gyr = rx / Rr, ry / Rr
    q = b.max(1.0 - (gxr * gxr + gyr * gyr), 0.06)
    k = 0.55 / b.sqrt(q) * vIn
    bw = 0.006
    tnx = gxr * k + ((1.0 - b.smoothstep(0.0, bw, ux)) * -0.9 + (1.0 - b.smoothstep(0.0, bw, L - ux)) * 0.9)
    tny = gyr * k + ((1.0 - b.smoothstep(0.0, bw, uy)) * -0.9 + (1.0 - b.smoothstep(0.0, bw, W - uy)) * 0.9) - b.sin(cph) * 0.75 * hasC
    pk = 0.05 + rust * 0.35
    tnx = tnx + (b.vnoise3(vkP * 60.0) - 0.5) * pk
    tny = tny + (b.vnoise3(vkP * 60.0 + (3.7, 3.7, 3.7)) - 0.5) * pk
    set_out(b, go, 'Albedo', col * I['trim'])
    dk = os.environ.get('BXVKDBG')
    if dk:
        # inspection: an intermediate (BXVKDBG=name, with BXDBG=albedo in build_vk)
        v = locals().get(dk)
        set_out(b, go, 'Dbg', v if (isinstance(v, X) and v.v) else b.vec(v))
    set_out(b, go, 'Roughness', rough)
    set_out(b, go, 'Metallic', metal)
    set_out(b, go, 'TangentNormal', b.v3(tnx, tny, 1.0))
    return ng


def build_vk(mat, P):
    nt = mat.node_tree
    nt.nodes.clear()
    b = B(nt)
    ins = {}
    for k in ('vkPaint', 'vkPaint2', 'vkRustC', 'vkRustD'):
        ins[k] = tuple(P.get(k) or (0.3, 0.3, 0.3))
    for k in ('vkRustAmt', 'vkGround', 'vkSeed', 'vkRivOn', 'vkGuanoAmt', 'vkChalk', 'vkCorr', 'vkGrime'):
        if k in P:
            ins[k] = float(P[k])
    band = P.get('vkBand') or [-1e4, 0, 0, 0]
    ins['vkBandY'] = float(band[0])
    ins['vkBandC'] = (float(band[1]), float(band[2]), 0.0)
    ins['vkBandR2'] = float(band[3])
    ins['rough0'] = float(P.get('rough', 0.62))
    ins['metal0'] = float(P.get('metal', 0.08))
    ins['trim'] = trim_of(P)
    o = b.group(lib_vk(), ins)
    # the tangent-space normal through Blender's normal map node (MikkTSpace on the 'st' uv: T = dP/du, B = dP/dv, as the
    # web's vkTBN from the screen derivatives of the same uv)
    nm = b.node('ShaderNodeNormalMap', space='TANGENT')
    nm.uv_map = 'st'
    b.link(nm.inputs['Color'], o['TangentNormal'] * 0.5 + 0.5)
    # the web's specular balance (vkSpecK, x 1.6 by day under ST34): the dielectric F0 scaled
    spk = float(P.get('vkSpecK', 0.45)) * (1.6 + (1.0 - 1.6) * float(P.get('night', 0.05)))
    vo = os.environ.get('BXVKOUT', 'all')
    if os.environ.get('BXVKDBG'):
        bsdf_out(b, mat, o['Dbg'], 0.6, 0.0, None)
        return True
    if vo == 'albedo':
        bsdf_out(b, mat, o['Albedo'], 0.6, 0.0, None, spec=min(1.0, 0.5 * spk))
        return True
    if vo == 'nonormal':
        bsdf_out(b, mat, o['Albedo'], o['Roughness'], o['Metallic'], None, spec=min(1.0, 0.5 * spk))
        return True
    bsdf_out(b, mat, o['Albedo'], o['Roughness'], o['Metallic'], b.sock(nm.outputs['Normal']), spec=min(1.0, 0.5 * spk))
    return True


TRIM_MODE = 'web'
# round 2 look calibration of the viaduct weathering (the streaks, bleed, panel grime at the web's visible strength);
# BXVKLOOK=0: the literal port of vkMats.js
VK_LOOK = os.environ.get('BXVKLOOK', '1') != '0'
# round 2: the asphalt's grain at street distances carried in the albedo (0: the literal port)
GRAIN_K = float(os.environ.get('BXGRAIN', '1'))
# BX-FIN: the tar snakes' strength (round 2's sealant runs: meandering dark arcs the web does not draw; default 0 = off,
# BXSEAL=1 brings them back) and the scanned asphalt's contrast faded with the pixel footprint (default 1: the scan's
# ratio, height and AO fade out between 4 mm and 3 cm a pixel, where the web's mips have averaged them and the hex cells
# read as 0.5-1 m blotches; BXSCANF=0 = the literal port). t7ArchTrack f000 border tests, 2026-10-03 14:53.
SEAL_K = float(os.environ.get('BXSEAL', '0'))
SCANF_K = float(os.environ.get('BXSCANF', '1'))
# BX-FIN: the ground's albedo gain by the harvest's night level in 'web' mode (the street sets and the ground are anchored
# on the road at golden; at dusk the web's trim, its lamps and its unoccluded ambient leave the walk and the red lanes far
# brighter than Cycles' ground under BX-LIGHT's dusk rig: t7StreetGlide f000, walk 111, 92, 74 / 75, 66, 58, bus lane
# 117, 90, 82 / 32, 26, 34). BXGNDK overrides; BXLANEK scales the red lanes' film toward the asphalt's own tone.
def ground_gain(night):
    if os.environ.get('BXGNDK'): return float(os.environ['BXGNDK'])
    # (BX-DUSK 2026-10-03: x1 at dusk too. BX-FIN's dusk bump, 1 + 0.6 x max(0, 1 - |night - 0.55| / 0.3), stood in for the
    # street lamps the path harvests had missed; with the shot's lamps the bus lane at f000 reads 124, 90, 82 at x1 and
    # 139, 102, 94 at x1.6 against the web's 115, 76, 69. Golden 0.05 and night 1.0 were x1 before and are x1 now.)
    return 1.0
def lane_k(night):
    if os.environ.get('BXLANEK'): return float(os.environ['BXLANEK'])
    return 1.0


ROAD_K = 1.734      # LB14's road calibration (luminance of lb14StCal; docs/notes/lb14.md), effective at the harvest's night


def _lum3(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def set_road_k(tags):
    """the road's net factor relative to its trim: the luminance of mix(lb14StCal, 1, night) (the web lerps every street
    calibration to 1 after dark: 1.734 by day, 1 at night), from the scene's ground material."""
    global ROAD_K
    g = next((P for P in tags.values() if P.get('kind') == 'ground'), None)
    night = float((g or {}).get('night', next((P.get('night') for P in tags.values() if P.get('night') is not None), 0.05)) or 0.0)
    cal = (g or {}).get('lb14StCal') or [1.94, 1.70, 1.47]
    ROAD_K = _lum3([c + (1.0 - c) * night for c in cal])


def trim_of(P, k=None):
    """the albedo factor of a material that goes through applyLightTrim (k: its trim scale, the street sets' 1.94 / 1.70 /
    1.47). 'net': the web's net diffuse (mix(0.30, 0.88, night) x k); 'web' (default): the same relative to the road's net
    factor (the trim cancels, k / 1.734), so every surface keeps the web's balance against the road and the road keeps
    its scanned albedo; 'phys': 1 (the untrimmed albedo)."""
    k = float(k) if k is not None else 1.0
    lt = P.get('lt')
    if lt is None or TRIM_MODE == 'phys':
        return 1.0
    if TRIM_MODE == 'net':
        return float(lt) * k
    return k / ROAD_K


UNTRIM_K = 1.79     # 1 / (the web's day trim x the road's calibration): set from the scene in apply()


def set_untrim_k(tags):
    """the factor for a material the web lights untrimmed, relative to the road ('web' mode; 1 otherwise)."""
    global UNTRIM_K
    night = next((float(P['night']) for P in tags.values() if P.get('night') is not None), 0.05)
    lt = 0.30 + 0.58 * night
    UNTRIM_K = 1.0 / (lt * ROAD_K) if TRIM_MODE == 'web' else (1.0 / lt if TRIM_MODE == 'net' else 1.0)
    return UNTRIM_K


def scale_bsdf_colors(nt, k, seen=None, cap=0.92):
    """multiply the colour inputs of every Principled / Diffuse / Translucent BSDF in tree nt (and in the groups it uses)
    by k, capped: another track's material put on this module's value scale without editing its code."""
    seen = seen if seen is not None else set()
    if nt is None or nt.name in seen:
        return 0
    seen.add(nt.name)
    n = 0
    for nd in list(nt.nodes):
        if nd.type == 'GROUP' and nd.node_tree is not None and not nd.node_tree.get('bx_u'):
            n += scale_bsdf_colors(nd.node_tree, k, seen, cap)
            nd.node_tree['bx_u'] = k
            continue
        name = {'BSDF_PRINCIPLED': 'Base Color', 'BSDF_DIFFUSE': 'Color', 'BSDF_TRANSLUCENT': 'Color'}.get(nd.type)
        if not name:
            continue
        sock = nd.inputs[name]
        lk = next((l for l in nt.links if l.to_socket == sock), None)
        if lk is None:
            c = tuple(sock.default_value)
            sock.default_value = tuple(min(cap, v * k) for v in c[:3]) + (c[3] if len(c) > 3 else 1.0,)
        else:
            vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'SCALE'
            vm.inputs[3].default_value = k
            mn = nt.nodes.new('ShaderNodeVectorMath'); mn.operation = 'MINIMUM'
            mn.inputs[1].default_value = (cap, cap, cap)
            src = lk.from_socket
            nt.links.remove(lk)
            nt.links.new(src, vm.inputs[0]); nt.links.new(vm.outputs[0], mn.inputs[0]); nt.links.new(mn.outputs[0], sock)
        n += 1
    return n


def build_untrim(mat, P):
    if not mat.use_nodes:
        return False
    return scale_bsdf_colors(mat.node_tree, UNTRIM_K) > 0


def wall_k(P):
    """the factor on the facade value curve's output (walls are not trimmed in the web)."""
    if TRIM_MODE in ('net', 'phys'):   # R3-PHYS: the curve's output is the wall's own albedo
        return 1.0
    lt = P.get('lt') or 0.329
    return 1.0 / (float(lt) * ROAD_K)


# ----------------------------------------------------------------------------------------------------------------------
# pbr: the PBR library (mat/pbrLib.js makeSurface)
# ----------------------------------------------------------------------------------------------------------------------
def lib_twotap():
    """two taps of a set at pattern-snapped offsets picked by a low-frequency noise (the repeat never lines up)."""
    ng, bb = new_group('BX_PbrTwoTap', [('ST', 'V'), ('Seed', 'F', 0.0), ('Unit', 'V', (0.0, 0.0, 0.0))],
                       [('StA', 'V'), ('StB', 'V'), ('Fb', 'F')])
    if not bb:
        return ng
    b, I, go = bb
    st, sd, unit = I['ST'], I['Seed'], I['Unit']
    kx = b.vnoise(st * 0.43 + b.v3(sd * 1.7, sd * 0.3)) * 6.0
    ia = b.floor(kx)
    fb = b.fract(kx)
    ux, uy, _ = b.split(unit)
    us = b.v3(b.max(ux, 1e-4), b.max(uy, 1e-4))
    snap = b.gt(ux, 0.0)

    def off(i):
        h = b.h22(b.v3(i * 7.13 + sd * 0.37, i * 3.71 - sd * 0.11))
        return b.mix(h, b.floor(h / us) * us, snap)
    set_out(b, go, 'StA', st + off(ia))
    set_out(b, go, 'StB', st + off(ia + 1.0))
    set_out(b, go, 'Fb', fb)
    return ng


def lib_weather():
    """the walls' weathering (splash zone, run-off streaks, soot under the roof line, ledges, soffits, cavity, soot
    patches), world space, per building (seed, street height, roof line)."""
    ng, bb = new_group('BX_PbrWeather', [('Albedo', 'V'), ('Seed', 'F', 0.0), ('Dirt', 'F', 0.3), ('GY0', 'F', 0.0),
                                         ('TopY', 'F', 1e5), ('Grime', 'F', 0.0), ('GAttr', 'F', 0.0), ('CavK', 'F', 0.0),
                                         ('Height', 'F', 0.5), ('GrimeC', 'V', (0.52, 0.49, 0.45)), ('Soot', 'F', 1.0)],
                       [('Albedo', 'V'), ('G', 'F')])
    if not bb:
        return ng
    b, I, go = bb
    P3, N3, _ = frame3(b)
    px, py, pz = b.split(P3)
    wn = b.normalize(N3)
    nx, up, nz_ = b.split(wn)
    sd = I['Seed']
    h = py - I['GY0']
    tw = b.normalize(b.v3(nz_, -nx) + (1e-5, 1e-5, 0.0))
    twx, twy, _ = b.split(tw)
    uw = px * twx + pz * twy
    nz = b.pbF(b.v3(uw * 1.9 + sd * 3.1, h * 1.3 + sd * 3.1))
    sp = 1.0 - b.smoothstep(0.05, 0.62, h + (nz - 0.5) * 0.3)
    bs = 1.0 - b.smoothstep(0.4, 2.6, h + (nz - 0.5) * 0.6)
    sk = b.vnoise(b.v3(uw * 2.6 + sd * 5.3, h * 0.11)) * 0.65 + b.vnoise(b.v3(uw * 7.9 - sd, h * 0.35)) * 0.35
    streak = b.smoothstep(0.56, 0.86, sk) * (0.55 + b.vnoise(b.v3(uw * 0.7, h * 0.05 + sd)) * 0.45)
    gs = b.clamp(I['Grime'], 0.0, 1.0) * (0.45 + b.smoothstep(0.35, 0.8, sk) * 0.55)
    streak = b.mix(streak, b.max(streak, gs), I['GAttr'])
    streak = streak * (1.0 - b.abs(up))
    topY = I['TopY']
    soot = b.smoothstep(topY - 3.5, topY - 0.25, py + (nz - 0.5) * 1.2) * b.step(py, topY + 0.5)
    ledge = b.smoothstep(0.55, 0.9, up) * 0.55
    soff = b.smoothstep(0.55, 0.9, -up) * 0.35
    cav = b.mix(0.5, 1.0 - I['Height'], I['CavK'])
    pt = b.smoothstep(0.5, 0.82, b.pbF(b.v3(uw * 0.42 + sd * 4.7, h * 0.85 + sd * 4.7))) * (0.55 + b.vnoise(b.v3(uw * 3.1 - sd, h * 2.3 - sd)) * 0.45)
    if VK_LOOK:
        # (look calibration, round 2: the web's soot, streaks and splash read stronger on the BID facades' upper storeys)
        g = sp * 0.62 + bs * 0.20 + streak * 0.42 + soot * 0.36 + ledge + soff + cav * 0.14 + pt * 0.9 * I['Soot']
    else:
        g = sp * 0.55 + bs * 0.18 + streak * 0.30 + soot * 0.28 + ledge + soff + cav * 0.14 + pt * 0.9 * I['Soot']
    g = g * I['Dirt'] * (0.8 + b.h2(b.v3(sd, 7.7)) * 0.4)
    g = b.clamp(g, 0.0, 0.85) * b.gt(I['Dirt'], 0.0)
    alb = I['Albedo']
    L = b.lum(alb)
    grime = b.mix(b.vec(L), alb, 0.55) * I['GrimeC']
    set_out(b, go, 'Albedo', b.mix(alb, grime, g))
    set_out(b, go, 'G', g)
    return ng


def wall_frame(b, wn3, world):
    """(m, dmx, dmy): the PBR library's mapping coordinate and its world derivatives (Blender frame), the web's
    world mapping (x, -z) on up-facing faces, (along the wall, y) on walls; the uv mapping otherwise (MikkTSpace on 'st')."""
    P3, _, _ = frame3(b)
    px, py, pz = b.split(P3)
    nx, ny, nz = b.split(wn3)
    if world:
        upf = b.gt(b.abs(ny), 0.7)
        t = b.normalize(b.v3(nz, -nx) + (1e-5, 1e-5, 0.0))
        tx, ty, _ = b.split(t)
        mwx = px * tx + pz * ty
        m = b.mix(b.v3(mwx, py), b.v3(px, -pz), upf)
        # d/dP of m.x and m.y in Blender's frame: three (tx, 0, ty) -> (tx, -ty, 0); three (0, 1, 0) -> (0, 0, 1);
        # three (1, 0, 0) -> (1, 0, 0); three (0, 0, -1) -> (0, 1, 0)
        dmx = b.mix(b.v3(tx, -ty, 0.0), (1.0, 0.0, 0.0), upf)
        dmy = b.mix(b.c((0.0, 0.0, 1.0)), (0.0, 1.0, 0.0), upf)
        return m, dmx, dmy
    m = b.uv('st')
    T, Bt = uv_frame(b)
    return m, T, Bt


PBR_SURF_INS = [('A', 'V'), ('Oc', 'V', (1.0, 0.8, 0.0)), ('Oa', 'F', 0.5), ('Tn', 'V', (0.0, 0.0, 1.0)), ('Sd', 'F', 0.0),
                ('DirtV', 'F', 0.3), ('GY0', 'F', 0.0), ('TopY', 'F', 1e5), ('Grime', 'F', 0.0), ('GAttr', 'F', 0.0),
                ('T', 'V', (1.0, 0.0, 0.0)), ('Bv', 'V', (0.0, 1.0, 0.0)), ('Ratio', 'V', (1.0, 1.0, 1.0)), ('FkOn', 'F', 0.0),
                ('VcOn', 'F', 0.0), ('Chips', 'F', 1.0), ('RefL', 'F', 0.25), ('Scan', 'V', (0.0, 0.0, 0.0)), ('ScanL', 'F', 1.0),
                ('SubK', 'F', 0.0), ('OverThr', 'F', 0.5), ('OverRefL', 'F', 0.25), ('OverRough', 'F', 0.55),
                ('Paint', 'V', (0.8, 0.8, 0.8)), ('CavK', 'F', 0.0), ('GrimeC', 'V', (0.52, 0.49, 0.45)), ('Glazed', 'F', 0.0),
                ('RS', 'V', (0.0, 1.0, 0.0)), ('Rough', 'F', 1.0), ('MetalOn', 'F', 0.0), ('MetalV', 'F', 0.0),
                ('MetalTint', 'F', 0.0), ('NrmK', 'F', 1.0), ('FacX', 'F', 1.0), ('FacY', 'F', 0.0), ('WallK', 'F', 1.0),
                ('TrimV', 'V', (1.0, 1.0, 1.0))]


def lib_pbr_surf(paint, over, street, gum):
    """the PBR library's surface after the two taps (pbrLib.js makeSurface from map_fragment on), one group per program
    structure as the web compiles one program per structure (paint / paint-over / street / gum); the set's and the
    material's constants are the group's inputs, the per-vertex data its own Attribute nodes."""
    name = 'BX_PbrSurf_' + ''.join(k for k, v in (('p', paint), ('o', over), ('s', street), ('g', gum)) if v) or 'BX_PbrSurf_w'
    if name == 'BX_PbrSurf_':
        name = 'BX_PbrSurf_w'
    ng, bb = new_group(name, PBR_SURF_INS, [('Albedo', 'V'), ('Roughness', 'F'), ('Metallic', 'F'), ('Normal', 'V')])
    if not bb:
        return ng
    b, I, go = bb
    P3, N3, G3 = frame3(b)
    px, py, pz = b.split(P3)
    sd = I['Sd']
    A, Oc, Oa = I['A'], I['Oc'], I['Oa']
    Or, Og, Ob = b.split(Oc)
    tint = I['Ratio'] * b.mix(b.vec(1.0), b.sock(b.attr('aFkTr').outputs['Vector']), I['FkOn'])
    tint = tint * b.mix(b.vec(1.0), b.sock(b.attr('bxCol').outputs['Color']), I['VcOn'])
    alb = A
    if paint:
        pm = 1.0 - (1.0 - Oa) * I['Chips']
        la = b.lum(alb)
        pc = tint * la
        pc = pc * b.mix(I['RefL'] / b.max(la, 1e-3), 1.0, 0.55)
        sub = b.mix(alb, b.max(alb - I['Scan'] * (la / b.max(I['ScanL'], 1e-3)) * Oa, 0.0), I['SubK'])
        alb = b.mix(sub, pc, pm)
    else:
        alb = alb * tint
    pv = b.c(0.0)
    if over:
        wr = b.pbF(b.v3(px * 1.3 + sd * 2.1, pz * 1.3 + sd * 2.1)) * 0.62 + b.pbF(b.v3(px * 11.0 - sd, pz * 11.0 - sd)) * 0.38
        thr = I['OverThr']
        pv = 1.0 - b.smoothstep(thr - 0.035, thr + 0.035, wr)
        pcol = I['Paint'] * b.mix(1.0, b.lum(alb) / b.max(I['OverRefL'], 1e-3), 0.22)
        alb = b.mix(alb, pcol, pv)
    wpx, wpy, wpz = px + sd * 13.7, py + sd * 13.7, pz + sd * 13.7
    mv = b.pbF(b.v3((wpx * 0.71 + wpz * 0.70) * 0.21, wpy * 0.17)) - 0.5
    alb = alb * (1.0 + mv * 0.16)
    alb = b.mix(alb, alb * (1.03, 1.0, 0.96), b.clamp(b.pbF(b.v3(wpx * 0.09 + wpy * 0.05, wpz * 0.09 + wpy * 0.05)) - 0.4, 0.0, 1.0) * 0.6)
    dirtV = I['DirtV']
    if not street:
        wo = b.group(lib_weather(), {'Albedo': alb, 'Seed': sd, 'Dirt': dirtV, 'GY0': I['GY0'], 'TopY': I['TopY'], 'Grime': I['Grime'],
                                     'GAttr': I['GAttr'], 'CavK': I['CavK'], 'Height': Oa, 'GrimeC': I['GrimeC'], 'Soot': 1.0})
        alb, gr = wo['Albedo'], wo['G']
    else:
        blv = b.pbF(b.v3(px * 0.35 + sd * 1.3, pz * 0.35 + sd * 1.3))
        g = b.smoothstep(0.55, 0.85, blv) * 0.35 * dirtV
        if gum:
            gc = b.v3(px / 0.23, pz / 0.23)
            ci = b.floor(gc)
            cf = b.fract(gc)
            hh = b.h22(ci + (11.3, 11.3, 0.0))
            on = b.step(0.78, b.h2(ci * 1.37 + (4.1, 4.1, 0.0)))
            rr = b.mix(0.035, 0.085, hh.y)
            dd = b.length(cf - (hh * 0.6 + (0.2, 0.2, 0.0)))
            spot = on * (1.0 - b.smoothstep(rr - 0.004, rr + 0.004, dd))
            alb = b.mix(alb, b.vec(0.075) * (0.8 + hh.x * 0.5), spot * 0.85)
        alb = alb * (1.0 - g)
        gr = g
    # the facade value curve (FacX: walls, net of the web's trim) with the dark toe of paint and metal (FacY), or the
    # trimmed albedo (TrimV); WallK / TrimV carry the --bxtrim mode
    a0c = b.max(alb, 0.0)
    cv = b.pow(a0c, 1.22) * 0.88
    x, y, z = b.split(a0c)
    cx, cy, cz = b.split(cv)
    toe = b.v3(b.mix(x * 0.531, cx, b.step(0.1, x)), b.mix(y * 0.531, cy, b.step(0.1, y)), b.mix(z * 0.531, cz, b.step(0.1, z)))
    cv = b.mix(cv, toe, I['FacY']) * I['WallK']
    alb = b.mix(alb * I['TrimV'], cv, I['FacX'])
    alb = alb * b.mix(1.0, Or, 0.35)
    RS = I['RS']
    rsx, rsy, rsz = b.split(RS)
    rr0 = b.mix(Og, b.mix(rsx, rsy, Og), rsz) * I['Rough']
    glz = I['Glazed']
    rr0 = b.mix(b.mix(rr0, b.min(rr0 + 0.12, 1.0), gr), b.mix(rr0, b.max(rr0, 0.72), gr * glz), b.gt(glz, 0.0))
    if over:
        rr0 = b.mix(rr0, I['OverRough'], pv)
    rough = b.clamp(rr0, 0.04, 1.0)
    metal = b.mix(Ob, I['MetalV'] * (1.0 - gr * 0.6), I['MetalOn'])
    alb = b.mix(alb, b.max(tint * 1.05 + 0.02, 0.0), I['MetalTint'])
    tn = I['Tn']
    tx_, ty_, tz_ = b.split(tn)
    sk = (1.0 - gr * 0.35) * (1.0 - pv * 0.45) * I['NrmK']
    Nb = b.sock(b.geo().outputs['Normal'])
    normal = b.normalize(I['T'] * (tx_ * sk) + I['Bv'] * (ty_ * sk) + Nb * tz_)
    set_out(b, go, 'Albedo', alb)
    set_out(b, go, 'Roughness', rough)
    set_out(b, go, 'Metallic', metal)
    set_out(b, go, 'Normal', normal)
    return ng


def build_pbr(mat, P, root_dir):
    tex = P.get('tex') or {}
    if 'alb' not in tex:
        return False
    nt = mat.node_tree
    nt.nodes.clear()
    b = B(nt)
    P3, N3, G3 = frame3(b)
    px, py, pz = b.split(P3)
    wn = b.normalize(N3)
    size = P.get('pbSize') or [1, 1]
    sd0 = float(P.get('pbSeed', 0.0))
    rot = P.get('pbRot') or [1, 0, 0, 1]
    world = float(P.get('pbWorld', 0)) > 0.5
    wAttr, gAttr, dAttr = P.get('wAttr'), P.get('gAttr'), P.get('dAttr')
    we = weD = None
    if wAttr:
        wa = b.attr('aWeather')
        we = b.sock(wa.outputs['Color'])
        weD = b.sock(wa.outputs['Alpha'], False)
    sd = (b.split(we)[0] + sd0) if wAttr else b.c(sd0)
    m, dmx, dmy = wall_frame(b, wn, world)
    mx, my, _ = b.split(m)
    r0, r1, r2, r3 = [float(v) for v in rot]
    stx, sty = (mx * r0 + my * r2) / float(size[0] or 1.0), (mx * r1 + my * r3) / float(size[1] or 1.0)
    st = b.v3(stx, -sty)
    unit = P.get('pbUnit') or [0, 0]
    tt = b.group(lib_twotap(), {'ST': st, 'Seed': sd, 'Unit': (float(unit[0]), float(unit[1]), 0.0)})
    path = lambda k: os.path.join(root_dir, tex[k])
    a0, _ = b.image(path('alb'), tt['StA'], srgb=True)
    a1, _ = b.image(path('alb'), tt['StB'], srgb=True)
    if 'orm' in tex:
        o0, o0a = b.image(path('orm'), tt['StA'], srgb=False)
        o1, o1a = b.image(path('orm'), tt['StB'], srgb=False)
    else:
        o0, o0a, o1, o1a = b.c((1.0, 0.8, 0.0)), b.c(0.5), b.c((1.0, 0.8, 0.0)), b.c(0.5)
    bl = P.get('pbBl') or [0.25, 0.75, 0.5]
    w = b.smoothstep(float(bl[0]), float(bl[1]), tt['Fb'] + (o1a - o0a) * float(bl[2]))
    tn = b.c((0.0, 0.0, 1.0))
    if 'nrm' in tex:
        n0, _ = b.image(path('nrm'), tt['StA'], srgb=False)
        n1, _ = b.image(path('nrm'), tt['StB'], srgb=False)
        tn = b.mix(n0, n1, w) * 2.0 - 1.0
    dirt = float(P.get('pbDirt', 0.3))
    dirtV = b.sel(b.lt(weD, 0.0), dirt, weD) if dAttr else b.c(dirt)
    street = bool(P.get('street'))
    gy0 = b.c(0.0)
    topY = b.c(1e5)
    if not street:
        gy0 = b.split(we)[1] if wAttr else b.c(float(P.get('pbBaseY', -1e4)))
        if not wAttr and float(P.get('pbBaseY', -1e4)) < -9000.0:
            gy0 = cao_height(b, P, root_dir, px, pz)
        topY = b.split(we)[2] if wAttr else b.c(float(P.get('pbTopY', 1e5)))
    grime = b.sock(b.attr('aGrime').outputs['Fac'], False) if gAttr else b.c(0.0)
    T = b.normalize(dmx * r0 + dmy * r2)
    Bv = b.normalize(dmx * r1 + dmy * r3)
    scan = P.get('pbScan') or [0, 0, 0, 1]
    ov = P.get('pbOver') or [0.5, 0.25, 0.55]
    RS = P.get('pbRS') or [0, 1, 0]
    pm2 = P.get('pbMetal') or [0, 0]
    fac = P.get('pbFac') or [1, 0, 0]
    facX = 1.0 if (float(fac[0]) > 0.5 and TRIM_MODE != 'phys') else 0.0
    trimV = tuple(trim_of(P) * float(v) for v in (P.get('trimK') or [1, 1, 1])) if TRIM_MODE != 'phys' else (1.0, 1.0, 1.0)
    ins = {'A': b.mix(a0, a1, w), 'Oc': b.mix(o0, o1, w), 'Oa': b.mix(o0a, o1a, w), 'Tn': tn, 'Sd': sd, 'DirtV': dirtV,
           'GY0': gy0, 'TopY': topY, 'Grime': grime, 'GAttr': 1.0 if gAttr else 0.0, 'T': T, 'Bv': Bv,
           'Ratio': tuple(float(v) for v in (P.get('pbRatio') or [1, 1, 1])), 'FkOn': 1.0 if P.get('fktr') else 0.0,
           'VcOn': 1.0 if P.get('vc') else 0.0, 'Chips': float(P.get('pbChips', 1.0)), 'RefL': float(P.get('pbRefL', 0.25)),
           'Scan': tuple(float(v) for v in scan[:3]), 'ScanL': float(scan[3]), 'SubK': 1.0 if float(P.get('pbSubK', 0)) > 0.5 else 0.0,
           'OverThr': float(ov[0]), 'OverRefL': float(ov[1]), 'OverRough': float(ov[2]),
           'Paint': tuple(float(v) for v in (P.get('pbPaint') or [0.8, 0.8, 0.8])), 'CavK': float(P.get('pbCavK', 0.0)),
           'GrimeC': tuple(float(v) for v in (P.get('pbGrimeC') or [0.52, 0.49, 0.45])), 'Glazed': float(P.get('pbGlazed', 0.0)),
           'RS': (float(RS[0]), float(RS[1]), 1.0 if float(RS[2]) > 0.5 else 0.0), 'Rough': float(P.get('pbRough', 1.0)),
           'MetalOn': 1.0 if float(pm2[1]) > 0.5 else 0.0, 'MetalV': float(pm2[0]),
           'MetalTint': 1.0 if (float(pm2[1]) > 0.5 and float(pm2[0]) > 0.5) else 0.0, 'NrmK': float(P.get('pbNrmK', 1.0)),
           'FacX': facX, 'FacY': 1.0 if float(fac[1]) > 0.5 else 0.0, 'WallK': wall_k(P), 'TrimV': trimV}
    o = b.group(lib_pbr_surf(bool(P.get('paint')), bool(P.get('over')), street, bool(P.get('gum'))), ins)
    bsdf_out(b, mat, o['Albedo'], o['Roughness'], o['Metallic'], o['Normal'])
    return True


def cao_height(b, P, root_dir, px, pz):
    """the street's height under a point from the city AO bake (G x 127.5), as the web's pbCAO; 0 without it."""
    c = P.get('cao')
    if not c:
        return b.c(0.0)
    r = c['rect']
    uvc = b.v3((px - float(r[0])) * float(r[2]), (pz - float(r[1])) * float(r[3]))
    col, _ = b.image(os.path.join(root_dir, c['file']), uvc, srgb=False)
    return b.split(col)[1] * 127.5


# ----------------------------------------------------------------------------------------------------------------------
# ground: world/materials.js GP31 / GP32 (one material for every surface kind, matId per vertex)
# ----------------------------------------------------------------------------------------------------------------------
MG_A = (0.8744, 0.4853)
MG_B = (-0.4853, 0.8744)
# GP31_SETS: per layer linear albedo mean, roughness mean, AO mean, height mean (gp31_stats.json)
GP_MEAN = [(0.1991, 0.1991, 0.1990), (0.0591, 0.0478, 0.0384), (0.3635, 0.3154, 0.2443), (0.3364, 0.3114, 0.2662),
           (0.3848, 0.3062, 0.1717), (0.4288, 0.4075, 0.3519)]
GP_RGH = [0.524, 0.832, 0.608, 0.608, 0.871, 0.473]
GP_AO = [0.910, 0.903, 0.929, 0.885, 1.000, 0.671]
GP_HM = [0.590, 0.609, 0.534, 0.395, 0.502, 0.566]
PIXA = 4.3e-4      # the lens's angle per pixel (radians): set from the scene camera in after_import


def lib_hextri():
    """hex tiling (Mikkelsen 2022) of st with cell scale gs: the three taps' coordinates and the w^7 variance-preserving
    weights (Heitz and Neyret 2018), as gpTri / gpHex."""
    ng, bb = new_group('BX_HexTri', [('ST', 'V'), ('GS', 'F', 0.6), ('Pow', 'F', 7.0), ('Off', 'F', 0.0)],
                       [('S1', 'V'), ('S2', 'V'), ('S3', 'V'), ('W', 'V'), ('VS', 'F')])
    if not bb:
        return ng
    b, I, go = bb
    st = I['ST']
    s = st * I['GS'] * 3.4641016
    sx, sy, _ = b.split(s)
    skx, sky = sx - sy * 0.57735027, sy * 1.15470054
    bx, by = b.floor(skx), b.floor(sky)
    fx, fy = b.fract(skx), b.fract(sky)
    tz = 1.0 - fx - fy
    sg = b.step(0.0, -tz)
    s2 = sg * 2.0 - 1.0
    w1, w2, w3 = -tz * s2, sg - fy * s2, sg - fx * s2
    v1 = b.v3(bx + sg, by + sg)
    v2 = b.v3(bx + sg, by + 1.0 - sg)
    v3_ = b.v3(bx + 1.0 - sg, by + sg)
    off = b.v3(I['Off'], I['Off'])
    o1, o2, o3 = b.h22(v1 + off), b.h22(v2 + off), b.h22(v3_ + off)
    # w^7 (Pow 7) or w^5 (the macro scan)
    def pw(w):
        w2_ = w * w
        w4 = w2_ * w2_
        return b.mix(w4 * w, w4 * w2_ * w, b.gt(I['Pow'], 6.0))
    W1, W2, W3 = pw(w1), pw(w2), pw(w3)
    sm = b.max(W1 + W2 + W3, 1e-6)
    W1, W2, W3 = W1 / sm, W2 / sm, W3 / sm
    vs = 1.0 / b.sqrt(b.max(W1 * W1 + W2 * W2 + W3 * W3, 1e-4))
    set_out(b, go, 'S1', st + o1)
    set_out(b, go, 'S2', st + o2)
    set_out(b, go, 'S3', st + o3)
    set_out(b, go, 'W', b.v3(W1, W2, W3))
    set_out(b, go, 'VS', vs)
    return ng


def hex_taps(b, imgA, imgN, hx, L):
    """the layer's three taps of t_gpA / t_gpN blended about the layer's mean (gpHex): (rgb, height, normal rgb, ao)."""
    W1, W2, W3 = b.split(hx['W'])
    vs = hx['VS']
    mA, mH = GP_MEAN[L], GP_HM[L]
    mN = (0.5, 0.5, GP_RGH[L])
    accA = accH = accN = accO = None
    for k, (wk, sk) in enumerate(((W1, hx['S1']), (W2, hx['S2']), (W3, hx['S3']))):
        ca, aa = b.image(imgA, sk, srgb=True)
        cn, an = b.image(imgN, sk, srgb=False)
        dA = (ca - mA) * wk
        dH = (aa - mH) * wk
        dN = (cn - mN) * wk
        dO = (an - GP_AO[L]) * wk
        accA = dA if accA is None else accA + dA
        accH = dH if accH is None else accH + dH
        accN = dN if accN is None else accN + dN
        accO = dO if accO is None else accO + dO
    A = b.clamp(accA * vs + mA, 0.0, 1.0)
    H = b.clamp(accH * vs + mH, 0.0, 1.0)
    N = b.clamp(accN * vs + mN, 0.0, 1.0)
    O = b.clamp(accO * vs + GP_AO[L], 0.0, 1.0)
    return A, H, N, O


def band(b, sd, hw, h):
    """box-filtered coverage of |sd| < hw over a footprint 2h (gpBand)."""
    return b.clamp((b.min(sd + h, hw) - b.max(sd - h, -hw)) / (h * 2.0), 0.0, 1.0)


def gstreak(b, g, along, across, seed):
    gx, gy, _ = b.split(g)
    sA = b.vnoise(b.v3(gx * along + seed, gy * across + seed))
    sB = b.vnoise(b.v3(gx * across + seed + 19.7, gy * along + seed + 19.7))
    return b.mix(sA, sB, b.smoothstep(0.38, 0.62, b.vnoise(g * 0.0075 + (41.0, 41.0, 0.0))))


def build_ground(mat, P, root_dir):
    gA, gN = P.get('gpA') or [], P.get('gpN') or []
    if len(gA) < 5 or len(gN) < 6:
        return False
    nt = mat.node_tree
    nt.nodes.clear()
    b = B(nt)
    fA = lambda L: os.path.join(root_dir, gA[min(L, len(gA) - 1)])
    fN = lambda L: os.path.join(root_dir, gN[min(L, len(gN) - 1)])
    macroL = int(P.get('gpMacroL', len(gN) - 1))
    P3, N3, G3 = frame3(b)
    px, py, pz = b.split(P3)
    wn = b.normalize(G3)
    wny = b.split(wn)[1]
    pxz = b.v3(px, pz)
    m = b.sock(b.attr('matId').outputs['Fac'], False)
    ka = b.attr('gpK')
    kc = b.sock(ka.outputs['Color'])
    kx_, ky_, kz_ = b.split(kc)
    kw_ = b.sock(ka.outputs['Alpha'], False)
    isk = lambda *ids: sum((1.0 - b.step(0.5, b.abs(m - float(i)))) for i in ids) if len(ids) > 1 else (1.0 - b.step(0.5, b.abs(m - float(ids[0]))))
    kAsph = isk(0, 11, 12)
    kWalk = isk(1, 16, 17)
    kKerb = isk(2)
    kPW = isk(3)
    kPY = isk(4)
    kPaint = kPW + kPY
    kGrass = isk(5, 15)
    kRest = b.clamp(1.0 - kAsph - kWalk - kKerb - kPaint - kGrass, 0.0, 1.0)
    k12 = isk(12)
    # the pixel footprint on the ground (the web's gFw), from the camera distance and the lens
    cam = b.node('ShaderNodeCameraData')
    dist = b.sock(cam.outputs['View Distance'], False)
    inc = b.sock(b.geo().outputs['Incoming'])
    cosI = b.abs(b.dot(inc, b.sock(b.geo().outputs['True Normal'])))
    fw = dist * PIXA / b.max(cosI, 0.12)
    gNear = b.smoothstep(0.30, 0.06, fw)
    gMid = b.smoothstep(1.10, 0.22, fw)
    gG = b.v3(px * MG_A[0] + pz * MG_A[1], px * MG_B[0] + pz * MG_B[1])
    gGx, gGy, _ = b.split(gG)
    n1 = b.vnoise(pxz * 0.35)
    # the kerb frame (gpKerbWorker): across-street from the canonical kerb, to the nearest kerb, the width, the bearing
    kOk = b.gt(kx_, 100.5) * b.gt(kw_, 0.5)
    kQ = (kx_ - 1.0) * 0.01 - 320.0
    kDn = b.max(ky_ - 1.0, 0.0) * 0.01
    kW = b.max(kz_ - 1.0, 0.0) * 0.01
    kOk2 = kOk * b.gt(kz_, 100.5)
    kA = (kw_ - 1.0) / 65534.0 * 3.14159265 - 1.57079633
    knx, knz = b.cos(kA), b.sin(kA)
    ktx, ktz = -knz, knx
    ca = ktx * MG_A[0] + ktz * MG_A[1]
    cb = ktx * MG_B[0] + ktz * MG_B[1]
    kqx_raw = px * ktx + pz * ktz
    sA_ = b.gt(b.abs(ca), 0.99756)
    sB_ = b.gt(b.abs(cb), 0.99756) * (1.0 - sA_)
    sgn = lambda v: b.gt(v, 0.0) * 2.0 - 1.0
    kqx = b.mix(b.mix(kqx_raw, gGy * sgn(cb), sB_), gGx * sgn(ca), sA_)
    gAx = b.step(0.5, b.smoothstep(0.38, 0.62, b.vnoise(gG * 0.0075 + (41.0, 41.0, 0.0))))
    gAx = b.mix(gAx, b.step(b.abs(ca), b.abs(cb)), kOk)
    qx = b.mix(b.mix(gGx, gGy, gAx), kqx, kOk)
    qy = b.mix(b.mix(gGy, gGx, gAx), kQ, kOk)
    _s0 = Sub(b, 'BX_GndLot')
    with _s0 as sb:
        # ---- the block-face pour lottery (GT13 / GP31)
        lotQ = sb.v3(gGx / 82.0 + sb.fbmG(gG * 0.013 + (4.0, 4.0, 0.0)) * 0.075, gGy / 76.0 + sb.fbmG(gG * 0.015 + (21.0, 21.0, 0.0)) * 0.075)
        lotId = sb.floor(lotQ)
        lotH = (sb.h2(lotId + (3.3, 3.3, 0.0)) + sb.h2(lotId + (11.7, 11.7, 0.0)) + sb.h2(lotId + (27.1, 27.1, 0.0)) + sb.h2(lotId + (41.9, 41.9, 0.0))) * 0.25
        lotAge = sb.clamp(lotH * 0.86 + n1 * 0.28, 0.0, 1.0)
        young = sb.lt(lotH, 0.40)
        asp = sb.mix((0.0649, 0.0781, 0.0868), (0.2050, 0.2120, 0.2220), lotAge)
        lf = sb.abs(sb.fract(lotQ) - (0.5, 0.5, 0.0))
        lfx, lfy, _ = sb.split(lf)
        lw = fw * 1.5 / 82.0 + 0.0016
        seam = sb.max(sb.smoothstep(0.5 - lw, 0.5 - lw * 0.25, lfx), sb.smoothstep(0.5 - lw, 0.5 - lw * 0.25, lfy))
        asp = asp * (1.0 - seam * 0.12 * gMid)
        asp = asp * (1.0 - sb.smoothstep(0.55, 0.95, sb.fbmG(pxz * 0.035 + (9.1, 9.1, 0.0))) * 0.12)
        # lanes and tyre tracks from the kerb (8 ft parking lanes, the travel lanes sharing the rest), the oil drip line
        Wst = sb.mix(40.0, kW, kOk2)
        nL = sb.max(sb.floor((Wst - 4.8) / 3.2 + 0.35), 1.0)
        lwd = sb.max((Wst - 4.8) / nL, 2.8)
        lc = (kQ - 2.4) / lwd
        dlK = sb.abs(sb.fract(lc) - 0.5) * lwd
        inL = sb.smoothstep(2.2, 2.6, kDn)
        trkK = inL * sb.smoothstep(0.62, 0.28, sb.abs(dlK - 0.85))
        dripK = inL * sb.smoothstep(0.36, 0.10, dlK)
        lane = qy / 3.35 + sb.h2(lotId + (61.3, 61.3, 0.0))
        dlF = sb.abs(sb.fract(lane) - 0.5) * 3.35
        trkF = sb.smoothstep(0.62, 0.28, sb.abs(dlF - 0.85))
        laneId = sb.mix(sb.floor(lane), sb.floor(lc), kOk)
        trk = sb.mix(trkF, trkK, kOk)
        drip = dripK * kOk
        lotx, loty, _ = sb.split(lotId)
        trk = trk * sb.smoothstep(0.22, 0.62, sb.vnoise(sb.v3(qx * 0.035, laneId * 3.1 + 5.0))) * (0.45 + sb.h2(sb.v3(laneId, lotx + loty * 3.0)) * 0.55)
        drip = drip * sb.smoothstep(0.35, 0.78, sb.vnoise(sb.v3(qx * 0.09, laneId * 7.3 + 1.0)))
        lv = sb.smoothstep(1.4, 0.35, fw)
        wheel = trk * lv
        asp = asp * (1.0 - wheel * 0.09)
        dust = sb.smoothstep(1.3, 0.35, kDn) * kOk
        bleach = sb.smoothstep(0.35, 0.80, lotAge) * (1.0 - wheel)
        asp = asp * (1.0 + bleach * 0.05)
        # the red bus lane (12): a film over the road's own tone, worn in the tyre tracks and in patches (mRaw == 12 block)
        # (look calibration, round 2: the web's lanes read a darker, duller brick red; the web's film x (1.70, 0.558, 0.550)
        # mixed 0.18 toward (0.150, 0.048, 0.040) read tomato red under Cycles' golden light; BXVKLOOK=0 keeps it)
        red = (sb.mix(asp * (1.48, 0.64, 0.62), (0.125, 0.055, 0.048), 0.26) if VK_LOOK
               else sb.mix(asp * (1.70, 0.558, 0.550), (0.150, 0.048, 0.040), 0.18))
        red = red * lane_k(float(P.get('night', 0.05)))   # (BX-FIN: BXLANEK / the dusk table)
        cov12 = (1.0 - wheel * 0.42) * (1.0 - sb.smoothstep(0.52, 0.90, sb.fbmG(pxz * 0.075 + (3.7, 3.7, 0.0))) * 0.24) * 0.95 * k12
        asp = sb.mix(asp, red, cov12)
        tone = asp
        _s0.out('asp', asp)
        _s0.out('tone', tone)
        _s0.out('lotH', lotH)
        _s0.out('lotAge', lotAge)
        _s0.out('young', young)
        _s0.out('lotId', lotId)
        _s0.out('wheel', wheel)
        _s0.out('trk', trk)
        _s0.out('dust', dust)
        _s0.out('drip', drip)
        _s0.out('lv', lv)
        _s0.out('cov12', cov12)
    asp = _s0.o['asp']
    tone = _s0.o['tone']
    lotH = _s0.o['lotH']
    lotAge = _s0.o['lotAge']
    young = _s0.o['young']
    lotId = _s0.o['lotId']
    wheel = _s0.o['wheel']
    trk = _s0.o['trk']
    dust = _s0.o['dust']
    drip = _s0.o['drip']
    lv = _s0.o['lv']
    cov12 = _s0.o['cov12']
    _s1 = Sub(b, 'BX_GndScan')
    with _s1 as sb:
        # ---- the scanned sets: hex taps of the young (1) and the weathered (0) asphalt, blended by the pour's draw
        hx = sb.group(lib_hextri(), {'ST': gG * 0.5, 'GS': 0.6, 'Pow': 7.0})
        A0, H0, N0, O0 = hex_taps(sb, fA(0), fN(0), hx, 0)
        A1, H1, N1, O1 = hex_taps(sb, fA(1), fN(1), hx, 1)
        ratio = sb.mix(A0 / GP_MEAN[0], A1 / GP_MEAN[1], young)
        ao = sb.mix(O0 / GP_AO[0], O1 / GP_AO[1], young)
        Nn = sb.mix(N0, N1, young)
        rr = sb.mix(sb.split(N0)[2] / GP_RGH[0], sb.split(N1)[2] / GP_RGH[1], young)
        hc = sb.mix(H0 - GP_HM[0], H1 - GP_HM[1], young)
        # the 30 m aerial scan (the nrm array's last layer), hex-tiled on ~12 m cells, w^5
        hm = sb.group(lib_hextri(), {'ST': gG / 30.0, 'GS': 0.72, 'Pow': 5.0, 'Off': 7.7})
        Wm1, Wm2, Wm3 = sb.split(hm['W'])
        acc = None
        for wk, sk in ((Wm1, hm['S1']), (Wm2, hm['S2']), (Wm3, hm['S3'])):
            c_, _ = sb.image(fN(macroL), sk, srgb=False)
            t_ = (sb.split(c_)[0] - 0.5) * wk
            acc = t_ if acc is None else acc + t_
        mcr = sb.max(1.0 + acc * hm['VS'] * 2.0, 0.2)
        mcK = sb.mix(0.38, sb.mix(0.88, 0.55, sb.smoothstep(0.008, 0.003, fw)), sb.smoothstep(0.06, 0.012, fw))
        nearC = sb.smoothstep(0.02, 0.006, fw)
        _s1.out('ratio', ratio)
        _s1.out('ao', ao)
        _s1.out('Nn', Nn)
        _s1.out('rr', rr)
        _s1.out('hc', hc)
        _s1.out('mcr', mcr)
        _s1.out('mcK', mcK)
        _s1.out('nearC', nearC)
        _s1.out('A0', A0)
        _s1.out('H0', H0)
        _s1.out('O0', O0)
        _s1.out('N0', N0)
    ratio = _s1.o['ratio']
    ao = _s1.o['ao']
    Nn = _s1.o['Nn']
    rr = _s1.o['rr']
    hc = _s1.o['hc']
    mcr = _s1.o['mcr']
    mcK = _s1.o['mcK']
    nearC = _s1.o['nearC']
    A0 = _s1.o['A0']
    H0 = _s1.o['H0']
    O0 = _s1.o['O0']
    N0 = _s1.o['N0']
    _s2 = Sub(b, 'BX_GndAsph')
    with _s2 as sb:
        # ---- asphalt (0, 11 gutter, 12 bus lane)
        a = asp * sb.mix(1.0, mcr, mcK)
        a_m = a
        kS = 1.0 - sb.smoothstep(0.004, 0.03, fw) * SCANF_K   # BX-FIN: the scan's contrast by footprint (BXSCANF)
        rat = sb.max(sb.vec(1.0) + (ratio - 1.0) * sb.mix(1.25, 1.60, nearC) * kS, 0.12)
        a = a * (rat * sb.mix(1.0, ao, 0.85 * kS))
        a_r = a
        a = a * sb.max(1.0 + hc * sb.mix(0.75, 1.15, nearC) * kS, 0.28)
        # (look calibration, round 2) the web's grain at street distances is its mip levels: texels about a pixel wide, so
        # neighbouring pixels differ by the scan's variance at that scale. Cycles averages the full-resolution scan over a
        # pixel (no mips on the GPU) and the denoiser takes the rest as noise (the speckle is there at 256 spp without it).
        # So the grain is drawn at the pixel's scale: world-anchored value noise on the two octaves round the footprint,
        # blended by the footprint's log (as trilinear mips are, so it holds still as the lens moves), at the web's measured
        # amplitude (t7ArchTrack f054: high-pass 1.4 at a mean of 59, ~5 % of the albedo)
        midK = sb.smoothstep(0.004, 0.012, fw) * (1.0 - sb.smoothstep(0.25, 0.6, fw)) * GRAIN_K
        lg = sb.m('LOGARITHM', sb.max(fw, 0.002), 2.0)
        k0 = sb.floor(lg)
        fr = lg - k0
        c0 = sb.m('POWER', 2.0, k0) * 2.5
        c1 = c0 * 2.0
        n0 = sb.vnoise(gG / c0 + (31.7, 11.3, 0.0))
        n1 = sb.vnoise(gG / c1 + (7.9, 53.1, 0.0))
        grain = sb.mix(n0, n1, fr) - 0.5
        a = a * (1.0 + grain * 0.6 * midK)
        # castings (round 2): manholes and valve boxes on a 15 m cell lottery, the asphalt collar patched round them, a
        # raised rim, the cast face (a DEP waffle of bosses or a Con Ed vented cover), the high points polished by tyres
        mcl = sb.floor(sb.v3(px / 15.0, pz / 15.0))
        mr = sb.h2(mcl)
        mon = sb.lt(mr, 0.42)
        mo = sb.v3(sb.h2(mcl + (1.7, 1.7, 0.0)), sb.h2(mcl + (2.9, 2.9, 0.0))) * 0.7 + (0.15, 0.15, 0.0)
        lp = (sb.fract(sb.v3(px / 15.0, pz / 15.0)) - mo) * 15.0
        lpx, lpy, _ = sb.split(lp)
        md = sb.length(lp)
        Rm = sb.sel(sb.lt(mr, 0.28), 0.36, 0.16)
        ae = sb.max(fw * 0.5, 0.004)
        collar = (1.0 - sb.smoothstep(Rm + 0.34, Rm + 0.62, md)) * mon
        a = a * (1.0 + collar * sb.mix(-0.16, 0.22, sb.step(0.5, sb.h2(mcl + (41.0, 41.0, 0.0)))) * gMid)
        rim = sb.smoothstep(Rm + 0.09 + ae, Rm + 0.09 - ae, md)
        cover = sb.smoothstep(Rm + ae, Rm - ae, md)
        manhole = sb.max(cover, rim * 0.45) * mon
        vent = sb.step(0.5, sb.h2(mcl + (53.0, 53.0, 0.0))) * sb.step(0.30, Rm)
        th = sb.m('ARCTAN2', lpy, lpx) * 5.0929582
        slot = sb.smoothstep(0.30, 0.18, sb.abs(sb.fract(th) - 0.5)) * sb.step(0.08, md) * sb.step(md, Rm - 0.06)
        gq = sb.abs(sb.fract(lp / 0.05) - (0.5, 0.5, 0.0))
        gqx, gqy, _ = sb.split(gq)
        boss = sb.smoothstep(0.30, 0.18, sb.max(gqx, gqy))
        pat = sb.max(sb.mix(boss, 1.0 - slot, vent), sb.smoothstep(Rm - 0.045, Rm - 0.035, md))
        castPat = sb.mix(0.5, pat, cover * sb.smoothstep(0.02, 0.006, fw))
        castSlot = slot * vent
        a = sb.mix(a, (0.088, 0.080, 0.070), manhole)
        a = sb.mix(a, a * sb.mix(0.62, 1.30, castPat), manhole)
        a = sb.mix(a, (0.012, 0.011, 0.010), castSlot * manhole)
        # tar snakes (round 2, after gpCrackL): sealant over the longitudinal crack runs of old pours, a band of constant
        # width round the zero line of a warped noise (its gradient by finite differences), sealed in runs; darker than
        # the road, no chips, satin when fresh, sanded grey when trafficked
        pq = sb.v3(qx * 0.11 + sb.vnoise(sb.v3(qx * 0.09 + 3.0, qy * 0.09 + 3.0)) * 1.2, qy * 0.30 + sb.vnoise(sb.v3(qx * 0.09 + 17.0, qy * 0.09 + 17.0)) * 1.2)
        f0 = sb.vnoise(pq)
        fxp = sb.vnoise(pq + (0.02, 0.0, 0.0))
        fyp = sb.vnoise(pq + (0.0, 0.02, 0.0))
        gql = sb.length(sb.v3((fxp - f0) / 0.02 * 0.11, (fyp - f0) / 0.02 * 0.30))
        dseal = sb.abs(f0 - 0.5) / sb.max(gql, 1e-3)
        sw = 0.025 + sb.vnoise(sb.v3(qx * 0.4, qy * 0.4)) * 0.03
        runK = sb.smoothstep(0.45, 0.60, sb.vnoise(sb.v3(qx * 0.05 + 9.0, qy * 0.05 + 9.0))) * sb.smoothstep(0.42, 0.68, lotH)
        seal = band(sb, dseal, sw, sb.max(fw * 0.5, 0.002)) * runK * (1.0 - manhole) * SEAL_K   # (BX-FIN: BXSEAL)
        sDust = sb.smoothstep(0.25, 0.85, sb.vnoise(gG * 0.9 + (5.0, 5.0, 0.0)))
        a = sb.mix(a, tone * sb.mix(0.17, 0.40, sDust), seal)
        a_h = a
        # GP32 crack net: block cracking on the borders of a jittered cell grid (old pours), the crack's dark dusty floor
        dens = sb.min(sb.smoothstep(0.42, 0.68, lotH) * sb.smoothstep(0.22, 0.55, sb.vnoise(gG * 0.075 + lotId * 3.1 + (1.7, 1.7, 0.0))), 1.0)
        pw = gG + sb.v3(sb.vnoise(gG * 0.42 + (7.1, 7.1, 0.0)) - 0.5, sb.vnoise(gG * 0.42 + (3.7, 3.7, 0.0)) - 0.5) * 0.70 \
            + sb.v3(sb.vnoise(gG * 3.1 + (4.4, 4.4, 0.0)) - 0.5, sb.vnoise(gG * 3.1 + (6.6, 6.6, 0.0)) - 0.5) * 0.09
        cell = sb.mix(1.3, 2.5, sb.h2(lotId + (9.1, 9.1, 0.0)))
        vo = sb.node('ShaderNodeTexVoronoi', voronoi_dimensions='2D', feature='DISTANCE_TO_EDGE')
        sb.link(vo.inputs['Vector'], pw / cell)
        vo.inputs['Scale'].default_value = 1.0
        vo.inputs['Randomness'].default_value = 0.62
        dC = sb.sock(vo.outputs['Distance'], False) * cell
        pwc = pw / cell
        onB = sb.smoothstep(0.30, 0.40, sb.vnoise(pwc * 1.7 + (5.0, 5.0, 0.0)))
        wC = sb.mix(0.0015, 0.013, sb.pow(sb.vnoise(pwc * 2.3 + (9.0, 9.0, 0.0)), 1.4)) * dens * onB
        wC = wC * sb.smoothstep(0.16, 0.80, sb.vnoise(pw * 1.9 + (2.0, 2.0, 0.0)))
        core = band(sb, dC, wC, sb.max(fw * 0.5, 0.0004)) * sb.gt(wC, 5e-5)
        floorC = sb.mix(a * (0.20, 0.19, 0.18), tone * (0.95, 0.88, 0.74) * 0.55, 0.3)
        a = sb.mix(a, floorC, core)
        a_c = a
        lowH = sb.smoothstep(0.08, -0.22, hc)
        dustK = dust * sb.mix(0.35, 1.0, lowH) * (1.0 - trk * 0.7)
        a = sb.mix(a, tone * (1.32, 1.24, 1.06), dustK * 0.42)
        dmp = sb.smoothstep(0.80, 0.90, sb.vnoise(gG * 0.11 + (13.0, 13.0, 0.0))) * sb.mix(0.35, 1.0, lowH)
        a = a * (1.0 - dmp * 0.30)
        oil = drip * 0.45 * lv
        a = sb.mix(a, a * 0.5, oil)
        rA = 0.92 + lotAge * 0.05 - wheel * 0.16 + dustK * 0.06
        rA = sb.clamp(rA * sb.mix(1.0, rr, 0.55), 0.45, 1.0) - sb.smoothstep(0.06, 0.26, hc) * (0.16 + trk * 0.24)
        rA = sb.mix(rA, 0.95, core)
        rA = sb.mix(rA, sb.mix(0.30, 0.10, lowH), dmp)
        rA = sb.mix(rA, 0.62, oil)
        rA = sb.mix(rA, sb.mix(0.72, 0.34, castPat), manhole)
        rA = sb.mix(rA, sb.mix(sb.mix(0.74, 0.90, sDust), 0.92, sb.smoothstep(0.012, 0.06, fw)), seal)
        rA = sb.mix(rA, 0.88, cov12)
        sA = sb.mix(sb.mix(sb.mix(0.62, 1.0, dmp), 0.95, oil), 0.58, cov12)
        sA = sb.max(sA, manhole * 0.95)
        _s2.out('a', a)
        _s2.out('rA', rA)
        _s2.out('sA', sA)
        _s2.out('mhole', manhole)
    a = _s2.o['a']
    rA = _s2.o['rA']
    sA = _s2.o['sA']
    mhole = _s2.o['mhole']
    _s3 = Sub(b, 'BX_GndPaint')
    with _s3 as sb:
        # ---- thermoplastic paint (3 white, 4 yellow): a bar's own draw, its age, rubber, wear off the scan's chip tops
        pvalid = sb.gt(kz_, 100.5) * sb.gt(ky_, 100.5)
        kr = sb.floor((kz_ - 1.0) / 100.0)
        junR = sb.m('FLOORED_MODULO', kr, 25.0) / 24.0
        barR = sb.sel(sb.lt(sb.m('FLOORED_MODULO', kz_ - 1.0, 100.0), 10.0), junR, sb.floor(kr / 25.0) / 23.0)
        age0 = sb.fbmG(pxz * 0.024 + (1.9, 1.9, 0.0))
        ageU = sb.clamp(sb.mix(age0, sb.h2(sb.floor(gG * (1.0 / 55.0)) + (7.13, 7.13, 0.0)), 0.70), 0.0, 1.0)
        age = sb.mix(ageU, sb.clamp(sb.mix(age0, junR, 0.70), 0.0, 1.0), pvalid)
        barCov = sb.mix(0.80, sb.mix(0.80, barR * 0.40 + 0.60, gMid), pvalid)
        barTone = sb.mix(1.0, sb.mix(1.0, 0.93 + sb.fract(barR * 3.71 + 0.57) * 0.14, gMid), pvalid)
        fresh = sb.mix((0.618, 0.600, 0.556), (0.408, 0.212, 0.014), kPY)
        old = sb.mix((0.446, 0.420, 0.336), (0.292, 0.160, 0.026), kPY)
        paintC = sb.mix(fresh, old, sb.smoothstep(0.34, 0.86, age)) * barTone
        rubber = sb.smoothstep(0.46, 0.90, gstreak(sb, gG, 0.03, 0.85, 4.4)) * (0.35 + age * 0.65)
        paintC = sb.mix(paintC, paintC * (0.70, 0.695, 0.68), rubber * 0.60)
        wearArea = sb.fbmG(sb.v3(gGx * 0.021 + 7.3, gGy * 0.034 + 7.3))
        flake = sb.smoothstep(0.55, 0.95, gstreak(sb, gG, 0.02, 0.62, 7.1))
        pit = sb.smoothstep(0.58, 0.93, sb.vnoise(sb.v3(gGx * 2.4, gGy * 6.4)))
        wear = sb.smoothstep(0.30, 0.95, wearArea * 0.15 + flake * 0.48 * gNear + pit * 0.31 + rubber * 0.30)
        wear = sb.clamp(wear, 0.03, 0.46)
        wear = sb.clamp(wear * (2.40 - barCov * 1.40) + (1.0 - barCov) * 0.10, 0.02, 0.62)
        gpWear = sb.clamp(wear / 0.62, 0.0, 1.0)
        asphU = sb.mix((0.1259, 0.1328, 0.1276), (0.3300, 0.3380, 0.3520), n1 * 0.5 + 0.15)
        e = sb.mix(0.04, 0.22, sb.smoothstep(0.002, 0.05, fw))
        t_ = 0.30 - gpWear * 0.26
        expo = sb.smoothstep(t_ - e, t_ + e, H0 - GP_HM[0]) * sb.step(0.01, gpWear)
        film = paintC * sb.mix(sb.vec(1.0), A0 / GP_MEAN[0], 0.20) * sb.mix(1.0, O0 / GP_AO[0], 0.60)
        pEdge = sb.m('FLOORED_MODULO', kz_ - 1.0, 100.0) * 0.01 - sb.abs((ky_ - 1.0) * 0.01 - 300.0)
        hE = sb.max(fw * 0.5, 0.0006)
        rag = sb.vnoise(pxz * 16.0 + (3.0, 3.0, 0.0)) * 0.55 + sb.vnoise(pxz * 47.0 + (9.0, 9.0, 0.0)) * 0.30 + sb.vnoise(pxz * 130.0) * 0.15
        ew = (0.008 + gpWear * 0.045) * (0.35 + rag * 1.3)
        lost = sb.clamp((ew - pEdge) / (hE * 2.0) + 0.5, 0.0, 1.0)
        lost = sb.max(lost, sb.step(0.72 - gpWear * 0.25, sb.vnoise(pxz * 90.0 + (17.0, 17.0, 0.0))) * sb.smoothstep(ew * 2.2, ew, pEdge))
        expo = sb.max(expo, lost * pvalid)
        film = film * (1.0 - sb.smoothstep(0.18, 0.05, pEdge) * 0.10 * pvalid)
        bareA = asphU * (A0 / GP_MEAN[0]) * sb.mix(1.0, O0 / GP_AO[0], 0.65)
        pa = sb.mix(film, bareA, expo)
        paintK = 1.0 - expo
        ng_ = float(P.get('night', 0.05))
        lbP = sb.c(tuple(float(v) + (1.0 - float(v)) * ng_ for v in (P.get('lb14Paint') or [1, 1, 1])))
        pa = pa * sb.mix(sb.vec(1.0), lbP, paintK * (1.0 - gpWear * 0.45))
        # (round 2) the glass beads after dark: the intact film throws the lamps' light back (the web: x (1 + night x film
        # x 0.7), at most 0.95)
        pa = sb.min(pa * (1.0 + float(P.get('night', 0.05)) * 0.7 * paintK), 0.95)
        rP = sb.mix(sb.mix(0.62, 0.50, rubber), sb.mix(1.0, sb.split(N0)[2] / GP_RGH[0], 0.5) * 0.90, expo)
        sP = sb.mix(0.50, 1.0, paintK)
        _s3.out('pa', pa)
        _s3.out('rP', rP)
        _s3.out('sP', sP)
        _s3.out('expo', expo)
    pa = _s3.o['pa']
    rP = _s3.o['rP']
    sP = _s3.o['sP']
    expo = _s3.o['expo']
    _s4 = Sub(b, 'BX_GndWalk')
    with _s4 as sb:
        # ---- the sidewalk (1; plaza pavers 16 and gravel 17 take it too): 5 ft flags on the street grid, per-flag pour
        fq = sb.mix(gG, sb.v3(gGy, gGx), gAx)
        fqx, fqy, _ = sb.split(fq)
        sco = gG / 1.524
        sid = sb.floor(sco)
        slab = sb.h2(sid)
        sfr = sb.fract(sco)
        jm = sb.min(sfr, sb.vec(1.0) - sfr) * 1.524
        jmx, jmy, _ = sb.split(jm)
        swAx = sb.smoothstep(0.38, 0.62, sb.vnoise(gG * 0.0075 + (41.0, 41.0, 0.0)))
        jWx, jWy = sb.mix(1.0, 0.42, swAx), sb.mix(0.42, 1.0, swAx)
        hj = sb.max(fw * 0.5, 0.0005)
        jc = sb.max(band(sb, jmx, 0.005, hj) * jWx, band(sb, jmy, 0.005, hj) * jWy)
        jh = sb.max(band(sb, jmx, 0.035, hj) * jWx, band(sb, jmy, 0.035, hj) * jWy)
        wk = sb.mix((0.496, 0.437, 0.261), (0.571, 0.501, 0.299), n1)
        wk = wk * (1.0 - jc * 0.74) * (1.0 - jh * 0.10)
        wk = wk * (0.86 + slab * 0.26)
        wk = wk * sb.mix((1.016, 0.998, 0.972), (0.978, 0.992, 1.018), sb.h2(sid + (11.7, 11.7, 0.0)))
        worn = sb.gt(sb.h2(sid + (5.1, 5.1, 0.0)), 0.72)
        srep = sb.h2(sid + (15.3, 15.3, 0.0))
        wk = sb.mix(wk, (0.693, 0.627, 0.400), sb.lt(srep, 0.07) * 0.55)
        wk = sb.mix(wk, (0.168, 0.152, 0.124), sb.gt(srep, 0.978) * 0.80)
        wk = wk * (1.0 - sb.smoothstep(0.5, 0.9, sb.fbmG(pxz * 0.05 + (4.2, 4.2, 0.0))) * 0.08)
        off = sb.v3(sb.h2(sid + (1.7, 1.7, 0.0)), sb.h2(sid + (9.2, 9.2, 0.0)))
        stW2 = fq / 2.0 + off
        stW3 = fq / 1.6 + off
        cA2, _ = sb.image(fA(2), stW2, srgb=True)
        cN2, aN2 = sb.image(fN(2), stW2, srgb=False)
        cA3, _ = sb.image(fA(3), stW3, srgb=True)
        cN3, aN3 = sb.image(fN(3), stW3, srgb=False)
        rW = sb.mix(cA2 / GP_MEAN[2] * sb.mix(1.0, aN2 / GP_AO[2], 0.6), sb.mix(sb.vec(1.0), cA3 / GP_MEAN[3] * sb.mix(1.0, aN3 / GP_AO[3], 0.6), 0.70), worn)
        wk = wk * rW
        ngw = float(P.get('night', 0.05))
        lbW = sb.c(tuple(float(v) + (1.0 - float(v)) * ngw for v in (P.get('lb14Walk') or [1.94, 1.70, 1.47])))
        wk = wk * lbW
        rWk = sb.clamp(0.9 * sb.mix(1.0, sb.mix(sb.split(cN2)[2] / GP_RGH[2], sb.split(cN3)[2] / GP_RGH[3], worn), 0.5), 0.45, 1.0)
        nW = sb.mix(cN2, cN3, worn)
        nWk = sb.mix(1.0, 0.70, worn)
        _s4.out('wk', wk)
        _s4.out('rWk', rWk)
        _s4.out('nW', nW)
        _s4.out('nWk', nWk)
        _s4.out('cA3', cA3)
    wk = _s4.o['wk']
    rWk = _s4.o['rWk']
    nW = _s4.o['nW']
    nWk = _s4.o['nWk']
    cA3 = _s4.o['cA3']
    _s5 = Sub(b, 'BX_GndKerb')
    with _s5 as sb:
        # ---- the granite kerb face (2): the (along the kerb, height) frame
        nx_, _, nz_ = sb.split(wn)
        ct = sb.normalize(sb.v3(-nz_, nx_) + (1e-5, 1e-5, 0.0))
        ctx_, cty_, _ = sb.split(ct)
        cs = px * ctx_ + pz * cty_
        stK = sb.v3(cs / 2.17, py / 2.17)
        cA4, _ = sb.image(fA(4), stK, srgb=True)
        cN4, _ = sb.image(fN(4), stK, srgb=False)
        blk = sb.h2(sb.v3(sb.floor(cs / 1.6), 4.1))
        kb = sb.vec(0.41) * (0.85 + blk * 0.30) * (1.0, 0.95, 0.88)
        ngk = float(P.get('night', 0.05))
        kb = kb * sb.mix(sb.vec(1.0), cA4 / GP_MEAN[4], 0.8) * tuple(c + (1.0 - c) * ngk for c in (1.44, 1.39, 1.31))
        rK = sb.clamp(0.82 * sb.mix(1.0, sb.split(cN4)[2] / GP_RGH[4], 0.4), 0.45, 1.0)
        _s5.out('kb', kb)
        _s5.out('rK', rK)
    kb = _s5.o['kb']
    rK = _s5.o['rK']
    # ---- the rest: grass, park paths, the terrain filler, brick (the pilot's tones over the worn concrete scan)
    gr = b.mix((0.050, 0.075, 0.028), (0.105, 0.135, 0.050), b.vnoise(pxz * 0.6)) * (0.85 + b.vnoise(pxz * 7.0) * 0.3)
    rest = b.mix((0.30, 0.27, 0.22), (0.36, 0.33, 0.27), n1) * b.mix(b.vec(1.0), cA3 / GP_MEAN[3], 0.6)
    rest = b.sel(isk(10), (0.30, 0.17, 0.11), rest)
    rest = b.sel(isk(9), (0.05, 0.22, 0.08), rest)
    rest = b.sel(isk(7, 8), b.mix((0.13, 0.11, 0.09), (0.17, 0.15, 0.12), n1) * (1.94, 1.70, 1.47), rest)
    # ---- combine the kinds; the road's calibration (LB14) and the ground's day trim (x 1.6 on vertical faces)
    ngs = float(P.get('night', 0.05))
    lbS = b.c(tuple(float(v) + (1.0 - float(v)) * ngs for v in (P.get('lb14StCal') or [1.94, 1.70, 1.47])))
    if TRIM_MODE == 'phys':
        # physical albedos: LB14's street calibration was fitted together with the 0.30 day trim (their product, ~0.56,
        # is the web's net); without the trim it goes too (the walk and kerb took theirs above: divided back out)
        lbS = b.c((1.0, 1.0, 1.0))
        wk = wk / tuple(float(v) + (1.0 - float(v)) * ngs for v in (P.get('lb14Walk') or [1.94, 1.70, 1.47]))
        kb = kb / tuple(c + (1.0 - c) * ngs for c in (1.44, 1.39, 1.31))
        rest = b.sel(isk(7, 8), rest / tuple(c + (1.0 - c) * ngs for c in (1.94, 1.70, 1.47)), rest)
    alb = a * lbS * kAsph + pa * kPaint + wk * kWalk + kb * kKerb + gr * kGrass + rest * kRest
    if TRIM_MODE != 'phys':
        # the ground's day trim and its vertical-face allowance; 'web' takes it relative to the road (the trim cancels)
        lt = float(P.get('night', 0.05))
        gk = (0.30 + 0.58 * lt) if TRIM_MODE == 'net' else ground_gain(lt) / ROAD_K   # (BX-FIN: ground_gain)
        alb = alb * gk * (1.0 + (1.0 - b.abs(wny)) * 0.60)
    rough = rA * kAsph + rP * kPaint + rWk * kWalk + rK * kKerb + 0.95 * (kGrass + kRest)
    spec = sA * kAsph + sP * kPaint + 0.8 * (kWalk + kKerb) + 0.5 * (kGrass + kRest)
    # normals: the scans' normal maps in the street-grid frame (asphalt and paint), the flag frame (walk)
    nA = (Nn * 2.0 - 1.0)
    nAx, nAy, _ = b.split(nA)
    tnS = b.mix(1.0, b.mix(0.40, 1.0, expo), kPaint)
    tAx, tAy = nAx * tnS, -nAy * tnS
    nWv = nW * 2.0 - 1.0
    nWx, nWy, _ = b.split(nWv)
    tWx, tWy = nWx * nWk, -nWy * nWk
    tWgx, tWgy = b.mix(tWx, tWy, gAx), b.mix(tWy, tWx, gAx)
    tgx = b.mix(tAx, tWgx, kWalk) * (kAsph + kPaint + kWalk)
    tgy = b.mix(tAy, tWgy, kWalk) * (kAsph + kPaint + kWalk)
    nW_ = b.smoothstep(2.2, 0.25, fw) * (1.0 - b.smoothstep(0.62, 0.30, b.abs(wny)))
    twx = (tgx * MG_A[0] + tgy * MG_B[0]) * nW_
    twz = (tgx * MG_A[1] + tgy * MG_B[1]) * nW_
    tl = b.max(b.length(b.v3(twx, twz)), 1e-4)
    k8 = b.min(0.8 / tl, 1.0)
    twx, twz = twx * k8, twz * k8
    tny = b.sqrt(b.max(1.0 - (twx * twx + twz * twz), 0.09))
    nrm3 = b.v3(twx, tny, twz)
    Nb = b.sock(b.geo().outputs['Normal'])
    flat = b.gt(b.abs(wny), 0.62)
    normal = b.normalize(b.mix(Nb, to_blender(b, nrm3), flat))
    dk = os.environ.get('BXGOUT')
    if dk:
        # inspection: an intermediate of the ground's branch instead of its albedo (with BXDBG=albedo)
        v = locals().get(dk)
        alb = v if (isinstance(v, X) and v.v) else b.vec(v)
    bsdf_out(b, mat, alb, rough, 0.0, normal, spec=spec * 0.5)
    return True


# ----------------------------------------------------------------------------------------------------------------------
# plain: the importer's material, its colour multiplied per vertex (aFkTr, three's vertex colour) as the web does
# ----------------------------------------------------------------------------------------------------------------------
def build_plain(mat, P):
    nt = mat.node_tree
    bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bs is None:
        return False
    b = B(nt)
    b.n = len(nt.nodes) + 40
    bc = bs.inputs['Base Color']
    lk = next((l for l in nt.links if l.to_socket == bc), None)
    src = b.sock(lk.from_socket, True) if lk else b.c(tuple(bc.default_value)[:3])
    k = src
    if P.get('fktr'):
        k = k * b.sock(b.attr('aFkTr').outputs['Vector'])
    if P.get('vc'):
        k = k * b.sock(b.attr('bxCol').outputs['Color'])
    if P.get('kit'):
        # a trimmed material (applyLightTrim): the --bxtrim factor (blender_nodes.trim_of)
        k = k * trim_of(P)
    if lk:
        nt.links.remove(lk)
    b.link(bc, k)
    return True


# ----------------------------------------------------------------------------------------------------------------------
# decal: the street-level decal atlas (city/decals.js: tags, wheat-paste posters, grime runs), alpha-blended
# ----------------------------------------------------------------------------------------------------------------------
def build_decal(mat, P, root_dir):
    t = (P.get('tex') or {}).get('map')
    if not t:
        return False
    nt = mat.node_tree
    nt.nodes.clear()
    b = B(nt)
    col, al = b.image(os.path.join(root_dir, t), b.uv('st'), srgb=True)
    alb = col * b.c(tuple(float(v) for v in (P.get('color') or [1, 1, 1])))
    alb = alb * trim_of(P)
    # paper and paint read a little satin where the alpha is solid (a poster, a piece), the grime runs matte
    rough = b.mix(0.95, 0.80, b.smoothstep(0.6, 0.95, al))
    bsdf_out(b, mat, alb, rough, 0.0, None, spec=0.4, alpha=al)
    try:
        mat.blend_method = 'BLEND'   # (EEVEE's; Cycles blends by the shader)
    except Exception:
        pass
    return True


# ----------------------------------------------------------------------------------------------------------------------
# sign: the kit's signs (fk/signKit.js): a face's slot in its atlas page (sgRect), a one-ink mask on its field colours
# (sgBg, sgFg) or an RGBA face, grime, roughness / metalness and the lamp (sgLamp x gain, day glow, lamp falloff, the red
# guard) per vertex; the contact-shadow / glow quads; the vertex-coloured glow parts. Emission is the web's linear value
# (LIGHT scales emission).
# ----------------------------------------------------------------------------------------------------------------------
def build_sign(mat, P, root_dir):
    nt = mat.node_tree
    nt.nodes.clear()
    b = B(nt)
    tn_ = min(1.0, max(0.0, (float(P.get('sgNight', 0.05)) - 0.12) / 0.43))
    onv = tn_ * tn_ * (3.0 - 2.0 * tn_)     # signKit's ON: smoothstep(0.12, 0.55, night)
    col0 = b.c(tuple(float(v) for v in (P.get('color') or [1, 1, 1])))
    sp = b.attr('sgP')
    sP = b.sock(sp.outputs['Color'])
    pX, pY, pZ = b.split(sP)
    pW = b.sock(sp.outputs['Alpha'], False)
    if P.get('glowvc'):
        vc = b.sock(b.attr('bxCol').outputs['Color'])
        lamp = b.sock(b.attr('sgLamp').outputs['Vector'])
        alb = col0 * vc * b.mix(1.0, pY, onv) * trim_of(P)
        em = lamp * b.max(pX, onv)
        bsdf_out(b, mat, alb, float(P.get('rough', 0.6)), float(P.get('metal', 0.0)), None, emission=(em, 1.0))
        return True
    t = (P.get('tex') or {}).get('map')
    if not t:
        return False
    uv = b.uv('st')
    ux, uy, _ = b.split(uv)
    ra = b.attr('sgRect')
    rc = b.sock(ra.outputs['Color'])
    rx, ry, rz = b.split(rc)
    rw = b.sock(ra.outputs['Alpha'], False)
    suv = b.v3(rx + ux * rz, ry + uy * rw)
    tc, ta = b.image(os.path.join(root_dir, t), suv, srgb=not P.get('mask'))
    lamp = b.sock(b.attr('sgLamp').outputs['Vector'])
    if P.get('shade'):
        # contact shadow by day (R), the letters' own glow on the wall after dark (G): dst' = glow + dst x (1 - shade)
        mr, mg, _ = b.split(tc)
        shade = mr * pX * (1.0 - 0.6 * onv)
        glow = lamp * mg * onv
        dk = b.node('ShaderNodeBsdfDiffuse')
        dk.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
        tp = b.node('ShaderNodeBsdfTransparent')
        mx = b.node('ShaderNodeMixShader')
        b.link(mx.inputs[0], b.clamp(shade, 0.0, 1.0))
        nt.links.new(tp.outputs[0], mx.inputs[1]); nt.links.new(dk.outputs[0], mx.inputs[2])
        emn = b.node('ShaderNodeEmission')
        b.link(emn.inputs['Color'], glow)
        ad = b.node('ShaderNodeAddShader')
        nt.links.new(mx.outputs[0], ad.inputs[0]); nt.links.new(emn.outputs[0], ad.inputs[1])
        out = b.node('ShaderNodeOutputMaterial', target='ALL')
        nt.links.new(ad.outputs[0], out.inputs['Surface'])
        return True
    sF = b.attr('sgF')
    fc = b.sock(sF.outputs['Color'])
    fx, fy, fz = b.split(fc)
    fW = b.sock(sF.outputs['Alpha'], False)
    # the lamp's falloff across a lit face (sgFallKv)
    ex = b.min(ux, 1.0 - ux) * fy
    ey = b.min(uy, 1.0 - uy)
    ee = b.smoothstep(0.0, 0.3, b.min(ex, ey))
    rows = 0.5 + b.cos((uy * fz - 0.5) * 6.2832) * 0.5
    fall = b.mix(1.0, (0.58 + ee * 0.42) * (0.86 + rows * 0.14) * 1.12, b.max(fx, 0.0))
    satK = float(P.get('sgSatK', 0.75))

    def satF(c):
        cr, cg, cb = b.split(c)
        sm = cr + cg + cb
        return 1.0 - b.smoothstep(0.5, 0.9, cr / b.max(sm, 1e-4)) * satK
    if P.get('mask'):
        cov = b.split(tc)[0]
        bg = b.sock(b.attr('sgBg').outputs['Vector'])
        fg = b.sock(b.attr('sgFg').outputs['Vector'])
        scol = b.mix(bg, fg, cov)
        alb = col0 * scol
        alb = alb * (1.0 - pY * (b.smoothstep(0.3, 0.0, uy) * 0.8 + b.smoothstep(0.86, 1.0, uy) * 0.45))
        alpha = cov if P.get('decal') else None
        emc = b.mix(fg * cov, scol, pX)
        em = emc * lamp * b.max(pZ, onv) * fall * satF(b.mix(fg, scol, pX))
    else:
        alb = col0 * tc
        alpha = ta if P.get('decal') else None
        em = tc * lamp * ta * b.max(pZ, onv) * fall * satF(tc)
    alb = alb * trim_of(P)
    bsdf_out(b, mat, alb, pW, fW, None, alpha=alpha, emission=(em, 1.0))
    return True


# ----------------------------------------------------------------------------------------------------------------------
# the hook
# ----------------------------------------------------------------------------------------------------------------------
def read_tags(usd_path):
    """material name -> its `bx` parameters, read off looks.usdc next to the root (no stage composition)."""
    from pxr import Sdf
    d = os.path.dirname(os.path.abspath(usd_path))
    lay = Sdf.Layer.FindOrOpen(os.path.join(d, 'looks.usdc'))
    out = {}
    if not lay:
        return out
    looks = lay.GetPrimAtPath('/World/Looks')
    if not looks:
        return out
    for ps in looks.nameChildren:
        cd = ps.customData
        if 'bx' in cd:
            try:
                out[ps.name] = json.loads(cd['bx'])
            except Exception:
                pass
    return out


def lens_pixel_angle(sc, width=None):
    cam = sc.camera
    if not cam or cam.type != 'CAMERA':
        return 4.3e-4
    W = max(1, int(width) if width else sc.render.resolution_x * sc.render.resolution_percentage // 100)
    ax = cam.data.angle_x if hasattr(cam.data, 'angle_x') else cam.data.angle
    return 2.0 * math.tan(ax * 0.5) / W


def apply(sc, usd_path, root=None, opt=None):
    global ORIGIN, PIXA, TRIM_MODE
    t0 = time.time()
    root = root or {}
    og = root.get('origin') or [0.0, 0.0, 0.0]
    ORIGIN = [float(og[0]), float(og[1]), float(og[2])]
    # (the hook runs before the tool sets the render size: the width from its --res)
    res = opt('res', None) if opt else None
    PIXA = lens_pixel_angle(sc, int(str(res).split('x')[0]) if res else None)
    # R3-PHYS: physical albedos by default (blender_light --light phys); the web-matched baseline keeps 'web'
    _dt = 'web' if (opt and str(opt('light', 'phys')) == 'web') else 'phys'
    TRIM_MODE = os.environ.get('BXTRIM') or (opt('bxtrim', _dt) if opt else _dt) or _dt
    tags = read_tags(usd_path)
    root_dir = os.path.dirname(os.path.abspath(usd_path))
    set_road_k(tags)
    set_untrim_k(tags)
    n = {}
    fail = {}
    tsec = {}
    only = [k for k in os.environ.get('BXONLY', '').split(',') if k]
    for mat in list(bpy.data.materials):
        if mat.get('bx') or not mat.use_nodes:
            continue
        P = tags.get(mat.name.split('.')[0])
        if not P:
            continue
        kind = P.get('kind')
        if only and kind not in only:
            continue
        tk = time.time()
        try:
            ok = {'pbr': lambda: build_pbr(mat, P, root_dir), 'vk': lambda: build_vk(mat, P),
                  'ground': lambda: build_ground(mat, P, root_dir), 'plain': lambda: build_plain(mat, P),
                  'decal': lambda: build_decal(mat, P, root_dir), 'sign': lambda: build_sign(mat, P, root_dir),
                  'untrim': lambda: build_untrim(mat, P)}.get(kind, lambda: False)()
        except Exception as e:
            import traceback
            traceback.print_exc()
            fail[kind] = fail.get(kind, 0) + 1
            ok = False
        tsec[kind] = tsec.get(kind, 0.0) + (time.time() - tk)
        if ok:
            mat['bx'] = kind
            n[kind] = n.get(kind, 0) + 1
    # the ground casts no shadows (its stacked layers; blender_render.py's rule for the per-kind ground materials)
    ng = 0
    for ob in sc.objects:
        if ob.type == 'MESH' and any(m and m.get('bx') == 'ground' for m in ob.data.materials):
            ob.visible_shadow = False
            ng += 1
    return {'materials': n, 'failed': fail, 'tags': len(tags), 'ground_objects': ng, 'secs': round(time.time() - t0, 1),
            'secs_by_kind': {k: round(v, 1) for k, v in tsec.items()},
            'trim': TRIM_MODE, 'pixa': PIXA}


def settings(ctx):
    """(round 2) after every track's after_import: BX-TREES' materials (m['bxt']) and BX-WIN's facades (bxw_fac*) are lit
    untrimmed in the web, so their colours take UNTRIM_K (blender_nodes' value scale), once each."""
    opt = ctx.get('opt')
    if opt and str(opt('bxnodes', '1')) == '0':
        return
    if TRIM_MODE == 'phys':
        return
    n = {'trees': 0, 'win': 0}
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.get('bx_u'):
            continue
        if mat.get('bxt'):
            key = 'trees'
        elif re.match(r'bxw_(\w+_)?fac\d+$', mat.name.split('.')[0]):   # BX-FIN: the path-region bakes are bxw_<shot>_fac<k>
            key = 'win'
        else:
            continue
        scale_bsdf_colors(mat.node_tree, UNTRIM_K)
        mat['bx_u'] = UNTRIM_K
        n[key] += 1
    if 'T' in ctx:
        ctx['T']['bxmat_untrim'] = {'k': round(UNTRIM_K, 3), **n}
    print('BX-MAT untrim ' + json.dumps({'k': round(UNTRIM_K, 3), **n}))


def after_import(ctx):
    """docs/notes/ar34-bx-seq.md: the USD root is imported (or a .blend reopened); rebuild the tagged materials."""
    usd = ctx.get('usd') or ''
    if usd.endswith('.blend'):
        return
    opt = ctx.get('opt')
    if opt and str(opt('bxnodes', '1')) == '0':
        return
    r = apply(ctx['sc'], usd, ctx.get('root') or {}, opt)
    try:
        r['glass'] = apply_glass(ctx['sc'], ctx.get('root') or {}, opt)   # BX-DUSK: the pbr glass, b3N, bid3 walls (dusk only)
    except Exception:
        import traceback
        traceback.print_exc()
        r['glass'] = 'failed'
    if 'T' in ctx:
        ctx['T']['bxmat'] = r
    print('BX-MAT nodes ' + json.dumps(r))


# ----------------------------------------------------------------------------------------------------------------------
# BX-DUSK (2026-10-03): the PBR library's glass (mat/pbrLib.js makeGlass: glass_tower*, glass_vision*, glass_grey ...).
# usd_mat.py gives these no `bx` family, so the importer's UsdPreviewSurface drew the pane's TINT (0.40-0.77) as an opaque
# diffuse albedo at roughness 0.03; the web draws an opaque unit as its BODY (#1b1d1f-#434e4c on the State Office
# Building) lit by the ambient, x (1 - F), plus the sky / street mirror x tint x F (Schlick, f0 0.08-0.18), and a
# see-through pane as tint x 0.04 over what is behind it. Under the dusk rig the tint read as sky-blue window bands
# (t7StreetGlide f072-f107). Also the bid3 wrappers' lit emission (fk/custom/bid3Util.js towerGlass / lit: emissive x
# b3N = the night level, 0.55 at dusk) was exported at its day value x 1: near-white lit windows.
# Gate: BXGLASS unset = the take root's time is dusk (golden and night stay as they were); BXGLASS=1 always, 0 never.
def _glass_on(root):
    g = os.environ.get('BXGLASS', '')
    if g in ('0', '1'):
        return g == '1'
    return str((root or {}).get('time', '')).lower() == 'dusk'


def _harvest_mats(root, opt):
    H = (opt('harvest') if opt else None) or (root or {}).get('harvest')
    if not H:
        return {}
    try:
        with open(os.path.join(H, 'manifest.json')) as f:
            M = json.load(f)
    except Exception:
        return {}
    return {int(d['id']): d for d in M.get('mats', []) if 'id' in d}


def _schlick_ior(f0):
    s = math.sqrt(max(1e-4, min(0.9, float(f0))))
    return (1.0 + s) / (1.0 - s)


def build_pbrglass(mat, d, ex):
    """the web's pbr glass as Cycles closures: opaque units = (body diffuse + emission) x (1 - F) + tinted mirror x F;
    see-through panes = a dark tinted film at the pane's opacity over Transparent, the near-neutral mirror x F."""
    U = d.get('uni') or {}
    nm = (d.get('name') or '')[4:]
    nt = mat.node_tree
    tint, em = ex['tint'], ex['em']
    opq = not d.get('transparent')
    room = opq and nm.startswith('glass_vision')
    f0 = float(U.get('pgF0', 0.08) if not isinstance(U.get('pgF0'), dict) else 0.08)
    rough = float(U.get('pgRough', 0.03) if not isinstance(U.get('pgRough'), dict) else 0.03)
    bv = (U.get('pgBody') or {}).get('vec') or [0.0144, 0.0176, 0.0212]
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = _schlick_ior(f0)
    gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = max(0.0, rough)
    mx = max(max(tint), 1e-3)
    tn = tint if opq else tuple(1.0 + (t / mx - 1.0) * 0.3 for t in tint)
    gl.inputs['Color'].default_value = (tn[0], tn[1], tn[2], 1.0)
    if opq:
        k = UNTRIM_K   # the body is lit untrimmed in the web: on this module's value scale (blender_nodes.trim_of)
        if room:
            # the vision glass's office (pbrLib.js pgRoom) at dusk: the lit share of the rooms (mix(0.85, lit, night)) as a
            # warm mean glow through the coated unit (tint, transmission); the body x 0.1 as the web's outgoingLight x 0.1
            tr = float(U.get('pgTr', 0.6) if not isinstance(U.get('pgTr'), dict) else 0.6)
            gn = tuple(t / mx for t in tint)
            g = 0.06 * tr
            em = tuple(em[i] + (1.0, 0.85, 0.66)[i] * g * gn[i] for i in range(3))
            body = tuple(min(0.92, v * 0.1 * k) for v in bv)
        else:
            body = tuple(min(0.92, v * k) for v in bv)
        df = N.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (body[0], body[1], body[2], 1.0)
        s1 = df.outputs['BSDF']
        if max(em) > 1e-6:
            es = N.new('ShaderNodeEmission'); es.inputs['Color'].default_value = (em[0], em[1], em[2], 1.0); es.inputs['Strength'].default_value = 1.0
            ad = N.new('ShaderNodeAddShader'); L.new(df.outputs['BSDF'], ad.inputs[0]); L.new(es.outputs['Emission'], ad.inputs[1])
            s1 = ad.outputs['Shader']
    else:
        op = max(0.0, min(0.95, float(d.get('opacity', 0.3)) + 0.012))
        tp = N.new('ShaderNodeBsdfTransparent'); tp.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        df = N.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (tint[0] * 0.065, tint[1] * 0.065, tint[2] * 0.065, 1.0)
        m1 = N.new('ShaderNodeMixShader'); m1.inputs['Fac'].default_value = op
        L.new(tp.outputs['BSDF'], m1.inputs[1]); L.new(df.outputs['BSDF'], m1.inputs[2])
        s1 = m1.outputs['Shader']
    m2 = N.new('ShaderNodeMixShader')
    L.new(fr.outputs['Fac'], m2.inputs['Fac']); L.new(s1, m2.inputs[1]); L.new(gl.outputs['BSDF'], m2.inputs[2])
    L.new(m2.outputs['Shader'], out.inputs['Surface'])
    if not opq:
        try: mat.surface_render_method = 'BLENDED'
        except Exception: pass
    return True


def apply_glass(sc, root, opt):
    """BX-DUSK: rebuild every pbr glass material and scale the bid3 lit emitters by b3N (dusk only, see _glass_on)."""
    if not _glass_on(root):
        return {'on': False}
    t0 = time.time()
    D = _harvest_mats(root, opt)
    if not D:
        return {'on': True, 'harvest': 'no manifest'}
    n = {'tower': 0, 'vision': 0, 'pane': 0, 'b3N': 0}
    for mat in list(bpy.data.materials):
        if not mat.use_nodes or mat.get('bx') or mat.get('bxg'):
            continue
        mm = re.match(r'm(\d+)(?:_|\.|$)', mat.name)
        if not mm:
            continue
        d = D.get(int(mm.group(1)))
        if not d:
            continue
        U = d.get('uni') or {}
        nm = d.get('name') or ''
        bs = next((x for x in mat.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if bs is None:
            continue
        ec = bs.inputs['Emission Color']; es = bs.inputs['Emission Strength']
        b3 = U.get('b3N')
        b3 = float(b3) if b3 is not None and not isinstance(b3, dict) else None
        if nm.startswith('pbr:glass'):
            bc = bs.inputs['Base Color']
            tint = tuple(bc.default_value[:3]) if not bc.is_linked else tuple((d.get('color') or [1, 1, 1])[:3])
            em = tuple(v * float(es.default_value) for v in ec.default_value[:3]) if not ec.is_linked and not es.is_linked else (0.0, 0.0, 0.0)
            if b3 is not None:
                em = tuple(v * b3 for v in em)
            build_pbrglass(mat, d, {'tint': tint, 'em': em})
            mat['bx'] = 'glass'; mat['bxg'] = 1
            n['vision' if nm.startswith('pbr:glass_vision') else ('pane' if d.get('transparent') else 'tower')] += 1
        elif b3 is not None and not es.is_linked and es.default_value > 0:
            es.default_value *= b3
            mat['bxg'] = 1
            n['b3N'] += 1
    # the bid3 walls (fk/custom/bid3Util.js wallMat: the State Office Building's frame ...): the web's net albedo is the
    # facade value curve pow(map, 1.22) x 0.88 (its trim divided out); build_plain gave map x trim_of
    n['wall'] = 0
    for mat in list(bpy.data.materials):
        if mat.get('bx') != 'plain' or mat.get('bxg') or not mat.use_nodes:
            continue
        mm = re.match(r'm(\d+)(?:_|\.|$)', mat.name)
        d = D.get(int(mm.group(1))) if mm else None
        U = (d or {}).get('uni') or {}
        if 'b3cN' not in U:
            continue
        nt = mat.node_tree
        bs = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        lk = next((l for l in nt.links if bs is not None and l.to_socket == bs.inputs['Base Color']), None)
        if lk is None:
            continue
        lt = float(U.get('ltNight', 0.55)) if not isinstance(U.get('ltNight'), dict) else 0.55
        lt = 0.30 + 0.58 * lt
        c = trim_of({'lt': lt})
        if c <= 0 or TRIM_MODE == 'phys':
            continue
        src = lk.from_socket
        nt.links.remove(lk)
        v1 = nt.nodes.new('ShaderNodeVectorMath'); v1.operation = 'SCALE'; v1.inputs[3].default_value = 1.0 / c
        gm = nt.nodes.new('ShaderNodeGamma'); gm.inputs['Gamma'].default_value = 1.22
        v2 = nt.nodes.new('ShaderNodeVectorMath'); v2.operation = 'SCALE'
        v2.inputs[3].default_value = 0.88 / (lt * ROAD_K) if TRIM_MODE == 'web' else 0.88
        nt.links.new(src, v1.inputs[0]); nt.links.new(v1.outputs[0], gm.inputs['Color'])
        nt.links.new(gm.outputs['Color'], v2.inputs[0]); nt.links.new(v2.outputs[0], bs.inputs['Base Color'])
        mat['bxg'] = 1
        n['wall'] += 1
    return {'on': True, **n, 'secs': round(time.time() - t0, 1)}
