// AR33 sk: utility covers and grates, placed on the compiled surfaces by rule (a cover is where the street's own structure puts
// it, not where a photograph of one street happened to): Con Edison (Ø 810 mm) and DEP (Ø 660 mm) manholes and valve boxes in the
// lanes, bicycle-safe catch-basin grates in the gutter upstream of the crossings, steel cellar doors against the building line
// and Con Edison service boxes in the walk. One atlas material (skMats.skCoverMat); UVs are atlas fractions. Pure (no three).
import { hash2, clipHalf, LINE, CROSS } from './skGeom.js';
import { ROAD } from './skField.js';

// QA Q46 (2026-10-02): no repaving placed by rule. The hashed junction boxes (about half the crossings, tone 0.58-0.88, hard
// Both stay off unless `?skrule=1` (the old rule, for A/B); the trenches need `?sktrench=1`.
const RULE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('skrule') === '1';

// atlas rectangles (u0, v0, u1, v1) of skMats.skCoverMat()'s 1024 x 1024 sheet
export const ATLAS = {
  conEd: [0, 0, 0.5, 0.5], dep: [0.5, 0, 1, 0.5], grate: [0, 0.5, 0.5, 0.75], valve: [0, 0.75, 0.25, 1], diamond: [0.5, 0.5, 1, 1], diamondHalf: [0.5, 0.5, 1, 0.75],
  plain: [0.30, 0.80, 0.32, 0.82], plate: [0.25, 0.88, 0.5, 1.0],
};
const DISC = 28;

function disc(buf, x, z, y, r, rect, tone = 1, seg = DISC, rot = 0) {
  const [u0, v0, u1, v1] = rect, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, ur = (u1 - u0) / 2, vr = (v1 - v0) / 2;
  const c = buf.v(x, y, z, 0, 1, 0, uc, vc, tone, tone, tone);
  const ring = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    ring.push(buf.v(x + Math.cos(a + rot) * r, y, z + Math.sin(a + rot) * r, 0, 1, 0, uc + Math.cos(a) * ur, vc + Math.sin(a) * vr, tone, tone, tone));
  }
  // ring order (cos, sin) in (x, z) runs clockwise seen from above, so (c, k + 1, k) faces up
  for (let k = 0; k < seg; k++) buf.tri(c, ring[(k + 1) % seg], ring[k]);
}
// an oriented rectangle: centre, u axis (ux, uz), half sizes along u and v, with the atlas rect mapped over it (u along the long side)
function rect(buf, x, z, y, ux, uz, hu, hv, atlas, tone = 1) {
  const vx = -uz, vz = ux, [u0, v0, u1, v1] = atlas;
  const corners = [[-hu, -hv, 0, 0], [hu, -hv, 1, 0], [hu, hv, 1, 1], [-hu, hv, 0, 1]];
  const ids = corners.map(([a, b, tu, tv]) => buf.v(x + ux * a + vx * b, y, z + uz * a + vz * b, 0, 1, 0, u0 + tu * (u1 - u0), v0 + tv * (v1 - v0), tone, tone, tone));
  const P0 = [x + ux * corners[0][0] + vx * corners[0][1], z + uz * corners[0][0] + vz * corners[0][1]];
  const P1 = [x + ux * corners[1][0] + vx * corners[1][1], z + uz * corners[1][0] + vz * corners[1][1]];
  const P2 = [x + ux * corners[2][0] + vx * corners[2][1], z + uz * corners[2][0] + vz * corners[2][1]];
  const cy = (P1[1] - P0[1]) * (P2[0] - P0[0]) - (P1[0] - P0[0]) * (P2[1] - P0[1]);
  if (cy > 0) buf.quad(ids[0], ids[1], ids[2], ids[3]); else buf.quad(ids[0], ids[3], ids[2], ids[1]);
}
// a raised frame (four thin boxes' tops) round a rectangle, plus its outer skirt, for plates that stand 12 mm over the walk
function frameSkirt(buf, x, z, y, ux, uz, hu, hv, h, tone) {
  const vx = -uz, vz = ux, A = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
  const top = A.map(([a, b]) => buf.v(x + ux * a + vx * b, y, z + uz * a + vz * b, 0, 1, 0, 0.31, 0.81, tone, tone, tone));
  for (let k = 0; k < 4; k++) {
    const [a0, b0] = A[k], [a1, b1] = A[(k + 1) % 4];
    const ex = (a1 - a0) * ux + (b1 - b0) * vx, ez = (a1 - a0) * uz + (b1 - b0) * vz, L = Math.hypot(ex, ez) || 1;
    // outward normal of this side (the polygon runs clockwise seen from above in x/z: outward is the left of travel)
    const nx = ez / L, nz = -ex / L;
    const p0x = x + ux * a0 + vx * b0, p0z = z + uz * a0 + vz * b0, p1x = x + ux * a1 + vx * b1, p1z = z + uz * a1 + vz * b1;
    const i0 = buf.v(p0x, y, p0z, nx, 0, nz, 0.31, 0.81, tone * 0.7, tone * 0.7, tone * 0.7), i1 = buf.v(p1x, y, p1z, nx, 0, nz, 0.31, 0.81, tone * 0.7, tone * 0.7, tone * 0.7);
    const i2 = buf.v(p1x, y - h, p1z, nx, 0, nz, 0.31, 0.81, tone * 0.5, tone * 0.5, tone * 0.5), i3 = buf.v(p0x, y - h, p0z, nx, 0, nz, 0.31, 0.81, tone * 0.5, tone * 0.5, tone * 0.5);
    const cy = (p1x - p0x) * 0, sgn = 1;   // winding fixed below by a test
    const e1 = [p1x - p0x, 0, p1z - p0z], e2 = [0, -h, 0];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * nx + n[2] * nz > 0) buf.quad(i0, i1, i2, i3); else buf.quad(i0, i3, i2, i1);
  }
  return top;
}

// a steel road plate (8 x 4 ft, 14 mm proud) with the asphalt ramped up to it on all four sides
function plate(buf, x, z, y, ux, uz, tone) {
  const hu = 1.22, hv = 0.61, vx = -uz, vz = ux, R = 0.32;
  const P = (a, b) => [x + ux * a + vx * b, z + uz * a + vz * b];
  const inner = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]], outer = [[-hu - R, -hv - R], [hu + R, -hv - R], [hu + R, hv + R], [-hu - R, hv + R]];
  const top = y + 0.014;
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4, a = P(...inner[k]), b = P(...inner[k2]), c = P(...outer[k2]), d = P(...outer[k]);
    const ids = [[a, top], [b, top], [c, y + 0.0015], [d, y + 0.0015]].map(([p, yy]) => buf.v(p[0], yy, p[1], 0, 1, 0, 0.31, 0.81, 0.5, 0.5, 0.5));
    const cy = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (cy > 0) buf.quad(ids[0], ids[1], ids[2], ids[3]); else buf.quad(ids[0], ids[3], ids[2], ids[1]);
  }
  rect(buf, x, z, top, ux, uz, hu, hv, ATLAS.plate, tone);
}
// an asphalt repair: a saw-cut rectangle of a different age than the road round it (asphalt_patch set), 3 mm proud
function patchRect(buf, x, z, y, ux, uz, hu, hv, tone) {
  const vx = -uz, vz = ux;
  const pts = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].map(([a, b]) => [x + ux * a + vx * b, z + uz * a + vz * b]);
  const ids = pts.map(([px, pz], k) => buf.v(px, y, pz, 0, 1, 0, px * 0.9, pz * 0.9, tone, tone, tone));
  const cy = (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]) - (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]);
  if (cy > 0) buf.quad(ids[0], ids[1], ids[2], ids[3]); else buf.quad(ids[0], ids[3], ids[2], ids[1]);
}

// ctx: { field, chains, padSpots, tile, ox, oz, getBuf: (x, z, part) -> Buf, seed, inZone, theta }
export function buildCovers(ctx) {
  const { field, chains, padSpots, tile, ox, oz, getBuf, seed, inZone } = ctx;
  let n = { road: 0, basin: 0, cellar: 0, box: 0, valve: 0 };
  const inTile = (x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
  const okRoad = (x, z, r) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) {
      const k = field.kindAt(x + dx, z + dz);
      if (k !== 'asphalt' && k !== 'busred') return false;
    }
    return true;
  };
  // a rectangle (centre, axis, half sizes) lies wholly on clear asphalt / bus lane: a grid of samples over it, 0.45 m apart
  const okRect = (x, z, ux, uz, hu, hv) => {
    const vx = -uz, vz = ux, nu = Math.max(2, Math.ceil((2 * hu) / 0.45)), nv = Math.max(2, Math.ceil((2 * hv) / 0.45));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const a = -hu + (2 * hu * i) / nu, b = -hv + (2 * hv * j) / nv, k = field.kindAt(x + ux * a + vx * b, z + uz * a + vz * b);
      if (k !== 'asphalt' && k !== 'busred') return false;
    }
    return true;
  };
  // ---- manholes and valve boxes in the lanes: a few per asphalt triangle in proportion to its area
  const a = tile.S.asphalt;
  if (a) for (let o = 0; o + 8 < a.length; o += 9) {
    const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 1], a[o + i * 3 + 2] + oz]);
    const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cz = (P[0][2] + P[1][2] + P[2][2]) / 3;
    if (!inZone(cx, cz)) continue;
    const area = Math.abs((P[1][0] - P[0][0]) * (P[2][2] - P[0][2]) - (P[2][0] - P[0][0]) * (P[1][2] - P[0][2])) / 2;
    if (area < 8) continue;
    const want = area / 260, k = Math.floor(want) + (hash2(Math.round(cx * 13), Math.round(cz * 13) + seed) < want - Math.floor(want) ? 1 : 0);
    for (let q = 0; q < k; q++) {
      const h1 = hash2(Math.round(cx * 7) + q * 131, Math.round(cz * 7) + seed), h2 = hash2(Math.round(cx * 11) + q * 17, Math.round(cz * 5) + seed + 3);
      let u = h1, v = h2; if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const x = P[0][0] + (P[1][0] - P[0][0]) * u + (P[2][0] - P[0][0]) * v, z = P[0][2] + (P[1][2] - P[0][2]) * u + (P[2][2] - P[0][2]) * v;
      if (!inTile(x, z)) continue;
      const kind = hash2(Math.round(x * 3), Math.round(z * 3) + seed) , r = kind < 0.52 ? 0.405 : kind < 0.85 ? 0.33 : 0.12;
      if (!okRoad(x, z, r + 0.35)) continue;
      const y = (field.yAt('asphalt', x, z) ?? field.yAt('busred', x, z) ?? 3.385) + 0.0045;
      const buf = getBuf(x, z, 'cov');
      disc(buf, x, z, y - 0.0015, r + 0.32, ATLAS.plain, 0.62, 20);   // the patched-asphalt collar
      disc(buf, x, z, y, r, kind < 0.52 ? ATLAS.conEd : kind < 0.85 ? ATLAS.dep : ATLAS.valve, 0.95 + 0.1 * h1, DISC, h2 * 6.28);
      n.road++;
    }
    // road plates and repair patches, along the street's own direction
    if (RULE && area >= 24) {
      // along the street here: the nearest corridor segment within 60 m (125th west of Morningside is off the grid: rectangles
      // squared to the grid lay diagonal across it, w2r1_f/w_mid), else the tile's grid angle (Hunters Point)
      let ux = Math.cos(ctx.theta ?? 0.5054), uz = Math.sin(ctx.theta ?? 0.5054), bd = 60;
      for (let i = 1; i < LINE.length; i++) {
        const [ax, az] = LINE[i - 1], [bx, bz] = LINE[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        if (L2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2)), d = Math.hypot(cx - ax - dx * t, cz - az - dz * t);
        if (d < bd) { bd = d; const L = Math.sqrt(L2); ux = dx / L; uz = dz / L; }
      }
      // one per 1200 m2 of roadway. Placed by rule, not survey.
      const wantP = area / 1200, kP = Math.floor(wantP) + (hash2(Math.round(cx * 17), Math.round(cz * 17) + seed) < wantP - Math.floor(wantP) ? 1 : 0);
      for (let q = 0; q < kP; q++) {
        const h1 = hash2(Math.round(cx * 5) + q * 97, Math.round(cz * 5) + seed + 9), h2 = hash2(Math.round(cx * 3) + q * 29, Math.round(cz * 9) + seed + 5), h3 = hash2(q + 3, Math.round(cx + cz) + seed);
        let u = h1, v = h2; if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const x = P[0][0] + (P[1][0] - P[0][0]) * u + (P[2][0] - P[0][0]) * v, z = P[0][2] + (P[1][2] - P[0][2]) * u + (P[2][2] - P[0][2]) * v;
        if (!inTile(x, z)) continue;
        // shows one (nine to an intersection read as a pattern, one in sixteen still put one at Lenox, w2r1_i/b4_lenox): off
        const isPlate = false;
        // utility cuts 1.2-3.6 m by 0.9-2.0 m (the trenches and resurfaced boxes are the big repairs)
        const pu = 0.6 + 1.2 * h1, pv = 0.45 + 0.55 * h2;
        const hpu = isPlate ? 1.22 + 0.4 : pu + 0.2, hpv = isPlate ? 0.61 + 0.4 : pv + 0.2;
        if (!okRect(x, z, ux, uz, hpu, hpv)) continue;
        const y = (field.yAt('asphalt', x, z) ?? field.yAt('busred', x, z) ?? 3.385);
        if (isPlate) { plate(getBuf(x, z, 'cov'), x, z, y + 0.004, ux, uz, 0.85 + 0.2 * h1); n.plate = (n.plate || 0) + 1; }
        else { patchRect(getBuf(x, z, 'patch'), x, z, y + 0.003, ux, uz, pu, pv, 0.86 + 0.24 * h3); n.patch = (n.patch || 0) + 1; }
      }
    }
  }
  // ---- catch basins and the walk's furniture, along the kerb chains whose back is a sidewalk
  const nearPad = (x, z, R) => (padSpots || []).some((p) => Math.hypot(p.x - x, p.z - z) < R);
  for (let ci = 0; ci < chains.length; ci++) {
    const c = chains[ci];
    if (c.raised !== 'sidewalk') continue;
    const pts = c.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1], L = Math.hypot(bx - ax, bz - az);
      if (L < 7) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;   // the road is on the left: n points into the road
      // a chain runs on through the corner arcs into the next street: an edge is 'first' / 'last' at a corner when the edge
      // beside it is a short arc piece (or the chain ends)
      const elen = (k) => (k < 0 || k + 1 >= pts.length ? 0 : Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
      const first = i === 0 || elen(i - 1) < 3.2, last = i + 2 === pts.length || elen(i + 1) < 3.2;
      const hh = (m) => hash2(Math.round(ax * 19) + m * 101 + ci, Math.round(az * 23) + m * 7 + seed);
      // catch basin: near a chain end (the corner's tangent point), else now and then mid-block
      const at = [];
      if (first && L > 9) at.push(3.3);
      if (last && L > 9) at.push(L - 3.3);
      if (!first && !last && hh(1) < 0.35) at.push(L * (0.3 + 0.4 * hh(2)));
      if (L > 40 && hh(3) < 0.6) at.push(L * 0.5);
      for (const s of at) {
        const px = ax + ux * s + nx * 0.29, pz = az + uz * s + nz * 0.29;
        if (!inTile(px, pz) || !inZone(px, pz) || nearPad(px, pz, 2.4)) continue;
        const k = field.kindAt(px, pz);
        if (k !== 'gutter' && k !== 'asphalt') continue;
        const y = (field.yAt('gutter', px, pz) ?? field.yAt('asphalt', px, pz) ?? 3.39) + 0.005;
        const buf = getBuf(px, pz, 'cov');
        rect(buf, px, pz, y - 0.001, ux, uz, 0.58, 0.29, ATLAS.plain, 0.5);            // the casting's bed
        rect(buf, px, pz, y, ux, uz, 0.455, 0.23, ATLAS.grate, 1);
        n.basin++;
      }
      // the walk: how wide is it here? (cast inward from the mid-point of the edge)
      const walk = (s, dpos) => {
        const x = ax + ux * s - nx * dpos, z = az + uz * s - nz * dpos;
        return [x, z];
      };
      const sMid = L * (0.25 + 0.5 * hh(4));
      let W = 0;
      while (W < 12 && field.has('sidewalk', ...walk(sMid, W + 0.25))) W += 0.25;
      if (W < 3.2 || W > 10) continue;
      { const bk = field.kindAt(...walk(sMid, W + 0.6)); if (bk && ROAD.has(bk)) continue; }   // a median or an island: no cellar doors on a planted bed
      // steel cellar doors, hinged on the building line: 1.5 m along it, 1.3 m out
      if (hh(5) < 0.28) {
        const d = W - 0.12 - 0.65, [x, z] = walk(sMid, d);
        let ok = true;
        for (const [da, db] of [[0.75, 0.65], [-0.75, 0.65], [0.75, -0.65], [-0.75, -0.65]]) if (!field.has('sidewalk', x + ux * da - nx * db, z + uz * da - nz * db)) ok = false;
        if (ok && inTile(x, z) && inZone(x, z)) {
          const y = (field.yAt('sidewalk', x, z) ?? 3.52) + 0.013, buf = getBuf(x, z, 'cov');
          frameSkirt(buf, x, z, y, ux, uz, 0.80, 0.70, 0.012, 0.55);
          rect(buf, x, z, y, ux, uz, 0.74, 0.64, ATLAS.diamond, 0.95);
          // the meeting line of the two leaves
          rect(buf, x, z, y + 0.0015, ux, uz, 0.006, 0.64, ATLAS.plain, 0.4);
          n.cellar++;
        }
      }
      // a Con Edison service box: 0.6 x 1.2 m of diamond plate in the middle of the walk
      if (hh(6) < 0.2) {
        const d = W * (0.45 + 0.2 * hh(7)), s2 = L * (0.15 + 0.7 * hh(8)), [x, z] = walk(s2, d);
        if (field.has('sidewalk', x, z) && inTile(x, z) && inZone(x, z)) {
          const y = (field.yAt('sidewalk', x, z) ?? 3.52) + 0.012, buf = getBuf(x, z, 'cov');
          frameSkirt(buf, x, z, y, ux, uz, 0.66, 0.36, 0.011, 0.5);
          rect(buf, x, z, y, ux, uz, 0.61, 0.31, ATLAS.diamondHalf, 0.9);
          n.box++;
        }
      }
      // a water or gas valve cap
      if (hh(9) < 0.4) {
        const d = W * (0.15 + 0.7 * hh(10)), s2 = L * (0.1 + 0.8 * hh(11)), [x, z] = walk(s2, d);
        if (field.has('sidewalk', x, z) && inTile(x, z) && inZone(x, z)) {
          const y = (field.yAt('sidewalk', x, z) ?? 3.52) + 0.011;
          disc(getBuf(x, z, 'cov'), x, z, y, 0.085 + 0.05 * hh(12), ATLAS.valve, 0.9, 16);
          n.valve++;
        }
      }
    }
  }
  if (ctx.repairs !== false) buildRepairs(ctx, n);
  return n;
}

// ---- repaving on 125th Street: a resurfaced junction box or a trench restoration (a strip of newer asphalt across the
// Each is the compiled asphalt, bus lane and gutter clipped to the
// row's box and laid as a soft-edged overlay (layMat); the compiled markings (24 mm up) stay on top of the new asphalt.
// `?skrule=1` brings back the old rule-placed boxes (hashes, about half the crossings) and utility cuts; `?sktrench=1` the
// rule-placed trenches.
function buildRepairs(ctx, n) {
  const { field, tile, ox, oz, getBuf, seed } = ctx;
  const inTile = (x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512;
  const tris = [];
  // the gutter too: the compiled corner gutters run on across the intersections, and a repave that stopped at them left light
  // bands crossing the new asphalt (sbs_w2r1/b_b2_fdb.jpg); a cut runs to the kerb. Its strips lie 6-14 mm over the asphalt,
  // so a piece cut from a gutter triangle stays over the one cut from the asphalt under it
  for (const sec of ['asphalt', 'busred', 'gutter']) {
    const a = tile.S[sec]; if (!a) continue;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 2] + oz, a[o + i * 3 + 1]]);
      tris.push({ P, x0: Math.min(P[0][0], P[1][0], P[2][0]), x1: Math.max(P[0][0], P[1][0], P[2][0]), z0: Math.min(P[0][1], P[1][1], P[2][1]), z1: Math.max(P[0][1], P[1][1], P[2][1]) });
    }
  }
  if (!tris.length) return;
  // the road under an oriented rectangle (centre, u axis, half sizes), as up-facing polygons in the patch buffer
  const lay = (cx, cz, ux, uz, hu, hv, tone, tag, lift) => {
    const vx = -uz, vz = ux, R = Math.abs(hu * ux) + Math.abs(hv * vx), Rz = Math.abs(hu * uz) + Math.abs(hv * vz);
    const fu = (p) => (p[0] - cx) * ux + (p[1] - cz) * uz, fv = (p) => (p[0] - cx) * vx + (p[1] - cz) * vz;
    const buf = getBuf(cx, cz, 'patch');
    let any = 0;
    for (const t of tris) {
      if (t.x1 < cx - R || t.x0 > cx + R || t.z1 < cz - Rz || t.z0 > cz + Rz) continue;
      let q = clipHalf(t.P, (p) => -hu - fu(p)); q = clipHalf(q, (p) => fu(p) - hu); q = clipHalf(q, (p) => -hv - fv(p)); q = clipHalf(q, (p) => fv(p) - hv);
      if (q.length < 3) continue;
      let A = 0; for (let k = 0; k < q.length; k++) { const P = q[k], Q = q[(k + 1) % q.length]; A += P[0] * Q[1] - Q[0] * P[1]; }
      if (Math.abs(A) < 0.02) continue;
      // per-vertex tone: the new mat is darker in the middle of the cut, greyed by tyres along the wheel paths
      const poly = A < 0 ? q : q.slice().reverse();
      const ids = poly.map((p) => { const w = 0.94 + 0.12 * hash2(Math.round(p[0] * 2.3) + tag, Math.round(p[1] * 2.3)); return buf.v(p[0], p[2] + lift, p[1], 0, 1, 0, p[0] * 0.9, p[1] * 0.9, tone * w, tone * w, tone * w * 1.01); });
      buf.fan(ids); any++;
    }
    return any;
  };
  // trenches along the corridor line: off unless `?sktrench=1`
  const TRENCH = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sktrench') === '1';
  if (TRENCH) for (let i = 1; i < LINE.length; i++) {
    const [x0, z0] = LINE[i - 1], [x1, z1] = LINE[i], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1) continue;
    const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    for (let s = 3.5; s < L; s += 7) {
      const x = x0 + ux * s, z = z0 + uz * s;
      if (!inTile(x, z)) continue;
      const h = hash2(Math.round(x * 3) + 17, Math.round(z * 3) + seed * 7);
      if (h > 0.1) continue;
      const near = Object.values(CROSS).some((c) => Math.hypot(c[1] - x, c[2] - z) < 20);
      if (near) continue;
      const h2 = hash2(Math.round(x * 5), Math.round(z * 5) + 3), hw = 0.45 + 0.95 * h2;
      // across the street: u = the street's normal, 15 m either way (the clip finds the kerbs)
      const tone = 0.55 + 0.35 * hash2(Math.round(x * 7), Math.round(z * 7) + 11);
      if (lay(x, z, -uz, ux, 15, hw, tone, i * 31 + Math.round(s), 0.0035)) n.trench = (n.trench || 0) + 1;
    }
  }
  // the corridor direction at a point
  const dirAt = (x, z) => {
    let ux = 1, uz = 0, bd = 1e9;
    for (let i = 1; i < LINE.length; i++) {
      const [ax, az] = LINE[i - 1], [bx, bz] = LINE[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); ux = dx / L; uz = dz / L; }
    }
    return [ux, uz];
  };
  // the old rule (`?skrule=1` only): intersections resurfaced on their own, the box between the four kerb returns
  if (RULE) for (const [name, c] of Object.entries(CROSS)) {
    const x = c[1], z = c[2];
    if (!inTile(x, z)) continue;
    if (hash2(Math.round(x), Math.round(z) + seed) > 0.5) continue;
    const [ux, uz] = dirAt(x, z);
    const tone = 0.58 + 0.3 * hash2(Math.round(x * 3), Math.round(z * 3) + 5);
    if (lay(x, z, ux, uz, 13 + 4 * hash2(Math.round(x), 7), 11 + 3 * hash2(Math.round(z), 9), tone, 7777, 0.0015)) n.repave = (n.repave || 0) + 1;
  }
  if (!RULE) for (const row of REPAVES) {
    const c = CROSS[row.at]; if (!c) continue;
    const [ux, uz] = dirAt(c[1], c[2]), vx = -uz, vz = ux;
    const uc = (row.u[0] + row.u[1]) / 2, vc = (row.v[0] + row.v[1]) / 2;
    const x = c[1] + ux * uc + vx * vc, z = c[2] + uz * uc + vz * vc;
    if (!inTile(x, z)) continue;
    const k = layMat(tris, getBuf, x, z, ux, uz, (row.u[1] - row.u[0]) / 2, (row.v[1] - row.v[0]) / 2, row.ratio / PATCH_BASE, 0.0015);
    if (k) { n.repave = (n.repave || 0) + 1; n.repaveTris = (n.repaveTris || 0) + k; }
  }
}

// nothing is laid by rule). u: along 125th eastward,
// v: south, metres from the row's CROSS point. ratio: the new asphalt's albedo against the old asphalt beside it (linear),
// measured in the same frame and light. Lenox: the inner edges of the junction's four compiled crossings
// (paintW bars, node probe 2026-10-02: the crossings over 125th at u -19.85..-12.23 and 12.05..19.67, those over the avenue at
// v -14.5..-9.9 and 9.8..14.4), so the mat stops at the crossings as. A row is laid by the tile holding its
// box's centre and clipped to that tile's road: keep a box inside one tile (both rows are: 4_-6, 3_-6).
export const REPAVES = [
  // junction box, the crossings left on the old asphalt, the mat's edge ragged along the bar ends; mat sRGB (110,109,105),
  // neutral, against (127,124,116) between the bars, warmer: 0.73 of it (linear luminance). Darker, not black.
  { at: 'lenox', u: [-12.2, 12.0], v: [-9.9, 9.8], ratio: 0.73 },
  // 2024-08 puts its edges at s 1300.0 / 1302.2 (b -0.6..+7.6 in frame) and
  // band (131,131,129)-(136,135,135) against the old asphalt beside it
  // (156,154,149): 0.70-0.76 linear
  { at: 'fdb', u: [6.0, 8.9], v: [-10.0, 10.0], ratio: 0.73 },
];
// the asphalt_patch material's albedo at vertex tone 1 against the ground shader's asphalt, as drawn (linear luminance of the
// final frame): at tone 2.48 the Lenox mat drew 0.82-0.91 of the old asphalt between the bars (s2_after/lenox_s2, 2026-10-02),
// so 0.35. (QA's A/B at 12th Av, the old box at tone 0.753: 0.22, i.e. 0.29: the tone curve is not linear; recheck after a
// change of the ground's asphalt or of the exposure.)
const PATCH_BASE = 0.35;
// the mat is cooler than the old asphalt round it: its R - B is 6 sRGB levels under the old asphalt's (5 vs 11);
// the twin's mat drew warmer than its old asphalt with a neutral vertex colour (s2_after) and level with it at (0.93, 1, 1.09)
// (s2b: R - B 15 vs 14): red and blue moved on to close the rest; at (0.90, 1, 1.23) the mat drew (134,127,129), a shade of
// magenta (s2c): green up, blue down a little
const MAT_RGB = [0.90, 1.02, 1.19];

// smooth value noise in [0, 1] (bilinear over a hashed lattice, smoothstep weights)
function vnoise(x, z, seed = 0) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(i + seed * 131, j), b = hash2(i + 1 + seed * 131, j), c = hash2(i + seed * 131, j + 1), d = hash2(i + 1 + seed * 131, j + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
// A resurfaced box as fresh asphalt reads: the compiled road (asphalt, bus lane, gutter) under an oriented box, laid in the
// alpha 'repave' buffer. Inside, alpha 1 and a slow tone drift (+-5 % over metres). The edge follows a ragged line (the old
// asphalt crumbles into the mat: up to 0.55 m in, wavelengths 0.7 and 2.6 m), crisp (alpha over 6 cm), with the sealed joint
// along it: a dark band 0.08-0.22 m wide at 0.65 of the mat (lenox_s2: 73-93 sRGB against the mat's 93-108, 25-42 px wide at
// ~5 m). Cells of 6 cm across the edge band and 20 cm along it carry the line. Returns the triangles laid.
const FEATHER = 0.06, RAG = 0.55, JOINT = [0.08, 0.22], JOINT_TONE = 0.65, BAND = RAG + FEATHER + JOINT[1] + 0.1;
function layMat(tris, getBuf, cx, cz, ux, uz, hu, hv, tone, lift) {
  const vx = -uz, vz = ux, R = Math.abs(hu * ux) + Math.abs(hv * vx), Rz = Math.abs(hu * uz) + Math.abs(hv * vz);
  const fu = (p) => (p[0] - cx) * ux + (p[1] - cz) * uz, fv = (p) => (p[0] - cx) * vx + (p[1] - cz) * vz;
  const buf = getBuf(cx, cz, 'repave');
  const near = tris.filter((t) => !(t.x1 < cx - R || t.x0 > cx + R || t.z1 < cz - Rz || t.z0 > cz + Rz));
  // the road triangles binned on a 2 m grid (the edge band is ~10,000 small cells)
  const G = 2, bins = new Map(), key = (i, j) => i * 100003 + j;
  near.forEach((t, n) => { for (let i = Math.floor(t.x0 / G); i <= Math.floor(t.x1 / G); i++) for (let j = Math.floor(t.z0 / G); j <= Math.floor(t.z1 / G); j++) { const kk = key(i, j); let b = bins.get(kk); if (!b) bins.set(kk, (b = [])); b.push(n); } });
  const stamp = new Int32Array(near.length); let pass = 0;
  const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // how far in the ragged line lies, along an edge (s = metres along it, e = which edge)
  const ragM = new Map();   // the cells' vertices share their along-edge coordinates
  const rag = (s, e) => {
    const kk = e * 1e8 + Math.round(s * 1000); let r = ragM.get(kk);
    if (r === undefined) { r = RAG * (0.45 * vnoise(s / 0.7, e * 7.3, 3) + 0.55 * vnoise(s / 2.6, e * 3.1, 5)); ragM.set(kk, r); }
    return r;
  };
  // distance inside the ragged line (the nearest of the four edges), and the edge's own coordinate there
  const inside = (u, v) => {
    const d = [u + hu - rag(v, 0), hu - u - rag(v, 1), v + hv - rag(u, 2), hv - v - rag(u, 3)];
    let k = 0; for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
    return [d[k], k < 2 ? v : u, k];
  };
  const shade = (u, v) => {
    const [d, s, e] = inside(u, v), jw = JOINT[0] + (JOINT[1] - JOINT[0]) * vnoise(s / 1.3, e * 5.7, 13);
    return [sm(0, FEATHER, d), 1 - (1 - JOINT_TONE) * (1 - sm(jw, jw + 0.05, d))];
  };
  const toneAt = (x, z) => tone * (0.95 + 0.1 * vnoise(x / 3.3, z / 3.3, 9)) * (0.97 + 0.06 * vnoise(x / 0.9, z / 0.9, 11));
  let k = 0;
  // the road triangles clipped to a box in (u, v); every vertex gets its own alpha and tone
  const clipTo = (u0, u1, v0, v1) => {
    const xs = [u0, u1].flatMap((a) => [v0, v1].map((b) => cx + ux * a + vx * b)), zs = [u0, u1].flatMap((a) => [v0, v1].map((b) => cz + uz * a + vz * b));
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs);
    const cand = []; pass++;
    for (let i = Math.floor(bx0 / G); i <= Math.floor(bx1 / G); i++) for (let j = Math.floor(bz0 / G); j <= Math.floor(bz1 / G); j++) {
      const b = bins.get(key(i, j)); if (b) for (const n of b) if (stamp[n] !== pass) { stamp[n] = pass; cand.push(near[n]); }
    }
    for (const t of cand) {
      if (t.x1 < bx0 || t.x0 > bx1 || t.z1 < bz0 || t.z0 > bz1) continue;
      let q = clipHalf(t.P, (p) => u0 - fu(p)); q = clipHalf(q, (p) => fu(p) - u1); q = clipHalf(q, (p) => v0 - fv(p)); q = clipHalf(q, (p) => fv(p) - v1);
      if (q.length < 3) continue;
      let A = 0; for (let m = 0; m < q.length; m++) { const P = q[m], Q = q[(m + 1) % q.length]; A += P[0] * Q[1] - Q[0] * P[1]; }
      if (Math.abs(A) < 1e-5) continue;
      const poly = A < 0 ? q : q.slice().reverse();
      const sh = poly.map((p) => shade(fu(p), fv(p)));
      if (sh.every((a) => a[0] < 0.004)) continue;
      const ids = poly.map((p, m) => { const w = toneAt(p[0], p[1]) * sh[m][1]; return buf.v(p[0], p[2] + lift, p[1], 0, 1, 0, p[0] * 0.9, p[1] * 0.9, w * MAT_RGB[0], w * MAT_RGB[1], w * MAT_RGB[2], sh[m][0]); });
      buf.fan(ids); k += poly.length - 2;
    }
  };
  // the inside in one piece, then the edge band in cells (6 cm across the edge, 20 cm along it)
  if (hu > BAND && hv > BAND) clipTo(-hu + BAND, hu - BAND, -hv + BAND, hv - BAND);
  const cells = (u0, u1, v0, v1, cu, cv) => {
    const nu = Math.max(1, Math.ceil((u1 - u0) / cu)), nv = Math.max(1, Math.ceil((v1 - v0) / cv));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) clipTo(u0 + ((u1 - u0) * i) / nu, u0 + ((u1 - u0) * (i + 1)) / nu, v0 + ((v1 - v0) * j) / nv, v0 + ((v1 - v0) * (j + 1)) / nv);
  };
  cells(-hu, -hu + BAND, -hv, hv, 0.06, 0.2); cells(hu - BAND, hu, -hv, hv, 0.06, 0.2);
  cells(-hu + BAND, hu - BAND, -hv, -hv + BAND, 0.2, 0.06); cells(-hu + BAND, hu - BAND, hv - BAND, hv, 0.2, 0.06);
  return k;
}
