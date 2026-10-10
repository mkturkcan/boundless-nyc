// AR33 HPT: the Pepsi-Cola sign's letters as real channel-letter geometry, traced from a scalar field (no canvas: the same
// file runs in node for tests and in the page). The field holds, for each cell, the distance to the nearest stroke less that
// stroke's half width (negative inside). Contours of it give the letters' outline (level 0), the neon's line (a small
// positive level) and any eroded edge, with sub-cell accuracy. docs/notes/ar33-hpt.md.
import * as THREE from 'three';

// ---------------------------------------------------------------- the field
// lines: [[u, v, w (m)], ...] polylines (hptSignStrokes.js strokeLines); the cells cover u U0..U0+Wm, v V0..V0+Hm at px per metre
export function strokeField(lines, { U0, V0, Wm, Hm, px, reach = 0.4 }) {
  const W = Math.ceil(Wm * px) + 1, H = Math.ceil(Hm * px) + 1, VT = V0 + Hm;
  const F = new Float32Array(W * H).fill(9);
  for (const L of lines) {
    for (let i = 1; i < L.length; i++) {
      const [ax, ay, aw] = L[i - 1], [bx, by, bw] = L[i];
      const ra = aw / 2, rb = bw / 2, pad = Math.max(ra, rb) + reach;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - U0) * px)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + pad - U0) * px));
      const y0 = Math.max(0, Math.floor((VT - Math.max(ay, by) - pad) * px)), y1 = Math.min(H - 1, Math.ceil((VT - Math.min(ay, by) + pad) * px));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
      for (let y = y0; y <= y1; y++) {
        const v = VT - y / px;
        for (let x = x0; x <= x1; x++) {
          const u = U0 + x / px;
          let t = ((u - ax) * dx + (v - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + dx * t - u, ey = ay + dy * t - v, d = Math.sqrt(ex * ex + ey * ey) - (ra + (rb - ra) * t);
          const k = y * W + x;
          if (d < F[k]) F[k] = d;
        }
      }
    }
  }
  return { F, W, H, U0, VT, px };
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
export function simplifyLoop(L, tol) {
  let far = 0, fd = -1;
  for (let k = 1; k < L.length; k++) { const d = (L[k][0] - L[0][0]) ** 2 + (L[k][1] - L[0][1]) ** 2; if (d > fd) { fd = d; far = k; } }
  const a = dp(L.slice(0, far + 1), tol), b = dp(L.slice(far).concat([L[0]]), tol);
  return a.concat(b.slice(1, -1));
}
export const loopArea = (P) => P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) / 2;

// marching squares on the field at `level` (inside = below it), linear interpolation along the cell edges; the closed loops
// come back as [[u, v], ...] in metres, simplified to `tol`
export function traceField(fld, level = 0, tol = 0.008) {
  const { F, W, H, U0, VT, px } = fld;
  const val = (x, y) => level - F[y * W + x];   // > 0 inside
  const nb = new Map();
  const link = (e1, e2) => {
    let a = nb.get(e1); if (!a) nb.set(e1, (a = [])); a.push(e2);
    let b = nb.get(e2); if (!b) nb.set(e2, (b = [])); b.push(e1);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = val(x, y), b = val(x + 1, y), c = val(x + 1, y + 1), d = val(x, y + 1);
      const k = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const T = (y * W + x) * 2, Bm = ((y + 1) * W + x) * 2, L = (y * W + x) * 2 + 1, R = (y * W + x + 1) * 2 + 1;
      switch (k) {
        case 1: link(L, Bm); break;
        case 2: link(Bm, R); break;
        case 3: link(L, R); break;
        case 4: link(T, R); break;
        case 5: { if ((a + b + c + d) / 4 > 0) { link(T, L); link(Bm, R); } else { link(T, R); link(L, Bm); } break; }
        case 6: link(T, Bm); break;
        case 7: link(T, L); break;
        case 8: link(T, L); break;
        case 9: link(T, Bm); break;
        case 10: { if ((a + b + c + d) / 4 > 0) { link(T, R); link(L, Bm); } else { link(T, L); link(Bm, R); } break; }
        case 11: link(T, R); break;
        case 12: link(L, R); break;
        case 13: link(Bm, R); break;
        case 14: link(L, Bm); break;
      }
    }
  }
  const pt = (e) => {
    const kk = e >> 1, x = kk % W, y = (kk - x) / W;
    if (e & 1) { const a0 = val(x, y), a1 = val(x, y + 1), t = a1 !== a0 ? a0 / (a0 - a1) : 0.5; return [U0 + x / px, VT - (y + t) / px]; }
    const a0 = val(x, y), a1 = val(x + 1, y), t = a1 !== a0 ? a0 / (a0 - a1) : 0.5;
    return [U0 + (x + t) / px, VT - y / px];
  };
  const seen = new Set(), loops = [];
  for (const start of nb.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start, guard = 0, closed = false;
    while (guard++ < 2e6) {
      seen.add(cur); loop.push(pt(cur));
      const n = nb.get(cur);
      if (!n || n.length < 2) break;
      const next = n[0] !== prev ? n[0] : n[1];
      if (next === start) { closed = true; break; }
      prev = cur; cur = next;
      if (seen.has(cur)) break;
    }
    if (closed && loop.length >= 8) loops.push(simplifyLoop(loop, tol));
  }
  return loops.filter((l) => l.length >= 4);
}

// ---------------------------------------------------------------- shapes
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
// A channel letter's geometry: shapes extruded `depth` with a `lip` chamfer; groups 0 the face (z = depth), 1 the back
// (z = 0), 2 the returns (walls and chamfer). The returns' normals are smoothed along the outline (walls with walls, chamfer
// with chamfer, a crease at 38 degrees keeps the real corners); the face's UVs are the shape's metres, the returns' UVs are
// metres along the outline and through the depth. `vcol(u, v)` optionally gives the face vertices a colour (fading).
export function channelGeo(shapes, depth, lip = 0.03, { crease = 38, curveSegments = 1 } = {}) {
  const g0 = new THREE.ExtrudeGeometry(shapes, { depth: depth - 2 * lip, bevelEnabled: lip > 0, bevelThickness: lip, bevelSize: lip, bevelOffset: -lip, bevelSegments: 1, curveSegments, steps: 1 });
  g0.translate(0, 0, lip);
  const P = g0.getAttribute('position'), N = g0.getAttribute('normal'), U = g0.getAttribute('uv');
  const nT = P.count / 3;
  const isCap = new Uint8Array(nT);
  for (const gr of g0.groups) if (gr.materialIndex === 0) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) isCap[t] = 1;
  const bins = [[], [], []];
  for (let t = 0; t < nT; t++) {
    const nz = (N.getZ(t * 3) + N.getZ(t * 3 + 1) + N.getZ(t * 3 + 2)) / 3;
    bins[isCap[t] ? (nz > 0 ? 0 : 1) : 2].push(t);
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
  const side = g.groups[2];
  if (side && side.count) {
    // smooth the returns: per position and class, the triangles within the crease angle
    const key = (i) => Math.round(pos[i * 3] * 2000) + ',' + Math.round(pos[i * 3 + 1] * 2000) + ',' + Math.round(pos[i * 3 + 2] * 2000);
    const cls = (i) => (Math.abs(nor[i * 3 + 2]) < 0.3 ? 0 : 1);
    const at = new Map();
    for (let i = side.start; i < side.start + side.count; i++) {
      const kk = key(i) + '|' + cls(i);
      let a = at.get(kk); if (!a) at.set(kk, (a = []));
      a.push(i);
    }
    const cosC = Math.cos((crease * Math.PI) / 180), out = new Float32Array(side.count * 3);
    for (const list of at.values()) {
      for (const i of list) {
        let sx = 0, sy = 0, sz = 0;
        for (const j of list) {
          const d = nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2];
          if (d >= cosC) { sx += nor[j * 3]; sy += nor[j * 3 + 1]; sz += nor[j * 3 + 2]; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        const q = (i - side.start) * 3; out[q] = sx / l; out[q + 1] = sy / l; out[q + 2] = sz / l;
      }
    }
    for (let i = side.start; i < side.start + side.count; i++) { const q = (i - side.start) * 3; nor[i * 3] = out[q]; nor[i * 3 + 1] = out[q + 1]; nor[i * 3 + 2] = out[q + 2]; }
    for (let v = side.start; v < side.start + side.count; v += 3) {
      let acc = 0;
      for (let q = 0; q < 3; q++) acc += Math.abs(nor[(v + q) * 3]) > Math.abs(nor[(v + q) * 3 + 1]) ? 1 : 0;
      for (let q = 0; q < 3; q++) { const i = v + q; uv[i * 2] = acc >= 2 ? pos[i * 3 + 1] : pos[i * 3]; uv[i * 2 + 1] = pos[i * 3 + 2]; }
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g0.dispose();
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
