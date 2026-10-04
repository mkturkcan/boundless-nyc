// AR33 HPT: the Pepsi-Cola sign's steel as real sections (pure geometry: Builders per material, no scene; node tests import it).
// Local frame: x = u along the sign from its north end, y = height over the ground, z = toward the river. The grid is a black
// steel scaffold on four pairs of round navy columns: a big wide-flange girder on each column line, a grated catwalk between
// them, a front and a back plane of posts (equal angles) with a wide-flange beam every 1.56 m, X bracing, ties between the
// planes, gusset plates at the joints, caged ladders at both ends, the bottle's own mast above the top chord, and the
// standoffs that carry the letters. Measured on the Commons photographs (docs/notes/ar33-hpt.md).
import * as THREE from 'three';
import { Builder, angle, wide, rect, circle, channel, railing, ladder, X1, Y1 } from './hptSignSteel.js';
import { SIGN } from './hptSignData.js';
import { insideLetters, insideBottle } from './hptSignFaceGeo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ANG4 = angle(0.1, 0.0095), ANG3 = angle(0.076, 0.0064), ANG25 = angle(0.064, 0.0064);
const WF6 = wide(0.153, 0.153, 0.0058, 0.0093), WF8 = wide(0.206, 0.133, 0.0058, 0.0084), W14 = wide(0.36, 0.17, 0.0075, 0.0115);
const GIRDER = wide(0.9, 0.3, 0.016, 0.03), CH6 = channel(0.152, 0.05, 0.0065);
const PIPE60 = circle(0.030, 8), PIPE48 = circle(0.024, 8), PIPE90 = circle(0.045, 10);

// a flat grating quad (y up), UVs in metres
function gratingQuad(B, x0, x1, z0, z1, y) {
  const n = V(0, 1, 0);
  const a = V(x0, y, z1), b = V(x1, y, z1), c = V(x1, y, z0), d = V(x0, y, z0);
  B.tri(a, b, c, n, n, n, [0, 0], [x1 - x0, 0], [x1 - x0, z1 - z0]);
  B.tri(a, c, d, n, n, n, [0, 0], [x1 - x0, z1 - z0], [0, z1 - z0]);
}
// a joint plate in a plane z = const: a rectangle with one cut corner, centred at (x, y)
function joint(B, x, y, z, s = 0.11, t = 0.008) {
  B.plate([x, y, z], X1, Y1, [[-s, -s], [s, -s], [s, s * 0.3], [s * 0.3, s], [-s, s]], t);
}

// Returns { steel, navy, conc, grate, light, parts } Builders, plus `count` (members) for the log.
export function buildGrid() {
  const steel = new Builder(), navy = new Builder(), conc = new Builder(), grate = new Builder(), light = new Builder(), mast = new Builder();
  const [f0, f1] = SIGN.FRAME, D = SIGN.DEPTH, [g0, g1] = SIGN.GIRDER, TOP = SIGN.TOP, LW = SIGN.LETTER_W, LD = SIGN.LETTER_D;
  const zF = -0.05, zB = -D + 0.05, zcF = zF - 0.05, zcB = zB + 0.05;    // the planes and the column / girder lines
  const NB = 16, st = (f1 - f0) / NB, post = (k) => f0 + k * st;
  const NL = 9, Y = Array.from({ length: NL }, (_, i) => g1 + ((TOP - g1) * i) / (NL - 1));
  let count = 0;

  // ---- the columns: concrete pedestals, base plates with anchor studs and nuts, round navy tubes with rings, cap plates
  for (const u of SIGN.COLS) {
    for (const z of [zcF, zcB]) {
      conc.box([u, 0.175, z], 0.65, 0.175, 0.65);
      conc.box([u, 0.39, z], 0.52, 0.015, 0.52);                             // the grout pad
      steel.box([u, 0.42, z], 0.42, 0.02, 0.42);                              // the base plate
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const px = u + sx * 0.34, pz = z + sz * 0.34;
        steel.member(circle(0.022, 8), [px, 0.44, pz], [px, 0.58, pz], null, { smooth: true, caps: true });
        steel.member(circle(0.04, 6), [px, 0.46, pz], [px, 0.5, pz], null, { caps: true });      // the nut
      }
      navy.member(circle(0.31, 20), [u, 0.44, z], [u, g0 - 0.02, z], null, { smooth: true, caps: true });
      navy.member(circle(0.345, 20), [u, 0.44, z], [u, 0.52, z], null, { smooth: true, caps: true });        // the collar
      navy.member(circle(0.345, 20), [u, g0 - 0.12, z], [u, g0 - 0.02, z], null, { smooth: true, caps: true });
      for (let k = 0; k < 4; k++) {   // four base stiffeners
        const a = (k * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a);
        steel.plate([u + cx * 0.3, 0.46, z + cz * 0.3], V(cx, 0, cz), Y1, [[0, 0], [0.16, 0], [0, 0.5]], 0.012);
      }
      count += 12;
    }
    // cross beam under the catwalk on the column line, front column to back column
    steel.member(W14, [u, g0 + 0.15, zcF], [u, g0 + 0.15, zcB], [0, 1, 0]);
  }

  // ---- the two main girders (front and back) and the catwalk between them
  for (const z of [zcF, zcB]) steel.member(GIRDER, [f0 - 0.6, (g0 + g1) / 2, z], [f1 + 0.6, (g0 + g1) / 2, z], [0, 1, 0]);
  for (const z of [-0.85, -1.4, -1.95]) steel.member(CH6, [f0 - 0.4, g1 - 0.08, z], [f1 + 0.4, g1 - 0.08, z], [0, 1, 0]);
  gratingQuad(grate, f0 - 0.6, f1 + 0.6, zcB + 0.3, zcF - 0.3, g1 + 0.005);
  // the catwalk's edge angles and toe plates
  for (const z of [zcB + 0.3, zcF - 0.3]) steel.member(ANG3, [f0 - 0.6, g1 + 0.0, z], [f1 + 0.6, g1 + 0.0, z], [0, 1, 0]);
  count += 12;

  // ---- the two planes: posts, beams every 1.56 m, X bracing, joint plates
  for (const [z, full] of [[zF, true], [zB, false]]) {
    for (let k = 0; k <= NB; k++) {
      if (!full && k % 2) continue;
      steel.member(ANG4, [post(k), g1 + 0.01, z], [post(k), TOP, z], [1, 0, 0]);
      count++;
    }
    for (let i = 0; i < NL; i++) {
      const top = i === NL - 1;
      if (!full && !(i % 2 === 0)) continue;
      steel.member(top ? WF8 : WF6, [f0 - 0.2, Y[i], z], [f1 + 0.2, Y[i], z], [0, 1, 0]);
      count++;
      if (full) for (let k = 0; k <= NB; k++) joint(steel, post(k), Y[i], z + 0.06, 0.1);
    }
    // X bracing over each two-beam band
    for (let j = 0; j + 2 < NL; j += 2) {
      for (let k = 0; k < NB; k++) {
        if (!full && k % 2) continue;
        const x0 = post(k), x1 = post(full ? k + 1 : Math.min(NB, k + 2));
        steel.member(ANG25, [x0, Y[j] + 0.08, z + 0.06], [x1, Y[j + 2] - 0.08, z + 0.06], [0, 0, 1]);
        steel.member(ANG25, [x1, Y[j] + 0.08, z + 0.06], [x0, Y[j + 2] - 0.08, z + 0.06], [0, 0, 1]);
        count += 2;
      }
    }
  }
  // ---- ties between the planes: a beam at every other post on every other level, plan diagonals, the end frames
  for (let k = 0; k <= NB; k += 2) for (let i = 0; i < NL; i += 2) {
    steel.member(WF6, [post(k), Y[i], zF], [post(k), Y[i], zB], [0, 1, 0]); count++;
  }
  for (let i = 0; i < NL; i += 4) for (let k = 0; k < NB; k += 2) {
    steel.member(ANG25, [post(k), Y[i] - 0.09, zF], [post(k + 2), Y[i] - 0.09, zB], [0, 1, 0]);
    steel.member(ANG25, [post(k + 2), Y[i] - 0.09, zF], [post(k), Y[i] - 0.09, zB], [0, 1, 0]);
    count += 2;
  }
  for (const x of [f0, f1]) for (let j = 0; j + 2 < NL; j += 2) {
    steel.member(ANG3, [x, Y[j], zF], [x, Y[j + 2], zB], [1, 0, 0]);
    steel.member(ANG3, [x, Y[j], zB], [x, Y[j + 2], zF], [1, 0, 0]);
    count += 2;
  }
  // ---- walkways at the middle and the top: grating 1 m wide along the back plane, rails on both edges
  for (const i of [4, 8]) {
    gratingQuad(grate, f0 - 0.2, f1 + 0.2, zB - 0.05, zB + 0.95, Y[i] + 0.05);
    steel.member(ANG3, [f0 - 0.2, Y[i] + 0.05, zB - 0.05], [f1 + 0.2, Y[i] + 0.05, zB - 0.05], [0, 1, 0]);
    steel.member(ANG3, [f0 - 0.2, Y[i] + 0.05, zB + 0.95], [f1 + 0.2, Y[i] + 0.05, zB + 0.95], [0, 1, 0]);
    railing(steel, [[f0 - 0.2, Y[i] + 0.05, zB + 0.95], [f1 + 0.2, Y[i] + 0.05, zB + 0.95]], { h: 1.07, step: st / 2, r: 0.021, toe: 0.1 });
    railing(steel, [[f0 - 0.2, Y[i] + 0.05, zB - 0.05], [f1 + 0.2, Y[i] + 0.05, zB - 0.05]], { h: 1.07, step: st / 2, r: 0.021, toe: 0.1 });
    count += 6;
  }
  // the main catwalk's rails: the river side and the land side
  railing(steel, [[f0 - 0.6, g1, zcF - 0.3], [f1 + 0.6, g1, zcF - 0.3]], { h: 1.07, step: 1.8, r: 0.021, toe: 0.1 });
  railing(steel, [[f0 - 0.6, g1, zcB + 0.3], [f1 + 0.6, g1, zcB + 0.3]], { h: 1.07, step: 1.8, r: 0.021, toe: 0.1 });
  // ---- caged ladders at both ends on the land side, from the pedestal to the top
  for (const x of [f0 + 0.45, f1 - 0.45]) {
    ladder(steel, x, 0.5, zB - 0.38, g1, X1, V(0, 0, -1), { w: 0.46, cage: true });
    ladder(steel, x, g1, zB - 0.38, Y[8] + 0.9, X1, V(0, 0, -1), { w: 0.46, cage: true });
    count += 2;
  }
  // ---- the bottle's mast: two angles leaning with the bottle above the top chord, rungs and X's between them (AR34: painted blue,
  // its own builder: the May 2026 photograph shows it mid-blue, rgb 37, 66, 126, against the black grid)
  {
    const lean = -0.14, sn = Math.sin(lean), cs = Math.cos(lean), ux = 44.9, y0 = TOP, hgt = 3.6, z = zF + 0.12;
    const at = (du, h) => [ux + du * cs - h * sn, y0 + du * sn + h * cs, z];
    for (const du of [-0.38, 0.38]) mast.member(ANG3, at(du, 0), at(du, hgt), [0, 0, 1]);
    for (let h = 0.45; h <= hgt; h += 0.6) mast.member(ANG25, at(-0.38, h - 0.45), at(0.38, h), [0, 0, 1]);
    for (let h = 0; h <= hgt; h += 0.9) mast.member(ANG25, at(-0.38, h), at(0.38, h), [0, 0, 1]);
    count += 16;
  }
  // ---- LED strips on a few diagonals (emissive at night): thin boxes along the front plane's braces
  for (const [j, k, flip] of [[0, 3, 0], [2, 6, 1], [4, 9, 0], [6, 11, 1], [2, 13, 0], [4, 2, 1], [0, 8, 1], [6, 5, 0]]) {
    const x0 = post(k), x1 = post(k + 1), ya = Y[j] + 0.08, yb = Y[j + 2] - 0.08;
    const a = flip ? [x1, ya, zF + 0.12] : [x0, ya, zF + 0.12], b = flip ? [x0, yb, zF + 0.12] : [x1, yb, zF + 0.12];
    light.member(rect(0.012, 0.03), a, b, [0, 0, 1], { caps: true });
  }
  // ---- the standoffs: pipes from the grid's front plane to the letters' backs wherever a letter is behind a joint
  const back = LW - LD, vBase = SIGN.LETTER_V0;
  let nStand = 0;
  for (let k = 0; k <= NB; k++) for (let i = 0; i < NL; i++) {
    const x = post(k), y = Y[i], u = x, v = y - vBase;
    const ok = (uu, vv) => insideLetters(uu, vv) || insideBottle(uu, vv);
    if (!(ok(u, v) && ok(u - 0.2, v) && ok(u + 0.2, v) && ok(u, v - 0.2) && ok(u, v + 0.2))) continue;
    steel.member(PIPE60, [x, y, zF + 0.06], [x, y, back - 0.01], null, { smooth: true, caps: true });
    steel.box([x, y, back - 0.012], 0.11, 0.11, 0.012);
    nStand++;
  }
  count += nStand;
  return { steel, navy, conc, grate, light, mast, count, nStand };
}
