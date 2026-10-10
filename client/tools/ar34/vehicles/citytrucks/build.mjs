// CITYTRUCKS build: the city's working trucks as fleet24 GLBs (client/public/models/fleet24/<kind>.glb).
//   node client/tools/ar34/vehicles/citytrucks/build.mjs <kind|all> [--out <dir>]
// kinds: dsny (DSNY Mack LR rear loader), uspsllv (Grumman LLV), uspsngdv (Oshkosh NGDV), schoolbus (Type C).
// LOD0 / LOD1 / LOD2 are three builds of the same kind at falling detail (bevel and lathe segments, small parts and
// the cabin interior dropped), so each LOD keeps its silhouette exactly.
import fs from 'node:fs';
import path from 'node:path';
import { THREE, ROOT, writeGLB, liveryLayout } from './lib.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : path.join(ROOT, 'client/public/models/fleet24');
const which = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const ALL = ['schoolbus', 'dsny', 'uspsllv', 'uspsngdv'];
const list = !which.length || which[0] === 'all' ? ALL : which;
const TEX = path.join(ROOT, 'client/tools/ar34/vehicles/citytrucks/tex');
fs.mkdirSync(TEX, { recursive: true });

for (const kind of list) {
  const t0 = Date.now();
  const mod = await import(`./${kind}.mjs`);
  const lods = [], hubsAll = [];
  for (let q = 0; q < 3; q++) { const r = mod.build(q); lods.push(r.P); hubsAll.push(r.hubs); }
  // frame: x / z centred on the LOD0 envelope, ground at the lowest tyre point
  const bb = new THREE.Box3();
  for (const p of lods[0].list) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
  let ground = 1e9;
  for (const p of lods[0].list) if (p.geo.attributes._wheel.array[0] > 0) ground = Math.min(ground, p.geo.boundingBox.min.y);
  if (!(ground < 1e8)) ground = bb.min.y;
  const shift = new THREE.Vector3(-(bb.min.x + bb.max.x) / 2, -ground, -(bb.min.z + bb.max.z) / 2);
  for (const P of lods) for (const p of P.list) p.geo.translate(shift.x, shift.y, shift.z);
  const size = [bb.max.x - bb.min.x, bb.max.y - ground, bb.max.z - bb.min.z];
  const hubs = hubsAll[0].map((h) => ({ ...h, p: [+(h.p[0] + shift.x).toFixed(4), +(h.p[1] + shift.y).toFixed(4), +(h.p[2] + shift.z).toFixed(4)] }));
  // the livery layout is in the build frame: shift its z / x origin with the parts
  const S = mod.SPEC;
  const lay0 = liveryLayout(S.L, S.W, S.H);
  const layout = {
    side: (sg, z, y) => lay0.side(sg, z - shift.z, y - shift.y),
    front: (x, y) => lay0.front(x - shift.x, y - shift.y),
    rear: (x, y) => lay0.rear(x - shift.x, y - shift.y),
    top: (x, z) => lay0.top(x - shift.x, z - shift.z),
  };
  const liv = await mod.livery(path.join(TEX, `${kind}_livery.png`));
  const out = path.join(OUT, `${kind}.glb`);
  const counts = await writeGLB({ kind, lods, size, hubs, livery: liv, out, texDir: TEX, extras: { layout, ...(mod.EXTRAS || {}) } });
  console.log(`${kind}: size ${size.map((v) => v.toFixed(3)).join(' x ')} m  shift ${shift.toArray().map((v) => v.toFixed(3)).join(',')}`);
  console.log(`  hubs ${hubs.map((h) => `${h.id}:${h.p.join(',')} r${h.r}`).join(' | ')}`);
  counts.forEach((c, i) => console.log(`  LOD${i} ${c.tris} tris  ${Object.entries(c.perCls).map(([k, v]) => `${k}=${v}`).join(' ')}`));
  console.log(`  -> ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
