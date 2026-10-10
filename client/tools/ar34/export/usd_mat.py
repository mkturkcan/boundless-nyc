# BX-MAT (AR34 BX, 2026-10-02): usd_write.py hook (docs/notes/ar34-bx-seq.md, `HOOKS` in usd_write.py: 'usd_mat').
#
# By default (`--nobxmat` on usd_write.py's command line turns it off; round 1 had it behind --bxmat) the writer stops splitting faces
# into material variants (one UsdPreviewSurface per tint, vertex colour and ground kind: 7-27 k materials, 21-123 s of
# Blender import) and instead:
#   - binds one material per three material slot (the tile facades' hide mask still split off);
#   - authors the per-vertex data the web shaders read as primvars on the geometry: aFkTr (float3, the kit's tint over its
#     set), aWeather (color4f: seed, baseY, topY, dirt), aGrime (float), bxCol (color3f, three's vertex colour), matId
#     (float, the ground's surface kind), gpK (color4f, the kerb frame, raw Uint16 values), aRv (color4f) and aJ (float3)
#     (the viaducts' rivet rows). Blender's importer drops float4 primvars, so the vec4s go as color4f;
#   - tags every material it can rebuild with customData `bx` (a JSON string: the family, the web shader's uniforms, the
#     texture files), which blender_nodes.py turns into node groups. The UsdPreviewSurface stays on every material as the
#     fallback for Omniverse and any other USD renderer (untinted; untextured vertex-coloured and kit-tinted materials
#     read their colour primvar, so they keep their colours there too).
import json, os, re
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, Sdf, Vt, Gf

BX = False
PBRT = {}
HAS_SG = False
_done_geo = set()
_need_geo = {}
STATS = {'materials': {}, 'primvars': 0, 'ground_meshes': 0, 'geo_primvars': 0}

STREET_CAL = [1.94, 1.70, 1.47]


def _pbr_table():
    """pbrLib.js MATS: name -> {tex, fam, gum, paintOver, ...} (parsed from the web source, so it never drifts)."""
    here = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(here, '..', '..', '..', 'src', 'city', 'mat', 'pbrLib.js')
    out = {}
    try:
        txt = open(src).read()
    except OSError:
        return out
    blk = txt.split('const MATS = {', 1)[1].split('\n};', 1)[0]
    for m in re.finditer(r"^\s*(\w+): \{ tex: '(\w+)', fam: '(\w+)'(.*?)\},?\s*(//.*)?$", blk, re.M):
        e = {'tex': m.group(2), 'fam': m.group(3)}
        for k, v in re.findall(r"(\w+): ([-\d.]+)", m.group(4)):
            e[k] = float(v)
        out[m.group(1)] = e
    return out


def setup(ctx):
    global BX, PBRT
    # on by default (lead, round 2): --nobxmat writes the pilot's face-split variants instead
    BX = '--nobxmat' not in (ctx.argv or [])
    if not BX:
        return
    PBRT = _pbr_table()
    ctx.stats['bxmat'] = STATS
    # the sign faces need their per-vertex terms (harvests from 2026-10-02 21:08 on carry them)
    global HAS_SG
    HAS_SG = any(any(L['name'] == 'sgRect' for L in g['layout']) for g in ctx.man['geos'])
    STATS['sign_terms'] = HAS_SG
    # the root carries the switch, so blender_nodes.py knows the primvars are there
    STATS['pbr_table'] = len(PBRT)


def _u(U, k, d=None):
    v = U.get(k, d)
    if isinstance(v, dict):
        if 'vec' in v:
            return [float(x) for x in v['vec']]
        if 'color' in v:
            return [float(x) for x in v['color']]
        return d
    return v


def _lt(U, d=None):
    """the web's day / night trim of applyLightTrim (mix(0.30, 0.88, night)), or None when the material has none."""
    for k in ('ltNight', 'pbNight'):
        if k in U and not isinstance(U[k], dict):
            n = float(U[k])
            return 0.30 + (0.88 - 0.30) * n, n
    return None, None


def classify(ctx, mid, d):
    """the family blender_nodes.py rebuilds this material with, and its parameters; None = keep the importer's."""
    U = d.get('uni') or {}
    attrs = d.get('obcAttrs') or []
    ud = d.get('ud') or {}
    name = d.get('name') or ''
    lt, night = _lt(U)
    maps = d.get('maps') or {}
    P = {'mid': mid, 'name': name, 'type': d.get('type'), 'rough': d.get('roughness', 1.0), 'metal': d.get('metalness', 0.0),
         'color': d.get('color') or [1, 1, 1], 'side': d.get('side', 0)}
    if lt is not None:
        P['lt'] = lt
        P['night'] = night
    if 'matId' in attrs:
        P['kind'] = 'ground'
        tA = (U.get('t_gpA') or {}).get('tex')
        tN = (U.get('t_gpN') or {}).get('tex')
        P['gpA'] = [ctx.tex_file(tA, L) for L in range(int((ctx.TEXS.get(tA) or {}).get('layers', 0)))] if tA is not None else []
        P['gpN'] = [ctx.tex_file(tN, L) for L in range(int((ctx.TEXS.get(tN) or {}).get('layers', 0)))] if tN is not None else []
        for k in ('night', 'wet', 'gpMacroL', 'gpGravelL', 'lb14Road'):
            if k in U and not isinstance(U[k], dict):
                P[k] = float(U[k])
        for k in ('lb14StCal', 'lb14Walk', 'lb14Paint'):
            v = _u(U, k)
            if v:
                P[k] = v
        P['ground_tex'] = {k: ctx.tex_file(U[k]['tex']) for k in ('t_grC', 't_pvC') if isinstance(U.get(k), dict) and 'tex' in U[k]}
        return P
    if 'vkPaint' in U:
        P['kind'] = 'vk'
        for k, v in U.items():
            if k.startswith('vk'):
                P[k] = _u(U, k) if isinstance(v, dict) else float(v)
        P['noShadow'] = bool(ud.get('noShadow'))
        return P
    if 'pbAlb' in U and isinstance(U['pbAlb'], dict) and 'tex' in U['pbAlb']:
        P['kind'] = 'pbr'
        pb = ud.get('pbr') or {}
        o = pb.get('opts') or {}
        M = PBRT.get(pb.get('name') or '', {})
        P['set'] = pb.get('name')
        P['fam'] = M.get('fam', 'wall')
        P['gum'] = 1 if M.get('gum') else 0
        P['tex'] = {k: ctx.tex_file(U[u]['tex']) for k, u in (('alb', 'pbAlb'), ('nrm', 'pbNrm'), ('orm', 'pbOrm'))
                    if isinstance(U.get(u), dict) and 'tex' in U[u]}
        for k in ('pbSize', 'pbRatio', 'pbSeed', 'pbDirt', 'pbBaseY', 'pbTopY', 'pbPaint', 'pbUnit', 'pbBl', 'pbRot', 'pbWorld',
                  'pbChips', 'pbRefL', 'pbScan', 'pbSubK', 'pbOver', 'pbCavK', 'pbGrimeC', 'pbGlazed', 'pbRS', 'pbRough',
                  'pbMetal', 'pbNrmK', 'pbFac'):
            if k in U:
                P[k] = _u(U, k) if isinstance(U[k], dict) else float(U[k])
        P['paint'] = 1 if (P.get('pbScan') or [0, 0, 0, 1])[3] < 0.999 else 0
        P['over'] = 1 if (P.get('pbOver') or [0])[0] > 0 else 0
        P['street'] = 1 if P['fam'] == 'street' else 0
        P['gAttr'] = 1 if 'aGrime' in attrs else 0
        P['wAttr'] = 1 if 'aWeather' in attrs else 0
        P['dAttr'] = 1 if ('aWeather' in attrs and o.get('dirtAttr')) else 0
        P['fktr'] = 1 if 'aFkTr' in attrs else 0
        P['vc'] = 1 if d.get('vertexColors') else 0
        if isinstance(U.get('pbCAO'), dict) and 'tex' in U['pbCAO'] and _u(U, 'pbCAORect'):
            P['cao'] = {'file': ctx.tex_file(U['pbCAO']['tex']), 'rect': _u(U, 'pbCAORect')}
        tr = o.get('trim')
        P['trimK'] = STREET_CAL if (P['street'] and tr is None) else ([float(tr)] * 3 if isinstance(tr, (int, float)) else [1, 1, 1])
        return P
    # the kit's signs (fk/signKit.js): faces drawn from an atlas slot with their terms per vertex (sgRect ...), the contact
    # shadow / glow quads, the vertex-coloured glow parts
    if HAS_SG and name.startswith('ar33sign:') and any(a.startswith('sg') for a in attrs):
        P['kind'] = 'sign'
        t = ctx.TEXS.get(maps.get('map')) if 'map' in maps else None
        P['tex'] = {'map': ctx.tex_file(maps['map'])} if t else {}
        P['mask'] = 1 if (t and int(t.get('format') or 0) == 1028) else 0
        P['decal'] = 1 if d.get('transparent') else 0
        P['shade'] = 1 if 'shade' in name else 0
        P['glowvc'] = 1 if 'glowvc' in name else 0
        P['sgNight'] = float(U.get('sgNight', U.get('ltNight', 0.05))) if not isinstance(U.get('sgNight'), dict) else 0.05
        P['sgSatK'] = float(U.get('sgSatK', 0.75)) if not isinstance(U.get('sgSatK'), dict) else 0.75
        return P
    # decals (graffiti tags, wheat-paste posters, grime runs: city/decals.js, an alpha-blended atlas over the wall)
    if 'map' in maps and d.get('transparent') and not d.get('depthWrite', True) and 0 < float(d.get('alphaTest') or 0) < 0.1:
        P['kind'] = 'decal'
        P['tex'] = {'map': ctx.tex_file(maps['map'])}
        return P
    # (a tile facade's vertex colour too: without the face split this is what keeps its colours; where WIN's bake replaces
    # a facade, usd_windows' variants hook runs first and this material is not bound)
    vc = bool(d.get('vertexColors')) and not ud.get('fkGlass') and 'aClu' not in attrs
    tr = 'aFkTr' in attrs and not ud.get('fkGlass')
    if (vc or tr) and not d.get('transparent'):
        P['kind'] = 'plain'
        P['vc'] = 1 if vc else 0
        P['fktr'] = 1 if tr else 0
        P['kit'] = 1 if lt is not None else 0
        return P
    # every other opaque material the web trims (props, poles, furniture, the viaducts' stone and fallbacks): its base
    # colour takes the same factor as the families, so it keeps the web's balance against the road (blender_nodes.trim_of)
    if lt is not None and not d.get('transparent') and d.get('type') in ('MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial'):
        P['kind'] = 'plain'
        P['vc'] = 0
        P['fktr'] = 0
        P['kit'] = 1
        return P
    # (round 2) an opaque lit material the web does not trim (the fleet, the web's own crowns, props without the trim): lit
    # by the full sun in the web, so against the road it sits 1 / (trim x the road's calibration) higher there
    if lt is None and not d.get('transparent') and d.get('type') in ('MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial') \
            and not (ud.get('fkGlass') or 'glass' in name.lower()):
        P['kind'] = 'untrim'
        return P
    return None


def _tri_mi(G, nmats):
    """material slot per triangle from the geometry's groups (as usd_write.tri_material_index)."""
    mi = np.zeros(G['ntri'], dtype=np.int32)
    if G['groups'] and nmats > 1:
        mi[:] = -1
        for q in G['groups']:
            a, b = max(0, q['start'] // 3), min(G['ntri'], (q['start'] + q['count']) // 3)
            if b > a:
                mi[a:b] = q['mi']
    return mi


_hide = {}


def _hide_mask(ctx, d):
    """a tile facade's per-building hide mask (uHide, 256 x 256, indexed by aBid), as usd_write.hide_mask."""
    u = (d.get('uni') or {}).get('uHide')
    if not isinstance(u, dict) or 'tex' not in u:
        return None
    tid = u['tex']
    if tid in _hide:
        return _hide[tid]
    t = ctx.TEXS.get(tid)
    m = None
    if t and t.get('files') and t.get('ow') == 256 and t.get('oh') == 256:
        from PIL import Image
        a = np.asarray(Image.open(os.path.join(ctx.IN, t['files'][0])).convert('RGB'))[:, :, 0]
        m = a[::-1, :] > 127
    _hide[tid] = m
    return m


def _hidden(ctx):
    path = '/World/Looks/hidden'
    if not ctx.stage_looks.GetPrimAtPath(path):
        mat = UsdShade.Material.Define(ctx.stage_looks, path)
        sh = UsdShade.Shader.Define(ctx.stage_looks, path + '/pbr')
        sh.CreateIdAttr('UsdPreviewSurface')
        sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).Set(0.0)
        sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    return path


def variants(ctx, G, mats):
    """one variant per material slot (no tint / colour / ground-kind split); the tile facades' hide mask kept."""
    if not BX:
        return None
    mi = _tri_mi(G, len(mats))
    out = []
    for slot in sorted(set(mi.tolist())):
        if slot < 0 or slot >= len(mats) or mats[slot] < 0:
            continue
        faces = np.nonzero(mi == slot)[0]
        mid = mats[slot]
        d = ctx.MATS[mid]
        if not d.get('colorWrite', True) or not d.get('visible', True):
            continue
        if 'aBid' in G and (d.get('ud') or {}).get('isFacade'):
            hm = _hide_mask(ctx, d)
            if hm is not None:
                bid = np.round(G['aBid'][G['index'][faces * 3]]).astype(np.int64)
                hid = hm[np.clip(bid // 256, 0, 255), bid % 256]
                if hid.any():
                    out.append((_hidden(ctx), faces[hid]))
                    faces = faces[~hid]
                    if not len(faces):
                        continue
        # the vertex colour is authored only where a material multiplies it (not the crowns' cluster shading, not the
        # kit glass's room tint)
        if d.get('vertexColors') and not (d.get('ud') or {}).get('fkGlass') and 'aClu' not in (d.get('obcAttrs') or []):
            G['_bx_vc'] = True
        if 'matId' in G and 'matId' in (d.get('obcAttrs') or []):
            out.append((ctx.material(mid, ground=0), faces))
        else:
            out.append((ctx.material(mid), faces))
    return out


def material(ctx, mid, d, path, sh, info):
    if not BX:
        return
    P = classify(ctx, mid, d)
    if P is None:
        return
    if (info or {}).get('ground') not in (None, 0) and P.get('kind') == 'ground':
        return
    prim = ctx.stage_looks.GetPrimAtPath(path)
    prim.SetCustomDataByKey('bx', json.dumps(P, separators=(',', ':')))
    STATS['materials'][P['kind']] = STATS['materials'].get(P['kind'], 0) + 1
    # the fallback for other renderers: an untextured vertex-coloured or kit-tinted material reads its colour primvar
    if P['kind'] == 'plain' and 'map' not in (d.get('maps') or {}):
        var = 'aFkTr' if P.get('fktr') and not P.get('vc') else ('bxCol' if P.get('vc') and not P.get('fktr') else None)
        if var:
            rd = UsdShade.Shader.Define(ctx.stage_looks, path + '/bxpv')
            rd.CreateIdAttr('UsdPrimvarReader_float3')
            rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set(var)
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(rd.ConnectableAPI(), 'result')


def _primvars(m, G, unweld=None):
    """author the shader attributes of geometry G on mesh m (unweld: the corner -> vertex index array of an unwelded mesh)."""
    pv = UsdGeom.PrimvarsAPI(m)
    n = 0

    def take(a):
        return a[unweld] if unweld is not None else a

    def put(name, tp, arr):
        p = pv.CreatePrimvar(name, tp, UsdGeom.Tokens.vertex)
        p.Set(arr)

    if 'aFkTr' in G:
        put('aFkTr', Sdf.ValueTypeNames.Float3Array, Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(take(G['aFkTr']).astype(np.float32))))
        n += 1
    if 'aWeather' in G:
        a = take(G['aWeather']).astype(np.float32)
        if a.ndim == 1 or a.shape[1] < 4:
            a = np.concatenate([a.reshape(len(a), -1), -np.ones((len(a), 4 - a.reshape(len(a), -1).shape[1]), np.float32)], axis=1)
        put('aWeather', Sdf.ValueTypeNames.Color4fArray, Vt.Vec4fArray.FromNumpy(np.ascontiguousarray(a)))
        n += 1
    if 'aGrime' in G:
        put('aGrime', Sdf.ValueTypeNames.FloatArray, Vt.FloatArray.FromNumpy(np.ascontiguousarray(take(G['aGrime']).reshape(-1).astype(np.float32))))
        n += 1
    if 'color' in G and G.get('_bx_vc'):
        c = take(G['color']).astype(np.float32)[:, :3]
        put('bxCol', Sdf.ValueTypeNames.Color3fArray, Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(c)))
        n += 1
    if 'matId' in G:
        put('matId', Sdf.ValueTypeNames.FloatArray, Vt.FloatArray.FromNumpy(np.ascontiguousarray(take(G['matId']).reshape(-1).astype(np.float32))))
        n += 1
    if 'gpK' in G:
        put('gpK', Sdf.ValueTypeNames.Color4fArray, Vt.Vec4fArray.FromNumpy(np.ascontiguousarray(take(G['gpK']).astype(np.float32).reshape(-1, 4))))
        n += 1
    if 'aRv' in G:
        put('aRv', Sdf.ValueTypeNames.Color4fArray, Vt.Vec4fArray.FromNumpy(np.ascontiguousarray(take(G['aRv']).astype(np.float32).reshape(-1, 4))))
        n += 1
    if 'aJ' in G:
        j = take(G['aJ']).astype(np.float32).reshape(-1, 2)
        put('aJ', Sdf.ValueTypeNames.Float3Array, Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(np.concatenate([j, np.zeros((len(j), 1), np.float32)], axis=1))))
        n += 1
    # the sign faces' terms (fk/signKit.js faceAttrs): vec4s as color4f, vec3s as float3
    for nm in ('sgRect', 'sgP', 'sgF'):
        if nm in G:
            put(nm, Sdf.ValueTypeNames.Color4fArray, Vt.Vec4fArray.FromNumpy(np.ascontiguousarray(take(G[nm]).astype(np.float32).reshape(-1, 4))))
            n += 1
    for nm in ('sgBg', 'sgFg', 'sgLamp'):
        if nm in G:
            put(nm, Sdf.ValueTypeNames.Float3Array, Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(take(G[nm]).astype(np.float32).reshape(-1, 3))))
            n += 1
    STATS['primvars'] += n
    return n


WANT = ('aFkTr', 'aWeather', 'aGrime', 'color', 'matId', 'gpK', 'aRv', 'aJ', 'sgRect', 'sgBg', 'sgFg', 'sgLamp', 'sgP', 'sgF')


def mesh(ctx, stage, prim, gid, mats, G):
    """the ground's own unwelded mesh takes its primvars here; a mesh that references /_geo gets them on the geo prim."""
    if not BX:
        return
    if not any(k in G for k in WANT):
        return
    m = UsdGeom.Mesh(prim)
    # author_ground writes its own unwelded world-space mesh (no reference to /_geo): 3 points per kept triangle, in order
    # (BX-SEQ drops the covered ground triangles: G['_ground_keep'] lists the kept ones)
    if not prim.HasAuthoredReferences() and 'matId' in G:
        I = G['index'][:G['ntri'] * 3].reshape(-1, 3).astype(np.int64)
        keep = G.get('_ground_keep')
        if keep is not None:
            I = I[np.asarray(keep, dtype=np.int64)]
        pts = m.GetPointsAttr().Get()
        if pts is not None and len(pts) != I.size:
            STATS['ground_mismatch'] = STATS.get('ground_mismatch', 0) + 1
            return
        _primvars(m, G, unweld=I.reshape(-1))
        STATS['ground_meshes'] += 1
    else:
        _geo(ctx, gid, G)


def _geo(ctx, gid, G=None):
    if gid in _done_geo:
        return
    p = ctx.stage_geo.GetPrimAtPath(f'/_geo/g{gid}')
    if not p:
        return
    G = G if G is not None else ctx.load_geo(gid)
    if _primvars(UsdGeom.Mesh(p), G):
        STATS['geo_primvars'] += 1
    _done_geo.add(gid)


def _sweep(ctx):
    """every geometry prim written so far (pools, instancer prototypes, moving sets) gets its primvars."""
    root = ctx.stage_geo.GetPrimAtPath('/_geo')
    if not root:
        return
    for p in root.GetAllChildren():   # BX-FIN: the /_geo prims are class prims, which GetChildren() skips (pools and prototypes got no primvars)
        nm = p.GetName()
        if not nm.startswith('g'):
            continue
        try:
            gid = int(nm[1:])
        except ValueError:
            continue
        if gid in _done_geo:
            continue
        g = ctx.GEOS.get(gid)
        if not g or not any(L['name'] in WANT for L in g['layout']):
            _done_geo.add(gid)
            continue
        _geo(ctx, gid)


def static(ctx, stage):
    if BX:
        _sweep(ctx)


def moving(ctx, stage, shot):
    if BX:
        _sweep(ctx)


def finish(ctx):
    if not BX:
        return
    _sweep(ctx)
    ctx.stage_geo.GetRootLayer().Save()
    ctx.stage_looks.GetRootLayer().Save()
    print('BX-MAT', json.dumps(STATS))
