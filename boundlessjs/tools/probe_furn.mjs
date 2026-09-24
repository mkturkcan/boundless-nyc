// Tile furniture probe: counts furniture kinds within R m of a point.
// usage: node tools/probe_furn.mjs <tilesDir> <x> <z> [R=60]   or   node tools/probe_furn.mjs <tilesDir> lon <lon> <lat> [R=60]
import fs from 'node:fs';
let [,, tdir, xs, zs, a4, a5] = process.argv;
let R = 60;
if (xs === 'lon') { const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180); xs = String((parseFloat(zs) - LON0) * M_LON); zs = String(-(parseFloat(a4) - LAT0) * M_LAT); R = parseFloat(a5 || '60'); } else R = parseFloat(a4 || '60');
const X = parseFloat(xs), Z = parseFloat(zs);
const KIND = { 1: 'TREE', 2: 'LAMP_COBRA', 3: 'LAMP_CROOK', 4: 'HYDRANT', 5: 'SIGNAL_MAST', 6: 'SIGNAL_PED', 12: 'LINKNYC', 13: 'NEWSSTAND', 14: 'SCAFFOLD', 15: 'BENCH', 16: 'AWNING', 17: 'BIKE_RACK', 18: 'PHONE', 19: 'PLANTER', 20: 'STOOP', 21: 'FIRE_ESCAPE', 22: 'WATER_TOWER', 26: 'STANDPIPE', 27: 'CONE', 33: 'PIER', 34: 'SIGN34', 37: 'K37' };
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8')); const TILE = man.tile || man.tileSize || 512;
const counts = {}; let total = 0; const ys = {};
for (let tx = Math.floor((X - R) / TILE); tx <= Math.floor((X + R) / TILE); tx++) for (let tz = Math.floor((Z - R) / TILE); tz <= Math.floor((Z + R) / TILE); tz++) {
  const ent = man.tiles[`${tx}_${tz}`]; if (!ent) continue;
  const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen))); const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const s = header.sections.find((q) => q.name === 'furn'); if (!s) continue;
  const fb = new Uint8Array(buf, base + s.offset, s.length); const fdv = new DataView(fb.buffer, fb.byteOffset, fb.byteLength);
  const [ox, oz] = header.origin;
  for (let o = 0; o + 20 <= fb.byteLength; o += 20) {
    const k = fdv.getUint8(o), x = fdv.getFloat32(o + 4, true) + ox, y = fdv.getFloat32(o + 8, true), z = fdv.getFloat32(o + 12, true) + oz;
    if (Math.hypot(x - X, z - Z) > R) continue;
    const name = KIND[k] || ('k' + k); counts[name] = (counts[name] || 0) + 1; total++;
    (ys[name] = ys[name] || []).push(+y.toFixed(2));
  }
}
console.log(`furniture within ${R} m of (${X.toFixed(1)}, ${Z.toFixed(1)}): ${total}`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) { const yy = ys[k]; const mn = Math.min(...yy), mx = Math.max(...yy); console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}   y ${mn}${mx !== mn ? '..' + mx : ''}`); }
