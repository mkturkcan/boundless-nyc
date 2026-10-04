// AR34 BID3: canvas painters drawn from scratch (docs/notes/ar33-bid3.md). Nothing here samples a photograph: the letterforms are
// graffitiShutter(wM, hM, seed, o) a ribbed roll-down shutter, optionally covered in layered graffiti: wallMat (map + normal map)
// stuccoWall(wM, hM, seed, o) a weathered stucco / EIFS fascia: rain streaks, stains, faded painted sign ghosts
// paintGraffiti(g, W, H, seed, o) the painter itself (reusable: any canvas, any size; o.density 0..1, o.pxm pixels per metre)
// Requests: docs/notes/ar33-kit.md (the kit may adopt paintGraffiti for every segment's gates, hoardings and side walls).
import * as THREE from 'three';
import { wallMat, hash, quadMesh } from './bid3Util.js';
import { applyLightTrim } from '../../../world/materials.js';

// ------------------------------------------------------------------ letter skeletons (unit box, y down)
const GLY = [
  [[[.5, .08], [.82, .2], [.9, .5], [.8, .8], [.5, .92], [.2, .8], [.1, .5], [.2, .2], [.5, .08]]],                 // O
  [[[.85, .22], [.55, .08], [.22, .22], [.12, .5], [.22, .8], [.55, .92], [.85, .78]]],                              // C
  [[[.85, .18], [.5, .08], [.18, .22], [.25, .45], [.75, .55], [.85, .78], [.5, .92], [.15, .82]]],                  // S
  [[[.85, .1], [.2, .1], [.2, .9], [.85, .9]], [[.2, .5], [.7, .5]]],                                                // E
  [[[.15, .9], [.15, .1], [.85, .9], [.85, .1]]],                                                                    // N
  [[[.1, .9], [.5, .1], [.9, .9]], [[.28, .62], [.72, .62]]],                                                        // A
  [[[.1, .9], [.1, .1], [.5, .6], [.9, .1], [.9, .9]]],                                                              // M
  [[[.2, .9], [.2, .1], [.8, .1], [.85, .45], [.2, .5], [.85, .9]]],                                                 // R
  [[[.2, .1], [.2, .9]], [[.85, .1], [.2, .55], [.85, .9]]],                                                         // K
  [[[.15, .1], [.85, .1], [.15, .9], [.85, .9]]],                                                                    // Z
  [[[.2, .1], [.2, .9], [.85, .9]]],                                                                                 // L
  [[[.2, .1], [.2, .9], [.65, .9], [.9, .5], [.65, .1], [.2, .1]]],                                                  // D
  [[[.15, .1], [.15, .9]], [[.15, .1], [.8, .15], [.85, .45], [.15, .5]], [[.15, .5], [.85, .6], [.85, .9], [.15, .9]]], // B
  [[[.12, .1], [.88, .1]], [[.5, .1], [.5, .9]]],                                                                    // T
  [[[.15, .1], [.15, .8], [.4, .92], [.7, .8], [.85, .1]]],                                                          // U
  [[[.15, .1], [.5, .55], [.85, .1]], [[.5, .55], [.5, .92]]],                                                       // Y
];
// palettes (sRGB) h200: the gates stand in the shade of the north-facing front and the
// paint is sun-faded and dusty
const FILLS = [
  ['#151515', '#a39a40'],            // black piece, a pale yellow outline
  ['#557038', '#3c1d1a'],            // olive green, a maroon outline
  ['#3b548c', '#0f1218'],            // blue, near-black outline
  ['#8f9498', '#121212', 'chrome'],  // silver, black outline
  ['#4d559c', '#aeaea6'],            // violet-blue, a white outline
  ['#a5a6a0', '#121212'],            // white, black outline
  ['#5f7a3a', '#121212'],            // green, black outline
  ['#8f9498', '#1c2a55', 'chrome'],  // silver, navy outline
];
// the older work under the newer: faded tags and throw-ups, half buffed out
// the order the newer pieces take their colours in
const PICK = [0, 1, 2, 4, 6, 0, 2, 1, 3, 4];
const OLD = ['#8a8e90', '#6d4a44', '#4a5a78', '#2a2a2a', '#7d7a5a', '#9a9a96'];
const shade = (hex, f) => { const v = parseInt(hex.slice(1), 16); const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * f)))); return `rgb(${c[0]},${c[1]},${c[2]})`; };

// ------------------------------------------------------------------ spray-can marks
// Sprayed paint is not a vector stroke: its edge is soft (overspray), a mist of droplets lies round every line, a thin pass lets
// the steel show through, and the paint pools into runs. A mark is laid as solid dabs in a scratch layer, then copied onto the wall
// twice: blurred wide and faint (the halo), then nearly sharp (the core).
const _LY = [];
function scratch(i, W, H) {
  let c = _LY[i];
  if (!c) { c = document.createElement('canvas'); c.width = 8; c.height = 8; _LY[i] = c; }
  if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.clearRect(0, 0, c.width, c.height);
  return [c, g];
}
// the skeleton's corners rounded (quadratic curves through the segment midpoints), sampled every `step` pixels
function curve(Q, step) {
  const out = [Q[0]];
  const seg = (a, c, e) => {
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(e[0] - c[0], e[1] - c[1]), n = Math.max(2, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * e[0], u * u * a[1] + 2 * u * t * c[1] + t * t * e[1]]); }
  };
  let prev = Q[0];
  for (let j = 1; j + 1 < Q.length; j++) { const e = [(Q[j][0] + Q[j + 1][0]) / 2, (Q[j][1] + Q[j + 1][1]) / 2]; seg(prev, Q[j], e); prev = e; }
  const last = Q[Q.length - 1];
  seg(prev, [(prev[0] + last[0]) / 2, (prev[1] + last[1]) / 2], last);
  return out;
}
// straight segments (a tag's sharp corners), sampled every `step` pixels
function sampled(Q, step) {
  const out = [Q[0]];
  for (let j = 1; j < Q.length; j++) {
    const a = Q[j - 1], b = Q[j], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
// round dabs along a sampled line, the radius wandering with the hand (wob: share of r)
function dabs(g, pts, r, seed, wob = 0.2) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], rr = Math.max(0.7, r * (1 + wob * (Math.sin(i * 0.23 + seed * 3.1) * 0.6 + Math.sin(i * 0.051 + seed * 1.7) * 0.4)));
    g.moveTo(x + rr, y); g.arc(x, y, rr, 0, 6.2832);
  }
  g.fill();
}
// droplets round a line (the can held too far off): specks of the colour within one to two radii
function mist(g, pts, r, col, n, seed, a = 1) {
  g.save(); g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const p = pts[Math.floor(hash(i, seed, 7) * pts.length)], an = hash(i, seed, 8) * 6.2832, d = r * (1.05 + 1.1 * hash(i, seed, 9) ** 2);
    g.globalAlpha = a * (0.12 + 0.3 * hash(i, seed, 10));
    const s = 0.8 + hash(i, seed, 11) * 1.1;
    g.fillRect(p[0] + Math.cos(an) * d, p[1] + Math.sin(an) * d, s, s);
  }
  g.restore();
}
// a scratch layer onto the wall as spray paint: the halo (wide, faint), then the core (slightly soft)
function sprayOn(g, cv, x, y, BW, BH, halo, a = 1) {
  g.save();
  g.globalAlpha = 0.3 * a; g.filter = `blur(${halo.toFixed(1)}px)`; g.drawImage(cv, 0, 0, BW, BH, x, y, BW, BH);
  g.globalAlpha = 0.96 * a; g.filter = `blur(${Math.max(0.45, halo * 0.16).toFixed(2)}px)`; g.drawImage(cv, 0, 0, BW, BH, x, y, BW, BH);
  g.restore();
}
// runs: where the paint pooled at the foot of a stroke, a thin line down with a bead at its end ([x, y, length, colour, width])
function runs(g, list, a = 1) {
  g.save(); g.lineCap = 'round'; g.filter = 'blur(0.4px)';
  for (const [x, y, len, col, wd] of list) {
    g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = 0.88 * a; g.lineWidth = wd;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + wd * 0.6, y + len * 0.5, x + wd * 0.3, y + len); g.stroke();
    g.beginPath(); g.arc(x + wd * 0.3, y + len, wd * 0.9, 0, 6.2832); g.fill();
  }
  g.restore();
}
// the lowest point of a sampled line
const lowest = (s) => { let lo = s[0]; for (const p of s) if (p[1] > lo[1]) lo = p; return lo; };

// one piece: n invented letters along a slanted baseline, laid as spray marks: a soft dark shadow, the outline, the fill (flat,
// faded top to bottom, or a chrome band) thin in places, highlight flicks, runs and the mist. fillSet: [fill, outline, kind];
// o.a: opacity (older work under the newer)
function piece(g, x, y, w, h, seed, k, fillSet, o = {}) {
  if (typeof document === 'undefined') return;
  const R = (a, b = 0) => hash(a, b, seed * 7 + k);
  const n = 3 + Math.floor(R(1) * 2), [fill, line, kind] = fillSet, A = o.a ?? 1;
  const lw = (w / n) * 0.96, sw = Math.max(8, lw * (0.42 + 0.12 * R(3))), ow = Math.max(3, lw * (0.07 + 0.05 * R(4))), slant = -0.14 + (R(2) - 0.5) * 0.12;
  const pad = Math.ceil(sw + ow * 3 + 10), bx = Math.floor(x - pad), by = Math.floor(y - pad);
  const BW = Math.ceil(w * 1.25 + pad * 2), BH = Math.ceil(h * 1.2 + pad * 2);
  const strokes = [];
  for (let i = 0; i < n; i++) {
    const t = GLY[Math.floor(R(10 + i) * GLY.length)];
    const ox = x - bx + i * (w / n) * 0.97 + (R(20 + i) - 0.5) * lw * 0.12, oy = y - by + (R(30 + i) - 0.5) * h * 0.1;
    const lh = h * (0.84 + 0.2 * R(40 + i)), lx = lw * (0.88 + 0.24 * R(45 + i));
    const P = (p) => [ox + (p[0] + (R(50 + i, p[0] * 9 + p[1] * 3) - 0.5) * 0.22) * lx + (1 - p[1]) * lx * slant * 1.4,
      oy + (p[1] + (R(60 + i, p[1] * 9 + p[0] * 5) - 0.5) * 0.2) * lh];
    for (const poly of t) strokes.push(curve(poly.map(P), Math.max(1, sw * 0.1)));
  }
  // the outline layer, and a dark copy of it for the shadow
  const [O, og] = scratch(0, BW, BH); og.fillStyle = line;
  strokes.forEach((s, j) => dabs(og, s, sw / 2 + ow, seed + j, 0.16));
  const [S, sg] = scratch(1, BW, BH); sg.drawImage(O, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#0a0a0a'; sg.fillRect(0, 0, BW, BH);
  // the fill layer: flat, a fade or chrome, with thin passes punched out (the steel shows through)
  const [F, fg] = scratch(2, BW, BH); fg.fillStyle = '#ffffff';
  strokes.forEach((s, j) => dabs(fg, s, sw / 2, seed + 40 + j, 0.2));
  fg.globalCompositeOperation = 'source-in';
  if (kind === 'chrome') { const gr = fg.createLinearGradient(0, y - by, 0, y - by + h); gr.addColorStop(0, '#b4b8bb'); gr.addColorStop(0.45, '#848b91'); gr.addColorStop(0.55, '#535a61'); gr.addColorStop(0.8, '#959ba0'); gr.addColorStop(1, '#737b82'); fg.fillStyle = gr; }
  else if (R(5) < 0.5) { const gr = fg.createLinearGradient(0, y - by, 0, y - by + h); gr.addColorStop(0, shade(fill, 1.3)); gr.addColorStop(0.55, fill); gr.addColorStop(1, shade(fill, 0.78)); fg.fillStyle = gr; }
  else fg.fillStyle = fill;
  fg.fillRect(0, 0, BW, BH);
  fg.globalCompositeOperation = 'destination-out';
  for (let q = 0; q < 30; q++) {
    const cx = R(300 + q, 1) * BW, cy = R(300 + q, 2) * BH, r = (0.25 + 0.6 * R(300 + q, 3)) * sw;
    const gr = fg.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(0,0,0,${0.12 + 0.33 * R(300 + q, 4)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    fg.fillStyle = gr; fg.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  fg.globalCompositeOperation = 'source-over';
  // highlight flicks up the left side of some strokes
  const [Hl, hg] = scratch(3, BW, BH); hg.fillStyle = '#eeeee8';
  strokes.forEach((s, j) => {
    if (R(400 + j) > 0.35) return;
    const a = Math.floor(s.length * 0.1), b = Math.floor(s.length * (0.3 + 0.2 * R(410 + j)));
    dabs(hg, s.slice(a, b).map(([px, py]) => [px - sw * 0.2, py - sw * 0.22]), Math.max(0.8, sw * 0.05), seed + j, 0.3);
  });
  sprayOn(g, S, bx + ow * 0.8, by + ow, BW, BH, 3 + ow * 0.4, 0.42 * A);
  sprayOn(g, O, bx, by, BW, BH, 2.5 + ow * 0.6, A);
  sprayOn(g, F, bx, by, BW, BH, 1.4, 0.95 * A);
  // the letters' inner line work on half the pieces: the skeleton
  // sprayed thin in the outline colour, broken in places
  if (R(6) < 0.5) {
    const [In, ig] = scratch(5, BW, BH); ig.fillStyle = line;
    const ri = Math.max(0.8, sw * 0.055), fine = (pts) => (pts.length > 1 ? sampled(pts, Math.max(0.4, ri * 0.45)) : pts);
    strokes.forEach((s, j) => { const cut = Math.floor(s.length * (0.15 + 0.5 * R(600 + j))); dabs(ig, fine(s.slice(0, cut)), ri, seed + 70 + j, 0.3); dabs(ig, fine(s.slice(cut + Math.floor(s.length * 0.12))), ri, seed + 90 + j, 0.3); });
    sprayOn(g, In, bx, by, BW, BH, 1.0, 0.75 * A);
  }
  sprayOn(g, Hl, bx, by, BW, BH, 1.0, 0.45 * A);
  // runs from the low points of the strokes, in the fill or the outline colour
  const rl = [];
  strokes.forEach((s, j) => {
    if (R(500 + j) > 0.45) return;
    const lo = lowest(s), len = (0.04 + 0.3 * R(510 + j) ** 2) * h * 1.6, onLine = R(520 + j) < 0.5;
    rl.push([bx + lo[0] + (R(530 + j) - 0.5) * sw * 0.6, by + lo[1] + (onLine ? sw / 2 + ow * 0.6 : sw * 0.35), len, onLine ? line : (kind === 'chrome' ? '#8e979f' : fill), 1.1 + R(540 + j) * 1.3]);
  });
  runs(g, rl, A);
  // the mist round the outline
  const pts = strokes.flat().map(([px, py]) => [bx + px, by + py]);
  mist(g, pts, sw / 2 + ow, line, Math.round(pts.length * 0.7), seed + k, A);
}
// a tag: 3-6 invented letters in one fast thin line (tall, slanted, the corners sharp or rounded), one colour, an underline
// swash, sometimes a run; o.cols: palette, o.a: opacity
function tag(g, x, y, w, h, seed, k, o = {}) {
  if (typeof document === 'undefined') return;
  const R = (a, b = 0) => hash(a, b, seed * 11 + k);
  const cols = o.cols ?? ['#0e0e0e', '#0e0e0e', '#0e0e0e', '#1b2a5a', '#0e0e0e', '#bcbcb6', '#6e1d1d'];
  const col = cols[Math.floor(R(1) * cols.length)], A = o.a ?? 0.92;
  const n = 3 + Math.floor(R(2) * 4), lw = w / n, lh = h, r = Math.max(0.8, h * (0.035 + 0.03 * R(3)));
  const pad = Math.ceil(lh * 0.8 + 8), bx = Math.floor(x - pad), by = Math.floor(y - pad), BW = Math.ceil(w + pad * 2 + lw * 1.5), BH = Math.ceil(lh * 1.7 + pad * 2);
  const [T, tg] = scratch(4, BW, BH); tg.fillStyle = col;
  const sl = 0.35 + 0.35 * R(4), lines = [];
  for (let i = 0; i < n; i++) {
    const t = GLY[Math.floor(R(10 + i) * GLY.length)];
    const ox = x - bx + i * lw, oy = y - by + (R(30 + i) - 0.5) * lh * 0.18, sx = lw * (0.85 + 0.3 * R(35 + i)), sy = lh * (0.85 + 0.35 * R(36 + i));
    for (const poly of t) {
      const Q = poly.map((p) => [ox + (p[0] + (R(50 + i, p[0] * 9 + p[1]) - 0.5) * 0.36) * sx + (1 - p[1]) * sx * sl, oy + (p[1] + (R(60 + i, p[1] * 9 + p[0]) - 0.5) * 0.3) * sy]);
      lines.push(Q.length > 2 && R(70 + i) < 0.5 ? curve(Q, 1) : sampled(Q, 1));
    }
  }
  lines.push(curve([[x - bx - lw * 0.2, y - by + lh * 1.1], [x - bx + w * 0.5, y - by + lh * (1.25 + 0.2 * R(80))], [x - bx + w * 1.05, y - by + lh * 0.95]], 1));
  lines.forEach((s, j) => dabs(tg, s, r, seed + j, 0.25));
  if (col === '#bcbcb6') {   // a light tag gets a dark halo
    const [Sh, shg] = scratch(5, BW, BH); shg.drawImage(T, 0, 0); shg.globalCompositeOperation = 'source-in'; shg.fillStyle = '#111111'; shg.fillRect(0, 0, BW, BH);
    sprayOn(g, Sh, bx + 1.5, by + 1.5, BW, BH, 2.2, 0.6 * A);
  }
  sprayOn(g, T, bx, by, BW, BH, 1.2 + r * 0.6, A);
  if (R(90) < 0.35) { const lo = lowest(lines[Math.floor(R(91) * lines.length)]); runs(g, [[bx + lo[0], by + lo[1], lh * (0.2 + 0.6 * R(92)), col, Math.max(0.8, r * 0.7)]], A); }
}
// a roller buff or a paint-out: horizontal roller passes with ragged ends and lap marks, over (x, y, w, h)
function buff(g, x, y, w, h, col, seed, a, pxm) {
  const rw = 0.11 * pxm, BW = Math.ceil(w + rw * 6), BH = Math.ceil(h + rw * 4);
  const [B, bg] = scratch(6, BW, BH); bg.fillStyle = col;
  for (let p = 0; p * rw * 0.8 < h; p++) {
    const yy = rw * 2 + p * rw * 0.8, x0 = rw * 2 + (hash(p, seed, 6) - 0.5) * rw * 2.5, x1 = rw * 2 + w + (hash(p, seed, 7) - 0.5) * rw * 3.5;
    dabs(bg, sampled([[x0, yy], [x1, yy + (hash(p, seed, 8) - 0.5) * rw * 0.5]], rw * 0.3), rw * 0.5, seed + p, 0.1);
  }
  // lap marks: the roller's edge leaves faint darker lines
  bg.globalCompositeOperation = 'source-atop'; bg.fillStyle = 'rgba(0,0,0,0.12)';
  for (let p = 0; p * rw * 0.8 < h; p += 2) bg.fillRect(0, rw * 2 + p * rw * 0.8 + rw * 0.42, BW, 1.2);
  sprayOn(g, B, x - rw * 2, y - rw * 2, BW, BH, 1.0, a);
}
// layered graffiti over what the canvas already holds: the old work (faded tags and throw-ups), roller buffs over parts of it,
// the newer pieces in two overlapping rows, fresh tags over them, stickers, then the sun and the street on all of it.
// o: { density 0..1, pxm pixels per metre, bandTop share of the height where the pieces start (0.4) }
export function paintGraffiti(g, W, H, seed, o = {}) {
  if (typeof document === 'undefined') return;
  const dens = o.density ?? 0.8, pxm = o.pxm ?? 130, top = (o.bandTop ?? 0.4) * H;
  const R = (a, b = 0) => hash(a, b, seed);
  g.save();
  // the old work, all over the gate
  for (let i = 0; i < Math.round((W / pxm) * 2.0 * dens); i++) {
    tag(g, R(600 + i, 1) * (W - pxm * 0.8), H * (0.04 + 0.86 * R(600 + i, 2)), (0.5 + 0.6 * R(600 + i, 3)) * pxm, (0.22 + 0.22 * R(600 + i, 4)) * pxm, seed + 17, 60 + i, { cols: OLD, a: 0.3 + 0.25 * R(600 + i, 5) });
  }
  for (let i = 0; i < Math.max(1, Math.round((W / pxm) * 0.3 * dens)); i++) {
    const pw = (1.3 + 0.9 * R(650 + i, 1)) * pxm, ph = (0.7 + 0.4 * R(650 + i, 2)) * pxm;
    piece(g, R(650 + i, 3) * (W - pw), top * 0.5 + R(650 + i, 4) * (H - top * 0.5 - ph), pw, ph, seed + 23, 80 + i, [['#9a9ea0', '#a9a9a2', '#7b8a9e'][i % 3], '#1a1a1a'], { a: 0.42 + 0.2 * R(650 + i, 5) });
  }
  // roller buffs over parts of it (mismatched browns and greys)
  for (let i = 0; i < 1 + Math.round(2.5 * dens); i++) {
    const w = (0.9 + 2.0 * R(i, 1)) * pxm, h = (0.5 + 0.9 * R(i, 2)) * pxm;
    buff(g, R(i, 3) * (W - w), top * 0.7 + R(i, 4) * (H - top * 0.7 - h * 0.7), w, h, ['#3a3633', '#4a4540', '#2a2826', '#57514a'][i % 4], seed * 13 + i, 0.8 + 0.15 * R(i, 5), pxm);
  }
  // the newer pieces
  const nBig = Math.max(2, Math.round((W / pxm) * (0.4 + 0.35 * dens)));
  const cell = W / nBig, band = H - top;
  const order = [...Array(nBig).keys()].sort((a, b) => R(900 + a, 1) - R(900 + b, 1));
  order.forEach((i, rank) => {
    const pw = (2.3 + 0.8 * R(100 + i, 1)) * pxm, ph = (1.3 + 0.5 * R(100 + i, 2)) * pxm;
    const row = i % 2;
    const x = i * cell + cell * 0.5 - pw * 0.5 + (R(100 + i, 3) - 0.5) * cell * 0.5;
    const y = Math.min(H - ph * 0.98, top + row * band * 0.36 + R(100 + i, 4) * band * 0.14);
    if (R(100 + i, 6) < 0.3) buff(g, x, y - ph * 0.08, pw * 0.98, ph * 1.12, '#121212', seed * 17 + i, 0.88, pxm);
    piece(g, x, y, pw, ph, seed, i + rank * 3, FILLS[PICK[(i + seed) % PICK.length]]);
  });
  // fresh tags between, over and above the pieces
  for (let i = 0; i < Math.round((W / pxm) * 1.4 * dens); i++) {
    tag(g, R(200 + i, 1) * (W - pxm * 0.9), top * 0.7 + R(200 + i, 2) * (H - top * 0.7) * 0.85, (0.5 + 0.5 * R(200 + i, 3)) * pxm, (0.24 + 0.2 * R(200 + i, 4)) * pxm, seed, i);
  }
  // stickers: a few small pale labels, scuffed
  for (let i = 0; i < Math.round((W / pxm) * 0.5 * dens); i++) {
    const w = (0.12 + 0.14 * R(300 + i, 1)) * pxm, h = (0.08 + 0.08 * R(300 + i, 2)) * pxm, x = R(300 + i, 3) * (W - w), y = top * 0.5 + R(300 + i, 4) * (H - top * 0.5 - h);
    g.globalAlpha = 0.75; g.fillStyle = ['#cfccc0', '#c2b65a', '#a8453e', '#aab3ba'][i % 4]; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(20,20,20,0.6)'; g.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, Math.max(1.2, h * 0.16)); g.fillRect(x + w * 0.1, y + h * 0.6, w * 0.5, Math.max(1.2, h * 0.16));
  }
  g.globalAlpha = 1;
  // the sun and the street: the colours lose a quarter of their chroma, chalky faded patches, a grey film thickest at the foot
  g.globalCompositeOperation = 'saturation'; g.globalAlpha = 0.15; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (let i = 0; i < Math.round((W / pxm) * 3); i++) {
    const x = R(700 + i, 1) * W, y = R(700 + i, 2) * H, r = (0.3 + 0.8 * R(700 + i, 3)) * pxm;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(150,145,136,${0.05 + 0.09 * R(700 + i, 4)})`); gr.addColorStop(1, 'rgba(150,145,136,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const fg = g.createLinearGradient(0, H * 0.35, 0, H); fg.addColorStop(0, 'rgba(96,90,82,0)'); fg.addColorStop(1, 'rgba(96,90,82,0.24)');
  g.fillStyle = fg; g.fillRect(0, H * 0.35, W, H * 0.65);
  // a dull warm film
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(212,208,202)'; g.fillRect(0, top * 0.8, W, H - top * 0.8);
  g.restore();
}

// ------------------------------------------------------------------ a ribbed roll-down shutter (slats every 75 mm)
// wM x hM metres; base: sRGB '#rrggbb' of the painted steel; density 0 = plain, up to 1 = covered. Returns a wallMat whose map
// has the graffiti under a rib shading (multiplied), and a normal map of the slats. The texture is this shutter's own.
export function graffitiShutter(wM, hM, seed, o = {}) {
  const pxm = o.pxm ?? 120, W = Math.max(64, Math.round(wM * pxm)), H = Math.max(64, Math.round(hM * pxm));
  const tint = o.base ?? '#c8cbce', dens = o.density ?? 0;
  if (typeof document === 'undefined') return wallMat({ color: new THREE.Color(tint), roughness: 0.5, metalness: 0.1 });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || typeof g.getImageData !== 'function') return wallMat({ color: new THREE.Color(tint), roughness: 0.5, metalness: 0.1 });
  g.fillStyle = tint; g.fillRect(0, 0, W, H);
  // paint variation: lighter along the top, soot and wear along the bottom, vertical dirt runs
  const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(255,255,255,0.08)'); vg.addColorStop(0.7, 'rgba(0,0,0,0.08)'); vg.addColorStop(1, 'rgba(20,16,12,0.30)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // worn paint: slats whose paint is chipped to bare galvanised steel (lighter, scuffed) and patches of rust bloom
  const perS = 0.075 * pxm;
  for (let k = 0; k * perS < H; k++) {
    if (hash(k, seed, 31) < 0.28) { g.fillStyle = `rgba(150,154,158,${0.10 + 0.14 * hash(k, seed, 32)})`; const x0 = hash(k, seed, 33) * W * 0.6; g.fillRect(x0, k * perS, W * (0.2 + 0.5 * hash(k, seed, 34)), perS * 0.85); }
  }
  for (let r = 0; r < Math.round(wM * 2.2 * (dens > 0 ? 1 : 0.25)); r++) { const rx = hash(r, seed, 41) * W, ry = H * (0.55 + 0.45 * hash(r, seed, 42)), rr = (0.15 + 0.35 * hash(r, seed, 43)) * pxm; const rg = g.createRadialGradient(rx, ry, 0, rx, ry, rr); rg.addColorStop(0, `rgba(120,64,34,${dens > 0 ? 0.28 : 0.1})`); rg.addColorStop(1, 'rgba(120,64,34,0)'); g.fillStyle = rg; g.fillRect(rx - rr, ry - rr, 2 * rr, 2 * rr); }
  // vertical dirt runs
  for (let s = 0; s < Math.round(wM * (dens > 0 ? 6 : 1.2)); s++) { g.fillStyle = `rgba(24,20,16,${(dens > 0 ? 1 : 0.5) * (0.06 + 0.12 * hash(s, seed, 2))})`; g.fillRect(hash(s, seed, 3) * W, hash(s, seed, 4) * H * 0.4, 1 + hash(s, seed, 5) * 3, H * (0.2 + 0.6 * hash(s, seed, 6))); }
  if (dens > 0) {
    paintGraffiti(g, W, H, seed, { density: dens, pxm, bandTop: o.bandTop ?? 0.4 });
    // a film of street dust over all of it
    { const dg = g.createLinearGradient(0, H * 0.2, 0, H); dg.addColorStop(0, 'rgba(92,86,78,0)'); dg.addColorStop(1, 'rgba(92,86,78,0.16)'); g.globalAlpha = 1; g.fillStyle = dg; g.fillRect(0, H * 0.2, W, H * 0.8); }
    // rust: thin lines along some slat joints and short runs from them
    for (let k = 0; k * perS < H; k++) { if (hash(k, seed, 51) > 0.3) continue; const x0 = hash(k, seed, 52) * W * 0.7, ww = W * (0.1 + 0.4 * hash(k, seed, 53)); g.fillStyle = `rgba(110,62,34,${0.18 + 0.2 * hash(k, seed, 54)})`; g.fillRect(x0, (k + 1) * perS - 1.5, ww, 1.6); for (let q = 0; q < 3; q++) { const rx = x0 + hash(k, q, seed + 55) * ww, rl = perS * (0.5 + 3 * hash(k, q, seed + 56)); const rg2 = g.createLinearGradient(0, (k + 1) * perS, 0, (k + 1) * perS + rl); rg2.addColorStop(0, 'rgba(110,62,34,0.3)'); rg2.addColorStop(1, 'rgba(110,62,34,0)'); g.fillStyle = rg2; g.fillRect(rx, (k + 1) * perS, 1.5, rl); } }
    // weathering over the paint: sooty runs from the top, a dusty bloom along the bottom, faint scuffs
    for (let s2 = 0; s2 < Math.round(wM * 9); s2++) { const gx = hash(s2, seed, 21) * W, gw = 2 + hash(s2, seed, 22) * 9, gl = H * (0.25 + 0.7 * hash(s2, seed, 23)); const gg = g.createLinearGradient(0, 0, 0, gl); gg.addColorStop(0, `rgba(25,22,20,${0.10 + 0.14 * hash(s2, seed, 24)})`); gg.addColorStop(1, 'rgba(25,22,20,0)'); g.fillStyle = gg; g.fillRect(gx, 0, gw, gl); }
    const bg2 = g.createLinearGradient(0, H * 0.82, 0, H); bg2.addColorStop(0, 'rgba(120,112,100,0)'); bg2.addColorStop(1, 'rgba(120,112,100,0.22)'); g.fillStyle = bg2; g.fillRect(0, H * 0.82, W, H * 0.18);
  }
  // the slats: shade each (light top edge, dark underside) by multiplying, and build the normal map from the same profile
  const per = 0.075 * pxm, img = g.getImageData(0, 0, W, H);
  if (!img || !img.data || img.data.length < W * H * 4) return wallMat({ color: new THREE.Color(tint), roughness: 0.5, metalness: 0.1 });
  const d = img.data, nd = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const f = (y % per) / per, k = Math.floor(y / per);
    const sh = f < 0.2 ? 0.8 + 1.0 * f : f < 0.7 ? 1.0 + 0.1 * Math.sin((f - 0.2) * 6.28) * 0.5 : 1.0 - (f - 0.7) * 2.2;     // 0.8 .. 1.0 .. 0.34
    const sl = (hash(k, seed, 9) - 0.5) * 0.08;
    // height profile: a ridge per slat; its slope gives the normal
    const hy = (ff) => (ff < 0.15 ? ff / 0.15 : ff < 0.65 ? 1 : 1 - (ff - 0.65) / 0.35);
    const dh = (hy(Math.min(0.999, f + 0.02)) - hy(Math.max(0, f - 0.02))) * 2.6;
    const nl = Math.hypot(dh, 1);
    for (let x = 0; x < W; x++) {
      const i4 = (y * W + x) * 4, m = sh + sl;
      d[i4] = Math.max(0, Math.min(255, d[i4] * m)); d[i4 + 1] = Math.max(0, Math.min(255, d[i4 + 1] * m)); d[i4 + 2] = Math.max(0, Math.min(255, d[i4 + 2] * m));
      nd[i4] = 128; nd[i4 + 1] = (dh / nl * 0.5 + 0.5) * 255; nd[i4 + 2] = (1 / nl * 0.5 + 0.5) * 255; nd[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  c2.getContext('2d').putImageData(new ImageData(nd, W, H), 0, 0);
  const normalMap = new THREE.CanvasTexture(c2); normalMap.colorSpace = THREE.NoColorSpace; normalMap.anisotropy = 8;
  return wallMat({ map, normalMap, normalScale: new THREE.Vector2(1, 1), roughness: o.rough ?? 0.52, metalness: o.metal ?? 0.1 });
}

// ------------------------------------------------------------------ a weathered stucco fascia
// wM x hM metres. base [r, g, b]; rain streaks run down from the top edge, stains and blotches, patches of faded paint and the
// ghost of a painted script sign (o.ghost: [x0, x1] metres), black glyph fragments at the left end where the sign still shows.
export function stuccoWall(wM, hM, seed, o = {}) {
  const pxm = o.pxm ?? 90, W = Math.round(wM * pxm), H = Math.round(hM * pxm), base = o.base ?? [178, 168, 146];
  if (typeof document === 'undefined') return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.92 });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || typeof g.getImageData !== 'function') return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.92 });
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, W, H);
  const R = (a, b = 0) => hash(a, b, seed);
  // large soft blotches (uneven fading), then fine grain
  for (let i = 0; i < 40; i++) { const x = R(i, 1) * W, y = R(i, 2) * H, r = (0.4 + 1.6 * R(i, 3)) * pxm; const gr = g.createRadialGradient(x, y, 0, x, y, r); const dk = R(i, 4) < 0.6; gr.addColorStop(0, dk ? 'rgba(70,58,42,0.17)' : 'rgba(255,248,230,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  // the ghost of the old sign: strokes of a script, mostly washed out
  if (o.ghost) {
    const [a, b] = o.ghost; g.lineCap = 'round'; g.lineJoin = 'round';
    // a darker grey where the paint ate into the stucco): tall loops joined along a baseline, then a few washed-out strokes
    const x0 = a * pxm, x1 = b * pxm, base = H * 0.82, top = H * 0.12, n = Math.max(4, Math.round((b - a) / 1.4));
    g.strokeStyle = `rgba(70,60,50,${o.ghostA ?? 0.26})`; g.lineWidth = 0.1 * pxm;
    g.beginPath(); g.moveTo(x0, base - (base - top) * 0.2);
    for (let k = 0; k < n; k++) {
      const xa = x0 + ((x1 - x0) * k) / n, xb = x0 + ((x1 - x0) * (k + 1)) / n, w = xb - xa, hk = (base - top) * (0.55 + 0.45 * R(k, 31));
      // an upstroke into a loop (an l, an h or an o by turns), down to the baseline, the joining hairline
      g.bezierCurveTo(xa + w * 0.35, base - hk * 1.05, xa + w * 0.8, base - hk * 0.95, xa + w * 0.5, base - hk * 0.35);
      g.bezierCurveTo(xa + w * 0.3, base + hk * 0.05, xa + w * 0.75, base + 0.02 * H, xb, base - hk * (0.15 + 0.2 * R(k, 32)));
    }
    g.stroke();
    for (let s = 0; s < 8; s++) {
      const xs = (a + R(s, 11) * (b - a)) * pxm, ys = H * (0.2 + 0.6 * R(s, 12)), len = (0.4 + 0.9 * R(s, 13)) * pxm;
      g.strokeStyle = `rgba(55,45,35,${(0.08 + 0.1 * R(s, 14)) * (o.ghostA ?? 0.26) / 0.26})`; g.lineWidth = 6 + 8 * R(s, 15);
      g.beginPath(); g.moveTo(xs, ys); g.bezierCurveTo(xs + len * 0.4, ys - len * 0.6, xs + len * 0.7, ys + len * 0.2, xs + len, ys - len * 0.3); g.stroke();
    }
  }
  if (o.glyphs) {   // black rounded fragments where the old letters still stand
    g.lineCap = 'round'; g.strokeStyle = 'rgba(14,12,10,0.93)';
    for (const [x, y, r, a0, a1, lw] of o.glyphs) { g.lineWidth = lw * pxm; g.beginPath(); g.arc(x * pxm, y * pxm, r * pxm, a0, a1); g.stroke(); }
  }
  // rain streaks from the top edge: long, thin, dark, ragged
  for (let i = 0; i < Math.round(wM * 7 * (o.streaks ?? 1)); i++) {
    const x = R(i, 21) * W, w = 1 + R(i, 22) * 5, len = H * (0.3 + 0.7 * R(i, 23));
    const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(60,48,36,${0.1 + 0.09 * R(i, 24)})`); gr.addColorStop(1, 'rgba(60,48,36,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  { const sg = g.createLinearGradient(0, 0, 0, H * 0.22); sg.addColorStop(0, `rgba(50,40,30,${o.topSoot ?? 0.22})`); sg.addColorStop(1, 'rgba(50,40,30,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H * 0.22); }
  // fine grain
  const img = g.getImageData(0, 0, W, H);
  if (img && img.data && img.data.length >= W * H * 4) {
    const d = img.data;
    for (let q = 0; q < W * H; q++) { const n = (hash(q % W * 0.7, Math.floor(q / W) * 0.7, seed + 5) - 0.5) * 22; d[q * 4] += n; d[q * 4 + 1] += n; d[q * 4 + 2] += n * 0.9; }
    g.putImageData(img, 0, 0);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return wallMat({ map, roughness: 0.93, metalness: 0 });
}

// ------------------------------------------------------------------ vertical corrugated sheet metal (a silver cladding) and timber slats
// ribs every `per` metres (a 19 mm deep wave), streaked with rain stains; normal map from the wave.
export function corrugatedMetal(wM, hM, seed, o = {}) {
  const pxm = o.pxm ?? 100, W = Math.max(64, Math.round(wM * pxm)), H = Math.max(64, Math.round(hM * pxm)), per = (o.per ?? 0.1) * pxm, base = o.base ?? [200, 204, 207];
  if (typeof document === 'undefined') return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.45, metalness: 0.2 });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || typeof g.getImageData !== 'function') return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.45, metalness: 0.2 });
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.round(wM * 6); i++) { const x = hash(i, seed, 1) * W, w = 2 + hash(i, seed, 2) * 8, len = H * (0.3 + 0.7 * hash(i, seed, 3)); const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(70,62,52,${0.1 + 0.16 * hash(i, seed, 4)})`); gr.addColorStop(1, 'rgba(70,62,52,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); }
  const img = g.getImageData(0, 0, W, H);
  if (!img || !img.data || img.data.length < W * H * 4) return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.45, metalness: 0.2 });
  const d = img.data, nd = new Uint8ClampedArray(W * H * 4);
  for (let x = 0; x < W; x++) {
    const ph = (x % per) / per * Math.PI * 2, sh = 1 + 0.2 * Math.sin(ph + 0.6), dh = Math.cos(ph) * 0.9, nl = Math.hypot(dh, 1);
    for (let y = 0; y < H; y++) {
      const i4 = (y * W + x) * 4, n = 1 + (hash(x * 0.3, y * 0.05, seed) - 0.5) * 0.06;
      d[i4] = Math.min(255, d[i4] * sh * n); d[i4 + 1] = Math.min(255, d[i4 + 1] * sh * n); d[i4 + 2] = Math.min(255, d[i4 + 2] * sh * n);
      nd[i4] = (-dh / nl * 0.5 + 0.5) * 255; nd[i4 + 1] = 128; nd[i4 + 2] = (1 / nl * 0.5 + 0.5) * 255; nd[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  c2.getContext('2d').putImageData(new ImageData(nd, W, H), 0, 0);
  const normalMap = new THREE.CanvasTexture(c2); normalMap.colorSpace = THREE.NoColorSpace; normalMap.anisotropy = 8;
  return wallMat({ map, normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.42, metalness: 0.25 });
}
// timber slats: boards of `bw` metres standing, each its own tone and grain, dark joints
export function woodSlats(wM, hM, seed, o = {}) {
  const pxm = o.pxm ?? 100, W = Math.max(64, Math.round(wM * pxm)), H = Math.max(64, Math.round(hM * pxm)), bw = (o.bw ?? 0.12) * pxm, base = o.base ?? [112, 78, 52];
  if (typeof document === 'undefined') return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.7 });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || !g.fillRect) return wallMat({ color: new THREE.Color(`rgb(${base[0]},${base[1]},${base[2]})`), roughness: 0.7 });
  // o.dir 'h': boards running across, else upright
  const hz = o.dir === 'h', span = hz ? H : W;
  for (let b = 0; b * bw < span; b++) {
    const k = 0.82 + 0.3 * hash(b, seed, 1);
    g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    if (hz) g.fillRect(0, b * bw, W, bw); else g.fillRect(b * bw, 0, bw, H);
    for (let l = 0; l < 6; l++) { g.fillStyle = `rgba(40,25,14,${0.06 + 0.1 * hash(b, l, seed + 2)})`; const t = b * bw + hash(b, l, seed + 3) * bw; if (hz) g.fillRect(0, t, W, 1); else g.fillRect(t, 0, 1, H); }
    g.fillStyle = 'rgba(20,12,6,0.55)'; if (hz) g.fillRect(0, b * bw, W, 1.6); else g.fillRect(b * bw, 0, 1.6, H);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return wallMat({ map, roughness: 0.72, metalness: 0 });
}

// ------------------------------------------------------------------ black block letters as a decal (a canvas alpha mask)
// A word in a heavy sans, crisp edges, a very dark satin paint with a
// hint of gloss. frame: the builder's frame; the quad stands at depth w (out of the wall).
const _TD = new Map();
export function textDecal(frame, text, u0, u1, y0, y1, w, o = {}) {
  const key = text + '|' + (o.color ?? '#050505') + '|' + (o.weight ?? 900) + '|' + (o.fit ? 1 : 0);
  let m = _TD.get(key);
  if (!m) {
    let map = null;
    if (typeof document !== 'undefined') {
      const W = 1024, H = Math.max(64, Math.round(1024 * (y1 - y0) / (u1 - u0))), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      if (g && g.fillText) {
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = H * 0.92; g.font = `${o.weight ?? 900} ${fs}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
        const mw = g.measureText(text).width;
        // o.fit: the letters fill the box's width at the full height (a condensed face: the capital height is ~0.66 of the box, the
        // width squeezed or stretched to the box), else the text keeps its proportions and shrinks to fit
        let sx = 1;
        if (o.fit) sx = (W * 0.98) / mw;
        else if (mw > W * 0.98) { fs *= (W * 0.98) / mw; g.font = `${o.weight ?? 900} ${fs}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; }
        g.save(); g.translate(W / 2, 0); g.scale(sx, 1);
        g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = H * 0.075; g.strokeText(text, 0, H * 0.54);   // fatter strokes
        g.fillText(text, 0, H * 0.54);
        g.restore();
        map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      }
    }
    // a flat paint colour (no sheen: black letters read black, not the sky's blue)
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? '#050505'), alphaMap: map, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
    if (!map) m.alphaTest = 0;
    _TD.set(key, m);
  }
  const q = quadMesh(frame, m, u0, u1, y0, y1, w, { uv: [0, 1, 0, 1] });
  q.castShadow = false;
  return q;
}

// ------------------------------------------------------------------ the script capital of the old shoe store's sign (120 W 125th)
// A pointed-pen capital F drawn from scratch shape: a waved top stroke ending in a curl, the
// stem falling from it to a hooked foot with a ball terminal, a looped bar at mid height, and the dot right of it. Black raised letters
// on the fascia: the decal carries the glyph (opaque) and its soft cast shadow (alpha ~0.3) in one alpha map. wM x hM metres.
let _SF = null;
export function scriptF(frame, u0, u1, y0, y1, w) {
  if (!_SF) {
    let map = null;
    if (typeof document !== 'undefined') {
      const W = 512, H = Math.round(512 * (y1 - y0) / (u1 - u0)), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      if (g && g.beginPath) {
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const S = (x, y) => [x * W, y * H];
        // a variable-width stroke along a cubic: discs from w0 through wm (middle) to w1 (fractions of W)
        const pen = (p0, p1, p2, p3, w0, wm, w1, col) => {
          g.fillStyle = col;
          for (let i = 0; i <= 90; i++) {
            const t = i / 90, a = 1 - t, b = [0, 1].map((k) => a * a * a * p0[k] + 3 * a * a * t * p1[k] + 3 * a * t * t * p2[k] + t * t * t * p3[k]);
            const r = (t < 0.5 ? w0 + (wm - w0) * (t * 2) : wm + (w1 - wm) * (t * 2 - 1)) * W * 0.5;
            const [x, y] = S(b[0], b[1]); g.beginPath(); g.arc(x, y, Math.max(0.8, r), 0, Math.PI * 2); g.fill();
          }
        };
        const glyph = (col, dx, dy) => {
          const o = (p) => [p[0] + dx, p[1] + dy];
          // the top stroke: a small curl at the left, rising, waved across, curling down at the right end
          pen(o([0.13, 0.30]), o([0.04, 0.22]), o([0.10, 0.10]), o([0.24, 0.10]), 0.012, 0.03, 0.045, col);
          pen(o([0.24, 0.10]), o([0.42, 0.10]), o([0.55, 0.02]), o([0.78, 0.04]), 0.06, 0.095, 0.065, col);
          pen(o([0.78, 0.04]), o([0.92, 0.05]), o([0.99, 0.12]), o([0.93, 0.18]), 0.065, 0.04, 0.016, col);
          // the stem: from under the top stroke, heavy, curving down and left to the foot
          pen(o([0.55, 0.08]), o([0.57, 0.30]), o([0.53, 0.62]), o([0.36, 0.86]), 0.05, 0.15, 0.095, col);
          // the foot: a hook up to the left and a ball terminal
          pen(o([0.36, 0.86]), o([0.27, 0.98]), o([0.10, 0.97]), o([0.07, 0.86]), 0.095, 0.05, 0.03, col);
          g.fillStyle = col; { const [x, y] = S(0.09 + dx, 0.79 + dy); g.beginPath(); g.arc(x, y, 0.07 * W, 0, Math.PI * 2); g.fill(); }
          // the bar at mid height with its loop at the right end
          pen(o([0.33, 0.58]), o([0.45, 0.55]), o([0.62, 0.52]), o([0.70, 0.46]), 0.018, 0.05, 0.028, col);
          pen(o([0.70, 0.46]), o([0.76, 0.40]), o([0.66, 0.38]), o([0.66, 0.48]), 0.028, 0.022, 0.014, col);
          // the dot (c120 / r120b: 5.25-5.35 m, about 0.3 of the box from its top)
          { const [x, y] = S(0.955 + dx, 0.30 + dy); g.beginPath(); g.arc(x, y, 0.05 * W, 0, Math.PI * 2); g.fill(); }
        };
        // the cast shadow (the letters stand ~6 cm proud: a soft dark copy down and right), then the glyph
        if ('filter' in g) g.filter = 'blur(5px)';
        glyph('rgb(80,80,80)', 0.018, 0.022);
        if ('filter' in g) g.filter = 'none';
        glyph('#ffffff', 0, 0);
        map = new THREE.CanvasTexture(cv); map.anisotropy = 8;
      }
    }
    // a flat black
    _SF = new THREE.MeshBasicMaterial({ color: 0x070707, alphaMap: map, transparent: !!map, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  }
  const q = quadMesh(frame, _SF, u0, u1, y0, y1, w, { uv: [0, 1, 0, 1] });
  q.castShadow = false; q.renderOrder = 2;
  return q;
}

// ------------------------------------------------------------------ a tall vertical mural (invented): stacked bubble letters on a transparent canvas
// wM x hM metres; the letters read top to bottom. Returns a transparent decal material (alpha from the canvas).
export function muralTall(wM, hM, seed, o = {}) {
  const pxm = o.pxm ?? 60, W = Math.round(wM * pxm), H = Math.round(hM * pxm);
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g || !g.fillRect) return null;
  g.clearRect(0, 0, W, H);
  // paint the pieces rotated: a piece laid along y reads downward when the context is turned a quarter
  g.save(); g.translate(W, 0); g.rotate(Math.PI / 2);
  const pal = [FILLS[2], FILLS[3], FILLS[1], FILLS[0], FILLS[5]];
  const rows = 2;
  for (let r = 0; r < rows; r++) {
    const ph = (W / rows) * 0.92, pw = H * (0.42 + 0.06 * hash(r, seed, 1)), y0 = r * (W / rows) + (W / rows) * 0.04;
    for (let k = 0; k < 2; k++) piece(g, (k * (H * 0.5)) + 0.04 * H, y0, pw, ph, seed + r, k + r * 2, pal[(r + k * 2 + seed) % pal.length]);
  }
  g.restore();
  // a few tags and a crown on top
  for (let i = 0; i < 5; i++) tag(g, hash(i, seed, 3) * (W - 80), hash(i, seed, 4) * (H - 60), 70, 26, seed, i);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const m = applyLightTrim(new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  return m;
}
