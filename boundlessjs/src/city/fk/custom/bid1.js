// AR33 custom builders and sign marks, segment bid1: Morningside Avenue to Frederick Douglass Boulevard. Specs name them as 'bid1:<fn>' (docs/notes/ar33-spec.md).
// Owner: the BID1 worker (docs/notes/ar33-bid1.md).
// Sign marks: fn(ctx2d, W, H) paints the whole face (logoAt 'fill') or the logo square; every mark is drawn from scratch
// fn.fonts names the fonts it uses.
// Builders: fn(group, ctx, spec, frame) after the kit's own faces (`with: 'kit'`); u along the front from its left end,
// y up from the sidewalk, w out of the wall (negative = behind the facade plane).

import { graffitiTex } from '../kitTex.js';
import { kitGraffitiMat } from '../kitMats.js';

// ---------------------------------------------------------------- canvas helpers
const FONT = (key, weight, px, italic = false) => `${italic ? 'italic ' : ''}${weight} ${Math.max(1, Math.round(px))}px "ar33 ${key}"`;
function fitText(c, text, font, maxW, px) {
  c.font = font(px);
  const w = c.measureText(text).width;
  return w > maxW ? Math.max(4, px * maxW / w) : px;
}
// draw text centred at (x, y) (y = the baseline's middle of the cap height), shrunk to fit maxW
function text(c, s, x, y, o) {
  const { key, weight = 700, px, maxW = 1e9, color = '#fff', align = 'center', italic = false, stroke = null, strokeW = 0, track = 0 } = o;
  const fpx = fitText(c, s, (p) => FONT(key, weight, p, italic), maxW, px);
  c.font = FONT(key, weight, fpx, italic);
  c.textAlign = align; c.textBaseline = 'middle';
  if (track) { try { c.letterSpacing = `${track * fpx}px`; } catch (e) { /* older canvas */ } }
  if (stroke) { c.lineJoin = 'round'; c.strokeStyle = stroke; c.lineWidth = strokeW * fpx; c.strokeText(s, x, y); }
  c.fillStyle = color; c.fillText(s, x, y);
  if (track) { try { c.letterSpacing = '0px'; } catch (e) { /* older canvas */ } }
  return fpx;
}
const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const mark = (fn, fonts) => { fn.fonts = fonts; return fn; };
// SIGN's vetted marks (fk/signMarks.js), loaded lazily so this module stands even if that one fails; my own drawing is the fallback
let SM = null;
import('../signMarks.js').then((m) => { SM = m; }).catch(() => { /* keep the local marks */ });
const via = (name, own, fonts) => mark((c, W, H) => (SM && typeof SM[name] === 'function' ? SM[name](c, W, H) : own(c, W, H)), fonts);

// ---------------------------------------------------------------- 381: K Blessing / GOOD YEAR (barbershop, braids)
export const blessing = mark((c, W, H) => {
  c.fillStyle = '#0d0d0d'; c.fillRect(0, 0, W, H);
  // the K monogram: a script K with a long swash over the name
  text(c, 'K', W * 0.07, H * 0.36, { key: 'KaushanScript', weight: 400, px: H * 0.62, color: '#ffffff' });
  c.strokeStyle = '#ffffff'; c.lineWidth = H * 0.025; c.lineCap = 'round';
  c.beginPath(); c.moveTo(W * 0.03, H * 0.12); c.quadraticCurveTo(W * 0.25, H * -0.02, W * 0.4, H * 0.1); c.stroke();
  text(c, 'Blessing', W * 0.3, H * 0.36, { key: 'KaushanScript', weight: 400, px: H * 0.46, maxW: W * 0.4, color: '#ffffff' });
  text(c, 'GOOD YEAR', W * 0.76, H * 0.33, { key: 'Oswald', weight: 700, px: H * 0.42, maxW: W * 0.44, color: '#ffffff', track: 0.02 });
  text(c, 'BARBER SHOP • NAILS SPA • HAIR SALON', W * 0.28, H * 0.66, { key: 'Inter', weight: 700, px: H * 0.085, maxW: W * 0.5, color: '#f2f2f2' });
  text(c, 'EYEBROWS AND LASHES', W * 0.28, H * 0.76, { key: 'Inter', weight: 700, px: H * 0.085, maxW: W * 0.5, color: '#f2f2f2' });
  text(c, 'ALL TYPES OF AFRICAN STYLES • SENEGALESE TWIST', W * 0.76, H * 0.62, { key: 'Inter', weight: 700, px: H * 0.075, maxW: W * 0.46, color: '#f2f2f2' });
  text(c, 'CORN ROWS • HAVANA TWIST', W * 0.76, H * 0.71, { key: 'Inter', weight: 700, px: H * 0.075, maxW: W * 0.46, color: '#f2f2f2' });
  // the three phone tags along the bottom
  for (const [x, t] of [[0.1, '381 W'], [0.44, '646-744-1537'], [0.8, '646-944-1515']]) {
    c.fillStyle = '#f4f4f4'; rrect(c, W * x - W * 0.08, H * 0.84, W * 0.16, H * 0.12, H * 0.02); c.fill();
    text(c, t, W * x, H * 0.9, { key: 'Inter', weight: 800, px: H * 0.08, maxW: W * 0.15, color: '#111' });
  }
}, ['KaushanScript-400', 'Oswald-700', 'Inter-700', 'Inter-800']);

// ---------------------------------------------------------------- 379: Family Pharmacy & Surgical
export const pharmacy = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a61c6'); g.addColorStop(1, '#173f93');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#d8262e'; c.fillRect(0, H * 0.76, W, H * 0.24);
  text(c, 'Family', W * 0.5, H * 0.14, { key: 'DancingScript', weight: 700, px: H * 0.26, color: '#e8323a', stroke: '#ffffff', strokeW: 0.1 });
  text(c, 'PHARMACY & SURGICAL', W * 0.5, H * 0.48, { key: 'BarlowCondensed', weight: 800, px: H * 0.4, maxW: W * 0.92, color: '#ffffff', stroke: '#0c2a66', strokeW: 0.06 });
  text(c, 'FARMACIA ★ LOTTO', W * 0.5, H * 0.88, { key: 'BarlowCondensed', weight: 800, px: H * 0.18, maxW: W * 0.5, color: '#ffffff' });
  text(c, '379 W 125 ST', W * 0.1, H * 0.2, { key: 'Inter', weight: 700, px: H * 0.08, color: '#ffffff' });
  text(c, '212 222 1300', W * 0.9, H * 0.2, { key: 'Inter', weight: 700, px: H * 0.08, color: '#ffffff' });
}, ['DancingScript-700', 'BarlowCondensed-800', 'Inter-700']);

// ---------------------------------------------------------------- 377: the Yemeni restaurant (gold Arabic on brown)
function star8(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.62 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
}
export const yemeni = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5b4230'); g.addColorStop(1, '#3d2b1e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#c9a24f'; c.lineWidth = H * 0.04; c.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H * 0.9);
  star8(c, H * 0.55, H * 0.5, H * 0.3, '#d6b060'); star8(c, H * 0.55, H * 0.5, H * 0.14, '#3d2b1e');
  c.font = `700 ${Math.round(H * 0.5)}px "ar33 NotoNaskhArabic", "Segoe UI", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.direction = 'rtl'; c.fillStyle = '#e0bb62'; c.fillText('المطعم اليمني', W * 0.55, H * 0.5, W * 0.75); c.direction = 'ltr';
}, ['NotoNaskhArabic-700']);

// ---------------------------------------------------------------- 351 W 125th stores
export const apollograb = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#4b1a63'); g.addColorStop(0.55, '#a02c78'); g.addColorStop(1, '#e0467a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  text(c, 'APOLLO', W * 0.5, H * 0.34, { key: 'Anton', weight: 400, px: H * 0.4, maxW: W * 0.9, color: '#ffffff', italic: true, stroke: '#2a0f35', strokeW: 0.06, track: 0.03 });
  text(c, 'Grab&Go!', W * 0.52, H * 0.72, { key: 'KaushanScript', weight: 400, px: H * 0.3, maxW: W * 0.8, color: '#ffd23a', stroke: '#2a0f35', strokeW: 0.12 });
}, ['Anton-400', 'KaushanScript-400']);
export const ipizza = mark((c, W, H) => {
  c.fillStyle = '#c8202b'; c.fillRect(0, 0, W, H);
  text(c, 'iPizza NY', W * 0.2, H * 0.14, { key: 'KaushanScript', weight: 400, px: H * 0.16, color: '#ffffff' });
  text(c, 'PIZZA', W * 0.5, H * 0.52, { key: 'Anton', weight: 400, px: H * 0.5, maxW: W * 0.9, color: '#ffffff', track: 0.04 });
  text(c, 'Free Delivery', W * 0.16, H * 0.9, { key: 'Inter', weight: 700, px: H * 0.07, color: '#ffffff' });
  text(c, 'iPizzaNY.com', W * 0.5, H * 0.9, { key: 'Inter', weight: 700, px: H * 0.07, color: '#ffffff' });
  text(c, '917-265-8973', W * 0.84, H * 0.9, { key: 'Inter', weight: 700, px: H * 0.07, color: '#ffffff' });
}, ['KaushanScript-400', 'Anton-400', 'Inter-700']);
export const ipizzaround = mark((c, W, H) => {
  const r = Math.min(W, H) * 0.48;
  c.fillStyle = '#c8202b'; c.beginPath(); c.arc(W / 2, H / 2, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, H / 2, r * 0.86, 0, Math.PI * 2); c.fill();
  text(c, 'iPizza', W / 2, H * 0.44, { key: 'KaushanScript', weight: 400, px: r * 0.55, maxW: r * 1.6, color: '#c8202b' });
  text(c, 'NY', W / 2, H * 0.66, { key: 'Anton', weight: 400, px: r * 0.4, color: '#1a1a1a' });
}, ['KaushanScript-400', 'Anton-400']);
export const kazourajab = mark((c, W, H) => {
  c.fillStyle = '#f5f5f1'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#3a8d3a'; c.fillRect(0, 0, W, H * 0.03);
  text(c, 'KAZOURAJAB HIGH TECH INC', W * 0.5, H * 0.13, { key: 'BarlowCondensed', weight: 800, px: H * 0.16, maxW: W * 0.94, color: '#1c1c1c' });
  const tags = [['boost', '#f7941d', '#1a1a1a'], ['AT&T', '#ffffff', '#1c86c8'], ['T-Mobile', '#e20074', '#ffffff'], ['ultra', '#ffffff', '#6a2c91'],
    ['NET10', '#ffffff', '#222222'], ['SIMPLE', '#ffffff', '#1a1a1a'], ['h2o', '#ffffff', '#0e76bc'], ['Lyca', '#ffffff', '#0072bc']];
  tags.forEach(([t, bg, fg], i) => {
    const col = i % 2, row = Math.floor(i / 2), x = W * (0.03 + col * 0.19), y = H * (0.27 + row * 0.16), w = W * 0.17, h = H * 0.13;
    c.fillStyle = bg; c.fillRect(x, y, w, h); c.strokeStyle = '#d0d0cc'; c.lineWidth = 1; c.strokeRect(x, y, w, h);
    text(c, t, x + w / 2, y + h / 2, { key: 'Inter', weight: 800, px: h * 0.62, maxW: w * 0.9, color: fg });
  });
  const lines = ['* AIRTIME MINUTES', '* COMPUTER SALES', '* PHONES & ACCESSORIES', '* CERTIFIED TRANSLATION', '* PHONE REPAIRS', '* WHOLESALE & RETAIL'];
  lines.forEach((t, i) => text(c, t, W * 0.62, H * (0.3 + i * 0.1), { key: 'Inter', weight: 700, px: H * 0.07, maxW: W * 0.3, color: '#222', align: 'left' }));
  // the flag corner
  for (let s = 0; s < 7; s++) { c.fillStyle = s % 2 ? '#ffffff' : '#c8202b'; c.fillRect(W * 0.86, H * (0.3 + s * 0.05), W * 0.12, H * 0.05); }
  c.fillStyle = '#233a8c'; c.fillRect(W * 0.86, H * 0.3, W * 0.05, H * 0.18);
  text(c, '355 W 125 TH', W * 0.13, H * 0.93, { key: 'Inter', weight: 800, px: H * 0.07, color: '#1c1c1c' });
}, ['BarlowCondensed-800', 'Inter-800', 'Inter-700']);
export const nails = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a4fb5'); g.addColorStop(1, '#17307e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  text(c, 'Harlem USA', W * 0.5, H * 0.2, { key: 'LibreBaskerville', weight: 400, px: H * 0.18, color: '#ffffff', italic: true });
  text(c, 'NAILS', W * 0.44, H * 0.55, { key: 'BarlowCondensed', weight: 800, px: H * 0.46, maxW: W * 0.6, color: '#ffffff', track: 0.03 });
  text(c, 'II', W * 0.84, H * 0.57, { key: 'LibreBaskerville', weight: 700, px: H * 0.32, color: '#ffffff' });
  text(c, '355 B W 125 ST', W * 0.26, H * 0.88, { key: 'Inter', weight: 800, px: H * 0.09, color: '#ffffff' });
  text(c, '212-865-4871', W * 0.76, H * 0.88, { key: 'Inter', weight: 800, px: H * 0.09, color: '#ffffff' });
}, ['LibreBaskerville-400i', 'LibreBaskerville-700', 'BarlowCondensed-800', 'Inter-800']);
function diamond(c, x, y, s, col) {
  c.fillStyle = col; c.beginPath();
  c.moveTo(x - s, y - s * 0.35); c.lineTo(x - s * 0.55, y - s * 0.8); c.lineTo(x + s * 0.55, y - s * 0.8); c.lineTo(x + s, y - s * 0.35); c.lineTo(x, y + s * 0.9); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(x - s, y - s * 0.35); c.lineTo(x + s, y - s * 0.35); c.moveTo(x - s * 0.3, y - s * 0.8); c.lineTo(x, y + s * 0.9); c.lineTo(x + s * 0.3, y - s * 0.8); c.stroke();
}
export const gem = mark((c, W, H) => {
  c.fillStyle = '#0e0e0e'; c.fillRect(0, 0, W, H);
  // the GEM block (the left 38 %)
  diamond(c, W * 0.19, H * 0.15, H * 0.1, '#ffffff');
  text(c, 'GEM', W * 0.19, H * 0.47, { key: 'Anton', weight: 400, px: H * 0.4, maxW: W * 0.3, color: '#e3262d', stroke: '#ffffff', strokeW: 0.05, track: 0.04 });
  text(c, 'PAWNBROKERS', W * 0.19, H * 0.76, { key: 'Inter', weight: 800, px: H * 0.1, maxW: W * 0.32, color: '#ffffff', track: 0.08 });
  text(c, 'WWW.GEMPAWNBROKERS.COM', W * 0.19, H * 0.9, { key: 'Inter', weight: 700, px: H * 0.055, maxW: W * 0.32, color: '#cccccc' });
  c.fillStyle = '#3a3a3a'; c.fillRect(W * 0.385, H * 0.08, W * 0.004, H * 0.84);
  text(c, 'WE BUY & LOAN', W * 0.69, H * 0.24, { key: 'Anton', weight: 400, px: H * 0.3, maxW: W * 0.58, color: '#ffffff', track: 0.02 });
  text(c, 'GOLD ◆ DIAMONDS ◆ WATCHES', W * 0.69, H * 0.52, { key: 'BarlowCondensed', weight: 800, px: H * 0.17, maxW: W * 0.58, color: '#ffffff' });
  c.fillStyle = '#f2c300'; c.fillRect(W * 0.43, H * 0.68, W * 0.25, H * 0.2);
  text(c, 'PRESTAMOS', W * 0.555, H * 0.78, { key: 'BarlowCondensed', weight: 800, px: H * 0.15, maxW: W * 0.23, color: '#111111' });
  text(c, '212-865-9400', W * 0.85, H * 0.78, { key: 'Inter', weight: 800, px: H * 0.12, maxW: W * 0.26, color: '#ffffff' });
}, ['Anton-400', 'Inter-800', 'Inter-700', 'BarlowCondensed-800']);
export const perfectbrows = mark((c, W, H) => {
  c.fillStyle = '#f7f5f2'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#e6639f'; c.beginPath(); c.arc(W * 0.5, H * 0.13, H * 0.09, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = H * 0.018; c.beginPath(); c.arc(W * 0.5, H * 0.16, H * 0.05, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  text(c, 'Perfect Brows', W * 0.5, H * 0.42, { key: 'GreatVibes', weight: 400, px: H * 0.36, maxW: W * 0.92, color: '#c42f7c' });
  text(c, 'THREADING SALON', W * 0.5, H * 0.66, { key: 'Inter', weight: 700, px: H * 0.09, maxW: W * 0.7, color: '#6b5a62', track: 0.12 });
  for (let i = 0; i < 5; i++) {
    const x = W * (0.18 + i * 0.16), y = H * 0.84;
    c.strokeStyle = '#3b2b30'; c.lineWidth = H * 0.02; c.beginPath(); c.ellipse(x, y, W * 0.05, H * 0.04, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#3b2b30'; c.beginPath(); c.arc(x, y, H * 0.02, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(x - W * 0.055, y - H * 0.07); c.quadraticCurveTo(x, y - H * 0.12, x + W * 0.055, y - H * 0.065); c.stroke();
  }
}, ['GreatVibes-400', 'Inter-700']);
export const deligrill = mark((c, W, H) => {
  c.fillStyle = '#241a14'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#b8322b'; c.beginPath(); c.arc(H * 0.55, H * 0.5, H * 0.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f1e6d0'; c.lineWidth = H * 0.05; c.stroke();
  text(c, 'DELI', H * 0.55, H * 0.52, { key: 'Oswald', weight: 700, px: H * 0.26, color: '#f1e6d0' });
  text(c, 'DELI & GRILL', W * 0.56, H * 0.52, { key: 'Oswald', weight: 700, px: H * 0.62, maxW: W * 0.75, color: '#ffffff', track: 0.05 });
}, ['Oswald-700']);

// ---------------------------------------------------------------- 321 W 125th, the St. Nicholas Ave side
export const gourmetdeli = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#8e86a6'); g.addColorStop(0.5, '#a9a3bd'); g.addColorStop(1, '#bcb7cf');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffffff'; c.fillRect(0, H * 0.78, W, H * 0.22);
  // the red roundel with a burger
  c.fillStyle = '#d6322a'; c.beginPath(); c.ellipse(H * 0.62, H * 0.5, H * 0.46, H * 0.44, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2b632'; c.beginPath(); c.ellipse(H * 0.62, H * 0.43, H * 0.27, H * 0.17, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#5b2f17'; c.fillRect(H * 0.36, H * 0.5, H * 0.52, H * 0.08);
  c.fillStyle = '#f2b632'; c.fillRect(H * 0.36, H * 0.61, H * 0.52, H * 0.08);
  text(c, 'GOURMET DELI', W * 0.5, H * 0.5, { key: 'Oswald', weight: 700, px: H * 0.8, maxW: W * 0.7, color: '#ffffff', stroke: '#5a1f2e', strokeW: 0.1, track: 0.02 });
  c.fillStyle = '#2a5bb8'; c.fillRect(W * 0.955, H * 0.14, W * 0.032, H * 0.72);
}, ['Oswald-700']);
export const seasea = mark((c, W, H) => {
  c.fillStyle = '#0c0c0d'; c.fillRect(0, 0, W, H);
  // a white whale, left
  c.fillStyle = '#eceae4'; c.beginPath(); c.ellipse(W * 0.075, H * 0.5, H * 0.62, H * 0.3, -0.18, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0c0c0d'; c.beginPath(); c.arc(W * 0.052, H * 0.44, H * 0.045, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#38a86b'; c.beginPath(); c.ellipse(W * 0.082, H * 0.62, H * 0.3, H * 0.07, -0.18, 0, Math.PI); c.fill();
  text(c, 'SEA & SEA', W * 0.43, H * 0.5, { key: 'Anton', weight: 400, px: H * 0.78, maxW: W * 0.4, color: '#ecebe6', track: 0.03 });
  // a red crab, right of the name
  c.fillStyle = '#d8453a'; c.beginPath(); c.ellipse(W * 0.69, H * 0.52, H * 0.55, H * 0.32, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f0b0a0'; c.beginPath(); c.ellipse(W * 0.69, H * 0.5, H * 0.34, H * 0.18, 0, 0, Math.PI * 2); c.fill();
  for (const sg of [-1, 1]) { c.fillStyle = '#d8453a'; c.beginPath(); c.ellipse(W * 0.69 + sg * H * 0.62, H * 0.33, H * 0.18, H * 0.12, sg * 0.5, 0, Math.PI * 2); c.fill(); }
  const lines = ['We Steam your Fish & Veggie', 'Fried Seafood • Fish & Chips', 'Fish Sandwiches'];
  lines.forEach((t, i) => text(c, t, W * 0.87, H * (0.28 + i * 0.22), { key: 'Inter', weight: 700, px: H * 0.15, maxW: W * 0.2, color: '#f2f2f0' }));
}, ['Anton-400', 'Inter-700']);
export const newtang = mark((c, W, H) => {
  c.fillStyle = '#d4232c'; c.fillRect(0, 0, W, H);
  // a white square with two characters, left
  c.fillStyle = '#ffffff'; c.fillRect(W * 0.03, H * 0.15, W * 0.1, H * 0.7);
  c.fillStyle = '#d4232c'; c.fillRect(W * 0.055, H * 0.25, W * 0.05, H * 0.07); c.fillRect(W * 0.055, H * 0.42, W * 0.05, H * 0.06); c.fillRect(W * 0.07, H * 0.25, W * 0.02, H * 0.5);
  text(c, 'New Tang S.', W * 0.57, H * 0.4, { key: 'KaushanScript', weight: 400, px: H * 0.6, maxW: W * 0.7, color: '#ffffff', stroke: '#7a0f14', strokeW: 0.04 });
  text(c, 'CHINESE FOOD • TAKE OUT • DELIVERY', W * 0.57, H * 0.82, { key: 'Inter', weight: 700, px: H * 0.1, maxW: W * 0.7, color: '#ffffff' });
}, ['KaushanScript-400', 'Inter-700']);

// ---------------------------------------------------------------- 350 W 125th, the St. Nicholas Ave side
export const pizzahut = mark((c, W, H) => {
  c.fillStyle = '#14141a'; c.fillRect(0, 0, W, H);
  // the red roof, left of the name
  c.fillStyle = '#e1251b'; c.beginPath();
  c.moveTo(W * 0.03, H * 0.66); c.quadraticCurveTo(W * 0.1, H * 0.12, W * 0.2, H * 0.2); c.lineTo(W * 0.235, H * 0.52); c.quadraticCurveTo(W * 0.13, H * 0.4, W * 0.03, H * 0.66); c.closePath(); c.fill();
  text(c, 'Pizza Hut', W * 0.6, H * 0.5, { key: 'Inter', weight: 800, px: H * 0.95, maxW: W * 0.66, color: '#ffffff', italic: true });
}, ['Inter-800']);

// ---------------------------------------------------------------- St. Nicholas to FDB, north side
export const chipotle = mark((c, W, H) => {
  const r = Math.min(W, H) * 0.47;
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, H / 2, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#451400'; c.beginPath(); c.arc(W / 2, H / 2, r * 0.88, 0, Math.PI * 2); c.fill();
  // a stylised chile pepper (the stem up, the pod curving down to the left)
  c.fillStyle = '#f3e6d0'; c.beginPath();
  c.moveTo(W * 0.52, H * 0.3); c.bezierCurveTo(W * 0.7, H * 0.32, W * 0.68, H * 0.6, W * 0.5, H * 0.76);
  c.bezierCurveTo(W * 0.42, H * 0.82, W * 0.34, H * 0.78, W * 0.4, H * 0.7); c.bezierCurveTo(W * 0.52, H * 0.58, W * 0.5, H * 0.42, W * 0.46, H * 0.36);
  c.closePath(); c.fill();
  c.fillRect(W * 0.49, H * 0.2, W * 0.035, H * 0.12);
  c.strokeStyle = '#451400'; c.lineWidth = r * 0.07; c.beginPath(); c.moveTo(W * 0.56, H * 0.38); c.bezierCurveTo(W * 0.62, H * 0.5, W * 0.56, H * 0.62, W * 0.49, H * 0.7); c.stroke();
}, []);
export const chipotleSign = mark((c, W, H) => {
  const r = H * 0.22, b = H * 0.08, sq = H - 2 * b;
  c.fillStyle = '#ffffff'; rrect(c, 0, 0, W, H, r); c.fill();
  c.fillStyle = '#4a2415'; rrect(c, b, b, sq, sq, r * 0.7); c.fill();
  c.save(); c.translate(b, b); c.scale(sq, sq);                      // the pepper in unit coordinates
  c.fillStyle = '#f3e6d0'; c.beginPath();
  c.moveTo(0.52, 0.3); c.bezierCurveTo(0.7, 0.32, 0.68, 0.6, 0.5, 0.76); c.bezierCurveTo(0.42, 0.82, 0.34, 0.78, 0.4, 0.7); c.bezierCurveTo(0.52, 0.58, 0.5, 0.42, 0.46, 0.36);
  c.closePath(); c.fill(); c.fillRect(0.49, 0.2, 0.035, 0.12);
  c.strokeStyle = '#4a2415'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0.56, 0.38); c.bezierCurveTo(0.62, 0.5, 0.56, 0.62, 0.49, 0.7); c.stroke();
  c.restore();
  const px0 = b + sq + b * 0.6, pw = W - b - px0;
  c.fillStyle = '#c4281e'; rrect(c, px0, b, pw, H - 2 * b, r * 0.7); c.fill();
  text(c, 'CHIPOTLE', px0 + pw / 2, H * 0.53, { key: 'Oswald', weight: 700, px: H * 0.6, maxW: pw * 0.9, color: '#ffffff', track: 0.05 });
}, ['Oswald-700']);
export const orange = mark((c, W, H) => {
  const r = Math.min(W, H) * 0.44;
  c.fillStyle = '#f07d18'; c.beginPath(); c.arc(W / 2, H * 0.55, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = r * 0.08; c.stroke();
  c.fillStyle = '#3f8a2f'; c.beginPath(); c.ellipse(W * 0.62, H * 0.12, r * 0.35, r * 0.14, -0.5, 0, Math.PI * 2); c.fill();
  text(c, 'orange', W / 2, H * 0.57, { key: 'KaushanScript', weight: 400, px: r * 0.55, maxW: r * 1.7, color: '#ffffff' });
}, ['KaushanScript-400']);
// SIGNS' roundel (signMarks.orangeBeauty: the silver ring open at the upper right, the word over a silver
// tongue, the dark red stem); my `orange` stands in if that module has not loaded
export const orangeBeauty = via('orangeBeauty', orange, ['Nunito-800', 'KaushanScript-400']);
export const popeyes = mark((c, W, H) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#2b62b8'; c.fillRect(0, H * 0.84, W, H * 0.16);
  text(c, 'POPEYES', W * 0.5, H * 0.46, { key: 'LeagueSpartan', weight: 800, px: H * 0.62, maxW: W * 0.92, color: '#f15a22', track: 0.02 });
}, ['LeagueSpartan-800']);
function bun(c, x, y, w, h) {
  c.fillStyle = '#f5a623'; c.beginPath(); c.ellipse(x, y - h * 0.18, w * 0.5, h * 0.3, 0, Math.PI, 0); c.fill();
  c.beginPath(); c.ellipse(x, y + h * 0.26, w * 0.5, h * 0.2, 0, 0, Math.PI); c.fill();
  c.fillStyle = '#d6252e'; c.fillRect(x - w * 0.5, y - h * 0.18, w, h * 0.44);
}
export const bkpopeyes = mark((c, W, H) => {
  c.fillStyle = '#d6252e'; c.fillRect(0, 0, W, H);
  // a bun roundel at the left, a Louisiana Kitchen roundel, the name, NOW OPEN, a bun roundel at the right
  bun(c, W * 0.06, H * 0.5, H * 0.62, H * 0.62);
  text(c, 'BURGER', W * 0.06, H * 0.44, { key: 'LeagueSpartan', weight: 800, px: H * 0.1, maxW: H * 0.5, color: '#ffffff' });
  text(c, 'KING', W * 0.06, H * 0.55, { key: 'LeagueSpartan', weight: 800, px: H * 0.1, maxW: H * 0.5, color: '#ffffff' });
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W * 0.2, H * 0.5, H * 0.34, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f15a22'; c.beginPath(); c.arc(W * 0.2, H * 0.5, H * 0.26, 0, Math.PI * 2); c.fill();
  text(c, 'LOUISIANA', W * 0.2, H * 0.44, { key: 'Inter', weight: 800, px: H * 0.07, maxW: H * 0.45, color: '#ffffff' });
  text(c, 'KITCHEN', W * 0.2, H * 0.56, { key: 'Inter', weight: 800, px: H * 0.07, maxW: H * 0.45, color: '#ffffff' });
  text(c, 'POPEYES', W * 0.2, H * 0.9, { key: 'LeagueSpartan', weight: 800, px: H * 0.1, color: '#ffffff' });
  text(c, 'NOW', W * 0.52, H * 0.3, { key: 'Anton', weight: 400, px: H * 0.36, color: '#ffcc33' });
  text(c, 'OPEN!', W * 0.62, H * 0.66, { key: 'Anton', weight: 400, px: H * 0.46, color: '#ffcc33', stroke: '#7a0f14', strokeW: 0.05 });
  bun(c, W * 0.9, H * 0.5, H * 0.62, H * 0.62);
  text(c, 'BURGER', W * 0.9, H * 0.44, { key: 'LeagueSpartan', weight: 800, px: H * 0.1, maxW: H * 0.5, color: '#ffffff' });
  text(c, 'KING', W * 0.9, H * 0.55, { key: 'LeagueSpartan', weight: 800, px: H * 0.1, maxW: H * 0.5, color: '#ffffff' });
}, ['LeagueSpartan-800', 'Inter-800', 'Anton-400']);
export const discountjunction = mark((c, W, H) => {
  c.fillStyle = '#f4f3ef'; c.fillRect(0, 0, W, H);
  text(c, 'DISCOUNT JUNCTION', W * 0.5, H * 0.6, { key: 'Oswald', weight: 700, px: H * 0.3, maxW: W * 0.94, color: '#d9232d' });
  c.fillStyle = '#d9232d'; c.fillRect(W * 0.03, H * 0.79, W * 0.94, H * 0.14);
  text(c, 'SCHOOL & PARTY SUPPLIES    HARDWARE    BATH STUFF & MORE', W * 0.5, H * 0.86, { key: 'Oswald', weight: 600, px: H * 0.1, maxW: W * 0.9, color: '#ffffff' });
}, ['Oswald-700', 'Oswald-600']);

// ---------------------------------------------------------------- 2329 8th Ave tenants
export const puregym = mark((c, W, H) => {
  c.fillStyle = '#1a1b1d'; c.fillRect(0, 0, W, H);
  const px = text(c, 'PUREGYM', W * 0.66, H * 0.52, { key: 'Montserrat', weight: 700, px: H * 0.46, maxW: W * 0.55, color: '#ffffff', track: 0.02 });
  c.fillStyle = '#16b8b0'; c.beginPath(); c.arc(W * 0.66 - W * 0.3, H * 0.52, px * 0.34, 0, Math.PI * 2); c.fill();
}, ['Montserrat-700']);
export const puregymV = mark((c, W, H) => {
  c.fillStyle = '#111214'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H * 0.45); c.rotate(-Math.PI / 2);
  text(c, 'PUREGYM', 0, 0, { key: 'Montserrat', weight: 700, px: W * 0.46, maxW: H * 0.78, color: '#ffffff', track: 0.04 });
  c.restore();
  c.fillStyle = '#16b8b0'; c.beginPath(); c.arc(W / 2, H * 0.92, W * 0.16, 0, Math.PI * 2); c.fill();
}, ['Montserrat-700']);
const capitaloneOwn = (c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b3f8a'); g.addColorStop(1, '#0d2657');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#6c8fd6'; c.lineWidth = H * 0.03; c.strokeRect(H * 0.04, H * 0.04, W - H * 0.08, H * 0.92);
  text(c, 'Capital', W * 0.32, H * 0.56, { key: 'Inter', weight: 800, px: H * 0.4, maxW: W * 0.34, color: '#ffffff', italic: true });
  text(c, 'One', W * 0.58, H * 0.56, { key: 'Inter', weight: 600, px: H * 0.4, maxW: W * 0.2, color: '#ffffff', italic: true });
  text(c, 'Bank', W * 0.82, H * 0.56, { key: 'Inter', weight: 800, px: H * 0.34, maxW: W * 0.2, color: '#ffffff' });
  // the swoosh: a red arc over "One"
  c.strokeStyle = '#d22e1e'; c.lineWidth = H * 0.07; c.lineCap = 'round';
  c.beginPath(); c.moveTo(W * 0.43, H * 0.33); c.quadraticCurveTo(W * 0.56, H * 0.02, W * 0.7, H * 0.2); c.stroke();
};
export const capitalone = via('capitalOneBank', capitaloneOwn, ['Inter-800', 'Inter-600', 'Lato-900', 'Lato-700i', 'Lato-700']);

// ---------------------------------------------------------------- south side marks
const chaseOwn = (c, W, H) => {
  // an octagon of four rotated wedges round a square
  const s = Math.min(W, H) * 0.46, x = W / 2, y = H / 2;
  c.fillStyle = '#ffffff';
  for (let k = 0; k < 4; k++) {
    c.save(); c.translate(x, y); c.rotate((k * Math.PI) / 2);
    c.beginPath(); c.moveTo(-s * 0.3, -s); c.lineTo(s * 0.42, -s); c.lineTo(s, -s * 0.42); c.lineTo(s * 0.3, -s * 0.42); c.lineTo(s * 0.3, -s * 0.3 - 0.001); c.lineTo(-s * 0.3, -s * 0.42); c.closePath(); c.fill();
    c.restore();
  }
};
export const chase = via('chaseOctagon', chaseOwn, []);
const mcdOwn = (c, W, H) => {
  const s = Math.min(W, H);
  c.strokeStyle = '#ffc72c'; c.lineWidth = s * 0.14; c.lineCap = 'butt';
  const x = W / 2, b = H * 0.92;
  c.beginPath(); c.moveTo(x - s * 0.44, b); c.bezierCurveTo(x - s * 0.44, H * 0.02, x - s * 0.04, H * 0.02, x - s * 0.02, H * 0.55);
  c.moveTo(x + s * 0.44, b); c.bezierCurveTo(x + s * 0.44, H * 0.02, x + s * 0.04, H * 0.02, x + s * 0.02, H * 0.55); c.stroke();
};
export const mcd = via('goldenArches', mcdOwn, []);
export const citymd = mark((c, W, H) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#e11b2d'; c.fillRect(W * 0.08, H * 0.2, H * 0.6, H * 0.6);
  c.fillStyle = '#ffffff'; c.fillRect(W * 0.08 + H * 0.24, H * 0.28, H * 0.12, H * 0.44); c.fillRect(W * 0.08 + H * 0.08, H * 0.44, H * 0.44, H * 0.12);
  text(c, 'CityMD', W * 0.58, H * 0.46, { key: 'Montserrat', weight: 800, px: H * 0.46, maxW: W * 0.6, color: '#e11b2d' });
  text(c, 'URGENT CARE', W * 0.58, H * 0.8, { key: 'Montserrat', weight: 600, px: H * 0.13, maxW: W * 0.5, color: '#5c5f63', track: 0.15 });
}, ['Montserrat-800', 'Montserrat-600']);
export const rainbowpanel = mark((c, W, H) => {
  c.fillStyle = '#1e67c6'; c.fillRect(0, 0, W, H);
  text(c, 'Rainbow', W * 0.5, H * 0.4, { key: 'Lobster', weight: 400, px: H * 0.5, maxW: W * 0.8, color: '#ffffff' });
  text(c, 'juniors • shoes • plus sizes', W * 0.5, H * 0.8, { key: 'Inter', weight: 500, px: H * 0.15, maxW: W * 0.86, color: '#ffffff' });
}, ['Lobster-400', 'Inter-500']);
export const usps = mark((c, W, H) => {
  const s = Math.min(W, H);
  c.fillStyle = '#0b3d91'; c.beginPath(); c.moveTo(W / 2 - s * 0.45, H * 0.2); c.lineTo(W / 2 + s * 0.45, H * 0.2); c.lineTo(W / 2 + s * 0.3, H * 0.8); c.lineTo(W / 2 - s * 0.45, H * 0.8); c.closePath(); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = s * 0.05;
  for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(W / 2 - s * 0.35, H * (0.3 + k * 0.14)); c.lineTo(W / 2 + s * 0.3, H * (0.34 + k * 0.1)); c.stroke(); }
}, []);
// Harlem USA's glass billboard: an invented brand (billboards never carry a real one)
export const billboard = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#e9eef2'); g.addColorStop(1, '#d6dde3');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  text(c, 'Small steps are so much sweeter.', W * 0.52, H * 0.42, { key: 'LibreBaskerville', weight: 400, px: H * 0.2, maxW: W * 0.8, color: '#26344a' });
  text(c, 'Save a little every week with Pennywell.', W * 0.5, H * 0.7, { key: 'Inter', weight: 500, px: H * 0.07, maxW: W * 0.5, color: '#26344a' });
  c.fillStyle = '#2bb673'; rrect(c, W * 0.18, H * 0.62, H * 0.16, H * 0.16, H * 0.03); c.fill();
  text(c, 'P', W * 0.18 + H * 0.08, H * 0.7, { key: 'Inter', weight: 800, px: H * 0.12, color: '#ffffff' });
}, ['LibreBaskerville-400', 'Inter-500', 'Inter-800']);
export const cvsOld = mark((c, W, H) => {
  // letters and heart only: the white band of the wall is the ground (a1_s324: a painted panel rendered grey beside it)
  // the heart
  const hx = W * 0.2, hy = H * 0.5, hs = H * 0.34;
  c.fillStyle = '#cc0000'; c.beginPath();
  c.moveTo(hx, hy + hs * 0.9); c.bezierCurveTo(hx - hs * 1.3, hy, hx - hs * 0.8, hy - hs * 1.1, hx, hy - hs * 0.45);
  c.bezierCurveTo(hx + hs * 0.8, hy - hs * 1.1, hx + hs * 1.3, hy, hx, hy + hs * 0.9); c.fill();
  text(c, 'CVS', W * 0.4, H * 0.5, { key: 'Poppins', weight: 800, px: H * 0.62, maxW: W * 0.26, color: '#cc0000', track: -0.02 });
  text(c, 'pharmacy', W * 0.72, H * 0.58, { key: 'Poppins', weight: 500, px: H * 0.4, maxW: W * 0.36, color: '#cc0000' });
}, ['Poppins-800', 'Poppins-500']);
export const cvs = mark((c, W, H) => {
  // heart and letters only (the white band is the ground); the name fills the band's height
  const hx = W * 0.085, hy = H * 0.52, hs = H * 0.4;
  c.fillStyle = '#cc0000'; c.beginPath();
  c.moveTo(hx, hy + hs * 0.9); c.bezierCurveTo(hx - hs * 1.3, hy, hx - hs * 0.8, hy - hs * 1.1, hx, hy - hs * 0.45);
  c.bezierCurveTo(hx + hs * 0.8, hy - hs * 1.1, hx + hs * 1.3, hy, hx, hy + hs * 0.9); c.fill();
  text(c, 'CVS', W * 0.31, H * 0.5, { key: 'Poppins', weight: 800, px: H * 0.98, maxW: W * 0.3, color: '#cc0000', track: -0.02 });
  text(c, 'pharmacy', W * 0.69, H * 0.58, { key: 'Poppins', weight: 500, px: H * 0.72, maxW: W * 0.5, color: '#cc0000' });
}, ['Poppins-800', 'Poppins-500']);
export const pcrletters = mark((c, W, H) => {
  text(c, 'P.C. RICHARD', W * 0.43, H * 0.52, { key: 'Archivo', weight: 900, px: H * 0.82, maxW: W * 0.84, color: '#d7282f', italic: true });
  text(c, '&', W * 0.93, H * 0.28, { key: 'Archivo', weight: 900, px: H * 0.36, color: '#d7282f', italic: true });
  text(c, 'SON', W * 0.93, H * 0.72, { key: 'Archivo', weight: 900, px: H * 0.36, maxW: W * 0.12, color: '#d7282f', italic: true });
}, ['Archivo-900']);
export const partycity = mark((c, W, H) => {
  const cols = ['#e53b3a', '#f7941d', '#f2c200', '#39b54a', '#2b8fd6'];
  c.font = FONT('Poppins', 700, H * 0.8); c.textBaseline = 'middle'; c.textAlign = 'left';
  const word = 'Party', word2 = 'City';
  let w = c.measureText(word + ' ' + word2).width, px = H * 0.8;
  if (w > W * 0.96) { px *= (W * 0.96) / w; c.font = FONT('Poppins', 700, px); w = c.measureText(word + ' ' + word2).width; }
  let x = (W - w) / 2;
  [...word].forEach((ch, i) => { c.fillStyle = cols[i % cols.length]; c.fillText(ch, x, H * 0.5); x += c.measureText(ch).width; });
  x += c.measureText(' ').width;
  [...word2].forEach((ch, i) => { c.fillStyle = ['#7b3fa0', '#2b8fd6', '#39b54a', '#e53b3a'][i]; c.fillText(ch, x, H * 0.5); x += c.measureText(ch).width; });
}, ['Poppins-700']);
export const flaming = mark((c, W, H) => {
  text(c, 'FLAMING GRILL', W / 2, H * 0.34, { key: 'Oswald', weight: 700, px: H * 0.5, maxW: W * 0.96, color: '#e0242c', stroke: '#ffffff', strokeW: 0.1 });
  text(c, '& MODERN BUFFET', W / 2, H * 0.8, { key: 'Oswald', weight: 700, px: H * 0.3, maxW: W * 0.9, color: '#e0242c', stroke: '#ffffff', strokeW: 0.1 });
}, ['Oswald-700']);
export const capitalOneWall = mark((c, W, H) => {
  text(c, 'Capital One', W * 0.4, H * 0.55, { key: 'Inter', weight: 800, px: H * 0.6, maxW: W * 0.62, color: '#ffffff', italic: true });
  text(c, 'Bank', W * 0.86, H * 0.55, { key: 'Inter', weight: 800, px: H * 0.5, maxW: W * 0.22, color: '#ffffff' });
  c.strokeStyle = '#d22e1e'; c.lineWidth = H * 0.09; c.lineCap = 'round';
  c.beginPath(); c.moveTo(W * 0.38, H * 0.3); c.quadraticCurveTo(W * 0.52, H * -0.05, W * 0.68, H * 0.18); c.stroke();
}, ['Inter-800']);
// the pink banners of the ground-floor signband (a white edge round a pink field, white lettering)
const bannerMark = (label, fill) => mark((c, W, H) => {
  c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, W, H);
  c.fillStyle = fill; c.fillRect(W * 0.012, H * 0.1, W * 0.976, H * 0.8);
  text(c, label, W * 0.5, H * 0.5, { key: 'Inter', weight: 700, px: H * 0.52, maxW: W * 0.9, color: '#ffffff' });
}, ['Inter-700']);
export const bannerGreat = bannerMark('Great Style ★ Great Price', '#e08892');
export const bannerDanice = bannerMark('Danice', '#e3808c');
export const puregymWall = mark((c, W, H) => {
  const px = text(c, 'PUREGYM', W * 0.58, H * 0.52, { key: 'Montserrat', weight: 700, px: H * 0.8, maxW: W * 0.8, color: '#ffffff' });
  c.fillStyle = '#16b8b0'; c.beginPath(); c.arc(W * 0.08, H * 0.52, px * 0.34, 0, Math.PI * 2); c.fill();
}, ['Montserrat-700']);

// ================================================================ builders
// a flush curtain wall on a face kit (u / y lists include the ends). Every pane is two smooth tones, a paler upper part (the
// sky in the glass) over a darker lower part (the room, the street), a little different from pane to pane, with a thin glass
// sheen over the lot and the aluminium members (round 2026-10-01: the chipped-paint set behind a clear pane read as rubble).
// o.hi / o.lo: the tones; o.split: the share of a pane that is the dark part (0.4); o.vary: the
// lightness spread between panes (0.08); o.glass: the sheen's set (null = none)
const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
function curtain(kit, us, ys, o = {}) {
  const w0 = o.w ?? 0.0, fw = o.fw ?? 0.06, fd = o.fd ?? 0.09, split = o.split ?? 0.4, vary = o.vary ?? 0.08;
  const hi = o.hi || '#869799', lo = o.lo || o.back || '#5e7174';
  const alu = kit.mat(o.frame || 'alu_white', { tint: o.frameTint });
  const glass = o.glass === null ? null : kit.mat(o.glass || 'glass_clear');
  const KV = 3, tones = [];
  for (let k = 0; k < KV; k++) { const s = 1 + (k - 1) * vary; tones.push([kit.mat('panel_grey', { tint: shade(hi, s), dirt: 0.02 }), kit.mat('panel_grey', { tint: shade(lo, s), dirt: 0.02 })]); }
  const u0 = us[0], u1 = us[us.length - 1], y0 = ys[0], y1 = ys[ys.length - 1], z = w0 + 0.012;
  for (let i = 0; i + 1 < ys.length; i++) {
    for (let j = 0; j + 1 < us.length; j++) {
      const a = us[j], b = us[j + 1], c = ys[i], d = ys[i + 1], m = c + (d - c) * split, [mh, ml] = tones[Math.floor(hsh(j + 1, i + 7) * KV) % KV];
      kit.poly(ml, [[a, c, z], [b, c, z], [b, m, z], [a, m, z]], [0, 0, 1]);
      kit.poly(mh, [[a, m, z], [b, m, z], [b, d, z], [a, d, z]], [0, 0, 1]);
    }
  }
  if (glass) kit.poly(glass, [[u0, y0, w0 + 0.03], [u1, y0, w0 + 0.03], [u1, y1, w0 + 0.03], [u0, y1, w0 + 0.03]], [0, 0, 1]);
  for (const u of us) kit.box(alu, u - fw / 2, u + fw / 2, y0, y1, w0, w0 + fd, { c: 0.006, near: true });
  for (const y of ys) kit.box(alu, u0, u1, y - fw / 2, y + fw / 2, w0, w0 + fd, { c: 0.006, near: true });
  // o.sp: spandrel bands (the slab edges and shadow boxes) across the interior lines, in o.spTint
  if (o.sp) { const sm = kit.mat('panel_grey', { tint: o.spTint || '#8f969c', dirt: 0.04 }); for (const y of ys.slice(1, -1)) kit.box(sm, u0, u1, y - o.sp / 2, y + o.sp / 2, w0 + 0.005, w0 + 0.045, { c: 0.004, near: true }); }
}
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
// an opaque two-tone pane standing in a window opening in front of the kit's own pane (the real glass reflects the sky: pale; the kit's
// room behind clear glass reads dark): hi over lo, `split` the share of lo
function pane2(kit, u0, u1, y0, y1, w, hi, lo, split = 0.4, k = 1) {
  const mh = kit.mat('panel_grey', { tint: shade(hi, 0.94 + 0.12 * hsh(u0 * 3.1, y0 * 1.7 + k)), dirt: 0.02 }), ml = kit.mat('panel_grey', { tint: shade(lo, 0.94 + 0.12 * hsh(u1 * 2.3, y1 * 1.3 + k)), dirt: 0.02 });
  const m = y0 + (y1 - y0) * split;
  kit.poly(ml, [[u0, y0, w], [u1, y0, w], [u1, m, w], [u0, m, w]], [0, 0, 1]);
  kit.poly(mh, [[u0, m, w], [u1, m, w], [u1, y1, w], [u0, y1, w]], [0, 0, 1]);
}
// the joints of a metal-panel skin: dark hairline grooves (dy x du modules) over a rectangle of the face
function panelJoints(kit, u0, u1, y0, y1, o = {}) {
  const m = kit.mat('panel_grey', { tint: o.tint || '#4d5253', dirt: 0.12 }), dy = o.dy ?? 0.76, du = o.du ?? 2.3, d = o.d ?? 0.007;
  for (let y = y0; y < y1 - 0.02; y += dy) kit.box(m, u0, u1, y, y + 0.014, 0, d, { c: 0, near: true });
  for (let u = u0; u < u1 - 0.02; u += du) kit.box(m, u, u + 0.014, y0, y1, 0, d, { c: 0, near: true });
}
// a quarter-round (dome) awning over [u0, u1], its top at yTop, projecting `proj`, the valance `drop` high, lettered along the valance
function domeAwning(kit, u0, u1, yTop, proj, drop, color, text, o = {}) {
  const m = kit.mat('fab_awning', { tint: color });
  const cy = yTop - proj, prof = [];
  for (let t = 0; t <= 8; t++) { const th = (t / 8) * Math.PI / 2; prof.push([Math.max(0.01, proj * Math.sin(th)), cy + proj * Math.cos(th)]); }
  prof.push([proj, cy - drop], [0.01, cy - drop]);
  kit.extrude(m, prof, u0, u1, { smooth: 30 });
  if (text) kit.sign({ kind: 'painted', text, font: o.font || 'Oswald-600', fg: o.fg || '#ffffff', bg: null, u0: u0 + 0.15, u1: u1 - 0.15, h: drop * 0.8, y: cy - drop * 0.9 }, { z: proj + 0.006 });
}

// a closed roll-down gate over [u0, u1] x [0, H] on a face kit: the housing, the guides, the curtain as shallow ribs, the bottom
// bar and, when o.tags (a seed), spray tags on the curtain. Smooth painted panel: the kit's chipped-paint set reads as marble here
// spray work on a gate (invented pieces in the NYC style: grey abatement patches, throw-ups in bubble letters with a dark outline,
// marker tags and a few drips; the seed picks words, palette and places, nothing is copied from a photo)
const TAG_COL = ['#ec4a9a', '#ffffff', '#ec4a9a', '#e23a2a', '#f2f2f2', '#7a4fd0', '#f2c200'];
const TAG_WORDS = ['ZOOM', 'RAZE', 'NOVA', 'TAKE', 'KID', 'SKY', 'PACE', 'LOCO'];
const tagMarks = new Map();
function tagsMark(seed, dens = 0.6) {
  const key = seed + ':' + dens;
  let m = tagMarks.get(key);
  if (!m) {
    m = mark((c, W, H) => {
      c.clearRect(0, 0, W, H);
      const r = (i) => hsh(seed, i);
      // paint-over patches in two greys, the way a gate is buffed
      for (let i = 0; i < 2; i++) {
        c.fillStyle = i ? 'rgba(176,176,170,0.6)' : 'rgba(128,130,132,0.5)';
        c.fillRect(W * (0.04 + 0.5 * r(100 + i)), H * (0.3 + 0.3 * r(110 + i)), W * (0.22 + 0.25 * r(120 + i)), H * (0.2 + 0.25 * r(130 + i)));
      }
      // throw-ups
      const n = 2 + Math.floor(r(1) * 2 + dens * 2.5);
      for (let i = 0; i < n; i++) {
        c.save(); c.translate(W * (0.14 + 0.72 * r(10 + i)), H * (0.5 + 0.34 * r(20 + i))); c.rotate((r(40 + i) - 0.5) * 0.3);
        const word = TAG_WORDS[Math.floor(r(30 + i) * TAG_WORDS.length)], px = H * (0.16 + 0.12 * r(50 + i) + (i === 0 ? 0.1 * dens : 0));
        text(c, word, 0, 0, { key: 'Lobster', weight: 400, px, maxW: W * (0.34 + (i === 0 ? 0.14 * dens : 0)), color: TAG_COL[Math.floor(r(60 + i) * TAG_COL.length)], stroke: '#161616', strokeW: 0.14 });
        c.restore();
      }
      // marker tags: quick loops and strokes
      const nm = 5 + Math.round(dens * 9);
      for (let i = 0; i < nm; i++) {
        c.strokeStyle = ['#111111', '#e23a2a', '#111111', '#7a4fd0', '#f2f2f2'][i % 5]; c.lineWidth = Math.max(1.5, H * 0.012); c.lineCap = 'round';
        const x = W * (0.08 + 0.84 * r(200 + i)), y = H * (0.3 + 0.55 * r(210 + i)), s = W * (0.05 + 0.08 * r(220 + i));
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + s, y - s * 0.8, x + s * 1.4, y + s * 0.9, x + s * 2.2, y - s * 0.2); c.bezierCurveTo(x + s * 2.6, y - s * 0.5, x + s * 1.8, y + s * 0.2, x + s * 2.5, y + s * 0.5); c.stroke();
      }
      // drips under the pieces
      for (let i = 0; i < 6; i++) {
        c.strokeStyle = TAG_COL[Math.floor(r(300 + i) * TAG_COL.length)]; c.lineWidth = Math.max(1.5, H * 0.008);
        const x = W * (0.1 + 0.8 * r(310 + i)), y = H * (0.55 + 0.3 * r(320 + i));
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + W * 0.002, y + H * (0.04 + 0.07 * r(330 + i))); c.stroke();
      }
    }, ['Lobster-400']);
    tagMarks.set(key, m);
  }
  return m;
}
function rolldown(kit, u0, u1, H, o = {}) {
  const m = kit.mat('panel_grey', { tint: o.color || '#9a9ea2', dirt: o.dirt ?? 0.06 });
  const hb = 0.34, yt = H - hb, down = Math.min(1, o.down ?? 1), yb = yt - yt * down;
  kit.box(m, u0 - 0.04, u1 + 0.04, yt, H + 0.02, -0.01, 0.34, { c: 0.015 });
  kit.box(m, u0 - 0.02, u0 + 0.05, 0, yt, -0.01, 0.07, { c: 0.004 });
  kit.box(m, u1 - 0.05, u1 + 0.02, 0, yt, -0.01, 0.07, { c: 0.004 });
  if (down < 0.01) return;
  kit.box(m, u0 + 0.05, u1 - 0.05, yb, yt, 0.02, 0.034, { c: 0 });
  for (let y = yt - 0.07; y > yb + 0.05; y -= 0.075) kit.box(m, u0 + 0.05, u1 - 0.05, y - 0.012, y + 0.012, 0.034, 0.046, { c: 0, near: true });
  kit.box(m, u0 + 0.05, u1 - 0.05, yb, yb + 0.07, 0.02, 0.07, { c: 0.006, near: true });
  if (o.tags) kit.sign({ kind: 'painted', text: 'tags', u0: u0 + 0.1, u1: u1 - 0.1, y: yb + 0.1, h: Math.max(0.5, yt - yb - 0.25), bg: null, fg: '#ffffff', logo: tagsMark(o.tags, o.dens), logoAt: 'fill' }, { z: 0.052 });
}
// the spec's closed gates (specs/bid1.js prep): on the front face or the avenue face
function drawGates(spec, frame) {
  for (const g of spec.gates || []) {
    const kit = g.edge === 'front' ? frame.kit : (frame.face(g.edge) || {}).kit;
    if (kit) rolldown(kit, g.u0, g.u1, g.H, { color: g.color, down: g.down, tags: g.tags, dens: g.dens });
  }
}
export function gates(group, ctx, spec, frame) { drawGates(spec, frame); roofOf(spec, frame); }

// The kit lays one membrane set per roof (white / black / gravel / pavers).
// spec's roof gets a tinted membrane laid over the slab (an earcut-style triangulation of its ring, 2 cm up), optional patches (u / depth
// shares of the front: a ballasted field, a skylight band) and rooftop units from the same image. Colours are warm greys read off the aerial.
const ROOFS = {
  // units: [share along the front, share of the depth behind it, w, d, h, tint]
  'w125-383': { tint: '#bfb7af' }, 'w125-381': { tint: '#b4a698' }, 'w125-379': { tint: '#bfb8b2' }, 'w125-377': { tint: '#bdb7b1' }, 'w125-375': { tint: '#66625e' },
  'w125-365': { tint: '#cfcbc6', units: [[0.38, 0.62, 3.2, 2.6, 1.6, '#aeb0b2'], [0.2, 0.3, 1.4, 1.4, 1.0, '#c6c7c7']] },
  'w125-361': { tint: '#786a61', units: [[0.3, 0.6, 3.4, 3.0, 2.6, '#8e8174'], [0.62, 0.35, 2.2, 1.6, 1.3, '#b9baba'], [0.74, 0.5, 2.2, 1.6, 1.3, '#b9baba']] },
  'w125-351': { tint: '#7b7b7e', units: [[0.2, 0.28, 3.0, 3.0, 2.4, '#a5a6a7'], [0.66, 0.34, 2.0, 2.0, 1.2, '#b4b4b3']] },   // (a third unit at [0.5, 0.7] fell outside the ring, in the rear court: removed 2026-10-02)
  'w125-321': { tint: '#6d665d', units: [[0.12, 0.62, 2.2, 1.8, 1.2, '#b4b4b2'], [0.2, 0.62, 2.2, 1.8, 1.2, '#b4b4b2'], [0.3, 0.7, 2.4, 1.6, 1.1, '#aeaeac'], [0.18, 0.84, 3.0, 2.2, 1.8, '#9a9087']] },
  'w125-319': { tint: '#566476' }, 'w125-317': { tint: '#686f7c', units: [[0.4, 0.4, 1.8, 1.8, 1.3, '#b9b9b7'], [0.62, 0.45, 1.8, 1.8, 1.3, '#b9b9b7'], [0.5, 0.78, 4.0, 1.4, 0.7, '#c4c4c2']] },
  'w125-313': { tint: '#585454', units: [[0.5, 0.1, 3.0, 3.0, 2.8, '#8f8479'], [0.4, 0.3, 1.6, 1.6, 1.2, '#b4b4b2'], [0.65, 0.34, 1.6, 1.6, 1.2, '#b4b4b2']] },
  'w125-309': { tint: '#a59e9b' }, 'w125-307': { tint: '#938f8a' }, 'w125-305': { tint: '#3c4d5e' },
  '2329-8av': { tint: '#a0907f', units: [[0.56, 0.74, 1.7, 1.7, 1.2, '#b9b9b6'], [0.64, 0.74, 1.7, 1.7, 1.2, '#b9b9b6'], [0.56, 0.68, 1.7, 1.7, 1.2, '#b9b9b6'], [0.64, 0.68, 1.7, 1.7, 1.2, '#b9b9b6'],
    [0.57, 0.52, 1.7, 1.7, 1.2, '#b9b9b6'], [0.64, 0.5, 1.7, 1.7, 1.2, '#b9b9b6'], [0.57, 0.46, 1.7, 1.7, 1.2, '#b9b9b6'], [0.3, 0.4, 6.5, 5.5, 3.0, '#a79d92']] },
  'w125-374': { tint: '#2a2c30', units: [[0.3, 0.4, 0.8, 0.8, 0.8, '#b4b4b2']] },
  'hancock-11': { tint: '#74716c' },
  'w125-350': { tint: '#c0b4a8', units: [[0.3, 0.35, 2.2, 1.6, 1.1, '#b4b4b2'], [0.65, 0.4, 2.2, 1.6, 1.1, '#b4b4b2']] },
  'w125-324': { tint: '#c3b6aa', units: [[0.12, 0.2, 1.4, 1.4, 1.1, '#b4b4b2'], [0.22, 0.2, 1.4, 1.4, 1.1, '#b4b4b2'], [0.32, 0.25, 1.4, 1.4, 1.1, '#b4b4b2'], [0.6, 0.55, 1.8, 1.4, 1.1, '#b4b4b2']] },
  // Harlem USA: the ring is an L round the CVS (324 W sits in its north-west notch: u 75.9-106.4, depth 0-27.4 m of the 106.4 x 61.3 m span), so a share of the span is
  // not a share of the 125th front.
  // 75.9 m front; u from the FDB building line, depth from the front): a long white air handler along the north strip (u 8-26 in the two views, centre ~16, depth ~8.6)
  // with a dark unit at its west end, three AC units at u ~66.8 / 53.7 / 40.5 (depth 6.8), a rusty unit at u 25 / depth 26, two vents, a long white unit along the FDB
  // side at the south, the round fan housing (a box here) at u 88 / depth 53 and units on the west wing behind the CVS; the darker ribbed field between u ~15 and the
  // CVS wall. (The first table put a 5 x 2 m unit at 0.88 of the span, over the CVS notch: it floated 6 m above the CVS roof in QA's q1090Ne.)
  '280-stnich': { tint: '#938672', patches: [{ tint: '#817767', u: [0.141, 0.71], d: [0.18, 0.72] }], units: [[0.150, 0.140, 15.0, 3.0, 1.8, '#d6d6d3'], [0.244, 0.147, 2.4, 2.4, 1.2, '#5e514a'],
    [0.628, 0.111, 3.4, 3.0, 1.5, '#c9c9c6'], [0.505, 0.111, 3.4, 3.0, 1.5, '#c9c9c6'], [0.381, 0.111, 3.4, 3.0, 1.5, '#c9c9c6'], [0.235, 0.424, 3.0, 4.2, 1.5, '#7b5446'],
    [0.479, 0.245, 0.8, 0.8, 0.6, '#9a9894'], [0.357, 0.245, 0.8, 0.8, 0.6, '#9a9894'], [0.064, 0.775, 2.5, 11.0, 1.6, '#d0d0cd'], [0.234, 0.870, 2.4, 2.4, 1.3, '#6a6460'],
    [0.831, 0.870, 6.0, 6.0, 2.2, '#a9aaa8'], [0.927, 0.517, 2.5, 2.5, 1.3, '#c4c4c1'], [0.831, 0.592, 2.5, 2.0, 1.3, '#c4c4c1'], [0.805, 0.701, 10.0, 2.5, 1.5, '#d2d2cf']] },
};
// a simple ear-clipping triangulation of a polygon [[u, w], ...]
function earClip(P) {
  const n = P.length, idx = P.map((_, i) => i);
  let area = 0;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) idx.reverse();
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = P[ia], b = P[ib], c = P[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTri(P[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
function roofOf(spec, frame) {
  const R = ROOFS[spec.id];
  if (!R) return;
  const k = frame.kit, y = (spec.h ?? frame.h) + 0.02, [px, pz] = frame.p0, U = frame.u, N = frame.n;
  const P = frame.ring.map(([x, z]) => [(x - px) * U[0] + (z - pz) * U[1], (x - px) * N[0] + (z - pz) * N[1]]);
  if (R.tint) {
    const m = k.mat('cast_stone', { tint: R.tint, dirt: 0.2, rough: 1.2, env: 0.35 });   // (p1 aerSN: a blue sky gradient on the white roofs)
    for (const [a, b, c] of earClip(P)) k.poly(m, [[P[a][0], y, P[a][1]], [P[b][0], y, P[b][1]], [P[c][0], y, P[c][1]]], [0, 1, 0]);
  }
  // u / depth shares: u along the front, depth behind it to the deepest point of the ring
  let umin = 1e9, umax = -1e9, wmin = 1e9;
  for (const [u, w] of P) { umin = Math.min(umin, u); umax = Math.max(umax, u); wmin = Math.min(wmin, w); }
  const at = (su, sd) => [umin + (umax - umin) * su, -(-wmin) * sd];
  // every patch and unit stays over its own roof (QA Q07, 2026-10-02: Harlem USA's L-shaped ring left a unit in the air over the CVS): a unit whose
  // corners or centre fall outside the ring moves toward the ring's centre in fifths, else it is left out; a patch outside is left out; both logged
  const inP = (u, w) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ui, wi] = P[i], [uj, wj] = P[j]; if ((wi > w) !== (wj > w) && u < ((uj - ui) * (w - wi)) / (wj - wi) + ui) c = !c; } return c; };
  const inBox = (uc, wc, hu, hw) => [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inP(uc + a * hu, wc + b * hw));
  const cu = P.reduce((s, p) => s + p[0], 0) / P.length, cw = P.reduce((s, p) => s + p[1], 0) / P.length;
  (R.patches || []).forEach((pt, i) => {
    const m = k.mat('cast_stone', { tint: pt.tint, dirt: 0.25, rough: 1.2, env: 0.35 });
    const [u0] = at(pt.u[0], 0), [u1] = at(pt.u[1], 0), w0 = wmin * pt.d[0], w1 = wmin * pt.d[1];
    if (!inBox((u0 + u1) / 2, (w0 + w1) / 2, Math.abs(u1 - u0) / 2 - 0.05, Math.abs(w1 - w0) / 2 - 0.05)) { console.warn(`[fk] ${spec.id}: bid1 roof patch ${i} left out (outside the footprint)`); return; }
    k.box(m, u0, u1, y - 0.01, y + 0.015, Math.min(w0, w1), Math.max(w0, w1), { c: 0 });
  });
  (R.units || []).forEach(([su, sd, w, d, h, tint], i) => {
    let [uc] = at(su, 0), wc = wmin * sd;
    if (!inBox(uc, wc, w / 2 + 0.05, d / 2 + 0.05)) {
      let s = 1;
      for (; s <= 5; s++) { const u2 = uc + ((cu - uc) * s) / 5, w2 = wc + ((cw - wc) * s) / 5; if (inBox(u2, w2, w / 2 + 0.05, d / 2 + 0.05)) { uc = u2; wc = w2; break; } }
      if (s > 5) { console.warn(`[fk] ${spec.id}: bid1 roof unit ${i} at [${uc.toFixed(1)}, ${wc.toFixed(1)}] left out (outside the footprint)`); return; }
      console.warn(`[fk] ${spec.id}: bid1 roof unit ${i} moved inside the footprint (${s} fifths toward the centre)`);
    }
    const m = k.mat('panel_grey', { tint, dirt: 0.3 });
    k.box(m, uc - w / 2, uc + w / 2, y, y + h, wc - d / 2, wc + d / 2, { c: 0.02 });
    k.box(k.mat('panel_grey', { tint: '#6c6e70', dirt: 0.2 }), uc - w / 2 - 0.05, uc + w / 2 + 0.05, y + h, y + h + 0.07, wc - d / 2 - 0.05, wc + d / 2 + 0.05, { c: 0.01 });
    if (w < 3.2 && d < 3.2) { const fan = k.mat('panel_grey', { tint: '#4a4c4e', dirt: 0.2 }); k.box(fan, uc - w * 0.32, uc + w * 0.32, y + h + 0.07, y + h + 0.1, wc - d * 0.32, wc + d * 0.32, { c: 0 }); }
  });
}
// ---------------------------------------------------------------- curtains. A light curtain quad 2 cm behind each window's pane, in three slightly different whites.
const SHADE_ROW = { 'w125-383': 5.92, 'w125-381': 6.11, 'w125-379': 6.02, 'w125-377': 6.02, 'w125-375': 6.54 };   // front widths: three windows at L/2 - 1 / L/2 / L/2 + 1 ... centres
function shadesOn(kit, centres, y0, nFloors, pitch, seed, share = 0.72) {
  const tones = ['#dcd8cf', '#cfcbc2', '#e4e0d8'].map((c) => kit.mat('plain', { tint: c, rough: 0.95 }));
  for (let f = 0; f < nFloors; f++) {
    centres.forEach((uc, j) => {
      const h = hsh(seed + f * 7.3, j * 3.1 + 1.7);
      if (h > share) return;
      const ya = y0 + pitch * f + 0.08 + 0.1, yb = y0 + pitch * f + 0.08 + 2.15 - (hsh(j, f + seed) > 0.6 ? 0.9 : 0.12);
      const m = tones[Math.floor(hsh(f + 5.5, j + seed) * 3) % 3];
      kit.poly(m, [[uc - 0.38, ya, -0.19], [uc + 0.38, ya, -0.19], [uc + 0.38, yb, -0.19], [uc - 0.38, yb, -0.19]], [0, 0, 1]);   // 1 cm in front of the kit's pane (-rv - 0.05 with rv 0.15), behind the frame: at -0.215 (behind the pane) the curtains did not show (l1_s381)
    });
  }
}
const QB = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const OWN_SHADES = !!(QB && QB.get('b1shades') === '1');
// BF36 (BIDFIX 2026-10-02): 324's St. Nicholas face (see specs/bid1.js W324_STNICH); `?bf36=0` as before
const BF36 = !(QB && QB.get('bf36') === '0');   // A/B: my curtain quads of wave 1 (the specs now ask the kit for sheers)
function tenementShades(spec, frame) {
  const L = SHADE_ROW[spec.id];
  if (!L || !OWN_SHADES) return;
  shadesOn(frame.kit, [(L / 2 - 1) / 2, L / 2, L - (L / 2 - 1) / 2], 4.45, 3, 3.3, spec.id.length * 3.7);
  if (spec.id === 'w125-383') {
    const side = frame.face([1469.47, -3148.56, 1480.55, -3168.65]);
    if (side) {
      const widths = [2.4, 2.8, 2.5, 2.5, 2.3, 2.4, 4.2, 3.81]; const cs = []; let u = 0;
      for (const w of widths) { cs.push(u + w / 2); u += w; }
      shadesOn(side.kit, cs, 4.45, 3, 3.3, 11.3, 0.62);
    }
  }
}
// ---------------------------------------------------------------- window panes
const PANES = {
  // [kit face, [[ua, ub, ya, yb], ...] built below, reveal, hi, lo, split]
  'w125-321': () => ({
    front: { boxes: [[0.45, 4.9], [5.47, 9.92], [10.49, 14.51]].map(([a, b]) => [a, b, 5.15, 7.7]), rv: 0.12, hi: '#a2a9a4', lo: '#7a817e', split: 0.4 },
  }),
  'w125-365': () => ({ front: { boxes: [[3.235, 9.835], [11.335, 17.935], [19.235, 25.835]].map(([a, b]) => [a, b, 7.2, 9.2]), rv: 0.16, hi: '#878c8f', lo: '#5d6266', split: 0.45 } }),
  // a light panel in
  // four of five upper sashes, down 60-100 % of the sash, the lower sashes left to the kit's glass
  'w125-361': () => {
    const boxes = [];
    for (let f = 0; f < 5; f++) {
      const y0 = 4.5 + F361 * f, yt = y0 + 2.55;   // (the windows 2.5 m tall since e3)
      [0.74, 5.41, 10.08].forEach((wu, w) => {
        for (let q = 0; q < 3; q++) {
          if (hsh(f + 3.1, w * 3 + q + 0.7) < 0.2) continue;
          const ua = wu + q * 1.283 + 0.035, ub = ua + 1.213;
          boxes.push([ua, ub, yt - 1.15 * (0.6 + 0.4 * hsh(f * 1.7, w * 3 + q)), yt]);
        }
      });
    }
    return { front: { boxes, rv: 0.14, hi: '#dcdad4', lo: '#dcdad4', split: 0 } };
  },
  'w125-319': () => ({ front: { boxes: [[0.65, 7.25, 5.3, 7.6]], rv: 0.12, hi: '#6a7268', lo: '#5d6158', split: 0.45 } }),
};
function panesOn(kit, o, k0) {
  for (const [ua, ub, ya, yb] of o.boxes) pane2(kit, ua + 0.03, ub - 0.03, ya + 0.03, yb - 0.03, -o.rv - 0.045, o.hi, o.lo, o.split, k0 + ua + ya);
}
function windowPanes(spec, frame) {
  const P = PANES[spec.id];
  if (!P) return;
  const o = P();
  if (o.front) panesOn(frame.kit, o.front, 1);
  if (spec.id === 'w125-321') {
    // the St. Nicholas Ave face: seven 5.0 x 2.55 m windows at y 5.15-7.7 (bays of widths 0.33, 5.72, 5.75, 5.75, 5.6, 5.9, 5.8, 5.15)
    const side = frame.face([1589.2, -3081.8, 1608.6, -3117.1]);
    if (side) {
      const ws = [0.33, 5.72, 5.75, 5.75, 5.6, 5.9, 5.8, 5.15, 0.3]; const boxes = []; let u = 0;
      ws.forEach((w, j) => { if (j >= 1 && j <= 7) { const ww = Math.min(5.0, w - 0.2), uc = u + w / 2; boxes.push([uc - ww / 2, uc + ww / 2, 5.15, 7.7]); } u += w; });
      panesOn(side.kit, { boxes, rv: 0.12, hi: '#a2a9a4', lo: '#7a817e', split: 0.4 }, 7);
    }
  }
}
// the generic builder for a spec with no custom builder of its own (specs/bid1.js prep sets it)
export function roofs(group, ctx, spec, frame) { tenementShades(spec, frame); windowPanes(spec, frame); roofOf(spec, frame); }

// Party City's letter colours, P a r t y C i t y, and PureGym's teal dot
const PARTY_FGS = ['#e8706a', '#a48fd0', '#e8706a', '#4f8fd6', '#7cc47a', '#e8706a', '#7cc47a', '#e8706a', '#a48fd0'];
export const tealDot = mark((c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = '#16b8b0'; c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) * 0.46, 0, Math.PI * 2); c.fill(); }, []);
// 2329 Frederick Douglass Blvd: the two double-height glazed blocks, the sign panel column, the corner band window and
// the structural-glass corner tower, the wall signs (the kit builds the panel skin, the base and the 4th-floor windows)
function _eighth2329(group, ctx, spec, frame) {
  const k = frame.kit, L = frame.L;
  // floors 2-3: 5.86 x 7.63 m blocks, 4 lights across, transoms at 9.92 and 11.52 m
  for (const u0 of [1.22, 15.44]) curtain(k, [u0, u0 + 1.45, u0 + 2.9, u0 + 4.41, u0 + 5.86], [6.86, 9.92, 11.52, 14.49], { w: 0.0, glass: 'glass_clear', frame: 'steel_black', hi: '#7a9396', lo: '#405758', split: 0.4, vary: 0.14, fw: 0.032, fd: 0.07 });
  // the corner bay's 2nd-floor band window
  curtain(k, range(22.6, 28.4, 4), [6.86, 9.92], { w: 0.0, glass: 'glass_clear', frame: 'steel_black', hi: '#6f929c', lo: '#35505a', split: 0.4, vary: 0.14, fw: 0.032, fd: 0.07 });
  // the sign column: a ribbed panel in the skin's grey (a3: real #877b7d / twin #6c676b over the column with its letters; was #5f6469)
  const rib = k.mat('panel_grey', { tint: '#878c91', dirt: 0.1 });
  k.box(rib, 8.94, 13.6, 7.5, 12.8, 0, 0.03, { c: 0.004 });
  for (let y = 7.6; y < 12.75; y += 0.18) k.box(rib, 8.96, 13.58, y, y + 0.05, 0.03, 0.055, { c: 0.004, near: true });
  // twin's stood ~0.6 of their size: fuller boxes (fill 0.9 / 0.85) and a 0.75 m dot
  k.sign({ kind: 'channel', text: 'Party City', font: 'Poppins-700', fgs: PARTY_FGS, bg: null, u0: 9.05, u1: 13.5, y: 10.95, h: 1.2, fill: 0.9, depth: 0.08, lit: 'face' }, { z: 0.055 });
  k.sign({ kind: 'channel', lines: ['FLAMING GRILL', '& MODERN BUFFET'], font: 'Oswald-700', fg: '#e0242c', bg: null, u0: 9.15, u1: 13.4, y: 9.45, h: 1.45, depth: 0.06, lit: 'face', lead: 1.15 }, { z: 0.055 });
  k.sign({ kind: 'channel', text: 'PUREGYM', font: 'Montserrat-600', fg: '#f4f4f2', bg: null, u0: 9.85, u1: 13.5, y: 8.2, h: 0.95, fill: 0.85, depth: 0.08, lit: 'face' }, { z: 0.055 });
  k.sign({ kind: 'painted', text: 'dot', u0: 9.0, u1: 9.75, y: 8.3, h: 0.75, bg: null, fg: '#16b8b0', logo: tealDot, logoAt: 'fill' }, { z: 0.057 });
  // the skin: panel joints between the openings, pale mint reflective panes in the six 4th-floor windows (u 1.22 + 3.54 j, 16.35-18.6 m)
  for (const [a, b] of [[0.2, 22.3]]) { panelJoints(k, a, b, 18.85, 21.0); panelJoints(k, a, b, 14.6, 16.3); }
  panelJoints(k, 7.2, 15.3, 6.75, 7.4); panelJoints(k, 7.2, 15.3, 12.9, 14.5); panelJoints(k, 0.2, 7.0, 14.6, 15.0); panelJoints(k, 21.5, 22.3, 6.75, 14.5);
  for (let j = 0; j < 6; j++) pane2(k, 1.22 + 3.54 * j + 0.06, 1.22 + 3.54 * j + 2.26, 16.4, 18.55, -0.15, '#b9d2c8', '#7c978d', 0.3, j);
  // the shops' opening dress: a red-white-blue bunting fan at each end of the two banners and a GRAND OPENING banner under Danice's
  for (const u of [8.35, 14.05, 15.35, 21.45]) k.sign({ kind: 'painted', text: 'bunting', u0: u - 0.55, u1: u + 0.55, y: 4.95, h: 0.62, bg: null, fg: '#c8202b', logo: buntingFan, logoAt: 'fill' }, { z: 0.08 });
  k.sign({ kind: 'painted', text: 'GRAND OPENING', u0: 16.2, u1: 20.6, y: 4.55, h: 0.42, bg: null, fg: '#ffffff', logo: grandOpening, logoAt: 'fill' }, { z: 0.09 });
  // the vertical PUREGYM panel behind the store glass
  k.sign({ kind: 'panel', text: 'PUREGYM', u0: 5.57, u1: 6.95, y: 0.97, h: 3.0, bg: '#111214', fg: '#ffffff', depth: 0.04, lit: 'face', logo: puregymV, logoAt: 'fill' }, { z: -0.3 });
  // the corner tower: structural glass 11.5-22.8 m over u 22.6-29.69 in front of the dark stair; above the roof the stair
  // core stands as a 4 m deep box, glazed on its front and its west side, capped
  const tu0 = 22.6, tu1 = L, ty0 = 11.5, ty1 = 22.78, tw = 0.3;
  const glass = k.mat('glass_clear'), dark = k.mat('panel_grey', { tint: '#7d918f', dirt: 0.05 });
  const TOWER = { w: tw, glass: 'glass_clear', hi: '#5c8789', lo: '#44686a', split: 0.3, fw: 0.045, fd: 0.07 };
  k.box(dark, tu0, tu1, ty0, 21.6, 0.004, 0.014, { c: 0 });
  k.box(dark, tu0 + 0.3, tu1, 21.4, ty1 - 0.25, -7.0, 0.014, { c: 0.01 });
  curtain(k, range(tu0, tu1, 3), range(ty0, ty1, 4), TOWER);
  k.poly(glass, [[tu0, 21.4, -7.0], [tu0, 21.4, tw], [tu0, ty1, tw], [tu0, ty1, -7.0]], [-1, 0, 0]);
  k.box(k.mat('panel_grey', { tint: '#c9cdcf', dirt: 0.05 }), tu0 - 0.05, tu1, ty1 - 0.25, ty1, -7.05, tw + 0.05, { c: 0.01 });
  // the Frederick Douglass side: three glazed blocks, three sign columns, the tower's east face
  const side = frame.face([1710.9, -3083.3, 1681.8, -3030.6]);   // the Frederick Douglass face (named by its segment: 'corner' picked the west party wall)
  if (side) {
    const s2 = side.kit;
    for (const u0 of [8.9, 23.9, 39.3]) curtain(s2, [u0, u0 + 1.6, u0 + 3.2, u0 + 4.8, u0 + 6.4], [6.86, 9.92, 11.52, 14.49], { w: 0.0, glass: 'glass_clear', frame: 'steel_black', hi: '#6f929c', lo: '#35505a', split: 0.4, vary: 0.14, fw: 0.032, fd: 0.07 });
    curtain(s2, range(0.9, 7.1, 4), [6.86, 9.92], { w: 0.0, glass: 'glass_clear', frame: 'steel_black', hi: '#6f929c', lo: '#35505a', split: 0.4, vary: 0.14, fw: 0.032, fd: 0.07 });
    const rib2 = s2.mat('panel_grey', { tint: '#878c91', dirt: 0.1 });
    panelJoints(s2, 0.2, 60.0, 14.6, 16.3); panelJoints(s2, 0.2, 60.0, 18.85, 21.0);
    for (let j = 0; j < 12; j++) pane2(s2, 7.7 + 3.78 * j + 0.06, 7.7 + 3.78 * j + 2.26, 16.4, 18.55, -0.15, '#b9d2c8', '#7c978d', 0.3, j);
    for (const u0 of [16.4, 31.8, 47.4]) {
      s2.box(rib2, u0 + 0.2, u0 + 5.8, 7.6, 12.2, 0, 0.03, { c: 0.004 });
      s2.sign({ kind: 'painted', text: 'Capital One Bank', u0: u0 + 0.5, u1: u0 + 5.5, y: 11.0, h: 0.8, bg: null, fg: '#ffffff', lit: 'face', logo: capitalOneWall, logoAt: 'fill' }, { z: 0.06 });
      s2.sign({ kind: 'channel', lines: ['FLAMING GRILL', '& MODERN BUFFET'], font: 'Oswald-700', fg: '#e0242c', bg: null, u0: u0 + 0.6, u1: u0 + 5.4, y: 9.4, h: 1.4, depth: 0.06, lit: 'face', lead: 1.2 }, { z: 0.055 });
      s2.sign({ kind: 'channel', text: 'Party City', font: 'Poppins-700', fgs: PARTY_FGS, bg: null, u0: u0 + 0.5, u1: u0 + 5.5, y: 8.1, h: 1.05, depth: 0.08, lit: 'face' }, { z: 0.055 });
    }
    // the tower's east face: glass 11.5-22.8 m over u 0-7.1, the core box above the roof
    s2.box(dark, 0, 7.1, ty0, 21.6, 0.004, 0.014, { c: 0 });
    curtain(s2, range(0, 7.1, 3), range(ty0, ty1, 4), TOWER);
    s2.box(dark, 0, 6.8, 21.4, ty1 - 0.25, -7.0, 0.014, { c: 0.01 });
    s2.box(k.mat('panel_grey', { tint: '#c9cdcf', dirt: 0.05 }), 0, 7.15, ty1 - 0.25, ty1, -7.05, tw + 0.05, { c: 0.01 });
    s2.sign({ kind: 'painted', text: 'Party City', u0: 0.8, u1: 6.3, y: 17.2, h: 0.9, bg: null, fg: '#e53b3a', lit: 'face', logo: partycity, logoAt: 'fill' }, { z: 0.4 });
    s2.sign({ kind: 'panel', text: 'Capital One Bank', u0: 0.8, u1: 6.3, y: 15.6, h: 0.7, bg: '#e9edf2', fg: '#11306e', lit: 'face' }, { z: 0.4 });
    s2.sign({ kind: 'panel', text: 'PUREGYM', u0: 0.8, u1: 6.3, y: 11.9, h: 0.75, bg: '#1a1b1d', fg: '#ffffff', lit: 'face', logo: puregym, logoAt: 'fill' }, { z: 0.4 });
  }
  k.sign({ kind: 'painted', text: 'Party City', u0: 23.0, u1: 27.6, y: 17.2, h: 0.9, bg: null, fg: '#e53b3a', lit: 'face', logo: partycity, logoAt: 'fill' }, { z: 0.4 });
  k.sign({ kind: 'panel', text: 'Capital One Bank', u0: 23.0, u1: 27.6, y: 15.6, h: 0.7, bg: '#e9edf2', fg: '#11306e', lit: 'face' }, { z: 0.4 });
  k.sign({ kind: 'panel', text: 'PUREGYM', u0: 23.0, u1: 27.6, y: 11.9, h: 0.75, bg: '#1a1b1d', fg: '#ffffff', lit: 'face', logo: puregym, logoAt: 'fill' }, { z: 0.4 });
}
// a pleated half-round bunting fan (red, white, blue) and a GRAND OPENING banner: drawn from scratch
export const buntingFan = mark((c, W, H) => {
  c.clearRect(0, 0, W, H);
  const x = W / 2, y = 0, r = Math.min(W / 2, H) * 0.98, cols = ['#c8202b', '#f4f4f2', '#1f3f8c'];
  for (let i = 0; i < 9; i++) {
    const a0 = Math.PI * (i / 9), a1 = Math.PI * ((i + 1) / 9);
    c.fillStyle = cols[i % 3]; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a0, a1); c.closePath(); c.fill();
  }
  c.fillStyle = '#1f3f8c'; c.beginPath(); c.arc(x, y, r * 0.22, 0, Math.PI); c.fill();
}, []);
export const grandOpening = mark((c, W, H) => {
  c.fillStyle = '#c8202b'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#1f3f8c'; c.fillRect(0, 0, W, H * 0.14); c.fillRect(0, H * 0.86, W, H * 0.14);
  text(c, 'GRAND OPENING', W * 0.5, H * 0.52, { key: 'Anton', weight: 400, px: H * 0.62, maxW: W * 0.92, color: '#ffffff', track: 0.06 });
}, ['Anton-400']);
// 309: P.C. Richard & Son's letters on the white sign parapet and the red lettering on the spandrel glass
function _pcrichard(group, ctx, spec, frame) {
  const k = frame.kit;
  domeAwning(k, 4.8, 8.7, 4.15, 1.2, 0.5, '#c8281f', 'P.C. RICHARD & SON');
  k.sign({ kind: 'channel', text: 'P.C. RICHARD & SON', u0: 0.5, u1: 14.7, y: 7.95, h: 1.7, bg: null, fg: '#d7282f', depth: 0.12, lit: 'face', logo: pcrletters, logoAt: 'fill' }, { z: 0.01 });
  k.sign({ kind: 'painted', text: 'APPLIANCES • TV • ELECTRONICS • MATTRESSES', font: 'Oswald-600', fg: '#d7282f', bg: null, u0: 0.6, u1: 14.6, y: 3.55, h: 0.62, tracking: 0.04 }, { z: -0.19 });
}
// 324: the CVS pharmacy letters on the white band, the charcoal brick pier at the St. Nicholas end
function _w324(group, ctx, spec, frame) {
  const k = frame.kit;
  k.sign({ kind: 'painted', text: 'CVS pharmacy', u0: 6.5, u1: 17.5, y: 5.7, h: 1.6, bg: null, fg: '#cc0000', lit: 'face', logo: cvs, logoAt: 'fill' }, { z: 0.01 });
  // the imaging centre's window strips on the 2nd floor: navy headers (MRI MRA CT XRAY SONO) over each window, a yellow NOW OPEN burst
  k.sign({ kind: 'panel', text: 'MRI MRA CT XRAY SONO', u0: 3.75, u1: 15.0, h: 0.62, y: 11.3, bg: '#3b2f70', fg: '#ffffff', depth: 0.04, lit: 'none', logo: imagingHeader, logoAt: 'fill' }, { z: 0.03 });
  k.sign({ kind: 'panel', text: 'arrows', u0: 3.75, u1: 15.0, h: 0.26, y: 8.0, bg: '#3b2f70', fg: '#ffffff', depth: 0.03, lit: 'none', logo: imagingArrows, logoAt: 'fill' }, { z: 0.03 });
  // the pharmacy's window is papered with red and white posters: panels 1.3 m wide, 0.55 m behind the glass
  const red = k.mat('panel_grey', { tint: '#b8352b', dirt: 0.05 }), wht = k.mat('panel_grey', { tint: '#e8e4dc', dirt: 0.05 });
  for (let j = 0, u = 4.9; u < 26.2; j++, u += 1.35 + 0.3 * hsh(j, 5)) {
    const w = 1.1 + 0.3 * hsh(j, 9), y0 = 0.45 + 0.15 * hsh(j, 3);
    if (Math.abs(u - 26.7) < 1.5) continue;
    k.box(hsh(j, 1) > 0.35 ? red : wht, u, u + w, y0, y0 + 1.55 + 0.4 * hsh(j, 7), -0.62, -0.6, { c: 0 });
    if (hsh(j, 2) > 0.4) k.box(wht, u + 0.12, u + w - 0.12, y0 + 0.6, y0 + 0.75, -0.6, -0.595, { c: 0 });
  }
  k.sign({ kind: 'painted', text: 'NOW OPEN', u0: 3.95, u1: 6.15, y: 8.45, h: 2.2, bg: null, fg: '#2a2f7a', logo: nowOpen, logoAt: 'fill' }, { z: 0.02 });
  k.sign({ kind: 'panel', text: 'MRI  CT  X-RAY', u0: 12.35, u1: 14.85, y: 8.35, h: 2.3, bg: '#4a2a7c', fg: '#ffffff', depth: 0.02, lit: 'none', logo: imagingBanner, logoAt: 'fill' }, { z: 0.02 });
  const side324 = frame.face([1561.51, -3030.95, 1574.66, -3055.08]);
  if (side324 && !BF36) side324.kit.sign({ kind: 'painted', text: 'CVS pharmacy', u0: 1.0, u1: 11.0, y: 5.7, h: 1.4, bg: null, fg: '#cc0000', lit: 'face', logo: cvs, logoAt: 'fill' }, { z: 0.01 });
  const pier = k.mat('brick_tan', { tint: '#4c4e53', dirt: 0.25 });
  k.box(pier, 0, 3.7, -0.5, 15.8, -0.2, 0.15, { c: 0.015 });
  // (BF36) the pier's recessed panels in the grey spandrel finish (glass_grey showed lit room glyphs, '8 8' on s324)
  for (let y = 1.2; y < 15.6; y += 3.2) k.box(BF36 ? k.mat('panel_grey', { tint: '#5d646a', dirt: 0.2 }) : k.mat('glass_grey'), 1.2, 2.5, y, y + 2.2, 0.15, 0.16, { c: 0 });
  if (side324 && BF36) {
    w324StNich(side324.kit, pier);
    // the corner on the 125th side (u to 30.31 at St. Nicholas): the canopy's return over the corner door and the corner tower's
    // north face (the charcoal pier, as on the St. Nicholas side)
    k.box(k.mat('panel_grey', { tint: '#959a9e', dirt: 0.35 }), 25.9, 30.31, 4.3, 6.25, 0.0, 1.05, { c: 0.01 });
    k.box(k.mat('panel_grey', { tint: '#7d8286', dirt: 0.45 }), 25.95, 30.26, 4.27, 4.3, 0.05, 1.0, { c: 0 });
    k.box(pier, 28.9, 30.31, 6.25, 15.8, -0.2, 0.15, { c: 0.015 });
    // the west windows' graphics (the spec's four west windows, u 22.4-28.8): the banner over the three nearest the corner
    k.sign({ kind: 'painted', text: 'MRI XRAY MAMMO ENTRANCE AROUND CORNER', u0: 24.05, u1: 28.75, y: 7.25, h: 3.0, bg: null, fg: '#ffffff', logo: aroundCorner, logoAt: 'fill' }, { z: -0.12 });
    k.sign({ kind: 'painted', text: 'NOW OPEN', u0: 22.55, u1: 23.85, y: 8.0, h: 1.3, bg: null, fg: '#2a2f7a', logo: nowOpen, logoAt: 'fill' }, { z: -0.12 });
  }
}
// (BF36) 324's St. Nicholas face, u from the 125th corner southward: the corner tower's west
// face (the charcoal pier with its grey glass panels) over a grey projecting canopy at the corner entrance; the CVS letters south of
// the canopy on the light band; the imaging centre's six windows with their posters (a NOW OPEN burst, a purple banner), a purple
// header over them and an arrow strip under them; weathering: rain streaks under the parapet and the canopy, a grime line at the base
function w324StNich(s, pier) {
  s.box(pier, 0, 3.7, 6.25, 15.8, -0.2, 0.15, { c: 0.015 });
  // (the tower's grey spandrel panels: the kit's glass_grey showed lit room glyphs through them, H / O / U on cvs_nw)
  for (let y = 6.9; y < 15.6; y += 3.0) s.box(s.mat('panel_grey', { tint: '#5d646a', dirt: 0.2 }), 1.2, 2.5, y, y + 2.1, 0.15, 0.16, { c: 0 });
  // the canopy: a grey aluminium box over the corner entrance, its soffit lit
  const can = s.mat('panel_grey', { tint: '#959a9e', dirt: 0.35 });
  s.box(can, 0, 3.9, 4.3, 6.25, 0.0, 1.05, { c: 0.01 });
  s.box(s.mat('panel_grey', { tint: '#7d8286', dirt: 0.45 }), 0.05, 3.85, 4.27, 4.3, 0.05, 1.0, { c: 0 });
  // the pharmacy's name on the band south of the canopy (drawn letters and heart, as on the 125th front)
  // (from the street the 1.05 m canopy hides ~2.5 m of the band behind its end: the letters from u 6.0, cvs_stO r5 / r7)
  s.sign({ kind: 'painted', text: 'CVS pharmacy', u0: 6.0, u1: 13.6, y: 5.05, h: 1.4, bg: null, fg: '#cc0000', lit: 'face', logo: cvs, logoAt: 'fill' }, { z: 0.01 });
  // the small red CVS blade on the brick pier between the entrance and the windows
  s.sign({ kind: 'panel', text: 'CVS', font: 'Inter-800', u0: 3.55, u1: 4.35, y: 2.55, h: 0.55, bg: '#c8102e', fg: '#ffffff', depth: 0.08, lit: 'face' }, { z: 0.12 });
  // the imaging centre: the purple header over the six windows (u 4.1-13.7), the arrow strip under them, posters behind the glass
  s.sign({ kind: 'panel', text: 'MRI MRA CT XRAY SONO', u0: 4.1, u1: 13.7, h: 0.6, y: 10.45, bg: '#3b2f70', fg: '#ffffff', depth: 0.04, lit: 'none', logo: imagingHeader, logoAt: 'fill' }, { z: 0.03 });
  s.sign({ kind: 'panel', text: 'arrows', u0: 4.1, u1: 13.7, h: 0.24, y: 6.95, bg: '#3b2f70', fg: '#ffffff', depth: 0.03, lit: 'none', logo: imagingArrows, logoAt: 'fill' }, { z: 0.03 });
  s.sign({ kind: 'painted', text: 'NOW OPEN', u0: 4.35, u1: 5.55, y: 7.6, h: 1.2, bg: null, fg: '#2a2f7a', logo: nowOpen, logoAt: 'fill' }, { z: -0.12 });
  s.sign({ kind: 'painted', text: 'NOW OPEN', u0: 9.15, u1: 10.35, y: 8.4, h: 1.2, bg: null, fg: '#2a2f7a', logo: nowOpen, logoAt: 'fill' }, { z: -0.12 });
  s.sign({ kind: 'panel', text: 'MRI  CT  X-RAY', u0: 7.55, u1: 8.95, y: 7.45, h: 2.6, bg: '#4a2a7c', fg: '#ffffff', depth: 0.02, lit: 'none', logo: imagingBanner, logoAt: 'fill' }, { z: -0.13 });
  // weathering: dark rain streaks off the parapet and the canopy's ends, a grime band along the foot of the panel box
  const streak = s.mat('panel_grey', { tint: '#8d8f8d', dirt: 0.6 });
  for (const [u, w, y0] of [[5.0, 0.18, 11.0], [8.2, 0.14, 10.9], [11.4, 0.2, 11.0], [15.2, 0.16, 9.4], [17.9, 0.22, 8.8], [21.4, 0.15, 9.9], [24.6, 0.2, 9.1], [26.6, 0.14, 10.2]]) s.box(streak, u, u + w, y0, 12.55, 0.0, 0.004, { c: 0 });
  s.box(s.mat('panel_grey', { tint: '#9c9e9b', dirt: 0.55 }), 3.7, 27.5, 4.0, 4.18, 0.0, 0.004, { c: 0 });
}
// 324's window graphics: a yellow starburst with NOW OPEN and an imaging banner (invented layout, the real shop's kind of poster)
export const nowOpen = mark((c, W, H) => {
  c.clearRect(0, 0, W, H);
  const x = W / 2, y = H / 2, r = Math.min(W, H) * 0.48;
  c.fillStyle = '#f6c90e'; c.beginPath();
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, rr = i % 2 ? r * 0.8 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill(); c.strokeStyle = '#d9a400'; c.lineWidth = r * 0.03; c.stroke();
  text(c, 'NOW', x, y - r * 0.2, { key: 'Anton', weight: 400, px: r * 0.42, color: '#2a2f7a' });
  text(c, 'OPEN', x, y + r * 0.24, { key: 'Anton', weight: 400, px: r * 0.42, color: '#2a2f7a' });
}, ['Anton-400']);
export const imagingHeader = mark((c, W, H) => {
  c.fillStyle = '#3b2f70'; c.fillRect(0, 0, W, H);
  ['MRI', 'MRA', 'CT', 'XRAY', 'SONO', 'MRI', 'CT'].forEach((t, j) => {
    const x = W * (0.75 + 1.6 * j) / 11.25;
    text(c, t, x, H * 0.54, { key: 'Inter', weight: 800, px: H * 0.56, maxW: W * 0.12, color: '#ffffff' });
    if (j) { c.fillStyle = '#6c62a8'; c.fillRect(W * (1.6 * j - 0.05) / 11.25, H * 0.12, Math.max(1, W * 0.002), H * 0.76); }
  });
}, ['Inter-800']);
// (BF36) the imaging centre's window graphics over the west windows of the 125th front: a maroon
// field, MRI / XRAY / MAMMO over the panes, ENTRANCE AROUND CORNER with arrows, a white arc (drawn lettering, an invented layout)
export const aroundCorner = mark((c, W, H) => {
  c.fillStyle = '#4b2335'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(2, H * 0.012);
  c.beginPath(); c.arc(W * 0.66, H * 1.02, H * 0.78, Math.PI * 1.02, Math.PI * 1.62); c.stroke();
  ['MRI', 'XRAY', 'MAMMO'].forEach((t, j) => text(c, t, W * (0.17 + 0.33 * j), H * 0.12, { key: 'Anton', weight: 400, px: H * 0.12, maxW: W * 0.29, color: '#ffffff' }));
  ['ENTRANCE', 'AROUND', 'CORNER'].forEach((t, j) => text(c, t, W * 0.64, H * (0.38 + 0.16 * j), { key: 'Anton', weight: 400, px: H * 0.15, maxW: W * 0.62, color: '#ffffff', track: 0.02 }));
  c.fillStyle = '#ffffff';
  for (const [x, y] of [[0.1, 0.9], [0.2, 0.9], [0.5, 0.86], [0.6, 0.86], [0.83, 0.82], [0.93, 0.82]]) {
    const X = W * x, Y = H * y, s2 = H * 0.035;
    c.fillRect(X - s2 * 1.2, Y - s2 * 0.25, s2 * 1.4, s2 * 0.5); c.beginPath(); c.moveTo(X + s2 * 0.2, Y - s2 * 0.75); c.lineTo(X + s2 * 1.1, Y); c.lineTo(X + s2 * 0.2, Y + s2 * 0.75); c.closePath(); c.fill();
  }
}, ['Anton-400']);
export const imagingArrows = mark((c, W, H) => {
  c.fillStyle = '#3b2f70'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffffff';
  for (let j = 0; j < 14; j++) {
    const x = W * (0.45 + 0.8 * j) / 11.25, y = H / 2, s = H * 0.28;
    c.fillRect(x - s * 1.2, y - s * 0.22, s * 1.4, s * 0.44); c.beginPath(); c.moveTo(x + s * 0.2, y - s * 0.7); c.lineTo(x + s * 1.1, y); c.lineTo(x + s * 0.2, y + s * 0.7); c.closePath(); c.fill();
  }
}, []);
export const imagingBanner = mark((c, W, H) => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a3290'); g.addColorStop(1, '#341c5e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  text(c, '4', W * 0.5, H * 0.34, { key: 'Anton', weight: 400, px: H * 0.42, color: '#ffffff' });
  text(c, 'IMAGING', W * 0.5, H * 0.62, { key: 'Inter', weight: 800, px: H * 0.09, maxW: W * 0.9, color: '#ffffff', track: 0.1 });
  text(c, 'MRI • CT • X-RAY', W * 0.5, H * 0.74, { key: 'Inter', weight: 700, px: H * 0.06, maxW: W * 0.86, color: '#e7dcf5' });
  text(c, 'WALK-INS WELCOME', W * 0.5, H * 0.86, { key: 'Inter', weight: 700, px: H * 0.055, maxW: W * 0.86, color: '#f6c90e' });
}, ['Anton-400', 'Inter-800', 'Inter-700']);
// 351: the second fire escape (bays 11-12, floors 2-6) and the round-arched heads of the top floor on both street faces:
// wall-flush fillers in the kit's rectangular openings make them round-headed, then a cast-stone arch ring with a
// keystone (the spec's top-floor window T has no lintel and no surround for this)
const W351 = [1.5, 1.77, 1.74, 1.84, 1.93, 1.97, 2.0, 1.93, 1.83, 1.84, 1.86, 1.84, 1.86, 1.9, 1.9, 1.95, 1.0];
function arches(kit, centres, ww, yb, wallMat) {
  const stone = kit.mat('cast_stone', { tint: '#b3ab9b', dirt: 0.35 });
  const r = ww / 2, yc = yb - r, seg = 10;
  for (const uc of centres) {
    // the two corner fillers (a fan from each top corner of the opening to the arc), 3 mm proud of the wall face
    for (const side of [-1, 1]) {
      const pts = [[uc + side * r, yb, 0.003]];
      for (let s = 0; s <= seg; s++) {
        const t = (s / seg) * (Math.PI / 2);                 // from the springing (t = 0) to the crown (t = 90 deg)
        pts.push([uc + side * r * Math.cos(t), yc + r * Math.sin(t), 0.003]);
      }
      kit.poly(wallMat, pts, [0, 0, 1]);
    }
    // the arch ring: voussoir segments 0.13 m deep, 4 cm proud, over the half circle
    const r0 = r + 0.01, r1 = r + 0.14, n = 9;
    for (let s = 0; s < n; s++) {
      const t0 = (s / n) * Math.PI, t1 = ((s + 1) / n) * Math.PI - 0.012;
      const P = (rr, t, w) => [uc + rr * Math.cos(t), yc + rr * Math.sin(t), w];
      kit.poly(stone, [P(r0, t0, 0.04), P(r1, t0, 0.04), P(r1, t1, 0.04), P(r0, t1, 0.04)], [0, 0, 1], { near: true });
      const tm = (t0 + t1) / 2;
      kit.poly(stone, [P(r1, t0, 0.0), P(r1, t1, 0.0), P(r1, t1, 0.04), P(r1, t0, 0.04)], [Math.cos(tm), Math.sin(tm), 0], { near: true });
    }
    // the keystone, the imposts at the springing
    kit.box(stone, uc - 0.09, uc + 0.09, yb - 0.02, yb + 0.24, -0.01, 0.07, { c: 0.01, near: true });
    for (const side of [-1, 1]) kit.box(stone, uc + side * r - 0.1, uc + side * r + 0.1, yc - 0.08, yc, -0.01, 0.05, { c: 0.008, near: true });
  }
}
function _w351(group, ctx, spec, frame) {
  drawGates(spec, frame);
  const bays = []; let u = 0;
  for (const w of W351) { bays.push([u, u + w]); u += w; }
  const floors = []; let y = 4.5;   // (specs/bid1.js since 2026-10-02: the base 4.5 m, the top storey 3.75)
  for (const h of [3.13, 3.13, 3.13, 3.13, 3.75]) { floors.push({ y0: y, y1: y + h }); y += h; }
  frame.kit.fireEscape({ bays: [11, 12], floors: [1, 5], depth: 1.05, drop: true }, bays, floors);
  const wall = frame.kit.mat({ mat: 'brick_tan', tint: '#8b8678', dirt: 0.6 });
  const yb = 17.02 + 0.35 + 1.8;                           // the top floor's window head (sill 0.35, h 1.8)
  arches(frame.kit, bays.slice(0, 16).map(([a, b]) => (a + b) / 2), 0.93, yb, wall);
  const side = frame.face('corner');
  if (side) {
    const n = 12, m0 = 2.0, m1 = 0.3, bw = (side.L - m0 - m1) / n;
    arches(side.kit, Array.from({ length: n }, (_, j) => m0 + (j + 0.5) * bw), 0.93, yb, side.kit.mat({ mat: 'brick_tan', tint: '#8b8678', dirt: 0.6 }));
  }
}
// the exposed parts of 313's party walls (QA Q49, 2026-10-02: a spec face on a party wall makes the kit warn, so they are built here): the kit
// leaves the west wall (over 317, blind in the record) plain and gives the east wall (over P.C. Richard) punched windows at the compiled floor
// height; a brick skin 9 cm deep covers each above the neighbour's roof, with an invented spray piece (the kit's painter) over its street end where
// s307 / s305: the east wall). The street end is u = L on the west wall, u = 0 on the east wall.
const PARTY313 = [
  { edge: [1616, -3066.99, 1632.1, -3096.19], y0: 12.9, mat: { mat: 'brick_painted', tint: '#cbc6bb', dirt: 0.55 }, g: [19.5, 33.2, 13.4, 19.4, 313, 0.5] },
  { edge: [1645.28, -3088.9, 1629.18, -3059.7], y0: 9.9, mat: { mat: 'brick_red', tint: '#6e4c40', dirt: 0.6 }, g: [0.5, 10.0, 10.6, 14.6, 3131, 0.45] },
];
// 313: the slender colonnettes between the two windows of every bay, floors 2-5 (cast iron, painted white): a shaft with a base and
// a capital; the kit's pilasters stand between the bays (the pairs at the odd bay edges: u = 0.3 + 1.47 (2k + 1))
function _w313(group, ctx, spec, frame) {
  const k = frame.kit, m = k.mat('terracotta_cream', { tint: '#ebe7de', dirt: 0.3 });
  const yTop = spec.h + ((spec.roof && spec.roof.parapet && spec.roof.parapet.h) || 0) - 0.08;
  for (const P of PARTY313) {
    const side = frame.face(P.edge);
    if (!side) continue;
    side.kit.box(side.kit.mat(P.mat), 0, side.L, P.y0, yTop, 0, 0.09, { c: 0 });
    // the piece as the kit paints a FACE.graffiti zone: graffitiTex at 100 px/m on a decal 5 mm off the skin (u, y in metres as the zone's)
    const [g0, g1u, gy0, gy1, seed, dens] = P.g, g1 = Math.min(g1u, side.L - 0.05);
    try {
      const t = graffitiTex(g1 - g0, gy1 - gy0, seed, { density: dens, style: 'piece', bandTop: 0.04 });
      const w = 0.095;
      side.kit.poly(kitGraffitiMat(t, g1 - g0, gy1 - gy0, g0, gy0), [[g0, gy0, w], [g1, gy0, w], [g1, gy1, w], [g0, gy1, w]], [0, 0, 1], { shadow: false });
    } catch (e) { /* no canvas (node bench): the brick stays bare */ }
  }
  // Popeyes' teal band along the foot of the white fascia, under the wordmark, standing 1.5 cm proud of the fascia (proj 0.15)
  k.box(k.mat('plain', { tint: '#65a7aa', rough: 0.45 }), 0.1, 5.6, 3.2, 3.42, 0.15, 0.165, { c: 0.004 });
  for (let f = 0; f < 4; f++) {
    const y0 = 4.8 + 3.28 * f + 0.3, y1 = y0 + 2.5;             // the windows' sill and head (specs/bid1.js: sill 0.3, h 2.5 since a3)
    for (let j = 0; j < 5; j++) {
      const u = 0.3 + 1.47 * (2 * j + 1);
      k.box(m, u - 0.065, u + 0.065, y0 - 0.05, y1 + 0.02, 0.02, 0.15, { c: 0.012, near: true });
      k.box(m, u - 0.11, u + 0.11, y1 + 0.02, Math.min(y1 + 0.16, 4.8 + 3.28 * (f + 1) - 0.13), 0.0, 0.19, { c: 0.01, near: true });
      k.box(m, u - 0.1, u + 0.1, y0 - 0.17, y0 - 0.05, 0.0, 0.18, { c: 0.01, near: true });
    }
    // each storey's order: a capital on every pilaster under the belt course
    const yb = [7.95, 11.23, 14.51, 17.45][f];
    for (const u of [0.3, 3.24, 6.18, 9.12, 12.06, 15.0]) {
      k.box(m, u - 0.27, u + 0.27, yb - 0.1, yb, 0.0, 0.2, { c: 0.01, near: true });
      k.box(m, u - 0.24, u + 0.24, yb - 0.3, yb - 0.1, 0.0, 0.17, { c: 0.02, near: true });
    }
  }
}
// 321: the signband is corrugated metal: ribs standing off the fascia, lighter than the band,
// plus the closed gates of the St. Nicholas side from the spec
function _w321(group, ctx, spec, frame) {
  const k = frame.kit, m = k.mat('panel_grey', { tint: '#6c6764', dirt: 0.1 });
  for (let u = 0.1; u < 10.8; u += 0.12) k.box(m, u, u + 0.05, 2.9, 4.85, 0.12, 0.152, { c: 0.004, near: true });
  const tops = (kk, at, pw, pp) => {
    const br = kk.mat('brick_buff', { tint: '#d6cbad', dirt: 0.32 }), cap = kk.mat('cast_stone', { tint: '#cfc6b0', dirt: 0.3 });
    for (const u of at) {
      kk.box(br, u - pw / 2, u + pw / 2, 10.3, 10.75, -0.42, pp, { c: 0.008 });
      kk.box(cap, u - pw / 2 - 0.05, u + pw / 2 + 0.05, 10.75, 10.86, -0.47, pp + 0.05, { c: 0.01 });
    }
  };
  tops(k, [0.2, 5.1, 10.1, 14.76], 0.4, 0.07);
  const side = frame.face([1589.2, -3081.8, 1608.6, -3117.1]);
  if (side) tops(side.kit, [0.33, 6.05, 11.8, 17.55, 23.15, 29.05, 34.85, 40.0], 0.7, 0.06);
  drawGates(spec, frame);
}
// 361: the four brick pilasters are banded, a rusticated course every 0.3 m, up the whole
// front from the granite base; the closed gate comes from the spec's gate data (bid1:gates)
const F361 = 3.55;   // 361's storey (specs/bid1.js: 3.76 until 2026-10-02)
function _w361(group, ctx, spec, frame) {
  const k = frame.kit, m = k.mat('brick_red', { tint: '#b3957e', dirt: 0.3 });
  for (const u of [0.33, 5.0, 9.67, 14.33]) {
    for (let y = 4.6; y < spec.h - 0.2; y += 0.3) k.box(m, u - 0.405, u + 0.405, y + 0.04, y + 0.27, 0.0, 0.132, { c: 0.008, near: true });
  }
  // the panelled spandrels: a raised border of
  // 9 cm, 2.5 cm proud, round a darker field, between a window head (6.6 m + 3.76 per floor) and the sill above it (8.36 m +...), clear of the belt courses
  const fieldM = k.mat('brick_red', { tint: '#a3846e', dirt: 0.4 });
  for (let f = 0; f < 4; f++) {
    const ya = 7.1 + F361 * f + 0.15, yb = 4.6 + F361 * (f + 1) - 0.15;   // (heads at 7.1 m + one storey per floor, the windows 2.5 m tall; sills 0.1 over each floor)
    for (const [ua, ub] of [[0.73, 4.6], [5.4, 9.27], [10.07, 13.94]]) {
      k.box(fieldM, ua + 0.09, ub - 0.09, ya + 0.09, yb - 0.09, 0.0, 0.006, { c: 0 });
      k.box(m, ua, ub, ya, ya + 0.09, 0.0, 0.025, { c: 0.004, near: true });
      k.box(m, ua, ub, yb - 0.09, yb, 0.0, 0.025, { c: 0.004, near: true });
      k.box(m, ua, ua + 0.09, ya + 0.09, yb - 0.09, 0.0, 0.025, { c: 0.004, near: true });
      k.box(m, ub - 0.09, ub, ya + 0.09, yb - 0.09, 0.0, 0.025, { c: 0.004, near: true });
    }
  }
  drawGates(spec, frame);
}
// marker tags and stickers on tile or stone (no buffed patches, no throw-ups): quick loops in black, red and blue, a few white stickers
const markerMarks = new Map();
function markerTags(seed, n = 7) {
  const key = seed + ':' + n;
  let m = markerMarks.get(key);
  if (!m) {
    m = mark((c, W, H) => {
      c.clearRect(0, 0, W, H);
      const r = (i) => hsh(seed, i);
      for (let i = 0; i < 3; i++) { c.fillStyle = ['#f4f4f0', '#e9e6dc', '#f0d24a'][i % 3]; c.fillRect(W * (0.1 + 0.7 * r(400 + i)), H * (0.2 + 0.6 * r(410 + i)), W * 0.09, H * 0.05); }
      for (let i = 0; i < n; i++) {
        c.strokeStyle = ['#121212', '#c4262c', '#121212', '#2a4fb0', '#121212'][i % 5]; c.lineWidth = Math.max(1.5, W * 0.012); c.lineCap = 'round'; c.lineJoin = 'round';
        const x = W * (0.06 + 0.7 * r(200 + i)), y = H * (0.15 + 0.7 * r(210 + i)), s = W * (0.05 + 0.07 * r(220 + i));
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + s * 0.4, y - s * 1.2, x + s * 0.9, y + s * 0.8, x + s * 1.3, y - s * 0.3);
        c.bezierCurveTo(x + s * 1.6, y - s * 0.9, x + s * 1.9, y + s * 0.5, x + s * 2.4, y - s * 0.1); c.lineTo(x + s * 2.7, y + s * 0.3); c.stroke();
      }
    }, []);
    markerMarks.set(key, m);
  }
  return m;
}
// 5.1 m, the gate head 3.75-3.95 m and a chevron top falling from the corners (5.1 m) to 4.6 m at the centre over buff brick; a third row of lights
// in the steel window above
function _w319(group, ctx, spec, frame) {
  const k = frame.kit, g = k.mat('plain', { tint: '#2d7347', rough: 0.45, env: 0.35 });
  const wf = 0.11, wb = -0.02, t = 0.2, uL = 0.42, uR = 7.15, uc = (uL + uR) / 2, yt = 5.1, yc = 4.6;
  for (const [a, b] of [[uL, uL + 0.25], [uR - 0.25, uR]]) k.box(g, a, b, 0, yt, wb, wf, { c: 0.01 });
  k.box(g, uL, uR, 3.75, 3.95, wb, wf + 0.02, { c: 0.01 });
  for (const [ua, ub, ya, yb] of [[uL, uc, yt, yc], [uc, uR, yc, yt]]) {
    const du = ub - ua, dy = yb - ya, l = Math.hypot(du, dy), nu = -dy / l, ny = du / l;
    k.poly(g, [[ua, ya - t, wf], [ub, yb - t, wf], [ub, yb, wf], [ua, ya, wf]], [0, 0, 1]);
    k.poly(g, [[ua, ya, wf], [ub, yb, wf], [ub, yb, wb], [ua, ya, wb]], [nu, ny, 0]);
    k.poly(g, [[ua, ya - t, wb], [ub, yb - t, wb], [ub, yb - t, wf], [ua, ya - t, wf]], [-nu, -ny, 0]);
  }
  k.box(k.mat('steel_black'), 0.65, 7.25, 6.05, 6.1, -0.2, -0.116, { c: 0.004, near: true });
  drawGates(spec, frame);
}
// 365: the pale-green glazed tile round the entrance,
// the canopy over the doors (u 12.5-17.75, 3.15-3.62 m), the station's letters on the tile, marker tags on the lower tiles
function _w365(group, ctx, spec, frame) {
  const k = frame.kit, w = 0.04;
  const tile = k.mat('plain', { tint: '#f4fbf4', rough: 0.35, env: 0.3 }), joint = k.mat('plain', { tint: '#a4b0a6', rough: 0.7 });
  const U0 = 11.3, U1 = 18.1, Y1 = 4.6, ua = 12.5, ub = 17.5, yh = 3.15;
  for (const [a, b, y0, y1] of [[U0, ua, 0, Y1], [ub, U1, 0, Y1], [ua, ub, yh, Y1]]) {
    k.box(tile, a, b, y0, y1, -0.01, w, { c: 0.004 });
    for (let y = 0.6; y < y1 - 0.05; y += 0.6) if (y > y0 + 0.05) k.box(joint, a, b, y - 0.006, y + 0.006, w, w + 0.002, { c: 0, near: true });
    for (let u = U0 + 0.6; u < U1 - 0.05; u += 0.6) if (u > a + 0.05 && u < b - 0.05) k.box(joint, u - 0.006, u + 0.006, y0, y1, w, w + 0.002, { c: 0, near: true });
  }
  k.box(k.mat('plain', { tint: '#e6e6e2', rough: 0.5 }), U0 - 0.04, U1 + 0.04, Y1, Y1 + 0.1, -0.01, w + 0.05, { c: 0.008 });
  k.box(k.mat('plain', { tint: '#86908a', rough: 0.5, env: 0.35 }), ua - 0.05, 17.75, yh, 3.62, w, 0.7, { c: 0.012 });
  k.sign({ kind: 'channel', text: 'MANHATTANVILLE STATION', font: 'Inter-600', fg: '#383b3c', bg: null, u0: 12.8, u1: 16.8, h: 0.24, y: 3.88, depth: 0.03, lit: 'none' }, { z: w + 0.005 });
  k.sign({ kind: 'channel', text: 'NEW YORK, N.Y. 10027', font: 'Inter-600', fg: '#383b3c', bg: null, u0: 13.5, u1: 16.1, h: 0.13, y: 3.68, depth: 0.02, lit: 'none' }, { z: w + 0.005 });
  k.sign({ kind: 'painted', text: 'tags', u0: U0 + 0.05, u1: ua - 0.05, y: 0.55, h: 1.7, bg: null, fg: '#111111', logo: markerTags(36.5, 8), logoAt: 'fill' }, { z: w + 0.004 });
  k.sign({ kind: 'painted', text: 'tags', u0: ub + 0.05, u1: U1 - 0.05, y: 0.7, h: 1.4, bg: null, fg: '#111111', logo: markerTags(41.2, 4), logoAt: 'fill' }, { z: w + 0.004 });
  // the flagpole on the roof over the Post Office sign, set back 4 m, the flag at its head
  const pole = k.mat('plain', { tint: '#d9dcde', rough: 0.35, metal: 0.6 }), top = spec.h + 7.0, pu = 14.7, pw = -4.0;
  k.box(pole, pu - 0.04, pu + 0.04, spec.h, top, pw - 0.04, pw + 0.04, { c: 0.01 });
  k.box(k.mat('plain', { tint: '#c9a43c', rough: 0.4, metal: 0.7 }), pu - 0.08, pu + 0.08, top, top + 0.16, pw - 0.08, pw + 0.08, { c: 0.04 });
  k.sign({ kind: 'painted', text: 'flag', u0: pu + 0.06, u1: pu + 1.66, y: top - 1.05, h: 1.0, bg: null, fg: '#b22234', logo: usFlag, logoAt: 'fill' }, { z: pw + 0.01 });
  k.sign({ kind: 'painted', text: 'flag', u0: pu + 0.06, u1: pu + 1.66, y: top - 1.05, h: 1.0, bg: null, fg: '#b22234', logo: usFlag, logoAt: 'fill' }, { z: pw - 0.01 });
}
// the United States flag (13 stripes, the canton with rows of white stars as dots), a little faded
export const usFlag = mark((c, W, H) => {
  for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#f2f0ea' : '#b22234'; c.fillRect(0, (H * i) / 13, W, H / 13 + 1); }
  c.fillStyle = '#3c3b6e'; c.fillRect(0, 0, W * 0.4, (H * 7) / 13);
  c.fillStyle = '#f2f0ea';
  for (let r = 0; r < 9; r++) for (let q = 0; q < (r % 2 ? 5 : 6); q++) { c.beginPath(); c.arc(W * 0.4 * ((q + (r % 2 ? 1 : 0.5)) / 6), (H * 7 / 13) * ((r + 0.5) / 9), Math.max(1, H * 0.014), 0, Math.PI * 2); c.fill(); }
}, []);
// 317: the segmental arched parapet (13.3 m at the ends to 15.1 m at the crown) with its moulded coping
function _w317(group, ctx, spec, frame) {
  const k = frame.kit, L = frame.L;
  const tc = k.mat({ mat: 'terracotta_cream', tint: '#e6e2d8', dirt: 0.45 });
  const y0 = spec.h + 0.8, rise = 1.8, half = L / 2, R = (half * half + rise * rise) / (2 * rise), n = 20;
  const top = (u) => y0 + Math.sqrt(Math.max(0, R * R - (u - half) * (u - half))) - (R - rise);
  for (let i = 0; i < n; i++) {
    const a = (L * i) / n, b = (L * (i + 1)) / n;
    k.poly(tc, [[a, y0 - 0.05, 0.0], [b, y0 - 0.05, 0.0], [b, top(b), 0.0], [a, top(a), 0.0]], [0, 0, 1]);
    k.poly(tc, [[a, y0 - 0.05, -0.35], [a, top(a), -0.35], [b, top(b), -0.35], [b, y0 - 0.05, -0.35]], [0, 0, -1]);
    // the coping: a moulded band over the arch
    const ta = top(a), tb = top(b);
    k.poly(tc, [[a, ta, 0.12], [b, tb, 0.12], [b, tb, -0.4], [a, ta, -0.4]], [0, 1, 0], { near: false });
    k.poly(tc, [[a, ta - 0.22, 0.12], [b, tb - 0.22, 0.12], [b, tb, 0.12], [a, ta, 0.12]], [0, 0, 1]);
  }
  // the medallion in the frieze
  k.box(tc, half - 0.45, half + 0.45, 12.9, 13.6, 0, 0.08, { c: 0.03 });
}
// 305: the upper windows are boarded with dark grey panels set a little behind the wall face (a1_s305: the kit's blind kind is
// wall-white); two floors from 7.6 m, four windows 1.08 x 2.0 m on a 2.25 m pitch
function _w305(group, ctx, spec, frame) {
  const k = frame.kit, board = k.mat('plain', { tint: '#a3a39f', rough: 0.85, env: 0.1 }), edge = k.mat('plain', { tint: '#6e6e6b', rough: 0.85, env: 0.1 });
  for (const y0 of [8.1, 11.4]) {
    for (let j = 0; j < 4; j++) {
      const u0 = 0.2 + 2.25 * j + (2.25 - 1.08) / 2, u1 = u0 + 1.08;
      k.box(board, u0 + 0.02, u1 - 0.02, y0 + 0.02, y0 + 1.98, -0.045, -0.03, { c: 0 });
      for (const y of [y0 + 0.55, y0 + 1.1, y0 + 1.55]) k.box(edge, u0 + 0.02, u1 - 0.02, y - 0.02, y + 0.02, -0.035, -0.02, { c: 0, near: true });
    }
  }
}
// 307: the big window of the commercial 2nd floor runs across the front (the kit's copy sits in the middle bay)
function _w307(group, ctx, spec, frame) {
  const k = frame.kit;
  k.window({ w: 4.8, h: 2.7, sill: 0, kind: 'fixed', mullions: 3, transom: 0.7, frame: 'alu_white', reveal: 0.15, lintel: { kind: 'none' }, sillStone: null, blinds: 0.3, lit: 0.5 },
    0.6, 5.4, 7.4, 10.1, { fy0: 4.6, fy1: 10.5, wallMat: { mat: 'brick_painted', tint: '#e2dccd', dirt: 0.5 } });
}
// 383: the round iron balconies by the Morningside corner (floors 2-4) and the chimney stacks along the Morningside parapet
function _w383(group, ctx, spec, frame) {
  const side = frame.face([1469.47, -3148.56, 1480.55, -3168.65]);   // the Morningside face (named by its segment: 'corner' picked the east party wall)
  if (!side) return;
  const k = side.kit, iron = k.mat('steel_black', { tint: '#1e2020' });
  const uc = 17.45, r = 0.95;
  for (const y of [4.32, 7.62, 10.92]) {   // the floor lines (specs/bid1.js tenements: 0.15 m lower since 2026-10-02)
    // a half-round platform: slats and a ring rail with pickets
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI, a1 = ((i + 1) / 12) * Math.PI;
      const u0 = uc + Math.cos(a0) * r, u1 = uc + Math.cos(a1) * r, w0 = Math.sin(a0) * r, w1 = Math.sin(a1) * r;
      k.box(iron, Math.min(u0, u1), Math.max(u0, u1), y - 0.02, y, 0, Math.max(w0, w1), { c: 0, near: true });
      k.box(iron, Math.min(u0, u1), Math.max(u0, u1), y + 0.93, y + 0.97, Math.min(w0, w1), Math.max(w0, w1) + 0.02, { c: 0, near: true });
      k.box(iron, u0 - 0.008, u0 + 0.008, y, y + 0.95, w0 - 0.008, w0 + 0.008, { c: 0, near: true });
    }
    k.box(iron, uc - r, uc + r, y - 0.08, y - 0.02, 0.02, 0.06, { c: 0, near: true });
  }
  const brick = k.mat('brick_red', { tint: '#94503f', dirt: 0.45 });
  for (const u of [5.4, 10.6, 15.2, 20.8]) k.box(brick, u - 0.35, u + 0.35, spec.h, spec.h + 1.6, -0.9, -0.2, { c: 0.01 });
}
// 374: the blue-glass Morningside corner (u 35.95-44.84, 0-19.8 m) and the tower set back 4.4 m behind the street wall
// (u 0.4-41.6; floors 5-9 continue the street wall's 4.33 m pitch to 39.2 m, a louvred mechanical level to 44.3 m)
function _w374(group, ctx, spec, frame) {
  const k = frame.kit, L = frame.L;
  const BLUEGLASS = { w: 0.02, glass: 'glass_clear', frame: 'panel_grey', frameTint: '#a9aeb3', hi: '#a0bfdc', lo: '#6b8daa', split: 0.5, vary: 0.05, fw: 0.03, fd: 0.06, sp: 0.14, spTint: '#aeb5bb' };
  const GY = [0.3, 2.45, 4.6, 6.77, 8.93, 11.1, 13.26, 15.43, 17.6, 19.8];
  // the glass corner: spandrel lines at the floor slabs, mullions every 1.48 m
  curtain(k, range(35.95, L, 8), GY, BLUEGLASS);
  k.box(k.mat('alu_clear'), 35.95, L, 19.6, 19.85, -0.3, 0.18, { c: 0.01 });
  // the glass box wraps onto Morningside Ave (the whole 14.9 m side, u from the 125th corner), capped the same
  const ms = frame.face([1447.8, -3107.5, 1454.9, -3120.6]);
  if (ms) {
    curtain(ms.kit, range(0, ms.L, 13), GY, BLUEGLASS);
    ms.kit.box(ms.kit.mat('alu_clear'), 0, ms.L, 19.6, 19.85, -0.3, 0.18, { c: 0.01 });
  }
  // frames where the kit's room behind a clear pane reads black; a two-tone pane in front of it, a mullion and a transom
  for (let f = 0; f < 3; f++) {
    for (let j = 0; j < 8; j++) {
      const cu = 0.75 + 4.4 * j + 2.2, y0 = 4.6 + 4.33 * f + 1.35;
      curtain(k, [cu - 1.03, cu, cu + 1.03], [y0, y0 + 0.9, y0 + 2.4], { w: -0.27, glass: null, frame: 'alu_white', hi: '#8cabc9', lo: '#587a9a', split: 0.35, vary: 0.14, fw: 0.06, fd: 0.05 });
    }
  }
  // the vertical glass slot at the tower's west end (u 38.6-41.6), full height of the tower
  curtain(k, range(38.6, 41.3, 2), [19.8, 24.1, 28.4, 32.8, 37.1, 40.2], { ...BLUEGLASS, w: -4.38, sp: 0 });
  // the tower
  const brick = k.mat('brick_tan', { tint: '#9a938a', dirt: 0.3 });
  const glass = k.mat('glass_grey'), fr = k.mat('alu_black');
  const wf = -4.4, wb = -24.0, u0 = 0.4, u1 = 41.6, yb = 18.0, yt = 39.2;
  const ys = [21.9, 26.2, 30.6, 34.9];                 // floor lines above the street wall (floor 5 starts on its roof)
  const fl = [[yb, 21.9], [21.9, 26.2], [26.2, 30.6], [30.6, 34.9], [34.9, yt]];
  const n = 14, pitch = (u1 - u0) / n, ww = 1.54, wh = 2.45;
  // the front wall as spandrels and piers round a grid of windows, 0.3 m thick, a 0.22 m reveal to the glass
  for (const [f0, f1] of fl) {
    const wy0 = f0 + 1.35, wy1 = wy0 + wh;
    k.box(brick, u0, u1, f0, wy0, wf - 0.3, wf, { c: 0.01 });
    k.box(brick, u0, u1, wy1, f1, wf - 0.3, wf, { c: 0.01 });
    for (let j = 0; j <= n; j++) {
      const pa = j === 0 ? u0 : u0 + (j - 1) * pitch + (pitch + ww) / 2, pc = j === n ? u1 : u0 + j * pitch + (pitch - ww) / 2;
      if (pc > pa) k.box(brick, pa, pc, wy0, wy1, wf - 0.3, wf, { c: 0.01 });
    }
    for (let j = 0; j < n; j++) {
      const ua = u0 + j * pitch + (pitch - ww) / 2, ub = ua + ww;
      k.poly(glass, [[ua, wy0, wf - 0.22], [ub, wy0, wf - 0.22], [ub, wy1, wf - 0.22], [ua, wy1, wf - 0.22]], [0, 0, 1]);
      k.box(fr, ua, ub, wy0, wy0 + 0.06, wf - 0.24, wf - 0.18, { c: 0.004, near: true });
      k.box(fr, ua, ub, wy1 - 0.06, wy1, wf - 0.24, wf - 0.18, { c: 0.004, near: true });
      k.box(fr, (ua + ub) / 2 - 0.03, (ua + ub) / 2 + 0.03, wy0, wy1, wf - 0.24, wf - 0.18, { c: 0.004, near: true });
      k.box(fr, ua, ub, wy0 + wh * 0.62 - 0.03, wy0 + wh * 0.62 + 0.03, wf - 0.24, wf - 0.18, { c: 0.004, near: true });
      k.box(k.mat('cast_stone', { tint: '#b9b2a5' }), ua - 0.05, ub + 0.05, wy0 - 0.1, wy0, wf - 0.3, wf + 0.04, { c: 0.008 });
    }
  }
  // the sides and the back (blind but for the Morningside side's column of windows), the roof, the parapet
  k.box(brick, u0, u0 + 0.3, yb, yt + 1.0, wb, wf, { c: 0.01 });
  k.box(brick, u1 - 0.3, u1, yb, yt + 1.0, wb, wf, { c: 0.01 });
  k.box(brick, u0, u1, yb, yt + 1.0, wb, wb + 0.3, { c: 0.01 });
  k.box(k.mat('roof_black'), u0 + 0.3, u1 - 0.3, yt - 0.3, yt, wb + 0.3, wf - 0.3, { c: 0 });
  k.box(brick, u0, u1, yt, yt + 1.0, wf - 0.3, wf, { c: 0.01 });
  k.box(k.mat('cast_stone', { tint: '#b9b2a5' }), u0 - 0.05, u1 + 0.05, yt + 1.0, yt + 1.12, wf - 0.35, wf + 0.05, { c: 0.01 });
  for (const [f0] of fl) k.box(k.mat('cast_stone', { tint: '#b9b2a5' }), u0, u1, f0 - 0.12, f0, wf - 0.3, wf + 0.03, { c: 0.008 });
  // the mechanical level: a louvred box set back on the tower roof to 44.3 m
  const mech = k.mat('panel_grey', { tint: '#5d6166', dirt: 0.15 });
  k.box(mech, 6.0, 36.0, yt, 44.3, wb + 3.0, wf - 3.0, { c: 0.02 });
  for (let y = yt + 0.4; y < 43.9; y += 0.25) k.box(k.mat('panel_grey', { tint: '#3e4246' }), 6.2, 35.8, y, y + 0.06, wf - 3.0, wf - 2.93, { c: 0, near: true });
}
// 11 Hancock Place: the window glass: a two-tone pane with a mullion and a transom in every opening, the podium and ten floors
function _hancock(group, ctx, spec, frame) {
  const rows = [[5.85, 7.95]];
  for (let f = 0; f < 10; f++) rows.push([8.25 + 3.0 * f + 0.45, 8.25 + 3.0 * f + 0.45 + 2.2]);
  const panes = (k, pitch, n, u00) => {
    for (const [y0, y1] of rows) {
      for (let j = 0; j < n; j++) {
        const u0 = pitch * j + u00, u1 = u0 + 2.75;
        curtain(k, [u0, (u0 + u1) / 2, u1], [y0, y0 + (y1 - y0) * 0.55, y1], { w: -0.22, glass: null, frame: 'alu_black', frameTint: '#2c3036', hi: '#7a99b8', lo: '#46607e', split: 0.45, vary: 0.14, fw: 0.07, fd: 0.06 });
      }
    }
  };
  panes(frame.kit, 2.95, 3, 0.1);
  const east = frame.face([1501.3, -3092.0, 1520.6, -3081.5]);   // the set-back frontage (22 m)
  if (east) panes(east.kit, 3.14, 7, 0.195);
}
// 280 St. Nicholas Ave (Harlem USA), u from the FDB corner westward: the point-fixed glass curtain wall over the whole
// front with its vinyl billboard (an invented brand), two storeys of retail glass, the cast-stone portal of Old Navy with
// the arched sign panel, the red K&G band, the red Rainbow script on the glass and the blue category band
function _harlemusa(group, ctx, spec, frame) {
  const k = frame.kit, L = frame.L;
  // the upper curtain wall 10.3-19.2 m, 2.2 m panes, the internal louvre band behind it
  curtain(k, range(0.0, L, Math.round(L / 2.2)), [10.3, 12.4, 14.9, 17.4, 19.2], { w: 0.12, glass: 'glass_clear', frame: 'alu_clear', fw: 0.035, fd: 0.05, hi: '#768693', lo: '#4d6272' });
  const louv = k.mat('alu_clear');
  for (let y = 16.05; y < 17.35; y += 0.16) k.box(louv, 0.1, L - 0.1, y, y + 0.05, 0.02, 0.1, { c: 0, near: true });
  k.sign({ kind: 'painted', text: 'Small steps are so much sweeter.', u0: 27.5, u1: 74.0, y: 10.45, h: 4.75, bg: null, fg: '#26344a', logo: billboard, logoAt: 'fill' }, { z: 0.165 });
  // two storeys of retail glass under a louvre band
  curtain(k, range(0.2, 38.3, 20), [4.1, 8.6], { w: 0.02, glass: 'glass_clear', frame: 'alu_clear', fw: 0.05, hi: '#8d9296', lo: '#4b5156', split: 0.5 });
  curtain(k, range(61.2, 75.6, 7), [4.1, 8.7], { w: 0.02, glass: 'glass_clear', frame: 'alu_clear', fw: 0.05, hi: '#8d9296', lo: '#4b5156', split: 0.5 });
  for (let y = 8.62; y < 8.98; y += 0.09) k.box(louv, 0.1, 38.4, y, y + 0.04, 0.0, 0.12, { c: 0, near: true });
  // the K&G band and the Rainbow letters
  k.sign({ kind: 'panel', text: 'K&G  FOR MEN  FOR WOMEN  FOR LESS', u0: 0.2, u1: 7.3, y: 8.95, h: 0.85, bg: '#b3202a', fg: '#ffffff', depth: 0.1, lit: 'face', logo: kng, logoAt: 'fill' }, { z: 0.14 });
  k.sign({ kind: 'channel', text: 'Rainbow', font: 'Lobster', u0: 25.3, u1: 35.8, y: 5.45, h: 1.35, bg: null, fg: '#d8262e', depth: 0.1, lit: 'face' }, { z: 0.07 });
  k.sign({ kind: 'panel', text: 'juniors   shoes   plus sizes   accessories', font: 'Inter-600', u0: 29.0, u1: 37.6, y: 3.62, h: 0.34, bg: '#1e67c6', fg: '#ffffff', depth: 0.05, lit: 'face' }, { z: 0.36 });
  // Old Navy: the cast-stone portal (piers rising to an arched band), the white arched panel and the letters
  const stone = k.mat('cast_stone', { tint: '#cdbfa6', dirt: 0.35 });
  const panel = k.mat('panel_alu', { tint: '#f1f2f3', dirt: 0.1 });
  // the segmental arch: the panel as vertical strips whose tops follow a circle (spring 7.6 m, crown 8.5 m); the stone band, 1.3 m
  // thick, follows it (a1_s280st: the head was a flat block), the piers rise to the band
  const ua = 39.9, ub = 59.3, rise = 0.9, half = (ub - ua) / 2, R = (half * half + rise * rise) / (2 * rise), uc = (ua + ub) / 2;
  const topAt = (m) => 7.6 + Math.sqrt(Math.max(0, R * R - (m - uc) * (m - uc))) - (R - rise);
  for (let i = 0; i < 4; i++) {
    for (const [p0, p1] of [[38.5, ua], [ub, 61.0]]) k.box(stone, p0 + ((p1 - p0) * i) / 4, p0 + ((p1 - p0) * (i + 1)) / 4, 0, 7.6 + 1.3, 0, 0.5, { c: 0.01 });
  }
  k.box(stone, ua, ub, 3.7, 4.7, 0, 0.3, { c: 0.015 });
  for (let i = 0; i < 64; i++) {
    const a0 = ua + ((ub - ua) * i) / 64, a1 = ua + ((ub - ua) * (i + 1)) / 64, top = topAt((a0 + a1) / 2);
    k.box(panel, a0, a1, 4.7, top, 0.05, 0.12, { c: 0 });
    k.box(stone, a0, a1, top, top + 1.3, 0.02, 0.5, { c: 0 });
  }
  // the Frederick Douglass face (u from the south end): the same upper curtain wall, retail glass bands, an invented-brand billboard, the TD sign at the corner
  const fd = frame.face([1667.5, -3003.46, 1637.81, -2949.86]);
  if (fd) {
    const k2 = fd.kit, L2 = fd.L;
    curtain(k2, range(0.0, L2, Math.round(L2 / 2.2)), [10.3, 12.4, 14.9, 17.4, 19.2], { w: 0.12, glass: 'glass_clear', frame: 'alu_clear', fw: 0.035, fd: 0.05, hi: '#768693', lo: '#4d6272' });
    for (let y = 16.05; y < 17.35; y += 0.16) k2.box(louv, 0.1, L2 - 0.1, y, y + 0.05, 0.02, 0.1, { c: 0, near: true });
    curtain(k2, range(0.2, L2 - 1.0, 28), [4.1, 8.6], { w: 0.02, glass: 'glass_clear', frame: 'alu_clear', fw: 0.05, hi: '#8d9296', lo: '#4b5156', split: 0.5 });
    for (let y = 8.62; y < 8.98; y += 0.09) k2.box(louv, 0.1, L2 - 1.0, y, y + 0.04, 0.0, 0.12, { c: 0, near: true });
    k2.sign({ kind: 'painted', text: 'Small steps are so much sweeter.', u0: 14.0, u1: 50.0, y: 10.9, h: 4.4, bg: null, fg: '#26344a', logo: billboard, logoAt: 'fill' }, { z: 0.165 });
    k2.sign({ kind: 'lightbox', text: 'TD', font: 'Inter-800', fg: '#ffffff', bg: '#2d8a3e', u0: 50.2, u1: 52.2, y: 5.0, h: 1.4, depth: 0.14, lit: 'face', frame: '#ffffff' }, { z: 0.3 });
  }
  k.sign({ kind: 'channel', text: 'OLD NAVY', font: 'Archivo-900', u0: 44.5, u1: 55.1, y: 5.45, h: 1.6, bg: null, fg: '#1d3b8f', depth: 0.15, lit: 'face', tracking: 0.02 }, { z: 0.12 });
}
export const kng = mark((c, W, H) => {
  c.fillStyle = '#b3202a'; c.fillRect(0, 0, W, H);
  text(c, 'K&G', W * 0.13, H * 0.55, { key: 'Anton', weight: 400, px: H * 0.7, maxW: W * 0.22, color: '#ffffff' });
  for (const [x, t] of [[0.38, 'FOR MEN'], [0.6, 'FOR WOMEN'], [0.84, 'FOR LESS']]) {
    text(c, t, W * x, H * 0.55, { key: 'Oswald', weight: 600, px: H * 0.34, maxW: W * 0.2, color: '#ffffff', italic: true });
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(W * (x + 0.1), H * 0.4); c.lineTo(W * (x + 0.12), H * 0.55); c.lineTo(W * (x + 0.1), H * 0.7); c.fill();
  }
}, ['Anton-400', 'Oswald-600']);

// every builder lays its building's roof after its own work
const WRAP = (f) => (group, ctx, spec, frame) => { f(group, ctx, spec, frame); tenementShades(spec, frame); windowPanes(spec, frame); roofOf(spec, frame); };
export const eighth2329 = WRAP(_eighth2329);
export const pcrichard = WRAP(_pcrichard);
export const w324 = WRAP(_w324);
export const w351 = WRAP(_w351);
export const w313 = WRAP(_w313);
export const w321 = WRAP(_w321);
export const w361 = WRAP(_w361);
export const w319 = WRAP(_w319);
export const w365 = WRAP(_w365);
export const w317 = WRAP(_w317);
export const w305 = WRAP(_w305);
export const w307 = WRAP(_w307);
export const w383 = WRAP(_w383);
export const w374 = WRAP(_w374);
export const hancock = WRAP(_hancock);
export const harlemusa = WRAP(_harlemusa);
