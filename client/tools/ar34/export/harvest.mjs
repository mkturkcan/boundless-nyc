// OFFLINE TARGETS (AR34 LOOK, 2026-10-02; owner: "support both Blender and web as targets ... a higher quality renderer"):
// the scene harvest, step 1 of the USD export (harvest.mjs -> usd_write.py -> Blender / any USD renderer).
//
// Boots the page exactly as tools/ad/record.mjs does for a shot group (the _meta flags plus the shot's flags, its time of
// day, the settle, the FP26 pre-stream, the walkers' reset, the warm-up, the real path installed, the dresser frozen; the
// sequence is tools/ad/clearance.mjs's), so the city that is exported is the one the take draws: the compiled tiles (ground,
// kerbs, paint), the facade kit and the custom buildings, the viaducts, the instancer's street furniture and trees, and the
// deterministic sim's vehicles. Then it steps the take's timeline one recorder frame at a time and writes:
//   - static.json + geometry / texture blobs: every visible Mesh in a square region round --centre (default the 125th St
//     arch), a mesh larger than the region clipped to it by triangle; LOD objects at their finest level; the instancer's
//     pools from their instance stores (every live instance in the region, not the view-culled draw set) at LOD 0;
//   - dyn_<shot>_f<frame>.json: the InstancedMesh draw sets that move (vehicles, any non-pool instancing) at --frames;
//   - cam_<shot>.json: the page's own camera (world matrix, fov, aspect, clip) at every frame of the take (PathCam's path as
//     drawn: the replica in clearance.mjs is checked against the same camera);
//   - lights.json: the sun's direction, colour and intensity, the hemisphere lights, tone mapping and exposure.
// Materials are described by their three.js parameters and the uniforms their onBeforeCompile installs (read on a stand-in
// shader, as fk/kitMats.js does), so the writer can map the PBR library's texture sets (pbAlb / pbNrm / pbOrm, metre UVs,
// tint ratio) and the facade kit's per-vertex tint (aFkTr). Textures are read back from the GPU (any source: images,
// KTX2-compressed, data), written as PNG with uv (0, 0) at the bottom left (USD's st convention).
// Not exported (listed in the manifest): the crowd's walkers (GPU-skinned from pose textures; their meshes are bind poses),
// custom-attribute instancing (fountain spray, grass blades), Points / Lines / Sprites, shader-only looks (weathering,
// window interiors, drawn signs beyond their textures).
//
//   GPU_LANE=27 node client/tools/ar34/export/harvest.mjs --shots t7ArchTrack,t7ArchCrane --frames 0,54,107 \
//        --out /data0/projectnyc_aux/tmp/export/h2 [--centre -73.96060,40.81780] [--region 350] [--far 800] [--maxtex 2048]
//   --region: pools and moving sets within this half-width (m) of the centre; --far: meshes (tiles, buildings, viaducts)
import { chromium } from 'playwright';
import { acquireGpu } from '../../../../tools/gpulock.mjs';
import { installGuard, watchPage } from '../../../../tools/harness_guard.mjs';
import { spawn } from 'node:child_process';
import { promises as fs, createWriteStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const bdir = path.join(root, 'client');
const sharp = createRequire(path.join(root, 'tools', 'assets', 'package.json'))('sharp');
sharp.cache(false);
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d; };
const has = (n) => args.includes('--' + n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);
const T0 = Date.now();

const MAIN = JSON.parse(await fs.readFile(path.join(root, 'tools/ad/shots.json'), 'utf8'));
const META = MAIN._meta || {};
const POOL = { ...(MAIN.shots || {}), ...(MAIN.probes || {}) };
const names = (opt('shots', 't7ArchTrack,t7ArchCrane')).split(',').filter((n) => POOL[n] || (console.log('unknown shot', n), false));
const KEYF = (opt('frames', '0,54,107')).split(',').map(Number);
const FPS = Number(META.fps || 30);
const [W, H] = (opt('size', META.size || '2560x1440')).split('x').map(Number);
const BASE_FLAGS = opt('flags', META.flags || 'hud=0&lmwait=150&life=0&clean=1');
const [CLON, CLAT] = (opt('centre', '-73.96060,40.81780')).split(',').map(Number);
const REGION = Number(opt('region', '350'));
const FAR = Number(opt('far', String(REGION)));   // meshes (tiles, buildings, viaducts) out to here; pools and moving sets to --region
const MAXTEX = Number(opt('maxtex', '2048'));
const outDir = path.resolve(opt('out', '/data0/projectnyc_aux/tmp/export/h1'));
await fs.mkdir(path.join(outDir, 'geo'), { recursive: true });
await fs.mkdir(path.join(outDir, 'tex'), { recursive: true });
const bootMs = 200000;
// ---- BX-SEQ (docs/notes/ar34-bx-seq.md): the take's moving sets every frame, regions along the lens path, the far ring
//   --moving all|keys|none   the fleet's vehicles (from its storage: every slot near the lens, stable ids, paint, lamp mask),
//                            any other moving instanced set (trains ...), the signal lenses, the sim clock -> mov_<shot>.json
//   --centre lon,lat         the legacy square region round a point (static.json at the first key frame); without it each
//                            shot's region follows its lens path: --region m (pools, vehicles) and --far m (meshes) round
//                            every frame's lens position, captured after the take -> static_<shot>.json (+ static.json)
//   --ring m                 the far ring: the city's far level (macro buildings and crowns, far terrain) from --far to here
const MOVING = opt('moving', 'all');
const PATHREG = !args.includes('--centre');
const RING = Number(opt('ring', '4000'));
// ---- BX hooks (owned by BX-SEQ; one line per track): a module <name>.mjs next to this file default-exports any of
// { boot(ctx), shotReady(ctx, shot), frame(ctx, shot, i), shotDone(ctx, shot), end(ctx) }; docs/notes/ar34-bx-seq.md has
// the ctx and the in-page window.__EXP.lib. --hooks a,b replaces the list for a run, --nohooks runs none.
const HOOKS = [
  // 'harvest_x',   // BX-<TRACK>
  'harvest_facades',   // BX-WIN: the tile facades baked per building in the page, the kit glass tagged (--nobxwin skips)
  'harvest_lights',    // BX-LIGHT: street lamps, sky domes, post, exposure and headlamps per frame (--nolights skips)
  'harvest_peds',      // BX-PEDS: the crowd's walkers every frame (pose rows, instances) and the drawn bodies (--nopeds skips)
];
const hookMods = [];
for (const n of has('nohooks') ? [] : (opt('hooks') ? opt('hooks').split(',').filter(Boolean) : HOOKS)) {
  try { hookMods.push({ name: n, m: (await import(pathToFileURL(path.join(here, n.replace(/\.mjs$/, '') + '.mjs')).href)).default }); }
  catch (e) { console.log(`[harvest] hook ${n} not loaded: ${e?.message || e}`); }
}
const hookCtx = { outDir, opt, has, names: null, POOL: null, FPS: null, W: null, H: null, project: null, page: null, manifest: null, region: null,
  writeJSON: (rel, obj) => fs.writeFile(path.join(outDir, rel), JSON.stringify(obj)), writeFile: (rel, buf) => fs.writeFile(path.join(outDir, rel), buf),
  log: (...a) => console.log('    [hook]', ...a) };
const runHooks = async (fn, ...a) => {
  const out = {};
  for (const { name, m } of hookMods) {
    if (typeof m?.[fn] !== 'function') continue;
    try { out[name] = await m[fn](hookCtx, ...a); } catch (e) { console.log(`[harvest] hook ${name}.${fn} failed: ${e?.stack || e}`); }
  }
  return out;
};

const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const [CX, CZ] = project(CLON, CLAT);

// ---- the sink: the page POSTs geometry and texture blobs here ---------------------------------------------------------
let sinkBytes = 0, sinkFiles = 0;
const sink = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const m = /^\/put\/([A-Za-z0-9_.\-/]+)$/.exec(decodeURIComponent(req.url || ''));
  if (req.method !== 'POST' || !m || m[1].includes('..')) { res.writeHead(400, cors); res.end('bad'); return; }
  const file = path.join(outDir, m[1]);
  const raw = /^(.*)__(\d+)x(\d+)\.rgba$/.exec(m[1]);
  if (raw) {   // a texture read back as raw RGBA rows, bottom-up: PNG (alpha dropped when opaque), top-down
    const chunks = [];
    req.on('data', (c) => { sinkBytes += c.length; chunks.push(c); });
    req.on('end', () => {
      sinkFiles++; res.writeHead(200, cors); res.end('ok');
      const buf = Buffer.concat(chunks), w = +raw[2], h = +raw[3];
      let opaque = true;
      for (let i = 3; i < buf.length; i += 4) if (buf[i] < 255) { opaque = false; break; }
      let img = sharp(buf, { raw: { width: w, height: h, channels: 4 } }).flip();
      if (opaque) img = img.removeAlpha();
      encodes.push(img.png({ compressionLevel: 4 }).toFile(path.join(outDir, raw[1] + '.png')).then(() => { texAlpha[raw[1]] = !opaque; }).catch((e) => console.log('    encode failed', raw[1], e.message)));
    });
    return;
  }
  const ws = createWriteStream(file);
  req.on('data', (c) => { sinkBytes += c.length; });
  req.pipe(ws);
  ws.on('finish', () => { sinkFiles++; res.writeHead(200, cors); res.end('ok'); });
  ws.on('error', (e) => { res.writeHead(500, cors); res.end(String(e)); });
});
const encodes = [], texAlpha = {};
const sinkPort = await new Promise((r) => sink.listen(0, '127.0.0.1', () => r(sink.address().port)));

console.log(`[harvest ${stamp()}] shots ${names.join(',')} frames ${KEYF.join(',')}; region ${REGION} m round (${CX.toFixed(1)}, ${CZ.toFixed(1)}); out ${outDir}; sink :${sinkPort}`);
try { installGuard({ name: 'harvest', maxMin: 45 }); } catch (e) { console.log('[harvest] guard not installed:', e?.message || e); }
const releaseGpu = has('nolock') ? (() => {}) : await acquireGpu('export harvest');

let server = null, port = opt('port');
if (!port) {
  // (BX-SEQ: never one of Chromium's restricted ports: 6665 failed a harvest's boot with net::ERR_UNSAFE_PORT)
  const UNSAFE = new Set([6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697]);
  do { port = String(5400 + Math.floor(Math.random() * 3000)); } while (UNSAFE.has(+port));
  server = spawn(process.execPath, [path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });
  await sleep(3500);
}
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`],
});

const settleWorld = async (page, budget, minDwellMs = 9000, needQuiet = 8) => {
  const t0 = Date.now();
  let quiet = 0, last = '';
  for (;;) {
    await page.evaluate(() => window.__advance(0));
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
const holdOf = (P) => ({ duration: 1e6, ease: 0, abs: P.abs, tension: P.tension, fov: P.fov, keys: [P.keys[0], { p: [P.keys[0].p[0] + 1e-6, P.keys[0].p[1] + 1e-6, P.keys[0].p[2]], look: P.keys[0].look }] });
const holdAt = (P, K) => ({ duration: 1e6, ease: 0, abs: P.abs, tension: P.tension, fov: P.fov, keys: [K, { p: [K.p[0] + 1e-6, K.p[1] + 1e-6, K.p[2]], look: K.look }] });
const midKey = (a, b) => ({ p: a.p.map((v, i) => (v + b.p[i]) / 2), look: a.look.map((v, i) => (v + b.look[i]) / 2) });

// ---- BX-SEQ: a take's per-frame moving records -> tracks with stable ids (mov_<shot>.json, docs/notes/ar34-bx-seq.md) -----
// cars: one per (group tag, storage slot, generation), kept when it comes within --region + 30 m of the lens path; its
// frames f0..f1 (a frame it missed in between holds its last pose). Matrices are 12 numbers: three's column-major 4x4
// without the last row ([0..2] x axis, [3..5] y, [6..8] z, [9..11] translation). movers: every other instanced set that
// moved; a train part's id is its car (sv:run:car from __TRAINS_AT) and its rank in the car's frame, any other set's from
// a nearest-neighbour tracker on the predicted position.
function assembleMoving(MOVF, nF, lens) {
  const groups = MOVF.find((f) => f.groups)?.groups || [];
  const fleetErr = MOVF.find((f) => f.fleetErr)?.fleetErr || null;
  const nearPath = (x, z, R) => lens.some(([a, b]) => (a - x) ** 2 + (b - z) ** 2 <= R * R);
  const cars = new Map();
  for (const F of MOVF) {
    const f = F.i;
    for (const r of F.veh || []) {
      const [g, slot, gen] = r, m = r.slice(3, 15), q = r.slice(15);
      const id = `${groups[g]?.tag ?? g}:${slot}:${gen}`;
      let c = cars.get(id);
      if (!c) { c = { id, g, slot, kind: groups[g]?.kind, moving: groups[g]?.moving, f0: f, f1: f, seed: q[3], col: q.slice(5, 8), paint: q.slice(8, 11), drawn: 0, near: false, m: [], spin: [], steer: [], mask: [], bend: [] }; cars.set(id, c); }
      while (c.f0 + c.m.length < f) { const k = c.m.length - 1; c.m.push(c.m[k]); c.spin.push(c.spin[k]); c.steer.push(c.steer[k]); c.mask.push(c.mask[k]); c.bend.push(c.bend[k]); }
      c.m.push(m); c.spin.push(q[0]); c.steer.push(q[1]); c.mask.push(q[2]); c.bend.push(q[4]); c.f1 = f;
      if (q[11]) { c.drawn++; c.col = q.slice(5, 8); c.paint = q.slice(8, 11); }   // the fleet's own values from a drawn frame
      if (!c.near && nearPath(m[9], m[11], REGION + 30)) c.near = true;
    }
  }
  // movers (trains ...): the frames of each set, the snapshot before its first move
  const sets = new Map();
  for (const F of MOVF) for (const r of F.movers || []) {
    let e = sets.get(r.key);
    if (!e) {
      e = { name: r.name, geo: r.geo, mats: r.mats, castShadow: r.castShadow, fr: new Map() };
      sets.set(r.key, e);
      if (r.back && r.back.n) for (let f = r.back.f0; f < F.i; f++) e.fr.set(f, r.back.m);
    }
    e.fr.set(F.i, r.m);
  }
  const trainAt = new Map(MOVF.map((F) => [F.i, F.trains || []]));
  const movers = [];
  for (const [key, e] of sets) {
    const tracks = new Map();
    const isTrain = /^trains:/.test(e.name);
    let live = [], nid = 0;
    for (let f = 0; f < nF; f++) {
      const arr = e.fr.get(f) || [], n = arr.length / 12;
      const inst = [];
      for (let k = 0; k < n; k++) inst.push(arr.slice(k * 12, k * 12 + 12));
      if (isTrain && (trainAt.get(f) || []).length) {
        // a train part: its car is the nearest car centre; its rank in that car's frame (along, then across) names it
        const cs = trainAt.get(f), byCar = new Map();
        for (const m of inst) {
          let best = null, bd = Infinity;
          for (const c of cs) { const d = (c.x - m[9]) ** 2 + (c.y - m[10]) ** 2 + (c.z - m[11]) ** 2; if (d < bd) { bd = d; best = c; } }
          if (!best || bd > 40 * 40) { (byCar.get('?') || byCar.set('?', []).get('?')).push([m, 0, 0]); continue; }
          const dx = m[9] - best.x, dz = m[11] - best.z, cy = Math.cos(best.yaw), sy = Math.sin(best.yaw);
          (byCar.get(best.id) || byCar.set(best.id, []).get(best.id)).push([m, Math.round((cy * dx - sy * dz) * 4), Math.round((sy * dx + cy * dz) * 4)]);
        }
        for (const [cid, L] of byCar) {
          L.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
          L.forEach(([m], k) => { const id = `${cid}/${k}`; let T = tracks.get(id); if (!T) { T = { id, f0: f, m: [] }; tracks.set(id, T); } while (T.f0 + T.m.length < f) T.m.push(T.m[T.m.length - 1]); T.m.push(m); });
        }
        continue;
      }
      // any other mover: the nearest live track to its predicted position (constant velocity), within 1.5 m
      const used = new Uint8Array(live.length), next = [];
      for (const m of inst) {
        let best = -1, bd = 1.5 * 1.5;
        for (let j = 0; j < live.length; j++) {
          if (used[j]) continue;
          const L = live[j], p = L.m[L.m.length - 1], d = (p[9] + L.v[0] - m[9]) ** 2 + (p[10] + L.v[1] - m[10]) ** 2 + (p[11] + L.v[2] - m[11]) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
        let L;
        if (best >= 0) { used[best] = 1; L = live[best]; const p = L.m[L.m.length - 1]; L.v = [m[9] - p[9], m[10] - p[10], m[11] - p[11]]; while (L.f0 + L.m.length < f) L.m.push(p); L.m.push(m); }
        else { L = { id: String(nid++), f0: f, m: [m], v: [0, 0, 0] }; tracks.set(L.id, L); }
        next.push(L);
      }
      live = next;
    }
    movers.push({ key, name: e.name, geo: e.geo, mats: e.mats, castShadow: e.castShadow, tracks: [...tracks.values()].map((T) => ({ id: T.id, f0: T.f0, m: T.m })) });
  }
  const sigOn = {};
  for (const F of MOVF) for (const [nm, on] of Object.entries(F.sig?.on || {})) (sigOn[nm] ||= Array(nF).fill(null))[F.i] = on;
  return { fps: FPS, frames: nF, simTime: MOVF.map((F) => F.sig?.t ?? null), night: MOVF.map((F) => F.night), sig: MOVF.map((F) => ({ ew: F.sig?.ew ?? null, ns: F.sig?.ns ?? null })), sigOn,
    groups, cars: [...cars.values()].filter((c) => c.near).map(({ near, ...c }) => c), movers, trains: MOVF.map((F) => F.trains || null), fleetErr };
}

// ---- the in-page exporter ----------------------------------------------------------------------------------------------
function exportLib(cfg) {
  if (window.__EXP) return 'present';
  const E = window.__ENGINE, INST = window.__INST || window.__INSTANCER;
  let T = null;
  const getThree = async () => {
    if (T) return T;
    const names = performance.getEntriesByType('resource').map((e) => e.name);
    const u = names.find((n) => /\/\.vite\/deps\/three\.js(\?|$)/.test(n)) || names.find((n) => /three\.module\.js/.test(n)) || '/node_modules/three/build/three.module.js';
    T = await import(u);
    return T;
  };
  const X = { geos: new Map(), mats: new Map(), texs: new Map(), done: new Set(), log: [], skipped: {}, nGeoBytes: 0 };
  const skip = (why) => { X.skipped[why] = (X.skipped[why] || 0) + 1; };
  const post = async (name, body) => {
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(cfg.sink + '/put/' + name, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });
        if (r.ok) return true;
      } catch (e) { if (a === 2) throw e; }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('sink failed ' + name);
  };
  // BX-SEQ: the region is the legacy square round (cx, cz), or after setPath the lens path's neighbourhood: grid masks of
  // the 4 m cells within R, R + 30 and F of any lens position of the shot (mR, mP, mF), and the far ring out to `ring`
  const RG = { on: false };
  const inRegion = (x, z, pad = 0, R = cfg.R) => {
    if (!RG.on) return Math.abs(x - cfg.cx) <= R + pad && Math.abs(z - cfg.cz) <= R + pad;
    const i = Math.floor((x - RG.ox) / RG.cell), j = Math.floor((z - RG.oz) / RG.cell);
    if (i < 0 || j < 0 || i >= RG.nx || j >= RG.nz) return false;
    return (R >= cfg.F ? RG.mF : pad > 0 ? RG.mP : RG.mR)[j * RG.nx + i] === 1;
  };
  const pathDist = (x, z) => { let b = Infinity; for (const p of RG.pts) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
  const inRing = (x, z) => x >= RG.bx0 - RG.ring && x <= RG.bx1 + RG.ring && z >= RG.bz0 - RG.ring && z <= RG.bz1 + RG.ring;
  const setPath = ({ pts, R, F, ring }) => {
    const cell = 4;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // BX-SEQ (the lead, 21:05: the far ring with the web's near mask): the near tiles that are READY are the near level (the
    // web drops its far level over exactly those, NM24 world/streamer.js _updateNearMask), so the meshes are taken over
    // them too, whole, beside F round the path; the far level is masked by the same tiles in usd_write.py
    const TL = nearTilesNow();
    let tx0 = x0, tx1 = x1, tz0 = z0, tz1 = z1;
    for (const [tx, tz] of TL.tiles) { tx0 = Math.min(tx0, tx * TL.tile); tx1 = Math.max(tx1, (tx + 1) * TL.tile); tz0 = Math.min(tz0, tz * TL.tile); tz1 = Math.max(tz1, (tz + 1) * TL.tile); }
    const pad = Math.max(R + 30, F) + 2 * cell;
    const gx0 = Math.min(x0 - pad, tx0 - 2 * cell), gz0 = Math.min(z0 - pad, tz0 - 2 * cell), gx1 = Math.max(x1 + pad, tx1 + 2 * cell), gz1 = Math.max(z1 + pad, tz1 + 2 * cell);
    Object.assign(RG, { cell, ox: gx0, oz: gz0, nx: Math.ceil((gx1 - gx0) / cell), nz: Math.ceil((gz1 - gz0) / cell), bx0: x0, bx1: x1, bz0: z0, bz1: z1, ring: Math.max(ring || 0, F), R, F, tiles: TL });
    const P = [];   // the lens path densified to half a cell
    for (let i = 0; i < pts.length; i++) {
      P.push(pts[i]);
      if (i + 1 < pts.length) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / (cell / 2)); for (let k = 1; k < n; k++) P.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
    }
    RG.pts = P;
    const N = RG.nx * RG.nz;
    for (const [key, rad] of [['mR', R], ['mP', R + 30], ['mF', F]]) {
      const m = new Uint8Array(N), rc = Math.ceil(rad / cell) + 1, r2 = rad * rad;
      for (const [px, pz] of P) {
        const ci = Math.floor((px - RG.ox) / cell), cj = Math.floor((pz - RG.oz) / cell);
        for (let j = Math.max(0, cj - rc); j <= Math.min(RG.nz - 1, cj + rc); j++) {
          const dz2 = (RG.oz + (j + 0.5) * cell - pz) ** 2;
          if (dz2 > r2) continue;
          for (let i = Math.max(0, ci - rc); i <= Math.min(RG.nx - 1, ci + rc); i++) if ((RG.ox + (i + 0.5) * cell - px) ** 2 + dz2 <= r2) m[j * RG.nx + i] = 1;
        }
      }
      RG[key] = m;
    }
    // the ready near tiles join F; Feff: the farthest a near-level mesh can reach from the path
    let Feff = F;
    for (const [tx, tz] of TL.tiles) {
      const i0 = Math.max(0, Math.floor((tx * TL.tile - RG.ox) / cell)), i1 = Math.min(RG.nx - 1, Math.floor(((tx + 1) * TL.tile - RG.ox) / cell) - 1);
      const j0 = Math.max(0, Math.floor((tz * TL.tile - RG.oz) / cell)), j1 = Math.min(RG.nz - 1, Math.floor(((tz + 1) * TL.tile - RG.oz) / cell) - 1);
      for (let j = j0; j <= j1; j++) RG.mF.fill(1, j * RG.nx + i0, j * RG.nx + i1 + 1);
      for (const [cx, cz] of [[tx, tz], [tx + 1, tz], [tx, tz + 1], [tx + 1, tz + 1]]) Feff = Math.max(Feff, pathDist(cx * TL.tile, cz * TL.tile));
    }
    RG.Feff = Feff;
    RG.on = true;
    return { cells: N, pts: P.length, bbox: [x0, z0, x1, z1], nearTiles: TL.tiles.length, Feff: Math.round(Feff) };
  };
  // the streamer's near tiles that are drawn now (state 'ready'), as [tx, tz] with the tile size
  const nearTilesNow = () => {
    const S = window.__STREAMER, out = [];
    if (S && S.tiles) for (const [k, t] of S.tiles) if (t && t.state === 'ready') { const [a, b] = String(k).split('_').map(Number); if (isFinite(a) && isFinite(b)) out.push([a, b]); }
    return { tile: 512, tiles: out };
  };
  // the far level (the streamer's macro group: macro buildings, their crowns, the far terrain), drawn by the web only past
  // ~820 m from the lens; taken here only outside F, out to the ring
  const farGroup = () => window.__STREAMER?.macroGroup || null;
  const isFar = (o) => { const fg = farGroup(); for (let p = o.parent; p; p = p.parent) if (p === fg) return true; return /^(macroCrowns_|farTerrain)/.test(o.name || ''); };
  const arr = (v) => (v && v.toArray ? v.toArray() : v);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(6) : v);
  // ---------------- textures ----------------
  const texId = (t) => {
    if (!t || !t.isTexture) return null;
    if (t.isRenderTargetTexture || t.isDepthTexture || t.isVideoTexture || t.isCubeTexture) { skip('tex:' + (t.isCubeTexture ? 'cube' : t.isDepthTexture ? 'depth' : 'rt/video')); return null; }
    let e = X.texs.get(t.uuid);
    if (!e) { e = { id: X.texs.size, t }; X.texs.set(t.uuid, e); }
    return e.id;
  };
  const texInfo = (t) => {
    t.updateMatrix?.();
    return { name: t.name || '', colorSpace: t.colorSpace, flipY: t.flipY, wrapS: t.wrapS, wrapT: t.wrapT, repeat: arr(t.repeat), offset: arr(t.offset), rotation: t.rotation, matrix: Array.from(t.matrix.elements), channel: t.channel ?? 0, format: t.format, type: t.type, compressed: !!t.isCompressedTexture, array: !!(t.isDataArrayTexture || t.isCompressedArrayTexture) };
  };
  // ---------------- materials ----------------
  const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'specularMap', 'displacementMap', 'transmissionMap', 'clearcoatNormalMap'];
  const SCAL = ['roughness', 'metalness', 'opacity', 'alphaTest', 'emissiveIntensity', 'envMapIntensity', 'ior', 'transmission', 'thickness', 'clearcoat', 'clearcoatRoughness', 'sheen', 'specularIntensity', 'aoMapIntensity', 'bumpScale', 'lightMapIntensity', 'reflectivity', 'shininess'];
  const STUB = { v: '#include <common>\n#include <uv_pars_vertex>\n#include <begin_vertex>\n#include <beginnormal_vertex>\n#include <worldpos_vertex>\n#include <project_vertex>\n', f: '#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <alphamap_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n#include <lights_fragment_begin>\n#include <opaque_fragment>\n' };
  const uniVal = (v, out, k) => {
    if (v === null || v === undefined) return;
    if (v.isTexture) { const id = texId(v); if (id !== null) out[k] = { tex: id }; return; }
    if (typeof v === 'number' || typeof v === 'boolean') { out[k] = num(+v); return; }
    if (v.isColor) { out[k] = { color: [v.r, v.g, v.b] }; return; }
    if (v.isVector2 || v.isVector3 || v.isVector4) { out[k] = { vec: v.toArray() }; return; }
    if (v.isMatrix3 || v.isMatrix4) { out[k] = { mat: Array.from(v.elements) }; return; }
    if (Array.isArray(v) && v.length <= 16 && v.every((x) => typeof x === 'number')) { out[k] = { arr: v }; return; }
  };
  const matId = (m) => {
    if (!m) return -1;
    let e = X.mats.get(m.uuid);
    if (e) return e.id;
    const d = { id: X.mats.size, name: m.name || '', type: m.type, side: m.side, transparent: !!m.transparent, vertexColors: !!m.vertexColors, colorWrite: m.colorWrite !== false, blending: m.blending, depthWrite: m.depthWrite, flatShading: !!m.flatShading, visible: m.visible !== false,
      polygonOffset: !!m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor || 0, polygonOffsetUnits: m.polygonOffsetUnits || 0 };   // BX-FIX: the web's depth pulls (usd_coplanar.py lifts the overlays by them)
    if (m.color) d.color = [m.color.r, m.color.g, m.color.b];
    if (m.emissive) d.emissive = [m.emissive.r, m.emissive.g, m.emissive.b];
    if (m.sheenColor) d.sheenColor = [m.sheenColor.r, m.sheenColor.g, m.sheenColor.b];
    if (m.attenuationColor) d.attenuationColor = [m.attenuationColor.r, m.attenuationColor.g, m.attenuationColor.b];
    for (const k of SCAL) if (typeof m[k] === 'number') d[k] = num(m[k]);
    if (m.normalScale) d.normalScale = m.normalScale.toArray();
    d.maps = {};
    for (const k of MAPS) { const id = texId(m[k]); if (id !== null) d.maps[k] = id; }
    // the uniforms the material's onBeforeCompile adds (pbrLib's texture sets, the kit's tints ...), read on a stand-in
    d.uni = {};
    const obc = m.onBeforeCompile;
    if (obc && obc !== T.Material.prototype.onBeforeCompile) {
      d.obc = true;
      const sh = { uniforms: {}, vertexShader: STUB.v, fragmentShader: STUB.f, defines: {} };
      try { obc.call(m, sh, undefined); } catch (e) { d.obcErr = String(e).slice(0, 120); }
      for (const [k, u] of Object.entries(sh.uniforms || {})) uniVal(u && typeof u === 'object' && 'value' in u ? u.value : u, d.uni, k);
      d.obcAttrs = [...new Set([...(sh.vertexShader || '').matchAll(/attribute\s+\w+\s+(\w+)\s*;/g)].map((x) => x[1]))];
    }
    if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) uniVal(u?.value, d.uni, k);
    try {
      const ud = m.userData || {};
      d.ud = {};
      for (const k of Object.keys(ud)) { const v = ud[k]; if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') d.ud[k] = v; else if (k === 'pbr') d.ud.pbr = JSON.parse(JSON.stringify(v)); }
    } catch {}
    if (m.defines) d.defines = Object.keys(m.defines).slice(0, 20);
    X.mats.set(m.uuid, { id: d.id, d });
    return d.id;
  };
  // ---------------- geometry ----------------
  // matId: the ground's surface kind per vertex (asphalt, sidewalk, curb, paint ...); aBid: a tile facade's building index
  // (its hide mask drops the buildings the dresser rebuilt as real geometry)
  const WANT = ['position', 'normal', 'uv', 'uv1', 'color', 'aFkTr', 'aGrime', 'aWeather', 'matId', 'aBid'];
  // BX-MAT: the viaducts' rivet rows (vk/vkKit.js aRv, aJ) and the ground's kerb frame (gpKerbWorker gpK, raw Uint16) for
  // the Blender node groups (blender_nodes.py)
  WANT.push('aRv', 'aJ', 'gpK');
  WANT.push('sgRect', 'sgBg', 'sgFg', 'sgLamp', 'sgP', 'sgF');   // BX-MAT: the sign faces' per-vertex terms (fk/signKit.js faceAttrs)
  WANT.push('_lamp', 'aux');   // BX-LIGHT: lamp roles per vertex for blender_light.py (fleet24's _lamp; the trains' aux: city/trains/kit.js)
  WANT.push('_wheel');   // BX-FIN: fleet24's wheel index per vertex (1..4 FL FR RL RR, 5..8 more axles), for a wheel rig (spin / steer are in mov_<shot>.json)
  const attrF32 = (a) => {
    const n = a.count, s = a.itemSize, out = new Float32Array(n * s);
    if (!a.isInterleavedBufferAttribute && !a.normalized && a.array instanceof Float32Array && a.array.length >= n * s) { out.set(a.array.subarray(0, n * s)); return out; }
    for (let i = 0; i < n; i++) { out[i * s] = a.getX(i); if (s > 1) out[i * s + 1] = a.getY(i); if (s > 2) out[i * s + 2] = a.getZ(i); if (s > 3) out[i * s + 3] = a.getW(i); }
    return out;
  };
  // pack attribute arrays + an index into one buffer; returns { buf, layout }
  const pack = (attrs, index) => {
    let bytes = 0;
    const layout = [];
    for (const [k, A] of Object.entries(attrs)) { layout.push({ name: k, itemSize: A.s, count: A.a.length / A.s, offset: bytes, type: 'f32' }); bytes += A.a.byteLength; }
    if (index) { layout.push({ name: 'index', itemSize: 1, count: index.length, offset: bytes, type: 'u32' }); bytes += index.byteLength; }
    const buf = new Uint8Array(bytes);
    let o = 0;
    for (const A of Object.values(attrs)) { buf.set(new Uint8Array(A.a.buffer, A.a.byteOffset, A.a.byteLength), o); o += A.a.byteLength; }
    if (index) buf.set(new Uint8Array(index.buffer, index.byteOffset, index.byteLength), o);
    return { buf, layout };
  };
  const pending = [];
  const flushGeo = async () => { while (pending.length) { const p = pending.splice(0, 8); await Promise.all(p.map((q) => post(q.name, q.buf))); } };
  // a whole geometry (local space), deduplicated by uuid + draw range
  const geoWhole = (g) => {
    const key = g.uuid + ':' + g.drawRange.start + ':' + g.drawRange.count;
    let e = X.geos.get(key);
    if (e) return e.id;
    const attrs = {}, other = [];
    for (const k of Object.keys(g.attributes)) { if (WANT.includes(k)) { const a = g.attributes[k]; attrs[k] = { a: attrF32(a), s: a.itemSize }; } else other.push(k); }
    let index = null;
    const nIdx = g.index ? g.index.count : g.attributes.position.count;
    const start = Math.max(0, g.drawRange.start), count = Math.min(nIdx - start, g.drawRange.count);
    if (g.index) index = Uint32Array.from(g.index.array.subarray(start, start + count));
    else if (start !== 0 || count !== nIdx) { index = new Uint32Array(count); for (let i = 0; i < count; i++) index[i] = start + i; }
    const groups = (g.groups || []).map((q) => ({ start: q.start - start, count: q.count, mi: q.materialIndex ?? 0 })).filter((q) => q.start + q.count > 0 && q.start < count);
    const id = X.geos.size;
    const { buf, layout } = pack(attrs, index);
    const name = `geo/g${id}.bin`;
    pending.push({ name, buf });
    X.nGeoBytes += buf.byteLength;
    e = { id, d: { id, file: name, layout, groups, other, tris: Math.floor((index ? index.length : g.attributes.position.count) / 3), name: g.name || '' } };
    X.geos.set(key, e);
    return id;
  };
  // the triangles of a mesh whose centroid is in the region, baked to world space (a tile's ground, a merged layer)
  const geoClip = (g, M, tag, ring = false) => {   // BX-SEQ: ring = the far level's triangles outside F, inside the ring
    const pa = g.attributes.position, idx = g.index ? g.index.array : null;
    const nIdx = idx ? g.index.count : pa.count;
    const start = Math.max(0, g.drawRange.start), end = Math.min(nIdx, start + g.drawRange.count);
    const e = M.elements;
    const keep = [];
    const grp = (g.groups && g.groups.length) ? g.groups : null;
    const miOf = (t) => { if (!grp) return 0; for (const q of grp) if (t >= q.start && t < q.start + q.count) return q.materialIndex ?? 0; return -1; };
    for (let t = start; t + 2 < end; t += 3) {
      let sx = 0, sz = 0, anyOut = false;
      for (let c = 0; c < 3; c++) {
        const vi = idx ? idx[t + c] : t + c; const x = pa.getX(vi), y = pa.getY(vi), z = pa.getZ(vi);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        sx += wx; sz += wz;
        if (ring && !anyOut && !inRegion(wx, wz, 0, cfg.F)) anyOut = true;
      }
      // (BX-SEQ: a far-level triangle with any corner outside F is taken; usd_write.py keeps those with every corner past
      // F - 100 m and sinks the far level 1 m under the near ground: the far terrain's big cells reach far inside F, at the
      // lens's height in hilly ground)
      if (ring ? anyOut && inRing(sx / 3, sz / 3) : inRegion(sx / 3, sz / 3, 0, cfg.F)) { const mi = miOf(t); if (mi >= 0) keep.push(t, mi); }
    }
    if (!keep.length) return -1;
    // sort by material index so groups are contiguous
    const tris = [];
    for (let i = 0; i < keep.length; i += 2) tris.push([keep[i], keep[i + 1]]);
    tris.sort((a, b) => a[1] - b[1]);
    const remap = new Map(), src = [];
    const index = new Uint32Array(tris.length * 3);
    tris.forEach(([t], k) => { for (let c = 0; c < 3; c++) { const vi = idx ? idx[t + c] : t + c; let r = remap.get(vi); if (r === undefined) { r = src.length; remap.set(vi, r); src.push(vi); } index[k * 3 + c] = r; } });
    const groups = [];
    tris.forEach(([, mi], k) => { const L = groups[groups.length - 1]; if (L && L.mi === mi) L.count += 3; else groups.push({ start: k * 3, count: 3, mi }); });
    const nm = new T.Matrix3().getNormalMatrix(M).elements;
    const attrs = {}, other = [];
    for (const k of Object.keys(g.attributes)) {
      if (!WANT.includes(k)) { other.push(k); continue; }
      const a = g.attributes[k], s = a.itemSize, out = new Float32Array(src.length * s);
      for (let i = 0; i < src.length; i++) {
        const vi = src[i];
        const v = [a.getX(vi), s > 1 ? a.getY(vi) : 0, s > 2 ? a.getZ(vi) : 0, s > 3 ? a.getW(vi) : 0];
        if (k === 'position') { out[i * 3] = e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12]; out[i * 3 + 1] = e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13]; out[i * 3 + 2] = e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14]; }
        else if (k === 'normal') { const x = nm[0] * v[0] + nm[3] * v[1] + nm[6] * v[2], y = nm[1] * v[0] + nm[4] * v[1] + nm[7] * v[2], z = nm[2] * v[0] + nm[5] * v[1] + nm[8] * v[2]; const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l; }
        else for (let c = 0; c < s; c++) out[i * s + c] = v[c];
      }
      attrs[k] = { a: out, s };
    }
    const id = X.geos.size;
    const { buf, layout } = pack(attrs, index);
    const name = `geo/g${id}.bin`;
    pending.push({ name, buf });
    X.nGeoBytes += buf.byteLength;
    X.geos.set('clip:' + tag + ':' + id, { id, d: { id, file: name, layout, groups, other, tris: tris.length, name: (g.name || '') + ' (clipped)', world: true } });
    return id;
  };
  const chain = (o) => { const c = []; for (let p = o, d = 0; p && d < 5; p = p.parent, d++) if (p.name) c.push(p.name); return c.join(' < ') || o.type; };
  const matsOf = (o) => (Array.isArray(o.material) ? o.material.map(matId) : [matId(o.material)]);
  const solidMat = (m) => m && m.visible !== false && m.colorWrite !== false;
  const isPoolMesh = (o) => /^poolS?:/.test(o.name || '');
  // ---------------- the static world ----------------
  const staticWorld = async () => {
    await getThree();
    if (RG.on) X.done.clear();   // BX-SEQ: one capture per shot, each of the shot's own region
    const out = [];
    const tmp = new T.Matrix4(), sph = new T.Sphere();
    const cam = E.camera;
    const visit = (o, forced) => {
      if (!o.visible && !forced) return;
      if (o.isLOD && o.levels && o.levels.length) { visit(o.levels[0].object, true); return; }
      if (o.isMesh || o.isBatchedMesh) take(o);
      else if (o.isPoints || o.isLine || o.isSprite) skip('type:' + o.type);
      for (const c of o.children) visit(c, false);
    };
    const take = (o) => {
      if (!o.layers.test(cam.layers)) { skip('layer'); return; }
      const g = o.geometry;
      if (!g || !g.attributes || !g.attributes.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(solidMat)) { skip('nocolor'); return; }
      if (isPoolMesh(o)) return;   // the pools come from their stores
      if (o.isBatchedMesh) { skip('batched'); return; }
      if (g.isInstancedBufferGeometry && !o.isInstancedMesh) { skip('custom-instanced:' + (o.name || o.parent?.name || '?')); return; }
      if (o.isInstancedMesh) return;   // dynamic: per frame
      if (o.isSkinnedMesh) { skip('skinned'); return; }
      if (X.done.has(o.uuid)) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      const r = sph.radius;
      if (!isFinite(r)) { skip('nan-bounds'); return; }
      // a sky dome or fog shell (a BackSide shell kilometres across) is the renderer's sky, not geometry
      if (r > 3000 && mats.every((m) => m.side === T.BackSide || m.type === 'ShaderMaterial' && !m.lights)) { skip('sky:' + (o.name || o.type)); return; }
      // BX-SEQ: along the lens path, a mesh is whole within F of the path, clipped where it crosses F; the far level only
      // outside F (clipped), out to the ring
      // (the far level is flagged in both modes: usd_write.py masks it by the ready near tiles, as the web does)
      const far = isFar(o);
      let inside;
      if (RG.on) {
        const d = pathDist(sph.center.x, sph.center.z);
        if (far) {
          const ox = Math.max(0, RG.bx0 - RG.ring - sph.center.x, sph.center.x - RG.bx1 - RG.ring), oz = Math.max(0, RG.bz0 - RG.ring - sph.center.z, sph.center.z - RG.bz1 - RG.ring);
          if (d + r <= cfg.F || Math.hypot(ox, oz) > r) return;
        } else if (d - r > (RG.Feff || cfg.F)) return;
        inside = !far && d + r <= cfg.F;
      } else {
        const dx = Math.max(0, Math.abs(sph.center.x - cfg.cx) - cfg.F), dz = Math.max(0, Math.abs(sph.center.z - cfg.cz) - cfg.F);
        if (Math.hypot(dx, dz) > r) return;   // wholly outside
        inside = !far && Math.abs(sph.center.x - cfg.cx) + r <= cfg.F && Math.abs(sph.center.z - cfg.cz) + r <= cfg.F;
      }
      X.done.add(o.uuid);
      const rec = { name: chain(o), type: o.type, mats: matsOf(o), castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder };
      if (far) rec.far = true;
      if (inside) { rec.geo = geoWhole(g); rec.matrix = Array.from(o.matrixWorld.elements); }
      else { rec.geo = geoClip(g, o.matrixWorld, o.uuid, far && RG.on); rec.matrix = null; if (rec.geo < 0) return; }
      out.push(rec);
    };
    visit(E.scene, false);
    await flushGeo();
    // the instancer's pools: every live instance in the region (not the view-culled draw set), at the main (LOD 0) geometry
    const pools = [];
    if (INST && INST.pools) for (const [name, p] of INST.pools) {
      if (!p.pos || !p.top || !p.mesh) continue;
      const mesh = p.mesh;
      if (!mesh.parent) { skip('pool-detached'); continue; }
      if (!mesh.visible && !mesh.userData.dcHid) { skip('pool-hidden:' + name); continue; }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.some(solidMat)) continue;
      const M = [], C = [], SL = [];   // BX-SEQ: SL the pool slots (stable ids; the signal lenses' state per frame names them)
      const mw = mesh.matrixWorld;
      const ident = mw.equals(new T.Matrix4());
      for (let s = 0; s < p.top; s++) {
        if (!p.alive[s]) continue;
        const x = p.pos[s * 3], z = p.pos[s * 3 + 2];
        if (!inRegion(x, z)) continue;
        if (ident) for (let q = 0; q < 16; q++) M.push(p.mats[s * 16 + q]);
        else { tmp.fromArray(p.mats, s * 16).premultiply(mw); M.push(...tmp.elements); }
        C.push(p.cols[s * 3], p.cols[s * 3 + 1], p.cols[s * 3 + 2]);
        SL.push(s);
      }
      if (!M.length) continue;
      pools.push({ name, geo: geoWhole(mesh.geometry), mats: matsOf(mesh), n: M.length / 16, matrices: M, colors: C, slots: SL, isTree: !!p.isTree, castShadow: mesh.castShadow });
    }
    await flushGeo();
    // BX-SEQ: along the lens path, the instanced sets that did not move during the take (the kit's instanced parts, the
    // viaducts' rivets, the tree pits ...), every instance within F of the path; the movers are in mov_<shot>.json
    const instanced = [];
    if (RG.on) {
      E.scene.traverseVisible((o) => {
        if (!o.isInstancedMesh || isPoolMesh(o) || !o.count || MV.movers.has(o.uuid) || MV.skipName(o.name)) return;
        if (!o.layers.test(cam.layers)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (!mats.some(solidMat)) return;
        const A = o.instanceMatrix.array, M = [], C = [], ic = o.instanceColor ? o.instanceColor.array : null;
        for (let k = 0; k < o.count; k++) {
          tmp.fromArray(A, k * 16).premultiply(o.matrixWorld);
          const e = tmp.elements;
          if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;
          if (!inRegion(e[12], e[14], 0, cfg.F)) continue;
          M.push(...e);
          if (ic) C.push(ic[k * 3], ic[k * 3 + 1], ic[k * 3 + 2]);
        }
        if (M.length) instanced.push({ name: chain(o), geo: geoWhole(o.geometry), mats: matsOf(o), n: M.length / 16, matrices: M, colors: ic ? C : null, castShadow: o.castShadow });
      });
      await flushGeo();
    }
    // BX-SEQ: the tile facades' hide masks as the dresser holds them NOW (the CPU side of each per-tile uHide texture: the
    // buildings it rebuilt as real geometry), by material id; the GPU readback at the end of the harvest found them empty
    const hide = {};
    E.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const d = m?.userData?.hideTex?.image?.data;
        if (!m?.userData?.isFacade || !d || !X.mats.has(m.uuid)) continue;
        const id = X.mats.get(m.uuid).id;
        if (hide[id]) continue;
        const b = [];
        for (let i = 0; i < d.length; i++) if (d[i] > 127) b.push(i);
        hide[id] = b;
      }
    });
    return { objects: out, pools, instanced, hide, nearTiles: (RG.on && RG.tiles ? RG.tiles : nearTilesNow()) };
  };
  // ---------------- one frame's moving things ----------------
  const dynamic = async () => {
    await getThree();
    const out = [];
    const tmp = new T.Matrix4();
    const cam = E.camera;
    const visit = (o) => {
      if (!o.visible) return;
      if (o.isInstancedMesh && !isPoolMesh(o)) takeI(o);
      for (const c of o.children) visit(c);
    };
    const takeI = (o) => {
      if (!o.layers.test(cam.layers) || !o.count) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(solidMat)) return;
      const nm = o.name || '';
      if (/^ped:/.test(nm)) { skip('crowd-walker-sets'); X.crowd = (X.crowd || 0) + o.count; return; }
      const A = o.instanceMatrix.array, M = [], C = [], ic = o.instanceColor ? o.instanceColor.array : null;
      // per-instance attributes the materials read (fleet24's aPaint / aCol / aVeh): their values for the kept instances
      const IA = Object.keys(o.geometry.attributes).filter((k) => o.geometry.attributes[k].isInstancedBufferAttribute && /^(aPaint|aCol|aVeh)$/.test(k));
      const IV = Object.fromEntries(IA.map((k) => [k, []]));
      for (let k = 0; k < o.count; k++) {
        tmp.fromArray(A, k * 16).premultiply(o.matrixWorld);
        const e = tmp.elements;
        if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;
        if (!inRegion(e[12], e[14], 30)) continue;
        M.push(...e);
        if (ic) C.push(ic[k * 3], ic[k * 3 + 1], ic[k * 3 + 2]);
        for (const a of IA) { const at = o.geometry.attributes[a]; IV[a].push(at.getX(k), at.itemSize > 1 ? at.getY(k) : 0, at.itemSize > 2 ? at.getZ(k) : 0, at.itemSize > 3 ? at.getW(k) : 0); }
      }
      if (!M.length) return;
      out.push({ name: chain(o), geo: geoWhole(o.geometry), mats: matsOf(o), n: M.length / 16, matrices: M, colors: ic ? C : null, inst: IV, castShadow: o.castShadow, attrs: Object.keys(o.geometry.attributes).filter((k) => o.geometry.attributes[k].isInstancedBufferAttribute) });
    };
    visit(E.scene);
    await flushGeo();
    return { instanced: out };
  };
  // ---------------- BX-SEQ: the take's moving sets, every frame ----------------
  // Vehicles come from the fleet's STORAGE (sim/fleet24.js: traffic.js writes every car's matrix into its pool meshes; the
  // drawn sets are view-culled and LOD-switched every frame): every slot within R of the lens, with the per-instance values
  // the fleet's own cull computed this frame where the car is drawn (paint, lamp mask, wheel spin and steer, the bus's
  // bend), else the same rules (paintFor read from the module's source, the lamp bits from the slot's motion state). A
  // record per car per frame: [group, slot, generation, 12 matrix numbers (three's column-major without the last row),
  // spin, steer, lamp mask, seed, bend, paint rgb (linear), metal, grime, rough, drawn]; a slot reused by a new car (a jump
  // over 6 m) starts a new generation. Any other instanced set that moves during the take (trains ...) is sent whole every
  // frame from its first move on (its frames before are its frame-0 snapshot, `back`).
  const MV = { snap: new Map(), movers: new Set(), vgen: new Map(), groups: null, paintFor: null, hash: null, env: null, sig: null,
    skipName: (n) => /^(veh|vehS|ped|pedS|crowd|crowdProp):/.test(n || '') };
  const r4 = (v) => Math.round(v * 1e4) / 1e4, r5 = (v) => Math.round(v * 1e5) / 1e5;
  const m12 = (e, o = 0) => [r5(e[o]), r5(e[o + 1]), r5(e[o + 2]), r5(e[o + 4]), r5(e[o + 5]), r5(e[o + 6]), r5(e[o + 8]), r5(e[o + 9]), r5(e[o + 10]), r4(e[o + 12]), r4(e[o + 13]), r4(e[o + 14])];
  const loadFleetFns = async () => {
    if (MV.paintFor !== null) return;
    MV.paintFor = false;
    try {
      const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/sim\/fleet24\.js(\?|$)/.test(n)) || '/src/sim/fleet24.js';
      const src = await (await fetch(u)).text();
      const grab = (re) => { const m = re.exec(src); if (!m) throw new Error('not in fleet24.js: ' + re); return m[0]; };
      const body = [grab(/const TAXI_YELLOW = [^;]+;/), grab(/const NYC_PAINTS = \[[\s\S]*?\n\];/), grab(/const PAINT_BAG = [^;]+;/), grab(/function paintFor\([\s\S]*?\n}\n/), grab(/function hash\([\s\S]*?\n}\n/)].join('\n');
      const fns = new Function('THREE', body + '\nreturn { paintFor, hash };')(T);
      MV.paintFor = fns.paintFor; MV.hash = fns.hash;
    } catch (e) { MV.fleetErr = String(e).slice(0, 200); }
    try { const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/world\/materials\.js(\?|$)/.test(n)) || '/src/world/materials.js'; MV.env = (await import(u)).ENV || null; } catch {}
    try { MV.sig = await import('/src/sim/signals.js'); } catch { MV.sig = {}; }
  };
  const lampAnchors = (set) => {   // model-space centroid per lamp role (fleet24 ROLE: 1 head ... 9 sirenB) and side (L: +x)
    const acc = {};
    for (const m of set?.meshes || []) {
      const la = m.geometry.getAttribute('_lamp'), pa = m.geometry.getAttribute('position');
      if (!la || !pa) continue;
      for (let v = 0; v < la.count; v++) {
        const r = Math.round(la.getX(v));
        if (!r) continue;
        const x = pa.getX(v), k = r + (x >= 0 ? 'L' : 'R'), a = acc[k] || (acc[k] = [0, 0, 0, 0]);
        a[0] += x; a[1] += pa.getY(v); a[2] += pa.getZ(v); a[3]++;
      }
    }
    return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, [r4(a[0] / a[3]), r4(a[1] / a[3]), r4(a[2] / a[3]), a[3]]]));
  };
  const vehGroups = () => {
    if (MV.groups) return MV.groups;
    const f = window.__gtRefs?.traffic?.fleet24;
    if (!f) return (MV.groups = []);
    const partsOf = (set) => (set?.meshes || []).map((m) => ({ geo: geoWhole(m.geometry), mats: matsOf(m), cls: m.userData.f24part?.cls || '', name: m.name }));
    MV.groups = f.groups.map((G, gi) => ({ gi, tag: G.tag, kind: G.kind, moving: !!G.moving, palette: G.palette, size: G.K.size, radius: G.K.radius,
      parts: partsOf(G.sets[0]), rear: G.rsets && G.rsets[0] ? partsOf(G.rsets[0]) : [], pivot: G.K.rear ? G.K.rear.pivot : null, tow: G.K.rear ? G.K.rear.tow : null,
      lamps: lampAnchors(G.sets[0]) }));
    return MV.groups;
  };
  const vehicles = (lx, lz, rad) => {
    const f = window.__gtRefs?.traffic?.fleet24;
    if (!f) return null;
    vehGroups();
    const drawn = new Map();
    f.groups.forEach((G, gi) => { for (const s of G.sets) { const a = s.im.array; for (let q = 0; q < s.k; q++) drawn.set(gi + '|' + a[q * 16 + 12].toFixed(3) + '|' + a[q * 16 + 14].toFixed(3), [s, q]); } });
    const night = MV.env?.night?.value ?? 0;
    const out = [], col = new Float32Array(3), paint = new Float32Array(4);
    f.groups.forEach((G, gi) => {
      const src = G.P.mb, A = src.instanceMatrix.array, n = src.count, C = src.instanceColor ? src.instanceColor.array : null, S = G.state, R = G.K.rear;
      for (let i = 0; i < n; i++) {
        const o = i * 16;
        if (A[o] === 0 && A[o + 5] === 0 && A[o + 10] === 0) continue;
        const x = A[o + 12], z = A[o + 14];
        if ((x - lx) ** 2 + (z - lz) ** 2 > rad * rad) continue;
        const key = gi * 1e6 + i;
        let gen = MV.vgen.get(key);
        if (gen && Math.hypot(x - gen.x, z - gen.z) > 6) gen.g++;
        if (!gen) { gen = { g: 0 }; MV.vgen.set(key, gen); }
        gen.x = x; gen.z = z;
        const d = drawn.get(gi + '|' + x.toFixed(3) + '|' + z.toFixed(3));
        let rec;
        if (d) {
          const [s, q] = d, v = s.aVeh.array, p = s.aPaint.array, c = s.aCol.array;
          const bend = R ? (p[q * 4 + 3] % 8) - 2 : 0;
          rec = [r4(v[q * 4]), r4(v[q * 4 + 1]), Math.round(v[q * 4 + 2]), r4(v[q * 4 + 3]), r4(bend), r5(c[q * 3]), r5(c[q * 3 + 1]), r5(c[q * 3 + 2]), r4(p[q * 4]), r4(p[q * 4 + 1]), r4(p[q * 4 + 2]), 1];
        } else {
          const hf = MV.hash || ((a) => ((a * 0.6180339887) % 1 + 1) % 1);
          const seed = G.moving ? hf(i, G.kind.length * 131 + 7) : hf(Math.round(x * 10), Math.round(z * 10));
          let lm = 0, spin = seed * 6.28, steer = 0, bend = 0;
          if (S && i < S.cap) {
            if (night > 0.35) lm |= 3;
            if (S.brake[i] > 0) lm |= 4;
            if (S.blinkL[i] > 0) lm |= 8;
            if (S.blinkR[i] > 0) lm |= 16;
            if (/^(police|nypd|ambulance|firetruck)$/.test(G.kind) && seed < 0.18) lm |= 32;
            spin = S.spin[i]; steer = S.steer[i];
            if (R && S.ok[i]) {
              const fl = Math.hypot(A[o + 8], A[o + 10]) || 1, fx = A[o + 8] / fl, fz = A[o + 10] / fl, yaw = Math.atan2(A[o + 8], A[o + 10]);
              let da = Math.atan2(x + fx * R.pivot[2] - S.rx[i], z + fz * R.pivot[2] - S.rz[i]) - yaw;
              da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
              bend = Math.max(-0.75, Math.min(0.75, da));
            }
          }
          const r = C ? C[i * 3] : 0.5, g = C ? C[i * 3 + 1] : 0.5, b = C ? C[i * 3 + 2] : 0.5;
          if (MV.paintFor) MV.paintFor(G.palette, r, g, b, seed, col, paint); else { col.fill(0.18); paint.set([0, 0.2, 0.35, 0]); }
          rec = [r4(spin), r4(steer), lm, r4(seed), r4(bend), r5(col[0]), r5(col[1]), r5(col[2]), r4(paint[0]), r4(paint[1]), r4(paint[2]), 0];
        }
        out.push([gi, i, gen.g, ...m12(A, o), ...rec]);
      }
    });
    return out;
  };
  const movers = (frame) => {
    const out = [], tmp = new T.Matrix4();
    const world = (o, A, n) => { const r = []; for (let k = 0; k < n; k++) { tmp.fromArray(A, k * 16).premultiply(o.matrixWorld); r.push(...m12(tmp.elements)); } return r; };
    E.scene.traverseVisible((o) => {
      if (!o.isInstancedMesh || isPoolMesh(o) || MV.skipName(o.name)) return;
      if (!o.layers.test(E.camera.layers)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(solidMat)) return;
      const n = o.count, A = o.instanceMatrix.array;
      let sn = MV.snap.get(o.uuid);
      if (!sn) { sn = { f0: frame, n, m: Float32Array.from(A.subarray(0, n * 16)) }; MV.snap.set(o.uuid, sn); if (frame > 0 && n > 0) MV.movers.add(o.uuid); }
      else if (!MV.movers.has(o.uuid)) {
        let same = sn.n === n;
        if (same) for (let q = 0; q < n * 16; q++) if (A[q] !== sn.m[q]) { same = false; break; }
        if (!same) MV.movers.add(o.uuid);
      }
      if (!MV.movers.has(o.uuid)) return;
      const rec = { key: o.uuid, name: chain(o), n, m: world(o, A, n) };
      if (!sn.sent) { sn.sent = true; Object.assign(rec, { geo: geoWhole(o.geometry), mats: matsOf(o), castShadow: o.castShadow, back: { f0: sn.f0, n: sn.f0 < frame ? sn.n : 0, m: sn.f0 < frame ? world(o, sn.m, sn.n) : [] } }); }
      out.push(rec);
    });
    return out;
  };
  const signals = (lx, lz, rad) => {
    const tr = window.__gtRefs?.traffic, t = tr && typeof tr.time === 'number' ? tr.time : null, ss = MV.sig?.signalState;
    const out = { t, ew: t !== null && ss ? ss(t, true) : null, ns: t !== null && ss ? ss(t, false) : null, on: {} };
    for (const nm of ['sigR', 'sigA', 'sigG', 'pedHand', 'pedMan']) {
      const p = INST?.pools?.get?.(nm);
      if (!p || !p.mats || !p.pos) continue;
      const on = [];
      for (let s = 0; s < p.top; s++) {
        if (!p.alive[s]) continue;
        const x = p.pos[s * 3], z = p.pos[s * 3 + 2];
        if ((x - lx) ** 2 + (z - lz) ** 2 > rad * rad) continue;
        if (Math.hypot(p.mats[s * 16], p.mats[s * 16 + 1], p.mats[s * 16 + 2]) > 0.5) on.push(s);
      }
      out.on[nm] = on;
    }
    return out;
  };
  const trainCars = (lx, lz, rad) => {
    let cars = null;
    try { cars = window.__TRAINS_AT ? window.__TRAINS_AT() : null; } catch { cars = null; }
    if (!cars) return null;
    return cars.filter((c) => (c.x - lx) ** 2 + (c.z - lz) ** 2 <= rad * rad).map((c) => ({ id: `${c.sv}:${c.k}:${c.i}`, kind: c.kind, x: r4(c.x), y: r4(c.y), z: r4(c.z), yaw: r5(c.yaw), lamps: c.lamps, doors: r4(c.doors || 0), v: r4(c.v || 0) }));
  };
  const moving = async ({ i, R }) => {
    await getThree();
    await loadFleetFns();
    E.camera.updateMatrixWorld();
    const e = E.camera.matrixWorld.elements, lx = e[12], lz = e[14];
    const out = { i, night: MV.env?.night?.value ?? null, veh: vehicles(lx, lz, R), movers: movers(i), sig: signals(lx, lz, R), trains: trainCars(lx, lz, R + 300) };
    if (!MV.groupsSent) { out.groups = vehGroups(); MV.groupsSent = true; if (MV.fleetErr) out.fleetErr = MV.fleetErr; }
    await flushGeo();
    return out;
  };
  const camera = () => {
    const c = E.camera;
    c.updateMatrixWorld();
    return { m: Array.from(c.matrixWorld.elements), fov: c.fov, aspect: c.aspect, near: c.near, far: c.far, zoom: c.zoom, filmGauge: c.filmGauge, filmOffset: c.filmOffset, focus: c.focus };
  };
  const lights = () => {
    const out = { lights: [], toneMapping: E.renderer.toneMapping, exposure: E.renderer.toneMappingExposure, outputColorSpace: E.renderer.outputColorSpace };
    E.scene.traverse((o) => {
      if (!o.isLight) return;
      o.updateMatrixWorld();
      const L = { type: o.type, name: o.name, visible: o.visible, color: [o.color.r, o.color.g, o.color.b], intensity: o.intensity, pos: o.getWorldPosition(new T.Vector3()).toArray() };
      if (o.target) { o.target.updateMatrixWorld(); L.target = o.target.getWorldPosition(new T.Vector3()).toArray(); }
      if (o.groundColor) L.groundColor = [o.groundColor.r, o.groundColor.g, o.groundColor.b];
      if (o.castShadow) L.castShadow = true;
      if (o.distance !== undefined) L.distance = o.distance;
      out.lights.push(L);
    });
    if (E.scene.fog) out.fog = { type: E.scene.fog.type, color: E.scene.fog.color?.toArray(), near: E.scene.fog.near, far: E.scene.fog.far, density: E.scene.fog.density };
    out.environmentIntensity = E.scene.environmentIntensity;
    out.background = E.scene.background ? (E.scene.background.isColor ? E.scene.background.toArray() : E.scene.background.type) : null;
    try { out.sunInfo = { elev: E.sunElev ?? null, az: E.sunAz ?? null }; } catch {}
    return out;
  };
  // ---------------- texture readback (any source, through the GPU) ----------------
  const readTextures = async (maxDim) => {
    await getThree();
    const R = E.renderer, gl = R.getContext();
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    const scene = new T.Scene(); scene.add(quad);
    const ocam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vs = 'in vec3 position; in vec2 uv; out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const fs2 = 'precision highp float; uniform sampler2D map; uniform float nrmRG; in vec2 vUv; out vec4 o; void main() { vec4 t = texture(map, vUv); if (nrmRG > 0.5) { vec2 xy = t.rg * 2.0 - 1.0; t = vec4(t.rg, sqrt(max(0.0, 1.0 - dot(xy, xy))) * 0.5 + 0.5, 1.0); } o = t; }';
    const fsA = 'precision highp float; precision highp sampler2DArray; uniform sampler2DArray map; uniform float layer; in vec2 vUv; out vec4 o; void main() { o = texture(map, vec3(vUv, layer)); }';
    const m2 = new T.RawShaderMaterial({ glslVersion: T.GLSL3, uniforms: { map: { value: null }, nrmRG: { value: 0 } }, vertexShader: vs, fragmentShader: fs2, depthTest: false, depthWrite: false });
    const mA = new T.RawShaderMaterial({ glslVersion: T.GLSL3, uniforms: { map: { value: null }, layer: { value: 0 } }, vertexShader: vs, fragmentShader: fsA, depthTest: false, depthWrite: false });
    const out = [];
    const prevRT = R.getRenderTarget(), prevAuto = R.autoClear;
    const RG = new Set([T.RGFormat, T.RED_GREEN_RGTC2_Format, T.SIGNED_RED_GREEN_RGTC2_Format, T.RG11_EAC_Format, T.SIGNED_RG11_EAC_Format].filter((v) => v !== undefined));
    for (const { id, t } of X.texs.values()) {
      const info = { id, ...texInfo(t) };
      try {
        const img = t.image || {};
        let w = t.mipmaps && t.mipmaps[0] && t.mipmaps[0].width ? t.mipmaps[0].width : (img.width || img.videoWidth || 0);
        let h = t.mipmaps && t.mipmaps[0] && t.mipmaps[0].height ? t.mipmaps[0].height : (img.height || img.videoHeight || 0);
        if (!w || !h) { info.err = 'no size'; out.push(info); continue; }
        const s = Math.min(1, maxDim / Math.max(w, h));
        const ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
        const srgb = t.colorSpace === T.SRGBColorSpace;
        const rt = new T.WebGLRenderTarget(ow, oh, { depthBuffer: false, type: T.UnsignedByteType, colorSpace: srgb ? T.SRGBColorSpace : T.NoColorSpace });
        const layers = info.array ? Math.min(img.depth || 1, 8) : 1;
        info.w = w; info.h = h; info.ow = ow; info.oh = oh; info.layers = layers; info.files = [];
        for (let L = 0; L < layers; L++) {
          if (info.array) { mA.uniforms.map.value = t; mA.uniforms.layer.value = L; quad.material = mA; }
          else { m2.uniforms.map.value = t; m2.uniforms.nrmRG.value = RG.has(t.format) ? 1 : 0; quad.material = m2; }
          R.setRenderTarget(rt); R.autoClear = true; R.setClearColor(0x000000, 0); R.clear(); R.render(scene, ocam);
          const px = new Uint8Array(ow * oh * 4);
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          R.readRenderTargetPixels(rt, 0, 0, ow, oh, px);
          // rows bottom-up as read; the sink flips them into a top-down PNG, so uv (0, 0) lands bottom-left
          let opaque = true;
          for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { opaque = false; break; }
          info.opaque = opaque;
          const base = `tex/t${id}${layers > 1 ? '_' + L : ''}`;
          await post(`${base}__${ow}x${oh}.rgba`, px);
          info.files.push(base + '.png');
        }
        rt.dispose();
      } catch (e) { info.err = String(e).slice(0, 160); }
      out.push(info);
    }
    R.setRenderTarget(prevRT); R.autoClear = prevAuto;
    m2.dispose(); mA.dispose(); quad.geometry.dispose();
    return out;
  };
  const tables = () => ({ geos: [...X.geos.values()].map((e) => e.d), mats: [...X.mats.values()].map((e) => e.d), skipped: X.skipped, crowd: X.crowd || 0, geoBytes: X.nGeoBytes });
  window.__EXP = { staticWorld, dynamic, camera, lights, readTextures, tables, getThree, moving, setPath };
  // BX-SEQ: the exporter's tables for the tracks' in-page code (docs/notes/ar34-bx-seq.md)
  window.__EXP.lib = { get T() { return T; }, texId, matId, geoWhole, geoClip, post, flushGeo, inRegion, inPath: (x, z, which = 'F') => inRegion(x, z, 0, which === 'F' ? cfg.F : cfg.R), skip, X, MV, RG };
  return 'installed';
}

// ---- run -----------------------------------------------------------------------------------------------------------------
const manifest = { when: new Date().toString(), flags: BASE_FLAGS, size: [W, H], fps: FPS, centre: [CLON, CLAT], centreXZ: [CX, CZ], region: REGION, far: Math.max(FAR, REGION), shots: {}, timings: {} };
const t = (k, t0) => { manifest.timings[k] = +((Date.now() - t0) / 1000).toFixed(1); };
let exitCode = 0;
try {
  const first = POOL[names[0]];
  const groupKey = (n) => `${POOL[n].time || 'golden'}|${POOL[n].flags || ''}`;
  if (new Set(names.map(groupKey)).size > 1) throw new Error('the shots must share time and flags (one boot)');
  const [sx, sz] = project(first.keys[0].p[0], first.keys[0].p[1]);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  let guardW = null;
  try { guardW = watchPage(page, { label: 'harvest' }); } catch {}
  await page.routeWebSocket('**', () => {}).catch(() => {});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 250)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 300)));
  const q = `?shot=1&record=1&${BASE_FLAGS}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(first.keys[0].p[2] + 40).toFixed(1)}&time=${first.time || 'golden'}${first.flags ? '&' + first.flags : ''}`;
  const url = `http://127.0.0.1:${port}/${q}`;
  manifest.url = q;
  console.log(`    ${url}`);
  const tb = Date.now();
  let booted = false;
  for (let a = 0; a < 3 && !booted; a++) {
    if (a) { console.log(`    boot retry ${a}: ${[...new Set(errors)].slice(0, 2).join(' | ')}`); errors.length = 0; await sleep(30000); }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch((e) => console.log('    goto:', e.message.split('\n')[0]));
    booted = await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: bootMs }).then(() => true).catch(() => false);
  }
  if (!booted) throw new Error('page never reached record mode');
  console.log(`    booted ${stamp()}: ${await page.evaluate(exportLib, { sink: `http://127.0.0.1:${sinkPort}`, cx: CX, cz: CZ, R: REGION, F: Math.max(FAR, REGION) })}`);
  t('boot', tb);
  Object.assign(hookCtx, { page, manifest, names, POOL, FPS, W, H, project, region: { cx: CX, cz: CZ, R: REGION, F: Math.max(FAR, REGION), ring: RING } });   // BX-SEQ hooks
  await runHooks('boot');
  const lensAll = [];   // BX-SEQ: every shot's lens positions (the USD root recentres on their centroid)
  let staticDone = false;
  for (const name of names) {
    const P = POOL[name], ts = Date.now();
    console.log(`\n  -- ${name}: ${P.title || ''}`);
    await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
    await page.evaluate(() => window.__advance(0));
    await settleWorld(page, bootMs);
    if (url.includes('filmlod=1')) {
      await page.evaluate(() => window.__DRESS_HOLD?.('grow'));
      const pts = [];
      for (let k = 1; k < P.keys.length; k++) pts.push(midKey(P.keys[k - 1], P.keys[k]), P.keys[k]);
      for (const qq of P.prestream || []) pts.push({ p: qq, look: [qq[0], qq[1] + 0.002, 0] });
      for (const K of pts) { await page.evaluate((p) => window.__SET_PATH(p), holdAt(P, K)); await page.evaluate(() => window.__advance(0)); await settleWorld(page, 60000, 1500, 3); }
      await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
      await page.evaluate(() => window.__advance(0));
      await settleWorld(page, 60000, 1500, 3);
      if (P.prestream) await page.evaluate(() => window.__ENGINE?.resetProbe?.());
    }
    await page.evaluate(() => window.__PEDS_RESET?.() ?? null);
    if (P.clearTrees) await page.evaluate(([p, r]) => window.__CLEAR_TREES?.(p, r) ?? -1, [P.keys.map((k) => project(k.p[0], k.p[1])), P.clearTrees]);
    await page.evaluate(() => window.__SPAWNGUARD?.(false));
    let warm = P.warm || 300;
    if (P.phase !== undefined) {
      const t0s = await page.evaluate(() => window.__gtRefs?.traffic?.time ?? null);
      if (t0s !== null) { const c = (((P.phase - (t0s + warm / 30)) % 40) + 40) % 40; warm += Math.round(c * 30); }
    }
    if (await page.evaluate(() => typeof window.__REC_WARM === 'function')) await page.evaluate((n) => window.__REC_WARM({ n, drawLast: 60, dt: 1 / 30 }), warm);
    else for (let i = 0; i < warm; i++) await page.evaluate((nd) => window.__advance(1 / 30, nd), i < warm - 60);
    await page.evaluate((p) => window.__SET_PATH(p), P);
    await page.evaluate(() => window.__advance(0));
    await page.evaluate(() => window.__SPAWNGUARD?.(true));
    const s2 = await settleWorld(page, 30000, 2500, 5);
    await page.evaluate(() => window.__DRESS_HOLD?.('freeze'));
    t(name + ':ready', ts);
    console.log(`     ready in ${((Date.now() - ts) / 1000).toFixed(0)}s (warm ${warm}, cars ${s2?.cars}, peds ${s2?.peds ?? '-'})`);
    await runHooks('shotReady', name);   // BX-SEQ hooks
    const nF = Math.round(P.duration * FPS);
    const cams = [], MOVF = [];   // BX-SEQ: MOVF the moving sets of every frame
    const shot = { title: P.title, time: P.time, frames: nF, key: [], fov: P.fov };
    for (let i = 0; i < nF; i++) {
      const key = KEYF.includes(i) || i === nF - 1 && KEYF.includes(107);
      // (BX-SEQ: every frame is drawn when the moving sets are read each frame: the trains place their cars in the scene's
      // onBeforeRender)
      if (i > 0) await page.evaluate(([d, nd]) => window.__advance(d, nd), [1 / FPS, !key && MOVING !== 'all']);
      cams.push(await page.evaluate(() => window.__EXP.camera()));
      if (MOVING === 'all' || (MOVING === 'keys' && key)) MOVF.push(await page.evaluate((a) => window.__EXP.moving(a), { i, R: REGION + 150 }));   // BX-SEQ
      await runHooks('frame', name, i);   // BX-SEQ hooks
      if (!key) continue;
      if (!staticDone) {
        const th = Date.now();
        if (!PATHREG) {   // BX-SEQ: the legacy square region is captured here; along the lens path, after the take (below)
          const S = await page.evaluate(() => window.__EXP.staticWorld());
          await fs.writeFile(path.join(outDir, 'static.json'), JSON.stringify(S));
          t('static', th);
          console.log(`     static world at ${name} f${i}: ${S.objects.length} meshes, ${S.pools.length} pools (${S.pools.reduce((a, p) => a + p.n, 0)} instances) in ${((Date.now() - th) / 1000).toFixed(1)}s`);
        }
        staticDone = true;
        await fs.writeFile(path.join(outDir, 'lights.json'), JSON.stringify(await page.evaluate(() => window.__EXP.lights()), null, 1));
      }
      const td = Date.now();
      const D = await page.evaluate(() => window.__EXP.dynamic());
      const f = `dyn_${name}_f${String(i).padStart(3, '0')}.json`;
      await fs.writeFile(path.join(outDir, f), JSON.stringify(D));
      shot.key.push({ frame: i, file: f, n: D.instanced.length, inst: D.instanced.reduce((a, p) => a + p.n, 0), secs: +((Date.now() - td) / 1000).toFixed(1) });
      console.log(`     f${i}: ${D.instanced.length} moving instanced sets (${D.instanced.reduce((a, p) => a + p.n, 0)} instances)`);
    }
    await fs.writeFile(path.join(outDir, `cam_${name}.json`), JSON.stringify(cams));
    shot.camFile = `cam_${name}.json`;
    // BX-SEQ: the shot's region along its lens path, captured now (the dresser still frozen), and its moving sets
    const lens = cams.map((c) => [c.m[12], c.m[14]]);
    lensAll.push(...lens);
    if (PATHREG) {
      const th = Date.now();
      shot.region = await page.evaluate((a) => window.__EXP.setPath(a), { pts: lens, R: REGION, F: Math.max(FAR, REGION), ring: RING });
      const S = await page.evaluate(() => window.__EXP.staticWorld());
      await fs.writeFile(path.join(outDir, `static_${name}.json`), JSON.stringify(S));
      if (name === names[0]) await fs.writeFile(path.join(outDir, 'static.json'), JSON.stringify(S));
      shot.staticFile = `static_${name}.json`;
      // the hide masks against the dresser's own count (its rebuilt buildings: each sets one texel of its tile's uHide; the
      // facade kit's buildings are dropped from the tiles at assembly, fk/facades.js SKIP, and need no mask)
      const dr = await page.evaluate(() => (window.__DRESS ? window.__DRESS() : null)).catch(() => null);
      shot.hide = { dresserActive: dr && typeof dr === 'object' ? dr.active : null, hiddenBids: Object.values(S.hide || {}).reduce((a, b) => a + b.length, 0), tiles: Object.keys(S.hide || {}).length };
      console.log(`     hide masks: ${JSON.stringify(shot.hide)}`);
      t(name + ':static', th);
      console.log(`     static world along the path: ${S.objects.length} meshes (${S.objects.filter((o) => o.far).length} far), ${S.pools.length} pools (${S.pools.reduce((a, p) => a + p.n, 0)} instances), ${S.instanced.length} still instanced sets (${S.instanced.reduce((a, p) => a + p.n, 0)}) in ${((Date.now() - th) / 1000).toFixed(1)}s`);
    }
    if (MOVF.length) {
      const mv = assembleMoving(MOVF, nF, lens);
      await fs.writeFile(path.join(outDir, `mov_${name}.json`), JSON.stringify(mv));
      shot.movFile = `mov_${name}.json`;
      shot.moving = { cars: mv.cars.length, drawn: mv.cars.filter((c) => c.drawn).length, groups: mv.groups.length, movers: mv.movers.length, moverTracks: mv.movers.reduce((a, s) => a + s.tracks.length, 0), fleetErr: mv.fleetErr };
      console.log(`     moving sets: ${JSON.stringify(shot.moving)}`);
    }
    await runHooks('shotDone', name);   // BX-SEQ hooks
    manifest.shots[name] = shot;
    t(name + ':take', ts);
    await page.evaluate(() => window.__DRESS_HOLD?.(null));
  }
  manifest.hooks = await runHooks('end');   // BX-SEQ hooks (before the textures are read back)
  if (PATHREG && lensAll.length) {   // BX-SEQ: the region is the lens paths'; the USD root recentres on their centroid
    manifest.centreXZ = [lensAll.reduce((a, p) => a + p[0], 0) / lensAll.length, lensAll.reduce((a, p) => a + p[1], 0) / lensAll.length];
    manifest.centre = [LON0 + manifest.centreXZ[0] / M_LON, LAT0 - manifest.centreXZ[1] / M_LAT];
    manifest.regionMode = 'path'; manifest.ring = RING;
  }
  const tt = Date.now();
  const texs = await page.evaluate((m) => window.__EXP.readTextures(m), MAXTEX);
  t('textures', tt);
  const tab = await page.evaluate(() => window.__EXP.tables());
  await Promise.all(encodes);
  t('textures+encode', tt);
  manifest.geos = tab.geos; manifest.mats = tab.mats; manifest.texs = texs; manifest.skipped = tab.skipped; manifest.crowdInstancesSkipped = tab.crowd;
  manifest.pageErrors = [...new Set(errors)].slice(0, 20);
  console.log(`    textures: ${texs.length} (${texs.filter((x) => x.err).length} failed); geometries ${tab.geos.length} (${(tab.geoBytes / 1e6).toFixed(1)} MB); materials ${tab.mats.length}; skipped ${JSON.stringify(tab.skipped)}`);
  if (manifest.pageErrors.length) console.log('    PAGE ERRORS:\n      ' + manifest.pageErrors.slice(0, 6).join('\n      '));
  guardW?.stop();
  await page.close();
} catch (e) {
  console.log('HARVEST FAILED:', e?.stack || e);
  manifest.error = String(e);
  exitCode = 2;
} finally {
  await browser.close().catch(() => {});
  releaseGpu();
  if (server) server.kill();
}
manifest.timings.total = +((Date.now() - T0) / 1000).toFixed(1);
manifest.sink = { bytes: sinkBytes, files: sinkFiles };
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`[harvest ${stamp()}] done in ${manifest.timings.total}s; ${sinkFiles} blobs, ${(sinkBytes / 1e6).toFixed(1)} MB -> ${outDir}`);
sink.close();
process.exit(exitCode);
