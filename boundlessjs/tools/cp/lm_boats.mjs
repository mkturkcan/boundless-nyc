// CP32 LANDMARKS: the rowboats' courses on the Lake. Reads the Lake's OpenStreetMap outline (relation 7895705, members as
// world polylines [{ role, pts: [[x, z], ...] }], fetched by Overpass into the scratchpad) and places closed elliptical
// courses that stay 6 m or more off every shore, 16 m off Bow Bridge's line and clear of the Bethesda lake front and the
// Boathouse landing, none overlapping another; and a few drifting spots. Prints the JS array for city/cpLandmarks.js.
// usage: node tools/cp/lm_boats.mjs <lake.json> [n=16] [drift=5] [seed=7]
import fs from 'node:fs';
const [,, file, nS, dS, sS] = process.argv;
const L = JSON.parse(fs.readFileSync(file, 'utf8'));
const segs = []; for (const ln of L) for (let i = 0; i + 1 < ln.pts.length; i++) segs.push([ln.pts[i], ln.pts[i + 1]]);
const inLake = (x, z) => { let c = 0; for (const [[ax, az], [bx, bz]] of segs) if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) c ^= 1; return !!c; };
const segD = (x, z, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (L2 || 1))); return Math.hypot(ax + ex * t - x, az + ez * t - z); };
const shoreD = (x, z) => { let d = 1e9; for (const [[ax, az], [bx, bz]] of segs) d = Math.min(d, segD(x, z, ax, az, bx, bz)); return d; };
const KEEP = [
  { seg: [-59.65, 796.76, -36.58, 834.80], r: 16 },          // Bow Bridge (OSM way 306771373)
  { seg: [0, 950, 60, 950], r: 22 },                          // the Bethesda Terrace lake front
  { seg: [185, 855, 215, 885], r: 18 },                       // the Loeb Boathouse's landing
];
const clear = (x, z) => KEEP.every((k) => segD(x, z, ...k.seg) >= k.r);
let s = +(sS || 7);
const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const N = +(nS || 16), ND = +(dS || 5), out = [];
let tries = 0;
while (out.filter((o) => o.a > 0).length < N && tries++ < 200000) {
  const cx = -225 + rnd() * 420, cz = 430 + rnd() * 530, a = 7 + rnd() * 16, b = a * (0.35 + rnd() * 0.45), psi = rnd() * Math.PI;
  let ok = inLake(cx, cz);
  for (let k = 0; k < 28 && ok; k++) {
    const t = k / 28 * Math.PI * 2, x = cx + Math.cos(psi) * a * Math.cos(t) - Math.sin(psi) * b * Math.sin(t), z = cz + Math.sin(psi) * a * Math.cos(t) + Math.cos(psi) * b * Math.sin(t);
    ok = inLake(x, z) && shoreD(x, z) >= 6 && clear(x, z);
  }
  if (!ok) continue;
  if (out.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < o.a + a + 5)) continue;
  out.push({ cx, cz, a, b, psi, dir: rnd() < 0.5 ? 1 : -1, v: 0.55 + rnd() * 0.35, ph: rnd() * Math.PI * 2 });
}
tries = 0;
while (out.filter((o) => o.a === 0).length < ND && tries++ < 100000) {
  const cx = -225 + rnd() * 420, cz = 430 + rnd() * 530;
  if (!inLake(cx, cz) || shoreD(cx, cz) < 8 || !clear(cx, cz)) continue;
  if (out.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < o.a + 8)) continue;
  out.push({ cx, cz, a: 0, b: 0, psi: rnd() * Math.PI * 2, dir: rnd() < 0.5 ? 1 : -1, v: 0.02 + rnd() * 0.03, ph: rnd() * Math.PI * 2 });
}
const f = (v) => +v.toFixed(2);
console.log(`// ${out.filter((o) => o.a > 0).length} courses, ${out.filter((o) => o.a === 0).length} drifting: [cx, cz, a, b, psi, dir, v (m/s), phase]`);
console.log('[' + out.map((o) => `[${[o.cx, o.cz, o.a, o.b, o.psi].map(f).join(', ')}, ${o.dir}, ${f(o.v)}, ${f(o.ph)}]`).join(',\n ') + ']');
