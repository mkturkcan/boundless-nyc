// QA page: one guarded page on a GPU lane that takes commands from a folder, so a support audit and a camera sweep run
// in one boot instead of one boot per run (QA round 4, 2026-10-02).
//
//   GPU_LANE=23 timeout -k 30 3000 node tools/qa/qa_page.mjs --cmd <dir> --out <dir> --at cx,cz,alt,tx,tz,pitch
//        [--flags "hud=0&lmwait=150&vclear=3"] [--time day] [--size 1600x900] [--maxmin 48]
//
// Commands are JSON files dropped into --cmd (taken in name order; each is renamed *.done when finished, its result
// written to --out/<name>.out.json):
//   { "op": "eval", "file": "/path/audit.js", "arg": {...} }   the file's text is evaluated in the page (async-aware);
//                                                             `ARG` holds "arg"; the result is JSON-stringified
//   { "op": "view", "name": "v1", "cam": [cx, cz, alt, tx, tz, pitch, hfov], "dir": "<plates dir>", "settle": 3 }
//                                                             teleport as bshot --onepage does (alt over the ground under
//                                                             the lens), wait for the tiles, the dresser and the lens, write
//                                                             <dir>/<name>.jpg captured in the page
//   { "op": "time", "t": "night" }                             sky.apply(t) in the same page
//   { "op": "quit" }
// The page's console goes to --out/page.log. One renderer per lane (tools/gpulock.mjs), children killed on any way out
// (tools/harness_guard.mjs), a page that stops answering ends the run.
import { chromium } from 'playwright';
import { acquireGpu } from '../gpulock.mjs';
import { installGuard, watchPage } from '../harness_guard.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bdir = path.join(root, 'client');
const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : def; };
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
// the L() convention of tools/bshot.mjs: camera x, z, alt over the ground, target x, z, pitch -> { x, y, z, yaw, pitch }
const L = (cx, cz, alt, tx, tz, pitch = -0.1) => ({ x: cx, y: alt, z: cz, yaw: Math.atan2(-(tx - cx), -(tz - cz)), pitch });
const camOf = (c) => { if (Array.isArray(c)) { const o = L(...c.slice(0, 6)); if (c.length >= 7 && +c[6] > 0) o.hfov = +c[6]; return o; } return c; };

const CMD = path.resolve(opt('cmd', '/data0/projectnyc_aux/tmp/qa/r4/cmd'));
const OUT = path.resolve(opt('out', '/data0/projectnyc_aux/tmp/qa/r4/out'));
const flags = opt('flags', 'hud=0&lmwait=150&vclear=3');
const time = opt('time', 'day');
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const at = camOf(opt('at', '917,-3870,40,917,-3833,-0.5').split(',').map(Number));
const maxMin = Number(opt('maxmin', '48'));
await fs.mkdir(CMD, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
const logF = path.join(OUT, 'page.log');
const plog = (s) => fs.appendFile(logF, s + '\n').catch(() => {});
const say = (s) => { const t = new Date().toTimeString().slice(0, 8); console.log(`[qa_page ${t}] ${s}`); };

try { installGuard({ name: 'qa_page', maxMin }); } catch (e) { console.log('[qa_page] guard not installed:', e?.message || e); }
const releaseGpu = await acquireGpu('qa_page ' + CMD.slice(-30));
const port = String(5400 + Math.floor(Math.random() * 3000));
const server = spawn(process.execPath, [path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'],
  { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--js-flags=--max-old-space-size=16384', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`],
});
const sharp = createRequire(path.join(root, 'tools', 'assets', 'package.json'))('sharp');
let page = null, guardW = null;
try {
  page = await browser.newPage({ viewport: { width: W, height: H } });
  guardW = watchPage(page, { label: 'qa_page' });
  page.on('console', (m) => plog(`[${m.type()}] ${m.text().slice(0, 600)}`));
  page.on('pageerror', (e) => plog('PAGEERROR ' + String(e).slice(0, 600)));
  await page.addInitScript(() => {
    addEventListener('error', (e) => console.warn('[pageerr] ' + (e.error && e.error.stack ? e.error.stack : e.message)));
    addEventListener('unhandledrejection', (e) => { const r = e.reason; console.warn('[pagerej] ' + (r && r.stack ? r.stack : String(r))); });
  });
  const url = `http://127.0.0.1:${port}/?shot=1&rel=1&x=${at.x}&y=${at.y}&z=${at.z}&yaw=${at.yaw}&pitch=${at.pitch}&time=${time}&${flags}`;
  say('boot ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  try { await page.waitForFunction('window.__READY === true', undefined, { timeout: 150000 }); } catch { say('READY timeout, going on'); }
  try { await page.waitForFunction('(function(){ const s = window.__STREAMER; return !!(s && s.readyUnder && s.readyUnder()); })()', undefined, { timeout: 120000 }); } catch { say('tiles under the boot view not ready'); }
  say('ready');
  await fs.writeFile(path.join(OUT, 'READY'), new Date().toISOString());

  const doView = async (c) => {
    const p = camOf(c.cam);
    const t0 = Date.now();
    await page.evaluate(([x, y, z, yaw, pitch]) => window.__TELEPORT(x, y + 80, z, yaw, pitch), [p.x, p.y, p.z, p.yaw, p.pitch]);
    await new Promise((s) => setTimeout(s, 1500));
    try { await page.waitForFunction('(function(){ const s = window.__STREAMER; return !!(s && s.readyUnder && s.readyUnder()); })()', undefined, { timeout: 120000 }); } catch { say(c.name + ': tiles not ready after 120 s'); }
    const yAbs = await page.evaluate(([x, y, z, yaw, pitch, abs]) => {
      const S = window.__STREAMER, g0 = S && S.terrainAt ? S.terrainAt(x, z) : null;
      if (abs) { window.__TELEPORT(x, y, z, yaw, pitch); return y; }
      const si = g0 !== null && S.surfaceInfoAt ? S.surfaceInfoAt(x, z, 0.5) : null;
      const sy = si && isFinite(si.y) ? si.y - (si.road ? 0.145 : 0.28) : null;
      const g = sy !== null && sy - g0 <= 3 ? Math.max(g0, sy) : g0;
      const yy = (g === null || !isFinite(g) ? 0 : Math.max(g, 0.5)) + y;
      window.__TELEPORT(x, yy, z, yaw, pitch);
      return yy;
    }, [p.x, p.y, p.z, p.yaw, p.pitch, !!c.abs]);
    const vfov = p.hfov ? (2 * Math.atan(Math.tan((p.hfov * Math.PI) / 360) / (W / H)) * 180) / Math.PI : null;
    if (vfov) await page.evaluate((f) => { const cm = window.__ENGINE && window.__ENGINE.camera; if (cm) { cm.fov = f; cm.updateProjectionMatrix(); } }, vfov).catch(() => null);
    await new Promise((s) => setTimeout(s, (c.settle ?? 3) * 1000));
    try { await page.waitForFunction('!window.__DRESS || (function(){ const d = window.__DRESS(); return typeof d !== "object" || (d.queued === 0 && d.active > 0); })()', undefined, { timeout: 40000 }); } catch { say(c.name + ': dresser queue did not drain'); }
    await new Promise((s) => setTimeout(s, 1500));
    for (let k = 0; k < 30; k++) {
      const hit = await page.evaluate(() => (typeof window.__LENS_HIT === 'function' ? window.__LENS_HIT() : null)).catch(() => null);
      if (!hit) break;
      await new Promise((s) => setTimeout(s, 400));
    }
    const perf = await page.evaluate(() => (window.__PERF ? window.__PERF() : null)).catch(() => null);
    const dir = path.resolve(c.dir || OUT);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${c.name}.jpg`);
    const dataUrl = await page.evaluate(() => (typeof window.__capture === 'function' ? window.__capture('image/png') : null));
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
      await sharp(Buffer.from(dataUrl.slice(22), 'base64')).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
    } else {
      await page.screenshot({ path: file.replace(/\.jpg$/, '.png') });
    }
    return { file, y: yAbs, s: (Date.now() - t0) / 1000, perf };
  };

  let quit = false;
  while (!quit) {
    let names = [];
    try { names = (await fs.readdir(CMD)).filter((f) => f.endsWith('.json')).sort(); } catch {}
    if (!names.length) { await new Promise((s) => setTimeout(s, 500)); continue; }
    for (const n of names.slice(0, 1)) {   // one command per listing: a command dropped later with an earlier name goes first
      const f = path.join(CMD, n);
      let c;
      try { c = JSON.parse(await fs.readFile(f, 'utf8')); } catch (e) { await new Promise((s) => setTimeout(s, 300)); try { c = JSON.parse(await fs.readFile(f, 'utf8')); } catch { await fs.rename(f, f + '.bad').catch(() => {}); continue; } }
      const t0 = Date.now();
      let res;
      try {
        if (c.op === 'quit') { quit = true; res = 'bye'; }
        else if (c.op === 'time') res = await page.evaluate((t) => { window.__ENGINE.sky.apply(t); return t; }, c.t);
        else if (c.op === 'view') res = await doView(c);
        else if (c.op === 'eval') {
          const src = c.file ? await fs.readFile(c.file, 'utf8') : c.expr;
          res = await page.evaluate(async ([s, a]) => {
            try { window.ARG = a; let v = (0, eval)(s); if (v && typeof v.then === 'function') v = await v; return JSON.stringify(v); }
            catch (e) { return JSON.stringify({ ERR: String(e && e.stack || e) }); }
          }, [src, c.arg ?? null]);
          try { res = JSON.parse(res); } catch {}
        } else res = { ERR: 'unknown op ' + c.op };
      } catch (e) { res = { ERR: String(e).split('\n')[0] }; }
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      await fs.writeFile(path.join(OUT, n.replace(/\.json$/, '.out.json')), JSON.stringify(res));
      await fs.rename(f, f + '.done').catch(() => {});
      say(`${n} ${c.op}${c.name ? ' ' + c.name : ''} ${s} s`);
      if (quit) break;
    }
  }
} catch (e) {
  say('FAILED ' + String(e).split('\n')[0]);
} finally {
  try { guardW?.stop(); } catch {}
  try { await browser.close(); } catch {}
  releaseGpu();
  server.kill();
  say('end');
}
