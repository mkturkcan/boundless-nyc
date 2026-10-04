// AR33 sk: the concrete flags. The compiled sidewalk (tile.S.sidewalk, one flat plane at 3.52) is cut into 5 ft flags in the
// street grid's frame; each flag is shrunk by half a tooled joint on every side (so the joints are real gaps down to a dark
// floor), carries its own height (heave), tilt, tone and texture window, and every 4th joint is a bitumen expansion joint.
// Pure (no three): docs/notes/ar33-street.md.
import { clipHalf, hash2 } from './skGeom.js';

export const FLAG = 1.524;   // 5 ft
const JOINT = 0.0080;        // half a tooled joint: 16 mm, the groove and its rounded, dirt-filled edges as they read (an
                             // 11 mm gap drew as a hairline at 2 m, w2r1_b/close_b3s_day.jpg; b3_mid 2026-08 shows dark joints)
const EXPANSION = 0.0115;    // half an expansion joint (23 mm), every 4th a-joint

export function makeFrame(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return { ax: c, az: s, bx: -s, bz: c, theta };
}
// the k-th joint along an axis: nominal 5 ft with a per-joint wobble (real pours are never on the dot)
const jointAt = (k, seed) => k * FLAG + (hash2(k * 131 + seed, seed * 7 + 3) - 0.5) * 0.16;

// orient a polygon [[x, z, y], ...] so that fanned triangles face up; returns the vertex order
function upOrder(poly) {
  let A = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const P = poly[i], Q = poly[(i + 1) % n]; A += P[0] * Q[1] - Q[0] * P[1]; }
  // a triangle (p, q, r) in (x, z) faces up (+y) when (qz-pz)(rx-px) - (qx-px)(rz-pz) > 0, which is a NEGATIVE shoelace area
  return A < 0 ? poly : poly.slice().reverse();
}

// tris: world triangles [[x, y, z] x3]; frameFor(T): { ax, az, bx, bz, a0, b0, seed } (makeFrame() gives the plain grid frame; the
// kerb-anchored frames come from skBuild); buf: a Buf. opt: { seed, yFlag (0.005), yFloor (0.002) }
export function buildFlags(tris, frameFor, buf, opt = {}) {
  const yFlag = opt.yFlag ?? 0.005, yFloor = opt.yFloor ?? 0.002;
  let nFlags = 0;
  for (const T of tris) {
    const frame = typeof frameFor === 'function' ? frameFor(T) : frameFor;
    const { ax, az, bx, bz } = frame, seed = frame.seed ?? opt.seed ?? 11, a0f = frame.a0 || 0, b0f = frame.b0 || 0;
    const fa = (p) => p[0] * ax + p[1] * az - a0f, fb = (p) => p[0] * bx + p[1] * bz - b0f;
    const poly = upOrder(T.map((p) => [p[0], p[2], p[1]]));
    // the joint floor: the triangle itself, a hair above the compiled walk, dark (the grout reads through the gaps)
    {
      const ids = poly.map((p) => buf.v(p[0], p[2] + yFloor, p[1], 0, 1, 0, p[0] * 0.9 + 3.1, p[1] * 0.9 + 7.7, 0.19, 0.185, 0.175));   // the joint's dirt
      buf.fan(ids);
    }
    let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
    for (const p of poly) { const a = fa(p), b = fb(p); amin = Math.min(amin, a); amax = Math.max(amax, a); bmin = Math.min(bmin, b); bmax = Math.max(bmax, b); }
    const i0 = Math.floor(amin / FLAG) - 1, i1 = Math.floor(amax / FLAG) + 1, j0 = Math.floor(bmin / FLAG) - 1, j1 = Math.floor(bmax / FLAG) + 1;
    for (let i = i0; i <= i1; i++) {
      const dA0 = (i % 4 === 0) ? EXPANSION : JOINT, dA1 = ((i + 1) % 4 === 0) ? EXPANSION : JOINT;
      const A0 = jointAt(i, seed), A1 = jointAt(i + 1, seed), a0 = A0 + dA0, a1 = A1 - dA1;
      if (a1 < amin || a0 > amax) continue;
      let colPoly = clipHalf(clipHalf(poly, (p) => a0 - fa(p)), (p) => fa(p) - a1);
      if (colPoly.length < 3) continue;
      for (let j = j0; j <= j1; j++) {
        const B0 = jointAt(j, seed + 97), B1 = jointAt(j + 1, seed + 97), b0 = B0 + JOINT, b1 = B1 - JOINT;
        if (b1 < bmin || b0 > bmax) continue;
        const piece = clipHalf(clipHalf(colPoly, (p) => b0 - fb(p)), (p) => fb(p) - b1);
        if (piece.length < 3) continue;
        // a sliver smaller than a fingernail is just the triangle's corner: leave it to the floor
        let A = 0; for (let k = 0, n = piece.length; k < n; k++) { const P = piece[k], Q = piece[(k + 1) % n]; A += P[0] * Q[1] - Q[0] * P[1]; }
        if (Math.abs(A) < 4e-4) continue;
        // the flag's own character
        const h = (n) => hash2(i * 7919 + n * 131 + seed, j * 104729 + n * 17 + 5);
        const h8 = h(8);
        // flag to flag the tone steps visibly (b3_mid 2026-08; at 0.84-1.04 the walk read as one slab, w2r1_e/close_b3s), but a
        // whole flag at 0.62 next to a fresh one at 1.18 (1.9x) read as a cream / grey-brown patchwork (QA Q38, q3026Ne 2026-10-01):
        // the fresh pours and the stained flags are pulled in (1.06-1.10, 0.72-0.80) and the stained ones halved (6 %)
        let tone = 0.78 + 0.24 * h(1), dy = (h(2) - 0.5) * 0.0024, lift = 0;
        if (h8 < 0.035) { tone = 1.06 + 0.04 * h(9); lift = 0.0012; }          // a fresh pour: light, a hair proud
        else if (h8 < 0.075) { tone = 0.80 + 0.06 * h(9); lift = -0.0010; }     // an old flag, walked down and dark
        else if (h8 < 0.135) { tone = 0.72 + 0.08 * h(9); }                     // stained: a spill, a leak from a sidewalk shed, soot
        const cast = (h(3) - 0.5) * 0.07;
        const cr = tone * (1 + cast), cg = tone, cb = tone * (1 - cast);
        const gA = (h(4) - 0.5) * 0.0028, gB = (h(5) - 0.5) * 0.0028;           // heave: mm per metre either way
        const ac = (A0 + A1) / 2, bc = (B0 + B1) / 2;
        const uo = h(6) * 3.0, vo = h(7) * 3.0, rot = Math.floor(h(10) * 4);
        // a saw cut across the middle of about one flag in seven: two slabs with a 3 mm kerf between them
        const sawn = h(11) < 0.14, am = (A0 + A1) / 2;
        const parts = sawn ? [clipHalf(piece, (p) => fa(p) - (am - 0.0015)), clipHalf(piece, (p) => (am + 0.0015) - fa(p))] : [piece];
        for (const pc of parts) {
          if (pc.length < 3) continue;
          const ids = upOrder(pc).map((p) => {
            const a = fa(p), b = fb(p);
            let u = a - A0 + uo, v = b - B0 + vo;
            if (rot & 1) { const t = u; u = v; v = t; }
            if (rot & 2) u = -u;
            // the kerb-side 60 cm is darker: gutter spray, salt and tyres (frames anchored to a kerb only)
            const gk = frame.kerb ? 0.82 + 0.18 * Math.min(1, Math.max(0, b / 0.7)) : 1;
            return buf.v(p[0], p[2] + yFlag + dy + lift + gA * (a - ac) + gB * (b - bc), p[1], 0, 1, 0, u, v, cr * gk, cg * gk, cb * gk);
          });
          buf.fan(ids);
        }
        nFlags++;
      }
    }
  }
  return nFlags;
}
