// CP32L tools: shared helpers for the Central Park land tools (tile loading, terrain sampling, OSM polygon assembly).
// Node only. Tiles are read from the compiled set (never written).
import fs from 'node:fs';
import path from 'node:path';
import { project } from '../../src/shared/geo.js';

export { project };

export function tileSet(tdir) {
  const man = JSON.parse(fs.readFileSync(path.join(tdir, 'manifest.json'), 'utf8'));
  const TILE = man.tile || 512;
  const cache = new Map();
  const load = (tx, tz) => {
    const k = `${tx}_${tz}`;
    if (cache.has(k)) return cache.get(k);
    const ent = man.tiles[k];
    let t = null;
    if (ent) {
      const fb = fs.readFileSync(path.join(tdir, ent.f)), buf = fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength);
      const dv = new DataView(buf);
      const hLen = dv.getUint32(4, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hLen)));
      const base = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
      const S = {};
      for (const s of header.sections) S[s.name] = new ({ Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array }[s.type])(buf, base + s.offset, s.length);
      t = { key: k, S, header, ox: header.origin[0], oz: header.origin[1], res: header.res };
    }
    cache.set(k, t);
    return t;
  };
  const tileAt = (x, z) => load(Math.floor(x / TILE), Math.floor(z / TILE));
  // bilinear terrain (the compiled grid, (res+1)^2 over the tile)
  const terrainAt = (x, z) => {
    const t = tileAt(x, z);
    if (!t) return null;
    const res = t.res, n = res + 1, G = t.S.terrain;
    const fx = Math.min(res - 1e-3, Math.max(0, ((x - t.ox) / TILE) * res));
    const fz = Math.min(res - 1e-3, Math.max(0, ((z - t.oz) / TILE) * res));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return G[j * n + i] * (1 - u) * (1 - v) + G[j * n + i + 1] * u * (1 - v) + G[(j + 1) * n + i] * (1 - u) * v + G[(j + 1) * n + i + 1] * u * v;
  };
  // which ground section covers (x, z), and its height
  const ORDER = ['sidewalk', 'busred', 'gutter', 'paintW', 'paintY', 'paintG', 'asphalt', 'brick', 'path', 'grass', 'grassU', 'curb', 'warn', 'warnIron'];
  const sectionAt = (x, z, names = ORDER) => {
    const t = tileAt(x, z);
    if (!t) return null;
    for (const name of names) {
      const a = t.S[name];
      if (!a) continue;
      for (let o = 0; o + 8 < a.length; o += 9) {
        const x0 = a[o] + t.ox, z0 = a[o + 2] + t.oz, x1 = a[o + 3] + t.ox, z1 = a[o + 5] + t.oz, x2 = a[o + 6] + t.ox, z2 = a[o + 8] + t.oz;
        const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
        if (Math.abs(d) < 1e-9) continue;
        const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, l2 = 1 - l0 - l1;
        if (l0 >= -1e-4 && l1 >= -1e-4 && l2 >= -1e-4) return { name, y: l0 * a[o + 1] + l1 * a[o + 4] + l2 * a[o + 7] };
      }
    }
    return null;
  };
  return { TILE, man, load, tileAt, terrainAt, sectionAt };
}

// ---- polygons (world [x, z] rings)
export function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function pip(x, z, R) {
  let ins = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    if ((R[i][1] > z) !== (R[j][1] > z) && x < ((R[j][0] - R[i][0]) * (z - R[i][1])) / (R[j][1] - R[i][1]) + R[i][0]) ins = !ins;
  }
  return ins;
}
export function inPoly(x, z, P) {   // P: { outer, holes }
  if (!pip(x, z, P.outer)) return false;
  for (const h of P.holes || []) if (pip(x, z, h)) return false;
  return true;
}
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  let t = L > 0 ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function ringDist(x, z, R) {
  let d = 1e9;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) d = Math.min(d, segDist(x, z, R[j][0], R[j][1], R[i][0], R[i][1]));
  return d;
}
// Douglas-Peucker on a closed ring (tolerance in metres)
export function simplifyRing(R, tol) {
  if (R.length < 8) return R.slice();
  const n = R.length;
  // split at the two farthest-apart points
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(R[i][0] - R[0][0], R[i][1] - R[0][1]); if (d > best) { best = d; b = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const A = pts[0], B = pts[pts.length - 1];
    let md = -1, mi = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], A[0], A[1], B[0], B[1]); if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [A, B];
    const l = dp(pts.slice(0, mi + 1)), r = dp(pts.slice(mi));
    return l.slice(0, -1).concat(r);
  };
  const h1 = dp(R.slice(a, b + 1)), h2 = dp(R.slice(b).concat([R[0]]));
  return h1.slice(0, -1).concat(h2.slice(0, -1));
}
// join way geometries (arrays of [x, z]) into closed rings by matching endpoints
export function joinRings(ways) {
  const segs = ways.map((w) => w.slice());
  const rings = [];
  const eq = (p, q) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
  while (segs.length) {
    let cur = segs.shift();
    let guard = 0;
    while (!eq(cur[0], cur[cur.length - 1]) && guard++ < 1000) {
      const end = cur[cur.length - 1];
      let k = segs.findIndex((s) => eq(s[0], end));
      if (k >= 0) { cur = cur.concat(segs[k].slice(1)); segs.splice(k, 1); continue; }
      k = segs.findIndex((s) => eq(s[s.length - 1], end));
      if (k >= 0) { cur = cur.concat(segs[k].slice().reverse().slice(1)); segs.splice(k, 1); continue; }
      break;
    }
    if (eq(cur[0], cur[cur.length - 1])) cur = cur.slice(0, -1);
    rings.push(cur);
  }
  return rings;
}
// OSM element (out geom) -> [{ outer, holes }] world polygons
export function osmPolys(e) {
  const P = (g) => project(g.lon, g.lat);
  if (e.type === 'way') {
    const r = e.geometry.map(P);
    if (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < 1e-6 && Math.abs(r[0][1] - r[r.length - 1][1]) < 1e-6) r.pop();
    return [{ outer: r, holes: [] }];
  }
  if (e.type === 'relation') {
    const outs = joinRings(e.members.filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry).map((m) => m.geometry.map(P)));
    const ins = joinRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry.map(P)));
    return outs.map((o) => ({ outer: o, holes: ins.filter((h) => pip(h[0][0], h[0][1], o)) }));
  }
  return [];
}
