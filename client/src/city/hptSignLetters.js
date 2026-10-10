// AR33 HPT: the Pepsi-Cola sign's letters and bottle as real channel-letter geometry (docs/notes/ar33-hpt.md). The
// letters' outline is traced from the drawn art (hptSignKit.js strokes, rasterised on a canvas): marching squares on the
// canvas's alpha with sub-pixel interpolation, the loops simplified, nested into shapes with their holes and extruded
// with a small chamfer, so the letters have real returns and depth. The neon tubes are swept tubes along the same art
// eroded to the tubes' lines (15 mm tubes on standoffs in front of the face), lit after dusk.
import * as THREE from 'three';
import { Builder, circle } from './hptSignSteel.js';

// ---------------------------------------------------------------- tracing
// draw(g, px) paints the shapes opaque on a transparent canvas covering u U0..U0+Wm, v V0..V0+Hm at px pixels a metre
// (the canvas's y down from v = V0 + Hm). Returns the loops [[u, v], ...] of the alpha = 0.5 contour, in metres.
export function traceLoops(draw, U0, V0, Wm, Hm, px, tol = 0.01) {
  const W = Math.ceil(Wm * px), H = Math.ceil(Hm * px), VT = V0 + Hm;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, W, H);
  draw(g, px);
  const D = g.getImageData(0, 0, W, H).data;
  const A = (x, y) => D[(y * W + x) * 4 + 3];
  const ISO = 127.5;
  const nb = new Map();
  const link = (e1, e2) => {
    let a = nb.get(e1); if (!a) nb.set(e1, (a = [])); a.push(e2);
    let b = nb.get(e2); if (!b) nb.set(e2, (b = [])); b.push(e1);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = A(x, y) > ISO, tr = A(x + 1, y) > ISO, br = A(x + 1, y + 1) > ISO, bl = A(x, y + 1) > ISO;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = (y * W + x) * 2, Bm = ((y + 1) * W + x) * 2, L = (y * W + x) * 2 + 1, R = (y * W + x + 1) * 2 + 1;
      switch (c) {
        case 1: link(L, Bm); break;
        case 2: link(Bm, R); break;
        case 3: link(L, R); break;
        case 4: link(T, R); break;
        case 5: { const ctr = (A(x, y) + A(x + 1, y) + A(x + 1, y + 1) + A(x, y + 1)) / 4 > ISO; if (ctr) { link(T, L); link(Bm, R); } else { link(T, R); link(L, Bm); } break; }
        case 6: link(T, Bm); break;
        case 7: link(T, L); break;
        case 8: link(T, L); break;
        case 9: link(T, Bm); break;
        case 10: { const ctr = (A(x, y) + A(x + 1, y) + A(x + 1, y + 1) + A(x, y + 1)) / 4 > ISO; if (ctr) { link(T, R); link(L, Bm); } else { link(T, L); link(Bm, R); } break; }
        case 11: link(T, R); break;
        case 12: link(L, R); break;
        case 13: link(Bm, R); break;
        case 14: link(L, Bm); break;
      }
    }
  }
  // an edge id's point in metres (interpolated along its edge)
  const pt = (e) => {
    const k = e >> 1, x = k % W, y = (k - x) / W;
    let px0, py0;
    if (e & 1) { const a0 = A(x, y), a1 = A(x, y + 1), t = a1 !== a0 ? (ISO - a0) / (a1 - a0) : 0.5; px0 = x; py0 = y + t; }
    else { const a0 = A(x, y), a1 = A(x + 1, y), t = a1 !== a0 ? (ISO - a0) / (a1 - a0) : 0.5; px0 = x + t; py0 = y; }
    return [U0 + (px0 + 0.5) / px, VT - (py0 + 0.5) / px];
  };
  const seen = new Set(), loops = [];
  for (const start of nb.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start, guard = 0;
    while (guard++ < 1e6) {
      seen.add(cur); loop.push(pt(cur));
      const n = nb.get(cur);
      const next = n[0] !== prev ? n[0] : n[1];
      if (next === undefined || next === start) break;
      prev = cur; cur = next;
      if (seen.has(cur)) break;
    }
    if (loop.length >= 8) loops.push(simplifyLoop(loop, tol));
  }
  return loops.filter((l) => l.length >= 4);
}
// Douglas-Peucker on a closed loop (split at the point farthest from the first)
function dp(P, tol) {
  if (P.length < 3) return P.slice();
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [i, j] = st.pop();
    const [ax, ay] = P[i], [bx, by] = P[j], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    let md = -1, mk = -1;
    for (let k = i + 1; k < j; k++) {
      const t = Math.max(0, Math.min(1, ((P[k][0] - ax) * dx + (P[k][1] - ay) * dy) / L2));
      const ex = ax + dx * t - P[k][0], ey = ay + dy * t - P[k][1], d = ex * ex + ey * ey;
      if (d > md) { md = d; mk = k; }
    }
    if (md > tol * tol) { keep[mk] = 1; st.push([i, mk], [mk, j]); }
  }
  return P.filter((_, k) => keep[k]);
}
function simplifyLoop(L, tol) {
  let far = 0, fd = -1;
  for (let k = 1; k < L.length; k++) { const d = (L[k][0] - L[0][0]) ** 2 + (L[k][1] - L[0][1]) ** 2; if (d > fd) { fd = d; far = k; } }
  const a = dp(L.slice(0, far + 1), tol), b = dp(L.slice(far).concat([L[0]]), tol);
  return a.concat(b.slice(1, -1));
}
export const loopArea = (P) => P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2;
function inside(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < ((P[j][0] - P[i][0]) * (p[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}
// the loops nested into THREE.Shapes (even depth = an outline, odd = a hole in its container)
export function loopsToShapes(loops) {
  const info = loops.map((P) => ({ P, a: Math.abs(loopArea(P)), depth: 0, parent: -1 }));
  info.forEach((A, i) => {
    let best = -1, ba = Infinity;
    info.forEach((B, j) => {
      if (i === j || B.a <= A.a) return;
      if (inside(A.P[0], B.P)) { A.depth++; if (B.a < ba) { ba = B.a; best = j; } }
    });
    A.parent = best;
  });
  const shapes = new Map();
  info.forEach((A, i) => { if (A.depth % 2 === 0) shapes.set(i, new THREE.Shape(A.P.map(([u, v]) => new THREE.Vector2(u, v)))); });
  info.forEach((A) => { if (A.depth % 2 === 1 && shapes.has(A.parent)) shapes.get(A.parent).holes.push(new THREE.Path(A.P.map(([u, v]) => new THREE.Vector2(u, v)))); });
  return [...shapes.values()];
}

// ---------------------------------------------------------------- channel letters
// the shapes extruded `depth` (the face at z = depth) with a chamfer; groups: 0 the face, 1 the back, 2 the returns
export function channelGeometry(shapes, depth, chamfer = 0.012) {
  const g0 = new THREE.ExtrudeGeometry(shapes, { depth: depth - 2 * chamfer, bevelEnabled: chamfer > 0, bevelThickness: chamfer, bevelSize: chamfer, bevelOffset: -chamfer, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g0.translate(0, 0, chamfer);
  const P = g0.getAttribute('position'), N = g0.getAttribute('normal'), U = g0.getAttribute('uv');
  const bins = [[], [], []];
  const capTri = new Uint8Array(P.count / 3);
  for (const gr of g0.groups) if (gr.materialIndex === 0) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) capTri[t] = 1;
  for (let t = 0; t < P.count / 3; t++) {
    const nz = (N.getZ(t * 3) + N.getZ(t * 3 + 1) + N.getZ(t * 3 + 2)) / 3;
    bins[capTri[t] ? (nz > 0 ? 0 : 1) : 2].push(t);
  }
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const g = new THREE.BufferGeometry();
  let o = 0;
  bins.forEach((list, k) => {
    const s = o;
    for (const t of list) for (let v = t * 3; v < t * 3 + 3; v++, o++) {
      pos[o * 3] = P.getX(v); pos[o * 3 + 1] = P.getY(v); pos[o * 3 + 2] = P.getZ(v);
      nor[o * 3] = N.getX(v); nor[o * 3 + 1] = N.getY(v); nor[o * 3 + 2] = N.getZ(v);
      uv[o * 2] = U.getX(v); uv[o * 2 + 1] = U.getY(v);
    }
    g.addGroup(s, o - s, k);
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // the returns' UVs in metres along the outline (u) and through the depth (v) for the painted-metal set
  const side = g.groups[2];
  for (let v = side.start; v < side.start + side.count; v += 3) {
    let acc = 0;
    for (let q = 0; q < 3; q++) acc += Math.abs(nor[(v + q) * 3]) > Math.abs(nor[(v + q) * 3 + 1]) ? 1 : 0;
    for (let q = 0; q < 3; q++) { const i = v + q; uv[i * 2] = acc >= 2 ? pos[i * 3 + 1] : pos[i * 3]; uv[i * 2 + 1] = pos[i * 3 + 2]; }
  }
  g0.dispose();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- neon
// closed loops in the (u, v) plane swept as tubes of radius r at height z; supports every `step` m back to zFace
export function neonTubes(loops, z, r, zFace, { step = 0.55, seg = 0.09, radial = 6 } = {}) {
  const tube = new Builder(), sup = new Builder();
  const ring = circle(1, radial);
  for (const L0 of loops) {
    // resample the loop so no span is longer than `seg`
    const L = [];
    for (let i = 0; i < L0.length; i++) {
      const a = L0[i], b = L0[(i + 1) % L0.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / seg));
      for (let k = 0; k < n; k++) L.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const n = L.length;
    if (n < 4) continue;
    // per-point in-plane normal (the averaged tangent rotated), then the circle in (normal, z)
    const frames = L.map((p, i) => {
      const a = L[(i - 1 + n) % n], b = L[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      return [p[0], p[1], ty, -tx];
    });
    const V = (f, k) => { const [cx, cy] = ring[k % radial], [px0, py0, nx, ny] = f; return [new THREE.Vector3(px0 + nx * cx * r, py0 + ny * cx * r, z + cy * r), new THREE.Vector3(nx * cx, ny * cx, cy)]; };
    let run = 0;
    for (let i = 0; i < n; i++) {
      const f0 = frames[i], f1 = frames[(i + 1) % n];
      for (let k = 0; k < radial; k++) {
        const [a0, n0] = V(f0, k), [a1, n1] = V(f0, k + 1), [b0, m0] = V(f1, k), [b1, m1] = V(f1, k + 1);
        tube.tri(a0, b0, b1, n0, m0, m1, [0, 0], [1, 0], [1, 1]);
        tube.tri(a0, b1, a1, n0, m1, n1, [0, 0], [1, 1], [0, 1]);
      }
      const d = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
      run += d;
      if (run > step) { run = 0; sup.member(circle(0.009, 5), [f0[0], f0[1], zFace], [f0[0], f0[1], z - r * 0.6], [0, 1, 0], { smooth: true, caps: false }); }
    }
  }
  return { tube, sup };
}
