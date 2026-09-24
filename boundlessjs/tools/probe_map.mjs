// Tile section probe: ASCII map of which compiled ground section covers each point.
// usage: node tools/probe_map.mjs <tilesDir> <x> <z> [half=45] [step=3]   (world metres; +x east, +z south)
// S sidewalk  B bus lane  G gutter  w paint  A asphalt  K brick  P path  g grass  . terrain only
import fs from 'node:fs';
let [,, tdir, xs, zs, halfS, stepS] = process.argv;
// lon/lat input: node tools/probe_map.mjs <tilesDir> lon <lon> <lat> [half] [step]  (mirror of src/shared/geo.js project())
if (xs === "lon") { const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180); const lon = parseFloat(zs), lat = parseFloat(halfS); xs = String((lon - LON0) * M_LON); zs = String(-(lat - LAT0) * M_LAT); halfS = stepS; stepS = process.argv[7]; console.log("world", (+xs).toFixed(1), (+zs).toFixed(1)); }
const X = parseFloat(xs), Z = parseFloat(zs), H = parseFloat(halfS || 45), ST = parseFloat(stepS || 3);
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8'));
const TILE = man.tile || man.tileSize || 512;
const load = (tx, tz) => {
  const ent = man.tiles[`${tx}_${tz}`]; if (!ent) return null;
  const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen)));
  const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {}; for (const s of header.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
  return { S, ox: header.origin[0], oz: header.origin[1] };
};
const tiles = new Map();
const tileAt = (x, z) => { const k = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`; if (!tiles.has(k)) tiles.set(k, load(Math.floor(x / TILE), Math.floor(z / TILE))); return tiles.get(k); };
const inTri = (a, o, ox, oz, px, pz) => {
  const x0 = a[o] + ox, z0 = a[o+2] + oz, x1 = a[o+3] + ox, z1 = a[o+5] + oz, x2 = a[o+6] + ox, z2 = a[o+8] + oz;
  const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) return null;
  const l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d, l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d, l2 = 1 - l0 - l1;
  return (l0 >= -1e-3 && l1 >= -1e-3 && l2 >= -1e-3) ? l0 * a[o+1] + l1 * a[o+4] + l2 * a[o+7] : null;
};
const order = [['sidewalk','S'],['busred','B'],['gutter','G'],['paintW','w'],['asphalt','A'],['brick','K'],['path','P'],['grass','g']];
const rows = [];
for (let dz = -H; dz <= H; dz += ST) {
  let row = '';
  for (let dx = -H; dx <= H; dx += ST) {
    const px = X + dx, pz = Z + dz; const t = tileAt(px, pz); if (!t) { row += '?'; continue; }
    let ch = '.';
    for (const [name, c] of order) { const a = t.S[name]; if (!a) continue; let hit = false; for (let o = 0; o + 8 < a.length; o += 9) { if (inTri(a, o, t.ox, t.oz, px, pz) !== null) { hit = true; break; } } if (hit) { ch = c; break; } }
    row += ch;
  }
  rows.push(row);
}
console.log('map around', X, Z, '(+x right, +z down; S sidewalk B bus G gutter w paint A asphalt K brick P path g grass . terrain)');
console.log(rows.join('\n'));
