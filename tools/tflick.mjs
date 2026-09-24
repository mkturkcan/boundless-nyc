// TEMPORAL FLICKER HUNTER — boundless.js NYC digital twin.  (glitch-r7)
//
// tools/zfight.mjs answers "do two surfaces trade the depth test in a STILL
// frame". The owner's complaint is about the FILM: "there is still a lot of z
// fighting and similar graphics errors" while the camera moves. Four whole
// classes of motion artefact are invisible to a still-frame instrument, because
// none of them is a depth tie in a static frame:
//
//   * shadow-map acne / edge shimmer   (zfight PINS the maps)
//   * screen-space crawl: SSR/SSGI/GTAO/haze/godrays  (zfight turns them OFF)
//   * TAA history + reprojection ghosting  (zfight turns TAA OFF)
//   * LoD / streaming pops  (zfight renders its pair inside one sync block)
//
// So: shoot each framing as a SHORT MOVING SEQUENCE — n frames with the camera
// advanced --step metres per frame along its own view axis — and compute
// per-pixel TEMPORAL statistics. Everything happens in ONE synchronous
// page.evaluate: no rAF, so the streamer, the dresser and the traffic cannot
// move and no frame can land mid-present.
//
// THE STATISTIC. A moving camera moves every silhouette, so raw variance is
// dominated by honest parallax. Over a 10 cm dolly parallax is MONOTONIC (a
// pixel's luma ramps one way) while a fight FLIPS. Per pixel over luma L_i:
//
//     slope = sum(t_i L_i)/sum(t_i^2),  t_i = i - (n-1)/2
//     resid = L_i - mean - slope*t_i
//     rms   = sqrt(sum(resid^2)/n)          <- parallax ramps cancel
//     flips = sign changes of consecutive dL with |dL| >= --ft
//
//     FLICKER := rms >= --rt AND flips >= 2        (red in the map)
//     RAMP    := range >= 6 AND flips <  2         (blue: the parallax control)
//
// MODES (each sets every flag explicitly, so order cannot leak):
//   geom  shadows pinned, screen-space off, TAA off   -> depth ties, alpha crawl
//   shad  shadows RE-RENDER + updateSun per frame     -> shadow acne / shimmer
//   post  screen-space passes ON                      -> SSR/SSGI/GTAO/haze crawl
//   film  shadows live + screen-space on + TAA on     -> what the owner sees
// Grain, the exposure meter, the light probe, motion blur and bokeh are stubbed
// in ALL modes: they vary everywhere by design. Motion blur off is deliberate —
// it SMEARS flicker and would hide it.
//
//   node tools/tflick.mjs --views ad
//   node tools/tflick.mjs --views fMarkings,fStreetGeom --modes geom,shad
//   node tools/tflick.mjs --views fMarkings --sw --size 960x540      # no GPU lock
//   node tools/tflick.mjs --views ad --label after                   # A/B a fix
//
// Out: boundlessjs/shots/glitch-r7/<view>[_label]_{ref,<mode>_flick,<mode>_crops}.png
//      + <view>[_label].json   (per-mode stats, hot tiles, raycast probes)
import { chromium } from 'playwright';
import { acquireGpu } from './gpulock.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bdir = path.join(root, 'boundlessjs');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d; };
const has = (n) => args.includes('--' + n);

// ---------------------------------------------------------------- framings
// mirror of boundlessjs/src/shared/geo.js project()
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];

const SPEC = JSON.parse(await fs.readFile(path.join(root, 'tools', 'ad', 'shots.json'), 'utf8'));
const AD = {};
for (const [k, v] of Object.entries(SPEC.shots)) {
  const k0 = v.keys[0];
  AD[k] = { time: v.time || 'golden', p: k0.p, look: k0.look || k0.p, flags: v.flags || '', title: v.title || '' };
}
const L = (lon, lat, alt, tlon, tlat, talt, time = 'day', title = '') => ({ time, p: [lon, lat, alt], look: [tlon, tlat, talt], title });
const W = (x, z, alt, tx, tz, talt, time = 'day', title = '') => {
  const [a, b] = unproject(x, z), [c, d] = unproject(tx, tz);
  return { time, p: [a, b, alt], look: [c, d, talt], title };
};
// close-ups aimed at THIS pass's suspects (shadow acne on walls at grazing sun,
// dresser cornice/parapet, roof clutter, thin geometry, tree cards)
const CLOSE = {
  gxWall:      W(2136, -2742, 2.0, 2170, -2736, 12, 'day', 'sunlit wall up the block: shadow acne at grazing incidence'),
  gxWallGold:  W(2136, -2742, 2.0, 2170, -2736, 12, 'golden', 'same wall, low sun: the worst acne case'),
  gxCornice:   W(2062, -2436, 14, 2046, -2424, 20, 'day', 'brownstone cornice/parapet/coping line at 20 m'),
  gxRoof:      W(2062, -2452, 34, 2050, -2430, 20, 'day', 'roof decks + bulkheads + clutter from above'),
  gxThin:      W(2143, -2757, 1.7, 2200, -2730, 6, 'day', 'signal masts, wires, racks: thin geometry + TAA'),
  gxTrees:     W(2044, -2444, 1.8, 2050, -2410, 6, 'day', 'street tree cards: alpha-test crawl'),
  gxLod:       W(2128, -2765, 300, 2900, -3400, 0, 'day', 'near tiles -> macro ground at the 820 m seam'),
  gxTower:     W(-40, 1200, 120, 200, 2400, 260, 'golden', 'midtown tower crowns + setbacks'),
};
const VIEWS = { ...AD, ...CLOSE };
const GROUPS = {
  ad: Object.keys(AD), closeups: Object.keys(CLOSE), all: Object.keys(VIEWS),
  street: ['fMarkings', 'mLenoxEye', 'mBrownstone', 'fBrownstone', 'mCollegeWalk', 'fColumbia'],
  air: ['fStreetGeom', 'mLowAerial', 'mMidtownSky', 'fSkyline', 'swipeLenoxAir', 'mLenoxTop', 'fTraffic', 'fWeather'],
};
const names = (opt('views', 'ad')).split(',').flatMap((n) => GROUPS[n] || [n]).filter((n) => {
  if (!VIEWS[n]) { console.log('unknown view', n); return false; }
  return true;
});
if (!names.length) { console.log('nothing to do'); process.exit(0); }

const outDir = path.resolve(root, opt('out', 'boundlessjs/shots/glitch-r7'));
const SW = has('sw');
const [VW, VH] = (opt('size', SW ? '960x540' : '1920x1080')).split('x').map(Number);
const NF = Number(opt('n', '6'));            // frames per sequence
const STEP = Number(opt('step', '0.02'));    // metres per frame along the view axis
const WARM = Number(opt('warm', '3'));       // warm-up frames (TAA history in its moving regime)
const RT = Number(opt('rt', '2.5'));         // detrended rms that counts as flicker (luma 0..255)
const FT = Number(opt('ft', '2'));           // |dL| that counts toward a sign flip
const TILE = Number(opt('tile', '32'));
const MODES = (opt('modes', 'geom,shad,post,film')).split(',');
const BASE_FLAGS = opt('flags', SPEC._meta?.flags || 'nopeds=1&hud=0');
const bootMs = Number(opt('boot', '220000'));
const label = opt('label', '');
const nProbes = Number(opt('probes', '10'));
// --eval "<js>": runs once per framing after PREP with `E` = window.__ENGINE.
// This is how a shadow-parameter A/B is taken without touching the source:
//   --modes acne --eval "E.sun.shadow.normalBias=0.28"
// --evalfile <path>: same, from a file, for anything with quotes in it
const EVAL = opt('evalfile') ? await fs.readFile(path.resolve(opt('evalfile')), 'utf8') : opt('eval', '');
const BIASMUL = Number(opt('biasmul', '5'));   // mode `acne`: shadow.bias multiplier
const NBMUL = Number(opt('nbmul', '0'));       // mode `acne`: normalBias multiplier (0 = same as biasmul)  // mode `acne`: bias/normalBias multiplier
const HRT = Number(opt('hrt', '0'));           // attribution sampled only from pixels with rms >= this (0 = rt)
const NHIST = Number(opt('hist', '300'));     // hot pixels sampled for the attribution histogram  // mode `acne`: bias/normalBias multiplier

await fs.mkdir(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MATID = { 0: 'asphalt', 1: 'sidewalk', 2: 'curb', 3: 'paintW', 4: 'paintY', 5: 'grass', 6: 'path', 7: 'terrain', 9: 'paintG', 10: 'brick', 11: 'gutter', 12: 'busred', 13: 'warn', 14: 'warnIron' };

// ---------------------------------------------------------------- page side
// Stash the pipeline's own settings and stub everything that varies frame to
// frame for reasons that are not geometry, shadows, screen-space passes or TAA.
const PREP = `(() => {
  const E = window.__ENGINE;
  if (!E) return 'no engine';
  const done = [];
  const S = window.__TF = { post: {}, taaAmount: (E.taa && E.taa.amount) || 0.85 };
  for (const p of ['ssr', 'ssgi', 'gtao', 'haze', 'godrays']) if (E[p]) S.post[p] = E[p].enabled !== false;
  if (E.grade && E.grade.uniforms && E.grade.uniforms.uGrain) { E.grade.uniforms.uGrain.value = 0; done.push('grain'); }
  if (E.moblur) { E.moblur.enabled = false; done.push('-moblur'); }
  if (E.bokeh) { E.bokeh.enabled = false; done.push('-bokeh'); }
  E._meterExposure = function () {}; done.push('exposure');
  E._updateProbe = function () {}; done.push('probe');
  try { E.camera.clearViewOffset(); done.push('viewoffset'); } catch (e) {}
  if (E.sun2) { E.sun2.shadow.autoUpdate = false; E.sun2.shadow.needsUpdate = false; done.push('far-pinned'); }
  S.sunDir = E.sun.position.clone().sub(E.sunTarget.position).normalize();
  S.have = Object.keys(S.post).join('+');
  return done.join(',') + '  passes:' + S.have;
})()`;

const SETMODE = `(m) => {
  const E = window.__ENGINE, S = window.__TF;
  const wantPost = (m === 'post' || m === 'film');
  const wantTaa = (m === 'taa' || m === 'film');
  for (const p of ['ssr', 'ssgi', 'gtao', 'haze', 'godrays']) if (E[p]) E[p].enabled = wantPost ? S.post[p] : false;
  if (E.taa) {
    E.taa.enabled = wantTaa;
    E.taa.amount = wantTaa ? S.taaAmount : 0;
    E.taa._first = true;
    // the film's camera is MOVING, so engine.js's still-detector has decayed to
    // 0 (movingNow = dp > 0.012 m and our step is 0.02): no Halton jitter, and
    // uBlend = amount * 0.3. Reproduce that regime exactly.
    E.taa.stillBlend = 0;
    E._still = 0;
  }
  try { E.camera.clearViewOffset(); } catch (e) {}
  return m;
}`;

// GRAB the sequence and reduce it to per-pixel temporal statistics IN THE PAGE.
// Returning 6 full frames per mode per framing would be 300 MB of base64; the
// reduction is ~1 s of JS and comes back as three small PNGs plus numbers.
const GRABFN = `(cfg) => {
  const E = window.__ENGINE, gl = E.renderer.domElement;
  const W = gl.width, H = gl.height, N = cfg.n;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  const e = E.camera.matrixWorld.elements;
  const fwd = [-e[8], -e[9], -e[10]];
  const p0 = E.camera.position.clone();
  const sd = window.__TF.sunDir;
  const at = (i) => {
    E.camera.position.set(p0.x + fwd[0] * cfg.step * i, p0.y + fwd[1] * cfg.step * i, p0.z + fwd[2] * cfg.step * i);
    E.camera.updateMatrixWorld(true);
  };
  // RE-PIN THE TEMPORAL STATE INSIDE THIS BLOCK. SETMODE runs in its own
  // page.evaluate, and every evaluate returns control to the event loop, so the
  // engine's own rAF frames run between SETMODE and here — and engine.js's frame
  // body recomputes _still from the camera delta (still, because we have not
  // moved it yet), which climbs past 0.55, re-applies the Halton view offset and
  // raises taa.stillBlend. The measured sequence would then be the STILL-camera
  // TAA regime with a jitter index keyed on engine.frames % 8, which differs
  // from run to run: that is how film mode came out 23.4 % and 28.8 % on two runs of
  // one unchanged scene whose geom agreed to 0.008 pp. Pinned here, inside the
  // synchronous block, where no rAF can undo it.
  try { E.camera.clearViewOffset(); } catch (e) {}
  E._still = 0; E._jittered = false;
  if (E.taa) E.taa.stillBlend = 0;
  const shoot = () => {
    // capture the jitter-free projection the TAA pass reprojects with (engine.js
    // does this in its own frame body, which we are bypassing)
    if (E.taa) {
      E.taa.unjitProj = E.taa.unjitProj || E.camera.projectionMatrix.clone();
      E.taa.unjitProjInv = E.taa.unjitProjInv || E.camera.projectionMatrixInverse.clone();
      E.taa.unjitProj.copy(E.camera.projectionMatrix);
      E.taa.unjitProjInv.copy(E.camera.projectionMatrixInverse);
    }
    if (E._sortCamPos) E._sortCamPos.copy(E.camera.position);
    E.composer.render();
    c2.drawImage(gl, 0, 0);
    return c2.getImageData(0, 0, W, H);
  };
  // SHADOWS. cfg.shadow: re-snap and re-render the near cascade every frame,
  // exactly as engine.onFrame does. Otherwise refresh the map ONCE at the base
  // camera position and pin it (three skips updateMatrices for a pinned shadow,
  // so map and matrix stay consistent).
  if (!cfg.shadow) {
    at(0);
    E.updateSun(sd, p0.x, p0.y, p0.z);
    E.sun.shadow.autoUpdate = true; E.sun.shadow.needsUpdate = true;
    E.composer.render();
    E.sun.shadow.autoUpdate = false; E.sun.shadow.needsUpdate = false;
  }
  const lum = [];
  let ref = null;
  for (let i = -cfg.warm; i < N; i++) {
    at(i);                                    // warm-up frames run BEFORE frame 0
    if (cfg.shadow) {
      const p = E.camera.position;
      E.updateSun(sd, p.x, p.y, p.z);
      E.sun.shadow.autoUpdate = true; E.sun.shadow.needsUpdate = true;
    }
    const img = shoot();
    if (i < 0) continue;
    const d = img.data, n = W * H, l = new Uint8Array(n);
    for (let k = 0, j = 0; k < n; k++, j += 4) l[k] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    lum.push(l);
    if (i === 0) ref = img;
  }
  // CONTROL: frame 0 again with the camera unmoved. zfight.mjs measured this as
  // byte-identical on every framing; if it is not zero here the numbers below
  // are noise and the run must be thrown away.
  at(0);
  if (cfg.shadow) { const p = E.camera.position; E.updateSun(sd, p.x, p.y, p.z); E.sun.shadow.autoUpdate = true; E.sun.shadow.needsUpdate = true; }
  const img2 = shoot();
  let ctlMax = 0, ctlN = 0;
  { const d = img2.data, l0 = lum[0], n = W * H;
    for (let k = 0, j = 0; k < n; k++, j += 4) {
      const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
      const dd = Math.abs(v - l0[k]); if (dd > ctlMax) ctlMax = dd; if (dd > 2) ctlN++;
    } }
  E.camera.position.copy(p0); E.camera.updateMatrixWorld(true);

  // ---- per-pixel temporal statistics
  const n = W * H;
  let stt = 0;
  for (let i = 0; i < N; i++) { const t = i - (N - 1) / 2; stt += t * t; }
  const rmsA = new Float32Array(n);
  const flipA = new Uint8Array(n);
  const rngA = new Uint8Array(n);
  let flick = 0, flick10 = 0, ramp = 0, rmsSum = 0, rmsMax = 0;
  for (let k = 0; k < n; k++) {
    let s = 0, st = 0, mn = 255, mx = 0;
    for (let i = 0; i < N; i++) { const v = lum[i][k]; s += v; st += (i - (N - 1) / 2) * v; if (v < mn) mn = v; if (v > mx) mx = v; }
    const mean = s / N, slope = st / stt;
    let acc = 0;
    for (let i = 0; i < N; i++) { const r = lum[i][k] - mean - slope * (i - (N - 1) / 2); acc += r * r; }
    const rms = Math.sqrt(acc / N);
    let sgn = 0, fl = 0;
    for (let i = 1; i < N; i++) {
      const d = lum[i][k] - lum[i - 1][k];
      if (Math.abs(d) < cfg.ft) continue;
      const s2 = d > 0 ? 1 : -1;
      if (sgn && s2 !== sgn) fl++;
      sgn = s2;
    }
    rmsA[k] = rms; flipA[k] = fl; rngA[k] = mx - mn;
    rmsSum += rms; if (rms > rmsMax) rmsMax = rms;
    if (rms >= cfg.rt && fl >= 2) { flick++; if (rms >= 10) flick10++; }
    else if (mx - mn >= 6) ramp++;
  }
  // ---- flicker map: RED = flicker (rms), BLUE = monotonic parallax
  const mv = document.createElement('canvas'); mv.width = W; mv.height = H;
  const m2 = mv.getContext('2d');
  const mi = m2.createImageData(W, H);
  const md = mi.data;
  for (let k = 0, j = 0; k < n; k++, j += 4) {
    const isF = rmsA[k] >= cfg.rt && flipA[k] >= 2;
    if (isF) { const v = Math.min(255, 60 + rmsA[k] * 12); md[j] = v; md[j + 1] = flipA[k] >= 3 ? 60 : 0; md[j + 2] = 0; }
    else if (rngA[k] >= 6) { md[j] = 0; md[j + 1] = 0; md[j + 2] = Math.min(160, 30 + rngA[k] * 2); }
    md[j + 3] = 255;
  }
  m2.putImageData(mi, 0, 0);
  // ---- hot tiles
  const T = cfg.tile, tx = Math.ceil(W / T), ty = Math.ceil(H / T);
  const tiles = [];
  for (let b = 0; b < ty; b++) for (let a = 0; a < tx; a++) {
    let f = 0, r = 0, px = 0;
    for (let y = b * T; y < Math.min(H, (b + 1) * T); y++) for (let x = a * T; x < Math.min(W, (a + 1) * T); x++) {
      const k = y * W + x; px++;
      if (rmsA[k] >= cfg.rt && flipA[k] >= 2) { f++; r += rmsA[k]; }
    }
    if (f > px * 0.02) tiles.push({ a: a, b: b, f: f, rms: +(r / Math.max(1, f)).toFixed(2), nx: +(((a + 0.5) * T) / W).toFixed(4), ny: +(((b + 0.5) * T) / H).toFixed(4) });
  }
  tiles.sort((p, q) => q.f * q.rms - p.f * p.rms);
  // ---- ATTRIBUTION SAMPLE. Probing the CENTRE of a hot 32x32 tile names the
  // wrong thing whenever the flicker is sub-pixel geometry: on the subway
  // guard the tile centre falls BETWEEN two 20 mm balusters and the ray reports
  // the pavement 10 m behind them. So sample the hot PIXELS themselves,
  // uniformly at random, and histogram what the front surface is. That is the
  // number that says which subsystem owns the frame's flicker.
  const hot = [];
  {
    const idx = [];
    const hrt = cfg.hrt || cfg.rt;   // --hrt: attribute only the SEVERE population
    for (let k = 0; k < n; k++) if (rmsA[k] >= hrt && flipA[k] >= 2) idx.push(k);
    const want = Math.min(cfg.hist, idx.length);
    const seen = new Set();
    for (let g = 0; g < want * 4 && hot.length < want; g++) {
      const j = (Math.random() * idx.length) | 0;
      if (seen.has(j)) continue;
      seen.add(j);
      const k = idx[j];
      hot.push([+(((k % W) + 0.5) / W).toFixed(5), +((((k / W) | 0) + 0.5) / H).toFixed(5), +rmsA[k].toFixed(1), flipA[k]]);
    }
  }
  // ---- contact sheet of the worst tiles: ref crop over flick crop, 3x
  const NC = Math.min(8, tiles.length), CS = 64, Z = 3;
  const sh = document.createElement('canvas');
  sh.width = Math.max(1, NC) * CS * Z; sh.height = CS * Z * 2;
  const s2 = sh.getContext('2d');
  s2.imageSmoothingEnabled = false;
  s2.fillStyle = '#101010'; s2.fillRect(0, 0, sh.width, sh.height);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  rc.getContext('2d').putImageData(ref, 0, 0);
  for (let i = 0; i < NC; i++) {
    const t = tiles[i];
    const x0 = Math.max(0, Math.min(W - CS, (t.a + 0.5) * T - CS / 2));
    const y0 = Math.max(0, Math.min(H - CS, (t.b + 0.5) * T - CS / 2));
    s2.drawImage(rc, x0, y0, CS, CS, i * CS * Z, 0, CS * Z, CS * Z);
    s2.drawImage(mv, x0, y0, CS, CS, i * CS * Z, CS * Z, CS * Z, CS * Z);
    s2.strokeStyle = '#3af'; s2.lineWidth = 1; s2.strokeRect(i * CS * Z + 0.5, 0.5, CS * Z - 1, CS * Z * 2 - 1);
  }
  window.__TFOUT = { flick: mv, ref: rc, crops: sh };
  return {
    size: [W, H], step: cfg.step, n: N, dir: fwd,
    cam: [+p0.x.toFixed(3), +p0.y.toFixed(3), +p0.z.toFixed(3)],
    flickPct: +((flick / n) * 100).toFixed(4), flickPx: flick,
    flick10Pct: +((flick10 / n) * 100).toFixed(4), flick10Px: flick10,
    rampPct: +((ramp / n) * 100).toFixed(3),
    rmsMean: +(rmsSum / n).toFixed(4), rmsMax: +rmsMax.toFixed(2),
    ctlMax: ctlMax, ctlPx: ctlN,
    tiles: tiles.slice(0, 40), hot: hot,
  };
}`;

// Front surface at each sampled hot pixel, for the attribution histogram.
const HISTFN = `async (pts) => {
  const THREE = window.__ZF_THREE; if (!THREE) return [{ err: 'no THREE' }];
  const E = window.__ENGINE;
  const rc = new THREE.Raycaster(); rc.far = 6000;
  const out = [];
  for (const pt of pts) {
    rc.setFromCamera(new THREE.Vector2(pt[0] * 2 - 1, -(pt[1] * 2 - 1)), E.camera);
    let hits = [];
    try { hits = rc.intersectObjects(E.scene.children, true); } catch (e) { out.push({ n: 'ERR' }); continue; }
    let h = null;
    for (const q of hits) { if (q.object.visible) { h = q; break; } }
    if (!h) { out.push({ n: 'sky', d: 0, rms: pt[2] }); continue; }
    let mid = null;
    try { if (h.face && h.object.geometry && h.object.geometry.attributes.matId) mid = h.object.geometry.attributes.matId.getX(h.face.a); } catch (e) {}
    out.push({
      n: String(h.object.name || (h.object.parent && h.object.parent.name) || (h.object.material && h.object.material.name) || h.object.type).slice(0, 40),
      mid: mid, d: +h.distance.toFixed(1), rms: pt[2], f: pt[3],
    });
  }
  return out;
}`;
// ACNE PROBE (mode `acne`). Shadow acne is CAMERA-INDEPENDENT: the near cascade
// snaps its target to its own texel grid IN LIGHT SPACE (engine.js updateSun)
// and sky.js does not move the sun during a shot, so the acne lattice is fixed
// in the WORLD and a moving camera only slides it across the screen — it is a
// static-quality defect that reads as crawl, not a per-pixel flip. So it needs
// its own instrument: render the framing twice from ONE camera, the second time
// with the shadow bias multiplied, and look at what changed.
//
//   bias = -0.00012 of a 1400 m depth range = 0.168 m of push along the light
//   ray, CONSTANT — while the cascade's texel is 2*S/4096 with
//   S = clamp(150 + 1.1*camY, 150, 700), i.e. 73 mm on the street and 342 mm
//   from the air. Acne appears when the receiver's depth varies across one
//   texel by more than the bias, i.e. when texel*tan(angle between the surface
//   normal and the light) > 0.168 m: at 73 mm that is everything within 24
//   degrees of edge-on to the sun, and at 342 mm it is everything within 63.
//
// A pixel that gets BRIGHTER when the bias grows was in false self-shadow =
// acne. A pixel that gets DARKER lost a real contact shadow (peter-panning) and
// is the cost of the fix. `speckle` = the share of changed pixels that have an
// UNCHANGED 4-neighbour: high means high-frequency stipple (acne), low means a
// coherent shadow edge moved.
const ACNEFN = `(cfg) => {
  const E = window.__ENGINE, gl = E.renderer.domElement;
  const W = gl.width, H = gl.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  const sd = window.__TF.sunDir, p = E.camera.position;
  const shoot = () => {
    E.camera.updateMatrixWorld(true);
    E.updateSun(sd, p.x, p.y, p.z);
    E.sun.shadow.autoUpdate = true; E.sun.shadow.needsUpdate = true;
    if (E.sun2) { E.sun2.shadow.needsUpdate = true; }
    if (E._sortCamPos) E._sortCamPos.copy(E.camera.position);
    E.composer.render();
    c2.drawImage(gl, 0, 0);
    return c2.getImageData(0, 0, W, H);
  };
  const b0 = E.sun.shadow.bias, n0 = E.sun.shadow.normalBias;
  const b1 = E.sun2 ? E.sun2.shadow.bias : 0, n1 = E.sun2 ? E.sun2.shadow.normalBias : 0;
  const A = shoot();
  E.sun.shadow.bias = b0 * cfg.mul; E.sun.shadow.normalBias = n0 * cfg.nbmul;
  if (E.sun2) { E.sun2.shadow.bias = b1 * cfg.mul; E.sun2.shadow.normalBias = n1 * cfg.nbmul; }
  const B = shoot();
  E.sun.shadow.bias = b0; E.sun.shadow.normalBias = n0;
  if (E.sun2) { E.sun2.shadow.bias = b1; E.sun2.shadow.normalBias = n1; }
  const C = shoot();            // control: back at the original bias
  const n = W * H;
  const da = A.data, db = B.data, dc = C.data;
  const dl = new Int16Array(n);
  let chg = 0, up = 0, dn = 0, sum = 0, mx = 0, ctlMax = 0, ctlPx = 0;
  for (let k = 0, j = 0; k < n; k++, j += 4) {
    const la = (da[j] * 77 + da[j + 1] * 150 + da[j + 2] * 29) >> 8;
    const lb = (db[j] * 77 + db[j + 1] * 150 + db[j + 2] * 29) >> 8;
    const lc = (dc[j] * 77 + dc[j + 1] * 150 + dc[j + 2] * 29) >> 8;
    const d = lb - la; dl[k] = d;
    const ad = Math.abs(d); sum += ad; if (ad > mx) mx = ad;
    if (ad >= cfg.rt) { chg++; if (d > 0) up++; else dn++; }
    const cd = Math.abs(lc - la); if (cd > ctlMax) ctlMax = cd; if (cd > 2) ctlPx++;
  }
  let spk = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (Math.abs(dl[k]) < cfg.rt) continue;
    if (Math.abs(dl[k - 1]) < cfg.rt || Math.abs(dl[k + 1]) < cfg.rt || Math.abs(dl[k - W]) < cfg.rt || Math.abs(dl[k + W]) < cfg.rt) spk++;
  }
  const mv = document.createElement('canvas'); mv.width = W; mv.height = H;
  const m2 = mv.getContext('2d'); const mi = m2.createImageData(W, H); const md = mi.data;
  for (let k = 0, j = 0; k < n; k++, j += 4) {
    const d = dl[k];
    if (d >= cfg.rt) { md[j] = Math.min(255, 60 + d * 4); md[j + 1] = 0; md[j + 2] = 0; }
    else if (d <= -cfg.rt) { md[j] = 0; md[j + 1] = 0; md[j + 2] = Math.min(255, 60 - d * 4); }
    md[j + 3] = 255;
  }
  m2.putImageData(mi, 0, 0);
  const T = cfg.tile, tx = Math.ceil(W / T), ty = Math.ceil(H / T);
  const tiles = [];
  for (let b = 0; b < ty; b++) for (let a = 0; a < tx; a++) {
    let f = 0, s = 0, px = 0;
    for (let y = b * T; y < Math.min(H, (b + 1) * T); y++) for (let x = a * T; x < Math.min(W, (a + 1) * T); x++) {
      const k = y * W + x; px++;
      if (Math.abs(dl[k]) >= cfg.rt) { f++; s += Math.abs(dl[k]); }
    }
    if (f > px * 0.02) tiles.push({ a: a, b: b, f: f, rms: +(s / Math.max(1, f)).toFixed(2), nx: +(((a + 0.5) * T) / W).toFixed(4), ny: +(((b + 0.5) * T) / H).toFixed(4) });
  }
  tiles.sort((p1, q1) => q1.f * q1.rms - p1.f * p1.rms);
  const NC = Math.min(8, tiles.length), CS = 64, Z = 3;
  const sh = document.createElement('canvas');
  sh.width = Math.max(1, NC) * CS * Z; sh.height = CS * Z * 2;
  const s2 = sh.getContext('2d'); s2.imageSmoothingEnabled = false;
  s2.fillStyle = '#101010'; s2.fillRect(0, 0, sh.width, sh.height);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  rc.getContext('2d').putImageData(A, 0, 0);
  for (let i = 0; i < NC; i++) {
    const t = tiles[i];
    const x0 = Math.max(0, Math.min(W - CS, (t.a + 0.5) * T - CS / 2));
    const y0 = Math.max(0, Math.min(H - CS, (t.b + 0.5) * T - CS / 2));
    s2.drawImage(rc, x0, y0, CS, CS, i * CS * Z, 0, CS * Z, CS * Z);
    s2.drawImage(mv, x0, y0, CS, CS, i * CS * Z, CS * Z, CS * Z, CS * Z);
    s2.strokeStyle = '#3af'; s2.lineWidth = 1; s2.strokeRect(i * CS * Z + 0.5, 0.5, CS * Z - 1, CS * Z * 2 - 1);
  }
  window.__TFOUT = { flick: mv, ref: rc, crops: sh };
  return {
    size: [W, H], mode: 'acne', mul: cfg.mul,
    S: +E._S.toFixed(1), texel: +((2 * E._S) / E.sun.shadow.mapSize.x * 1000).toFixed(1),
    bias: [b0, b0 * cfg.mul], normalBias: [n0, n0 * cfg.nbmul],
    flickPct: +((chg / n) * 100).toFixed(4), flickPx: chg,
    brighterPct: +((up / n) * 100).toFixed(4), darkerPct: +((dn / n) * 100).toFixed(4),
    speckle: +(spk / Math.max(1, chg)).toFixed(3),
    rampPct: +((up / n) * 100).toFixed(3),
    rmsMean: +(sum / n).toFixed(4), rmsMax: mx,
    ctlMax: ctlMax, ctlPx: ctlPx, tiles: tiles.slice(0, 40),
  };
}`;
const READFN = `(k) => window.__TFOUT[k].toDataURL('image/png')`;

// three's namespace inside an eval context (bare 'three' cannot be resolved
// there): recover the URL vite served it from and import by URL.
const ZTHREE = `(async () => {
  if (window.__ZF_THREE) return 'cached';
  const rs = performance.getEntriesByType('resource').map((e) => e.name);
  const cands = rs.filter((n) => /three/i.test(n) && /\\.js(\\?|$)/.test(n));
  cands.sort((a, b) => (/deps\\/three\\.js/.test(b) ? 1 : 0) - (/deps\\/three\\.js/.test(a) ? 1 : 0));
  cands.push('/node_modules/three/build/three.module.js');
  for (const u of cands) {
    try { const m = await import(/* @vite-ignore */ u); if (m && m.Raycaster && m.Vector2) { window.__ZF_THREE = m; return u; } } catch (e) {}
  }
  return 'FAILED';
})()`;

// Name every surface a hot pixel's ray meets. DoubleSide is forced for the
// duration: the compiler emits every vertical ground quad TWICE with opposite
// winding (compile.mjs vertQuad), so a FrontSide raycast sees one of each pair
// and reports "no coincident pair" on a surface that has one.
const PICKFN = `async (pts) => {
  const THREE = window.__ZF_THREE; if (!THREE) return [{ err: 'no THREE' }];
  const E = window.__ENGINE;
  const rc = new THREE.Raycaster(); rc.far = 6000;
  const stash = [];
  E.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m.side !== 2) { stash.push([m, m.side]); m.side = 2; }
  });
  const out = [];
  for (const pt of pts) {
    rc.setFromCamera(new THREE.Vector2(pt[0] * 2 - 1, -(pt[1] * 2 - 1)), E.camera);
    let hits = [];
    try { hits = rc.intersectObjects(E.scene.children, true); } catch (e) { out.push({ nx: pt[0], ny: pt[1], err: String(e).slice(0, 120) }); continue; }
    const seen = [];
    for (const h of hits) {
      if (!h.object.visible) continue;
      let mid = null;
      try { if (h.face && h.object.geometry && h.object.geometry.attributes.matId) mid = h.object.geometry.attributes.matId.getX(h.face.a); } catch (e) {}
      seen.push({
        d: +h.distance.toFixed(3), y: +h.point.y.toFixed(4),
        nY: h.face ? +h.face.normal.y.toFixed(3) : null, mid: mid,
        name: String(h.object.name || (h.object.parent && h.object.parent.name) || (h.object.material && h.object.material.name) || h.object.type).slice(0, 44),
        inst: h.instanceId === undefined ? null : h.instanceId,
      });
      if (seen.length >= 6) break;
    }
    const pairs = [];
    for (let i = 0; i < seen.length - 1; i++) {
      const dd = seen[i + 1].d - seen[i].d;
      if (dd < 0.30) pairs.push({ a: seen[i], b: seen[i + 1], dRay: +dd.toFixed(5), dY: +(seen[i + 1].y - seen[i].y).toFixed(5), lsb: +(1.49e-7 * seen[i].d * seen[i].d).toFixed(6), ratio: +(dd / (1.49e-7 * seen[i].d * seen[i].d)).toFixed(2) });
    }
    out.push({ nx: +pt[0].toFixed(4), ny: +pt[1].toFixed(4), hits: seen, pairs: pairs });
  }
  for (const [m, s] of stash) m.side = s;
  return out;
}`;

// ---------------------------------------------------------------- driver
const releaseGpu = (SW || has('nolock')) ? (() => {}) : await acquireGpu('tflick ' + names.slice(0, 3).join(','));
let hb = null;
if (!SW && !has('nolock')) {
  const lockFile = path.join(root, 'tools', 'gpu.lock');
  hb = setInterval(() => { fs.utimes(lockFile, new Date(), new Date()).catch(() => {}); }, 120000);
}
let port = opt('port');
let server = null;
if (!port) {
  port = String(5400 + Math.floor(Math.random() * 3000));
  const viteBin = path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });   // no HMR reloads mid-capture (vite.config.js)
  await sleep(6000);
}
const browser = await chromium.launch({
  headless: true,
  args: SW
    ? ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${VW},${VH}`]
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${VW},${VH}`],
});

const summary = [];
try {
  for (const name of names) {
    const V = VIEWS[name];
    const tag = name + (label ? '_' + label : '');
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await page.routeWebSocket('**', () => {}).catch(() => {});
    const errors = [], logs = [];
    page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); if (m.type() === 'error') errors.push(m.text().slice(0, 220)); });
    page.on('pageerror', (e) => { errors.push('PAGEERROR ' + String(e).slice(0, 260)); });
    const [sx, sz] = project(V.p[0], V.p[1]);
    const url = `http://127.0.0.1:${port}/?shot=1&record=1&${BASE_FLAGS}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(V.p[2] + 40).toFixed(1)}&time=${V.time}${V.flags ? '&' + V.flags : ''}`;
    console.log(`\n=== ${tag}  ${V.time}  alt=${V.p[2]}m  ${V.title || ''}`);
    const rec = { view: name, time: V.time, alt: V.p[2], title: V.title || '', url, step: STEP, n: NF, rt: RT, ft: FT, modes: {} };
    try {
      let booted = false;
      for (let a = 0; a < 2 && !booted; a++) {
        if (a) { console.log('  boot retry:', [...new Set(errors)].slice(0, 2).join(' | ') || 'goto timeout'); errors.length = 0; }
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
          booted = await page.waitForFunction('typeof window.__SET_PATH === "function" && !!window.__ENGINE', null, { timeout: bootMs }).then(() => true).catch(() => false);
        } catch (e) { booted = false; }
      }
      if (!booted) throw new Error('page never reached record mode');
      const hold = { duration: 30, ease: 0, keys: [
        { p: V.p, look: V.look },
        { p: [V.p[0] + 1e-8, V.p[1], V.p[2]], look: V.look },
      ] };
      await page.evaluate((p) => window.__SET_PATH(p), hold);
      await page.evaluate(() => window.__advance(0));
      let st = null;
      for (let i = 0; i < 110; i++) {
        await page.evaluate(() => window.__advance(1 / 30));
        st = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
        if (i > 25 && st && st.idle && st.dressQ === 0 && st.near > 4) break;
        await sleep(350);
      }
      for (let i = 0; i < 150; i++) await page.evaluate(() => window.__advance(1 / 30));
      st = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
      const world = await page.evaluate(() => {
        const s = window.__STREAMER;
        if (!s || !s.tiles) return false;
        if (typeof s.readyUnder === 'function' && s.readyUnder()) return true;
        let n = 0; for (const t of s.tiles.values()) if (t && t.state === 'ready') n++;
        return n >= 4;
      });
      rec.world = world; rec.stat = st;
      console.log(`  settled in ${((Date.now() - t0) / 1000).toFixed(0)}s  tiles=${st && st.near} dress=${st && st.dressActive}/${st && st.dressQ} cars=${st && st.cars} world=${world}`);
      if (!world) console.log('  *** NO WORLD under the camera — this framing is INVALID, re-run it');
      console.log('  prep:', await page.evaluate(PREP));
      console.log('  three:', await page.evaluate(ZTHREE));

      let refWritten = false;
      if (EVAL) console.log('  eval:', await page.evaluate(`(() => { const E = window.__ENGINE; ${EVAL}; return 'ok'; })()`).catch((e) => 'ERR ' + String(e).slice(0, 200)));
      for (const mode of MODES) {
        await page.evaluate(`(${SETMODE})(${JSON.stringify(mode)})`);
        const cfg = { n: NF, warm: WARM, step: STEP, rt: RT, ft: FT, tile: TILE, mul: BIASMUL, nbmul: NBMUL || BIASMUL, hist: NHIST, hrt: HRT, shadow: mode === 'shad' || mode === 'film' };
        const out = mode === 'acne'
          ? await page.evaluate(`(${ACNEFN})(${JSON.stringify(cfg)})`)
          : await page.evaluate(`(${GRABFN})(${JSON.stringify(cfg)})`);
        rec.modes[mode] = out;
        if (mode === 'acne') console.log(`  acne  changed ${String(out.flickPct).padStart(8)}% (${out.flickPx} px)  brighter ${out.brighterPct}%  darker ${out.darkerPct}%  speckle ${out.speckle}  mean|d| ${out.rmsMean}  max ${out.rmsMax}  S=${out.S}m texel=${out.texel}mm  bias ${out.bias[0]}->${out.bias[1]}  [ctl max ${out.ctlMax}]`);
        else console.log(`  ${mode.padEnd(5)} flick ${String(out.flickPct).padStart(8)}% (${out.flickPx} px)  rmsMean ${out.rmsMean}  rmsMax ${out.rmsMax}  ramp ${out.rampPct}%  hotTiles ${out.tiles.length}  [ctl max ${out.ctlMax}, ${out.ctlPx} px]`);
        // The control (frame 0 re-rendered with the camera back at the start) is
        // only a determinism check in the modes with NO temporal history: with
        // TAA on, the history now holds frame 5, so a big control is expected
        // and is not evidence of noise.
        if (out.ctlMax > 6 && mode !== 'film' && mode !== 'taa') console.log('  *** CONTROL IS NOT ZERO — something in this mode is not deterministic; treat the number as an upper bound');
        for (const k of ['flick', 'crops']) {
          const u = await page.evaluate(`(${READFN})(${JSON.stringify(k)})`);
          await fs.writeFile(path.join(outDir, `${tag}_${mode}_${k}.png`), Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
        }
        if (!refWritten) {
          const u = await page.evaluate(`(${READFN})("ref")`);
          await fs.writeFile(path.join(outDir, `${tag}_ref.png`), Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
          refWritten = true;
        }
        if (out.hot && out.hot.length) {
          const hist = await page.evaluate(`(${HISTFN})(${JSON.stringify(out.hot)})`).catch((e) => [{ n: 'ERR ' + String(e).slice(0, 80) }]);
          const agg = new Map();
          for (const h of hist) {
            // collapse to a SUBSYSTEM: what owns the fix, not the instance
            const nm = String(h.n || '?');
            let k = nm;
            if (/^tile_/.test(nm)) k = 'tile:' + (h.mid !== null && h.mid !== undefined ? (MATID[h.mid] || 'm' + h.mid) : 'facade/roof');
            else if (/^nyc:merge:/.test(nm)) k = 'dress:merge:' + nm.split(':').slice(3).join(':');
            else if (/^nyc:parts:/.test(nm)) k = 'dress:parts:' + nm.split(':').slice(2).join(':');
            else if (/^pool:|^inst:pool:|^poolS:|^poolF:/.test(nm)) k = 'pool:' + nm.replace(/^(inst:)?pool[SF]?:/, '').replace(/:lod$/, '');
            else if (/^veh:/.test(nm)) k = 'vehicle';
            else if (/^macro/.test(nm)) k = 'macro';
            const e = agg.get(k) || { n: 0, rms: 0, d: 0 };
            e.n++; e.rms += h.rms || 0; e.d += h.d || 0;
            agg.set(k, e);
          }
          const rows = [...agg.entries()].sort((a, b) => b[1].n - a[1].n)
            .map(([k, v]) => ({ what: k, pct: +((v.n / hist.length) * 100).toFixed(1), meanRms: +(v.rms / v.n).toFixed(1), meanD: +(v.d / v.n).toFixed(0) }));
          out.attrib = rows; out.hist = hist;
          console.log('    attribution of ' + hist.length + ' random hot pixels:');
          for (const r of rows.slice(0, 12)) console.log(`      ${String(r.pct).padStart(5)}%  rms ${String(r.meanRms).padStart(5)}  d ${String(r.meanD).padStart(4)} m  ${r.what}`);
        }
        const pts = out.tiles.slice(0, nProbes).map((t) => [t.nx, t.ny]);
        if (pts.length) {
          const picks = await page.evaluate(`(${PICKFN})(${JSON.stringify(pts)})`).catch((e) => [{ err: String(e).slice(0, 220) }]);
          out.picks = picks;
          for (let i = 0; i < picks.length; i++) {
            const p = picks[i], t = out.tiles[i];
            const head = `    probe ${String(i).padStart(2)} @${(t.nx * 100).toFixed(0)}%,${(t.ny * 100).toFixed(0)}% hot=${t.f} rms=${t.rms}`;
            if (p.err) { console.log(head, 'ERR', p.err); continue; }
            const h0 = p.hits[0];
            const nm = (h) => `${h.name}${h.mid !== null && h.mid !== undefined ? '#' + (MATID[h.mid] || 'm' + h.mid) : ''}`;
            if (!p.pairs.length) { console.log(head + '  front: ' + (h0 ? `${nm(h0)} d=${h0.d} y=${h0.y} nY=${h0.nY}` : 'sky')); continue; }
            console.log(head + '  front: ' + (h0 ? `${nm(h0)} d=${h0.d}` : 'sky'));
            for (const pr of p.pairs) console.log(`        ${nm(pr.a)} y=${pr.a.y} d=${pr.a.d}  VS  ${nm(pr.b)} y=${pr.b.y}  dY=${(pr.dY * 1000).toFixed(1)}mm dRay=${(pr.dRay * 1000).toFixed(2)}mm lsb=${(pr.lsb * 1000).toFixed(2)}mm ratio=${pr.ratio}${pr.ratio < 2 ? '  <<< Z-FIGHT' : ''}`);
          }
        }
      }
    } catch (e) {
      rec.error = String(e).split('\n')[0];
      console.log('  FAILED:', rec.error);
      console.log('  last logs:\n   ' + logs.slice(-8).join('\n   '));
    }
    rec.errors = [...new Set(errors)].slice(0, 6);
    if (rec.errors.length) console.log('  page errors:', rec.errors.join(' | '));
    summary.push(rec);
    await fs.writeFile(path.join(outDir, `${tag}.json`), JSON.stringify(rec, null, 1));
    await page.close();
  }
} finally {
  await browser.close();
  if (hb) clearInterval(hb);
  releaseGpu();
  if (server) server.kill();
}
await fs.writeFile(path.join(outDir, `_summary${label ? '_' + label : ''}.json`), JSON.stringify(summary, null, 1));
console.log('\n=== SUMMARY  (flick% = detrended-rms >= ' + RT + ' AND >= 2 sign flips, over ' + NF + ' frames ' + STEP + ' m apart)');
console.log('view'.padEnd(15) + MODES.map((m) => m.padStart(10)).join('') + '   ramp%(film)  ctlMax');
for (const r of summary) {
  if (r.error) { console.log(r.view.padEnd(15) + 'FAILED ' + r.error); continue; }
  const last = r.modes[MODES[MODES.length - 1]];
  console.log(r.view.padEnd(15) + MODES.map((m) => String(r.modes[m] ? r.modes[m].flickPct : '-').padStart(10)).join('')
    + '   ' + String(last ? last.rampPct : '-').padStart(10) + '  ' + String(last ? last.ctlMax : '-').padStart(6)
    + (r.world === false ? '  INVALID(no world)' : ''));
}
