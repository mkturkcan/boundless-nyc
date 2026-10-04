# BX-TREES (AR34 BX, 2026-10-02): the tree asset set in the export. The web's tree pools (tree<F><v>Trunk / tree<F><v>Crown,
# F the species form, v '' / '2' a mature variant, '9' the young sub-form) are replaced by the species prototypes of the
# asset set (tools/ar34/bxtrees: <F>_m mature, <F>_y young), on the Trunk pool's matrices unchanged (the Crown pool carries
# the same matrices and is dropped). Forms the set does not have yet keep the web's pools.
#
# As a usd_write.py hook (BX-SEQ's list: 'usd_trees'):
#   pool(ctx, stage, path, p)  a covered tree pool: authored here (Trunk) or dropped (Crown), returns True
#   layers(ctx, shot)          the shot's trees layer trees_<shot>.usdc (one PointInstancer per pool, each instance at
#                              its LOD by its distance to the shot's camera path) and the shared bxtrees_geo.usdc (the
#                              prototypes as class prims, referenced from each instancer's protos/, and their materials)
# Standalone, on an existing export (writes a new root per key frame that sublayers the trees layer over the old root):
#   uv run --no-project --with usd-core --with numpy python usd_trees.py --in <harvest> --usd <usd dir> --out <dir>
#       [--bxt-lod 400,800 | 60,150 | full] [--bxt-assets /data0/projectnyc_aux/assets/bxtrees]
# LODs (the asset set's): lod0 the full tree (branches to the twigs, a card per leaf), lod1 (limbs to the second order, a
# quarter of the leaves at twice the size), imp (three baked cards). For film the default keeps lod0 to 400 m from the lens
# path and lod1 to 800 m (instancing makes lod0 cheap; a tree at 60 m is ~400 px wide in a 2560 px frame); `--bxt-lod 60,150`
# is the web's split, `full` lod0 everywhere.
# Materials: UsdPreviewSurface named bxt_leaf_<F> / bxt_bark_<key> (textures linked into <out>/textures/bxtrees); in Blender
# blender_trees.py rebuilds them by name (translucency, the paler underside, the bark's relief).
import json, math, os, re, sys, shutil
import numpy as np
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt

ASSETS = os.environ.get('BXTREES_ASSETS', '/data0/projectnyc_aux/assets/bxtrees')
BARK_OF = {'P': 'plane', 'H': 'willow', 'Q': 'oak', 'Z': 'zelkova', 'R': 'pear', 'L': 'linden', 'M': 'maple', 'S': 'linden', 'Y': 'cherry', 'X': 'cherry', 'W': 'oak'}
BARK_TINT = {'plane': (0.88, 0.93, 1.06), 'willow': (0.49, 0.51, 0.56), 'oak': (1.15, 1.3, 1.6), 'zelkova': (0.48, 0.59, 0.74), 'pear': (0.46, 0.52, 0.9), 'linden': (0.6, 0.56, 0.54), 'maple': (1.4, 1.6, 1.6), 'cherry': (0.59, 0.62, 0.79)}   # (linear, per channel: each scan's mean to a bark albedo, plane 0.30 / 0.28 / 0.25, the others ~0.12-0.16)
POOL_RE = re.compile(r'^tree([A-Z])(\d?)(Trunk|Crown)$')
LODS = ('lod0', 'lod1', 'imp')

def _opt(argv, name, d=None):
    if '--' + name in argv:
        i = argv.index('--' + name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d

def tree_id(F, v, assets=ASSETS):
    """the asset tree for a pool: <F>_y for the young sub-form, <F>_m otherwise; None when the set lacks it"""
    if v == '2' and os.path.exists(f'{assets}/npz/{F}_m2_lod0.npz'): return f'{F}_m2'   # the second mature variant
    tid = f"{F}_{'y' if v == '9' else 'm'}"
    if not os.path.exists(f'{assets}/npz/{tid}_lod0.npz'):
        if v == '9' and os.path.exists(f'{assets}/npz/{F}_m_lod0.npz'): return f'{F}_m'
        return None
    return tid

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
        self.tex_done = {}
        self.stats = {'pools': 0, 'dropped': 0, 'instances': 0, 'by_lod': {k: 0 for k in LODS}, 'protos': 0}

    def tex(self, name):
        """link an asset texture into <out>/textures/bxtrees; returns the layer-relative path"""
        rel = f'textures/bxtrees/{name}'
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
            a = self._reader(st, mpath, 'alpha', self.tex(f'{key}_leaf_col.png'), 'sRGB', st_out)
            n = self._reader(st, mpath, 'nrm', self.tex(f'{key}_leaf_nrm.png'), 'raw', st_out, (2, 2, 2, 1), (-1, -1, -1, 0))
            sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(c.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            sh.CreateInput('opacity', Sdf.ValueTypeNames.Float).ConnectToSource(a.CreateOutput('a', Sdf.ValueTypeNames.Float))
            sh.CreateInput('opacityThreshold', Sdf.ValueTypeNames.Float).Set(0.5)
            sh.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(n.CreateOutput('rgb', Sdf.ValueTypeNames.Float3))
            sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.45)
        elif kind == 'bark':
            tint = BARK_TINT.get(key, (0.8, 0.8, 0.8))
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
        P, N, UV, I, faces, base, f0 = [], [], [], [], {}, 0, 0
        for k in parts:
            P.append(Z[f'{k}_P']); N.append(Z[f'{k}_N']); UV.append(Z[f'{k}_UV']); I.append(Z[f'{k}_I'].astype(np.int64) + base)
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
        m.CreateExtentAttr([Gf.Vec3f(*map(float, P.min(0))), Gf.Vec3f(*map(float, P.max(0)))])
        F = tid.split('_')[0]
        for k in parts:
            mp = self.material(st, k, F if k == 'leaf' else BARK_OF[F] if k == 'bark' else tid)
            ss = UsdGeom.Subset.Define(st, f'{path}/{k}')
            ss.CreateElementTypeAttr(UsdGeom.Tokens.face); ss.CreateFamilyNameAttr('materialBind')
            ss.CreateIndicesAttr(Vt.IntArray.FromNumpy(faces[k]))
            UsdShade.MaterialBindingAPI.Apply(ss.GetPrim()).Bind(UsdShade.Material(st.GetPrimAtPath(mp)))
        self.stats['protos'] += 1
        return path

    def instancer(self, st, base, tid, matrices, cam_xz, lod_split, geo=None):
        """one PointInstancer per pool, protoIndices by LOD: the instance's distance to the camera path in plan; its
        prototypes are children (protos/<tid>_<lod>) referencing the class prims of the geometry layer `geo`"""
        geo = geo or st
        Ms = np.asarray(matrices, np.float64).reshape(-1, 16)
        pos, q, sc = decompose(Ms)
        if lod_split is None or cam_xz is None or not len(cam_xz):
            li = np.zeros(len(pos), np.int32)
        else:
            d = np.sqrt(((pos[:, None, [0, 2]] - cam_xz[None, :, :]) ** 2).sum(-1)).min(axis=1)
            li = np.where(d < lod_split[0], 0, np.where(d < lod_split[1], 1, 2)).astype(np.int32)
        have = [lod for lod in LODS if os.path.exists(f'{self.assets}/npz/{tid}_{lod}.npz')]
        li = np.minimum(li, len(have) - 1)
        used = sorted(set(li.tolist()))
        pi = UsdGeom.PointInstancer.Define(st, f'/World/BXTrees/{base}')
        protos = []
        for k in used:
            cls = self.proto(geo, tid, have[k])
            pp = f'/World/BXTrees/{base}/protos/{tid}_{have[k]}'
            st.DefinePrim(pp, 'Mesh').GetReferences().AddInternalReference(cls)
            protos.append(pp)
        remap = {k: j for j, k in enumerate(used)}
        pi.CreatePrototypesRel().SetTargets([Sdf.Path(p) for p in protos])
        pi.CreateProtoIndicesAttr(Vt.IntArray.FromNumpy(np.array([remap[k] for k in li], np.int32)))
        pi.CreatePositionsAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(pos.astype(np.float32))))
        pi.CreateOrientationsAttr(Vt.QuathArray([Gf.Quath(float(w), float(x), float(y), float(z)) for w, x, y, z in q]))
        pi.CreateScalesAttr(Vt.Vec3fArray.FromNumpy(np.ascontiguousarray(sc.astype(np.float32))))
        pi.CreateIdsAttr(Vt.Int64Array.FromNumpy(np.arange(len(pos), dtype=np.int64)))
        self.stats['pools'] += 1; self.stats['instances'] += len(pos)
        for k in li: self.stats['by_lod'][have[k]] += 1
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

# ---------------------------------------------------------------- the usd_write.py hook API (BX-SEQ, docs/notes/ar34-bx-seq.md)
_covered = {}
def setup(ctx):
    _covered.clear()
    ctx.bxt_assets = _opt(ctx.argv, 'bxt-assets', ASSETS) if hasattr(ctx, 'argv') else ASSETS

def pool(ctx, stage, path, p):
    m = POOL_RE.match(p.get('name', ''))
    if not m: return False
    F, v, part = m.groups()
    tid = tree_id(F, v, getattr(ctx, 'bxt_assets', ASSETS))
    if not tid: return False
    # (per static layer: usd_write.py writes one per shot when the harvest has the shot's own static capture)
    fn = os.path.basename(stage.GetRootLayer().identifier)
    if part == 'Trunk': _covered.setdefault(fn, {})['tree' + F + v] = (tid, p['matrices'])
    return True   # both pools of a covered tree: the trees layer draws it

GEO_FN = 'bxtrees_geo.usdc'
_geo = {}
def geo_stage(out):
    """the shared geometry layer of an output directory: the prototypes (class prims) and their materials"""
    if out not in _geo:
        g = Usd.Stage.CreateNew(os.path.join(out, GEO_FN))
        UsdGeom.SetStageUpAxis(g, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(g, 1.0)
        UsdGeom.Scope.Define(g, '/World'); UsdGeom.Scope.Define(g, '/World/BXTrees'); UsdGeom.Scope.Define(g, '/World/BXTrees/Looks')
        _geo[out] = g
    return _geo[out]

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
    st = new_layer(os.path.join(ctx.OUT, fn))
    g = geo_stage(ctx.OUT)
    w = Writer(ctx.OUT, getattr(ctx, 'bxt_assets', ASSETS))
    cxz = cam_path(ctx.IN, ctx.man['shots'][shot])
    split = lod_split_of(_opt(getattr(ctx, 'argv', []), 'bxt-lod', None))
    for base, (tid, mats) in sorted(cov.items()):
        w.instancer(st, base, tid, mats, cxz, split, geo=g)
    st.GetRootLayer().Save(); g.GetRootLayer().Save()
    ctx.stats.setdefault('bxtrees', {})[shot] = w.stats
    return [fn, GEO_FN]

# ---------------------------------------------------------------- standalone: a trees layer over an existing export
def main(argv):
    IN = _opt(argv, 'in'); USD = _opt(argv, 'usd'); OUT = _opt(argv, 'out')
    assets = _opt(argv, 'bxt-assets', ASSETS)
    split = lod_split_of(_opt(argv, 'bxt-lod', None))
    os.makedirs(OUT, exist_ok=True)
    man = json.load(open(os.path.join(IN, 'manifest.json')))
    S = json.load(open(os.path.join(IN, 'static.json')))
    covered, dropped = {}, []
    for p in S['pools']:
        m = POOL_RE.match(p['name'])
        if not m: continue
        F, v, part = m.groups()
        tid = tree_id(F, v, assets)
        if not tid: continue
        if part == 'Trunk': covered['tree' + F + v] = (tid, p['matrices'])
        dropped.append(p['name'])
    report = {}
    for shot, info in man['shots'].items():
        fn = f'trees_{shot}.usdc'
        st = new_layer(os.path.join(OUT, fn))
        g = geo_stage(OUT)
        # the web's pools of the covered trees (and their colour / shear splits) off
        src = Usd.Stage.Open(os.path.join(USD, 'static.usdc'), load=Usd.Stage.LoadNone)
        pools = src.GetPrimAtPath('/World/Pools')
        off = 0
        for ch in (pools.GetChildren() if pools else []):
            nm = ch.GetName()
            if any(nm == d or nm.startswith(d + '_c') or nm.startswith(d + '_x') for d in dropped):
                st.OverridePrim(ch.GetPath()).SetActive(False); off += 1
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
            r.GetRootLayer().subLayerPaths = [fn, GEO_FN, os.path.abspath(os.path.join(USD, rfn))]
            UsdGeom.SetStageUpAxis(r, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(r, 1.0)
            r.SetStartTimeCode(old.GetStartTimeCode()); r.SetEndTimeCode(old.GetEndTimeCode())
            r.SetTimeCodesPerSecond(old.GetTimeCodesPerSecond()); r.SetFramesPerSecond(old.GetFramesPerSecond())
            r.GetRootLayer().customLayerData = dict(old.GetRootLayer().customLayerData)
            r.GetRootLayer().Save()
    json.dump(report, open(os.path.join(OUT, 'trees_stats.json'), 'w'), indent=1)
    print(json.dumps(report, indent=1))

if __name__ == '__main__':
    main(sys.argv[1:])
