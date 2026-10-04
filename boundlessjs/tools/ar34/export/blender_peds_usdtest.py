# BX-PEDS (AR34 BX, 2026-10-02): does Blender's own USD importer take the walkers' UsdSkel (peds_<shot>.usdc)? Imports the
# layer with skeletons on and reports the import time, the armatures, actions and skinned meshes it made, the time to
# evaluate a frame, and how far the deformed walkers land from the web's skinning (blender_peds.web_skin: M x sum w S v from
# the harvest's own pose rows) at the given frames.
#   blender -b --factory-startup --python blender_peds_usdtest.py -- --usd <usd dir>/peds_<shot>.usdc [--frames 0,54] [--n 12]
import bpy, sys, os, json, time
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None): return argv[argv.index('--' + n) + 1] if '--' + n in argv else d
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_peds as BP
usd = opt('usd'); frames = [int(f) for f in opt('frames', '0,54').split(',')]; nchk = int(opt('n', '12'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
t0 = time.time()
bpy.ops.wm.usd_import(filepath=usd, import_cameras=False, import_lights=False, import_materials=True, import_meshes=True,
                      import_skeletons=True, import_blendshapes=False, import_points=False, read_mesh_uvs=True,
                      read_mesh_attributes=True, set_frame_range=True, import_usd_preview=True, create_collection=True,
                      import_visible_only=False, validate_meshes=False, import_textures_mode='IMPORT_NONE')
t_imp = time.time() - t0
arms = [o for o in sc.objects if o.type == 'ARMATURE']
meshes = [o for o in sc.objects if o.type == 'MESH']
skinned = [o for o in meshes if any(m.type == 'ARMATURE' for m in o.modifiers)]
acts = [o for o in arms if o.animation_data and o.animation_data.action]
R = {'import_s': round(t_imp, 1), 'armatures': len(arms), 'with_action': len(acts), 'meshes': len(meshes), 'skinned': len(skinned),
     'frame_range': [sc.frame_start, sc.frame_end], 'hidden_anim': sum(1 for o in sc.objects if o.animation_data and o.animation_data.action and any('hide' in fc.data_path for fc in o.animation_data.action.fcurves))}
if acts: R['fcurves_first_action'] = len(acts[0].animation_data.action.fcurves); R['keys_first_fcurve'] = len(acts[0].animation_data.action.fcurves[0].keyframe_points)
# the web reference
npz = usd.replace('.usdc', '.npz')
with np.load(npz) as Z: D = {k: Z[k] for k in Z.files}
meta = json.loads(bytes(D['meta']).decode()); H = meta['harvest']
A = json.load(open(os.path.join(H, 'peds', 'assets.json')))
world = next((o for o in sc.objects if o.name == 'World'), None)
Winv = np.array(world.matrix_world.inverted()) if world else np.eye(4)
def walker_of(o):   # the SkelRoot ancestor's name: w<seed hex>_<variant>
    p = o
    while p is not None:
        if p.name.startswith('w') and '_' in p.name:
            try: return int(p.name[1:9], 16), int(p.name.split('_')[1].split('.')[0])
            except Exception: pass
        p = p.parent
    return None
res = []
for f in frames:
    t1 = time.time(); sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); t_set = time.time() - t1
    errs = []
    for o in [m for m in skinned if m.name.startswith('Body')]:
        wv = walker_of(o)
        if not wv: continue
        k = np.nonzero((D['w_id'] == wv[0]) & (D['w_var'] == wv[1]))[0]
        if not len(k) or not D['present'][k[0], f]: continue
        k = k[0]
        ref = BP.web_skin(H, A, meta, meta['shot'], f, wv[0], wv[1], int(D['w_lod'][k]), 'opaque', 0xffff)
        if ref is None: continue
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3).astype(np.float64)
        mw = np.array(oe.matrix_world); oe.to_mesh_clear()
        if len(co) != len(ref): errs.append(('nverts', len(co), len(ref))); continue
        w3 = (Winv @ mw @ np.c_[co, np.ones(len(co))].T).T[:, :3]
        d = np.linalg.norm(w3 - ref, axis=1) * 1000
        errs.append((float(d.max()), float(d.mean())))
        if len(errs) >= nchk: break
    good = [e for e in errs if isinstance(e[0], float)]
    res.append({'frame': f, 'frame_set_s': round(t_set, 2), 'checked': len(good), 'max_mm': round(max([e[0] for e in good], default=-1), 2),
                'mean_mm': round(float(np.mean([e[1] for e in good])) if good else -1, 2), 'other': [e for e in errs if not isinstance(e[0], float)][:3]})
R['check'] = res
print('USDTEST ' + json.dumps(R))
