// Post-war WHITE-GLAZED-BRICK apartment slab — Upper East Side / Yorkville,
// c.1957-1972.  12-21 storeys of glazed ceramic brick (a warm grey-cream, NOT
// paper white), wide aluminium 1/1 or slider windows GROUPED in tight pairs and
// triples with narrow brick piers, a through-wall AC sleeve under nearly every
// sill, RECESSED corner balcony slots whose bare-concrete slabs cantilever past
// the building line, NO cornice at all (the parapet just stops), a stair/lift
// bulkhead and wood tank on the roof, and a canvas canopy running to the curb
// over a recessed glass lobby.
// Refs: refs/boroughs/whitebrick-*.jpg (Manhattan House, Stewart House,
// Sutton Place canopy, E 66 St).
import * as THREE from 'three';
import { at, punchedWall, shellWalls, flatRoof, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, compose, ensureColor, shadeYRange } from '../geo.js';
import { brickTexture, stoneTexture, stuccoTexture } from '../textures.js';

export const TYPE = 'whitebrick';

const q05 = (v) => Math.round(v * 20) / 20;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// MATERIALS — glazed brick reads pale, tight-toned and satin.  Value matters
// more than anything else here: sunlit ~#E8E4D8, shaded return ~#B9B4A6.
// ---------------------------------------------------------------------------
function ensureMats(B) {
  if (B.M.has('whitebrick:glazeWhite')) return;
  const mk = (name, tex, opts) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, bumpMap: tex.bumpMap || null, ...opts,
    });
    m.userData.tileMeters = tex.tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  // NOTE the low saturation: what makes this type read as "white brick" is a
  // near-NEUTRAL chalky value, not a light one.  Any warmth above ~7% sat and
  // the facade turns sand and the building reads as a Miami hotel.
  //
  // EXPOSURE BUDGET (this is the whole ballgame for a white building).  Golden
  // hour front-lights the showcase facade almost head-on: NdotL ~0.97, sunI
  // 4.4, ACES at 0.82 exposure.  Radiance out = albedo * NdotL * I / PI, so a
  // texture at HSL light 63 (linear albedo 0.37) lands at ~0.55 pre-tonemap,
  // which ACES rolls to sRGB ~0.85 and then DESATURATES toward white — the
  // facade becomes one featureless mass and every mortar joint disappears.
  // HSL light 52-54 (linear ~0.24) lands at ~0.35 pre-tonemap -> sRGB ~0.78:
  // still unmistakably "white brick" against red neighbours, but with 40+ code
  // values of headroom for the joints, per-brick mottle and soil streaks.
  // The mortar must also be DARKER than the brick (it was 5 codes lighter,
  // which is why the coursing read as a flat sheet at any distance).
  // HUE: the golden-hour sun is 0xffc78f — linear 1.00 / 0.56 / 0.27 — so it
  // adds roughly 40 code values of R-over-B to whatever it lands on.  A brick
  // pigmented yellow (hue 44) therefore rendered as sand: measured R-B = 39
  // against Manhattan House's R-B = 0..8.  Pigmenting the brick COOL cancels
  // most of the sun's cast, so the wall reads as white brick at golden hour
  // without having to raise its value back into the blowout.
  // GLOSS: glazed ceramic brick is semi-gloss, and that sheen is the type's
  // second identifier after its value.  bumpScale drops with it — a glazed face
  // is smooth; only the mortar joint is recessed.
  // sat 8 (not 4): at 4% the cool pigment is only +/-1% off neutral and barely
  // dents the sun's warm cast (measured R-B stayed at 29).  8% is as far as this
  // can go before the wall reads blue at noon — a genuinely neutral golden-hour
  // white brick would need a distinctly blue-grey pigment, which is the wrong
  // trade.  Value lifted to 55 to sit back at a "white brick" read after the
  // per-seed tint family took ~10% out of it.
  mk('whitebrick:glazeWhite', brickTexture({
    hue: 212, sat: 8, light: 55, dh: 4, ds: 3, dl: 7,
    mortar: '#7b7d80', mortarLight: 0.0,
    darkBrickChance: 0.02, darkBrickColor: 'hsl(210,7%,43%)', seed: 141,
  }), { bumpScale: 0.55, roughness: 0.52, metalness: 0.0, envMapIntensity: 0.34 });
  mk('whitebrick:glazeCream', brickTexture({
    hue: 40, sat: 8, light: 51, dh: 3, ds: 4.5, dl: 8,
    mortar: '#7a746a', mortarLight: 0.0,
    darkBrickChance: 0.022, darkBrickColor: 'hsl(38,8%,39%)', seed: 142,
  }), { bumpScale: 0.7, roughness: 0.58, metalness: 0.0, envMapIntensity: 0.30 });
  mk('whitebrick:glazeGrey', brickTexture({
    hue: 200, sat: 6, light: 56, dh: 3, ds: 2.5, dl: 7,
    mortar: '#787a7c', mortarLight: 0.0,
    darkBrickChance: 0.024, darkBrickColor: 'hsl(200,5%,43%)', seed: 143,
  }), { bumpScale: 0.5, roughness: 0.48, metalness: 0.0, envMapIntensity: 0.36 });
  // common brick — party walls, rear, court.  Only the street elevation got
  // the expensive ceramic glaze; the flanks are dark grey-brown commons.
  mk('whitebrick:common', brickTexture({
    hue: 26, sat: 7, light: 32, dh: 5, ds: 7, dl: 8,
    mortar: '#6a6660', darkBrickChance: 0.06, seed: 146,
  }), { bumpScale: 1.2, roughness: 0.94, envMapIntensity: 0.4 });
  // precast concrete: coping, sills, spandrel panels, lobby surround.  Sits a
  // touch DARKER than the brick so the coping and sill courses read as a
  // separate material instead of merging into the wall at golden hour.
  // weather 0.15 painted 1.2-1.8 m soft ellipses across the base and read as
  // watercolour stains / decals rather than soiling.  Keep the joint contrast,
  // drop the blotching to near nothing; directional streaks do that job below.
  mk('whitebrick:precast', stoneTexture({
    base: '#8b877f', blockW: 1.25, blockH: 0.52, jointDark: 0.22, weather: 0.04, seed: 144,
  }), { roughness: 0.76, envMapIntensity: 0.28 });
  // bare structural concrete — balcony slabs, canopy soffit
  mk('whitebrick:conc', stuccoTexture({ base: '#7f7c76', blotch: 0.06, seed: 145 }),
    { roughness: 0.88, envMapIntensity: 0.26 });
  // AWNING CANVAS — must be its own material, not shared 'paintFlat'.
  // paintFlat is semi-gloss (roughness 0.55, metalness 0.08, envI 0.7): at a
  // head-on golden sun its achromatic specular lobe contributes ~0.15 radiance,
  // roughly 1.8x the diffuse of a dark canvas, so a hunter-green or burgundy
  // awning rendered as dusty rose no matter how far the tint was pushed down.
  // Real acrylic canvas is matte — kill the gloss and the hue comes back.
  const cv = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.95, metalness: 0.0,
    envMapIntensity: 0.22,
  });
  cv.userData.tileMeters = 1;
  cv.name = 'whitebrick:canvas';
  B.M.set('whitebrick:canvas', cv);
  // GLAZING — the single most important value on the facade.  Real glass is
  // the darkest thing on a white-brick building; the kit's shared 'glass'
  // renders too light for this type, so the pane is drawn privately.
  // base colour is already dark so the pane can never wash out; the per-sash
  // instance tint is a MULTIPLIER around 1.0, not an absolute colour.
  // THE SPECULAR IS THE PROBLEM, NOT THE ALBEDO.  Showcase golden hour puts the
  // sun almost head-on, so for a band of the elevation the half-vector lines up
  // with the pane normal and D_GGX peaks at 1/(PI*alpha^2).  At roughness 0.42
  // that is F*V*D = 0.04*0.25*10.3 = 0.10, times an irradiance of 4.27 = 0.44
  // of specular radiance — MORE than the sunlit brick's 0.35 diffuse.  Every
  // window in that band therefore rendered brighter than the wall.
  // Roughness alone can't fix it without turning glass into plaster, so use
  // MeshPhysicalMaterial and pull F0 down with specularIntensity: 0.04 -> 0.016.
  // Combined with roughness 0.46 that is F*V*D*E = 0.09, a quarter of before,
  // while the sheen survives.  Albedo is raised to compensate so the pane lands
  // near half the sunlit brick value instead of going black.
  const gl = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0x434c57, roughness: 0.46, metalness: 0.0,
    specularIntensity: 0.40, envMapIntensity: 0.30,
  });
  gl.userData.tileMeters = 1;
  gl.name = 'whitebrick:glaze';
  B.M.set('whitebrick:glaze', gl);
}

// ---------------------------------------------------------------------------
// PARTS (ids prefixed 'whitebrick:')
// ---------------------------------------------------------------------------

// opaque dark glazing pane that sits just in front of the kit's window glass
function pPane(B, w, h, recess, frameW) {
  w = q05(w); h = q05(h);
  const id = `whitebrick:pane:${w}x${h}:${recess}`;
  if (B.hasPart(id)) return id;
  const g = quad(w - frameW - 0.02, h - frameW - 0.02);
  g.translate(0, frameW / 2 + 0.01, -recess + 0.026);
  B.definePart(id, g, 'whitebrick:glaze', { castShadow: false });
  return id;
}

// cantilevered balcony slab — 0.26 m bare-concrete edge, dark soffit
function pBalcSlab(B, w, d) {
  w = q05(w); d = q05(d);
  const id = `whitebrick:balcslab:${w}x${d}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(w, 0.19, d, { segY: 1 }); boxUV(g, w, 0.19, d, 2);
  items.push({ geom: g, x: 0, y: 0, z: d / 2 });
  // FRONT FASCIA — this is the element that makes a stack of balconies read.
  // In refs/boroughs/whitebrick-e66-streetscape-01.jpg the sunlit slab edges are
  // a bold light horizontal stripe pattern (photo luma ~159) against the dark
  // recess behind; at 0.26 m and untinted the stack read as two black bars glued
  // to the facade instead.  Deepen the edge and lift it clear of the void.
  const f = box(w + 0.10, 0.34, 0.11, { segY: 1 }); boxUV(f, w + 0.10, 0.34, 0.11, 2);
  ensureColor(f, new THREE.Color(1.24, 1.23, 1.21));
  items.push({ geom: f, x: 0, y: -0.15, z: d - 0.055 });
  for (const s of [-1, 1]) {
    const sg = box(0.11, 0.30, d, { segY: 1 }); boxUV(sg, 0.11, 0.30, d, 2);
    ensureColor(sg, new THREE.Color(1.16, 1.15, 1.13));
    items.push({ geom: sg, x: s * (w / 2 + 0.01), y: -0.11, z: d / 2 });
  }
  // soffit plate: shaded, but white brick bounces a lot of light back up into
  // it, so a mid warm grey rather than near-black.  It must still sit clearly
  // BELOW the slab edge in value or the stack of balconies loses the dark
  // horizontal line that makes it read as cantilevered concrete at 30 m.
  const so = box(w + 0.06, 0.03, d - 0.04, { segY: 1 });
  ensureColor(so, new THREE.Color(0.50, 0.49, 0.47));
  items.push({ geom: so, x: 0, y: -0.10, z: d / 2 });
  B.definePart(id, compose(items), 'whitebrick:conc');
  return id;
}

// picket railing around the front + both returns of a balcony
function pBalcRail(B, w, d) {
  w = q05(w); d = q05(d);
  const id = `whitebrick:balcrail:${w}x${d}`;
  if (B.hasPart(id)) return id;
  const items = [];
  // picket gauge matters at 30 m: 17 mm bars on a 115 mm pitch alias into a
  // flat grey wash (worse still against a sunlit white slab).  22 mm bars on a
  // 132 mm pitch survive the downsample and still read as a picket rail.
  const h = 1.07, pt = 0.022, zf = d - 0.05, zb = 0.06;
  items.push({ geom: box(w, 0.055, 0.06, { segY: 1 }), x: 0, y: h - 0.055, z: zf });
  items.push({ geom: box(w, 0.035, 0.04, { segY: 1 }), x: 0, y: 0.10, z: zf });
  for (const s of [-1, 1]) {
    const sx = s * (w / 2 - 0.03);
    items.push({ geom: box(0.05, 0.05, zf - zb, { segY: 1 }), x: sx, y: h - 0.05, z: (zf + zb) / 2 });
    items.push({ geom: box(0.03, 0.03, zf - zb, { segY: 1 }), x: sx, y: 0.10, z: (zf + zb) / 2 });
    items.push({ geom: box(0.05, h, 0.05, { segY: 1 }), x: sx, y: 0, z: zf });
  }
  const n = Math.max(4, Math.round(w / 0.132));
  for (let i = 1; i < n; i++) {
    items.push({ geom: box(pt, h - 0.05, pt, { segY: 1 }), x: -w / 2 + (w / n) * i, y: 0.03, z: zf });
  }
  const m = Math.max(3, Math.round((zf - zb) / 0.132));
  for (const s of [-1, 1]) {
    for (let i = 1; i < m; i++) {
      items.push({
        geom: box(pt, h - 0.05, pt, { segY: 1 }),
        x: s * (w / 2 - 0.03), y: 0.03, z: zb + ((zf - zb) / m) * i,
      });
    }
  }
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

// through-wall air-conditioner sleeve: a DARK recessed louvre band under the
// sill.  The loudest "1960s, occupied" signal on the whole building.
function pAcSleeve(B) {
  const id = 'whitebrick:acsleeve';
  if (B.hasPart(id)) return id;
  const items = [];
  // NB the whole assembly must sit PROUD of z=0: the facade slab runs from
  // z=0 back to z=-0.40, so anything at negative z is buried and invisible.
  // The frame used to be a LIGHT surround (0.34) around a dark face that was
  // offset up by 0.04, so only its bottom and sides showed and every sleeve
  // rendered as a pale "U" glyph printed on the wall.  Centre the face, and take
  // the surround down to near the louvre value so the whole thing reads as one
  // dark recessed opening rather than an outlined decal.
  const frame = box(0.80, 0.52, 0.07, { segY: 1 });
  ensureColor(frame, new THREE.Color(0.185, 0.183, 0.178));
  items.push({ geom: frame, x: 0, y: 0, z: 0.005 });
  const face = box(0.70, 0.42, 0.035, { segY: 1 });
  ensureColor(face, new THREE.Color(0.055, 0.055, 0.054));
  items.push({ geom: face, x: 0, y: 0.05, z: 0.045 });
  for (let i = 0; i < 5; i++) {
    const l = box(0.66, 0.026, 0.028, { segY: 1 });
    ensureColor(l, new THREE.Color(0.22, 0.216, 0.212));
    items.push({ geom: l, x: 0, y: 0.08 + i * 0.072, z: 0.055 });
  }
  B.definePart(id, compose(items), 'paintFlat');
  // the minority that get a real protruding unit hanging out of the sleeve
  const pr = [];
  const body = box(0.66, 0.42, 0.30, { segY: 1 });
  ensureColor(body, new THREE.Color(0.62, 0.61, 0.58));
  pr.push({ geom: body, x: 0, y: 0.01, z: 0.20 });
  const gr = box(0.60, 0.32, 0.02, { segY: 1 });
  ensureColor(gr, new THREE.Color(0.26, 0.26, 0.25));
  pr.push({ geom: gr, x: 0, y: 0.06, z: 0.36 });
  B.definePart(id + ':unit', compose(pr), 'paintFlat');
  return id;
}

// proud precast spandrel panel under a window group
function pSpandrel(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `whitebrick:spandrel:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const g = box(w, h, 0.05, { segY: 1 });
  boxUV(g, w, h, 0.05, 2);
  g.translate(0, 0, 0.025);
  B.definePart(id, g, 'whitebrick:precast');
  return id;
}

// canvas canopy to the curb: hipped deck, scalloped valance, two pipe posts
function pCanopy(B, w, d) {
  w = q05(w); d = q05(d);
  const id = `whitebrick:canopy:${w}x${d}`;
  if (B.hasPart(id)) return id;
  const items = [];
  // shallow hip: three stepped slabs so the top is not a flat plate
  items.push({ geom: box(w, 0.10, d, { segY: 1 }), x: 0, y: 0, z: d / 2 });
  items.push({ geom: box(w - 0.42, 0.09, d - 0.34, { segY: 1 }), x: 0, y: 0.10, z: d / 2 });
  items.push({ geom: box(w - 0.95, 0.08, d - 0.80, { segY: 1 }), x: 0, y: 0.19, z: d / 2 });
  // valance — deep enough to throw its own shadow line on the glass behind
  const fr = box(w + 0.09, 0.44, 0.06, { segY: 1 });
  items.push({ geom: fr, x: 0, y: -0.34, z: d - 0.03 });
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.06, 0.44, d, { segY: 1 }), x: s * (w / 2 + 0.015), y: -0.34, z: d / 2 });
  }
  // scalloped foot: a straight-cut valance is the giveaway on a CG awning —
  // every real house canopy on the UES is cut in shallow lobes.  The discs are
  // tinted brighter than the canvas so they also do the job of the contrasting
  // piping that used to run along the (straight) foot.
  const nSc = Math.max(4, Math.round(w / 0.42));
  for (let i = 0; i < nSc; i++) {
    const sx = -w / 2 + (w / nSc) * (i + 0.5);
    const sc = cylinder(0.088, 0.088, 0.07, 10);
    ensureColor(sc, new THREE.Color(1.35, 1.35, 1.30));
    items.push({ geom: sc, x: sx, y: -0.34, z: d - 0.005, rx: Math.PI / 2 });
  }
  B.definePart(id, compose(items), 'whitebrick:canvas');
  const st = [];
  for (const s of [-1, 1]) {
    // outer pair at the curb line, inner pair mid-run
    for (const zp of [d - 0.12, d * 0.45]) {
      st.push({ geom: cylinder(0.038, 0.044, 3.0, 8), x: s * (w / 2 - 0.12), y: -3.0, z: zp });
      st.push({ geom: cylinder(0.09, 0.12, 0.06, 10), x: s * (w / 2 - 0.12), y: -3.0, z: zp });
    }
    const len = Math.hypot(0.9, d - 0.4);
    st.push({
      geom: cylinder(0.022, 0.022, len, 6), x: s * (w / 2 - 0.06), y: -0.9, z: 0.06,
      rx: Math.atan2(d - 0.4, 0.9),
    });
  }
  B.definePart(id + ':posts', compose(st), 'steelDark');
  const lite = box(w * 0.5, 0.05, 0.30, { segY: 1 });
  B.definePart(id + ':soffit', lite, 'litWindow', { castShadow: false, receiveShadow: false });
  return id;
}

// concrete planter box + clipped boxwood with an irregular top
function pPlanter(B, w) {
  w = q05(w);
  const id = `whitebrick:planter:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(w, 0.58, 0.76, { segY: 1 }); boxUV(g, w, 0.58, 0.76, 2);
  items.push({ geom: g, x: 0, y: 0, z: 0 });
  const cap = box(w + 0.08, 0.07, 0.84, { segY: 1 }); boxUV(cap, w + 0.08, 0.07, 0.84, 2);
  items.push({ geom: cap, x: 0, y: 0.58, z: 0 });
  B.definePart(id, compose(items), 'whitebrick:conc');
  const hg = [];
  hg.push({ geom: box(w - 0.16, 0.38, 0.56, { segY: 1 }), x: 0, y: 0.60, z: 0 });
  const nb = Math.max(3, Math.round(w / 0.34));
  for (let i = 0; i < nb; i++) {
    const r = 0.17 + ((i * 37) % 11) * 0.011;
    // detail 2, non-uniform: level-0 icosahedra read as unmistakable green dice
    const g2 = new THREE.IcosahedronGeometry(r, 2);
    g2.scale(1.0, 0.74, 0.88);
    hg.push({
      geom: g2,
      x: -w / 2 + (w / nb) * (i + 0.5), y: 0.92 + ((i * 53) % 7) * 0.016,
      z: ((i * 29) % 5) * 0.05 - 0.10,
    });
  }
  B.definePart(id + ':hedge', compose(hg), 'stucco');
  return id;
}

function pCoolTower(B) {
  const id = 'whitebrick:cooltower';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(2.6, 1.9, 2.0, { segY: 1 }), x: 0, y: 0.18, z: 0 });
  for (let i = 0; i < 5; i++) {
    const l = box(2.66, 0.09, 2.06, { segY: 1 });
    ensureColor(l, new THREE.Color(0.52, 0.53, 0.54));
    items.push({ geom: l, x: 0, y: 0.5 + i * 0.28, z: 0 });
  }
  items.push({ geom: cylinder(0.85, 0.9, 0.5, 14), x: 0, y: 2.08, z: 0 });
  const fan = cylinder(0.72, 0.72, 0.06, 14);
  ensureColor(fan, new THREE.Color(0.2, 0.2, 0.21));
  items.push({ geom: fan, x: 0, y: 2.5, z: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    items.push({ geom: box(0.14, 0.20, 0.14, { segY: 1 }), x: sx * 1.15, y: 0, z: sz * 0.85 });
  }
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

function pRoofRail(B, len) {
  len = Math.max(1.5, Math.round(len * 2) / 2);
  const id = `whitebrick:roofrail:${len}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(len, 0.05, 0.05, { segY: 1 }), x: 0, y: 1.04, z: 0 });
  items.push({ geom: box(len, 0.04, 0.04, { segY: 1 }), x: 0, y: 0.54, z: 0 });
  const n = Math.max(2, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) {
    items.push({ geom: cylinder(0.026, 0.026, 1.09, 6), x: -len / 2 + (len / n) * i, y: 0, z: 0 });
  }
  B.definePart(id, compose(items), 'steelDark');
  return id;
}

function pDish(B) {
  const id = 'whitebrick:dish';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: cylinder(0.05, 0.05, 0.75, 6), x: 0, y: 0, z: 0 });
  items.push({ geom: box(0.28, 0.06, 0.28, { segY: 1 }), x: 0, y: 0.73, z: 0 });
  items.push({ geom: cylinder(0.34, 0.31, 0.07, 12), x: 0, y: 0.82, z: 0.15, rx: 1.02 });
  items.push({ geom: cylinder(0.02, 0.02, 0.32, 6), x: 0, y: 0.88, z: 0.34, rx: 1.38 });
  B.definePart(id, compose(items), 'aluminum');
  return id;
}

function pEntryTrim(B) {
  const id = 'whitebrick:entrytrim';
  if (B.hasPart(id)) return id;
  const items = [];
  const p = box(0.42, 0.24, 0.035, { segY: 1 });
  ensureColor(p, new THREE.Color(0.40, 0.32, 0.16));
  items.push({ geom: p, x: 0, y: 1.55, z: 0.018 });
  const i1 = box(0.22, 0.32, 0.06, { segY: 1 });
  ensureColor(i1, new THREE.Color(0.5, 0.5, 0.52));
  items.push({ geom: i1, x: 0, y: 1.05, z: 0.03 });
  B.definePart(id, compose(items), 'paintFlat');
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
  const D = Math.max(14, lot.depth);
  // wider spread so a block of these doesn't come out as a row of equal slabs
  // (note the showcase camera auto-frames to fill, which HIDES height variation
  // between seeds — compare the tri counts, not the framing)
  const stories = clamp(lot.stories
    || rng.weighted([[10, 2], [12, 4], [14, 4], [16, 3], [18, 2], [20, 2], [22, 1]]), 6, 24);
  const corner = lot.corner | 0;
  const commercial = !!lot.commercial;
  const mir = lot.mirror ? -1 : 1;

  // ---- vertical schedule (post-war: 8'6"-9'0" floor to floor) ---------------
  const floorH = q05(rng.range(2.62, 2.86));
  // retail bases are a full storey taller than a residential lobby base
  const groundH = q05(commercial ? rng.range(4.35, 5.00) : rng.range(3.70, 4.35));
  const floorY = (i) => (i <= 0 ? 0 : groundH + (i - 1) * floorH);
  const sillY = q05(rng.range(0.74, 0.88));
  const winH = q05(rng.range(1.30, 1.48));
  const wallTop = floorY(stories);

  const setback = stories >= 13 && rng.bool(0.45);
  const sbZ = setback ? q05(rng.range(2.2, 3.2)) : 0;
  const sbX = setback ? q05(rng.range(1.0, 2.0)) : 0;
  const mainStories = setback ? stories - 1 : stories;
  const topMain = floorY(mainStories);

  // ---- palette -------------------------------------------------------------
  const brickMat = rng.weighted([
    ['whitebrick:glazeWhite', 8], ['whitebrick:glazeCream', 5], ['whitebrick:glazeGrey', 4],
  ]);
  // facadeTint() alone only jitters +/-6%, which is invisible: every seed came
  // out the same tan.  Draw a DISCRETE cast first — the four values a Yorkville
  // block actually contains — then jitter around it.  Kept under unity because
  // on a pale facade anything at 1.0+ pushes into the ACES desaturation knee.
  const brickTint = facadeTint(rng, new THREE.Color(rng.weighted([
    [0xfcfcf8, 4],   // blue-white glaze
    [0xf6f4ed, 4],   // neutral
    [0xefe9db, 3],   // cream
    [0xe6e0d2, 2],   // oyster
  ])).multiplyScalar(0.99));
  const baseStyle = rng.weighted([['stone', 7], ['darkbrick', 3]]);
  const baseTwo = baseStyle !== 'same' && stories >= 12 && rng.bool(0.45);
  // the base course grounds the building: on the real thing it is a DARKER grey
  // granite or a dark-veined limestone, never a paler stone than the brick.
  const baseMat = baseStyle === 'stone'
    ? rng.weighted([['graniteBase', 6], ['whitebrick:precast', 3], ['limestone', 2]])
    : baseStyle === 'darkbrick' ? rng.pick(['brickBrown', 'whitebrick:common']) : brickMat;
  const baseTint = baseStyle === 'same' ? brickTint : facadeTint(rng, new THREE.Color(0.74, 0.73, 0.71));
  const frameTint = new THREE.Color(rng.weighted([
    [0xb4b2ac, 5], [0x84878b, 4], [0x46423e, 4], [0x2c2f31, 3],
  ]));
  // rails: mill-finish aluminium, which reads as a MID grey picket stack against
  // the sunlit slab (see refs/boroughs/whitebrick-e66-streetscape-01.jpg).  The
  // previous family bottomed out near-black, which made every balcony look like
  // a Jackson Heights fire escape instead of a Yorkville terrace.
  const railTint = new THREE.Color(rng.weighted([
    [0xa8aaa6, 5], [0x8e918c, 4], [0x63655f, 2],
  ]));
  const winStyle = rng.weighted([['dh1', 6], ['slider', 5]]);
  const spandrelPanels = rng.bool(0.28);
  const balcMode = rng.weighted([['corner', 6], ['column', 3], ['none', 3]]);
  const balcD = q05(rng.range(1.70, 2.05));
  // shallow slot only: a deep recess turns the stack into unlit black voids,
  // where the real thing is sunlit white concrete cantilevered clear of the wall
  const recD = q05(rng.range(0.35, 0.55));
  // deeper reveal: at 0.15 m a 13-degree sun casts only a 35 mm head shadow on
  // the glass and the openings read as coplanar with the brick
  const RECESS = 0.20, FRAMEW = 0.06;

  // ONE glazing tone per building with small per-sash jitter; a random tint per
  // window reads as a CG checkerboard, real glass down a facade is coherent.
  const gBase = rng.range(0.58, 0.82);          // per-building glazing value
  const glassFor = () => {
    const r = rng.next();
    // a "sky flash" pane must still land below the wall value or it reads as a
    // hole punched in the facade; a drawn blind is a warm mid grey, never white
    if (r < 0.05) return new THREE.Color(1.55, 1.75, 2.05).multiplyScalar(gBase); // sky flash
    if (r < 0.19) return new THREE.Color(0.98, 0.95, 0.88).multiplyScalar(gBase); // blind / shade
    const j = rng.range(0.50, 0.82) * gBase;
    return new THREE.Color(j, j * rng.range(0.98, 1.05), j * rng.range(1.0, 1.1));
  };
  // ground-floor openings are the biggest panes on the building and sit at eye
  // level: a pale "blind" tint there reads as a frosted panel, so they get
  // their own consistently dark range with a deep reveal shadow behind.
  const glassGround = () => {
    const j = rng.range(0.34, 0.56) * gBase;
    return new THREE.Color(j, j * rng.range(0.99, 1.06), j * rng.range(1.02, 1.12));
  };
  const putWin = (w, h, m, lit, gTint = null) => {
    const p = winStyle === 'slider'
      ? { w, h, style: 'steel', panesX: 2, panesY: 1, recess: RECESS, frameW: FRAMEW }
      : { w, h, style: 'dh1', recess: RECESS, frameW: FRAMEW };
    const ids = K.windowPart(p);
    B.addInstance(ids.id, m, frameTint);
    B.addInstance(pPane(B, w, h, RECESS, FRAMEW), m, gTint || glassFor());
    if (lit) B.addInstance(ids.litId, m, new THREE.Color(1.0, 0.86, 0.62));
  };

  // ---- bay layout: apartments grouped as singles / tight pairs / triples ----
  const pattern = rng.weighted([['pair', 6], ['single', 4], ['triple', 5]]);
  const mull = q05(rng.range(0.34, 0.46));
  const gapPier = rng.range(1.00, 1.45);
  const nWin = pattern === 'triple' ? 3 : pattern === 'pair' ? 2 : 1;
  const endPier = q05(clamp(rng.range(0.75, 1.15), 0.6, W * 0.055));
  const usable = W - 2 * endPier;
  const pitch = pattern === 'triple' ? rng.range(6.6, 7.8)
    : pattern === 'pair' ? rng.range(4.5, 5.5) : rng.range(2.9, 3.4);
  let nBays = clamp(Math.round(usable / pitch), 2, 9);
  let unit = usable / nBays;
  let winW = q05(clamp((unit - gapPier - (nWin - 1) * mull) / nWin, 0.95, 2.25));
  if (winW < 1.0 && nWin > 1) {
    nBays = clamp(Math.round(usable / 3.1), 2, 9);
    unit = usable / nBays;
    winW = q05(clamp(unit - 1.15, 0.95, 2.25));
  }
  const groupN = winW < 1.0 ? 1 : nWin;
  const span = groupN * winW + (groupN - 1) * mull;
  const offs = [];
  for (let i = 0; i < groupN; i++) offs.push(q05(-span / 2 + (winW + mull) * i + winW / 2));

  const bays = [];
  for (let i = 0; i < nBays; i++) bays.push({ i, x: q05(-usable / 2 + unit * (i + 0.5)), w: unit });

  // ---- balcony slots: independent of the window grid, hard at the corners --
  const balcCols = [];
  if (balcMode === 'corner') {
    const bw = q05(clamp(unit + 0.30, 2.4, 4.6));
    for (const s of [-1, 1]) balcCols.push({ x: q05(s * (W / 2 - bw / 2 - 0.28)), w: bw });
  } else if (balcMode === 'column') {
    const bw = q05(clamp(unit - 0.20, 2.2, 4.4));
    const i0 = clamp(mir > 0 ? 1 : nBays - 2, 0, nBays - 1);
    balcCols.push({ x: bays[i0].x, w: bw });
    if (nBays >= 6 && rng.bool(0.6)) balcCols.push({ x: bays[nBays - 1 - i0].x, w: bw });
  }
  const inBalc = (x, w) => balcCols.some((b) => Math.abs(x - b.x) < (b.w + w) / 2 - 0.02);
  const doorW = q05(clamp((balcCols[0] ? balcCols[0].w : 2.6) - 1.15, 1.5, 2.4));
  const doorH = q05(sillY + winH - 0.05);

  // ---- entrance / ground floor ---------------------------------------------
  const lobW = q05(clamp(rng.range(4.6, 6.8), 3.6, W * 0.34));
  const lobX = q05(nBays % 2 === 1
    ? bays[(nBays - 1) / 2].x
    : (bays[nBays / 2 - 1].x + bays[nBays / 2].x) / 2);
  const lobH = q05(clamp(groundH - rng.range(0.62, 0.95), 2.8, 3.5));
  const drOffice = !commercial && rng.bool(0.5);
  const clearOfLobby = (x, w) => Math.abs(x - lobX) >= (lobW + w) / 2 - 0.35;
  const drBay = bays.find((b) => clearOfLobby(b.x, span) && !inBalc(b.x, span)
    && (mir > 0 ? b.i === 0 : b.i === nBays - 1));
  const drX = drBay ? drBay.x : null;

  // =========================================================================
  // FRONT WALL
  // =========================================================================
  const groundOps = [{ x: lobX, w: lobW, y0: 0.04, y1: lobH }];
  const sfBays = [];
  const gWinH = q05(winH + 0.34), gSillY = q05(rng.range(0.95, 1.20));
  if (commercial) {
    for (const b of bays) {
      if (!clearOfLobby(b.x, b.w * 0.9)) continue;
      const sw = q05(Math.min(b.w - 0.55, 6.2));
      if (sw < 2.2) continue;
      sfBays.push({ x: b.x, w: sw });
      // the kit storefront assembly tops out near 3.75 m; a 3.15 m opening left
      // its sign band buried in the wall and made the retail base read squat.
      // NYC ground-floor retail is 4.2-5.0 m floor-to-floor, so open it up.
      groundOps.push({ x: b.x, w: sw, y0: 0.05, y1: q05(clamp(groundH - 0.45, 3.6, 4.4)) });
    }
  } else {
    for (const b of bays) {
      if (!clearOfLobby(b.x, span)) continue;
      if (drOffice && drX !== null && b.x === drX) {
        groundOps.push({ x: b.x, w: 1.15, y0: 0.03, y1: 2.45 });
        continue;
      }
      for (const o of offs) {
        const gx = q05(b.x + o);
        if (Math.abs(gx) + winW / 2 > W / 2 - 0.35) continue;
        groundOps.push({ x: gx, w: winW, y0: gSillY, y1: gSillY + gWinH });
      }
    }
  }
  groundOps.sort((a, b) => a.x - b.x);

  const baseTop = baseStyle === 'same' ? 0
    : q05(baseTwo ? floorY(2) + 0.10 : groundH + rng.range(0.05, 0.30));
  const gHeadY = Math.max(lobH + 0.05, gSillY + gWinH + 0.05, 3.3);
  if (baseTop > 0) {
    const rows = [{ y0: 0.03, y1: gHeadY, openings: groundOps }];
    if (baseTwo) {
      const y = floorY(1);
      const ops = [];
      for (const b of bays) {
        if (balcCols.length && inBalc(b.x, span)) continue;
        for (const o of offs) ops.push({ x: q05(b.x + o), w: winW });
      }
      ops.sort((a, b) => a.x - b.x);
      rows.push({ y0: y + sillY, y1: y + sillY + winH, openings: ops });
      // BUG FIX: these first-floor openings are punched into the two-storey
      // stone base, but the window loop below starts at firstShaft (= 2 when
      // baseTwo), so they were never glazed.  The camera looked clean through
      // the shell and saw the dark common-brick REAR wall 17 m away, which read
      // as "brick texture inside the window opening".
      for (const o of ops) {
        putWin(o.w, winH, at(F, o.x, y + sillY, 0), rng.bool(0.36));
        K.sill(o.w, at(F, o.x, y + sillY, 0), { mat: 'whitebrick:precast' });
        // pAcSleeve is idempotent; the shared `acId` const is declared further
        // down the function and would be in its temporal dead zone here
        if (rng.bool(0.6)) B.addInstance(pAcSleeve(B), at(F, o.x, y + sillY - 0.60, 0));
      }
    }
    punchedWall(ctx, F, {
      width: W, height: baseTop, depth: 0.40, mat: baseMat, tint: baseTint,
      rows, grime: 0.30, aoTop: baseTop,
    });
  }

  // shaft
  const shaftRows = [];
  if (baseTop === 0) shaftRows.push({ y0: 0.03, y1: gHeadY, openings: groundOps });
  const firstShaft = baseTwo ? 2 : 1;
  for (let f = firstShaft; f < mainStories; f++) {
    const y = floorY(f);
    const ops = [];
    for (const b of bays) {
      if (balcCols.length && inBalc(b.x, span)) continue;
      for (const o of offs) ops.push({ x: q05(b.x + o), w: winW });
    }
    // the balcony slot is a full-height void in the front plane
    for (const bc of balcCols) {
      ops.push({ x: bc.x, w: bc.w - 0.30, y0: y + 0.02, y1: y + sillY + winH });
    }
    ops.sort((a, b) => a.x - b.x);
    const low = ops.filter((o) => o.y0 !== undefined && o.y0 < y + sillY - 0.01);
    if (low.length) shaftRows.push({ y0: y + 0.02, y1: y + sillY, openings: low.map((o) => ({ x: o.x, w: o.w })) });
    shaftRows.push({
      y0: y + sillY, y1: y + sillY + winH,
      openings: ops.map((o) => ({ x: o.x, w: o.w })),
    });
  }
  const shaftBase = baseTop;
  punchedWall(ctx, at(F, 0, shaftBase, 0), {
    width: W, height: topMain - shaftBase, depth: 0.40, mat: brickMat, tint: brickTint,
    rows: shaftRows.map((r) => ({ y0: r.y0 - shaftBase, y1: r.y1 - shaftBase, openings: r.openings })),
    grime: baseTop > 0 ? 0.17 : 0.26, aoTop: topMain,
  });

  // =========================================================================
  // BALCONY SLOTS — recessed rear wall, side returns, slabs, rails
  // =========================================================================
  for (const bc of balcCols) {
    const RF = at(F, bc.x, 0, -recD);
    const rows = [];
    for (let f = firstShaft; f < mainStories; f++) {
      const y = floorY(f);
      rows.push({ y0: y + 0.03, y1: y + doorH + 0.03, openings: [{ x: 0, w: doorW }] });
    }
    punchedWall(ctx, RF, {
      width: bc.w, height: topMain, depth: 0.30, mat: brickMat, tint: brickTint,
      rows, grime: 0.1, aoTop: topMain,
    });
    // side returns of the slot
    for (const s of [-1, 1]) {
      const g = box(0.22, topMain, recD, { segY: 4 });
      boxUV(g, 0.22, topMain, recD, 2);
      B.addMerged(brickMat, g, at(F, bc.x + s * (bc.w / 2 - 0.11), 0, -recD / 2),
        { tint: brickTint.clone().multiplyScalar(0.93) });
    }
    // the slot is solid masonry below the first residential floor
    const fillH = floorY(firstShaft);
    const g = box(bc.w, fillH, recD, { segY: 3 });
    boxUV(g, bc.w, fillH, recD, 2);
    B.addMerged(baseTop > 0 ? baseMat : brickMat, g, at(F, bc.x, 0, -recD / 2),
      { tint: baseTop > 0 ? baseTint : brickTint, grime: 0.3 });
    const slabId = pBalcSlab(B, bc.w, balcD + recD);
    const railId = pBalcRail(B, bc.w, balcD + recD);
    for (let f = firstShaft; f < mainStories; f++) {
      const y = floorY(f);
      B.addInstance(slabId, at(RF, 0, y - 0.19, 0), null);
      B.addInstance(railId, at(RF, 0, y, 0), railTint);
    }
    // soffit closing the top of the slot
    B.addMerged(brickMat, box(bc.w, 0.24, recD), at(F, bc.x, topMain - 0.24, -recD / 2),
      { tint: brickTint.clone().multiplyScalar(0.86) });
  }

  // =========================================================================
  // WINDOWS / SILLS / AC SLEEVES
  // =========================================================================
  // AC POPULATION.  Gating whole BAYS (acCols) and then rolling 0.72 per window
  // produced full-height vertical stripes of sleeve and stripes of nothing —
  // a legible grid, which is the giveaway.  Draw per WINDOW instead, in three
  // states: recessed grille / grille plus a projecting unit / blank brick.
  const acCols = new Set();
  for (const b of bays) if (!inBalc(b.x, span)) acCols.add(b.i);
  const spanId = spandrelPanels ? pSpandrel(B, q05(span + 0.30), q05(sillY - 0.32)) : null;
  const acId = pAcSleeve(B);

  for (let f = firstShaft; f < mainStories; f++) {
    const y = floorY(f);
    for (const b of bays) {
      if (balcCols.length && inBalc(b.x, span)) continue;
      for (const o of offs) {
        putWin(winW, winH, at(F, b.x + o, y + sillY, 0), rng.bool(0.34));
        K.sill(winW, at(F, b.x + o, y + sillY, 0), { mat: 'whitebrick:precast' });
        // Soil streak washing down off the sill.  At 0.7x the window width and
        // a flat tint this read as a rectangular PATCH — the critic saw the
        // whole field as a light/dark blotch quilt.  A real streak is narrow,
        // long, and strongest right under the sill: shade the local geometry so
        // it fades out downward instead of ending on a hard edge.
        if (rng.bool(0.40)) {
          const sw = q05(clamp(winW * rng.range(0.20, 0.34), 0.15, 0.6));
          const sh = rng.range(1.8, 2.6);
          const g = box(sw, sh, 0.012, { segY: 6 });
          // shadeYRange writes straight into attributes.color — seed it first
          ensureColor(g);
          shadeYRange(g, 0, sh, 1.0, 0.70);      // dark at the sill, fading down
          B.addMerged(brickMat, g,
            at(F, b.x + o + rng.range(-winW * 0.3, winW * 0.3), y + sillY - sh - 0.06, 0.006),
            { tint: brickTint.clone().multiplyScalar(rng.range(0.90, 0.97)) });
        }
        // through-wall AC sleeve under (nearly) every window
        if (acCols.has(b.i)) {
          const az = spandrelPanels ? 0.05 : 0;
          const r = rng.next();
          if (r < 0.42) {
            B.addInstance(acId, at(F, b.x + o, y + sillY - 0.60, az));
          } else if (r < 0.74) {
            B.addInstance(acId, at(F, b.x + o, y + sillY - 0.60, az));
            B.addInstance(acId + ':unit', at(F, b.x + o, y + sillY - 0.60, az));
          }
          // else: blank brick infill (about a quarter of sleeves are bricked up)
        }
      }
      if (spanId && sillY > 0.5) B.addInstance(spanId, at(F, b.x, y + 0.16, 0), null);
    }
    for (const bc of balcCols) {
      putWin(doorW, doorH, at(F, bc.x, y + 0.03, -recD), rng.bool(0.22));
    }
  }

  // =========================================================================
  // GROUND FLOOR — lobby, canopy, planters, retail, doctor's office
  // =========================================================================
  {
    const gx = lobX;
    const rvd = 0.42;
    const dark = new THREE.Color(0.20, 0.19, 0.18);
    B.addMerged('paintFlat', box(lobW + 0.06, 0.08, rvd), at(F, gx, lobH - 0.08, -rvd / 2), { tint: dark, worldUV: false });
    for (const s of [-1, 1]) {
      B.addMerged('paintFlat', box(0.08, lobH, rvd), at(F, gx + s * (lobW / 2 - 0.04), 0, -rvd / 2), { tint: dark, worldUV: false });
    }
    const vd = 3.0;
    B.addMerged('whitebrick:precast', box(lobW - 0.1, 0.06, vd), at(F, gx, 0.02, -rvd - vd / 2), { tint: new THREE.Color(0.65, 0.63, 0.60) });
    B.addMerged('paintFlat', box(lobW - 0.1, 0.06, vd), at(F, gx, lobH - 0.2, -rvd - vd / 2), { tint: new THREE.Color(0.58, 0.56, 0.51), worldUV: false });
    B.addMerged('paintFlat', box(lobW - 0.1, lobH - 0.2, 0.1), at(F, gx, 0.06, -rvd - vd), { tint: new THREE.Color(0.38, 0.33, 0.26), worldUV: false });
    for (const s of [-1, 1]) {
      B.addMerged('paintFlat', box(0.09, lobH - 0.2, vd), at(F, gx + s * (lobW / 2 - 0.1), 0.06, -rvd - vd / 2), { tint: new THREE.Color(0.31, 0.28, 0.24), worldUV: false });
    }
    B.addMerged('litWindow', box(lobW * 0.55, 0.05, 0.35), at(F, gx, lobH - 0.30, -rvd - 1.1), { tint: new THREE.Color(1, 0.93, 0.8), worldUV: false });
    const gz = -rvd + 0.06;
    B.addMerged('whitebrick:glaze', quad(lobW - 0.16, lobH - 0.2), at(F, gx, 0.06, gz),
      { tint: new THREE.Color(0.16, 0.19, 0.22), worldUV: false });
    const nM = Math.max(2, Math.round((lobW - 0.2) / 1.35));
    for (let i = 0; i <= nM; i++) {
      const mx = gx - (lobW - 0.16) / 2 + ((lobW - 0.16) / nM) * i;
      B.addMerged('aluminum', box(0.07, lobH - 0.2, 0.09), at(F, mx, 0.06, gz + 0.02), { worldUV: false });
    }
    B.addMerged('aluminum', box(lobW - 0.16, 0.08, 0.09), at(F, gx, lobH - 0.28, gz + 0.02), { worldUV: false });
    B.addMerged('aluminum', box(lobW - 0.16, 0.10, 0.09), at(F, gx, 0.02, gz + 0.02), { worldUV: false });
    const dw = q05(clamp(lobW * 0.42, 1.5, 2.2));
    const entTint = rng.bool(0.55) ? new THREE.Color(0.40, 0.32, 0.20) : new THREE.Color(0.55, 0.56, 0.58);
    B.addMerged('aluminum', box(dw + 0.12, 0.10, 0.12), at(F, gx, 2.28, gz + 0.04), { tint: entTint, worldUV: false });
    for (const s of [-1, 0, 1]) {
      B.addMerged('aluminum', box(0.09, 2.30, 0.12), at(F, gx + s * dw / 2, 0.04, gz + 0.04), { tint: entTint, worldUV: false });
    }
    for (const s of [-1, 1]) {
      B.addMerged('steelDark', box(0.045, 1.05, 0.045), at(F, gx + s * (dw / 2 - 0.22), 0.85, gz + 0.14), { worldUV: false });
    }
    const hbY = q05(gHeadY + 0.06);
    if (!baseTwo) {
      B.addMerged('whitebrick:precast', box(W, 0.26, 0.17), at(F, 0, hbY, 0.06),
        { tint: new THREE.Color(0.90, 0.90, 0.89) });
    } else {
      // a two-storey stone base leaves ~1.5 m of blank wall between the ground
      // window heads and the first-floor sills; a shallow string course breaks
      // that dead zone the way the real bases do
      B.addMerged('whitebrick:precast', box(W + 0.06, 0.14, 0.13),
        at(F, 0, q05((hbY + floorY(1) + sillY) / 2), 0.05),
        { tint: new THREE.Color(0.88, 0.88, 0.87) });
    }

    const cw = q05(clamp(lobW + 1.3, 3.6, 8.0));
    const cd = q05(rng.range(3.9, 4.3));          // runs out to the curb line
    // the canopy's stepped hip rises 0.27 above its anchor; the precast head
    // band sits at hbY with a 0.26 face and 0.17 of projection, so anchoring at
    // lobH - 0.10 let the top slab drive straight THROUGH the band.  Tuck the
    // whole assembly under it.
    const cy = q05(clamp(Math.min(lobH - 0.10, hbY - 0.34), 2.55, 3.35));
    const cId = pCanopy(B, cw, cd);
    // hunter green / burgundy / navy: the only three colours a UES house
    // canopy is ever made in.
    // These are canvas REFLECTANCES, not screen colours, and the golden sun is
    // strongly warm (linear 1.00 / 0.56 / 0.27 across RGB) — so the red channel
    // gets ~4x the light the blue does.  A burgundy at R=0.13 therefore rendered
    // as bright salmon.  Every red component here is cut to ~0.06 so the awning
    // holds its hue at golden AND still separates from the wall at noon.
    const cTint = rng.weighted([
      [new THREE.Color(0.028, 0.072, 0.046), 6],   // hunter green
      [new THREE.Color(0.062, 0.019, 0.026), 3],   // burgundy
      [new THREE.Color(0.022, 0.036, 0.082), 2],   // navy
    ]);
    B.addInstance(cId, at(F, lobX, cy, 0), cTint);
    B.addInstance(cId + ':posts', at(F, lobX, cy, 0));
    B.addInstance(cId + ':soffit', at(F, lobX, cy - 0.06, cd * 0.55), new THREE.Color(0.62, 0.56, 0.45));
    B.addMerged('whitebrick:canvas', box(cw - 0.4, 0.03, cd - 0.3), at(F, lobX, 0.145, (cd - 0.3) / 2 + 0.1),
      { tint: cTint.clone().multiplyScalar(0.85), worldUV: false });

    const plW = q05(clamp((W / 2 - lobW / 2) * 0.3, 0.9, 2.0));
    const plId = pPlanter(B, plW);
    for (const s of [-1, 1]) {
      const px = lobX + s * (cw / 2 + plW / 2 + 0.35);
      if (Math.abs(px) + plW / 2 > W / 2 - 0.2) continue;
      B.addInstance(plId, at(F, px, 0.14, 0.60));
      // clipped boxwood is a DEEP green: at 0.30/0.47 the sun turned it into
      // pale sage foam.  Roughly a third of that reflectance reads as real leaf.
      B.addInstance(plId + ':hedge', at(F, px, 0.14, 0.60),
        new THREE.Color(0.095, 0.175, 0.092));
    }
    B.addInstance(pEntryTrim(B), at(F, lobX + (lobW / 2 + 0.42) * mir, 0.16, 0.02));
    K.siamese(at(F, lobX - (lobW / 2 + 0.95) * mir, 0.14, 0.34));

    if (commercial) {
      for (const s of sfBays) {
        K.storefront({
          width: s.w, signIndex: rng.int(0, 31),
          awningIndex: rng.bool(0.5) ? rng.int(0, 7) : -1,
          gate: rng.bool(0.12) ? 1 : 0,
        }, at(F, s.x, 0.02, 0));
      }
    } else {
      for (const o of groundOps) {
        if (Math.abs(o.x - lobX) < 0.05) continue;
        if (drOffice && drX !== null && Math.abs(o.x - drX) < 0.05 && o.w === 1.15) {
          // transom: false — the kit's clear-glass transom mirrors the sky and
          // blows out white inside a shaded reveal
          K.door({ w: 1.05, h: 2.35, style: 'paneled', transom: false },
            at(F, o.x, 0.05, -0.03), { tint: new THREE.Color(0x2c2c2a) });
          B.addMerged('whitebrick:glaze', quad(0.82, 1.55),
            at(F, o.x, 0.65, -0.34), { tint: new THREE.Color(0.52, 0.53, 0.56), worldUV: false });
          B.addMerged('paintFlat', box(0.9, 0.28, 0.05), at(F, o.x, 2.70, 0.04),
            { tint: new THREE.Color(0.86, 0.84, 0.78), worldUV: false });
          continue;
        }
        putWin(o.w, o.y1 - o.y0, at(F, o.x, o.y0, 0), rng.bool(0.3), glassGround());
        K.sill(o.w, at(F, o.x, o.y0, 0), { mat: 'whitebrick:precast' });
      }
    }
  }

  // =========================================================================
  // CORNER LOT — wrap the elevation onto the flank
  // =========================================================================
  let sideRows = { left: null, right: null };
  const sideMat = corner ? brickMat : 'whitebrick:common';
  if (corner) {
    const sf = at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    const nS = clamp(Math.round(D / (span + gapPier)), 2, 6);
    const sxs = [];
    for (let i = 0; i < nS; i++) sxs.push(q05(-D / 2 + (D / nS) * (i + 0.5)));
    const sOps = [];
    for (const x of sxs) for (const o of offs) sOps.push({ x: q05(x + o), w: winW });
    sOps.sort((a, b) => a.x - b.x);
    const sr = [{ y0: gSillY, y1: gSillY + gWinH, openings: sOps }];
    for (let f = 1; f < mainStories; f++) {
      const y = floorY(f);
      sr.push({ y0: y + sillY, y1: y + sillY + winH, openings: sOps });
    }
    sideRows = corner < 0 ? { left: sr, right: null } : { left: null, right: sr };
    for (const op of sOps) {
      putWin(op.w, gWinH, at(sf, op.x, gSillY, 0), rng.bool(0.25), glassGround());
      K.sill(op.w, at(sf, op.x, gSillY, 0), { mat: 'whitebrick:precast' });
    }
    for (let f = 1; f < mainStories; f++) {
      const y = floorY(f);
      for (const op of sOps) {
        putWin(op.w, winH, at(sf, op.x, y + sillY, 0), rng.bool(0.34));
        K.sill(op.w, at(sf, op.x, y + sillY, 0), { mat: 'whitebrick:precast' });
      }
      for (const x of sxs) if (rng.bool(0.65)) B.addInstance(acId, at(sf, x + offs[0], y + sillY - 0.58, 0));
    }
  }

  // =========================================================================
  // SHELL / REAR
  // =========================================================================
  const rearXs = [];
  {
    const n = clamp(Math.round(W / 4.4), 2, 6);
    for (let i = 0; i < n; i++) rearXs.push(q05(-W / 2 + (W / (n + 1)) * (i + 1)));
  }
  const rearRows = [];
  for (let f = 1; f < mainStories; f++) {
    const y = floorY(f) + sillY;
    rearRows.push({ y0: y, y1: y + winH, openings: rearXs.map((x) => ({ x, w: 1.0 })) });
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: topMain, mat: sideMat, tint: corner ? brickTint : facadeTint(rng),
    wallT: 0.32, rearRows, rearMat: 'whitebrick:common', sideRows,
  });
  for (let f = 1; f < mainStories; f++) {
    const y = floorY(f) + sillY;
    for (const x of rearXs) putWin(1.0, winH, at(F, -x, y, -D, Math.PI), rng.bool(0.34));
  }

  // =========================================================================
  // PARAPET / PENTHOUSE / ROOF
  // =========================================================================
  const parapetH = q05(rng.range(0.95, 1.25));
  flatRoof(ctx, F, {
    width: W, depth: D, height: topMain, parapet: parapetH,
    mat: brickMat, tint: brickTint, roofMat: rng.pick(['roofSilver', 'roofBlack']),
    copingMat: 'whitebrick:precast', wallT: 0.30,
  });
  // proud precast coping: 0.10 m overhang each side so it throws a hard shadow
  // line — on a type with no cornice this is the ONLY thing capping the wall
  B.addMerged('whitebrick:precast', box(W + 0.24, 0.15, 0.38),
    at(F, 0, topMain + parapetH - 0.02, 0.10), { tint: new THREE.Color(0.92, 0.92, 0.91) });

  let roofY = topMain;
  let roofW = W, roofD = D, roofZ0 = 0;

  if (setback) {
    const pw = W - 2 * sbX, pd = Math.max(6, D - sbZ - 0.9);
    const PF = at(F, 0, 0, -sbZ);
    B.addMerged('whitebrick:precast', box(W - 0.5, 0.08, sbZ - 0.16), at(F, 0, topMain, -(sbZ - 0.16) / 2 - 0.08),
      { tint: new THREE.Color(0.9, 0.89, 0.86) });
    const pBays = clamp(Math.round((pw - 1.6) / 3.2), 2, 8);
    const pxs = [];
    for (let i = 0; i < pBays; i++) pxs.push(q05(-(pw - 2.0) / 2 + ((pw - 2.0) / (pBays - 1)) * i));
    const pw2 = q05(clamp(winW + 0.25, 1.0, 2.3));
    punchedWall(ctx, at(PF, 0, topMain, 0), {
      width: pw, height: floorH, depth: 0.34, mat: brickMat, tint: brickTint,
      rows: [{ y0: 0.35, y1: 0.35 + q05(winH + 0.32), openings: pxs.map((x) => ({ x, w: pw2 })) }],
    });
    for (const x of pxs) {
      putWin(pw2, q05(winH + 0.32), at(PF, x, topMain + 0.35, 0), rng.bool(0.3));
      K.sill(pw2, at(PF, x, topMain + 0.35, 0), { mat: 'whitebrick:precast' });
    }
    shellWalls(ctx, at(PF, 0, topMain, 0), {
      width: pw, depth: pd, height: floorH, mat: brickMat, tint: brickTint, wallT: 0.3,
    });
    flatRoof(ctx, PF, {
      width: pw, depth: pd, height: topMain + floorH, parapet: 0.85,
      mat: brickMat, tint: brickTint, roofMat: 'roofSilver', copingMat: 'whitebrick:precast', wallT: 0.28,
    });
    const seg = Math.min(6, W / 2 - 0.6);
    const trId = pRoofRail(B, seg);
    const nT = Math.max(1, Math.round((W - 0.8) / seg));
    for (let i = 0; i < nT; i++) {
      B.addInstance(trId, at(F, -W / 2 + 0.4 + ((W - 0.8) / nT) * (i + 0.5), topMain + 0.08, -sbZ + 0.5),
        new THREE.Color(0.66, 0.68, 0.69));
    }
    roofY = topMain + floorH;
    roofW = pw; roofD = pd; roofZ0 = -sbZ;
  }

  // ---- roof gear: a stair/lift bulkhead ~1.5 storeys, set back from every
  // parapet, plus the wood tank on a tall open steel frame -------------------
  {
    const RF = at(F, 0, 0, roofZ0);
    const h2 = (v) => Math.round(v * 2) / 2;
    const bw = h2(clamp(Math.sqrt(roofW * roofD * 0.17), 3.2, 6.5));
    const bd = h2(clamp(bw * rng.range(0.62, 0.85), 2.6, 5.0));
    const bxLim = Math.max(0, roofW / 2 - bw / 2 - 3.0);
    const bx = rng.range(-bxLim, bxLim);
    const bzLim0 = -3.0 - bd / 2, bzLim1 = -roofD + 3.0 + bd / 2;
    const bz = rng.range(Math.min(bzLim0, bzLim1), Math.max(bzLim0, bzLim1));
    K.bulkhead(at(RF, bx, roofY, bz), {
      w: bw, d: bd, h: h2(clamp(floorH * 1.5, 3.6, 4.4)),
      mat: brickMat, tint: brickTint,
    });
    const sx = bx + (bx > 0 ? -1 : 1) * (bw / 2 + rng.range(2.0, 3.6));
    K.bulkhead(at(RF, clamp(sx, -roofW / 2 + 2.4, roofW / 2 - 2.4), roofY, -roofD * rng.range(0.55, 0.78)), {
      w: h2(rng.range(2.4, 3.2)), d: h2(rng.range(2.2, 3.0)), h: h2(rng.range(2.4, 3.0)),
      mat: 'whitebrick:conc', tint: new THREE.Color(1.05, 1.04, 1.0),
    });
    // the tank was landing 2.7-5.8 m back from the street parapet, which reads
    // as "balanced on the cornice"; push it behind the bulkhead line, and let a
    // third of the seeds have no tank at all (plenty of these slabs don't)
    if (rng.bool(0.68)) {
      K.waterTower(at(RF, rng.range(-roofW * 0.28, roofW * 0.28), roofY, -roofD * rng.range(0.36, 0.60), rng.range(0, Math.PI)), {
        legH: q05(rng.range(5.5, 7.2)), r: 1.8, hBody: 5.4,
        tint: new THREE.Color().setHSL(0.06, rng.range(0.18, 0.32), rng.range(0.20, 0.32)),
      });
    }
    B.addInstance(pCoolTower(B), at(RF, rng.range(-roofW * 0.3, roofW * 0.3), roofY, -roofD * rng.range(0.6, 0.85), rng.range(-0.4, 0.4)),
      new THREE.Color(0.78, 0.79, 0.8));
    if (rng.bool(0.7)) K.hvac(at(RF, rng.range(-roofW * 0.34, roofW * 0.34), roofY, -roofD * rng.range(0.3, 0.6), rng.range(0, 1.1)));
    for (let i = 0; i < rng.int(2, 4); i++) {
      K.vent(at(RF, rng.range(-roofW * 0.42, roofW * 0.42), roofY, -roofD * rng.range(0.15, 0.9)), {
        kind: rng.pick(['pipe', 'pipe', 'goose', 'whirly']),
      });
    }
    if (rng.bool(0.75)) {
      const did = pDish(B);
      for (let i = 0; i < rng.int(1, 3); i++) {
        B.addInstance(did, at(RF, rng.range(-roofW * 0.42, roofW * 0.42), roofY, -roofD * rng.range(0.1, 0.35), rng.range(-1, 1)));
      }
    }
    if (rng.bool(0.6)) K.antenna(at(RF, rng.range(-roofW * 0.3, roofW * 0.3), roofY, -roofD * rng.range(0.3, 0.6)));
  }

  return { height: (setback ? topMain + floorH + 0.85 : topMain + parapetH) + 0.1 };
}
