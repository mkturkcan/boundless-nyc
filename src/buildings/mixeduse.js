// Mixed-use commercial strip — 125th St / Lenox / Bedford Ave "taxpayer":
// 3–6 stories of brick apartments & offices over a MULTI-TENANT ground-floor
// retail base, mid-block AND corner (chamfered corner bay with its own
// storefront, cornice + sign band wrapping, storefronts turning onto the side
// street, exposed party wall with ghost signs, roof billboard).
// Refs: docs/typology/07-mixed-use-commercial.md + 09-corner-buildings.md
//
// SHOWCASE CORNER TEST -------------------------------------------------------
// tools/shot.mjs cannot set lot.corner, so when lot.district === 'showcase'
// every seed with (seed % 3 === 0) is promoted to a corner lot with the LEFT
// side exposed (corner = -1). The showcase hero / front / detail cameras all
// look in from -X, so the chamfered corner bay and the wrapped cornice read
// there. In the real city lot.corner is passed through untouched.
import * as THREE from 'three';
import { at, punchedWall, roofGear, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, compose, tmat, ensureColor } from '../geo.js';
import { makeCanvas } from '../textures.js';

export const TYPE = 'mixeduse';

const q05 = (v) => Math.round(v * 20) / 20;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ===========================================================================
// PAINTED-AD ATLAS (party-wall ghost signs + roof billboard faces)
// 2x2 cells on one 1024 canvas. Cells 0/1 = faded ghost signs (with alpha),
// cells 2/3 = later opaque painted ads. All copy is invented — no real brands.
// ===========================================================================
const AD_CELL = 512;
function adUv(i) {
  const col = i % 2, row = Math.floor(i / 2) % 2;
  return { u0: col / 2, v0: 1 - (row + 1) / 2, u1: (col + 1) / 2, v1: 1 - row / 2 };
}

function ensureAdMaterial(ctx) {
  const B = ctx.batcher;
  if (B.M.has('mixeduse:ad')) return;
  const S = AD_CELL * 2;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  let s = 20240119 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const org = (i) => [(i % 2) * AD_CELL, Math.floor(i / 2) * AD_CELL];

  const line = (x, y, txt, px, col, alpha) => {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.font = `900 ${px}px Arial Black, Arial`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, x, y);
    g.restore();
  };
  const erode = (ox, oy, n, rMin, rMax, a) => {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) {
      g.globalAlpha = a * (0.3 + rnd() * 0.7);
      g.beginPath();
      g.ellipse(ox + rnd() * AD_CELL, oy + rnd() * AD_CELL,
        rMin + rnd() * (rMax - rMin), rMin + rnd() * (rMax - rMin), rnd() * 3, 0, 7);
      g.fill();
    }
    g.restore();
  };

  // cell 0 — ghost sign, lead white, badly faded
  {
    const [ox, oy] = org(0);
    g.save();
    g.globalAlpha = 0.2; g.strokeStyle = '#eae4d6'; g.lineWidth = 7;
    g.strokeRect(ox + 26, oy + 34, AD_CELL - 52, AD_CELL - 68);
    g.restore();
    line(ox + AD_CELL / 2, oy + 122, 'EMPIRE', 128, '#eae4d6', 0.36);
    line(ox + AD_CELL / 2, oy + 232, 'FURNITURE', 92, '#eae4d6', 0.32);
    line(ox + AD_CELL / 2, oy + 316, 'C O M P A N Y', 54, '#eae4d6', 0.27);
    g.save(); g.globalAlpha = 0.24; g.fillStyle = '#8c3a2b';
    g.fillRect(ox + 70, oy + 356, AD_CELL - 140, 16); g.restore();
    line(ox + AD_CELL / 2, oy + 412, 'CREDIT ARRANGED', 44, '#eae4d6', 0.24);
    line(ox + AD_CELL / 2, oy + 462, 'LENOX  AVE', 40, '#eae4d6', 0.19);
    erode(ox, oy, 34, 12, 78, 0.55);
  }
  // cell 1 — ghost sign, red oxide + ochre
  {
    const [ox, oy] = org(1);
    line(ox + AD_CELL / 2, oy + 118, 'GROCERIES', 100, '#8c3a2b', 0.33);
    line(ox + AD_CELL / 2, oy + 118, 'GROCERIES', 100, '#23201d', 0.11);
    line(ox + AD_CELL / 2, oy + 224, 'MEATS · POULTRY', 58, '#23201d', 0.27);
    g.save(); g.globalAlpha = 0.2; g.fillStyle = '#23201d';
    g.fillRect(ox + 54, oy + 266, AD_CELL - 108, 12); g.restore();
    line(ox + AD_CELL / 2, oy + 340, 'FRESH', 108, '#b8883a', 0.26);
    line(ox + AD_CELL / 2, oy + 434, 'DAILY', 108, '#b8883a', 0.23);
    erode(ox, oy, 40, 14, 90, 0.6);
  }
  // cell 2 — later opaque painted wall ad
  {
    const [ox, oy] = org(2);
    g.fillStyle = '#1b2a4a'; g.fillRect(ox, oy, AD_CELL, AD_CELL);
    g.fillStyle = '#23201d';
    g.fillRect(ox, oy, AD_CELL, 22); g.fillRect(ox, oy + AD_CELL - 22, AD_CELL, 22);
    g.fillStyle = '#b8883a'; g.fillRect(ox + 40, oy + 198, AD_CELL - 80, 10);
    line(ox + AD_CELL / 2, oy + 112, 'SPACE', 122, '#f2ece0', 1);
    line(ox + AD_CELL / 2, oy + 230, 'AVAILABLE', 84, '#f2ece0', 1);
    line(ox + AD_CELL / 2, oy + 330, 'THIS WALL', 54, '#b8883a', 0.95);
    line(ox + AD_CELL / 2, oy + 412, '212 · 555 · 0198', 60, '#f2ece0', 0.9);
    g.save(); g.globalAlpha = 0.14; g.fillStyle = '#000';
    for (let i = 0; i < 22; i++) {
      g.fillRect(ox + rnd() * AD_CELL, oy + rnd() * AD_CELL, 3 + rnd() * 5, 40 + rnd() * 180);
    }
    g.restore();
    erode(ox, oy, 12, 8, 34, 0.2);
  }
  // cell 3 — roof billboard face
  {
    const [ox, oy] = org(3);
    g.fillStyle = '#e8ddc6'; g.fillRect(ox, oy, AD_CELL, AD_CELL);
    g.fillStyle = '#9c2b22'; g.fillRect(ox, oy, AD_CELL, 168);
    g.fillStyle = '#2b3a5c'; g.fillRect(ox, oy + AD_CELL - 96, AD_CELL, 96);
    g.fillStyle = '#b8883a';
    g.beginPath(); g.arc(ox + 104, oy + 300, 64, 0, 7); g.fill();
    // margins kept generous: the billboard quad is ~2.6:1 and its frame box
    // overlaps ~3% top and bottom, which was cutting the last line in half
    line(ox + AD_CELL / 2, oy + 92, 'HARLEM', 104, '#f6efdf', 1);
    line(ox + AD_CELL / 2 + 40, oy + 262, 'DRY GOODS', 62, '#23201d', 1);
    line(ox + AD_CELL / 2 + 40, oy + 336, 'SINCE 1948', 40, '#5c4a32', 1);
    line(ox + AD_CELL / 2, oy + AD_CELL - 62, 'OPEN DAILY · 8 TO 8', 40, '#f2ece0', 1);
    g.strokeStyle = '#23201d'; g.lineWidth = 14;
    g.strokeRect(ox + 7, oy + 7, AD_CELL - 14, AD_CELL - 14);
    erode(ox, oy, 8, 6, 22, 0.12);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex, transparent: true,
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.4,
  });
  m.userData.tileMeters = 2;
  m.name = 'mixeduse:ad';
  B.M.set('mixeduse:ad', m);
}

// ===========================================================================
// PRIVATE INSTANCED PARTS
// ===========================================================================
function ensureParts(B) {
  if (!B.hasPart('mixeduse:standpipe')) {
    B.definePart('mixeduse:standpipe', compose([
      { geom: cylinder(0.055, 0.055, 1.0, 8), x: 0, y: 0, z: 0 },
      { geom: box(0.16, 0.05, 0.12, { segY: 1 }), x: 0, y: 0, z: 0 },
      { geom: cylinder(0.075, 0.075, 0.15, 8), x: 0, y: 0.98, z: 0 },
      { geom: cylinder(0.048, 0.048, 0.2, 8), x: -0.1, y: 1.0, z: 0.02, rz: -0.8 },
      { geom: cylinder(0.048, 0.048, 0.2, 8), x: 0.1, y: 1.0, z: 0.02, rz: 0.8 },
    ]), 'paintFlat');
  }
  // anchored at the TOP of the blade sign face; arm + diagonal brace + wall plate
  if (!B.hasPart('mixeduse:blade:bracket')) {
    B.definePart('mixeduse:blade:bracket', compose([
      { geom: box(0.05, 0.05, 0.86, { segY: 1 }), x: 0, y: 0.0, z: 0.03 },
      { geom: box(0.035, 0.82, 0.035, { segY: 1 }), x: 0, y: -0.56, z: 0.05, rx: 0.62 },
      { geom: box(0.14, 0.34, 0.05, { segY: 1 }), x: 0, y: -0.32, z: 0.0 },
    ]), 'ironwork');
  }
  if (!B.hasPart('mixeduse:crate')) {
    const items = [];
    for (let i = 0; i < 3; i++) {
      items.push({
        geom: box(0.4, 0.27, 0.4, { segY: 1 }),
        x: (i % 2) * 0.05, y: i * 0.27, z: (i % 2) * 0.03, ry: i * 0.09,
      });
    }
    B.definePart('mixeduse:crate', compose(items), 'paintFlat');
  }
  if (!B.hasPart('mixeduse:rack')) {
    const items = [
      { geom: box(1.15, 0.06, 0.62, { segY: 1 }), x: 0, y: 0.4, z: 0 },
      { geom: box(1.15, 0.06, 0.62, { segY: 1 }), x: 0, y: 0.86, z: 0 },
      { geom: box(1.05, 0.13, 0.5, { segY: 1 }), x: 0, y: 0.44, z: 0.03 },
      { geom: box(1.05, 0.13, 0.5, { segY: 1 }), x: 0, y: 0.9, z: 0.03 },
    ];
    for (const sx of [-0.54, 0.54]) {
      items.push({ geom: box(0.05, 0.95, 0.05, { segY: 1 }), x: sx, y: 0, z: -0.26 });
      items.push({ geom: box(0.05, 0.95, 0.05, { segY: 1 }), x: sx, y: 0, z: 0.26 });
    }
    B.definePart('mixeduse:rack', compose(items), 'steelDark');
  }
}

function sfColumn(B, h) {
  h = q05(h);
  const id = `mixeduse:sfcol:${h}`;
  if (!B.hasPart(id)) {
    B.definePart(id, compose([
      { geom: cylinder(0.11, 0.13, h - 0.28, 10), x: 0, y: 0.14, z: 0 },
      { geom: box(0.34, 0.14, 0.34, { segY: 1 }), x: 0, y: 0, z: 0 },
      { geom: box(0.38, 0.14, 0.38, { segY: 1 }), x: 0, y: h - 0.14, z: 0 },
    ]), 'steelDark');
  }
  return id;
}

// ===========================================================================
// SMALL BUILD HELPERS
// ===========================================================================
function mb(B, mat, w, h, d, frame, x, y, z, opts = {}) {
  if (w <= 0.004 || h <= 0.004 || d <= 0.004) return;
  const g = box(w, h, d, { segY: opts.segY || 1 });
  if (opts.tileUV) boxUV(g, w, h, d, 2);
  B.addMerged(mat, g, frame.clone().multiply(tmat(x, y, z, opts.ry || 0)), {
    tint: opts.tint || null,
    worldUV: opts.worldUV !== undefined ? opts.worldUV : true,
    grime: opts.grime || 0,
    aoTop: opts.aoTop || 0,
  });
}

function signQuad(ctx, frame, x, y, z, w, h, index) {
  const uv = ctx.extra.signUvFor(index % ctx.extra.signCount);
  ctx.batcher.addMerged('signs', quad(w, h, uv),
    frame.clone().multiply(tmat(x, y, z)), { worldUV: false });
}

// Emissive panel facing the street (interior glow seen through glazing).
function litPanel(B, frame, x, y, z, w, h, tint) {
  B.addMerged('litWindow', quad(w, h), frame.clone().multiply(tmat(x, y, z)),
    { worldUV: false, tint });
}

// Glazing leaf on the shared physical 'glass', carrying a vertical VERTEX
// gradient instead of one flat tint: dark street/interior at the sill ramping
// to sky at the head. The environment probe is sky-only, so a flat leaf shows
// no mirrored street and reads as frosted perspex; baking the ramp into the
// vertex colours is what makes it read as a mirror.
const GLASS_SILL = new THREE.Color(0.030, 0.034, 0.036);
const GLASS_HEAD = new THREE.Color(0.150, 0.185, 0.215);
function glassLeaf(B, frame, x, y, z, w, h, headMul = 1) {
  const g = quad(w, h);
  ensureColor(g);
  const pos = g.attributes.position, col = g.attributes.color;
  const top = GLASS_HEAD.clone().multiplyScalar(headMul);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = h > 0.001 ? Math.min(1, Math.max(0, pos.getY(i) / h)) : 0;
    c.copy(GLASS_SILL).lerp(top, t * t * (3 - 2 * t));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  B.addMerged('glass', g, frame.clone().multiply(tmat(x, y, z)), { worldUV: false });
}

function parapetRun(B, frame, { cx = 0, cz, len, t, y, h, mat, tint, coping, copingTint }) {
  if (len <= 0.05 || h <= 0.02) return;
  mb(B, mat, len, h, t, frame, cx, y, cz, { tint, segY: 1 });
  mb(B, coping, len + 0.05, 0.08, t + 0.1, frame, cx, y + h, cz, { tint: copingTint });
}

// Double-sided projecting blade sign + iron bracket, hung on a pier.
function bladeSign(ctx, frame, x, yBottom, { proj = 0.9, faceH = 0.62, index = 0, thick = 0.11 }) {
  const B = ctx.batcher;
  const uv = ctx.extra.signUvFor(index % ctx.extra.signCount);
  for (const s of [-1, 1]) {
    const p = quad(proj, faceH, uv);
    p.rotateY(s * Math.PI / 2);
    B.addMerged('signs', p,
      frame.clone().multiply(tmat(x + s * (thick / 2 + 0.004), yBottom, proj / 2 + 0.09)),
      { worldUV: false });
  }
  mb(B, 'paintFlat', thick, faceH, proj, frame, x, yBottom, proj / 2 + 0.09,
    { tint: new THREE.Color(0.1, 0.095, 0.09), worldUV: false });
  B.addInstance('mixeduse:blade:bracket',
    frame.clone().multiply(tmat(x, yBottom + faceH + 0.02, 0.02)));
}

function wallAd(B, frame, x, y, w, h, cell) {
  B.addMerged('mixeduse:ad', quad(w, h, adUv(cell)),
    frame.clone().multiply(tmat(x, y, 0)), { worldUV: false });
}

// ===========================================================================
// CANVAS AWNING — built here rather than via kit.storefront's awningIndex,
// whose slope panel rotates INTO the wall (only the side gussets and valance
// end up outside, which reads as two floating brown triangles). Anchored at
// the wall attachment line: hangs down `drop` and out `proj`. The 'awning'
// material is DoubleSide, so the underside lights correctly too.
// ===========================================================================
function awning(ctx, frame, x, yTop, { w, proj, drop, index }) {
  const B = ctx.batcher;
  const uv = ctx.extra.awningUvFor(index % ctx.extra.awningCount);
  const L = Math.hypot(proj, drop);
  const ang = Math.atan2(proj, drop);
  const slope = quad(w, L, uv);
  slope.translate(0, -L, 0);
  slope.rotateX(-ang);                          // +y end -> (-drop, +proj)
  B.addMerged('awning', slope, frame.clone().multiply(tmat(x, yTop, 0.03)), { worldUV: false });
  // shaded soffit 25 mm under the fabric: DoubleSide lights both faces the
  // same, so without this the awning reads as folded card from below
  const sof = quad(w - 0.02, L - 0.02);
  sof.translate(0, -(L - 0.02), 0);
  sof.rotateX(-ang);
  sof.translate(0, -0.025 * Math.sin(ang), -0.025 * Math.cos(ang));
  B.addMerged('paintFlat', sof, frame.clone().multiply(tmat(x, yTop, 0.03)),
    { worldUV: false, tint: new THREE.Color(0.17, 0.16, 0.15) });
  // side gussets (wall top -> front bar -> wall at bar height), outward normals
  const mkTri = (flip) => {
    const t = new THREE.BufferGeometry();
    const p = flip
      ? [0, 0, 0, 0, -drop, 0, 0, -drop, proj]
      : [0, 0, 0, 0, -drop, proj, 0, -drop, 0];
    t.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    t.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      uv.u0, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0,
    ]), 2));
    t.computeVertexNormals();
    return t;
  };
  for (const s of [-1, 1]) {
    B.addMerged('awning', mkTri(s < 0),
      frame.clone().multiply(tmat(x + s * w / 2, yTop, 0.03)), { worldUV: false });
  }
  // plumb valance hanging off the front bar
  const vuv = { ...uv, v1: uv.v0 + (uv.v1 - uv.v0) * 0.3 };
  B.addMerged('awning', quad(w, 0.24, vuv),
    frame.clone().multiply(tmat(x, yTop - drop - 0.24, proj + 0.035)), { worldUV: false });
  // front bar (0.044 tube) + wall bar
  const bar = new THREE.Color(0.19, 0.185, 0.18);
  mb(B, 'steelDark', w + 0.04, 0.044, 0.044, frame, x, yTop - drop - 0.022, proj + 0.03,
    { tint: bar, worldUV: false });
  mb(B, 'steelDark', w + 0.04, 0.05, 0.06, frame, x, yTop - 0.05, 0.035,
    { tint: bar, worldUV: false });
}

// ===========================================================================
// FIRE-ESCAPE BAY CHOICE
// kit.fireEscape hangs its stowed drop ladder on the -x side of the frame and
// it descends to ~3.0 m — dead level with the storefront sign band, which is
// how a strut ended up crossing an illuminated sign face. Two-part fix:
//  1. prefer a bay whose ladder lands clear of every sign band;
//  2. if none exists, still build the escape (a 4-6 storey walk-up over retail
//     on 125th/Lenox/Bedford essentially always has one) but return the ladder
//     footprint so the tenant under it drops its PROJECTING signage — cabinet,
//     sub-strip, blade — leaving only the flat band the ladder passes in front
//     of. Deleting the escape, as the first pass did, is its own "too clean"
//     tell and is worse than the clash it avoided.
// ===========================================================================
const FE_W_STEPS = [2.4, 3.0, 3.6];
function pickFireEscapeBay(xs, winW, forbidden, rng) {
  const clear = [], any = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const feW = Math.abs(xs[i + 1] - xs[i]) + winW + 0.5;
    const qw = FE_W_STEPS.reduce((a, b) => (Math.abs(b - feW) < Math.abs(a - feW) ? b : a));
    const cx = (xs[i] + xs[i + 1]) / 2;
    const lx = cx - (qw / 2 - 0.55);            // ladder head x
    const span = [lx - 0.20, lx + 1.05];        // ladder footprint in x
    const cand = { cx, feW, span };
    any.push(cand);
    if (!forbidden.some(([f0, f1]) => span[1] > f0 && span[0] < f1)) clear.push(cand);
  }
  const pool = clear.length ? clear : any;
  if (!pool.length) return null;
  return pool[rng.int(0, pool.length - 1)];
}

// ===========================================================================
// STOREFRONT DRESSING — layered in front of / behind kit.storefront
// kit.storefront geometry (local, relative to its anchor):
//   bulkhead 0.02..0.57 (z -0.18..-0.06) | glass 0.60..2.88 (z -0.16)
//   gate coil box 2.62..2.92 | sign box 2.98..3.81 (z -0.05..0.09)
//   sign face 3.02..3.77 at z 0.10  | awning hangs 2.95 -> 2.20
// ===========================================================================
function tenantStyle(rng, extra, used) {
  // every sign index a tenant uses goes into `used` — the cabinet and sub-strip
  // faces were not deduped, so two adjacent bays could both read BOTANICA
  const pick = () => {
    let i = rng.int(0, extra.signCount - 1);
    for (let k = 0; k < 10 && used.has(i); k++) i = rng.int(0, extra.signCount - 1);
    used.add(i);
    return i;
  };
  const si = pick();
  const gate = rng.weighted([[0, 56], [1, 22], [2, 22]]);
  const bulkMat = rng.weighted([
    ['paintFlat', 34], ['graniteBase', 20], ['terracotta', 14],
    ['limestone', 9], ['concrete', 10], ['brownstoneDark', 13],
  ]);
  const bulkTint = bulkMat === 'paintFlat'
    ? new THREE.Color(rng.weighted([
      [0x1d1f1e, 4], [0x21402f, 3], [0x4a1f1f, 3], [0x1d2f4a, 3],
      [0xcfc7b4, 2], [0x6b5b3e, 2], [0x2b2b2e, 3],
    ]))
    : new THREE.Color().setScalar(rng.range(0.7, 1.0));
  const hood = gate === 0 && rng.bool(0.6);
  return {
    signIndex: si,
    awningIndex: rng.bool(0.42) ? rng.int(0, extra.awningCount - 1) : -1,
    awnProj: rng.range(0.95, 1.35),
    awnDrop: rng.range(0.62, 0.86),
    gate, hood,
    tagged: gate === 2 && rng.bool(0.28),
    entrySide: rng.bool() ? 1 : -1,
    cabinet: rng.bool(0.34),
    cabinetSign: pick(),
    substrip: rng.bool(0.3),
    substripSign: pick(),
    blade: rng.bool(0.26),
    bladeSign: pick(),
    neon: rng.bool(0.4),
    bulkMat, bulkTint,
    bulkH: rng.range(0.42, 0.62),
    dressing: rng.bool(0.28),
    lit: rng.bool(0.85),
    // spec: interior luminance 1/6-1/12 of the sunlit facade — the retail band
    // has to be the DARKEST zone on the building, not the brightest
    glow: rng.range(0.070, 0.115),
    counter: rng.bool(0.72),
    // dark bronze / black anodised / clear anodised storefront metal
    frameTint: new THREE.Color(rng.weighted([
      [0x2a2622, 4], [0x16181a, 3], [0x9ea2a4, 3], [0x4a4034, 2], [0xd2d4d2, 1],
    ])),
  };
}

// ===========================================================================
// STOREFRONT — built here rather than through kit.storefront.
// kit's glazing leaf is an UNTINTED instance of the shared physical 'glass'
// material. That material still carries a 0.72 diffuse albedo, so at 0.42
// alpha a sunlit shopfront resolved to a flat white sheet with the mullions as
// pale stripes across it — the "grey striped plane" the critic called a texture
// bug. The leaf is a shared instanced part, so it cannot be tinted from here
// without recolouring every other type's storefronts. Owning the leaf lets it
// carry a near-black vertex tint: diffuse gone, Fresnel intact, interior
// visible. Still the shared 'glass' material.
// Local frame: x centred on the bay, y = 0 sidewalk, z = 0 wall face, building
// into -z. Key heights match the kit's (glass top 2.90, transom 2.20, sign band
// 2.98) so the band, roll-gate hood and entablature above still line up.
// ===========================================================================
const SF_RD = 0.16;      // glazing setback from the wall face
const SF_H = 2.90;       // top of vision glass
const SF_TR = 2.20;      // transom bar

function storefront(ctx, rng, frame, clear, headRel, st, { interiorDepth = 2.5, pier = 0.3 } = {}) {
  const B = ctx.batcher;
  const w = clear;
  const dz = Math.max(1.8, interiorDepth);
  const warm = new THREE.Color(1.0, 0.88, 0.72);
  const bh = st.bulkH;
  const open = st.gate !== 2;

  // ---- shop interior: dark shell, warm lightbox at the back, masses in front
  // Tints are much darker than they look: the sky IBL reaches straight in
  // through the opening, so a 0.25 grey interior surface lifts to a pale wash
  // and the whole room reads as fog instead of a dim room.
  const dark = new THREE.Color(0.055, 0.052, 0.05);
  const ih = Math.max(2.9, headRel - 0.05);
  mb(B, 'paintFlat', w + 0.4, ih, 0.12, frame, 0, -0.24, -dz, { tint: dark, worldUV: false });
  for (const s of [-1, 1]) {
    mb(B, 'paintFlat', 0.12, ih, dz - 0.2, frame, s * (w / 2 + 0.12), -0.24, -dz / 2 - 0.1,
      { tint: dark, worldUV: false });
  }
  mb(B, 'paintFlat', w + 0.4, 0.12, dz - 0.2, frame, 0, headRel - 0.34, -dz / 2 - 0.1,
    { tint: new THREE.Color(0.075, 0.072, 0.068), worldUV: false });
  mb(B, 'paintFlat', w + 0.4, 0.1, dz - 0.2, frame, 0, -0.16, -dz / 2 - 0.1,
    { tint: new THREE.Color(0.13, 0.122, 0.11), worldUV: false });

  if (open) {
    // nothing inside a shop is lit by the scene, so interior depth has to come
    // from an emissive back wall with dark masses silhouetted against it
    if (st.lit) {
      // illuminated back-bar band: bright, but only a band, so there is dark
      // above and below it instead of one flat glow
      litPanel(B, frame, 0, 1.06, -dz + 0.07, w * 0.82, Math.min(1.35, headRel - 1.7),
        warm.clone().multiplyScalar(st.glow * 2.1));
      const sy = Math.min(2.46, headRel - 0.68);
      mb(B, 'litWindow', w - 0.5, 0.09, 0.44, frame, 0, sy, -0.52,
        { tint: warm.clone().multiplyScalar(rng.range(0.30, 0.46)), worldUV: false });
      mb(B, 'paintFlat', w - 0.42, 0.08, 0.52, frame, 0, sy + 0.09, -0.52,
        { tint: new THREE.Color(0.14, 0.135, 0.13), worldUV: false });
      mb(B, 'litWindow', w - 0.9, 0.07, 0.34, frame, 0, sy, -dz + 0.62,
        { tint: warm.clone().multiplyScalar(rng.range(0.16, 0.26)), worldUV: false });
    }
    // display sill just inside the glass + goods on it
    mb(B, 'paintFlat', w - 0.06, 0.07, 0.72, frame, 0, bh - 0.07, -SF_RD - 0.4,
      { tint: new THREE.Color(0.15, 0.14, 0.125), worldUV: false });
    for (let i = 0; i < rng.int(2, 4); i++) {
      const bwid = rng.range(0.2, 0.42);
      mb(B, 'paintFlat', bwid, rng.range(0.22, 0.5), rng.range(0.18, 0.32), frame,
        rng.range(-w / 2 + 0.3, w / 2 - 0.3), bh, -SF_RD - rng.range(0.2, 0.55),
        { tint: new THREE.Color().setScalar(rng.range(0.05, 0.15)), worldUV: false });
    }
    // counter + shelf gondolas
    if (st.counter) {
      mb(B, 'paintFlat', w * rng.range(0.42, 0.62), rng.range(0.92, 1.08), 0.55, frame,
        rng.range(-w * 0.12, w * 0.12), 0.02, -dz * 0.42,
        { tint: new THREE.Color(0.08, 0.075, 0.07), worldUV: false });
    }
    for (const s of [-1, 1]) {
      if (!rng.bool(0.66)) continue;
      mb(B, 'paintFlat', rng.range(0.5, 0.95), rng.range(1.5, 2.05), 0.36, frame,
        s * (w / 2 - rng.range(0.35, 0.85)), 0.02, -dz + rng.range(0.42, 0.8),
        { tint: new THREE.Color(0.09, 0.085, 0.08), worldUV: false });
    }
    if (st.neon) {
      const nc = new THREE.Color(rng.weighted([[0xff3b30, 4], [0x2b7bff, 3], [0x39ff88, 2], [0xffd23b, 3]]));
      litPanel(B, frame, rng.range(-w / 3, w / 3), rng.range(1.55, 2.05), -0.34,
        rng.range(0.34, 0.6), rng.range(0.2, 0.34), nc);
    }
  }

  // ---- glazing leaf: shared 'glass' with a baked sill-to-head mirror ramp --
  if (open) {
    glassLeaf(B, frame, 0, bh + 0.02, -SF_RD - 0.01, w - 0.04, SF_H - bh - 0.04);
  }

  // ---- storefront frame: sill / head / transom rails, jambs, mullions ------
  // real extrusion sightlines: 0.044-0.064 m faces, not the 0.10-0.12 m that
  // made the shopfront read as a domestic window grid
  const ft = st.frameTint;
  const eaves = (wd, hh, dd, x, y) => mb(B, 'aluminum', wd, hh, dd, frame, x, y, -SF_RD + 0.03,
    { tint: ft, worldUV: false });
  eaves(w, 0.05, 0.12, 0, bh - 0.01);
  eaves(w, 0.07, 0.12, 0, SF_H - 0.07);
  eaves(w, 0.044, 0.105, 0, SF_TR);
  for (const s of [-1, 1]) eaves(0.058, SF_H - bh, 0.12, s * (w / 2 - 0.029), bh);
  const nM = Math.max(1, Math.round(w / 1.55));
  for (let i = 1; i < nM; i++) eaves(0.046, SF_H - bh, 0.105, -w / 2 + (w / nM) * i, bh);

  // ---- entry: glass door in the end bay ----------------------------------
  // 0.91 x 2.13 leaf, 0.254 bottom rail, stainless kick plate, threshold, a
  // 0.45 ladder pull — and the bulkhead is BROKEN for it below, not run across
  const dw = Math.min(1.12, Math.max(0.95, w * 0.30));
  const ex = st.entrySide * (w / 2 - dw / 2 - 0.13);
  if (open) {
    const dh2 = 2.19;
    mb(B, 'graniteBase', dw + 0.1, 0.03, 0.52, frame, ex, 0, -SF_RD - 0.2,
      { tint: new THREE.Color(0.34, 0.335, 0.32) });
    glassLeaf(B, frame, ex, 0.30, -SF_RD - 0.09, dw - 0.19, dh2 - 0.42, 0.85);
    for (const s of [-1, 1]) {
      mb(B, 'aluminum', 0.052, dh2, 0.085, frame, ex + s * (dw / 2 - 0.026), 0, -SF_RD - 0.07,
        { tint: ft, worldUV: false });
    }
    mb(B, 'aluminum', dw, 0.062, 0.085, frame, ex, dh2 - 0.062, -SF_RD - 0.07, { tint: ft, worldUV: false });
    mb(B, 'aluminum', dw, 0.254, 0.085, frame, ex, 0.03, -SF_RD - 0.07, { tint: ft, worldUV: false });
    mb(B, 'aluminum', dw - 0.09, 0.203, 0.02, frame, ex, 0.05, -SF_RD - 0.115,
      { tint: new THREE.Color(0.66, 0.66, 0.64), worldUV: false });
    B.addMerged('aluminum', cylinder(0.0125, 0.0125, 0.45, 6),
      frame.clone().multiply(tmat(ex - dw * 0.28, 0.80, -SF_RD - 0.12)),
      { tint: new THREE.Color(0.74, 0.74, 0.72), worldUV: false });
  }

  // ---- security gate variants --------------------------------------------
  if (st.gate > 0) {
    const gh = SF_H - 0.22;
    const gwid = st.gate === 2 ? w : Math.min(2.3, w * 0.42);
    const gx = st.gate === 2 ? 0 : st.entrySide * (w / 2 - gwid / 2);
    const gg = quad(gwid, gh);
    const gu = gg.attributes.uv;
    for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * gwid, gu.getY(i) * gh);
    // plain mill gate by default: the tagged variant's shared graffiti texture
    // resolves at street distance as a grid of identical little scribbles,
    // which is what the earlier critique called "squiggle decals"
    B.addMerged(st.tagged ? 'rollGateTagged' : 'rollGate', gg,
      frame.clone().multiply(tmat(gx, 0.03, -SF_RD + 0.075)),
      { worldUV: false, tint: new THREE.Color(0.72, 0.73, 0.74) });
    mb(B, 'paintFlat', gwid + 0.12, 0.3, 0.28, frame, gx, SF_H - 0.28, -SF_RD + 0.11,
      { tint: new THREE.Color(0.26, 0.26, 0.27), worldUV: false });
    for (const s of [-1, 1]) {            // side tracks
      mb(B, 'steelDark', 0.05, gh + 0.3, 0.1, frame, gx + s * (gwid / 2 + 0.025), 0.03, -SF_RD + 0.075,
        { tint: new THREE.Color(0.24, 0.24, 0.25), worldUV: false });
    }
  }

  // ---- primary sign band, with a drip hood that shades the face ----------
  mb(B, 'paintFlat', w + 0.3, 0.86, 0.16, frame, 0, 2.96, 0.02,
    { tint: new THREE.Color(0.105, 0.10, 0.098), worldUV: false });
  signQuad(ctx, frame, 0, 3.0, 0.105, w + 0.2, 0.74, st.signIndex);
  mb(B, 'paintFlat', w + 0.38, 0.055, 0.26, frame, 0, 3.82, 0.05,
    { tint: new THREE.Color(0.16, 0.155, 0.15), worldUV: false });

  // ---- bulkhead (split around the door opening) ---------------------------
  const bulk = (bx, bw2) => {
    if (bw2 <= 0.05) return;
    mb(B, st.bulkMat, bw2, bh, 0.17, frame, bx, 0, -SF_RD / 2 + 0.005,
      { tint: st.bulkTint, tileUV: true, grime: 0.38 });
    mb(B, 'limestone', bw2 + 0.04, 0.05, 0.2, frame, bx, bh, -SF_RD / 2 + 0.02,
      { tint: new THREE.Color(0.62, 0.6, 0.57) });
  };
  if (open) {
    const d0 = ex - dw / 2 - 0.06, d1 = ex + dw / 2 + 0.06;
    bulk((-w / 2 - 0.02 + d0) / 2, d0 - (-w / 2 - 0.02));
    bulk((d1 + w / 2 + 0.02) / 2, (w / 2 + 0.02) - d1);
  } else {
    bulk(0, w + 0.04);
  }

  // ---- blanked transom up to the opening head ------------------------------
  const tp = headRel - 2.94;
  if (tp > 0.06) {
    mb(B, 'paintFlat', w + 0.08, tp, 0.1, frame, 0, 2.94, -0.11,
      { tint: new THREE.Color().setScalar(rng.range(0.15, 0.3)), worldUV: false });
  }
  // steel angle lintel across the opening
  mb(B, 'paintFlat', w + 0.34, 0.17, 0.13, frame, 0, headRel - 0.17, -0.03,
    { tint: new THREE.Color(0.17, 0.17, 0.16), worldUV: false });

  // ---- roll-gate coil box even when the gate is up ------------------------
  if (st.hood) {
    mb(B, 'paintFlat', w + 0.12, 0.3, 0.3, frame, 0, 2.62, -0.07,
      { tint: new THREE.Color(0.31, 0.31, 0.32), worldUV: false });
  }

  // ---- big internally-lit cabinet sign, or a metal cornice on the band ----
  if (st.cabinet) {
    const ch = rng.range(0.88, 1.08);
    mb(B, 'paintFlat', w + 0.26, ch, 0.19, frame, 0, 2.9, 0.12,
      { tint: new THREE.Color(0.11, 0.105, 0.1), worldUV: false });
    signQuad(ctx, frame, 0, 2.93, 0.315, w + 0.2, ch - 0.06, st.cabinetSign);
  } else if (rng.bool(0.45)) {
    mb(B, 'paintFlat', w + 0.34, 0.13, 0.2, frame, 0, 3.79, 0.02,
      { tint: new THREE.Color(0.24, 0.23, 0.21), worldUV: false });
    mb(B, 'paintFlat', w + 0.4, 0.07, 0.28, frame, 0, 3.9, 0.02,
      { tint: new THREE.Color(0.29, 0.28, 0.26), worldUV: false });
  }
  // ---- secondary sub-tenant strip beneath the main band -------------------
  // sign atlas cells are 4:1 — a 6 m x 0.24 m quad smears the lettering into
  // an unreadable scribble, so the plate keeps a sane aspect and the rest of
  // the strip is plain painted metal
  if (st.substrip && st.awningIndex < 0 && !st.hood && !st.cabinet) {
    mb(B, 'paintFlat', w + 0.1, 0.34, 0.12, frame, 0, 2.62, 0.03,
      { tint: new THREE.Color(0.13, 0.125, 0.12), worldUV: false });
    const sw = clamp(w * 0.45, 1.1, 2.3);
    signQuad(ctx, frame, rng.range(-w / 2 + sw / 2 + 0.1, w / 2 - sw / 2 - 0.1), 2.655, 0.095,
      sw, sw / 7.5, st.substripSign);
  }
  // ---- pier-mounted poster case (landscape plate on a pale field) ---------
  if (rng.bool(0.24)) {
    const px = (rng.bool() ? 1 : -1) * (w / 2 + clamp(pier * 0.45, 0.1, 0.22));
    mb(B, 'paintFlat', 0.42, 0.86, 0.07, frame, px, 1.02, 0.02,
      { tint: new THREE.Color(0.18, 0.18, 0.185), worldUV: false });
    mb(B, 'paintFlat', 0.34, 0.74, 0.02, frame, px, 1.08, 0.055,
      { tint: new THREE.Color(0.72, 0.70, 0.65), worldUV: false });
    signQuad(ctx, frame, px, 1.62, 0.07, 0.3, 0.04, rng.int(0, ctx.extra.signCount - 1));
  }
  // ---- blade sign on the pier --------------------------------------------
  if (st.blade) {
    const px = (rng.bool() ? 1 : -1) * (w / 2 + clamp(pier * 0.5, 0.12, 0.24));
    if (rng.bool(0.68)) {
      bladeSign(ctx, frame, px, rng.range(2.95, 3.2),
        { proj: rng.range(0.75, 1.1), faceH: rng.range(0.5, 0.78), index: st.bladeSign });
    } else {
      bladeSign(ctx, frame, px, rng.range(3.05, 3.3),
        { proj: rng.range(0.62, 0.82), faceH: rng.range(1.6, 2.4), index: st.bladeSign, thick: 0.14 });
    }
  }
  // ---- canvas awning (own geometry; kit's projects into the wall) ---------
  if (st.awningIndex >= 0 && !st.hood) {
    // clear opening minus 0.10 each side: at w - 0.06 the fabric plus its side
    // gusset overhung the brick pier and cut into the neighbouring bay
    awning(ctx, frame, 0, st.cabinet ? 2.84 : 2.94, {
      w: Math.min(w - 0.20, 6.4), proj: st.awnProj, drop: st.awnDrop, index: st.awningIndex,
    });
  }
  // ---- sidewalk dressing (bodega) ----------------------------------------
  if (st.dressing) {
    B.addInstance('mixeduse:rack', frame.clone().multiply(tmat(rng.range(-w / 3, w / 3), 0, 0.66)),
      new THREE.Color(0.32, 0.3, 0.28));
    for (let i = 0; i < rng.int(1, 2); i++) {
      B.addInstance('mixeduse:crate',
        frame.clone().multiply(tmat(rng.range(-w / 2 + 0.4, w / 2 - 0.4), 0, rng.range(0.45, 1.0), rng.range(0, 1.2))),
        new THREE.Color(rng.weighted([[0x2d5a3a, 3], [0x8a3a2a, 2], [0x2a3f6a, 2], [0x6b6b6b, 1]])));
    }
  }
}

// ===========================================================================
// GROUND-FLOOR FRONTAGE SUBDIVISION (doc §1.2)
// ===========================================================================
function groundLayout(rng, width, resOpenW, mirror) {
  const pE = rng.range(0.4, 0.68);
  const pier = rng.range(0.26, 0.44);
  const inner = width - 2 * pE;
  const target = rng.weighted([[6.4, 44], [3.6, 20], [7.6, 20], [2.6, 8], [8.4, 8]]);
  let nT = clamp(Math.round((inner - resOpenW) / target), 1, 5);
  let clear = 0;
  for (;;) {
    const gaps = (nT - 1 + (resOpenW > 0 ? 1 : 0)) * pier;
    clear = (inner - resOpenW - gaps) / nT;
    if (clear >= 2.6 || nT === 1) break;
    nT--;
  }
  const slots = [];
  for (let i = 0; i < nT; i++) slots.push({ kind: 'store', w: clear });
  if (resOpenW > 0) {
    const idx = rng.weighted([[0, 3], [nT, 3], [clamp(1, 0, nT), 2], [clamp(nT - 1, 0, nT), 1]]);
    slots.splice(idx, 0, { kind: 'res', w: resOpenW });
  }
  if (mirror) slots.reverse();
  let x = -width / 2 + pE;
  for (const s of slots) { s.x = x + s.w / 2; x += s.w + pier; }
  return { slots, pE, pier, clear };
}

// ===========================================================================
// RESIDENTIAL ENTRANCE (doc §3.9) — narrow, dark, no sign band above
// ===========================================================================
function residentialEntry(ctx, rng, frame, x, openW, trimMat, y0) {
  const K = ctx.kit, B = ctx.batcher;
  const rise = rng.bool(0.4) ? 0.15 : 0;
  const doorW = clamp(openW - 0.24, 0.85, 1.4);
  const doorH = rng.range(2.4, 2.6);
  if (rise > 0) {
    mb(B, trimMat, openW + 0.34, rise + 0.2, 0.62, frame, x, y0 - 0.2, 0.31,
      { tileUV: true, grime: 0.45 });
  }
  K.door({ w: doorW, h: doorH, transom: true }, frame.clone().multiply(tmat(x, y0 + rise, 0)), {
    tint: new THREE.Color(rng.weighted([[0x2b2f33, 4], [0x22301f, 2], [0x3a2620, 2], [0x494150, 1]])),
  });
  if (rng.bool(0.45)) {
    for (const s of [-1, 1]) {
      mb(B, trimMat, 0.16, y0 + rise + doorH + 0.24, 0.09, frame,
        x + s * (openW / 2 - 0.06), 0, 0.02, { tileUV: true, grime: 0.3 });
    }
    mb(B, trimMat, openW + 0.2, 0.2, 0.11, frame, x, y0 + rise + doorH + 0.04, 0.02, { tileUV: true });
  }
  mb(B, 'aluminum', 0.15, 0.32, 0.05, frame, x + (openW / 2 + 0.1), 1.36, 0.03,
    { tint: new THREE.Color(0.5, 0.5, 0.52), worldUV: false });
  if (rng.bool(0.55)) {
    B.addInstance('mixeduse:standpipe',
      frame.clone().multiply(tmat(x - (openW / 2 + 0.26), y0, 0.14)),
      new THREE.Color(0.5, 0.09, 0.07));
  }
}

// ===========================================================================
// MAIN
// ===========================================================================
export function generate(ctx, lot, rng) {
  const K = ctx.kit, B = ctx.batcher;
  ensureAdMaterial(ctx);
  ensureParts(B);

  const W = Math.max(6.4, lot.width);
  const D = Math.max(12, lot.depth);
  const mirror = !!lot.mirror;

  // ---- corner condition ---------------------------------------------------
  let corner = (lot.corner | 0);
  if (!corner && lot.district === 'showcase' && (rng.seed % 3) === 0) corner = -1;
  const isCorner = corner !== 0;
  const cw = isCorner ? clamp(rng.range(1.8, 2.5) * (W < 9 ? 0.8 : 1), 1.35, 2.6) : 0;
  const sb = cw / Math.SQRT2;                      // setback along each facade
  const frontW = W - (isCorner ? sb : 0);
  const frontCx = isCorner ? -corner * sb / 2 : 0;
  const frontFrame = at(lot.frame, frontCx, 0, 0);
  const chamFrame = isCorner
    ? at(lot.frame, corner * (W / 2 - sb / 2), 0, -sb / 2, corner * Math.PI / 4) : null;
  const sideLen = D - sb;
  const sideFrame = isCorner
    ? at(lot.frame, corner * (W / 2), 0, -(sb + D) / 2, corner * Math.PI / 2) : null;
  const sxOf = (u) => corner * (u * sideLen - sideLen / 2);   // u=0 at the corner

  // ---- massing ------------------------------------------------------------
  const stories = clamp(lot.stories || rng.weighted([[3, 20], [4, 26], [5, 22], [6, 12], [2, 5]]), 2, 7);
  const floorH = rng.range(2.95, 3.25);
  const sfCornY = rng.range(4.26, 4.46);           // storefront entablature base
  const sfCornH = rng.range(0.26, 0.36);
  const groundH = sfCornY + sfCornH + rng.range(0.12, 0.44);
  const hd = rng.range(3.42, 3.62);                // storefront opening head
  const retailY = 0.14;                            // sidewalk surface
  const resHeadY = retailY + 2.98;

  const floorYs = [];
  for (let f = 1; f < stories; f++) floorYs.push(groundH + (f - 1) * floorH);
  const sillOff = rng.range(0.72, 0.95);
  const winHBase = rng.range(1.5, 1.66);
  const winHs = floorYs.map((_, i) => {
    let h = winHBase;
    if (i === 0) h += rng.range(0.14, 0.3);
    if (i === floorYs.length - 1 && floorYs.length > 1) h -= rng.range(0.08, 0.18);
    return q05(h);
  });
  const topHead = floorYs[floorYs.length - 1] + sillOff + winHs[winHs.length - 1];
  const H = topHead + rng.range(0.24, 0.52);       // top of brick wall / roof deck

  // ---- materials ----------------------------------------------------------
  const matName = rng.weighted([
    ['brickRed', 5], ['brickOrange', 4], ['brickTan', 3], ['brickBrown', 2],
    ['brickPaintedCream', 2], ['brickPaintedGray', 1], ['brickPaintedRed', 1],
  ]);
  const tint = facadeTint(rng);
  const commonTint = tint.clone().multiplyScalar(0.95);
  commonTint.r = Math.min(1, commonTint.r * 1.06);
  commonTint.b *= 0.93;
  const trimMat = rng.weighted([['limestone', 5], ['concrete', 2], ['terracotta', 2], ['brownstoneDark', 1]]);
  const cornTint = new THREE.Color(rng.weighted([
    [0x8a8072, 3], [0x4a4438, 2], [0x33392f, 2], [0x5c7a68, 2], [0x6e3c30, 2], [0x2b2825, 1],
  ]));
  const lintelKind = rng.weighted([['stone', 5], ['hood', 3], ['arch', 2]]);
  const cap = rng.weighted([['cornice', 34], ['coping', 30], ['corbel', 22], ['deco', 14]]);
  const wallT = 0.34;

  // ---- upper-floor bay rhythm (doc §2.2) ---------------------------------
  const rhythm = rng.weighted([['normal', 62], ['wide', 16], ['narrow', 12], ['normal2', 10]]);
  const cToC = rhythm === 'wide' ? rng.range(3.05, 3.35)
    : rhythm === 'narrow' ? rng.range(1.85, 1.96) : rng.range(2.29, 2.52);
  const winW = q05(rhythm === 'wide' ? rng.range(1.05, 1.2)
    : rhythm === 'narrow' ? rng.range(0.82, 0.9) : rng.range(0.95, 1.07));
  const endPier = rng.range(0.5, 0.9);
  const layoutBays = (span, ep) => {
    const usable = Math.max(winW + 0.4, span - 2 * ep);
    let n = Math.max(1, Math.round(usable / cToC) + 1);
    if (n > 1 && usable / (n - 1) > cToC * 1.14) n++;
    while (n > 2 && usable / (n - 1) < winW + 0.62) n--;
    const step = n > 1 ? usable / (n - 1) : 0;
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(n === 1 ? 0 : -usable / 2 + step * i);
    return { xs, step };
  };
  const front = layoutBays(frontW, endPier);
  const style = rng.weighted([['dh1', 5], ['dh2', 3]]);
  // Upper-sash glass. The shared 'glass' material is MeshPhysicalMaterial with
  // a real diffuse albedo, so a 0.5-lightness tint blows the sash out to a
  // solid white rectangle in sun. Real double-hung glass from the street reads
  // 0.10-0.19: the room tone behind it plus a Fresnel sky sheen.
  const glassTint = new THREE.Color().setHSL(0.56, 0.14, rng.range(0.10, 0.19));
  // kit's default roller shade tone is 0.66-0.72 — with one on 40% of openings
  // every sash filled with pale cream and the whole facade read as blank white
  // rectangles. Dark room tones + a shade on ~1 in 4 instead.
  const ROOMS = [0x14161a, 0x101014, 0x1a1512, 0x0e1210, 0x241c14, 0x12161c, 0x0f0f12];
  const room = () => new THREE.Color(rng.pick(ROOMS));
  const acTint = new THREE.Color(0.60, 0.59, 0.57);
  const acP = rng.range(0.1, 0.26);
  const litP = rng.range(0.24, 0.42);

  // ---- storefront frontage ------------------------------------------------
  const resOnSide = isCorner && rng.bool(0.62);
  const resOpenW = resOnSide ? 0 : rng.range(1.2, 1.62);
  const gl = groundLayout(rng, frontW, resOpenW, mirror);
  const usedSigns = new Set();

  // ==== FRONT FACADE ======================================================
  const rows = [{ y0: 0, y1: hd, openings: [] }];
  for (const s of gl.slots) {
    if (s.kind === 'store') rows[0].openings.push({ x: s.x, w: s.w + 0.1 });
    else rows[0].openings.push({ x: s.x, w: s.w, y0: 0, y1: resHeadY });
  }
  floorYs.forEach((fy, i) => {
    const y = fy + sillOff;
    rows.push({ y0: y, y1: y + winHs[i], openings: front.xs.map((x) => ({ x, w: winW })) });
  });
  punchedWall(ctx, frontFrame, {
    width: frontW, height: H, depth: wallT, mat: matName, tint, rows,
    grime: 0.3, aoTop: H,
  });

  // choose the fire escape BEFORE the tenants, so the bay under the stowed
  // ladder can drop its projecting signage
  let frontFE = null;
  if (!isCorner && stories >= 4 && front.xs.length >= 2 && rng.bool(0.6)) {
    frontFE = pickFireEscapeBay(front.xs, winW,
      gl.slots.filter((s) => s.kind === 'store')
        .map((s) => [s.x - s.w / 2 - 0.35, s.x + s.w / 2 + 0.35]), rng);
  }
  const underLadder = (s) => frontFE
    && s.x + s.w / 2 > frontFE.span[0] && s.x - s.w / 2 < frontFE.span[1];

  for (const s of gl.slots) {
    if (s.kind === 'res') {
      residentialEntry(ctx, rng, frontFrame, s.x, s.w, trimMat, retailY);
      continue;
    }
    const f = at(lot.frame, frontCx + s.x, retailY, 0);
    const st = tenantStyle(rng, ctx.extra, usedSigns);
    if (underLadder(s)) { st.cabinet = false; st.substrip = false; st.blade = false; }
    storefront(ctx, rng, f, s.w, hd - retailY, st, { pier: gl.pier });
    if (s.w > 8.5) {
      B.addInstance(sfColumn(B, hd - retailY - 0.1), at(lot.frame, frontCx + s.x, retailY, -0.18));
    }
  }

  // ---- continuous storefront entablature (the key horizontal, doc §2.1) ---
  const entab = (frm, len) => {
    mb(B, 'paintFlat', len, sfCornH * 0.7, 0.2, frm, 0, sfCornY, 0.02,
      { tint: cornTint, worldUV: false });
    mb(B, 'paintFlat', len + 0.08, sfCornH * 0.42, 0.34, frm, 0, sfCornY + sfCornH * 0.66, 0.02,
      { tint: cornTint.clone().multiplyScalar(1.14), worldUV: false });
  };
  entab(frontFrame, frontW + (isCorner ? 0.06 : 0.2));

  // ---- upper windows + trim + AC ------------------------------------------
  const upperTrim = (frm, x, y, wh, plain) => {
    K.sill(winW, frm.clone().multiply(tmat(x, y, 0)), { mat: plain && rng.bool(0.5) ? 'concrete' : trimMat });
    const ly = y + wh + 0.02;
    if (plain) {
      K.lintel(winW, frm.clone().multiply(tmat(x, ly, 0)), { mat: 'concrete', style: 'flat' });
    } else if (lintelKind === 'hood') {
      K.lintel(winW, frm.clone().multiply(tmat(x, ly, 0)), { mat: 'cornicePaint', style: 'peaked', tint: cornTint });
    } else if (lintelKind === 'arch') {
      K.lintel(winW, frm.clone().multiply(tmat(x, ly, 0)), { mat: trimMat, style: 'arch' });
    } else {
      K.lintel(winW, frm.clone().multiply(tmat(x, ly, 0)), { mat: trimMat, style: rng.bool(0.14) ? 'peaked' : 'flat' });
    }
  };
  floorYs.forEach((fy, i) => {
    const y = fy + sillOff;
    const wh = winHs[i];
    for (const x of front.xs) {
      K.window({ w: winW, h: wh, style }, frontFrame.clone().multiply(tmat(x, y, 0)), {
        lit: rng.bool(litP), tint, glassTint, roomTone: room(), shade: rng.bool(0.26),
      });
      upperTrim(frontFrame, x, y, wh, false);
      if (rng.bool(acP)) {
        K.acUnit(frontFrame.clone().multiply(tmat(x + rng.range(-0.04, 0.04), y + 0.02, 0.06)), { tint: acTint });
      }
    }
  });

  // ---- belt course above the 2nd floor (doc §2.4, presence 0.40) ----------
  if (floorYs.length >= 2 && rng.bool(0.45)) {
    const by = floorYs[0] + sillOff + winHs[0] + 0.24;
    K.cornice(frontW + 0.1, frontFrame.clone().multiply(tmat(0, by, 0.02)),
      { profile: 'band', tint: cornTint, brackets: false });
    if (isCorner) {
      K.cornice(cw + 0.06, chamFrame.clone().multiply(tmat(0, by, 0.02)),
        { profile: 'band', tint: cornTint, brackets: false });
      K.cornice(sideLen + 0.06, sideFrame.clone().multiply(tmat(0, by, 0.02)),
        { profile: 'band', tint: cornTint, brackets: false });
    }
  }
  // ---- 2nd-floor commercial signage (doc §2.3) ---------------------------
  if (floorYs.length >= 2 && rng.bool(0.3)) {
    const sy = floorYs[0] + sillOff + winHs[0] + 0.12;
    // 0.62 m plate, aspect held near the atlas cell's 4:1 so a long string
    // still clears the 0.20 m cap-height floor instead of smearing
    const sh2 = 0.62;
    const sw2 = Math.min(frontW * 0.42, sh2 * 4.4);
    const sx2 = rng.range(-frontW / 4, frontW / 4);
    mb(B, 'paintFlat', sw2 + 0.1, sh2 + 0.1, 0.1, frontFrame, sx2, sy, 0.06,
      { tint: new THREE.Color(0.12, 0.115, 0.11), worldUV: false });
    signQuad(ctx, frontFrame, sx2, sy + 0.05, 0.115, sw2, sh2, rng.int(0, ctx.extra.signCount - 1));
  }

  // ---- fire escape (bay chosen above; z = 0.09 so the stowed ladder passes
  // clear in FRONT of the sign box and the entablature instead of through them)
  if (frontFE) {
    K.fireEscape({
      width: frontFE.feW, floors: stories - 1, floorH, firstY: floorYs[0] + sillOff - 0.14,
    }, frontFrame.clone().multiply(tmat(frontFE.cx, 0, 0.09)), {
      tint: new THREE.Color(rng.weighted([[0x191817, 4], [0x2f3a30, 2], [0x4a3a34, 1.5], [0x6b6660, 1]])),   // black, dark green, maroon, galvanized
    });
  }

  // ==== CHAMFERED CORNER BAY (doc 09 §2a / §2c) ===========================
  if (isCorner) {
    const chamMode = rng.weighted([['store', 5], ['door', 3], ['blind', 2]]);
    const cWinW = q05(clamp(cw - 0.9, 0.6, 0.95));
    const cRows = [];
    const cDoorW = Math.min(1.35, cw - 0.5);
    if (chamMode === 'store') {
      cRows.push({ y0: 0, y1: hd, openings: [{ x: 0, w: cw - 0.46 }] });
    } else if (chamMode === 'door') {
      cRows.push({ y0: 0, y1: hd, openings: [{ x: 0, w: cDoorW, y0: 0, y1: resHeadY }] });
    }
    floorYs.forEach((fy, i) => {
      const y = fy + sillOff;
      cRows.push({ y0: y, y1: y + winHs[i], openings: [{ x: 0, w: cWinW }] });
    });
    punchedWall(ctx, chamFrame, {
      width: cw, height: H, depth: wallT, mat: matName, tint, rows: cRows,
      grime: 0.3, aoTop: H,
    });
    if (chamMode === 'store') {
      const st = tenantStyle(rng, ctx.extra, usedSigns);
      const cClear = cw - 0.56;
      const cf = chamFrame.clone().multiply(tmat(0, retailY, 0));
      st.awningIndex = -1;                       // no awning on the chamfer
      storefront(ctx, rng, cf, cClear, hd - retailY, st, { interiorDepth: 1.9, pier: 0.24 });
      if (rng.bool(0.4)) {
        bladeSign(ctx, chamFrame, 0, rng.range(4.0, 4.7),
          { proj: rng.range(0.65, 0.9), faceH: rng.range(1.8, 2.9), index: st.cabinetSign, thick: 0.16 });
      }
    } else if (chamMode === 'door') {
      residentialEntry(ctx, rng, chamFrame, 0, cDoorW, trimMat, retailY);
    } else {
      // blind chamfer: a painted panel, NOT a 4:1 sign cell squeezed square
      const aw2 = cw - 0.6;
      wallAd(B, chamFrame.clone().multiply(tmat(0, 0, 0.03)), 0, 1.35, aw2, aw2,
        rng.bool(0.55) ? 2 : 0);
    }
    entab(chamFrame, cw + 0.06);
    floorYs.forEach((fy, i) => {
      const y = fy + sillOff;
      K.window({ w: cWinW, h: winHs[i], style }, chamFrame.clone().multiply(tmat(0, y, 0)), {
        lit: rng.bool(litP), tint, glassTint, roomTone: room(), shade: rng.bool(0.26),
      });
      K.sill(cWinW, chamFrame.clone().multiply(tmat(0, y, 0)), { mat: trimMat });
      K.lintel(cWinW, chamFrame.clone().multiply(tmat(0, y + winHs[i] + 0.02, 0)), {
        mat: lintelKind === 'hood' ? 'cornicePaint' : trimMat,
        style: lintelKind === 'hood' ? 'peaked' : 'flat',
        tint: lintelKind === 'hood' ? cornTint : null,
      });
    });
  }

  // ==== SIDE-STREET FACADE (exposed, doc 09 §4) ===========================
  if (isCorner) {
    const side = layoutBays(sideLen, 0.75);
    const wrapClear = clamp(rng.range(2.8, 6.1), 2.6, sideLen * 0.42);
    const u0 = 0.55 / sideLen;
    const wrapU1 = u0 + wrapClear / sideLen;
    const wrapCx = sxOf((u0 + wrapU1) / 2);
    const resSideW = resOnSide ? rng.range(1.2, 1.62) : 0;
    const gOps = [{ x: wrapCx, w: wrapClear + 0.1 }];
    let resSideX = null;
    if (resOnSide) {
      resSideX = sxOf(wrapU1 + (0.34 + resSideW / 2) / sideLen);
      gOps.push({ x: resSideX, w: resSideW, y0: 0, y1: resHeadY });
    }
    const backU = wrapU1 + (resOnSide ? (0.72 + resSideW) : 0.5) / sideLen;
    const svcU = backU + 0.06;
    const winUs = [];
    if (svcU < 0.88) {
      gOps.push({ x: sxOf(svcU), w: 1.15, y0: 0, y1: retailY + 2.35 });
      for (let u = svcU + 0.15; u < 0.92; u += 0.16) {
        if (rng.bool(0.6)) { winUs.push(u); gOps.push({ x: sxOf(u), w: 0.8, y0: 1.25, y1: 2.45 }); }
      }
    }
    gOps.sort((a, b) => a.x - b.x);
    const sRows = [{ y0: 0, y1: hd, openings: gOps }];
    floorYs.forEach((fy, i) => {
      const y = fy + sillOff;
      sRows.push({ y0: y, y1: y + winHs[i], openings: side.xs.map((x) => ({ x, w: winW })) });
    });
    punchedWall(ctx, sideFrame, {
      width: sideLen, height: H, depth: wallT, mat: matName, tint: commonTint, rows: sRows,
      grime: 0.32, aoTop: H,
    });
    const sideFE = (stories >= 3 && side.xs.length >= 3 && rng.bool(0.86))
      ? pickFireEscapeBay(side.xs, winW, [[
        Math.min(wrapCx - wrapClear / 2, wrapCx + wrapClear / 2) - 0.4,
        Math.max(wrapCx - wrapClear / 2, wrapCx + wrapClear / 2) + 0.4,
      ]], rng)
      : null;
    {
      const st = tenantStyle(rng, ctx.extra, usedSigns);
      const sf = sideFrame.clone().multiply(tmat(wrapCx, retailY, 0));
      if (sideFE && wrapCx + wrapClear / 2 > sideFE.span[0] && wrapCx - wrapClear / 2 < sideFE.span[1]) {
        st.cabinet = false; st.substrip = false; st.blade = false;
      }
      storefront(ctx, rng, sf, wrapClear, hd - retailY, st, { interiorDepth: 2.6, pier: 0.3 });
    }
    if (resOnSide) residentialEntry(ctx, rng, sideFrame, resSideX, resSideW, trimMat, retailY);
    if (svcU < 0.88) {
      mb(B, 'paintFlat', 1.05, 2.3, 0.08, sideFrame, sxOf(svcU), retailY, -0.1,
        { tint: new THREE.Color(0.17, 0.19, 0.17), worldUV: false });
      for (const u of winUs) {
        K.window({ w: 0.8, h: 1.2, style: 'dh1' }, sideFrame.clone().multiply(tmat(sxOf(u), 1.25, 0)),
          { tint: commonTint, glassTint, roomTone: room(), shade: false });
        K.sill(0.8, sideFrame.clone().multiply(tmat(sxOf(u), 1.25, 0)), { mat: 'concrete' });
      }
    }
    // entablature returns onto the side street then stops at a clean break
    const retLen = clamp(rng.range(3.0, sideLen), 2.6, sideLen);
    entab(sideFrame.clone().multiply(tmat(corner * (retLen / 2 - sideLen / 2), 0, 0)), retLen);
    // upper windows: same size, plainer trim, common brick
    floorYs.forEach((fy, i) => {
      const y = fy + sillOff;
      const wh = winHs[i];
      for (const x of side.xs) {
        K.window({ w: winW, h: wh, style }, sideFrame.clone().multiply(tmat(x, y, 0)), {
          lit: rng.bool(litP * 0.8), tint: commonTint, glassTint, roomTone: room(), shade: rng.bool(0.24),
        });
        upperTrim(sideFrame, x, y, wh, true);
        if (rng.bool(acP * 1.3)) K.acUnit(sideFrame.clone().multiply(tmat(x, y + 0.02, 0.06)), { tint: acTint });
      }
    });
    // fire escape: side street, preferring a bay clear of the wrapped
    // storefront's sign band (chosen above, before the tenant was dressed)
    if (sideFE) {
      K.fireEscape({
        width: sideFE.feW, floors: stories - 1, floorH,
        firstY: floorYs[0] + sillOff - 0.14,
      }, sideFrame.clone().multiply(tmat(sideFE.cx, 0, 0.09)), {
        tint: new THREE.Color(rng.weighted([[0x191817, 5], [0x27231e, 2]])),
      });
    }
    // painted wall sign on the side street (doc 09 §8, p=0.30)
    if (rng.bool(0.34)) {
      const aw = Math.min(sideLen * 0.45, 7.5);
      wallAd(B, sideFrame.clone().multiply(tmat(sxOf(rng.range(0.6, 0.82)), 0, 0.02)),
        0, groundH + 0.5, aw, aw * 0.5, rng.bool(0.6) ? 0 : 1);
    }
  }

  // ---- party walls (doc 09 §6) -------------------------------------------
  const partySides = isCorner ? [-corner] : [-1, 1];
  for (const ps of partySides) {
    mb(B, matName, wallT, H, D - 0.02,
      at(lot.frame, ps * (W / 2 - wallT / 2), 0, -D / 2), 0, 0, 0,
      { tint: commonTint, segY: Math.max(2, Math.ceil(H / 3)), grime: 0.22 });
    // flue pilaster + corbelled chimney cap
    for (let i = 0; i < rng.int(1, 2); i++) {
      const z = -D * rng.range(0.32, 0.85);
      const ch = H + parapetTop(rng) ;
      const fh = H + rng.range(0.9, 1.9);
      mb(B, matName, 0.1, fh, rng.range(0.5, 0.85), at(lot.frame, ps * (W / 2 + 0.05), 0, z), 0, 0, 0,
        { tint: commonTint, segY: Math.max(2, Math.ceil(H / 3)), grime: 0.2 });
      mb(B, 'concrete', 0.2, 0.1, 0.95, at(lot.frame, ps * (W / 2 + 0.02), 0, z), 0, fh, 0, {});
      void ch;
    }
    // ghost sign high on the wall — visible over the neighbour's roof
    if (rng.bool(0.42)) {
      const aw = Math.min(D * 0.55, 11), ah = aw * rng.range(0.55, 0.85);
      const ay = clamp(H - 1.4 - ah, groundH, Math.max(groundH, H - ah - 0.6));
      wallAd(B, at(lot.frame, ps * (W / 2 + 0.02), 0, -D * rng.range(0.35, 0.6), ps * Math.PI / 2),
        0, ay, aw, ah, rng.weighted([[0, 4], [1, 4], [2, 2]]));
    }
    // bricked-up lot-line windows near the street edge
    if (rng.bool(0.3)) {
      const lf = at(lot.frame, ps * (W / 2), 0, -D / 2, ps * Math.PI / 2);
      const lx = ps > 0 ? -(D / 2 - 1.15) : (D / 2 - 1.15);
      for (let i = 0; i < floorYs.length; i++) {
        if (!rng.bool(0.6)) continue;
        const y = floorYs[i] + sillOff + 0.15;
        mb(B, 'paintFlat', 0.62, 0.9, 0.06, lf, lx, y, -0.04,
          { tint: new THREE.Color(0.14, 0.14, 0.15), worldUV: false });
        mb(B, matName, 0.72, 0.1, 0.09, lf, lx, y - 0.1, 0.005, { tint: commonTint });
      }
    }
  }

  // ---- rear wall ---------------------------------------------------------
  {
    const rf = at(lot.frame, 0, 0, -D, Math.PI);
    const rRows = [];
    const nR = clamp(Math.round(W / 2.8), 2, 5);
    const rXs = [];
    for (let i = 0; i < nR; i++) rXs.push(-((W - 2.2) / 2) + ((W - 2.2) / Math.max(1, nR - 1)) * i);
    floorYs.forEach((fy, i) => {
      const y = fy + sillOff;
      const wh = winHs[i] - 0.1;
      rRows.push({ y0: y, y1: y + wh, openings: rXs.map((x) => ({ x, w: 0.85 })) });
      for (const x of rXs) {
        K.window({ w: 0.85, h: wh, style: 'dh1' }, rf.clone().multiply(tmat(x, y, 0)),
          { lit: rng.bool(litP), tint: commonTint, glassTint, roomTone: room(), shade: rng.bool(0.2) });
      }
    });
    punchedWall(ctx, rf, {
      width: W, height: H, depth: wallT, mat: matName, tint: commonTint, rows: rRows, grime: 0.2,
    });
  }

  // ==== CAP: parapet + cornice (doc §2.5) =================================
  const parapetH = cap === 'cornice' ? 0.42
    : cap === 'deco' ? rng.range(1.15, 1.55) : rng.range(0.82, 1.06);
  const copingMat = cap === 'deco' ? 'terracotta' : (rng.bool(0.7) ? 'limestone' : 'concrete');
  const copingTint = new THREE.Color().setScalar(rng.range(0.85, 1.0));

  const runs = [{ frame: frontFrame, len: frontW + (isCorner ? 0 : 0.12) }];
  if (isCorner) {
    runs.push({ frame: chamFrame, len: cw + 0.04 });
    runs.push({ frame: sideFrame, len: sideLen + 0.04 });
    runs.push({ frame: at(lot.frame, -corner * (W / 2), 0, -D / 2, -corner * Math.PI / 2), len: D });
  } else {
    for (const s of [-1, 1]) {
      runs.push({ frame: at(lot.frame, s * (W / 2), 0, -D / 2, s * Math.PI / 2), len: D });
    }
  }
  runs.push({ frame: at(lot.frame, 0, 0, -D, Math.PI), len: W });
  for (const r of runs) {
    parapetRun(B, r.frame, {
      cz: -wallT / 2 + 0.02, len: r.len, t: 0.26, y: H, h: parapetH,
      mat: matName, tint, coping: copingMat, copingTint,
    });
  }
  // roof deck (corner: cut back at the chamfer so it can't poke through)
  const deckMat = rng.bool(0.5) ? 'roofSilver' : 'roofBlack';
  if (isCorner) {
    mb(B, deckMat, Math.max(0.5, W - 0.3 - sb), 0.12, D - 0.3, lot.frame,
      -corner * sb / 2, H - 0.12, -D / 2, {});
    mb(B, deckMat, sb, 0.12, Math.max(0.5, D - 0.3 - sb), lot.frame,
      corner * (W / 2 - 0.15 - sb / 2), H - 0.12, (-D + 0.15 - sb) / 2, {});
  } else {
    mb(B, deckMat, W - 0.3, 0.12, D - 0.3, lot.frame, 0, H - 0.12, -D / 2, {});
  }

  if (cap === 'cornice') {
    K.cornice(frontW + (isCorner ? 0.06 : 0.2), frontFrame.clone().multiply(tmat(0, H - 0.08, 0.03)),
      { tint: cornTint });
    if (isCorner) {
      K.cornice(cw + 0.06, chamFrame.clone().multiply(tmat(0, H - 0.08, 0.03)), { tint: cornTint });
      const retFull = rng.bool(0.55);
      const rl = retFull ? sideLen + 0.06 : clamp(rng.range(2.8, 6.1), 2.6, sideLen);
      K.cornice(rl, sideFrame.clone().multiply(tmat(corner * (rl / 2 - sideLen / 2), H - 0.08, 0.03)),
        { tint: cornTint });
      if (!retFull) {
        mb(B, matName, 0.3, 0.58, 0.5, sideFrame,
          corner * (rl - sideLen / 2 + 0.15), H - 0.06, 0.24, { tint: commonTint });
      }
    }
  } else if (cap === 'corbel') {
    const corb = (frm, len, t2) => K.cornice(len, frm.clone().multiply(tmat(0, H - 0.38, 0.01)),
      { profile: 'corbel', mat: trimMat, tint: t2, brackets: false });
    corb(frontFrame, frontW + (isCorner ? 0.06 : 0.2), copingTint);
    if (isCorner) {
      corb(chamFrame, cw + 0.06, copingTint);
      corb(sideFrame, sideLen + 0.06, copingTint);
    }
  } else if (cap === 'deco') {
    const pw = frontW * rng.range(0.34, 0.5);
    const ph = rng.range(0.3, 0.58);
    mb(B, matName, pw, ph, 0.3, frontFrame, 0, H + parapetH + 0.04, -wallT / 2 + 0.02, { tint });
    mb(B, copingMat, pw + 0.06, 0.08, 0.4, frontFrame, 0, H + parapetH + 0.04 + ph, -wallT / 2 + 0.02, {});
    for (const s of [-1, 1]) {
      mb(B, matName, 0.42, 0.26, 0.3, frontFrame, s * (frontW / 2 - 0.24),
        H + parapetH + 0.04, -wallT / 2 + 0.02, { tint });
    }
  } else {
    mb(B, trimMat, frontW + 0.1, 0.14, wallT + 0.06, frontFrame, 0, H - 0.02, 0.01, { tileUV: true });
    if (isCorner) {
      mb(B, trimMat, cw + 0.06, 0.14, wallT + 0.06, chamFrame, 0, H - 0.02, 0.01, { tileUV: true });
      mb(B, trimMat, sideLen + 0.06, 0.14, wallT + 0.06, sideFrame, 0, H - 0.02, 0.01, { tileUV: true });
    }
  }
  // party-wall parapet stubs (project past the facade plane, rise above)
  for (const ps of partySides) {
    const sh = parapetH + rng.range(0.2, 0.42);
    const sf2 = at(lot.frame, ps * (W / 2 - 0.22), 0, 0.02);
    mb(B, matName, 0.44, sh, 0.34, sf2, 0, H, 0, { tint: commonTint });
    mb(B, copingMat, 0.5, 0.08, 0.4, sf2, 0, H + sh, 0, { tint: copingTint });
  }

  // ==== ROOF GEAR =========================================================
  roofGear(ctx, lot.frame, rng, {
    width: W, depth: D, height: H,
    bulkhead: true, vents: rng.int(2, 4), chimney: false,
    antenna: rng.bool(0.3), hvacCount: rng.int(1, 3),
    waterTower: stories >= 5 && rng.bool(0.55),
  });
  // roof billboard — a corner-roof staple
  if (rng.bool(isCorner ? 0.45 : 0.14)) {
    const bw = clamp(rng.range(6, 9.5), 4, W - 0.8);
    const bh = rng.range(2.8, 3.6);
    const y0 = H + parapetH + rng.range(0.5, 1.3);
    const bz = -rng.range(1.4, 3.0);
    const bf = at(lot.frame, rng.range(-0.08, 0.08) * W, 0, bz);
    const tilt = -rng.range(0.06, 0.14);
    const face = quad(bw, bh, adUv(rng.bool(0.7) ? 3 : 2));
    face.rotateX(tilt);
    B.addMerged('mixeduse:ad', face, bf.clone().multiply(tmat(0, y0, 0.1)), { worldUV: false });
    const bg = box(bw + 0.18, bh + 0.18, 0.14, { segY: 1 });
    bg.rotateX(tilt);
    B.addMerged('paintFlat', bg, bf.clone().multiply(tmat(0, y0 - 0.09, 0.01)),
      { worldUV: false, tint: new THREE.Color(0.2, 0.2, 0.21) });
    const nPost = bw > 7 ? 3 : 2;
    for (let i = 0; i < nPost; i++) {
      const px = -bw / 2 + (bw / (nPost - 1 || 1)) * i;
      mb(B, 'steelDark', 0.14, y0 - H + 0.7, 0.14, bf, px, H - 0.5, -0.14, { worldUV: false });
      mb(B, 'steelDark', 0.1, 1.2, 0.1, bf, px, y0 - 1.1, -0.6, { worldUV: false });
    }
    mb(B, 'steelDark', bw, 0.08, 0.55, bf, 0, y0 - 0.55, -0.22, { worldUV: false });
  }

  // ==== SIDEWALK CELLAR HATCH =============================================
  if (rng.bool(0.55)) {
    mb(B, 'steelDark', 1.2, 0.05, 1.45, lot.frame, rng.range(-W / 3, W / 3), 0.12, 1.5,
      { tint: new THREE.Color(0.34, 0.34, 0.33), worldUV: false });
  }

  return { height: H + parapetH };
}

// placeholder used only to keep the flue loop readable
function parapetTop() { return 0; }
