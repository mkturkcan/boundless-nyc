# TRAILERUE (2026-10-07): the vehicle check of a take rendered from a harvest (Cycles or Unreal draw the harvest's traffic,
# not the web take's draw, so the recorder's CAR-OVERLAP lines do not apply). Per frame, every pair of the harvest's
# vehicles (mov_<shot>.json: each car's per-frame matrix, its kind's size from the groups) whose front bodies overlap in
# plan (oriented boxes, separating axes), with the depth, whether the pair is inside the frame's frustum (cam_<shot>.json;
# occlusion is not tested) and its distance from the lens. Articulated rear bodies are not tested.
#   python3 tools/ad/trailerue_vehcheck.py <harvest dir> [--deep 0.15] [--near 150] [--regions <take>/_ue/regions] [--json f]
# Exit 3 when a pair at least --deep m deep is in view within --near m (the clearance tool's in-view rule, with a distance
# limit); every pair is listed. With --regions (an Unreal take's data pass, ue_frames.py: 5 = vehicles) the occlusion is
# known: such a pair fails only when vehicle pixels cover its overlap in one of up to five of its in-view frames (a disc
# round the projected overlap, radius 600 / distance px, at least 6); else it is listed as hidden.
import json, math, os, sys

A = sys.argv[1:]
def opt(k, d=None):
    return A[A.index('--' + k) + 1] if '--' + k in A else d
H = A[0]
DEEP, NEAR = float(opt('deep', 0.15)), float(opt('near', 150))
man = json.load(open(os.path.join(H, 'manifest.json')))
shot = next(iter(man.get('shots', {}))) if isinstance(man.get('shots'), dict) else [f[4:-5] for f in os.listdir(H) if f.startswith('mov_')][0]
mov = json.load(open(os.path.join(H, f'mov_{shot}.json')))
cam = json.load(open(os.path.join(H, f'cam_{shot}.json')))
size = {int(g['gi']): [float(v) for v in (g['size'] if isinstance(g['size'], list) else json.loads(g['size']))] for g in mov['groups']}

def box(m, sz):   # plan box from a column-major 3x4 (three.js elements 0-2, 4-6, 8-10, 12-14): centre, axes, half sizes
    ax = (m[0], m[2]); az = (m[6], m[8])
    lx, lz = math.hypot(*ax) or 1.0, math.hypot(*az) or 1.0
    return (m[9], m[11]), (ax[0] / lx, ax[1] / lx), (az[0] / lz, az[1] / lz), sz[0] / 2 * lx, sz[2] / 2 * lz

def depth(b1, b2):   # separating axes: the smallest overlap along the four box axes (0 when apart)
    (c1, u1, v1, a1, b1_), (c2, u2, v2, a2, b2_) = b1, b2
    d = (c2[0] - c1[0], c2[1] - c1[1]); best = 1e9
    for ax in (u1, v1, u2, v2):
        r1 = a1 * abs(u1[0] * ax[0] + u1[1] * ax[1]) + b1_ * abs(v1[0] * ax[0] + v1[1] * ax[1])
        r2 = a2 * abs(u2[0] * ax[0] + u2[1] * ax[1]) + b2_ * abs(v2[0] * ax[0] + v2[1] * ax[1])
        o = r1 + r2 - abs(d[0] * ax[0] + d[1] * ax[1])
        if o <= 0: return 0.0
        best = min(best, o)
    return best

def in_view(cm, p):   # inside the frame's frustum (the camera looks down its -z); also the point's place in a 2560 x 1440 frame
    m = cm['m']; e = (p[0] - m[12], p[1] - m[13], p[2] - m[14])
    x = e[0] * m[0] + e[1] * m[1] + e[2] * m[2]; y = e[0] * m[4] + e[1] * m[5] + e[2] * m[6]; z = -(e[0] * m[8] + e[1] * m[9] + e[2] * m[10])
    dist = math.sqrt(sum(v * v for v in e))
    if z <= 0.4: return False, dist, None
    t = math.tan(math.radians(float(cm['fov'])) / 2); asp = float(cm['aspect'])
    px = (round(1280 + 1280 * x / (z * t * asp)), round(720 - 720 * y / (z * t)))
    return abs(y) <= z * t and abs(x) <= z * t * asp, dist, px

cars = [c for c in mov['cars'] if c.get('m')]
pairs = {}
for f in range(len(cam)):
    live = []
    for c in cars:
        if not (c['f0'] <= f <= c['f1']): continue
        M = c['m'][f - c['f0']] if len(c['m']) == c['f1'] - c['f0'] + 1 else c['m'][min(f, len(c['m']) - 1)]
        live.append((c, box(M, size[c['g']]), M))
    cell = {}
    for i, (c, b, M) in enumerate(live):
        cell.setdefault((int(b[0][0] // 20), int(b[0][1] // 20)), []).append(i)
    for (gx, gz), idx in cell.items():
        near = [j for dx in (-1, 0, 1) for dz in (-1, 0, 1) for j in cell.get((gx + dx, gz + dz), [])]
        for i in idx:
            for j in near:
                if j <= i: continue
                d = depth(live[i][1], live[j][1])
                if d <= 0.02: continue
                ci, cj = live[i][0], live[j][0]
                mid = ((live[i][1][0][0] + live[j][1][0][0]) / 2, live[i][2][10] + 1.0, (live[i][1][0][1] + live[j][1][0][1]) / 2)
                v, dist, px = in_view(cam[f], mid)
                k = (ci['id'], cj['id'])
                q = pairs.setdefault(k, {'a': ci['id'], 'b': cj['id'], 'kinds': f"{ci['kind']} x {cj['kind']}", 'frames': [], 'max_depth': 0, 'in_view': 0, 'min_dist': 1e9, 'at': None})
                q['frames'].append(f); q['max_depth'] = max(q['max_depth'], round(d, 2))
                if v:
                    q['in_view'] += 1
                    q.setdefault('seen', []).append([f, px[0], px[1], round(dist, 1)])
                    if dist < q['min_dist']: q['min_dist'] = round(dist, 1); q['at'] = [f, px[0], px[1]]
bad = [q for q in pairs.values() if q['in_view'] and q['max_depth'] >= DEEP and q['min_dist'] <= NEAR]
RG = opt('regions')
if RG:   # occlusion from the Unreal take's region pass: vehicle pixels (5) over the overlap in a sampled in-view frame
    import numpy as np
    from PIL import Image
    keep = []
    for q in bad:
        seen = [x for x in q['seen'] if x[3] <= NEAR]
        pick = [seen[int(i * (len(seen) - 1) / 4)] for i in range(5)] if len(seen) > 5 else seen
        hits = []
        for f, x, y, dist in pick:
            fp = os.path.join(RG, f'frame_{f:05d}.png')
            if not os.path.exists(fp): continue
            a = np.asarray(Image.open(fp)); r = max(6, int(600 / max(dist, 1)))
            yy, xx = np.ogrid[:a.shape[0], :a.shape[1]]
            disc = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
            n = int(((a == 5) & disc).sum())
            if n >= max(12, disc.sum() // 6): hits.append([f, n])
        q['visible'] = hits
        if hits: keep.append(q)
        else: q['hidden'] = True
    bad = keep
for q in sorted(pairs.values(), key=lambda q: (-(q in bad), -q['max_depth'])):
    fr = q['frames']
    tag = 'FAIL' if q in bad else ('hidden' if q.get('hidden') else 'info')
    print(f"{tag} {q['kinds']} ({q['a']} / {q['b']}) f{fr[0]}-{fr[-1]} ({len(fr)} frames) depth {q['max_depth']} m, "
          f"in view {q['in_view']} frames" + (f", nearest {q['min_dist']} m at frame {q['at'][0]} pixel {q['at'][1]},{q['at'][2]}" if q['in_view'] else ''))
print(f"{shot}: {len(cars)} vehicles, {len(pairs)} overlapping pairs, {len(bad)} in view within {NEAR} m at >= {DEEP} m -> {'FAIL' if bad else 'PASS'}")
if opt('json'):
    json.dump({'shot': shot, 'pairs': list(pairs.values()), 'fail': bool(bad), 'deep': DEEP, 'near': NEAR}, open(opt('json'), 'w'), indent=1)
sys.exit(3 if bad else 0)
