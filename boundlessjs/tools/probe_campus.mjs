// Query campus anchors from columbia_campus.json + current compiled terrain heights.
import fs from 'node:fs';
import { project } from '../src/shared/geo.js';
import { parseTile } from '../src/world/tiledata.js';

const C = JSON.parse(fs.readFileSync('data/columbia_campus.json', 'utf8'));

// terrain sampler over compiled tiles
const tileCache = new Map();
function terrainAt(x, z) {
  const tx = Math.floor(x / 512), tz = Math.floor(z / 512);
  const key = `${tx}_${tz}`;
  let t = tileCache.get(key);
  if (t === undefined) {
    const f = `public/tiles/t_${key}.bin`;
    t = fs.existsSync(f) ? parseTile(fs.readFileSync(f).buffer) : null;
    if (t) t._o = [tx * 512, tz * 512];
    tileCache.set(key, t);
  }
  if (!t) return null;
  const res = t.header.res, n = res + 1, g = t.S.terrain;
  const fx = Math.min(res - 0.001, Math.max(0, ((x - t._o[0]) / 512) * res));
  const fz = Math.min(res - 0.001, Math.max(0, ((z - t._o[1]) / 512) * res));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  return g[j * n + i] * (1 - u) * (1 - v) + g[j * n + i + 1] * u * (1 - v) + g[(j + 1) * n + i] * (1 - u) * v + g[(j + 1) * n + i + 1] * u * v;
}
const at = (lon, lat) => { const [x, z] = project(lon, lat); return { x: +x.toFixed(1), z: +z.toFixed(1), y: terrainAt(x, z)?.toFixed(2) }; };

console.log('--- key points (world coords + current terrain):');
console.log('College Walk @ Broadway :', JSON.stringify(at(-73.9645, 40.8071)));
console.log('College Walk center     :', JSON.stringify(at(-73.9620, 40.80745)));
console.log('College Walk @ Amsterdam:', JSON.stringify(at(-73.9583, 40.8078)));
console.log('Low centroid            :', JSON.stringify(at(-73.9619, 40.8080)));
console.log('Alma Mater              :', JSON.stringify(at(-73.96213, 40.80783)));
console.log('Fountain W              :', JSON.stringify(at(-73.96248, 40.80777)));
console.log('Fountain E              :', JSON.stringify(at(-73.96201, 40.80757)));
console.log('South Field W lawn      :', JSON.stringify(at(-73.9628, 40.8063)));
console.log('South Field E lawn      :', JSON.stringify(at(-73.9617, 40.8063)));
console.log('Butler N face           :', JSON.stringify(at(-73.9632, 40.8066)));
console.log('North campus (Uris)     :', JSON.stringify(at(-73.9619, 40.8093)));
console.log('120th edge              :', JSON.stringify(at(-73.9615, 40.8105)));
console.log('Sundial                 :', JSON.stringify(at(-73.96253, 40.80728)));

console.log('\n--- monuments:', C.monuments.filter((m) => m.p).map((m) => `${m.name || '?'} @ ${m.p}`).join('\n  '));
console.log('\n--- fountains:', JSON.stringify(C.fountains));
console.log('\n--- steps ways:', C.steps.length);
for (const s of C.steps.slice(0, 74)) {
  const a = s.pts[0], b = s.pts[s.pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1);
  const ya = terrainAt(a[0], a[1])?.toFixed(1), yb = terrainAt(b[0], b[1])?.toFixed(1);
  console.log(`  len=${len} m  (${a[0]},${a[1]}) y=${ya} -> (${b[0]},${b[1]}) y=${yb} ${s.width ? 'w=' + s.width : ''} ${s.name || ''}`);
}
console.log('\n--- plazas:', C.plazas.map((p) => `${p.name} ${p.surface} pts=${p.pts.length}`).join('; '));
console.log('--- College Walk paths:', C.paths.filter((p) => (p.name || '').includes('116') || (p.name || '').toLowerCase().includes('college')).map((p) => `${p.name} surface=${p.surface} w=${p.width} pts=${p.pts.length} [${p.pts[0]}]->[${p.pts[p.pts.length - 1]}]`).join('\n  '));
console.log('--- grass polys:', C.grass.length, 'total pts', C.grass.reduce((s, g) => s + g.pts.length, 0));
console.log('--- named grass:', C.grass.filter((g) => g.name).map((g) => g.name).join('; '));
