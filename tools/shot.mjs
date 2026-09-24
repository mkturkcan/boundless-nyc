// Screenshot harness: boots the static server + headless Chromium, renders the
// requested views, saves PNGs. Usage:
//   node tools/shot.mjs --out screenshots/round-001 --views aerial,street,facade
//   node tools/shot.mjs --type tenement --seed 3 --views hero,front,detail
//   node tools/shot.mjs --bench            (runs fps benchmark, prints JSON)
// Extra: --time golden|noon|morning|overcast|night  --seed N --size 1920x1080
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : def;
};

// random default port so parallel runs don't collide
const PORT = Number(opt('port', String(8300 + Math.floor(Math.random() * 4000))));
const outDir = path.resolve(root, opt('out', 'screenshots/adhoc'));
const views = (opt('views', 'aerial')).split(',');
const type = opt('type');
const cars = opt('cars');
const seed = opt('seed', '1');
const time = opt('time', 'golden');
const bench = opt('bench') === '1';
const commercial = opt('commercial');
const stories = opt('stories');
const width = opt('width');
const [W, H] = (opt('size', '1760x990')).split('x').map(Number);

// --- start server -----------------------------------------------------------
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(PORT)], {
  stdio: 'ignore', detached: false,
});
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
    '--enable-webgl', '--disable-software-rasterizer',
    '--force_high_performance_gpu',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await fs.mkdir(outDir, { recursive: true });
  const meta = { time, seed, type, shots: [], errors };

  if (bench) {
    const url = `http://127.0.0.1:${PORT}/?bench=1&time=${time}&seed=${seed}${type ? `&type=${type}` : ''}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction('window.__BENCH_RESULT', null, { timeout: 40000 });
    const result = await page.evaluate('window.__BENCH_RESULT');
    console.log(JSON.stringify({ bench: result, errors }, null, 2));
  } else {
    for (const v of views) {
      const q = new URLSearchParams({ shot: '1', view: v, time, seed });
      if (type) q.set('type', type);
      if (cars) q.set('cars', '1');
      if (opt('ao')) q.set('ao', opt('ao'));
      if (commercial) q.set('commercial', commercial);
      if (stories) q.set('stories', stories);
      if (width) q.set('width', width);
      const url = `http://127.0.0.1:${PORT}/?${q}`;
      await page.goto(url, { waitUntil: 'load' });
      try {
        await page.waitForFunction('window.__SHOT_READY', null, { timeout: 90000 });
      } catch {
        errors.push(`view ${v}: __SHOT_READY timeout`);
      }
      await page.waitForTimeout(250);
      const name = `${type ? type + '-' : cars ? 'cars-' : ''}${v}-${time}-s${seed}.png`;
      await page.screenshot({ path: path.join(outDir, name) });
      const info = await page.evaluate(`(() => ({
        gpu: window.__APP ? window.__APP.gpuName() : 'n/a',
        calls: window.__APP ? window.__APP.renderer.info.render.calls : -1,
        tris: window.__APP ? window.__APP.renderer.info.render.triangles : -1,
      }))()`).catch(() => ({}));
      meta.shots.push({ view: v, file: name, ...info });
      console.log(`shot ${name}  calls=${info.calls} tris=${info.tris} gpu=${info.gpu}`);
    }
    await fs.writeFile(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));
    if (errors.length) {
      console.log('PAGE ERRORS:');
      for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 500));
    }
  }
} finally {
  await browser.close();
  server.kill();
}
