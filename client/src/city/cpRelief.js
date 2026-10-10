// CP32 relief (lead): the city is compiled on a flat datum (terrain 3.24, lawn 3.51, paths 3.54, asphalt 3.38), so the
// compiled park had none of its ground: the Lake's valley, Bethesda's two levels, Vista Rock, the Great Hill. The park's
// relief is put back here from the USGS 3DEP ground the compiler sampled (data/raw/park_elev_1.json, 14 m points): the
// ground's height over a smooth surface spanning the park's perimeter, so the park's edge stays at the city's datum and
// the relief inside it is the real one (the Lake about 8 m under the Fifth Avenue and Central Park West kerbs, the
// Reservoir's plateau about 7 m over them).
//   cpRelief(x, z): metres to add to the flat datum at world (x, z) (0 outside the park)
//   cpDem(x, z): the 3DEP ground itself (NAVD88 metres), for levels quoted from surveys
//   cpDemToWorld(h, x, z): a 3DEP level (a lake's surface, a terrace) as a world y at (x, z)
// The grid is baked by client/tools/cp/relief_bake.py into cpReliefData.js (14 m, int16 cm); city/centralPark.js
// re-heights the park's ground sections, terrain grid and road lines with it before any part's apply() runs.
// `?cp32r=0` keeps the park flat (cpRelief returns 0 everywhere).
import { CP_RELIEF } from './cpReliefData.js';
export const CP_DATUM = 3.51;   // the flat compile's lawn level
const CP32R = !(typeof location !== 'undefined' && (new URLSearchParams(location.search).get('cp32r') === '0' || new URLSearchParams(location.search).get('cp32') === '0'));
const dec = (b64) => {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(u8.buffer), f = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 100;
  return f;
};
let GRID = CP32R ? { x0: CP_RELIEF.x0, z0: CP_RELIEF.z0, step: CP_RELIEF.step, nx: CP_RELIEF.nx, nz: CP_RELIEF.nz, rel: dec(CP_RELIEF.rel), dem: dec(CP_RELIEF.dem) } : null;
// the grid's box (world x0, z0, x1, z1): outside it the relief is 0
export const CP_RELIEF_BOX = [CP_RELIEF.x0, CP_RELIEF.z0, CP_RELIEF.x0 + (CP_RELIEF.nx - 1) * CP_RELIEF.step, CP_RELIEF.z0 + (CP_RELIEF.nz - 1) * CP_RELIEF.step];
// piecewise linear on the grid's triangles (each cell split along its (i, j)-(i+1, j+1) diagonal), not bilinear: the
// ground laid on it (centralPark.js) is cut along the same lines, so every piece is flat on one patch and two sections
// meeting along a line meet on the same line in 3D, whatever their vertices (a bilinear cell bends each side's
// straight edge differently between its own vertices and opens cracks at every path's edge)
const bil = (a, x, z) => {
  if (!GRID) return 0;
  const fx = (x - GRID.x0) / GRID.step, fz = (z - GRID.z0) / GRID.step;
  if (fx < 0 || fz < 0 || fx > GRID.nx - 1.001 || fz > GRID.nz - 1.001) return 0;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = GRID.nx;
  const a00 = a[j * n + i], a11 = a[(j + 1) * n + i + 1];
  return u >= v ? a00 + (a[j * n + i + 1] - a00) * u + (a11 - a[j * n + i + 1]) * v : a00 + (a[(j + 1) * n + i] - a00) * v + (a11 - a[(j + 1) * n + i]) * u;
};
export const cpRelief = (x, z) => (GRID ? bil(GRID.rel, x, z) : 0);
export const cpDem = (x, z) => (GRID ? bil(GRID.dem, x, z) : null);
export const cpDemToWorld = (h, x, z) => (GRID ? CP_DATUM + cpRelief(x, z) + (h - bil(GRID.dem, x, z)) : CP_DATUM);
export const cpReliefReady = () => !!GRID;
// The bridges' decks (the bake's header): 3DEP is bare earth, so a drive or path on a bridge followed the ground down into
// the valley or the Lake. Each deck line carries its own relief, straight between its approaches' shoulders; this is that
// relief at (x, z) within the deck's half width of its line (the highest where decks meet), or null off every deck.
const DECKS = GRID ? (CP_RELIEF.decks || []).map((d) => {
  const P = d.pts, bb = [1e9, 1e9, -1e9, -1e9];
  for (let k = 0; k < P.length; k += 3) { bb[0] = Math.min(bb[0], P[k] - d.hw); bb[1] = Math.min(bb[1], P[k + 1] - d.hw); bb[2] = Math.max(bb[2], P[k] + d.hw); bb[3] = Math.max(bb[3], P[k + 1] + d.hw); }
  return { hw2: d.hw * d.hw, P, bb };
}) : [];
export function cpBridgeRelief(x, z) {
  let best = null;
  for (const d of DECKS) {
    if (x < d.bb[0] || x > d.bb[2] || z < d.bb[1] || z > d.bb[3]) continue;
    const P = d.P;
    for (let k = 0; k + 5 < P.length; k += 3) {
      const ax = P[k], az = P[k + 1], dx = P[k + 3] - ax, dz = P[k + 4] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      if (ex * ex + ez * ez > d.hw2) continue;
      const r = P[k + 2] + (P[k + 5] - P[k + 2]) * t;
      if (best === null || r > best) best = r;
    }
  }
  return best;
}
export function cpSetReliefGrid(g) { GRID = g; }
