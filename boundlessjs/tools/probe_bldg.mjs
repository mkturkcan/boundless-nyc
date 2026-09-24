// Tile building probe: counts buildings within R m of a point by flag bit and lists baseY/style/floors.
// usage: node tools/probe_bldg.mjs <tilesDir> <x> <z> [R=60]   or   node tools/probe_bldg.mjs <tilesDir> lon <lon> <lat> [R=60]
import fs from 'node:fs';
let [,, tdir, xs, zs, a4, a5] = process.argv; let R = 60;
if (xs === 'lon') { const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180); xs = String((parseFloat(zs) - LON0) * M_LON); zs = String(-(parseFloat(a4) - LAT0) * M_LAT); R = parseFloat(a5 || '60'); } else R = parseFloat(a4 || '60');
const X = parseFloat(xs), Z = parseFloat(zs); const MINH = parseFloat(process.env.MINH || "0");   // MINH=35 lists only buildings at least 35 m tall
const BF = { WATERTOWER: 1, CORNICE: 2, FIRE_ESCAPE: 4, STOREFRONT: 8, SETBACKS: 16, LANDMARK: 32, STOOP: 64, GABLE: 128 };
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8')); const TILE = man.tile || man.tileSize || 512;
const flagCount = {}; let n = 0; const rows = [];
for (let tx = Math.floor((X - R) / TILE); tx <= Math.floor((X + R) / TILE); tx++) for (let tz = Math.floor((Z - R) / TILE); tz <= Math.floor((Z + R) / TILE); tz++) {
  const ent = man.tiles[`${tx}_${tz}`]; if (!ent) continue;
  const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen))); const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {}; for (const s of h.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
  const meta = S.bldg, xz = S.bldgXZ; if (!meta) continue; const [ox, oz] = h.origin;
  const d = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
  for (let i = 0; i < meta.byteLength / 44; i++) {
    const o = i * 44; const start = d.getUint32(o, true), len = d.getUint16(o + 4, true);
    let cx = 0, cz = 0; for (let k = 0; k < len; k++) { cx += xz[(start + k) * 2] + ox; cz += xz[(start + k) * 2 + 1] + oz; } cx /= len; cz /= len;
    if (Math.hypot(cx - X, cz - Z) > R) continue;
    const flags = d.getUint8(o + 22), baseY = d.getFloat32(o + 8, true), floors = d.getUint8(o + 16), style = d.getUint8(o + 17), height = d.getFloat32(o + 12, true);
    n++; for (const [k, v] of Object.entries(BF)) if (flags & v) flagCount[k] = (flagCount[k] || 0) + 1;
    if (height < MINH) continue;
    if (rows.length < (MINH > 0 ? 200 : 12)) rows.push(`  (${cx.toFixed(0)},${cz.toFixed(0)}) base ${baseY.toFixed(2)} h ${height.toFixed(1)} floors ${floors} style ${style} flags ${flags}${flags & 64 ? ' STOOP' : ''}`);
  }
}
console.log(`buildings within ${R} m of (${X.toFixed(1)}, ${Z.toFixed(1)}): ${n}; flags: ${JSON.stringify(flagCount)}`);
for (const r of rows) console.log(r);
