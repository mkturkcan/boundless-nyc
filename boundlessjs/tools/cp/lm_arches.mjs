// CP32 LANDMARKS: the park's stone arches and smaller bridges (OSM man_made=bridge outlines inside the park, less the ones
// the part builds in full), each with the direction of the highway bridge way that crosses it (the upper path or drive),
// its outline in that frame (u along the upper way, w across) and its centre. Prints the JS array for cpLandmarks.js.
// usage: node tools/cp/lm_arches.mjs <overpass.json>
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const LAT0 = 40.7831, LON0 = -73.9712, P = (g) => [(g.lon - LON0) * 84316, -(g.lat - LAT0) * 111132];
const MINE = new Set([546663191, 580516390, 580520662, 689009141]);
const ways = d.elements.filter((e) => e.type === 'way' && e.tags && e.tags.bridge && e.tags.highway && e.geometry).map((e) => ({ id: e.id, name: e.tags.name || e.tags.highway, pts: e.geometry.map(P) }));
const inPoly = (x, z, R) => { let c = 0; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [ax, az] = R[i], [bx, bz] = R[j]; if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) c ^= 1; } return !!c; };
const out = [];
for (const e of d.elements) {
  const t = e.tags || {};
  if (t.man_made !== 'bridge' || !e.geometry || MINE.has(e.id)) continue;
  const R = e.geometry.map(P);
  const cx = R.reduce((s, p) => s + p[0], 0) / R.length, cz = R.reduce((s, p) => s + p[1], 0) / R.length;
  if (cx < -960 || cx > 1900 || cz < -2000 || cz > 2150) continue;
  // the crossing upper way: the bridge way with the longest stretch inside the outline
  let best = null, bestL = 0;
  for (const w of ways) {
    let L = 0, dx = 0, dz = 0;
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inPoly(mx, mz, R)) continue;
      const l = Math.hypot(bx - ax, bz - az); L += l; dx += bx - ax; dz += bz - az;
    }
    if (L > bestL) { bestL = L; best = { w, dx, dz }; }
  }
  if (!best) { console.error('no upper way for', e.id, t.name || ''); continue; }
  const l = Math.hypot(best.dx, best.dz), ax = best.dx / l, az = best.dz / l;
  let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9;
  for (const [x, z] of R) { const u = (x - cx) * ax + (z - cz) * az, w = -(x - cx) * az + (z - cz) * ax; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
  const f = (v) => +v.toFixed(2);
  out.push(`[${e.id}, ${JSON.stringify(t.name || '')}, ${JSON.stringify(t.material || '')}, ${f(cx)}, ${f(cz)}, ${f(ax)}, ${f(az)}, ${f(u0)}, ${f(u1)}, ${f(w0)}, ${f(w1)}]`);
}
console.log(`// ${out.length} arches: [OSM way, name, material, cx, cz, ax, az (the upper way), u0, u1, w0, w1 (the outline in that frame)]`);
console.log('[' + out.join(',\n ') + ']');
