// AR34 PROPS sign faces (part pk, docs/notes/ar33-props.md): the NYC DOT parking regulation plates and the MUTCD / NYC DOT
// signs on the signal poles, drawn from scratch to the published layouts (legend heights, borders and symbols set as
// fractions of the blank), then weathered: a sun-faded veil, a grime film heavier at the foot, streaks from the top edge,
// speckle, fine scratches, and on some plates a sticker or a marker tag (invented, never copied). Nothing is sampled from
// a photograph. Lettering: Barlow Condensed (OFL, public/fonts/ar33/, the SIGNS part's folder), the closest open face
// to the DOT's highway gothic; the plates fall back to the system's narrow sans until it loads.
import * as THREE from 'three';

const FACES = [['pkSignC', 'fonts/ar33/BarlowCondensed-SemiBold.ttf', '600'], ['pkSignC', 'fonts/ar33/BarlowCondensed-Bold.ttf', '700']];
export const signsReady = (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts)
  ? Promise.resolve(false)
  : Promise.race([
    Promise.all(FACES.map(([f, u, w]) => { const ff = new FontFace(f, `url("${u}")`, { weight: w }); document.fonts.add(ff); return ff.load(); }))
      .then(() => true, () => false),
    new Promise((r) => setTimeout(() => r(false), 6000)),
  ]);
const FF = '"pkSignC", "Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif';

const _tex = new Map();
function tex(key, w, h, draw) {
  let t = _tex.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  _tex.set(key, t);
  return t;
}
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
function fit(x, s, maxW, px, wt = 700) {
  let p = px;
  do { x.font = `${wt} ${p}px ${FF}`; if (x.measureText(s).width <= maxW) break; p -= 1; } while (p > 8);
  return p;
}
function text(x, s, cx, y, maxW, px, col, wt = 700, align = 'center') {
  const p = fit(x, s, maxW, px, wt);
  x.font = `${wt} ${p}px ${FF}`; x.fillStyle = col; x.textAlign = align; x.textBaseline = 'alphabetic';
  x.fillText(s, cx, y);
  return p;
}
function rrect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r); x.lineTo(a + w, b + h - r);
  x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r);
  x.quadraticCurveTo(a, b, a + r, b); x.closePath();
}
// the DOT arrow: a shaft with a solid head at one end or both, centred on (cx, y), length L
function arrow(x, cx, y, L, t, dir, col) {
  x.fillStyle = col;
  const hw = t * 2.6, hl = t * 3.2, a = cx - L / 2, b = cx + L / 2;
  x.fillRect(a + (dir <= 0 ? hl * 0.9 : 0), y - t / 2, L - (dir === 0 ? 2 * hl * 0.9 : hl * 0.9), t);
  const head = (px, d) => { x.beginPath(); x.moveTo(px, y); x.lineTo(px - d * hl, y - hw / 2); x.lineTo(px - d * hl, y + hw / 2); x.closePath(); x.fill(); };
  if (dir >= 0) head(b, 1);
  if (dir <= 0) head(a, -1);
}

// ---- weathering (all plates): the street's grime and wear over the print
function tag(x, w, h, r, col) {
  x.strokeStyle = col; x.lineWidth = Math.max(2, h * 0.11); x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); let px = -w / 2; x.moveTo(px, (r() - 0.5) * h * 0.4);
  const n = 6 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const nx = -w / 2 + (w * (i + 1)) / n, ny = (r() - 0.5) * h * 0.7;
    x.quadraticCurveTo((px + nx) / 2 + (r() - 0.5) * w * 0.12, -h / 2 + r() * h, nx, ny); px = nx;
  }
  x.stroke();
  if (r() < 0.6) { x.lineWidth *= 0.6; x.beginPath(); x.moveTo(-w / 2, h * 0.38); x.quadraticCurveTo(0, h * (0.2 + r() * 0.3), w / 2, h * 0.3); x.stroke(); }
}
function sticker(x, w, h, r) {
  x.save();
  x.translate(w * (0.18 + r() * 0.64), h * (0.5 + r() * 0.38)); x.rotate((r() - 0.5) * 0.7);
  const sw = w * (0.2 + r() * 0.14), sh = sw * (0.5 + r() * 0.25), kind = Math.floor(r() * 3);
  x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 2;
  if (kind === 0) {
    // a name-tag label written over in marker
    x.fillStyle = '#f2f0e8'; x.fillRect(-sw / 2, -sh / 2, sw, sh);
    x.shadowBlur = 0;
    x.fillStyle = ['#c8202a', '#1d4fb8', '#1a8a3a'][Math.floor(r() * 3)]; x.fillRect(-sw / 2, -sh / 2, sw, sh * 0.3);
    x.translate(0, sh * 0.15); tag(x, sw * 0.8, sh * 0.5, r, '#111');
  } else if (kind === 1) {
    // a round band sticker
    x.fillStyle = ['#ffd23f', '#2bb3ff', '#ff5aa5', '#f4f2ea'][Math.floor(r() * 4)];
    x.beginPath(); x.arc(0, 0, sh * 0.62, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#121212'; x.font = `700 ${Math.round(sh * 0.48)}px ${FF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(['ZEKS', 'OKRA', 'MUVE', 'DRIP'][Math.floor(r() * 4)], 0, sh * 0.04);
  } else {
    x.shadowBlur = 0;
    tag(x, sw * 1.3, sh * 1.1, r, ['#141414', '#24308f', '#5a1a7a'][Math.floor(r() * 3)]);
  }
  x.restore();
}
function weather(x, w, h, seed, o = {}) {
  const r = rng(seed);
  x.save();
  x.fillStyle = `rgba(255,248,236,${o.fade ?? 0.06})`; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(62,56,46,0.03)'); g.addColorStop(0.65, 'rgba(62,56,46,0.07)'); g.addColorStop(1, `rgba(52,46,36,${0.14 + (o.grime ?? 0)})`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // the edges hold dirt
  const e = Math.max(6, w * 0.035);
  x.strokeStyle = 'rgba(55,50,40,0.16)'; x.lineWidth = e; rrect(x, e / 2, e / 2, w - e, h - e, e); x.stroke();
  for (let i = 0; i < 12; i++) {
    const sx = r() * w, sw = 2 + r() * w * 0.02, sh = h * (0.08 + r() * 0.45);
    const sg = x.createLinearGradient(0, 0, 0, sh);
    sg.addColorStop(0, `rgba(72,64,52,${0.05 + r() * 0.06})`); sg.addColorStop(1, 'rgba(72,64,52,0)');
    x.fillStyle = sg; x.fillRect(sx, 0, sw, sh);
  }
  for (let i = 0; i < (w * h) / 900; i++) {
    const s = 0.6 + r() * 1.6;
    x.fillStyle = r() < 0.55 ? `rgba(38,34,28,${0.08 + r() * 0.18})` : `rgba(255,255,255,${0.08 + r() * 0.2})`;
    x.fillRect(r() * w, r() * h, s, s);
  }
  x.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    x.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.2})`;
    const a = r() * w, b = r() * h; x.beginPath(); x.moveTo(a, b); x.lineTo(a + (r() - 0.5) * w * 0.25, b + (r() - 0.5) * h * 0.06); x.stroke();
  }
  x.restore();
  if (o.sticker && r() < o.sticker) sticker(x, w, h, r);
}

// ---- NYC DOT parking regulation plates, 12 x 18 in (0.305 x 0.457 m): face index -> layout (the order the sign
// poles' sets in pkStreet.js use)
const RED = '#c0262d', GREEN = '#0d6b3c', BLACK = '#161718', WHITE = '#f5f4ef';
// the no-parking symbol: a black P in a red ring with the slash, in a red-bordered square
function noP(x, cx, cy, s) {
  x.strokeStyle = RED; x.lineWidth = s * 0.05; x.strokeRect(cx - s / 2, cy - s / 2, s, s);
  x.fillStyle = BLACK; x.font = `700 ${Math.round(s * 0.7)}px ${FF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', cx, cy + s * 0.04);
  x.strokeStyle = RED; x.lineWidth = s * 0.085; x.beginPath(); x.arc(cx, cy, s * 0.36, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(cx - s * 0.25, cy - s * 0.25); x.lineTo(cx + s * 0.25, cy + s * 0.25); x.stroke();
}
const REG = [
  // 0 NO STANDING ANYTIME, white on red
  (x, w, h) => {
    x.fillStyle = RED; x.fillRect(0, 0, w, h);
    x.strokeStyle = WHITE; x.lineWidth = w * 0.018; rrect(x, w * 0.04, w * 0.04, w * 0.92, h - w * 0.08, w * 0.05); x.stroke();
    text(x, 'NO', w / 2, h * 0.25, w * 0.8, h * 0.17, WHITE);
    text(x, 'STANDING', w / 2, h * 0.43, w * 0.82, h * 0.15, WHITE);
    text(x, 'ANYTIME', w / 2, h * 0.62, w * 0.78, h * 0.12, WHITE, 600);
    arrow(x, w / 2, h * 0.8, w * 0.72, h * 0.03, 0, WHITE);
  },
  // 1 the no-parking symbol plate: P in the ring, the hours, the days, a red arrow
  (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    noP(x, w * 0.27, h * 0.17, w * 0.36);
    text(x, '8AM-6PM', w * 0.72, h * 0.13, w * 0.42, h * 0.07, RED, 700);
    text(x, 'EXCEPT', w * 0.72, h * 0.2, w * 0.42, h * 0.055, RED, 600);
    text(x, 'SUNDAY', w * 0.72, h * 0.27, w * 0.42, h * 0.06, RED, 700);
    text(x, 'STREET', w / 2, h * 0.43, w * 0.8, h * 0.075, RED, 700);
    text(x, 'CLEANING', w / 2, h * 0.52, w * 0.8, h * 0.075, RED, 700);
    text(x, 'MON & THURS', w / 2, h * 0.63, w * 0.84, h * 0.07, RED, 700);
    arrow(x, w / 2, h * 0.84, w * 0.72, h * 0.035, -1, RED);
  },
  // 2 the two-hour metered plate: the green numeral box, the legend, a green arrow
  (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.fillStyle = GREEN; x.fillRect(w * 0.08, h * 0.05, w * 0.34, h * 0.21);
    text(x, '2', w * 0.25, h * 0.235, w * 0.3, h * 0.2, WHITE, 700);
    text(x, 'HOUR', w * 0.71, h * 0.11, w * 0.48, h * 0.065, GREEN, 700);
    text(x, 'METERED', w * 0.71, h * 0.18, w * 0.5, h * 0.065, GREEN, 700);
    text(x, 'PARKING', w * 0.71, h * 0.25, w * 0.5, h * 0.065, GREEN, 700);
    text(x, '9AM-7PM', w / 2, h * 0.42, w * 0.8, h * 0.085, GREEN, 700);
    text(x, 'EXCEPT SUNDAY', w / 2, h * 0.52, w * 0.84, h * 0.065, GREEN, 700);
    text(x, 'PAY AT MUNI-METER', w / 2, h * 0.63, w * 0.84, h * 0.05, GREEN, 600);
    arrow(x, w / 2, h * 0.84, w * 0.72, h * 0.035, 1, GREEN);
  },
  // 3 NO STANDING EXCEPT TRUCKS LOADING & UNLOADING, red on white
  (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = RED; x.lineWidth = w * 0.016; rrect(x, w * 0.04, w * 0.04, w * 0.92, h - w * 0.08, w * 0.05); x.stroke();
    text(x, 'NO STANDING', w / 2, h * 0.14, w * 0.84, h * 0.08, RED);
    text(x, '7AM-7PM', w / 2, h * 0.25, w * 0.8, h * 0.08, RED);
    text(x, 'EXCEPT SUNDAY', w / 2, h * 0.34, w * 0.84, h * 0.06, RED, 600);
    text(x, 'EXCEPT', w / 2, h * 0.46, w * 0.7, h * 0.06, RED, 600);
    text(x, 'TRUCKS LOADING', w / 2, h * 0.55, w * 0.86, h * 0.065, RED);
    text(x, '& UNLOADING', w / 2, h * 0.64, w * 0.84, h * 0.065, RED);
    arrow(x, w / 2, h * 0.84, w * 0.72, h * 0.035, 0, RED);
  },
  // 4 NO STANDING BUS STOP, red on white with the bus mark
  (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = RED; x.lineWidth = w * 0.016; rrect(x, w * 0.04, w * 0.04, w * 0.92, h - w * 0.08, w * 0.05); x.stroke();
    text(x, 'NO', w / 2, h * 0.16, w * 0.8, h * 0.11, RED);
    text(x, 'STANDING', w / 2, h * 0.3, w * 0.84, h * 0.11, RED);
    x.fillStyle = BLACK; rrect(x, w * 0.36, h * 0.37, w * 0.28, h * 0.14, w * 0.03); x.fill();
    x.fillStyle = WHITE; x.fillRect(w * 0.39, h * 0.39, w * 0.22, h * 0.055);
    x.fillStyle = BLACK; x.beginPath(); x.arc(w * 0.42, h * 0.515, w * 0.03, 0, Math.PI * 2); x.arc(w * 0.58, h * 0.515, w * 0.03, 0, Math.PI * 2); x.fill();
    text(x, 'BUS STOP', w / 2, h * 0.66, w * 0.84, h * 0.1, RED);
    arrow(x, w / 2, h * 0.84, w * 0.72, h * 0.035, -1, RED);
  },
  // 5 DON'T BLOCK THE BOX (NYC DOT, square): legend over the box with its cross
  (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.02; rrect(x, w * 0.035, h * 0.035, w * 0.93, h * 0.93, w * 0.04); x.stroke();
    text(x, "DON'T BLOCK", w / 2, h * 0.27, w * 0.84, h * 0.17, BLACK);
    text(x, 'THE BOX', w / 2, h * 0.47, w * 0.7, h * 0.17, BLACK);
    x.lineWidth = w * 0.022; x.strokeRect(w * 0.22, h * 0.56, w * 0.56, h * 0.32);
    x.beginPath(); x.moveTo(w * 0.22, h * 0.56); x.lineTo(w * 0.78, h * 0.88); x.moveTo(w * 0.78, h * 0.56); x.lineTo(w * 0.22, h * 0.88); x.stroke();
  },
  // 6 ONE WAY (R6-1 on a square blank: the arrow with its legend)
  (x, w, h) => {
    x.fillStyle = BLACK; x.fillRect(0, 0, w, h);
    x.strokeStyle = WHITE; x.lineWidth = w * 0.014; rrect(x, w * 0.03, h * 0.03, w * 0.94, h * 0.94, w * 0.03); x.stroke();
    x.fillStyle = WHITE; x.beginPath();
    x.moveTo(w * 0.08, h * 0.38); x.lineTo(w * 0.66, h * 0.38); x.lineTo(w * 0.66, h * 0.26); x.lineTo(w * 0.93, h * 0.5);
    x.lineTo(w * 0.66, h * 0.74); x.lineTo(w * 0.66, h * 0.62); x.lineTo(w * 0.08, h * 0.62); x.closePath(); x.fill();
    text(x, 'ONE WAY', w * 0.39, h * 0.575, w * 0.52, h * 0.2, BLACK);
  },
];
export const NREG = REG.length;
export function regTex(i) {
  const k = ((i % NREG) + NREG) % NREG, sq = k >= 5;
  return tex('reg:' + k, 512, sq ? 512 : 768, (x, w, h) => { REG[k](x, w, h); weather(x, w, h, 101 + k * 17, { sticker: k === 3 || k === 1 ? 0.9 : 0.35 }); });
}

// ---- the signs on the signal poles (MUTCD R3-2, R2-1, NYC DOT DON'T BLOCK THE BOX, TRUCK ROUTE, LOCAL, BUS LANE):
// name -> [w (m), h (m), draw]
const MUT = {
  // R3-2 no left turn, 24 x 24 in: the black left-turn arrow under the red ring and slash
  noLeft: [0.61, 0.61, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.02; rrect(x, w * 0.03, h * 0.03, w * 0.94, h * 0.94, w * 0.05); x.stroke();
    // the arrow: up the middle then turning left, a solid head
    x.strokeStyle = BLACK; x.lineWidth = w * 0.085; x.lineCap = 'butt'; x.beginPath();
    x.moveTo(w * 0.58, h * 0.82); x.lineTo(w * 0.58, h * 0.5); x.quadraticCurveTo(w * 0.58, h * 0.36, w * 0.44, h * 0.36); x.lineTo(w * 0.36, h * 0.36); x.stroke();
    x.fillStyle = BLACK; x.beginPath(); x.moveTo(w * 0.2, h * 0.36); x.lineTo(w * 0.37, h * 0.24); x.lineTo(w * 0.37, h * 0.48); x.closePath(); x.fill();
    x.strokeStyle = RED; x.lineWidth = w * 0.075; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(w / 2 - w * 0.255, h / 2 - h * 0.255); x.lineTo(w / 2 + w * 0.255, h / 2 + h * 0.255); x.stroke();
  }],
  // DON'T BLOCK THE BOX, 24 x 30 in
  dbtb: [0.61, 0.76, (x, w, h) => {
    REG[5](x, w, h);
  }],
  // the work-zone diamond, 36 x 36 in (EAST b64_s): black legend on orange, set level on the diamond (the blank turns 45 deg)
  blast: [0.91, 0.91, (x, w, h) => {
    x.fillStyle = '#e8661c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.025; rrect(x, w * 0.03, h * 0.03, w * 0.94, h * 0.94, w * 0.04); x.stroke();
    x.save(); x.translate(w / 2, h / 2); x.rotate(Math.PI / 4);
    text(x, 'BLASTING', 0, -h * 0.02, w * 0.62, h * 0.17, BLACK, 700);
    text(x, 'ZONE', 0, h * 0.17, w * 0.5, h * 0.17, BLACK, 700);
    x.restore();
  }],
  // TRUCK ROUTE, 24 x 18 in: the truck pictogram on the left, TRUCK over ROUTE on the right (acpE, acpNW: 01565 2024-08)
  truck: [0.61, 0.46, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.02; rrect(x, w * 0.03, h * 0.04, w * 0.94, h * 0.92, w * 0.04); x.stroke();
    x.fillStyle = BLACK;
    // the truck faces left: the cab, the box behind it, two wheels
    x.fillRect(w * 0.08, h * 0.38, w * 0.12, h * 0.2); x.fillRect(w * 0.2, h * 0.28, w * 0.26, h * 0.3);
    x.fillStyle = WHITE; x.fillRect(w * 0.1, h * 0.41, w * 0.06, h * 0.07);
    x.fillStyle = BLACK; for (const a of [0.15, 0.38]) { x.beginPath(); x.arc(w * a, h * 0.6, w * 0.04, 0, Math.PI * 2); x.fill(); }
    text(x, 'TRUCK', w * 0.73, h * 0.43, w * 0.42, h * 0.3, BLACK);
    text(x, 'ROUTE', w * 0.73, h * 0.8, w * 0.42, h * 0.3, BLACK);
  }],
  // LOCAL over the three-headed arrow (left, right and ahead: acpE / acpNW, 01565 2024-08), 24 x 18 in
  local: [0.61, 0.46, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.02; rrect(x, w * 0.03, h * 0.04, w * 0.94, h * 0.92, w * 0.04); x.stroke();
    text(x, 'LOCAL', w / 2, h * 0.36, w * 0.62, h * 0.26, BLACK);
    arrow(x, w / 2, h * 0.8, w * 0.66, h * 0.065, 0, BLACK);
    x.fillRect(w / 2 - h * 0.0325, h * 0.6, h * 0.065, h * 0.2);
    x.beginPath(); x.moveTo(w / 2, h * 0.47); x.lineTo(w / 2 - h * 0.085, h * 0.61); x.lineTo(w / 2 + h * 0.085, h * 0.61); x.closePath(); x.fill();
  }],
  // R2-1 SPEED LIMIT 25, 24 x 30 in
  speed25: [0.61, 0.76, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = w * 0.02; rrect(x, w * 0.03, h * 0.03, w * 0.94, h * 0.94, w * 0.05); x.stroke();
    text(x, 'SPEED', w / 2, h * 0.22, w * 0.72, h * 0.15, BLACK);
    text(x, 'LIMIT', w / 2, h * 0.38, w * 0.62, h * 0.15, BLACK);
    text(x, '25', w / 2, h * 0.84, w * 0.8, h * 0.42, BLACK);
  }],
  // R6-1 ONE WAY, 36 x 12 in: the white arrow on black, its legend in black (QA Q15, under the Park Avenue viaduct)
  oneWay: [0.91, 0.3, (x, w, h) => {
    x.fillStyle = BLACK; x.fillRect(0, 0, w, h);
    x.strokeStyle = WHITE; x.lineWidth = h * 0.04; rrect(x, w * 0.012, h * 0.04, w * 0.976, h * 0.92, h * 0.08); x.stroke();
    x.fillStyle = WHITE; x.beginPath();
    x.moveTo(w * 0.05, h * 0.27); x.lineTo(w * 0.76, h * 0.27); x.lineTo(w * 0.76, h * 0.12); x.lineTo(w * 0.95, h * 0.5);
    x.lineTo(w * 0.76, h * 0.88); x.lineTo(w * 0.76, h * 0.73); x.lineTo(w * 0.05, h * 0.73); x.closePath(); x.fill();
    text(x, 'ONE WAY', w * 0.41, h * 0.67, w * 0.6, h * 0.42, BLACK);
  }],
  // BUS CORRIDOR PHOTO ENFORCED, 36 x 24 in (QA Q15, Park Avenue's NW corner pole): the camera pictogram over two lines
  busCam: [1.22, 0.91, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = h * 0.025; rrect(x, w * 0.015, h * 0.025, w * 0.97, h * 0.95, h * 0.05); x.stroke();
    x.fillStyle = BLACK;
    rrect(x, w * 0.42, h * 0.12, w * 0.16, h * 0.17, h * 0.02); x.fill();
    x.fillRect(w * 0.465, h * 0.09, w * 0.05, h * 0.04);
    x.fillStyle = WHITE; x.beginPath(); x.arc(w * 0.5, h * 0.205, h * 0.055, 0, Math.PI * 2); x.fill();
    x.fillStyle = BLACK; x.beginPath(); x.arc(w * 0.5, h * 0.205, h * 0.03, 0, Math.PI * 2); x.fill();
    x.strokeStyle = BLACK; x.lineWidth = h * 0.012;
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) { x.beginPath(); x.moveTo(w * 0.5 + Math.sin(a) * h * 0.13, h * 0.205 - Math.cos(a) * h * 0.13); x.lineTo(w * 0.5 + Math.sin(a) * h * 0.16, h * 0.205 - Math.cos(a) * h * 0.16); x.stroke(); }
    text(x, 'BUS CORRIDOR', w / 2, h * 0.58, w * 0.86, h * 0.2, BLACK);
    text(x, 'PHOTO ENFORCED', w / 2, h * 0.84, w * 0.9, h * 0.2, BLACK);
  }],
  // BUS LANE (NYC DOT overhead plate, white on black with the diamond's place left blank)
  busLane: [0.91, 0.46, (x, w, h) => {
    x.fillStyle = WHITE; x.fillRect(0, 0, w, h);
    x.strokeStyle = BLACK; x.lineWidth = h * 0.03; rrect(x, w * 0.02, h * 0.04, w * 0.96, h * 0.92, h * 0.06); x.stroke();
    text(x, 'BUS LANE', w / 2, h * 0.42, w * 0.84, h * 0.3, BLACK);
    text(x, 'BUSES ONLY 7AM-7PM', w / 2, h * 0.74, w * 0.84, h * 0.18, BLACK, 600);
  }],
};
export const mutSize = (name) => (MUT[name] ? [MUT[name][0], MUT[name][1]] : [0.61, 0.61]);
export function mutTex(name) {
  const D = MUT[name] || MUT.noLeft, pxPerM = 840;
  return tex('mut:' + name, Math.round(D[0] * pxPerM), Math.round(D[1] * pxPerM), (x, w, h) => { D[2](x, w, h); weather(x, w, h, 300 + name.length * 31, { sticker: 0.2, fade: 0.05 }); });
}

// ---- the poles' wear: a sleeve of stickers, torn flyers, tape and marker tags (alpha-tested, 0..1 around and up the
// sleeve; four variants), and the grime and rust spatter at the foot (invented, in the street's palette)
export function poleTagTex(k) {
  return tex('poleTags:' + k, 256, 512, (x, w, h) => {
    const r = rng(500 + k * 37);
    x.clearRect(0, 0, w, h);
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      x.save();
      x.translate(r() * w, h * (0.08 + r() * 0.84)); x.rotate((r() - 0.5) * 0.5);
      const kind = Math.floor(r() * 5), sw = w * (0.16 + r() * 0.2), sh = sw * (0.55 + r() * 0.7);
      if (kind === 0) {
        // a torn flyer: off-white paper, lines of print, a ragged lower edge, tape at the top
        x.fillStyle = ['#ece8dc', '#f3efe2', '#e4e6e0', '#f1d34a'][Math.floor(r() * 4)];
        x.beginPath(); x.moveTo(-sw / 2, -sh / 2); x.lineTo(sw / 2, -sh / 2);
        for (let j = 0; j <= 6; j++) x.lineTo(sw / 2 - (sw * j) / 6, sh / 2 - r() * sh * 0.35);
        x.closePath(); x.fill();
        x.fillStyle = 'rgba(30,30,30,0.75)';
        for (let j = 0; j < 5; j++) x.fillRect(-sw * 0.38, -sh * 0.36 + j * sh * 0.13, sw * (0.4 + r() * 0.36), sh * 0.05);
        x.fillStyle = 'rgba(210,205,190,0.85)'; x.fillRect(-sw * 0.2, -sh / 2 - sh * 0.04, sw * 0.4, sh * 0.1);
      } else if (kind === 1) {
        // a printed sticker block
        x.fillStyle = ['#f4f2ea', '#111111', '#e23c2f', '#2a6fdb', '#ffcf2e'][Math.floor(r() * 5)];
        x.fillRect(-sw / 2, -sh * 0.3, sw, sh * 0.6);
        x.fillStyle = r() < 0.5 ? '#111' : '#f4f2ea';
        x.font = `700 ${Math.round(sh * 0.32)}px ${FF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(['NOPE', 'KRZ', 'B.O.B', 'WAVY', 'SKRT', 'HYPE'][Math.floor(r() * 6)], 0, 0);
      } else if (kind === 2) {
        // a marker tag
        tag(x, sw * 1.2, sh * 0.8, r, ['#121212', '#1e2a8c', '#b01e2a', '#ffffff'][Math.floor(r() * 4)]);
      } else if (kind === 3) {
        // the white paper residue of an old flyer, scraped
        x.fillStyle = 'rgba(232,228,214,0.9)';
        for (let j = 0; j < 14; j++) x.fillRect((r() - 0.5) * sw, (r() - 0.5) * sh, 3 + r() * sw * 0.3, 2 + r() * sh * 0.15);
      } else {
        // a round sticker
        x.fillStyle = ['#ff5aa5', '#2bb3ff', '#f4f2ea', '#3bd16f'][Math.floor(r() * 4)];
        x.beginPath(); x.arc(0, 0, sw * 0.3, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#121212'; x.beginPath(); x.arc(0, 0, sw * 0.12, 0, Math.PI * 2); x.fill();
      }
      x.restore();
    }
  });
}
export function poleGrimeTex() {
  return tex('poleGrime', 128, 256, (x, w, h) => {
    const r = rng(77);
    x.clearRect(0, 0, w, h);
    // v = 0 (the image's foot) is the ground: rust and grime spatter, thinning upward
    for (let i = 0; i < 2600; i++) {
      const v = Math.pow(r(), 2.2), y = h - v * h, s = 1 + r() * 3.5;
      const rust = r() < 0.55;
      x.fillStyle = rust ? `rgba(${110 + r() * 50},${52 + r() * 25},${24 + r() * 15},${0.55 + r() * 0.45})` : `rgba(${38 + r() * 20},${34 + r() * 16},${28 + r() * 12},${0.5 + r() * 0.5})`;
      x.fillRect(r() * w, y - s, s, s);
    }
    // run-down streaks
    for (let i = 0; i < 18; i++) {
      const sx = r() * w, top = h * (0.35 + r() * 0.5);
      const g = x.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgba(120,60,28,0)'); g.addColorStop(1, `rgba(110,55,26,${0.6 + r() * 0.4})`);
      x.fillStyle = g; x.fillRect(sx, top, 1.5 + r() * 3, h - top);
    }
  });
}

// ---- the bus shelter's route strip (the MTA's blue, the stop's name set vertically, read from the street), 0.16 x 1.9 m
export function stripTex(stop) {
  return tex('strip:' + stop, 96, 1140, (x, w, h) => {
    x.fillStyle = '#0d4f9e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e9eef5'; x.fillRect(0, h - 120, w, 4);
    x.save(); x.translate(w * 0.3, 60); x.rotate(Math.PI / 2);
    const p = fit(x, stop, h - 200, 40, 600);
    x.font = `600 ${p}px ${FF}`; x.fillStyle = '#ffffff'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText(stop, 0, 0);
    x.restore();
    // the bus mark at the foot
    x.fillStyle = '#ffffff'; x.fillRect(w * 0.22, h - 100, w * 0.56, 52); x.fillStyle = '#0d4f9e'; x.fillRect(w * 0.28, h - 92, w * 0.44, 22);
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w * 0.32, h - 42, 8, 0, Math.PI * 2); x.arc(w * 0.68, h - 42, 8, 0, Math.PI * 2); x.fill();
    weather(x, w, h, 909 + stop.length, { fade: 0.04 });
  });
}

// ---- the MTA bus-stop sign as 125th Street has it since the 2010s (EAST b12_s, 77 E 125th, 2024-08): a blue disc with
// the bus front, the wheelchair mark and the boarding arrow, its foot a red band reading NO STANDING; under it a route
// plate (white route numbers on blue tiles) on one side of the pole and the destinations (blue rows) over the stop's
// name (black on white) on the other. Drawn from scratch to that layout; route and place names are the real ones.
const MTA_BLUE = '#1f4ea8';
export function busDiscTex() {
  return tex('busDisc', 512, 512, (x, w, h) => {
    const cx = w / 2, cy = h / 2, R = w * 0.49;
    x.fillStyle = '#d9dcdf'; x.fillRect(0, 0, w, h);
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
    x.fillStyle = MTA_BLUE; x.fillRect(0, 0, w, h);
    // the red foot band (below a chord at 0.66 of the height) with NO STANDING set on the arc
    x.fillStyle = RED; x.fillRect(0, h * 0.7, w, h * 0.3);
    x.fillStyle = WHITE; x.fillRect(0, h * 0.695, w, h * 0.012);
    x.restore();
    x.lineWidth = w * 0.018; x.strokeStyle = WHITE; x.beginPath(); x.arc(cx, cy, R - w * 0.012, 0, Math.PI * 2); x.stroke();
    x.save(); x.fillStyle = WHITE; x.font = `700 ${Math.round(h * 0.085)}px ${FF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const s = 'NO STANDING', rr = R * 0.8, span = 1.05;
    for (let i = 0; i < s.length; i++) {
      const a = Math.PI / 2 + span / 2 - (span * (i + 0.5)) / s.length;
      x.save(); x.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); x.rotate(a - Math.PI / 2); x.fillText(s[i], 0, 0); x.restore();
    }
    x.restore();
    // the bus front: body, windscreen, destination sign, lamps, wheels
    x.fillStyle = WHITE;
    rrect(x, w * 0.36, h * 0.16, w * 0.32, h * 0.38, w * 0.03); x.fill();
    x.fillStyle = MTA_BLUE;
    rrect(x, w * 0.385, h * 0.235, w * 0.27, h * 0.15, w * 0.012); x.fill();
    x.fillRect(w * 0.4, h * 0.185, w * 0.24, h * 0.03);
    x.fillRect(w * 0.385, h * 0.47, w * 0.05, h * 0.03); x.fillRect(w * 0.605, h * 0.47, w * 0.05, h * 0.03);
    x.fillStyle = WHITE; x.fillRect(w * 0.385, h * 0.54, w * 0.06, h * 0.05); x.fillRect(w * 0.595, h * 0.54, w * 0.06, h * 0.05);
    // the wheelchair mark
    x.strokeStyle = WHITE; x.lineWidth = w * 0.014; x.beginPath(); x.arc(w * 0.24, h * 0.46, w * 0.05, 0.3, Math.PI * 1.75); x.stroke();
    x.fillStyle = WHITE; x.beginPath(); x.arc(w * 0.255, h * 0.33, w * 0.018, 0, Math.PI * 2); x.fill();
    x.fillRect(w * 0.247, h * 0.355, w * 0.016, h * 0.08); x.fillRect(w * 0.247, h * 0.425, w * 0.06, h * 0.014); x.fillRect(w * 0.293, h * 0.425, w * 0.014, h * 0.06);
    // the boarding arrow under the bus
    arrow(x, w * 0.52, h * 0.635, w * 0.3, h * 0.018, 1, WHITE);
    weather(x, w, h, 4401, { fade: 0.05 });
  });
}
export function busRouteTex(routes) {
  const L = (routes && routes.length ? routes : ['M101', 'M125']).slice(0, 3);
  return tex('busRoute:' + L.join(','), 256, 128 * L.length, (x, w, h) => {
    x.fillStyle = '#e8eaec'; x.fillRect(0, 0, w, h);
    L.forEach((r, i) => {
      x.fillStyle = MTA_BLUE; x.fillRect(4, i * 128 + 4, w - 8, 120);
      text(x, r, w / 2, i * 128 + 102, w - 30, 100, WHITE, 700);
    });
    weather(x, w, h, 4402 + L.length, { fade: 0.04 });
  });
}
export function busDestTex(dests, stop) {
  const D = (dests && dests.length ? dests : ['Ft George', 'Manhattanville']).slice(0, 3), S = stop || 'E 125 St & Park Av';
  return tex('busDest:' + D.join(',') + '|' + S, 320, 64 * D.length + 150, (x, w, h) => {
    x.fillStyle = '#e8eaec'; x.fillRect(0, 0, w, h);
    D.forEach((d, i) => {
      x.fillStyle = MTA_BLUE; x.fillRect(3, i * 64 + 3, w - 6, 58);
      text(x, d, 12, i * 64 + 46, w - 24, 44, WHITE, 600, 'left');
    });
    const y0 = 64 * D.length + 6;
    x.fillStyle = '#f4f3ef'; x.fillRect(3, y0, w - 6, h - y0 - 3);
    const parts = S.split('&');
    text(x, parts[0].trim() + (parts.length > 1 ? ' &' : ''), 12, y0 + 58, w - 24, 50, BLACK, 600, 'left');
    if (parts.length > 1) text(x, parts.slice(1).join('&').trim(), 12, y0 + 122, w - 24, 50, BLACK, 600, 'left');
    weather(x, w, h, 4410 + S.length, { fade: 0.04, sticker: 0.5 });
  });
}
// the Guide-A-Ride case's schedule sheet behind its scratched window
export function busTimesTex() {
  return tex('busTimes', 128, 256, (x, w, h) => {
    x.fillStyle = '#eceae2'; x.fillRect(0, 0, w, h);
    x.fillStyle = MTA_BLUE; x.fillRect(6, 6, w - 12, 22);
    x.fillStyle = '#3a3c40';
    for (let i = 0; i < 26; i++) { const y = 38 + i * 8; x.fillRect(10, y, 20 + ((i * 37) % 30), 3); x.fillRect(64, y, 18 + ((i * 53) % 34), 3); }
    weather(x, w, h, 4420, { fade: 0.08, grime: 0.1 });
  });
}

// the orange plastic safety mesh (a diamond lattice of strands with holes, alpha-tested), faded and dirty
export function meshTex() {
  return tex('safetyMesh', 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#e8601e'; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = -8; i <= 8; i++) {
      x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + h, h); x.stroke();
      x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + h, 0); x.stroke();
    }
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,240,220,0.15)'); g.addColorStop(1, 'rgba(70,50,30,0.35)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  });
}

// ---- the back of a sign blank (QA Q20 / Q36: plates seen from the walk behind them): mill-finish aluminium with brushing
// across it, the two bolt heads and their rust tears, street grime heavier at the foot, and on some a sticker or a tag
// (invented); k picks the variant
export function plateBackTex(k = 0) {
  return tex('plateBack:' + k, 256, 384, (x, w, h) => {
    const r = rng(7001 + k * 31);
    x.fillStyle = '#c3c6c7'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = r() * h, a = 0.03 + r() * 0.06;
      x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(40,44,46,${a})`;
      x.fillRect(0, y, w, 1 + r() * 1.5);
    }
    for (const by of [h * 0.2, h * 0.8]) {
      const g = x.createLinearGradient(0, by, 0, by + h * 0.18);
      g.addColorStop(0, 'rgba(120,70,30,0.35)'); g.addColorStop(1, 'rgba(120,70,30,0)');
      x.fillStyle = g; x.fillRect(w / 2 - 5, by, 10, h * 0.18);
      x.fillStyle = '#6d7174'; x.beginPath(); x.arc(w / 2, by, 9, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#cfd2d3'; x.beginPath(); x.arc(w / 2 - 2, by - 2, 4, 0, Math.PI * 2); x.fill();
    }
    weather(x, w, h, 7100 + k * 13, { fade: 0.02, grime: 0.12, sticker: k % 2 ? 0.9 : 0.4 });
  });
}
