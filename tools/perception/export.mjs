// PERCEPTION EXPORTER — writes object-detection / segmentation ground truth
// for a preset camera or a keyframed trailer path.
//
// Design + class table + labels.json schema: docs/notes/perception.md
//
//   node tools/perception/export.mjs --view xwalk125 --time day
//   node tools/perception/export.mjs --path harlem125Street --seconds 10 --fps 30 --panel 1
//   node tools/perception/export.mjs --list
//
// Per frame, under <out>/<tag>/frame_%05d/:
//   rgb.png  semantic.png  instance.png  depth.png  depth_vis.png
//   amodal/<id>.png (the top-N most occluded instances)  labels.json
// and, with --panel, the composited video frame at <out>/<tag>/panel/frame_%05d.png
// (mirrored into --clip for the trailer cut).
//
// Same conventions as tools/bshot.mjs and tools/trailer/record.mjs: the GPU
// lock serialises against other captures, Vite is started on a
// random port, HMR is swallowed so a concurrent edit cannot reload the
// page mid-capture, and the page runs in ?record=1 fixed-step mode so two runs
// produce the same frames. Walkers are IN (2026-09-23, the film shows the PV2 crowd); --nopeds restores ?nopeds=1.
// After the settle the crowd is emptied and refilled around the lens while the camera holds key 0: --warm <N> sim
// steps of 1/30 s (default 60; the film clip uses 300).
import { chromium } from 'playwright';
import { acquireGpu } from '../gpulock.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bdir = path.join(root, 'boundlessjs');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : def;
};
const num = (name, def) => Number(opt(name, String(def)));

// mirror of boundlessjs/src/shared/geo.js project()
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];
const P = (lon, lat, alt, yaw, pitch, title) => ({ lon, lat, alt, yaw, pitch, title });

// still framings — the perception-relevant subset of tools/bshot.mjs PRESETS.
// `alt` is metres ABOVE THE LOCAL TERRAIN: every framing is driven through the
// same PathCam that the trailer recorder uses (?record=1 has no fly cam, and a
// raw absolute y put the first test camera at sea level, under the water plane).
const VIEWS = {
  xwalk125: P(-73.94530, 40.80790, 1.8, 2.5, -0.08, '125th & Lenox, SE corner looking NW across'),
  // NOT bshot's xwalkAir point: that one is inside a building footprint, which
  // only worked there because the fly cam rises out of geometry while a shot
  // is being set up and PathCam does not. This one is over the roadway.
  xwalkAir: P(-73.94545, 40.80800, 24, 2.5, -0.80, '125th & Lenox from 24 m up'),
  // Authored against the v5 tile set, where this was the NEAREST compiled
  // SIGNAL_MAST to 125th & Lenox (194 m) and the only way to exercise the
  // traffic_signal / pedestrian_signal classes at all. Tiles v8 put four masts
  // on the junction itself, so xwalk125 shows signals too — this framing stays
  // as the single-mast close-up.
  signalMast: P(-73.944473, 40.806368, 1.8, -0.785, 0.19, 'ACP Blvd signal mast, close-up'),
  xwalkCol: P(-73.96390, 40.80790, 1.8, -0.9, -0.06, 'Broadway & 116th'),
  xwalkRow: P(-73.947749, 40.805388, 1.7, 1.078, -0.05, 'W 122nd at Mt Morris Park W'),
  harlem125: P(-73.94510, 40.80770, 4, 2.15, 0.10, '125th St canyon'),
  harlemRow: P(-73.94720, 40.80540, 2.2, 1.35, 0.06, 'Harlem rowhouse side street'),
  columbia: P(-73.96225, 40.80753, 3, -2.1, 0.12, 'Columbia, College Walk'),
  canyon5th: P(-73.98103, 40.75341, 3, 2.635, 0.22, '5th Ave & W 42nd'),
  timessq: P(-73.98590, 40.75730, 3, -0.35, 0.2, 'Times Square'),
  streetlevel: P(-73.98565, 40.74980, 3, -0.6, 0.2, 'Midtown, 34th St'),
};
// a preset -> a one-frame PathCam path (record.mjs --stills does the same):
// the look target is 45 m along the framing's yaw/pitch, and the second key is
// nudged a few cm toward it so the Catmull-Rom curve has a nonzero length
function viewPath(V) {
  const [x, z] = project(V.lon, V.lat);
  const D = 45;
  const lx = x - Math.sin(V.yaw) * Math.cos(V.pitch) * D;
  const lz = z - Math.cos(V.yaw) * Math.cos(V.pitch) * D;
  const [llon, llat] = unproject(lx, lz);
  const look = [llon, llat, V.alt + Math.sin(V.pitch) * D];
  return {
    title: V.title || 'still', duration: 1, ease: 0, still: true,
    keys: [
      { p: [V.lon, V.lat, V.alt], look },
      { p: [V.lon + (llon - V.lon) * 1e-3, V.lat + (llat - V.lat) * 1e-3, V.alt], look },
    ],
  };
}

const paths = JSON.parse(await fs.readFile(path.join(root, 'tools/trailer/paths.json'), 'utf8'));
const PATHS = {};
for (const [k, v] of Object.entries(paths)) if (k !== '_stills') PATHS[k] = v;

if (opt('list') === '1') {
  console.log('views:');
  for (const [k, v] of Object.entries(VIEWS)) console.log(`  ${k.padEnd(14)} ${v.alt} m  ${v.title || ''}`);
  console.log('paths (tools/trailer/paths.json):');
  for (const [k, v] of Object.entries(PATHS)) console.log(`  ${k.padEnd(18)} ${v.duration}s  ${v.title}`);
  process.exit(0);
}

const viewName = opt('view');
const pathName = opt('path');
if (!viewName && !pathName) { console.log('need --view <preset> or --path <trailer path>  (--list to see them)'); process.exit(1); }
const fps = num('fps', 30);
const seconds = opt('seconds') ? num('seconds', 10) : null;
const startAt = num('start', 0);
const every = Math.max(1, num('every', 1));   // fixed steps of 1/fps between captures
const timeArg = opt('time');
const [W, H] = (opt('size', '1920x1080')).split('x').map(Number);
const outRoot = path.resolve(root, opt('out', 'boundlessjs/shots/perception'));
const clipDir = opt('clip') ? path.resolve(root, opt('clip')) : null;
const wantPanel = opt('panel', pathName ? '1' : '1') === '1';
const headed = opt('headed') === '1';
const extraQ = opt('flags', '');
const label = opt('label', '');
const bootMs = num('boot', 180000);
const settleMs = num('settle', 1200);
const capOpts = {
  minpx: num('minpx', 30),
  amodal: num('amodal', 8),
  amodalmax: num('amodalmax', 24),
  amodalbuildings: num('amodalbuildings', 4),
  depthmax: num('depthmax', 1000),
  visfar: num('visfar', 150),
  boxminpx: num('boxminpx', 200),
  labelminpx: num('labelminpx', 1800),
  idradius: num('idradius', 600),
  panelWidth: num('panelwidth', 1920),
  size: [W, H],
};
const want = {
  rgb: opt('rgb', '1') === '1', semantic: opt('semantic', '1') === '1',
  instance: opt('instance', '1') === '1', depth: opt('depth', '1') === '1',
  depth_vis: opt('depthvis', '1') === '1', amodal: opt('amodalpng', '1') === '1',
  panel: wantPanel,
};

const tag = (pathName || viewName) + (timeArg ? '_' + timeArg : '') + (label ? '_' + label : '');
const outDir = path.join(outRoot, tag);
await fs.mkdir(outDir, { recursive: true });
if (clipDir) await fs.mkdir(clipDir, { recursive: true });
if (wantPanel) await fs.mkdir(path.join(outDir, 'panel'), { recursive: true });

const writeDataUrl = async (file, dataUrl) => {
  const i = dataUrl.indexOf(',');
  await fs.writeFile(file, Buffer.from(dataUrl.slice(i + 1), 'base64'));
};

// ------------------------------------------------------------------- launch
// take the GPU lock BEFORE spawning Vite (bshot.mjs: a queued capture must not
// sit on a dev server and a Chromium while it waits — four queued jobs doing that
// paged the machine).
//
// --nolock skips it. Use it ONLY for a one-frame validation while another
// job is mid-clip: gpulock.mjs treats a lock older than 20 min as stale, so
// a long recorder that outlives its own lock is already sharing the GPU with
// whoever grabbed it next, and a 90-second still is not what pages this
// machine. Every multi-frame run takes the lock.
const releaseGpu = opt('nolock') === '1' ? (() => {}) : await acquireGpu('perception ' + tag);
let port = opt('port');
let server = null;
if (!port) {
  port = String(5400 + Math.floor(Math.random() * 3000));
  const viteBin = path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });   // no HMR reloads mid-capture (vite.config.js)
  await new Promise((r) => setTimeout(r, 3000));
}
const browser = await chromium.launch({
  headless: !headed,
  args: [
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    `--window-size=${W},${H}`,
  ],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A frame is "settled" when no tile fetch is outstanding, the NYC dresser has
// drained its build queue, and the tile UNDER THE CAMERA is assembled — that
// last one is `streamer.readyUnder()`, which the bshot/record harnesses gate on
// because "≥ 4 ready tiles anywhere" let open-water and hole-under-camera
// frames through under load (streamer.js:74). Unsettled frames still get
// captured, into an INVALID_ directory, so a bad frame is visible in the
// listing rather than silently mixed into the set.
const waitSettled = async (page, budget) => {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < budget) {
    s = await page.evaluate(() => {
      const r = window.__RECSTAT();
      r.under = !!(window.__STREAMER && window.__STREAMER.readyUnder && window.__STREAMER.readyUnder());
      return r;
    });
    if (s.idle && s.dressQ === 0 && s.near > 4 && s.under) return s;
    await sleep(150);
  }
  return s;
};
const settled = (s) => !!(s && s.idle && s.dressQ === 0 && s.near > 4 && s.under);
// engine.frames only advances on a frame that reached the renderer: if it is
// stuck, a capture would silently return the LAST GOOD buffers
const waitLive = async (page, budget = 8000) => {
  const f0 = (await page.evaluate(() => window.__RECSTAT())).frames;
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    await sleep(180);
    const s = await page.evaluate(() => window.__RECSTAT());
    if (s.frames > f0 + 2) return s;
  }
  return null;
};

const T0 = Date.now();
const summary = { tag, frames: 0, invalid: 0, instances: 0, amodal: 0, rgbRetries: 0, rgbBlank: 0, blankFrames: [], outDir };
const logs = [], errors = [];

try {
  if (pathName && !PATHS[pathName]) throw new Error('unknown path ' + pathName + ' (--list)');
  if (!pathName && !VIEWS[viewName]) throw new Error('unknown view ' + viewName + ' (--list)');
  // --lon/--lat/--alt/--yaw/--pitch override a preset's framing without editing
  // the table (aiming a new still is otherwise a code change per attempt)
  if (!pathName) {
    const V0 = VIEWS[viewName];
    for (const k of ['lon', 'lat', 'alt', 'yaw', 'pitch']) if (opt(k) !== null) V0[k] = num(k, V0[k]);
  }
  // both a clip and a still run through the SAME PathCam: a still is a
  // one-frame path, so altitudes are terrain-relative in either case
  const P0 = pathName ? PATHS[pathName] : viewPath(VIEWS[viewName]);
  const isStill = !pathName;
  const time = timeArg || P0.time || 'day';
  const startXZ = project(P0.keys[0].p[0], P0.keys[0].p[1]);

  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // src/ may be edited while this runs: swallow the HMR socket so the
  // module graph this page loaded at goto() is frozen for the whole capture.
  await page.routeWebSocket('**', () => {}).catch(() => {});
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + String(e).slice(0, 400)); logs.push('PAGEERROR ' + String(e)); });

  const q = `x=${startXZ[0].toFixed(1)}&z=${startXZ[1].toFixed(1)}&y=${(P0.keys[0].p[2] + 40).toFixed(1)}`;
  const url = `http://127.0.0.1:${port}/?shot=1&record=1&hud=0${args.includes('--nopeds') ? '&nopeds=1' : ''}&${q}&time=${time}`
    + `${P0.flags ? '&' + P0.flags : ''}${extraQ ? '&' + extraQ : ''}`;
  console.log(`=== perception ${tag}`);
  console.log('    ' + url);

  let booted = false;
  for (let attempt = 0; attempt < 3 && !booted; attempt++) {
    if (attempt) { console.log(`    boot retry ${attempt}: ${[...new Set(errors)].slice(0, 2).join(' | ')}`); errors.length = 0; await sleep(40000); }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    booted = await page.waitForFunction('typeof window.__PERC === "object" && typeof window.__advance === "function"', null, { timeout: 150000 })
      .then(() => true).catch(() => false);
  }
  if (!booted) throw new Error('page never reached perception + record mode (see _console.log)');

  const self = await page.evaluate(() => window.__PERC.selftest());
  console.log('    selftest:', JSON.stringify(self));
  if (!self.bijection || !self.png) throw new Error('perception selftest failed: ' + JSON.stringify(self.notes));

  const info = await page.evaluate((p) => window.__SET_PATH(p), P0);
  console.log('    path installed:', JSON.stringify(info), P0.title || '');
  await page.evaluate(() => window.__advance(0));         // snap onto key 0
  const s1 = await waitSettled(page, bootMs);
  console.log(`    settled in ${((Date.now() - T0) / 1000).toFixed(0)}s`, JSON.stringify(s1));
  // populate the sims. Film 7 (2026-09-23): the crowd is emptied and refilled around the SETTLED camera first
  // (sim/peds.js reset — filled during tile streaming it could land entirely on the first far tiles), and the warm-up
  // runs against a HOLD path at key 0 (as tools/ad/record.mjs does) so --warm N never carries the camera down the path.
  const warmN = Math.max(0, Number(opt('warm', '60')) || 0);
  const k0 = P0.keys[0];
  await page.evaluate((p) => window.__SET_PATH(p), { duration: 1e6, ease: 0, abs: P0.abs, tension: P0.tension, keys: [k0, { p: [k0.p[0] + 1e-6, k0.p[1] + 1e-6, k0.p[2]], look: k0.look }] });
  await page.evaluate(() => window.__advance(0));
  await page.evaluate(() => window.__PEDS_RESET?.());
  for (let i = 0; i < warmN; i++) await page.evaluate(() => window.__advance(1 / 30));
  await page.evaluate((p) => window.__SET_PATH(p), P0);
  await page.evaluate(() => window.__advance(0));
  await waitSettled(page, 20000);
  // the crossing-zone reconstruction reads every loaded tile's road graph
  console.log('    crossing zones:', await page.evaluate(() => window.__PERC.buildCrossZones()));

  const total = isStill ? 1 : Math.max(1, Math.round(((seconds ?? P0.duration ?? 10) * fps) / every));
  const dt = 1 / fps;
  for (let i = startAt; i < total; i++) {
    // --every N: N fixed steps of 1/fps between captures. Spreads a dataset
    // sample over a whole path without stepping the sims by a huge dt.
    if (!isStill && i > 0) for (let k = 0; k < every; k++) await page.evaluate((d) => window.__advance(d), dt);
    const st = await waitSettled(page, i < 3 ? 25000 : settleMs);
    const ok = settled(st);
    if (i < 3 || i % 30 === 0) { if (!(await waitLive(page))) console.log(`    *** frame ${i}: render frozen — buffers may be stale`); }
    const fdir = path.join(outDir, (ok ? '' : 'INVALID_') + `frame_${String(i).padStart(5, '0')}`);
    await fs.mkdir(fdir, { recursive: true });
    const r = await page.evaluate(async ([o, w, fr, tt, sl]) => window.__PERC.capture({ ...o, want: w, frame: fr, t: tt, sceneLabel: sl }),
      [capOpts, want, i, +(i * dt * every).toFixed(4), `${P0.label || P0.title || tag} · ${({ day: "midday", golden: "golden hour", dusk: "dusk", night: "night" })[time] || time}`]);
    // buffers
    for (const [k, v] of Object.entries(r.png)) {
      if (!v) continue;
      if (k === 'panel') {
        await writeDataUrl(path.join(outDir, 'panel', `frame_${String(i).padStart(5, '0')}.png`), v);
        if (clipDir) await writeDataUrl(path.join(clipDir, `frame_${String(i).padStart(5, '0')}.png`), v);
      } else await writeDataUrl(path.join(fdir, k + '.png'), v);
    }
    for (const sub of ['amodal', 'visible']) {
      const list = Object.entries(r[sub] || {});
      if (!list.length) continue;
      await fs.mkdir(path.join(fdir, sub), { recursive: true });
      for (const [id, v] of list) await writeDataUrl(path.join(fdir, sub, id + '.png'), v);
    }
    await fs.writeFile(path.join(fdir, 'labels.json'), JSON.stringify(r.labels, null, 1));
    summary.frames++;
    if (!ok) summary.invalid++;
    summary.instances += r.labels.counts.instances;
    summary.amodal += r.labels.counts.amodal_masks;
    // The beauty frame is grabbed with a gl.readPixels and re-shot if it trips
    // the blank/torn gate (segRender.js section 6). The first 300-frame clip
    // shipped 37 black RGB panels, so a frame still tripping the gate on the
    // last attempt is NAMED rather than averaged away — but the gate is
    // trigger-happy by design and a very dark frame can set it, so this is a
    // "look at this one", not a verdict. `tools/perception/scanclip.mjs` is the
    // authoritative check on the finished clip.
    summary.rgbRetries += r.labels.counts.rgb_retries || 0;
    if (r.labels.counts.rgb_flagged) { summary.rgbBlank++; summary.blankFrames.push(i); console.log(`    *** frame ${i}: RGB still flagged after ${r.labels.counts.rgb_retries} re-shoots — verify it`); }
    else if (r.labels.counts.rgb_retries) console.log(`    frame ${i}: RGB re-shot x${r.labels.counts.rgb_retries}`);
    if (i < 3 || i % 10 === 0 || i === total - 1) {
      const byCls = {};
      for (const ins of r.labels.instances) byCls[ins.class] = (byCls[ins.class] || 0) + 1;
      console.log(`    ${i}/${total} ${ok ? '' : 'INVALID '}${r.labels.counts.instances} inst, ${r.labels.counts.amodal_masks} amodal, ${r.labels.ms}ms  ${JSON.stringify(byCls)}  [${((Date.now() - T0) / 1000).toFixed(0)}s]`);
    }
  }

  // --evalfile <js>: run a page expression after the frames (bshot's --evalfile
  // convention). Used for probes like window.__PERC.whoAt(0.5, 0.9).
  if (opt('evalfile')) {
    const expr = await fs.readFile(opt('evalfile'), 'utf8');
    const r = await page.evaluate(async (x) => {
      try { const v = await eval(x); return JSON.stringify(v); } catch (e) { return 'ERR ' + e.message; }
    }, expr);
    console.log('    eval: ' + r);
  }

  // --onscreen: the ?seg=<mode> ON-SCREEN path (engine.segRender straight to
  // the canvas, no offscreen target) — a page screenshot per mode, so the
  // runtime render modes are validated and not just the exporter's readbacks
  if (opt('onscreen', '1') === '1') {
    for (const m of ['semantic', 'instance', 'depth']) {
      await page.evaluate((mm) => window.__PERC.enter(mm), m);
      await sleep(700);
      await page.screenshot({ path: path.join(outDir, `onscreen_${m}.png`), timeout: 120000 });
    }
    await page.evaluate(() => window.__PERC.exit());
    console.log('    onscreen: ' + ['semantic', 'instance', 'depth'].map((m) => `onscreen_${m}.png`).join(' '));
  }

  await fs.writeFile(path.join(outDir, 'dataset.json'), JSON.stringify({
    tag, view: viewName || null, path: pathName || null, time, fps, frames: summary.frames,
    size: [W, H], url, capture: capOpts,
    generated: new Date().toISOString(),
    classes: (await page.evaluate(() => window.__PERC.classes)),
    note: 'per-frame labels in frame_%05d/labels.json; docs/notes/perception.md documents the schema',
  }, null, 1));
  const stats = await page.evaluate(() => window.__PERC.stats());
  console.log('    perc stats:', JSON.stringify(stats));
  const uniq = [...new Set(errors)];
  if (uniq.length) { console.log('    PAGE ERRORS:'); for (const e of uniq.slice(0, 6)) console.log('      ' + e); }
  await fs.writeFile(path.join(outDir, '_console.log'), logs.join('\n')).catch(() => {});
  await page.close();
} catch (e) {
  console.log('FAILED:', String(e).split('\n')[0]);
  console.log('  last logs:\n  ' + logs.slice(-14).join('\n  '));
  await fs.writeFile(path.join(outDir, '_console.log'), logs.join('\n')).catch(() => {});
} finally {
  await browser.close();
  releaseGpu();
  if (server) server.kill();
}
console.log(`${tag}: ${summary.frames} frames (${summary.invalid} invalid), ${summary.instances} instance labels, ${summary.amodal} amodal masks in ${((Date.now() - T0) / 1000).toFixed(0)}s`);
console.log(`  rgb: ${summary.rgbRetries} re-shot, ${summary.rgbBlank} still flagged`
  + (summary.blankFrames.length
    ? ' -> frames ' + summary.blankFrames.join(',') + '\n       (a flag is a suspicion — run tools/perception/scanclip.mjs to settle it)'
    : ''));
console.log('  -> ' + path.relative(root, outDir));
