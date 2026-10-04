# BX-WIN (AR34 BX, 2026-10-02): the windows in Cycles. Runs inside Blender after the USD import (blender_render.py's marked
# line, or BX-SEQ's hook list: after_import(ctx)). Owner on the first Cycles frames: the windows were "too basic".
#
# 1. The tile facades (usd_windows.py: one mesh per bake atlas, material bxw_fac<k>): the baked look of the page's facade
#    shader (harvest_facades.mjs: albedo, roughness, window glass, room lit, emission) between the windows, and every window of
#    the generic grid drawn per pixel with the web's own formulas (world/materials.js makeFacadeMaterial): the bay layout
#    (bayN, sideM, winW, floorH), the opening per style and WL11's per-bay jitter (wlh, bit-exact), the bake's own verdict
#    whether the web drew a window in that cell and whether its room is lit (read at the opening's centre), the glass plane
#    REC behind the wall (0.15 m punched, 0.045 m curtain wall) seen with parallax (the reveal's soffit, jambs and sill
#    where the ray leaves the opening), the sashes (stiles, meeting rail, loft muntins, WL11's replaced units), the room box
#    (RW = span x winW, RH, RD = 1.55 / 2.4 x RH + 1.2 m) ray-marched per pixel and textured with CC0 interior HDRIs
#    (Poly Haven; docs/notes/ar34-bx-win.md lists them), lit by the web's lit share (the bake) with its light colours, day
#    ambience and glow, side curtains, roller shades (residential, WL11 per-flat presence and crooked hems) and venetians
#    (office), the dirt film and glass tints, real Fresnel reflection (punched F0 0.075; the curtain-wall families' F0,
#    plate roughness and reflection tint) with a per-pane plate tilt.
# 2. The facade kit's window glass (fk:int_winglass, int_shopglass): thin glass (straight transmission, Fresnel mirror at the
#    shader's own f0 and roughness, its dirt film at its opacity), so the kit's modelled rooms, blinds and sheers show.
# 3. The kit's rooms: lit rooms and blinds glow by the night level (nightEmit), shops and sheers by their day / night levels
#    (selfLit).
# Emission calibration belongs to BX-LIGHT: every window emission above passes through the node group BXW_Params
#   bpy.data.node_groups['BXW_Params'].nodes['Emit'].outputs[0].default_value   (default 1.0 = the web's own radiance)
#   bpy.data.node_groups['BXW_Params'].nodes['Night'].outputs[0].default_value  (default the take's night level)
# Flags (blender_render.py argv): --nowin (all off), --winemit <k>, --winnight <n>, --winkit 0 (leave the kit glass),
#   --winrooms <png> (the room atlas), --windebug 1 (the window mask as emission)
import bpy, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOMS_DEFAULT = '/data0/projectnyc_aux/assets/bxwin/rooms_atlas.png'


class NB:
    """a tiny expression builder on a node tree: Python floats fold, sockets make Math nodes."""

    def __init__(self, nt):
        self.nt = nt
        self.n = 0

    def new(self, kind):
        nd = self.nt.nodes.new(kind)
        self.n += 1
        nd.location = (200 * (self.n // 50), -70 * (self.n % 50))
        return nd

    def put(self, sock, v):
        if isinstance(v, (int, float)):
            sock.default_value = float(v)
        elif isinstance(v, tuple):
            sock.default_value = v
        else:
            self.nt.links.new(v, sock)

    @staticmethod
    def num(v):
        return isinstance(v, (int, float))

    def m(self, op, a, b=0.0, c=0.0):
        nd = self.new('ShaderNodeMath')
        nd.operation = op
        self.put(nd.inputs[0], a)
        self.put(nd.inputs[1], b)
        self.put(nd.inputs[2], c)
        return nd.outputs[0]

    def add(self, a, b):
        if self.num(a) and self.num(b): return a + b
        if self.num(b) and b == 0: return a
        if self.num(a) and a == 0: return b
        return self.m('ADD', a, b)

    def sub(self, a, b):
        if self.num(a) and self.num(b): return a - b
        if self.num(b) and b == 0: return a
        return self.m('SUBTRACT', a, b)

    def mul(self, a, b):
        if self.num(a) and self.num(b): return a * b
        if (self.num(a) and a == 0) or (self.num(b) and b == 0): return 0.0
        if self.num(b) and b == 1: return a
        if self.num(a) and a == 1: return b
        return self.m('MULTIPLY', a, b)

    def div(self, a, b):
        if self.num(a) and self.num(b): return a / b
        if self.num(b): return self.mul(a, 1.0 / b)
        return self.m('DIVIDE', a, b)

    def mn(self, a, b): return min(a, b) if self.num(a) and self.num(b) else self.m('MINIMUM', a, b)
    def mx(self, a, b): return max(a, b) if self.num(a) and self.num(b) else self.m('MAXIMUM', a, b)
    def floor(self, a): return float(math.floor(a)) if self.num(a) else self.m('FLOOR', a)
    def fract(self, a): return a - math.floor(a) if self.num(a) else self.m('FRACT', a)
    def absf(self, a): return abs(a) if self.num(a) else self.m('ABSOLUTE', a)
    def sqrt(self, a): return math.sqrt(a) if self.num(a) else self.m('SQRT', a)
    def sin(self, a): return math.sin(a) if self.num(a) else self.m('SINE', a)
    def atan2(self, a, b): return self.m('ARCTAN2', a, b)
    def asin(self, a): return self.m('ARCSINE', a)
    def fmod(self, a, b): return math.fmod(a, b) if self.num(a) and self.num(b) else self.m('MODULO', a, b)
    def fmodF(self, a, b): return a - b * math.floor(a / b) if self.num(a) and self.num(b) else self.m('FLOORED_MODULO', a, b)
    def lt(self, a, b): return (1.0 if a < b else 0.0) if self.num(a) and self.num(b) else self.m('LESS_THAN', a, b)
    def gt(self, a, b): return (1.0 if a > b else 0.0) if self.num(a) and self.num(b) else self.m('GREATER_THAN', a, b)
    def ge(self, a, b): return self.sub(1.0, self.lt(a, b))
    def le(self, a, b): return self.sub(1.0, self.gt(a, b))
    def eq(self, a, b, eps=0.5): return self.m('COMPARE', a, b, eps)
    def clamp(self, x, lo, hi): return self.mn(self.mx(x, lo), hi)
    def mix(self, a, b, t): return self.add(a, self.mul(self.sub(b, a), t))
    def neg(self, a): return self.mul(a, -1.0)

    def smooth(self, e0, e1, x):
        """GLSL smoothstep(e0, e1, x) (e0 > e1 allowed: the falling edge)."""
        if self.num(x) and self.num(e0) and self.num(e1):
            t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
            return t * t * (3 - 2 * t)
        t = self.clamp(self.div(self.sub(x, e0), self.sub(e1, e0)), 0.0, 1.0)
        return self.mul(self.mul(t, t), self.sub(3.0, self.mul(2.0, t)))

    # ---- the web's hashes
    def hash12(self, x, y):
        """world/materials.js hash12 (Hoskins, sine-free): fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33)."""
        a = self.fract(self.mul(x, 0.1031)); b = self.fract(self.mul(y, 0.1031))
        d = self.add(self.add(self.mul(a, self.add(b, 33.33)), self.mul(b, self.add(a, 33.33))), self.mul(a, self.add(a, 33.33)))
        ad = self.add(a, d); bd = self.add(b, d)
        return self.fract(self.mul(self.add(ad, bd), ad))

    def wlh(self, a, b):
        """WL11's integer LCG mod 4093 (exact in float32)."""
        s = self.fmod(self.add(self.add(self.mul(a, 127.0), self.mul(b, 311.0)), 7.0), 4093.0)
        s = self.fmod(self.add(self.mul(s, s), 1153.0), 4093.0)
        s = self.fmod(self.add(self.mul(s, 137.0), 59.0), 4093.0)
        s = self.fmod(self.add(self.mul(s, s), 2411.0), 4093.0)
        return self.mul(s, 1.0 / 4093.0)

    def wlsg(self, a, b): return self.sub(self.mul(self.wlh(a, b), 2.0), 1.0)

    # ---- vectors as (x, y, z) tuples of scalars
    def v3(self, sock):
        nd = self.new('ShaderNodeSeparateXYZ'); self.put(nd.inputs[0], sock)
        return (nd.outputs[0], nd.outputs[1], nd.outputs[2])

    def comb(self, x, y, z):
        nd = self.new('ShaderNodeCombineXYZ')
        self.put(nd.inputs[0], x); self.put(nd.inputs[1], y); self.put(nd.inputs[2], z)
        return nd.outputs[0]

    def vmix(self, a, b, t): return tuple(self.mix(a[i], b[i], t) for i in range(3))
    def vmul(self, a, k): return tuple(self.mul(a[i], k if not isinstance(k, tuple) else k[i]) for i in range(3))
    def vadd(self, a, b): return tuple(self.add(a[i], b[i]) for i in range(3))
    def dot(self, a, b): return self.add(self.add(self.mul(a[0], b[0]), self.mul(a[1], b[1])), self.mul(a[2], b[2]))


def _params(night, emit):
    """BXW_Params: the window emission scale (BX-LIGHT's) and the night level, one place for every material."""
    # (Trim: BX-MAT's trim convention (blender_nodes.trim_of / wall_k) for the facades' base colour; emission is never trimmed)
    ng = bpy.data.node_groups.get('BXW_Params')
    if ng is None:
        ng = bpy.data.node_groups.new('BXW_Params', 'ShaderNodeTree')
        for nm in ('Emit', 'Night', 'Trim'):
            ng.interface.new_socket(nm, in_out='OUTPUT', socket_type='NodeSocketFloat')
        go = ng.nodes.new('NodeGroupOutput')
        for i, nm in enumerate(('Emit', 'Night', 'Trim')):
            v = ng.nodes.new('ShaderNodeValue'); v.name = nm; v.label = nm
            v.outputs[0].default_value = 1.0
            ng.links.new(v.outputs[0], go.inputs[i])
    ng.nodes['Emit'].outputs[0].default_value = float(emit)
    ng.nodes['Night'].outputs[0].default_value = float(night)
    return ng


def _img(path, colorspace, alpha=False):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = colorspace
    im.alpha_mode = 'NONE' if not alpha else 'STRAIGHT'
    return im


def _tex(b, image, vec, interp='Linear'):
    nd = b.new('ShaderNodeTexImage'); nd.image = image; nd.interpolation = interp; nd.extension = 'EXTEND'
    b.put(nd.inputs['Vector'], vec)
    return nd


def _grid(b):
    """the generic grid's quantities from the per-face facade data (both groups build it: node groups cannot share values)."""
    # inputs: the atlas uv, the facade metres, the per-face facade data
    uvA = b.new('ShaderNodeUVMap'); uvA.uv_map = 'st'
    uvF = b.new('ShaderNodeUVMap'); uvF.uv_map = 'fst'
    st = b.v3(uvA.outputs['UV']); fs = b.v3(uvF.outputs['UV'])
    def attr(name):
        a = b.new('ShaderNodeAttribute'); a.attribute_type = 'GEOMETRY'; a.attribute_name = name
        return a
    fa1 = b.v3(attr('fa1').outputs['Vector']); fa2 = b.v3(attr('fa2').outputs['Vector']); fa3 = b.v3(attr('fa3').outputs['Vector']); fa4 = b.v3(attr('fa4').outputs['Vector'])
    fcol = b.v3(attr('fcol').outputs['Vector'])
    u, v = fs[0], fs[1]
    floorH, winW = b.mx(fa1[0], 0.5), b.mx(fa1[1], 0.3)
    style, bldgH = fa2[0], fa2[1]
    cvar = b.div(b.floor(b.add(b.mul(fa3[0], 1024.0), 0.5)), 1024.0)
    wallLen = b.mx(fa3[2], 0.01)
    wallSeed = b.div(b.floor(b.add(b.mul(fa4[0], 128.0), 0.5)), 128.0)
    doorPack, bkd = fa4[1], fa4[2]
    # ---- the grid (makeFacadeMaterial, the !blind wall branch)
    isWall = b.gt(bkd, 0.0)
    g1 = b.mul(b.gt(style, 2.5), b.lt(style, 3.5)); g2 = b.mul(b.gt(style, 10.5), b.lt(style, 11.5))
    glassS = b.mx(g1, g2)
    loftS = b.mul(b.gt(style, 5.5), b.lt(style, 7.5))
    sidingS = b.mul(b.gt(style, 13.5), b.lt(style, 14.5))
    condoS = b.mul(b.gt(style, 14.5), b.lt(style, 15.5))
    resi = b.mx(b.lt(style, 2.5), b.mx(b.mul(b.gt(style, 4.5), b.lt(style, 5.5)), b.gt(style, 11.5)))
    bayN = b.floor(b.div(b.sub(wallLen, 0.44), winW))
    sideM = b.mul(b.sub(wallLen, b.mul(b.mx(bayN, 0.0), winW)), 0.5)
    cuC = b.div(b.sub(u, sideM), winW); cvC = b.div(v, floorH)
    fx = b.fract(cuC); fy = b.fract(cvC); cellU = b.floor(cuC); cellV = b.floor(cvC)
    cellUS = b.add(cellU, b.mul(wallSeed, 37.0))
    inBay = b.mul(b.mul(b.gt(bayN, 0.5), b.ge(cuC, 0.0)), b.lt(cuC, bayN))
    def pick(base, gl, lo, si, co):
        return b.add(base, b.add(b.add(b.mul(glassS, gl - base), b.mul(loftS, lo - base)), b.add(b.mul(sidingS, si - base), b.mul(condoS, co - base))))
    x0 = pick(0.2, 0.05, 0.1, 0.30, 0.10); x1 = pick(0.8, 0.95, 0.9, 0.70, 0.90)
    y0 = pick(0.3, 0.08, 0.14, 0.28, 0.16); y1 = pick(0.88, 0.96, 0.92, 0.80, 0.94)
    # WL11: the per-bay jitter, the door bay pinned
    cvI = b.floor(b.add(b.mul(fa3[0], 1024.0), 0.5))
    wlDC = b.mix(-1.0, b.sub(b.floor(b.div(doorPack, 8.0)), 1.0), b.ge(doorPack, 8.0))
    wlPin = b.sub(1.0, b.eq(cellU, wlDC, 0.25))
    bk = b.add(b.clamp(cellU, 0.0, 4090.0), 1.0)
    off = b.mul(b.mul(b.wlsg(b.add(cvI, 17.0), bk), 0.028), wlPin)
    wsc = b.add(1.0, b.mul(b.mul(b.wlsg(b.add(cvI, 53.0), bk), 0.026), wlPin))
    bkv = b.add(b.add(b.fmodF(cellU, 64.0), b.mul(b.fmodF(cellV, 64.0), 64.0)), 1.0)
    fh = b.div(0.02, b.mx(floorH, 2.0))
    sJ = b.mul(b.wlsg(b.add(cvI, 89.0), bkv), fh); lJ = b.mul(b.wlsg(b.add(cvI, 131.0), bkv), fh)
    x0 = b.add(b.add(0.5, b.mul(b.sub(x0, 0.5), wsc)), off); x1 = b.add(b.add(0.5, b.mul(b.sub(x1, 0.5), wsc)), off)
    y0 = b.add(y0, sJ); y1 = b.add(y1, lJ)
    opening = b.mul(b.mul(inBay, isWall), b.mul(b.mul(b.ge(fx, x0), b.le(fx, x1)), b.mul(b.ge(fy, y0), b.le(fy, y1))))
    opening = b.mul(opening, b.mul(b.le(v, b.sub(bldgH, 0.8)), b.ge(v, 0.15)))
    # the bake's verdict at the opening's centre: a window of the generic grid there (G), its room lit (B)
    uc = b.add(sideM, b.mul(b.add(cellU, b.mul(b.add(x0, x1), 0.5)), winW))
    vc = b.mul(b.add(cellV, b.mul(b.add(y0, y1), 0.5)), floorH)
    stc = b.comb(b.add(st[0], b.mul(b.sub(uc, u), bkd)), b.add(st[1], b.mul(b.sub(vc, v), bkd)), 0.0)
    return locals()


def _centre_group():
    """BXW_Centre: the atlas uv at the opening's centre (the bake's verdict is read there)."""
    ng = bpy.data.node_groups.get('BXW_Centre')
    if ng is not None:
        return ng, 0
    ng = bpy.data.node_groups.new('BXW_Centre', 'ShaderNodeTree')
    ng.interface.new_socket('Vector', in_out='OUTPUT', socket_type='NodeSocketVector')
    b = NB(ng)
    go = b.new('NodeGroupOutput')
    G = _grid(b)
    b.put(go.inputs[0], G['stc'])
    return ng, b.n


def _shade_group(rooms_img, rooms_gain, opt):
    """BXW_Shade: the facade between the windows (the bake) and every window of the generic grid, as one BSDF."""
    ng = bpy.data.node_groups.get('BXW_Shade')
    if ng is not None:
        return ng, 0
    ng = bpy.data.node_groups.new('BXW_Shade', 'ShaderNodeTree')
    for nm in ('Alb', 'Dat', 'Emi', 'DatC'):
        ng.interface.new_socket(nm, in_out='INPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket('BSDF', in_out='OUTPUT', socket_type='NodeSocketShader')
    nt = ng
    b = NB(ng)
    gi = b.new('NodeGroupInput'); go = b.new('NodeGroupOutput')
    P = b.new('ShaderNodeGroup'); P.node_tree = bpy.data.node_groups['BXW_Params']
    EMIT, NIGHT, TRIM = P.outputs['Emit'], P.outputs['Night'], P.outputs['Trim']
    G = _grid(b)
    st, fs, u, v, fcol = G['st'], G['fs'], G['u'], G['v'], G['fcol']
    floorH, winW, style, bldgH, cvar, wallSeed, doorPack, bkd = G['floorH'], G['winW'], G['style'], G['bldgH'], G['cvar'], G['wallSeed'], G['doorPack'], G['bkd']
    glassS, loftS, resi = G['glassS'], G['loftS'], G['resi']
    cuC, cvC, fx, fy, cellU, cellV, cellUS = G['cuC'], G['cvC'], G['fx'], G['fy'], G['cellU'], G['cellV'], G['cellUS']
    x0, x1, y0, y1, cvI, bkv, opening = G['x0'], G['x1'], G['y0'], G['y1'], G['cvI'], G['bkv'], G['opening']
    dat = b.v3(gi.outputs['Dat']); emi = b.v3(gi.outputs['Emi']); datC = b.v3(gi.outputs['DatC'])
    walb_in = gi.outputs['Alb']
    win = b.mul(opening, b.gt(datC[1], 0.5))
    lit = b.gt(datC[2], 0.5)
    # ---- the view ray in the wall's frame (T along +u of the facade metres, B up, into the wall)
    geo = b.new('ShaderNodeNewGeometry')
    tan = b.new('ShaderNodeTangent'); tan.direction_type = 'UV_MAP'; tan.uv_map = 'fst'
    I = b.v3(geo.outputs['Incoming']); N = b.v3(geo.outputs['Normal']); T = b.v3(tan.outputs['Tangent'])
    rd = (b.neg(I[0]), b.neg(I[1]), b.neg(I[2]))
    rdx = b.dot(rd, T); rdy = rd[2]; dotN = b.neg(b.dot(rd, N))
    rdz = b.mx(dotN, 0.04)
    REC = b.mix(0.15, 0.045, glassS)
    kk = b.div(REC, b.mx(rdz, 0.2))
    parX = b.clamp(b.mul(rdx, kk), -0.5, 0.5); parY = b.clamp(b.mul(rdy, kk), -0.5, 0.5)
    Wp = b.mx(b.mul(b.sub(x1, x0), winW), 1e-3); Hp = b.mx(b.mul(b.sub(y1, y0), floorH), 1e-3)
    pu = b.add(b.mul(b.sub(fx, x0), winW), parX); pv = b.add(b.mul(b.sub(fy, y0), floorH), parY)
    inG = b.mul(b.mul(b.ge(pu, 0.0), b.le(pu, Wp)), b.mul(b.ge(pv, 0.0), b.le(pv, Hp)))
    # reveal: soffit darkest, sill a lit stone, jambs mid-tone; deeper is darker
    dL = b.neg(pu); dR = b.sub(pu, Wp); dB = b.neg(pv); dT = b.sub(pv, Hp)
    mV = b.mx(b.mx(dL, dR), b.mx(dB, dT))
    isT = b.ge(dT, b.sub(mV, 1e-5)); isB = b.mul(b.sub(1.0, isT), b.ge(dB, b.sub(mV, 1e-5)))
    rev = b.vmul(fcol, 0.66)
    rev = b.vmix(rev, b.vmul(fcol, 0.40), isT)
    rev = b.vmix(rev, (0.53, 0.498, 0.445), isB)
    rev = b.vmul(rev, b.sub(1.0, b.mul(0.45, b.clamp(b.div(mV, REC), 0.0, 1.0))))
    # ---- the room (PR #33906 interior mapping): span 2-3 bays, the box ray-marched from the shifted entry point
    span = b.add(2.0, b.ge(b.hash12(b.floor(b.div(cellUS, 2.0)), b.add(cellV, b.mul(cvar, 7.0))), 0.55))
    roomI = b.floor(b.div(cellU, span)); roomK = b.add(roomI, b.mul(wallSeed, 53.0))
    RW = b.mul(span, winW); RH = b.mx(b.mul(b.sub(y1, y0), floorH), 0.3); RD = b.add(b.mul(b.mix(2.4, 1.55, resi), RH), 1.2)
    rx = b.mul(b.clamp(b.div(b.sub(b.add(cuC, b.div(parX, winW)), b.mul(roomI, span)), span), 0.0, 1.0), RW)
    ry = b.mul(b.clamp(b.div(b.sub(b.add(fy, b.div(parY, floorH)), y0), b.sub(y1, y0)), 0.0, 1.0), RH)
    posx = b.gt(rdx, 0.0); posy = b.gt(rdy, 0.0)
    tx = b.mix(b.div(rx, b.mx(b.neg(rdx), 1e-4)), b.div(b.sub(RW, rx), b.mx(rdx, 1e-4)), posx)
    ty = b.mix(b.div(ry, b.mx(b.neg(rdy), 1e-4)), b.div(b.sub(RH, ry), b.mx(rdy, 1e-4)), posy)
    tz = b.div(RD, rdz)
    t = b.mn(tx, b.mn(ty, tz))
    hx = b.add(rx, b.mul(rdx, t)); hy = b.add(ry, b.mul(rdy, t)); hz = b.mul(rdz, t)
    qz = b.clamp(b.div(hz, RD), 0.0, 1.0)
    # the environment map: the direction from the room's eye (centre, 0.45 of its height) to the hit, yawed per room
    id_ = b.hash12(b.add(roomK, b.mul(cvar, 511.0)), b.mul(cellV, 1.7))
    id2 = b.hash12(b.add(b.mul(cellV, 3.7), b.mul(cvar, 131.0)), b.mul(roomK, 1.3))
    id3 = b.hash12(b.mul(roomK, 7.9), b.add(b.mul(cellV, 5.1), b.mul(cvar, 57.0)))
    dx = b.sub(hx, b.mul(RW, 0.5)); dy = b.sub(hy, b.mul(RH, 0.45)); dz = b.sub(hz, b.mul(RD, 0.5))
    dl = b.mx(b.sqrt(b.add(b.add(b.mul(dx, dx), b.mul(dy, dy)), b.mul(dz, dz))), 1e-4)
    yaw = b.hash12(b.mul(roomK, 2.3), b.add(b.mul(cellV, 0.7), b.mul(cvar, 13.0)))
    pu_ = b.fract(b.add(b.div(b.atan2(dx, dz), 2 * math.pi), yaw))
    pv_ = b.add(0.5, b.div(b.asin(b.clamp(b.div(dy, dl), -1.0, 1.0)), math.pi))
    sh = b.hash12(b.mul(roomK, 5.3), b.add(b.mul(cellV, 2.9), b.mul(cvar, 3.0)))
    slot = b.mix(b.add(5.0, b.mn(b.floor(b.mul(sh, 3.0)), 2.0)), b.mn(b.floor(b.mul(sh, 5.0)), 4.0), resi)
    col = b.fmod(slot, 2.0); row = b.floor(b.div(slot, 2.0))
    U = b.div(b.add(col, b.clamp(pu_, 0.002, 0.998)), 2.0)
    V = b.sub(1.0, b.div(b.sub(b.add(row, 1.0), b.clamp(pv_, 0.004, 0.996)), 4.0))
    roomT = _tex(b, rooms_img, b.comb(U, V, 0.0))
    photo = b.v3(roomT.outputs['Color'])
    # per-slot gain to the web's room albedo (iWall 0.62-0.72)
    gain = rooms_gain[0]
    for i in range(1, len(rooms_gain)):
        gain = b.mix(gain, rooms_gain[i], b.eq(slot, float(i), 0.25))
    photo = b.vmul(photo, gain)
    # the web's room light: day ambience per room, lit glow, depth falloff, the bulb's tint
    lightA = b.vmix((1.0, 0.72, 0.27), (1.0, 0.89, 0.61), b.hash12(cellU, b.add(cellV, 9.0)))
    lightB = b.vmix((0.87, 0.91, 1.0), (0.62, 0.71, 1.0), b.hash12(cellV, b.add(cellU, 4.0)))
    lightCol = b.vmix(lightB, lightA, b.lt(id2, 0.88))
    dayAmb = b.mul(b.sub(1.0, NIGHT), b.add(0.08, b.mul(0.26, id_)))
    roomGlow = b.mul(lit, b.mix(0.22, 1.0, NIGHT))
    lev = b.mul(b.add(b.add(dayAmb, b.mul(roomGlow, 1.6)), 0.02), b.mix(1.0, 0.45, qz))
    room = b.vmul(photo, lev)
    room = b.vmix(room, b.vmul(room, lightCol), b.mul(lit, b.mix(0.25, 0.85, NIGHT)))
    # side curtains (rarely drawn), at the glass plane
    fxn = b.clamp(b.div(pu, Wp), 0.0, 1.0); fyn = b.clamp(b.div(pv, Hp), 0.0, 1.0)
    cwid = b.mul(b.mul(id2, id2), 0.42)
    curtM = b.clamp(b.add(b.smooth(b.add(cwid, 0.01), b.sub(cwid, 0.01), fxn), b.smooth(b.sub(b.sub(1.0, cwid), 0.01), b.add(b.sub(1.0, cwid), 0.01), fxn)), 0.0, 1.0)
    fabK = b.add(b.add(b.mul(dayAmb, 1.6), b.mul(roomGlow, 0.2)), 0.02)
    fab = b.vmul(b.vmix((0.72, 0.68, 0.6), (0.5, 0.55, 0.52), id3), fabK)
    room = b.vmix(room, fab, curtM)
    # WL11 dressing: per-flat presence and height, a per-window deviation, crooked hems
    rb = b.add(b.add(b.fmodF(b.floor(b.div(cellU, 2.0)), 64.0), b.mul(b.fmodF(cellV, 64.0), 64.0)), 1.0)
    dressR = b.add(b.mul(b.wlh(b.add(cvI, 1013.0), rb), 0.72), b.mul(b.wlh(b.add(cvI, 1117.0), bkv), 0.28))
    hRoom = b.wlh(b.add(cvI, 1229.0), rb); hFloor = b.wlh(b.add(cvI, 1321.0), b.add(b.fmodF(cellV, 64.0), 1.0)); hPane = b.wlh(b.add(cvI, 1433.0), bkv)
    fynS = b.clamp(b.add(fyn, b.mul(b.mul(b.sub(fxn, 0.5), b.wlsg(b.add(cvI, 1553.0), bkv)), 0.07)), 0.0, 1.0)
    shH = b.clamp(b.mix(0.12, 0.97, b.add(b.mul(hRoom, 0.74), b.mul(hPane, 0.26))), 0.05, 0.99)
    shM = b.mul(b.smooth(b.sub(b.sub(1.0, shH), 0.01), b.add(b.sub(1.0, shH), 0.01), fynS), b.mul(resi, b.lt(dressR, 0.42)))
    shC = b.vmix((0.80, 0.76, 0.68), (0.60, 0.59, 0.55), id2)
    shade = b.vmul(b.vmul(shC, b.add(b.add(b.mul(dayAmb, 1.9), b.mul(roomGlow, 0.55)), 0.02)), b.add(0.93, b.mul(0.07, b.sin(b.mul(fxn, 19.0)))))
    room = b.vmix(room, shade, shM)
    blH = b.clamp(b.mix(0.18, 1.0, b.add(b.add(b.mul(hFloor, 0.62), b.mul(hRoom, 0.24)), b.mul(hPane, 0.14))), 0.05, 1.0)
    blM = b.mul(b.smooth(b.sub(b.sub(1.0, blH), 0.01), b.add(b.sub(1.0, blH), 0.01), fynS), b.mul(b.sub(1.0, resi), b.lt(dressR, 0.6)))
    slat = b.lt(b.fract(b.mul(fyn, 16.0)), 0.72)
    blC = b.vmul((0.72, 0.73, 0.71), b.add(0.55, b.mul(0.45, slat)))
    room = b.vmix(room, b.vmul(blC, b.add(b.add(b.mul(dayAmb, 1.7), b.mul(roomGlow, 0.4)), 0.02)), blM)
    # ---- the glass: tints, dirt film, emission when lit, the lintel's soft occlusion
    nz = b.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 1.0
    b.put(nz.inputs['Vector'], b.comb(b.mul(u, 0.3), b.add(b.mul(v, 0.3), b.mul(cvar, 19.0)), 0.0))
    mottleG = nz.outputs['Fac']
    nz2 = b.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 1.0; nz2.inputs['Detail'].default_value = 1.0
    b.put(nz2.inputs['Vector'], b.comb(b.mul(u, 0.3), b.add(b.mul(v, 0.06), b.mul(cvar, 5.0)), 0.0))
    dust = b.mul(b.clamp(b.sub(b.mul(nz2.outputs['Fac'], 1.6), 0.3), 0.0, 1.0), 0.3)
    pooled = b.mul(b.smooth(0.32, 0.0, b.div(b.sub(fy, y0), b.mx(b.sub(y1, y0), 1e-3))), 0.4)
    grime = b.clamp(b.add(b.add(0.3, dust), pooled), 0.0, 0.9)
    dirty = b.vmix((0.05, 0.06, 0.068), (0.105, 0.12, 0.128), mottleG)
    tintR = b.hash12(b.add(b.mul(cellUS, 7.7), b.mul(cvar, 43.0)), b.mul(cellV, 3.1))
    tsel = b.vmix(b.vmix((0.70, 0.74, 0.77), (0.75, 0.78, 0.69), b.lt(tintR, 0.66)), (0.64, 0.73, 0.78), b.lt(tintR, 0.33))
    glassTint = b.vmul(b.vmix((0.71, 0.78, 0.75), tsel, 0.55), 0.86)
    roomG = b.vmul(room, glassTint)
    gAlb = b.vmix(roomG, dirty, b.mul(grime, b.sub(1.0, b.mul(lit, 0.35))))
    gEm = b.vmul(roomG, b.mul(b.mul(roomGlow, 2.2), b.sub(1.0, b.mul(grime, 0.6))))
    wyR = b.clamp(b.div(pv, Hp), 0.0, 1.0)
    recess = b.sub(1.0, b.mul(0.24, b.smooth(0.62, 0.98, wyR)))
    gAlb = b.vmul(gAlb, recess); gEm = b.vmul(gEm, b.mix(1.0, recess, 0.4))
    gRough = b.add(b.add(0.03, b.mul(pooled, 0.3)), b.mul(dust, 0.15))
    # the curtain-wall families (F0, plate roughness, reflection tint) and punched clear glass (F0 0.075)
    famR = b.hash12(b.floor(b.mul(cvar, 233.0)), 31.7)
    f0 = b.mix(0.075, b.mix(b.mix(b.mix(0.30, 0.10, b.lt(famR, 0.84)), 0.15, b.lt(famR, 0.62)), 0.26, b.lt(famR, 0.30)), glassS)
    pr = b.mix(gRough, b.mix(b.mix(b.mix(0.060, 0.038, b.lt(famR, 0.84)), 0.045, b.lt(famR, 0.62)), 0.055, b.lt(famR, 0.30)), glassS)
    rt = b.vmix(b.vmix(b.vmix((1.10, 0.98, 0.74), (0.97, 0.99, 1.02), b.lt(famR, 0.84)), (0.82, 0.98, 1.02), b.lt(famR, 0.62)), (1.06, 0.95, 0.80), b.lt(famR, 0.30))
    reflT = b.vmix((1.0, 1.0, 1.0), rt, glassS)
    sf = b.sqrt(f0)
    ior = b.div(b.add(1.0, sf), b.sub(1.0, sf))
    # per-pane plate tilt (reflections break up pane to pane)
    pj1 = b.sub(b.hash12(b.add(b.mul(cellU, 3.1), b.mul(wallSeed, 11.0)), b.mul(cellV, 5.3)), 0.5)
    pj2 = b.sub(b.hash12(b.add(b.mul(cellV, 9.7), b.mul(cvar, 31.0)), b.mul(cellU, 1.7)), 0.5)
    Nj = (b.add(N[0], b.mul(b.add(b.mul(pj1, T[0]), 0.0), 0.04)), b.add(N[1], b.mul(b.mul(pj1, T[1]), 0.04)), b.add(N[2], b.mul(pj2, 0.04)))
    # ---- the sashes at the glass plane (not on curtain walls)
    sashR = b.hash12(b.floor(b.mul(cvar, 253.0)), 4.17)
    sashC = b.vmix(b.vmix((0.22, 0.15, 0.10), (0.085, 0.085, 0.095), b.lt(sashR, 0.8)), (0.66, 0.65, 0.60), b.lt(sashR, 0.5))
    rr = b.wlh(b.add(cvI, 613.0), rb); rw = b.wlh(b.add(cvI, 727.0), bkv)
    wlRep = b.mx(b.mul(b.lt(rr, 0.12), b.lt(rw, 0.62)), b.lt(rw, 0.022))
    rc = b.wlh(b.add(cvI, 829.0), bkv)
    repC = b.vmix(b.vmix((0.16, 0.145, 0.125), (0.52, 0.53, 0.545), b.lt(rc, 0.86)), (0.80, 0.795, 0.775), b.lt(rc, 0.62))
    sashC = b.vmix(sashC, repC, wlRep)
    dEdge = b.mn(b.mn(pu, b.sub(Wp, pu)), b.mn(pv, b.sub(Hp, pv)))
    stileW = b.mix(0.055, 0.085, wlRep)
    stile = b.lt(dEdge, stileW)
    rail = b.lt(b.absf(b.sub(pv, b.mul(Hp, b.mix(0.53, 0.50, wlRep)))), 0.045)
    gU = b.fract(b.div(pu, 0.56)); gV = b.fract(b.div(pv, 0.47))
    munt = b.mx(b.mx(b.lt(gU, 0.05), b.gt(gU, 0.95)), b.mx(b.lt(gV, 0.06), b.gt(gV, 0.94)))
    loftM = b.mul(loftS, b.sub(1.0, wlRep))
    sashM = b.clamp(b.add(stile, b.mix(rail, munt, loftM)), 0.0, 1.0)
    sashM = b.mul(sashM, b.mul(inG, b.sub(1.0, glassS)))
    # ---- compose: the glass (or sash) where the ray meets the pane, the reveal where it leaves the opening
    paneA = b.vmix(gAlb, sashC, sashM)
    paneR = b.mix(pr, 0.38, sashM)
    paneE = b.vmul(gEm, b.sub(1.0, b.mul(sashM, 0.92)))
    gl_on = b.mul(inG, b.sub(1.0, sashM))
    # the wall: the bake (its emission without the window glow it held head-on: the glass draws its own)
    walb = b.v3(walb_in)
    wem = tuple(b.mul(b.mul(b.mul(emi[i], emi[i]), 8.0), b.sub(1.0, b.clamp(b.mul(dat[1], 1.5), 0.0, 1.0))) for i in range(3))
    baseC = b.vmix(walb, b.vmix(rev, paneA, inG), win)
    rough = b.mix(dat[0], b.mix(0.85, paneR, inG), win)
    emC = b.vmix(wem, b.vmul(paneE, inG), win)
    f0m = b.mul(win, gl_on)
    # the web's glass weight on the mirror (glassW): the dirt film and the pane-to-pane variance (replaced sashes, film age)
    gW = b.mul(b.sub(1.0, b.mul(grime, 0.7)), b.add(0.55, b.mul(0.9, b.hash12(b.mul(cellUS, 5.3), b.add(b.mul(cellV, 8.9), b.mul(cvar, 17.0))))))
    specL = b.mix(0.5, b.mul(0.5, gW), f0m)
    iorS = b.mix(1.45, ior, f0m)
    tintS = b.vmix((1.0, 1.0, 1.0), reflT, f0m)
    nrm = b.comb(*b.vmix(N, Nj, f0m))
    if opt('windebug') == '1':
        emC = (win, b.mul(win, lit), b.mul(win, inG))
    bs = b.new('ShaderNodeBsdfPrincipled')
    b.put(bs.inputs['Base Color'], b.comb(*b.vmul(baseC, TRIM)))
    b.put(bs.inputs['Roughness'], rough)
    b.put(bs.inputs['IOR'], iorS)
    b.put(bs.inputs['Specular IOR Level'], specL)
    b.put(bs.inputs['Specular Tint'], b.comb(*tintS))
    b.put(bs.inputs['Normal'], nrm)
    b.put(bs.inputs['Emission Color'], b.comb(*emC))
    b.put(bs.inputs['Emission Strength'], EMIT)
    bs.inputs['Metallic'].default_value = 0.0
    nt.links.new(bs.outputs['BSDF'], go.inputs['BSDF'])
    return ng, b.n




def build_facade(mat, atlas_files, rooms_img, rooms_gain, opt):
    """the bxw_fac<k> material: its three baked passes into the shared groups."""
    nc = _centre_group()[1]
    ns = _shade_group(rooms_img, rooms_gain, opt)[1]
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    b = NB(nt)
    out = b.new('ShaderNodeOutputMaterial')
    uvA = b.new('ShaderNodeUVMap'); uvA.uv_map = 'st'
    alb_i = _img(atlas_files['alb'], 'sRGB'); dat_i = _img(atlas_files['dat'], 'Non-Color'); emi_i = _img(atlas_files['emi'], 'Non-Color')
    albT = _tex(b, alb_i, uvA.outputs['UV']); datT = _tex(b, dat_i, uvA.outputs['UV']); emiT = _tex(b, emi_i, uvA.outputs['UV'])
    cg = b.new('ShaderNodeGroup'); cg.node_tree = bpy.data.node_groups['BXW_Centre']
    datC = _tex(b, dat_i, cg.outputs['Vector'], 'Closest')
    sg = b.new('ShaderNodeGroup'); sg.node_tree = bpy.data.node_groups['BXW_Shade']
    nt.links.new(albT.outputs['Color'], sg.inputs['Alb']); nt.links.new(datT.outputs['Color'], sg.inputs['Dat'])
    nt.links.new(emiT.outputs['Color'], sg.inputs['Emi']); nt.links.new(datC.outputs['Color'], sg.inputs['DatC'])
    nt.links.new(sg.outputs['BSDF'], out.inputs['Surface'])
    return nc + ns + b.n


def build_kitglass(mat, r, opt):
    """the kit's window glass as thin glass: straight transmission, the Fresnel mirror at the shader's f0 and roughness,
    the dirt film at its opacity (fk/kitMats.js winGlass)."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    b = NB(nt)
    out = b.new('ShaderNodeOutputMaterial')
    f0 = float(r.get('f0') or 0.2); rough = float(r.get('rough') or 0.03); dirt = float(r.get('dirt') or 0.3); op = float(r.get('opacity') or 0.36)
    col = r.get('color') or [0.89, 0.92, 0.92]
    sf = math.sqrt(max(1e-4, min(0.9, f0)))
    fr = b.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = (1 + sf) / (1 - sf)
    tp = b.new('ShaderNodeBsdfTransparent'); tp.inputs['Color'].default_value = (0.92, 0.95, 0.94, 1.0)
    # the film: the pane's own dirt as a dark diffuse layer (diffuse * (0.04 + film * 0.3) in the web), its share = opacity
    # the per-pane parameters (primvar bxGlass = the web's vertex colour: R mirror, G dirt, B opacity; none: 1, 1, 1)
    pa = b.new('ShaderNodeAttribute'); pa.attribute_type = 'GEOMETRY'; pa.attribute_name = 'bxGlass'
    pc = b.v3(pa.outputs['Vector'])
    noCol = b.lt(b.add(b.add(pc[0], pc[1]), pc[2]), 0.01)
    kR = b.mix(pc[0], 1.0, noCol); kD = b.mix(pc[1], 1.0, noCol); kO = b.mix(pc[2], 1.0, noCol)
    nz = b.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.9; nz.inputs['Detail'].default_value = 2.0
    film = b.mul(b.mul(nz.outputs['Fac'], dirt), kD)
    fc = b.add(0.04, b.mul(film, 0.3))
    df = b.new('ShaderNodeBsdfDiffuse')
    b.put(df.inputs['Color'], b.comb(b.mul(fc, col[0]), b.mul(fc, col[1]), b.mul(fc, col[2])))
    gl = b.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = max(0.0, rough)
    gl.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    m1 = b.new('ShaderNodeMixShader')
    # the web's pane opacity, op x (1 + (1 - kO) x 1.4) + film x 0.14, at 0.55 of it (the rooms behind read dark)
    b.put(m1.inputs['Fac'], b.clamp(b.mul(b.add(b.mul(op, b.add(1.0, b.mul(b.sub(1.0, kO), 1.4))), b.mul(film, 0.14)), 0.55), 0.0, 0.95))
    nt.links.new(tp.outputs['BSDF'], m1.inputs[1]); nt.links.new(df.outputs['BSDF'], m1.inputs[2])
    m2 = b.new('ShaderNodeMixShader')
    # the mirror less the film (kgRefl * (1 - film * 0.55) in the web)
    b.put(m2.inputs['Fac'], b.clamp(b.mul(b.mul(fr.outputs['Fac'], kR), b.sub(1.0, b.mul(film, 0.55))), 0.0, 1.0))
    nt.links.new(m1.outputs['Shader'], m2.inputs[1]); nt.links.new(gl.outputs['BSDF'], m2.inputs[2])
    nt.links.new(m2.outputs['Shader'], out.inputs['Surface'])
    return b.n


def scale_emission(mat, k_socket_fn):
    """multiply a Principled BSDF's emission strength by the params (night level for nightEmit, day/night for selfLit)."""
    if not mat.use_nodes or mat.get('bxw_emis'):
        return False
    mat['bxw_emis'] = 1
    nt = mat.node_tree
    bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bs is None:
        return False
    k_socket_fn(nt, bs)
    return True


def after_import(ctx):
    opt = ctx['opt']
    if opt('nowin') is not None:
        return
    T = ctx.get('T', {})
    sc = ctx.get('sc') or bpy.context.scene
    usd_dir = ctx.get('usd_dir') or os.path.dirname(os.path.abspath(ctx['usd']))
    if str(ctx.get('usd', '')).endswith('.blend') and sc.get('bxw_usd_dir'):
        usd_dir = sc['bxw_usd_dir']   # a scene saved after an earlier import: the USD dir it came from
    jp = os.path.join(usd_dir, 'bxwin_usd.json')
    if not os.path.exists(jp):
        T['bxwin'] = 'no bxwin_usd.json'
        return
    J = json.load(open(jp))
    night = float(opt('winnight', str(J.get('night') if J.get('night') is not None else 0.0)))
    emit = float(opt('winemit', '1.0'))
    _params(night, emit)
    stats = {'night': night, 'emit': emit, 'facades': 0, 'nodes': 0, 'kitglass': 0, 'nightemit': 0, 'selflit': 0, 'missing': []}
    # the room atlas and its per-slot gain (the HDRIs' mean linear albedo to the web's 0.62)
    rp = opt('winrooms', ROOMS_DEFAULT)
    rj = os.path.splitext(rp)[0] + '.json'
    rooms_img = _img(rp, 'sRGB')
    gains = [1.0] * 8
    try:
        RJ = json.load(open(rj))
        gains = [float(x) for x in RJ.get('gain', gains)]
    except Exception as e:
        stats['rooms_json'] = str(e)[:80]
    mats = {}
    for m in bpy.data.materials:
        mats.setdefault(m.name.split('.')[0], []).append(m)
    tdir = os.path.join(usd_dir, 'textures')
    for at in J.get('atlases', []):
        k = at['k']
        tx = at.get('tex') or {}
        files = {p: os.path.join(usd_dir, tx[p]) if p in tx else os.path.join(tdir, f'bxw_a{k}_{p}.png') for p in ('alb', 'dat', 'emi')}
        mname = at.get('material') or f'bxw_fac{k}'
        ml = mats.get(mname) or []
        if not ml:
            stats['missing'].append(mname); continue
        for m in ml:
            stats['nodes'] += build_facade(m, files, rooms_img, gains, opt)
            stats['facades'] += 1
    P = bpy.data.node_groups['BXW_Params']
    for name, r in (J.get('roles') or {}).items():
        for m in mats.get(name, []):
            role = r.get('role')
            kitcol = r.get('color') and max(abs(r['color'][i] - (0.776, 0.839, 0.823)[i]) for i in range(3)) < 0.06
            if role == 'glass' and (r.get('fk') or kitcol):
                # a harvest from before the kit glass was tagged: winGlass's own defaults (shop glass at its low opacity)
                shop = float(r.get('opacity') or 0.36) < 0.2
                r = dict(r, f0=0.07 if shop else 0.2, rough=0.02 if shop else 0.03, dirt=0.22 if shop else 0.3)
                role = 'kitglass'
            if role == 'kitglass' and opt('winkit', '1') != '0':
                stats['nodes'] += build_kitglass(m, r, opt); stats['kitglass'] += 1
            elif role == 'fill':
                # unlit in the web (MeshBasicMaterial): its colour as emission under BX-LIGHT's Emit, no diffuse response
                def f(nt, bs):
                    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = P
                    bc = next((l for l in nt.links if l.to_node == bs and l.to_socket.name == 'Base Color'), None)
                    if bc:
                        nt.links.new(bc.from_socket, bs.inputs['Emission Color']); nt.links.remove(bc)
                    else:
                        bs.inputs['Emission Color'].default_value = bs.inputs['Base Color'].default_value
                    bs.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1.0)
                    bs.inputs['Roughness'].default_value = 1.0
                    nt.links.new(g.outputs['Emit'], bs.inputs['Emission Strength'])
                if scale_emission(m, f): stats['fill'] = stats.get('fill', 0) + 1
            elif role == 'lvlit':
                # the kit's storefront interiors (usd_windows.lv_variants): the web's emission is in the USD already,
                # BX-LIGHT's Emit scales it
                def f(nt, bs):
                    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = P
                    nt.links.new(g.outputs['Emit'], bs.inputs['Emission Strength'])
                if scale_emission(m, f): stats['lvlit'] = stats.get('lvlit', 0) + 1
            elif role == 'nightemit':
                def f(nt, bs):
                    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = P
                    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'
                    nt.links.new(g.outputs['Emit'], mm.inputs[0]); nt.links.new(g.outputs['Night'], mm.inputs[1])
                    nt.links.new(mm.outputs[0], bs.inputs['Emission Strength'])
                if scale_emission(m, f): stats['nightemit'] += 1
            elif role == 'selflit':
                d0, d1 = float(r.get('day', 0.0)), float(r.get('night', 0.0))
                def f(nt, bs, d0=d0, d1=d1):
                    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = P
                    lv = nt.nodes.new('ShaderNodeMapRange'); lv.inputs['To Min'].default_value = d0; lv.inputs['To Max'].default_value = d1
                    nt.links.new(g.outputs['Night'], lv.inputs['Value'])
                    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'
                    nt.links.new(lv.outputs['Result'], mm.inputs[0]); nt.links.new(g.outputs['Emit'], mm.inputs[1])
                    bc = next((l for l in nt.links if l.to_node == bs and l.to_socket.name == 'Base Color'), None)
                    if bc: nt.links.new(bc.from_socket, bs.inputs['Emission Color'])
                    else: bs.inputs['Emission Color'].default_value = bs.inputs['Base Color'].default_value
                    nt.links.new(mm.outputs[0], bs.inputs['Emission Strength'])
                if scale_emission(m, f): stats['selflit'] += 1
    sc['bxw_usd_dir'] = usd_dir
    T['bxwin'] = stats
    print('BXWIN ' + json.dumps(stats))
