// ===========================================================================
// SoHo / Tribeca CAST-IRON LOFT  (c. 1857-1880) — Greene St, Broome St, Grand St
// The world's largest cast-iron district. Researched from:
//   refs/boroughs/soho-castiron-72-greene-01.jpg          (King of Greene St)
//   refs/boroughs/soho-castiron-8-34-greene-01.jpg        (row + paint colours)
//   refs/boroughs/soho-castiron-132-140-greene-01.jpg     (flat heads, colonnettes)
//   refs/boroughs/soho-castiron-75-grand-colonnade-01.jpg (ground colonnade)
//   refs/boroughs/soho-castiron-453-467-broome-01.jpg     (corner + balustrade)
//   refs/boroughs/soho-castiron-gunther-corner-01.jpg     (Gunther Bldg corner)
//   refs/boroughs/soho-ATTRIBUTION.md   (dimensions read off those photos)
//
// IDENTITY — what makes it read as cast iron:
//   · the facade IS a colonnade. Slender Corinthian colonnettes standing 0.14 m
//     CLEAR of the pier face on a thin web, so a black slot runs the full storey
//     height either side of every shaft. That slot IS the type at 30 m.
//   · an ENTABLATURE at every floor line — architrave / frieze / small dentil
//     bed / smooth corona projecting 0.34-0.42 m. The corona throws the shadow.
//   · the wall is ~72 % glass per bay: openings ~1.7-2.1 m wide x 2.9-3.4 m tall.
//   · painted iron — cream / white / dove grey / celadon / buff / sage; rarely
//     dark green, near-black or bare rust-tan. Semi-gloss enamel: the shafts
//     must carry a vertical specular highlight.
//   · ground floor is the GRAND storey (4.65-5.2 m): free-standing columns at
//     ~10:1, fluted over the lower third, standing ~0.9 m in front of a black
//     shopfront recess so each shaft silhouettes.
//   · big projecting bracketed crown cornice, often a pediment over it.
//   · directional grime: streaks under every sill, soot in the dentil pockets.
//
// NOTE: geo.js `profileAlongX` rotates the extrusion so the profile's "out"
// axis lands on -Z. Every moulding run here is placed with ry = PI.
// ===========================================================================
import * as THREE from 'three';
import { at, punchedWall, flatRoof } from './lib.js';
import {
  box, quad, cylinder, lathe, compose, profileAlongX, ensureColor, tmat, shadeYRange,
} from '../geo.js';
import { stuccoTexture, brickTexture } from '../textures.js';

export const TYPE = 'castiron';

const PI = Math.PI;
const C = (h) => new THREE.Color(h);
const q5 = (v) => Math.round(v * 20) / 20;      // 5 cm
const q2 = (v) => Math.round(v * 50) / 50;      // 2 cm
const DARKROOM = new THREE.Color(0.022, 0.022, 0.026);
const SOOT = new THREE.Color(0.60, 0.575, 0.52);   // warm-black grime multiplier
const JAMB_W = 0.118;                              // architrave face
const JAMB_BEAD = 0.050;                           // outer bead
const JAMB_TOT = JAMB_W + JAMB_BEAD;

const sm = (frame, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) =>
  frame.clone().multiply(tmat(x, y, z, ry, sx, sy, sz));

function mono(pts) {
  let y = -1e9;
  return pts.map(([x, yy]) => { y = Math.max(y, yy); return [x, y]; });
}

// tiny deterministic hash rng so baked-in weathering varies per part size
const lcg = (seed) => {
  let s = (Math.round(seed * 1000) * 2654435761 + 104729) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

// ---------------------------------------------------------------------------
// MATERIALS  (prefixed 'castiron:')
// ---------------------------------------------------------------------------
function ensureMaterials(ctx) {
  const M = ctx.batcher.M;
  const add = (name, opts, tile = 2) => {
    if (M.has(name)) return;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    m.userData.tileMeters = tile;
    m.name = name;
    M.set(name, m);
  };
  // Semi-gloss enamel over metal: low enough roughness that every column shaft
  // gets a vertical sun highlight, low envMapIntensity so the noon sky can't
  // wash the hue to blue-grey.
  if (!M.has('castiron:paint')) {
    const t = stuccoTexture({ base: '#f2eee5', blotch: 0.11, seed: 771, size: 512 });
    add('castiron:paint', {
      map: t.map, bumpMap: t.map, bumpScale: 0.08,
      roughness: 0.58, metalness: 0.04, envMapIntensity: 0.20,
    }, 2.8);
  }
  // colonnette shafts get their own, glossier enamel: a broad vertical
  // highlight down a round shaft is half of how a colonnade reads at 30 m,
  // but the same gloss on the flat field would blow the whole elevation out.
  if (!M.has('castiron:paintCol') && M.has('castiron:paint')) {
    const src = M.get('castiron:paint');
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: src.map, bumpMap: src.bumpMap, bumpScale: 0.08,
      roughness: 0.33, metalness: 0.07, envMapIntensity: 0.24,
    });
    m.userData.tileMeters = 2.8; m.name = 'castiron:paintCol';
    M.set('castiron:paintCol', m);
  }
  // deep soffits / shop recesses — no sheen at all, so holes stay holes
  add('castiron:paintDull', { color: 0xffffff, roughness: 0.90, metalness: 0.0, envMapIntensity: 0.10 }, 1);
  // painted iron stock: railings, grilles, mullions, leaders
  add('castiron:iron', { color: 0xffffff, roughness: 0.62, metalness: 0.28, envMapIntensity: 0.22 }, 1);
  // Loft window glazing: dark and opaque, per-instance tint carries the room
  // state. Roughness is deliberately NOT mirror-low — the only environment we
  // have is sky, and a near-mirror surface picks up the F90 grazing term and
  // washes every pane to pale blue. 0.26 keeps a soft sheen without the wash.
  add('castiron:glassWin', {
    color: 0xffffff, roughness: 0.70, metalness: 0.0, envMapIntensity: 0.09,
  }, 1);
  // shopfront plate glass — same reasoning, a touch flatter still
  add('castiron:glassBig', {
    color: 0xffffff, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.05,
  }, 1);
  // shop signage: the shared 'signs' material is emissive so it glows at
  // night — in daylight that reads as a lightbox. Reuse its atlas on a plain
  // painted board instead, with only a whisper of emissive for night scenes.
  if (!M.has('castiron:sign') && M.has('signs')) {
    const src = M.get('signs');
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: src.map, emissiveMap: src.map,
      emissive: 0xffffff, emissiveIntensity: 0.05,
      roughness: 0.72, metalness: 0.0, envMapIntensity: 0.18,
    });
    m.userData.tileMeters = 1; m.name = 'castiron:sign';
    M.set('castiron:sign', m);
  }
  // brick party / rear wall — SoHo iron fronts are brick behind
  if (!M.has('castiron:brickParty')) {
    const t = brickTexture({
      hue: 14, sat: 26, light: 34, dh: 9, ds: 15, dl: 15, mortar: '#9c9182',
      flemish: true, darkBrickChance: 0.07, seed: 773,
    });
    add('castiron:brickParty', {
      map: t.map, bumpMap: t.bumpMap, bumpScale: 1.5, roughness: 0.95, envMapIntensity: 0.36,
    }, t.tileMeters);
  }
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

// A column group: n slender Corinthian colonnettes, a full storey tall, on a
// thin web so they stand clear of the wall. plinth + attic base + fluted drum
// + near-cylindrical shaft (<=4 % entasis) + acanthus capital + square abacus.
function colGroupPart(ctx, o) {
  const h = q5(o.h), r = q2(o.r), n = o.n, fl = o.flute ? 'f' : 'p';
  const id = `castiron:colgrp:${h}:${r}:${n}:${fl}${o.grime ? 'g' : ''}${o.web ? 'w' : ''}`;
  if (ctx.batcher.hasPart(id)) return id;
  const SEG = 11;
  const pedH = o.grime ? 0.30 : 0.24;
  const capH = Math.min(0.42, h * 0.118);
  const baseH = Math.min(0.24, h * 0.062);
  const fluteH = o.flute ? Math.min(1.15, (h - pedH - baseH - capH) * 0.36) : 0;
  const shaftH = h - pedH - baseH - capH - fluteH;
  const one = [];
  // pedestal die + cap moulding
  one.push({ geom: box(r * 2.5, pedH - 0.07, r * 2.3, { segY: 1 }), x: 0, y: 0, z: 0 });
  one.push({ geom: box(r * 2.8, 0.07, r * 2.55, { segY: 1 }), x: 0, y: pedH - 0.07, z: 0 });
  // attic base — trimmed torus so there is no bowling-pin bulge
  {
    const p = [
      [0.00, 0.00], [1.18, 0.00], [1.18, 0.26], [1.00, 0.40],
      [1.10, 0.62], [0.99, 0.82], [0.96, 1.00], [0.00, 1.00],
    ].map(([rr, yy]) => [rr * r, yy * baseH]);
    one.push({ geom: lathe(p, SEG), x: 0, y: pedH, z: 0 });
  }
  // fluted lower drum: 15 reeds cut as geometry, cavity-darkened between them
  if (fluteH > 0.02) {
    const drum = cylinder(r * 0.86, r * 0.90, fluteH, 14);
    ensureColor(drum, new THREE.Color(0.70, 0.69, 0.66));
    one.push({ geom: drum, x: 0, y: pedH + baseH, z: 0 });
    for (let i = 0; i < 9; i++) {
      const a = -PI * 0.5 + PI * (i / 8);
      one.push({
        geom: box(r * 0.18, fluteH, r * 0.18, { segY: 1 }),
        x: Math.sin(a) * r * 0.90, y: pedH + baseH, z: Math.cos(a) * r * 0.90, ry: -a,
      });
    }
    one.push({ geom: cylinder(r * 0.90, r * 1.00, 0.055, SEG), x: 0, y: pedH + baseH + fluteH - 0.055, z: 0 });
  }
  // shaft: <=4 % entasis
  one.push({
    geom: cylinder(r * 0.90, r * 0.94, shaftH + 0.02, SEG),
    x: 0, y: pedH + baseH + fluteH, z: 0,
  });
  // Corinthian capital: compact bell, two ranks of acanthus, square abacus
  {
    const y0 = pedH + baseH + fluteH + shaftH;
    const p = [
      [0.90, 0.00], [1.00, 0.05], [0.94, 0.12], [1.04, 0.34],
      [1.16, 0.62], [1.28, 0.84], [1.34, 0.92], [1.32, 0.96], [0.00, 0.96],
    ].map(([rr, yy]) => [rr * r, yy * capH]);
    one.push({ geom: lathe(p, SEG), x: 0, y: y0, z: 0 });
    for (const a of [-1.15, -0.40, 0.40, 1.15]) {
      const lf = box(r * 0.46, capH * 0.38, r * 0.28, { segY: 1 });
      ensureColor(lf, new THREE.Color(0.94, 0.935, 0.925));
      one.push({ geom: lf, x: Math.sin(a) * r * 1.02, y: y0 + capH * 0.14, z: Math.cos(a) * r * 1.02, ry: -a });
      one.push({
        geom: box(r * 0.50, capH * 0.40, r * 0.34, { segY: 1 }),
        x: Math.sin(a) * r * 1.20, y: y0 + capH * 0.48, z: Math.cos(a) * r * 1.20, ry: -a,
      });
      one.push({
        geom: cylinder(r * 0.19, r * 0.21, r * 0.28, 6),
        x: Math.sin(a) * r * 1.34, y: y0 + capH * 0.80, z: Math.cos(a) * r * 1.34, rx: PI / 2,
      });
    }
    one.push({ geom: box(r * 2.72, capH * 0.05, r * 2.55, { segY: 1 }), x: 0, y: y0 + capH * 0.945, z: 0 });
    one.push({ geom: box(r * 2.90, capH * 0.045, r * 2.72, { segY: 1 }), x: 0, y: y0 + capH * 0.995 - 0.004, z: 0 });
  }
  const items = [];
  const gap = r * 2.30;
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * gap;
    for (const it of one) items.push({ ...it, x: (it.x || 0) + dx });
    // web: a narrow plate back to the wall, leaving the slot open either side
    if (o.web > 0.02) {
      const w = box(r * 0.55, h - 0.02, o.web, { segY: 1 });
      ensureColor(w, new THREE.Color(0.56, 0.55, 0.53));
      items.push({ geom: w, x: dx, y: 0.01, z: -o.web / 2 });
    }
  }
  const g = compose(items);
  if (o.grime) shadeYRange(g, 0.0, 1.6, 0.72, 1.0);
  ctx.batcher.definePart(id, g, ctx.batcher.M.has('castiron:paintCol') ? 'castiron:paintCol' : 'castiron:paint');
  return id;
}

// Moulded window surround: deep dark reveal, slim jamb architrave, moulded sill
// with grime streaks washing down the apron panel, and a head — flat cornice
// hood on consoles, or a segmental / round archivolt of voussoirs + keystone.
function winSurroundPart(ctx, o) {
  const w = q5(o.w), h = q5(o.h), rec = q2(o.recess), ah = q5(Math.max(0.18, o.apronH));
  const id = `castiron:winsurr:${w}x${h}:${o.head}:${rec}:${ah}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const jw = JAMB_W;
  const rise = o.head === 'round' ? w / 2 : o.head === 'seg' ? w * 0.17 : 0;
  const rnd = lcg(w * 31 + h * 7 + (o.head === 'flat' ? 1 : 2));

  // ---- deep dark reveal ---------------------------------------------------
  {
    const bk = box(w + 0.10, h + rise + 0.40, 0.05, { segY: 1 });
    ensureColor(bk, DARKROOM);
    items.push({ geom: bk, x: 0, y: -0.20, z: -rec - 0.55 });
    for (const s of [-1, 1]) {
      const g = box(0.07, h + rise + 0.06, rec + 0.55, { segY: 1 });
      ensureColor(g, new THREE.Color(0.30, 0.30, 0.29));
      items.push({ geom: g, x: s * (w / 2 + 0.03), y: 0, z: -(rec + 0.55) / 2 });
    }
    const gt = box(w + 0.12, 0.07, rec + 0.55, { segY: 1 });
    ensureColor(gt, new THREE.Color(0.22, 0.22, 0.21));
    items.push({ geom: gt, x: 0, y: h + rise - 0.035, z: -(rec + 0.55) / 2 });
  }
  // ---- jamb architrave (slim: the glass gets the bay, not the trim) -------
  for (const s of [-1, 1]) {
    items.push({ geom: box(jw, h + rise * 0.30 + 0.06, 0.075, { segY: 1 }), x: s * (w / 2 + jw / 2), y: -0.03, z: 0.037 });
    items.push({ geom: box(JAMB_BEAD, h + rise * 0.30 + 0.06, 0.125, { segY: 1 }), x: s * (w / 2 + jw + JAMB_BEAD / 2), y: -0.03, z: 0.062 });
  }
  // ---- moulded sill + apron panel + directional grime streaks -------------
  items.push({ geom: box(w + JAMB_TOT * 2 + 0.14, 0.085, 0.22, { segY: 1 }), x: 0, y: -0.085, z: 0.085 });
  items.push({ geom: box(w + JAMB_TOT * 2 + 0.04, 0.06, 0.14, { segY: 1 }), x: 0, y: -0.145, z: 0.046 });
  {
    const apH = ah - 0.10;
    const ap = box(w + JAMB_TOT * 2, apH, 0.06, { segY: 1 });
    ensureColor(ap, new THREE.Color(0.905, 0.90, 0.878));
    items.push({ geom: ap, x: 0, y: -0.145 - apH, z: 0.03 });
    const ip = box(w * 0.72, Math.max(0.08, apH - 0.22), 0.03, { segY: 2 });
    ensureColor(ip, new THREE.Color(0.80, 0.795, 0.772));
    items.push({ geom: ip, x: 0, y: -0.145 - apH + 0.11, z: 0.046 });
    for (const s of [-1, 1]) {
      items.push({
        geom: cylinder(0.046, 0.05, 0.032, 8),
        x: s * w * 0.36, y: -0.155 - apH / 2, z: 0.067, rx: PI / 2,
      });
    }
    // soot band packed under the sill lip, where rain never reaches
    const sb = box(w + JAMB_TOT * 2 - 0.02, 0.17, 0.014, { segY: 1 });
    ensureColor(sb, SOOT.clone().lerp(new THREE.Color(1, 1, 1), 0.22));
    items.push({ geom: sb, x: 0, y: -0.155 - 0.17, z: 0.069 });
    // rain-wash streaks off the sill: thin darker strips down the apron
    for (let i = 0; i < 4; i++) {
      const sw2 = 0.05 + rnd() * 0.085;
      const sx = (rnd() - 0.5) * (w + 0.1);
      const sh = Math.min(apH - 0.04, 0.35 + rnd() * (apH + 0.5));
      if (sh < 0.10) continue;
      const g = box(sw2, sh, 0.012, { segY: 2 });
      ensureColor(g, SOOT.clone().lerp(new THREE.Color(1, 1, 1), 0.35 + rnd() * 0.3));
      items.push({ geom: g, x: sx, y: -0.155 - sh, z: 0.068 });
    }
  }
  // ---- head ---------------------------------------------------------------
  if (o.head === 'flat') {
    // moulded cornice hood on two consoles, with a keystone boss
    items.push({ geom: box(w + JAMB_TOT * 2 + 0.06, 0.085, 0.14, { segY: 1 }), x: 0, y: h + 0.005, z: 0.065 });
    items.push({ geom: box(w + JAMB_TOT * 2 + 0.14, 0.09, 0.27, { segY: 1 }), x: 0, y: h + 0.09, z: 0.13 });
    items.push({ geom: box(w + JAMB_TOT * 2 + 0.20, 0.065, 0.34, { segY: 1 }), x: 0, y: h + 0.18, z: 0.165 });
    items.push({ geom: box(w + JAMB_TOT * 2 + 0.14, 0.05, 0.27, { segY: 1 }), x: 0, y: h + 0.245, z: 0.13 });
    for (const s of [-1, 1]) {
      const cs = box(0.105, 0.20, 0.20, { segY: 1 });
      ensureColor(cs, new THREE.Color(0.96, 0.955, 0.945));
      items.push({ geom: cs, x: s * (w / 2 + jw * 0.7), y: h - 0.11, z: 0.10 });
    }
    items.push({ geom: box(0.18, 0.24, 0.17, { segY: 1 }), x: 0, y: h - 0.11, z: 0.085 });
    items.push({ geom: box(0.22, 0.06, 0.20, { segY: 1 }), x: 0, y: h + 0.16, z: 0.10 });
  } else {
    const R = o.head === 'round' ? w / 2 : (w * w) / (8 * rise) + rise / 2;
    const th = Math.asin(Math.min(0.9999, (w / 2) / R));
    const cy = rise - R;
    const nb = Math.max(7, Math.min(14, Math.round((2 * th * R) / 0.27)));
    const bw = (2 * th * R) / nb + 0.012;
    for (let i = 0; i < nb; i++) {
      const phi = -th + 2 * th * ((i + 0.5) / nb);
      const isKey = Math.abs(phi) < th / nb;
      const ring = isKey ? 0.34 : 0.235;                  // heavier archivolt
      const vg = box(bw, ring, 0.115, { segY: 1 });
      ensureColor(vg, new THREE.Color().setScalar(0.955 + rnd() * 0.05));
      items.push({ geom: vg, x: R * Math.sin(phi), y: h + cy + R * Math.cos(phi), z: 0.058, rz: -phi });
      items.push({
        geom: box(bw, 0.07, 0.185, { segY: 1 }),
        x: (R + ring - 0.055) * Math.sin(phi), y: h + cy + (R + ring - 0.055) * Math.cos(phi),
        z: 0.093, rz: -phi,
      });
    }
    for (const s of [-1, 1]) {                            // projecting impost
      items.push({ geom: box(0.22, 0.125, 0.22, { segY: 1 }), x: s * (w / 2 + jw * 0.45), y: h - 0.085, z: 0.11 });
    }
    items.push({ geom: box(0.21, 0.38, 0.20, { segY: 1 }), x: 0, y: h + rise - 0.13, z: 0.10 });
    // fanlight muntins: a true radial fan for a round head, straight bars for
    // a shallow segmental one (a 3-bar fan on a shallow arch reads as a "V")
    if (o.head === 'round') {
      for (let i = 1; i < 7; i++) {
        const phi = -th * 0.86 + (2 * th * 0.86) * (i / 7);
        items.push({ geom: box(0.05, R - 0.07, 0.055, { segY: 1 }), x: 0, y: h + cy, z: -rec + 0.10, rz: -phi });
      }
    } else {
      for (const fx of [-w * 0.22, 0, w * 0.22]) {
        const top = cy + Math.sqrt(Math.max(0.0004, R * R - fx * fx));
        items.push({ geom: box(0.05, Math.max(0.05, top - 0.05), 0.055, { segY: 1 }), x: fx, y: h, z: -rec + 0.10 });
      }
    }
    items.push({ geom: box(w - 0.04, 0.07, 0.08, { segY: 1 }), x: 0, y: h - 0.025, z: -rec + 0.10 });
    for (const s of [-1, 1]) {
      const fw = w * 0.19;
      items.push({
        geom: box(fw, rise * 0.5, 0.06, { segY: 1 }),
        x: s * (w / 2 - fw / 2 + 0.02), y: h + rise * 0.48, z: 0.03,
      });
    }
  }
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');
  return id;
}

// Loft sash: slim cast frame (stiles 0.055) so the glass gets >80 % of the
// opening. `:g` is the opaque dark-mirror glazing (per-instance tint), `:lit`
// the night glow overlay.
function sashPart(ctx, o) {
  const w = q5(o.w), h = q5(o.h), rec = q2(o.recess);
  const head = o.head, rise = head === 'round' ? w / 2 : head === 'seg' ? w * 0.17 : 0;
  const id = `castiron:sash:${w}x${h}:${o.style}:${rec}:${head}`;
  if (ctx.batcher.hasPart(id)) return id;
  const fz = -rec, fd = 0.07, st = 0.055;
  const items = [];
  items.push({ geom: box(w, st * 1.15, fd, { segY: 1 }), x: 0, y: h - st * 1.15, z: fz });
  items.push({ geom: box(w, st * 1.8, fd, { segY: 1 }), x: 0, y: 0, z: fz });
  items.push({ geom: box(st, h, fd, { segY: 1 }), x: -w / 2 + st / 2, y: 0, z: fz });
  items.push({ geom: box(st, h, fd, { segY: 1 }), x: w / 2 - st / 2, y: 0, z: fz });
  items.push({ geom: box(w - st * 2, 0.09, fd + 0.03, { segY: 1 }), x: 0, y: h * 0.615, z: fz });
  if (o.style === 'dh2') {
    for (const [y0, y1] of [[st * 1.8, h * 0.615], [h * 0.615 + 0.09, h - st * 1.15]]) {
      items.push({ geom: box(0.03, y1 - y0, 0.042, { segY: 1 }), x: 0, y: y0, z: fz });
    }
  }
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');

  // Glazing is split into a SKY band (upper ~38 %, full instance tint) and an
  // INTERIOR band (lower, vertex-darkened to ~0.24). A real loft window is a
  // bright reflected-sky rectangle over a near-black room; a single flat tone
  // is the loudest CG tell there is.
  const gi = [];
  const gw = w - st * 2 - 0.01;
  const gy0 = st * 1.8, gy1 = h - st * 1.15;
  const split = gy0 + (gy1 - gy0) * 0.60;
  const topQ = quad(gw, gy1 - split - 0.01);
  ensureColor(topQ, new THREE.Color(0.90, 0.90, 0.92));
  gi.push({ geom: topQ, x: 0, y: split, z: fz + 0.026 });
  const midQ = quad(gw, 0.14);
  ensureColor(midQ, new THREE.Color(0.52, 0.52, 0.55));
  gi.push({ geom: midQ, x: 0, y: split - 0.14, z: fz + 0.026 });
  const botQ = quad(gw, split - gy0 - 0.14);
  ensureColor(botQ, new THREE.Color(0.24, 0.24, 0.26));
  gi.push({ geom: botQ, x: 0, y: gy0, z: fz + 0.026 });
  if (rise > 0.02) {
    const R = head === 'round' ? w / 2 : (w * w) / (8 * rise) + rise / 2;
    const cy = rise - R;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + (w / n) * (i + 0.5);
      const top = cy + Math.sqrt(Math.max(0.0004, R * R - cx * cx));
      const fq = quad(w / n - 0.025, Math.max(0.04, top - 0.05));
      ensureColor(fq, new THREE.Color(1, 1, 1));
      gi.push({ geom: fq, x: cx, y: h - 0.01, z: fz + 0.026 });
    }
  }
  ctx.batcher.definePart(id + ':g', compose(gi), 'castiron:glassWin', { castShadow: false });
  const lg = quad(w - 0.18, h - 0.24);
  lg.translate(0, 0.14, fz + 0.04);
  ctx.batcher.definePart(id + ':lit', lg, 'litWindow',
    { castShadow: false, receiveShadow: false, visible: false });
  return id;
}

// Roller blind: a unit quad hung from its top edge, X/Y-scaled per window so
// one part id covers every drop on every opening size.
function shadePart(ctx) {
  const id = 'castiron:shade';
  if (ctx.batcher.hasPart(id)) return id;
  const g = quad(1, 1);
  g.translate(0, -1, 0);
  ctx.batcher.definePart(id, g, 'castiron:paintDull', { castShadow: false });
  return id;
}

// Dentil run — 14 small blocks at 0.145 m pitch on a soot-darkened back strip,
// X-scaled to any width. The corona above (part of the profile) casts the bar.
function dentilRunPart(ctx, kind) {
  const id = `castiron:dentils:${kind}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const s = kind === 'big' ? 1.35 : 1.0;
  const pitch = 0.145 * s;
  const nD = kind === 'big' ? 10 : 12;
  const bk = box(pitch * nD, 0.13 * s, 0.05, { segY: 1 });
  ensureColor(bk, new THREE.Color(0.62, 0.61, 0.58));       // cavity soot
  items.push({ geom: bk, x: 0, y: -0.005, z: 0.025 });
  for (let i = 0; i < nD; i++) {
    items.push({
      geom: box(0.072 * s, 0.115 * s, 0.135 * s, { segY: 1 }),
      x: (i - (nD - 1) / 2) * pitch, y: 0, z: 0.068 * s,
    });
  }
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');
  return id;
}

// Big scrolled modillion console under the crown corona.
function crownBracketPart(ctx, h, proj) {
  const H = q5(h), P = q5(proj);
  const id = `castiron:crownbrk:${H}:${P}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const zd = P * (0.22 + 0.78 * Math.pow(t, 0.48));
    const hh = H * (0.16 + 0.08 * t);
    items.push({ geom: box(0.16, hh, zd, { segY: 1 }), x: 0, y: H * (0.05 + 0.86 * t) - hh * 0.5, z: zd / 2 });
  }
  items.push({ geom: cylinder(0.12, 0.12, 0.20, 10), x: 0, y: H * 0.09, z: P * 0.21, rx: PI / 2 });
  const leaf = box(0.20, H * 0.36, 0.145, { segY: 1 });
  ensureColor(leaf, new THREE.Color(0.95, 0.945, 0.935));
  items.push({ geom: leaf, x: 0, y: H * 0.24, z: P * 0.19 });
  items.push({ geom: box(0.25, 0.06, P * 0.98, { segY: 1 }), x: 0, y: H - 0.06, z: P * 0.5 });
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');
  return id;
}

// Balustrade run over the ground-floor entablature (Gunther, 453 Broome).
function balusterRunPart(ctx, h) {
  const H = q5(h);
  const id = `castiron:balrun:${H}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const p = [
    [0.000, 0.00], [0.060, 0.02], [0.034, 0.11], [0.068, 0.30],
    [0.052, 0.50], [0.030, 0.66], [0.046, 0.86], [0.032, 1.00],
  ].map(([r, y]) => [r, y * (H - 0.11)]);
  for (let i = 0; i < 8; i++) {
    items.push({ geom: lathe(p, 6), x: (i - 3.5) * 0.22, y: 0.055, z: 0 });
  }
  items.push({ geom: box(1.76, 0.055, 0.24, { segY: 1 }), x: 0, y: 0, z: 0 });
  items.push({ geom: box(1.76, 0.065, 0.28, { segY: 1 }), x: 0, y: H - 0.065, z: 0 });
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');
  return id;
}

// Moulded cast-iron shopfront bulkhead: bolection frame, two recessed panels,
// a cellar louvre strip and a grimy base.
function bulkheadPanelPart(ctx, w, h) {
  const W = q5(w), H = q5(h);
  const id = `castiron:bulk:${W}x${H}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const bk = box(W, H, 0.07, { segY: 2 });
  items.push({ geom: bk, x: 0, y: 0, z: -0.02 });
  items.push({ geom: box(W, 0.075, 0.13, { segY: 1 }), x: 0, y: H - 0.075, z: 0.03 });   // capping
  items.push({ geom: box(W, 0.085, 0.12, { segY: 1 }), x: 0, y: 0, z: 0.025 });          // base
  const nP = Math.max(2, Math.round(W / 0.85));
  const pw = (W - 0.10) / nP;
  for (let i = 0; i < nP; i++) {
    const cx = -W / 2 + 0.05 + pw * (i + 0.5);
    items.push({ geom: box(pw - 0.07, H - 0.30, 0.045, { segY: 1 }), x: cx, y: 0.11, z: 0.018 });
    const rp = box(pw - 0.20, H - 0.46, 0.02, { segY: 1 });
    ensureColor(rp, new THREE.Color(0.78, 0.775, 0.755));
    items.push({ geom: rp, x: cx, y: 0.19, z: 0.03 });
    // cellar louvre slots in every other panel
    if (i % 2 === 0) {
      for (let s = 0; s < 3; s++) {
        const lv = box(pw - 0.30, 0.025, 0.03, { segY: 1 });
        ensureColor(lv, new THREE.Color(0.30, 0.295, 0.28));
        items.push({ geom: lv, x: cx, y: 0.24 + s * 0.075, z: 0.042 });
      }
    }
  }
  const g = compose(items);
  shadeYRange(g, 0, H, 0.66, 0.94);              // street grime up the bulkhead
  ctx.batcher.definePart(id, g, 'castiron:paint');
  return id;
}

// Shopfront plate glass + slim mullions (+ lit interior for the main size).
function shopGlassPart(ctx, w, h, rec, interior) {
  const W = q5(w), H = q5(h), R = q2(rec);
  const id = `castiron:shop:${W}x${H}:${R}`;
  if (ctx.batcher.hasPart(id)) return id;
  const nM = Math.max(1, Math.round(W / 1.6));
  const items = [];
  for (let i = 0; i <= nM; i++) {
    items.push({ geom: box(0.06, H, 0.10, { segY: 1 }), x: -W / 2 + (W / nM) * i, y: 0, z: -R + 0.05 });
  }
  items.push({ geom: box(W, 0.09, 0.12, { segY: 1 }), x: 0, y: H - 0.09, z: -R + 0.055 });
  items.push({ geom: box(W, 0.05, 0.11, { segY: 1 }), x: 0, y: H * 0.80, z: -R + 0.055 });
  items.push({ geom: box(W, 0.07, 0.11, { segY: 1 }), x: 0, y: 0, z: -R + 0.055 });
  ctx.batcher.definePart(id, compose(items), 'castiron:iron');
  const g = quad(W - 0.06, H - 0.12);
  g.translate(0, 0.04, -R + 0.015);
  ctx.batcher.definePart(id + ':g', g, 'castiron:glassBig', { castShadow: false });
  if (interior) {
    const inr = [];
    const d = 2.0;
    const mk = (gg, c) => { ensureColor(gg, c); return gg; };
    inr.push({ geom: mk(box(W, H, 0.05, { segY: 1 }), C(0x1b1815)), x: 0, y: 0, z: -R - d });
    inr.push({ geom: mk(box(W, 0.05, d, { segY: 1 }), C(0x272319)), x: 0, y: 0, z: -R - d / 2 });
    inr.push({ geom: mk(box(W * 0.58, 0.95, 0.55, { segY: 1 }), C(0x3a332a)), x: -W * 0.08, y: 0, z: -R - d * 0.46 });
    for (const sy of [1.40, 2.05]) {
      inr.push({ geom: mk(box(W * 0.78, 0.38, 0.26, { segY: 1 }), C(0x423a2f)), x: 0, y: sy, z: -R - d + 0.30 });
    }
    ctx.batcher.definePart(id + ':in', compose(inr), 'castiron:paintDull', { castShadow: false, receiveShadow: false });
    ctx.batcher.definePart(id + ':lt', box(W * 0.78, 0.05, 0.40, { segY: 1 }), 'litWindow',
      { castShadow: false, receiveShadow: false });
  }
  return id;
}

// Loft entrance: a pair of tall glazed metal doors with kick panel + transom.
function entryDoorPart(ctx, w, h) {
  const W = q5(w), H = q5(h);
  const id = `castiron:door:${W}x${H}`;
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  const dh = H - 0.62;
  const st = 0.075;
  items.push({ geom: box(W + 0.14, 0.10, 0.14, { segY: 1 }), x: 0, y: H - 0.10, z: 0.02 });
  items.push({ geom: box(W + 0.14, 0.09, 0.13, { segY: 1 }), x: 0, y: dh, z: 0.02 });
  for (const s of [-1, 1]) {
    items.push({ geom: box(0.09, H, 0.13, { segY: 2 }), x: s * (W / 2 + 0.045), y: 0, z: 0.02 });
  }
  const lw = (W - 0.05) / 2;
  for (const s of [-1, 1]) {
    const cx = s * (lw / 2 + 0.025);
    items.push({ geom: box(lw, st * 1.6, 0.06, { segY: 1 }), x: cx, y: 0, z: -0.02 });
    items.push({ geom: box(lw, st, 0.06, { segY: 1 }), x: cx, y: dh - st, z: -0.02 });
    items.push({ geom: box(st, dh, 0.06, { segY: 2 }), x: cx - lw / 2 + st / 2, y: 0, z: -0.02 });
    items.push({ geom: box(st, dh, 0.06, { segY: 2 }), x: cx + lw / 2 - st / 2, y: 0, z: -0.02 });
    items.push({ geom: box(lw - st * 2, 0.85, 0.055, { segY: 1 }), x: cx, y: 0.10, z: -0.02 });
    items.push({ geom: box(lw, 0.075, 0.055, { segY: 1 }), x: cx, y: 0.95, z: -0.02 });
    items.push({ geom: cylinder(0.022, 0.022, 1.05, 6), x: cx - s * (lw / 2 - 0.16), y: 0.95, z: 0.045 });
  }
  ctx.batcher.definePart(id, compose(items), 'castiron:iron');
  const gi = [
    { geom: quad(lw - st * 2, dh - 1.10), x: -(lw / 2 + 0.025), y: 1.03, z: 0.012 },
    { geom: quad(lw - st * 2, dh - 1.10), x: (lw / 2 + 0.025), y: 1.03, z: 0.012 },
    { geom: quad(W - 0.06, H - dh - 0.20), x: 0, y: dh + 0.11, z: 0.012 },
  ];
  ctx.batcher.definePart(id + ':g', compose(gi), 'castiron:glassBig', { castShadow: false });
  return id;
}

function anthemionPart(ctx) {
  const id = 'castiron:anthemion';
  if (ctx.batcher.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.40, 0.10, 0.12, { segY: 1 }), x: 0, y: 0, z: 0 });
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;
    const hh = 0.48 * (1 - Math.abs(t) * 0.45);
    const g = box(0.08, hh, 0.06, { segY: 1 });
    g.rotateZ(-t * 0.42);
    items.push({ geom: g, x: t * 0.125, y: 0.09, z: 0.015 });
  }
  items.push({ geom: cylinder(0.06, 0.065, 0.055, 8), x: 0, y: 0.07, z: 0.045, rx: PI / 2 });
  ctx.batcher.definePart(id, compose(items), 'castiron:paint');
  return id;
}

// Sidewalk hardware cluster: siamese standpipe, alarm bell, junction box.
function standpipePart(ctx) {
  const id = 'castiron:standpipe';
  if (ctx.batcher.hasPart(id)) return id;
  ctx.batcher.definePart(id, compose([
    { geom: cylinder(0.055, 0.06, 1.0, 8), x: 0, y: 0, z: 0.10 },
    { geom: cylinder(0.075, 0.075, 0.17, 8), x: -0.13, y: 0.9, z: 0.10, rz: PI / 2 },
    { geom: cylinder(0.075, 0.075, 0.17, 8), x: 0.13, y: 0.9, z: 0.10, rz: PI / 2 },
    { geom: cylinder(0.06, 0.06, 0.14, 8), x: -0.15, y: 0.9, z: 0.19, rx: PI / 2 },
    { geom: cylinder(0.06, 0.06, 0.14, 8), x: 0.15, y: 0.9, z: 0.19, rx: PI / 2 },
  ]), 'castiron:iron');
  return id;
}

function bellPart(ctx) {
  const id = 'castiron:bell';
  if (ctx.batcher.hasPart(id)) return id;
  ctx.batcher.definePart(id, compose([
    { geom: box(0.20, 0.26, 0.09, { segY: 1 }), x: 0, y: 0, z: 0.045 },
    { geom: lathe([[0.00, 0.00], [0.135, 0.02], [0.115, 0.10], [0.055, 0.16], [0.00, 0.17]], 10), x: 0, y: 0.30, z: 0.12 },
    { geom: cylinder(0.02, 0.02, 0.10, 6), x: 0, y: 0.26, z: 0.12 },
  ]), 'castiron:iron');
  return id;
}

// ---------------------------------------------------------------------------
// MOULDING PROFILES  ([out, up]; "out" lands on -Z, so place with ry = PI)
// ---------------------------------------------------------------------------
function entabPts(H, a) {
  return mono([
    [0.00, 0.000],
    [a * 0.22, 0.000], [a * 0.22, H * 0.125],
    [a * 0.36, H * 0.170], [a * 0.36, H * 0.250],
    [a * 0.28, H * 0.290], [a * 0.28, H * 0.520],   // frieze
    [a * 0.48, H * 0.575], [a * 0.48, H * 0.660],   // bed mould / dentil shelf
    [a * 1.00, H * 0.760], [a * 1.00, H * 0.930],   // SMOOTH CORONA — casts the bar
    [a * 0.76, H * 0.975], [a * 0.76, H * 1.000],
    [0.00, H * 1.000],
  ]);
}

function crownPts(H, a) {
  return mono([
    [0.00, 0.000],
    [a * 0.13, 0.000], [a * 0.13, H * 0.090],
    [a * 0.24, H * 0.140], [a * 0.24, H * 0.235],
    [a * 0.18, H * 0.275], [a * 0.18, H * 0.500],   // frieze (brackets in front)
    [a * 0.33, H * 0.555], [a * 0.33, H * 0.620],   // bed mould
    [a * 1.00, H * 0.755], [a * 1.00, H * 0.905],   // deep corona
    [a * 0.78, H * 0.965], [a * 0.78, H * 1.000],
    [0.00, H * 1.000],
  ]);
}

// ---------------------------------------------------------------------------
// BAY PLAN
// ---------------------------------------------------------------------------
function planBays(W, S) {
  const endW = Math.max(0.40, Math.min(S.endPierW, W * 0.095));
  let n = Math.round((W - 2 * endW) / S.bayPitch);
  n = Math.max(2, Math.min(9, n));
  const pitch = (W - 2 * endW) / n;
  const bays = [];
  for (let i = 0; i < n; i++) bays.push({ cx: -W / 2 + endW + pitch * (i + 0.5), w: pitch, i });
  const divs = [];
  for (let i = 1; i < n; i++) divs.push(-W / 2 + endW + pitch * i);
  return { bays, divs, endW, pitch, n };
}

// ---------------------------------------------------------------------------
// FACADE
// ---------------------------------------------------------------------------
function facade(ctx, rng, S, o) {
  const B = ctx.batcher, K = ctx.kit;
  const F = o.frame, W = o.width, primary = o.primary;
  const paint = S.paint;
  const P = planBays(W, S);
  const winW = q5(Math.max(1.15, Math.min(S.winW, P.pitch - S.pierW * 0.62)));
  const mb = (m, w, h, d, x, y, zf, opts = {}) => {
    if (w <= 0.004 || h <= 0.004 || d <= 0.004) return;
    B.addMerged(m, box(w, h, d), F.clone().multiply(tmat(x, y, zf - d / 2)), opts);
  };

  // ======================= structural wall + openings ======================
  const rows = [];
  const wallT = 0.34;
  const gTop = S.groundH - S.gEnt - 0.12;
  const gOps = P.bays.map((bay, i) => ({
    x: bay.cx, i, kind: 'shop',
    w: q5(Math.max(1.2, Math.min(bay.w - S.gColW - 0.02, 5.2))),
  }));
  let entryBay = -1;
  if (primary) {
    entryBay = S.entryLeft ? 0 : P.bays.length - 1;
    if (P.bays.length >= 4 && S.entryInner) entryBay = S.entryLeft ? 1 : P.bays.length - 2;
    gOps[entryBay].kind = 'entry';
  }
  rows.push({ y0: 0.05, y1: gTop, openings: gOps.map((g) => ({ x: g.x, w: g.w })) });

  const winRows = [];
  for (let f = 1; f < S.stories; f++) {
    const y0 = S.floorY[f], hF = S.floorH[f];
    const sill = y0 + S.apronH[f];
    rows.push({
      y0: y0 + 0.02, y1: y0 + hF - S.entH[f],
      openings: P.bays.map((bay) => ({
        x: bay.cx, w: winW, y0: sill,
        y1: Math.min(y0 + hF - S.entH[f] - 0.02, sill + S.winH[f] + S.rise),
      })),
    });
    winRows.push({ f, y0, hF, sill });
  }
  punchedWall(ctx, F, {
    width: W, height: S.H, depth: wallT, mat: 'castiron:paint', tint: paint,
    rows, grime: 0.30, aoTop: S.crownBase,
  });

  // ======================= end piers (channelled pilasters) ================
  for (const s of [-1, 1]) {
    const px = s * (W / 2 - P.endW / 2);
    mb('castiron:paint', P.endW, S.crownBase, 0.24, px, 0, 0.24, { tint: paint, grime: 0.34, aoTop: S.crownBase });
    const bh = 0.58;
    const nq = Math.floor(S.crownBase / bh);
    for (let i = 0; i < nq; i++) {
      mb('castiron:paint', P.endW * (i % 2 === 0 ? 0.98 : 0.78), bh - 0.055, 0.09,
        px, 0.03 + i * bh, 0.33, { tint: paint, grime: 0.34 });
    }
    for (let f = 1; f < S.stories; f++) {
      const y = S.floorY[f];
      mb('castiron:paint', P.endW + 0.12, 0.08, 0.40, px, y - 0.08, 0.40, { tint: paint });
      mb('castiron:paint', P.endW + 0.06, 0.06, 0.34, px, y + 0.03, 0.34, { tint: paint });
    }
    // rainwater leader running the full height of one pier
    if (primary && s === (S.entryLeft ? 1 : -1)) {
      mb('castiron:iron', 0.10, S.crownBase - 0.2, 0.10, px + s * (P.endW / 2 - 0.10), 0.25, 0.42,
        { tint: C(0x4a4640), grime: 0.4 });
      for (let f = 1; f < S.stories; f++) {
        mb('castiron:iron', 0.15, 0.08, 0.15, px + s * (P.endW / 2 - 0.10), S.floorY[f] - 0.4, 0.44, { tint: C(0x4a4640) });
      }
    }
  }

  // ======================= ground colonnade + shopfronts ===================
  const dRun = dentilRunPart(ctx, 'small');
  const dBig = dentilRunPart(ctx, 'big');
  {
    const gh = S.groundH - S.gEnt;
    const grp = colGroupPart(ctx, { h: gh, r: S.gColR, n: 1, flute: true, grime: true, web: 0 });
    const xs = [...P.divs, -W / 2 + P.endW * 0.66, W / 2 - P.endW * 0.66];
    if (S.denseGround) for (const bay of P.bays) xs.push(bay.cx);
    for (const x of xs) B.addInstance(grp, at(F, x, 0.02, S.gColZ), paint);

    const rec = S.gRecess;
    const mainW = q5(Math.max(1.2, gOps[0].w - 0.12));
    const mainH = q5(gTop - 0.78);
    const shopId = shopGlassPart(ctx, mainW, mainH, rec, true);
    const bulkId = bulkheadPanelPart(ctx, mainW + 0.1, 0.66);
    const liner = C(0x131110);

    for (const g of gOps) {
      // black recess box so every column silhouettes against it
      mb('castiron:paintDull', g.w + 0.05, 0.07, rec + 2.1, g.x, gTop - 0.07, -rec + 0.05, { tint: liner });
      for (const s of [-1, 1]) {
        mb('castiron:paintDull', 0.06, gTop, rec + 2.1, g.x + s * (g.w / 2 + 0.01), 0.02, -rec + 0.05, { tint: liner });
      }
      if (g.kind === 'entry' && primary) {
        const dw = Math.min(2.1, g.w - 0.6);
        mb('castiron:paintDull', g.w + 0.06, gTop, 0.05, g.x, 0.02, -rec - 0.90, { tint: liner });
        const dId = entryDoorPart(ctx, dw, 3.30);
        B.addInstance(dId, at(F, g.x, 0.06, -rec - 0.06), C(S.doorHex));
        B.addInstance(dId + ':g', at(F, g.x, 0.06, -rec - 0.06), C(0x121820));
        const slw = q5((g.w - dw - 0.40) / 2);
        if (slw > 0.55) {
          const sg = shopGlassPart(ctx, slw, 3.30, rec, false);
          for (const s of [-1, 1]) {
            const sx = g.x + s * (dw / 2 + 0.20 + slw / 2);
            B.addInstance(sg, at(F, sx, 0.30, 0), paint);
            B.addInstance(sg + ':g', at(F, sx, 0.30, 0), C(S.glzHex));
          }
        }
        B.addInstance(bellPart(ctx), at(F, g.x + g.w / 2 + 0.10, 3.2, 0.30), C(0x6a1d16));
        mb('castiron:paint', 0.34, 0.26, 0.05, g.x + g.w / 2 + 0.18, 2.55, 0.36, { tint: C(0x121212) });
        if (S.entryPediment) {
          const pw = Math.min(g.w + 0.55, P.pitch + 0.5);
          const pts = mono([[0, 0], [0.34, 0.03], [0.46, 0.12], [0.38, 0.17], [0.38, 0.25], [0, 0.27]]);
          B.addMerged('castiron:paint', profileAlongX(pts, pw), at(F, g.x, gh - 0.92, 0.40, PI), { tint: paint });
          const steps = 5, ph = 0.46;
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            mb('castiron:paint', pw * (1 - t * 0.90), ph / steps + 0.012, 0.60,
              g.x, gh - 0.65 + t * ph, 0.60, { tint: paint });
          }
          for (const s of [-1, 1]) {
            mb('castiron:paint', 0.16, 1.15, 0.52, g.x + s * (pw / 2 - 0.13), gh - 2.07, 0.54, { tint: paint });
          }
        }
        continue;
      }
      B.addInstance(bulkId, at(F, g.x, 0.04, -rec + 0.10), paint);
      B.addInstance(shopId, at(F, g.x, 0.70, 0), paint);
      B.addInstance(shopId + ':g', at(F, g.x, 0.70, 0), C(S.glzHex));
      const gated = S.commercial && rng.bool(0.18);
      if (!gated) {
        B.addInstance(shopId + ':in', at(F, g.x, 0.70, 0));
        B.addInstance(shopId + ':lt', at(F, g.x, 0.70 + mainH - 1.15, -rec - 1.70), C(0x6b5c3f));
      } else {
        const q = quad(mainW, mainH - 0.12);
        const u = q.attributes.uv;
        for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * mainW, u.getY(i) * (mainH - 0.12));
        B.addMerged(rng.bool(0.5) ? 'rollGateTagged' : 'rollGate', q,
          at(F, g.x, 0.74, -rec + 0.10), { worldUV: false, tint: C(0x565a5e) });
        mb('castiron:paintDull', mainW + 0.1, 0.28, 0.3, g.x, 0.62 + mainH - 0.18, -rec + 0.24, { tint: C(0x353535) });
      }
      // shop signage: a real board, not a floating decal
      if (S.commercial && primary && rng.bool(0.42)) {
        const sw = Math.min(mainW - 0.55, 2.6);
        const uv = ctx.extra.signUvFor((S.signBase + g.i) % ctx.extra.signCount);
        const sy = gTop - 0.34;
        mb('castiron:paintDull', sw + 0.10, 0.48, 0.11, g.x, sy - 0.03, 0.18, { tint: C(0x161616) });
        B.addMerged(B.M.has('castiron:sign') ? 'castiron:sign' : 'signs', quad(sw, 0.40, uv),
          at(F, g.x, sy + 0.02, 0.19), { worldUV: false });
      }
    }
  }

  // ======================= upper colonnade + windows =======================
  const shId = shadePart(ctx);
  for (const wr of winRows) {
    const f = wr.f;
    const fT = paint.clone().multiplyScalar(0.955 + 0.045 * (f / Math.max(1, S.stories - 1)));
    const colH = q5(wr.hF - S.entH[f] - 0.02);
    const grp = colGroupPart(ctx, {
      h: colH, r: S.colR, n: S.colN, flute: S.upperFlute && f <= 2, web: S.colZ - S.colR * 0.55,
    });
    for (const d of P.divs) B.addInstance(grp, at(F, d, wr.y0 + 0.02, S.colZ), fT);

    const surr = winSurroundPart(ctx, {
      w: winW, h: S.winH[f], recess: S.winRecess, head: S.head, apronH: S.apronH[f] - 0.20,
    });
    const sash = sashPart(ctx, {
      w: winW, h: S.winH[f], recess: S.winRecess, style: S.sashStyle, head: S.head,
    });
    for (const bay of P.bays) {
      const k = (bay.i * 5 + f * 3) % 12;
      // break perfect registration: sub-centimetre casting tolerance + the
      // slightly different fade every panel of paint takes
      const jy = ((k % 5) - 2) * 0.013;
      const wT = fT.clone().multiplyScalar(0.965 + 0.055 * ((k * 7) % 6) / 5);
      const m = at(F, bay.cx, wr.sill + jy, 0);
      B.addInstance(surr, m, wT);
      B.addInstance(sash, m, C(S.sashHex));
      B.addInstance(sash + ':g', m, C(S.glzTones[k]));
      if (k % 3 === 0) B.addInstance(sash + ':lit', m, C(0xffd9a2));
      // per-window blind at a varied drop, on ~45 % of openings
      const drop = [0, 0, 0, 0.22, 0.38, 0, 0.62, 0, 0.30, 0.85, 0, 0.48][k];
      if (drop > 0.01) {
        B.addInstance(shId, sm(F, bay.cx, wr.sill + S.winH[f] - 0.10, -S.winRecess + 0.012, 0,
          winW - 0.16, (S.winH[f] - 0.2) * drop, 1), C(S.shadeTones[k % S.shadeTones.length]));
      }
      // projecting AC sleeve on a few bays
      if (f >= 2 && k === 7) {
        K.acUnit(at(F, bay.cx + (bay.i % 2 ? 0.28 : -0.24), wr.sill + 0.02, 0.02),
          { tint: C(bay.i % 2 ? 0x8e8e88 : 0xa2a09a) });
      }
    }
  }

  // ======================= floor-line entablatures =========================
  for (let f = 1; f < S.stories; f++) {
    const isGround = f === 1;
    const H = isGround ? S.gEnt : S.entH[f - 1];
    const proj = isGround ? S.gEntProj : S.entProj;
    const yTop = S.floorY[f];
    const y = yTop - H;
    B.addMerged('castiron:paint', profileAlongX(entabPts(H, proj), W + 0.02),
      at(F, 0, y, 0.0, PI), { tint: paint });
    // end blocks close the raw extrusion cut where the band meets the party wall
    for (const s of [-1, 1]) {
      mb('castiron:paint', 0.22, H, proj * 1.02, s * (W / 2 - 0.10), y, proj * 1.00, { tint: paint });
    }
    const dp = isGround ? dBig : dRun;
    const runLen = isGround ? 0.145 * 1.35 * 10 : 0.145 * 12;
    const runs = Math.max(1, Math.round(W / runLen));
    const sx = (W / runs) / runLen;
    const dy = y + H * (isGround ? 0.615 : 0.600);
    for (let i = 0; i < runs; i++) {
      B.addInstance(dp, sm(F, -W / 2 + (W / runs) * (i + 0.5), dy, proj * 0.40, 0, sx, 1, 1), paint);
    }
    if (isGround && S.balustrade) {
      const bh = 0.46;
      const br = balusterRunPart(ctx, bh);
      const nr = Math.max(1, Math.round(W / 1.76));
      const bsx = (W / nr) / 1.76;
      for (let i = 0; i < nr; i++) {
        B.addInstance(br, sm(F, -W / 2 + (W / nr) * (i + 0.5), yTop, proj * 0.74, 0, bsx, 1, 1), paint);
      }
    }
  }

  // ======================= crown cornice + parapet =========================
  {
    const cB = S.crownBase, cH = S.crownH, proj = S.crownProj;
    mb('castiron:paint', W + 0.02, cH * 0.53, proj * 0.20, 0, cB, proj * 0.20, { tint: paint, aoTop: cB + cH });
    B.addMerged('castiron:paint', profileAlongX(crownPts(cH, proj), W + 0.02),
      at(F, 0, cB, 0.0, PI), { tint: paint });
    // modillions on ~0.58 m pitch, not one per bay
    const brk = crownBracketPart(ctx, cH * 0.70, proj * 0.80);
    const nB = Math.max(3, Math.round(W / 0.82));
    for (let i = 0; i < nB; i++) {
      const bx = -W / 2 + (W / nB) * (i + 0.5);
      B.addInstance(brk, at(F, bx, cB + cH * 0.03, proj * 0.16), paint);
    }
    const runLen = 0.145 * 1.35 * 10;
    const runs = Math.max(1, Math.round(W / runLen));
    const dsx = (W / runs) / runLen;
    for (let i = 0; i < runs; i++) {
      B.addInstance(dBig, sm(F, -W / 2 + (W / runs) * (i + 0.5), cB + cH * 0.575, proj * 0.28, 0, dsx, 1, 1), paint);
    }

    // crown end blocks + a short return along the party line, so the corona
    // never terminates in a raw extrusion cut against the neighbour's brick
    for (const s of [-1, 1]) {
      mb('castiron:paint', 0.34, cH, proj * 1.02, s * (W / 2 - 0.16), cB, proj * 1.00, { tint: paint });
      mb('castiron:paint', 0.24, cH * 0.30, proj * 1.06, s * (W / 2 - 0.11), cB + cH * 0.70, proj * 1.04, { tint: paint });
    }

    const top = cB + cH;
    const paraSegs = [];
    if (S.crownStyle === 'pediment') {
      // a real raking pediment: a fine-stepped tympanum wall (24 courses reads
      // as a straight rake at street distance) plus two raking cornice members
      const pw = Math.min(W * 0.52, 7.0);
      paraSegs.push([-W / 2, -pw / 2, S.paraH], [pw / 2, W / 2, S.paraH]);
      const rise = S.pedRise * 1.35;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        mb('castiron:paint', pw * (1 - t), rise / steps + 0.010, 0.32,
          0, top + S.paraH + t * rise, 0.03, { tint: paint });
      }
      // raking cornice: a moulding running up each slope to the apex
      {
        const ang = Math.atan2(rise, pw / 2);
        const len = Math.hypot(rise, pw / 2);
        for (const s of [-1, 1]) {
          const rot = s < 0 ? ang : PI - ang;        // always climbs to the apex
          for (const [th, dz, dy] of [[0.14, 0.46, 0.0], [0.08, 0.58, 0.15]]) {
            const g = box(len, th, dz, { segY: 1 });
            g.translate(len / 2, -th / 2, 0);
            g.rotateZ(rot);
            B.addMerged('castiron:paint', g,
              F.clone().multiply(tmat(s * pw / 2, top + S.paraH + dy, dz / 2 - 0.02)), { tint: paint });
          }
        }
      }
      mb('castiron:paint', Math.min(1.6, pw * 0.34), 0.60, 0.10, 0, top + S.paraH + 0.18, -0.02,
        { tint: paint.clone().multiplyScalar(0.90) });
      paraSegs.push([-pw / 2, pw / 2, S.paraH]);
      if (S.anthemion) {
        B.addInstance(anthemionPart(ctx), at(F, 0, top + S.paraH + rise + 0.02, 0.16), paint);
      }
    } else if (S.crownStyle === 'segArch') {
      const pw = Math.min(W * 0.56, 7.4);
      paraSegs.push([-W / 2, -pw / 2, S.paraH], [pw / 2, W / 2, S.paraH]);
      const steps = 7, rise = S.pedRise * 0.85;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const y = Math.sin(t * PI) * rise;
        const segW = pw / steps + 0.02;
        const cx = -pw / 2 + (pw / steps) * (i + 0.5);
        mb('castiron:paint', segW, S.paraH + y, 0.34, cx, top, 0.04, { tint: paint });
        mb('castiron:paint', segW + 0.02, 0.07, 0.50, cx, top + S.paraH + y, 0.11, { tint: paint });
      }
    } else {
      paraSegs.push([-W / 2, W / 2, S.paraH]);
    }
    for (const [a, b, h] of paraSegs) {
      mb('castiron:paint', b - a, h, 0.34, (a + b) / 2, top, 0.04, { tint: paint });
      mb('castiron:paint', b - a + 0.02, 0.07, 0.50, (a + b) / 2, top + h, 0.11, { tint: paint });
    }
  }

  // ======================= sidewalk fittings ===============================
  if (primary) {
    B.addInstance(standpipePart(ctx), at(F, -W / 2 + P.endW * 0.5, 0.28, 0.40), C(0x6d1c14));
  }
  return P;
}

// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const B = ctx.batcher, K = ctx.kit;
  ensureMaterials(ctx);
  const W = lot.width, D = lot.depth;

  const stories = Math.max(4, Math.min(6, lot.stories || rng.weighted([[4, 20], [5, 42], [6, 38]])));

  // ---- storey heights: the ground floor is the GRAND storey, upper floors
  // diminish upward. Three distinct upper heights keeps the part-id count sane.
  const groundH = q5(rng.range(4.70, 5.25));
  const h2 = Math.round(rng.range(4.20, 4.40) * 10) / 10;
  const hMid = Math.round((h2 - rng.range(0.20, 0.32)) * 10) / 10;
  const hTop = Math.round((hMid - rng.range(0.22, 0.34)) * 10) / 10;
  const floorH = [groundH, h2];
  for (let f = 2; f < stories - 1; f++) floorH.push(hMid);
  if (stories > 2) floorH.push(hTop);
  const floorY = [0];
  for (let f = 1; f <= stories; f++) floorY.push(floorY[f - 1] + floorH[f - 1]);
  const H = floorY[stories];
  const crownH = q5(rng.range(1.34, 1.58));

  // ---- bay composition: derive the pier from the actual trim widths so the
  // opening ends up ~70-76 % of the bay, as the real fronts do.
  const colN = rng.weighted([[2, 58], [1, 42]]);
  const colR = q2(colN === 2 ? rng.range(0.120, 0.150) : rng.range(0.150, 0.180));
  const colOuter = colN === 2 ? colR * 2.30 + colR * 1.88 : colR * 1.88;
  const pierW = q5(colOuter + 2 * JAMB_TOT + 0.30);
  const targetWin = q5(rng.range(1.36, 1.56));
  const bayPitch = q5(targetWin + pierW);
  const gColR = q2(rng.range(0.165, 0.195));

  // window head style must be known before the vertical split: a round arch
  // eats w/2 of the storey above the sash.
  const head = rng.weighted([['flat', 44], ['seg', 24], ['round', 32]]);
  const endPierW = rng.range(0.88, 1.20);
  // provisional front pitch, to size the opening
  const provEnd = Math.max(0.34, Math.min(endPierW, W * 0.075));
  const provN = Math.max(2, Math.min(9, Math.round((W - 2 * provEnd) / bayPitch)));
  const provPitch = (W - 2 * provEnd) / provN;
  const winW = q5(Math.max(1.15, Math.min(targetWin, provPitch - pierW + 0.06)));
  const rise = head === 'round' ? winW / 2 : head === 'seg' ? winW * 0.17 : 0;
  const headExtra = head === 'flat' ? 0.30 : 0.34;

  const winH = [0], entH = [0], apronH = [0];
  for (let f = 1; f < stories; f++) {
    const hF = floorH[f];
    const e = q5(0.54 + hF * 0.020);
    const budget = hF - e - headExtra - rise;         // apron + sash
    let wh = q5(Math.min(hF * 0.80 - rise * 0.50, budget - 0.24));
    wh = Math.max(1.95, Math.min(3.20, wh));
    winH[f] = wh;
    entH[f] = e;
    apronH[f] = q5(Math.max(0.22, budget - wh));
  }
  const crownBase = H - entH[stories - 1];

  // ---- paint (refs/boroughs/soho-ATTRIBUTION.md, albedo held to ~0.55-0.66
  //      so mouldings keep their shadows and noon can't bleach it) -----------
  // flatter distribution: a SoHo block is a paint riot, never one cream
  const paintHex = rng.weighted([
    [0xA79F8A, 12],   // cream
    [0xAEABA0, 9],    // white
    [0x979993, 9],    // dove grey
    [0x858A8D, 9],    // cool blue-grey
    [0x868D83, 8],    // celadon
    [0x9C8F6B, 8],    // buff / pale ochre
    [0x7A7F70, 7],    // sage
    [0x745F47, 5],    // bare weathered iron (rust-tan)
    [0x6D4038, 6],    // oxblood
    [0x2B342E, 6],    // dark green
    [0x1E201F, 4],    // near-black
  ]);
  const paint = C(paintHex);
  {
    const hsl = { h: 0, s: 0, l: 0 };
    paint.getHSL(hsl);
    paint.setHSL(
      hsl.h + rng.range(-0.012, 0.012),
      Math.max(0, hsl.s + rng.range(-0.02, 0.03)),
      Math.min(0.90, Math.max(0.015, hsl.l * rng.range(0.955, 1.04))),
    );
  }
  const dark = paintHex === 0x2B342E || paintHex === 0x1E201F;

  const S = {
    stories, groundH, floorH, floorY, H, crownH, crownBase,
    winH, winW, entH, apronH, bayPitch, colN, colR, pierW, head, rise,
    paint, paintHex,
    sashHex: dark
      ? rng.weighted([[0xb5b2a9, 3], [0x191b1a, 2]])
      : rng.weighted([[0x212520, 5], [0x1a1c21, 4], [0x36261c, 2], [0xc4c1b7, 3]]),
    // opaque dark-mirror glazing. Loft interiors read near-black by day; a few
    // bays show a lit ceiling or a shaded room so the grid never repeats.
    glzTones: [
      0x6d7a85, 0x5c6a76, 0x7a8792, 0x4e5a66, 0x66737e, 0x84909a,
      0x59656f, 0x6f7c87, 0x47535e, 0x7e8a94, 0x606d78, 0x525e69,
    ],
    shadeTones: [0xa9a496, 0xb6b1a4, 0x8f8a7c, 0xc0bbae, 0x7d786c],
    glzHex: 0x2b333a,
    doorHex: dark ? 0xa8a49a : rng.weighted([[0x1b1d18, 4], [0x2a2019, 3], [0x171d25, 2]]),
    endPierW,
    // colonnettes stand clear: axis 0.26-0.31 out, so a 0.13-0.17 m slot runs
    // behind each shaft between the jamb architraves
    colZ: q2(rng.range(0.26, 0.31)),
    gColR, gColW: gColR * 2.9,
    gColZ: q2(rng.range(0.62, 0.74)),
    gRecess: q2(rng.range(0.46, 0.58)),
    gEnt: q5(rng.range(0.92, 1.14)),
    gEntProj: q2(rng.range(0.48, 0.56)),
    entProj: q2(rng.range(0.40, 0.48)),
    crownProj: q2(rng.range(0.92, 1.08)),
    winRecess: q2(rng.range(0.26, 0.34)),
    sashStyle: rng.weighted([['dh1', 52], ['dh2', 48]]),
    upperFlute: rng.bool(0.62),
    denseGround: rng.bool(0.30),
    balustrade: rng.bool(0.44),
    crownStyle: rng.weighted([['flat', 40], ['pediment', 34], ['segArch', 26]]),
    paraH: q5(rng.range(0.46, 0.82)),
    pedRise: rng.range(0.55, 1.05),
    anthemion: rng.bool(0.4),
    entryLeft: rng.bool(0.5),
    entryInner: rng.bool(0.35),
    entryPediment: rng.bool(0.34),
    commercial: !!lot.commercial,
    signBase: rng.int(0, 7),
  };

  const frame = lot.frame;

  facade(ctx, rng, S, { frame, width: W, primary: true });

  // ======================= side walls ======================================
  const partyMat = 'castiron:brickParty';
  const partyTint = C(0xc7bdae);
  const wallT = 0.36;
  for (const side of [-1, 1]) {
    const sub = at(frame, side * (W / 2), 0, -D / 2, side < 0 ? -PI / 2 : PI / 2);
    if (lot.corner === side && D > 8) {
      facade(ctx, rng, S, { frame: sub, width: D, primary: false });
      continue;
    }
    const rows = [];
    const nOp = rng.int(0, 3);
    for (let i = 0; i < nOp; i++) {
      const f = rng.int(Math.max(1, stories - 3), stories - 1);
      const y = floorY[f] + rng.range(0.9, 1.4);
      rows.push({ y0: y, y1: y + 1.6, openings: [{ x: rng.range(-D / 2 + 2.5, D / 2 - 2.5), w: 1.15 }] });
    }
    rows.sort((a, b) => a.y0 - b.y0);
    const clean = [];
    let last = -1;
    for (const r of rows) { if (r.y0 > last + 0.3) { clean.push(r); last = r.y1; } }
    punchedWall(ctx, sub, {
      width: D, height: H, depth: wallT, mat: partyMat, tint: partyTint, rows: clean, grime: 0.36,
    });
    for (const r of clean) {
      for (const op of r.openings) {
        K.window({ w: 1.1, h: q5(r.y1 - r.y0), style: 'dh1', recess: 0.12 },
          sub.clone().multiply(tmat(op.x, r.y0, 0)), { tint: C(0x35352f) });
      }
    }
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const z0 = -D + (D / steps) * i, z1 = -D + (D / steps) * (i + 1);
      const ph = 0.32 + (steps - 1 - i) * 0.26;
      B.addMerged(partyMat, box(wallT, ph, z1 - z0),
        at(frame, side * (W / 2 - wallT / 2), H, (z0 + z1) / 2), { tint: partyTint });
      B.addMerged('limestone', box(wallT + 0.06, 0.07, z1 - z0),
        at(frame, side * (W / 2 - wallT / 2), H + ph, (z0 + z1) / 2));
    }
    // the crown + every floor band RETURNS around the corner
    const retLen = Math.min(1.15, D * 0.09);
    B.addMerged('castiron:paint', profileAlongX(crownPts(crownH, S.crownProj), retLen),
      sub.clone().multiply(tmat(-D / 2 + retLen / 2, crownBase, 0.0, PI)), { tint: paint });
    B.addMerged('castiron:paint', box(retLen, S.paraH, 0.34),
      sub.clone().multiply(tmat(-D / 2 + retLen / 2, crownBase + crownH, -0.15)), { tint: paint });
    for (let f = 1; f < stories; f++) {
      const eh = f === 1 ? S.gEnt : entH[f - 1];
      const pr = f === 1 ? S.gEntProj : S.entProj;
      B.addMerged('castiron:paint', profileAlongX(entabPts(eh, pr), retLen * 0.72),
        sub.clone().multiply(tmat(-D / 2 + retLen * 0.36, floorY[f] - eh, 0.0, PI)), { tint: paint });
    }
  }

  // ======================= rear wall =======================================
  {
    const sub = at(frame, 0, 0, -D, PI);
    const rows = [];
    const nb = Math.max(2, Math.floor(W / 3.2));
    const xs = [];
    for (let i = 0; i < nb; i++) xs.push(-W / 2 + (W / nb) * (i + 0.5));
    for (let f = 1; f < stories; f++) {
      rows.push({
        y0: floorY[f] + 1.0, y1: floorY[f] + 2.85,
        openings: xs.filter(() => rng.bool(0.82)).map((x) => ({ x, w: 1.2 })),
      });
    }
    punchedWall(ctx, sub, { width: W, height: H, depth: wallT, mat: partyMat, tint: C(0xc2b9a9), rows, grime: 0.36 });
    for (const r of rows) {
      for (const op of r.openings) {
        K.window({ w: 1.2, h: 1.85, style: 'dh1', recess: 0.12 },
          sub.clone().multiply(tmat(op.x, r.y0, 0)), { tint: C(0x35352f) });
      }
    }
    B.addMerged(partyMat, box(W - 0.02, 0.5, wallT), at(frame, 0, H, -D + wallT / 2), { tint: C(0xc2b9a9) });
    B.addMerged('limestone', box(W - 0.02, 0.08, wallT + 0.08), at(frame, 0, H + 0.5, -D + wallT / 2));
  }

  // ======================= roof ============================================
  flatRoof(ctx, frame, {
    width: W, depth: D, height: H, parapet: 0,
    mat: partyMat, tint: partyTint, roofMat: rng.bool(0.55) ? 'roofSilver' : 'roofBlack',
  });
  K.bulkhead(at(frame, rng.range(-W * 0.28, W * 0.28), H, -D * rng.range(0.42, 0.68)), {
    w: rng.range(2.4, 3.3), d: rng.range(2.2, 3.0), h: rng.range(2.4, 3.1),
    mat: rng.bool(0.65) ? partyMat : 'concrete', tint: partyTint,
  });
  if (rng.bool(0.62)) {
    K.waterTower(at(frame, rng.range(-W * 0.22, W * 0.22), H, -D * rng.range(0.38, 0.66), rng.range(0, PI)), {
      legH: rng.pick([2.8, 3.6, 5.0]), r: rng.pick([1.8, 2.0]), hBody: rng.pick([3.4, 4.2]),
      tint: new THREE.Color().setHSL(0.072, rng.range(0.16, 0.30), rng.range(0.24, 0.36)),
    });
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    K.vent(at(frame, rng.range(-W * 0.40, W * 0.40), H, -D * rng.range(0.20, 0.85)),
      { kind: rng.pick(['pipe', 'pipe', 'goose', 'whirly']), tint: C(rng.weighted([[0x8d8b86, 3], [0x6a655e, 2]])) });
  }
  for (let i = 0; i < rng.int(0, 2); i++) {
    K.hvac(at(frame, rng.range(-W * 0.28, W * 0.28), H, -D * rng.range(0.30, 0.80), rng.range(0, PI)),
      { tint: C(rng.weighted([[0x8a8d90, 3], [0x6f7274, 2], [0x9a938a, 2]])) });
  }
  if (stories >= 5 && rng.bool(0.45)) {
    const pw = rng.range(2.8, 3.8), pd = rng.range(3.2, 4.4), ph = rng.range(2.9, 3.8);
    const px = rng.range(-W * 0.2, W * 0.2), pz = -D * rng.range(0.32, 0.58);
    B.addMerged(partyMat, box(pw, ph, pd), at(frame, px, H, pz), { tint: partyTint, aoTop: H + ph });
    B.addMerged('limestone', box(pw + 0.2, 0.08, pd + 0.2), at(frame, px, H + ph, pz));
  }

  // ======================= fire escape =====================================
  if (rng.bool(0.62)) {
    const P0 = planBays(W, S);
    const bay = P0.bays[rng.bool(0.5) ? 0 : P0.bays.length - 1];
    const feW = Math.min(3.6, Math.max(2.4, P0.pitch - 0.20));
    const feFirst = floorY[1] + S.apronH[1] + 0.04;
    const feLast = floorY[stories - 1] + S.apronH[stories - 1] + 0.04;
    const feFloors = stories - 1;
    const feH = (feLast - feFirst) / Math.max(1, feFloors - 1);
    K.fireEscape(
      { width: feW, floors: feFloors, floorH: feH, firstY: feFirst },
      at(frame, bay.cx, 0, S.colZ + 0.42),
      // paint-matched escapes only on light-painted fronts; dark iron otherwise
      // (a rust-tan or oxblood front with a matching escape reads as a material error)
      { tint: (rng.bool(0.45) && paint.getHSL({ h: 0, s: 0, l: 0 }).l > 0.62) ? paint.clone().multiplyScalar(0.78) : C(0x171614) },
    );
  }

  return { height: H + crownH };
}
