// USPSLLV: the Grumman Long Life Vehicle, the Postal Service's right-hand-drive aluminium route truck (1987-1994 build,
// still the most common mail truck on NYC streets). Length 175.5 in (4.458 m), width 75 in (1.905 m), height 85 in
// (2.159 m), wheelbase 100.5 in (2.553 m): en.wikipedia.org/wiki/Grumman_LLV (infobox). Overhangs, beltline and window
// heights read off refs/ar34veh/citytrucks/llv/ (ATTRIBUTION.md; eyeballed, not yet rectified).
import { Parts, wheel, ROLE, liveryLayout, liveryPx, rasterLivery } from './lib.mjs';
import { eagle } from './uspsMark.mjs';

export const SPEC = { L: 4.458, W: 1.905, H: 2.159, zF: 2.229 };
const W2 = 0.9525, ZF = 2.229, ZR = -2.229;
const FAX = 1.45, RAX = FAX - 2.553, TR = 0.345, TW = 0.2;
const WS = 1.24, BELT = 1.22, WTOP = 1.9, ROOF = 2.159;

export function build(q) {
  const P = new Parts(q);
  const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const nA = q === 0 ? 8 : q === 1 ? 3 : 2;
  const sort = (a, b) => [a, b].sort((u, v) => u - v);
  // lower body: one profile from the bumper line to the rear, both wheel arches cut, the hood sloping to the windshield
  const lower = [[ZR + 0.12, 0.38], [RAX - 0.42, 0.38], ...arc(RAX, TR, 0.42, Math.PI, 0, nA * 2).slice(1, -1), [RAX + 0.42, 0.38],
    [FAX - 0.42, 0.38], ...arc(FAX, TR, 0.42, Math.PI, 0, nA * 2).slice(1, -1), [FAX + 0.42, 0.38], [ZF - 0.14, 0.4], [ZF - 0.12, 0.92], [ZF - 0.2, 0.99],
    [WS + 0.05, 1.12], [WS, BELT], [ZR + 0.12, BELT]];
  P.profile('paint', lower, -W2, W2, 0.05);
  // roof and the cab's pillars; the cargo box walls behind the doors are solid paint
  P.box('paint', [-W2, W2], [WTOP, ROOF], [ZR + 0.12, WS + 0.02], 0.07);
  P.box('paint', [-W2, W2], [BELT, WTOP + 0.01], [ZR + 0.12, 0.3], 0.03);
  P.both((s) => {
    P.box('paint', sort(s * (W2 - 0.06), s * W2), [BELT, WTOP + 0.01], [WS - 0.08, WS + 0.02], 0.02);
    P.box('paint', sort(s * (W2 - 0.06), s * W2), [BELT, WTOP + 0.01], [0.28, 0.36], 0.015);
    P.box('glass', sort(s * (W2 - 0.022), s * (W2 - 0.018)), [BELT + 0.04, WTOP - 0.03], [0.37, WS - 0.09], 0);
    if (q === 0) P.box('detail', sort(s * (W2 - 0.024), s * (W2 - 0.006)), [BELT + 0.02, BELT + 0.045], [0.37, WS - 0.09], 0.004, { sw: 'blackRubberTrim' });
  });
  // windshield (flat, near vertical) with its rubber surround and a wiper
  P.box('glass', [-W2 + 0.07, W2 - 0.07], [BELT + 0.02, WTOP - 0.03], [WS - 0.004, WS + 0.002], 0);
  if (q === 0) {
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [BELT, BELT + 0.03], [WS - 0.01, WS + 0.015], 0.005, { sw: 'blackRubberTrim' });
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [WTOP - 0.04, WTOP - 0.01], [WS - 0.01, WS + 0.015], 0.005, { sw: 'blackRubberTrim' });
    P.box('detail', [-0.6, 0.15], [BELT + 0.05, BELT + 0.07], [WS + 0.004, WS + 0.02], 0.004, { sw: 'wiper' });
  }
  // interior: dash, the right-hand wheel and seat, the letter tray on the left
  if (q < 2) {
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [0.95, BELT + 0.08], [WS - 0.35, WS - 0.02], 0.04, { sw: 'dash' });
    P.cyl('detail', [-0.45, 1.28, WS - 0.42], 0.19, 0.035, 'y', { sw: 'satinBlack' });
    P.box('detail', [-0.75, -0.25], [0.55, 1.5], [0.32, 0.5], 0.05, { sw: 'vinylGrey' });
    P.box('detail', [0.2, 0.8], [1.0, 1.32], [0.4, 0.95], 0.02, { sw: 'cargoAlu' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [WTOP - 0.005, WTOP], [0.3, WS - 0.05], 0, { sw: 'interiorWall' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [BELT - 0.005, BELT], [0.3, WS - 0.05], 0, { sw: 'floor' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [BELT, WTOP], [0.3, 0.32], 0, { sw: 'cargoAlu' });
  }
  // front: grille (horizontal bars), square lamps, amber signals below, black bumper
  P.box('detail', [-0.4, 0.4], [0.58, 0.88], [ZF - 0.135, ZF - 0.11], 0.02, { sw: 'satinBlack' });
  if (q < 2) for (let k = 0; k < 4; k++) P.box('detail', [-0.38, 0.38], [0.61 + k * 0.07, 0.635 + k * 0.07], [ZF - 0.115, ZF - 0.1], 0.005, { sw: 'cabWhite' });
  P.both((s) => {
    P.box('lampInner', sort(s * 0.48, s * 0.74), [0.62, 0.86], [ZF - 0.14, ZF - 0.115], 0.02);
    P.box('lamp', sort(s * 0.5, s * 0.72), [0.64, 0.84], [ZF - 0.12, ZF - 0.105], 0.02, { lamp: ROLE.head });
    P.box('lens', sort(s * 0.49, s * 0.73), [0.63, 0.85], [ZF - 0.105, ZF - 0.098], 0.02);
    P.box('lamp', sort(s * 0.55, s * 0.72), [0.52, 0.58], [ZF - 0.13, ZF - 0.105], 0.01, { lamp: s > 0 ? ROLE.fbl : ROLE.fbr });
    // mirrors: the big flat mirror on a tube frame each side; the convex one on a stalk at the front left
    P.box('detail', sort(s * W2, s * (W2 + 0.2)), [1.55, 1.57], [WS - 0.06, WS - 0.04], 0.006, { sw: 'satinBlack' });
    P.box('detail', sort(s * (W2 + 0.16), s * (W2 + 0.24)), [1.4, 1.72], [WS - 0.09, WS - 0.02], 0.02, { sw: 'satinBlack' });
    P.box('detail', sort(s * (W2 + 0.165), s * (W2 + 0.235)), [1.42, 1.7], [WS - 0.1, WS - 0.09], 0.005, { sw: 'mirror' });
  });
  P.cyl('detail', [W2 - 0.08, 1.4, ZF - 0.3], 0.012, 0.8, 'y', { sw: 'satinBlack', seg: 6 });
  P.cyl('detail', [W2 - 0.08, 1.82, ZF - 0.27], 0.09, 0.05, 'z', { sw: 'satinBlack', r2: 0.07 });
  P.cyl('detail', [W2 - 0.08, 1.82, ZF - 0.245], 0.08, 0.01, 'z', { sw: 'mirror' });
  P.box('detail', [-W2 - 0.01, W2 + 0.01], [0.26, 0.5], [ZF - 0.14, ZF], 0.04, { sw: 'satinBlack' });
  // rear: roll-up door frame, corner lamp columns, step bumper
  // rear: the roll-up door in its frame, a round lamp column at each corner (tail, signal, reverse from the top), as
  // the LLV on 125th Street shows them
  P.box('detail', [-0.75, 0.75], [0.5, 2.02], [ZR + 0.105, ZR + 0.12], 0, { sw: 'darkGrey' });
  P.box('paint', [-0.71, 0.71], [0.53, 1.99], [ZR + 0.1, ZR + 0.11], 0.005);
  if (q === 0) P.box('detail', [-0.06, 0.06], [0.62, 0.66], [ZR + 0.08, ZR + 0.1], 0.01, { sw: 'chrome' });
  P.both((s) => {
    P.box('lampInner', sort(s * 0.77, s * 0.9), [1.07, 1.48], [ZR + 0.095, ZR + 0.12], 0.02);
    for (const [y, role] of [[1.4, ROLE.tail], [1.27, s > 0 ? ROLE.rbl : ROLE.rbr], [1.15, ROLE.rev]]) P.cyl('lamp', [s * 0.835, y, ZR + 0.09], 0.05, 0.02, 'z', { lamp: role });
    P.box('lens', sort(s * 0.775, s * 0.895), [1.08, 1.47], [ZR + 0.074, ZR + 0.08], 0.01);
  });
  P.box('detail', [-W2 - 0.01, W2 + 0.01], [0.26, 0.5], [ZR, ZR + 0.16], 0.03, { sw: 'satinBlack' });
  if (q < 2) P.box('detail', [-0.7, 0.7], [0.47, 0.5], [ZR - 0.02, ZR + 0.12], 0.01, { sw: 'galv' });
  // wells and underbody
  P.both((s) => {
    for (const z of [FAX, RAX]) P.latheX('detail', [s * 0.72, TR, z], [[0.41, 0.24], [0.41, -0.24]], { sw: 'grime', phiStart: Math.PI, phiLength: Math.PI });
    for (const z of [FAX, RAX]) P.box('detail', sort(s * 0.46, s * 0.48), [TR, 0.76], [z - 0.42, z + 0.42], 0, { sw: 'grime' });
  });
  P.box('detail', [-0.45, 0.45], [0.22, 0.4], [ZR + 0.3, ZF - 0.3], 0.02, { sw: 'frame' });
  const hubs = [];
  P.both((s) => {
    hubs.push(wheel(P, { x: s * 0.8, y: TR, z: FAX, r: TR, w: TW, id: s > 0 ? 1 : 2, side: s, rimSw: 'rimBlack', nuts: 5, hubCap: true }));
    hubs.push(wheel(P, { x: s * 0.8, y: TR, z: RAX, r: TR, w: TW, id: s > 0 ? 3 : 4, side: s, rimSw: 'rimBlack', nuts: 5, hubCap: true }));
  });
  hubs.sort((a, b) => a.id - b.id);
  return { P, hubs };
}

export function liverySVG() {
  const lay = liveryLayout(SPEC.L, SPEC.W, SPEC.H), px = liveryPx(lay);
  const B = '#1b3a9a', R = '#d22630';
  const F = "font-family='Liberation Sans, Arial, sans-serif'";
  const NUM = '7302158';
  const t = [`<rect width='2048' height='2048' fill='#ecedea'/>`];
  for (const s of [1, -1]) {
    const P = (z, y) => px.side(s, z, y);
    // the pinstripes: red over blue, the whole length
    for (const [y0, y1, c] of [[1.06, 1.085, R], [1.0, 1.025, B]]) { const [xa, ya] = P(ZF, y1), [xb, yb] = P(ZR, y0); t.push(`<rect x='${Math.min(xa, xb)}' y='${ya}' width='${Math.abs(xb - xa)}' height='${yb - ya}' fill='${c}'/>`); }
    // eagle mark on the cargo side, number high at the front, web address low at the rear
    { const [x0, y0] = P(s > 0 ? -0.35 : -1.55, 1.92), [x1, y1] = P(s > 0 ? -1.55 : -0.35, 1.38); t.push(eagle(x0, y0, x1 - x0, y1 - y0, B)); }
    { const [x, y] = P(s > 0 ? -1.4 : -0.5, 0.78); t.push(`<text x='${x}' y='${y}' ${F} font-style='italic' font-weight='bold' font-size='26' fill='${B}' text-anchor='middle'>www.usps.com</text>`); }
    { const [x, y] = P(0.0, 2.04); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='34' fill='#222' text-anchor='middle'>${NUM}</text>`); }
    if (s > 0) { const [x, y] = P(-1.85, 0.62); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='16' fill='${R}' text-anchor='middle'>GASOLINE</text>`); }
  }
  // rear: slats, the eagle centred high on the door, the stripes across it, number on top, web address low right
  { const [x0, y0] = px.rear(0.71, 1.99), [x1, y1] = px.rear(-0.71, 0.53);
    for (let y = y0; y < y1; y += 0.1 * px.my) t.push(`<rect x='${x0}' y='${y}' width='${x1 - x0}' height='2' fill='#c4c6c3'/>`);
    const [ex, ey] = px.rear(0.32, 1.65), [fx, fy] = px.rear(-0.32, 1.27); t.push(eagle(ex, ey, fx - ex, fy - ey, B));
    const [nx, ny] = px.rear(0, 1.95); t.push(`<text x='${nx}' y='${ny}' ${F} font-weight='bold' font-size='22' fill='#222' text-anchor='middle'>${NUM}</text>`);
    const [wx, wy] = px.rear(-0.3, 0.73); t.push(`<text x='${wx}' y='${wy}' ${F} font-style='italic' font-size='20' fill='${B}' text-anchor='middle'>www.usps.com</text>`);
    const [gx, gy] = px.rear(-0.3, 0.64); t.push(`<rect x='${gx - 22}' y='${gy - 8}' width='44' height='14' fill='${R}'/>`);
    for (const [y0b, y1b, c] of [[1.06, 1.085, R], [1.0, 1.025, B]]) { const [xa, ya] = px.rear(0.95, y1b), [xb, yb] = px.rear(-0.95, y0b); t.push(`<rect x='${xa}' y='${ya}' width='${xb - xa}' height='${yb - ya}' fill='${c}'/>`); } }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='2048' height='2048'>${t.join('')}</svg>`;
}

export async function livery(file) { return rasterLivery(liverySVG(), file, { grime: 0.28, streaks: 0.22, seed: 23 }); }
