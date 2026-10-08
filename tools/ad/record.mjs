// AD VIDEO — recording orchestrator.
//
// Reads tools/ad/shots.json and drives boundless.js in ?record=1 mode (the
// fixed-timestep capture in boundlessjs/src/main.js). Two differences from
// tools/trailer/record.mjs, both about cost:
//
//  1. Shots are GROUPED by (time, flags) and every shot in a group is captured
//     inside ONE page load, teleporting between paths. A cold boot is 90-200 s,
//     so a group of seven montage shots pays it once instead of seven times.
//  2. Clip frames are written as JPEG q95, not PNG. 3,500 PNGs at 1920x1080 is
//     ~10 GB and ~250 ms of encode each; the delivery is H.264 CRF 19, where the
//     extra generation is invisible. Probe frames stay PNG so they can be
//     inspected honestly.
//
//   node tools/ad/record.mjs --list
//   node tools/ad/record.mjs --probe --all              # 1 frame per shot + probe framings
//   node tools/ad/record.mjs --probe --shot fMarkings,pMarkingsAlt
//   node tools/ad/record.mjs --group montage            # the real thing
//   node tools/ad/record.mjs --group swipe              # day + night takes
//   node tools/ad/record.mjs --shot fTraffic --start 180             # resume a broken run
//   node tools/ad/record.mjs --shot fSkyline --start 92 --end 210  # re-shoot a range
//   node tools/ad/record.mjs --group features --settle 900
//
// Output: boundlessjs/shots/ad/clips/<tag>/frame_%05d.jpg + <tag>.mp4
//         boundlessjs/shots/ad/probe/<name>_<time>.png
import { chromium } from 'playwright';
import { acquireGpu } from '../gpulock.mjs';
import { installGuard, watchPage } from '../harness_guard.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// sharp lives in tools/assets (the asset pipeline's install): used to vet every captured frame for a black half
const sharp = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'package.json'))('sharp');
sharp.cache(false);   // sharp's file cache holds a Windows handle on every input: the re-shoot could not overwrite the frame
// BLACK-HALF CHECK (film 7, 2026-09-23): a probe frame came back with its right half exactly black on a lit Midtown aerial
// (in-page capture, so not the old compositor race). The size-vs-median test cannot see it on a take's first 6 frames, so
// every frame is decoded small and rejected when one half (left/right/top/bottom) is black while the frame is lit.
// Takes the captured BYTES, before anything is written (motion test: sharp(file) kept the jpg open and the re-shoot's
// write failed with errno -4094). Returns the four half means when the frame is rejected, else null.
async function blackHalf(img) {
  try {
    const { data, info } = await sharp(img).removeAlpha().resize(64, 36, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, halves = [0, 0, 0, 0], n = [0, 0, 0, 0];
    let all = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      all += l;
      const hs = [x < W / 2 ? 0 : 1, y < H / 2 ? 2 : 3];
      for (const h of hs) { halves[h] += l; n[h]++; }
    }
    all /= W * H;
    const h = halves.map((v, k) => v / n[k]);   // left, right, top, bottom (mean luma, 0-255)
    // a half near black while its opposite half is lit: the artifact (measured: 89.9 | 4.9 on the bad Midtown frame;
    // night swipe 46 | 37, dusk rain 26 | 29). Top/bottom stricter: a dark street under a glowing sky is a real picture
    const bad = all > 20 && ((h[0] < 8 && h[1] > 30) || (h[1] < 8 && h[0] > 30) || (h[2] < 3 && h[3] > 40) || (h[3] < 3 && h[2] > 40));
    return bad ? h.map((v) => +v.toFixed(1)) : null;
  } catch { return null; }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const bdir = path.join(root, 'boundlessjs');
const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d;
};
const has = (n) => args.includes('--' + n);

const SPEC = JSON.parse(await fs.readFile(path.join(here, 'shots.json'), 'utf8'));
const SHOTS = SPEC.shots, PROBES = SPEC.probes || {};
const isProbe = has('probe');
const probeFrames = Number(opt('probe', '1')) || 1;

// ---- what to shoot ---------------------------------------------------------
const pool = { ...SHOTS, ...(isProbe ? PROBES : {}) };
let names;
if (opt('shot')) names = opt('shot').split(',');
else if (opt('group')) names = Object.keys(SHOTS).filter((k) => SHOTS[k].act === opt('group'));
else if (has('all')) names = Object.keys(pool);
else names = Object.keys(SHOTS);
names = names.filter((n) => { if (!pool[n]) { console.log('unknown shot', n); return false; } return true; });

if (has('list')) {
  for (const [k, v] of Object.entries(pool)) {
    const times = (v.times || [v.time]).join('+');
    console.log(`${(v.act || 'probe').padEnd(8)} ${k.padEnd(18)} ${String(v.duration).padStart(4)}s ${times.padEnd(11)} ${v.flags || ''}`.padEnd(56) + (v.title || ''));
  }
  process.exit(0);
}

const FPS = Number(opt('fps', String(SPEC._meta?.fps || 30)));
const [W, H] = (opt('size', SPEC._meta?.size || '1920x1080')).split('x').map(Number);
const BASE_FLAGS = opt('flags', SPEC._meta?.flags || 'hud=0&lmwait=150&life=0&clean=1');   // 2026-09-23: walkers are IN the film (owner: "recreate the ad with the latest pedestrian models"; nopeds=1 was the rule before); lmwait: landmarks before the first frame; life=0: no steam/plume sprites; clean=1: no post stylisation (2026-09-17)
const outRoot = path.resolve(root, opt('out', 'boundlessjs/shots/ad'));
const clipRoot = path.join(outRoot, 'clips');
const probeRoot = path.join(outRoot, 'probe');
const settleMs = Number(opt('settle', '1200'));
const bootMs = Number(opt('boot', '200000'));
const startAt = Number(opt('start', '0'));
const endAt = Number(opt('end', '1e9'));   // exclusive: --start 92 --end 210 re-shoots just that range
const encode = opt('encode', isProbe ? '0' : '1') === '1';
const headed = has('headed');
const quality = Number(opt('q', '95'));
// FR28 (owner 2026-09-27: "a faster way to render at high quality ... near real time with proper instrumentation"):
// --fast drives each captured frame with ONE page call (main.js __REC_FRAME: the step, the settle wait, the accumulation
// samples back to back on the stepped frame's shadow map, the lens and car checks, and the canvas snapshotted into an
// ImageBitmap that a worker encodes and POSTs to the sink below while the next frame renders) instead of ~12 page calls,
// two requestAnimationFrame turns per step and a synchronous toDataURL sent back as base64. --liveshadow re-renders the
// shadow map for every sample, --blobenc encodes with toBlob on the main thread (both measured identical, docs/notes/
// ad-video.md FR28). The sink vets every frame it receives the way the classic path does (a black half, a torn or blank
// JPEG far under the rolling median size) and lists the frames to re-shoot. --prof adds GPU-synced per-phase times to the
// progress lines, --passes a per-pass GPU profile at each take's first pose.
const FAST = has('fast'), PROF = has('prof');
const sink = { dir: null, port: 0, n: 0, bytes: 0, busy: new Set(), sizes: [], bad: [] };
if (FAST) {
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const name = decodeURIComponent((req.url || '/').slice(1)), dir = sink.dir;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const job = (async () => {
        if (!dir || !/^[\w.-]+$/.test(name)) return;
        await fs.writeFile(path.join(dir, name), buf);
        sink.n++; sink.bytes += buf.length;
        const bh = await blackHalf(buf).catch(() => null);
        const med = sink.sizes.length >= 6 ? [...sink.sizes].sort((a, b) => a - b)[Math.floor(sink.sizes.length / 2)] : 0;
        if (bh) sink.bad.push(`${name} black half (L|R|T|B ${bh.join(' | ')})`);
        else if (med && buf.length < med * 0.8) sink.bad.push(`${name} ${(buf.length / 1024).toFixed(0)}KB vs median ${(med / 1024).toFixed(0)}KB`);
        sink.sizes.push(buf.length); if (sink.sizes.length > 24) sink.sizes.shift();
      })();
      sink.busy.add(job);
      job.catch((e) => console.log('     *** sink write failed', name, e.message)).finally(() => { sink.busy.delete(job); res.writeHead(204); res.end(); });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  sink.port = srv.address().port;
  srv.unref();
  console.log(`[fast] frame sink on 127.0.0.1:${sink.port}${PROF ? ' (profiling)' : ''}`);
}
const timeOverride = opt('time');
const label = opt('label', '');

// ---- group by (time, flags): one page load per group ----------------------
// A shot with `times: [...]` (the day/night swipe) becomes one take per time.
const takes = [];
for (const n of names) {
  const s = pool[n];
  for (const t of timeOverride ? [timeOverride] : (s.times || [s.time || 'golden'])) {
    takes.push({ name: n, spec: s, time: t, flags: s.flags || '',
      tag: `${n}${(s.times || timeOverride) ? '_' + t : ''}${label ? '_' + label : ''}` });
  }
}
const groups = new Map();
for (const t of takes) {
  const key = `${t.time}|${t.flags}`;
  if (!groups.has(key)) groups.set(key, { time: t.time, flags: t.flags, takes: [] });
  groups.get(key).takes.push(t);
}
console.log(`${takes.length} take(s) in ${groups.size} group(s):`);
for (const g of groups.values()) console.log(`  ${g.time}${g.flags ? ' + ' + g.flags : ''}: ${g.takes.map((t) => t.tag).join(', ')}`);
const totalFrames = takes.reduce((a, t) => a + (isProbe ? probeFrames : Math.round(t.spec.duration * FPS)), 0);
console.log(`${totalFrames} frames to capture\n`);

await fs.mkdir(isProbe ? probeRoot : clipRoot, { recursive: true });

// mirror of boundlessjs/src/shared/geo.js project()
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Take the GPU lock BEFORE spawning Vite. A queued run must not sit on a dev
// server and a Chromium while it waits — tools/bshot.mjs learned this when four
// agents queueing at once paged the machine. This means a queued `record.mjs`
// can be fired while another one is still going: it blocks here, then starts.
const lockLabel = 'ad ' + (opt('group') || opt('shot') || 'all') + (isProbe ? ' probe' : '');
// --nolock: a SECOND recorder running alongside the first (2026-09-17: two Chromiums split the take list to fit the time budget)
// 2026-10-01 guardrails (tools/harness_guard.mjs): a deadline from the run's length (a boot and a warm-up per take, 4 s a
// frame: a loaded lane's worst; HARNESS_MAX_MIN overrides), the Vite server, the browser and the encoders killed on any
// way out, a hung page ends the run instead of holding the lane
try { installGuard({ name: lockLabel.slice(0, 40), maxMin: Math.ceil(20 + takes.length * 5 + (totalFrames * 4) / 60) }); } catch (e) { console.log('[record] guard not installed:', e?.message || e); }
const releaseGpu = opt('nolock') ? (() => {}) : await acquireGpu(lockLabel);
// HEARTBEAT. tools/gpulock.mjs treats a lock older than 20 minutes as stale and
// deletes it, and it never refreshes the file's mtime — so any render that runs
// longer than 20 minutes gets its lock stolen by the next waiter and two
// Chromiums end up on the GPU at once. That happened here: a 5-take golden group
// (26 min) was still recording when the queued run took the lock, and both
// dropped to ~2.3 s/frame. Touching the file while we still own it makes the
// staleness rule mean what it says (a crashed holder, not a slow one).
const lockFile = path.resolve(here, '..', 'gpu.lock');
const beat = setInterval(() => {
  try {
    if (fsSync.readFileSync(lockFile, 'utf8').includes(lockLabel)) fsSync.utimesSync(lockFile, new Date(), new Date());
  } catch { /* released or taken by someone else */ }
}, 60000);
beat.unref?.();
process.on('exit', () => clearInterval(beat));

let port = opt('port');
let server = null;
if (!port) {
  port = String(5400 + Math.floor(Math.random() * 3000));
  const viteBin = path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });   // no HMR reloads mid-capture (vite.config.js)
  await sleep(3500);
}

const browser = await chromium.launch({
  headless: !headed,
  args: [(process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`],
});

// a frame is "settled" when no tile fetch is outstanding and the NYC dresser has
// drained its build queue: that is what makes two takes of one path identical
const waitSettled = async (page, budget) => {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < budget) {
    s = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
    if (s && s.idle && s.dressQ === 0) return s;
    await sleep(150);
  }
  return s;
};
// ---- the teleport trap ----------------------------------------------------
// waitSettled() is NOT enough right after __SET_PATH. The streamer only learns
// about the new camera position on its next update, so for the first moment it
// still reports idle() with an empty dresser queue — for the OLD neighbourhood.
// Probe round 1 hit this: teleporting Columbia -> 125th St "settled in 2 s" and
// the frame came back with 11 dressed buildings and no traffic, where a page
// booted at the junction has 48 and a full roadway.
//
// So: render frames with dt = 0 (which pumps streaming and the dresser without
// moving the camera or the world), and require the whole state vector — near
// tiles, macro tiles, dressed count — to be QUIET for several consecutive polls
// and for a floor of wall-clock time before believing it.
const settleWorld = async (page, budget, minDwellMs = 9000, needQuiet = 8) => {
  const t0 = Date.now();
  let quiet = 0, last = '';
  for (;;) {
    await page.evaluate(() => window.__advance(0));       // a frame, but time stands still
    const s = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
    if (s) {
      const key = `${s.near}|${s.macro}|${s.dressActive}`;
      quiet = s.idle && s.dressQ === 0 && key === last ? quiet + 1 : 0;
      last = key;
      if (quiet >= needQuiet && Date.now() - t0 >= minDwellMs) return s;
    }
    if (Date.now() - t0 > budget) return s;
    await sleep(180);
  }
};
// ---- warming the simulation without moving the camera ---------------------
// Traffic needs sim seconds to drive into the shot and for the signals to reach
// a sensible phase, but every __advance(dt) also advances PathCam.t — 1,500
// warm steps would run a 9.5 s path 50 s past its end. Warm against a HOLD
// path (key 0, duration 1e6) instead, then reinstall the real path: setPath()
// resets t to 0, so the camera snaps back to key 0 with the warmed world.
const holdOf = (P) => ({
  duration: 1e6, ease: 0, abs: P.abs, tension: P.tension, fov: P.fov,   // FL26: the take's own lens through the warm-up
  keys: [P.keys[0], { p: [P.keys[0].p[0] + 1e-6, P.keys[0].p[1] + 1e-6, P.keys[0].p[2]], look: P.keys[0].look }],
});
// FP26: a hold at any key (or a point between keys) of a take's path
const holdAt = (P, K) => ({ duration: 1e6, ease: 0, abs: P.abs, tension: P.tension, fov: P.fov, keys: [K, { p: [K.p[0] + 1e-6, K.p[1] + 1e-6, K.p[2]], look: K.look }] });
const midKey = (a, b) => ({ p: a.p.map((v, i) => (v + b.p[i]) / 2), look: a.look.map((v, i) => (v + b.look[i]) / 2) });
// engine.frames only advances on a frame that reached composer.render(). If it
// is stuck, a screenshot silently captures the LAST GOOD image — which is how
// two different landmarks once came back as the same picture. Always check.
const waitLive = async (page, budget = 8000) => {
  const s0 = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
  if (!s0) return null;
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    await sleep(180);
    const s = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
    if (s && s.frames > s0.frames + 2) return s;
  }
  return null;
};
// READY and an empty dresser can both fire over open water or the splash plate
// (critic round 2: 35 % of frames had no world). Require real tiles under us.
const worldOk = (page) => page.evaluate(() => {
  const s = window.__STREAMER;
  if (!s || !s.tiles) return false;
  if (typeof s.readyUnder === 'function' && s.readyUnder()) return true;
  let n = 0; for (const t of s.tiles.values()) if (t && t.state === 'ready') n++;
  return n >= 4;
}).catch(() => false);

const results = [];
try {
  for (const g of groups.values()) {
    const first = g.takes[0];
    const [sx, sz] = project(first.spec.keys[0].p[0], first.spec.keys[0].p[1]);
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    let guardW = null;
    try { guardW = watchPage(page, { label: `record ${g.time}` }); } catch {}
    // Other agents edit src/ while this runs; Vite HMR would reload the page
    // mid-capture (camera reset, __SET_PATH gone). Swallow the HMR socket, so
    // the module graph this page loaded at goto() is frozen for the whole run.
    await page.routeWebSocket('**', () => {}).catch(() => {});
    const errors = [], logs = [];
    let bodyThrew = 0;   // main.js logs "[record] frame body threw" when the per-frame step raises — the canvas then goes stale
    page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); if (m.type() === 'error') errors.push(m.text().slice(0, 250)); if (/frame body threw/.test(m.text())) bodyThrew++; });
    page.on('pageerror', (e) => { errors.push('PAGEERROR ' + String(e).slice(0, 300)); logs.push('PAGEERROR ' + String(e)); });

    const q = `?shot=1&record=1&${BASE_FLAGS}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(first.spec.keys[0].p[2] + 40).toFixed(1)}&time=${g.time}${g.flags ? '&' + g.flags : ''}`;
    const url = `http://127.0.0.1:${port}/${q}`;
    // AC26: ?accum=N — N extra frozen frames before each capture, one jittered sample each (core/engine.js ACCUM)
    const ACC = Math.max(0, Number(new URL(url).searchParams.get('accum')) || 0);
    console.log(`=== GROUP ${g.time}${g.flags ? ' ' + g.flags : ''} (${g.takes.length} take(s))\n    ${url}`);
    const G0 = Date.now();
    let booted = false;
    for (let a = 0; a < 3 && !booted; a++) {
      // a sibling agent mid-edit leaves a module unparseable and the page boots
      // to a SyntaxError: reload rather than burn the run
      if (a) { console.log(`    boot retry ${a}: ${[...new Set(errors)].slice(0, 2).join(' | ')}`); errors.length = 0; await sleep(45000); }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })   // 180 s like bshot: Vite's public/ tile index (3096 files) exceeds 90 s under CPU load (2026-09-17);
      booted = await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: bootMs })
        .then(() => true).catch(() => false);
    }
    if (!booted) {
      console.log('    FAILED: page never reached record mode');
      await fs.writeFile(path.join(outRoot, `_console_${g.time}.log`), logs.join('\n')).catch(() => {});
      guardW?.stop();
      await page.close();
      continue;
    }

    for (const take of g.takes) {
      const P = take.spec;
      const t0 = Date.now();
      const total = isProbe ? probeFrames : Math.round(P.duration * FPS);
      // a 1-frame probe stays on key 0 (advancing by a whole duration in one step
      // would both teleport the camera to the end and lurch every car)
      const dt = isProbe ? (probeFrames > 1 ? (P.duration || 1) / (probeFrames - 1) : 0) : 1 / FPS;
      const outDir = isProbe ? probeRoot : path.join(clipRoot, take.tag);
      await fs.mkdir(outDir, { recursive: true });
      console.log(`\n  -- ${take.tag}: ${P.title || ''}`);

      // 1. put the camera on key 0 so the streamer targets the right place
      await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
      await page.evaluate(() => window.__advance(0));
      // 2. stream the new neighbourhood in for real (see the teleport trap note)
      const s1 = await settleWorld(page, bootMs);
      if (!(await worldOk(page))) console.log('     *** NO WORLD under the camera — frames will be INVALID');
      // 2b. FP26 (owner 2026-09-26: "significant tree and building pop in in the trailer"): pre-stream the WHOLE path. The
      //     settle above loads what key 0 sees; the take then travels, and every tile, prop and dressed facade it met on the
      //     way popped in mid-take. Visit each key and the points between with the dresser growing (it adds, never drops),
      //     settle at each, and come back to key 0; the dresser is frozen for the capture (step 4) and released after it.
      if (!isProbe && page.url().includes('filmlod=1')) {
        const tp = Date.now();
        await page.evaluate(() => window.__DRESS_HOLD?.('grow'));
        const pts = [];
        for (let k = 1; k < P.keys.length; k++) pts.push(midKey(P.keys[k - 1], P.keys[k]), P.keys[k]);
        // CP34: points a take wants streamed besides its path (P.prestream: [lon, lat, alt] each), e.g. the west side to the
        // Hudson for t4Out's 300 m rise, whose horizon otherwise shows the far LoD's bare carpet past the near ring
        for (const q of P.prestream || []) pts.push({ p: q, look: [q[0], q[1] + 0.002, 0] });
        for (const K of pts) {
          await page.evaluate((p) => window.__SET_PATH(p), holdAt(P, K));
          await page.evaluate(() => window.__advance(0));
          await settleWorld(page, 60000, 1500, 3);
        }
        await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
        await page.evaluate(() => window.__advance(0));
        await settleWorld(page, 60000, 1500, 3);
        // the light probe captures where the lens is and blends only 40 % per capture: after the extra points (300 m over
        // the west side's sunlit roofs for t4Out) the take ran on their brighter ambient, hazed white with a hard seam at
        // the horizon. The next capture at key 0 replaces it.
        if (P.prestream) await page.evaluate(() => window.__ENGINE?.resetProbe?.());
        const dz = await page.evaluate(() => window.__DRESS?.() || null);
        console.log(`     pre-streamed ${pts.length} path points in ${((Date.now() - tp) / 1000).toFixed(0)}s  dressed=${dz?.active ?? '-'}`);
      }
      // 3. run the SIM (traffic, signals, walkers) against the hold path so the camera stays put. Spawning in view is ALLOWED
      //    here (it is what fills the shot) and forbidden from step 4 on: nothing may pop into a recorded frame (spawnGuard)
      // the crowd is repopulated around the SETTLED lens (sim/peds.js reset: filled during tile streaming, all 640
      // walkers once landed on the first far tiles and none came within 45 m of the camera on the RTX)
      const pr = await page.evaluate(() => window.__PEDS_RESET?.() ?? null);
      // a take can clear the kerb trees along its lens path (shots.mjs clearTrees: radius in m)
      if (P.clearTrees) {
        const pts = P.keys.map((k) => project(k.p[0], k.p[1]));
        console.log(`     cleared ${await page.evaluate(([p, r]) => window.__CLEAR_TREES?.(p, r) ?? -1, [pts, P.clearTrees])} tree parts within ${P.clearTrees} m of the lens path`);
      }
      await page.evaluate(() => window.__SPAWNGUARD?.(false));
      let warm = isProbe ? 60 : (P.warm || 300);
      // PH27: a take about the signals starts at a chosen second of the 40 s cycle (shots.json `phase`, sim/signals.js): the
      // warm-up runs up to one cycle longer so that it ends there (film 11's fTraffic fell inside one green and showed none
      // of the queues moving off)
      if (!isProbe && P.phase !== undefined) {
        const t0s = await page.evaluate(() => window.__gtRefs?.traffic?.time ?? null);
        if (t0s !== null) { const c = (((P.phase - (t0s + warm / 30)) % 40) + 40) % 40; warm += Math.round(c * 30); console.log(`     phase ${P.phase} s: warm-up ${warm} steps (sim clock ${t0s.toFixed(1)} s)`); }
      }
      // draw-free warm-up (the sim needs the steps, not the pictures); the last 60 frames are drawn so the light probe,
      // auto-exposure and every temporal history settle on real frames before the capture
      if (FAST && !isProbe && (await page.evaluate(() => typeof window.__REC_WARM === 'function'))) {
        const w = await page.evaluate((n) => window.__REC_WARM({ n, drawLast: 60, dt: 1 / 30 }), warm);
        console.log(`     [fast] warm-up: ${warm} steps in ${(w.ms / 1000).toFixed(1)} s (${w.drawn} drawn)`);
      } else
      for (let i = 0; i < warm; i++) await page.evaluate((nd) => window.__advance(1 / 30, nd), i < warm - 60);
      // 4. reinstall the real path: setPath() resets t to 0
      await page.evaluate((p) => window.__SET_PATH(p), P);
      await page.evaluate(() => window.__advance(0));
      await page.evaluate(() => window.__SPAWNGUARD?.(true));
      const s2 = await settleWorld(page, 30000, 2500, 5);
      if (!isProbe) await page.evaluate(() => window.__DRESS_HOLD?.('freeze'));   // FP26: nothing re-dresses mid-take
      // FR28 --passes: the frame's cost pass by pass (main.js __PASSES: CPU submit and GPU time from timer queries, draw
      // calls, triangles), once with the sun's shadow map re-rendered every frame as in the take and once frozen, whose
      // difference is the shadow-caster pass; on still frames at the take's first pose, before the capture
      if (has('passes') && !isProbe) {
        for (const fz of [false, true]) {
          const pp = await page.evaluate((f) => window.__PASSES?.(30, f) ?? null, fz).catch((e) => ({ err: e.message }));
          if (!pp || pp.err) { console.log('     [passes] unavailable', pp?.err || ''); break; }
          console.log(`     [passes${fz ? ', shadow frozen' : ''}] ${pp.frameMs} ms/frame wall, GPU ${pp.gpuSum} ms, CPU ${pp.cpuSum} ms${pp.ext ? '' : ' (no timer queries)'}`);
          for (const [n, v] of Object.entries(pp.passes)) console.log(`        ${n.padEnd(22)} gpu ${String(v.gpu ?? '-').padStart(7)}  cpu ${String(v.cpu).padStart(6)}  calls ${String(v.calls).padStart(5)}  tris ${v.tris}`);
        }
      }
      console.log(`     settled+warm(${warm}=${(warm / 30).toFixed(0)}s sim) in ${((Date.now() - t0) / 1000).toFixed(0)}s  tiles=${s1?.near}->${s2?.near} dress=${s1?.dressActive}->${s2?.dressActive} cars=${s2?.cars} peds=${s2?.peds ?? '-'}${pr === null ? ' (no __PEDS_RESET)' : ''}`);

      // 5. RESUME. `--start N` has to fast-forward the simulation to frame N,
      //    not just start numbering there: PathCam.t advances with each step, so
      //    a loop that begins at i = N having taken no steps writes frame N with
      //    the camera still on key 0. (tools/trailer/record.mjs has this bug.)
      if (startAt > 0 && dt > 0) {
        for (let i = 0; i < startAt; i++) await page.evaluate((d) => window.__advance(d), dt);
        await settleWorld(page, 30000, 2000, 5);
        console.log(`     fast-forwarded ${startAt} steps to resume at frame ${startAt}`);
      }

      let frozen = 0, invalid = 0, retorn = 0, lensHit = 0, carJump = 0, carOv = 0;   // carOv: OV32 frames with overlapping vehicle bodies in view
      let carOff = 0;   // TN38: frames with a vehicle's wheel or centre on a non-road surface in view (main.js __CAR_OFFROAD)
      // OV41 (TRAILERUE 2026-10-08): frames with two PARKED bodies inside each other in view (the page's overlap list carries
      // parked pairs with traffic.js OV41); any such frame fails the run below (the twin's packing, not a traffic draw)
      let carOvP = 0;
      const parkedPairs = (L) => (L || []).filter((s) => /\(parked\) x \S+ \(parked\)/.test(s));
      // WS37: the park water's mirrors per frame (main.js __REC_FRAME `water`): [frame, [body, ray share, mirror weight, drawn]...]
      const waterLog = [], waterSeen = new Map(), evLog = [];
      let waterDrop = 0;
      await page.evaluate(() => window.__CAR_JUMPS?.()).catch(() => null);   // TW26: start the pose record at the capture's first frame
      // FROZEN-RENDER RECOVERY (film v3, 2026-09-11): the fWeather take went stale from
      // frame 90 to the end — a per-frame exception (StaticPool.free shadowed) stopped the
      // render loop and every later screenshot was the same dark canvas; the torn-frame
      // median drifted down and stopped re-shooting. Now a frozen loop or a "frame body
      // threw" message reloads the page, re-settles, re-warms and fast-forwards the sim to
      // the current frame, then the frame is shot again (traffic re-randomises: a small
      // discontinuity in the cars beats a frozen clip). At most two recoveries per take.
      let recoveries = 0;
      const recoverAt = async (i) => {
        console.log(`     *** recovering the page at frame ${i} (reload + resettle + fast-forward)`);
        bodyThrew = 0;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })   // 180 s like bshot: Vite's public/ tile index (3096 files) exceeds 90 s under CPU load (2026-09-17);
        await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: bootMs });
        await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
        await page.evaluate(() => window.__advance(0));
        await settleWorld(page, bootMs);
        await page.evaluate(() => window.__PEDS_RESET?.());
        if (P.clearTrees) await page.evaluate(([p, r]) => window.__CLEAR_TREES?.(p, r), [P.keys.map((k) => project(k.p[0], k.p[1])), P.clearTrees]);
        await page.evaluate(() => window.__SPAWNGUARD?.(false));
        { const wn = isProbe ? 60 : (P.warm || 300); for (let k = 0; k < wn; k++) await page.evaluate((nd) => window.__advance(1 / 30, nd), k < wn - 60); }
        await page.evaluate((p) => window.__SET_PATH(p), P);
        await page.evaluate(() => window.__advance(0));
        await page.evaluate(() => window.__SPAWNGUARD?.(true));
        for (let k = 0; k < i; k++) await page.evaluate((d) => window.__advance(d), dt);
        await settleWorld(page, 30000, 2000, 5);
        sizes.length = 0;
      };
      // Rolling median of recent frame sizes, used to catch a TORN or BLANK
      // capture. Playwright screenshots the compositor surface, and on this
      // ANGLE/D3D11 setup it can catch it mid-present: the first golden group
      // produced 16 frames with a hard vertical seam and a flat panel on one
      // side, plus 3 that came back entirely black — 1.4 % of the run, but at
      // 30 fps one of them is a visible flash. A torn or blank JPEG compresses
      // far smaller than a real frame, which is the cheap way to spot it.
      const sizes = [];
      const medianSize = () => { const s = [...sizes].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      // PERSISTENT-DARK DETECTOR (film v4, 2026-09-11): the fWeather canvas went dark from frame 85 with the
      // render loop still advancing, so waitLive passed; the rolling median then drifted down to the dark
      // frames' size within 12 frames and the torn-frame re-shoot went quiet. A FIXED baseline (median of the
      // take's first 24 accepted frames) catches it: 6 consecutive frames under 55 % of the baseline = the
      // canvas is gone -> reload, resettle, fast-forward and re-shoot from the first dark frame.
      let baseMedian = 0, darkRun = 0;
      if (FAST && !isProbe) {
        Object.assign(sink, { dir: outDir, sizes: [], bad: [] });
        const pt = { wait: 0, step: 0, settle: 0, acc: 0, cap: 0, call: 0, pumped: 0, n: 0 };
        const tF = Date.now();
        // AC26's mean is complete at the 8 Halton points: the stepped frame + ACC + 1 still ones (the classic path's last
        // __advance(0) and its capture frame drew ~2 more still frames on top of ACC)
        const accF = ACC > 0 ? ACC + 1 : 0;
        for (let i = startAt; i < Math.min(total, endAt); i++) {
          const tc = Date.now();
          const r = await page.evaluate((o) => window.__REC_FRAME(o), { dt: i > startAt ? dt : 0, acc: accF, type: 'image/jpeg', q: quality / 100,
            sink: `http://127.0.0.1:${sink.port}`, name: `frame_${String(i).padStart(5, '0')}.jpg`, checks: true, prof: PROF && i % 5 === 0, freezeShadow: !has('liveshadow'), enc: has('blobenc') ? 'blob' : 'worker',
            settle: i < startAt + 3 ? 25000 : settleMs }).catch((e) => ({ err: String(e.message || e).slice(0, 300) }));
          if (r.err) {
            frozen++;
            console.log(`     *** frame ${i}: the frame call failed (${r.err.split('\n')[0]}) — ${recoveries < 2 ? 'recovering' : 'giving up on the fast path for this take'}`);
            if (recoveries < 2) { recoveries++; await recoverAt(i); i--; continue; }
            break;
          }
          // --diag "<js expression>": evaluated in the page after each captured frame and printed (state per frame for a
          // diagnosis: the water's mirror picks, the camera's depth range)
          if (opt('diag')) console.log(`     [diag] f${i} ${JSON.stringify(await page.evaluate((x) => { try { return (0, eval)(x); } catch (e) { return 'ERR ' + e.message; } }, opt('diag')).catch((e) => 'ERR ' + e.message))}`);
          pt.call += Date.now() - tc; pt.n++; pt.pumped += r.pumped || 0;
          if (r.t) { pt.wait += r.t.wait; pt.step += r.t.step; pt.settle += r.t.settle; pt.acc += r.t.acc; pt.cap += r.t.cap; }
          if (r.lens) { lensHit++; if (lensHit <= 12) console.log(`     *** frame ${i}: the lens is inside ${r.lens.join(', ')}`); }
          if (r.jumps) { carJump += r.jumps.length; if (carJump <= 12) console.log(`     *** frame ${i}: car jump in view: ${r.jumps.slice(0, 3).join('; ')}`); }
          if (r.ovl) { carOv++; if (carOv <= 12) console.log(`     *** frame ${i}: vehicles overlap in view: ${r.ovl.slice(0, 3).join('; ')}`); }
          { const pp = parkedPairs(r.ovl); if (pp.length) { carOvP++; if (carOvP <= 6) console.log(`     *** frame ${i}: PARKED vehicles inside each other in view: ${pp.slice(0, 3).join('; ')}`); } }   // OV41
          if (r.offr) { carOff++; if (carOff <= 12) console.log(`     *** frame ${i}: vehicle off the carriageway in view: ${r.offr.slice(0, 3).join('; ')}`); }
          if (r.events) evLog.push([i, r.events]);
          if (r.water) {
            waterLog.push([i, r.water]);
            // a body that fills a share of the view keeps its mirror at full weight once its 0.5 s fade-in is over
            for (const [key, cover, w, drawn] of r.water) {
              if (cover <= 0) continue;
              if (!waterSeen.has(key)) waterSeen.set(key, i);
              if (cover >= 0.02 && i - waterSeen.get(key) >= 16 && (w < 0.95 || !drawn)) {
                waterDrop++;
                if (waterDrop <= 8) console.log(`     *** frame ${i}: REFLECTION-DROPOUT ${key} (${(cover * 100).toFixed(0)} % of the view) mirror weight ${w}${drawn ? '' : ', no mirror drawn'}`);
              }
            }
          }
          if ((i - startAt) % 60 === 0 && !(await worldOk(page))) { invalid++; console.log(`     *** frame ${i}: no ready tiles under the lens`); }
          if (i % 30 === 0 || i === total - 1) {
            const st = await page.evaluate(() => window.__RECSTAT());
            const el = (Date.now() - tF) / 1000, k = Math.max(1, pt.n);
            console.log(`     ${i + 1}/${total} t=${st.t}s tiles=${st.near} dress=${st.dressActive}/${st.dressQ} cars=${st.cars} peds=${st.peds ?? '-'}  [${el.toFixed(0)}s, ${(el / Math.max(1, i + 1 - startAt)).toFixed(2)} s/frame]`
              + `  call ${(pt.call / k).toFixed(0)} ms = wait ${(pt.wait / k).toFixed(0)} + step ${(pt.step / k).toFixed(0)} + settle ${(pt.settle / k).toFixed(0)} (${(pt.pumped / k).toFixed(1)} fr) + acc ${(pt.acc / k).toFixed(0)} (${accF} fr) + cap ${(pt.cap / k).toFixed(0)}${PROF ? ' [gpu-synced 1 in 5]' : ''}; ${sink.n} written`);
            Object.assign(pt, { wait: 0, step: 0, settle: 0, acc: 0, cap: 0, call: 0, pumped: 0, n: 0 });
          }
        }
        // every upload lands before the take is done, and the page gets its own loop back
        for (let w = 0; w < 600; w++) { const left = await page.evaluate(() => window.__REC_DRIVE(false)).catch(() => 0); if (!left && !sink.busy.size) break; await sleep(50); }
        await Promise.all([...sink.busy]);
        const got = (await fs.readdir(outDir)).filter((f) => f.endsWith('.jpg')).length;
        console.log(`     [fast] ${((Date.now() - tF) / 1000).toFixed(0)}s for ${Math.min(total, endAt) - startAt} frames (${((Date.now() - tF) / 1000 / Math.max(1, Math.min(total, endAt) - startAt)).toFixed(2)} s/frame without the warm-up); ${got} jpgs in the folder, ${(sink.bytes / 1048576).toFixed(0)} MB received`);
        if (sink.bad.length) { retorn += sink.bad.length; console.log(`     *** ${sink.bad.length} frame(s) to CHECK / re-shoot: ${sink.bad.slice(0, 8).join('; ')}`); }
        if (waterLog.length) await fs.writeFile(path.join(outDir, '_water.json'), JSON.stringify({ dropouts: waterDrop, frames: waterLog })).catch(() => {});
        // QA37: the frames where a cascade box stepped, the far shadow map re-rendered, the light probe landed or VG36 re-captured
        await fs.writeFile(path.join(outDir, '_events.json'), JSON.stringify({ frames: evLog })).catch(() => {});
        sink.dir = null;
      } else
      for (let i = startAt; i < Math.min(total, endAt); i++) {
        if (i > 0 && dt > 0) await page.evaluate((d) => window.__advance(d), dt);
        await waitSettled(page, i < 3 ? 25000 : settleMs);
        if (i < 2 || i % 30 === 0 || bodyThrew) {
          const live = bodyThrew ? null : await waitLive(page);
          if (!live) {
            frozen++;
            console.log(`     *** frame ${i}: render frozen${bodyThrew ? ' (frame body threw)' : ''} — ${recoveries < 2 ? 'recovering' : 'frames from here may be stale'}`);
            if (recoveries < 2) { recoveries++; await recoverAt(i); i--; continue; }
          }
        }
        const ok = (i < 2 || i % 60 === 0) ? await worldOk(page) : true;
        // LW26: a lens inside a walker or a vehicle is a ruined frame (film 9's fStreetLife opened inside a walker's head)
        const lh = await page.evaluate(() => window.__LENS_HIT?.() ?? null).catch(() => null);
        if (lh) { lensHit++; if (lensHit <= 12) console.log(`     *** frame ${i}: the lens is inside ${lh.join(', ')}`); }
        // TW26: a car in view that jumped this step (dt: the recorder's fixed step)
        const cj = i > startAt ? await page.evaluate((d) => window.__CAR_JUMPS?.(d) ?? null, dt).catch(() => null) : null;
        if (cj) { carJump += cj.length; if (carJump <= 12) console.log(`     *** frame ${i}: car jump in view: ${cj.slice(0, 3).join('; ')}`); }
        const co = i > startAt ? await page.evaluate(() => window.__CAR_OVERLAPS?.() ?? null).catch(() => null) : null;
        if (co) { carOv++; if (carOv <= 12) console.log(`     *** frame ${i}: vehicles overlap in view: ${co.slice(0, 3).join('; ')}`); }
        { const pp = parkedPairs(co); if (pp.length) { carOvP++; if (carOvP <= 6) console.log(`     *** frame ${i}: PARKED vehicles inside each other in view: ${pp.slice(0, 3).join('; ')}`); } }   // OV41
        const cf = i > startAt ? await page.evaluate(() => window.__CAR_OFFROAD?.() ?? null).catch(() => null) : null;   // TN38
        if (cf) { carOff++; if (carOff <= 12) console.log(`     *** frame ${i}: vehicle off the carriageway in view: ${cf.slice(0, 3).join('; ')}`); }
        if (!ok) invalid++;
        const stem = isProbe ? `${take.tag}_${g.time}${probeFrames > 1 ? '_' + i : ''}` : `frame_${String(i).padStart(5, '0')}`;
        const file = path.join(outDir, stem + (ok ? '' : '_INVALID') + (isProbe ? '.png' : '.jpg'));
        let sz = 0;
        // FILM 7: the voids (a black box or half over a lit frame) come in BURSTS on the heavy aerials — four quick
        // retries 400 ms apart all failed on mMidtownSky and fSkyline and the last bad capture was kept. Ten attempts;
        // from the third on, four more dt = 0 frames and 1.5 s for the GPU to drain before the next shot.
        const MAXA = 10;
        for (let k = 0; k < ACC; k++) await page.evaluate(() => window.__advance(0));
        for (let attempt = 0; attempt < MAXA; attempt++) {
          // a retry drops the TAA history and re-accumulates 6 still frames (a fresh history's first frame is un-antialiased)
          if (attempt >= 1) { await page.evaluate(() => window.__TAA_RESET?.()); for (let k = 0; k < 6; k++) await page.evaluate(() => window.__advance(0)); }
          if (attempt >= 2) await sleep(1500);
          // Re-submit the SAME world state before every shot (dt = 0 renders a
          // frame without moving the camera, the traffic or the clock). This is
          // the `__redraw()` trick from tools/trailer/morph-record.mjs, and it
          // is what stops the screenshot landing on a half-composited surface.
          await page.evaluate(() => window.__advance(0));
          // TEAR-PROOF (2026-09-17): the page reads its own canvas back in the same task as the draw (main.js
          // __capture -> engine.capture -> toDataURL). page.screenshot() raced the compositor and 68 of 3507 v6 frames came
          // back as a dark rectangle; the size check below stays as a safety net and as the fallback path's guard.
          const hasCap = await page.evaluate(() => typeof window.__capture === 'function').catch(() => false);
          if (hasCap) {
            const dataUrl = await page.evaluate(([t, q]) => window.__capture(t, q), [isProbe ? 'image/png' : 'image/jpeg', quality / 100]);
            const img = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
            const bh = await blackHalf(img);
            if (bh && attempt === MAXA - 1) console.log(`     *** frame ${i}: black half on all ${MAXA} attempts (L|R|T|B ${bh.join(' | ')}) — kept, CHECK IT`);
            else if (bh) {
              // kept for review OUTSIDE the take's folder (cut.mjs counts every jpg in it)
              const rj = outDir + '_rejects';
              await fs.mkdir(rj, { recursive: true });
              await fs.writeFile(path.join(rj, `${stem}_a${attempt + 1}${isProbe ? '.png' : '.jpg'}`), img);
              retorn++; console.log(`     frame ${i}: a black half on a lit frame (L|R|T|B ${bh.join(' | ')}) — re-shooting (attempt ${attempt + 2})`); await sleep(400); continue;
            }
            await fs.writeFile(file, img);
          } else if (isProbe) await page.screenshot({ path: file, timeout: 120000 });
          else await page.screenshot({ path: file, type: 'jpeg', quality, timeout: 120000 });
          sz = fsSync.statSync(file).size;
          if (sizes.length < 6 || sz >= medianSize() * 0.80) break;   // looks like a real frame (0.80: a half-rendered frame drops ~25-40 %, owner 2026-09-17)
          if (attempt === MAXA - 1) { console.log(`     *** frame ${i}: ${(sz / 1024).toFixed(0)}KB vs median ${(medianSize() / 1024).toFixed(0)}KB on all ${MAXA} attempts — kept, CHECK IT`); break; }
          retorn++;
          console.log(`     frame ${i}: ${(sz / 1024).toFixed(0)}KB vs median ${(medianSize() / 1024).toFixed(0)}KB — torn/blank, re-shooting (attempt ${attempt + 2})`);
          await sleep(400);
        }
        sizes.push(sz);
        if (sizes.length > 24) sizes.shift();
        if (!baseMedian && sizes.length >= 24) baseMedian = medianSize();
        darkRun = (baseMedian && sz < baseMedian * 0.55) ? darkRun + 1 : 0;
        if (darkRun >= 6 && recoveries < 2) {
          const back = Math.max(startAt, i - 5);
          console.log(`     *** frame ${i}: ${darkRun} consecutive frames under 55 % of the take's baseline size (${(baseMedian / 1024).toFixed(0)}KB) — canvas gone dark, recovering from frame ${back}`);
          recoveries++; darkRun = 0; baseMedian = 0;
          await recoverAt(back);
          i = back - 1; continue;
        }
        if (i % 30 === 0 || i === total - 1) {
          const s = await page.evaluate(() => window.__RECSTAT());
          const el = (Date.now() - t0) / 1000;
          console.log(`     ${i + 1}/${total} t=${s.t}s pos=${JSON.stringify(s.pos)} tiles=${s.near} dress=${s.dressActive}/${s.dressQ} cars=${s.cars} peds=${s.peds ?? '-'}  [${el.toFixed(0)}s, ${(el / Math.max(1, i + 1 - startAt)).toFixed(2)} s/frame]`);
        }
      }
      const secs = (Date.now() - t0) / 1000;
      await page.evaluate(() => window.__DRESS_HOLD?.(null));   // FP26: the next take re-dresses round its own path
      results.push({ tag: take.tag, outDir, frames: total, secs, frozen, invalid, retorn, probe: isProbe, carOvP });
      console.log(`     done ${total} frames in ${secs.toFixed(0)}s (${(secs / Math.max(1, total)).toFixed(2)} s/frame)${frozen ? ` FROZEN x${frozen}` : ''}${invalid ? ` INVALID x${invalid}` : ''}${retorn ? ` RE-SHOT x${retorn}` : ''}${lensHit ? ` LENS-INSIDE x${lensHit}` : ''}${carJump ? ` CAR-JUMP x${carJump}` : ''}${carOv ? ` CAR-OVERLAP x${carOv}` : ''}${carOvP ? ` PARKED-OVERLAP x${carOvP}` : ''}${carOff ? ` CAR-OFFROAD x${carOff}` : ''}${waterDrop ? ` REFLECTION-DROPOUT x${waterDrop}` : ''}`);
    }
    const uniq = [...new Set(errors)];
    if (uniq.length) { console.log('    PAGE ERRORS:'); for (const e of uniq.slice(0, 6)) console.log('      ' + e); }
    await fs.writeFile(path.join(outRoot, `_console_${g.time}${g.flags ? '_' + g.flags.replace(/[^\w]/g, '') : ''}.log`), logs.join('\n')).catch(() => {});
    guardW?.stop();
    await page.close();
    console.log(`=== group done in ${((Date.now() - G0) / 60000).toFixed(1)} min\n`);
  }
} finally {
  await browser.close();
  releaseGpu();
  if (server) server.kill();
}

if (encode && !isProbe) {
  const bin = (await import('ffmpeg-static')).default;
  for (const r of results) {
    const mp4 = path.join(clipRoot, r.tag + '.mp4');
    const p = spawnSync(bin, ['-y', '-framerate', String(FPS), '-i', path.join(r.outDir, 'frame_%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
      { encoding: 'utf8' });
    console.log(p.status === 0 ? `encoded ${path.relative(root, mp4)}` : 'ffmpeg failed: ' + (p.stderr || '').split('\n').slice(-6).join('\n'));
  }
}
console.log('\n--- summary');
for (const r of results) console.log(`${r.tag.padEnd(22)} ${String(r.frames).padStart(4)} frames ${r.secs.toFixed(0).padStart(5)}s${r.frozen ? '  FROZEN x' + r.frozen : ''}${r.invalid ? '  INVALID x' + r.invalid : ''}`);
// QA37 (owner 2026-10-03: "fix z fighting in every video, make sure there are no shadow pop-ins, make sure water reflections
// remain working throughout, and make sure this is a resolved error for future renders"): every recorded take goes through
// tools/ad/qa_scan.py (the NaN black blocks) and its temporal checks (tools/ad/temporal_scan.py: flicker such as z-fighting
// and shimmering water, a mode that alternates frame by frame, shadow / LoD / reflection pops, the water's mirror dropouts
// logged above). A failing take is listed loudly with its review strips and the run exits 3. `--noqa` skips it.
const takesQA = results.filter((r) => !r.probe && r.frames >= 8);
if (takesQA.length && !has('noqa')) {
  const qaOut = path.join(clipRoot, '_qa');
  console.log(`\n--- QA (tools/ad/qa_scan.py + temporal_scan.py; review strips in ${path.relative(root, qaOut)})`);
  const failed = [];
  for (const r of takesQA) {
    const q = spawnSync('python3', [path.join(here, 'qa_scan.py'), clipRoot, r.tag, '--out', qaOut, '--json', path.join(qaOut, r.tag + '.json')], { encoding: 'utf8', timeout: 900000 });
    const out = ((q.stdout || '') + (q.stderr || '')).trim();
    for (const l of out.split('\n').filter(Boolean).slice(-6)) console.log('  ' + l);
    if (q.status !== 0) failed.push(`${r.tag} (exit ${q.status})`);
  }
  if (failed.length) {
    console.log(`\n*** QA FAILED: ${failed.join(', ')} -- look at the strips in ${path.relative(root, qaOut)} before cutting; re-record or fix.`);
    process.exitCode = 3;
  } else console.log('QA passed: no NaN blocks, flicker, alternation, pops or reflection dropouts found.');
}
// OV41 (TRAILERUE 2026-10-08, the lead: "It passed these takes, so treat that as a broken gate"): the CAR-OVERLAP check
// skipped parked pairs, so t8MorningsideSwoop's two parked SUVs 0.29 m into each other at 29 m passed. With the page's
// OV41 the overlap list carries parked pairs, and a take with any parked pair in view (> 0.1 m deep, within 150 m, in the
// frustum) fails the run (exit 3). `--noparkgate` only logs them; the page's `ov41=0` drops the pairs from the list.
const parkedFail = results.filter((r) => !r.probe && r.carOvP > 0);
if (parkedFail.length && !has('noparkgate')) {
  console.log(`\n*** CAR-OVERLAP FAILED: ${parkedFail.map((r) => `${r.tag} (${r.carOvP} frames)`).join(', ')}: parked vehicles stand inside each other in view (the twin's kerb packing, traffic.js PK41); fix the packing or re-frame.`);
  process.exitCode = 3;
} else if (results.some((r) => !r.probe)) console.log('Parked vehicles: none inside each other in view.');
