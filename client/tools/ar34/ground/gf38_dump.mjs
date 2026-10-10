// GF38 (docs/notes/ar34-groundfix.md): the tile's ground as world/assemble.js has it where GF38 applies (after CP32's cpApply,
// AR32's areaApply, ST38's corner paving), for gf38_bake.py. Run from client/:
//   node tools/ar34/ground/gf38_dump.mjs <outdir> [keys...]   (default: the 49 tiles of the 125th Street box and the ring
//   round them, whose sections the bake reads where they reach over a tile's edge)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const B = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { parseTile, buildingsOf, roadsOf } = await import(B + '/src/world/tiledata.js');
const A = await import(B + '/src/city/areas.js');
const C = await import(B + '/src/city/centralPark.js');
const ST = await import(B + '/src/city/stations/subEnt38.js');
await A.areasReady;
const out = process.argv[2]; let keys = process.argv.slice(3);
const man = JSON.parse(fs.readFileSync(B + '/public/tiles/manifest.json', 'utf8'));
if (!keys.length) for (let tx = 0; tx <= 8; tx++) for (let tz = -10; tz <= -2; tz++) if (man.tiles[`${tx}_${tz}`]) keys.push(`${tx}_${tz}`);
for (const key of keys) {
  const buf = fs.readFileSync(B + '/public/tiles/' + man.tiles[key].f);
  const tile = parseTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [ox, oz] = tile.header.origin;
  if (C.cpTileHit(ox, oz)) C.cpApply(tile, ox, oz);
  if (A.areaTileHit(ox, oz)) A.areaApply(tile, ox, oz);
  ST.st38GapFill(tile);
  const parts = [], hdr = { key, ox, oz, res: tile.header.res, kinds: {}, holes: tile.st38Holes || [] };
  let off = 0;
  const push = (name, arr) => { const f = Float32Array.from(arr); hdr.kinds[name] = [off, f.length]; parts.push(f); off += f.length; };
  for (const [name, a] of Object.entries(tile.S)) {
    if (!(a instanceof Float32Array) || !a.length || a.length % 9 || ['terrain', 'bldgXZ', 'roadVerts'].includes(name)) continue;
    push(name, a);
  }
  push('_terrain', tile.S.terrain);
  const XZ = tile.S.bldgXZ, rings = [], bl = [];
  // a building the page does not draw (an area part's or the park's skip, as world/assemble.js) leaves its ground open
  if (XZ) for (const b of buildingsOf(tile)) {
    let cx = 0, cz = 0; for (let k = 0; k < b.len; k++) { cx += XZ[(b.start + k) * 2] + ox; cz += XZ[(b.start + k) * 2 + 1] + oz; } cx /= b.len; cz /= b.len;
    const skip = (C.cpTileHit(ox, oz) && C.cpSkipBuilding(cx, cz, b.height, b.area)) || (A.areaTileHit(ox, oz) && A.areaSkipBuilding(cx, cz, b.height, b.area));
    if (skip) continue;
    bl.push(rings.length / 2, b.len, b.height, b.baseY); for (let k = 0; k < b.len; k++) rings.push(XZ[(b.start + k) * 2], XZ[(b.start + k) * 2 + 1]);
  }
  push('_bldXZ', rings); hdr.bld = bl;
  // the street graph the traffic drives (sim/traffic.js): a fill never turns its carriageway into walk
  const rv = [], rd = [];
  if (tile.S.roads && tile.S.roadVerts) for (const r of roadsOf(tile)) {
    if (r.noTraffic) continue;
    rd.push(rv.length / 3, r.len, r.width || 0, r.lanes || 0);
    for (let k = 0; k < r.len; k++) rv.push(tile.S.roadVerts[(r.start + k) * 3], tile.S.roadVerts[(r.start + k) * 3 + 1], tile.S.roadVerts[(r.start + k) * 3 + 2]);
  }
  push('_roadV', rv); hdr.roads = rd;
  const J = Buffer.from(JSON.stringify(hdr)), H = Buffer.alloc(4); H.writeUInt32LE(J.length, 0);
  fs.writeFileSync(`${out}/${key}.bin`, Buffer.concat([H, J, ...parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))]));
}
