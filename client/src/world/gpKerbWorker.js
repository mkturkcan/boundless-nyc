// GP31 kerb frame, computed off the main thread (world/materials.js, gpKerbAsync). The ground mesh carries only position
// and matId: no lane position, no street bearing. Every kerb face (matId 2) is an exact piece of a kerb line, so each
// roadway, paint and sidewalk triangle finds the nearest kerb line and the kerb facing it across the street, and each of
// its vertices stores, as Uint16:
//   x  the across-street coordinate: signed metres from the CANONICAL kerb (the one whose normal into the street points
//      to +x), + 320 m, in cm, + 1 (0 = no kerb within reach). One side is chosen per street so the coordinate runs
//      continuously across the centreline instead of folding back at it (a fold mirrors every pattern about the centre)
//   y  metres to the nearest kerb line, cm + 1
//   z  the street width between the two kerb lines, cm + 1 (0 = no facing kerb within 46 m)
//   w  the canonical normal's angle in (-pi/2, pi/2], (a + pi/2) / pi x 65534 + 1
// Distances to lines are linear in position, so all four interpolate exactly inside a triangle. The first version ran on
// the main thread with a 34 m radius scan and blocked frames for about a second per tile (the fps sample read 0).
const CELL = 4;
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') self.onmessage = (e) => {
  const { id, pos, mat, gp32 } = e.data;
  const t0 = performance.now();
  const r = kerbFrame(pos, mat, { gp32: !!gp32 });
  self.postMessage({ id, out: r.out, segs: r.segs, tris: r.tris, quads: r.quads, ties: r.ties, ghosts: r.ghosts, ms: performance.now() - t0 }, [r.out.buffer]);
};
export function kerbFrame(P, M, opts = {}) {
  const nv = M.length;
  const out = new Uint16Array(nv * 4);
  // kerb segments: the longest horizontal edge of each kerb-face triangle
  const sx = [], sz = [], ex = [], ez = [];
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (let v = 0; v + 2 < nv; v += 3) {
    if (M[v] !== 2) continue;
    let best = -1, bi = 0, bj = 1;
    for (let k = 0; k < 3; k++) {
      const i = v + k, j = v + (k + 1) % 3, dx = P[i * 3] - P[j * 3], dz = P[i * 3 + 2] - P[j * 3 + 2], d = dx * dx + dz * dz;
      if (d > best) { best = d; bi = i; bj = j; }
    }
    if (best < 0.04) continue;
    sx.push(P[bi * 3]); sz.push(P[bi * 3 + 2]); ex.push(P[bj * 3]); ez.push(P[bj * 3 + 2]);
    minx = Math.min(minx, P[bi * 3], P[bj * 3]); maxx = Math.max(maxx, P[bi * 3], P[bj * 3]);
    minz = Math.min(minz, P[bi * 3 + 2], P[bj * 3 + 2]); maxz = Math.max(maxz, P[bi * 3 + 2], P[bj * 3 + 2]);
  }
  const ns = sx.length;
  if (!ns) { gravelEdges(P, M, out); return { out, segs: 0, tris: 0, quads: 0 }; }
  minx -= 50; minz -= 50; maxx += 50; maxz += 50;
  const gw = Math.ceil((maxx - minx) / CELL) + 1, gh = Math.ceil((maxz - minz) / CELL) + 1;
  // cell -> segment list (CSR)
  const cnt = new Int32Array(gw * gh + 1);
  const cellsOf = (s, fn) => {
    const x0 = Math.floor((Math.min(sx[s], ex[s]) - minx) / CELL), x1 = Math.floor((Math.max(sx[s], ex[s]) - minx) / CELL);
    const z0 = Math.floor((Math.min(sz[s], ez[s]) - minz) / CELL), z1 = Math.floor((Math.max(sz[s], ez[s]) - minz) / CELL);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(z * gw + x);
  };
  for (let s = 0; s < ns; s++) cellsOf(s, (c) => cnt[c + 1]++);
  for (let c = 0; c < gw * gh; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, gw * gh), lst = new Int32Array(cnt[gw * gh]);
  for (let s = 0; s < ns; s++) cellsOf(s, (c) => { lst[fill[c]++] = s; });
  // per-segment unit normal (sign fixed per query) and length
  const nx = new Float32Array(ns), nz = new Float32Array(ns);
  for (let s = 0; s < ns; s++) { const dx = ex[s] - sx[s], dz = ez[s] - sz[s], l = Math.hypot(dx, dz); nx[s] = -dz / l; nz[s] = dx / l; }
  const stamp = new Int32Array(ns).fill(-1);
  let tris = 0;
  const ROAD = new Set([0, 3, 4, 9, 11, 12]);
  for (let v = 0; v + 2 < nv; v += 3) {
    const mid = M[v];
    const road = ROAD.has(mid);
    if (!road && mid !== 1) continue;
    tris++;
    const cx = (P[v * 3] + P[v * 3 + 3] + P[v * 3 + 6]) / 3, cz = (P[v * 3 + 2] + P[v * 3 + 5] + P[v * 3 + 8]) / 3;
    const gx = Math.floor((cx - minx) / CELL), gz = Math.floor((cz - minz) / CELL);
    // 1. the nearest kerb segment: square rings outward until the ring cannot hold anything nearer
    let b1 = -1, d1 = Infinity;
    const RMAX = road ? 9 : 3;
    for (let r = 0; r <= RMAX; r++) {
      if (b1 >= 0 && (r - 1) * CELL > Math.sqrt(d1)) break;
      for (let z = gz - r; z <= gz + r; z++) for (let x = gx - r; x <= gx + r; x++) {
        if (r > 0 && z !== gz - r && z !== gz + r && x !== gx - r && x !== gx + r) continue;
        if (x < 0 || z < 0 || x >= gw || z >= gh) continue;
        const c = z * gw + x;
        for (let k = cnt[c]; k < cnt[c + 1]; k++) {
          const s = lst[k];
          if (stamp[s] === v) continue; stamp[s] = v;
          const dx = ex[s] - sx[s], dz = ez[s] - sz[s];
          const t = Math.max(0, Math.min(1, ((cx - sx[s]) * dx + (cz - sz[s]) * dz) / (dx * dx + dz * dz)));
          const px = sx[s] + dx * t - cx, pz = sz[s] + dz * t - cz, dd = px * px + pz * pz;
          if (dd < d1) { d1 = dd; b1 = s; }
        }
      }
    }
    if (b1 < 0) continue;
    // its normal, into the street (toward the centroid)
    let n1x = nx[b1], n1z = nz[b1];
    if ((cx - sx[b1]) * n1x + (cz - sz[b1]) * n1z < 0) { n1x = -n1x; n1z = -n1z; }
    // 2. the facing kerb: walk the ray centroid + n1 t across the street, the first segment it crosses past 1.5 m whose
    // normal is within ~25 deg of anti-parallel
    let b2 = -1, t2 = Infinity;
    if (road) {
      for (let t = 0; t <= 46 && b2 < 0; t += CELL * 0.5) {
        const qx = Math.floor((cx + n1x * t - minx) / CELL), qz = Math.floor((cz + n1z * t - minz) / CELL);
        for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
          const x = qx + ox, z = qz + oz;
          if (x < 0 || z < 0 || x >= gw || z >= gh) continue;
          const c = z * gw + x;
          for (let k = cnt[c]; k < cnt[c + 1]; k++) {
            const s = lst[k];
            if (s === b1 || stamp[s] === -2 - v) continue; stamp[s] = -2 - v;
            if (Math.abs(nx[s] * n1x + nz[s] * n1z) < 0.9) continue;
            // ray (c + n1 t) against segment s: solve c + n1 t = a + (b - a) u
            const dx = ex[s] - sx[s], dz = ez[s] - sz[s];
            const den = n1x * dz - n1z * dx;
            if (Math.abs(den) < 1e-6) continue;
            const ax = sx[s] - cx, az = sz[s] - cz;
            const tt = (ax * dz - az * dx) / den, u = (ax * n1z - az * n1x) / den;
            if (tt > 1.5 && tt < t2 && u >= -0.05 && u <= 1.05) { t2 = tt; b2 = s; }
          }
        }
      }
    }
    let n2x = 0, n2z = 0;
    if (b2 >= 0) { n2x = nx[b2]; n2z = nz[b2]; if ((cx - sx[b2]) * n2x + (cz - sz[b2]) * n2z < 0) { n2x = -n2x; n2z = -n2z; } }
    // canonical side: the kerb whose into-street normal points to +x (ties to +z)
    const canon1 = n1x > 1e-6 || (Math.abs(n1x) <= 1e-6 && n1z > 0);
    const ncx = canon1 ? n1x : -n1x, ncz = canon1 ? n1z : -n1z;
    const ang = Math.atan2(ncz, ncx);                          // in (-pi/2, pi/2]
    const wq = Math.round((ang + Math.PI / 2) / Math.PI * 65534) + 1;
    for (let k = 0; k < 3; k++) {
      const i = v + k, x = P[i * 3], z = P[i * 3 + 2];
      const e1 = (x - sx[b1]) * n1x + (z - sz[b1]) * n1z;    // metres from kerb 1's line, + into the street
      const e2 = b2 >= 0 ? (x - sx[b2]) * n2x + (z - sz[b2]) * n2z : 0;
      let qy;
      if (canon1) qy = e1;
      else if (b2 >= 0) qy = e2;                               // measured from the facing (canonical) kerb
      else qy = -e1;                                           // no facing kerb: the far side, negative
      out[i * 4] = Math.max(1, Math.min(65535, Math.round((qy + 320) * 100) + 1));
      out[i * 4 + 1] = Math.max(1, Math.min(65535, Math.round(Math.max(0, b2 >= 0 ? Math.min(e1, e2) : e1) * 100) + 1));
      out[i * 4 + 2] = b2 >= 0 ? Math.max(1, Math.min(65535, Math.round((e1 + e2) * 100) + 1)) : 0;
      out[i * 4 + 3] = wq;
    }
  }
  // paint: a marking is a run of rectangles (a crosswalk bar, a stop bar, a lane dash, a piece of a line), each two
  // consecutive triangles sharing a diagonal. Its vertices trade the lane-layout channels (y, z), which paint does not
  // use, for the rectangle's own frame: y = signed metres across the marking from its centre line, + 300 m, cm + 1, and
  // z = its half width, cm + 1. The fragment then has its exact distance to the marking's long edges, z - |y|, where the
  // film wears back first (1-5 cm, ragged). Anything that is not a clean rectangle (legend glyphs, arrows) keeps 0.
  let quads = 0;
  for (let i = 0; i < nv; i++) if (M[i] === 3 || M[i] === 4) { out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; }
  for (let v = 0; v + 5 < nv; v += 3) {
    const mid = M[v];
    if ((mid !== 3 && mid !== 4) || M[v + 3] !== mid) continue;
    // the four distinct corners of the pair
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const i = v + k, x = P[i * 3], z = P[i * 3 + 2];
      if (!pts.some((p) => Math.abs(p[0] - x) < 1e-3 && Math.abs(p[1] - z) < 1e-3)) pts.push([x, z]);
    }
    if (pts.length !== 4) continue;
    // order round the centroid, then test for a rectangle: four right angles within ~8 deg
    const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
    pts.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    let ok = true; const E = [];
    for (let k = 0; k < 4; k++) { const p = pts[k], q = pts[(k + 1) % 4]; E.push([q[0] - p[0], q[1] - p[1]]); }
    for (let k = 0; k < 4 && ok; k++) {
      const e = E[k], f = E[(k + 1) % 4], le = Math.hypot(e[0], e[1]), lf = Math.hypot(f[0], f[1]);
      if (le < 0.02 || lf < 0.02 || Math.abs((e[0] * f[0] + e[1] * f[1]) / (le * lf)) > 0.14) ok = false;
    }
    if (!ok) continue;
    const l0 = Math.hypot(E[0][0], E[0][1]), l1 = Math.hypot(E[1][0], E[1][1]);
    const sh = l0 < l1 ? E[0] : E[1], hw = Math.min(l0, l1) / 2;   // the short side runs across the marking
    if (hw > 0.65) continue;                                          // wider than a stop bar: not a line
    const ls = Math.hypot(sh[0], sh[1]), ux = sh[0] / ls, uz = sh[1] / ls;
    // two draws in one: the bar's own (24 levels) and its crossing's, from the 55 m grid-frame cell of the bar's centre
    // (25 levels); the grid frame is the shader's gG (MG_A, MG_B)
    const fr = (x) => { const h = Math.sin(x) * 43758.5453; return h - Math.floor(h); };
    const gx = cx * 0.8744 + cz * 0.4853, gz = -cx * 0.4853 + cz * 0.8744;
    const rk = 25 * Math.floor(fr(cx * 12.9898 + cz * 78.233) * 24) + Math.floor(fr(Math.floor(gx / 55) * 127.1 + Math.floor(gz / 55) * 311.7) * 25);
    for (let k = 0; k < 6; k++) {
      const i = v + k, su = (P[i * 3] - cx) * ux + (P[i * 3 + 2] - cz) * uz;
      out[i * 4 + 1] = Math.max(1, Math.min(65535, Math.round((su + 300) * 100) + 1));
      out[i * 4 + 2] = Math.max(1, Math.round(hw * 100) + 1) + 100 * rk;   // + 100 x the rectangle's own draw (0-599)
    }
    quads++;
    v += 3;                                                           // the pair is consumed
  }
  // Bryant Park's walks (matId 17): the walk's edges are the boundary edges of the gravel triangles (edges only one gravel
  // triangle uses). A walk polygon has no interior vertices, so a per-vertex distance to the nearest edge would read 0
  // everywhere; as for the kerbs, each triangle takes the nearest edge line and the one facing it across the walk and its
  // vertices store the distance to both (x, y: cm + 1; 0 = none within 12 m), exact under interpolation. The shader heaps
  // the loose stone along the edge, darkens the band where the chairs stand and keeps the middle trodden.
  gravelEdges(P, M, out);
  const g32 = opts.gp32 ? gp32Ties(P, M, out, { sx, sz, ex, ez, cnt, lst, minx, minz, gw, gh }) : { ties: 0, ghosts: 0 };
  return { out, segs: ns, tris, quads, ties: g32.ties, ghosts: g32.ghosts };
}
// GP32 (owner 2026-09-29 on the fTraffic take: "Asphalt decals/material have clear z fighting that's terrible").
// Measured cause (docs/notes/ground-gp32.md): the compiler's junction boxes overlap each other and its cap fans overlap
// the road ends, so a junction is a stack of coincident asphalt triangles at one height (125th and Lenox: two to six at
// every point of the box). A coplanar pair of one material is an exact depth tie at any range. GM28 drew both the same
// colour (its asphalt was a function of world position only); the GP31 frame above is per triangle, so the two sides of
// a tie drew different cracks, tracks and drips and the winner flipped pixel by pixel: 353 m2 round the junction of 125th
// and Lenox, the whole box and the median's sidewalk strips. Every triangle of a group (asphalt, gutter and bus lane share the
// asphalt branch; sidewalk; each paint colour) that overlaps another of its group within 3 cm of height gets no frame
// (all four channels 0): the shader then lays everything out from world position alone (its block-mask fallback), and
// both sides of the tie draw the same pixel again. Second finding, same pass: the corner-return gutters (matId 11) are
// fillet arcs that lie 1-3 m out in the junction where the kerbs meet at a square corner (29.6 m2 more than 1 m from any
// kerb segment round 125th and Lenox), drawn with the gutter's grit and catch-basin stripes: the tan "Y" marks. A gutter
// triangle that lies over the asphalt with its centroid over 0.9 m from every kerb segment is flagged (y = 65535) and the
// shader draws it as the asphalt it lies on (a kerb-side gutter lies beside the asphalt, never over it, and a gutter at
// a tile edge whose kerb faces are in the next tile is left alone).
function gp32Ties(P, M, out, K) {
  const nv = M.length;
  const GRP = (m) => (m === 0 || m === 11 || m === 12) ? 1 : m === 1 ? 2 : m === 3 ? 3 : m === 4 ? 4 : m === 9 ? 5 : 0;
  // candidate triangles and their bounding boxes
  const list = [];
  for (let v = 0; v + 2 < nv; v += 3) if (GRP(M[v])) list.push(v);
  const n = list.length;
  if (!n) return { ties: 0, ghosts: 0 };
  const bx0 = new Float32Array(n), bz0 = new Float32Array(n), bx1 = new Float32Array(n), bz1 = new Float32Array(n);
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
  for (let k = 0; k < n; k++) {
    const v = list[k];
    const x0 = P[v * 3], x1 = P[v * 3 + 3], x2 = P[v * 3 + 6], z0 = P[v * 3 + 2], z1 = P[v * 3 + 5], z2 = P[v * 3 + 8];
    bx0[k] = Math.min(x0, x1, x2); bx1[k] = Math.max(x0, x1, x2); bz0[k] = Math.min(z0, z1, z2); bz1[k] = Math.max(z0, z1, z2);
    mnx = Math.min(mnx, bx0[k]); mnz = Math.min(mnz, bz0[k]); mxx = Math.max(mxx, bx1[k]); mxz = Math.max(mxz, bz1[k]);
  }
  const C = 3, gw = Math.ceil((mxx - mnx) / C) + 1, gh = Math.ceil((mxz - mnz) / C) + 1;
  const cnt = new Int32Array(gw * gh + 1);
  const span = (k, fn) => {
    const i0 = Math.floor((bx0[k] - mnx) / C), i1 = Math.floor((bx1[k] - mnx) / C), j0 = Math.floor((bz0[k] - mnz) / C), j1 = Math.floor((bz1[k] - mnz) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * gw + i);
  };
  for (let k = 0; k < n; k++) span(k, (c) => cnt[c + 1]++);
  for (let c = 0; c < gw * gh; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, gw * gh), lst = new Int32Array(cnt[gw * gh]);
  for (let k = 0; k < n; k++) span(k, (c) => { lst[fill[c]++] = k; });
  const tied = new Uint8Array(n), overA = new Uint8Array(n);   // overA: a gutter or bus-lane piece lying over the asphalt
  const grp = new Uint8Array(n);
  for (let k = 0; k < n; k++) grp[k] = GRP(M[list[k]]);
  // the overlap of two triangles in plan: clip A by B's three edges (Sutherland-Hodgman) with B shrunk 5 mm, so a shared
  // edge or a touching corner is not an overlap; returns the centroid of the clipped polygon or null
  const px = new Float64Array(12), pz = new Float64Array(12), qx = new Float64Array(12), qz = new Float64Array(12), ov = new Float64Array(2);
  // separating axis first (an edge of either triangle with the other wholly outside it, 5 mm of penetration allowed):
  // most candidate pairs are neighbours or near misses and stop here
  const sepE = (ux, uz, wx, wz, rx, rz, t0x, t0z, t1x, t1z, t2x, t2z) => {
    let nx = uz - wz, nz = wx - ux;
    const l = Math.hypot(nx, nz); if (l < 1e-9) return false;
    nx /= l; nz /= l;
    const d = nx * ux + nz * uz, sg = (nx * rx + nz * rz - d) > 0 ? -1 : 1;
    return Math.min(sg * (nx * t0x + nz * t0z - d), sg * (nx * t1x + nz * t1z - d), sg * (nx * t2x + nz * t2z - d)) > -0.005;
  };
  const overlapAt = (va, vb) => {
    const a0x = P[va * 3], a0z = P[va * 3 + 2], a1x = P[va * 3 + 3], a1z = P[va * 3 + 5], a2x = P[va * 3 + 6], a2z = P[va * 3 + 8];
    const b0x = P[vb * 3], b0z = P[vb * 3 + 2], b1x = P[vb * 3 + 3], b1z = P[vb * 3 + 5], b2x = P[vb * 3 + 6], b2z = P[vb * 3 + 8];
    if (sepE(a0x, a0z, a1x, a1z, a2x, a2z, b0x, b0z, b1x, b1z, b2x, b2z) || sepE(a1x, a1z, a2x, a2z, a0x, a0z, b0x, b0z, b1x, b1z, b2x, b2z)
      || sepE(a2x, a2z, a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z, b2x, b2z) || sepE(b0x, b0z, b1x, b1z, b2x, b2z, a0x, a0z, a1x, a1z, a2x, a2z)
      || sepE(b1x, b1z, b2x, b2z, b0x, b0z, a0x, a0z, a1x, a1z, a2x, a2z) || sepE(b2x, b2z, b0x, b0z, b1x, b1z, a0x, a0z, a1x, a1z, a2x, a2z)) return null;
    let m = 3;
    px[0] = a0x; pz[0] = a0z; px[1] = a1x; pz[1] = a1z; px[2] = a2x; pz[2] = a2z;
    const sB = ((b1x - b0x) * (b2z - b0z) - (b1z - b0z) * (b2x - b0x)) > 0 ? 1 : -1;   // B's winding
    for (let e = 0; e < 3; e++) {
      const ux = e === 0 ? b0x : e === 1 ? b1x : b2x, uz = e === 0 ? b0z : e === 1 ? b1z : b2z;
      const wx = e === 0 ? b1x : e === 1 ? b2x : b0x, wz = e === 0 ? b1z : e === 1 ? b2z : b0z;
      const ex = wx - ux, ez = wz - uz, el = Math.hypot(ex, ez);
      if (el < 1e-6) return null;
      let o = 0;
      for (let k = 0; k < m; k++) {
        const k2 = k + 1 === m ? 0 : k + 1;
        const d1 = sB * (ex * (pz[k] - uz) - ez * (px[k] - ux)) / el - 0.005;   // metres inside the edge, less 5 mm
        const d2 = sB * (ex * (pz[k2] - uz) - ez * (px[k2] - ux)) / el - 0.005;
        if (d1 >= 0) { qx[o] = px[k]; qz[o] = pz[k]; o++; }
        if ((d1 >= 0) !== (d2 >= 0)) { const t = d1 / (d1 - d2); qx[o] = px[k] + (px[k2] - px[k]) * t; qz[o] = pz[k] + (pz[k2] - pz[k]) * t; o++; }
        if (o > 10) break;
      }
      m = o;
      if (m < 3) return null;
      for (let k = 0; k < m; k++) { px[k] = qx[k]; pz[k] = qz[k]; }
    }
    let A = 0, gx = 0, gz = 0;
    for (let k = 0; k < m; k++) { const k2 = k + 1 === m ? 0 : k + 1, c = px[k] * pz[k2] - px[k2] * pz[k]; A += c; gx += (px[k] + px[k2]) * c; gz += (pz[k] + pz[k2]) * c; }
    if (Math.abs(A) < 2e-4) return null;   // under 1 cm2
    ov[0] = gx / (3 * A); ov[1] = gz / (3 * A);
    return ov;
  };
  const yAt = (v, x, z) => {
    const x0 = P[v * 3], z0 = P[v * 3 + 2], x1 = P[v * 3 + 3], z1 = P[v * 3 + 5], x2 = P[v * 3 + 6], z2 = P[v * 3 + 8];
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(d) < 1e-12) return P[v * 3 + 1];
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    return l0 * P[v * 3 + 1] + l1 * P[v * 3 + 4] + (1 - l0 - l1) * P[v * 3 + 7];
  };
  for (let c = 0; c < gw * gh; c++) {
    for (let a = cnt[c]; a < cnt[c + 1]; a++) {
      const ka = lst[a], va = list[ka], ga = grp[ka];
      for (let b = a + 1; b < cnt[c + 1]; b++) {
        const kb = lst[b];
        if (grp[kb] !== ga || (tied[ka] && tied[kb])) continue;
        const vb = list[kb];
        if (bx0[ka] > bx1[kb] - 0.01 || bx0[kb] > bx1[ka] - 0.01 || bz0[ka] > bz1[kb] - 0.01 || bz0[kb] > bz1[ka] - 0.01) continue;
        // each pair once: in the cell that holds the low corner of the two boxes' intersection
        if (Math.floor((Math.max(bz0[ka], bz0[kb]) - mnz) / C) * gw + Math.floor((Math.max(bx0[ka], bx0[kb]) - mnx) / C) !== c) continue;
        // neighbours of one triangulation share an edge and never overlap (an exact duplicate shares all three corners and
        // took the same frame from the same centroid); every other pair is clipped. No pair is skipped for having equal
        // frames: a triangle that loses its frame to one partner must take its equal-framed twins with it
        let sh = 0;
        for (let i = 0; i < 3 && sh < 2; i++) for (let j = 0; j < 3; j++) {
          if (Math.abs(P[(va + i) * 3] - P[(vb + j) * 3]) < 1e-3 && Math.abs(P[(va + i) * 3 + 2] - P[(vb + j) * 3 + 2]) < 1e-3) { sh++; break; }
        }
        if (sh >= 2) continue;
        const p = overlapAt(va, vb);
        if (!p) continue;
        if (Math.abs(yAt(va, p[0], p[1]) - yAt(vb, p[0], p[1])) < 0.03) {
          tied[ka] = 1; tied[kb] = 1;
          if (M[vb] === 0) overA[ka] = 1;
          if (M[va] === 0) overA[kb] = 1;
        }
      }
    }
  }
  let ties = 0, ghosts = 0;
  for (let k = 0; k < n; k++) {
    const v = list[k];
    let ghost = false;
    if (M[v] === 11 && overA[k] && K.sx.length) {
      // the centroid's distance to the nearest kerb SEGMENT (the frame above measures to the kerb's line, which runs on
      // through the junction past the kerb's end)
      const cx = (P[v * 3] + P[v * 3 + 3] + P[v * 3 + 6]) / 3, cz = (P[v * 3 + 2] + P[v * 3 + 5] + P[v * 3 + 8]) / 3;
      const gx = Math.floor((cx - K.minx) / CELL), gz = Math.floor((cz - K.minz) / CELL);
      let d2 = Infinity;
      for (let z = gz - 1; z <= gz + 1; z++) for (let x = gx - 1; x <= gx + 1; x++) {
        if (x < 0 || z < 0 || x >= K.gw || z >= K.gh) continue;
        const cc = z * K.gw + x;
        for (let q = K.cnt[cc]; q < K.cnt[cc + 1]; q++) {
          const s = K.lst[q];
          const dx = K.ex[s] - K.sx[s], dz = K.ez[s] - K.sz[s];
          const t = Math.max(0, Math.min(1, ((cx - K.sx[s]) * dx + (cz - K.sz[s]) * dz) / (dx * dx + dz * dz)));
          const ux = K.sx[s] + dx * t - cx, uz = K.sz[s] + dz * t - cz;
          d2 = Math.min(d2, ux * ux + uz * uz);
        }
      }
      ghost = d2 > 0.81;
    }
    if (!tied[k] && !ghost) continue;
    for (let j = 0; j < 3; j++) { const i = (v + j) * 4; out[i] = 0; out[i + 1] = ghost ? 65535 : 0; out[i + 2] = 0; out[i + 3] = 0; }
    if (tied[k]) ties++;
    if (ghost) ghosts++;
  }
  return { ties, ghosts };
}
function gravelEdges(P, M, out) {
  const nv = M.length, key = (i) => Math.round(P[i * 3] * 50) + ',' + Math.round(P[i * 3 + 2] * 50);
  const cnt = new Map();
  let any = false;
  for (let v = 0; v + 2 < nv; v += 3) {
    if (M[v] !== 17) continue;
    any = true;
    for (let k = 0; k < 3; k++) {
      const a = key(v + k), b = key(v + (k + 1) % 3), e = a < b ? a + '|' + b : b + '|' + a;
      const c = cnt.get(e);
      if (c) c.n++; else cnt.set(e, { n: 1, i: v + k, j: v + (k + 1) % 3 });
    }
  }
  if (!any) return;
  // the gravel is the tile's grass clipped piece by piece against the walks (city/bryantPark.js), so neighbouring pieces
  // do not always share their vertices: an edge used once is a walk edge only if the ground 5 cm outside it is not gravel
  const TC = 3, tcell = new Map();
  let tx0 = Infinity, tz0 = Infinity;
  for (let v = 0; v + 2 < nv; v += 3) if (M[v] === 17) { tx0 = Math.min(tx0, P[v * 3], P[v * 3 + 3], P[v * 3 + 6]); tz0 = Math.min(tz0, P[v * 3 + 2], P[v * 3 + 5], P[v * 3 + 8]); }
  for (let v = 0; v + 2 < nv; v += 3) {
    if (M[v] !== 17) continue;
    const xs = [P[v * 3], P[v * 3 + 3], P[v * 3 + 6]], zs = [P[v * 3 + 2], P[v * 3 + 5], P[v * 3 + 8]];
    for (let z = Math.floor((Math.min(...zs) - tz0) / TC); z <= Math.floor((Math.max(...zs) - tz0) / TC); z++)
      for (let x = Math.floor((Math.min(...xs) - tx0) / TC); x <= Math.floor((Math.max(...xs) - tx0) / TC); x++) { const k = z * 100000 + x; let L = tcell.get(k); if (!L) tcell.set(k, L = []); L.push(v); }
  }
  const inGravel = (px, pz) => {
    const L = tcell.get(Math.floor((pz - tz0) / TC) * 100000 + Math.floor((px - tx0) / TC)); if (!L) return false;
    for (const v of L) {
      const ax = P[v * 3], az = P[v * 3 + 2], bx = P[v * 3 + 3], bz = P[v * 3 + 5], cx = P[v * 3 + 6], cz = P[v * 3 + 8];
      const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz), d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  };
  const ex = [], ez = [], fx = [], fz = [];
  for (const c of cnt.values()) if (c.n === 1) {
    const dx = P[c.j * 3] - P[c.i * 3], dz = P[c.j * 3 + 2] - P[c.i * 3 + 2], l = Math.hypot(dx, dz);
    if (l < 0.01) continue;
    // outward: away from the third vertex of the edge's own triangle
    const v = c.i - (c.i % 3), o = [v, v + 1, v + 2].find((k) => k !== c.i && k !== c.j);
    const mx = 0.5 * (P[c.i * 3] + P[c.j * 3]), mz = 0.5 * (P[c.i * 3 + 2] + P[c.j * 3 + 2]);
    let nx = -dz / l, nz = dx / l;
    if ((P[o * 3] - mx) * nx + (P[o * 3 + 2] - mz) * nz > 0) { nx = -nx; nz = -nz; }
    if (inGravel(mx + nx * 0.05, mz + nz * 0.05)) continue;
    ex.push(P[c.i * 3]); ez.push(P[c.i * 3 + 2]); fx.push(P[c.j * 3]); fz.push(P[c.j * 3 + 2]);
  }
  const ne = ex.length;
  if (!ne) return;
  const C = 3, R = 12;
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (let s = 0; s < ne; s++) { minx = Math.min(minx, ex[s], fx[s]); maxx = Math.max(maxx, ex[s], fx[s]); minz = Math.min(minz, ez[s], fz[s]); maxz = Math.max(maxz, ez[s], fz[s]); }
  minx -= R; minz -= R; maxx += R; maxz += R;
  const gw = Math.ceil((maxx - minx) / C) + 1, gh = Math.ceil((maxz - minz) / C) + 1;
  const cells = new Map();
  for (let s = 0; s < ne; s++) {
    const x0 = Math.floor((Math.min(ex[s], fx[s]) - minx) / C), x1 = Math.floor((Math.max(ex[s], fx[s]) - minx) / C);
    const z0 = Math.floor((Math.min(ez[s], fz[s]) - minz) / C), z1 = Math.floor((Math.max(ez[s], fz[s]) - minz) / C);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const c = z * gw + x; let L = cells.get(c); if (!L) cells.set(c, L = []); L.push(s); }
  }
  const nearest = (px, pz, skip) => {
    let best = R * R, bs = -1;
    const gx = Math.floor((px - minx) / C), gz = Math.floor((pz - minz) / C), r = Math.ceil(R / C);
    for (let z = gz - r; z <= gz + r; z++) for (let x = gx - r; x <= gx + r; x++) {
      if (x < 0 || z < 0 || x >= gw || z >= gh) continue;
      const L = cells.get(z * gw + x); if (!L) continue;
      for (const s of L) {
        if (skip && skip(s)) continue;
        const dx = fx[s] - ex[s], dz = fz[s] - ez[s], l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((px - ex[s]) * dx + (pz - ez[s]) * dz) / l2));
        const qx = ex[s] + dx * t - px, qz = ez[s] + dz * t - pz, d2 = qx * qx + qz * qz;
        if (d2 < best) { best = d2; bs = s; }
      }
    }
    return bs;
  };
  // the line of segment s as a unit normal pointing toward (px, pz)
  const lineN = (s, px, pz) => {
    const dx = fx[s] - ex[s], dz = fz[s] - ez[s], l = Math.hypot(dx, dz);
    let nx = -dz / l, nz = dx / l;
    if ((px - ex[s]) * nx + (pz - ez[s]) * nz < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  };
  for (let v = 0; v + 2 < nv; v += 3) {
    if (M[v] !== 17) continue;
    const cx = (P[v * 3] + P[v * 3 + 3] + P[v * 3 + 6]) / 3, cz = (P[v * 3 + 2] + P[v * 3 + 5] + P[v * 3 + 8]) / 3;
    const b1 = nearest(cx, cz, null);
    if (b1 < 0) continue;
    const [n1x, n1z] = lineN(b1, cx, cz);
    // the facing edge: the nearest other boundary segment whose line faces this one (within ~25 deg) across the walk
    const b2 = nearest(cx, cz, (s) => {
      if (s === b1) return true;
      const dx = fx[s] - ex[s], dz = fz[s] - ez[s], l = Math.hypot(dx, dz);
      if (Math.abs((-dz / l) * n1x + (dx / l) * n1z) < 0.9) return true;
      const mx = 0.5 * (ex[s] + fx[s]) - cx, mz = 0.5 * (ez[s] + fz[s]) - cz;
      return mx * n1x + mz * n1z < 0.3;   // it must lie across the walk from the first
    });
    const [n2x, n2z] = b2 >= 0 ? lineN(b2, cx, cz) : [0, 0];
    for (let k = 0; k < 3; k++) {
      const i = v + k, x = P[i * 3], z = P[i * 3 + 2];
      out[i * 4] = Math.max(1, Math.min(65535, Math.round(Math.max(0, (x - ex[b1]) * n1x + (z - ez[b1]) * n1z) * 100) + 1));
      if (b2 >= 0) out[i * 4 + 1] = Math.max(1, Math.min(65535, Math.round(Math.max(0, (x - ex[b2]) * n2x + (z - ez[b2]) * n2z) * 100) + 1));
      out[i * 4 + 2] = 0; out[i * 4 + 3] = 0;
    }
  }
}
