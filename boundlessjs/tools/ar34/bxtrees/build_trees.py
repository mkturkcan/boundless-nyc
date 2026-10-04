# BX-TREES (AR34 BX, 2026-10-02): build the tree asset set in Blender.
#
#   CUDA_VISIBLE_DEVICES=1 blender -b --factory-startup --python tools/ar34/bxtrees/build_trees.py -- \
#       [--trees P_m,P_y,...] [--out /data0/projectnyc_aux/assets/bxtrees] [--preview] [--imp] [--noblend]
#
# Per tree (species F, size m = mature / y = young, the web's suffix-9 pools): treegen.py grows it at the web pool's box
# (BOX below: the crown height and width of the web's tree<F>Crown pool at instance scale 1, measured on harvest h2), the
# meshes and materials (export/blender_trees.py) are made, and it is written as
#   blend/<id>.blend            the Blender source (collections LOD0, LOD1, IMP)
#   npz/<id>_lod0.npz, _lod1.npz, _imp.npz   the meshes for the USD writer and the web pack (Y up, metres)
#   imp/<id>.png                the impostor's three views (side 0, side 90, top), 3 x 512 px, colour + alpha
#   trees.json                  per tree: the box, branch / leaf counts, LOD triangle counts
# --preview renders a three-quarter view in a golden sun, a view from under the crown and the LOD1 view into the track's
# scratch folder (prev_<id>_a|b|c.png).
import bpy, bmesh, sys, os, json, math, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'export'))
import treegen as tg
import blender_trees as bt

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d
OUT = opt('out', '/data0/projectnyc_aux/assets/bxtrees')
TEX = f'{OUT}/tex'
for d in ('blend', 'npz', 'imp'): os.makedirs(f'{OUT}/{d}', exist_ok=True)
LM = json.load(open(f'{TEX}/leaves.json'))['species']

# the web pools' crown box at instance scale 1 (height, width), harvest h2 (tree<F>Crown): mature = tree<F>, young = tree<F>9
BOX = {'P_m': (12.6, 10.4), 'P_y': (9.4, 5.9), 'H_m': (10.0, 10.0), 'H_y': (8.4, 6.4), 'Q_m': (12.0, 10.3), 'Q_y': (9.9, 6.1),
       'Z_m': (13.1, 11.0), 'Z_y': (9.7, 6.4), 'R_m': (10.7, 9.3), 'R_y': (8.4, 5.6), 'L_m': (12.2, 10.2), 'L_y': (10.2, 6.6),
       'M_m': (12.9, 10.9), 'M_y': (9.6, 6.6), 'S_m': (12.4, 10.6),
       'Y_m': (10.3, 8.0), 'X_m': (7.3, 7.3), 'W_m': (6.9, 6.1), 'P_m2': (12.25, 10.4), 'H_m2': (11.0, 10.6)}
SEED = {'P': 101, 'H': 202, 'Q': 404, 'Z': 909, 'R': 303, 'L': 606, 'M': 505, 'S': 1010, 'Y': 808, 'X': 1111, 'W': 1212}
TREES = (opt('trees') or 'P_m,P_y,H_m,H_y,Q_m,Q_y,Z_m,Z_y,R_m,R_y,L_m,L_y,M_m,M_y,S_m,Y_m,X_m,W_m,P_m2,H_m2').split(',')

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
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', M['UV'][I.ravel()].astype(np.float32).ravel())
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

def lod1(tree):
    """60-150 m: limbs to the secondaries (half the sides, every other ring); a quarter of the leaves at twice the size"""
    rng = np.random.default_rng(7)
    n = len(tree.leafs['pos'])
    sel = np.sort(rng.choice(n, max(1, n // 4), replace=False))
    return tg.tube_mesh(tree, lvl_max=2, sides_k=0.55, ring_step=2, tile=BT_TILE), tg.leaf_mesh(tree, sel=sel, scale=2.0, fold_deg=6)

BT_TILE = 0.9

def scene_setup(res=1024, samples=64):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.refresh_devices()
    for dv in prefs.devices: dv.use = (dv.type == 'OPTIX')
    sc.cycles.device = 'GPU'
    sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPTIX'
    sc.cycles.transparent_max_bounces = 64
    sc.render.resolution_x = res; sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'
    return sc

def sky_world(sc, elev=40, rot=150, strength=0.35):
    w = bpy.data.worlds.get('bxt_sky') or bpy.data.worlds.new('bxt_sky')
    sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(elev); sky.sun_rotation = math.radians(rot)
    sky.sun_disc = False; sky.dust_density = 1.0
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

def sun(sc, elev=40, rot=150, energy=4.0):
    for o in [o for o in sc.objects if o.name.startswith('bxt_sun')]: bpy.data.objects.remove(o, do_unlink=True)
    L = bpy.data.lights.new('bxt_sun', 'SUN'); L.energy = energy; L.angle = math.radians(0.53); L.color = (1.0, 0.92, 0.82)
    o = bpy.data.objects.new('bxt_sun', L); sc.collection.objects.link(o)
    e, r = math.radians(elev), math.radians(rot)
    d = -np.array([math.cos(e) * math.sin(r), -math.cos(e) * math.cos(r), math.sin(e)])
    import mathutils
    o.rotation_euler = mathutils.Vector(d).to_track_quat('-Z', 'Y').to_euler()
    return o

def camera(sc, loc, target, lens=35, ortho=None):
    import mathutils
    c = bpy.data.objects.get('bxt_cam')
    if c is None:
        cd = bpy.data.cameras.new('bxt_cam'); c = bpy.data.objects.new('bxt_cam', cd); sc.collection.objects.link(c)
    c.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho: c.data.ortho_scale = ortho
    c.data.lens = lens; c.data.clip_start = 0.05; c.data.clip_end = 500
    c.location = loc
    c.rotation_euler = (mathutils.Vector(target) - mathutils.Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = c
    return c

def ground(sc):
    if bpy.data.objects.get('bxt_ground'): return
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    g = bpy.context.active_object; g.name = 'bxt_ground'
    m = bpy.data.materials.new('bxt_ground_mat'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.085, 0.08, 1)
    g.data.materials.append(m)

def render_to(path, res):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    bpy.ops.render.render(write_still=True)

stats = {}
for tid in TREES:
    t0 = time.time()
    F, size = tid.split('_')
    H, W = BOX[tid]
    tree = tg.build(F, size, H, W, SEED[F] + {'m': 0, 'y': 17, 'm2': 4242}.get(size, 17), LM[F])
    b0 = tg.tube_mesh(tree, tile=BT_TILE)
    l0 = tg.leaf_mesh(tree)
    b1, l1 = lod1(tree)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = scene_setup()
    cols = {}
    for c in ('LOD0', 'LOD1', 'IMP'):
        cols[c] = bpy.data.collections.new(f'{tid}_{c}'); sc.collection.children.link(cols[c])
    leafm = bt.leaf_material(F, TEX)
    barkm = bt.bark_material(bt.BARK_OF[F], TEX)
    ob_b0 = make_mesh(f'{tid}_bark0', b0, barkm, cols['LOD0'])
    ob_l0 = make_mesh(f'{tid}_leaf0', l0, leafm, cols['LOD0'])
    ob_b1 = make_mesh(f'{tid}_bark1', b1, barkm, cols['LOD1'])
    ob_l1 = make_mesh(f'{tid}_leaf1', l1, leafm, cols['LOD1'])
    save_npz(f'{OUT}/npz/{tid}_lod0.npz', bark=b0, leaf=l0)
    save_npz(f'{OUT}/npz/{tid}_lod1.npz', bark=b1, leaf=l1)
    st = {'H': H, 'W': W, 'branches': len(tree.B), 'leaves': int(len(tree.leafs['pos'])),
          'lod0': {'bark': int(len(b0['I'])), 'leaf': int(len(l0['I']))}, 'lod1': {'bark': int(len(b1['I'])), 'leaf': int(len(l1['I']))},
          'trunk_r': round(float(tree.B[0]['r'][0]), 3), 'bbox': [l0['P'].min(0).round(2).tolist(), l0['P'].max(0).round(2).tolist()]}
    # ---- impostor: three orthographic views of LOD0 (side 0, side 90, top) under an even sky, colour + alpha
    if opt('imp') is not None:
        cols['LOD1'].hide_render = True
        sc.render.film_transparent = True
        w = bpy.data.worlds.new('bxt_even'); sc.world = w; w.use_nodes = True
        w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
        w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
        sun(sc, 60, 150, 2.0)
        sc.cycles.samples = 32
        ext = max(H, W) * 1.04
        views = []
        for k, (loc, tgt) in enumerate([((0, -60, H / 2), (0, 0, H / 2)), ((60, 0, H / 2), (0, 0, H / 2)), ((0, 0.01, 60), (0, 0, 0))]):
            camera(sc, loc, tgt, ortho=ext)
            p = f'/data0/projectnyc_aux/tmp/bx/trees/imp_{tid}_{k}.png'
            render_to(p, (512, 512))
            views.append(p)
    else:
        views = None
    if views:
        imgs = [bpy.data.images.load(p) for p in views]
        Wd = 512 * 3
        px = np.zeros((512, Wd, 4), np.float32)
        for k, im in enumerate(imgs):
            a = np.array(im.pixels[:], np.float32).reshape(512, 512, 4)
            px[:, k * 512:(k + 1) * 512] = a
        out = bpy.data.images.new(f'imp_{tid}', Wd, 512, alpha=True)
        out.pixels.foreach_set(px.ravel())
        out.filepath_raw = f'{OUT}/imp/{tid}.png'; out.file_format = 'PNG'; out.save()
        # the impostor mesh: two crossed vertical cards (views 0 and 1) and a horizontal one at 0.62 of the height (view 2)
        e = ext / 2
        P = np.array([[-e, 0, 0], [e, 0, 0], [e, 2 * e, 0], [-e, 2 * e, 0],
                      [0, 0, e], [0, 0, -e], [0, 2 * e, -e], [0, 2 * e, e],
                      [-e, H * 0.62, e], [e, H * 0.62, e], [e, H * 0.62, -e], [-e, H * 0.62, -e]], np.float32)
        P[:8, 1] += H / 2 - e
        UV = np.array([[0, 0], [1 / 3, 0], [1 / 3, 1], [0, 1], [1 / 3, 0], [2 / 3, 0], [2 / 3, 1], [1 / 3, 1],
                       [2 / 3, 0], [1, 0], [1, 1], [2 / 3, 1]], np.float32)
        Nn = np.array([[0, 0, 1]] * 4 + [[1, 0, 0]] * 4 + [[0, 1, 0]] * 4, np.float32)
        I = np.array([[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [8, 9, 10], [8, 10, 11]], np.uint32)
        imp = {'P': P, 'N': Nn, 'UV': UV, 'I': I}
        save_npz(f'{OUT}/npz/{tid}_imp.npz', imp=imp)
        im_m = bt.imp_material(f'bxt_imp_{tid}', f'{OUT}/imp/{tid}.png')
        make_mesh(f'{tid}_imp', imp, im_m, cols['IMP'])
        cols['LOD1'].hide_render = False
        sc.render.film_transparent = False
    # ---- preview: a three-quarter view in a golden sun, and a view from under the crown (a walker's)
    if opt('preview') is not None:
        cols['LOD1'].hide_render = True; cols['IMP'].hide_render = True
        sky_world(sc, 32, 330, 0.6); sun(sc, 32, 330, 4.0); ground(sc)
        sc.cycles.samples = 48
        camera(sc, (16, -22, 5.5), (0, 0, H * 0.55), lens=35)
        pa = f'/data0/projectnyc_aux/tmp/bx/trees/prev_{tid}_a.png'; render_to(pa, (900, 900))
        camera(sc, (3.0, -5.0, 1.6), (0, 0, H * 0.75), lens=18)
        pb = f'/data0/projectnyc_aux/tmp/bx/trees/prev_{tid}_b.png'; render_to(pb, (900, 900))
        cols['LOD1'].hide_render = False; cols['LOD0'].hide_render = True
        camera(sc, (16, -22, 5.5), (0, 0, H * 0.55), lens=35)
        pc = f'/data0/projectnyc_aux/tmp/bx/trees/prev_{tid}_c.png'; render_to(pc, (900, 900))
        cols['LOD0'].hide_render = False
        st['preview'] = [pa, pb, pc]
    if opt('noblend') is None:
        bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/blend/{tid}.blend', compress=True)
    st['secs'] = round(time.time() - t0, 1)
    stats[tid] = st
    print('BXT', tid, json.dumps(st))
old = {}
try: old = json.load(open(f'{OUT}/trees.json'))
except Exception: pass
old.update(stats)
json.dump(old, open(f'{OUT}/trees.json', 'w'), indent=1)
