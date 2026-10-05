# OFFLINE TARGETS (AR34 LOOK, 2026-10-02), step 3: render one key frame of an exported shot in Blender (Cycles).
#
#   CUDA_VISIBLE_DEVICES=2 blender -b --factory-startup --python blender_render.py -- \
#       --usd <usd dir>/t7ArchTrack_f054.usda --frame 54 --out <file.png> [--res 2560x1440] [--samples 256] [--cpu]
#       [--exposure 0] [--sun <W/m2, default the page's>] [--sky 0.15] [--dust 0.6] [--look "AgX - Medium High Contrast"]
#       [--mblur 0.5] [--leaves 0.45 --leafgain 1.8] [--view x,z,alt,tx,tz,pitch,hfov] [--nomoving] [--keepcam]
#       [--blend <save .blend>] [--norender]   (--usd may also be a .blend saved with --blend: reopened, relit, rendered)
# The pilot's final frames: --samples 128 --mblur 0.5 --sky 0.15 --dust 0.6 --leaves 0.45 --leafgain 1.8 (b14)
#
# Imports the USD root (camera with its time samples, the city, the moving sets; materials as UsdPreviewSurface), lights it
# with a Nishita sky whose sun matches the page's sun direction (the root's customLayerData sunDir) plus a sun lamp, and
# renders with Cycles on the GPU (OptiX) with the OptiX denoiser. Prints the import, BVH / render and total times as JSON.
import bpy, sys, json, math, time, os

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d
USD = opt('usd'); FRAME = int(opt('frame', '0')); OUT = opt('out', '/tmp/render.png')
W, H = map(int, opt('res', '2560x1440').split('x'))
SAMPLES = int(opt('samples', '256')); CPU = opt('cpu') is not None
T = {'start': time.time()}
# ---- BX hooks (owned by BX-SEQ; one line per track): a module <name>.py next to this file defines any of after_import(ctx),
# light(ctx) (True: it owns the lighting), settings(ctx), frame(ctx, f), done(ctx); docs/notes/ar34-bx-seq.md has the ctx.
# --hooks a,b replaces the list for a run, --nohooks runs none. blender_take.py runs this file for its setup (BX_TAKE=1).
HOOKS = [
    # 'blender_x',   # BX-<TRACK>
    'blender_trees',   # BX-TREES: the tree set's leaves (translucent, two-sided) and bark (--bxtrees-off, --bxwind <m>)
    'blender_nodes',   # BX-MAT: the web's surface shaders as node groups on a --bxmat USD (--bxtrim web|net|phys, --bxnodes 0)
    'blender_wheels',  # BX-FIN: the cars' wheels turn and steer in a take (harvests with _wheel; --nowheels off, --wheelr 60)
    'blender_windows',   # BX-WIN: the tile facades' windows per pixel (the bake + the web's grid), the kit's thin glass, the rooms' glow (--nowin off; BXW_Params for BX-LIGHT)
    'blender_light',   # BX-LIGHT: time of day, street and vehicle lamps, emission, the web's film look (with --harvest <dir>; --nolight off)
    'blender_peds',    # BX-PEDS: the walkers from peds_<shot>.npz (armatures, keyframed poses, skin / cloth / hair materials; --nopeds off)
    'blender_fix',     # BX-FIX: the writer's overlays cast no shadows, the kit's interiors culled from outside (bx_fix.json; --nofix off)
]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, traceback
_hook_mods = []
for _hn in ([] if opt('nohooks') is not None else ([h for h in opt('hooks').split(',') if h] if opt('hooks') not in (None, '1') else HOOKS)):
    try: _hook_mods.append((_hn, importlib.import_module(_hn.replace('.py', ''))))
    except Exception as e: print(f'[blender] hook {_hn} not loaded: {e}')
def run_hooks(fn, *a):
    out = {}
    for name, m in _hook_mods:
        f = getattr(m, fn, None)
        if not callable(f): continue
        t_ = time.time()
        try: out[name] = f(*a)
        except Exception: print(f'[blender] hook {name}.{fn} failed:\n' + traceback.format_exc())
        T.setdefault('hooks', {})[f'{name}.{fn}'] = round(time.time() - t_, 2)
    return out
TAKE = os.environ.get('BX_TAKE') == '1'
t0 = time.time()
if USD.endswith('.blend'):
    # a scene saved after an earlier import (--blend): relight and render without importing again
    bpy.ops.wm.open_mainfile(filepath=USD)
    sc = bpy.context.scene
    root_data = json.loads(sc.get('nyc_root', '{}'))
    for o in [o for o in sc.objects if o.name.startswith('Sun') or o.name == 'view']: bpy.data.objects.remove(o, do_unlink=True)
    T['open_blend'] = round(time.time() - t0, 1)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    from pxr import Usd   # Blender ships the USD Python module
    root_data = {}
    try:
        st = Usd.Stage.Open(USD, load=Usd.Stage.LoadNone)
        root_data = {k: (list(v) if hasattr(v, '__len__') and not isinstance(v, str) else v) for k, v in dict(st.GetRootLayer().customLayerData).items()}
    except Exception as e:
        print('customLayerData not read:', e)
    bpy.ops.wm.usd_import(filepath=USD, import_cameras=True, import_lights=False, import_materials=True, import_meshes=True,
                          import_volumes=False, import_shapes=False, import_skeletons=False, import_blendshapes=False,
                          import_points=True, read_mesh_uvs=True, read_mesh_colors=True, read_mesh_attributes=True,
                          set_frame_range=True, import_usd_preview=True, set_material_blend=True, create_collection=True,
                          relative_path=True, import_visible_only=True, validate_meshes=False, import_textures_mode='IMPORT_NONE')
    sc['nyc_root'] = json.dumps(root_data)
    T['import'] = round(time.time() - t0, 1)
    # BX-SEQ: a take root's moving sets (vehicles, trains ...) as keyframed Empties with their ids, paint and lamp masks
    # (blender_moving.py; --nomovingbuild leaves the importer's point clouds as they are)
    if root_data.get('take') and opt('nomovingbuild') is None:
        import blender_moving; blender_moving.build(sc, USD, root_data, T, opt)

import mathutils
cams = [o for o in sc.objects if o.type == 'CAMERA']
want = str(root_data.get('camera', '')).split('/')[-1]
cam = next((o for o in cams if o.name == want), cams[0] if cams else None)
if opt('keepcam') is not None and sc.camera: cam = sc.camera
sc.camera = cam
sc.frame_set(FRAME)
# --view x,z,alt,tx,tz,pitch,hfov: a still from a review pose (tools/bshot.mjs --cams convention, three.js world metres:
# alt over the ground under the lens, pitch in radians, the horizontal fov in degrees), the ground found by casting down
V = opt('view')
if V:
    vx, vz, alt, tx, tz, pitch, hfov = [float(v) for v in V.split(',')]
    deps = bpy.context.evaluated_depsgraph_get()
    og = root_data.get('origin') or [0.0, 0.0, 0.0]   # the root's recentring (three.js x, y, z of the region centre)
    vx, vz, tx, tz = vx - og[0], vz - og[2], tx - og[0], tz - og[2]
    o = mathutils.Vector((vx, -vz, 400.0)); down = mathutils.Vector((0, 0, -1))
    hits = []
    for _ in range(40):
        hit, loc, nrm, idx, ob, mtx = sc.ray_cast(deps, o, down)
        if not hit: break
        hits.append((loc.z, ob.name if ob else '')); o = loc + down * 0.02
    tiles = [h for h in hits if 'tile' in h[1]]
    gz = max(h[0] for h in tiles) if tiles else (min(h[0] for h in hits) if hits else 0.0)
    dx, dz = tx - vx, tz - vz; r = math.hypot(dx, dz) or 1.0
    fwd = mathutils.Vector((math.cos(pitch) * dx / r, -math.cos(pitch) * dz / r, math.sin(pitch)))
    cd = bpy.data.cameras.new('view'); cd.sensor_fit = 'HORIZONTAL'; cd.angle = math.radians(hfov)
    cam = bpy.data.objects.new('view', cd); sc.collection.objects.link(cam)
    cam.location = (vx, -vz, gz + alt); cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    T['view_ground'] = round(gz, 2); T['view_hits'] = hits[:6]
cam.data.clip_start = max(0.05, cam.data.clip_start)
cam.data.clip_end = 20000

# ---------------------------------------------------------------- leaves: --leaves <f> mixes a Translucent BSDF (the leaf's own
# colour) into the crowns' leaf cards (materials named *_leaf by the writer) at factor f; the alpha clip wraps the mix
LEAF = float(opt('leaves', '0'))
if LEAF > 0:
    nleaf = 0
    for mat in bpy.data.materials:
        if not mat.name.split('.')[0].endswith('_leaf') or not mat.use_nodes or mat.get('nyc_leaf'): continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not bsdf or not out: continue
        bc = next((l for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Base Color'), None)
        al = next((l for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Alpha'), None)
        # --leafgain: the crowns' albedo (the cards self-shadow more than a real crown; the web lights them with its own
        # foliage terms): the importer's colour scale feeding Base Color is multiplied
        g = float(opt('leafgain', '1.0'))
        if bc and bc.from_node.type == 'VECT_MATH' and g != 1.0:
            v = bc.from_node.inputs[1].default_value; bc.from_node.inputs[1].default_value = (v[0] * g, v[1] * g, v[2] * g)
        tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
        if bc: nt.links.new(bc.from_socket, tr.inputs['Color'])
        else: tr.inputs['Color'].default_value = bsdf.inputs['Base Color'].default_value
        mix = nt.nodes.new('ShaderNodeMixShader'); mix.inputs['Fac'].default_value = LEAF
        nt.links.new(bsdf.outputs['BSDF'], mix.inputs[1]); nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
        last = mix
        if al:
            src = al.from_socket
            nt.links.remove(al); bsdf.inputs['Alpha'].default_value = 1.0
            tp = nt.nodes.new('ShaderNodeBsdfTransparent'); m2 = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(src, m2.inputs['Fac']); nt.links.new(tp.outputs['BSDF'], m2.inputs[1]); nt.links.new(mix.outputs['Shader'], m2.inputs[2])
            last = m2
        nt.links.new(last.outputs['Shader'], out.inputs['Surface'])
        mat['nyc_leaf'] = 1
        nleaf += 1
    T['leaf_materials'] = nleaf

import re as _re
# --nomoving: the key frame's moving sets hidden (a review pose from another time of day: its own traffic is not the take's)
if opt('nomoving') is not None:
    nh = 0
    for ob in sc.objects:
        if _re.match(r'i\d+_', ob.name) and ob.type == 'POINTCLOUD': ob.hide_render = True; nh += 1
    if bpy.data.collections.get('bx_moving'): bpy.data.collections['bx_moving'].hide_render = True; nh += 1   # BX-SEQ: a take's
    T['moving_hidden'] = nh

# ---------------------------------------------------------------- the ground casts no shadows: its stacked same-kind layers
# (asphalt strips over the crossings' cap fans, millimetres apart after the writer's lifts) would shadow each other at a low
# sun; it still receives every shadow (the kerbs, vehicles and viaducts are other objects)
import re as _re
ng = 0
for ob in sc.objects:
    if ob.type == 'MESH' and any(m and _re.match(r'm\d+_g\d+', m.name) for m in ob.data.materials):
        ob.visible_shadow = False; ng += 1
T['ground_noshadow'] = ng

# BX hooks: the context every hook gets (blender_take.py fills frames / take; moving = the take's Empties, collection bx_moving)
CTX = {'sc': sc, 'root': root_data, 'opt': opt, 'argv': argv, 'T': T, 'usd': USD, 'usd_dir': os.path.dirname(os.path.abspath(USD)),
       'shot': root_data.get('shot'), 'frame': FRAME, 'take': TAKE, 'frames': [FRAME],
       'moving': bpy.data.collections.get('bx_moving')}
run_hooks('after_import', CTX)

# ---------------------------------------------------------------- sky and sun
sd = root_data.get('sunDir') or [0.3, 0.3, 0.9]
sx, sy, sz = float(sd[0]), float(sd[1]), float(sd[2])
bx, by, bz = sx, -sz, sy          # three (x east, y up, z south) -> Blender after the Y-up import (x, -z, y)
n = math.sqrt(bx * bx + by * by + bz * bz); bx, by, bz = bx / n, by / n, bz / n
elev = math.asin(max(-1, min(1, bz)))
rot = math.atan2(bx, -by)          # Nishita: rotation 0 puts the sun towards -Y
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'
sky.sun_elevation = elev; sky.sun_rotation = rot; sky.sun_disc = False
sky.altitude = 30.0; sky.air_density = 1.0; sky.dust_density = float(opt('dust', '2.0')); sky.ozone_density = 1.0
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = float(opt('sky', '0.35'))
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(sky.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
# three.js lights are linear irradiance with a 1/pi Lambert, as Cycles' sun strength is: the page's own intensity by default
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = float(opt('sun', str(root_data.get('sunIntensity', 4.0)))); sun.angle = math.radians(0.53)
# a low sun is warm: the page's own sun colour when given, else a golden default
sc_col = root_data.get('sunColor')
sun.color = tuple(sc_col) if sc_col else (1.0, 0.78, 0.55)
so = bpy.data.objects.new('Sun', sun); sc.collection.objects.link(so)
# the lamp shines down its -Z: aim -Z away from the sun direction
d = mathutils.Vector((-bx, -by, -bz))
so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
if any(v is True for v in run_hooks('light', CTX).values()):   # BX hooks: a track owns the lighting: the default sky and sun go
    bpy.data.objects.remove(so, do_unlink=True)
    if sc.world is world: sc.world = None

# ---------------------------------------------------------------- render settings
sc.render.engine = 'CYCLES'
cy = sc.cycles
if not CPU:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.refresh_devices()
    for dv in prefs.devices: dv.use = (dv.type == 'OPTIX')
    cy.device = 'GPU'
    T['devices'] = [dv.name for dv in prefs.devices if dv.use]
else:
    cy.device = 'CPU'
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(opt('threads', '48'))
cy.samples = SAMPLES
cy.use_adaptive_sampling = float(opt('adaptive', '0.01')) > 0; cy.adaptive_threshold = max(1e-4, float(opt('adaptive', '0.01')))
if opt('minspp'): cy.adaptive_min_samples = int(opt('minspp'))
cy.use_denoising = opt('denoiser', 'x') != 'none'
cy.denoiser = {'oidn': 'OPENIMAGEDENOISE', 'optix': 'OPTIX'}.get(opt('denoiser', ''), 'OPTIX' if not CPU else 'OPENIMAGEDENOISE')
# BX-FIX (2026-10-04): the sampling and denoise knobs for the takes (--seed, --animseed, --clampind, --clampdir, --denoiser
# none|optix|oidn, --adaptive (0: off), --minspp; diagnostics: the takes keep the defaults, their night samples come from
# bx_render_all.mjs --nightspp; docs/notes/ar34-bx-fix.md)
cy.seed = int(opt('seed', '0')); cy.use_animated_seed = opt('animseed') is not None
if opt('clampind'): cy.sample_clamp_indirect = float(opt('clampind'))
if opt('clampdir'): cy.sample_clamp_direct = float(opt('clampdir'))
try:
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    if cy.denoiser == 'OPENIMAGEDENOISE': cy.denoising_prefilter = 'ACCURATE'; cy.denoising_quality = 'HIGH'
except Exception: pass
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 3; cy.transparent_max_bounces = 16; cy.transmission_bounces = 6
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 1.0
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = opt('look', 'None')
except Exception: pass
# the page's AgX exposure (three's toneMappingExposure is linear) as stops, plus any offset
sc.view_settings.exposure = math.log2(max(1e-3, float(root_data.get('exposure', 1.0)))) + float(opt('exposure', '0'))
# the take's motion blur (gfx motionBlur:0.5 -> a half-frame shutter) from the camera's time samples: --mblur 0.5
mb = float(opt('mblur', '0'))
sc.render.use_motion_blur = mb > 0
if mb > 0: sc.render.motion_blur_shutter = mb
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '8'
sc.render.filepath = OUT

run_hooks('settings', CTX)   # BX hooks
stats = {'objects': len(sc.objects), 'meshes': sum(1 for o in sc.objects if o.type == 'MESH'), 'pointclouds': sum(1 for o in sc.objects if o.type == 'POINTCLOUD'),
         'materials': len(bpy.data.materials), 'images': len(bpy.data.images), 'camera': cam.name if cam else None, 'sun_elev_deg': round(math.degrees(elev), 2), 'sun_rot_deg': round(math.degrees(rot), 2)}
if opt('blend'):
    tb = time.time()
    bpy.ops.wm.save_as_mainfile(filepath=opt('blend'), compress=False)
    T['save_blend'] = round(time.time() - tb, 1)
if opt('norender') is None:
    run_hooks('frame', CTX, FRAME)   # BX hooks
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    T['render'] = round(time.time() - t1, 1)
    run_hooks('done', CTX)   # BX hooks
T['total'] = round(time.time() - T['start'], 1)
del T['start']
print('RENDER_STATS ' + json.dumps({'times': T, 'stats': stats, 'out': OUT, 'frame': FRAME, 'samples': SAMPLES, 'res': [W, H]}))
