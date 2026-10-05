# BX-PEDS (AR34 BX, 2026-10-02): the crowd's walkers as OpenUSD (UsdSkel) and as compact per-frame data for blender_peds.py
# (docs/notes/ar34-bx-peds.md). A usd_write.py hook (finish); also runs alone on a harvest:
#   uv run --no-project --with usd-core --with numpy --with pillow python usd_peds.py --in <harvest> --out <usd dir>
#       [--shots a,b] [--pedtex <cache dir>] [--peds-usd 0]
#
# Input (harvest_peds.mjs): peds_<shot>.json + peds/<shot>/f<iii>.bin (per frame every drawn walker: header + the skinning
# matrices of its pose row), peds/assets.json (skeletons, bodies' inverse bind matrices, variants) and peds/geo/*.bin (the
# drawn bodies' LOD meshes as the crowd loaded them). The web's skinning matrix of joint b is S_b = G_b x IBM_b (crowd.js
# POSE_FS), so the joint's global transform in the body's model space is G_b = S_b x inverse(IBM_b) and its local transform
# L_b = inverse(G_parent) x G_b: exactly what UsdSkel's SkelAnimation holds.
#
# Output in the USD dir:
#   peds_<shot>.usdc  /World/Peds: per walker a SkelRoot (time-sampled transform = the crowd's instance matrix, visibility),
#                     its Skeleton (joints, bind = inverse IBM, rest = the bind pose's locals; the body's skeleton class
#                     referenced), a SkelAnimation (time-sampled joint translations / rotations, every frame the walker is
#                     drawn), the body's LOD mesh (bind-space points, normals, st with the UDIM tile folded, skel joint
#                     indices / weights, GeomSubsets per texture layer bound to UsdPreviewSurface looks of the unpacked
#                     texture layers; the props it does not carry left out). The walker's LOD is the finest the web drew it
#                     at during the take (crowdlod), so it never switches mid-take.
#   peds_<shot>.npz   the same walkers for blender_peds.py: ids, body, variant, LOD, prop mask, tints, per frame presence,
#                     in-view flag, near fade, instance matrix, joint local rotations (xyzw) and translations.
#   <shot>_peds.usda  a root over the shot's take root with the walkers (any USD renderer); Blender's importer reads the
#                     take root without skeletons, so blender_peds.py builds the walkers itself from the npz.
#   textures/peds/<set>/{albedo,normal,orm,hair}_<layer>.png, albedo6_<layer>.png (mip 6: the garment recolour's local mean)
#                     hard links into the texture cache (the crowd's KTX2 arrays unpacked once with basisu).
import os, sys, json, time, subprocess, shutil, glob, argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
PEDS24 = os.path.join(ROOT, 'boundlessjs', 'public', 'models', 'peds24')
BASISU = os.environ.get('BASISU', '/data0/projectnyc_aux/.tools/basisu/basis_universal-1_60/bin/basisu')   # the basisu 1.60 CLI
TEXCACHE = os.environ.get('BX_PEDS_TEXCACHE', '/data0/projectnyc_aux/tmp/bx/peds/tex')   # unpacked walker textures (also --pedtex)
HW = 48
SETS = {'peds24': os.path.join(PEDS24, 'manifest.json'), 'rb27': os.path.join(PEDS24, 'rb27', 'manifest.json')}


def log(*a): print('[usd_peds]', *a, flush=True)


# ---------------------------------------------------------------- the texture cache: the KTX2 arrays unpacked once
def unpack_textures(cache=TEXCACHE):
    """every layer of the crowd's four texture arrays (both sets) as PNG: <cache>/<set>/<kind>_<LLL>.png (mip 0) and
    albedo6_<LLL>.png (mip 6). basisu transcodes UASTC to ASTC 4x4 (lossless for UASTC) and writes its decode."""
    done = os.path.join(cache, 'done.json')
    if os.path.exists(done): return json.load(open(done))
    out = {}
    for sname, mpath in SETS.items():
        if not os.path.exists(mpath): continue
        M = json.load(open(mpath))
        base = os.path.dirname(mpath)
        d = os.path.join(cache, sname); os.makedirs(d, exist_ok=True)
        out[sname] = {}
        for kind, a in M['arrays'].items():
            if not a.get('file'): continue
            src = os.path.join(base, a['file']) if not a['file'].startswith('rb27/') else os.path.join(PEDS24, a['file'])
            if not os.path.exists(src): src = os.path.join(PEDS24, a['file'])
            tmp = os.path.join(d, '_unpack_' + kind); os.makedirs(tmp, exist_ok=True)
            shutil.copy(src, os.path.join(tmp, kind + '.ktx2'))
            t0 = time.time()
            subprocess.run([BASISU, '-unpack', kind + '.ktx2', '-no_ktx', '-format_only', '10'], cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            n = 0
            for f in glob.glob(os.path.join(tmp, f'{kind}_unpacked_rgba_ASTC_RGBA_level_0_face_0_layer_*.png')):
                L = int(f.rsplit('_', 1)[1].split('.')[0]); os.replace(f, os.path.join(d, f'{kind}_{L:03d}.png')); n += 1
            if kind == 'albedo':
                for f in glob.glob(os.path.join(tmp, f'{kind}_unpacked_rgba_ASTC_RGBA_level_6_face_0_layer_*.png')):
                    L = int(f.rsplit('_', 1)[1].split('.')[0]); os.replace(f, os.path.join(d, f'albedo6_{L:03d}.png'))
            shutil.rmtree(tmp, ignore_errors=True)
            out[sname][kind] = {'layers': n, 'size': a.get('size'), 'secs': round(time.time() - t0, 1)}
            log(f'textures {sname}/{kind}: {n} layers in {time.time() - t0:.1f}s')
    json.dump(out, open(done, 'w'), indent=1)
    return out


# ---------------------------------------------------------------- math
def m16_to_44(m):   # three.js column-major 16 -> 4x4 (column-vector convention)
    return np.asarray(m, dtype=np.float64).reshape(4, 4).T

def mat_to_quat(R):   # (..., 3, 3) rotation -> (..., 4) xyzw
    R = np.asarray(R, dtype=np.float64)
    q = np.empty(R.shape[:-2] + (4,))
    t = R[..., 0, 0] + R[..., 1, 1] + R[..., 2, 2]
    c0 = t > 0
    c1 = (~c0) & (R[..., 0, 0] >= R[..., 1, 1]) & (R[..., 0, 0] >= R[..., 2, 2])
    c2 = (~c0) & (~c1) & (R[..., 1, 1] >= R[..., 2, 2])
    c3 = (~c0) & (~c1) & (~c2)
    s = np.sqrt(np.maximum(t[c0] + 1.0, 1e-12)) * 2
    q[c0] = np.stack([(R[c0][..., 2, 1] - R[c0][..., 1, 2]) / s, (R[c0][..., 0, 2] - R[c0][..., 2, 0]) / s, (R[c0][..., 1, 0] - R[c0][..., 0, 1]) / s, 0.25 * s], -1)
    for cm, (i, j, k) in ((c1, (0, 1, 2)), (c2, (1, 2, 0)), (c3, (2, 0, 1))):
        if not cm.any(): continue
        Rm = R[cm]
        s = np.sqrt(np.maximum(1.0 + Rm[..., i, i] - Rm[..., j, j] - Rm[..., k, k], 1e-12)) * 2
        v = np.empty(Rm.shape[:-2] + (4,))
        v[..., i] = 0.25 * s
        v[..., j] = (Rm[..., j, i] + Rm[..., i, j]) / s
        v[..., k] = (Rm[..., k, i] + Rm[..., i, k]) / s
        v[..., 3] = (Rm[..., k, j] - Rm[..., j, k]) / s
        q[cm] = v
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


# ---------------------------------------------------------------- the harvest's walkers
def lod_dist(man):
    fl = man.get('flags') or ''
    for p in fl.split('&'):
        if p.startswith('crowdlod='): return [float(v) for v in p.split('=')[1].split(',')]
    return [9.0, 26.0]

def load_assets(IN):
    A = json.load(open(os.path.join(IN, 'peds', 'assets.json')))
    for bn, B in A['bodies'].items():
        ibm = np.asarray(B['ibm'], dtype=np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)   # column-major -> 4x4
        B['IBM'] = ibm
        B['BIND'] = np.linalg.inv(ibm)
        par = A['skel'][B['skeleton']]['parents']
        B['parents'] = par
        bind = B['BIND']
        rest = np.empty_like(bind)
        for b, p in enumerate(par): rest[b] = bind[b] if p < 0 else np.linalg.inv(bind[p]) @ bind[b]
        B['REST'] = rest
    return A

def read_walkers(IN, shot, A):
    """-> (walkers list, nF). A walker: id (the seed's float32 bits), body, variant, lod (the finest the web drew), prop mask,
    tints, frames {f: (header, S (nb, 3, 4))}."""
    P = json.load(open(os.path.join(IN, f'peds_{shot}.json')))
    hw = int(P.get('hw', HW))
    nF = max(fr['i'] for fr in P['frames']) + 1 if P['frames'] else 0
    W = {}
    for fr in P['frames']:
        fn = os.path.join(IN, fr['file'])
        if not os.path.exists(fn): continue
        buf = np.fromfile(fn, dtype=np.float32)
        o = 0
        while o + hw <= len(buf):
            h = buf[o:o + hw]; nb = int(h[42])
            S = buf[o + hw:o + hw + nb * 12].reshape(nb, 3, 4)
            o += hw + nb * 12
            sid = int(np.float32(h[1]).view(np.uint32)); vi = int(h[2])
            key = (sid, vi)
            w = W.get(key)
            if w is None:
                v = A['variants'][vi]
                w = W[key] = {'id': sid, 'vi': vi, 'body': v['body'], 'set': v.get('set') or 'peds24', 'frames': {}, 'lod': 2, 'pm': int(h[7]), 'tint': h[24:36].copy(), 'seat': 0, 'vis': 0}
            w['frames'][fr['i']] = (h.copy(), S.copy())
            w['lod'] = min(w['lod'], int(h[3]))
            if h[4] > 0.5: w['vis'] += 1
            if h[44] > 0: w['seat'] = int(h[44])
    return list(W.values()), nF

def locals_of(w, B, nF):
    """per frame the joint locals (quaternion xyzw, translation) and the instance matrix; frames without the walker hold the
    nearest drawn one. -> present (nF,), M (nF, 4, 4), Lq (nF, nb, 4), Lt (nF, nb, 3), vis (nF,), fade (nF,). G is rigid (the
    pose pass builds it from a quaternion and a translation), so the parents' inverses are transposes."""
    if '_loc' in w: return w['_loc']
    par = np.asarray(B['parents']); nb = len(par); bind = B['BIND']
    fs = np.array(sorted(w['frames']))
    Hh = np.stack([w['frames'][f][0] for f in fs])
    S = np.stack([w['frames'][f][1] for f in fs]).astype(np.float64)
    S4 = np.zeros((len(fs), nb, 4, 4)); S4[..., :3, :] = S; S4[..., 3, 3] = 1.0
    G = S4 @ bind[None]
    pi = np.where(par < 0, 0, par)
    Gp = G[:, pi]
    Rt = np.swapaxes(Gp[..., :3, :3], -1, -2)
    inv = np.zeros_like(Gp); inv[..., :3, :3] = Rt; inv[..., :3, 3] = -(Rt @ Gp[..., :3, 3:4])[..., 0]; inv[..., 3, 3] = 1.0
    L = inv @ G
    L[:, par < 0] = G[:, par < 0]
    near = np.abs(fs[None, :] - np.arange(nF)[:, None]).argmin(axis=1)   # each frame -> the nearest drawn one
    present = np.isin(np.arange(nF), fs)
    hn = Hh[near]
    vis = present & (hn[:, 4] > 0.5)
    fade = np.where(present, hn[:, 6], 0).astype(np.float32)
    M = hn[:, 8:24].astype(np.float64).reshape(nF, 4, 4).transpose(0, 2, 1)
    Ln = L[near]
    Lq = mat_to_quat(Ln[..., :3, :3]); Lt = Ln[..., :3, 3]
    w['_loc'] = (present, M, Lq, Lt, vis, fade)
    return w['_loc']

def load_geo(IN, A, bn, li, kind):
    E = A['bodies'][bn]['lods'][li].get(kind)
    if not E: return None
    raw = np.fromfile(os.path.join(IN, E['file']), dtype=np.uint8)
    out = {}
    for L in E['layout']:
        dt = np.uint32 if L.get('type') == 'uint32' else np.float32
        n = L['count'] * L['size']
        a = raw[L['off']:L['off'] + n * 4].view(dt)
        out[L['name']] = a.reshape(L['count'], L['size']) if L['size'] > 1 else a.copy()
    return out


# ---------------------------------------------------------------- per (body, lod, variant, prop mask): faces per texture layer
def face_layers(G, V, kind):
    """-> per triangle: texture layer, class, fabric flag; the props the walker does not carry are dropped later."""
    idx = G['index'].reshape(-1, 3)
    meta = G['aMeta']
    slot = np.rint(meta[idx[:, 0], 0]).astype(int); cls = np.rint(meta[idx[:, 0], 1]).astype(int); part = np.rint(meta[idx[:, 0], 2]).astype(int)
    u = G['uv'][idx, 0].mean(axis=1)
    tile = np.floor(u).astype(int)
    lay = np.zeros(len(idx), int)
    table = V['layers']
    for k in np.unique(slot):
        m = slot == k
        if k >= 100: lay[m] = k - 100
        else: lay[m] = max(0, table[k] if k < len(table) and table[k] is not None else 0)
    if kind == 'opaque': lay = lay + np.maximum(tile, 0)
    return lay, cls, part, tile

def keep_faces(G, pm):
    idx = G['index'].reshape(-1, 3)
    part = np.rint(G['aMeta'][idx[:, 0], 2]).astype(int)
    keep = np.ones(len(idx), bool)
    pr = part >= 10
    if pr.any(): keep[pr] = ((pm >> (part[pr] - 10)) & 1) == 1
    return keep


# ---------------------------------------------------------------- the npz for blender_peds.py
def write_npz(OUT, shot, walkers, A, nF, man, IN):
    W = len(walkers)
    nbmax = max(len(s['parents']) for s in A['skel'].values())
    bodies = sorted({w['body'] for w in walkers})
    bi = {b: i for i, b in enumerate(bodies)}
    present = np.zeros((W, nF), bool); vis = np.zeros((W, nF), bool); fade = np.zeros((W, nF), np.float16)
    Ms = np.zeros((W, nF, 16), np.float32); Lq = np.zeros((W, nF, nbmax, 4), np.float32); Lt = np.zeros((W, nF, nbmax, 3), np.float32)
    for k, w in enumerate(walkers):
        B = A['bodies'][w['body']]
        pr, M, q, t, v, fd = locals_of(w, B, nF)
        nb = q.shape[1]
        present[k] = pr; vis[k] = v; fade[k] = fd
        Ms[k] = M.transpose(0, 2, 1).reshape(nF, 16)   # back to three's column-major
        Lq[k, :, :nb] = q; Lt[k, :, :nb] = t
    meta = {'shot': shot, 'frames': nF, 'fps': man.get('fps', 30), 'crowdlod': lod_dist(man), 'harvest': os.path.abspath(IN), 'bodies': bodies,
            'variants': A['variants'], 'skel': A['skel'], 'hw': HW}
    np.savez(os.path.join(OUT, f'peds_{shot}.npz'), meta=np.frombuffer(json.dumps(meta).encode(), dtype=np.uint8),
             w_id=np.array([w['id'] for w in walkers], np.uint32), w_body=np.array([bi[w['body']] for w in walkers], np.int32),
             w_var=np.array([w['vi'] for w in walkers], np.int32), w_lod=np.array([w['lod'] for w in walkers], np.int32),
             w_pm=np.array([w['pm'] for w in walkers], np.int32), w_tint=np.array([w['tint'] for w in walkers], np.float32).reshape(W, 12),
             w_seat=np.array([w['seat'] for w in walkers], np.int32), w_nvis=np.array([w['vis'] for w in walkers], np.int32),
             present=present, vis=vis, fade=fade, M=Ms, Lq=Lq, Lt=Lt)
    return {'walkers': W, 'in_view': int((vis.any(axis=1)).sum()), 'lod': [int(sum(1 for w in walkers if w['lod'] == l)) for l in range(3)]}


# ---------------------------------------------------------------- UsdSkel
def ident(s):
    import re
    s = re.sub(r'[^A-Za-z0-9_]', '_', str(s))
    return s if s and not s[0].isdigit() else '_' + s

def link_tex(OUT, sname, files):
    d = os.path.join(OUT, 'textures', 'peds', sname); os.makedirs(d, exist_ok=True)
    for f in files:
        src = os.path.join(TEXCACHE, sname, f); dst = os.path.join(d, f)
        if not os.path.exists(src): continue
        if os.path.lexists(dst):   # a file of that name from an earlier write is kept only if it is this one (BX-QA)
            try:
                if os.path.samefile(src, dst): continue
            except OSError: pass
            os.unlink(dst)
        try: os.link(src, dst)
        except OSError: shutil.copy(src, dst)
    return d

def write_usd(OUT, shot, walkers, A, nF, man, IN, take_root=None):
    from pxr import Usd, UsdGeom, UsdSkel, UsdShade, Sdf, Gf, Vt
    fn = f'peds_{shot}.usdc'
    st = Usd.Stage.CreateNew(os.path.join(OUT, fn))
    UsdGeom.SetStageUpAxis(st, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(st, 1.0)
    fps = float(man.get('fps', 30))
    st.SetStartTimeCode(0); st.SetEndTimeCode(nF - 1); st.SetTimeCodesPerSecond(fps); st.SetFramesPerSecond(fps)
    UsdGeom.Xform.Define(st, '/World'); UsdGeom.Scope.Define(st, '/World/Peds')
    cls_root = st.CreateClassPrim('/_peds_class')
    looks = {}
    def look(sname, L, kind, c):
        key = (sname, L, kind, c)
        if key in looks: return looks[key]
        p = f'/World/Peds/Looks/{ident(sname)}_L{L:03d}_{kind}_{c}'
        mat = UsdShade.Material.Define(st, p)
        sh = UsdShade.Shader.Define(st, p + '/pbr'); sh.CreateIdAttr('UsdPreviewSurface')
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
        stR = UsdShade.Shader.Define(st, p + '/st'); stR.CreateIdAttr('UsdPrimvarReader_float2'); stR.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
        def tex(name, file, cs):
            t = UsdShade.Shader.Define(st, p + '/' + name); t.CreateIdAttr('UsdUVTexture')
            t.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(f'./textures/peds/{sname}/{file}')
            t.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set(cs)
            t.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(stR.ConnectableAPI(), 'result')
            return t
        if kind == 'hair':
            link_tex(OUT, sname, [f'hair_{L:03d}.png'])
            t = tex('hair', f'hair_{L:03d}.png', 'sRGB')
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(t.ConnectableAPI(), 'rgb')
            sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).ConnectToSource(t.ConnectableAPI(), 'a')
            sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.35)
            sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.75)
        else:
            link_tex(OUT, sname, [f'albedo_{L:03d}.png', f'normal_{L:03d}.png', f'orm_{L:03d}.png', f'albedo6_{L:03d}.png'])
            ta = tex('albedo', f'albedo_{L:03d}.png', 'sRGB'); tn = tex('normal', f'normal_{L:03d}.png', 'raw'); to = tex('orm', f'orm_{L:03d}.png', 'raw')
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(ta.ConnectableAPI(), 'rgb')
            tn.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(2, 2, 2, 1)); tn.CreateInput('bias', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(-1, -1, -1, 0))
            sh.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(tn.ConnectableAPI(), 'rgb')
            sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).ConnectToSource(to.ConnectableAPI(), 'g')
            sh.CreateInput('occlusion', Sdf.ValueTypeNames.Float).ConnectToSource(to.ConnectableAPI(), 'r')
            if c == 2: sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.08)
        looks[key] = mat
        return mat
    # skeleton classes per body, mesh classes per (body, lod, kind) and per (body, lod, kind, variant, props)
    skel_cls, mesh_base, mesh_var = {}, {}, {}
    def skel_class(bn):
        if bn in skel_cls: return skel_cls[bn]
        B = A['bodies'][bn]; S = A['skel'][B['skeleton']]
        names = [ident(n) for n in S['bones']]
        paths = []
        for b, p in enumerate(S['parents']): paths.append(names[b] if p < 0 else paths[p] + '/' + names[b])
        cp = f'/_peds_class/skel_{ident(bn)}'
        sk = UsdSkel.Skeleton.Define(st, cp)
        sk.CreateJointsAttr(Vt.TokenArray(paths))
        sk.CreateBindTransformsAttr(Vt.Matrix4dArray([Gf.Matrix4d(*B['BIND'][b].T.flatten().tolist()) for b in range(len(paths))]))
        sk.CreateRestTransformsAttr(Vt.Matrix4dArray([Gf.Matrix4d(*B['REST'][b].T.flatten().tolist()) for b in range(len(paths))]))
        skel_cls[bn] = (cp, paths)
        return skel_cls[bn]
    def base_mesh(bn, li, kind):
        key = (bn, li, kind)
        if key in mesh_base: return mesh_base[key]
        G = load_geo(IN, A, bn, li, kind)
        if G is None: mesh_base[key] = None; return None
        cp = f'/_peds_class/m_{ident(bn)}_l{li}_{kind}'
        m = UsdGeom.Mesh.Define(st, cp)
        m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(G['position'].astype(np.float32)))
        m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(G['normal'].astype(np.float32))); m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
        uv = G['uv'].astype(np.float32).copy(); uv[:, 0] -= np.floor(uv[:, 0])   # the UDIM tile is the face's layer (+1)
        uv[:, 1] = 1.0 - uv[:, 1]   # glTF / KTX2 rows run top-down; USD st has (0, 0) at the image's bottom left
        UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray.FromNumpy(uv))
        m.CreateSubdivisionSchemeAttr('none')
        ji = np.rint(G['skinIndex']).astype(np.int32); jw = G['skinWeight'].astype(np.float32)
        jw = jw / np.maximum(jw.sum(axis=1, keepdims=True), 1e-8)
        bapi = UsdSkel.BindingAPI.Apply(m.GetPrim())
        bapi.CreateJointIndicesPrimvar(False, 4).Set(Vt.IntArray.FromNumpy(ji.reshape(-1)))
        bapi.CreateJointWeightsPrimvar(False, 4).Set(Vt.FloatArray.FromNumpy(jw.reshape(-1)))
        bapi.CreateGeomBindTransformAttr(Gf.Matrix4d(1.0))
        mesh_base[key] = (cp, G)
        return mesh_base[key]
    def var_mesh(bn, li, kind, vi, pm):
        key = (bn, li, kind, vi, pm)
        if key in mesh_var: return mesh_var[key]
        b = base_mesh(bn, li, kind)
        if b is None: mesh_var[key] = None; return None
        bp, G = b
        V = A['variants'][vi]; sname = V.get('set') or 'peds24'
        cp = f'/_peds_class/v_{ident(bn)}_l{li}_{kind}_{vi}_{pm}'
        prim = st.CreateClassPrim(cp)
        prim.GetReferences().AddInternalReference(bp)
        m = UsdGeom.Mesh(prim)
        keep = keep_faces(G, pm)
        idx = G['index'].reshape(-1, 3)[keep]
        lay, cls, part, tile = face_layers(G, V, kind)
        lay, cls = lay[keep], cls[keep]
        m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(idx), 3, np.int32)))
        m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(idx.reshape(-1).astype(np.int32)))
        for (L, c) in sorted({(int(a), int(b_)) for a, b_ in zip(lay, cls)}):
            faces = np.nonzero((lay == L) & (cls == c))[0].astype(np.int32)
            ss = UsdGeom.Subset.Define(st, f'{cp}/L{L:03d}_c{c}')
            ss.CreateElementTypeAttr('face'); ss.CreateFamilyNameAttr('materialBind'); ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces))
            UsdShade.MaterialBindingAPI.Apply(ss.GetPrim()).Bind(look(sname, L, 'hair' if kind == 'hair' else 'opaque', c))
        mesh_var[key] = cp
        return cp
    n = 0
    for w in walkers:
        B = A['bodies'][w['body']]
        pr, M, q, t, v, fd = locals_of(w, B, nF)
        rp = f'/World/Peds/w{w["id"]:08x}_{w["vi"]}'
        root = UsdSkel.Root.Define(st, rp)
        xf = UsdGeom.Xformable(root).AddTransformOp()
        visA = root.CreateVisibilityAttr()
        for f in range(nF):
            xf.Set(Gf.Matrix4d(*M[f].T.flatten().tolist()), Usd.TimeCode(f))
            visA.Set(UsdGeom.Tokens.inherited if pr[f] else UsdGeom.Tokens.invisible, Usd.TimeCode(f))
        root.GetPrim().SetCustomData({'nyc:seed': int(w['id']), 'nyc:variant': int(w['vi']), 'nyc:body': w['body'], 'nyc:lod': int(w['lod']), 'nyc:props': int(w['pm']),
                                      'nyc:tints': Vt.FloatArray([float(x) for x in w['tint']]), 'nyc:seat': int(w['seat'])})
        scp, paths = skel_class(w['body'])
        sk_prim = st.DefinePrim(rp + '/Skel', 'Skeleton'); sk_prim.GetReferences().AddInternalReference(scp)
        an = UsdSkel.Animation.Define(st, rp + '/Anim')
        an.CreateJointsAttr(Vt.TokenArray(paths))
        tr = an.CreateTranslationsAttr(); ro = an.CreateRotationsAttr()
        an.CreateScalesAttr(Vt.Vec3hArray([Gf.Vec3h(1, 1, 1)] * len(paths)))
        for f in range(nF):
            if not pr[f] and not (f == 0 or pr[f - 1]): continue   # held frames: one sample at the gap's start is enough
            tr.Set(Vt.Vec3fArray.FromNumpy(t[f].astype(np.float32)), Usd.TimeCode(f))
            ro.Set(Vt.QuatfArray.FromNumpy(np.ascontiguousarray(q[f], dtype=np.float32)), Usd.TimeCode(f))   # memory order x, y, z, w
        UsdSkel.BindingAPI.Apply(sk_prim).CreateAnimationSourceRel().SetTargets([an.GetPath()])
        for kind in ('opaque', 'hair'):
            cp = var_mesh(w['body'], w['lod'], kind, w['vi'], w['pm'])
            if cp is None: continue
            mp = st.DefinePrim(rp + ('/Body' if kind == 'opaque' else '/Hair'), 'Mesh'); mp.GetReferences().AddInternalReference(cp)
            UsdSkel.BindingAPI.Apply(mp).CreateSkeletonRel().SetTargets([sk_prim.GetPath()])
            UsdGeom.PrimvarsAPI(mp).CreatePrimvar('nyc_tint', Sdf.ValueTypeNames.Float4Array, UsdGeom.Tokens.constant).Set(Vt.Vec4fArray([Gf.Vec4f(*[float(x) for x in w['tint'][j * 4:j * 4 + 4]]) for j in range(3)]))
        n += 1
    st.GetRootLayer().customLayerData = {'shot': shot, 'frames': nF, 'walkers': n, 'source': 'BoundlessNYC crowd (BX-PEDS)'}
    st.GetRootLayer().Save()
    if take_root and os.path.exists(os.path.join(OUT, take_root)):   # the take root with the walkers, for any USD renderer
        src = Usd.Stage.Open(os.path.join(OUT, take_root), load=Usd.Stage.LoadNone)
        r = Usd.Stage.CreateNew(os.path.join(OUT, f'{shot}_peds.usda'))
        r.GetRootLayer().subLayerPaths = [fn, take_root]
        UsdGeom.SetStageUpAxis(r, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(r, 1.0)
        r.SetStartTimeCode(0); r.SetEndTimeCode(nF - 1); r.SetTimeCodesPerSecond(fps); r.SetFramesPerSecond(fps)
        cd = dict(src.GetRootLayer().customLayerData); cd['peds'] = fn
        r.GetRootLayer().customLayerData = cd
        r.GetRootLayer().Save()
    return {'file': fn, 'walkers': n, 'looks': len(looks), 'mesh_classes': len([v for v in mesh_var.values() if v])}


def build(IN, OUT, shots=None, usd=True):
    if not os.path.exists(os.path.join(IN, 'peds', 'assets.json')): log('no walkers in this harvest (peds/assets.json)'); return {}
    mp = os.path.join(IN, 'manifest.json')
    if os.path.exists(mp): man = json.load(open(mp))
    else:   # a harvest still running (its manifest is written last): the shots from the walkers' files
        man = {'fps': 30, 'flags': '', 'shots': {f[5:-5]: {} for f in os.listdir(IN) if f.startswith('peds_') and f.endswith('.json')}}
    t0 = time.time()
    unpack_textures()
    A = load_assets(IN)
    out = {}
    for shot in (shots or list(man.get('shots', {}).keys())):
        if not os.path.exists(os.path.join(IN, f'peds_{shot}.json')): continue
        t1 = time.time()
        walkers, nF = read_walkers(IN, shot, A)
        r = write_npz(OUT, shot, walkers, A, nF, man, IN)
        r['npz_secs'] = round(time.time() - t1, 1)
        if usd:
            t2 = time.time()
            r['usd'] = write_usd(OUT, shot, walkers, A, nF, man, IN, take_root=f'{shot}.usda')
            r['usd_secs'] = round(time.time() - t2, 1)
        out[shot] = r
        log(shot, json.dumps(r))
    log(f'done in {time.time() - t0:.1f}s')
    return out


# ---------------------------------------------------------------- usd_write.py hook
def finish(ctx):
    if '--nopeds' in (ctx.argv or []): return None
    usd = '--peds-usd' not in ctx.argv or ctx.argv[ctx.argv.index('--peds-usd') + 1] != '0'
    shots = [s for s in (ctx.A.shots.split(',') if getattr(ctx.A, 'shots', '') else [])] or None
    r = build(ctx.IN, ctx.OUT, shots, usd)
    ctx.stats['peds'] = r
    return r


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--shots', default=''); ap.add_argument('--pedtex', default=None); ap.add_argument('--peds-usd', default='1')
    a = ap.parse_args()
    if a.pedtex: TEXCACHE = a.pedtex
    os.makedirs(a.out, exist_ok=True)
    build(a.inp, a.out, [s for s in a.shots.split(',') if s] or None, a.peds_usd != '0')
