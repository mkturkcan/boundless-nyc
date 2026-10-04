# OFFLINE TARGETS (AR34 LOOK, 2026-10-02): where a Cycles frame's time goes, and what brings it down (owner, 14:2x: "isn't
# 30 s/frame a bit excessive on this GPU?"). Runs in one Blender session on a scene saved by blender_render.py --blend:
#   CUDA_VISIBLE_DEVICES=2 blender -b <key frame>.blend --python bench_cycles.py -- --out <dir> [--frame 54] [--eevee]
# Variants (each a full-resolution render of the same frame, the times from the render handlers):
#   ref      128 spp, adaptive (0.01), OptiX denoiser, motion blur 0.5, bounces 8 / 3 / 3 / 16 / 6 (the pilot's settings)
#   persist  the same with persistent data, frames f, f+1, f+2 (the second and third frames reuse the synced scene)
#   s64 s32 s16 s8 s1   fewer samples (adaptive, OptiX denoiser), persistent
#   nomb32   32 spp, motion blur off (the compositor's vector blur from the speed pass instead)
#   bnc32    32 spp, bounces 4 / 2 / 2 / 8 / 2
#   eevee    EEVEE Next (--eevee): 64 TAA samples, screen-space ray tracing, the same sky, sun and camera
# Writes <out>/bench_<variant>.png and <out>/bench.json (wall time, setup before the first sample, sampling + denoise).
import bpy, sys, time, json, os, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d
OUT = opt('out', '/tmp'); FRAME = int(opt('frame', '54'))
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
rd = json.loads(sc.get('nyc_root', '{}'))

# ---- light and look exactly as blender_render.py sets them (sky 0.15, dust 1.0, leaves 0.35 are applied by the caller's
# saved scene when it was relit; here they are set again so the bench stands alone)
import mathutils
sd = rd.get('sunDir') or [0.3, 0.3, 0.9]
bx, by, bz = sd[0], -sd[2], sd[1]
n = math.sqrt(bx * bx + by * by + bz * bz); bx, by, bz = bx / n, by / n, bz / n
world = bpy.data.worlds.new('skyb'); sc.world = world; world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.asin(bz); sky.sun_rotation = math.atan2(bx, -by); sky.sun_disc = False
sky.altitude = 30.0; sky.air_density = 1.0; sky.dust_density = 0.6; sky.ozone_density = 1.0
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.15
o = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(sky.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], o.inputs['Surface'])
for ob in [ob for ob in sc.objects if ob.type == 'LIGHT']: bpy.data.objects.remove(ob, do_unlink=True)
sun = bpy.data.lights.new('SunB', 'SUN'); sun.energy = float(rd.get('sunIntensity', 4.0)); sun.angle = math.radians(0.53)
sun.color = tuple(rd.get('sunColor', [1.0, 0.78, 0.55]))
so = bpy.data.objects.new('SunB', sun); sc.collection.objects.link(so)
so.rotation_euler = mathutils.Vector((-bx, -by, -bz)).to_track_quat('-Z', 'Y').to_euler()
cams = [ob for ob in sc.objects if ob.type == 'CAMERA']
want = str(rd.get('camera', '')).split('/')[-1]
sc.camera = next((c for c in cams if c.name == want), cams[0])
sc.camera.data.clip_start = max(0.05, sc.camera.data.clip_start)
TEST = opt('test') is not None   # a CPU dry run at 320x180 (checks the variants' code paths, no timing)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = (320, 180, 100) if TEST else (2560, 1440, 100)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = math.log2(max(1e-3, float(rd.get('exposure', 1.0))))
sc.render.image_settings.file_format = 'PNG'

# ---- the render handlers: when the first sample starts, when the render ends
EV = {}
def on_stats(*a):
    s = a[-1] if a and isinstance(a[-1], str) else ''
    if 'Sample' in s and 'first' not in EV: EV['first'] = time.time()
bpy.app.handlers.render_stats.append(on_stats)

def cycles(spp, mb=0.5, persist=False, bounces=(8, 3, 3, 16, 6), vector=False):
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    if TEST:
        cy.device = 'CPU'; cy.denoiser = 'OPENIMAGEDENOISE'
    else:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'; prefs.refresh_devices()
        for dv in prefs.devices: dv.use = (dv.type == 'OPTIX')
        cy.device = 'GPU'; cy.denoiser = 'OPTIX'
    cy.samples = spp; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.01
    cy.use_denoising = True
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces, cy.transparent_max_bounces, cy.transmission_bounces = bounces
    cy.caustics_reflective = False; cy.caustics_refractive = False
    sc.render.use_motion_blur = mb > 0
    if mb > 0: sc.render.motion_blur_shutter = mb
    sc.render.use_persistent_data = persist
    vl = sc.view_layers[0]
    vl.use_pass_vector = vector; vl.use_pass_z = vector
    sc.use_nodes = vector
    if vector:
        tree = sc.node_tree; tree.nodes.clear()
        rl = tree.nodes.new('CompositorNodeRLayers'); vb = tree.nodes.new('CompositorNodeVecBlur'); comp = tree.nodes.new('CompositorNodeComposite')
        vb.factor = 0.5; vb.samples = 16
        tree.links.new(rl.outputs['Image'], vb.inputs[0])
        tree.links.new(rl.outputs.get('Depth') or rl.outputs.get('Z'), vb.inputs[1])
        tree.links.new(rl.outputs.get('Vector') or rl.outputs.get('Speed'), vb.inputs[2])
        tree.links.new(vb.outputs['Image'], comp.inputs['Image'])

RES = {}
def run(name, frame=FRAME):
    sc.frame_set(frame)
    EV.clear()
    sc.render.filepath = os.path.join(OUT, f'bench_{name}.png')
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    t1 = time.time()
    r = {'wall': round(t1 - t0, 2)}
    if 'first' in EV: r['setup'] = round(EV['first'] - t0, 2); r['sampling'] = round(t1 - EV['first'], 2)
    RES[name] = r
    print('BENCH', name, json.dumps(r), flush=True)
    json.dump(RES, open(os.path.join(OUT, 'bench.json'), 'w'), indent=1)

if opt('only_eevee') is None:
    cycles(128); run('ref')
    cycles(128, persist=True); run('persist_f0', FRAME); run('persist_f1', FRAME + 1); run('persist_f2', FRAME + 2)
    for spp in (64, 32, 16, 8, 1):
        cycles(spp, persist=True); run(f's{spp}')
    try:
        cycles(32, mb=0, persist=True, vector=True); run('nomb32_vecblur')
    except Exception as e:
        RES['nomb32_vecblur'] = {'error': str(e)[:200]}; print('BENCH vecblur error', e)
    sc.use_nodes = False
    cycles(32, mb=0, persist=True); run('nomb32')
    cycles(32, persist=True, bounces=(4, 2, 2, 8, 2)); run('bnc32')
if opt('eevee') is not None:
    try:
        sc.use_nodes = False; sc.render.use_persistent_data = False
        try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
        except TypeError: sc.render.engine = 'BLENDER_EEVEE'
        ee = sc.eevee
        ee.taa_render_samples = int(opt('eevee_spp', '64'))
        for k, v in (('use_raytracing', True), ('use_shadows', True), ('shadow_ray_count', 2), ('shadow_step_count', 8), ('use_gtao', True)):
            if hasattr(ee, k): setattr(ee, k, v)
        if hasattr(ee, 'ray_tracing_method'): ee.ray_tracing_method = 'SCREEN'
        sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.5
        run('eevee')
    except Exception as e:
        RES['eevee'] = {'error': str(e)[:300]}; print('BENCH eevee error', e)
        json.dump(RES, open(os.path.join(OUT, 'bench.json'), 'w'), indent=1)
print('BENCH_DONE', json.dumps(RES))
