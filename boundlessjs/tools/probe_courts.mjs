// CY12 courtyard probe: census of the `bholes` section across a compiled tile set, and
// the courted buildings nearest a point (so a camera can be aimed at a real court).
// usage: node tools/probe_courts.mjs <tilesDir> [x z [radius=300]]
//        node tools/probe_courts.mjs <tilesDir> lon <lon> <lat> [radius]
import fs from 'node:fs';

let [, , tdir, xs, zs, rs] = process.argv;
if (!tdir) { console.error('usage: node tools/probe_courts.mjs <tilesDir> [x z [radius]]'); process.exit(1); }
if (xs === 'lon') {
  const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
  const lon = parseFloat(zs), lat = parseFloat(rs);
  xs = String((lon - LON0) * M_LON); zs = String(-(lat - LAT0) * M_LAT); rs = process.argv[6];
  console.log('world', (+xs).toFixed(1), (+zs).toFixed(1));
}
const X = xs !== undefined ? parseFloat(xs) : null, Z = zs !== undefined ? parseFloat(zs) : null;
const R = parseFloat(rs || 300);
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8'));
const load = (f) => {
  const b = fs.readFileSync(tdir + '/' + f);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const dv = new DataView(buf); const hLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen)));
  const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
  const S = {};
  for (const s of header.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
  return { S, ox: header.origin[0], oz: header.origin[1], header };
};
const sA = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

let tTiles = 0, tWithCourts = 0, tCourts = 0, tBldg = 0, tParents = 0, badRec = 0, badWind = 0, badIdx = 0;
const areas = [];
const hits = [];
const byHeight = { lt45: 0, ge45: 0 };
for (const [key, ent] of Object.entries(man.tiles)) {
  const t = load(ent.f);
  tTiles++;
  const bmeta = t.S.bldg;
  const nB = bmeta ? bmeta.byteLength / 44 : 0;
  if (bmeta && bmeta.byteLength % 44) badRec++;
  tBldg += nB;
  const hm = t.S.bholes;
  if (!hm || !hm.byteLength) continue;
  tWithCourts++;
  const dvb = new DataView(bmeta.buffer, bmeta.byteOffset, bmeta.byteLength);
  const dvh = new DataView(hm.buffer, hm.byteOffset, hm.byteLength);
  const n = hm.byteLength / 12;
  tCourts += n;
  const parents = new Set();
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    const pb = dvh.getUint32(o, true), st = dvh.getUint32(o + 4, true), ln = dvh.getUint16(o + 8, true);
    parents.add(pb);
    if (pb >= nB) { badIdx++; continue; }
    if ((st + ln) * 2 > t.S.bldgXZ.length) { badIdx++; continue; }
    const ring = [];
    for (let k = 0; k < ln; k++) ring.push([t.S.bldgXZ[(st + k) * 2] + t.ox, t.S.bldgXZ[(st + k) * 2 + 1] + t.oz]);
    const a = sA(ring);
    if (a > 0) badWind++;                    // courts must be CW (negative shoelace)
    areas.push(Math.abs(a));
    const h = dvb.getFloat32(pb * 44 + 12, true);
    if (h >= 45) byHeight.ge45++; else byHeight.lt45++;
    if (X !== null) {
      let cx = 0, cz = 0;
      for (const p of ring) { cx += p[0]; cz += p[1]; }
      cx /= ring.length; cz /= ring.length;
      const d = Math.hypot(cx - X, cz - Z);
      if (d <= R) {
        const bst = dvb.getUint32(pb * 44, true), bln = dvb.getUint16(pb * 44 + 4, true);
        hits.push({ key, pb, d, cx, cz, area: Math.abs(a), h, ln, bln, style: dvb.getUint8(pb * 44 + 17), flags: dvb.getUint8(pb * 44 + 22), bst });
      }
    }
  }
  tParents += parents.size;
}
areas.sort((a, b) => a - b);
const pc = (p) => (areas.length ? areas[Math.min(areas.length - 1, Math.floor(areas.length * p))] : 0);
console.log(`tiles ${tTiles} (${tWithCourts} with a bholes section) | buildings ${tBldg}`);
console.log(`COURTS ${tCourts} on ${tParents} buildings | parent<45m ${byHeight.lt45} >=45m ${byHeight.ge45}`);
console.log(`court area m2: min ${areas[0]?.toFixed(0)} p25 ${pc(0.25).toFixed(0)} median ${pc(0.5).toFixed(0)} p75 ${pc(0.75).toFixed(0)} max ${areas.at(-1)?.toFixed(0)}`);
console.log(`integrity: bad 44-byte tiles ${badRec} | out-of-range parent/vertex refs ${badIdx} | wrong winding (not CW) ${badWind}`);
if (X !== null) {
  hits.sort((a, b) => a.d - b.d);
  console.log(`\ncourts within ${R} m of ${X.toFixed(0)},${Z.toFixed(0)}: ${hits.length}`);
  // group by parent building so a 4-court block prints once
  const byB = new Map();
  for (const h of hits) { const k = h.key + ':' + h.pb; let a = byB.get(k); if (!a) byB.set(k, a = []); a.push(h); }
  const rows = [...byB.entries()].sort((p, q) => q[1].length - p[1].length || p[1][0].d - q[1][0].d);
  for (const [k, a] of rows.slice(0, 14)) {
    let cx = 0, cz = 0;
    for (const h of a) { cx += h.cx; cz += h.cz; }
    cx /= a.length; cz /= a.length;
    console.log(`  ${k}  courts ${a.length}  at ${cx.toFixed(0)},${cz.toFixed(0)}  d ${a[0].d.toFixed(0)}m  h ${a[0].h.toFixed(1)}m  outer ${a[0].bln}v  style ${a[0].style}  areas ${a.map((x) => x.area.toFixed(0)).join('/')}`);
  }
}
