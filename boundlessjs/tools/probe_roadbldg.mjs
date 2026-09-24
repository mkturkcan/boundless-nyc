// Which traffic-carrying roads run THROUGH building footprints? Samples every road (rclass <= 4) every
// 4 m and tests the point against the tile's building rings (bbox prefilter).
// usage: node tools/probe_roadbldg.mjs <tilesDir> <x> <z> [R=1500] [minInside=2]
import fs from 'node:fs';
const [,, tdir, xs, zs, rs, ms] = process.argv; const X = +xs, Z = +zs, R = +(rs || 1500), MIN = +(ms || 2);
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8')); const TILE = man.tile || man.tileSize || 512;
const rings = []; const roads = [];
for (let tx = Math.floor((X - R) / TILE); tx <= Math.floor((X + R) / TILE); tx++) for (let tz = Math.floor((Z - R) / TILE); tz <= Math.floor((Z + R) / TILE); tz++) {
  const ent = man.tiles[`${tx}_${tz}`]; if (!ent) continue;
  const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen))); const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {}; for (const s of h.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
  const [ox, oz] = h.origin;
  if (S.bldg && S.bldgXZ) { const d = new DataView(S.bldg.buffer, S.bldg.byteOffset, S.bldg.byteLength); for (let i = 0; i < S.bldg.byteLength / 44; i++) { const o = i * 44; const start = d.getUint32(o, true), len = d.getUint16(o + 4, true); const r = []; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let k = 0; k < len; k++) { const x = S.bldgXZ[(start + k) * 2] + ox, z = S.bldgXZ[(start + k) * 2 + 1] + oz; r.push([x, z]); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } if (r.length >= 3) rings.push({ r, x0, z0, x1, z1, h: d.getFloat32(o + 12, true) }); } }
  if (S.roads && S.roadVerts) { const m = new DataView(S.roads.buffer, S.roads.byteOffset, S.roads.byteLength); for (let i = 0; i < S.roads.byteLength / 24; i++) { const o = i * 24; const start = m.getUint32(o, true), len = m.getUint16(o + 4, true), rclass = m.getUint8(o + 6), width = m.getFloat32(o + 8, true), nameIdx = m.getUint16(o + 16, true); if (rclass > 4) continue; const pts = []; for (let k = 0; k < len; k++) pts.push([S.roadVerts[(start + k) * 3] + ox, S.roadVerts[(start + k) * 3 + 2] + oz]); roads.push({ name: (h.names || [])[nameIdx] || '?', rclass, width, pts }); } }
}
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };
// coarse grid over rings for the prefilter
const CELL = 64, grid = new Map(); rings.forEach((q, i) => { for (let gx = Math.floor(q.x0 / CELL); gx <= Math.floor(q.x1 / CELL); gx++) for (let gz = Math.floor(q.z0 / CELL); gz <= Math.floor(q.z1 / CELL); gz++) { const k = gx + '_' + gz; (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
const inside = (x, z) => { const a = grid.get(Math.floor(x / CELL) + '_' + Math.floor(z / CELL)); if (!a) return -1; for (const i of a) { const q = rings[i]; if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue; if (pip(x, z, q.r)) return i; } return -1; };
let total = 0, offenders = 0, insideM = 0; const rows = [];
for (const rd of roads) { let L = 0; for (let i = 1; i < rd.pts.length; i++) L += Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1]); if (L < 1) continue; if (Math.hypot(rd.pts[0][0] - X, rd.pts[0][1] - Z) > R) continue; total++;
  let hits = 0, samples = 0, firstHit = null, maxH = 0; for (let d = 2; d < L; d += 4) { let acc = 0, p = null; for (let i = 1; i < rd.pts.length; i++) { const seg = Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1]); if (acc + seg >= d) { const t = (d - acc) / seg; p = [rd.pts[i - 1][0] + (rd.pts[i][0] - rd.pts[i - 1][0]) * t, rd.pts[i - 1][1] + (rd.pts[i][1] - rd.pts[i - 1][1]) * t]; break; } acc += seg; } if (!p) break; samples++; const bi = inside(p[0], p[1]); if (bi >= 0) { hits++; if (!firstHit) firstHit = p; maxH = Math.max(maxH, rings[bi].h); } }
  if (hits >= MIN) { offenders++; insideM += hits * 4; rows.push({ s: `${rd.name} rc${rd.rclass} w${rd.width.toFixed(1)} L${L.toFixed(0)} inside ${hits * 4} m (bldg h ${maxH.toFixed(0)}) @(${firstHit[0].toFixed(0)},${firstHit[1].toFixed(0)})`, m: hits * 4 }); } }
rows.sort((a, b) => b.m - a.m);
console.log(`rings ${rings.length} roads ${total} -> roads running through footprints: ${offenders} (${insideM} m of centreline inside buildings)`);
for (const r of rows.slice(0, 25)) console.log('  ' + r.s);
