// SCHOOLBUS: a Type C (conventional) school bus in National School Bus yellow, the IC CE / Saf-T-Liner C2 class that
// carries NYC's school routes. Width 96 in (2.438 m: en.wikipedia.org/wiki/Thomas_Saf-T-Liner_C2, the class body
// width); length, wheelbase, heights and window pitch read off the side views in refs/ar34veh/citytrucks/schoolbus/
// (ATTRIBUTION.md) - eyeballed, not yet rectified (docs/notes/ar34-veh-citytrucks.md).
import { Parts, wheel, ROLE, liveryLayout, liveryPx, rasterLivery } from './lib.mjs';

export const SPEC = { L: 11.0, W: 2.44, H: 3.2, zF: 5.5 };
const W2 = 1.22;
const ZB = 3.95, ZR = -5.32;            // passenger body: front (windshield plane) and rear walls
const Y0 = 0.56, SILL = 1.78, HEAD = 2.56, ROOF = 3.13;
const FAX = 4.42, RAX = -1.78, TR = 0.525, TW = 0.28;

export function build(q) {
  const P = new Parts(q);
  const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const nA = q === 0 ? 8 : q === 1 ? 3 : 1;
  // ---- passenger body: lower box (below the sills, wheel arches cut as notches), roof section, pillars, rails
  const arch = (zc, r) => arc(zc, Y0 - 0.06, r, 0, Math.PI, nA * 2).map(([z, y]) => [z, Math.max(y, Y0 - 0.06)]);
  const lowerSide = [[ZR, Y0], ...arch(RAX, 0.66).reverse().map(([z, y]) => [z, y]), [ZB, Y0], [ZB, SILL], [ZR, SILL]];
  // the shape walks rear -> front along the bottom (arch over the rear wheels), then back along the sill
  P.profile('paint', [[ZR, Y0], [RAX - 0.66, Y0], ...arc(RAX, Y0 - 0.06, 0.66, Math.PI, 0, nA * 2).slice(1, -1), [RAX + 0.66, Y0], [ZB - 0.02, Y0], [ZB - 0.02, SILL], [ZR, SILL]], -W2, W2, 0.035);
  void lowerSide; void arch;
  // roof: rounded cross-section along the body
  const roofSec = [[W2, HEAD], ...arc(W2 - 0.3, ROOF - 0.3, 0.3, 0, Math.PI / 2, nA * 2).slice(1), ...arc(-W2 + 0.3, ROOF - 0.3, 0.3, Math.PI / 2, Math.PI, nA * 2).slice(1), [-W2, HEAD]];
  P.section('paint', roofSec, ZR, ZB + 0.06, 0.05);
  // ceiling and sill shelf seen through the glass
  P.box('detail', [-W2 + 0.04, W2 - 0.04], [HEAD - 0.012, HEAD - 0.002], [ZR + 0.05, ZB - 0.02], 0, { sw: 'ceiling' });
  P.box('detail', [-W2 + 0.04, W2 - 0.04], [SILL + 0.001, SILL + 0.012], [ZR + 0.05, ZB - 0.02], 0, { sw: 'vinylGrey' });
  // side windows: pillars along both sides, glass inset 25 mm, a black rubber frame and the split sash line
  const winZ0 = -4.95, winZ1 = 3.05, nWin = 10, pitch = (winZ1 - winZ0) / nWin, PW = 0.1;
  P.both((s) => {
    const xo = s * W2, xi = s * (W2 - 0.06);
    for (let k = 0; k <= nWin; k++) {
      const zc = winZ0 + k * pitch;
      P.box('paint', [xi, xo].sort((a, b) => a - b), [SILL, HEAD], [zc - PW / 2, zc + PW / 2], 0.012);
    }
    // the front-most opening: driver's window (left) or the entry door's upper glass (right)
    P.box('paint', [xi, xo].sort((a, b) => a - b), [SILL, HEAD], [ZB - 0.12, ZB + 0.02], 0.012);
    P.box('paint', [xi, xo].sort((a, b) => a - b), [SILL, HEAD], [ZR - 0.01, winZ0 - PW / 2 + 0.01], 0.012);
    const xg = s * (W2 - 0.028);
    for (let k = 0; k < nWin; k++) {
      const za = winZ0 + k * pitch + PW / 2, zb = za + pitch - PW;
      P.box('glass', [xg - 0.003, xg + 0.003].sort((a, b) => a - b), [SILL + 0.02, HEAD - 0.02], [za, zb], 0);
      if (q === 0) {
        // rubber frame + the sash rail a third down from the head
        const fx = [s * (W2 - 0.03), s * (W2 - 0.012)].sort((a, b) => a - b);
        P.box('detail', fx, [HEAD - 0.045, HEAD - 0.02], [za, zb], 0, { sw: 'blackRubberTrim' });
        P.box('detail', fx, [SILL + 0.02, SILL + 0.045], [za, zb], 0, { sw: 'blackRubberTrim' });
        P.box('detail', fx, [SILL + 0.02, HEAD - 0.02], [za, za + 0.022], 0, { sw: 'blackRubberTrim' });
        P.box('detail', fx, [SILL + 0.02, HEAD - 0.02], [zb - 0.022, zb], 0, { sw: 'blackRubberTrim' });
        P.box('detail', [s * (W2 - 0.032), s * (W2 - 0.005)].sort((a, b) => a - b), [HEAD - 0.27, HEAD - 0.235], [za, zb], 0.004, { sw: 'alu' });
      }
    }
    // driver's window / door glass at the front opening
    P.box('glass', [xg - 0.003, xg + 0.003].sort((a, b) => a - b), [SILL + 0.02, HEAD - 0.02], [winZ1 + PW / 2, ZB - 0.12], 0);
    // rub rails: black bands along the side (the IC CE's four)
    for (const [y0, y1] of [[0.6, 0.66], [0.98, 1.05], [1.36, 1.43], [1.72, 1.79]]) {
      const zs = s < 0 && y0 > 0.9 ? [[ZR + 0.02, 3.05], [ZB - 0.02, ZB]] : [[ZR + 0.02, ZB - 0.02]];
      for (const [za, zb] of zs) if (zb - za > 0.05) P.box('detail', [s * (W2 - 0.005), s * (W2 + 0.018)].sort((a, b) => a - b), [y0, y1], [za, zb], 0.008, { sw: 'satinBlack' });
    }
    // side marker lamps (amber front / red rear) and reflectors
    if (q < 2) for (const [z, sw] of [[3.6, 'amberLens'], [0.4, 'amberLens'], [-5.1, 'redLens']]) P.box('detail', [s * W2, s * (W2 + 0.02)].sort((a, b) => a - b), [1.14, 1.2], [z - 0.05, z + 0.05], 0.01, { sw });
  });
  // entry door (right side, -X): two glass leaves in black frames, a lower kick panel
  {
    const za = 3.08, zb = ZB - 0.1, x = -W2 + 0.03;
    P.box('detail', [-W2 - 0.005, -W2 + 0.04], [Y0 + 0.08, HEAD], [za - 0.03, zb + 0.03], 0.01, { sw: 'satinBlack' });
    for (const [z0, z1] of [[za, (za + zb) / 2 - 0.015], [(za + zb) / 2 + 0.015, zb]]) {
      P.box('glass', [x - 0.04, x - 0.034], [0.75, HEAD - 0.05], [z0 + 0.03, z1 - 0.03], 0);
      if (q === 0) P.box('detail', [x - 0.045, x - 0.03], [1.3, 1.36], [z0 + 0.03, z1 - 0.03], 0, { sw: 'satinBlack' });
    }
    // stairwell behind it
    if (q < 2) for (let k = 0; k < 3; k++) P.box('detail', [-W2 + 0.06, -W2 + 0.6], [0.62 + k * 0.2, 0.66 + k * 0.2], [za, zb], 0, { sw: 'blackRubberTrim' });
  }
  // ---- front: cowl, windshield, front cap with the warning lamps and the SCHOOL BUS sign
  P.box('paint', [-W2, W2], [1.4, 1.66], [ZB - 0.05, ZB + 0.06], 0.03);
  const ws0 = 1.66, ws1 = HEAD - 0.04;
  P.both((s) => P.box('paint', [s * (W2 - 0.07), s * W2].sort((a, b) => a - b), [ws0, HEAD], [ZB - 0.05, ZB + 0.06], 0.02));
  P.box('detail', [-0.03, 0.03], [ws0, ws1], [ZB + 0.01, ZB + 0.05], 0.01, { sw: 'satinBlack' });
  P.both((s) => P.box('glass', [s * 0.03, s * (W2 - 0.07)].sort((a, b) => a - b), [ws0 + 0.02, ws1], [ZB + 0.02, ZB + 0.026], 0));
  if (q === 0) {
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [ws0, ws0 + 0.035], [ZB + 0.02, ZB + 0.05], 0.01, { sw: 'blackRubberTrim' });
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [ws1 - 0.01, ws1 + 0.025], [ZB + 0.02, ZB + 0.05], 0.01, { sw: 'blackRubberTrim' });
    // wipers parked along the bottom of each pane
    P.both((s) => P.box('detail', [s * 0.12, s * 0.95].sort((a, b) => a - b), [ws0 + 0.05, ws0 + 0.07], [ZB + 0.03, ZB + 0.05], 0.005, { sw: 'wiper' }));
  }
  // front cap: lamps (outer red, inner amber) and the sign plate
  P.both((s) => {
    for (const [x, role, sw] of [[0.98, ROLE.sirenR, null], [0.7, 0, 'amberLens']]) {
      P.cyl('lampInner', [s * x, 2.86, ZB + 0.07], 0.105, 0.04, 'z', {});
      if (role) P.cyl('lamp', [s * x, 2.86, ZB + 0.095], 0.088, 0.02, 'z', { lamp: role });
      else P.cyl('detail', [s * x, 2.86, ZB + 0.095], 0.088, 0.02, 'z', { sw });
      if (q === 0) P.cyl('detail', [s * x, 2.86 + 0.085, ZB + 0.12], 0.11, 0.06, 'z', { sw: 'satinBlack', r2: 0.11, seg: 16 });
    }
  });
  P.box('paint', [-0.46, 0.46], [2.74, 3.0], [ZB + 0.06, ZB + 0.085], 0.01);
  if (q < 2) for (const x of [-0.25, 0, 0.25]) P.box('detail', [x - 0.04, x + 0.04], [3.06, 3.1], [ZB - 0.02, ZB + 0.04], 0.01, { sw: 'amberLens' });
  // ---- hood and fenders (the conventional nose), grille, lamps, bumper
  const nose = 5.32, hoodTop = 1.56;
  P.profile('paint', [[ZB, 0.86], [nose - 0.02, 0.86], [nose, 0.9], [nose, 1.36], [nose - 0.1, 1.46], [ZB + 0.6, hoodTop - 0.02], [ZB, hoodTop]], -0.8, 0.8, 0.07);
  P.both((s) => {
    const x0 = s * 0.78, x1 = s * 1.16;
    const fen = [[ZB, 0.72], [FAX - 0.6, 0.72], ...arc(FAX, 0.52, 0.6, Math.PI, 0, nA * 2).slice(1, -1).map(([z, y]) => [z, Math.max(y, 0.72)]), [FAX + 0.6, 0.72], [nose - 0.08, 0.72], [nose - 0.04, 1.16], [nose - 0.22, 1.36], [ZB + 0.3, 1.5], [ZB, 1.52]];
    P.profile('paint', fen, Math.min(x0, x1), Math.max(x0, x1), 0.08);
    // headlamp pod (lampInner bezel + reflector + lens) and the amber signal under it
    P.box('lampInner', [s * 0.82, s * 1.08].sort((a, b) => a - b), [1.02, 1.2], [nose - 0.16, nose - 0.09], 0.02);
    P.box('lamp', [s * 0.84, s * 1.06].sort((a, b) => a - b), [1.04, 1.18], [nose - 0.1, nose - 0.08], 0.02, { lamp: ROLE.head });
    P.box('lens', [s * 0.83, s * 1.07].sort((a, b) => a - b), [1.03, 1.19], [nose - 0.085, nose - 0.075], 0.02);
    P.box('lamp', [s * 0.88, s * 1.04].sort((a, b) => a - b), [0.9, 0.98], [nose - 0.12, nose - 0.085], 0.015, { lamp: s > 0 ? ROLE.fbl : ROLE.fbr });
  });
  // grille: chrome surround, dark slats
  P.box('detail', [-0.58, 0.58], [0.9, 1.38], [nose - 0.03, nose + 0.015], 0.03, { sw: 'chrome' });
  P.box('detail', [-0.52, 0.52], [0.94, 1.34], [nose + 0.005, nose + 0.02], 0.01, { sw: 'satinBlack' });
  if (q < 2) for (let k = 0; k < 6; k++) P.box('detail', [-0.52, 0.52], [0.97 + k * 0.064, 0.995 + k * 0.064], [nose + 0.012, nose + 0.035], 0.006, { sw: 'chrome' });
  P.box('detail', [-W2 + 0.02, W2 - 0.02], [0.44, 0.8], [nose + 0.02, nose + 0.18], 0.04, { sw: 'satinBlack' });
  if (q < 2) P.box('detail', [-1.24, -0.86], [0.56, 0.62], [nose + 0.18, nose + 0.2], 0.01, { sw: 'yellow' });   // crossing arm, folded
  // ---- mirrors: crossover convex mirrors on the fender stalks, flat + convex at the windshield corners
  P.both((s) => {
    const stalkTop = [s * 1.18, 2.02, nose - 0.02];
    if (q < 2) {
      P.box('detail', [s * 1.0, s * 1.03].sort((a, b) => a - b), [1.4, 2.0], [nose - 0.3, nose - 0.27], 0.01, { sw: 'satinBlack' });
      P.box('detail', [s * 1.0, s * 1.2].sort((a, b) => a - b), [1.98, 2.01], [nose - 0.3, nose - 0.27], 0.01, { sw: 'satinBlack' });
    }
    P.cyl('detail', stalkTop, 0.15, 0.08, 'z', { sw: 'satinBlack', r2: 0.12 });
    P.cyl('detail', [stalkTop[0], stalkTop[1], stalkTop[2] - 0.045], 0.13, 0.01, 'z', { sw: 'mirror' });
    P.box('detail', [s * (W2 + 0.02), s * (W2 + 0.3)].sort((a, b) => a - b), [2.2, 2.23], [ZB - 0.05, ZB - 0.02], 0.01, { sw: 'satinBlack' });
    P.box('detail', [s * (W2 + 0.26), s * (W2 + 0.36)].sort((a, b) => a - b), [1.86, 2.36], [ZB - 0.12, ZB + 0.02], 0.03, { sw: 'satinBlack' });
    P.box('detail', [s * (W2 + 0.27), s * (W2 + 0.35)].sort((a, b) => a - b), [1.88, 2.34], [ZB - 0.135, ZB - 0.12], 0.01, { sw: 'mirror' });
  });
  // ---- stop arm (left side, folded against the body behind the driver's window): its face is the livery's octagon
  P.box('paint', [W2 + 0.02, W2 + 0.05], [1.86, 2.32], [3.25 - 0.23, 3.25 + 0.23], 0.06);
  // ---- rear wall: emergency door, rear windows, lamps, bumper
  P.box('paint', [-W2, W2], [Y0, ROOF - 0.05], [ZR - 0.04, ZR + 0.01], 0.03);
  P.both((s) => {
    P.box('glass', [s * 0.42, s * 1.0].sort((a, b) => a - b), [1.95, 2.5], [ZR - 0.048, ZR - 0.042], 0);
    for (const [y, role] of [[1.05, ROLE.tail], [0.85, ROLE.tail]]) {
      P.cyl('lampInner', [s * 0.95, y, ZR - 0.05], 0.09, 0.03, 'z', {});
      P.cyl('lamp', [s * 0.95, y, ZR - 0.07], 0.08, 0.02, 'z', { lamp: role });
    }
    P.cyl('lamp', [s * 0.72, 1.05, ZR - 0.07], 0.07, 0.02, 'z', { lamp: s > 0 ? ROLE.rbl : ROLE.rbr });
    P.cyl('lamp', [s * 0.72, 0.85, ZR - 0.07], 0.06, 0.02, 'z', { lamp: ROLE.rev });
    for (const [x, role, sw] of [[0.98, ROLE.sirenR, null], [0.7, 0, 'amberLens']]) {
      P.cyl('lampInner', [s * x, 2.84, ZR - 0.05], 0.1, 0.03, 'z', {});
      if (role) P.cyl('lamp', [s * x, 2.84, ZR - 0.07], 0.088, 0.02, 'z', { lamp: role });
      else P.cyl('detail', [s * x, 2.84, ZR - 0.07], 0.088, 0.02, 'z', { sw });
    }
  });
  // emergency door: a yellow leaf in a black rubber outline, its upper glass over the dark aisle
  P.box('glass', [-0.3, 0.3], [1.95, 2.5], [ZR - 0.062, ZR - 0.056], 0);
  P.box('paint', [-0.36, 0.36], [0.64, 2.56], [ZR - 0.055, ZR - 0.04], 0.01);
  for (const [X, Yr] of [[[-0.38, 0.38], [2.56, 2.6]], [[-0.38, 0.38], [0.6, 0.64]], [[-0.38, -0.36], [0.6, 2.6]], [[0.36, 0.38], [0.6, 2.6]]]) P.box('detail', X, Yr, [ZR - 0.06, ZR - 0.04], 0.004, { sw: 'blackRubberTrim' });
  P.box('detail', [-0.3, 0.3], [1.95, 2.5], [ZR - 0.057, ZR - 0.054], 0, { sw: 'dash' });
  P.both((s) => P.box('detail', [s * 0.42, s * 1.0].sort((a, b) => a - b), [1.95, 2.5], [ZR - 0.041, ZR - 0.038], 0, { sw: 'dash' }));
  if (q < 2) P.box('detail', [0.2, 0.3], [1.5, 1.56], [ZR - 0.085, ZR - 0.055], 0.01, { sw: 'chrome' });
  P.box('detail', [-W2 + 0.02, W2 - 0.02], [0.42, 0.68], [ZR - 0.2, ZR - 0.02], 0.04, { sw: 'satinBlack' });
  // ---- roof hatches
  if (q < 2) for (const z of [1.6, -2.4]) P.box('detail', [-0.42, 0.42], [ROOF - 0.01, ROOF + 0.06], [z - 0.4, z + 0.4], 0.03, { sw: 'white' });
  // ---- chassis: frame rails, fuel tank, battery box, mud flaps, dark skirt behind the wheels
  P.box('detail', [-0.55, 0.55], [0.55, 0.75], [-4.6, 5.2], 0.02, { sw: 'frame' });
  if (q < 2) {
    P.box('detail', [0.62, 1.12], [0.62, 0.95], [0.6, 1.8], 0.06, { sw: 'satinBlack' });
    P.both((s) => {
      P.box('detail', [s * 0.62, s * 1.18].sort((a, b) => a - b), [0.28, 0.62], [RAX - 0.78, RAX - 0.75], 0.01, { sw: 'mudflap' });
      P.box('detail', [s * 0.6, s * 1.18].sort((a, b) => a - b), [0.3, 0.72], [FAX - 0.65, FAX - 0.62], 0.01, { sw: 'mudflap' });
    });
  }
  // wheel wells (dark liners) so the arches do not show daylight through the body
  // (half-cylinder liners facing in, and the inboard wall)
  P.both((s) => {
    P.latheX('detail', [s * 0.84, Y0 - 0.06, RAX], [[0.645, 0.39], [0.645, -0.39]], { sw: 'grime', phiStart: Math.PI, phiLength: Math.PI });
    P.box('detail', [s * 0.44, s * 0.47].sort((a, b) => a - b), [Y0 - 0.06, 1.18], [RAX - 0.66, RAX + 0.66], 0, { sw: 'grime' });
    P.latheX('detail', [s * 0.97, 0.52, FAX], [[0.585, 0.2], [0.585, -0.2]], { sw: 'grime', phiStart: Math.PI, phiLength: Math.PI });
    P.box('detail', [s * 0.76, s * 0.79].sort((a, b) => a - b), [0.6, 1.14], [FAX - 0.6, FAX + 0.6], 0, { sw: 'grime' });
  });
  // ---- interior: driver's seat and wheel, dash, bench seats both sides of the aisle
  if (q < 2) {
    P.box('detail', [-W2 + 0.06, W2 - 0.06], [1.45, 1.72], [ZB - 0.45, ZB - 0.05], 0.05, { sw: 'dash' });
    P.box('detail', [0.35, 0.85], [1.5, 2.15], [ZB - 1.15, ZB - 0.95], 0.05, { sw: 'seatBlack' });
    const sw0 = [0.6, 1.9, ZB - 0.55];
    P.cyl('detail', sw0, 0.24, 0.035, 'y', { sw: 'satinBlack', m: null });
    const rows = 10;
    for (let k = 0; k < rows; k++) {
      const z = 2.6 - k * 0.78;
      for (const s of [1, -1]) {
        if (s < 0 && z > 2.4) continue;
        P.box('detail', [s * 0.18, s * 1.12].sort((a, b) => a - b), [1.45, 2.06], [z - 0.12, z - 0.02], 0.04, { sw: 'seatBrown' });
        if (q === 0) P.box('detail', [s * 0.18, s * 1.12].sort((a, b) => a - b), [1.43, 1.5], [z - 0.5, z - 0.02], 0.03, { sw: 'seatBrown' });
      }
    }
  }
  // ---- wheels
  const hubs = [];
  P.both((s) => {
    hubs.push(wheel(P, { x: s * 1.02, y: TR, z: FAX, r: TR, w: TW, id: s > 0 ? 1 : 2, side: s, rimSw: 'rimWhite', nuts: 10 }));
    hubs.push(wheel(P, { x: s * 1.05, y: TR, z: RAX, r: TR, w: TW, id: s > 0 ? 3 : 4, side: s, rimSw: 'rimWhite', dual: true, nuts: 10 }));
  });
  hubs.sort((a, b) => a.id - b.id);
  return { P, hubs };
}

// ---- livery: yellow body, black lettering, the SCHOOL BUS signs, the stop arm's octagon, bus numbers
export function liverySVG() {
  const lay = liveryLayout(SPEC.L, SPEC.W, SPEC.H), px = liveryPx(lay);
  const Y = '#f4b406';
  const t = [];
  t.push(`<rect width="2048" height="2048" fill="${Y}"/>`);
  const font = "font-family='Liberation Sans, Arial, sans-serif' font-weight='bold'";
  for (const s of [1, -1]) {
    // operator name on the band under the windows, fleet number fore and aft
    const [xa, ya] = px.side(s, -0.3, 1.58);
    t.push(`<text x='${xa}' y='${ya + 12}' ${font} font-size='34' text-anchor='middle' fill='#111' letter-spacing='3'>HARBOR CITY STUDENT TRANSIT</text>`);
    for (const z of [-4.6, 4.9]) { const [xn, yn] = px.side(s, z, 1.58); t.push(`<text x='${xn}' y='${yn + 12}' ${font} font-size='38' text-anchor='middle' fill='#111'>2417</text>`); }
    const [xb, yb] = px.side(s, -0.3, 1.2);
    t.push(`<text x='${xb}' y='${yb + 8}' font-family='Liberation Sans, Arial, sans-serif' font-size='20' text-anchor='middle' fill='#111' letter-spacing='2'>BUS CO. INC. - NEW YORK, NY</text>`);
    // hood side number
    const [xh, yh] = px.side(s, 4.8, 1.22); t.push(`<text x='${xh}' y='${yh + 12}' ${font} font-size='34' text-anchor='middle' fill='#111'>2417</text>`);
  }
  // stop arm octagon on the left side (z 3.25, y 2.09)
  {
    const [cx, cy] = px.side(1, 3.25, 2.09), r = 0.22 * px.mx, ry = 0.22 * px.my;
    const pts = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * ry}`; }).join(' ');
    const pts2 = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return `${cx + Math.cos(a) * r * 0.9},${cy + Math.sin(a) * ry * 0.9}`; }).join(' ');
    t.push(`<polygon points='${pts}' fill='#f2f2f0'/><polygon points='${pts2}' fill='#c8101a'/>`);
    t.push(`<text x='${cx}' y='${cy + 9}' ${font} font-size='30' text-anchor='middle' fill='#fff' transform='translate(${cx} ${cy}) scale(0.85 1) translate(${-cx} ${-cy})'>STOP</text>`);
  }
  // front cap sign and the rear sign: black-bordered panel, SCHOOL BUS in black
  for (const v of ['front', 'rear']) {
    const [x0, y0] = px[v](v === 'front' ? -0.44 : 0.44, 2.98), [x1, y1] = px[v](v === 'front' ? 0.44 : -0.44, 2.76);
    t.push(`<rect x='${x0}' y='${y0}' width='${x1 - x0}' height='${y1 - y0}' fill='${Y}' stroke='#111' stroke-width='6'/>`);
    t.push(`<text x='${(x0 + x1) / 2}' y='${(y0 + y1) / 2 + 13}' ${font} font-size='44' text-anchor='middle' fill='#111' transform='translate(${(x0 + x1) / 2} 0) scale(0.82 1) translate(${-(x0 + x1) / 2} 0)'>SCHOOL BUS</text>`);
  }
  // rear: emergency door legend, number, the flashing-lights warning
  {
    const [xe, ye] = px.rear(0, 2.62); t.push(`<text x='${xe}' y='${ye}' ${font} font-size='16' text-anchor='middle' fill='#111'>EMERGENCY DOOR</text>`);
    const [xn, yn] = px.rear(0.75, 1.5); t.push(`<text x='${xn}' y='${yn}' ${font} font-size='34' text-anchor='middle' fill='#111'>2417</text>`);
    const [xw, yw] = px.rear(0, 1.42); t.push(`<text x='${xw}' y='${yw}' ${font} font-size='13' text-anchor='middle' fill='#111'>STOP WHEN RED LIGHTS FLASH</text>`);
  }
  // front: the number on the cowl corners
  { const [xn, yn] = px.front(0.95, 1.5); t.push(`<text x='${xn}' y='${yn}' ${font} font-size='26' text-anchor='middle' fill='#111'>2417</text>`); }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='2048' height='2048'>${t.join('')}</svg>`;
}

export async function livery(file) { return rasterLivery(liverySVG(), file, { grime: 0.3, streaks: 0.18, seed: 7 }); }
