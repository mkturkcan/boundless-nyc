// TA31 advertising artwork for the Times Square boards and screens (billboards.js), painted with canvas 2D.
//
// Owner 2026-09-28: "the ads are extremely low quality ... I want real (but of course stylized/changed to avoid
// trademark issues) ads with logos, graphic design and different fonts that are right size for billboards". The TS28
// cells were a brand name in 900-weight block type across 70-86 % of a square cell on a two-stop gradient. A real
// Times Square ad is a layout: a product or key-art image that takes about half the board, a headline at 8-14 % of
// the board height, a subline at 4-5 %, a logo lockup in a corner and a small line of legal or date copy. That is what
// every design here draws, and each one lays itself out for the rectangle it is given (a 4:1 strip, a 2:1 wall, a
// square, a 0.8:1 poster) instead of one square being stretched onto all of them.
//
// Every brand, product, show, film, slogan and critic below is invented. None of the marks copies a real one: the
// sneaker mark is a double chevron (no swoosh, no stripes), the soda is a lime script (no ribbon, no red disc), the
// streaming mark is a rounded square with a play wedge in two tones, the bank mark is two arches.
//
// No three.js here and no DOM beyond an optional canvas factory, so tools can paint the same atlas in node
// (docs/notes/tsq-graphics.md: preview harness). Fonts are SIL OFL files in public/fonts/ta31 (licences beside them).

export const AD_FONTS = [
  ['Anton', 'Anton.woff2', '400', 'normal'],
  ['Bebas Neue', 'BebasNeue.woff2', '400', 'normal'],
  ['Playfair Display', 'PlayfairDisplay-400.woff2', '400', 'normal'],
  ['Playfair Display', 'PlayfairDisplay-700.woff2', '700', 'normal'],
  ['Playfair Display', 'PlayfairDisplay-900.woff2', '900', 'normal'],
  ['Playfair Display', 'PlayfairDisplay-400-Italic.woff2', '400', 'italic'],
  ['Playfair Display', 'PlayfairDisplay-700-Italic.woff2', '700', 'italic'],
  ['Cormorant Garamond', 'CormorantGaramond-400.woff2', '400', 'normal'],
  ['Cormorant Garamond', 'CormorantGaramond-600.woff2', '600', 'normal'],
  ['Cormorant Garamond', 'CormorantGaramond-500-Italic.woff2', '500', 'italic'],
  ['Montserrat', 'Montserrat-300.woff2', '300', 'normal'],
  ['Montserrat', 'Montserrat-500.woff2', '500', 'normal'],
  ['Montserrat', 'Montserrat-700.woff2', '700', 'normal'],
  ['Montserrat', 'Montserrat-800.woff2', '800', 'normal'],
  ['Montserrat', 'Montserrat-900.woff2', '900', 'normal'],
  ['Montserrat', 'Montserrat-800-Italic.woff2', '800', 'italic'],
  ['Pacifico', 'Pacifico.woff2', '400', 'normal'],
  ['Limelight', 'Limelight.woff2', '400', 'normal'],
  ['Michroma', 'Michroma.woff2', '400', 'normal'],
  ['Fredoka', 'Fredoka-500.woff2', '500', 'normal'],
  ['Fredoka', 'Fredoka-700.woff2', '700', 'normal'],
  ['Bungee', 'Bungee.woff2', '400', 'normal'],
  ['Alfa Slab One', 'AlfaSlabOne.woff2', '400', 'normal'],
  ['Oswald', 'Oswald-400.woff2', '400', 'normal'],
  ['Oswald', 'Oswald-600.woff2', '600', 'normal'],
  ['Oswald', 'Oswald-700.woff2', '700', 'normal'],
  ['Great Vibes', 'GreatVibes.woff2', '400', 'normal'],
  ['Archivo Black', 'ArchivoBlack.woff2', '400', 'normal'],
  ['Righteous', 'Righteous.woff2', '400', 'normal'],
  ['Space Grotesk', 'SpaceGrotesk-400.woff2', '400', 'normal'],
  ['Space Grotesk', 'SpaceGrotesk-700.woff2', '700', 'normal'],
  ['Monoton', 'Monoton.woff2', '400', 'normal'],
  ['Abril Fatface', 'AbrilFatface.woff2', '400', 'normal'],
  ['Kaushan Script', 'KaushanScript.woff2', '400', 'normal'],
  ['Lobster', 'Lobster.woff2', '400', 'normal'],
];

// Browser only: register every face and resolve when all have loaded or failed. It never rejects, and a face that
// fails simply falls back to the next family in the font string, so a missing file costs a typeface, not the board.
let _fontsP = null;
export function loadAdFonts(base = 'fonts/ta31/') {
  if (_fontsP) return _fontsP;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return (_fontsP = Promise.resolve(false));
  _fontsP = Promise.all(AD_FONTS.map(([fam, file, weight, style]) => {
    try {
      const f = new FontFace(fam, `url(${base}${file})`, { weight, style });
      document.fonts.add(f);
      return f.load().then(() => true, () => false);
    } catch { return Promise.resolve(false); }
  })).then((r) => r.every(Boolean));
  return _fontsP;
}

// ---------------------------------------------------------------- primitives
const TAU = Math.PI * 2;
export function hs(i, n) { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); }
function rgbOf(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
// mix a #rrggbb toward white (k > 0) or black (k < 0); returns rgb()
export function shade(h, k, a = 1) {
  const [r, g, b] = rgbOf(h), t = k < 0 ? 0 : 255, f = Math.abs(k);
  return `rgba(${Math.round(r + (t - r) * f)},${Math.round(g + (t - g) * f)},${Math.round(b + (t - b) * f)},${a})`;
}
export function rgba(h, a) { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; }
function lg(c, x0, y0, x1, y1, st) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, s] of st) g.addColorStop(o, s); return g; }
function rg(c, x, y, r0, r1, st, x1 = x, y1 = y) { const g = c.createRadialGradient(x, y, Math.max(0, r0), x1, y1, Math.max(0.01, r1)); for (const [o, s] of st) g.addColorStop(o, s); return g; }
export function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
const FB = { sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif' };
export function setFont(c, size, fam, weight = 400, style = 'normal') {
  const fb = /Playfair|Cormorant|Abril|Limelight|Alfa/.test(fam) ? FB.serif : FB.sans;
  c.font = `${style} ${weight} ${Math.max(1, Math.round(size))}px "${fam}", ${fb}`;
}
// width with tracking (tracking in em)
export function tw(c, s, size, track = 0) { return c.measureText(s).width + track * size * Math.max(0, s.length - 1); }
// draw text with tracking; align l|c|r; returns width
export function tdraw(c, s, x, y, size, track = 0, align = 'l', stroke = false) {
  const W = tw(c, s, size, track);
  let x0 = align === 'c' ? x - W / 2 : align === 'r' ? x - W : x;
  c.textAlign = 'left';
  if (!track) { if (stroke) c.strokeText(s, x0, y); else c.fillText(s, x0, y); return W; }
  for (const ch of s) { if (stroke) c.strokeText(ch, x0, y); else c.fillText(ch, x0, y); x0 += c.measureText(ch).width + track * size; }
  return W;
}
// font spec F = [family, weight, style, track(em), upper]
export function fit(c, s, F, size, maxW, min = 4) {
  let z = size; setFont(c, z, F[0], F[1], F[2]);
  while (z > min && tw(c, s, z, F[3] || 0) > maxW) { z *= 0.93; setFont(c, z, F[0], F[1], F[2]); }
  return z;
}
// a block of lines at one size (the largest that fits maxW, capped at size); returns [height, size]
export function lines(c, L, F, size, x, y, maxW, align = 'l', lead = 1.08, draw = true) {
  let z = size;
  for (const s of L) z = Math.min(z, fit(c, F[4] ? s.toUpperCase() : s, F, size, maxW));
  setFont(c, z, F[0], F[1], F[2]);
  c.textBaseline = 'alphabetic';
  let yy = y + z * 0.86;
  if (draw) for (const s of L) { tdraw(c, F[4] ? s.toUpperCase() : s, x, yy, z, F[3] || 0, align); yy += z * lead; }
  return [z * (0.86 + lead * (L.length - 1)) + z * 0.18, z];
}
function drops(c, x, y, w, h, n, seed, s) {         // condensation on a cold can
  for (let i = 0; i < n; i++) {
    const px = x + hs(seed, i) * w, py = y + hs(seed, i + 91) * h, r = s * (0.3 + hs(seed, i + 7) * 0.9);
    c.fillStyle = 'rgba(255,255,255,0.20)'; ell(c, px, py, r, r * 1.25); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; ell(c, px - r * 0.3, py - r * 0.4, r * 0.28, r * 0.32); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; ell(c, px + r * 0.2, py + r * 0.55, r * 0.6, r * 0.25); c.fill();
  }
}
function stars(c, x, y, w, h, n, seed, a = 1) {
  for (let i = 0; i < n; i++) {
    const px = x + hs(seed, i) * w, py = y + hs(seed, i + 311) * h, r = 0.4 + hs(seed, i + 77) ** 3 * 2.2;
    c.fillStyle = `rgba(255,255,255,${(0.35 + hs(seed, i + 5) * 0.65) * a})`;
    c.fillRect(px, py, r, r);
  }
}
function shadowUnder(c, cx, cy, rx, ry, a = 0.45) {
  c.fillStyle = rg(c, cx, cy, 0, rx, [[0, `rgba(0,0,0,${a})`], [1, 'rgba(0,0,0,0)']]);
  c.save(); c.translate(cx, cy); c.scale(1, ry / rx); c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.restore(); c.fill();
}

// ---------------------------------------------------------------- product and key-art painters
// Each takes a box and draws into its centre at the art's own aspect (ART[k] = width / height).
const ART = { can: 0.78, phones: 1.0, sneaker: 2.1, lipstick: 0.62, perfume: 0.74, car: 2.7, plane: 2.3, burger: 1.12,
  shades: 2.5, cards: 1.45, lantern: 0.6, slim: 0.55 };
function fitBox(x, y, w, h, a) { let bw = w, bh = w / a; if (bh > h) { bh = h; bw = h * a; } return [x + (w - bw) / 2, y + (h - bh) / 2, bw, bh]; }

function artCan(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.can);
  // the lime slices and ice first, behind the can
  const cx = x + w * 0.44, H = h * 0.9, W = H * 0.48, y0 = y + h * 0.04, y1 = y0 + H;
  if (o.slices) {
    for (const [sx, sy, sr, rot] of [[x + w * 0.83, y + h * 0.78, h * 0.13, 0.4], [x + w * 0.12, y + h * 0.86, h * 0.10, -0.6]]) {
      c.save(); c.translate(sx, sy); c.rotate(rot);
      c.fillStyle = o.sliceRind; ell(c, 0, 0, sr, sr); c.fill();
      c.fillStyle = o.slicePulp; ell(c, 0, 0, sr * 0.88, sr * 0.88); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = sr * 0.05;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * sr * 0.84, Math.sin(a) * sr * 0.84); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.8)'; ell(c, 0, 0, sr * 0.1, sr * 0.1); c.fill();
      c.restore();
    }
  }
  shadowUnder(c, cx, y1 - H * 0.01, W * 0.75, H * 0.05, 0.55);
  const body = () => {
    c.beginPath();
    c.moveTo(cx - W * 0.40, y0 + H * 0.035);
    c.lineTo(cx - W / 2, y0 + H * 0.11); c.lineTo(cx - W / 2, y1 - H * 0.07);
    c.quadraticCurveTo(cx - W / 2, y1 - H * 0.02, cx - W * 0.42, y1);
    c.lineTo(cx + W * 0.42, y1); c.quadraticCurveTo(cx + W / 2, y1 - H * 0.02, cx + W / 2, y1 - H * 0.07);
    c.lineTo(cx + W / 2, y0 + H * 0.11); c.lineTo(cx + W * 0.40, y0 + H * 0.035); c.closePath();
  };
  body();
  c.fillStyle = lg(c, cx - W / 2, 0, cx + W / 2, 0, [[0, shade(o.body, -0.6)], [0.14, shade(o.body, -0.18)], [0.32, o.body], [0.4, shade(o.body, 0.45)], [0.47, o.body], [0.8, shade(o.body, -0.3)], [1, shade(o.body, -0.65)]]);
  c.fill();
  c.save(); body(); c.clip();
  // the graphic on the can: a wave band and the wordmark, then the cylinder shading laid back over it
  if (o.band) {
    c.fillStyle = o.band;
    c.beginPath(); c.moveTo(cx - W, y0 + H * 0.62);
    c.bezierCurveTo(cx - W * 0.2, y0 + H * 0.52, cx + W * 0.1, y0 + H * 0.74, cx + W, y0 + H * 0.6);
    c.lineTo(cx + W, y0 + H * 0.78); c.bezierCurveTo(cx + W * 0.2, y0 + H * 0.9, cx - W * 0.3, y0 + H * 0.7, cx - W, y0 + H * 0.8); c.closePath(); c.fill();
  }
  c.save(); c.translate(cx, y0 + H * 0.45); c.rotate(-Math.PI / 2 * (o.vertical ? 1 : 0));
  c.fillStyle = o.ink; c.textBaseline = 'middle';
  if (o.vertical) { const z = fit(c, o.name, o.nameF, W * 0.62, H * 0.62); c.textBaseline = 'middle'; tdraw(c, o.name, 0, z * 0.05, z, o.nameF[3] || 0, 'c'); }
  else { const z = fit(c, o.name, o.nameF, W * 0.34, W * 0.86); tdraw(c, o.name, 0, 0, z, o.nameF[3] || 0, 'c'); }
  c.restore();
  if (o.small) { c.fillStyle = o.ink; setFont(c, W * 0.075, 'Montserrat', 700); c.textBaseline = 'middle'; tdraw(c, o.small, cx, y0 + H * 0.86, W * 0.075, 0.18, 'c'); }
  c.fillStyle = lg(c, cx - W / 2, 0, cx + W / 2, 0, [[0, 'rgba(0,0,0,0.55)'], [0.18, 'rgba(0,0,0,0.05)'], [0.36, 'rgba(255,255,255,0.32)'], [0.44, 'rgba(255,255,255,0.0)'], [0.78, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0.6)']]);
  c.fillRect(cx - W, y0, W * 2, H);
  if (o.cold) drops(c, cx - W / 2, y0 + H * 0.12, W, H * 0.8, 70, 7.3, W * 0.03);
  c.restore();
  // lid, rim and tab
  c.fillStyle = lg(c, cx - W * 0.4, 0, cx + W * 0.4, 0, [[0, '#7c828c'], [0.3, '#e8ecf2'], [0.55, '#a9b0ba'], [1, '#5b616b']]);
  ell(c, cx, y0 + H * 0.035, W * 0.40, H * 0.028); c.fill();
  c.strokeStyle = 'rgba(40,44,52,0.6)'; c.lineWidth = H * 0.004; ell(c, cx, y0 + H * 0.036, W * 0.33, H * 0.021); c.stroke();
  c.fillStyle = '#c9ced6'; rrect(c, cx - W * 0.1, y0 + H * 0.022, W * 0.2, H * 0.02, H * 0.01); c.fill();
  c.fillStyle = lg(c, cx - W / 2, 0, cx + W / 2, 0, [[0, '#6b717a'], [0.35, '#eef1f5'], [1, '#5a6068']]);
  c.fillRect(cx - W * 0.42, y1 - H * 0.02, W * 0.84, H * 0.02);
}

function artSlim(c, x, y, w, h, o) {            // a tall slim energy can, lit from behind
  [x, y, w, h] = fitBox(x, y, w, h, ART.slim);
  const cx = x + w / 2, W = w * 0.62, y0 = y + h * 0.03, y1 = y + h * 0.97;
  c.fillStyle = rg(c, cx, y + h * 0.45, 0, w * 0.9, [[0, rgba(o.glow, 0.55)], [1, rgba(o.glow, 0)]]); c.fillRect(x - w * 0.4, y, w * 1.8, h);
  const body = () => { rrect(c, cx - W / 2, y0 + h * 0.05, W, y1 - y0 - h * 0.05, W * 0.12); };
  body(); c.fillStyle = lg(c, cx - W / 2, 0, cx + W / 2, 0, [[0, '#050506'], [0.3, '#22242a'], [0.4, '#5c6070'], [0.5, '#1a1b20'], [1, '#030304']]); c.fill();
  c.save(); body(); c.clip();
  c.strokeStyle = o.glow; c.lineWidth = W * 0.07; c.shadowColor = o.glow; c.shadowBlur = W * 0.25;
  c.beginPath(); c.moveTo(cx - W * 0.3, y0 + h * 0.18); c.lineTo(cx, y0 + h * 0.46); c.lineTo(cx + W * 0.3, y0 + h * 0.18); c.stroke();
  c.shadowBlur = 0;
  c.fillStyle = o.glow; c.save(); c.translate(cx + W * 0.1, y0 + h * 0.72); c.rotate(-Math.PI / 2);
  const z = fit(c, o.name, ['Anton', 400, 'normal', 0.04], W * 0.5, h * 0.42); c.textBaseline = 'middle'; tdraw(c, o.name, 0, 0, z, 0.04, 'c'); c.restore();
  c.fillStyle = lg(c, cx - W / 2, 0, cx + W / 2, 0, [[0, 'rgba(0,0,0,0.5)'], [0.36, 'rgba(255,255,255,0.18)'], [0.46, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.6)']]); c.fillRect(cx - W, y0, W * 2, h);
  drops(c, cx - W / 2, y0 + h * 0.1, W, h * 0.85, 45, 3.1, W * 0.035);
  c.restore();
  c.fillStyle = lg(c, cx - W * 0.45, 0, cx + W * 0.45, 0, [[0, '#6d737c'], [0.35, '#eef1f5'], [1, '#595f68']]);
  rrect(c, cx - W * 0.44, y0 + h * 0.015, W * 0.88, h * 0.05, W * 0.08); c.fill();
}

function artPhones(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.phones);
  const pw = w * 0.42, ph = pw * 2.05;
  const phone = (px, py, rot, back) => {
    c.save(); c.translate(px, py); c.rotate(rot);
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = pw * 0.18; c.shadowOffsetY = pw * 0.06;
    rrect(c, -pw / 2, -ph / 2, pw, ph, pw * 0.16);
    c.fillStyle = lg(c, -pw / 2, 0, pw / 2, 0, [[0, '#2a2d33'], [0.08, '#9aa0aa'], [0.5, '#50545c'], [0.92, '#a7adb7'], [1, '#26292e']]);
    c.fill(); c.shadowColor = 'transparent';
    const i = pw * 0.035;
    rrect(c, -pw / 2 + i, -ph / 2 + i, pw - 2 * i, ph - 2 * i, pw * 0.14);
    if (back) {
      c.fillStyle = lg(c, -pw / 2, -ph / 2, pw / 2, ph / 2, [[0, shade(o.back, 0.25)], [0.5, o.back], [1, shade(o.back, -0.45)]]); c.fill();
      // camera island: three lenses and a flash
      const s = pw * 0.44, ix = -pw / 2 + pw * 0.1, iy = -ph / 2 + pw * 0.1;
      rrect(c, ix, iy, s, s, s * 0.26); c.fillStyle = shade(o.back, -0.3, 0.9); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = pw * 0.008; c.stroke();
      for (const [lx, ly] of [[0.28, 0.28], [0.72, 0.5], [0.28, 0.72]]) {
        const r = s * 0.19, qx = ix + s * lx, qy = iy + s * ly;
        c.fillStyle = '#0b0c10'; ell(c, qx, qy, r, r); c.fill();
        c.fillStyle = rg(c, qx - r * 0.2, qy - r * 0.2, 0, r * 0.8, [[0, '#3a4a78'], [0.5, '#141a2c'], [1, '#050608']]); ell(c, qx, qy, r * 0.72, r * 0.72); c.fill();
        c.strokeStyle = 'rgba(200,210,230,0.45)'; c.lineWidth = r * 0.12; ell(c, qx, qy, r * 0.92, r * 0.92); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.75)'; ell(c, qx - r * 0.25, qy - r * 0.3, r * 0.13, r * 0.13); c.fill();
      }
      c.fillStyle = '#f4ecd0'; ell(c, ix + s * 0.72, iy + s * 0.2, s * 0.06, s * 0.06); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = pw * 0.02; ell(c, 0, ph * 0.12, pw * 0.1, pw * 0.1); c.stroke();
      c.beginPath(); c.arc(0, ph * 0.12, pw * 0.16, -0.9, 0.9); c.stroke();
    } else {
      c.fillStyle = '#040406'; c.fill();
      const sx = -pw / 2 + i * 2, sy = -ph / 2 + i * 2, sw = pw - 4 * i, sh = ph - 4 * i;
      c.save(); rrect(c, sx, sy, sw, sh, pw * 0.12); c.clip();
      c.fillStyle = '#0a0620'; c.fillRect(sx, sy, sw, sh);
      c.globalCompositeOperation = 'lighter';
      for (const [bx, by, br, col] of o.blobs) { c.fillStyle = rg(c, sx + sw * bx, sy + sh * by, 0, sw * br, [[0, col], [1, 'rgba(0,0,0,0)']]); c.fillRect(sx, sy, sw, sh); }
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(255,255,255,0.95)'; setFont(c, sw * 0.26, 'Montserrat', 300); c.textBaseline = 'alphabetic';
      tdraw(c, '7:30', 0, sy + sh * 0.25, sw * 0.26, 0, 'c');
      setFont(c, sw * 0.055, 'Montserrat', 500); tdraw(c, 'Tuesday, October 6', 0, sy + sh * 0.1, sw * 0.055, 0.02, 'c');
      for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(255,255,255,0.22)'; rrect(c, sx + sw * (0.1 + k * 0.215), sy + sh * 0.88, sw * 0.16, sw * 0.16, sw * 0.045); c.fill(); }
      c.fillStyle = lg(c, sx, sy, sx + sw, sy + sh * 0.6, [[0, 'rgba(255,255,255,0.16)'], [0.45, 'rgba(255,255,255,0.03)'], [0.46, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(sx, sy, sw, sh);
      c.restore();
      c.fillStyle = '#000'; ell(c, 0, sy + sh * 0.025, pw * 0.028, pw * 0.028); c.fill();
    }
    c.restore();
  };
  phone(x + w * 0.33, y + h * 0.52, -0.13, true);
  phone(x + w * 0.64, y + h * 0.49, 0.07, false);
}

function artSneaker(c, x, y, w, h, o) {
  // a low-top runner in side view, toe to the right: stacked foam midsole, knit upper with a padded collar, a tongue
  // standing proud of the lacing, a heel clip, the brand's double chevron on the quarter
  [x, y, w, h] = fitBox(x, y, w, h, ART.sneaker);
  const P = (u, v) => [x + u * w, y + v * h];
  const path = (pts) => { c.beginPath(); c.moveTo(...P(...pts[0])); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 6) c.bezierCurveTo(...P(p[0], p[1]), ...P(p[2], p[3]), ...P(p[4], p[5])); else c.lineTo(...P(...p)); } c.closePath(); };
  shadowUnder(c, x + w * 0.52, y + h * 0.95, w * 0.48, h * 0.05, 0.5);
  // outsole with a toe spring
  path([[0.03, 0.84], [0.3, 0.90, 0.7, 0.90, 0.9, 0.86], [0.97, 0.84, 1.0, 0.78, 0.99, 0.72], [0.7, 0.8, 0.3, 0.8, 0.03, 0.78]]);
  c.fillStyle = o.sole; c.fill();
  // midsole: thick at the heel, sculpted
  path([[0.0, 0.56], [0.2, 0.60, 0.55, 0.66, 0.97, 0.64], [1.0, 0.66, 1.0, 0.70, 0.985, 0.73], [0.7, 0.82, 0.3, 0.82, 0.03, 0.8], [0.0, 0.74, -0.01, 0.64, 0.0, 0.56]]);
  c.fillStyle = lg(c, 0, y + h * 0.55, 0, y + h * 0.82, [[0, '#ffffff'], [0.6, '#eceef1'], [1, '#b9bec6']]); c.fill();
  c.strokeStyle = 'rgba(110,118,130,0.55)'; c.lineWidth = h * 0.01;
  c.beginPath(); c.moveTo(...P(0.06, 0.72)); c.bezierCurveTo(...P(0.3, 0.66), ...P(0.5, 0.76), ...P(0.78, 0.7)); c.stroke();
  c.fillStyle = o.accent; path([[0.02, 0.6], [0.12, 0.62], [0.16, 0.72], [0.04, 0.74]]); c.fill();       // heel clip
  // upper
  const upper = () => path([[0.02, 0.58], [0.0, 0.42, 0.02, 0.26, 0.07, 0.2], [0.12, 0.24, 0.2, 0.28, 0.27, 0.24], [0.31, 0.12, 0.35, 0.04, 0.4, 0.05],
    [0.47, 0.12, 0.6, 0.28, 0.78, 0.4], [0.9, 0.46, 1.0, 0.54, 0.97, 0.64], [0.6, 0.66, 0.25, 0.62, 0.02, 0.58]]);
  upper();
  c.fillStyle = lg(c, x, y + h * 0.05, x + w * 0.2, y + h * 0.7, [[0, shade(o.upper, 0.3)], [0.55, o.upper], [1, shade(o.upper, -0.4)]]); c.fill();
  c.save(); upper(); c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;       // knit
  for (let k = 0; k < 90; k++) { const py = y + k / 90 * h; c.beginPath(); c.moveTo(x, py); c.lineTo(x + w, py + h * 0.08); c.stroke(); }
  // toe cap and heel counter in a second tone
  path([[0.74, 0.66], [0.76, 0.5, 0.84, 0.42, 0.9, 0.45], [0.98, 0.5, 1.0, 0.56, 0.99, 0.66]]); c.fillStyle = shade(o.upper, -0.35); c.fill();
  path([[-0.02, 0.64], [-0.02, 0.36, 0.03, 0.22, 0.08, 0.2], [0.13, 0.36, 0.14, 0.52, 0.12, 0.64]]); c.fillStyle = shade(o.upper, -0.3); c.fill();
  // the side mark: a double chevron (no swoosh, no stripes)
  c.fillStyle = o.mark;
  for (const off of [0, 0.075]) { path([[0.36 + off, 0.34], [0.44 + off, 0.34], [0.53 + off, 0.46], [0.44 + off, 0.58], [0.36 + off, 0.58], [0.45 + off, 0.46]]); c.fill(); }
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = h * 0.02;           // gloss on the vamp
  c.beginPath(); c.moveTo(...P(0.47, 0.13)); c.bezierCurveTo(...P(0.58, 0.24), ...P(0.72, 0.33), ...P(0.88, 0.41)); c.stroke();
  c.restore();
  // padded collar with its lining showing
  path([[0.06, 0.2], [0.12, 0.16, 0.2, 0.2, 0.28, 0.22], [0.27, 0.26], [0.2, 0.29, 0.12, 0.26, 0.07, 0.23]]); c.fillStyle = o.lining || o.mark; c.fill();
  // tongue standing above the lacing
  path([[0.33, 0.1], [0.34, 0.0, 0.42, -0.02, 0.45, 0.04], [0.41, 0.1]]); c.fillStyle = shade(o.upper, 0.12); c.fill();
  // eyestay and laces
  c.strokeStyle = shade(o.upper, -0.5); c.lineWidth = h * 0.035; c.lineCap = 'round';
  c.beginPath(); c.moveTo(...P(0.39, 0.1)); c.bezierCurveTo(...P(0.47, 0.17), ...P(0.58, 0.27), ...P(0.68, 0.33)); c.stroke();
  c.strokeStyle = o.lace; c.lineWidth = h * 0.022;
  for (let k = 0; k < 5; k++) { const u = 0.41 + k * 0.055, v = 0.12 + k * 0.045; c.beginPath(); c.moveTo(...P(u - 0.022, v - 0.035)); c.lineTo(...P(u + 0.028, v + 0.03)); c.stroke(); }
  c.lineCap = 'butt';
  c.fillStyle = o.accent; rrect(c, ...P(0.045, 0.1), w * 0.03, h * 0.14, w * 0.01); c.fill();      // pull tab
}

function artLipstick(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.lipstick);
  // the swatch: one stroke of the shade behind the tube, inside the art's own box so it never crosses the type
  c.save(); c.globalAlpha = 0.92; c.fillStyle = o.red;
  c.beginPath(); c.moveTo(x - w * 0.1, y + h * 0.9); c.bezierCurveTo(x + w * 0.3, y + h * 0.55, x + w * 0.7, y + h * 0.75, x + w * 1.05, y + h * 0.3);
  c.lineTo(x + w * 1.08, y + h * 0.42); c.bezierCurveTo(x + w * 0.75, y + h * 0.88, x + w * 0.3, y + h * 0.7, x - w * 0.05, y + h * 1.0); c.closePath(); c.fill();
  c.restore();
  const gold =(x0, x1) => lg(c, x0, 0, x1, 0, [[0, '#6b4a16'], [0.2, '#c79a3e'], [0.38, '#fff0bf'], [0.5, '#d9ac4f'], [0.8, '#8a6420'], [1, '#4a320c']]);
  shadowUnder(c, x + w * 0.35, y + h * 0.985, w * 0.3, h * 0.02, 0.5);
  shadowUnder(c, x + w * 0.8, y + h * 0.985, w * 0.2, h * 0.015, 0.4);
  const bx = x + w * 0.14, bw = w * 0.42;
  c.fillStyle = gold(bx, bx + bw); c.fillRect(bx, y + h * 0.56, bw, h * 0.42);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(bx, y + h * 0.56, bw, h * 0.012);
  const ix = bx + bw * 0.1, iw = bw * 0.8;
  c.fillStyle = gold(ix, ix + iw); c.fillRect(ix, y + h * 0.42, iw, h * 0.15);
  // the bullet: a slanted top
  const tx = ix + iw * 0.06, twd = iw * 0.88;
  c.beginPath(); c.moveTo(tx, y + h * 0.43); c.lineTo(tx, y + h * 0.2); c.quadraticCurveTo(tx + twd * 0.1, y + h * 0.07, tx + twd * 0.55, y + h * 0.05);
  c.lineTo(tx + twd, y + h * 0.13); c.lineTo(tx + twd, y + h * 0.43); c.closePath();
  c.fillStyle = lg(c, tx, 0, tx + twd, 0, [[0, shade(o.red, -0.55)], [0.3, o.red], [0.42, shade(o.red, 0.35)], [0.55, o.red], [1, shade(o.red, -0.6)]]); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(tx + twd * 0.1, y + h * 0.16); c.quadraticCurveTo(tx + twd * 0.2, y + h * 0.08, tx + twd * 0.5, y + h * 0.07); c.lineTo(tx + twd * 0.5, y + h * 0.1); c.closePath(); c.fill();
  // the cap, standing beside
  const cx0 = x + w * 0.66, cw = w * 0.3;
  c.fillStyle = gold(cx0, cx0 + cw); c.fillRect(cx0, y + h * 0.5, cw, h * 0.48);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(cx0, y + h * 0.9, cw, h * 0.01);
  c.fillStyle = 'rgba(255,255,255,0.6)'; setFont(c, cw * 0.2, 'Playfair Display', 400); c.textBaseline = 'middle';
  c.save(); c.translate(cx0 + cw / 2, y + h * 0.72); c.rotate(-Math.PI / 2); tdraw(c, o.cap, 0, 0, cw * 0.2, 0.3, 'c'); c.restore();
}

function artPerfume(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.perfume);
  c.fillStyle = rg(c, x + w / 2, y + h * 0.55, 0, w * 0.9, [[0, rgba(o.glow, 0.45)], [0.5, rgba(o.glow, 0.12)], [1, rgba(o.glow, 0)]]);
  c.fillRect(x - w * 0.5, y - h * 0.2, w * 2, h * 1.4);
  const bx = x + w * 0.1, by = y + h * 0.36, bw = w * 0.8, bh = h * 0.6, ch = bw * 0.12;
  const oct = (ix, iy, iw, ih, k) => { c.beginPath(); c.moveTo(ix + k, iy); c.lineTo(ix + iw - k, iy); c.lineTo(ix + iw, iy + k); c.lineTo(ix + iw, iy + ih - k); c.lineTo(ix + iw - k, iy + ih); c.lineTo(ix + k, iy + ih); c.lineTo(ix, iy + ih - k); c.lineTo(ix, iy + k); c.closePath(); };
  // reflection on the floor, kept inside the art box
  c.save(); c.beginPath(); c.rect(x - w, by + bh, w * 3, h * 0.05); c.clip();
  c.globalAlpha = 0.2; c.translate(0, (by + bh) * 2); c.scale(1, -1); oct(bx, by, bw, bh, ch); c.fillStyle = o.liquid; c.fill(); c.restore();
  oct(bx, by, bw, bh, ch);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = w * 0.012; c.stroke();
  const m = bw * 0.07;
  oct(bx + m, by + m + bh * 0.08, bw - 2 * m, bh - 2 * m - bh * 0.08, ch * 0.7);
  c.fillStyle = lg(c, 0, by, 0, by + bh, [[0, shade(o.liquidHex, 0.35, 0.9)], [0.5, rgba(o.liquidHex, 0.92)], [1, shade(o.liquidHex, -0.5, 0.95)]]); c.fill();
  c.fillStyle = lg(c, bx, 0, bx + bw, 0, [[0, 'rgba(255,255,255,0.0)'], [0.12, 'rgba(255,255,255,0.45)'], [0.2, 'rgba(255,255,255,0.0)'], [0.75, 'rgba(255,255,255,0.0)'], [0.85, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
  oct(bx, by, bw, bh, ch); c.fill();
  // label
  c.fillStyle = 'rgba(10,8,6,0.78)'; c.fillRect(bx + bw * 0.22, by + bh * 0.46, bw * 0.56, bh * 0.2);
  c.strokeStyle = o.gold; c.lineWidth = w * 0.004; c.strokeRect(bx + bw * 0.24, by + bh * 0.475, bw * 0.52, bh * 0.17);
  c.fillStyle = o.gold; const z = fit(c, o.name, ['Cormorant Garamond', 600, 'normal', 0.25], bh * 0.07, bw * 0.46); c.textBaseline = 'middle'; tdraw(c, o.name, bx + bw / 2, by + bh * 0.56, z, 0.25, 'c');
  // neck and cap
  c.fillStyle = lg(c, x + w * 0.4, 0, x + w * 0.6, 0, [[0, '#6b4a16'], [0.4, '#fff0bf'], [1, '#6b4a16']]);
  c.fillRect(x + w * 0.42, by - h * 0.05, w * 0.16, h * 0.06);
  const cpx = x + w * 0.28, cpw = w * 0.44;
  c.fillStyle = lg(c, cpx, 0, cpx + cpw, 0, [[0, '#4a320c'], [0.22, '#c79a3e'], [0.4, '#fff4cc'], [0.55, '#d9ac4f'], [1, '#3e2a0a']]);
  oct(cpx, y + h * 0.05, cpw, h * 0.26, cpw * 0.12); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(cpx + cpw * 0.3, y + h * 0.07, cpw * 0.06, h * 0.22);
}

function artCar(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.car);
  const P = (u, v) => [x + u * w, y + v * h];
  const gy = y + h * 0.9;
  // road reflection and shadow
  c.fillStyle = rg(c, x + w * 0.5, gy, 0, w * 0.55, [[0, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
  c.save(); c.translate(x + w * 0.5, gy); c.scale(1, 0.07); c.beginPath(); c.arc(0, 0, w * 0.55, 0, TAU); c.restore(); c.fill();
  const body = () => {
    c.beginPath(); c.moveTo(...P(0.015, 0.66));
    c.bezierCurveTo(...P(0.02, 0.52), ...P(0.12, 0.47), ...P(0.27, 0.44));
    c.bezierCurveTo(...P(0.36, 0.40), ...P(0.42, 0.20), ...P(0.52, 0.18));
    c.bezierCurveTo(...P(0.64, 0.16), ...P(0.74, 0.20), ...P(0.83, 0.34));
    c.bezierCurveTo(...P(0.92, 0.38), ...P(0.985, 0.40), ...P(0.99, 0.52));
    c.lineTo(...P(0.985, 0.74)); c.lineTo(...P(0.88, 0.76));
    c.arc(x + w * 0.79, y + h * 0.76, h * 0.2, 0, Math.PI, true);
    c.lineTo(...P(0.29, 0.76));
    c.arc(x + w * 0.2, y + h * 0.76, h * 0.2, 0, Math.PI, true);
    c.lineTo(...P(0.02, 0.76)); c.closePath();
  };
  body();
  c.fillStyle = lg(c, 0, y + h * 0.15, 0, y + h * 0.8, [[0, shade(o.paint, 0.55)], [0.28, shade(o.paint, 0.1)], [0.5, o.paint], [0.56, shade(o.paint, -0.35)], [1, shade(o.paint, -0.75)]]); c.fill();
  c.save(); body(); c.clip();
  c.fillStyle = lg(c, x, 0, x + w, 0, [[0, 'rgba(255,255,255,0.0)'], [0.35, 'rgba(255,255,255,0.14)'], [0.5, 'rgba(255,255,255,0.0)'], [0.8, 'rgba(255,200,160,0.12)'], [1, 'rgba(0,0,0,0)']]);
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = h * 0.008;
  c.beginPath(); c.moveTo(...P(0.1, 0.52)); c.bezierCurveTo(...P(0.4, 0.49), ...P(0.7, 0.47), ...P(0.97, 0.47)); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = h * 0.006;
  c.beginPath(); c.moveTo(...P(0.45, 0.46)); c.lineTo(...P(0.45, 0.72)); c.moveTo(...P(0.66, 0.44)); c.lineTo(...P(0.66, 0.72)); c.stroke();
  c.restore();
  // the glasshouse
  c.beginPath(); c.moveTo(...P(0.33, 0.43)); c.bezierCurveTo(...P(0.40, 0.30), ...P(0.46, 0.23), ...P(0.53, 0.22));
  c.bezierCurveTo(...P(0.63, 0.21), ...P(0.72, 0.24), ...P(0.79, 0.35)); c.lineTo(...P(0.33, 0.43)); c.closePath();
  c.fillStyle = lg(c, 0, y + h * 0.2, 0, y + h * 0.45, [[0, '#2c3446'], [0.45, '#0e1119'], [1, '#05060a']]); c.fill();
  c.fillStyle = 'rgba(255,190,150,0.20)'; c.beginPath(); c.moveTo(...P(0.43, 0.31)); c.lineTo(...P(0.55, 0.24)); c.lineTo(...P(0.6, 0.24)); c.lineTo(...P(0.47, 0.34)); c.closePath(); c.fill();
  c.fillStyle = o.paint; c.fillRect(...P(0.555, 0.22), w * 0.012, h * 0.2);
  // wheels
  for (const u of [0.2, 0.79]) {
    const wx = x + w * u, wy = y + h * 0.76, R = h * 0.175;
    c.fillStyle = '#07080a'; ell(c, wx, wy, R, R); c.fill();
    c.fillStyle = rg(c, wx - R * 0.2, wy - R * 0.25, 0, R * 0.72, [[0, '#e6e9ee'], [0.5, '#8c929c'], [1, '#2c3036']]); ell(c, wx, wy, R * 0.66, R * 0.66); c.fill();
    c.strokeStyle = '#1b1d22'; c.lineWidth = R * 0.1;
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; c.beginPath(); c.moveTo(wx + Math.cos(a) * R * 0.16, wy + Math.sin(a) * R * 0.16); c.lineTo(wx + Math.cos(a) * R * 0.6, wy + Math.sin(a) * R * 0.6); c.stroke(); }
    c.fillStyle = '#23262c'; ell(c, wx, wy, R * 0.14, R * 0.14); c.fill();
  }
  // lamps: a light bar front and back
  c.save(); c.shadowColor = o.lamp; c.shadowBlur = h * 0.08; c.fillStyle = o.lamp;
  c.beginPath(); c.moveTo(...P(0.02, 0.555)); c.lineTo(...P(0.13, 0.49)); c.lineTo(...P(0.14, 0.51)); c.lineTo(...P(0.025, 0.58)); c.closePath(); c.fill();
  c.shadowColor = '#ff2a2a'; c.fillStyle = '#ff3b30'; c.fillRect(...P(0.93, 0.44), w * 0.06, h * 0.025);
  c.restore();
}

function artPlane(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.plane);
  const P = (u, v) => [x + u * w, y + v * h];
  // the contrail, two streaks fading to the left
  for (const dv of [-0.02, 0.1]) {
    c.fillStyle = lg(c, x - w * 0.6, 0, x + w * 0.35, 0, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.75)']]);
    c.beginPath(); c.moveTo(...P(-0.6, 0.62 + dv)); c.lineTo(...P(0.36, 0.52 + dv)); c.lineTo(...P(0.36, 0.545 + dv)); c.lineTo(...P(-0.6, 0.66 + dv)); c.closePath(); c.fill();
  }
  // far wing
  c.fillStyle = '#b7c2cf'; c.beginPath(); c.moveTo(...P(0.55, 0.42)); c.lineTo(...P(0.42, 0.12)); c.lineTo(...P(0.49, 0.12)); c.lineTo(...P(0.68, 0.42)); c.closePath(); c.fill();
  // fuselage
  c.beginPath(); c.moveTo(...P(0.08, 0.50)); c.bezierCurveTo(...P(0.3, 0.44), ...P(0.8, 0.36), ...P(0.93, 0.36));
  c.bezierCurveTo(...P(1.0, 0.36), ...P(1.0, 0.44), ...P(0.94, 0.47)); c.bezierCurveTo(...P(0.8, 0.52), ...P(0.3, 0.6), ...P(0.1, 0.58)); c.closePath();
  c.fillStyle = lg(c, 0, y + h * 0.36, 0, y + h * 0.6, [[0, '#ffffff'], [0.55, '#e8edf3'], [0.62, o.belly], [1, shade(o.belly, -0.3)]]); c.fill();
  // windows
  c.fillStyle = '#26303c';
  for (let k = 0; k < 26; k++) { const u = 0.3 + k * 0.022; ell(c, ...P(u, 0.465 - (u - 0.3) * 0.13), w * 0.004, h * 0.012); c.fill(); }
  c.fillStyle = '#1b2430'; c.beginPath(); c.moveTo(...P(0.9, 0.39)); c.lineTo(...P(0.955, 0.385)); c.lineTo(...P(0.95, 0.41)); c.lineTo(...P(0.905, 0.41)); c.closePath(); c.fill();
  // tail fin in the brand colour, with the heron mark
  c.beginPath(); c.moveTo(...P(0.1, 0.52)); c.lineTo(...P(0.03, 0.12)); c.lineTo(...P(0.1, 0.12)); c.lineTo(...P(0.25, 0.47)); c.closePath();
  c.fillStyle = lg(c, x, y + h * 0.1, x + w * 0.2, y + h * 0.5, [[0, shade(o.brand, 0.2)], [1, shade(o.brand, -0.3)]]); c.fill();
  c.save(); c.translate(...P(0.1, 0.3)); c.fillStyle = '#ffffff'; markHeron(c, 0, 0, h * 0.13); c.restore();
  // near wing and engine
  c.fillStyle = lg(c, 0, y + h * 0.5, 0, y + h * 0.95, [[0, '#dfe5ec'], [1, '#9aa6b4']]);
  c.beginPath(); c.moveTo(...P(0.5, 0.5)); c.lineTo(...P(0.33, 0.93)); c.lineTo(...P(0.41, 0.93)); c.lineTo(...P(0.68, 0.48)); c.closePath(); c.fill();
  c.fillStyle = lg(c, 0, y + h * 0.6, 0, y + h * 0.72, [[0, '#f4f6f9'], [1, '#7d8896']]);
  rrect(c, ...P(0.47, 0.6), w * 0.1, h * 0.1, h * 0.05); c.fill();
  c.fillStyle = '#2a323c'; ell(c, ...P(0.568, 0.65), w * 0.008, h * 0.045); c.fill();
}

function artBurger(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.burger);
  const cx = x + w / 2, W = w * 0.92;
  shadowUnder(c, cx, y + h * 0.96, W * 0.55, h * 0.04, 0.5);
  const bun = (top) => lg(c, 0, top ? y + h * 0.05 : y + h * 0.78, 0, top ? y + h * 0.45 : y + h * 0.95, [[0, '#f0b35a'], [0.5, '#d0842c'], [1, '#8a4e14']]);
  rrect(c, cx - W * 0.45, y + h * 0.78, W * 0.9, h * 0.17, h * 0.07); c.fillStyle = bun(false); c.fill();
  // patty: two, with a charred edge
  for (const py of [y + h * 0.63, y + h * 0.49]) {
    c.beginPath(); c.moveTo(cx - W * 0.5, py + h * 0.06);
    for (let k = 0; k <= 20; k++) c.lineTo(cx - W * 0.5 + W * k / 20, py + (k % 2 ? 0.0 : h * 0.012));
    for (let k = 20; k >= 0; k--) c.lineTo(cx - W * 0.5 + W * k / 20, py + h * 0.13 + (k % 2 ? h * 0.01 : 0));
    c.closePath(); c.fillStyle = lg(c, 0, py, 0, py + h * 0.13, [[0, '#6b3a1c'], [0.5, '#4a2410'], [1, '#2a1406']]); c.fill();
    for (let k = 0; k < 30; k++) { c.fillStyle = 'rgba(20,8,2,0.45)'; ell(c, cx - W * 0.45 + hs(py, k) * W * 0.9, py + h * (0.03 + hs(py, k + 40) * 0.08), h * 0.01, h * 0.006); c.fill(); }
    // cheese with drips
    c.beginPath(); c.moveTo(cx - W * 0.48, py - h * 0.01); c.lineTo(cx + W * 0.48, py - h * 0.01);
    for (let k = 0; k < 6; k++) { const dx = cx + W * 0.48 - k * W * 0.16; c.lineTo(dx, py + h * 0.02); c.lineTo(dx - W * 0.05, py + h * (0.06 + hs(py, k) * 0.05)); c.lineTo(dx - W * 0.1, py + h * 0.02); }
    c.closePath(); c.fillStyle = lg(c, 0, py - h * 0.02, 0, py + h * 0.1, [[0, '#ffd23a'], [1, '#f39a12']]); c.fill();
  }
  // lettuce and tomato
  c.beginPath(); c.moveTo(cx - W * 0.52, y + h * 0.46);
  for (let k = 0; k <= 16; k++) c.quadraticCurveTo(cx - W * 0.52 + W * (k - 0.5) / 16 * 1.04, y + h * (k % 2 ? 0.52 : 0.40), cx - W * 0.52 + W * k / 16 * 1.04, y + h * 0.46);
  c.lineTo(cx + W * 0.5, y + h * 0.40); c.lineTo(cx - W * 0.5, y + h * 0.40); c.closePath();
  c.fillStyle = lg(c, 0, y + h * 0.38, 0, y + h * 0.52, [[0, '#9be15d'], [1, '#2f8f2a']]); c.fill();
  c.fillStyle = '#e0301e'; rrect(c, cx - W * 0.44, y + h * 0.37, W * 0.88, h * 0.05, h * 0.02); c.fill();
  // top bun: a dome with sesame
  c.beginPath(); c.moveTo(cx - W * 0.48, y + h * 0.38); c.bezierCurveTo(cx - W * 0.5, y + h * 0.02, cx + W * 0.5, y + h * 0.02, cx + W * 0.48, y + h * 0.38); c.closePath();
  c.fillStyle = bun(true); c.fill();
  c.fillStyle = rg(c, cx - W * 0.15, y + h * 0.12, 0, W * 0.4, [[0, 'rgba(255,240,200,0.55)'], [1, 'rgba(255,240,200,0)']]); c.fill();
  for (let k = 0; k < 22; k++) {
    const a = hs(k, 3) * Math.PI, r = hs(k, 9) * 0.9, sx = cx + Math.cos(a) * W * 0.42 * r, sy = y + h * (0.33 - Math.sin(a) * 0.26 * (0.4 + r * 0.6));
    c.fillStyle = '#fff4d6'; ell(c, sx, sy, W * 0.014, W * 0.007, hs(k, 5) * 3); c.fill();
  }
}

function artShades(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.shades);
  const lens = (lx, flip) => {
    c.beginPath();
    const X = (u) => lx + (flip ? -u : u) * w;
    c.moveTo(X(0.0), y + h * 0.18); c.bezierCurveTo(X(0.14), y + h * 0.10, X(0.36), y + h * 0.10, X(0.42), y + h * 0.2);
    c.bezierCurveTo(X(0.45), y + h * 0.5, X(0.38), y + h * 0.9, X(0.22), y + h * 0.92);
    c.bezierCurveTo(X(0.08), y + h * 0.92, X(0.0), y + h * 0.6, X(0.0), y + h * 0.18); c.closePath();
  };
  shadowUnder(c, x + w / 2, y + h * 1.02, w * 0.45, h * 0.05, 0.35);
  for (const [lx, flip] of [[x + w * 0.06, false], [x + w * 0.94, true]]) {
    lens(lx, flip); c.fillStyle = o.frame; c.fill();
    c.save(); c.translate(lx, y + h * 0.5); c.scale(0.9, 0.86); c.translate(-lx, -(y + h * 0.5)); lens(lx + (flip ? -w * 0.021 : w * 0.021), flip);
    c.fillStyle = lg(c, 0, y + h * 0.1, 0, y + h * 0.9, [[0, o.lensTop], [0.55, o.lensMid], [1, o.lensBot]]); c.fill();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(lx, y + h * 0.1); c.lineTo(lx + (flip ? -1 : 1) * w * 0.14, y + h * 0.1); c.lineTo(lx + (flip ? -1 : 1) * w * 0.02, y + h * 0.7); c.lineTo(lx - (flip ? -1 : 1) * w * 0.1, y + h * 0.7); c.closePath(); c.fill();
    c.restore();
  }
  c.strokeStyle = o.frame; c.lineWidth = h * 0.07;
  c.beginPath(); c.moveTo(x + w * 0.44, y + h * 0.24); c.quadraticCurveTo(x + w * 0.5, y + h * 0.14, x + w * 0.56, y + h * 0.24); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x + w * 0.1, y + h * 0.14, w * 0.2, h * 0.02); c.fillRect(x + w * 0.7, y + h * 0.14, w * 0.2, h * 0.02);
}

function artCards(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.cards);
  const cw = w * 0.72, ch = cw / 1.586;
  const card = (cx, cy, rot, g0, g1, face) => {
    c.save(); c.translate(cx, cy); c.rotate(rot);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = cw * 0.08; c.shadowOffsetY = cw * 0.03;
    rrect(c, -cw / 2, -ch / 2, cw, ch, cw * 0.05);
    c.fillStyle = lg(c, -cw / 2, -ch / 2, cw / 2, ch / 2, [[0, g0], [1, g1]]); c.fill(); c.shadowColor = 'transparent';
    c.save(); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = cw * 0.004;
    for (let k = 0; k < 14; k++) { c.beginPath(); c.arc(cw * 0.45, ch * 0.7, cw * (0.2 + k * 0.05), 0, TAU); c.stroke(); }
    c.restore();
    if (face) {
      rrect(c, -cw * 0.38, -ch * 0.12, cw * 0.13, ch * 0.2, cw * 0.015);
      c.fillStyle = lg(c, -cw * 0.38, 0, -cw * 0.25, 0, [[0, '#b58a38'], [0.5, '#ffe7a8'], [1, '#a37a2c']]); c.fill();
      c.strokeStyle = 'rgba(90,60,10,0.6)'; c.lineWidth = cw * 0.003;
      c.beginPath(); c.moveTo(-cw * 0.38, -ch * 0.02); c.lineTo(-cw * 0.25, -ch * 0.02); c.moveTo(-cw * 0.315, -ch * 0.12); c.lineTo(-cw * 0.315, ch * 0.08); c.stroke();
      c.fillStyle = '#ffffff'; markArches(c, cw * 0.32, -ch * 0.3, ch * 0.16);
      setFont(c, ch * 0.085, 'Space Grotesk', 400); c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgba(255,255,255,0.85)'; tdraw(c, '4821  0930  1175  7310'.replace(/\d{4}  /g, (m, i) => (i < 12 ? '••••  ' : m)), -cw * 0.38, ch * 0.26, ch * 0.085, 0.08);
      setFont(c, ch * 0.07, 'Montserrat', 700); tdraw(c, o.cardName, -cw * 0.38, ch * 0.4, ch * 0.07, 0.15);
    }
    c.restore();
  };
  card(x + w * 0.42, y + h * 0.42, -0.2, o.c2a, o.c2b, false);
  card(x + w * 0.58, y + h * 0.58, 0.08, o.c1a, o.c1b, true);
}

function artLantern(c, x, y, w, h, o) {
  [x, y, w, h] = fitBox(x, y, w, h, ART.lantern);
  const cx = x + w / 2;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.fillStyle = rg(c, cx, y + h * 0.56, 0, w * 1.1, [[0, 'rgba(255,190,90,0.55)'], [0.4, 'rgba(255,140,40,0.18)'], [1, 'rgba(255,120,20,0)']]);
  c.fillRect(x - w, y - h * 0.3, w * 3, h * 1.6); c.restore();
  const gold = lg(c, x, 0, x + w, 0, [[0, '#5a3a0c'], [0.3, '#d6a64a'], [0.45, '#fff0c0'], [0.6, '#c89436'], [1, '#4a300a']]);
  c.strokeStyle = gold; c.lineWidth = w * 0.035; ell(c, cx, y + h * 0.05, w * 0.1, h * 0.04); c.stroke();
  c.fillStyle = gold;
  c.beginPath(); c.moveTo(cx - w * 0.12, y + h * 0.1); c.lineTo(cx + w * 0.12, y + h * 0.1); c.lineTo(cx + w * 0.38, y + h * 0.24); c.lineTo(cx - w * 0.38, y + h * 0.24); c.closePath(); c.fill();
  c.fillRect(cx - w * 0.4, y + h * 0.24, w * 0.8, h * 0.035);
  // glass body glowing from the flame
  const gx = cx - w * 0.33, gy = y + h * 0.275, gw = w * 0.66, gh = h * 0.52;
  c.fillStyle = rg(c, cx, gy + gh * 0.6, 0, gw * 0.75, [[0, '#fff6d8'], [0.25, '#ffd27a'], [0.6, '#f08a2a'], [1, '#7a2e08']]);
  c.fillRect(gx, gy, gw, gh);
  c.beginPath(); c.moveTo(cx, gy + gh * 0.28); c.bezierCurveTo(cx + gw * 0.14, gy + gh * 0.5, cx + gw * 0.1, gy + gh * 0.72, cx, gy + gh * 0.74);
  c.bezierCurveTo(cx - gw * 0.1, gy + gh * 0.72, cx - gw * 0.14, gy + gh * 0.5, cx, gy + gh * 0.28); c.fillStyle = 'rgba(255,255,245,0.95)'; c.fill();
  c.fillStyle = gold;
  for (const u of [0, 0.5, 1]) c.fillRect(gx + u * gw - w * 0.02, gy, w * 0.04, gh);
  c.fillRect(cx - w * 0.4, gy + gh, w * 0.8, h * 0.05);
  c.beginPath(); c.moveTo(cx - w * 0.34, gy + gh + h * 0.05); c.lineTo(cx + w * 0.34, gy + gh + h * 0.05); c.lineTo(cx + w * 0.2, gy + gh + h * 0.13); c.lineTo(cx - w * 0.2, gy + gh + h * 0.13); c.closePath(); c.fill();
}

// ---------------------------------------------------------------- marks (logo symbols), each centred at (x, y), size s
function markChevron(c, x, y, s) { for (const o of [-0.22, 0.22]) { c.beginPath(); c.moveTo(x + (o - 0.3) * s, y - 0.45 * s); c.lineTo(x + (o - 0.02) * s, y - 0.45 * s); c.lineTo(x + (o + 0.3) * s, y); c.lineTo(x + (o - 0.02) * s, y + 0.45 * s); c.lineTo(x + (o - 0.3) * s, y + 0.45 * s); c.lineTo(x + (o + 0.0) * s, y); c.closePath(); c.fill(); } }
function markArches(c, x, y, s) {
  c.save(); c.lineWidth = s * 0.16; c.strokeStyle = c.fillStyle;
  c.beginPath(); c.arc(x - s * 0.22, y + s * 0.35, s * 0.42, Math.PI, 0); c.stroke();
  c.beginPath(); c.arc(x + s * 0.22, y + s * 0.35, s * 0.42, Math.PI, 0); c.stroke();
  c.restore();
}
function markHeron(c, x, y, s) {    // a standing bird drawn in three curves, not a real airline's mark
  c.save(); c.lineCap = 'round'; c.strokeStyle = c.fillStyle; c.lineWidth = s * 0.11;
  c.beginPath(); c.moveTo(x - s * 0.1, y + s * 0.5); c.quadraticCurveTo(x - s * 0.35, y, x - s * 0.05, y - s * 0.12);
  c.quadraticCurveTo(x + s * 0.28, y - s * 0.24, x + s * 0.1, y - s * 0.46); c.stroke();
  c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.46); c.lineTo(x + s * 0.42, y - s * 0.42); c.stroke();
  c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.12); c.quadraticCurveTo(x + s * 0.3, y + s * 0.05, x + s * 0.12, y + s * 0.36); c.stroke();
  c.restore();
}
function markPlay(c, x, y, s, col2) {
  rrect(c, x - s / 2, y - s / 2, s, s, s * 0.26); c.fill();
  c.fillStyle = col2; c.beginPath(); c.moveTo(x - s * 0.16, y - s * 0.24); c.lineTo(x + s * 0.26, y); c.lineTo(x - s * 0.16, y + s * 0.24); c.closePath(); c.fill();
}
function markRing(c, x, y, s) { c.save(); c.strokeStyle = c.fillStyle; c.lineWidth = s * 0.1; ell(c, x, y, s * 0.3, s * 0.3); c.stroke(); c.lineWidth = s * 0.06; ell(c, x, y, s * 0.5, s * 0.17, -0.5); c.stroke(); c.restore(); }
function markWave(c, x, y, s) { c.save(); c.strokeStyle = c.fillStyle; c.lineCap = 'round'; for (let k = 0; k < 3; k++) { c.lineWidth = s * 0.1; c.beginPath(); const yy = y - s * 0.25 + k * s * 0.25; c.moveTo(x - s * 0.45, yy); c.bezierCurveTo(x - s * 0.15, yy - s * 0.2, x + s * 0.15, yy + s * 0.2, x + s * 0.45, yy); c.stroke(); } c.restore(); }
function markLeaf(c, x, y, s) { c.beginPath(); c.moveTo(x - s * 0.4, y + s * 0.3); c.quadraticCurveTo(x - s * 0.3, y - s * 0.45, x + s * 0.45, y - s * 0.4); c.quadraticCurveTo(x + s * 0.35, y + s * 0.35, x - s * 0.4, y + s * 0.3); c.fill(); }
function markBolt(c, x, y, s) { c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.5); c.lineTo(x - s * 0.3, y + s * 0.08); c.lineTo(x - s * 0.02, y + s * 0.08); c.lineTo(x - s * 0.12, y + s * 0.5); c.lineTo(x + s * 0.3, y - s * 0.1); c.lineTo(x + s * 0.02, y - s * 0.1); c.closePath(); c.fill(); }
function markStar(c, x, y, s, n = 5) { c.beginPath(); for (let k = 0; k < n * 2; k++) { const a = -Math.PI / 2 + k * Math.PI / n, r = k % 2 ? s * 0.2 : s * 0.5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); }

// ---------------------------------------------------------------- the brands
// logo(c, x, y, h, align, draw) paints the lockup with its cap height about h at (x, y = vertical centre) and returns
// its width; draw = false only measures.
function lockup(markFn, word, F, gap = 0.35, markScale = 1.0, markCol = null) {
  return (c, x, y, h, align = 'l', draw = true, col = null) => {
    setFont(c, h, F[0], F[1], F[2]);
    const ww = tw(c, F[4] ? word.toUpperCase() : word, h, F[3] || 0), ms = markFn ? h * 1.25 * markScale : 0, W = ms + (markFn ? h * gap : 0) + ww;
    if (!draw) return W;
    let x0 = align === 'c' ? x - W / 2 : align === 'r' ? x - W : x;
    const fill = col || c.fillStyle;
    if (markFn) { c.fillStyle = markCol || fill; markFn(c, x0 + ms / 2, y, ms); x0 += ms + h * gap; }
    c.fillStyle = fill; setFont(c, h, F[0], F[1], F[2]); c.textBaseline = 'middle';
    tdraw(c, F[4] ? word.toUpperCase() : word, x0, y + h * 0.04, h, F[3] || 0, 'l');
    return W;
  };
}

// bg(c, x, y, w, h); art(c, x, y, w, h) into a box; a = the art's aspect; head = lines; hf/sf = [fam, weight, style,
// track, upper]; ink = text colour; side = which side the art takes on a wide board
export const BRANDS = [
  { id: 'fizzwell', cat: 'beverage', a: ART.can,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x + w, y + h, [[0, '#0b6b30'], [0.55, '#1f9e45'], [1, '#8ad64a']]); c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, x + w * 0.72, y + h * 0.45, 0, Math.max(w, h) * 0.55, [[0, 'rgba(236,255,170,0.85)'], [0.45, 'rgba(160,230,90,0.25)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 60; k++) { const r = Math.min(w, h) * (0.004 + hs(k, 2) ** 2 * 0.02); c.lineWidth = Math.max(1, r * 0.18); ell(c, x + hs(k, 7) * w, y + hs(k, 11) * h, r, r); c.stroke(); }
    },
    art: (c, x, y, w, h) => artCan(c, x, y, w, h, { body: '#2fae48', band: 'rgba(255,245,120,0.95)', ink: '#ffffff', name: 'Fizzwell', nameF: ['Pacifico', 400, 'normal', 0], small: 'SPARKLING LIME', cold: true, slices: true, sliceRind: '#3f9b2c', slicePulp: '#c9f06a', vertical: true }),
    logo: lockup(markLeaf, 'Fizzwell', ['Pacifico', 400, 'normal', 0], 0.25, 0.8),
    head: ['Crack open', 'the cold.'], hf: ['Montserrat', 900, 'normal', -0.01, false], sub: 'Sparkling lime. Zero sugar.', sf: ['Montserrat', 500, 'normal', 0.01],
    tag: 'ICE COLD AT EVERY DELI COUNTER', ink: '#ffffff', side: 'right' },
  { id: 'elara', cat: 'phone', a: ART.phones,
    bg(c, x, y, w, h) {
      c.fillStyle = '#05050a'; c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, x + w * 0.7, y + h * 0.5, 0, Math.max(w, h) * 0.6, [[0, 'rgba(110,70,255,0.55)'], [0.5, 'rgba(40,90,220,0.18)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, x + w * 0.2, y + h * 1.0, 0, Math.max(w, h) * 0.5, [[0, 'rgba(255,80,160,0.25)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
    },
    art: (c, x, y, w, h) => artPhones(c, x, y, w, h, { back: '#4b3a8c', blobs: [[0.2, 0.3, 0.9, 'rgba(140,60,255,0.9)'], [0.8, 0.55, 0.8, 'rgba(255,80,150,0.8)'], [0.35, 0.85, 0.9, 'rgba(40,140,255,0.9)'], [0.75, 0.15, 0.5, 'rgba(255,170,60,0.6)']] }),
    logo: lockup(markRing, 'elara', ['Montserrat', 300, 'normal', 0.28], 0.4, 0.9),
    head: ['See the night', 'in full colour.'], hf: ['Montserrat', 700, 'normal', -0.01], sub: 'Elara 9 Pro. A night camera that sees what you see.', sf: ['Montserrat', 300, 'normal', 0.01],
    tag: 'AVAILABLE NOW', ink: '#ffffff', side: 'right' },
  { id: 'fleetstep', cat: 'sneaker', a: ART.sneaker,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x + w, y + h, [[0, '#ff4d17'], [1, '#ff9a2e']]); c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(120,20,0,0.16)';
      for (let k = 0; k < 7; k++) { const x0 = x + w * (k * 0.18 - 0.1); c.beginPath(); c.moveTo(x0, y + h); c.lineTo(x0 + w * 0.08, y + h); c.lineTo(x0 + w * 0.32, y); c.lineTo(x0 + w * 0.24, y); c.closePath(); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      for (let k = 0; k < 16; k++) { const yy = y + h * (0.2 + hs(k, 3) * 0.6); c.lineWidth = Math.max(1, h * 0.004); c.beginPath(); c.moveTo(x + w * hs(k, 5) * 0.4, yy); c.lineTo(x + w * (0.25 + hs(k, 8) * 0.3), yy); c.stroke(); }
    },
    art: (c, x, y, w, h) => artSneaker(c, x, y, w, h, { upper: '#15161a', accent: '#f4f1ea', mark: '#ff5a1f', sole: '#2a2a2e', lace: '#ffffff' }),
    logo: lockup(markChevron, 'FLEETSTEP', ['Archivo Black', 400, 'normal', 0.06], 0.3, 0.9),
    head: ['OWN EVERY', 'STREET.'], hf: ['Archivo Black', 400, 'normal', -0.01, true], skew: -0.2, sub: 'The Pace 2. Built for concrete.', sf: ['Montserrat', 700, 'normal', 0.02],
    tag: 'IN STORES AND ONLINE', ink: '#ffffff', side: 'right', artTop: true },
  { id: 'rosaline', cat: 'cosmetics', a: ART.lipstick,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x + w * 0.3, y + h, [[0, '#f8dcd4'], [1, '#e6a79c']]); c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, x + w * 0.5, y + h * 0.3, 0, Math.max(w, h) * 0.7, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 30; k++) { ell(c, x + hs(k, 4) * w, y + hs(k, 9) * h, Math.min(w, h) * 0.004, Math.min(w, h) * 0.004); c.fill(); }
    },
    art: (c, x, y, w, h) => artLipstick(c, x, y, w, h, { red: '#b3122e', cap: 'ROSALINE' }),
    logo: lockup(null, 'ROSALINE', ['Playfair Display', 400, 'normal', 0.32], 0), logoInk: '#5a0a18', sub2: 'NEW YORK',
    head: ['Stay in rouge.'], hf: ['Playfair Display', 400, 'italic', 0], sub: 'Velvet Matte lip colour. Sixteen hours, one coat.', sf: ['Montserrat', 500, 'normal', 0.02],
    tag: 'NEW SHADE  NO. 12 CRIMSON', ink: '#5a0a18', side: 'left' },
  { id: 'noctelle', cat: 'perfume', a: ART.perfume,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x, y + h, [[0, '#07060a'], [1, '#1d1526']]); c.fillRect(x, y, w, h);
      c.save(); c.globalCompositeOperation = 'lighter';
      const ox = x + w * 0.5, oy = y - h * 0.1;
      for (let k = 0; k < 9; k++) { const a = Math.PI * (0.3 + k * 0.05); c.fillStyle = `rgba(255,200,120,${0.035 + hs(k, 2) * 0.04})`; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(a) * h * 2, oy + Math.sin(a) * h * 2); c.lineTo(ox + Math.cos(a + 0.025) * h * 2, oy + Math.sin(a + 0.025) * h * 2); c.closePath(); c.fill(); }
      for (let k = 0; k < 24; k++) { const r = Math.min(w, h) * (0.01 + hs(k, 6) * 0.04); c.fillStyle = rg(c, x + hs(k, 1) * w, y + hs(k, 3) * h, 0, r, [[0, 'rgba(255,210,140,0.18)'], [1, 'rgba(255,210,140,0)']]); c.fillRect(x, y, w, h); }
      c.restore();
    },
    art: (c, x, y, w, h) => artPerfume(c, x, y, w, h, { glow: '#ffb45a', liquidHex: '#e89a3a', liquid: 'rgba(232,154,58,0.8)', gold: '#e2bb6a', name: 'NOCTELLE' }),
    logo: lockup(null, 'NOCTELLE', ['Cormorant Garamond', 600, 'normal', 0.42], 0), logoInk: '#e2bb6a', sub2: 'EAU DE PARFUM',
    head: ['The night, kept.'], hf: ['Cormorant Garamond', 500, 'italic', 0.01], sub: 'A new fragrance for evening.', sf: ['Cormorant Garamond', 400, 'normal', 0.12],
    tag: '', ink: '#f2e2c0', side: 'left' },
  { id: 'orvik', cat: 'car', a: ART.car,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x, y + h, [[0, '#070b1c'], [0.45, '#2b2344'], [0.7, '#c46a44'], [0.74, '#f2a060'], [0.76, '#1a1420'], [1, '#07060a']]); c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, x + w * 0.5, y + h * 0.74, 0, w * 0.5, [[0, 'rgba(255,190,120,0.5)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(255,170,110,0.35)'; c.lineWidth = Math.max(1, h * 0.004);
      for (let k = 0; k < 8; k++) { const yy = y + h * (0.8 + k * 0.025); c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy + h * 0.01); c.stroke(); }
    },
    art: (c, x, y, w, h) => artCar(c, x, y, w, h, { paint: '#9aa6b8', lamp: '#dff4ff' }),
    logo: lockup(null, 'ORVIK', ['Michroma', 400, 'normal', 0.36], 0),
    head: ['Quiet has a', 'new shape.'], hf: ['Montserrat', 300, 'normal', 0.02], sub: 'The all-electric Orvik Aurel. Up to 380 miles on a charge.', sf: ['Montserrat', 500, 'normal', 0.04],
    tag: 'EPA-EST. RANGE. ACTUAL RANGE VARIES.', ink: '#ffffff', side: 'right', artTop: true },
  { id: 'heron', cat: 'airline', a: ART.plane,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x, y + h, [[0, '#0d4fb8'], [0.6, '#4d97e6'], [1, '#bfe0fb']]); c.fillRect(x, y, w, h);
      for (let k = 0; k < 7; k++) {
        const cx = x + w * hs(k, 4), cy = y + h * (0.65 + hs(k, 8) * 0.35), r = Math.min(w, h) * (0.12 + hs(k, 2) * 0.12);
        for (let j = 0; j < 5; j++) { c.fillStyle = 'rgba(255,255,255,0.22)'; ell(c, cx + (j - 2) * r * 0.55, cy - hs(k, j) * r * 0.3, r * 0.6, r * 0.42); c.fill(); }
      }
    },
    art: (c, x, y, w, h) => artPlane(c, x, y, w, h, { belly: '#1c3e7a', brand: '#0f3f8f' }),
    logo: lockup(markHeron, 'HERON AIRWAYS', ['Montserrat', 800, 'normal', 0.1], 0.3, 1.0),
    head: ['Lisbon, nonstop.', 'Every night.'], hf: ['Montserrat', 800, 'normal', -0.01], sub: 'Fares from $389 each way. Lie-flat seats on every overnight.', sf: ['Montserrat', 500, 'normal', 0.01],
    tag: 'FARES INCLUDE TAXES. LIMITED SEATS.', ink: '#ffffff', side: 'right', artTop: true },
  { id: 'stackhouse', cat: 'food', a: ART.burger,
    bg(c, x, y, w, h) {
      c.fillStyle = '#ffc01e'; c.fillRect(x, y, w, h);
      c.save(); c.translate(x + w * 0.7, y + h * 0.5); c.fillStyle = 'rgba(255,230,120,0.55)';
      for (let k = 0; k < 18; k++) { c.rotate(TAU / 18); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.max(w, h), -Math.max(w, h) * 0.09); c.lineTo(Math.max(w, h), Math.max(w, h) * 0.09); c.closePath(); c.fill(); }
      c.restore();
      c.fillStyle = '#d7261e'; c.fillRect(x, y + h * 0.9, w, h * 0.1);
    },
    art: (c, x, y, w, h) => artBurger(c, x, y, w, h, {}),
    logo(c, x, y, h, align = 'l', draw = true) {
      setFont(c, h * 0.8, 'Bungee', 400); const tww = tw(c, 'STACKHOUSE', h * 0.8, 0.02), W = tww + h * 0.9;
      if (!draw) return W;
      const x0 = align === 'c' ? x - W / 2 : align === 'r' ? x - W : x;
      c.fillStyle = '#d7261e'; rrect(c, x0, y - h * 0.62, W, h * 1.24, h * 0.3); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = h * 0.08; rrect(c, x0 + h * 0.12, y - h * 0.5, W - h * 0.24, h, h * 0.22); c.stroke();
      c.fillStyle = '#ffffff'; c.textBaseline = 'middle'; tdraw(c, 'STACKHOUSE', x0 + h * 0.45, y + h * 0.05, h * 0.8, 0.02); return W;
    },
    head: ['STACK IT', 'HIGH.'], hf: ['Bungee', 400, 'normal', 0, true], sub: 'The Triple Stack. Three patties, one legend.', sf: ['Fredoka', 700, 'normal', 0], price: '$6.99',
    tag: 'AT PARTICIPATING LOCATIONS', ink: '#2a1206', side: 'right' },
  { id: 'voltra', cat: 'energy', a: ART.slim,
    bg(c, x, y, w, h) {
      c.fillStyle = '#030404'; c.fillRect(x, y, w, h);
      c.save(); c.strokeStyle = '#9dff2e'; c.shadowColor = '#9dff2e'; c.shadowBlur = Math.min(w, h) * 0.03; c.lineWidth = Math.max(1.5, Math.min(w, h) * 0.006);
      for (let b = 0; b < 3; b++) { let px = x + w * (0.1 + b * 0.35), py = y; c.beginPath(); c.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (hs(b, k) - 0.5) * w * 0.12; py += h / 8; c.lineTo(px, py); } c.globalAlpha = 0.35; c.stroke(); }
      c.restore();
      c.fillStyle = rg(c, x + w * 0.5, y + h * 1.1, 0, w * 0.6, [[0, 'rgba(120,255,40,0.25)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
    },
    art: (c, x, y, w, h) => artSlim(c, x, y, w, h, { glow: '#9dff2e', name: 'VOLTRA' }),
    logo: lockup(markBolt, 'VOLTRA', ['Anton', 400, 'normal', 0.08], 0.2, 1.0), logoInk: '#9dff2e',
    head: ['CHARGE', 'THE NIGHT.'], hf: ['Anton', 400, 'normal', 0.02, true], skew: -0.14, sub: 'Zero sugar. All voltage.', sf: ['Montserrat', 700, 'normal', 0.08],
    tag: 'NOT RECOMMENDED FOR CHILDREN', ink: '#ffffff', side: 'right' },
  { id: 'velle', cat: 'fashion', a: ART.shades,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x, y + h, [[0, '#f4b37e'], [1, '#d4683e']]); c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,236,200,0.65)'; ell(c, x + w * 0.5, y + h * 0.48, Math.min(w, h) * 0.34, Math.min(w, h) * 0.34); c.fill();
      c.fillStyle = 'rgba(120,40,20,0.14)'; c.beginPath(); c.moveTo(x, y + h * 0.78); c.bezierCurveTo(x + w * 0.3, y + h * 0.7, x + w * 0.7, y + h * 0.86, x + w, y + h * 0.76); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
    },
    art: (c, x, y, w, h) => artShades(c, x, y, w, h, { frame: '#2a1a12', lensTop: '#ffb070', lensMid: '#8a3a26', lensBot: '#24100c' }),
    logo: lockup(null, 'VELLE', ['Abril Fatface', 400, 'normal', 0.08], 0), logoInk: '#3a1408',
    head: ['Summer,', 'extended.'], hf: ['Playfair Display', 700, 'italic', 0], sub: 'The new sun collection.', sf: ['Montserrat', 500, 'normal', 0.2, true],
    tag: 'FIFTH AVENUE', ink: '#3a1408', side: 'left', artTop: true },
  { id: 'tallbridge', cat: 'bank', a: ART.cards,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x + w, y + h, [[0, '#06324d'], [1, '#0b5f7d']]); c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = Math.max(1, Math.min(w, h) * 0.004);
      for (let k = -20; k < 40; k++) { c.beginPath(); c.moveTo(x + k * h * 0.08, y + h); c.lineTo(x + k * h * 0.08 + h, y); c.stroke(); }
    },
    art: (c, x, y, w, h) => artCards(c, x, y, w, h, { c1a: '#0c7a8f', c1b: '#07344a', c2a: '#d8b46a', c2b: '#8a6a2a', cardName: 'TALLBRIDGE' }),
    logo: lockup(markArches, 'Tallbridge', ['Montserrat', 700, 'normal', 0.0], 0.35, 1.0),
    head: ['Your money,', 'on your schedule.'], hf: ['Montserrat', 800, 'normal', -0.015], sub: 'Open an account in five minutes. No monthly fees.', sf: ['Montserrat', 500, 'normal', 0.0],
    tag: 'DEPOSITS INSURED UP TO APPLICABLE LIMITS', ink: '#ffffff', side: 'right' },
  { id: 'waveline', cat: 'telecom', a: 1.4,
    bg(c, x, y, w, h) {
      c.fillStyle = lg(c, x, y, x + w, y + h, [[0, '#2a0a5e'], [0.6, '#6a1694'], [1, '#d0237a']]); c.fillRect(x, y, w, h);
    },
    art(c, x, y, w, h) {
      c.save(); c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 14; k++) {
        const yy = y + h * (0.3 + k * 0.03), a = h * (0.12 + k * 0.012);
        c.strokeStyle = lg(c, x, 0, x + w, 0, [[0, 'rgba(90,200,255,0)'], [0.4, `rgba(120,220,255,${0.5 - k * 0.02})`], [1, `rgba(255,120,200,${0.55 - k * 0.02})`]]);
        c.lineWidth = Math.max(1.5, h * 0.008);
        c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy - a, x + w * 0.6, yy + a * 1.2, x + w, yy - a * 0.3); c.stroke();
      }
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.95)'; const z = fit(c, '5G', ['Space Grotesk', 700, 'normal', -0.02], h * 0.5, w * 0.5);
      c.textBaseline = 'middle'; tdraw(c, '5G', x + w * 0.62, y + h * 0.52, z, -0.02, 'c');
    },
    logo: lockup(markWave, 'waveline', ['Space Grotesk', 700, 'normal', -0.01], 0.3, 1.0),
    head: ['Faster in', 'every borough.'], hf: ['Space Grotesk', 700, 'normal', -0.02], sub: 'Unlimited 5G, $35 a month per line with four lines.', sf: ['Space Grotesk', 400, 'normal', 0],
    tag: 'COVERAGE NOT AVAILABLE EVERYWHERE', ink: '#ffffff', side: 'right' },
];

// full-bleed key art (streaming, film, Broadway) has its own layouts
export const POSTERS = [
  { id: 'lighthouse', cat: 'streaming' },
  { id: 'deeporbit', cat: 'film' },
  { id: 'lantern', cat: 'broadway' },
];

// ---------------------------------------------------------------- generic layout
function paintBrand(c, x, y, w, h, B) {
  const A = w / h, S = Math.min(w, h);
  B.bg(c, x, y, w, h);
  const ink = B.ink, m = S * 0.07;
  const head = (lx, ly, maxW, size, align) => {
    c.fillStyle = ink;
    c.save();
    if (B.skew) { c.translate(lx, ly); c.transform(1, 0, B.skew, 1, 0, 0); c.translate(-lx, -ly); }
    c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = size * 0.1;
    const r = lines(c, B.head, B.hf, size, lx, ly, maxW, align, 1.02);
    c.restore();
    return r;
  };
  const subl = (lx, ly, maxW, size, align) => {
    c.fillStyle = ink; c.globalAlpha = 0.92;
    const t = B.sf[4] ? B.sub.toUpperCase() : B.sub;
    const z = fit(c, t, B.sf, size, maxW); c.textBaseline = 'alphabetic'; tdraw(c, t, lx, ly + z * 0.86, z, B.sf[3] || 0, align);
    c.globalAlpha = 1; return z * 1.1;
  };
  const tagl = (lx, ly, maxW, size, align) => {
    if (!B.tag) return;
    c.fillStyle = ink; c.globalAlpha = 0.72;
    const z = fit(c, B.tag, ['Montserrat', 500, 'normal', 0.12], size, maxW); c.textBaseline = 'alphabetic'; tdraw(c, B.tag, lx, ly, z, 0.12, align);
    c.globalAlpha = 1;
  };
  const logo = (lx, ly, lh, align, maxW) => {
    c.fillStyle = B.logoInk || ink;
    let z = lh; while (z > 4 && B.logo(c, lx, ly, z, align, false) > maxW) z *= 0.92;
    const W0 = B.logo(c, lx, ly, z, align, true);
    if (B.sub2) { c.fillStyle = B.logoInk || ink; setFont(c, z * 0.3, 'Montserrat', 500); c.textBaseline = 'middle';
      const ax = align === 'c' ? lx : align === 'r' ? lx - W0 / 2 : lx + W0 / 2; tdraw(c, B.sub2, ax, ly + z * 0.95, z * 0.3, 0.5, 'c'); }
    return W0;
  };
  const price = (px, py, r) => {
    if (!B.price) return;
    c.fillStyle = '#d7261e'; markStar(c, px, py, r * 2.3, 14); c.fillStyle = '#ffffff';
    const z = fit(c, B.price, ['Bungee', 400, 'normal', 0], r * 0.62, r * 1.4); c.textBaseline = 'middle'; tdraw(c, B.price, px, py + z * 0.05, z, 0, 'c');
  };
  if (A >= 4.5) {
    // RIBBON: the mark, the line and the product in one row
    const ah = h * 0.9, aw = Math.min(w * 0.22, ah * B.a);
    const ax = B.side === 'left' ? x + m : x + w - aw - m;
    B.art(c, ax, y + (h - ah) / 2, aw, ah);
    const tx0 = B.side === 'left' ? ax + aw + m : x + m, tx1 = B.side === 'left' ? x + w - m : ax - m;
    const lw = logo(tx0, y + h * 0.5, h * 0.24, 'l', (tx1 - tx0) * 0.3);
    c.fillStyle = ink; const line = B.head.join(' ');
    const z = fit(c, B.hf[4] ? line.toUpperCase() : line, B.hf, h * 0.3, (tx1 - tx0) - lw - m * 2);
    c.textBaseline = 'middle'; tdraw(c, B.hf[4] ? line.toUpperCase() : line, tx1, y + h * 0.47, z, B.hf[3] || 0, 'r');
    return;
  }
  if (A >= 1.6) {
    // WIDE: the art takes one side; logo, headline, subline stacked on the other. A wide product (a car, a plane, a
    // shoe) gets more of the width, because at its own aspect it would otherwise be a strip across the middle.
    const ah = h - m * 1.6, aw = Math.min(w * (A > 3 ? 0.42 : B.a > 1.5 ? 0.56 : 0.5), ah * B.a * 1.05);
    const artLeft = B.side === 'left';
    const ax = artLeft ? x + m * 0.6 : x + w - aw - m * 0.6;
    B.art(c, ax, y + (h - ah) / 2, aw, ah);
    const tx0 = artLeft ? ax + aw + m : x + m * 1.2, tx1 = artLeft ? x + w - m * 1.2 : ax - m * 0.8, cw = tx1 - tx0;
    const hs0 = Math.min(h * (A > 3 ? 0.17 : 0.13), cw * 0.16);
    const [hh] = lines(c, B.head, B.hf, hs0, tx0, 0, cw, 'l', 1.02, false);
    const lh = h * 0.085, block = lh * 1.6 + hh + h * 0.03 + h * 0.06;
    let ty = y + (h - block) / 2;
    logo(tx0, ty + lh * 0.5, lh, 'l', cw * 0.7); ty += lh * 1.6;
    head(tx0, ty, cw, hs0, 'l'); ty += hh + h * 0.03;
    subl(tx0, ty, cw, h * 0.048, 'l');
    tagl(tx0, y + h - m * 0.55, cw, h * 0.028, 'l');
    if (B.price) price(artLeft ? ax + aw * 0.12 : ax + aw * 0.86, y + h * 0.24, h * 0.13);
    return;
  }
  // TOP (square, poster and mid formats): art above, type below, logo at the foot
  const tall = A < 0.9;
  const lh = h * (tall ? 0.05 : 0.065);
  const artH = h * (tall ? 0.44 : A > 1.25 ? 0.5 : 0.46), artW = w - m * 2;
  const artY = y + h * (tall ? 0.15 : 0.08);
  B.art(c, x + m, artY, artW, artH);
  if (tall) logo(x + w / 2, y + h * 0.075, lh, 'c', w - m * 2);
  let ty = artY + artH + h * 0.035;
  const hs0 = Math.min(h * (tall ? 0.07 : 0.085), w * 0.13);
  const [hh] = head(x + w / 2, ty, w - m * 2, hs0, 'c'); ty += hh + h * 0.02;
  subl(x + w / 2, ty, w - m * 2.4, h * (tall ? 0.028 : 0.036), 'c');
  if (!tall) logo(x + w / 2, y + h - m * 0.95 - lh * 0.4, lh, 'c', w - m * 2);
  tagl(x + w / 2, y + h - m * 0.35, w - m * 2, h * 0.02, 'c');
  if (B.price) price(x + w * 0.8, artY + artH * 0.18, Math.min(w, h) * 0.1);
}

// ---------------------------------------------------------------- the three key-art posters
function paintLighthouse(c, x, y, w, h) {
  const A = w / h, S = Math.min(w, h);
  c.fillStyle = lg(c, x, y, x, y + h, [[0, '#050b16'], [0.45, '#14314a'], [0.66, '#c7713c'], [0.7, '#f0a55a'], [0.72, '#29323c'], [1, '#05080c']]); c.fillRect(x, y, w, h);
  stars(c, x, y, w, h * 0.45, 160, 4.4, 0.8);
  // storm clouds
  for (let k = 0; k < 9; k++) { c.fillStyle = `rgba(8,14,24,${0.35 + hs(k, 3) * 0.3})`; ell(c, x + w * hs(k, 5), y + h * (0.12 + hs(k, 9) * 0.35), w * (0.2 + hs(k, 2) * 0.25), h * (0.04 + hs(k, 7) * 0.05)); c.fill(); }
  const lx = x + w * (A > 1.3 ? 0.72 : 0.62), base = y + h * (A > 1.3 ? 0.72 : 0.8), th = h * (A > 1.3 ? 0.36 : 0.28), tw0 = S * 0.06;
  // beam
  c.save(); c.globalCompositeOperation = 'lighter';
  c.fillStyle = lg(c, lx, 0, lx - w * 0.8, 0, [[0, 'rgba(255,236,190,0.55)'], [1, 'rgba(255,236,190,0)']]);
  c.beginPath(); c.moveTo(lx, base - th * 1.02); c.lineTo(lx - w * 0.9, base - th * 1.35); c.lineTo(lx - w * 0.9, base - th * 0.7); c.closePath(); c.fill();
  c.fillStyle = rg(c, lx, base - th * 1.02, 0, S * 0.12, [[0, 'rgba(255,245,210,0.95)'], [1, 'rgba(255,220,150,0)']]); c.fillRect(lx - S * 0.2, base - th * 1.02 - S * 0.2, S * 0.4, S * 0.4);
  c.restore();
  // rocks, tower, lantern room
  c.fillStyle = '#05070a';
  c.beginPath(); c.moveTo(lx - S * 0.35, base + h * 0.04); c.lineTo(lx - S * 0.18, base - h * 0.02); c.lineTo(lx - S * 0.05, base - h * 0.035); c.lineTo(lx + S * 0.12, base - h * 0.02); c.lineTo(lx + S * 0.4, base + h * 0.05); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(lx - tw0, base - h * 0.03); c.lineTo(lx - tw0 * 0.62, base - th); c.lineTo(lx + tw0 * 0.62, base - th); c.lineTo(lx + tw0, base - h * 0.03); c.closePath(); c.fillStyle = '#0a0d12'; c.fill();
  c.fillStyle = 'rgba(120,40,30,0.55)'; for (let k = 1; k < 4; k++) { const f = k / 4; c.fillRect(lx - tw0 * (1 - f * 0.38), base - h * 0.03 - th * f, tw0 * 2 * (1 - f * 0.38), th * 0.05); }
  c.fillStyle = '#fff2c8'; c.fillRect(lx - tw0 * 0.5, base - th * 1.07, tw0, th * 0.07);
  c.fillStyle = '#0a0d12'; c.beginPath(); c.moveTo(lx - tw0 * 0.7, base - th * 1.07); c.lineTo(lx, base - th * 1.16); c.lineTo(lx + tw0 * 0.7, base - th * 1.07); c.closePath(); c.fill();
  // sea
  for (let k = 0; k < 7; k++) {
    const yy = base + h * (0.01 + k * 0.04);
    c.fillStyle = `rgba(${6 + k * 2},${14 + k * 3},${24 + k * 3},0.92)`;
    c.beginPath(); c.moveTo(x, yy);
    for (let j = 0; j <= 24; j++) c.lineTo(x + w * j / 24, yy + Math.sin(j * 1.7 + k * 2.1) * h * 0.008);
    c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(240,170,110,0.18)'; c.lineWidth = 1; c.stroke();
  }
  // title block
  const cx = A > 1.3 ? x + w * 0.3 : x + w / 2, al = 'c', cw = A > 1.3 ? w * 0.5 : w * 0.86;
  const ty = A > 1.3 ? y + h * 0.3 : y + h * 0.08;
  c.fillStyle = 'rgba(255,255,255,0.85)'; setFont(c, S * 0.035, 'Montserrat', 600); c.textBaseline = 'alphabetic';
  let z = fit(c, 'A REELHOUSE ORIGINAL SERIES', ['Montserrat', 600, 'normal', 0.3], S * 0.032, cw); tdraw(c, 'A REELHOUSE ORIGINAL SERIES', cx, ty, z, 0.3, al);
  c.fillStyle = '#f4efe6'; c.shadowColor = 'rgba(255,180,120,0.45)'; c.shadowBlur = S * 0.03;
  const [th2] = lines(c, ['THE LAST', 'LIGHTHOUSE'], ['Bebas Neue', 400, 'normal', 0.06], S * (A > 1.3 ? 0.2 : 0.16), cx, ty + S * 0.02, cw, al, 0.92);
  c.shadowBlur = 0;
  c.fillStyle = '#f0a55a'; z = fit(c, 'NEW SEASON OCTOBER 12', ['Montserrat', 700, 'normal', 0.28], S * 0.036, cw);
  tdraw(c, 'NEW SEASON OCTOBER 12', cx, ty + S * 0.02 + th2 + S * 0.05, z, 0.28, al);
  // the service mark, bottom right
  const lh = S * 0.06, lx2 = x + w - S * 0.05;
  c.fillStyle = '#ffffff'; setFont(c, lh, 'Righteous', 400); const wordW = tw(c, 'reelhouse', lh, 0);
  c.textBaseline = 'middle'; tdraw(c, 'reelhouse', lx2 - lh * 1.1, y + h - S * 0.07, lh, 0, 'r');
  c.fillStyle = '#e8203c'; markPlay(c, lx2 - lh * 0.45, y + h - S * 0.07, lh * 0.9, '#ffffff');
  c.fillStyle = 'rgba(255,255,255,0.0)'; void wordW;
}

function paintDeepOrbit(c, x, y, w, h) {
  const A = w / h, S = Math.min(w, h);
  c.fillStyle = '#020306'; c.fillRect(x, y, w, h);
  stars(c, x, y, w, h, 420, 9.1);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [nx, ny, nr, col] of [[0.25, 0.3, 0.5, 'rgba(60,40,140,0.35)'], [0.7, 0.2, 0.4, 'rgba(20,90,160,0.28)'], [0.5, 0.6, 0.35, 'rgba(160,50,90,0.18)']]) { c.fillStyle = rg(c, x + w * nx, y + h * ny, 0, S * nr * 1.4, [[0, col], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h); }
  c.restore();
  // the planet, rising from the bottom edge
  const px = x + w * (A > 1.3 ? 0.62 : 0.5), py = y + h * 1.25, pr = Math.max(w, h) * (A > 1.3 ? 0.62 : 0.72);
  c.fillStyle = rg(c, px - pr * 0.3, py - pr * 0.6, pr * 0.1, pr * 1.1, [[0, '#6fb2ff'], [0.35, '#1e4f96'], [0.75, '#081c3c'], [1, '#02060e']]);
  ell(c, px, py, pr, pr); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(120,200,255,0.55)'; c.lineWidth = S * 0.012; c.shadowColor = '#7ac8ff'; c.shadowBlur = S * 0.05;
  c.beginPath(); c.arc(px, py, pr, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.restore();
  // the astronaut: a small silhouette against the rim
  const ax = x + w * (A > 1.3 ? 0.66 : 0.52), ay = y + h * (A > 1.3 ? 0.4 : 0.48), as = S * 0.09;
  c.save(); c.translate(ax, ay); c.rotate(-0.35);
  c.fillStyle = '#0c0f16';
  rrect(c, -as * 0.42, -as * 0.2, as * 0.84, as * 1.0, as * 0.25); c.fill();
  ell(c, 0, -as * 0.45, as * 0.36, as * 0.36); c.fill();
  c.fillStyle = lg(c, -as * 0.3, -as * 0.7, as * 0.3, -as * 0.2, [[0, '#ffd28a'], [0.5, '#a35a2a'], [1, '#1a0c06']]); ell(c, as * 0.05, -as * 0.45, as * 0.24, as * 0.2); c.fill();
  c.fillStyle = '#0c0f16'; rrect(c, -as * 0.62, -as * 0.1, as * 0.2, as * 0.62, as * 0.1); c.fill(); rrect(c, as * 0.42, -as * 0.18, as * 0.2, as * 0.55, as * 0.1); c.fill();
  rrect(c, -as * 0.36, as * 0.72, as * 0.26, as * 0.6, as * 0.1); c.fill(); rrect(c, as * 0.08, as * 0.72, as * 0.26, as * 0.55, as * 0.1); c.fill();
  c.restore();
  // lens flare
  c.save(); c.globalCompositeOperation = 'lighter';
  c.fillStyle = rg(c, x + w * 0.18, y + h * 0.16, 0, S * 0.18, [[0, 'rgba(255,255,255,0.9)'], [0.1, 'rgba(180,220,255,0.35)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(160,210,255,0.35)'; c.fillRect(x, y + h * 0.16 - S * 0.002, w, S * 0.004);
  c.restore();
  // title with a steel gradient
  const cx = A > 1.3 ? x + w * 0.3 : x + w / 2, cw = A > 1.3 ? w * 0.52 : w * 0.86, ty = A > 1.3 ? y + h * 0.42 : y + h * 0.66;
  c.fillStyle = 'rgba(210,225,255,0.85)';
  let z = fit(c, 'NO SIGNAL. NO WAY BACK.', ['Montserrat', 500, 'normal', 0.4], S * 0.03, cw); c.textBaseline = 'alphabetic'; tdraw(c, 'NO SIGNAL. NO WAY BACK.', cx, ty - S * 0.05, z, 0.4, 'c');
  z = fit(c, 'THE DEEP ORBIT', ['Anton', 400, 'normal', 0.14], S * 0.15, cw);
  c.fillStyle = lg(c, 0, ty, 0, ty + z, [[0, '#ffffff'], [0.62, '#e4eaf4'], [1, '#aab6ca']]);
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = S * 0.012;
  tdraw(c, 'THE DEEP ORBIT', cx, ty + z * 0.88, z, 0.14, 'c'); c.shadowBlur = 0;
  c.fillStyle = '#ffffff'; const z2 = fit(c, 'IN THEATRES NOVEMBER 14', ['Montserrat', 700, 'normal', 0.3], S * 0.035, cw);
  tdraw(c, 'IN THEATRES NOVEMBER 14', cx, ty + z * 1.0 + S * 0.06, z2, 0.3, 'c');
  // the billing block: condensed credits, the thing every film poster carries
  c.fillStyle = 'rgba(200,210,230,0.55)'; const by = A > 1.3 ? y + h - S * 0.07 : y + h - S * 0.05;
  const bill = 'HALDEN PICTURES PRESENTS A NORTHLIGHT PRODUCTION  A FILM BY MARA ELLISON  THE DEEP ORBIT  MUSIC BY TOBIAS REN  EDITED BY JUNE OKORO  DIRECTOR OF PHOTOGRAPHY IAN VOSS  WRITTEN AND DIRECTED BY MARA ELLISON';
  const zb = fit(c, bill, ['Oswald', 400, 'normal', 0.02], S * 0.018, (A > 1.3 ? w * 0.6 : w * 0.9));
  tdraw(c, bill, A > 1.3 ? x + w * 0.35 : x + w / 2, by, zb, 0.02, 'c');
}

function paintLantern(c, x, y, w, h) {
  const A = w / h, S = Math.min(w, h);
  c.fillStyle = rg(c, x + w * 0.5, y + h * 0.4, 0, Math.max(w, h) * 0.8, [[0, '#6a0f1c'], [0.6, '#2c040a'], [1, '#120104']]); c.fillRect(x, y, w, h);
  // curtain drapes
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const x0 = side < 0 ? x + k * S * 0.04 : x + w - (k + 1) * S * 0.04, ww = S * 0.04;
      c.fillStyle = lg(c, x0, 0, x0 + ww, 0, [[0, '#3a040c'], [0.5, '#9a1628'], [1, '#3a040c']]);
      c.fillRect(x0, y, ww, h * (0.95 - k * 0.02));
    }
  }
  c.fillStyle = lg(c, 0, y, 0, y + h * 0.1, [[0, '#8a1224'], [1, '#4a060e']]);
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h * 0.06);
  for (let k = 12; k >= 0; k--) c.quadraticCurveTo(x + w * (k + 0.5) / 12, y + h * 0.12, x + w * k / 12, y + h * 0.06);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(230,180,90,0.9)'; c.fillRect(x, y + h * 0.055, w, S * 0.006);
  // spotlight
  c.save(); c.globalCompositeOperation = 'lighter';
  c.fillStyle = lg(c, 0, y, 0, y + h, [[0, 'rgba(255,220,160,0.10)'], [1, 'rgba(255,220,160,0.0)']]);
  const lxc = A > 1.3 ? x + w * 0.7 : x + w / 2;
  c.beginPath(); c.moveTo(lxc - S * 0.05, y); c.lineTo(lxc + S * 0.05, y); c.lineTo(lxc + S * 0.35, y + h); c.lineTo(lxc - S * 0.35, y + h); c.closePath(); c.fill();
  c.restore();
  if (A > 1.3) artLantern(c, lxc - S * 0.28, y + h * 0.14, S * 0.56, h * 0.8, {});
  else artLantern(c, x + w * 0.3, y + h * 0.16, w * 0.4, h * 0.36, {});
  // title
  const cx = A > 1.3 ? x + w * 0.33 : x + w / 2, cw = A > 1.3 ? w * 0.5 : w * 0.82;
  let ty = A > 1.3 ? y + h * 0.26 : y + h * 0.56;
  c.fillStyle = '#f0d9a0'; let z = fit(c, 'THE NEW MUSICAL', ['Montserrat', 600, 'normal', 0.45], S * 0.03, cw); c.textBaseline = 'alphabetic';
  tdraw(c, 'THE NEW MUSICAL', cx, ty, z, 0.45, 'c'); ty += S * 0.03;
  z = fit(c, 'Lantern', ['Limelight', 400, 'normal', 0.02], S * 0.19, cw);
  c.fillStyle = lg(c, 0, ty, 0, ty + z, [[0, '#fff4c8'], [0.45, '#e2b050'], [0.55, '#b07a22'], [1, '#f6d58a']]);
  c.shadowColor = 'rgba(255,180,60,0.5)'; c.shadowBlur = S * 0.025; tdraw(c, 'Lantern', cx, ty + z * 0.82, z, 0.02, 'c'); c.shadowBlur = 0;
  ty += z * 1.0 + S * 0.03;
  c.fillStyle = '#f0d9a0'; for (let k = 0; k < 5; k++) markStar(c, cx + (k - 2) * S * 0.045, ty, S * 0.04);
  ty += S * 0.06;
  c.fillStyle = '#ffffff'; z = fit(c, '“Radiant from the first note.”', ['Playfair Display', 400, 'italic', 0], S * 0.04, cw); tdraw(c, '“Radiant from the first note.”', cx, ty, z, 0, 'c');
  ty += S * 0.04;
  c.fillStyle = 'rgba(240,217,160,0.85)'; z = fit(c, 'STAGE & SCREEN WEEKLY', ['Montserrat', 500, 'normal', 0.3], S * 0.02, cw); tdraw(c, 'STAGE & SCREEN WEEKLY', cx, ty, z, 0.3, 'c');
  c.fillStyle = '#f0d9a0'; z = fit(c, 'KESTREL THEATRE  BROADWAY', ['Montserrat', 700, 'normal', 0.3], S * 0.028, w * 0.8);
  tdraw(c, 'KESTREL THEATRE  BROADWAY', A > 1.3 ? cx : x + w / 2, y + h - S * 0.05, z, 0.3, 'c');
}

// ---------------------------------------------------------------- tickers (the long strips)
function paintTicker(c, x, y, w, h, kind) {
  // The cell holds ONE long run folded into two rows (the first half of the run on top, the second below), and the
  // strip's shader unfolds, repeats and scrolls it (billboards.js), so a 40 m zipper shows 1.7 runs, not three copies
  // of one quote. The run wraps: whole items only, the spare length shared out between the gaps, and an item that
  // crosses the fold drawn in both rows.
  const hr = h / 2, L = 2 * w, z = hr * 0.5, items = [];
  for (const ry of [y, y + hr]) {
    c.fillStyle = kind ? '#050814' : '#060606'; c.fillRect(x, ry, w, hr);
    c.fillStyle = kind ? '#0b2a6a' : '#141414'; c.fillRect(x, ry, w, hr * 0.12); c.fillRect(x, ry + hr * 0.88, w, hr * 0.12);
  }
  c.textBaseline = 'middle';
  if (!kind) {
    const Q = [['TLBG', '142.18', 1.2], ['ORVK', '88.40', -0.4], ['ELRA', '231.05', 2.1], ['HRNA', '47.92', 0.3], ['FLST', '63.10', -1.1], ['FZWL', '19.84', 0.8], ['WVLN', '112.66', 1.6], ['RLHS', '305.12', -0.7], ['NCTL', '58.03', 0.2], ['SKHS', '26.47', 1.0]];
    for (const [s, p, d] of Q) {
      setFont(c, z, 'Oswald', 700); const a = tw(c, s, z, 0.04); setFont(c, z, 'Oswald', 400); const b = tw(c, p, z, 0.02);
      setFont(c, z, 'Oswald', 600); const e = tw(c, `${Math.abs(d).toFixed(1)}%`, z, 0.02);
      items.push({ w: a + hr * 0.25 + b + hr * 0.2 + hr * 0.32 + e, draw(px, cy) {
        setFont(c, z, 'Oswald', 700); c.fillStyle = '#ffffff'; px += tdraw(c, s, px, cy, z, 0.04) + hr * 0.25;
        setFont(c, z, 'Oswald', 400); c.fillStyle = '#d8dce6'; px += tdraw(c, p, px, cy, z, 0.02) + hr * 0.2;
        c.fillStyle = d >= 0 ? '#29d36a' : '#ff4a3a';
        c.beginPath(); if (d >= 0) { c.moveTo(px, cy + hr * 0.12); c.lineTo(px + hr * 0.22, cy + hr * 0.12); c.lineTo(px + hr * 0.11, cy - hr * 0.12); } else { c.moveTo(px, cy - hr * 0.12); c.lineTo(px + hr * 0.22, cy - hr * 0.12); c.lineTo(px + hr * 0.11, cy + hr * 0.12); } c.closePath(); c.fill();
        px += hr * 0.32; setFont(c, z, 'Oswald', 600); tdraw(c, `${Math.abs(d).toFixed(1)}%`, px, cy, z, 0.02);
      } });
    }
  } else {
    const N = ['WEATHER TONIGHT: CLEAR, LOW OF 58', 'SUBWAY: GOOD SERVICE ON MOST LINES', 'KESTREL THEATRE: LANTERN ADDS A SUNDAY MATINEE', 'MARATHON ROAD CLOSURES BEGIN SATURDAY'];
    for (const s of N) {
      setFont(c, z, 'Oswald', 700); const a = tw(c, 'NYC', z, 0.06); setFont(c, z, 'Oswald', 400); const b = tw(c, s, z, 0.04);
      items.push({ w: a + hr * 0.35 + b, draw(px, cy) {
        c.fillStyle = '#ffcc33'; setFont(c, z, 'Oswald', 700); px += tdraw(c, 'NYC', px, cy, z, 0.06) + hr * 0.35;
        c.fillStyle = '#ffffff'; setFont(c, z, 'Oswald', 400); tdraw(c, s, px, cy, z, 0.04);
      } });
    }
  }
  const gap0 = hr * (kind ? 1.4 : 1.0);
  let n = 0, used = 0;
  while (n < 64 && used + items[n % items.length].w + gap0 <= L) { used += items[n % items.length].w + gap0; n++; }
  n = Math.max(1, n);
  const gap = gap0 + Math.max(0, L - used) / n;
  let q = gap / 2;
  for (let r = 0; r < n; r++) {
    const it = items[r % items.length];
    for (const [row, off] of [[0, 0], [1, w]]) {
      if (q + it.w < off || q > off + w) continue;          // not in this row
      c.save(); c.beginPath(); c.rect(x, y + row * hr, w, hr); c.clip();
      it.draw(x + q - off, y + row * hr + hr * 0.5);
      c.restore();
    }
    q += it.w + gap;
  }
}

// ---------------------------------------------------------------- the public painter
// Designs by index: 0..BRANDS-1 are the product brands, then the posters, then the two tickers.
export const AD_COUNT = BRANDS.length + POSTERS.length + 2;
export function adId(i) { const k = ((i % AD_COUNT) + AD_COUNT) % AD_COUNT; return k < BRANDS.length ? BRANDS[k].id : k < BRANDS.length + POSTERS.length ? POSTERS[k - BRANDS.length].id : (k === AD_COUNT - 2 ? 'ticker' : 'news'); }
// which designs suit a cell of aspect A (w/h): the key-art posters need at least a square-ish or wide field, the
// tickers are only for strips
export function adsFor(A) {
  const out = [];
  for (let k = 0; k < AD_COUNT; k++) {
    const id = adId(k);
    if (id === 'ticker' || id === 'news') { if (A >= 5) out.push(k); continue; }
    if (A >= 5) { if (k < BRANDS.length) out.push(k); continue; }
    out.push(k);
  }
  return out;
}
export function paintAd(c, x, y, w, h, i) {
  const k = ((i % AD_COUNT) + AD_COUNT) % AD_COUNT;
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  if (k < BRANDS.length) paintBrand(c, x, y, w, h, BRANDS[k]);
  else if (k === BRANDS.length) paintLighthouse(c, x, y, w, h);
  else if (k === BRANDS.length + 1) paintDeepOrbit(c, x, y, w, h);
  else if (k === BRANDS.length + 2) paintLantern(c, x, y, w, h);
  else paintTicker(c, x, y, w, h, k === AD_COUNT - 1 ? 1 : 0);
  c.restore();
}
