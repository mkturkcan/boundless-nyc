// QA round 4 (2026-10-02): the 125th Street sweep cameras -> client/shots/ar34/qa/r4/cams_r4.json and a station list
// for the support audit (r4/stations.json). Helpers (the compiled sidewalk band under a station) from the round-1
// generator client/shots/ar34/qa/tools/gencams.mjs.
//   node tools/qa/r4cams.mjs
import fs from 'node:fs';
const ROOT = '/data0/projectnyc';
const C = JSON.parse(fs.readFileSync(ROOT + '/docs/notes/ar33-corridor.json', 'utf8'));
const tdir = ROOT + '/client/public/tiles';
const man = JSON.parse(fs.readFileSync(tdir + '/manifest.json', 'utf8'));
const TILE = man.tile || 512;
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
  const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) return false;
  const l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d, l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d, l2 = 1 - l0 - l1;
  return (l0 >= -1e-3 && l1 >= -1e-3 && l2 >= -1e-3);
};
const order = [['sidewalk','S'],['busred','B'],['gutter','G'],['paintW','w'],['asphalt','A'],['brick','K'],['path','P'],['grass','g']];
const idx = new Map();
const bucketFor = (t, name) => {
  const key = t.ox + ',' + t.oz + ',' + name; if (idx.has(key)) return idx.get(key);
  const a = t.S[name]; const B = new Map();
  if (a) for (let o = 0; o + 8 < a.length; o += 9) {
    const xs = [a[o], a[o+3], a[o+6]].map((v) => v + t.ox), zs = [a[o+2], a[o+5], a[o+8]].map((v) => v + t.oz);
    for (let cx = Math.floor(Math.min(...xs) / 8); cx <= Math.floor(Math.max(...xs) / 8); cx++)
      for (let cz = Math.floor(Math.min(...zs) / 8); cz <= Math.floor(Math.max(...zs) / 8); cz++) { const k = cx + '_' + cz; if (!B.has(k)) B.set(k, []); B.get(k).push(o); }
  }
  idx.set(key, B); return B;
};
const cls = (px, pz) => {
  const t = tileAt(px, pz); if (!t) return '?';
  for (const [name, c] of order) { const a = t.S[name]; if (!a) continue; const B = bucketFor(t, name); const L = B.get(Math.floor(px / 8) + '_' + Math.floor(pz / 8)); if (!L) continue; for (const o of L) if (inTri(a, o, t.ox, t.oz, px, pz)) return c; }
  return '.';
};
const P = C.line; const seg = []; let acc = 0;
for (let i = 0; i + 1 < P.length; i++) { const dx = P[i+1][0] - P[i][0], dz = P[i+1][1] - P[i][1], l = Math.hypot(dx, dz); if (l < 1e-6) continue; seg.push({ a: P[i], dx: dx / l, dz: dz / l, l, s0: acc }); acc += l; }
const at = (s) => { for (const g of seg) if (s <= g.s0 + g.l) { const u = s - g.s0; return { x: g.a[0] + g.dx * u, z: g.a[1] + g.dz * u, tx: g.dx, tz: g.dz }; } const g = seg[seg.length - 1]; return { x: g.a[0] + g.dx * g.l, z: g.a[1] + g.dz * g.l, tx: g.dx, tz: g.dz }; };
// point at station s, offset o (north positive)
const pt = (s, o) => { const p = at(s); return { x: p.x + p.tz * o, z: p.z - p.tx * o, tx: p.tx, tz: p.tz }; };
// sidewalk band at station s on a side (sg +1 north, -1 south): [a, b] offsets from the centreline, or null
const band = (s, sg) => {
  const p = at(s); let prof = '';
  for (let o = 0; o <= 30; o += 0.5) prof += cls(p.x + p.tz * sg * o, p.z - p.tx * sg * o);
  const i0 = prof.indexOf('S'); if (i0 < 0) return null; let i1 = i0; while (i1 + 1 < prof.length && prof[i1 + 1] === 'S') i1++;
  return [i0 * 0.5, i1 * 0.5];
};
// the nearest station to s (within 30 m) where the side has an ordinary sidewalk (2.5-8 m band)
const walkAt = (s, sg) => {
  for (const ds of [0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 25, -25, 30, -30]) {
    const b = band(s + ds, sg); if (!b) continue; const w = b[1] - b[0];
    if (w >= 2.5 && w <= 8) return { s: s + ds, off: sg * (b[0] + Math.min(2.5, 0.45 * w)), band: b };
  }
  return null;
};
const r2 = (v) => Math.round(v * 100) / 100;

const cams = {}; const meta = {}; const ORD = { air: [], street: [], across: [] }; const stations = [];
const add = (name, c, t, alt, pitch, hfov, note, b) => { cams[name] = [r2(c.x), r2(c.z), alt, r2(t.x), r2(t.z), +pitch.toFixed(4), hfov]; meta[name] = note; ORD[b].push(name); };
const SEND = 3220;
// audit stations + low aerials every 100 m (alt 40 m, alternating sides, looking along the street and down)
for (let k = 0, s = 0; s <= SEND; k++, s += 100) {
  const p = at(s); stations.push({ s, x: r2(p.x), z: r2(p.z) });
  const sg = k % 2 ? -1 : 1, dir = k % 4 < 2 ? 1 : -1;
  const c = pt(s - dir * 30, sg * 22), t = pt(s + dir * 70, 0);
  const d = Math.hypot(t.x - c.x, t.z - c.z);
  add(`a${String(s).padStart(4, '0')}`, c, t, 40, -Math.atan2(38, d), 80, `station ${s}: 40 m up over the ${sg > 0 ? 'north' : 'south'} side, along ${dir > 0 ? 'east' : 'west'}`, 'air');
}
// street level: every 100 m from 100 to 3000, both sidewalks, along east and west
for (let s0 = 100; s0 <= 3000; s0 += 100) {
  for (const sg of [1, -1]) {
    const w = walkAt(s0, sg); if (!w) { console.error('no sidewalk near', s0, sg); continue; }
    const c = pt(w.s, w.off);
    for (const dir of [1, -1]) {
      const t = pt(w.s + dir * 60, w.off - sg * 4);
      add(`s${String(Math.round(w.s)).padStart(4, '0')}${sg > 0 ? 'N' : 'S'}${dir > 0 ? 'e' : 'w'}`, c, t, 1.8, 0.03, 80, `station ${w.s} ${sg > 0 ? 'north' : 'south'} sidewalk along ${dir > 0 ? 'east' : 'west'}`, 'street');
    }
  }
}
// across: every 200 m (from 150), alternating sides, at the opposite facades
for (let k = 0, s0 = 150; s0 <= 3000; k++, s0 += 200) {
  const sg = k % 2 ? -1 : 1; const w = walkAt(s0, sg); if (!w) continue;
  const c = pt(w.s, w.off), t = pt(w.s, -sg * 30);
  add(`x${String(Math.round(w.s)).padStart(4, '0')}${sg > 0 ? 'N' : 'S'}`, c, t, 1.8, 0.22, 80, `station ${w.s} from the ${sg > 0 ? 'north' : 'south'} sidewalk across`, 'across');
}
const OUT = ROOT + '/client/shots/ar34/qa/r4';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + '/cams_r4.json', JSON.stringify({ _: 'QA round 4 sweep (tools/qa/r4cams.mjs): L() arrays [cx, cz, alt, tx, tz, pitch, hfov]', ...cams }, null, 0).replace(/\],"/g, '],\n"'));
fs.writeFileSync(OUT + '/cams_r4_meta.json', JSON.stringify({ meta, order: ORD, stations }, null, 1));
console.log(Object.keys(cams).length, 'views:', Object.entries(ORD).map(([k, v]) => k + ' ' + v.length).join(', '), '; stations', stations.length);
