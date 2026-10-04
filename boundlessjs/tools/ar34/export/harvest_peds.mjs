// BX-PEDS (AR34 BX, 2026-10-02): the crowd's walkers read back from the page every frame of a take, for usd_peds.py and
// blender_peds.py (docs/notes/ar34-bx-peds.md). A harvest.mjs hook (HOOKS list, `--nopeds` skips it).
//
// The web crowd (src/sim/crowd.js) skins on the GPU: each frame its update() gives every walker in view (and every walker in
// the near shadow cascade) a POSE ROW, the pose pass writes that row's skinning matrices (joint global x inverse bind, 3x4,
// three RGBA32F targets uPose0-2), and the draw sets (per body and LOD, main and shadow) carry the instance matrix (the sim's
// position and yaw, the body's height scale) and the row. This hook reads, after each stepped frame:
//   - the pose targets' rows in use (readRenderTargetPixels, one per target), per skeleton (gen2 66 joints, gen3 26);
//   - every drawn walker of the main sets (slot from the set's own source table) and of the shadow sets (slot from its
//     position in the storage mesh), with its instance data row (clip state, prop mask, near fade, slot layers, tints).
// Per frame it posts peds/<shot>/f<iii>.bin: per walker a header of HW = 48 floats
//   [0 slot, 1 seed (the walker's identity: crowd.js keys tints by it), 2 variant, 3 lod, 4 in view, 5 shadow caster,
//    6 near fade (NF31), 7 prop mask, 8-23 instance matrix (column-major), 24-35 tints (top, bottom, shoes: rgb + weight),
//    36 clip A, 37 time A (frames), 38 clip B, 39 time B, 40 weight of B, 41 pose row, 42 joints, 43 skeleton (0 gen2,
//    1 gen3), 44 seated pose id, 45 body index, 46 distance to the lens (m), 47 0]
// followed by joints x 12 floats (the skinning matrix rows r0, r1, r2 of each joint, as the vertex shader reads them).
// At the end (before the textures) it posts the bodies that were drawn: peds/geo/<body>_l<lod>_<opaque|hair>.bin (position 3,
// normal 3, uv 2, skinIndex 4, skinWeight 4, aMeta 3 as float32, then the uint32 index), and writes peds/assets.json (the
// skeletons' joints and parents, each body's reference pose and inverse bind matrices, slot table, the variants) and
// peds_<shot>.json (per frame the walker count and the file).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const HW = 48;

function installPeds() {
  if (window.__BXP) return 'present';
  const HW = 48;   // (the page's copy of the header size)
  const lib = window.__EXP && window.__EXP.lib;
  if (!lib) return 'no exporter';
  const C = () => window.__CROWD;
  // THE POSE ON THE CPU: crowd.js POSE_FS evaluated in topological order from the same inputs the pass reads (the walker's
  // instance-data row: both clips' rows, frames, times and blend weight, the body, the hips scales, the seated arm rows and
  // key weights, the gaze; the clip data; the body table: reference pose and inverse bind rows; the arm rows). All of it is
  // CPU state written by the same update() as the draw sets, so it is consistent whatever the GPU targets hold when read.
  const qmul = (a, b) => [a[3] * b[0] + b[3] * a[0] + (a[1] * b[2] - a[2] * b[1]), a[3] * b[1] + b[3] * a[1] + (a[2] * b[0] - a[0] * b[2]), a[3] * b[2] + b[3] * a[2] + (a[0] * b[1] - a[1] * b[0]), a[3] * b[3] - (a[0] * b[0] + a[1] * b[1] + a[2] * b[2])];
  const qrot = (q, v) => { const cx = q[1] * v[2] - q[2] * v[1] + q[3] * v[0], cy = q[2] * v[0] - q[0] * v[2] + q[3] * v[1], cz = q[0] * v[1] - q[1] * v[0] + q[3] * v[2];
    return [v[0] + 2 * (q[1] * cz - q[2] * cy), v[1] + 2 * (q[2] * cx - q[0] * cz), v[2] + 2 * (q[0] * cy - q[1] * cx)]; };
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };
  const nl = (a, b, t) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], k = d < 0 ? -1 : 1;
    return nrm([a[0] * (1 - t) + b[0] * k * t, a[1] * (1 - t) + b[1] * k * t, a[2] * (1 - t) + b[2] * k * t, a[3] * (1 - t) + b[3] * k * t]); };
  const gmod = (x, y) => x - y * Math.floor(x / y);
  const cpuPose = (P, row, out, o) => {
    const S = P.S, nb = S.nb, CD = S.clipData, BD = S.bodyTex.image.data, d = P.instData, q = row * 12 * 4;
    const U = P.mat.uniforms, par = U.uParent.value, armSlot = U.uArmSlot.value, hips = U.uHips.value;
    const AD = P.armData, aw = P.armTex.image.width;
    const iA = [d[q], d[q + 1], d[q + 2], d[q + 3]], iB = [d[q + 4], d[q + 5], d[q + 6], d[q + 7]], iC = [d[q + 8], d[q + 9]];
    const iD = [d[q + 40], d[q + 41], d[q + 42], d[q + 43]], iE = [d[q + 44], d[q + 45]];
    const armA = Math.floor(iD[0] + 0.5) - 1, armB = Math.floor(iD[1] + 0.5) - 1, body = Math.floor(iB[3] + 0.5);
    const clipAt = (c0, c1, c2, b) => {
      const f = Math.floor(c2), a = c2 - f;
      const r0 = Math.floor(c0 + gmod(f, c1) + 0.5), r1 = Math.floor(c0 + gmod(f + 1, c1) + 0.5);
      const i0 = (r0 * nb + b) * 8, i1 = (r1 * nb + b) * 8;
      const ok = CD[i0 + 7];
      const qq = ok > 0.5 ? nl([CD[i0], CD[i0 + 1], CD[i0 + 2], CD[i0 + 3]], [CD[i1], CD[i1 + 1], CD[i1 + 2], CD[i1 + 3]], a) : [0, 0, 0, 1];
      return [qq, [CD[i0 + 4] * (1 - a) + CD[i1 + 4] * a, CD[i0 + 5] * (1 - a) + CD[i1 + 5] * a, CD[i0 + 6] * (1 - a) + CD[i1 + 6] * a], ok];
    };
    const arm = (sl, r) => { const i = (r * aw + sl) * 4; return [AD[i], AD[i + 1], AD[i + 2], AD[i + 3]]; };
    const GQ = new Array(nb), GT = new Array(nb);
    for (let b = 0; b < nb; b++) {
      const p = par[b], gq = p >= 0 ? GQ[p] : [0, 0, 0, 1], gt = p >= 0 ? GT[p] : [0, 0, 0];
      const [qa, ta, va] = clipAt(iA[0], iA[1], iA[2], b), [qb, tb, vb] = clipAt(iB[0], iB[1], iB[2], b);
      const bo = (body * nb * 5 + b * 5) * 4;
      const rT = [BD[bo], BD[bo + 1], BD[bo + 2]], rR = [BD[bo + 4], BD[bo + 5], BD[bo + 6], BD[bo + 7]];
      let la = va > 0.5 ? qa : rR, lb = vb > 0.5 ? qb : rR;
      const sl = armSlot[b];
      if (sl >= 0) {
        if (armA >= 0) { const ov = arm(sl, armA); if (iD[2] >= 0) { const ov1 = arm(sl, armA + 1); la = nl(ov[3] < 1.5 ? ov : la, ov1[3] < 1.5 ? ov1 : la, iD[2]); } else if (ov[3] < 1.5) la = ov; }
        if (armB >= 0) { const ov = arm(sl, armB); if (iD[3] >= 0) { const ov1 = arm(sl, armB + 1); lb = nl(ov[3] < 1.5 ? ov : lb, ov1[3] < 1.5 ? ov1 : lb, iD[3]); } else if (ov[3] < 1.5) lb = ov; }
      }
      let lq = nl(la, lb, iA[3]);
      if (sl >= 8 && (iE[0] !== 0 || iE[1] !== 0)) {
        const gy = iE[0] * (sl === 8 ? 0.2 : sl === 9 ? 0.35 : 0.45), gp = iE[1] * (sl === 8 ? 0 : sl === 9 ? 0.4 : 0.6);
        const R = qmul([0, Math.sin(0.5 * gy), 0, Math.cos(0.5 * gy)], [Math.sin(-0.5 * gp), 0, 0, Math.cos(-0.5 * gp)]);
        lq = nrm(qmul(qmul([-gq[0], -gq[1], -gq[2], gq[3]], R), qmul(gq, lq)));
      }
      let lt = rT;
      if (b === hips) {
        const ha = va > 0.5 ? [ta[0] * iC[0], ta[1] * iC[0], ta[2] * iC[0]] : rT, hb = vb > 0.5 ? [tb[0] * iC[1], tb[1] * iC[1], tb[2] * iC[1]] : ha;
        lt = [ha[0] * (1 - iA[3]) + hb[0] * iA[3], ha[1] * (1 - iA[3]) + hb[1] * iA[3], ha[2] * (1 - iA[3]) + hb[2] * iA[3]];
      }
      const rt = qrot(gq, lt);
      GT[b] = [gt[0] + rt[0], gt[1] + rt[1], gt[2] + rt[2]];
      GQ[b] = nrm(qmul(gq, lq));
      // skinning matrix S = G x IBM, rows 0..2 (as the pass writes uPose0-2)
      const g = GQ[b], cx = qrot(g, [1, 0, 0]), cy = qrot(g, [0, 1, 0]), cz = qrot(g, [0, 0, 1]), T = GT[b];
      for (let i = 0; i < 3; i++) {
        const R0 = cx[i], R1 = cy[i], R2 = cz[i];
        for (let j = 0; j < 4; j++) out[o + b * 12 + i * 4 + j] = R0 * BD[bo + 8 + j] + R1 * BD[bo + 12 + j] + R2 * BD[bo + 16 + j] + (j === 3 ? T[i] : 0);
      }
    }
  };
  const read = async ({ name, check }) => {
    const t0 = performance.now();
    const c = C();
    if (!c || !c.passes) return { n: 0, err: 'no crowd' };
    const r = c.engine.renderer, st = c.st;
    const skelIdx = {};
    Object.keys(c.passes).forEach((k, j) => { skelIdx[k] = k === 'gen2' ? 0 : k === 'gen3' ? 1 : 2 + j; });
    const pose = {};
    for (const [k, P] of Object.entries(c.passes)) {
      if (!P.rows) continue;
      const nb = P.S.nb, rows = P.rows;
      // the GPU targets only on check frames (the CPU solver is the source; see cpuPose)
      const bufs = check ? [0, 1, 2].map((ti) => { const b = new Float32Array(nb * rows * 4); r.readRenderTargetPixels(P.rt, 0, 0, nb, rows, b, undefined, ti); return b; }) : null;
      pose[k] = { bufs, nb, rows, P };
    }
    // the shadow sets do not record their walker's slot: the storage mesh's position finds it (the draw matrix copies x, z)
    const Ms = c.mesh.instanceMatrix.array, n = c.mesh.count;
    let posSlot = null;
    const cam = c.engine.camera.position;
    const recs = new Map();   // slot -> record
    const add = (slot, row, li, M, vis, bn) => {
      let e = recs.get(slot);
      if (e) { if (vis) { e.vis = 1; e.li = li; } else e.shv = 1; return; }
      recs.set(slot, { slot, row, li, M: Array.from(M), vis: vis ? 1 : 0, shv: vis ? 0 : 1, bn });
    };
    for (const [bn, sets] of c.sets) {
      for (let li = 0; li < 3; li++) {
        const x = sets.main[li];
        for (let k = 0; k < x.k; k++) add(x.src[k], x.attrs.aRow.array[k], li, x.im.array.subarray(k * 16, k * 16 + 16), true, bn);
      }
    }
    for (const [bn, sets] of c.sets) {
      for (let li = 0; li < 3; li++) {
        const y = sets.shadow[li];
        if (!y.k) continue;
        if (!posSlot) { posSlot = new Map(); for (let s = 0; s < n; s++) posSlot.set(Ms[s * 16 + 12] + ',' + Ms[s * 16 + 14], s); }
        for (let k = 0; k < y.k; k++) {
          const M = y.im.array.subarray(k * 16, k * 16 + 16), slot = posSlot.get(M[12] + ',' + M[14]);
          if (slot === undefined) continue;
          add(slot, y.attrs.aRow.array[k], li, M, false, bn);
        }
      }
    }
    // one buffer: per walker HW header floats + joints x 12
    let total = 0;
    const list = [];
    for (const e of recs.values()) {
      const B = c.A.bodies[e.bn], pk = pose[B.skeleton];
      if (!pk || e.row >= pk.rows) continue;
      e.B = B; e.pk = pk;
      list.push(e);
      total += HW + pk.nb * 12;
    }
    const out = new Float32Array(total);
    let o = 0;
    const bodies = new Set();
    let nv = 0, ns = 0;
    const chk = { rows: 0, empty: 0, max: 0 };
    for (const e of list) {
      const { B, pk } = e, d = pk.P.instData, q = e.row * 12 * 4, s = e.slot;
      out[o] = s; out[o + 1] = st.seed[s]; out[o + 2] = st.variant[s]; out[o + 3] = e.li; out[o + 4] = e.vis; out[o + 5] = e.shv;
      out[o + 6] = d[q + 11]; out[o + 7] = d[q + 10];
      for (let j = 0; j < 16; j++) out[o + 8 + j] = e.M[j];
      for (let j = 0; j < 12; j++) out[o + 24 + j] = d[q + 28 + j];
      out[o + 36] = st.clipA[s]; out[o + 37] = d[q + 2]; out[o + 38] = st.clipB[s]; out[o + 39] = d[q + 6]; out[o + 40] = d[q + 3];
      out[o + 41] = e.row; out[o + 42] = pk.nb; out[o + 43] = skelIdx[B.skeleton]; out[o + 44] = st.pose[s] || 0; out[o + 45] = B.index;
      out[o + 46] = Math.hypot(e.M[12] - cam.x, e.M[13] + 0.9 - cam.y, e.M[14] - cam.z);
      o += HW;
      const nb = pk.nb;
      cpuPose(pk.P, e.row, out, o);
      if (pk.bufs) {   // check frame: the GPU's rows against the CPU's (rows the GPU left empty are counted, not compared)
        const [b0, b1, b2] = pk.bufs, r0 = e.row * nb * 4;
        let any = false, dmax = 0;
        for (let b = 0; b < nb; b++) {
          const t = r0 + b * 4, g = [b0[t], b0[t + 1], b0[t + 2], b0[t + 3], b1[t], b1[t + 1], b1[t + 2], b1[t + 3], b2[t], b2[t + 1], b2[t + 2], b2[t + 3]];
          for (let j = 0; j < 12; j++) { if (g[j] !== 0) any = true; dmax = Math.max(dmax, Math.abs(g[j] - out[o + b * 12 + j])); }
        }
        if (any) { chk.rows++; chk.max = Math.max(chk.max, dmax); } else chk.empty++;
      }
      o += nb * 12;
      bodies.add(e.bn);
      if (e.vis) nv++; else ns++;
    }
    const file = name;
    await lib.post(file, out.buffer);
    return { ms: +(performance.now() - t0).toFixed(1), check: check ? chk : null, n: list.length, vis: nv, shadowOnly: ns, rows: Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, v.rows])), bodies: [...bodies], file, floats: total };
  };
  // the drawn bodies' geometry (as the crowd loaded it: world-baked, float attributes) and the tables usd_peds.py needs
  const assets = async ({ bodies }) => {
    const c = C();
    if (!c) return null;
    const A = c.A;
    const out = { skel: {}, bodies: {}, clips: {}, variants: A.variants.map((v) => ({ name: v.name, body: v.body, set: v.set || null, scale: v.scale || 1, layers: v.layers, uniform: v.uniform || null, gender: v.gender || null, age: v.age || null, build: v.build || null, tone: v.tone || null })) };
    for (const [k, S] of Object.entries(A.skel)) {
      out.skel[k] = { bones: S.bones, parents: S.parents, hips: S.hips, nb: S.nb };
      out.clips[k] = S.clips.map((cl) => ({ name: cl.name, kind: cl.kind, frames: cl.frames, fps: cl.fps, loop: !!cl.loop, sitPose: cl.sitPose || 0 }));
    }
    const comp = (at) => {
      if (!at.isInterleavedBufferAttribute && !at.normalized && at.array.length === at.count * at.itemSize) return Float32Array.from(at.array);
      const a = new Float32Array(at.count * at.itemSize);
      for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) a[i * at.itemSize + k] = at.getComponent(i, k);
      return a;
    };
    for (const bn of bodies) {
      const B = A.bodies[bn];
      if (!B) continue;
      const e = { skeleton: B.skeleton, set: B.set || null, index: B.index, height: B.height, hipsH: B.hipsH, refT: Array.from(B.refT), refR: Array.from(B.refR), ibm: Array.from(B.ibm), slots: B.slots || null, props: B.props || null, lods: [] };
      for (let li = 0; li < 3; li++) {
        const L = {};
        for (const [kind, g] of Object.entries(B.lods[li] || {})) {
          const layout = [], chunks = [];
          let off = 0;
          for (const a of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aMeta']) {
            const at = g.getAttribute(a);
            if (!at) continue;
            const arr = comp(at);
            layout.push({ name: a, size: at.itemSize, count: at.count, off });
            chunks.push(arr); off += arr.byteLength;
          }
          const idx = g.index ? Uint32Array.from(g.index.array) : null;
          if (idx) { layout.push({ name: 'index', size: 1, count: idx.length, off, type: 'uint32' }); chunks.push(idx); off += idx.byteLength; }
          const buf = new Uint8Array(off);
          let p = 0;
          for (const ch of chunks) { buf.set(new Uint8Array(ch.buffer, ch.byteOffset, ch.byteLength), p); p += ch.byteLength; }
          const file = `peds/geo/${bn}_l${li}_${kind}.bin`;
          await lib.post(file, buf.buffer);
          L[kind] = { file, layout, verts: g.getAttribute('position').count, tris: idx ? idx.length / 3 : 0 };
        }
        e.lods.push(L);
      }
      out.bodies[bn] = e;
    }
    return out;
  };
  window.__BXP = { read, assets };
  return 'installed';
}

const S = { shots: {}, bodies: new Set(), on: true, failed: null, ms: 0, n: 0 };
// A failure in any phase is logged ONCE and turns the reader off for the rest of the harvest: the other tracks' harvests run
// this hook too (it is in the default HOOKS list) and must never be broken or slowed by it. --nopeds skips it entirely.
const guard = (name, fn) => async (ctx, ...a) => {
  if (!S.on) return null;
  try { return await fn(ctx, ...a); }
  catch (e) {
    S.on = false; S.failed = `${name}: ${String(e?.message || e).slice(0, 300)}`;
    ctx.log(`BX-PEDS: ${S.failed} -- walkers off for the rest of this harvest (the harvest goes on)`);
    return null;
  }
};

export default {
  boot: guard('boot', async (ctx) => {
    if (ctx.has('nopeds')) { S.on = false; ctx.log('BX-PEDS: --nopeds, walkers not read'); return; }
    await fs.mkdir(path.join(ctx.outDir, 'peds', 'geo'), { recursive: true });
    const r = await ctx.page.evaluate(installPeds);
    if (r !== 'installed' && r !== 'present') throw new Error('reader not installed: ' + r);
    ctx.log(`BX-PEDS: walkers reader ${r}`);
  }),
  shotReady: guard('shotReady', async (ctx, shot) => {
    await fs.mkdir(path.join(ctx.outDir, 'peds', shot), { recursive: true });
    S.shots[shot] = { frames: [], t0: Date.now() };
  }),
  frame: guard('frame', async (ctx, shot, i) => {
    if (!S.shots[shot]) return;
    if (ctx.has('peds-failtest') && i === 3) throw new Error('--peds-failtest at frame 3');   // the guard's own test
    const t0 = Date.now();
    const r = await ctx.page.evaluate((a) => window.__BXP.read(a), { name: `peds/${shot}/f${String(i).padStart(3, '0')}.bin`, check: i % 27 === 0 });
    if (r.err) throw new Error(r.err);
    for (const b of r.bodies || []) S.bodies.add(b);
    const ms = Date.now() - t0;
    S.ms += ms; S.n++;
    S.shots[shot].frames.push({ i, n: r.n, vis: r.vis, shadowOnly: r.shadowOnly, rows: r.rows, file: r.file, floats: r.floats, ms, check: r.check || undefined });
    // --pedsweb [frames]: the page's own picture of this frame (its accumulation converged without a sim step), so the
    // Cycles frame can be judged against the very walkers that were exported (the web takes may predate later sim changes)
    const pw = ctx.opt('pedsweb');
    if (pw !== null) {
      const want = pw === '1' ? [0, 54, 107] : pw.split(',').map(Number);
      if (want.includes(i)) {
        const acc = Number(ctx.opt('pedswebacc', '63'));
        await ctx.page.evaluate((n) => { for (let k = 0; k < n; k++) window.__ENGINE.frameBody(); }, acc);
        await ctx.page.screenshot({ path: path.join(ctx.outDir, 'peds', `${shot}_web_f${String(i).padStart(3, '0')}.png`) });
      }
    }
    if (i % 27 === 0) ctx.log(`BX-PEDS ${shot} f${i}: ${r.n} walkers (${r.vis} in view, ${r.shadowOnly} shadow only), rows ${JSON.stringify(r.rows)}, ${ms} ms (page ${r.ms}); GPU rows vs CPU ${JSON.stringify(r.check)}`);
  }),
  shotDone: guard('shotDone', async (ctx, shot) => {
    if (!S.shots[shot]) return;
    const R = S.shots[shot];
    await ctx.writeJSON(`peds_${shot}.json`, { shot, hw: HW, fps: ctx.FPS, frames: R.frames, secs: +((Date.now() - R.t0) / 1000).toFixed(1) });
  }),
  end: async (ctx) => {
    const sum = { on: S.on, failed: S.failed, frames: S.n, msPerFrame: S.n ? +(S.ms / S.n).toFixed(1) : null };
    if (!S.on) { if (S.failed) ctx.log(`BX-PEDS: off (${S.failed})`); return sum; }
    try {
      const t0 = Date.now();
      const A = await ctx.page.evaluate((a) => window.__BXP.assets(a), { bodies: [...S.bodies] });
      if (A) await ctx.writeJSON('peds/assets.json', A);
      Object.assign(sum, { bodies: S.bodies.size, shots: Object.fromEntries(Object.entries(S.shots).map(([k, v]) => [k, { frames: v.frames.length, maxWalkers: Math.max(0, ...v.frames.map((f) => f.n || 0)) }])), assetsSecs: +((Date.now() - t0) / 1000).toFixed(1) });
    } catch (e) { sum.failed = 'end: ' + String(e?.message || e).slice(0, 300); }
    ctx.log(`BX-PEDS: ${JSON.stringify(sum)}`);
    return sum;
  },
};
