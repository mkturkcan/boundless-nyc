// Smoke test of the in-page API bridge (boundlessjs/src/api/bridge.js) WITHOUT the Electron host: opens the app with
// ?api=1 in Playwright on the RTX and drives window.__API.call directly. Prints each step's result; writes a few
// sensor frames to --out.
//   node tools/api/smoke_bridge.mjs [--port 5690] [--out <dir>] [--size 1280x720]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bdir = path.join(root, 'boundlessjs');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const port = opt('port', String(5600 + Math.floor(Math.random() * 300)));
const out = path.resolve(opt('out', path.join(root, 'boundlessjs/shots/api_smoke')));
const [W, H] = opt('size', '1280x720').split('x').map(Number);
await fs.mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(bdir, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'],
  { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });
await sleep(6000);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (/\[api\]|error|Error/.test(t) && !/vite|WebSocket/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 400)));
  // W 120th St & Amsterdam Ave (tools/bshot.mjs amst120 views)
  const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
  const lon = -73.95905, lat = 40.80955;
  const x = (lon - LON0) * M_LON, z = -(lat - LAT0) * M_LAT;
  const url = `http://127.0.0.1:${port}/?api=1&hud=0&clean=1&life=0&x=${x.toFixed(1)}&z=${z.toFixed(1)}&y=60`;
  console.log(url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction('!!window.__API', null, { timeout: 300000 });
  const call = async (m, p = {}) => {
    const t0 = Date.now();
    const r = await page.evaluate(async ([m, p]) => { try { return { ok: await window.__API.call(m, p) }; } catch (e) { return { err: e.code + ': ' + e.message }; } }, [m, p]);
    const s = JSON.stringify(r.ok ?? r.err);
    console.log(`${m} (${Date.now() - t0} ms): ${s.length > 400 ? s.slice(0, 400) + '...' : s}`);
    if (r.err) throw new Error(r.err);
    return r.ok;
  };
  await call('server.info');
  const center = await call('geo.to_location', { lat, lon });
  await call('actor.set_transform', { id: 1, transform: { location: { x: center.x - 40, y: center.y - 40, z: 30 }, rotation: { pitch: -25, yaw: 45 } } });
  await call('world.wait_until_loaded', { timeout: 200 });
  const js = await call('map.get_junctions', { center, radius: 60 });
  const J = js[0];
  const sp = await call('map.get_spawn_points', { center: J.location, radius: 70, spacing: 25 });
  console.log('spawn points', sp.length);
  const bps = await call('world.get_blueprints');
  console.log('blueprints', bps.length, bps.slice(0, 3).map((b) => b.id).join(', '));
  const car = await call('world.spawn_actor', { blueprint: 'vehicle.suv', transform: sp[0] });
  const walker = await call('world.spawn_actor', { blueprint: 'walker.pedestrian.0020', transform: { location: { x: J.location.x + 9, y: J.location.y + 9, z: J.location.z }, rotation: { yaw: 180 } } });
  const aic = await call('world.spawn_actor', { blueprint: 'controller.ai.walker', attach_to: walker.id });
  await call('walker_ai.go_to_location', { id: aic.id, location: { x: J.location.x - 12, y: J.location.y + 10, z: 0 } });
  // cameras: an elevated view of the junction
  const camT = { location: { x: J.location.x - 30, y: J.location.y - 30, z: 14 }, rotation: { pitch: -18, yaw: 45 } };
  const sensors = {};
  for (const bp of ['sensor.camera.rgb', 'sensor.camera.semantic_segmentation', 'sensor.camera.instance_segmentation', 'sensor.camera.depth']) {
    const s = await call('world.spawn_actor', { blueprint: bp, transform: camT, attributes: { fov: 90 } });
    await call('sensor.listen', { id: s.id });
    sensors[bp] = s.id;
  }
  await call('vehicle.set_autopilot', { id: car.id, enabled: true, route: ['straight', 'left'] });
  for (let i = 0; i < 6; i++) await call('world.tick');
  const ev = await page.evaluate(() => window.__API.events.map((e) => ({ ...e.meta, labels: e.meta.labels ? { n: e.meta.labels.instances.length, first: e.meta.labels.instances.slice(0, 4) } : undefined, bytes: e.blobs.map((b) => b.byteLength) })));
  console.log('events', ev.length);
  for (const e of ev.slice(-4)) console.log(JSON.stringify(e).slice(0, 700));
  // save the last RGB + semantic as PNG through a canvas (visual check)
  const saved = await page.evaluate(() => {
    const E = window.__API.events;
    const outp = {};
    for (const want of ['sensor.camera.rgb', 'sensor.camera.semantic_segmentation', 'sensor.camera.instance_segmentation']) {
      const e = [...E].reverse().find((q) => q.meta.type_id === want);
      if (!e) continue;
      const { width: w, height: h } = e.meta;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); const img = g.createImageData(w, h);
      const b = e.blobs[0];
      if (want === 'sensor.camera.semantic_segmentation') {
        const pal = window.__PERC.classes;
        for (let i = 0; i < w * h; i++) { const cl = pal[b[i]] || pal[0]; img.data.set([cl.rgb[0], cl.rgb[1], cl.rgb[2], 255], i * 4); }
      } else { img.data.set(b); for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; }
      g.putImageData(img, 0, 0);
      outp[want] = c.toDataURL('image/png');
    }
    return outp;
  });
  for (const [k, v] of Object.entries(saved)) await fs.writeFile(path.join(out, k.split('.').pop() + '.png'), Buffer.from(v.split(',')[1], 'base64'));
  await call('actor.get_transform', { id: car.id });
  await call('walker_ai.get_state', { id: aic.id });
  console.log('page log:\n  ' + logs.slice(0, 20).join('\n  '));
} finally {
  await browser.close();
  server.kill();
}
