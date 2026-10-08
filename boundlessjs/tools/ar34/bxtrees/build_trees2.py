# TREEUE (AR34, 2026-10-07): build the second tree set (bxtrees2) in Blender.
#
#   blender -b --factory-startup --python tools/ar34/bxtrees/build_trees2.py -- [--trees P_m0,P_l1,...] \
#       [--out /data0/projectnyc_aux/assets/bxtrees2] [--noblend] [--stats <json>]
#   (all of them, in parallel: python3 tools/ar34/bxtrees/build_set2.py)
#
# A tree id is <F>_<size><variant>: F the species form (the web's TREE_FORMS letters), size y / m / l (young, mature,
# large), variant 0, 1, ... (a seed each). Per tree, treegen2.py grows it at the web pool's crown box (BOX below, measured
# on the harvest's tree<F>Crown / tree<F>9Crown at instance scale 1), and it is written as
#   blend/<id>.blend            the Blender source: collections LOD0 and LOD1, the Cycles materials (blender_trees.py)
#   npz/<id>_lod0.npz, _lod1.npz   bark and leaf meshes for usd_trees.py (Y up, metres; P, N, UV, UV1 = st1, I)
# and the set's tables go to set.json (bark per species and its tint, the leaf cut per species, the trees).
import bpy, sys, os, json, math, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'export'))
import treegen2 as g2
import blender_trees as bt

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d
OUT = opt('out', '/data0/projectnyc_aux/assets/bxtrees2')
TEX = f'{OUT}/tex'
for d in ('blend', 'npz'): os.makedirs(f'{OUT}/{d}', exist_ok=True)
LM = json.load(open(f'{TEX}/leaves.json'))['species']

# the web pools' crown box at instance scale 1 (height, width): mature tree<F>, young tree<F>9 (harvest h2; G from the
# 2026-10-05 harvest); the large size uses the mature box (its pool instances are scaled up by their matrices)
BOX = {'P_m': (12.6, 10.4), 'P_y': (9.4, 5.9), 'H_m': (10.0, 10.0), 'H_y': (8.4, 6.4), 'Q_m': (12.0, 10.3), 'Q_y': (9.9, 6.1),
       'Z_m': (13.1, 11.0), 'Z_y': (9.7, 6.4), 'R_m': (10.7, 9.3), 'R_y': (8.4, 5.6), 'L_m': (12.2, 10.2), 'L_y': (10.2, 6.6),
       'M_m': (12.9, 10.9), 'M_y': (9.6, 6.6), 'S_m': (12.4, 10.6), 'Y_m': (10.3, 8.0), 'X_m': (7.3, 7.3), 'W_m': (6.9, 6.1),
       'G_m': (8.24, 5.9)}
SEED = {'P': 101, 'H': 202, 'Q': 404, 'Z': 909, 'R': 303, 'L': 606, 'M': 505, 'S': 1010, 'Y': 808, 'X': 1111, 'W': 1212, 'G': 707}
# the set: young (2 variants) where the web has young pools, mature (2), large (2 for the species whose pools carry
# instances scaled 1.2 and up, else 1)
TREES = ([f'{F}_y{v}' for F in 'PHQMLZ' for v in (0, 1)] + [f'{F}_m{v}' for F in 'PHQZRLMSYXWG' for v in (0, 1)] +
         [f'{F}_l{v}' for F in 'PHQMLS' for v in (0, 1)] + [f'{F}_l0' for F in 'ZGX'])
if opt('trees'): TREES = opt('trees').split(',')
BARK_OF = {'P': 'plane', 'H': 'willow', 'Q': 'oak', 'Z': 'zelkova', 'R': 'pear', 'L': 'linden', 'M': 'maple', 'S': 'linden',
           'Y': 'cherry', 'X': 'cherry', 'W': 'oak', 'G': 'ginkgo'}
BARK_TINT = dict(bt.BARK_TINT); BARK_TINT['ginkgo'] = (1.2, 1.36, 1.72)   # (the oak scan, a little lighter and greyer)

def box_of(tid):
    F, sv = tid.split('_')
    size = sv[0]
    return BOX.get(f'{F}_{"y" if size == "y" else "m"}') or BOX[f'{F}_m']

def seed_of(tid):
    F, sv = tid.split('_')
    size, var = sv[0], int(sv[1:] or 0)
    return SEED[F] + {'y': 17, 'm': 0, 'l': 4242}[size] + 7919 * var

def to_blender(P):
    P = np.asarray(P, np.float32)
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)

def make_mesh(name, M, mat, coll):
    me = bpy.data.meshes.new(name)
    P = to_blender(M['P']); I = M['I'].astype(np.int32)
    nv, nt = len(P), len(I)
    me.vertices.add(nv); me.vertices.foreach_set('co', P.ravel())
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', I.ravel())
    me.polygons.add(nt); me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    uv = me.uv_layers.new(name='st')
    uv.data.foreach_set('uv', M['UV'][I.ravel()].astype(np.float32).ravel())
    if 'UV1' in M:
        u1 = me.uv_layers.new(name='st1')
        u1.data.foreach_set('uv', M['UV1'][I.ravel()].astype(np.float32).ravel())
    me.normals_split_custom_set_from_vertices([tuple(v) for v in to_blender(M['N'])])
    me.polygons.foreach_set('use_smooth', np.ones(nt, bool))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob

def save_npz(path, **meshes):
    flat = {}
    for k, M in meshes.items():
        for a, v in M.items(): flat[f'{k}_{a}'] = v
    np.savez_compressed(path, **flat)

TILE = 0.9
stats = {}
for tid in TREES:
    t0 = time.time()
    F, sv = tid.split('_')
    size = sv[0]
    H, W = box_of(tid)
    tree = g2.build(F, size, H, W, seed_of(tid), LM[F])
    b0 = g2.tube_mesh(tree, tile=TILE)
    l0 = g2.leaf_mesh(tree)
    # lod1 (past 400 m in the film default): limbs to the secondaries, a quarter of the leaves at twice the size
    rng = np.random.default_rng(7)
    n = len(tree.leafs['pos'])
    sel = np.sort(rng.choice(n, max(1, n // 4), replace=False))
    b1 = g2.tube_mesh(tree, lvl_max=2, sides_k=0.55, ring_step=2, tile=TILE)
    l1 = g2.leaf_mesh(tree, sel=sel, scale=2.0, fold_deg=6)
    save_npz(f'{OUT}/npz/{tid}_lod0.npz', bark=b0, leaf=l0)
    save_npz(f'{OUT}/npz/{tid}_lod1.npz', bark=b1, leaf=l1)
    st = {'H': H, 'W': W, 'size': size, 'seed': seed_of(tid), 'branches': len(tree.B), 'leaves': int(n), 'lai': round(tree.lai, 2),
          'leaf_scale': round(tree.leaf_scale, 2), 'lod0': {'bark': int(len(b0['I'])), 'leaf': int(len(l0['I']))},
          'lod1': {'bark': int(len(b1['I'])), 'leaf': int(len(l1['I']))}, 'trunk_r': round(float(tree.B[0]['r'][0]), 3),
          'bbox': [l0['P'].min(0).round(2).tolist(), l0['P'].max(0).round(2).tolist()]}
    if opt('noblend') is None:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        cols = {}
        for c in ('LOD0', 'LOD1'):
            cols[c] = bpy.data.collections.new(f'{tid}_{c}'); sc.collection.children.link(cols[c])
        leafm = bt.leaf_material(F, TEX, per_leaf=True)
        barkm = bt.bark_material(BARK_OF[F], TEX, uvname='st')
        make_mesh(f'{tid}_bark0', b0, barkm, cols['LOD0']); make_mesh(f'{tid}_leaf0', l0, leafm, cols['LOD0'])
        make_mesh(f'{tid}_bark1', b1, barkm, cols['LOD1']); make_mesh(f'{tid}_leaf1', l1, leafm, cols['LOD1'])
        cols['LOD1'].hide_render = True
        bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/blend/{tid}.blend', compress=True)
    st['secs'] = round(time.time() - t0, 1)
    stats[tid] = st
    print('BXT2', tid, json.dumps(st), flush=True)
sp = opt('stats', f'{OUT}/trees.json')
old = {}
try: old = json.load(open(sp))
except Exception: pass
old.update(stats)
json.dump(old, open(sp, 'w'), indent=1)
# the set's tables (usd_trees.py and blender_trees.py read them)
setj = {'gen': 2, 'bark_of': BARK_OF, 'bark_tint': {k: list(v) for k, v in BARK_TINT.items()},
        'leaf_cut': {F: LM[F].get('cut', 'opaque') for F in LM}, 'large_scale': 1.2,
        'licence': 'geometry: procedural (treegen.py / treegen2.py), BoundlessNYC, CC BY 4.0; leaf and bark scans CC0 (NOTICE.md)'}
json.dump(setj, open(f'{OUT}/set.json', 'w'), indent=1)
