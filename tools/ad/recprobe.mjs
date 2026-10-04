// Record-mode diagnostic (film, 2026-09-23): boot the page exactly as tools/ad/record.mjs does, put the camera on one
// shot's key 0, settle, warm the sim, then report where the walkers and cars are relative to the camera and what the
// crowd renderer draws — plus one captured frame.
//   node tools/ad/recprobe.mjs <shot> [--port 5577] [--warm 60] [--size 1600x900] [--flags "..."] [--out file.png]
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SPEC = JSON.parse(await fs.readFile(path.join(here, 'shots.json'), 'utf8'));
const name = args[0];
const P = SPEC.shots[name] || SPEC.probes?.[name];
if (!P) { console.log('unknown shot', name); process.exit(1); }
const port = opt('port', '5577'), warm = Number(opt('warm', '60'));
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const flags = opt('flags', SPEC._meta.flags);
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const [sx, sz] = [(P.keys[0].p[0] - LON0) * M_LON, -(P.keys[0].p[1] - LAT0) * M_LAT];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// --force_high_performance_gpu: the recorder's GPU. Without it Chromium picks the Intel iGPU, whose slow frames hid the
// stale walker spawn list the RTX exposed (sim/peds.js, film 7)
const browser = await chromium.launch({ args: [(process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 240)}`));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e));
const url = `http://127.0.0.1:${port}/?shot=1&record=1&${flags}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(P.keys[0].p[2] + 40).toFixed(1)}&time=${opt('time', P.time || (P.times || ['day'])[0])}${P.flags ? '&' + P.flags : ''}`;
console.log(url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('typeof window.__SET_PATH === "function"', null, { timeout: 240000 });
const hold = { duration: 1e6, ease: 0, abs: P.abs, tension: P.tension, keys: [P.keys[0], { p: [P.keys[0].p[0] + 1e-6, P.keys[0].p[1] + 1e-6, P.keys[0].p[2]], look: P.keys[0].look }] };
await page.evaluate((p) => window.__SET_PATH(p), hold);
const t0 = Date.now();
let quiet = 0, last = '';
while (Date.now() - t0 < 200000) {
  await page.evaluate(() => window.__advance(0));
  const s = await page.evaluate(() => window.__RECSTAT());
  const key = `${s.near}|${s.macro}|${s.dressActive}`;
  quiet = s.idle && s.dressQ === 0 && key === last ? quiet + 1 : 0; last = key;
  if (quiet >= 8 && Date.now() - t0 > 9000) break;
  await sleep(180);
}
const report = (tag) => page.evaluate((tag) => {
  const peds = window.__gtRefs?.peds, cam = window.__gtRefs ? null : null;
  const c = document.querySelector('canvas');
  const e = window.__ENGINE || null;
  const P = peds?.peds || [];
  const rig = peds?.rig;
  // camera from the storage mesh parent scene: take the recorder's pos
  const s = window.__RECSTAT();
  const [cx, cy, cz] = s.pos;
  const M = peds?.mesh?.instanceMatrix?.array;
  const bins = [0, 0, 0, 0, 0];
  let zero = 0;
  for (let i = 0; i < (peds?.mesh?.count || 0); i++) {
    const o = i * 16;
    if (M[o] === 0 && M[o + 5] === 0 && M[o + 10] === 0) { zero++; continue; }
    const d = Math.hypot(M[o + 12] - cx, M[o + 14] - cz);
    bins[d < 30 ? 0 : d < 60 ? 1 : d < 120 ? 2 : d < 260 ? 3 : 4]++;
  }
  let meshes = 0, drawn = 0, inst = 0;
  if (rig?.sets) for (const set of rig.sets.values()) for (const r of set.main) for (const m of r.meshes) { meshes++; if (m.visible && m.count > 0) { drawn++; inst += m.count; } }
  return { tag, cam: s.pos, peds: P.length, meshCount: peds?.mesh?.count, zeroMatrices: zero, distBins_30_60_120_260_far: bins, crowdStats: rig?.stats, renderMeshes: meshes, drawnMeshes: drawn, drawnInstances: inst, standing: P.filter((p) => p.stand > 0).length, crossing: P.filter((p) => p.cross).length, waiting: P.filter((p) => p.waiting).length, cars: s.cars };
}, tag);
console.log(JSON.stringify(await report('after settle')));
await page.evaluate(() => window.__PEDS_RESET?.());   // as record.mjs does
for (let i = 0; i < warm; i++) await page.evaluate(() => window.__advance(1 / 30));
await page.evaluate((p) => window.__SET_PATH(p), P);
await page.evaluate(() => window.__advance(0));
console.log(JSON.stringify(await report(`after warm ${warm}`)));
const out = path.resolve(root, opt('out', 'boundlessjs/shots/ad/probe/recprobe_' + name + '.png'));
const dataUrl = await page.evaluate(() => window.__capture('image/png', 1));
await fs.writeFile(out, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
console.log('wrote', out);
for (const l of logs.filter((l) => /crowd|peds|PAGEERROR|error/i.test(l)).slice(0, 12)) console.log('  ' + l);
await browser.close();
