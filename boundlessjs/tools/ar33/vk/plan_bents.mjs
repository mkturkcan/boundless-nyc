// VIADUCT (AR33): place the Manhattan Valley bents and the Riverside Drive towers off the compiled carriageways (the
// cross streets under the viaducts: a column never stands in a roadway), write src/city/vk/vkData.js.
//   node tools/ar33/vk/plan_bents.mjs
import fs from 'node:fs';
import { parseTile } from '../../../src/world/tiledata.js';
const { MV, P } = await import('../../../src/city/vk/mvv.js');
const { RS, RP } = await import('../../../src/city/vk/rsd.js');
const man = JSON.parse(fs.readFileSync('public/tiles/manifest.json', 'utf8'));
const cache = new Map();
const tileAt = (x, z) => { const k = `${Math.floor(x / 512)}_${Math.floor(z / 512)}`; if (!cache.has(k)) { const e = man.tiles[k]; if (!e) cache.set(k, null); else { const b = fs.readFileSync('public/tiles/' + e.f); cache.set(k, parseTile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); } } return cache.get(k); };
const ROADK = ['asphalt', 'busred', 'gutter'];
function inRoad(x, z) {
  const t = tileAt(x, z); if (!t) return false;
  const [ox, oz] = t.header.origin, px = x - ox, pz = z - oz;
  for (const name of ROADK) {
    const a = t.S[name]; if (!a) continue;
    for (let i = 0; i + 8 < a.length; i += 9) {
      if ((a[i + 1] + a[i + 4] + a[i + 7]) / 3 > 4.5) continue;
      const x0 = a[i], z0 = a[i + 2], x1 = a[i + 3], z1 = a[i + 5], x2 = a[i + 6], z2 = a[i + 8];
      const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) continue;
      const l1 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d, l2 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d;
      if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) return true;
    }
  }
  return false;
}
// a foot (half size hs) is clear when its centre and four corners are off the carriageways
const clear = (pt, hs) => [[0, 0], [hs, hs], [-hs, hs], [hs, -hs], [-hs, -hs]].every(([dx, dz]) => !inRoad(pt[0] + dx, pt[2] + dz));
// ---- the Manhattan Valley bents: from each skewback outward a tower (two bents 30 ft apart), then 60 ft spans to a
// single bent and a tower in turn; each bent (a tower: both its bents) moved up to 9 m off a street, spans 12-24 m
const COLL = 4.6, H = MV.span / 2, mvv = [];
const bentOk = (u) => clear(P(u, -COLL, 0), 0.8) && clear(P(u, COLL, 0), 0.8);
for (const sgn of [-1, 1]) {
  const end = sgn < 0 ? -MV.u0 : MV.u1;
  let d = 1.9, k = 0, last = 0;
  while (d < end - 6) {
    const tower = k % 2 === 0;
    let best = null;
    // the first tower (at the skewback, past the 125th St intersection) may move 16 m out, the others 9 m either way
    // the first tower stands at the skewback as built (the compile paves the median tips round the 125th St intersection)
    if (k === 0) { mvv.push({ u: +(sgn * (H + d)).toFixed(2), tower: true, half: 0, sgn }, { u: +(sgn * (H + d + 9.14)).toFixed(2), tower: true, half: 1, sgn }); last = d + 9.14; d = last + 18.3; k++; continue; }
    const reach = 9;
    outer: for (let s = 0; s <= reach; s += 0.5) for (const sg of k === 0 ? [1] : s ? [1, -1] : [1]) {
      const dd = d + sg * s;
      if (dd < last + 12 && k > 0) continue;
      if (dd > end - 6) continue;
      if (bentOk(sgn * (H + dd)) && (!tower || bentOk(sgn * (H + dd + 9.14)))) { best = dd; break outer; }
    }
    if (best === null) { d += 4; continue; }
    mvv.push({ u: +(sgn * (H + best)).toFixed(2), tower, half: 0, sgn });
    if (tower) mvv.push({ u: +(sgn * (H + best + 9.14)).toFixed(2), tower: true, half: 1, sgn });
    last = best + (tower ? 9.14 : 0);
    d = last + 18.3; k++;
  }
}
mvv.sort((a, b) => a.u - b.u);
// no plate girder span over 24 m (the published spans are 46-72 ft): a stretch the search left open gets single bents
// at even spacing, on the best foot nearby even if a corner of it touches a roadway
for (let i = 0; i + 1 < mvv.length; i++) {
  const a = mvv[i].u, b = mvv[i + 1].u;
  if (a < -H - 1 && b > H + 1) continue;                 // the arch
  if (b - a <= 24) continue;
  const n = Math.ceil((b - a) / 20), add = [];
  for (let k = 1; k < n; k++) {
    const u0 = a + ((b - a) * k) / n; let best = u0, bs = -1;
    for (let d = -4; d <= 4; d += 0.5) { const u = u0 + d, sc = (clear(P(u, -COLL, 0), 0.8) ? 1 : 0) + (clear(P(u, COLL, 0), 0.8) ? 1 : 0); if (sc > bs) { bs = sc; best = u; } }
    add.push({ u: +best.toFixed(2), tower: false, half: 0, sgn: Math.sign(best) || 1 });
  }
  mvv.splice(i + 1, 0, ...add); i += add.length;
}
// ---- the Riverside Drive stations: the 125th St arch's piers fixed, the typical spans ~21 m, a station moved up to 5 m
// so that its two towers (the fascia lines) stand off the carriageways
// the 125th St arch keeps its span; the pair of piers may move together up to 4 m along the line
let shift = 0;
{ const ok = (d) => { const a = RS.x125 - RS.span125 / 2 + d, b = RS.x125 + RS.span125 / 2 + d; return clear(RP(a, RS.ribs[0], 0), 1.5) && clear(RP(a, RS.ribs[RS.ribs.length - 1], 0), 1.5) && clear(RP(b, RS.ribs[0], 0), 1.5) && clear(RP(b, RS.ribs[RS.ribs.length - 1], 0), 1.5); };
  for (let d = 0; d <= 4; d += 0.25) { if (ok(-d)) { shift = -d; break; } if (ok(d)) { shift = d; break; } } }
const s0 = RS.x125 - RS.span125 / 2 + shift, s1 = RS.x125 + RS.span125 / 2 + shift, rsd = [+s0.toFixed(2), +s1.toFixed(2)];
const towerOk = (u) => clear(RP(u, RS.ribs[0], 0), 1.1) && clear(RP(u, RS.ribs[RS.ribs.length - 1], 0), 1.1);
for (const [from, to, dir] of [[s0, 6, -1], [s1, RS.L - 6, 1]]) {
  let u = from;
  for (;;) {
    const want = u + dir * 21.0;
    if (dir * (to - want) < 8) { rsd.push(to); break; }
    let best = null;
    for (let s = 0; s <= 9; s += 0.5) { for (const sg of s ? [1, -1] : [1]) { const c = want + sg * s; if (towerOk(c)) { best = c; break; } } if (best !== null) break; }
    u = best ?? want; rsd.push(+u.toFixed(2));
  }
}
rsd.sort((a, b) => a - b);
const blockedM = mvv.filter((b) => !bentOk(b.u)).length, blockedR = rsd.filter((u) => !towerOk(u) && Math.abs(u - s0) > 0.5 && Math.abs(u - s1) > 0.5).length;
const out = `// AR33 VIADUCT: bent and tower stations placed off the compiled carriageways (written by boundlessjs/tools/ar33/vk/plan_bents.mjs
// from public/tiles: every column foot is off the asphalt, bus lanes and gutters of the cross streets under the viaducts).
// Manhattan Valley: u along the line from the 125th St crossing (vk/mvv.js); Riverside Drive: u from the OSM line's south end (vk/rsd.js).
export const MVV_BENTS = ${JSON.stringify(mvv)};
export const RSD_STATIONS = ${JSON.stringify(rsd)};
export const RSD_ARCH = [${s0.toFixed(2)}, ${s1.toFixed(2)}];
`;
fs.writeFileSync('src/city/vk/vkData.js', out);
console.log('rsd arch shift', shift, 'piers', s0.toFixed(2), s1.toFixed(2));
console.log('mvv bents', mvv.length, 'still blocked', blockedM, '| rsd stations', rsd.length, 'still blocked', blockedR);
console.log('mvv spans', mvv.map((b, i) => (i ? (b.u - mvv[i - 1].u).toFixed(1) : '')).join(' '));
console.log('rsd spans', rsd.map((u, i) => (i ? (u - rsd[i - 1]).toFixed(1) : '')).join(' '));
