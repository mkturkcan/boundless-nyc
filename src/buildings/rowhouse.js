// ============================================================================
// VINYL / ALUMINIUM-SIDED ROWHOUSE
// North Williamsburg · Greenpoint · Bushwick · Ridgewood · Maspeth · Sunnyside.
// c.1890-1930 frame + masonry rowhouses re-clad in Double-4 vinyl siding
// between 1955 and 2000. 2-3 storeys, flat roof behind a boxed aluminium
// cornice or a low parapet, low 3-6 riser stoop, through-wall "Fedders" AC
// sleeves, undersized replacement windows inside the original openings.
// See docs/typology/08-vinyl-rowhouse.md
// ============================================================================
import * as THREE from 'three';
import { at, shellWalls, flatRoof, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, lathe, compose, ensureColor, shadeYRange, tmat } from '../geo.js';
import { makeCanvas } from '../textures.js';

export const TYPE = 'rowhouse';

const q05 = (v) => Math.round(v * 20) / 20;
const q10 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// SIDING TEXTURE
// One shared relief pass (lap shadow + butt seams + panel wave + grain) drawn
// once, then composited over a flat tone. Course pitch and panel length are set
// per house through the UV scale, so a single material serves every exposure.
// ---------------------------------------------------------------------------
const SID_SIZE = 1024;
const SID_COURSES = 24;                 // courses per texture tile (vertical)
const SID_PANEL = 3.66;                 // metres per texture tile (horizontal)
// installer's cut-off cycle: 6 offsets, min stagger 0.61 m, realigns every 6th
const SEAM_OFFSETS = [0.00, 1.22, 2.44, 0.61, 1.83, 3.05];

const SIDING_TONES = {
  white: '#eceae4', cream: '#e3dcc7', tan: '#d8caa8', gray: '#cfd0cd',
  blue: '#c3cfd6', sage: '#c1c8b4', yellow: '#e6dcae', pewter: '#9b9d9b',
  clay: '#c0ab8b', red: '#8b4a3d',
};
const TONE_WEIGHTS = [
  ['white', 20], ['cream', 15], ['gray', 10], ['tan', 9], ['blue', 8],
  ['sage', 6], ['yellow', 5], ['clay', 5], ['pewter', 5], ['red', 4],
];

let _relief = null;      // { shade: canvas, bump: canvas }
let _bumpTex = null;

function sidingRelief() {
  if (_relief) return _relief;
  const S = SID_SIZE, N = SID_COURSES, ch = S / N;
  const ppm = S / SID_PANEL;                     // px per metre horizontally
  let st = 0x51d1a6 >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  const shade = makeCanvas(S, S); const sc = shade.getContext('2d');
  const bump = makeCanvas(S, S); const bc = bump.getContext('2d');

  // wrap-safe horizontal fill
  const wf = (c, x, y, w, h) => {
    c.fillRect(x, y, w, h);
    if (x < 0) c.fillRect(x + S, y, w, h);
    if (x + w > S) c.fillRect(x - S, y, w, h);
  };

  // ---- per-course lap: face ramp + hard butt shadow ------------------------
  for (let k = 0; k < N; k++) {
    const y = k * ch;
    const g = sc.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0.00, 'rgba(0,0,0,0.42)');       // under the butt above
    g.addColorStop(0.11, 'rgba(0,0,0,0.15)');
    g.addColorStop(0.36, 'rgba(0,0,0,0.02)');
    g.addColorStop(0.70, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.90, 'rgba(255,255,255,0.16)'); // drip edge in the light
    g.addColorStop(0.97, 'rgba(255,255,255,0.02)');
    g.addColorStop(1.00, 'rgba(0,0,0,0.14)');
    sc.fillStyle = g; sc.fillRect(0, y, S, ch);
    sc.fillStyle = 'rgba(0,0,0,0.38)'; sc.fillRect(0, y, S, Math.max(1, ch * 0.05));

    // bump: height rises toward the butt then snaps back at the course line
    const bg = bc.createLinearGradient(0, y, 0, y + ch);
    bg.addColorStop(0.00, '#343434');
    bg.addColorStop(0.09, '#6d6d6d');
    bg.addColorStop(0.55, '#8d8d8d');
    bg.addColorStop(0.92, '#cfcfcf');
    bg.addColorStop(1.00, '#d8d8d8');
    bc.fillStyle = bg; bc.fillRect(0, y, S, ch);

    // wood-grain embossing: very shallow, must not compete with the lap
    for (let i = 0; i < 5; i++) {
      const gy = y + rnd() * ch * 0.85 + ch * 0.1;
      bc.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.055)';
      bc.fillRect(0, gy, S, 1);
    }
  }

  // ---- butt seams every panel length, staggered per course -----------------
  for (let k = 0; k < N; k++) {
    const y = k * ch;
    const sx = SEAM_OFFSETS[k % SEAM_OFFSETS.length] * ppm;
    const lap = 0.030 * ppm;                       // end-lap overlap, proud
    sc.fillStyle = 'rgba(255,255,255,0.075)'; wf(sc, sx - lap, y + ch * 0.06, lap, ch * 0.9);
    sc.fillStyle = 'rgba(0,0,0,0.22)'; wf(sc, sx - 1.5, y + ch * 0.04, 2.6, ch * 0.93);
    bc.fillStyle = 'rgba(255,255,255,0.30)'; wf(bc, sx - lap, y, lap, ch);
    bc.fillStyle = 'rgba(0,0,0,0.45)'; wf(bc, sx - 1.5, y, 2.6, ch);
    // algae / dirt bleed out of the joint
    if (rnd() < 0.5) {
      const len = (0.22 + rnd() * 0.4) / (SID_COURSES * 0.102) * S;
      const gg = sc.createLinearGradient(0, y + ch, 0, y + ch + len);
      gg.addColorStop(0, `rgba(52,60,52,${0.10 + rnd() * 0.12})`);
      gg.addColorStop(1, 'rgba(52,60,52,0)');
      sc.fillStyle = gg; wf(sc, sx - 1 - rnd() * 6, y + ch, 3 + rnd() * 9, len);
    }
  }

  // ---- baseline panel wave: 3 cycles per tile => 1.22 m wavelength ---------
  for (let x = 0; x < S; x++) {
    const a = Math.sin((x / S) * Math.PI * 6);
    const b = Math.sin((x / S) * Math.PI * 6 + 1.9) * 0.4;
    const v = a + b;
    sc.fillStyle = v > 0 ? `rgba(255,255,255,${(v * 0.030).toFixed(4)})`
      : `rgba(0,0,0,${(-v * 0.030).toFixed(4)})`;
    sc.fillRect(x, 0, 1, S);
  }
  bc.globalCompositeOperation = 'overlay';
  for (let x = 0; x < S; x++) {
    const v = Math.sin((x / S) * Math.PI * 6) + Math.sin((x / S) * Math.PI * 6 + 1.9) * 0.4;
    const g = Math.round(128 + v * 16);
    bc.fillStyle = `rgb(${g},${g},${g})`;
    bc.fillRect(x, 0, 1, S);
  }
  bc.globalCompositeOperation = 'source-over';

  // ---- grunge: fastener line, speckle, faint mildew ------------------------
  for (let i = 0; i < 210; i++) {
    sc.fillStyle = `rgba(${rnd() < 0.55 ? '58,54,46' : '226,224,214'},${0.03 + rnd() * 0.07})`;
    sc.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 5, 1 + rnd() * 3);
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * S, h = 60 + rnd() * 260;
    const gg = sc.createLinearGradient(0, 0, 0, h);
    gg.addColorStop(0, `rgba(64,72,62,${0.05 + rnd() * 0.08})`);
    gg.addColorStop(1, 'rgba(64,72,62,0)');
    sc.fillStyle = gg; sc.fillRect(x, rnd() * S, 3 + rnd() * 8, h);
  }

  _relief = { shade, bump };
  return _relief;
}

function tex(canvas, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function sidingMat(B, tone) {
  const name = `rowhouse:siding:${tone}`;
  if (B.M.has(name)) return name;
  const { shade, bump } = sidingRelief();
  const S = SID_SIZE;
  const c = makeCanvas(S, S); const cc = c.getContext('2d');
  cc.fillStyle = SIDING_TONES[tone] || SIDING_TONES.white;
  cc.fillRect(0, 0, S, S);
  cc.drawImage(shade, 0, 0);
  if (!_bumpTex) _bumpTex = tex(bump, { srgb: false });
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex(c), bumpMap: _bumpTex, bumpScale: 1.0,
    roughness: 0.64, metalness: 0.0, envMapIntensity: 0.55,
  });
  m.userData.tileMeters = SID_COURSES * 0.102;   // fallback if worldUV is used
  m.name = name;
  B.M.set(name, m);
  return name;
}

// asphalt 3-tab shingle for the false mansard: 1.22 m tile, 10 courses, 4 tabs
function shingleMat(B) {
  const name = 'rowhouse:shingle';
  if (B.M.has(name)) return name;
  const S = 512, tile = 1.22, courses = 10, tabs = 4;
  const ch = S / courses, tw = S / tabs;
  let st = 0x3ab19d >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const c = makeCanvas(S, S); const g = c.getContext('2d');
  const b = makeCanvas(S, S); const bg = b.getContext('2d');
  g.fillStyle = '#4d4a46'; g.fillRect(0, 0, S, S);
  bg.fillStyle = '#8a8a8a'; bg.fillRect(0, 0, S, S);
  for (let k = 0; k < courses; k++) {
    const y = k * ch, off = (k % 2) * tw * 0.5;
    for (let t = -1; t <= tabs; t++) {
      const x = t * tw + off;
      const l = 26 + rnd() * 18;
      g.fillStyle = `hsl(${28 + rnd() * 14},${4 + rnd() * 8}%,${l}%)`;
      g.fillRect(x, y, tw - 2, ch);
      // granule speckle
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '20,19,18' : '150,146,138'},${0.10 + rnd() * 0.22})`;
        g.fillRect(x + rnd() * tw, y + rnd() * ch, 1.6, 1.6);
      }
      // keyway slot
      g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(x + tw - 2, y + ch * 0.28, 2.4, ch * 0.72);
      bg.fillStyle = 'rgba(0,0,0,0.5)'; bg.fillRect(x + tw - 2, y + ch * 0.28, 2.4, ch * 0.72);
    }
    // butt shadow at the course line
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, S, 3);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y + ch - 3, S, 3);
    bg.fillStyle = 'rgba(0,0,0,0.55)'; bg.fillRect(0, y, S, 3);
    bg.fillStyle = 'rgba(255,255,255,0.35)'; bg.fillRect(0, y + ch - 4, S, 4);
  }
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex(c), bumpMap: tex(b, { srgb: false }), bumpScale: 1.1,
    roughness: 0.9, metalness: 0.0, envMapIntensity: 0.4,
  });
  m.userData.tileMeters = tile;
  m.name = name;
  B.M.set(name, m);
  return name;
}

function trimMats(B) {
  if (!B.M.has('rowhouse:trim')) {
    const t = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.44, metalness: 0.05,
      envMapIntensity: 0.7,
    });
    t.userData.tileMeters = 1; t.name = 'rowhouse:trim';
    B.M.set('rowhouse:trim', t);
  }
  if (!B.M.has('rowhouse:metal')) {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.46, metalness: 0.32,
      envMapIntensity: 0.9,
    });
    m.userData.tileMeters = 1; m.name = 'rowhouse:metal';
    B.M.set('rowhouse:metal', m);
  }
}

// ---------------------------------------------------------------------------
// WALL EMITTER — punched openings with per-house siding UVs
// ---------------------------------------------------------------------------
const _v3 = new THREE.Vector3();
const _n3 = new THREE.Vector3();

function setLocalUV(g, tileU, tileV, offU = 0, offV = 0) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    _v3.fromBufferAttribute(pos, i);
    _n3.fromBufferAttribute(nor, i);
    const ax = Math.abs(_n3.x), ay = Math.abs(_n3.y), az = Math.abs(_n3.z);
    let u, w;
    if (ay >= ax && ay >= az) { u = _v3.x; w = _v3.z; }
    else if (ax >= az) { u = _v3.z * Math.sign(_n3.x); w = _v3.y; }
    else { u = _v3.x * -Math.sign(_n3.z); w = _v3.y; }
    uv.setXY(i, (u + offU) / tileU, (w + offV) / tileV);
  }
}

// rows: [{y0, y1, openings:[{x, w, y0?, y1?}]}] -> [w, h, cx, cyBottom]
function punchRects(width, height, rows) {
  const out = [];
  const add = (w, h, cx, cy) => { if (w > 0.006 && h > 0.006) out.push([w, h, cx, cy]); };
  const sorted = [...rows].sort((a, b) => a.y0 - b.y0);
  let cursor = 0;
  for (const row of sorted) {
    if (row.y0 > cursor + 0.005) add(width, row.y0 - cursor, 0, cursor);
    const ops = [...row.openings].sort((a, b) => a.x - b.x);
    let px = -width / 2;
    for (const op of ops) {
      const left = op.x - op.w / 2;
      if (left > px + 0.005) add(left - px, row.y1 - row.y0, (px + left) / 2, row.y0);
      const oy0 = op.y0 ?? row.y0, oy1 = op.y1 ?? row.y1;
      if (oy0 > row.y0 + 0.005) add(op.w, oy0 - row.y0, op.x, row.y0);
      if (oy1 < row.y1 - 0.005) add(op.w, row.y1 - oy1, op.x, oy1);
      px = Math.max(px, op.x + op.w / 2);
    }
    if (px < width / 2 - 0.005) add(width / 2 - px, row.y1 - row.y0, (px + width / 2) / 2, row.y0);
    cursor = row.y1;
  }
  if (cursor < height - 0.005) add(width, height - cursor, 0, cursor);
  return out;
}

function clipRects(rects, y0, y1) {
  const out = [];
  for (const [w, h, cx, cy] of rects) {
    const a = Math.max(cy, y0), b = Math.min(cy + h, y1);
    if (b - a > 0.006) out.push([w, b - a, cx, a]);
  }
  return out;
}

function emitZone(ctx, frame, rects, z) {
  for (const [w, h, cx, cy] of rects) {
    const g = box(w, h, z.depth, { segY: Math.max(1, Math.min(8, Math.ceil(h / 1.1))) });
    g.translate(cx, cy, (z.zFace ?? 0) - z.depth / 2);
    if (z.uv) setLocalUV(g, z.uv.tileU, z.uv.tileV, z.uv.offU, z.uv.offV);
    if (z.chalk) { ensureColor(g); shadeYRange(g, 1.3, z.chalkTop, 1.0, 1 + z.chalk); }
    ctx.batcher.addMerged(z.mat, g, frame, {
      tint: z.tint, worldUV: !z.uv, grime: z.grime ?? 0.18, aoTop: z.aoTop || 0,
    });
  }
}

// ===========================================================================
// PARTS. All ids prefixed `rowhouse:`. Anchor convention matches kit.js:
// x centred on the opening, y = bottom of the opening, z = 0 at the siding
// face (parts extend into -z for the reveal and +z for projections).
// ===========================================================================
const DARK = new THREE.Color(0.15, 0.145, 0.14);

// -- 1/1 vinyl double-hung sash: thin frame, meeting rail, shallow reveal ----
function sashPart(B, w, h) {
  const id = `rowhouse:sash:${w}x${h}`;
  const gid = `rowhouse:glass:${w}x${h}`;
  if (!B.hasPart(id)) {
    const fw = 0.046;                    // frame face 38-57 mm
    const sw = 0.032;                    // sash face
    const rz = -0.075;                   // glass 75 mm behind the siding face
    const items = [];
    const backer = box(w + 0.06, h + 0.06, 0.02, { segY: 1 });
    ensureColor(backer, DARK);
    items.push({ geom: backer, x: 0, y: -0.03, z: rz - 0.06 });
    // jamb liner returns (the shallow reveal)
    const jl = 0.055;
    for (const s of [-1, 1]) {
      const j = box(0.02, h, jl, { segY: 1 });
      ensureColor(j, new THREE.Color(0.72, 0.71, 0.69));
      items.push({ geom: j, x: s * (w / 2 - 0.01), y: 0, z: rz + jl / 2 - 0.012 });
    }
    const head = box(w, 0.02, jl, { segY: 1 });
    ensureColor(head, new THREE.Color(0.62, 0.61, 0.59));
    items.push({ geom: head, x: 0, y: h - 0.02, z: rz + jl / 2 - 0.012 });
    // outer frame
    const fz = rz + 0.026;
    items.push({ geom: box(w, fw, 0.038, { segY: 1 }), x: 0, y: h - fw, z: fz });
    items.push({ geom: box(w, fw * 1.2, 0.042, { segY: 1 }), x: 0, y: 0, z: fz });
    items.push({ geom: box(fw, h, 0.038, { segY: 1 }), x: -w / 2 + fw / 2, y: 0, z: fz });
    items.push({ geom: box(fw, h, 0.038, { segY: 1 }), x: w / 2 - fw / 2, y: 0, z: fz });
    // sash stiles/rails (a hair proud of the frame) + meeting rail
    const mr = h * 0.505;
    items.push({ geom: box(w - fw * 1.7, 0.038, 0.026, { segY: 1 }), x: 0, y: mr, z: fz + 0.014 });
    for (const [y0, y1] of [[fw * 1.15, mr], [mr + 0.038, h - fw]]) {
      items.push({ geom: box(sw, y1 - y0, 0.02, { segY: 1 }), x: -w / 2 + fw + sw / 2, y: y0, z: fz + 0.010 });
      items.push({ geom: box(sw, y1 - y0, 0.02, { segY: 1 }), x: w / 2 - fw - sw / 2, y: y0, z: fz + 0.010 });
      items.push({ geom: box(w - fw * 2, sw, 0.02, { segY: 1 }), x: 0, y: y1 - sw, z: fz + 0.010 });
    }
    B.definePart(id, compose(items), 'windowFrame');
    const gq = quad(w - fw * 2.1, h - fw * 2.3);
    gq.translate(0, fw * 1.15, rz);
    B.definePart(gid, gq, 'glass', { castShadow: false });
    const lq = quad(w - fw * 2.1, h - fw * 2.3);
    lq.translate(0, fw * 1.15, rz + 0.008);
    B.definePart(`rowhouse:lit:${w}x${h}`, lq, 'litWindow',
      { castShadow: false, receiveShadow: false, visible: false });
  }
  return { id, gid, lid: `rowhouse:lit:${w}x${h}` };
}

// -- the undersized-opening tell: J-channel + panning infill + drip caps ----
function winsetPart(B, ow, oh, ww, wh, sfi) {
  const id = `rowhouse:winset:${ow}x${oh}:${ww}x${wh}`;
  if (!B.hasPart(id)) {
    const items = [];
    const jc = 0.028;                              // J-channel face 19-32 mm
    const jp = 0.020;                              // proud of the siding
    const si = Math.max(0.045, (ow - ww) / 2);     // side infill each side
    const hi = Math.max(0.08, oh - wh - sfi);      // head infill
    // J-channel, wrapping the opening on all four sides
    items.push({ geom: box(ow + jc * 2, jc, jp, { segY: 1 }), x: 0, y: oh, z: jp / 2 });
    items.push({ geom: box(ow + jc * 2, jc, jp, { segY: 1 }), x: 0, y: -jc, z: jp / 2 });
    for (const s of [-1, 1]) {
      items.push({ geom: box(jc, oh + jc * 2, jp, { segY: 1 }), x: s * (ow / 2 + jc / 2), y: -jc, z: jp / 2 });
    }
    // flat coil panning filling the gap between opening and replacement window
    const pz = -0.026;
    for (const s of [-1, 1]) {
      const p = box(si, oh, 0.016, { segY: 1 });
      items.push({ geom: p, x: s * (ow / 2 - si / 2), y: 0, z: pz });
    }
    items.push({ geom: box(ow - si * 2, hi, 0.016, { segY: 1 }), x: 0, y: oh - hi, z: pz });
    items.push({ geom: box(ow - si * 2, sfi, 0.016, { segY: 1 }), x: 0, y: 0, z: pz });
    // head flashing / drip cap, 15 deg
    const hf = box(ow + 0.11, 0.046, 0.062, { segY: 1 });
    hf.rotateX(-0.26);
    items.push({ geom: hf, x: 0, y: oh + jc, z: 0.031 });
    // sill trim, 12 deg
    const st = box(ow + 0.10, 0.05, 0.07, { segY: 1 });
    st.rotateX(0.21);
    items.push({ geom: st, x: 0, y: -jc - 0.048, z: 0.034 });
    B.definePart(id, compose(items), 'rowhouse:trim');
  }
  return id;
}

// -- through-wall "Fedders" AC sleeve grille --------------------------------
function acSleevePart(B) {
  const id = 'rowhouse:acSleeve';
  if (!B.hasPart(id)) {
    const w = 0.66, h = 0.42;
    const items = [];
    const backer = box(w, h, 0.02, { segY: 1 });
    ensureColor(backer, DARK);
    items.push({ geom: backer, x: 0, y: 0, z: -0.32 });
    // flange + louvred face
    items.push({ geom: box(w + 0.026, h + 0.026, 0.014, { segY: 1 }), x: 0, y: -0.013, z: 0.007 });
    items.push({ geom: box(w - 0.03, h - 0.03, 0.012, { segY: 1 }), x: 0, y: 0.015, z: 0.004 });
    const n = Math.floor((h - 0.05) / 0.019);
    for (let i = 0; i < n; i++) {
      const bl = box(w - 0.05, 0.017, 0.02, { segY: 1 });
      bl.rotateX(-0.52);
      items.push({ geom: bl, x: 0, y: 0.028 + i * 0.019, z: 0.016 });
    }
    // drip cap over the grille
    const dc = box(w + 0.08, 0.026, 0.05, { segY: 1 });
    dc.rotateX(-0.22);
    items.push({ geom: dc, x: 0, y: h + 0.006, z: 0.026 });
    B.definePart(id, compose(items), 'rowhouse:metal');
  }
  return id;
}

// -- window-mounted AC box with accordion fillers and support bracket -------
function acWinPart(B) {
  const id = 'rowhouse:acWin';
  if (!B.hasPart(id)) {
    const items = [];
    const bw = 0.58, bh = 0.37, bd = 0.40;
    const body = box(bw, bh, bd, { segY: 1 });
    items.push({ geom: body, x: 0, y: 0, z: bd / 2 - 0.06 });
    const grille = box(bw - 0.05, bh - 0.07, 0.014, { segY: 1 });
    ensureColor(grille, new THREE.Color(0.42, 0.43, 0.44));
    items.push({ geom: grille, x: 0, y: 0.035, z: bd - 0.055 });
    // accordion side fillers
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const p = box(0.024, bh - 0.02, 0.05, { segY: 1 });
        ensureColor(p, new THREE.Color(0.86, 0.845, 0.785));
        items.push({ geom: p, x: s * (bw / 2 + 0.013 + i * 0.024), y: 0.01, z: 0.03 });
      }
    }
    // galvanised support bracket
    for (const s of [-1, 1]) {
      const a = box(0.026, 0.026, 0.34, { segY: 1 });
      ensureColor(a, new THREE.Color(0.55, 0.56, 0.55));
      items.push({ geom: a, x: s * (bw / 2 - 0.05), y: -0.03, z: 0.16 });
      const d = box(0.02, 0.24, 0.02, { segY: 1 });
      d.rotateX(0.9);
      ensureColor(d, new THREE.Color(0.5, 0.51, 0.5));
      items.push({ geom: d, x: s * (bw / 2 - 0.05), y: -0.24, z: 0.06 });
    }
    const g = compose(items);
    g.rotateX(-0.075);                        // condensate tilt
    B.definePart(id, g, 'rowhouse:metal');
  }
  return id;
}

// -- security bars, 1.00 x 1.60 nominal, scaled per opening ----------------
function barsPart(B) {
  const id = 'rowhouse:bars';
  if (!B.hasPart(id)) {
    const W = 1.0, H = 1.6, p = 0.055;
    const items = [];
    // perimeter frame
    items.push({ geom: box(W, 0.026, 0.008, { segY: 1 }), x: 0, y: H - 0.026, z: p });
    items.push({ geom: box(W, 0.026, 0.008, { segY: 1 }), x: 0, y: 0, z: p });
    for (const s of [-1, 1]) items.push({ geom: box(0.026, H, 0.008, { segY: 1 }), x: s * (W / 2 - 0.013), y: 0, z: p });
    // vertical bars at ~0.11 pitch
    const n = Math.round(W / 0.113);
    for (let i = 1; i < n; i++) {
      items.push({ geom: box(0.016, H - 0.03, 0.016, { segY: 1 }), x: -W / 2 + (W / n) * i, y: 0.015, z: p });
    }
    // cross bars
    for (const t of [0.34, 0.68]) {
      items.push({ geom: box(W - 0.04, 0.016, 0.02, { segY: 1 }), x: 0, y: H * t, z: p });
    }
    // stand-offs into the wall
    for (const s of [-1, 1]) {
      for (const t of [0.06, 0.94]) {
        items.push({ geom: box(0.024, 0.024, p, { segY: 1 }), x: s * (W / 2 - 0.02), y: H * t, z: p / 2 });
      }
    }
    B.definePart(id, compose(items), 'paintFlat');
  }
  return id;
}

// -- entry door slab (behind the storm door) --------------------------------
function doorSlabPart(B, w, h, style) {
  const id = `rowhouse:slab:${w}x${h}:${style}`;
  if (!B.hasPart(id)) {
    const items = [];
    const rd = 0.13;                                // shallow reveal on a sided wall
    const jamb = (g) => { ensureColor(g, new THREE.Color(0.55, 0.54, 0.52)); return g; };
    items.push({ geom: jamb(box(w + 0.05, 0.026, rd, { segY: 1 })), x: 0, y: h, z: -rd / 2 });
    for (const s of [-1, 1]) items.push({ geom: jamb(box(0.026, h, rd, { segY: 1 })), x: s * (w / 2 + 0.012), y: 0, z: -rd / 2 });
    items.push({ geom: box(w, h, 0.05, { segY: 1 }), x: 0, y: 0, z: -rd + 0.03 });
    if (style === 'panel6') {
      for (const [py, ph] of [[0.10, 0.46], [0.62, 0.46], [1.20, 0.72]]) {
        for (const s of [-1, 1]) {
          items.push({ geom: box(w * 0.36, ph, 0.016, { segY: 1 }), x: s * w * 0.21, y: py, z: -rd + 0.055 });
        }
      }
    } else {
      // half-lite: raised lower panel, glass above (added separately)
      items.push({ geom: box(w * 0.78, 0.66, 0.016, { segY: 1 }), x: 0, y: 0.14, z: -rd + 0.055 });
      items.push({ geom: box(w * 0.86, 0.05, 0.03, { segY: 1 }), x: 0, y: h * 0.44, z: -rd + 0.055 });
    }
    B.definePart(id, compose(items), 'doorPaint');
    if (style !== 'panel6') {
      const g = quad(w * 0.72, h * 0.44);
      g.translate(0, h * 0.50, -rd + 0.028);
      B.definePart(id + ':lite', g, 'glass', { castShadow: false });
    }
  }
  return id;
}

// -- aluminium storm / screen door in front of the slab --------------------
function stormPart(B, w, h) {
  const id = `rowhouse:storm:${w}x${h}`;
  if (!B.hasPart(id)) {
    const f = 0.038, items = [];
    items.push({ geom: box(w, f, 0.032, { segY: 1 }), x: 0, y: h - f, z: 0.016 });
    items.push({ geom: box(w, f, 0.032, { segY: 1 }), x: 0, y: 0, z: 0.016 });
    for (const s of [-1, 1]) items.push({ geom: box(f, h, 0.032, { segY: 1 }), x: s * (w / 2 - f / 2), y: 0, z: 0.016 });
    items.push({ geom: box(w - f, 0.38, 0.028, { segY: 1 }), x: 0, y: f, z: 0.014 });   // kick panel
    items.push({ geom: box(w - f, 0.024, 0.03, { segY: 1 }), x: 0, y: h * 0.62, z: 0.016 }); // divider bar
    items.push({ geom: box(0.11, 0.028, 0.05, { segY: 1 }), x: w / 2 - 0.13, y: h * 0.44, z: 0.04 }); // handle
    B.definePart(id, compose(items), 'rowhouse:metal');
    const g = quad(w - f * 2.2, h - 0.44);
    g.translate(0, 0.42, 0.008);
    B.definePart(id + ':glass', g, 'glass', { castShadow: false });
  }
  return id;
}

// -- corrugated aluminium door hood / kit awning --------------------------
function awningPart(B, w) {
  const id = `rowhouse:awning:${w}`;
  if (!B.hasPart(id)) {
    const proj = w > 1.3 ? 1.00 : 0.72;
    const a = 0.42;                                  // 24 deg slope
    const slen = proj / Math.cos(a);
    const rot = Math.PI / 2 + a;
    const items = [];
    const deck = box(w, slen, 0.026, { segY: 1 });
    deck.rotateX(rot);
    items.push({ geom: deck, x: 0, y: 0, z: 0.02 });
    // corrugation ribs
    const n = Math.max(6, Math.round(w / 0.078));
    for (let i = 0; i <= n; i++) {
      const r = box(0.03, slen, 0.016, { segY: 1 });
      r.rotateX(rot);
      items.push({ geom: r, x: -w / 2 + (w / n) * i, y: 0.012, z: 0.026 });
    }
    // scalloped valance
    const vn = Math.max(4, Math.round(w / 0.2));
    for (let i = 0; i < vn; i++) {
      const vh = 0.115 + (i % 2 ? 0.03 : 0);
      items.push({
        geom: box(w / vn - 0.006, vh, 0.024, { segY: 1 }),
        x: -w / 2 + (w / vn) * (i + 0.5), y: -slen * Math.sin(a) - vh, z: proj - 0.01,
      });
    }
    // side rails + brackets
    for (const s of [-1, 1]) {
      const sr = box(0.03, slen, 0.05, { segY: 1 });
      sr.rotateX(rot);
      items.push({ geom: sr, x: s * (w / 2 - 0.015), y: -0.012, z: 0.02 });
      const br = box(0.026, 0.026, proj * 0.92, { segY: 1 });
      br.rotateX(0.32);
      items.push({ geom: br, x: s * (w / 2 - 0.09), y: -0.30, z: proj * 0.46 });
    }
    B.definePart(id, compose(items), 'rowhouse:metal');
  }
  return id;
}

// -- fence: 1 m panel + post, instanced along the run --------------------
function fencePart(B, style) {
  const pid = `rowhouse:fencePanel:${style}`;
  const oid = `rowhouse:fencePost:${style}`;
  if (!B.hasPart(pid)) {
    const h = style === 'vinyl' ? 1.12 : 1.10;
    const items = [], posts = [];
    if (style === 'vinyl') {
      posts.push({ geom: box(0.102, h + 0.02, 0.102, { segY: 1 }), x: 0, y: 0, z: 0 });
      posts.push({ geom: box(0.128, 0.055, 0.128, { segY: 1 }), x: 0, y: h + 0.02, z: 0 });
      for (const y of [0.16, h - 0.30]) items.push({ geom: box(1.0, 0.088, 0.038, { segY: 1 }), x: 0, y, z: 0 });
      const n = Math.floor(1.0 / 0.108);
      for (let i = 0; i < n; i++) {
        items.push({ geom: box(0.089, h - 0.20, 0.026, { segY: 1 }), x: -0.5 + 0.054 + i * 0.108, y: 0.10, z: 0.006 });
      }
    } else {
      posts.push({ geom: box(0.042, h + 0.10, 0.042, { segY: 1 }), x: 0, y: 0, z: 0 });
      posts.push({ geom: box(0.062, 0.05, 0.062, { segY: 1 }), x: 0, y: h + 0.10, z: 0 });
      items.push({ geom: box(1.0, 0.032, 0.020, { segY: 1 }), x: 0, y: h - 0.032, z: 0 });
      items.push({ geom: box(1.0, 0.026, 0.018, { segY: 1 }), x: 0, y: 0.11, z: 0 });
      const n = Math.round(1.0 / 0.112);
      for (let i = 0; i < n; i++) {
        const x = -0.5 + 0.056 + i * (1.0 / n);
        items.push({ geom: box(0.016, h + 0.05, 0.016, { segY: 1 }), x, y: 0.03, z: 0 });
        items.push({ geom: box(0.026, 0.03, 0.026, { segY: 1 }), x, y: h + 0.06, z: 0 });
      }
    }
    B.definePart(pid, compose(items), style === 'vinyl' ? 'rowhouse:trim' : 'paintFlat');
    B.definePart(oid, compose(posts), style === 'vinyl' ? 'rowhouse:trim' : 'paintFlat');
  }
  return { pid, oid };
}

// -- wheelie bin ---------------------------------------------------------
function binPart(B) {
  const id = 'rowhouse:bin';
  if (!B.hasPart(id)) {
    const items = [];
    items.push({ geom: box(0.58, 0.94, 0.56, { segY: 1 }), x: 0, y: 0.10, z: 0 });
    items.push({ geom: box(0.62, 0.05, 0.60, { segY: 1 }), x: 0, y: 1.03, z: 0 });
    items.push({ geom: box(0.10, 0.06, 0.14, { segY: 1 }), x: 0, y: 1.07, z: 0.28 });
    for (const s of [-1, 1]) {
      items.push({ geom: cylinder(0.09, 0.09, 0.05, 8), x: s * 0.24, y: 0.05, z: -0.18, rz: Math.PI / 2 });
    }
    B.definePart(id, compose(items), 'paintFlat');
  }
  return id;
}

// ===========================================================================
// GENERATE
// ===========================================================================
export function generate(ctx, lot, rng) {
  const B = ctx.batcher, K = ctx.kit, F = lot.frame;
  trimMats(B);

  const W = Math.max(3.6, lot.width);
  const D = lot.depth;
  const M = (mat, g, m, o) => B.addMerged(mat, g, m, o);

  // ---- sampling ----------------------------------------------------------
  const stories = lot.stories || rng.weighted([[2, 30], [3, 44], [4, 12]]);
  const gfa = rng.range(0.55, 1.05);                 // finished floor above grade
  const g2f = rng.range(2.92, 3.16);                 // ground floor-to-floor
  const f2f = rng.range(2.78, 3.00);                 // upper floor-to-floor
  const deck = gfa + g2f + (stories - 1) * f2f;      // roof deck level

  const variant = rng.weighted([['vinyl', 44], ['alum', 18], ['brick', 24]]);
  const sided = variant !== 'brick';
  const tone = rng.weighted(TONE_WEIGHTS);
  const sidMat = sided ? sidingMat(B, tone) : null;
  const exposure = variant === 'alum'
    ? rng.weighted([[0.102, 20], [0.127, 16], [0.152, 22], [0.203, 12]])
    : rng.weighted([[0.102, 34], [0.127, 26], [0.114, 18], [0.089, 8]]);
  const panelLen = rng.weighted([[3.66, 70], [3.05, 20], [4.88, 10]]);
  const sidUV = {
    tileU: panelLen, tileV: SID_COURSES * exposure,
    offU: rng.range(0, panelLen), offV: 0,
  };

  const brickName = rng.weighted([['brickTan', 34], ['brickOrange', 18], ['brickRed', 20],
    ['brickPaintedCream', 14], ['brickBrown', 8], ['brickPaintedGray', 6]]);

  // per-house tint; dark tones fade + everything chalks with height
  let sidTint = facadeTint(rng);
  if (tone === 'red' || tone === 'pewter') {
    const hsl = { h: 0, s: 0, l: 0 };
    sidTint.getHSL(hsl);
    sidTint = sidTint.clone().setHSL(hsl.h, hsl.s * rng.range(0.55, 0.78), Math.min(1, hsl.l * rng.range(1.06, 1.16)));
  }
  const chalk = variant === 'alum' ? rng.range(0.09, 0.17) : rng.range(0.04, 0.10);

  // trim: white on colour at 0.72, offset from the window-frame white
  const trimKind = rng.weighted([['white', 62], ['almond', 18], ['matched', 12], ['bronze', 8]]);
  const trimTint = trimKind === 'white' ? new THREE.Color(0.952, 0.947, 0.928)
    : trimKind === 'almond' ? new THREE.Color(0.909, 0.882, 0.804)
      : trimKind === 'bronze' ? new THREE.Color(0.29, 0.247, 0.204)
        : (sided ? sidTint.clone().multiplyScalar(0.97) : new THREE.Color(0.94, 0.93, 0.91));
  const frameTint = new THREE.Color(rng.weighted([[0.958, 78], [0.916, 14], [0.31, 8]]) === 0.31
    ? 0x4a3f34 : 0xffffff);
  if (frameTint.r > 0.9) frameTint.setRGB(0.972, 0.966, 0.948);
  const metalTint = new THREE.Color(0.70, 0.705, 0.70);

  // ---- window sizing (small quantised set keeps part ids bounded) --------
  const winW = rng.bool(0.55) ? 0.80 : 0.90;
  const winH = rng.bool(0.58) ? 1.30 : 1.45;
  const ow = winW + 0.20, oh = winH + 0.34, sfi = 0.07;
  const sillAbove = rng.range(0.64, 0.88);

  // ---- horizontal layout ------------------------------------------------
  const side = lot.mirror ? -1 : 1;
  const doorW = 0.86, doorH = 2.03;
  const doorOpW = doorW + 0.14, doorOpH = doorH + 0.10;
  const doorCentered = rng.bool(0.22);
  const doorX = doorCentered ? rng.range(-0.18, 0.18)
    : side * (W / 2 - rng.range(0.34, 0.88) - doorOpW / 2);

  let nUp = W < 4.45 ? 1 : W < 5.80 ? 2 : W < 6.50 ? (rng.bool(0.62) ? 2 : 3) : 3;
  while (nUp > 1 && nUp * ow + (nUp - 1) * 0.58 + 0.78 > W) nUp--;
  const pierMax = nUp > 1 ? (W - 0.84 - nUp * ow) / (nUp - 1) : 1;
  const pier = Math.max(0.52, Math.min(rng.range(0.66, 1.16), pierMax));
  const groupW = nUp * ow + (nUp - 1) * pier;
  const slack = Math.max(0, (W - groupW) / 2 - 0.42);
  const gxOff = slack > 0.03 ? rng.range(-0.62, 0.62) * slack : 0;
  const upXs = [];
  for (let i = 0; i < nUp; i++) upXs.push(gxOff - groupW / 2 + ow / 2 + i * (ow + pier));

  const dL = doorX - doorOpW / 2 - 0.11, dR = doorX + doorOpW / 2 + 0.11;
  let gXs = upXs.filter((x) => (x + ow / 2) < dL || (x - ow / 2) > dR);
  if (!gXs.length) {
    const lo = -W / 2 + 0.36, hi = dL;
    if (hi - lo > ow) gXs = [(lo + hi) / 2];
    else {
      const lo2 = dR, hi2 = W / 2 - 0.36;
      if (hi2 - lo2 > ow) gXs = [(lo2 + hi2) / 2];
    }
  }

  // ---- roofline ---------------------------------------------------------
  const queens = rng.bool(0.5);
  const mansard = stories <= 3 && rng.bool(queens ? 0.24 : 0.13);
  const corniceKind = mansard ? 'mansard'
    : rng.weighted([['boxed', 44], ['original', 34], ['flat', 22]]);
  const sideP = rng.range(0.32, 0.52);
  const shellH = deck + sideP;
  const frontP = rng.range(0.50, 0.98);
  const fasciaH = rng.range(0.28, 0.44);
  const corniceProj = rng.range(0.22, 0.40);
  const corniceTop = deck + rng.range(0.34, 0.52);
  const mansH = rng.range(1.28, 2.00);
  const mansPitch = rng.range(1.08, 1.30);           // radians from horizontal
  const mansProj = Math.min(0.60, Math.max(0.22, mansH / Math.tan(mansPitch)));
  const mansBase = deck - 0.10;

  let wallTop;
  if (corniceKind === 'flat') wallTop = deck + frontP;
  else if (corniceKind === 'mansard') wallTop = mansBase + 0.06;
  else wallTop = corniceTop - fasciaH;
  wallTop = Math.max(wallTop, deck - 0.55);

  // ---- foundation / veneer zones ---------------------------------------
  const hasCellarWin = rng.bool(0.78);
  const fnd = hasCellarWin ? rng.range(0.58, 0.72) : rng.range(0.20, 0.46);
  const veneer = sided && rng.bool(0.22);
  const vTop = veneer ? Math.max(fnd + 0.5, rng.range(1.05, 1.5)) : fnd;

  // ---- AC placement -----------------------------------------------------
  const acStacked = rng.bool(0.66);
  const colMode = upXs.map(() => rng.weighted([['none', 38], ['sleeve', 34], ['unit', 28]]));
  const acFor = (col) => (acStacked
    ? (colMode[col] === 'none' ? 'none' : (rng.bool(0.80) ? colMode[col] : 'none'))
    : rng.weighted([['none', 42], ['sleeve', 32], ['unit', 26]]));

  // ---- build the facade opening schedule -------------------------------
  const rows = [];
  const cellarXs = [];
  if (hasCellarWin) {
    const cn = W > 5.2 ? rng.int(1, 2) : 1;
    const avail = gXs.length ? gXs : [-side * (W / 2 - 1.0)];
    for (let i = 0; i < cn && i < avail.length + 1; i++) {
      const x = avail[i % avail.length] + (i ? rng.range(-0.3, 0.3) : 0);
      cellarXs.push(Math.max(-W / 2 + 0.45, Math.min(W / 2 - 0.45, x)));
    }
    rows.push({ y0: 0.13, y1: 0.53, openings: cellarXs.map((x) => ({ x, w: 0.70 })) });
  }

  const floorY = (f) => (f === 0 ? gfa : gfa + g2f + (f - 1) * f2f);
  const openSchedule = [];                 // {f, x, y, kind}
  const sleeveSpots = [];
  const commercial = !!lot.commercial;

  for (let f = 0; f < stories; f++) {
    const fy = floorY(f);
    const wy = fy + sillAbove;
    const xs = f === 0 ? gXs : upXs;
    const apron = { y0: f === 0 ? gfa : fy + 0.05, y1: wy, openings: [] };
    const wRow = { y0: wy, y1: wy + oh, openings: [] };

    if (f === 0 && commercial) {
      // converted ground-floor store: one wide opening + narrow entry
      rows.push({ y0: 0.55, y1: 3.30, openings: [{ x: -doorX * 0.35, w: Math.min(W - 1.9, 4.4) }] });
    } else if (f === 0) {
      apron.openings.push({ x: doorX, w: doorOpW });
      wRow.openings.push({ x: doorX, w: doorOpW, y1: gfa + doorOpH });
    }

    if (!(f === 0 && commercial)) {
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        wRow.openings.push({ x, w: ow });
        const col = f === 0 ? upXs.indexOf(x) : i;
        const mode = acFor(col < 0 ? i : col);
        openSchedule.push({ f, x, y: wy, ac: mode });
        if (mode === 'sleeve') {
          const sy = wy - rng.range(0.11, 0.19) - 0.42;
          if (sy > apron.y0 + 0.04
            && (Math.abs(x - doorX) > (doorOpW + 0.66) / 2 + 0.06 || f > 0)) {
            apron.openings.push({ x, w: 0.66, y0: sy, y1: sy + 0.42 });
            sleeveSpots.push([x, sy]);
          }
        }
      }
      // occasional sleeve in a blank pier
      if (f > 0 && nUp === 2 && rng.bool(0.16)) {
        const px = (upXs[0] + upXs[1]) / 2;
        const sy = wy - 0.5;
        if (sy > apron.y0 + 0.04) {
          apron.openings.push({ x: px, w: 0.66, y0: sy, y1: sy + 0.42 });
          sleeveSpots.push([px, sy]);
        }
      }
    }
    if (apron.openings.length) rows.push(apron);
    if (wRow.openings.length) rows.push(wRow);
  }

  // one opening panelled shut (0.10) on an upper floor
  let sealed = null;
  if (stories >= 3 && nUp >= 2 && rng.bool(0.12)) {
    const cand = openSchedule.filter((o) => o.f >= 1 && o.ac === 'none');
    if (cand.length) sealed = cand[rng.int(0, cand.length - 1)];
  }

  // ---- emit the wall in material zones ---------------------------------
  const rects = punchRects(W, wallTop, rows);
  const wallD = 0.32;
  const fndMat = rng.weighted([['concrete', 5], ['brickRed', 2], ['stucco', 2]]);
  emitZone(ctx, F, clipRects(rects, 0, fnd), {
    mat: fndMat, depth: wallD, tint: new THREE.Color(0.80, 0.79, 0.76), grime: 0.42,
  });
  if (veneer) {
    emitZone(ctx, F, clipRects(rects, fnd, vTop), {
      mat: brickName, depth: wallD, tint: new THREE.Color(0.92, 0.90, 0.88), grime: 0.30,
    });
  }
  emitZone(ctx, F, clipRects(rects, vTop, wallTop), sided ? {
    mat: sidMat, depth: wallD, tint: sidTint, uv: sidUV, grime: 0.22,
    chalk, chalkTop: wallTop, aoTop: corniceKind === 'flat' ? 0 : wallTop,
  } : {
    mat: brickName, depth: wallD, tint: facadeTint(rng), grime: 0.24,
    aoTop: corniceKind === 'flat' ? 0 : wallTop,
  });

  return { height: Math.max(wallTop, shellH) };
}
