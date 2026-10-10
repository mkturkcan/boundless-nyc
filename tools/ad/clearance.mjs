// CAMERA CLEARANCE AUDIT (FILM, 2026-10-02; owner: "make sure the camera doesn't pass through viaducts or other objects.
// I also see in one of the shots a vehicle colliding into the back of a truck - make sure about that").
//
// Boots the page exactly as tools/ad/record.mjs does for a shot group (the _meta flags plus the shot's flags, its time of
// day, the settle, the FP26 pre-stream of the whole path, the walkers' reset, the warm-up against a hold path, the real path
// installed, the dresser frozen) and then steps the take's timeline one recorder frame (1 / fps) at a time, drawn, so the
// traffic, the walkers, the instancer's culled draw sets and every LoD are in the state the take has at that frame. Between
// two frames the lens path is walked in steps of at most --step m (0.08 by default; the take's 15 accumulation samples are
// still frames on one pose, so this is finer than anything the take draws) with PathCam's own interpolation: the Catmull-Rom
// spline over the keys (tension), the easeEnds ramp, lookAhead, and for a path without "abs" the terrain low-pass by time
// (PG32), whose per-frame values are checked against the page's own camera every frame (`replica` in the report).
//
// At every step:
//   (a) CROSSED: the segment from the previous step, intersected with every triangle drawn there (double-sided);
//   (b) CLEARANCE: the exact distance from the lens to the nearest drawn triangle within --radius m (1.5) -- the limit of a
//       ray bundle with infinitely many directions, so stricter than the 26-direction bundle it replaces; with whether the
//       nearest point lies inside the near plane's cut (0.4 m deep and inside the frustum: the picture slices it open);
//   (c) per frame, every pair of vehicles whose DRAWN bodies overlap (fleet24's LOD0 front body on the pool's instance
//       matrix, an articulated vehicle's rear body on its pivot and bend as fleet24 draws it), with the sim's own carHalf
//       box overlap beside it, whether either is in view and how deep.
//   (d) TN38: per frame, every moving vehicle with a wheel hub or its body centre on a non-road surface (a sidewalk, a median
//       or its nose, a planting bed, a plaza: traffic.js offRoad), with whether it is in view; one in view within 400 m fails
//       the shot, and so does one on a connector (turning) out of view within 700 m of the lens; the others are listed.
// Geometry is what the frame draws: every visible Mesh, InstancedMesh (the instancer's culled pools, fleet24's render sets,
// the crowd), BatchedMesh and SkinnedMesh (bind pose) on the camera's layers, in world space through its matrixWorld and
// instance matrices, the corridor round the path only. Not audited (listed in the report): geometry instanced through custom
// attributes (VG36's grass blades, 5-8 cm tall), Points, Lines and Sprites, materials that write no colour or are additive.
// Leaf cards count as their whole card (alpha-tested texels are not known here), so a crown is conservative.
//
// A shot passes with nothing crossed and a clearance >= 0.6 m everywhere (the near plane's cut at the frustum's corner is
// 0.4 m x 1.5 = 0.6 m at a 58-60 degree lens), or >= its own `minClear` when shots.json gives one with a `closeWhy`.
//
//   node tools/ad/clearance.mjs --act teaser7                    # every shot of an act
//   node tools/ad/clearance.mjs --shot t7ArchGlide,t5DinoGlide   # some shots
//   node tools/ad/clearance.mjs --spec my.json --shot zBad       # shots from another file (same format as shots.json)
//   node tools/ad/clearance.mjs --survey --shot t5DinoGlide      # what is drawn round key 0 (types, names, custom instancing)
//   options: --out <dir> (client/shots/ar34/film/clearance/<label>), --label, --step 0.08, --radius 1.5, --min 0.6,
//            --stills 8 (per shot), --size WxH (the take's), --nolock, --novehicles, --frames a-b (a part of the timeline),
//            --sheet (a clean still at each take's first, middle and last frame in <out>/sheet/, for a contact sheet)
// Output: <out>/report.json, <out>/report.txt, <out>/stills/<shot>_f<frame>_<what>.jpg; exit 3 when a shot fails.
import { chromium } from 'playwright';
import { acquireGpu } from '../gpulock.mjs';
import { installGuard, watchPage } from '../harness_guard.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const bdir = path.join(root, 'client');
const sharp = createRequire(path.resolve(here, '..', 'assets', 'package.json'))('sharp');
sharp.cache(false);
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d; };
const has = (n) => args.includes('--' + n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

const specFile = path.resolve(root, opt('spec', 'tools/ad/shots.json'));
const MAIN = JSON.parse(await fs.readFile(path.join(here, 'shots.json'), 'utf8'));
const SPEC = specFile === path.join(here, 'shots.json') ? MAIN : JSON.parse(await fs.readFile(specFile, 'utf8'));
const META = { ...(MAIN._meta || {}), ...(SPEC._meta || {}) };
const POOL = { ...(SPEC.shots || {}), ...(SPEC.probes || {}) };
let names = opt('shot') ? opt('shot').split(',') : opt('act') ? Object.keys(POOL).filter((k) => POOL[k].act === opt('act')) : [];
names = names.filter((n) => { if (!POOL[n]) { console.log('unknown shot', n); return false; } return true; });
if (!names.length) { console.log('no shots: --act <act> or --shot a,b'); process.exit(1); }

const SURVEY = has('survey');
const FPS = Number(opt('fps', String(META.fps || 30)));
const [W, H] = (opt('size', META.size || '1920x1080')).split('x').map(Number);
const BASE_FLAGS = opt('flags', META.flags || 'hud=0&lmwait=150&life=0&clean=1');
const STEP = Number(opt('step', '0.08')), RADIUS = Number(opt('radius', '1.5')), MINC = Number(opt('min', '0.6'));
const MAXSTILL = Number(opt('stills', '8'));
const VEH = !has('novehicles');
const SHEET = has('sheet');   // also a clean still at the take's first, middle and last frame (<out>/sheet/), for the contact sheet
const FR = opt('frames') ? opt('frames').split('-').map(Number) : null;
const label = opt('label', (opt('act') || names.slice(0, 2).join('_')) + '_' + new Date().toISOString().slice(5, 16).replace(/[-:T]/g, ''));
const outDir = path.resolve(root, opt('out', path.join('client/shots/ar34/film/clearance', label)));
await fs.mkdir(path.join(outDir, 'stills'), { recursive: true });
const bootMs = 200000;

// mirror of client/src/shared/geo.js project()
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];

// ---- takes grouped by (time, flags) like record.mjs ----------------------------------------------------------------
const takes = [];
for (const n of names) { const s = POOL[n]; for (const t of opt('time') ? [opt('time')] : (s.times || [s.time || 'golden'])) takes.push({ name: n, spec: s, time: t, flags: s.flags || '' }); }
const groups = new Map();
for (const t of takes) { const k = `${t.time}|${t.flags}`; if (!groups.has(k)) groups.set(k, { time: t.time, flags: t.flags, takes: [] }); groups.get(k).takes.push(t); }
const totalFrames = takes.reduce((a, t) => a + Math.round(t.spec.duration * FPS), 0);
console.log(`[clearance ${stamp()}] ${takes.length} take(s) in ${groups.size} group(s), ${totalFrames} frames; step ${STEP} m, radius ${RADIUS} m, min ${MINC} m -> ${path.relative(root, outDir)}`);

try { installGuard({ name: 'clearance ' + label.slice(0, 30), maxMin: Math.ceil(15 + groups.size * 6 + takes.length * 6 + totalFrames * 1.2 / 60) }); } catch (e) { console.log('[clearance] guard not installed:', e?.message || e); }
const releaseGpu = has('nolock') ? (() => {}) : await acquireGpu('clearance ' + label.slice(0, 30));

let server = null, port = opt('port');
if (!port) {
  port = String(5400 + Math.floor(Math.random() * 3000));
  server = spawn(process.execPath, [path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });
  await sleep(3500);
}
const browser = await chromium.launch({
  headless: true,
  args: [(process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`],
});

// ---- record.mjs's settle helpers (same budgets) ----------------------------------------------------------------------
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

// ---- the in-page auditor ---------------------------------------------------------------------------------------------
// Installed once per page; __CLR.begin(path, cfg) prepares a take, __CLR.frame(i) audits the steps up to frame i.
function pageLib() {
  if (window.__CLR) return 'present';
  const E = window.__ENGINE, S = window.__STREAMER;
  const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
  const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
  let T = null;
  const getThree = async () => {
    if (T) return T;
    const names = performance.getEntriesByType('resource').map((e) => e.name);
    const u = names.find((n) => /\/\.vite\/deps\/three\.js(\?|$)/.test(n)) || names.find((n) => /three\.module\.js/.test(n)) || '/node_modules/three/build/three.module.js';
    T = await import(u);
    return T;
  };
  const easeEnds = (x, f) => {
    if (f <= 0.001) return x;
    const norm = 1 - f;
    let a;
    if (x < f) a = (x * x) / (2 * f);
    else if (x > 1 - f) { const y = 1 - x; a = norm - (y * y) / (2 * f); }
    else a = x - f / 2;
    return a / norm;
  };
  const groundAt = (x, z, prev, dt) => {
    const g = S.terrainAt(x, z);
    if (g === null || !isFinite(g)) return prev;
    if (prev === null) return g;
    return prev + (g - prev) * (1 - Math.pow(0.75, Math.max(0, dt) * 30));
  };
  // ---------------- geometry store: world-space triangles in 1 m cells ----------------
  const CELL = 1.0, OFF = 1 << 20;
  const ck = (ix, iy, iz) => ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
  const mkSoup = () => ({ v: new Float32Array(9 * 4096), o: new Int32Array(4096), k: new Int32Array(4096), r: new Int32Array(4096), n: 0, grid: new Map() });
  const soupPush = (s, a, oi, inst, rev) => {
    if (s.n >= s.o.length) {
      const g = (A, m) => { const B = new A.constructor(A.length * 2); B.set(A); return B; };
      s.v = g(s.v); s.o = g(s.o); s.k = g(s.k); s.r = g(s.r);
    }
    const n = s.n++;
    s.v.set(a, n * 9); s.o[n] = oi; s.k[n] = inst; s.r[n] = rev;
    return n;
  };
  let st = null;   // the take's state
  const objs = [];   // { name, desc, rev, seen (frame stamp), kind }
  const objIx = new Map();
  const descOf = (o) => {
    const chain = [];
    for (let p = o, d = 0; p && d < 5; p = p.parent, d++) if (p.name) chain.push(p.name);
    const m = Array.isArray(o.material) ? o.material.map((x) => x?.name || x?.type).join('+') : (o.material?.name || o.material?.type || '');
    let ud = '';
    try { const u = o.userData || {}; ud = Object.keys(u).slice(0, 6).map((k) => `${k}=${typeof u[k] === 'object' ? (Array.isArray(u[k]) ? 'arr' : 'obj') : String(u[k]).slice(0, 24)}`).join(','); } catch {}
    return { name: chain.join(' < ') || o.type, type: o.isInstancedMesh ? 'InstancedMesh' : o.isBatchedMesh ? 'BatchedMesh' : o.isSkinnedMesh ? 'SkinnedMesh' : o.type, mat: m.slice(0, 80), geo: (o.geometry?.name || '').slice(0, 40), ud: ud.slice(0, 160) };
  };
  const objIndex = (o) => {
    let i = objIx.get(o);
    if (i === undefined) { i = objs.length; objs.push({ o, d: descOf(o), rev: 0, seen: -1, ver: '' }); objIx.set(o, i); }
    return i;
  };
  const solidMat = (m) => m && m.visible !== false && m.colorWrite !== false && !(m.blending === 2 /* Additive */) && !(m.transparent && (m.opacity ?? 1) < 0.03);
  const solid = (o) => Array.isArray(o.material) ? o.material.some(solidMat) : solidMat(o.material);
  // the corridor: cells within R of any step of the take (a hash set), with its bounds
  const corr = { set: new Set(), x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
  const markCorr = (pts, R) => {
    corr.set.clear();
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const p of pts) {
      const a = Math.floor((p[0] - R) / CELL), b = Math.floor((p[0] + R) / CELL), c = Math.floor((p[1] - R) / CELL), d = Math.floor((p[1] + R) / CELL), e = Math.floor((p[2] - R) / CELL), f = Math.floor((p[2] + R) / CELL);
      for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) for (let k = e; k <= f; k++) corr.set.add(ck(i, j, k));
      x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, c); y1 = Math.max(y1, d); z0 = Math.min(z0, e); z1 = Math.max(z1, f);
    }
    Object.assign(corr, { x0, y0, z0, x1, y1, z1 });
  };
  // a triangle (9 floats, world) into the soup's cells that are in the corridor; false when it touches none
  const tri = new Float32Array(9);
  const insertTri = (s, cset, oi, inst, rev) => {
    const ax = tri[0], ay = tri[1], az = tri[2], bx = tri[3], by = tri[4], bz = tri[5], cx = tri[6], cy = tri[7], cz = tri[8];
    let i0 = Math.floor(Math.min(ax, bx, cx) / CELL), i1 = Math.floor(Math.max(ax, bx, cx) / CELL);
    let j0 = Math.floor(Math.min(ay, by, cy) / CELL), j1 = Math.floor(Math.max(ay, by, cy) / CELL);
    let k0 = Math.floor(Math.min(az, bz, cz) / CELL), k1 = Math.floor(Math.max(az, bz, cz) / CELL);
    if (i1 < cset.x0 || i0 > cset.x1 || j1 < cset.y0 || j0 > cset.y1 || k1 < cset.z0 || k0 > cset.z1) return false;
    i0 = Math.max(i0, cset.x0); i1 = Math.min(i1, cset.x1); j0 = Math.max(j0, cset.y0); j1 = Math.min(j1, cset.y1); k0 = Math.max(k0, cset.z0); k1 = Math.min(k1, cset.z1);
    if (!(isFinite(ax) && isFinite(bx) && isFinite(cx))) return false;
    let n = -1;
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 20000) {
      // a huge triangle (a ground or wall slab): only the cells it can reach, by the plane's distance from the cell centres
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      for (const key of cset.set) {
        const iz = (key % 8192) - 4096, rest = Math.floor(key / 8192), iy = (rest % 8192) - 4096, ix = Math.floor(rest / 8192) - 4096;
        if (ix < i0 || ix > i1 || iy < j0 || iy > j1 || iz < k0 || iz > k1) continue;
        const px = (ix + 0.5) * CELL - ax, py = (iy + 0.5) * CELL - ay, pz = (iz + 0.5) * CELL - az;
        if (Math.abs(px * nx + py * ny + pz * nz) > CELL * 0.9) continue;
        if (n < 0) n = soupPush(s, tri, oi, inst, rev);
        let L = s.grid.get(key); if (!L) s.grid.set(key, (L = [])); L.push(n);
      }
      return n >= 0;
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const key = ck(i, j, k);
      if (!cset.set.has(key)) continue;
      if (n < 0) n = soupPush(s, tri, oi, inst, rev);
      let L = s.grid.get(key); if (!L) s.grid.set(key, (L = [])); L.push(n);
    }
    return n >= 0;
  };
  // the triangles of one geometry under matrix M (Matrix4 elements) into soup s; returns how many went in
  const addGeo = (s, cset, g, M, oi, inst, rev, range) => {
    const pa = g.attributes.position;
    if (!pa) return 0;
    const ix = g.index ? g.index.array : null;
    const fast = !pa.isInterleavedBufferAttribute && !pa.normalized && pa.itemSize === 3 && pa.array instanceof Float32Array;
    const P = fast ? pa.array : null;
    const e = M;
    const gx = (i) => (fast ? P[i * 3] : pa.getX(i)), gy = (i) => (fast ? P[i * 3 + 1] : pa.getY(i)), gz = (i) => (fast ? P[i * 3 + 2] : pa.getZ(i));
    let start = range ? range[0] : g.drawRange.start, count = range ? range[1] : g.drawRange.count;
    const total = ix ? ix.length : pa.count;
    start = Math.max(0, start); count = Math.min(total - start, count);
    let added = 0;
    for (let t = start; t + 2 < start + count + 0.5 && t + 2 < total; t += 3) {
      for (let c = 0; c < 3; c++) {
        const vi = ix ? ix[t + c] : t + c, x = gx(vi), y = gy(vi), z = gz(vi);
        tri[c * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        tri[c * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        tri[c * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      if (insertTri(s, cset, oi, inst, rev)) added++;
    }
    return added;
  };
  const mul = (a, b, out) => {   // out = a * b (column-major 4x4)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return out;
  };
  const MM = new Float32Array(16), IM = new Float32Array(16);
  // a world AABB of a local box under M against the corridor's cell bounds and set (any cell of the set inside it)
  const boxHitsCorr = (bb, e, cset, pad = 0) => {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? bb.max.x : bb.min.x, y = c & 2 ? bb.max.y : bb.min.y, z = c & 4 ? bb.max.z : bb.min.z;
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    }
    if (!(isFinite(x0) && isFinite(x1))) return false;
    const i0 = Math.floor((x0 - pad) / CELL), i1 = Math.floor((x1 + pad) / CELL), j0 = Math.floor((y0 - pad) / CELL), j1 = Math.floor((y1 + pad) / CELL), k0 = Math.floor((z0 - pad) / CELL), k1 = Math.floor((z1 + pad) / CELL);
    if (i1 < cset.x0 || i0 > cset.x1 || j1 < cset.y0 || j0 > cset.y1 || k1 < cset.z0 || k0 > cset.z1) return false;
    const vol = (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
    if (vol < cset.set.size) {
      for (let i = Math.max(i0, cset.x0); i <= Math.min(i1, cset.x1); i++) for (let j = Math.max(j0, cset.y0); j <= Math.min(j1, cset.y1); j++) for (let k = Math.max(k0, cset.z0); k <= Math.min(k1, cset.z1); k++) if (cset.set.has(ck(i, j, k))) return true;
      return false;
    }
    for (const key of cset.set) {
      const iz = (key % 8192) - 4096, rest = Math.floor(key / 8192), iy = (rest % 8192) - 4096, ix = Math.floor(rest / 8192) - 4096;
      if (ix >= i0 && ix <= i1 && iy >= j0 && iy <= j1 && iz >= k0 && iz <= k1) return true;
    }
    return false;
  };
  const gbox = (g) => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox; };
  // ---------------- per-frame collection ----------------
  // static meshes: extracted once per (object, matrixWorld, geometry) against the take's corridor; instanced, batched and
  // skinned ones: every frame against the frame's own corridor (their draw sets and poses change)
  const custom = new Map(), skipped = new Map();
  const collect = (frameNo, fset) => {
    const cam = E.camera;
    const dyn = mkSoup();
    const vis = new Set();
    let nStatic = 0, nDyn = 0;
    E.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isBatchedMesh) { if (o.isPoints || o.isLine || o.isSprite) skipped.set(o.type, (skipped.get(o.type) || 0) + 1); return; }
      if (!o.layers.test(cam.layers)) return;
      const g = o.geometry;
      if (!g || !g.attributes || !g.attributes.position) return;
      if (!solid(o)) return;
      if (g.isInstancedBufferGeometry && !o.isInstancedMesh) { custom.set(o.name || o.parent?.name || 'unnamed', (g.instanceCount ?? 0)); return; }
      // a sky dome, a fog shell or the open water's plane (kilometres across) is no member a lens can meet
      if (!o.isInstancedMesh && !o.isBatchedMesh) {
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > 2000) { skipped.set('huge ' + (o.name || o.type), 1); return; }
      }
      const oi = objIndex(o);
      vis.add(oi);
      objs[oi].seen = frameNo;
      const e = o.matrixWorld.elements;
      if (o.isInstancedMesh) {
        const n = o.count, A = o.instanceMatrix.array, bb = gbox(g);
        for (let k = 0; k < n; k++) {
          const b = k * 16;
          if (A[b] === 0 && A[b + 5] === 0 && A[b + 10] === 0) continue;
          for (let q = 0; q < 16; q++) IM[q] = A[b + q];
          mul(e, IM, MM);
          if (!boxHitsCorr(bb, MM, fset)) continue;
          nDyn += addGeo(dyn, fset, g, MM, oi, k, 0);
        }
        return;
      }
      if (o.isBatchedMesh) {
        const info = o._instanceInfo || [], gin = o._geometryInfo || [];
        const m4 = new T.Matrix4();
        for (let k = 0; k < info.length; k++) {
          const I = info[k];
          if (!I || !I.active || !I.visible) continue;
          const G = gin[I.geometryIndex];
          if (!G || G.active === false) continue;
          o.getMatrixAt(k, m4);
          mul(e, m4.elements, MM);
          if (G.boundingBox && !boxHitsCorr(G.boundingBox, MM, fset)) continue;
          nDyn += addGeo(dyn, fset, g, MM, oi, k, 0, [G.start ?? (g.index ? G.indexStart : G.vertexStart), G.count ?? (g.index ? G.indexCount : G.vertexCount)]);
        }
        return;
      }
      if (o.isSkinnedMesh) { if (boxHitsCorr(gbox(g), e, fset)) nDyn += addGeo(dyn, fset, g, e, oi, -1, 0); return; }
      // static: (re)extract when new or moved
      const ver = g.uuid + ':' + g.drawRange.start + ':' + g.drawRange.count + ':' + Array.from(e).map((v) => v.toFixed(4)).join(',');
      const O = objs[oi];
      if (O.ver === ver) return;
      O.ver = ver; O.rev++;
      if (!boxHitsCorr(gbox(g), e, corr)) return;
      nStatic += addGeo(st.soup, corr, g, e, oi, -1, O.rev);
    });
    return { dyn, vis, nStatic, nDyn };
  };
  // ---------------- queries ----------------
  const cp = new Float64Array(3);
  // closest point on triangle (Ericson 5.1.5); returns the squared distance, the point in cp
  const closest = (v, b, px, py, pz) => {
    const ax = v[b], ay = v[b + 1], az = v[b + 2], bx = v[b + 3], by = v[b + 4], bz = v[b + 5], cx = v[b + 6], cy = v[b + 7], cz = v[b + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let rx, ry, rz;
    if (d1 <= 0 && d2 <= 0) { rx = ax; ry = ay; rz = az; }
    else {
      const bpx = px - bx, bpy = py - by, bpz = pz - bz;
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      if (d3 >= 0 && d4 <= d3) { rx = bx; ry = by; rz = bz; }
      else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const w = d1 / (d1 - d3); rx = ax + w * abx; ry = ay + w * aby; rz = az + w * abz; }
        else {
          const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
          const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
          if (d6 >= 0 && d5 <= d6) { rx = cx; ry = cy; rz = cz; }
          else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); rx = ax + w * acx; ry = ay + w * acy; rz = az + w * acz; }
            else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); rx = bx + w * (cx - bx); ry = by + w * (cy - by); rz = bz + w * (cz - bz); }
              else { const den = 1 / (va + vb + vc), vv = vb * den, ww = vc * den; rx = ax + abx * vv + acx * ww; ry = ay + aby * vv + acy * ww; rz = az + abz * vv + acz * ww; }
            }
          }
        }
      }
    }
    cp[0] = rx; cp[1] = ry; cp[2] = rz;
    return (rx - px) ** 2 + (ry - py) ** 2 + (rz - pz) ** 2;
  };
  // segment p->q against a triangle, double-sided (Moller-Trumbore); returns t in [0, 1] or -1
  const segTri = (v, b, px, py, pz, dx, dy, dz) => {
    const ax = v[b], ay = v[b + 1], az = v[b + 2];
    const e1x = v[b + 3] - ax, e1y = v[b + 4] - ay, e1z = v[b + 5] - az, e2x = v[b + 6] - ax, e2y = v[b + 7] - ay, e2z = v[b + 8] - az;
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < 1e-12) return -1;
    const f = 1 / a, sx = px - ax, sy = py - ay, sz = pz - az;
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = f * (dx * qx + dy * qy + dz * qz);
    if (w < 0 || u + w > 1) return -1;
    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    return t >= 0 && t <= 1 ? t : -1;
  };
  let qstamp = 1;
  const stampS = { a: new Uint32Array(1 << 16) }, stampD = { a: new Uint32Array(1 << 16) };
  const grow = (sp, n) => { if (sp.a.length < n) { const b = new Uint32Array(Math.max(n, sp.a.length * 2)); sp.a = b; } };
  // nearest drawn triangle within R of p over both soups; crossing of segment (p0 -> p)
  const query = (soup, sp, valid, p, p0, R, best, cross) => {
    grow(sp, soup.n);
    const i0 = Math.floor((p[0] - R) / CELL), i1 = Math.floor((p[0] + R) / CELL), j0 = Math.floor((p[1] - R) / CELL), j1 = Math.floor((p[1] + R) / CELL), k0 = Math.floor((p[2] - R) / CELL), k1 = Math.floor((p[2] + R) / CELL);
    const v = soup.v;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const L = soup.grid.get(ck(i, j, k));
      if (!L) continue;
      for (const n of L) {
        if (sp.a[n] === qstamp) continue;
        sp.a[n] = qstamp;
        if (!valid(n)) continue;
        const d2 = closest(v, n * 9, p[0], p[1], p[2]);
        if (d2 < best.d2) { best.d2 = d2; best.tri = n; best.soup = soup; best.pt = [cp[0], cp[1], cp[2]]; }
        if (p0) {
          const t = segTri(v, n * 9, p0[0], p0[1], p0[2], p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]);
          if (t >= 0) cross.push({ soup, tri: n, t });
        }
      }
    }
  };
  const lonlat = (x, z) => [+(x / M_LON + LON0).toFixed(6), +(-z / M_LAT + LAT0).toFixed(6)];
  const triDesc = (soup, n) => { const O = objs[soup.o[n]]; return { obj: O.d.name, type: O.d.type, mat: O.d.mat, geo: O.d.geo, ud: O.d.ud, inst: soup.k[n] }; };
  // ---------------- vehicles: drawn bodies ----------------
  const vehBoxes = () => {
    const tr = window.__gtRefs?.traffic, F = tr?.fleet24;
    if (!F || !F.groups) return [];
    const out = [];
    const boxOf = (sets) => {
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (const s of sets || []) for (const m of s.meshes || []) {
        const g = m.geometry; if (!g?.attributes?.position) continue;
        const b = gbox(g);
        x0 = Math.min(x0, b.min.x); x1 = Math.max(x1, b.max.x); y0 = Math.min(y0, b.min.y); y1 = Math.max(y1, b.max.y); z0 = Math.min(z0, b.min.z); z1 = Math.max(z1, b.max.z);
      }
      return x0 < x1 ? [x0, y0, z0, x1, y1, z1] : null;
    };
    const byIdx = new Map();
    for (const c of tr.cars) byIdx.set(c.kind + ':' + c.idx, c);
    for (const G of F.groups) {
      if (!G._clrBox) { G._clrBox = boxOf(G.sets.slice(0, 1)); G._clrRear = G.rsets?.length ? boxOf(G.rsets.slice(0, 1)) : null; }
      const B = G._clrBox, RB = G._clrRear, P = G.P, src = P.mb, n = src.count, A = src.instanceMatrix.array, S = G.state, R = G.K.rear;
      if (!B) continue;
      for (let i = 0; i < n; i++) {
        const o = i * 16;
        if (A[o] === 0 && A[o + 5] === 0 && A[o + 10] === 0) continue;
        const x = A[o + 12], y = A[o + 13], z = A[o + 14];
        const fl = Math.hypot(A[o + 8], A[o + 10]) || 1, fx = A[o + 8] / fl, fz = A[o + 10] / fl;
        const rl = Math.hypot(A[o], A[o + 2]) || 1, rx = A[o] / rl, rz = A[o + 2] / rl;
        const car = G.moving ? byIdx.get(G.kind + ':' + i) : null;
        const id = `${G.moving ? '' : 'parked '}${G.kind}#${i}`;
        // front body: local box centre through the matrix (plan), half extents along its own axes
        const lcx = (B[0] + B[3]) / 2, lcz = (B[2] + B[5]) / 2;
        out.push({ id, kind: G.kind, moving: G.moving, part: 'body', car, cx: x + rx * lcx + fx * lcz, cz: z + rz * lcx + fz * lcz, ax: [rx, rz], az: [fx, fz], hw: (B[3] - B[0]) / 2, hl: (B[5] - B[2]) / 2, y0: y + B[1], y1: y + B[4], px: x, pz: z, yaw: Math.atan2(fx, fz) });
        if (R && RB) {
          // the bend as fleet24 draws it (a parked one stands straight)
          let art = 0;
          if (S && i < S.cap) {
            const yaw = Math.atan2(A[o + 8], A[o + 10]);
            const hx = x + fx * R.pivot[2], hz = z + fz * R.pivot[2];
            let da = Math.atan2(hx - S.rx[i], hz - S.rz[i]) - yaw;
            da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
            art = Math.max(-0.75, Math.min(0.75, da));
          }
          // rear = front x T(pivot) Ry(art) T(-pivot): its axes are the front's turned by art about the pivot
          const c = Math.cos(art), sn = Math.sin(art);
          const r2x = c * rx - sn * fx, r2z = c * rz - sn * fz, f2x = sn * rx + c * fx, f2z = sn * rz + c * fz;
          const pvx = x + rx * R.pivot[0] + fx * R.pivot[2], pvz = z + rz * R.pivot[0] + fz * R.pivot[2];
          const lrx = (RB[0] + RB[3]) / 2 - R.pivot[0], lrz = (RB[2] + RB[5]) / 2 - R.pivot[2];
          out.push({ id, kind: G.kind, moving: G.moving, part: 'rear', car, cx: pvx + r2x * lrx + f2x * lrz, cz: pvz + r2z * lrx + f2z * lrz, ax: [r2x, r2z], az: [f2x, f2z], hw: (RB[3] - RB[0]) / 2, hl: (RB[5] - RB[2]) / 2, y0: y + RB[1], y1: y + RB[4], px: x, pz: z, yaw: Math.atan2(f2x, f2z) });
        }
      }
    }
    return out;
  };
  // separating axes in plan: the penetration depth (> 0 overlap) of two oriented boxes
  const obbDepth = (A, B) => {
    const dx = B.cx - A.cx, dz = B.cz - A.cz;
    let depth = 1e9;
    for (const [ux, uz] of [A.ax, A.az, B.ax, B.az]) {
      const ra = A.hw * Math.abs(A.ax[0] * ux + A.ax[1] * uz) + A.hl * Math.abs(A.az[0] * ux + A.az[1] * uz);
      const rb = B.hw * Math.abs(B.ax[0] * ux + B.ax[1] * uz) + B.hl * Math.abs(B.az[0] * ux + B.az[1] * uz);
      const d = ra + rb - Math.abs(dx * ux + dz * uz);
      if (d <= 0) return d;
      depth = Math.min(depth, d);
    }
    return depth;
  };
  const inView = (x, y, z, r) => {
    const cam = E.camera;
    cam.updateMatrixWorld();
    const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    return fr.intersectsSphere(new T.Sphere(new T.Vector3(x, y, z), r));
  };
  const vehOverlaps = () => {
    const tr = window.__gtRefs?.traffic;
    const L = vehBoxes(), out = [];
    const cam = E.camera.position;
    const grid = new Map();
    L.forEach((b, i) => { const k = Math.floor(b.cx / 16) * 65536 + Math.floor(b.cz / 16); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); });
    for (let i = 0; i < L.length; i++) {
      const A = L[i];
      if (!A.moving) continue;
      const gx = Math.floor(A.cx / 16), gz = Math.floor(A.cz / 16);
      for (let a = gx - 1; a <= gx + 1; a++) for (let c = gz - 1; c <= gz + 1; c++) for (const j of grid.get(a * 65536 + c) || []) {
        const B = L[j];
        if (j === i || B.id === A.id || (B.moving && j < i)) continue;
        if (Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) <= 0) continue;
        const d = obbDepth(A, B);
        if (d <= 0.05) continue;
        // the sim's own boxes (carHalf, centred on the pose) for the same pair
        let simD = null;
        if (tr && A.car && (B.car || !B.moving)) {
          const ha = tr.carHalf(A.car), hb = B.car ? tr.carHalf(B.car) : [B.hw, B.hl];
          const sa = { cx: A.px, cz: A.pz, ax: [Math.cos(A.yaw), -Math.sin(A.yaw)], az: [Math.sin(A.yaw), Math.cos(A.yaw)], hw: ha[0], hl: ha[1] };
          const sb = B.car ? { cx: B.px, cz: B.pz, ax: [Math.cos(B.yaw), -Math.sin(B.yaw)], az: [Math.sin(B.yaw), Math.cos(B.yaw)], hw: hb[0], hl: hb[1] } : B;
          simD = +obbDepth(sa, sb).toFixed(2);
        }
        const mx = (A.cx + B.cx) / 2, mz = (A.cz + B.cz) / 2, my = (Math.max(A.y0, B.y0) + Math.min(A.y1, B.y1)) / 2;
        const dist = Math.hypot(mx - cam.x, mz - cam.z);
        const rel = (() => { const ux = B.cx - A.cx, uz = B.cz - A.cz; const al = ux * A.az[0] + uz * A.az[1]; return al > 0 ? 'B ahead of A' : 'B behind A'; })();
        // (VF36: a dead car, or a moving slot no live car owns, is still drawn)
        const vfTag = (X) => (X.moving ? (X.car ? (X.car.dead ? ' dead' : '') : ' no-live-car') : '');
        out.push({ a: `${A.id}${A.part === 'rear' ? ' (rear body)' : ''}${A.car?.turn ? ' turning' : ''}${vfTag(A)}`, b: `${B.id}${B.part === 'rear' ? ' (rear body)' : ''}${B.car?.turn ? ' turning' : ''}${vfTag(B)}`,
          depth: +d.toFixed(2), simDepth: simD, rel, at: [+mx.toFixed(1), +my.toFixed(1), +mz.toFixed(1)], ll: lonlat(mx, mz), dist: +dist.toFixed(0), inView: dist < 400 && inView(mx, my, mz, 1.5),
          va: A.car ? +(A.car.v || 0).toFixed(1) : 0, vb: B.car ? +(B.car.v || 0).toFixed(1) : 0,
          sizeA: [+(A.hw * 2).toFixed(2), +(A.hl * 2).toFixed(2)], sizeB: [+(B.hw * 2).toFixed(2), +(B.hl * 2).toFixed(2)], screen: null });
      }
    }
    // screen positions for the stills
    for (const r of out) if (r.inView) { const v = new T.Vector3(r.at[0], r.at[1], r.at[2]).project(E.camera); r.screen = [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4)]; }
    return out;
  };
  // ---------------- the take ----------------
  const poseAt = (t, g, lg) => {
    const u = easeEnds(Math.min(1, Math.max(0, t / st.dur)), st.ease);
    const p = st.curve.getPointAt(u), l = st.lcurve.getPointAt(Math.min(1, u + st.la));
    const x = p.x, y = p.y + (st.abs ? 0 : g), z = p.z;
    const ly = l.y + (st.abs ? 0 : lg);
    const dx = l.x - x, dy = ly - y, dz = l.z - z, hor = Math.hypot(dx, dz) || 1e-6;
    return { x, y, z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, hor) };
  };
  const begin = async (P, cfg) => {
    await getThree();
    const pts = P.keys.map((k) => { const [x, z] = project(k.p[0], k.p[1]); return new T.Vector3(x, k.p[2], z); });
    const lks = P.keys.map((k) => { const s = k.look || k.p; const [x, z] = project(s[0], s[1]); return new T.Vector3(x, k.look ? k.look[2] : k.p[2], z); });
    st = {
      P, cfg, curve: new T.CatmullRomCurve3(pts, false, 'catmullrom', P.tension ?? 0.5), lcurve: new T.CatmullRomCurve3(lks, false, 'catmullrom', P.tension ?? 0.5),
      dur: P.duration || 12, ease: P.ease ?? 0.14, la: P.lookAhead ?? 0, abs: !!P.abs, fps: cfg.fps, nF: Math.round(P.duration * cfg.fps),
      soup: mkSoup(), frames: [], steps: [], maxDev: 0, devAt: -1,
    };
    // a new take extracts every static mesh again into its own soup (an earlier take's corridor was elsewhere)
    for (const O of objs) { O.ver = ''; O.rev++; }
    custom.clear(); skipped.clear();
    // the per-frame terrain low-pass exactly as PathCam (dt = 0 frames hold it), then the steps between frames
    let g = null, lg = null;
    for (let i = 0; i < st.nF; i++) {
      const t = i / st.fps, dt = i ? 1 / st.fps : 0;
      const u = easeEnds(Math.min(1, Math.max(0, t / st.dur)), st.ease);
      const p = st.curve.getPointAt(u), l = st.lcurve.getPointAt(Math.min(1, u + st.la));
      if (!st.abs) { g = groundAt(p.x, p.z, g, dt); lg = groundAt(l.x, l.z, lg, dt); }
      st.frames.push({ t, g: st.abs ? 0 : (g ?? 0), lg: st.abs ? 0 : (lg ?? g ?? 0) });
    }
    const all = [];
    for (let i = 0; i < st.nF; i++) {
      const F = st.frames[i];
      const steps = [];
      if (i === 0) steps.push({ t: 0, ...poseAt(0, F.g, F.lg) });
      else {
        const F0 = st.frames[i - 1], a = poseAt(F0.t, F0.g, F0.lg), b = poseAt(F.t, F.g, F.lg);
        const N = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / cfg.step));
        for (let k = 1; k <= N; k++) { const s = k / N; steps.push({ t: F0.t + s / st.fps, ...poseAt(F0.t + s / st.fps, F0.g + (F.g - F0.g) * s, F0.lg + (F.lg - F0.lg) * s) }); }
      }
      st.steps.push(steps);
      for (const q of steps) all.push([q.x, q.y, q.z]);
    }
    markCorr(all, cfg.radius + 0.15);
    let len = 0; for (let i = 1; i < all.length; i++) len += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1], all[i][2] - all[i - 1][2]);
    st.len = len; st.prev = null;
    // the tallest drawn vehicle (fleet24 kinds' heights): a lens lower than this + 0.6 m over a roadway can meet one in
    // another take of the same path (the traffic is not seeded), whatever this run's traffic did
    st.vehTop = 0;
    try { for (const K of Object.values(window.__gtRefs?.traffic?.fleet24?.kinds || {})) if (K?.size) st.vehTop = Math.max(st.vehTop, K.size[1]); } catch {}
    if (!st.vehTop) st.vehTop = 4.0;
    st.road = { n: 0, min: 99, at: null };
    return { frames: st.nF, steps: all.length, len: +len.toFixed(1), cells: corr.set.size, maxStep: +Math.max(...st.steps.slice(1).map((s) => { let m = 0; for (let k = 1; k < s.length; k++) m = Math.max(m, Math.hypot(s[k].x - s[k - 1].x, s[k].y - s[k - 1].y, s[k].z - s[k - 1].z)); return m; }), 0).toFixed(3) };
  };
  const frame = (i, wantVeh) => {
    const cfg = st.cfg, R = cfg.radius, steps = st.steps[i];
    const cam = E.camera;
    // the replica against the page's own camera at this frame
    const last = steps[steps.length - 1];
    const dev = Math.hypot(cam.position.x - last.x, cam.position.y - last.y, cam.position.z - last.z);
    if (dev > st.maxDev) { st.maxDev = dev; st.devAt = i; }
    // this frame's corridor: the steps since the last frame (and the last frame's pose)
    const fpts = steps.map((q) => [q.x, q.y, q.z]);
    if (st.prev) fpts.push([st.prev.x, st.prev.y, st.prev.z]);
    const fset = { set: new Set(), x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
    {
      const save = { set: corr.set, x0: corr.x0, y0: corr.y0, z0: corr.z0, x1: corr.x1, y1: corr.y1, z1: corr.z1 };
      corr.set = new Set(); markCorr(fpts, R + 0.15); Object.assign(fset, corr); Object.assign(corr, save);
    }
    const t0 = performance.now();
    const C = collect(i, fset);
    const t1 = performance.now();
    const vis = C.vis;
    const validS = (n) => vis.has(st.soup.o[n]) && st.soup.r[n] === objs[st.soup.o[n]].rev;
    const validD = () => true;
    const tanV = Math.tan((cam.fov * Math.PI) / 360), tanH = tanV * cam.aspect, near = cam.near;
    const rec = { i, t: +(i / st.fps).toFixed(3), dev: +dev.toFixed(3), min: 9, minAt: null, minObj: null, cut: false, cross: [], below: [], tris: [st.soup.n, C.dyn.n], ms: [+(t1 - t0).toFixed(0), 0] };
    let prev = st.prev;
    for (const q of steps) {
      const p = [q.x, q.y, q.z], p0 = prev ? [prev.x, prev.y, prev.z] : null;
      const best = { d2: R * R, tri: -1, soup: null, pt: null }, cross = [];
      qstamp++;
      query(st.soup, stampS, validS, p, p0, R, best, cross);
      query(C.dyn, stampD, validD, p, p0, R, best, cross);
      const d = best.tri >= 0 ? Math.sqrt(best.d2) : 9;
      // the nearest point in the lens's frame: inside the near plane's cut?
      let cut = false, scr = null;
      if (best.pt) {
        const cy = Math.cos(q.yaw), sy = Math.sin(q.yaw), cpi = Math.cos(q.pitch), spi = Math.sin(q.pitch);
        const fwd = [-sy * cpi, spi, -cy * cpi], right = [cy, 0, -sy], up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
        const dx = best.pt[0] - q.x, dy = best.pt[1] - q.y, dz = best.pt[2] - q.z;
        const zc = dx * fwd[0] + dy * fwd[1] + dz * fwd[2], xc = dx * right[0] + dy * right[1] + dz * right[2], yc = dx * up[0] + dy * up[1] + dz * up[2];
        cut = zc > -0.05 && zc < near && Math.abs(xc) <= Math.max(zc, near) * tanH + 0.05 && Math.abs(yc) <= Math.max(zc, near) * tanV + 0.05;
        if (zc > 0.05) scr = [+(0.5 + xc / (zc * tanH) / 2).toFixed(4), +(0.5 - yc / (zc * tanV) / 2).toFixed(4)];
      }
      if (d < rec.min) { rec.min = +d.toFixed(3); rec.minAt = { t: +q.t.toFixed(4), p: p.map((v) => +v.toFixed(2)), ll: lonlat(q.x, q.z), pt: best.pt?.map((v) => +v.toFixed(2)), scr, ...(best.soup ? triDesc(best.soup, best.tri) : {}) }; }
      if (cut) rec.cut = true;
      for (const c of cross) rec.cross.push({ t: +(q.t - (1 - c.t) * (q.t - (prev ? prev.t : q.t))).toFixed(4), p: p.map((v) => +v.toFixed(2)), ll: lonlat(q.x, q.z), ...triDesc(c.soup, c.tri) });
      if (d < cfg.min) rec.below.push(+q.t.toFixed(4));
      // low over a roadway (or within 1 m of one): the margin over the tallest vehicle
      if (S.roadAt) {
        const onRoad = S.roadAt(q.x, q.z, 1.0);
        if (onRoad) {
          const sy = S.surfaceAt ? S.surfaceAt(q.x, q.z) : null, gy = sy !== null && sy !== undefined && isFinite(sy) ? sy : S.terrainAt(q.x, q.z);
          const m = q.y - (gy ?? q.y) - st.vehTop;
          if (m < 0.6) { st.road.n++; if (m < st.road.min) { st.road.min = +m.toFixed(2); st.road.at = { t: +q.t.toFixed(3), ll: lonlat(q.x, q.z), h: +(q.y - (gy ?? q.y)).toFixed(2) }; } }
        }
      }
      prev = q;
    }
    st.prev = prev;
    rec.cross = rec.cross.slice(0, 6);
    rec.ms[1] = +(performance.now() - t1).toFixed(0);
    rec.pos = [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)];
    if (wantVeh) rec.veh = vehOverlaps();
    // TN38: every moving vehicle with a wheel hub or its body centre on a non-road surface (traffic.js offRoad), in view or not
    if (wantVeh) {
      const L = window.__CAR_OFFROAD ? window.__CAR_OFFROAD(true) : null;
      rec.off = (L || []).map((c) => { const v = new T.Vector3(c.x, c.y + 0.8, c.z).project(E.camera); return { ...c, ll: lonlat(c.x, c.z), screen: c.vis ? [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4)] : null }; });
    }
    return rec;
  };
  const survey = (R = 60) => {
    const c = E.camera.position, types = {}, near = [], cust = {}, batched = [];
    E.scene.traverseVisible((o) => {
      const t = o.isInstancedMesh ? 'InstancedMesh' : o.isBatchedMesh ? 'BatchedMesh' : o.isSkinnedMesh ? 'SkinnedMesh' : o.isMesh ? (o.geometry?.isInstancedBufferGeometry ? 'customInstanced' : 'Mesh') : o.type;
      types[t] = (types[t] || 0) + 1;
      if (t === 'customInstanced') cust[o.name || o.parent?.name || '?'] = o.geometry.instanceCount;
      if (t === 'BatchedMesh') batched.push(o.name);
      if (!o.geometry?.attributes?.position) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const s = g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
      const d = s.center.distanceTo(c) - s.radius;
      if (d < R && !o.isInstancedMesh) near.push({ n: descOf(o).name.slice(0, 70), t, tris: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3), r: +s.radius.toFixed(0), d: +d.toFixed(0) });
      if (o.isInstancedMesh && o.count > 0) {
        // instances of this mesh whose world bounding sphere comes within R of the lens
        const A = o.instanceMatrix.array, e = o.matrixWorld.elements, gs = g.boundingSphere;
        let k = 0, dmin = 1e9;
        for (let i = 0; i < o.count; i++) {
          for (let q = 0; q < 16; q++) IM[q] = A[i * 16 + q];
          mul(e, IM, MM);
          const x = MM[0] * gs.center.x + MM[4] * gs.center.y + MM[8] * gs.center.z + MM[12], y = MM[1] * gs.center.x + MM[5] * gs.center.y + MM[9] * gs.center.z + MM[13], z = MM[2] * gs.center.x + MM[6] * gs.center.y + MM[10] * gs.center.z + MM[14];
          const sc = Math.hypot(MM[0], MM[1], MM[2]);
          const dd = Math.hypot(x - c.x, y - c.y, z - c.z) - gs.radius * sc;
          if (dd < R) { k++; if (dd < dmin) { dmin = dd; o._clrNear = [MM[12], MM[13], MM[14]]; } }
        }
        if (k) near.push({ n: descOf(o).name.slice(0, 70), t, inst: k + '/' + o.count, tris: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3), d: +dmin.toFixed(1), solid: solid(o), layers: o.layers.test(E.camera.layers), nearest: o._clrNear ? [...o._clrNear.map((v) => +v.toFixed(2)), ...lonlat(o._clrNear[0], o._clrNear[2])] : null });
      }
    });
    near.sort((a, b) => b.tris - a.tris);
    return { cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), types, custom: cust, batched, near: near.slice(0, 40) };
  };
  const find = (re) => {
    const rx = new RegExp(re, 'i'), out = [];
    E.scene.traverse((o) => {
      if (!o.isMesh || !rx.test(descOf(o).name)) return;
      const g = o.geometry; if (!g?.attributes?.position) return;
      const b = gbox(g).clone().applyMatrix4(o.matrixWorld);
      out.push({ n: descOf(o).name.slice(0, 80), vis: o.visible, c: [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2].map((v) => +v.toFixed(1)), ll: lonlat((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2), size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(1)), y: [+b.min.y.toFixed(1), +b.max.y.toFixed(1)] });
    });
    return out.slice(0, 60);
  };
  // which objects (and their triangles) lie within r of a world point now (the bad-key check and debugging)
  const near = (x, y, z, r = 2) => {
    const fset = { set: new Set() };
    const save = { set: corr.set, x0: corr.x0, y0: corr.y0, z0: corr.z0, x1: corr.x1, y1: corr.y1, z1: corr.z1 };
    corr.set = new Set(); markCorr([[x, y, z]], r); Object.assign(fset, corr); Object.assign(corr, save);
    const s = mkSoup(), out = new Map();
    E.scene.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || !solid(o) || (o.geometry.isInstancedBufferGeometry && !o.isInstancedMesh)) return;
      const oi = objIndex(o), e = o.matrixWorld.elements;
      if (o.isInstancedMesh) { const A = o.instanceMatrix.array; for (let k = 0; k < o.count; k++) { for (let q = 0; q < 16; q++) IM[q] = A[k * 16 + q]; mul(e, IM, MM); if (boxHitsCorr(gbox(o.geometry), MM, fset)) { const n = addGeo(s, fset, o.geometry, MM, oi, k, 0); if (n) out.set(objs[oi].d.name + ' #' + k, n); } } return; }
      if (boxHitsCorr(gbox(o.geometry), e, fset)) { const n = addGeo(s, fset, o.geometry, e, oi, -1, 0); if (n) out.set(objs[oi].d.name, n); }
    });
    return [...out.entries()].slice(0, 30);
  };
  const info = () => ({ custom: Object.fromEntries(custom), skipped: Object.fromEntries(skipped), maxDev: +((st?.maxDev) || 0).toFixed(3), devAt: st?.devAt, len: st ? +st.len.toFixed(1) : 0, staticTris: st?.soup.n || 0, road: st?.road || null, vehTop: st?.vehTop || 0 });
  window.__CLR = { begin, frame, survey, find, near, info, project, lonlat };
  return 'installed';
}

// ---- stills ------------------------------------------------------------------------------------------------------------
const still = async (page, file, marks, caption) => {
  const dataUrl = await page.evaluate(() => window.__capture('image/jpeg', 0.9)).catch(() => null);
  if (!dataUrl) return false;
  const img = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const w = 1280, h = Math.round((w * H) / W);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    marks.filter((m) => m && m.scr).map((m) => `<circle cx="${(m.scr[0] * w).toFixed(0)}" cy="${(m.scr[1] * h).toFixed(0)}" r="${m.r || 22}" fill="none" stroke="${m.col || '#ff2a2a'}" stroke-width="4"/>`).join('') +
    `<rect x="0" y="${h - 34}" width="${w}" height="34" fill="black" fill-opacity="0.6"/><text x="10" y="${h - 11}" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#fff">${caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 150)}</text></svg>`;
  await sharp(img).resize(w, h).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 86 }).toFile(file);
  return true;
};

// ---- run -----------------------------------------------------------------------------------------------------------------
const report = { when: new Date().toString(), spec: path.relative(root, specFile), step: STEP, radius: RADIUS, min: MINC, size: `${W}x${H}`, flags: BASE_FLAGS, shots: {} };
let anyFail = false;
try {
  for (const g of groups.values()) {
    const first = g.takes[0];
    const [sx, sz] = project(first.spec.keys[0].p[0], first.spec.keys[0].p[1]);
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    let guardW = null;
    try { guardW = watchPage(page, { label: `clearance ${g.time}` }); } catch {}
    await page.routeWebSocket('**', () => {}).catch(() => {});
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 250)); });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 300)));
    const q = `?shot=1&record=1&${BASE_FLAGS}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(first.spec.keys[0].p[2] + 40).toFixed(1)}&time=${g.time}${g.flags ? '&' + g.flags : ''}`;
    const url = `http://127.0.0.1:${port}/${q}`;
    console.log(`\n=== GROUP ${g.time}${g.flags ? ' ' + g.flags : ''} (${g.takes.length} take(s)) ${stamp()}\n    ${url}`);
    let booted = false;
    for (let a = 0; a < 3 && !booted; a++) {
      if (a) { console.log(`    boot retry ${a}: ${[...new Set(errors)].slice(0, 2).join(' | ')}`); errors.length = 0; await sleep(30000); }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch((e) => console.log('    goto:', e.message.split('\n')[0]));
      booted = await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: bootMs }).then(() => true).catch(() => false);
    }
    if (!booted) { console.log('    FAILED: page never reached record mode'); for (const t of g.takes) report.shots[t.name] = { error: 'boot failed' }; anyFail = true; guardW?.stop(); await page.close(); continue; }
    console.log(`    booted ${stamp()}: ${await page.evaluate(pageLib)}`);
    for (const take of g.takes) {
      const P = take.spec, t0 = Date.now();
      console.log(`\n  -- ${take.name} (${take.time}): ${P.title || ''}`);
      await page.evaluate((p) => window.__SET_PATH(p), holdOf(P));
      await page.evaluate(() => window.__advance(0));
      await settleWorld(page, bootMs);
      if (SURVEY) {
        const sv = await page.evaluate(() => window.__CLR.survey(60));
        console.log(JSON.stringify(sv, null, 1));
        const fv = await page.evaluate((re) => window.__CLR.find(re), opt('find', 'viaduct|arch|rsd|riverside|w125w'));
        console.log('find:', JSON.stringify(fv, null, 0).slice(0, 6000));
        report.shots[take.name] = { survey: sv, find: fv };
        continue;
      }
      // FP26 pre-stream of the whole path (record.mjs does it when the flags carry filmlod=1)
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
      let cleared = 0;
      if (P.clearTrees) cleared = await page.evaluate(([p, r]) => window.__CLEAR_TREES?.(p, r) ?? -1, [P.keys.map((k) => project(k.p[0], k.p[1])), P.clearTrees]);
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
      const B = await page.evaluate(([p, c]) => window.__CLR.begin(p, c), [P, { fps: FPS, step: STEP, radius: RADIUS, min: P.minClear ?? MINC }]);
      console.log(`     ready in ${((Date.now() - t0) / 1000).toFixed(0)}s (warm ${warm}, cars ${s2?.cars}, peds ${s2?.peds ?? '-'}${P.clearTrees ? `, clearTrees ${P.clearTrees} m hid ${cleared} tree parts` : ''}): ${B.frames} frames, ${B.steps} steps (max ${B.maxStep} m), path ${B.len} m, corridor ${B.cells} cells`);
      const minC = P.minClear ?? MINC;
      const frames = [], vehAll = [], offAll = [];   // offAll: TN38 off-road vehicles per frame
      let nStill = 0;
      const tw = Date.now();
      const f0 = FR ? FR[0] : 0, f1 = FR ? Math.min(FR[1], B.frames - 1) : B.frames - 1;
      for (let i = 0; i <= f1; i++) {
        if (i > 0) await page.evaluate((d) => window.__advance(d), 1 / FPS);
        if (i < f0) continue;
        const r = await page.evaluate(([i, v]) => window.__CLR.frame(i, v), [i, VEH]);
        frames.push(r);
        const bad = r.cross.length || r.min < minC;
        if (r.veh?.length) for (const v of r.veh) vehAll.push({ frame: i, t: r.t, ...v });
        if (r.off?.length) for (const v of r.off) offAll.push({ frame: i, t: r.t, ...v });
        // TN38: a still at the first frame of each run with a vehicle off the carriageway in view
        if (r.off?.some((v) => v.vis) && nStill < MAXSTILL && !(frames.length > 1 && frames[frames.length - 2].off?.some((v) => v.vis))) {
          nStill++;
          const vis = r.off.filter((v) => v.vis);
          await still(page, path.join(outDir, 'stills', `${take.name}_f${String(i).padStart(3, '0')}_OFFROAD.jpg`), vis.map((v) => ({ scr: v.screen, col: '#ff3030', r: 34 })),
            `${take.name} f${i} t=${r.t}s off the carriageway: ${vis.map((v) => `${v.id}${v.turn ? ' turning' : ''} ${v.hits.join(', ')} ${v.dist} m`).join('; ')}`).catch((e) => console.log('     still failed', e.message));
        }
        if ((bad || r.veh?.some((v) => v.inView && v.depth > 0.15)) && nStill < MAXSTILL) {
          const prevBad = frames.length > 1 && (frames[frames.length - 2].cross.length || frames[frames.length - 2].min < minC);
          const vehNew = r.veh?.some((v) => v.inView && v.depth > 0.15) && !(frames.length > 1 && frames[frames.length - 2].veh?.some((v) => v.inView && v.depth > 0.15));
          if ((bad && !prevBad) || vehNew) {
            nStill++;
            const what = r.cross.length ? 'CROSS' : bad ? 'CLOSE' : 'VEH';
            const m = r.minAt || {};
            const cap = bad ? `${take.name} f${i} t=${r.t}s ${what} ${r.cross.length ? r.cross[0].obj : m.obj} min ${r.min} m` : `${take.name} f${i} t=${r.t}s vehicles: ${r.veh.filter((v) => v.inView).map((v) => `${v.a} x ${v.b} ${v.depth} m`).join('; ')}`;
            const marks = bad ? [{ scr: m.scr }] : r.veh.filter((v) => v.inView).map((v) => ({ scr: v.screen, col: '#ffd400', r: 30 }));
            await still(page, path.join(outDir, 'stills', `${take.name}_f${String(i).padStart(3, '0')}_${what}.jpg`), marks, cap).catch((e) => console.log('     still failed', e.message));
          }
        }
        if (SHEET && (i === 0 || i === Math.floor(B.frames / 2) || i === B.frames - 1)) {
          await fs.mkdir(path.join(outDir, 'sheet'), { recursive: true });
          const du = await page.evaluate(() => window.__capture('image/jpeg', 0.92)).catch(() => null);
          if (du) await sharp(Buffer.from(du.slice(du.indexOf(',') + 1), 'base64')).jpeg({ quality: 92 }).toFile(path.join(outDir, 'sheet', `${take.name}_f${String(i).padStart(3, '0')}.jpg`));   // full resolution, for review
        }
        if (i % 30 === 0 || i === f1) console.log(`     ${i + 1}/${B.frames} t=${r.t}s min ${r.min} m (${r.minAt?.obj?.slice(0, 50) || '-'})${r.cross.length ? ' CROSSED ' + r.cross[0].obj : ''} replica ${r.dev} m tris ${r.tris.join('+')} [${r.ms.join('+')} ms]${r.veh?.length ? ` veh-overlaps ${r.veh.length}` : ''}  ${((Date.now() - tw) / 1000).toFixed(0)}s`);
      }
      const inf = await page.evaluate(() => window.__CLR.info());
      // failing ranges (by frame), each with its nearest object
      const ranges = [];
      for (const r of frames) {
        const bad = r.cross.length > 0 || r.min < minC;
        if (!bad) continue;
        const L = ranges[ranges.length - 1];
        if (L && L.f1 === r.i - 1) { L.f1 = r.i; L.t1 = r.t; if (r.min < L.min) { L.min = r.min; L.at = r.minAt; } if (r.cross.length && !L.cross) L.cross = r.cross[0]; if (r.cut) L.cut = true; }
        else ranges.push({ f0: r.i, f1: r.i, t0: r.t, t1: r.t, min: r.min, at: r.minAt, cross: r.cross[0] || null, cut: r.cut });
      }
      const worst = frames.reduce((a, r) => (r.min < a.min ? r : a), { min: 9 });
      const vin = vehAll.filter((v) => v.inView);
      const res = {
        title: P.title, act: P.act, time: take.time, frames: frames.length, len: B.len, steps: B.steps, maxStep: B.maxStep,
        minClear: minC, closeWhy: P.closeWhy || null, clearTrees: P.clearTrees || 0,
        min: worst.min, minFrame: worst.i, minAt: worst.minAt || null,
        crossed: frames.filter((r) => r.cross.length).length, cutFrames: frames.filter((r) => r.cut).length,
        fail: ranges.map((x) => ({ frames: `${x.f0}-${x.f1}`, t: `${x.t0}-${x.t1}s`, min: x.min, cut: x.cut, cross: x.cross ? `${x.cross.obj} (${x.cross.type}, ${x.cross.mat}${x.cross.inst >= 0 ? ', instance ' + x.cross.inst : ''})` : null, nearest: x.at ? `${x.at.obj} (${x.at.type}, ${x.at.mat}${x.at.inst >= 0 ? ', instance ' + x.at.inst : ''}${x.at.ud ? '; ' + x.at.ud : ''})` : null, ll: x.at?.ll })),
        replicaMaxDev: inf.maxDev, replicaDevFrame: inf.devAt, notAudited: inf.custom, skippedTypes: inf.skipped,
        roadRisk: inf.road && inf.road.n ? { steps: inf.road.n, margin: inf.road.min, at: inf.road.at, tallest: +inf.vehTop.toFixed(2) } : null,
        vehicles: { frames: new Set(vehAll.map((v) => v.frame)).size, inViewFrames: new Set(vin.map((v) => v.frame)).size, maxDepth: vehAll.reduce((a, v) => Math.max(a, v.depth), 0),
          // in view and at least 0.15 m deep (a few centimetres of contact hundreds of metres out does not read)
          visibleFrames: new Set(vin.filter((v) => v.depth >= 0.15).map((v) => v.frame)).size, maxInView: vin.reduce((a, v) => Math.max(a, v.depth), 0),
          cases: (() => { const m = new Map(); for (const v of vehAll) { const k = v.a + ' x ' + v.b; const c = m.get(k); if (!c) m.set(k, { pair: k, f0: v.frame, f1: v.frame, depth: v.depth, simDepth: v.simDepth, rel: v.rel, inView: v.inView, at: v.at, ll: v.ll, dist: v.dist, va: v.va, vb: v.vb, sizeA: v.sizeA, sizeB: v.sizeB }); else { c.f1 = v.frame; if (v.depth > c.depth) Object.assign(c, { depth: v.depth, simDepth: v.simDepth, at: v.at, ll: v.ll, dist: v.dist, va: v.va, vb: v.vb }); c.inView = c.inView || v.inView; } } return [...m.values()].sort((a, b) => (b.inView - a.inView) || (b.depth - a.depth)); })() },
        // TN38: vehicles with a wheel or their centre on a non-road surface (sidewalk, median, planting bed, plaza)
        offroad: (() => {
          const vin = offAll.filter((v) => v.vis), m = new Map();
          for (const v of offAll) { const c = m.get(v.id); if (!c) m.set(v.id, { id: v.id, f0: v.frame, f1: v.frame, n: 1, inView: v.vis, turn: v.turn, dead: v.dead, hits: v.hits, dist: v.dist, ll: v.ll, e: v.e, from: v.from }); else { c.f1 = v.frame; c.n++; c.inView = c.inView || v.vis; if (v.hits.length > c.hits.length) Object.assign(c, { hits: v.hits, dist: v.dist, ll: v.ll, turn: v.turn }); } }
          // out of view, a turning vehicle within 700 m counts too: a connector is the sim's own geometry (a vehicle on an edge
          // out of view is listed only: the street graph and the surfaces disagree there, data rather than control)
          // in view, within 400 m: further out a wheel over a kerb is under a pixel (2560 px across a 58 deg lens: 3.2 px a
          // metre at 400 m); those are listed (inViewFrames) but do not fail the shot
          const turnNear = offAll.filter((v) => !v.vis && v.turn && v.dist <= 700), vin4 = vin.filter((v) => v.dist <= 400);
          return { frames: new Set(offAll.map((v) => v.frame)).size, inViewFrames: new Set(vin.map((v) => v.frame)).size, inView400Frames: new Set(vin4.map((v) => v.frame)).size, turningNearFrames: new Set(turnNear.map((v) => v.frame)).size,
            cases: [...m.values()].sort((a, b) => (b.inView - a.inView) || (b.n - a.n)) };
        })(),
        secs: Math.round((Date.now() - t0) / 1000),
      };
      // VF36 (VEHFIX 2026-10-02): a pair of vehicle bodies overlapping 0.15 m or more in view fails the shot too (the 13:00
      // audit listed "mini#2 x boxtruck#2 depth 0.54 m IN VIEW" on all 108 frames of t8StNickDiveE and passed it); --novehicles
      res.vehFail = VEH && res.vehicles.visibleFrames > 0;
      // TN38 (owner 2026-10-04 on t8LenoxDive: a van turning over a median's nose): a vehicle's wheel or centre on a
      // non-road surface in view within 400 m, in any frame, fails the shot too, and so does a turning one out of view within 700 m
      // (--novehicles skips it with the overlaps)
      res.offFail = VEH && (res.offroad.inView400Frames > 0 || res.offroad.turningNearFrames > 0);
      res.pass = !ranges.length && !res.vehFail && !res.offFail;
      if (!res.pass) anyFail = true;
      report.shots[take.name] = res;
      console.log(`     ${res.pass ? 'PASS' : 'FAIL'}${res.vehFail ? ' (vehicles in view)' : ''}${res.offFail ? ' (vehicle off the carriageway)' : ''} ${take.name}: min clearance ${res.min >= 9 ? 'over ' + RADIUS : res.min} m${res.min < 9 ? ` at f${res.minFrame} (${res.minAt?.obj || '-'})` : ''}, crossed ${res.crossed} frame(s), ${ranges.length} failing range(s); replica max ${res.replicaMaxDev} m; vehicle overlaps in ${res.vehicles.frames} frame(s) (${res.vehicles.inViewFrames} in view, max ${res.vehicles.maxDepth.toFixed(2)} m); ${res.secs}s`);
      if (res.roadRisk) console.log(`        WARN low over a roadway: ${res.roadRisk.steps} steps under the tallest vehicle (${res.roadRisk.tallest} m) + 0.6 m, the lens ${res.roadRisk.at.h} m over the road at t=${res.roadRisk.at.t}s (${res.roadRisk.at.ll.join(',')}): another take's traffic can meet the lens there`);
      for (const f of res.fail.slice(0, 8)) console.log(`        frames ${f.frames} (${f.t}) min ${f.min} m${f.cut ? ' CUT' : ''}${f.cross ? ' CROSSED ' + f.cross : ''} nearest ${f.nearest}`);
      for (const c of res.vehicles.cases.slice(0, 6)) console.log(`        vehicles f${c.f0}-${c.f1}: ${c.pair} depth ${c.depth} m (sim box ${c.simDepth}) ${c.rel} ${c.inView ? 'IN VIEW' : 'off view'} ${c.dist} m away at ${c.ll.join(',')}`);
      console.log(`        off the carriageway: ${res.offroad.frames} frame(s), ${res.offroad.inViewFrames} in view (${res.offroad.inView400Frames} within 400 m), ${res.offroad.turningNearFrames} with a turning vehicle out of view within 700 m`); for (const c of res.offroad.cases.slice(0, 6)) console.log(`        off-road f${c.f0}-${c.f1} (${c.n}): ${c.id}${c.turn ? ' turning' : ''}${c.dead ? ' dead' : ''} ${c.hits.join(', ')} ${c.inView ? 'IN VIEW' : 'off view'} ${c.dist} m away at ${c.ll.join(',')} (edge ${c.e}${c.from !== null ? ' from ' + c.from : ''})`);
      await page.evaluate(() => window.__DRESS_HOLD?.(null));
      await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
    }
    const uniq = [...new Set(errors)];
    if (uniq.length) { console.log('    PAGE ERRORS:'); for (const e of uniq.slice(0, 6)) console.log('      ' + e); }
    guardW?.stop();
    await page.close();
  }
} finally {
  await browser.close();
  releaseGpu();
  if (server) server.kill();
}
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
const lines = [`clearance audit ${report.when}`, `spec ${report.spec}; step ${STEP} m, radius ${RADIUS} m, threshold ${MINC} m (or the shot's minClear)`, ''];
for (const [n, r] of Object.entries(report.shots)) {
  if (r.error || r.survey) { lines.push(`${n}: ${r.error || 'survey'}`); continue; }
  lines.push(`${r.pass ? 'PASS' : 'FAIL'}${r.vehFail ? ' (vehicles in view)' : ''}${r.offFail ? ' (vehicle off the carriageway)' : ''} ${n.padEnd(16)} min ${r.min >= 9 ? '>1.5' : String(r.min).padEnd(6)} m${r.min < 9 ? ` at f${r.minFrame} (${r.minAt?.obj || '-'})` : ''}  crossed ${r.crossed}  threshold ${r.minClear}${r.closeWhy ? ' (' + r.closeWhy + ')' : ''}  replica ${r.replicaMaxDev} m  path ${r.len} m / ${r.steps} steps  vehicles: ${r.vehicles.frames} frames (${r.vehicles.inViewFrames} in view, ${r.vehicles.visibleFrames} in view >= 0.15 m deep, max in view ${(r.vehicles.maxInView || 0).toFixed(2)} m)`);
  if (r.roadRisk) lines.push(`     WARN low over a roadway: ${r.roadRisk.steps} steps, the lens ${r.roadRisk.at.h} m over the road at t=${r.roadRisk.at.t}s (${r.roadRisk.at.ll.join(',')}), tallest vehicle ${r.roadRisk.tallest} m`);
  for (const f of r.fail) lines.push(`     frames ${f.frames} (${f.t}) min ${f.min} m${f.cut ? ' CUT' : ''}${f.cross ? ' CROSSED ' + f.cross : ''} nearest ${f.nearest} at ${f.ll?.join(',')}`);
  for (const c of r.vehicles.cases.slice(0, 10)) lines.push(`     vehicles f${c.f0}-${c.f1}: ${c.pair} depth ${c.depth} m (sim box ${c.simDepth}) ${c.rel} ${c.inView ? 'IN VIEW' : 'off view'} ${c.dist} m from the lens at ${c.ll.join(',')} v ${c.va}/${c.vb} m/s sizes ${c.sizeA.join('x')} / ${c.sizeB.join('x')}`);
  if (r.offroad) { lines.push(`     off the carriageway (TN38): ${r.offroad.frames} frames (${r.offroad.inViewFrames} in view, ${r.offroad.inView400Frames} of them within 400 m; ${r.offroad.turningNearFrames} with a turning vehicle out of view within 700 m)`); for (const c of r.offroad.cases.slice(0, 10)) lines.push(`     off-road f${c.f0}-${c.f1} (${c.n} frames): ${c.id}${c.turn ? ' turning' : ''}${c.dead ? ' dead' : ''} ${c.hits.join(', ')} ${c.inView ? 'IN VIEW' : 'off view'} ${c.dist} m from the lens at ${c.ll.join(',')} (edge ${c.e}${c.from !== null ? ', from ' + c.from : ''})`); }
  if (Object.keys(r.notAudited || {}).length) lines.push(`     not audited (custom instancing): ${Object.keys(r.notAudited).join(', ')}`);
}
await fs.writeFile(path.join(outDir, 'report.txt'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
process.exit(anyFail ? 3 : 0);
