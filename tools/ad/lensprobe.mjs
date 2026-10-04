// film 7 diagnostic: boot record mode at one take's key 0 (like record.mjs), warm, then report
//  (a) walkers near the lens and what the crowd draws, (b) for every low take's keys: nearest traffic edge,
//  the lens's signed lateral offset from its centreline, lane centres, nearest walk edge offsets. + a capture.
//   node tools/ad/lensprobe.mjs <shot> [--port 5577] [--warm 300] [--size 1600x900] [--trace N] [--walk N] [--igpu] [--out file.png]
//   (needs a running Vite: NYC_NOHMR=1 node boundlessjs/node_modules/vite/bin/vite.js --port 5577)
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SPEC = JSON.parse(await fs.readFile(path.join(root, 'tools/ad/shots.json'), 'utf8'));
const name = args[0];
const P = SPEC.shots[name] || SPEC.probes?.[name];
const port = opt('port', '5577'), warm = Number(opt('warm', '300'));
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const flags = opt('flags', SPEC._meta.flags);
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const xz = (p) => [(p[0] - LON0) * M_LON, -(p[1] - LAT0) * M_LAT];
const [sx, sz] = xz(P.keys[0].p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the recorder's GPU (the RTX: --force_high_performance_gpu); --igpu runs on the Intel iGPU instead, as the first probes did
const browser = await chromium.launch({ args: [(process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=vulkan'), '--enable-gpu', '--ignore-gpu-blocklist', ...(args.includes('--igpu') ? [] : ['--force_high_performance_gpu']), '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e + '\n' + (e.stack || '').slice(0, 600)));
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
console.log('settled', ((Date.now() - t0) / 1000).toFixed(0) + 's');
await page.evaluate(() => window.__PEDS_RESET?.());   // as record.mjs does
await page.evaluate(() => window.__SPAWNGUARD?.(false));
// --trace N: every N warm frames, where are the walkers relative to the lens?
const traceN = Number(opt('trace', '0'));
const trace = () => page.evaluate(() => {
  const peds = window.__gtRefs.peds, [cx, , cz] = window.__RECSTAT().pos, M = peds.mesh.instanceMatrix.array;
  let n20 = 0, n40 = 0, camp = 0, campNear = 0, cross = 0, stand = 0, wait = 0;
  for (const p of peds.peds) {
    const o = p.idx * 16, d = Math.hypot(M[o + 12] - cx, M[o + 14] - cz);
    if (d < 20) n20++; if (d < 40) n40++;
    if (p.e && p.e.campus) { camp++; if (d < 40) campNear++; }
    if (p.cross) cross++; if (p.stand > 0) stand++; if (p.waiting) wait++;
  }
  const edges = peds.walkEdges.length, campE = peds.walkEdges.filter((e) => e.campus).length;
  return { n: peds.peds.length, n20, n40, camp, campNear, cross, stand, wait, edges, campE, todo: peds._campusTodo ? peds._campusTodo.length : 0, nearClose: peds._nearClose, near: peds._near ? peds._near.length : -1 };
});
for (let i = 0; i < warm; i++) {
  if (traceN && i % traceN === 0) console.log('trace', i, JSON.stringify(await trace()));
  await page.evaluate(() => window.__advance(1 / 30));
}
if (traceN) console.log('trace', warm, JSON.stringify(await trace()));
await page.evaluate((p) => window.__SET_PATH(p), P);
await page.evaluate(() => window.__advance(0));
await page.evaluate(() => window.__advance(0));
// --walk N: then run the TAKE itself for N frames (spawn guard on, as record.mjs does) before reporting
const walkN = Number(opt('walk', '0'));
if (walkN > 0) { await page.evaluate(() => window.__SPAWNGUARD?.(true)); for (let i = 0; i < walkN; i++) await page.evaluate(() => window.__advance(1 / 30)); }

// every low take's keys, in world metres
const LOW = {};
for (const [k, S] of Object.entries({ ...SPEC.shots, ...SPEC.probes })) {
  if (!S.keys || S.keys[0].p[2] > 8) continue;
  LOW[k] = S.keys.map((q) => [...xz(q.p), q.p[2]]);
}
const rep = await page.evaluate((LOW) => {
  const G = window.__gtRefs || {};
  const peds = G.peds, traffic = G.traffic, rig = peds?.rig;
  const s = window.__RECSTAT();
  const [cx, cy, cz] = s.pos;
  const out = { cam: s.pos, peds: peds?.peds?.length, cars: s.cars };
  // (a) walkers near the lens
  if (peds) {
    const M = peds.mesh.instanceMatrix.array, near = [];
    let zero = 0;
    for (const p of peds.peds) {
      const o = p.idx * 16;
      if (M[o] === 0 && M[o + 5] === 0 && M[o + 10] === 0) { zero++; continue; }
      const d = Math.hypot(M[o + 12] - cx, M[o + 14] - cz);
      if (d < 45) near.push([+d.toFixed(1), +M[o + 12].toFixed(1), +M[o + 13].toFixed(2), +M[o + 14].toFixed(1), p.cross ? 'X' : p.waiting ? 'W' : p.stand > 0 ? 'S' : '']);
    }
    near.sort((a, b) => a[0] - b[0]);
    out.pedsZeroMatrix = zero; out.pedsWithin45 = near.length; out.nearest = near.slice(0, 12);
    out.meshCount = peds.mesh.count;
  }
  if (rig) {
    out.crowdStats = JSON.parse(JSON.stringify(rig.stats));
    let drawn = 0, inst = 0, hidden = 0;
    for (const set of rig.sets.values()) for (const r of set.main) for (const m of r.meshes) { if (m.count > 0) { if (m.visible) { drawn++; inst += m.count; } else hidden++; } }
    out.drawSets = { drawn, inst, hiddenWithCount: hidden };
    out.passes = Object.fromEntries(Object.entries(rig.passes).map(([k, P]) => [k, P.rows]));
    out.variantsNeg = (() => { let n = 0; for (let i = 0; i < peds.mesh.count; i++) if (rig.st.variant[i] < 0) n++; return n; })();
    out.rigN = rig.n ?? rig.count ?? null;
    out.extMat = rig.extMat;
    // GPU side: did the crowd's texture arrays and pose targets make it onto the card?
    const R = rig.engine.renderer, gl = R.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
    out.gl = { err: gl.getError(), lost: gl.isContextLost(), mem: { ...R.info.memory }, calls: R.info.render.calls, tris: R.info.render.triangles, draw: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
    const up = (t) => (t ? !!R.properties.get(t).__webglTexture : null);
    out.arrays = Object.fromEntries(Object.entries(rig.A.arrays || {}).map(([k, t]) => [k, { up: up(t), v: t.version, w: t.image?.width, h: t.image?.height, d: t.image?.depth, mips: t.mipmaps?.length }]));
    out.passTex = Object.fromEntries(Object.entries(rig.passes).map(([k, P]) => [k, { inst: up(P.instTex), rt: up(P.rt?.texture) }]));
    const progs = {};
    for (const set of rig.sets.values()) for (const r of set.main) for (const m of r.meshes) {
      if (!m.count) continue;
      const mp = R.properties.get(m.material), pr = mp.currentProgram;
      const k = (m.material.name || m.material.type) + (pr ? (pr.diagnostics && pr.diagnostics.runnable === false ? ':BROKEN' : ':ok') : ':noprog');
      progs[k] = (progs[k] || 0) + 1;
    }
    out.progs = progs;
  }
  // (b) lens vs lanes / walk edges
  const segDist = (px, pz, pts) => {
    let best = { d: 1e9 };
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i];
      const dx = B[0] - A[0], dz = B[2] - A[2], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - A[0]) * dx + (pz - A[2]) * dz) / L2));
      const qx = A[0] + dx * t, qz = A[2] + dz * t, d = Math.hypot(px - qx, pz - qz);
      if (d < best.d) { const L = Math.sqrt(L2); best = { d, side: Math.sign(dx * (pz - A[2]) - dz * (px - A[0])) || 1, ux: dx / L, uz: dz / L }; }
    }
    return best;
  };
  // roads the walkers could use around the lens (peds.js: rclass <= 2 sidewalks both sides, rclass 5 paths on the line)
  const ST = window.__STREAMER;
  if (ST && ST.tiles) {
    const rs = [];
    for (const t of ST.tiles.values()) for (const r of (t && t.data && t.data.roads) || []) {
      let dm = 1e9;
      for (const p of r.pts) dm = Math.min(dm, Math.hypot(p[0] - cx, p[2] - cz));
      if (dm < 70) rs.push({ d: +dm.toFixed(1), rclass: r.rclass, w: +(r.width || 0).toFixed(1), level: r.level, noTraffic: !!r.noTraffic, n: r.pts.length, len: +r.pts.reduce((L, p, i, A) => L + (i ? Math.hypot(p[0] - A[i - 1][0], p[2] - A[i - 1][2]) : 0), 0).toFixed(0) });
    }
    out.roadsNear = rs.sort((x, y) => x.d - y.d).slice(0, 14);
  }
  out.lens = {};
  for (const [k, keys] of Object.entries(LOW)) {
    out.lens[k] = keys.map(([x, z, alt]) => {
      const r = { alt };
      if (traffic) {
        let best = null;
        for (const e of traffic.edges.values()) {
          const b = segDist(x, z, e.pts);
          if (!best || b.d < best.b.d) best = { e, b };
        }
        if (best && best.b.d < 30) {
          const e = best.e;
          const usable = Math.max(3, e.width - (e.park >= 2 ? 4.6 : e.park ? 2.3 : 0) - 0.6);
          const laneW = Math.min(3.4, usable / Math.max(1, e.lanes));
          const perDir = e.oneway !== 0 ? e.lanes : Math.max(1, Math.floor(e.lanes / 2));
          const centres = e.oneway !== 0 ? [...Array(e.lanes)].map((_, l) => +((l - (e.lanes - 1) / 2) * laneW).toFixed(2)) : [...Array(perDir)].map((_, l) => +((0.5 + l) * laneW).toFixed(2));
          r.edge = { id: e.id, rclass: e.rclass, width: e.width, lanes: e.lanes, oneway: e.oneway, park: e.park, laneW: +laneW.toFixed(2), laneCentres: centres };
          r.lateral = +(best.b.d * best.b.side).toFixed(2);   // signed offset of the lens from the edge centreline (+ = left of the edge direction)
        }
      }
      if (peds) {
        const ws = [];
        for (const e of peds.walkEdges) { if (e.dead || !e.pts) continue; const b = segDist(x, z, e.pts); if (b.d < 12) ws.push(+(b.d * b.side).toFixed(2)); }
        r.walk = ws.sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 4);
      }
      return r;
    });
  }
  return out;
}, LOW);
console.log(JSON.stringify({ ...rep, lens: undefined }, null, 0));
for (const [k, v] of Object.entries(rep.lens)) console.log(k.padEnd(14), JSON.stringify(v));
const out = path.resolve(root, opt('out', `boundlessjs/shots/ad/probe/lens_${name}.png`));
const dataUrl = await page.evaluate(() => window.__capture('image/png', 1));
await fs.writeFile(out, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
console.log('wrote', out);
for (const l of logs.filter((l) => /crowd|peds|PAGEERROR|error|warn/i.test(l)).slice(0, 20)) console.log('  ' + l);
await browser.close();
