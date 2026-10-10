// 2D polygon/polyline utilities for the compiler.
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
export function centroid(pts) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const c = x1 * y2 - x2 * y1;
    a += c; x += (x1 + x2) * c; y += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-9) { // degenerate: average
    x = 0; y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }
  return [x / (3 * a), y / (3 * a)];
}
export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Douglas–Peucker simplification
export function simplify(pts, eps) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
// closed-ring simplification: anchor at two far-apart points, DP each half
export function simplifyRing(pts, eps) {
  if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length <= 4) return pts;
  let far = 1, fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const h1 = simplify(pts.slice(0, far + 1), eps);
  const h2 = simplify(pts.slice(far).concat([pts[0]]), eps);
  const out = h1.slice(0, -1).concat(h2.slice(0, -1));
  return out.length >= 3 ? out : pts;
}
// crude inward inset by scaling about centroid (fine for tier tops)
export function insetScale(pts, factor) {
  const [cx, cy] = centroid(pts);
  return pts.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}
// minimal-area oriented bounding box (rotating edges)
export function orientedBBox(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [px, py] of pts) {
      const rx = px * c - py * s, ry = px * s + py * c;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (!best || area < best.area) best = { area, ang, minX, maxX, minY, maxY };
  }
  const { ang, minX, maxX, minY, maxY } = best;
  const c = Math.cos(ang), s = Math.sin(ang);
  const corner = (x, y) => [x * c - y * s, x * s + y * c];
  return {
    w: best.maxX - best.minX, h: best.maxY - best.minY, ang,
    pts: [corner(minX, minY), corner(maxX, minY), corner(maxX, maxY), corner(minX, maxY)],
    center: corner((minX + maxX) / 2, (minY + maxY) / 2),
  };
}
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
// walk along polyline: returns [x, y, dirx, diry] at distance d
export function alongPolyline(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg) {
      const t = seg < 1e-9 ? 0 : d / seg;
      const dx = (pts[i][0] - pts[i - 1][0]) / (seg || 1), dy = (pts[i][1] - pts[i - 1][1]) / (seg || 1);
      return [pts[i - 1][0] + dx * d, pts[i - 1][1] + dy * d, dx, dy];
    }
    d -= seg;
  }
  const n = pts.length;
  const dx = pts[n - 1][0] - pts[n - 2][0], dy = pts[n - 1][1] - pts[n - 2][1];
  const L = Math.hypot(dx, dy) || 1;
  return [pts[n - 1][0], pts[n - 1][1], dx / L, dy / L];
}
// simple seeded hash / rng
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// inverse-distance-weighted interpolation from scattered points (grid builder)
export function idwGrid(samples, x0, z0, size, res) {
  // samples: [[x,z,v],...] — build (res+1)^2 grid
  const n = res + 1, out = new Float32Array(n * n);
  // bucket samples for speed
  const cell = size / 4, buckets = new Map();
  const bkey = (x, z) => `${Math.floor(x / cell)}_${Math.floor(z / cell)}`;
  for (const s of samples) {
    const k = bkey(s[0], s[1]);
    let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
    b.push(s);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const px = x0 + (i / res) * size, pz = z0 + (j / res) * size;
    let num = 0, den = 0, found = 0;
    for (let r = 0; r < 6 && found < 6; r++) {
      const ci = Math.floor(px / cell), cj = Math.floor(pz / cell);
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; // ring only
        const b = buckets.get(`${ci + di}_${cj + dj}`);
        if (!b) continue;
        for (const [sx, sz, v] of b) {
          const d2 = (sx - px) ** 2 + (sz - pz) ** 2;
          const w = 1 / (d2 + 25);
          num += v * w; den += w; found++;
        }
      }
      if (found >= 6 && r >= 2) break;
    }
    out[j * n + i] = den > 0 ? num / den : 3.0;
  }
  return out;
}
