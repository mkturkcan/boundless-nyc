// DSNY: the Department of Sanitation's collection truck, a Mack LR low-entry cab-over (dual drive, the stand-up right
// position) with a 25-cubic-yard rear-loader body (McNeilus / Heil class) on a tandem rear axle, as on NYC's streets
// (refs/ar34veh/citytrucks/dsny/: Commons photos by Tdorante10 and others, ATTRIBUTION.md). Width 96 in (2.438 m) and
// the wheelbase range 173-246 in: en.wikipedia.org/wiki/Mack_LR. Overall length, heights and axle positions read off
// the reference photos (eyeballed, not yet rectified; docs/notes/ar34-veh-citytrucks.md).
// Axles: 3. _WHEEL 1/2 = front L/R, 3/4 = first rear axle L/R, 5/6 = second (rearmost) rear axle L/R (the runtime's
// hub table needs six entries for this kind: docs/notes/ar34-req/VEHICLES.md).
import { Parts, wheel, ROLE, liveryLayout, liveryPx, rasterLivery } from './lib.mjs';

export const SPEC = { L: 10.0, W: 2.44, H: 3.62, zF: 5.0 };
const W2 = 1.22;
const FAX = 3.35, RA1 = -1.35, RA2 = -2.72, TR = 0.53, TW = 0.3;
const CAB0 = 3.0, CABF = 4.85, CROOF = 2.8, BELT = 1.5, WTOP = 2.52;
const BODYF = 2.82, BODYR = -3.3, BB = 1.1, BT = 3.55;

export function build(q) {
  const P = new Parts(q);
  const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const nA = q === 0 ? 10 : q === 1 ? 4 : 2;
  const sort = (a, b) => [a, b].sort((u, v) => u - v);
  // ---------------- cab (Mack LR): lower shell with the front wheel opening, pillars, roof, the split windshield
  const aEnd = Math.acos((CAB0 - FAX) / 0.62);
  P.profile('paint', [[CABF, 0.5], [FAX + 0.62, 0.5], ...arc(FAX, TR, 0.62, 0, aEnd, nA).slice(0), [CAB0, BELT], [CABF - 0.04, BELT], [CABF, BELT - 0.06]], -W2, W2, 0.06);
  P.box('paint', [-W2, W2], [WTOP, CROOF], [CAB0, CABF - 0.08], 0.1);
  // pillars: A (front corners, raked), B (door rear), C (cab rear corners); a centre post between the windshields
  P.both((s) => {
    P.box('paint', sort(s * (W2 - 0.1), s * W2), [BELT, WTOP + 0.02], [CABF - 0.2, CABF - 0.04], 0.04);
    P.box('paint', sort(s * (W2 - 0.08), s * W2), [BELT, WTOP + 0.02], [CAB0, CAB0 + 0.3], 0.04);
    P.box('paint', sort(s * (W2 - 0.3), s * W2), [BELT, WTOP + 0.02], [CABF - 0.12, CABF - 0.04], 0.03);
  });
  P.box('paint', [-0.05, 0.05], [BELT, WTOP], [CABF - 0.12, CABF - 0.05], 0.02);
  P.box('paint', [-W2 + 0.1, W2 - 0.1], [BELT, WTOP], [CAB0, CAB0 + 0.06], 0);   // cab back wall
  // glass: windshields, door windows (with the lower peep window on the curb side)
  P.both((s) => {
    P.box('glass', sort(s * 0.05, s * (W2 - 0.3)), [BELT + 0.05, WTOP - 0.02], [CABF - 0.085, CABF - 0.08], 0);
    P.box('glass', sort(s * (W2 - 0.025), s * (W2 - 0.02)), [BELT + 0.04, WTOP - 0.02], [CAB0 + 0.3, CABF - 0.2], 0);
    // the low-entry door's lower window (kerb and pedestrian view), dark cab behind it
    P.box('glass', sort(s * (W2 + 0.004), s * (W2 + 0.008)), [0.72, 1.36], [CABF - 0.62, CABF - 0.36], 0);
    P.box('detail', sort(s * (W2 + 0.0), s * (W2 + 0.003)), [0.72, 1.36], [CABF - 0.62, CABF - 0.36], 0, { sw: 'dash' });
    if (q === 0) {
      P.box('detail', sort(s * 0.05, s * (W2 - 0.3)), [BELT + 0.02, BELT + 0.05], [CABF - 0.09, CABF - 0.06], 0.005, { sw: 'blackRubberTrim' });
      P.box('detail', sort(s * 0.12, s * 0.9), [BELT + 0.08, BELT + 0.1], [CABF - 0.075, CABF - 0.06], 0.005, { sw: 'wiper' });
      P.box('detail', sort(s * (W2 - 0.03), s * (W2 - 0.005)), [BELT + 0.02, BELT + 0.045], [CAB0 + 0.3, CABF - 0.2], 0.005, { sw: 'blackRubberTrim' });
      // door handle, grab rail beside the door, the hinge line
      P.box('detail', sort(s * W2, s * (W2 + 0.03)), [1.3, 1.34], [CAB0 + 0.35, CAB0 + 0.5], 0.01, { sw: 'chrome' });
      P.cyl('detail', [s * (W2 + 0.04), 1.4, CABF - 0.15], 0.016, 0.9, 'y', { sw: 'chrome', seg: 8 });
    }
  });
  if (q < 2) {
    // cab interior: dash, two wheels (left seated, right stand-up), seats, the engine doghouse
    P.box('detail', [-W2 + 0.1, W2 - 0.1], [1.25, 1.6], [CABF - 0.55, CABF - 0.12], 0.05, { sw: 'dash' });
    P.box('detail', [-0.3, 0.3], [0.6, 1.25], [CAB0 + 0.1, CABF - 0.6], 0.08, { sw: 'dash' });
    for (const x of [0.65, -0.65]) P.cyl('detail', [x, 1.78, CABF - 0.62], 0.22, 0.04, 'y', { sw: 'satinBlack' });
    P.box('detail', [0.35, 0.95], [1.1, 2.15], [CAB0 + 0.12, CAB0 + 0.32], 0.06, { sw: 'seatBlack' });
    P.box('detail', [-W2 + 0.1, W2 - 0.1], [WTOP - 0.01, WTOP], [CAB0 + 0.05, CABF - 0.1], 0, { sw: 'interiorWall' });
  }
  // cab lining: the floor at the beltline shelf, the back wall, the door panels (grey trim, not body white)
  P.box('detail', [-W2 + 0.1, W2 - 0.1], [BELT + 0.002, BELT + 0.012], [CAB0 + 0.06, CABF - 0.14], 0, { sw: 'vinylGrey' });
  P.box('detail', [-W2 + 0.1, W2 - 0.1], [BELT, WTOP], [CAB0 + 0.061, CAB0 + 0.07], 0, { sw: 'darkGrey' });
  P.both((s) => P.box('detail', sort(s * (W2 - 0.11), s * (W2 - 0.1)), [BELT, BELT + 0.25], [CAB0 + 0.3, CABF - 0.2], 0, { sw: 'darkGrey' }));
  // ---------------- front: grille, lamps, bumper, steps, mirrors, beacons
  P.box('detail', [-0.48, 0.48], [0.72, 1.32], [CABF - 0.02, CABF + 0.02], 0.03, { sw: 'chrome' });
  P.box('detail', [-0.42, 0.42], [0.76, 1.28], [CABF + 0.0, CABF + 0.03], 0.01, { sw: 'satinBlack' });
  if (q < 2) for (let k = 0; k < 7; k++) P.box('detail', [-0.42, 0.42], [0.79 + k * 0.07, 0.81 + k * 0.07], [CABF + 0.02, CABF + 0.04], 0.004, { sw: 'steel' });
  P.both((s) => {
    P.box('lampInner', sort(s * 0.7, s * 1.06), [0.8, 1.08], [CABF - 0.03, CABF + 0.01], 0.02);
    for (const x of [0.79, 0.97]) P.box('lamp', sort(s * (x - 0.075), s * (x + 0.075)), [0.86, 1.02], [CABF + 0.0, CABF + 0.02], 0.02, { lamp: ROLE.head });
    P.box('lens', sort(s * 0.71, s * 1.05), [0.81, 1.07], [CABF + 0.02, CABF + 0.03], 0.02);
    P.box('lamp', sort(s * 1.08, s * 1.2), [0.84, 1.04], [CABF - 0.04, CABF + 0.02], 0.02, { lamp: s > 0 ? ROLE.fbl : ROLE.fbr });
    // west coast mirrors on arms, convex mirror on a stalk at the front corner
    P.box('detail', sort(s * W2, s * (W2 + 0.3)), [2.0, 2.03], [CABF - 0.16, CABF - 0.13], 0.01, { sw: 'chrome' });
    P.box('detail', sort(s * W2, s * (W2 + 0.3)), [1.62, 1.65], [CABF - 0.16, CABF - 0.13], 0.01, { sw: 'chrome' });
    P.box('detail', sort(s * (W2 + 0.26), s * (W2 + 0.4)), [1.5, 2.12], [CABF - 0.2, CABF - 0.08], 0.03, { sw: 'satinBlack' });
    P.box('detail', sort(s * (W2 + 0.27), s * (W2 + 0.39)), [1.52, 2.1], [CABF - 0.215, CABF - 0.2], 0.01, { sw: 'mirror' });
    P.cyl('detail', [s * (W2 + 0.12), 2.42, CABF + 0.18], 0.14, 0.07, 'z', { sw: 'satinBlack', r2: 0.11 });
    P.cyl('detail', [s * (W2 + 0.12), 2.42, CABF + 0.22], 0.125, 0.01, 'z', { sw: 'mirror' });
    if (q < 2) P.box('detail', sort(s * (W2 - 0.1), s * (W2 + 0.12)), [2.4, 2.43], [CABF - 0.1, CABF + 0.16], 0.01, { sw: 'satinBlack' });
    // amber strobes on the cab roof corners
    P.cyl('detail', [s * 0.95, CROOF + 0.06, CABF - 0.3], 0.07, 0.12, 'y', { sw: 'amberLens', r2: 0.055 });
    // entry step under the door
    P.box('detail', sort(s * (W2 - 0.25), s * (W2 + 0.02)), [0.38, 0.44], [CAB0 + 0.95, CABF - 0.25], 0.01, { sw: 'galv' });
  });
  P.box('detail', [-W2, W2], [0.4, 0.74], [CABF + 0.03, CABF + 0.17], 0.04, { sw: 'satinBlack' });
  if (q < 2) for (const [x, w] of [[-0.9, 0.07], [0.32, 0.05], [0.78, 0.09]]) P.box('detail', [x - w, x + w], [0.42, 0.5], [CABF + 0.17, CABF + 0.174], 0, { sw: 'rust' });
  // ---------------- chassis: frame rails, fuel tank, battery box, side guards, exhaust stack
  P.box('detail', [-0.48, 0.48], [0.78, 1.08], [-4.7, CABF - 0.1], 0.02, { sw: 'frame' });
  P.cyl('detail', [0.92, 0.82, 0.95], 0.3, 1.3, 'z', { sw: 'alu' });
  if (q < 2) {
    for (const z of [0.4, 1.5]) P.box('detail', [0.56, 1.24], [0.78, 0.84], [z - 0.03, z + 0.03], 0, { sw: 'frame' });
    P.box('detail', [-1.18, -0.6], [0.6, 1.05], [0.3, 1.8], 0.04, { sw: 'satinBlack' });
    // NYC side guards between the axles (white rails)
    P.both((s) => { for (const y of [0.48, 0.72]) P.box('detail', sort(s * 1.13, s * 1.19), [y, y + 0.07], [-0.65, FAX - 0.7], 0.01, { sw: 'rimWhite' }); });
  }
  // exhaust stack behind the cab, left side, with its heat shield
  P.cyl('detail', [0.95, 2.35, CAB0 - 0.1], 0.065, 2.5, 'y', { sw: 'steel' });
  P.cyl('detail', [0.95, 2.0, CAB0 - 0.1], 0.085, 0.9, 'y', { sw: 'satinBlack', seg: 12 });
  // access ladder on the body's left front
  if (q < 2) for (let k = 0; k < 5; k++) P.box('detail', [W2 - 0.02, W2 + 0.04], [1.25 + k * 0.3, 1.28 + k * 0.3], [BODYF - 0.75, BODYF - 0.35], 0.01, { sw: 'galv' });
  // ---------------- packer body: box with rounded top edges, rails, front wall over the cab
  P.box('paint', [-W2 + 0.01, W2 - 0.01], [BB, BT], [BODYR, BODYF], 0.16);
  P.box('detail', [-W2 + 0.04, W2 - 0.04], [BB - 0.1, BB + 0.02], [BODYR - 0.4, BODYF], 0.02, { sw: 'frame' });
  P.both((s) => {
    P.box('paint', sort(s * (W2 - 0.02), s * (W2 + 0.015)), [BT - 0.2, BT - 0.12], [BODYR + 0.05, BODYF - 0.05], 0.02);
    P.box('paint', sort(s * (W2 - 0.02), s * (W2 + 0.015)), [BB + 0.02, BB + 0.12], [BODYR + 0.05, BODYF - 0.05], 0.02);
    if (q < 2) for (const z of [-2.1, -0.6, 0.9, 2.2]) P.box('paint', sort(s * (W2 - 0.02), s * (W2 + 0.012)), [BB + 0.12, BT - 0.2], [z - 0.035, z + 0.035], 0.01);
    // rear fenders over each tandem axle, mud flaps behind it; the front wheel well liner and its inboard wall
    for (const z of [RA1, RA2]) P.latheX('detail', [s * 0.88, TR, z], [[0.62, 0.38], [0.62, -0.38]], { sw: 'satinBlack', phiStart: Math.PI, phiLength: Math.PI });
    P.latheX('detail', [s * 0.98, TR, FAX], [[0.6, 0.24], [0.6, -0.24]], { sw: 'grime', phiStart: Math.PI, phiLength: Math.PI });
    P.box('detail', sort(s * 0.7, s * 0.73), [TR, 1.2], [FAX - 0.62, Math.min(FAX + 0.62, CABF - 0.1)], 0, { sw: 'grime' });
    P.box('detail', sort(s * 0.62, s * 1.2), [0.28, 0.8], [RA2 - 0.72, RA2 - 0.7], 0.01, { sw: 'mudflap' });
  });
  // ---------------- tailgate / hopper: side plates, roof, the loading opening with the packer blade inside
  const TG = [[BODYR, BT], [-4.45, BT - 0.22], [-4.98, 2.42], [-5.0, 1.0], [-4.6, 0.82], [BODYR, 1.0]];
  P.both((s) => P.profile('paint', TG, ...sort(s * 0.98, s * W2), 0.05));
  P.profile('paint', [[BODYR, BT], [-4.45, BT - 0.22], [-4.98, 2.42], [-4.9, 2.3], [-4.35, 2.4], [BODYR, 2.6]], -0.98, 0.98, 0.03);
  // hopper floor (the curved sill the cans are tipped over), the sweep / packer blade, dirty inner walls
  P.profile('detail', [[-5.0, 1.0], [-4.6, 0.82], [-3.9, 0.95], [-3.9, 1.12], [-4.5, 1.02], [-4.92, 1.12]], -0.98, 0.98, 0, { sw: 'hopperSteel' });
  P.latheX('detail', [0, 1.95, -4.05], [[0.55, 0.97], [0.55, -0.97]], { sw: 'dirtyWhite', phiStart: Math.PI * 0.9, phiLength: Math.PI * 0.7 });
  P.box('detail', [-0.98, 0.98], [1.0, 2.45], [-3.95, -3.88], 0, { sw: 'hopperDirt' });
  P.both((s) => P.box('detail', sort(s * 0.96, s * 0.98), [0.9, 2.45], [-4.95, -3.9], 0, { sw: 'hopperDirt' }));
  // packer cylinders on the tailgate sides, grab handles and riding steps at the rear corners
  P.both((s) => {
    if (q < 2) {
      P.cyl('detail', [s * (W2 + 0.06), 2.55, -3.75], 0.06, 0.9, 'z', { sw: 'satinBlack', m: null });
      P.cyl('detail', [s * (W2 + 0.06), 2.55, -4.35], 0.035, 0.5, 'z', { sw: 'hydraulic' });
      P.cyl('detail', [s * (W2 - 0.08), 1.6, -5.05], 0.018, 1.0, 'y', { sw: 'chrome', seg: 8 });
    }
    P.box('detail', sort(s * 0.62, s * 1.18), [0.62, 0.67], [-5.32, -4.95], 0.01, { sw: 'galv' });
  });
  // rear lamps: the top bar (red tails / amber strobes), lower clusters (tail / brake, signal, reverse)
  for (const [x, role, sw] of [[1.05, ROLE.tail], [0.88, ROLE.tail], [0.18, 0, 'amberLens'], [0, 0, 'amberLens'], [-0.18, 0, 'amberLens'], [-0.88, ROLE.tail], [-1.05, ROLE.tail]]) {
    P.cyl('lampInner', [x, 3.03, -4.63], 0.075, 0.04, 'z', { m: null });
    if (role) P.cyl('lamp', [x, 3.03, -4.655], 0.062, 0.02, 'z', { lamp: role });
    else P.cyl('detail', [x, 3.03, -4.655], 0.062, 0.03, 'z', { sw });
  }
  P.both((s) => {
    P.box('lampInner', sort(s * 0.62, s * 1.18), [0.72, 0.98], [-5.06, -5.0], 0.02);
    P.cyl('lamp', [s * 1.06, 0.85, -5.07], 0.07, 0.02, 'z', { lamp: ROLE.tail });
    P.cyl('lamp', [s * 0.9, 0.85, -5.07], 0.07, 0.02, 'z', { lamp: s > 0 ? ROLE.rbl : ROLE.rbr });
    P.cyl('lamp', [s * 0.74, 0.85, -5.07], 0.055, 0.02, 'z', { lamp: ROLE.rev });
  });
  // ---------------- wheels: front singles, tandem duals
  const hubs = [];
  P.both((s) => {
    hubs.push(wheel(P, { x: s * 1.0, y: TR, z: FAX, r: TR, w: TW, id: s > 0 ? 1 : 2, side: s, rimSw: 'rimWhite', hubCap: true }));
    hubs.push(wheel(P, { x: s * 1.03, y: TR, z: RA1, r: TR, w: TW, id: s > 0 ? 3 : 4, side: s, rimSw: 'rimWhite', dual: true }));
    hubs.push(wheel(P, { x: s * 1.03, y: TR, z: RA2, r: TR, w: TW, id: s > 0 ? 5 : 6, side: s, rimSw: 'rimWhite', dual: true }));
  });
  hubs.sort((a, b) => a.id - b.id);
  return { P, hubs };
}

export const EXTRAS = { axles: 3, wheelLayout: '_WHEEL 1/2 front L/R, 3/4 first rear axle L/R, 5/6 rearmost axle L/R (tandem duals)' };

// ---- livery: white, the green department lettering and roundel, conspicuity tape, numbers; heavy working grime
export function liverySVG() {
  const lay = liveryLayout(SPEC.L, SPEC.W, SPEC.H), px = liveryPx(lay);
  const G = '#00684a';
  const t = [`<rect width='2048' height='2048' fill='#e8e8e4'/>`];
  const F = "font-family='Liberation Sans, Arial, sans-serif'";
  const NUM = '25DN-512';
  for (const s of [1, -1]) {
    const P = (z, y) => px.side(s, z, y);
    // department name (lower case) high on the front of the body
    { const [x, y] = P(s > 0 ? 2.0 : 1.4, 3.18); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='40' fill='${G}' text-anchor='middle'>sanitation</text>`); }
    // roundel: green disc, white ring, letters
    { const [cx, cy] = P(-0.75, 2.45), rx = 0.33 * px.mx, ry = 0.33 * px.my;
      t.push(`<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='${G}'/><ellipse cx='${cx}' cy='${cy}' rx='${rx * 0.86}' ry='${ry * 0.86}' fill='none' stroke='#fff' stroke-width='5'/>`);
      t.push(`<text x='${cx}' y='${cy + 10}' ${F} font-weight='bold' font-size='34' fill='#fff' text-anchor='middle'>DSNY</text>`);
      t.push(`<path d='M ${cx - rx * 0.5} ${cy - ry * 0.35} L ${cx + rx * 0.5} ${cy - ry * 0.35}' stroke='#fff' stroke-width='3'/>`); }
    // motto lines beside it
    for (const [k, w] of ['SAFETY', 'SERVICE', 'SUSTAINABILITY'].entries()) {
      const [x, y] = P(s > 0 ? -1.75 : 0.25, 2.62 - k * 0.15);
      t.push(`<text x='${x}' y='${y}' ${F} font-style='italic' font-weight='bold' font-size='21' fill='${G}' text-anchor='middle'>${w}</text>`);
    }
    // message placard in its frame near the body front
    { const [x0, y0] = P(s > 0 ? 2.25 : 1.15, 2.95), [x1, y1] = P(s > 0 ? 1.15 : 2.25, 2.05);
      t.push(`<rect x='${x0 - 6}' y='${y0 - 6}' width='${x1 - x0 + 12}' height='${y1 - y0 + 12}' fill='#cfd2d2' stroke='#9a9c9c' stroke-width='3'/>`);
      t.push(`<rect x='${x0}' y='${y0}' width='${x1 - x0}' height='${y1 - y0}' fill='#7fc4e8'/><rect x='${x0}' y='${y0 + (y1 - y0) * 0.62}' width='${x1 - x0}' height='${(y1 - y0) * 0.38}' fill='${G}'/>`);
      t.push(`<text x='${(x0 + x1) / 2}' y='${y0 + (y1 - y0) * 0.33}' ${F} font-weight='bold' font-size='30' fill='#fff' text-anchor='middle'>RECYCLE</text>`);
      t.push(`<text x='${(x0 + x1) / 2}' y='${y0 + (y1 - y0) * 0.52}' ${F} font-weight='bold' font-size='22' fill='#fff' text-anchor='middle'>EVERY WEEK</text>`);
      t.push(`<text x='${(x0 + x1) / 2}' y='${y0 + (y1 - y0) * 0.86}' ${F} font-weight='bold' font-size='18' fill='#fff' text-anchor='middle'>nyc.gov/sanitation</text>`); }
    // fleet number on the cab door and the lower body
    { const [x, y] = P(3.95, 1.32); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='26' fill='#111' text-anchor='middle'>${NUM}</text>`); }
    { const [x, y] = P(s > 0 ? -2.6 : 2.2, 1.45); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='30' fill='#111' text-anchor='middle'>${NUM}</text>`); }
    // conspicuity tape: alternating red / white along the body's lower rail and the tailgate's lower edge
    for (let z = 2.75; z > -4.9; z -= 0.3) {
      const [xa, ya] = P(z, 1.31), [xb] = P(z - 0.15, 1.31);
      t.push(`<rect x='${Math.min(xa, xb)}' y='${ya}' width='${Math.abs(xb - xa)}' height='${0.05 * px.my}' fill='#d0141a'/>`);
    }
  }
  // rear: chevron frame on the tailgate, number, district
  {
    const R = (x, y) => px.rear(x, y);
    const [x0, y0] = R(1.22, 3.3), [x1, y1] = R(-1.22, 1.0);
    for (let k = 0; k < 14; k++) {
      const yy = y0 + ((y1 - y0) * k) / 14, h = (y1 - y0) / 28;
      for (const xx of [x0, x1 - 0.12 * px.fx]) t.push(`<polygon points='${xx},${yy + h} ${xx + 0.12 * px.fx},${yy} ${xx + 0.12 * px.fx},${yy + h * 1.0} ${xx},${yy + 2 * h}' fill='#d0141a'/>`);
    }
    const [xn, yn] = R(0.55, 2.62); t.push(`<text x='${xn}' y='${yn}' ${F} font-style='italic' font-weight='bold' font-size='30' fill='#111' text-anchor='middle'>${NUM}</text>`);
    const [xd, yd] = R(-0.75, 2.62); t.push(`<text x='${xd}' y='${yd}' ${F} font-weight='bold' font-size='32' fill='#111' text-anchor='middle'>M.10</text>`);
    const [xc, yc] = R(0, 2.6); t.push(`<ellipse cx='${xc}' cy='${yc - 8}' rx='16' ry='12' fill='${G}'/>`);
    // the hopper area runs darker: a brown wash over the lower rear
    const [ha, hb] = R(1.22, 2.45), [hc, hd] = R(-1.22, 0.8);
    t.push(`<rect x='${ha}' y='${hb}' width='${hc - ha}' height='${hd - hb}' fill='#5a5042' opacity='0.35'/>`);
  }
  // front: the number over the windshield
  { const [x, y] = px.front(0, 2.66); t.push(`<text x='${x}' y='${y}' ${F} font-weight='bold' font-size='28' fill='#111' text-anchor='middle'>${NUM}</text>`); }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='2048' height='2048'>${t.join('')}</svg>`;
}

export async function livery(file) { return rasterLivery(liverySVG(), file, { grime: 0.55, streaks: 0.42, seed: 11 }); }
