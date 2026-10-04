// CP32L: each Central Park water body's surface and bank elevations from the USGS 3DEP samples the compiler caches
// (data/raw/park_elev_1.json, [x, z, y] world metres on a 14 m grid; 3DEP is hydro-flattened, so the samples inside a
// water polygon read its surface). The compiled city is a flat base plane (compile.mjs FLAT), so these are used for the
// depth of each water body below its own banks, not as absolute heights.
// usage: node tools/cp/land_levels.mjs <osm_land.json> [elev=data/raw/park_elev_1.json]
import fs from 'node:fs';
import { osmPolys, ringArea, inPoly, pip, ringDist } from './land_lib.mjs';

const [,, osmPath, elevPath = 'data/raw/park_elev_1.json'] = process.argv;
const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
const E = JSON.parse(fs.readFileSync(elevPath, 'utf8'));
const park = osm.elements.find((e) => e.type === 'way' && e.id === 427818536);
const PR = osmPolys(park)[0].outer;
const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, f) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
for (const e of osm.elements) {
  const t = e.tags || {};
  if (t.natural !== 'water') continue;
  for (const P of osmPolys(e)) {
    let cx = 0, cz = 0;
    for (const p of P.outer) { cx += p[0]; cz += p[1]; }
    cx /= P.outer.length; cz /= P.outer.length;
    if (!pip(cx, cz, PR)) continue;
    const A = Math.abs(ringArea(P.outer));
    if (A < 150) continue;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of P.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const ins = [], near = [], bank = [];
    for (const [x, z, y] of E) {
      if (x < x0 - 60 || x > x1 + 60 || z < z0 - 60 || z > z1 + 60) continue;
      if (inPoly(x, z, P)) { if (ringDist(x, z, P.outer) > 3) ins.push(y); continue; }
      const d = Math.min(ringDist(x, z, P.outer), ...P.holes.map((h) => ringDist(x, z, h)));
      if (d < 8) near.push(y); else if (d < 30) bank.push(y);
    }
    const f = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
    console.log(`${t.name || '(' + (t.water || 'water') + ' ' + e.id + ')'} A=${A.toFixed(0)} c=${cx.toFixed(0)},${cz.toFixed(0)}: water ${f(med(ins))} (p10 ${f(pct(ins, 0.1))} p90 ${f(pct(ins, 0.9))}, n ${ins.length}); shore 0-8 m ${f(med(near))} (n ${near.length}); bank 8-30 m ${f(med(bank))} (p25 ${f(pct(bank, 0.25))} p75 ${f(pct(bank, 0.75))}, n ${bank.length})`);
  }
}
