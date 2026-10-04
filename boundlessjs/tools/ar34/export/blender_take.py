# BX-SEQ (AR34 BX, 2026-10-02): a Cycles take of a shot, one Blender process for every frame of it.
#
#   CUDA_VISIBLE_DEVICES=2 blender -b --factory-startup --python blender_take.py -- --usd <usd dir>/<shot>.usda \
#       [--frames 0-107 | 0,54,107] [--outdir boundlessjs/shots/ad/clips_cyc/<shot>] [--samples 24] [--mblur 0.5]
#       [--mbpos END] [--res 2560x1440] [--quality 95] [--overwrite] [--blend <save .blend after the setup>]
#       [every blender_render.py option: --sky --dust --leaves --leafgain --exposure --look --harvest --hooks ...]
#
# The setup is blender_render.py's (run with BX_TAKE=1 and --norender): the import of the shot's take root (usd_write.py
# writes <shot>.usda: the camera every frame, the moving layer, the static layer of the shot's region), the moving sets as
# keyframed Empties (blender_moving.py), the hooks' after_import / light / settings, sky, sun and the render settings. Then
# every frame of the take with persistent data (the scene is synced once; a frame re-syncs only what moved), the OptiX
# denoiser, the web take's motion blur: gfx motionBlur 0.5 is a trailing half-frame streak (core/engine.js MotionBlurPass,
# MB28: from the previous pose to this one), so the shutter is 0.5 frames ending at the frame (--mbpos END). Frames are
# written as the web takes are: frame_%05d.jpg, JPEG q95, 2560x1440, into boundlessjs/shots/ad/clips_cyc/<shot>/ by default.
# Existing frames are kept (a take is never overwritten without --overwrite). Each frame calls the hooks' frame(ctx, f).
# Prints a TAKE_FRAME line per frame and TAKE_STATS at the end; take.json in the frames' folder holds the same.
import os, sys, time, json

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(n, d=None):
    if '--' + n in argv:
        i = argv.index('--' + n)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
    return d

os.environ['BX_TAKE'] = '1'
if '--norender' not in argv:
    sys.argv = sys.argv + (['--norender'] if '--' in sys.argv else ['--', '--norender'])
if '--samples' not in argv:
    sys.argv += ['--samples', '24']
if '--mblur' not in argv:
    sys.argv += ['--mblur', '0.5']
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
t_setup = time.time()
import blender_render as BR   # the setup (no still render: --norender)
import bpy
t_setup = time.time() - t_setup

sc, CTX, T = BR.sc, BR.CTX, BR.T
shot = CTX.get('shot') or os.path.splitext(os.path.basename(BR.USD))[0]
fr = opt('frames')
if fr:
    frames = []
    for part in fr.split(','):
        if '-' in part: a, b = part.split('-'); frames += list(range(int(a), int(b) + 1))
        elif part: frames.append(int(part))
else:
    frames = list(range(sc.frame_start, sc.frame_end + 1))
root = os.path.abspath(os.path.join(here, '..', '..', '..', '..'))
outdir = os.path.abspath(opt('outdir', os.path.join(root, 'boundlessjs', 'shots', 'ad', 'clips_cyc', shot)))
os.makedirs(outdir, exist_ok=True)
CTX['take'] = True; CTX['frames'] = frames; CTX['outdir'] = outdir
# a part of a take (--frames a-b, several processes on one GPU) logs to its own take_<a>-<b>.json
logname = 'take.json' if not fr else f'take_{frames[0]}-{frames[-1]}.json'

# the take's render settings: persistent data, the trailing half-frame shutter, JPEG like the web takes
sc.render.use_persistent_data = True
sc.render.motion_blur_position = opt('mbpos', 'END')
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.image_settings.quality = int(opt('quality', '95'))
sc.render.use_file_extension = False

log = {'shot': shot, 'usd': BR.USD, 'frames': len(frames), 'samples': sc.cycles.samples, 'res': [sc.render.resolution_x, sc.render.resolution_y],
       'mblur': sc.render.motion_blur_shutter if sc.render.use_motion_blur else 0, 'mbpos': sc.render.motion_blur_position,
       'setup_s': round(t_setup, 1), 'setup': {k: v for k, v in T.items() if k != 'start'}, 'per_frame': []}
overwrite = opt('overwrite') is not None
t_all = time.time()
for f in frames:
    path = os.path.join(outdir, f'frame_{f:05d}.jpg')
    if os.path.exists(path) and not overwrite:
        print('TAKE_FRAME ' + json.dumps({'frame': f, 'kept': True}), flush=True); continue
    t1 = time.time()
    sc.frame_set(f)
    CTX['frame'] = f
    BR.run_hooks('frame', CTX, f)
    t2 = time.time()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    rec = {'frame': f, 'secs': round(time.time() - t1, 2), 'render': round(time.time() - t2, 2)}
    log['per_frame'].append(rec)
    print('TAKE_FRAME ' + json.dumps(rec), flush=True)
    json.dump(log, open(os.path.join(outdir, logname), 'w'), indent=1)
BR.run_hooks('done', CTX)
secs = [r['secs'] for r in log['per_frame']]
log['total_s'] = round(time.time() - t_all, 1)
log['mean_frame_s'] = round(sum(secs) / len(secs), 2) if secs else None
log['first_frame_s'] = secs[0] if secs else None
log['hooks'] = T.get('hooks')
json.dump(log, open(os.path.join(outdir, logname), 'w'), indent=1)
print('TAKE_STATS ' + json.dumps({k: v for k, v in log.items() if k != 'per_frame'}))
