# BX-FIX (AR34 BX, 2026-10-04): the Blender side of usd_coplanar.py (a blender_render.py hook, after the others).
#
#   OVERLAYS  the materials the writer lifted off their base (the street kit's overlays, decals, graffiti, stains, sign
#             layers: bx_fix.json overlay_mids) cast no shadows: lifted 2-24 mm they would draw a dark line beside every
#             crossing stripe under a low sun; the web draws them without shadows
#   INTERIORS the facade kit's rooms (fk:int_*, fk:lv:*, roomFill, shopFill: bx_fix.json interior_mids) are boxes whose
#             faces look inward, drawn FrontSide in the web: seen from outside the box their back faces are culled. Cycles
#             draws both sides, so a room box that reaches past its walls or roof shows its outside (the cream slabs over
#             the Starbucks roof at 125th and Lenox). Here a back face of an interior is transparent for every ray, as culled
#   --nofix turns both off; --nofixcull the interiors' culling only.
import bpy, json, os, re

_RX = re.compile(r'^(?:m|bxl)(\d+)')


def _mid(name):
    m = _RX.match(name or '')
    return int(m.group(1)) if m else None


def _load(ctx):
    p = os.path.join(ctx.get('usd_dir') or '', 'bx_fix.json')
    try: return json.load(open(p))
    except Exception: return None


def _cull(mat):
    """a back face of mat transparent (Geometry > Backfacing mixes in a Transparent BSDF before the output)."""
    if not mat.use_nodes or mat.get('bxfix_cull'): return False
    nt = mat.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if out is None or not out.inputs['Surface'].is_linked: return False
    src = out.inputs['Surface'].links[0].from_socket
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Backfacing'], mx.inputs['Fac'])
    nt.links.new(src, mx.inputs[1]); nt.links.new(tr.outputs['BSDF'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    mat['bxfix_cull'] = 1
    return True


def settings(ctx):
    opt = ctx['opt']
    if opt('nofix') is not None: return
    J = _load(ctx)
    if not J: ctx['T']['bx_fix'] = {'error': 'no bx_fix.json (a USD written before BX-FIX)'}; return
    over, inter = set(J.get('overlay_mids') or []), set(J.get('interior_mids') or [])
    st = {'overlay_objects': 0, 'interior_materials': 0}
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.material_slots: continue
        mids = [_mid(s.material.name) if s.material else None for s in ob.material_slots]
        if mids and all(m is not None and m in over for m in mids):
            if ob.visible_shadow: ob.visible_shadow = False; st['overlay_objects'] += 1
    if opt('nofixcull') is None:
        for mat in bpy.data.materials:
            m = _mid(mat.name)
            if m is not None and m in inter and _cull(mat): st['interior_materials'] += 1
    cp = J.get('coplanar') or {}
    st['writer'] = {k: {kk: v.get(kk) for kk in ('rule_tris', 'clamped_vertices', 'lifted_tris', 'unresolved')} for k, v in cp.items()}
    ctx['T']['bx_fix'] = st
    print('[bx-fix] ' + json.dumps(st))
