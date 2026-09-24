// landmarkKit.js — reusable low-poly architectural geometry helpers (KIT) for the
// NYC landmark builders. three.js r185, ES module.
//
// Conventions:
//   * units are meters, y-up
//   * helpers are BOTTOM-based unless noted: an element created with option {y}
//     occupies vertical space [y, y + height]. (sphere and disc are CENTER-based.)
//   * materials are shared through a cache keyed by color+options — never dispose
//   * geometry is cached/shared where cheap (unit box, repeated cylinders, cones...)
import * as THREE from 'three';
import { applyLightTrim, applySkyGlass, applySkyMetal } from '../world/materials.js';

/* --------------------------------- materials --------------------------------- */
const _mats = new Map();

// Cached material factory. mat(0xc8bfae, { rough, metal, emissive, emissiveIntensity,
// flat, basic, ds }). `basic:true` -> unlit MeshBasicMaterial (glowing billboards).
// `ds:true` -> DoubleSide.
export function mat(hex, opts = {}) {
  const rough = opts.rough === undefined ? 0.85 : opts.rough;
  const metal = opts.metal === undefined ? 0.0 : opts.metal;
  const emissive = opts.emissive === undefined ? 0x000000 : opts.emissive;
  const ei = opts.emissiveIntensity === undefined ? 1.0 : opts.emissiveIntensity;
  const flat = opts.flat === undefined ? true : opts.flat;
  const basic = !!opts.basic, ds = !!opts.ds;
  // skyGlass / skyMetal: the analytic sky-and-sun mirror from materials.js.
  // Landmark curtain walls and architectural metal had NO reflection at all
  // (critic r5 #2, #21) because their only specular source was the IBL and
  // lighting.md cut scene.environmentIntensity to 0.14 - see
  // docs/notes/facades-r6.md section 0. Declared on the shared GLS / MET / mCr
  // option objects, so every glass landmark and every metal crown gets it at once.
  const skyG = opts.skyGlass || null, skyM = opts.skyMetal || null;
  const key = (basic ? 'B' : 'S') + hex + '|' + rough + '|' + metal + '|' + emissive +
    '|' + ei + '|' + (flat ? 1 : 0) + (ds ? 'D' : '') +
    (skyG ? '|G' + JSON.stringify(skyG) : '') + (skyM ? '|M' + JSON.stringify(skyM) : '');
  let m = _mats.get(key);
  if (!m) {
    if (basic) {
      m = new THREE.MeshBasicMaterial({ color: hex, side: ds ? THREE.DoubleSide : THREE.FrontSide });
    } else {
      m = applyLightTrim(new THREE.MeshStandardMaterial({
        color: hex, roughness: rough, metalness: metal, emissive,
        emissiveIntensity: ei, flatShading: flat,
        side: ds ? THREE.DoubleSide : THREE.FrontSide
      }));
      if (skyM) applySkyMetal(m, skyM);
      else if (skyG) applySkyGlass(m, skyG);
    }
    _mats.set(key, m);
  }
  return m;
}

/* --------------------------------- geometry ---------------------------------- */
const _geos = new Map();
function geo(key, make) {
  let g = _geos.get(key);
  if (!g) { g = make(); _geos.set(key, g); }
  return g;
}
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);   // bottom-anchored
const UNIT_BOX_C = new THREE.BoxGeometry(1, 1, 1);                       // centered
const UNIT_CONE = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);  // bottom-anchored
const UNIT_PYR = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1)
  .rotateY(Math.PI / 4).translate(0, 0.5, 0);                            // unit square base

function place(mesh, o) {
  mesh.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rotY) mesh.rotation.y = o.rotY;
  // rotX/rotZ: voussoirs around an archivolt, raking cornices, tilted panels.
  // Default Euler order XYZ, so a box laid on an arch takes rotZ alone.
  if (o.rotX) mesh.rotation.x = o.rotX;
  if (o.rotZ) mesh.rotation.z = o.rotZ;
  return mesh;
}

/* box(w,h,d,hex,{x,y,z,rotY,m}) — axis-aligned box, BOTTOM-based: sits from y to y+h. */
export function box(w, h, d, hex, o = {}) {
  const mesh = new THREE.Mesh(UNIT_BOX, mat(hex, o.m));
  mesh.scale.set(w, h, d);
  return place(mesh, o);
}

/* cyl(rTop,rBot,h,hex,{x,y,z,seg,rotY,m}) — vertical cylinder/cone, BOTTOM-based. */
export function cyl(rTop, rBot, h, hex, o = {}) {
  const seg = o.seg || 10;
  const g = geo('cyl|' + rTop + '|' + rBot + '|' + h + '|' + seg,
    () => new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(0, h / 2, 0));
  return place(new THREE.Mesh(g, mat(hex, o.m)), o);
}

/* sphere(r,hex,{x,y,z,m}) — CENTER-based ball (beacons, finials). */
export function sphere(r, hex, o = {}) {
  const g = geo('sph|' + r, () => new THREE.SphereGeometry(r, 10, 7));
  return place(new THREE.Mesh(g, mat(hex, o.m)), o);
}

/* disc(r,t,hex,{x,y,z,rotY,seg,m}) — CENTER-based flat drum whose round face looks
   along ±Z (rose windows, clock faces, arch tops). rotY to face ±X. */
export function disc(r, t, hex, o = {}) {
  const seg = o.seg || 16;
  const g = geo('dsc|' + r + '|' + t + '|' + seg,
    () => new THREE.CylinderGeometry(r, r, t, seg).rotateX(Math.PI / 2));
  return place(new THREE.Mesh(g, mat(hex, o.m)), o);
}

/* dome(r,hex,{x,y,z,squash,seg,m}) — hemisphere, BOTTOM-based (equator at y). */
export function dome(r, hex, o = {}) {
  const seg = o.seg || 12;
  const g = geo('dom|' + r + '|' + seg,
    () => new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2));
  const mesh = new THREE.Mesh(g, mat(hex, o.m));
  if (o.squash) mesh.scale.y = o.squash;
  return place(mesh, o);
}

/* prism(pts,len,hex,{x,y,z,rotY,m}) — 2D cross-section [[x,y],...] (CCW) extruded
   along Z over [-len/2, +len/2]. Building block for gable/wedge/custom caps. */
export function prism(pts, len, hex, o = {}) {
  const key = 'pri|' + len + '|' + pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(';');
  const g = geo(key, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
    eg.translate(0, 0, -len / 2);
    return eg;
  });
  return place(new THREE.Mesh(g, mat(hex, o.m)), o);
}

/* gable({w,d,h,hex,x,y,z,rotY}) — triangular prism roof, BOTTOM-based.
   Ridge runs along local X (the w axis); rotY turns the whole roof. */
export function gable(o) {
  const p = prism([[-o.d / 2, 0], [o.d / 2, 0], [0, o.h]], o.w, o.hex,
    { x: o.x, y: o.y, z: o.z, m: o.m });
  p.rotation.y = Math.PI / 2 + (o.rotY || 0);
  return p;
}

/* wedge({w,d,h,hex,x,y,z,rotY}) — right-triangle prism (ramp), BOTTOM-based.
   Vertical high face at +Z, slope descending toward -Z; width w along X. */
export function wedge(o) {
  const p = prism([[-o.d / 2, 0], [o.d / 2, 0], [-o.d / 2, o.h]], o.w, o.hex,
    { x: o.x, y: o.y, z: o.z, m: o.m });
  p.rotation.y = Math.PI / 2 + (o.rotY || 0);
  return p;
}

/* pyramid(w,d,h,hex,{x,y,z,rotY,m}) — rectangular-base pyramid, BOTTOM-based. */
export function pyramid(w, d, h, hex, o = {}) {
  const mesh = new THREE.Mesh(UNIT_PYR, mat(hex, o.m));
  mesh.scale.set(w, h, d);
  return place(mesh, o);
}

/* spire(rBot,h,hex,{x,y,z,seg,m}) — cone (8-sided unless seg given), BOTTOM-based. */
export function spire(rBot, h, hex, o = {}) {
  const gm = o.seg
    ? geo('con|' + o.seg, () => new THREE.ConeGeometry(1, 1, o.seg).translate(0, 0.5, 0))
    : UNIT_CONE;
  const mesh = new THREE.Mesh(gm, mat(hex, o.m));
  mesh.scale.set(rBot, h, rBot);
  return place(mesh, o);
}

/* steps({w,d,n,rise,inset,hex,x,z,rotY}) — stack of n concentric stair tiers,
   BOTTOM-based at y=0 (or o.y). Tier i shrinks by 2*inset each side. */
export function steps(o) {
  const n = o.n || 3, rise = o.rise || 0.45, inset = o.inset === undefined ? 1.1 : o.inset;
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    g.add(box(Math.max(1, o.w - 2 * inset * i), rise, Math.max(1, o.d - 2 * inset * i),
      o.hex, { y: i * rise }));
  }
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rotY) g.rotation.y = o.rotY;
  g.userData.topY = n * rise;
  return g;
}

/* colonnade({count,spacing|width,colH,colR,hex,entab,x,y,z,rotY,seg}) — row of round
   columns along local X plus an entablature beam on top. BOTTOM-based Group.
   Give either spacing or total width. entab=0 to skip the beam. */
export function colonnade(o) {
  const count = o.count || 6, colR = o.colR || 0.5, colH = o.colH || 6;
  const spacing = o.spacing || (count > 1 ? (o.width || 10) / (count - 1) : 0);
  const span = spacing * (count - 1);
  const entab = o.entab === undefined ? colH * 0.22 : o.entab;
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    g.add(cyl(colR, colR * 1.08, colH, o.hex, { x: -span / 2 + i * spacing, seg: o.seg || 8 }));
  }
  if (entab > 0) g.add(box(span + colR * 4, entab, colR * 3.2, o.hex, { y: colH }));
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rotY) g.rotation.y = o.rotY;
  g.userData.topY = colH + Math.max(0, entab);
  return g;
}

/* colRing({r,count,colH,colR,hex,entab,x,y,z}) — circle of columns (temple drums,
   mausoleum tops). Optional annular entablature. BOTTOM-based Group. */
export function colRing(o) {
  const count = o.count || 10, colR = o.colR || 0.4, colH = o.colH || 4;
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    g.add(cyl(colR, colR, colH, o.hex, { x: Math.cos(a) * o.r, z: Math.sin(a) * o.r, seg: 6 }));
  }
  const entab = o.entab === undefined ? colH * 0.18 : o.entab;
  if (entab > 0) g.add(ring(o.r + colR * 1.6, o.r - colR * 1.6, entab, o.hex, { y: colH }));
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  g.userData.topY = colH + Math.max(0, entab);
  return g;
}

/* ring(rOut,rIn,h,hex,{x,y,z,seg,m}) — annular cylinder (donut wall), BOTTOM-based. */
export function ring(rOut, rIn, h, hex, o = {}) {
  const seg = o.seg || 14;
  const g = geo('rng|' + rOut + '|' + rIn + '|' + h + '|' + seg, () => {
    const pts = [
      new THREE.Vector2(rIn, 0), new THREE.Vector2(rOut, 0),
      new THREE.Vector2(rOut, h), new THREE.Vector2(rIn, h), new THREE.Vector2(rIn, 0)
    ];
    return new THREE.LatheGeometry(pts, seg);
  });
  const m = Object.assign({}, o.m, { ds: true });
  return place(new THREE.Mesh(g, mat(hex, { ...m })), o);
}

/* extrudeRing(pts,h,hex,{yBase,m}) — extrude a footprint ring of [x,z] points up by h.
   Shape lives in XY; we map z->-y then rotate -PI/2 about X so the result stands in
   XZ with +Y up and outward normals. BOTTOM at yBase (default 0). */
export function extrudeRing(pts, h, hex, o = {}) {
  const v = pts.map(p => new THREE.Vector2(p[0], -p[1]));
  if (THREE.ShapeUtils.area(v) < 0) v.reverse();
  const sh = new THREE.Shape(v);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  if (o.yBase) g.translate(0, o.yBase, 0);
  return new THREE.Mesh(g, mat(hex, o.m));
}

/* setbackTower({levels,hex,x,z,rotY,y0}) — stack of centered levels bottom-up.
   Level: {w,d,h} box or {r,h,seg,rB} cylinder; optional per-level hex/dx/dz.
   Group.userData.topY = total height. */
export function setbackTower(o) {
  const g = new THREE.Group();
  let y = o.y0 || 0;
  for (const L of o.levels) {
    if (L.r !== undefined) {
      g.add(cyl(L.r, L.rB === undefined ? L.r : L.rB, L.h, L.hex || o.hex,
        { y, x: L.dx || 0, z: L.dz || 0, seg: L.seg || 8, m: L.m || o.m }));
    } else {
      g.add(box(L.w, L.h, L.d, L.hex || o.hex, { y, x: L.dx || 0, z: L.dz || 0, m: L.m || o.m }));
    }
    y += L.h;
  }
  g.position.set(o.x || 0, 0, o.z || 0);
  if (o.rotY) g.rotation.y = o.rotY;
  g.userData.topY = y;
  return g;
}

/* lattice({w,h,d,step,barR,hex,x,y,z,allFaces,m}) — cheap diagrid/truss hint:
   crossing diagonal bars instanced on the two ±Z faces (and ±X with allFaces:true).
   One InstancedMesh per face pair. BOTTOM-based Group. */
export function lattice(o) {
  const step = o.step || 8, barR = o.barR || 0.35;
  const material = mat(o.hex, o.m || { metal: 0.4, rough: 0.5 });
  const g = new THREE.Group();
  g.add(latticePanel(o.w, o.h, o.d, step, barR, material));
  if (o.allFaces) {
    const p = latticePanel(o.d, o.h, o.w, step, barR, material);
    p.rotation.y = Math.PI / 2;
    g.add(p);
  }
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  return g;
}
function latticePanel(w, h, d, step, barR, material) {
  const nx = Math.max(1, Math.round(w / step)), ny = Math.max(1, Math.round(h / step));
  const cw = w / nx, ch = h / ny, len = Math.hypot(cw, ch) * 1.04, ang = Math.atan2(ch, cw);
  const im = new THREE.InstancedMesh(UNIT_BOX_C, material, nx * ny * 4);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const S = new THREE.Vector3(len, barR * 2, barR * 2), P = new THREE.Vector3();
  let k = 0;
  for (let f = 0; f < 2; f++) {
    const z = (f === 0 ? 1 : -1) * d / 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        P.set(-w / 2 + (i + 0.5) * cw, (j + 0.5) * ch, z);
        for (const s of [1, -1]) {
          Q.setFromEuler(E.set(0, 0, s * ang));
          M.compose(P, Q, S);
          im.setMatrixAt(k++, M);
        }
      }
    }
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

/* lampStandard({x,y,z,hex,globeHex,h}) — the ornate cast-bronze standard that
   flanks Low Library's stair and Low Plaza: a stepped, swelling ornamented
   plinth, a fluted tapering shaft, a spreading crown collar, and a cluster of
   FIVE opal globes (one on the axis, four on scroll arms). Returns
   { metal, globes } as two BOTTOM-based Groups so a caller can merge each into
   its own material (patinated bronze / lit glass). h = total height, default
   3.9 m, which is what the real standards measure above their granite pier. */
export function lampStandard(o = {}) {
  const H = o.h || 3.9, k = H / 3.9;
  const metal = new THREE.Group(), globes = new THREE.Group();
  const hex = o.hex === undefined ? 0x4c5742 : o.hex;
  const gh = o.globeHex === undefined ? 0xf3ede2 : o.globeHex;
  const gm = { emissive: 0xffe6bc, emissiveIntensity: 0.55, rough: 0.35, flat: false };
  metal.add(box(0.78 * k, 0.14 * k, 0.78 * k, hex, { y: 0 }));                    // stepped plinth
  metal.add(box(0.64 * k, 0.10 * k, 0.64 * k, hex, { y: 0.14 * k }));
  metal.add(cyl(0.30 * k, 0.40 * k, 0.26 * k, hex, { y: 0.24 * k, seg: 8 }));     // the swelling,
  metal.add(cyl(0.36 * k, 0.28 * k, 0.30 * k, hex, { y: 0.50 * k, seg: 8 }));     // ornamented base
  metal.add(cyl(0.22 * k, 0.34 * k, 0.22 * k, hex, { y: 0.80 * k, seg: 8 }));
  for (let i = 0; i < 4; i++) {                                                    // corner scrolls
    const a = i * Math.PI / 2 + Math.PI / 4;
    metal.add(sphere(0.085 * k, hex, { x: Math.cos(a) * 0.33 * k, y: 0.62 * k, z: Math.sin(a) * 0.33 * k }));
  }
  metal.add(cyl(0.115 * k, 0.175 * k, 1.62 * k, hex, { y: 1.02 * k, seg: 12 }));   // fluted shaft
  metal.add(cyl(0.145 * k, 0.105 * k, 0.16 * k, hex, { y: 2.64 * k, seg: 10 }));
  metal.add(cyl(0.34 * k, 0.16 * k, 0.24 * k, hex, { y: 2.80 * k, seg: 10 }));     // crown collar
  metal.add(cyl(0.10 * k, 0.14 * k, 0.34 * k, hex, { y: 3.04 * k, seg: 8 }));      // centre stem
  globes.add(sphere(0.185 * k, gh, { y: 3.55 * k, m: gm }));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const cx = Math.cos(a) * 0.40 * k, cz = Math.sin(a) * 0.40 * k;
    const arm = cyl(0.045 * k, 0.055 * k, 0.52 * k, hex, { x: cx * 0.55, y: 2.86 * k, z: cz * 0.55, seg: 6 });
    arm.rotation.z = -Math.cos(a) * 0.62; arm.rotation.x = Math.sin(a) * 0.62;
    metal.add(arm);
    globes.add(sphere(0.165 * k, gh, { x: cx, y: 3.24 * k, z: cz, m: gm }));
  }
  for (const g of [metal, globes]) {
    g.position.set(o.x || 0, o.y || 0, o.z || 0);
    if (o.rotY) g.rotation.y = o.rotY;
  }
  return { metal, globes };
}

/* ------------------------------- inscriptions --------------------------------
An incised architrave/attic inscription: letter-spaced Roman capitals drawn on
a transparent canvas and hung 2 cm proud of the stone, so the wall colour shows
between the letters. This is the cheapest way to get the identity cues that
actually make a classical landmark recognisable (THE LIBRARY OF COLUMBIA
UNIVERSITY on Low's architrave, HOMER HERODOTUS... on Butler's frieze). One
canvas + material per string, cached; the mesh is a single quad facing +Z and
must stay OUT of a merge bin (it carries its own material).
   inscription(w, h, lines, {x,y,z,rotY,ink,align}) — BOTTOM-based. */
const _inscMat = new Map();
export function inscription(w, h, lines, o = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const ink = o.ink === undefined ? 0x2b2721 : o.ink;
  const key = arr.join('') + '|' + ink + '|' + (w / h).toFixed(3);
  let m = _inscMat.get(key);
  if (!m) {
    // Resolution follows the LINE COUNT, not a fixed canvas: a 0.68 m frieze on
    // a 56 m front came out 25 px tall on a 2048 canvas and rendered as mush.
    let CH = Math.min(512, Math.max(48, arr.length * 72));
    let CW = Math.round(CH * Math.max(0.2, w) / Math.max(0.05, h));
    if (CW > 4096) { CH = Math.max(24, Math.round(CH * 4096 / CW)); CW = 4096; }
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const x = c.getContext('2d');
    x.clearRect(0, 0, CW, CH);
    const lh = CH / arr.length;
    const cap = lh * (arr.length > 1 ? 0.58 : 0.62);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const hx = '#' + ink.toString(16).padStart(6, '0');
    x.font = '600 ' + Math.round(cap) + 'px Georgia, "Times New Roman", serif';
    arr.forEach((line, i) => {
      // Letter-space by drawing glyph by glyph (canvas letterSpacing is not
      // universally supported), and spend the LEFTOVER width on the track
      // rather than centring a short run: a real incised architrave fills its
      // band edge to edge, and Low's reads at ~2 cap-heights per character.
      const glyphs = [...line];
      let gwSum = 0;
      for (const gch of glyphs) gwSum += x.measureText(gch).width;
      const avail = CW * 0.94;
      // Cap the track. On Low's FIVE-line attic the leftover width is enormous
      // and spending all of it turned the inscription into a row of dots
      // (shots/columbia/m3_alma_day.png). A real multi-line inscription is a
      // centred block narrower than its band; a one-line architrave fills it.
      const trackMax = cap * (arr.length > 1 ? 0.32 : 1.15);
      let track = glyphs.length > 1 ? Math.min(trackMax, (avail - gwSum) / (glyphs.length - 1)) : 0;
      let scale = 1;
      if (track < cap * 0.06) {          // too long to fit even tightly: squeeze
        track = cap * 0.06;
        scale = Math.min(1, avail / Math.max(1, gwSum + track * (glyphs.length - 1)));
      }
      const total = gwSum + track * Math.max(0, glyphs.length - 1);
      let px = CW / 2 - (total * scale) / 2;
      const py = lh * (i + 0.5);
      x.save();
      x.translate(CW / 2, py);
      x.scale(scale, 1);
      x.translate(-CW / 2, -py);
      for (const gch of glyphs) {
        const gw = x.measureText(gch).width;
        // incision: a hairline highlight under a dark letter reads as cut stone
        x.fillStyle = 'rgba(255,252,244,0.34)';
        x.fillText(gch, px + gw / 2, py + Math.max(1, cap * 0.055));
        x.fillStyle = hx;
        x.fillText(gch, px + gw / 2, py);
        px += gw + track;
      }
      x.restore();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    m = applyLightTrim(new THREE.MeshStandardMaterial({
      map: t, color: 0xffffff, roughness: 0.85, metalness: 0,
      transparent: true, alphaTest: 0.06, depthWrite: true,
    }));
    _inscMat.set(key, m);
  }
  const g = geo('insc|' + w + '|' + h, () => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0));
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return place(mesh, o);
}

/* billboard(w,h,hexEmissive,{x,y,z,rotY}) — unlit glowing panel facing +Z,
   BOTTOM-based (sits from y to y+h). */
export function billboard(w, h, hex, o = {}) {
  const g = geo('bb|' + w + '|' + h,
    () => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0));
  return place(new THREE.Mesh(g, mat(hex, { basic: true, ds: true })), o);
}

export const KIT = {
  mat, box, cyl, sphere, disc, dome, prism, gable, wedge, pyramid, spire, steps,
  colonnade, colRing, ring, extrudeRing, setbackTower, lattice, billboard,
  inscription, lampStandard
};
