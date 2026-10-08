# BX-TREES (AR34 BX, 2026-10-02; TREEUE 2026-10-07): the tree asset set in the export. The web's tree pools
# (tree<F><v>Trunk / tree<F><v>Crown, F the species form, v '' / '2' a mature variant, '9' the young sub-form) are replaced by
# the species prototypes of the asset set (tools/ar34/bxtrees), on the Trunk pool's matrices unchanged (the Crown pool
# carries the same matrices and is dropped). Forms the set does not have keep the web's pools.
#
# Two asset sets:
#   bxtrees   (BX-TREES, the first set: <F>_m / <F>_m2 / <F>_y, alpha-card leaves) one prototype per pool;
#   bxtrees2  (TREEUE, the default since 2026-10-07: set.json beside the meshes) prototypes per INSTANCE: the size from the
#             pool and the instance's own scale (young for the suffix-9 pools; large for a mature pool's instance scaled
#             set.json large_scale (1.2) and up, where the set has a large tree; mature otherwise) and the variant from a
#             hash of the pool and the instance's index (the '2' pools hash with another salt). Geometry leaves (a star
#             polygon round each leaf, the alpha cutting its outline; set.json leaf_cut 'near': UE drops the cut past
#             ~22 m) for the broadleaf species, alpha cards for the compound ones ('mask'), a per-vertex st1 (leaf random,
#             crown depth), the ginkgo. Matrices unchanged, so Cycles and UE draw the same trees.
#
# As a usd_write.py hook (BX-SEQ's list: 'usd_trees'):
#   pool(ctx, stage, path, p)  a covered tree pool: authored here (Trunk) or dropped (Crown), returns True
#   layers(ctx, shot)          the shot's trees layer trees_<shot>.usdc (one PointInstancer per pool, each instance at
#                              its LOD by its distance to the shot's camera path) and the shared geometry layer
#                              (bxtrees_geo.usdc / bxtrees2_geo.usdc: the prototypes as class prims, referenced from each
#                              instancer's protos/, and their materials)
# Standalone, on an existing export:
#   uv run --no-project --with usd-core --with numpy python usd_trees.py --in <harvest> --usd <usd dir> --out <dir>
#       [--bxt-lod 400,800 | 60,150 | full] [--bxt-assets <set dir>]       (key-frame roots that sublayer a trees layer)
#   ... usd_trees.py --retake <usd dir>/<shot>.usda --out <dir> [--bxt-assets <set dir>] [--bxt-lod ...]
#       (TREEUE: a copy of a take's root whose trees layers are this set's: <dir>/<shot>.usda, trees2_<shot>.usdc,
#       bxtrees2_geo.usdc, textures/bxtrees2/; the take's other layers stay where they are, by absolute path; the web's
#       pools of the forms the old trees layer left (the ginkgo) are switched off)
# LODs: lod0 the full tree, lod1 (limbs to the second order, a quarter of the leaves at twice the size), imp (three baked
# cards, first set only). For film the default keeps lod0 to 400 m from the lens path and lod1 to 800 m; `--bxt-lod 60,150`
# is the web's split, `full` lod0 everywhere.
# Materials: UsdPreviewSurface named bxt_leaf_<F> / bxt_bark_<key> (textures linked into <out>/textures/<set dir name>); in
# Blender blender_trees.py rebuilds them by name, in UE ue_trees.py.
import json, math, os, re, sys, shutil, zlib
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt

ASSETS = os.environ.get('BXTREES_ASSETS', '/data0/projectnyc_aux/assets/bxtrees2')
BARK_OF = {'P': 'plane', 'H': 'willow', 'Q': 'oak', 'Z': 'zelkova', 'R': 'pear', 'L': 'linden', 'M': 'maple', 'S': 'linden', 'Y': 'cherry', 'X': 'cherry', 'W': 'oak'}
BARK_TINT = {'plane': (0.88, 0.93, 1.06), 'willow': (0.49, 0.51, 0.56), 'oak': (1.15, 1.3, 1.6), 'zelkova': (0.48, 0.59, 0.74), 'pear': (0.46, 0.52, 0.9), 'linden': (0.6, 0.56, 0.54), 'maple': (1.4, 1.6, 1.6), 'cherry': (0.59, 0.62, 0.79)}   # (linear, per channel: each scan's mean to a bark albedo, plane 0.30 / 0.28 / 0.25, the others ~0.12-0.16)
POOL_RE = re.compile(r'^tree([A-Z])(\d?)(Trunk|Crown)$')
LODS = ('lod0', 'lod1', 'imp')

def _opt(argv, name, d=None):
    if '--' + name in argv:
        i = argv.index('--' + name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d

_sets = {}
def asset_set(assets):
    """the set's tables: gen 1 (the module's) or gen 2 (set.json), and the trees it has per (form, size)"""
    if assets in _sets: return _sets[assets]
    S = {'gen': 1, 'bark_of': dict(BARK_OF), 'bark_tint': dict(BARK_TINT), 'leaf_cut': {}, 'large_scale': 1e9, 'by': {}}
    try:
        j = json.load(open(os.path.join(assets, 'set.json')))
        S.update(gen=j.get('gen', 2), large_scale=float(j.get('large_scale', 1.2)), leaf_cut=j.get('leaf_cut', {}))
        S['bark_of'].update(j.get('bark_of', {})); S['bark_tint'].update({k: tuple(v) for k, v in j.get('bark_tint', {}).items()})
    except Exception:
        pass
    if S['gen'] >= 2:
        for f in sorted(os.listdir(os.path.join(assets, 'npz'))):
            m = re.match(r'^([A-Z])_([yml])(\d+)_lod0\.npz$', f)
            if m: S['by'].setdefault((m.group(1), m.group(2)), []).append(f'{m.group(1)}_{m.group(2)}{m.group(3)}')
    S['name'] = os.path.basename(os.path.normpath(assets))
    _sets[assets] = S
    return S

def tree_id(F, v, assets=ASSETS):
    """the first set's tree for a pool: <F>_y for the young sub-form, <F>_m otherwise; None when the set lacks it. The
    second set's: a list per instance (tree_ids)"""
    if asset_set(assets)['gen'] >= 2:
        S = asset_set(assets)['by']
        return f'{F}_*' if (F, 'm') in S or (F, 'y') in S else None
    if v == '2' and os.path.exists(f'{assets}/npz/{F}_m2_lod0.npz'): return f'{F}_m2'   # the second mature variant
    tid = f"{F}_{'y' if v == '9' else 'm'}"
    if not os.path.exists(f'{assets}/npz/{tid}_lod0.npz'):
        if v == '9' and os.path.exists(f'{assets}/npz/{F}_m_lod0.npz'): return f'{F}_m'
        return None
    return tid

def tree_ids(F, v, matrices, assets=ASSETS):
    """the second set's tree per instance: the size from the pool (suffix 9 young) and the instance's scale (large from
    set.json large_scale), the variant from a hash of the pool and the instance's index"""
    A = asset_set(assets)
    if A['gen'] < 2:
        t = tree_id(F, v, assets); return [t] * (len(matrices) // 16 if not hasattr(matrices[0], '__len__') else len(matrices))
    M = np.asarray(matrices, np.float64).reshape(-1, 16)
    sy = np.linalg.norm(M[:, 4:7], axis=1)   # (column 1: the instance's scale along its up axis)
    out = []
    salt = zlib.crc32(f'tree{F}{v}'.encode())
    for i in range(len(M)):
        if v == '9': sizes = ['y', 'm']
        elif sy[i] >= A['large_scale']: sizes = ['l', 'm']
        else: sizes = ['m', 'l', 'y']
        vs = next((A['by'][(F, s)] for s in sizes if (F, s) in A['by']), None)
        h = zlib.crc32(np.int64(i).tobytes(), salt)
        out.append(vs[h % len(vs)])
    return out

def decompose(Ms):
    """N x 16 three.js column-major matrices -> positions, quaternions (w, x, y, z), scales (usd_write.py's convention)"""
    M = np.asarray(Ms, dtype=np.float64).reshape(-1, 4, 4)
    pos = M[:, 3, :3]
    cols = M[:, :3, :3]
    sc = np.linalg.norm(cols, axis=2)
    R = cols / (sc[:, :, None] + 1e-12)
    neg = np.linalg.det(R) < 0
    sc[neg, 0] *= -1; R[neg, 0] *= -1
    Rm = np.transpose(R, (0, 2, 1))
    q = np.zeros((len(Rm), 4))
    for k in range(len(Rm)):
        m = Rm[k]; tr = m[0, 0] + m[1, 1] + m[2, 2]
        if tr > 0:
            s = math.sqrt(tr + 1.0) * 2; q[k] = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q[k] = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q[k] = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q[k] = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
    return pos, q, sc

class Writer:
    def __init__(self, out_dir, assets=ASSETS):
        self.OUT, self.assets = out_dir, assets
        self.A = asset_set(assets)
        self.tex_done = {}
        self.stats = {'set': self.A['name'], 'pools': 0, 'dropped': 0, 'instances': 0, 'by_lod': {k: 0 for k in LODS}, 'protos': 0, 'trees': {}}

    def tex(self, name):
        """link an asset texture into <out>/textures/<set>; returns the layer-relative path"""
        rel = f"textures/{self.A['name']}/{name}"
        if rel not in self.tex_done:
            src = f'{self.assets}/{"imp" if name.startswith("imp_") else "tex"}/{name[4:] if name.startswith("imp_") else name}'
            dst = os.path.join(self.OUT, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            fresh = not os.path.lexists(dst)
            if not fresh:   # a file of that name from an earlier write is kept only if it is this one (BX-QA)
                try: fresh = not os.path.samefile(src, dst)
                except OSError: fresh = True
                if fresh: os.unlink(dst)
            if fresh:
                try: os.link(src, dst)
                except OSError: shutil.copyfile(src, dst)
            self.tex_done[rel] = 1
        return './' + rel

    def _reader(self, st, mpath, name, file, cs, st_out, scale=None, bias=None):
        t = UsdShade.Shader.Define(st, f'{mpath}/{name}')
        t.CreateIdAttr('UsdUVTexture')
        t.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(file)
        t.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set(cs)
        t.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set('repeat'); t.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set('repeat')
        if scale is not None: t.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*scale))
        if bias is not None: t.CreateInput('bias', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(*bias))
        t.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(st_out)
        return t

    def material(self, st, kind, key):
        mpath = f'/World/BXTrees/Looks/bxt_{kind}_{key}'
        if st.GetPrimAtPath(mpath): return mpath
        mat = UsdShade.Material.Define(st, mpath)
        sh = UsdShade.Shader.Define(st, f'{mpath}/surf'); sh.CreateIdAttr('UsdPreviewSurface')
        rd = UsdShade.Shader.Define(st, f'{mpath}/st'); rd.CreateIdAttr('UsdPrimvarReader_float2')
        rd.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
        st_out = rd.CreateOutput('result', Sdf.ValueTypeNames.Float2)
        if kind == 'leaf':
            c = self._reader(st, mpath, 'col', self.tex(f'{key}_leaf_col.png'), 'sRGB', st_out)
            n = self._reader(st, mpath, 'nrm', self.tex(f'{key}_leaf_nrm.png'), 'raw', st_out, (2, 2, 2, 1), (-1, -1, -1, 0))
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(c.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            if self.A['leaf_cut'].get(key, 'mask') != 'opaque':   # (TREEUE: a set.json 'opaque' leaf draws without the alpha)
                a = self._reader(st, mpath, 'alpha', self.tex(f'{key}_leaf_col.png'), 'sRGB', st_out)
                sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).ConnectToSource(a.CreateOutput('a', Sdf.ValueTypeNames.Float))
                sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
            sh.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(n.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.45)
        elif kind == 'bark':
            tint = self.A['bark_tint'].get(key, (0.8, 0.8, 0.8))
            c = self._reader(st, mpath, 'col', self.tex(f'bark_{key}_col.jpg'), 'sRGB', st_out, (tint[0], tint[1], tint[2], 1))
            n = self._reader(st, mpath, 'nrm', self.tex(f'bark_{key}_nrm.jpg'), 'raw', st_out, (2, 2, 2, 1), (-1, -1, -1, 0))
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(c.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            sh.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(n.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            if os.path.exists(f'{self.assets}/tex/bark_{key}_rough.jpg'):
                r = self._reader(st, mpath, 'rough', self.tex(f'bark_{key}_rough.jpg'), 'raw', st_out)
                sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).ConnectToSource(r.CreateOutput('r', Sdf.ValueTypeNames.Float))
            else: sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.85)
        else:   # an impostor's baked views
            c = self._reader(st, mpath, 'col', self.tex(f'imp_{key}.png'), 'sRGB', st_out)
            a = self._reader(st, mpath, 'alpha', self.tex(f'imp_{key}.png'), 'sRGB', st_out)
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(c.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).ConnectToSource(a.CreateOutput('a', Sdf.ValueTypeNames.Float))
            sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
            sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.8)
        mat.CreateSurfaceOutput().ConnectToSource(sh.CreateOutput('surface', Sdf.ValueTypeNames.Token))
        return mpath

    def proto(self, st, tid, lod):
        """one Mesh per tree and LOD (bark and leaves in one mesh, a material subset each): an abstract class prim
        /_bxtrees/<tid>_<lod> in the shared geometry layer (never drawn by itself; the instancers reference it, as
        usd_write.py's /_geo)"""
        path = f'/_bxtrees/{tid}_{lod}'
        if st.GetPrimAtPath(path): return path
        prim = st.CreateClassPrim(path); prim.SetTypeName('Mesh')
        Z = np.load(f'{self.assets}/npz/{tid}_{lod}.npz')
        parts = [k for k in ('bark', 'leaf', 'imp') if f'{k}_P' in Z]
        P, N, UV, UV1, I, faces, base, f0 = [], [], [], [], [], {}, 0, 0
        has1 = all(f'{k}_UV1' in Z for k in parts)
        for k in parts:
            P.append(Z[f'{k}_P']); N.append(Z[f'{k}_N']); UV.append(Z[f'{k}_UV']); I.append(Z[f'{k}_I'].astype(np.int64) + base)
            if has1: UV1.append(Z[f'{k}_UV1'])
            nt = len(Z[f'{k}_I']); faces[k] = np.arange(f0, f0 + nt, dtype=np.int32); f0 += nt; base += len(Z[f'{k}_P'])
        P, N, UV, I = np.concatenate(P), np.concatenate(N), np.concatenate(UV), np.concatenate(I)
        m = UsdGeom.Mesh(prim)
        m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(P.astype(np.float32))))
        m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(I), 3, dtype=np.int32)))
        m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(np.ascontiguousarray(I.reshape(-1).astype(np.int32))))
        m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(N.astype(np.float32)))); m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
        m.CreateDoubleSidedAttr(True)
        pv = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(UV.astype(np.float32))))
        if has1:   # (TREEUE: the leaf's random value and its crown depth; UE imports it as UV 1, Blender as the st1 map)
            pv1 = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st1', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
            pv1.Set(Vt.Vec2fArray.FromNumpy(np.ascontiguousarray(np.concatenate(UV1).astype(np.float32))))
        m.CreateExtentAttr([Gf.Vec3f(*map(float, P.min(0))), Gf.Vec3f(*map(float, P.max(0)))])
        F = tid.split('_')[0]
        for k in parts:
            mp = self.material(st, k, F if k == 'leaf' else self.A['bark_of'].get(F, 'oak') if k == 'bark' else tid)
            ss = UsdGeom.Subset.Define(st, f'{path}/{k}')
            ss.CreateElementTypeAttr(UsdGeom.Tokens.face); ss.CreateFamilyNameAttr('materialBind')
            ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces[k]))
            UsdShade.MaterialBindingAPI.Apply(ss.GetPrim()).Bind(UsdShade.Material(st.GetPrimAtPath(mp)))
        self.stats['protos'] += 1
        return path

    def instancer(self, st, base, tid, matrices, cam_xz, lod_split, geo=None):
        """one PointInstancer per pool, protoIndices by tree and LOD (`tid` one tree id or one per instance; the LOD by the
        instance's distance to the camera path in plan); its prototypes are children (protos/<tid>_<lod>) referencing the
        class prims of the geometry layer `geo`"""
        geo = geo or st
        Ms = np.asarray(matrices, np.float64).reshape(-1, 16)
        pos, q, sc = decompose(Ms)
        tids = [tid] * len(pos) if isinstance(tid, str) else list(tid)
        if lod_split is None or cam_xz is None or not len(cam_xz):
            li = np.zeros(len(pos), np.int32)
        else:
            d = np.sqrt(((pos[:, None, [0, 2]] - cam_xz[None, :, :]) ** 2).sum(-1)).min(axis=1)
            li = np.where(d < lod_split[0], 0, np.where(d < lod_split[1], 1, 2)).astype(np.int32)
        pi = UsdGeom.PointInstancer.Define(st, f'/World/BXTrees/{base}')
        keys, idx = [], []
        for k in range(len(pos)):
            have = [lod for lod in LODS if os.path.exists(f'{self.assets}/npz/{tids[k]}_{lod}.npz')]
            key = (tids[k], have[min(int(li[k]), len(have) - 1)])
            if key not in keys: keys.append(key)
            idx.append(keys.index(key))
            self.stats['by_lod'][key[1]] += 1
            self.stats['trees'][key[0]] = self.stats['trees'].get(key[0], 0) + 1
        protos = []
        for t, lod in keys:
            cls = self.proto(geo, t, lod)
            pp = f'/World/BXTrees/{base}/protos/{t}_{lod}'
            st.DefinePrim(pp, 'Mesh').GetReferences().AddInternalReference(cls)
            protos.append(pp)
        pi.CreatePrototypesRel().SetTargets([Sdf.Path(p) for p in protos])
        pi.CreateProtoIndicesAttr(Vt.IntArray.FromNumpy(np.array(idx, np.int32)))
        pi.CreatePositionsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(pos.astype(np.float32))))
        pi.CreateOrientationsAttr(Vt.QuathArray([Gf.Quath(float(w), float(x), float(y), float(z)) for w, x, y, z in q]))
        pi.CreateScalesAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(sc.astype(np.float32))))
        pi.CreateIdsAttr(Vt.Int64Array.FromNumpy(np.arange(len(pos), dtype=np.int64)))
        self.stats['pools'] += 1; self.stats['instances'] += len(pos)
        return pi

def cam_path(IN, info):
    try:
        cams = json.load(open(os.path.join(IN, info['camFile'])))
        return np.array([[c['m'][12], c['m'][14]] for c in cams], np.float64)
    except Exception:
        return None

def lod_split_of(s):
    # (film default: lod0 to 400 m from the lens path, lod1 to 800 m, the impostor past it, as the export notes advise for
    # the far ring; lod1's doubled leaves read as coarse 4 px flecks at 200 m in a 2560 px frame)
    if s in (None, ''): s = '400,800'
    if s == 'full': return None
    a, b = [float(x) for x in s.split(',')]
    return (a, b)

def geo_name(assets):
    return 'bxtrees_geo.usdc' if asset_set(assets)['gen'] < 2 else f"{asset_set(assets)['name']}_geo.usdc"

def pool_trees(F, v, mats, assets):
    """the pool's tree (first set) or trees per instance (second set)"""
    return tree_id(F, v, assets) if asset_set(assets)['gen'] < 2 else tree_ids(F, v, mats, assets)

# ---------------------------------------------------------------- the usd_write.py hook API (BX-SEQ, docs/notes/ar34-bx-seq.md)
_covered = {}
def setup(ctx):
    _covered.clear()
    ctx.bxt_assets = _opt(ctx.argv, 'bxt-assets', ASSETS) if hasattr(ctx, 'argv') else ASSETS

def pool(ctx, stage, path, p):
    m = POOL_RE.match(p.get('name', ''))
    if not m: return False
    F, v, part = m.groups()
    assets = getattr(ctx, 'bxt_assets', ASSETS)
    tid = tree_id(F, v, assets)
    if not tid: return False
    # (per static layer: usd_write.py writes one per shot when the harvest has the shot's own static capture)
    fn = os.path.basename(stage.GetRootLayer().identifier)
    if part == 'Trunk': _covered.setdefault(fn, {})['tree' + F + v] = (pool_trees(F, v, p['matrices'], assets), p['matrices'])
    return True   # both pools of a covered tree: the trees layer draws it

_geo = {}
def geo_stage(out, assets=ASSETS):
    """the shared geometry layer of an output directory: the prototypes (class prims) and their materials"""
    key = (out, geo_name(assets))
    if key not in _geo:
        g = Usd.Stage.CreateNew(os.path.join(out, geo_name(assets)))
        UsdGeom.SetStageUpAxis(g, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(g, 1.0)
        UsdGeom.Scope.Define(g, '/World'); UsdGeom.Scope.Define(g, '/World/BXTrees'); UsdGeom.Scope.Define(g, '/World/BXTrees/Looks')
        _geo[key] = g
    return _geo[key]

def new_layer(path):
    st = Usd.Stage.CreateNew(path)
    UsdGeom.SetStageUpAxis(st, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(st, 1.0)
    UsdGeom.Xform.Define(st, '/World'); UsdGeom.Scope.Define(st, '/World/BXTrees')
    return st

def layers(ctx, shot):
    sfn = f'static_{shot}.usdc' if f'static_{shot}.usdc' in _covered else 'static.usdc'
    cov = _covered.get(sfn) or {}
    if not cov: return []
    fn = f'trees_{shot}.usdc'
    assets = getattr(ctx, 'bxt_assets', ASSETS)
    st = new_layer(os.path.join(ctx.OUT, fn))
    g = geo_stage(ctx.OUT, assets)
    w = Writer(ctx.OUT, assets)
    cxz = cam_path(ctx.IN, ctx.man['shots'][shot])
    split = lod_split_of(_opt(getattr(ctx, 'argv', []), 'bxt-lod', None))
    for base, (tid, mats) in sorted(cov.items()):
        w.instancer(st, base, tid, mats, cxz, split, geo=g)
    st.GetRootLayer().Save(); g.GetRootLayer().Save()
    ctx.stats.setdefault('bxtrees', {})[shot] = w.stats
    return [fn, geo_name(assets)]

# ---------------------------------------------------------------- standalone
def covered_pools(S, assets):
    covered, dropped = {}, []
    for p in S['pools']:
        m = POOL_RE.match(p['name'])
        if not m: continue
        F, v, part = m.groups()
        if not tree_id(F, v, assets): continue
        if part == 'Trunk': covered['tree' + F + v] = (pool_trees(F, v, p['matrices'], assets), p['matrices'])
        dropped.append(p['name'])
    return covered, dropped

def drop_web_pools(st, static_usd, dropped):
    """the web's pools of the covered trees (and their colour / shear splits) off in this layer"""
    src = Usd.Stage.Open(static_usd, load=Usd.Stage.LoadNone)
    pools = src.GetPrimAtPath('/World/Pools')
    off = 0
    for ch in (pools.GetChildren() if pools else []):
        nm = ch.GetName()
        if any(nm == d or nm.startswith(d + '_c') or nm.startswith(d + '_x') for d in dropped):
            st.OverridePrim(ch.GetPath()).SetActive(False); off += 1
    return off

def retake(argv):
    """TREEUE: a take root whose trees layers are this set's (see the header)"""
    root = os.path.abspath(_opt(argv, 'retake')); OUT = os.path.abspath(_opt(argv, 'out'))
    assets = _opt(argv, 'bxt-assets', ASSETS)
    split = lod_split_of(_opt(argv, 'bxt-lod', None))
    os.makedirs(OUT, exist_ok=True)
    udir = os.path.dirname(root)
    rl = Sdf.Layer.FindOrOpen(root)
    data = dict(rl.customLayerData)
    shot = data.get('shot') or os.path.splitext(os.path.basename(root))[0]
    IN = _opt(argv, 'in', data.get('harvest'))
    man = json.load(open(os.path.join(IN, 'manifest.json')))
    sj = os.path.join(IN, f'static_{shot}.json')
    S = json.load(open(sj if os.path.exists(sj) else os.path.join(IN, 'static.json')))
    covered, dropped = covered_pools(S, assets)
    fn = f'trees2_{shot}.usdc' if asset_set(assets)['gen'] >= 2 else f'trees_{shot}.usdc'
    for f in (fn, geo_name(assets)):
        if os.path.exists(os.path.join(OUT, f)): os.remove(os.path.join(OUT, f))
    _geo.pop((OUT, geo_name(assets)), None)
    st = new_layer(os.path.join(OUT, fn))
    g = geo_stage(OUT, assets)
    subs = list(rl.subLayerPaths)
    stat = next((s for s in subs if s.startswith('static')), 'static.usdc')
    off = drop_web_pools(st, os.path.join(udir, stat), dropped)
    w = Writer(OUT, assets)
    cxz = cam_path(IN, man['shots'][shot])
    for base, (tid, mats) in sorted(covered.items()):
        w.instancer(st, base, tid, mats, cxz, split, geo=g)
    st.GetRootLayer().Save(); g.GetRootLayer().Save()
    w.stats['dropped'] = off
    # the root: the take's, with its trees layers swapped for these (the others by absolute path)
    rp = os.path.join(OUT, os.path.basename(root))
    if os.path.exists(rp): os.remove(rp)
    nr = Sdf.Layer.CreateNew(rp)
    nr.TransferContent(rl)
    new_subs = []
    for s in subs:
        b = os.path.basename(s)
        if re.match(r'^trees2?_.*\.usdc$', b): new_subs.append(fn); continue
        if re.match(r'^bxtrees2?_geo\.usdc$', b): new_subs.append(geo_name(assets)); continue
        new_subs.append(s if os.path.isabs(s) else os.path.join(udir, s))
    if fn not in new_subs: new_subs.insert(0, fn)
    if geo_name(assets) not in new_subs: new_subs.insert(1, geo_name(assets))
    nr.subLayerPaths = new_subs
    cld = dict(nr.customLayerData); cld['treeue'] = {'set': asset_set(assets)['name'], 'from': root}
    nr.customLayerData = cld
    nr.Save()
    w.stats['root'] = rp; w.stats['layers'] = new_subs
    # the take's side files the renderers read beside the root (peds_<shot>.npz, bxwin_usd.json, bx_fix.json, the
    # textures the other layers name relative to the root's folder): linked, never copied
    linked = 0
    for nm in os.listdir(udir):
        src, dst = os.path.join(udir, nm), os.path.join(OUT, nm)
        if nm == 'textures' and os.path.isdir(src):
            for sub in os.listdir(src):
                d2 = os.path.join(OUT, 'textures', sub)
                if not os.path.lexists(d2): os.symlink(os.path.join(src, sub), d2); linked += 1
            continue
        if os.path.lexists(dst) or nm == os.path.basename(root) or re.match(r'^(trees2?_.*|bxtrees2?_geo)\.usdc$', nm): continue
        # (the take's other layers too: tools read some beside the root, e.g. blender_nodes.py's looks.usdc)
        os.symlink(src, dst); linked += 1
    w.stats['side_files_linked'] = linked
    json.dump(w.stats, open(os.path.join(OUT, f'trees_stats_{shot}.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in w.stats.items() if k != 'layers'}, indent=1))

def main(argv):
    if _opt(argv, 'retake'): return retake(argv)
    IN = _opt(argv, 'in'); USD = _opt(argv, 'usd'); OUT = _opt(argv, 'out')
    assets = _opt(argv, 'bxt-assets', ASSETS)
    split = lod_split_of(_opt(argv, 'bxt-lod', None))
    os.makedirs(OUT, exist_ok=True)
    man = json.load(open(os.path.join(IN, 'manifest.json')))
    S = json.load(open(os.path.join(IN, 'static.json')))
    covered, dropped = covered_pools(S, assets)
    report = {}
    for shot, info in man['shots'].items():
        fn = f'trees_{shot}.usdc'
        st = new_layer(os.path.join(OUT, fn))
        g = geo_stage(OUT, assets)
        off = drop_web_pools(st, os.path.join(USD, 'static.usdc'), dropped)
        w = Writer(OUT, assets)
        cxz = cam_path(IN, info)
        for base, (tid, mats) in sorted(covered.items()):
            w.instancer(st, base, tid, mats, cxz, split, geo=g)
        st.GetRootLayer().Save(); g.GetRootLayer().Save()
        w.stats['dropped'] = off
        report[shot] = w.stats
        for K in info['key']:
            rfn = f"{shot}_f{K['frame']:03d}.usda"
            old = Usd.Stage.Open(os.path.join(USD, rfn), load=Usd.Stage.LoadNone)
            r = Usd.Stage.CreateNew(os.path.join(OUT, rfn))
            r.GetRootLayer().subLayerPaths = [fn, geo_name(assets), os.path.abspath(os.path.join(USD, rfn))]
            UsdGeom.SetStageUpAxis(r, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(r, 1.0)
            r.SetStartTimeCode(old.GetStartTimeCode()); r.SetEndTimeCode(old.GetEndTimeCode())
            r.SetTimeCodesPerSecond(old.GetTimeCodesPerSecond()); r.SetFramesPerSecond(old.GetFramesPerSecond())
            r.GetRootLayer().customLayerData = dict(old.GetRootLayer().customLayerData)
            r.GetRootLayer().Save()
    json.dump(report, open(os.path.join(OUT, 'trees_stats.json'), 'w'), indent=1)
    print(json.dumps(report, indent=1))

if __name__ == '__main__':
    main(sys.argv[1:])
