# BX-LIGHT (AR34 BX, 2026-10-02): time of day, the street and vehicle lamps, calibrated emission and the web's film look
# for a Cycles render of an exported take. Called by blender_render.py (lines marked BX-LIGHT) after the import and its
# render settings:  blender_light.apply(sc, root_data, opt, T, frame)
#
# Reads the harvest's light pass (harvest_lights.mjs): --harvest <harvest dir> (light_static.json, sky_vis.f16, sky_env.f16,
# light_<shot>.json, manifest.json, dyn_<shot>_f<frame>.json, geo/). Without it the pilot's rig stays as it is.
#
#   SKY     the camera and glossy rays see the page's own visible dome (sky_vis: Preetham x skyGain + TW36 twilight + N11
#           city glow + CS25 clouds, captured in the page, written beside it as Radiance .hdr); diffuse light comes from the
#           web's ambient rig at dusk and night (the IBL dome sky_env x environmentIntensity plus the hemisphere lights as
#           domes split at the horizon, x2 for the occlusion the web does not have: --skysrc web, --skylight) and, at
#           golden, from the same captured dome white-balanced (--skysrc vis, SKY_TINT 1.12 / 1.0 / 0.84; round 2: the
#           pilot's Nishita fill starved the shade, --skysrc nishita --goldsky keeps it)
#   FILL    night and golden: the web's unoccluded hemisphere light given back to the viaducts and crowns only, for camera
#           and glossy rays (setup_fill, FILL_K 2.0; --fill, --fillsel structure|all, --fillao)
#   SUN     the page's key light: both directional lights summed (the near and far cascades split one sun); hidden when
#           the sun is under the horizon. MOON at night: a 0.53 deg sun lamp, --moon <W/m2> (0.05; 0 = off)
#   LAMPS   every street lamp of the region (lampSpots) as a point light 0.25 m under its luminaire, with an IES profile
#           tabulated from the web's own throw (cityLamps.js cl24Throw: Type II cobrahead along its arm, Bishop's Crook
#           symmetric), the fixture's candela x CityLamps' gain x night and colour (night11.js), and the web's range cut
#           (1 - (d / range)^4)^2 (--nolampwin: 1/d^2 everywhere); the lenses themselves x 25 for camera and glossy rays
#   VEHICLES every car whose lamp mask has its headlamps on gets two HL24 low beams (headlamps.js x three's spot cone,
#           tabulated as IES, 1800 cd x night each) at its own lenses; the lenses glow by role and mask as fleet24.js draws
#           them (head 7, tail 1.6, brake 6, blinkers 6, sirens 9, the web's tints), per instance (bxl_mask on the moving
#           point clouds, _lamp on the lamp mesh); in BX-SEQ's takes the beams are created once per car, parented to its
#           Empty, hide_render keyframed from nyc_lamp, visibility and distance (--beamr 120 m), the lenses read nyc_lamp
#   TRAINS  the rail cars' lamps, light strips and signs unlit as the web draws them, the lamp roles (aux) against each
#           car's flags from the mov file, the interior's night glow (setup_trains; --notrains)
#   EMITTERS the exported emitters are three's emissive radiance = Cycles' emission strength 1 at the same exposure (--emit
#           scales them); the windows' rooms (BX-WIN's BXW_Params: Night = the take's level, Emit = WIN_EMIT, --winemit)
#   FILM    compositor: haze (the web's HazePass, closed-form height fog from the Position pass), bloom (three's
#           UnrealBloomPass rebuilt: its high pass with GL36's knee and BC26's cap, five Gaussians for its mips), the
#           page's exposure per frame, three.js r185's AgX exactly, the sRGB encoding, then the web's grade in display space
#           (LK34 levels, S-curve contrast, HL34 shoulder, warmth, saturation, shadow lift, vignette); view transform Raw
#   FAR     the far macro city is hidden (exported without the web's near mask it stands in front of the street); --keepfar
#
# Flags: --harvest <dir> (required)  --skyfrom <light-only harvest with the domes>  --skysrc web|vis|env|nishita
#   --skylight <k>  --hemik a,b  --envk <k>  --goldsky <s>  --moon <W/m2>  --lampgain <k>  --nolampwin  --lumk <k>
#   --headgain <k>  --novehlamps  --nolamps  --emit <k>  --winemit <k>  --nograde  --bloom <k>  --bloomsize <k>
#   --haze <k>  --keepfar  --bxlexr <prefix> (the raw passes as multilayer EXR)  --exposure <stops> (blender_render's)
#   --skytint r,g,b  --skysat s  --fill <k>  --fillsel structure|all  --fillao  --beamr <m>  --notrains  --vehmov
# Hooks: apply(sc, root, opt, T, frame) for blender_render.py's BX-LIGHT line; light / settings / frame / done for BX-SEQ's
# hook lists (docs/notes/ar34-bx-seq.md).
import bpy, json, math, os, re
import numpy as np
import mathutils

# Blender 4.5.14 Cycles: an IES node's Fac per candela in the file, per (light power / 4 pi). Measured 2026-10-02
# (tools: a 4 pi W point light with an isotropic 100 cd IES lights a white plane 7.2258x the plain light; 200 cd 14.4516x).
K_IES = 0.072258
# the windows' emission (BXW_Params Emit) per time of day: the web's radiance, unchanged until a 1:1 measurement says else
WIN_EMIT = {'golden': 1.0, 'dusk': 1.0, 'night': 1.0, 'day': 1.0}
# (BX-FIN 15:38 had dusk at 0.65 for the State Office Building's near-white lit windows; those are not BX-WIN's rooms but
# the tower's pbr glass, exported with its tint as albedo and without the web's b3N on its emission: blender_nodes.py
# apply_glass, BX-DUSK 2026-10-03. At 1.0 the Hotel Theresa's rooms read 121, 109, 97 against the web's 129, 105, 85.)
# the captured dome as the diffuse light (--skysrc vis): its saturation and tint per time of day (golden calibrated on
# t7ArchTrack f054 against the web take, round 2)
SKY_SAT = {'golden': 1.0}
# the structure fill (setup_fill) per time of day
# golden x2: the deep underside of the deck (lit only by the plaza's orange bounce in Cycles) goes from brown 68, 49, 24
# toward the web's 60, 58, 44 (x4: 82, 70, 56 but the whole viaduct ~15 % over; t7ArchTrack f054, half res)
FILL_K = {'night': 2.0, 'golden': 2.0, 'day': 2.0}
# t7ArchTrack f054 (half res, sRGB means, Cycles / web): x1 untinted 79, 85, 83 / 81, 82, 72 (R/B 0.95 / 1.13);
# tint (1.12, 1.0, 0.84): 83, 84, 75 (R/B 1.11), the deck soffit 80, 77, 63 / 76, 76, 66, the arch face 78, 76, 65 /
# 81, 82, 73, the sunlit road 76, 76, 70 / 71, 74, 72
# 22:16 warmer, from the BID check (t8ApolloGlide f054 R/B 1.12 -> 1.14 against the web's 1.24; t7ArchTrack 1.05 -> 1.11
# against 1.13): (1.16, 1.0, 0.78)
SKY_TINT = {'golden': (1.16, 1.0, 0.78), 'day': (1.16, 1.0, 0.78)}
# R3-PHYS (2026-10-07, owner: physical light for Cycles and Unreal; the web-matched takes stay as gate baselines):
# --light phys (default) | web. phys: the visible dome is the only sky light (x phys_light.json sky_k, untinted), no
# structure or hemisphere fill, no probe term, untrimmed albedos (blender_nodes --bxtrim phys), the exposure fixed per
# time of day (phys_light.json, which ue_light.py reads too); web: the rig as calibrated against the web takes.
PHYS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phys_light.json')


def _phys(C=None):
    """the physical light table, or None when this take uses the web-matched rig (--light web)."""
    if C is not None and str(C.opt('light', 'phys')) == 'web': return None
    try:
        with open(PHYS_JSON) as f: return json.load(f)
    except Exception: return {}
# R3-PHYS end


# ---------------------------------------------------------------------------------------------------------- utilities
def _j(path):
    with open(path) as f: return json.load(f)


class Ctx:
    pass


def b3(C, p):
    """three.js world point -> Blender world (the root recentres the region and the importer turns Y up into Z up)."""
    o = C.og
    return mathutils.Vector((p[0] - o[0], -(p[2] - o[2]), p[1] - o[1]))


def bdir(d):
    return mathutils.Vector((d[0], -d[2], d[1]))


def load_geo(H, g):
    """a harvest geometry blob as numpy arrays (usd_write.py's layout)."""
    raw = open(os.path.join(H, g['file']), 'rb').read()
    out = {}
    for L in g['layout']:
        dt = np.float32 if L['type'] == 'f32' else np.uint32
        n = L['count'] * L['itemSize']
        a = np.frombuffer(raw, dtype=dt, count=n, offset=L['offset'])
        out[L['name']] = a.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else a
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ies_text(V, Hs, cd, title):
    """an IESNA LM-63-2002 file, type C, absolute candela; cd[h][v]."""
    rows = ['IESNA:LM-63-2002', f'[TEST] {title}', '[MANUFAC] BoundlessNYC (tabulated from the web shader)', 'TILT=NONE',
            f'1 -1 1 {len(V)} {len(Hs)} 1 2 0 0 0', '1 1 0']
    def wrap(vals):
        out, line = [], []
        for v in vals:
            line.append(v)
            if len(line) == 12: out.append(' '.join(line)); line = []
        if line: out.append(' '.join(line))
        return out
    rows += wrap([f'{v:g}' for v in V]) + wrap([f'{h:g}' for h in Hs])
    for i in range(len(Hs)): rows += wrap([f'{c:.3f}' for c in cd[i]])
    return '\n'.join(rows) + '\n'


def ies_local_dirs(V, Hs):
    """light-local unit directions for IES angles (Cycles: vertical 0 = -Z, horizontal 90 = -X, 180 = +Y)."""
    v = np.radians(np.asarray(V))[None, :]; h = np.radians(np.asarray(Hs))[:, None]
    sv = np.sin(v)
    return -sv * np.sin(h), -sv * np.cos(h), -np.cos(v) * np.ones_like(h)


def throw_profile(shape, cobra):
    """cityLamps.js cl24Throw in the light's frame, the arm (over the street) along horizontal 90 (local -X)."""
    shift, width, floor = shape
    V = list(np.arange(0, 90.5, 1.0)) + [92.0, 95.0, 100.0, 180.0]
    Hs = list(range(0, 361, 5)) if cobra else [0]
    x, y, z = ies_local_dirs(V, Hs)
    c = -z                                               # cos from nadir
    hl = np.hypot(x, y)
    if cobra:
        wa = np.where(hl > 1e-4, (-x) / np.maximum(hl, 1e-9), 0.0)   # +1 over the street (local -X), -1 behind the pole
        c0 = 0.60 + (0.36 - 0.60) * (1 - wa * wa) + shift
        back = 1.0 + (0.42 - 1.0) * np.clip(wa / -0.85, 0, 1) ** 2 * (3 - 2 * np.clip(wa / -0.85, 0, 1))
    else:
        c0 = 0.45 + shift + 0 * c; back = 1.0
    xx = (c - c0) / width
    f = np.where(c > 0, smooth(0.0, 0.2, c) * (floor + (1 - floor) * np.exp(-xx * xx)) * back, 0.0)
    return V, Hs, 100.0 * f


def beam_profile(aim, angle, penumbra):
    """headlamps.js hl24Beam x three's spot cone, the light's -Z pointing down, the beam axis along horizontal 90 (-X)."""
    V = sorted(set([float(v) for v in range(0, 70, 5)] + list(np.round(np.arange(70, 80, 1.0), 3)) +
                   list(np.round(np.arange(80, 86, 0.5), 3)) + list(np.round(np.arange(86, 93.01, 0.1), 3)) +
                   list(np.round(np.arange(93.5, 100.01, 0.5), 3)) + [105.0, 110.0, 120.0, 180.0]))
    Hs = sorted(set([float(h) for h in range(0, 361, 10)] + list(np.round(np.arange(30, 150.01, 1.0), 3)) +
                    list(np.round(np.arange(70, 110.01, 0.5), 3))))
    x, y, z = ies_local_dirs(V, Hs)
    return V, Hs, beam_eval(np.stack([x, y, z], -1), aim, angle, penumbra)


# BX-LEAF (2026-10-04): the beam as a SPOT light whose -Z is the beam axis. As a point light the light tree took every beam
# for an isotropic 22,600 W emitter (4 pi x 1,800 cd) and gave it next-event samples everywhere within ~100 m, where it
# lights nothing (its IES confines the light to a 41 deg cone ahead); a spot's cone is in the tree's bounds, so a crown
# behind or beside a car no longer spends samples on its beams. The profile is the same function, re-tabulated in the
# spot's frame: D_point = Q D_spot, Q the rotation about the light's Y by 90 deg - aim (Q (-Z) = the beam axis).
def beam_q(aim):
    t = math.pi / 2 - aim
    return np.array([[math.cos(t), 0.0, math.sin(t)], [0.0, 1.0, 0.0], [-math.sin(t), 0.0, math.cos(t)]])


def beam_profile_spot(aim, angle, penumbra):
    V = sorted(set(list(np.round(np.arange(0, 30, 0.5), 3)) + list(np.round(np.arange(30, math.degrees(angle) + 1.01, 0.25), 3)) + [90.0, 180.0]))
    Hs = sorted(set(list(np.round(np.arange(0, 360.01, 2.5), 3))))
    x, y, z = ies_local_dirs(V, Hs)
    D = np.stack([x, y, z], -1) @ beam_q(aim).T
    return V, Hs, beam_eval(D, aim, angle, penumbra)


def beam_eval(D, aim, angle, penumbra):
    """the HL24 low beam x three's spot cone (candela share x 100) for light-local directions D (..., 3) of the point-light
    frame (-Z down, the beam axis along -X tilted down by aim)."""
    ca, sa = math.cos(aim), math.sin(aim)
    F = np.array([-ca, 0.0, -sa]); R = np.array([0.0, 1.0, 0.0]); U = np.array([-sa, 0.0, ca])
    fz = np.maximum(D @ F, 1e-3)
    th = np.arctan2(D @ R, fz)
    tvH = np.arctan2(D @ U, fz) - aim
    cut = -0.0100 + np.clip(th, 0.0, 0.103) * 0.268
    below = smooth(cut + 0.0045, cut - 0.0035, tvH)
    hx, hy = (th - 0.030) / 0.070, (tvH + 0.022) / 0.014
    hot = np.exp(-(hx * hx + hy * hy))
    mx, my = th / 0.22, (tvH + 0.035) / 0.035
    mid = 0.35 * np.exp(-(mx * mx + my * my))
    wx, wy = th / 0.45, (tvH + 0.070) / 0.060
    wide = 0.14 * np.exp(-(wx * wx + wy * wy))
    nx = th / 0.70
    nearF = 0.04 * np.exp(-(nx * nx)) * smooth(-0.50, -0.10, tvH)
    beam = below * (hot + mid + wide + nearF) + (1.0 - below) * 0.015 * np.exp(-(wx * wx))
    coneCos, penCos = math.cos(angle), math.cos(angle * (1 - penumbra))
    spot = smooth(coneCos, penCos, D @ F)
    f = np.where((D @ F) > 0, beam * spot, 0.0)
    return 100.0 * f


_light_tree_cache = {}


def ies_light(name, text_name, ies_body, color, energy, radius, ltype='POINT', spot=None):
    """a point light datablock driven by an internal IES text (Fac / (K_IES x 100) = the profile's 0..1 share); ltype 'SPOT'
    with spot = its full cone angle (radians): the cone is in the light tree's bounds (BX-LEAF), its edge left to the IES."""
    L = bpy.data.lights.new(name, ltype)
    if ltype == 'SPOT':
        L.spot_size = spot; L.spot_blend = 0.0; L.show_cone = False
    L.color = color; L.energy = energy; L.shadow_soft_size = radius
    try: L.use_soft_falloff = False   # the web's lamps are points with a 1/d^2 law; no soft falloff near the lens
    except Exception: pass
    t = bpy.data.texts.get(text_name) or bpy.data.texts.new(text_name)
    t.clear(); t.write(ies_body)
    L.use_nodes = True
    nt = L.node_tree
    em = next(n for n in nt.nodes if n.type == 'EMISSION')
    ies = nt.nodes.new('ShaderNodeTexIES'); ies.mode = 'INTERNAL'; ies.ies = t
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 1.0 / (K_IES * 100.0)
    nt.links.new(ies.outputs['Fac'], k.inputs[0]); nt.links.new(k.outputs[0], em.inputs['Strength'])
    return L


def place_light(sc, coll, L, name, loc, yaw_dir=None):
    """a light object at loc; yaw_dir (Blender xy) is turned onto the profile's horizontal 90 (the light's local -X)."""
    o = bpy.data.objects.new(name, L)
    o.location = loc
    if yaw_dir is not None and (abs(yaw_dir[0]) + abs(yaw_dir[1])) > 1e-6:
        o.rotation_euler = (0.0, 0.0, math.atan2(-yaw_dir[1], -yaw_dir[0]))
    coll.objects.link(o)
    return o


# ---------------------------------------------------------------------------------------------------------- sky, sun, moon
def load_f16_image(C, fname, info, name):
    p = os.path.join(C.H, fname)
    if not info or not os.path.exists(p) or not (info.get('max') or 0) > 0: return None
    w, h = int(info['w']), int(info['h'])
    a = np.fromfile(p, dtype=np.float16).astype(np.float32)
    if a.size != w * h * 3: return None
    a = a.reshape(h, w, 3)
    rgba = np.concatenate([a, np.ones((h, w, 1), np.float32)], axis=2)
    # a Radiance .hdr beside the capture, written here (Blender's image save applies the display transform to a generated
    # float image: an EXR saved that way held sRGB-encoded values), loaded as a linear file image
    hp = p[:-4] + '.hdr'
    if not os.path.exists(hp) or os.path.getmtime(hp) < os.path.getmtime(p): write_hdr(hp, a[::-1])
    img = bpy.data.images.get(name)
    if img: bpy.data.images.remove(img)
    img = bpy.data.images.load(hp)
    img.name = name
    try: img.colorspace_settings.name = 'Linear Rec.709'
    except Exception: pass
    return img


def write_hdr(path, rgb):
    """rows top first, linear float RGB -> Radiance RGBE, flat scanlines (the max channel byte is >= 128, so no pixel reads
    as an old-style run or a new-style RLE header)."""
    rgb = np.maximum(np.asarray(rgb, np.float32), 0.0)
    Hh, Ww = rgb.shape[:2]
    m = rgb.max(axis=2)
    mant, ex = np.frexp(m)
    ok = m > 1e-32
    scale = np.where(ok, mant * 256.0 / np.maximum(m, 1e-32), 0.0)
    out = np.zeros((Hh, Ww, 4), np.uint8)
    out[..., :3] = np.clip(np.floor(rgb * scale[..., None]), 0, 255).astype(np.uint8)
    out[..., 3] = np.where(ok, ex + 128, 0).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n' % (Hh, Ww)); f.write(out.tobytes())


def float_image(name, w, h, rgba, cs, path=None):
    img = bpy.data.images.get(name)
    if img: bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=True)
    try: img.colorspace_settings.name = cs
    except Exception: pass
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    if path:
        try:
            img.filepath_raw = path; img.file_format = 'OPEN_EXR'; img.save()
            img.source = 'FILE'; img.reload()
            img.colorspace_settings.name = cs
        except Exception as e: print('[bx-light] could not save', path, e)
    return img


def three_equirect(nt, img):
    """an Image Texture reading a three-convention equirect (u = atan(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5) by the
    world ray's direction (Blender x, y, z = three x, -z, y)."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nrm = nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'
    nt.links.new(tc.outputs['Generated'], nrm.inputs[0])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(nrm.outputs[0], sep.inputs[0])
    ny = nt.nodes.new('ShaderNodeMath'); ny.operation = 'MULTIPLY'; ny.inputs[1].default_value = -1.0
    nt.links.new(sep.outputs['Y'], ny.inputs[0])
    at = nt.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
    nt.links.new(ny.outputs[0], at.inputs[0]); nt.links.new(sep.outputs['X'], at.inputs[1])
    u = nt.nodes.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = 1.0 / (2 * math.pi); u.inputs[2].default_value = 0.5
    nt.links.new(at.outputs[0], u.inputs[0])
    cz = nt.nodes.new('ShaderNodeClamp'); cz.inputs['Min'].default_value = -1.0; cz.inputs['Max'].default_value = 1.0
    nt.links.new(sep.outputs['Z'], cz.inputs['Value'])
    asn = nt.nodes.new('ShaderNodeMath'); asn.operation = 'ARCSINE'; nt.links.new(cz.outputs[0], asn.inputs[0])
    v = nt.nodes.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = 1.0 / math.pi; v.inputs[2].default_value = 0.5
    nt.links.new(asn.outputs[0], v.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(u.outputs[0], cmb.inputs['X']); nt.links.new(v.outputs[0], cmb.inputs['Y'])
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'; tex.extension = 'REPEAT'
    nt.links.new(cmb.outputs[0], tex.inputs['Vector'])
    return tex


def setup_sky(C):
    sc, LS = C.sc, C.LS
    vis = load_f16_image(C, 'sky_vis.f16', LS.get('skyVis'), 'bxl_sky_vis')
    env = load_f16_image(C, 'sky_env.f16', LS.get('skyEnv'), 'bxl_sky_env')
    C.T['sky_capture'] = bool(vis)
    if not vis:
        print('[bx-light] no sky capture: the pilot sky stays'); return
    # golden (round 2): the captured visible dome lights the scene as it does the camera, white-balanced (SKY_TINT): the
    # pilot's Nishita at 0.15-0.25 starved the shade (R/B 1.48 under the viaduct); dusk and night: the web's ambient rig
    PH = _phys(C)   # R3-PHYS: the visible dome at every time of day
    src = C.opt('skysrc', 'vis' if (PH is not None or C.mode in ('golden', 'day')) else 'web')
    # dusk and night: the web's ambient rig (hemisphere lights, the IBL dome) is unoccluded, Cycles' dome is occluded by the
    # city; x2 brings the open surfaces (a lamp-lit wall, a white truck's side) to the web's level (t7DinoGlide f000:
    # wall 146 -> 151 at x2.5 against the web's 157) without lifting the lamp-lit road further
    # (BX-FIN 15:35: dusk x4: under MAT's ground and the kit the dusk street read 1.6-3x darker than the web at x2;
    # t7StreetGlide f000 border tests, street-level mean 48 -> 53 against the web's 85, the walk 75 -> 83 / 111)
    # (BX-DUSK 2026-10-03: back to x2 at dusk: the x4 stood in for the street lamps the path harvests had missed,
    # harvest_lights.mjs lampsAlongPath / --lampsfrom, and over-lit the open facades; the probe's share is setup_ambient)
    k = float(C.opt('skylight', '1.0' if C.mode in ('golden', 'day') else '2.0'))
    if PH is not None and C.opt('skylight') is None: k = float(PH.get('sky_k', 1.0))   # R3-PHYS
    world = sc.world or bpy.data.worlds.new('sky')
    sc.world = world; world.use_nodes = True
    nt = world.node_tree
    old_sky = next((n for n in nt.nodes if n.type == 'TEX_SKY'), None)
    keep_nishita = src == 'nishita' and old_sky is not None
    if not keep_nishita: nt.nodes.clear()
    else:
        for n in list(nt.nodes):
            if n.type not in ('TEX_SKY', 'BACKGROUND'): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tv = three_equirect(nt, vis)
    bg_cam = nt.nodes.new('ShaderNodeBackground'); bg_cam.inputs['Strength'].default_value = 1.0
    nt.links.new(tv.outputs['Color'], bg_cam.inputs['Color'])
    if keep_nishita:
        # golden: the pilot's Nishita sky lights the scene; its 0.15 was set under Blender's AgX, and under the web's own
        # curve and grade (contrast 0.72, saturation 1.2 at golden) the shade under the viaduct ran warm (the arch faces
        # R/B 1.69 against the web's 1.13 at 0.15, 1.29 at 0.45 but 25 % over); 0.25 is the balance (--goldsky)
        bg_light = next(n for n in nt.nodes if n.type == 'BACKGROUND' and n != bg_cam)
        bg_light.inputs['Strength'].default_value = float(C.opt('goldsky', '0.25')) * k
    else:
        bg_light = nt.nodes.new('ShaderNodeBackground'); bg_light.inputs['Strength'].default_value = k
        if src == 'web':
            # the page's ambient rig after dark (N11): the IBL dome (sky_env) x environmentIntensity plus its hemisphere
            # lights, each an up / down split dome of radiance I x colour / pi (three's hemisphere irradiance is exactly
            # that dome's, unoccluded); here the city occludes it, as the web's AO passes only approximate
            lj = {}
            try: lj = _j(os.path.join(C.Hl, 'lights.json'))
            except Exception: pass
            up, dn = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
            hk = [float(v) for v in C.opt('hemik', '1,1').split(',')]
            hemis = [L for L in lj.get('lights', []) if L.get('type') == 'HemisphereLight' and L.get('visible', True)]
            for i, L in enumerate(hemis):
                w = float(L.get('intensity', 0)) * (hk[i] if i < len(hk) else 1.0) / math.pi
                for c in range(3): up[c] += w * L['color'][c]; dn[c] += w * L.get('groundColor', L['color'])[c]
            envI = float(lj.get('environmentIntensity') or 0.0) * float(C.opt('envk', '1.0'))
            tc2 = nt.nodes.new('ShaderNodeTexCoord'); sz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc2.outputs['Generated'], sz.inputs[0])
            gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0; nt.links.new(sz.outputs['Z'], gt.inputs[0])
            hm = nt.nodes.new('ShaderNodeMix'); hm.data_type = 'RGBA'; nt.links.new(gt.outputs[0], hm.inputs['Factor'])
            hm.inputs[6].default_value = (dn[0], dn[1], dn[2], 1.0); hm.inputs[7].default_value = (up[0], up[1], up[2], 1.0)
            ev = three_equirect(nt, env) if env else tv
            sc_ = nt.nodes.new('ShaderNodeMix'); sc_.data_type = 'RGBA'; sc_.blend_type = 'ADD'; sc_.inputs['Factor'].default_value = 1.0
            em = nt.nodes.new('ShaderNodeVectorMath'); em.operation = 'SCALE'; em.inputs['Scale'].default_value = envI
            nt.links.new(ev.outputs['Color'], em.inputs[0])
            nt.links.new(em.outputs[0], sc_.inputs[6]); nt.links.new(hm.outputs[2], sc_.inputs[7])
            nt.links.new(sc_.outputs[2], bg_light.inputs['Color'])
            C.T['web_rig'] = {'hemi_up': [round(v, 4) for v in up], 'hemi_dn': [round(v, 4) for v in dn], 'envI': envI, 'hemis': len(hemis)}
            C.hemi = (up, dn)
        elif src == 'env' and env: nt.links.new(three_equirect(nt, env).outputs['Color'], bg_light.inputs['Color'])
        else:
            # the visible dome as the diffuse light, white-balanced: --skysat (saturation of the light it gives) and
            # --skytint r,g,b (golden defaults below: calibrated against the web's shade at 1:1)
            sat = float(C.opt('skysat', str(SKY_SAT.get(C.mode, 1.0) if PH is None else 1.0)))   # R3-PHYS: untinted
            tint = [float(v) for v in C.opt('skytint', ','.join(str(v) for v in (SKY_TINT.get(C.mode, (1.0, 1.0, 1.0)) if PH is None else (1.0, 1.0, 1.0)))).split(',')]
            col = tv.outputs['Color']
            if abs(sat - 1.0) > 1e-4:
                hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = sat
                nt.links.new(col, hsv.inputs['Color']); col = hsv.outputs['Color']
            if any(abs(t - 1.0) > 1e-4 for t in tint):
                tm = nt.nodes.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.blend_type = 'MULTIPLY'; tm.inputs['Factor'].default_value = 1.0
                nt.links.new(col, tm.inputs[6]); tm.inputs[7].default_value = (tint[0], tint[1], tint[2], 1.0); col = tm.outputs[2]
            nt.links.new(col, bg_light.inputs['Color'])
            C.T['sky_light'] = {'sat': sat, 'tint': tint}
    lp = nt.nodes.new('ShaderNodeLightPath')
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'
    nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); nt.links.new(lp.outputs['Is Glossy Ray'], mx.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(mx.outputs[0], mix.inputs['Fac'])
    nt.links.new(bg_light.outputs[0], mix.inputs[1]); nt.links.new(bg_cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    C.T['sky'] = {'camera': 'page dome', 'light': src, 'k': k}


def setup_sun_moon(C):
    sc, LS = C.sc, C.LS
    suns = [o for o in sc.objects if o.type == 'LIGHT' and o.data.type == 'SUN' and o.name.startswith('Sun')]
    lj = {}
    try: lj = _j(os.path.join(C.H, 'lights.json'))
    except Exception: pass
    dls = [L for L in lj.get('lights', []) if L.get('type') == 'DirectionalLight' and L.get('visible', True)]
    total = sum(float(L.get('intensity', 0)) for L in dls)
    s = LS.get('sun') or {}
    elev = None
    if s.get('pos') and s.get('target'):
        d = np.array(s['pos']) - np.array(s['target']); d /= (np.linalg.norm(d) + 1e-9); elev = math.degrees(math.asin(max(-1, min(1, d[1]))))
    for o in suns:
        if elev is not None and (elev < 0.3 or total < 1e-3): o.hide_render = True
        elif total > 0: o.data.energy = total
    C.T['sun'] = {'elev': None if elev is None else round(elev, 2), 'energy': round(total, 3), 'parts': len(dls), 'shown': bool(elev is not None and elev >= 0.3 and total >= 1e-3)}
    moon = float(C.opt('moon', '0.05' if C.mode == 'night' else '0'))
    if moon > 0:
        # a high moon to the south-south-east (bearing 160, 38 deg up), cool after the eye's white balance
        b, e = math.radians(160.0), math.radians(38.0)
        d = mathutils.Vector((math.sin(b) * math.cos(e), math.cos(b) * math.cos(e), math.sin(e)))
        L = bpy.data.lights.new('Moon', 'SUN'); L.energy = moon; L.angle = math.radians(0.53); L.color = (0.70, 0.80, 1.0)
        o = bpy.data.objects.new('Moon', L); sc.collection.objects.link(o)
        o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        C.T['moon'] = moon


# BX-LEAF (2026-10-04): the take's view frusta (cam_<shot>.json, three.js world, frame index k = frame_start + k) and a
# sphere test against them. A street lamp lights nothing past its range (the web's cut, lamp_window) and a beam nothing past
# the web's 75 m, but Cycles' light tree does not know either: a crown next to its lamp sent most next-event samples to the
# region's other ~2,750 lamps and the beams (t8VictoriaCrane f046, 64 spp: the crown's direct light 4x noisier than its
# mean; the lamps within 60 m only and no beams: 7.7x less noise, the same mean), and the per-frame denoiser made blotches
# of that noise which moved every frame (the owner's "flickering with lights and trees").
def cam_frusta(C):
    try: cams = _j(os.path.join(C.H, f'cam_{C.shot}.json'))
    except Exception: return None
    out = []
    for c in cams:
        m = np.array(c['m'], dtype=np.float64).reshape(4, 4)   # three's column-major elements: rows are the axes
        ty = math.tan(math.radians(float(c.get('fov', 50))) / 2) / float(c.get('zoom', 1) or 1)
        out.append((m[3, :3], m[0, :3], m[1, :3], m[2, :3], ty * float(c.get('aspect', 16 / 9)), ty))
    return out


def in_frustum(fr, pts, R):
    """spheres (pts (n, 3) three.js world, radii R) that meet the view frustum fr (no far plane)."""
    P, X, Y, Z, tx, ty = fr
    d = pts - P
    x, y, f = d @ X, d @ Y, -(d @ Z)
    return (f > -R) & ((np.abs(x) - f * tx) / math.sqrt(1 + tx * tx) < R) & ((np.abs(y) - f * ty) / math.sqrt(1 + ty * ty) < R)


def frusta_vis(fr, pts, R):
    """per frame (k, n): the sphere meets frame k's frustum or frame k - 1's (the shutter spans k - 1 .. k with --mbpos END)."""
    vis = np.stack([in_frustum(f_, pts, R) for f_ in fr])
    return vis | np.vstack([vis[:1], vis[:-1]])


def cull_lamps(C):
    """BX-LEAF: a street lamp whose range (+ --lampcull m, 10) meets no frame's view is off in that frame (hide_render keyed,
    constant, as the beams'): it lights nothing in view (only bounce light from out of view, the 5 % indirect share),
    and the light tree then spends the samples on the lamps that do. Takes only; --lampcull off keeps every lamp."""
    mg = C.opt('lampcull', '10')
    objs = getattr(C, 'lamp_objs', None)
    if mg == 'off' or not getattr(C, 'take', False) or not objs: return
    fr = cam_frusta(C)
    if not fr: C.T['lampcull'] = 'no cameras'; return
    vis = frusta_vis(fr, np.array([p for _, p, _ in objs]), np.array([r for _, _, r in objs]) + float(mg))
    f0 = int(C.sc.frame_start)
    never = always = keyed = 0
    for i, (o, _, _) in enumerate(objs):
        v = vis[:, i]
        if v.all(): always += 1; continue
        if not v.any(): o.hide_render = True; never += 1; continue
        o.hide_render = not bool(v[0])
        o.keyframe_insert('hide_render', frame=f0)
        fcv = _fcurve(o, 'hide_render'); kp = fcv.keyframe_points; kp.clear(); kp.add(len(v))
        co = []
        for k in range(len(v)): co += [f0 + k, 0.0 if v[k] else 1.0]
        kp.foreach_set('co', co); kp.foreach_set('interpolation', [0] * len(v)); fcv.update()
        keyed += 1
    C.T['lampcull'] = {'margin': float(mg), 'lamps': len(objs), 'never': never, 'always': always, 'keyed': keyed,
                       'mean_on': round(float(vis.sum(axis=1).mean()), 1)}


# ---------------------------------------------------------------------------------------------------------- street lamps
def setup_lamps(C):
    sc, LS = C.sc, C.LS
    rig = LS.get('lampRig') or {}
    night = float(LS.get('night') or 0)
    if night < float(rig.get('on', 0.06)) or C.opt('nolamps') is not None: C.T['lamps'] = 0; return
    fx = rig.get('fixtures') or []
    leg = rig.get('legacy') or {'cd': 165, 'range': 44, 'lin': [1, 0.54, 0.19]}
    gain = float(rig.get('gain', 3.0)) * float(C.opt('lampgain', '1.0'))
    shape = rig.get('shape') or [0.2, 0.17, 0.33]
    coll = bpy.data.collections.new('BXL_lamps'); sc.collection.children.link(coll)
    prof = {True: throw_profile(shape, True), False: throw_profile(shape, False)}
    datas = {}
    win = C.opt('nolampwin') is None
    n = 0
    C.lamp_objs = []
    # BX-DUSK: --lampsfrom <light_static.json> takes the street lamps from another light pass of the same shot (harvests made
    # before 2026-10-03 16:56 kept the poles round the arch instead of the shot's own: harvest_lights.mjs lampsAlongPath)
    lamps = LS.get('lamps') or []
    lf = C.opt('lampsfrom') or os.environ.get('BXLAMPSFROM')
    if lf:
        try:
            lamps = _j(lf).get('lamps') or lamps
            C.T['lamps_from'] = lf
        except Exception as e:
            print('[bx-light] --lampsfrom not read:', e)
    for s in lamps:
        x, y, z, kind, h, yaw = s
        F = fx[int(kind)] if 0 <= int(kind) < len(fx) else leg
        cobra = yaw is not None and abs(yaw) < 50
        dim = 1.0
        t = max(0.0, min(1.0, (math.hypot(x + 1215, z - 2820) - 180) / 140)); dim = 0.35 + 0.65 * t * t * (3 - 2 * t)   # TL31
        key = (int(kind), cobra, round(dim, 3))
        if key not in datas:
            V, Hs, cd = prof[cobra]
            I = float(F['cd']) * gain * night * dim
            L = ies_light(f'BXL_lamp_{F.get("key", "legacy")}_{"cobra" if cobra else "crook"}_{len(datas)}', f'bxl_{"cobra" if cobra else "crook"}.ies',
                          ies_text(V, Hs, cd.tolist(), 'cl24Throw ' + ('cobrahead' if cobra else 'crook')), tuple(F['lin']), 4 * math.pi * I, 0.2)
            if win: lamp_window(L, float(F['range']))
            datas[key] = L
        # the light sits 0.25 m under the luminaire point (the web's lens), clear of the head's housing
        p = b3(C, (x, y + h - 0.25, z))
        ad = (math.sin(yaw), -math.cos(yaw)) if cobra else None
        o_ = place_light(sc, coll, datas[key], f'BXL_lamp{n}', p, ad)
        C.lamp_objs.append((o_, (x, y + h - 0.25, z), float(F.get('range', 60))))   # BX-LEAF: for cull_lamps
        n += 1
    C.T['lamps'] = n
    C.T['lamp_datas'] = len(datas)


def lamp_window(L, rng):
    """the web's range cut, (1 - (d / range)^4)^2, on the light's strength (Light Falloff Linear = the distance)."""
    nt = L.node_tree
    em = next(n for n in nt.nodes if n.type == 'EMISSION')
    src = em.inputs['Strength'].links[0].from_socket
    lf = nt.nodes.new('ShaderNodeLightFalloff'); lf.inputs['Strength'].default_value = 1.0
    d = nt.nodes.new('ShaderNodeMath'); d.operation = 'DIVIDE'; d.inputs[1].default_value = rng
    nt.links.new(lf.outputs['Linear'], d.inputs[0])
    p4 = nt.nodes.new('ShaderNodeMath'); p4.operation = 'POWER'; p4.inputs[1].default_value = 4.0; nt.links.new(d.outputs[0], p4.inputs[0])
    om = nt.nodes.new('ShaderNodeMath'); om.operation = 'SUBTRACT'; om.inputs[0].default_value = 1.0; om.use_clamp = True; nt.links.new(p4.outputs[0], om.inputs[1])
    sq = nt.nodes.new('ShaderNodeMath'); sq.operation = 'POWER'; sq.inputs[1].default_value = 2.0; nt.links.new(om.outputs[0], sq.inputs[0])
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; nt.links.new(src, mu.inputs[0]); nt.links.new(sq.outputs[0], mu.inputs[1])
    nt.links.new(mu.outputs[0], em.inputs['Strength'])


# ---------------------------------------------------------------------------------------------------------- vehicles
def lamp_group():
    """fleet24.js's lamp emission: role (_lamp) x mask (bxl_mask, per instance) -> emission and the lens tint."""
    ng = bpy.data.node_groups.get('BXL_VehLamp')
    if ng: return ng
    ng = bpy.data.node_groups.new('BXL_VehLamp', 'ShaderNodeTree')
    I = ng.interface
    I.new_socket('Role', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Mask', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Time', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Emission', in_out='OUTPUT', socket_type='NodeSocketColor')
    I.new_socket('Tint', in_out='OUTPUT', socket_type='NodeSocketColor')
    N, Lk = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    def M(op, a, b=None, c=None, clamp=False):
        m = N.new('ShaderNodeMath'); m.operation = op; m.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = float(v)
            else: Lk.new(v, m.inputs[i])
        return m.outputs[0]
    role = M('ROUND', gi.outputs['Role']); mask = M('ROUND', gi.outputs['Mask'])
    def bit(k): return M('MODULO', M('FLOOR', M('DIVIDE', mask, float(2 ** k))), 2.0)
    def is_(n): return M('COMPARE', role, float(n), 0.4)
    blink = M('GREATER_THAN', M('FRACT', M('MULTIPLY', gi.outputs['Time'], 1.5)), 0.5)
    sir = M('GREATER_THAN', M('FRACT', M('MULTIPLY', gi.outputs['Time'], 2.3)), 0.5)
    e_head = M('MULTIPLY', M('MULTIPLY', is_(1), bit(0)), 7.0)
    e_tail = M('MULTIPLY', is_(4), M('MAXIMUM', M('MULTIPLY', bit(2), 6.0), M('MULTIPLY', bit(1), 1.6)))
    bl = M('MULTIPLY', M('ADD', is_(2), is_(5)), M('MULTIPLY', bit(3), M('MULTIPLY', blink, 6.0)))
    br = M('MULTIPLY', M('ADD', is_(3), is_(6)), M('MULTIPLY', bit(4), M('MULTIPLY', blink, 6.0)))
    sR = M('MULTIPLY', is_(8), M('MULTIPLY', bit(5), M('MULTIPLY', sir, 9.0)))
    sB = M('MULTIPLY', is_(9), M('MULTIPLY', bit(5), M('MULTIPLY', M('SUBTRACT', 1.0, sir), 9.0)))
    # tints: tail red, blinkers amber, siren red / blue, everything else a warm white
    def rgb(c):
        n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (c[0], c[1], c[2], 1.0); return n.outputs[0]
    def mixc(fac, a, b):
        m = N.new('ShaderNodeMix'); m.data_type = 'RGBA'; Lk.new(fac, m.inputs['Factor']); Lk.new(a, m.inputs[6]); Lk.new(b, m.inputs[7]); return m.outputs[2]
    t = rgb((1.0, 0.96, 0.88))
    t = mixc(is_(4), t, rgb((0.9, 0.04, 0.03)))
    t = mixc(M('ADD', M('ADD', is_(2), is_(3)), M('ADD', is_(5), is_(6)), clamp=True), t, rgb((1.0, 0.45, 0.03)))
    t = mixc(is_(8), t, rgb((1.0, 0.05, 0.03)))
    t = mixc(is_(9), t, rgb((0.08, 0.2, 1.0)))
    e = M('ADD', M('ADD', M('ADD', e_head, e_tail), M('ADD', bl, br)), M('ADD', sR, sB))
    em = N.new('ShaderNodeVectorMath'); em.operation = 'SCALE'; Lk.new(t, em.inputs[0]); Lk.new(e, em.inputs['Scale'])
    Lk.new(em.outputs[0], go.inputs['Emission']); Lk.new(t, go.inputs['Tint'])
    return ng


def setup_vehicles(C):
    sc = C.sc
    if C.opt('novehlamps') is not None: return
    dfile = os.path.join(C.H, f"dyn_{C.shot}_f{C.frame:03d}.json")
    # (BX-FIN: a take always takes the take path, its key frames too: the beams are made once and ride the cars' Empties)
    if not os.path.exists(dfile) or C.opt('vehmov') is not None or getattr(C, 'take', False):
        if not setup_vehicles_mov(C): C.T['veh'] = 'no dyn / mov file'
        return
    D = _j(dfile)
    man = C.man
    geos = {g['id']: g for g in man['geos']}
    lampgeo = {gid for gid, g in geos.items() if any(L['name'] == '_lamp' for L in g['layout'])}
    if not lampgeo: C.T['veh'] = 'no _lamp in this harvest'; return
    night = float(C.LS.get('night') or 0)
    hl = C.LS.get('headlamps') or {}
    aim, angle, pen = float(hl.get('aim', 0.021)), float(hl.get('angle', 0.72)), float(hl.get('penumbra', 0.35))
    cdcar = float(hl.get('cd', 3600)) * night * float(C.opt('headgain', '1.0'))
    G = {}
    def geo_info(gid):
        if gid in G: return G[gid]
        a = load_geo(C.H, geos[gid])
        P, R = a['position'], np.round(a['_lamp']).astype(int)
        info = {'role': R, 'pos': P}
        hm = R == 1
        if hm.any():
            Ph = P[hm]
            L, Rt = Ph[Ph[:, 0] < 0], Ph[Ph[:, 0] >= 0]
            info['heads'] = [q.mean(axis=0) for q in (L, Rt) if len(q)]
        else: info['heads'] = []
        G[gid] = info
        return info
    # per-instance lamp masks on the moving point clouds (matched by position), the lamp role on the lamp meshes
    pcs = {}
    for o in sc.objects:
        m = re.match(r'i(\d+)_', o.name)
        if o.type == 'POINTCLOUD' and m: pcs.setdefault(int(m.group(1)), []).append(o)
    ng = lamp_group()
    done_mats, done_mesh = set(), set()
    head_data = {}
    coll = bpy.data.collections.new('BXL_headlamps'); sc.collection.children.link(coll)
    nhl = nmask = 0
    from mathutils import kdtree
    for j, s_ in enumerate(D['instanced']):
        if s_['geo'] not in lampgeo: continue
        inf = geo_info(s_['geo'])
        Ms = np.asarray(s_['matrices'], dtype=np.float64).reshape(-1, 16)
        av = (s_.get('inst') or {}).get('aVeh')
        if av is None: continue
        av = np.asarray(av, dtype=np.float64).reshape(-1, 4)
        masks = av[:, 2]
        wpos = [b3(C, (M[12], M[13], M[14])) for M in Ms]
        kd = kdtree.KDTree(len(wpos))
        for i, p in enumerate(wpos): kd.insert(p, i)
        kd.balance()
        for pc in pcs.get(j, []):
            pts = pc.data.attributes['position']
            n = len(pts.data)
            co = np.zeros(n * 3, np.float32); pts.data.foreach_get('vector', co); co = co.reshape(-1, 3)
            mw = pc.matrix_world
            mv = np.zeros(n, np.float32)
            for i in range(n):
                _, idx, dist = kd.find(mw @ mathutils.Vector(co[i]))
                mv[i] = masks[idx] if dist < 0.05 else 0.0
            a = pc.data.attributes.get('bxl_mask') or pc.data.attributes.new('bxl_mask', 'FLOAT', 'POINT')
            a.data.foreach_set('value', mv); nmask += n
            # the lamp mesh(es) this cloud instances: _lamp per vertex, the material wired to the group
            for mod in pc.modifiers:
                if mod.type != 'NODES' or not mod.node_group: continue
                for nd in mod.node_group.nodes:
                    if nd.bl_idname != 'GeometryNodeCollectionInfo': continue
                    cl = nd.inputs['Collection'].default_value
                    for po in (cl.all_objects if cl else []):
                        if po.type != 'MESH': continue
                        me = po.data
                        if me.name not in done_mesh and len(me.vertices) == len(inf['role']):
                            at = me.attributes.get('_lamp') or me.attributes.new('_lamp', 'FLOAT', 'POINT')
                            at.data.foreach_set('value', inf['role'].astype(np.float32))
                            done_mesh.add(me.name)
                        for mat in me.materials:
                            if mat and mat.name not in done_mats:
                                wire_lamp_material(mat, ng, C.frame / 30.0); done_mats.add(mat.name)
        # HL24 low beams: two per car with its headlamps on, at its own lenses (0.12 m ahead of them)
        if cdcar <= 0 or not inf['heads']: continue
        for i, M in enumerate(Ms):
            if not (int(round(masks[i])) & 1): continue
            Mt = mathutils.Matrix(np.asarray(M).reshape(4, 4).T.tolist())
            fwd3 = Mt.to_3x3() @ mathutils.Vector((0, 0, 1))
            fb = bdir(fwd3); fb.z = 0.0
            if fb.length < 1e-6: continue
            fb.normalize()
            hal = (av[i, 3] % 1.0) < float(hl.get('halogenShare', 0.34))
            col = tuple(hl.get('halogen' if hal else 'led', [1, 1, 1]))
            key = 'hal' if hal else 'led'
            if key not in head_data:
                V, Hs, cd = beam_profile(aim, angle, pen)
                head_data[key] = ies_light(f'BXL_head_{key}', 'bxl_hl24.ies', ies_text(V, Hs, cd.tolist(), 'HL24 low beam'), col,
                                           4 * math.pi * cdcar / max(1, len(inf['heads'])), 0.04)
            for hp in inf['heads']:
                w = Mt @ mathutils.Vector((float(hp[0]), float(hp[1]), float(hp[2]) + 0.12))
                place_light(sc, coll, head_data[key], f'BXL_hl{nhl}', b3(C, (w.x, w.y, w.z)), (fb.x, fb.y))
                nhl += 1
    C.T['veh'] = {'headlamps': nhl, 'masked_points': nmask, 'lamp_meshes': len(done_mesh), 'lamp_materials': len(done_mats)}


def _fcurve(idb, path):
    """the F-curve of idb's own animation slot (Blender 4.4+ slotted actions: one action may hold several IDs' slots, and
    action.fcurves only shows the first one's), else the legacy lookup."""
    ad = idb.animation_data
    if not ad or not ad.action: return None
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
        if cb is not None:
            fc = cb.fcurves.find(path)
            if fc is not None: return fc
    except Exception: pass
    return ad.action.fcurves.find(path)


def take_beams(C):
    """BX-SEQ's takes (blender_moving.py: one Empty per car part in collection bx_moving, parented to the World root, so
    its local space is the car's model space; nyc_id, nyc_lamp keyframed): two HL24 beams per car, created ONCE and
    parented to one of the car's Empties at its kind's role-1 anchors, their hide_render keyframed (constant) from the
    car's own nyc_lamp, its visibility and its distance to the lens (--beamr, 120 m). Nothing changes per frame: no object
    is created or removed in a take, and the beams ride with the car through the shutter."""
    mv = bpy.data.collections.get('bx_moving')
    if not mv or not any('nyc_id' in e.keys() for e in mv.objects): return False
    if getattr(C, 'beams_done', False): return True
    C.beams_done = True
    M = C.mov
    hl = C.LS.get('headlamps') or {}
    night = float(C.LS.get('night') or 0)
    if isinstance(M.get('night'), list) and M['night']: night = float(M['night'][0])
    cdcar = float(hl.get('cd', 3600)) * night * float(C.opt('headgain', '1.0'))
    if cdcar <= 0: C.T['veh'] = {'beams': 0, 'source': 'take'}; return True
    try: cams = _j(os.path.join(C.H, f'cam_{C.shot}.json'))
    except Exception: cams = []
    campos = [(c['m'][12], c['m'][13], c['m'][14]) for c in cams]
    R = float(C.opt('beamr', '120'))
    cars = {c['id']: c for c in M.get('cars', [])}
    sc = C.sc; f0 = int(sc.frame_start); nF = len(campos) or (int(sc.frame_end) - f0 + 1)
    coll = bpy.data.collections.get('BXL_beams') or bpy.data.collections.new('BXL_beams')
    if coll.name not in sc.collection.children: sc.collection.children.link(coll)
    aim, angle, pen = float(hl.get('aim', 0.021)), float(hl.get('angle', 0.72)), float(hl.get('penumbra', 0.35))
    datas = {}
    Rl = mathutils.Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).to_4x4()   # light -Z = model -Y (down), -X = model +Z (forward)
    # BX-LEAF: spot beams (--beampoint: the point lights as before), the web's range cut (headlamps distance, 75 m;
    # --beamwin <m>, 0 none) and the view test (--beamcull <m>, 10; off): a beam whose range meets no frame's view is off
    spot = C.opt('beampoint') is None
    if spot: Rl = Rl @ mathutils.Matrix(beam_q(aim).tolist()).to_4x4()
    bwin = float(C.opt('beamwin', str(hl.get('distance', 75) or 0)))
    bmg = C.opt('beamcull', '10')
    fr = cam_frusta(C) if bmg != 'off' else None
    ncull = 0
    parents = {}
    for e in mv.objects:
        cid = e.get('nyc_id')
        if cid is not None and cid not in parents and cid in cars: parents[cid] = e
    nb = non = 0
    for cid, e in parents.items():
        car = cars[cid]
        heads = [v[:3] for kk, v in (M['groups'][car['g']].get('lamps') or {}).items() if kk.startswith('1')]
        if not heads: continue
        act = e.animation_data.action if e.animation_data and e.animation_data.action else None
        fc = (lambda path, i=0: act.fcurves.find(path, index=i)) if act else (lambda path, i=0: None)
        f_lamp, f_hid = fc('["nyc_lamp"]'), fc('hide_render')
        f_loc = [fc('location', i) for i in range(3)]
        on = []; wt = []
        for k in range(nF):
            f = f0 + k
            mk = int(round(f_lamp.evaluate(f))) if f_lamp else int(e.get('nyc_lamp', 0))
            hid = (f_hid.evaluate(f) > 0.5) if f_hid else e.hide_render
            p = [f_loc[i].evaluate(f) if f_loc[i] else e.location[i] for i in range(3)]
            # BX-FIX: a smooth fade from R to R + 40 m (it was a hard cut at R: a beam's pool came and went with the car)
            dd = math.dist(p, campos[k]) if k < len(campos) else 0.0
            x_ = max(0.0, min(1.0, (R + 40.0 - dd) / 40.0)); fw = x_ * x_ * (3 - 2 * x_)
            lit = bool(mk & 1) and not hid
            if lit and fw > 0.0 and fr and k < len(fr):   # BX-LEAF: the view test (the car's origin, + 5 m for its lamps; the
                p3 = np.array([p])                            # Empties' space is three.js world, as campos above)
                rb = np.array([(bwin if bwin > 0 else R + 40.0) + float(bmg) + 5.0])
                if not (in_frustum(fr[k], p3, rb)[0] or (k > 0 and in_frustum(fr[k - 1], p3, rb)[0])): lit = False; ncull += 1
            on.append(lit and fw > 0.0); wt.append(fw if lit else 0.0)
        if not any(on): continue
        key = 'hal' if (float(car.get('seed', 0.5)) % 1.0) < float(hl.get('halogenShare', 0.34)) else 'led'
        if key not in datas:
            if spot:
                V, Hs, cd = beam_profile_spot(aim, angle, pen)
                datas[key] = ies_light(f'BXL_beam_{key}', 'bxl_hl24_spot.ies', ies_text(V, Hs, cd.tolist(), 'HL24 low beam (spot frame)'),
                                       tuple(hl.get('halogen' if key == 'hal' else 'led', [1, 1, 1])), 4 * math.pi * cdcar / 2.0, 0.04,
                                       ltype='SPOT', spot=2.0 * angle + math.radians(1.0))
            else:
                V, Hs, cd = beam_profile(aim, angle, pen)
                datas[key] = ies_light(f'BXL_beam_{key}', 'bxl_hl24.ies', ies_text(V, Hs, cd.tolist(), 'HL24 low beam'),
                                       tuple(hl.get('halogen' if key == 'hal' else 'led', [1, 1, 1])), 4 * math.pi * cdcar / 2.0, 0.04)
            if bwin > 0: lamp_window(datas[key], bwin)
        faded = any(0.0 < w_ < 0.999 for w_ in wt)
        for hp in heads:
            ld = datas[key]
            if faded:   # its own light data, the energy keyed per frame (linear) through the fade
                ld = datas[key].copy()
                e0 = datas[key].energy
                ld.energy = e0 * wt[0]
                ld.keyframe_insert('energy', frame=f0)
                fce = _fcurve(ld, 'energy')
                kp_ = fce.keyframe_points; kp_.clear(); kp_.add(nF)
                co_ = []
                for k in range(nF): co_ += [f0 + k, e0 * wt[k]]
                kp_.foreach_set('co', co_); kp_.foreach_set('interpolation', [1] * nF); fce.update()
            o = bpy.data.objects.new(f'BXL_beam_{cid}_{len(coll.objects)}', ld)
            coll.objects.link(o)
            o.parent = e; o.matrix_parent_inverse = mathutils.Matrix.Identity(4)
            o.matrix_basis = mathutils.Matrix.Translation((float(hp[0]), float(hp[1]), float(hp[2]) + 0.12)) @ Rl
            if all(on): o.hide_render = False
            else:
                o.hide_render = not on[0]
                o.keyframe_insert('hide_render', frame=f0)
                fcv = _fcurve(o, 'hide_render')
                kp = fcv.keyframe_points; kp.clear(); kp.add(nF)
                co = []
                for k in range(nF): co += [f0 + k, 0.0 if on[k] else 1.0]
                kp.foreach_set('co', co); kp.foreach_set('interpolation', [0] * nF); fcv.update()
            nb += 1
        non += sum(on)
    C.T['veh'] = {'source': 'take', 'beams': nb, 'beam_frames_on': non, 'radius': R, 'cars': len(parents), 'spot': spot, 'win': bwin, 'culled_frames': ncull}
    try: wire_take_lamps(C)
    except Exception as ex: C.T.setdefault('errors', []).append(f'wire_take_lamps: {ex}')
    return True


def setup_vehicles_mov(C):
    """the take path (BX-SEQ's mov_<shot>.json, docs/notes/ar34-bx-seq.md): every car of this frame whose mask has its
    headlamps on gets its two HL24 beams at its kind's role-1 anchors (model space: +Z forward), 0.12 m ahead of them."""
    M = getattr(C, 'mov', None)
    if M is None:
        try: M = _j(os.path.join(C.H, f'mov_{C.shot}.json'))
        except Exception: M = False
        C.mov = M
    if not M: return False
    if take_beams(C): return True
    f = C.frame
    night = float((M.get('night') or [C.LS.get('night') or 0])[0] if isinstance(M.get('night'), list) else (C.LS.get('night') or 0))
    hl = C.LS.get('headlamps') or {}
    aim, angle, pen = float(hl.get('aim', 0.021)), float(hl.get('angle', 0.72)), float(hl.get('penumbra', 0.35))
    cdcar = float(hl.get('cd', 3600)) * night * float(C.opt('headgain', '1.0'))
    if cdcar <= 0: C.T['veh'] = {'headlamps': 0, 'source': 'mov'}; return True
    coll = bpy.data.collections.get('BXL_headlamps') or bpy.data.collections.new('BXL_headlamps')
    if coll.name not in C.sc.collection.children: C.sc.collection.children.link(coll)
    datas = getattr(C, 'head_data', None) or {}
    C.head_data = datas
    n = 0
    for car in M.get('cars', []):
        f0, f1 = int(car.get('f0', 0)), int(car.get('f1', -1))
        if not (f0 <= f <= f1): continue
        k = f - f0
        mask = car.get('mask'); mk = int(mask[k] if isinstance(mask, list) else (mask or 0))
        if not (mk & 1): continue
        m = car['m'][k]
        R = mathutils.Matrix(((m[0], m[3], m[6]), (m[1], m[4], m[7]), (m[2], m[5], m[8])))   # three column-major 3x3
        t = mathutils.Vector((m[9], m[10], m[11]))
        g = M['groups'][car['g']]
        heads = [v[:3] for kk, v in (g.get('lamps') or {}).items() if kk.startswith('1')]
        if not heads: continue
        fb = bdir(R @ mathutils.Vector((0, 0, 1))); fb.z = 0.0
        if fb.length < 1e-6: continue
        fb.normalize()
        hal = (float(car.get('seed', 0.5)) % 1.0) < float(hl.get('halogenShare', 0.34))
        key = 'hal' if hal else 'led'
        if key not in datas:
            V, Hs, cd = beam_profile(aim, angle, pen)
            datas[key] = ies_light(f'BXL_head_{key}', 'bxl_hl24.ies', ies_text(V, Hs, cd.tolist(), 'HL24 low beam'), tuple(hl.get('halogen' if hal else 'led', [1, 1, 1])),
                                   4 * math.pi * cdcar / 2.0, 0.04)
        for hp in heads:
            w = R @ mathutils.Vector((float(hp[0]), float(hp[1]), float(hp[2]) + 0.12)) + t
            place_light(C.sc, coll, datas[key], f'BXL_hl{n}', b3(C, (w.x, w.y, w.z)), (fb.x, fb.y))
            n += 1
    if not getattr(C, 'mov_lenses', False):
        C.mov_lenses = True
        try: wire_take_lamps(C)
        except Exception as e: C.T.setdefault('errors', []).append(f'wire_take_lamps: {e}')
    C.T['veh'] = {'headlamps': n, 'source': 'mov', 'frame': f, 'lamp_meshes': C.T.get('take_lamp_meshes', 0)}
    return True


def wire_take_lamps(C):
    """BX-SEQ's takes instance each car's parts through Empties (custom property nyc_lamp keyframed): the lamp meshes of
    their collections get the role (_lamp) from the harvest blob of the same geometry (same vertex count and bounds) and
    their materials the lamp group, as the key-frame path does."""
    geos = {g['id']: g for g in C.man['geos'] if any(L['name'] == '_lamp' for L in g['layout'])}
    if not geos: return
    byn = {}
    for gid, g in geos.items():
        n = next(L['count'] for L in g['layout'] if L['name'] == 'position')
        byn.setdefault(n, []).append(gid)
    ng = lamp_group()
    cache, done, mats = {}, set(), set()
    for e in C.sc.objects:
        if e.type != 'EMPTY' or 'nyc_lamp' not in e.keys() or not e.instance_collection: continue
        for po in e.instance_collection.all_objects:
            if po.type != 'MESH' or po.data.name in done: continue
            me = po.data; nv = len(me.vertices)
            cands = byn.get(nv)
            if not cands: continue
            co = np.zeros(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
            lo, hi = co.min(axis=0), co.max(axis=0)
            for gid in cands:
                if gid not in cache: cache[gid] = load_geo(C.H, geos[gid])
                P = cache[gid]['position']
                if np.allclose(P.min(axis=0), lo, atol=2e-3) and np.allclose(P.max(axis=0), hi, atol=2e-3):
                    at = me.attributes.get('_lamp') or me.attributes.new('_lamp', 'FLOAT', 'POINT')
                    at.data.foreach_set('value', np.round(cache[gid]['_lamp']).astype(np.float32))
                    done.add(me.name)
                    for m in me.materials:
                        if m and m.name not in mats: wire_lamp_material(m, ng, C.frame / 30.0); mats.add(m.name)
                    break
    C.T['take_lamp_meshes'] = len(done); C.T['take_lamp_materials'] = len(mats)


def wire_lamp_material(mat, ng, t):
    if not mat.use_nodes or mat.get('bxl_lamp'): return
    nt = mat.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: return
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = ng
    ar = nt.nodes.new('ShaderNodeAttribute'); ar.attribute_type = 'GEOMETRY'; ar.attribute_name = '_lamp'
    am = nt.nodes.new('ShaderNodeAttribute'); am.attribute_type = 'INSTANCER'; am.attribute_name = 'bxl_mask'
    am2 = nt.nodes.new('ShaderNodeAttribute'); am2.attribute_type = 'INSTANCER'; am2.attribute_name = 'nyc:lampMask'   # BX-SEQ's primvar
    am3 = nt.nodes.new('ShaderNodeAttribute'); am3.attribute_type = 'INSTANCER'; am3.attribute_name = 'nyc_lamp'   # BX-SEQ's Empties (blender_moving.py)
    mx0 = nt.nodes.new('ShaderNodeMath'); mx0.operation = 'MAXIMUM'
    nt.links.new(am2.outputs['Fac'], mx0.inputs[0]); nt.links.new(am3.outputs['Fac'], mx0.inputs[1])
    mxm = nt.nodes.new('ShaderNodeMath'); mxm.operation = 'MAXIMUM'
    nt.links.new(am.outputs['Fac'], mxm.inputs[0]); nt.links.new(mx0.outputs[0], mxm.inputs[1])
    nt.links.new(ar.outputs['Fac'], g.inputs['Role']); nt.links.new(mxm.outputs[0], g.inputs['Mask'])
    g.inputs['Time'].default_value = t
    nt.links.new(g.outputs['Emission'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1.0
    # the lens tint over the reflector (fleet24: diffuse x mix(1, tint, 0.85))
    bc = b.inputs['Base Color']
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 0.85
    if bc.is_linked: nt.links.new(bc.links[0].from_socket, mx.inputs[6])
    else: mx.inputs[6].default_value = bc.default_value
    nt.links.new(g.outputs['Tint'], mx.inputs[7]); nt.links.new(mx.outputs[2], bc)
    mat['bxl_lamp'] = 1


# ---------------------------------------------------------------------------------------------------------- trains
def train_group():
    """city/trains/mats.js lampPatch: the lens's role per vertex (aux: 0 always, 1 front white, 2 front red, 3 rear white,
    4 rear red, 5 door lights, 6 interior) against the car's flags (bxl_trlamp = fw + 2 fr + 4 rw + 8 rr + 16 doors + 32
    interior): on -> gain, off -> 0.07."""
    ng = bpy.data.node_groups.get('BXL_TrainLamp')
    if ng: return ng
    ng = bpy.data.node_groups.new('BXL_TrainLamp', 'ShaderNodeTree')
    I = ng.interface
    I.new_socket('Role', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Flags', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Gain', in_out='INPUT', socket_type='NodeSocketFloat')
    I.new_socket('Factor', in_out='OUTPUT', socket_type='NodeSocketFloat')
    N, Lk = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    def M(op, a, b=None, c=None):
        m = N.new('ShaderNodeMath'); m.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = float(v)
            else: Lk.new(v, m.inputs[i])
        return m.outputs[0]
    role = M('ROUND', gi.outputs['Role']); fl = M('ROUND', gi.outputs['Flags'])
    def bit(k): return M('MODULO', M('FLOOR', M('DIVIDE', fl, float(2 ** k))), 2.0)
    def is_(n): return M('COMPARE', role, float(n), 0.4)
    on = is_(0)
    for r, k in ((1, 0), (2, 1), (3, 2), (4, 3), (5, 4), (6, 5)): on = M('ADD', on, M('MULTIPLY', is_(r), bit(k)))
    on = M('MINIMUM', on, 1.0)
    f = M('MULTIPLY_ADD', on, M('SUBTRACT', gi.outputs['Gain'], 0.07), 0.07)
    Lk.new(f, go.inputs['Factor'])
    return ng


def unlit(mat, gain, role_flags=None):
    """a MeshBasicMaterial as the web draws it: its colour (vertex colour variant, texture) x gain as emission, no diffuse
    response; role_flags = (group, gain) for the trains' lamps."""
    if not mat.use_nodes or mat.get('bxl_unlit'): return
    nt = mat.node_tree
    b_ = next((nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
    if not b_: return
    bc = b_.inputs['Base Color']
    src = bc.links[0].from_socket if bc.is_linked else None
    col = tuple(bc.default_value)
    sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'
    if src: nt.links.new(src, sc_.inputs[0])
    else: sc_.inputs[0].default_value = col[:3]
    if role_flags:
        g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = role_flags[0]
        ar = nt.nodes.new('ShaderNodeAttribute'); ar.attribute_type = 'GEOMETRY'; ar.attribute_name = 'aux'
        af = nt.nodes.new('ShaderNodeAttribute'); af.attribute_type = 'INSTANCER'; af.attribute_name = 'bxl_trlamp'
        nt.links.new(ar.outputs['Fac'], g.inputs['Role']); nt.links.new(af.outputs['Fac'], g.inputs['Flags'])
        g.inputs['Gain'].default_value = gain
        nt.links.new(g.outputs['Factor'], sc_.inputs['Scale'])
    else: sc_.inputs['Scale'].default_value = gain
    nt.links.new(sc_.outputs[0], b_.inputs['Emission Color']); b_.inputs['Emission Strength'].default_value = 1.0
    if bc.is_linked: nt.links.remove(bc.links[0])
    bc.default_value = (0.0, 0.0, 0.0, 1.0)
    try: b_.inputs['Specular IOR Level'].default_value = 0.0
    except Exception: pass
    mat['bxl_unlit'] = 1


def setup_trains(C):
    """the rail cars (city/trains/mats.js): tr:lamps, tr:lit, tr:signs are unlit in the web (MeshBasicMaterial) and lit
    by gains that follow the night level; tr:interior glows by its own albedo after dark. The lamps' per-car flags come from
    BX-SEQ's mov file (trains: lamps [fw, fr, rw, rr], doors) matched to the instances by position, written as bxl_trlamp
    on the moving point clouds (key frames) or on BX-SEQ's Empties (takes); the role per vertex is the kit's aux."""
    if C.opt('notrains') is not None: return
    n = float(C.LS.get('night') or 0)
    names = {d['id']: d.get('name') or '' for d in C.man.get('mats', [])}
    tr = {mid: nm for mid, nm in names.items() if nm.startswith('tr:')}
    if not tr: return
    ng = train_group()
    gains = {'tr:lamps': 2.2 + 5.0 * n, 'tr:lit': 1.15 + 1.6 * n, 'tr:signs': 1.0 + 1.2 * n}
    done = 0
    for m in bpy.data.materials:
        mm = re.match(r'm(\d+)', m.name)
        if not mm or int(mm.group(1)) not in tr: continue
        nm = tr[int(mm.group(1))]
        if nm in gains:
            unlit(m, gains[nm], (ng, gains[nm]) if nm == 'tr:lamps' else None); done += 1
        elif nm == 'tr:interior' and not m.get('bxl_trint') and m.use_nodes:
            b_ = next((nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
            if b_:
                bc = b_.inputs['Base Color']; nt = m.node_tree
                sv = nt.nodes.new('ShaderNodeVectorMath'); sv.operation = 'SCALE'; sv.inputs['Scale'].default_value = (0.08 + 0.92 * n) * 1.6
                if bc.is_linked: nt.links.new(bc.links[0].from_socket, sv.inputs[0])
                else: sv.inputs[0].default_value = tuple(bc.default_value)[:3]
                nt.links.new(sv.outputs[0], b_.inputs['Emission Color']); b_.inputs['Emission Strength'].default_value = 1.0
                m['bxl_trint'] = 1; done += 1
    C.T['trains'] = {'materials': done, 'gain_lamps': round(gains['tr:lamps'], 3)}
    train_flags(C)


def train_flags(C):
    """bxl_trlamp per train car instance, from the mov file's train records at this frame (matched by position)."""
    M = getattr(C, 'mov', None)
    if M is None:
        try: M = _j(os.path.join(C.H, f'mov_{C.shot}.json'))
        except Exception: M = False
        C.mov = M
    if not M or not M.get('trains'): return
    T = M['trains']
    nrec = len(T)
    try: keys = [k['frame'] for k in C.man['shots'][C.shot]['key']]
    except Exception: keys = [0, 54, 107]
    if nrec == int(M.get('frames', 0)): rec = T[min(C.frame, nrec - 1)]
    else: rec = T[min(range(nrec), key=lambda k: abs((keys[k] if k < len(keys) else 0) - C.frame))]
    if not rec: return
    from mathutils import kdtree
    kd = kdtree.KDTree(len(rec))
    for i, c in enumerate(rec): kd.insert(b3(C, (c['x'], c['y'], c['z'])), i)
    kd.balance()
    def flags(c):
        L = c.get('lamps') or [0, 0, 0, 0]
        return int(L[0]) + 2 * int(L[1]) + 4 * int(L[2]) + 8 * int(L[3]) + (16 if (c.get('doors') or 0) > 0.05 else 0) + 32
    lamp_mids = {d['id'] for d in C.man.get('mats', []) if (d.get('name') or '') == 'tr:lamps'}
    nset = 0
    # key frames: the moving point clouds of the trains' lamp sets; takes: BX-SEQ's Empties (one per instance)
    for o in C.sc.objects:
        is_pc = o.type == 'POINTCLOUD' and 'train' in o.name.lower()
        is_e = o.type == 'EMPTY' and o.instance_collection is not None and 'train' in (o.get('nyc_kind') or o.name).lower()
        if not (is_pc or is_e): continue
        if is_pc:
            pts = o.data.attributes['position']; npt = len(pts.data)
            co = np.zeros(npt * 3, np.float32); pts.data.foreach_get('vector', co); co = co.reshape(-1, 3)
            vals = np.zeros(npt, np.float32)
            for i in range(npt):
                _, idx, dist = kd.find(o.matrix_world @ mathutils.Vector(co[i]))
                vals[i] = flags(rec[idx]) if dist < 3.0 else 32
            a = o.data.attributes.get('bxl_trlamp') or o.data.attributes.new('bxl_trlamp', 'FLOAT', 'POINT')
            a.data.foreach_set('value', vals); nset += npt
        else:
            _, idx, dist = kd.find(o.matrix_world.translation)
            o['bxl_trlamp'] = float(flags(rec[idx]) if dist < 3.0 else 32); nset += 1
    # the role per vertex on the lamp meshes: aux from the harvest blob of the same geometry (vertex count and bounds)
    geos = {g['id']: g for g in C.man['geos'] if any(L['name'] == 'aux' for L in g['layout'])}
    byn = {}
    for gid, g in geos.items(): byn.setdefault(next(L['count'] for L in g['layout'] if L['name'] == 'position'), []).append(gid)
    cache, nm = {}, 0
    for me in bpy.data.meshes:
        if 'aux' in me.attributes or not any(mt and re.match(r'm(\d+)', mt.name) and int(re.match(r'm(\d+)', mt.name).group(1)) in lamp_mids for mt in me.materials): continue
        cands = byn.get(len(me.vertices))
        if not cands: continue
        co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        for gid in cands:
            if gid not in cache: cache[gid] = load_geo(C.H, geos[gid])
            P = cache[gid]['position']
            if np.allclose(P.min(axis=0), co.min(axis=0), atol=2e-3) and np.allclose(P.max(axis=0), co.max(axis=0), atol=2e-3):
                at = me.attributes.new('aux', 'FLOAT', 'POINT'); at.data.foreach_set('value', np.asarray(cache[gid]['aux'], np.float32).ravel()); nm += 1
                break
    C.T['train_flags'] = {'instances': nset, 'cars_in_mov': len(rec), 'lamp_meshes': nm}


# ---------------------------------------------------------------------------------------------------------- the far city
def setup_far(C):
    """the far macro city (a MeshBasicMaterial with the web's nearMask / nearR uniforms) is exported unmasked: the web
    discards its cells where the detailed tiles are loaded, the export does not, so 100-150 m boxes stood in front of the
    street in the dusk frame (t7StreetGlide f000, 400 m out on 125th St). Hidden here until the writer masks it (BX-SEQ's
    far ring); --keepfar shows it."""
    if C.opt('keepfar') is not None: return
    # the macro buildings only (unlit, vertex-coloured); the terrain grid shares the mask uniforms and stays
    far = {d['id'] for d in C.man.get('mats', []) if 'nearMask' in (d.get('uni') or {}) and d.get('type') == 'MeshBasicMaterial'}
    if not far: return
    n = 0
    for o in C.sc.objects:
        if o.type != 'MESH' or not o.data.materials: continue
        mids = set()
        for m in o.data.materials:
            mm = re.match(r'm(\d+)', m.name) if m else None
            if mm: mids.add(int(mm.group(1)))
        if mids and mids <= far: o.hide_render = True; n += 1
    C.T['far_hidden'] = n


# ---------------------------------------------------------------------------------------------------------- night fill
def setup_fill(C):
    """night legibility (round 2): the web lights every surface with unoccluded hemisphere light (its AO passes only
    darken creases); Cycles' dome is blocked under the viaduct and inside crowns, so structure there went near black
    (the arch 46 against the web's 74, the crowns 9 against 44). The fill gives back what the occlusion takes, for camera
    and glossy rays only (no light added to the scene): albedo x the web's hemisphere radiance at the normal (up / down
    blend, as three's hemisphere light) x (1 - AO over --filldist m) x --fill (night 1.0; 0 elsewhere)."""
    # x3 matches the web's means under the viaduct (night f000: the arch 75 / 74, the deck 79 / 73, the crowns 37 / 44) but
    # flattens the viaduct into a milky grey at 1:1; x2 keeps its modelling and stays legible (the lead: darker than the
    # web is fine where it is physically right, if it reads)
    kf = float(C.opt('fill', str(FILL_K.get(C.mode, 0.0) if _phys(C) is None else 0.0)))   # R3-PHYS: no fill
    hemi = getattr(C, 'hemi', None)
    if kf <= 0: return
    if not hemi:
        # golden / day: the rig's hemisphere lights from lights.json, the sky's only (the warm bounce one is Cycles' own)
        lj = {}
        try: lj = _j(os.path.join(C.Hl, 'lights.json'))
        except Exception: pass
        hs = [L for L in lj.get('lights', []) if L.get('type') == 'HemisphereLight' and L.get('visible', True)][:1]
        up, dn = [0.0] * 3, [0.0] * 3
        for L in hs:
            w = float(L.get('intensity', 0)) / math.pi
            for c in range(3): up[c] += w * L['color'][c]; dn[c] += w * L.get('groundColor', L['color'])[c]
        if not hs: return
        hemi = (up, dn)
    up, dn = hemi
    dist = float(C.opt('filldist', '10'))
    use_ao = C.opt('fillao') is not None
    # which surfaces: 'structure' (default: the viaducts, whose paint the harvest records as vk uniforms, and the trees'
    # crowns and bark) or 'all'. Lamp-lit walls and roads already read at the web's level; a fill there flattens them
    # (night f000, x3 on everything: the left wall 149 -> 170 against the web's 157, the BBQ block 73 -> 90 against 68)
    sel = C.opt('fillsel', 'structure')
    vk = {d['id'] for d in C.man.get('mats', []) if 'vkPaint' in (d.get('uni') or {})}
    def wanted(m):
        if sel == 'all': return True
        nm = m.name.lower()
        if '_leaf' in nm or 'bark' in nm or 'trunk' in nm or nm.startswith('bxt_'): return True   # BX-TREES: bxt_leaf / bark / imp
        mm = re.match(r'm(\d+)', m.name)
        return bool(mm and int(mm.group(1)) in vk)
    n = 0
    for m in bpy.data.materials:
        if not m.use_nodes or m.get('bxl_fill') or m.get('bxl_lum') or m.get('bxl_lamp'): continue
        if not wanted(m): continue
        nt = m.node_tree
        b_ = next((nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
        if not b_: continue
        bc = b_.inputs['Base Color']
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sz.inputs[0])
        w = nt.nodes.new('ShaderNodeMath'); w.operation = 'MULTIPLY_ADD'; w.inputs[1].default_value = 0.5; w.inputs[2].default_value = 0.5
        nt.links.new(sz.outputs['Z'], w.inputs[0])
        hm = nt.nodes.new('ShaderNodeMix'); hm.data_type = 'RGBA'; nt.links.new(w.outputs[0], hm.inputs['Factor'])
        hm.inputs[6].default_value = (dn[0] * kf, dn[1] * kf, dn[2] * kf, 1.0); hm.inputs[7].default_value = (up[0] * kf, up[1] * kf, up[2] * kf, 1.0)
        lp = nt.nodes.new('ShaderNodeLightPath')
        vis = nt.nodes.new('ShaderNodeMath'); vis.operation = 'MAXIMUM'
        nt.links.new(lp.outputs['Is Camera Ray'], vis.inputs[0]); nt.links.new(lp.outputs['Is Glossy Ray'], vis.inputs[1])
        if use_ao:
            # (1 - AO): only where the dome is blocked; the AO node traces rays at every shading point (night f000 at half
            # resolution: 131 s against 15 s), hence off by default
            ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = dist
            try: ao.samples = 2
            except Exception: pass
            occ = nt.nodes.new('ShaderNodeMath'); occ.operation = 'SUBTRACT'; occ.inputs[0].default_value = 1.0
            nt.links.new(ao.outputs['AO'], occ.inputs[1])
            k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; nt.links.new(occ.outputs[0], k.inputs[0]); nt.links.new(vis.outputs[0], k.inputs[1])
        else: k = vis
        alb = nt.nodes.new('ShaderNodeMix'); alb.data_type = 'RGBA'; alb.blend_type = 'MULTIPLY'; alb.inputs['Factor'].default_value = 1.0
        if bc.is_linked: nt.links.new(bc.links[0].from_socket, alb.inputs[6])
        else: alb.inputs[6].default_value = bc.default_value
        nt.links.new(hm.outputs[2], alb.inputs[7])
        fv = nt.nodes.new('ShaderNodeVectorMath'); fv.operation = 'SCALE'; nt.links.new(alb.outputs[2], fv.inputs[0]); nt.links.new(k.outputs[0], fv.inputs['Scale'])
        es, ec = b_.inputs['Emission Strength'], b_.inputs['Emission Color']
        if es.is_linked or es.default_value > 0:
            # an emitter already: its own emission plus the fill (divided by its strength)
            sv = es.default_value if not es.is_linked else 1.0
            add = nt.nodes.new('ShaderNodeVectorMath'); add.operation = 'MULTIPLY_ADD'
            nt.links.new(fv.outputs[0], add.inputs[0]); add.inputs[1].default_value = (1.0 / max(sv, 1e-6),) * 3
            if ec.is_linked: nt.links.new(ec.links[0].from_socket, add.inputs[2])
            else: add.inputs[2].default_value = ec.default_value[:3]
            nt.links.new(add.outputs[0], ec)
        else:
            nt.links.new(fv.outputs[0], ec); es.default_value = 1.0
            try: m.cycles.emission_sampling = 'NONE'   # the fill is not a light: no light-tree entries for it
            except Exception: pass
        m['bxl_fill'] = 1; n += 1
    C.T['fill'] = {'k': kf, 'ao': use_ao, 'sel': sel, 'dist': dist, 'materials': n, 'viaduct_mats': len(vk)}


# ---------------------------------------------------------------------------------------------------------- emitters
def setup_emitters(C):
    """the exported emitters (luminaire lenses, signals, screens, the kit's lit interiors): three's emissive radiance is
    Cycles' emission strength 1 at the same exposure; --emit scales them all (default 1: as the web)."""
    k = float(C.opt('emit', '1.0'))
    n = 0
    for m in bpy.data.materials:
        if not m.use_nodes or m.get('bxl_lamp'): continue
        b = next((nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
        if not b: continue
        es = b.inputs['Emission Strength']; ec = b.inputs['Emission Color']
        lit = ec.is_linked or max(ec.default_value[:3]) > 0
        if es.default_value > 0 and lit and (ec.is_linked or ec.default_value[:3] != (1.0, 1.0, 1.0) or True):
            if k != 1.0: es.default_value *= k
            n += 1
    C.T['emitters'] = n
    # BX-FIX (2026-10-04): the mesh emitters out of the light tree (--emisamp auto keeps Cycles' choice). With them in it, the
    # lit windows, signs, screens and the kit's lit rooms (millions of emissive triangles at night) took most of the next-
    # event samples and the 763 street lamps got a few percent each: every lamp sample came back 20-50x its mean, and the
    # denoiser turned those fireflies into blotches that moved from frame to frame (the night takes' flicker; the web casts
    # no light from them at all, so they light nothing by next-event here and keep their glow for the camera and reflections)
    es_mode = C.opt('emisamp', 'none').upper()
    if es_mode in ('NONE', 'AUTO', 'FRONT', 'BACK', 'FRONT_BACK'):
        ne = 0
        for m in bpy.data.materials:
            try:
                if m.cycles.emission_sampling != es_mode: m.cycles.emission_sampling = es_mode; ne += 1
            except Exception: pass
        C.T['emission_sampling'] = {'mode': es_mode, 'materials': ne}
    # the street luminaires' lenses (the props kit's 'lum', o<i>_pk_lum): the web draws them at 3.2 and its lamp heads still
    # read 223 with a ~60 px halo at 2560 wide (t7DinoGlide f000), a real LED lens is orders brighter than the road; here
    # the lens is x --lumk (25) for camera and glossy rays only, so the head saturates and blooms (the bloom's 4.0 cap
    # bounds the halo) while its light stays the IES lamp's (no double lighting from the mesh)
    lk = float(C.opt('lumk', '25'))
    nl = 0
    if lk != 1.0:
        # the lamp lenses: warm-white emitters without a map, at least 0.9 (the props kit's luminaires, the viaducts' globes
        # and lanterns), not the facade kit's lit interiors (fk:*)
        lens = set()
        for d in C.man.get('mats', []):
            e = d.get('emissive') or [0, 0, 0]; ei = float(d.get('emissiveIntensity', 1) or 0)
            if (d.get('name') or '').startswith(('fk:', 'tr:')) or 'emissiveMap' in (d.get('maps') or {}): continue
            if max(e) * ei >= 0.9 and e[0] >= 0.99 and 0.6 <= e[1] <= 0.95 and 0.3 <= e[2] <= 0.8: lens.add(d['id'])
        mats = set()
        for m in bpy.data.materials:
            mm = re.match(r'm(\d+)', m.name)
            if mm and int(mm.group(1)) in lens: mats.add(m)
        C.T['lens_mats'] = sorted(lens)
        for m in mats:
            if not m.use_nodes or m.get('bxl_lum'): continue
            nt = m.node_tree
            b_ = next((nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
            if not b_: continue
            lp = nt.nodes.new('ShaderNodeLightPath')
            mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'
            nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); nt.links.new(lp.outputs['Is Glossy Ray'], mx.inputs[1])
            k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'
            k.inputs[1].default_value = (lk - 1.0) * b_.inputs['Emission Strength'].default_value; k.inputs[2].default_value = b_.inputs['Emission Strength'].default_value
            nt.links.new(mx.outputs[0], k.inputs[0]); nt.links.new(k.outputs[0], b_.inputs['Emission Strength'])
            m['bxl_lum'] = 1; nl += 1
    C.T['lum_lenses'] = nl
    # the windows (BX-WIN's node group BXW_Params, docs/notes/ar34-bx-light.md): Night = the take's night level, Emit =
    # BX-LIGHT's calibration of the rooms' radiance against the web (1.0 = the web's own radiance through the same exposure
    # and tone curve; --winemit overrides, as it does for blender_windows.py)
    ng = bpy.data.node_groups.get('BXW_Params')
    if ng:
        if C.opt('winnight') is None and 'Night' in ng.nodes: ng.nodes['Night'].outputs[0].default_value = float(C.LS.get('night') or 0)
        if 'Emit' in ng.nodes: ng.nodes['Emit'].outputs[0].default_value = float(C.opt('winemit', str(WIN_EMIT.get(C.mode, 1.0))))
        C.T['windows'] = {k: round(ng.nodes[k].outputs[0].default_value, 3) for k in ('Emit', 'Night') if k in ng.nodes}


# ---------------------------------------------------------------------------------------------------------- the film look
class Comp:
    def __init__(self, sc):
        sc.use_nodes = True
        self.nt = sc.node_tree
        for n in list(self.nt.nodes): self.nt.nodes.remove(n)
        self.N, self.L = self.nt.nodes, self.nt.links

    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.N.new('CompositorNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = float(v)
            else: self.L.new(v, n.inputs[i])
        return n.outputs[0]

    def sep(self, img):
        n = self.N.new('CompositorNodeSeparateColor'); n.mode = 'RGB'; self.L.new(img, n.inputs[0])
        return [n.outputs[0], n.outputs[1], n.outputs[2]]

    def comb(self, c):
        n = self.N.new('CompositorNodeCombineColor'); n.mode = 'RGB'
        for i in range(3): self.L.new(c[i], n.inputs[i])
        n.inputs[3].default_value = 1.0
        return n.outputs[0]

    def mat3(self, M, c):
        """rows of M times the channel sockets c."""
        out = []
        for r in M:
            acc = self.m('MULTIPLY', c[0], r[0])
            acc = self.m('MULTIPLY_ADD', c[1], r[1], acc)
            acc = self.m('MULTIPLY_ADD', c[2], r[2], acc)
            out.append(acc)
        return out

    def smooth(self, e0, e1, x):
        t = self.m('MULTIPLY_ADD', x, 1.0 / (e1 - e0), -e0 / (e1 - e0), clamp=True)
        return self.m('MULTIPLY', self.m('MULTIPLY', t, t), self.m('MULTIPLY_ADD', t, -2.0, 3.0))

    def luma(self, c):
        return self.m('MULTIPLY_ADD', c[2], 0.0722, self.m('MULTIPLY_ADD', c[1], 0.7152, self.m('MULTIPLY', c[0], 0.2126)))


def agx_three(cp, c):
    """three.js r185 AgXToneMapping (tonemapping_pars_fragment), on linear sRGB channels already x exposure."""
    to2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]]
    inset = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583],
             [0.137318972929847, 0.761241990602591, 0.101439036467562],
             [0.11189821299995, 0.0767994186031903, 0.811302368396859]]
    outset = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
              [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
              [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]]
    to709 = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]]
    lo, hi = -12.47393, 4.026069
    c = cp.mat3(to2020, c); c = cp.mat3(inset, c)
    o = []
    for x in c:
        x = cp.m('MAXIMUM', x, 1e-10)
        x = cp.m('LOGARITHM', x, 2.0)
        x = cp.m('MULTIPLY_ADD', x, 1.0 / (hi - lo), -lo / (hi - lo), clamp=True)
        # 15.5 x^6 - 40.14 x^5 + 31.96 x^4 - 6.868 x^3 + 0.4298 x^2 + 0.1191 x - 0.00232 (Horner)
        p = cp.m('MULTIPLY_ADD', x, 15.5, -40.14)
        for k in (31.96, -6.868, 0.4298, 0.1191, -0.00232): p = cp.m('MULTIPLY_ADD', p, x, k)
        o.append(p)
    c = cp.mat3(outset, o)
    c = [cp.m('POWER', cp.m('MAXIMUM', x, 0.0), 2.2) for x in c]
    c = cp.mat3(to709, c)
    return [cp.m('MINIMUM', cp.m('MAXIMUM', x, 0.0), 1.0) for x in c]


def srgb_oetf(cp, c):
    out = []
    for x in c:
        lin = cp.m('MULTIPLY', x, 12.92)
        pw = cp.m('MULTIPLY_ADD', cp.m('POWER', cp.m('MAXIMUM', x, 1e-9), 1.0 / 2.4), 1.055, -0.055)
        sel = cp.m('GREATER_THAN', x, 0.0031308)
        out.append(cp.m('MULTIPLY_ADD', sel, cp.m('SUBTRACT', pw, lin), lin))
    return out


def vignette_image(W, H, vig):
    if vig <= 1e-4: return None
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    qx, qy = (x + 0.5) / W - 0.5, (y + 0.5) / H - 0.5
    v = 1.0 - vig * smooth(0.35, 0.95, (qx * qx + qy * qy) * 2.6)
    rgba = np.stack([v, v, v, np.ones_like(v)], -1)
    return float_image('bxl_vignette', W, H, rgba, 'Non-Color')


def setup_film(C):
    sc, LS = C.sc, C.LS
    expo = float(LS.get('exposure') or 1.0)
    LF = C.LF
    if LF and C.frame < len(LF) and LF[C.frame] and LF[C.frame].get('exposure'): expo = float(LF[C.frame]['exposure'])
    PH = _phys(C)   # R3-PHYS: the exposure fixed per time of day
    if PH is not None and (PH.get('exposure') or {}).get(C.mode): expo = float(PH['exposure'][C.mode])
    expo *= 2.0 ** float(C.opt('exposure', '0'))
    C.T['exposure'] = round(expo, 4)
    C.T['light'] = 'web' if PH is None else 'phys'
    if C.opt('nograde') is not None:
        sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = math.log2(max(1e-4, expo)); return
    vl = sc.view_layers[0]
    vl.use_pass_position = True; vl.use_pass_z = True
    cp = Comp(sc)
    rl = cp.N.new('CompositorNodeRLayers')
    img = rl.outputs['Image']
    pos_s, dep_s = rl.outputs['Position'], rl.outputs['Depth']
    if getattr(C, 'test_image', None):   # a still through the chain (tests): its own image in place of the render
        ti = cp.N.new('CompositorNodeImage'); ti.image = C.test_image; img = ti.outputs['Image']
        if 'Position' in ti.outputs: pos_s = ti.outputs['Position']
        if 'Depth' in ti.outputs: dep_s = ti.outputs['Depth']
    if C.opt('bxlexr'):   # the raw passes for compositor work without a render (multilayer EXR: Image, Position, Depth)
        fo = cp.N.new('CompositorNodeOutputFile'); fo.format.file_format = 'OPEN_EXR_MULTILAYER'; fo.format.color_depth = '32'
        fo.base_path = C.opt('bxlexr')
        fo.layer_slots.clear()
        for nm, so in (('Image', img), ('Position', pos_s), ('Depth', dep_s)):
            fo.layer_slots.new(nm); cp.L.new(so, fo.inputs[nm])
    # BX-FIX (2026-10-04): the Depth pass (camera z) for bx_temporal.py as a 16-bit PNG, (log2(z) + 2) / 18 (0.25 m to 65 km,
    # 0.02 % steps); muted here, blender_take.py points it at <take>/_depth/ and unmutes it
    if C.opt('nodepthout') is None:
        fo = cp.N.new('CompositorNodeOutputFile'); fo.name = fo.label = 'BXFIX_depth'
        fo.format.file_format = 'PNG'; fo.format.color_mode = 'BW'; fo.format.color_depth = '16'
        fo.base_path = '/tmp/bxfix_depth_unset/'; fo.file_slots[0].path = 'depth_####.png'; fo.mute = True   # (takes write without extensions)
        enc = cp.m('DIVIDE', cp.m('ADD', cp.m('LOGARITHM', cp.m('MAXIMUM', dep_s, 0.25), 2.0), 2.0), 18.0)
        cp.L.new(enc, fo.inputs[0])
    c = cp.sep(img)
    # ---- haze (core/engine.js HazePass): closed-form optical depth of exponential height fog along the ray, geometry only
    hz = LS.get('haze') or {}
    dens = float(hz.get('uDensity', 0) or 0) * float(C.opt('haze', '1.0'))
    if hz.get('enabled', True) and dens > 1e-7:
        cam = sc.camera
        cpos = cam.matrix_world.translation
        C.T['campos'] = [round(float(v), 4) for v in cpos]
        P = cp.sep(pos_s)
        d = [cp.m('SUBTRACT', P[i], float(cpos[i])) for i in range(3)]
        dist = cp.m('SQRT', cp.m('MULTIPLY_ADD', d[2], d[2], cp.m('MULTIPLY_ADD', d[1], d[1], cp.m('MULTIPLY', d[0], d[0]))))
        dist = cp.m('MINIMUM', dist, 14000.0)
        rdz = cp.m('DIVIDE', d[2], cp.m('MAXIMUM', dist, 1e-3))
        fall = float(hz.get('uFalloff', 0.012)); base = float(hz.get('uBaseY', 0.0))
        h0 = float(cpos[2]) + float(C.og[1]) - base
        x = cp.m('MULTIPLY', cp.m('MULTIPLY', rdz, fall), dist)
        x = cp.m('ADD', x, 1e-6)
        g = cp.m('DIVIDE', cp.m('SUBTRACT', 1.0, cp.m('EXPONENT', cp.m('MULTIPLY', x, -1.0))), x)
        od = cp.m('MULTIPLY', cp.m('MULTIPLY', g, dist), dens * math.exp(-h0 * fall))
        T = cp.m('EXPONENT', cp.m('MULTIPLY', od, -1.0))
        tmin = float(hz.get('uTmin', 0.0))
        T = cp.m('MULTIPLY_ADD', T, 1.0 - tmin, tmin)
        # the sky (no hit: depth past 1e9) keeps its own scattering (uSkyAmt 0)
        sky = cp.m('GREATER_THAN', dep_s, 1e9)
        T = cp.m('MAXIMUM', T, sky)
        # scattered colour: the fog colour, bluer away from the sun (uBlue), plus the sun's capped HG glow when it is up
        fc = hz.get('uFogCol') or [0.5, 0.5, 0.5]; sc_ = hz.get('uSunCol') or [1, 1, 1]; sd = hz.get('uSunDir') or [0, 1, 0]
        sdb = bdir(sd).normalized()
        mu = cp.m('DIVIDE', cp.m('MULTIPLY_ADD', d[2], float(sdb.z), cp.m('MULTIPLY_ADD', d[1], float(sdb.y), cp.m('MULTIPLY', d[0], float(sdb.x)))), cp.m('MAXIMUM', dist, 1e-3))
        gg = float(hz.get('uG', 0.55)); g2 = gg * gg
        ph = cp.m('MULTIPLY', cp.m('POWER', cp.m('MULTIPLY_ADD', mu, -2.0 * gg, 1.0 + g2), -1.5), (1.0 - g2) * 0.25)
        sun_up = float(smooth(-0.06, 0.12, np.array(sd[1])))
        glow = cp.m('MULTIPLY', cp.m('MINIMUM', cp.m('MULTIPLY', ph, float(hz.get('uSunBoost', 1.0))), float(hz.get('uGlowMax', 0.9))), sun_up)
        blue = float(hz.get('uBlue', 0.0))
        away = cp.m('MULTIPLY_ADD', mu, -0.5, 0.5)
        up = cp.smooth(-0.25, 0.35, rdz)
        bk = cp.m('MULTIPLY', cp.m('MAXIMUM', away, up), blue)   # mix(0.45, 1, max(away, up)) ~ max(away, up) here
        tint = (0.70, 0.87, 1.26)
        scat = [cp.m('MULTIPLY_ADD', glow, float(sc_[i]), cp.m('MULTIPLY', cp.m('MULTIPLY_ADD', bk, tint[i] - 1.0, 1.0), float(fc[i]))) for i in range(3)]
        c = [cp.m('MULTIPLY_ADD', cp.m('SUBTRACT', c[i], scat[i]), T, scat[i]) for i in range(3)]
        C.T['haze'] = {'density': dens, 'tmin': tmin, 'blue': blue}
    lin = cp.comb(c)
    # ---- bloom: three's UnrealBloomPass rebuilt (the Glare node's bloom is narrower and has no knee): the high pass
    # (BT.601 luma, smoothstep(threshold, threshold + smoothWidth): GL36's 2.0-wide knee after dark, 0.01 by day; BC26's
    # 4.0 cap after dark), then five Gaussians matching its mip chain (half resolution down to 1/32 with 3-11 texel
    # kernels: sigma ~0.0023, 0.0082, 0.0234, 0.061, 0.150 of the width, cumulative) weighted by its radius-lerped factors
    # (mix(f, 1.2 - f, radius), f = 1.0, 0.8, 0.6, 0.4, 0.2), x strength, added to the frame
    bl = LS.get('bloom') or {}
    bk_ = float(C.opt('bloom', '1.0'))
    if bl.get('enabled', True) and bk_ > 0:
        thr = float(bl.get('threshold', 2.3)); sw = max(1e-3, float(bl.get('smoothWidth', 0.01) or 0.01))
        cap = bl.get('max'); rad = float(bl.get('radius', 0.3)); st = float(bl.get('strength', 0.1)) * bk_
        cc = cp.sep(lin)
        l601 = cp.m('MULTIPLY_ADD', cc[2], 0.114, cp.m('MULTIPLY_ADD', cc[1], 0.587, cp.m('MULTIPLY', cc[0], 0.299)))
        a = cp.smooth(thr, thr + sw, l601)
        hp = [cp.m('MULTIPLY', x, a) for x in cc]
        if cap and cap < 100: hp = [cp.m('MINIMUM', x, float(cap)) for x in hp]
        hpi = cp.comb(hp)
        Wd = sc.render.resolution_x * sc.render.resolution_percentage / 100.0
        acc = None
        for f, sg in zip((1.0, 0.8, 0.6, 0.4, 0.2), (0.0023, 0.0082, 0.0234, 0.061, 0.150)):
            bn = cp.N.new('CompositorNodeBlur'); bn.filter_type = 'FAST_GAUSS'
            px = max(1, int(round(3.0 * sg * Wd * float(C.opt('bloomsize', '1.0')))))
            try: bn.inputs['Size'].default_value = (px, px)
            except Exception:
                try: bn.inputs['Size'].default_value = px
                except Exception: pass
            try: bn.size_x = px; bn.size_y = px
            except Exception: pass
            cp.L.new(hpi, bn.inputs['Image'])
            wgt = (f + (1.2 - 2 * f) * rad) * st
            sp = cp.sep(bn.outputs['Image'])
            acc = [cp.m('MULTIPLY', x, wgt) for x in sp] if acc is None else [cp.m('MULTIPLY_ADD', x, wgt, y) for x, y in zip(sp, acc)]
        lin = cp.comb([cp.m('ADD', x, y) for x, y in zip(cc, acc)])
        C.dbg0 = {'hp': hp, 'bloom': acc, 'pre': cc}
        C.T['bloom'] = {'threshold': round(thr, 3), 'knee': round(sw, 3), 'strength': round(st, 3), 'radius': rad, 'cap': cap}
    # ---- exposure, three's AgX, the sRGB encoding
    c = cp.sep(lin)
    c = [cp.m('MULTIPLY', x, expo) for x in c]
    C.expo_nodes = [x.node for x in c]   # a take sets them per frame (frame())
    C.dbg = {'expo': c}
    c = agx_three(cp, c); C.dbg['agx'] = c
    c = srgb_oetf(cp, c); C.dbg['oetf'] = c
    # ---- the grade (core/engine.js GradeShader, display-referred)
    gr = LS.get('grade') or {}
    blk, wht = float(gr.get('uBlk', 0)), float(gr.get('uWht', 1))
    if blk > 1e-5 or abs(wht - 1) > 1e-5:
        s = 1.0 / max(wht - blk, 0.5)
        c = [cp.m('MULTIPLY_ADD', x, s, -blk * s, clamp=True) for x in c]
    con = float(gr.get('uCon', 0))
    if con > 1e-5:
        c = [cp.m('MULTIPLY_ADD', cp.m('SUBTRACT', cp.m('MULTIPLY', cp.m('MULTIPLY', x, x), cp.m('MULTIPLY_ADD', x, -2.0, 3.0)), x), con, x) for x in c]
    hi = float(gr.get('uHi', 0))
    if hi > 1e-5:
        c = [cp.m('MULTIPLY_ADD', cp.m('MULTIPLY', cp.smooth(0.55, 1.0, x), cp.m('SUBTRACT', 1.0, x)), 4.0 * hi, x) for x in c]
    warm, tg = float(gr.get('uWarm', 0)), float(gr.get('uTintG', 0))
    if abs(warm) > 1e-5 or abs(tg) > 1e-5:
        l0 = cp.luma(c)
        if abs(warm) > 1e-5:
            shW = cp.m('SUBTRACT', 1.0, cp.smooth(0.10, 0.72, l0))
            c = [cp.m('MULTIPLY_ADD', shW, k, x) for x, k in zip(c, (warm, warm * 0.45, -warm * 0.6))]
        if abs(tg) > 1e-5:
            w = cp.m('MULTIPLY_ADD', l0, 0.65, 0.35)
            c = [cp.m('MULTIPLY_ADD', w, k, x) for x, k in zip(c, (-tg * 0.55, tg, -tg * 0.4))]
    C.dbg['con'] = c
    sat = float(gr.get('uSat', 1.0))
    l = cp.luma(c)
    if abs(sat - 1) > 1e-5: c = [cp.m('MULTIPLY_ADD', cp.m('SUBTRACT', x, l), sat, l) for x in c]
    il = cp.m('SUBTRACT', 1.0, l)
    c = [cp.m('MULTIPLY_ADD', il, k, x) for x, k in zip(c, (0.005, 0.006, 0.01))]
    C.dbg['lift'] = c
    vimg = vignette_image(sc.render.resolution_x, sc.render.resolution_y, float(gr.get('uVig', 0)))
    if vimg:
        vn = cp.N.new('CompositorNodeImage'); vn.image = vimg
        vs = cp.sep(vn.outputs['Image'])[0]
        c = [cp.m('MULTIPLY', x, vs) for x in c]
    out = cp.comb([cp.m('MINIMUM', cp.m('MAXIMUM', x, 0.0), 1.0) for x in c])
    comp = cp.N.new('CompositorNodeComposite'); cp.L.new(out, comp.inputs['Image'])
    sc.view_settings.view_transform = 'Raw'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0; sc.view_settings.gamma = 1.0
    sc.render.use_compositing = True
    C.T['grade'] = {k: gr.get(k) for k in ('uSat', 'uCon', 'uBlk', 'uWht', 'uWarm', 'uVig', 'uHi')}
    C.T['comp_nodes'] = len(cp.N)


# ---------------------------------------------------------------------------------------------------------- entry
def apply(sc, root_data, opt, T, frame):
    H = opt('harvest') or root_data.get('harvest')
    if not H or not os.path.exists(os.path.join(H, 'light_static.json')):
        print('[bx-light] no --harvest with light_static.json: the pilot rig is kept'); return
    C = Ctx()
    C.sc, C.opt, C.T, C.H = sc, opt, {}, H
    C.LS = _j(os.path.join(H, 'light_static.json'))
    C.Hl = H
    C.man = _j(os.path.join(H, 'manifest.json'))
    C.mode = C.LS.get('mode') or 'golden'
    C.shot = root_data.get('shot') or next(iter(C.man.get('shots', {}) or {'?': 0}))
    C.frame = int(frame)
    C.og = list(root_data.get('origin') or [0.0, 0.0, 0.0])
    try: C.LF = _j(os.path.join(H, f'light_{C.shot}.json'))
    except Exception: C.LF = None
    # the sky domes may come from a light-only pass of the same shot (--skyfrom <dir>)
    sf = opt('skyfrom')
    if sf and os.path.exists(os.path.join(sf, 'light_static.json')):
        L2 = _j(os.path.join(sf, 'light_static.json'))
        C.LS['skyVis'], C.LS['skyEnv'] = L2.get('skyVis'), L2.get('skyEnv')
        C.Hsky = sf
    for step in (setup_sky, setup_sun_moon, setup_far, setup_lamps, setup_vehicles, setup_trains, setup_emitters, setup_fill, setup_film, setup_ambient):
        try:
            if step is setup_sky and getattr(C, 'Hsky', None):
                H0 = C.H; C.H = C.Hsky; step(C); C.H = H0
            else: step(C)
        except Exception as e:
            import traceback; traceback.print_exc()
            C.T.setdefault('errors', []).append(f'{step.__name__}: {e}')
    T['bx_light'] = C.T
    print('[bx-light] ' + json.dumps(C.T))


# ---------------------------------------------------------------------------------------------------------- ambient
# BX-DUSK (2026-10-03): the web's light probe at dusk. three's LightProbe (core/engine.js _updateProbe: a cube capture of
# the city round the lens plus N11's DC floor; intensity 0.45 in the dusk harvests, type 'Light' in lights.json, "the
# ambient's biggest term by far") lights every surface unoccluded but for the page's AO, and the world rig above leaves it
# out. Cycles' Fast GI 'Add' is that term: albedo x AMB_ADD wherever no geometry lies within AMB_DIST of the shading point
# (white; the probe's floor is (0.023, 0.030, 0.042), its capture of the lamp-lit street warm). t7StreetGlide key frames
# with the shot's lamps, sky x2 (sRGB means, Cycles / web): tower f090 65, 64, 64 / 61, 56, 58 (53, 52, 57 without it),
# Hotel Theresa f054 61, 55, 49 / 58, 46, 38 (47, 43, 42), walk f000 93, 80, 73 / 94, 79, 74 (88, 75, 69).
# --ambadd <radiance> (0 = off), --ambdist <m>; golden and night: off.
AMB_ADD = {'dusk': 0.03}


def setup_ambient(C):
    f = float(C.opt('ambadd', str(AMB_ADD.get(C.mode, 0.0) if _phys(C) is None else 0.0)))   # R3-PHYS: no probe term
    w = C.sc.world
    if f <= 0 or w is None: return
    cy = C.sc.cycles
    cy.use_fast_gi = True
    cy.fast_gi_method = 'ADD'
    try: cy.ao_bounces_render = 0
    except Exception: pass
    w.light_settings.ao_factor = f
    w.light_settings.distance = float(C.opt('ambdist', '4'))
    C.T['ambient'] = {'add': f, 'dist': w.light_settings.distance}


# ---------------------------------------------------------------------------------------------------------- BX-SEQ hooks
# blender_render.py / blender_take.py HOOKS = ['blender_light'] (docs/notes/ar34-bx-seq.md): ctx is a dict (sc, root,
# opt, T, usd, usd_dir, shot, frame, take, frames, moving). The lighting is built once (light), the film look once
# (settings); per frame the vehicle lamps follow the traffic and the exposure node follows the page's meter.
def _ctx(ctx):
    C = ctx.get('_bxl')
    if C is not None: return C if C else None
    opt = ctx['opt']; root = ctx.get('root') or {}
    H = opt('harvest') or root.get('harvest')
    if not H or not os.path.exists(os.path.join(H, 'light_static.json')) or opt('nolight') is not None:
        ctx['_bxl'] = False; return None
    C = Ctx()
    C.sc, C.opt, C.T, C.H, C.Hl = ctx['sc'], opt, {}, H, H
    C.take = bool(ctx.get('take'))   # BX-FIN: blender_take.py (BX_TAKE=1)
    C.LS = _j(os.path.join(H, 'light_static.json'))
    C.man = _j(os.path.join(H, 'manifest.json'))
    C.mode = C.LS.get('mode') or 'golden'
    C.shot = ctx.get('shot') or root.get('shot')
    C.frame = int(ctx.get('frame') or root.get('frame') or 0)
    C.og = list(root.get('origin') or [0.0, 0.0, 0.0])
    try: C.LF = _j(os.path.join(H, f'light_{C.shot}.json'))
    except Exception: C.LF = None
    sf = opt('skyfrom')
    if sf and os.path.exists(os.path.join(sf, 'light_static.json')):
        L2 = _j(os.path.join(sf, 'light_static.json')); C.LS['skyVis'], C.LS['skyEnv'] = L2.get('skyVis'), L2.get('skyEnv'); C.Hsky = sf
    ctx['_bxl'] = C
    return C


def _run(C, steps):
    for step in steps:
        try:
            if step is setup_sky and getattr(C, 'Hsky', None):
                H0 = C.H; C.H = C.Hsky; step(C); C.H = H0
            else: step(C)
        except Exception as e:
            import traceback; traceback.print_exc()
            C.T.setdefault('errors', []).append(f'{step.__name__}: {e}')


def light(ctx):
    C = _ctx(ctx)
    if not C: return False
    _run(C, (setup_sky, setup_sun_moon, setup_far, setup_lamps, cull_lamps, setup_trains, setup_emitters, setup_fill))   # BX-LEAF: cull_lamps
    return False   # the default sky and sun are edited in place, not replaced


def settings(ctx):
    C = _ctx(ctx)
    if not C: return
    _run(C, (setup_film, setup_ambient))   # BX-DUSK: setup_ambient (dusk only)


def frame(ctx, f):
    C = _ctx(ctx)
    if not C: return
    C.frame = int(f)
    # the previous frame's headlamps go; this frame's vehicles get theirs (key-frame dyn files, or SEQ's mov_<shot>.json)
    if not getattr(C, 'beams_done', False):
        old = bpy.data.collections.get('BXL_headlamps')
        if old:
            for o in list(old.objects): bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(old)
        _run(C, (setup_vehicles,))
    if C.LF and C.frame < len(C.LF) and (C.LF[C.frame] or {}).get('exposure') and _phys(C) is None:   # R3-PHYS: fixed exposure
        e = float(C.LF[C.frame]['exposure']) * 2.0 ** float(C.opt('exposure', '0'))
        for n in getattr(C, 'expo_nodes', []) or []:
            try: n.inputs[1].default_value = e
            except ReferenceError: pass


def done(ctx):
    C = _ctx(ctx)
    if C: ctx['T']['bx_light'] = C.T; print('[bx-light] ' + json.dumps(C.T))
