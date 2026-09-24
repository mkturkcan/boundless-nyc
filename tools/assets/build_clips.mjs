// Crowd animation library: CARLA 0.10 AnimSequences (ueextract `anim` .anim.json) -> per-skeleton clip textures.
//   node tools/assets/build_clips.mjs          (after build_peds.mjs: needs peds24/manifest.json for the hierarchy)
//
// Output boundlessjs/public/models/peds24/clips_<skeleton>.bin: Float32, per clip, per frame, per CANONICAL bone two
// RGBA texels: (quat x, y, z, w) and (translation x, y, z, valid). A bone the clip has no track for is written with
// valid = 0 and the runtime keeps the body's reference pose for it. clips.json indexes them: frames, fps, row offset,
// loop, and for locomotion the clip's natural GROUND SPEED (m/s, measured on a reference body from the stance foot) so the
// runtime can play a walk at exactly the speed the sim moves the pedestrian — no foot sliding.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT = path.join(ROOT, 'boundlessjs/public/models/peds24');
const ANIM = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_anim';
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

// clip table: file, skeleton, kind, loop. (AS_female_shortCicle is a 4545-frame capture at 1920 fps: not a cycle.)
const CLIPS = [
  { name: 'walk_m', file: 'AS_male2_WalkCicle0E', skel: 'gen2', kind: 'walk' },
  { name: 'walk_f', file: 'AS_Girl_walkCicle0C', skel: 'gen2', kind: 'walk' },
  { name: 'run_f', file: 'AS_female_runCicle0E', skel: 'gen2', kind: 'run' },
  { name: 'run_g', file: 'AS_Girl_runCicle0E', skel: 'gen2', kind: 'run' },
  { name: 'turnL_f', file: 'AS_female_LTurnCicle', skel: 'gen2', kind: 'turnL' },
  { name: 'turnR_f', file: 'AS_female_RTurnCicle', skel: 'gen2', kind: 'turnR' },
  { name: 'turnL_g', file: 'AS_Girl_LTurnCicle', skel: 'gen2', kind: 'turnL' },
  { name: 'turnR_g', file: 'AS_Girl_RTurnCicle', skel: 'gen2', kind: 'turnR' },
  { name: 'idle_a', file: 'AS_GEN2_idle', skel: 'gen2', kind: 'idle' },
  { name: 'idle_b', file: 'AS_Girl_IdleCicle0C', skel: 'gen2', kind: 'idle' },
  { name: 'walk_c', file: 'AS_ShortWalkingG3', skel: 'gen3', kind: 'walk' },
  { name: 'walk_c2', file: 'AS_childWalkingR02_G3', skel: 'gen3', kind: 'walk' },
  { name: 'joy_c', file: 'AS_childJoyFul_G3', skel: 'gen3', kind: 'walk' },
  { name: 'turnL_c', file: 'AS_cturnL02revG3', skel: 'gen3', kind: 'turnL' },
  { name: 'turnR_c', file: 'AS_cturnR03G3', skel: 'gen3', kind: 'turnR' },
  { name: 'idle_c', file: 'AS_idleAXz03_G3', skel: 'gen3', kind: 'idle' },
  // 100STYLE retargets (tools/assets/retarget_bvh.mjs, CC-BY 4.0)
  ...fs.readdirSync(ANIM).filter((f) => /^S100_.*.anim.json$/.test(f)).map((f) => { const n = f.replace('.anim.json', ''); return { name: n.replace(/^S100_/, 's_'), file: n, skel: 'gen2', kind: /_idle/.test(n) ? 'idle' : 'walk' }; }),
];

// ---- tiny math
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
const qnorm = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };

function fk(skel, local) {
  // local: per bone { t, r } -> global positions
  const n = skel.bones.length, G = new Array(n);
  for (let b = 0; b < n; b++) {
    const p = skel.parents[b];
    const L = local[b];
    if (p < 0) G[b] = { t: L.t.slice(), r: L.r.slice() };
    else { const P = G[p]; G[b] = { t: qrot(P.r, L.t).map((v, i) => v + P.t[i]), r: qnorm(qmul(P.r, L.r)) }; }
  }
  return G;
}

const bySkel = {};
const index = [];
for (const c of CLIPS) {
  const f = path.join(ANIM, c.file + '.anim.json');
  if (!fs.existsSync(f)) { console.warn('missing', c.file); continue; }
  const a = JSON.parse(fs.readFileSync(f, 'utf8'));
  const skel = manifest.skeletons[c.skel];
  const nb = skel.bones.length;
  const byName = new Map(a.tracks.map((t) => [t.bone, t]));
  let frames = a.numFrames;
  // loop seam: a cycle whose last frame repeats the first plays a double frame every loop
  const same = (i, j) => a.tracks.every((t) => !t.r || !t.r[i] || !t.r[j] || Math.abs(t.r[i].reduce((s, v, k) => s + v * t.r[j][k], 0)) > 0.99995);
  const loopDup = frames > 2 && same(0, frames - 1);
  if (loopDup) frames -= 1;
  const data = new Float32Array(frames * nb * 8);
  let missing = 0;
  for (let fi = 0; fi < frames; fi++) for (let b = 0; b < nb; b++) {
    const t = byName.get(skel.bones[b]);
    const o = (fi * nb + b) * 8;
    if (!t || !t.r || !t.r.length) { missing += fi === 0 ? 1 : 0; continue; }   // valid = 0 -> reference pose
    const r = t.r[Math.min(fi, t.r.length - 1)], tr = t.t && t.t.length ? t.t[Math.min(fi, t.t.length - 1)] : [0, 0, 0];
    data[o] = r[0]; data[o + 1] = r[1]; data[o + 2] = r[2]; data[o + 3] = r[3];
    data[o + 4] = tr[0]; data[o + 5] = tr[1]; data[o + 6] = tr[2]; data[o + 7] = 1;
  }
  // ground speed + facing from the stance foot on the reference body (clip rotations, body translations except hips)
  const refBody = Object.values(manifest.bodies).find((B) => B.skeleton === c.skel && B.height > 1.5) || Object.values(manifest.bodies).find((B) => B.skeleton === c.skel);
  const hipsI = skel.bones.findIndex((n) => /hips/i.test(n));
  const footI = ['L', 'R'].map((s) => skel.bones.findIndex((n) => new RegExp(`foot__${s}$`).test(n)));
  const hipsScale = refBody ? Math.hypot(...refBody.refT.slice(hipsI * 3, hipsI * 3 + 3)) / Math.max(1e-3, Math.hypot(...Array.from(data.slice(hipsI * 8 + 4, hipsI * 8 + 7)))) : 1;
  const feet = [];
  for (let fi = 0; fi < frames; fi++) {
    const local = [];
    for (let b = 0; b < nb; b++) {
      const o = (fi * nb + b) * 8;
      const valid = data[o + 7] > 0.5;
      const r = valid ? [data[o], data[o + 1], data[o + 2], data[o + 3]] : refBody.refR.slice(b * 4, b * 4 + 4);
      let t = refBody.refT.slice(b * 3, b * 3 + 3);
      if (b === hipsI && valid) t = [data[o + 4] * hipsScale, data[o + 5] * hipsScale, data[o + 6] * hipsScale];
      local.push({ t, r });
    }
    const G = fk(skel, local);
    feet.push(footI.map((k) => (k >= 0 ? G[k].t : null)));
  }
  let speed = 0, fwd = null;
  if (c.kind === 'walk' || c.kind === 'run') {
    const dt = 1 / a.fps;
    const vs = [];
    for (let fi = 0; fi < frames; fi++) {
      const f1 = (fi + 1) % frames;
      // the lower foot is planted
      const k = feet[fi][0][1] < feet[fi][1][1] ? 0 : 1;
      const p0 = feet[fi][k], p1 = feet[f1][k];
      const minY = Math.min(feet[fi][0][1], feet[fi][1][1]);
      if (p0[1] - minY > 0.02) continue;
      vs.push([(p1[0] - p0[0]) / dt, (p1[2] - p0[2]) / dt]);
    }
    if (vs.length) {
      const mx = vs.reduce((s, v) => s + v[0], 0) / vs.length, mz = vs.reduce((s, v) => s + v[1], 0) / vs.length;
      speed = Math.hypot(mx, mz);
      fwd = [-mx / (speed || 1), -mz / (speed || 1)];   // the planted foot slides BACKWARD relative to the body
    }
  }
  let hipsH = 0;
  for (let fi = 0; fi < frames; fi++) { const o = (fi * nb + hipsI) * 8; hipsH += Math.hypot(data[o + 4], data[o + 5], data[o + 6]); }
  hipsH /= Math.max(1, frames);
  // CARLA's "Girl" GEN2 clips are authored on the CHILD proportions (hips ~0.6 m): they are child clips
  const age = c.skel === 'gen3' || hipsH < 0.8 ? 'child' : 'adult';
  const S = bySkel[c.skel] || (bySkel[c.skel] = { chunks: [], rows: 0 });
  index.push({ name: c.name, skeleton: c.skel, kind: c.kind, age, hipsH: +hipsH.toFixed(4), frames, fps: +a.fps.toFixed(4), row: S.rows, loop: true, loopDup, speed: +speed.toFixed(3), fwd: fwd && fwd.map((v) => +v.toFixed(3)), src: c.file, missingBones: missing });
  S.chunks.push(data);
  S.rows += frames;
  console.log(`${c.name.padEnd(9)} ${c.skel} ${age.padEnd(5)} hips ${hipsH.toFixed(3)} ${String(frames).padStart(4)} f @ ${a.fps.toFixed(2)} fps${loopDup ? ' (seam dup dropped)' : ''}  speed ${speed.toFixed(2)} m/s  fwd ${fwd ? fwd.map((v) => v.toFixed(2)).join(',') : '-'}  missing ${missing}`);
}
for (const [k, S] of Object.entries(bySkel)) {
  const total = S.chunks.reduce((s, c) => s + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of S.chunks) { all.set(c, o); o += c.length; }
  fs.writeFileSync(path.join(OUT, `clips_${k}.bin`), Buffer.from(all.buffer));
  console.log(`clips_${k}.bin: ${S.rows} frame rows x ${manifest.skeletons[k].bones.length} bones, ${(all.byteLength / 1048576).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(OUT, 'clips.json'), JSON.stringify({ texelsPerBone: 2, clips: index }, null, 1));
