// AR33 custom builders and sign marks, segment east: Fifth Avenue to the river. Specs name them as 'east:<fn>' (docs/notes/ar33-spec.md).
// Owner: the EAST worker (docs/notes/ar33-east.md).
// hoarding(group, ctx, spec, frame): a construction site where a compiled building no longer stands: the fence along the front edge, the lot's ground.
// podiumTower(group, ctx, spec, frame): a tower block on the kit's podium (159 E 125th).
// mountMorris(group, ctx, spec, frame): 81 E 125th, the Mount Morris Bank Building: oriels, entrance arch, slate mansard.
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO } from '../../../world/materials.js';
import { COLLIDERS } from '../../colliders.js';   // the site block's keep-out for the walkers (siteBlock)
import EAST_SPECS from '../specs/east.js';   // the site block's spec, for its keep-out at load (siteKeepOut)

// a small deterministic generator
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
const strHash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// FX36 (AR34 fixes, QA round 4, 2026-10-02; `?fx36=0` as before): the site yard's plant (the excavator, the dump truck, the crawler
// crane, the gate's closure banner) in the kit's plain finishes: the painted and black steel sets' blotches (chips 0 too) drew their
// big faces as lumpy yellow, red and black blobs that read as foam (QA r4 b16_pierce)
const FX36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fx36') === '0');

// painted hoarding panels: bold flat colours, big simple shapes (invented street art, no real artwork)
const THEMES = [
  ['#2d86b8', '#f4c95d', '#e4572e', '#17bebb'], ['#f06c9b', '#6d2e8f', '#ffe066', '#2ec4b6'], ['#ff7f11', '#1b998b', '#fff1d6', '#3d348b'],
  ['#8ac926', '#1982c4', '#ff595e', '#ffca3a'], ['#222222', '#f2f2f2', '#d62828', '#f77f00'], ['#6a4c93', '#ff924c', '#8ac926', '#ffca3a'],
];
function paintHoarding(len, seed) {
  const R = rng(seed);
  const panels = Math.max(2, Math.round(len / 2.44));
  const pw = 200, W = Math.min(4096, panels * pw), H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  for (let p = 0; p < panels; p++) {
    const x0 = Math.round((p * W) / panels), x1 = Math.round(((p + 1) * W) / panels), w = x1 - x0;
    const th = THEMES[Math.floor(R() * THEMES.length)];
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, th[Math.floor(R() * 4)]); grd.addColorStop(1, th[Math.floor(R() * 4)]);
    g.fillStyle = grd; g.fillRect(x0, 0, w, H);
    const n = 3 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      g.fillStyle = th[Math.floor(R() * 4)];
      const cx = x0 + R() * w, cy = R() * H, r = 14 + R() * 60, kind = Math.floor(R() * 5);
      g.beginPath();
      if (kind === 0) g.arc(cx, cy, r, 0, Math.PI * 2);
      else if (kind === 1) g.ellipse(cx, cy, r * 1.4, r * 0.7, R() * 3, 0, Math.PI * 2);
      else if (kind === 2) { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy + r * 0.8); g.lineTo(cx - r, cy + r * 0.8); g.closePath(); }
      else if (kind === 3) { for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2, rr = q % 2 ? r * 0.45 : r; g[q ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); }
      else { g.rect(cx - r, cy - r * 0.35, r * 2, r * 0.7); }
      g.fill();
      if (R() < 0.35) { g.strokeStyle = '#151515'; g.lineWidth = 3 + R() * 3; g.stroke(); }
    }
    // a bold outlined figure in some panels: a head and shoulders
    if (R() < 0.45) {
      const cx = x0 + w * (0.3 + R() * 0.4), cy = H * 0.55;
      g.fillStyle = '#e9c9a6'; g.strokeStyle = '#111'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(cx, cy - 18, 26, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = th[Math.floor(R() * 4)];
      g.beginPath(); g.moveTo(cx - 56, H); g.quadraticCurveTo(cx - 50, cy + 32, cx, cy + 26); g.quadraticCurveTo(cx + 50, cy + 32, cx + 56, H); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, 0, 2, H);   // the seam between two plywood sheets
  }
  // a few tags and scuffs on the lower part
  g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 2;
  for (let k = 0; k < panels * 2; k++) { const x = R() * W, y = H * (0.6 + R() * 0.4); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 18, x + 40, y + 18, x + 60, y - 6); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- mural painters (begin): canvas only, no three.js (a preview page runs this block as it is: `muLib.muSite(...)`)
// The Lexington Avenue SW corner hoarding: a run of plywood panels, each its own piece by its own
// hand: stencil portraits in two to four flat tones, silhouettes on sprayed grounds, packed doodle walls, a crowd drawn in one black line
// over a red-to-violet fade, leaves and figures; at the corner a green plywood sheet layered with chrome and marker tags. Painted with
// brush and roller (ragged edges, coverage that varies, strokes in the grounds), then aged: sun fade toward the top, grime and splash
// at the foot, rain runs, scuffs, stickers, the sheet joints every 1.22 m. Every face, figure and letter is invented; nothing is
// traced from the photographs.
// The block is one function that refers to nothing outside it, so a worker can run it from its source text (muWorker below; the body
// keeps the indentation it had at the top level). Canvases come from muCanvas: a page's canvas, an OffscreenCanvas in a worker.
function muLib() {
const muCanvas = (w, h) => {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
};
const MU = {
  hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  noise(seed) {
    const P = new Float32Array(1024); let s = (seed >>> 0) || 7;
    for (let i = 0; i < 1024; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; P[i] = (s % 100000) / 100000; }
    const at = (i, j) => P[((i * 374761393) ^ (j * 668265263)) >>> 22];
    return (x, y) => {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  },
};
// a wobbly closed shape round (cx, cy)
function muBlob(g, R, cx, cy, rx, ry, wob = 0.1, n = 28, rot = 0) {
  const ph = R() * 6.28, k = 2 + Math.floor(R() * 3), P = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 1 + wob * Math.sin(a * k + ph) + wob * 0.6 * (R() - 0.5); const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r; P.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  g.beginPath(); g.moveTo((P[0][0] + P[n - 1][0]) / 2, (P[0][1] + P[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  g.closePath();
}
// a brushed line through points: the stroke, then thin bristle lines along it, lighter and darker
function muBrush(g, R, pts, w, col, a = 1) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col;
  const path = (dx, dy) => { g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (let i = 1; i + 1 < pts.length; i++) g.quadraticCurveTo(pts[i][0] + dx, pts[i][1] + dy, (pts[i][0] + pts[i + 1][0]) / 2 + dx, (pts[i][1] + pts[i + 1][1]) / 2 + dy); const l = pts[pts.length - 1]; g.lineTo(l[0] + dx, l[1] + dy); g.stroke(); };
  g.globalAlpha = a; g.lineWidth = w; path(0, 0);
  g.lineWidth = Math.max(1, w * 0.18);
  for (let k = 0; k < 3; k++) { g.globalAlpha = a * (0.18 + R() * 0.2); g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'; path((R() - 0.5) * w * 0.6, (R() - 0.5) * w * 0.6); }
  g.restore();
}
// a sprayed or rolled ground: a vertical fade through the stops, then strokes of lighter and darker paint across it
function muGround(g, R, x0, w, H, stops, o = {}) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  stops.forEach((c, i) => gr.addColorStop(i / Math.max(1, stops.length - 1), c));
  g.fillStyle = gr; g.fillRect(x0, 0, w, H);
  const n = Math.round((w * H) / (o.cell || 900) * (o.strokes ?? 1));
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * w, y = R() * H, len = (0.3 + R()) * (o.len || 40), ang = (o.ang ?? 0) + (R() - 0.5) * (o.spread ?? 0.6);
    g.globalAlpha = 0.05 + R() * 0.09; g.strokeStyle = R() < 0.5 ? (o.hi || '#ffffff') : (o.lo || '#000000');
    g.lineWidth = 2 + R() * (o.w || 10); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (R() - 0.5) * 8, y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * 8, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  g.globalAlpha = 1;
}
function muLeaf(g, x, y, len, wid, ang, fill, line, lw = 0) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, 0); g.closePath();
  g.fillStyle = fill; g.fill();
  if (line) { g.strokeStyle = line; g.lineWidth = lw || Math.max(1, wid * 0.12); g.stroke(); g.beginPath(); g.moveTo(len * 0.05, 0); g.quadraticCurveTo(len * 0.5, -wid * 0.12, len * 0.92, 0); g.stroke(); }
  g.restore();
}
// a stencil portrait in flat tones: the head as a height field (skull, brow, sockets, nose, cheekbones, lips, chin) lit from the upper
// left and cut into the palette's tones along wobbly hand-cut edges; neck, shoulders and hair the same way; then eyes, brows, the
// mouth and the lines of the face drawn over. o: { pal: [dark, mid, light, high], hair: 'short' | 'long' | 'none', hairPal, shirt,
// tie, yaw, smile, age (lines), seed }
function muPortrait(g, cx, cy, a, o) {
  const b = a * 1.3, Hc = g.canvas.height, Wc = g.canvas.width;
  const x0 = Math.max(0, Math.floor(cx - a * 2.8)), x1 = Math.min(Wc, Math.ceil(cx + a * 2.8));
  const y0 = Math.max(0, Math.floor(cy - b * 1.7)), y1 = Math.min(Hc, Math.ceil(cy + b * 3.4));
  const W = x1 - x0, H = y1 - y0;
  if (W <= 2 || H <= 2) return;
  // the tones at half resolution into a canvas of their own, drawn scaled over the panel (no read-back of the panel: it stays on the GPU)
  const hs = a > 24 ? 2 : 1, Wh = Math.ceil(W / hs), Hh = Math.ceil(H / hs);
  const off = muCanvas(Wh, Hh);
  const og = off.getContext('2d'), img = og && og.createImageData ? og.createImageData(Wh, Hh) : null, D = img && img.data;
  if (!D) return;   // a canvas without pixels (the kit bench's stub)
  const nz = MU.noise(o.seed || 3), yaw = o.yaw || 0, sm = o.smile || 0, fx = yaw * 0.32;
  const pal = o.pal.map(MU.hex), hp = (o.hairPal || [o.pal[0], o.pal[1]]).map(MU.hex), sp = (o.shirt || [o.pal[0], o.pal[1], o.pal[2]]).map(MU.hex);
  const tie = o.tie ? o.tie.map(MU.hex) : null;
  const Lx = -0.74 - yaw * 0.3, Ly = -0.4, Lz = 0.54;
  const G = (X, Y, mx, my, sx, sy) => { const dx = (X - mx) / sx, dy = (Y - my) / sy; return Math.exp(-(dx * dx + dy * dy)); };
  const head = (X, Y) => {
    const jaw = Y > 0 ? 1 - 0.2 * Y * Y : 1, Xe = (X - fx * 0.25) / jaw, r2 = Xe * Xe + Y * Y;
    if (r2 >= 1) return -1;
    const Xf = X - fx;
    let h = Math.sqrt(1 - r2);
    h -= 0.24 * (G(Xf, Y, -0.36, -0.1, 0.24, 0.15) + G(Xf, Y, 0.36, -0.1, 0.24, 0.15));
    h += 0.07 * G(Xf, Y, 0, -0.32, 0.62, 0.07);
    h += 0.17 * G(Xf, Y, 0.0, 0.06, 0.075, 0.3) + 0.12 * G(Xf, Y, 0, 0.28, 0.12, 0.08);
    h += 0.06 * (1 + 1.4 * sm) * (G(Xf, Y, -0.47, 0.17, 0.2, 0.15) + G(Xf, Y, 0.47, 0.17, 0.2, 0.15));
    h += 0.05 * G(Xf, Y, 0, 0.5, 0.25, 0.045) + 0.055 * G(Xf, Y, 0, 0.6, 0.21, 0.05) - 0.05 * G(Xf, Y, 0, 0.73, 0.24, 0.045);
    h += 0.08 * G(Xf, Y, 0, 0.88, 0.2, 0.1);
    return h;
  };
  const tone = (s, P) => (P.length === 4 ? P[s < 0.3 ? 0 : s < 0.52 ? 1 : s < 0.76 ? 2 : 3] : P.length === 3 ? P[s < 0.45 ? 0 : s < 0.72 ? 1 : 2] : P[s < 0.55 ? 0 : 1]);
  const hairline = (X) => (o.hair === 'long' ? -0.78 + 0.95 * Math.abs(X - fx * 0.4) : -0.52 + 0.3 * (X - fx) * (X - fx));
  for (let py = 0; py < Hh; py++) {
    const Y = (y0 + py * hs - cy) / b;
    for (let px = 0; px < Wh; px++) {
      const X = (x0 + px * hs - cx) / a;
      const n = nz(X * 3.2 + 9, Y * 3.2) * 0.7 + nz(X * 7.5, Y * 7.5 + 5) * 0.3;
      let c = null;
      // hair
      if (o.hair === 'short') {
        const inH = (X - fx * 0.2) * (X - fx * 0.2) / 1.2 + (Y + 0.14) * (Y + 0.14) / 1.16 < 1 + (n - 0.5) * 0.18;
        if (inH && Y < hairline(X) + (n - 0.5) * 0.12) { const t = nz(X * 10, Y * 10) * 0.7 + (0.5 - Y * 0.3 - X * 0.25) * 0.5; c = tone(t, hp); }
      } else if (o.hair === 'long') {
        const outer = (X - fx * 0.3) * (X - fx * 0.3) / 1.9 + (Y - 0.3) * (Y - 0.3) / 2.2 < 1 + (n - 0.5) * 0.15 && Y < 1.75;
        const jaw = Y > 0 ? 1 - 0.2 * Y * Y : 1, inFace = ((X - fx * 0.25) / jaw) ** 2 + Y * Y < 1;
        if (outer && (!inFace || Y < hairline(X) + (n - 0.5) * 0.1)) { const t = nz(X * 16 + Y * 3, Y * 2.2) * 0.75 + (X < fx ? 0.1 : -0.08); c = tone(t, hp); }
      }
      if (!c) {
        const h = head(X, Y);
        if (h > 0) {
          const e = 0.025, hx = head(X + e, Y), hy = head(X, Y + e);
          const dx = hx > 0 ? (hx - h) / e : -2, dy = hy > 0 ? (hy - h) / e : -2;
          let nx = -dx * 0.95, ny = -dy * 0.95, nzv = 1; const l = Math.hypot(nx, ny, nzv); nx /= l; ny /= l; nzv /= l;
          const s = nx * Lx + ny * Ly + nzv * Lz + (n - 0.5) * 0.22;
          c = tone(s, pal);
        } else if (Y > 0.55 && Y < 1.6 && Math.abs(X - fx * 0.3) < 0.4 + 0.08 * Math.max(0, Y - 1.1)) {
          const q = (X - fx * 0.3) / 0.45, s = 0.62 * Math.sqrt(Math.max(0, 1 - q * q)) - 0.3 * q - (Y < 1.05 ? 0.25 : 0) + (n - 0.5) * 0.2;
          c = tone(s + 0.1, pal);
        } else if (Y > 1.15 && X * X / 6.3 + (Y - 2.75) * (Y - 2.75) / 2.3 < 1 + (n - 0.5) * 0.08) {
          if (tie && Math.abs(X - fx * 0.3) < 0.13 + (Y - 1.3) * 0.05 && Y > 1.32) c = tie[Math.floor((Y - 1.32) * 7) % tie.length];
          else if (o.collar !== false && Math.abs(X - fx * 0.3) < 0.55 - (Y - 1.2) * 0.9 && Y < 1.75) c = tone(0.9 + (n - 0.5) * 0.2, sp);
          else { const f = nz(X * 1.6 + 30, Y * 0.9) * 0.7 + 0.25 - X * 0.16 + (n - 0.5) * 0.15; c = tone(f, sp); }
        }
      }
      if (c) { const k = (py * Wh + px) * 4; D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255; }
    }
  }
  og.putImageData(img, 0, 0);
  g.drawImage(off, x0, y0, Wh * hs, Hh * hs);
  // the features over the tones
  const P = (X, Y) => [cx + (X + fx) * a, cy + Y * b], dark = o.pal[0], lw = Math.max(1.5, a * 0.05);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = dark; g.fillStyle = dark;
  for (const s of [-1, 1]) {
    // eyes: an almond, the lid line, a glint
    const [ex, ey] = P(s * 0.35, -0.08), ew = a * 0.21 * (1 - s * yaw * 0.5), eh = b * (sm > 0.5 ? 0.045 : 0.07);
    g.beginPath(); g.moveTo(ex - ew, ey); g.quadraticCurveTo(ex, ey - eh * 2, ex + ew, ey); g.quadraticCurveTo(ex, ey + eh * 1.4, ex - ew, ey); g.fill();
    g.lineWidth = lw; g.beginPath(); g.moveTo(ex - ew * 1.1, ey - eh * 0.6); g.quadraticCurveTo(ex, ey - eh * 3.2, ex + ew * 1.15, ey - eh * 0.4); g.stroke();
    g.fillStyle = o.pal[3]; g.beginPath(); g.arc(ex + ew * 0.2, ey - eh * 0.35, Math.max(1, a * 0.022), 0, 6.3); g.fill(); g.fillStyle = dark;
    // brows
    const [b0x, b0y] = P(s * 0.13, -0.3), [b1x, b1y] = P(s * 0.6, -0.31);
    g.lineWidth = lw * (o.hair === 'long' ? 2.0 : 1.5); g.beginPath(); g.moveTo(b0x, b0y); g.quadraticCurveTo((b0x + b1x) / 2, b0y - b * 0.08, b1x, b1y); g.stroke();
    // nostrils
    const [nx, ny] = P(s * 0.09, 0.33); g.beginPath(); g.ellipse(nx, ny, a * 0.045, b * 0.022, 0, 0, 6.3); g.fill();
    if (o.age) {
      g.lineWidth = lw * 0.8;
      const [fx0, fy0] = P(s * 0.13, 0.28), [fx1, fy1] = P(s * 0.34, 0.62); g.beginPath(); g.moveTo(fx0, fy0); g.quadraticCurveTo(fx1 + s * a * 0.06, (fy0 + fy1) / 2, fx1, fy1); g.stroke();
      for (let k = 0; k < 3; k++) { const [cx0, cy0] = P(s * 0.56, -0.12 + k * 0.05); g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0 + s * a * 0.12, cy0 + (k - 1) * b * 0.03); g.stroke(); }
    }
  }
  if (o.age) { g.lineWidth = lw * 0.7; for (let k = 0; k < 2; k++) { const [l0x, l0y] = P(-0.32, -0.47 - k * 0.07), [l1x] = P(0.32, -0.47); g.beginPath(); g.moveTo(l0x, l0y); g.quadraticCurveTo((l0x + l1x) / 2, l0y - b * 0.03, l1x, l0y); g.stroke(); } }
  // the nose's shadow side
  { const [n0x, n0y] = P(0.07, -0.02), [n1x, n1y] = P(0.13, 0.3); g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(n0x, n0y); g.quadraticCurveTo(n1x + a * 0.04, (n0y + n1y) / 2, n1x, n1y); g.stroke(); }
  // the mouth: a smile with teeth or closed lips
  {
    const [mx, my] = P(0, 0.55), mw = a * (0.3 + 0.08 * sm);
    if (sm > 0.5) {
      g.beginPath(); g.moveTo(mx - mw, my - b * 0.02); g.quadraticCurveTo(mx, my + b * 0.24, mx + mw, my - b * 0.02); g.quadraticCurveTo(mx, my + b * 0.02, mx - mw, my - b * 0.02); g.fill();
      g.fillStyle = o.pal[3]; g.beginPath(); g.moveTo(mx - mw * 0.8, my + b * 0.0); g.quadraticCurveTo(mx, my + b * 0.06, mx + mw * 0.8, my); g.quadraticCurveTo(mx, my + b * 0.12, mx - mw * 0.8, my); g.fill();
      g.strokeStyle = dark; g.lineWidth = Math.max(1, lw * 0.5); for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(mx + k * mw * 0.2, my + b * 0.01); g.lineTo(mx + k * mw * 0.2, my + b * 0.08); g.stroke(); }
    } else {
      g.fillStyle = o.lips || dark; g.beginPath(); g.moveTo(mx - mw, my); g.quadraticCurveTo(mx - mw * 0.4, my - b * 0.07, mx, my - b * 0.035); g.quadraticCurveTo(mx + mw * 0.4, my - b * 0.07, mx + mw, my); g.quadraticCurveTo(mx, my + b * 0.12, mx - mw, my); g.fill();
      g.strokeStyle = dark; g.lineWidth = lw; g.beginPath(); g.moveTo(mx - mw * 1.05, my); g.quadraticCurveTo(mx, my + b * 0.02, mx + mw * 1.05, my); g.stroke();
    }
  }
  g.restore();
}
// --- the panels: (g, R, x0, w, H, pxm, seed)
const MU_PANELS = {
  // a crowd drawn in one black line, head after head, over a red that fades to violet at the foot
  crowd(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#e5383d', '#d93246', '#a8336a', '#5d3b98', '#4c3790'], { len: 30, w: 6, ang: 1.4, spread: 0.5 });
    g.save(); g.strokeStyle = '#17121a'; g.fillStyle = '#17121a'; g.lineCap = 'round'; g.lineJoin = 'round';
    const lw = Math.max(1.4, 0.012 * m), rowH = 0.2 * m, colW = 0.19 * m;
    for (let row = 0, y = 0.1 * m; y < H - 0.06 * m; row++, y += rowH * (0.9 + R() * 0.2)) {
      for (let x = x0 + (row % 2) * colW * 0.5 + 0.06 * m; x < x0 + w - 0.05 * m; x += colW * (0.8 + R() * 0.4)) {
        const hx = x + (R() - 0.5) * colW * 0.25, hy = y + (R() - 0.5) * rowH * 0.25, r = 0.068 * m * (0.8 + R() * 0.4), tilt = (R() - 0.5) * 0.8;
        g.lineWidth = lw;
        g.beginPath(); const a0 = R() * 6.28;
        for (let k = 0; k <= 16; k++) { const t = a0 + (k / 16) * 5.9, q = r * (1 + (R() - 0.5) * 0.1); const px = hx + Math.cos(t) * q * 0.82, py = hy + Math.sin(t) * q; k ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
        const ex = Math.cos(tilt) * r * 0.32, ey = Math.sin(tilt) * r * 0.32;
        if (R() < 0.6) { g.beginPath(); g.arc(hx - ex, hy - ey - r * 0.1, lw * 0.8, 0, 6.3); g.arc(hx + ex, hy + ey - r * 0.1, lw * 0.8, 0, 6.3); g.fill(); }
        else { g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(hx - ex - r * 0.12, hy - ey - r * 0.1); g.lineTo(hx - ex + r * 0.1, hy - ey - r * 0.1); g.moveTo(hx + ex - r * 0.1, hy + ey - r * 0.1); g.lineTo(hx + ex + r * 0.12, hy + ey - r * 0.1); g.stroke(); }
        g.lineWidth = lw * 0.85; g.beginPath(); g.arc(hx, hy + r * 0.25, r * 0.32, 0.4 + tilt, 2.7 + tilt); g.stroke();
        // shoulders as a loop under the chin, an arm reaching to the next head
        g.lineWidth = lw; g.beginPath(); g.moveTo(hx - r * 0.95, hy + rowH * 0.62);
        g.bezierCurveTo(hx - r * 0.9, hy + r * 1.05, hx + r * 0.9, hy + r * 1.05, hx + r * 0.95, hy + rowH * 0.62); g.stroke();
        if (R() < 0.55) { g.beginPath(); g.moveTo(hx + r * 0.8, hy + r * 1.2); g.quadraticCurveTo(hx + colW * 0.5, hy + r * 0.6 + (R() - 0.5) * r, hx + colW * 0.75, hy + r * (0.2 + R() * 0.6)); g.stroke(); }
        if (R() < 0.5) { g.beginPath(); g.moveTo(hx - r * 0.7, hy - r * 0.6); g.quadraticCurveTo(hx - r * 0.2, hy - r * 1.5, hx + r * 0.7, hy - r * 0.7); g.stroke(); }
      }
    }
    g.restore();
  },
  // tree silhouettes on a sky-blue ground, a bird on a branch, palm fronds at the foot
  trees(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#86b6dc', '#9cc5e5', '#b5d5ec'], { len: 60, w: 14, ang: 0.05, spread: 0.3, hi: '#e8f4fb', lo: '#5d8fb8' });
    const ink = '#1c1716';
    const branch = (x, y, ang, len, wd, d) => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      muBrush(g, R, [[x, y], [(x + x2) / 2 + (R() - 0.5) * len * 0.15, (y + y2) / 2 + (R() - 0.5) * len * 0.15], [x2, y2]], wd, ink);
      if (d > 0) { const n = 2 + (R() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) branch(x2, y2, ang + (R() - 0.5) * 1.3, len * (0.55 + R() * 0.25), wd * 0.62, d - 1); }
      else if (R() < 0.7) { g.fillStyle = ink; muBlob(g, R, x2, y2, len * 0.35, len * 0.22, 0.25, 14, ang); g.fill(); }
    };
    // a thick leaning trunk at the left
    muBrush(g, R, [[x0 + w * 0.08, H + 4], [x0 + w * 0.13, H * 0.6], [x0 + w * 0.12, H * 0.25], [x0 + w * 0.06, -6]], 0.11 * m, ink);
    muBrush(g, R, [[x0 + w * 0.1, H * 0.12], [x0 + w * 0.3, H * 0.02], [x0 + w * 0.5, -4]], 0.025 * m, ink);
    // a thin tree in the middle, branching
    const tx = x0 + w * 0.46;
    muBrush(g, R, [[tx, H + 4], [tx - w * 0.03, H * 0.62], [tx + w * 0.02, H * 0.35], [tx - w * 0.01, H * 0.1]], 0.04 * m, ink);
    for (let i = 0; i < 4; i++) branch(tx + (R() - 0.5) * w * 0.02, H * (0.18 + i * 0.12), (i % 2 ? -0.4 : -2.7) + (R() - 0.5) * 0.4, 0.22 * m, 0.022 * m, 2);
    // a straight trunk at the right with a dark crown
    const ux = x0 + w * 0.76;
    muBrush(g, R, [[ux, H + 4], [ux + w * 0.01, H * 0.5], [ux - w * 0.005, H * 0.12]], 0.035 * m, ink);
    for (let i = 0; i < 9; i++) { g.fillStyle = ink; muBlob(g, R, ux + (R() - 0.5) * 0.35 * m, H * 0.1 + (R() - 0.5) * 0.18 * m, 0.08 * m, 0.05 * m, 0.3, 14, R() * 3); g.fill(); }
    for (let i = 0; i < 3; i++) branch(ux, H * (0.3 + i * 0.1), i % 2 ? -0.5 : -2.6, 0.18 * m, 0.016 * m, 1);
    // a bird
    g.fillStyle = ink; muBlob(g, R, tx + 0.05 * m, H * 0.45, 0.07 * m, 0.045 * m, 0.1, 16, -0.3); g.fill();
    g.beginPath(); g.arc(tx + 0.1 * m, H * 0.42, 0.028 * m, 0, 6.3); g.fill();
    // palm fronds at the foot
    for (const [fx, sc] of [[x0 + w * 0.25, 1], [x0 + w * 0.62, 1.2], [x0 + w * 0.9, 0.8]]) {
      for (let f = 0; f < 6; f++) {
        const ang = -Math.PI / 2 + (f - 2.5) * 0.42, len = (0.35 + R() * 0.2) * m * sc, bx = fx, by = H - 0.02 * m;
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len * 0.8;
        g.strokeStyle = '#24622f'; g.lineWidth = Math.max(1, 0.008 * m); g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2, (by + ey) / 2 - len * 0.15, ex, ey); g.stroke();
        for (let k = 1; k < 9; k++) { const t = k / 9, px = bx + (ex - bx) * t, py = by + (ey - by) * t - len * 0.15 * 4 * t * (1 - t); for (const s of [-1, 1]) muLeaf(g, px, py, len * 0.3 * (1 - t * 0.6), 0.012 * m, ang + s * 1.0 + 0.3, k % 2 ? '#2f7d3a' : '#3f964a', null); }
      }
    }
  },
  // two green faces in flat tones on a coral ground, leaves for hair
  faces(g, R, x0, w, H, m, seed) {
    muGround(g, R, x0, w, H, ['#ea8576', '#ef9283', '#f3a291'], { len: 40, w: 12, ang: 1.2, spread: 1.2, hi: '#ffd2c4', lo: '#b8584c' });
    const pal = ['#1b4426', '#3a823b', '#77bf58', '#b8a4e3'];
    const leaves = (cx, cy, r, n) => { for (let i = 0; i < n; i++) { const t = R() * Math.PI * 1.25 + Math.PI * 0.88, d = r * (0.55 + R() * 0.55); muLeaf(g, cx + Math.cos(t) * d, cy + Math.sin(t) * d * 0.9, r * (0.35 + R() * 0.3), r * 0.1, t + (R() - 0.5) * 0.8, ['#1f5a2c', '#3c8d3d', '#68b552', '#2b6e34'][i % 4], '#163d20'); } };
    const A = 0.27 * m, B = 0.3 * m;
    leaves(x0 + w * 0.28, H * 0.33, A * 2.2, 46);
    leaves(x0 + w * 0.7, H * 0.36, B * 2.2, 46);
    muPortrait(g, x0 + w * 0.28, H * 0.37, A, { pal, hair: 'none', yaw: -0.4, seed: seed + 1, shirt: ['#1b4426', '#3a823b', '#77bf58'], lips: '#7a4fa6' });
    muPortrait(g, x0 + w * 0.7, H * 0.4, B, { pal, hair: 'none', yaw: 0.3, seed: seed + 2, shirt: ['#1b4426', '#b8a4e3', '#77bf58'], lips: '#7a4fa6' });
    leaves(x0 + w * 0.28, H * 0.24, A * 1.4, 14);
    leaves(x0 + w * 0.7, H * 0.27, B * 1.4, 14);
  },
  // a violet sheet over the site's gate: the door's outline, a red ring with a pale disc
  door(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#4f2d72', '#4a2a6b', '#432763'], { len: 50, w: 12, ang: 1.5, spread: 0.4, hi: '#7a55a0', lo: '#24123a' });
    const dx = x0 + w * 0.1, dw = Math.min(w * 0.8, 0.95 * m), dy = H - 2.15 * m;
    g.fillStyle = 'rgba(30,14,48,0.35)'; g.fillRect(dx, dy, dw, H - dy - 0.02 * m);
    g.strokeStyle = '#1c0f2c'; g.lineWidth = Math.max(1.5, 0.012 * m); g.strokeRect(dx, dy, dw, H - dy - 0.02 * m);
    g.fillStyle = '#1c0f2c'; g.fillRect(dx + dw - 0.12 * m, dy + 1.0 * m, 0.03 * m, 0.14 * m);
    const rx = dx + dw * 0.45, ry = dy + 0.45 * m, r = 0.3 * m;
    g.fillStyle = '#d2363b'; g.beginPath(); g.arc(rx, ry, r, 0, 6.3); g.fill();
    g.fillStyle = '#e6a0aa'; g.beginPath(); g.arc(rx, ry, r * 0.74, 0, 6.3); g.fill();
    g.fillStyle = '#b8434f'; g.beginPath(); g.arc(rx - r * 0.1, ry + r * 0.08, r * 0.3, 0, 6.3); g.fill();
  },
  // a man smiling, in greys, inside a ring of white dots, on a ground of brushed maroon and violet
  elder(g, R, x0, w, H, m, seed) {
    muGround(g, R, x0, w, H, ['#47203f', '#562644', '#3d1d3a'], { len: 70, w: 18, ang: 0.6, spread: 2.5, hi: '#9a3f45', lo: '#1e0d1d', strokes: 2.2 });
    const cx = x0 + w * 0.47, a = 0.37 * m, cy = H * 0.38;
    muPortrait(g, cx, cy, a, { pal: ['#121212', '#575757', '#a9a9a9', '#efefef'], hair: 'short', hairPal: ['#5d5d5d', '#bdbdbd', '#ececec'], smile: 1, age: true, yaw: 0.06, seed: seed + 3, shirt: ['#3a3a3a', '#bdbdbd', '#f1f1f1'], tie: ['#c8323a', '#e8c23a', '#3a9a52', '#3a62b8'] });
    // the ring of dots round the head and down the shoulders
    g.fillStyle = '#f2f0ea';
    const dr = Math.max(1.5, 0.018 * m);
    for (let t = 0; t <= 1; t += 0.022) { const ang = Math.PI * (1.08 + 0.84 * t) + Math.PI * 0; const px = cx + Math.cos(ang) * a * 1.35, py = cy - 0.05 * a + Math.sin(ang) * a * 1.75; g.beginPath(); g.arc(px, py, dr, 0, 6.3); g.fill(); }
    for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.06) { const px = cx + s * a * (1.32 + t * 1.25), py = cy + a * (0.45 + t * t * 1.6 + t * 0.7); g.beginPath(); g.arc(px, py, dr, 0, 6.3); g.fill(); }
    // an invented signature and year by the shoulder
    g.strokeStyle = '#f2f0ea'; g.lineWidth = Math.max(1, 0.008 * m); g.beginPath();
    let sx = cx + a * 1.5, sy = H * 0.72; g.moveTo(sx, sy); for (let k = 0; k < 7; k++) { sx += 0.04 * m; g.quadraticCurveTo(sx - 0.02 * m, sy - (k % 2 ? 0.06 : -0.02) * m, sx, sy + (R() - 0.5) * 0.02 * m); } g.stroke();
    g.font = `600 ${Math.round(0.07 * m)}px sans-serif`; g.fillStyle = '#e8e4da'; g.fillText('’18', x0 + w - 0.28 * m, H - 0.12 * m);
  },
  // a black serpent on a teal ground, a red sun and a pale crescent
  serpent(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#5cb9b6', '#58b4b2', '#4faaa8'], { len: 60, w: 18, ang: 0.3, spread: 2, hi: '#a6ddd8', lo: '#2f8381', strokes: 1.4 });
    const mx = x0 + w * 0.22, my = H * 0.13, mr = 0.17 * m;
    g.fillStyle = '#d6ebe6'; g.beginPath(); g.arc(mx, my, mr, 0, 6.3); g.fill();
    g.fillStyle = '#5cb9b6'; g.beginPath(); g.arc(mx + mr * 0.45, my - mr * 0.15, mr * 0.9, 0, 6.3); g.fill();
    const sx = x0 + w * 0.78, sy = H * 0.14, sr = 0.2 * m;
    g.fillStyle = '#7d2b20'; g.beginPath(); g.arc(sx, sy, sr, 0, 6.3); g.fill();
    g.fillStyle = '#b4462e'; g.beginPath(); g.arc(sx - sr * 0.05, sy - sr * 0.05, sr * 0.86, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(232,140,90,0.5)'; g.beginPath(); g.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.35, 0, 6.3); g.fill();
    // the body: an S that loops down the sheet, a pale edge line and scale glints
    const cxm = x0 + w * 0.48, amp = w * 0.3, pts = [];
    for (let t = 0; t <= 1.0001; t += 0.01) { const y = H * (0.07 + 0.86 * t), x = cxm + Math.sin(t * Math.PI * 3.3 + 0.2) * amp * (0.55 + 0.45 * t) * (t < 0.08 ? t / 0.08 : 1); pts.push([x, y]); }
    const bw = 0.12 * m;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const run = (wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    run(bw + 0.022 * m, '#cfdcda'); run(bw, '#111111');
    g.lineWidth = Math.max(1, 0.006 * m); g.strokeStyle = 'rgba(160,175,175,0.55)';
    for (let i = 3; i < pts.length - 3; i += 2) { const [x, y] = pts[i], [x2, y2] = pts[i + 1], ang = Math.atan2(y2 - y, x2 - x); g.beginPath(); g.arc(x + Math.cos(ang + 1.57) * bw * 0.2, y + Math.sin(ang + 1.57) * bw * 0.2, bw * 0.14, ang - 1, ang + 1); g.stroke(); }
    g.restore();
    const [hx, hy] = pts[0];
    g.fillStyle = '#111111'; muBlob(g, R, hx, hy - 0.03 * m, 0.075 * m, 0.1 * m, 0.05, 20); g.fill();
    g.strokeStyle = '#c83a32'; g.lineWidth = Math.max(1, 0.008 * m); g.beginPath(); g.moveTo(hx, hy - 0.12 * m); g.lineTo(hx, hy - 0.2 * m); g.lineTo(hx - 0.02 * m, hy - 0.23 * m); g.moveTo(hx, hy - 0.2 * m); g.lineTo(hx + 0.02 * m, hy - 0.23 * m); g.stroke();
    g.fillStyle = '#e4dc63'; g.fillRect(x0 + w * 0.12, H * 0.32, 0.17 * m, 0.13 * m);
    g.fillStyle = 'rgba(30,30,30,0.75)'; for (let k = 0; k < 3; k++) g.fillRect(x0 + w * 0.12 + 0.02 * m, H * 0.32 + (0.025 + k * 0.035) * m, (0.13 - k * 0.03) * m, 0.012 * m);
  },
  // a collage: a pastel skyline over figures in flat colour, discs and dots
  collage(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#7c5aa8', '#6a4c98', '#5a4288'], { len: 40, w: 12 });
    const cols = ['#ee8c84', '#f2a7bf', '#6c8fd6', '#a492d8', '#d84c56', '#f0c06a', '#7cc0b8'];
    for (let x = x0; x < x0 + w; ) { const bw = (0.18 + R() * 0.35) * m, bh = (0.35 + R() * 0.6) * m; g.fillStyle = cols[Math.floor(R() * cols.length)]; g.fillRect(x, 0.02 * m, bw, bh); g.fillStyle = 'rgba(40,30,60,0.45)'; for (let wy = 0.1 * m; wy < bh - 0.05 * m; wy += 0.12 * m) for (let wx = x + 0.04 * m; wx < x + bw - 0.06 * m; wx += 0.09 * m) g.fillRect(wx, wy, 0.04 * m, 0.06 * m); x += bw * (0.8 + R() * 0.3); }
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.globalAlpha = 0.85; g.beginPath(); g.arc(x0 + R() * w, H * (0.35 + R() * 0.55), (0.12 + R() * 0.22) * m, 0, 6.3); g.fill(); }
    g.globalAlpha = 1;
    const nF = Math.max(2, Math.round(w / (0.75 * m)));
    for (let i = 0; i < nF; i++) {
      const fxp = x0 + (i + 0.5) * (w / nF) + (R() - 0.5) * 0.15 * m, fy = H * (0.52 + R() * 0.1), r = 0.12 * m;
      g.fillStyle = cols[Math.floor(R() * cols.length)]; muBlob(g, R, fxp, fy + r * 3.2, r * 2.0, r * 2.4, 0.08, 20); g.fill();
      g.fillStyle = ['#8a5a44', '#c99a7a', '#5e3b2e', '#e2b896'][i % 4]; muBlob(g, R, fxp, fy, r * 0.85, r, 0.05, 18); g.fill();
      g.fillStyle = '#16121a'; muBlob(g, R, fxp, fy - r * 0.55, r * 1.15, r * 0.75, 0.2, 18); g.fill();
      g.beginPath(); g.arc(fxp - r * 0.3, fy, r * 0.09, 0, 6.3); g.arc(fxp + r * 0.3, fy, r * 0.09, 0, 6.3); g.fill();
      g.strokeStyle = '#16121a'; g.lineWidth = Math.max(1, r * 0.08); g.beginPath(); g.arc(fxp, fy + r * 0.3, r * 0.3, 0.3, 2.8); g.stroke();
    }
  },
  // big leaves in teal, sap green and night blue over dark green, a few small flowers
  leafy(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#2c5a3c', '#2a5539', '#244a33'], { len: 40, w: 12 });
    for (let i = 0; i < Math.round((w / m) * 26); i++) muLeaf(g, x0 + R() * w, R() * H, (0.25 + R() * 0.35) * m, (0.06 + R() * 0.06) * m, R() * 6.28, ['#3b8f7a', '#6aae5c', '#25406c', '#2f7a52', '#8cc46e'][i % 5], '#173326');
    for (let i = 0; i < Math.round((w / m) * 6); i++) { const fx = x0 + R() * w, fy = R() * H, r = 0.03 * m; g.fillStyle = ['#f1e6f0', '#f09ac0', '#f2d35c'][i % 3]; for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(fx + Math.cos(p * 1.26) * r, fy + Math.sin(p * 1.26) * r, r * 0.7, 0, 6.3); g.fill(); } }
  },
  // a woman in black and white on black, white peaks round her, flowers in her hair
  woman(g, R, x0, w, H, m, seed) {
    g.fillStyle = '#141414'; g.fillRect(x0, 0, w, H);
    // ranges of white peaks in brushed bands, cut through with black zigzags (the ground of the portrait)
    for (let band = 0; band < 4; band++) {
      const base = H * (0.42 + band * 0.17), amp = (0.12 + R() * 0.1) * m;
      g.fillStyle = band % 2 ? '#dcdbd5' : '#efeee9'; g.beginPath(); g.moveTo(x0, base + amp);
      for (let x = x0; x <= x0 + w + 0.2 * m; x += (0.1 + R() * 0.12) * m) g.lineTo(x, base - (R() < 0.5 ? amp * (0.6 + R()) : 0));
      g.lineTo(x0 + w, base + amp * 1.4); g.lineTo(x0, base + amp * 1.4); g.closePath(); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = Math.max(1.5, 0.02 * m); g.beginPath(); g.moveTo(x0, base + amp * 0.7);
      for (let x = x0; x <= x0 + w; x += 0.07 * m) g.lineTo(x, base + amp * (0.45 + (Math.round((x - x0) / (0.07 * m)) % 2 ? 0.5 : 0)));
      g.stroke();
    }
    const cx = x0 + w * 0.58, a = 0.36 * m, cy = H * 0.4;
    muPortrait(g, cx, cy, a, { pal: ['#111111', '#4f4f4f', '#a4a4a4', '#efefec'], hair: 'long', hairPal: ['#0f0f0f', '#3a3a3a'], yaw: -0.08, seed: seed + 5, shirt: ['#111111', '#5a5a5a'], collar: false, lips: '#1e1e1e' });
    for (let i = 0; i < 9; i++) { const t = Math.PI * (1.1 + 0.8 * (i / 8)), px = cx + Math.cos(t) * a * 1.05, py = cy - a * 0.35 + Math.sin(t) * a * 1.15; g.fillStyle = '#ecebe6'; for (let p = 0; p < 6; p++) { g.beginPath(); g.ellipse(px + Math.cos(p * 1.05) * a * 0.09, py + Math.sin(p * 1.05) * a * 0.09, a * 0.08, a * 0.045, p * 1.05, 0, 6.3); g.fill(); } g.fillStyle = '#141414'; g.beginPath(); g.arc(px, py, a * 0.04, 0, 6.3); g.fill(); }
  },
  // a wall of doodled characters in black line on white, packed edge to edge, green leaves and a flower or two
  doodles(g, R, x0, w, H, m) {
    g.fillStyle = '#efeee7'; g.fillRect(x0, 0, w, H);
    const C = [];
    for (let t = 0; t < 900 && C.length < 60; t++) { const r = (0.1 + R() * 0.26) * m, x = x0 + R() * w, y = R() * H; if (C.every((c) => Math.hypot(c[0] - x, c[1] - y) > (c[2] + r) * 0.95)) C.push([x, y, r]); }
    C.sort((p, q) => q[2] - p[2]);
    const lw = Math.max(1.5, 0.011 * m), ink = '#111111';
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = ink;
    for (const [x, y, r] of C) {
      const filled = R() < 0.3;
      muBlob(g, R, x, y, r * 0.9, r, 0.12, 24, (R() - 0.5) * 0.5);
      g.fillStyle = filled ? ink : '#f3f2ec'; g.fill(); g.stroke();
      const ne = R() < 0.2 ? 1 : R() < 0.85 ? 2 : 3, er = r * (0.16 + R() * 0.1);
      for (let e = 0; e < ne; e++) { const exx = x + (ne === 1 ? 0 : (e / (ne - 1) - 0.5) * r * 0.8), eyy = y - r * 0.25; g.fillStyle = '#f7f6f1'; g.beginPath(); g.arc(exx, eyy, er, 0, 6.3); g.fill(); g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(exx + (R() - 0.5) * er * 0.6, eyy + er * 0.2, er * 0.45, 0, 6.3); g.fill(); }
      const my = y + r * 0.35, mw = r * (0.3 + R() * 0.3);
      g.fillStyle = filled ? '#f7f6f1' : ink; g.beginPath(); g.moveTo(x - mw, my); g.quadraticCurveTo(x, my + r * 0.45, x + mw, my); g.closePath(); g.fill();
      if (R() < 0.6) { g.strokeStyle = filled ? ink : '#f7f6f1'; g.lineWidth = lw * 0.7; g.beginPath(); for (let k = 0; k <= 6; k++) { const px = x - mw * 0.8 + (k / 6) * mw * 1.6, py = my + (k % 2 ? r * 0.12 : 0.02 * r); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); g.strokeStyle = ink; g.lineWidth = lw; }
      if (R() < 0.45) { g.beginPath(); for (let k = 0; k <= 8; k++) { const px = x - r * 0.7 + (k / 8) * r * 1.4, py = y - r * (k % 2 ? 1.0 : 1.3); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
      else if (R() < 0.4) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * r * 0.3, y - r * 0.9); g.lineTo(x + s * r * 0.55, y - r * 1.45); g.stroke(); g.beginPath(); g.arc(x + s * r * 0.57, y - r * 1.5, r * 0.08, 0, 6.3); g.fillStyle = ink; g.fill(); } }
      if (!filled && R() < 0.5) { g.lineWidth = lw * 0.7; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (R() - 0.5) * r, y + r * 0.6 + (R() - 0.5) * r * 0.2, r * 0.07, 0, 6.3); g.stroke(); } g.lineWidth = lw; }
    }
    // the gaps: small doodles everywhere the characters left white
    for (let i = 0; i < Math.round((w / m) * 220); i++) {
      const x = x0 + R() * w, y = R() * H; if (C.some((c) => Math.hypot(c[0] - x, c[1] - y) < c[2] * 1.05)) continue;
      const s = (0.015 + R() * 0.03) * m, k = Math.floor(R() * 6);
      g.lineWidth = lw * 0.75; g.fillStyle = ink;
      if (k === 0) { g.beginPath(); g.arc(x, y, s * 0.3, 0, 6.3); g.fill(); }
      else if (k === 1) { g.beginPath(); g.arc(x, y, s, 0, 6.3); g.stroke(); }
      else if (k === 2) { g.beginPath(); for (let j = 0; j < 10; j++) { const t = (j / 10) * Math.PI * 2, rr = j % 2 ? s * 0.45 : s; j ? g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); } g.closePath(); g.stroke(); }
      else if (k === 3) { g.beginPath(); g.moveTo(x - s, y); g.bezierCurveTo(x - s * 0.3, y - s, x + s * 0.3, y + s, x + s, y); g.stroke(); }
      else if (k === 4) { g.beginPath(); g.arc(x, y, s * 0.8, 0, 6.3); g.stroke(); g.beginPath(); g.arc(x, y, s * 0.3, 0, 6.3); g.fill(); }
      else { g.beginPath(); for (let j = 0; j < 12; j++) { const t = j * 0.7, rr = s * (0.2 + j * 0.07); j ? g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : g.moveTo(x, y); } g.stroke(); }
    }
    g.restore();
    for (let i = 0; i < Math.max(2, Math.round(w / m)); i++) muLeaf(g, x0 + R() * w, H * (0.1 + R() * 0.8), (0.2 + R() * 0.15) * m, 0.07 * m, R() * 6.28, '#3f9441', '#123016');
    for (let i = 0; i < 2; i++) { const fx = x0 + R() * w, fy = H * (0.2 + R() * 0.6), r = 0.05 * m; g.fillStyle = '#e04a3a'; for (let p = 0; p < 6; p++) { g.beginPath(); g.arc(fx + Math.cos(p) * r, fy + Math.sin(p) * r, r * 0.6, 0, 6.3); g.fill(); } g.fillStyle = '#f2cf3c'; g.beginPath(); g.arc(fx, fy, r * 0.5, 0, 6.3); g.fill(); }
  },
  // a roll-down gate's figure piece (79 E 125th, b13_s / b14_s): a big dark portrait in a cap, then a man in white with a black outline
  // reaching across a red field brushed dark at one side (invented figures in the real piece's palette)
  figure(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#b5302a', '#c43a2f', '#a72a26'], { len: 60, w: 16, ang: 0.2, spread: 1.5, hi: '#e2664c', lo: '#4a0f10', strokes: 1.6 });
    // a big dark portrait in a cap at the west end, in the shadow tones of the red
    g.fillStyle = 'rgba(30,10,12,0.6)'; muBlob(g, R, x0 + w * 0.2, H * 0.55, w * 0.22, H * 0.5, 0.2, 20); g.fill();
    muPortrait(g, x0 + w * 0.2, H * 0.4, Math.min(w * 0.1, 0.36 * m), { pal: ['#1c0c0c', '#46201c', '#7c3a2e', '#b8735a'], hair: 'none', yaw: 0.3, seed: 791, shirt: ['#1c0c0c', '#46201c', '#7c3a2e'], lips: '#2a0f0f' });
    { const a = Math.min(w * 0.1, 0.36 * m), cx0 = x0 + w * 0.2 + a * 0.1, cy0 = H * 0.4 - a * 1.05; g.fillStyle = '#120808'; g.beginPath(); g.ellipse(cx0, cy0, a * 1.15, a * 0.55, 0.05, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(cx0 + a * 0.7, cy0 + a * 0.05, a * 0.85, a * 0.16, 0.08, 0, Math.PI * 2); g.fill(); }
    const cx = x0 + w * 0.64, s = H / 2.9, ink = '#141010', white = '#f2efe8', shade = '#c9c5bd';
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = Math.max(2, 0.03 * m); g.strokeStyle = ink;
    const shape = (pts, fill) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
    const P = (u, v) => [cx + u * s, H * 0.06 + v * s];
    shape([P(-0.35, 1.0), P(0.3, 0.95), P(0.42, 1.8), P(0.1, 1.85), P(-0.05, 1.3), P(-0.25, 1.85), P(-0.55, 1.8)], white);                 // torso and hips
    shape([P(0.1, 1.8), P(0.42, 1.8), P(0.75, 2.55), P(0.95, 2.6), P(0.92, 2.75), P(0.5, 2.72), P(0.15, 2.0)], white);                      // the striding leg
    shape([P(-0.55, 1.8), P(-0.25, 1.85), P(-0.45, 2.7), P(-0.25, 2.75), P(-0.3, 2.85), P(-0.75, 2.82), P(-0.68, 2.0)], shade);           // the back leg
    shape([P(0.25, 1.0), P(0.95, 0.75), P(1.35, 0.45), P(1.42, 0.55), P(1.0, 0.95), P(0.35, 1.25)], white);                                // the reaching arm
    shape([P(-0.3, 1.05), P(-0.75, 1.45), P(-0.85, 1.8), P(-0.7, 1.82), P(-0.55, 1.5), P(-0.2, 1.3)], shade);                              // the other arm
    g.beginPath(); g.ellipse(P(0, 0.62)[0], P(0, 0.62)[1], 0.3 * s, 0.36 * s, 0.1, 0, Math.PI * 2); g.fillStyle = '#3a2018'; g.fill(); g.stroke();   // the head, in shadow
    g.fillStyle = 'rgba(150,90,70,0.8)'; g.beginPath(); g.ellipse(P(-0.08, 0.6)[0], P(-0.08, 0.6)[1], 0.12 * s, 0.22 * s, 0.1, 0, Math.PI * 2); g.fill();  // the lit cheek
    g.beginPath(); g.ellipse(P(0.02, 0.33)[0], P(0.02, 0.33)[1], 0.34 * s, 0.14 * s, 0.1, Math.PI, 0); g.fillStyle = white; g.fill(); g.stroke();    // a white cap
    g.fillStyle = white; g.fillRect(P(0.0, 0.3)[0], P(0.0, 0.3)[1], 0.42 * s, 0.06 * s);
    g.restore();
  },
  // a roll-down gate's boombox (111-113 E 125th, b20_s): a big stereo in black line and white over a violet-to-pink spray, speakers as
  // rings, a cassette deck, sound waves and splashes of colour, a big-eyed character beside it (invented)
  boombox(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#5b3ea8', '#8a46b0', '#d9539a', '#e9817e'], { len: 50, w: 14, ang: 0.4, spread: 2.5 });
    for (let i = 0; i < 9; i++) { g.fillStyle = ['#f2d23a', '#3fb5e8', '#ef4b6a', '#58c26a'][i % 4]; g.globalAlpha = 0.8; muBlob(g, R, x0 + R() * w, R() * H, (0.12 + R() * 0.2) * m, (0.1 + R() * 0.15) * m, 0.3, 16, R() * 3); g.fill(); }
    g.globalAlpha = 1;
    const bx = x0 + w * 0.08, bw = Math.min(w * 0.62, 4.2 * m), bh = Math.min(H * 0.55, bw * 0.45), by = H * 0.28, ink = '#121212';
    g.save(); g.lineJoin = 'round'; g.lineWidth = Math.max(2, 0.03 * m); g.strokeStyle = ink;
    g.fillStyle = '#ecebe6'; g.beginPath(); g.rect(bx, by, bw, bh); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(bx + bw * 0.2, by); g.lineTo(bx + bw * 0.25, by - bh * 0.25); g.lineTo(bx + bw * 0.75, by - bh * 0.25); g.lineTo(bx + bw * 0.8, by); g.stroke();
    for (const fx of [0.2, 0.8]) { const sx = bx + bw * fx, sy = by + bh * 0.55; for (const [r, c] of [[0.36, ink], [0.3, '#4a4a4a'], [0.2, ink], [0.09, '#d0d0cc']]) { g.fillStyle = c; g.beginPath(); g.arc(sx, sy, bh * r, 0, 6.3); g.fill(); } }
    g.fillStyle = '#2b2b2b'; g.fillRect(bx + bw * 0.38, by + bh * 0.3, bw * 0.24, bh * 0.38); g.fillStyle = '#9ad0e8'; g.fillRect(bx + bw * 0.4, by + bh * 0.35, bw * 0.2, bh * 0.14);
    g.fillStyle = ink; for (let k = 0; k < 6; k++) g.fillRect(bx + bw * (0.38 + k * 0.04), by + bh * 0.12, bw * 0.025, bh * 0.08);
    g.strokeStyle = '#f7f3ea'; g.lineWidth = Math.max(2, 0.025 * m); for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(bx + bw, by + bh * 0.55, bh * (0.35 + k * 0.18), -0.7, 0.7); g.stroke(); }
    const cx = x0 + w * 0.86, cy = H * 0.5, r = Math.min(w * 0.11, 0.55 * m);
    g.fillStyle = '#e8456a'; g.strokeStyle = ink; g.lineWidth = Math.max(2, 0.025 * m); muBlob(g, R, cx, cy, r, r * 1.25, 0.12, 22); g.fill(); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + s * r * 0.38, cy - r * 0.25, r * 0.3, 0, 6.3); g.fill(); g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(cx + s * r * 0.33, cy - r * 0.2, r * 0.13, 0, 6.3); g.fill(); }
    g.beginPath(); g.arc(cx, cy + r * 0.35, r * 0.35, 0.2, 2.9); g.stroke();
    g.restore();
  },
  // tropical leaves in violet, blush and coral on a magenta ground; a small square cut in the sheet near the top
  pinkleaf(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#cf3a88', '#d84895', '#e05ca2'], { len: 50, w: 14, ang: 1, spread: 2 });
    const big = (x, y, len, ang, col, vein) => {
      g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
      g.beginPath(); g.moveTo(0, 0);
      for (let k = 0; k <= 8; k++) { const t = k / 8, px = len * t, pw = len * 0.32 * Math.sin(Math.PI * t) * (k % 2 ? 0.75 : 1); g.lineTo(px, -pw); }
      for (let k = 8; k >= 0; k--) { const t = k / 8, px = len * t, pw = len * 0.32 * Math.sin(Math.PI * t) * (k % 2 ? 0.75 : 1); g.lineTo(px, pw); }
      g.closePath(); g.fill();
      g.strokeStyle = vein; g.lineWidth = Math.max(1, len * 0.02); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); for (let k = 1; k < 6; k++) { g.moveTo(len * k / 6, 0); g.lineTo(len * (k / 6 + 0.1), -len * 0.2); g.moveTo(len * k / 6, 0); g.lineTo(len * (k / 6 + 0.1), len * 0.2); } g.stroke();
      g.restore();
    };
    // broad leaves first (violet, plum), then the lighter ones over them (blush, coral), each with a lit edge
    const broad = (x, y, len, ang, col, hi) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.25, -len * 0.42, len * 0.8, -len * 0.3, len, 0); g.bezierCurveTo(len * 0.8, len * 0.3, len * 0.25, len * 0.42, 0, 0); g.fill();
      g.strokeStyle = hi; g.lineWidth = Math.max(1.5, len * 0.025); g.beginPath(); g.moveTo(len * 0.05, -len * 0.05); g.bezierCurveTo(len * 0.3, -len * 0.38, len * 0.78, -len * 0.28, len * 0.97, -len * 0.02); g.stroke();
      g.strokeStyle = 'rgba(70,10,60,0.5)'; g.lineWidth = Math.max(1, len * 0.015); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0);
      for (let k = 1; k < 6; k++) { const px = len * k / 6.5; g.moveTo(px, 0); g.quadraticCurveTo(px + len * 0.06, -len * 0.12, px + len * 0.12, -len * 0.26 * Math.sin(Math.PI * k / 6.5)); g.moveTo(px, 0); g.quadraticCurveTo(px + len * 0.06, len * 0.12, px + len * 0.12, len * 0.26 * Math.sin(Math.PI * k / 6.5)); }
      g.stroke(); g.restore();
    };
    for (let i = 0; i < Math.round((w / m) * 4); i++) broad(x0 + R() * w, R() * H, (0.55 + R() * 0.45) * m, R() * 6.28, ['#6a2f93', '#8e2a78', '#7b3aa2'][i % 3], '#c87fd8');
    for (let i = 0; i < Math.round((w / m) * 4); i++) broad(x0 + R() * w, R() * H, (0.45 + R() * 0.4) * m, R() * 6.28, ['#f3a3c9', '#ef7a5c', '#f6c0d6', '#e65c8e'][i % 4], '#fff0f6');
    for (let i = 0; i < Math.round((w / m) * 3); i++) big(x0 + R() * w, R() * H, (0.25 + R() * 0.25) * m, R() * 6.28, ['#c55bd0', '#a0236a', '#f08a6a'][i % 3], 'rgba(60,10,50,0.45)');
    g.fillStyle = '#1e1a1c'; g.fillRect(x0 + w * 0.1, H * 0.2, 0.11 * m, 0.13 * m);
    g.strokeStyle = '#f7f2f4'; g.lineWidth = Math.max(1, 0.01 * m); g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { let x = x0 + w * (0.25 + k * 0.4), y = H * 0.1; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += 0.05 * m; g.quadraticCurveTo(x - 0.03 * m, y - 0.07 * m, x, y + (R() - 0.5) * 0.03 * m); } g.stroke(); }
  },
  // green-painted plywood, layered with tags: big chrome hand styles outlined in black, white and black marker tags, buffed patches
  greentags(g, R, x0, w, H, m) {
    muGround(g, R, x0, w, H, ['#2f5f47', '#2d5b44', '#2a5541'], { len: 80, w: 20, ang: 1.57, spread: 0.2, hi: '#4b7a62', lo: '#173326', strokes: 1.5 });
    for (let i = 0; i < Math.round(w / m); i++) { g.fillStyle = ['#27503c', '#34654c', '#24493a'][i % 3]; g.globalAlpha = 0.85; g.fillRect(x0 + R() * w * 0.9, H * (0.15 + R() * 0.5), (0.6 + R() * 1.2) * m, (0.3 + R() * 0.6) * m); }
    g.globalAlpha = 1;
    const hand = (x, y, wd, ht, col, line, lw) => {
      const n = 4 + Math.floor(R() * 3), step = wd / n;
      const pts = [];
      let px = x;
      if (R() < 0.6) {
        // a cursive run: one stroke of loops, humps and tall hooks, the way a hand style flows letter to letter
        const run = [[px, y + ht * 0.8]];
        for (let i = 0; i < n; i++) {
          const k = Math.floor(R() * 4), s = step * (0.8 + R() * 0.4);
          if (k === 0) run.push([px + s * 0.2, y + ht * 0.1], [px + s * 0.55, y + ht * 0.05], [px + s * 0.45, y + ht * 0.6], [px + s * 0.15, y + ht * 0.5], [px + s * 0.6, y + ht * 0.9]);
          else if (k === 1) run.push([px + s * 0.25, y - ht * 0.25], [px + s * 0.35, y + ht * 0.95], [px + s * 0.7, y + ht * 0.7]);
          else if (k === 2) run.push([px + s * 0.2, y + ht * 0.3], [px + s * 0.45, y + ht * 0.95], [px + s * 0.65, y + ht * 0.3], [px + s * 0.9, y + ht * 0.95]);
          else run.push([px + s * 0.3, y + ht * 0.45], [px + s * 0.15, y + ht * 0.95], [px + s * 0.7, y + ht * 0.55]);
          px += s;
        }
        run.push([px + step * 0.4, y + ht * 1.05], [x + step * 0.2, y + ht * 1.25]);
        const draw = (wdt, c) => { g.strokeStyle = c; g.lineWidth = wdt; g.beginPath(); g.moveTo(run[0][0], run[0][1]); for (let j = 1; j + 1 < run.length; j++) g.quadraticCurveTo(run[j][0], run[j][1], (run[j][0] + run[j + 1][0]) / 2, (run[j][1] + run[j + 1][1]) / 2); g.lineTo(run[run.length - 1][0], run[run.length - 1][1]); g.stroke(); };
        g.lineCap = 'round'; g.lineJoin = 'round';
        if (line) draw(lw * 2.3, line);
        draw(lw, col);
        if (line) { g.globalAlpha = 0.5; draw(lw * 0.35, '#ffffff'); g.globalAlpha = 1; }
        return;
      }
      for (let i = 0; i < n; i++) {
        const k = Math.floor(R() * 5);
        if (k === 0) pts.push([[px, y + ht], [px + step * 0.3, y], [px + step * 0.6, y + ht]]);
        else if (k === 1) pts.push([[px + step * 0.6, y + ht * 0.1], [px, y + ht * 0.3], [px + step * 0.55, y + ht * 0.6], [px, y + ht]]);
        else if (k === 2) pts.push([[px, y], [px, y + ht], [px + step * 0.5, y + ht * 0.55], [px + step * 0.65, y]]);
        else if (k === 3) pts.push([[px, y + ht * 0.5], [px + step * 0.35, y - ht * 0.2], [px + step * 0.6, y + ht * 1.1]]);
        else pts.push([[px, y + ht * 0.6], [px + step * 0.65, y + ht * 0.5], [px + step * 0.5, y + ht * 0.05], [px + step * 0.02, y + ht * 0.3], [px + step * 0.15, y + ht * 0.95], [px + step * 0.75, y + ht * 0.8]]);
        px += step * (0.75 + R() * 0.3);
      }
      const draw = (wdt, c) => { g.strokeStyle = c; g.lineWidth = wdt; for (const p of pts) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let j = 1; j < p.length; j++) g.quadraticCurveTo((p[j - 1][0] + p[j][0]) / 2 + (R() - 0.5) * step * 0.2, (p[j - 1][1] + p[j][1]) / 2, p[j][0], p[j][1]); g.stroke(); } g.beginPath(); g.moveTo(x - step * 0.2, y + ht * 1.15); g.quadraticCurveTo(x + wd * 0.5, y + ht * 1.45, px + step * 0.3, y + ht * 0.95); g.stroke(); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (line) draw(lw * 2.2, line);
      draw(lw, col);
    };
    // an older generation gone dull under the newer: grey-green ghosts of big tags
    g.globalAlpha = 0.35; for (let i = 0; i < Math.round(w / m); i++) hand(x0 + R() * w * 0.7, H * (0.1 + R() * 0.4), (0.9 + R() * 0.8) * m, (0.35 + R() * 0.3) * m, '#9fb3a6', null, 0.03 * m); g.globalAlpha = 1;
    hand(x0 + 0.08 * w, H * 0.2, w * 0.5, H * 0.42, '#d9dcdc', '#111111', 0.035 * m);
    hand(x0 + 0.5 * w, H * 0.26, w * 0.42, H * 0.34, '#c9cdd0', '#111111', 0.03 * m);
    hand(x0 + 0.3 * w, H * 0.5, w * 0.35, H * 0.22, '#eef0ee', '#111111', 0.022 * m);
    for (let i = 0; i < Math.round((w / m) * 3.2); i++) hand(x0 + R() * w * 0.85, H * (0.1 + R() * 0.7), (0.35 + R() * 0.55) * m, (0.1 + R() * 0.14) * m, ['#efefe9', '#111111', '#e9e9e2', '#1b2a55', '#c9cdd0'][i % 5], null, Math.max(1.5, 0.009 * m));
    // drips under the big silver strokes
    g.strokeStyle = '#c9cdd0'; g.lineWidth = Math.max(1, 0.006 * m); for (let i = 0; i < Math.round((w / m) * 5); i++) { const x = x0 + R() * w, y = H * (0.35 + R() * 0.35); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (0.05 + R() * 0.2) * m); g.stroke(); }
  },
};
// paints the run of panels over [off, off + len] metres of the hoarding: plan = [[kind, width m], ...] from the run's left end as seen
// from the street; returns the canvas (W x H px) and a normal-map canvas (sheet joints, screws, the grain of the ply)
function muSite(len, H_m, off, plan, seed, pxm = 128, o = {}) {
  const W = Math.min(4096, Math.round(len * pxm)), m = W / len, H = Math.round(H_m * m);
  const cv = muCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#7d8a74'; g.fillRect(0, 0, W, H);
  let u = 0, k = 0;
  for (const [kind, wm] of plan) {
    const a = u, b = u + wm; u = b; k++;
    if (b <= off || a >= off + len || !MU_PANELS[kind]) continue;
    const x0 = Math.round((a - off) * m), x1 = Math.round((b - off) * m);
    let s = (seed + k * 7919) >>> 0; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
    g.save(); g.beginPath(); g.rect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H); g.clip();
    MU_PANELS[kind](g, R, x0, x1 - x0, H, m, s);
    g.restore();
  }
  // the ageing pass and the sheet joints, composited (a per-pixel pass cost ~110 ms of main thread per hoarding at load): a grain tile
  // laid with 'multiply', soft blotches of grime and of sun-bleach, the fade toward the cap, grime and splash at the foot, rain runs, the
  // joints between sheets (or the slats of a gate) as dark lines with a lit lip
  {
    const sheet = 1.22 * m, slat = o.slats ? o.slats * m : 0;
    let s2 = (seed * 977 + 13) >>> 0; const R2 = () => { s2 ^= s2 << 13; s2 >>>= 0; s2 ^= s2 >>> 17; s2 ^= s2 << 5; s2 >>>= 0; return (s2 % 100000) / 100000; };
    g.save();
    const gt = muCanvas(96, 96);
    const gc = gt.getContext('2d');
    const gi = gc && gc.createImageData ? gc.createImageData(96, 96) : null;
    if (gi && gi.data && g.createPattern) {
      const GD = gi.data, nzg = MU.noise(seed + 101);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const v = 222 + 33 * (0.6 * nzg(x * 0.45, y * 0.45) + 0.4 * nzg(x * 0.12, y * 1.6)), k = (y * 96 + x) * 4; GD[k] = GD[k + 1] = GD[k + 2] = Math.min(255, v); GD[k + 3] = 255; }
      gc.putImageData(gi, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(gt, 'repeat'); g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < Math.round(len * 1.6); i++) {
      const x = R2() * W, y = R2() * H, r = (0.3 + R2() * 0.9) * m, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(170,160,145,${0.18 + R2() * 0.14})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const foot = g.createLinearGradient(0, H - 0.55 * m, 0, H);
    foot.addColorStop(0, 'rgba(255,255,255,0)'); foot.addColorStop(0.6, 'rgba(160,150,135,0.6)'); foot.addColorStop(1, 'rgba(110,100,88,0.95)');
    g.fillStyle = foot; g.fillRect(0, H - 0.55 * m, W, 0.55 * m);
    for (let i = 0; i < Math.round(len * 3); i++) {
      const x = R2() * W, w = 1 + R2() * 0.03 * m, y0 = R2() * H * 0.3, l = H * (0.3 + 0.6 * R2()), gr = g.createLinearGradient(0, y0, 0, y0 + l);
      gr.addColorStop(0, `rgba(150,140,128,${0.35 + R2() * 0.3})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y0, w, l);
    }
    g.globalCompositeOperation = 'source-over';
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(226,220,208,0.13)'); fade.addColorStop(0.5, 'rgba(226,220,208,0.04)'); fade.addColorStop(1, 'rgba(226,220,208,0)');
    g.fillStyle = fade; g.fillRect(0, 0, W, H);
    for (let i = 0; i < Math.round(len * 0.8); i++) {
      const x = R2() * W, y = R2() * H * 0.7, r = (0.3 + R2() * 0.7) * m, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(230,225,214,${0.06 + R2() * 0.08})`); gr.addColorStop(1, 'rgba(230,225,214,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (slat) {
      for (let y = 0; y < H; y += slat) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, y, W, 1.2); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, y + 1.2, W, 1.2); }
    } else {
      for (let x = (((-off * m) % sheet) + sheet) % sheet; x < W; x += sheet) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 1.4, H); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 1.4, 0, 1.2, H); }
    }
    g.restore();
  }
  // scuffs, a few stickers and small tags over the murals, flecks of paint lost to the ply
  {
    let s = (seed * 31 + 5) >>> 0; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
    for (let i = 0; i < Math.round(len * 0.8); i++) { g.fillStyle = ['#e9e4d6', '#e3d94c', '#d9473f', '#c9d2d9', '#ffffff'][i % 5]; const sw = (0.06 + R() * 0.1) * m; g.globalAlpha = 0.9; g.fillRect(R() * W, (0.6 + R() * 1.4) * m, sw, sw * (0.5 + R() * 0.5)); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(15,15,15,0.8)'; g.lineWidth = Math.max(1.2, 0.007 * m); g.lineCap = 'round';
    for (let i = 0; i < Math.round(len * 0.5); i++) { let x = R() * W, y = (0.5 + R() * 1.5) * m; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += 0.04 * m; g.quadraticCurveTo(x - 0.03 * m, y - (R() * 0.1) * m, x, y + (R() - 0.5) * 0.04 * m); } g.stroke(); }
    for (let i = 0; i < Math.round(len * 14); i++) { const y = H * Math.pow(R(), 0.35), x = R() * W, r = (0.003 + R() * 0.007) * m; g.fillStyle = `rgba(${150 + R() * 40},${125 + R() * 30},${90 + R() * 20},0.85)`; g.beginPath(); g.ellipse(x, y, r * (1 + R()), r, R() * 3, 0, 6.3); g.fill(); }
  }
  // the normal map: joints, screws along the joints and the rails, the ply's grain
  const NW = Math.max(64, Math.round(W / 4)), NH = Math.max(16, Math.round(H / 4)), nk = NW / len, nm = muCanvas(NW, NH);
  const ng = nm.getContext('2d'), nimg = ng.createImageData ? ng.createImageData(NW, NH) : null, N = nimg && nimg.data, nz2 = MU.noise(seed + 101);
  if (!N) return { cv, nm };
  const hgt = (x, y) => { const xm = x / nk + off, ym = y / nk, jx = ((xm % 1.22) + 1.22) % 1.22;
    if (o.slats) { const sv = (ym % o.slats) / o.slats; return 0.5 + 0.35 * Math.sin(sv * Math.PI) - (sv < 0.1 ? 0.4 : 0); } let h = 0.5 + 0.08 * nz2(xm * 1.2, ym * 25); if (jx < 0.012 || jx > 1.212) h -= 0.6; const sy = [0.35, 1.25, H_m - 0.25]; for (const yy of sy) { const dx = (jx < 0.61 ? jx - 0.03 : jx - 1.19), dy = ym - yy; if (dx * dx + dy * dy < 0.0001) h -= 0.3; } return h; };
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) { const h = hgt(x, y), dx = hgt(x + 1, y) - h, dy = hgt(x, y + 1) - h, i = (y * NW + x) * 4; let vx = -dx * 2, vy = dy * 2, vz = 1; const l = Math.hypot(vx, vy, vz); N[i] = 128 + 127 * vx / l; N[i + 1] = 128 + 127 * vy / l; N[i + 2] = 128 + 127 * vz / l; N[i + 3] = 255; }
  ng.putImageData(nimg, 0, 0);
  return { cv, nm };
}
return { muSite, MU_PANELS };
}
// --- mural painters (end)
const { muSite } = muLib();

// The painting runs off the main thread (AR34 w2 b3, session 2: in the plates the two Lexington lots and the two painted gates had
// raised tile 5_-5's build from 1058 to 1407-1456 ms of main thread): a worker runs muLib from its source text on OffscreenCanvases and
// hands back two ImageBitmaps, flipped as a CanvasTexture's flipY would flip them. The build lays a plywood-coloured placeholder and
// the painted sheets swap in when they arrive (the material has a map and a normal map from the start: no new shader program). One
// painting per set of arguments for the session (a tile that reloads reuses it). Without workers (the kit bench) or with `?e34muw=0`
// the painting runs here at once, as before (the A/B).
const MUW_OFF = typeof location !== 'undefined' && /[?&]e34muw=0(&|$)/.test(location.search || '');
const MU_PROF = typeof location !== 'undefined' && /[?&]e34prof=1(&|$)/.test(location.search || '');   // a log line per painting
const muJobs = new Map(), muCache = new Map();
let muW = null, muSeq = 0, muPh = null;
function muWorker() {
  if (muW !== null) return muW;
  muW = false;
  if (MUW_OFF || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined' || typeof Blob === 'undefined') return muW;
  try {
    const src = `const { muSite } = (${muLib.toString()})();\n`
      + 'onmessage = async (e) => { const { id, args } = e.data; try { const t0 = performance.now(), { cv, nm } = muSite(...args);'
      + ' const [c, n] = await Promise.all([cv, nm].map((v) => createImageBitmap(v, { imageOrientation: \'flipY\' })));'
      + ' postMessage({ id, c, n, ms: performance.now() - t0 }, [c, n]); } catch (err) { postMessage({ id, err: String((err && err.message) || err) }); } };';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = (e) => { const j = muJobs.get(e.data.id); muJobs.delete(e.data.id); if (j) j(e.data); };
    w.onerror = (e) => { console.warn('[east] mural worker:', (e && e.message) || e); muW = false; for (const j of muJobs.values()) j({ err: 'the worker failed' }); muJobs.clear(); };
    muW = w;
  } catch (e) { muW = false; }
  return muW;
}
const muTex = (img, srgb, aniso, flipY) => {
  const t = new THREE.Texture(img);
  t.flipY = flipY; t.anisotropy = aniso; t.needsUpdate = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// muSite(...args) as textures { map, nmap }: at once without a worker, else a promise
function muPaint(args) {
  const key = JSON.stringify(args);
  if (muCache.has(key)) return muCache.get(key);
  const here = () => {
    const t0 = performance.now(), { cv, nm } = muSite(...args);
    if (MU_PROF) console.log(`[east] mural ${args[0].toFixed(2)} m painted on the main thread in ${(performance.now() - t0).toFixed(0)} ms`);
    return { map: muTex(cv, true, 8, true), nmap: muTex(nm, false, 4, true) };
  };
  const w = muWorker();
  const r = !w ? here() : new Promise((res) => {
    const id = ++muSeq;
    muJobs.set(id, (d) => {
      if (d.err || !d.c) { console.warn(`[east] mural painting: ${d.err || 'no image'}; painted on the main thread`); const v = here(); muCache.set(key, v); res(v); return; }
      if (MU_PROF) console.log(`[east] mural ${args[0].toFixed(2)} m painted in the worker in ${d.ms.toFixed(0)} ms`);
      const v = { map: muTex(d.c, true, 8, false), nmap: muTex(d.n, false, 4, false) };
      muCache.set(key, v); res(v);
    });
    w.postMessage({ id, args });
  });
  muCache.set(key, r);
  return r;
}

// the city's value curve for a canvas-painted surface (the kit's PBR walls read 0.88 x albedo^1.22 by day; applyLightTrim multiplies by
// mix(0.30, 0.88, night), divided out here), so a painted sheet sits at the brightness of the brick beside it for the same colour
function muCalib(m) {
  const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.kE34N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kE34N;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.22)) * 0.88 / mix(0.30, 0.88, kE34N);');
  };
  m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '|e34cal';
  return applyCityAO(applyLightTrim(m));
}
// a painted run's material (args: muSite's), calibrated as above; the placeholder until the worker's painting arrives
function muMaterial(args, o) {
  const mat = muCalib(new THREE.MeshStandardMaterial({ normalScale: new THREE.Vector2(o.nScale, o.nScale), roughness: o.roughness, metalness: o.metalness ?? 0, ...(o.extra || {}) }));
  const put = (v) => { mat.map = v.map; mat.normalMap = v.nmap; };
  const r = muPaint(args);
  if (typeof r.then !== 'function') { put(r); return mat; }
  if (!muPh) {
    const c = new THREE.DataTexture(new Uint8Array([125, 138, 116, 255]), 1, 1), n = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    c.colorSpace = THREE.SRGBColorSpace; c.needsUpdate = n.needsUpdate = true;
    muPh = { map: c, nmap: n };
  }
  put(muPh);
  r.then(put);
  return mat;
}
// spec.site: { kind: 'hoarding' | 'mesh' | 'tarp', h: 2.6, inset: 0.25, murals: { plan: [[panel, width m], ...], off (the run's metres
// before this lot's u 0), seed } (MU_PANELS; without it the painted shapes), barricades: [[u0, u1], ...] (steel crowd-control barriers on
// the sidewalk in front) }
export function hoarding(group, ctx, spec, frame) {
  const site = { kind: 'hoarding', h: 2.6, inset: 0.3, ...(spec.site || {}) };
  // ext1: a hoarding out on the sidewalk may run on past the lot's u1 end, in front of the neighbour's corner (b62_s / b63_s)
  const K = frame.kit, L0 = frame.L, h = site.h, w0 = -site.inset, L = L0 + (site.ext1 || 0);
  const seed = strHash(spec.id || 'lot');
  const post = K.mat('wood_painted', { tint: '#8a7352', dirt: 0.5 });
  // the lot's ground inside the ring: packed dirt and gravel
  {
    const ring = frame.ring, shape = new THREE.Shape();
    ring.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);   // shape (x, -z) -> (x, 0, z)
    const gm = new THREE.MeshStandardMaterial({ color: 0x6d6254, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, gm);
    m.position.y = frame.y0 + 0.03;
    m.receiveShadow = true;
    m.name = 'fk_lot_ground';
    frame.kit.add(m);
  }
  if (site.kind === 'tarp') {
    // a chain-link construction fence with a green windscreen tarp, on a precast concrete barrier (Second-First Avenue lots)
    const conc = K.mat('concrete_precast', { tint: '#b4b0a6', dirt: 0.6 });
    const steel = K.mat('steel_galvanized', { dirt: 0.3 });
    const tarpM = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
    const hb = 0.85, hh = site.h || 2.6;
    K.box(conc, 0, L, 0, hb, w0 - 0.3, w0 + 0.3, { c: 0.05 });
    K.box(conc, 0, L, hb - 0.12, hb, w0 - 0.36, w0 + 0.36, { c: 0.03, near: true });
    const n = Math.max(2, Math.round(L / 2.4));
    for (let i = 0; i <= n; i++) { const u = (L * i) / n; K.box(steel, u - 0.03, u + 0.03, hb, hh, w0 - 0.03, w0 + 0.03, { near: true, c: 0.004 }); }
    K.box(steel, 0, L, hh - 0.04, hh, w0 - 0.02, w0 + 0.02, { near: true, c: 0.004 });
    K.box(steel, 0, L, hb + 0.02, hb + 0.06, w0 - 0.02, w0 + 0.02, { near: true, c: 0.004 });
    const geo = new THREE.PlaneGeometry(L, hh - hb - 0.1);
    const m = new THREE.Mesh(geo, tarpM);
    m.applyMatrix4(frame.matrix(L / 2, hb + 0.05 + (hh - hb - 0.1) / 2, w0 + 0.03));
    m.name = 'fk_tarp';
    frame.kit.add(m);
    return;
  }
  if (site.kind === 'mesh') {
    // a black mesh fence on steel posts (construction fence), 2.4 m
    const steel = K.mat('steel_black');
    const meshM = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.9, metalness: 0.2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const n = Math.max(2, Math.round(L / 2.4));
    for (let i = 0; i <= n; i++) { const u = (L * i) / n; K.box(steel, u - 0.04, u + 0.04, 0, h, w0 - 0.04, w0 + 0.04, { near: true }); }
    K.box(steel, 0, L, h - 0.06, h, w0 - 0.03, w0 + 0.03, { near: true });
    K.box(steel, 0, L, 0.0, 0.12, w0 - 0.03, w0 + 0.03, { near: true });
    const geo = new THREE.PlaneGeometry(L, h - 0.18);
    const m = new THREE.Mesh(geo, meshM);
    m.applyMatrix4(frame.matrix(L / 2, 0.12 + (h - 0.18) / 2, w0));
    frame.kit.add(m);
    return;
  }
  // a plywood hoarding: a 2x4 frame on 4x4 posts, sheets painted with a mural, a cap rail
  const ply = K.mat('wood_painted', { tint: '#b99a6c', dirt: 0.55 });
  K.box(ply, 0, L, 0.0, h, w0 - 0.05, w0, { c: 0.004 });
  const n = Math.max(2, Math.round(L / 2.4));
  for (let i = 0; i <= n; i++) { const u = (L * i) / n; K.box(post, u - 0.06, u + 0.06, 0, h + 0.05, w0 - 0.19, w0 - 0.05, { c: 0.01 }); }
  K.box(post, 0, L, h - 0.02, h + 0.06, w0 - 0.2, w0 + 0.06, { c: 0.008, near: true });
  K.box(post, 0, L, 0.35, 0.47, w0 - 0.19, w0 - 0.05, { c: 0.006, near: true });
  K.box(post, 0, L, 1.2, 1.3, w0 - 0.19, w0 - 0.05, { c: 0.006, near: true });
  // a hoarding out on the sidewalk turns back to the lot line at its ends ('u0', 'u1' or both): painted plywood on the same frame
  if (site.returns && w0 > 0.1) {
    const back = K.mat('wood_painted', { tint: '#4f6b48', dirt: 0.55 });
    for (const [end, ua, ub] of [['u0', -0.05, 0], ['u1', L, L + 0.05]]) if (site.returns === true || site.returns === end) K.box(back, ua, ub, 0, h, -0.3, w0, { c: 0.004 });
  }
  // the mural face on the street side of the plywood
  let mat;
  if (site.murals && typeof document !== 'undefined') {
    mat = muMaterial([L, h, site.murals.off || 0, site.murals.plan, site.murals.seed ?? 125], { nScale: 0.6, roughness: 0.82 });
  } else mat = new THREE.MeshStandardMaterial({ map: paintHoarding(L, seed), roughness: 0.85, metalness: 0 });
  const geo = new THREE.PlaneGeometry(L - 0.02, h - 0.06);
  const m = new THREE.Mesh(geo, mat);
  m.applyMatrix4(frame.matrix(L / 2, 0.03 + (h - 0.06) / 2, w0 + 0.004));
  m.castShadow = false;
  m.receiveShadow = true;
  m.name = 'fk_hoarding_mural';
  frame.kit.add(m);
  // the dirt heaped against the foot of the boards inside
  const ds = K.mat('concrete_board', { tint: '#6b5f50', dirt: 0.6 });
  K.box(ds, 0, L, 0, 0.3, w0 - 1.2, w0 - 0.05, { c: 0.1, near: true });
  // steel crowd-control barriers on the sidewalk in front (b65_s: one before the green tagged sheet): end frames on splayed feet,
  // top and bottom rails, upright bars at 0.1 m
  const galv = K.mat('steel_galvanized', { dirt: 0.35 });
  for (const [ua, ub] of site.barricades || []) {
    const wb = w0 + 0.75, hb = 1.08;
    for (const u of [ua, ub]) { K.box(galv, u - 0.022, u + 0.022, 0.08, hb, wb - 0.022, wb + 0.022, { near: true, c: 0.004 }); K.box(galv, u - 0.03, u + 0.03, 0.0, 0.05, wb - 0.32, wb + 0.32, { near: true, c: 0.004 }); }
    K.box(galv, ua, ub, hb - 0.04, hb, wb - 0.02, wb + 0.02, { near: true, c: 0.004 });
    K.box(galv, ua, ub, 0.2, 0.24, wb - 0.02, wb + 0.02, { near: true, c: 0.004 });
    for (let u = ua + 0.1; u < ub - 0.05; u += 0.1) K.box(galv, u - 0.008, u + 0.008, 0.24, hb - 0.04, wb - 0.008, wb + 0.008, { near: true, c: 0 });
  }
}

// ================================================================== 122 E 125th St, Popeyes: the standing-seam
// awning over the upper glass, the promotion posters in the windows and the round blade sign at the east corner. The posters are invented
// (price numerals, chicken, fries and biscuits drawn from scratch, no logo); the roundel carries the brand's initial only, drawn here.
// spec.awnings: [{ u0, u1, y (the valance's foot), drop (to the top at the wall), proj, color }], spec.posters: [{ u, y, w, h, upper }],
// spec.roundel: { u, y, d, proj }
function paintPosters(n, seed) {
  const R = rng(seed), PW = 256, PH = 352;
  const cv = document.createElement('canvas'); cv.width = PW * n; cv.height = PH;
  const g = cv.getContext('2d');
  const drum = (x, y, s, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#b8682a'; g.beginPath(); g.ellipse(0, 0, s, s * 0.62, 0, 0, 6.3); g.fill(); g.fillStyle = '#d98a3a'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc((R() - 0.5) * s * 1.4, (R() - 0.5) * s * 0.8, s * (0.12 + R() * 0.12), 0, 6.3); g.fill(); } g.fillStyle = '#f1dcc0'; g.fillRect(s * 0.85, -s * 0.12, s * 0.7, s * 0.24); g.beginPath(); g.arc(s * 1.6, -s * 0.1, s * 0.16, 0, 6.3); g.arc(s * 1.6, s * 0.12, s * 0.16, 0, 6.3); g.fill(); g.restore(); };
  const fries = (x, y, s) => { g.fillStyle = '#f2c94c'; for (let k = 0; k < 9; k++) g.fillRect(x - s * 0.5 + k * s * 0.12, y - s * (0.6 + R() * 0.4), s * 0.09, s); g.fillStyle = '#c8202e'; g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.1); g.lineTo(x + s * 0.6, y - s * 0.1); g.lineTo(x + s * 0.45, y + s * 0.7); g.lineTo(x - s * 0.45, y + s * 0.7); g.closePath(); g.fill(); };
  const biscuit = (x, y, s) => { g.fillStyle = '#d9a35a'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, 6.3); g.fill(); g.fillStyle = '#f0cf8e'; g.beginPath(); g.ellipse(x - s * 0.15, y - s * 0.2, s * 0.6, s * 0.3, 0, 0, 6.3); g.fill(); };
  const words = [['$5', 'FAVES', '2 PC MEAL'], ['$3', 'WRAPS', 'TRY ONE'], ['$20', 'FAMILY', '8 PC MEAL'], ['$3', 'CHEESE', 'BITES'], ['5', 'FOR $5', 'EVERY DAY']];
  for (let i = 0; i < n; i++) {
    const x0 = i * PW, w = words[i % words.length], orange = i % 2 === 0;
    g.fillStyle = orange ? '#f07c22' : '#fbf3e6'; g.fillRect(x0, 0, PW, PH);
    g.fillStyle = orange ? '#fbf3e6' : '#f07c22'; g.fillRect(x0, PH * 0.62, PW, PH * 0.38);
    for (let k = 0; k < 3; k++) drum(x0 + PW * (0.3 + k * 0.22), PH * (0.7 + (k % 2) * 0.08), PW * 0.13, R() * 0.8 - 0.4);
    if (i % 2) fries(x0 + PW * 0.78, PH * 0.74, PW * 0.18); else biscuit(x0 + PW * 0.8, PH * 0.82, PW * 0.12);
    g.fillStyle = orange ? '#ffffff' : '#e5531a'; g.strokeStyle = orange ? '#9a3a12' : '#ffffff'; g.lineWidth = 6;
    g.font = `900 ${Math.round(PH * 0.3)}px sans-serif`; g.textBaseline = 'top';
    g.strokeText(w[0], x0 + PW * 0.08, PH * 0.05); g.fillText(w[0], x0 + PW * 0.08, PH * 0.05);
    g.fillStyle = orange ? '#3a1a0a' : '#c8202e'; g.font = `800 ${Math.round(PH * 0.085)}px sans-serif`;
    g.fillText(w[1], x0 + PW * 0.1, PH * 0.38); g.font = `600 ${Math.round(PH * 0.05)}px sans-serif`; g.fillText(w[2], x0 + PW * 0.1, PH * 0.5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, 0, 3, PH); g.fillRect(x0 + PW - 3, 0, 3, PH);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function paintRoundel(px) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d'), c = px / 2;
  g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(c, c, c - 1, 0, 6.3); g.fill();
  g.fillStyle = '#e4532a'; g.beginPath(); g.arc(c, c, c * 0.9, 0, 6.3); g.fill();
  g.fillStyle = '#ffffff'; g.font = `900 ${Math.round(px * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', c, c * 1.04);
  g.font = `700 ${Math.round(px * 0.075)}px sans-serif`;
  const arc = (txt, r, a0, dir) => { const step = 0.115; for (let i = 0; i < txt.length; i++) { const a = a0 + dir * (i - (txt.length - 1) / 2) * step; g.save(); g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r); g.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2)); g.fillText(txt[i], 0, 0); g.restore(); } };
  arc('LOUISIANA', c * 0.72, -Math.PI / 2, 1); arc('KITCHEN', c * 0.72, Math.PI / 2, -1);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function popeyes(group, ctx, spec, frame) {
  const K = frame.kit;
  // the side wall over the cleared lot (spec.sideWall { mat, tint, h }): b64_s shows the party wall the demolition bared as grey concrete
  // block, not brick; a skin on the ring edge that meets the front at its u 0 end
  if (spec.sideWall) {
    const ring = frame.ring, n = ring.length, p0 = frame.p0;
    let k = 0, bd = 1e9;
    ring.forEach(([x, z], i) => { const d = Math.hypot(x - p0[0], z - p0[1]); if (d < bd) { bd = d; k = i; } });
    const eA = (k - 1 + n) % n, side = eA === frame.front ? k : eA, a = ring[side], b = ring[(side + 1) % n];
    const F2 = frame.face([a[0], a[1], b[0], b[1]]);
    if (F2 && F2.i !== frame.front) {
      const SW = spec.sideWall;
      F2.kit.box(F2.kit.mat(SW.mat || 'concrete_precast', { tint: SW.tint || '#a9a8a2', dirt: 0.55 }), 0.02, F2.L - 0.02, 0, SW.h || spec.h, 0.0, 0.04, { c: 0.008 });
    }
  }
  for (const A of spec.awnings || []) {
    const red = K.mat('metal_painted', { tint: A.color || '#b8262b', dirt: 0.25 });
    const yT = A.y + A.drop, yF = A.y + 0.15, P = A.proj;
    K.extrude(red, [[0, yT], [P, yF], [P, A.y], [P - 0.03, A.y], [P - 0.03, yF + 0.02], [0, yT - 0.05]], A.u0, A.u1);
    for (let u = A.u0 + 0.15; u < A.u1 - 0.1; u += 0.3) K.extrude(red, [[0, yT], [0, yT + 0.035], [P, yF + 0.035], [P, yF]], u - 0.012, u + 0.012, { near: true });
  }
  if (typeof document === 'undefined') return;
  const PS = spec.posters || [];
  if (PS.length) {
    const tex = paintPosters(PS.length, strHash(spec.id) + 7);
    const mat = muCalib(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0 }));
    PS.forEach((p, i) => {
      const geo = new THREE.PlaneGeometry(p.w, p.h), uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / PS.length);
      const m = new THREE.Mesh(geo, mat);
      m.applyMatrix4(frame.matrix(p.u + p.w / 2, p.y + p.h / 2, p.upper ? -0.16 : -0.28));
      m.castShadow = false; m.name = 'fk_poster';
      K.add(m);
    });
  }
  const Rd = spec.roundel;
  if (Rd) {
    const tex = paintRoundel(256);
    const face = muCalib(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0 }));
    const rim = K.mat('metal_painted', { tint: '#e9e6df' });
    const r = Rd.d / 2, wc = Rd.proj + r;
    // the disc stands across the wall (its faces look along the street), on a bracket from the wall
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 40), face);
      m.applyMatrix4(frame.matrix(Rd.u + s * 0.055, Rd.y + r, wc).multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2)));
      m.name = 'fk_roundel'; K.add(m);
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 40, 1, true), rim);
    ring.applyMatrix4(frame.matrix(Rd.u, Rd.y + r, wc).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
    K.add(ring);
    K.box(K.mat('steel_black'), Rd.u - 0.03, Rd.u + 0.03, Rd.y + r * 1.6, Rd.y + r * 1.6 + 0.06, 0, Rd.proj + r * 0.4, { near: true, c: 0.004 });
  }
  void group; void ctx;
}

// A tower block on a podium (159 E 125th): spec.tower = { u0, u1, w0, w1, h, floors, tint } in the front face's frame (w0 the tower's
// front face, behind the podium front; w1 its rear face), h the tower's top over the sidewalk, windows in a bay grid on the front.
// The podium itself is the kit's.
export function podiumTower(group, ctx, spec, frame) {
  const T = spec.tower;
  if (!T) return;
  const K = frame.kit;
  const y0 = spec.h, y1 = T.h, nF = T.floors || 7, fh = (y1 - y0) / nF;
  const wall = K.mat('panel_alu', { tint: T.tint || '#2b3034', dirt: 0.25 });
  const frm = K.mat('alu_black');
  const glass = K.mat('glass_blue');
  K.box(wall, T.u0, T.u1, y0, y1, T.w1, T.w0, { c: 0.02 });
  K.box(K.mat('metal_painted', { tint: '#1e2124' }), T.u0 - 0.15, T.u1 + 0.15, y1, y1 + 0.35, T.w1 - 0.15, T.w0 + 0.15, { c: 0.02 });
  // the window grid on every face (QA Q37, w2r2/qd_park: the sides and the back were blank dark walls ~21 m tall; their grids follow the
  // front's rhythm, not measured): a face at `at` on axis 'w' (front, back) or 'u' (the ends), spanning [a0, a1], facing s = +-1
  const grid = (axis, at, a0, a1, s, full = false) => {
    const nb = Math.max(2, Math.round((a1 - a0) / 3.0)), bw = (a1 - a0) / nb, o = at + s * 0.02;
    const fb = (p0, p1, q0, q1) => (axis === 'w' ? K.box(frm, p0, p1, q0, q1, Math.min(o - 0.06 * s, o + 0.05 * s), Math.max(o - 0.06 * s, o + 0.05 * s), { near: true, c: 0.004 })
      : K.box(frm, Math.min(o - 0.06 * s, o + 0.05 * s), Math.max(o - 0.06 * s, o + 0.05 * s), q0, q1, p0, p1, { near: true, c: 0.004 }));
    const P = (p, y) => (axis === 'w' ? [p, y, o] : [o, y, p]), nrm = axis === 'w' ? [0, 0, s] : [s, 0, 0];
    for (let f = 0; f < nF; f++) {
      const ya = y0 + f * fh + 0.55, yb = y0 + (f + 1) * fh - 0.45;
      for (let b = 0; b < nb; b++) {
        const pa = a0 + b * bw + 0.3, pb = a0 + (b + 1) * bw - 0.3;
        fb(pa, pb, ya, ya + 0.08); fb(pa, pb, yb - 0.08, yb);
        if (full) { fb(pa, pa + 0.08, ya, yb); fb(pb - 0.08, pb, ya, yb); fb((pa + pb) / 2 - 0.04, (pa + pb) / 2 + 0.04, ya, yb); }
        K.poly(glass, [P(pa + 0.08, ya + 0.08), P(pb - 0.08, ya + 0.08), P(pb - 0.08, yb - 0.08), P(pa + 0.08, yb - 0.08)], nrm, { near: false, shadow: false });
      }
    }
  };
  grid('w', T.w0, T.u0, T.u1, 1, true);   // the street front in full; the ends and the back with the head and sill bars only
  grid('w', T.w1, T.u0, T.u1, -1);
  grid('u', T.u0, T.w1, T.w0, -1);
  grid('u', T.u1, T.w1, T.w0, 1);
}

// ================================================================== 81 E 125th St: the Mount Morris Bank Building (1884, Queen Anne / Romanesque Revival)
// The kit draws the walls, the windows and the cornice from the spec (specs/east.js 'e125-81'); this adds what the kit cannot: the two
// canted three-storey oriels on the front, the round entrance arch, the slate mansard with its dormers and the chimney stacks.
let SLATE = null;
function slateMat() {
  if (SLATE) return SLATE;
  const tex = (() => {
    if (typeof document === 'undefined') return null;
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    // fish-scale slate in horizontal bands of blue-grey and green-grey, 1.2 m repeat (rows 0.15 m, scales 0.2 m)
    const rows = 8, rh = S / rows, sw = S / 6;
    // grey-green slate as sampled on the 2026-08 elevation (#63625c lit), lighter than the paint so the steep face reads grey, not navy
    const bands = ['#767873', '#7f817b', '#6f7471', '#868882', '#737771', '#7b807a', '#80827e', '#6c706d'];
    g.fillStyle = '#5e625f'; g.fillRect(0, 0, S, S);
    for (let r = rows - 1; r >= 0; r--) {
      const off = (r % 2) * (sw / 2);
      for (let c = -1; c <= 6; c++) {
        const x = c * sw + off, y = r * rh;
        g.fillStyle = bands[(r * 3 + (c & 1)) % bands.length];
        g.beginPath(); g.moveTo(x - sw / 2, y); g.lineTo(x + sw / 2, y); g.lineTo(x + sw / 2, y + rh * 0.55); g.arc(x, y + rh * 0.55, sw / 2, 0, Math.PI, false); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(15,20,25,0.55)'; g.lineWidth = 2; g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 1.2, 1 / 1.2);
    t.anisotropy = 4;
    return t;
  })();
  SLATE = applyCityAO(applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex || null, roughness: 0.62, metalness: 0.08 })));
  SLATE.shadowSide = THREE.DoubleSide;
  return SLATE;
}

// a half ring of stone blocks (an arch), from angle a0 to a1 (0 = +u side), front face at w1, back at w0
function arcRing(K, mat, uc, yc, rIn, rOut, w0, w1, n = 16, a0 = 0, a1 = Math.PI) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n, tm = (t0 + t1) / 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const P = (r, c, s, w) => [uc + r * c, yc + r * s, w];
    K.poly(mat, [P(rIn, c0, s0, w1), P(rOut, c0, s0, w1), P(rOut, c1, s1, w1), P(rIn, c1, s1, w1)], [0, 0, 1], { near: i % 2 === 0 });
    K.poly(mat, [P(rIn, c0, s0, w0), P(rIn, c0, s0, w1), P(rIn, c1, s1, w1), P(rIn, c1, s1, w0)], [-Math.cos(tm), -Math.sin(tm), 0]);
    K.poly(mat, [P(rOut, c0, s0, w0), P(rOut, c1, s1, w0), P(rOut, c1, s1, w1), P(rOut, c0, s0, w1)], [Math.cos(tm), Math.sin(tm), 0]);
  }
}

// a facet from plan point A to B (u, w), vertical from y0 to y1: panels round one window, a frame, glass; mats.panel, mats.frame, mats.glass
function facetWindow(K, mats, A, B, y0, y1, win) {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]), du = (B[0] - A[0]) / len, dw = (B[1] - A[1]) / len, nu = -dw, nw = du;
  const at = (s, y, off = 0) => [A[0] + du * s + nu * off, y, A[1] + dw * s + nw * off];
  const quad = (m, s0, s1, ya, yb, off = 0, o = {}) => K.poly(m, [at(s0, ya, off), at(s1, ya, off), at(s1, yb, off), at(s0, yb, off)], [nu, 0, nw], o);
  const { s0, s1, ya, yb } = win;
  quad(mats.panel, 0, s0, y0, y1); quad(mats.panel, s1, len, y0, y1);
  quad(mats.panel, s0, s1, y0, ya); quad(mats.panel, s0, s1, yb, y1);
  const fw = 0.07;
  quad(mats.frame, s0, s1, ya, ya + fw, 0.02, { near: true }); quad(mats.frame, s0, s1, yb - fw, yb, 0.02, { near: true });
  quad(mats.frame, s0, s0 + fw, ya, yb, 0.02, { near: true }); quad(mats.frame, s1 - fw, s1, ya, yb, 0.02, { near: true });
  const sm = (s0 + s1) / 2;
  quad(mats.frame, sm - 0.03, sm + 0.03, ya, yb, 0.02, { near: true });
  quad(mats.frame, s0, s1, (ya + yb) / 2 + 0.25, (ya + yb) / 2 + 0.3, 0.02, { near: true });
  quad(mats.glass, s0 + fw, s1 - fw, ya + fw, yb - fw, -0.08, { shadow: false });
}

// one canted oriel: plan points (uc - hw - cw, 0) (uc - hw, P) (uc + hw, P) (uc + hw + cw, 0) (cw: the canted sides' run along the
// wall, P: the projection), floors from y0, nF floors of height fh; each facet one opening (a pair on the front: a centre mullion)
function oriel(K, mats, uc, y0, nF, fh, o = {}) {
  const hw = o.hw ?? 1.15, P = o.P ?? 0.85, cw = o.cw ?? P, sill = o.sill ?? 0.8, top = o.top ?? 0.5;
  const pts = [[uc - hw - cw, 0.0], [uc - hw, P], [uc + hw, P], [uc + hw + cw, 0.0]];
  const y1 = y0 + nF * fh;
  for (let f = 0; f < nF; f++) {
    const ya = y0 + f * fh, yb = ya + fh;
    for (let k = 0; k < 3; k++) {
      const A = pts[k], B = pts[k + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const m = k === 1 ? 0.3 : Math.min(0.16, len * 0.2);
      facetWindow(K, mats, A, B, ya, yb, { s0: m, s1: len - m, ya: ya + sill, yb: yb - top });
    }
    // the moulded band of the panelling at each floor line
    if (f > 0) K.box(mats.panel, uc - hw - cw - 0.03, uc + hw + cw + 0.03, ya - 0.07, ya + 0.09, -0.02, P + 0.05, { near: true, c: 0.01 });
  }
  if (o.corbel !== false) {
    // the corbelled underside
    K.poly(mats.panel, [[pts[0][0], y0, 0], [pts[1][0], y0, pts[1][1]], [pts[2][0], y0, pts[2][1]], [pts[3][0], y0, 0]], [0, -1, 0]);
    for (let s = 0; s < 3; s++) {
      const h = 0.12 + s * 0.12, w = 0.3 - s * 0.1;
      K.box(mats.panel, uc - hw - cw * (1 - s * 0.25), uc + hw + cw * (1 - s * 0.25), y0 - h * (s + 1), y0 - h * s, 0, P + w * 0.3, { near: true, c: 0.01 });
    }
  }
  if (o.cap !== false) {
    K.box(mats.cornice, uc - hw - cw - 0.12, uc + hw + cw + 0.12, y1, y1 + 0.18, -0.05, P + 0.22, { c: 0.012 });
    K.box(mats.cornice, uc - hw - cw - 0.2, uc + hw + cw + 0.2, y1 + 0.18, y1 + 0.42, -0.05, P + 0.32, { c: 0.012 });
    K.poly(mats.cornice, [[pts[0][0] - 0.2, y1 + 0.42, -0.05], [pts[0][0] - 0.2, y1 + 0.42, P + 0.32], [pts[3][0] + 0.2, y1 + 0.42, P + 0.32], [pts[3][0] + 0.2, y1 + 0.42, -0.05]], [0, 1, 0]);
  }
}

// a window in the slate of the mansard: a zinc-grey surround standing proud of the slate face (wFace at its sill), the glass, sash bars,
// a hood; `arch` = a round head over the opening (the upper row)
function mansardWindow(K, mats, uc, hw, ya, yb, wFace, arch) {
  const wf = wFace + 0.2, top = yb + (arch ? hw : 0);
  K.box(mats.panel, uc - hw - 0.15, uc + hw + 0.15, ya - 0.14, top + 0.12, wFace - 0.6, wf, { c: 0.015 });
  K.poly(mats.glass, [[uc - hw, ya, wf + 0.004], [uc + hw, ya, wf + 0.004], [uc + hw, yb, wf + 0.004], [uc - hw, yb, wf + 0.004]], [0, 0, 1], { shadow: false });
  if (arch) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push([uc + Math.cos(a) * hw, yb + Math.sin(a) * hw, wf + 0.004]); }
    K.poly(mats.glass, pts, [0, 0, 1], { shadow: false });
  }
  K.box(mats.frame, uc - 0.022, uc + 0.022, ya, yb, wf, wf + 0.03, { near: true, c: 0 });
  K.box(mats.frame, uc - hw, uc + hw, (ya + yb) / 2 - 0.022, (ya + yb) / 2 + 0.022, wf, wf + 0.03, { near: true, c: 0 });
  K.box(mats.cornice, uc - hw - 0.24, uc + hw + 0.24, top + 0.12, top + 0.27, wFace - 0.6, wf + 0.12, { c: 0.01 });
  K.box(mats.panel, uc - hw - 0.2, uc + hw + 0.2, ya - 0.22, ya - 0.1, wFace - 0.6, wf + 0.08, { near: true, c: 0.008 });
}

// a round-headed window over a rectangular one: the stone ring (voussoirs), a keystone, the dark glass half-disc with a fan of muntins; uc the
// centre, hw the half width of the glass, yb the head of the rectangular part, rr the ring's width
function archHead(K, mats, uc, hw, yb, rr = 0.26, w1 = 0.1) {
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([uc + Math.cos(a) * hw, yb + Math.sin(a) * hw, 0.02]); }
  K.poly(mats.glass, pts, [0, 0, 1], { shadow: false });
  for (let i = 1; i < n; i += 2) { const a = (i / n) * Math.PI; K.box(mats.frame, uc + Math.cos(a) * hw * 0.5 - 0.012, uc + Math.cos(a) * hw * 0.5 + 0.012, yb + Math.sin(a) * hw * 0.5 - 0.0, yb + Math.sin(a) * hw, 0.02, 0.05, { near: true, c: 0 }); }
  arcRing(K, mats.stone, uc, yb, hw, hw + rr, -0.02, w1, 14);
  K.box(mats.stone, uc - 0.16, uc + 0.16, yb + hw - 0.02, yb + hw + rr + 0.16, -0.02, w1 + 0.04, { c: 0.015 });
}

// Positions and heights measured on the rectified 2026-08 elevation of the 125th Street front (boundlessjs/shots/ar34/east/elev/
// n_81e_DQf2.jpg, 26 px/m, u from the west end): base to 3.4 m, the four second-floor arches centred at u 9.04 / 12.27 / 15.5 / 18.73
// (1.6 m wide, heads 6.35 m), the oriels centred at u 7.58 and 20.4 (4.85 m across, a 3.7 m front facet) from 7.6 m to the cornice
// (19.0-19.8 m), the oriels' top stage over the cornice to 21.4 m under a pedimented hood (to 22.9 m), the slate mansard from 19.8 m to
// 25.5 m (near vertical), arched dormers at 22.0-24.0 m, six brick stacks (u 1.0-3.0, 5.4-6.4, 9.6-10.65, 17.9-18.5, 22.1-22.7,
// 25.65-26.7) to 27.1 m. Colours sampled there: brick #a46f5e lit / #8a5641 shaded, brownstone #856e5f / #5a4c3f, slate #63625c,
// oriel paint #817a79-#8e9090, cornice #383738, stacks #7c4b3e.
export function mountMorris(group, ctx, spec, frame) {
  const K = frame.kit, H = spec.h;
  const mats = {
    stone: K.mat('brownstone', { tint: '#78604f', dirt: 0.45 }),
    panel: K.mat('plain', { tint: '#86857f' }),
    cornice: K.mat('plain', { tint: '#4a4845' }),
    frame: K.mat('plain', { tint: '#d6d4cc' }),     // the oriels' and fanlights' sashes are painted light
    glass: K.mat('plain', { tint: '#26292c', rough: 0.15 }),
    brick: K.mat('brick_red', { tint: '#a1867e', dirt: 0.5 }),   // the stacks: moved with the wall's tint (spec e125-81, session 2)
    slate: slateMat(),
    lead: K.mat('metal_painted', { tint: '#4c5258' }),
  };
  // ---- the second floor: four round-arched windows (3.55-5.55 m, the arch above), terracotta roundels between
  const T = { w: 1.6, h: 2.0, sill: 0.25, kind: 'fixed', frame: 'alu_black', reveal: 0.2, lights: '3/3', mullions: 1, lintel: null, sillStone: { mat: 'brownstone', tint: '#7a6152', h: 0.14, proj: 0.08 }, ac: 0, blinds: 0.2 };
  const AR = [9.04, 12.27, 15.5, 18.73];
  // (AR34 w2 b3) the arched windows themselves are the spec's floor-2 openings (type B); this keeps the roundels between them
  void T; void archHead;
  AR.forEach((uc, k) => {
    if (k < 3) {   // a terracotta roundel between the arches
      const um = (uc + AR[k + 1]) / 2;
      K.box(mats.stone, um - 0.3, um + 0.3, 6.85, 7.45, 0, 0.05, { near: true, c: 0.02 });
    }
  });
  // ---- the canted oriels (floors 3-5, 7.6-19.0 m), their top stage over the main cornice and the pedimented hoods
  const OR = [7.58, 20.4], OP = { hw: 1.85, P: 0.85, cw: 0.6 };
  for (const uc of OR) {
    oriel(K, mats, uc, 7.6, 3, 3.8, { ...OP, sill: 1.35, top: 0.5, cap: false });
    // the main cornice wrapped round the oriel
    K.box(mats.cornice, uc - OP.hw - OP.cw - 0.3, uc + OP.hw + OP.cw + 0.3, H - 0.8, H, 0.4, OP.P + 0.55, { c: 0.015 });
    oriel(K, mats, uc, H, 1, 1.6, { ...OP, sill: 0.2, top: 0.3, corbel: false, cap: false });
    const ua = uc - OP.hw - OP.cw - 0.35, ub = uc + OP.hw + OP.cw + 0.35;
    K.box(mats.cornice, ua + 0.1, ub - 0.1, H + 1.6, H + 1.78, -0.6, OP.P + 0.2, { c: 0.01 });
    K.box(mats.panel, ua + 0.2, ub - 0.2, H + 1.78, H + 2.85, -0.6, OP.P + 0.02, { c: 0.012 });
    K.box(mats.cornice, ua, ub, H + 2.85, H + 3.12, -0.6, OP.P + 0.3, { c: 0.012 });
    // a pediment over the hood
    K.poly(mats.cornice, [[ua + 0.4, H + 3.12, OP.P + 0.05], [ub - 0.4, H + 3.12, OP.P + 0.05], [uc, H + 3.75, OP.P + 0.05]], [0, 0, 1]);
  }
  // ---- the Park Avenue arch (u 23.85) over the entrance, a small arched doorway at the west end (u 3.15)
  arcRing(K, mats.stone, 23.85, 4.6, 2.45, 3.1, -0.05, 0.26, 20);
  K.box(mats.stone, 21.4, 22.0, 0, 4.6, -0.05, 0.26, { c: 0.02 });
  K.box(mats.stone, 25.7, 26.3, 0, 4.6, -0.05, 0.26, { c: 0.02 });
  K.box(mats.stone, 23.55, 24.15, 7.05, 7.85, -0.05, 0.34, { c: 0.02 });       // the keystone
  {   // the fanlight between the door's transom and the arch
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; pts.push([23.85 + Math.cos(a) * 2.42, 4.6 + Math.sin(a) * 2.42, 0.012]); }
    K.poly(mats.glass, pts, [0, 0, 1], { shadow: false });
    K.box(mats.frame, 23.82, 23.88, 3.5, 7.0, 0.01, 0.05, { near: true, c: 0 });
    K.box(mats.frame, 21.45, 26.25, 4.55, 4.65, 0.01, 0.05, { near: true, c: 0 });
  }
  arcRing(K, mats.stone, 3.15, 2.5, 0.75, 1.05, -0.05, 0.16, 10);
  // ---- the mansard: a near-vertical slate face from the cornice to 25.5 m (0.7 m in), a flat lead top, on the lot's rectangle (27.5 x 15.3 m)
  const yT = 25.5, inF = 0.7;
  const u0 = 0.05, u1 = 27.6, wF = -0.35, wR = -15.3;
  const r0 = { u0, u1, wf: wF, wr: wR, y: H }, r1 = { u0: u0 + inF, u1: u1 - inF, wf: wF - inF, wr: wR + inF, y: yT };
  const side = (a, b, n) => {
    K.poly(mats.slate, [[a.u0, a.y, a.wf], [a.u1, a.y, a.wf], [b.u1, b.y, b.wf], [b.u0, b.y, b.wf]], n[0]);
    K.poly(mats.slate, [[a.u1, a.y, a.wf], [a.u1, a.y, a.wr], [b.u1, b.y, b.wr], [b.u1, b.y, b.wf]], n[1]);
    K.poly(mats.slate, [[a.u1, a.y, a.wr], [a.u0, a.y, a.wr], [b.u0, b.y, b.wr], [b.u1, b.y, b.wr]], n[2]);
    K.poly(mats.slate, [[a.u0, a.y, a.wr], [a.u0, a.y, a.wf], [b.u0, b.y, b.wf], [b.u0, b.y, b.wr]], n[3]);
  };
  const s = inF / (yT - H);
  side(r0, r1, [[0, s, 1], [1, s, 0], [0, s, -1], [-1, s, 0]]);
  K.poly(mats.lead, [[r1.u0, yT, r1.wf], [r1.u1, yT, r1.wf], [r1.u1, yT, r1.wr], [r1.u0, yT, r1.wr]], [0, 1, 0]);
  K.box(mats.cornice, r1.u0 - 0.08, r1.u1 + 0.08, yT - 0.12, yT + 0.08, r1.wf - 0.05, r1.wf + 0.1, { near: true, c: 0.01 });   // the crest rail
  const wAt = (y) => wF - inF * (y - H) / (yT - H);
  // the lower row (rectangular, just over the cornice) and the upper row (arched dormers), front face; the oriels' columns skip the lower row
  for (const [ua, ub] of [[2.95, 4.15], [11.75, 12.6], [13.45, 14.5], [15.8, 16.8], [23.9, 24.95]]) mansardWindow(K, mats, (ua + ub) / 2, (ub - ua) / 2 - 0.05, H + 0.35, H + 1.35, wAt(H + 0.35), false);
  for (const [ua, ub] of [[3.45, 4.55], [7.15, 8.45], [11.6, 12.6], [13.8, 14.8], [16.0, 17.0], [19.6, 20.9], [23.9, 24.95]]) mansardWindow(K, mats, (ua + ub) / 2, (ub - ua) / 2 - 0.05, H + 2.35, H + 3.6, wAt(H + 2.35), true);
  // ---- six brick stacks in the plane of the front wall, rising through the mansard (stone caps, iron pots)
  for (const [ua, ub] of [[1.0, 2.6], [5.35, 6.35], [9.6, 10.6], [17.85, 18.6], [22.05, 22.8], [25.65, 26.7]]) {
    const y1 = 27.1;
    K.box(mats.brick, ua, ub, H - 0.5, y1, -1.25, 0.04, { c: 0.02 });
    K.box(mats.stone, ua - 0.1, ub + 0.1, y1, y1 + 0.2, -1.35, 0.14, { c: 0.02 });
    K.box(K.mat('steel_black'), ua + 0.15, ub - 0.15, y1 + 0.2, y1 + 0.4, -1.0, -0.2, { c: 0.01, near: true });
  }
  void group; void ctx;
}

// ================================================================== 35 E 125th St: the one-storey glazed west wing of the Harlem Children's Zone school
// The spec's ring is the school block; the compiled lot's west part (u -29.9..0 of the front frame, 1.3 m behind the block's front except
// the middle run u -25.95..-6.47, which stands on the front line) is this wing: 6.0 m high, a membrane roof.
export function hczWing(group, ctx, spec, frame) {
  const K = frame.kit, H = 6.0;
  const wall = K.mat('panel_grey', { tint: '#5c6064', dirt: 0.35 });
  const plinth = K.mat('brick_brown', { tint: '#5f574d', dirt: 0.5 });
  const fascia = K.mat('plain', { tint: '#6c7074' });
  const frm = K.mat('alu_clear');
  const glass = K.mat('glass_storefront');
  const roof = K.mat('plain', { tint: '#3d3e3f' });
  K.box(wall, -29.88, -0.05, 0, H, -30.25, -1.28, { c: 0.02 });
  K.box(wall, -25.95, -6.47, 0, H, -1.28, 0.0, { c: 0.02 });
  K.box(roof, -29.8, -0.1, H, H + 0.04, -30.2, -1.36, { c: 0 });
  K.box(roof, -25.9, -6.52, H, H + 0.04, -1.36, -0.05, { c: 0 });
  // the street walls: plinth, glass between mullions at 1.5 m, a transom bar, the fascia and its coping
  for (const [ua, ub, w] of [[-29.85, -25.95, -1.28], [-25.95, -6.47, 0.0], [-6.47, -0.05, -1.28]]) {
    K.box(plinth, ua, ub, 0, 0.45, w - 0.05, w + 0.04, { c: 0.01 });
    K.box(fascia, ua, ub, 5.0, H, w - 0.05, w + 0.06, { c: 0.01 });
    K.box(fascia, ua - 0.02, ub + 0.02, H - 0.06, H + 0.08, w - 0.1, w + 0.1, { c: 0.008, near: true });
    K.poly(glass, [[ua, 0.45, w + 0.01], [ub, 0.45, w + 0.01], [ub, 5.0, w + 0.01], [ua, 5.0, w + 0.01]], [0, 0, 1], { shadow: false });
    const n = Math.max(1, Math.round((ub - ua) / 1.5));
    for (let i = 0; i <= n; i++) { const u = ua + ((ub - ua) * i) / n; K.box(frm, u - 0.04, u + 0.04, 0.45, 5.0, w + 0.01, w + 0.09, { near: true, c: 0.004 }); }
    K.box(frm, ua, ub, 3.55, 3.63, w + 0.01, w + 0.09, { near: true, c: 0.004 });
    K.box(frm, ua, ub, 0.45, 0.53, w + 0.01, w + 0.09, { near: true, c: 0.004 });
  }
  // the school's entrance canopy at the east end (elevation: u 38.2-50.75 of the block's front, 4.4-5.0 m, past the corner), a flat slab in
  // the maroon of its sign band with a light soffit and a round column at the outer corner; the lettering is the spec's sign item
  const maroon = K.mat('plain', { tint: '#7c2d34' });
  K.box(maroon, 38.2, 50.75, 4.4, 5.0, 0.0, 3.0, { c: 0.01 });
  K.box(K.mat('plain', { tint: '#d9d6cf' }), 38.3, 50.65, 4.36, 4.41, 0.05, 2.95, { near: true, c: 0 });
  K.box(K.mat('metal_painted', { tint: '#c9c7c0' }), 49.8, 50.2, 0, 4.4, 2.35, 2.75, { c: 0.05 });
  void group; void ctx;
}

// ================================================================== 17 E 125th St: the closed gate painted as a mural
// The shop's roll-down gate is down across the whole front and painted: a sunset over a brick wall with a pair of white wings in the
// middle (invented composition in the real piece's palette; nothing traced). Drawn as the curtain itself: a housing box, the guides and the
// painted slats on the face's base bay (spec bay kind 'wall', u0..u1 from spec.gateMural).
function paintWings(pw, ph, seed) {
  const R = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = pw; cv.height = ph;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, '#2c2f4d'); sky.addColorStop(0.28, '#7d2c3c'); sky.addColorStop(0.5, '#de5a2c'); sky.addColorStop(0.62, '#f4b545'); sky.addColorStop(0.7, '#a8432c'); sky.addColorStop(1, '#5a2a24');
  g.fillStyle = sky; g.fillRect(0, 0, pw, ph);
  // dark cloud bands
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(40,30,50,${0.25 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * pw, ph * (0.08 + R() * 0.3), pw * (0.1 + R() * 0.2), ph * (0.02 + R() * 0.03), 0, 0, Math.PI * 2); g.fill(); }
  // the sun on the horizon
  g.fillStyle = '#fbe08a'; g.beginPath(); g.arc(pw * 0.5, ph * 0.6, ph * 0.09, Math.PI, 0); g.fill();
  // a brick wall across the lower part, the paint thinner over it
  const bh = ph * 0.035, bw = bh * 2.4, top = ph * 0.64;
  for (let r = 0; top + r * bh < ph; r++) {
    for (let c = -1; c * bw < pw; c++) {
      const x = c * bw + (r % 2) * bw * 0.5, y = top + r * bh;
      g.fillStyle = `rgba(${110 + R() * 40},${40 + R() * 20},${30 + R() * 15},0.85)`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // the wings: two fans of feathers from the middle, primaries long and outermost
  const cx = pw * 0.5, cy = ph * 0.52, span = Math.min(pw * 0.36, ph * 0.9);
  for (const s of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const n = 9 - row, len = span * (1 - row * 0.2), base = cy - row * ph * 0.035;
      for (let k = 0; k < n; k++) {
        const a = (-0.05 + (k / (n - 1)) * 1.15) * (Math.PI / 2), fl = len * (0.55 + 0.45 * (1 - k / n));
        const ex = cx + s * Math.cos(a) * fl * 0.95, ey = base - Math.sin(a) * fl * 0.62;
        g.fillStyle = row === 0 ? '#f4f2ee' : '#e8e6e2'; g.strokeStyle = 'rgba(90,90,100,0.6)'; g.lineWidth = Math.max(1, pw / 700);
        g.beginPath(); g.moveTo(cx + s * ph * 0.02, base);
        g.quadraticCurveTo((cx + ex) / 2 + s * fl * 0.08, (base + ey) / 2 + fl * 0.12, ex, ey);
        g.quadraticCurveTo((cx + ex) / 2 - s * fl * 0.02, (base + ey) / 2 + fl * 0.02, cx + s * ph * 0.02, base + ph * 0.02);
        g.fill(); g.stroke();
      }
    }
  }
  // slat lines, scuffs and a few tags low down
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < ph; y += Math.max(3, ph / 40)) g.fillRect(0, y, pw, 1);
  g.strokeStyle = 'rgba(15,15,15,0.55)'; g.lineWidth = Math.max(2, pw / 500);
  for (let i = 0; i < 4; i++) { const x = R() * pw * 0.9, y = ph * (0.82 + R() * 0.12); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 25, x + 40, y + 15, x + 70, y - 8); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export function wingsGate(group, ctx, spec, frame) {
  const K = frame.kit, M = spec.gateMural || { u0: 0.4, u1: 8.8, h: 3.4 };
  const steel = K.mat('metal_painted', { tint: '#5d5f61', dirt: 0.4 });
  K.box(steel, M.u0 - 0.1, M.u1 + 0.1, M.h, M.h + 0.38, -0.05, 0.16, { c: 0.01 });          // the curtain's housing
  K.box(steel, M.u0 - 0.1, M.u0, 0, M.h, -0.05, 0.08, { c: 0.005, near: true });           // the guides
  K.box(steel, M.u1, M.u1 + 0.1, 0, M.h, -0.05, 0.08, { c: 0.005, near: true });
  const L = M.u1 - M.u0;
  const tex = (typeof document !== 'undefined') ? paintWings(Math.round(Math.min(2048, L * 160)), Math.round(M.h * 160), strHash(spec.id)) : null;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : 0x8a5a48, roughness: 0.55, metalness: 0.15 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L, M.h - 0.04), mat);
  m.applyMatrix4(frame.matrix(M.u0 + L / 2, 0.02 + (M.h - 0.04) / 2, 0.03));
  m.receiveShadow = true;
  m.name = 'fk_gate_mural';
  frame.kit.add(m);
  void group; void ctx;
}

// ================================================================== painted roll-down gates (AR34 w2 b3): the kit's closed curtain carries a
// figurative piece painted by the mural painters (MU_PANELS), slat lines through the paint. spec.gateArt: [{ u0, u1, y0, y1, plan:
// [[panel, width m], ...], seed }] in the front face's frame, laid 2 cm in front of the kit's curtain (w 0.03).
export function gateArt(group, ctx, spec, frame) {
  if (typeof document === 'undefined') return;
  for (const A of spec.gateArt || []) {
    const L = A.u1 - A.u0, H = A.y1 - A.y0;
    // in front of the kit's curtain (0.03) and its graffiti decal (0.034, drawn with a polygon offset): out at 0.05 with a stronger offset
    const mat = muMaterial([L, H, 0, A.plan, A.seed ?? strHash(spec.id), 150, { slats: 0.075 }], { nScale: 0.7, roughness: 0.55, metalness: 0.2, extra: { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L, H), mat);
    m.applyMatrix4(frame.matrix(A.u0 + L / 2, A.y0 + H / 2, 0.05));
    m.receiveShadow = true; m.castShadow = false; m.name = 'fk_gate_art';
    frame.kit.add(m);
  }
  void group; void ctx;
}

// ================================================================== 2 E 125th St (Fifth Avenue NE corner): the corner loggia and the tower
// Rectified 2026-08 elevation boundlessjs/shots/ar34/east/elev/n_2e_yrk0.jpg (26 px/m, u from the Fifth Avenue corner): a pink brick
// frame to 22.8 m; at the corner (u 0.7-6.1) the second storey's block stops at 11.6 m and an open loggia runs to 20.8 m under the frame's
// top beam (the sky shows through it), a steel railing at 12.2 m; the tower over the podium (u 5.2-23.6) in a grid of tall windows.
// The spec's ring leaves a 6.4 x 6.4 m notch at the corner (the kit builds the rest); this draws the corner block under the loggia, the
// frame (corner pier, top beam on both streets), the railing and the tower. u here = the front face's u (0 at the notch, -6.4 at the
// corner); spec.tower = { u0, u1, w0, w1, h, floors, tint } in that frame.
export function twoEast(group, ctx, spec, frame) {
  const K = frame.kit, N = 6.4, T = spec.tower;
  const brick = K.mat('brick_red', { tint: spec.wall?.tint || '#a08674', dirt: 0.3 });
  const band = K.mat('stone_lime', { tint: '#c7aa9c', dirt: 0.3 });
  const steel = K.mat('steel_black');
  const glass = K.mat('glass_storefront');
  const frm = K.mat('alu_bronze');
  // the corner block under the loggia (0-11.6 m): brick, a glazed shop on both streets, two tall windows on 125th
  K.box(brick, -N, 0, 0, 11.6, -N, 0, { c: 0.012 });
  K.poly(glass, [[-N + 0.73, 0.3, 0.012], [-0.3, 0.3, 0.012], [-0.3, 4.6, 0.012], [-N + 0.73, 4.6, 0.012]], [0, 0, 1], { shadow: false });
  for (const u of [-N + 0.73, -N + 2.6, -N + 4.4, -0.3]) K.box(frm, u - 0.05, u + 0.05, 0.3, 4.6, 0.0, 0.08, { near: true, c: 0.004 });
  K.box(frm, -N + 0.73, -0.3, 4.55, 4.65, 0.0, 0.08, { near: true, c: 0.004 });
  K.box(band, -N, 0, 5.0, 5.5, 0.0, 0.12, { c: 0.01 });
  for (const [ua, ub] of [[0.7, 2.8], [4.0, 6.1]]) {
    const a = -N + ua, b = -N + Math.min(ub, N - 0.25);
    K.poly(glass, [[a, 5.85, 0.012], [b, 5.85, 0.012], [b, 10.1, 0.012], [a, 10.1, 0.012]], [0, 0, 1], { shadow: false });
    K.box(frm, a - 0.06, b + 0.06, 5.8, 5.88, 0.0, 0.09, { near: true, c: 0.004 }); K.box(frm, a - 0.06, b + 0.06, 10.07, 10.15, 0.0, 0.09, { near: true, c: 0.004 });
    K.box(frm, a - 0.06, a + 0.02, 5.8, 10.15, 0.0, 0.09, { near: true, c: 0.004 }); K.box(frm, b - 0.02, b + 0.06, 5.8, 10.15, 0.0, 0.09, { near: true, c: 0.004 });
    K.box(frm, (a + b) / 2 - 0.03, (a + b) / 2 + 0.03, 5.8, 10.15, 0.0, 0.09, { near: true, c: 0.004 });
  }
  // the Fifth Avenue side of the corner block (u = -N plane): shop glass and the band
  K.poly(glass, [[-N - 0.012, 0.3, -0.3], [-N - 0.012, 0.3, -N + 0.7], [-N - 0.012, 4.6, -N + 0.7], [-N - 0.012, 4.6, -0.3]], [-1, 0, 0], { shadow: false });
  K.box(band, -N - 0.12, -N, 5.0, 5.5, -N, 0, { c: 0.01 });
  K.box(band, -N - 0.1, 0.0, 11.0, 11.6, -N, 0.1, { c: 0.01 });                         // the loggia's floor edge
  // the frame: the corner pier and the top beam on both streets, the loggia's soffit
  K.box(brick, -N, -N + 0.9, 11.6, 22.8, -0.9, 0.0, { c: 0.012 });
  K.box(brick, -N, 0.0, 20.8, 22.8, -0.9, 0.0, { c: 0.012 });
  K.box(brick, -N, -N + 0.9, 20.8, 22.8, -N, -0.9, { c: 0.012 });
  K.box(band, -N, 0.0, 20.75, 20.85, -N, 0.0, { c: 0 });
  // the railing at 12.2 m along both open sides
  for (let u = -N + 1.0; u <= -0.1; u += 0.12) K.box(steel, u - 0.012, u + 0.012, 11.6, 12.2, -0.25, -0.22, { near: true, c: 0 });
  K.box(steel, -N + 0.9, 0.0, 12.15, 12.22, -0.27, -0.2, { near: true, c: 0 });
  for (let w = -N + 1.0; w <= -1.0; w += 0.12) K.box(steel, -N + 0.22, -N + 0.25, 11.6, 12.2, w - 0.012, w + 0.012, { near: true, c: 0 });
  K.box(steel, -N + 0.2, -N + 0.27, 12.15, 12.22, -N, -0.9, { near: true, c: 0 });
  // the tower over the podium
  if (T) {
    const y0 = spec.h, y1 = T.h, nF = T.floors, fh = (y1 - y0) / nF;
    const tw = K.mat('brick_red', { tint: T.tint || '#a08674', dirt: 0.25 });
    K.box(tw, T.u0, T.u1, y0, y1, T.w1, T.w0, { c: 0.02 });
    K.box(band, T.u0 - 0.1, T.u1 + 0.1, y1, y1 + 0.5, T.w1 - 0.1, T.w0 + 0.1, { c: 0.02 });
    for (const [ua, ub] of T.cols) {
      for (let f = 0; f < nF; f++) {
        const ya = y0 + f * fh + 0.35, yb = y0 + (f + 1) * fh - 0.35, w = T.w0 + 0.012;
        K.poly(K.mat('glass_grey'), [[ua, ya, w], [ub, ya, w], [ub, yb, w], [ua, yb, w]], [0, 0, 1], { shadow: false });
        K.box(frm, ua - 0.05, ub + 0.05, ya - 0.05, ya + 0.03, w - 0.02, w + 0.06, { near: true, c: 0.004 });
        K.box(frm, ua - 0.05, ub + 0.05, yb - 0.03, yb + 0.05, w - 0.02, w + 0.06, { near: true, c: 0.004 });
        K.box(frm, ua - 0.05, ua + 0.02, ya, yb, w - 0.02, w + 0.06, { near: true, c: 0.004 });
        K.box(frm, ub - 0.02, ub + 0.05, ya, yb, w - 0.02, w + 0.06, { near: true, c: 0.004 });
        K.box(frm, ua, ub, ya + (yb - ya) * 0.62, ya + (yb - ya) * 0.62 + 0.06, w - 0.02, w + 0.06, { near: true, c: 0.004 });
      }
    }
  }
  void group; void ctx;
}

// ================================================================== 2449 Second Ave: the BP station (two compiled footprints: the canopy 24.6 x 11 m, a 8 x 7 m kiosk behind it)
// spec.custom 'east:gasStation' (no kit faces). The canopy stands on two white steel columns over three pump islands; the kiosk holds the
// office and a repair bay. The BP mark (a green disc with a white-yellow-green flower) is drawn from scratch on the canopy band.
function bpMark(ctx2d, w, h) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2;
  const g = ctx2d;
  g.fillStyle = '#f4f7f2'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b8a3d'; g.beginPath(); g.arc(cx, cy, R * 0.94, 0, Math.PI * 2); g.fill();
  const rings = [[R * 0.78, '#f4f7f2'], [R * 0.66, '#0b8a3d'], [R * 0.52, '#f2d31b'], [R * 0.4, '#0b8a3d'], [R * 0.25, '#f4f7f2'], [R * 0.13, '#0b8a3d']];
  for (const [r, c] of rings) { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.72 : r; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); }
}
function markTexture(draw, pw, ph) {
  const cv = document.createElement('canvas');
  cv.width = pw; cv.height = ph;
  draw(cv.getContext('2d'), pw, ph);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function gasStation(group, ctx, spec, frame) {
  const K = frame.kit, L = frame.L;
  const depth = (() => { let d = 0; for (const [x, z] of frame.ring) d = Math.max(d, -((x - frame.p0[0]) * frame.n[0] + (z - frame.p0[1]) * frame.n[1])); return d; })();
  const white = K.mat('metal_painted', { tint: '#e8eae6', dirt: 0.25 });
  const green = K.mat('metal_painted', { tint: '#0a7d3a', dirt: 0.2 });
  const steel = K.mat('steel_black');
  const conc = K.mat('concrete_precast', { tint: '#8d8b85', dirt: 0.5 });
  const yellow = K.mat('metal_painted', { tint: '#d9ae1a' });
  const H0 = 4.6, H1 = 5.75;
  // the canopy: soffit panels, a deep fascia band (white, a green stripe), the roof edge
  K.box(white, 0, L, H0, H1 - 0.18, -depth, 0.0, { c: 0.03 });
  K.box(green, 0, L, H0 + 0.42, H0 + 0.78, -depth - 0.03, 0.03, { c: 0.01 });
  K.box(white, 0, L, H1 - 0.18, H1, -depth - 0.06, 0.06, { c: 0.02 });
  // soffit light panels
  const lamp = K.mat('alu_clear');
  for (let u = 2.0; u < L - 1.5; u += 3.4) for (let w = -2.0; w > -depth + 1.0; w -= 3.4) K.box(lamp, u - 0.6, u + 0.6, H0 - 0.05, H0, w - 0.3, w + 0.3, { c: 0.005, near: true });
  // columns
  for (const uc of [L * 0.27, L * 0.73]) {
    K.box(white, uc - 0.3, uc + 0.3, 0, H0, -depth * 0.55 - 0.3, -depth * 0.55 + 0.3, { c: 0.03 });
    K.box(conc, uc - 0.42, uc + 0.42, 0, 0.45, -depth * 0.55 - 0.42, -depth * 0.55 + 0.42, { c: 0.02 });
  }
  // pump islands: a raised concrete kerb, two pumps each, yellow bollards
  const pumpBody = K.mat('metal_painted', { tint: '#f1f2ee' }), pumpGreen = K.mat('metal_painted', { tint: '#0a7d3a' });
  for (const uc of [L * 0.14, L * 0.5, L * 0.86]) {
    K.box(conc, uc - 0.6, uc + 0.6, 0, 0.18, -depth + 1.6, -1.6, { c: 0.04 });
    for (const w of [-depth * 0.35, -depth * 0.7]) {
      K.box(pumpBody, uc - 0.3, uc + 0.3, 0.18, 1.85, w - 0.22, w + 0.22, { c: 0.03 });
      K.box(pumpGreen, uc - 0.31, uc + 0.31, 1.45, 1.85, w - 0.23, w + 0.23, { c: 0.02, near: true });
      K.box(steel, uc - 0.18, uc + 0.18, 1.0, 1.35, w - 0.235, w - 0.225 + 0.44, { c: 0.01, near: true });
      K.box(yellow, uc - 0.07, uc + 0.07, 0.18, 1.0, w + 0.58, w + 0.72, { c: 0.01, near: true });
    }
  }
  // the BP mark on the fascia, at both ends of the front
  const tex = markTexture(bpMark, 256, 256);
  const mm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0, alphaTest: 0.05 });
  for (const uc of [L * 0.2, L * 0.92]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), mm);
    m.applyMatrix4(frame.matrix(uc, H0 + 0.6, 0.075));
    frame.kit.add(m);
  }
  // the kiosk (the second compiled footprint, in this face's frame): walls, a green band, a flat roof, glass on the street side
  const R2 = (spec.also && spec.also[0]) ? spec.also[0] : null;
  if (R2) {
    // find the footprint ring of the kiosk: a box 8.3 x 7 m around the `also` point, aligned with the front frame
    const dx = R2[0] - frame.p0[0], dz = R2[1] - frame.p0[1];
    const uc = dx * frame.u[0] + dz * frame.u[1], wc = dx * frame.n[0] + dz * frame.n[1];
    const hu = 4.1, hw = 3.4, hk = 4.0;
    K.box(white, uc - hu, uc + hu, 0, hk, wc - hw, wc + hw, { c: 0.03 });
    K.box(green, uc - hu - 0.04, uc + hu + 0.04, hk - 0.9, hk - 0.3, wc - hw - 0.04, wc + hw + 0.04, { c: 0.01 });
    K.box(white, uc - hu - 0.1, uc + hu + 0.1, hk, hk + 0.2, wc - hw - 0.1, wc + hw + 0.1, { c: 0.02 });
    // the bay doors and the office glass on the street-facing side
    K.box(steel, uc - 3.5, uc - 0.6, 0.0, 3.0, wc + hw - 0.03, wc + hw + 0.05, { c: 0.01, near: true });
    K.box(K.mat('alu_clear'), uc + 0.6, uc + 3.5, 0.9, 2.6, wc + hw - 0.03, wc + hw + 0.05, { c: 0.01, near: true });
    K.poly(K.mat('glass_storefront'), [[uc + 0.7, 1.0, wc + hw + 0.06], [uc + 3.4, 1.0, wc + hw + 0.06], [uc + 3.4, 2.5, wc + hw + 0.06], [uc + 0.7, 2.5, wc + hw + 0.06]], [0, 0, 1], { shadow: false });
  }
  // the price pylon at the street corner: a steel pole and a black price board
  {
    const uc = L + 1.8, wc = 1.2;
    K.box(K.mat('steel_rust', { tint: '#5b3a28' }), uc - 0.22, uc + 0.22, 0, 7.6, wc - 0.22, wc + 0.22, { c: 0.03 });
    K.box(steel, uc - 1.5, uc + 1.5, 5.6, 7.3, wc - 0.12, wc + 0.12, { c: 0.02 });
    K.box(green, uc - 1.5, uc + 1.5, 7.3, 7.7, wc - 0.14, wc + 0.14, { c: 0.02 });
    for (let k = 0; k < 3; k++) K.box(K.mat('alu_clear', { tint: '#6fe08a' }), uc - 1.1, uc + 1.1, 5.85 + k * 0.5, 6.1 + k * 0.5, wc + 0.12, wc + 0.14, { c: 0, near: true });
  }
  void group; void ctx;
}

// ================================================================== the block under construction on the south side, Lexington to Third (QA Q02, Q59)
// 2026-08: a ten-storey block in a full frame scaffold wrapped in dark netting with
// orange seams, a light screen round its top, from the Third Avenue corner west to a yard (Lexington to the block): the CORE sidewalk
// shed along both street fronts (posts on the sidewalk 1.3 m in from the kerb, green-painted plank hoarding between them, a dark
// netting band up to the deck, a green steel railing on the deck with the contractor's CORE boards), a bridge over the yard gate at the
// west end, the gate's plywood, the yard's painted fence to Lexington, and in the yard the excavator, the dump truck at the gate and a
// crawler crane. No compiled footprint: drawn from a host spec in the same tile (e125-2282, whose front edge runs parallel to 125th) in
// a street frame: s metres east along 125th from spec.siteBlock.o, t metres south (into the block), y over the host's base.
// spec.siteBlock: { o: [x, z], dir: [ux, uz] (125th to the east), lot (t of the south building line), kerb (t of the kerb), w / e (s of
// the west face / of Third Avenue's building line), d1 (the 125th wing's depth), wing: [s0, t1] (the Third Avenue wing), roof (the top
// slab), screen, base (the ground storey), deck (the shed deck's top), out (t of the shed's kerb-side posts), outE (s of the same on
// Third Avenue), bridge: [s0, t1], gate: [s0, s1] (the opening), yard: [s0, t1], cores: [[s, t, face]], excavator: [s, t, yaw],
// truck: [s, t, yaw], crane: [s, t, yaw, boom] }. The walkers keep out (a collider prism over the shed's hoarding line and the yard
// fence: the crowd's bands stop 0.5 m short of a building wall, sim/peds.js PD26).
let siteNet = null, siteFac = null, siteCore = null, siteBand = null;
const siteCanvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
const siteT = (cv, wrap = true) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
// the netting: a dark brown-black knit (alpha ~0.6: the scaffold and the slabs read through it), orange-red seams every 0.5 m, a
// lighter overlap every 1.5 m; one tile = 3 m x 3 m
function siteNetTex() {
  if (siteNet) return siteNet;
  const S = 384, cv = siteCanvas(S, S), g = cv.getContext('2d'), R = rng(907), m = S / 3;
  g.fillStyle = 'rgba(46,38,34,0.76)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { g.fillStyle = R() < 0.5 ? 'rgba(8,7,6,0.25)' : 'rgba(110,92,80,0.10)'; g.fillRect(R() * S, R() * S, 1, 3 + R() * 14); }
  // the orange-red seams
  for (let k = 0; k < 6; k++) { const x = (k + 0.5) * m * 0.5; g.fillStyle = 'rgba(176,98,72,0.62)'; g.fillRect(x - 1.5, 0, 3, S); }
  for (let k = 0; k < 2; k++) { const x = k * m * 1.5 + 3; g.fillStyle = 'rgba(120,112,104,0.4)'; g.fillRect(x, 0, 3, S); }
  // the ties at each lift (2 m): short darker bands
  g.fillStyle = 'rgba(20,16,14,0.35)'; for (let y = 0; y < S; y += m * 2 / 3) g.fillRect(0, y, S, 2);
  return (siteNet = siteT(cv));
}
// the building behind the netting: per bay (3.6 m) x storey (2.85 m) a terracotta brick panel, a dark window opening (no glass yet),
// a concrete slab edge; one tile = two bays x one storey
function siteFacTex() {
  if (siteFac) return siteFac;
  const W = 512, H = 203, cv = siteCanvas(W, H), g = cv.getContext('2d'), R = rng(311), m = W / 7.2;
  g.fillStyle = '#62392e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = 90 + R() * 50; g.fillStyle = `rgba(${v + 40},${v * 0.55},${v * 0.42},0.35)`; g.fillRect(R() * W, R() * H, 2 + R() * 4, 1 + R()); }
  for (const x0 of [0.55, 4.15]) { g.fillStyle = '#16191b'; g.fillRect(x0 * m, 0.55 * m, 2.1 * m, 1.75 * m); g.fillStyle = 'rgba(70,74,74,0.6)'; g.fillRect(x0 * m + 0.2 * m, 0.7 * m, 0.08 * m, 1.6 * m); }
  g.fillStyle = '#7f7a72'; g.fillRect(0, H - 0.3 * m, W, 0.3 * m);
  g.fillStyle = '#76716a'; g.fillRect(3.45 * m, 0, 0.3 * m, H);
  return (siteFac = siteT(cv));
}
// the contractor's board on the shed railing: black heavy italic capitals on chrome yellow, a thin black rule and a small line under
function siteCoreTex() {
  if (siteCore) return siteCore;
  const W = 256, H = 300, cv = siteCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#e9cb3c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = '#141414'; g.font = 'italic 900 92px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(W / 2, H * 0.42); g.scale(0.92, 1.25); g.fillText('CORE', 0, 0); g.restore();
  g.font = 'bold 15px Arial, Helvetica, sans-serif'; g.fillText('SCAFFOLD SYSTEMS', W / 2, H * 0.7);
  g.fillRect(40, H * 0.78, W - 80, 3);
  return (siteCore = siteT(cv, false));
}
// the band between the hoarding and the deck: black netting with orange ropes (opaque enough to hide the shed's inside)
function siteBandTex() {
  if (siteBand) return siteBand;
  const W = 256, H = 64, cv = siteCanvas(W, H), g = cv.getContext('2d'), R = rng(77);
  g.fillStyle = 'rgba(18,17,16,0.9)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(70,64,58,0.25)'; g.fillRect(R() * W, R() * H, 1 + R() * 6, 1); }
  for (const y of [0.22, 0.58, 0.9]) { g.fillStyle = 'rgba(214,96,52,0.9)'; g.fillRect(0, y * H, W, 2); }
  return (siteBand = siteT(cv));
}
export function siteBlock(group, ctx, spec, frame) {
  const B = spec.siteBlock;
  if (!B || !B.o || !B.dir) return;
  const K = frame.kit, doc = typeof document !== 'undefined';
  const ox = B.o[0], oz = B.o[1], ux = B.dir[0], uz = B.dir[1], vx = -uz, vz = ux;
  const P0 = frame.p0, FU = frame.u, FN = frame.n, Y0 = frame.y0;
  const wx = (s, t) => ox + ux * s + vx * t, wz = (s, t) => oz + uz * s + vz * t;
  const ku = (s, t) => (wx(s, t) - P0[0]) * FU[0] + (wz(s, t) - P0[1]) * FU[1];
  const kw = (s, t) => (wx(s, t) - P0[0]) * FN[0] + (wz(s, t) - P0[1]) * FN[1];
  // a box in the street frame through the host's kit (merged by material; o.near: the near level, o.c: chamfer)
  const bx = (mat, s0, s1, y0, y1, t0, t1, o = {}) => {
    const sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
    K.box(mat, ku(s0, tm), ku(s1, tm), y0, y1, kw(sm, t0), kw(sm, t1), { c: 0, ...o });
  };
  // a flat strip from (s0, y0, t0) to (s1, y1, t1), w wide across, facing `n` (a brace, a boom chord): through the kit's poly
  const strip = (mat, a, b, w, o = {}) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dt = b[2] - a[2], L = Math.hypot(dx, dy, dt);
    if (L < 1e-3) return;
    // the width runs across the strip in the plane facing the street (or o.side: [ds, dy, dt])
    let cx = o.side ? o.side[0] : -dy / L, cy = o.side ? o.side[1] : dx / L, ct = o.side ? o.side[2] : 0;
    const cl = Math.hypot(cx, cy, ct) || 1; cx *= w / 2 / cl; cy *= w / 2 / cl; ct *= w / 2 / cl;
    const P = (p, k) => [ku(p[0] + cx * k, p[2] + ct * k), p[1] + cy * k, kw(p[0] + cx * k, p[2] + ct * k)];
    const n = o.n || [0, 0, -1];
    K.poly(mat, [P(a, -1), P(b, -1), P(b, 1), P(a, 1)], [n[0] * (FU[0] * ux + FU[1] * uz) + n[2] * (FU[0] * vx + FU[1] * vz), n[1], n[0] * (FN[0] * ux + FN[1] * uz) + n[2] * (FN[0] * vx + FN[1] * vz)], { near: o.near ?? true });
  };
  // my own textured quads in world coordinates (the netting, the building behind it, the boards): [[s0, t0], [s1, t1], y0, y1, out
  // ([ds, dt] the face's outward direction), tile [m across, m up, the height where v = 0]]; a runs to b left to right seen from outside
  const quads = (list, mat, name, o = {}) => {
    const pos = [], nrm = [], uv = [], idx = [];
    for (const [a, b, y0, y1, out, tl] of list) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = ux * out[0] + vx * out[1], nz = uz * out[0] + vz * out[1];
      const k = pos.length / 3;
      const pts = [[a, y0], [b, y0], [b, y1], [a, y1]];
      for (const [p, y] of pts) { pos.push(wx(p[0], p[1]), Y0 + y, wz(p[0], p[1])); nrm.push(nx, 0, nz); }
      const vo = tl[2] || 0;
      uv.push(0, (y0 - vo) / tl[1], L / tl[0], (y0 - vo) / tl[1], L / tl[0], (y1 - vo) / tl[1], 0, (y1 - vo) / tl[1]);
      // wound counter-clockwise seen from outside: (b - a) x ((b + up) - a) = (-e1z, 0, e1x)
      const e1x = wx(b[0], b[1]) - wx(a[0], a[1]), e1z = wz(b[0], b[1]) - wz(a[0], a[1]);
      if (-e1z * nx + e1x * nz > 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const me = new THREE.Mesh(geo, mat);
    me.name = name; me.castShadow = !!o.cast; me.receiveShadow = true;
    if (o.order !== undefined) me.renderOrder = o.order;
    K.add(me);
    return me;
  };
  const lot = B.lot, sW = B.w, sE = B.e, d1 = B.d1, [ws0, wt1] = B.wing, roof = B.roof, scr = B.screen ?? 3, base = B.base ?? 4.4;
  const deck = B.deck ?? 3.5, out = B.out, outE = B.outE, sd = 1.4;   // the scaffold's depth off the facade
  const sc0 = lot - sd, scE = sE + sd, scW = sW - sd;   // its outer planes: 125th, Third Avenue, the west face
  const conc = K.mat('concrete_precast', { tint: '#a29d94', dirt: 0.5 });
  const galv = K.mat('steel_galvanized', { dirt: 0.3 });
  const plank = K.mat('wood_painted', { tint: '#6f675b', dirt: 0.6 });   // (s3r4: #9b8a6c's lit undersides read as wide tan bands through the netting)
  const green = K.mat('metal_painted', { tint: '#2f5a40', chips: 0.15 });
  const hoardG = K.mat('wood_painted', { tint: '#34503f', dirt: 0.55 });
  const ply = K.mat('plywood', { dirt: 0.45 });
  const screen = K.mat('metal_painted', { tint: '#c6cac8', chips: 0.05 });

  // ---- the frame: slabs at each floor, the ground storey's dark walls, the roof
  const fh = (roof - base) / Math.max(1, Math.round((roof - base) / 2.85));
  const wings = [[sW, sE, lot, d1], [ws0, sE, d1, wt1]];
  for (let y = base; y <= roof + 1e-3; y += fh) for (const [s0, s1, t0, t1] of wings) bx(conc, s0 - 0.05, s1 + 0.05, y - 0.3, y, t0 - 0.05, t1 + 0.05, { c: 0.01 });
  for (const [s0, s1, t0, t1] of wings) {
    bx(K.mat('concrete_board', { tint: '#4c4a46', dirt: 0.6 }), s0 + 0.4, s1 - 0.4, 0, base - 0.3, t0 + 0.4, t1 - 0.4);
    bx(conc, s0, s1, roof, roof + 0.45, t0, t1, { c: 0.02 });
  }
  // the building's faces behind the netting (0.15 m behind the slab edges)
  if (doc) {
    const fac = muCalib(new THREE.MeshStandardMaterial({ map: siteFacTex(), roughness: 0.9, metalness: 0 }));
    const F = [];
    const fy0 = base, fy1 = roof - 0.3, tile = [7.2, fh, base - 0.3];
    F.push([[sE, lot + 0.15], [sW, lot + 0.15], fy0, fy1, [0, -1], tile]);                       // 125th
    F.push([[sW + 0.15, lot], [sW + 0.15, d1], fy0, fy1, [-1, 0], tile]);                        // the west face
    F.push([[sE - 0.15, wt1], [sE - 0.15, lot], fy0, fy1, [1, 0], tile]);                        // Third Avenue
    F.push([[sW, d1 - 0.15], [ws0, d1 - 0.15], fy0, fy1, [0, 1], tile]);                         // the yard side of the 125th wing
    F.push([[ws0 + 0.15, d1], [ws0 + 0.15, wt1], fy0, fy1, [-1, 0], tile]);                      // the yard side of the Third Avenue wing
    F.push([[ws0, wt1 - 0.15], [sE, wt1 - 0.15], fy0, fy1, [0, 1], tile]);                       // its south end (over 2282 Third)
    quads(F, fac, 'fk_site_facade', { cast: true });
  }

  // ---- the scaffold on the three street faces: frame legs every 1.85 m in two rows, a plank deck and guard rails at each 2 m lift,
  // X braces on the outer row, transoms; the netting on its outer plane
  const lift = 2.0, y0s = deck + 0.25, ytop = roof + 1.2, bay = 1.85;
  const runs = [
    // [s0, t0, s1, t1, the outer side] (a run's own axis: along s for the 125th face, along t for the end faces)
    { a: [scW, sc0], b: [scE, sc0], out: [0, -1] },
    { a: [scW, d1], b: [scW, sc0], out: [-1, 0] },
    { a: [scE, sc0], b: [scE, wt1], out: [1, 0] },
  ];
  for (const R0 of runs) {
    const alongS = Math.abs(R0.b[0] - R0.a[0]) > Math.abs(R0.b[1] - R0.a[1]);
    const L = alongS ? Math.abs(R0.b[0] - R0.a[0]) : Math.abs(R0.b[1] - R0.a[1]);
    const n = Math.max(1, Math.round(L / bay)), bl = L / n;
    // the inner row 0.25 m off the facade, the outer row at the run's plane
    const io = alongS ? R0.out[1] : R0.out[0];
    const at = (k, off) => {   // the k-th leg's (s, t), off: metres out from the run's plane
      const f = Math.min(1, k / n);
      const s = R0.a[0] + (R0.b[0] - R0.a[0]) * f, t = R0.a[1] + (R0.b[1] - R0.a[1]) * f;
      return alongS ? [s, t + io * off] : [s + io * off, t];
    };
    const leg = (p, y0, y1, r, mat, near) => bx(mat, p[0] - r, p[0] + r, y0, y1, p[1] - r, p[1] + r, { near, skip: 12 });
    for (let k = 0; k <= n; k++) {
      leg(at(k, 0), y0s, ytop, 0.03, galv, false);
      leg(at(k, -(sd - 0.25)), y0s, ytop, 0.03, galv, true);
    }
    for (let y = y0s; y <= ytop - 0.5; y += lift) {
      // planks across the scaffold's width and its toe board; the guard rails at 0.5 / 1.0 m on the outer row
      const a0 = at(0, 0), a1 = at(n, 0), b0 = at(0, -(sd - 0.25));
      if (alongS) {
        bx(plank, Math.min(a0[0], a1[0]), Math.max(a0[0], a1[0]), y, y + 0.05, Math.min(a0[1], b0[1]), Math.max(a0[1], b0[1]), { near: false });
        for (const h of [0.5, 1.0]) bx(galv, Math.min(a0[0], a1[0]), Math.max(a0[0], a1[0]), y + h - 0.024, y + h + 0.024, a0[1] - 0.024, a0[1] + 0.024, { near: true });
      } else {
        bx(plank, Math.min(a0[0], b0[0]), Math.max(a0[0], b0[0]), y, y + 0.05, Math.min(a0[1], a1[1]), Math.max(a0[1], a1[1]), { near: false });
        for (const h of [0.5, 1.0]) bx(galv, a0[0] - 0.024, a0[0] + 0.024, y + h - 0.024, y + h + 0.024, Math.min(a0[1], a1[1]), Math.max(a0[1], a1[1]), { near: true });
      }
      // transoms and the X braces of each bay (outer row)
      for (let k = 0; k <= n; k++) {
        const p = at(k, 0), q = at(k, -(sd - 0.25));
        bx(galv, Math.min(p[0], q[0]) - 0.02, Math.max(p[0], q[0]) + 0.02, y - 0.06, y, Math.min(p[1], q[1]) - 0.02, Math.max(p[1], q[1]) + 0.02, { near: true });
        if (k < n && y + lift <= ytop + 1e-3) {
          const r = at(k + 1, 0), nOut = alongS ? [0, 0, R0.out[1]] : [R0.out[0], 0, 0];
          strip(galv, [p[0], y + 0.1, p[1]], [r[0], y + lift - 0.1, r[1]], 0.035, { n: nOut, side: [0, 1, 0], near: true });
          strip(galv, [r[0], y + 0.1, r[1]], [p[0], y + lift - 0.1, p[1]], 0.035, { n: nOut, side: [0, 1, 0], near: true });
        }
      }
    }
  }
  // the screen round the top: light panels on the outer planes, roof to roof + screen
  bx(screen, scW, scE, roof + 0.2, roof + scr, sc0 - 0.06, sc0, { c: 0.01 });
  bx(screen, scW - 0.06, scW, roof + 0.2, roof + scr, sc0, d1, { c: 0.01 });
  bx(screen, scE, scE + 0.06, roof + 0.2, roof + scr, sc0, wt1, { c: 0.01 });
  bx(screen, ws0 - sd, sE, roof + 0.2, roof + scr, wt1, wt1 + 0.06, { c: 0.01 });
  bx(screen, scW, ws0 - sd, roof + 0.2, roof + scr, d1 + sd - 0.06, d1 + sd, { c: 0.01 });
  bx(screen, ws0 - sd - 0.06, ws0 - sd, roof + 0.2, roof + scr, d1 + sd, wt1, { c: 0.01 });
  if (doc) {
    const net = muCalib(new THREE.MeshStandardMaterial({ map: siteNetTex(), roughness: 0.95, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const N = [], ny0 = y0s, ny1 = roof + 0.25, tile = [3, 3];
    N.push([[scW, sc0 - 0.04], [scE, sc0 - 0.04], ny0, ny1, [0, -1], tile]);
    N.push([[scW - 0.04, d1], [scW - 0.04, sc0], ny0, ny1, [-1, 0], tile]);
    N.push([[scE + 0.04, sc0], [scE + 0.04, wt1], ny0, ny1, [1, 0], tile]);
    // the yard sides: netting 1.4 m off the faces too (no scaffold drawn behind them)
    N.push([[ws0 - sd, d1 + sd], [scW, d1 + sd], base, ny1, [0, 1], tile]);
    N.push([[ws0 - sd, wt1], [ws0 - sd, d1 + sd], base, ny1, [-1, 0], tile]);
    N.push([[scE, wt1 + 0.04], [ws0 - sd, wt1 + 0.04], base, ny1, [0, 1], tile]);
    quads(N, net, 'fk_site_net', { order: 2 });
  }

  // ---- the sidewalk shed along 125th and Third Avenue: posts at the kerb side and at the scaffold, dark beams, the plank deck with a
  // green fascia, the green railing on the deck's edge, green-painted plank hoarding between the kerb-side posts to 1.5 m and the dark
  // netting band with orange ropes from there to the deck
  const dark = K.mat('steel_black', { dirt: 0.4 });
  const shedRuns = [
    { s0: scW, s1: outE, t0: out, t1: sc0, front: 'n' },      // 125th: the deck from the kerb-side posts back to the scaffold
    { s0: scE, s1: outE, t0: sc0, t1: wt1, front: 'e' },      // Third Avenue
  ];
  const soff = deck - 0.3, hh = 1.5;
  for (const S of shedRuns) {
    bx(hoardG, S.s0, S.s1, soff + 0.1, deck, S.t0, S.t1, { c: 0.01 });
    const alongS = S.front === 'n';
    const L = alongS ? S.s1 - S.s0 : S.t1 - S.t0, n = Math.max(1, Math.round(L / 2.4));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      if (alongS) {
        const s = S.s0 + (S.s1 - S.s0) * f;
        bx(galv, s - 0.03, s + 0.03, 0, soff, out - 0.03, out + 0.03, { skip: 4 });
        bx(dark, s - 0.06, s + 0.06, soff - 0.22, soff + 0.1, S.t0 - 0.05, S.t1, { c: 0.005 });
        bx(galv, s - 0.12, s + 0.12, 0, 0.04, out - 0.12, out + 0.12, { near: true });
      } else {
        const t = S.t0 + (S.t1 - S.t0) * f;
        bx(galv, outE - 0.03, outE + 0.03, 0, soff, t - 0.03, t + 0.03, { skip: 4 });
        bx(dark, S.s0, outE + 0.05, soff - 0.22, soff + 0.1, t - 0.06, t + 0.06, { c: 0.005 });
        bx(galv, outE - 0.12, outE + 0.12, 0, 0.04, t - 0.12, t + 0.12, { near: true });
      }
    }
    // the green railing: top and middle rails, a toe board, uprights every 1 m; the deck's fascia
    const rl = 1.07;
    if (alongS) {
      bx(green, S.s0, S.s1, soff - 0.05, deck + 0.02, out - 0.06, out - 0.02, { c: 0.005 });
      bx(green, S.s0, S.s1, deck + rl - 0.06, deck + rl, out - 0.03, out + 0.03);
      bx(green, S.s0, S.s1, deck + 0.52, deck + 0.56, out - 0.02, out + 0.02, { near: true });
      bx(green, S.s0, S.s1, deck, deck + 0.15, out - 0.015, out + 0.015);
      for (let s = S.s0; s <= S.s1 + 1e-3; s += 1.0) bx(green, s - 0.025, s + 0.025, deck, deck + rl, out - 0.025, out + 0.025, { near: true });
      bx(hoardG, S.s0, S.s1, 0, hh, out + 0.04, out + 0.09, { c: 0.004 });
      for (const h of [0.45, 0.95, hh - 0.06]) bx(green, S.s0, S.s1, h, h + 0.07, out - 0.0, out + 0.04, { near: true });
    } else {
      bx(green, outE + 0.02, outE + 0.06, soff - 0.05, deck + 0.02, S.t0, S.t1, { c: 0.005 });
      bx(green, outE - 0.03, outE + 0.03, deck + rl - 0.06, deck + rl, S.t0, S.t1);
      bx(green, outE - 0.02, outE + 0.02, deck + 0.52, deck + 0.56, S.t0, S.t1, { near: true });
      bx(green, outE - 0.015, outE + 0.015, deck, deck + 0.15, S.t0, S.t1);
      for (let t = S.t0; t <= S.t1 + 1e-3; t += 1.0) bx(green, outE - 0.025, outE + 0.025, deck, deck + rl, t - 0.025, t + 0.025, { near: true });
      bx(hoardG, outE - 0.09, outE - 0.04, 0, hh, S.t0, S.t1, { c: 0.004 });
      for (const h of [0.45, 0.95, hh - 0.06]) bx(green, outE - 0.04, outE, h, h + 0.07, S.t0, S.t1, { near: true });
    }
  }
  // the shed's west end (the bridge starts there): the railing's end
  bx(green, scW - 0.03, scW + 0.03, deck + 1.01, deck + 1.07, out, sc0);
  if (doc) {
    const band = muCalib(new THREE.MeshStandardMaterial({ map: siteBandTex(), roughness: 0.95, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    quads([
      [[outE, out + 0.06], [scW, out + 0.06], hh, soff - 0.1, [0, -1], [4, soff - 0.1 - hh, hh]],
      [[outE - 0.06, wt1], [outE - 0.06, sc0], hh, soff - 0.1, [1, 0], [4, soff - 0.1 - hh, hh]],
    ], band, 'fk_site_band', { order: 1 });
    // the CORE boards on the railing
    const core = muCalib(new THREE.MeshStandardMaterial({ map: siteCoreTex(), roughness: 0.6, metalness: 0 }));
    const C = [];
    for (const [s, t, face] of B.cores || []) {
      if (face === 'e') C.push([[outE + 0.05, t + 0.45], [outE + 0.05, t - 0.45], deck + 0.05, deck + 1.12, [1, 0], [0.9, 1.07, deck + 0.05]]);
      else C.push([[s + 0.45, out - 0.05], [s - 0.45, out - 0.05], deck + 0.05, deck + 1.12, [0, -1], [0.9, 1.07, deck + 0.05]]);
    }
    quads(C, core, 'fk_site_core');
  }

  // ---- beams with a rectangular section between two points of the street frame ([s, y, t]), w across and h up (the plant's booms,
  // sticks and lattice, the bridge's braces): six faces through the kit's poly
  const kdir = (ds, dy, dt) => [ds * (FU[0] * ux + FU[1] * uz) + dt * (FU[0] * vx + FU[1] * vz), dy, ds * (FN[0] * ux + FN[1] * uz) + dt * (FN[0] * vx + FN[1] * vz)];
  const kp = (p) => [ku(p[0], p[2]), p[1], kw(p[0], p[2])];
  const beam = (mat, A, Bp, w, h, near = false) => {
    const d = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-3) return;
    const e = d.map((q) => q / L);
    let sd2 = [-e[2], 0, e[0]], sl = Math.hypot(sd2[0], sd2[2]);
    if (sl < 1e-4) { sd2 = [1, 0, 0]; sl = 1; }
    sd2 = sd2.map((q) => q / sl);
    const up = [sd2[1] * e[2] - sd2[2] * e[1], sd2[2] * e[0] - sd2[0] * e[2], sd2[0] * e[1] - sd2[1] * e[0]];
    const C = (P, i, j) => [P[0] + sd2[0] * i * w / 2 + up[0] * j * h / 2, P[1] + sd2[1] * i * w / 2 + up[1] * j * h / 2, P[2] + sd2[2] * i * w / 2 + up[2] * j * h / 2];
    const f = (pts, nv) => K.poly(mat, pts.map(kp), kdir(nv[0], nv[1], nv[2]), { near });
    f([C(A, 1, -1), C(Bp, 1, -1), C(Bp, 1, 1), C(A, 1, 1)], sd2);
    f([C(A, -1, -1), C(Bp, -1, -1), C(Bp, -1, 1), C(A, -1, 1)], sd2.map((q) => -q));
    f([C(A, -1, 1), C(A, 1, 1), C(Bp, 1, 1), C(Bp, -1, 1)], up);
    f([C(A, -1, -1), C(A, 1, -1), C(Bp, 1, -1), C(Bp, -1, -1)], up.map((q) => -q));
    f([C(A, -1, -1), C(A, 1, -1), C(A, 1, 1), C(A, -1, 1)], e.map((q) => -q));
    f([C(Bp, -1, -1), C(Bp, 1, -1), C(Bp, 1, 1), C(Bp, -1, 1)], e);
  };

  // ---- the bridge over the yard gate (a working platform over the shed's west end and the gate): dark girders under a plank deck
  // (e2676: its deck's underside ~5.9 m, the railing's top ~7.3 m over the road), the green railing on three sides, posts at its west
  // end braced across, the east end on the scaffold
  const [bs0, bs1, bt1] = B.bridge, bso = B.bridgeY ?? [5.85, 6.15];
  bx(dark, bs0, bs1, bso[0], bso[0] + 0.25, out - 0.1, out + 0.15, { c: 0.005 });
  bx(dark, bs0, bs1, bso[0], bso[0] + 0.25, bt1 - 0.25, bt1, { c: 0.005 });
  for (let k = 0; k <= 6; k++) { const s = bs0 + (bs1 - bs0) * k / 6; bx(dark, s - 0.08, s + 0.08, bso[0] + 0.05, bso[0] + 0.25, out, bt1, { c: 0.004 }); }
  bx(dark, bs0, bs1, bso[1] - 0.05, bso[1], out - 0.1, bt1, { c: 0.005 });   // a steel deck (s3r2: plywood read tan from below)
  bx(green, bs0, bs1, bso[0] + 0.2, bso[1] + 0.1, out - 0.14, out - 0.1, { c: 0.004 });
  const brl = 1.15, bTop = bso[1] + brl;
  bx(green, bs0, bs1, bTop - 0.06, bTop, out - 0.13, out - 0.07);
  bx(green, bs0 - 0.03, bs0 + 0.03, bTop - 0.06, bTop, out - 0.1, bt1);
  bx(green, bs0, bs1, bTop - 0.06, bTop, bt1 - 0.03, bt1 + 0.03);
  bx(green, bs0, bs1, bso[1] + 0.55, bso[1] + 0.59, out - 0.12, out - 0.08, { near: true });
  for (let s = bs0; s <= bs1 + 1e-3; s += 0.95) bx(green, s - 0.03, s + 0.03, bso[1], bTop, out - 0.13, out - 0.07);
  for (let t = out; t <= bt1 + 1e-3; t += 0.95) bx(green, bs0 - 0.03, bs0 + 0.03, bso[1], bTop, t - 0.03, t + 0.03);
  for (const t of [out, out + 1.0, bt1 - 1.0, bt1]) for (const s of [bs0 + 0.1, bs0 + 1.0]) bx(galv, s - 0.04, s + 0.04, 0, bso[0], t - 0.04, t + 0.04, { skip: 12 });
  for (const s of [bs0 + 0.1, bs0 + 1.0]) {
    beam(galv, [s, 0.4, out], [s, bso[0] - 0.3, out + 1.0], 0.05, 0.05);
    beam(galv, [s, 0.4, out + 1.0], [s, bso[0] - 0.3, out], 0.05, 0.05);
  }
  for (const y of [1.0, 2.6, bso[0] - 0.3]) bx(galv, bs0 + 0.06, bs0 + 1.04, y - 0.03, y + 0.03, out - 0.03, out + 0.03, { near: true });
  // the gate under it: plywood leaves east of the opening (the building's side), the opening with its yellow closure banner
  const [gs0, gs1] = B.gate;
  bx(ply, gs1, scW, 0, 2.6, lot - 0.06, lot, { c: 0.004 });
  bx(galv, gs0 + 0.3, gs1 - 0.3, 0, 1.0, lot - 0.5, lot - 0.46, { near: true });
  bx(FX36 ? K.mat('plain', { tint: '#e3c232', rough: 0.55 }) : K.mat('metal_painted', { tint: '#e8c632' }), gs0 + 0.4, gs1 - 0.4, 0.25, 0.95, lot - 0.53, lot - 0.5, { near: true });

  // ---- the yard's painted fence along 125th, Lexington to the gate, the yard's
  // dirt, the plant
  const [ys0, yt1] = B.yard;
  const fl = gs0 - ys0, fh2 = 2.5;
  if (fl > 2) {
    const post = K.mat('wood_painted', { tint: '#8a7352', dirt: 0.5 });
    bx(ply, ys0, gs0, 0, fh2, lot + 0.02, lot + 0.07, { c: 0.004 });
    for (let s = ys0; s <= gs0 + 1e-3; s += fl / Math.max(2, Math.round(fl / 2.4))) bx(post, s - 0.06, s + 0.06, 0, fh2 + 0.05, lot + 0.07, lot + 0.2, { c: 0.01 });
    if (doc) {
      const mat = muMaterial([fl, fh2, 0, B.murals || [], B.muralSeed ?? 4125], { nScale: 0.6, roughness: 0.82 });
      quads([[[gs0, lot - 0.004], [ys0, lot - 0.004], 0.03, fh2 - 0.03, [0, -1], [fl, fh2 - 0.06, 0.03]]], mat, 'fk_site_mural');
    }
  }
  if (doc) {
    const shape = new THREE.Shape(), ring = [[ys0, lot + 0.1], [sW, lot + 0.1], [sW, d1], [ws0, d1], [ws0, yt1], [ys0, yt1]];
    ring.forEach(([s, t], i) => (i ? shape.lineTo(wx(s, t), -wz(s, t)) : shape.moveTo(wx(s, t), -wz(s, t))));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x75685a, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    m.position.y = Y0 + 0.04; m.receiveShadow = true; m.name = 'fk_site_yard';
    K.add(m);
  }
  const yellow = FX36 ? K.mat('plain', { tint: '#d9a21e', rough: 0.5 }) : K.mat('metal_painted', { tint: '#e2a91c', chips: 0.25 });
  const mdark = FX36 ? K.mat('plain', { tint: '#202224', rough: 0.62 }) : null;   // the plant's tracks, chassis and cab (FX36)
  const glassD = K.mat('metal_painted', { tint: '#2a3236', chips: 0 });
  // a machine's own frame: (s, t) its centre, yaw (radians, 0 = facing +s), local x forward, z to its left; X: an upright box, M: the
  // point [x, y, z] in the street frame (for beam)
  const mach = (cs, ct, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (x, z) => [cs + x * c - z * s, ct + x * s + z * c];
    const M = (x, y, z) => { const p = P(x, z); return [p[0], y, p[1]]; };
    const X = (mat, x0, x1, y0, y1, z0, z1, near = false) => {
      const q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => P(x, z));
      const K3 = (p, y) => [ku(p[0], p[1]), y, kw(p[0], p[1])];
      const nrm = (a, b) => { const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt) || 1; return kdir(dt / L, 0, -ds / L); };
      for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4];
        K.poly(mat, [K3(a, y0), K3(b, y0), K3(b, y1), K3(a, y1)], nrm(a, b), { near });
      }
      K.poly(mat, q.map((p) => K3(p, y1)), [0, 1, 0], { near });
    };
    return { X, M };
  };
  // the excavator (a 20-25 t crawler, e2676 / e2658: the boom raised, the stick down and the bucket in the dirt toward the gate)
  if (B.excavator) {
    const [es, et, ey] = B.excavator, { X, M } = mach(es, et, ey);
    X(mdark || dark, -2.3, 2.3, 0, 0.9, -1.6, -0.95); X(mdark || dark, -2.3, 2.3, 0, 0.9, 0.95, 1.6);   // the tracks
    X(mdark || dark, -0.9, 0.9, 0.9, 1.15, -0.9, 0.9);
    X(yellow, -1.9, 1.0, 1.15, 2.15, -1.3, 1.3);                                   // the house
    X(yellow, -2.45, -1.5, 1.15, 2.4, -1.3, 1.3);                                 // the counterweight
    X(yellow, 0.0, 1.2, 2.15, 3.25, 0.4, 1.3); X(glassD, 1.18, 1.22, 2.35, 3.1, 0.45, 1.25);   // the cab and its windscreen
    beam(yellow, M(0.8, 2.0, -0.2), M(3.9, 5.3, -0.2), 0.6, 0.75);                 // the boom: up to the knee
    beam(yellow, M(3.9, 5.3, -0.2), M(5.6, 5.5, -0.2), 0.55, 0.65);                //   and over
    beam(yellow, M(5.6, 5.5, -0.2), M(6.3, 1.4, -0.2), 0.45, 0.5);                 // the stick, down to the bucket
    beam(mdark || dark, M(1.2, 1.7, -0.2), M(3.3, 4.2, -0.2), 0.16, 0.16);                  // the boom cylinder
    X(mdark || dark, 5.7, 7.0, 0.15, 1.25, -0.75, 0.35);                                    // the bucket
  }
  // the dump truck at the gate (a red tri-axle body on a black cab and chassis)
  if (B.truck) {
    const [ts, tt, ty] = B.truck, { X } = mach(ts, tt, ty);
    const red = FX36 ? K.mat('plain', { tint: '#97292b', rough: 0.5 }) : K.mat('metal_painted', { tint: '#9e2a2c', chips: 0.3 });
    X(mdark || dark, -4.6, 3.2, 0.5, 1.05, -1.0, 1.0);                                    // the chassis
    X(red, -4.8, 1.6, 1.15, 2.9, -1.25, 1.25);                                   // the dump body
    X(red, -4.85, -4.75, 1.1, 3.0, -1.27, 1.27);
    X(mdark || dark, 1.8, 3.9, 1.0, 2.25, -1.2, 1.2);                                     // the hood and grille
    X(mdark || dark, 1.9, 3.3, 2.25, 3.25, -1.25, 1.25);                                  // the cab
    X(glassD, 3.28, 3.32, 2.35, 3.05, -1.1, 1.1);
    for (const x of [-3.9, -2.6, -1.3, 2.9]) for (const z of [-1.05, 1.05]) X(mdark || dark, x - 0.52, x + 0.52, 0, 1.04, z - 0.3, z + 0.3);
  }
  // the crawler crane in the yard: tracks, the house and gantry, a lattice boom (four chords, lacing on both sides and on top) raised
  // toward the yard's back, its pendants and the hook block
  if (B.crane) {
    const [cs, ct, cy, boom = 38, ang = 1.2] = B.crane, { X, M } = mach(cs, ct, cy);
    X(mdark || dark, -3.4, 3.4, 0, 1.2, -2.8, -1.8); X(mdark || dark, -3.4, 3.4, 0, 1.2, 1.8, 2.8);
    X(yellow, -3.0, 2.2, 1.2, 3.6, -1.7, 1.7); X(mdark || dark, -3.9, -3.0, 1.4, 3.3, -1.6, 1.6);
    X(yellow, 1.0, 2.4, 3.6, 5.2, 0.6, 1.7); X(glassD, 2.38, 2.42, 3.8, 5.0, 0.7, 1.6);
    const hx = Math.cos(ang), hy = Math.sin(ang), x0 = 1.6, y0b = 3.2;
    // a point on the boom: r along it, a (-1 / 1) side, b (-1 / 1) top / bottom; the section tapers 1.8 -> 0.8 m
    const bp = (r, a, b) => { const k = 1 - 0.55 * r / boom, half = 0.9 * k; return M(x0 + r * hx - b * half * hy, y0b + r * hy + b * half * hx, a * half); };
    for (const a of [-1, 1]) for (const b of [-1, 1]) beam(yellow, bp(0, a, b), bp(boom, a, b), 0.2, 0.2);
    const step = 2.2;
    for (let r = 0; r < boom - 0.5; r += step) {
      const r2 = Math.min(boom, r + step);
      for (const a of [-1, 1]) beam(yellow, bp(r, a, -1), bp(r2, a, 1), 0.08, 0.08, true);
      beam(yellow, bp(r, -1, 1), bp(r2, 1, 1), 0.08, 0.08, true);
      beam(yellow, bp(r, -1, -1), bp(r, 1, -1), 0.08, 0.08, true);
    }
    X(mdark || dark, x0 + boom * hx - 0.6, x0 + boom * hx + 0.9, y0b + boom * hy - 0.6, y0b + boom * hy + 0.5, -0.5, 0.5);   // the head sheaves
    beam(mdark || dark, M(-2.2, 3.6, 0), M(-1.2, 7.5, 0), 0.25, 0.25);                                                            // the gantry
    for (const a of [-0.4, 0.4]) beam(mdark || dark, M(-1.2, 7.5, a), bp(boom, a > 0 ? 1 : -1, 1), 0.05, 0.05);                  // the pendants
    const tip = bp(boom, 0, 0);
    beam(mdark || dark, [tip[0], tip[1] - 0.5, tip[2]], [tip[0], 9.0, tip[2]], 0.04, 0.04);                                       // the hoist line
    X(yellow, x0 + boom * hx - 0.35, x0 + boom * hx + 0.35, 8.0, 9.0, -0.35, 0.35);                                     // the hook block
  }

  // (the walkers' keep-out is registered when this module loads: siteKeepOut below)
  void group; void ctx;
}
// The walkers keep out of the site: the shed's hoarding line round the building and the yard's fence, as one prism the crowd takes for
// a building wall (sim/peds.js: the width probes and the bands stop 0.5 m short of one). Registered once when this module loads, under
// its own key: added at the end of tile 5_-5's kit build (10-15 s after the tile's walk edges were laid) it was missed, and the walkers
// kept 0.25-0.45 m behind the hoarding line (s3r2, the walker audit at QA's and the site's views: 272 of 1181 samples inside).
function siteKeepOut(B) {
  const ox = B.o[0], oz = B.o[1], ux = B.dir[0], uz = B.dir[1];
  const wx = (s, t) => ox + ux * s - uz * t, wz = (s, t) => oz + uz * s + ux * t;
  const [ys0, yt1] = B.yard, sc = B.w - 1.4, wt1 = B.wing[1];
  const ring = [[ys0, B.lot], [sc, B.lot], [sc, B.out], [B.outE, B.out], [B.outE, wt1 + 1], [ys0, yt1]];
  const pts = new Float32Array(ring.length * 2);
  let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  ring.forEach(([s, t], k) => { const x = wx(s, t), z = wz(s, t); pts[k * 2] = x; pts[k * 2 + 1] = z; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
  // the ground here lies ~3.2-3.5 m over the datum: the prism from 0 to the screen's top
  COLLIDERS.addPrism('east_site', { pts, minX, minZ, maxX, maxZ, y0: 0, y1: 3.5 + B.roof + (B.screen ?? 3) });
}
try { const h = (EAST_SPECS || []).find((sp) => sp && sp.id === 'e125-2282'); if (h && h.siteBlock && h.siteBlock.o) siteKeepOut(h.siteBlock); } catch (e) { /* no keep-out */ }
