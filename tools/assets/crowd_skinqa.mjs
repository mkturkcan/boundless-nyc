// Crowd skinning QA (no GPU): every body, every LOD, every primitive of boundlessjs/public/models/peds24 (CARLA + RB27),
// skinned on the CPU the way the pose pass does it. POSE_FS of sim/crowd.js is re-implemented line for line: each clip
// sampled between its two frames (nlerp), clip rotations where the clip marks the bone valid and the body's rest rotation
// elsewhere, the body's own bone offsets, the hips' translation from the clip times the clip's hips scale (a seated clip's
// per-body kBody), the SIT31 per-walker arm rows (crowd.js _ensureArms from sit31_arms.json), clip A and clip B nlerped by
// the crossfade weight, the parent chain accumulated from the root, and skinning = global x inverse bind.
// Poses: s_neutral_idle frame 0 and s_neutral_walk frame 10; with --all every clip of the body's skeleton at four times
// (two of them between frames), the seated clips (crowdSit.js synthSitClips, as crowd.js builds them at load) with the
// body's own arms at 0.88 / 1 / 1.12 of its NYC mean scale, and the crossfades a seated walker passes through at w = 0.5
// (seated <-> idle, walk -> seated, one seated pose -> another). Flags:
//   joints   a joint index outside the skeleton (the pose pass would read another bone's row, or past the texture)
//   weights  a vertex whose weights do not sum to ~1 (NaN, 0, or > 1.01)
//   far      a vertex more than --far m (0.3) from the nearest point of its dominant bone's segment (joint to child joint)
//            after skinning, i.e. mesh parts drawn away from the body
//   bind     the same distance in the bind pose (an asset fault: a vertex bound to a bone it does not sit near)
//   matrix   a skinning matrix that is not finite or not rigid (|R^T R - I| > 0.01), or a posed joint more than 2.5 m from
//            the walker's origin
//   node tools/assets/crowd_skinqa.mjs [--all] [--bodies a,b] [--far 0.3] [--lods 0,1,2]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = path.join(ROOT, 'boundlessjs/public/models/peds24') + '/';
const SIT = await import(pathToFileURL(path.join(ROOT, 'boundlessjs/src/sim/crowdSit.js')).href);
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FAR = Number(opt('far', '0.3')), ALL = args.includes('--all');
const LODS = new Set((opt('lods') || '0,1,2').split(',').map(Number));
const m = JSON.parse(fs.readFileSync(BASE + 'manifest.json', 'utf8'));
const rb = fs.existsSync(BASE + 'rb27/manifest.json') ? JSON.parse(fs.readFileSync(BASE + 'rb27/manifest.json', 'utf8')) : { bodies: {}, variants: [] };
const ci = JSON.parse(fs.readFileSync(BASE + 'clips.json', 'utf8'));
const bake = fs.existsSync(BASE + 'sit31_arms.json') ? JSON.parse(fs.readFileSync(BASE + 'sit31_arms.json', 'utf8')) : null;
const onlyB = opt('bodies') ? new Set(opt('bodies').split(',')) : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const TARGET_H = { m: 1.77, f: 1.65, child: 1.22 };
const variants = [...m.variants, ...rb.variants];

// ---- the skeletons as crowd.js loadCrowd builds them (clip data with fixLoop, bodies indexed per skeleton)
function fixLoop(D, nb, hips, c) {   // crowd.js fixLoop: the hips' mean horizontal offset removed from every looping clip
  if (!c.loop || !(c.frames > 3)) return;
  const F = c.frames, r0 = c.row, W = nb * 8;
  const at = (r, b, t) => r0 * W + r * W + b * 8 + (t ? 4 : 0);
  if (hips >= 0) {
    let mx = 0, my = 0;
    for (let r = 0; r < F; r++) { const o = at(r, hips, 1); mx += D[o]; my += D[o + 1]; }
    mx /= F; my /= F;
    for (let r = 0; r < F; r++) { const o = at(r, hips, 1); D[o] -= mx; D[o + 1] -= my; }
  }
}
const skel = {};
for (const [k, SK] of Object.entries(m.skeletons)) {
  if (!SK.parents) continue;
  const nb = SK.bones.length, D = new Float32Array(fs.readFileSync(BASE + `clips_${k}.bin`).buffer.slice(0));
  const hips = SK.bones.findIndex((b) => /hips/i.test(b));
  const clips = ci.clips.filter((c) => c.skeleton === k).map((c) => ({ ...c }));
  for (const c of clips) fixLoop(D, nb, hips, c);
  skel[k] = { name: k, nb, bones: SK.bones, parents: SK.parents, hips, clips, clipData: D, bodies: [] };
}
const bodies = [];
for (const [name, B] of [...Object.entries(m.bodies), ...Object.entries(rb.bodies)]) {
  const S = skel[B.skeleton];
  if (!S) continue;
  const b = { name, ...B, set: rb.bodies[name] ? 'rb27' : undefined, index: S.bodies.length };
  b.hipsH = Math.hypot(b.refT[S.hips * 3], b.refT[S.hips * 3 + 1], b.refT[S.hips * 3 + 2]);
  S.bodies.push(b); bodies.push(b);
}
// SIT31: the seated clips exactly as crowd.js makes them at load (no outlines: the reference arms from bone lengths; the
// bake carries every body's own arms)
if (ALL && skel.gen2) {
  const S = skel.gen2, r = SIT.synthSitClips(S, null, bake);
  if (r) { S.clipData = r.data; S.clips.push(...r.clips); S.sitScales = bake ? bake.scales : null; }
  if (bake) for (const B of S.bodies) B.sitBake = bake.bodies[B.name] || null;
}

// ---- POSE_FS in JS
const nlq = (a, b, t) => {   // nl(): b flipped into a's hemisphere, mixed, normalized (NaN for a zero mix, as GLSL)
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const x = a[0] + (s * b[0] - a[0]) * t, y = a[1] + (s * b[1] - a[1]) * t, z = a[2] + (s * b[2] - a[2]) * t, w = a[3] + (s * b[3] - a[3]) * t;
  const l = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / l, y / l, z / l, w / l];
};
const qmul = (a, b) => [a[3] * b[0] + b[3] * a[0] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] + b[3] * a[1] + a[2] * b[0] - a[0] * b[2], a[3] * b[2] + b[3] * a[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const cx = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const u = [q[0], q[1], q[2]], c1 = cx(u, v); const t = cx(u, [c1[0] + q[3] * v[0], c1[1] + q[3] * v[1], c1[2] + q[3] * v[2]]); return [v[0] + 2 * t[0], v[1] + 2 * t[1], v[2] + 2 * t[2]]; };
const qnorm = (q) => { const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const gmod = (x, y) => x - y * Math.floor(x / y);
function clipAt(D, W, c, time, b) {   // c = { row, frames }; time in [0, frames)
  const f = Math.floor(time), a = time - f;
  const r0 = Math.trunc(c.row + gmod(f, c.frames) + 0.5), r1 = Math.trunc(c.row + gmod(f + 1, c.frames) + 0.5);
  const o0 = r0 * W + b * 8, o1 = r1 * W + b * 8;
  const ok = D[o0 + 7];
  const q = ok > 0.5 ? nlq([D[o0], D[o0 + 1], D[o0 + 2], D[o0 + 3]], [D[o1], D[o1 + 1], D[o1 + 2], D[o1 + 3]], a) : [0, 0, 0, 1];
  return { q, t: [D[o0 + 4] + (D[o1 + 4] - D[o0 + 4]) * a, D[o0 + 5] + (D[o1 + 5] - D[o0 + 5]) * a, D[o0 + 6] + (D[o1 + 6] - D[o0 + 6]) * a], ok };
}
// one pose row: st = { A, tA, B, tB, w, kA, kB, armA, armB } -> skinning matrices (column-major 4x4) and joint positions
function poseRow(S, B, st, slotOf) {
  const nb = S.nb, W = nb * 8, D = S.clipData, Gq = new Array(nb), Gt = new Array(nb);
  const local = (bb) => {
    const ca = clipAt(D, W, st.A, st.tA, bb), cb = clipAt(D, W, st.B, st.tB, bb);
    const rT = [B.refT[bb * 3], B.refT[bb * 3 + 1], B.refT[bb * 3 + 2]], rR = [B.refR[bb * 4], B.refR[bb * 4 + 1], B.refR[bb * 4 + 2], B.refR[bb * 4 + 3]];
    let la = ca.ok > 0.5 ? ca.q : rR, lb = cb.ok > 0.5 ? cb.q : rR;
    const sl = slotOf[bb];
    if (sl >= 0) {
      if (st.armA) { const o = sl * 4; if (st.armA[o + 3] < 1.5) la = [st.armA[o], st.armA[o + 1], st.armA[o + 2], st.armA[o + 3]]; }
      if (st.armB) { const o = sl * 4; if (st.armB[o + 3] < 1.5) lb = [st.armB[o], st.armB[o + 1], st.armB[o + 2], st.armB[o + 3]]; }
    }
    const lq = nlq(la, lb, st.w);
    let lt = rT;
    if (bb === S.hips) {
      const ha = ca.ok > 0.5 ? ca.t.map((v) => v * st.kA) : rT, hb = cb.ok > 0.5 ? cb.t.map((v) => v * st.kB) : ha;
      lt = ha.map((v, i) => v + (hb[i] - v) * st.w);
    }
    return { lq, lt };
  };
  const done = new Uint8Array(nb);
  const eval_ = (b) => {
    if (done[b]) return;
    const p = S.parents[b], L = local(b);
    if (p < 0) { Gt[b] = qrot([0, 0, 0, 1], L.lt); Gq[b] = qnorm(qmul([0, 0, 0, 1], L.lq)); }
    else { eval_(p); const r = qrot(Gq[p], L.lt); Gt[b] = [Gt[p][0] + r[0], Gt[p][1] + r[1], Gt[p][2] + r[2]]; Gq[b] = qnorm(qmul(Gq[p], L.lq)); }
    done[b] = 1;
  };
  for (let b = 0; b < nb; b++) eval_(b);
  const Sm = new Array(nb);
  for (let b = 0; b < nb; b++) {
    const q = Gq[b], cx = qrot(q, [1, 0, 0]), cy = qrot(q, [0, 1, 0]), cz = qrot(q, [0, 0, 1]), t = Gt[b], I = B.ibm, o = b * 16;
    const G = [cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, cz[0], cz[1], cz[2], 0, t[0], t[1], t[2], 1], M = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) M[c * 4 + r] = G[r] * I[o + c * 4] + G[4 + r] * I[o + c * 4 + 1] + G[8 + r] * I[o + c * 4 + 2] + G[12 + r] * I[o + c * 4 + 3];
    Sm[b] = M;
  }
  return { Sm, Gt };
}
// crowd.js _ensureArms: the walker's arm row for seated pose p at world scale s (the table poses blend the bake's samples)
function armRow(B, p, s, SC) {
  const e = B.sitBake, list = e && e.poses[p];
  if (!list) return null;
  let a = list[0], b = list[0], t = 0;
  if (list.length > 1 && SC) {
    const k = s / e.s0;
    let j = 0; while (j < SC.length - 2 && k > SC[j + 1]) j++;
    a = list[j]; b = list[j + 1]; t = Math.min(1, Math.max(0, (k - SC[j]) / (SC[j + 1] - SC[j])));
  }
  const out = new Float32Array(a.length);
  for (let q = 0; q < a.length; q += 4) {
    if (a[q + 3] > 1.5) { out[q + 3] = 2; continue; }
    const r = nlq([a[q], a[q + 1], a[q + 2], a[q + 3]], [b[q], b[q + 1], b[q + 2], b[q + 3]], t);
    out.set(r, q);
  }
  return out;
}
const meanScale = (B) => { const V = variants.find((v) => v.body === B.name) || { gender: 'm', age: 'adult' }; const key = V.age === 'child' ? 'child' : V.gender; return Math.max(0.7, Math.min(1.1, TARGET_H[key] / (B.height * (V.scale || 1)))) * (V.scale || 1); };
// the poses one body is checked in
function statesOf(S, B) {
  const kOf = (c) => (c.kBody ? c.kBody[B.index] : B.hipsH / (c.hipsH || B.hipsH));
  const one = (c, t, arm = null, tag = '') => ({ tag: `${c.name}@${t.toFixed(1)}${tag}`, A: c, tA: t, B: c, tB: t, w: 0, kA: kOf(c), kB: kOf(c), armA: arm, armB: arm });
  const V = variants.find((v) => v.body === B.name), child = V ? V.age === 'child' : B.height < 1.4;
  const idle = S.clips.find((c) => c.name === 's_neutral_idle') || S.clips.find((c) => c.kind === 'idle');
  const walk = S.clips.find((c) => c.name === 's_neutral_walk') || S.clips.find((c) => c.kind === 'walk');
  if (!ALL) return [idle && one(idle, 0), walk && one(walk, 10)].filter(Boolean);
  const out = [];
  for (const c of S.clips.filter((x) => x.kind !== 'sit')) for (const f of [0, 0.25, 0.5, 0.75]) out.push(one(c, Math.min(c.frames - 1e-3, f * c.frames + (f === 0.25 || f === 0.75 ? 0.5 : 0))));
  const sit = S.clips.filter((x) => x.kind === 'sit');
  if (!sit.length || child) return out;
  const s0 = meanScale(B), SC = S.sitScales;
  for (const c of sit) for (const k of [0.88, 1, 1.12]) {
    const arm = armRow(B, c.sitPose, s0 * k, SC);
    for (const f of [0, 25.5, 50, 75.5]) out.push(one(c, f, arm, ` x${k}`));
    // the crossfades: seated -> idle (standing up), walk -> seated (sitting down), this pose -> the next one
    out.push({ tag: `${c.name}->${idle.name} x${k}`, A: idle, tA: 3, B: c, tB: 40, w: 0.5, kA: kOf(idle), kB: kOf(c), armA: null, armB: arm });
    out.push({ tag: `${walk.name}->${c.name} x${k}`, A: c, tA: 10, B: walk, tB: 12.5, w: 0.5, kA: kOf(c), kB: kOf(walk), armA: arm, armB: null });
    const n = sit[(sit.indexOf(c) + 1) % sit.length];
    out.push({ tag: `${c.name}->${n.name} x${k}`, A: n, tA: 20, B: c, tB: 60, w: 0.5, kA: kOf(n), kB: kOf(c), armA: armRow(B, n.sitPose, s0 * k, SC), armB: arm });
  }
  return out;
}

// ---- run
const segDist = (p, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; let t = L2 > 1e-9 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t); };
const t0 = performance.now();
let bad = 0, nb0 = 0, nPoses = 0;
for (const B of bodies) {
  if (onlyB && !onlyB.has(B.name)) continue;
  nb0++;
  const S = skel[B.skeleton], nb = S.nb;
  const slotOf = new Int16Array(nb).fill(-1);
  if (S.clips.some((c) => c.kind === 'sit')) SIT.ARM_SLOTS.forEach((n, k) => { const b = S.bones.indexOf(n); if (b >= 0) slotOf[b] = k; });
  const kids = S.bones.map(() => []); S.parents.forEach((p, b) => { if (p >= 0) kids[p].push(b); });
  const bindJ = (b) => { const m2 = B.ibm.slice(b * 16, b * 16 + 16), r = [m2[0], m2[1], m2[2], m2[4], m2[5], m2[6], m2[8], m2[9], m2[10]], t = [m2[12], m2[13], m2[14]]; return [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])]; };
  const BJ = S.bones.map((_, b) => bindJ(b));
  const states = statesOf(S, B);
  // every state's matrices once (checked for rigidity and reach), then every vertex of every LOD in every state
  const rows = states.map((st) => ({ st, ...poseRow(S, B, st, slotOf) }));
  nPoses += rows.length;
  const report = [];
  for (const R of rows) {
    let why = null;
    for (let b = 0; b < nb && !why; b++) {
      const A = R.Sm[b];
      if (!Array.from(A).every(Number.isFinite)) { why = `${S.bones[b]} not finite`; break; }
      const c = [[A[0], A[1], A[2]], [A[4], A[5], A[6]], [A[8], A[9], A[10]]], d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const err = Math.max(Math.abs(d(c[0], c[0]) - 1), Math.abs(d(c[1], c[1]) - 1), Math.abs(d(c[2], c[2]) - 1), Math.abs(d(c[0], c[1])), Math.abs(d(c[0], c[2])), Math.abs(d(c[1], c[2])));
      if (err > 0.01) why = `${S.bones[b]} not rigid (${err.toFixed(3)})`;
      const g = R.Gt[b];
      if (Math.hypot(g[0], g[2]) > 2.5 || g[1] < -0.5 || g[1] > 3) why = `${S.bones[b]} joint at ${g.map((v) => v.toFixed(2)).join(',')}`;
    }
    if (why) report.push(`matrix ${R.st.tag}: ${why}`);
  }
  const doc = await io.read(BASE + B.file);
  for (const n of doc.getRoot().listNodes()) {
    if (!/^LOD\d$/.test(n.getName()) || !n.getMesh() || !LODS.has(Number(n.getName()[3]))) continue;
    const Mw = n.getWorldMatrix();
    n.getMesh().listPrimitives().forEach((p, pi) => {
      const pa = p.getAttribute('POSITION'), ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'), pr = p.getAttribute('_PART');
      const v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      const cnt = { joints: 0, weights: 0, far: 0, bind: 0 }, worst = { far: 0, bind: 0 };
      const farBy = new Map();   // pose tag -> [count, worst]
      let example = null;
      for (let i = 0; i < pa.getCount(); i++) {
        if (pr && pr.getScalar(i) >= 10) continue;   // props are collapsed unless carried (checked by their fits)
        pa.getElement(i, v); ja.getElement(i, j); wa.getElement(i, w);
        const x = Mw[0] * v[0] + Mw[4] * v[1] + Mw[8] * v[2] + Mw[12], y = Mw[1] * v[0] + Mw[5] * v[1] + Mw[9] * v[2] + Mw[13], z = Mw[2] * v[0] + Mw[6] * v[1] + Mw[10] * v[2] + Mw[14];
        const ws = w[0] + w[1] + w[2] + w[3];
        if (j.some((q) => !(q >= 0 && q < nb))) { cnt.joints++; if (!example) example = { i, j: [...j], w: [...w] }; continue; }
        if (!(ws > 0.99 && ws < 1.01)) { cnt.weights++; if (!example) example = { i, j: [...j], w: [...w], ws }; }
        let bb = j[0], bw = w[0]; for (let k = 1; k < 4; k++) if (w[k] > bw) { bw = w[k]; bb = j[k]; }
        const segOf = (Pj, px, py, pz) => { let d = Math.hypot(px - Pj[bb][0], py - Pj[bb][1], pz - Pj[bb][2]); for (const c of kids[bb]) d = Math.min(d, segDist([px, py, pz], Pj[bb], Pj[c])); return d; };
        const db = segOf(BJ, x, y, z);
        if (db > FAR) { cnt.bind++; if (db > worst.bind) worst.bind = db; }
        for (const R of rows) {
          let ox = 0, oy = 0, oz = 0;
          for (let k = 0; k < 4; k++) { if (!w[k]) continue; const A = R.Sm[j[k]]; ox += w[k] * (A[0] * x + A[4] * y + A[8] * z + A[12]); oy += w[k] * (A[1] * x + A[5] * y + A[9] * z + A[13]); oz += w[k] * (A[2] * x + A[6] * y + A[10] * z + A[14]); }
          const d = segOf(R.Gt, ox, oy, oz);
          if (!(d <= FAR)) {
            cnt.far++; if (!(d <= worst.far)) worst.far = d;
            const e = farBy.get(R.st.tag) || [0, 0]; e[0]++; e[1] = Math.max(e[1], d); farBy.set(R.st.tag, e);
            if (!example) example = { i, j: [...j], w: [...w].map((q) => +q.toFixed(3)), d: +d.toFixed(3), bone: S.bones[bb], pose: R.st.tag };
          }
        }
      }
      if (cnt.joints || cnt.weights || cnt.far || cnt.bind) {
        const tops = [...farBy.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 4).map(([t, [c2, d]]) => `${t} ${c2} v ${d.toFixed(2)} m`).join('; ');
        report.push(`${n.getName()} prim ${pi} (${pa.getCount()} v): joints ${cnt.joints} weights ${cnt.weights} far ${cnt.far} (worst ${worst.far.toFixed(2)} m) bind ${cnt.bind} (worst ${worst.bind.toFixed(2)} m)${tops ? ' worst poses: ' + tops : ''} e.g. ${JSON.stringify(example)}`);
      }
    });
  }
  if (report.length) { bad++; console.log(`${B.name} (${B.skeleton}, ${rows.length} poses):\n  ` + report.join('\n  ')); }
}
console.log(`\n${bad} of ${nb0} bodies with findings (far > ${FAR} m), ${nPoses} poses, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
