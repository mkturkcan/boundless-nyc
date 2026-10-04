// FLOAT PROBE (film 8, 2026-09-24): find walkers and walk edges standing far above the ground under them. Boots a shot
// at key 0 on a RUNNING dev server, settles, resets the crowd, warms 90 frames, reports bad edges and floating walkers,
// then flies the real path for 75 frames and reports any walker > 2.5 m off the ground or within 60 m of the lens.
// Made for the walker that floated near the lens in the grouped golden run's mLowAerial (frames kept in
// boundlessjs/shots/ad/clips/_mLowAerial_floater/). A fresh page did not reproduce it: suspect state carried over
// from the takes recorded before it in the same page.
//   node tools/ad/floatprobe.mjs <shot> --port <vite port>
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SPEC = JSON.parse(await fs.readFile(path.join(here, 'shots.json'), 'utf8'));
const P = SPEC.shots[args[0]];
const port = opt('port', '5611');
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const [sx, sz] = [(P.keys[0].p[0] - LON0) * M_LON, -(P.keys[0].p[1] - LAT0) * M_LAT];
const browser = await chromium.launch({ args: [(process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--window-size=960,540'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const url = `http://127.0.0.1:${port}/?shot=1&record=1&${SPEC._meta.flags}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(P.keys[0].p[2] + 40).toFixed(1)}&time=${P.time || 'day'}`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: 240000 });
const hold = { duration: 1e6, ease: 0, keys: [P.keys[0], { p: [P.keys[0].p[0] + 1e-6, P.keys[0].p[1] + 1e-6, P.keys[0].p[2]], look: P.keys[0].look }] };
await page.evaluate((p) => window.__SET_PATH(p), hold);
const t0 = Date.now();
let quiet = 0, last = '';
while (Date.now() - t0 < 200000) {
  await page.evaluate(() => window.__advance(0));
  const s = await page.evaluate(() => window.__RECSTAT());
  const key = `${s.near}|${s.macro}|${s.dressActive}`;
  quiet = s.idle && s.dressQ === 0 && key === last ? quiet + 1 : 0; last = key;
  if (quiet >= 8 && Date.now() - t0 > 9000) break;
  await new Promise((r) => setTimeout(r, 180));
}
await page.evaluate(() => window.__PEDS_RESET?.());
for (let i = 0; i < 90; i++) await page.evaluate(() => window.__advance(1 / 30));
const rep = await page.evaluate(() => {
  const peds = window.__gtRefs.peds, S = peds.streamer;
  const g = (x, z) => { const a = S.surfaceAt(x, z); return a !== null ? a : S.terrainAt(x, z); };
  const edges = [];
  for (const e of peds.walkEdges) {
    let worst = 0, at = null;
    for (const q of e.pts) { const gy = g(q[0], q[2]); if (gy === null) continue; const d = q[1] - gy; if (Math.abs(d) > Math.abs(worst)) { worst = d; at = [q[0], q[1], q[2], gy]; } }
    if (Math.abs(worst) > 2) edges.push({ campus: !!e.campus, narrow: !!e.narrow, len: +e.len.toFixed(1), worst: +worst.toFixed(2), at: at.map((v) => +v.toFixed(2)), n: e.pts.length });
  }
  const M = peds.mesh.instanceMatrix.array, walkers = [];
  for (let i = 0; i < peds.peds.length; i++) {
    const o = i * 16, x = M[o + 12], y = M[o + 13], z = M[o + 14], gy = g(x, z);
    if (gy === null) continue;
    if (y - gy > 2 || y - gy < -2) { const p = peds.peds[i]; walkers.push({ i, pos: [x, y, z].map((v) => +v.toFixed(1)), ground: +gy.toFixed(2), campus: !!p.e?.campus, cross: !!p.cross, stand: p.stand || 0, eLen: p.e ? +p.e.len.toFixed(1) : null }); }
  }
  return { nEdges: peds.walkEdges.length, badEdges: edges.slice(0, 20), nBadEdges: edges.length, nPeds: peds.peds.length, floating: walkers.slice(0, 20), nFloating: walkers.length, cam: window.__RECSTAT().pos };
});
console.log(JSON.stringify(rep, null, 1));
// now fly the real path and scan for walkers far off the ground or near the lens, every 3 frames
await page.evaluate(() => window.__SPAWNGUARD?.(true));
await page.evaluate((p) => window.__SET_PATH(p), P);
for (let f = 0; f < 75; f++) {
  await page.evaluate(() => window.__advance(1 / 30));
  if (f % 3) continue;
  const r = await page.evaluate((f) => {
    const peds = window.__gtRefs.peds, S = peds.streamer, cam = window.__RECSTAT().pos;
    const g = (x, z) => { const a = S.surfaceAt(x, z); return a !== null ? a : S.terrainAt(x, z); };
    const M = peds.mesh.instanceMatrix.array, out = [];
    for (let i = 0; i < peds.mesh.count; i++) {
      const o = i * 16, x = M[o + 12], y = M[o + 13], z = M[o + 14];
      const gy = g(x, z), dc = Math.hypot(x - cam[0], y - cam[1], z - cam[2]);
      if ((gy !== null && Math.abs(y - gy) > 2.5) || dc < 60) { const p = peds.peds[i] || {}; out.push({ i, pos: [x, y, z].map((v) => +v.toFixed(1)), ground: gy === null ? null : +gy.toFixed(1), dCam: +dc.toFixed(1), campus: !!p.e?.campus, cross: !!p.cross, stand: p.stand || 0, d: p.d !== undefined ? +p.d.toFixed(1) : null, eLen: p.e ? +p.e.len.toFixed(1) : null, eY: p.e ? [Math.min(...p.e.pts.map((q) => q[1])), Math.max(...p.e.pts.map((q) => q[1]))].map((v) => +v.toFixed(1)) : null }); }
    }
    return { f, cam: cam.map((v) => +v.toFixed(1)), count: peds.mesh.count, hits: out.slice(0, 6) };
  }, f);
  if (r.hits.length) console.log(JSON.stringify(r));
}
console.log('path scan done');
await browser.close();
