// MTA New Flyer Xcelsior XD60, Select Bus Service livery (the 2016 NYCT SBS scheme: light blue body, MTA blue roof
// line with the gold swoosh, yellow rear cap), drawn from scratch as SVG and rasterised with sharp. Look references
// (never sampled into a texture): Wikimedia Commons photographs listed in docs/notes/ar34-veh-bus60.md.
//
// paint atlas, 2048 x 2048, UV origin top-left (glTF):
//   rows 0..3 (512 px each, 1688 px wide): the side elevations at 180 px/m, y from 3.00 m (row top) down to 0.16 m:
//     0 left side, front body (front at the image left)   1 left side, rear body (front at the left)
//     2 right side, front body (front at the image RIGHT) 3 right side, rear body (front at the right)
//   right column (x 1690..2047): front face at 130 px/m (1690, 0), rear face (1690, 400), flat swatches from y 800
// detail atlas, 1024 x 1024: flat swatches (16 x 8 cells of 64 px in the top half) and the LED signs (bottom half)
export const PX = 180, ROWH = 512, COLX = 1690, EPX = 130;
export const C = {
  cyan: '#6cc7e0', blue: '#21469c', blueDeep: '#173679', gold: '#e9b52a', yellow: '#f0be1a', white: '#f4f6f6',
  black: '#0d0f11', bumper: '#1b1e22',
};
// swatches in the paint atlas (cell centres, px)
export const PSW = { blue: [1720, 830], cyan: [1780, 830], black: [1840, 830], yellow: [1900, 830], white: [1960, 830], grey: [2020, 830] };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = "Liberation Sans, Arial, Helvetica, sans-serif";

// "+selectbusservice": bold "select" and "bus", light "service", one run, cap height h (m) -> px scale s
function sbsWordmark(x, y, h, s, anchor = 'start', fill = C.white) {
  const fs = (h / 0.72) * s;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${fs.toFixed(1)}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${(-0.01 * fs).toFixed(2)}">`
    + `<tspan font-weight="700">+select</tspan><tspan font-weight="700">bus</tspan><tspan font-weight="400">service</tspan></text>`;
}
// MTA roundel: a white disc with the letters knocked out in the body colour (drawn, not copied)
function mtaRoundel(cx, cy, r, ground) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.white}"/>`
    + `<text x="${cx - r * 0.06}" y="${cy + r * 0.3}" font-family="${FONT}" font-weight="700" font-style="italic" font-size="${(r * 0.95).toFixed(1)}" fill="${ground}" text-anchor="middle" letter-spacing="${(-r * 0.05).toFixed(1)}">MTA</text>`;
}

// one side elevation row. sec: { zA (front end), zB (rear end) }, right: the door side (front at the image right)
// wheels: axle z list inside this section; doors: [z0, z1] list (door side only)
export function sideRow(r, sec, right, wheels, fleetNo, opts = {}) {
  const y0 = r * ROWH;
  const len = sec.zA - sec.zB;
  const X = (z) => (right ? (z - sec.zB) : (sec.zA - z)) * PX;        // px from the row's left edge
  const Y = (y) => y0 + (3.0 - y) * PX;
  const w = len * PX;
  const front = !!opts.front;
  let s = '';
  // base: blue above the window band, black band, light blue below
  s += `<rect x="0" y="${y0}" width="${w + 8}" height="${ROWH}" fill="${C.blue}"/>`;
  s += `<rect x="0" y="${Y(2.40)}" width="${w + 8}" height="${(2.40 - 1.14) * PX}" fill="${C.black}"/>`;
  s += `<rect x="0" y="${Y(1.14)}" width="${w + 8}" height="${(1.14 - 0.16) * PX}" fill="${C.cyan}"/>`;
  // a hair of gloss black under the window band (the rubber line where the band meets the skirt panels)
  s += `<rect x="0" y="${Y(1.14)}" width="${w + 8}" height="2" fill="#0a2a33" opacity="0.6"/>`;
  // lower swoosh: an MTA-blue wave with a gold hairline, rising toward the rear of the body (6192, both bodies)
  {
    const zs = sec.zB + len * 0.62, ze = sec.zB + 0.05;
    const a = [X(zs), Y(1.05)], b = [X(sec.zB + len * 0.32), Y(0.62)], c = [X(ze), Y(0.98)];
    const t = 0.13 * PX;
    s += `<path d="M ${a[0]} ${a[1]} Q ${b[0]} ${b[1]} ${c[0]} ${c[1]} L ${c[0]} ${c[1] + t} Q ${b[0]} ${b[1] + t * 1.15} ${a[0]} ${a[1] + 3} Z" fill="${C.blue}"/>`;
    s += `<path d="M ${a[0]} ${a[1] - 6} Q ${b[0]} ${b[1] - 8} ${c[0]} ${c[1] - 7}" stroke="${C.gold}" stroke-width="4" fill="none"/>`;
    s += `<path d="M ${a[0]} ${a[1] - 1} Q ${b[0]} ${b[1] - 2} ${c[0]} ${c[1] - 2}" stroke="${C.white}" stroke-width="2" fill="none" opacity="0.85"/>`;
  }
  // upper swoosh on the front body: light blue under a gold stripe that rises from the front corner and falls back
  // onto the window band ~4.6 m behind the front (6192, M15 6107)
  if (front) {
    const p0 = [X(sec.zA + 0.02), Y(2.47)], p1 = [X(sec.zA - 2.3), Y(2.80)], p2 = [X(sec.zA - 4.7), Y(2.40)];
    s += `<path d="M ${p0[0]} ${Y(2.40)} L ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} Z" fill="url(#upg${r})"/>`;
    s += `<path d="M ${p0[0]} ${p0[1] - 2} Q ${p1[0]} ${p1[1] - 4} ${p2[0]} ${p2[1] - 2}" stroke="${C.gold}" stroke-width="${0.075 * PX}" fill="none"/>`;
    s += `<path d="M ${p0[0]} ${p0[1] + 6} Q ${p1[0]} ${p1[1] + 5} ${p2[0]} ${p2[1] + 4}" stroke="${C.white}" stroke-width="2.5" fill="none" opacity="0.9"/>`;
    // fleet number in white on the light part
    s += `<text x="${X(sec.zA - 1.25)}" y="${Y(2.47)}" font-family="${FONT}" font-weight="700" font-size="${(0.15 / 0.72) * PX}" fill="${C.white}" text-anchor="middle">${fleetNo}</text>`;
  } else {
    // rear body: a gold hairline along the roof edge over the first metres behind the joint
  }
  // wordmarks: lower body behind the front wheel, upper band near the joint (6192)
  if (front) {
    s += sbsWordmark(X(sec.zA - (right ? 5.3 : 5.1)), Y(0.98), 0.085, PX, 'start');
    // "New York City Bus" with the roundel ahead of the front wheel (left side) / on the panel behind the door (right)
    const zn = right ? sec.zA - 1.55 : sec.zA - 1.05;
    s += mtaRoundel(X(zn) + (right ? -0.0 : 0), Y(0.82), 0.10 * PX, C.cyan);
    s += `<text x="${X(zn) + 0.14 * PX}" y="${Y(0.82) + 0.035 * PX}" font-family="${FONT}" font-weight="700" font-size="${(0.07 / 0.72) * PX}" fill="${C.white}">New York City Bus</text>`;
    s += sbsWordmark(X(sec.zB + 1.1), Y(2.60), 0.06, PX, 'middle');
  } else {
    s += sbsWordmark(X(sec.zA - 2.6), Y(0.95), 0.085, PX, 'middle');
    // US flag decal on the rear body's upper band (left side, 6192)
    if (!right) {
      const fx = X(sec.zA - 6.9), fy = Y(2.36), fw = 0.36 * PX, fh = 0.19 * PX;
      s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#b22234"/>`;
      for (let k = 1; k < 13; k += 2) s += `<rect x="${fx}" y="${fy + (k * fh) / 13}" width="${fw}" height="${fh / 13}" fill="#fff"/>`;
      s += `<rect x="${fx}" y="${fy}" width="${fw * 0.4}" height="${(fh * 7) / 13}" fill="#3c3b6e"/>`;
    }
  }
  // panel seams: thin dark lines (bonded panels with joins every ~1.2 m on the skirts) and the skirt's bottom lip
  for (let z = sec.zB + 0.6; z < sec.zA - 0.4; z += 1.22) s += `<rect x="${X(z)}" y="${Y(1.12)}" width="1.5" height="${(1.12 - 0.3) * PX}" fill="#2d6a78" opacity="0.55"/>`;
  s += `<rect x="0" y="${Y(0.33)}" width="${w + 8}" height="${0.03 * PX}" fill="#3d8597" opacity="0.6"/>`;
  // grime gradient toward the skirts (road film; the runtime adds its own on top)
  s += `<rect x="0" y="${Y(0.62)}" width="${w + 8}" height="${(0.62 - 0.16) * PX}" fill="url(#grime)"/>`;
  return s;
}

export function paintAtlasSVG(cfg) {
  const { secF, secR, axles, doors, fleetNo } = cfg;
  let defs = '<defs>';
  for (let r = 0; r < 4; r++) defs += `<linearGradient id="upg${r}" x1="${r >= 2 ? 1 : 0}" y1="0" x2="${r >= 2 ? 0 : 1}" y2="0"><stop offset="0" stop-color="#5cbfe0"/><stop offset="0.55" stop-color="#3d8fd0"/><stop offset="1" stop-color="${C.blue}"/></linearGradient>`;
  defs += `<linearGradient id="grime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a32" stop-opacity="0"/><stop offset="1" stop-color="#3a3a32" stop-opacity="0.28"/></linearGradient>`;
  defs += `<linearGradient id="rgrime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a32" stop-opacity="0"/><stop offset="1" stop-color="#2a2a24" stop-opacity="0.35"/></linearGradient>`;
  defs += '</defs>';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">${defs}<rect width="2048" height="2048" fill="${C.blue}"/>`;
  s += sideRow(0, secF, false, axles, fleetNo, { front: true });
  s += sideRow(1, secR, false, axles, fleetNo, {});
  s += sideRow(2, secF, true, axles, fleetNo, { front: true });
  s += sideRow(3, secR, true, axles, fleetNo, {});
  // ---- front face (viewer's left = the bus's right side; x px = (x + 1.295) * EPX), y from 3.00 down to 0.30
  {
    const ox = COLX, oy = 0, W = 2.59 * EPX;
    const X = (x) => ox + (x + 1.295) * EPX, Y = (y) => oy + (3.0 - y) * EPX;
    s += `<rect x="${ox}" y="${oy}" width="${W}" height="${2.7 * EPX}" fill="${C.cyan}"/>`;
    s += `<rect x="${ox}" y="${Y(2.98)}" width="${W}" height="${(2.98 - 2.74) * EPX}" fill="${C.blue}"/>`;
    s += `<rect x="${ox}" y="${Y(2.74)}" width="${W}" height="${(2.74 - 1.18) * EPX}" fill="${C.black}"/>`;
    // the gold swoosh's front end wraps the corner on the viewer's right (bus left) at the roof line
    s += `<path d="M ${X(0.95)} ${Y(2.98)} Q ${X(1.2)} ${Y(2.80)} ${X(1.3)} ${Y(2.70)} L ${X(1.3)} ${Y(2.98)} Z" fill="${C.gold}"/>`;
    s += `<path d="M ${X(-0.95)} ${Y(2.98)} Q ${X(-1.2)} ${Y(2.80)} ${X(-1.3)} ${Y(2.70)} L ${X(-1.3)} ${Y(2.98)} Z" fill="${C.gold}"/>`;
    s += mtaRoundel(X(0), Y(1.03), 0.075 * EPX, C.cyan);
    s += sbsWordmark(X(0), Y(0.80), 0.085, EPX, 'middle');
    s += `<text x="${X(-1.0)}" y="${Y(1.03)}" font-family="${FONT}" font-weight="700" font-size="${(0.09 / 0.72) * EPX}" fill="${C.white}">${fleetNo}</text>`;
    // the nose panel's styling crease above the bumper
    s += `<path d="M ${X(-0.75)} ${Y(0.62)} Q ${X(0)} ${Y(0.58)} ${X(0.75)} ${Y(0.62)}" stroke="#4fa3bb" stroke-width="2" fill="none"/>`;
    s += `<rect x="${ox}" y="${Y(0.62)}" width="${W}" height="${0.32 * EPX}" fill="url(#rgrime)"/>`;
  }
  // ---- rear face (viewer's left = the bus's left side; x px = (1.295 - x) * EPX)
  {
    const ox = COLX, oy = 400, W = 2.59 * EPX;
    const X = (x) => ox + (1.295 - x) * EPX, Y = (y) => oy + (3.0 - y) * EPX;
    s += `<rect x="${ox}" y="${oy}" width="${W}" height="${2.7 * EPX}" fill="${C.yellow}"/>`;
    s += `<rect x="${ox}" y="${Y(1.16)}" width="${W}" height="${(1.16 - 0.30) * EPX}" fill="${C.cyan}"/>`;
    s += `<rect x="${ox}" y="${Y(1.17)}" width="${W}" height="2" fill="#7a6a10"/>`;
    s += sbsWordmark(X(0), Y(0.88), 0.09, EPX, 'middle');
    s += mtaRoundel(X(0.95), Y(2.42), 0.06 * EPX, C.yellow);
    s += `<text x="${X(0.86)}" y="${Y(2.42) + 0.02 * EPX}" font-family="${FONT}" font-weight="700" font-size="${(0.05 / 0.72) * EPX}" fill="#1a2a5a">New York City Bus</text>`;
    s += `<text x="${X(-0.95)}" y="${Y(2.36)}" font-family="${FONT}" font-weight="700" font-size="${(0.12 / 0.72) * EPX}" fill="#111" text-anchor="end">${fleetNo}</text>`;
    // engine-bay louvre band across the yellow (the rear door of the engine compartment)
    for (let k = 0; k < 9; k++) s += `<rect x="${X(0.55)}" y="${Y(1.95 - k * 0.07)}" width="${1.1 * EPX}" height="3" fill="#9a7c08" opacity="0.7"/>`;
    s += `<rect x="${ox}" y="${Y(0.62)}" width="${W}" height="${0.32 * EPX}" fill="url(#rgrime)"/>`;
  }
  // ---- swatches
  const sw = (k, col) => { const [cx, cy] = PSW[k]; s += `<rect x="${cx - 28}" y="${cy - 28}" width="56" height="56" fill="${col}"/>`; };
  sw('blue', C.blue); sw('cyan', C.cyan); sw('black', C.black); sw('yellow', C.yellow); sw('white', C.white); sw('grey', '#8c9196');
  s += '</svg>';
  return s;
}

// ---------------------------------------------------------------- detail atlas
// swatch table: name -> [sRGB colour, roughness, metalness, emissive sRGB or null]
export const DSW = {
  black: ['#0c0d0f', 0.55, 0, null], rubber: ['#0b0b0c', 0.88, 0, null], rim: ['#a9adb2', 0.32, 1, null],
  hub: ['#5a4a3c', 0.6, 0.6, null], chrome: ['#d9dcdf', 0.12, 1, null], frame: ['#060708', 0.38, 0, null],
  bellows: ['#3a3836', 0.82, 0, null], seat: ['#2c3448', 0.7, 0, null], floor: ['#4c4f52', 0.85, 0, null],
  wall: ['#a9adb0', 0.6, 0, null], ceiling: ['#c9cccc', 0.55, 0, null], stanchion: ['#e2b417', 0.35, 0.2, null],
  ledstrip: ['#f4f2ea', 0.4, 0, '#fff7e8'], amberlamp: ['#d98a12', 0.25, 0, '#ff9a10'], redlamp: ['#a8140e', 0.25, 0, '#ff2010'],
  mirror: ['#b8bcc0', 0.05, 1, null], dash: ['#16181b', 0.6, 0, null], farebox: ['#5c6166', 0.4, 0.7, null],
  bumper: ['#1b1e22', 0.62, 0, null], under: ['#101112', 0.95, 0, null], turntable: ['#26282a', 0.5, 0.6, null],
  reflector: ['#c0281c', 0.3, 0, null], chevW: ['#e8e8e8', 0.5, 0, null], chevR: ['#c4161c', 0.5, 0, null],
  steel: ['#3a3d40', 0.45, 0.8, null], grille: ['#141516', 0.7, 0.3, null], wiper: ['#0e0f10', 0.5, 0.2, null],
  driverbarrier: ['#1e2124', 0.4, 0.4, null], screen: ['#0a1a28', 0.2, 0, '#1a3a5a'],
};
const DNAMES = Object.keys(DSW);
// cell centre in UV for a detail swatch
export function dswUV(name) {
  const i = DNAMES.indexOf(name);
  if (i < 0) throw new Error('no detail swatch ' + name);
  const cx = (i % 16) * 64 + 32, cy = Math.floor(i / 16) * 64 + 32;
  return [cx / 1024, cy / 1024];
}
// LED signs in the bottom half: rects in px [x, y, w, h]
export const SIGNS = {
  front: [16, 528, 992, 128],     // the windshield head sign
  side: [16, 672, 640, 96],       // the door-side window sign
  rear: [672, 672, 336, 96],      // the rear route number
  run: [16, 784, 160, 64],        // the run number in the windshield's lower corner
  tyre: [192, 784, 512, 64],      // tyre sidewall band (lettering)
};
function ledText(rect, text, { bg = '#000', fg = '#ffb020', size = 0.62, glow = false, weight = 700, spacing = 0 } = {}) {
  const [x, y, w, h] = rect;
  const fs = h * size;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>`;
  s += `<text x="${x + w / 2}" y="${y + h / 2 + fs * 0.36}" font-family="Liberation Sans Narrow, ${FONT}" font-weight="${weight}" font-size="${fs}" fill="${fg}" text-anchor="middle" letter-spacing="${spacing}"${glow ? '' : ''}>${esc(text)}</text>`;
  // the LED pitch: a dark grid over the sign (dots, not strokes)
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#ledgrid)"/>`;
  return s;
}
export function detailAtlasSVG(mode, route) {
  // mode: 'color' | 'mr' | 'emit'
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>`
    + `<pattern id="ledgrid" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="1.8" fill="#000" opacity="0.6"/><rect width="1.8" height="6" fill="#000" opacity="0.6"/></pattern>`
    + `<mask id="m"><rect width="6" height="6" fill="#fff"/></mask></defs>`;
  const bgAll = mode === 'color' ? '#202224' : mode === 'mr' ? 'rgb(255,140,0)' : '#000';
  s += `<rect width="1024" height="1024" fill="${bgAll}"/>`;
  DNAMES.forEach((k, i) => {
    const [col, rough, metal, emit] = DSW[k];
    const x = (i % 16) * 64, y = Math.floor(i / 16) * 64;
    let fill;
    if (mode === 'color') fill = col;
    else if (mode === 'mr') fill = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
    else fill = emit || '#000';
    s += `<rect x="${x}" y="${y}" width="64" height="64" fill="${fill}"/>`;
  });
  // signs: the colour map and the emissive map carry the same LEDs (the base colour shows by day, the emissive at night)
  const signs = [
    ['front', `${route} +SELECT BUS`, { bg: '#1aa7d8', fg: '#ffb21c', size: 0.66, spacing: 2 }],
    ['side', `${route} +SELECT BUS`, { bg: '#060606', fg: '#ffa418', size: 0.62, spacing: 1 }],
    ['rear', route, { bg: '#060606', fg: '#ffa418', size: 0.72, spacing: 2 }],
    ['run', '512', { bg: '#060606', fg: '#ffa418', size: 0.7, spacing: 1 }],
  ];
  for (const [k, txt, o] of signs) {
    if (mode === 'mr') { const [x, y, w, h] = SIGNS[k]; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(255,90,0)"/>`; continue; }
    if (mode === 'emit') s += ledText(SIGNS[k], txt, { ...o, bg: o.bg === '#060606' ? '#000' : '#0b5e86', fg: '#ffa516' });
    else s += ledText(SIGNS[k], txt, o);
  }
  // tyre sidewall band: black rubber with faint moulded lettering
  {
    const [x, y, w, h] = SIGNS.tyre;
    if (mode === 'color') {
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0c0c0d"/>`;
      s += `<text x="${x + w * 0.25}" y="${y + h * 0.66}" font-family="${FONT}" font-weight="700" font-size="${h * 0.5}" fill="#1c1c1e" text-anchor="middle">TRANSIT XT</text>`;
      s += `<text x="${x + w * 0.75}" y="${y + h * 0.66}" font-family="${FONT}" font-weight="700" font-size="${h * 0.42}" fill="#1c1c1e" text-anchor="middle">305/70R22.5</text>`;
    } else if (mode === 'mr') s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(255,225,0)"/>`;
  }
  s += '</svg>';
  return s;
}
export function signUV(name, u, v) {
  // u, v in 0..1 across the sign rect -> atlas UV (inset half a pixel)
  const [x, y, w, h] = SIGNS[name];
  return [(x + 1 + u * (w - 2)) / 1024, (y + 1 + v * (h - 2)) / 1024];
}
