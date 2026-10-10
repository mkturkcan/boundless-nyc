// Tile road-record probe: roads whose polyline passes within R m of a point (endpoints, width, class, mouths).
// usage: node tools/probe_roads.mjs <tilesDir> <x> <z> [R=30]
import fs from 'node:fs';
const [,, tdir, xs, zs, rs] = process.argv; const X = +xs, Z = +zs, R = +(rs || 30);
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8')); const TILE = man.tile || man.tileSize || 512;
for (let tx = Math.floor((X - R) / TILE); tx <= Math.floor((X + R) / TILE); tx++) for (let tz = Math.floor((Z - R) / TILE); tz <= Math.floor((Z + R) / TILE); tz++) {
  const ent = man.tiles[`${tx}_${tz}`]; if (!ent) continue;
  const buf = fs.readFileSync(tdir + '/' + ent.f).buffer; const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen))); const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {}; for (const s of h.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
  const [ox, oz] = h.origin; const meta = S.roads, verts = S.roadVerts; if (!meta) continue;
  const mdv = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
  for (let i = 0; i < meta.byteLength / 24; i++) {
    const o = i * 24; const start = mdv.getUint32(o, true), len = mdv.getUint16(o + 4, true), rclass = mdv.getUint8(o + 6), oneway = mdv.getInt8(o + 7), width = mdv.getFloat32(o + 8, true);
    const nameIdx = mdv.getUint16(o + 16, true), mouthA = mdv.getUint8(o + 18) / 4, mouthB = mdv.getUint8(o + 19) / 4;
    const pts = []; for (let k = 0; k < len; k++) pts.push([verts[(start + k) * 3] + ox, verts[(start + k) * 3 + 2] + oz]);
    let near = false; for (const p of pts) if (Math.hypot(p[0] - X, p[1] - Z) < R) { near = true; break; }
    if (!near) continue;
    let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    console.log(`${(h.names || [])[nameIdx] || '?'} rc${rclass} w${width.toFixed(1)} oneway ${oneway} L ${L.toFixed(1)} mouths ${mouthA}/${mouthB}  A(${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}) -> B(${pts[pts.length - 1][0].toFixed(1)},${pts[pts.length - 1][1].toFixed(1)}) [${pts.length} pts, tile ${tx}_${tz}]`);
  }
}
