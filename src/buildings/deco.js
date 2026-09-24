// Art Deco brick apartment / office mid-rise — the Grand Concourse / Central
// Park West type, 10-18 stories.  1916-zoning SETBACK massing with terraces at
// each step; continuous brick piers running unbroken from the belt course to
// stepped ziggurat pier-tops; windows sunk in recessed vertical stripes with
// two-tone header-brick spandrel panels between them; cast-stone stepped
// entrance portal with a metal-and-glass door and a marquee.
//
// Refs: Park Plaza Apts 1005 Jerome Av + Noonan Plaza (Horace Ginsbern &
// Marvin Fine, 1931), 910 Grand Concourse.  See refs/deco-ATTRIBUTION.md.
import * as THREE from 'three';
import { at, punchedWall, shellWalls, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, compose, profileAlongX, ensureColor, shadeYRange } from '../geo.js';
import { brickTexture, stoneTexture, makeCanvas } from '../textures.js';

export const TYPE = 'deco';

const q05 = (v) => Math.round(v * 20) / 20;
const q10 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// PATTERNED-BRICK PANEL TEXTURE  (the 'deco:spandrel' bake)
// Header-brick geometric motifs on a buff field, 1 m tile: 10 header columns
// (0.102 m) x 15 courses (0.067 m) so the coursing matches the wall brick.
// Baked bevel (light top / dark bottom + a cast shadow left of every
// projecting header) plus a real bumpMap, so the relief survives flat noon
// light instead of relying on golden-hour raking sun.
// ---------------------------------------------------------------------------
// Motifs are laid out on WHOLE BRICK units — 5 stretchers across (0.204 m each)
// by N courses (0.0667 m).  One motif repeat is therefore ~1.0 m wide, the
// scale that actually reads at 30 m (Noonan Plaza's fret band).
const MOTIF = {
  // Greek fret / meander — the Noonan Plaza panel.  0.61 x 0.41 m module.
  fret: [
    '###',
    '#..',
    '#.#',
    '#..',
    '###',
    '...',
  ],
  // running zigzag / chevron band
  chev: [
    '#..',
    '.#.',
    '..#',
    '..#',
    '.#.',
    '#..',
  ],
  // lozenge diaper
  dia: [
    '.#.',
    '#.#',
    '.#.',
  ],
  // basketweave with soldier bands
  band: [
    '###',
    '...',
    '#.#',
    '...',
  ],
};

function finishTex(canvas, tileMeters, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.tileMeters = tileMeters;
  return t;
}

function panelTexture({ motif = 'chev', size = 512, seed = 3 } = {}) {
  const tileMeters = 1.224;                     // 6 stretchers wide
  const cols = 6, rows = 18;                    // 0.204 m stretchers / 0.068 m courses
  const cw = size / cols, ch = size / rows;
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pat = MOTIF[motif] || MOTIF.chev;

  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), gb = b.getContext('2d');
  g.fillStyle = '#9c9488'; g.fillRect(0, 0, size, size);          // mortar
  gb.fillStyle = '#424242'; gb.fillRect(0, 0, size, size);
  const jx = cw * 0.05, jy = ch * 0.15;

  for (let r = 0; r < rows; r++) {
    const prow = pat[r % pat.length];
    for (let cc = 0; cc < cols; cc++) {
      const dark = prow[cc % prow.length] === '#';
      const x = cc * cw, y = r * ch;
      const bw = cw - jx, bh = ch - jy;
      // field baked NEUTRAL-warm at ~58% so a per-brick tint lands it on the
      // wall colour exactly; the accent bricks stay a hard dark red-brown
      const hue = dark ? 16 + rnd() * 8 : 31 + rnd() * 6;
      const sat = dark ? 28 + rnd() * 12 : 5 + rnd() * 5;
      const lig = dark ? 25 + rnd() * 6 : 56 + rnd() * 6;
      g.fillStyle = `hsl(${hue},${sat}%,${lig}%)`;
      g.fillRect(x, y + jy / 2, bw, bh);
      const k = dark ? 0.26 : 0.08;                                 // fake bevel
      g.fillStyle = `rgba(255,255,255,${k})`;
      g.fillRect(x, y + jy / 2, bw, bh * 0.22);
      g.fillStyle = `rgba(0,0,0,${k * 1.4})`;
      g.fillRect(x, y + jy / 2 + bh * 0.78, bw, bh * 0.22);
      if (dark) {
        g.fillStyle = 'rgba(0,0,0,0.26)';                           // cast shadow
        g.fillRect(x - jx * 2.2, y + jy / 2, jx * 2.2, bh);
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
        g.fillRect(x + bw * rnd() * 0.5, y + jy / 2 + bh * rnd() * 0.4, bw * 0.4, bh * 0.4);
      }
      gb.fillStyle = `hsl(0,0%,${dark ? 92 : 56}%)`;
      gb.fillRect(x, y + jy / 2, bw, bh);
    }
  }
  return { map: finishTex(c, tileMeters), bumpMap: finishTex(b, tileMeters, false), tileMeters };
}

// Polychrome terracotta belt band (Park Plaza's blue/vermilion/ochre fans).
function tcBandTexture({ size = 512, seed = 11 } = {}) {
  const tileMeters = 1.0;
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), gb = b.getContext('2d');
  g.fillStyle = '#d9cdb2'; g.fillRect(0, 0, size, size);
  gb.fillStyle = '#7a7a7a'; gb.fillRect(0, 0, size, size);
  const cols = ['#1e5457', '#a8331c', '#c08423', '#173a58', '#d6c9a6'];
  const cell = size / 2;                                            // 0.5 m motif
  for (let i = 0; i < 2; i++) {
    const x0 = i * cell;
    for (const [y0, hh] of [[size * 0.05, size * 0.11], [size * 0.84, size * 0.11]]) {
      g.fillStyle = cols[3]; g.fillRect(x0, y0, cell, hh);
      g.fillStyle = cols[2];
      for (let k = 0; k < 5; k++) g.fillRect(x0 + k * cell / 5, y0 + hh * 0.25, cell / 10, hh * 0.5);
    }
    const cx = x0 + cell / 2, cy = size * 0.80, R = size * 0.42;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, Math.PI + (k / 7) * Math.PI, Math.PI + ((k + 1) / 7) * Math.PI);
      g.closePath();
      g.fillStyle = cols[k % 3 === 0 ? 0 : k % 3 === 1 ? 1 : 2];
      g.fill();
    }
    g.fillStyle = cols[4];
    g.beginPath(); g.arc(cx, cy, size * 0.085, Math.PI, 0); g.closePath(); g.fill();
    gb.fillStyle = '#c8c8c8';
    gb.beginPath(); gb.arc(cx, cy, R * 0.98, Math.PI, 0); gb.closePath(); gb.fill();
  }
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(0,0,0,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.20)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return { map: finishTex(c, tileMeters), bumpMap: finishTex(b, tileMeters, false), tileMeters };
}

// Gravity-driven grime mask, drawn on WHITE and composited with MULTIPLY
// blending so it darkens whatever masonry it sits on: a hard soiled edge at
// the top (right under a sill or coping) with runoff streaks falling away.
function sootTexture({ size = 256, seed = 7 } = {}) {
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(22,19,16,0.80)');
  grad.addColorStop(0.12, 'rgba(40,36,31,0.48)');
  grad.addColorStop(0.5, 'rgba(64,58,50,0.20)');
  grad.addColorStop(1, 'rgba(90,84,74,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 30; i++) {
    const x = rnd() * size, w = 1.5 + rnd() * (size * 0.045);
    const h = size * (0.18 + rnd() * 0.78);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(34,30,26,${0.18 + rnd() * 0.34})`);
    gr.addColorStop(0.6, `rgba(70,64,56,${0.05 + rnd() * 0.12})`);
    gr.addColorStop(1, 'rgba(120,114,102,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, h);
  }
  // a few wider wash fans where water sheets off a corner
  for (let i = 0; i < 4; i++) {
    const x = rnd() * size, w = size * (0.1 + rnd() * 0.2);
    const gr = g.createLinearGradient(0, 0, 0, size * 0.7);
    gr.addColorStop(0, `rgba(48,44,38,${0.10 + rnd() * 0.14})`);
    gr.addColorStop(1, 'rgba(140,134,124,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, size * 0.7);
  }
  return { map: finishTex(c, 1, false) };
}

// ---------------------------------------------------------------------------
// MATERIALS (registered once, materials.js untouched)
// ---------------------------------------------------------------------------
function ensureMats(B) {
  if (B.M.has('deco:brickBuff')) return;
  const mk = (name, tex, opts) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, bumpMap: tex.bumpMap || null, ...opts,
    });
    m.userData.tileMeters = tex.tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  // buff brick #CBB48F — Noonan Plaza, 910 Grand Concourse.  Mortar is DARKER
  // than the brick so the horizontal coursing grid still reads at 30 m.
  mk('deco:brickBuff', brickTexture({
    hue: 36, sat: 15, light: 60, dh: 6, ds: 9, dl: 11,
    mortar: '#9f9784', darkBrickChance: 0.06, darkBrickColor: 'hsl(28, 18%, 42%)', seed: 91,
  }), { bumpScale: 1.35, roughness: 0.9, envMapIntensity: 0.5 });
  // tan / ochre brick #BFA079 — Park Plaza on Jerome Av
  mk('deco:brickTan', brickTexture({
    hue: 32, sat: 23, light: 51, dh: 6, ds: 10, dl: 11,
    mortar: '#948b79', darkBrickChance: 0.06, darkBrickColor: 'hsl(24, 22%, 34%)', seed: 92,
  }), { bumpScale: 1.4, roughness: 0.9, envMapIntensity: 0.5 });
  // grey-brown / mottled brick #A79684
  mk('deco:brickGrey', brickTexture({
    hue: 28, sat: 12, light: 50, dh: 7, ds: 8, dl: 12,
    mortar: '#8d877b', darkBrickChance: 0.08, darkBrickColor: 'hsl(26, 14%, 32%)', seed: 98,
  }), { bumpScale: 1.35, roughness: 0.91, envMapIntensity: 0.48 });
  // rose / orange-red brick #9E5F44 — the warmer Concourse houses
  mk('deco:brickRose', brickTexture({
    hue: 16, sat: 26, light: 40, dh: 6, ds: 11, dl: 11,
    mortar: '#8f8577', darkBrickChance: 0.07, seed: 93,
  }), { bumpScale: 1.45, roughness: 0.91, envMapIntensity: 0.48 });
  // dark orange header brick #8E4F2E — pattern work, soldier & dogtooth courses
  mk('deco:brickHeader', brickTexture({
    hue: 20, sat: 44, light: 34, dh: 5, ds: 11, dl: 8, flemish: true,
    mortar: '#8d8073', darkBrickChance: 0.08, seed: 94,
  }), { bumpScale: 1.3, roughness: 0.9, envMapIntensity: 0.5 });
  // red common brick — party / rear / court walls (never a yellow-olive)
  mk('deco:brickCommon', brickTexture({
    hue: 15, sat: 24, light: 38, dh: 6, ds: 10, dl: 11,
    mortar: '#7d746a', darkBrickChance: 0.07, seed: 95,
  }), { bumpScale: 1.25, roughness: 0.93, envMapIntensity: 0.42 });
  // cast stone — GREYER than the brick, never brighter (the biggest CG tell)
  mk('deco:castStone', stoneTexture({
    base: '#b3ada0', blockW: 0.62, blockH: 0.34, jointDark: 0.26, weather: 0.18, seed: 96,
  }), { roughness: 0.82, metalness: 0.02, envMapIntensity: 0.6 });
  // soiled cast stone for the street-level plinth
  mk('deco:stoneSoil', stoneTexture({
    base: '#9c968a', blockW: 0.66, blockH: 0.30, jointDark: 0.32, weather: 0.28, seed: 97,
  }), { roughness: 0.88, envMapIntensity: 0.45 });
  // patterned spandrel panels
  mk('deco:panelChev', panelTexture({ motif: 'chev', seed: 101 }), { bumpScale: 1.6, roughness: 0.88, envMapIntensity: 0.55 });
  mk('deco:panelDia', panelTexture({ motif: 'dia', seed: 102 }), { bumpScale: 1.6, roughness: 0.88, envMapIntensity: 0.55 });
  mk('deco:panelFret', panelTexture({ motif: 'fret', seed: 103 }), { bumpScale: 1.6, roughness: 0.88, envMapIntensity: 0.55 });
  mk('deco:panelBand', panelTexture({ motif: 'band', seed: 104 }), { bumpScale: 1.5, roughness: 0.88, envMapIntensity: 0.55 });
  mk('deco:tcBand', tcBandTexture({ seed: 105 }), { bumpScale: 1.1, roughness: 0.36, metalness: 0.04, envMapIntensity: 0.85 });
  // dark oxidised bronze — deco doors, marquee, sconces
  const bz = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0x342e27, roughness: 0.46, metalness: 0.6, envMapIntensity: 0.7,
  });
  bz.userData.tileMeters = 1; bz.name = 'deco:bronze';
  B.M.set('deco:bronze', bz);
  // grime decal — multiply blend, never writes depth
  const soot = new THREE.MeshBasicMaterial({
    map: sootTexture({ seed: 111 }).map, vertexColors: true,
    transparent: true, depthWrite: false, toneMapped: false,
    premultipliedAlpha: true, blending: THREE.MultiplyBlending,
  });
  soot.userData.tileMeters = 1; soot.name = 'deco:soot';
  B.M.set('deco:soot', soot);
}

// grime decal quad: anchored x-centred, y = TOP of the streak, hanging down
function pSoot(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `deco:soot:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const g = quad(w, h);
  g.translate(0, -h, 0);
  // tile the mask every ~1.6 m across so wide runs don't smear into blobs
  const uv = g.attributes.uv;
  const rep = Math.max(1, Math.round(w / 1.6));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i));
  uv.needsUpdate = true;
  B.definePart(id, g, 'deco:soot', { castShadow: false, receiveShadow: false });
  return id;
}

// ---------------------------------------------------------------------------
// EXTRUDED PROFILES — profileAlongX throws the profile toward LOCAL -Z, so
// every placement adds ry = PI to swing it out over the street.
// ---------------------------------------------------------------------------
const PROF = {
  // stepped belt course over the base: proj 0.20, h 0.44
  belt: [[0, 0], [0.20, 0.0], [0.20, 0.13], [0.14, 0.13], [0.14, 0.28], [0.08, 0.28], [0.08, 0.44], [0, 0.44]],
  // thin string course: proj 0.07, h 0.16
  string: [[0, 0], [0.07, 0], [0.07, 0.12], [0.045, 0.16], [0, 0.16]],
  // granite water table: proj 0.09, h 0.30
  water: [[0, 0], [0.09, 0], [0.09, 0.22], [0.05, 0.29], [0.05, 0.30], [0, 0.30]],
  // corbelled brick step under the coping: proj 0.19, h 0.42
  corbel: [[0, 0], [0.06, 0], [0.06, 0.14], [0.12, 0.14], [0.12, 0.28], [0.19, 0.28], [0.19, 0.42], [0, 0.42]],
};

// ---------------------------------------------------------------------------
// INSTANCED PARTS
// ---------------------------------------------------------------------------
// patterned spandrel panel framed by proud soldier courses.
// Anchor: x centred, y = panel bottom, z = 0 at the recessed wall face.
function pPanel(B, mat, w, h) {
  w = q05(w); h = q05(h);
  const id = `deco:pan:${mat}:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const main = box(w, h, 0.075, { segY: 1 });
  boxUV(main, w, h, 0.075, 1.224);
  const items = [{ geom: main, x: 0, y: 0, z: 0.0075 }];
  for (const [y, hh] of [[-0.09, 0.09], [h, 0.09]]) {
    const rib = box(w + 0.06, hh, 0.135, { segY: 1 });
    boxUV(rib, w + 0.06, hh, 0.135, 1.224);
    ensureColor(rib, new THREE.Color(0.72, 0.63, 0.55));
    items.push({ geom: rib, x: 0, y, z: 0.028 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// ---------------------------------------------------------------------------
// DECO SASH — 1/1 (or 2/2) double hung in a deep reveal.  Built here rather
// than taken from the kit so the room tone, shade height and glass value stay
// under this module's control: on these buildings the windows must be the
// DARKEST thing on the elevation.
// Anchor: x centred, y = sill line, z = 0 at the (recessed) wall face.
// ---------------------------------------------------------------------------
const WIN_REC = 0.20;
function pWin(B, w, h, style) {
  w = q05(w); h = q05(h);
  const id = `deco:win:${w}x${h}:${style}`;
  if (B.hasPart(id)) return id;
  const rec = WIN_REC, sl = 0.045;
  const items = [];
  const dk = new THREE.Color(0.12, 0.115, 0.11);
  const mk = (g) => { ensureColor(g, dk); return g; };
  // jamb + head reveal, unlit
  items.push({ geom: mk(box(w + 0.03, 0.035, rec, { segY: 1 })), x: 0, y: h, z: -rec / 2 });
  for (const s of [-1, 1]) items.push({ geom: mk(box(0.035, h, rec, { segY: 1 })), x: s * (w / 2 + 0.008), y: 0, z: -rec / 2 });
  const fz = -rec + 0.035;
  items.push({ geom: box(w, sl * 1.4, 0.065, { segY: 1 }), x: 0, y: 0, z: fz });
  items.push({ geom: box(w, sl, 0.065, { segY: 1 }), x: 0, y: h - sl, z: fz });
  for (const s of [-1, 1]) items.push({ geom: box(sl, h, 0.065, { segY: 1 }), x: s * (w / 2 - sl / 2), y: 0, z: fz });
  // meeting rail proud of the sash — the double-hung signature
  items.push({ geom: box(w - sl, sl * 1.2, 0.085, { segY: 1 }), x: 0, y: h * 0.505, z: fz + 0.012 });
  if (style === 'dh2') {
    for (const [y0, y1] of [[sl * 1.4, h * 0.505], [h * 0.505 + sl * 1.2, h - sl]]) {
      items.push({ geom: box(0.022, y1 - y0, 0.05, { segY: 1 }), x: 0, y: y0, z: fz });
    }
  }
  B.definePart(id, compose(items), 'windowFrame');
  // opaque room behind the glass, tinted per instance
  const room = quad(w + 0.08, h + 0.08);
  room.translate(0, -0.04, -rec - 0.07);
  B.definePart(id + ':room', room, 'paintFlat', { castShadow: false, receiveShadow: false });
  const gq = quad(w - sl * 1.3, h - sl * 1.8);
  gq.translate(0, sl * 1.1, -rec + 0.058);
  B.definePart(id + ':glass', gq, 'glass', { castShadow: false });
  // roller shades pulled to three different heights
  for (let v = 0; v < 3; v++) {
    const f = [0.30, 0.52, 0.76][v];
    const hs = (h - sl * 2) * f;
    const sq = quad(w - sl * 2.2, hs);
    sq.translate(0, h - sl - hs, -rec + 0.026);
    B.definePart(`${id}:shade${v}`, sq, 'paintFlat', { castShadow: false, receiveShadow: false });
  }
  const lg = quad(w - sl * 1.8, h - sl * 2.4);
  lg.translate(0, sl * 1.4, -rec + 0.07);
  B.definePart(id + ':lit', lg, 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
  return id;
}

// dogtooth course: 1 m strip of five bricks turned 45 deg in plan
function pDtooth(B, mat) {
  const id = `deco:dtooth:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  for (let i = 0; i < 5; i++) {
    const g = box(0.105, 0.072, 0.105, { segY: 1 });
    boxUV(g, 0.105, 0.072, 0.105, 2);
    items.push({ geom: g, x: -0.4 + i * 0.2, y: 0, z: 0, ry: Math.PI / 4 });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// cast-stone cap for a pier fin
function pFinCap(B, w, d) {
  w = q05(w); d = q05(d);
  const id = `deco:fincap:${w}x${d}`;
  if (B.hasPart(id)) return id;
  const a = box(w + 0.10, 0.10, d + 0.10, { segY: 1 }); boxUV(a, w + 0.10, 0.10, d + 0.10, 2);
  const b2 = box(w - 0.04, 0.055, d - 0.04, { segY: 1 }); boxUV(b2, w - 0.04, 0.055, d - 0.04, 2);
  B.definePart(id, compose([{ geom: a, x: 0, y: -0.03, z: 0 }, { geom: b2, x: 0, y: 0.07, z: 0 }]), 'deco:castStone');
  return id;
}

// carved cast-stone fan / shell ornament at a pier top (Park Plaza)
function pFan(B) {
  const id = 'deco:fan';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.66, 0.13, 0.14, { segY: 1 }), x: 0, y: 0, z: 0.05 });
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;
    const h = 0.32 - Math.abs(t) * 0.11;
    items.push({ geom: box(0.09, h, 0.11, { segY: 1 }), x: t * 0.21, y: 0.11, z: 0.05, rz: -t * 0.28 });
  }
  items.push({ geom: box(0.74, 0.08, 0.17, { segY: 1 }), x: 0, y: 0.42, z: 0.06 });
  items.push({ geom: cylinder(0.055, 0.055, 0.14, 8), x: 0, y: 0.11, z: 0.10, rx: Math.PI / 2 });
  B.definePart(id, compose(items), 'deco:castStone');
  return id;
}

// vertical fluted cast-stone strip (portal jambs)
function pFlute(B, h, w, ribs) {
  h = q10(h); w = q05(w);
  const id = `deco:flute:${w}x${h}:${ribs}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const back = box(w, h, 0.07, { segY: 2 }); boxUV(back, w, h, 0.07, 2);
  items.push({ geom: back, x: 0, y: 0, z: 0.015 });
  const rw = (w / ribs) * 0.56;
  for (let i = 0; i < ribs; i++) {
    const g = box(rw, h - 0.05, 0.10, { segY: 2 }); boxUV(g, rw, h - 0.05, 0.10, 2);
    items.push({ geom: g, x: -w / 2 + (w / ribs) * (i + 0.5), y: 0, z: 0.05 });
  }
  // stepped cap
  const cap = box(w + 0.08, 0.14, 0.15, { segY: 1 }); boxUV(cap, w + 0.08, 0.14, 0.15, 2);
  items.push({ geom: cap, x: 0, y: h - 0.05, z: 0.045 });
  B.definePart(id, compose(items), 'deco:castStone');
  return id;
}

// stepped cast-stone plaque with a chevron relief (over the entrance)
function pPlaque(B, w) {
  w = q05(w);
  const id = `deco:plaque:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const a = box(w, 0.92, 0.10, { segY: 1 }); boxUV(a, w, 0.92, 0.10, 2);
  items.push({ geom: a, x: 0, y: 0, z: 0.02 });
  const b2 = box(w - 0.30, 0.70, 0.07, { segY: 1 }); boxUV(b2, w - 0.30, 0.70, 0.07, 2);
  ensureColor(b2, new THREE.Color(0.9, 0.89, 0.86));
  items.push({ geom: b2, x: 0, y: 0.11, z: 0.075 });
  const n = Math.max(2, Math.round((w - 0.7) / 0.30));
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) / 2) * 0.30 + i * 0.30;
    for (let k = 0; k < 3; k++) {
      for (const yb of [0.24, 0.50]) {
        const g = box(0.075, 0.085, 0.05, { segY: 1 });
        ensureColor(g, new THREE.Color(0.8, 0.76, 0.7));
        items.push({ geom: g, x: x - 0.08 + k * 0.08, y: yb + Math.abs(k - 1) * 0.09, z: 0.105 });
      }
    }
  }
  B.definePart(id, compose(items), 'deco:castStone');
  return id;
}

// metal-and-glass deco entrance door: bronze frame + stepped-sunburst grille
function pDoor(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `deco:door:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const rd = 0.44;
  const items = [];
  const dk = (g) => { ensureColor(g, new THREE.Color(0.16, 0.15, 0.14)); return g; };
  items.push({ geom: dk(box(w + 0.08, 0.05, rd, { segY: 1 })), x: 0, y: h, z: -rd / 2 });
  for (const s of [-1, 1]) items.push({ geom: dk(box(0.05, h, rd, { segY: 1 })), x: s * (w / 2 + 0.025), y: 0, z: -rd / 2 });
  const doorH = h - 0.74;
  const leaves = w > 1.3 ? 2 : 1;
  const lw = (w - 0.05) / leaves;
  for (let l = 0; l < leaves; l++) {
    const cx = -w / 2 + 0.025 + lw * (l + 0.5);
    items.push({ geom: box(lw, 0.16, 0.07, { segY: 1 }), x: cx, y: 0, z: -rd + 0.06 });
    items.push({ geom: box(lw, 0.11, 0.07, { segY: 1 }), x: cx, y: doorH - 0.11, z: -rd + 0.06 });
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.10, doorH, 0.07, { segY: 1 }), x: cx + s * (lw / 2 - 0.05), y: 0, z: -rd + 0.06 });
    }
    items.push({ geom: box(lw - 0.16, 0.085, 0.085, { segY: 1 }), x: cx, y: doorH * 0.44, z: -rd + 0.065 });
    // stepped-fan grille in the lower bronze panel
    for (let k = 0; k < 5; k++) {
      const t = (k - 2) / 2;
      items.push({ geom: box(0.04, 0.32 - Math.abs(t) * 0.10, 0.045, { segY: 1 }), x: cx + t * lw * 0.22, y: 0.18, z: -rd + 0.08 });
    }
    items.push({ geom: box(lw * 0.60, 0.04, 0.045, { segY: 1 }), x: cx, y: 0.53, z: -rd + 0.08 });
    // vertical muntins in the glazed upper panel
    for (let k = 1; k < 3; k++) {
      items.push({
        geom: box(0.032, doorH * 0.52 - 0.18, 0.045, { segY: 1 }),
        x: cx - lw / 2 + (lw / 3) * k, y: doorH * 0.48 + 0.09, z: -rd + 0.08,
      });
    }
    items.push({ geom: cylinder(0.024, 0.024, 0.66, 6), x: cx + (l === 0 ? 1 : -1) * lw * 0.33, y: 0.95, z: -rd + 0.115 });
  }
  // transom: stepped ziggurat grille
  items.push({ geom: box(w, 0.09, 0.08, { segY: 1 }), x: 0, y: doorH, z: -rd + 0.06 });
  for (let k = 0; k < 7; k++) {
    const t = (k - 3) / 3;
    items.push({ geom: box(0.055, 0.54 - Math.abs(t) * 0.31, 0.055, { segY: 1 }), x: t * w * 0.35, y: doorH + 0.10, z: -rd + 0.075 });
  }
  items.push({ geom: box(w * 0.84, 0.045, 0.055, { segY: 1 }), x: 0, y: doorH + 0.34, z: -rd + 0.075 });
  B.definePart(id, compose(items), 'deco:bronze');
  // glazing: door lights + transom
  const gl = [];
  const g1 = quad(w - 0.18, doorH * 0.52 - 0.20);
  g1.translate(0, doorH * 0.48 + 0.11, -rd + 0.05);
  gl.push({ geom: g1, x: 0, y: 0, z: 0 });
  const g2 = quad(w - 0.08, 0.62);
  g2.translate(0, doorH + 0.09, -rd + 0.05);
  gl.push({ geom: g2, x: 0, y: 0, z: 0 });
  B.definePart(id + ':glass', compose(gl), 'glass', { castShadow: false });
  // warm lobby glow behind the glass
  const lg = quad(w - 0.24, doorH * 0.92);
  lg.translate(0, doorH * 0.36, -rd - 0.04);
  B.definePart(id + ':lobby', lg, 'litWindow', { castShadow: false, receiveShadow: false });
  return id;
}

// bronze-and-glass marquee over the portal
function pMarquee(B, w) {
  w = q05(w);
  const id = `deco:marquee:${w}`;
  if (B.hasPart(id)) return id;
  const pr = 1.75;
  const items = [];
  items.push({ geom: box(w, 0.16, pr, { segY: 1 }), x: 0, y: 0, z: pr / 2 });
  items.push({ geom: box(w + 0.10, 0.26, 0.14, { segY: 1 }), x: 0, y: -0.04, z: pr - 0.07 });
  items.push({ geom: box(w - 0.10, 0.12, 0.09, { segY: 1 }), x: 0, y: 0.22, z: pr - 0.11 });
  for (const s of [-1, 1]) items.push({ geom: box(0.13, 0.20, pr, { segY: 1 }), x: s * (w / 2 - 0.065), y: -0.02, z: pr / 2 });
  for (let k = 0; k < 5; k++) {
    const t = (k - 2) / 2;
    items.push({ geom: box(0.075, 0.32 - Math.abs(t) * 0.12, 0.17, { segY: 1 }), x: t * w * 0.27, y: 0.14, z: pr - 0.075 });
  }
  for (let i = 1; i < 4; i++) {
    items.push({ geom: box(0.055, 0.11, pr - 0.16, { segY: 1 }), x: -w / 2 + (w / 4) * i, y: 0.16, z: pr / 2 });
  }
  const dy = 1.35, dz = pr - 0.28, len = Math.hypot(dy, dz);
  for (const s of [-1, 1]) {
    items.push({ geom: cylinder(0.02, 0.02, len, 6), x: s * (w / 2 - 0.1), y: 0.16, z: pr - 0.22, rx: -Math.atan2(dz, dy) });
  }
  B.definePart(id, compose(items), 'deco:bronze');
  const gq = quad(w - 0.36, pr - 0.32);
  gq.rotateX(Math.PI / 2);
  gq.translate(0, 0.17, 0.17);
  B.definePart(id + ':glass', gq, 'glass', { castShadow: false });
  const so = box(w - 0.42, 0.04, pr * 0.5, { segY: 1 });
  B.definePart(id + ':soffit', so, 'litWindow', { castShadow: false, receiveShadow: false });
  return id;
}

// stepped bronze-and-frosted-glass entry sconce
function pSconce(B) {
  const id = 'deco:sconce';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.22, 0.17, 0.11, { segY: 1 }), x: 0, y: 0, z: 0.05 });
  items.push({ geom: box(0.18, 0.11, 0.18, { segY: 1 }), x: 0, y: 0.84, z: 0.08 });
  for (let k = 0; k < 3; k++) {
    items.push({ geom: box(0.05, 0.72 - k * 0.07, 0.05, { segY: 1 }), x: (k - 1) * 0.07, y: 0.14, z: 0.205 });
  }
  const gl = box(0.20, 0.68, 0.09, { segY: 1 });
  ensureColor(gl, new THREE.Color(2.1, 1.95, 1.5));
  items.push({ geom: gl, x: 0, y: 0.15, z: 0.14 });
  B.definePart(id, compose(items), 'deco:bronze');
  return id;
}

// terrace pipe railing, runs along X, anchored at its base
function pRail(B, w) {
  w = q05(w);
  const id = `deco:rail:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const h = 1.02;
  items.push({ geom: box(w, 0.05, 0.05, { segY: 1 }), x: 0, y: h - 0.05, z: 0 });
  items.push({ geom: box(w, 0.04, 0.04, { segY: 1 }), x: 0, y: h * 0.60, z: 0 });
  items.push({ geom: box(w, 0.04, 0.04, { segY: 1 }), x: 0, y: h * 0.27, z: 0 });
  const n = Math.max(2, Math.round(w / 1.7));
  for (let i = 0; i <= n; i++) {
    items.push({ geom: cylinder(0.028, 0.028, h, 7), x: -w / 2 + (w / n) * i, y: 0, z: 0 });
  }
  B.definePart(id, compose(items), 'steelDark');
  return id;
}

// terrace planter with clipped shrubs
function pPlanter(B) {
  const id = 'deco:planter';
  if (B.hasPart(id)) return id;
  const a = box(1.15, 0.52, 0.62, { segY: 1 }); boxUV(a, 1.15, 0.52, 0.62, 2);
  const b2 = box(1.24, 0.08, 0.71, { segY: 1 }); boxUV(b2, 1.24, 0.08, 0.71, 2);
  B.definePart(id, compose([{ geom: a, x: 0, y: 0, z: 0 }, { geom: b2, x: 0, y: 0.52, z: 0 }]), 'deco:castStone');
  const soil = box(1.0, 0.05, 0.48, { segY: 1 });
  B.definePart(id + ':soil', soil, 'soil', { castShadow: false });
  const leaves = [];
  for (let i = 0; i < 3; i++) {
    const s = 0.66 + (i % 2) * 0.18;
    const q1 = quad(s, s * 0.95), q2 = quad(s, s * 0.95);
    q2.rotateY(Math.PI / 2);
    leaves.push({ geom: q1, x: (i - 1) * 0.34, y: 0, z: 0 });
    leaves.push({ geom: q2, x: (i - 1) * 0.34, y: 0, z: 0 });
  }
  B.definePart(id + ':shrub', compose(leaves), 'canopy');
  return id;
}

function pFlagpole(B) {
  const id = 'deco:flagpole';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.52, 0.36, 0.52, { segY: 1 }), x: 0, y: 0, z: 0 });
  items.push({ geom: cylinder(0.035, 0.08, 7.2, 8), x: 0, y: 0.32, z: 0 });
  items.push({ geom: new THREE.SphereGeometry(0.08, 8, 6), x: 0, y: 7.58, z: 0 });
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

// through-wall AC sleeve + grille (every one of these buildings has them)
function pSleeve(B) {
  const id = 'deco:sleeve';
  if (B.hasPart(id)) return id;
  const items = [];
  const f = box(0.72, 0.44, 0.09, { segY: 1 });
  ensureColor(f, new THREE.Color(0.34, 0.33, 0.31));
  items.push({ geom: f, x: 0, y: 0, z: 0.015 });
  const face = box(0.63, 0.36, 0.05, { segY: 1 });
  ensureColor(face, new THREE.Color(0.19, 0.185, 0.18));
  items.push({ geom: face, x: 0, y: 0.04, z: 0.0 });
  for (let i = 0; i < 4; i++) {
    const l = box(0.59, 0.02, 0.03, { segY: 1 });
    ensureColor(l, new THREE.Color(0.46, 0.45, 0.43));
    items.push({ geom: l, x: 0, y: 0.09 + i * 0.07, z: 0.035 });
  }
  B.definePart(id, compose(items), 'paintFlat');
  return id;
}

function pDish(B) {
  const id = 'deco:dish';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.045, 0.045, 0.72, 6), x: 0, y: 0, z: 0 });
  items.push({ geom: box(0.26, 0.055, 0.26, { segY: 1 }), x: 0, y: 0.70, z: 0 });
  items.push({ geom: cylinder(0.30, 0.28, 0.06, 12), x: 0, y: 0.78, z: 0.15, rx: 1.05 });
  items.push({ geom: cylinder(0.018, 0.018, 0.30, 6), x: 0, y: 0.84, z: 0.33, rx: 1.4 });
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

function pPipeRail(B) {
  const id = 'deco:piperail';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(2.0, 0.045, 0.045, { segY: 1 }), x: 0, y: 1.05, z: 0 });
  items.push({ geom: box(2.0, 0.04, 0.04, { segY: 1 }), x: 0, y: 0.56, z: 0 });
  items.push({ geom: cylinder(0.026, 0.026, 1.09, 6), x: -1.0, y: 0, z: 0 });
  items.push({ geom: cylinder(0.026, 0.026, 1.09, 6), x: 1.0, y: 0, z: 0 });
  B.definePart(id, compose(items), 'steelDark');
  return id;
}

// ===========================================================================
// GENERATE
// ===========================================================================
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMats(B);
  const F = lot.frame;

  const W = lot.width;
  const D = Math.max(13, lot.depth);
  const stories = clamp(lot.stories
    || rng.weighted([[10, 12], [11, 14], [12, 16], [13, 13], [14, 10], [15, 6], [16, 4], [17, 2], [18, 1]]), 7, 22);
  const corner = lot.corner | 0;
  const commercial = !!lot.commercial;
  const mir = lot.mirror ? -1 : 1;

  // ---- vertical schedule ---------------------------------------------------
  const groundH = q05(rng.range(3.90, 4.40));
  const floorH = q05(rng.range(2.80, 2.96));
  const floorY = (i) => (i <= 0 ? 0 : groundH + (i - 1) * floorH);

  // ---- setback schedule (1916 zoning) --------------------------------------
  // These are apartment houses, not wedding-cake office towers: the street
  // wall runs full height and only the top storey or two pulls back.
  let sb = [];
  if (stories >= 15 && rng.bool(0.3)) sb = [stories - rng.int(5, 7), stories - rng.int(1, 2)];
  else if (stories >= 12 && rng.bool(0.35)) sb = [stories - rng.int(4, 6), stories - rng.int(1, 2)];
  else sb = [stories - rng.int(1, 3)];
  sb = [...new Set(sb)].filter((v) => v >= 4 && v < stories).sort((a, b) => a - b);
  for (let i = 1; i < sb.length; i++) if (sb[i] - sb[i - 1] < 2) sb[i] = sb[i - 1] + 2;
  sb = sb.filter((v) => v >= 4 && v < stories);

  // Mid-block 1916-zoning setbacks step back from the STREET; the flanks are
  // party walls and stay flush.  Only the crown tier pulls in at the sides,
  // which is what gives these buildings their finished tower top.
  const ixStep = W > 17.5 ? q05(rng.range(1.10, 1.90)) : 0;
  const izStep = q05(rng.range(1.70, 2.90));
  const bounds = [0, ...sb, stories];
  const lastK = bounds.length - 2;
  const tiers = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const sideSteps = Math.max(0, k - Math.max(0, lastK - 1));
    const sideIn = Math.min(sideSteps * ixStep, W * 0.2);
    const hw = Math.max(4.6, W / 2 - sideIn);
    const zF = -Math.min(k * izStep, Math.max(0, D - 9.5));
    tiers.push({
      k, a: bounds[k], b: bounds[k + 1],
      y0: floorY(bounds[k]), y1: floorY(bounds[k + 1]),
      hw, zF, sideIn, depth: D + zF,
    });
  }
  const nT = tiers.length;
  const TT = tiers[nT - 1];

  // ---- palette -------------------------------------------------------------
  const brickMat = rng.weighted([
    ['deco:brickBuff', 8], ['deco:brickTan', 7], ['deco:brickGrey', 5], ['deco:brickRose', 4],
  ]);
  const brickTint = facadeTint(rng);
  const panelMat = rng.weighted([
    ['deco:panelFret', 6], ['deco:panelChev', 6], ['deco:panelDia', 4], ['deco:panelBand', 3],
  ]);
  // land the panel's baked neutral field exactly on the wall brick colour
  // panels sit in the shaded stripe, so land them ~8% under the wall value
  const PANEL_TINT = {
    'deco:brickBuff': [1.12, 1.06, 0.90],
    'deco:brickTan': [1.10, 0.98, 0.76],
    'deco:brickGrey': [1.02, 0.96, 0.86],
    'deco:brickRose': [0.98, 0.74, 0.60],
  };
  const pt3 = PANEL_TINT[brickMat] || [1.10, 1.03, 0.86];
  const panelTint = new THREE.Color(pt3[0], pt3[1], pt3[2]).multiply(brickTint);
  const headerMat = 'deco:brickHeader';
  const headerTint = facadeTint(rng, new THREE.Color(0.98, 0.95, 0.92));
  const stoneMat = rng.weighted([['deco:castStone', 7], ['limestone', 3], ['deco:stoneSoil', 3]]);
  const stoneTint = facadeTint(rng, new THREE.Color(0.99, 0.985, 0.97));
  const plinthMat = rng.weighted([['deco:stoneSoil', 5], ['graniteBase', 3], ['deco:castStone', 2]]);
  const sideMat = corner ? brickMat : 'deco:brickCommon';
  const frameA = new THREE.Color(rng.weighted([
    [0x3a322a, 9], [0x22201e, 8], [0x4a3728, 5], [0xb8b3a8, 2], [0x7b7973, 2],
  ]));
  // corbelled crown courses are always the field brick — shadow does the work
  const corbMat = brickMat;
  const roofMat = rng.pick(['roofSilver', 'roofBlack']);
  const polyBand = rng.bool(0.4);

  // Windows must be the DARKEST thing on the facade — you are looking into a
  // dim room through 95-year-old glass.
  const glassFor = () => new THREE.Color().setHSL(
    rng.range(0.55, 0.61), rng.range(0.05, 0.16),
    rng.next() < 0.12 ? rng.range(0.30, 0.48) : rng.range(0.055, 0.19));
  const roomFor = () => (rng.next() < 0.14
    ? new THREE.Color().setHSL(rng.range(0.07, 0.11), rng.range(0.14, 0.3), rng.range(0.13, 0.22))
    : new THREE.Color().setHSL(rng.range(0.05, 0.14), rng.range(0.02, 0.14), rng.range(0.03, 0.085)));
  const shadeFor = () => new THREE.Color().setHSL(rng.range(0.08, 0.13), rng.range(0.05, 0.16), rng.range(0.48, 0.68));
  const litP = rng.range(0.28, 0.40);
  const putWin = (w, h, m, style) => {
    const id = pWin(B, w, h, style || winStyle);
    B.addInstance(id, m, frameA);
    B.addInstance(id + ':room', m, roomFor());
    B.addInstance(id + ':glass', m, glassFor());
    if (rng.bool(0.26)) B.addInstance(`${id}:shade${rng.int(0, 2)}`, m, shadeFor());
    if (rng.bool(litP)) B.addInstance(id + ':lit', m, new THREE.Color(1.0, 0.86, 0.62));
  };

  // ---- facade system dimensions -------------------------------------------
  const sr = q05(rng.range(0.38, 0.50));          // stripe recess = pier projection
  const pierW = q05(rng.range(0.62, 0.88));
  const mullW = q05(rng.range(0.34, 0.44));
  const sillH = q05(rng.range(0.78, 0.92));
  // PORTRAIT sash — 1 : 1.4-1.7.  Everything else is derived from this.
  const winW = q05(rng.range(0.98, 1.24));
  const winH = q05(rng.range(1.52, 1.72));
  const gSillY = q05(rng.range(1.15, 1.45));
  const gWinH = q05(rng.range(1.85, 2.15));
  // Double hung with a horizontal meeting rail is the Bronx apartment sash.
  // Steel casement only occasionally, and then 2x2, never vertical stripes.
  const winStyle = rng.weighted([['dh1', 10], ['dh2', 3], ['steel', 2]]);
  const casement3 = false;
  const panesX = 2, panesY = 2;
  // sills: soiled cast stone, or a brick soldier course
  const sillStyle = rng.weighted([['stone', 6], ['brick', 4]]);
  const baseStyle = rng.weighted([['stone', 5], ['brick', 4], ['plinth', 4]]);
  const plinthH = q05(rng.range(1.35, 2.05));
  const baseTop = baseStyle === 'plinth' ? plinthH : floorY(1);
  const beltY = floorY(1);
  const parapetH = q05(rng.range(0.95, 1.40));
  const finBase = q05(rng.range(2.10, 3.30));     // pier fin rise above the parapet
  // ---- weathering ---------------------------------------------------------
  // 95 years on the Concourse: the stripe sits in permanent shade, the pier
  // faces are rain-washed clean, and soiling builds with height.
  const recTint = brickTint.clone().multiplyScalar(0.72);
  const washTint = brickTint.clone().multiplyScalar(1.035);
  const totalH = floorY(stories);
  const soilAt = (y) => 1 - 0.155 * clamp(y / Math.max(1, totalH), 0, 1);
  const mott = () => rng.range(0.965, 1.03);      // per-element mottling
  const shadeG = (g, h, f0, f1) => { ensureColor(g); shadeYRange(g, 0, h, f0, f1); return g; };
  const sillMat = sillStyle === 'brick' ? headerMat : stoneMat;
  const sillTint = sillStyle === 'brick'
    ? headerTint.clone().multiplyScalar(0.92)
    : stoneTint.clone().multiplyScalar(0.62);
  const fanOrn = rng.bool(0.6);
  const pierRib = rng.bool(0.55);
  const wantCwin = rng.bool(0.6);                 // wrap windows at setback corners
  const frontFE = rng.bool(0.32);                 // on an END bay only, never the ornamental centre
  // how the top of the building is finished — a real point of difference
  const crownStyle = rng.weighted([['merlon', 6], ['pylon', 4], ['corbel', 3]]);
  const panelCover = rng.range(0.52, 0.78);       // fraction of the spandrel patterned

  // ---- master stripe layout (shared by all tiers so piers align) -----------
  const endPier = q05(clamp(rng.range(1.30, 2.10), 0.9, W * 0.10));
  let usable = W - 2 * endPier;
  // stripe width comes FROM the sash, never the other way round
  const nWin = rng.weighted([[2, 7], [1, 4], [3, 2]]);
  const stripeW = q05(nWin * winW + (nWin - 1) * mullW + 0.20);
  let nStripes = clamp(Math.round((usable + pierW) / (stripeW + pierW)), 2, 10);
  let gapW = nStripes > 1 ? (usable - nStripes * stripeW) / (nStripes - 1) : 0;
  while (gapW < 0.48 && nStripes > 2) {
    nStripes--; gapW = (usable - nStripes * stripeW) / (nStripes - 1);
  }
  while (gapW > 1.55 && nStripes < 10) {
    nStripes++; gapW = (usable - nStripes * stripeW) / (nStripes - 1);
  }
  gapW = clamp(gapW, 0.42, 1.5);
  const runW = nStripes * stripeW + (nStripes - 1) * gapW;
  const stripes = [];
  {
    let cx = -runW / 2;
    for (let i = 0; i < nStripes; i++) {
      const ww = winW;
      const offs = [];
      for (let j = 0; j < nWin; j++) offs.push(-((nWin - 1) * (ww + mullW)) / 2 + j * (ww + mullW));
      stripes.push({ i, x: cx + stripeW / 2, w: stripeW, nWin, ww, offs });
      cx += stripeW + gapW;
    }
  }
  const eIdx = nStripes % 2 === 1 ? (nStripes - 1) / 2 : (mir < 0 ? nStripes / 2 - 1 : nStripes / 2);
  const eStripe = stripes[eIdx];
  const cwW = q05(clamp(stripes[0].ww, 0.95, 1.35));

  // per-tier: which stripes survive, corner windows, resulting pier runs
  for (const t of tiers) {
    let kept = stripes.filter((s) => s.x - s.w / 2 > -t.hw + 0.5 && s.x + s.w / 2 < t.hw - 0.5);
    if (!kept.length) kept = [eStripe];
    t.kept = kept;
    t.cwin = wantCwin && t.sideIn > 0.9;
    const spans = [];
    if (t.cwin) spans.push([-(t.hw - 0.08), -(t.hw - 0.08) + cwW]);
    for (const s of kept) spans.push([s.x - (s.w - 0.10) / 2, s.x + (s.w - 0.10) / 2]);
    if (t.cwin) spans.push([(t.hw - 0.08) - cwW, t.hw - 0.08]);
    spans.sort((a, b) => a[0] - b[0]);
    // drop any span that overlaps its neighbour (very narrow tiers)
    t.spans = spans.filter((s, i) => i === 0 || s[0] > spans[i - 1][1] + 0.14);
    t.piers = [];
    let cur = -t.hw;
    for (const [a2, b2] of t.spans) {
      if (a2 - cur > 0.14) t.piers.push({ x0: cur, x1: a2, end: cur === -t.hw });
      cur = b2;
    }
    if (t.hw - cur > 0.14) t.piers.push({ x0: cur, x1: t.hw, end: true });
  }

  // ===========================================================================
  // BASE (ground floor, flush plane at z = 0)
  // ===========================================================================
  const nSteps = rng.int(1, 3);
  const stepTop = q05(nSteps * 0.155);
  const doorW = q05(clamp(eStripe.w - rng.range(0.35, 0.85), 1.55, 2.55));
  const openW = q05(doorW + 0.28);
  const doorH = q05(clamp(rng.range(2.85, 3.25), 2.6, groundH - 1.30));
  const portalW = q05(Math.min(openW + rng.range(2.4, 3.4), W * 0.36));
  const portalH = q05(clamp(doorH + rng.range(0.7, 1.5), 3.6, groundH - 0.05));
  const ex = eStripe.x;
  const portalClear = portalW / 2 + 0.25;

  const baseMat = baseStyle === 'brick' ? brickMat : baseStyle === 'plinth' ? plinthMat : stoneMat;
  const baseTint = baseStyle === 'brick' ? brickTint : baseStyle === 'plinth' ? stoneTint.clone().multiplyScalar(0.94) : stoneTint;

  const sfBays = [];
  const groundOps = [];
  const gWins = [];
  const clearOf = (x, w) => Math.abs(x - ex) - w / 2 > portalClear - 0.0001 || Math.abs(x - ex) > portalClear + w / 2;
  if (commercial) {
    for (const s of stripes) {
      if (s.i === eIdx) continue;
      const sw = q05(Math.min(s.w + pierW * 0.4, 6.2));
      if (sw < 2.2 || Math.abs(s.x - ex) - sw / 2 < portalClear) continue;
      sfBays.push({ x: s.x, w: sw });
      groundOps.push({ x: s.x, w: sw, y0: 0.05, y1: 3.25 });
    }
  } else {
    for (const s of stripes) {
      if (s.i === eIdx) continue;
      for (const o of s.offs) {
        const wx = s.x + o;
        if (Math.abs(wx - ex) - s.ww / 2 < portalClear) continue;
        gWins.push({ x: wx, w: s.ww });
        groundOps.push({ x: wx, w: s.ww, y0: gSillY, y1: gSillY + gWinH });
      }
    }
  }
  let svcX = null;
  if (!commercial && endPier >= 1.2 && rng.bool(0.55)) {
    svcX = -mir * (W / 2 - endPier / 2 - 0.02);
    if (Math.abs(svcX - ex) - 0.55 > portalClear) groundOps.push({ x: svcX, w: 1.05, y0: 0.02, y1: 2.30 });
    else svcX = null;
  }

  {
    const rows = [];
    const yTopRow = Math.max(portalH + 0.06, gSillY + gWinH + 0.10, 3.5);
    if (baseStyle === 'plinth') {
      rows.push({
        y0: stepTop, y1: Math.max(stepTop + 0.4, Math.min(plinthH - 0.03, portalH)),
        openings: [{ x: ex, w: openW }],
      });
    } else {
      const ops = [{ x: ex, w: openW, y0: stepTop, y1: portalH }].concat(groundOps);
      ops.sort((a, b) => a.x - b.x);
      rows.push({ y0: 0.03, y1: Math.min(yTopRow, baseTop - 0.02), openings: ops });
    }
    punchedWall(ctx, F, {
      width: W, height: baseTop, depth: 0.46, mat: baseMat, tint: baseTint,
      rows, grime: 0.50, aoTop: baseTop,
    });
    if (baseStyle === 'plinth') {
      const ops = [{ x: ex, w: openW, y0: 0.02, y1: portalH - plinthH }];
      for (const o of groundOps) ops.push({ x: o.x, w: o.w, y0: Math.max(0.02, o.y0 - plinthH), y1: o.y1 - plinthH });
      ops.sort((a, b) => a.x - b.x);
      punchedWall(ctx, at(F, 0, plinthH, 0), {
        width: W, height: beltY - plinthH, depth: 0.46, mat: brickMat, tint: brickTint,
        rows: [{ y0: 0.02, y1: Math.max(portalH, gSillY + gWinH + 0.1) - plinthH, openings: ops }],
        grime: 0.20, aoTop: beltY,
      });
    }
  }

  // ground-floor openings: windows or storefronts
  if (commercial) {
    for (const s of sfBays) {
      K.storefront({
        width: s.w, signIndex: rng.int(0, 31),
        awningIndex: rng.bool(0.42) ? rng.int(0, 7) : -1,
        gate: rng.bool(0.16) ? (rng.bool(0.5) ? 2 : 1) : 0,
      }, at(F, s.x, 0.02, 0));
    }
  } else {
    // no projecting white lintels — the head runs into a brick soldier course
    // (or a shallow brick arch), so nothing crosses the vertical piers
    const arched = rng.bool(0.5);
    const gSill = stoneTint.clone().multiplyScalar(0.72);
    for (const gw of gWins) {
      putWin(gw.w, gWinH, at(F, gw.x, gSillY, 0));
      K.sill(gw.w, at(F, gw.x, gSillY, 0), { mat: sillMat, tint: sillStyle === 'brick' ? sillTint : gSill });
      // flat cast-stone lintel (910 GC) — never a segmental jack arch, which
      // is a tenement detail, not a deco one
      B.addMerged(stoneMat, box(gw.w + 0.22, 0.24, 0.12, { segY: 1 }),
        at(F, gw.x, gSillY + gWinH + 0.01, -0.02), { tint: gSill, grime: 0.4 });
      if (arched) {
        B.addMerged(headerMat, box(gw.w + 0.14, 0.145, 0.09, { segY: 1 }),
          at(F, gw.x, gSillY + gWinH + 0.26, -0.02), { tint: headerTint });
      }
    }
  }
  if (svcX !== null) {
    K.door({ w: 1.0, h: 2.25, transom: false }, at(F, svcX, 0.04, -0.02), { tint: new THREE.Color(0x2b2a27) });
  }

  // ---- water table + belt course ------------------------------------------
  const FP = (y, name, mat, tint, len, z = 0, xc = 0) => {
    B.addMerged(mat, profileAlongX(PROF[name], len), at(F, xc, y, z, Math.PI), { tint });
  };
  if (baseStyle !== 'brick' || rng.bool(0.6)) FP(0.02, 'water', plinthMat, stoneTint.clone().multiplyScalar(0.88), W + 0.06);
  if (baseStyle === 'plinth') FP(plinthH - 0.05, 'string', stoneMat, stoneTint, W + 0.06);
  {
    // the belt bridges from the recessed stripe plane out past the pier plane
    const bh = 0.30, bd = sr + 0.26;
    const beltTint = stoneTint.clone().multiplyScalar(0.80);
    B.addMerged(stoneMat, box(W + 0.10, bh, bd, { segY: 1 }),
      at(F, 0, beltY - 0.08, 0.10 - bd / 2), { tint: beltTint });
    FP(beltY - 0.08 + bh - 0.02, 'string', stoneMat, beltTint, W + 0.16, 0.09);
    const dt = pDtooth(B, corbMat);
    const n = Math.max(2, Math.round((W + 0.1) / 1.0));
    for (let i = 0; i < n; i++) {
      B.addInstance(dt, at(F, -W / 2 + (W / n) * (i + 0.5), beltY - 0.17, 0.045),
        corbMat === brickMat ? brickTint : headerTint);
    }
    if (polyBand) {
      // discrete terracotta panels over specific bays, never a continuous
      // ribbon — Park Plaza puts them over the entrance and the end pavilions
      const tcSet = new Set([eIdx, 0, nStripes - 1]);
      for (const s of stripes) {
        if (!tcSet.has(s.i)) continue;
        const pw = s.w + 0.3;
        const g = box(pw, 0.46, 0.17, { segY: 1 });
        boxUV(g, pw, 0.46, 0.17, 1);
        B.addMerged('deco:tcBand', g, at(F, s.x, beltY + 0.30, -0.04),
          { worldUV: false, tint: new THREE.Color(0.80, 0.79, 0.77) });
        B.addMerged(stoneMat, box(pw + 0.14, 0.10, 0.24, { segY: 1 }),
          at(F, s.x, beltY + 0.76, -0.05), { tint: beltTint });
      }
    }
    // runoff off the belt course, down the ground-floor face
    B.addInstance(pSoot(B, q05(W), 2.2), at(F, 0, beltY - 0.34, 0.016),
      new THREE.Color(1.04, 1.03, 1.01));
  }

  // ===========================================================================
  // ENTRANCE PORTAL
  // ===========================================================================
  {
    for (let s = 0; s < nSteps; s++) {
      const run = (nSteps - s) * 0.36;
      B.addMerged(plinthMat, box(portalW - 0.30 - s * 0.14, 0.16, run, { segY: 1 }),
        at(F, ex, s * 0.155, run / 2 + 0.02), { tint: stoneTint, grime: 0.34 });
    }
    // Monolithic REEDED cast-stone portal slab with a stepped head — the
    // 910 Grand Concourse / Concourse-stroll move, not a thin picture frame.
    const pTintS = stoneTint.clone().multiplyScalar(0.86);
    const jw = (portalW - openW) / 2;
    const headY = portalH - 0.86;
    for (const s of [-1, 1]) {
      const jx = ex + s * (openW / 2 + jw / 2);
      B.addMerged(stoneMat, box(jw, headY + 0.30, 0.34, { segY: 3 }),
        at(F, jx, 0, 0.34 / 2 - 0.06), { tint: pTintS, grime: 0.40 });
      const fw = q05(jw - 0.20);
      if (fw > 0.2) {
        const ribs = clamp(Math.round(fw / 0.20), 3, 8);
        B.addInstance(pFlute(B, headY - 0.16, fw, ribs), at(F, jx, 0.10, 0.28), pTintS);
      }
    }
    // stepped head: three bands corbelling out and up over the opening
    for (let k = 0; k < 3; k++) {
      const bw = portalW - k * 0.44, bd = 0.34 + k * 0.075;
      B.addMerged(stoneMat, box(bw, 0.30, bd, { segY: 1 }),
        at(F, ex, headY + k * 0.29, bd / 2 - 0.06), { tint: pTintS });
    }
    // vestibule: the doors sit deep in shadow, ~1.1 m back off the portal face
    {
      const vd = 0.62;
      const dz = -vd;
      const dk = new THREE.Color(0.30, 0.28, 0.26);
      B.addMerged(stoneMat, box(openW + 0.10, 0.14, vd + 0.10, { segY: 1 }),
        at(F, ex, portalH - 0.62, dz + (vd + 0.10) / 2), { tint: dk });
      for (const s of [-1, 1]) {
        B.addMerged(stoneMat, box(0.14, portalH - 0.60, vd + 0.10, { segY: 1 }),
          at(F, ex + s * (openW / 2 + 0.02), 0, dz + (vd + 0.10) / 2), { tint: dk });
      }
      const did = pDoor(B, doorW, q05(doorH - stepTop));
      B.addInstance(did, at(F, ex, stepTop + 0.02, dz));
      B.addInstance(did + ':glass', at(F, ex, stepTop + 0.02, dz));
      B.addInstance(did + ':lobby', at(F, ex, stepTop + 0.02, dz), new THREE.Color(1.0, 0.88, 0.66));
    }
    // stepped chevron relief in the spandrel over the door
    {
      const py = doorH + 0.10, ph = Math.max(0.3, headY - doorH - 0.22);
      B.addMerged(stoneMat, box(openW - 0.10, ph, 0.20, { segY: 1 }),
        at(F, ex, py, 0.04), { tint: pTintS });
      const nfn = Math.max(3, Math.round(openW / 0.34));
      for (let k = 0; k < nfn; k++) {
        const t2 = (k - (nfn - 1) / 2) / ((nfn - 1) / 2);
        B.addMerged(stoneMat, box(0.13, ph * (0.9 - Math.abs(t2) * 0.45), 0.10, { segY: 1 }),
          at(F, ex + t2 * (openW - 0.6) / 2, py + ph * 0.05, 0.16), { tint: pTintS.clone().multiplyScalar(1.05) });
      }
    }
    if (rng.bool(0.72)) {
      const mw = q05(clamp(portalW - 0.9, 2.4, 4.6));
      const mid = pMarquee(B, mw);
      const my = q05(clamp(doorH - 0.05, 2.7, headY - 0.35));
      B.addInstance(mid, at(F, ex, my, 0.30), new THREE.Color(0.85, 0.84, 0.82));
      B.addInstance(mid + ':glass', at(F, ex, my, 0.30));
      B.addInstance(mid + ':soffit', at(F, ex, my - 0.06, 0.30 + 0.88), new THREE.Color(0.72, 0.63, 0.48));
    }
    for (const s of [-1, 1]) {
      B.addInstance(pSconce(B), at(F, ex + s * (openW / 2 + 0.10), stepTop + 1.95, 0.30));
    }
  }

  // ===========================================================================
  // TIERS: recessed window stripes + continuous piers + spandrel panels
  // ===========================================================================
  const acStripes = new Set();
  const acFloors = new Set();
  {
    const n = Math.max(1, Math.round(nStripes * rng.range(0.4, 0.85)));
    for (let i = 0; i < n; i++) acStripes.add(rng.int(0, nStripes - 1));
    for (let f = 1; f < stories; f++) if (rng.bool(0.55)) acFloors.add(f);
  }
  const gapH = floorH - winH;                              // spandrel band height
  const panelH = q05(clamp(gapH * panelCover, 0.32, 1.05));
  const panelY = q05((gapH - panelH) / 2 + 0.05);          // centred in the band
  const sootId = pSoot(B, stripeW - 0.16, q05(clamp(gapH - 0.15, 0.6, 1.6)));
  const sootTint = new THREE.Color(1, 1, 1);

  for (const t of tiers) {
    const wallY0 = t.k === 0 ? beltY : t.y0;
    const wallH = t.y1 - wallY0;
    if (wallH < 0.6) continue;
    const Wt = t.hw * 2;
    const f0 = t.a === 0 ? 1 : t.a;
    const tint = t.k === 0 ? brickTint : brickTint.clone().multiplyScalar(rng.range(0.965, 1.03));
    const isTop = t.k === nT - 1;
    const yT = t.y1;
    const pH = isTop ? parapetH : q05(clamp(parapetH * 0.66, 0.6, 1.0));
    const bandH = 0.50;                                   // solid brick band under the parapet

    // -- front wall: one punched band per floor so soiling can build with
    //    height and each course band can mottle independently ---------------
    const wallTopY = yT - bandH;
    const ops = t.spans.map(([a2, b2]) => ({ x: (a2 + b2) / 2, w: b2 - a2 }));
    {
      let cur = wallY0;
      for (let f = f0; f < t.b; f++) {
        const y = floorY(f) + sillH;
        const top = Math.min(f + 1 < t.b ? floorY(f + 1) : wallTopY, wallTopY);
        if (y + winH > wallTopY - 0.05 || top - cur < 0.4) continue;
        const rt = recTint.clone().multiplyScalar(soilAt(y) * mott());
        punchedWall(ctx, at(F, 0, cur, t.zF - sr), {
          width: Wt, height: top - cur, depth: 0.44, mat: brickMat, tint: rt,
          rows: [{ y0: y - cur, y1: y - cur + winH, openings: ops }],
        });
        cur = top;
      }
      if (wallTopY - cur > 0.05) {
        B.addMerged(brickMat, box(Wt, wallTopY - cur, 0.44),
          at(F, 0, cur, t.zF - sr - 0.22), { tint: recTint.clone().multiplyScalar(soilAt(cur)) });
      }
    }

    // -- piers: brick from the recessed plane out to the street plane -------
    const pd = sr + 0.14;
    for (const p of t.piers) {
      const pw = p.x1 - p.x0, px = (p.x0 + p.x1) / 2;
      const extra = p.end ? 0.12 : 0;              // corner pylons stand proud
      const pT = washTint.clone().multiplyScalar(mott());
      B.addMerged(brickMat, shadeG(box(pw, wallH, pd + extra), wallH, soilAt(wallY0) + 0.05, soilAt(yT) - 0.03),
        at(F, px, wallY0, t.zF + extra - (pd + extra) / 2), { tint: pT, aoTop: yT });
      if (pierRib && pw > 0.52 && !p.end) {
        B.addMerged(brickMat, shadeG(box(q05(pw * 0.40), wallH, 0.16), wallH, 1.04, 0.9),
          at(F, px, wallY0, t.zF + 0.02), { tint: pT, aoTop: yT });
      }
      if (p.end && pw > 1.0) {                     // recessed vertical channel in the pylon
        B.addMerged(brickMat, box(q05(pw * 0.34), wallH, 0.16),
          at(F, px, wallY0, t.zF + extra - 0.16), { tint: recTint, aoTop: yT });
      }
    }
    // -- baked jamb shadow: the showcase sun is head-on, so the arris of each
    //    pier gets a painted dark return or the recess reads as decal --------
    {
      const jT = brickTint.clone().multiplyScalar(0.50);
      const jTo = brickTint.clone().multiplyScalar(0.70);
      for (const [a2, b2] of t.spans) {
        for (const [xj, s] of [[a2, 1], [b2, -1]]) {
          B.addMerged(brickMat, box(0.065, wallH, sr * 0.9),
            at(F, xj + s * 0.032, wallY0, t.zF - 0.04 - sr * 0.45), { tint: jT, aoTop: yT });
          B.addMerged(brickMat, box(0.055, wallH, 0.10),
            at(F, xj + s * 0.093, wallY0, t.zF - 0.05), { tint: jTo, aoTop: yT });
        }
      }
    }
    // -- mullions between paired windows ------------------------------------
    for (const s of t.kept) {
      for (let j = 0; j + 1 < s.nWin; j++) {
        const mx = s.x + (s.offs[j] + s.offs[j + 1]) / 2;
        B.addMerged(brickMat, shadeG(box(mullW, wallH, 0.60), wallH, 0.94, 0.82),
          at(F, mx, wallY0, t.zF - sr - 0.16), { tint, aoTop: yT });
      }
    }
    // -- corner posts where the wrap windows meet ---------------------------
    if (t.cwin) {
      for (const side of [-1, 1]) {
        B.addMerged(brickMat, box(0.18, wallH, sr + 0.20),
          at(F, side * (t.hw - 0.09), wallY0, t.zF - (sr + 0.20) / 2 + 0.01), { tint, aoTop: yT });
      }
    }

    // -- windows, sills, spandrel panels, ACs -------------------------------
    for (let f = f0; f < t.b; f++) {
      const y = floorY(f) + sillH;
      if (y + winH > yT - bandH - 0.05) continue;
      const headY = y + winH;
      const nextOK = floorY(f + 1) + sillH + winH <= yT - bandH - 0.05 && f + 1 < t.b;
      const soilF = soilAt(y);
      // the panel lives INSIDE the shaded recess — it must never pop lighter
      // than the bay wall around it or the whole facade reads as wallpaper
      const pTint = panelTint.clone().multiplyScalar(0.78 * soilF * mott());
      const sTint = sillTint.clone().multiplyScalar(soilF * mott());
      for (const s of t.kept) {
        for (let j = 0; j < s.nWin; j++) {
          const wx = s.x + s.offs[j];
          putWin(s.ww, winH, at(F, wx, y, t.zF - sr));
          if (acStripes.has(s.i) && acFloors.has(f)) {
            B.addInstance(pSleeve(B), at(F, wx, y - 0.58, t.zF - sr + 0.015));
          } else if (rng.bool(0.16)) {
            K.acUnit(at(F, wx + (s.ww - 0.7) * 0.4, y + 0.02, t.zF - sr + 0.05));
          }
        }
        // ONE continuous sill course per stripe, stopped dead at every pier
        K.sill(s.w - 0.16, at(F, s.x, y, t.zF - sr), { mat: sillMat, tint: sTint });
        // runoff grime hanging off the sill, down the recessed bay
        B.addInstance(sootId, at(F, s.x, y - 0.10, t.zF - sr + 0.014),
          sootTint.clone().multiplyScalar(rng.range(0.9, 1.06)));
        if (nextOK) {
          B.addInstance(pPanel(B, panelMat, s.w - 0.14, panelH),
            at(F, s.x, headY + panelY, t.zF - sr - 0.02), pTint);
        }
      }
      if (t.cwin) {
        for (const side of [-1, 1]) {
          const wx = side * (t.hw - 0.08 - cwW / 2);
          putWin(cwW, winH, at(F, wx, y, t.zF - sr));
          K.sill(cwW + 0.1, at(F, wx, y, t.zF - sr), { mat: sillMat, tint: sTint });
          if (nextOK) {
            B.addInstance(pPanel(B, panelMat, cwW + 0.06, panelH),
              at(F, wx, headY + panelY, t.zF - sr - 0.02), pTint);
          }
        }
      }
    }

    // -- exposed flanks + rear ----------------------------------------------
    const flank = t.sideIn > 0.5;
    const sideRows = { left: null, right: null };
    const dFronts = [];
    if (flank || corner) {
      if (t.cwin) dFronts.push(0.10 + cwW / 2);
      const start = t.cwin ? 2.3 : 1.6;
      const nS = clamp(Math.round((t.depth - start - 1.2) / 3.4), 1, 4);
      for (let i = 0; i < nS; i++) dFronts.push(start + (t.depth - start - 1.4) * (nS === 1 ? 0.5 : i / (nS - 1)));
      const mkFor = (side) => {
        const rr = [];
        for (let f = f0; f < t.b; f++) {
          const y = floorY(f) + sillH;
          if (y + winH > yT - bandH - 0.05) continue;
          const ops = dFronts.map((d, i) => ({
            x: side > 0 ? -t.depth / 2 + d : t.depth / 2 - d,
            w: i === 0 && t.cwin ? cwW : 1.05,
          })).sort((a, b) => a.x - b.x);
          rr.push({ y0: y - t.y0, y1: y - t.y0 + winH, openings: ops });
        }
        return rr;
      };
      if (flank || corner < 0) sideRows.left = mkFor(-1);
      if (flank || corner > 0) sideRows.right = mkFor(1);
    }
    const rearXs = [];
    {
      const n = clamp(Math.round(Wt / 4.4), 2, 5);
      for (let i = 0; i < n; i++) rearXs.push(-Wt / 2 + (Wt / (n + 1)) * (i + 1));
    }
    const rearRows = [];
    for (let f = f0; f < t.b; f++) {
      const y = floorY(f) + sillH;
      if (y + 1.45 > yT - 0.4) continue;
      rearRows.push({ y0: y - t.y0, y1: y - t.y0 + 1.45, openings: rearXs.map((x) => ({ x, w: 0.95 })) });
    }
    // setback flanks are finished facades, not party walls
    shellWalls(ctx, at(F, 0, t.y0, t.zF), {
      width: Wt, depth: t.depth, height: t.y1 - t.y0,
      mat: (flank || corner) ? brickMat : sideMat, tint,
      wallT: 0.34, rearRows, rearMat: 'deco:brickCommon', sideRows,
    });
    for (const side of [-1, 1]) {
      const rowsFor = side < 0 ? sideRows.left : sideRows.right;
      if (!rowsFor) continue;
      const sf = at(F, side * t.hw, t.y0, t.zF - t.depth / 2, side < 0 ? -Math.PI / 2 : Math.PI / 2);
      // pilaster strips between the flank bays so the setback return reads as
      // a finished facade, not a party wall with holes punched in it
      if (flank) {
        const edges = [];
        for (let i = 0; i + 1 < dFronts.length; i++) edges.push((dFronts[i] + dFronts[i + 1]) / 2);
        edges.push(t.depth - 0.55);
        for (const d of edges) {
          if (d < 0.9 || d > t.depth - 0.3) continue;
          const px = side > 0 ? -t.depth / 2 + d : t.depth / 2 - d;
          B.addMerged(brickMat, shadeG(box(0.70, wallH, 0.20), wallH, 1.02, 0.9),
            at(sf, px, wallY0 - t.y0, 0.04), { tint: washTint, aoTop: yT });
        }
      }
      for (let f = f0; f < t.b; f++) {
        const y = floorY(f) + sillH;
        if (y + winH > yT - bandH - 0.05) continue;
        dFronts.forEach((d, i) => {
          const x = side > 0 ? -t.depth / 2 + d : t.depth / 2 - d;
          const ww = i === 0 && t.cwin ? cwW : 1.05;
          putWin(ww, winH, at(sf, x, y - t.y0, 0));
          K.sill(ww, at(sf, x, y - t.y0, 0), { mat: sillMat, tint: sillTint });
        });
      }
    }
    for (let f = f0; f < t.b; f++) {
      const y = floorY(f) + sillH;
      if (y + 1.45 > yT - 0.4) continue;
      for (const x of rearXs) {
        putWin(0.95, 1.45, at(F, -x, y, -D, Math.PI), 'dh1');
      }
    }

    // -- solid brick band, then the corbelled courses and the parapet.
    //    CRITICAL DECO GRAMMAR: nothing horizontal may cross a pier.  The
    //    corbels, the parapet and its coping exist only in the recessed bays;
    //    the pier brickwork runs unbroken up into its own merlon.
    B.addMerged(brickMat, box(Wt, bandH, sr + 0.16),
      at(F, 0, yT - bandH, t.zF - (sr + 0.16) / 2 + 0.01), { tint, aoTop: yT });
    const dt = pDtooth(B, corbMat);
    for (const [a2, b2] of t.spans) {
      const w2 = b2 - a2, cx2 = (a2 + b2) / 2;
      if (w2 < 0.35) continue;
      // 1: accent soldier course
      B.addMerged(headerMat, box(w2, 0.155, sr + 0.22),
        at(F, cx2, yT - bandH + 0.05, t.zF + 0.02 - (sr + 0.22) / 2), { tint: headerTint });
      // 2: corbel step
      B.addMerged(corbMat, profileAlongX(PROF.corbel, w2),
        at(F, cx2, yT - 0.46, t.zF - 0.03, Math.PI), { tint });
      // 3: 45-degree dogtooth sawtooth
      const n = Math.max(1, Math.round(w2 / 1.0)), seg = w2 / n;
      for (let i = 0; i < n; i++) {
        B.addInstance(dt, new THREE.Matrix4().multiplyMatrices(
          at(F, a2 + seg * (i + 0.5), yT - 0.65, t.zF + 0.05),
          new THREE.Matrix4().makeScale(seg, 1, 1),
        ), tint);
      }
      // parapet + coping, only between the piers
      B.addMerged(brickMat, box(w2, pH, 0.34, { segY: 1 }), at(F, cx2, yT, t.zF - 0.17), { tint });
      B.addMerged(stoneMat, box(w2, 0.13, 0.48, { segY: 1 }),
        at(F, cx2, yT + pH, t.zF - 0.15), { tint: stoneTint.clone().multiplyScalar(0.9) });
      // soot washing down off the coping into the bay below
      B.addInstance(pSoot(B, q05(w2), 3.0), at(F, cx2, yT - bandH - 0.02, t.zF - sr + 0.016),
        sootTint.clone().multiplyScalar(rng.range(0.86, 1.0)));
    }
    // roof deck (also the terrace floor of the tier above)
    B.addMerged(roofMat, box(Wt - 0.2, 0.12, t.depth - 0.2, { segY: 1 }),
      at(F, 0, yT - 0.12, t.zF - t.depth / 2));
    const pt = 0.34;
    const runs = [
      { w: Wt, d: pt, x: 0, z: -D + pt / 2 },
      { w: pt, d: t.depth - pt * 2, x: -t.hw + pt / 2, z: t.zF - t.depth / 2 },
      { w: pt, d: t.depth - pt * 2, x: t.hw - pt / 2, z: t.zF - t.depth / 2 },
    ];
    for (const r of runs) {
      if (r.w < 0.05 || r.d < 0.05) continue;
      B.addMerged(brickMat, box(r.w, pH, r.d, { segY: 1 }), at(F, r.x, yT, r.z), { tint });
      B.addMerged(stoneMat, box(r.w + 0.16, 0.12, r.d + 0.16, { segY: 1 }), at(F, r.x, yT + pH, r.z), { tint: stoneTint.clone().multiplyScalar(0.9) });
    }

    // -- stepped pier pinnacles rising past the parapet ---------------------
    // the piers run straight past the setback line and die as individual
    // merlons, so every roofline in the stack is serrated, never capped flat
    const cs = crownStyle;
    const finH = (isTop ? finBase : finBase * 0.60) * (cs === 'corbel' ? 0.24 : 1);
    const pdd = q05(sr + 0.46);
    let pi = 0;
    for (const p of t.piers) {
      const pw = p.x1 - p.x0, px = (p.x0 + p.x1) / 2;
      if (pw < 0.32) continue;
      const big = cs === 'pylon' ? (p.end || pi === Math.floor(t.piers.length / 2)) : true;
      const fh = q05(finH * (big ? 1 : 0.34));
      const nf = pw > 1.15 ? 5 : 3;
      const fw = pw / nf;
      const capId = pFinCap(B, fw, pdd);
      const pylon = p.end ? q05(fh * 0.55) : 0;        // corner pylons rise higher
      for (let i = 0; i < nf; i++) {
        const t2 = Math.abs(i - (nf - 1) / 2) / ((nf - 1) / 2);
        const h = q05(fh * (1 - t2 * 0.42) + pylon);
        const fx = px - pw / 2 + fw * (i + 0.5);
        // each merlon is a two-step stack: a deeper shoulder then the fin
        B.addMerged(brickMat, box(fw + 0.005, pH + h * 0.42, pdd + 0.09, { segY: 1 }),
          at(F, fx, yT, t.zF - (pdd + 0.09) / 2 + 0.05), { tint });
        B.addMerged(brickMat, box(fw + 0.005, pH + h, pdd, { segY: 1 }),
          at(F, fx, yT, t.zF - pdd / 2 + 0.05), { tint });
        B.addInstance(capId, at(F, fx, yT + pH + h, t.zF - pdd / 2 + 0.05),
          stoneTint.clone().multiplyScalar(0.92));
      }
      // deeply-undercut cast-stone palmette at every other pier and at corners
      if (fanOrn && pw > 0.55 && (p.end || pi % 2 === 1)) {
        B.addInstance(pFan(B), at(F, px, yT + pH * 0.52, t.zF + 0.07),
          stoneTint.clone().multiplyScalar(0.94));
      }
      pi++;
    }
    // crown returns down the exposed flanks so it reads from the cross street
    if (flank || corner) {
      for (const side of [-1, 1]) {
        if (!flank && corner !== side) continue;
        const dd = Math.min(2.6, t.depth * 0.35);
        const h = q05(finH * 0.85 + 0.22);
        B.addMerged(brickMat, box(pdd, pH + h, dd, { segY: 1 }),
          at(F, side * (t.hw - pdd / 2 + 0.05), yT, t.zF - dd / 2 - 0.06), { tint });
        B.addInstance(pFinCap(B, pdd, q05(dd)),
          at(F, side * (t.hw - pdd / 2 + 0.05), yT + pH + h, t.zF - dd / 2 - 0.06), stoneTint);
      }
    }

    // -- terrace furniture on the setback below ------------------------------
    if (!isTop) {
      const up = tiers[t.k + 1];
      if (Math.abs(up.zF - t.zF) > 0.9) {
        if (rng.bool(0.65)) {
          const rw = q05(clamp(Wt - 2.4, 2, 9.5));
          B.addInstance(pRail(B, rw), at(F, 0, yT + pH + 0.11, t.zF - 0.52));
        }
        if (rng.bool(0.8)) {
          const npl = clamp(Math.floor(Wt / 5), 1, 3);
          for (let i = 0; i < npl; i++) {
            const x = -Wt / 2 + (Wt / (npl + 1)) * (i + 1);
            const pz = t.zF - Math.min(1.1, Math.abs(up.zF - t.zF) * 0.55);
            B.addInstance(pPlanter(B), at(F, x, yT, pz), stoneTint);
            B.addInstance('deco:planter:soil', at(F, x, yT + 0.55, pz));
            B.addInstance('deco:planter:shrub', at(F, x, yT + 0.50, pz),
              new THREE.Color().setHSL(0.26, rng.range(0.22, 0.4), rng.range(0.22, 0.34)));
          }
        }
      }
      if (up.hw < t.hw - 0.8 && rng.bool(0.6)) {
        for (const side of [-1, 1]) {
          B.addInstance(pRail(B, q05(clamp(t.depth * 0.45, 2, 7))),
            at(F, side * (t.hw - 0.55), yT + pH + 0.11, t.zF - t.depth * 0.30, Math.PI / 2));
        }
      }
    }
  }

  // ===========================================================================
  // FIRE ESCAPES — one on the street front (Noonan / the stroll photo), and
  // one in the rear court on every building
  // ===========================================================================
  {
    const feTint = new THREE.Color(rng.weighted([[0x1b1a18, 5], [0x2b211b, 2], [0x6e6d69, 1]]));
    if (frontFE && nStripes >= 4) {
      const s = stripes[rng.bool() ? 0 : nStripes - 1];
      const t0 = tiers[0];
      if (t0.kept.indexOf(s) >= 0) {
        K.fireEscape({
          width: clamp(s.w - 0.35, 2.4, 3.0), floors: Math.max(2, t0.b - 1),
          floorH, firstY: floorY(1) + sillH - 0.14,
        }, at(F, s.x, 0, t0.zF - sr + 0.03), { tint: feTint });
      }
    }
    K.fireEscape({
      width: 2.4, floors: Math.max(2, Math.min(stories - 1, tiers[0].b - 1)),
      floorH, firstY: floorY(1) + sillH - 0.14,
    }, at(F, rng.range(-W * 0.2, W * 0.2), 0, -D + 0.02, Math.PI), { tint: feTint });
  }

  // ===========================================================================
  // CROWN GEAR: bulkhead built into the crown, tank behind it, vents, dishes
  // ===========================================================================
  {
    const rT = TT.y1;
    const hw = TT.hw, dep = TT.depth, zF = TT.zF;
    const h2 = (v) => Math.round(v * 2) / 2;
    {
      const bw = h2(clamp(hw * rng.range(0.5, 0.75), 3.0, 7.0));
      const bd = h2(clamp(dep * rng.range(0.28, 0.42), 2.6, 5.0));
      const bh = h2(rng.range(3.0, 4.2));
      const bx = q05(rng.range(-hw * 0.2, hw * 0.2));
      const bz = zF - dep * rng.range(0.32, 0.46);
      B.addMerged(brickMat, box(bw, bh, bd, { segY: 2 }), at(F, bx, rT, bz), { tint: brickTint });
      B.addMerged(stoneMat, box(bw + 0.18, 0.12, bd + 0.18, { segY: 1 }), at(F, bx, rT + bh, bz), { tint: stoneTint });
      for (let i = 0; i < 3; i++) {
        const t2 = i - 1;
        B.addMerged(brickMat, box(q05(bw / 6), bh + 0.6 - Math.abs(t2) * 0.32, q05(bd * 0.18), { segY: 1 }),
          at(F, bx + t2 * bw * 0.3, rT, bz + bd / 2 - bd * 0.09), { tint: brickTint });
      }
      const dg = box(1.0, 2.05, 0.09, { segY: 1 });
      ensureColor(dg, new THREE.Color(0.24, 0.22, 0.2));
      B.addMerged('paintFlat', dg, at(F, bx, rT, bz + bd / 2), { worldUV: false });
    }
    // elevator overrun, taller and narrower than the stair bulkhead
    {
      const ow = h2(clamp(hw * 0.42, 2.6, 4.0)), od = h2(clamp(dep * 0.24, 2.4, 3.6));
      const oh = h2(rng.range(4.0, 5.2));
      const ox = q05(rng.range(-hw * 0.55, -hw * 0.15) * (rng.bool() ? 1 : -1));
      const oz = zF - dep * rng.range(0.5, 0.66);
      B.addMerged(brickMat, box(ow, oh, od, { segY: 2 }), at(F, ox, rT, oz), { tint: brickTint });
      B.addMerged(stoneMat, box(ow + 0.16, 0.11, od + 0.16, { segY: 1 }), at(F, ox, rT + oh, oz), { tint: stoneTint });
    }
    let tank = null;
    if (rng.bool(0.94)) {
      const tx = q05(rng.range(-hw * 0.35, hw * 0.35));
      const tz = zF - dep * rng.range(0.62, 0.85);
      const legH = rng.bool(0.55) ? 5 : 3.5;
      K.waterTower(at(F, tx, rT, tz, rng.range(0, Math.PI)), {
        legH, r: 2, hBody: 4.4,
        tint: new THREE.Color().setHSL(0.07, rng.range(0.18, 0.32), rng.range(0.25, 0.4)),
      });
      tank = { tx, tz, legH };
      // downfeed + fill lines running off the tank to the roof deck
      B.addMerged('steelDark', cylinder(0.10, 0.10, legH + 4.2, 8), at(F, tx + 1.7, rT, tz + 0.5), { worldUV: false });
      B.addMerged('steelDark', cylinder(0.055, 0.055, legH + 2.4, 6), at(F, tx - 1.5, rT, tz - 0.7), { worldUV: false });
      B.addMerged('steelDark', box(3.2, 0.09, 0.09, { segY: 1 }), at(F, tx + 0.1, rT + 0.35, tz + 0.5), { worldUV: false });
    }
    if (rng.bool(0.35)) B.addInstance(pFlagpole(B), at(F, 0, rT + parapetH + 0.04, zF - 0.55));
    for (let i = 0; i < rng.int(4, 7); i++) {
      K.vent(at(F, rng.range(-hw * 0.75, hw * 0.75), rT, zF - dep * rng.range(0.18, 0.92)), {
        kind: rng.pick(['pipe', 'pipe', 'pipe', 'goose', 'whirly']),
      });
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      K.hvac(at(F, rng.range(-hw * 0.6, hw * 0.6), rT, zF - dep * rng.range(0.45, 0.85), rng.range(0, 1.4)));
    }
    {
      // dish cluster on the parapet, the way they actually get bolted on
      const did = pDish(B);
      const cx = rng.range(-hw * 0.6, hw * 0.6);
      for (let i = 0; i < rng.int(2, 5); i++) {
        B.addInstance(did, at(F, cx + rng.range(-1.4, 1.4), rT + parapetH + 0.11,
          zF - rng.range(0.15, 1.0), rng.range(-1.3, 1.3)));
      }
    }
    if (rng.bool(0.5)) {
      const rid = pPipeRail(B);
      const n = Math.max(2, Math.round(hw));
      for (let i = 0; i < n; i++) B.addInstance(rid, at(F, -hw + (hw * 2 / n) * (i + 0.5), rT, -D + 0.7));
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      K.antenna(at(F, rng.range(-hw * 0.8, hw * 0.8), rT, zF - dep * rng.range(0.3, 0.8)));
    }
    // caged roof hatch
    {
      const hx = rng.range(-hw * 0.5, hw * 0.5), hz = zF - dep * rng.range(0.3, 0.6);
      B.addMerged('deco:castStone', box(1.3, 0.32, 1.1, { segY: 1 }), at(F, hx, rT, hz), { tint: stoneTint });
      const cage = [];
      for (const [dx, dz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
        cage.push({ geom: cylinder(0.03, 0.03, 1.05, 6), x: dx, y: 0, z: dz });
      }
      cage.push({ geom: box(1.28, 0.035, 0.035, { segY: 1 }), x: 0, y: 1.0, z: -0.5 });
      cage.push({ geom: box(1.28, 0.035, 0.035, { segY: 1 }), x: 0, y: 1.0, z: 0.5 });
      B.addMerged('steelDark', compose(cage), at(F, hx, rT + 0.32, hz), { worldUV: false });
    }
    // spalled tar patches on the deck
    for (let i = 0; i < rng.int(3, 6); i++) {
      const pw = rng.range(1.4, 3.6), pd = rng.range(1.2, 3.0);
      B.addMerged('roofBlack', box(pw, 0.03, pd, { segY: 1 }),
        at(F, rng.range(-hw * 0.8, hw * 0.8), rT + 0.005, zF - dep * rng.range(0.12, 0.9), rng.range(0, 1.5)),
        { tint: new THREE.Color().setHSL(0.08, 0.03, rng.range(0.5, 0.85)) });
    }
  }

  return { height: TT.y1 + parapetH + finBase + 0.4 };
}
