// Where is "up" in the Alma Mater scan? (companion to alma_mater.mjs, 2026-09-29: the owner saw the statue "slightly
// tilted towards back"). The photogrammetry capture's +Y is only roughly vertical. Treads are level and risers plumb,
// so in her frame (alma_mater.mjs's yaw and origin):
//   treads  the area-weighted mean normal of the faces within W deg of up: the true up, directly
//   risers  the faces within W deg of horizontal: true up is the direction their normals are most perpendicular to
//           (the smallest eigenvector of their area-weighted normal scatter)
// Each estimate is iterated: the faces are chosen again in the frame the last estimate levels, until it stops moving
// (a window chosen in the tilted frame pulls the answer back toward the tilt). Two regions: the statue's own stepped
// base (inside its footprint, under the bronze) and the Low steps round it (the capture's ground, 1.3-4 m out).
// Prints each as a pitch (+ = her top leaning back, toward -z) and a roll (+ = leaning to her left, +x).
//   node tools/assets/alma_tilt.mjs <scan.glb> [W deg, default 15]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [src, wArg] = process.argv.slice(2);
const W = ((+(wArg || 15)) * Math.PI) / 180;
const A = (-15 * Math.PI) / 180, cA = Math.cos(A), sA = Math.sin(A), UC = -0.745, VC = 0.695, YB = -1.52;   // = alma_mater.mjs
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const toHer = (w) => [cA * w[0] + sA * w[2] - UC, w[1] - YB, -sA * w[0] + cA * w[2] - VC];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// every triangle once: centroid, unit normal, area (her frame, uncorrected)
const tris = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), I = prim.getIndices();
    const v = [0, 0, 0], get = (i) => { P.getElement(i, v); return toHer(mul(M, v)); };
    const cnt = I ? I.getCount() : P.getCount();
    for (let k = 0; k < cnt; k += 3) {
      const a = get(I ? I.getScalar(k) : k), b = get(I ? I.getScalar(k + 1) : k + 1), c = get(I ? I.getScalar(k + 2) : k + 2);
      const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(...n); if (l < 1e-12) continue;
      tris.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3, n[0] / l, n[1] / l, n[2] / l, l / 2]);
    }
  }
}
const regions = {
  base: (t) => Math.abs(t[0]) < 1.05 && Math.abs(t[2]) < 1.2 && t[1] > 0.0 && t[1] < 1.5,
  lowSteps: (t) => { const r = Math.max(Math.abs(t[0]) - 1.05, Math.abs(t[2]) - 1.2); return r > 0.25 && r < 3.0 && t[1] > -1.5 && t[1] < 0.6; },
};
const deg = (x) => (x * 180) / Math.PI;
const fmt = (u) => `pitch ${deg(Math.atan2(-u[2], u[1])).toFixed(2)} deg, roll ${deg(Math.atan2(u[0], u[1])).toFixed(2)} deg`;
const smallestEig = (S) => {
  const d = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const Se = S.map((row, i) => row.map((v, j) => v + (i === j ? 1e-9 : 0))), D = d(Se);
  let x = [0, 1, 0];
  for (let it = 0; it < 60; it++) {
    const r = [];
    for (let c = 0; c < 3; c++) r.push(d(Se.map((row, i) => row.map((v, j) => (j === c ? x[i] : v)))) / D);
    const l = Math.hypot(...r); x = r.map((v) => v / l);
  }
  return x[1] < 0 ? x.map((v) => -v) : x;
};
for (const [name, inR] of Object.entries(regions)) {
  const T = tris.filter(inR);
  for (const method of ['treads', 'risers']) {
    let up = [0, 1, 0], area = 0;
    for (let it = 0; it < 12; it++) {
      let m = [0, 0, 0]; const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; area = 0;
      for (const t of T) {
        const n = [t[3], t[4], t[5]], c = dot(n, up);
        if (method === 'treads' && c > Math.cos(W)) { m = m.map((x, i) => x + n[i] * t[6]); area += t[6]; }
        if (method === 'risers' && Math.abs(c) < Math.sin(W)) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += n[i] * n[j] * t[6]; area += t[6]; }
      }
      const nu = method === 'treads' ? (() => { const l = Math.hypot(...m); return m.map((x) => x / l); })() : smallestEig(S);
      const moved = Math.acos(Math.min(1, dot(nu, up)));
      up = nu;
      if (moved < 1e-5) break;
    }
    console.log(`${name.padEnd(9)} ${method.padEnd(7)} ${area.toFixed(2).padStart(6)} m2  up (${up.map((x) => x.toFixed(4)).join(', ')})  ${fmt(up)}`);
  }
}
