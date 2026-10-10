// Tile section probe: list triangles of one section near a point.
// usage: node tools/probe_tris.mjs <tilesDir> <x> <z> [radius=12] [section=asphalt]
import fs from 'node:fs';
const [,, tdir, xs, zs, rs, sec] = process.argv; const X = +xs, Z = +zs, R = +(rs || 12);
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8')); const TILE = man.tile || man.tileSize || 512;
const ent = man.tiles[`${Math.floor(X / TILE)}_${Math.floor(Z / TILE)}`];
const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen))); const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
const s = header.sections.find(q => q.name === (sec || 'asphalt')); const a = new Float32Array(buf, base + s.offset, s.length); const [ox, oz] = header.origin;
let n = 0;
for (let o = 0; o + 8 < a.length; o += 9) {
  const cx = (a[o] + a[o+3] + a[o+6]) / 3 + ox, cz = (a[o+2] + a[o+5] + a[o+8]) / 3 + oz;
  if (Math.hypot(cx - X, cz - Z) > R) continue;
  n++; if (n <= 14) console.log(`tri c=(${cx.toFixed(1)},${cz.toFixed(1)}) y=${a[o+1].toFixed(3)} v=(${(a[o]+ox).toFixed(1)},${(a[o+2]+oz).toFixed(1)}) (${(a[o+3]+ox).toFixed(1)},${(a[o+5]+oz).toFixed(1)}) (${(a[o+6]+ox).toFixed(1)},${(a[o+8]+oz).toFixed(1)})`);
}
console.log(sec || 'asphalt', 'tris within', R, 'm:', n);
