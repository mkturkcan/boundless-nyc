// 100STYLE (Mason, Starke, Komura 2022; Zenodo 8127870; CC-BY 4.0) BVH -> CARLA GEN2 skeleton clips, written as
// ueextract-style .anim.json (tracks by bone name, local rotations/translations in glTF space) so build_clips.mjs takes
// them like any CARLA clip.
//   node tools/assets/retarget_bvh.mjs <bvh> <outName> <walk|idle> [--speed 1.3] [--seconds 8] [--start f]
//
// Method: per mapped bone, rotations transfer as deltas from each side's NEUTRAL STANDING pose (mean global orientation
// over 100STYLE's Neutral idle and over CARLA's AS_GEN2_idle): G_tgt = G_src * inv(G_srcNeutral) * G_tgtNeutral, which
// absorbs the two rigs' different bone-roll conventions (a T-pose delta pitched heads 30 deg down and twisted hands).
// Target locals = parent^-1 * global. --headup pitches neck/head up for walks (lab performers watch the floor).
// Hips translation is scaled by the hips-height ratio. WALKS: one gait cycle (left toe-off to the next) from a straight
// stretch of the take, at the cycle speed nearest --speed, made in-place (heading and forward travel removed), with
// its end-to-start difference distributed over the cycle so it loops seamlessly; speed = distance / time.
// IDLES: --seconds from the middle of the take (or --start), heading removed, loop-corrected the same way.
// Fingers/eyes (not in the BVH) take a relaxed hand from CARLA's own walk clip.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [bvhFile, outName, kind] = args;
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const OUTDIR = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_anim';
const HEADUP = opt('headup', 0);
const WRIST_RELAX = opt('wristrelax', 0.75);   // share of CARLA's relaxed wrist in the retargeted hands (0 = raw mocap)
const MAN = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../boundlessjs/public/models/peds24/manifest.json');

// ---------------- quaternion math ([x, y, z, w]) ----------------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
const qnorm = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
const qaxis = (ax, deg) => { const h = (deg * Math.PI) / 360, s = Math.sin(h); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(h)]; };
const qslerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((v) => -v); d = -d; }
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
};
const qbetween = (u, v) => {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.999999) { let ax = [1, 0, 0]; if (Math.abs(u[0]) > 0.9) ax = [0, 1, 0]; const c = [u[1] * ax[2] - u[2] * ax[1], u[2] * ax[0] - u[0] * ax[2], u[0] * ax[1] - u[1] * ax[0]]; return qnorm([...c, 0]); }
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
};
const norm3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// ---------------- BVH ----------------
function parseBVH(txt) {
  const tok = txt.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  const stack = [];
  while (tok[i] !== 'MOTION') {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: tok[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: null, channels: [] };
      joints.push(j); stack.push(joints.length - 1);
    } else if (t === 'End') { i++; stack.push(-2); }
    else if (t === 'OFFSET') { const o = [+tok[i], +tok[i + 1], +tok[i + 2]]; i += 3; const top = stack[stack.length - 1]; if (top >= 0) joints[top].offset = o; }
    else if (t === 'CHANNELS') { const n = +tok[i++]; const ch = tok.slice(i, i + n); i += n; joints[stack[stack.length - 1]].channels = ch; }
    else if (t === '}') stack.pop();
  }
  i++; // MOTION
  i++; const frames = +tok[i++]; // Frames: N
  i += 2; const dt = +tok[i++];   // Frame Time: x
  const nch = joints.reduce((s, j) => s + j.channels.length, 0);
  const data = new Float32Array(frames * nch);
  for (let k = 0; k < frames * nch; k++) data[k] = +tok[i++];
  return { joints, frames, dt, nch, data };
}
function bvhFrame(B, f) {
  // returns per joint { q (global), p (global position, cm) }
  let c = f * B.nch;
  const out = [];
  for (let j = 0; j < B.joints.length; j++) {
    const J = B.joints[j];
    let lp = J.offset.slice(), lq = [0, 0, 0, 1];
    for (const ch of J.channels) {
      const v = B.data[c++];
      if (ch === 'Xposition') lp[0] = v; else if (ch === 'Yposition') lp[1] = v; else if (ch === 'Zposition') lp[2] = v;
      else if (ch === 'Xrotation') lq = qmul(lq, qaxis([1, 0, 0], v));
      else if (ch === 'Yrotation') lq = qmul(lq, qaxis([0, 1, 0], v));
      else if (ch === 'Zrotation') lq = qmul(lq, qaxis([0, 0, 1], v));
    }
    if (J.parent < 0) out.push({ q: qnorm(lq), p: lp });
    else { const P = out[J.parent]; out.push({ q: qnorm(qmul(P.q, lq)), p: qrot(P.q, lp).map((x, k) => x + P.p[k]) }); }
  }
  return out;
}
function bvhRest(B) {
  const out = [];
  for (const J of B.joints) out.push(J.parent < 0 ? { p: [0, 0, 0] } : { p: J.offset.map((v, k) => v + out[J.parent].p[k]) });
  return out;
}

// ---------------- target (CARLA GEN2) ----------------
const M = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const SK = M.skeletons.gen2;
const body = M.bodies.SK_AmerM_001_MH;
const nb = SK.bones.length;
const tIdx = new Map(SK.bones.map((b, i) => [b, i]));
function targetRest() {
  const G = [];
  for (let b = 0; b < nb; b++) {
    const t = body.refT.slice(b * 3, b * 3 + 3), q = body.refR.slice(b * 4, b * 4 + 4);
    const p = SK.parents[b];
    G.push(p < 0 ? { q, p: t } : { q: qnorm(qmul(G[p].q, q)), p: qrot(G[p].q, t).map((v, k) => v + G[p].p[k]) });
  }
  return G;
}
const TR = targetRest();
// mapping target <- source, with the child used for the rest-direction fix
const MAP = [
  ['crl_hips__C', 'Hips', 'crl_spine__C', 'Chest'],
  ['crl_spine__C', 'Chest2', 'crl_spine01__C', 'Chest4'],
  ['crl_spine01__C', 'Chest4', 'crl_neck__C', 'Neck'],
  ['crl_neck__C', 'Neck', 'crl_Head__C', 'Head'],
  ['crl_Head__C', 'Head', null, null],
  ['crl_shoulder__L', 'LeftCollar', 'crl_arm__L', 'LeftShoulder'], ['crl_shoulder__R', 'RightCollar', 'crl_arm__R', 'RightShoulder'],
  ['crl_arm__L', 'LeftShoulder', 'crl_foreArm__L', 'LeftElbow'], ['crl_arm__R', 'RightShoulder', 'crl_foreArm__R', 'RightElbow'],
  ['crl_foreArm__L', 'LeftElbow', 'crl_hand__L', 'LeftWrist'], ['crl_foreArm__R', 'RightElbow', 'crl_hand__R', 'RightWrist'],
  ['crl_hand__L', 'LeftWrist', null, null], ['crl_hand__R', 'RightWrist', null, null],
  ['crl_thigh__L', 'LeftHip', 'crl_leg__L', 'LeftKnee'], ['crl_thigh__R', 'RightHip', 'crl_leg__R', 'RightKnee'],
  ['crl_leg__L', 'LeftKnee', 'crl_foot__L', 'LeftAnkle'], ['crl_leg__R', 'RightKnee', 'crl_foot__R', 'RightAnkle'],
  ['crl_foot__L', 'LeftAnkle', 'crl_toe__L', 'LeftToe'], ['crl_foot__R', 'RightAnkle', 'crl_toe__R', 'RightToe'],
  ['crl_toe__L', 'LeftToe', null, null], ['crl_toe__R', 'RightToe', null, null],
];

const B = parseBVH(fs.readFileSync(bvhFile, 'utf8'));
const sIdx = new Map(B.joints.map((j, i) => [j.name, i]));
const SR = bvhRest(B);
// side check: source Left joints at +X (T-pose); target L arm global x
const tL = TR[tIdx.get('crl_arm__L')].p, sL = SR[sIdx.get('LeftShoulder')].p;
const flipX = Math.sign(tL[0]) !== Math.sign(sL[0]);
if (flipX) throw new Error('left/right sides disagree between source and target rest (x mirror) — handle before use');
const scale = 0.01 * (TR[tIdx.get('crl_hips__C')].p[1] / SR[sIdx.get('Hips')].p[1] > 0 ? 1 : 1);
const hipsT = TR[tIdx.get('crl_hips__C')].p[1];
// rest fix per mapped bone: rotate the target rest bone direction onto the source rest direction
const FIX = new Map();
for (const [tb, sb, tc, sc] of MAP) {
  if (!tc) { FIX.set(tb, [0, 0, 0, 1]); continue; }
  const dt = norm3(sub3(TR[tIdx.get(tc)].p, TR[tIdx.get(tb)].p));
  const ds = norm3(sub3(SR[sIdx.get(sc)].p, SR[sIdx.get(sb)].p));
  FIX.set(tb, qbetween(dt, ds));
}

// ---------------- NEUTRAL-POSE CALIBRATION ----------------
// The BVH zero pose and CARLA's bind T-pose use different bone-roll conventions (a T-pose delta pitched every head 30 deg
// down and twisted the hands). Map rotations as deltas from each side's own NEUTRAL STANDING pose instead: the mean
// global orientation over 100STYLE's Neutral idle (same performer for every style) and over CARLA's AS_GEN2_idle.
//   G_tgt(t) = G_src(t) * inv(G_srcNeutral) * G_tgtNeutral
const qavg = (list) => { const r = [0, 0, 0, 0]; const ref = list[0]; for (const q of list) { const s2 = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1; for (let k = 0; k < 4; k++) r[k] += s2 * q[k]; } return qnorm(r); };
const NEUTRAL_BVH = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/100style/100STYLE__Neutral__Neutral_ID.bvh';
const BN = path.resolve(bvhFile) === path.resolve(NEUTRAL_BVH) ? null : parseBVH(fs.readFileSync(NEUTRAL_BVH, 'utf8'));
function srcNeutral() {
  const src = BN || B;
  const sI = new Map(src.joints.map((j, i) => [j.name, i]));
  const acc = new Map();
  for (let f = Math.floor(src.frames * 0.3); f < src.frames * 0.7; f += 6) {
    const S = bvhFrame(src, f);
    const l = S[sI.get('LeftHip')].p, r = S[sI.get('RightHip')].p;
    const yaw = Math.atan2(-(l[2] - r[2]), l[0] - r[0]) * 180 / Math.PI;
    const Ry = qaxis([0, 1, 0], -yaw);
    for (const [, sb] of MAP) { if (!acc.has(sb)) acc.set(sb, []); acc.get(sb).push(qmul(Ry, S[sI.get(sb)].q)); }
  }
  return new Map([...acc].map(([k, v]) => [k, qavg(v)]));
}
function tgtNeutral() {
  const a = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'AS_GEN2_idle.anim.json'), 'utf8'));
  const tr = new Map(a.tracks.map((t) => [t.bone, t]));
  const acc = new Map();
  for (let f = 0; f < a.numFrames; f += 6) {
    const G = [];
    for (let b = 0; b < nb; b++) {
      const t = tr.get(SK.bones[b]);
      const q = t && t.r && t.r.length ? t.r[Math.min(f, t.r.length - 1)] : body.refR.slice(b * 4, b * 4 + 4);
      const p = SK.parents[b];
      G.push(p < 0 ? q : qnorm(qmul(G[p], q)));
    }
    for (const [tb] of MAP) { if (!acc.has(tb)) acc.set(tb, []); acc.get(tb).push(G[tIdx.get(tb)]); }
  }
  return new Map([...acc].map(([k, v]) => [k, qavg(v)]));
}
const SN = srcNeutral(), TN = tgtNeutral();

// ---------------- per-frame retarget (globals -> locals) ----------------
// source hips height in the take's first frames (standing height, cm)
let srcHips = 0; for (let f = 0; f < Math.min(60, B.frames); f++) srcHips += bvhFrame(B, f)[sIdx.get('Hips')].p[1]; srcHips /= Math.min(60, B.frames);
const hs = hipsT / (srcHips * 0.01);
// relaxed fingers / eyes from CARLA's walk clip, frame 0
const carla = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'AS_male2_WalkCicle0E.anim.json'), 'utf8'));
const carlaR = new Map(carla.tracks.map((t) => [t.bone, t.r[0]]));
const mapped = new Map(MAP.map(([tb, sb]) => [tb, sb]));

function retargetFrame(f, yawRemove, originXZ) {
  const S = bvhFrame(B, f);
  // remove heading: rotate the source world about +Y by -yaw
  const Ry = qaxis([0, 1, 0], -yawRemove);
  const G = new Array(nb);
  const local = new Array(nb);
  for (let b = 0; b < nb; b++) {
    const name = SK.bones[b], p = SK.parents[b];
    const sb = mapped.get(name);
    let g;
    if (sb) {
      const sq = qmul(Ry, S[sIdx.get(sb)].q);
      g = qnorm(qmul(qmul(sq, qinv(SN.get(sb))), TN.get(name)));
      // lab performers watch the floor: pitch the neck/head up by --headup degrees (walks), about the lateral +X axis
      if (HEADUP && (name === 'crl_neck__C' || name === 'crl_Head__C')) g = qnorm(qmul(qaxis([1, 0, 0], -HEADUP * (name === 'crl_neck__C' ? 0.5 : 1)), g));
      // WRISTS: the 100STYLE hand segment comes off a marker cluster and, after the neutral calibration, leaves the hands
      // cocked back with the palms flicked out on every swing (PV2 close-ups). Keep a quarter of the mocap wrist and
      // take the rest from CARLA's relaxed walking wrist, relative to the forearm.
      if (/^crl_hand__[LR]$/.test(name) && carlaR.get(name) && p >= 0) {
        const lm = qnorm(qmul(qinv(G[p]), g));
        g = qnorm(qmul(G[p], qslerp(lm, carlaR.get(name), WRIST_RELAX)));
      }
    } else {
      // unmapped: keep its CARLA relaxed local (fingers) or bind local (root, eyes)
      const lr = /hand(Index|Middle|Ring|Pinky|Thumb)/.test(name) && carlaR.get(name) ? carlaR.get(name) : body.refR.slice(b * 4, b * 4 + 4);
      g = p < 0 ? lr : qnorm(qmul(G[p], lr));
    }
    G[b] = g;
    local[b] = p < 0 ? g : qnorm(qmul(qinv(G[p]), g));
  }
  // hips translation: source hips (cm) -> heading removed, in place, scaled; expressed in the root's local frame
  const hp = S[sIdx.get('Hips')].p.map((v) => v * 0.01);
  let w = qrot(Ry, [hp[0] - originXZ[0], hp[1], hp[2] - originXZ[1]]);
  w = [w[0] * hs, w[1] * hs, w[2] * hs];
  const root = tIdx.get('crl_root');
  const hipsLocal = qrot(qinv(G[root]), w);
  return { local, hipsLocal, S };
}

// heading of the source body at frame f: projected hip line (left->right) -> forward
function heading(S) {
  const l = S[sIdx.get('LeftHip')].p, r = S[sIdx.get('RightHip')].p;
  const side = [l[0] - r[0], 0, l[2] - r[2]];
  // forward = up x side (left at +X when facing +Z): f = (side.z, 0, -side.x)... solve for facing +Z when side = +X
  const fwd = [-side[2], 0, side[0]];
  return Math.atan2(fwd[0], fwd[2]) * 180 / Math.PI;   // yaw in degrees, 0 = facing +Z
}

// ---------------- segment selection ----------------
const fps = 1 / B.dt;
let f0, f1;
const hipsXZ = (f) => { const p = bvhFrame(B, f)[sIdx.get('Hips')].p; return [p[0] * 0.01, p[2] * 0.01]; };
if (kind === 'walk') {
  // left-toe lift-offs: toe height rises through a threshold after contact
  const toeY = [];
  for (let f = 0; f < B.frames; f++) toeY.push(bvhFrame(B, f)[sIdx.get('LeftToe')].p[1]);
  const minToe = Math.min(...toeY);
  const offs = [];
  for (let f = 1; f < B.frames; f++) if (toeY[f - 1] <= minToe + 1.5 && toeY[f] > minToe + 1.5) offs.push(f);
  // candidate cycles between consecutive lift-offs: speed, straightness
  const want = opt('speed', 1.3);
  let best = null;
  for (let k = 0; k + 1 < offs.length; k++) {
    const a = offs[k], b = offs[k + 1];
    const n = b - a;
    if (n < 0.7 * fps || n > 1.6 * fps) continue;
    const pa = hipsXZ(a), pb = hipsXZ(b);
    const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const speed = dist / (n / fps);
    const ya = heading(bvhFrame(B, a)), yb = heading(bvhFrame(B, b));
    let dy = Math.abs(((yb - ya + 540) % 360) - 180);
    // travel direction vs facing: forward walking only
    const travel = Math.atan2(pb[0] - pa[0], pb[1] - pa[1]) * 180 / Math.PI;
    const dFace = Math.abs(((travel - ya + 540) % 360) - 180);
    if (dy > 6 || dFace > 20 || speed < 0.5) continue;
    const score = Math.abs(Math.log(speed / want)) + dy * 0.01;
    if (!best || score < best.score) best = { a, b, speed, score, dy };
  }
  if (!best) throw new Error('no straight cycle found');
  f0 = best.a; f1 = best.b;
  console.log(`cycle frames ${f0}-${f1} (${((f1 - f0) / fps).toFixed(2)} s) speed ${best.speed.toFixed(2)} m/s heading drift ${best.dy.toFixed(1)} deg`);
} else {
  const secs = opt('seconds', 8);
  const mid = opt('start', Math.floor(B.frames / 2 - (secs * fps) / 2));
  f0 = Math.max(0, mid); f1 = Math.min(B.frames - 1, f0 + Math.round(secs * fps));
  console.log(`idle frames ${f0}-${f1} (${((f1 - f0) / fps).toFixed(2)} s)`);
}

// ---------------- sample at 30 fps, in place, loop-corrected ----------------
const outFps = 30;
const nOut = Math.max(2, Math.round(((f1 - f0) / fps) * outFps));
const yawAt = (f) => heading(bvhFrame(B, f));
// constant heading for the segment (mean of its ends: a straight stretch), travel removed linearly
const yaw0 = yawAt(f0), yaw1 = yawAt(f1);
const dyaw = ((yaw1 - yaw0 + 540) % 360) - 180;
const pA = hipsXZ(f0), pB = hipsXZ(f1);
const frames = [];
for (let k = 0; k <= nOut; k++) {
  const t = k / nOut;
  const f = Math.min(B.frames - 1, Math.round(f0 + t * (f1 - f0)));
  const yaw = yaw0 + dyaw * t;
  const origin = kind === 'walk' ? [pA[0] + (pB[0] - pA[0]) * t, pA[1] + (pB[1] - pA[1]) * t] : [pA[0], pA[1]];
  frames.push(retargetFrame(f, yaw, origin));
}
// loop correction: distribute (last -> first) difference over the cycle, then drop the duplicate last frame
const last = frames[nOut], first = frames[0];
for (let k = 0; k < nOut; k++) {
  const t = k / nOut;
  for (let b = 0; b < nb; b++) {
    const d = qmul(first.local[b], qinv(last.local[b]));   // rotation taking last -> first
    frames[k].local[b] = qnorm(qmul(qslerp([0, 0, 0, 1], d, t), frames[k].local[b]));
  }
  frames[k].hipsLocal = frames[k].hipsLocal.map((v, i) => v + (first.hipsLocal[i] - last.hipsLocal[i]) * t);
}
frames.pop();

// ---------------- write ueextract-style anim.json ----------------
const tracks = SK.bones.map((name, b) => ({
  bone: name, index: b,
  t: frames.map((F) => (name === 'crl_hips__C' ? F.hipsLocal : body.refT.slice(b * 3, b * 3 + 3)).map((v) => +v.toFixed(6))),
  r: frames.map((F) => F.local[b].map((v) => +v.toFixed(7))),
}));
const out = { name: outName, package: '100STYLE:' + path.basename(bvhFile), skeleton: 'SK_Pedestrian_Generan', numFrames: frames.length, fps: outFps, length: frames.length / outFps, rateScale: 1, additive: false, rootMotion: false, source: '100STYLE (CC-BY 4.0, Mason/Starke/Komura 2022)', tracks };
fs.writeFileSync(path.join(OUTDIR, outName + '.anim.json'), JSON.stringify(out));
console.log(`wrote ${outName}.anim.json: ${frames.length} frames @ ${outFps} fps, hips scale ${hs.toFixed(3)}`);
