// NAMED STOREFRONTS — real businesses on their real frontages (owner 2026-09-24: "the pharmacy, the Appletree deli etc.
// extremely accurate ... use street view images"). Everything else in the city gets a procedural storefront (the facade
// shader's glazed band, shopSigns.js name boxes, the compiled AWNING props, nycDress kit units); a frontage listed here
// gets a modelled shopfront instead: the painted shopfront system (pilasters, bulkheads, transoms, cornice), display
// windows with a lit interior behind reflective glass, doors, fascia signs with the real lettering, awnings with their
// valance text, gooseneck lamps, sidewalk sheds.
//
// Facts were read off refs/streetview/amst120 (Google Street View 2022-2025, reference only: never shipped, never used
// as a texture — every sign here is drawn from scratch on a canvas) and placed on the compiled footprints measured with
// boundlessjs/tools/probe_buildings.mjs. The buildings under them drop their procedural storefront through
// BUILDING_OVERRIDES (shared/landmarkSpec.js, applied at tile read time by world/tiledata.js), and assemble.js skips
// compiled AWNING props inside `namedShopZone()`.
//
// Frames: a FRONT is a straight run of facade. `origin` is its corner vertex (world x, z), `along` the compass heading
// the run follows from there, `faces` the compass heading of its outward normal. Shops sit at [from, to] metres along.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyLightTrim, applySkyGlass, ENV } from '../world/materials.js';

const D2R = Math.PI / 180;
const dirOf = (compass) => [Math.sin(compass * D2R), -Math.cos(compass * D2R)];   // world (x, z); north = -z

// ---------------------------------------------------------------- the data
// W 120th St & Amsterdam Ave (compiled junction node at world 1009.9, -2917.1; Manhattan grid: uptown 29°, east 119°).
export const NAMED_FRONTS = [
  {
    key: 'amst1217',
    name: '1217-1219 Amsterdam Ave (SE corner of W 120th): Hartley Chemist, Hartley Pharmacy, Sliced, Suzi Confections',
    // building #181 edge e1: corner (1015.6, -2895.1) down Amsterdam to (1003.8, -2873.9), facing the avenue
    origin: [1015.6, -2895.1], along: 209, faces: 299, length: 24.3,
    system: { color: 0x474d55, height: 4.62, head: 3.08, fascia: [3.3, 4.34], bulk: 0.72, cornice: 0x3e444b },   // one charcoal painted-wood shopfront for all four
    shops: [
      { key: 'hartleyChemist', from: 0.0, to: 6.6, bays: ['win', 'win'], interior: 'pharmacy', bunting: true,
        fascia: { bg: '#40464d', draw: 'hartleyChemist' }, lamps: 2,
        awning: { color: '#1f5fbd', text: 'SINCE 1947 • MEDICARE • MEDICAID • UNION PLANS • ACCEPT MOST INSURANCE', num: '1217', side: 'hartley' } },
      { key: 'hartleyPharmacy', from: 6.6, to: 12.7, bays: ['win', 'door', 'win'], interior: 'pharmacy', bunting: true,
        fascia: { bg: '#40464d', draw: 'pharmacy' }, lamps: 2,
        awning: { color: '#1f5fbd', text: 'SURGICALS • COSMETICS • GREETINGS • FAX • COPY • LOTTO', num: '1219', side: 'hartley' } },
      { key: 'sliced', from: 12.7, to: 18.4, bays: ['win', 'door'], interior: 'pizza',
        fascia: { bg: '#232527', draw: 'sliced' }, lamps: 1,
        awning: { color: '#c9a02e', text: 'PIZZA', small: true } },
      { key: 'suzi', from: 18.4, to: 24.3, bays: ['door', 'win'], interior: 'candy',
        fascia: { bg: '#1c1d20', draw: 'suzi' }, lamps: 1,
        awning: { color: '#1d2f66', text: '', small: true } },
    ],
  },
  {
    key: 'amst1225',
    name: '1225 Amsterdam Ave (NE corner of W 120th): Appletree Market / Appletree Deli',
    // building #109 edges e12 + e20: corner (1030.4, -2922.1) up Amsterdam; the 5.4 m notch at 11.9-17.3 is a light court
    // above the entrance, the shop runs straight across it (refs: the "Appletree Market" pediment stands there)
    origin: [1030.4, -2922.1], along: 29, faces: 299, length: 30.4,
    system: { color: 0x5b1a1e, height: 3.92, head: 2.62, fascia: [2.78, 3.52], bulk: 0.5, cornice: 0x4a1418 },
    infill: [11.9, 17.3, 8.0],       // [from, to, depth]: one-storey shop floor under the court
    shops: [
      { key: 'appletreeDeli', from: 0.0, to: 6.4, bays: ['win', 'win', 'door'], interior: 'deli', frame: 0x7a1b20,
        fascia: { bg: '#6a1d22', draw: 'appletreeDeli' } },
      { key: 'appletreeCatering', from: 6.4, to: 11.9, bays: ['door', 'door', 'win'], interior: 'deli', frame: 0x8e1d22, poster: 'produce',
        fascia: { bg: '#6a1d22', draw: 'cateringAtm' } },
      { key: 'appletreeMarket', from: 11.9, to: 17.3, bays: ['win', 'door', 'door', 'win'], interior: 'deli', frame: 0x2b2a28, open: true,
        fascia: { bg: '#6a1d22', draw: 'appletreeMarket' }, pediment: 'appletree' },
      { key: 'appletreeGrocery', from: 17.3, to: 30.4, bays: ['win', 'win', 'win', 'win'], interior: 'grocery', frame: 0x1f4f2c, planters: 5,
        fascia: { bg: '#6a1d22', draw: 'grocery' } },
    ],
    // the sidewalk shed that has wrapped the building since 2022 (green sheeting, SPRING SCAFFOLDING signs), raised so the
    // deck clears the shop signs as in the references
    sheds: [{ from: 0, to: 30.4, sign: [3.0, 18.6], sy: 2.2 }],
  },
  {
    key: 'amst1225e',
    name: '1225 Amsterdam Ave, the W 120th St side (residential; the shed wraps round)',
    origin: [1030.4, -2922.1], along: 119, faces: 209, length: 17.9, zoneLength: 30,
    shops: [],
    sheds: [{ from: 0, to: 17.9, sign: 8.0, sy: 2.2 }],
  },
  {
    key: 'amst1217e',
    name: '1217-1219 Amsterdam Ave, the W 120th St side (residential limestone base, window boxes; no shops)',
    origin: [1015.6, -2895.1], along: 119, faces: 29, length: 26, shops: [],
  },
  {
    key: 'amst1233',
    name: '1233-1235 Amsterdam Ave: the two-storey base of the set-back tower (Dunkin\', Spa & Salon)',
    // no footprint in the data (building #14 is the tower alone, 3.4 m back): the base is modelled here
    origin: [1030.4, -2922.1], along: 29, faces: 299, length: 56.6,
    base: { from: 30.4, to: 56.6, depth: 3.4, height: 7.4, color: 0xc9bfae },
    system: { color: 0xd4d4d0, height: 4.2, head: 2.9, fascia: [3.08, 3.98], bulk: 0.45, cornice: 0xb8b6b0 },
    shops: [
      { key: 'towerEntry', from: 30.4, to: 38.2, bays: ['blank', 'door', 'blank'], interior: 'lobby', frame: 0x3a3d40,
        fascia: { bg: '#d6d5d1', draw: 'blank' } },
      { key: 'dunkin', from: 38.2, to: 46.2, bays: ['door', 'win', 'win'], interior: 'donut', frame: 0x8f9194,
        fascia: { bg: '#e9e8e4', draw: 'dunkin' }, awning: { color: '#f26a21', text: "DUNKIN'", barrel: true, span: [0, 0.34] } },
      { key: 'spaSalon', from: 46.2, to: 53.8, bays: ['win', 'door', 'win'], interior: 'salon', frame: 0x222326,
        fascia: { bg: '#d6d5d1', draw: 'blank' },
        awning: { color: '#17181a', text: '1233 Amsterdam Ave.', script: 'Spa & Salon', phone: '212-864-3720   212-864-3493' } },
    ],
  },
];

// assemble.js asks this before placing a compiled AWNING / sign prop: a named front owns its sidewalk strip
export function namedShopZone(x, z, pad = 0.5) {
  for (const F of NAMED_FRONTS) {
    const a = dirOf(F.along), n = dirOf(F.faces);
    const dx = x - F.origin[0], dz = z - F.origin[1];
    const u = dx * a[0] + dz * a[1], w = dx * n[0] + dz * n[1];
    if (u > -pad && u < (F.zoneLength || F.length) + pad && w > -1.0 && w < 3.2) return F.key;
  }
  return null;
}

// ---------------------------------------------------------------- materials
const _mats = new Map();
function paint(hex, rough = 0.62, metal = 0) {
  const k = `p${hex}|${rough}|${metal}`;
  let m = _mats.get(k);
  if (!m) { m = applyLightTrim(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })); _mats.set(k, m); }
  return m;
}
// a canvas-textured surface; `lit` (a second canvas) glows at night (sign letters, a lit interior)
function texMat(canvas, { rough = 0.55, lit = null, litDay = 0, litNight = 1, ds = false } = {}) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const m = applyLightTrim(new THREE.MeshStandardMaterial({
    map, roughness: rough, side: ds ? THREE.DoubleSide : THREE.FrontSide,
    emissive: lit ? 0xffffff : 0x000000, emissiveIntensity: litDay,
  }));
  if (lit) {
    const em = new THREE.CanvasTexture(lit);
    em.colorSpace = THREE.SRGBColorSpace;
    m.emissiveMap = em;
    m.userData.lit = [litDay, litNight];
  }
  return m;
}
const glassMat = () => {
  let m = _mats.get('glass');
  if (!m) {
    m = applySkyGlass(new THREE.MeshStandardMaterial({ color: 0x1b2127, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.34, depthWrite: false }),
      { f0: 0.1, rough: 0.05, tint: [0.96, 0.99, 1.02], aureole: 1.2 });
    _mats.set('glass', m);
  }
  return m;
};

// ---------------------------------------------------------------- canvas art
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// raised channel / applied letters: a soft cast shadow, the letter return, then the face
function raised(g, text, x, y, { font, face, side = 'rgba(0,0,0,0.55)', depth = 5, align = 'center', shadow = 0.5, stroke = null, strokeW = 0 }) {
  g.font = font; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.save();
  g.shadowColor = `rgba(0,0,0,${shadow})`; g.shadowBlur = depth * 2.2; g.shadowOffsetX = depth * 0.7; g.shadowOffsetY = depth * 1.3;
  g.fillStyle = side; g.fillText(text, x + depth * 0.4, y + depth * 0.6);
  g.restore();
  g.fillStyle = side;
  for (let k = depth; k > 0; k -= 1) g.fillText(text, x + k * 0.35, y + k * 0.55);
  if (stroke) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, x, y); }
  g.fillStyle = face; g.fillText(text, x, y);
}
function fitFont(g, text, maxW, px, family, weight = 'bold') {
  let s = px;
  for (;;) { g.font = `${weight} ${s}px ${family}`; if (g.measureText(text).width <= maxW || s < 8) return g.font; s -= 2; }
}
const COND = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const SANS = 'Inter, "Segoe UI", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SCRIPT = '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
// a painted-wood fascia board: the ground with a raised panel moulding
function board(g, W, H, bg, { moulding = true } = {}) {
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (!moulding) return;
  const i = Math.round(H * 0.07);
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 3; g.strokeRect(i + 2, i + 2, W - 2 * i - 4, H - 2 * i - 4);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(i - 1, i - 1, W - 2 * i + 2, H - 2 * i + 2);
}
function rxLogo(g, x, y, s) {
  g.fillStyle = '#f7f4ee'; g.fillRect(x, y, s, s);
  g.strokeStyle = '#d22a25'; g.lineWidth = s * 0.05; g.strokeRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88);
  g.fillStyle = '#d22a25'; g.font = `bold ${Math.round(s * 0.62)}px ${SERIF}`; g.textAlign = 'center';
  g.fillText('℞', x + s * 0.5, y + s * 0.7);
  g.font = `bold ${Math.round(s * 0.1)}px ${SANS}`; g.fillText('SINCE 1947', x + s * 0.5, y + s * 0.91);
}
// fascia art, keyed by name; each returns the lit layer too (letters that glow at night)
const FASCIA = {
  hartleyChemist(g, W, H, lit) {
    board(g, W, H, '#40464d');
    rxLogo(g, W * 0.06, H * 0.12, H * 0.76);
    const big = `bold ${Math.round(H * 0.72)}px ${COND}`;
    for (const G of [g, lit]) {
      raised(G, 'HARTLEY', W * 0.56, H * 0.66, { font: big, face: '#e3261d', side: G === lit ? '#e3261d' : '#7c1510', depth: G === lit ? 0 : 6, shadow: G === lit ? 0 : 0.55 });
      raised(G, 'CHEMIST', W * 0.66, H * 0.94, { font: `bold ${Math.round(H * 0.27)}px ${COND}`, face: '#e3261d', side: G === lit ? '#e3261d' : '#7c1510', depth: G === lit ? 0 : 3, shadow: G === lit ? 0 : 0.5 });
    }
  },
  pharmacy(g, W, H, lit) {
    board(g, W, H, '#40464d');
    for (const G of [g, lit]) raised(G, 'PHARMACY', W * 0.5, H * 0.8, { font: fitFont(g, 'PHARMACY', W * 0.86, Math.round(H * 0.78), COND), face: '#e3261d', side: G === lit ? '#e3261d' : '#7c1510', depth: G === lit ? 0 : 6, shadow: G === lit ? 0 : 0.55 });
  },
  sliced(g, W, H, lit) {
    board(g, W, H, '#232527');
    const bw = W * 0.34, bh = H * 0.74, bx = W * 0.5 - bw / 2, by = H * 0.13;
    g.fillStyle = '#16181a'; g.fillRect(bx, by, bw, bh);
    g.strokeStyle = '#c9a54a'; g.lineWidth = H * 0.04; g.strokeRect(bx, by, bw, bh);
    g.lineWidth = H * 0.012; g.strokeRect(bx + H * 0.06, by + H * 0.06, bw - H * 0.12, bh - H * 0.12);
    for (const G of [g, lit]) raised(G, 'SLICED', W * 0.5, by + bh * 0.72, { font: fitFont(g, 'SLICED', bw * 0.8, Math.round(bh * 0.62), SERIF), face: '#d8b45a', side: G === lit ? '#d8b45a' : '#5a4718', depth: G === lit ? 0 : 3, shadow: G === lit ? 0 : 0.4 });
  },
  suzi(g, W, H, lit) {
    board(g, W, H, '#1c1d20');
    for (const G of [g, lit]) raised(G, 'SUZI CONFECTIONS', W * 0.5, H * 0.66, { font: fitFont(g, 'SUZI CONFECTIONS', W * 0.8, Math.round(H * 0.4), SERIF, 'normal'), face: '#f1efe8', side: G === lit ? '#f1efe8' : '#555', depth: G === lit ? 0 : 2, shadow: G === lit ? 0 : 0.3 });
  },
  // Appletree: gold applied serif capitals on a maroon painted board with a gold keyline
  appletreeDeli(g, W, H, lit) { appletreeBoard(g, W, H, lit, [['APPLETREE DELI', 0.5, 0.7, 0.62]]); },
  cateringAtm(g, W, H, lit) { appletreeBoard(g, W, H, lit, [['DELI  ➚  CATERING  ➚  ATM', 0.5, 0.68, 0.5]]); },
  appletreeMarket(g, W, H, lit) { appletreeBoard(g, W, H, lit, [['EST. 1973', 0.5, 0.33, 0.2], ['APPLETREE MARKET', 0.5, 0.84, 0.46]]); },
  grocery(g, W, H, lit) { appletreeBoard(g, W, H, lit, [['GROCERY', 0.2, 0.7, 0.55], ['FRESH PRODUCE • FLOWERS • HOT FOOD', 0.66, 0.66, 0.34]]); },
  dunkin(g, W, H, lit) {
    board(g, W, H, '#e9e8e4', { moulding: false });
    const f = `900 ${Math.round(H * 0.7)}px "Arial Rounded MT Bold", "Arial Black", ${SANS}`;
    for (const G of [g, lit]) raised(G, "DUNKIN'", W * 0.52, H * 0.8, { font: f, face: '#f26a21', side: G === lit ? '#f26a21' : '#a8410f', depth: G === lit ? 0 : 5, shadow: G === lit ? 0 : 0.35 });
  },
  blank(g, W, H) { board(g, W, H, '#d6d5d1', { moulding: false }); },
};
function appletreeBoard(g, W, H, lit, lines) {
  board(g, W, H, '#6a1d22', { moulding: false });
  g.strokeStyle = '#c8a45c'; g.lineWidth = H * 0.025; g.strokeRect(H * 0.06, H * 0.08, W - H * 0.12, H - H * 0.16);
  for (const [t, x, y, s] of lines) {
    for (const G of [g, lit]) raised(G, t, W * x, H * y, { font: fitFont(g, t, W * 0.86, Math.round(H * s), SERIF), face: '#dcb869', side: G === lit ? '#dcb869' : '#3c1010', depth: G === lit ? 0 : 3, shadow: G === lit ? 0 : 0.5 });
  }
}
// the cream "Appletree Market" pediment over the entrance (orange apple, green script-ish wordmark, maroon "Market")
function pedimentArt(W, H) {
  const c = cnv(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.beginPath(); g.moveTo(0, H); g.lineTo(W / 2, 0); g.lineTo(W, H); g.closePath();
  g.fillStyle = '#6a1d22'; g.fill();
  const b = H * 0.09;
  g.beginPath(); g.moveTo(b * 2.2, H - b * 0.8); g.lineTo(W / 2, b * 2.1); g.lineTo(W - b * 2.2, H - b * 0.8); g.closePath();
  g.fillStyle = '#f0e6c9'; g.fill();
  // apple
  const ax = W * 0.36, ay = H * 0.52, ar = H * 0.075;
  g.fillStyle = '#e8651f'; g.beginPath(); g.arc(ax - ar * 0.45, ay, ar, 0, Math.PI * 2); g.arc(ax + ar * 0.45, ay, ar, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6a8f2a'; g.beginPath(); g.ellipse(ax + ar * 0.6, ay - ar * 1.35, ar * 0.55, ar * 0.25, -0.6, 0, Math.PI * 2); g.fill();
  g.font = `italic bold ${Math.round(H * 0.24)}px "Trebuchet MS", ${SANS}`; g.textAlign = 'center';
  g.lineWidth = H * 0.018; g.strokeStyle = '#2f5f1c'; g.strokeText('Appletree', W * 0.54, H * 0.68);
  g.fillStyle = '#5bb13a'; g.fillText('Appletree', W * 0.54, H * 0.68);
  g.font = `italic bold ${Math.round(H * 0.14)}px "Trebuchet MS", ${SANS}`; g.fillStyle = '#6a1d22'; g.fillText('Market', W * 0.6, H * 0.86);
  return c;
}
// awning fabric: the slope (plain, a faint weave), the valance (text), the side flap (logo)
function awningArt(A, W, H, part) {
  const c = cnv(W, H), g = c.getContext('2d');
  g.fillStyle = A.color; g.fillRect(0, 0, W, H);
  // weave + a sheen gradient so the vinyl is not flat
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.05; g.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  const ink = A.color === '#c9a02e' || A.color === '#f26a21' ? '#ffffff' : '#ffffff';
  if (part === 'valance') {
    let x = W * 0.03;
    if (A.num) {                                             // the street number in a white rounded box
      const bw = H * 1.35, bh = H * 0.66, by = H * 0.17;
      g.fillStyle = '#ffffff'; roundRect(g, x, by, bw, bh, bh * 0.45); g.fill();
      g.fillStyle = A.color; g.font = `bold ${Math.round(bh * 0.7)}px ${COND}`; g.textAlign = 'center'; g.fillText(A.num, x + bw / 2, by + bh * 0.78);
      x += bw + H * 0.4;
    }
    if (A.script) {                                          // the salon: address, script name, phones
      g.fillStyle = ink; g.textAlign = 'left'; g.font = `bold ${Math.round(H * 0.42)}px ${COND}`; g.fillText(A.text, W * 0.03, H * 0.66);
      g.font = `${Math.round(H * 0.72)}px ${SCRIPT}`; g.textAlign = 'center'; g.fillText(A.script, W * 0.5, H * 0.74);
      g.font = `bold ${Math.round(H * 0.38)}px ${COND}`; g.textAlign = 'right'; g.fillText(A.phone, W * 0.97, H * 0.64);
    } else if (A.text) {
      g.fillStyle = ink; g.textAlign = 'left';
      g.font = fitFont(g, A.text, W - x - W * 0.03, Math.round(H * 0.5), COND);
      g.fillText(A.text, x, H * 0.68);
    }
  } else if (part === 'side' && A.side === 'hartley') {
    g.fillStyle = '#ffffff'; g.fillRect(W * 0.12, H * 0.5, W * 0.26, W * 0.26);
    g.fillStyle = A.color; g.font = `bold ${Math.round(W * 0.2)}px ${SERIF}`; g.textAlign = 'center'; g.fillText('℞', W * 0.25, H * 0.5 + W * 0.21);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(W * 0.11)}px ${COND}`; g.textAlign = 'left';
    g.fillText('HARTLEY', W * 0.44, H * 0.5 + W * 0.1); g.fillText('PHARMACY', W * 0.44, H * 0.5 + W * 0.22);
  } else if (part === 'slope' && A.barrel && A.text) {
    g.fillStyle = ink; g.textAlign = 'center'; g.font = fitFont(g, A.text, W * 0.8, Math.round(H * 0.34), `"Arial Black", ${SANS}`, '900'); g.fillText(A.text, W / 2, H * 0.78);
  }
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// shop interiors seen through the glass: a back wall of shelving under warm lights, drawn per trade (and the window
// dressing that sits on the glass line: pennant bunting, an OPEN sign, a poster)
function interiorArt(kind, W, H, seed, opts = {}) {
  const c = cnv(W, H), g = c.getContext('2d');
  const lit = cnv(W, H), gl = lit.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const wall = { pharmacy: '#b9b4aa', deli: '#a9a296', grocery: '#9c9584', pizza: '#b3a07f', candy: '#bda9ad', donut: '#bfae98', salon: '#b8b0a8', lobby: '#8f887c' }[kind] || '#aaa';
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  // ceiling light strip + falloff
  const lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, 'rgba(30,28,26,0.75)'); lg.addColorStop(0.12, 'rgba(255,246,225,0.35)'); lg.addColorStop(0.3, 'rgba(255,246,225,0.0)'); lg.addColorStop(1, 'rgba(25,20,15,0.45)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  const pal = {
    pharmacy: ['#b54a44', '#4f77a8', '#d8d6d0', '#c9a950', '#6f9a62', '#7a6394', '#c98f9f', '#39506f', '#e6e3dc', '#8a8f96'],
    deli: ['#a8403a', '#3f6aa0', '#c9a43e', '#4f8a4a', '#b8743a', '#5d4a7e', '#dcd8cf', '#5a3c26', '#2d2f33', '#8f2f2b'],
    grocery: ['#a2453b', '#c08a3a', '#5f8a3d', '#6e4a2c', '#c9b24c', '#46663a', '#d9d4c7', '#9a5a3a'],
    candy: ['#c8698f', '#cdb14f', '#6fa7c4', '#8a73b8', '#c9804f', '#76b06f', '#e2dcd6', '#b24d63'],
    donut: ['#f26a21', '#e3448c', '#8a4b2a', '#f5d7a6', '#ffffff', '#c93a6a', '#6b3a1f', '#ffb347'],
    pizza: ['#c73a22', '#e7b04b', '#f1e0b5', '#3b2a1f', '#2e7d32', '#ffffff', '#8d2b1b', '#d98c32'],
    salon: ['#c9b8ae', '#f2ece6', '#1d1d1f', '#b08e79', '#e6d2c3', '#8f7a6e', '#ffffff', '#4a3b33'],
    lobby: ['#8c8478', '#b7ad9d', '#6d655b', '#a39987', '#d8d0c2', '#5d564d', '#998f80', '#7b7266'],
  }[kind] || ['#999'];
  if (kind === 'lobby' || kind === 'salon') {
    // mirrors / panels and a counter
    for (let i = 0; i < 4; i++) { g.fillStyle = pal[(i * 3) % pal.length]; g.fillRect(W * (0.06 + i * 0.235), H * 0.18, W * 0.17, H * 0.42); }
    g.fillStyle = pal[2]; g.fillRect(0, H * 0.72, W, H * 0.28);
  } else {
    // shelving: rows of product faces
    const rows = kind === 'pizza' ? 3 : 6;
    for (let r = 0; r < rows; r++) {
      const y0 = H * (0.1 + r * (0.7 / rows)), rh = H * (0.7 / rows) * 0.78;
      g.fillStyle = 'rgba(80,70,60,0.55)'; g.fillRect(0, y0 + rh, W, H * 0.012);
      let x = 0;
      while (x < W) {
        const w = W * (0.006 + rnd() * 0.014), h = rh * (0.35 + rnd() * 0.55);
        if (rnd() < 0.12) { x += w * 1.5; continue; }                      // a gap on the shelf
        g.fillStyle = pal[Math.floor(rnd() * pal.length)];
        g.globalAlpha = 0.75 + rnd() * 0.25;
        g.fillRect(x, y0 + rh - h, w - 1, h);
        g.globalAlpha = 1;
        x += w;
      }
      g.fillStyle = 'rgba(235,232,225,0.55)'; g.fillRect(0, y0 + rh - H * 0.008, W, H * 0.008);   // price-strip edge
    }
    if (kind === 'grocery' || kind === 'deli') {             // produce crates / a drinks fridge at the bottom
      for (let i = 0; i < 8; i++) {
        const x = W * (i / 8), w = W / 8 - 6;
        g.fillStyle = '#6b4a2a'; g.fillRect(x + 3, H * 0.8, w, H * 0.2);
        for (let k = 0; k < 14; k++) { g.fillStyle = pal[(i + k) % 4]; g.beginPath(); g.arc(x + 8 + rnd() * (w - 16), H * (0.8 + rnd() * 0.06), H * 0.018, 0, Math.PI * 2); g.fill(); }
      }
    } else { g.fillStyle = 'rgba(60,50,40,0.8)'; g.fillRect(0, H * 0.8, W, H * 0.2); }
  }
  // depth: the room falls away into shadow behind the front shelves
  g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, W, H);
  // lit layer: the interior glows (fluorescent shop light) — the whole wall, dimmer toward the floor
  gl.drawImage(c, 0, 0); gl.globalCompositeOperation = 'multiply';
  const dg = gl.createLinearGradient(0, 0, 0, H); dg.addColorStop(0, '#ffffff'); dg.addColorStop(1, '#6a6a6a');
  gl.fillStyle = dg; gl.fillRect(0, 0, W, H); gl.globalCompositeOperation = 'source-over';
  // window dressing (on the glass line, drawn over both layers)
  for (const G of [g, gl]) {
    if (opts.bunting) {
      const cols = ['#f2b21e', '#e8641c', '#8bc34a', '#e23b3b', '#f7d03b', '#f28c28'];
      for (const row of [0.06, 0.25]) {
        G.strokeStyle = '#333'; G.lineWidth = 2; G.beginPath(); G.moveTo(0, H * row); G.quadraticCurveTo(W / 2, H * (row + 0.05), W, H * row); G.stroke();
        for (let i = 0; i < 7; i++) {
          const x = W * (0.07 + i * 0.143), y = H * (row + 0.05 * (1 - Math.abs(i - 3) / 3.5));
          G.fillStyle = cols[(i + (row > 0.1 ? 3 : 0)) % cols.length];
          G.beginPath(); G.moveTo(x - W * 0.058, y); G.lineTo(x + W * 0.058, y); G.lineTo(x, y + H * 0.17); G.closePath(); G.fill();
          G.fillStyle = 'rgba(255,255,255,0.35)'; G.fillRect(x - W * 0.02, y + H * 0.03, W * 0.04, H * 0.05);   // the print on it
        }
      }
    }
    if (opts.open) {                                         // the red-and-blue OPEN neon
      const ox = W * 0.72, oy = H * 0.3, ow = W * 0.22, oh = H * 0.14;
      G.lineWidth = H * 0.012; G.strokeStyle = '#3a6dff'; roundRect(G, ox, oy, ow, oh, oh / 2); G.stroke();
      G.fillStyle = '#ff2b2b'; G.font = `bold ${Math.round(oh * 0.62)}px ${SANS}`; G.textAlign = 'center'; G.fillText('OPEN', ox + ow / 2, oy + oh * 0.72);
    }
    if (opts.poster === 'produce') {
      G.fillStyle = '#f4f1e8'; G.fillRect(W * 0.08, H * 0.18, W * 0.3, H * 0.62);
      G.fillStyle = '#c0302a'; G.font = `bold ${Math.round(H * 0.035)}px ${SANS}`; G.textAlign = 'left';
      ['FRESH PRODUCE & MEAT', 'TOSSED SALAD BAR', 'IMPORTED & DOMESTIC', 'COLD CUTS • HOT FOOD'].forEach((t, i) => G.fillText(t, W * 0.1, H * (0.66 + i * 0.045)));
      for (let i = 0; i < 12; i++) { G.fillStyle = ['#5a9a2e', '#c93a22', '#e9b13a', '#7a3d1a'][i % 4]; G.beginPath(); G.arc(W * (0.12 + (i % 4) * 0.06), H * (0.26 + Math.floor(i / 4) * 0.1), H * 0.03, 0, Math.PI * 2); G.fill(); }
    }
    if (kind === 'pizza') {
      G.fillStyle = '#ff3b2f'; G.font = `bold ${Math.round(H * 0.09)}px ${SANS}`; G.textAlign = 'center'; G.fillText('PIZZA', W * 0.5, H * 0.62);
    }
    if (kind === 'donut') {
      G.fillStyle = '#ffffff'; G.beginPath(); G.arc(W * 0.7, H * 0.3, H * 0.12, 0, Math.PI * 2); G.fill();
      G.fillStyle = '#f26a21'; G.font = `900 ${Math.round(H * 0.11)}px "Arial Black", ${SANS}`; G.textAlign = 'center'; G.fillText('D', W * 0.675, H * 0.34);
      G.fillStyle = '#e3448c'; G.fillText('D', W * 0.73, H * 0.34);
    }
  }
  return { map: c, lit };
}

// ---------------------------------------------------------------- geometry
class Kit {
  constructor() { this.parts = new Map(); }
  add(mat, geo) { let a = this.parts.get(mat); if (!a) this.parts.set(mat, (a = [])); a.push(geo); }
  // box by min/max in the front's local frame (x along, y up, z out)
  box(mat, x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(Math.max(0.005, x1 - x0), Math.max(0.005, y1 - y0), Math.max(0.005, z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(mat, g);
  }
  // a quad facing +z (or any orientation through `rot`)
  plane(mat, x0, x1, y0, y1, z, flip = false) {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (flip) g.rotateY(Math.PI);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    this.add(mat, g);
  }
  planeUV(mat, x0, x1, y0, y1, z, u0, u1, v0, v1) {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    this.add(mat, g);
  }
  quad(mat, a, b, c, d) {       // four corners, CCW seen from the front; uv (0,0) (1,0) (1,1) (0,1)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    g.computeVertexNormals();
    this.add(mat, g);
  }
  build(name) {
    const grp = new THREE.Group();
    grp.name = name;
    for (const [mat, geos] of this.parts) {
      const norm = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of norm) { if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); }
      const merged = mergeGeometries(norm, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      // perception: a storefront is part of its building (a merged cornice cap is flat, and the shape guess reads
      // flat things as sidewalk)
      m.userData.segClass = 'building';
      m.castShadow = !mat.transparent; m.receiveShadow = true;
      if (mat.userData.lit) m.onBeforeRender = () => { const [d, n] = mat.userData.lit; mat.emissiveIntensity = d + (n - d) * ENV.night.value; };
      grp.add(m);
    }
    return grp;
  }
}

// one shop: bays of windows and doors between pilasters, bulkhead, transom, fascia, awning, lamps
function buildShop(K, S, F, sys, sgn, seed) {
  const H = sys.height;
  const frame = paint(S.frame ?? sys.color, 0.6);
  const dark = paint(0x1d2024, 0.5);
  const x0 = S.from, x1 = S.to;
  const X = (u) => sgn * u;                       // along-frontage metres -> local x
  const PIL = 0.36, PZ = 0.3;                     // pilaster width, projection
  const bulk = sys.bulk ?? 0.72, head = sys.head ?? 3.08, fasc0 = sys.fascia ? sys.fascia[0] : 3.3, fasc1 = sys.fascia ? sys.fascia[1] : H - 0.28;
  // pilasters at both ends (a shared one between neighbours is drawn twice, harmlessly coincident)
  for (const u of [x0 + PIL / 2, x1 - PIL / 2]) {
    K.box(frame, X(u) - PIL / 2, X(u) + PIL / 2, 0, fasc1 + 0.04, 0, PZ);
    K.box(frame, X(u) - PIL / 2 - 0.03, X(u) + PIL / 2 + 0.03, 0, 0.16, 0, PZ + 0.03);         // base block
    K.box(dark, X(u) - PIL / 2 + 0.07, X(u) + PIL / 2 - 0.07, 0.5, fasc0 - 0.3, PZ, PZ + 0.012);   // recessed panel line
  }
  const inner0 = x0 + PIL, inner1 = x1 - PIL, iw = inner1 - inner0;
  const Lx0 = Math.min(X(inner0), X(inner1)), Lx1 = Math.max(X(inner0), X(inner1));
  // bays
  const kinds = S.bays || ['win'];
  const weights = kinds.map((k) => (k === 'door' ? 1.15 : k === 'blank' ? 1.2 : 2.0));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const interior = interiorArt(S.interior || 'deli', 1024, 640, seed, { bunting: S.bunting, open: S.open, poster: S.poster });
  const intMat = texMat(interior.map, { rough: 0.9, lit: interior.lit, litDay: 0.05, litNight: 1.1 });
  let u = inner0;
  kinds.forEach((k, i) => {
    const w = (iw * weights[i]) / wsum, a = u, b = u + w;
    u = b;
    const MUL = 0.09;
    // mullions between bays and at the ends
    K.box(frame, X(a) - MUL / 2, X(a) + MUL / 2, 0, head + 0.05, 0.02, 0.2);
    if (i === kinds.length - 1) K.box(frame, X(b) - MUL / 2, X(b) + MUL / 2, 0, head + 0.05, 0.02, 0.2);
    const ga = a + MUL / 2, gb = b - MUL / 2;
    if (k === 'blank') { K.box(frame, Math.min(X(ga), X(gb)), Math.max(X(ga), X(gb)), 0, head, 0.02, 0.16); return; }
    const y0 = k === 'door' ? 0.04 : bulk;
    if (k !== 'door') {
      // bulkhead with a raised panel
      K.box(frame, Math.min(X(ga), X(gb)), Math.max(X(ga), X(gb)), 0.02, bulk, 0.02, 0.18);
      K.box(frame, Math.min(X(ga), X(gb)) + 0.12, Math.max(X(ga), X(gb)) - 0.12, 0.14, bulk - 0.14, 0.18, 0.21);
      K.box(frame, Math.min(X(ga), X(gb)) - 0.02, Math.max(X(ga), X(gb)) + 0.02, bulk - 0.03, bulk + 0.03, 0.02, 0.22);   // sill
    }
    // the interior backdrop (at the wall) and the glass (on the frame line)
    const lx0 = Math.min(X(ga), X(gb)), lx1 = Math.max(X(ga), X(gb));
    // each opening shows its own slice of the shop's interior canvas (one material per shop)
    K.planeUV(intMat, lx0, lx1, y0, head, 0.012, (lx0 - Lx0) / (Lx1 - Lx0), (lx1 - Lx0) / (Lx1 - Lx0), y0 / head, 1);
    K.plane(glassMat(), lx0, lx1, y0, head, 0.12);
    if (k === 'door') {
      // door leaf frame (two leaves), push bar
      K.box(dark, lx0, lx0 + 0.07, y0, head - 0.55, 0.1, 0.16); K.box(dark, lx1 - 0.07, lx1, y0, head - 0.55, 0.1, 0.16);
      K.box(dark, (lx0 + lx1) / 2 - 0.035, (lx0 + lx1) / 2 + 0.035, y0, head - 0.55, 0.1, 0.16);
      K.box(dark, lx0, lx1, head - 0.6, head - 0.52, 0.1, 0.16);             // transom bar over the door
      K.box(dark, lx0, lx1, y0, y0 + 0.2, 0.1, 0.16);                        // kick plate
      K.box(paint(0xb8bcc2, 0.3, 0.8), lx0 + 0.12, (lx0 + lx1) / 2 - 0.12, 1.02, 1.06, 0.16, 0.2);
    } else {
      K.box(frame, lx0, lx1, head - 0.62, head - 0.55, 0.1, 0.16);          // transom bar
    }
  });
  // head / transom band over the bays, fascia board, cornice cap
  K.box(frame, Math.min(X(inner0), X(inner1)), Math.max(X(inner0), X(inner1)), head, fasc0, 0.02, 0.2);
  if (S.fascia && FASCIA[S.fascia.draw]) {
    const fw = x1 - x0 - 2 * PIL, fh = fasc1 - fasc0;
    const cw = Math.min(4096, Math.round(fw * 300)), ch = Math.round((cw * fh) / fw);
    const c = cnv(cw, ch), lit = cnv(cw, ch);
    FASCIA[S.fascia.draw](c.getContext('2d'), cw, ch, lit.getContext('2d'));
    const fm = texMat(c, { rough: 0.5, lit, litDay: 0.0, litNight: 1.4 });
    K.box(frame, Math.min(X(inner0), X(inner1)), Math.max(X(inner0), X(inner1)), fasc0, fasc1, 0.02, 0.22);
    // the board face, flipped for fronts that run right-to-left seen from the street
    K.plane(fm, Math.min(X(inner0), X(inner1)), Math.max(X(inner0), X(inner1)), fasc0 + 0.02, fasc1 - 0.02, 0.222);
  }
  // gooseneck lamps over the fascia
  const nl = S.lamps || 0;
  for (let i = 0; i < nl; i++) {
    const lu = x0 + ((i + 0.5) / nl) * (x1 - x0), lx = X(lu);
    const arm = paint(0x16181a, 0.45, 0.4);
    K.box(arm, lx - 0.06, lx + 0.06, fasc1 + 0.35, fasc1 + 0.5, 0, 0.06);                        // wall plate
    K.box(arm, lx - 0.018, lx + 0.018, fasc1 + 0.4, fasc1 + 0.44, 0.04, 0.5);                    // arm out
    K.box(arm, lx - 0.018, lx + 0.018, fasc1 + 0.12, fasc1 + 0.44, 0.47, 0.51);                  // drop
    const shade = new THREE.CylinderGeometry(0.05, 0.17, 0.16, 12, 1, true); shade.translate(lx, fasc1 + 0.06, 0.52);
    K.add(paint(0x16181a, 0.4, 0.5), shade);
    const bulb = new THREE.CircleGeometry(0.12, 12); bulb.rotateX(Math.PI / 2); bulb.translate(lx, fasc1 - 0.015, 0.52);
    K.add(lampMat(), bulb);
  }
  if (S.awning) buildAwning(K, S, sgn, X(inner0), X(inner1), fasc0);
  if (S.pediment) {
    const pw = Math.min(4.6, x1 - x0 - 0.4), ph = 1.62, cx = X((x0 + x1) / 2);
    const pm = texMat(pedimentArt(1024, 364), { rough: 0.55 });
    pm.alphaTest = 0.5;
    K.plane(pm, cx - pw / 2, cx + pw / 2, fasc1 - 0.05, fasc1 - 0.05 + ph, 0.26);
    K.box(paint(0x4a1418, 0.6), cx - pw / 2, cx + pw / 2, fasc1 - 0.1, fasc1 - 0.02, 0.02, 0.3);   // its ledge
  }
  if (S.planters) {
    const pot = paint(0xb4744c, 0.8), green = paint(0x2f5a2a, 0.9);
    for (let i = 0; i < S.planters; i++) {
      const pu = x0 + ((i + 0.5) / S.planters) * (x1 - x0), px = X(pu);
      const pg = new THREE.CylinderGeometry(0.3, 0.22, 0.52, 14); pg.translate(px, 0.26, 0.62); K.add(pot, pg);
      const tg = new THREE.ConeGeometry(0.3, 1.0, 9); tg.translate(px, 1.0, 0.62); K.add(green, tg);
    }
  }
}
let _lampMat = null;
function lampMat() {
  if (!_lampMat) {
    _lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 0.2, roughness: 0.4 });
    _lampMat.userData.lit = [0.2, 2.2];
  }
  return _lampMat;
}
function buildAwning(K, S, sgn, lx0, lx1, top) {
  const A = S.awning;
  const xa = Math.min(lx0, lx1), xb = Math.max(lx0, lx1);
  const w = xb - xa, proj = A.small ? 0.8 : 1.1, drop = A.small ? 0.22 : 0.3;
  const yTop = top - 0.02, yLow = yTop - (A.barrel ? 0.9 : A.small ? 0.62 : 0.86);
  const slope = texMat(awningArt(A, 1024, 256, 'slope'), { rough: 0.85, ds: true });
  const val = texMat(awningArt(A, 2048, 160, 'valance'), { rough: 0.85, ds: true });
  const side = texMat(awningArt(A, 512, 512, 'side'), { rough: 0.85, ds: true });
  let ax0 = xa + 0.05, ax1 = xb - 0.05;
  if (A.span) { ax0 = xa + A.span[0] * w; ax1 = xa + A.span[1] * w; }
  if (A.barrel) {
    // a quarter-barrel: a curved hood over the door
    const segs = 10, R = proj;
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI / 2, t1 = ((i + 1) / segs) * Math.PI / 2;
      const p = (t) => [Math.sin(t) * R, yLow + Math.cos(t) * (yTop - yLow)];
      const [z0, y0] = p(t0), [z1, y1] = p(t1);
      K.quad(slope, [ax0, y1, z1 + 0.02], [ax1, y1, z1 + 0.02], [ax1, y0, z0 + 0.02], [ax0, y0, z0 + 0.02]);
    }
    return;
  }
  // slope (wall -> front edge), valance (front drop), side flaps
  K.quad(slope, [ax0, yLow, proj], [ax1, yLow, proj], [ax1, yTop, 0.03], [ax0, yTop, 0.03]);
  K.quad(val, [ax0, yLow - drop, proj + 0.005], [ax1, yLow - drop, proj + 0.005], [ax1, yLow, proj + 0.005], [ax0, yLow, proj + 0.005]);
  for (const xs of [ax0, ax1]) {
    const flip = xs === ax0;
    const pts = [[xs, yTop, 0.03], [xs, yLow, proj], [xs, yLow - drop, proj], [xs, yLow - drop, 0.03]];
    const g = new THREE.BufferGeometry();
    const P = [...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]];
    const UV = [0.1, 1, 0.9, 0.62, 0.9, 0.3, 0.1, 1, 0.9, 0.3, 0.1, 0.3];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(flip ? UV.map((v, i) => (i % 2 ? v : 1 - v)) : UV, 2));
    g.computeVertexNormals();
    K.add(side, g);
  }
  // the frame: a front bar and two struts
  const pipe = paint(0x2b2e32, 0.5, 0.6);
  K.box(pipe, ax0, ax1, yLow - 0.02, yLow + 0.02, proj - 0.02, proj + 0.02);
}

// the two-storey base in front of the set-back tower (1233-1235): stone band, glazed floor, railing terrace
function buildBase(K, F, sgn) {
  const B = F.base, X = (u) => sgn * u;
  const a = Math.min(X(B.from), X(B.to)), b = Math.max(X(B.from), X(B.to));
  const stone = paint(B.color, 0.8);
  K.box(stone, a, b, 4.2, 5.1, -B.depth, 0.04);                  // the stone band over the shops
  K.box(paint(0x9fa3a6, 0.4, 0.2), a, b, 5.1, 7.0, -B.depth, -1.6);  // the glazed second floor, set back behind a terrace
  for (let x = a + 0.8; x < b; x += 3.6) K.box(stone, x - 0.22, x + 0.22, 5.1, 7.0, -1.8, -1.5);   // its piers
  K.box(stone, a, b, 7.0, B.height, -B.depth, -1.4);             // parapet over it
  // terrace railing on the band
  const rail = paint(0xd9dad8, 0.4, 0.5);
  K.box(rail, a, b, 6.05, 6.1, -0.1, -0.05);
  for (let x = a + 0.15; x < b; x += 0.18) K.box(rail, x - 0.012, x + 0.012, 5.1, 6.05, -0.09, -0.065);
  K.box(stone, a, b, 0, 4.2, -B.depth, -0.35);                   // back wall behind the shops
}

// ---------------------------------------------------------------- runtime
// init({ scene, streamer, instancer }): each front is built when the tile under its origin has loaded (for the
// ground height) and removed with it.
export function initNamedShops({ scene, streamer, instancer }) {
  const TILE = 512;
  const built = new Map();   // front key -> { group, claims }
  const tileOf = (x, z) => `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
  function build(F) {
    const a = dirOf(F.along), n = dirOf(F.faces);
    const theta = Math.atan2(n[0], n[1]);
    const lx = [Math.cos(theta), -Math.sin(theta)];
    const sgn = Math.sign(a[0] * lx[0] + a[1] * lx[1]) || 1;
    // ground: the pavement just in front of the facade, sampled along the run
    let gy = null;
    for (const t of [0.1, 0.5, 0.9]) {
      const px = F.origin[0] + a[0] * F.length * t + n[0] * 1.5, pz = F.origin[1] + a[1] * F.length * t + n[1] * 1.5;
      const y = streamer.surfaceAt ? streamer.surfaceAt(px, pz) : null;
      if (y !== null && isFinite(y)) gy = gy === null ? y : Math.min(gy, y);
    }
    if (gy === null) return null;
    const K = new Kit();
    let seed = 1;
    for (const ch of F.key) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    if (F.base) buildBase(K, F, sgn);
    if (F.infill) {
      const [f0, f1, dep] = F.infill, X = (u) => sgn * u;
      K.box(paint(0x8f8578, 0.85), Math.min(X(f0), X(f1)), Math.max(X(f0), X(f1)), 0, F.system.height + 0.35, -dep, 0.0);
    }
    const sys = F.system || { color: 0x444444, height: 4.5 };
    for (const S of F.shops) buildShop(K, S, F, sys, sgn, seed++);
    // cornice cap over the whole shopfront run
    if (F.shops.length && sys.cornice) {
      const X = (u) => sgn * u, u0 = F.shops[0].from, u1 = F.shops[F.shops.length - 1].to;
      K.box(paint(sys.cornice, 0.6), Math.min(X(u0), X(u1)) - 0.05, Math.max(X(u0), X(u1)) + 0.05, sys.height - 0.28, sys.height, 0, 0.34);
      K.box(paint(sys.cornice, 0.6), Math.min(X(u0), X(u1)) - 0.08, Math.max(X(u0), X(u1)) + 0.08, sys.height, sys.height + 0.06, 0, 0.4);
    }
    const group = K.build(`namedShops:${F.key}`);
    group.position.set(F.origin[0], gy, F.origin[1]);
    group.rotation.y = theta;
    group.updateMatrixWorld(true);
    scene.add(group);
    // sidewalk sheds (the kit's instanced shed, stretched along the run and raised clear of the signs)
    const claims = [];
    for (const sh of F.sheds || []) {
      if (!instancer || !instancer.pools.has('scaffold')) break;
      const L = sh.to - sh.from, mid = (sh.from + sh.to) / 2, out = 1.62 * 0.92 + 0.42;
      const x = F.origin[0] + a[0] * mid + n[0] * out, z = F.origin[1] + a[1] * mid + n[1] * out;
      const rot = Math.atan2(n[0], n[1]);
      for (const pool of ['scaffold', 'scaffoldGlow']) {
        if (!instancer.pools.has(pool)) continue;
        const id = instancer.claim(pool, x, gy, z, rot, L / 10, sh.sy || 1, 0.92);
        if (id >= 0) claims.push([pool, id]);
      }
      for (const u of [].concat(sh.sign ?? [])) addShedSign(group, u, out, sgn, sh.sy || 1);
    }
    return { group, claims };
  }
  function addShedSign(group, u, out, sgn, sy) {
    // SPRING SCAFFOLDING board on the shed parapet (curb side), in the group's local frame
    const c = cnv(512, 512), g = c.getContext('2d');
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#2f9a3a'; g.font = `900 108px "Arial Black", ${SANS}`; g.textAlign = 'center'; g.fillText('SPRING', 256, 130);
    g.fillStyle = '#2a2a2a'; g.font = `bold 40px ${SANS}`; g.fillText('SCAFFOLDING', 256, 185);
    g.fillStyle = '#f2b233'; g.beginPath(); g.arc(256, 330, 110, Math.PI, 0); g.fill();
    g.fillStyle = '#222'; for (let i = 0; i < 49; i++) if ((i * 7 + (i >> 2)) % 3) g.fillRect(206 + (i % 7) * 14, 240 + Math.floor(i / 7) * 14, 12, 12);
    g.fillStyle = '#e6e6e2'; g.fillRect(0, 360, 512, 152);
    g.fillStyle = '#333'; g.font = `bold 30px ${SANS}`; g.fillText('REACHING NEW HEIGHTS', 256, 440);
    const m = texMat(c, { rough: 0.6 });
    const zc = out + 1.5 * 0.92 + 0.03;                      // the parapet's outer face
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), m);
    p.position.set(sgn * u, 2.7 * sy + 0.62 * sy, zc);
    group.add(p);
  }
  function remove(k) {
    const b = built.get(k);
    if (!b) return;
    scene.remove(b.group);
    b.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const [pool, id] of b.claims) instancer?.release(pool, id);
    built.delete(k);
  }
  // a front is built once the tile under its corner is in AND the pavement in front of it answers (a neighbouring
  // tile can arrive later, so every tile arrival retries the ones still pending)
  streamer.onTile(() => {
    for (const F of NAMED_FRONTS) {
      if (built.has(F.key) || (!F.shops.length && !(F.sheds || []).length)) continue;
      const t = streamer.tiles && streamer.tiles.get(tileOf(F.origin[0], F.origin[1]));
      if (!t || t.state !== 'ready') continue;
      try { const b = build(F); if (b) built.set(F.key, b); } catch (e) { console.warn('[namedShops]', F.key, e); }
    }
  }, (key) => {
    for (const F of NAMED_FRONTS) if (tileOf(F.origin[0], F.origin[1]) === key) remove(F.key);
  });
  return { built, fronts: NAMED_FRONTS };
}
