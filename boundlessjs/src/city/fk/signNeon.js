// AR33 SIGN: neon tube paths from real letters (no three.js here). The text is drawn with the sign's font on a canvas,
// thinned to its one-pixel skeleton (Zhang-Suen), and the skeleton traced into strokes (end to end, junction to
// junction, closed loops), simplified and smoothed: the centrelines a sign bender would follow. signKit.js sweeps the
// glass tubes along them. Owner: SIGN (docs/notes/ar33-signs.md).

// the skeleton of a binary image (1 = ink), in place; w x h
function thin(img, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? img[y * w + x] : 0);
  const kill = [];
  let changed = true, it = 0;
  while (changed && it < 60) {
    changed = false; it++;
    for (let pass = 0; pass < 2; pass++) {
      kill.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[y * w + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          kill.push(y * w + x);
        }
      }
      if (kill.length) { changed = true; for (const i of kill) img[i] = 0; }
    }
  }
  return img;
}
const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
// trace a skeleton into polylines of pixel coordinates. Pixels are classed by their crossing number (0 -> 1
// transitions round the 8-neighbour ring): 1 = an end, 2 = on a path, 3+ = a junction; a staircase step is a path pixel,
// not a junction. Path pixels are visited once, so the walk never cuts a staircase's corner back on itself.
const CYC = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
function trace(img, w, h) {
  const cls = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!img[i]) continue;
    let A = 0;
    for (let k = 0; k < 8; k++) {
      const a = img[(y + CYC[k][1]) * w + x + CYC[k][0]], b = img[(y + CYC[(k + 1) % 8][1]) * w + x + CYC[(k + 1) % 8][0]];
      if (!a && b) A++;
    }
    cls[i] = A <= 1 ? 1 : A === 2 ? 2 : 3;
  }
  const vis = new Uint8Array(w * h);
  const used = new Set();
  const ek = (a, b) => (a < b ? a * 16777216 + b : b * 16777216 + a);
  const nbs = (i) => { const x = i % w, y = (i / w) | 0, o = []; for (const [dx, dy] of CYC) { const j = (y + dy) * w + x + dx; if (img[j]) o.push(j); } return o; };
  const d4 = (a, b) => Math.abs((a % w) - (b % w)) + Math.abs(((a / w) | 0) - ((b / w) | 0));
  const walk = (start, first) => {
    const P = [start]; let prev = start, cur = first;
    used.add(ek(start, first));
    for (let g = 0; g < 1e6; g++) {
      P.push(cur);
      if (cls[cur] !== 2) break;            // an end or a junction
      if (vis[cur]) break;
      vis[cur] = 1;
      let best = -1, bs = 9;
      for (const j of nbs(cur)) {
        if (j === prev) continue;
        if (cls[j] === 2 && vis[j] && j !== start) continue;
        if (cls[j] !== 2 && used.has(ek(cur, j))) continue;
        if (j === start && P.length < 4) continue;
        const sc = d4(cur, j) + (cls[j] !== 2 ? -0.5 : 0);   // 4-neighbours first; a junction or end when it is there
        if (sc < bs) { bs = sc; best = j; }
      }
      if (best < 0) break;
      used.add(ek(cur, best));
      prev = cur; cur = best;
      if (cur === start) { P.push(cur); break; }
    }
    return P;
  };
  const paths = [];
  // from the ends and the junctions
  for (let i = 0; i < w * h; i++) {
    if (!img[i] || cls[i] === 2 || cls[i] === 0) continue;
    for (const j of nbs(i)) {
      if (cls[j] === 2 ? vis[j] : used.has(ek(i, j))) continue;
      paths.push(walk(i, j));
    }
  }
  // then the closed loops (an O, a D's bowl)
  for (let i = 0; i < w * h; i++) {
    if (cls[i] !== 2 || vis[i]) continue;
    vis[i] = 1;
    const n = nbs(i).filter((j) => cls[j] === 2 && !vis[j]);
    if (!n.length) continue;
    const P = walk(i, n[0]);
    paths.push(P);
  }
  const degOf = (i) => (cls[i] === 1 ? 1 : cls[i] === 3 ? 3 : 2);
  return paths.filter((P) => P.length > 1).map((P) => Object.assign(P.map((i) => [i % w, (i / w) | 0]), { e0: degOf(P[0]), e1: degOf(P[P.length - 1]) }));
}
function rdp(P, eps) {
  if (P.length < 3) return P;
  const [ax, ay] = P[0], [bx, by] = P[P.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  let dm = -1, im = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L;
    if (d > dm) { dm = d; im = i; }
  }
  if (dm <= eps) return [P[0], P[P.length - 1]];
  const a = rdp(P.slice(0, im + 1), eps), b = rdp(P.slice(im), eps);
  return a.slice(0, -1).concat(b);
}
function chaikin(P, n, closed) {
  let Q = P;
  for (let k = 0; k < n; k++) {
    const R = closed ? [] : [Q[0]];
    const m = closed ? Q.length : Q.length - 1;
    for (let i = 0; i < m; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length];
      R.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) R.push(Q[Q.length - 1]);
    Q = R;
  }
  return Q;
}

// strokes of the ink drawn by draw(ctx, W, H) on a W x H canvas: [{ pts: [[x, y] px], closed }]
export function neonStrokes(draw, W, H, { minLen = 6, eps = 0.9, smooth = 2, spur = 0, dilate = true } = {}) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  draw(c, W, H);
  const d = c.getImageData(0, 0, W, H).data;
  const img = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) img[i] = d[i * 4] > 110 ? 1 : 0;
  // close hairline gaps in thin strokes: one 3 x 3 dilation
  if (dilate) { const src = img.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (src[y * W + x]) continue; if (src[y * W + x - 1] || src[y * W + x + 1] || src[(y - 1) * W + x] || src[(y + 1) * W + x]) img[y * W + x] = 1; } }
  thin(img, W, H);
  let raw = trace(img, W, H);
  // prune spurs: a branch with a free end on a junction, shorter than 'spur' px (thinning whiskers at corners)
  const plen = (P) => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };
  raw = raw.filter((P) => !(spur > 0 && ((P.e0 === 1) !== (P.e1 === 1)) && plen(P) < spur));
  const out = [];
  for (const P of raw) {
    if (P.length < 2) continue;
    const closed = P.length > 8 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1];
    let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (len < minLen) continue;
    let Q;
    if (closed) {
      // split the loop at the point farthest from its start (RDP on a loop whose ends coincide collapses it)
      let far = 0, fd = -1; for (let i = 1; i < P.length; i++) { const dd = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (dd > fd) { fd = dd; far = i; } }
      Q = rdp(P.slice(0, far + 1), eps).concat(rdp(P.slice(far), eps).slice(1));
      Q = Q.slice(0, -1);
    } else Q = rdp(P, eps);
    Q = chaikin(Q, smooth, closed);
    out.push({ pts: Q, closed, len });
  }
  return out;
}
// the centrelines of one glyph from its typeface outline ('o': m x y / l x y / q x y cpx cpy / b x y c1x c1y c2x c2y, font
// units, y up): strokes in em units (x right, y up from the baseline). Cached by the caller.
export function glyphStrokes(o, resolution, ha, { px = 140 } = {}) {
  if (!o) return [];
  const k = px / resolution;                 // canvas px per font unit
  const pad = 8, asc = resolution * 1.05, desc = resolution * 0.3;
  const W = Math.ceil(Math.max(ha, resolution * 0.3) * k * 1.3) + 2 * pad, H = Math.ceil((asc + desc) * k) + 2 * pad;
  const X = (x) => pad + x * k, Y = (y) => pad + (asc - y) * k;
  const draw = (c) => {
    const t = o.split(' ');
    const p = new Path2D();
    for (let i = 0; i < t.length;) {
      const cmd = t[i++];
      if (cmd === 'm') { p.moveTo(X(+t[i]), Y(+t[i + 1])); i += 2; }
      else if (cmd === 'l') { p.lineTo(X(+t[i]), Y(+t[i + 1])); i += 2; }
      else if (cmd === 'q') { p.quadraticCurveTo(X(+t[i + 2]), Y(+t[i + 3]), X(+t[i]), Y(+t[i + 1])); i += 4; }
      else if (cmd === 'b') { p.bezierCurveTo(X(+t[i + 2]), Y(+t[i + 3]), X(+t[i + 4]), Y(+t[i + 5]), X(+t[i]), Y(+t[i + 1])); i += 6; }
      else if (cmd === 'z') { p.closePath(); }
      else i++;
    }
    c.fill(p, 'nonzero');
  };
  const S = joinStrokes(neonStrokes(draw, W, H, { minLen: px * 0.08, eps: 0.8, smooth: 2 }));
  const inv = 1 / (k * resolution);
  return S.map((st) => ({ closed: st.closed, pts: st.pts.map(([x, y]) => [(x - pad) * inv, (asc - (y - pad) / k) / resolution]) }));
}
// Outline neon (tubes round the letters' edges, the Pepsi-Cola way): the contours of the drawn shape, eroded by `inset`
// px so the tube sits inside the edge, traced with marching squares into closed loops (canvas px), simplified and
// smoothed. Loops shorter than minLen px are dropped.
export function neonContours(draw, W, H, { inset = 3, minLen = 12, eps = 0.8, smooth = 2 } = {}) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  draw(c, W, H);
  const d = c.getImageData(0, 0, W, H).data;
  let img = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) img[i] = d[i * 4] > 127 ? 1 : 0;
  for (let n = 0; n < inset; n++) {
    const src = img; img = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; img[i] = src[i] && src[i - 1] && src[i + 1] && src[i - W] && src[i + W] ? 1 : 0; }
  }
  // marching squares: segments between edge midpoints, keyed so they chain into loops
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : img[y * W + x]);
  const next = new Map();
  const key = (x2, y2) => (x2 + 4) * 65536 + (y2 + 4);   // doubled coordinates of an edge midpoint (offset: they start at -2)
  const seg = (ax, ay, bx, by) => { next.set(key(ax, ay), [bx, by]); };
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const cse = tl * 8 + tr * 4 + br * 2 + bl;
    if (cse === 0 || cse === 15) continue;
    // midpoints (doubled): top (2x+1, 2y), right (2x+2, 2y+1), bottom (2x+1, 2y+2), left (2x, 2y+1)
    const T = [2 * x + 1, 2 * y], R = [2 * x + 2, 2 * y + 1], B = [2 * x + 1, 2 * y + 2], L = [2 * x, 2 * y + 1];
    const S = (p, q) => seg(p[0], p[1], q[0], q[1]);
    switch (cse) {   // ink kept on the right of travel (consistent winding)
      case 1: S(L, B); break; case 2: S(B, R); break; case 3: S(L, R); break; case 4: S(R, T); break;
      case 5: S(L, T); S(R, B); break; case 6: S(B, T); break; case 7: S(L, T); break; case 8: S(T, L); break;
      case 9: S(T, B); break; case 10: S(T, R); S(B, L); break; case 11: S(T, R); break; case 12: S(R, L); break;
      case 13: S(R, B); break; case 14: S(B, L); break;
    }
  }
  const loops = [];
  const seen = new Set();
  for (const [k0] of next) {
    if (seen.has(k0)) continue;
    const P = []; let k = k0;
    for (let g = 0; g < 200000; g++) {
      if (seen.has(k)) break;
      seen.add(k);
      const xo = Math.floor(k / 65536), x2 = xo - 4, y2 = k - xo * 65536 - 4;
      P.push([x2 / 2, y2 / 2]);
      const n = next.get(k); if (!n) break;
      k = key(n[0], n[1]);
    }
    if (P.length < 4) continue;
    let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (len < minLen) continue;
    // a closed loop: split at the point farthest from the start, simplify both halves
    let far = 0, fd = -1; for (let i = 1; i < P.length; i++) { const dd = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (dd > fd) { fd = dd; far = i; } }
    let Q = rdp(P.slice(0, far + 1), eps).concat(rdp(P.slice(far).concat([P[0]]), eps).slice(1)); Q = Q.slice(0, -1);
    if (Q.length < 3) continue;
    loops.push({ pts: chaikin(Q, smooth, true), closed: true, len });
  }
  return loops;
}
// points every `step` along a stroke (em units)
export function resample(pts, step, closed = false) {
  const P = closed ? pts.concat([pts[0]]) : pts;
  const out = [[P[0][0], P[0][1]]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i];
    let L = Math.hypot(bx - ax, by - ay), t0 = 0;
    while (carry + L - t0 >= step) {
      t0 += step - carry; carry = 0;
      const u = t0 / L; out.push([ax + (bx - ax) * u, ay + (by - ay) * u]);
    }
    carry += L - t0;
  }
  if (closed && out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < step * 0.5) out.pop(); }
  return out;
}
// join strokes whose ends meet (a skeleton breaks at every junction; a tube runs through the junction when the two
// strokes continue each other within 35 degrees)
export function joinStrokes(S, tol = 3) {
  const unit = (dx, dy) => { const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  // direction of travel leaving an end (end: 1 = the last point, 0 = the first), measured a few points in
  const out = (P, end) => { const n = Math.min(4, P.length - 1); const a = end ? P[P.length - 1] : P[0], b = end ? P[P.length - 1 - n] : P[n]; return unit(a[0] - b[0], a[1] - b[1]); };
  const list = S.filter((s) => !s.closed).map((s) => ({ ...s, pts: s.pts.slice() }));
  const loops = S.filter((s) => s.closed);
  const cosMin = Math.cos(50 * Math.PI / 180);
  for (;;) {
    let best = null;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i].pts, B = list[j].pts;
      for (const ea of [0, 1]) for (const eb of [0, 1]) {
        const a = ea ? A[A.length - 1] : A[0], b = eb ? B[B.length - 1] : B[0];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d > tol) continue;
        const da = out(A, ea), db = out(B, eb);
        const al = -(da[0] * db[0] + da[1] * db[1]);     // 1 = B carries straight on from A
        if (al < cosMin) continue;
        const sc = al - d * 0.02;
        if (!best || sc > best.sc) best = { sc, i, j, ea, eb };
      }
    }
    if (!best) break;
    const { i, j, ea, eb } = best;
    let A = list[i].pts, B = list[j].pts;
    if (!ea) A = A.slice().reverse();            // A must end at the joint
    if (eb) B = B.slice().reverse();             // B must start at it
    list[i] = { pts: A.concat(B.slice(1)), closed: false, len: (list[i].len || 0) + (list[j].len || 0) };
    list.splice(j, 1);
  }
  for (const s of list) { const P = s.pts, a = P[0], b = P[P.length - 1]; if (P.length > 6 && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol) { s.closed = true; s.pts = P.slice(0, -1); } }
  return list.concat(loops);
}
