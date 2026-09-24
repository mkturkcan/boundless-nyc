// CPU profile of API ticks (boundlessjs/src/api/bridge.js) in a Playwright page on the RTX, hostless (window.__API):
// sets up the W 120th St & Amsterdam pole camera set, then profiles N ticks over CDP and prints the functions with the
// most self time, plus the wall time per tick.
//   node tools/api/prof_ticks.mjs [--port 5219 (a running Vite)] [--ticks 20] [--sensors rgb,semantic,instance] [--amodal 0]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const port = opt('port', '5219');
const ticks = Number(opt('ticks', '20'));
const kinds = opt('sensors', 'rgb,semantic_segmentation,instance_segmentation').split(',');
const amodal = Number(opt('amodal', '0'));
const [W, H] = opt('size', '1280x720').split('x').map(Number);

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
  const lon = -73.95905, lat = 40.80955;
  const x = (lon - LON0) * M_LON, z = -(lat - LAT0) * M_LAT;
  await page.goto(`http://127.0.0.1:${port}/?api=1&hud=0&clean=1&life=0&x=${x.toFixed(1)}&z=${z.toFixed(1)}&y=60&pedtarget=520`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction('!!window.__API', null, { timeout: 300000 });
  const call = (m, p = {}) => page.evaluate(([m, p]) => window.__API.call(m, p), [m, p]);
  const J = await call('geo.to_location', { lat, lon });
  await call('actor.set_transform', { id: 1, transform: { location: { x: J.x - 30, y: J.y - 30, z: 20 }, rotation: { pitch: -25, yaw: 45 } } });
  console.log('loaded', JSON.stringify(await call('world.wait_until_loaded', { timeout: 200 })));
  console.log('gpu', (await call('server.info')).gpu);
  const pole = { location: { x: J.x - 14, y: J.y - 14, z: J.z + 6.5 }, rotation: { pitch: -20, yaw: 45 } };
  for (const k of kinds) {
    const s = await call('world.spawn_actor', { blueprint: `sensor.camera.${k}`, transform: pole, attributes: { amodal } });
    await call('sensor.listen', { id: s.id });
  }
  for (let i = 0; i < 8; i++) await call('world.tick');
  // drain the hostless event queue as a client would (keeps memory flat)
  const drain = () => page.evaluate(() => { const n = window.__API.events.length; window.__API.events.length = 0; return n; });
  await drain();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  const T = [];
  for (let i = 0; i < ticks; i++) { T.push((await call('world.tick')).timing); await drain(); }
  const wall = (Date.now() - t0) / ticks;
  const { profile } = await cdp.send('Profiler.stop');
  // self time per function
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'}  ${(cf.url || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dts[i] || 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${ticks} ticks, ${wall.toFixed(0)} ms wall per tick; profile ${(total / ticks).toFixed(0)} ms per tick`);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`${(v / ticks).toFixed(1).padStart(7)} ms  ${k}`);
  // the bridge's own breakdown (world.tick -> timing), averaged
  const acc = {};
  const add = (pre, o) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v === 'number') acc[pre + k] = (acc[pre + k] || 0) + v / ticks;
      else if (v && typeof v === 'object' && !Array.isArray(v)) add(pre + k + '.', v);
    }
  };
  for (const t of T) { add('', { step_ms: t.step_ms, total_ms: t.total_ms }); t.sensors.forEach((g, i) => add(`group${i}.`, g)); }
  console.log('\nbridge timing (ms, mean per tick)');
  for (const [k, v] of Object.entries(acc)) console.log(`  ${k.padEnd(30)} ${v.toFixed(1)}`);
} finally {
  await browser.close();
}
