# BX-TREES (AR34 BX, 2026-10-02): the tree asset set's Cycles shading, for the asset builder (tools/ar34/bxtrees/
# build_trees.py) and for a scene imported from the export (blender_render.py, `--bxtrees`).
#
# Leaves: the species atlas (colour + alpha, OpenGL normal) on a two-sided leaf: the Principled BSDF (a waxy cuticle,
# roughness 0.45, the scan's relief) mixed with a Translucent BSDF (the blade's transmitted green, yellower and brighter
# than its reflectance) at `trans` (0.4); the underside (Geometry > Backfacing) paler and greyer, as a real leaf's abaxial
# side; a per-tree hue / value jitter (Object Info > Random, per instance in Cycles); the alpha clipped at 0.5 (no
# blending: a clip costs one transparent bounce per card).
# Bark: the scan's colour (times a species tint), roughness, OpenGL normal and displacement as bump.
# Wind (optional, for film): a geometry-nodes sway on the prototype meshes driven by the scene time: the whole crown bends
# with height squared, every leaf card flutters with its own phase (a noise of position and time); `--bxwind <m>`.
#
#   apply(tex_dir, trans=0.4, gain=1.0, wind=0.0): rebuild every material named bxt_leaf_<F> / bxt_bark_<key> in the open
#   file (the USD import keeps the writer's names) and return counts; called from blender_render.py's BX-TREES block.
import bpy, math, os

TEX = os.environ.get('BXTREES_TEX', '/data0/projectnyc_aux/assets/bxtrees/tex')
# the bark scan per species (leaves.py / build_trees.py use the same keys)
BARK_OF = {'P': 'plane', 'H': 'willow', 'Q': 'oak', 'Z': 'zelkova', 'R': 'pear', 'L': 'linden', 'M': 'maple', 'S': 'linden', 'Y': 'cherry', 'X': 'cherry', 'W': 'oak',
           'G': 'ginkgo'}   # (TREEUE: the ginkgo, second set only)
# per bark: colour tint (linear multiplier) and the scan's texel aspect (height / width)
BARK_TINT = {'plane': (0.88, 0.93, 1.06), 'willow': (0.49, 0.51, 0.56), 'oak': (1.15, 1.3, 1.6), 'zelkova': (0.48, 0.59, 0.74), 'pear': (0.46, 0.52, 0.9), 'linden': (0.6, 0.56, 0.54), 'maple': (1.4, 1.6, 1.6), 'cherry': (0.59, 0.62, 0.79)}   # (linear, per channel: each scan's mean to a bark albedo, plane 0.30 / 0.28 / 0.25, the others ~0.12-0.16)
BARK_TINT['ginkgo'] = (1.2, 1.36, 1.72)   # (TREEUE: the oak scan, a little lighter and greyer)

def _img(path, noncolor=False):
    name = os.path.basename(path)
    im = bpy.data.images.get(name)
    if im is None or im.filepath != path:
        im = bpy.data.images.load(path, check_existing=True)
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    return im

def leaf_material(F, tex=TEX, trans=0.4, gain=1.25, mat=None, name=None, per_leaf=False, opaque=False):
    # (per_leaf, TREEUE's second set: the leaf's own random value in the mesh's st1.x adds a hue (+-0.025) and value
    # (0.88-1.12) jitter per leaf over the per-tree one, and about 1 % of the leaves turn yellow-brown; opaque: its geometry
    # leaves, cut to the leaf's outline, take no alpha clip, as in UE)
    m = mat or bpy.data.materials.get(name or f'bxt_leaf_{F}') or bpy.data.materials.new(name or f'bxt_leaf_{F}')
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial'); out.location = (1200, 0)
    uv = N.new('ShaderNodeUVMap'); uv.location = (-1200, 0)
    if per_leaf: uv.uv_map = 'st'   # (the second set's meshes carry st1 too: never the active map by chance)
    ic = N.new('ShaderNodeTexImage'); ic.image = _img(f'{tex}/{F}_leaf_col.png'); ic.location = (-950, 150)
    ic.interpolation = 'Linear'
    inn = N.new('ShaderNodeTexImage'); inn.image = _img(f'{tex}/{F}_leaf_nrm.png', True); inn.location = (-950, -250)
    L.new(uv.outputs['UV'], ic.inputs['Vector']); L.new(uv.outputs['UV'], inn.inputs['Vector'])
    nm = N.new('ShaderNodeNormalMap'); nm.location = (-650, -250); nm.inputs['Strength'].default_value = 0.7
    L.new(inn.outputs['Color'], nm.inputs['Color'])
    # per-tree jitter: hue +-0.02, value 0.85-1.15 (Object Info > Random is per instance)
    oi = N.new('ShaderNodeObjectInfo'); oi.location = (-950, 450)
    hj = N.new('ShaderNodeMapRange'); hj.location = (-700, 520); hj.inputs[3].default_value = 0.48; hj.inputs[4].default_value = 0.52
    vj = N.new('ShaderNodeMapRange'); vj.location = (-700, 360); vj.inputs[3].default_value = 0.85 * gain; vj.inputs[4].default_value = 1.15 * gain
    L.new(oi.outputs['Random'], hj.inputs[0]); L.new(oi.outputs['Random'], vj.inputs[0])
    hsv = N.new('ShaderNodeHueSaturation'); hsv.location = (-450, 300)
    if per_leaf:
        u1 = N.new('ShaderNodeUVMap'); u1.uv_map = 'st1'; u1.location = (-1200, 650)
        sx = N.new('ShaderNodeSeparateXYZ'); sx.location = (-1000, 650); L.new(u1.outputs['UV'], sx.inputs['Vector'])
        hl = N.new('ShaderNodeMapRange'); hl.location = (-800, 700); hl.inputs[3].default_value = -0.025; hl.inputs[4].default_value = 0.025
        vl = N.new('ShaderNodeMapRange'); vl.location = (-800, 560); vl.inputs[3].default_value = 0.88; vl.inputs[4].default_value = 1.12
        L.new(sx.outputs['X'], hl.inputs[0]); L.new(sx.outputs['X'], vl.inputs[0])
        ha = N.new('ShaderNodeMath'); ha.operation = 'ADD'; ha.location = (-600, 640)
        L.new(hj.outputs[0], ha.inputs[0]); L.new(hl.outputs[0], ha.inputs[1])
        vm = N.new('ShaderNodeMath'); vm.operation = 'MULTIPLY'; vm.location = (-600, 520)
        L.new(vj.outputs[0], vm.inputs[0]); L.new(vl.outputs[0], vm.inputs[1])
        L.new(ha.outputs[0], hsv.inputs['Hue']); L.new(vm.outputs[0], hsv.inputs['Value']); L.new(ic.outputs['Color'], hsv.inputs['Color'])
        # the few yellowed leaves
        yg = N.new('ShaderNodeMath'); yg.operation = 'GREATER_THAN'; yg.inputs[1].default_value = 0.988; yg.location = (-600, 800)
        L.new(sx.outputs['X'], yg.inputs[0])
        yk = N.new('ShaderNodeMath'); yk.operation = 'MULTIPLY'; yk.inputs[1].default_value = 0.45; yk.location = (-450, 800)
        L.new(yg.outputs[0], yk.inputs[0])
        ym = N.new('ShaderNodeMix'); ym.data_type = 'RGBA'; ym.location = (-300, 450)
        L.new(yk.outputs[0], ym.inputs['Factor']); L.new(hsv.outputs['Color'], ym.inputs['A']); ym.inputs['B'].default_value = (0.13, 0.095, 0.022, 1)
        hsv_out = ym.outputs['Result']
    else:
        L.new(hj.outputs[0], hsv.inputs['Hue']); L.new(vj.outputs[0], hsv.inputs['Value']); L.new(ic.outputs['Color'], hsv.inputs['Color'])
        hsv_out = hsv.outputs['Color']
    # underside: paler and greyer (abaxial cuticle and hairs)
    geo = N.new('ShaderNodeNewGeometry'); geo.location = (-450, 600)
    pale = N.new('ShaderNodeMix'); pale.data_type = 'RGBA'; pale.blend_type = 'MIX'; pale.location = (-200, 400)
    pale.inputs['Factor'].default_value = 0.28
    L.new(hsv_out, pale.inputs['A']); pale.inputs['B'].default_value = (0.16, 0.2, 0.12, 1)
    side = N.new('ShaderNodeMix'); side.data_type = 'RGBA'; side.location = (50, 400)
    L.new(geo.outputs['Backfacing'], side.inputs['Factor']); L.new(hsv_out, side.inputs['A']); L.new(pale.outputs['Result'], side.inputs['B'])
    bs = N.new('ShaderNodeBsdfPrincipled'); bs.location = (300, 250)
    bs.inputs['Roughness'].default_value = 0.45
    bs.inputs['Specular IOR Level'].default_value = 0.5
    L.new(side.outputs['Result'], bs.inputs['Base Color']); L.new(nm.outputs['Normal'], bs.inputs['Normal'])
    # transmitted light: the blade's green, yellower and brighter (chlorophyll passes green-yellow)
    tc = N.new('ShaderNodeMix'); tc.data_type = 'RGBA'; tc.blend_type = 'MULTIPLY'; tc.location = (50, 0)
    tc.inputs['Factor'].default_value = 1.0
    L.new(hsv_out, tc.inputs['A']); tc.inputs['B'].default_value = (1.5 * trans / 0.4, 1.6 * trans / 0.4, 0.5 * trans / 0.4, 1)
    tr = N.new('ShaderNodeBsdfTranslucent'); tr.location = (300, -50)
    L.new(tc.outputs['Result'], tr.inputs['Color']); L.new(nm.outputs['Normal'], tr.inputs['Normal'])
    # reflected + transmitted (an Add, not a Mix: a real blade reflects ~its albedo AND transmits about as much again; a Mix
    # at 0.4 cut the reflection to 0.6 of the albedo, which is what kept the first crowns dark)
    mx = N.new('ShaderNodeAddShader'); mx.location = (600, 100)
    L.new(bs.outputs['BSDF'], mx.inputs[0]); L.new(tr.outputs['BSDF'], mx.inputs[1])
    # alpha clip (not for the opaque geometry leaves)
    if opaque:
        L.new(mx.outputs[0], out.inputs['Surface'])
    else:
        gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.location = (600, 350); gt.inputs[1].default_value = 0.5
        L.new(ic.outputs['Alpha'], gt.inputs[0])
        tp = N.new('ShaderNodeBsdfTransparent'); tp.location = (600, -150)
        mc = N.new('ShaderNodeMixShader'); mc.location = (900, 100)
        L.new(gt.outputs['Value'], mc.inputs['Fac']); L.new(tp.outputs['BSDF'], mc.inputs[1]); L.new(mx.outputs[0], mc.inputs[2])
        L.new(mc.outputs['Shader'], out.inputs['Surface'])
    try:
        m.surface_render_method = 'DITHERED'
    except Exception: pass
    m['bxt'] = 'leaf'
    return m

def bark_material(key, tex=TEX, mat=None, name=None, uvname=None):
    m = mat or bpy.data.materials.get(name or f'bxt_bark_{key}') or bpy.data.materials.new(name or f'bxt_bark_{key}')
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial'); out.location = (900, 0)
    uv = N.new('ShaderNodeUVMap'); uv.location = (-1000, 0)
    if uvname: uv.uv_map = uvname
    bs = N.new('ShaderNodeBsdfPrincipled'); bs.location = (500, 0)
    ic = N.new('ShaderNodeTexImage'); ic.image = _img(f'{tex}/bark_{key}_col.jpg'); ic.location = (-700, 300)
    L.new(uv.outputs['UV'], ic.inputs['Vector'])
    tint = N.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.inputs['Factor'].default_value = 1.0; tint.location = (-350, 300)
    t = BARK_TINT.get(key, (0.8, 0.8, 0.8)); tint.inputs['B'].default_value = (t[0], t[1], t[2], 1)
    L.new(ic.outputs['Color'], tint.inputs['A']); L.new(tint.outputs['Result'], bs.inputs['Base Color'])
    rp = f'{tex}/bark_{key}_rough.jpg'
    if os.path.exists(rp):
        ir = N.new('ShaderNodeTexImage'); ir.image = _img(rp, True); ir.location = (-700, 0)
        L.new(uv.outputs['UV'], ir.inputs['Vector']); L.new(ir.outputs['Color'], bs.inputs['Roughness'])
    else:
        bs.inputs['Roughness'].default_value = 0.85
    inn = N.new('ShaderNodeTexImage'); inn.image = _img(f'{tex}/bark_{key}_nrm.jpg', True); inn.location = (-700, -300)
    L.new(uv.outputs['UV'], inn.inputs['Vector'])
    nm = N.new('ShaderNodeNormalMap'); nm.location = (-350, -300); nm.inputs['Strength'].default_value = 1.2
    L.new(inn.outputs['Color'], nm.inputs['Color'])
    dp = f'{tex}/bark_{key}_disp.jpg'
    if os.path.exists(dp):
        idp = N.new('ShaderNodeTexImage'); idp.image = _img(dp, True); idp.location = (-700, -600)
        L.new(uv.outputs['UV'], idp.inputs['Vector'])
        bu = N.new('ShaderNodeBump'); bu.location = (100, -400); bu.inputs['Strength'].default_value = 0.6; bu.inputs['Distance'].default_value = 0.01
        L.new(idp.outputs['Color'], bu.inputs['Height']); L.new(nm.outputs['Normal'], bu.inputs['Normal'])
        L.new(bu.outputs['Normal'], bs.inputs['Normal'])
    else:
        L.new(nm.outputs['Normal'], bs.inputs['Normal'])
    L.new(bs.outputs['BSDF'], out.inputs['Surface'])
    m['bxt'] = 'bark'
    return m

def imp_material(name, img_path):
    """an impostor card: the baked view (colour + alpha) on a diffuse with a little translucency"""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N, L = nt.nodes, nt.links
    out = N.new('ShaderNodeOutputMaterial')
    ic = N.new('ShaderNodeTexImage'); ic.image = _img(img_path)
    df = N.new('ShaderNodeBsdfDiffuse'); tr = N.new('ShaderNodeBsdfTranslucent')
    L.new(ic.outputs['Color'], df.inputs['Color']); L.new(ic.outputs['Color'], tr.inputs['Color'])
    mx = N.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.25
    L.new(df.outputs['BSDF'], mx.inputs[1]); L.new(tr.outputs['BSDF'], mx.inputs[2])
    gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    L.new(ic.outputs['Alpha'], gt.inputs[0])
    tp = N.new('ShaderNodeBsdfTransparent'); mc = N.new('ShaderNodeMixShader')
    L.new(gt.outputs['Value'], mc.inputs['Fac']); L.new(tp.outputs['BSDF'], mc.inputs[1]); L.new(mx.outputs[0], mc.inputs[2])
    L.new(mc.outputs['Shader'], out.inputs['Surface'])
    m['bxt'] = 'imp'
    return m

def wind_group(amp=0.12):
    """a geometry-nodes sway: offset = amp * (z / 10)^2 * (noise(position * 0.15 + t * 0.35) - 0.5) on x / y, plus a leaf
    flutter of 1.5 cm at a faster noise; time = the scene's frame / fps"""
    g = bpy.data.node_groups.get('bxt_wind')
    if g: return g
    g = bpy.data.node_groups.new('bxt_wind', 'GeometryNodeTree')
    g.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    g.interface.new_socket('Amplitude', in_out='INPUT', socket_type='NodeSocketFloat').default_value = amp
    up = g.interface.new_socket('Up', in_out='INPUT', socket_type='NodeSocketVector'); up.default_value = (0.0, 0.0, 1.0)
    g.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = g.nodes, g.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    pos = N.new('GeometryNodeInputPosition')
    tm = N.new('GeometryNodeInputSceneTime')
    sp = N.new('ShaderNodeVectorMath'); sp.operation = 'SCALE'; sp.inputs[3].default_value = 0.15
    L.new(pos.outputs['Position'], sp.inputs[0])
    tt = N.new('ShaderNodeMath'); tt.operation = 'MULTIPLY'; tt.inputs[1].default_value = 0.35
    L.new(tm.outputs['Seconds'], tt.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'
    L.new(sp.outputs['Vector'], nz.inputs['Vector']); L.new(tt.outputs[0], nz.inputs['W'])
    sub = N.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.5, 0.5, 0.5)
    L.new(nz.outputs['Color'], sub.inputs[0])
    # height along the mesh's own up (a USD prototype keeps the file's Y up in its mesh data; a built tree is Z up)
    hd = N.new('ShaderNodeVectorMath'); hd.operation = 'DOT_PRODUCT'
    L.new(pos.outputs['Position'], hd.inputs[0]); L.new(gi.outputs['Up'], hd.inputs[1])
    h = N.new('ShaderNodeMath'); h.operation = 'MULTIPLY'; h.inputs[1].default_value = 0.1
    L.new(hd.outputs['Value'], h.inputs[0])
    h2 = N.new('ShaderNodeMath'); h2.operation = 'POWER'; h2.inputs[1].default_value = 2.0
    L.new(h.outputs[0], h2.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'
    L.new(h2.outputs[0], k.inputs[0]); L.new(gi.outputs['Amplitude'], k.inputs[1])
    # the sway mostly sideways: the noise minus 0.75 of its component along up
    upc = N.new('ShaderNodeVectorMath'); upc.operation = 'PROJECT'
    L.new(sub.outputs['Vector'], upc.inputs[0]); L.new(gi.outputs['Up'], upc.inputs[1])
    upk = N.new('ShaderNodeVectorMath'); upk.operation = 'SCALE'; upk.inputs[3].default_value = 0.75
    L.new(upc.outputs['Vector'], upk.inputs[0])
    flat = N.new('ShaderNodeVectorMath'); flat.operation = 'SUBTRACT'
    L.new(sub.outputs['Vector'], flat.inputs[0]); L.new(upk.outputs['Vector'], flat.inputs[1])
    off = N.new('ShaderNodeVectorMath'); off.operation = 'SCALE'
    L.new(flat.outputs['Vector'], off.inputs[0]); L.new(k.outputs[0], off.inputs[3])
    sp2 = N.new('GeometryNodeSetPosition')
    L.new(gi.outputs['Geometry'], sp2.inputs['Geometry']); L.new(off.outputs['Vector'], sp2.inputs['Offset'])
    L.new(sp2.outputs['Geometry'], go.inputs['Geometry'])
    return g

def add_wind(obj, amp=0.12):
    md = obj.modifiers.get('bxt_wind') or obj.modifiers.new('bxt_wind', 'NODES')
    md.node_group = wind_group(amp)
    # the mesh's up: the axis along which the tree stands (its trunk at the origin, the crown on the positive side)
    import numpy as _np
    n = len(obj.data.vertices)
    co = _np.zeros(n * 3); obj.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    up = (0.0, 1.0, 0.0) if co[:, 1].max() > co[:, 2].max() else (0.0, 0.0, 1.0)
    for it in md.node_group.interface.items_tree:
        if getattr(it, 'in_out', '') == 'INPUT' and it.name in ('Amplitude', 'Up'):
            try: md[it.identifier] = amp if it.name == 'Amplitude' else up
            except Exception: pass
    obj['bxt_up'] = up
    return md

TEX2 = os.environ.get('BXTREES2_TEX', '/data0/projectnyc_aux/assets/bxtrees2/tex')

def _set_of(m, tex):
    """TREEUE: the tree set an imported material came from (its images under textures/bxtrees2/: the second set) -> the
    texture folder, second set?, the set's leaf cut per species"""
    if m.use_nodes and m.node_tree:
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image and '/bxtrees2/' in (nd.image.filepath or '').replace('\\', '/'):
                try:
                    import json as _j
                    cut = _j.load(open(os.path.join(TEX2, '..', 'set.json'))).get('leaf_cut', {})
                except Exception:
                    cut = {}
                return TEX2, True, cut
    return tex, False, {}

def apply(tex=TEX, trans=0.4, gain=1.25, wind=0.0):
    """after a USD import: the writer's bxt_leaf_<F> / bxt_bark_<key> / bxt_imp_* materials get the full shading"""
    n = {'leaf': 0, 'bark': 0, 'imp': 0, 'wind': 0, 'set2': 0}
    for m in list(bpy.data.materials):
        base = m.name.split('.')[0]
        if base.startswith('bxt_leaf_'):
            F = base[len('bxt_leaf_'):]
            tx, g2, cut = _set_of(m, tex)
            leaf_material(F, tx, trans, gain, mat=m, per_leaf=g2, opaque=g2 and cut.get(F, 'mask') == 'opaque'); n['leaf'] += 1; n['set2'] += int(g2)
        elif base.startswith('bxt_bark_'):
            tx, g2, _ = _set_of(m, tex)
            bark_material(base[len('bxt_bark_'):], tx, mat=m, uvname='st' if g2 else None); n['bark'] += 1
        elif base.startswith('bxt_imp_'):
            p = f'{tex}/../imp/{base[len("bxt_imp_"):]}.png'
            if os.path.exists(p): imp_material(m.name, os.path.normpath(p)); n['imp'] += 1
    if wind > 0:
        for ob in bpy.data.objects:
            if ob.type == 'MESH' and ob.data.materials and any(mm and mm.name.startswith('bxt_') for mm in ob.data.materials):
                add_wind(ob, wind); n['wind'] += 1
    # dense alpha-clipped crowns: every card a ray passes is a transparent bounce (the camera's and the shadow rays'); past
    # the limit Cycles stops the ray (black, or a full shadow), which darkened the pilot's crowns
    sc = bpy.context.scene
    sc.cycles.transparent_max_bounces = max(sc.cycles.transparent_max_bounces, 64)
    return n

# ---------------------------------------------------------------- the blender_render.py / blender_take.py hook API (BX-SEQ,
# docs/notes/ar34-bx-seq.md): `--bxtrees-off` leaves the imported materials; `--bxtrans`, `--bxgain`, `--bxwind <m>` tune
def after_import(ctx):
    opt = ctx['opt']
    if opt('bxtrees-off') is not None: return {'off': True}
    return apply(trans=float(opt('bxtrans', '0.4')), gain=float(opt('bxgain', '1.25')), wind=float(opt('bxwind', '0')))

def settings(ctx):
    # (the render settings set transparent_max_bounces 16 after after_import: raised again for the alpha-clipped crowns)
    sc = ctx['sc']
    if any(m.name.startswith('bxt_leaf_') for m in bpy.data.materials):
        sc.cycles.transparent_max_bounces = max(sc.cycles.transparent_max_bounces, 64)
    return {'transparent_max_bounces': sc.cycles.transparent_max_bounces}
