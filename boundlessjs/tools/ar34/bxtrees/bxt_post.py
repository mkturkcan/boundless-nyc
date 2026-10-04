# BX-TREES: the trees' Cycles shading on a scene blender_render.py has just set up, then the render. For proofs until the
# blender_render.py hook list (BX-SEQ) is in; with the hook, blender_trees.after_import does the same.
#   blender -b --factory-startup --python tools/ar34/export/blender_render.py --python tools/ar34/bxtrees/bxt_post.py -- \
#       --usd <root> --frame 54 --res 2560x1440 --samples 32 --norender --bxout <png> [--bxtrans 0.4] [--bxgain 1.0]
#       [--bxwind 0.12] [--bxoff]  (--bxoff: the trees' materials are left as imported: the A/B's other side)
import bpy, sys, os, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'export'))
import blender_trees as bt
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d
t0 = time.time()
res = {}
if opt('bxoff') is None:
    res = bt.apply(trans=float(opt('bxtrans', '0.4')), gain=float(opt('bxgain', '1.25')), wind=float(opt('bxwind', '0')))
sc = bpy.context.scene
sc.cycles.transparent_max_bounces = max(sc.cycles.transparent_max_bounces, int(opt('bxtb', '64')))
B = opt('bxborder')   # x0,y0,x1,y1 in 0..1 (y up): render a region only
if B:
    x0, y0, x1, y1 = [float(v) for v in B.split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = x0, y0, x1, y1
# --bxmask <regex>: a coverage mask of the objects whose name matches (the rest held out, film transparent): alpha = the trees
MK = opt('bxmask')
if MK:
    import re as _re
    rx = _re.compile(MK); nm = 0
    for ob in sc.objects:
        if ob.type in ('CAMERA', 'LIGHT'): continue
        keep = bool(rx.search(ob.name))
        ob.is_holdout = not keep; nm += keep
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.cycles.samples = 4; sc.cycles.use_denoising = False
    res['mask_objects'] = nm
sc.render.filepath = opt('bxout', '/data0/projectnyc_aux/tmp/bx/trees/post.png')
t1 = time.time()
bpy.ops.render.render(write_still=True)
print('BXT_POST ' + json.dumps({'apply': res, 'apply_s': round(t1 - t0, 1), 'render_s': round(time.time() - t1, 1), 'out': sc.render.filepath,
                                'tb': sc.cycles.transparent_max_bounces}))
