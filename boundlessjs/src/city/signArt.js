// TA31 storefront signs: the lettering zone of a shop sign, painted with canvas 2D (shopSigns.js boxes and the
// fasciaAtlas.js band both draw from here).
//
// Owner 2026-09-28: "I don't want to see big letters in shops". The round-10 signs set one trade word in 700-weight
// Arial Narrow across 90 % of the cell and 54 % of its height, and the box then squeezed that 8:1 cell onto a
// 2.7-9.3:1 box. A real fascia is a panel with a mark and a name in the shop's own letterform, the name about half the
// panel's height (0.3-0.6 m on a 0.8-1.1 m sign) and well short of its ends, often with a small second line. That is
// what paintSign draws; the panel beyond the lettering zone is plain ground, so a sign longer than its lettering zone
// is extended with that ground instead of stretching the letters (shopSigns.js).
//
// Every shop name here is invented or generic ("MIDTOWN PHARMACY", "SANTIAGO'S BARBER SHOP"); no real chain's name,
// colours or mark. Pure canvas code (no three.js) so a node canvas can preview it.
import { hs, rrect, setFont, tw, tdraw, fit, shade, rgba } from './adArt.js';

const TAU = Math.PI * 2;
function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); }

// ---- marks, drawn in the current fillStyle / strokeStyle, centred at (x, y), size s (about the badge diameter)
const MARKS = {
  cup(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.12); c.lineTo(x + s * 0.2, y - s * 0.12); c.lineTo(x + s * 0.14, y + s * 0.28); c.lineTo(x - s * 0.24, y + s * 0.28); c.closePath(); c.fill();
    c.lineWidth = s * 0.07; c.beginPath(); c.arc(x + s * 0.22, y + s * 0.04, s * 0.1, -1.4, 1.4); c.stroke();
    c.lineWidth = s * 0.05; for (const dx of [-0.12, 0.02]) { c.beginPath(); c.moveTo(x + dx * s, y - s * 0.2); c.quadraticCurveTo(x + (dx + 0.06) * s, y - s * 0.3, x + dx * s, y - s * 0.4); c.stroke(); }
  },
  slice(c, x, y, s) {
    c.beginPath(); c.moveTo(x - s * 0.32, y - s * 0.28); c.quadraticCurveTo(x, y - s * 0.4, x + s * 0.32, y - s * 0.28); c.lineTo(x, y + s * 0.38); c.closePath(); c.fill();
    const f = c.fillStyle; c.fillStyle = 'rgba(0,0,0,0.35)'; for (const [dx, dy] of [[-0.12, -0.15], [0.1, -0.12], [0, 0.08]]) { ell(c, x + dx * s, y + dy * s, s * 0.055, s * 0.055); c.fill(); } c.fillStyle = f;
  },
  cross(c, x, y, s) { const a = s * 0.13, b = s * 0.36; c.fillRect(x - a, y - b, a * 2, b * 2); c.fillRect(x - b, y - a, b * 2, a * 2); },
  pole(c, x, y, s) {
    rrect(c, x - s * 0.12, y - s * 0.4, s * 0.24, s * 0.8, s * 0.1); c.fill();
    const f = c.fillStyle; c.save(); rrect(c, x - s * 0.12, y - s * 0.4, s * 0.24, s * 0.8, s * 0.1); c.clip();
    c.fillStyle = '#d4202a'; for (let k = -4; k < 5; k++) { c.beginPath(); c.moveTo(x - s * 0.2, y + k * s * 0.16); c.lineTo(x + s * 0.2, y + k * s * 0.16 - s * 0.14); c.lineTo(x + s * 0.2, y + k * s * 0.16 - s * 0.08); c.lineTo(x - s * 0.2, y + k * s * 0.16 + s * 0.06); c.closePath(); c.fill(); }
    c.restore(); c.fillStyle = f;
  },
  scissors(c, x, y, s) {
    c.lineWidth = s * 0.07;
    for (const sg of [-1, 1]) { ell(c, x - s * 0.22, y + sg * s * 0.16, s * 0.1, s * 0.1); c.stroke(); c.beginPath(); c.moveTo(x - s * 0.13, y + sg * s * 0.12); c.lineTo(x + s * 0.34, y - sg * s * 0.12); c.stroke(); }
  },
  key(c, x, y, s) { c.lineWidth = s * 0.08; ell(c, x - s * 0.2, y, s * 0.14, s * 0.14); c.stroke(); c.fillRect(x - s * 0.06, y - s * 0.04, s * 0.42, s * 0.08); c.fillRect(x + s * 0.22, y, s * 0.06, s * 0.14); c.fillRect(x + s * 0.3, y, s * 0.06, s * 0.1); },
  leaf(c, x, y, s) { c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.3); c.quadraticCurveTo(x - s * 0.3, y - s * 0.35, x + s * 0.34, y - s * 0.32); c.quadraticCurveTo(x + s * 0.3, y + s * 0.3, x - s * 0.3, y + s * 0.3); c.fill(); },
  flower(c, x, y, s) { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ell(c, x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.18, s * 0.14, s * 0.14); c.fill(); } const f = c.fillStyle; c.fillStyle = 'rgba(255,220,90,0.95)'; ell(c, x, y, s * 0.1, s * 0.1); c.fill(); c.fillStyle = f; },
  glasses(c, x, y, s) { c.lineWidth = s * 0.07; for (const d of [-1, 1]) { ell(c, x + d * s * 0.2, y + s * 0.02, s * 0.15, s * 0.12); c.stroke(); } c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.02); c.quadraticCurveTo(x, y - s * 0.07, x + s * 0.05, y - s * 0.02); c.stroke(); },
  star(c, x, y, s) { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? s * 0.16 : s * 0.38; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); },
  bolt(c, x, y, s) { c.beginPath(); c.moveTo(x + s * 0.08, y - s * 0.4); c.lineTo(x - s * 0.22, y + s * 0.06); c.lineTo(x, y + s * 0.06); c.lineTo(x - s * 0.08, y + s * 0.4); c.lineTo(x + s * 0.22, y - s * 0.08); c.lineTo(x + s * 0.02, y - s * 0.08); c.closePath(); c.fill(); },
  drop(c, x, y, s) { c.beginPath(); c.moveTo(x, y - s * 0.38); c.bezierCurveTo(x + s * 0.3, y, x + s * 0.24, y + s * 0.34, x, y + s * 0.34); c.bezierCurveTo(x - s * 0.24, y + s * 0.34, x - s * 0.3, y, x, y - s * 0.38); c.fill(); },
  glass(c, x, y, s) { c.beginPath(); c.moveTo(x - s * 0.2, y - s * 0.36); c.lineTo(x + s * 0.2, y - s * 0.36); c.quadraticCurveTo(x + s * 0.2, y + s * 0.02, x, y + s * 0.04); c.quadraticCurveTo(x - s * 0.2, y + s * 0.02, x - s * 0.2, y - s * 0.36); c.fill(); c.fillRect(x - s * 0.03, y, s * 0.06, s * 0.28); c.fillRect(x - s * 0.15, y + s * 0.28, s * 0.3, s * 0.06); },
  burger(c, x, y, s) { c.beginPath(); c.arc(x, y - s * 0.02, s * 0.32, Math.PI, 0); c.fill(); c.fillRect(x - s * 0.34, y + s * 0.04, s * 0.68, s * 0.1); rrect(c, x - s * 0.32, y + s * 0.18, s * 0.64, s * 0.14, s * 0.06); c.fill(); },
  disc(c, x, y, s) { c.lineWidth = s * 0.05; ell(c, x, y, s * 0.36, s * 0.36); c.fill(); const f = c.fillStyle; c.strokeStyle = 'rgba(0,0,0,0.3)'; for (const r of [0.28, 0.2]) { ell(c, x, y, s * r, s * r); c.stroke(); } c.fillStyle = 'rgba(0,0,0,0.6)'; ell(c, x, y, s * 0.06, s * 0.06); c.fill(); c.fillStyle = f; },
  chevron(c, x, y, s) { for (const o of [-0.12, 0.12]) { c.beginPath(); c.moveTo(x + (o - 0.18) * s, y - 0.3 * s); c.lineTo(x + (o - 0.02) * s, y - 0.3 * s); c.lineTo(x + (o + 0.18) * s, y); c.lineTo(x + (o - 0.02) * s, y + 0.3 * s); c.lineTo(x + (o - 0.18) * s, y + 0.3 * s); c.lineTo(x + o * s, y); c.closePath(); c.fill(); } },
  arches(c, x, y, s) { c.lineWidth = s * 0.1; for (const d of [-1, 1]) { c.beginPath(); c.arc(x + d * s * 0.13, y + s * 0.2, s * 0.26, Math.PI, 0); c.stroke(); } },
  ring(c, x, y, s) { c.lineWidth = s * 0.07; ell(c, x, y, s * 0.2, s * 0.2); c.stroke(); c.lineWidth = s * 0.04; c.save(); c.translate(x, y); c.rotate(-0.5); ell(c, 0, 0, s * 0.36, s * 0.12); c.stroke(); c.restore(); },
  ticket(c, x, y, s) { c.save(); c.translate(x, y); c.rotate(-0.25); rrect(c, -s * 0.34, -s * 0.18, s * 0.68, s * 0.36, s * 0.05); c.fill(); c.restore(); },
  bag(c, x, y, s) { rrect(c, x - s * 0.26, y - s * 0.12, s * 0.52, s * 0.44, s * 0.05); c.fill(); c.lineWidth = s * 0.06; c.beginPath(); c.arc(x, y - s * 0.12, s * 0.14, Math.PI, 0); c.stroke(); },
  bowl(c, x, y, s) { c.beginPath(); c.arc(x, y - s * 0.02, s * 0.34, 0, Math.PI); c.closePath(); c.fill(); c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(x - s * 0.1, y - s * 0.4); c.lineTo(x + s * 0.12, y - s * 0.06); c.moveTo(x + s * 0.04, y - s * 0.42); c.lineTo(x + s * 0.2, y - s * 0.08); c.stroke(); },
  apple(c, x, y, s) { c.beginPath(); c.moveTo(x, y - s * 0.18); c.bezierCurveTo(x + s * 0.36, y - s * 0.36, x + s * 0.42, y + s * 0.2, x + s * 0.1, y + s * 0.36); c.quadraticCurveTo(x, y + s * 0.3, x - s * 0.1, y + s * 0.36); c.bezierCurveTo(x - s * 0.42, y + s * 0.2, x - s * 0.36, y - s * 0.36, x, y - s * 0.18); c.fill(); c.fillRect(x - s * 0.02, y - s * 0.36, s * 0.05, s * 0.16); },
  camera(c, x, y, s) { rrect(c, x - s * 0.34, y - s * 0.18, s * 0.68, s * 0.44, s * 0.06); c.fill(); c.fillRect(x - s * 0.12, y - s * 0.26, s * 0.24, s * 0.1); const f = c.fillStyle; c.fillStyle = 'rgba(0,0,0,0.45)'; ell(c, x, y + s * 0.04, s * 0.13, s * 0.13); c.fill(); c.fillStyle = f; },
  dollar(c, x, y, s) { setFont(c, s * 0.7, 'Oswald', 700); c.textBaseline = 'middle'; tdraw(c, '$', x, y + s * 0.03, s * 0.7, 0, 'c'); },
  wheat(c, x, y, s) { c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(x, y + s * 0.4); c.lineTo(x, y - s * 0.36); c.stroke(); for (let k = 0; k < 4; k++) for (const d of [-1, 1]) { c.save(); c.translate(x + d * s * 0.07, y - s * 0.26 + k * s * 0.15); c.rotate(d * 0.6); ell(c, 0, 0, s * 0.05, s * 0.1); c.fill(); c.restore(); } },
};

// ---- the panel treatments
// spec: { name, sub, F: [fam, weight, style, track, upper], ink, bg, bg2, mark, markInk, style, sub2F }
export function paintSign(c, x, y, w, h, S) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.textAlign = 'left'; c.globalAlpha = 1; c.shadowColor = 'transparent'; c.shadowBlur = 0; c.globalCompositeOperation = 'source-over';
  const st = S.style || 'box';
  // ground: flat per column, so the column at either edge can be stretched to lengthen the sign (shopSigns.js)
  if (st === 'metal') { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(S.bg, 0.18)); g.addColorStop(0.5, S.bg); g.addColorStop(1, shade(S.bg, -0.35)); c.fillStyle = g; }
  else if (st === 'wood') { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(S.bg, 0.12)); g.addColorStop(1, shade(S.bg, -0.3)); c.fillStyle = g; }
  else c.fillStyle = S.bg;
  c.fillRect(x, y, w, h);
  if (st === 'wood') { c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1; for (let k = 1; k < 7; k++) { c.beginPath(); c.moveTo(x, y + h * k / 7); c.lineTo(x + w, y + h * k / 7); c.stroke(); } }
  if (st === 'band') { c.fillStyle = S.bg2; c.fillRect(x, y + h * 0.91, w, h * 0.09); c.fillRect(x, y, w, h * 0.04); }
  if (st === 'neon' || st === 'marquee') {
    c.strokeStyle = st === 'neon' ? S.ink : '#d8b25a'; c.lineWidth = Math.max(1.5, h * 0.03);
    if (st === 'neon') { c.shadowColor = S.ink; c.shadowBlur = h * 0.08; }
    c.beginPath(); c.moveTo(x, y + h * 0.1); c.lineTo(x + w, y + h * 0.1); c.moveTo(x, y + h * 0.9); c.lineTo(x + w, y + h * 0.9); c.stroke();
    c.shadowBlur = 0;
    if (st === 'marquee') { c.fillStyle = '#fff2c0'; for (let k = 0; k * h * 0.12 < w; k++) { ell(c, x + h * 0.06 + k * h * 0.12, y + h * 0.05, h * 0.022, h * 0.022); c.fill(); ell(c, x + h * 0.06 + k * h * 0.12, y + h * 0.95, h * 0.022, h * 0.022); c.fill(); } }
  }
  // top rail light and bottom shadow: a box, not paint
  c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x, y, w, Math.max(1, h * 0.025));
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, y + h - Math.max(1, h * 0.04), w, Math.max(1, h * 0.04));
  // lettering zone: mark + name (+ small second line), centred, never within 8 % of either end
  const F = S.F, name = F[4] ? S.name.toUpperCase() : S.name;
  const hasSub = !!S.sub, script = /Vibes|Pacifico|Lobster|Kaushan/.test(S.F[0]);
  const capH = h * (S.capH || (hasSub ? 0.37 : 0.46)) * (script ? 0.8 : 1);
  const markS = S.mark ? h * (hasSub ? 0.66 : 0.6) : 0, gap = S.mark ? h * 0.2 : 0;
  const maxName = w * (S.maxW || 0.84) - markS - gap;
  let z = fit(c, name, F, capH / 0.72, maxName);                 // font size from the cap height (caps ~0.72 em)
  const nameW = tw(c, name, z, F[3] || 0);
  let subZ = 0, subW = 0;
  const SF = S.subF || ['Montserrat', 700, 'normal', 0.18, true];
  const sub = hasSub ? (SF[4] ? S.sub.toUpperCase() : S.sub) : '';
  if (hasSub) { subZ = fit(c, sub, SF, h * 0.13, Math.max(nameW, maxName * 0.7)); subW = tw(c, sub, subZ, SF[3] || 0); }
  const blockW = markS + gap + Math.max(nameW, subW);
  let x0 = x + (w - blockW) / 2;
  const nameCY = hasSub ? y + h * (script ? 0.37 : 0.4) : y + h * 0.52;
  if (S.mark) {
    const mx = x0 + markS / 2, my = y + h * 0.5;
    if (S.badge !== false) { c.fillStyle = S.markBg || S.ink; ell(c, mx, my, markS / 2, markS / 2); c.fill(); }
    c.fillStyle = S.badge !== false ? (S.markInk || S.bg) : S.ink; c.strokeStyle = c.fillStyle; c.lineCap = 'round';
    if (S.mark === 'mono') { setFont(c, markS * 0.62, F[0], F[1], F[2]); c.textBaseline = 'middle'; tdraw(c, name.replace(/[^A-Za-z]/g, '').charAt(0), mx, my + markS * 0.04, markS * 0.62, 0, 'c'); }
    else (MARKS[S.mark] || MARKS.star)(c, mx, my, markS * (S.badge !== false ? 0.78 : 1.0));
    c.lineCap = 'butt';
    x0 += markS + gap;
  }
  const tx = S.mark ? x0 : x0 + (Math.max(nameW, subW) - nameW) / 2;
  c.fillStyle = S.ink;
  if (st === 'neon') { c.shadowColor = S.ink; c.shadowBlur = h * 0.1; }
  else if (st !== 'band') { c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = h * 0.03; c.shadowOffsetY = h * 0.02; }
  setFont(c, z, F[0], F[1], F[2]); c.textBaseline = 'middle';
  tdraw(c, name, tx, nameCY + z * 0.04, z, F[3] || 0, 'l');
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  if (hasSub) {
    c.fillStyle = S.subInk || S.ink; c.globalAlpha = 0.92;
    setFont(c, subZ, SF[0], SF[1], SF[2]); c.textBaseline = 'middle';
    tdraw(c, sub, S.mark ? tx : x0 + (Math.max(nameW, subW) - subW) / 2, y + h * (st === 'band' ? 0.76 : 0.8), subZ, SF[3] || 0, 'l');
    c.globalAlpha = 1;
  }
  c.restore();
}

// ---- the Times Square roster: chain-like invented brands and generic tourist trades
// [name, sub, font, ink, bg, mark, style, extra]
const MS = (w, t = 0, st = 'normal', up = true) => ['Montserrat', w, st, t, up];
export const TSQ_SHOPS = [
  { name: 'STACKHOUSE', sub: 'BURGERS & SHAKES', F: ['Bungee', 400, 'normal', 0.02, true], ink: '#ffffff', bg: '#c8221a', mark: 'burger', markBg: '#ffc01e', markInk: '#c8221a', style: 'box' },
  { name: 'Brass Kettle', sub: 'COFFEE ROASTERS', F: ['Playfair Display', 700, 'normal', 0.01, false], ink: '#efe2c4', bg: '#123a2c', mark: 'cup', style: 'wood', markBg: '#efe2c4', markInk: '#123a2c' },
  { name: 'TONDO', sub: 'PIZZA BY THE SLICE', F: ['Alfa Slab One', 400, 'normal', 0.04, true], ink: '#b3201c', bg: '#f4efe4', mark: 'slice', markBg: '#1f7a3a', markInk: '#f6c343', style: 'band', bg2: '#1f7a3a', subInk: '#1f7a3a' },
  { name: 'Marquee Diner', sub: 'OPEN 24 HOURS', F: ['Lobster', 400, 'normal', 0, false], ink: '#ff5fa2', bg: '#0b0b10', mark: 'star', style: 'neon', badge: false, subInk: '#7fe8ff' },
  { name: 'FLEETSTEP', sub: 'SNEAKERS', F: ['Archivo Black', 400, 'normal', 0.06, true], ink: '#ffffff', bg: '#121214', mark: 'chevron', markBg: '#ff5a1f', markInk: '#121214', style: 'metal' },
  { name: 'ROSALINE', sub: 'BEAUTY', F: ['Playfair Display', 400, 'normal', 0.3, true], ink: '#5a0a18', bg: '#f3d6cf', mark: null, style: 'box', subF: MS(500, 0.6) },
  { name: 'elara', sub: 'EXPERIENCE STORE', F: ['Montserrat', 300, 'normal', 0.3, false], ink: '#1a1a22', bg: '#f4f4f6', mark: 'ring', badge: false, style: 'box', subF: MS(500, 0.4) },
  { name: 'North & Thread', sub: 'CLOTHING CO.', F: ['Cormorant Garamond', 600, 'normal', 0.04, false], ink: '#f2ead8', bg: '#16233a', mark: 'mono', markBg: '#f2ead8', markInk: '#16233a', style: 'box' },
  { name: 'VELLE', sub: 'SUNGLASSES', F: ['Abril Fatface', 400, 'normal', 0.08, true], ink: '#fff1e2', bg: '#c05a34', mark: 'glasses', badge: false, style: 'box', subF: MS(500, 0.5) },
  { name: 'BIG APPLE GIFTS', sub: 'SOUVENIRS  T-SHIRTS  HATS', F: ['Bungee', 400, 'normal', 0.02, true], ink: '#1a1a1a', bg: '#ffd21f', mark: 'apple', markBg: '#d7261e', markInk: '#ffd21f', style: 'box' },
  { name: 'KESTREL THEATRE', sub: 'BOX OFFICE', F: ['Limelight', 400, 'normal', 0.06, true], ink: '#f2d27a', bg: '#0c0a0a', mark: null, style: 'marquee' },
  { name: 'MIDTOWN PHARMACY', sub: 'OPEN 24 HOURS', F: MS(800, 0.02), ink: '#ffffff', bg: '#0f6d4a', mark: 'cross', markBg: '#ffffff', markInk: '#0f6d4a', style: 'box' },
  { name: 'Lucky Star', sub: 'ARCADE', F: ['Monoton', 400, 'normal', 0.04, false], ink: '#6ff0ff', bg: '#06060a', mark: null, style: 'neon', subInk: '#ffd84a' },
  { name: 'Tallbridge', sub: 'BANK  ATM', F: MS(700, 0, 'normal', false), ink: '#ffffff', bg: '#07405e', mark: 'arches', badge: false, style: 'box' },
  { name: 'waveline', sub: '5G STORE', F: ['Space Grotesk', 700, 'normal', -0.01, false], ink: '#ffffff', bg: '#4a137a', mark: 'bolt', markBg: '#ff4fa3', markInk: '#4a137a', style: 'box' },
  { name: 'SNAPSHOT', sub: 'PHOTO  ELECTRONICS', F: ['Oswald', 700, 'normal', 0.08, true], ink: '#ffcf33', bg: '#101216', mark: 'camera', badge: false, style: 'metal' },
  { name: 'Kaito', sub: 'SUSHI & RAMEN', F: ['Space Grotesk', 700, 'normal', 0.12, false], ink: '#f4ede0', bg: '#1c1a18', mark: 'bowl', markBg: '#c8321e', markInk: '#f4ede0', style: 'wood' },
  { name: 'MIDTOWN SOUVENIRS', sub: 'NEW YORK GIFTS', F: ['Oswald', 700, 'normal', 0.06, true], ink: '#ffffff', bg: '#1b3e8f', mark: 'star', markBg: '#d7261e', markInk: '#ffffff', style: 'box' },
  { name: 'Twist', sub: 'BAGELS & DELI', F: ['Pacifico', 400, 'normal', 0, false], ink: '#fff6e0', bg: '#8a3a12', mark: 'wheat', badge: false, style: 'wood' },
  { name: 'BROADWAY TICKETS', sub: 'TOURS  SHOWS  CRUISES', F: ['Bebas Neue', 400, 'normal', 0.06, true], ink: '#ffffff', bg: '#b0121e', mark: 'ticket', markBg: '#ffd84a', markInk: '#b0121e', style: 'box', capH: 0.46 },
  { name: 'Gelato 44', sub: 'ARTISAN ICE CREAM', F: ['Great Vibes', 400, 'normal', 0, false], ink: '#3a2a20', bg: '#f6e3ea', mark: 'drop', markBg: '#e87aa0', markInk: '#f6e3ea', style: 'band', bg2: '#e87aa0', capH: 0.5 },
  { name: 'THE HALDEN', sub: 'HOTEL', F: ['Cormorant Garamond', 600, 'normal', 0.3, true], ink: '#e8cc8a', bg: '#141210', mark: null, style: 'metal', subF: MS(500, 0.8) },
  { name: 'Pop & Fizz', sub: 'SWEETS  SODA  CANDY', F: ['Fredoka', 700, 'normal', 0, false], ink: '#ffffff', bg: '#e8408a', mark: 'star', markBg: '#ffe14a', markInk: '#e8408a', style: 'box' },
  { name: 'MIDTOWN OPTICAL', sub: 'EYE EXAMS', F: MS(300, 0.2), ink: '#1d2a3a', bg: '#eef2f6', mark: 'glasses', badge: false, style: 'band', bg2: '#1d6fa8', subInk: '#1d6fa8' },
  { name: 'Taco Libre', sub: 'TAQUERIA', F: ['Kaushan Script', 400, 'normal', 0, false], ink: '#ffe9b0', bg: '#1f6b5a', mark: 'star', markBg: '#f29a1f', markInk: '#1f6b5a', style: 'wood' },
  { name: 'PRETZEL CO.', sub: 'BAKED FRESH', F: ['Alfa Slab One', 400, 'normal', 0.03, true], ink: '#3a1e08', bg: '#f2c46a', mark: 'wheat', markBg: '#3a1e08', markInk: '#f2c46a', style: 'box' },
  { name: 'Cafe Luma', sub: 'ESPRESSO BAR', F: ['Playfair Display', 400, 'italic', 0, false], ink: '#ffffff', bg: '#2b2b30', mark: 'cup', badge: false, style: 'metal', subF: MS(500, 0.4) },
  { name: 'NEWS & SNACKS', sub: 'LOTTO  ATM  COLD DRINKS', F: ['Oswald', 600, 'normal', 0.04, true], ink: '#ffffff', bg: '#0e5a8a', mark: 'star', markBg: '#ffffff', markInk: '#0e5a8a', style: 'box' },
  { name: 'SOLE CITY', sub: 'SHOES', F: ['Archivo Black', 400, 'normal', 0.04, true], ink: '#ff3b30', bg: '#f6f6f2', mark: 'chevron', badge: false, style: 'band', bg2: '#111111', subInk: '#111111' },
  { name: 'RECORD ROOM', sub: 'VINYL  CDs', F: ['Righteous', 400, 'normal', 0.04, true], ink: '#ffd84a', bg: '#221a2e', mark: 'disc', badge: false, style: 'metal' },
];

// ---- citywide: the round-10 trades, each with its own letterform, mark and ground
// trade -> [font, mark, ground/ink pairs, style]
const SLAB = ['Alfa Slab One', 400, 'normal', 0.03, true], COND = ['Oswald', 700, 'normal', 0.06, true], SCRIPT = ['Great Vibes', 400, 'normal', 0, false];
const TRADE = {
  'DELI': [SLAB, 'star', [['#b3201c', '#ffffff'], ['#f4efe4', '#b3201c']], 'box'],
  'MARKET': [COND, 'leaf', [['#1d6b34', '#ffffff'], ['#f2f0e6', '#1d6b34']], 'band'],
  'GROCERY': [COND, 'leaf', [['#1d6b34', '#ffffff']], 'box'],
  'SUPERMARKET': [COND, 'leaf', [['#c8221a', '#ffffff']], 'box'],
  'PIZZA': [SLAB, 'slice', [['#f4efe4', '#b3201c'], ['#1f7a3a', '#ffffff']], 'band'],
  'CLEANERS': [['Fredoka', 700, 'normal', 0, true], 'drop', [['#1a5aa8', '#ffffff'], ['#eef5fb', '#1a5aa8']], 'box'],
  'LAUNDROMAT': [['Fredoka', 700, 'normal', 0, true], 'drop', [['#16a0c8', '#ffffff']], 'box'],
  'HARDWARE': [COND, 'key', [['#161616', '#ffc21a']], 'metal'],
  'LOCKSMITH': [COND, 'key', [['#ffc21a', '#161616']], 'box'],
  'BAKERY': [SCRIPT, 'wheat', [['#6a3514', '#fbeed6']], 'wood'],
  'PHARMACY': [['Montserrat', 800, 'normal', 0.02, true], 'cross', [['#0f6d4a', '#ffffff'], ['#1a4f9c', '#ffffff']], 'box'],
  'BARBER SHOP': [['Lobster', 400, 'normal', 0, false], 'pole', [['#15233f', '#ffffff'], ['#f4efe4', '#15233f']], 'box'],
  'NAILS': [SCRIPT, 'flower', [['#141414', '#f4b8cc'], ['#f7dce6', '#8a1a4a']], 'box'],
  'HAIR SALON': [SCRIPT, 'scissors', [['#141414', '#e8cc8a'], ['#f4ece6', '#2a2020']], 'box'],
  'COFFEE': [['Playfair Display', 700, 'normal', 0.01, false], 'cup', [['#123a2c', '#efe2c4'], ['#3a2416', '#f2e6cc']], 'wood'],
  'LIQUORS': [['Playfair Display', 700, 'normal', 0.06, true], 'glass', [['#4a0f1c', '#e8cc8a']], 'metal'],
  'WINE & LIQUOR': [['Playfair Display', 700, 'normal', 0.06, true], 'glass', [['#4a0f1c', '#e8cc8a']], 'metal'],
  'FLOWERS': [SCRIPT, 'flower', [['#2c5a2a', '#ffffff'], ['#f4f0e6', '#2c5a2a']], 'box'],
  'DINER': [['Lobster', 400, 'normal', 0, false], 'star', [['#0b0b10', '#ff5fa2'], ['#b3201c', '#ffffff']], 'neon'],
  'SHOES': [COND, 'chevron', [['#161616', '#ffffff']], 'metal'],
  'SHOE REPAIR': [COND, 'key', [['#3a2416', '#f2e6cc']], 'wood'],
  'ELECTRONICS': [['Space Grotesk', 700, 'normal', 0.02, true], 'bolt', [['#0c1f4a', '#7fd8ff'], ['#141414', '#ffcf33']], 'metal'],
  'BODEGA': [['Bungee', 400, 'normal', 0.02, true], 'star', [['#ffd21f', '#b3201c'], ['#b3201c', '#ffd21f']], 'box'],
  'OPTICAL': [['Montserrat', 300, 'normal', 0.2, true], 'glasses', [['#eef2f6', '#1d2a3a']], 'band'],
  'STATIONERY': [['Montserrat', 700, 'normal', 0.04, true], 'mono', [['#1d3e6a', '#ffffff']], 'box'],
  'COPY & PRINT': [['Montserrat', 700, 'normal', 0.04, true], 'mono', [['#1d3e6a', '#ffffff']], 'box'],
  'TAILOR': [['Cormorant Garamond', 600, 'normal', 0.12, true], 'scissors', [['#1a1a1e', '#e8dcc4']], 'metal'],
  'FISH MARKET': [SLAB, 'drop', [['#0f4f6a', '#ffffff']], 'band'],
  'RECORDS': [['Righteous', 400, 'normal', 0.04, true], 'disc', [['#221a2e', '#ffd84a']], 'metal'],
  'FURNITURE': [['Cormorant Garamond', 600, 'normal', 0.14, true], 'mono', [['#3a3026', '#f2e6cc']], 'wood'],
  'CHICKEN & RIBS': [['Bungee', 400, 'normal', 0.02, true], 'star', [['#b3201c', '#ffd21f']], 'box'],
  'JUICE BAR': [['Pacifico', 400, 'normal', 0, false], 'leaf', [['#f28a1f', '#ffffff'], ['#2c8a3a', '#fff6c8']], 'box'],
  'TRAVEL': [['Montserrat', 700, 'normal', 0.06, true], 'star', [['#0e5a8a', '#ffffff']], 'box'],
  'CHECK CASHING': [COND, 'dollar', [['#ffd21f', '#0c2a6a']], 'box'],
};
const SUBLINES = { 'DELI': 'HOT & COLD SANDWICHES', 'PIZZA': 'SLICES  PIES  HEROS', 'BAKERY': 'BREAD  CAKES  PASTRY', 'COFFEE': 'ESPRESSO  TEA', 'PHARMACY': 'PRESCRIPTIONS', 'BARBER SHOP': 'WALK-INS WELCOME',
  'CLEANERS': 'SAME DAY SERVICE', 'LAUNDROMAT': 'WASH  DRY  FOLD', 'HARDWARE': 'PAINT  TOOLS  KEYS', 'NAILS': 'MANICURE  PEDICURE', 'HAIR SALON': 'CUTS  COLOR  STYLING', 'LIQUORS': 'WINE  SPIRITS',
  'WINE & LIQUOR': 'FINE WINES', 'FLOWERS': 'WEDDINGS  EVENTS', 'DINER': 'BREAKFAST ALL DAY', 'ELECTRONICS': 'PHONES  REPAIRS', 'BODEGA': 'GROCERY  DELI  LOTTO', 'OPTICAL': 'EYE EXAMS  FRAMES',
  'TAILOR': 'ALTERATIONS', 'RECORDS': 'NEW & USED VINYL', 'CHECK CASHING': 'MONEY ORDERS  BILL PAY', 'CHICKEN & RIBS': 'TAKE OUT', 'MARKET': 'FRESH PRODUCE', 'GROCERY': 'FRESH PRODUCE',
  'SUPERMARKET': 'MEAT  PRODUCE  DAIRY', 'LOCKSMITH': '24 HR EMERGENCY', 'SHOE REPAIR': 'KEYS MADE', 'STATIONERY': 'OFFICE SUPPLIES', 'COPY & PRINT': 'SHIPPING', 'FISH MARKET': 'FRESH DAILY',
  'FURNITURE': 'HOME DECOR', 'JUICE BAR': 'SMOOTHIES', 'TRAVEL': 'FLIGHTS  TOURS', 'SHOES': 'MEN  WOMEN  KIDS' };
// a citywide sign from a name the caller already generated: `head` is the owner's part (a surname, a place), `trade`
// the trade word; either may be empty
export function citySign(head, trade, i) {
  const T = TRADE[trade] || [COND, 'mono', [['#20242a', '#ffffff']], 'box'];
  const pal = T[2][(hs(i, 3.3) * T[2].length) | 0];
  const name = head ? head : trade;
  let sub = head ? trade : (SUBLINES[trade] || 'OPEN 7 DAYS');
  if (!head && hs(i, 8.1) < 0.4) sub = ['OPEN 7 DAYS', 'SINCE 1974', 'FREE DELIVERY', 'EST. 1988'][(hs(i, 9.7) * 4) | 0];
  let F = T[0];
  // a script face only carries a name that is a word; a trade name alone reads better in the trade's plain face
  if (!head && (F === SCRIPT || F[0] === 'Pacifico' || F[0] === 'Lobster')) F = ['Playfair Display', 700, 'italic', 0, false];
  if (F[4] === false && name === name.toUpperCase()) F = [F[0], F[1], F[2], F[3], false];
  const nm = F[4] === false ? name.toLowerCase().replace(/(^|[\s'&-])([a-z])/g, (m, p, ch) => p + ch.toUpperCase()).replace(/'S\b/g, "'s") : name;
  const style = T[3];
  const band = style === 'band' ? shade(pal[1], -0.1) : null;
  return { name: nm, sub, F, ink: pal[1], bg: pal[0], mark: T[1], markBg: pal[1], markInk: pal[0], style, bg2: band, badge: T[1] === 'glasses' || T[1] === 'pole' ? false : undefined };
}
