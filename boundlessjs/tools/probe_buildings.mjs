// Building record probe: every compiled building within R metres of a point, with its facts and its footprint edges
// (length, outward compass heading, the street frontage flag) — for placing named storefronts and checking overrides.
// usage: node tools/probe_buildings.mjs <tilesDir> lon <lon> <lat> [R=40]      (or <tilesDir> <x> <z> [R])
import fs from 'node:fs';
import path from 'node:path';
import { parseTile, buildingsOf } from '../src/world/tiledata.js';
import { STYLE, BF } from '../src/shared/geo.js';

const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
let [,, tdir, a1, a2, a3, a4] = process.argv;
let X, Z, R;
if (a1 === 'lon') { X = (parseFloat(a2) - LON0) * M_LON; Z = -(parseFloat(a3) - LAT0) * M_LAT; R = parseFloat(a4 || 40); }
else { X = parseFloat(a1); Z = parseFloat(a2); R = parseFloat(a3 || 40); }
const man = JSON.parse(fs.readFileSync(path.join(tdir, 'manifest.json'), 'utf8'));
const TILE = man.tile || man.tileSize || 512;
const styleName = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [v, k]));
const flagNames = (f) => Object.entries(BF).filter(([, v]) => f & v).map(([k]) => k).join('|') || '-';
const toLL = (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON];
console.log(`point world (${X.toFixed(1)}, ${Z.toFixed(1)})  R ${R} m`);
const seen = new Set();
for (let tx = Math.floor((X - R) / TILE); tx <= Math.floor((X + R) / TILE); tx++) {
  for (let tz = Math.floor((Z - R) / TILE); tz <= Math.floor((Z + R) / TILE); tz++) {
    const ent = man.tiles[`${tx}_${tz}`];
    if (!ent || seen.has(ent.f)) continue;
    seen.add(ent.f);
    const buf = fs.readFileSync(path.join(tdir, ent.f));
    const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const [ox, oz] = tile.header.origin;
    const XZ = tile.S.bldgXZ;
    for (const b of buildingsOf(tile)) {
      const ring = [];
      for (let k = 0; k < b.len; k++) ring.push([XZ[(b.start + k) * 2] + ox, XZ[(b.start + k) * 2 + 1] + oz]);
      let cx = 0, cz = 0, dmin = 1e9;
      for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; dmin = Math.min(dmin, Math.hypot(x - X, z - Z)); }
      if (dmin > R) continue;
      // signed area (x east, z south): the winding decides which side of an edge is outside
      let A = 0;
      for (let k = 0; k < ring.length; k++) { const [x0, z0] = ring[k], [x1, z1] = ring[(k + 1) % ring.length]; A += x0 * z1 - x1 * z0; }
      const [lat, lon] = toLL(cx, cz);
      console.log(`\n#${b.i} tile ${tx}_${tz}  centroid (${cx.toFixed(1)}, ${cz.toFixed(1)}) = ${lat.toFixed(6)}, ${lon.toFixed(6)}  lm ${b.landmarkId}`);
      console.log(`  ${styleName[b.style] || b.style}  rgb(${b.r},${b.g},${b.b})  h ${b.height.toFixed(1)} base ${b.baseY.toFixed(2)}  floors ${b.floors} x ${b.floorH.toFixed(2)}  winW ${b.winW.toFixed(2)}  storeH ${b.storeH.toFixed(2)}  flags ${flagNames(b.flags)}  front ${b.frontIdx}  area ${b.area}`);
      for (let k = 0; k < ring.length; k++) {
        const [x0, z0] = ring[k], [x1, z1] = ring[(k + 1) % ring.length];
        const L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 1) continue;
        // outward normal in x/z (z south): for A > 0 (clockwise on screen with z down) the outside is to the left
        let nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
        if (A < 0) { nx = -nx; nz = -nz; }
        const compass = ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360;
        console.log(`   e${k}${k === b.frontIdx ? '*' : ' '} (${x0.toFixed(1)}, ${z0.toFixed(1)}) -> (${x1.toFixed(1)}, ${z1.toFixed(1)})  ${L.toFixed(1)} m  faces ${compass.toFixed(0)}°`);
      }
    }
  }
}
