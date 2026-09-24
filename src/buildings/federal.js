// Federal / Greek Revival brick rowhouse, c.1820-1845 — Greenwich Village
// (Charlton-King-Vandam, Harrison St, Weehawken St) and Brooklyn Heights
// (Willow / Middagh / Cranberry).
//
// The type, in order of how much it gives itself away:
//   1. a PITCHED SLATE ROOF facing the street with 1-2 gabled DORMERS. No other
//      NYC rowhouse type has this; everything later is flat-roofed.
//   2. tall brick end-wall CHIMNEYS standing on the party walls at the ridge.
//   3. red brick in FLEMISH BOND (alternating headers), lime mortar, brownstone
//      or marble flat lintels and sills, 6/6 double-hung sash.
//   4. a dentilled wood cornice at the eave — modest, not the Italianate slab.
//   5. a paneled door with a TRANSOM and SIDELIGHTS between flat pilasters
//      carrying a small entablature, reached by a stone stoop with a slender
//      wrought-iron rail (no massive brownstone cheek walls).
//   6. a brownstone/granite basement storey with the parlour floor only
//      1-2 m above the walk.
//
// LOCAL SPACE: facade along X centred on 0, front wall plane z=0, -z into the
// building, y=0 sidewalk.
import * as THREE from 'three';
import { at, punchedWall, shellWalls, bayCenters } from './lib.js';
import { box, boxUV, quad, cylinder, compose, ensureColor, tmat } from '../geo.js';
import { makeCanvas } from '../textures.js';

export const TYPE = 'federal';

const q05 = (v) => Math.round(v * 20) / 20;

// ---------------------------------------------------------------------------
// TRUE FLEMISH BOND. The shared brickTexture() only supports header COURSES
// (every 4th row), which reads as banding, not as the header chequer that
// defines 1820-45 New York brickwork — so this type draws its own bond.
// Every course alternates stretcher (0.202 m face) / header (0.098 m face);
// alternate courses shift by half a repeat so the headers centre on the
// stretchers below. Tile = 1.92 m = exactly 6 repeats x 28 courses.
// ---------------------------------------------------------------------------
function flemishBrick({ seed = 1, size = 1024 } = {}) {
  const tileMeters = 1.92;
  const px = size / tileMeters;
  let s = (seed * 2654435761) >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), bg = b.getContext('2d');
  g.fillStyle = '#bdb4a4'; g.fillRect(0, 0, size, size);          // lime mortar
  bg.fillStyle = '#4e4e4e'; bg.fillRect(0, 0, size, size);
  const J = 0.010 * px;
  const CH = size / 28;                                            // course pitch
  const BH = CH - J;
  const REP = size / 6;                                            // 0.32 m
  const STR = 0.202 * px, HDR = 0.098 * px;
  for (let row = 0; row < 28; row++) {
    const y = row * CH;
    const off = (row % 2) * REP * 0.5;
    for (let k = -1; k <= 6; k++) {
      const x0 = k * REP + off;
      // stretcher then header
      const units = [[x0, STR, false], [x0 + STR + J, HDR, true]];
      for (const [bx, bw, isHdr] of units) {
        let fill;
        // Headers are SYSTEMATICALLY darker and greyer — that regularity is
        // what makes Flemish bond read as a chequer at 30 m rather than as
        // random range brick.
        if (isHdr) {
          fill = r() < 0.62
            ? `hsl(${202 + r() * 18},${9 + r() * 8}%,${25 + r() * 6}%)`    // glazed
            : `hsl(${10 + r() * 8},${20 + r() * 10}%,${27 + r() * 5}%)`;   // burnt
        } else if (r() < 0.04) {
          fill = `hsl(${8 + r() * 8},${16 + r() * 8}%,${26 + r() * 6}%)`;
        } else {
          fill = `hsl(${9 + r() * 9},${36 + r() * 14}%,${36 + r() * 10}%)`;
        }
        g.fillStyle = fill;
        g.fillRect(bx, y, bw, BH);
        g.fillStyle = 'rgba(255,255,255,0.11)'; g.fillRect(bx, y, bw, BH * 0.16);
        g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(bx, y + BH * 0.84, bw, BH * 0.16);
        if (r() < 0.34) {
          g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.07})`;
          g.fillRect(bx + r() * bw * 0.55, y + r() * BH * 0.5, bw * (0.2 + r() * 0.35), BH * (0.3 + r() * 0.4));
        }
        bg.fillStyle = `hsl(0,0%,${66 + r() * 14}%)`;
        bg.fillRect(bx, y, bw, BH);
      }
    }
  }
  // soft grime / lime-wash blotching so the tile repeat isn't readable
  for (let i = 0; i < 42; i++) {
    g.fillStyle = `rgba(${r() < 0.55 ? '48,38,30' : '210,200,182'},${0.025 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, size * (0.04 + r() * 0.16), size * (0.03 + r() * 0.12), r() * 3, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 7000; i++) {
    const v = 90 + Math.floor(r() * 110);
    g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`;
    g.fillRect(r() * size, r() * size, 1.3, 1.3);
  }
  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.userData.tileMeters = tileMeters;
    return t;
  };
  return { map: mk(c, true), bumpMap: mk(b, false), tileMeters };
}

// ---------------------------------------------------------------------------
// SLATE ROOF. Courses of 0.32 m slates with a 0.145 m exposure, half-lap
// staggered, a hard butt shadow per course and a narrow colour range with the
// occasional purple / sea-green slate. Drawn in plan units: the world-UV
// projection on a 38 deg slope stretches this to ~0.185 m on-slope exposure.
// ---------------------------------------------------------------------------
function slateTexture({ seed = 1, size = 1024 } = {}) {
  const tileMeters = 1.6;
  let st = (seed * 2654435761) >>> 0;
  const r = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const b = makeCanvas(size, size), bg = b.getContext('2d');
  g.fillStyle = '#22262a'; g.fillRect(0, 0, size, size);
  bg.fillStyle = '#8a8a8a'; bg.fillRect(0, 0, size, size);
  const ROWS = 11, CH = size / ROWS;
  const COLS = 5, CW = size / COLS;
  for (let row = 0; row < ROWS; row++) {
    const y = row * CH;
    const off = (row % 2) * CW * 0.5;
    for (let k = -1; k <= COLS; k++) {
      const x = k * CW + off;
      let h, sat, l;
      const pick = r();
      if (pick < 0.045) { h = 268; sat = 7; l = 27 + r() * 4; }       // purple slate
      else if (pick < 0.08) { h = 138; sat = 6; l = 28 + r() * 4; }   // sea green
      else { h = 205 + r() * 14; sat = 4 + r() * 5; l = 26 + r() * 6; }
      g.fillStyle = `hsl(${h.toFixed(0)},${sat.toFixed(0)}%,${l.toFixed(1)}%)`;
      g.fillRect(x, y, CW - 1.5, CH * 1.9);
      // face shading: slightly lighter at the head, darker at the butt
      const gr = g.createLinearGradient(0, y, 0, y + CH * 1.9);
      gr.addColorStop(0, 'rgba(255,255,255,0.055)');
      gr.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = gr; g.fillRect(x, y, CW - 1.5, CH * 1.9);
      bg.fillStyle = `hsl(0,0%,${70 + r() * 16}%)`;
      bg.fillRect(x, y, CW - 1.5, CH * 1.9);
    }
    // butt shadow line + a slight riven lip catching the light
    g.fillStyle = 'rgba(0,0,0,0.52)'; g.fillRect(0, y + CH - 3.5, size, 3.5);
    g.fillStyle = 'rgba(210,218,224,0.10)'; g.fillRect(0, y + CH, size, 1.8);
    bg.fillStyle = '#2c2c2c'; bg.fillRect(0, y + CH - 3.5, size, 3.5);
    // vertical joints
    for (let k = -1; k <= COLS; k++) {
      const x = k * CW + off;
      g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x + CW - 1.8, y, 1.8, CH);
      bg.fillStyle = '#3a3a3a'; bg.fillRect(x + CW - 1.8, y, 1.8, CH);
    }
  }
  // damp / lichen blotching so the tile repeat doesn't read
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${r() < 0.6 ? '150,160,150' : '20,24,28'},${0.02 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, size * (0.04 + r() * 0.14), size * (0.02 + r() * 0.07), r() * 3, 0, 7);
    g.fill();
  }
  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.userData.tileMeters = tileMeters;
    return t;
  };
  return { map: mk(c, true), bumpMap: mk(b, false), tileMeters };
}

function ensureMaterials(B) {
  if (B.M.has('federal:brick')) return;
  const b = flemishBrick({ seed: 9101 });
  const mb = new THREE.MeshStandardMaterial({
    vertexColors: true, map: b.map, bumpMap: b.bumpMap, bumpScale: 1.6,
    roughness: 0.94, envMapIntensity: 0.42,
  });
  mb.userData.tileMeters = b.tileMeters; mb.name = 'federal:brick';
  B.M.set('federal:brick', mb);

  const s = slateTexture({ seed: 9102 });
  const ms = new THREE.MeshStandardMaterial({
    vertexColors: true, map: s.map, bumpMap: s.bumpMap, bumpScale: 0.8,
    roughness: 0.82, metalness: 0.03, envMapIntensity: 0.38,
  });
  ms.userData.tileMeters = s.tileMeters; ms.name = 'federal:slate';
  B.M.set('federal:slate', ms);

  // Flat oil-painted joinery. The shared cornicePaint/doorPaint are too glossy
  // for a low sun — a whole cornice or door goes to pure white at golden hour.
  const mt = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.30,
  });
  mt.userData.tileMeters = 1; mt.name = 'federal:trim';
  B.M.set('federal:trim', mt);
  const md = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.74, metalness: 0.0, envMapIntensity: 0.28,
  });
  md.userData.tileMeters = 1; md.name = 'federal:door';
  B.M.set('federal:door', md);
}

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------
// One dentil block; the band is instanced along the cornice.
function dentilPart(B) {
  const id = 'federal:dentil';
  if (!B.hasPart(id)) B.definePart(id, box(0.065, 0.14, 0.13), 'federal:trim');
  return id;
}

// Six-panel Greek Revival door leaf (2 columns x 3 rows of raised panels).
function doorLeafPart(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `federal:leaf:${w}x${h}`;
  if (!B.hasPart(id)) {
    const items = [{ geom: box(w, h, 0.06), x: 0, y: 0, z: -0.03 }];
    const st = 0.13;                                    // stile / rail width
    const pw = (w - st * 3) / 2;
    const rows = [[st, h * 0.30], [st * 2 + h * 0.30, h * 0.30], [st * 3 + h * 0.60, h - st * 4 - h * 0.60]];
    for (const [py, ph] of rows) {
      if (ph <= 0.05) continue;
      for (const s of [-1, 1]) {
        items.push({ geom: box(pw, ph, 0.022), x: s * (pw + st) / 2, y: py, z: 0.011 });
        items.push({ geom: box(pw - 0.05, ph - 0.05, 0.012), x: s * (pw + st) / 2, y: py + 0.025, z: 0.028 });
      }
    }
    B.definePart(id, compose(items), 'federal:door');
  }
  return id;
}

// Slender wrought-iron stoop rail: raking handrail, thin balusters, a plain
// newel with a ball finial. Anchor y = walk, z = the bottom step nosing.
function stoopRailPart(B, rise, run) {
  rise = q05(rise); run = q05(run);
  const id = `federal:srail:${rise}x${run}`;
  if (!B.hasPart(id)) {
    const items = [];
    const ang = Math.atan2(rise, run);
    const slen = Math.hypot(rise, run);
    const hr = 0.90;
    // raking handrail: high at the door (z=0), descending out to the walk
    const g = box(0.034, slen + 0.12, 0.034);
    g.rotateX(Math.PI / 2 + ang);            // +Y -> (0, -sin a, cos a)
    items.push({ geom: g, x: 0, y: rise + hr, z: -0.03 });
    const n = Math.max(4, Math.round(slen / 0.27));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      items.push({ geom: box(0.016, hr + 0.05, 0.016), x: 0, y: rise * (1 - t), z: run * t });
    }
    // newel at the walk, plain post against the wall
    items.push({ geom: box(0.05, hr + 0.26, 0.05), x: 0, y: 0, z: run + 0.03 });
    items.push({ geom: new THREE.SphereGeometry(0.055, 8, 6), x: 0, y: hr + 0.28, z: run + 0.03 });
    items.push({ geom: box(0.045, rise + hr + 0.10, 0.045), x: 0, y: 0, z: -0.03 });
    B.definePart(id, compose(items), 'ironwork');
  }
  return id;
}

// Basement window guard: flat bar frame + vertical bars.
function guardPart(B, w, h) {
  w = q05(w + 0.14); h = q05(h + 0.10);
  const id = `federal:guard:${w}x${h}`;
  if (!B.hasPart(id)) {
    const items = [
      { geom: box(w, 0.03, 0.03), x: 0, y: h, z: 0.06 },
      { geom: box(w, 0.03, 0.03), x: 0, y: 0, z: 0.06 },
      { geom: box(0.03, h, 0.03), x: -w / 2, y: 0, z: 0.06 },
      { geom: box(0.03, h, 0.03), x: w / 2, y: 0, z: 0.06 },
    ];
    const n = Math.max(3, Math.round(w / 0.13));
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.016, h, 0.016), x: -w / 2 + (w / n) * i, y: 0, z: 0.06 });
    }
    B.definePart(id, compose(items), 'ironwork');
  }
  return id;
}

// Louvred blind. Anchor: x = hinge edge centre, y = opening bottom, z = face.
function shutterPart(B, w, h) {
  w = q05(w); h = q05(h);
  const id = `federal:shut:${w}x${h}`;
  if (!B.hasPart(id)) {
    const items = [
      { geom: box(w, h, 0.035), x: 0, y: 0, z: 0.018 },
      { geom: box(0.05, h, 0.045), x: -w / 2 + 0.025, y: 0, z: 0.022 },
      { geom: box(0.05, h, 0.045), x: w / 2 - 0.025, y: 0, z: 0.022 },
      { geom: box(w, 0.07, 0.045), x: 0, y: h * 0.48, z: 0.022 },
    ];
    for (let y = 0.06; y < h - 0.06; y += 0.055) {
      if (Math.abs(y - h * 0.5) < 0.06) continue;
      items.push({ geom: box(w - 0.09, 0.028, 0.03), x: 0, y, z: 0.038 });
    }
    B.definePart(id, compose(items), 'federal:trim');
  }
  return id;
}

// Tall party-wall chimney: brick stack, corbelled cap, two clay pots.
function chimneyPart(B, w, d, h) {
  w = q05(w); d = q05(d); h = q05(h);
  const id = `federal:chim:${w}x${d}x${h}`;
  if (!B.hasPart(id)) {
    const items = [];
    const g = box(w, h, d); boxUV(g, w, h, d, 2);
    items.push({ geom: g, x: 0, y: 0, z: 0 });
    const c1 = box(w + 0.10, 0.11, d + 0.10); boxUV(c1, w + 0.1, 0.11, d + 0.1, 2);
    items.push({ geom: c1, x: 0, y: h, z: 0 });
    const fl = box(w + 0.20, 0.05, d + 0.20); boxUV(fl, w + 0.2, 0.05, d + 0.2, 2);
    ensureColor(fl, new THREE.Color(0.42, 0.44, 0.44));
    items.push({ geom: fl, x: 0, y: 0.06, z: 0 });
    const c2 = box(w + 0.18, 0.09, d + 0.18); boxUV(c2, w + 0.18, 0.09, d + 0.18, 2);
    ensureColor(c2, new THREE.Color(0.86, 0.84, 0.80));
    items.push({ geom: c2, x: 0, y: h + 0.11, z: 0 });
    for (const s of [-1, 1]) {
      const p = cylinder(0.085, 0.095, 0.34, 8);
      ensureColor(p, new THREE.Color(0.72, 0.42, 0.28));
      items.push({ geom: p, x: 0, y: h + 0.20, z: s * d * 0.26 });
    }
    B.definePart(id, compose(items), 'federal:brick');
  }
  return id;
}

// ---- dormer -------------------------------------------------------------
// Dormer space: x centred, z=0 = the vertical front face, body runs into -z,
// y=0 = the main roof surface at that face (the part carries a 1.0 m skirt
// below so it buries into the slope).
const D_OP_W = 0.72, D_OP_H = 1.00, D_SILL = 0.24;
const D_JAMB = 0.17, D_EAVE = 1.34, D_DEPTH = 2.8, D_PITCH = 0.60;   // ~34 deg

function dormerBodyPart(B) {
  const id = 'federal:dorm:body';
  if (!B.hasPart(id)) {
    const wD = D_OP_W + D_JAMB * 2;                       // 1.06
    const skirt = 1.10;
    const items = [];
    // face: apron below the opening, jambs, head
    items.push({ geom: box(wD, D_SILL + skirt, 0.14), x: 0, y: -skirt, z: -0.07 });
    for (const s of [-1, 1]) {
      items.push({ geom: box(D_JAMB, D_OP_H, 0.14), x: s * (D_OP_W + D_JAMB) / 2, y: D_SILL, z: -0.07 });
    }
    items.push({ geom: box(wD, D_EAVE - D_SILL - D_OP_H, 0.14), x: 0, y: D_SILL + D_OP_H, z: -0.07 });
    // projecting sill
    items.push({ geom: box(D_OP_W + 0.20, 0.06, 0.12), x: 0, y: D_SILL - 0.06, z: 0.03 });
    // cheeks + back
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.12, D_EAVE + skirt, D_DEPTH), x: s * (wD / 2 - 0.06), y: -skirt, z: -D_DEPTH / 2 });
    }
    items.push({ geom: box(wD, D_EAVE + skirt, 0.10), x: 0, y: -skirt, z: -D_DEPTH + 0.05 });
    // gable tympanum above the eave line
    const rise = (wD / 2 + 0.12) * Math.tan(D_PITCH);
    const sh = new THREE.Shape();
    sh.moveTo(-wD / 2, 0); sh.lineTo(wD / 2, 0); sh.lineTo(0, rise); sh.closePath();
    const tri = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false });
    tri.translate(0, D_EAVE, -0.14);
    items.push({ geom: tri, x: 0, y: 0, z: 0 });
    // pedimented head: bed mould with cornice returns at the eave, plus the
    // raking cornice boards up the gable (the Village dormer signature)
    items.push({ geom: box(wD + 0.26, 0.075, 0.13), x: 0, y: D_EAVE - 0.075, z: 0.05 });
    items.push({ geom: box(wD + 0.26, 0.05, 0.16), x: 0, y: D_EAVE, z: 0.065 });
    const L2 = (wD / 2 + 0.15) / Math.cos(D_PITCH);
    for (const s of [-1, 1]) {
      const rb = box(L2, 0.09, 0.12);
      rb.translate(s * L2 / 2, 0, 0);
      rb.rotateZ(-s * D_PITCH);
      items.push({ geom: rb, x: 0, y: D_EAVE + rise - 0.05, z: 0.06 });
    }
    B.definePart(id, compose(items), 'federal:trim');
  }
  return id;
}

function dormerRoofPart(B) {
  const id = 'federal:dorm:roof';
  if (!B.hasPart(id)) {
    const wD = D_OP_W + D_JAMB * 2;
    const rise = (wD / 2 + 0.12) * Math.tan(D_PITCH);
    const L = (wD / 2 + 0.12) / Math.cos(D_PITCH);
    const items = [];
    for (const s of [-1, 1]) {
      const g = box(L, 0.075, D_DEPTH + 0.20);
      g.translate(s * L / 2, 0, 0);
      g.rotateZ(-s * D_PITCH);
      items.push({ geom: g, x: 0, y: D_EAVE + rise, z: -D_DEPTH / 2 + 0.08 });
    }
    const cap = box(0.11, 0.07, D_DEPTH + 0.22);
    items.push({ geom: cap, x: 0, y: D_EAVE + rise - 0.02, z: -D_DEPTH / 2 + 0.08 });
    B.definePart(id, compose(items), 'federal:slate');
  }
  return id;
}

// Triangular / polygonal prism running along X (a gable end on a party wall).
// pts are [z, y] pairs; the prism spans x in [xEdge - t, xEdge].
function prismAlongX(B, mat, frame, pts, t, xEdge, tint) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);          // shape-x -> +z, extrusion -> -x
  B.addMerged(mat, g, frame.clone().multiply(tmat(xEdge, 0, 0)), { tint });
}

// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMaterials(B);

  const W = lot.width;
  const side = lot.mirror ? -1 : 1;
  const commercial = !!lot.commercial;
  const floors = Math.max(2, Math.min(3, lot.stories || rng.weighted([[3, 72], [2, 28]])));
  const highStoop = !commercial && rng.bool(0.62);

  // The lot frame's z=0 is the PROPERTY LINE. A Village Federal house with a
  // high stoop stands back behind a sunken AREAWAY, so everything below is
  // built in the sub-frame F whose z=0 is the FACADE; the areaway occupies
  // F-space z in [0, AW] and drops to AR below the walk.
  const AW = (commercial || !highStoop) ? 0 : q05(rng.range(1.05, 1.45));
  const AR = -1.05;                                 // areaway floor
  const F = at(lot.frame, 0, 0, -AW);
  const D = Math.max(9, (lot.depth || 14) - AW);
  const parlorY = commercial ? 0.18
    : highStoop ? q05(rng.range(1.30, 1.62)) : q05(rng.range(0.68, 0.98));
  const baseTop = Math.max(0.30, parlorY - 0.16);

  // diminishing storey heights
  const fh = [];
  let h0 = rng.range(3.25, 3.55);
  for (let f = 0; f < floors; f++) { fh.push(h0); h0 = Math.max(2.55, h0 * rng.range(0.855, 0.905)); }
  const floorY = [];
  let yc = parlorY;
  for (let f = 0; f < floors; f++) { floorY.push(yc); yc += fh[f]; }
  const H = yc;                                   // top of the brick / eave line

  // ---- roof geometry ------------------------------------------------------
  const ang = rng.range(0.63, 0.70);              // 36 - 40 deg
  const RD = q05(rng.range(3.7, 4.1));            // horizontal run, eave -> ridge
  const eaveZ = 0.46;                              // slate overhangs the cornice
  const eaveY = H + 0.17;
  const rise = (RD + eaveZ) * Math.tan(ang);
  const ridgeY = eaveY + rise;
  const rearEaveY = ridgeY - RD * Math.tan(ang);
  const rearZ = -2 * RD;
  const SLAB = 0.16;
  const slabTop = (z) => eaveY + (eaveZ - z) * Math.tan(ang) + SLAB / Math.cos(ang);

  // ---- palette ------------------------------------------------------------
  const soil = rng.range(0.90, 1.06);
  const brickTint = new THREE.Color(soil, soil * rng.range(0.965, 1.02), soil * rng.range(0.93, 1.0));
  // Painted brick is common on these — Brooklyn Heights runs to oxblood and
  // deep barn red, the Village to cream and pale grey. A multiplicative tint
  // can only darken, so the light paints swap to a painted-brick material.
  let brickMat = 'federal:brick';
  const painted = rng.weighted([['none', 58], ['oxblood', 16], ['barn', 10], ['cream', 8], ['grey', 8]]);
  if (painted === 'oxblood') brickTint.multiply(new THREE.Color(0.60, 0.34, 0.32));
  else if (painted === 'barn') brickTint.multiply(new THREE.Color(0.80, 0.40, 0.32));
  else if (painted === 'cream') { brickMat = 'brickPaintedCream'; brickTint.multiply(new THREE.Color(0.96, 0.95, 0.91)); }
  else if (painted === 'grey') { brickMat = 'brickPaintedGray'; brickTint.multiply(new THREE.Color(1.12, 1.14, 1.14)); }
  const stoneMat = rng.weighted([['brownstone', 5], ['brownstoneDark', 4], ['limestone', 2]]);
  const baseMat = rng.weighted([['brownstone', 5], ['graniteBase', 3], ['brownstoneDark', 2]]);
  // Joinery is white/cream on most, but a good number of Brooklyn Heights
  // houses carry a black or bottle-green painted cornice and door surround.
  const darkTrim = rng.bool(0.26);
  const trimTint = darkTrim
    ? new THREE.Color(rng.weighted([[0x22211f, 5], [0x1e2a24, 3], [0x2b2622, 2]]))
    : new THREE.Color(rng.weighted([[0xd6d2c2, 6], [0xcac6b6, 4], [0xbebaaa, 3], [0xb6bab4, 1.5]]));
  const stoneTint = new THREE.Color(rng.range(0.86, 0.98), rng.range(0.84, 0.94), rng.range(0.78, 0.88));
  const doorTint = new THREE.Color(rng.weighted([
    [0x1a1a19, 5], [0x1e3326, 4], [0x2a1d16, 3], [0x5a2320, 2], [0x24354d, 1.5],
  ]));
  const ironTint = new THREE.Color(0.10, 0.10, 0.095);
  const sashTint = darkTrim
    ? new THREE.Color(rng.weighted([[0x1c1b19, 6], [0xe4e0d4, 2]]))
    : new THREE.Color(rng.weighted([[0xe4e0d4, 5], [0x1c1b19, 4]]));
  const slateTint = new THREE.Color(rng.range(0.88, 1.10), rng.range(0.9, 1.06), rng.range(0.92, 1.10));
  const hasShutters = !commercial && rng.bool(0.28);
  const shutTint = new THREE.Color(rng.weighted([[0x22362a, 5], [0x1b1b1a, 3], [0x2a2a30, 1]]));

  // ---- window schedule ----------------------------------------------------
  // storeys graduate hard on this type — parlour tallest, attic-floor shortest
  const WSPEC = [
    { w: 0.98, h: 2.16, sill: 0.66 },
    { w: 0.94, h: 1.72, sill: 0.82 },
    { w: 0.88, h: 1.26, sill: 0.92 },
  ];
  const spec = (f) => WSPEC[Math.min(f, WSPEC.length - 1)];
  const nB = W >= 6.2 ? 3 : 2;
  const upXs = bayCenters(nB, W, 0.55 + spec(1).w / 2);

  // ---- entrance layout ----------------------------------------------------
  const doorW = 0.98, doorH = 2.32, transH = 0.46, sideL = W >= 5.0 ? 0.28 : 0.20;
  const opW = doorW + sideL * 2;
  const opH = doorH + transH;
  const pilW = 0.19;
  const surW = opW + (pilW + 0.05) * 2;
  const doorX = commercial ? 0 : q05(side * (W / 2 - surW / 2 - 0.24));
  const doorTop = parlorY + opH;

  // parlour windows fill the strip beside the doorway
  const strip = side > 0
    ? [-W / 2 + 0.52, doorX - surW / 2 - 0.30]
    : [doorX + surW / 2 + 0.30, W / 2 - 0.52];
  const pW = spec(0).w;
  const avail = strip[1] - strip[0];
  const parXs = (avail >= pW * 2 + 1.05)
    ? [strip[0] + pW / 2 + 0.10, strip[1] - pW / 2 - 0.10]
    : (avail >= pW + 0.2 ? [(strip[0] + strip[1]) / 2] : []);

  // =======================================================================
  // BASEMENT STOREY (stone) + water table
  // =======================================================================
  const basW = 0.78, basH = AW > 0 ? 1.05 : 0.86;
  const basXs = (!commercial && (AW > 0 || baseTop >= 1.30)) ? parXs : [];
  const basY = AW > 0 ? -0.62 : Math.max(0.35, baseTop - basH - 0.30);
  const baseBot = AW > 0 ? AR : 0;
  {
    const doorH0 = AW > 0 ? AR + 0.06 : 0.05;
    const doorH1 = AW > 0 ? AR + 2.10 : Math.min(baseTop - 0.12, 2.05);
    const ops = basXs.map((x) => ({ x, w: basW, y0: basY, y1: basY + basH }));
    if (!commercial && highStoop) {
      ops.push({ x: doorX, w: 0.90, y0: doorH0, y1: Math.min(doorH1, baseTop - 0.12) });
    }
    ops.sort((a, b) => a.x - b.x);
    punchedWall(ctx, at(F, 0, baseBot, 0), {
      width: W, height: baseTop - baseBot, depth: 0.42,
      mat: commercial ? brickMat : baseMat,
      tint: commercial ? brickTint : stoneTint,
      rows: ops.length
        ? [{ y0: 0.02, y1: baseTop - baseBot - 0.06, openings: ops.map((o) => ({ ...o, y0: o.y0 - baseBot, y1: o.y1 - baseBot })) }]
        : [],
      grime: 0.34,
    });
    for (const x of basXs) {
      K.window({ w: basW, h: basH, style: 'dh2', recess: 0.16 }, at(F, x, basY, 0),
        { tint: sashTint, glassTint: new THREE.Color(0.50, 0.54, 0.58) });
      K.sill(basW, at(F, x, basY, 0), { mat: stoneMat, tint: stoneTint });
      B.addInstance(guardPart(B, basW, basH), at(F, x, basY, 0), ironTint);
    }
    if (!commercial && highStoop) {
      const dy = Math.min(doorH1, baseTop - 0.12);
      B.addMerged('doorPaint', box(0.86, dy - doorH0, 0.05), at(F, doorX, doorH0, -0.12),
        { tint: new THREE.Color(0.16, 0.15, 0.14), worldUV: false });
    }
    // water table: a projecting stone course capping the basement
    B.addMerged(stoneMat, box(W + 0.02, 0.13, 0.11), at(F, 0, baseTop - 0.13, 0.055), { tint: stoneTint, grime: 0.2 });
    B.addMerged(stoneMat, box(W + 0.06, 0.05, 0.15), at(F, 0, baseTop, 0.075), { tint: stoneTint, grime: 0.2 });
  }

  // =======================================================================
  // BRICK SHAFT — parlour + upper storeys
  // =======================================================================
  const BF = at(F, 0, baseTop, 0);                // brick starts at the water table
  const rows = [];
  const upRows = [];
  {
    const ops = [];
    if (commercial) {
      ops.push({ x: 0, w: W - 1.3, y0: 0.30, y1: 3.30 });
      rows.push({ y0: 0.20, y1: 3.45, openings: ops });
    } else {
      ops.push({ x: doorX, w: opW, y0: parlorY - baseTop, y1: doorTop - baseTop });
      for (const x of parXs) {
        const s0 = spec(0);
        ops.push({
          x, w: s0.w, y0: floorY[0] + s0.sill - baseTop,
          y1: floorY[0] + s0.sill + s0.h - baseTop,
        });
      }
      ops.sort((a, b) => a.x - b.x);
      const lo = Math.min(...ops.map((o) => o.y0)) - 0.03;
      const hi = Math.max(...ops.map((o) => o.y1)) + 0.03;
      rows.push({ y0: lo, y1: hi, openings: ops });
    }
  }
  for (let f = 1; f < floors; f++) {
    const s = spec(f);
    const y = floorY[f] + s.sill;
    rows.push({
      y0: y - baseTop - 0.02, y1: y + s.h - baseTop + 0.02,
      openings: upXs.map((x) => ({ x, w: s.w })),
    });
    upRows.push({ f, y, xs: upXs, s });
  }
  if (commercial) {
    const s0 = spec(0);
    const y = floorY[0] + s0.sill;
    rows.push({ y0: y - baseTop - 0.02, y1: y + s0.h - baseTop + 0.02, openings: upXs.map((x) => ({ x, w: s0.w })) });
    upRows.unshift({ f: 0, y, xs: upXs, s: s0 });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  punchedWall(ctx, BF, {
    width: W, height: H - baseTop, depth: 0.40, mat: brickMat, tint: brickTint,
    rows, grime: 0.14, aoTop: H - baseTop,
  });

  // ---- upper sash, lintels, sills, blinds ---------------------------------
  for (const r of upRows) {
    for (const x of r.xs) {
      const m = at(F, x, r.y, 0);
      K.window({ w: r.s.w, h: r.s.h, style: 'dh6', recess: 0.15 }, m,
        { tint: sashTint, glassTint: new THREE.Color(0.54, 0.60, 0.64) });
      K.sill(r.s.w, m, { mat: stoneMat, tint: stoneTint });
      K.lintel(r.s.w, at(F, x, r.y + r.s.h, 0), { mat: stoneMat, tint: stoneTint, style: 'flat' });
      if (hasShutters && r.f < 1) {
        for (const s of [-1, 1]) {
          B.addInstance(shutterPart(B, r.s.w * 0.52, r.s.h),
            at(F, x + s * (r.s.w / 2 + r.s.w * 0.26), r.y, 0.01), shutTint);
        }
      }
    }
  }
  // parlour sash
  if (!commercial) {
    const s0 = spec(0);
    for (const x of parXs) {
      const y = floorY[0] + s0.sill;
      const m = at(F, x, y, 0);
      K.window({ w: s0.w, h: s0.h, style: 'dh6', recess: 0.15 }, m,
        { tint: sashTint, glassTint: new THREE.Color(0.54, 0.60, 0.64) });
      K.sill(s0.w, m, { mat: stoneMat, tint: stoneTint });
      K.lintel(s0.w, at(F, x, y + s0.h, 0), { mat: stoneMat, tint: stoneTint, style: 'flat' });
      if (hasShutters) {
        for (const s of [-1, 1]) {
          B.addInstance(shutterPart(B, s0.w * 0.52, s0.h),
            at(F, x + s * (s0.w / 2 + s0.w * 0.26), y, 0.01), shutTint);
        }
      }
    }
  }

  // =======================================================================
  // DOORWAY — pilasters, entablature, sidelights, transom, panelled door
  // =======================================================================
  if (!commercial) {
    const EF = at(F, doorX, parlorY, 0);
    const rev = new THREE.Color(0.13, 0.125, 0.12);
    // reveal box
    B.addMerged('paintFlat', box(opW + 0.04, 0.05, 0.30), EF.clone().multiply(tmat(0, opH - 0.05, -0.15)), { tint: rev, worldUV: false });
    for (const s of [-1, 1]) {
      B.addMerged('paintFlat', box(0.05, opH, 0.30), EF.clone().multiply(tmat(s * (opW / 2 - 0.025), 0, -0.15)), { tint: rev, worldUV: false });
    }
    // back panel behind the glazing so the vestibule reads dark
    B.addMerged('paintFlat', box(opW, opH, 0.05), EF.clone().multiply(tmat(0, 0, -0.42)),
      { tint: new THREE.Color(0.10, 0.09, 0.085), worldUV: false });
    // door leaf, set back in the reveal
    B.addInstance(doorLeafPart(B, doorW, doorH), EF.clone().multiply(tmat(0, 0, -0.20)), doorTint);
    // sidelights + transom glazing with slim muntins
    for (const s of [-1, 1]) {
      B.addMerged('glass', quad(sideL - 0.09, doorH - 0.24),
        EF.clone().multiply(tmat(s * (doorW + sideL) / 2, 0.16, -0.17)),
        { tint: new THREE.Color(0.55, 0.58, 0.6), worldUV: false });
      B.addMerged('federal:trim', box(0.05, doorH, 0.05),
        EF.clone().multiply(tmat(s * doorW / 2, 0, -0.15)), { tint: trimTint, worldUV: false });
      for (let i = 1; i <= 3; i++) {
        B.addMerged('federal:trim', box(sideL - 0.06, 0.022, 0.03),
          EF.clone().multiply(tmat(s * (doorW + sideL) / 2, 0.16 + (doorH - 0.24) * i / 4, -0.15)),
          { tint: trimTint, worldUV: false });
      }
    }
    B.addMerged('glass', quad(opW - 0.18, transH - 0.14),
      EF.clone().multiply(tmat(0, doorH + 0.09, -0.17)), { tint: new THREE.Color(0.55, 0.58, 0.6), worldUV: false });
    B.addMerged('federal:trim', box(opW, 0.07, 0.07), EF.clone().multiply(tmat(0, doorH - 0.02, -0.14)), { tint: trimTint, worldUV: false });
    for (let i = 1; i <= 3; i++) {
      B.addMerged('federal:trim', box(0.03, transH - 0.14, 0.03),
        EF.clone().multiply(tmat(-opW / 2 + (opW / 4) * i, doorH + 0.09, -0.14)), { tint: trimTint, worldUV: false });
    }
    // flat pilasters with plinth + cap
    for (const s of [-1, 1]) {
      const px = s * (opW / 2 + pilW / 2 + 0.02);
      B.addMerged('federal:trim', box(pilW, opH - 0.10, 0.09), EF.clone().multiply(tmat(px, 0.10, 0.045)), { tint: trimTint });
      B.addMerged('federal:trim', box(pilW + 0.05, 0.14, 0.11), EF.clone().multiply(tmat(px, 0, 0.055)), { tint: trimTint });
      B.addMerged('federal:trim', box(pilW + 0.05, 0.09, 0.12), EF.clone().multiply(tmat(px, opH - 0.09, 0.06)), { tint: trimTint });
    }
    // entablature over the opening
    const ew = surW;
    B.addMerged('federal:trim', box(ew, 0.10, 0.13), EF.clone().multiply(tmat(0, opH, 0.065)), { tint: trimTint });
    B.addMerged('federal:trim', box(ew, 0.19, 0.10), EF.clone().multiply(tmat(0, opH + 0.10, 0.05)), { tint: trimTint });
    B.addMerged('federal:trim', box(ew + 0.10, 0.07, 0.26), EF.clone().multiply(tmat(0, opH + 0.29, 0.13)), { tint: trimTint });
    B.addMerged('federal:trim', box(ew + 0.14, 0.09, 0.20), EF.clone().multiply(tmat(0, opH + 0.36, 0.10)), { tint: trimTint });
    // brownstone lintel above the whole entrance
    K.lintel(surW - 0.1, at(F, doorX, parlorY + opH + 0.47, 0), { mat: stoneMat, tint: stoneTint, style: 'flat' });
    // brass knob + a bracket lantern beside the door
    B.addMerged('aluminum', cylinder(0.035, 0.035, 0.07, 8).rotateX(Math.PI / 2),
      EF.clone().multiply(tmat(doorW / 2 - 0.16, 1.02, -0.20)),
      { tint: new THREE.Color(0.72, 0.55, 0.24), worldUV: false });
    {
      const lx = doorX - side * (surW / 2 + 0.20);
      const ly = parlorY + 2.10;
      if (Math.abs(lx) < W / 2 - 0.25) {
        B.addMerged('ironwork', box(0.045, 0.045, 0.26), at(F, lx, ly + 0.30, 0.13), { worldUV: false });
        B.addMerged('ironwork', box(0.14, 0.05, 0.14), at(F, lx, ly + 0.30, 0.24), { worldUV: false });
        B.addMerged('ironwork', box(0.18, 0.06, 0.18), at(F, lx, ly - 0.06, 0.24), { worldUV: false });
        for (const [ox, oz] of [[-0.06, 0], [0.06, 0], [0, -0.06], [0, 0.06]]) {
          B.addMerged('ironwork', box(ox ? 0.022 : 0.13, 0.30, oz ? 0.022 : 0.13),
            at(F, lx + ox, ly, 0.24 + oz), { worldUV: false });
        }
        B.addMerged('litWindow', box(0.10, 0.24, 0.10), at(F, lx, ly + 0.03, 0.24),
          { tint: new THREE.Color(0.55, 0.42, 0.22), worldUV: false });
      }
    }
    // cast-iron leader running down the party-wall edge
    {
      const lx2 = -side * (W / 2 - 0.13);
      const lY = AW > 0 ? 0.40 : 0.15;
      B.addMerged('ironwork', box(0.11, H - 0.45 - lY, 0.09), at(F, lx2, lY, 0.045),
        { tint: new THREE.Color(0.30, 0.29, 0.27), worldUV: false });
      B.addMerged('ironwork', box(0.17, 0.24, 0.15), at(F, lx2, H - 0.52, 0.07),
        { tint: new THREE.Color(0.28, 0.30, 0.28), worldUV: false });   // hopper head
      const shoe = box(0.13, 0.22, 0.24);
      shoe.rotateX(0.42);
      B.addMerged('ironwork', shoe, at(F, lx2, lY - 0.06, 0.05),
        { tint: new THREE.Color(0.26, 0.25, 0.23), worldUV: false });    // shoe
      for (const yy of [1.4, 4.4, 7.4]) {
        if (yy < H - 1.0) {
          B.addMerged('ironwork', box(0.15, 0.06, 0.13), at(F, lx2, yy, 0.03),
            { tint: new THREE.Color(0.26, 0.25, 0.23), worldUV: false });
        }
      }
    }

    // =====================================================================
    // STOOP
    // =====================================================================
    const steps = Math.max(3, Math.round(parlorY / 0.168));
    const stepH = parlorY / steps;
    const run = 0.30;
    const sw = q05(opW + 0.34);
    const totalRun = steps * run;
    // bluestone or brownstone treads with a proper nosing shadow
    const stoopMat = rng.weighted([['graniteBase', 6], ['limestone', 3], ['brownstoneDark', 2], ['brownstone', 1]]);
    for (let s = 0; s < steps; s++) {
      const d = totalRun - s * run;
      const g = box(sw, stepH + 0.02, d);
      boxUV(g, sw, stepH + 0.02, d, 2);
      B.addMerged(stoopMat, g, at(F, doorX, s * stepH, d / 2), { tint: stoneTint, grime: 0.34 });
      B.addMerged(stoopMat, box(sw + 0.03, 0.028, 0.04), at(F, doorX, (s + 1) * stepH - 0.028, d),
        { tint: stoneTint.clone().multiplyScalar(1.06), grime: 0.34 });
    }
    // platform at the door
    B.addMerged(stoopMat, box(sw + 0.06, 0.10, 0.42), at(F, doorX, parlorY - 0.10, 0.21), { tint: stoneTint, grime: 0.2 });
    const railId = stoopRailPart(B, parlorY, totalRun);
    for (const s of [-1, 1]) {
      B.addInstance(railId, at(F, doorX + s * (sw / 2 - 0.06), 0.0, 0.02), ironTint);
    }
    // ---- AREAWAY: a real sunken light well, not a fence on a flat wall ----
    if (AW > 0) {
      const WALK = 0.14;                       // sidewalk top (city.js CURB_H)
      // paved floor
      const flr = box(W - 0.06, 0.10, AW + 0.04);
      boxUV(flr, W - 0.06, 0.10, AW + 0.04, 3);
      B.addMerged('sidewalk', flr, at(F, 0, AR, AW / 2), { tint: new THREE.Color(0.72, 0.71, 0.69) });
      // retaining wall at the property line + bluestone coping
      B.addMerged(baseMat, box(W, WALK - AR, 0.26), at(F, 0, AR, AW - 0.13),
        { tint: stoneTint.clone().multiplyScalar(0.94), grime: 0.45 });
      B.addMerged('graniteBase', box(W + 0.05, 0.08, 0.36), at(F, 0, WALK, AW - 0.13),
        { tint: new THREE.Color(0.78, 0.79, 0.78) });
      // side walls of the well
      for (const s of [-1, 1]) {
        B.addMerged(baseMat, box(0.22, WALK - AR, AW), at(F, s * (W / 2 - 0.11), AR, AW / 2),
          { tint: stoneTint.clone().multiplyScalar(0.92), grime: 0.45 });
      }
      // the stoop bridges the well: close under it
      B.addMerged(baseMat, box(sw + 0.04, -AR + 0.04, AW + 0.1), at(F, doorX, AR, AW / 2),
        { tint: stoneTint, grime: 0.4 });
      // iron guard on the coping, either side of the stoop
      for (const s of [-1, 1]) {
        const a = s < 0 ? -W / 2 + 0.08 : doorX + sw / 2 + 0.12;
        const b2 = s < 0 ? doorX - sw / 2 - 0.12 : W / 2 - 0.08;
        if (b2 - a > 0.9) K.fence(b2 - a, at(F, (a + b2) / 2, WALK + 0.08, AW - 0.13), { tint: ironTint });
      }
    }
  } else {
    K.storefront({
      width: W - 0.9, signIndex: rng.int(0, 31),
      awningIndex: rng.bool(0.4) ? rng.int(0, 7) : -1, gate: 0, entrySide: side,
    }, at(F, 0, 0, 0), { frameTint: new THREE.Color(0.2, 0.2, 0.2) });
  }

  // =======================================================================
  // DENTIL CORNICE at the eave
  // =======================================================================
  {
    // deep frieze board, bed mould, dentil course, corona (0.44 projection),
    // crown mould, and a patinated half-round gutter on the corona
    B.addMerged('federal:trim', box(W, 0.40, 0.05), at(F, 0, H - 0.72, 0.025), { tint: trimTint });
    B.addMerged('federal:trim', box(W + 0.02, 0.09, 0.13), at(F, 0, H - 0.32, 0.065), { tint: trimTint });
    B.addMerged('federal:trim', box(W, 0.14, 0.07), at(F, 0, H - 0.23, 0.035), { tint: trimTint });
    const dId = dentilPart(B);
    const pitch = 0.115;
    const n = Math.max(4, Math.floor((W - 0.10) / pitch));
    const x0 = -(n - 1) * pitch / 2;
    for (let i = 0; i < n; i++) {
      B.addInstance(dId, at(F, x0 + i * pitch, H - 0.225, 0.05), trimTint);
    }
    B.addMerged('federal:trim', box(W + 0.10, 0.09, 0.44), at(F, 0, H - 0.085, 0.22), { tint: trimTint });
    B.addMerged('federal:trim', box(W + 0.14, 0.12, 0.34), at(F, 0, H + 0.005, 0.17), { tint: trimTint });
    // soffit shadow under the corona
    B.addMerged('paintFlat', box(W + 0.08, 0.02, 0.38), at(F, 0, H - 0.09, 0.21),
      { tint: new THREE.Color(0.34, 0.32, 0.30), worldUV: false });
    const gut = cylinder(0.065, 0.065, W + 0.08, 10);
    gut.rotateZ(Math.PI / 2);
    gut.translate((W + 0.08) / 2, 0, 0);
    B.addMerged('aluminum', gut, at(F, 0, H + 0.10, 0.40),
      { tint: new THREE.Color(0.30, 0.40, 0.33), worldUV: false });
  }

  // =======================================================================
  // ROOF: front slope + rear slope + flat rear deck + gable ends
  // =======================================================================
  {
    const rw = W - 0.06;
    const runF = RD + eaveZ;
    const Lf = runF / Math.cos(ang);
    const gf = box(rw, SLAB, Lf);
    gf.translate(0, 0, -Lf / 2);
    gf.rotateX(ang);
    B.addMerged('federal:slate', gf, at(F, 0, eaveY, eaveZ), { tint: slateTint });

    const Lr = RD / Math.cos(ang);
    const gr = box(rw, SLAB, Lr);
    gr.translate(0, 0, -Lr / 2);
    gr.rotateX(-ang);
    B.addMerged('federal:slate', gr, at(F, 0, ridgeY, -RD), { tint: slateTint });

    // ridge cap
    B.addMerged('federal:slate', box(rw, 0.09, 0.22), at(F, 0, ridgeY + SLAB / Math.cos(ang) - 0.04, -RD), { tint: slateTint });

    // gable ends on the party walls — the brick follows the rake and stops
    // 0.05 under the slate, so the slate laps over it like a real coping
    const lap = SLAB / Math.cos(ang) - 0.05;
    const gpts = [
      [-0.02, H - 0.25], [rearZ, H - 0.25],
      [rearZ, rearEaveY + lap],
      [-RD, ridgeY + lap],
      [-0.02, eaveY + (eaveZ + 0.02) * Math.tan(ang) + lap],
    ];
    prismAlongX(B, brickMat, F, gpts, 0.28, W / 2 - 0.005, brickTint);
    prismAlongX(B, brickMat, F, gpts, 0.28, -W / 2 + 0.285, brickTint);

    // flat rear roof behind the gabled section
    const flatD = Math.max(0.6, D - 2 * RD);
    B.addMerged('roofSilver', box(W - 0.12, 0.12, flatD), at(F, 0, rearEaveY - 0.12, rearZ - flatD / 2));
    for (const s of [-1, 1]) {
      B.addMerged(brickMat, box(0.30, 0.55, flatD), at(F, s * (W / 2 - 0.15), rearEaveY - 0.12, rearZ - flatD / 2), { tint: brickTint });
      B.addMerged('limestone', box(0.36, 0.06, flatD), at(F, s * (W / 2 - 0.15), rearEaveY + 0.43, rearZ - flatD / 2), { tint: stoneTint });
    }
    B.addMerged(brickMat, box(W, 0.55, 0.30), at(F, 0, rearEaveY - 0.12, -D + 0.15), { tint: brickTint });

    // ---- dormers --------------------------------------------------------
    const nD = W >= 6.2 ? rng.weighted([[2, 66], [3, 18], [1, 16]]) : rng.weighted([[2, 74], [1, 26]]);
    const zd = -0.72;                    // face set back so slate runs in front
    const yd = slabTop(zd) - 0.03;
    const dxs = bayCenters(nD, W, 0.95);
    const bodyId = dormerBodyPart(B), roofId = dormerRoofPart(B);
    for (const dx of dxs) {
      const m = at(F, dx, yd, zd);
      B.addInstance(bodyId, m, trimTint);
      B.addInstance(roofId, m, slateTint);
      K.window({ w: D_OP_W, h: D_OP_H, style: 'dh6', recess: 0.10 },
        at(F, dx, yd + D_SILL, zd + 0.01),
        { tint: sashTint, glassTint: new THREE.Color(0.46, 0.52, 0.58) });
    }

    // ---- chimneys on the party walls ------------------------------------
    const chH = q05(rng.range(2.1, 2.9));
    const chId = chimneyPart(B, 0.72, 1.25, chH + 1.1);
    const chSides = rng.bool(0.7) ? [-1, 1] : [side];
    for (const s of chSides) {
      B.addInstance(chId, at(F, s * (W / 2 - 0.39), ridgeY - 1.1, -RD + rng.range(-0.25, 0.25)),
        brickTint.clone().multiplyScalar(0.84));
    }
    // flat rear roof kit: scuttle hatch + soil stacks
    B.addMerged('roofBlack', box(1.05, 0.30, 0.95), at(F, rng.range(-W / 5, W / 5), rearEaveY - 0.12, rearZ - flatD * rng.range(0.25, 0.45)),
      { tint: new THREE.Color(0.55, 0.56, 0.55) });
    K.vent(at(F, rng.range(-W / 4, W / 4), rearEaveY - 0.1, rearZ - flatD * 0.5), { kind: 'pipe' });
    K.vent(at(F, rng.range(-W / 4, W / 4), rearEaveY - 0.1, rearZ - flatD * 0.75), { kind: 'goose' });
  }

  // =======================================================================
  // SHELL
  // =======================================================================
  const sideRows = { left: null, right: null };
  if (lot.corner) {
    const rws = [];
    for (let f = 0; f < floors; f++) {
      const s = spec(f);
      const y = floorY[f] + s.sill;
      const n = Math.max(2, Math.round(D / 5.2));
      const ops = [];
      for (let i = 0; i < n; i++) ops.push({ x: -D / 2 + (D / n) * (i + 0.5), w: s.w, y0: y, y1: y + s.h });
      rws.push({ y0: y - 0.02, y1: y + s.h + 0.02, openings: ops });
    }
    if (lot.corner < 0) sideRows.left = rws; else sideRows.right = rws;
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: H, mat: brickMat, tint: brickTint, wallT: 0.30, sideRows,
  });
  if (lot.corner) {
    const sub = at(F, lot.corner * (W / 2), 0, -D / 2, lot.corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    for (let f = 0; f < floors; f++) {
      const s = spec(f);
      const y = floorY[f] + s.sill;
      const n = Math.max(2, Math.round(D / 5.2));
      for (let i = 0; i < n; i++) {
        const x = -D / 2 + (D / n) * (i + 0.5);
        const m = sub.clone().multiply(tmat(x, y, 0));
        K.window({ w: s.w, h: s.h, style: 'dh6', recess: 0.15 }, m,
          { tint: sashTint, glassTint: new THREE.Color(0.54, 0.60, 0.64) });
        K.sill(s.w, m, { mat: stoneMat, tint: stoneTint });
        K.lintel(s.w, sub.clone().multiply(tmat(x, y + s.h, 0)), { mat: stoneMat, tint: stoneTint, style: 'flat' });
      }
    }
  }

  return { height: ridgeY };
}
