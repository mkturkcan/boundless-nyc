// RIDGEWOOD / ASTORIA "MATHEWS MODEL FLATS" — G. X. Mathews, c.1908-1930.
// Three storeys of pale Kreischer buff brick over a banded stone base, built in
// hundreds of identical units down whole blocks.  The signature moves, bottom
// to top: a grey cast-stone water table and lintel band at the parlour floor;
// segmental-arched second-floor heads and ROUND-arched third-floor heads, both
// turned in contrasting orange-red brick with a corbelled brick label over
// them; a corbel table of small brick arches; and a heavy galvanised pressed-
// metal cornice on scrolled consoles with cast swag panels between.  A low
// stoop with iron pipe rails, an areaway fence, and store fronts on corners.
// Refs: refs/boroughs/queensrow-mathews-ridgewood-*.jpg
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, compose, profileAlongX, ensureColor } from '../geo.js';
import { brickTexture, stoneTexture } from '../textures.js';

export const TYPE = 'queensrow';

const q05 = (v) => Math.round(v * 20) / 20;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------
function ensureMats(B) {
  if (B.M.has('queensrow:kreischer')) return;
  const mk = (name, tex, opts) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, bumpMap: tex.bumpMap || null, ...opts,
    });
    m.userData.tileMeters = tex.tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  // Kreischer buff — pale cream-YELLOW, iron-spotted, very fine light joints.
  // Measured against the refs the old hue 42 / light 50 rendered as a tan
  // (sunlit #DCC9A4, G = R-19, hue ~38 deg) where real sunlit Kreischer is a
  // yellow-green cream with G >= R at hue ~52 deg and a good 25 code values
  // brighter.  Rotating the hue up and lifting the value is the single biggest
  // colour correction on this type.
  // hue 51 / light 56 overshot: the wall came out chartreuse-green under flat
  // noon light and the sunlit face clipped at golden hour.  45 / 52 keeps the
  // yellow-cream cast (still well clear of the old tan at hue 38) with the
  // sunlit value back under the roll-off.
  mk('queensrow:kreischer', brickTexture({
    hue: 45, sat: 17, light: 52, dh: 3, ds: 5, dl: 6,
    mortar: '#a09a86', mortarLight: 0.0,
    darkBrickChance: 0.045, darkBrickColor: 'hsl(34,19%,36%)', seed: 251,
  }), { bumpScale: 1.0, roughness: 0.89, envMapIntensity: 0.38 });
  // a second, greyer burn of the same brick for tonal variety down a row
  mk('queensrow:kreischerPale', brickTexture({
    hue: 43, sat: 12, light: 54, dh: 3, ds: 5, dl: 6,
    mortar: '#a19e92', mortarLight: 0.0,
    darkBrickChance: 0.035, darkBrickColor: 'hsl(32,13%,38%)', seed: 252,
  }), { bumpScale: 1.0, roughness: 0.89, envMapIntensity: 0.38 });
  // deep red-brown trim brick — every arch, label and pier band is turned in
  // this.  Only ~25% darker than the buff field, NOT a hot terracotta.
  mk('queensrow:redtrim', brickTexture({
    hue: 14, sat: 30, light: 30, dh: 4, ds: 8, dl: 7,
    mortar: '#9c9481', darkBrickChance: 0.05, seed: 253,
  }), { bumpScale: 1.15, roughness: 0.9, envMapIntensity: 0.45 });
  // grey cast stone / bluestone banding
  mk('queensrow:caststone', stoneTexture({
    base: '#8f8d86', blockW: 1.1, blockH: 0.34, jointDark: 0.2, weather: 0.14, seed: 254,
  }), { roughness: 0.82, envMapIntensity: 0.5 });
  // GLAZING — dark base colour so the sash can never wash out; the per-window
  // instance tint is a MULTIPLIER around 1.0, not an absolute colour.
  // At roughness 0.27 / metalness 0.10 the golden-hour sun (which front-lights
  // the showcase facade almost head-on at 4.4) put ~3 units of warm specular on
  // every pane and the whole elevation read as blank milk-white panels.  It was
  // only correct at noon, when the sun is 58 deg up and misses the glass.
  // Even at roughness 0.42 the head-on golden sun leaves F*V*D ~= 0.10 against
  // an irradiance of 4.27 — about 0.44 of specular, MORE than the sunlit brick's
  // diffuse — so the sashes still rendered at or above the wall value.  Pull F0
  // down with specularIntensity (MeshPhysicalMaterial) instead of roughening the
  // glass into plaster, and raise the albedo so the pane lands near half the
  // sunlit brick value rather than going black.
  const gl = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0x3e454f, roughness: 0.46, metalness: 0.0,
    specularIntensity: 0.35, envMapIntensity: 0.28,
  });
  gl.userData.tileMeters = 1;
  gl.name = 'queensrow:glaze';
  B.M.set('queensrow:glaze', gl);
  // Thin roof gear on the shared 'aluminum' (roughness 0.35, metalness 0.9,
  // envMapIntensity 1.0) turned into specular fireflies — the TV aerial's 22 mm
  // elements rendered as glowing white dashes.  A dull galvanised finish for
  // anything that is only a couple of pixels wide.
  const dm = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0x9a9d9f, roughness: 0.66, metalness: 0.30,
    envMapIntensity: 0.45,
  });
  dm.userData.tileMeters = 1;
  dm.name = 'queensrow:dullmetal';
  B.M.set('queensrow:dullmetal', dm);
}

// opaque dark glazing pane replacing the kit's shared (too light) glass
function pPane(B, w, h, recess, frameW) {
  w = q05(w); h = q05(h);
  const id = `queensrow:pane:${w}x${h}:${recess}`;
  if (B.hasPart(id)) return id;
  const g = quad(w - frameW - 0.02, h - frameW - 0.02);
  g.translate(0, frameW / 2 + 0.01, -recess + 0.026);
  B.definePart(id, g, 'queensrow:glaze', { castShadow: false });
  return id;
}

// ---------------------------------------------------------------------------
// PROFILES (profileAlongX throws toward LOCAL -Z: placements add ry = PI)
// ---------------------------------------------------------------------------
const PROF = {
  // Galvanised pressed-metal crown: fascia, big corona, cyma, top fillet.
  // Deepened from 0.66 to 0.78 of projection and 0.90 to 1.02 of height so the
  // corona throws the hard black shadow band across the top of the wall that is
  // the loudest single feature of a Mathews block in a photograph.
  cornice: [
    [0, 0], [0.09, 0.02], [0.11, 0.10], [0.16, 0.13], [0.17, 0.25], [0.23, 0.28],
    [0.23, 0.45], [0.73, 0.63], [0.78, 0.75], [0.74, 0.86], [0.65, 0.91],
    [0.68, 1.02], [0, 1.02],
  ],
  // continuous cast-stone sill course
  sillBand: [[0, 0], [0.08, 0.0], [0.08, 0.09], [0.045, 0.13], [0, 0.13]],
  // cast-stone lintel band over the parlour windows
  lintelBand: [[0, 0], [0.07, 0.0], [0.07, 0.26], [0.045, 0.30], [0, 0.30]],
  // grey water table at the sidewalk
  waterTable: [[0, 0], [0.10, 0.0], [0.10, 0.30], [0.055, 0.38], [0.055, 0.42], [0, 0.42]],
  // two-step brick corbel string between storeys
  corbelStr: [[0, 0], [0.055, 0.0], [0.055, 0.075], [0.105, 0.075], [0.105, 0.15], [0.055, 0.18], [0, 0.18]],
  // deep corbel band carrying the cornice
  corbelCap: [
    [0, 0], [0.06, 0.0], [0.06, 0.09], [0.12, 0.09], [0.12, 0.19], [0.19, 0.19],
    [0.19, 0.30], [0.14, 0.34], [0.16, 0.40], [0, 0.40],
  ],
};

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

// arched window head in contrasting brick.  kind 'round' -> rise = w/2,
// 'seg' -> shallow segmental.  Anchor: x centred, y = springing (window head).
function pArch(B, w, kind, mat) {
  w = q05(w);
  const id = `queensrow:arch:${kind}:${mat}:${w}`;
  if (B.hasPart(id)) return id;
  const R = kind === 'round' ? w / 2 : (w * w / 4 + 0.20 * 0.20) / (2 * 0.20);
  const rise = kind === 'round' ? w / 2 : 0.20;
  const cy = rise - R;                       // arc centre relative to springing
  const a0 = Math.asin((w / 2) / R);
  const T = 0.115;                           // ONE rowlock ring, one header deep
  const items = [];
  const n = kind === 'round' ? 15 : 9;
  for (let i = 0; i < n; i++) {
    const t = -a0 + (2 * a0) * ((i + 0.5) / n);
    const bwid = (2 * a0 * (R + T / 2)) / n * 1.14;
    items.push({
      geom: box(bwid, T, 0.09, { segY: 1 }), rz: -t,
      x: Math.sin(t) * (R + T / 2), y: cy + Math.cos(t) * (R + T / 2), z: 0.045,
    });
  }
  // one corbelled label / drip course riding over the extrados — the Mathews
  // signature.  Shallow: it projects 0.05 beyond the ring, not 0.19.
  const lm = n + 2;
  for (let i = 0; i < lm; i++) {
    const t = -a0 * 1.13 + (2 * a0 * 1.13) * ((i + 0.5) / lm);
    items.push({
      geom: box(0.075, 0.085, 0.14, { segY: 1 }), rz: -t,
      x: Math.sin(t) * (R + T + 0.045), y: cy + Math.cos(t) * (R + T + 0.045), z: 0.07,
    });
  }
  B.definePart(id, compose(items), mat);
  // the sash follows the arch: glazed tympanum set back behind the ring
  const g = new THREE.CircleGeometry(R - 0.01, kind === 'round' ? 20 : 24, Math.PI / 2 - a0, 2 * a0);
  g.translate(0, cy, -0.14);
  B.definePart(id + ':glass', g, 'queensrow:glaze', { castShadow: false });
  // SASH HEAD FOLLOWING THE ARCH.  A straight spring rail plus a rectangular
  // sash below it is exactly the "arch printed over a square hole" tell: the
  // white top rail of the window unit cuts a hard horizontal line across the
  // springing and the brick ring reads as an applique floating above it.
  // A curved head rail — the sash's own arched top member, stepped in short
  // segments along the intrados — is what makes it read as a real arched
  // opening.  Still NO radiating fan bars: they alias into a white sunburst.
  const mu = [];
  const nH = kind === 'round' ? 13 : 9;
  const Ri = R - 0.055;                     // intrados, minus half the rail
  for (let i = 0; i < nH; i++) {
    const t = -a0 + (2 * a0) * ((i + 0.5) / nH);
    const seg = (2 * a0 * Ri) / nH * 1.22;
    mu.push({
      geom: box(seg, 0.055, 0.06, { segY: 1 }), rz: -t,
      x: Math.sin(t) * Ri, y: cy + Math.cos(t) * Ri, z: -0.115,
    });
  }
  // the meeting rail of the arched top sash, a third of the way down the rise
  mu.push({ geom: box(w - 0.10, 0.045, 0.055, { segY: 1 }), x: 0, y: -0.02, z: -0.115 });
  B.definePart(id + ':muntin', compose(mu), 'windowFrame');
  return id;
}

// one bay of the corbel table: a bracket plus the small arch springing from it
function pCorbelBay(B, pitch, mat) {
  pitch = q05(pitch);
  const id = `queensrow:corbelbay:${mat}:${pitch}`;
  if (B.hasPart(id)) return id;
  const items = [];
  // three genuinely stepped courses, projecting 0.035 / 0.070 / 0.105
  items.push({ geom: box(0.16, 0.09, 0.035, { segY: 1 }), x: 0, y: -0.18, z: 0.018 });
  items.push({ geom: box(0.16, 0.09, 0.070, { segY: 1 }), x: 0, y: -0.09, z: 0.035 });
  items.push({ geom: box(0.16, 0.32, 0.105, { segY: 1 }), x: 0, y: 0, z: 0.053 });
  const R = (pitch - 0.16) / 2;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * ((i + 0.5) / n);
    items.push({
      geom: box((Math.PI * R / n) * 1.2, 0.085, 0.09, { segY: 1 }), rz: a - Math.PI / 2,
      x: pitch / 2 + Math.cos(a) * R, y: 0.32 - 0.085 + Math.sin(a) * R * 0.55, z: 0.045,
    });
  }
  B.definePart(id, compose(items), mat);
  return id;
}

// scrolled sheet-metal console under the cornice
function pConsole(B) {
  const id = 'queensrow:console';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.14, 0.62, 0.44, { segY: 2 }), x: 0, y: 0, z: 0.22 });
  items.push({ geom: box(0.20, 0.09, 0.56, { segY: 1 }), x: 0, y: 0.62, z: 0.28 });
  items.push({ geom: box(0.19, 0.17, 0.20, { segY: 1 }), x: 0, y: 0.44, z: 0.50 });
  items.push({ geom: cylinder(0.10, 0.10, 0.20, 10), x: 0, y: 0.13, z: 0.13, rz: Math.PI / 2 });
  items.push({ geom: box(0.16, 0.13, 0.30, { segY: 1 }), x: 0, y: 0.02, z: 0.10 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// cast swag panel in the cornice frieze between two consoles
function pSwagPanel(B, w) {
  w = q05(w);
  const id = `queensrow:swag:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(w, 0.40, 0.09, { segY: 1 }), x: 0, y: 0, z: 0.045 });
  const sw = box(w * 0.60, 0.13, 0.05, { segY: 1 });
  ensureColor(sw, new THREE.Color(1.06, 1.06, 1.05));
  items.push({ geom: sw, x: 0, y: 0.13, z: 0.085 });
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.09, 0.20, 0.04, { segY: 1 }), x: s * w * 0.32, y: 0.09, z: 0.08 });
  }
  items.push({ geom: box(0.13, 0.13, 0.05, { segY: 1 }), x: 0, y: 0.05, z: 0.085, rz: Math.PI / 4 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

function pDentils(B, len) {
  len = q05(len);
  const id = `queensrow:dentils:${len}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const n = Math.max(4, Math.round(len / 0.16));
  const p = len / n;
  for (let i = 0; i < n; i++) {
    items.push({ geom: box(p * 0.55, 0.13, 0.12, { segY: 1 }), x: -len / 2 + p * (i + 0.5), y: 0, z: 0.06 });
  }
  items.push({ geom: box(len, 0.05, 0.07, { segY: 1 }), x: 0, y: 0.13, z: 0.035 });
  B.definePart(id, compose(items), 'cornicePaint');
  return id;
}

// pedimented cast-stone door hood on console brackets
function pDoorHood(B, w) {
  w = q05(w);
  const id = `queensrow:doorhood:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const ow = w + 0.74;
  // scrolled console brackets carrying the hood 0.45 m off the wall
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.22, 0.70, 0.35, { segY: 2 }), x: s * (w / 2 + 0.15), y: -0.70, z: 0.175 });
    items.push({ geom: box(0.28, 0.11, 0.42, { segY: 1 }), x: s * (w / 2 + 0.15), y: -0.11, z: 0.21 });
    items.push({ geom: cylinder(0.09, 0.09, 0.24, 8), x: s * (w / 2 + 0.15), y: -0.62, z: 0.10, rz: Math.PI / 2 });
  }
  // carved frieze with a cartouche + cornice
  items.push({ geom: box(ow, 0.36, 0.30, { segY: 1 }), x: 0, y: 0, z: 0.15 });
  const orn = box(ow * 0.72, 0.18, 0.06, { segY: 1 });
  ensureColor(orn, new THREE.Color(1.07, 1.07, 1.05));
  items.push({ geom: orn, x: 0, y: 0.10, z: 0.32 });
  const car = box(0.24, 0.24, 0.07, { segY: 1 });
  car.rotateZ(Math.PI / 4);
  ensureColor(car, new THREE.Color(1.10, 1.10, 1.08));
  items.push({ geom: car, x: 0, y: 0.18, z: 0.34 });
  items.push({ geom: box(ow + 0.18, 0.12, 0.48, { segY: 1 }), x: 0, y: 0.36, z: 0.24 });
  // low triangular pediment
  const steps = 10, ph = 0.30;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    items.push({
      geom: box((ow + 0.18) * (1 - t * 0.86), ph / steps + 0.012, 0.40 - t * 0.10, { segY: 1 }),
      x: 0, y: 0.48 + (ph / steps) * i, z: 0.20,
    });
  }
  B.definePart(id, compose(items), 'queensrow:caststone');
  return id;
}

// low cast-stone stoop with raking cheek walls (the kit stoop's baluster rail
// reads as loose floating bars at this scale, so the flight is built here and
// gets the plain iron PIPE rail the Ridgewood houses actually have).
function pStoop(B, w, h, n, tread) {
  w = q05(w); h = q05(h);
  const id = `queensrow:stoop:${w}x${h}:${n}`;
  if (B.hasPart(id)) return id;
  const rise = h / n, run = n * tread;
  const items = [];
  for (let s = 0; s < n; s++) {
    const d = run - s * tread;
    const g = box(w, rise + 0.02, d, { segY: 1 });
    boxUV(g, w, rise + 0.02, d, 2);
    items.push({ geom: g, x: 0, y: s * rise, z: d / 2 });
  }
  for (const side of [-1, 1]) {
    const sx = side * (w / 2 + 0.14);
    for (let s = 0; s < n; s++) {
      const g = box(0.28, s * rise + 0.36, tread + 0.01, { segY: 1 });
      boxUV(g, 0.28, s * rise + 0.36, tread + 0.01, 2);
      items.push({ geom: g, x: sx, y: 0, z: run - s * tread - tread / 2 });
    }
    // Newel block at the foot.  At z = run + 0.05 it overlapped the bottom
    // tread and the first cheek-wall block by 0.12 m — two stone volumes
    // interpenetrating right where the eye lands.  Sit it clear in FRONT of the
    // flight, which is where a real newel is anyway.
    const nb = box(0.34, 0.52, 0.34, { segY: 1 });
    boxUV(nb, 0.34, 0.52, 0.34, 2);
    items.push({ geom: nb, x: sx, y: 0, z: run + 0.18 });
  }
  B.definePart(id, compose(items), 'queensrow:caststone');
  return id;
}

function pStoopRail(B, h, run) {
  h = q05(h); run = q05(run);
  const id = `queensrow:stooprail:${h}x${run}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const slen = Math.hypot(h, run);
  const g = box(0.05, slen + 0.14, 0.05, { segY: 1 });
  g.rotateX(-Math.atan2(run, h));
  items.push({ geom: g, x: 0, y: 0.80, z: run + 0.04 });
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // The posts used to start 0.34 m ABOVE the tread they belong to and so hung
    // in mid-air under the rail.  Start each one 0.06 m INSIDE the stone (which
    // is how a pipe rail is actually set) and run it well past the rake so it
    // always meets the handrail.
    items.push({
      geom: cylinder(0.024, 0.024, 1.02, 6), x: 0,
      y: h * t - 0.06, z: run * (1 - t),
    });
  }
  B.definePart(id, compose(items), 'ironwork');
  return id;
}

// basement areaway grate + cellar hatch
function pAreaway(B, w) {
  w = q05(w);
  const id = `queensrow:areaway:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  for (let i = 0; i < Math.max(3, Math.round(w / 0.14)); i++) {
    const n = Math.max(3, Math.round(w / 0.14));
    items.push({ geom: box(0.05, 0.04, 0.62, { segY: 1 }), x: -w / 2 + (w / n) * (i + 0.5), y: 0, z: 0 });
  }
  items.push({ geom: box(w, 0.05, 0.06, { segY: 1 }), x: 0, y: 0, z: 0.30 });
  items.push({ geom: box(w, 0.05, 0.06, { segY: 1 }), x: 0, y: 0, z: -0.30 });
  B.definePart(id, compose(items), 'ironwork');
  return id;
}

// the big rooftop TV aerial every Ridgewood roof still carries
function pAerial(B) {
  const id = 'queensrow:aerial';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.03, 0.04, 4.0, 6), x: 0, y: 0, z: 0 });
  for (let i = 0; i < 6; i++) {
    const y = 2.1 + i * 0.30;
    const l = 1.5 - i * 0.16;
    items.push({ geom: box(l, 0.022, 0.022, { segY: 1 }), x: 0, y, z: 0 });
    items.push({ geom: box(0.022, 0.022, 0.30, { segY: 1 }), x: 0, y, z: 0 });
  }
  items.push({ geom: box(0.9, 0.02, 0.02, { segY: 1 }), x: 0, y: 3.95, z: 0, ry: 0.4 });
  for (const s of [-1, 1]) {
    items.push({ geom: cylinder(0.05, 0.06, 0.9, 6), x: s * 0.25, y: 0, z: 0 });
  }
  B.definePart(id, compose(items), 'queensrow:dullmetal');
  return id;
}

// red-brick diamond / lozenge inlay set into the buff field
function pDiamond(B, mat) {
  const id = `queensrow:diamond:${mat}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(0.34, 0.34, 0.05, { segY: 1 });
  boxUV(g, 0.34, 0.34, 0.05, 2);
  g.rotateZ(Math.PI / 4);
  items.push({ geom: g, x: 0, y: 0, z: 0.025 });
  const g2 = box(0.15, 0.15, 0.07, { segY: 1 });
  boxUV(g2, 0.15, 0.15, 0.07, 2);
  g2.rotateZ(Math.PI / 4);
  ensureColor(g2, new THREE.Color(0.86, 0.86, 0.84));
  items.push({ geom: g2, x: 0, y: 0, z: 0.035 });
  B.definePart(id, compose(items), mat);
  return id;
}

// One block of the alternating red-brick corner quoin.  Look at any Mathews
// flat (refs/boroughs/queensrow-mathews-ridgewood-01.jpg): the building corners
// are stopped with short blocks of the same orange-red trim brick as the arches,
// every other course-group, from the water table up to the corbel table.  It is
// the second-strongest identifier after the arcaded heads, and it was missing —
// which left the buff field running into the party wall with no corner at all.
// Instanced: ~14 blocks per corner collapse to one draw call.
function pQuoinBlock(B, w, h, mat) {
  w = q05(w); h = q05(h);
  const id = `queensrow:quoinblk:${mat}:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const g = box(w, h, 0.055, { segY: 1 });
  boxUV(g, w, h, 0.055, 2);
  g.translate(0, 0, 0.0275);
  B.definePart(id, g, mat);
  return id;
}

// rooftop clothes-line pole
function pClothesPole(B) {
  const id = 'queensrow:clothespole';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.055, 0.075, 2.6, 6), x: 0, y: 0, z: 0 });
  items.push({ geom: box(0.9, 0.06, 0.06, { segY: 1 }), x: 0, y: 2.5, z: 0 });
  for (const s of [-1, 1]) items.push({ geom: cylinder(0.05, 0.05, 0.10, 8), x: s * 0.42, y: 2.5, z: 0 });
  B.definePart(id, compose(items), 'woodStave');
  return id;
}

// ---------------------------------------------------------------------------
// GENERATE
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMats(B);
  const F = lot.frame;

  const W = lot.width;
  const D = Math.max(9, lot.depth);
  const stories = clamp(lot.stories || rng.weighted([[3, 16], [2, 2], [4, 1]]), 2, 4);
  const corner = lot.corner | 0;
  const commercial = !!lot.commercial || (corner !== 0 && rng.bool(0.55));
  const mir = lot.mirror ? -1 : 1;

  // ---- vertical schedule: the storeys STEP DOWN, and the parlour floor sits
  // on a raised English basement so the stoop climbs six risers --------------
  // Mathews floor-to-floor is about 3.05 m; the old schedule ran 3.4-3.65 on the
  // parlour floor and pushed the cornice ~1 m too high for a three-storey flat.
  const base = q05(rng.range(1.05, 1.28));            // raised basement
  const story1 = q05(rng.range(3.14, 3.36));
  const floorH = q05(rng.range(2.94, 3.10));          // 2nd floor
  const floor3H = q05(floorH - rng.range(0.08, 0.18));
  const storyH = (f) => (f === 1 ? story1 : f === 2 ? floorH : floor3H);
  const floorY = (f) => {
    let y = base;
    for (let i = 1; i < f; i++) y += storyH(i);
    return y;
  };
  const wallTop = floorY(stories) + storyH(stories);
  // Mathews sashes are NARROW AND TALL, about 1:2.4.  The old schedule spent so
  // much of each storey on sill height and head clearance that winHFor() clamped
  // the top-floor sash down to ~1.5 m on a 0.85 m opening — aspect 1:1.7, which
  // reads near-square and commercial.  A lower sill and a tighter head reserve
  // buy back a quarter of a metre of glass on every floor.
  const sillY = q05(rng.range(0.52, 0.64));
  const winH = q05(rng.range(1.86, 2.10));
  const g1WinH = q05(winH + rng.range(0.06, 0.22));

  // ---- palette -------------------------------------------------------------
  const fieldMat = rng.weighted([['queensrow:kreischer', 7], ['queensrow:kreischerPale', 4]]);
  const trimBrick = 'queensrow:redtrim';
  const stoneMat = 'queensrow:caststone';
  const brickTint = facadeTint(rng);
  const redTint = facadeTint(rng, new THREE.Color(1, 0.99, 0.98));
  const stoneTint = facadeTint(rng, new THREE.Color(0.99, 0.99, 0.98));
  // The pressed-metal crown is the strongest thing you read at 30 m, and it can
  // only do that job if it CONTRASTS with the brick.  The old palette was three
  // mid-greys sitting within a few code values of the sunlit Kreischer, so the
  // silhouette dissolved.  Real Ridgewood cornices are painted bright white or
  // a dark brown/green — the mid-greys are the one thing they are not.
  // VALUE CAP.  'cornicePaint' is white with a semi-gloss lobe, so a cornice
  // facing a 4.4 head-on sun clips long before its hex looks bright: 0xd8d5cc
  // and even 0xc2bfb6 rendered as a featureless white block wrapped in a bloom
  // halo, and the profile's crown/dentils/frieze — the whole reason the crown
  // reads at 30 m — disappeared into it.  Nothing here goes above ~0.35 linear,
  // and bare galvanised grey leads because it holds internal separation best.
  const cornTint = new THREE.Color(rng.weighted([
    [0x9d9a90, 5],   // bare / weathered galvanised
    [0xaeaaa0, 3],   // white-painted, held well under the clip
    [0x4f4a42, 3],   // dark brown
    [0x3f4740, 2],   // dark green
  ]));
  // Mathews sashes really are painted bright white, so this stays the dominant
  // option — just pulled back from 0xdedbd2 (linear 0.70, which blows under a
  // head-on 4.4 sun) to something that keeps highlight headroom.
  const frameTint = new THREE.Color(rng.weighted([[0xcac6bc, 7], [0x8e8a80, 2], [0x3d372f, 2]]));
  const groundRed = rng.bool(0.78);
  const diamonds = rng.bool(0.45);
  const groundMat = groundRed ? trimBrick : fieldMat;
  const groundTint = groundRed ? redTint : brickTint;
  // Ridgewood sashes read DARK behind their white frames — a drawn shade is a
  // warm grey, not a light box.  gBase up to 1.05 with a 2.05 shade multiplier
  // meant a quarter of the windows rendered as solid white cards.
  const gBase = rng.range(0.62, 0.86);       // per-building glazing value
  const glassFor = () => {
    const r = rng.next();
    if (r < 0.07) return new THREE.Color(1.55, 1.75, 1.95).multiplyScalar(gBase); // sky flash
    if (r < 0.24) return new THREE.Color(1.16, 1.10, 1.00).multiplyScalar(gBase); // shade / net curtain
    const j = rng.range(0.58, 0.92) * gBase;
    return new THREE.Color(j, j * rng.range(0.98, 1.05), j * rng.range(1.0, 1.1));
  };
  // deeper reveal — the jamb and head shadows are what make a punched masonry
  // opening read as masonry rather than a decal, and 0.19 m was too shallow to
  // register with the sun nearly head-on
  const RECESS = 0.24, FRAMEW = 0.05;
  const putWin = (w, h, m, lit, gTint = null) => {
    const ids = K.windowPart({ w, h, style: 'dh1', recess: RECESS, frameW: FRAMEW });
    B.addInstance(ids.id, m, frameTint);
    B.addInstance(pPane(B, w, h, RECESS, FRAMEW), m, gTint || glassFor());
    if (lit) B.addInstance(ids.litId, m, new THREE.Color(1.0, 0.86, 0.62));
  };

  // ---- bays ----------------------------------------------------------------
  const endPier = q05(clamp(rng.range(0.42, 0.62), 0.32, W * 0.10));
  const usable = W - 2 * endPier;
  // tall NARROW 1/1 double hungs: ~0.85 m wide, ~1.9 m tall, about 1:2.2
  const winW = q05(clamp(rng.range(0.80, 0.92), 0.72, usable / 2.4));
  const nWin = clamp(Math.round(usable / (winW + rng.range(0.62, 0.86))), 2, 6);
  const xs = [];
  for (let i = 0; i < nWin; i++) xs.push(q05(-usable / 2 + (usable / nWin) * (i + 0.5)));
  const wide = W >= 7.4;
  // arched heads must clear the ceiling: fit the sash to the storey height.
  // riseSeg 0.20 on an 0.85 m opening gives a 50 deg half-angle, which reads as
  // a near-round arch and collides with the round-arched top floor; the Mathews
  // second-floor heads are much shallower than that.
  const riseRnd = q05(winW / 2), riseSeg = 0.15;
  const winHFor = (f) => {
    const sh = storyH(f);
    if (f === stories) return q05(clamp(sh - sillY - riseRnd - 0.16, 1.55, winH));
    if (f >= 2) return q05(clamp(sh - sillY - riseSeg - 0.20, 1.60, winH));
    return winH;
  };

  // ---- ground floor: stoop + door + parlour windows ------------------------
  const doorW = q05(wide ? rng.range(1.50, 1.75) : rng.range(1.05, 1.25));
  const doorH = q05(rng.range(2.45, 2.70));
  const doorX = q05(wide ? 0 : mir * (W / 2 - endPier - doorW / 2 - 0.05));
  // parlour sashes are only a little wider than the upper ones — at up to 1.5 m
  // against a 1.9 m height they came out nearly square, which is a Chicago
  // two-flat proportion, not a Ridgewood one (the refs run about 1:2)
  const gWinW = q05(clamp(winW + rng.range(0.04, 0.22), 0.84, 1.14));
  const gXs = [];
  if (!commercial) {
    const free = [];
    if (wide) {
      free.push([-W / 2 + endPier, doorX - doorW / 2 - 0.28]);
      free.push([doorX + doorW / 2 + 0.28, W / 2 - endPier]);
    } else {
      const a = doorX < 0 ? [doorX + doorW / 2 + 0.28, W / 2 - endPier]
        : [-W / 2 + endPier, doorX - doorW / 2 - 0.28];
      free.push(a);
    }
    for (const [a, b] of free) {
      const len = b - a;
      const n = clamp(Math.round(len / (gWinW + 0.55)), 0, 3);
      for (let i = 0; i < n; i++) gXs.push(q05(a + (len / n) * (i + 0.5)));
    }
  }

  // =========================================================================
  // FRONT WALL
  // =========================================================================
  const archKind = (f) => (f === stories ? 'round' : f >= 2 ? 'seg' : null);
  const headRise = (f) => (f === stories ? riseRnd : f >= 2 ? riseSeg : 0);

  const rows = [];
  // basement band with areaway lights
  const bLights = [];
  if (base > 0.85 && !commercial) {
    for (const x of gXs) bLights.push({ x, w: q05(Math.min(gWinW, 1.05)), y0: 0.22, y1: base - 0.30 });
  }
  if (bLights.length) rows.push({ y0: 0.02, y1: base - 0.16, openings: bLights });

  // parlour floor
  {
    const y = floorY(1), y0 = y + sillY, y1 = y0 + g1WinH;
    const ops = [];
    if (commercial) {
      const sfW = q05(Math.min(W - 2 * endPier - (wide ? doorW + 0.5 : 0), 6.0));
      const sfX = wide ? 0 : q05(-mir * (W / 2 - endPier - sfW / 2));
      ops.push({ x: sfX, w: sfW, y0: base * 0 + 0.06, y1: Math.max(y1, 3.4) });
      if (!wide) ops.push({ x: doorX, w: doorW, y0: 0.06, y1: Math.max(y1, 3.4) });
      rows.push({ y0: 0.04, y1: Math.max(y1, 3.4), openings: ops.sort((a, b) => a.x - b.x) });
    } else {
      for (const x of gXs) ops.push({ x, w: gWinW, y0, y1 });
      ops.push({ x: doorX, w: doorW, y0: base - 0.16, y1: base + doorH });
      ops.sort((a, b) => a.x - b.x);
      rows.push({ y0: base - 0.16, y1: Math.max(y1, base + doorH), openings: ops });
    }
  }
  // upper floors
  for (let f = 2; f <= stories; f++) {
    const y0 = floorY(f) + sillY;
    rows.push({ y0, y1: y0 + winHFor(f) + headRise(f), openings: xs.map((x) => ({ x, w: winW })) });
  }
  rows.sort((a, b) => a.y0 - b.y0);

  punchedWall(ctx, F, {
    width: W, height: wallTop, depth: 0.38, mat: fieldMat, tint: brickTint,
    rows, grime: 0.3, aoTop: wallTop,
  });

  // banded raised basement: proud red-brick panels between the areaway lights
  if (!commercial && base > 1.0) {
    const y0 = 0.48, y1 = base - 0.28;
    if (y1 - y0 > 0.24) {
      let px = -W / 2;
      const segs = [];
      for (const o of [...bLights].sort((a, b) => a.x - b.x)) {
        const l = o.x - o.w / 2;
        if (l > px + 0.02) segs.push([px, l]);
        px = o.x + o.w / 2;
      }
      if (px < W / 2 - 0.02) segs.push([px, W / 2]);
      for (const [a, b] of segs) {
        if (b - a < 0.28) continue;
        B.addMerged(trimBrick, box(b - a, y1 - y0, 0.05, { segY: 1 }),
          at(F, (a + b) / 2, y0, 0.025), { tint: redTint, grime: 0.45 });
      }
    }
  }

  // ---- ground-floor field ---------------------------------------------------
  // The refs are a PALE Kreischer field carrying narrow orange-red rowlock
  // bands; the old code made the field red with wide pale gaps — the value
  // relationship inverted, so the parlour floor read as a different building
  // bolted onto the bottom.  The all-red pier treatment does exist on some
  // Mathews blocks, so it survives as the minority scheme.
  if (!commercial) {
    const gTop = q05(floorY(1) + sillY + g1WinH + 0.05);
    const segs = [];
    let px = -W / 2;
    const opsG = [...gXs.map((x) => ({ x, w: gWinW })), { x: doorX, w: doorW }].sort((a, b) => a.x - b.x);
    for (const o of opsG) {
      const l = o.x - o.w / 2;
      if (l > px + 0.02) segs.push([px, l]);
      px = o.x + o.w / 2;
    }
    if (px < W / 2 - 0.02) segs.push([px, W / 2]);
    // REVERTED: an earlier pass replaced this with narrow rowlock bands on 0.90 m
    // centres.  Because the bands can only exist in the PIERS between openings,
    // they came out as short red rectangles at a dozen different heights and
    // widths — red confetti scattered over the wall instead of banding — and it
    // also flattened the elevation to one buff tone from grade to cornice.
    // refs/boroughs/queensrow-mathews-ridgewood-01.jpg and -03 both show a
    // distinctly DARKER red-brown parlour storey under the buff shaft: that
    // base/shaft/cornice split is the type's proportional signature, so the
    // proud red pier field is the right answer and is now the dominant scheme.
    if (groundRed) {
      for (const [a, b] of segs) {
        const g = box(b - a, gTop - base + 0.30, 0.07, { segY: 2 });
        B.addMerged(trimBrick, g, at(F, (a + b) / 2, base - 0.30, 0.035), { tint: redTint, grime: 0.34 });
      }
    }
  }

  // =========================================================================
  // WINDOWS + ARCHED HEADS
  // =========================================================================
  for (let f = 2; f <= stories; f++) {
    const y0 = floorY(f) + sillY;
    const kind = archKind(f);
    const hw = winHFor(f);
    for (const x of xs) {
      putWin(winW, hw, at(F, x, y0, 0), rng.bool(0.36));
      K.sill(winW, at(F, x, y0, 0), { mat: stoneMat, tint: stoneTint });
      if (kind) {
        const aid = pArch(B, winW, kind, trimBrick);
        B.addInstance(aid, at(F, x, y0 + hw, 0), redTint);
        B.addInstance(aid + ':glass', at(F, x, y0 + hw, 0), glassFor());
        B.addInstance(aid + ':muntin', at(F, x, y0 + hw, 0), frameTint);
      }
      if (rng.bool(0.28)) K.acUnit(at(F, x, y0 + 0.03, 0.04));
    }
  }

  // =========================================================================
  // PARLOUR FLOOR — stoop, door hood, windows, storefront
  // =========================================================================
  if (commercial) {
    const sfW = q05(Math.min(W - 2 * endPier - (wide ? doorW + 0.5 : 0), 6.0));
    const sfX = wide ? 0 : q05(-mir * (W / 2 - endPier - sfW / 2));
    K.storefront({
      width: sfW + 0.5, signIndex: rng.int(0, 31),
      awningIndex: rng.bool(0.45) ? rng.int(0, 7) : -1,
      gate: rng.bool(0.22) ? (rng.bool(0.4) ? 2 : 1) : 0,
    }, at(F, sfX, 0.02, 0));
    if (!wide) {
      K.door({ w: doorW - 0.15, h: 2.55, style: 'paneled', transom: true },
        at(F, doorX, 0.06, -0.04), { tint: new THREE.Color(0x3b2a1e) });
      // the hood clears the shop sign band (kit storefront tops out at ~3.75)
      B.addInstance(pDoorHood(B, doorW - 0.1), at(F, doorX, 3.92, 0.0), stoneTint);
      for (const s of [-1, 1]) {
        B.addMerged(stoneMat, box(0.20, 3.9, 0.14), at(F, doorX + s * (doorW / 2 + 0.10), 0.02, 0.05),
          { tint: stoneTint, grime: 0.35 });
      }
    }
  } else {
    const y = floorY(1), y0 = y + sillY;
    for (const x of gXs) {
      putWin(gWinW, g1WinH, at(F, x, y0, 0), rng.bool(0.24));
      K.sill(gWinW, at(F, x, y0, 0), { mat: stoneMat, tint: stoneTint });
      K.lintel(gWinW, at(F, x, y0 + g1WinH + 0.02, 0), { mat: stoneMat, tint: stoneTint });
      if (rng.bool(0.3)) K.acUnit(at(F, x, y0 + 0.03, 0.04));
    }
    // stoop up to the raised parlour floor: 6 risers at ~0.19 m, 0.30 m treads
    const nSteps = Math.max(5, Math.round((base - 0.14) / 0.19));
    const tread = 0.30, stRun = nSteps * tread;
    const stId = pStoop(B, q05(doorW + 0.10), base - 0.14, nSteps, tread);
    B.addInstance(stId, at(F, doorX, 0.14, 0.02), stoneTint);
    const rlId = pStoopRail(B, base - 0.14, stRun);
    for (const s of [-1, 1]) {
      B.addInstance(rlId, at(F, doorX + s * (doorW / 2 + 0.15), 0.14, 0.02),
        new THREE.Color(0.14, 0.135, 0.13));
    }
    // transom: false — the kit's clear-glass transom mirrors the sky and blows
    // out to white in a shaded reveal.  A leaded amber pane is drawn instead.
    // shared 'doorPaint' is semi-gloss (roughness 0.64): at a head-on golden sun
    // its achromatic specular outweighs the diffuse of a dark stain, so hexes
    // that look like walnut on screen rendered as pale khaki.  Halve them.
    // the leaf must nearly fill the punched opening: at doorW-0.14 a 70 mm
    // unglazed slot was left down each jamb and read as a black gap beside the
    // door, straight through the 0.38 m wall reveal
    K.door({ w: q05(doorW - 0.05), h: doorH, style: 'paneled', transom: false },
      at(F, doorX, base + 0.02, -0.05), { tint: new THREE.Color(rng.weighted([
        [0x3b2a1e, 4], [0x5a3a22, 3], [0x23201c, 2], [0x5c1f1c, 1],
      ])).multiplyScalar(0.45) });
    B.addMerged('queensrow:glaze', quad(q05(doorW - 0.26), 0.40),
      at(F, doorX, base + 0.02 + doorH - 0.52, -0.36),
      { tint: new THREE.Color(1.5, 1.3, 0.95), worldUV: false });
    B.addMerged('doorPaint', box(q05(doorW - 0.14), 0.08, 0.07),
      at(F, doorX, base + 0.02 + doorH - 0.56, -0.36),
      { tint: new THREE.Color(0.20, 0.16, 0.12), worldUV: false });
    // VESTIBULE.  Behind the leaf the 0.38 m reveal opened onto nothing, so any
    // sliver round the door read as a pure black hole punched in the wall.  A
    // shallow lobby box gives it a floor, a back and a ceiling to catch light.
    {
      const vw = q05(doorW + 0.14), vd = 0.62, vy = base - 0.02;
      const vt = new THREE.Color(0.26, 0.23, 0.19);
      B.addMerged('paintFlat', box(vw, doorH + 0.34, 0.08), at(F, doorX, vy, -0.44 - vd),
        { tint: vt, worldUV: false });
      for (const s of [-1, 1]) {
        B.addMerged('paintFlat', box(0.08, doorH + 0.34, vd), at(F, doorX + s * (vw / 2 - 0.04), vy, -0.44 - vd / 2),
          { tint: vt.clone().multiplyScalar(0.85), worldUV: false });
      }
      B.addMerged('paintFlat', box(vw, 0.06, vd), at(F, doorX, vy + doorH + 0.28, -0.44 - vd / 2),
        { tint: new THREE.Color(0.44, 0.41, 0.36), worldUV: false });
      B.addMerged(stoneMat, box(vw, 0.05, vd), at(F, doorX, vy, -0.44 - vd / 2),
        { tint: stoneTint.clone().multiplyScalar(0.66), grime: 0.5 });
    }
    // stone jambs + pedimented hood
    for (const s of [-1, 1]) {
      B.addMerged(stoneMat, box(0.22, base + doorH + 0.1, 0.16),
        at(F, doorX + s * (doorW / 2 + 0.11), base - 0.2, 0.06), { tint: stoneTint, grime: 0.3 });
    }
    B.addInstance(pDoorHood(B, doorW + 0.1), at(F, doorX, base + doorH + 0.30, 0.0), stoneTint);
    // BASEMENT LIGHTS.  These openings were punched into the wall but never
    // glazed, so the camera looked clean through the shell and they rendered as
    // two blown-white slots behind the areaway fence — the most obvious break
    // on the whole elevation at noon.  Cellar sash: dark, barred, always grimy.
    for (const o of bLights) {
      const bh = q05(o.y1 - o.y0);
      if (bh < 0.4) continue;
      putWin(o.w, bh, at(F, o.x, o.y0, 0), false,
        new THREE.Color(0.20, 0.21, 0.22).multiplyScalar(rng.range(0.8, 1.25)));
    }
    // areaway grate in front of the basement lights
    if (bLights.length) {
      B.addInstance(pAreaway(B, q05(Math.min(1.6, W * 0.3))),
        at(F, gXs.length ? gXs[0] : -W / 4, 0.21, 0.80));
    }
  }

  // =========================================================================
  // HORIZONTAL BANDING
  // =========================================================================
  const FP = (y, name, mat, tint, len = W + 0.04, frame = F) => {
    B.addMerged(mat, profileAlongX(PROF[name], len), at(frame, 0, y, 0, Math.PI), { tint });
  };
  const quoinW = q05(clamp(endPier - 0.10, 0.30, 0.46));
  const quoinH = q05(rng.range(0.38, 0.46));
  const dressFace = (frame, len, quoinEnds = [-1, 1]) => {
    // ---- alternating red-brick corner quoins --------------------------------
    {
      const qid = pQuoinBlock(B, quoinW, quoinH, trimBrick);
      const y0 = q05(base + 0.06), y1 = wallTop - 0.10;
      for (const s of quoinEnds) {
        const qx = q05(s * (len / 2 - quoinW / 2 - 0.03));
        // every other block: the gaps are where the buff field shows through
        for (let y = y0; y + quoinH <= y1; y += quoinH * 2) {
          B.addInstance(qid, at(frame, qx, q05(y), 0), redTint);
        }
      }
    }
    // grey water table + a second band at the top of the raised basement
    FP(0.02, 'waterTable', stoneMat, stoneTint, len + 0.04, frame);
    if (base > 0.95) FP(base - 0.26, 'lintelBand', stoneMat, stoneTint, len + 0.04, frame);
    if (!commercial) {
      FP(floorY(1) + sillY - 0.13, 'sillBand', stoneMat, stoneTint, len + 0.04, frame);
      FP(floorY(1) + sillY + g1WinH + 0.02, 'lintelBand', stoneMat, stoneTint, len + 0.04, frame);
    } else {
      FP(3.42, 'lintelBand', stoneMat, stoneTint, len + 0.04, frame);
    }
    for (let f = 2; f <= stories; f++) {
      FP(floorY(f) + sillY - 0.13, 'sillBand', stoneMat, stoneTint, len + 0.04, frame);
      // red corbel string just under each sill course
      if (f >= 3) FP(floorY(f) - 0.26, 'corbelStr', trimBrick, redTint, len + 0.04, frame);
      // red-brick lozenge inlays in the spandrel between the arch heads
      if (diamonds && f >= 3) {
        const dy = floorY(f) - 0.62;
        const nD = Math.max(2, Math.round(len / 1.6));
        const did2 = pDiamond(B, trimBrick);
        for (let i = 0; i < nD; i++) {
          B.addInstance(did2, at(frame, -len / 2 + (len / nD) * (i + 0.5), dy, 0.0), redTint);
        }
      }
    }
    // ---- crown: the whole thing rides ABOVE the top-floor ceiling as a
    // parapet — corbel table of small brick arches, then the metal cornice ----
    const capY = wallTop + 0.02;
    const pitch = q05(clamp(len / Math.max(4, Math.round(len / 0.46)), 0.34, 0.56));
    const nC = Math.max(3, Math.round(len / pitch));
    const cid = pCorbelBay(B, pitch, trimBrick);
    for (let i = 0; i < nC; i++) {
      B.addInstance(cid, at(frame, -len / 2 + (len / nC) * i + 0.02, capY, 0.0), redTint);
    }
    B.addMerged(trimBrick, profileAlongX(PROF.corbelCap, len + 0.04),
      at(frame, 0, capY + 0.34, 0, Math.PI), { tint: redTint });
    // pressed-metal cornice
    const corY = capY + 0.70;
    B.addMerged('cornicePaint', profileAlongX(PROF.cornice, len + 0.20),
      at(frame, 0, corY, 0, Math.PI), { tint: cornTint });
    const nB = Math.max(3, Math.round(len / 0.90));
    const conId = pConsole(B);
    for (let i = 0; i <= nB; i++) {
      B.addInstance(conId, at(frame, -len / 2 + (len / nB) * i, corY + 0.22, 0.14), cornTint);
    }
    const swW = q05(clamp(len / nB - 0.42, 0.4, 1.3));
    const sid = pSwagPanel(B, swW);
    for (let i = 0; i < nB; i++) {
      B.addInstance(sid, at(frame, -len / 2 + (len / nB) * (i + 0.5), corY + 0.30, 0.12), cornTint);
    }
    const did = pDentils(B, q05(len));
    B.addInstance(did, at(frame, 0, corY + 0.03, 0.12), cornTint);
  };
  dressFace(F, W);

  // =========================================================================
  // CORNER LOT — wrap everything onto the exposed flank
  // =========================================================================
  let sideRows = { left: null, right: null };
  if (corner) {
    const cf = at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    const nS = clamp(Math.round(D / (winW + 0.85)), 2, 7);
    const sxs = [];
    for (let i = 0; i < nS; i++) sxs.push(q05(-D / 2 + (D / nS) * (i + 0.5)));
    const rws = [];
    rws.push({
      y0: floorY(1) + sillY, y1: floorY(1) + sillY + g1WinH,
      openings: sxs.map((x) => ({ x, w: gWinW })),
    });
    for (let f = 2; f <= stories; f++) {
      const y0 = floorY(f) + sillY;
      rws.push({ y0, y1: y0 + winHFor(f) + headRise(f), openings: sxs.map((x) => ({ x, w: winW })) });
    }
    sideRows = corner < 0 ? { left: rws, right: null } : { left: null, right: rws };
    for (const x of sxs) {
      putWin(gWinW, g1WinH, at(cf, x, floorY(1) + sillY, 0), rng.bool(0.22));
      K.sill(gWinW, at(cf, x, floorY(1) + sillY, 0), { mat: stoneMat, tint: stoneTint });
      K.lintel(gWinW, at(cf, x, floorY(1) + sillY + g1WinH + 0.02, 0), { mat: stoneMat, tint: stoneTint });
    }
    for (let f = 2; f <= stories; f++) {
      const y0 = floorY(f) + sillY;
      const kind = archKind(f);
      const hw = winHFor(f);
      for (const x of sxs) {
        putWin(winW, hw, at(cf, x, y0, 0), rng.bool(0.34));
        K.sill(winW, at(cf, x, y0, 0), { mat: stoneMat, tint: stoneTint });
        if (kind) {
          const aid = pArch(B, winW, kind, trimBrick);
          B.addInstance(aid, at(cf, x, y0 + hw, 0), redTint);
          B.addInstance(aid + ':glass', at(cf, x, y0 + hw, 0), glassFor());
          B.addInstance(aid + ':muntin', at(cf, x, y0 + hw, 0), frameTint);
        }
      }
    }
    // the flank's street-end quoin column is the SAME physical corner the front
    // elevation already stopped, so dress only the far end and avoid two
    // coplanar block stacks fighting for the same pixels
    dressFace(cf, D, [corner > 0 ? 1 : -1]);
  }

  // =========================================================================
  // SHELL / ROOF
  // =========================================================================
  const rearXs = [];
  {
    const n = clamp(Math.round(W / 2.6), 1, 4);
    for (let i = 0; i < n; i++) rearXs.push(q05(-W / 2 + (W / (n + 1)) * (i + 1)));
  }
  const rearRows = [];
  for (let f = 1; f <= stories; f++) {
    const y = floorY(f) + sillY;
    rearRows.push({ y0: y, y1: y + winH, openings: rearXs.map((x) => ({ x, w: 0.95 })) });
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: wallTop, mat: 'queensrow:kreischerPale', tint: brickTint,
    wallT: 0.30, rearRows, rearMat: 'queensrow:kreischerPale', sideRows,
  });
  for (let f = 1; f <= stories; f++) {
    const y = floorY(f) + sillY;
    for (const x of rearXs) putWin(0.95, winH, at(F, -x, y, -D, Math.PI), rng.bool(0.2));
  }

  flatRoof(ctx, F, {
    width: W, depth: D, height: wallTop, parapet: 1.02,
    // near-black decks read as a hole in the roof shots; Ridgewood roofs are
    // mostly aluminium-coated
    mat: 'queensrow:kreischerPale', tint: brickTint, roofMat: rng.weighted([['roofSilver', 4], ['roofBlack', 1]]),
    copingMat: stoneMat, wallT: 0.26, frontOnly: false,
  });

  // ---- roof gear -----------------------------------------------------------
  {
    const rT = wallTop + 0.02;
    const h2 = (v) => Math.round(v * 2) / 2;
    K.bulkhead(at(F, rng.range(-W * 0.2, W * 0.2), rT, -D * rng.range(0.45, 0.7)), {
      w: h2(clamp(W * 0.4, 1.6, 2.8)), d: h2(rng.range(1.8, 2.4)), h: h2(rng.range(2.0, 2.6)),
      mat: 'queensrow:kreischerPale', tint: brickTint,
    });
    K.chimney(at(F, rng.range(-W * 0.42, W * 0.42), rT - 0.25, -D * rng.range(0.55, 0.9)), {
      w: q05(rng.range(0.62, 0.86)), h: h2(rng.range(1.4, 2.4)), mat: trimBrick,
    });
    if (rng.bool(0.75)) {
      B.addInstance(pAerial(B), at(F, rng.range(-W * 0.3, W * 0.3), rT, -D * rng.range(0.2, 0.45), rng.range(0, 1.5)),
        new THREE.Color(0.58, 0.59, 0.60));
    }
    if (rng.bool(0.55)) {
      B.addInstance(pClothesPole(B), at(F, rng.range(-W * 0.35, W * 0.35), rT, -D * rng.range(0.5, 0.85)),
        new THREE.Color(0.7, 0.65, 0.58));
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      K.vent(at(F, rng.range(-W * 0.4, W * 0.4), rT, -D * rng.range(0.2, 0.9)), {
        kind: rng.pick(['pipe', 'pipe', 'goose']),
      });
    }
  }

  // =========================================================================
  // AREAWAY FENCE at the property line
  // =========================================================================
  if (!commercial) {
    const gd = q05(rng.range(0.95, 1.45));
    const gateW = q05(doorW + 0.9);
    const runs = [[-W / 2, doorX - gateW / 2], [doorX + gateW / 2, W / 2]];
    for (const [a, b] of runs) {
      const len = b - a;
      if (len < 0.7) continue;
      // seat the fence 20 mm INTO the sidewalk (its bottom rail was leaving a
      // lit gap and its own shadow floating under it)
      K.fence(len, at(F, (a + b) / 2, 0.12, gd));
      // sunken areaway strip
      B.addMerged(stoneMat, box(len, 0.06, gd - 0.1), at(F, (a + b) / 2, 0.14, (gd - 0.1) / 2),
        { tint: stoneTint.clone().multiplyScalar(0.9), grime: 0.4 });
      // a real fence stops on a post, not in mid-air: bluestone pier at each
      // end, pulled 0.10 m clear of the party wall so it doesn't bury itself
      for (const px2 of [a, b]) {
        const g = box(0.16, 1.06, 0.16, { segY: 1 });
        boxUV(g, 0.16, 1.06, 0.16, 2);
        B.addMerged(stoneMat, g, at(F, clamp(px2, -W / 2 + 0.18, W / 2 - 0.18), 0.12, gd),
          { tint: stoneTint, grime: 0.42 });
      }
    }
    if (rng.bool(0.5)) K.trashCan(at(F, doorX + mir * (gateW / 2 + 0.45), 0.14, gd * 0.55));
  }

  return { height: wallTop + 1.65 };
}
