# TREEUE (AR34, 2026-10-07): the tree set's master materials for UE, built from code into /Game/Bx/ (generated content,
# never committed), beside ue_masters.py's (which it leaves alone; its own version file).
#   M_bx_foliage       geometry leaves (the second set's star-polygon leaves): opaque, two-sided foliage shading, the
#                      card's normal map; the albedo x 1.1 (Gain), and the light through the blade as the subsurface colour
#                      = albedo x Trans 3.5 x SssTint (2.0, 1.6, 0.35) (chlorophyll passes yellow-green; blender_trees.py's
#                      Cycles leaf adds a Translucent BSDF of albedo x (1.5, 1.6, 0.5), and in Cycles light passes leaf
#                      after leaf, which UE's single subsurface term does not: the stronger, yellower term stands in for
#                      it, fitted with ue_check.py against the physical Cycles takes of the same trees), applied by Lumen
#                      to the indirect light from behind a leaf too (ue_trees.py sets r.Lumen.ScreenProbeGather.
#                      TwoSidedFoliageBackfaceDiffuse 1: DiffuseColor x front + SubsurfaceColor x back), so a crown's shade
#                      is lit through its leaves and not by the blue sky alone; per-instance (PerInstanceRandom)
#                      and per-leaf (UV 1 x: the leaf's random value) hue and lightness, a few yellowed leaves, the inner
#                      crown's occlusion of sky and bounce light (UV 1 y: the leaf's depth in the crown, v flipped by the
#                      importer), wind as world position offset
#   M_bx_foliage_mask  the same, alpha-tested at 0.5 near the lens (NearM, FadeM: past ~22 m the leaf is its polygon, no
#                      alpha test), the compound leaves' cards (honeylocust, sophora) everywhere
#   M_bx_bark          bark: the scan's colour x its tint, normal and roughness maps, a per-instance lightness, the same wind
#                      without the leaves' flutter (bark and leaves move together)
# Wind (one HLSL function for all three): the tree leans and sways with the wind by the square of its height (the vertex's
# local height, in the instance's frame), the limbs move in a smooth field of the local position, every leaf flutters with
# its own phase along its normal; Time drives it, so a Movie Render Queue take is deterministic and the velocity pass sees
# the motion (TSR without smearing); WindK 0 freezes it (a take's --treewind 0). MaxWorldPositionOffsetDisplacement bounds
# it for Nanite's culling.
import os, unreal

ROOT = '/Game/Bx'
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
VERSION = 8          # bump to rebuild these masters

WIND = r'''
// TREEUE wind: world position offset in cm (world space); LP the vertex's local position (cm, z up, pre-offset)
float h = max(LP.z * 0.01, 0.0);
float Ht = max(TreeH, 1.0);
float hn = saturate(h / Ht);
float ph = PIR * 6.2832;
float2 wd = normalize(WindDir.xy + float2(1e-4, 0.0));
float t = T * WindSpeed;
float sway = 0.65 * sin(t * 0.83 + ph) + 0.35 * sin(t * 1.91 + 1.7 * ph);
float3 o = float3(wd, 0.0) * (hn * hn) * Ht * 0.012 * (0.55 + 0.45 * sway);
o += float3(-wd.y, wd.x, 0.0) * (hn * hn) * Ht * 0.004 * sin(t * 1.37 + 2.3 * ph);
float3 q = LP * 0.01;
float br = 0.5 * sin(t * 2.7 + dot(q, float3(0.9, 0.7, 0.5)) + ph) + 0.5 * sin(t * 4.3 + dot(q, float3(-0.6, 1.1, 0.4)));
o += float3(wd, 0.2) * br * pow(hn, 1.5) * 0.04;
if (Leaf > 0.5) o += NW * sin(t * 9.0 + UV1.x * 6.2832) * 0.01 * (0.4 + 0.6 * hn);
return o * 100.0 * WindK;
'''

FOLIAGE = r'''
float4 t4 = Texture2DSample(Tex, TexSampler, UV0);
// the alpha cuts the leaf's outline near the lens; past NearM + FadeM (cm) the leaf draws as its polygon (no alpha test
// where a leaf is a few pixels: no alpha flicker); the compound leaves' cards keep the cut (NearM huge)
Mask = lerp(t4.a, 1.0, saturate((Dist - NearM) / max(FadeM, 1.0)));
float3 n = Texture2DSample(Nrm, NrmSampler, UV0).rgb * 2.0 - 1.0;
NormalTS = normalize(float3(n.x, -n.y, max(n.z, 0.15)));   // (the atlases' maps are OpenGL; UE's tangent frame is DirectX)
float3 c = t4.rgb * Tint.xyz;
// per tree (PerInstanceRandom) and per leaf (UV 1 x) hue and lightness
float ri = PIR, rl = UV1.x;
float hue = (ri - 0.5) * HueVar + (rl - 0.5) * LeafHue;
float val = (1.0 + (ri - 0.5) * ValVar) * (1.0 + (rl - 0.5) * LeafVar);
float3 yiq = float3(dot(c, float3(0.299, 0.587, 0.114)), dot(c, float3(0.596, -0.274, -0.322)), dot(c, float3(0.211, -0.523, 0.312)));
float a = hue * 6.2832, ca = cos(a), sa = sin(a);
yiq.yz = float2(yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
c = max(float3(dot(yiq, float3(1.0, 0.956, 0.621)), dot(yiq, float3(1.0, -0.272, -0.647)), dot(yiq, float3(1.0, -1.106, 1.703))), 0.0) * val;
if (rl > 1.0 - Yellow) c = lerp(c, float3(0.13, 0.095, 0.022) * Tint.xyz, 0.45);
// the inner crown sees less sky and bounce light (UV 1 y = 1 - depth: the importer flips v)
AO = lerp(AoIn, 1.0, saturate(1.0 - UV1.y));
Sss = c * Trans * SssTint.xyz;
return c * Gain;
'''

BARK = r'''
float3 c = Texture2DSample(Tex, TexSampler, UV0).rgb * Tint.xyz;
c *= 1.0 + (PIR - 0.5) * ValVar;
float3 n = Texture2DSample(Nrm, NrmSampler, UV0).rgb * 2.0 - 1.0;
NormalTS = normalize(float3(n.x * NrmK, -n.y * NrmK, max(n.z, 0.1)));
Rough = (HasRough > 0.5) ? Texture2DSample(RoughT, RoughTSampler, UV0).r : RoughK;
return c * Gain;
'''

WIND_IN = [('LP', 'lp'), ('PIR', 'pir'), ('T', 'time'), ('NW', 'nw'), ('UV1', 'uv1'), ('WindK', 's', 1.0), ('WindDir', 'v', (1.0, 0.3, 0, 0)),
           ('WindSpeed', 's', 1.0), ('TreeH', 's', 10.0), ('Leaf', 's', 1.0)]
LEAF_IN = [('UV0', 'uv0'), ('UV1', 'uv1'), ('PIR', 'pir'), ('Dist', 'depth'), ('NearM', 's', 1200.0), ('FadeM', 's', 1000.0), ('Tex', 'ts', 'white'), ('Nrm', 'tl', 'flat'), ('Tint', 'v', (1, 1, 1, 0)),
           ('Gain', 's', 1.1), ('Trans', 's', 3.5), ('SssTint', 'v', (2.0, 1.6, 0.35, 0)), ('HueVar', 's', 0.05), ('ValVar', 's', 0.22),
           ('LeafHue', 's', 0.05), ('LeafVar', 's', 0.24), ('Yellow', 's', 0.012), ('AoIn', 's', 0.8)]
MASTERS = {
    'foliage': (FOLIAGE, LEAF_IN, [('Mask', 1), ('NormalTS', 3), ('Sss', 3), ('AO', 1)], {'two_sided': True, 'foliage': True}),
    'foliage_mask': (FOLIAGE, LEAF_IN, [('Mask', 1), ('NormalTS', 3), ('Sss', 3), ('AO', 1)], {'two_sided': True, 'foliage': True, 'masked': True}),
    'bark': (BARK, [('UV0', 'uv0'), ('PIR', 'pir'), ('Tex', 'ts', 'white'), ('Nrm', 'tl', 'flat'), ('RoughT', 'tl', 'white'), ('HasRough', 's', 0.0),
                    ('RoughK', 's', 0.85), ('Tint', 'v', (1, 1, 1, 0)), ('Gain', 's', 1.0), ('ValVar', 's', 0.12), ('NrmK', 's', 1.0)],
             [('NormalTS', 3), ('Rough', 1)], {'bark': True}),
}


def _expr(m, it, x, y):
    nm, kind = it[0], it[1]
    if kind == 's':
        e = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, x, y)
        e.set_editor_property('parameter_name', nm); e.set_editor_property('default_value', float(it[2]))
    elif kind == 'v':
        e = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, x, y)
        e.set_editor_property('parameter_name', nm); e.set_editor_property('default_value', unreal.LinearColor(*[float(v) for v in it[2]]))
    elif kind in ('ts', 'tl'):
        import ue_masters
        e = mel.create_material_expression(m, unreal.MaterialExpressionTextureObjectParameter, x, y)
        e.set_editor_property('parameter_name', nm)
        e.set_editor_property('texture', ue_masters.defaults()[it[2]])
        e.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if kind == 'ts' else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
    elif kind == 'lp':
        e = mel.create_material_expression(m, unreal.MaterialExpressionLocalPosition, x, y)
        try: e.set_editor_property('included_offsets', unreal.PositionIncludedOffsets.EXCLUDE_OFFSETS)
        except Exception as ex: unreal.log_warning(f'[bxue] ue_foliage: local position offsets: {ex}')
    elif kind == 'pir':
        e = mel.create_material_expression(m, unreal.MaterialExpressionPerInstanceRandom, x, y)
    elif kind == 'time':
        e = mel.create_material_expression(m, unreal.MaterialExpressionTime, x, y)
    elif kind == 'depth':
        e = mel.create_material_expression(m, unreal.MaterialExpressionPixelDepth, x, y)
    elif kind == 'nw':
        e = mel.create_material_expression(m, unreal.MaterialExpressionVertexNormalWS, x, y)
    elif kind.startswith('uv'):
        e = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, x, y)
        e.set_editor_property('coordinate_index', int(kind[2]))
    return e


def _custom(m, code, inputs, outs, x, y, out_type=None):
    cu = mel.create_material_expression(m, unreal.MaterialExpressionCustom, x, y)
    cu.set_editor_property('code', code)
    cu.set_editor_property('output_type', out_type or unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    ins = []
    for it in inputs:
        ci = unreal.CustomInput(); ci.set_editor_property('input_name', it[0]); ins.append(ci)
    cu.set_editor_property('inputs', ins)
    if outs:
        ao = []
        for on, dim in outs:
            co = unreal.CustomOutput(); co.set_editor_property('output_name', on)
            co.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT1 if dim == 1 else unreal.CustomMaterialOutputType.CMOT_FLOAT3)
            ao.append(co)
        cu.set_editor_property('additional_outputs', ao)
    yy = y - 600
    made = {}
    for it in inputs:
        key = (it[0], it[1])
        e = _expr(m, it, x - 450, yy)
        if not (it[1] == 'v' and mel.connect_material_expressions(e, 'RGBA', cu, it[0])):
            mel.connect_material_expressions(e, '', cu, it[0])
        made[it[0]] = e
        yy += 80
    return cu


def build(name, spec):
    code, inputs, outs, sett = spec
    ap = f'{ROOT}/M_bx_{name}'
    if eal.does_asset_exist(ap): eal.delete_asset(ap)
    m = unreal.AssetToolsHelpers.get_asset_tools().create_asset(f'M_bx_{name}', ROOT, unreal.Material, unreal.MaterialFactoryNew())
    if sett.get('masked'):
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        m.set_editor_property('opacity_mask_clip_value', 0.5)
    if sett.get('two_sided'): m.set_editor_property('two_sided', True)
    if sett.get('foliage'): m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    try: m.set_editor_property('max_world_position_offset_displacement', 60.0)
    except Exception as e: unreal.log_warning(f'[bxue] ue_foliage {name}: max WPO displacement: {e}')
    MP = unreal.MaterialProperty
    cu = _custom(m, code, inputs, outs, -600, 0)
    mel.connect_material_property(cu, '', MP.MP_BASE_COLOR)
    names = [o[0] for o in outs]
    if 'Mask' in names and sett.get('masked'): mel.connect_material_property(cu, 'Mask', MP.MP_OPACITY_MASK)
    if 'NormalTS' in names: mel.connect_material_property(cu, 'NormalTS', MP.MP_NORMAL)
    if 'Sss' in names: mel.connect_material_property(cu, 'Sss', MP.MP_SUBSURFACE_COLOR)
    if 'AO' in names: mel.connect_material_property(cu, 'AO', MP.MP_AMBIENT_OCCLUSION)
    if 'Rough' in names: mel.connect_material_property(cu, 'Rough', MP.MP_ROUGHNESS)
    if not sett.get('bark'):
        e = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -300, 400)
        e.set_editor_property('parameter_name', 'Rough'); e.set_editor_property('default_value', 0.45)
        mel.connect_material_property(e, '', MP.MP_ROUGHNESS)
    # wind: its own Custom node (the vertex shader may not sample textures)
    win = [w if w[0] != 'Leaf' else ('Leaf', 's', 0.0 if sett.get('bark') else 1.0) for w in WIND_IN]
    cw = _custom(m, WIND, win, [], -600, 1400)
    mel.connect_material_property(cw, '', MP.MP_WORLD_POSITION_OFFSET)
    for u in ('MATUSAGE_NANITE', 'MATUSAGE_INSTANCED_STATIC_MESHES', 'MATUSAGE_STATIC_MESH' if hasattr(unreal.MaterialUsage, 'MATUSAGE_STATIC_MESH') else None):
        if not u: continue
        try: mel.set_material_usage(m, getattr(unreal.MaterialUsage, u))
        except Exception as e: unreal.log_warning(f'[bxue] ue_foliage {name}: usage {u}: {e}')
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return ap


def ensure(force=False):
    """build the masters when missing or older than VERSION. -> {'built': [...]}"""
    vf = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()), 'Bx', f'.foliage_v{VERSION}')
    out = {'built': []}
    for name, spec in MASTERS.items():
        ap = f'{ROOT}/M_bx_{name}'
        if force or not os.path.exists(vf) or not eal.does_asset_exist(ap):
            build(name, spec); out['built'].append(name)
    os.makedirs(os.path.dirname(vf), exist_ok=True)
    open(vf, 'w').write('1')
    return out
