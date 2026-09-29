// SIT31 — seated clips for the crowd's GEN2 skeleton (docs/notes/crowd-looks.md "Sit contract"). Pure JS (no three.js), so
// tools/assets/crowd_sitqa.mjs runs the same code in Node.
//
// TWO LAYERS.
//  1. synthSitClips(): one shared clip per pose, solved once on the reference body at load. It carries the pelvis, spine,
//     neck, head, legs and fingers (and reference arms, used only until a walker's own arms are solved). Each clip is a 10 s
//     loop at 10 fps with a few breaths and a slow look around. Bodies differ in leg proportions while the rotations are
//     shared, so each clip also carries per body the hips-translation scale that puts THAT body's soles back on the floor
//     (clip.kBody) and its seat point (clip.seat = [up, back], model metres).
//  2. solveSitArms(): the ARMS PER WALKER (owner 2026-09-28, round 2: "upper arms are clipping heavily into chests"). The
//     shared arm rotations had been solved on the reference body and reused by every body. On a wider or deeper torso they
//     sank into the chest, and the forearms came out of the belly (the IK pole also swung the elbows back behind the flank).
//     Now each walker's clavicles, arms, forearms and hands (and, for the chin and phone poses, the upper spine, neck and
//     head) are solved from ITS body: its bone lengths, its shoulder positions, and its torso outline. The outline is the
//     torso vertices of its own LOD0 mesh (bodyOutline, at load), skinned into the seated pose and cut into 2 cm slabs,
//     each a radial hull round its centroid. The solve also uses the walker's world scale, so a table top 0.275 m over the
//     seat is the same in metres for every walker. The pose pass reads the result as per-walker rotation overrides.
//
// Model space: +X the walker's left, +Y up, +Z forward. Forward kinematics of s_neutral_idle frame 0 on the 1.82 m CARLA
// reference puts the thigh joints at 0.96 m, the knees at 0.50 m and the ankles at 0.07 m.

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  perp: (a, u) => V.norm(V.sub(a, V.mul(u, V.dot(a, u)))),   // a made perpendicular to unit u
};
// quaternions as [x, y, z, w], Hamilton product (the pose pass's qmul)
const Q = {
  mul: (a, b) => [
    a[3] * b[0] + b[3] * a[0] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + b[3] * a[1] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + b[3] * a[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  inv: (a) => [-a[0], -a[1], -a[2], a[3]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; },
  rot: (q, v) => { const u = [q[0], q[1], q[2]], t = V.mul(V.cross(u, v), 2); return V.add(V.add(v, V.mul(t, q[3])), V.cross(u, t)); },
  axis: (ax, a) => { const n = V.norm(ax), s = Math.sin(a / 2); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; },
  from: (a, b) => {
    const d = V.dot(a, b);
    if (d < -0.999999) return Q.axis(Math.abs(a[0]) < 0.9 ? V.cross(a, [1, 0, 0]) : V.cross(a, [0, 1, 0]), Math.PI);
    const c = V.cross(a, b);
    return Q.norm([c[0], c[1], c[2], 1 + d]);
  },
  // rotation matrix given by its three columns -> quaternion
  ofCols: (c0, c1, c2) => {
    const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
    const tr = m00 + m11 + m22;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return Q.norm([(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]); }
    if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return Q.norm([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]); }
    if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return Q.norm([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]); }
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    return Q.norm([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
  },
  // the rotation taking the orthonormal pair (u0, v0) onto (u1, v1)
  frame: (u0, v0, u1, v1) => { const a = Q.ofCols(u0, v0, V.cross(u0, v0)), b = Q.ofCols(u1, v1, V.cross(u1, v1)); return Q.norm(Q.mul(b, Q.inv(a))); },
};
function ik2(A, la, lb, T, pole) {
  const d = V.sub(T, A), L = Math.min(la + lb - 1e-3, Math.max(Math.abs(la - lb) + 1e-3, V.len(d)));
  const u = V.norm(d), ca = (la * la + L * L - lb * lb) / (2 * la * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const pv = V.norm(V.sub(pole, V.mul(u, V.dot(pole, u))));
  return V.add(A, V.add(V.mul(u, la * ca), V.mul(pv, la * sa)));
}
// column-major 4x4 of a rotation + translation, product, and a point through it
const M4 = {
  of: (q, t) => { const [x, y, z, w] = q; return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0, 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0, 2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]; },
  mul: (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  pt: (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]],
  // inverse of a rigid (rotation + translation) column-major matrix, e.g. an inverse bind matrix -> the bind transform
  invRigid: (m) => { const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]], t = [m[12], m[13], m[14]];
    return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]), 1]; },
};

// ---------------------------------------------------------------- poses
// Seat and table geometry the poses assume (world metres, relative to the seat point; Bryant Park: seat 0.445 m, tops at
// 0.7275 m, the edge 0.26-0.40 m in front of the seat point; TF31: seat 0.465, top 0.735, edge 0.36).
export const TABLE31 = { h: 0.275, edge: 0.3, elbow: 0.345 };
// hip-joint height above the floor (reference model metres; the seat point sits SEAT_DROP under the hip joints: ischial
// tuberosities plus the compressed soft tissue under them)
const HIP_Y = 0.575, SEAT_DROP = 0.085;
// Pose ids are the contract (Crowd.setPose). Angles in radians about the walker's lateral axis, + = forward:
//   pelvis / spine / chest (spine01) / neck / head; feet: [outward, forward] of each ankle (L, R) from standing; back: the
//   hip joints' distance behind the ankles; breath / look: amplitude of the chest breath and of the slow head turn;
//   curl: finger curl per hand [L, R] on top of the idle's relaxed hand (+ toward the palm).
export const SIT_SPECS = [
  { id: 1, name: 'sit_a', arms: 'thigh', back: 0.5, pelvis: 0, spine: 0.09, chest: 0, neck: -0.054, head: 0, feet: [[0.01, 0.02], [0.01, 0.02]], hands: [[0.44, 0.03], [0.46, 0.03]], breath: 1, look: 0.1, lookPh: 0.4, curl: [0.1, 0.1] },
  { id: 2, name: 'sit_b', arms: 'thigh', back: 0.56, pelvis: -0.061, spine: -0.114, chest: 0, neck: 0.096, head: 0, feet: [[0.03, 0.16], [0.02, 0.08]], hands: [[0.3, 0.05], [0.34, 0.05]], breath: 1, look: 0.16, lookPh: 2.1, curl: [0.1, 0.1] },
  // (a) both forearms on the table top, hands loosely together; the torso 15 deg forward
  { id: 3, name: 'table_a', arms: 'table', back: 0.34, pelvis: 0.06, spine: 0.13, chest: 0.07, neck: -0.12, head: -0.06, feet: [[0.07, 0.03], [0.06, -0.05]], breath: 0.6, look: 0.08, lookPh: 1.3, curl: [0.25, 0.25], table: true },
  // (b) the right elbow on the table, chin on that hand; the left forearm flat on the table
  { id: 4, name: 'table_b', arms: 'chin', back: 0.34, pelvis: 0.08, spine: 0.17, chest: 0.12, neck: 0.1, head: 0.12, feet: [[0.07, 0.04], [0.07, -0.05]], breath: 0.5, look: 0, lookPh: 0, curl: [0.2, 1.1], table: true, headSolve: true },
  // (c) both hands round a cup, the forearms on the edge
  { id: 5, name: 'table_c', arms: 'cup', back: 0.34, pelvis: 0.05, spine: 0.12, chest: 0.06, neck: -0.02, head: 0.08, feet: [[0.06, -0.04], [0.07, 0.03]], breath: 0.6, look: 0.04, lookPh: 0.7, curl: [0.85, 0.85], table: true, s32: { keys: 2, sched: [[3.0, 3.8, 4.7, 5.5]], beat: { head: -0.12 }, props: ['cup'] } },
  // (d) a phone in both hands at chest height, head down (the right hand carries the fitted phone prop)
  { id: 6, name: 'phone', arms: 'phone', back: 0.5, pelvis: -0.03, spine: 0.1, chest: 0.12, neck: 0.3, head: 0.22, feet: [[0.02, 0.05], [0.02, 0.01]], breath: 0.8, look: 0, lookPh: 0, curl: [0.35, 0.55] },
  // (e) bench: leaning forward, elbows on the knees, hands clasped
  { id: 7, name: 'bench', arms: 'knees', back: 0.52, pelvis: 0.24, spine: 0.34, chest: 0.24, neck: -0.42, head: -0.24, feet: [[0.07, 0.0], [0.07, 0.0]], breath: 0.7, look: 0.1, lookPh: 2.6, curl: [0.75, 0.75] },
  // SIT32 (owner 2026-09-29: "fix the seated people poses more for people with tables in front of them etc. need more
  // details"): six more table loops, each with motion in its 10 s loop. keys 2: a second arm pose every body is solved
  // for (sit31_arms.json keys1), blended in over sched, each [in from, full at, full until, out by] in loop seconds;
  // beat: head / neck pitch added over the same envelope (the head meets a bite, tips back for a sip); s32: what an older
  // spec gains with SIT32 (?sit32=0 drops the v32 specs and every s32)
  // (f) talking: forearms on the top, hands apart; twice a loop the right hand comes up open, the elbow staying down
  { id: 8, name: 'talk', v32: true, arms: 'talk', back: 0.34, pelvis: 0.05, spine: 0.1, chest: 0.05, neck: -0.08, head: -0.03, feet: [[0.07, 0.03], [0.06, -0.05]], breath: 0.9, look: 0.07, lookPh: 0.9, curl: [0.3, 0.15], table: true, keys: 2, sched: [[1.2, 1.9, 3.3, 4.0], [6.3, 7.0, 7.8, 8.5]], beat: { head: -0.05, neck: -0.03 } },
  // (g) eating: a wrap in the right hand, taken to the mouth for a bite twice a loop; the left forearm on the top
  { id: 9, name: 'eat', v32: true, arms: 'eat', back: 0.34, pelvis: 0.06, spine: 0.12, chest: 0.06, neck: -0.06, head: 0.04, feet: [[0.07, 0.04], [0.07, -0.05]], breath: 0.7, look: 0.05, lookPh: 2.2, curl: [0.3, 0.9], table: true, keys: 2, sched: [[1.0, 1.7, 2.3, 3.0], [5.8, 6.5, 7.1, 7.8]], beat: { head: 0.1, neck: 0.04 }, props: ['wrap'] },
  // (h) reading: both hands on an open book (or a folded paper) on the top, the head down, following the lines; the right
  // hand turns a page once a loop
  { id: 10, name: 'read', v32: true, arms: 'read', back: 0.34, pelvis: 0.07, spine: 0.14, chest: 0.08, neck: 0.12, head: 0.26, feet: [[0.07, 0.03], [0.06, -0.05]], breath: 0.6, look: 0, lookPh: 0, scan: 0.07, curl: [0.25, 0.25], table: true, keys: 2, sched: [[6.2, 6.8, 7.3, 7.9]], props: ['book'] },
  // (i) a laptop on the top: typing (every finger on its own rhythm, in the shared clip) with both hands moving across
  // the keys now and then
  { id: 11, name: 'laptop', v32: true, arms: 'laptop', back: 0.34, pelvis: 0.06, spine: 0.12, chest: 0.06, neck: 0.06, head: 0.16, feet: [[0.07, 0.04], [0.06, -0.04]], breath: 0.6, look: 0.03, lookPh: 1.1, type: true, curl: [0.35, 0.35], table: true, keys: 2, sched: [[2.4, 2.9, 4.4, 4.9], [7.4, 7.9, 8.7, 9.2]], props: ['laptop'] },
  // (j) leaning back, the right arm over the chair's back (the park's folding chair; Times Square's red chairs are the
  // same model), the left forearm on the top
  { id: 12, name: 'lean', v32: true, arms: 'lean', back: 0.4, pelvis: -0.05, spine: -0.05, chest: -0.02, neck: 0.1, head: 0.06, feet: [[0.06, 0.08], [0.05, 0.14]], breath: 1, look: 0.12, lookPh: 1.7, curl: [0.25, 0.45], table: true, noLeanIn: true },
  // (k) legs crossed, the right knee over the left, pelvis and legs turned 40 deg to the walker's left so the crossed knee
  // comes out beside the top (seatOf().knee), the chest turned back to the table; the left forearm on the top, the right
  // hand on the crossed thigh
  { id: 13, name: 'cross', v32: true, arms: 'cross', back: 0.38, pelvis: 0.02, spine: 0.06, chest: 0.03, neck: -0.05, head: 0.02, feet: [[0.05, 0.02], [0, 0]], cross: true, legYaw: 0.7, breath: 0.8, look: 0.1, lookPh: 2.9, curl: [0.25, 0.3], table: true },
];
const FRAMES = 100, FPS = 10;
export const SIT_LOOP = FRAMES / FPS;   // seconds
const ss = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
// SIT32: the key-1 weight of a seated clip's spec at loop time t (seconds): its sched envelopes, smoothstep in and out
export function sitKeyW(sp, t) {
  if (!sp || !sp.sched) return 0;
  let w = 0;
  for (const [a, b, c, d] of sp.sched) {
    const v = t < a || t > d ? 0 : t < b ? ss((t - a) / (b - a)) : t <= c ? 1 : 1 - ss((t - c) / (d - c));
    if (v > w) w = v;
  }
  return w;
}
// the specs a crowd builds: with SIT32 the v32 poses and every s32 addition, without it the SIT31 set as it was
export function sitSpecs(sit32 = true) {
  return SIT_SPECS.filter((sp) => sit32 || !sp.v32).map((sp) => (sit32 && sp.s32 ? { ...sp, ...sp.s32 } : sp));
}
// per-walker override slots (the pose pass: uArmSlot bone -> slot); a slot whose w is 2 keeps the clip's rotation
export const ARM_SLOTS = ['crl_shoulder__L', 'crl_arm__L', 'crl_foreArm__L', 'crl_hand__L', 'crl_shoulder__R', 'crl_arm__R', 'crl_foreArm__R', 'crl_hand__R', 'crl_spine01__C', 'crl_neck__C', 'crl_Head__C'];

// ---------------------------------------------------------------- skeleton helpers
function rig(S) {
  const bi = (n) => S.bones.indexOf(n);
  const J = { hips: S.hips, sp: bi('crl_spine__C'), sp1: bi('crl_spine01__C'), neck: bi('crl_neck__C'), head: bi('crl_Head__C') };
  const side = (s, sgn) => ({
    sgn, clav: bi('crl_shoulder__' + s), arm: bi('crl_arm__' + s), el: bi('crl_foreArm__' + s), wr: bi('crl_hand__' + s),
    mid: bi('crl_handMiddle__' + s), idx: bi('crl_handIndex__' + s), pky: bi('crl_handPinky__' + s),
    fingers: ['Index', 'Middle', 'Ring', 'Pinky'].map((f) => [bi(`crl_hand${f}__${s}`), bi(`crl_hand${f}01__${s}`), bi(`crl_hand${f}02__${s}`)]),
    th: bi('crl_thigh__' + s), kn: bi('crl_leg__' + s), an: bi('crl_foot__' + s),
  });
  const SD = [side('L', 1), side('R', -1)];
  const ok = [...Object.values(J), ...SD.flatMap((o) => [o.clav, o.arm, o.el, o.wr, o.mid, o.idx, o.pky, o.th, o.kn, o.an, ...o.fingers.flat()])].every((v) => v >= 0);
  return ok ? { J, SD, bi } : null;
}
const refT = (B, b) => [B.refT[b * 3], B.refT[b * 3 + 1], B.refT[b * 3 + 2]];
const refR = (B, b) => [B.refR[b * 4], B.refR[b * 4 + 1], B.refR[b * 4 + 2], B.refR[b * 4 + 3]];
function fkOf(S, lq, lt) {
  const nb = S.nb, par = S.parents, G = new Array(nb), P = new Array(nb);
  for (let b = 0; b < nb; b++) {
    const p = par[b];
    if (p < 0) { G[b] = lq[b]; P[b] = lt[b]; } else { G[b] = Q.norm(Q.mul(G[p], lq[b])); P[b] = V.add(P[p], Q.rot(G[p], lt[b])); }
  }
  return { G, P };
}
// a clip frame on body B, the way the pose pass builds it (k: the hips scale; default hipsH / clip.hipsH)
function frameOf(S, D, c, f, B, k = null) {
  const nb = S.nb, W = nb * 8, lq = [], lt = [];
  const kk = k ?? B.hipsH / (c.hipsH || B.hipsH);
  for (let b = 0; b < nb; b++) {
    const o = (c.row + f) * W + b * 8, ok = D[o + 7] > 0.5;
    lq[b] = ok ? [D[o], D[o + 1], D[o + 2], D[o + 3]] : refR(B, b);
    lt[b] = b === S.hips && ok ? [D[o + 4] * kk, D[o + 5] * kk, D[o + 6] * kk] : refT(B, b);
  }
  return { lq, lt };
}

// ---------------------------------------------------------------- body outline (per body, once, from its LOD0 mesh)
// pos: bind positions (model space), jnt / wgt: 4 joints and weights per vertex (canonical bone order), part: tint part per
// vertex (>= 10 = a prop; props are left out), n: vertex count
export function bodyOutline(S, B, pos, jnt, wgt, part, n, nrm = null, cls = null) {
  const R = rig(S);
  if (!R || !B.ibm) return null;
  const { J, SD } = R;
  const bindOf = (b) => M4.invRigid(B.ibm.slice(b * 16, b * 16 + 16));
  const jointBind = (b) => { const m = bindOf(b); return [m[12], m[13], m[14]]; };
  const TORSO = new Set([J.hips, J.sp, J.sp1]);
  const dom = new Int16Array(n), domW = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let bw = -1, bb = -1;
    for (let k = 0; k < 4; k++) { const w = wgt[i * 4 + k]; if (w > bw) { bw = w; bb = jnt[i * 4 + k]; } }
    dom[i] = bb; domW[i] = bw;
  }
  // torso samples: one vertex per 2 cm voxel with its normal, joints and weights (skinned per pose by the solver). The
  // torso is what lies ABOVE THE HIP JOINTS in the bind pose (chest, back, belly, waist) and is less than half weighted to
  // a thigh. Below the hip joints the pelvis-weighted vertices (buttocks, groin, and the hems of skirts, dresses and coats)
  // swing under and over the lap when the thighs rotate to sit, where they would swallow hands resting on the thighs; a
  // first version that kept them read a forearm on a sweater dress's lap as 15 cm inside the torso.
  const THIGHS = new Set([SD[0].th, SD[1].th]);
  const HJ = V.mul(V.add(jointBind(SD[0].th), jointBind(SD[1].th)), 0.5);
  const above = (i) => pos[i * 3 + 1] > HJ[1] - 0.01;
  const vox = new Map(), tp = [], tn = [], tj = [], tw = [];
  for (let i = 0; i < n; i++) {
    if ((part && part[i] >= 10) || (cls && cls[i] === 3) || !TORSO.has(dom[i]) || domW[i] < 0.45) continue;
    let wt = 0; for (let k = 0; k < 4; k++) if (THIGHS.has(jnt[i * 4 + k])) wt += wgt[i * 4 + k];
    if (wt >= 0.5 || !above(i)) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const key = `${Math.floor(x / 0.02)},${Math.floor(y / 0.02)},${Math.floor(z / 0.02)}`;
    if (vox.has(key)) continue;
    vox.set(key, 1);
    tp.push(x, y, z);
    if (nrm) tn.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]); else tn.push(0, 0, 0);
    for (let k = 0; k < 4; k++) { tj.push(jnt[i * 4 + k]); tw.push(wgt[i * 4 + k]); }
  }
  // radial profile of the vertices dominated by bone b round the segment from joint a0 to joint a1: p90 per 10 slabs
  const radial = (bones, a0, a1, pick = null) => {
    const A = jointBind(a0), Bp = jointBind(a1), ax = V.sub(Bp, A), L2 = V.dot(ax, ax), sl = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < n; i++) {
      if ((part && part[i] >= 10) || !bones.has(dom[i]) || domW[i] < 0.5) continue;
      const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], d = V.sub(p, A), t = V.dot(d, ax) / L2;
      if (t < 0 || t > 1) continue;
      const off = V.sub(d, V.mul(ax, t));
      sl[Math.min(9, Math.floor(t * 10))].push(pick ? pick(off) : V.len(off));
    }
    const out = sl.map((a) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.floor(a.length * 0.9)]; });
    for (let k = 0; k < 10; k++) if (out[k] == null) out[k] = out[k - 1] ?? out.find((v) => v != null) ?? 0.05;
    return out;
  };
  const arm = SD.map((o) => ({
    ua: radial(new Set([o.arm]), o.arm, o.el),
    fa: radial(new Set([o.el]), o.el, o.wr),
    thighUp: radial(new Set([o.th]), o.th, o.kn, (off) => off[2]),               // front of the thigh (up when seated)
    thighOut: radial(new Set([o.th]), o.th, o.kn, (off) => off[0] * o.sgn),     // outer side
  }));
  // palm: how far the palm surface stands off the hand bone's axis (the side the fingers close to)
  const palm = SD.map((o) => {
    const Wr = jointBind(o.wr), f0 = V.norm(V.sub(jointBind(o.mid), Wr)), s0 = V.norm(V.sub(jointBind(o.idx), jointBind(o.pky)));
    const n0 = V.perp(V.mul(V.norm(V.cross(f0, s0)), o.sgn), f0);
    const hand = new Set([o.wr, ...o.fingers.flat()]);
    const hp = [], hb = [];
    for (let i = 0; i < n; i++) {
      if ((part && part[i] >= 10) || dom[i] !== o.wr) continue;
      const d = V.sub([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], Wr), t = V.dot(d, f0);
      if (t < 0.01 || t > 0.07) continue;
      const h = V.dot(d, n0);
      if (h > 0) hp.push(h); else hb.push(-h);
    }
    const p85 = (a, d) => { if (a.length < 8) return d; a.sort((x, y) => x - y); return a[Math.floor(a.length * 0.85)]; };
    return { palm: Math.min(0.035, p85(hp, 0.015)), back: Math.min(0.035, p85(hb, 0.015)) };
  });
  // chin: the lowest point of the face (head-dominated vertices in front of the head joint), in the head bone's frame
  const Hj = jointBind(J.head);
  let chin = null;
  for (let i = 0; i < n; i++) {
    if ((part && part[i] >= 10) || dom[i] !== J.head) continue;
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    if (p[2] < Hj[2] + 0.05 || Math.abs(p[0] - Hj[0]) > 0.03) continue;
    if (!chin || p[1] < chin[1]) chin = p;
  }
  const ibmH = B.ibm.slice(J.head * 16, J.head * 16 + 16);
  const chinLocal = chin ? M4.pt(ibmH, chin[0], chin[1], chin[2]) : null;
  // arm vertex samples (one per 2.5 cm voxel) in their bone's bind frame: the upper arm's beyond 10 cm from the shoulder
  // joint (the shoulder and armpit meet the torso by construction), the forearm's all
  const armS = SD.map((o) => {
    const pick = (bone, skipNear) => {
      const ibm = B.ibm.slice(bone * 16, bone * 16 + 16), J0 = jointBind(bone), vx = new Map(), out = [];
      for (let i = 0; i < n; i++) {
        if ((part && part[i] >= 10) || (cls && cls[i] === 3) || dom[i] !== bone || domW[i] < 0.5) continue;
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (skipNear && Math.hypot(x - J0[0], y - J0[1], z - J0[2]) < 0.1) continue;
        const key = `${Math.floor(x / 0.025)},${Math.floor(y / 0.025)},${Math.floor(z / 0.025)}`;
        if (vx.has(key)) continue;
        vx.set(key, 1);
        out.push(...M4.pt(ibm, x, y, z));
      }
      return new Float32Array(out);
    };
    return { ua: pick(o.arm, true), fa: pick(o.el, false) };
  });
  return { tp: new Float32Array(tp), tn: new Float32Array(tn), tj: new Int16Array(tj), tw: new Float32Array(tw), nt: tp.length / 3, arm, armS, palm, chinLocal };
}

// ---------------------------------------------------------------- torso field (per pose)
// The walker's torso samples skinned into the pose, with their normals. pen(p, r): how far a sphere of radius r at p is
// inside the torso, from the nearest sample's signed distance along its normal (a 5 cm hash grid, searched 15 cm round p).
// at(y): the torso's mid-coronal depth and its flanks at a height (2 cm slabs), for the elbow's natural place.
function torsoField(O, Sm) {
  const n = O.nt, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const x = O.tp[i * 3], y = O.tp[i * 3 + 1], z = O.tp[i * 3 + 2], nx = O.tn[i * 3], ny = O.tn[i * 3 + 1], nz = O.tn[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = O.tw[i * 4 + k]; if (!w) continue;
      const M = Sm[O.tj[i * 4 + k]];
      ox += w * (M[0] * x + M[4] * y + M[8] * z + M[12]); oy += w * (M[1] * x + M[5] * y + M[9] * z + M[13]); oz += w * (M[2] * x + M[6] * y + M[10] * z + M[14]);
      qx += w * (M[0] * nx + M[4] * ny + M[8] * nz); qy += w * (M[1] * nx + M[5] * ny + M[9] * nz); qz += w * (M[2] * nx + M[6] * ny + M[10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    P[i * 3] = ox; P[i * 3 + 1] = oy; P[i * 3 + 2] = oz; N[i * 3] = qx / l; N[i * 3 + 1] = qy / l; N[i * 3 + 2] = qz / l;
    if (oy < y0) y0 = oy; if (oy > y1) y1 = oy;
  }
  // 2 cm slabs, each a 24-bin radial hull round its centroid (a slab also takes its two neighbours' points, so the 2 cm
  // sample grid leaves no gaps; empty bins take the larger neighbour). O(1) per query; with the groin / buttock
  // transition left out of the samples the lap is not part of any slab.
  const H = 0.02, NS = Math.max(1, Math.ceil((y1 - y0) / H) + 1), NBIN = 24;
  const sOf = (y) => Math.min(NS - 1, Math.max(0, Math.floor((y - y0) / H)));
  const cx = new Float32Array(NS), cz = new Float32Array(NS), cn = new Float32Array(NS), rr = new Float32Array(NS * NBIN);
  for (let i = 0; i < n; i++) { const s0 = sOf(P[i * 3 + 1]); cx[s0] += P[i * 3]; cz[s0] += P[i * 3 + 2]; cn[s0]++; }
  for (let s0 = 0; s0 < NS; s0++) { if (cn[s0]) { cx[s0] /= cn[s0]; cz[s0] /= cn[s0]; } else if (s0) { cx[s0] = cx[s0 - 1]; cz[s0] = cz[s0 - 1]; } }
  for (let i = 0; i < n; i++) {
    const s1 = sOf(P[i * 3 + 1]);
    for (let s0 = Math.max(0, s1 - 1); s0 <= Math.min(NS - 1, s1 + 1); s0++) {
      const dx = P[i * 3] - cx[s0], dz = P[i * 3 + 2] - cz[s0], d = Math.hypot(dx, dz);
      const bin = ((Math.round((Math.atan2(dz, dx) / (2 * Math.PI)) * NBIN) % NBIN) + NBIN) % NBIN;
      if (d > rr[s0 * NBIN + bin]) rr[s0 * NBIN + bin] = d;
    }
  }
  for (let s0 = 0; s0 < NS; s0++) for (let pass = 0; pass < 2; pass++) for (let b = 0; b < NBIN; b++) {
    const k = s0 * NBIN + b; if (rr[k] > 0) continue;
    rr[k] = Math.max(rr[s0 * NBIN + ((b + 1) % NBIN)], rr[s0 * NBIN + ((b + NBIN - 1) % NBIN)]);
  }
  const pen = (p, r) => {
    const fy = (p[1] - y0) / H;
    if (fy < -0.5 || fy > NS - 0.5) return -1;
    const s0 = Math.min(NS - 1, Math.max(0, Math.floor(fy)));
    if (!cn[s0] && !(s0 && cn[s0 - 1]) && !(s0 < NS - 1 && cn[s0 + 1])) return -1;
    const dx = p[0] - cx[s0], dz = p[2] - cz[s0], d = Math.hypot(dx, dz);
    const a = ((Math.atan2(dz, dx) / (2 * Math.PI)) * NBIN + NBIN) % NBIN, b0 = Math.floor(a) % NBIN, b1 = (b0 + 1) % NBIN, t = a - Math.floor(a);
    return rr[s0 * NBIN + b0] * (1 - t) + rr[s0 * NBIN + b1] * t + r - d;
  };
  const zMin = new Float32Array(NS).fill(1e9), zMax = new Float32Array(NS).fill(-1e9), xMin = new Float32Array(NS).fill(1e9), xMax = new Float32Array(NS).fill(-1e9);
  for (let i = 0; i < n; i++) {
    const s0 = sOf(P[i * 3 + 1]);
    if (P[i * 3 + 2] < zMin[s0]) zMin[s0] = P[i * 3 + 2]; if (P[i * 3 + 2] > zMax[s0]) zMax[s0] = P[i * 3 + 2];
    if (P[i * 3] < xMin[s0]) xMin[s0] = P[i * 3]; if (P[i * 3] > xMax[s0]) xMax[s0] = P[i * 3];
  }
  const at = (y) => {
    let s0 = sOf(y);
    for (let k = 0; k < NS && zMax[s0] < -1e8; k++) s0 = Math.max(0, s0 - 1);
    return { zMid: (zMin[s0] + zMax[s0]) / 2, zFront: zMax[s0], flank: [xMax[s0], xMin[s0]] };
  };
  // depth(p): the nearest torso sample's signed distance along its normal (> 0 = p that far inside) when a sample lies
  // within 6 cm, else -1 (the QA's criterion: tools/assets/crowd_sitqa.mjs insideOf)
  const GC = 0.03, grid = new Map(), gk = (a, b, c) => (a + 512) * 1048576 + (b + 512) * 1024 + (c + 512);
  for (let i = 0; i < n; i++) { const k = gk(Math.floor(P[i * 3] / GC), Math.floor(P[i * 3 + 1] / GC), Math.floor(P[i * 3 + 2] / GC)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
  const depth = (p) => {
    const ix = Math.floor(p[0] / GC), iy = Math.floor(p[1] / GC), iz = Math.floor(p[2] / GC);
    let best = 0.0036, bi = -1;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const a = grid.get(gk(ix + dx, iy + dy, iz + dz)); if (!a) continue;
      for (const i of a) { const ex = p[0] - P[i * 3], ey = p[1] - P[i * 3 + 1], ez = p[2] - P[i * 3 + 2], d2 = ex * ex + ey * ey + ez * ez; if (d2 < best) { best = d2; bi = i; } }
    }
    if (bi < 0) return -1;
    const d = -((p[0] - P[bi * 3]) * N[bi * 3] + (p[1] - P[bi * 3 + 1]) * N[bi * 3 + 1] + (p[2] - P[bi * 3 + 2]) * N[bi * 3 + 2]);
    return d > 0 && Math.sqrt(best) > 1.15 * d + 0.015 ? -1 : d;
  };
  return { pen, at, depth, y0, y1 };
}
// skinning matrices (G * IBM) of a pose
function skinMats(S, B, G, P) { const out = new Array(S.nb); for (let b = 0; b < S.nb; b++) out[b] = M4.mul(M4.of(G[b], P[b]), B.ibm.slice(b * 16, b * 16 + 16)); return out; }

// ---------------------------------------------------------------- shared clips
// S: the crowd's skeleton record after loading (nb, bones, parents, hips, clips, clipData, bodies with refT / refR / hipsH /
// index / ibm). Returns { data, clips, ref } — the clip data with the seated rows appended and their clip entries — or null.
export function synthSitClips(S, outlines = null, armsBake = null, opts = {}) {
  const nb = S.nb, W = nb * 8, D0 = S.clipData, R = rig(S);
  const RB = S.bodies.filter((B) => B.height > 1.5 && !B.set).sort((a, b) => (a.name < b.name ? -1 : 1))[0] || S.bodies[0];
  const base = S.clips.find((c) => c.name === 's_neutral_idle') || S.clips.find((c) => c.kind === 'idle' && c.age === 'adult');
  if (!R || !RB || !base || !D0) return null;
  const { J, SD } = R;
  const MOD = new Set([J.hips, J.sp, J.sp1, J.neck, J.head, ...SD.flatMap((o) => [o.clav, o.arm, o.el, o.wr, o.th, o.kn, o.an, ...o.fingers.flat()])]);
  const st0 = frameOf(S, D0, base, 0, RB), std = fkOf(S, st0.lq, st0.lt);
  const ankStd = [std.P[SD[0].an], std.P[SD[1].an]];
  const ankZ = (ankStd[0][2] + ankStd[1][2]) / 2, hipX = (std.P[SD[0].th][0] + std.P[SD[1].th][0]) / 2;
  const hinge = hingeAxes(S, D0, RB, R);
  const clips = [], frames = [];
  for (const sp of sitSpecs(opts.sit32 !== false)) {
    const rows = [];
    // the reference arms are solved ONCE per pose (frame 0) and carried by every frame: a walker's own arms replace them
    // (the baked sit31_arms.json, per body), so they only show until those land. Solving them per frame had cost 13.6 s
    // of main thread at every page load (700 solves).
    let armQ = null, clavL = null;
    const ARMB = [...SD.flatMap((o) => [o.clav, o.arm, o.el, o.wr, ...o.fingers.flat()]), J.neck];
    for (let f = 0; f < FRAMES; f++) {
      const th = (2 * Math.PI * f) / FRAMES;
      const pose = torsoPose(S, R, st0, std, sp, th, ankStd, ankZ, hipX, RB);
      if (!clavL) clavL = mirroredClavicle(S, R, pose);
      pose.lq[SD[0].clav] = clavL.slice();
      if (!armQ) {
        const bake = armsBake && armsBake.bodies && armsBake.bodies[RB.name] && armsBake.bodies[RB.name].poses[sp.id];
        const r = armsFor(S, R, RB, outlines && outlines[RB.name], pose, sp, 1, hinge, null, !bake);
        armQ = new Map(ARMB.map((b) => [b, r.lq[b]]));
        // fingers are the clip's (the bake overrides clavicles, arms, forearms, hands, upper spine, neck, head)
      }
      for (const [b, q] of armQ) if (b !== J.neck || sp.headSolve) pose.lq[b] = q.slice();
      if (sp.type) typeFingers(S, R, pose, f);
      rows.push({ lq: pose.lq, hipT: pose.lt[J.hips].slice() });
    }
    // SIT32 gaze: the face's pitch in this loop (+ up), the mean over the frames with no beat on, from the reference body's
    // head against its standing idle's. crowd.js aims a gaze relative to it: a reader (38 deg down) told to look at the
    // table keeps its eyes on the book instead of tipping its head a further 34 deg
    let look0 = 0, nl = 0;
    for (let f = 0; f < FRAMES; f += 5) {
      if (sp.sched && sitKeyW(sp, f / FPS) > 0) continue;
      const d = Q.rot(Q.mul(fkOf(S, rows[f].lq, st0.lt).G[J.head], Q.inv(std.G[J.head])), [0, 0, 1]);
      look0 += Math.atan2(d[1], Math.hypot(d[0], d[2])); nl++;
    }
    look0 = nl ? +(look0 / nl).toFixed(4) : 0;
    const kBody = new Float32Array(S.bodies.length), seat = new Array(S.bodies.length), feet = new Array(S.bodies.length), knee = sp.cross ? new Array(S.bodies.length) : null;
    const toes = [S.bones.indexOf('crl_toeEnd__L'), S.bones.indexOf('crl_toeEnd__R')];
    for (const B of S.bodies) {
      const s0 = frameOf(S, D0, base, 0, B), P0 = fkOf(S, s0.lq, s0.lt);
      // the soles on the floor: both ankles at their standing height on average; legs crossed, the left one alone (the
      // raised right ankle in the mean had set every crossed sitter 8-10 cm low, the left foot through the floor)
      const an = sp.cross ? [SD[0].an] : [SD[0].an, SD[1].an], ay = (Q0) => an.reduce((a, b) => a + Q0.P[b][1], 0) / an.length;
      const yStd = ay(P0);
      const lt = S.bones.map((_, b) => refT(B, b));
      const probe = (k) => { lt[S.hips] = V.mul(rows[0].hipT, k); return fkOf(S, rows[0].lq, lt); };
      const ya = probe(0), yb = probe(1);
      const y0 = ay(ya), y1 = ay(yb);
      const k = Math.abs(y1 - y0) > 1e-4 ? (yStd - y0) / (y1 - y0) : B.hipsH / RB.hipsH;
      const Pk = probe(k), hm = V.mul(V.add(Pk.P[SD[0].th], Pk.P[SD[1].th]), 0.5);
      kBody[B.index] = k;
      seat[B.index] = [hm[1] - SEAT_DROP, -hm[2]];
      // each toe tip [x, z] relative to the seat point (model metres, +x the walker's left, +z forward)
      feet[B.index] = toes.map((t) => (t >= 0 ? [Pk.P[t][0] - hm[0], Pk.P[t][2] - hm[2]] : [0, 0]));
      // the crossed knee's top (5 cm over its joint) over the floor, its distance in front of the seat point and to the side
      // (+ the walker's left)
      if (knee) { const K = Pk.P[SD[1].kn]; knee[B.index] = [K[1] + 0.05, K[2] - hm[2], K[0] - hm[0]]; }
    }
    frames.push(rows);
    clips.push({ name: sp.name, skeleton: S.name, kind: 'sit', sitPose: sp.id, spec: sp, age: 'adult', hipsH: RB.hipsH, frames: FRAMES, fps: FPS, loop: true, speed: 0, synth: true, kBody, seat, feet, knee, look0 });
  }
  const R0 = D0.length / W, data = new Float32Array(D0.length + clips.length * FRAMES * W);
  data.set(D0);
  clips.forEach((c, ci) => {
    c.row = R0 + ci * FRAMES;
    for (let f = 0; f < FRAMES; f++) {
      const fr = frames[ci][f], r = c.row + f;
      for (let b = 0; b < nb; b++) {
        const o = r * W + b * 8, ob = base.row * W + b * 8, q = fr.lq[b], t = b === S.hips ? fr.hipT : [0, 0, 0];
        data[o] = q[0]; data[o + 1] = q[1]; data[o + 2] = q[2]; data[o + 3] = q[3];
        data[o + 4] = t[0]; data[o + 5] = t[1]; data[o + 6] = t[2];
        data[o + 7] = D0[ob + 7] > 0.5 || MOD.has(b) ? 1 : 0;
      }
    }
  });
  S._sitHinge = hinge;
  return { data, clips, ref: RB.name };
}

// the left clavicle turned (about the vertical and the forward axis, up to 17 / 11 deg) so the left shoulder joint lands
// on the mirror image of the right one; returns its local rotation. s_neutral_idle frame 0 holds the left shoulder 3 cm
// further back and 1.5-2 cm further in than the right (SK_AfroM_v2 seated: z -0.603 against -0.571, |x| 0.170 against
// 0.183), and the per-body solve of the thigh poses does not move clavicles: the left arm lay deeper against the chest,
// 25 of the 29 sit_a bodies over 1 cm on the left (crowd_sitqa, 66 adults).
function mirroredClavicle(S, R, pose) {
  const [oL, oR] = R.SD, P = fkOf(S, pose.lq, pose.lt);
  const tgt = [-P.P[oR.arm][0], P.P[oR.arm][1], P.P[oR.arm][2]], G0 = P.G[oL.clav], Pc = P.P[oL.clav], off = pose.lt[oL.arm];
  let best = null;
  for (let iy = -15; iy <= 15; iy++) for (let iz = -10; iz <= 10; iz++) {
    const q = Q.norm(Q.mul(Q.mul(Q.axis([0, 1, 0], iy * 0.02), Q.axis([0, 0, 1], iz * 0.02)), G0));
    const d = V.len(V.sub(V.add(Pc, Q.rot(q, off)), tgt));
    if (!best || d < best.d) best = { d, q };
  }
  return Q.norm(Q.mul(Q.inv(P.G[S.parents[oL.clav]]), best.q));
}

// SIT32 typing: every finger of both hands flexes on its own rhythm (11 / 13 / 9 / 7 taps a loop), about the hand's own
// curl axis, on top of the pose's fingers
function typeFingers(S, R, pose, f) {
  let P = fkOf(S, pose.lq, pose.lt);
  R.SD.forEach((o, side) => {
    const f0 = V.norm(V.sub(P.P[o.mid], P.P[o.wr]));
    const n0 = V.perp(V.mul(V.norm(V.cross(f0, V.norm(V.sub(P.P[o.idx], P.P[o.pky])))), o.sgn), f0);
    const axis = V.norm(V.cross(f0, n0));
    o.fingers.forEach((fing, fi) => {
      const d = 0.28 * Math.max(0, Math.sin(2 * Math.PI * ((f / FRAMES) * [11, 13, 9, 7][fi] + fi * 0.37 + side * 0.21))) ** 2;
      for (let k = 0; k < 3; k++) {
        const b = fing[k];
        pose.lq[b] = Q.norm(Q.mul(Q.inv(P.G[S.parents[b]]), Q.norm(Q.mul(Q.axis(axis, d * (k === 0 ? 1 : 0.6)), P.G[b]))));
        P = fkOf(S, pose.lq, pose.lt);
      }
    });
  });
}

// the elbow's hinge axis in the upper-arm and forearm frames, from the walk's frames with the most bend (the relaxed
// idle arm is nearly straight, so its cross product is noise)
function hingeAxes(S, D, B, R) {
  const walk = S.clips.find((c) => c.name === 's_neutral_walk') || S.clips.find((c) => c.kind === 'walk' && c.age === 'adult');
  return R.SD.map((o) => {
    const acc = [[0, 0, 0], [0, 0, 0]];
    for (let f = 0; f < (walk ? walk.frames : 0); f++) {
      const fr = frameOf(S, D, walk, f, B), P = fkOf(S, fr.lq, fr.lt);
      const u = V.norm(V.sub(P.P[o.el], P.P[o.arm])), w = V.norm(V.sub(P.P[o.wr], P.P[o.el]));
      const c = V.cross(u, w), s = V.len(c);
      if (s < 0.2) continue;   // under ~12 deg of bend
      const h = V.mul(c, 1 / s);
      const ha = Q.rot(Q.inv(P.G[o.arm]), h), hf = Q.rot(Q.inv(P.G[o.el]), h);
      acc[0] = V.add(acc[0], V.mul(ha, s)); acc[1] = V.add(acc[1], V.mul(hf, s));
    }
    return { arm: V.norm(acc[0]), fore: V.norm(acc[1]), upper: V.norm(refT(B, o.el)), lower: V.norm(refT(B, o.wr)) };
  });
}

// the seated torso and legs of a spec at loop phase th, on body B (the clip's reference or a walker's own body)
function torsoPose(S, R, st0, std, sp, th, ankStd, ankZ, hipX, B) {
  const { J, SD } = R;
  const lq = st0.lq.map((q) => q.slice()), lt = st0.lt.map((t) => t.slice());
  let P = fkOf(S, lq, lt);
  const setG = (b, Gn) => { lq[b] = Q.norm(Q.mul(Q.inv(P.G[S.parents[b]]), Gn)); P = fkOf(S, lq, lt); };
  const rx = (a) => Q.axis([1, 0, 0], a);
  // SIT32 legYaw (legs crossed): the pelvis and both legs turned toward the walker's left about the hips' middle, the lower
  // and upper spine turning the chest back to the table half each. Facing the table square on, the crossed knee came 1-10 cm
  // past the park tables' apron line (city/bryantParkKit.js tableGeo31: its bottom 0.645-0.655 m over the floor, 0.31-0.33 m
  // in front of the seat point) with the thigh's top 2-9 cm into it; turned 30 deg it cleared the round table but not the
  // square one on 39 of the 66 adults, turned 40 deg both (crowd_sitqa.mjs 'crossed knee'), and the crossed leg shows
  // beside the top instead of under it
  const ly = sp.legYaw || 0, Ry = Q.axis([0, 1, 0], ly), Ru = Q.axis([0, 1, 0], -0.5 * ly);
  const Gp = Q.norm(Q.mul(Ry, Q.mul(rx(sp.pelvis), P.G[J.hips])));
  setG(J.hips, Gp);
  const mid = V.mul(V.add(refT(B, SD[0].th), refT(B, SD[1].th)), 0.5);
  const Pp = V.sub([hipX, HIP_Y, ankZ - sp.back], Q.rot(Gp, mid));
  lt[J.hips] = Q.rot(Q.inv(P.G[0]), V.sub(Pp, P.P[0]));
  P = fkOf(S, lq, lt);
  SD.forEach((o, s) => {
    const H = P.P[o.th];
    let A = V.add(ankStd[s], [o.sgn * sp.feet[s][0], 0, sp.feet[s][1]]);
    if (ly) { const d = Q.rot(Ry, [A[0] - hipX, 0, A[2] - (ankZ - sp.back)]); A = [hipX + d[0], A[1], ankZ - sp.back + d[2]]; }
    const K = ik2(H, V.len(refT(B, o.kn)), V.len(refT(B, o.an)), A, ly ? Q.rot(Ry, [0, 0.35, 1]) : [0, 0.35, 1]);
    setG(o.th, Q.norm(Q.mul(Q.from(V.norm(V.sub(P.P[o.kn], H)), V.norm(V.sub(K, H))), P.G[o.th])));
    setG(o.kn, Q.norm(Q.mul(Q.from(V.norm(V.sub(P.P[o.an], P.P[o.kn])), V.norm(V.sub(A, P.P[o.kn]))), P.G[o.kn])));
    setG(o.an, ly ? Q.norm(Q.mul(Ry, std.G[o.an])) : std.G[o.an]);
  });
  if (sp.cross) {
    // SIT32: the right knee over the left, resting on the left thigh just behind its knee, the shin hanging down and
    // forward outside the left shin, the foot relaxed, toes down. The thighs stacked 13.5 cm: at 11.5 the upper thigh sank
    // 6.3 cm into the lower one on the heavy builds (crowd_sitqa crossed-thigh check); a thin build's knee then rests a
    // little above its other thigh
    const oR = SD[1], oL = SD[0], H = P.P[oR.th], KL = P.P[oL.kn];
    const Kt = V.add(KL, Q.rot(Ry, [-0.03, 0.135, -0.06])), A = V.add(Kt, Q.rot(Ry, [0.06, -0.37, 0.12]));
    const K = ik2(H, V.len(refT(B, oR.kn)), V.len(refT(B, oR.an)), A, V.sub(Kt, V.mul(V.add(H, A), 0.5)));
    setG(oR.th, Q.norm(Q.mul(Q.from(V.norm(V.sub(P.P[oR.kn], H)), V.norm(V.sub(K, H))), P.G[oR.th])));
    setG(oR.kn, Q.norm(Q.mul(Q.from(V.norm(V.sub(P.P[oR.an], P.P[oR.kn])), V.norm(V.sub(A, P.P[oR.kn]))), P.G[oR.kn])));
    setG(oR.an, Q.norm(Q.mul(Ry, Q.mul(rx(0.45), std.G[oR.an]))));
  }
  // SIT32: the head's beat over the key envelope (a bite, a sip) and a reader's eyes following the lines
  const tSec = (th / (2 * Math.PI)) * SIT_LOOP, beat = sp.beat ? sitKeyW(sp, tSec) : 0;
  const bh = sp.beat ? (sp.beat.head || 0) * beat : 0, bn = sp.beat ? (sp.beat.neck || 0) * beat : 0;
  const scan = sp.scan ? sp.scan * Math.sin((2 * Math.PI * 4 * tSec) / SIT_LOOP) : 0;
  if (sp.spine || ly) setG(J.sp, Q.norm(Q.mul(Ru, Q.mul(rx(sp.spine || 0), P.G[J.sp]))));
  setG(J.sp1, Q.norm(Q.mul(Ru, Q.mul(rx(sp.chest + 0.012 * sp.breath * Math.sin(3 * th)), P.G[J.sp1]))));
  if (sp.neck || bn) setG(J.neck, Q.norm(Q.mul(rx((sp.neck || 0) + bn), P.G[J.neck])));
  setG(J.head, Q.norm(Q.mul(Q.mul(Q.axis([0, 1, 0], sp.look * Math.sin(th + sp.lookPh) + scan), rx(sp.head + bh + 0.03 * Math.min(1, sp.look * 10) * Math.sin(2 * th))), P.G[J.head])));
  return { lq, lt, P, setG: null };
}

// ---------------------------------------------------------------- the arm solve
// Places both arms of a seated pose for body B (outline O, or a nominal one from bone lengths when O is null) at world
// scale s. pose: { lq, lt, P } from torsoPose (a clip frame); table: { h, elbow } in world metres (defaults TABLE31).
// Returns { lq (the full local rotations), used: the override slots it set, info }.
function armsFor(S, R, B, O, pose, sp, s, hinge, table, full = true, key = 0) {
  const { J, SD } = R;
  const lq = pose.lq.map((q) => q.slice()), lt = pose.lt;
  let P = fkOf(S, lq, lt);
  const setG = (b, Gn) => { lq[b] = Q.norm(Q.mul(Q.inv(P.G[S.parents[b]]), Gn)); P = fkOf(S, lq, lt); };
  const T = { ...TABLE31, ...(table || {}) };
  const hm = V.mul(V.add(P.P[SD[0].th], P.P[SD[1].th]), 0.5);
  const seatP = [hm[0], hm[1] - SEAT_DROP, hm[2]];
  const yTop = seatP[1] + T.h / s, zElbow = seatP[2] + T.elbow / s;
  const hull = O && O.nt ? torsoField(O, skinMats(S, B, P.G, P.P)) : null;
  const penT = (p, r) => (hull ? hull.pen(p, r) : -1);
  const info = { pen: 0, reach: 0, iters: 0 };
  const rOf = (side, key, t, dflt) => { const a = O && O.arm[side][key]; return a ? a[Math.min(9, Math.max(0, Math.round(t * 9)))] : dflt; };
  const lens = SD.map((o) => ({ la: V.len(refT(B, o.el)), lb: V.len(refT(B, o.wr)) }));
  // capsule clearance of an arm from S over E to W against the torso, as the EXCESS over the same capsule sample of the
  // body's own standing arm (s_neutral_idle frame 0, arms hanging): where a heavy build's arm lies against its flank
  // standing, it may lie there seated too; what must not happen is the arm sinking deeper than that. From 30 % down the upper
  // arm: a forward, outward swing presses the back of the armpit fold into the lats there (the heavy CARLA man: 5.5 cm).
  // Measured on the arm's OWN VERTICES (outline armS, carried rigidly on the candidate's hinge-aware bone frames) against
  // the torso's nearest-sample signed distance: the QA's criterion. Upper-arm vertices get their own standing overlap as
  // an allowance (the armpit; a heavy build's arm resting on its flank); forearms none (one hanging in a flared hem while
  // standing is no licence to sink into a lap).
  const base = O && O.armS ? standingBase(S, R, B, O, hinge) : null;
  const frames2 = (side, Sh, E, Wr) => {
    const hg = hinge[side], u = V.norm(V.sub(E, Sh)), w = V.norm(V.sub(Wr, E));
    let h = V.cross(u, w); h = V.len(h) > 1e-3 ? V.norm(h) : V.perp([1, 0, 0], u);
    return [Q.frame(hg.upper, V.perp(hg.arm, hg.upper), u, V.perp(h, u)), Q.frame(hg.lower, V.perp(hg.fore, hg.lower), w, V.perp(h, w))];
  };
  const armPen = (side, Sh, E, Wr) => {
    if (!hull || !O.armS) return -1;
    const [Gu, Gf] = frames2(side, Sh, E, Wr), A = O.armS[side], al = base ? base[side] : null;
    let m = -1;
    for (let k = 0, j = 0; k < A.ua.length; k += 3, j++) { const d = hull.depth(V.add(Sh, Q.rot(Gu, [A.ua[k], A.ua[k + 1], A.ua[k + 2]]))) - (al ? al[j] : 0); if (d > m) m = d; }
    for (let k = 0; k < A.fa.length; k += 3) { const d = hull.depth(V.add(E, Q.rot(Gf, [A.fa[k], A.fa[k + 1], A.fa[k + 2]]))); if (d > m) m = d; }
    return m;
  };
  // hinge-aware arm chain: the upper arm points at E with its elbow axis on the bend plane of (E - S, W - E); the forearm
  // likewise; then the hand frame (fingers f1, palm normal n1), half its twist moved into the forearm
  const chain = (side, E, Wr, f1, n1) => {
    const o = SD[side], hg = hinge[side];
    const Sh = P.P[o.arm];
    const u = V.norm(V.sub(E, Sh)), w = V.norm(V.sub(Wr, E));
    let h = V.cross(u, w);
    h = V.len(h) > 1e-3 ? V.norm(h) : Q.rot(P.G[o.arm], hg.arm);
    // keep the hinge's sense: flexion brings the forearm toward the front of the upper arm
    if (V.dot(h, Q.rot(P.G[o.arm], hg.arm)) < 0 && V.len(V.cross(u, w)) < 0.05) h = V.mul(h, -1);
    setG(o.arm, Q.frame(hg.upper, V.perp(hg.arm, hg.upper), u, V.perp(h, u)));
    setG(o.el, Q.frame(hg.lower, V.perp(hg.fore, hg.lower), w, V.perp(h, w)));
    const f0 = V.norm(V.sub(P.P[o.mid], P.P[o.wr]));
    const n0 = V.perp(V.mul(V.norm(V.cross(f0, V.norm(V.sub(P.P[o.idx], P.P[o.pky])))), o.sgn), f0);
    const nn = V.perp(n1, f1);
    setG(o.wr, Q.norm(Q.mul(Q.frame(f0, n0, f1, nn), P.G[o.wr])));
    const ax = V.norm(refT(B, o.wr)), hq = lq[o.wr];
    const half = Q.axis(ax, Math.atan2(V.dot([hq[0], hq[1], hq[2]], ax), hq[3]));
    lq[o.el] = Q.norm(Q.mul(lq[o.el], half));
    lq[o.wr] = Q.norm(Q.mul(Q.inv(half), hq));
    P = fkOf(S, lq, lt);
  };
  // the elbow on the IK circle round S -> W with the best clearance and a natural place: beside the torso at waist height,
  // at or in front of the mid-coronal plane, no further out than it has to be
  const swivel = (side, Wr) => {
    const o = SD[side], { la, lb } = lens[side], Sh = P.P[o.arm];
    const d = V.sub(Wr, Sh), L = Math.min(la + lb - 2e-3, Math.max(Math.abs(la - lb) + 2e-3, V.len(d))), u = V.norm(d);
    const W2 = V.add(Sh, V.mul(u, L));
    const ca = (la * la + L * L - lb * lb) / (2 * la * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    const C = V.add(Sh, V.mul(u, la * ca)), rho = la * sa;
    const e1 = V.perp([0, -1, 0], u), e2 = V.cross(u, e1);
    let best = null;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * 2 * Math.PI, E = V.add(C, V.add(V.mul(e1, rho * Math.cos(a)), V.mul(e2, rho * Math.sin(a))));
      const pen = armPen(side, Sh, E, W2);
      const g = hull ? hull.at(E[1]) : { zMid: Sh[2], flank: [Sh[0], Sh[0]] };
      const out = o.sgn * (E[0] - g.flank[side]) - rOf(side, 'ua', 1, 0.045);
      const uu = V.norm(V.sub(E, Sh));
      let cost = 400 * Math.max(0, pen + 0.015) + 30 * Math.max(0, g.zMid - 0.005 - E[2]) + 6 * Math.max(0, out - 0.03)
        + 2 * (1 + uu[1]) + 2 * Math.max(0, -o.sgn * (E[0] - Sh[0]));
      if (!best || cost < best.cost) best = { cost, E, pen, W: W2 };
    }
    return best;
  };
  // the clavicle rotation (protraction about the vertical, elevation about the forward axis) that brings the shoulder
  // la from a fixed elbow; returns the residual
  const clavCands = (side) => {
    const o = SD[side], G0 = P.G[o.clav], Pc = P.P[o.clav], off = refT(B, o.arm), out = [];
    for (let ip = -2; ip <= 9; ip++) for (let ie = -4; ie <= 2; ie++) {
      const pr = ip * 0.05, el = ie * 0.05;   // protraction to 26 deg; elevation -11..+6 deg (more lifts the deltoid into the trapezius)
      const q = Q.norm(Q.mul(Q.mul(Q.axis([0, 1, 0], -o.sgn * pr), Q.axis([0, 0, 1], o.sgn * el)), G0));
      out.push({ q, S: V.add(Pc, Q.rot(q, off)), c: 0.02 * (Math.abs(pr) + Math.abs(el)) });
    }
    return out;
  };
  const reachClav = (side, E, cands = clavCands(side)) => {
    const { la } = lens[side];
    let best = null;
    for (const k of cands) { const res = Math.abs(V.len(V.sub(E, k.S)) - la), cost = res + k.c; if (!best || cost < best.cost) best = { cost, res, q: k.q }; }
    setG(SD[side].clav, best.q);
    return best.res;
  };
  // ---- per pose
  const thighTop = (side, t) => {
    const o = SD[side], H = P.P[o.th], K = P.P[o.kn];
    const up = V.perp([0, 1, 0], V.norm(V.sub(K, H)));   // a seated thigh is pitched, not twisted: its front faces up
    const r = O ? O.arm[side].thighUp[Math.min(9, Math.round(t * 9))] : 0.075;
    return V.add(V.lerp(H, K, t), V.mul(up, r));
  };
  const palmOf = (side) => (O ? O.palm[side].palm : 0.018);
  // hands resting on the thighs, ELBOW FIRST: the upper arm hangs nearly vertical, a little forward and out, just clear of
  // the flank; the hand lands on the thigh's top where the forearm's length from that elbow meets it. A grid of upper-arm
  // directions (forward 0-40 deg, out 3-33 deg) is scored on clearance (upper arm and forearm against the torso), then the
  // most relaxed: least forward and outward swing, the hand near its usual place on the thigh.
  const onThigh = (side, t0, inward) => {
    const o = SD[side], { la, lb } = lens[side], Sh = P.P[o.arm];
    const H = P.P[o.th], K = P.P[o.kn], dir = V.norm(V.sub(K, H));
    const top = (t, inw) => V.add(thighTop(side, t), [-o.sgn * inw, palmOf(side) + 0.006, 0]);
    let best = null;
    for (let fl = 0; fl <= 48; fl += 4) for (let ab = 3; ab <= 54; ab += 3) {
      const a = (fl * Math.PI) / 180, b = (ab * Math.PI) / 180;
      const u = V.norm([o.sgn * Math.sin(b), -Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b)]);
      const E = V.add(Sh, V.mul(u, la));
      // the wrist on the thigh top at the forearm's length from the elbow
      let wb = null;
      for (let t = 0.12; t <= 0.9; t += 0.02) for (const inw of [inward, inward - 0.03, inward - 0.06, inward - 0.09, inward - 0.12]) {
        const Wt = top(t, inw), e = Math.abs(V.len(V.sub(Wt, E)) - lb);
        if (!wb || e + 0.2 * Math.abs(t - t0) < wb.c) wb = { c: e + 0.2 * Math.abs(t - t0), e, Wt, t };
      }
      if (!wb || wb.e > 0.02) continue;
      const pen = armPen(side, Sh, E, wb.Wt);
      const g = hull ? hull.at(E[1]) : { zMid: Sh[2] };
      const cost = 400 * Math.max(0, pen + 0.015) + 30 * Math.max(0, g.zMid - 0.005 - E[2]) + 0.03 * fl + 0.02 * ab + 0.5 * Math.abs(wb.t - t0) + 3 * wb.e;
      if (!best || cost < best.cost) best = { cost, E, W: wb.Wt, pen };
    }
    if (!best) { const b = swivel(side, top(t0, inward)); best = { E: b.E, W: b.W, pen: b.pen }; }
    const f1 = V.norm(V.add(dir, [-o.sgn * 0.22, -0.12, 0]));
    chain(side, best.E, best.W, f1, [0, -1, 0]);
    info.pen = Math.max(info.pen, best.pen);
  };
  // a fixed wrist (chin, cup): the elbow on the table plane at the forearm's length from it, searched round that circle
  // for the best reach with the clavicle, clearance and nearness to its natural place E0
  const tableArmFixed = (side, yE, W0, E0, f1, n1) => {
    const o = SD[side], { la, lb } = lens[side];
    const rho = Math.sqrt(Math.max(1e-4, lb * lb - (W0[1] - yE) ** 2));
    const cands = clavCands(side);
    let best = null;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * 2 * Math.PI, E = [W0[0] + Math.cos(a) * rho, yE, W0[2] + Math.sin(a) * rho];
      let res = 1e9, Sb = null;
      for (const c of cands) { const r2 = Math.abs(V.len(V.sub(E, c.S)) - la) + c.c; if (r2 < res) { res = r2; Sb = c.S; } }
      const pen = armPen(side, Sb, E, W0);
      // reach weighs like clearance: at 5 x res an elbow the upper arm could not reach (a heavy build's cup pose: 45 cm off)
      // beat one it reached with 5 mm of overlap, and the forearms floated 7-13 cm over the table
      const cost = 200 * Math.max(0, res - 0.006) + 400 * Math.max(0, pen + 0.01) + 0.5 * V.len(V.sub(E, E0));
      if (!best || cost < best.cost) best = { cost, E };
    }
    reachClav(side, best.E, cands);
    const Sh = P.P[o.arm];
    info.reach = Math.max(info.reach, Math.abs(V.len(V.sub(best.E, Sh)) - la));
    chain(side, best.E, W0, f1, n1);
    info.pen = Math.max(info.pen, armPen(side, P.P[o.arm], best.E, W0));
  };
  // an elbow resting on a plane (the table top, or a thigh near the knee for the bench): a grid over its place on that
  // plane round E0 (out 0-16 cm, back 12 cm to forward 4 cm), each with the clavicle rotation that brings the shoulder the
  // upper arm's length from it; scored on clearance against the torso first, then the reach error, then nearness to E0.
  // The wrist follows at the forearm's length toward W0.
  const tableArm = (side, E0, W0, f1, n1, moveW = true, dz0 = -0.12) => {
    const o = SD[side], { la, lb } = lens[side];
    const cands = clavCands(side);
    let best = null;
    for (let ix = 0; ix <= 8; ix++) for (let iz = 0; iz <= 8; iz++) {
      const E = [E0[0] + o.sgn * 0.02 * ix, E0[1], E0[2] + dz0 + (0.16 / 8) * iz];
      const Wr = moveW ? V.add(E, V.mul(V.norm(V.sub(W0, E)), lb)) : W0;
      let res = 1e9, cb = null;
      for (const c of cands) { const r2 = Math.abs(V.len(V.sub(E, c.S)) - la) + c.c; if (r2 < res) { res = r2; cb = c; } }
      const pen = armPen(side, cb.S, E, Wr);
      const cost = 400 * Math.max(0, pen + 0.012) + 40 * Math.max(0, res - 0.004) + 2 * V.len(V.sub(E, E0));
      if (!best || cost < best.cost) best = { cost, E, Wr, pen, res };
    }
    reachClav(side, best.E, cands);
    // the elbow on the circle of the upper arm's length round the shoulder, staying on its plane
    const Sh = P.P[o.arm];
    let E = best.E;
    const dE = V.sub(E, Sh), hd = Math.hypot(dE[0], dE[2]), vy = E[1] - Sh[1];
    const need = Math.sqrt(Math.max(0, la * la - vy * vy));
    if (hd > 1e-4 && Math.abs(need - hd) < 0.06) E = [Sh[0] + (dE[0] / hd) * need, E[1], Sh[2] + (dE[2] / hd) * need];
    const Wr = moveW ? V.add(E, V.mul(V.norm(V.sub(W0, E)), lb)) : W0;
    info.reach = Math.max(info.reach, Math.abs(V.len(V.sub(E, Sh)) - la));
    chain(side, E, Wr, f1, n1);
    info.pen = Math.max(info.pen, armPen(side, P.P[o.arm], E, Wr));
  };
  const rFaE = (side) => rOf(side, 'fa', 0, 0.042), rFaW = (side) => rOf(side, 'fa', 1, 0.03);
  const used = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
  // the chin (the body's lowest face point in front of the head joint, from its outline; a nominal one without) and the
  // mouth 3 cm over it
  const chinOf = () => {
    const cl = O && O.chinLocal;
    if (!cl) return V.add(P.P[J.head], Q.rot(P.G[J.head], [0, -0.1, 0.08]));
    const Mh = M4.mul(M4.of(P.G[J.head], P.P[J.head]), B.ibm.slice(J.head * 16, J.head * 16 + 16));
    const Hb = M4.invRigid(B.ibm.slice(J.head * 16, J.head * 16 + 16));
    const pb = M4.pt(Hb, cl[0], cl[1], cl[2]);
    return M4.pt(Mh, pb[0], pb[1], pb[2]);
  };
  const mouthOf = () => V.add(chinOf(), Q.rot(P.G[J.head], [0, 0.03, 0.01]));
  const elbowAt = (side, dz = 0) => [SD[side].sgn * Math.max(Math.abs(P.P[SD[side].arm][0]) * 0.92, 0.12), yTop + rFaE(side), zElbow + dz / s];
  const flatL = (dz = 0.25, x = 0.02) => { const E0 = elbowAt(0), W0 = [x, yTop + rFaW(0) + 0.004, zElbow + dz / s]; tableArm(0, E0, W0, V.norm(V.add(V.norm(V.sub(W0, E0)), [-0.3, 0, 0])), [0, -1, 0]); };
  if (sp.arms === 'thigh') {
    SD.forEach((o, side) => onThigh(side, sp.hands[side][0], sp.hands[side][1]));
  } else if (sp.arms === 'table') {
    SD.forEach((o, side) => {
      const xe = o.sgn * Math.max(Math.abs(P.P[o.arm][0]) * 0.92, 0.12);
      const E0 = [xe, yTop + rFaE(side), zElbow];
      const W0 = [o.sgn * 0.07, yTop + rFaW(side) + 0.004, zElbow + 0.3];
      const fw = V.norm(V.sub(W0, E0));
      tableArm(side, E0, W0, V.norm(V.add(fw, [-o.sgn * 0.35, 0, 0])), [0, -1, 0]);
    });
  } else if (sp.arms === 'cup') {
    // the cup 17 cm past the edge: the forearms lie across the edge, the elbows just short of it (at 22 cm past the elbow
    // line, 0.565 m out, most builds could not reach it with a forearm on the top)
    const zc = seatP[2] + (T.edge + 0.17) / s;
    SD.forEach((o, side) => {
      if (key === 1) return;   // the sip, below
      const Wc = [o.sgn * 0.048, yTop + 0.045, zc - 0.03];
      // the elbow on the table plane lb from the wrist, back and out toward its natural place
      const yE = yTop + rFaE(side), { lb } = lens[side];
      const rho = Math.sqrt(Math.max(1e-4, lb * lb - (Wc[1] - yE) ** 2));
      const tgt = [o.sgn * Math.max(Math.abs(P.P[o.arm][0]) * 0.92, 0.12), yE, zElbow];
      const dh = V.norm([tgt[0] - Wc[0], 0, tgt[2] - Wc[2]]);
      const E0 = [Wc[0] + dh[0] * rho, yE, Wc[2] + dh[2] * rho];
      tableArmFixed(side, yE, Wc, E0, V.norm([-o.sgn * 0.35, 0.25, 1]), [-o.sgn, 0.15, 0]);
    });
    if (key === 1) {
      // SIT32, a sip: the right hand brings the cup to the lips (the wrist 9 cm below and 7 cm in front of the mouth, the
      // hand tipped 20 deg toward the face, the cup with it); the left hand on the top where the cup stood
      const o = SD[1], M = mouthOf(), Ws = V.add(M, [o.sgn * 0.01, -0.09, 0.07]);
      const b = swivel(1, Ws), tip = Q.axis([1, 0, 0], -0.35);
      chain(1, b.E, b.W, Q.rot(tip, V.norm([-o.sgn * 0.35, 0.25, 1])), Q.rot(tip, [-o.sgn, 0.15, 0]));
      info.pen = Math.max(info.pen, b.pen);
      flatL(0.2, 0.03);
    }
  } else if (sp.arms === 'chin') {
    // the right hand under the chin: a head a little lower when the forearm cannot reach up from the table
    const o = SD[1], { lb } = lens[1];
    const yE = yTop + rFaE(1);
    let Wc = null;
    for (let it = 0; it < 14; it++) {
      const c = chinOf();
      Wc = V.add(c, [0.005, -0.095, 0.03]);
      if (Wc[1] - yE < lb * 0.96) break;
      setG(J.neck, Q.norm(Q.mul(Q.axis([1, 0, 0], 0.035), P.G[J.neck])));
      info.iters++;
    }
    const rho = Math.sqrt(Math.max(1e-4, lb * lb - (Wc[1] - yE) ** 2));
    const dh = V.norm([-0.35 + 0.0, 0, -0.8]);
    const E0 = [Wc[0] + dh[0] * rho, yE, Wc[2] + dh[2] * rho];
    tableArmFixed(1, yE, Wc, E0, V.norm([0.1, 1, -0.25]), [0, 0.2, -1]);
    // the left forearm flat on the table, the hand toward the middle
    const oL = SD[0];
    const E0L = [oL.sgn * Math.max(Math.abs(P.P[oL.arm][0]) * 0.92, 0.12), yTop + rFaE(0), zElbow];
    const W0L = [-0.02, yTop + rFaW(0) + 0.004, zElbow + 0.25];
    tableArm(0, E0L, W0L, V.norm(V.add(V.norm(V.sub(W0L, E0L)), [-0.3, 0, 0])), [0, -1, 0]);
    used.add(9);
  } else if (sp.arms === 'phone') {
    // the phone in the right hand in front of the chest, the screen toward the eyes; the left hand beside it
    const eye = V.add(P.P[J.head], Q.rot(P.G[J.head], [0, 0.06, 0.09]));
    // the phone at lap-to-chest height in front of the body; a heavy build holds it further out and higher, clear of the
    // belly (the first place, fore and up, where both forearms clear)
    let pick = null;
    for (const [fw, up] of [[0, 0], [0.04, 0.02], [0.08, 0.04], [0.12, 0.06], [0.16, 0.08], [0.2, 0.1]]) {
      const WR = [seatP[0] - 0.035, seatP[1] + (0.3 + up) / s, seatP[2] + (0.28 + fw) / s];
      const WL = V.add(WR, [0.075, -0.012, -0.01]);
      const bR = swivel(1, WR), bL = swivel(0, WL);
      const worst = Math.max(bR.pen, bL.pen);
      if (!pick || worst < pick.worst) pick = { WR, WL, bR, bL, worst };
      if (worst < -0.012) break;
    }
    const nR = V.norm(V.sub(eye, pick.WR));
    chain(1, pick.bR.E, pick.bR.W, V.perp([0.25, 0.3, 1], nR), nR);
    chain(0, pick.bL.E, pick.bL.W, V.perp([-0.35, 0.2, 1], nR), nR);
    info.pen = Math.max(info.pen, pick.worst);
  } else if (sp.arms === 'talk') {
    // SIT32: forearms on the top, hands apart; key 1: the right elbow stays down and the hand comes up open, palm up and
    // turned in, 20 cm over the top: a gesture
    SD.forEach((o, side) => {
      if (key === 1 && side === 1) return;
      const E0 = elbowAt(side), W0 = [o.sgn * 0.12, yTop + rFaW(side) + 0.004, zElbow + 0.27 / s];
      tableArm(side, E0, W0, V.norm(V.add(V.norm(V.sub(W0, E0)), [-o.sgn * 0.25, 0, 0])), [0, -1, 0]);
    });
    if (key === 1) {
      const o = SD[1], E0 = elbowAt(1, -0.03), Wg = [o.sgn * 0.17, yTop + 0.2 / s, zElbow + 0.12 / s];
      tableArmFixed(1, E0[1], Wg, E0, V.norm([-o.sgn * 0.25, 0.55, 0.8]), V.norm([-o.sgn * 0.35, 0.93, 0.1]));
    }
  } else if (sp.arms === 'eat') {
    // SIT32: the left forearm on the top; the right hand holds a wrap upright 10 cm over the top (key 0) or at the mouth,
    // the wrist 11 cm below and in front of it (key 1: a bite)
    flatL(0.25, 0.02);
    const o = SD[1];
    if (key === 0) {
      const E0 = elbowAt(1, -0.02), Wr = [o.sgn * 0.09, yTop + 0.1 / s, zElbow + 0.15 / s];
      tableArmFixed(1, E0[1], Wr, E0, V.norm([-o.sgn * 0.35, 0.3, 0.85]), V.norm([-o.sgn, 0.1, -0.2]));
    } else {
      const M = mouthOf(), Wm = V.add(M, [o.sgn * 0.02, -0.075, 0.075]), b = swivel(1, Wm);
      chain(1, b.E, b.W, V.norm(V.sub(M, Wm)), V.norm([-o.sgn, 0.05, -0.35]));
      info.pen = Math.max(info.pen, b.pen);
    }
  } else if (sp.arms === 'read') {
    // SIT32: an open book 30 x 21 cm on the top, its near edge 9 cm past the elbow line, the hands on its outer edges;
    // key 1: the right hand lifted over the left page's corner, turning it
    const zB = zElbow + 0.09 / s;
    SD.forEach((o, side) => {
      if (key === 1 && side === 1) return;
      const E0 = elbowAt(side), Wb = [o.sgn * 0.14, yTop + 0.02 / s + rFaW(side) * 0.6, zB + 0.06 / s];
      tableArmFixed(side, E0[1], Wb, E0, V.norm([-o.sgn * 0.45, -0.05, 0.9]), [0, -1, 0]);
    });
    if (key === 1) {
      const E0 = elbowAt(1), Wp = [0.03, yTop + 0.07 / s, zB + 0.1 / s];
      tableArmFixed(1, E0[1], Wp, E0, V.norm([0.85, -0.1, 0.5]), [0, -1, 0]);
    }
  } else if (sp.arms === 'laptop') {
    // SIT32: a laptop on the top, its front edge 5 cm past the elbow line: the wrists 4 cm over the top just short of the
    // keys, palms down; key 1: both hands 1.5 cm toward the right
    const zK = zElbow + 0.09 / s, dx = key === 1 ? -0.015 / s : 0;
    SD.forEach((o, side) => {
      const E0 = elbowAt(side, -0.02), Wk = [o.sgn * 0.075 + dx, yTop + 0.042 / s, zK];
      tableArmFixed(side, E0[1], Wk, E0, V.norm([-o.sgn * 0.2, -0.3, 1]), V.norm([0, -1, 0.1]));
    });
  } else if (sp.arms === 'lean') {
    // SIT32: the right arm over the chair's back (city/bryantParkKit.js chairGeo31: its top 0.43 m over the seat and 0.21 m
    // behind the seat point), the left forearm on the top, its elbow a little short of the elbow line (the torso leans back)
    // (the backrest's top is only 12-15 cm under a seated shoulder and 6-10 cm behind it, so an arm aimed at its corner
    // hung straight down beside the seat: the upper arm goes BACK, out and a little down, crossing the top a third of the
    // way along, the elbow 25 cm behind the backrest, the forearm hanging down behind it, palm to the chair)
    const o = SD[1], Sh = P.P[o.arm], { la, lb } = lens[1];
    const E = V.add(Sh, V.mul(V.norm([o.sgn * 0.25, -0.35, -0.9]), la));
    const W = V.add(E, V.mul(V.norm([0, -1, 0.15]), lb));
    chain(1, E, W, V.norm([0, -1, 0.1]), V.norm([0, 0.1, 1]));
    // (leaning back, the shoulder is ~10 cm further from the top: the elbow comes back to the edge and the forearm lies
    // across it; aimed at the elbow line it floated 3-7 cm)
    const E0L = elbowAt(0, -0.12), W0L = [0.06, yTop + rFaW(0) + 0.004, zElbow + 0.12 / s];
    tableArm(0, E0L, W0L, V.norm(V.add(V.norm(V.sub(W0L, E0L)), [-0.3, 0, 0])), [0, -1, 0], true, -0.1);
  } else if (sp.arms === 'cross') {
    // SIT32: the left forearm on the top, the right hand on the crossed right thigh halfway to the knee
    flatL(0.24, 0);
    onThigh(1, 0.5, 0.02);
  } else if (sp.arms === 'knees') {
    // elbows on the thighs just short of the knees, hands clasped between the knees
    SD.forEach((o, side) => {
      const E0 = V.add(thighTop(side, 0.78), [o.sgn * 0.015, rFaE(side) * 0.6, 0]);
      const kn = V.lerp(P.P[SD[0].kn], P.P[SD[1].kn], 0.5);
      const W0 = V.add(kn, [o.sgn * 0.035, -0.02, 0.1]);
      tableArm(side, E0, W0, V.norm([-o.sgn * 0.8, -0.2, 0.6]), [-o.sgn, 0.1, 0.2]);
    });
  }
  // fingers: curl each finger joint toward the palm by the pose's amount (on top of the idle's relaxed hand)
  SD.forEach((o, side) => {
    const c = sp.curl ? sp.curl[side] - 0.1 : 0;
    if (Math.abs(c) < 0.02) return;
    const f0 = V.norm(V.sub(P.P[o.mid], P.P[o.wr]));
    const n0 = V.perp(V.mul(V.norm(V.cross(f0, V.norm(V.sub(P.P[o.idx], P.P[o.pky])))), o.sgn), f0);
    const axis = V.norm(V.cross(f0, n0));
    for (const fing of o.fingers) for (let k = 0; k < 3; k++) {
      const b = fing[k];
      setG(b, Q.norm(Q.mul(Q.axis(axis, c * (k === 0 ? 0.7 : 1)), P.G[b])));
    }
  });
  return { lq, used, info };
}

// each upper-arm sample's depth in the torso when the body stands (s_neutral_idle frame 0): its allowance in armPen
function standingBase(S, R, B, O, hinge) {
  if (O._base) return O._base;
  const idle = S.clips.find((c) => c.name === 's_neutral_idle') || S.clips.find((c) => c.kind === 'idle' && c.age === 'adult');
  const fr = frameOf(S, S.clipData, idle, 0, B), P = fkOf(S, fr.lq, fr.lt);
  const field = torsoField(O, skinMats(S, B, P.G, P.P));
  O._base = R.SD.map((o, side) => {
    const A = O.armS[side].ua, out = new Float32Array(A.length / 3);
    for (let k = 0, j = 0; k < A.length; k += 3, j++) out[j] = Math.max(0, field.depth(V.add(P.P[o.arm], Q.rot(P.G[o.arm], [A[k], A[k + 1], A[k + 2]]))));
    return out;
  });
  return O._base;
}

// ---------------------------------------------------------------- per walker
// The arms of one walker: body B (outline O), sit clip c (one of synthSitClips' clips), world scale s. Returns the local
// rotations of the override slots (Float32Array(ARM_SLOTS.length * 4); w = 2 marks a slot that keeps the clip's rotation)
// and a diagnostic { pen: worst torso clearance of the arm capsules (> 0 = inside), reach: upper-arm length error }.
export function solveSitArms(S, B, O, c, s = 1, table = null, key = 0) {
  const R = rig(S);
  if (!R || !c || !c.spec || !S._sitHinge) return null;
  const D = S.clipData, base = S.clips.find((x) => x.name === 's_neutral_idle') || S.clips.find((x) => x.kind === 'idle' && x.age === 'adult');
  // the walker's own torso: frame 0 of the shared clip on ITS body, soles on the floor (kBody)
  const fr = frameOf(S, D, c, 0, B, c.kBody[B.index]);
  // AT A TABLE, a walker leans in until its elbows reach the top: the shared lean (15 deg) left a long-torsoed build's elbows
  // short of the top 0.275 m over the seat, the upper arm pointing at a place it could not reach, the forearms floating
  // 2-10 cm over it (crowd_sitqa --poses 3: SK_AmerM_001_MH elbow joint 7.7 cm over the top against 4.1 for
  // RB_Female_Adult_01). Up to 10 deg more at the upper spine in 2 deg steps, the neck turned back as much so the head keeps
  // its angle; the first lean whose elbows reach within 1 cm is kept (the most reaching one otherwise).
  const { J } = R;
  let r = null, lean = 0;
  for (const ex of c.spec.table && !c.spec.noLeanIn ? [0, 0.035, 0.07, 0.105, 0.14, 0.175] : [0]) {
    const lq = fr.lq.map((q) => q.slice());
    if (ex) {
      let P = fkOf(S, lq, fr.lt);
      const rx = Q.axis([1, 0, 0], ex);
      lq[J.sp1] = Q.norm(Q.mul(Q.inv(P.G[S.parents[J.sp1]]), Q.mul(rx, P.G[J.sp1])));
      P = fkOf(S, lq, fr.lt);
      lq[J.neck] = Q.norm(Q.mul(Q.inv(P.G[S.parents[J.neck]]), Q.mul(Q.inv(rx), P.G[J.neck])));
    }
    const t = armsFor(S, R, B, O, { lq, lt: fr.lt }, c.spec, s, S._sitHinge, table, true, key);
    if (!r || t.info.reach < r.info.reach - 1e-4) { r = t; lean = ex; }
    if (t.info.reach <= 0.01) break;
  }
  r.info.lean = lean;
  const slots = ARM_SLOTS.map((n) => S.bones.indexOf(n));
  const out = new Float32Array(ARM_SLOTS.length * 4);
  slots.forEach((b, k) => {
    const use = r.used.has(k) || (c.spec.headSolve && (k === 9)) || (lean > 0 && (k === 8 || k === 9));
    const q = use ? r.lq[b] : [0, 0, 0, 2];
    out.set(q, k * 4);
  });
  // the fingers are part of the shared clip (solved on the reference hand); the finger rows are not overridden
  return { q: out, info: r.info };
}
export { V as SIT_V, Q as SIT_Q, M4 as SIT_M4, fkOf as sitFK, frameOf as sitFrame, rig as sitRig };

// SIT32 PROPS: what a seated walker in clip c holds or has before it, placed from its own arms (override rows q, frame 0,
// world scale s): a hand prop as a frame in the holding hand's bone frame (b: its bone name), a table item as a frame
// in the walker's model space on the top (b: null). m: column-major 4x4 with the walker's scale taken out (1 / s), so a
// cup is 11.5 cm tall on every walker. The cup stands upright between the palms and goes with the right hand (to the
// lips in the sip); the wrap sits in the right fist along the thumb side; the book lies under the hands' midpoint 4 cm
// past the wrists, the laptop's base 9 cm past them.
export function sitProps(S, B, c, q, s = 1) {
  const sp = c && c.spec;
  if (!sp || !sp.props) return [];
  const R = rig(S), { SD } = R;
  const fr = frameOf(S, S.clipData, c, 0, B, c.kBody[B.index]);
  if (q) ARM_SLOTS.forEach((n, k) => { const o = k * 4; if (q[o + 3] < 1.5) fr.lq[S.bones.indexOf(n)] = [q[o], q[o + 1], q[o + 2], q[o + 3]]; });
  const P = fkOf(S, fr.lq, fr.lt);
  const hm = V.mul(V.add(P.P[SD[0].th], P.P[SD[1].th]), 0.5), yTop = hm[1] - SEAT_DROP + TABLE31.h / s, k = 1 / s;
  const hand = (side) => {
    const o = SD[side], f0 = V.norm(V.sub(P.P[o.mid], P.P[o.wr]));
    const n0 = V.perp(V.mul(V.norm(V.cross(f0, V.norm(V.sub(P.P[o.idx], P.P[o.pky])))), o.sgn), f0);
    return { o, f0, n0, c: V.add(P.P[o.wr], V.add(V.mul(f0, 0.05), V.mul(n0, 0.03))) };
  };
  const frame = (x, y, z, t) => [x[0] * k, x[1] * k, x[2] * k, 0, y[0] * k, y[1] * k, y[2] * k, 0, z[0] * k, z[1] * k, z[2] * k, 0, t[0], t[1], t[2], 1];
  const inHand = (side, M) => M4.mul(M4.invRigid(M4.of(P.G[SD[side].wr], P.P[SD[side].wr])), M);
  const out = [];
  for (const kind of sp.props) {
    if (kind === 'cup') {
      const C = V.mul(V.add(hand(0).c, hand(1).c), 0.5);
      out.push({ k: kind, b: S.bones[SD[1].wr], m: inHand(1, frame([1, 0, 0], [0, 1, 0], [0, 0, 1], C)) });
    } else if (kind === 'wrap') {
      const h = hand(1), up = V.norm(V.sub(P.P[h.o.idx], P.P[h.o.pky])), z = V.perp(h.f0, up), x = V.cross(up, z);
      out.push({ k: kind, b: S.bones[SD[1].wr], m: inHand(1, frame(x, up, z, h.c)) });
    } else if (kind === 'book' || kind === 'laptop') {
      const a = P.P[SD[0].wr], b = P.P[SD[1].wr];
      out.push({ k: kind, b: null, m: frame([1, 0, 0], [0, 1, 0], [0, 0, 1], [(a[0] + b[0]) / 2, yTop, Math.max(a[2], b[2]) + (kind === 'book' ? 0.04 : 0.09) / s]) });
    }
  }
  return out;
}
// debugging aid for tools/assets/crowd_sitqa.mjs: the solver's torso model (pen at p for a sphere of radius r) in frame 0 of
// clip c on body B
export function sitTorsoProbe(S, B, O, c) {
  const fr = frameOf(S, S.clipData, c, 0, B, c.kBody[B.index]), P = fkOf(S, fr.lq, fr.lt);
  return torsoField(O, skinMats(S, B, P.G, P.P));
}
