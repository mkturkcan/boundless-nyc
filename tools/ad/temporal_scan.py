# Temporal QA for recorded takes (owner 2026-10-03, the Central Park explainer: "vast amounts of shimmering and weird bugs
# in the water reflections", "the buildings have immense z fighting", "make sure there are no shadow pop-ins, make sure
# water reflections remain working throughout, and make sure this is a resolved error for future renders").
#
# Each frame k of a take is compared with its neighbours k-1 and k+1 after motion compensation: block matching on a
# 320x180 luma copy (10x10 px blocks, a 160x90 coarse search of +-10 px refined to 1 px, each pixel then taking the best
# of its own and its four neighbouring blocks' vectors), so the camera's own motion cancels and what is left is what
# CHANGED on the surfaces; the compensated differences are low-passed (40 px at 2560) so a fine texture the vectors do not
# register exactly leaves nothing, while a surface that flips or a shadow that pops moves the local mean. Checks that FAIL a
# take (exit 3):
#   * Z-FIGHT / SHIMMER: a pixel brighter (or darker) than BOTH compensated neighbours, z = sqrt(max(0, (f_k - a)(f_k - b)))
#     (smooth motion never does that: its two differences share a sign; a surface flipping between two states does it on
#     every flip). A frame counts when 5 or more cells (80x80 px at 2560) flicker over 3 levels on surfaces moving no more
#     than 4 px a frame (at 320; a car, a lamp post or leaves passing the lens move far more); 5 such frames fail the take.
#   * ALTERNATION (a mode toggling frame by frame: a fade stepping down and up, a ping-pong buffer, a probe / mirror swap):
#     the mean over the take of (-1)^k times the compensated residual f_k - (a + b)/2, per cell and channel; 2 cells over
#     2 levels fail it.
#   * EVENT POP (EP37: counted per event kind against the take's own pop rate, see event_tests): a pop (below) in a frame
#     where the engine stepped a shadow cascade's box, re-rendered the far shadow map,
#     landed the light probe or re-captured VG36's lawn field (record.mjs writes them to <take>/_events.json).
#   * REFLECTION DROPOUT: the park water's mirrors per frame (record.mjs writes <take>/_water.json): a body that fills 2 %
#     of the view without its mirror at full weight once its 0.5 s fade-in is over.
# Reported for REVIEW with strips (cars, walkers and trains near the lens trip these too, so they do not fail a take):
#   * STEP: a cell whose compensated change into frame k is over 14 levels and 3x the changes either side, and holds (a
#     shadow strip, a LoD, a reflection switching), or a large one-frame transient;
#   * STEPSCAN: tools/ad/stepscan.cjs's test (the lead's stepscan2, the SC31 cascade edge 2026-09-29), ported;
#   * persistent flicker cells and flicker bursts.
# Calibrated 2026-10-03 (docs/notes/engine-qa.md): the takes of that morning fail (t4Lake: the mirror weight alternating
# 1 / 0.93, 34 cells; exCpHandoff: the yards and roof gardens z-fighting at 1,480 m, 22 frames), the clean takes
# (t4Belvedere, t4Arrive, t3Crane after SC31) and the teaser 7 / 8 web takes pass the failing checks.
#   python tools/ad/temporal_scan.py <clips root> <take[:f0-f1]> ... [--out dir] [--json file]
# Exit 3 when a take fails, else 0. qa_scan.py runs this on every take it scans (record.mjs runs qa_scan.py after a take).
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

W, H, C = 320, 180, 10                 # analysis copy, cell
GX, GY = W // C, H // C
R0 = 10                                # coarse search radius (160x90 px): +-160 px a frame at 2560
LP = 5                                 # low-pass of the compensated differences (px at 320)
FLICK_T = 3.2                          # cell mean z (luma levels) for a flickering cell in a frame
FLICK_FRAC = 0.25                      # a cell flickering in this share of the frames fails the take (persistent)
FLICK_MIN = 4                          # ... when at least this many cells do
FLICK_BURST = 6                        # a connected region of this many flickering cells in one frame fails it (burst)
FLICK_BURST_T = 6.0                    # ... at this stronger level
ALT_T = 2.0                            # mean period-2 residual (levels) of a cell that toggles frame by frame
ALT_MIN = 2                            # cells
ZF_T, ZF_V, ZF_N, ZF_F = 3.0, 4, 5, 5  # Z-FIGHT: >= ZF_N cells flickering over ZF_T on surfaces moving <= ZF_V px a frame (at
                                       # 320) in >= ZF_F frames (a fast near object passing the lens moves far more). The
                                       # 2026-10-03 exCpHandoff of 16:38: 22 such frames; the teaser 7 / 8 takes at most 2
STEP_T = 14.0                          # a step's 90th-percentile change (levels)
STEP_X = 3.0                           # over the largest change either side


def _load(d, k, draft=True):
    p = os.path.join(d, 'frame_%05d.jpg' % k)
    if not os.path.exists(p): return None
    im = Image.open(p)
    if draft: im.draft('RGB', (W * 2, H * 2))
    return np.asarray(im.convert('RGB').resize((W, H), Image.BOX), np.float32)


def _shift_stack(img, r):
    """every shift (dy, dx) in [-r, r]^2 of img (edge-padded): (2r+1)^2 x h x w"""
    h, w = img.shape
    pad = np.pad(img, r, mode='edge')
    out = np.empty(((2 * r + 1) ** 2, h, w), np.float32)
    i = 0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out[i] = pad[r + dy:r + dy + h, r + dx:r + dx + w]; i += 1
    return out


def motion(cur, ref):
    """block vectors (vy, vx) at 320x180 that bring ref onto cur, per 10x10 block"""
    c2 = cur.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    r2 = ref.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    S = _shift_stack(r2, R0)                                            # n, 90, 160
    sad = np.abs(S - c2[None]).reshape(-1, GY, 5, GX, 5).sum(axis=(2, 4))
    dys, dxs = np.mgrid[-R0:R0 + 1, -R0:R0 + 1]
    sad += (np.abs(dys) + np.abs(dxs)).reshape(-1, 1, 1) * 2.0          # prefer the short vector on flat ground / sky
    best = sad.argmin(axis=0)
    vy, vx = dys.ravel()[best] * 2, dxs.ravel()[best] * 2               # 320x180 px
    # refine +-1 px at full analysis size, then to a fraction of a pixel (a parabola through the block's errors either side
    # of its best offset): at 320 a camera's 6 px a frame at 2560 is 0.75 px, and whole-pixel vectors left the edges of bright
    # roofs misregistered in opposite senses before and after the frame, which reads as flicker
    yy, xx = np.mgrid[0:H, 0:W]
    by, bx = yy // C, xx // C
    bvy, bvx = vy[by, bx], vx[by, bx]
    E = np.empty((3, 3, GY, GX), np.float32)
    for iy, ddy in enumerate((-1, 0, 1)):
        for ix, ddx in enumerate((-1, 0, 1)):
            sy = np.clip(yy + bvy + ddy, 0, H - 1); sx = np.clip(xx + bvx + ddx, 0, W - 1)
            E[iy, ix] = np.abs(cur - ref[sy, sx]).reshape(GY, C, GX, C).sum(axis=(1, 3))
    b = E.reshape(9, GY, GX).argmin(axis=0); iy, ix = b // 3, b % 3
    fy, fx = (iy - 1).astype(np.float32), (ix - 1).astype(np.float32)
    gy_, gx_ = np.mgrid[0:GY, 0:GX]
    def sub(e0, em, ep):
        den = em - 2 * e0 + ep
        return np.where(den > 1e-3, np.clip(0.5 * (em - ep) / np.maximum(den, 1e-3), -0.5, 0.5), 0.0)
    cy = iy == 1; cx_ = ix == 1
    e0 = E[iy, ix, gy_, gx_]
    fy += np.where(cy, sub(e0, E[0, ix, gy_, gx_], E[2, ix, gy_, gx_]), 0.0)
    fx += np.where(cx_, sub(e0, E[iy, 0, gy_, gx_], E[iy, 2, gy_, gx_]), 0.0)
    return vy + fy, vx + fx


def warp(cur, ref, refc, vy, vx):
    """ref (luma) and refc (RGB) brought onto cur: each pixel the best of its block's vector and its four neighbours',
    chosen on the 3x3-smoothed luma error; plus the mask of pixels whose source lies inside the frame"""
    yy, xx = np.mgrid[0:H, 0:W]
    by, bx = yy // C, xx // C
    best = None
    for oy, ox in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)):
        nby, nbx = np.clip(by + oy, 0, GY - 1), np.clip(bx + ox, 0, GX - 1)
        ty, tx = yy + vy[nby, nbx], xx + vx[nby, nbx]
        inside = (ty >= 0) & (ty <= H - 1) & (tx >= 0) & (tx <= W - 1)
        ty, tx = np.clip(ty, 0, H - 1.001), np.clip(tx, 0, W - 1.001)
        y0, x0 = np.floor(ty).astype(np.int32), np.floor(tx).astype(np.int32)
        wy, wx = ty - y0, tx - x0
        w00, w01, w10, w11 = (1 - wy) * (1 - wx), (1 - wy) * wx, wy * (1 - wx), wy * wx
        a = ref[y0, x0] * w00 + ref[y0, x0 + 1] * w01 + ref[y0 + 1, x0] * w10 + ref[y0 + 1, x0 + 1] * w11   # bilinear
        e = ndimage.uniform_filter(np.abs(cur - a), 3)
        if best is None or (e < best[0]).any():
            ac = refc[y0, x0] * w00[..., None] + refc[y0, x0 + 1] * w01[..., None] + refc[y0 + 1, x0] * w10[..., None] + refc[y0 + 1, x0 + 1] * w11[..., None]
        if best is None:
            best = [e, a, ac, inside]
        else:
            m = e < best[0]
            best[0] = np.where(m, e, best[0]); best[1] = np.where(m, a, best[1])
            best[2] = np.where(m[..., None], ac, best[2]); best[3] = np.where(m, inside, best[3])
    return best[1], best[2], best[3]


def stepscan(lum):
    """tools/ad/stepscan.cjs (the lead's stepscan2, SC31 2026-09-29) on the same frames: the frame-to-frame mean absolute
    difference per cell of a 16 x 6 grid over a 320x180 copy, and the frames where a cell's difference jumps over 1.8x its
    local median (3 frames either side) + 2.0 levels, in the top four rows (the bottom third is where near objects pass the
    lens). Smooth camera motion changes every frame by a similar amount; a shadow strip, a building or a LoD popping in is a
    one-frame jump. Returns [(frame index, col, row, d, med)]."""
    n = len(lum)
    D = np.zeros((n, 6, 16), np.float32)
    D[1:] = np.abs(lum[1:] - lum[:-1]).reshape(n - 1, 6, 30, 16, 20).mean(axis=(2, 4))
    hits = []
    for k in range(2, n - 1):
        lo, hi = max(1, k - 3), min(n - 1, k + 3)
        win = np.concatenate([D[lo:k], D[k + 1:hi + 1]])
        med = np.sort(win, axis=0)[len(win) // 2]
        m = D[k] > 1.8 * med + 2.0
        m[4:] = False
        for r, c in np.argwhere(m): hits.append((k, int(c), int(r), round(float(D[k, r, c]), 1), round(float(med[r, c]), 1)))
    return hits


# EP37 (2026-10-03, the explainer's takes): EVENT POP paired every pop with an engine event at its frame or the one before,
# and the light probe lands every 9 recorded frames and VG36 re-captures every 10-30 in a moving take, so in a busy take a
# third of all frames sit next to one: exCpMall's near elm trunks crossing the lens (33 steps) failed it on 13 "probe" and
# "vg36" pops, exCpBow on the Lake's ripples at f33. Now the pops are counted per event kind against the take's own pop
# rate: with q the share of frames holding a pop and p = 1 - (1 - q)^2 the chance that an event's frame or the next holds
# one, a kind fails the take when its hits are unlikely by chance (binomial tail under 1 %, and at least 2 hits); the
# shadow cascades' box steps and far-map renders, the pops the gate is for and rarer, under 10 % with 1 hit allowed (the
# 19:34 t4Crane's near-box step at f88: 1 of its 3 steps hit, in a take with one pop, tail 0.050). A kind on most frames
# cannot be told from chance and is not tested. `EP37=0` in the environment restores the old pairing.
EP37 = os.environ.get('EP37', '1') != '0'
CASCADE = ('nearBox', 'farBox', 'farMap')


def _binom_tail(h, n, p):
    """P(H >= h) for H ~ Binomial(n, p)"""
    from math import comb
    return float(sum(comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(h, n + 1)))


def event_tests(evs, pops, idx):
    elig = [k for k in idx if k > idx[0] + 1]
    if not elig: return [], []
    q = sum(1 for k in elig if k in pops) / float(len(elig))
    p = 1 - (1 - q) ** 2
    kinds = {}
    for k, e in evs.items():
        if k <= idx[0] + 1: continue                      # the take's first frames carry every event
        for x in e: kinds.setdefault(x, []).append(k)
    tests, bad = [], []
    for x, ks in sorted(kinds.items()):
        hits = [k for k in ks if k in pops or (k + 1) in pops]
        t_ = {'kind': x, 'n': len(ks), 'hits': hits, 'p': round(p, 3), 'tail': round(_binom_tail(len(hits), len(ks), p), 4) if hits else 1.0}
        tests.append(t_)
        if not hits or len(ks) > 0.5 * len(elig): continue
        if (x in CASCADE and t_['tail'] < 0.10) or (len(hits) >= 2 and t_['tail'] < 0.01): bad.append(t_)
    return tests, bad


def scan(d, f0=0, f1=100000, out_dir=None, name=None):
    name = name or os.path.basename(d.rstrip('/'))
    fr, idx = [], []
    for k in range(f0, f1 + 1):
        a = _load(d, k)
        if a is None: break
        fr.append(a); idx.append(k)
    n = len(fr)
    if n < 8: return {'name': name, 'frames': n, 'error': 'too few frames', 'fail': False}
    rgb = np.stack(fr)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    zc = np.zeros((n, GY, GX), np.float32)        # cell mean flicker
    rc = np.zeros((n, GY, GX, 3), np.float32)     # cell mean signed residual (RGB)
    bk = np.zeros((n, GY, GX), np.float32)        # backward change (p90 of |f_k - a|) per cell
    # LP37: the same changes at 4x the cell density (5 x 5 px at 320 = 40 x 40 at 2560) and a 3 px low-pass, for the
    # localized pops (a bench or a tree switching form, a shadow appearing under it) that an 80 px cell averages away
    F2 = 5; GY2, GX2 = H // F2, W // F2
    bk2 = np.zeros((n, GY2, GX2), np.float32); fw2 = np.zeros((n, GY2, GX2), np.float32); ok2 = np.zeros((n, GY2, GX2), bool)
    fw = np.zeros((n, GY, GX), np.float32)        # forward change (p90 of |f_k - b|)
    ok = np.zeros((n, GY, GX), bool)
    vm = np.zeros((n, GY, GX), np.float32)        # block motion (px at 320, the larger of the two directions)
    vsp = np.zeros((n, GY, GX), np.float32)       # LP37: spread of the block vectors in each block's 3 x 3 neighbourhood
    for k in range(1, n - 1):
        va = motion(lum[k], lum[k - 1]); vb = motion(lum[k], lum[k + 1])
        vm[k] = np.maximum(np.hypot(*va), np.hypot(*vb))
        # LP37: how much the block vectors round each block disagree (parallax at a near object's edge: the lens's own
        # motion is smooth over the mid-ground and the far field, so a LoD or shadow pop sits where they agree)
        sp = np.zeros((GY, GX), np.float32)
        for v_ in (va[0], va[1], vb[0], vb[1]):
            sp = np.maximum(sp, ndimage.maximum_filter(v_, 3) - ndimage.minimum_filter(v_, 3))
        vsp[k] = sp
        a, ac, ia = warp(lum[k], lum[k - 1], rgb[k - 1], *va)
        b, bc, ib = warp(lum[k], lum[k + 1], rgb[k + 1], *vb)
        inside = ia & ib
        # the differences low-passed (a 5x5 box, 40 px at 2560) before they are compared: a fine texture the block vectors
        # do not register exactly (pavers under a crane, leaves in the wind) leaves a zero-mean residual that this removes,
        # while a surface that flips (a z-fighting roof, a lot showing the river, a mirror fading) or a shadow that pops
        # moves the local mean and stays
        da = ndimage.uniform_filter(lum[k] - a, LP); db = ndimage.uniform_filter(lum[k] - b, LP)
        z = np.sqrt(np.maximum(0.0, da * db)) * inside
        zc[k] = z.reshape(GY, C, GX, C).mean(axis=(1, 3))
        r = (rgb[k] - 0.5 * (ac + bc)) * inside[..., None]
        rc[k] = r.reshape(GY, C, GX, C, 3).mean(axis=(1, 3))
        cell = lambda x: np.percentile(x.reshape(GY, C, GX, C).transpose(0, 2, 1, 3).reshape(GY, GX, C * C), 90, axis=2)
        bk[k] = cell(np.abs(da) * ia); fw[k] = cell(np.abs(db) * ib)
        da2 = ndimage.uniform_filter(lum[k] - a, 3); db2 = ndimage.uniform_filter(lum[k] - b, 3)
        cell2 = lambda x: np.percentile(x.reshape(GY2, F2, GX2, F2).transpose(0, 2, 1, 3).reshape(GY2, GX2, F2 * F2), 80, axis=2)
        bk2[k] = cell2(np.abs(da2) * ia); fw2[k] = cell2(np.abs(db2) * ib)
        ok2[k] = inside.reshape(GY2, F2, GX2, F2).mean(axis=(1, 3)) > 0.95
        ok[k] = inside.reshape(GY, C, GX, C).mean(axis=(1, 3)) > 0.9
    inner = slice(1, n - 1)
    # FLICKER
    fl = (zc > FLICK_T) & ok
    frac = fl[inner].mean(axis=0)
    persist = np.argwhere(frac >= FLICK_FRAC)
    bursts = []
    for k in range(1, n - 1):
        m = (zc[k] > FLICK_BURST_T) & ok[k]
        if m.sum() < FLICK_BURST: continue
        lab, nl = ndimage.label(m)
        sz = ndimage.sum(np.ones_like(m, np.float32), lab, range(1, nl + 1))
        big = int(sz.max()) if nl else 0
        if big >= FLICK_BURST:
            ys, xs = np.nonzero(lab == int(np.argmax(sz)) + 1)
            bursts.append({'frame': idx[k], 'cells': big, 'z': round(float(zc[k][m].mean()), 1),
                           'x': [int(xs.min()) * C * 8, int(xs.max() + 1) * C * 8], 'y': [int(ys.min()) * C * 8, int(ys.max() + 1) * C * 8]})
    # ALTERNATION
    sgn = np.where((np.arange(n) % 2) == 0, 1.0, -1.0)[:, None, None, None]
    alt = np.abs((rc[inner] * sgn[inner]).mean(axis=0)).max(axis=-1)
    altc = np.argwhere(alt > ALT_T)
    # STEP
    steps = []
    for k in range(2, n - 2):
        side = np.maximum(bk[k - 1], bk[k + 1])                           # the changes into k-1 and out of k
        step = (bk[k] > STEP_T) & (bk[k] > STEP_X * side) & (fw[k] < 0.5 * bk[k])           # k+1 keeps the new state
        quiet = np.maximum(bk[k - 1], fw[k + 1])                          # k-1 and k+1 agree with their own neighbours
        trans = (np.minimum(bk[k], fw[k]) > 1.6 * STEP_T) & (np.minimum(bk[k], fw[k]) > STEP_X * quiet)   # k alone differs
        m = ok[k] & ok[k - 1] & ok[k + 1] & (step | trans)
        if m.sum():
            ys, xs = np.nonzero(m)
            steps.append({'frame': idx[k], 'cells': int(m.sum()), 'kind': 'step' if step[m].any() else 'transient',
                          'd': round(float(bk[k][m].max()), 1), 'x': [int(xs.min()) * C * 8, int(xs.max() + 1) * C * 8], 'y': [int(ys.min()) * C * 8, int(ys.max() + 1) * C * 8]})
    ss = [{'frame': idx[k], 'cell': [c, r], 'd': d, 'med': md} for k, c, r, d, md in stepscan(lum)]
    # LP37 (REVIEW): the same step test on 40 px cells, where a bench or a tree switching form shows; a dolly's parallax and
    # walkers trip it as well (exCpMall: 120-150 a take with or without the switches), so it does not fail a take: the
    # engine's own `lod` events do (FP37 below)
    fine = []
    for k in range(2, n - 2):
        side2 = np.maximum(bk2[k - 1], bk2[k + 1])
        m2 = (bk2[k] > 20.0) & (bk2[k] > STEP_X * side2) & (fw2[k] < 0.5 * bk2[k]) & ok2[k] & ok2[k - 1] & ok2[k + 1]
        if m2.any():
            ys2, xs2 = np.nonzero(m2)
            fine.append({'frame': idx[k], 'cells': int(m2.sum()), 'x': int(xs2.min()) * 40, 'y': int(ys2.min()) * 40})
    rep = {'name': name, 'frames': n, 'range': [idx[0], idx[-1]], 'stepscan': ss,
           'flicker': {'cells_persistent': int(len(persist)), 'max_frac': round(float(frac.max()), 2), 'mean_z': round(float(zc[inner].mean()), 2),
                       'worst': [{'x': int(x) * C * 8, 'y': int(y) * C * 8, 'frac': round(float(frac[y, x]), 2)} for y, x in persist[np.argsort(-frac[tuple(persist.T)])][:6]] if len(persist) else [],
                       'bursts': bursts},
           'alternation': {'cells': int(len(altc)), 'max': round(float(alt.max()), 2), 'over': {str(t): int((alt > t).sum()) for t in (1.0, 1.5, 2.0, 3.0, 5.0)},
                           'worst': [{'x': int(x) * C * 8, 'y': int(y) * C * 8, 'v': round(float(alt[y, x]), 1)} for y, x in altc[np.argsort(-alt[tuple(altc.T)])][:6]] if len(altc) else []},
           'steps': steps}
    rep['_arr'] = {'zc': zc, 'bk': bk, 'fw': fw, 'ok': ok, 'alt': alt, 'idx': idx, 'vm': vm, 'bk2': bk2, 'fw2': fw2, 'ok2': ok2, 'vsp': vsp}   # for calibration (dropped from the JSON)
    # the verdict: `why` fails the take (calibrated: the 2026-10-03 bad takes fail, the clean and the teaser 7 / 8 takes pass),
    # `review` lists what a person should look at (cars, walkers and trains passing the lens trip these too)
    why, review = [], []
    nk = ((zc > ZF_T) & ok & (vm <= ZF_V)).sum(axis=(1, 2))
    zf = [idx[k] for k in range(n) if nk[k] >= ZF_N]
    rep['zfight'] = {'frames': zf[:40], 'max_cells': int(nk.max())}
    if len(zf) >= ZF_F: why.append('Z-FIGHT/SHIMMER: %d frames with >= %d slow surfaces flickering (max %d cells; frames %s)' % (len(zf), ZF_N, nk.max(), ', '.join(map(str, zf[:8]))))
    if len(altc) >= ALT_MIN: why.append('ALTERNATION: %d cells toggle frame by frame (max %.1f levels)' % (len(altc), alt.max()))
    if len(persist) >= FLICK_MIN: review.append('flicker: %d cells flicker in >= %d %% of the frames (worst %.0f %%)' % (len(persist), FLICK_FRAC * 100, frac.max() * 100))
    if bursts: review.append('flicker bursts: %d frame(s), largest %d cells at frame %d' % (len(bursts), max(b['cells'] for b in bursts), max(bursts, key=lambda b: b['cells'])['frame']))
    if steps: review.append('steps: %s' % ', '.join('f%d %s %dc d%.0f' % (s['frame'], s['kind'], s['cells'], s['d']) for s in steps[:6]))
    if ss: review.append('stepscan: %d jump(s) at frames %s' % (len(ss), ', '.join(sorted({str(h['frame']) for h in ss}, key=int)[:8])))
    rep['fine_steps'] = fine[:60]
    if fine: review.append('fine steps (40 px, d>=20): %d frame(s), first %s' % (len(fine), ', '.join('f%d' % f_['frame'] for f_ in fine[:6])))
    # EVENT POP: a pop found above (STEP or STEPSCAN) in a frame where the engine changed something that draws everything at
    # once (record.mjs _events.json: a shadow cascade's box stepped, the far shadow map re-rendered, the light probe landed,
    # VG36's lawn field re-captured): a renderer pop, not a car or a walker passing the lens
    ej = os.path.join(d, '_events.json')
    if os.path.exists(ej):
        try:
            evs = {int(i): e for i, e in json.load(open(ej)).get('frames', []) if f0 <= int(i) <= f1}
            popf = sorted({s_['frame'] for s_ in steps} | {h['frame'] for h in ss})
            hit = [(k, evs.get(k) or evs.get(k - 1)) for k in popf if k > idx[0] + 1 and (evs.get(k) or evs.get(k - 1))]
            rep['events'] = {'frames': len(evs), 'kinds': sorted({x for e in evs.values() for x in e}), 'pops_on_events': hit[:12]}
            # FP37: an in-view LOD or level switch logged by the engine (city/cpFloraKit.js lodSet, THREE.LOD) after the take's
            # first frames fails the take outright: under the film policy nothing visible changes form within a take
            lodf = sorted(k for k, e in evs.items() if 'lod' in e and k > idx[0] + 1)
            rep['events']['lod'] = lodf[:20]
            if lodf: why.append('LOD SWITCH: visible form or level switches mid-take at f%s' % ', f'.join(map(str, lodf[:8])))
            evs = {k: [x for x in e if x != 'lod'] for k, e in evs.items()}
            evs = {k: e for k, e in evs.items() if e}
            if not EP37:
                if hit: why.append('EVENT POP: %d pop(s) on engine events: %s' % (len(hit), ', '.join('f%d %s' % (k, '+'.join(e)) for k, e in hit[:6])))
            else:
                tests, bad = event_tests(evs, set(popf), idx)
                rep['events']['tests'] = tests
                for t_ in bad:
                    why.append("EVENT POP: %s: pops on %d of its %d frames (f%s), chance %.3f at the take's pop rate" % (
                        t_['kind'], len(t_['hits']), t_['n'], ', f'.join(map(str, t_['hits'][:6])), t_['tail']))
        except Exception as e:
            rep['events'] = {'error': str(e)[:120]}
    # REFLECTION DROPOUT: the recorder's per-frame log of the park water's mirrors (record.mjs writes _water.json): a body that
    # fills 2 % or more of the view without its mirror at full weight once its fade-in is over
    wj = os.path.join(d, '_water.json')
    if os.path.exists(wj):
        try:
            W_ = json.load(open(wj)); seen, drops = {}, []
            for i, bodies in W_.get('frames', []):
                if i < f0 or i > f1: continue
                for key, cover, w, drawn in bodies:
                    if cover <= 0: continue
                    seen.setdefault(key, i)
                    if cover >= 0.02 and i - seen[key] >= 16 and (w < 0.95 or not drawn): drops.append((i, key, w))
            rep['water'] = {'frames': len(W_.get('frames', [])), 'dropouts': len(drops)}
            if drops: why.append('REFLECTION DROPOUT: %d frame(s), first f%d %s at weight %.2f' % (len(drops), drops[0][0], drops[0][1], drops[0][2]))
        except Exception as e:
            rep['water'] = {'error': str(e)[:120]}
    rep['fail'] = bool(why); rep['why'] = why; rep['review'] = review
    if out_dir and (why or review):
        os.makedirs(out_dir, exist_ok=True)
        evs = [('burst', b) for b in bursts[:3]] + [('step', s) for s in sorted(steps, key=lambda s: -s['d'])[:4]]
        for f_ in zf[:3]:
            k_ = idx.index(f_); m_ = (zc[k_] > ZF_T) & ok[k_] & (vm[k_] <= ZF_V); ys_, xs_ = np.nonzero(m_)
            evs.append(('zfight', {'frame': f_, 'x': [int(xs_.min()) * C * 8, int(xs_.max() + 1) * C * 8], 'y': [int(ys_.min()) * C * 8, int(ys_.max() + 1) * C * 8]}))
        if len(altc) >= ALT_MIN or len(persist) >= FLICK_MIN:
            y, x = (altc[0] if len(altc) >= ALT_MIN else persist[0])
            k = idx[n // 2]
            evs.append(('alt' if len(altc) >= ALT_MIN else 'flicker', {'frame': k, 'x': [int(x) * C * 8, int(x + 1) * C * 8], 'y': [int(y) * C * 8, int(y + 1) * C * 8]}))
        for tag, ev in evs:
            k = ev['frame']; x0, x1 = ev['x']; y0, y1 = ev['y']
            pad = 160; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(2560, x1 + pad); y1 = min(1440, y1 + pad)
            ims = []
            for kk in (k - 1, k, k + 1):
                p = os.path.join(d, 'frame_%05d.jpg' % kk)
                if os.path.exists(p): ims.append(Image.open(p).convert('RGB').crop((x0, y0, x1, y1)))
            if not ims: continue
            w, h = ims[0].size; s = 600 / max(w, h)
            strip = Image.new('RGB', (int(w * s) * len(ims) + 8 * (len(ims) - 1), int(h * s)), (255, 140, 0))
            for i, im in enumerate(ims): strip.paste(im.resize((int(w * s), int(h * s))), (i * (int(w * s) + 8), 0))
            strip.save(os.path.join(out_dir, '%s_%s_f%03d.jpg' % (name, tag, k)), quality=88)
        # the flicker map over the take's middle frame
        base = lum[n // 2]
        heat = np.kron(np.clip(frac * 255 / max(FLICK_FRAC, 1e-3), 0, 255), np.ones((C, C)))
        Image.fromarray(np.stack([np.maximum(base * 0.5, heat), base * 0.5, base * 0.5], -1).astype(np.uint8)).save(os.path.join(out_dir, '%s_flickermap.jpg' % name), quality=88)
    return rep


def line(rep):
    if rep.get('error'): return '%-14s %s' % (rep['name'], rep['error'])
    f, a = rep['flicker'], rep['alternation']
    s = '%-14s %4d frames: flicker %d persistent cells (max %.0f %%), %d bursts; alternation max %.1f; %d steps' % (
        rep['name'], rep['frames'], f['cells_persistent'], f['max_frac'] * 100, len(f['bursts']), a['max'], len(rep['steps']))
    s += ('  -> TEMPORAL FAIL: ' + ' | '.join(rep['why']) if rep['fail'] else '  -> ok')
    return s + ('\n%-14s review (not failing): %s' % ('', ' | '.join(rep['review'])) if rep.get('review') else '')


if __name__ == '__main__':
    args = sys.argv[1:]
    def opt(nm, default=None):
        if nm in args:
            i = args.index(nm); v = args[i + 1]; del args[i:i + 2]; return v
        return default
    out_dir, json_out = opt('--out'), opt('--json')
    root, takes = args[0], args[1:]
    reps, fail = {}, False
    for t in takes:
        nm, rng = (t.split(':') + [None])[:2]
        f0, f1 = (int(x) for x in rng.split('-')) if rng else (0, 100000)
        rep = scan(os.path.join(root, nm), f0, f1, out_dir, nm)
        reps[nm] = rep; fail |= rep.get('fail', False)
        print(line(rep), flush=True)
    if json_out:
        for r in reps.values(): r.pop('_arr', None)
        with open(json_out, 'w') as fh: json.dump(reps, fh, indent=1)
    sys.exit(3 if fail else 0)
