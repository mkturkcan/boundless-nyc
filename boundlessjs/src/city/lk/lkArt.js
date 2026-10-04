// AR34 LIFE canvas art (part lk, docs/notes/ar34-life.md), drawn from scratch: the fabric atlas (umbrella and tent cloth,
// tablecloths, wax prints, tarps), the goods atlas (book spines, oils, prints, sunglasses, cardboard, produce skins, caps,
// beads, carvings, soaps), the shed's painted plywood with its POST NO BILLS stencils, the shed's notice boards and the
// produce stall's valance (invented names and numbers only), the wire-mesh panel and the plastic crinkle of the bags.
import * as THREE from 'three';

let _seed = 9127;
const rnd = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

// ---------------------------------------------------------------- fabric atlas: 8 x 4 cells of 128 px
export const FAB = {
  white: 0, cream: 1, red: 2, blue: 3, yellow: 4, green: 5, orange: 6, navy: 7,
  black: 8, grey: 9, teal: 10, purple: 11, pink: 12, brown: 13, olive: 14, sky: 15,
  stripeRW: 16, stripeBW: 17, waxA: 18, waxB: 19, waxC: 20, waxD: 21, kente: 22, denim: 23,
  tarp: 24, clear: 25, khaki: 26, camo: 27, maroon: 28, lilac: 29, beige: 30, charcoal: 31,
  // the fifth row: beach-umbrella cloths (rings across the cell's v: on an umbrella panel v runs from the hub to the rim),
  // a creased blue tarp for stall walls, a grey-white tarp, a red air-dancer nylon
  ringBlue: 32, tropic: 33, tarpCrease: 34, ringRainbow: 35, tarpGrey: 36, nylonRed: 37, ringOrange: 38, rose: 39,
};
export const FAB_COLS = 8, FAB_ROWS = 5;
const FAB_RGB = ['#eeeeea', '#e6dcc4', '#c4252a', '#1f4fa8', '#efc322', '#2d7d3c', '#e8691c', '#1c2547',
  '#1a1a1c', '#8b8d8e', '#127a7c', '#5b2c83', '#e46aa2', '#6b4429', '#6a6b35', '#68a8d8'];
function waxCell(x, cx, cy, S, pal, kind) {
  x.fillStyle = pal[0]; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < 22; k++) {
    const px = cx + rnd() * S, py = cy + rnd() * S, r = 6 + rnd() * 16;
    x.fillStyle = pal[1 + (k % (pal.length - 1))];
    x.beginPath();
    if (kind === 0) x.arc(px, py, r, 0, Math.PI * 2);
    else if (kind === 1) { x.ellipse(px, py, r * 1.4, r * 0.6, rnd() * 3, 0, Math.PI * 2); }
    else { x.moveTo(px, py - r); x.lineTo(px + r, py); x.lineTo(px, py + r); x.lineTo(px - r, py); x.closePath(); }
    x.fill();
    x.fillStyle = pal[0]; x.beginPath(); x.arc(px, py, r * 0.35, 0, Math.PI * 2); x.fill();
  }
}
// the fifth row (cells 32-39). Rings: bands across the cell (constant y), so an umbrella panel (u along the rim, v from
// the hub out) shows concentric stripes; the hub end is the cell's bottom (v = 0).
function fifthRow(x, i, cx, cy, S) {
  const band = (cols, ws) => { let y = cy + S; let k = 0; while (y > cy) { const h = ws[k % ws.length]; x.fillStyle = cols[k % cols.length]; x.fillRect(cx, y - h, S, h); y -= h; k++; } };
  if (i === 32) band(['#1d4fb8', '#2f6fd8', '#1d4fb8', '#e9eef5', '#1d4fb8', '#5b9be6', '#1a46a6'], [26, 7, 18, 6, 22, 8, 41]);
  else if (i === 35) band(['#d8332c', '#f08a24', '#f2cf2a', '#3e9a45', '#2b67c4', '#6a3d9a'], [21, 21, 22, 21, 22, 21]);
  else if (i === 38) band(['#e8691c', '#f4f0e6', '#e8691c', '#f2c230'], [30, 10, 30, 58]);
  else if (i === 33) {
    // a beach-umbrella print: sun-yellow ground fading to orange at the rim, teal and blue fronds, white flowers
    const g = x.createLinearGradient(0, cy + S, 0, cy); g.addColorStop(0, '#f6d23c'); g.addColorStop(0.65, '#f2a93a'); g.addColorStop(1, '#e8772a');
    x.fillStyle = g; x.fillRect(cx, cy, S, S);
    for (let k = 0; k < 16; k++) {
      const px = cx + rnd() * S, py = cy + rnd() * S, r = 10 + rnd() * 18, a = rnd() * 3;
      x.fillStyle = ['#1e8f9c', '#2a62b8', '#5fb0d8', '#2f8a4a'][k % 4];
      x.beginPath(); x.ellipse(px, py, r, r * 0.32, a, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(px + Math.cos(a + 0.6) * r * 0.5, py + Math.sin(a + 0.6) * r * 0.5, r * 0.7, r * 0.22, a + 0.6, 0, Math.PI * 2); x.fill();
    }
    for (let k = 0; k < 10; k++) { const px = cx + rnd() * S, py = cy + rnd() * S; x.fillStyle = '#f7f3e8'; for (let j = 0; j < 5; j++) { x.beginPath(); x.arc(px + Math.cos(j * 1.26) * 4, py + Math.sin(j * 1.26) * 4, 3, 0, Math.PI * 2); x.fill(); } x.fillStyle = '#d8442a'; x.beginPath(); x.arc(px, py, 2, 0, Math.PI * 2); x.fill(); }
  } else if (i === 34 || i === 36) {
    // a tarp: woven poly with creases from its folds (light and dark seams), grommet hems along the top and the bottom
    // poly tarp blue as it reads in the sun: lighter at the top where it catches the sky, darker into the folds below
    if (i === 34) { const g = x.createLinearGradient(0, cy, 0, cy + S); g.addColorStop(0, '#3b84d4'); g.addColorStop(1, '#2264b4'); x.fillStyle = g; }
    else x.fillStyle = '#a9adb0';
    x.fillRect(cx, cy, S, S);
    for (let k = 0; k < 14; k++) {
      const y0 = cy + rnd() * S, x0 = cx + rnd() * S, len = 30 + rnd() * 70, a = (rnd() - 0.5) * 0.8;
      x.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.12})`; x.lineWidth = 1.5; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); x.stroke();
      x.strokeStyle = `rgba(0,0,0,${0.12 + rnd() * 0.12})`; x.beginPath(); x.moveTo(x0, y0 + 2); x.lineTo(x0 + Math.cos(a) * len, y0 + 2 + Math.sin(a) * len); x.stroke();
    }
    for (const yy of [cy + 4, cy + S - 6]) { x.fillStyle = i === 34 ? '#174a8f' : '#8a8e91'; x.fillRect(cx, yy - 3, S, 6); for (let k = 8; k < S; k += 32) { x.fillStyle = '#c9c4b0'; x.beginPath(); x.arc(cx + k, yy, 2.4, 0, Math.PI * 2); x.fill(); } }
  } else if (i === 37) {
    // air-dancer nylon: a saturated red with the sheen of its seams
    x.fillStyle = '#d8231f'; x.fillRect(cx, cy, S, S);
    for (let k = 0; k < S; k += 32) { x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(cx + k, cy, 3, S); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(cx + k + 3, cy, 2, S); }
  } else {
    // a sun-faded rose umbrella cloth (the book stand's at TD Bank): paler toward the crown where the sun hits longest
    const g = x.createLinearGradient(0, cy + S, 0, cy); g.addColorStop(0, '#d9aaa6'); g.addColorStop(1, '#c4847f');
    x.fillStyle = g; x.fillRect(cx, cy, S, S);
  }
}
let _fab = null;
export function fabricTex() {
  if (_fab) return _fab;
  const S = 128, c = canvas(S * FAB_COLS, S * FAB_ROWS), x = c.getContext('2d');
  for (let i = 0; i < FAB_COLS * FAB_ROWS; i++) {
    const cx = (i % FAB_COLS) * S, cy = Math.floor(i / FAB_COLS) * S;
    if (i < 16) { x.fillStyle = FAB_RGB[i]; x.fillRect(cx, cy, S, S); }
    else if (i >= 32) fifthRow(x, i, cx, cy, S);
    else if (i === 16 || i === 17) {
      for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#efefea' : (i === 16 ? '#c4252a' : '#1f4fa8'); x.fillRect(cx + k * 16, cy, 16, S); }
    } else if (i >= 18 && i <= 21) {
      const pals = [['#e8691c', '#1a1a1c', '#efc322', '#2d7d3c'], ['#1f4fa8', '#efc322', '#eeeeea', '#c4252a'], ['#2d7d3c', '#c4252a', '#efc322', '#1a1a1c'], ['#5b2c83', '#e8691c', '#efc322', '#127a7c']];
      waxCell(x, cx, cy, S, pals[i - 18], i % 3);
    } else if (i === 22) {
      const k = ['#efc322', '#2d7d3c', '#c4252a', '#1a1a1c'];
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { x.fillStyle = k[(a + b * 3) % 4]; x.fillRect(cx + a * 16, cy + b * 16, 16, 16); x.fillStyle = k[(a * 2 + b) % 4]; x.fillRect(cx + a * 16 + 4, cy + b * 16 + 6, 8, 4); }
    } else if (i === 23) { x.fillStyle = '#3b5578'; x.fillRect(cx, cy, S, S); }
    else {
      const col = { 24: '#1d63b8', 25: '#d8dcdc', 26: '#b39a6a', 27: '#59603d', 28: '#6e1f2a', 29: '#b5a2cf', 30: '#d9c9a8', 31: '#3a3b3d' }[i];
      x.fillStyle = col; x.fillRect(cx, cy, S, S);
      if (i === 27) for (let k = 0; k < 30; k++) { x.fillStyle = ['#3f442a', '#7a7550', '#2b2a1f'][k % 3]; x.beginPath(); x.ellipse(cx + rnd() * S, cy + rnd() * S, 8 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); x.fill(); }
    }
    // the weave and the wear: a fine cross-hatch, a soft soil gradient to the cell's lower edge, a few stains
    x.globalAlpha = 0.07;
    for (let k = 0; k < S; k += 2) { x.fillStyle = k % 4 ? '#000' : '#fff'; x.fillRect(cx, cy + k, S, 1); x.fillRect(cx + k, cy, 1, S); }
    x.globalAlpha = 1;
    const g = x.createLinearGradient(0, cy, 0, cy + S);
    g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(0.75, 'rgba(60,50,40,0.04)'); g.addColorStop(1, 'rgba(60,50,40,0.16)');
    x.fillStyle = g; x.fillRect(cx, cy, S, S);
    for (let k = 0; k < 3; k++) { x.fillStyle = `rgba(70,60,45,${0.04 + rnd() * 0.05})`; x.beginPath(); x.ellipse(cx + rnd() * S, cy + rnd() * S, 6 + rnd() * 14, 4 + rnd() * 8, rnd() * 3, 0, Math.PI * 2); x.fill(); }
  }
  return (_fab = tex(c));
}
// a geometry's UVs (metres) squeezed into one cell of an atlas (cols x rows), with a margin so mipmaps never bleed
export function toCell(g, cell, cols = FAB_COLS, rows = FAB_ROWS, tile = 0) {
  const uv = g.getAttribute('uv');
  if (!uv) return g;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  const cx = cell % cols, cy = Math.floor(cell / cols), m = 0.06;
  const du = tile ? tile : (u1 - u0 || 1), dv = tile ? tile : (v1 - v0 || 1);
  for (let i = 0; i < uv.count; i++) {
    let a = (uv.getX(i) - u0) / du, b = (uv.getY(i) - v0) / dv;
    if (tile) { a = Math.min(1, a); b = Math.min(1, b); }
    uv.setXY(i, (cx + m + a * (1 - 2 * m)) / cols, 1 - (cy + m + (1 - b) * (1 - 2 * m)) / rows);
  }
  uv.needsUpdate = true;
  return g;
}

// ---------------------------------------------------------------- goods atlas: 4 x 4 cells of 256 px
export const GOODS = { books: 0, oils: 1, teeBlack: 2, teeWhite: 3, shades: 4, cardboard: 5, apples: 6, oranges: 7, bananas: 8,
  limes: 9, onions: 10, tomatoes: 11, caps: 12, beads: 13, carving: 14, soap: 15 };
let _goods = null;
function speckle(x, cx, cy, S, base, spots, n, r0, r1) {
  x.fillStyle = base; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < n; k++) { x.fillStyle = spots[k % spots.length]; x.globalAlpha = 0.25 + rnd() * 0.5; x.beginPath(); x.arc(cx + rnd() * S, cy + rnd() * S, r0 + rnd() * (r1 - r0), 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
  // the highlight band of a round fruit read at the cell's centre: the UV sphere maps v to latitude
  const g = x.createLinearGradient(0, cy, 0, cy + S);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.45, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = g; x.fillRect(cx, cy, S, S);
}
export function goodsTex() {
  if (_goods) return _goods;
  const S = 256, c = canvas(S * 4, S * 4), x = c.getContext('2d');
  const cell = (i) => [(i % 4) * S, Math.floor(i / 4) * S];
  let [cx, cy] = cell(0);
  // book spines: varied widths, cloth and paper colours, title bars
  for (let px = 0; px < S;) {
    const w = 10 + Math.floor(rnd() * 22), col = hsl(Math.floor(rnd() * 360), 20 + rnd() * 50, 18 + rnd() * 55);
    x.fillStyle = col; x.fillRect(cx + px, cy, w, S);
    x.fillStyle = rnd() < 0.5 ? 'rgba(240,230,200,0.85)' : 'rgba(20,20,20,0.6)';
    x.fillRect(cx + px + 2, cy + 30 + rnd() * 40, w - 4, 6 + rnd() * 10);
    x.fillRect(cx + px + 2, cy + 150 + rnd() * 50, w - 4, 3);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(cx + px + w - 1, cy, 1, S);
    px += w;
  }
  [cx, cy] = cell(1);
  // oils: amber and clear bottles with bright labels (rows)
  x.fillStyle = '#5a3812'; x.fillRect(cx, cy, S, S);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) {
    const bx = cx + k * 32 + 4, by = cy + r * 64 + 6;
    x.fillStyle = ['#7a4a14', '#a8741e', '#3d2a10', '#c4a050'][(k + r) % 4]; x.fillRect(bx, by, 24, 56);
    x.fillStyle = hsl(Math.floor(rnd() * 360), 70, 55); x.fillRect(bx + 2, by + 22, 20, 20);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(bx + 3, by + 2, 3, 50);
  }
  [cx, cy] = cell(2);
  // printed tees: a black field with an invented sunburst and stars
  x.fillStyle = '#18181a'; x.fillRect(cx, cy, S, S);
  x.fillStyle = '#e2b52a'; x.beginPath(); x.arc(cx + 128, cy + 110, 54, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c4252a'; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; x.fillRect(cx + 128 + Math.cos(a) * 70 - 4, cy + 110 + Math.sin(a) * 70 - 4, 8, 8); }
  x.fillStyle = '#2d7d3c'; x.fillRect(cx + 60, cy + 190, 136, 18);
  [cx, cy] = cell(3);
  x.fillStyle = '#ecebe6'; x.fillRect(cx, cy, S, S);
  for (const [k, col] of [[0, '#c4252a'], [1, '#efc322'], [2, '#2d7d3c']]) { x.fillStyle = col; x.fillRect(cx + 50, cy + 70 + k * 36, 156, 30); }
  x.fillStyle = '#18181a'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText('HARLEM', cx + 128, cy + 220);
  [cx, cy] = cell(4);
  // sunglasses on a white card rack
  x.fillStyle = '#e9e9e4'; x.fillRect(cx, cy, S, S);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) {
    const gx = cx + 20 + k * 80, gy = cy + 18 + r * 48;
    x.fillStyle = ['#111', '#3a2a14', '#1a2a4a', '#4a1a1a'][(r + k) % 4];
    x.beginPath(); x.ellipse(gx + 16, gy + 14, 15, 12, 0, 0, Math.PI * 2); x.ellipse(gx + 50, gy + 14, 15, 12, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(gx + 28, gy + 8, 10, 3);
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillRect(gx + 8, gy + 6, 6, 3); x.fillRect(gx + 42, gy + 6, 6, 3);
  }
  [cx, cy] = cell(5);
  // cardboard: kraft with flute shadows, tape and an invented produce print
  x.fillStyle = '#a77e4f'; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < S; k += 5) { x.fillStyle = 'rgba(90,60,30,0.10)'; x.fillRect(cx, cy + k, S, 2); }
  x.fillStyle = 'rgba(200,170,120,0.6)'; x.fillRect(cx, cy + 118, S, 20);
  x.fillStyle = '#2c5a2a'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText('VALLEY FRESH', cx + 128, cy + 80);
  x.fillStyle = '#b02a1e'; x.beginPath(); x.arc(cx + 128, cy + 190, 30, 0, Math.PI * 2); x.fill();
  speckle(x, ...cell(6), S, '#a3171d', ['#d8452c', '#e8b13a', '#5a0c10'], 400, 1, 4);
  speckle(x, ...cell(7), S, '#e47a12', ['#f5a23a', '#c45a08'], 600, 1, 2.5);
  speckle(x, ...cell(8), S, '#e8c834', ['#6a4a14', '#b8a020', '#f5e070'], 120, 1, 3);
  speckle(x, ...cell(9), S, '#4f8f2a', ['#3a6e1c', '#8abf4a'], 500, 1, 3);
  speckle(x, ...cell(10), S, '#9a6a3a', ['#c8955a', '#5a3a1c', '#e0c090'], 400, 1, 4);
  speckle(x, ...cell(11), S, '#c22216', ['#e8452a', '#7a0c08'], 200, 2, 5);
  [cx, cy] = cell(12);
  // caps: panels of cotton twill in mixed colours
  for (let k = 0; k < 16; k++) { x.fillStyle = ['#1a1a1c', '#c4252a', '#1f4fa8', '#ecebe6', '#2d7d3c', '#6a6b35', '#e8691c', '#5b2c83'][k % 8]; x.fillRect(cx + (k % 4) * 64, cy + Math.floor(k / 4) * 64, 64, 64); }
  [cx, cy] = cell(13);
  x.fillStyle = '#20180f'; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < 700; k++) { x.fillStyle = hsl(Math.floor(rnd() * 360), 75, 35 + rnd() * 35); x.beginPath(); x.arc(cx + rnd() * S, cy + rnd() * S, 2 + rnd() * 3, 0, Math.PI * 2); x.fill(); }
  [cx, cy] = cell(14);
  x.fillStyle = '#5a3a1e'; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < 60; k++) { x.strokeStyle = `rgba(30,18,8,${0.2 + rnd() * 0.3})`; x.lineWidth = 1 + rnd() * 2; x.beginPath(); const y0 = cy + rnd() * S; x.moveTo(cx, y0); x.bezierCurveTo(cx + 80, y0 + rnd() * 20 - 10, cx + 170, y0 + rnd() * 20 - 10, cx + S, y0 + rnd() * 10 - 5); x.stroke(); }
  [cx, cy] = cell(15);
  x.fillStyle = '#e6dcc0'; x.fillRect(cx, cy, S, S);
  for (let k = 0; k < 4; k++) { x.fillStyle = ['#7a3a8a', '#2d7d3c', '#c4252a', '#e8691c'][k]; x.fillRect(cx + 10 + k * 62, cy + 100, 52, 50); x.fillStyle = '#fff'; x.fillRect(cx + 16 + k * 62, cy + 115, 40, 6); }
  return (_goods = tex(c));
}

// ---------------------------------------------------------------- the shed's plywood: 4.8 m (two sheets) per repeat
const _ply = {};
export function plywoodTex(stencil = true) {
  if (_ply[stencil]) return _ply[stencil];
  const W = 1024, H = 256, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = stencil ? '#2b5a43' : '#2a4f43'; x.fillRect(0, 0, W, H);
  // brush-roller variation, the sheet joint, nail lines, drips and grime toward the bottom
  for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${(0.015 + rnd() * 0.03) * (stencil ? 1 : 0.45)})`; x.fillRect(rnd() * W, 0, 6 + rnd() * 30, H); }
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(W / 2 - 1, 0, 2, H); x.fillRect(0, 0, 2, H);
  for (let k = 0; k < 18; k++) { x.fillStyle = 'rgba(20,30,25,0.5)'; x.fillRect(W / 2 - 6, 10 + k * 13, 2, 2); x.fillRect(W / 2 + 5, 10 + k * 13, 2, 2); }
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(40,35,25,0.08)'); g.addColorStop(1, 'rgba(40,35,25,0.28)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(30,25,18,${0.05 + rnd() * 0.08})`; x.fillRect(rnd() * W, H * (0.3 + rnd() * 0.5), 1 + rnd() * 2, H); }
  // POST NO BILLS, a stencil (bridges in the letters), once per sheet pair
  if (stencil) {
  x.fillStyle = 'rgba(238,238,230,0.92)'; x.font = 'bold 54px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('POST NO BILLS', W * 0.25, H * 0.5);
  x.fillStyle = '#2b5a43';
  for (let k = 0; k < 11; k++) x.fillRect(W * 0.25 - 200 + k * 37, H * 0.5 - 2, 3, 4);
  // remnants of torn bills and a tag (invented)
  x.fillStyle = 'rgba(225,220,200,0.55)'; x.fillRect(W * 0.62, H * 0.2, 70, 90); x.fillStyle = 'rgba(200,60,50,0.4)'; x.fillRect(W * 0.62 + 8, H * 0.2 + 10, 50, 14);
  x.strokeStyle = 'rgba(20,20,20,0.75)'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath();
  x.moveTo(W * 0.8, H * 0.7); x.bezierCurveTo(W * 0.83, H * 0.3, W * 0.86, H * 0.85, W * 0.88, H * 0.45); x.bezierCurveTo(W * 0.9, H * 0.2, W * 0.93, H * 0.8, W * 0.95, H * 0.5); x.stroke();
  }
  return (_ply[stencil] = tex(c));
}
// notice boards on the shed's parapet (invented names): 2 x 2 cells of 512 x 256
let _signs = null;
export function shedSignTex() {
  if (_signs) return _signs;
  const c = canvas(1024, 512), x = c.getContext('2d');
  const board = (cx, cy, bg, lines) => {
    x.fillStyle = bg; x.fillRect(cx, cy, 512, 256);
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 6; x.strokeRect(cx + 3, cy + 3, 506, 250);
    x.textAlign = 'center';
    for (const [t, y, sz, col] of lines) { x.fillStyle = col; x.font = `bold ${sz}px Arial`; x.fillText(t, cx + 256, cy + y); }
  };
  board(0, 0, '#f2f1ec', [['2090 Adam Clayton Powell Jr. Blvd', 70, 30, '#1c2547'], ['LENWOOD PROPERTY MGMT', 140, 36, '#1c2547'], ['24 HR EMERGENCY 212 555 0148', 215, 22, '#333']]);
  board(512, 0, '#1f3f8a', [['NORTHGATE', 90, 56, '#ffffff'], ['RESTORATION', 150, 34, '#ffffff'], ['212 555 0193', 215, 26, '#f2c94c']]);
  board(0, 256, '#f2f1ec', [['DANGER', 70, 46, '#b11d1d'], ['OVERHEAD WORK', 140, 40, '#111'], ['PERMIT # 121-0000-01', 215, 22, '#333']]);
  board(512, 256, '#e9e4d2', [['SIDEWALK SHED', 90, 44, '#1c2547'], ['DOB NOW B00000000-I1', 160, 24, '#333'], ['EXPIRES 06/30/2027', 215, 24, '#333']]);
  return (_signs = tex(c, { clamp: true }));
}
// the produce stall's printed valance: fruit photographs on white (drawn) and an invented stall name
let _val = null;
export function valanceTex() {
  if (_val) return _val;
  const c = canvas(1024, 64), x = c.getContext('2d');
  x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, 1024, 64);
  const cols = ['#c22216', '#e47a12', '#e8c834', '#4f8f2a', '#7a2a6a', '#d8452c'];
  for (let k = 0; k < 44; k++) { x.fillStyle = cols[k % cols.length]; x.beginPath(); x.arc(14 + k * 23.3, 32 + Math.sin(k) * 6, 9 + (k % 3) * 2, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.arc(10 + k * 23.3, 27 + Math.sin(k) * 6, 3, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = 'rgba(244,243,238,0.9)'; x.fillRect(380, 8, 264, 48);
  x.fillStyle = '#1e6b2c'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText('FRESH FRUIT', 512, 43);
  return (_val = tex(c));
}
// a welded wire-mesh panel (alpha-tested): 50 mm squares
let _mesh = null;
export function meshTex() {
  if (_mesh) return _mesh;
  const c = canvas(128, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = '#ffffff';
  for (let k = 0; k < 128; k += 32) { x.fillRect(k, 0, 5, 128); x.fillRect(0, k, 128, 5); }
  return (_mesh = tex(c, { linear: true }));
}
// the bags' crinkle: a normal map of creases and puckers (tangent space, tiled)
let _crk = null;
export function crinkleTex() {
  if (_crk) return _crk;
  const N = 256, h = new Float32Array(N * N);
  for (let k = 0; k < 90; k++) {
    // a crease: a ridge along a random line, falling off fast
    const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), px = rnd() * N, py = rnd() * N, w = 1.5 + rnd() * 3, amp = (rnd() - 0.4) * 1.2, L = 30 + rnd() * 90;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let dx = x - px, dy = y - py;
      dx -= Math.round(dx / N) * N; dy -= Math.round(dy / N) * N;
      const t = dx * ca + dy * sa, d = -dx * sa + dy * ca;
      if (Math.abs(t) > L) continue;
      h[y * N + x] += amp * Math.exp(-(d * d) / (w * w)) * (1 - Math.abs(t) / L);
    }
  }
  const c = canvas(N, N), x2 = c.getContext('2d'), im = x2.createImageData(N, N);
  const H = (x, y) => h[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 1.6, dy = (H(x, y + 1) - H(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    im.data[o] = (-dx / l * 0.5 + 0.5) * 255; im.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; im.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[o + 3] = 255;
  }
  x2.putImageData(im, 0, 0);
  return (_crk = tex(c, { linear: true }));
}

// a sandwich board's poster (an invented shop's sale): yellow plastic frame face, black and red lettering
let _af = null;
export function aframeTex() {
  if (_af) return _af;
  const c = canvas(256, 512), x = c.getContext('2d');
  x.fillStyle = '#f2c81c'; x.fillRect(0, 0, 256, 512);
  x.fillStyle = '#fbfaf4'; x.fillRect(18, 18, 220, 476);
  x.textAlign = 'center';
  x.fillStyle = '#c4161c'; x.font = 'bold 64px Arial'; x.fillText('SALE', 128, 100);
  x.fillStyle = '#111'; x.font = 'bold 30px Arial'; x.fillText('HATS', 128, 170); x.fillText('WIGS', 128, 215); x.fillText('JEWELRY', 128, 260);
  x.fillStyle = '#c4161c'; x.font = 'bold 44px Arial'; x.fillText('2 FOR $20', 128, 340);
  x.fillStyle = '#111'; x.font = 'bold 24px Arial'; x.fillText('COME INSIDE', 128, 420);
  x.fillStyle = 'rgba(80,70,40,0.12)'; x.fillRect(18, 440, 220, 54);
  return (_af = tex(c, { clamp: true }));
}

// ---------------------------------------------------------------- decal atlas: 4 x 2 cells of 256 px (printed marks, alpha-tested)
// the delivery bag's mark (an invented winged badge), a scooter's side stripes, a plate (invented number), the halal cart's
// lit menu header and its picture menu, the snack cart's printed wrap, the share bike box's pale band, crisp-bag fronts.
// Every name, number and price invented.
export const DECAL = { bagLogo: 0, stripeGreen: 1, plate: 2, menuHead: 3, menuPics: 4, wrapSnack: 5, shareBox: 6, chips: 7 };
export const DECAL_COLS = 4, DECAL_ROWS = 2;
let _dec = null;
function foodTile(x, X, Y, w, h, k) {
  // a photo tile of a plate of food: a white plate, rice, meat, salad and sauce blobs (drawn shapes, no photograph)
  x.fillStyle = '#f4f1ea'; x.fillRect(X, Y, w, h);
  x.fillStyle = ['#c98a3c', '#a4532a', '#d9a441', '#7a4a2a'][k % 4];
  x.beginPath(); x.ellipse(X + w * 0.5, Y + h * 0.55, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f0dc9a'; x.beginPath(); x.ellipse(X + w * 0.36, Y + h * 0.6, w * 0.22, h * 0.2, 0.3, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 9; i++) { x.fillStyle = ['#8a3b1a', '#5c8f2a', '#d23a22', '#efe6c8'][(i + k) % 4]; x.beginPath(); x.arc(X + w * (0.42 + rnd() * 0.36), Y + h * (0.32 + rnd() * 0.42), 2 + rnd() * 5, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X + w * 0.3, Y + h * 0.45); x.bezierCurveTo(X + w * 0.5, Y + h * 0.3, X + w * 0.6, Y + h * 0.7, X + w * 0.78, Y + h * 0.48); x.stroke();
}
export function decalTex() {
  if (_dec) return _dec;
  const S = 256, c = canvas(S * DECAL_COLS, S * DECAL_ROWS), x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const cell = (i) => [(i % DECAL_COLS) * S, Math.floor(i / DECAL_COLS) * S];
  // 0 the bag's mark: black nylon, a white winged badge, an invented word
  let [X, Y] = cell(0);
  x.fillStyle = '#141517'; x.fillRect(X, Y, S, S);
  x.strokeStyle = '#e9e9e6'; x.fillStyle = '#e9e9e6'; x.lineWidth = 5;
  x.beginPath(); x.arc(X + 128, Y + 100, 26, 0, Math.PI * 2); x.stroke();
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    x.beginPath(); x.moveTo(X + 128 + s * 30, Y + 92 + k * 6); x.quadraticCurveTo(X + 128 + s * (60 + k * 8), Y + 78 + k * 7, X + 128 + s * (98 - k * 12), Y + 80 + k * 9); x.stroke();
  }
  x.font = 'bold 34px Arial'; x.fillText('SKYLARK', X + 128, Y + 168);
  x.font = 'bold 15px Arial'; x.fillText('FAST DELIVERY', X + 128, Y + 200);
  // 1 a scooter's side stripes: two lime slashes (alpha elsewhere)
  [X, Y] = cell(1);
  x.fillStyle = '#7fd12b';
  for (const [a, b, h] of [[20, 120, 70], [60, 236, 40]]) { x.beginPath(); x.moveTo(X + a, Y + 150); x.lineTo(X + b, Y + 150 - h); x.lineTo(X + b + 18, Y + 150 - h); x.lineTo(X + a + 26, Y + 150); x.fill(); }
  x.fillRect(X + 20, Y + 160, 216, 10);
  // 2 a plate: white, a navy band, an invented number
  [X, Y] = cell(2);
  x.fillStyle = '#f3f1e8'; x.fillRect(X + 8, Y + 50, 240, 156);
  x.fillStyle = '#1f2f6b'; x.fillRect(X + 8, Y + 50, 240, 30);
  x.fillStyle = '#f3f1e8'; x.font = 'bold 18px Arial'; x.fillText('NEW YORK', X + 128, Y + 66);
  x.fillStyle = '#1f2f6b'; x.font = 'bold 64px Arial'; x.fillText('8RK 274', X + 128, Y + 140);
  x.fillStyle = '#c99a2e'; x.fillRect(X + 8, Y + 190, 240, 16);
  // 3-5 are drawn at 2:1 and squeezed into their square cells: they sit on 2:1 panels
  const wide = (cellI, draw) => { const o = canvas(512, 256), y = o.getContext('2d'); y.textAlign = 'center'; y.textBaseline = 'middle'; draw(y); const [cx, cy] = cell(cellI); x.drawImage(o, cx, cy, S, S); };
  // 3 the halal cart's menu header: red face, yellow lettering, a row of plate photos with prices
  wide(3, (y) => {
    y.fillStyle = '#b3171d'; y.fillRect(0, 0, 512, 256);
    y.fillStyle = '#ffd23a'; y.font = 'bold 54px Arial'; y.fillText('HALAL FOOD', 256, 40);
    for (let i = 0; i < 6; i++) foodTile(y, 10 + i * 83, 80, 76, 104, i);
    y.font = 'bold 30px Arial'; ['$8', '$9', '$8', '$7', '$10', '$6'].forEach((t, i) => y.fillText(t, 48 + i * 83, 212));
    y.fillStyle = '#ffffff'; y.font = 'bold 20px Arial'; y.fillText('CHICKEN  LAMB  FALAFEL  SODA $2  WATER $1', 256, 242);
  });
  // 4 the picture menu on a cart's body: a navy board, eight photos with names and prices
  wide(4, (y) => {
    y.fillStyle = '#16223f'; y.fillRect(0, 0, 512, 256);
    const names = ['CHICKEN OVER RICE', 'LAMB GYRO', 'COMBO PLATTER', 'FALAFEL', 'FISH', 'SALAD', 'HOT DOG', 'KNISH'];
    for (let i = 0; i < 8; i++) {
      const cx = 6 + (i % 4) * 126, cy = 6 + Math.floor(i / 4) * 126;
      foodTile(y, cx, cy, 120, 82, i + 1);
      y.fillStyle = '#ffffff'; y.font = 'bold 13px Arial'; y.fillText(names[i], cx + 60, cy + 96);
      y.fillStyle = '#ffd23a'; y.font = 'bold 18px Arial'; y.fillText('$' + [8, 9, 10, 7, 10, 6, 3, 4][i], cx + 60, cy + 114);
    }
  });
  // 5 the snack cart's printed wrap: a sky-to-sun ground, ice pops, cones and fruit cups, invented words
  wide(5, (y) => {
    const gr = y.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#2e9fe0'); gr.addColorStop(1, '#f2e35a');
    y.fillStyle = gr; y.fillRect(0, 0, 512, 256);
    y.fillStyle = '#e8322a'; y.font = 'bold 46px Arial'; y.fillText('FRUTAS  ICES', 256, 36);
    for (let i = 0; i < 8; i++) {
      const px = 36 + i * 62, col = ['#e94b8a', '#f39a1e', '#7ac143', '#9b59d0', '#e8322a', '#2fb5a8', '#f2c81c', '#e94b8a'][i];
      y.fillStyle = col; y.beginPath(); y.roundRect(px - 15, 70, 30, 66, 14); y.fill();
      y.fillStyle = '#d9b27c'; y.fillRect(px - 3, 134, 6, 24);
    }
    for (let i = 0; i < 6; i++) {
      const px = 46 + i * 84;
      y.fillStyle = '#f6efe2'; y.beginPath(); y.moveTo(px - 26, 180); y.lineTo(px + 26, 180); y.lineTo(px + 18, 230); y.lineTo(px - 18, 230); y.fill();
      for (let k = 0; k < 7; k++) { y.fillStyle = ['#e8322a', '#f39a1e', '#7ac143', '#ffd23a'][(k + i) % 4]; y.beginPath(); y.arc(px - 16 + rnd() * 32, 175 + rnd() * 10, 8, 0, Math.PI * 2); y.fill(); }
    }
    y.fillStyle = '#1b3f8f'; y.font = 'bold 22px Arial'; y.fillText('SNACKS  DRINKS  CANDY', 256, 246);
  });
  // 6 the share box's pale band (alpha elsewhere)
  [X, Y] = cell(6);
  x.fillStyle = '#f4f0e0'; x.fillRect(X, Y + 104, S, 52);
  // 7 crisp-bag fronts: bright foil faces with a window of crisps
  [X, Y] = cell(7);
  for (let i = 0; i < 4; i++) {
    const bx = X + (i % 2) * 128, by = Y + Math.floor(i / 2) * 128, col = ['#e8322a', '#f2c81c', '#1f63b4', '#2d9a3c'][i];
    x.fillStyle = col; x.fillRect(bx, by, 128, 128);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = 'bold 22px Arial'; x.fillText(['CRUNCH', 'GOLD', 'WAVY', 'ZESTY'][i], bx + 64, by + 28);
    x.fillStyle = '#e2b25a'; x.beginPath(); x.ellipse(bx + 64, by + 82, 40, 26, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#c98a3c'; for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(bx + 40 + rnd() * 48, by + 70 + rnd() * 24, 9, 6, rnd() * 3, 0, Math.PI * 2); x.fill(); }
  }
  return (_dec = tex(c, { clamp: true }));
}
// brushed stainless (tiled): vertical grain, a few smudges
let _brush = null;
export function brushedTex() {
  if (_brush) return _brush;
  const N = 256, c = canvas(N, N), x = c.getContext('2d');
  x.fillStyle = '#9a9fa3'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) {
    const v = 140 + Math.floor(rnd() * 50), a = 0.06 + rnd() * 0.12;
    x.fillStyle = `rgba(${v},${v + 3},${v + 6},${a})`;
    x.fillRect(Math.floor(rnd() * N), 0, 1, N);
  }
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(60,58,52,${0.03 + rnd() * 0.05})`; x.beginPath(); x.ellipse(rnd() * N, rnd() * N, 10 + rnd() * 30, 6 + rnd() * 20, rnd() * 3, 0, Math.PI * 2); x.fill(); }
  return (_brush = tex(c));
}
