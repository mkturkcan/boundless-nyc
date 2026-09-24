// ad-hoc GPU shot: node tools/lshot.mjs --lon -73.9585 --lat 40.8075 --y 30 --yaw 1.2 --pitch -0.4 --time day --label morningside --out boundlessjs/shots/lead [--flags k=v&k2=v2] [--node "dx,dz,dy,pitch"]
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
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const x = (Number(opt('lon')) - LON0) * M_LON, z = -(Number(opt('lat')) - LAT0) * M_LAT;
const y = Number(opt('y', '20')), yaw = Number(opt('yaw', '0')), pitch = Number(opt('pitch', '-0.3'));
const time = opt('time', 'day'), label = opt('label', 'shot'), extra = opt('flags', ''), nodeSnap = opt('node');
const outDir = path.resolve(root, opt('out', 'boundlessjs/shots/lead'));
// take the GPU lock BEFORE spawning Vite: a queued shot used to hold a dev server
// (and soon a Chromium) while waiting, and four jobs waiting at once paged the
// machine
const releaseGpu = await acquireGpu(process.argv.slice(2).join(" ").slice(0, 60)); // one renderer at a time
const port = String(5800 + Math.floor(Math.random() * 1500));
const server = spawn(process.execPath, [path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--window-size=1760,990'] });
await fs.mkdir(outDir, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1760, height: 990 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const url = `http://127.0.0.1:${port}/?shot=1&rel=1&x=${x}&y=${y}&z=${z}&yaw=${yaw}&pitch=${pitch}&time=${time}${extra ? '&' + extra : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try { await page.waitForFunction('window.__READY === true', { timeout: 90000 }); } catch { console.log('READY timeout'); }
  // the WORLD must exist before the frame is trusted: READY and the dresser can
  // both fire on an empty scene (critic round 2: 35 % of frames were open water
  // or the splash screen and looked plausible as thumbnails)
  let worldOk = true;
  try { await page.waitForFunction('(function(){ const s = window.__STREAMER; if (!s || !s.tiles) return false; if (typeof s.readyUnder === "function") return s.readyUnder(); let n = 0; for (const t of s.tiles.values()) if (t && t.state === "ready") n++; return n >= 4; })()', { timeout: 120000 }); }
  catch { worldOk = false; console.log('INVALID FRAME: no tiles loaded after 120 s — file gets an _INVALID suffix, re-run it'); }
  if (nodeSnap) {
    const [dx, dz, dy, p] = nodeSnap.split(',').map(Number);
    const r = await page.evaluate(([a, b, c, d]) => window.__GOTO_NODE(a, b, c, d), [dx, dz, dy, p]).catch((e) => String(e));
    console.log('node snap:', JSON.stringify(r));
    await new Promise((s) => setTimeout(s, 4000));
  }
  try { await page.waitForFunction('!window.__DRESS || (function(){ const d = window.__DRESS(); return typeof d !== "object" || (d.queued === 0 && d.active > 0); })()', { timeout: 30000 }); } catch {}
  await new Promise((s) => setTimeout(s, 1500));
  const file = path.join(outDir, `${label}_${time}${worldOk ? '' : '_INVALID'}.png`);
  await page.screenshot({ path: file, timeout: 120000 });
      { const st = await fs.stat(file).catch(() => null); if (st && st.size === 290614 && !file.endsWith("_INVALID.png")) { const bad = file.replace(/.png$/, "_INVALID.png"); await fs.rename(file, bad).catch(() => {}); console.log("INVALID FRAME: splash plate (290614 bytes = HMR reload mid-shot) ->", bad); } }
  console.log('shot', path.relative(root, file), 'cam', Math.round(x), y, Math.round(z));
  if (errors.length) console.log('errs:', [...new Set(errors)].slice(0, 5).join(' | '));
} finally { await browser.close(); server.kill(); releaseGpu(); }
