// USPSNGDV: the Oshkosh Defense Next Generation Delivery Vehicle (in service from 2024): right-hand drive, a short low
// nose under a very tall windshield, a stand-up cargo box with a curbside sliding door. Length 235.75 in (5.988 m),
// width 84.5 in (2.146 m), height 111 in (2.819 m), wheelbase 127 in (3.226 m): en.wikipedia.org/wiki/
// Next_Generation_Delivery_Vehicle (infobox). Overhangs, glass and panel lines read off refs/ar34veh/citytrucks/ngdv/
// (ATTRIBUTION.md; eyeballed, not yet rectified).
import { Parts, wheel, ROLE, liveryLayout, liveryPx, rasterLivery } from './lib.mjs';
import { eagle } from './uspsMark.mjs';

export const SPEC = { L: 5.988, W: 2.146, H: 2.819, zF: 2.994 };
const W2 = 1.073, ZF = 2.994, ZR = -2.994;
const FAX = 2.06, RAX = FAX - 3.226, TR = 0.375, TW = 0.235;
const HOODZ = 2.3, HOODY = 1.12, WSTOP = 1.62, ROOF = 2.819, CLAD = 0.78;

export function build(q) {
  const P = new Parts(q);
  const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const nA = q === 0 ? 8 : q === 1 ? 3 : 2;
  const sort = (a, b) => [a, b].sort((u, v) => u - v);
  // white upper body: side profile from the nose over the windshield line to the rear, arches above the cladding
  // the nose rounds over from the grille into the short hood (the "duck bill")
  const side = [[ZR + 0.06, CLAD], [ZF - 0.16, CLAD], [ZF - 0.1, 0.86], [ZF - 0.1, 0.95], [ZF - 0.14, 1.01], [ZF - 0.24, 1.05], [ZF - 0.42, 1.08],
    [HOODZ, HOODY], [HOODZ - 0.02, HOODY + 0.05], [ZR + 0.06, HOODY + 0.05]];
  P.profile('paint', side, -W2, W2, 0.1);
  // dark lower cladding with both wheel arches
  const clad = [[ZR + 0.08, 0.36], [RAX - 0.47, 0.36], ...arc(RAX, TR + 0.02, 0.47, Math.PI, 0, nA * 2).slice(1, -1), [RAX + 0.47, 0.36],
    [FAX - 0.47, 0.36], ...arc(FAX, TR + 0.02, 0.47, Math.PI, 0, nA * 2).slice(1, -1), [FAX + 0.47, 0.36], [ZF - 0.16, 0.4], [ZF - 0.16, CLAD + 0.01], [ZR + 0.08, CLAD + 0.01]];
  P.profile('detail', clad, -W2 + 0.005, W2 - 0.005, 0.03, { sw: 'blackPlastic' });
  // the cab's glass house: roof, A pillars along the raked windshield, B pillar, the cargo walls behind
  P.box('paint', [-W2, W2], [2.55, ROOF], [ZR + 0.06, WSTOP + 0.06], 0.12);
  P.box('paint', [-W2, W2], [HOODY + 0.04, 2.56], [ZR + 0.06, 0.92], 0.06);
  const rake = (y) => HOODZ - ((y - HOODY) / (2.56 - HOODY)) * (HOODZ - WSTOP);
  P.both((s) => {
    // A pillar: a thin raked post (profile across a narrow x band)
    P.profile('paint', [[HOODZ + 0.02, HOODY], [HOODZ - 0.1, HOODY], [WSTOP - 0.08, 2.58], [WSTOP + 0.04, 2.58]], ...sort(s * (W2 - 0.07), s * W2), 0.015);
    P.box('paint', sort(s * (W2 - 0.06), s * W2), [HOODY, 2.56], [0.86, 0.96], 0.02);
    // side glass of the cab (the driver's sliding door on the right is all glass above the beltline)
    const za = 0.97, zb = (y) => rake(y) - 0.1;
    P.profile('glass', [[za, 1.2], [zb(1.2), 1.2], [zb(2.5), 2.5], [za, 2.5]], ...sort(s * (W2 - 0.022), s * (W2 - 0.018)), 0);
    if (q === 0) P.box('detail', sort(s * (W2 - 0.024), s * (W2 - 0.004)), [1.17, 1.2], [za, zb(1.2)], 0.004, { sw: 'blackRubberTrim' });
    // mirrors on arms at the A pillars, the lower convex mirror
    P.box('detail', sort(s * W2, s * (W2 + 0.22)), [2.0, 2.03], [rake(2.0) - 0.05, rake(2.0) - 0.02], 0.008, { sw: 'satinBlack' });
    P.box('detail', sort(s * (W2 + 0.16), s * (W2 + 0.27)), [1.7, 2.12], [rake(1.9) - 0.12, rake(1.9) - 0.03], 0.03, { sw: 'satinBlack' });
    P.box('detail', sort(s * (W2 + 0.165), s * (W2 + 0.265)), [1.72, 2.1], [rake(1.9) - 0.13, rake(1.9) - 0.12], 0.005, { sw: 'mirror' });
  });
  // the tall windshield: a raked pane from the hood to the roof
  P.profile('glass', [[HOODZ - 0.02, HOODY + 0.03], [HOODZ - 0.026, HOODY + 0.03], [WSTOP - 0.006, 2.54], [WSTOP, 2.54]], -W2 + 0.07, W2 - 0.07, 0);
  if (q === 0) {
    P.profile('detail', [[HOODZ, HOODY], [HOODZ - 0.06, HOODY], [HOODZ - 0.07, HOODY + 0.06], [HOODZ - 0.01, HOODY + 0.06]], -W2 + 0.06, W2 - 0.06, 0, { sw: 'blackRubberTrim' });
    P.both((s) => P.box('detail', sort(s * 0.1, s * 0.85), [HOODY + 0.07, HOODY + 0.09], [HOODZ - 0.03, HOODZ], 0.004, { sw: 'wiper' }));
  }
  // interior: dash, right-hand wheel and seat, the cargo shelving behind the bulkhead
  if (q < 2) {
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [0.9, 1.25], [HOODZ - 0.5, HOODZ - 0.04], 0.05, { sw: 'dash' });
    P.cyl('detail', [-0.5, 1.45, HOODZ - 0.6], 0.2, 0.035, 'y', { sw: 'satinBlack' });
    P.box('detail', [-0.8, -0.25], [0.55, 1.75], [1.0, 1.2], 0.05, { sw: 'seatBlack' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [HOODY + 0.04, 2.55], [0.92, 0.95], 0, { sw: 'cargoAlu' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [2.54, 2.55], [0.95, WSTOP], 0, { sw: 'interiorWall' });
    P.box('detail', [-W2 + 0.05, W2 - 0.05], [HOODY + 0.04, HOODY + 0.05], [0.95, HOODZ - 0.05], 0, { sw: 'floor' });
  }
  // nose: white grille frame with chrome slats, the slim lamp bars, black bumper
  P.box('detail', [-0.42, 0.42], [0.6, 0.95], [ZF - 0.17, ZF - 0.13], 0.03, { sw: 'cabWhite' });
  P.box('detail', [-0.37, 0.37], [0.64, 0.91], [ZF - 0.14, ZF - 0.12], 0.01, { sw: 'satinBlack' });
  if (q < 2) for (let k = 0; k < 5; k++) P.box('detail', [-0.37, 0.37], [0.66 + k * 0.05, 0.68 + k * 0.05], [ZF - 0.13, ZF - 0.115], 0.004, { sw: 'chrome' });
  P.both((s) => {
    P.box('lampInner', sort(s * 0.5, s * 0.98), [0.78, 0.9], [ZF - 0.2, ZF - 0.15], 0.02);
    P.box('lamp', sort(s * 0.55, s * 0.9), [0.8, 0.88], [ZF - 0.16, ZF - 0.14], 0.02, { lamp: ROLE.head });
    P.box('lamp', sort(s * 0.9, s * 0.97), [0.8, 0.88], [ZF - 0.17, ZF - 0.15], 0.01, { lamp: s > 0 ? ROLE.fbl : ROLE.fbr });
    P.box('lens', sort(s * 0.51, s * 0.97), [0.79, 0.89], [ZF - 0.145, ZF - 0.138], 0.015);
  });
  P.box('detail', [-W2, W2], [0.3, 0.64], [ZF - 0.2, ZF], 0.05, { sw: 'blackPlastic' });
  // cargo side: the curbside sliding door's rail and handle; the rear door frame, lamp columns, bumper
  P.box('detail', [-W2 - 0.012, -W2 + 0.01], [2.36, 2.39], [-0.9, 0.85], 0.006, { sw: 'satinBlack' });
  if (q < 2) P.box('detail', [-W2 - 0.03, -W2], [1.25, 1.4], [0.72, 0.76], 0.01, { sw: 'satinBlack' });
  P.box('detail', [-W2 + 0.02, W2 - 0.02], [0.75, 2.62], [ZR + 0.04, ZR + 0.07], 0.03, { sw: 'satinBlack' });
  P.box('paint', [-W2 + 0.2, W2 - 0.2], [0.82, 2.5], [ZR + 0.03, ZR + 0.045], 0.01);
  P.both((s) => {
    for (const [y, role] of [[2.1, ROLE.tail], [1.9, s > 0 ? ROLE.rbl : ROLE.rbr], [1.7, ROLE.tail], [1.5, ROLE.rev]]) P.box('lamp', sort(s * 0.9, s * 1.0), [y - 0.07, y + 0.07], [ZR + 0.025, ZR + 0.04], 0.01, { lamp: role });
    P.box('lens', sort(s * 0.895, s * 1.005), [1.42, 2.18], [ZR + 0.018, ZR + 0.025], 0.01);
  });
  P.box('detail', [-W2, W2], [0.32, 0.72], [ZR, ZR + 0.22], 0.05, { sw: 'blackPlastic' });
  // wells
  P.both((s) => {
    for (const z of [FAX, RAX]) P.latheX('detail', [s * 0.8, TR + 0.02, z], [[0.455, 0.27], [0.455, -0.27]], { sw: 'grime', phiStart: Math.PI, phiLength: Math.PI });
    for (const z of [FAX, RAX]) P.box('detail', sort(s * 0.52, s * 0.54), [TR, 0.84], [z - 0.47, z + 0.47], 0, { sw: 'grime' });
  });
  const hubs = [];
  P.both((s) => {
    hubs.push(wheel(P, { x: s * 0.89, y: TR, z: FAX, r: TR, w: TW, id: s > 0 ? 1 : 2, side: s, rimSw: 'rimBlack', nuts: 6 }));
    hubs.push(wheel(P, { x: s * 0.89, y: TR, z: RAX, r: TR, w: TW, id: s > 0 ? 3 : 4, side: s, rimSw: 'rimBlack', nuts: 6 }));
  });
  hubs.sort((a, b) => a.id - b.id);
  return { P, hubs };
}

export function liverySVG() {
  const lay = liveryLayout(SPEC.L, SPEC.W, SPEC.H), px = liveryPx(lay);
  const B = '#1b3a9a', R = '#d22630';
  const F = "font-family='Liberation Sans, Arial, sans-serif'";
  const NUM = '5A00417';
  const t = [`<rect width='2048' height='2048' fill='#eeefec'/>`];
  for (const s of [1, -1]) {
    const P = (z, y) => px.side(s, z, y);
    for (const [y0, y1, c] of [[1.02, 1.045, R], [0.965, 0.99, B]]) { const [xa, ya] = P(ZF - 0.3, y1), [xb, yb] = P(ZR, y0); t.push(`<rect x='${Math.min(xa, xb)}' y='${ya}' width='${Math.abs(xb - xa)}' height='${yb - ya}' fill='${c}'/>`); }
    { const [x0, y0] = P(s > 0 ? -0.2 : -1.25, 2.38), [x1, y1] = P(s > 0 ? -1.25 : -0.2, 1.82); t.push(eagle(x0, y0, x1 - x0, y1 - y0, B)); }
    { const [x, y] = P(-0.72, 1.6); t.push(`<text x='${x}' y='${y}' ${F} font-style='italic' font-size='24' fill='${B}' text-anchor='middle'>Delivering for America.</text>`); }
    { const [x, y] = P(-0.72, 1.48); t.push(`<text x='${x}' y='${y}' ${F} font-style='italic' font-weight='bold' font-size='22' fill='${B}' text-anchor='middle'>www.usps.com</text>`); }
    { const [x, y] = P(1.9, 2.66); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='26' fill='${B}' text-anchor='middle'>${NUM}</text>`); }
    // panel seams of the cargo doors
    for (const z of [0.85, -0.9]) { const [xa, ya] = P(z, 2.5), [, yb] = P(z, CLAD); t.push(`<rect x='${xa - 1.5}' y='${ya}' width='3' height='${yb - ya}' fill='#9a9c9a'/>`); }
  }
  { const [x, y] = px.front(0, 2.66); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='30' fill='${B}' text-anchor='middle'>${NUM}</text>`); }
  { const [ex, ey] = px.rear(0.45, 2.3), [fx, fy] = px.rear(-0.45, 1.85); t.push(eagle(ex, ey, fx - ex, fy - ey, B));
    const [nx, ny] = px.rear(0, 2.42); t.push(`<text x='${nx}' y='${ny}' ${F} font-weight='bold' font-size='24' fill='#222' text-anchor='middle'>${NUM}</text>`);
    const [wx, wy] = px.rear(0, 1.7); t.push(`<text x='${wx}' y='${wy}' ${F} font-style='italic' font-weight='bold' font-size='20' fill='${B}' text-anchor='middle'>www.usps.com</text>`); }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='2048' height='2048'>${t.join('')}</svg>`;
}

export async function livery(file) { return rasterLivery(liverySVG(), file, { grime: 0.22, streaks: 0.15, seed: 31 }); }
