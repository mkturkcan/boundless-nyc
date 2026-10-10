// AR33 custom builders and sign marks, segment bid4: Lenox Avenue to Fifth Avenue. Specs name them as 'bid4:<fn>' (docs/notes/ar33-spec.md).
// Owner: the BID4 worker (docs/notes/ar33-bid4.md).
// Sign marks are drawers fn(ctx2d, w, h) that paint a mark into a transparent canvas (fk/signKit.js, `logo`); every mark
// here is drawn from scratch to read like the shop's real sign.

import * as THREE from 'three';
import { kitMat } from '../kitMats.js';
import { applyLightTrim } from '../../../world/materials.js';

// ------------------------------------------------------------------ small canvas helpers
const cl = (ctx) => { ctx.save(); return ctx; };
function disc(ctx, cx, cy, r, fill) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// AT&T: the globe (a cobalt sphere cut by fine white latitude curves), square at the left of the sign
export function att(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h), cx = s / 2, cy = h / 2, r = s * 0.46;
  disc(ctx, cx, cy, r, '#0a9bd8');
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.045);
  for (let k = -5; k <= 5; k++) {
    const y = cy + (k / 5.6) * r;
    ctx.beginPath(); ctx.ellipse(cx, y, r * 1.05, r * 0.16 * (1 - Math.abs(k) / 7), 0, 0, Math.PI * 2); ctx.stroke();
  }
  // the lit half (a soft highlight)
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, h);
  ctx.restore();
  ctx.restore();
}

// Juici Patties: the round emblem, an orange patty with a red script word on a cream ground
export function juici(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h), cx = w / 2, cy = h / 2, r = s * 0.47;
  disc(ctx, cx, cy, r, '#f4c430');
  disc(ctx, cx, cy, r * 0.86, '#fbf0d0');
  disc(ctx, cx, cy, r * 0.66, '#e8872a');
  ctx.fillStyle = '#b8191f'; ctx.font = `italic 700 ${Math.round(r * 0.52)}px "ar33 Pacifico", cursive`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Juici', cx, cy - r * 0.08);
  ctx.font = `700 ${Math.round(r * 0.2)}px "ar33 Montserrat", sans-serif`;
  ctx.fillText('PATTIES', cx, cy + r * 0.32);
  ctx.restore();
}

// CityMD: the square of red tiles (two by two with the notch) before the word, drawn as the mark of the clinic's sign
export function citymd(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h) * 0.8, x0 = (w - s) / 2, y0 = (h - s) / 2, c = s / 3;
  ctx.fillStyle = '#d6242b';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1) continue;
    rr(ctx, x0 + i * c + c * 0.06, y0 + j * c + c * 0.06, c * 0.88, c * 0.88, c * 0.14); ctx.fill();
  }
  ctx.restore();
}

// Chipotle: the rounded field with the pepper glyph (the sign is a white-on-red lozenge)
export function chipotle(ctx, w, h) {
  cl(ctx);
  ctx.fillStyle = '#ffffff';
  const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.45);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.5, cx + s * 0.55, cy + s * 0.1, cx + s * 0.05, cy + s * 0.5);
  ctx.bezierCurveTo(cx - s * 0.3, cy + s * 0.3, cx - s * 0.5, cy - s * 0.1, cx - s * 0.1, cy - s * 0.45);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#b81d24'; ctx.lineWidth = s * 0.07; ctx.beginPath();
  ctx.arc(cx - s * 0.02, cy + s * 0.02, s * 0.2, 0.3, 4.2); ctx.stroke();
  ctx.restore();
}

// Nike's swoosh (the chrome piece on the silver band of 5-15 W): a polished-steel curve, a dark seam under it so it reads on the light panel
export function swoosh(ctx, w, h) {
  cl(ctx);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(w * 0.02, h * 0.40);
    ctx.bezierCurveTo(w * 0.26, h * 0.96, w * 0.62, h * 0.74, w * 0.98, h * 0.05);
    ctx.bezierCurveTo(w * 0.62, h * 0.52, w * 0.30, h * 0.66, w * 0.02, h * 0.40);
    ctx.closePath();
  };
  ctx.save(); ctx.translate(w * 0.006, h * 0.045); path(); ctx.fillStyle = 'rgba(40,44,48,0.55)'; ctx.fill(); ctx.restore();
  const g = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.95);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#f2f4f5'); g.addColorStop(1, '#c9ced1');
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, h * 0.012); ctx.strokeStyle = 'rgba(70,76,82,0.7)'; ctx.stroke();
  ctx.restore();
}

// Chase: the octagon mark (four blue wedges round a square hole)
export function chase(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h) * 0.9, cx = w / 2, cy = h / 2, r = s / 2;
  ctx.fillStyle = '#117aca';
  const pt = (a, rad) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  for (let q = 0; q < 4; q++) {
    const a0 = (q * Math.PI) / 2 - Math.PI / 4;
    const p1 = pt(a0 + Math.PI / 8, r), p2 = pt(a0 + (3 * Math.PI) / 8, r), p3 = pt(a0 + Math.PI / 2 + Math.PI / 4, r * 0.3), p4 = pt(a0 + Math.PI / 4, r * 0.3);
    ctx.beginPath(); ctx.moveTo(p4[0], p4[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Carver Federal Savings Bank: a teal "X" of four chevrons
export function carver(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h) * 0.8, cx = w / 2, cy = h / 2;
  ctx.fillStyle = '#2bb5b8';
  for (let q = 0; q < 4; q++) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((q * Math.PI) / 2);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.08); ctx.lineTo(s * 0.48, -s * 0.46); ctx.lineTo(s * 0.48, -s * 0.22); ctx.lineTo(s * 0.14, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// H&R Block: the green square before the word
export function hrblock(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h) * 0.78;
  ctx.fillStyle = '#7ac143'; rr(ctx, (w - s) / 2, (h - s) / 2, s, s, s * 0.04); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ custom builders (run after the kit's faces: `with: 'kit'`)
// The window rectangles of a spec'd face, recomputed the way the kit lays them out (for passes that add to the openings).
export function openingsOf(spec, faceIdx = 0, L = 10) {
  const fs = spec.faces[faceIdx];
  const base = fs.base || {}, baseTop = (base.h ?? 4.2) + (base.fascia ? base.fascia.h ?? 1 : 0);
  const out = [];
  let y = baseTop;
  const bs = fs.bays;
  let bays;
  if (bs && Array.isArray(bs.widths)) { bays = []; let u = 0; for (const w of bs.widths) { bays.push([u, u + w]); u += w; } }
  else if (bs) { const [ml, mr] = bs.margin || [0.6, 0.6]; const n = bs.n || 1; const w = (L - ml - mr) / n; bays = Array.from({ length: n }, (_, j) => [ml + j * w, ml + (j + 1) * w]); }
  else bays = [];
  let f = 0;
  for (const fl of fs.floors || []) {
    for (let r = 0; r < (fl.n ?? 1); r++) {
      if (Array.isArray(fl.open)) {
        for (const op of fl.open) {
          const o2 = Array.isArray(op) ? { u0: op[0], u1: op[1], win: op[2] } : op;
          const T2 = (fs.windows || {})[o2.win] || {};
          const ya = y + +(o2.sill ?? T2.sill ?? 0.8), yb = Math.min(y + fl.h - 0.05, ya + +(o2.h ?? T2.h ?? 1.7));
          out.push({ u0: +o2.u0, u1: +o2.u1, y0: ya, y1: yb, floor: f, bay: -1, T: T2 });
        }
        y += fl.h; f++;
        continue;
      }
      const T = (fs.windows || {})[fl.win];
      if (T && fl.win !== 'none') {
        bays.forEach(([a, c], j) => {
          if (fl.bays && !fl.bays.includes(j)) return;
          const ww = Math.min(T.w, c - a - 0.2), uc = (a + c) / 2 + (T.du || 0), ya = y + T.sill, yb = Math.min(y + fl.h - 0.2, ya + T.h);
          out.push({ u0: uc - ww / 2, u1: uc + ww / 2, y0: ya, y1: yb, floor: f, bay: j, T });
        });
      }
      y += fl.h; f++;
    }
  }
  return out;
}

// 35 W 125th: the full-height brick fins of the new building in red, cream and tan (u from the elevation, shots/ar34/bid4/elev/w125-35.jpg)
export function n35(group, ctx, spec, frame) {
  const kit = frame.kit, top = frame.h + 0.2, y0 = 4.4;   // b3: the base 3.9 + its 0.5 band (was 5.95)
  // b2r11: red (170,92,68), cream / tan (197,164,126) (overshot): a second step
  const strips = [
    [3.0, 3.4, 'brick_red', '#956d5c'],         // the narrow red fin
    [4.9, 6.1, 'brick_red', '#956d5c'],         // the wide red fin
    [13.4, 14.7, 'brick_buff', '#d1cbac'],      // cream
    [19.7, 21.1, 'brick_tan', '#a69580'],       // tan-brown
    [25.6, 26.9, 'brick_tan', '#a69580'],
    [31.4, 32.7, 'brick_buff', '#d1cbac'],      // batch 2: at u 31.4-32.7 against the compiled lot line in strip_N4 (was 29.3-30.5, over the last window column)
    [34.6, 36.4, 'brick_buff', '#d1cbac'],      // the cream end pier on the extended front, against 31 W
  ];
  for (const [u0, u1, mat, tint] of strips) {
    const m = kit.mat(mat, { tint, dirt: 0.25 });
    kit.box(m, u0, Math.min(frame.L - 0.05, u1), y0, top - 0.6, -0.01, 0.07, { c: 0.01 });
  }
}

// 56 W 125th: a light-grey panel beside every window of the charcoal part (a full-height strip 0.5 m wide on the right of each 2.53 m module), and the east wing
// (u > 22: white and grey panels, orange strips between the window groups, from 16.5 m up), all from the elevation (shots/ar34/bid4/elev/w125-56.jpg)
export function w56(group, ctx, spec, frame) {
  const kit = frame.kit, top = frame.h, y0 = 5.1;
  const white = kit.mat('concrete_board', { tint: '#d9dbdb', dirt: 0.2 });
  const orange = kit.mat('metal_painted', { tint: '#c9792c', dirt: 0.15 });
  const grey = kit.mat('concrete_board', { tint: '#8d9092', dirt: 0.2 });
  for (let k = 0; k < 9; k++) kit.box(grey, k * 2.53 + 1.72, k * 2.53 + 2.22, y0, top - 0.3, -0.005, 0.05, { c: 0.008 });
  // the east wing, white from 16.5 m up, with orange strips
  kit.box(white, 22.1, Math.min(frame.L, 37.9), 16.5, top - 0.3, -0.005, 0.06, { c: 0.008 });
  for (const c of [28.9, 31.95, 35.2]) kit.box(orange, c - 0.3, c + 0.3, 16.5, top - 0.3, 0.05, 0.1, { c: 0.006 });
}

// ------------------------------------------------------------------ round-headed windows
// A face with `arch: { win: 'B', mat, tint, ring: 0.28 }` has its window type B punched as a rectangle up to the arch top by the kit;
// this pass fills the two corners above the springline with wall (a fan of triangles), draws the archivolt, the keystone, the intrados,
// the frame's curved head and radial muntins.
function archOne(kit, o, cfg, wallM, stoneM, frameM) {
  const { u0, u1, y0, y1, T } = o;
  const r = (u1 - u0) / 2, uc = (u0 + u1) / 2, ys = y1 - r, rv = T.reveal ?? 0.18, N = 16;
  const ang = (k) => Math.PI - (Math.PI * k) / N;
  const P = (k, rad, w) => [uc + Math.cos(ang(k)) * rad, ys + Math.sin(ang(k)) * rad, w];
  const jc = (T.jamb ?? 0.015);
  // corner infill: the left corner (u0, y1) fanned over the quarter arc, and the right corner
  const left = [[u0 - jc, y1, 0], [u0 - jc, ys, 0]], right = [[u1 + jc, y1, 0], [u1 + jc, ys, 0]];
  for (let k = 0; k <= N / 2; k++) left.push(P(k, r, 0));
  for (let k = N; k >= N / 2; k--) right.push(P(k, r, 0));
  kit.poly(wallM, left, [0, 0, 1]);
  kit.poly(wallM, right, [0, 0, 1]);
  // intrados (the thickness of the wall seen inside the arch)
  for (let k = 0; k < N; k++) {
    const a = P(k, r, 0), b = P(k + 1, r, 0), c = P(k + 1, r, -rv), d = P(k, r, -rv);
    const am = (ang(k) + ang(k + 1)) / 2;
    kit.poly(wallM, [a, b, c, d], [-Math.cos(am), -Math.sin(am), 0]);
  }
  // archivolt: a stone ring proud of the wall
  const rt = cfg.ring ?? 0.28, pj = cfg.proj ?? 0.06;
  for (let k = 0; k < N; k++) {
    const a = P(k, r - 0.02, pj), b = P(k + 1, r - 0.02, pj), c = P(k + 1, r + rt, pj), d = P(k, r + rt, pj);
    kit.poly(stoneM, [a, b, c, d], [0, 0, 1], { near: false });
    // the outer edge of the ring (its thickness) and its soffit
    const e = P(k, r + rt, 0), f = P(k + 1, r + rt, 0), am = (ang(k) + ang(k + 1)) / 2;
    kit.poly(stoneM, [d, c, f, e], [Math.cos(am), Math.sin(am), 0]);
  }
  // keystone and springing blocks
  kit.box(stoneM, uc - 0.18, uc + 0.18, y1 - 0.12, y1 + rt + 0.22, -0.02, pj + 0.06, { c: 0.012 });
  for (const s of [-1, 1]) kit.box(stoneM, uc + s * (r + rt * 0.5) - 0.2, uc + s * (r + rt * 0.5) + 0.2, ys - 0.14, ys + 0.12, -0.02, pj + 0.05, { c: 0.01 });
  // the frame's curved head and three radial muntins, dark
  const fw = 0.055, z = -rv - 0.03;
  for (let k = 0; k < N; k++) {
    const a = P(k, r - 0.02, z), b = P(k + 1, r - 0.02, z), c = P(k + 1, r - 0.02 - fw, z), d = P(k, r - 0.02 - fw, z);
    kit.poly(frameM, [a, b, c, d], [0, 0, 1], { near: true });
  }
  for (const k of [N / 4, N / 2, (3 * N) / 4]) {
    const a = P(k, 0.02, z + 0.004), b = P(k, r - 0.04, z + 0.004), al = ang(k);
    const nx = -Math.sin(al) * 0.012, ny = Math.cos(al) * 0.012;
    kit.poly(frameM, [[a[0] - nx, a[1] - ny, a[2]], [b[0] - nx, b[1] - ny, b[2]], [b[0] + nx, b[1] + ny, b[2]], [a[0] + nx, a[1] + ny, a[2]]], [0, 0, 1], { near: true });
  }
  kit.box(frameM, u0 + 0.03, u1 - 0.03, ys - 0.02, ys + 0.03, z - 0.02, z + 0.02, { c: 0.004, near: true });
}
export function arches(group, ctx, spec, frame) {
  (spec.faces || []).forEach((fs, fi) => {
    if (!fs.arch) return;
    const Fc = fs.edge === undefined || fs.edge === 'front' ? { L: frame.L, kit: frame.kit } : frame.face(fs.edge);
    if (!Fc) return;
    const kit = Fc.kit, W = fs.wall || spec.wall || {};
    const wallM = kit.mat(W.mat || 'brick_red', { tint: W.tint, dirt: W.dirt ?? 0.35, bond: W.bond });
    const stoneM = kit.mat(fs.arch.mat || 'stone_lime', { tint: fs.arch.tint || '#e3ded0', dirt: 0.3 });
    const frameM = kit.mat(fs.arch.frame || 'alu_black', { tint: fs.arch.frameTint });
    const T = (fs.windows || {})[fs.arch.win];
    if (!T) return;
    for (const o of openingsOf(spec, fi, Fc.L)) if (o.T === T) archOne(kit, o, fs.arch, wallM, stoneM, frameM);
  });
}

// ------------------------------------------------------------------ boarded windows: a plywood sheet in front of every 'blind' (or `boarded`) window of a face flagged `boards`
// round-headed openings get a sheet cut to the arch (a rectangle and a fan), the sheets weather in their own tone, a rust weep under a few of them
export function boards(group, ctx, spec, frame) {
  (spec.faces || []).forEach((fs, fi) => {
    if (!fs.boards) return;
    const Fc = fs.edge === undefined || fs.edge === 'front' ? { L: frame.L, kit: frame.kit } : frame.face(fs.edge);
    if (!Fc) return;
    const kit = Fc.kit;
    const tones = fs.boards.tones || ['#b2a88e', '#a39a82', '#b9af96', '#8d6f52'];
    let n = 0;
    for (const o of openingsOf(spec, fi, Fc.L)) {
      if (o.T.kind !== 'blind' && !o.T.boarded) continue;
      const rv = o.T.reveal ?? 0.1, k = n++;
      const m = kit.mat('stucco', { tint: tones[(k * 7 + (k >> 2)) % tones.length], dirt: 0.55 });
      const rail = kit.mat('stucco', { tint: '#8c8167', dirt: 0.55 });
      const z0 = -rv + 0.012, z1 = -rv + 0.038;
      const h = o.y1 - o.y0, u0 = o.u0 + 0.03, u1 = o.u1 - 0.03, uc = (u0 + u1) / 2, r = (u1 - u0) / 2;
      if (o.T.kind === 'arch') {
        const ys = o.y1 - 0.03 - r, N = 12, ang = (q) => Math.PI - (Math.PI * q) / N;
        kit.box(m, u0, u1, o.y0 + 0.03, ys, z0, z1, { c: 0.004, near: true });
        const fan = [[uc, ys, z1]];
        for (let q = 0; q <= N; q++) fan.push([uc + Math.cos(ang(q)) * r, ys + Math.sin(ang(q)) * r, z1]);
        kit.poly(m, fan, [0, 0, 1], { near: true });
      } else kit.box(m, u0, u1, o.y0 + 0.03, o.y1 - 0.03, z0, z1, { c: 0.004, near: true });
      for (const f of [0.33, 0.66]) kit.box(rail, u0, u1, o.y0 + h * f - 0.04, o.y0 + h * f + 0.04, z1 - 0.002, z1 + 0.012, { c: 0.003, near: true });
      // a rust weep from the lower edge of a few sheets
      if ((k * 13) % 5 < 2) kit.box(kit.mat('steel_rust', { dirt: 0.2 }), o.u0 + 0.06, o.u0 + 0.16, o.y0 + 0.05, o.y0 + 0.5, z1, z1 + 0.006, { c: 0.001, near: true });
    }
  });
}

// ------------------------------------------------------------------ reflective glass walls
// A face with `glassWall: { zones: [{ u0, u1, mullion, rows, w }], glass, body, tint, spandrelBody, frame, frameTint, mullionW, mullionD }` gets coated glass panes in a mullion grid
// over the (solid or recessed) wall: opaque pane materials (MATS's glass_tower sets with a body colour light enough to read as coated glass by day, which the kit's own
// curtain wall cannot set), each pane tilted a few millimetres so the sky mirror breaks pane by pane like float glass, a spandrel band in a darker body, and the frame
// caps. rows: [[y0, y1, 'v' | 's'], ...] (vision or spandrel) or { y0, y1, vh, sh } (a vision pane of vh over a spandrel of sh, repeated), or { y0, y1, vh } (no spandrels).
export function glasswall(group, ctx, spec, frame) {
  (spec.faces || []).forEach((fs) => {
    const G = fs.glassWall;
    if (!G) return;
    const Fc = fs.edge === undefined || fs.edge === 'front' ? { L: frame.L, kit: frame.kit } : frame.face(fs.edge);
    if (!Fc) return;
    const kit = Fc.kit;
    const glass = kitMat(G.glass || 'glass_tower_bronze', { body: G.body, tint: G.tint });
    const spGlass = kitMat(G.spandrelGlass || G.glass || 'glass_tower_bronze', { body: G.spandrelBody || G.body, tint: G.spandrelTint || G.tint });
    const frameM = kit.mat(G.frame || 'alu_bronze', { tint: G.frameTint });
    const mw = G.mullionW ?? 0.06, md = G.mullionD ?? 0.12;
    let seed = 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    G.zones.forEach((Z, zi) => {
      seed = 977 + zi * 131;
      const u0 = Z.u0, u1 = Math.min(Z.u1, Fc.L - 0.02), w = Z.w ?? G.w ?? 0.02;
      const nb = Math.max(1, Math.round((u1 - u0) / (Z.mullion || G.mullion || 1.5))), pitch = (u1 - u0) / nb;
      let rows = Z.rows || G.rows;
      if (!Array.isArray(rows)) {
        const R = rows, out = [];
        for (let y = R.y0; y < R.y1 - 0.05; y += R.vh + (R.sh || 0)) {
          out.push([y, Math.min(R.y1, y + R.vh), 'v']);
          if (R.sh && y + R.vh < R.y1 - 0.05) out.push([y + R.vh, Math.min(R.y1, y + R.vh + R.sh), 's']);
        }
        rows = out;
      }
      const pane = (m, ua, ub, ya, yb) => {
        const t = () => (rnd() - 0.5) * 0.012;
        kit.poly(m, [[ua, ya, w + t()], [ub, ya, w + t()], [ub, yb, w + t()], [ua, yb, w + t()]], [0, 0, 1]);
      };
      // vision glass (MATS's glass_vision sets) on the zone's own grid: the floor lines (`storey: [h, y0]` on the zone or the wall) and one shade bay per pane,
      // starting at the zone's first mullion (KIT 05:26: without them the shade cells ran across the mullions on the shader's default 1.45 m grid)
      const p0 = kit.world(u0, 0, 0);
      const vis = /^glass_vision/.test(G.glass || '') ? kitMat(G.glass, { body: G.body, tint: G.tint, storey: Z.storey ?? G.storey, bay: +pitch.toFixed(4), bayAt: [+p0[0].toFixed(3), +p0[2].toFixed(3)], seed: 977 + zi * 131, blinds: Z.blinds ?? G.blinds, sheers: Z.sheers ?? G.sheers, glow: G.glow, trans: G.trans }) : null;
      for (const [ya, yb, kind] of rows) {
        const m = kind === 's' ? spGlass : vis || glass;
        for (let j = 0; j < nb; j++) pane(m, u0 + j * pitch + mw / 2, u0 + (j + 1) * pitch - mw / 2, ya + 0.02, yb - 0.02);
        // the transom cap on top of each row
        kit.box(frameM, u0, u1, yb - 0.03, yb + 0.03, w, w + md * 0.85, { c: 0.006, near: true });
        if (kind === 'v' && Z.rowBottom !== false) kit.box(frameM, u0, u1, ya - 0.03, ya + 0.03, w, w + md * 0.85, { c: 0.006, near: true });
      }
      const y0 = rows[0][0], y1 = rows[rows.length - 1][1];
      for (let j = 0; j <= nb; j++) {
        const u = u0 + j * pitch;
        kit.box(frameM, Math.max(u0, u - mw / 2), Math.min(u1, u + mw / 2), y0, y1, w, w + md, { c: 0.006, near: true });
      }
    });
  });
}

// 1 W 125th: a geometric mural on the wall beside Shake Shack: angular facets in a warm and cool palette (invented in the style of the real one, which is a faceted abstract on a pale ground)
export function mural(ctx, w, h) {
  cl(ctx);
  ctx.fillStyle = '#e9e4da'; ctx.fillRect(0, 0, w, h);
  const cols = ['#e2503a', '#f2a93b', '#3b8f9c', '#2c4f8a', '#7a4a8c', '#4aa36b', '#f2d36a', '#d9d4c8'];
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const nx = 6, ny = 4, px = [], pad = 0.15;
  for (let j = 0; j <= ny; j++) { px.push([]); for (let i = 0; i <= nx; i++) px[j].push([(i + (i && i < nx ? (rnd() - 0.5) * pad * 2 : 0)) * w / nx, (j + (j && j < ny ? (rnd() - 0.5) * pad * 2 : 0)) * h / ny]); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = px[j][i], b = px[j][i + 1], c = px[j + 1][i + 1], d = px[j + 1][i];
    const tri = (p, q, r) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.closePath(); ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.fill(); };
    if (rnd() < 0.5) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  ctx.strokeStyle = 'rgba(20,20,24,0.55)'; ctx.lineWidth = Math.max(1, w * 0.004);
  for (let j = 0; j <= ny; j++) { ctx.beginPath(); px[j].forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
  ctx.restore();
}

// 1 W 125th: the raised third storey over the east third of the front (u 22.4 to the corner), 3.8 m above the 9.2 m roof, 7 m deep, grey stucco; the signs of the offices sit on it
export function raised1(group, ctx, spec, frame) {
  const kit = frame.kit, L = frame.L, y0 = frame.h - 0.4;
  const wall = kit.mat('stucco', { tint: '#a8a8a6', dirt: 0.4 });
  const cap = kit.mat('cast_stone', { tint: '#a9a8a2', dirt: 0.3 });
  const u0 = Math.max(0, L - 10.7), y1 = y0 + 4.2;
  kit.box(wall, u0, L, y0, y1, -7.0, 0.0, { c: 0.02 });
  kit.box(cap, u0 - 0.05, L + 0.02, y1 - 0.05, y1 + 0.12, -7.05, 0.1, { c: 0.01 });
  kit.sign({ kind: 'channel', text: 'Offices Coworking', font: 'Montserrat-600', fg: '#f4f4f2', bg: null, u0: u0 + 0.4, u1: u0 + 6.2, y: y0 + 0.8, h: 0.9, depth: 0.08, lit: 'face' }, { z: 0.02 });   // SIGNS 19:05: acrylic faces read white
  kit.sign({ kind: 'channel', text: 'Regus', font: 'Montserrat-800', fg: '#1b2c3a', bg: null, u0: u0 + 6.6, u1: u0 + 9.8, y: y0 + 0.75, h: 1.0, depth: 0.08, lit: 'none' }, { z: 0.02 });
  kit.sign({ kind: 'channel', text: 'PLS', font: 'Archivo-900', fg: '#42b649', bg: null, u0: u0 + 3.6, u1: u0 + 5.8, y: y0 + 2.0, h: 0.95, depth: 0.08, lit: 'face' }, { z: 0.02 });
  kit.sign({ kind: 'channel', text: 'HAIR', font: 'Archivo-900', fg: '#c8302c', bg: '#f1ede6', u0: u0 + 2.6, u1: u0 + 4.6, y: y0 + 3.0, h: 0.8, depth: 0.08, lit: 'face' }, { z: 0.02 });
}

// 35 W 124th: the school's crest on its red banner (drawn from scratch in the banner's style: white line work on red): "HARLEM" arched over the top, "VILLAGE ACADEMIES"
// round the lower half, a ring, an open book over a ribbon with the motto, two laurel branches
export function hva(ctx, w, h) {
  cl(ctx);
  const cx = w / 2, cy = h * 0.47, R = Math.min(w, h * 0.92) * 0.42, ink = '#f6efe6';
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const arc = (txt, r, a0, a1, size, inner) => {
    ctx.font = `700 ${Math.round(size)}px "ar33 LibreBaskerville", serif`;
    const n = txt.length;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + (inner ? -Math.PI / 2 : Math.PI / 2)); ctx.fillText(txt[i], 0, 0); ctx.restore();
    }
  };
  arc('HARLEM', R * 0.93, -Math.PI * 0.74, -Math.PI * 0.26, R * 0.2, false);
  arc('VILLAGE ACADEMIES', R * 0.93, Math.PI * 0.98, Math.PI * 0.02, R * 0.16, true);
  ctx.lineWidth = Math.max(1, R * 0.025); ctx.beginPath(); ctx.arc(cx, cy, R * 0.66, 0, Math.PI * 2); ctx.stroke();
  // the open book
  const bw = R * 0.62, bh = R * 0.34, by = cy - R * 0.2;
  for (const sgn of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(cx, by + bh * 0.12); ctx.quadraticCurveTo(cx + sgn * bw * 0.25, by - bh * 0.08, cx + sgn * bw * 0.5, by); ctx.lineTo(cx + sgn * bw * 0.5, by + bh); ctx.quadraticCurveTo(cx + sgn * bw * 0.25, by + bh * 0.9, cx, by + bh * 1.05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a8232c'; ctx.lineWidth = Math.max(1, R * 0.012);
    for (let k = 1; k <= 5; k++) { const yy = by + (bh * k) / 6.5; ctx.beginPath(); ctx.moveTo(cx + sgn * bw * 0.07, yy + bh * 0.08); ctx.lineTo(cx + sgn * bw * 0.43, yy); ctx.stroke(); }
    ctx.strokeStyle = ink;
  }
  // the ribbon with the motto
  const ry = cy + R * 0.28, rw = R * 1.15, rh = R * 0.16;
  ctx.beginPath(); ctx.moveTo(cx - rw / 2, ry); ctx.quadraticCurveTo(cx, ry - rh * 0.8, cx + rw / 2, ry); ctx.lineTo(cx + rw / 2, ry + rh); ctx.quadraticCurveTo(cx, ry + rh * 0.2, cx - rw / 2, ry + rh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a8232c'; ctx.font = `700 ${Math.round(rh * 0.5)}px "ar33 LibreBaskerville", serif`; ctx.fillText('DUX MEAE VITAE SUM', cx, ry + rh * 0.32);
  // the laurel: leaves along two arcs under the book
  ctx.fillStyle = ink;
  for (const sgn of [-1, 1]) for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + sgn * (0.35 + k * 0.17), r = R * 0.5, x = cx + Math.cos(a) * r, y = cy + R * 0.05 + Math.sin(a) * r * 0.75;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + sgn * 0.9); ctx.beginPath(); ctx.ellipse(0, 0, R * 0.075, R * 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// YoYo Chicken (4-6 W): a white round mascot, two dot eyes and a small smile, on the black sign, left of the orange lettering
export function yoyo(ctx, w, h) {
  cl(ctx);
  const s = Math.min(w, h), cx = w / 2, cy = h / 2, r = s * 0.46;
  disc(ctx, cx, cy, r, '#f6f4ef');
  disc(ctx, cx - r * 0.3, cy - r * 0.08, r * 0.1, '#17171a'); disc(ctx, cx + r * 0.3, cy - r * 0.08, r * 0.1, '#17171a');
  ctx.strokeStyle = '#17171a'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.28, 0.25, Math.PI - 0.25); ctx.stroke();
  disc(ctx, cx - r * 0.52, cy + r * 0.28, r * 0.1, '#f2a1a1'); disc(ctx, cx + r * 0.52, cy + r * 0.28, r * 0.1, '#f2a1a1');
  ctx.restore();
}

// PLS Check Cashing: the green italic PLS with its dollar tail
export function pls(ctx, w, h) {
  cl(ctx);
  ctx.fillStyle = '#42b649'; ctx.font = `italic 900 ${Math.round(h * 0.78)}px "ar33 Archivo", "ar33 Montserrat", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PLS', w * 0.42, h * 0.52);
  ctx.font = `900 ${Math.round(h * 0.5)}px "ar33 Archivo", sans-serif`;
  ctx.fillStyle = '#f3b93a'; ctx.fillText('$', w * 0.9, h * 0.32);
  ctx.restore();
}

export function billboard(group, ctx, spec, frame) {
  const kit = frame.kit, L = frame.L, roofY = frame.h, u0 = 1.4, u1 = Math.min(L - 1.0, 10.4), z = -3.2, yb = roofY + 2.6, hb = 3.0;
  const steel = kit.mat('steel_black', { tint: '#2a2c2e', dirt: 0.2 });
  const galv = kit.mat('steel_galvanized', { tint: '#8f9396', dirt: 0.25 });
  // posts and cross braces
  for (const u of [u0 + 0.6, (u0 + u1) / 2, u1 - 0.6]) {
    kit.box(steel, u - 0.09, u + 0.09, roofY, yb + hb + 0.1, z - 0.2, z - 0.02, { c: 0.01 });
    kit.box(steel, u - 0.06, u + 0.06, roofY, yb, z - 0.9, z - 0.84, { c: 0.01 });
  }
  for (const [ua, ub] of [[u0 + 0.6, (u0 + u1) / 2], [(u0 + u1) / 2, u1 - 0.6]]) {
    kit.poly(steel, [[ua, roofY, z - 0.88], [ua + 0.09, roofY, z - 0.88], [ub, yb, z - 0.1], [ub - 0.09, yb, z - 0.1]], [0, 0, 1], { near: true });
  }
  // the catwalk along the foot of the board with its rail
  kit.box(galv, u0 - 0.1, u1 + 0.1, yb - 0.08, yb - 0.02, z - 0.2, z + 0.9, { c: 0.004, near: true });
  kit.box(galv, u0 - 0.1, u1 + 0.1, yb + 0.85, yb + 0.9, z + 0.86, z + 0.9, { c: 0.004, near: true });
  for (let u = u0; u <= u1 + 0.01; u += 0.9) kit.box(galv, u - 0.012, u + 0.012, yb - 0.02, yb + 0.88, z + 0.86, z + 0.9, { c: 0.002, near: true });
  // the board: a 9 m x 3 m panel, its frame and the lights on arms over its top edge
  kit.sign({ kind: 'panel', lines: ['MOONLIT LANE', 'THE MUSICAL  -  TICKETS AT THE BOX OFFICE'], font: 'Anton', fg: '#10161a', bg: '#7cc242', u0, u1, y: yb, h: hb, depth: 0.3, lit: 'none', frame: '#cfd3d6', fill: 0.7 }, { z });
  for (let u = u0 + 1.0; u < u1; u += 2.5) {
    kit.box(steel, u - 0.02, u + 0.02, yb + hb + 0.02, yb + hb + 0.12, z + 0.3, z + 1.2, { c: 0.002, near: true });
    kit.box(galv, u - 0.14, u + 0.14, yb + hb + 0.06, yb + hb + 0.2, z + 1.15, z + 1.4, { c: 0.01, near: true });
  }
}

// 300 Lenox: the billboard and the brick ornament of the top: pilasters between the window
// pairs, carried 0.32 m over the parapet to gabled caps (peak 0.64 m over it) with a stone coping and a dark-brick keyhole on each cap; dark-brick panels with ears on
// the parapet between them (0.36-1.05 m under its top); a dark-brick diamond over every window in the spandrel band (8.85 m); dark header lines down the pilasters' edges
export function lenox300(group, ctx, spec, frame) {
  billboard(group, ctx, spec, frame);
  const kit = frame.kit, L = frame.L, top = frame.h + 0.75;
  const brick = kit.mat('brick_buff', { tint: (spec.wall && spec.wall.tint) || '#d8bb98', dirt: 0.4 });
  const dark = kit.mat('brick_red', { tint: '#7a4535', dirt: 0.3 });
  const cope = kit.mat('cast_stone', { tint: '#b4ae9f', dirt: 0.35 });
  const pil = [[0.0, 0.75, false], [4.75, 5.8, true], [10.65, 11.7, true], [16.8, 17.9, true], [Math.min(24.15, L - 0.9), L, true]];
  const strip = (u0, u1, y0, y1, w = 0.085) => kit.box(dark, u0, u1, y0, y1, w - 0.012, w, { c: 0.002, near: true });
  for (const [a, c, shaft] of pil) {
    const m = (a + c) / 2, eave = top + 0.32, peak = top + 0.64;
    if (shaft) {
      kit.box(brick, a, c, 5.6, top - 0.05, -0.02, 0.08, { c: 0.01 });
      strip(a + 0.06, a + 0.12, 5.6, top - 1.1); strip(c - 0.12, c - 0.06, 5.6, top - 1.1);
    } else kit.box(brick, a, c, top - 1.1, top - 0.05, -0.02, 0.08, { c: 0.01 });
    // the cap over the parapet, its gable and the coping on the two slopes
    kit.box(brick, a, c, top - 0.05, eave, -0.34, 0.08, { c: 0.01 });
    kit.poly(brick, [[a, eave, 0.08], [c, eave, 0.08], [m, peak, 0.08]], [0, 0, 1]);
    kit.poly(brick, [[c, eave, -0.34], [a, eave, -0.34], [m, peak, -0.34]], [0, 0, -1]);
    for (const [ua, ya, ub, yb] of [[a - 0.04, eave - 0.01, m, peak + 0.02], [m, peak + 0.02, c + 0.04, eave - 0.01]]) {
      const du = ub - ua, dy = yb - ya, l = Math.hypot(du, dy), nu = -dy / l, ny = du / l, t = 0.07;
      kit.poly(cope, [[ua, ya + t, 0.12], [ub, yb + t, 0.12], [ub, yb + t, -0.38], [ua, ya + t, -0.38]], [nu, ny, 0]);
      kit.poly(cope, [[ua, ya, 0.12], [ub, yb, 0.12], [ub, yb + t, 0.12], [ua, ya + t, 0.12]], [0, 0, 1]);
    }
    // the keyhole: a box outline on the cap, a stem under it
    const k0 = m - 0.2, k1 = m + 0.2, ky0 = top - 0.25, ky1 = top + 0.22;
    strip(k0, k1, ky1 - 0.06, ky1); strip(k0, k0 + 0.06, ky0, ky1); strip(k1 - 0.06, k1, ky0, ky1); strip(k0, m - 0.05, ky0, ky0 + 0.06); strip(m + 0.05, k1, ky0, ky0 + 0.06);
    strip(m - 0.11, m - 0.05, top - 0.75, ky0 + 0.06); strip(m + 0.05, m + 0.11, top - 0.75, ky0 + 0.06); strip(m - 0.11, m + 0.11, top - 0.81, top - 0.75);
  }
  // the parapet panels between the pilasters, a long box outline with an ear at each end
  for (let i = 0; i + 1 < pil.length; i++) {
    const p1 = pil[i][1], p2 = pil[i + 1][0], W = p2 - p1;
    if (W < 2) continue;
    const a = p1 + 0.27 * W, c = p2 - 0.27 * W, y0 = top - 0.8, y1 = top - 0.22, w = 0.012;   // (the twin's parapet top is ~0.3 m under the real's: kept clear of the window heads)
    strip(a, c, y1 - 0.06, y1, w); strip(a, c, y0, y0 + 0.06, w); strip(a, a + 0.06, y0, y1, w); strip(c - 0.06, c, y0, y1, w);
    for (const [e0, e1, x0] of [[p1 + 0.08 * W, a, p1 + 0.08 * W], [c, p2 - 0.08 * W, p2 - 0.08 * W - 0.06]]) { strip(e0, e1, top - 0.45, top - 0.39, w); strip(e0, e1, top - 0.63, top - 0.57, w); strip(x0, x0 + 0.06, top - 0.63, top - 0.39, w); }
  }
  // the diamonds in the spandrel band over each window
  for (const uc of [1.1, 3.65, 6.9, 9.55, 12.9, 15.65, 19.3, 22.65]) {
    if (uc > L - 0.3) continue;
    kit.poly(dark, [[uc, 8.67, 0.045], [uc + 0.17, 8.85, 0.045], [uc, 9.03, 0.045], [uc - 0.17, 8.85, 0.045]], [0, 0, 1], { near: true });
  }
}

// 35 W 124th (the school's 125th Street face): the three pole banners on brackets, each hung between two steel arms 1.35 m out from the wall with ball finials, the cloth square to the wall
export function school(group, ctx, spec, frame) {
  const kit = frame.kit;
  const steel = kit.mat('plain', { tint: '#2b2c2e', rough: 0.45, metal: 0.4 });
  const cloth = { red: kit.mat('plain', { tint: '#8e1e24', rough: 0.85 }), black: kit.mat('plain', { tint: '#1a1a1d', rough: 0.85 }) };
  for (const [u, col] of [[5.8, 'red'], [14.75, 'black'], [23.4, 'red']]) {
    const y0 = 7.9, y1 = 14.9;
    for (const ya of [y0 - 0.12, y1 + 0.06]) {
      kit.box(steel, u - 0.025, u + 0.025, ya, ya + 0.05, 0.0, 1.35, { c: 0.005, near: true });
      kit.box(steel, u - 0.045, u + 0.045, ya - 0.02, ya + 0.07, 1.33, 1.42, { c: 0.02, near: true });
      kit.box(steel, u - 0.06, u + 0.06, ya - 0.1, ya + 0.15, -0.01, 0.03, { c: 0.005, near: true });
    }
    kit.box(cloth[col], u - 0.008, u + 0.008, y0, y1, 0.3, 1.28, { c: 0.002 });
  }
  // batch 2: the academy's round-fronted entrance: a segmental glass bay 1.0 m proud of the base, dark
  // bronze mullions about 0.45 m apart along the arc over a kick plate, a curved fascia over it (4.9-5.45 m) and its flat top
  const bronze = kit.mat('plain', { tint: '#2f2b27', rough: 0.4, metal: 0.5 });
  const glass = kit.mat('plain', { tint: '#56636a', rough: 0.05, env: 0.85 });   // b2r7: '#2a3236' read as a black wall;
  const u0 = 25.6, u1 = 30.4, sag = 1.0, yK = 0.3, yT = 4.9, yF = 5.45, N = 12;
  const c = (u0 + u1) / 2, half = (u1 - u0) / 2, R = (half * half + sag * sag) / (2 * sag), wc = sag - R, a0 = Math.asin(half / R);
  const ang = (k) => -a0 + (2 * a0 * k) / N;
  const pt = (k) => [c + R * Math.sin(ang(k)), wc + R * Math.cos(ang(k))];
  for (let k = 0; k < N; k++) {
    const [ua, wa] = pt(k), [ub, wb] = pt(k + 1), am = (ang(k) + ang(k + 1)) / 2, n = [Math.sin(am), 0, Math.cos(am)];
    kit.poly(glass, [[ua, yK, wa], [ub, yK, wb], [ub, yT, wb], [ua, yT, wa]], n);
    kit.poly(bronze, [[ua, 0.0, wa], [ub, 0.0, wb], [ub, yK, wb], [ua, yK, wa]], n);
    kit.poly(bronze, [[ua, yT, wa + 0.02], [ub, yT, wb + 0.02], [ub, yF, wb + 0.02], [ua, yF, wa + 0.02]], n);
    kit.poly(bronze, [[c, yF, 0], [ua, yF, wa + 0.02], [ub, yF, wb + 0.02]], [0, 1, 0]);
    if (k > 0) kit.box(bronze, ua - 0.03, ua + 0.03, yK, yT, wa - 0.03, wa + 0.05, { c: 0.006 });
  }
  for (const k of [0, N]) { const [uu, ww] = pt(k); kit.box(bronze, uu - 0.06, uu + 0.06, 0, yF, ww - 0.05, ww + 0.08, { c: 0.008 }); }
  // a transom bar round the bay at 2.6 m
  for (let k = 0; k < N; k++) { const [ua, wa] = pt(k), [ub, wb] = pt(k + 1), am = (ang(k) + ang(k + 1)) / 2; kit.poly(bronze, [[ua, 2.6, wa + 0.03], [ub, 2.6, wb + 0.03], [ub, 2.68, wb + 0.03], [ua, 2.68, wa + 0.03]], [Math.sin(am), 0, Math.cos(am)]); }
}

// the swoosh as a solid piece in the u-y plane over [u0, u1] x [y0, y1], its face at w (+0.05 thick): a strip of quads between the outer and the inner edge
// the swoosh's face: white acrylic with a little day glow, as the sign kit's lit faces
let _swM = null;
const swooshMat = () => _swM || (_swM = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.3 })));
function swooshGeo(kit, u0, u1, y0, y1, w) {
  const m = swooshMat(), N = 18, W = u1 - u0, H = y1 - y0;   // b2r3 '#f1f2f2', b2r4 white with env 0.5 read as grey as the band; b3r1 plain white (rough 0.6) read 196 233
  const bz = (p, t) => { const a = 1 - t; return [a * a * a * p[0][0] + 3 * a * a * t * p[1][0] + 3 * a * t * t * p[2][0] + t * t * t * p[3][0], a * a * a * p[0][1] + 3 * a * a * t * p[1][1] + 3 * a * t * t * p[2][1] + t * t * t * p[3][1]]; };
  const outer = [[0.12, 1.0], [-0.12, 0.1], [0.2, -0.45], [1.0, 0.97]], inner = [[0.12, 1.0], [0.14, 0.62], [0.3, 0.42], [1.0, 0.97]];
  const P = (c, t, d) => { const [x, y] = bz(c, t); return [u0 + x * W, y0 + y * H, w + d]; };
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    kit.poly(m, [P(outer, t0, 0.05), P(outer, t1, 0.05), P(inner, t1, 0.05), P(inner, t0, 0.05)], [0, 0, 1]);   // (casts its shadow on the band)
    kit.poly(m, [P(inner, t0, 0.051), P(inner, t1, 0.051), P(outer, t1, 0.051), P(outer, t0, 0.051)], [0, 0, 1]);   // b2r4/b2r5: the face read as the band's grey: both windings
    const a = P(outer, t0, 0), b = P(outer, t1, 0), du = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(du, dy) || 1;
    kit.poly(m, [P(outer, t0, 0), P(outer, t1, 0), P(outer, t1, 0.05), P(outer, t0, 0.05)], [dy / l, -du / l, 0], { near: true });
    const c = P(inner, t0, 0), e = P(inner, t1, 0), iu = e[0] - c[0], iy = e[1] - c[1], il = Math.hypot(iu, iy) || 1;
    kit.poly(m, [P(inner, t1, 0), P(inner, t0, 0), P(inner, t0, 0.05), P(inner, t1, 0.05)], [-iy / il, iu / il, 0], { near: true });
  }
  for (const [uu, yy] of [[0.2, 0.2], [0.55, 0.45], [0.85, 0.8]]) kit.box(m, u0 + uu * W - 0.02, u0 + uu * W + 0.02, y0 + yy * H - 0.02, y0 + yy * H + 0.02, w - 0.06, w, { c: 0.004, near: true });
  // its shadow on the band: the same strip 4 cm lower and 3 cm along, 1 cm off the band
  const sh = kit.mat('plain', { tint: '#6c6e70', rough: 0.8 });
  const Q = (c, t) => { const p = P(c, t, 0); return [p[0] + 0.03, p[1] - 0.04, w - 0.05]; };
  for (let i = 0; i < N; i++) kit.poly(sh, [Q(outer, i / N), Q(outer, (i + 1) / N), Q(inner, (i + 1) / N), Q(inner, i / N)], [0, 0, 1], { near: true });
}

// a hedge of planters along its back edge, two red umbrellas, a row of HVAC units along the front half
export function glassdeck(group, ctx, spec, frame) {
  glasswall(group, ctx, spec, frame);
  const kit = frame.kit, L = frame.L, y = frame.h;
  // the louvre band over the shops (3.9-5.0 m, elevation 2024-08): eight dark blades on the fascia (which stands 0.14 m proud), a dark gap behind them
  // b3r2: the band median (116,114,112), top 10 % (201,198,196) (151,147,140) / (244,241,239): lighter blades and gap
  const blade = kit.mat('plain', { tint: '#e6e7e5', rough: 0.4, metal: 0.1 }), gap = kit.mat('plain', { tint: '#5d5f62', rough: 0.9 });
  kit.box(gap, 0.1, L - 0.1, 3.95, 5.0, 0.14, 0.145, { c: 0.002, near: true });
  // batch 2: nine rounded blades at 0.115 m, was eight flat ones at 0.13
  for (let k = 0; k < 9; k++) kit.box(blade, 0.1, L - 0.1, 3.97 + k * 0.115, 4.035 + k * 0.115, 0.145, 0.205, { c: 0.02, near: true });
  // the swoosh (elevation u 17.8-20.0, y 5.0-5.85): a white piece 0.05 m thick on stand-offs 0.06 m off the silver band (which stands 0.14 m proud), drawn as geometry
  // (the painted mark read as a thin faint arc in b2r1): its outer edge and inner edge as two curves from the hooked tail to the point
  swooshGeo(kit, 17.8, 20.05, 5.0, 5.86, 0.2);
  const pav = kit.mat('concrete_board', { tint: '#d3bfa3', dirt: 0.3 });
  const hedge = kit.mat('plain', { tint: '#4b6a38', rough: 0.9 });
  const red = kit.mat('plain', { tint: '#c9382c', rough: 0.7 });
  const u0 = Math.min(8.0, L * 0.2), u1 = Math.min(30.0, L - 4);
  kit.box(pav, u0, u1, y, y + 0.07, -17.0, -8.0, { c: 0.01 });
  kit.box(hedge, u0 + 0.3, u1 - 0.3, y + 0.07, y + 0.85, -17.2, -16.4, { c: 0.05 });
  for (const u of [u0 + 7.5, u0 + 15.5]) {
    kit.box(hedge, u - 0.5, u + 0.5, y + 0.07, y + 0.45, -13.0, -12.0, { c: 0.04 });
    kit.box(red, u - 1.1, u + 1.1, y + 2.3, y + 2.4, -13.6, -11.4, { c: 0.01 });
    kit.box(frame.kit.mat('steel_galvanized', { tint: '#9a9d9f' }), u - 0.02, u + 0.02, y + 0.07, y + 2.3, -12.52, -12.48, { c: 0 });
  }
}

// 44 W 125th: what the kit does not draw of the front. The pressed-metal bay of the 2nd floor (posts between its
// three windows, its sill and head panels, AC units in the outer upper lights), the heavy bracketed cornice over it (8.65-9.75 m), the carved terracotta (caps on the 3rd-floor piers,
// panels under the outer 4th-floor windows), the arched tympana with keystones over the 4th-floor windows, and the entrance's gate (its box and the curtain down to 3.3 m)
function carved(kit, m, mL, u0, u1, y0, y1) {
  const t = 0.05;
  kit.box(m, u0, u1, y0, y1, -0.01, 0.025, { c: 0.006 });
  for (const [a, b, c, d] of [[u0, u1, y1 - t, y1], [u0, u1, y0, y0 + t], [u0, u0 + t, y0 + t, y1 - t], [u1 - t, u1, y0 + t, y1 - t]]) kit.box(m, a, b, c, d, 0.02, 0.055, { c: 0.008, near: true });
  const cu = (u0 + u1) / 2, cy = (y0 + y1) / 2, r = Math.min(u1 - u0, y1 - y0) * 0.3;
  // a rosette (a lozenge on a round boss) with leaf scrolls either side
  kit.box(mL, cu - r * 0.7, cu + r * 0.7, cy - r * 0.7, cy + r * 0.7, 0.02, 0.04, { c: 0.02, near: true });
  kit.poly(mL, [[cu, cy - r, 0.052], [cu + r, cy, 0.052], [cu, cy + r, 0.052], [cu - r, cy, 0.052]], [0, 0, 1], { near: true });
  for (const s of [-1, 1]) {
    const a = cu + s * r * 1.15, b = cu + s * Math.max(r * 1.3, (u1 - u0) / 2 - t - 0.04), lo = Math.min(a, b), hi = Math.max(a, b);
    kit.box(mL, lo, hi, cy - r * 0.22, cy + r * 0.22, 0.025, 0.046, { c: 0.01, near: true });
    kit.box(mL, lo + (hi - lo) * 0.2, hi, cy - r * 0.75, cy - r * 0.5, 0.025, 0.04, { c: 0.008, near: true });
    kit.box(mL, lo, hi - (hi - lo) * 0.2, cy + r * 0.5, cy + r * 0.75, 0.025, 0.04, { c: 0.008, near: true });
  }
}
function tympanum(kit, field, rim, a, b, yb) {
  const cu = (a + b) / 2, R = (b - a) / 2 + 0.14, r = R - 0.13, N = 14;
  const P = (rad, i, w) => [cu + rad * Math.cos((Math.PI * i) / N), yb + rad * Math.sin((Math.PI * i) / N), w];
  kit.box(rim, a - 0.14, b + 0.14, yb - 0.03, yb + 0.05, -0.01, 0.075, { c: 0.008 });   // the moulded head over the window
  for (let i = 0; i < N; i++) {
    const tm = (Math.PI * (i + 0.5)) / N;
    kit.poly(field, [[cu, yb, 0.012], P(r, i, 0.012), P(r, i + 1, 0.012)], [0, 0, 1]);
    kit.poly(rim, [P(r, i, 0.065), P(R, i, 0.065), P(R, i + 1, 0.065), P(r, i + 1, 0.065)], [0, 0, 1]);
    kit.poly(rim, [P(R, i, 0), P(R, i + 1, 0), P(R, i + 1, 0.065), P(R, i, 0.065)], [Math.cos(tm), Math.sin(tm), 0]);
    kit.poly(rim, [P(r, i + 1, 0.012), P(r, i, 0.012), P(r, i, 0.065), P(r, i + 1, 0.065)], [-Math.cos(tm), -Math.sin(tm), 0]);
  }
  // the shell in the field: five ribs fanning from a boss
  for (const f of [0.17, 0.33, 0.5, 0.67, 0.83]) {
    const t = Math.PI * f, cx = Math.cos(t), sy = Math.sin(t), nx = -sy * 0.022, ny = cx * 0.022, r0 = 0.1, r1 = r - 0.05;
    kit.poly(rim, [[cu + cx * r0 - nx, yb + sy * r0 - ny, 0.035], [cu + cx * r1 - nx, yb + sy * r1 - ny, 0.035], [cu + cx * r1 + nx, yb + sy * r1 + ny, 0.035], [cu + cx * r0 + nx, yb + sy * r0 + ny, 0.035]], [0, 0, 1], { near: true });
  }
  kit.box(rim, cu - 0.11, cu + 0.11, yb + 0.05, yb + 0.16, 0.012, 0.05, { c: 0.02, near: true });
  kit.box(rim, cu - 0.09, cu + 0.09, yb + r - 0.05, yb + R + 0.07, 0.0, 0.085, { c: 0.01 });   // the keystone
}
export function w44(group, ctx, spec, frame) {
  const kit = frame.kit, L = frame.L;
  const iron = kit.mat('wood_painted', { tint: '#4d3e30', dirt: 0.3 });   // '#3a2e29' rendered (29,26,28) in b2r1, '#563d2d' (50,31,24) in b2r3
  const tc = kit.mat('terracotta_cream', { tint: '#553a32', dirt: 0.6 });   // carved blocks (69,35,31) (b2r2 '#6c3a2d', b2r3 '#5e3328' read bright red)
  const tcL = kit.mat('terracotta_cream', { tint: '#6a4a40', dirt: 0.55 });
  const unit = kit.mat('plain', { tint: '#d3d3cd', rough: 0.55 });
  const slot = kit.mat('plain', { tint: '#4b4d4d', rough: 0.7 });
  const steel = kit.mat('plain', { tint: '#8a8d8f', rough: 0.45, metal: 0.4 });
  const slat = kit.mat('plain', { tint: '#a6a8a8', rough: 0.5, metal: 0.3 }), seam = kit.mat('plain', { tint: '#3c3e3f', rough: 0.8 });
  const blue = kit.mat('plain', { tint: '#1d55d6', rough: 0.45 });
  // the bay: two posts between the windows, the sill panel and the head panel, proud of the brick
  for (const [a, b] of [[2.2, 2.36], [3.94, 4.1]]) kit.box(iron, a, b, 5.66, 8.68, -0.02, 0.07, { c: 0.008 });
  kit.box(iron, 0.58, 5.72, 5.6, 5.86, -0.02, 0.1, { c: 0.01 });
  kit.box(iron, 0.58, 5.72, 8.38, 8.68, -0.02, 0.08, { c: 0.01 });
  // AC units in the upper lights of the outer windows (7.77-8.36 m), their grilles toward the street
  for (const [a, b] of [[1.12, 1.84], [4.66, 5.38]]) {
    kit.box(unit, a, b, 7.77, 8.36, -0.3, 0.2, { c: 0.02 });
    for (let k = 0; k < 7; k++) kit.box(slot, a + 0.05, b - 0.05, 7.82 + k * 0.07, 7.85 + k * 0.07, 0.2, 0.206, { c: 0.001, near: true });
  }
  // the cornice over the bay
  kit.cornice({ kind: 'bracketed', h: 1.1, proj: 0.45, mat: 'wood_painted', tint: '#4d3e30', brackets: 7 }, -0.02, L + 0.02, 9.75);
  // carved caps on the 3rd-floor piers, carved panels under the outer 4th-floor windows
  for (const [a, b] of [[0.04, 0.92], [1.86, 2.8], [3.72, 4.64], [5.56, 6.46]]) carved(kit, tc, tcL, a, b, 11.42, 11.78);
  // the grooves between the banded courses of the 3rd-floor piers read dark: a dark strip in each 0.07 m gap (the bands are in the spec)
  const groove = kit.mat('plain', { tint: '#3a2b26', rough: 0.9 });
  for (const [a, b] of [[0, 0.95], [1.85, 2.81], [3.71, 4.65], [5.55, 6.5]]) for (let y = 9.95; y < 11.4; y += 0.24) kit.box(groove, a, b, y, y + 0.07, 0.0, 0.006, { c: 0.001, near: true });
  for (const [a, b] of [[0.94, 1.98], [4.7, 5.74]]) carved(kit, tc, tcL, a, b, 12.28, 12.86);
  // the tympana over the 4th-floor windows
  for (const [a, b] of [[1.04, 1.9], [2.9, 3.74], [4.76, 5.56]]) tympanum(kit, tc, tcL, a, b, 14.86);
  // the entrance gate: its box and the curtain half down, in its guides
  kit.box(steel, 0.0, 1.62, 4.74, 5.2, -0.02, 0.3, { c: 0.012 });
  // (b2r2: the ribbed set drew upright ribs here: slats as geometry instead, 0.075 m apart over a dark backing)
  kit.box(seam, 0.36, 1.24, 3.3, 4.76, 0.025, 0.03, { c: 0.001 });
  for (let y = 3.3; y < 4.74; y += 0.075) kit.box(slat, 0.37, 1.23, y + 0.006, y + 0.069, 0.03, 0.05, { c: 0.008, near: true });
  // the YOGA box's front face toward the street (u 0.03-0.5, 5.5-8.15 m, 0.36 m out), its letters stacked
  kit.box(blue, 0.03, 0.5, 5.5, 8.15, 0.0, 0.36, { c: 0.01 });
  kit.sign({ kind: 'panel', text: '', fg: '#ffffff', bg: '#1d55d6', logo: 'bid4:yogaV', logoAt: 'fill', u0: 0.05, u1: 0.48, y: 5.6, h: 2.45, depth: 0.03, lit: 'face', push: false }, { z: 0.362 });   // (depth >= 0.02: the face quad sits at depth - 0.006, in front of the back skin)   // (b2r3: `lines` of one letter each drew a dot)
  for (const u of [0.36, 1.24]) kit.box(steel, u - 0.035, u + 0.035, 0.0, 4.75, 0.0, 0.08, { c: 0.004, near: true });
  // the black marker tags on the curtain's top slats and the box, invented
  kit.sign({ kind: 'painted', text: '', fg: '#111111', bg: null, logo: 'bid4:tags44', logoAt: 'fill', u0: 0.4, u1: 1.2, y: 4.15, h: 0.55, lit: 'none' }, { z: 0.052 });
}

// a few black marker tags (invented letterforms: loops and a crossbar, a drip), on a transparent ground
export function tags44(ctx, w, h) {
  const g = cl(ctx);
  g.strokeStyle = 'rgba(14,14,14,0.85)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(2, h * 0.05);
  g.beginPath(); g.moveTo(w * 0.08, h * 0.7); g.bezierCurveTo(w * 0.12, h * 0.1, w * 0.22, h * 0.15, w * 0.2, h * 0.6); g.bezierCurveTo(w * 0.3, h * 0.2, w * 0.38, h * 0.25, w * 0.36, h * 0.7);
  g.moveTo(w * 0.42, h * 0.35); g.lineTo(w * 0.62, h * 0.3); g.moveTo(w * 0.5, h * 0.3); g.bezierCurveTo(w * 0.46, h * 0.6, w * 0.56, h * 0.75, w * 0.6, h * 0.55);
  g.moveTo(w * 0.66, h * 0.65); g.bezierCurveTo(w * 0.7, h * 0.2, w * 0.86, h * 0.2, w * 0.8, h * 0.5); g.lineTo(w * 0.92, h * 0.45);
  g.stroke();
  g.lineWidth = Math.max(1, h * 0.025); g.beginPath(); g.moveTo(w * 0.2, h * 0.62); g.lineTo(w * 0.2, h * 0.95); g.stroke();   // a drip
  g.restore();
}

// Lady Love's window: hats on shelves, crowns and brims in felt and straw colours
export function hats(ctx, w, h) {
  // b3r2: nine shelf rows of light hats read as a sparse shop shelf;
  // straw, overlapping, no shelf lines showing: thirteen staggered rows, heavy overlap, a jitter in height, dark tones weighted
  const g = cl(ctx);
  g.fillStyle = '#1b1817'; g.fillRect(0, 0, w, h);
  let s = 1234567; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const dark = ['#1c1b1d', '#2d2b30', '#3f4a5c', '#4b3b2e', '#262224', '#5b4a3c'], light = ['#c9b48a', '#d8d2c4', '#e6dcc8', '#9a8f7a', '#b9a57c'], hue = ['#7a2f2c', '#8b6d4c', '#a8a39a', '#6d6f73', '#3d5a4a'];
  const pick = () => { const q = rnd(); const P = q < 0.48 ? dark : q < 0.82 ? light : hue; return P[(rnd() * P.length) | 0]; };
  const rows = 13, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * rh * 0.8 - (r % 2) * rh * 0.5;
    while (x < w + rh) {
      const bw = rh * (1.15 + rnd() * 0.5), c = pick(), cx = x + bw / 2, y = rh * (r + 0.95) + (rnd() - 0.5) * rh * 0.3;
      g.fillStyle = c;
      g.beginPath(); g.ellipse(cx, y - rh * 0.07, bw / 2, rh * 0.1, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx, y - rh * 0.3, bw * 0.3, rh * 0.26, 0, Math.PI, 0); g.fill();
      g.fillRect(cx - bw * 0.3, y - rh * 0.31, bw * 0.6, rh * 0.24);
      if (rnd() < 0.7) { g.fillStyle = rnd() < 0.6 ? '#121212' : '#e9e4da'; g.fillRect(cx - bw * 0.3, y - rh * 0.15, bw * 0.6, rh * 0.05); }
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - bw * 0.22, y - rh * 0.52, bw * 0.12, rh * 0.34);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + bw * 0.1, y - rh * 0.52, bw * 0.2, rh * 0.38);
      x += bw * (0.42 + rnd() * 0.14);
    }
  }
  // the dark gaps between the stands deepen toward the floor
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.restore();
}

const POSTER_FONT = (px) => `900 ${px}px Anton, "Archivo Black", "DejaVu Sans", sans-serif`;
function athlete(g, w, h, flip) {
  // b2r5-b2r7: full figures read as pictograms: a black-and-white half-length portrait instead (head, neck, shoulders in a white vest, side light, dark studio ground)
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#5d5d5b'); bg.addColorStop(1, '#1f1f1e');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.save(); if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  const cx = w * 0.52, hy = h * 0.27, hr = Math.min(w * 0.2, h * 0.09);
  const skin = g.createLinearGradient(cx - hr, 0, cx + hr, 0); skin.addColorStop(0, '#8a8783'); skin.addColorStop(1, '#3b3a38');
  g.fillStyle = '#3b3a38'; g.fillRect(cx - hr * 0.45, hy + hr * 0.8, hr * 0.9, hr * 1.0);   // neck
  g.fillStyle = skin; g.beginPath(); g.ellipse(cx, hy, hr * 0.82, hr * 1.05, 0, 0, Math.PI * 2); g.fill();   // head
  g.fillStyle = '#151515'; g.beginPath(); g.ellipse(cx, hy - hr * 0.55, hr * 0.86, hr * 0.55, 0, Math.PI, 0); g.fill();   // hair
  g.fillStyle = '#4a4846'; g.beginPath(); g.moveTo(cx - w * 0.46, h); g.quadraticCurveTo(cx - w * 0.44, hy + hr * 2.0, cx - hr * 0.5, hy + hr * 1.7); g.lineTo(cx + hr * 0.5, hy + hr * 1.7);
  g.quadraticCurveTo(cx + w * 0.44, hy + hr * 2.0, cx + w * 0.46, h); g.closePath(); g.fill();   // shoulders and arms
  g.fillStyle = '#e8e7e3'; g.beginPath(); g.moveTo(cx - w * 0.25, h); g.lineTo(cx - w * 0.2, hy + hr * 2.2); g.quadraticCurveTo(cx, hy + hr * 2.9, cx + w * 0.2, hy + hr * 2.2); g.lineTo(cx + w * 0.25, h); g.closePath(); g.fill();   // the vest
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cx + w * 0.05, hy + hr * 2.4, w * 0.2, h);   // shade on the vest's far side
  g.restore();
}
function words(g, w, h, lines, fg, bg) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const lh = h / lines.length; g.fillStyle = fg; g.textBaseline = 'alphabetic';
  lines.forEach((t, i) => { g.font = POSTER_FONT(Math.round(lh * 0.92)); const m = g.measureText(t).width || 1; g.save(); g.translate(w * 0.04, lh * (i + 0.9)); g.scale(Math.min(1.6, (w * 0.92) / m), 1); g.fillText(t, 0, 0); g.restore(); });
}
export function postAth1(ctx, w, h) { const g = cl(ctx); athlete(g, w, h, false); g.fillStyle = '#ef5a2a'; g.fillRect(w * 0.7, h * 0.46, w * 0.16, h * 0.08); g.restore(); }
export function postAth2(ctx, w, h) {
  const g = cl(ctx); athlete(g, w, h, true);
  g.save(); g.translate(w * 0.16, h * 0.96); g.rotate(-Math.PI / 2); g.fillStyle = '#ffffff'; g.font = POSTER_FONT(Math.round(w * 0.17)); g.fillText('UPTOWN', 0, 0); g.restore();
  g.restore();
}
export function postType(ctx, w, h) { const g = cl(ctx); words(g, w, h, ['KEEP', 'GOING', 'UP', '125'], '#f4f4f2', '#1b1b1c'); g.fillStyle = '#ef5a2a'; g.fillRect(w * 0.55, h * 0.62, w * 0.28, h * 0.2); g.restore(); }
export function postPattern(ctx, w, h) {
  const g = cl(ctx); g.fillStyle = '#151516'; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h / 2); g.rotate(-0.5); g.fillStyle = '#ececea'; const px = Math.round(h * 0.075); g.font = POSTER_FONT(px);
  for (let r = -12; r <= 12; r++) for (let c = -3; c <= 3; c++) g.fillText('STEP AND STRIDE', c * px * 7.4 + (r % 2) * px * 3, r * px * 1.15);
  g.restore(); g.restore();
}
export function postAerial(ctx, w, h) {
  const g = cl(ctx); g.fillStyle = '#7c7c79'; g.fillRect(0, 0, w, h);
  let s = 99; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 9;
  for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) { const v = 60 + rnd() * 140 | 0; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect((i / n) * w + w * 0.012, (j / (n * 2)) * h + h * 0.006, w / n - w * 0.024, h / (n * 2) - h * 0.012); }
  g.fillStyle = '#d6d6d2'; g.fillRect(0, h * 0.47, w, h * 0.02); g.fillRect(w * 0.43, 0, w * 0.02, h);
  g.restore();
}
export function postOrange(ctx, w, h) {
  const g = cl(ctx); g.fillStyle = '#ee5a2c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) g.fillRect(w * 0.1, h * (0.12 + k * 0.05), w * (0.5 + (k % 3) * 0.12), h * 0.018);
  g.fillStyle = '#2b2b2b'; g.fillRect(w * 0.1, h * 0.5, w * 0.8, h * 0.36);
  g.fillStyle = '#9a9a96'; for (let k = 0; k < 5; k++) g.fillRect(w * (0.14 + k * 0.15), h * 0.55, w * 0.1, h * 0.26);
  g.restore();
}
export function postSale(ctx, w, h) { const g = cl(ctx); words(g, w, h, ['30%', 'OFF'], '#ffffff', '#ee5a2c'); g.restore(); }

// the YOGA box sign's face: white letters stacked down a blue face inside a thin white rule (drawn from scratch)
export function yogaV(ctx, w, h) {
  const g = cl(ctx);
  g.fillStyle = '#1d55d6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e9eef8'; g.lineWidth = Math.max(2, w * 0.05); g.strokeRect(w * 0.08, w * 0.08, w * 0.84, h - w * 0.16);
  const px = Math.round(Math.min(w * 0.62, h / 5.2)); g.font = `600 ${px}px Montserrat, "DejaVu Sans", sans-serif`; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  ['Y', 'O', 'G', 'A'].forEach((ch, i) => g.fillText(ch, w / 2, h * (0.2 + i * 0.2)));
  g.restore();
}

// Mushtari's hanging banner: black cloth, three small white lines at the top, the name in white lowercase down
// the banner, a small paint-can mark at the foot (drawn from scratch)
export function mushtariBanner(ctx, w, h) {
  const g = cl(ctx);
  g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2f2f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const px = Math.round(w * 0.13); g.font = `700 ${px}px Inter, "DejaVu Sans", sans-serif`;
  ['HOME', 'HARDWARE', 'GARDEN'].forEach((t, i) => g.fillText(t, w / 2, h * 0.05 + i * px * 1.2));
  g.save(); g.translate(w * 0.56, h * 0.62); g.rotate(-Math.PI / 2); g.font = `600 ${Math.round(w * 0.42)}px "DejaVu Sans", sans-serif`; g.fillText('mushtari', 0, 0); g.restore();
  g.beginPath(); g.moveTo(w * 0.3, h * 0.93); g.lineTo(w * 0.5, h * 0.86); g.lineTo(w * 0.7, h * 0.93); g.closePath(); g.fill();
  g.font = `600 ${Math.round(w * 0.08)}px "DejaVu Sans", sans-serif`; g.fillText('Benjamin Moore', w / 2, h * 0.965);
  g.restore();
}

// the T.J.maxx blade's face: white lettering down a red blade (drawn from scratch)
export function tjBlade(ctx, w, h) {
  const g = cl(ctx);
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w * 0.5, h * 0.5); g.rotate(-Math.PI / 2); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(w * 0.55)}px "Archivo Black", "DejaVu Sans", sans-serif`; g.fillText('T\u00b7J\u00b7maxx', 0, 0); g.restore();
  g.restore();
}
