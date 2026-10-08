# OFFLINE TARGETS (AR34 LOOK, 2026-10-02), step 2: the harvest (harvest.mjs) -> OpenUSD layers that Blender (Cycles) and
# any other USD renderer read.
#
#   uv run --no-project --with usd-core --with numpy --with pillow python usd_write.py --in <harvest dir> --out <usd dir>
#
# Layers (Y up, metres; three.js world space: x east, y up, z south):
#   geo.usdc       every geometry once, as abstract `class` prims under /_geo (never drawn by themselves)
#   looks.usdc     UsdPreviewSurface materials under /World/Looks (one per material and tint / colour variant)
#   static.usdc    the region's meshes (internal references to /_geo) and the instancer's pools as PointInstancers
#   dyn_<shot>_f<frame>.usdc   that frame's instanced draw sets (vehicles, trains, the kit's instanced parts)
#   cam_<shot>.usda            the page camera, one time sample per frame (PathCam's path as drawn)
#   lights.usda                the sun (DistantLight) and a sky fill (DomeLight) from the page's lights
#   <shot>_f<frame>.usda       the root of one key frame: sublayers cam, dyn, static, looks, geo, lights
# Materials: three.js parameters -> UsdPreviewSurface; the PBR library's sets (pbAlb / pbNrm / pbOrm uniforms, UVs in
# metres, the tint ratio) through UsdTransform2d and the texture's scale; the facade kit's per-vertex tint (aFkTr), vertex
# colours and instance colours by splitting faces / instances into material variants (UsdPreviewSurface has no multiply).
import argparse, json, math, os, re, shutil, sys, time
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, UsdLux, Sdf, Gf, Vt

ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='inp', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--qtint', type=float, default=48.0, help='tint / colour quantisation steps per unit (linear)')
ap.add_argument('--maxvc', type=int, default=400, help='most vertex-colour variants per mesh slot; past it a textured slot takes the mean colour, an untextured one displayColor')
ap.add_argument('--qinst', type=float, default=12.0, help='instance-colour quantisation steps per unit (one PointInstancer per colour)')
ap.add_argument('--nodyn', action='store_true')
# BX-SEQ (docs/notes/ar34-bx-seq.md): the take layers (mov_<shot>.usdc, the shot root <shot>.usda over every frame), the
# per-shot static layers, the ground's covered triangles dropped, the hooks
ap.add_argument('--shots', default='', help='only these shots (comma separated; default all in the harvest)')
ap.add_argument('--ground', default='drop', choices=['drop', 'lift'], help='drop: covered same-kind ground triangles are dropped, the rest layered; lift: the pilot\'s lifts and jitter')
ap.add_argument('--nokeys', action='store_true', help='no key-frame roots (dyn_<shot>_f<frame>), only the take roots')
ap.add_argument('--hooks', default=None, help='hook modules for this run (comma separated), replacing HOOKS')
ap.add_argument('--nohooks', action='store_true')
ap.add_argument('--coplanar', default='fix', choices=['fix', 'warn', 'off'], help='BX-FIX usd_coplanar.py: overlays lifted, interiors under their roofs, coplanar pairs resolved; fix fails the write when a pair is left, warn only reports')
A, A_rest = ap.parse_known_args()
t_start = time.time()
IN, OUT = A.inp, A.out
os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
man = json.load(open(os.path.join(IN, 'manifest.json')))
S = json.load(open(os.path.join(IN, 'static.json')))
LIG = json.load(open(os.path.join(IN, 'lights.json')))
GEOS = {g['id']: g for g in man['geos']}
MATS = {m['id']: m for m in man['mats']}
TEXS = {t['id']: t for t in man['texs']}
stats = {'meshes': 0, 'instancers': 0, 'instances': 0, 'tris_unique': 0, 'variants': 0, 'world_st': 0, 'dc_meshes': 0, 'tex_files': 0, 'skip': {}}
def skip(k): stats['skip'][k] = stats['skip'].get(k, 0) + 1

# ---- BX hooks (owned by BX-SEQ; one line per track): a module <name>.py next to this file defines any of setup(ctx),
# material(ctx, mid, d, path, sh, info), variants(ctx, G, mats), mesh(ctx, stage, prim, gid, mats, G), pool(ctx, stage,
# path, p), static(ctx, stage), moving(ctx, stage, shot), layers(ctx, shot), finish(ctx); docs/notes/ar34-bx-seq.md has
# the ctx. --hooks a,b replaces the list for a run, --nohooks runs none; unknown arguments are left in ctx.argv.
HOOKS = [
    # 'usd_x',   # BX-<TRACK>
    'usd_windows',   # BX-WIN: the baked tile facades (bxwin.json) in place of their shells, the window materials' roles
    'usd_trees',     # BX-TREES: the tree asset set's species prototypes on the web's tree pools (trees_<shot>.usdc; --bxt-lod)
    'usd_mat',       # BX-MAT: primvars instead of material variants and the node-group tags (blender_nodes.py); --nobxmat: off
    'usd_peds',      # BX-PEDS: the walkers as UsdSkel (peds_<shot>.usdc, <shot>_peds.usda) and peds_<shot>.npz for blender_peds.py (--nopeds, --peds-usd 0)
    'usd_ramps',     # R7-RAMP (UE track, 2026-10-08): decks under the vehicles the harvest has driving through the air (the web's undecked ramps)
]
import importlib, types, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_hook_mods = []
for _hn in ([] if A.nohooks else ([h for h in A.hooks.split(',') if h] if A.hooks is not None else HOOKS)):
    try: _hook_mods.append((_hn, importlib.import_module(_hn.replace('.py', ''))))
    except Exception as e: print(f'[usd_write] hook {_hn} not loaded: {e}')
HCTX = types.SimpleNamespace(IN=IN, OUT=OUT, man=man, S=S, LIG=LIG, GEOS=GEOS, MATS=MATS, TEXS=TEXS, A=A, argv=A_rest, stats=stats)
def run_hooks(fn, *a, first=False):
    """call fn on every hook that defines it; first=True: return the first non-None result (variants, pool)."""
    out = {}
    for name, m in _hook_mods:
        f = getattr(m, fn, None)
        if not callable(f): continue
        try:
            r = f(HCTX, *a)
            if first and r is not None and r is not False: return r
            out[name] = r
        except Exception:
            print(f'[usd_write] hook {name}.{fn} failed:\n' + traceback.format_exc())
    return None if first else out
def ident(s, n=40):
    s = re.sub(r'[^A-Za-z0-9_]', '_', s)[:n]
    return s if s and not s[0].isdigit() else '_' + s

# ---------------------------------------------------------------- geometry
_gcache = {}
def load_geo(gid):
    if gid in _gcache: return _gcache[gid]
    g = GEOS[gid]
    raw = open(os.path.join(IN, g['file']), 'rb').read()
    out = {}
    for L in g['layout']:
        dt = np.float32 if L['type'] == 'f32' else np.uint32
        n = L['count'] * L['itemSize']
        a = np.frombuffer(raw, dtype=dt, count=n, offset=L['offset'])
        out[L['name']] = a.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else a
    if 'index' not in out: out['index'] = np.arange(len(out['position']), dtype=np.uint32)
    ntri = len(out['index']) // 3
    out['index'] = out['index'][:ntri * 3]
    out['ntri'] = ntri
    out['groups'] = g.get('groups') or []
    _gcache[gid] = out
    return out

def tri_material_index(G, nmats):
    """material slot per triangle from the geometry's groups (three: index units)."""
    mi = np.zeros(G['ntri'], dtype=np.int32)
    if G['groups'] and nmats > 1:
        mi[:] = -1
        for q in G['groups']:
            a, b = max(0, q['start'] // 3), min(G['ntri'], (q['start'] + q['count']) // 3)
            if b > a: mi[a:b] = q['mi']
    return mi

geo_stage = Usd.Stage.CreateNew(os.path.join(OUT, 'geo.usdc'))
UsdGeom.SetStageUpAxis(geo_stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(geo_stage, 1.0)
geo_stage.CreateClassPrim('/_geo')
_geo_done = set()
def geo_prim(gid):
    """the geometry as an abstract mesh /_geo/g<id> (points, triangles, normals, uv as st)."""
    path = f'/_geo/g{gid}'
    if gid in _geo_done: return path
    G = load_geo(gid)
    prim = geo_stage.CreateClassPrim(path)
    prim.SetTypeName('Mesh')
    m = UsdGeom.Mesh(prim)
    P = G['position'].astype(np.float32)
    m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P)))
    m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(G['ntri'], 3, dtype=np.int32)))
    m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(G['index'].astype(np.int32)))
    m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    # the ground's vertex normals are not shading normals (a few point down and fan dark wedges across the asphalt in a
    # path tracer): the ground (matId) is authored without them, so renderers use its flat faces
    if 'normal' in G and 'matId' not in G:
        N = G['normal'].astype(np.float32)
        if np.isfinite(N).all() and (np.linalg.norm(N, axis=1) > 0.5).mean() > 0.999:
            m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(N)))
            m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
        else: skip('bad-normals')
    elif 'matId' in G:
        # the ground: flat face normals per corner (left to the importer, its kerb faces share vertices with the road
        # and smooth normals darken fans of road triangles from every kerb vertex)
        I = G['index'].reshape(-1, 3)
        p0, p1, p2 = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
        fn = np.cross(p1 - p0, p2 - p0); fn /= (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12)
        m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(np.repeat(fn, 3, axis=0).astype(np.float32))))
        m.SetNormalsInterpolation(UsdGeom.Tokens.faceVarying)
    if 'uv' in G:
        pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(G['uv'].astype(np.float32))))
    lo, hi = P.min(axis=0), P.max(axis=0)
    m.CreateExtentAttr([Gf.Vec3f(*map(float, lo)), Gf.Vec3f(*map(float, hi))])
    _geo_done.add(gid)
    stats['tris_unique'] += G['ntri']
    return path

# ---------------------------------------------------------------- textures and materials
looks_stage = Usd.Stage.CreateNew(os.path.join(OUT, 'looks.usdc'))
UsdGeom.SetStageUpAxis(looks_stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(looks_stage, 1.0)
UsdGeom.Scope.Define(looks_stage, '/World'); UsdGeom.Scope.Define(looks_stage, '/World/Looks')
_tex_done = {}
def link_fresh(src, dst):
    """link (or copy) src to dst, replacing a dst that is another file. The harvest names its textures by index
    (tex/t<id>[_<layer>].png), so a file of that name left in <out>/textures by an earlier write is another harvest's
    texture: kept, it puts that harvest's texture on the surface (BX-QA, 2026-10-03: mustard paving, a patterned walk,
    olive facades in the batch's re-harvested takes, written into folders that held the proof harvests' textures)."""
    if os.path.lexists(dst):
        try:
            if os.path.samefile(src, dst): return
        except OSError: pass
        os.unlink(dst)
    try: os.link(src, dst)
    except OSError: shutil.copyfile(src, dst)

def tex_file(tid, layer=0):
    t = TEXS.get(tid)
    if not t or t.get('err') or not t.get('files'): return None
    src = os.path.join(IN, t['files'][min(layer, len(t['files']) - 1)])
    dst_rel = 'textures/' + os.path.basename(src)
    if dst_rel not in _tex_done:
        link_fresh(src, os.path.join(OUT, dst_rel))
        _tex_done[dst_rel] = 1
        stats['tex_files'] += 1
    return './' + dst_rel

WRAP = {1000: 'repeat', 1001: 'clamp', 1002: 'mirror'}
SRGB = 'srgb'
def is_srgb(t): return str(t.get('colorSpace', '')).lower() == SRGB

_mat_done = {}
def qkey(c, q=None):
    q = q or A.qtint
    return tuple(int(round(float(v) * q)) for v in c)

# the ground shader's surface kinds (world/materials.js GROUND: matId 0 asphalt 1 sidewalk 2 curb 3 paintW 4 paintY 5 grass
# 6 path 7 terrain 8 far-carpet 9 paintG 10 brick/plaza ...): its photo set and size in metres, or a flat linear albedo
GROUND = {0: ('t_asC', 3.5, (1.0, 1.0, 1.0)), 1: ('t_coC', 2.0, (1.0, 1.0, 1.0)), 2: (None, 0, (0.20, 0.19, 0.18)),
          3: (None, 0, (0.62, 0.62, 0.60)), 4: (None, 0, (0.62, 0.40, 0.05)), 5: ('t_grC', 2.0, (1.0, 1.0, 1.0)),
          6: ('t_pvC', 2.0, (1.0, 1.0, 1.0)), 7: (None, 0, (0.12, 0.10, 0.08)), 8: (None, 0, (0.10, 0.10, 0.09)),
          9: (None, 0, (0.05, 0.22, 0.08)), 10: ('t_pvC', 2.0, (1.0, 1.0, 1.0))}
HIDDEN = '/World/Looks/hidden'
def hidden_material():
    if HIDDEN in _mat_done.values(): return HIDDEN
    mat = UsdShade.Material.Define(looks_stage, HIDDEN)
    sh = UsdShade.Shader.Define(looks_stage, HIDDEN + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
    sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).Set(0.0); sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
    mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    _mat_done[('hidden',)] = HIDDEN
    return HIDDEN

def uv_xform(t):
    """BX-MAT: a texture's uv transform (three Matrix3, column-major: uv' = M (u, v, 1)) as UsdTransform2d inputs, or None. A
    mirrored atlas slot (a negative repeat, no rotation) keeps its sign: as a hypot / atan2 decomposition it became a 180
    degree turn, flipping both axes."""
    if not t or not t.get('matrix'):
        return None
    e = t['matrix']
    if abs(e[1]) < 1e-6 and abs(e[3]) < 1e-6:
        sx, sy, rotd = e[0], e[4], 0.0
    else:
        sx, sy = math.hypot(e[0], e[1]), math.hypot(e[3], e[4])
        rotd = math.degrees(math.atan2(e[1], e[0]))
    if abs(sx - 1) > 1e-4 or abs(sy - 1) > 1e-4 or abs(e[6]) > 1e-5 or abs(e[7]) > 1e-5 or abs(rotd) > 0.01:
        xf = {'scale': [sx, sy], 'translation': [e[6], e[7]]}
        if abs(rotd) > 0.01: xf['rotation'] = rotd
        return xf
    return None

def material(mid, mul=None, dc=False, ground=None, paint=False, ipaint=False):
    """a UsdPreviewSurface for three material `mid`, its diffuse multiplied by `mul` (a tint / colour variant).
    ipaint (BX-SEQ): the fleet's paint per car, read from the take instancer's per-instance primvar nyc_paint."""
    mul = tuple(float(v) for v in mul) if mul is not None else (1.0, 1.0, 1.0)
    key = (mid, qkey(mul), dc, ground) + (('ip',) if ipaint else ())
    if key in _mat_done: return _mat_done[key]
    d = MATS[mid]
    vname = f'm{mid}' + ('' if key[1] == qkey((1, 1, 1)) else '_' + '_'.join(str(abs(v)) for v in key[1])) + ('_dc' if dc else '') + (f'_g{ground}' if ground is not None else '') + ('_ip' if ipaint else '')
    # a tree crown's leaf cards (alpha-tested, the crown attributes): named for the renderer's leaf shading (translucency)
    if float(d.get('alphaTest', 0) or 0) > 0 and 'aClu' in (d.get('obcAttrs') or []): vname += '_leaf'
    path = f'/World/Looks/{vname}'
    mat = UsdShade.Material.Define(looks_stage, path)
    sh = UsdShade.Shader.Define(looks_stage, path + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
    mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    mat.GetPrim().SetCustomDataByKey('three', {'name': d.get('name', ''), 'type': d.get('type', '')})
    U = d.get('uni') or {}
    readers = {}
    def st_reader(xf=None):
        k = json.dumps(xf, sort_keys=True) if xf else ''
        if k in readers: return readers[k]
        if 'st' not in readers:
            rd = UsdShade.Shader.Define(looks_stage, path + '/st'); rd.CreateIdAttr('UsdPrimvarReader_float2')
            rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
            readers['st'] = (rd, 'result')
        src = readers['st']
        if xf:
            tr = UsdShade.Shader.Define(looks_stage, path + f'/xf{len(readers)}'); tr.CreateIdAttr('UsdTransform2d')
            tr.CreateInput('in', Sdf.ValueTypeNames.Float2).ConnectToSource(src[0].ConnectableAPI(), src[1])
            if 'scale' in xf: tr.CreateInput('scale', Sdf.ValueTypeNames.Float2).Set(Gf.Vec2f(*xf['scale']))
            if xf.get('rotation'): tr.CreateInput('rotation', Sdf.ValueTypeNames.Float).Set(float(xf['rotation']))
            if 'translation' in xf: tr.CreateInput('translation', Sdf.ValueTypeNames.Float2).Set(Gf.Vec2f(*xf['translation']))
            src = (tr, 'result')
        readers[k] = src
        return src
    ntex = [0]
    def texture(tid, raw=False, scale=None, bias=None, xf=None, layer=0):
        f = tex_file(tid, layer)
        if not f: return None
        t = TEXS[tid]
        ntex[0] += 1
        tx = UsdShade.Shader.Define(looks_stage, path + f'/tex{ntex[0]}'); tx.CreateIdAttr('UsdUVTexture')
        tx.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(f)
        src = st_reader(xf)
        tx.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(src[0].ConnectableAPI(), src[1])
        tx.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set(WRAP.get(t.get('wrapS'), 'repeat'))
        tx.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set(WRAP.get(t.get('wrapT'), 'repeat'))
        tx.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('raw' if raw or not is_srgb(t) else 'sRGB')
        if scale is not None: tx.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*[float(v) for v in scale]))
        if bias is not None: tx.CreateInput('bias', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*[float(v) for v in bias]))
        return tx
    def inp(name, tp): return sh.CreateInput(name, tp)
    F, C3 = Sdf.ValueTypeNames.Float, Sdf.ValueTypeNames.Color3f
    col = d.get('color') or [1, 1, 1]
    rough = d.get('roughness', 1.0 if d.get('type') in ('MeshLambertMaterial', 'MeshBasicMaterial') else 0.5)
    metal = d.get('metalness', 0.0)
    pbr = 'pbAlb' in U and isinstance(U['pbAlb'], dict) and 'tex' in U['pbAlb']
    alpha_src = None
    if 'vkPaint' in U and isinstance(U['vkPaint'], dict):
        # the viaducts' paint (vk/vkMats.js): two paint tones in uniforms on a white material; rust, guano, chalk and the
        # rivet rows are procedural (approximated: the paint alone, 85 / 15 between the two tones)
        p1 = U['vkPaint'].get('vec') or U['vkPaint'].get('color'); p2 = (U.get('vkPaint2') or {}).get('vec') or p1
        rc = (U.get('vkRustC') or {}).get('vec') or p2
        ra = float(U.get('vkRustAmt', 0.0)) if not isinstance(U.get('vkRustAmt'), dict) else 0.0
        ak = float(U.get('vkAmbK', 1.0)) if not isinstance(U.get('vkAmbK'), dict) else 1.0
        # the two tones half and half, a share of the rust tone, the shader's ambient factor as a darkening of the paint
        # x 0.65: the web's weathering (soot, grime, chalk, rust streaks) darkens the paint's mean; measured on t7ArchTrack
        # f054 the shaded deck and piers read 1.6-1.8x the web's value without it
        col = [((0.5 * p1[i] + 0.5 * p2[i]) * (1 - 0.4 * ra) + rc[i] * 0.4 * ra) * (0.6 + 0.4 * ak) * 0.65 for i in range(3)]
    if ground is not None:
        tname, size, alb = GROUND.get(int(ground), ('t_coC', 2.0, (1.0, 1.0, 1.0)))
        tex = U.get(tname) if tname else None
        if tex and isinstance(tex, dict) and 'tex' in tex:
            tx = texture(tex['tex'], scale=[alb[0] * mul[0], alb[1] * mul[1], alb[2] * mul[2], 1.0], xf={'scale': [1.0 / size, 1.0 / size]})
            if tx: inp('diffuseColor', C3).ConnectToSource(tx.ConnectableAPI(), 'rgb')
            else: inp('diffuseColor', C3).Set(Gf.Vec3f(0.18, 0.18, 0.18))
        else:
            inp('diffuseColor', C3).Set(Gf.Vec3f(*[float(alb[i] * mul[i]) for i in range(3)]))
        inp('roughness', F).Set(0.9 if int(ground) not in (3, 4, 9) else 0.6); inp('metallic', F).Set(0.0)
        _mat_done[key] = path; stats['variants'] += 1
        run_hooks('material', mid, d, path, sh, {'mul': mul, 'dc': dc, 'ground': ground, 'paint': paint, 'ipaint': ipaint})   # BX hooks
        return path
    if paint:
        inp('clearcoat', F).Set(1.0); inp('clearcoatRoughness', F).Set(0.06)
        rough, metal = 0.35, 0.35
    if pbr:
        size = U.get('pbSize', {}).get('vec', [1, 1])
        ratio = U.get('pbRatio', {}).get('vec', [1, 1, 1])
        rot = U.get('pbRot', {}).get('vec', [1, 0, 0, 1])
        ang = math.degrees(math.atan2(rot[1], rot[0])) if rot else 0.0
        # the shader: st = (R * m) / size, sampled at (s, -t) on a texture stored top row first (KTX2, not flipped);
        # the readback PNG puts the sampled (0, 0) at its bottom left, so USD st = (s, -t)
        xf = {'scale': [1.0 / max(size[0], 1e-4), -1.0 / max(size[1], 1e-4)]}
        if abs(ang) > 0.01: xf['rotation'] = ang
        al = texture(U['pbAlb']['tex'], scale=[ratio[0] * mul[0], ratio[1] * mul[1], ratio[2] * mul[2], 1.0], xf=xf)
        if al: inp('diffuseColor', C3).ConnectToSource(al.ConnectableAPI(), 'rgb')
        else: inp('diffuseColor', C3).Set(Gf.Vec3f(*[float(ratio[i] * mul[i] * 0.5) for i in range(3)]))
        pr = float(U.get('pbRough', 1.0)) if not isinstance(U.get('pbRough'), dict) else 1.0
        pm = U.get('pbMetal', {}).get('vec', [0, 0])
        if 'pbOrm' in U and 'tex' in U['pbOrm']:
            orm = texture(U['pbOrm']['tex'], raw=True, scale=[1.0, pr, 1.0, 1.0], xf=xf)
            if orm:
                inp('roughness', F).ConnectToSource(orm.ConnectableAPI(), 'g')
                inp('occlusion', F).ConnectToSource(orm.ConnectableAPI(), 'r')
                if pm[1] > 0.5: inp('metallic', F).Set(float(pm[0]))
                else: inp('metallic', F).ConnectToSource(orm.ConnectableAPI(), 'b')
        else:
            inp('roughness', F).Set(float(min(1.0, 0.85 * pr))); inp('metallic', F).Set(float(pm[0] if pm[1] > 0.5 else 0.0))
        if 'pbNrm' in U and 'tex' in U['pbNrm']:
            k = float(U.get('pbNrmK', 1.0)) if not isinstance(U.get('pbNrmK'), dict) else 1.0
            nm = texture(U['pbNrm']['tex'], raw=True, scale=[2 * k, -2 * k, 2, 1], bias=[-k, k, -1, 0], xf=xf)
            if nm: inp('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(nm.ConnectableAPI(), 'rgb')
    else:
        maps = d.get('maps') or {}
        base = [col[i] * mul[i] for i in range(3)]
        xfm = None
        if 'map' in maps:
            xfm = uv_xform(TEXS.get(maps['map']))   # BX-MAT: mirrored slots keep their sign
        if dc:
            rd = UsdShade.Shader.Define(looks_stage, path + '/dc'); rd.CreateIdAttr('UsdPrimvarReader_float3')
            rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('displayColor')
            inp('diffuseColor', C3).ConnectToSource(rd.ConnectableAPI(), 'result')
        elif 'map' in maps and (tx := texture(maps['map'], scale=[base[0], base[1], base[2], 1.0], xf=xfm)):
            inp('diffuseColor', C3).ConnectToSource(tx.ConnectableAPI(), 'rgb')
            t = TEXS.get(maps['map'])
            # the opacity from a second, unscaled reader of the same image: Blender's importer takes a scaled
            # texture's alpha from its scaled colour
            if t and not t.get('opaque', True) and (d.get('alphaTest', 0) or d.get('transparent')):
                alpha_src = texture(maps['map'], xf=xfm)
        else:
            inp('diffuseColor', C3).Set(Gf.Vec3f(*[float(v) for v in base]))
        if 'roughnessMap' in maps and (rt := texture(maps['roughnessMap'], raw=True, scale=[1, rough, 1, 1], xf=xfm)):
            inp('roughness', F).ConnectToSource(rt.ConnectableAPI(), 'g')
        else: inp('roughness', F).Set(float(rough))
        if 'metalnessMap' in maps and (mt := texture(maps['metalnessMap'], raw=True, scale=[1, 1, metal, 1], xf=xfm)):
            inp('metallic', F).ConnectToSource(mt.ConnectableAPI(), 'b')
        else: inp('metallic', F).Set(float(metal))
        if 'normalMap' in maps:
            ns = d.get('normalScale') or [1, 1]
            nm = texture(maps['normalMap'], raw=True, scale=[2 * ns[0], 2 * ns[1], 2, 1], bias=[-ns[0], -ns[1], -1, 0], xf=xfm)
            if nm: inp('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(nm.ConnectableAPI(), 'rgb')
        if 'alphaMap' in maps and (am := texture(maps['alphaMap'], raw=True, xf=xfm)):
            alpha_src = ('alphaMap', am)
    em = d.get('emissive')
    ei = d.get('emissiveIntensity', 1.0)
    maps = d.get('maps') or {}
    if em and max(em) * ei > 1e-4:
        # BX-MAT: the emission map's own texture transform (an atlas slot's repeat / offset; read without it the boards
        # sampled the whole atlas and rendered white, BX-LIGHT)
        xfe = uv_xform(TEXS.get(maps.get('emissiveMap'))) if 'emissiveMap' in maps else None
        if 'emissiveMap' in maps and (et := texture(maps['emissiveMap'], scale=[em[0] * ei, em[1] * ei, em[2] * ei, 1], xf=xfe)):
            inp('emissiveColor', C3).ConnectToSource(et.ConnectableAPI(), 'rgb')
        else: inp('emissiveColor', C3).Set(Gf.Vec3f(*[float(v * ei) for v in em]))
    if d.get('type') == 'MeshBasicMaterial':
        inp('roughness', F).Set(1.0)
    op = float(d.get('opacity', 1.0))
    at = float(d.get('alphaTest', 0.0) or 0.0)
    if alpha_src is not None and (at > 0 or d.get('transparent')):
        if isinstance(alpha_src, tuple): inp('opacity', F).ConnectToSource(alpha_src[1].ConnectableAPI(), 'r')
        else: inp('opacity', F).ConnectToSource(alpha_src.ConnectableAPI(), 'a')
        if at > 0: inp('opacityThreshold', F).Set(at)
    elif d.get('transparent') and op < 0.999:
        nm = (d.get('name') or '').lower()
        ud = d.get('ud') or {}
        if (ud.get('fkGlass') or 'glass' in nm or 'win' in nm) and op >= 0.15:
            # window glass: the web draws rooms behind it in the shader; the exported shells are hollow, so the glass is
            # an opaque, dark, polished surface here (reflections kept, the rooms approximated by a dark body)
            inp('diffuseColor', C3).Set(Gf.Vec3f(*[float(col[i] * mul[i] * 0.12) for i in range(3)]))
            inp('roughness', F).Set(float(min(rough, 0.06))); inp('metallic', F).Set(0.0)
        else:
            inp('opacity', F).Set(op)
        if 'ior' in d: inp('ior', F).Set(float(d['ior']))
    if d.get('transmission', 0) > 0.01:
        inp('opacity', F).Set(float(max(0.05, 1 - d['transmission'])))
    if ipaint:   # BX-SEQ: the car's own paint (linear), a per-instance primvar of the take's PointInstancer
        rd = UsdShade.Shader.Define(looks_stage, path + '/ipaint'); rd.CreateIdAttr('UsdPrimvarReader_float3')
        rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('nyc_paint')
        rd.CreateInput('fallback', Sdf.ValueTypeNames.Float3).Set(Gf.Vec3f(0.18, 0.18, 0.18))
        inp('diffuseColor', C3).ConnectToSource(rd.ConnectableAPI(), 'result')
    _mat_done[key] = path
    stats['variants'] += 1
    run_hooks('material', mid, d, path, sh, {'mul': mul, 'dc': dc, 'ground': ground, 'paint': paint, 'ipaint': ipaint})   # BX hooks
    return path

def mat_uses(mid, attr): return attr in ((MATS[mid].get('obcAttrs') or []))
def mat_world(mid):
    U = MATS[mid].get('uni') or {}
    return 'pbAlb' in U and U.get('pbWorld', 0) == 1

# ---------------------------------------------------------------- mesh instances (references to /_geo, materials bound)
def bind_path(stage, prim, mpath):
    api = UsdShade.MaterialBindingAPI.Apply(prim)
    rel = api.GetPrim().CreateRelationship('material:binding', False)
    rel.SetTargets([Sdf.Path(mpath)])

_hide_cache = {}
HIDE_BIDS = {}   # BX-SEQ: material id -> the bids the dresser held hidden at the static capture (static_<shot>.json `hide`)
def hide_mask(d):
    """a tile facade's per-building hide mask (uHide, 256 x 256 R8 indexed by aBid): True where the dresser rebuilt it.
    BX-SEQ: from the capture's own list (the CPU side of uHide when the static world was read) when the harvest has it;
    the texture read back at the end of the harvest had lost them (50 faces hidden in the pilot)."""
    if d.get('id') in HIDE_BIDS:
        key = ('bids', d['id'])
        if key not in _hide_cache:
            m = np.zeros((256, 256), dtype=bool)
            for b in HIDE_BIDS[d['id']]:
                if 0 <= b < 65536: m[b // 256, b % 256] = True
            _hide_cache[key] = m
        return _hide_cache[key]
    u = (d.get('uni') or {}).get('uHide')
    if not isinstance(u, dict) or 'tex' not in u: return None
    tid = u['tex']
    if tid in _hide_cache: return _hide_cache[tid]
    t = TEXS.get(tid); m = None
    if t and t.get('files') and t.get('ow') == 256 and t.get('oh') == 256:
        from PIL import Image
        a = np.asarray(Image.open(os.path.join(IN, t['files'][0])).convert('RGB'))[:, :, 0]
        m = a[::-1, :] > 127   # PNG rows top-down; row j from the bottom is the shader's t index floor(aBid / 256)
    _hide_cache[tid] = m
    return m

def face_variants(G, mats, M=None):
    """per-triangle (slot, multiplier) -> list of (material path, face indices); plus whether displayColor is needed."""
    hv = run_hooks('variants', G, mats, first=True)   # BX hooks: a track's own split (MAT's primvars mode)
    if hv is not None: return (hv, None) if not (isinstance(hv, tuple) and len(hv) == 2) else hv
    mi = tri_material_index(G, len(mats))
    out = []
    dc_needed = None
    for slot in sorted(set(mi.tolist())):
        if slot < 0 or slot >= len(mats) or mats[slot] < 0: continue
        faces = np.nonzero(mi == slot)[0]
        mid = mats[slot]
        d = MATS[mid]
        if not d.get('colorWrite', True) or not d.get('visible', True): continue
        # a tile facade's buildings that the dresser rebuilt as real geometry are discarded by the web shader: hidden here
        if 'aBid' in G and (d.get('ud') or {}).get('isFacade'):
            hm = hide_mask(d)
            if hm is not None:
                bid = np.round(G['aBid'][G['index'][faces * 3]]).astype(np.int64)
                hid = hm[np.clip(bid // 256, 0, 255), bid % 256]
                if hid.any():
                    out.append((hidden_material(), faces[hid])); stats['hidden_faces'] = stats.get('hidden_faces', 0) + int(hid.sum())
                    faces = faces[~hid]
                    if not len(faces): continue
        # the ground: one variant per surface kind (matId)
        if 'matId' in G and mat_uses(mid, 'matId'):
            ids = np.round(G['matId'][G['index'][faces * 3]]).astype(np.int64)
            for gk in np.unique(ids): out.append((material(mid, ground=int(gk)), faces[ids == gk]))
            continue
        mulT = None
        if 'aFkTr' in G and mat_uses(mid, 'aFkTr'):
            mulT = G['aFkTr'][G['index'][faces * 3]]
        # (trees: the crowns' baked cluster shading is left to the path tracer; the kit's window glass: its vertex colour is
        # the room tint the web draws behind the glass, not the glass's colour)
        if d.get('vertexColors') and 'color' in G and not mat_uses(mid, 'aClu') and not (d.get('ud') or {}).get('fkGlass'):
            vc = G['color'][G['index'][faces * 3]][:, :3]
            mulT = vc if mulT is None else mulT * vc
        if mulT is None:
            out.append((material(mid), faces)); continue
        q = np.round(mulT * A.qtint).astype(np.int32)
        keys, inv = np.unique(q, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        if len(keys) > A.maxvc:
            textured = 'map' in (d.get('maps') or {}) or 'pbAlb' in (d.get('uni') or {})
            if textured or not d.get('vertexColors'):
                # smoothly varying colours on a textured slot (the trees' baked cluster shading): the mean colour
                out.append((material(mid, mul=mulT.mean(axis=0)), faces)); skip('vc-mean'); continue
            out.append((material(mid, dc=True), faces)); dc_needed = True; continue
        for k in range(len(keys)):
            sel = faces[inv == k]
            out.append((material(mid, mul=keys[k] / A.qtint), sel))
    return out, dc_needed

def overlap_lift(Tw, kind, step=0.002, cell=0.25):
    """per-triangle lift (metres) for coincident overlaps: rank of the triangle among the same-kind triangles covering the
    same 1 m grid point at the same height (5 mm buckets), in index order (the web's later draw wins its depth ties)."""
    n = len(Tw)
    keys, tris, hb = [], [], []
    xs, zs, ys = Tw[:, :, 0], Tw[:, :, 2], Tw[:, :, 1]
    x0 = np.floor(xs.min(1) / cell); x1 = np.floor(xs.max(1) / cell); z0 = np.floor(zs.min(1) / cell); z1 = np.floor(zs.max(1) / cell)
    for t in range(n):
        if (x1[t] - x0[t] + 1) * (z1[t] - z0[t] + 1) > 80000: continue   # the terrain grid's big cells: one layer, never doubled
        gx, gz = np.meshgrid(np.arange(x0[t], x1[t] + 1), np.arange(z0[t], z1[t] + 1))
        px = gx.ravel() * cell; pz = gz.ravel() * cell
        a, b, c = Tw[t, 0], Tw[t, 1], Tw[t, 2]
        v0x, v0z, v1x, v1z = c[0] - a[0], c[2] - a[2], b[0] - a[0], b[2] - a[2]
        den = v0x * v1z - v1x * v0z
        if abs(den) < 1e-9: continue
        wx, wz = px - a[0], pz - a[2]
        u = (wx * v1z - v1x * wz) / den; v = (v0x * wz - wx * v0z) / den
        ins = (u >= 0) & (v >= 0) & (u + v <= 1)
        if not ins.any(): continue
        h = a[1] + u[ins] * (c[1] - a[1]) + v[ins] * (b[1] - a[1])
        keys.append((gx.ravel()[ins].astype(np.int64) * 1000003 + gz.ravel()[ins].astype(np.int64)) * 64 + int(kind[t]) % 64)
        tris.append(np.full(int(ins.sum()), t, dtype=np.int64)); hb.append(np.round(h / 0.005).astype(np.int64))
    lift = np.zeros(n)
    if not keys: return lift
    K = np.concatenate(keys); Tt = np.concatenate(tris); Hb = np.concatenate(hb)
    o = np.lexsort((Tt, Hb, K)); K, Tt, Hb = K[o], Tt[o], Hb[o]
    newg = np.ones(len(K), dtype=bool); newg[1:] = (K[1:] != K[:-1]) | (Hb[1:] != Hb[:-1])
    gid = np.cumsum(newg) - 1
    first = np.flatnonzero(newg)
    rank = np.arange(len(K)) - first[gid]
    np.maximum.at(lift, Tt, rank * step)
    stats['ground_overlap_tris'] = stats.get('ground_overlap_tris', 0) + int((lift > 0).sum())
    return lift

def ground_resolve(Tw, kind, spacing=0.25, htol=0.005, step=0.002, cell=1.0, maxns=16, chunk=4000000):
    """BX-SEQ: the ground's same-kind stacks resolved from above. Tw: n x 3 x 3 world triangles in draw order (the web's
    later draw wins its depth ties). A triangle is covered when every sample of a barycentric lattice on it (~0.25 m, at
    most 16 steps a side, inset ~1 cm so an edge-sharing neighbour is no overlap) lies on a later same-kind triangle
    within 5 mm: dropped. Kept triangles that still overlap at the same height (found from 7 samples each: the inset
    corners, edge midpoints and centroid) get distinct layers, 2 mm apart (greedy colouring in draw order: the same kind
    is the same material and the same planar st, so which strip is on top does not show, only that none coincide).
    Two stages over sample x candidate pairs (a 1 m grid index per kind): 7 samples for every triangle, the full lattice
    only for those whose 7 are all covered. Returns (keep mask, lift in metres)."""
    n = len(Tw)
    keep = np.ones(n, dtype=bool)
    if n == 0: return keep, np.zeros(0)
    kind = np.asarray(kind, dtype=np.int64)
    e1 = Tw[:, 1] - Tw[:, 0]; e2 = Tw[:, 2] - Tw[:, 0]
    den = e2[:, 0] * e1[:, 2] - e1[:, 0] * e2[:, 2]
    area = 0.5 * np.abs(den)
    X0, X1 = Tw[:, :, 0].min(1), Tw[:, :, 0].max(1); Z0, Z1 = Tw[:, :, 2].min(1), Tw[:, :, 2].max(1)
    ci0, ci1 = np.floor(X0 / cell).astype(np.int64), np.floor(X1 / cell).astype(np.int64)
    cj0, cj1 = np.floor(Z0 / cell).astype(np.int64), np.floor(Z1 / cell).astype(np.int64)
    ncx = ci1 - ci0 + 1; ncell = ncx * (cj1 - cj0 + 1)
    ok = (ncell <= 2500) & (area > 1e-8)   # the terrain grid's big cells: one layer, never stacked; degenerate slivers
    pack = lambda k, i, j: (k << 42) + ((i + (1 << 20)) << 21) + (j + (1 << 20))
    tid = np.nonzero(ok)[0]
    if not len(tid): return keep, np.zeros(n)
    cnt = ncell[tid]
    rep = np.repeat(tid, cnt)
    local = np.arange(rep.size) - np.repeat(np.cumsum(cnt) - cnt, cnt)
    gkey = pack(kind[rep], ci0[rep] + local % ncx[rep], cj0[rep] + local // ncx[rep])
    o = np.argsort(gkey, kind='stable'); gkey = gkey[o]; gtri = rep[o]
    ukey, ustart, ucount = np.unique(gkey, return_index=True, return_counts=True)
    L1, L2 = np.linalg.norm(e1, axis=1), np.linalg.norm(e2, axis=1)
    inr = 2 * area / np.maximum(L1 + L2 + np.linalg.norm(Tw[:, 2] - Tw[:, 1], axis=1), 1e-9)
    def samples(T_, a, b):   # barycentric (a along e1, b along e2) per triangle, inset ~1 cm towards the centroid
        P_ = Tw[T_, 0][:, None, :] + a[None, :, None] * e1[T_][:, None, :] + b[None, :, None] * e2[T_][:, None, :]
        cen = Tw[T_].mean(1)
        sc = 1.0 - np.minimum(0.3, 0.01 / np.maximum(inr[T_], 1e-4))
        P_ = cen[:, None, :] + (P_ - cen[:, None, :]) * sc[:, None, None]
        return np.repeat(T_, len(a)), P_.reshape(-1, 3)
    def cover(own, Sp):   # -> per sample: covered by a later triangle; the (owner, other) pairs that overlap
        skey = pack(kind[own], np.floor(Sp[:, 0] / cell).astype(np.int64), np.floor(Sp[:, 2] / cell).astype(np.int64))
        pos = np.minimum(np.searchsorted(ukey, skey), len(ukey) - 1)
        sid = np.nonzero(ukey[pos] == skey)[0]
        c = ucount[pos[sid]]; st = ustart[pos[sid]]
        later = np.zeros(len(own), dtype=bool); pairs = []
        csum = np.cumsum(c); lo = 0
        while lo < len(sid):
            base = csum[lo - 1] if lo else 0
            hi = max(int(np.searchsorted(csum, base + chunk, side='right')), lo + 1)
            s_, c_, st_ = sid[lo:hi], c[lo:hi], st[lo:hi]
            ps = np.repeat(s_, c_)
            pt = gtri[np.repeat(st_, c_) + np.arange(ps.size) - np.repeat(np.cumsum(c_) - c_, c_)]
            po = own[ps]
            m = pt != po; ps, pt, po = ps[m], pt[m], po[m]
            wx = Sp[ps, 0] - Tw[pt, 0, 0]; wz = Sp[ps, 2] - Tw[pt, 0, 2]
            u = (wx * e1[pt, 2] - e1[pt, 0] * wz) / den[pt]
            v = (e2[pt, 0] * wz - wx * e2[pt, 2]) / den[pt]
            cov = (u >= -1e-7) & (v >= -1e-7) & (u + v <= 1 + 1e-7) & (np.abs(Tw[pt, 0, 1] + u * e2[pt, 1] + v * e1[pt, 1] - Sp[ps, 1]) < htol)
            later[ps[cov & (pt > po)]] = True
            pairs.append(np.stack([po[cov], pt[cov]], axis=1))
            lo = hi
        return later, (np.concatenate(pairs) if pairs else np.zeros((0, 2), dtype=np.int64))
    # stage 1: seven samples a triangle
    a7 = np.array([0, 1, 0, 0.5, 0.5, 0, 1 / 3]); b7 = np.array([0, 0, 1, 0, 0.5, 0.5, 1 / 3])
    own, Sp = samples(tid, a7, b7)
    later, E1 = cover(own, Sp)
    cand = np.bincount(own[~later], minlength=n) == 0
    cand &= ok
    # stage 2: the full lattice for the triangles whose seven samples all lie on later ones
    E2 = []
    cid = np.nonzero(cand)[0]
    ns = np.clip(np.ceil(np.maximum(L1, L2) / spacing), 1, maxns).astype(np.int64)
    for v in np.unique(ns[cid]) if len(cid) else []:
        T_ = cid[ns[cid] == v]
        ii, jj = np.meshgrid(np.arange(v + 1), np.arange(v + 1)); m_ = (ii + jj) <= v
        own2, Sp2 = samples(T_, ii[m_] / v, jj[m_] / v)
        later2, e2_ = cover(own2, Sp2)
        unc = np.bincount(own2[~later2], minlength=n)
        keep[T_[unc[T_] == 0]] = False
        E2.append(e2_)
    # layers for the kept overlaps
    E = np.concatenate([E1] + E2) if len(E1) or E2 else np.zeros((0, 2), dtype=np.int64)
    rank = np.zeros(n, dtype=np.int64)
    if len(E):
        E = np.unique(np.sort(E, axis=1), axis=0)
        E = E[keep[E[:, 0]] & keep[E[:, 1]]]
        adj = {}
        for a_, b_ in E.tolist(): adj.setdefault(b_, []).append(a_)
        for t in sorted(adj):
            used = {int(rank[a_]) for a_ in adj[t]}
            r = 0
            while r in used: r += 1
            rank[t] = r
    return keep, rank * step

def author_ground(stage, path, gid, mats, matrix=None, far=False):
    """a tile's ground (matId) as its own unwelded world-space mesh. Its layers overlap: the paint over the asphalt and the
    terrain grid under everything are ordered in the web by a depth bias per kind (world/materials.js GROUND, zb in depth
    LSBs), and same-kind strips lie on the intersections' cap fans at the same height (depth ties). In a path tracer a
    coincident twin blocks every shadow and bounce ray (black fans at the crossings), so each kind is lifted by its bias
    (1.5 mm per LSB) and each triangle that overlaps an earlier same-kind one by 2 mm per overlap (overlap_lift); the
    triangles are unwelded. The root layer recentres the region at the origin (float32 at 3.9 km resolves 0.24 mm)."""
    G = load_geo(gid)
    I = G['index'].reshape(-1, 3).astype(np.int64)
    P = G['position'].astype(np.float64)
    if matrix is not None:
        Mm = np.array(matrix, dtype=np.float64).reshape(4, 4); P = P @ Mm[:3, :3] + Mm[3, :3]
    zb = {3: 10, 4: 10, 13: 10, 14: 10, 9: 8, 11: 4, 12: 4, 15: -4, 7: -8, 10: -2}
    kind = np.round(G['matId'][I[:, 0]]).astype(np.int64)
    off = np.zeros(len(I))
    for k, v in zb.items(): off[kind == k] = v * 0.0015
    keep = None
    if A.ground == 'drop' and not far:
        # BX-SEQ: the same-kind stacks resolved from above (ground_resolve): a triangle the later ones cover entirely is
        # dropped, the kept ones that still overlap are layered 2 mm apart; no jitter, so the open road keeps one height and
        # its unwelded triangles meet edge to edge
        keep, lift = ground_resolve(P[I], kind, step=1.0)
        # BX-FIX: the same-kind layers 0.35 mm apart (they were 2 mm apart, so a third layer of asphalt stood at the bus
        # lane's 6 mm and a fifth over it, and the street kit's repave 1.5 mm over the road had the road's layers poking
        # through it: the triangles in the Lenox junction); what still comes within 3 mm of another kind or an overlay is
        # moved by usd_coplanar.py's audit (each ground kind is its own owner there)
        mr = float(lift.max()) if len(lift) else 0.0
        lift = lift * 0.00035
        stats['ground_max_layers'] = max(stats.get('ground_max_layers', 0), int(mr))
        off += lift
        stats['ground_dropped'] = stats.get('ground_dropped', 0) + int((~keep).sum())
        stats['ground_layered'] = stats.get('ground_layered', 0) + int((lift > 0).sum())
    elif not far:
        # same-kind triangles that overlap at the same height (two street polygons over one crossing): sampled on a 0.25 m grid,
        # every triangle that covers a grid point already covered by an earlier same-kind triangle within 5 mm is lifted by
        # 2 mm per earlier one; triangles that overlap nothing stay where they are (no steps in the open road)
        off += overlap_lift(P[I], kind)
        # and a 0.5 mm jitter per triangle (index mod 8) for overlaps the 0.25 m sampling misses (slivers). Smaller lifts (1 mm,
        # 0.25 mm) left the dark slivers; these open thin cracks between the unwelded triangles instead (< 5.5 mm high, a
        # fraction of a pixel at street distances, visible as faint lines at 1:1 where the strips stack)
        off += (np.arange(len(I)) % 8) * 0.0005
    if keep is not None and not keep.all():
        newidx = np.cumsum(keep) - 1
        I = I[keep]; off = off[keep]
    Pu = P[I.reshape(-1)].reshape(-1, 3, 3).copy(); Pu[:, :, 1] += off[:, None]
    Pu = Pu.reshape(-1, 3)
    fn = np.cross(Pu[1::3] - Pu[0::3], Pu[2::3] - Pu[0::3]); fn /= (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12)
    m = UsdGeom.Mesh.Define(stage, path)
    m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(Pu.astype(np.float32))))
    m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(I), 3, dtype=np.int32)))
    m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(np.arange(len(I) * 3, dtype=np.int32)))
    m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(np.repeat(fn, 3, axis=0).astype(np.float32))))
    m.SetNormalsInterpolation(UsdGeom.Tokens.faceVarying)
    st = np.stack([Pu[:, 0], -Pu[:, 2]], axis=1)
    pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
    pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(st.astype(np.float32))))
    m.CreateExtentAttr([Gf.Vec3f(*map(float, Pu.min(axis=0))), Gf.Vec3f(*map(float, Pu.max(axis=0)))])
    variants, _ = face_variants(G, mats)
    if keep is not None and not keep.all():   # BX-SEQ: the subsets on the kept triangles, renumbered
        variants = [(mp, newidx[f[keep[f]]]) for mp, f in variants if keep[f].any()]
    for k, (mp, faces) in enumerate(variants):
        ss = UsdGeom.Subset.Define(stage, f'{path}/s{k}')
        ss.CreateElementTypeAttr(UsdGeom.Tokens.face); ss.CreateFamilyNameAttr('materialBind')
        ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces.astype(np.int32)))
        bind_path(stage, ss.GetPrim(), mp)
    if variants: UsdGeom.Subset.SetFamilyType(m, 'materialBind', UsdGeom.Tokens.partition)
    m.CreateDoubleSidedAttr(True)
    stats['ground_meshes'] = stats.get('ground_meshes', 0) + 1
    stats['meshes'] += 1
    # BX hooks: a ground mesh is unwelded (3 points per kept triangle, in order); G['_ground_keep'] = the kept triangles of G
    G['_ground_keep'] = np.nonzero(keep)[0] if keep is not None else np.arange(len(G['index']) // 3)
    run_hooks('mesh', stage, m.GetPrim(), gid, mats, G)
    return m.GetPrim()

def author_mesh(stage, path, gid, mats, matrix=None, world_st=None, far=False):
    G = load_geo(gid)
    if 'matId' in G and any(mat_uses(x, 'matId') for x in mats if x >= 0):
        return author_ground(stage, path, gid, mats, matrix, far=far)
    prim = stage.DefinePrim(path, 'Mesh')
    prim.GetReferences().AddInternalReference(geo_prim(gid))
    m = UsdGeom.Mesh(prim)
    if matrix is not None:
        UsdGeom.Xformable(prim).AddTransformOp().Set(Gf.Matrix4d(*[float(v) for v in matrix]))
    variants, dc = face_variants(G, mats)
    if dc:
        vc = G['color'][:, :3].astype(np.float32)
        pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('displayColor', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(vc)))
        stats['dc_meshes'] += 1
    if 'matId' in G and any(mat_uses(x, 'matId') for x in mats if x >= 0):
        # the ground's coplanar layers (paint over asphalt, the terrain grid under everything) are ordered in the web by a
        # depth bias per kind (world/materials.js GROUND, zb in depth LSBs); a path tracer needs them apart in space:
        # 1.5 mm per LSB along y (paint +15 mm, the terrain grid -12 mm)
        zb = {3: 10, 4: 10, 13: 10, 14: 10, 9: 8, 11: 4, 12: 4, 15: -4, 7: -8, 10: -2}
        ids = np.round(G['matId']).astype(np.int64)
        off = np.zeros(len(ids), dtype=np.float32)
        for k, v in zb.items(): off[ids == k] = v * 0.0015
        P = G['position'].astype(np.float32).copy(); P[:, 1] += off
        m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P)))
        stats['ground_offset_meshes'] = stats.get('ground_offset_meshes', 0) + 1
    if world_st is not None:
        pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(world_st.astype(np.float32))))
        stats['world_st'] += 1
    if len(variants) == 1:
        bind_path(stage, prim, variants[0][0])
    else:
        for k, (mp, faces) in enumerate(variants):
            ss = UsdGeom.Subset.Define(stage, f'{path}/s{k}')
            ss.CreateElementTypeAttr(UsdGeom.Tokens.face)
            ss.CreateFamilyNameAttr('materialBind')
            ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces.astype(np.int32)))
            bind_path(stage, ss.GetPrim(), mp)
        if variants: UsdGeom.Subset.SetFamilyType(m, 'materialBind', UsdGeom.Tokens.partition)
    if any(MATS[x].get('side') == 2 for x in mats if x >= 0): m.CreateDoubleSidedAttr(True)
    stats['meshes'] += 1
    run_hooks('mesh', stage, prim, gid, mats, G)   # BX hooks
    return prim

def world_uv(G, M, planar=False):
    """the PBR library's world mapping (pbWorld): (x, -z) on up-facing faces, (along the wall, y) on walls; `planar`:
    (x, -z) everywhere (the ground: its vertex normals are not reliable, and a vertex mapped as a wall fans a smeared
    texture over its triangles)."""
    P = G['position'].astype(np.float64)
    N = G['normal'].astype(np.float64) if 'normal' in G else np.tile([0, 1, 0], (len(P), 1))
    if M is not None:
        Mm = np.array(M, dtype=np.float64).reshape(4, 4)   # rows = three columns
        P = P @ Mm[:3, :3] + Mm[3, :3]
        N = N @ Mm[:3, :3]
        N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    up = np.abs(N[:, 1]) > 0.7
    if planar: up[:] = True
    t = np.stack([N[:, 2], -N[:, 0]], axis=1); t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    u = np.where(up, P[:, 0], P[:, 0] * t[:, 0] + P[:, 2] * t[:, 1])
    v = np.where(up, -P[:, 2], P[:, 1])
    return np.stack([u, v], axis=1)

# ---------------------------------------------------------------- matrices -> point instancer TRS
def decompose(Ms):
    """N x 16 three.js column-major matrices -> positions, quaternions (w, x, y, z), scales; max shear error."""
    M = np.asarray(Ms, dtype=np.float64).reshape(-1, 4, 4)   # M[k][c] = column c of three's matrix
    pos = M[:, 3, :3]
    cols = M[:, :3, :3]   # cols[k][c] = column c (x, y, z)
    sc = np.linalg.norm(cols, axis=2)
    R = cols / (sc[:, :, None] + 1e-12)   # R[k][c] = unit column c
    det = np.linalg.det(R)
    neg = det < 0
    sc[neg, 0] *= -1; R[neg, 0] *= -1
    Rm = np.transpose(R, (0, 2, 1))   # Rm[k] rows/cols as a standard rotation matrix (column c = R[k][c])
    err = np.abs(np.einsum('kij,kil->kjl', Rm, Rm) - np.eye(3)).max(axis=(1, 2)) if len(Rm) else np.zeros(0)
    # rotation matrix -> quaternion
    tr = Rm[:, 0, 0] + Rm[:, 1, 1] + Rm[:, 2, 2]
    q = np.zeros((len(Rm), 4))
    for k in range(len(Rm)):
        m = Rm[k]
        if tr[k] > 0:
            s = math.sqrt(tr[k] + 1.0) * 2; q[k] = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q[k] = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q[k] = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q[k] = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
    return pos, q, sc, err

def author_instancer(stage, path, gid, mats, matrices, colors=None, paint=None, ids=None, rec=None):
    """a PointInstancer per instance-colour group (the colour multiplies the diffuse, as three's instanceColor does);
    `paint`: fleet24's per-instance paint colour (aCol, linear), applied to the ':paint' materials only.
    BX-SEQ: `ids` (one per matrix, e.g. a pool's slots) are authored as the instancer's ids; `rec` (a list) collects
    (instancer path, its ids in instance order) for later overrides (the signal lenses' state per frame)."""
    Ms = np.asarray(matrices, dtype=np.float64).reshape(-1, 16)
    n = len(Ms)
    C = np.asarray(colors, dtype=np.float64).reshape(-1, 3)[:n] if colors is not None and len(colors) >= n * 3 else None
    Pc = np.asarray(paint, dtype=np.float64).reshape(-1, 4)[:n, :3] if paint is not None and len(paint) >= n * 4 else None
    if C is not None or Pc is not None:
        q = np.concatenate([np.round(C * A.qinst).astype(np.int32) if C is not None else np.zeros((n, 3), np.int32),
                            np.round(Pc * A.qinst).astype(np.int32) if Pc is not None else np.zeros((n, 3), np.int32)], axis=1)
        keys, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
    else:
        keys, inv = np.zeros((1, 6), dtype=np.int32), np.zeros(n, dtype=np.int64)
    made = 0
    G = load_geo(gid)
    for k in range(len(keys)):
        sel = np.nonzero(inv == k)[0]
        if not len(sel): continue
        mul = keys[k][:3] / A.qinst if C is not None else None
        pmul = keys[k][3:] / A.qinst if Pc is not None else None
        ip = f'{path}_c{k}' if len(keys) > 1 else path
        pos, quat, sc, err = decompose(Ms[sel])
        ok = err < 1e-3
        if (~ok).any():   # sheared: plain meshes with their matrices
            for j in np.nonzero(~ok)[0]:
                mm = Ms[sel[j]]
                author_mesh(stage, f'{ip}_x{j}', gid, mats, matrix=mm)
                skip('sheared-instance')
        if ok.any():
            pi = UsdGeom.PointInstancer.Define(stage, ip)
            proto = stage.DefinePrim(f'{ip}/protos/p0', 'Mesh')
            proto.GetReferences().AddInternalReference(geo_prim(gid))
            variants, _ = face_variants(G, mats)
            if mul is not None or pmul is not None:   # recolour by the instance colour; the paint materials by the paint
                nv = []
                for mp, f in variants:
                    mm = re.match(r'/World/Looks/m(\d+)', mp)
                    if not mm: nv.append((mp, f)); continue
                    mid = int(mm.group(1))
                    isp = pmul is not None and ':paint' in (MATS[mid].get('name') or '')
                    m2 = np.array(_mul_of(mp)) * (np.array(mul) if mul is not None else 1.0) * (np.array(pmul) if isp else 1.0)
                    nv.append((material(mid, mul=m2, paint=isp), f))
                variants = nv
            if len(variants) == 1: bind_path(stage, proto, variants[0][0])
            else:
                for j, (mp, faces) in enumerate(variants):
                    ss = UsdGeom.Subset.Define(stage, f'{ip}/protos/p0/s{j}')
                    ss.CreateElementTypeAttr(UsdGeom.Tokens.face); ss.CreateFamilyNameAttr('materialBind')
                    ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces.astype(np.int32)))
                    bind_path(stage, ss.GetPrim(), mp)
            pi.CreatePrototypesRel().SetTargets([proto.GetPath()])
            idx = np.nonzero(ok)[0]
            pi.CreateProtoIndicesAttr(Vt.IntArray.FromNumpy(np.zeros(len(idx), dtype=np.int32)))
            pi.CreatePositionsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(pos[idx].astype(np.float32))))
            pi.CreateOrientationsAttr(Vt.QuathArray([Gf.Quath(float(w), float(x), float(y), float(z)) for w, x, y, z in quat[idx]]))
            pi.CreateScalesAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(sc[idx].astype(np.float32))))
            if ids is not None:   # BX-SEQ
                iid = [int(ids[int(sel[j])]) for j in idx]
                pi.CreateIdsAttr(Vt.Int64Array(iid))
                if rec is not None: rec.append((ip, iid))
            stats['instancers'] += 1; stats['instances'] += int(len(idx))
            made += 1
    return made

_mulmap = {}
def _mul_of(mp):
    for k, p in _mat_done.items():
        if p == mp and len(k) >= 2: return np.array(k[1]) / A.qtint
    return np.ones(3)

# ---------------------------------------------------------------- static layer
# BX-SEQ: one static layer per shot when the harvest captured the shot's region along its lens path (static_<shot>.json:
# its meshes, the far ring, the pools, the still instanced sets), else the legacy static.usdc from static.json
HCTX.stage_geo = geo_stage; HCTX.stage_looks = looks_stage
POOL_PRIMS = {}   # static layer file -> pool name -> [(instancer path, ids in instance order)]
def far_filter(gid, mats, pts, R, sink=1.0, maxedge=100.0, tiles=None):
    """BX-SEQ: the far level (macro buildings, crowns, far terrain) of a shot: only what lies farther than R from the lens
    path (pts: x, z), sunk `sink` m (under the near ground where the two overlap). The far terrain's cells are hundreds of
    metres to kilometres across (one covered the whole region at the lens's height): triangles longer than `maxedge` are
    subdivided first (unwelded, attributes interpolated), then a triangle is kept when every corner is past R. In place
    on the cached geometry (a clipped far piece is unique to its object).
    tiles = (tile size, set of (tx, tz)): the web's own mask instead (NM24: the far level is dropped over the near tiles
    that are drawn): triangles across a tile edge are split down to 4 m, a triangle is kept when its centroid is outside
    every ready near tile (the lead, 21:05: the macro boxes stood in front of 125th Street without the mask)."""
    G = load_geo(gid)
    if G.get('_far_done'): return G['ntri']
    if tiles is not None:
        T_, TS = float(tiles[0]), tiles[1]
        def in_tiles(x, z):
            tx = np.floor(np.asarray(x) / T_).astype(np.int64); tz = np.floor(np.asarray(z) / T_).astype(np.int64)
            return np.fromiter(((a, b) in TS for a, b in zip(tx.ravel().tolist(), tz.ravel().tolist())), dtype=bool, count=tx.size).reshape(tx.shape)
    I = G['index'].reshape(-1, 3).astype(np.int64)
    mi = tri_material_index(G, len(mats))
    vattr = {k: v for k, v in G.items() if isinstance(v, np.ndarray) and k not in ('index',) and len(v) == len(G['position'])}
    # corners per triangle (unwelded), barycentric subdivision of the long ones
    C = {k: v[I] for k, v in vattr.items()}   # each: ntri x 3 [x dims]
    tri_mi = mi.copy()
    for _ in range(16):
        Pc = C['position'].astype(np.float64)
        L = np.maximum.reduce([np.linalg.norm(Pc[:, 1] - Pc[:, 0], axis=1), np.linalg.norm(Pc[:, 2] - Pc[:, 1], axis=1), np.linalg.norm(Pc[:, 0] - Pc[:, 2], axis=1)])
        big = L > maxedge
        if tiles is not None:   # split across the near tiles' edges finely (the web masks per pixel)
            inn = in_tiles(Pc[:, :, 0], Pc[:, :, 2])
            big |= (inn.any(1) & ~inn.all(1)) & (L > 4.0)
        if not big.any(): break
        keepC = {k: v[~big] for k, v in C.items()}
        sub = {}
        for k, v in C.items():
            t = v[big].astype(np.float64)
            a_, b_, c_ = t[:, 0], t[:, 1], t[:, 2]
            ab, bc, ca = (a_ + b_) / 2, (b_ + c_) / 2, (c_ + a_) / 2
            sub[k] = np.concatenate([np.stack([a_, ab, ca], 1), np.stack([ab, b_, bc], 1), np.stack([ca, bc, c_], 1), np.stack([ab, bc, ca], 1)]).astype(v.dtype)
        C = {k: np.concatenate([keepC[k], sub[k]]) for k in C}
        tri_mi = np.concatenate([tri_mi[~big]] + [tri_mi[big]] * 4)
    Pc = C['position'].astype(np.float64)
    nt = len(Pc)
    flat = Pc.reshape(-1, 3)
    d2 = np.full(len(flat), np.inf)
    q_all = np.asarray(pts, dtype=np.float64)
    for k in range(0, len(q_all), 8):
        q = q_all[k:k + 8]
        d2 = np.minimum(d2, ((flat[:, 0:1] - q[None, :, 0]) ** 2 + (flat[:, 2:3] - q[None, :, 1]) ** 2).min(1))
    keep = (d2.reshape(-1, 3) > R * R).all(1)
    if tiles is not None:
        cen = Pc.mean(1)
        keep = ~in_tiles(cen[:, 0], cen[:, 2])
    o = np.argsort(tri_mi[keep], kind='stable')
    for k in C: C[k] = C[k][keep][o]
    tri_mi = tri_mi[keep][o]
    for k, v in C.items(): G[k] = v.reshape((-1,) + v.shape[2:]) if v.ndim > 2 else v.reshape(-1)
    G['position'] = G['position'].astype(np.float32); G['position'][:, 1] -= sink
    G['index'] = np.arange(len(tri_mi) * 3, dtype=np.uint32); G['ntri'] = len(tri_mi)
    groups = []
    for t, m_ in enumerate(tri_mi.tolist()):
        if groups and groups[-1]['mi'] == m_: groups[-1]['count'] += 3
        else: groups.append({'start': t * 3, 'count': 3, 'mi': m_})
    G['groups'] = groups
    G['_far_done'] = True
    stats['far_tris'] = stats.get('far_tris', 0) + int(len(tri_mi)); stats['far_tris_dropped'] = stats.get('far_tris_dropped', 0) + int((~keep).sum())
    return G['ntri']

# BX-FIX (2026-10-04): usd_coplanar.py on the authored static layer: the overlays lifted by their depth pull, the facade
# kit's interiors brought under their roofs, every coplanar pair of different owners resolved (lifts on the shared /_geo
# points and the ground's world points), then audited again; counts in stats['coplanar'], the overlay and interior
# materials in bx_fix.json for the Blender side (blender_fix.py)
import usd_coplanar
COPLANAR_FAIL = []
CAMS_OF = {}
def coplanar_pass(st_stage, fn, objs, Sd, ground_paths, lens=None, cams=None):
    def gpts(path):
        a = UsdGeom.Mesh(st_stage.GetPrimAtPath(path)).GetPointsAttr().Get()
        return np.asarray(a, dtype=np.float64) if a is not None else None
    def set_geo(gid, P):
        pr = geo_stage.GetPrimAtPath(f'/_geo/g{gid}')
        if not pr: return
        m = UsdGeom.Mesh(pr); P = P.astype(np.float32)
        m.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P)))
        m.GetExtentAttr().Set([Gf.Vec3f(*map(float, P.min(axis=0))), Gf.Vec3f(*map(float, P.max(axis=0)))])
    def set_ground(path, P):
        m = UsdGeom.Mesh(st_stage.GetPrimAtPath(path)); P = P.astype(np.float32)
        m.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P)))
        m.GetExtentAttr().Set([Gf.Vec3f(*map(float, P.min(axis=0))), Gf.Vec3f(*map(float, P.max(axis=0)))])
    st = usd_coplanar.run([(i, o) for i, o in enumerate(objs)], Sd.get('pools') or [], Sd.get('instanced') or [], load_geo, MATS,
                          ground_paths, gpts, set_geo, set_ground, log=print, lens=lens, cams=cams)
    bf = os.path.join(OUT, 'bx_fix.json')
    try: J = json.load(open(bf))
    except Exception: J = {}
    J['overlay_mids'] = sorted(set(J.get('overlay_mids', [])) | set(st.pop('overlay_mids')))
    J['interior_mids'] = sorted(set(J.get('interior_mids', [])) | set(st.pop('interior_mids')))
    J.setdefault('coplanar', {})[fn] = st
    json.dump(J, open(bf, 'w'), indent=1)
    stats.setdefault('coplanar', {})[fn] = st
    print('[coplanar] %s: %d triangles, rules %d (street kit %d), interiors %d vertices under %d roofs (max %.3f m), audit rounds %s, unresolved %d in view (%d sub-pixel, %d same-prototype, %d out of view), %.0f s'
          % (fn, st['tris'], st['rule_tris'], st['rule_sk_tris'], st['clamped_vertices'], st['clamped_buildings'], st['max_drop_m'],
             ' -> '.join(str(r.get('close')) for r in st.get('rounds', [])), st['unresolved'], st.get('unresolved_subpixel', 0), st.get('unresolved_same_geo', 0), st.get('unresolved_far', 0), st['secs']), flush=True)
    if st['unresolved']:
        print('[coplanar] UNRESOLVED coplanar pairs in %s: %d %s at %s' % (fn, st['unresolved'], st.get('unresolved_pairs'), st.get('unresolved_at')), flush=True)
        COPLANAR_FAIL.append(fn)

def write_static(Sd, fn, lens=None):
    t0 = time.time()
    lens3 = [(p_[0], 0.0, p_[1]) for p_ in lens] if lens else None   # BX-FIX: the lens path for usd_coplanar.py (x, -, z)
    HIDE_BIDS.clear(); HIDE_BIDS.update({int(k): v for k, v in (Sd.get('hide') or {}).items()})
    for k in [k for k in _hide_cache if isinstance(k, tuple)]: del _hide_cache[k]
    st_stage = Usd.Stage.CreateNew(os.path.join(OUT, fn))
    HCTX.stage_static = st_stage
    UsdGeom.SetStageUpAxis(st_stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(st_stage, 1.0)
    UsdGeom.Xform.Define(st_stage, '/World'); UsdGeom.Scope.Define(st_stage, '/World/City'); UsdGeom.Scope.Define(st_stage, '/World/Pools')
    # (BX-SEQ: every parent prim typed: Blender's importer drops an untyped parent and its children lose /World's transform)
    UsdGeom.Scope.Define(st_stage, '/World/Far')
    groups = {}
    # the far terrain is masked by the ground shader within ~820 m of the lens (nearMask); here it would z-fight the tiles
    # (BX-SEQ: the far ring's own pieces, `far`, are outside F already)
    objs = [o for o in Sd['objects'] if o.get('far') or not o['name'].startswith('farTerrain')]
    if lens is not None:   # BX-SEQ: the far ring past F - 100 m of this shot's lens path
        F_ = float(man.get('far') or 800)
        NT = Sd.get('nearTiles') or {}
        tiles = (float(NT.get('tile', 512)), {(int(a), int(b)) for a, b in NT['tiles']}) if NT.get('tiles') else None
        objs = [o for o in objs if not o.get('far') or (o['geo'] >= 0 and far_filter(o['geo'], o['mats'], lens, F_ - 100.0, tiles=tiles) > 0)]
        stats['far_mask'] = 'near tiles (%d)' % len(tiles[1]) if tiles else 'F - 100 m'
    elif (Sd.get('nearTiles') or {}).get('tiles'):   # the legacy square: its far pieces masked by the ready near tiles
        NT = Sd['nearTiles']; tiles = (float(NT.get('tile', 512)), {(int(a), int(b)) for a, b in NT['tiles']})
        objs = [o for o in objs if not o.get('far') or (o['geo'] >= 0 and far_filter(o['geo'], o['mats'], [(1e9, 1e9)], 0.0, tiles=tiles) > 0)]
        stats['far_mask'] = 'near tiles (%d), legacy square' % len(tiles[1])
    for i, o in enumerate(objs):
        if o['geo'] < 0: continue
        if o.get('matrix') is not None and not any(mat_world(m) or mat_uses(m, 'matId') for m in o['mats'] if m >= 0):
            groups.setdefault((o['geo'], tuple(o['mats'])), []).append(i)
    done = set()
    for gi, ((gid, mats), L) in enumerate(groups.items()):
        if len(L) >= 3:
            author_instancer(st_stage, f'/World/City/inst{gi}_g{gid}', gid, list(mats), [objs[i]['matrix'] for i in L])
            done.update(L)
    ground_paths = {}   # BX-FIX: the ground meshes (author_ground: world points) for usd_coplanar.py
    for i, o in enumerate(objs):
        if o['geo'] < 0 or i in done: continue
        name = ident(o['name'].split(' < ')[0])
        G = load_geo(o['geo'])
        wst = None
        if any(mat_world(m) or mat_uses(m, 'matId') for m in o['mats'] if m >= 0):
            wst = world_uv(G, o.get('matrix'), planar='matId' in G)
        path_ = f"/World/{'Far' if o.get('far') else 'City'}/o{i}_{name}"
        author_mesh(st_stage, path_, o['geo'], o['mats'], matrix=o.get('matrix'), world_st=wst, far=bool(o.get('far')))
        if not o.get('far') and 'matId' in G and any(mat_uses(x, 'matId') for x in o['mats'] if x >= 0): ground_paths[i] = path_
    PP = POOL_PRIMS.setdefault(fn, {})
    for p in Sd['pools']:
        path = f"/World/Pools/{ident(p['name'])}"
        if run_hooks('pool', st_stage, path, p, first=True): continue   # BX hooks: a track authored this pool itself
        author_instancer(st_stage, path, p['geo'], p['mats'], p['matrices'], p.get('colors'), ids=p.get('slots'), rec=PP.setdefault(p['name'], []))
    if Sd.get('instanced'):   # BX-SEQ: the instanced sets that stood still during the take (the kit's parts, rivets, pits ...)
        UsdGeom.Scope.Define(st_stage, '/World/Kit')
        for j, s_ in enumerate(Sd['instanced']):
            author_instancer(st_stage, f"/World/Kit/k{j}_{ident(s_['name'].split(' < ')[0], 30)}", s_['geo'], s_['mats'], s_['matrices'], s_.get('colors'))
    if A.coplanar != 'off': coplanar_pass(st_stage, fn, objs, Sd, ground_paths, lens=lens3, cams=CAMS_OF.get(fn))   # BX-FIX
    run_hooks('static', st_stage)   # BX hooks
    st_stage.GetRootLayer().Save()
    stats.setdefault('secs_static', {})[fn] = round(time.time() - t0, 1)
    return fn

SHOTS = [s_ for s_ in man['shots'] if not A.shots or s_ in A.shots.split(',')]
def texture_reader(stage, path, tid, raw=False, layer=0):
    """(BX hooks) a UsdUVTexture of texture `tid` at `path` reading primvar st; None when the texture has no file."""
    f = tex_file(tid, layer)
    if not f: return None
    tx = UsdShade.Shader.Define(stage, path); tx.CreateIdAttr('UsdUVTexture')
    tx.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(f)
    tx.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('raw' if raw or not is_srgb(TEXS[tid]) else 'sRGB')
    return tx
HCTX.shots = SHOTS
HCTX.fn = types.SimpleNamespace(load_geo=load_geo, geo_prim=geo_prim, material=material, tex_file=tex_file, texture_reader=texture_reader,
    author_mesh=author_mesh, author_instancer=author_instancer, face_variants=face_variants, bind_path=bind_path, ident=ident,
    world_uv=world_uv, decompose=decompose)
for _k, _v in vars(HCTX.fn).items(): setattr(HCTX, _k, _v)   # also as ctx.<helper>
run_hooks('setup')   # BX hooks
STATIC_OF = {}
for shot in SHOTS:
    sf = man['shots'][shot].get('staticFile')
    if sf and os.path.exists(os.path.join(IN, sf)):
        Sd = S if sf == 'static.json' else json.load(open(os.path.join(IN, sf)))
        cams_ = json.load(open(os.path.join(IN, man['shots'][shot]['camFile'])))
        CAMS_OF[f'static_{shot}.usdc'] = cams_   # BX-FIX: the frames' cameras for usd_coplanar.py's in-view test
        lens = [(c['m'][12], c['m'][14]) for c in cams_]
        STATIC_OF[shot] = write_static(Sd, f'static_{shot}.usdc', lens=lens)
    else:
        STATIC_OF[shot] = 'static.usdc'
if 'static.usdc' in STATIC_OF.values() or not SHOTS:
    write_static(S, 'static.usdc')

# ---------------------------------------------------------------- cameras
def cam_layer(shot, info):
    cams = json.load(open(os.path.join(IN, info['camFile'])))
    fn = f'cam_{shot}.usda'
    s = Usd.Stage.CreateNew(os.path.join(OUT, fn))
    UsdGeom.SetStageUpAxis(s, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(s, 1.0)
    s.SetStartTimeCode(0); s.SetEndTimeCode(len(cams) - 1); s.SetTimeCodesPerSecond(man['fps']); s.SetFramesPerSecond(man['fps'])
    UsdGeom.Xform.Define(s, '/World'); UsdGeom.Scope.Define(s, '/World/Cameras')
    c = UsdGeom.Camera.Define(s, f'/World/Cameras/{ident(shot)}')
    op = c.AddTransformOp()
    c0 = cams[0]
    vap = 24.0
    fl = (vap / 2) / math.tan(math.radians(c0['fov']) / 2)
    c.CreateFocalLengthAttr(fl); c.CreateVerticalApertureAttr(vap); c.CreateHorizontalApertureAttr(vap * c0['aspect'])
    c.CreateClippingRangeAttr(Gf.Vec2f(float(c0['near']), float(min(c0['far'], 20000))))
    for f, cm in enumerate(cams):
        op.Set(Gf.Matrix4d(*[float(v) for v in cm['m']]), Usd.TimeCode(f))
        if abs(cm['fov'] - c0['fov']) > 1e-4: c.GetFocalLengthAttr().Set((vap / 2) / math.tan(math.radians(cm['fov']) / 2), Usd.TimeCode(f))
    s.GetRootLayer().Save()
    return fn, c.GetPath()

# ---------------------------------------------------------------- lights
lg = Usd.Stage.CreateNew(os.path.join(OUT, 'lights.usda'))
UsdGeom.SetStageUpAxis(lg, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(lg, 1.0)
UsdGeom.Xform.Define(lg, '/World'); UsdGeom.Scope.Define(lg, '/World/Lights')
sun = next((L for L in LIG['lights'] if L['type'] == 'DirectionalLight' and L.get('castShadow')), None) or next((L for L in LIG['lights'] if L['type'] == 'DirectionalLight'), None)
sun_dir = None
if sun:
    d = np.array(sun['target']) - np.array(sun['pos']); d /= np.linalg.norm(d)
    sun_dir = (-d).tolist()   # towards the sun
    dl = UsdLux.DistantLight.Define(lg, '/World/Lights/Sun')
    dl.CreateIntensityAttr(float(sun['intensity'])); dl.CreateColorAttr(Gf.Vec3f(*sun['color'])); dl.CreateAngleAttr(0.53)
    # the light shines down its -Z: rotate -Z onto d
    z = -d; x = np.cross([0, 1, 0], z); x = x / (np.linalg.norm(x) + 1e-9) if np.linalg.norm(x) > 1e-6 else np.array([1, 0, 0]); y = np.cross(z, x)
    Mx = Gf.Matrix4d(x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1)
    UsdGeom.Xformable(dl.GetPrim()).AddTransformOp().Set(Mx)
hemi = next((L for L in LIG['lights'] if L['type'] == 'HemisphereLight' and L.get('visible', True)), None)
if hemi:
    dome = UsdLux.DomeLight.Define(lg, '/World/Lights/Sky')
    dome.CreateIntensityAttr(float(hemi['intensity'])); dome.CreateColorAttr(Gf.Vec3f(*hemi['color']))
lg.GetRootLayer().Save()

# ---------------------------------------------------------------- BX-SEQ: the take's moving layer (mov_<shot>.usdc)
# Vehicles and every other moving set as time-sampled PointInstancers over the whole take: a fixed instance list per
# instancer (every car / track the take has), so the arrays keep their length and order from frame to frame (motion blur
# matches instances by index); a car outside its life is held at its first / last pose on the empty prototype (protoIndex
# 1). Per instance: ids (customData nyc:ids names them), velocities (m/s) and angularVelocities (deg/s) from central
# differences, primvars nyc_paint (the car's paint, linear: the ':paint' parts read it), nyc:lampMask (time-sampled: 1
# head, 2 tail, 4 brake, 8 left, 16 right, 32 siren), nyc:spin / nyc:steer (time-sampled, for wheel rigs). The signal
# lens pools of the shot's static layer get time-sampled invisibleIds (a dark lens is invisible) at scale 1.
def m12_to_16(M):
    M = np.asarray(M, dtype=np.float64).reshape(-1, 12)
    out = np.zeros((len(M), 16)); out[:, 0:3] = M[:, 0:3]; out[:, 4:7] = M[:, 3:6]; out[:, 8:11] = M[:, 6:9]; out[:, 12:15] = M[:, 9:12]; out[:, 15] = 1
    return out

def rear_m12(M, art, pivot):
    """an articulated bus's rear body: front matrix x T(pivot) Ry(art) T(-pivot) (sim/fleet24.js cull)."""
    c, sn, pz, px = math.cos(art), math.sin(art), pivot[2], pivot[0]
    x, y, z, t = M[0:3], M[3:6], M[6:9], M[9:12]
    nx = [c * x[q] - sn * z[q] for q in range(3)]; nz = [sn * x[q] + c * z[q] for q in range(3)]
    nt = [t[q] + x[q] * (px - c * px - sn * pz) + z[q] * (pz + sn * px - c * pz) for q in range(3)]
    return nx + list(y) + nz + nt

def quat_mul(a, b):
    w1, x1, y1, z1 = a[..., 0], a[..., 1], a[..., 2], a[..., 3]; w2, x2, y2, z2 = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], axis=-1)

def author_take_instancer(stage, path, protos, frames, nF, fps, ids, paint=None, lamp=None, spin=None, steer=None, custom=None):
    """protos: [(name, author(proto_path))] (the last one is the empty prototype); frames: n x nF x 12 matrices; the
    present mask per instance and frame in frames' NaN-free `present` (n x nF bool) passed as protos' index 0 / last."""
    M, present = frames
    n = M.shape[0]
    pi = UsdGeom.PointInstancer.Define(stage, path)
    targets = []
    for nm, fn_ in protos:
        pp = f'{path}/protos/bxp_{nm}_{Sdf.Path(path).name}'   # unique names: blender_moving.py finds each prototype by it
        fn_(pp)
        targets.append(Sdf.Path(pp))
    pi.CreatePrototypesRel().SetTargets(targets)
    pi.CreateIdsAttr(Vt.Int64Array(list(range(n))))
    if custom: pi.GetPrim().SetCustomData(custom)
    pos = np.zeros((n, nF, 3)); qua = np.zeros((n, nF, 4)); scl = np.zeros((n, nF, 3))
    for f in range(nF):
        p_, q_, s_, _ = decompose(m12_to_16(M[:, f]))
        pos[:, f] = p_; qua[:, f] = q_; scl[:, f] = s_
    # quaternion signs continuous in time (q and -q are one rotation; interpolation takes the short way)
    for f in range(1, nF):
        flip = (qua[:, f] * qua[:, f - 1]).sum(1) < 0
        qua[flip, f] *= -1
    vel = np.zeros_like(pos); ang = np.zeros_like(pos)
    if nF > 1:
        fp = np.minimum(np.arange(nF) + 1, nF - 1); fm = np.maximum(np.arange(nF) - 1, 0); dt = (fp - fm) / fps
        vel = (pos[:, fp] - pos[:, fm]) / dt[None, :, None]
        qc = qua[:, fm] * np.array([1, -1, -1, -1]); dq = quat_mul(qua[:, fp], qc)
        dq[dq[..., 0] < 0] *= -1
        ang_n = 2 * np.arccos(np.clip(dq[..., 0], -1, 1)); sv = np.linalg.norm(dq[..., 1:], axis=-1)
        axis = dq[..., 1:] / np.maximum(sv, 1e-12)[..., None]
        ang = axis * (np.degrees(ang_n) / dt[None, :])[..., None]
        still = ~(present[:, fp] & present[:, fm])
        vel[still] = 0; ang[still] = 0
    nproto = len(protos)
    P_ = pi.CreatePositionsAttr(); O_ = pi.CreateOrientationsAttr(); S_ = pi.CreateScalesAttr(); I_ = pi.CreateProtoIndicesAttr()
    V_ = pi.CreateVelocitiesAttr(); W_ = pi.CreateAngularVelocitiesAttr()
    pv = UsdGeom.PrimvarsAPI(pi)
    if paint is not None:
        pv.CreatePrimvar('nyc_paint', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(np.asarray(paint, dtype=np.float32))))
    LM = pv.CreatePrimvar('nyc:lampMask', Sdf.ValueTypeNames.IntArray, UsdGeom.Tokens.vertex) if lamp is not None else None
    SP = pv.CreatePrimvar('nyc:spin', Sdf.ValueTypeNames.FloatArray, UsdGeom.Tokens.vertex) if spin is not None else None
    ST = pv.CreatePrimvar('nyc:steer', Sdf.ValueTypeNames.FloatArray, UsdGeom.Tokens.vertex) if steer is not None else None
    for f in range(nF):
        tc = Usd.TimeCode(f)
        P_.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(pos[:, f].astype(np.float32))), tc)
        O_.Set(Vt.QuathArray([Gf.Quath(float(w), float(x), float(y), float(z)) for w, x, y, z in qua[:, f]]), tc)
        S_.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(scl[:, f].astype(np.float32))), tc)
        I_.Set(Vt.IntArray.FromNumpy(np.where(present[:, f], 0, nproto - 1).astype(np.int32)), tc)
        V_.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(vel[:, f].astype(np.float32))), tc)
        W_.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(ang[:, f].astype(np.float32))), tc)
        if LM is not None: LM.Set(Vt.IntArray.FromNumpy(np.asarray(lamp[:, f], dtype=np.int32)), tc)
        if SP is not None: SP.Set(Vt.FloatArray.FromNumpy(np.asarray(spin[:, f], dtype=np.float32)), tc)
        if ST is not None: ST.Set(Vt.FloatArray.FromNumpy(np.asarray(steer[:, f], dtype=np.float32)), tc)
    stats['take_instancers'] = stats.get('take_instancers', 0) + 1; stats['take_instances'] = stats.get('take_instances', 0) + n
    return pi

def proto_part(stage, path, gid, mats, ipaint=False):
    """one mesh of a take prototype (a reference to /_geo, its material variants); ipaint: the ':paint' materials read the
    instance's nyc_paint."""
    G = load_geo(gid)
    prim = stage.DefinePrim(path, 'Mesh'); prim.GetReferences().AddInternalReference(geo_prim(gid))
    m = UsdGeom.Mesh(prim)
    variants, dc = face_variants(G, mats)
    if ipaint:
        nv = []
        for mp, f in variants:
            mm = re.match(r'/World/Looks/m(\d+)', mp)
            if mm and ':paint' in (MATS[int(mm.group(1))].get('name') or ''): mp = material(int(mm.group(1)), mul=_mul_of(mp), paint=True, ipaint=True)
            nv.append((mp, f))
        variants = nv
    if dc:
        pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('displayColor', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(G['color'][:, :3].astype(np.float32))))
    if len(variants) == 1: bind_path(stage, prim, variants[0][0])
    else:
        for k, (mp, faces) in enumerate(variants):
            ss = UsdGeom.Subset.Define(stage, f'{path}/s{k}')
            ss.CreateElementTypeAttr(UsdGeom.Tokens.face); ss.CreateFamilyNameAttr('materialBind')
            ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces.astype(np.int32)))
            bind_path(stage, ss.GetPrim(), mp)
        if variants: UsdGeom.Subset.SetFamilyType(m, 'materialBind', UsdGeom.Tokens.partition)
    if any(MATS[x].get('side') == 2 for x in mats if x >= 0): m.CreateDoubleSidedAttr(True)
    run_hooks('mesh', stage, prim, gid, mats, G)   # BX hooks
    return prim

def write_moving(shot, info, sfn):
    mf = info.get('movFile')
    if not mf or not os.path.exists(os.path.join(IN, mf)): return None
    t1 = time.time()
    MV = json.load(open(os.path.join(IN, mf)))
    nF, fps = int(MV['frames']), float(MV.get('fps') or man['fps'])
    fn = f'mov_{shot}.usdc'
    ms = Usd.Stage.CreateNew(os.path.join(OUT, fn))
    UsdGeom.SetStageUpAxis(ms, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(ms, 1.0)
    ms.SetStartTimeCode(0); ms.SetEndTimeCode(nF - 1); ms.SetTimeCodesPerSecond(fps); ms.SetFramesPerSecond(fps)
    UsdGeom.Xform.Define(ms, '/World'); UsdGeom.Scope.Define(ms, '/World/Moving')
    empty = lambda pp: UsdGeom.Xform.Define(ms, pp)
    def track(items, get_m):   # -> (n x nF x 12 matrices, n x nF present)
        Mx = np.zeros((len(items), nF, 12)); pr = np.zeros((len(items), nF), dtype=bool)
        for k, it in enumerate(items):
            f0, ms_ = it['f0'], get_m(it)
            for f in range(nF):
                j = min(max(f - f0, 0), len(ms_) - 1)
                Mx[k, f] = ms_[j]; pr[k, f] = 0 <= f - f0 < len(ms_)
        return Mx, pr
    def series(items, key, dtype=np.float32):
        out = np.zeros((len(items), nF), dtype=dtype)
        for k, it in enumerate(items):
            v = it.get(key) or [0]
            for f in range(nF): out[k, f] = v[min(max(f - it['f0'], 0), len(v) - 1)]
        return out
    nveh = 0
    # a parked car keeps its place but not its storage slot (the sim re-buckets the parked pools as the lens moves: the
    # same body leaves one slot and takes another in the same frame): parked records are one car per place
    merged = {}
    for c in MV['cars']:
        if c.get('moving', True): continue
        k = (c['g'], round(c['m'][0][9] * 10), round(c['m'][0][11] * 10))
        e = merged.get(k)
        if e is None: merged[k] = dict(c, m=[c['m'][0]], spin=[c['spin'][0]], steer=[c['steer'][0]], mask=[c['mask'][0]], bend=[c['bend'][0]])
        else: e['f0'] = min(e['f0'], c['f0']); e['f1'] = max(e['f1'], c['f1']); e['drawn'] = e.get('drawn', 0) + c.get('drawn', 0)
    for e in merged.values(): e['m'] = e['m'] * (e['f1'] - e['f0'] + 1); e['mask'] = e['mask'] * (e['f1'] - e['f0'] + 1)
    MV['cars'] = [c for c in MV['cars'] if c.get('moving', True)] + list(merged.values())
    for G_ in MV.get('groups') or []:
        cars = [c for c in MV['cars'] if c['g'] == G_['gi']]
        if not cars or not G_.get('parts'): continue
        base = f"/World/Moving/veh_g{G_['gi']}_{ident(G_['kind'] or 'veh', 20)}{'' if G_['moving'] else '_parked'}"
        def car_proto(pp, parts=G_['parts']):
            x = UsdGeom.Xform.Define(ms, pp)
            x.GetPrim().SetCustomData({'nyc:kind': G_['kind'] or '', 'nyc:lamps': json.dumps(G_.get('lamps') or {}), 'nyc:size': Gf.Vec3d(*[float(v) for v in (G_.get('size') or [0, 0, 0])])})
            for j, pt in enumerate(parts): proto_part(ms, f'{pp}/p{j}_{ident(pt.get("cls") or "part", 12)}', pt['geo'], pt['mats'], ipaint=True)
        custom = {'nyc:ids': json.dumps([c['id'] for c in cars]), 'nyc:group': G_['tag'], 'nyc:kind': G_['kind'] or ''}
        Mx, pr = track(cars, lambda c: c['m'])
        paint = np.array([c['col'] for c in cars], dtype=np.float32)
        lamp, spin, steer = series(cars, 'mask', np.int32), series(cars, 'spin'), series(cars, 'steer')
        author_take_instancer(ms, base, [('car', car_proto), ('none', empty)], (Mx, pr), nF, fps, None, paint=paint, lamp=lamp, spin=spin, steer=steer, custom=custom)
        if G_.get('rear') and G_.get('pivot'):
            bend = series(cars, 'bend')
            Mr = np.zeros_like(Mx)
            for k in range(len(cars)):
                for f in range(nF): Mr[k, f] = rear_m12(Mx[k, f], float(bend[k, f]), G_['pivot'])
            author_take_instancer(ms, base + '_rear', [('rear', lambda pp: car_proto(pp, G_['rear'])), ('none', empty)], (Mr, pr), nF, fps, None, paint=paint, lamp=lamp, custom=custom)
        nveh += len(cars)
    for j, mv in enumerate(MV.get('movers') or []):
        if not mv.get('tracks') or mv.get('geo') is None: continue
        path = f"/World/Moving/mv{j}_{ident(mv['name'].split(' < ')[0], 30)}"
        Mx, pr = track(mv['tracks'], lambda T: T['m'])
        author_take_instancer(ms, path, [('p', lambda pp, mv=mv: proto_part(ms, pp, mv['geo'], mv['mats'])), ('none', empty)], (Mx, pr), nF, fps, None,
                              custom={'nyc:ids': json.dumps([T['id'] for T in mv['tracks']]), 'nyc:set': mv['name']})
    # the signal lenses of the shot's static layer: a dark lens is invisible (time-sampled invisibleIds), every lens at scale 1
    nsig = 0
    for nm, per in (MV.get('sigOn') or {}).items():
        for ipath, iid in POOL_PRIMS.get(sfn, {}).get(nm, []):
            o = ms.OverridePrim(ipath)
            pi = UsdGeom.PointInstancer(o)
            # the scales time-sampled as the web draws them (a lit lens at 1, a dark one at 0.001: sim/signals.js), so a
            # renderer that reads no invisibleIds (Blender's importer reads a time-varying instancer through its Mesh
            # Sequence Cache only when its transforms are sampled) still switches the lenses frame by frame
            sca = pi.CreateScalesAttr(); inv = pi.CreateInvisibleIdsAttr()
            for f in range(nF):
                on = per[f] if f < len(per) else None
                if on is None: continue
                ons = set(on)
                sca.Set(Vt.Vec3fArray([Gf.Vec3f(1, 1, 1) if s_ in ons else Gf.Vec3f(0.001, 0.001, 0.001) for s_ in iid]), Usd.TimeCode(f))
                inv.Set(Vt.Int64Array([s_ for s_ in iid if s_ not in ons]), Usd.TimeCode(f))
            nsig += 1
    ms.GetRootLayer().customLayerData = {'shot': shot, 'frames': nF, 'simTime': json.dumps(MV.get('simTime')), 'signals': json.dumps(MV.get('sig')), 'night': json.dumps(MV.get('night'))}
    run_hooks('moving', ms, shot)   # BX hooks
    ms.GetRootLayer().Save()
    stats.setdefault('take', {})[shot] = {'cars': nveh, 'movers': len(MV.get('movers') or []), 'signal_instancers': nsig, 'secs': round(time.time() - t1, 1)}
    return fn

def root_layer(rfn, shot, info, sublayers, cpath, frame=None, extra=None):
    r = Usd.Stage.CreateNew(os.path.join(OUT, rfn))
    r.GetRootLayer().subLayerPaths = sublayers
    UsdGeom.SetStageUpAxis(r, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(r, 1.0)
    r.SetStartTimeCode(0); r.SetEndTimeCode(info['frames'] - 1); r.SetTimeCodesPerSecond(man['fps']); r.SetFramesPerSecond(man['fps'])
    # the region's centre to the origin: at 3.9 km from the city's origin float32 resolves 0.24 mm, too coarse for the
    # ground's millimetre layers in a path tracer; every layer sits under /World, so one translate on the root moves all
    wx = UsdGeom.Xformable(r.OverridePrim('/World'))
    wx.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble, 'recentre').Set(Gf.Vec3d(-man['centreXZ'][0], 0.0, -man['centreXZ'][1]))
    cd = {'shot': shot, 'frame': frame if frame is not None else 0, 'camera': str(cpath), 'sunDir': Gf.Vec3d(*(sun_dir or [0, 1, 0])),
          'origin': Gf.Vec3d(man['centreXZ'][0], 0.0, man['centreXZ'][1]),
          'sunColor': Gf.Vec3d(*(sun['color'] if sun else [1, 1, 1])), 'sunIntensity': float(sun['intensity']) if sun else 3.0,
          'exposure': float(LIG.get('exposure', 1.0)), 'toneMapping': int(LIG.get('toneMapping', 0)), 'envIntensity': float(LIG.get('environmentIntensity') or 0),
          'time': str(info.get('time') or ''), 'frames': int(info['frames']), 'harvest': os.path.abspath(IN),
          'source': 'BoundlessNYC harvest ' + man['when']}
    cd.update(extra or {})
    r.GetRootLayer().customLayerData = cd
    r.SetDefaultPrim(r.GetPrimAtPath('/World')) if r.GetPrimAtPath('/World') else None
    r.GetRootLayer().Save()
    return rfn

roots = []
for shot in SHOTS:
    info = man['shots'][shot]
    cfn, cpath = cam_layer(shot, info)
    sfn = STATIC_OF[shot]
    hook_layers = [l for v in run_hooks('layers', shot).values() if v for l in v]   # BX hooks: a track's own layers
    mfn = write_moving(shot, info, sfn)
    if mfn:   # the take root: every frame of the shot
        roots.append(root_layer(f'{shot}.usda', shot, info, [cfn, mfn] + hook_layers + [sfn, 'looks.usdc', 'geo.usdc', 'lights.usda'], cpath, extra={'take': True, 'mov': mfn}))
    if A.nokeys: continue
    still = sfn != 'static.usdc'   # the per-shot static layer has the still instanced sets: the key layers keep the vehicles and trains only
    for K in info['key']:
        dfn = None
        if not A.nodyn:
            t1 = time.time()
            D = json.load(open(os.path.join(IN, K['file'])))
            dfn = f"dyn_{shot}_f{K['frame']:03d}.usdc"
            ds = Usd.Stage.CreateNew(os.path.join(OUT, dfn))
            UsdGeom.SetStageUpAxis(ds, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(ds, 1.0)
            UsdGeom.Xform.Define(ds, '/World'); UsdGeom.Scope.Define(ds, '/World/Moving')
            for j, s_ in enumerate(D['instanced']):
                if still and not re.match(r'(veh|trains):', s_['name']): continue
                author_instancer(ds, f"/World/Moving/i{j}_{ident(s_['name'].split(' < ')[0], 30)}", s_['geo'], s_['mats'], s_['matrices'], s_.get('colors'), paint=(s_.get('inst') or {}).get('aCol'))
            ds.GetRootLayer().Save()
            stats.setdefault('secs_dyn', {})[dfn] = round(time.time() - t1, 1)
        roots.append(root_layer(f"{shot}_f{K['frame']:03d}.usda", shot, info, [cfn] + ([dfn] if dfn else []) + hook_layers + [sfn, 'looks.usdc', 'geo.usdc', 'lights.usda'], cpath, frame=K['frame']))

looks_stage.GetRootLayer().Save()
geo_stage.GetRootLayer().Save()
size = {f: os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if os.path.isfile(os.path.join(OUT, f))}
tex_bytes = sum(os.path.getsize(os.path.join(OUT, 'textures', f)) for f in os.listdir(os.path.join(OUT, 'textures')))
stats['bytes'] = size; stats['tex_bytes'] = tex_bytes; stats['roots'] = roots; stats['secs_total'] = round(time.time() - t_start, 1)
run_hooks('finish')   # BX hooks
json.dump(stats, open(os.path.join(OUT, 'write_stats.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in stats.items() if k != 'bytes'}, indent=1))
print('layers MB', {k: round(v / 1e6, 1) for k, v in size.items()}, 'textures MB', round(tex_bytes / 1e6, 1))
if COPLANAR_FAIL and A.coplanar == 'fix':   # BX-FIX: loud, after every layer is saved (the batch marks the USD stage failed)
    print('COPLANAR FAIL: unresolved coplanar pairs in ' + ', '.join(COPLANAR_FAIL) + ' (stats coplanar; --coplanar warn to keep going)', flush=True)
    sys.exit(4)
