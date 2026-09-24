// Inspect a compiled tile around a lon/lat: list buildings with landmarkId, grass/ground stats.
// node tools/probe_tile.mjs <lon> <lat>
import fs from 'node:fs';
import { project } from '../src/shared/geo.js';
import { parseTile, buildingsOf, furnitureOf } from '../src/world/tiledata.js';

const lon = Number(process.argv[2] ?? -73.96188), lat = Number(process.argv[3] ?? 40.808);
const [x, z] = project(lon, lat);
const key = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`;
const f = `public/tiles/t_${key}.bin`;
console.log('target', { lon, lat, x: x.toFixed(1), z: z.toFixed(1), key, exists: fs.existsSync(f) });
if (!fs.existsSync(f)) process.exit(1);
const buf = fs.readFileSync(f);
const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log('header keys:', Object.keys(tile.header).join(','), '| sections:', Object.keys(tile.S).join(','));
const blds = [...buildingsOf(tile)];
console.log('buildings:', blds.length);
const lms = blds.filter((b) => b.landmarkId !== 0);
console.log('landmark buildings:', lms.length);
const [ox, oz] = tile.header.origin;
for (const b of lms.slice(0, 20)) {
  let cx = 0, cz = 0;
  for (let i = 0; i < b.len; i++) { cx += tile.S.bldgXZ[(b.start + i) * 2] + ox; cz += tile.S.bldgXZ[(b.start + i) * 2 + 1] + oz; }
  cx /= b.len; cz /= b.len;
  console.log(`  lmId=${b.landmarkId} h=${b.height?.toFixed(1)} floors=${b.floors} flags=${b.flags} at (${cx.toFixed(0)},${cz.toFixed(0)}) d=${Math.hypot(cx - x, cz - z).toFixed(0)}m`);
}
console.log('sample generic building:', JSON.stringify(blds[0], (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(2) : v)).slice(0, 400));
// furniture kinds histogram (trees etc.)
const hist = {};
for (const it of furnitureOf(tile)) hist[it.kind] = (hist[it.kind] || 0) + 1;
console.log('furniture kinds:', JSON.stringify(hist));
// ground sections
if (tile.S.ground) console.log('ground verts:', tile.S.ground.length);
if (tile.S.grass) console.log('grass verts:', tile.S.grass.length);
