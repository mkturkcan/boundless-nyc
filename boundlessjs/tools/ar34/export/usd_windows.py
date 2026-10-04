# BX-WIN (AR34 BX, 2026-10-02): the tile facades' bake (harvest_facades.mjs) and the window materials' roles, written into
# the USD export (usd_write.py) for Blender (blender_windows.py) and any USD renderer.
#
# In the harvest dir: bxwin.json (atlases, charts, densities), geo/bxw_fac<k>.bin (the facade triangles de-indexed in world
# space: corners pos / nrm / col / facade uv / atlas uv, per triangle aux, aux2, aux3, aBid, atlas uv per metre) and
# tex/bxw_a<k>_{alb,dat,emi}.png (RGBA, alpha = the bake's coverage).
# Written here:
#   - the harvest's own tile-facade shells are left out (they had no windows); in their place one mesh per atlas,
#     /World/City/bxw_fac<k>, with primvars st (the atlas uv), fst (facade metres: along the wall, height above the
#     building's base), and per face (uniform) fa1 = (floorH, winW, storeH), fa2 = (style, bldgH, litAmt),
#     fa3 = (cvar, flags, wallLen), fa4 = (wallSeed, doorPack, atlas uv per metre; negative on roof charts), fcol (the
#     facade's base colour, the shader's diffuseColor before the facade code);
#   - textures/bxw_a<k>_{alb,dat,emi}.png: the passes dilated past the charts' edges (no black seams under filtering),
#     RGB: alb sRGB albedo; dat R roughness, G window glass (generic grid, AC units out), B room lit; emi sqrt(emission / 8);
#   - /World/Looks/bxw_fac<k>: a UsdPreviewSurface over the three (any renderer); blender_windows.py rebuilds it in Cycles
#     with the windows drawn per pixel (the web's own grid formulas), parallax reveals and rooms;
#   - bxwin_usd.json: the atlases and every authored material's window role (kit glass with its shader constants, kit rooms
#     lit after dark, self-lit shops) by prim name, for blender_windows.py.
# Hooked into usd_write.py by marked lines (# BX-WIN) and as BX-SEQ's hook module (setup / variants / static / finish).
import json, math, os
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt

STATE = {'on': False}


def _png(path):
    from PIL import Image
    im = Image.open(path)
    a = np.asarray(im.convert('RGBA'))
    return a


def _dilate(rgb, cov, iters=6):
    """fill uncovered texels from covered 4-neighbours (repeated): the charts' borders hold their own values."""
    rgb = rgb.astype(np.float32)
    cov = cov.copy()
    for _ in range(iters):
        acc = np.zeros_like(rgb); n = np.zeros(cov.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            c = np.roll(cov, (dy, dx), axis=(0, 1)); v = np.roll(rgb, (dy, dx), axis=(0, 1))
            acc += v * c[..., None]; n += c
        fill = (~cov) & (n > 0)
        if not fill.any(): break
        rgb[fill] = acc[fill] / n[fill][:, None]
        cov = cov | fill
    return np.clip(rgb + 0.5, 0, 255).astype(np.uint8)


def setup(ctx):
    IN = ctx.IN
    p = os.path.join(IN, 'bxwin.json')
    STATE['on'] = os.path.exists(p) and '--nobxwin' not in (getattr(ctx, 'argv', None) or [])
    if not STATE['on']:
        return
    J = json.load(open(p))
    if J.get('version') == 2:
        STATE['bakes'] = {}
        for shot, f in (J.get('shots') or {}).items():
            fp = os.path.join(IN, f)
            if os.path.exists(fp): STATE['bakes'][shot] = json.load(open(fp))
    else:
        STATE['bakes'] = {None: J}
    STATE['bx'] = next(iter(STATE['bakes'].values()), {})
    STATE['on'] = bool(STATE['bakes'])
    STATE['facade_mids'] = {mid for mid, d in ctx.MATS.items() if (d.get('ud') or {}).get('isFacade')}
    STATE['ctx'] = ctx
    # the harvest's tile-facade shells out of the static world (the baked meshes replace them)
    if getattr(ctx, 'S', None) and isinstance(ctx.S.get('objects'), list):
        ctx.S['objects'][:] = filter_objects(ctx.S['objects'], ctx.MATS)


def filter_objects(objects, MATS):
    """the harvest's tile-facade shells out (replaced by the baked meshes); objects with other slots keep them."""
    if not STATE['on']:
        return objects
    fm = STATE['facade_mids']
    out, n = [], 0
    for o in objects:
        ms = [m for m in o['mats'] if m >= 0]
        if ms and all(m in fm for m in ms):
            n += 1; continue
        out.append(o)
    STATE['dropped_shells'] = n
    return out


def _hidden(ctx):
    p = '/World/Looks/bxw_hidden'
    if not STATE.get('hidden'):
        looks = ctx.stage_looks
        mat = UsdShade.Material.Define(looks, p)
        sh = UsdShade.Shader.Define(looks, p + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
        sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).Set(0.0); sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
        STATE['hidden'] = p
    return STATE['hidden']


def variants(ctx, G, mats):
    """the kit's storefront interiors (fk:lv:*, lv_variants); a mesh whose every slot is a tile facade and that still
    reaches the writer (a static layer the setup did not filter): hidden, the baked mesh replaces it."""
    lv = lv_variants(ctx, G, mats)
    if lv is not None:
        return lv
    if not STATE['on']:
        return None
    ms = [m for m in mats if m >= 0]
    if not ms or not all(m in STATE['facade_mids'] for m in ms):
        return None
    STATE['hidden_late'] = STATE.get('hidden_late', 0) + 1
    return [(_hidden(ctx), np.arange(G['ntri']))]


# ---------------------------------------------------------------- the kit's storefront interiors (fk:lv:*)
# fk/kitMats.js levelBase (FKATLAS, the default): the shop rooms, goods, shop walls and posters are one material each, the
# light level per vertex in aFkTr.x (emission = albedo x level x mix(dayK, nightK, night)) and the shop wall's atlas tile
# in aFkTr.yz (the atlas: 4 columns x SHOP_ROWS 8 rows, each wall's uv folded into its tile). The writer's default read
# aFkTr as a colour tint (the interiors came out dark red, without their light: BX-LIGHT's dusk shop fronts).
LV = {'fk:lv:shop': (0.13, 1.3, False), 'fk:lv:goods': (0.22, 1.1, False), 'fk:lv:shopwall': (0.16, 1.25, True), 'fk:lv:poster': (0.2, 0.9, False)}
LV_SC = (0.25, 1.0 / 8.0)


def _lv_material(ctx, mid, d, lvl, vc):
    key = (mid, int(round(lvl * 16)), tuple(int(round(float(x) * 48)) for x in vc))
    cache = STATE.setdefault('lvmats', {})
    if key in cache:
        return cache[key]
    looks = ctx.stage_looks
    path = f"/World/Looks/bxl{mid}_{key[1]}_{'_'.join(str(abs(x)) for x in key[2])}"
    dayK, nightK, atlas = LV[d.get('name')]
    U = d.get('uni') or {}
    N = float(U['fkN']) if isinstance(U.get('fkN'), (int, float)) else 0.0
    k = lvl * (dayK + (nightK - dayK) * N)
    col = d.get('color') or [1, 1, 1]
    base = [float(col[i]) * float(vc[i]) for i in range(3)]
    mat = UsdShade.Material.Define(looks, path)
    sh = UsdShade.Shader.Define(looks, path + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
    mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(float(d.get('roughness', 0.8)))
    sh.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(0.0)
    tid = (d.get('maps') or {}).get('map')
    f = ctx.tex_file(tid) if tid is not None else None
    if f:
        rd = UsdShade.Shader.Define(looks, path + '/st'); rd.CreateIdAttr('UsdPrimvarReader_float2')
        rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
        def tex(name, scale):
            tx = UsdShade.Shader.Define(looks, path + '/' + name); tx.CreateIdAttr('UsdUVTexture')
            tx.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(f)
            tx.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(rd.ConnectableAPI(), 'result')
            tx.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set('clamp'); tx.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set('clamp')
            tx.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('sRGB')
            tx.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(scale[0], scale[1], scale[2], 1.0))
            return tx
        ta = tex('alb', base)
        sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(ta.ConnectableAPI(), 'rgb')
        if k > 1e-4:
            te = tex('emi', [b * k for b in base])
            sh.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(te.ConnectableAPI(), 'rgb')
    else:
        sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*base))
        if k > 1e-4:
            sh.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*[b * k for b in base]))
    mat.GetPrim().SetCustomDataByKey('bxwin', {'role': 'lvlit', 'level': lvl, 'k': k})
    STATE.setdefault('lvroles', {})[path.split('/')[-1]] = {'role': 'lvlit', 'level': lvl, 'k': round(k, 4), 'name': d.get('name')}
    cache[key] = path
    return path


def _lv_slots(ctx, mats):
    names = [(ctx.MATS.get(m) or {}).get('name', '') for m in mats if m >= 0]
    return bool(names) and all(n in LV for n in names)


def lv_variants(ctx, G, mats):
    if not _lv_slots(ctx, mats) or 'aFkTr' not in G:
        return None
    nt = G['ntri']
    mi = np.zeros(nt, dtype=np.int32)
    if G['groups'] and len(mats) > 1:
        mi[:] = -1
        for q in G['groups']:
            a, b = max(0, q['start'] // 3), min(nt, (q['start'] + q['count']) // 3)
            if b > a: mi[a:b] = q['mi']
    out = []
    I0 = G['index'][np.arange(nt) * 3]
    tr = G['aFkTr'][I0]
    vc = G['color'][I0][:, :3] if 'color' in G else np.ones((nt, 3), np.float32)
    for slot in sorted(set(mi.tolist())):
        if slot < 0 or slot >= len(mats) or mats[slot] < 0: continue
        mid = mats[slot]; d = ctx.MATS[mid]
        faces = np.nonzero(mi == slot)[0]
        vcf = vc[faces] if d.get('vertexColors') else np.ones((len(faces), 3), np.float32)
        q = np.concatenate([np.round(tr[faces, :1] * 16), np.round(vcf * 48)], axis=1).astype(np.int64)
        keys, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
        for j in range(len(keys)):
            sel = faces[inv == j]
            out.append((_lv_material(ctx, mid, d, keys[j][0] / 16.0, keys[j][1:] / 48.0), sel))
    STATE['lv_meshes'] = STATE.get('lv_meshes', 0) + 1
    return out


def mesh(ctx, stage, prim, gid, mats, G):
    """the kit glass's per-pane parameters (its vertex colour: R mirror, G dirt, B opacity; fk/kitMats.js winGlass) as the
    primvar bxGlass; the shop walls' atlas uv per corner (each wall's uv into its tile: u stretched into the tile where the
    wall is wider than one picture; the web repeats it)."""
    if 'color' in G and any(((ctx.MATS.get(m) or {}).get('ud') or {}).get('fkGlass') for m in mats if m >= 0):
        c = np.ascontiguousarray(G['color'][:, :3].astype(np.float32))
        if len(c) == len(G['position']):
            UsdGeom.PrimvarsAPI(UsdGeom.Mesh(prim)).CreatePrimvar('bxGlass', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec3fArray.FromNumpy(c))
            STATE['glass_panes'] = STATE.get('glass_panes', 0) + 1
    if not STATE.get('lv_on', True) or 'aFkTr' not in G or 'uv' not in G:
        return
    names = [(ctx.MATS.get(m) or {}).get('name', '') for m in mats if m >= 0]
    if names != ['fk:lv:shopwall']:
        return
    I = G['index'].reshape(-1, 3)
    uv = G['uv'][I]                      # ntri x 3 x 2
    tr = G['aFkTr'][I[:, 0]]             # the face's tile
    umax = np.maximum(uv[:, :, 0].max(axis=1, keepdims=True), 1.0)
    f = np.clip(np.stack([uv[:, :, 0] / umax, uv[:, :, 1]], axis=2), 0.004, 0.996)
    st = np.empty_like(f)
    st[:, :, 0] = tr[:, None, 1] + f[:, :, 0] * LV_SC[0]
    st[:, :, 1] = tr[:, None, 2] + f[:, :, 1] * LV_SC[1]
    pv = UsdGeom.PrimvarsAPI(UsdGeom.Mesh(prim)).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.faceVarying)
    pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(st.reshape(-1, 2).astype(np.float32))))
    STATE['lv_walls'] = STATE.get('lv_walls', 0) + 1


def _mesh(stage, looks, IN, OUT, at, stats, tag='bxw'):
    k = at['k']
    g = at['geo']
    raw = open(os.path.join(IN, g['file']), 'rb').read()
    L = {x['name']: x for x in g['layout']}
    def arr(n, w):
        x = L[n]
        return np.frombuffer(raw, dtype=np.float32, count=x['count'], offset=x['offset']).reshape(-1, w)
    nt = g['tris']
    pos = arr('pos', 3); nrm = arr('nrm', 3); col = arr('col', 3); fuv = arr('fuv', 2); bk = arr('bk', 2); tri = arr('tri', 13)
    good = np.isfinite(pos).all(1).reshape(-1, 3).all(1) & np.isfinite(tri).all(1)
    if not good.all():
        sel = np.repeat(good, 3)
        pos, nrm, col, fuv, bk = pos[sel], nrm[sel], col[sel], fuv[sel], bk[sel]; tri = tri[good]; nt = int(good.sum())
    path = f'/World/City/{tag}_fac{k}'
    m = UsdGeom.Mesh.Define(stage, path)
    m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(pos.astype(np.float32))))
    m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(nt, 3, dtype=np.int32)))
    m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(np.arange(nt * 3, dtype=np.int32)))
    m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    nn = nrm / (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12)
    if (np.linalg.norm(nrm, axis=1) > 0.5).mean() > 0.99:
        m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(nn.astype(np.float32))))
        m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
    pv = UsdGeom.PrimvarsAPI(m)
    pv.CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(bk.astype(np.float32))))
    pv.CreatePrimvar('fst', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(fuv.astype(np.float32))))
    F3 = Sdf.ValueTypeNames.Float3Array
    def uni(name, a):
        pv.CreatePrimvar(name, F3, UsdGeom.Tokens.uniform).Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(a.astype(np.float32))))
    uni('fa1', tri[:, [0, 1, 2]])                  # floorH, winW, storeH
    uni('fa2', tri[:, [3, 4, 5]])                  # style, bldgH, litAmt
    uni('fa3', tri[:, [6, 7, 8]])                  # cvar, flags, wallLen
    uni('fa4', tri[:, [9, 10, 12]])                # wallSeed, doorPack (aux3.z), atlas uv per metre (< 0: roof chart)
    uni('fcol', col.reshape(-1, 3, 3)[:, 2, :])    # the provoking corner's base colour
    lo, hi = pos.min(0), pos.max(0)
    m.CreateExtentAttr([Gf.Vec3f(*map(float, lo)), Gf.Vec3f(*map(float, hi))])
    # the material: any renderer's view of the bake
    mp = f'/World/Looks/{tag}_fac{k}'
    mat = UsdShade.Material.Define(looks, mp)
    sh = UsdShade.Shader.Define(looks, mp + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
    mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    rd = UsdShade.Shader.Define(looks, mp + '/st'); rd.CreateIdAttr('UsdPrimvarReader_float2')
    rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
    def tex(name, f, cs):
        tx = UsdShade.Shader.Define(looks, mp + '/' + name); tx.CreateIdAttr('UsdUVTexture')
        tx.CreateInput('file', Sdf.ValueTypeNames.Asset).Set('./textures/' + f)
        tx.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(rd.ConnectableAPI(), 'result')
        tx.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set('clamp'); tx.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set('clamp')
        tx.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set(cs)
        return tx
    tn = {ps: os.path.basename(at['files'][ps]) for ps in ('alb', 'dat', 'emi')}
    ta = tex('alb', tn['alb'], 'sRGB'); td = tex('dat', tn['dat'], 'raw'); te = tex('emi', tn['emi'], 'raw')
    sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(ta.ConnectableAPI(), 'rgb')
    sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).ConnectToSource(td.ConnectableAPI(), 'r')
    sh.CreateInput('emissiveColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(te.ConnectableAPI(), 'rgb')
    sh.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(0.0)
    mat.GetPrim().SetCustomDataByKey('bxwin', {'role': 'facade', 'atlas': k})
    api = UsdShade.MaterialBindingAPI.Apply(m.GetPrim())
    api.GetPrim().CreateRelationship('material:binding', False).SetTargets([Sdf.Path(mp)])
    stats['tris'] += nt
    return {'k': k, 'tag': tag, 'mesh': path, 'material': f'{tag}_fac{k}', 'tris': nt, 'densMean': at.get('densMean'),
            'tex': {ps: 'textures/' + tn[ps] for ps in tn}}


def static(ctx, stage):
    """the baked facade meshes of this static layer's shot (static_<shot>.usdc; static.usdc: the legacy bake or the first
    shot's), their dilated textures (written once), and the facade shells that reached this layer deactivated."""
    if not STATE['on']:
        return
    IN, OUT = ctx.IN, ctx.OUT
    layer = os.path.basename(stage.GetRootLayer().identifier)
    shot = layer[len('static_'):-len('.usdc')] if layer.startswith('static_') else None
    bakes = STATE['bakes']
    bx = bakes.get(shot) if shot in bakes else (bakes.get(None) or next(iter(bakes.values()), None))
    # the shells (all slots tile facades) the setup could not drop: hidden by `variants`, deactivated here
    hid = STATE.get('hidden')
    nd = 0
    if hid:
        for p in stage.Traverse():
            r = p.GetRelationship('material:binding')
            if r and hid in [str(t) for t in r.GetTargets()]:
                p.SetActive(False); nd += 1
    if not bx:
        return
    tag = bx.get('tag') or 'bxw'
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)
    from PIL import Image
    stats = {'tris': 0, 'atlases': 0}
    out = []
    done = STATE.setdefault('tex_done_files', set())
    for at in bx['atlases']:
        for ps in ('alb', 'dat', 'emi'):
            src = os.path.join(IN, at['files'][ps])
            dst = os.path.join(OUT, 'textures', os.path.basename(at['files'][ps]))
            if not os.path.exists(src) or dst in done:
                continue
            a = _png(src)
            Image.fromarray(_dilate(a[:, :, :3], a[:, :, 3] > 127)).save(dst, compress_level=3)
            done.add(dst)
        out.append(_mesh(stage, ctx.stage_looks, IN, OUT, at, stats, tag))
        stats['atlases'] += 1
    seen = {(a['tag'], a['k']) for a in STATE.get('atlases', [])}
    STATE.setdefault('atlases', []).extend(a for a in out if (a['tag'], a['k']) not in seen)
    b_ = ctx.stats.setdefault('bxwin', {})
    b_.setdefault('layers', {})[layer] = {'shot': shot, 'atlases': stats['atlases'], 'tris': stats['tris'], 'shells_deactivated': nd}
    b_['dropped_shells'] = STATE.get('dropped_shells', 0)


def _roles(MATS, mat_done):
    """every authored material's window role, by prim name (the importer names Blender's materials after the prims)."""
    R = {}
    for key, path in mat_done.items():
        if not isinstance(key, tuple) or not key or not isinstance(key[0], int):
            continue
        d = MATS.get(key[0]) or {}
        ud = d.get('ud') or {}
        U = d.get('uni') or {}
        nm = d.get('name') or ''
        num = lambda v, dflt: float(v) if isinstance(v, (int, float)) else dflt
        role = None
        if ud.get('fkGlass') and 'bxwF0' in ud:
            role = {'role': 'kitglass', 'f0': ud.get('bxwF0'), 'rough': ud.get('bxwRough'), 'dirt': ud.get('bxwDirt'), 'canyon': ud.get('bxwCanyon'),
                    'opacity': d.get('opacity', 0.36), 'color': d.get('color')}
        elif nm.startswith('pbr:glass') and d.get('transparent'):
            # the PBR library's transparent glass (city/mat/pbrLib.js makeGlass: a real pane over real geometry, the kit's
            # storefront upper glazing over its dark rooms): thin glass at its own coating F0, roughness and dirt; in the web
            # the street opposite in its mirror is what reads tan
            role = {'role': 'kitglass', 'f0': num(U.get('pgF0'), 0.08), 'rough': num(U.get('pgRough'), 0.03), 'dirt': num(U.get('pgDirt'), 0.1),
                    'opacity': d.get('opacity', 0.45), 'color': d.get('color'), 'src': 'pbrLib'}
        elif ud.get('fkGlass') or (d.get('transparent') and ('glass' in nm.lower() or nm.startswith('fk:int_win'))):
            role = {'role': 'glass', 'fk': bool(ud.get('fkGlass')), 'opacity': d.get('opacity', 0.36), 'color': d.get('color')}
        elif nm in ('roomFill', 'shopFill') and d.get('type') == 'MeshBasicMaterial':
            # the dresser's room and shop fills behind its glass (world/nycDress.js): unlit in the web, the colour is the
            # radiance (the dresser dims them at night itself)
            role = {'role': 'fill', 'name': nm}
        elif 'fkLv' in U and isinstance(U['fkLv'], dict):
            lv = U['fkLv'].get('vec') or [0, 0]
            role = {'role': 'selflit', 'day': lv[0], 'night': lv[1], 'N': num(U.get('fkN'), 0.0), 'name': nm}
        elif 'fkN' in U and d.get('emissive') and max(d['emissive']) > 0:
            role = {'role': 'nightemit', 'emissive': d['emissive'], 'ei': d.get('emissiveIntensity', 1.0), 'N': num(U.get('fkN'), 0.0), 'name': nm}
        if role:
            R[path.split('/')[-1]] = role
    return R


def material(ctx, mid, d, path, sh, info):
    """BX-SEQ's hook form: remember every authored material (the roles are written at finish)."""
    STATE.setdefault('matpaths', {})[(mid, len(STATE.get('matpaths', {})))] = path


def finish(ctx, mat_done=None):
    if mat_done is None:
        mat_done = getattr(ctx, 'mat_done', None) or {k: v for k, v in (STATE.get('matpaths') or {}).items()}
    if not mat_done:
        return
    roles = _roles(ctx.MATS, mat_done)
    night = None
    for d in ctx.MATS.values():
        U = d.get('uni') or {}
        if isinstance(U.get('night'), (int, float)):
            night = float(U['night']); break
    roles.update(STATE.get('lvroles', {}))
    ctx.stats.setdefault('bxwin', {}).update({'lv_meshes': STATE.get('lv_meshes', 0), 'lv_walls': STATE.get('lv_walls', 0), 'lv_mats': len(STATE.get('lvroles', {}))})
    out = {'atlases': STATE.get('atlases', []), 'roles': roles, 'night': night, 'bake': {k: STATE['bx'].get(k) for k in ('size', 'dens', 'ring', 'densityScale', 'charts', 'patch')} if STATE['on'] else None}
    json.dump(out, open(os.path.join(ctx.OUT, 'bxwin_usd.json'), 'w'), indent=1)
    ctx.stats.setdefault('bxwin', {})['roles'] = len(roles)
