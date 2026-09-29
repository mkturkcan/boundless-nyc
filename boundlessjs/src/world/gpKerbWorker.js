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
  const { id, pos, mat } = e.data;
  const t0 = performance.now();
  const r = kerbFrame(pos, mat);
  self.postMessage({ id, out: r.out, segs: r.segs, tris: r.tris, quads: r.quads, ms: performance.now() - t0 }, [r.out.buffer]);
};
export function kerbFrame(P, M) {
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
  return { out, segs: ns, tris, quads };
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
