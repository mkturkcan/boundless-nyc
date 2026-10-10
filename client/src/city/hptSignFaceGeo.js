// AR33 HPT: the Pepsi-Cola sign's face as geometry (pure: no canvas, no scene; the node tests import it). Local frame: u along
// the sign from the P's curl, v up from the swash's baseline, w toward the river; the letters' face plane is w = depth.
//   * the letters: channel geometry (hptSignTrace.js channelGeo) from the traced outline loops (hptSignOutline.js);
//   * the neon: swept 15 mm tubes along the outline offset 7 cm (LPC: 15 mm tubes at the letters' edges) on small standoffs;
//   * the bottle: a 0.24 m deep cut-out with a cream return, its front UVs mapped to the bottle's own art (hptSignFace.js);
//   * `insideLetters(u, v)` for the standoffs that carry the letters from the grid.
import * as THREE from 'three';
import { LETTER_LOOPS, NEON_LOOPS } from './hptSignOutline.js';
import { loopsToShapes, channelGeo } from './hptSignTrace.js';
import { Builder, circle } from './hptSignSteel.js';
import { BOT, BPROF } from './hptSignStrokes.js';

const pairs = (flat) => { const L = []; for (let i = 0; i < flat.length; i += 2) L.push([flat[i], flat[i + 1]]); return L; };
export const letterLoops = () => LETTER_LOOPS.map(pairs);
export const neonLoops = () => NEON_LOOPS.map(pairs);

// even-odd point in the letters' outline loops (holes count: the loops are nested)
let _L = null;
export function insideLetters(u, v) {
  const loops = _L || (_L = letterLoops());
  let c = false;
  for (const P of loops) {
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > v) !== (P[j][1] > v) && u < ((P[j][0] - P[i][0]) * (v - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
  }
  return c;
}

export function lettersGeometry(depth = 0.42, lip = 0.03) {
  return channelGeo(loopsToShapes(letterLoops()), depth, lip);
}

// ---------------------------------------------------------------- neon
// closed loops swept as tubes of radius r at height z; a standoff every `step` m toward the letter behind (inward, found by
// testing which side lies inside the letters); returns { tube, sup } Builders (local: x = u, y = v, z = w)
export function neonGeometry(loops, z, r = 0.0075, { step = 0.7, seg = 0.14, radial = 7, back = 0.03 } = {}) {
  const tube = new Builder(), sup = new Builder();
  const ring = circle(1, radial);
  for (const L0 of loops) {
    const L = [];
    for (let i = 0; i < L0.length; i++) {
      const a = L0[i], b = L0[(i + 1) % L0.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / seg));
      for (let k = 0; k < n; k++) L.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const n = L.length;
    if (n < 4) continue;
    const frames = L.map((p, i) => {
      const a = L[(i - 1 + n) % n], b = L[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      return [p[0], p[1], ty, -tx];
    });
    const V = (f, k) => {
      const [cx, cy] = ring[k % radial], [px0, py0, nx, ny] = f;
      return [new THREE.Vector3(px0 + nx * cx * r, py0 + ny * cx * r, z + cy * r), new THREE.Vector3(nx * cx, ny * cx, cy)];
    };
    let run = 0;
    for (let i = 0; i < n; i++) {
      const f0 = frames[i], f1 = frames[(i + 1) % n];
      for (let k = 0; k < radial; k++) {
        const [a0, n0] = V(f0, k), [a1, n1] = V(f0, k + 1), [b0, m0] = V(f1, k), [b1, m1] = V(f1, k + 1);
        tube.tri(a0, b0, b1, n0, m0, m1, [0, 0], [1, 0], [1, 1]);
        tube.tri(a0, b1, a1, n0, m1, n1, [0, 0], [1, 1], [0, 1]);
      }
      run += Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
      if (run > step) {
        run = 0;
        // inward = the side of the tube's tangent normal that lies in the letters
        const nx = f0[2], ny = f0[3];
        const s = insideLetters(f0[0] - nx * 0.09, f0[1] - ny * 0.09) ? -1 : insideLetters(f0[0] + nx * 0.09, f0[1] + ny * 0.09) ? 1 : 0;
        if (s) sup.member(circle(0.006, 5), [f0[0], f0[1], z - r * 0.5], [f0[0] + s * nx * 0.075, f0[1] + s * ny * 0.075, z - back], [0, 0, 1], { smooth: true, caps: false });
      }
    }
  }
  return { tube, sup };
}

// ---------------------------------------------------------------- the bottle
// the half profile [h, r] smoothed with a Catmull-Rom through the body, shoulder and neck, the crown's collar kept straight
export function bottleOutline(grow = 0, n = 10) {
  const R = BOT.R, H = BOT.H;
  const body = BPROF.slice(0, 9).map(([h, r]) => new THREE.Vector2(r * R + grow, h * H));
  const cr = new THREE.SplineCurve(body);
  const half = cr.getPoints(body.length * n);
  for (const [h, r] of BPROF.slice(9)) half.push(new THREE.Vector2(r * R + grow, h * H));
  const pts = half.map((p) => [p.x, p.y]);
  const left = half.slice().reverse().map((p) => [-p.x, p.y]);
  return pts.concat(left);
}
// bottle-frame (x across, y up from the foot) to the sign's (u, v)
export function bottleToSign([x, y]) {
  const c = Math.cos(BOT.lean), s = Math.sin(BOT.lean);
  return [BOT.u + x * c - y * s, BOT.v + x * s + y * c];
}
// the cut-out in the sign's frame (u, v, w), back at w = 0, face at w = depth; face UVs map to the bottle's art (0..1)
export function bottleGeometry(depth = 0.24, lip = 0.02) {
  const shape = new THREE.Shape(bottleOutline(0).map(([x, y]) => new THREE.Vector2(x, y)));
  const g = channelGeo([shape], depth, lip);
  const P = g.getAttribute('position'), U = g.getAttribute('uv');
  for (const gr of g.groups) {
    if (gr.materialIndex > 1) continue;
    for (let i = gr.start; i < gr.start + gr.count; i++) U.setXY(i, (P.getX(i) + BOT.R) / (2 * BOT.R), P.getY(i) / BOT.H);
  }
  const c = Math.cos(BOT.lean), s = Math.sin(BOT.lean);
  g.applyMatrix4(new THREE.Matrix4().set(c, -s, 0, BOT.u, s, c, 0, BOT.v, 0, 0, 1, 0, 0, 0, 0, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
let _BP = null;
export function insideBottle(u, v) {
  const P = _BP || (_BP = bottleOutline(0).map(bottleToSign));
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > v) !== (P[j][1] > v) && u < ((P[j][0] - P[i][0]) * (v - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}
// the neon line round the bottle: the outline grown 7 cm, as a loop in the sign's frame
export function bottleNeonLoop(grow = 0.07) { return bottleOutline(grow).map(bottleToSign); }

// a flat glow ribbon along closed loops (in the plane z, `hw` either side of the line; u along, v across 0..1): the neon's
// halo at a distance, where a 15 mm tube is under a pixel
export function glowRibbon(loops, z, hw = 0.1, { seg = 0.4 } = {}) {
  const B = new Builder();
  const nrm = V3(0, 0, 1);
  for (const L0 of loops) {
    const L = [];
    for (let i = 0; i < L0.length; i++) {
      const a = L0[i], b = L0[(i + 1) % L0.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / seg));
      for (let k = 0; k < n; k++) L.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const n = L.length;
    if (n < 4) continue;
    const P = L.map((p, i) => {
      const a = L[(i - 1 + n) % n], b = L[(i + 1) % n];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      return [p[0], p[1], ty, -tx];
    });
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const a0 = V3(a[0] + a[2] * hw, a[1] + a[3] * hw, z), a1 = V3(a[0] - a[2] * hw, a[1] - a[3] * hw, z);
      const b0 = V3(b[0] + b[2] * hw, b[1] + b[3] * hw, z), b1 = V3(b[0] - b[2] * hw, b[1] - b[3] * hw, z);
      B.tri(a0, a1, b1, nrm, nrm, nrm, [0, 1], [0, 0], [1, 0]);
      B.tri(a0, b1, b0, nrm, nrm, nrm, [0, 1], [1, 0], [1, 1]);
    }
  }
  return B;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
