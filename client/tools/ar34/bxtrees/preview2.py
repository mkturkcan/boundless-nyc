# TREEUE (AR34, 2026-10-07): preview renders of the second tree set (Cycles, GPU).
#
#   CUDA_VISIBLE_DEVICES=1 blender -b --factory-startup --python tools/ar34/bxtrees/preview2.py -- --trees P_m0,Q_l0 \
#       [--outdir <dir>] [--res 640] [--spp 48] [--assets /data0/projectnyc_aux/assets/bxtrees2] [--onlya 1]
# Per tree (its blend/<id>.blend, LOD0): a three-quarter view in a golden sun (prev_<id>_a.png) and a walker's view from
# under the crown (prev_<id>_b.png), over a dark ground under a Nishita sky.
import bpy, sys, os, math
import mathutils
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n); return argv[i + 1]
    return d
ASSETS = opt('assets', '/data0/projectnyc_aux/assets/bxtrees2')
OUTD = opt('outdir', '/data0/projectnyc_aux/tmp/treeue/prev')
RES = int(opt('res', '640')); SPP = int(opt('spp', '48'))
os.makedirs(OUTD, exist_ok=True)

def setup(sc):
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.refresh_devices()
    for dv in prefs.devices: dv.use = (dv.type == 'OPTIX')
    sc.cycles.device = 'GPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPTIX'
    sc.cycles.transparent_max_bounces = 64
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x = sc.render.resolution_y = RES
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(32); sky.sun_rotation = math.radians(330); sky.sun_disc = False
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.6
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    L = bpy.data.lights.new('sun', 'SUN'); L.energy = 4.0; L.angle = math.radians(0.53); L.color = (1.0, 0.92, 0.82)
    o = bpy.data.objects.new('sun', L); sc.collection.objects.link(o)
    e, r = math.radians(32), math.radians(330)
    d = -mathutils.Vector((math.cos(e) * math.sin(r), -math.cos(e) * math.cos(r), math.sin(e)))
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    g = bpy.context.active_object
    m = bpy.data.materials.new('ground'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.085, 0.08, 1)
    g.data.materials.append(m)

def camera(sc, loc, target, lens):
    cd = bpy.data.cameras.new('cam'); c = bpy.data.objects.new('cam', cd); sc.collection.objects.link(c)
    cd.lens = lens; cd.clip_start = 0.05; cd.clip_end = 500
    c.location = loc
    c.rotation_euler = (mathutils.Vector(target) - mathutils.Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = c

for tid in (opt('trees') or '').split(','):
    if not tid: continue
    bpy.ops.wm.open_mainfile(filepath=f'{ASSETS}/blend/{tid}.blend')
    sc = bpy.context.scene
    for c in bpy.data.collections:
        if c.name.endswith('_LOD1'): c.hide_render = True
    setup(sc)
    zs = [(o.matrix_world @ mathutils.Vector(c)).z for o in sc.objects if o.type == 'MESH' and o.name.startswith(tid) for c in o.bound_box]
    H = max(zs) if zs else 10.0
    d = max(14.0, H * 1.7)
    camera(sc, (d * 0.6, -d * 0.8, 1.7 + H * 0.12), (0, 0, H * 0.52), 35)
    sc.render.filepath = f'{OUTD}/prev_{tid}_a.png'; bpy.ops.render.render(write_still=True)
    if opt('onlya') is None:
        camera(sc, (2.6, -4.2, 1.6), (0, 0, H * 0.72), 18)
        sc.render.filepath = f'{OUTD}/prev_{tid}_b.png'; bpy.ops.render.render(write_still=True)
    print('PREV', tid, flush=True)
