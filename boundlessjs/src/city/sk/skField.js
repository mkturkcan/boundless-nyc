// AR33 sk: point queries over a tile's compiled ground sections, and the kerb lines read off its vertical curb faces.
// Pure (no three, no DOM): runs in node for the offline previews (docs/notes/ar33-street.md).
import { hash2 } from './skGeom.js';

// what a fragment of each section IS, for the side-of-a-kerb question
export const ROAD = new Set(['asphalt', 'gutter', 'busred', 'paintW', 'paintY', 'paintG']);
export const RAISED = new Set(['sidewalk', 'grass', 'grassU', 'path', 'brick', 'plaza', 'gravel', 'warn', 'warnIron']);
// the topmost layer first
const ORDER = ['warn', 'warnIron', 'paintW', 'paintY', 'paintG', 'busred', 'sidewalk', 'brick', 'plaza', 'gravel', 'path', 'grass', 'grassU', 'gutter', 'asphalt'];

const CELL = 4;
const key = (i, j) => (i + 2048) * 4096 + (j + 2048);

// spatial hash over the named sections of one tile (tile-local arrays, world = local + (ox, oz))
export class Field {
  constructor(tile, ox, oz, names = ORDER) {
    this.tile = tile; this.ox = ox; this.oz = oz; this.names = names.filter((n) => tile.S[n] && tile.S[n].length >= 9);
    this.H = new Map();
    for (const n of this.names) {
      const a = tile.S[n], H = new Map();
      for (let o = 0, t = 0; o + 8 < a.length; o += 9, t++) {
        const x0 = a[o] + ox, z0 = a[o + 2] + oz, x1 = a[o + 3] + ox, z1 = a[o + 5] + oz, x2 = a[o + 6] + ox, z2 = a[o + 8] + oz;
        const i0 = Math.floor(Math.min(x0, x1, x2) / CELL), i1 = Math.floor(Math.max(x0, x1, x2) / CELL);
        const j0 = Math.floor(Math.min(z0, z1, z2) / CELL), j1 = Math.floor(Math.max(z0, z1, z2) / CELL);
        if (i1 - i0 > 80 || j1 - j0 > 80) continue;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = key(i, j);
          let l = H.get(k); if (!l) H.set(k, (l = []));
          l.push(o);
        }
      }
      this.H.set(n, H);
    }
  }
  // the index (into the section array) of the triangle of `name` holding (x, z), or -1; y from its plane via yAt
  triAt(name, x, z) {
    const H = this.H.get(name); if (!H) return -1;
    const l = H.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return -1;
    const a = this.tile.S[name], ox = this.ox, oz = this.oz;
    for (const o of l) {
      const x0 = a[o] + ox, z0 = a[o + 2] + oz, x1 = a[o + 3] + ox, z1 = a[o + 5] + oz, x2 = a[o + 6] + ox, z2 = a[o + 8] + oz;
      const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(d) < 1e-9) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
      if (l0 >= 0 && l1 >= 0 && l0 + l1 <= 1) return o;
    }
    return -1;
  }
  has(name, x, z) { return this.triAt(name, x, z) >= 0; }
  kindAt(x, z) { for (const n of this.names) if (this.triAt(n, x, z) >= 0) return n; return null; }
  // y of the named section at (x, z), or null
  yAt(name, x, z) {
    const o = this.triAt(name, x, z); if (o < 0) return null;
    const a = this.tile.S[name], ox = this.ox, oz = this.oz;
    const x0 = a[o] + ox, y0 = a[o + 1], z0 = a[o + 2] + oz, x1 = a[o + 3] + ox, y1 = a[o + 4], z1 = a[o + 5] + oz, x2 = a[o + 6] + ox, y2 = a[o + 7], z2 = a[o + 8] + oz;
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    return l0 * y0 + l1 * y1 + (1 - l0 - l1) * y2;
  }
}

// ---- kerb lines: the compiled curb faces (vertical, matId 2) merged into oriented chains.
// A chain is an ordered list of points [x, z, yTop, yBot] with the ROAD on the left of travel: for the direction
// (ux, uz) the road normal is (-uz, ux). `raised` = the kind of surface behind the kerb.
export function kerbChains(tile, ox, oz, field) {
  const a = tile.S.curb, seen = new Map(), edges = [];
  if (!a) return [];
  for (let o = 0; o + 8 < a.length; o += 9) {
    const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 1], a[o + i * 3 + 2] + oz]);
    const yMax = Math.max(P[0][1], P[1][1], P[2][1]), yMin = Math.min(P[0][1], P[1][1], P[2][1]);
    if (yMax - yMin < 0.05) continue;
    const top = P.filter((p) => p[1] > yMax - 0.01);
    if (top.length !== 2) continue;
    const [p, q] = top, L = Math.hypot(q[0] - p[0], q[2] - p[2]);
    if (L < 0.05) continue;
    const k1 = `${p[0].toFixed(2)},${p[2].toFixed(2)}`, k2 = `${q[0].toFixed(2)},${q[2].toFixed(2)}`;
    const ek = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
    const prev = seen.get(ek);
    if (prev) { prev.yBot = Math.min(prev.yBot, yMin); continue; }
    const ux = (q[0] - p[0]) / L, uz = (q[2] - p[2]) / L;
    // which side is the road?
    const mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2, nx = -uz, nz = ux;
    const kA = field.kindAt(mx + nx * 0.3, mz + nz * 0.3), kB = field.kindAt(mx - nx * 0.3, mz - nz * 0.3);
    let flip;
    if (ROAD.has(kA) && !ROAD.has(kB)) flip = false; else if (ROAD.has(kB) && !ROAD.has(kA)) flip = true; else continue;
    const raised = flip ? kA : kB;
    const e = flip ? { ax: q[0], az: q[2], bx: p[0], bz: p[2], yTop: yMax, yBot: yMin, raised } : { ax: p[0], az: p[2], bx: q[0], bz: q[2], yTop: yMax, yBot: yMin, raised };
    seen.set(ek, e); edges.push(e);
  }
  return chainEdges(edges);
}

// edges {ax, az, bx, bz, yTop, yBot, raised} (road on the left of a -> b) joined into chains
export function chainEdges(edges) {
  // the next edge starts where this one ends
  const byStart = new Map();
  const ck = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  for (const e of edges) { const k = ck(e.ax, e.az); (byStart.get(k) || byStart.set(k, []).get(k)).push(e); }
  const hasPrev = new Set();
  for (const e of edges) { const l = byStart.get(ck(e.bx, e.bz)); if (l) for (const n of l) if (n !== e) hasPrev.add(n); }
  const used = new Set(), chains = [];
  const walk = (start) => {
    const pts = [[start.ax, start.az, start.yTop, start.yBot]]; let e = start, raised = start.raised;
    for (let guard = 0; guard < 100000; guard++) {
      used.add(e);
      pts.push([e.bx, e.bz, e.yTop, e.yBot]);
      const l = byStart.get(ck(e.bx, e.bz)); let nx = null;
      if (l) {
        let best = -2;
        for (const c of l) {
          if (used.has(c)) continue;
          const d1x = e.bx - e.ax, d1z = e.bz - e.az, d2x = c.bx - c.ax, d2z = c.bz - c.az;
          const dot = (d1x * d2x + d1z * d2z) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z) + 1e-9);
          if (dot > best) { best = dot; nx = c; }
        }
        if (nx && best < 0.2) nx = null;   // a hairpin is a different chain
      }
      if (!nx) break;
      e = nx;
    }
    return { pts, raised };
  };
  for (const e of edges) if (!hasPrev.has(e) && !used.has(e)) chains.push(walk(e));
  for (const e of edges) if (!used.has(e)) chains.push(walk(e));   // closed loops
  return chains;
}


// the kerb round a raised lawn (a median, a traffic island, a park edge): the lawn section's boundary edges that have road on
// the other side. The compiled ground has no curb faces there at all (the lawn plane at 3.51 just stops over the asphalt at 3.385).
export function lawnChains(tile, ox, oz, field, names = ['grass', 'grassU']) {
  const count = new Map(), tri = [];
  const kq = (x, z) => Math.round(x * 50) + ',' + Math.round(z * 50);
  for (const nm of names) {
    const a = tile.S[nm]; if (!a) continue;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 1], a[o + i * 3 + 2] + oz]);
      for (let i = 0; i < 3; i++) {
        const p = P[i], q = P[(i + 1) % 3], k1 = kq(p[0], p[2]), k2 = kq(q[0], q[2]), k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
        const e = count.get(k);
        if (e) e.n++; else count.set(k, { n: 1, p, q });
      }
    }
  }
  const edges = [];
  for (const e of count.values()) {
    if (e.n !== 1) continue;
    const { p, q } = e, L = Math.hypot(q[0] - p[0], q[2] - p[2]);
    if (L < 0.15) continue;
    const ux = (q[0] - p[0]) / L, uz = (q[2] - p[2]) / L, mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2, nx = -uz, nz = ux;
    const kA = field.kindAt(mx + nx * 0.3, mz + nz * 0.3), kB = field.kindAt(mx - nx * 0.3, mz - nz * 0.3);
    let flip;
    if (ROAD.has(kA) && !ROAD.has(kB) && RAISED.has(kB)) flip = false; else if (ROAD.has(kB) && !ROAD.has(kA) && RAISED.has(kA)) flip = true; else continue;
    const yTop = Math.max(p[1], q[1]), yRoad = field.yAt('asphalt', flip ? mx - nx * 0.3 : mx + nx * 0.3, flip ? mz - nz * 0.3 : mz + nz * 0.3) ?? field.yAt('busred', mx, mz) ?? 3.385;
    const raised = flip ? kA : kB;
    edges.push(flip ? { ax: q[0], az: q[2], bx: p[0], bz: p[2], yTop: Math.max(yTop, 3.52), yBot: yRoad, raised } : { ax: p[0], az: p[2], bx: q[0], bz: q[2], yTop: Math.max(yTop, 3.52), yBot: yRoad, raised });
  }
  return chainEdges(edges);
}

// chain helpers: arc length, tangent and road normal at a distance s
export function chainFrames(pts) {
  const S = [0], U = [], N = [];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 0; i + 1 < pts.length; i++) {
    const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1;
    U.push([(pts[i + 1][0] - pts[i][0]) / L, (pts[i + 1][1] - pts[i][1]) / L]);
  }
  for (const u of U) N.push([-u[1], u[0]]);
  return { S, U, N, L: S[S.length - 1] };
}

export { hash2 };
