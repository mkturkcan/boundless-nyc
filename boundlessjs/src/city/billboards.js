// Times Square billboard district — large lit ad panels on the tall frontages
// around the Square, drawn on one shared canvas atlas that repaints every few
// seconds so the boards animate. One draw call for the whole district.
//
// Critic round 5 defect #19 / §3 #8: "EVERY TIMES SQUARE BILLBOARD IS A BLANK
// GREY RECTANGLE — about eight flat pale panels with a small dark post under
// each, on the one facade in New York that is nothing but screens." The old
// atlas was four 512² cells carrying a two-stop gradient, five translucent
// stripes and ONE word, on a MeshBasicMaterial with no night response — so at
// day exposure a board sat at the same value as the limestone behind it and
// read as a blank panel, and only four designs existed for the whole district.
//
// Now: SIXTEEN 512² designs on a 2048² sheet, five poster archetypes with real
// typographic hierarchy (wordmark / kicker / rule / footer), a screen archetype
// with scanlines and a ticker, a per-repaint reshuffle so no two boards match
// for long, and a shader that lifts the panel above the scene's exposure by day
// and makes it a light source at night (bloom threshold is 1.35 linear, so the
// brightest boards flare).
//
// NO REAL BRANDS OR LOGOS. Every wordmark below is an invented name and every
// line of copy is generic. Division of labour: street furniture panels are
// `panelArt.js`, storefront fascias are `fasciaAtlas.js` + the facade shader,
// street-name blades are `signText.js`, this file is the Square's big boards.
import * as THREE from 'three';
import { project } from '../shared/geo.js';
import { ENV } from '../world/materials.js';
import { paintAd, adsFor, adId, loadAdFonts, AD_COUNT, hs as ahs } from './adArt.js';

const TSQ = project(-73.9866, 40.7575); // Times Square
const AW = 2048, AH = 2048, GRID = 4, CELL = AW / GRID; // 16 cells of 512
let tex = null, mat = null, animOn = false;

// Invented wordmarks, each with a category that picks its archetype and copy.
// Nothing here is a real company, product, show or slogan.
const BRANDS = [
  ['VERIDIAN', 'drink', '#0f6b3a', '#f2ffe8'],
  ['HALCYON', 'show', '#1a1030', '#ffd94a'],
  ['KESTREL', 'air', '#0e2f6e', '#ffffff'],
  ['OBSIDIA', 'tech', '#101014', '#4ad9ff'],
  ['MERIDIA', 'watch', '#2b2118', '#e8d8b0'],
  ['CINDERPEAK', 'shoe', '#b0210f', '#fff2d8'],
  ['AURELIA', 'scent', '#f0e6d8', '#2a2118'],
  ['NIMBUS', 'transit', '#0f5a72', '#eaffff'],
  ['SABLEWOOD', 'show', '#3a0f1e', '#f6d8a8'],
  ['LUMENCO', 'tech', '#141a30', '#8ab4ff'],
  ['TOPAZ LINE', 'air', '#7a0fa8', '#ffffff'],
  ['ELDERGLASS', 'drink', '#8a3a0f', '#ffe9c0'],
  ['QUARRY & CO', 'shoe', '#1c2a1c', '#dcf0c0'],
  ['PALEBLUE', 'scent', '#dfe8f0', '#1e2a3a'],
  ['VANTA', 'watch', '#18181c', '#c8ccd4'],
  ['STILLWATER', 'show', '#0b2438', '#9fe8ff'],
];
const COPY = {
  drink: ['COLD. ALWAYS.', 'NEW SMALL BATCH', 'TASTE THE SEASON'],
  show: ['NOW PLAYING', 'OPENS THIS FALL', 'FINAL WEEKS'],
  air: ['NONSTOP DAILY', 'MORE ROOM. MORE SKY.', 'FLY THE QUIET WAY'],
  tech: ['SEE FURTHER', 'BUILT FOR THE DARK', 'ONE DEVICE. ALL DAY.'],
  watch: ['MADE TO LAST', 'SINCE THE FIRST TIDE', 'TIME, KEPT'],
  shoe: ['RUN THE GRID', 'MILE AFTER MILE', 'MADE FOR PAVEMENT'],
  scent: ['A QUIETER MORNING', 'EAU DE PARFUM', 'WEAR THE WEATHER'],
  transit: ['EVERY 4 MINUTES', 'ACROSS THE RIVER', 'GO WITHOUT DRIVING'],
};
const FOOT = ['42ND & BROADWAY', 'TONIGHT', 'ON NOW', 'THIS WEEK ONLY',
  'SEE MORE IN STORE', 'STREAMING NOW', 'DOWNTOWN 8PM'];

function rnd(a) { return a[(Math.random() * a.length) | 0]; }

// relative luminance of a #rrggbb colour (0..1)
function lumOf(h) {
  const v = parseInt(h.slice(1), 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function drawCell(c, ox, oy) {
  let [name, cat, bg, fg] = rnd(BRANDS);
  // TS28: at night a pale field lifted to a light source is a white sheet (PALEBLUE and AURELIA read as blank white
  // glare in the survey stills): the Square's screens at night are dark fields with the light in the type, so a pale
  // board swaps its two colours after dark
  if (TS28 && ENV.night.value > 0.5 && lumOf(bg) > 0.55) [bg, fg] = [fg, bg];
  const kind = (Math.random() * 6) | 0;
  const S = CELL;
  c.save();
  c.beginPath(); c.rect(ox, oy, S, S); c.clip();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const fit = (t, size, weight, fam, wMax) => {
    let s = size;
    c.font = `${weight} ${s}px ${fam}`;
    while (c.measureText(t).width > wMax && s > 8) { s -= 2; c.font = `${weight} ${s}px ${fam}`; }
    return s;
  };
  const SANS = '"Helvetica Neue", Arial, sans-serif';
  const copy = rnd(COPY[cat]), foot = rnd(FOOT), showLine = rnd(COPY.show);
  const SERIF = 'Georgia, "Times New Roman", serif';

  if (kind === 5) {
    // ---- LED SCREEN: scanlines, a huge numeral, a ticker strip. The one
    // archetype that has to look emitted rather than printed.
    c.fillStyle = '#05070c'; c.fillRect(ox, oy, S, S);
    for (let y = 0; y < S; y += 3) {
      c.fillStyle = `rgba(${20 + ((y * 7) % 40)},${40 + ((y * 11) % 60)},${90 + ((y * 13) % 90)},0.5)`;
      c.fillRect(ox, oy + y, S, 2);
    }
    const g = c.createRadialGradient(ox + S * 0.5, oy + S * 0.42, 10, ox + S * 0.5, oy + S * 0.42, S * 0.6);
    g.addColorStop(0, 'rgba(120,220,255,0.55)');
    g.addColorStop(1, 'rgba(6,10,20,0.0)');
    c.fillStyle = g; c.fillRect(ox, oy, S, S);
    const big = `${1 + ((Math.random() * 9) | 0)}${(Math.random() * 10) | 0}`;
    fit(big, S * 0.46, 900, SANS, S * 0.7);
    c.fillStyle = '#ffffff'; c.fillText(big, ox + S * 0.5, oy + S * 0.40);
    fit(name, S * 0.10, 700, SANS, S * 0.8);
    c.fillStyle = '#8fe4ff'; c.fillText(name, ox + S * 0.5, oy + S * 0.62);
    c.fillStyle = '#c01818'; c.fillRect(ox, oy + S * 0.80, S, S * 0.11);
    fit(foot, S * 0.072, 700, SANS, S * 0.92);
    c.fillStyle = '#ffffff'; c.fillText(foot, ox + S * 0.5, oy + S * 0.855);
    c.restore();
    return;
  }

  // ---- POSTER archetypes: a colour field, a wordmark, one line of copy, a
  // footer band. Hierarchy is what makes a board legible at 40 m; the old
  // version had one type size and nothing else.
  const grad = c.createLinearGradient(ox, oy, ox + S * 0.4, oy + S);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, kind === 2 ? '#0a0a10' : bg);
  c.fillStyle = grad; c.fillRect(ox, oy, S, S);

  if (kind === 0) {                 // full-bleed wordmark, rule, kicker
    fit(name, S * 0.24, 900, SANS, S * 0.86);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.44);
    c.fillStyle = fg; c.globalAlpha = 0.8;
    c.fillRect(ox + S * 0.18, oy + S * 0.575, S * 0.64, 6);
    c.globalAlpha = 1;
    fit(copy, S * 0.085, 400, SANS, S * 0.84);
    c.fillStyle = fg; c.fillText(copy, ox + S * 0.5, oy + S * 0.66);
  } else if (kind === 1) {          // split panel: image block + corner mark
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(ox + S * 0.06, oy + S * 0.06, S * 0.88, S * 0.52);
    // an abstract product form, not a logo: three overlapping bars
    for (let i = 0; i < 3; i++) {
      c.fillStyle = `rgba(255,255,255,${0.10 + i * 0.10})`;
      c.fillRect(ox + S * (0.16 + i * 0.10), oy + S * (0.14 + i * 0.05), S * 0.22, S * 0.38);
    }
    fit(name, S * 0.15, 900, SANS, S * 0.86);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.70);
    fit(copy, S * 0.075, 400, SANS, S * 0.8);
    c.fillStyle = fg; c.globalAlpha = 0.85;
    c.fillText(copy, ox + S * 0.5, oy + S * 0.80);
    c.globalAlpha = 1;
  } else if (kind === 2) {          // theatre poster: display serif + star rule
    fit(name, S * 0.20, 400, SERIF, S * 0.84);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.38);
    c.fillStyle = fg; c.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) c.fillText('★', ox + S * (0.30 + i * 0.10), oy + S * 0.52);
    c.globalAlpha = 1;
    fit(showLine, S * 0.11, 700, SANS, S * 0.8);
    c.fillStyle = fg; c.fillText(showLine, ox + S * 0.5, oy + S * 0.66);
  } else if (kind === 3) {          // stacked type block, left rule
    c.fillStyle = fg; c.fillRect(ox + S * 0.10, oy + S * 0.20, 8, S * 0.55);
    c.textAlign = 'left';
    fit(name, S * 0.17, 900, SANS, S * 0.72);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.18, oy + S * 0.34);
    const cp = copy.split(' ');
    fit(cp[0] || '', S * 0.10, 400, SANS, S * 0.72);
    c.fillStyle = fg; c.globalAlpha = 0.9;
    c.fillText(cp.slice(0, 2).join(' '), ox + S * 0.18, oy + S * 0.50);
    c.fillText(cp.slice(2).join(' '), ox + S * 0.18, oy + S * 0.60);
    c.globalAlpha = 1;
  } else {                          // centred mark in a keyline box
    c.strokeStyle = fg; c.globalAlpha = 0.7; c.lineWidth = 7;
    c.strokeRect(ox + S * 0.09, oy + S * 0.09, S * 0.82, S * 0.60);
    c.globalAlpha = 1;
    fit(name, S * 0.18, 700, SANS, S * 0.66);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.39);
    fit(copy, S * 0.075, 400, SANS, S * 0.62);
    c.fillStyle = fg; c.globalAlpha = 0.85;
    c.fillText(copy, ox + S * 0.5, oy + S * 0.55);
    c.globalAlpha = 1;
  }
  // footer band on every poster: the thing that fills the bottom of a real
  // Times Square board and gives the panel a horizon
  c.fillStyle = 'rgba(0,0,0,0.42)';
  c.fillRect(ox, oy + S * 0.84, S, S * 0.16);
  c.textAlign = 'center';
  fit(foot, S * 0.068, 700, SANS, S * 0.9);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillText(foot, ox + S * 0.5, oy + S * 0.915);
  c.restore();
}

function paint(cells = null) {
  const cv = tex.image, c = cv.getContext('2d');
  for (let i = 0; i < GRID * GRID; i++) if (!cells || cells.includes(i)) drawCell(c, (i % GRID) * CELL, ((i / GRID) | 0) * CELL);
  tex.needsUpdate = true;
}
// TS28: the boards change on the SIM clock (ENV.windT), a few at a time. The old setInterval(paint, 4200) repainted all
// sixteen on the wall clock: a recorded take (0.6-2 s a frame) swapped every board in the Square every 2-7 frames, and
// live play took the whole 16-cell redraw and a 2048-square upload in one frame. Now four cells every 2.4 s of sim time
// (each design stays ~10 s, like a rotation), from the material's own pre-render hook, so a frame that draws no board
// pays nothing; and the night swap above follows the clock too.
let nextPaint = null, wasNight = null;
function tick() {
  const t = ENV.windT.value, night = ENV.night.value > 0.5;
  if (nextPaint === null) { nextPaint = t + 2.4; wasNight = night; return; }
  if (night !== wasNight) { wasNight = night; paint(); nextPaint = t + 2.4; return; }
  if (t < nextPaint) return;
  nextPaint = t + 2.4;
  const cells = [];
  while (cells.length < 4) { const k = (Math.random() * GRID * GRID) | 0; if (!cells.includes(k)) cells.push(k); }
  paint(cells);
}

function ensure() {
  if (mat) return;
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = AH;
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  mat = new THREE.MeshBasicMaterial({
    map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  // A board is an EMITTER, not a painted wall. Unlit at scene exposure it
  // matched the limestone behind it; lifted 1.5x by day and 3.4x at night it
  // reads as a screen, and its brightest cells cross the 1.35 linear bloom
  // threshold so the district glows the way the Square does.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', `
        ${TS28 ? 'gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(mix(1.0, 1.25, bbNight))) * mix(1.5, 3.1, bbNight);' : 'gl_FragColor.rgb *= mix(1.5, 3.4, bbNight);'}
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'tsqboard';
  paint();
  if (TS28) mat.onBeforeRender = tick;
  else if (!animOn) { animOn = true; setInterval(paint, 4200); }
}

// The district atlas, for builders that clad a whole landmark in screens rather
// than posting boards on a compiled footprint (landmarks.js oneTimesSquare).
// Same material, so the landmark's panels merge into the same draw call the
// district already pays for, and they repaint on the same 4.2 s timer.
export const BOARD_SLOTS = GRID * GRID;
export function boardMaterial() { if (TA31) { ensureTA(); return taMat; } ensure(); return mat; }
export function boardUVRect(slot) {
  // TA31: a landmark panel gets the whole "legacy" square v 2..3 and is re-laid on its first draw (taUpgrade: its own
  // aspect, class, crop and playlist), so landmarks.js keeps working without knowing about the new atlas
  if (TA31) return [0, 2, 1, 3 - 1e-4];
  const i = ((slot % BOARD_SLOTS) + BOARD_SLOTS) % BOARD_SLOTS;
  const u0 = (i % GRID) / GRID, v1 = 1 - ((i / GRID) | 0) / GRID;
  return [u0, v1 - 1 / GRID, u0 + 1 / GRID, v1];
}

// recs: [{ring, frontIdx, baseY, height, colorVar}] near-TSQ tall buildings.
// TS28 (owner 2026-09-27: "Work on some new areas like Times Square and Bryant Park for the new teaser"): the bowtie
// itself is walls of screens, not a poster per building. Every frontage within 60 m of the Square's axis (One Times
// Square's north face at 43rd to Duffy Square at 47th) that faces it carries a STACK of screens over its full width,
// from above the shop fronts to 48 m, one to three screens with 1.2 m gaps, each 0.7 m off the wall in a dark steel
// frame. They are added to the tile's own group (the pooled district boards never reached the frame there). `?ts28=0`
// restores the round-5 district alone.
export const TS28 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ts28') === '0');
const TSQ_A = project(-73.98640, 40.75650), TSQ_B = project(-73.98505, 40.75905);
// distance from (x, z) to the Square's axis and the unit direction toward it
function toAxis(x, z) {
  const ax = TSQ_B[0] - TSQ_A[0], az = TSQ_B[1] - TSQ_A[1], L2 = ax * ax + az * az;
  const t = Math.max(0, Math.min(1, ((x - TSQ_A[0]) * ax + (z - TSQ_A[1]) * az) / L2));
  const px = TSQ_A[0] + ax * t, pz = TSQ_A[1] + az * t, dx = px - x, dz = pz - z, d = Math.hypot(dx, dz) || 1;
  return [d, dx / d, dz / d];
}
// The outward unit normal of ring edge i, tested against the ring itself: the compiled rings do not share one winding
// (memory: the building visibility audit), and a fixed (-ez, ex) put boards 0.35 m INSIDE every building wound the other
// way, where the facade hid them (TS28 probe: 206 district boards built and visible, none in a frame). A quad's front
// face is (along x up), so the along-wall direction comes from the normal too, (nz, -nx): the edge's own direction
// would face a flipped board back into the wall.
function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function outwardNormal(ring, i) {
  const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
  const ex = x2 - x1, ez = z2 - z1, len = Math.hypot(ex, ez) || 1;
  let nx = -ez / len, nz = ex / len;
  if (inRing((x1 + x2) / 2 + nx * 0.6, (z1 + z2) / 2 + nz * 0.6, ring)) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

// ---------------------------------------------------------------- TA31: designed ads, fitted to each board
// Owner 2026-09-28: "the ads are extremely low quality: I don't want to see big letters ... I want real (but
// stylized/changed to avoid trademark issues) ads with logos, graphic design and different fonts that are right size
// for billboards and signs". Three things were wrong here besides the artwork (now city/adArt.js):
//  - SHAPE. Every quad showed one square cell. The TS28 census (45 screens, docs/notes/tsq-graphics.md) runs from
//    7.3 x 22.4 m (aspect 0.33) to 60.3 x 12.7 m (4.75), so one poster was squashed 3x on one screen and stretched
//    4.7x on the next. The TA31 atlas holds cells in six aspect classes (0.8, 1.1, 1.5, 2.1, 3.0 and a 5.9 ticker);
//    a quad takes the nearest class and CROPS it to its own aspect (at most 16 % off one axis), and a screen outside
//    0.72-3.6 is split into two or three screens first, which is also how the real frontages are divided.
//  - UPLOADS. TS28 repainted 4 cells every 2.4 s of sim time and re-uploaded the whole 2048^2 canvas (16 MB) each time.
//    The TA31 atlas is painted ONCE (after the fonts load) and the rotation runs in the shader: each quad carries its
//    class range, a phase and a duration, and cycles through the class's cells with a 0.6 s wipe. No uploads at run time.
//  - SCREEN LOOK. An LED wall is built from ~0.96 m cabinets that never match exactly, its diodes show as a grid up
//    close, and it dims off-axis. The shader draws all three, each faded out by its own pixel footprint so none of them
//    can alias; a printed district board gets none of it and is floodlit from below at night instead.
// `?ta31=0` restores the TS28 atlas and boards.
export const TA31 = TS28 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ta31') === '0');
// GZ31 (2026-09-28 evening, docs/notes/tsq-graphics.md): at a grazing angle the anisotropic filter footprint runs far
// along a board (anisotropy 8, so the mip comes from the major axis / 8) and it reached past the cell: the ticker under
// a stack seen along 7th Ave read "SEPTIGNUN NOS2 LINES%", the other ticker cell and the fold's second row mixed into
// the letters. Every fetch now keeps its whole footprint inside its own cell (and a ticker's inside its own row), and
// past the point where the letters cannot be read (a ticker at 4-14 atlas texels a pixel along the strip, a screen at
// 48-160) the board converges to the cell's own mean colour: a soft band of the ad's colours, never noise.
// `?ta31gz=0` restores the plain fetch.
const TA31GZ = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ta31gz') === '0');
// PK31: the engine's ambient is a 32 px cube capture at the camera reduced to SH (engine.js _updateProbe), i.e. every
// emitter it sees is treated as light arriving from infinitely far away, unshadowed, on every surface. In Times Square
// at night the capture is mostly screens: SH L0 at s45S was (1.38, 1.17, 1.08) with the TS28 boards and
// (1.60, 1.19, 0.95) with TA31's full-colour ones, against (1.42, 1.54, 1.96) for the DAY capture there, which is the
// "milky" night ground: the pavement and the walls carried a daytime ambient. A screen's real light falls off with
// distance and is blocked by everything between; the pooled screen lights (tsqScreenLights) are the right carrier
// for it. So a board draws into that one capture at `?ta31pk=` (default 0.3) of its brightness at night (by day
// at full, which leaves the day ambient as it was).
const TA31PK = (() => { if (typeof location === 'undefined') return 0.3; const v = parseFloat(new URLSearchParams(location.search).get('ta31pk')); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.3; })();
const TAW = 4096, TAH = 2048;
// shelves [height, [[class, width], ...]], packed left to right, 544 + 544 + 460 + 260 + 240 = 2048 rows
const TA_SHELVES = [
  [544, [['W2', 1136], ['W2', 1136], ['W2', 1136], ['S', 600]]],
  [544, [['W2', 1136], ['W1', 816], ['W1', 816], ['T1', 436], ['T1', 436], ['T1', 436]]],
  [460, [['W3', 1380], ['W3', 1380], ['W1', 690], ['S', 506]]],
  [260, [['R', 1536], ['R', 1536], ['W3', 780]]],
  [240, [['W2', 504], ['W2', 504], ['W2', 504], ['W2', 504], ['W1', 360], ['W1', 360], ['W1', 360], ['W1', 360], ['S', 264], ['S', 264]]],
];
const TA_CLASSES = ['T1', 'S', 'W1', 'W2', 'W3', 'R'];
const TA_ASPECT = { T1: 436 / 544, S: 600 / 544, W1: 1.5, W2: 1136 / 544, W3: 3.0, R: 1536 / 260 };
let taCells = null, taClass = null, taTex = null, taMat = null, taMeanV = null;
const taProbeU = { value: 1 };
function taLayout() {
  if (taCells) return;
  const raw = [];
  let y = 0;
  for (const [h, row] of TA_SHELVES) { let x = 0; for (const [cls, w] of row) { raw.push({ cls, x, y, w, h, big: h >= 400 }); x += w; } y += h; }
  // one contiguous range of the rect array per class, big cells first, so "the class" and "its big cells" are both a
  // (base, count) pair the shader can cycle over
  taCells = []; taClass = {};
  for (const cls of TA_CLASSES) {
    const mine = raw.filter((r) => r.cls === cls).sort((a, b) => b.w * b.h - a.w * a.h);
    taClass[cls] = { base: taCells.length, n: mine.length, nBig: Math.max(1, mine.filter((r) => r.big).length) };
    taCells.push(...mine);
  }
  // designs: distinct within a class, every design in at least two formats (a campaign runs on several screens), the
  // posters in the portrait class and the wide products (car, plane, shoe) in the wide ones; big cells first
  const byId = new Map(); for (let k = 0; k < AD_COUNT; k++) byId.set(adId(k), k);
  const PLAY = {
    T1: ['lantern', 'deeporbit', 'rosaline'],
    S: ['voltra', 'elara', 'noctelle', 'stackhouse'],
    W1: ['heron', 'tallbridge', 'lighthouse', 'velle', 'fizzwell', 'waveline', 'fleetstep'],
    W2: ['orvik', 'lighthouse', 'stackhouse', 'elara', 'rosaline', 'deeporbit', 'fizzwell', 'voltra'],
    W3: ['fleetstep', 'lantern', 'waveline'],
    R: ['ticker', 'news'],
  };
  TA_CLASSES.forEach((cls) => {
    const K = taClass[cls], L = PLAY[cls], pool = adsFor(TA_ASPECT[cls]);
    for (let j = 0; j < K.n; j++) { const k = byId.get(L[j % L.length]); taCells[K.base + j].design = k != null ? k : pool[j % pool.length]; }
  });
}
function taPaint() {
  const c = taTex.image.getContext('2d');
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < taCells.length && performance.now() - t0 < 12) { const r = taCells[i++]; paintAd(c, r.x, r.y, r.w, r.h, r.design); }
    if (i < taCells.length) setTimeout(step, 0);
    else { taTex.needsUpdate = true; try { taMeans(); } catch (e) { console.warn('ta31 means', e); } if (typeof window !== 'undefined') window.__TA31_PAINTED = (window.__TA31_PAINTED || 0) + 1; }
  };
  step();
}
function ensureTA() {
  if (taMat) return;
  taLayout();
  const cv = document.createElement('canvas');
  cv.width = TAW; cv.height = TAH;
  const c0 = cv.getContext('2d');
  c0.fillStyle = '#04060a'; c0.fillRect(0, 0, TAW, TAH);        // a dark (switched-off) screen until the art is in
  taTex = new THREE.CanvasTexture(cv);
  taTex.colorSpace = THREE.SRGBColorSpace;
  taTex.anisotropy = 8;
  taMat = new THREE.MeshBasicMaterial({ map: taTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // 2 px in from each cell edge: the mip chain bleeds a neighbour's colour into a board's rim otherwise
  const rects = taCells.map((r) => new THREE.Vector4((r.x + 2) / TAW, 1 - (r.y + r.h - 2) / TAH, (r.w - 4) / TAW, (r.h - 4) / TAH));
  const NC = taCells.length, legacy = taClass.W1.base;
  taMeanV = taCells.map(() => new THREE.Vector3());
  taMat.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.uniforms.taMean = { value: taMeanV };
    sh.uniforms.taProbe = taProbeU;
    sh.uniforms.taTime = ENV.windT;
    sh.uniforms.taRect = { value: rects };
    sh.uniforms.taAtlas = { value: new THREE.Vector2(TAW, TAH) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aAd; attribute vec2 aSize;
        flat varying vec4 vTaAd; varying vec2 vTaSize; varying vec2 vTaUv; varying vec3 vTaView;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vTaAd = aAd; vTaSize = aSize; vTaUv = uv; vTaView = mvPosition.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        #define TA_NC ${NC}
        uniform float bbNight; uniform float taTime; uniform vec4 taRect[TA_NC]; uniform vec2 taAtlas;
        uniform vec3 taMean[TA_NC]; uniform float taProbe;
        flat varying vec4 vTaAd; varying vec2 vTaSize; varying vec2 vTaUv; varying vec3 vTaView;
        float taHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
        vec4 taTexel(float slot, vec2 lc, vec2 gx, vec2 gy) {
          vec4 r = taRect[int(clamp(slot + 0.5, 0.0, float(TA_NC) - 0.5))];
          return textureGrad(map, r.xy + lc * r.zw, gx * r.zw, gy * r.zw);
        }
        // GZ31: the fetch with its footprint kept inside [lo, hi] of the cell, and the cell's mean past f0..f1 atlas
        // texels a pixel (along x only when alongX, the ticker's strip direction)
        vec4 taTexelSafe(float slot, vec2 lc, vec2 gx, vec2 gy, vec2 lo, vec2 hi, float f0, float f1, bool alongX) {
          int i = int(clamp(slot + 0.5, 0.0, float(TA_NC) - 0.5));
          vec4 r = taRect[i];
          vec2 tx = r.zw * taAtlas;                                        // the cell in texels
          float ml = max(length(gx * tx), length(gy * tx));                // the footprint's major axis, texels
          // per axis: the pixel's parallelogram, the filter kernel at the mip anisotropy 8 settles on, a bilinear tap
          vec2 hw = 0.5 * (abs(gx) + abs(gy)) + (0.13 * ml + 1.5) / tx;
          vec2 c = clamp(lc, lo + hw, hi - hw);
          c = mix(c, 0.5 * (lo + hi), step(hi - lo, 2.0 * hw));            // wider than the range: its middle
          vec4 t = textureGrad(map, r.xy + c * r.zw, gx * r.zw, gy * r.zw);
          float tpp = alongX ? max(abs(gx.x), abs(gy.x)) * tx.x : ml;
          t.rgb = mix(t.rgb, taMean[i], smoothstep(f0, f1, tpp));
          return t;
        }`)
      .replace('#include <map_fragment>', `{
        vec2 lc = vTaUv;
        vec4 texel;
        float slot0 = ${legacy}.0;
        bool legacyUv = lc.y > 1.5;
        if (legacyUv) lc.y -= 2.0;                        // a landmark panel before taUpgrade reached it (one frame)
        vec2 gx = dFdx(lc), gy = dFdy(lc), lcs = lc;
        if (legacyUv || vTaAd.y < 0.5) {
          texel = vec4(0.018, 0.022, 0.03, 1.0);        // a switched-off screen for the one frame before the upgrade
        } else if (vTaAd.w < 0.0) {
          // ticker: the cell is one long run folded into two rows (adArt.js paintTicker); unfold it, repeat it along
          // the strip and scroll it right to left at a walking pace
          // FL31: THE TICKER'S CELL IS floor(phase), AND phase IS EXACTLY 0.0 OR 1.0. Interpolated across a triangle seen
          // at a grazing angle, 1.0 came back as 0.99999994 on some pixels and 1.0 on their neighbours, so the strip
          // chose the market cell on one pixel and the news cell on the next: the "SEPTIGNUN NOS2 LINES%" of the
          // tsqPlaza still is the two tickers interleaved pixel by pixel, not a filter footprint (head-on the
          // barycentrics are well conditioned, which is why s45S was clean). vTaAd is flat now, and rounded here too.
          slot0 = vTaAd.x + mod(floor(vTaAd.z + 0.5), vTaAd.y);
          float s = fract(lc.x + taTime * -vTaAd.w) * 2.0, row = floor(s);
          lcs = vec2(fract(s), (1.0 - row) * 0.5 + lc.y * 0.5);
          ${TA31GZ ? `float r0 = (1.0 - row) * 0.5;
          texel = taTexelSafe(slot0, lcs, gx * vec2(2.0, 0.5), gy * vec2(2.0, 0.5), vec2(0.0, r0), vec2(1.0, r0 + 0.5), 4.0, 14.0, true);`
            : 'texel = taTexel(slot0, lcs, gx * vec2(2.0, 0.5), gy * vec2(2.0, 0.5));'}
        } else {
          float t = (taTime + vTaAd.z) / vTaAd.w, k = floor(t), f = fract(t);
          slot0 = vTaAd.x + mod(k, vTaAd.y);
          texel = ${TA31GZ ? "taTexelSafe(slot0, lc, gx, gy, vec2(0.0), vec2(1.0), 48.0, 160.0, false)" : 'taTexel(slot0, lc, gx, gy)'};
          float tw = min(0.6 / vTaAd.w, 0.25);
          if (f > 1.0 - tw && vTaAd.y > 1.5) {
            // the next ad wipes in from the left, with a bright leading edge like a real player's transition
            float p = (f - (1.0 - tw)) / tw;
            float u = lc.x;
            vec4 nx = ${TA31GZ ? "taTexelSafe(vTaAd.x + mod(k + 1.0, vTaAd.y), lc, gx, gy, vec2(0.0), vec2(1.0), 48.0, 160.0, false)" : 'taTexel(vTaAd.x + mod(k + 1.0, vTaAd.y), lc, gx, gy)'};
            float e = smoothstep(p - 0.015, p + 0.015, (u - 0.0));
            texel = mix(nx, texel, e);
            texel.rgb += vec3(0.35) * (1.0 - smoothstep(0.0, 0.02, abs(u - p))) * step(0.02, p) * step(p, 0.98);
          }
        }
        if (vTaSize.x > 0.0) {
          // LED wall: cabinets of 0.96 m with their own gain, a diode grid at the atlas texel pitch, off-axis dimming.
          // Each term fades out once its feature is under ~3 px, so nothing here can shimmer at distance.
          vec2 m = vTaUv * vTaSize;
          float mpp = max(length(dFdx(m)), length(dFdy(m)));            // metres per pixel
          vec2 cab = floor(m / 0.96);
          float cv = 1.0 - smoothstep(0.12, 0.32, mpp);
          texel.rgb *= 1.0 + (taHash(cab + vTaAd.x) - 0.5) * 0.05 * cv;
          // the 2 mm seams between cabinets: only inside ~12 m (under 1.2 cm a pixel), where a real wall shows them
          vec2 sd = abs(fract(m / 0.96) - 0.5) * 0.96;                   // distance to the cabinet seam, metres
          float seam = 1.0 - smoothstep(0.0, 0.004 + mpp * 0.5, 0.48 - max(sd.x, sd.y));
          texel.rgb *= 1.0 - 0.4 * seam * (1.0 - smoothstep(0.004, 0.012, mpp));
          vec4 rr = taRect[int(clamp(slot0 + 0.5, 0.0, float(TA_NC) - 0.5))];
          vec2 tc = (rr.xy + lcs * rr.zw) * taAtlas;
          float tpp = max(length(dFdx(tc)), length(dFdy(tc)));           // texels per pixel
          vec2 dq = abs(fract(tc) - 0.5);
          float dots = smoothstep(0.5, 0.3, max(dq.x, dq.y));
          texel.rgb *= mix(1.0, 0.4 + 0.7 * dots, (1.0 - smoothstep(0.1, 0.2, tpp)) * 0.6);   // only once a diode is over ~5 px
          vec3 N = normalize(cross(dFdx(vTaView), dFdy(vTaView)));
          float ca = abs(dot(N, normalize(-vTaView)));
          texel.rgb *= mix(0.45, 1.0, smoothstep(0.05, 0.55, ca));
        } else {
          // a printed board, floodlit from its foot at night
          texel.rgb *= mix(1.0, 0.45 + 0.7 * (1.0 - vTaUv.y) * (1.0 - vTaUv.y) + 0.25, bbNight);
        }
        diffuseColor *= texel; }`)
      .replace('#include <fog_fragment>', `
        {
          // an emitter: 1.45x over the scene by day, 1.9x at night with the pale fields held back (a white field
          // lifted 3.1x was the TS28 night glare); the brightest strokes still cross the bloom threshold
          float L = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb *= 1.0 - bbNight * 0.5 * smoothstep(0.3, 0.9, L);
          gl_FragColor.rgb *= (vTaSize.x > 0.0 ? mix(1.45, 1.9, bbNight) : mix(1.25, 1.7, bbNight));
          // KN31: at night the engine's bloom threshold is 0.85 (setBloom: 2.30 - 1.45 night), so a saturated ad at
          // x2.2 bloomed over its whole area and its veil ran down the storefront band under it (s45S_night_a5: the
          // yellow Stackhouse board). The LED gain is 1.9 at night and the brightest channel is compressed above 1.1,
          // hue kept: the screens still flare, their faces stay readable.
          float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.1, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.1 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), bbNight);
          gl_FragColor.rgb *= taProbe;                     // PK31: < 1 only while the ambient probe captures
        }
        #include <fog_fragment>`);
  };
  taMat.customProgramCacheKey = () => 'ta31board';
  // a landmark panel mesh gets a NEW geometry (the upgrade below) and the mesh takes it from the next frame. Adding the
  // attributes to the geometry being drawn does not work: this hook runs after three has uploaded the frame's buffers,
  // its binding state then records aAd as bound while skipping it (no buffer yet) and never revisits it, so aAd read
  // (0,0,0,1) and every One Times Square panel drew the fallback cell (scratchpad ots_sw.mjs reproduces it on SwiftShader).
  taMat.onBeforeRender = (renderer, scene, camera, geometry, object) => {
    // PK31: the engine's SH probe is the only 32 px cube target (the fleet's and the fountain's reflection cubes are 64+)
    const rt = renderer.getRenderTarget();
    taProbeU.value = rt && rt.isWebGLCubeRenderTarget && rt.width <= 32 ? 1 + (TA31PK - 1) * ENV.night.value : 1;
    if (!(rt && rt.isWebGLCubeRenderTarget)) spillTick(scene, camera);   // SP31, from the view's own draws (4 Hz)
    if (geometry.userData.ta31) return;
    const ng = taUpgrade(geometry);
    if (ng && object && object.geometry === geometry) { object.geometry = ng; taRegisterPanels(object, ng); }
  };
  let painted = false;
  const go = () => { if (!painted) { painted = true; taPaint(); } };
  loadAdFonts().then(go);
  setTimeout(go, 8000);                                      // fonts or no fonts, the boards light up
}
// class, crop and playlist for one quad (A B C D = bottom-left, bottom-right, top-right, top-left)
function taPick(Aq) {
  let best = 'S', bd = 1e9;
  for (const cls of TA_CLASSES) { if (cls === 'R') continue; const d = Math.abs(Math.log(Aq / TA_ASPECT[cls])); if (d < bd) { bd = d; best = cls; } }
  return best;
}
// `sync` = [duration, start, offset]: the screens of one frontage run one player, switching together and each
// `offset` cells along, so stacked screens of one class never show the same ad at once
function taQuadData(wM, hM, kind, seed, sync = null) {
  const Aq = wM / hM, cls = kind === 'ticker' ? 'R' : taPick(Aq), K = taClass[cls], Ac = TA_ASPECT[cls];
  let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
  if (kind === 'ticker') u1 = Aq / (Ac * 4);         // the unfolded run is 4x the cell's aspect (two rows, half height)
  else if (Aq > Ac) { const k = Ac / Aq; v0 = 0.5 - k / 2; v1 = 0.5 + k / 2; }
  else { const k = Aq / Ac; u0 = 0.5 - k / 2; u1 = 0.5 + k / 2; }
  // a board big enough to be read up close cycles only through the full-size cells
  const n = kind === 'ticker' ? K.n : (hM > 9 || wM > 18) ? K.nBig : K.n;
  const h1 = ahs(seed, 1.7), h2 = ahs(seed, 5.3);
  let dur, phase;
  if (kind === 'ticker') { dur = -(1.4 / (hM * Ac * 4)); phase = h2 < 0.5 ? 0 : 1; }
  else if (kind === 'print' && h1 < 0.55) { dur = 1e6; phase = h2 * n * dur; }          // a vinyl board: one ad
  else if (sync) { dur = sync[0]; phase = (Math.floor(sync[1] * n) + sync[2]) * dur; }
  else { dur = kind === 'print' ? 14 + h1 * 6 : 8 + h1 * 4; phase = h2 * n * dur; }
  return { uv: [u0, v0, u1, v1], ad: [K.base, n, phase, dur], sz: [kind === 'print' ? -wM : wM, hM] };
}
function taPush(G, A, B, C, D, wM, hM, kind, seed, sync = null) {
  const q = taQuadData(wM, hM, kind, seed, sync), [u0, v0, u1, v1] = q.uv;
  for (const p of [A, B, C, A, C, D]) G.pos.push(...p);
  G.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  for (let k = 0; k < 6; k++) { G.ad.push(...q.ad); G.sz.push(...q.sz); }
  return q;
}
// a landmark's panels (landmarks.js oneTimesSquare: merged PlaneGeometry quads, four vertices each, uv in the
// legacy square v 2..3 from boardUVRect) get their class, crop and playlist on their first draw
function taUpgrade(g) {
  g.userData.ta31 = true;
  if (g.getAttribute('aAd')) return null;
  const P = g.getAttribute('position'), U = g.getAttribute('uv');
  if (!P || !U || P.count % 4) return null;
  const n = P.count, uv = new Float32Array(n * 2), ad = new Float32Array(n * 4), sz = new Float32Array(n * 2);
  const d = (a, b) => Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b));
  for (let q = 0; q < n; q += 4) {
    const wM = d(q, q + 1), hM = d(q, q + 2);
    if (!(wM > 0.1 && hM > 0.1)) continue;
    const Q = taQuadData(wM, hM, 'led', q * 0.37 + P.getY(q) * 0.11);
    const [u0, v0, u1, v1] = Q.uv;
    for (let k = q; k < q + 4; k++) {
      const lu = U.getX(k), lv = Math.min(1, Math.max(0, U.getY(k) - 2));
      uv[k * 2] = u0 + lu * (u1 - u0); uv[k * 2 + 1] = v0 + lv * (v1 - v0);
      ad.set(Q.ad, k * 4); sz.set(Q.sz, k * 2);
    }
  }
  const ng = new THREE.BufferGeometry();
  if (g.index) ng.setIndex(g.index);
  ng.setAttribute('position', P);
  if (g.getAttribute('normal')) ng.setAttribute('normal', g.getAttribute('normal'));
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.setAttribute('aAd', new THREE.BufferAttribute(ad, 4));
  ng.setAttribute('aSize', new THREE.BufferAttribute(sz, 2));
  ng.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : null;
  if (!ng.boundingSphere) ng.computeBoundingSphere();
  ng.userData.ta31 = true;
  return ng;
}
// ---------------------------------------------------------------- screen light hook (read-only)
// For the lead's pooled screen-light spill (docs/notes/tsq-graphics.md "tsqScreenLights contract"). The shader's
// playlist is a pure function of (sim time, per-quad class base, count, phase, duration), so the ad a screen shows
// right now is computed here the same way, and its colour is that cell's mean over the painted atlas.
const taMeshes = new Set();
let taCellMean = null;
function taMeans() {
  const S = 512, T = 256, cv = document.createElement('canvas');
  cv.width = S; cv.height = T;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(taTex.image, 0, 0, S, T);
  const d = c.getImageData(0, 0, S, T).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  taCellMean = taCells.map((r) => {
    const x0 = Math.floor(r.x / TAW * S), x1 = Math.ceil((r.x + r.w) / TAW * S), y0 = Math.floor(r.y / TAH * T), y1 = Math.ceil((r.y + r.h) / TAH * T);
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * S + x) * 4; R += lin(d[o]); G += lin(d[o + 1]); B += lin(d[o + 2]); n++; }
    return n ? [R / n, G / n, B / n] : [0, 0, 0];
  });
  if (taMeanV) taCellMean.forEach((m, i) => taMeanV[i] && taMeanV[i].set(m[0], m[1], m[2]));   // GZ31's far colour
}
// One Times Square's panels, in world space from the mesh's matrix, once the upgrade has laid them out
const _gv = new THREE.Vector3();
function taRegisterPanels(object, g) {
  object.updateMatrixWorld();
  const P = g.getAttribute('position'), A = g.getAttribute('aAd'), S = g.getAttribute('aSize'), M = object.matrixWorld;
  const v = [0, 1, 2].map(() => new THREE.Vector3()), lights = [];
  let gy = Infinity;
  for (let q = 0; q < P.count; q++) gy = Math.min(gy, _gv.fromBufferAttribute(P, q).applyMatrix4(M).y);
  gy -= 6;                                         // oneTimesSquare starts its panels at 0.06 H over its base
  for (let q = 0; q + 3 < P.count; q += 4) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(P, q + k).applyMatrix4(M);
    const c3 = new THREE.Vector3().fromBufferAttribute(P, q + 3).applyMatrix4(M).add(v[0]).multiplyScalar(0.5);
    const n3 = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    n3.y = 0; if (n3.lengthSq() < 1e-9) continue; n3.normalize();
    lights.push({ x: c3.x, y: c3.y, z: c3.z, nx: n3.x, nz: n3.z, w: Math.abs(S.getX(q)), h: S.getY(q), gy, ad: [A.getX(q), A.getY(q), A.getZ(q), A.getW(q)], kind: 'landmark', print: false });
  }
  object.userData.ta31Lights = lights; taMeshes.add(object);
}
const inScene = (o) => { for (; o; o = o.parent) if (o.isScene) return true; return false; };
// every screen of the Square (stacks, tickers, One Times Square) plus up to `maxBoards` district boards, largest first
export function tsqScreenLights(maxBoards = 40) {
  if (!TA31 || !taCells) return [];
  const t = ENV.windT.value, night = ENV.night.value, screens = [], boards = [];
  for (const m of taMeshes) {
    if (!inScene(m)) { if (m.userData.ta31Seen) taMeshes.delete(m); continue; }   // its tile unloaded
    m.userData.ta31Seen = true;
    for (const L of m.userData.ta31Lights || []) {
      const [base, n, phase, dur] = L.ad;
      const k = dur < 0 ? Math.floor(phase) : Math.floor((t + phase) / dur);
      const slot = base + (((k % n) + n) % n);
      const rgb = taCellMean ? taCellMean[slot] : [0, 0, 0];
      const gain = L.print ? 1.25 + 0.45 * night : 1.45 + 0.45 * night;
      (L.kind === 'board' ? boards : screens).push({ x: L.x, y: L.y, z: L.z, nx: L.nx, nz: L.nz, w: L.w, h: L.h, gy: L.gy ?? L.y - L.h / 2 - 4.8, rgb, gain, kind: L.kind });
    }
  }
  boards.sort((a, b) => b.w * b.h - a.w * a.h);
  return screens.concat(boards.slice(0, maxBoards));
}
// ---------------------------------------------------------------- SP31: the screens' light on the pavement
// Coordinator 2026-09-28: "coloured pools on the pavement under each stack rather than a uniform white lift". With PK31
// the ambient probe no longer carries the screens, so their light arrives here as real lights: a pool of `?ta31sp=`
// (default 6, 0 = none) shadowless SpotLights, each hung 1 m in front of one of the screens nearest the camera and aimed
// down and out at the pavement in front of it, coloured by the mean of the ad that screen shows now (tsqScreenLights,
// so the pool changes colour with the ad) and as strong as the screen is big and bright. Created on the first board
// draw after dark (the day programs never carry them), visible only at night, re-picked every 0.25 s, and a light
// fades over ~0.5 s when its screen or colour changes. Only 'screen' and 'landmark' faces up to 30 m high; the tickers
// and district boards are too small or too far to matter.
const TA31SP = (() => { if (typeof location === 'undefined') return 6; const v = parseInt(new URLSearchParams(location.search).get('ta31sp'), 10); return Number.isFinite(v) ? Math.max(0, Math.min(12, v)) : 6; })();
const SP_K = 8;                    // candela per (m^2 x mean linear luminance x board gain): a 20 x 10 m ad at 0.25 ~ 880,
                                   // a CL24 cobrahead peaks at 245 x 3 = 735
let spill = null;
// also called from the shop-sign material (shopSigns.js), which draws in every district, so the pool switches itself off
// once the camera has left the Square rather than keeping six lights live over the rest of the city
export function spillTick(scene, camera) {
  if (!TA31SP || !scene || !camera || !scene.isScene) return;
  const night = ENV.night.value;
  if (!spill) {
    if (night < 0.06) return;
    spill = { grp: new THREE.Group(), L: [], next: 0 };
    spill.grp.name = 'ta31:spill';
    spill.grp.visible = false;                      // shown by the first tick that finds a screen near, so a night far from
                                                    // the Square never compiles the lit programs with six more spots
    for (let i = 0; i < TA31SP; i++) {
      const L = new THREE.SpotLight(0xffffff, 0, 60, 1.1, 1.0, 2);
      L.castShadow = false;
      L.userData.key = null; L.userData.I = 0;
      spill.grp.add(L); spill.grp.add(L.target);
      spill.L.push(L);
    }
    scene.add(spill.grp);
  }
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const off = typeof window !== 'undefined' && window.__TA31SP_OFF;   // live A/B switch for a harness
  if (night < 0.06 || off) { if (spill.grp.visible) spill.grp.visible = false; return; }
  if (now < spill.next) return;
  spill.next = now + 250;
  const cp = camera.getWorldPosition ? camera.getWorldPosition(new THREE.Vector3()) : camera.position;
  const cand = [];
  for (const e of tsqScreenLights(0)) {
    if (e.kind !== 'screen' && e.kind !== 'landmark') continue;
    const foot = e.y - e.h / 2;
    if (foot - e.gy > 30) continue;                     // a face that high lights the street below it very little
    const D = Math.min(30, Math.max(8, e.h));
    const tx = e.x + e.nx * D, tz = e.z + e.nz * D, d = Math.hypot(tx - cp.x, tz - cp.z);
    if (d > 140) continue;
    cand.push({ e, d, D, tx, tz, key: `${e.x.toFixed(1)},${e.z.toFixed(1)},${e.y.toFixed(1)}` });
  }
  cand.sort((a, b) => a.d - b.d);
  // no screen near: the pool fades out and then leaves the lit programs (they are cached, so coming back costs no
  // second compile); a screen near again brings it back
  const live = cand.length > 0 || spill.L.some((L) => L.userData.I > 1);
  if (spill.grp.visible !== live) spill.grp.visible = live;
  if (!live) return;
  spill.L.forEach((L, i) => {
    const o = cand[i];
    if (!o) { L.userData.I *= 0.5; L.intensity = L.userData.I; return; }
    const e = o.e, lum = 0.2126 * e.rgb[0] + 0.7152 * e.rgb[1] + 0.0722 * e.rgb[2], mx = Math.max(e.rgb[0], e.rgb[1], e.rgb[2], 1e-4);
    if (L.userData.key !== o.key) { L.userData.key = o.key; L.userData.I = 0; }
    L.position.set(e.x + e.nx * 1.0, e.y, e.z + e.nz * 1.0);
    L.target.position.set(o.tx, e.gy, o.tz);
    L.target.updateMatrixWorld();
    L.distance = o.D * 3 + e.h + 20;
    L.color.setRGB(e.rgb[0] / mx, e.rgb[1] / mx, e.rgb[2] / mx);
    const It = SP_K * e.w * e.h * lum * e.gain * Math.min(1, (night - 0.06) / 0.4);
    L.userData.I += (It - L.userData.I) * 0.5;
    L.intensity = L.userData.I;
  });
}
let _frameMat = null;
// TF32 (owner 2026-09-29: "not enough details"; docs/notes/tsq-graphics.md TF32, references r12 and r15): 4 Times
// Square's seven-storey cylindrical screen, the one Times Square shape every photograph of 43rd St has and ours did not
// (its glass corner stood bare). The tower's rounded corner is tile -3_5 building 95's edges e9-e12, an arc of 8.3 m
// radius round (-1243.5, 2976.5) turning 104 degrees from the Broadway face (e8, which carries a stack) to the 43rd St
// face (e13). The screen follows it 0.9 m off the glass and runs on 6 m along 43rd St: a ticker band 9.2-13.0 m over
// the pavement (the real one's foot band), the screen 13.5-46.0 m, each ONE TA31 quad strip whose u runs on round the
// curve, so one ad wraps it. The stacks also get their maintenance catwalks: seven slats from the wall to 1.3 m out
// under the lowest screen, a bracket and a rail post every 2.4 m, a top and a middle rail (r09, r13: the decks and
// rails under the screens are what the frontages show from the pavement). `?tf32=0` leaves both out.
const TF32 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tf32') === '0');
const CYL32 = { c: [-1243.5, 2976.5], p: [-1251.5, 2974.6], r: 8.3, a0: -166.6 * Math.PI / 180, a1: -62.5 * Math.PI / 180, run: 6.0, y: [9.2, 13.0, 13.5, 46.0] };
// TA31: the Square's screen stacks AND the district boards, built here into the tile's own group. The district boards
// used to go through assemble.js poolStatic, whose pool keeps only position/normal/uv, and the TA31 quads carry their
// class, playlist and size in two more attributes; one mesh per tile also frustum-culls, which the pool never did.
function frameMesh(fr) {
  if (!_frameMat) _frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.55, metalness: 0.7 });
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = box.getAttribute('position').array, bn = box.getAttribute('normal').array, nb = bp.length / 3;
  const P = new Float32Array(fr.length * nb * 3), N = new Float32Array(fr.length * nb * 3);
  fr.forEach(([cx, cy, cz, ux, uz, nx, nz, w, h, d], j) => {
    for (let q = 0; q < nb; q++) {
      const lx = bp[q * 3] * w, ly = bp[q * 3 + 1] * h, lz = bp[q * 3 + 2] * d;
      const o = (j * nb + q) * 3;
      P[o] = cx + ux * lx + nx * lz; P[o + 1] = cy + ly; P[o + 2] = cz + uz * lx + nz * lz;
      const ax = bn[q * 3], ay = bn[q * 3 + 1], az = bn[q * 3 + 2];
      N[o] = ux * ax + nx * az; N[o + 1] = ay; N[o + 2] = uz * ax + nz * az;
    }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(P, 3));
  fg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  fg.computeBoundingSphere();
  const fm = new THREE.Mesh(fg, _frameMat);
  fm.castShadow = true; fm.receiveShadow = true; fm.name = 'ta31:frames';
  return fm;
}
function buildTA(recs) {
  ensureTA();
  const G = { pos: [], uv: [], ad: [], sz: [] }, fr = [], used = new Set(), lights = [];
  let curGY = 0;                                   // the ground under the frontage being built (light entries)
  let nScreens = 0, nTick = 0, nDistrict = 0;
  const bar = (cx, cy, cz, ex, ez, nx, nz, w, h, d) => fr.push([cx, cy, cz, ex, ez, nx, nz, w, h, d]);
  // one framed panel: centre (mx, mz) on the wall, width w along (ux, uz), from ya to yb, standing `off` proud
  const panel = (mx, mz, nx, nz, ux, uz, w, ya, yb, off, kind, seed, fw, sync = null) => {
    const cx = mx + nx * off, cz = mz + nz * off, hw = w / 2;
    const A = [cx - ux * hw, ya, cz - uz * hw], B = [cx + ux * hw, ya, cz + uz * hw], C = [cx + ux * hw, yb, cz + uz * hw], D = [cx - ux * hw, yb, cz - uz * hw];
    const q = taPush(G, A, B, C, D, w, yb - ya, kind, seed, sync);
    lights.push({ x: cx, y: (ya + yb) / 2, z: cz, nx, nz, w, h: yb - ya, gy: curGY, ad: q.ad, kind: off < 0.5 ? 'board' : kind === 'ticker' ? 'ticker' : 'screen', print: kind === 'print' });
    const fd = off + 0.12, fcx = mx + nx * (fd / 2), fcz = mz + nz * (fd / 2);
    bar(fcx, ya - fw / 2, fcz, ux, uz, nx, nz, w + 2 * fw, fw, fd);
    bar(fcx, yb + fw / 2, fcz, ux, uz, nx, nz, w + 2 * fw, fw, fd);
    for (const s of [-1, 1]) bar(fcx + ux * s * (hw + fw / 2), (ya + yb) / 2, fcz + uz * s * (hw + fw / 2), ux, uz, nx, nz, fw, yb - ya, fd);
  };
  // TF32: a catwalk w long on the wall at (mx, mz), its deck at y
  const catwalk = (mx, mz, nx, nz, ux, uz, w, y) => {
    const D = 1.3, at = (a, o) => [mx + ux * a + nx * o, mz + uz * a + nz * o];
    for (let k = 0; k < 7; k++) { const [x, z] = at(0, 0.1 + k * 0.19); bar(x, y, z, ux, uz, nx, nz, w, 0.05, 0.05); }
    for (let a = -w / 2; a <= w / 2 + 1e-6; a += w / Math.max(1, Math.round(w / 2.4))) {
      let [x, z] = at(a, D / 2); bar(x, y - 0.2, z, ux, uz, nx, nz, 0.05, 0.35, D);
      [x, z] = at(a, D - 0.03); bar(x, y + 0.5, z, ux, uz, nx, nz, 0.045, 1.0, 0.045);
    }
    const [x, z] = at(0, D - 0.03);
    bar(x, y + 1.0, z, ux, uz, nx, nz, w, 0.05, 0.05);
    bar(x, y + 0.5, z, ux, uz, nx, nz, w, 0.03, 0.03);
  };
  // TF32: the cylindrical screen round building r's corner (CYL32)
  const cylScreen = (r) => {
    const [cx, cz] = CYL32.c, R = CYL32.r + 0.9, nA = 16, pts = [];
    const pa = (a) => [cx + Math.cos(a) * R, cz + Math.sin(a) * R, Math.cos(a), Math.sin(a)];
    // left to right as seen from the street: the 43rd St run's end, then round the arc to the Broadway face
    const e1 = pa(CYL32.a1), tx = -Math.sin(CYL32.a1), tz = Math.cos(CYL32.a1);
    pts.push([e1[0] + tx * CYL32.run, e1[1] + tz * CYL32.run, e1[2], e1[3]]);
    for (let k = 0; k <= nA; k++) pts.push(pa(CYL32.a1 + ((CYL32.a0 - CYL32.a1) * k) / nA));
    const sAt = [0];
    for (let k = 1; k < pts.length; k++) sAt.push(sAt[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const W = sAt[sAt.length - 1], fw = 0.35, fd = 0.9 + 0.12, back = 0.9 - fd / 2;   // rims from the glass to the face
    for (const [ya, yb, kind] of [[r.baseY + CYL32.y[0], r.baseY + CYL32.y[1], 'ticker'], [r.baseY + CYL32.y[2], r.baseY + CYL32.y[3], 'led']]) {
      const q = taQuadData(W, yb - ya, kind, r.colorVar * 53 + (kind === 'ticker' ? 7 : 3)), [u0, v0, u1, v1] = q.uv;
      for (let k = 0; k < pts.length - 1; k++) {
        const A = pts[k], B = pts[k + 1], ua = u0 + ((u1 - u0) * sAt[k]) / W, ub = u0 + ((u1 - u0) * sAt[k + 1]) / W;
        for (const p of [[A[0], ya, A[1]], [B[0], ya, B[1]], [B[0], yb, B[1]], [A[0], ya, A[1]], [B[0], yb, B[1]], [A[0], yb, A[1]]]) G.pos.push(...p);
        G.uv.push(ua, v0, ub, v0, ub, v1, ua, v0, ub, v1, ua, v1);
        for (let j = 0; j < 6; j++) { G.ad.push(...q.ad); G.sz.push(...q.sz); }
        let nx = A[2] + B[2], nz = A[3] + B[3];
        const nl = Math.hypot(nx, nz), sl = Math.hypot(B[0] - A[0], B[1] - A[1]);
        nx /= nl; nz /= nl;
        const bxm = (A[0] + B[0]) / 2 - nx * back, bzm = (A[1] + B[1]) / 2 - nz * back, bw = sl * (k ? (R - back) / R : 1) + 0.06;
        bar(bxm, ya - fw / 2, bzm, nz, -nx, nx, nz, bw, fw, fd);
        bar(bxm, yb + fw / 2, bzm, nz, -nx, nx, nz, bw, fw, fd);
      }
      for (const E of [pts[0], pts[pts.length - 1]]) bar(E[0] - E[2] * back, (ya + yb) / 2, E[1] - E[3] * back, E[3], -E[2], E[2], E[3], fw, yb - ya, fd);
      const m = pts[Math.round(pts.length / 2)];
      lights.push({ x: m[0], y: (ya + yb) / 2, z: m[1], nx: m[2], nz: m[3], w: W, h: yb - ya, gy: curGY, ad: q.ad, kind: kind === 'ticker' ? 'ticker' : 'screen', print: false });
      if (kind === 'ticker') nTick++; else nScreens++;
    }
  };
  // ---- the bowtie's screen stacks (TS28 placement), each split to a shape a real screen has
  for (const r of recs) {
    if (r.height < 12) continue;
    curGY = r.baseY;
    const nR = r.ring.length;
    for (let i = 0; i < nR; i++) {
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      const ex = x2 - x1, ez = z2 - z1, len = Math.hypot(ex, ez);
      if (len < 8) continue;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, [nx, nz] = outwardNormal(r.ring, i);
      const [d, dx, dz] = toAxis(mx, mz);
      if (d > 60 || nx * dx + nz * dz < 0.35) continue;
      const top = Math.min(r.baseY + r.height - 1.5, r.baseY + 48);
      // 4.8, not TS28's 4.2: the dresser's storefront board tops out near 3.9 m, and the stack's 0.8 m-deep bottom
      // frame at 3.9-4.2 m read from the sidewalk as a dark slab laid across every sign under it
      let y0 = r.baseY + 4.8;
      if (top - y0 < 6) continue;
      used.add(r.ring[i]);
      let pk = 0;                                     // this frontage's screens, in order: one player, consecutive cells
      const h = Math.abs(Math.sin((r.colorVar * 977 + i * 31.7) * 12.9898) * 43758.5453) % 1;
      const inset = 0.45, w = len - 2 * inset, ux = nz, uz = -nx;
      if (TF32) catwalk(mx, mz, nx, nz, ux, uz, w + 0.3, y0 - 0.33);   // under the lowest frame (0.2-0.28 m deep)
      // a news / market ticker along the foot of a wide stack (the Square's zippers), then the screens above it
      if (w >= 18 && ((h * 13.7) % 1) < 0.5) {
        panel(mx, mz, nx, nz, ux, uz, w, y0, y0 + 2.1, 0.75, 'ticker', r.colorVar * 31 + i, 0.2);
        nTick++; y0 += 2.1 + 0.5;
      }
      const n = top - y0 > 26 ? (h < 0.45 ? 3 : 2) : top - y0 > 14 ? (h < 0.5 ? 2 : 1) : 1;
      const cuts = [0]; for (let c = 1; c < n; c++) cuts.push(c / n + ((h * (c + 3) * 7) % 1 - 0.5) * 0.18); cuts.push(1);
      for (let c = 0; c < n; c++) {
        const ya = y0 + cuts[c] * (top - y0) + (c ? 0.6 : 0), yb = y0 + cuts[c + 1] * (top - y0) - (c < n - 1 ? 0.6 : 0);
        if (yb - ya < 3) continue;
        const Aq = w / (yb - ya);
        // a tall screen becomes a column of near-square ones, a very wide one two side by side
        const rowsN = Aq < 0.72 ? Math.max(2, Math.round((yb - ya) / (w * 1.05))) : 1;
        const colsN = Aq > 3.6 ? 2 : 1;
        const gap = 0.8, sw = (w - gap * (colsN - 1)) / colsN, shh = ((yb - ya) - gap * (rowsN - 1)) / rowsN;
        for (let a = 0; a < colsN; a++) for (let b = 0; b < rowsN; b++) {
          const along = -w / 2 + sw / 2 + a * (sw + gap);
          const py0 = ya + b * (shh + gap);
          panel(mx + ux * along, mz + uz * along, nx, nz, ux, uz, sw, py0, py0 + shh, 0.7, 'led', r.colorVar * 97 + i * 13 + c * 5 + a * 3 + b, 0.28, [8 + h * 4, (h * 17.3) % 1, pk++]);
          nScreens++;
        }
      }
    }
  }
  if (TF32) for (const r of recs) {
    if (r.height < 150 || !r.ring.some(([x, z]) => Math.hypot(x - CYL32.p[0], z - CYL32.p[1]) < 1.0)) continue;
    curGY = r.baseY;
    cylScreen(r);
  }
  // ---- the district boards (buildBillboards' placement, unchanged) on every wall the stacks did not take
  for (const r of recs) {
    const [cx0, cz0] = r.ring[0];
    if ((cx0 - TSQ[0]) ** 2 + (cz0 - TSQ[1]) ** 2 >= 230 * 230 || !(r.height > 15)) continue;
    curGY = r.baseY;
    if (typeof window !== 'undefined') { window.__TSQBOARDS = window.__TSQBOARDS || { frontages: 0, boards: 0, tiles: 0 }; window.__TSQBOARDS.frontages++; }
    const h = (r.colorVar * 977) % 1;
    if (h > 0.80) continue;
    const nR = r.ring.length, edges = [];
    for (let i = 0; i < nR; i++) { const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR]; edges.push([Math.hypot(x2 - x1, z2 - z1), i]); }
    edges.sort((a2, b2) => b2[0] - a2[0]);
    const pick = edges.slice(0, 3);
    for (let e = 0; e < pick.length; e++) {
      const i = pick[e][1], len = pick[e][0];
      if (used.has(r.ring[i])) continue;
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      const ex = x2 - x1, ez = z2 - z1;
      if (len < 9) continue;
      if (e > 0 && ((h * 31 + e) % 1) > 0.62) continue;
      const [nx, nz] = outwardNormal(r.ring, i);
      const nB = 1 + (h < 0.55 ? 1 : 0) + (h < 0.25 ? 1 : 0);
      for (let k = 0; k < nB; k++) {
        const w = Math.min(len * 0.94, 16 + h * 20);
        const y0 = r.baseY + 6.5, avail = (r.baseY + r.height - 1.5) - y0;
        if (avail < 5) continue;
        const hgt = Math.min(w * (0.55 + ((h * 7) % 1) * 0.5), avail / nB - 2.5);
        if (hgt < 4) continue;
        const cy = y0 + hgt / 2 + k * (hgt + 2.5);
        if (cy + hgt / 2 > r.baseY + r.height - 1.5) continue;
        const mx = x1 + ex * 0.5, mz = z1 + ez * 0.5;
        // a third of the district is digital now; the rest are lit vinyl
        const kind = ((h * 53 + k * 0.37 + e * 0.19) % 1) < 0.35 ? 'led' : 'print';
        panel(mx, mz, nx, nz, nz, -nx, w, cy - hgt / 2, cy + hgt / 2, 0.35, kind, r.colorVar * 211 + e * 7 + k, 0.22);
        nDistrict++;
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.__TSQBOARDS = window.__TSQBOARDS || { frontages: 0, boards: 0, tiles: 0 };
    window.__TSQBOARDS.boards += nDistrict; if (nDistrict) window.__TSQBOARDS.tiles++;
    window.__TS28 = (window.__TS28 || 0) + nScreens;
    window.__TA31 = window.__TA31 || { screens: 0, tickers: 0, district: 0 };
    window.__TA31.screens += nScreens; window.__TA31.tickers += nTick; window.__TA31.district += nDistrict;
  }
  if (!G.pos.length) return null;
  console.log(`[ta31] ${nScreens} screens, ${nTick} tickers, ${nDistrict} district boards`);
  const grp = new THREE.Group();
  grp.name = 'ta31:boards';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
  geo.setAttribute('aAd', new THREE.Float32BufferAttribute(G.ad, 4));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(G.sz, 2));
  geo.computeBoundingSphere();
  geo.userData.ta31 = true;
  const mesh = new THREE.Mesh(geo, taMat);
  mesh.renderOrder = 2; mesh.name = 'ts28:screen';
  mesh.userData.ta31Lights = lights; taMeshes.add(mesh);
  grp.add(mesh);
  if (fr.length) grp.add(frameMesh(fr));
  return grp;
}

export function buildTsqScreens(recs) {
  if (!TS28) return null;
  if (TA31) return buildTA(recs);
  ensure();
  const pos = [], uv = [], fr = [];
  let k = 0;
  const quad = (A, B, C, D, u0, v0, u1, v1) => {
    for (const p of [A, B, C, A, C, D]) pos.push(...p);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  const bar = (cx, cy, cz, ex, ez, nx, nz, w, h, d) => fr.push([cx, cy, cz, ex, ez, nx, nz, w, h, d]);
  for (const r of recs) {
    if (r.height < 12) continue;
    const nR = r.ring.length;
    for (let i = 0; i < nR; i++) {
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      const ex = x2 - x1, ez = z2 - z1, len = Math.hypot(ex, ez);
      if (len < 8) continue;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, [nx, nz] = outwardNormal(r.ring, i);
      const [d, dx, dz] = toAxis(mx, mz);
      if (d > 60 || nx * dx + nz * dz < 0.35) continue;
      const top = Math.min(r.baseY + r.height - 1.5, r.baseY + 48), y0 = r.baseY + 4.2;
      if (top - y0 < 6) continue;
      // one to three screens up the frontage (hash of the building + edge), split at random heights
      const h = Math.abs(Math.sin((r.colorVar * 977 + i * 31.7) * 12.9898) * 43758.5453) % 1;
      const n = top - y0 > 26 ? (h < 0.45 ? 3 : 2) : top - y0 > 14 ? (h < 0.5 ? 2 : 1) : 1;
      const cuts = [0]; for (let c = 1; c < n; c++) cuts.push(c / n + ((h * (c + 3) * 7) % 1 - 0.5) * 0.18); cuts.push(1);
      const inset = 0.45, w = len - 2 * inset, ux = nz, uz = -nx;
      for (let c = 0; c < n; c++) {
        const ya = y0 + cuts[c] * (top - y0) + (c ? 0.6 : 0), yb = y0 + cuts[c + 1] * (top - y0) - (c < n - 1 ? 0.6 : 0);
        if (yb - ya < 3) continue;
        const off = 0.7, cx = mx + nx * off, cz = mz + nz * off, hw = w / 2;
        const A = [cx - ux * hw, ya, cz - uz * hw], B = [cx + ux * hw, ya, cz + uz * hw], C = [cx + ux * hw, yb, cz + uz * hw], D = [cx - ux * hw, yb, cz - uz * hw];
        const [u0, v0, u1, v1] = boardUVRect(k++ * 7 + i * 3 + ((h * 16) | 0));
        quad(A, B, C, D, u0, v0, u1, v1);
        // the frame: four bars round the screen, a little proud of it and back to the wall
        const fw = 0.28, fd = off + 0.12, fcx = mx + nx * (fd / 2), fcz = mz + nz * (fd / 2);
        bar(fcx, ya - fw / 2, fcz, ux, uz, nx, nz, w + 2 * fw, fw, fd);
        bar(fcx, yb + fw / 2, fcz, ux, uz, nx, nz, w + 2 * fw, fw, fd);
        for (const s of [-1, 1]) bar(fcx + ux * s * (hw + fw / 2), (ya + yb) / 2, fcz + uz * s * (hw + fw / 2), ux, uz, nx, nz, fw, yb - ya, fd);
      }
    }
  }
  if (!pos.length) return null;
  const G = new THREE.Group();
  G.name = 'ts28:screens';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2; mesh.name = 'ts28:screen';
  G.add(mesh);
  // frames: one merged box mesh (a unit box per bar, stretched and turned to the wall)
  if (!_frameMat) _frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.55, metalness: 0.7 });
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = box.getAttribute('position').array, bn = box.getAttribute('normal').array, nb = bp.length / 3;
  const P = new Float32Array(fr.length * nb * 3), N = new Float32Array(fr.length * nb * 3);
  fr.forEach(([cx, cy, cz, ux, uz, nx, nz, w, h, d], j) => {
    for (let q = 0; q < nb; q++) {
      const lx = bp[q * 3] * w, ly = bp[q * 3 + 1] * h, lz = bp[q * 3 + 2] * d;   // x along the wall, z outward
      const o = (j * nb + q) * 3;
      P[o] = cx + ux * lx + nx * lz; P[o + 1] = cy + ly; P[o + 2] = cz + uz * lx + nz * lz;
      const ax = bn[q * 3], ay = bn[q * 3 + 1], az = bn[q * 3 + 2];
      N[o] = ux * ax + nx * az; N[o + 1] = ay; N[o + 2] = uz * ax + nz * az;
    }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(P, 3));
  fg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  fg.computeBoundingSphere();
  const fm = new THREE.Mesh(fg, _frameMat);
  fm.castShadow = true; fm.receiveShadow = true; fm.name = 'ts28:frames';
  G.add(fm);
  console.log(`[ts28] ${pos.length / 18} screens on the Square's frontages`);
  if (typeof window !== 'undefined') window.__TS28 = (window.__TS28 || 0) + pos.length / 18;
  return G;
}

export function buildBillboards(recs) {
  if (TA31) return null;          // built with the screens (buildTA), into the tile's group
  const near = recs.filter((r) => {
    const [cx, cz] = r.ring[0];
    return (cx - TSQ[0]) ** 2 + (cz - TSQ[1]) ** 2 < 230 * 230 && r.height > 15;
  });
  // one line per tile that has ANY candidate frontage, and window.__TSQBOARDS,
  // because "the district is blank" and "the district was never built" look
  // identical in a frame and the old code returned null in silence (critic r5
  // #19). If a tile near the Square reports 0 boards from N frontages, the
  // placement gates below are what to look at, not the atlas.
  if (typeof window !== 'undefined') {
    window.__TSQBOARDS = window.__TSQBOARDS || { frontages: 0, boards: 0, tiles: 0 };
    if (near.length) { window.__TSQBOARDS.frontages += near.length; window.__TSQBOARDS.tiles++; }
  }
  if (!near.length) return null;
  ensure();
  const pos = [], uv = [];
  const slotOf = (h, k) => (Math.abs((h * 9781 + k * 3167) | 0)) % (GRID * GRID);
  for (const r of near) {
    const h = (r.colorVar * 977) % 1;
    // The sign district is dense but not universal, and the normal fix above
    // turned 405 built boards into 405 VISIBLE ones across a 300 m radius —
    // which spills onto ordinary Midtown blocks. 230 m is about the bowtie
    // plus a block each way, and a fifth of frontages stay bare.
    if (h > 0.80) continue;
    // Boards go on the THREE LONGEST walls, not on frontIdx + its neighbours.
    // A Times Square frontage is often a chamfered or L-shaped footprint whose
    // compiler-scored front edge is a 6 m corner cut, and the old code took
    // that edge, failed its own `len < 10` gate and placed nothing at all —
    // which is a large part of why the district read as bare (critic r5 #19).
    // Longest-first also puts the biggest board on the biggest wall, and a
    // corner building ends up clad on two sides the way the real ones are.
    const nR = r.ring.length;
    const edges = [];
    for (let i = 0; i < nR; i++) {
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      edges.push([Math.hypot(x2 - x1, z2 - z1), i]);
    }
    edges.sort((a2, b2) => b2[0] - a2[0]);
    const pick = edges.slice(0, 3);
    for (let e = 0; e < pick.length; e++) {
      const i = pick[e][1];
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      const ex = x2 - x1, ez = z2 - z1;
      const len = pick[e][0];
      if (len < 9) continue;
      if (e > 0 && ((h * 31 + e) % 1) > 0.62) continue;
      const dEdge = e;
      // OUTWARD normal. This one line is why the district read as blank.
      // Under this project's ring winding (ez, -ex) points INTO the building —
      // shopSigns.js has been living with it for rounds (its own comment: "at
      // 0.10 the sign sat 1 cm INSIDE it and only polygonOffset kept it
      // visible"), and at the 0.35 m standoff a board wants, polygonOffset
      // cannot rescue it: every board was built 35 cm inside its own facade and
      // culled by the wall. buildBillboards was reporting 405 boards across five
      // tiles at Times Square while the frame showed none.
      const [nx, nz] = TS28 ? outwardNormal(r.ring, i) : [-ez / len, ex / len];
      const nB = 1 + (h < 0.55 ? 1 : 0) + (h < 0.25 ? 1 : 0);
      for (let k = 0; k < nB; k++) {
        const slot = slotOf(h, k + dEdge * 5);
        const u0 = (slot % GRID) / GRID, v1 = 1 - ((slot / GRID) | 0) / GRID;
        const u1 = u0 + 1 / GRID, v0 = v1 - 1 / GRID;
        // bigger than the old 14-24 m: the Square's boards run the full
        // frontage, and a board narrower than its building reads as a poster.
        // Height is CLAMPED to what the building actually has above the
        // storefront rather than tested after the fact — the old code computed
        // a 13 m board on a 16 m building and then `continue`d, so every
        // mid-rise frontage in the district silently got nothing.
        const w = Math.min(len * 0.94, 16 + h * 20);
        const y0 = r.baseY + 6.5;
        const avail = (r.baseY + r.height - 1.5) - y0;
        if (avail < 5) continue;
        const hgt = Math.min(w * (0.55 + ((h * 7) % 1) * 0.5), avail / nB - 2.5);
        if (hgt < 4) continue;
        const cy = y0 + hgt / 2 + k * (hgt + 2.5);
        if (cy + hgt / 2 > r.baseY + r.height - 1.5) continue;
        const cx = x1 + ex * 0.5 + nx * 0.35, cz = z1 + ez * 0.5 + nz * 0.35;
        const hx = nz * w / 2, hz = -nx * w / 2;   // along the wall, from the normal (the same as the edge unflipped)
        const A = [cx - hx, cy - hgt / 2, cz - hz], B = [cx + hx, cy - hgt / 2, cz + hz];
        const C = [cx + hx, cy + hgt / 2, cz + hz], D = [cx - hx, cy + hgt / 2, cz - hz];
        for (const p of [A, B, C, A, C, D]) pos.push(...p);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      }
    }
  }
  const nB2 = pos.length / 18;
  if (typeof window !== 'undefined' && window.__TSQBOARDS) window.__TSQBOARDS.boards += nB2;
  console.log('[billboards] ' + near.length + ' frontages near Times Square -> ' + nB2 + ' boards');
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}
