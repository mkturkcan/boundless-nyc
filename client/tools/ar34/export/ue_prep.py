# UE (AR34, 2026-10-06): the one place for UE-specific USD changes. Runs with the exporter's Python (usd-core) on a take's
# USD (usd_write.py's <shot>.usda) and writes, into --out:
#   <shot>_ue.usda     the root UE imports: the take root as a sublayer under ue_over_<shot>.usdc (same time codes, fps,
#                      up axis and units; the take root's customLayerData copied)
#   ue_over_<shot>.usdc the overrides:
#     - the per-vertex data the web shaders read (usd_mat.py's float3 / color4f / float primvars, which UE's importer drops)
#       repacked into texCoord2f UV sets st1-st3 (UE imports at most four UV sets, sorted by name: st, st1, st2, st3):
#         kit meshes (aFkTr [aWeather] [aGrime])  st1 = aFkTr.xy, st2 = (aFkTr.z, aGrime), st3 = (aWeather.w dirt, aWeather.z topY)
#         vertex colours (bxCol)                  st1 = bxCol.rg, st2 = (bxCol.b, 0)
#         viaduct rivet rows (aRv, aJ)            st1 = aRv.xy, st2 = aRv.zw, st3 = aJ.xy
#         ground (matId, gpK)                     st1 = (matId, kerb frame valid), st2 = (kQ, kDn) m, st3 = (kW m, kA rad)
#       a repacked mesh without `st` gets a zero `st`, so UV 0 stays `st` everywhere;
#     - the moving sets (usd_write.py's time-sampled PointInstancers under /World/Moving, which UE imports at one time code):
#       each instancer is deactivated and each of its instances becomes an Xform /World/Moving/ue_<instancer>/i<k> with an
#       internal reference to the instance's prototype and a time-sampled transform and visibility (outside its life the
#       instance is on the empty prototype: invisible). A still instance (parked) gets one transform, a never-visible one
#       none. UE's importer turns these into actors with transform and visibility tracks in its Level Sequence.
#   ue_<shot>.json     what the UE side reads besides the stage: the take root's data (shot, frames, fps, time of day, sun,
#                      exposure, origin, camera, harvest dir), every `bx`-tagged material (name -> its tag, texture files
#                      made absolute), the moving instances (prim path, id, kind, paint, lamp mask per frame, visible frames,
#                      the prototype's lamp anchors).
#
#   uv run --no-project --with usd-core --with numpy python ue_prep.py --usd <usd dir>/<shot>.usda --out <dir>
import argparse, hashlib, json, math, os, sys, time
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, Sdf, Vt, Gf

KIT = ('aFkTr', 'aWeather', 'aGrime')
ap = argparse.ArgumentParser()
ap.add_argument('--usd', required=True, help="the take root (usd_write.py's <shot>.usda)")
ap.add_argument('--out', required=True, help='the folder for <shot>_ue.usda, ue_over_<shot>.usdc and ue_<shot>.json')
ap.add_argument('--root', default=None, help='a different root to sublayer (e.g. <shot>_peds.usda for the walkers)')
ap.add_argument('--nomoving', action='store_true', help='leave the moving PointInstancers as they are')
a = ap.parse_args()

t0 = time.time()
usd = os.path.abspath(a.usd)
src_root = os.path.abspath(a.root) if a.root else usd
udir = os.path.dirname(usd)
out = os.path.abspath(a.out)
os.makedirs(out, exist_ok=True)
rl = Sdf.Layer.FindOrOpen(src_root)
data = dict(rl.customLayerData)
shot = data.get('shot') or os.path.splitext(os.path.basename(usd))[0]
over_path = os.path.join(out, f'ue_over_{shot}.usdc')
root_path = os.path.join(out, f'{shot}_ue.usda')
for p in (over_path, root_path):
    if os.path.exists(p): os.remove(p)

over = Sdf.Layer.CreateNew(over_path)
root = Sdf.Layer.CreateNew(root_path)
root.subLayerPaths.append(over_path)
root.subLayerPaths.append(src_root)
for k in ('startTimeCode', 'endTimeCode', 'timeCodesPerSecond', 'framesPerSecond'):
    setattr(root, k, getattr(rl, k))
root.defaultPrim = rl.defaultPrim or 'World'
cld = dict(data); cld['ue_prep'] = time.strftime('%Y-%m-%d %H:%M:%S')
root.customLayerData = cld
root.pseudoRoot.SetInfo('upAxis', rl.pseudoRoot.GetInfo('upAxis') if rl.pseudoRoot.HasInfo('upAxis') else 'Y')
root.pseudoRoot.SetInfo('metersPerUnit', rl.pseudoRoot.GetInfo('metersPerUnit') if rl.pseudoRoot.HasInfo('metersPerUnit') else 1.0)
root.Save(); over.Save()

st = Usd.Stage.Open(root_path)
st.SetEditTarget(Usd.EditTarget(over))
f_lo, f_hi = int(st.GetStartTimeCode()), int(st.GetEndTimeCode())
frames = list(range(f_lo, f_hi + 1))
stats = {'meshes_repacked': {}, 'no_st': 0, 'instance_proxies': 0}


def flat(pv):
    v = pv.ComputeFlattened()
    return None if v is None else np.asarray(v, dtype=np.float32).reshape(len(v), -1)


def put(api, name, arr, interp):
    """a texCoord2f UV set; the data sets' second component pre-flipped (UE's importer turns every UV's v into 1 - v)."""
    a_ = arr.astype(np.float32).copy()
    if name != 'st': a_[:, 1] = 1.0 - a_[:, 1]
    pv = api.CreatePrimvar(name, Sdf.ValueTypeNames.TexCoord2fArray, interp)
    pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(a_)))


# R6-FAR (UE track, 2026-10-08): the far ring's macro city (/World/Far: the streamer's macro tiles and their tower crowns)
# is drawn by the web with its far material, a MeshBasicMaterial whose vertex shader takes the tile's int16 positions x 1/8
# (uScale), x 0.996 across and 0.6 m down, and whose fragment squares the colour's sRGB bytes. The harvest wrote the raw
# positions about each tile's origin: boxes 8 times too tall, spread 8 times too wide, pastel in UE. Each piece goes back to
# the web's scale (its tile's origin: a crowns piece names its tile, a building piece is matched against the web's macro
# bake), its colour squared, and its faces over a ready near tile dropped (the web discards them there, NM24; the writer's
# mask ran on the unscaled positions). A piece that fails keeps its prim as it was (stats far_fix).
def far_fix():
    import re, urllib.parse
    fx = {'pieces': 0, 'fixed': 0, 'faces_dropped': 0, 'unmatched': [], 'errors': []}
    farp_ = st.GetPrimAtPath('/World/Far')
    if not farp_ or not farp_.IsValid(): return fx
    H = data.get('harvest') or ''
    try: S_ = json.load(open(os.path.join(H, f'static_{shot}.json')))
    except Exception: S_ = {}
    NT = S_.get('nearTiles') or {}
    TS = float(NT.get('tile', 512)); near = {(int(a_), int(b_)) for a_, b_ in (NT.get('tiles') or [])}
    try: hm = json.load(open(os.path.join(H, 'manifest.json')))
    except Exception: hm = {}
    q_ = urllib.parse.parse_qs(urllib.parse.urlparse(hm.get('url') or '').query)
    tdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'public', (q_.get('tiles') or ['tiles'])[0]))
    try: TM = json.load(open(os.path.join(tdir, 'manifest.json')))
    except Exception: TM = {}
    macros, MS = TM.get('macros') or {}, float(TM.get('macro') or 2048)
    fx['tiles_dir'] = os.path.basename(tdir); fx['near_tiles'] = len(near)
    bins = {}

    def tile(key):
        if key not in bins:
            b = open(os.path.join(tdir, macros[key]['f']), 'rb').read()
            hl = int.from_bytes(b[4:8], 'little'); hd = json.loads(b[8:8 + hl]); base = 8 + hl + ((4 - ((8 + hl) % 4)) % 4)
            enc = None
            for s_ in hd['sections']:
                if s_['name'] == 'pos':
                    pi_ = np.frombuffer(b, np.int16, s_['length'], base + s_['offset']).reshape(-1, 3).astype(np.int64) + 32768
                    enc = np.unique((pi_[:, 0] << 32) | (pi_[:, 1] << 16) | pi_[:, 2])
            bins[key] = (np.array([float(hd['origin'][0]), 0.0, float(hd['origin'][1])]), float(hd.get('scale', 0.125)), enc)
        return bins[key]

    def by_bake(P):
        Pi = np.round(P).astype(np.int64)
        ok = np.all(np.abs(P - Pi) < 1e-3, axis=1)
        if not ok.any(): return None
        Pi = Pi[ok]
        if len(Pi) > 4000: Pi = Pi[np.linspace(0, len(Pi) - 1, 4000).astype(np.int64)]
        sc = []
        for k_ in macros:
            try: mx, mz = [int(x) for x in k_.split('_')]
            except Exception: continue
            ox, oz = mx * MS, mz * MS
            if P[:, 0].min() - ox < -800 or P[:, 0].max() - ox > MS * 8 + 800 or P[:, 2].min() - oz < -800 or P[:, 2].max() - oz > MS * 8 + 800: continue
            O_, sc_, enc = tile(k_)
            if enc is None: continue
            r_ = Pi - np.round(O_).astype(np.int64) + 32768
            if (r_ < 0).any() or (r_ > 65535).any(): continue
            sc.append((float(np.isin((r_[:, 0] << 32) | (r_[:, 1] << 16) | r_[:, 2], enc).mean()), k_))
        # (the writer's mask split the long triangles, so few corners are the bake's own: the tile whose bake holds clearly
        # more of them than any other)
        sc.sort(reverse=True)
        if not sc or sc[0][0] <= 0.001 or (len(sc) > 1 and sc[1][0] * 3.0 > sc[0][0]): return None
        return sc[0][1]

    def rebuild(pieces):
        try: cams = json.load(open(os.path.join(H, f'cam_{shot}.json')))
        except Exception: return None
        L = np.array([[c_['m'][12], c_['m'][14]] for c_ in cams if c_ and c_.get('m')], np.float64)
        if not len(L) or not macros or not pieces: return None
        L = L[np.linspace(0, len(L) - 1, min(len(L), 24)).astype(np.int64)]
        R = float(hm.get('ring') or 4000.0)
        b0 = next((p_ for p_ in pieces if 'macroCrowns_' not in p_.GetName()), pieces[0])
        mat = UsdShade.MaterialBindingAPI(b0).ComputeBoundMaterial()[0]
        ds = UsdGeom.Mesh(b0).GetDoubleSidedAttr().Get()
        made, nf = 0, 0
        for k_ in sorted(macros):
            try: mx, mz = [int(x) for x in k_.split('_')]
            except Exception: continue
            ox, oz = mx * MS, mz * MS
            dx = np.maximum(np.maximum(ox - L[:, 0], L[:, 0] - (ox + MS)), 0.0); dz = np.maximum(np.maximum(oz - L[:, 1], L[:, 1] - (oz + MS)), 0.0)
            if np.hypot(dx, dz).min() > R: continue
            b = open(os.path.join(tdir, macros[k_]['f']), 'rb').read()
            hl = int.from_bytes(b[4:8], 'little'); hd = json.loads(b[8:8 + hl]); base = 8 + hl + ((4 - ((8 + hl) % 4)) % 4)
            sec = {s_['name']: s_ for s_ in hd['sections']}
            if 'pos' not in sec or 'col' not in sec: continue
            pos = np.frombuffer(b, np.int16, sec['pos']['length'], base + sec['pos']['offset']).reshape(-1, 3).astype(np.float64)
            col = np.frombuffer(b, np.uint8, sec['col']['length'], base + sec['col']['offset']).reshape(-1, 4)
            nt = len(pos) // 3
            if not nt: continue
            O_ = np.array([float(hd['origin'][0]), 0.0, float(hd['origin'][1])])
            Q = O_ + pos[:nt * 3] * float(hd.get('scale', 0.125)) * np.array([0.996, 1.0, 0.996]) + np.array([0.0, -0.6, 0.0])
            cen = Q.reshape(nt, 3, 3).mean(1)
            keep = np.ones(nt, bool)
            if near:
                tx = np.floor(cen[:, 0] / TS).astype(np.int64); tz = np.floor(cen[:, 2] / TS).astype(np.int64)
                keep &= ~np.fromiter(((a_, b_) in near for a_, b_ in zip(tx.tolist(), tz.tolist())), bool, nt)
            dmin = np.full(nt, np.inf)
            for lx, lz in L: dmin = np.minimum(dmin, np.hypot(cen[:, 0] - lx, cen[:, 2] - lz))
            keep &= dmin <= R
            if not keep.any(): continue
            Qk = Q.reshape(nt, 3, 3)[keep].reshape(-1, 3)
            Ck = (col[:nt * 3, :3].astype(np.float32) / 255.0).reshape(nt, 3, 3)[keep].reshape(-1, 3) ** 2
            m_ = UsdGeom.Mesh.Define(st, f'/World/Far/r6_far_{k_.replace("-", "m")}')
            m_.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(Qk.astype(np.float32))))
            m_.GetFaceVertexCountsAttr().Set(Vt.IntArray.FromNumpy(np.full(len(Qk) // 3, 3, np.int32)))
            m_.GetFaceVertexIndicesAttr().Set(Vt.IntArray.FromNumpy(np.arange(len(Qk), dtype=np.int32)))
            m_.GetExtentAttr().Set(Vt.Vec3fArray.FromNumpy(np.stack([Qk.min(0), Qk.max(0)]).astype(np.float32)))
            m_.GetSubdivisionSchemeAttr().Set(UsdGeom.Tokens.none)
            if ds is not None: m_.GetDoubleSidedAttr().Set(ds)
            UsdGeom.PrimvarsAPI(m_.GetPrim()).CreatePrimvar('bxCol', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(Ck.astype(np.float32))))
            if mat: UsdShade.MaterialBindingAPI.Apply(m_.GetPrim()).Bind(mat)
            made += 1; nf += int(keep.sum())
        return {'tiles': made, 'faces': nf} if made else None

    pieces = [p_ for p_ in Usd.PrimRange(farp_) if p_.IsA(UsdGeom.Mesh) and UsdGeom.PrimvarsAPI(p_).HasPrimvar('bxCol')]
    # the harvest kept of each tile only what its unscaled positions put inside the ring, so the building pieces are rebuilt
    # from the bake itself: every tile within the ring (the harvest's --ring) of the lens path, its faces off the ready near
    # tiles and inside the ring, in a prim per tile with the pieces' material; the crowns pieces are rescaled as they are
    try: regen = rebuild(pieces) if os.environ.get('BXUE_FAR') != 'pieces' else None
    except Exception as e:   # (nothing half-made stays: the per-piece rescale below instead)
        fx['errors'].append(f'rebuild: {e}'[:200]); regen = None
        for c_ in list(farp_.GetChildren()):
            if c_.GetName().startswith('r6_far_'): st.RemovePrim(c_.GetPath())
    if regen:
        fx['rebuilt'] = regen
        for p_ in pieces:
            if 'macroCrowns_' not in p_.GetName(): p_.SetActive(False)
        pieces = [p_ for p_ in pieces if 'macroCrowns_' in p_.GetName()]
    for i_, p_ in enumerate(pieces):
        fx['pieces'] += 1
        try:
            m_ = UsdGeom.Mesh(p_)
            P = np.asarray(m_.GetPointsAttr().Get(), np.float64)
            if not len(P): continue
            mk = re.search(r'macroCrowns_(.+)$', p_.GetName())
            key = re.sub(r'(^|_)_', r'\1-', mk.group(1)) if mk else None
            if key not in macros:
                key = by_bake(P)
                # (a building piece is followed by its tile's crowns piece, if the tile has towers)
                if key is None and i_ + 1 < len(pieces):
                    mn = re.search(r'macroCrowns_(.+)$', pieces[i_ + 1].GetName())
                    key = re.sub(r'(^|_)_', r'\1-', mn.group(1)) if mn else None
                    key = key if key in macros else None
            if key is None:   # (left unscaled it would tower over the city: hidden)
                fx['unmatched'].append(p_.GetName()); p_.SetActive(False); continue
            O_, sc_, _ = tile(key)
            Q = O_ + (P - O_) * sc_ * np.array([0.996, 1.0, 0.996]) + np.array([0.0, -0.6, 0.0])
            m_.GetPointsAttr().Set(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(Q.astype(np.float32))))
            m_.GetExtentAttr().Set(Vt.Vec3fArray.FromNumpy(np.stack([Q.min(0), Q.max(0)]).astype(np.float32)))
            pv_ = UsdGeom.PrimvarsAPI(p_).GetPrimvar('bxCol')
            c_ = np.array(pv_.Get(), np.float32)
            if c_.ndim == 2 and len(c_):
                c_[:, :3] = c_[:, :3] ** 2
                pv_.Set(type(pv_.Get()).FromNumpy(np.ascontiguousarray(c_)))
            if near:
                cnt = np.asarray(m_.GetFaceVertexCountsAttr().Get(), np.int64)
                idx = np.asarray(m_.GetFaceVertexIndicesAttr().Get(), np.int64)
                st_ = np.r_[0, np.cumsum(cnt)[:-1]]
                cx = np.add.reduceat(Q[idx, 0], st_) / cnt; cz = np.add.reduceat(Q[idx, 2], st_) / cnt
                tx = np.floor(cx / TS).astype(np.int64); tz = np.floor(cz / TS).astype(np.int64)
                drop = np.fromiter(((a_, b_) in near for a_, b_ in zip(tx.tolist(), tz.tolist())), bool, len(cnt))
                if drop.any():
                    keep = ~drop; fv = np.repeat(keep, cnt)
                    m_.GetFaceVertexCountsAttr().Set(Vt.IntArray.FromNumpy(np.ascontiguousarray(cnt[keep].astype(np.int32))))
                    m_.GetFaceVertexIndicesAttr().Set(Vt.IntArray.FromNumpy(np.ascontiguousarray(idx[fv].astype(np.int32))))
                    fx['faces_dropped'] += int(drop.sum())
            fx['fixed'] += 1; fx.setdefault('keys', {})[p_.GetName()] = key
        except Exception as e:
            fx['errors'].append(f'{p_.GetName()}: {e}'[:160])
    return fx


try: stats['far_fix'] = far_fix()
except Exception as e: stats['far_fix'] = {'error': str(e)[:200]}
# R6-FAR end


# ---- the per-vertex data as UV sets
tags = {}
previews = {}


def preview_tag(mat):
    """an untagged material's UsdPreviewSurface as data: its textures (file, colour space, scale), opacity and threshold,
    roughness, metallic, emissive, so a family table row can rebuild it from the take alone (the tree set's leaves and bark,
    impostors, billboards)."""
    sh = UsdShade.Material(mat).ComputeSurfaceSource()[0]
    if not sh: return None
    out = {'kind': 'preview', 'tex': {}, 'path': str(mat.GetPath())}
    for inp in sh.GetInputs():
        n = inp.GetBaseName()
        if inp.HasConnectedSource():
            src = inp.GetConnectedSource()
            sp_ = UsdShade.Shader(src[0].GetPrim()) if src else None
            if sp_ and sp_.GetIdAttr().Get() == 'UsdUVTexture':
                f_ = sp_.GetInput('file').Get()
                if f_ is not None:
                    fp = f_.resolvedPath or os.path.normpath(os.path.join(udir, f_.path))
                    sc = sp_.GetInput('scale').Get() if sp_.GetInput('scale') else None
                    out['tex'][n] = {'file': fp, 'cs': str(sp_.GetInput('sourceColorSpace').Get() or ''), 'out': str(src[1]),
                                     'scale': [float(v) for v in sc] if sc is not None else None}
                    # the texture's UsdTransform2d (the web's map repeat and offset: the facade kit's cells carry st in
                    # facade metres, a billboard's image is a 12 x 5.6 m window of them) as [sx, sy, rotation deg, tx, ty]
                    st_ = sp_.GetInput('st')
                    xs = st_.GetConnectedSource() if st_ and st_.HasConnectedSource() else None
                    xf_ = UsdShade.Shader(xs[0].GetPrim()) if xs else None
                    if xf_ and xf_.GetIdAttr().Get() == 'UsdTransform2d':
                        g_ = lambda k, d: (xf_.GetInput(k).Get() if xf_.GetInput(k) and xf_.GetInput(k).Get() is not None else d)
                        s2, t2 = g_('scale', (1.0, 1.0)), g_('translation', (0.0, 0.0))
                        out['tex'][n]['xf'] = [float(s2[0]), float(s2[1]), float(g_('rotation', 0.0)), float(t2[0]), float(t2[1])]
        else:
            v = inp.Get()
            if v is not None:
                out[n] = [float(x) for x in v] if hasattr(v, '__len__') and not isinstance(v, str) else (float(v) if isinstance(v, (int, float)) else str(v))
    return out


for p in st.Traverse():
    if p.IsInstanceProxy():
        stats['instance_proxies'] += 1; continue
    if p.IsA(UsdShade.Material):
        cd = p.GetCustomDataByKey('bx')
        if cd:
            try:
                j = json.loads(cd)
            except Exception:
                continue
            for key in ('tex', 'ground_tex'):
                if isinstance(j.get(key), dict):
                    j[key] = {k: os.path.normpath(os.path.join(udir, v)) for k, v in j[key].items()}
            for key in ('gpA', 'gpN'):
                if isinstance(j.get(key), list):
                    j[key] = [os.path.normpath(os.path.join(udir, v)) for v in j[key]]
            j['path'] = str(p.GetPath())
            # UE's importer shares one material between prims whose surface shaders have the same inputs: the look's
            # fingerprint (the tag without its ids, the textures by path) as an input keeps different looks apart
            fp = hashlib.sha1(json.dumps({k: v for k, v in j.items() if k not in ('mid', 'path')}, sort_keys=True).encode()).hexdigest()[:16]
            j['look'] = fp
            pt = preview_tag(p)
            if pt: j['preview'] = {k: v for k, v in pt.items() if k not in ('kind', 'path')}
            sh = UsdShade.Material(p).ComputeSurfaceSource()[0]
            if sh:
                sh.CreateInput('bxLook', Sdf.ValueTypeNames.Token).Set(fp); stats['looks'] = stats.get('looks', 0) + 1
            tags[p.GetName()] = j
        else:
            pt = preview_tag(p)
            if pt: previews[p.GetName()] = pt
        continue
    if not p.IsA(UsdGeom.Mesh):
        continue
    api = UsdGeom.PrimvarsAPI(p)
    have = {q.GetPrimvarName(): q for q in api.GetPrimvars() if q.GetPrimvarName() in KIT + ('bxCol', 'aRv', 'aJ', 'matId', 'gpK') and q.HasValue()}
    if not have:
        continue
    anyq = next(iter(have.values()))
    interp = anyq.GetInterpolation()
    n = len(anyq.ComputeFlattened())
    z = np.zeros((n, 2), np.float32)
    if 'aFkTr' in have:
        fk = flat(have['aFkTr'])
        gr = flat(have['aGrime']) if 'aGrime' in have else np.zeros((n, 1), np.float32)
        we = flat(have['aWeather']) if 'aWeather' in have else None
        put(api, 'st1', fk[:, 0:2], interp)
        put(api, 'st2', np.stack([fk[:, 2], gr[:, 0]], 1), interp)
        if we is not None:
            put(api, 'st3', np.stack([we[:, 3], we[:, 2]], 1), interp)
        kind = 'kit'
    elif 'bxCol' in have:
        c = flat(have['bxCol'])
        put(api, 'st1', c[:, 0:2], interp)
        put(api, 'st2', np.stack([c[:, 2], z[:, 0]], 1), interp)
        kind = 'vc'
    elif 'aRv' in have:
        rv = flat(have['aRv'])
        put(api, 'st1', rv[:, 0:2], interp)
        put(api, 'st2', rv[:, 2:4], interp)
        if 'aJ' in have:
            put(api, 'st3', flat(have['aJ'])[:, 0:2], interp)
        kind = 'vk'
    elif 'matId' in have:
        m = flat(have['matId'])[:, 0]
        k = flat(have['gpK']) if 'gpK' in have else np.zeros((n, 4), np.float32)
        ok = ((k[:, 0] > 100.5) & (k[:, 3] > 0.5)).astype(np.float32)
        kQ = (k[:, 0] - 1.0) * 0.01 - 320.0
        kDn = np.maximum(k[:, 1] - 1.0, 0.0) * 0.01
        kW = np.maximum(k[:, 2] - 1.0, 0.0) * 0.01
        kA = (k[:, 3] - 1.0) / 65534.0 * math.pi - math.pi / 2
        put(api, 'st1', np.stack([m, ok], 1), interp)
        put(api, 'st2', np.stack([kQ * ok, kDn], 1), interp)
        put(api, 'st3', np.stack([kW, kA], 1), interp)
        kind = 'ground'
    else:
        continue
    if not api.HasPrimvar('st'):
        stats['no_st'] += 1
        put(api, 'st', z, interp)
    stats['meshes_repacked'][kind] = stats['meshes_repacked'].get(kind, 0) + 1
t_pv = time.time() - t0

# ---- the time-varying instancers as animated Xforms: UE's importer reads a PointInstancer at the default time code, so the
# moving sets (/World/Moving: vehicles, trains) and every other instancer whose instancing changes over the take (the signal
# lens pools: time-sampled scales and invisibleIds, a lit lens at 1, a dark one at 0.001) become one Xform per instance,
# referencing its prototype, with a transform and a visibility per frame (defaults at the first frame)
moving = []
car_proto = {}   # R5-WHEELS: each car's Xform -> (its instancer, its index there, its prototype)
mstats = {'instancers': 0, 'instances': 0, 'animated': 0, 'still': 0, 'never': 0, 'pools': 0, 'proto_switch': 0}
_geo = {}


def has_geom(path):
    if path not in _geo:
        pr = st.GetPrimAtPath(path)
        _geo[path] = bool(pr) and any(q.IsA(UsdGeom.Gprim) for q in Usd.PrimRange(pr))
    return _geo[path]


def time_varying(pi):
    return any(a_.GetNumTimeSamples() > 1 for a_ in (pi.GetPositionsAttr(), pi.GetOrientationsAttr(), pi.GetScalesAttr(),
                                                   pi.GetProtoIndicesAttr(), pi.GetInvisibleIdsAttr()))


def convert(p, mover):
    pi = UsdGeom.PointInstancer(p)
    targets = pi.GetPrototypesRel().GetTargets()
    if not targets: return
    cd = p.GetCustomData() or {}
    nyc_ids = json.loads(cd.get('nyc:ids') or '[]')
    kind = cd.get('nyc:kind') or ''
    P = [pi.GetPositionsAttr().Get(f) for f in frames]
    if not P or P[0] is None: return
    P = [np.asarray(x, np.float64) for x in P]
    O = [pi.GetOrientationsAttr().Get(f) for f in frames]
    Sa = [pi.GetScalesAttr().Get(f) for f in frames]
    I = [np.asarray(pi.GetProtoIndicesAttr().Get(f)) for f in frames]
    ids = pi.GetIdsAttr().Get(f_lo)
    inv = [set(int(v) for v in (pi.GetInvisibleIdsAttr().Get(f) or [])) for f in frames]
    geo = [has_geom(t_) for t_ in targets]
    gtype = [(lambda q_: q_.GetTypeName() if q_ and q_.IsA(UsdGeom.Gprim) else '')(st.GetPrimAtPath(t_)) for t_ in targets]   # R6-TRAINS (before the instancer goes inactive)
    pv = UsdGeom.PrimvarsAPI(p)
    paint = flat(pv.GetPrimvar('nyc_paint')) if pv.HasPrimvar('nyc_paint') else None
    lamp = [np.asarray(pv.GetPrimvar('nyc:lampMask').Get(f)) for f in frames] if pv.HasPrimvar('nyc:lampMask') else None
    n = len(P[0]) if P[0].ndim == 2 else 0
    xf = UsdGeom.Xformable(p).GetLocalTransformation(Usd.TimeCode(f_lo))
    proto0 = st.GetPrimAtPath(targets[0])
    lamps_cd = (proto0.GetCustomData() or {}).get('nyc:lamps') if proto0 else None   # (a ':' in a key is a key path to GetCustomDataByKey)
    grp = UsdGeom.Xform.Define(st, p.GetPath().GetParentPath().AppendChild('ue_' + p.GetName()))
    if xf != Gf.Matrix4d(1.0):
        grp.AddTransformOp().Set(xf)
    p.SetActive(False)
    mstats['instancers' if mover else 'pools'] += 1
    nF = len(frames)
    for k in range(n):
        idk = int(ids[k]) if ids is not None and len(ids) > k else k
        pk = [int(I[f][k]) if k < len(I[f]) else 0 for f in range(nF)]
        vis = [0 <= pk[f] < len(geo) and geo[pk[f]] and idk not in inv[f] for f in range(nF)]
        if not any(vis):
            mstats['never'] += 1; continue
        used = [pk[f] for f in range(nF) if vis[f]]
        main = max(set(used), key=used.count)
        if len(set(used)) > 1: mstats['proto_switch'] += 1
        mats = []
        for f in range(nF):
            q = O[f][k] if O[f] is not None and k < len(O[f]) else Gf.Quath(1, 0, 0, 0)
            sc = Sa[f][k] if Sa[f] is not None and k < len(Sa[f]) else Gf.Vec3f(1, 1, 1)
            m = Gf.Matrix4d(1.0)
            m.SetScale(Gf.Vec3d(float(sc[0]), float(sc[1]), float(sc[2])))
            r = Gf.Matrix4d(1.0); r.SetRotate(Gf.Quatd(float(q.GetReal()), Gf.Vec3d(*[float(v) for v in q.GetImaginary()])))
            t = Gf.Matrix4d(1.0); t.SetTranslate(Gf.Vec3d(*[float(v) for v in P[f][k]]))
            mats.append(m * r * t)
        # R6-TRAINS (UE track, 2026-10-08): a prototype that is itself a mesh (the trains' cars; a car's is an Xform over its
        # parts) keeps its type, or the instance's Xform type wins over the referenced Mesh and nothing draws
        if gtype[main]:
            x = UsdGeom.Xformable(st.DefinePrim(grp.GetPath().AppendChild(f'i{k}'), gtype[main]))
            mstats['gprim_protos'] = mstats.get('gprim_protos', 0) + 1
        else:
            x = UsdGeom.Xform.Define(st, grp.GetPath().AppendChild(f'i{k}'))
        x.GetPrim().GetReferences().AddInternalReference(targets[main])
        if mover: car_proto[str(x.GetPath())] = (str(p.GetPath()), k, str(targets[main]))   # R5-WHEELS
        op = x.AddTransformOp()
        vf = [i_ for i_, v in enumerate(vis) if v]
        still = all(vis) and all(np.allclose(np.array(mats[f]), np.array(mats[0]), atol=1e-5) for f in range(nF))
        op.Set(mats[vf[0]])                                # the default (the importer's placement)
        if not still:
            for i_, f in enumerate(frames):
                op.Set(mats[i_], Usd.TimeCode(f))
        if not all(vis):
            va = x.CreateVisibilityAttr()
            va.Set(UsdGeom.Tokens.inherited if vis[0] else UsdGeom.Tokens.invisible)
            for i_, f in enumerate(frames):
                if i_ == 0 or vis[i_] != vis[i_ - 1]:
                    va.Set(UsdGeom.Tokens.inherited if vis[i_] else UsdGeom.Tokens.invisible, Usd.TimeCode(f))
        mstats['still' if still else 'animated'] += 1
        mstats['instances'] += 1
        if not mover: continue
        rec = {'path': str(x.GetPath()), 'id': str(nyc_ids[k]) if k < len(nyc_ids) else str(k), 'kind': kind, 'instancer': p.GetName(),
               'vehicle': p.GetName().startswith('veh_'), 'f0': frames[vf[0]], 'f1': frames[vf[-1]], 'still': still,
               'visible': None if all(vis) else [int(v) for v in vis]}
        if paint is not None and k < len(paint): rec['paint'] = [round(float(v), 5) for v in paint[k][:3]]
        if lamp is not None: rec['lamp'] = [int(lamp[f][k]) for f in range(nF)]
        if lamps_cd: rec['lamps'] = lamps_cd if isinstance(lamps_cd, str) else json.dumps(lamps_cd)
        moving.append(rec)


# R5-WHEELS: the fleet's wheels turn and steer (fleet24.js f24Wheel: about +X through the hub by the spin, the front pair
# about +Y by the steer; blender_wheels.py in Cycles). The harvest marks each vertex's wheel (_wheel: 1-4 FL FR RL RR, 5-8
# more axles) in the geometry blobs the prototypes' parts reference (/_geo/g<id> = geo/g<id>.bin): those faces leave the
# part (an override of its face lists, for every car of the kind), each wheel becomes a shared mesh centred on its hub
# (/_ue_wheels, a class: not drawn itself), and each car gets the wheels as children (its hub, then the steer about Y for
# the front pair, then the spin about X), keyed every frame from the instancer's own nyc:spin and nyc:steer
def wheels_split(protos):
    """the wheel faces out of the prototypes' parts and into shared hub-centred meshes (before convert() deactivates the
    instancers that hold the prototypes) -> {prototype path: [(wheel id, hub, class mesh path)]}, stats"""
    out = {'parts': 0, 'wheels': 0}
    H = data.get('harvest') or ''
    try: man = json.load(open(os.path.join(H, 'manifest.json')))
    except Exception as e: return {}, {'error': f'manifest: {e}'}
    gmeta = {int(g['id']): g for g in man.get('geos', []) if any(L['name'] == '_wheel' for L in g['layout'])}
    if not gmeta: return {}, {'note': 'the harvest marks no wheels'}

    def blob(g, name):
        L = next((L for L in g['layout'] if L['name'] == name), None)   # (the manifest's layout: offset, itemSize, f32 / u32)
        if L is None: return None
        n = L['count'] * L['itemSize']
        raw = np.fromfile(os.path.join(H, g['file']), dtype=np.uint8, count=L['offset'] + n * 4)
        a = raw[L['offset']:L['offset'] + n * 4].view(np.uint32 if L.get('type') == 'u32' else np.float32)
        return a.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else a
    cls_root = st.CreateClassPrim('/_ue_wheels')
    split = {}   # prototype path -> [(wheel id, hub, class mesh path)]
    for proto_path in sorted(set(protos)):
        proto = st.GetPrimAtPath(proto_path)
        if not proto: continue
        lst = []
        for part in Usd.PrimRange(proto):
            if not part.IsA(UsdGeom.Mesh): continue
            gid = next((int(sp_.path.name[1:]) for sp_ in part.GetPrimStack() if str(sp_.path).startswith('/_geo/g') and sp_.path.name[1:].isdigit()), None)
            if gid not in gmeta: continue
            W = blob(gmeta[gid], '_wheel')
            m = UsdGeom.Mesh(part)
            pts = np.asarray(m.GetPointsAttr().Get(), np.float64)
            if W is None or len(W) != len(pts): continue
            W = np.rint(W).astype(int)
            if W.max() <= 0: continue
            cnt = np.asarray(m.GetFaceVertexCountsAttr().Get(), np.int64); idx = np.asarray(m.GetFaceVertexIndicesAttr().Get(), np.int64)
            st0 = np.r_[0, np.cumsum(cnt)[:-1]]
            fw = np.array([W[idx[a:a + c]].min() if W[idx[a:a + c]].min() == W[idx[a:a + c]].max() else 0 for a, c in zip(st0, cnt)])
            keep = fw == 0
            m.GetFaceVertexCountsAttr().Set(Vt.IntArray.FromNumpy(cnt[keep].astype(np.int32)))
            m.GetFaceVertexIndicesAttr().Set(Vt.IntArray.FromNumpy(np.concatenate([idx[a:a + c] for a, c, k_ in zip(st0, cnt, keep) if k_]).astype(np.int32)))
            nrm = m.GetNormalsAttr().Get()
            stv = UsdGeom.PrimvarsAPI(part).GetPrimvar('st')
            uv = np.asarray(stv.Get(), np.float32) if stv and stv.Get() is not None and stv.GetInterpolation() == 'vertex' else None
            mat = UsdShade.MaterialBindingAPI(part).ComputeBoundMaterial()[0]
            for w in sorted(set(fw[fw > 0].tolist())):
                fs = np.nonzero(fw == w)[0]
                corners = np.concatenate([idx[st0[f]:st0[f] + cnt[f]] for f in fs])
                vs = np.unique(corners); remap = np.full(len(pts), -1, np.int64); remap[vs] = np.arange(len(vs))
                hub = (pts[vs].min(0) + pts[vs].max(0)) / 2.0
                cp = f"/_ue_wheels/{re.sub(r'[^A-Za-z0-9_]', '_', proto_path.strip('/'))}_{part.GetName()}_w{w}"
                wm = UsdGeom.Mesh.Define(st, cp)
                wm.CreatePointsAttr(Vt.Vec3fArray.FromNumpy((pts[vs] - hub).astype(np.float32)))
                wm.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(cnt[fs].astype(np.int32)))
                wm.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(remap[corners].astype(np.int32)))
                wm.CreateSubdivisionSchemeAttr('none')
                if nrm is not None and len(nrm) == len(pts):
                    wm.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.asarray(nrm, np.float32)[vs])); wm.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
                if uv is not None and len(uv) == len(pts):
                    UsdGeom.PrimvarsAPI(wm).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray.FromNumpy(uv[vs]))
                if mat: UsdShade.MaterialBindingAPI.Apply(wm.GetPrim()).Bind(mat)
                lst.append((int(w), hub, cp)); out['wheels'] += 1
            out['parts'] += 1
        split[proto_path] = lst
    return split, out


def wheels_attach(split):
    """each car's wheels as its children, keyed every frame (after convert(): car_proto)."""
    out = {'cars': 0}
    spin_of, steer_of = {}, {}
    for car, (inst, k, proto_path) in car_proto.items():
        lst = split.get(proto_path) or []
        if not lst: continue
        if inst not in spin_of:
            pv = UsdGeom.PrimvarsAPI(st.GetPrimAtPath(inst))
            g_ = lambda n: [np.asarray(pv.GetPrimvar(n).Get(Usd.TimeCode(f)) if pv.HasPrimvar(n) else [], np.float64) for f in frames]
            spin_of[inst], steer_of[inst] = g_('nyc:spin'), g_('nyc:steer')
        sp_, se_ = spin_of[inst], steer_of[inst]
        for (w, hub, cp) in lst:
            wx = UsdGeom.Xform.Define(st, Sdf.Path(car).AppendChild(f'wheel_{os.path.basename(cp)}'))
            wx.AddTranslateOp().Set(Gf.Vec3d(*[float(v) for v in hub]))
            ry = wx.AddRotateYOp() if w in (1, 2) else None
            rx = wx.AddRotateXOp()
            for i_, f in enumerate(frames):
                if k < len(sp_[i_]): rx.Set(float(np.degrees(sp_[i_][k])), Usd.TimeCode(f))
                if ry is not None and k < len(se_[i_]): ry.Set(float(np.degrees(se_[i_][k])), Usd.TimeCode(f))
            g = st.DefinePrim(wx.GetPath().AppendChild('geo')); g.GetReferences().AddInternalReference(cp)
        out['cars'] += 1
    return out


if not a.nomoving:
    mv = st.GetPrimAtPath('/World/Moving')
    todo = [(q, True) for q in (mv.GetChildren() if mv and mv.IsValid() else []) if q.IsA(UsdGeom.PointInstancer)]
    todo += [(q, False) for q in st.Traverse() if q.IsA(UsdGeom.PointInstancer) and not str(q.GetPath()).startswith('/World/Moving/')
             and time_varying(UsdGeom.PointInstancer(q))]
    # R5-WHEELS: the vehicles' prototypes split before convert() deactivates their instancers
    import re
    wsplit, wsplit_stats = {}, {'off': True}
    if not os.environ.get('BXUE_NOWHEELS'):
        try:
            wsplit, wsplit_stats = wheels_split([str(t_) for q_, mv_ in todo if mv_ and q_.GetName().startswith('veh_')
                                                 for t_ in UsdGeom.PointInstancer(q_).GetPrototypesRel().GetTargets()])
        except Exception as e_:
            import traceback; traceback.print_exc(); wsplit_stats = {'error': str(e_)[:200]}
    for q, mover in todo:
        convert(q, mover)


try:
    wheels_ = {**wsplit_stats, **(wheels_attach(wsplit) if wsplit else {})}
except Exception as e_:
    import traceback; traceback.print_exc()
    wheels_ = {'error': str(e_)[:200]}
stats['wheels'] = wheels_
# R5-WHEELS end


# R4-PEDS: the walkers' garment recolour (crowd.js PL31, blender_peds.py) needs each vertex's garment part (top 1, bottom 2,
# shoes 3) and the layer class, which usd_peds.py's meshes do not carry: from the harvest's body geometry (aMeta: slot,
# class, part per vertex, in the meshes' own vertex order) onto the shared body classes (/_peds_class/m_<body>_l<lod>_opaque)
# as a vertex displayColor (R part x 0.2, G class x 0.2), which UE's importer keeps as the skeletal meshes' vertex colour;
# and each walker's three tints (rgba: top, bottom, shoes) for its components' custom primitive data (ue_mat.walkers)
def peds_parts():
    out = {'classes': 0, 'walkers': {}}
    if not st.GetPrimAtPath('/World/Peds'): return out
    H = data.get('harvest') or ''
    try: A = json.load(open(os.path.join(H, 'peds', 'assets.json')))
    except Exception as e: out['error'] = str(e)[:120]; return out
    ident = lambda s: (lambda t: t if t and not t[0].isdigit() else '_' + t)(re.sub(r'[^A-Za-z0-9_]', '_', str(s)))
    for bn, B in (A.get('bodies') or {}).items():
        for li, lod in enumerate(B.get('lods') or []):
            prim = st.GetPrimAtPath(f'/_peds_class/m_{ident(bn)}_l{li}_opaque')
            E = (lod or {}).get('opaque')
            if not prim or not E: continue
            raw = np.fromfile(os.path.join(H, E['file']), dtype=np.uint8)
            Lm = next((L for L in E['layout'] if L['name'] == 'aMeta'), None)
            if Lm is None: continue
            meta = raw[Lm['off']:Lm['off'] + Lm['count'] * Lm['size'] * 4].view(np.float32).reshape(Lm['count'], Lm['size'])
            col = np.zeros((len(meta), 3), np.float32)
            # (the importer writes these as sRGB bytes and the shader may read them either way: levels whose linear and
            # encoded values fall in the same band, 0 / 0.1 / 0.5 / 0.9 for parts 0-3, decoded in M_bx_walker)
            lv = np.array([0.0, 0.1, 0.5, 0.9, 0.0], np.float32)
            col[:, 0] = lv[np.clip(np.rint(meta[:, 2]), 0, 4).astype(int)]; col[:, 1] = lv[np.clip(np.rint(meta[:, 1]), 0, 4).astype(int)]
            pv = UsdGeom.PrimvarsAPI(prim).CreatePrimvar('displayColor', Sdf.ValueTypeNames.Color3fArray, UsdGeom.Tokens.vertex)
            pv.Set(Vt.Vec3fArray.FromNumpy(col))
            out['classes'] += 1
    for w in st.GetPrimAtPath('/World/Peds').GetChildren():
        t = (w.GetCustomData() or {}).get('nyc:tints')
        if t is not None and len(t) >= 12: out['walkers'][w.GetName()] = [round(float(x), 4) for x in list(t)[:12]]
    return out


try:
    import re
    peds_ = peds_parts()
except Exception as e_:
    peds_ = {'error': str(e_)[:160], 'walkers': {}}
stats['peds'] = {'classes': peds_.get('classes', 0), 'walkers': len(peds_.get('walkers') or {}), 'error': peds_.get('error')}
# R4-PEDS end
over.Save()
t_all = time.time() - t0
# R3-PAINT: the fleet's per-car paint attributes (fleet24.js aPaint: metalness, road-film dirt, roughness; the car's seed;
# its kind's height for the film's rise) from the harvest's moving file, which the USD does not carry (nyc_paint is the
# colour only); ue_mat.paint() puts them in the cars' custom primitive data for the clear-coat paint master
try:
    _mv = json.load(open(os.path.join(data.get('harvest') or '', f'mov_{shot}.json')))
    _cars = {c['id']: c for c in _mv.get('cars', []) if c.get('id')}
    _hy = {g.get('tag'): float((g.get('size') or [0, 1.5, 0])[1]) for g in _mv.get('groups', [])}
    _np = 0
    for rec in moving:
        c_ = _cars.get(rec.get('id'))
        if not c_: continue
        if c_.get('paint'): rec['paintx'] = [round(float(v), 4) for v in c_['paint'][:3]]; _np += 1
        rec['seed'] = float(c_.get('seed') or 0.0)
        tag_ = ':'.join(rec['id'].split(':')[:2])
        if tag_ in _hy: rec['sizeY'] = round(_hy[tag_], 3)
    stats['paintx'] = _np
except Exception as e_:
    stats['paintx'] = f'none: {e_}'
# R3-PAINT end

# the lens as authored (UE's importer scales the apertures and the focal length by the stage's units and clamps the focal
# length to the lens's range: ue_light.camera_settings sets them back)
camera = None
cp_ = st.GetPrimAtPath(data.get('camera') or '/World/Cameras/' + shot)
if cp_ and cp_.IsA(UsdGeom.Camera):
    c_ = UsdGeom.Camera(cp_)
    fa = c_.GetFocalLengthAttr()
    camera = {'path': str(cp_.GetPath()), 'focal': float(fa.Get(Usd.TimeCode(f_lo))), 'focal_animated': fa.GetNumTimeSamples() > 1,
              'hap': float(c_.GetHorizontalApertureAttr().Get()), 'vap': float(c_.GetVerticalApertureAttr().Get()),
              'clip': [float(v) for v in c_.GetClippingRangeAttr().Get()], 'ue': []}
    # per frame in UE's world (cm, z up: the importer's axis swap): position, forward (-Z) and up (+Y), so the take keys
    # its own camera in world space
    xc = UsdGeom.Xformable(cp_)
    for f in frames:
        m = xc.ComputeLocalToWorldTransform(Usd.TimeCode(f))
        t_, fw, up = m.ExtractTranslation(), -Gf.Vec3d(m[2][0], m[2][1], m[2][2]), Gf.Vec3d(m[1][0], m[1][1], m[1][2])
        camera['ue'].append({'p': [round(t_[0] * 100, 3), round(t_[2] * 100, 3), round(t_[1] * 100, 3)],
                             'f': [round(fw[0], 7), round(fw[2], 7), round(fw[1], 7)], 'u': [round(up[0], 7), round(up[2], 7), round(up[1], 7)],
                             # the camera-to-world matrix as bx_leafcheck.py's cams.json holds it (column vectors, metres)
                             'm': [[round(m[c][r], 9) for c in range(4)] for r in range(4)]})
# the web's ambient rig as irradiance on six axis normals (web axes, y up): its HemisphereLights (mix(ground, sky, 0.5 + 0.5
# n.y) x intensity, three's getHemisphereLightIrradiance) plus its IBL (environmentIntensity x the cosine-weighted dome
# sky_env, three's getIBLIrradiance); ue_light.setup_ambient lights the take with it unoccluded, as the web does
def ambient():
    h = data.get('harvest') or ''
    try:
        LS = json.load(open(os.path.join(h, 'light_static.json'))); LJ = json.load(open(os.path.join(h, 'lights.json')))
    except Exception:
        return None
    axes = {'+y': (0, 1, 0), '-y': (0, -1, 0), '+x': (1, 0, 0), '-x': (-1, 0, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}
    E = {k: np.zeros(3) for k in axes}
    for L in LJ.get('lights', []):
        if L.get('type') != 'HemisphereLight' or not L.get('visible', True): continue
        I = float(L.get('intensity') or 0); sky = np.array(L['color'], float); gnd = np.array(L.get('groundColor') or L['color'], float)
        for k, n in axes.items():
            w = 0.5 + 0.5 * n[1]; E[k] += I * (gnd + (sky - gnd) * w)
    se = LS.get('skyEnv') or {}
    envI = float(LS.get('envIntensity') or LJ.get('environmentIntensity') or 0.0)
    fp = os.path.join(h, se.get('file') or 'sky_env.f16')
    if envI > 0 and se.get('w') and os.path.exists(fp):
        Wd, Hd = int(se['w']), int(se['h'])
        img = np.fromfile(fp, np.float16).astype(np.float32)[:Wd * Hd * 3].reshape(Hd, Wd, 3)   # rows bottom-up
        lat = ((np.arange(Hd) + 0.5) / Hd * np.pi - np.pi / 2)[:, None]; lon = ((np.arange(Wd) + 0.5) / Wd * 2 * np.pi - np.pi)[None, :]
        d = np.stack([np.cos(lat) * np.cos(lon), np.sin(lat) * np.ones_like(lon), np.cos(lat) * np.sin(lon)], -1)
        dA = (2 * np.pi / Wd) * (np.pi / Hd) * np.cos(lat)
        for k, n in axes.items():
            c = np.maximum(0.0, d @ np.array(n, float)) * dA
            E[k] += envI * (img * c[..., None]).reshape(-1, 3).sum(0)
    return {k: [round(float(x), 5) for x in v] for k, v in E.items()}


def sky_means():
    """the page's domes' mean radiance x environmentIntensity (light_static.json skyVis / skyEnv): what its glass reflects."""
    try: LS = json.load(open(os.path.join(data.get('harvest') or '', 'light_static.json')))
    except Exception: return None
    envI = float(LS.get('envIntensity') or 0.0)
    out = {}
    for k, key in (('vis_mean', 'skyVis'), ('env_mean', 'skyEnv')):
        m = (LS.get(key) or {}).get('mean')
        if m: out[k] = [round(float(v) * (envI if k == 'env_mean' else 1.0), 5) for v in m]
    return out


# the far ring's prims (/World/Far: the macro city and terrain past the region), which cast no shadows in UE as in the web
farp = st.GetPrimAtPath('/World/Far')
far = sorted({p.GetName() for p in Usd.PrimRange(farp)} - {'Far'}) if farp and farp.IsValid() else []
# alpha-tested cards (the tree set's leaves and impostors): their colour bled into the transparent texels, so the engine's
# mips do not average the transparent white into the leaf (pale, near white crowns at a distance); written beside the prep
def dilate_cards():
    try:
        from PIL import Image
    except Exception:
        return 0
    n = 0
    os.makedirs(os.path.join(out, 'tex'), exist_ok=True)
    for name, pt in previews.items():
        if not name.startswith(('bxt_leaf_', 'bxt_imp_')): continue
        t = (pt.get('tex') or {}).get('diffuseColor')
        if not t or not os.path.exists(t['file']): continue
        dst = os.path.join(out, 'tex', 'dil_' + os.path.basename(t['file']))
        if not os.path.exists(dst):
            im = np.asarray(Image.open(t['file']).convert('RGBA'), np.float32)
            rgb, al = im[..., :3], im[..., 3:] / 255.0
            m = al[..., 0] > 0.5
            if m.any():
                try:   # each transparent texel takes its nearest opaque texel's colour
                    from scipy import ndimage
                    idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
                    out_im = np.concatenate([rgb[idx[0], idx[1]], im[..., 3:]], -1).clip(0, 255).astype(np.uint8)
                    Image.fromarray(out_im, 'RGBA').save(dst); t['file'] = dst; n += 1; continue
                except ImportError:
                    pass
                fill = rgb.copy(); known = m.copy()
                for _ in range(64):   # push the opaque colour outwards until every texel has one
                    if known.all(): break
                    nb = np.zeros_like(fill); nw = np.zeros(known.shape, np.float32)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nb += np.roll(np.roll(fill * known[..., None], dy, 0), dx, 1); nw += np.roll(np.roll(known.astype(np.float32), dy, 0), dx, 1)
                    grow = (~known) & (nw > 0)
                    fill[grow] = nb[grow] / nw[grow, None]; known |= grow
                fill[~known] = rgb[m].mean(0)
                out_im = np.concatenate([fill, im[..., 3:]], -1).clip(0, 255).astype(np.uint8)
                Image.fromarray(out_im, 'RGBA').save(dst)
        t['file'] = dst; n += 1
    return n


stats['cards_dilated'] = dilate_cards()


# R3-HQ: the CC0 sets (tools/assets/fetch_hq.py; the mapping is ue_families.json hq) for the pbr families' sets, the
# ground's asphalt / flags / kerbs, the viaduct's paint and rust and the facade bake's wall classes: each set's files, real
# size and mean; per pbr tag the tint that keeps the set at the pbrLib set's own mean colour (x its pbRatio). BXUE_NOHQ=1:
# none (the take's own textures).
def hq_sets():
    if os.environ.get('BXUE_NOHQ'): return {'off': True}
    try:
        T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ue_families.json'))).get('hq') or {}
        M = json.load(open(os.environ.get('BXUE_HQ') or T.get('manifest') or '/data0/projectnyc_aux/assets/hq/hq.json'))   # BXUE_HQ: the fetched sets' hq.json
    except Exception as e:
        return {'error': str(e)[:160]}
    from PIL import Image

    def rec(sid):
        m = M.get(sid) or {}; f = m.get('files') or {}
        if not all(k in f and os.path.exists(f[k]) for k in ('alb', 'nrm', 'arm')): return None
        return {'id': sid, 'alb': f['alb'], 'nrm': f['nrm'], 'arm': f['arm'], 'size': (m.get('size_m') or [2.0, 2.0])[:2],
                'mean': (m.get('albedo_mean') or [0.5, 0.5, 0.5])[:3]}

    def mean_lin(path):
        im = Image.open(path).convert('RGB'); im.thumbnail((256, 256))
        x = np.asarray(im, np.float32) / 255.0
        return [float(v) for v in np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).reshape(-1, 3).mean(0)]

    out, means, lay = {'pbr': 0, 'ground': 0, 'vk': 0}, {}, T.get('layers') or {}
    for P in tags.values():
        kind = P.get('kind')
        if kind == 'pbr' and P.get('set') in (T.get('pbr') or {}):
            r, alb = rec(T['pbr'][P['set']]), (P.get('tex') or {}).get('alb')
            if not r or not alb or not os.path.exists(alb): continue
            if alb not in means: means[alb] = mean_lin(alb)
            pr = P.get('pbRatio') or [1.0, 1.0, 1.0]
            P['hq'] = {'id': r['id'], 'alb': r['alb'], 'nrm': r['nrm'], 'arm': r['arm'], 'size': r['size'],
                       'ratio': [round(float(pr[i]) * means[alb][i] / max(r['mean'][i], 1e-4), 4) for i in range(3)],
                       'unit': (T.get('unit') or {}).get(r['id'], [0.0, 0.0]), **(lay.get('pbr') or {})}
            out['pbr'] += 1
        elif kind in ('ground', 'vk') and T.get(kind):
            g = {k: rec(v) for k, v in T[kind].items() if not k.startswith('_')}
            if g and all(g.values()):
                P['hq'] = {**g, 'sizes': [g[k]['size'][0] for k in sorted(g, key=lambda k: list(T[kind]).index(k))] + [1.0] * (3 - len(g))}
                out[kind] += 1
    fac = {k: rec(v) for k, v in (T.get('facade') or {}).items() if not k.startswith('_')}
    out['facade'] = {**fac, 'sizes': [fac[k]['size'][0] for k in ('B', 'S', 'C')]} if fac and all(fac.values()) and all(k in fac for k in 'BSC') else None
    return out


# R8-EMIT (UE track, 2026-10-08): the strong emissive surfaces (the Apollo's marquee panels and neon, the big lit signs) as
# light sources. In the path tracer they light the sidewalk and the facade under them; UE's emissive surfaces light
# nothing worth seeing at night (Lumen's surface cache, too coarse for a sign's bulbs), so tuApolloSweep's sidewalk under
# the marquee stayed dark. Per emissive prim (its material's emissive colour, or its emissive map's mean x scale), its
# triangles grouped by facing (six axis bins): the area, the area-weighted centre, the mean normal and the extent across
# it, and the emitted luminance x area as the light's candela (x ue_light EMIT_K). The strongest EMIT_MAX, in the web's
# world. ue_light spawns them as rect lights at night.
EMIT_MIN, EMIT_MAX, EMIT_AREA, EMIT_TILE, EMIT_NEAR = 0.4, 96, 80.0, 4.0, 90.0   # (strength x m2 at least; at most 96 lights, a tile's 80 m2; 4 m tiles; within 90 m of the lens path)
def emit_lights():
    from PIL import Image
    og = [float(v) for v in (data.get('origin') or [0, 0, 0])]
    means = {}
    def emission(nm):
        P = tags.get(nm); pv = (P or {}).get('preview') if P is not None else previews.get(nm)
        pv = pv or {}
        e = pv.get('emissiveColor')
        tx = (pv.get('tex') or {}).get('emissiveColor')
        if isinstance(tx, dict) and tx.get('file'):
            f = tx['file']
            if f not in means:
                try:
                    a = np.asarray(Image.open(f).convert('RGB'), np.float32) / 255.0
                    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4) if (tx.get('cs') or 'sRGB') != 'raw' else a
                    means[f] = lin.reshape(-1, 3).mean(0)
                except Exception: means[f] = np.zeros(3)
            sc = np.array((tx.get('scale') or [1, 1, 1])[:3], np.float64)
            return means[f] * sc
        if isinstance(e, list) and len(e) >= 3: return np.array(e[:3], np.float64)
        return None
    out = []
    xc = UsdGeom.XformCache()
    for p_ in st.Traverse():
        if not p_.IsA(UsdGeom.Mesh) or p_.IsInstanceProxy() or p_.GetName().startswith('bxw_'): continue
        m_ = UsdGeom.Mesh(p_)
        subs = UsdGeom.Subset.GetAllGeomSubsets(m_)
        parts = []
        for ss in (subs or [None]):
            tgt = ss.GetPrim() if ss is not None else p_
            b = UsdShade.MaterialBindingAPI(tgt).ComputeBoundMaterial()[0]
            if not b: continue
            mn_ = b.GetPrim().GetName()
            tn_ = str((tags.get(mn_) or {}).get('name') or '')
            if tn_.startswith('fk:int_') and tn_ != 'fk:int_shopLight': continue   # (the rooms behind the upper windows; the shops' light stays)
            em = emission(mn_)
            if em is None: continue
            lum = float(em.max())   # (the light's strength by its strongest channel: a red neon at 1 is a bright light)
            if lum < 0.15: continue
            parts.append((em, lum, None if ss is None else np.asarray(ss.GetIndicesAttr().Get(), np.int64)))
        if not parts: continue
        P = np.asarray(m_.GetPointsAttr().Get() or [], np.float64)
        if not len(P): continue
        M = np.array(xc.GetLocalToWorldTransform(p_)); Pw = (np.c_[P, np.ones(len(P))] @ M)[:, :3] + np.array(og)
        cnt = np.asarray(m_.GetFaceVertexCountsAttr().Get(), np.int64); idx = np.asarray(m_.GetFaceVertexIndicesAttr().Get(), np.int64)
        if not len(cnt) or (cnt != 3).any() and (cnt < 3).any(): continue
        st_ = np.r_[0, np.cumsum(cnt)[:-1]]
        for em, lum, faces in parts:
            fs = faces if faces is not None else np.arange(len(cnt))
            fs = fs[cnt[fs] >= 3]
            a = Pw[idx[st_[fs]]]; b_ = Pw[idx[st_[fs] + 1]]; c_ = Pw[idx[st_[fs] + 2]]
            nrm = np.cross(b_ - a, c_ - a); ar = 0.5 * np.linalg.norm(nrm, axis=1)
            ok = ar > 1e-8
            if not ok.any(): continue
            a, b_, c_, nrm, ar = a[ok], b_[ok], c_[ok], nrm[ok], ar[ok]
            nu = nrm / (2 * ar[:, None]); cen = (a + b_ + c_) / 3
            ax = np.argmax(np.abs(nu), axis=1); sg = np.sign(nu[np.arange(len(nu)), ax])
            for k in range(3):
                for sgn in (-1.0, 1.0):
                    selk = (ax == k) & (sg == sgn)
                    if not selk.any(): continue
                    u_, v_ = [i for i in range(3) if i != k]
                    tu = np.floor(cen[:, u_] / EMIT_TILE).astype(np.int64); tv = np.floor(cen[:, v_] / EMIT_TILE).astype(np.int64)
                    keys_ = sorted(set(zip(tu[selk].tolist(), tv[selk].tolist())))
                    for (iu, iv) in keys_:
                      sel = selk & (tu == iu) & (tv == iv)
                      A = float(ar[sel].sum())
                      if A * lum < EMIT_MIN or A > EMIT_AREA: continue
                      w = ar[sel] / A
                      cc = (cen[sel] * w[:, None]).sum(0); nn = (nu[sel] * w[:, None]).sum(0); nn /= (np.linalg.norm(nn) + 1e-9)
                      lo, hi = np.r_[a[sel], b_[sel], c_[sel]].min(0), np.r_[a[sel], b_[sel], c_[sel]].max(0)
                      ext = [float(v) for i, v in enumerate(hi - lo) if i != k]
                      # (one sign, not many small emitters merged into one mesh across a park: at least 15 % of its tile lit)
                      if A < 0.15 * max(ext[0], 0.05) * max(ext[1], 0.05): continue
                      out.append({'prim': p_.GetName()[:48], 'pos': [round(float(v), 3) for v in cc], 'normal': [round(float(v), 4) for v in nn],
                                  'size': [round(max(e_, 0.05), 3) for e_ in ext], 'axis': int(k), 'area': round(A, 4),
                                  'color': [round(float(v), 5) for v in (em / max(float(em.max()), 1e-6))], 'cd': round(lum * A, 4), 'lum': round(lum, 4)})
    try: cams = json.load(open(os.path.join(data.get('harvest') or '', f'cam_{shot}.json')))
    except Exception: cams = []
    L = np.array([[c_['m'][12], c_['m'][13], c_['m'][14]] for c_ in cams if c_ and c_.get('m')], np.float64)
    if len(L):
        L = L[np.linspace(0, len(L) - 1, min(len(L), 24)).astype(np.int64)]
        for r in out:
            d = float(np.min(np.linalg.norm(L - np.array(r['pos']), axis=1)))
            r['dist'] = round(d, 1); r['rel'] = r['cd'] / max(d, 5.0) ** 2
        out = [r for r in out if r['dist'] <= EMIT_NEAR]
        out.sort(key=lambda r: -r['rel'])
    else:
        out.sort(key=lambda r: -r['cd'])
    return out[:EMIT_MAX]


try: emit_ = emit_lights()
except Exception as e: emit_ = []; stats['emit_error'] = str(e)[:200]
stats['emit_lights'] = len(emit_)
# R8-EMIT end
hq_ = hq_sets()
stats['hq'] = {k: (v if not isinstance(v, dict) else sorted(v)) for k, v in hq_.items()}
# R3-HQ end
side = {'shot': shot, 'usd': usd, 'root': src_root, 'ue_root': root_path, 'frames': [f_lo, f_hi], 'fps': rl.framesPerSecond or 30, 'camera': camera, 'far': far,
        'data': {k: (list(v) if hasattr(v, '__len__') and not isinstance(v, str) else v) for k, v in data.items()},
        'materials': tags, 'previews': previews, 'moving': moving, 'ambient': ambient(), 'sky': sky_means(), 'hq': hq_,
        'walkers': peds_.get('walkers') or {}, 'emit_lights': emit_,   # R8-EMIT
        'stats': {**stats, 'moving': mstats, 'materials': len(tags), 'secs_primvars': round(t_pv, 1), 'secs': round(t_all, 1)}}
json.dump(side, open(os.path.join(out, f'ue_{shot}.json'), 'w'), indent=0)
print('UE_PREP ' + json.dumps({'root': root_path, **side['stats']}))
