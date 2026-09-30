// CP32 BETHESDA kit (city/cpBethesda.js): the terrace's frame, its measured plan, its materials and the builders for
// its masonry, stairs, Arcade and fountain. Sources and every figure: docs/notes/central-park-bethesda.md.
// Positions from OpenStreetMap (the terrace relation 3170084, the fountain way 958635828, the Cherry Hill Fountain way
// 959007357; (c) OpenStreetMap contributors, ODbL 1.0) and the NYS ITS orthoimagery; dimensions from the NYC Municipal
// Archives' Central Park drawings (measured, not reproduced), NYC Parks and the Central Park Conservancy.
//
// Frame: the terrace is laid out on the Mall's axis, 16.85 deg east of true north (OSM relation 3170084's straight
// edges and the NYS orthoimagery agree to 0.05 deg). a runs toward the Lake along the axis, b east; the origin is the
// fountain's centre. Meshes are built in a local frame x = b, y = world y, z = -a, placed with rotation.y = -TH.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyLightTrim, applyStoneDetail } from '../world/materials.js';
import { FW25, FW26, FW27, fountainProbe, fountainSpray, poolRings, veilMat } from './fountainFX.js';

export const TH = (16.85 * Math.PI) / 180;
export const C0 = [31.313, 976.286];          // the fountain's centre, world x, z
const NA = [Math.sin(TH), -Math.cos(TH)];     // +a in world x, z
const EB = [Math.cos(TH), Math.sin(TH)];      // +b in world x, z
export const wld = (a, b) => [C0[0] + NA[0] * a + EB[0] * b, C0[1] + NA[1] * a + EB[1] * b];
export const loc = (x, z) => { const dx = x - C0[0], dz = z - C0[1]; return [dx * NA[0] + dz * NA[1], dx * EB[0] + dz * EB[1]]; };
// a heading in the frame (along +a = 0, toward +b = pi/2) as three's rotation.y for a +z-forward model (world facing
// (sin yaw, cos yaw) in x, z)
export const yawAB = (h) => { const da = Math.cos(h), db = Math.sin(h); return Math.atan2(NA[0] * da + EB[0] * db, NA[1] * da + EB[1] * db); };

// ---- the plan (metres, terrace frame; orthoimagery and OSM, see the notes) ----------------------------------------
export const PLAN = {
  // the lower esplanade (Mould's seat-wall plan, 1861, IO_6a073d94: 78'0 5/8" from the fountain's centre to the lake wall
  // and to either side wall; the three bays arcs of 45'3" radius centred 45'0" out; OSM and the orthoimagery agree to 0.4 m)
  lakeA: 23.8,                                    // the lake wall's inner face
  bay: { c: 13.72, r: 13.79 },                    // the bays: circles of radius r centred c from the fountain on the axes
  sideB: 23.8,                                    // the side seat walls' inner faces
  basinR: 14.63,                                  // the pool: 96 ft across (NYC Parks)
  southA: -21.7,                                  // the south terrace's edge (orthoimagery), balustrades either side
  arc: { c: 13.72, r: 13.79, tread: 0.45 },       // its middle: two curved steps, the top edge on the fourth bay's arc
  // the grand staircases (IO_b29047e5): 11.0 m wide, two flights of 21'0" with a 16'0" landing, 1'2" treads, 6" risers,
  // 19 risers a flight, the drop 19'0"; the foot on the orthoimagery
  stairFootA: -40.6,
  landA0: -47.0, landA1: -51.88,
  stairTopA: -58.28,
  stairB0: 12.58, stairB1: 23.6,                  // the treads span |b| 12.58..23.6
  wallIn: [11.57, 12.58], wallOut: [23.6, 24.4],  // the inner and outer parapets
  // the Arcade (IO_88053a0f, IO_6dcacb04): the north face 75'11" wide with seven arches in 2 + 3 + 2, 7'9 2/3" spans;
  // the central passage 3 bays of 9'6 2/3" wide and 10 long, the loggias 2 wide and 5 long
  arcadeA: -51.8,                                 // the face (NYC footprint -51.7, OSM -52.2)
  arcadeT: 0.9,
  arcadeB: 11.57,
  bay9: 2.91,                                     // the ceiling's bay
  hallA1: -51.8 - 5 * 2.91,                       // the loggias' back wall
  tunnelB: 1.5 * 2.91, tunnelA1: -51.8 - 10 * 2.91,   // the central passage, under the drive
  upperA1: -67.0,                                 // the upper terrace's south edge (the drive's north kerb)
  // the Mall stair (IO_b29047e5): 30'10" wide, two flights of 19'10" and a 19'7" landing, 36 risers; its foot 5 m past
  // the passage's end, its head at the Mall (orthoimagery a -86 / -104)
  mallLandA: -86.0, mallTopA: -104.07, mallFl: 6.05, mallB: 4.7, mallWall: 1.0,
};

// ---- materials ------------------------------------------------------------------------------------------------------
const LT = (m) => applyLightTrim(m);
// procedural textures (canvas); one each, shared
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let _seed = 12345;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);

// A height field (0..1) -> a tangent-space normal map canvas
function heightToNormal(H, W, Hh, k = 2.0) {
  const cv = canvas(W, Hh), c = cv.getContext('2d'), img = c.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const hx = H[y * W + ((x + 1) % W)] - H[y * W + ((x + W - 1) % W)];
    const hy = H[((y + 1) % Hh) * W + x] - H[((y + Hh - 1) % Hh) * W + x];
    const nx = -hx * k, ny = hy * k, l = Math.hypot(nx, ny, 1), i = (y * W + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}
const texOf = (cv, srgb, rep = 1) => {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// Mould's carved panels: a relief height field of scrolling stems, leaves and rosettes in a moulded frame (one panel
// 1.2 m wide x 0.8 m tall on the texture), drawn with canvas paths and blurred into a height
let _relief = null;
function reliefMaps() {
  if (_relief) return _relief;
  const W = 256, Hh = 192, cv = canvas(W, Hh), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
  // the frame: a raised border and a sunk field
  c.fillStyle = '#b0b0b0'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#404040'; c.fillRect(14, 14, W - 28, Hh - 28);
  c.fillStyle = '#707070'; c.fillRect(20, 20, W - 40, Hh - 40);
  // the stem: a sine scroll with volutes, leaves along it, rosettes in the loops
  _seed = 777;
  c.strokeStyle = '#e8e8e8'; c.lineCap = 'round';
  c.lineWidth = 7;
  c.beginPath();
  for (let x = 24; x <= W - 24; x += 2) { const y = Hh / 2 + Math.sin(((x - 24) / (W - 48)) * Math.PI * 2) * 38; x === 24 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.stroke();
  for (let k = 0; k < 2; k++) {
    const cx = 24 + (W - 48) * (0.25 + k * 0.5), cy = Hh / 2 + (k ? 1 : -1) * 10;
    c.lineWidth = 5; c.beginPath();
    for (let t = 0; t < 1; t += 0.02) { const r = 30 * (1 - t), an = t * Math.PI * 3.2 + (k ? Math.PI : 0); const x = cx + Math.cos(an) * r, y = cy - (k ? -1 : 1) * Math.sin(an) * r; t === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    for (let p = 0; p < 8; p++) { const an = (p / 8) * Math.PI * 2; c.fillStyle = '#d0d0d0'; c.beginPath(); c.ellipse(cx + Math.cos(an) * 12, cy + Math.sin(an) * 12, 6, 3, an, 0, Math.PI * 2); c.fill(); }
  }
  for (let i = 0; i < 26; i++) {
    const x = 30 + rnd() * (W - 60), y0 = Hh / 2 + Math.sin(((x - 24) / (W - 48)) * Math.PI * 2) * 38, s = rnd() < 0.5 ? -1 : 1;
    c.fillStyle = `rgb(${200 + rnd() * 55 | 0},${200 + rnd() * 55 | 0},${200 + rnd() * 55 | 0})`;
    c.beginPath(); c.ellipse(x + 6, y0 + s * 12, 11, 4.5, s * 0.8 + (rnd() - 0.5) * 0.6, 0, Math.PI * 2); c.fill();
  }
  // blur into a height
  const d = c.getImageData(0, 0, W, Hh).data, H0 = new Float32Array(W * Hh), H = new Float32Array(W * Hh);
  for (let i = 0; i < W * Hh; i++) H0[i] = d[i * 4] / 255;
  for (let pass = 0; pass < 2; pass++) {
    const S = pass ? H : H0, D = pass ? H0 : H;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += S[((y + dy + Hh) % Hh) * W + ((x + dx + W) % W)];
      D[y * W + x] = s / 25;
    }
  }
  const nrm = heightToNormal(H0, W, Hh, 5.0);
  // an occlusion tint: the sunk field darker (grime in the carving)
  const ao = canvas(W, Hh), ac = ao.getContext('2d'), ai = ac.createImageData(W, Hh);
  for (let i = 0; i < W * Hh; i++) { const v = 150 + H0[i] * 105; ai.data[i * 4] = v; ai.data[i * 4 + 1] = v; ai.data[i * 4 + 2] = v * 0.97; ai.data[i * 4 + 3] = 255; }
  ac.putImageData(ai, 0, 0);
  _relief = { nrm: texOf(nrm, false), ao: texOf(ao, true) };
  return _relief;
}

// the diaper work (Caen stone on the drawings) of the Mall stair's walls and the Arcade's: a raised diamond lattice in
// a moulded frame, one panel to a texture (height field -> normal map, the sunk diamonds darker)
let _diaper = null;
function diaperMaps() {
  if (_diaper) return _diaper;
  const W = 256, Hh = 256, H = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh, fr = Math.min(u, 1 - u, v, 1 - v);
    let h = fr < 0.05 ? 1 : fr < 0.07 ? 0.55 : 0.3;
    if (fr >= 0.07) { const p = (u - 0.07) * 5.2, q = (v - 0.07) * 5.2, d1 = Math.abs(((p + q) % 1 + 1) % 1 - 0.5), d2 = Math.abs(((p - q) % 1 + 1) % 1 - 0.5); h = Math.max(h, 0.95 - Math.min(d1, d2) * 6); }
    H[y * W + x] = Math.max(0, Math.min(1, h));
  }
  const nrm = heightToNormal(H, W, Hh, 3.0);
  const ao = canvas(W, Hh), ac = ao.getContext('2d'), ai = ac.createImageData(W, Hh);
  for (let i = 0; i < W * Hh; i++) { const v = 150 + H[i] * 105; ai.data[i * 4] = v; ai.data[i * 4 + 1] = v * 0.98; ai.data[i * 4 + 2] = v * 0.92; ai.data[i * 4 + 3] = 255; }
  ac.putImageData(ai, 0, 0);
  _diaper = { nrm: texOf(nrm, false), ao: texOf(ao, true) };
  return _diaper;
}
// the terrace's stone: the Albert (New Brunswick) sandstone Vaux and Mould carved, a warm buff going olive and grey where
// it has weathered; triplanar sandstone detail with ashlar coursing
let _M = null;
export function mats() {
  if (_M) return _M;
  const stone = (hex, o = {}) => applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, metalness: 0, ...o.p })), 'climestone', { amt: 0.8, nrm: 0.75, rgh: 0.4, ashlar: o.ashlar ?? 0.8 });
  const R = reliefMaps(), D = diaperMaps();
  const carved = applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: 0xa08e6c, roughness: 0.92, metalness: 0, map: R.ao, normalMap: R.nrm, normalScale: new THREE.Vector2(1.1, 1.1) })), 'climestone', { amt: 0.55, nrm: 0.35, rgh: 0.3 });
  const gran = (hex, rg = 0.8) => applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: hex, roughness: rg, metalness: 0.02 })), 'cgranite', { amt: 0.7, nrm: 0.6, rgh: 0.4 });
  _M = {
    sand: stone(0x9d8b69),              // the dressed walls and piers
    sandD: stone(0x7f735b, { ashlar: 0.9 }),   // weathered courses, the plinths
    sandL: stone(0xb3a07c, { ashlar: 0.4 }),   // copings and caps, washed by the rain
    carved,                              // the carved parapet panels
    diaper: applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: 0xb2a488, roughness: 0.9, metalness: 0, map: D.ao, normalMap: D.nrm, normalScale: new THREE.Vector2(0.9, 0.9) })), 'climestone', { amt: 0.5, nrm: 0.3, rgh: 0.3 }),
    gran: gran(0x8e8a82),                // the treads, the basin's coping
    granD: gran(0x6b6962, 0.7),          // the basin wall under the water line, wet
    paving: pavingMat(),
    upper: upperPavingMat(),
    tile: tileMat(),
    bronze: LT(new THREE.MeshStandardMaterial({ color: 0x46503e, roughness: 0.5, metalness: 0.55, flatShading: true })),
    bronzeD: LT(new THREE.MeshStandardMaterial({ color: 0x2f3a31, roughness: 0.55, metalness: 0.5, flatShading: true })),
    iron: LT(new THREE.MeshStandardMaterial({ color: 0x1d2320, roughness: 0.55, metalness: 0.6 })),
    glass: LT(new THREE.MeshStandardMaterial({ color: 0xfff2d8, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0.6 })),
    dark: LT(new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.95 })),
    leaf: LT(new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.85, flatShading: true })),
  };
  return _M;
}

// The lower terrace's paving (orthoimagery, 2022-25): red brick-toned pavers in panels framed by pale granite bands:
// a ring at the basin, eight radial bands at 22.5 deg + k 45 deg, a border along the edges, the south terrace's panels
// with their small square insets, the medallion at the Arcade's forecourt. Drawn once on a canvas over the terrace
// (3.3 cm a pixel), mapped by the frame's (b, a); a small brick bond on top at close range (the shader's second UV set
// is the same (b, a) in metres).
export const PAVE_BOX = { b0: -28, b1: 28, a0: -53, a1: 30 };
// the pavers at close range: the red panels are Roman brick (8 x 4 in faces here), laid at 45 deg to the axis in a
// stretcher bond, a tone per brick and darker joints, faded out as a brick falls under a few pixels; the pale bands
// (the base texture's low red-blue difference) keep their stone. sx, sy: metres per UV unit (b and a)
function brickDetail(m, sx, sy) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 pm = vec2( vMapUv.x * ${sx.toFixed(3)}, vMapUv.y * ${sy.toFixed(3)} );
        vec2 q = vec2( 0.70711 * ( pm.x + pm.y ), 0.70711 * ( pm.y - pm.x ) );
        float row = floor( q.y / 0.1 );
        float xb = q.x / 0.2 + 0.5 * mod( row, 2.0 );
        vec2 cell = vec2( floor( xb ), row );
        vec2 f = vec2( fract( xb ) * 0.2, fract( q.y / 0.1 ) * 0.1 );
        float jd = min( min( f.x, 0.2 - f.x ), min( f.y, 0.1 - f.y ) );
        float aa = clamp( 1.0 - length( fwidth( q ) ) / 0.035, 0.0, 1.0 );
        float joint = ( 1.0 - smoothstep( 0.0, 0.007, jd ) ) * aa;
        float h = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float isBrick = smoothstep( 0.14, 0.22, diffuseColor.r - diffuseColor.b );
        diffuseColor.rgb *= mix( 1.0, mix( 1.0, 0.84 + 0.3 * h, aa ) * ( 1.0 - 0.42 * joint ), isBrick );
      }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|cpbBrick' + sx.toFixed(1) + sy.toFixed(1);
  m.needsUpdate = true;
  return m;
}
function pavingMat() {
  const W = 1700, Hh = Math.round(W * (PAVE_BOX.a1 - PAVE_BOX.a0) / (PAVE_BOX.b1 - PAVE_BOX.b0));
  const cv = canvas(W, Hh), c = cv.getContext('2d');
  const s = W / (PAVE_BOX.b1 - PAVE_BOX.b0);
  const X = (b) => (b - PAVE_BOX.b0) * s, Y = (a) => (PAVE_BOX.a1 - a) * s;
  // brick field with a per-paver tone (4 x 8 in pavers read as a fine grain at this scale)
  c.fillStyle = '#7d4a3d'; c.fillRect(0, 0, W, Hh);   // the Roman brick weathered to a muted red-brown (the photographs)
  const img = c.getImageData(0, 0, W, Hh);
  _seed = 4242;
  for (let i = 0; i < W * Hh; i++) { const k = 0.9 + rnd() * 0.2; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k * (0.98 + rnd() * 0.04); img.data[i * 4 + 2] *= k; }
  c.putImageData(img, 0, 0);
  // weathering: broad darker and paler patches
  for (let i = 0; i < 90; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(40,20,15,0.07)' : 'rgba(210,170,150,0.06)'; c.beginPath(); c.ellipse(rnd() * W, rnd() * Hh, 20 + rnd() * 90, 15 + rnd() * 60, rnd() * 3, 0, Math.PI * 2); c.fill(); }
  const band = '#b8ad99', bw = 0.42 * s;
  c.strokeStyle = band; c.lineWidth = bw; c.lineCap = 'butt';
  const line = (a0, b0, a1, b1) => { c.beginPath(); c.moveTo(X(b0), Y(a0)); c.lineTo(X(b1), Y(a1)); c.stroke(); };
  const circ = (ca, cb, r, t0 = 0, t1 = Math.PI * 2) => { c.beginPath(); c.arc(X(cb), Y(ca), r * s, t0, t1); c.stroke(); };
  // the basin's ring bands
  circ(0, 0, PLAN.basinR + 0.45); c.lineWidth = bw * 0.7; circ(0, 0, PLAN.basinR + 1.9); c.lineWidth = bw;
  // eight radial bands
  for (let k = 0; k < 8; k++) { const t = (22.5 + k * 45) * Math.PI / 180, r0 = PLAN.basinR + 0.45, r1 = 40; line(Math.cos(t) * r0, Math.sin(t) * r0, Math.cos(t) * r1, Math.sin(t) * r1); }
  // the three bays' borders: bands following each bay's arc 0.7 m in, clipped to the bay beyond its wall line
  {
    const c0 = PLAN.bay.c, rb = PLAN.bay.r - 0.7;
    for (const [ca, cb, clip] of [[c0, 0, [PAVE_BOX.b0, PLAN.lakeA, PAVE_BOX.b1, PAVE_BOX.a1]], [0, c0, [PLAN.sideB, PAVE_BOX.a0, PAVE_BOX.b1, PAVE_BOX.a1]], [0, -c0, [PAVE_BOX.b0, PAVE_BOX.a0, -PLAN.sideB, PAVE_BOX.a1]]]) {
      c.save(); c.beginPath(); c.rect(X(clip[0]), Y(clip[3]), X(clip[2]) - X(clip[0]), Y(clip[1]) - Y(clip[3])); c.clip();
      circ(ca, cb, rb); c.lineWidth = bw * 0.6; circ(ca, cb, rb - 0.9); c.lineWidth = bw;
      c.restore();
    }
  }
  // borders: the lake front, the sides, the south terrace's edge and panels
  const inset = 0.7;
  line(PLAN.lakeA - inset, -PLAN.sideB + inset, PLAN.lakeA - inset, PLAN.sideB - inset);
  for (const sg of [-1, 1]) {
    line(PLAN.lakeA - inset, sg * (PLAN.sideB - inset), PLAN.stairFootA + inset, sg * (PLAN.sideB - inset));
    // the south terrace's side panels (in front of the stairs), with a small square inset in each
    const b0 = sg * (PLAN.arcadeB + 0.6), b1 = sg * (PLAN.sideB - 1.6);
    c.beginPath(); c.rect(Math.min(X(b0), X(b1)), Y(PLAN.southA - 1.2), Math.abs(X(b1) - X(b0)), Y(PLAN.stairFootA + 1.0) - Y(PLAN.southA - 1.2)); c.stroke();
    c.fillStyle = band; const qb = sg * 17.6, qa = -33.2; c.fillRect(X(qb) - 0.3 * s, Y(qa) - 0.3 * s, 0.6 * s, 0.6 * s);
    line(PLAN.southA - 0.35, sg * PLAN.arcadeB, PLAN.stairFootA, sg * PLAN.arcadeB);
    line(PLAN.southA - 0.35, sg * (PLAN.arcadeB - 0.8), PLAN.arcadeA, sg * (PLAN.arcadeB - 0.8));
  }
  // the south terrace's curved front (the steps' edge) and a band following it inside
  c.lineWidth = bw * 0.8; circ(-PLAN.arc.c, 0, PLAN.arc.r + 0.6, 0, Math.PI);
  // the forecourt's frame and its medallion (a compass disc, 4.2 m)
  c.lineWidth = bw;
  c.beginPath(); c.rect(X(-PLAN.arcadeB + 1.6), Y(PLAN.southA - 7.5), X(PLAN.arcadeB - 1.6) - X(-PLAN.arcadeB + 1.6), Y(PLAN.arcadeA + 0.8) - Y(PLAN.southA - 7.5)); c.stroke();
  const ma = -40.3;
  c.fillStyle = '#9d9483'; c.beginPath(); c.arc(X(0), Y(ma), 2.1 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#7a4336'; c.beginPath(); c.arc(X(0), Y(ma), 1.7 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#b3a892';
  for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4, r = (k % 2 ? 1.1 : 1.65) * s; c.beginPath(); c.moveTo(X(0) + Math.cos(t) * r, Y(ma) + Math.sin(t) * r); c.lineTo(X(0) + Math.cos(t + 0.35) * 0.35 * s, Y(ma) + Math.sin(t + 0.35) * 0.35 * s); c.lineTo(X(0) + Math.cos(t - 0.35) * 0.35 * s, Y(ma) + Math.sin(t - 0.35) * 0.35 * s); c.fill(); }
  c.lineWidth = bw * 0.5; c.strokeStyle = '#c9bea8'; circ(ma, 0, 1.9);
  const t = texOf(cv, true);
  t.anisotropy = 16;
  const m = LT(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 }));
  m.userData.paveBox = PAVE_BOX;
  return brickDetail(applyStoneDetail(m, 'cpave', { amt: 0.25, nrm: 0.35, rgh: 0.3 }), PAVE_BOX.b1 - PAVE_BOX.b0, PAVE_BOX.a1 - PAVE_BOX.a0);
}
// the upper terrace: the same brick with pale bands, its medallion on the axis
function upperPavingMat() {
  const W = 1024, Hh = 256, cv = canvas(W, Hh), c = cv.getContext('2d');   // b -25..25, a -67.5..-55 (and over the Arcade)
  c.fillStyle = '#8a4b3b'; c.fillRect(0, 0, W, Hh);
  const img = c.getImageData(0, 0, W, Hh); _seed = 99;
  for (let i = 0; i < W * Hh; i++) { const k = 0.9 + rnd() * 0.2; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  c.putImageData(img, 0, 0);
  const s = W / 50, X = (b) => (b + 25) * s, Y = (a) => (-51 - a) * (Hh / 16.5);
  c.strokeStyle = '#b8ad99'; c.lineWidth = 0.4 * s;
  c.strokeRect(X(-24), Y(-51.8), X(24) - X(-24), Y(-66.6) - Y(-51.8));
  c.strokeRect(X(-10.6), Y(-52.4), X(10.6) - X(-10.6), Y(-59.0) - Y(-52.4));
  c.fillStyle = '#9d9483'; c.beginPath(); c.ellipse(X(0), Y(-60.2), 2.1 * s, 2.1 * (Hh / 16.5), 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#7a4336'; c.beginPath(); c.ellipse(X(0), Y(-60.2), 1.6 * s, 1.6 * (Hh / 16.5), 0, 0, Math.PI * 2); c.fill();
  const t = texOf(cv, true);
  return brickDetail(applyStoneDetail(LT(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 })), 'cpave', { amt: 0.25, nrm: 0.35, rgh: 0.3 }), 50, 16.5);
}
// The Arcade's ceiling: Minton encaustic tiles, 15,876 in 49 panels of 18 x 18 (CPC 2007), one panel in each 9'6 2/3"
// bay between the wrought-iron girders, the rosette and pinwheel designs by turns (25 and 24 panels). The texture holds
// two bays by two (A B / B A), 512 px a bay: the panel's 18 tiles of ~5 1/4 in, a border of dark and buff tiles, the
// girders' soffit round it
function tileMat() {
  const BAY = 512, cv = canvas(BAY * 2, BAY * 2), c = cv.getContext('2d');
  const buff = '#e2d2ae', terra = '#a4462c', blue = '#2c4a7c', ochre = '#c8963e', black = '#262320', green = '#4f6a3a';
  const panelPx = Math.round(BAY * (2.4 / 2.91)), off = (BAY - panelPx) / 2, T = panelPx / 18;
  _seed = 1873;
  for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
    const X0 = bx * BAY, Y0 = by * BAY, rosette = (bx + by) % 2 === 0;
    c.fillStyle = '#4a3a2c'; c.fillRect(X0, Y0, BAY, BAY);                       // the soffit round the panel
    c.fillStyle = '#6b5440'; c.fillRect(X0 + off - 6, Y0 + off - 6, panelPx + 12, panelPx + 12);
    for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) {
      const x = X0 + off + i * T, y = Y0 + off + j * T, edge = i === 0 || j === 0 || i === 17 || j === 17, edge2 = i === 1 || j === 1 || i === 16 || j === 16;
      const k = 0.92 + rnd() * 0.12, tint = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };
      if (edge) { c.fillStyle = tint((i + j) % 2 ? black : terra); c.fillRect(x, y, T, T); continue; }
      if (edge2) { c.fillStyle = tint(buff); c.fillRect(x, y, T, T); c.fillStyle = tint(blue); c.fillRect(x + T * 0.3, y + T * 0.3, T * 0.4, T * 0.4); continue; }
      c.fillStyle = tint(buff); c.fillRect(x, y, T, T);
      const cx = x + T / 2, cy = y + T / 2;
      if (rosette) {
        c.fillStyle = tint(terra); for (let p = 0; p < 8; p++) { const an = (p / 8) * Math.PI * 2; c.beginPath(); c.ellipse(cx + Math.cos(an) * T * 0.22, cy + Math.sin(an) * T * 0.22, T * 0.14, T * 0.07, an, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = tint(ochre); c.beginPath(); c.arc(cx, cy, T * 0.11, 0, Math.PI * 2); c.fill();
        c.fillStyle = tint(blue); for (const [dx, dy] of [[0, 0], [T, 0], [0, T], [T, T]]) { c.beginPath(); c.moveTo(x + dx, y + dy - T * 0.16); c.lineTo(x + dx + T * 0.16, y + dy); c.lineTo(x + dx, y + dy + T * 0.16); c.lineTo(x + dx - T * 0.16, y + dy); c.fill(); }
      } else {
        const q = (i + j) % 2;
        for (let v = 0; v < 4; v++) {
          const an = (v / 4) * Math.PI * 2 + (q ? Math.PI / 4 : 0);
          c.fillStyle = tint(v % 2 ? blue : terra);
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(an) * T * 0.46, cy + Math.sin(an) * T * 0.46); c.lineTo(cx + Math.cos(an + 0.9) * T * 0.3, cy + Math.sin(an + 0.9) * T * 0.3); c.fill();
        }
        c.fillStyle = tint(green); c.beginPath(); c.arc(cx, cy, T * 0.08, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = 'rgba(40,30,20,0.35)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    }
  }
  const t = texOf(cv, true);
  t.anisotropy = 16;
  return LT(new THREE.MeshStandardMaterial({ map: t, roughness: 0.28, metalness: 0.02, emissiveMap: t, emissive: 0x3a2a1a, emissiveIntensity: 0.6 }));
}

// ---- the geometry bag: parts per material in the local frame (x = b, z = -a), merged at the end --------------------
export class Bag {
  constructor() { this.m = new Map(); }
  add(key, g) { if (!g) return; const L = this.m.get(key) || []; L.push(g.index ? g.toNonIndexed() : g); this.m.set(key, L); return g; }
  // a box over a in [a0, a1], b in [b0, b1], y in [y0, y1]
  box(key, a0, a1, b0, b1, y0, y1) {
    const g = new THREE.BoxGeometry(Math.abs(b1 - b0), Math.abs(y1 - y0), Math.abs(a1 - a0));
    g.translate((b0 + b1) / 2, (y0 + y1) / 2, -(a0 + a1) / 2);
    return this.add(key, g);
  }
  // a box of size (w along b, h, d along a) under a matrix built in the local frame
  boxM(key, w, h, d, m4) { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(m4); return this.add(key, g); }
  mesh(group, M, opts = {}) {
    const out = [];
    for (const [key, L] of this.m) {
      if (!L.length) continue;
      const fixed = L.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; });
      const g = mergeGeometries(fixed, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, M[key]);
      mesh.castShadow = opts.cast ?? true; mesh.receiveShadow = true; mesh.name = 'cp32b:' + key;
      group.add(mesh); out.push(mesh);
    }
    return out;
  }
}

// a polygon (array of [a, b]) with holes as a flat top face at y, UVs = (b, a) in metres (uvFn to remap)
export function flatFace(outer, holes, y, uvFn) {
  const sh = new THREE.Shape(outer.map(([a, b]) => new THREE.Vector2(b, a)));
  for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(b, a))));
  const g = new THREE.ShapeGeometry(sh, 24);
  // ShapeGeometry lies in x, y: (x = b, y = a) -> local (x = b, y, z = -a); the face must point up
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const b = p.getX(i), a = p.getY(i); p.setXYZ(i, b, y, -a); const [u, v] = uvFn ? uvFn(a, b) : [b, a]; uv.setXY(i, u, v); }
  // ShapeGeometry faces +z in (x = b, y = a); e_b x e_a = +y in the local frame, so the face points up as mapped
  g.computeVertexNormals();
  if (g.attributes.normal.count && g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }
  return g;
}
// vertical walls along a polyline of [a, b] points from y0(a,b) to y1(a,b): a skirt, faces toward `side` (+1 left of
// the walk direction in the (b, a) plane... here: both faces, double-sided by two quads)
export function skirt(pts, y0f, y1f, both = true) {
  const P = [], N = [], UV = [];
  let u = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], L = Math.hypot(a1 - a0, b1 - b0);
    const q = [[b0, y0f(a0, b0), -a0, u], [b1, y0f(a1, b1), -a1, u + L], [b1, y1f(a1, b1), -a1, u + L], [b0, y1f(a0, b0), -a0, u]];
    const nx = -(a1 - a0) / (L || 1), nz = -(b1 - b0) / (L || 1);   // normal in local (x, z)
    const tri = (A, B, C, s) => { for (const v of [A, B, C]) { P.push(v[0], v[1], v[2]); N.push(nx * s, 0, nz * s); UV.push(v[3], v[1]); } };
    tri(q[0], q[2], q[1], 1); tri(q[0], q[3], q[2], 1);             // front faces toward +n
    if (both) { tri(q[0], q[1], q[2], -1); tri(q[0], q[2], q[3], -1); }
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
// a lathe of (r, y) pairs (profile counter-clockwise: up the outside, across the top, down the inside)
export const lathe = (pts, seg = 64, p0 = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);
// the local-frame matrix for a point (a, b, y) and a heading about y (radians, 0 = along +a)
export function mAt(a, b, y, h = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h);
  return m.compose(new THREE.Vector3(b, y, -a), q, new THREE.Vector3(sx, sy, sz));
}



// ---- the structures -------------------------------------------------------------------------------------------------
// the outline of the lower terrace's plaza (points [a, b], clockwise in (b, a)): the lake front with its bay, the east
// side with its bay, the south edge with the curved steps' foot, the west side with its bay
const arcPts = (ca, cb, r, t0, t1, n) => Array.from({ length: n + 1 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / n; return [ca + Math.cos(t) * r, cb + Math.sin(t) * r]; });
function circleThrough(a0, b0, a1, b1, am, bm) {   // centre and radius of the circle through three points (a, b)
  const ax = b0, ay = a0, bx = bm, by = am, cx = b1, cy = a1, d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { a: uy, b: ux, r: Math.hypot(ax - ux, ay - uy) };
}
const angAB = (C, a, b) => Math.atan2(b - C.b, a - C.a);   // the angle t of (a, b) about C (a = C.a + r cos t, b = C.b + r sin t)
function arcBetween(a0, b0, a1, b1, am, bm, n) {
  const C = circleThrough(a0, b0, a1, b1, am, bm);
  const t0 = angAB(C, a0, b0);
  const norm = (t) => { while (t < t0) t += Math.PI * 2; while (t >= t0 + Math.PI * 2) t -= Math.PI * 2; return t; };
  let t1 = norm(angAB(C, a1, b1));
  const tm = norm(angAB(C, am, bm));
  if (tm > t1) t1 -= Math.PI * 2;   // go the way that passes the middle point
  return arcPts(C.a, C.b, C.r, t0, t1, n);
}
export const BAYS = (() => {
  const c = PLAN.bay.c, r = PLAN.bay.r, half = Math.sqrt(r * r - (PLAN.sideB - c) ** 2);
  return { c, r, half, out: c + r, stepR: PLAN.arc.r - 2 * PLAN.arc.tread };
})();
export function plazaOutline() {
  const P = [], S = PLAN.sideB, A = PLAN.lakeA, { c, r, half } = BAYS, sa = PLAN.southA;
  const tl = (b) => Math.atan2(b, A - c);   // the lake bay's angle at (A, b), about (c, 0)
  P.push([A, -S], [A, -half]);
  P.push(...arcPts(c, 0, r, tl(-half), tl(half), 20).slice(1, -1));
  P.push([A, half], [A, S], [half, S]);
  const ts = (a) => Math.atan2(S - c, a);   // the east bay about (0, c): a = r cos t, b = c + r sin t
  P.push(...arcPts(0, c, r, ts(half), ts(-half), 18).slice(1, -1));
  P.push([-half, S], [sa, S]);
  const rb = BAYS.stepR, ca = -PLAN.arc.c, bx = Math.sqrt(rb * rb - (sa - ca) ** 2);
  P.push([sa, bx]);
  const t0 = Math.atan2(bx, sa - ca), t1 = Math.atan2(-bx, sa - ca) + Math.PI * 2;
  P.push(...arcPts(ca, 0, rb, t0, t1, 22).slice(1, -1));
  P.push([sa, -bx], [sa, -S], [-half, -S]);
  const tw = (a) => Math.atan2(-S + c, a);  // the west bay about (0, -c)
  P.push(...arcPts(0, -c, r, tw(-half), tw(half), 18).slice(1, -1));
  P.push([half, -S]);
  return P;
}
const circlePts = (r, n, ca = 0, cb = 0) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [ca + Math.cos(t) * r, cb + Math.sin(t) * r]; });
// a run along (da, db) in the frame as the heading mAt() takes (a box's depth axis along the run)
const runYaw = (da, db) => Math.atan2(db, -da);
// flip a geometry's triangles (after a mirror)
function flipWinding(g) {
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  else for (const k of Object.keys(g.attributes)) {
    const A = g.attributes[k], s = A.itemSize, arr = A.array;
    for (let i = 0; i + 2 < A.count; i += 3) for (let c = 0; c < s; c++) { const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t; }
  }
  g.computeVertexNormals();
  return g;
}
// an oriented box from p0 to p1 (each [a, b, y]) of width w (across, horizontal), from the line - hBot to the line +
// hTop, its ends vertical: raking copings, plinths and parapets
function rakeBox(bag, key, p0, p1, w, hTop, hBot) {
  const da = p1[0] - p0[0], db = p1[1] - p0[1], dy = p1[2] - p0[2], Lh = Math.hypot(da, db);
  if (Lh < 1e-4) return null;
  const g = new THREE.BoxGeometry(w, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) + 0.5, y = pos.getY(i);
    pos.setXYZ(i, pos.getX(i), p0[2] + dy * t + (y > 0 ? hTop : -hBot), -t * Lh);
  }
  g.computeVertexNormals();
  g.rotateY(Math.atan2(-db, da));   // local -z onto the run's (x = b, z = -a) direction
  g.translate(p0[1], 0, -p0[0]);
  return bag.add(key, g);
}
// a balustrade on a straight run from (a0, b0) to (a1, b1) with its base at yf(a, b): plinth, turned balusters, a rail
// with a moulded coping; piers at the ends and every <= 4.2 m
function balustrade(bag, balL, a0, b0, a1, b1, yf, o = {}) {
  const L = Math.hypot(a1 - a0, b1 - b0), ua = (a1 - a0) / L, ub = (b1 - b0) / L, H = o.h ?? 1.05, ends = o.ends ?? [true, true];
  const nP = Math.max(1, Math.ceil(L / (o.bay ?? 4.2))), yaw = runYaw(ua, ub);
  for (let k = 0; k <= nP; k++) {
    if ((k === 0 && !ends[0]) || (k === nP && !ends[1])) continue;
    const t = (k / nP) * L, a = a0 + ua * t, b = b0 + ub * t, y = yf(a, b);
    const pw = k === 0 || k === nP ? 0.78 : 0.62;
    bag.boxM('sand', pw, H + 0.12, pw, mAt(a, b, y + (H + 0.12) / 2, yaw));
    bag.boxM('sandL', pw + 0.12, 0.12, pw + 0.12, mAt(a, b, y + H + 0.18, yaw));
    bag.boxM('sandL', pw * 0.55, 0.22, pw * 0.55, mAt(a, b, y + H + 0.35, yaw));
  }
  for (let k = 0; k < nP; k++) {
    const s0 = (k / nP) * L + 0.36, s1 = ((k + 1) / nP) * L - 0.36;
    if (s1 - s0 < 0.2) continue;
    const p0 = [a0 + ua * s0, b0 + ub * s0], p1 = [a0 + ua * s1, b0 + ub * s1];
    const y0 = yf(...p0), y1 = yf(...p1);
    rakeBox(bag, 'sandD', [p0[0], p0[1], y0], [p1[0], p1[1], y1], 0.5, 0.2, 0.05);                                  // plinth
    rakeBox(bag, 'sandL', [p0[0], p0[1], y0 + H - 0.16], [p1[0], p1[1], y1 + H - 0.16], 0.54, 0.16, 0.02);           // rail
    if (o.pierced) {
      // Mould's pierced panels (the photographs of the cross balustrades and the Arcade's): a slab with a row of round
      // openings between the plinth and the rail, one per 0.36 m
      const len = s1 - s0, ph = H - 0.36, sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, ph), new THREE.Vector2(0, ph)]);
      const nh = Math.max(1, Math.round(len / 0.36)), rr = Math.min(0.13, ph * 0.3);
      for (let j = 0; j < nh; j++) { const c = new THREE.Path(); c.absarc(((j + 0.5) / nh) * len, ph / 2, rr, 0, Math.PI * 2, true); sh.holes.push(c); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -0.1);
      // local x along the run from p0, y up: onto the run's heading (a panel on a level base)
      const yaw = Math.atan2(ub, -ua) - Math.PI / 2;
      g.rotateY(yaw);
      g.translate(p0[1], y0 + 0.2, -p0[0]);
      bag.add('sand', g);
      continue;
    }
    const n = Math.max(1, Math.round((s1 - s0) / 0.29));
    for (let j = 0; j < n; j++) {
      const s = s0 + ((j + 0.5) / n) * (s1 - s0), a = a0 + ua * s, b = b0 + ub * s;
      balL.push([a, b, yf(a, b) + 0.2, H - 0.36]);
    }
  }
}
// a turned baluster, 1 m tall (scaled to the run), for instancing
function balusterGeo() {
  return lathe([[0.001, 0], [0.085, 0], [0.085, 0.07], [0.06, 0.1], [0.075, 0.2], [0.1, 0.36], [0.09, 0.5], [0.05, 0.64], [0.04, 0.72], [0.065, 0.78], [0.05, 0.84], [0.085, 0.9], [0.085, 1.0], [0.001, 1.0]], 10);
}
// a solid parapet along a run whose nosing line goes p0[2] -> p1[2]: its top 1.1 m (h) carved panels under a coping,
// over an ashlar wall down to the floor (or deeper); o.topMin raises the top (a retaining wall with the ground behind)
function parapet(bag, p0, p1, w, h, floorY, o = {}) {
  const [a0, b0, y0] = p0, [a1, b1, y1] = p1;
  const L = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(L / 1.25));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const A = [a0 + (a1 - a0) * t0, b0 + (b1 - b0) * t0, y0 + (y1 - y0) * t0], B = [a0 + (a1 - a0) * t1, b0 + (b1 - b0) * t1, y0 + (y1 - y0) * t1];
    const top = (p) => Math.max(p[2] + h, o.topMin ?? -1e9) - 0.14;
    const TA = top(A), TB = top(B), bot = Math.min(A[2], B[2], floorY) - 0.3;
    rakeBox(bag, 'carved', [A[0], A[1], TA], [B[0], B[1], TB], w, 0, 0.95);
    const low = Math.min(TA, TB) - 0.95 - bot;
    if (low > 0.02) rakeBox(bag, o.lowKey || 'sand', [A[0], A[1], TA - 0.95], [B[0], B[1], TB - 0.95], w - 0.04, 0, low + Math.abs(TA - TB));
    rakeBox(bag, 'sandL', [A[0], A[1], TA], [B[0], B[1], TB], w + 0.14, 0.16, 0);
  }
}
// a pier (square, a base, a moulded cap and a ball finial), its foot at y, its shaft h tall
function pier(bag, a, b, y, h, w = 1.0, key = 'sand', ball = true) {
  bag.box('sandD', a - w / 2 - 0.08, a + w / 2 + 0.08, b - w / 2 - 0.08, b + w / 2 + 0.08, y - 0.3, y + 0.35);
  bag.box(key, a - w / 2, a + w / 2, b - w / 2, b + w / 2, y + 0.35, y + h);
  bag.box('sandL', a - w / 2 - 0.1, a + w / 2 + 0.1, b - w / 2 - 0.1, b + w / 2 + 0.1, y + h, y + h + 0.16);
  bag.box('sandL', a - w / 2 + 0.12, a + w / 2 - 0.12, b - w / 2 + 0.12, b + w / 2 - 0.12, y + h + 0.16, y + h + 0.36);
  if (ball) { const g = new THREE.SphereGeometry(w * 0.26, 14, 10); g.translate(b, y + h + 0.36 + w * 0.24, -a); bag.add('sandL', g); }
  return y + h + 0.36;
}
// a lamp on a pier: a cast-iron post with a hexagonal lantern (lit at night)
// a tall cast-iron lamppost with its lantern (the upper terrace's ends)
function lampPost(bag, a, b, y) {
  const post = lathe([[0.001, 0], [0.24, 0], [0.24, 0.3], [0.16, 0.42], [0.12, 0.9], [0.085, 3.2], [0.12, 3.3], [0.09, 3.4], [0.001, 3.4]], 12);
  post.translate(b, y, -a); bag.add('iron', post);
  const cage = new THREE.CylinderGeometry(0.24, 0.16, 0.6, 6, 1); cage.translate(b, y + 3.72, -a); bag.add('glass', cage);
  const roof = new THREE.ConeGeometry(0.32, 0.36, 6); roof.translate(b, y + 4.2, -a); bag.add('iron', roof);
  const fin = new THREE.SphereGeometry(0.06, 8, 6); fin.translate(b, y + 4.44, -a); bag.add('iron', fin);
}
function lamp(bag, a, b, y) {
  const post = lathe([[0.001, 0], [0.16, 0], [0.16, 0.12], [0.1, 0.2], [0.07, 0.6], [0.055, 1.6], [0.08, 1.7], [0.06, 1.8], [0.001, 1.8]], 10);
  post.translate(b, y, -a); bag.add('iron', post);
  const cage = new THREE.CylinderGeometry(0.2, 0.14, 0.5, 6, 1); cage.translate(b, y + 2.05, -a); bag.add('glass', cage);
  const roof = new THREE.ConeGeometry(0.27, 0.3, 6); roof.translate(b, y + 2.45, -a); bag.add('iron', roof);
  const fin = new THREE.SphereGeometry(0.05, 8, 6); fin.translate(b, y + 2.65, -a); bag.add('iron', fin);
}
const SOUTH_RISE = 0.24;
// a sandstone urn with its planting on a pier (the stairs' feet, the photographs)
function urn(bag, a, b, y) {
  const g = lathe([[0.001, 0], [0.24, 0], [0.24, 0.08], [0.15, 0.14], [0.13, 0.24], [0.3, 0.36], [0.44, 0.56], [0.42, 0.72], [0.5, 0.78], [0.46, 0.84], [0.001, 0.84]], 20);
  g.translate(b, y, -a); bag.add('sandL', g);
  for (let i = 0; i < 7; i++) { const an = i * 2.4, r = i ? 0.26 : 0, s = new THREE.IcosahedronGeometry(0.2 + (i % 3) * 0.04, 1); s.translate(b + Math.cos(an) * r, y + 0.95 + (i ? 0 : 0.12), -a + Math.sin(an) * r); bag.add('leaf', s); }
}
// the Arcade's north face (IO_88053a0f): seven arches in 2 + 3 + 2, the loggias' two either side of the passage's
// three; spans 7'9 2/3", the piers 0.58 m in the middle group, 0.69 m in the side ones; the crowns 13'6" over the floor
export function arcadeArches() {
  const S = 2.38, out = [], mid = 9.45 / 2, pm = (9.45 - 3 * S) / 4, ps = (PLAN.arcadeB - mid - 2 * S) / 3;
  for (let i = 0; i < 3; i++) { const b0 = -mid + pm + i * (S + pm); out.push([b0, b0 + S]); }
  for (const sg of [-1, 1]) for (let i = 0; i < 2; i++) { const b0 = mid + ps + i * (S + ps); out.push(sg > 0 ? [b0, b0 + S] : [-b0 - S, -b0]); }
  return out.sort((p, q) => p[0] - q[0]);
}

export function buildTerrace(G, L, o) {
  const M = mats(), bag = new Bag(), balL = [];
  const yl = L.low, ys = L.south, yu = L.up, h1 = (yu - ys) / 2, out = o.outside;
  const deck = (a0, a1, b0, b1, y) => { if (o.colliders) o.addBox(Math.min(a0, a1), Math.max(a0, a1), Math.min(b0, b1), Math.max(b0, b1), y - 0.3, y, true); };
  const solid = (a0, a1, b0, b1, y0, y1) => { if (o.colliders) o.addBox(Math.min(a0, a1), Math.max(a0, a1), Math.min(b0, b1), Math.max(b0, b1), y0, y1, false); };
  const PB = PAVE_BOX, puv = (a, b) => [(b - PB.b0) / (PB.b1 - PB.b0), (a - PB.a0) / (PB.a1 - PB.a0)];
  const { half, out: bayOut, stepR } = BAYS, ca = -PLAN.arc.c;
  // 1. the plaza: the paved slab round the basin
  const outline = plazaOutline();
  bag.add('paving', flatFace(outline, [circlePts(PLAN.basinR - 0.05, 96)], yl, puv));
  bag.add('sandD', skirt([...outline, outline[0]], () => yl - 0.7, () => yl, false));
  for (const [a0, a1, b0, b1] of [[PLAN.southA, PLAN.lakeA, -PLAN.sideB, PLAN.sideB], [-half, half, -bayOut, bayOut], [PLAN.lakeA, bayOut, -half, half], [ca - stepR, PLAN.southA, -stepR * 0.8, stepR * 0.8]]) deck(a0, a1, b0, b1, yl);
  // 2. the south terrace (two steps up), the forecourt and the Arcade's floor
  const sa = PLAN.southA, rT = PLAN.arc.r, bT = Math.sqrt(rT * rT - (sa - ca) ** 2);
  const tA = Math.atan2(-bT, sa - ca) + Math.PI * 2, tB = Math.atan2(bT, sa - ca);
  const south = [[sa, -PLAN.sideB], [sa, -bT], ...arcPts(ca, 0, rT, tA, tB, 22).slice(1, -1), [sa, bT], [sa, PLAN.sideB], [PLAN.stairFootA, PLAN.sideB], [PLAN.stairFootA, PLAN.arcadeB], [PLAN.arcadeA, PLAN.arcadeB], [PLAN.arcadeA, -PLAN.arcadeB], [PLAN.stairFootA, -PLAN.arcadeB], [PLAN.stairFootA, -PLAN.sideB]];
  bag.add('paving', flatFace(south, [], ys, puv));
  bag.add('sandD', skirt([[sa, -PLAN.sideB], [sa, -bT]], () => yl - 0.1, () => ys, true));
  bag.add('sandD', skirt([[sa, bT], [sa, PLAN.sideB]], () => yl - 0.1, () => ys, true));
  deck(PLAN.stairFootA, sa, -PLAN.sideB, PLAN.sideB, ys); deck(PLAN.arcadeA, PLAN.stairFootA, -PLAN.arcadeB, PLAN.arcadeB, ys);
  // the two curved steps between the plaza and the south terrace
  for (let k = 0; k < 2; k++) {
    const r0 = stepR + k * PLAN.arc.tread, r1 = r0 + PLAN.arc.tread, y = yl + (k + 1) * (SOUTH_RISE / 2);
    const bo = Math.sqrt(r1 * r1 - (sa - ca) ** 2), bi = Math.sqrt(r0 * r0 - (sa - ca) ** 2);
    const u0 = Math.atan2(-bo, sa - ca) + Math.PI * 2, u1 = Math.atan2(bo, sa - ca), v0 = Math.atan2(-bi, sa - ca) + Math.PI * 2, v1 = Math.atan2(bi, sa - ca);
    const outer = arcPts(ca, 0, r1, u1, u0, 26), inner = arcPts(ca, 0, r0, v0, v1, 26);
    const poly = [...outer, ...inner];
    bag.add('gran', flatFace(poly, [], y));
    bag.add('gran', skirt(inner.slice().reverse(), () => y - SOUTH_RISE / 2 - 0.05, () => y, true));
    if (o.colliders) o.addPrism(poly, y - 0.3, y, true);
  }
  // 3. the seat walls round the plaza and the south terrace: a parapet over the floor or the ground outside, whichever is
  //    higher, with piers at the lake corners, the bays' ends and the south terrace's corners
  const sideRun = (sg) => {
    const pts = [];
    for (const p of outline) if (Math.sign(p[1]) === sg && Math.abs(p[1]) >= PLAN.sideB - 0.01 && p[0] <= PLAN.lakeA && p[0] >= sa) pts.push(p);
    pts.sort((p, q) => q[0] - p[0]);
    pts.push([PLAN.stairFootA, sg * PLAN.sideB]);
    return pts;
  };
  const wallTop = (a, b, sg) => { const fl = a < sa ? ys : yl, og = out(a, b + sg * 1.5); return [fl, og, Math.max(fl + 0.55, og + 0.3)]; };
  for (const sg of [-1, 1]) {
    const run = sideRun(sg);
    for (let i = 0; i + 1 < run.length; i++) {
      const [a0, b0] = run[i], [a1, b1] = run[i + 1], L2 = Math.hypot(a1 - a0, b1 - b0);
      if (L2 < 0.05) continue;
      const n = Math.max(1, Math.ceil(L2 / 1.6));
      for (let k = 0; k < n; k++) {
        const A0 = a0 + ((a1 - a0) * k) / n, B0 = b0 + ((b1 - b0) * k) / n, A1 = a0 + ((a1 - a0) * (k + 1)) / n, B1 = b0 + ((b1 - b0) * (k + 1)) / n;
        const seg = Math.hypot(A1 - A0, B1 - B0), am = (A0 + A1) / 2, bm = (B0 + B1) / 2, [fl, og, top] = wallTop(am, bm, sg), bot = Math.min(fl, og) - 0.6;
        // the wall's centre 0.35 m out from the edge (radially on the bays)
        const onBay = Math.abs(bm) > PLAN.sideB + 0.05, dd = Math.hypot(am, bm - sg * BAYS.c);
        const wa = onBay ? am + (am / dd) * 0.35 : am, wb = onBay ? bm + ((bm - sg * BAYS.c) / dd) * 0.35 : bm + sg * 0.35, yaw = runYaw(A1 - A0, B1 - B0);
        bag.boxM('sand', 0.7, top - bot, seg + 0.03, mAt(wa, wb, (top + bot) / 2, yaw));
        bag.boxM('sandL', 0.86, 0.12, seg + 0.05, mAt(wa, wb, top + 0.06, yaw));
        solid(wa - seg / 2, wa + seg / 2, wb - 0.35, wb + 0.35, fl, top);
      }
    }
    for (const a of [PLAN.lakeA - 0.35, half, -half, sa - 0.35]) {
      const b = sg * (PLAN.sideB + 0.35), [fl, , top] = wallTop(a, sg * PLAN.sideB, sg);
      pier(bag, a, b, fl, top - fl + 0.3, 0.9);
    }
  }
  // the lake front: a parapet 0.45 m over the paving, its face down into the water, round the bay; dies on the wall
  // at 22'6 2/3" (the plan)
  const lakeRun = outline.filter((p) => p[0] >= PLAN.lakeA - 0.01);
  for (let i = 0; i + 1 < lakeRun.length; i++) {
    const [a0, b0] = lakeRun[i], [a1, b1] = lakeRun[i + 1], seg = Math.hypot(a1 - a0, b1 - b0);
    if (seg < 0.05) continue;
    const am0 = (a0 + a1) / 2, bm0 = (b0 + b1) / 2, onBay = am0 > PLAN.lakeA + 0.05;
    const na = onBay ? (am0 - BAYS.c) / Math.hypot(am0 - BAYS.c, bm0) : 1, nb = onBay ? bm0 / Math.hypot(am0 - BAYS.c, bm0) : 0;
    const am = am0 + na * 0.3, bm = bm0 + nb * 0.3, yaw = runYaw(a1 - a0, b1 - b0);
    const top = yl + 0.42, bot = L.lake - 1.5;   // a low wall on the Lake (the photograph from the water: 1.2 m over it in all)
    bag.boxM('sandD', 0.6, top - bot, seg + 0.05, mAt(am, bm, (top + bot) / 2, yaw));
    bag.boxM('sandL', 0.78, 0.12, seg + 0.07, mAt(am, bm, top + 0.06, yaw));
    solid(am - 0.3, am + 0.3, bm - seg / 2, bm + seg / 2, yl, top);
  }
  for (const b of [-PLAN.sideB, -half, half, PLAN.sideB]) { const t = pier(bag, PLAN.lakeA + 0.3, b, yl, 1.05, 0.85, 'sand', Math.abs(b) < PLAN.sideB - 0.1); if (Math.abs(b) > PLAN.sideB - 0.1) lamp(bag, PLAN.lakeA + 0.3, b, t); }   // lanterns on the lake wall's end piers (the drawing's elevation)
  for (const b of [-16.6, 16.6]) pier(bag, PLAN.lakeA + 0.3, b, yl, 0.8, 0.7);
  // the cross balustrades on the south terrace's edge, either side of the curved steps
  for (const sg of [-1, 1]) {
    balustrade(bag, balL, sa + 0.3, sg * (bT + 0.2), sa + 0.3, sg * (PLAN.sideB - 0.1), () => ys, { ends: [true, false], h: 0.95, pierced: true });
    solid(sa, sa + 0.6, Math.min(sg * (bT + 0.2), sg * PLAN.sideB), Math.max(sg * (bT + 0.2), sg * PLAN.sideB), ys, ys + 0.95);
  }
  // 4. the grand staircases: two flights of 19 risers (granite, 1'2" treads) and the landing, carved parapets, piers
  //    with lamps at the foot and the head
  const nR = Math.max(8, Math.round(h1 / 0.1524)), rise = h1 / nR, nT = nR - 1;
  const flights = [[PLAN.stairFootA, PLAN.landA0, ys], [PLAN.landA1, PLAN.stairTopA, ys + h1]];
  const nosing = (a) => {
    if (a >= PLAN.stairFootA) return ys;
    if (a >= PLAN.landA0) return ys + ((PLAN.stairFootA - a) / (PLAN.stairFootA - PLAN.landA0)) * h1;
    if (a >= PLAN.landA1) return ys + h1;
    if (a >= PLAN.stairTopA) return ys + h1 + ((PLAN.landA1 - a) / (PLAN.landA1 - PLAN.stairTopA)) * h1;
    return yu;
  };
  for (const sg of [-1, 1]) {
    const b0 = sg < 0 ? -PLAN.stairB1 : PLAN.stairB0, b1 = sg < 0 ? -PLAN.stairB0 : PLAN.stairB1;
    for (const [fa0, fa1, fy] of flights) {
      const t = (fa0 - fa1) / nT;
      for (let k = 0; k < nT; k++) {
        const A0 = fa0 - k * t, A1 = fa0 - (k + 1) * t, y = fy + (k + 1) * rise;
        bag.box('gran', A1, A0 + 0.03, b0, b1, fy - 0.45 + k * rise * 0.5, y);
        bag.box('granD', A0 - 0.02, A0 + 0.035, b0 + 0.02, b1 - 0.02, y - 0.035, y - 0.012);   // the nosing's shadow line
        deck(A1, A0, b0, b1, y);
      }
    }
    bag.box('gran', PLAN.landA1, PLAN.landA0, b0, b1, ys + h1 - 0.5, ys + h1);
    bag.box('granD', PLAN.landA0 - 0.02, PLAN.landA0 + 0.035, b0 + 0.02, b1 - 0.02, ys + h1 - 0.035, ys + h1 - 0.012);
    deck(PLAN.landA1, PLAN.landA0, b0, b1, ys + h1);
    // the parapets: the outer one a retaining wall to the ground outside, the inner one over the forecourt and, beside the
    // upper flight, the upper terrace's edge over the Arcade
    const bo = sg * (PLAN.wallOut[0] + PLAN.wallOut[1]) / 2, bi = sg * (PLAN.wallIn[0] + PLAN.wallIn[1]) / 2, wo = PLAN.wallOut[1] - PLAN.wallOut[0], wi = PLAN.wallIn[1] - PLAN.wallIn[0];
    const seq = [PLAN.stairFootA, PLAN.landA0, PLAN.landA1, PLAN.stairTopA];
    for (let i = 0; i + 1 < seq.length; i++) {
      const A = seq[i], B = seq[i + 1], og = Math.max(out(A, bo + sg * 1.5), out(B, bo + sg * 1.5));
      parapet(bag, [A, bo, nosing(A)], [B, bo, nosing(B)], wo, 1.0, ys, { topMin: og + 0.9 });
      const inTop = B < PLAN.arcadeA - 0.01 ? yu + 0.95 : -1e9;
      parapet(bag, [A, bi, nosing(A)], [B, bi, nosing(B)], wi, 1.0, ys, { topMin: inTop });
      solid(Math.min(A, B), Math.max(A, B), bo - wo / 2, bo + wo / 2, ys, Math.max(nosing(B) + 1.0, og + 0.9));
      solid(Math.min(A, B), Math.max(A, B), bi - wi / 2, bi + wi / 2, ys, Math.max(nosing(B) + 1.0, inTop));
    }
    for (const a of seq) for (const b of [bo, bi]) {
      const y = nosing(a), og = b === bo ? out(a, bo + sg * 1.5) + 0.9 : a < PLAN.arcadeA - 0.01 ? yu + 0.95 : -1e9, top = Math.max(y + 1.0, og);
      const ends = a === PLAN.stairTopA || a === PLAN.stairFootA;
      const ptop = pier(bag, a, b, y, top - y + 0.35, 1.1, 'sand', !ends);
      if (ends) urn(bag, a, b, ptop);   // planted urns on the stairs' end piers (the photographs)
    }
  }
  // 5. the Arcade: its face on the forecourt with the seven arches, a frieze and cornice, the balustrade over it; the
  //    loggias and the passage under the upper terrace and the drive with the Minton tile ceiling on iron girders
  const aF = PLAN.arcadeA, aB = aF - PLAN.arcadeT, W = PLAN.arcadeB, ceil = yu - 0.9, crown = ys + 4.11;
  const arches = arcadeArches();
  {
    const sh = new THREE.Shape([new THREE.Vector2(-W, ys - 0.3), new THREE.Vector2(W, ys - 0.3), new THREE.Vector2(W, yu), new THREE.Vector2(-W, yu)]);
    for (const [x0, x1] of arches) {
      const cx = (x0 + x1) / 2, r = (x1 - x0) / 2, spring = crown - r;
      const p = new THREE.Path();
      p.moveTo(x0, ys); p.lineTo(x1, ys); p.lineTo(x1, spring);
      p.absarc(cx, spring, r, 0, Math.PI, false);
      p.lineTo(x0, ys);
      sh.holes.push(p);
      const ring = new THREE.Shape();
      ring.moveTo(x1 + 0.26, spring); ring.absarc(cx, spring, r + 0.26, 0, Math.PI, false);
      ring.lineTo(x0, spring); ring.absarc(cx, spring, r, Math.PI, 0, true); ring.lineTo(x1 + 0.26, spring);
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: false, curveSegments: 16 });
      rg.translate(0, 0, -aF - 0.08); bag.add('sandL', rg);
      for (const x of [x0, x1]) bag.box('sandL', aF - 0.02, aF + 0.1, x - 0.16, x + 0.16, spring - 0.2, spring);
    }
    for (let i = 0; i <= arches.length; i++) {
      const b0 = i === 0 ? -W : arches[i - 1][1], b1 = i === arches.length ? W : arches[i][0];
      solid(aB, aF, b0, b1, ys, yu);
    }
    const eg = new THREE.ExtrudeGeometry(sh, { depth: PLAN.arcadeT, bevelEnabled: false, curveSegments: 18 });
    eg.translate(0, 0, -aF);
    bag.add('sand', eg);
    // the frieze and cornice (3'9") a foot over the crowns, the balustrade (2'6") on the upper terrace's edge over it
    bag.box('sandD', aF - 0.02, aF + 0.12, -W, W, crown + 0.3, crown + 0.42);
    { const n = Math.round((2 * W) / 1.3); for (let i = 0; i < n; i++) bag.box('carved', aF - 0.02, aF + 0.06, -W + (2 * W * i) / n, -W + (2 * W * (i + 1)) / n, crown + 0.42, yu - 0.32); }
    bag.box('sandL', aF - 0.05, aF + 0.34, -W - 0.1, W + 0.1, yu - 0.32, yu - 0.12);
    bag.box('sandL', aF - 0.05, aF + 0.5, -W - 0.15, W + 0.15, yu - 0.12, yu);
    balustrade(bag, balL, aF - 0.3, -W + 0.4, aF - 0.3, W - 0.4, () => yu, { ends: [true, true], bay: 3.1, h: 0.76, pierced: true });
    solid(aF - 0.6, aF, -W, W, yu, yu + 0.76);
    // the floors: the loggias and the passage
    const PB2 = PLAN.tunnelB, hA1 = PLAN.hallA1, tA1 = PLAN.tunnelA1;
    bag.box('gran', hA1, aB, -W, W, ys - 0.3, ys);
    bag.box('gran', tA1, hA1, -PB2, PB2, ys - 0.3, ys);
    deck(tA1, hA1, -PB2, PB2, ys); deck(hA1, aB, -W, W, ys);
    // the walls: the loggias' back and outer walls, the passage's walls under the drive
    for (const sg of [-1, 1]) {
      bag.box('sand', hA1 - 0.8, hA1, sg > 0 ? PB2 : -W - 0.4, sg > 0 ? W + 0.4 : -PB2, ys, yu - 0.05);
      solid(hA1 - 0.8, hA1, sg > 0 ? PB2 : -W, sg > 0 ? W : -PB2, ys, ceil);
      bag.box('sand', hA1, aB, sg * W - 0.4, sg * W + 0.4, ys, ceil);
      solid(hA1, aB, sg * W - 0.4, sg * W + 0.4, ys, ceil);
      bag.box('sand', tA1, hA1 - 0.8, sg > 0 ? PB2 : -PB2 - 0.8, sg > 0 ? PB2 + 0.8 : -PB2, ys, ceil);
      solid(tA1, hA1 - 0.8, sg * PB2 - 0.4, sg * PB2 + 0.4, ys, ceil);
      // niches in the passage's walls (granite-lined in the drawings): a darker panel every other bay
      for (let a = hA1 - 0.8 - PLAN.bay9 * 0.5; a > tA1 + 1; a -= PLAN.bay9 * 2) bag.box('granD', a - 0.7, a + 0.7, sg > 0 ? PB2 - 0.02 : -PB2 - 0.04, sg > 0 ? PB2 + 0.04 : -PB2 + 0.02, ys + 0.6, ys + 3.2);
    }
    // the ceiling: a tile panel in every 9'6 2/3" bay (the texture repeats every two bays: rosette and pinwheel panels by
    // turns), the girders between
    const B9 = PLAN.bay9, tile = (a0, a1, b0, b1) => {
      const g = new THREE.PlaneGeometry(b1 - b0, a1 - a0, 1, 1);
      g.rotateX(Math.PI / 2); g.translate((b0 + b1) / 2, ceil, -(a0 + a1) / 2);
      const uv = g.attributes.uv, P = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + W) / (2 * B9), (-P.getZ(i) - aF) / (2 * B9));
      bag.add('tile', g);
    };
    tile(hA1, aB, -W, W); tile(tA1, hA1 - 0.8, -PB2, PB2);
    for (let b = -W + 0.43; b <= W; b += B9) bag.box('iron', hA1, aB, b - 0.08, b + 0.08, ceil - 0.24, ceil + 0.01);
    for (let a = aF - B9 - 0.45; a > hA1 + 0.2; a -= B9) bag.box('iron', a - 0.08, a + 0.08, -W, W, ceil - 0.18, ceil + 0.005);
    for (let a = hA1 - 0.8 - B9; a > tA1 + 0.2; a -= B9) bag.box('iron', a - 0.08, a + 0.08, -PB2, PB2, ceil - 0.18, ceil + 0.005);
    bag.box('dark', hA1, aB, -W, W, ceil + 0.005, yu - 0.05);
    bag.box('dark', tA1, hA1 - 0.8, -PB2 - 0.8, PB2 + 0.8, ceil + 0.005, yu - 0.3);
    // the columns between the passage and the loggias, at the bays' corners
    const CH = ceil - ys;
    for (const sg of [-1, 1]) for (let k = 1; k <= 4; k++) {
      const a = aF - 0.45 - k * B9, b = sg * PB2;
      const col = lathe([[0.001, 0], [0.38, 0], [0.38, 0.28], [0.27, 0.4], [0.23, 0.58], [0.21, CH - 0.7], [0.3, CH - 0.45], [0.4, CH - 0.24], [0.4, CH], [0.001, CH]], 16);
      col.translate(b, ys, -a); bag.add('sandL', col);
      solid(a - 0.38, a + 0.38, b - 0.38, b + 0.38, ys, ceil);
    }
    // the passage's south end onto the Mall stair's forecourt: three arches (a wide one between two narrow, the
    // photographs), the drive's south parapet over them
    {
      const PW = PB2 + 1.4, sh2 = new THREE.Shape([new THREE.Vector2(-PW, ys - 0.3), new THREE.Vector2(PW, ys - 0.3), new THREE.Vector2(PW, yu + 1.0), new THREE.Vector2(-PW, yu + 1.0)]);
      for (const [x0, x1] of [[-PB2 + 0.35, -1.95], [-1.55, 1.55], [1.95, PB2 - 0.35]]) {
        const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, sp = Math.min(crown, ceil - 0.2) - r, p = new THREE.Path();
        p.moveTo(x0, ys); p.lineTo(x1, ys); p.lineTo(x1, sp); p.absarc(cx, sp, r, 0, Math.PI, false); p.lineTo(x0, ys); sh2.holes.push(p);
        const ring = new THREE.Shape(); ring.moveTo(x1 + 0.22, sp); ring.absarc(cx, sp, r + 0.22, 0, Math.PI, false); ring.lineTo(x0, sp); ring.absarc(cx, sp, r, Math.PI, 0, true); ring.lineTo(x1 + 0.22, sp);
        const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: false, curveSegments: 14 }); rg.translate(0, 0, -(tA1 - 0.9) - 0.0); bag.add('sandL', rg);
        solid(tA1 - 0.9, tA1, x0 - 0.4, x0, ys, yu);
      }
      const eg2 = new THREE.ExtrudeGeometry(sh2, { depth: 0.9, bevelEnabled: false, curveSegments: 16 });
      eg2.translate(0, 0, -tA1);
      bag.add('sand', eg2);
      bag.box('sandL', tA1 - 1.0, tA1 + 0.02, -PW - 0.1, PW + 0.1, yu + 1.0, yu + 1.16);
    }
  }
  // 6. the upper terrace: its paved slab over the Arcade and along the drive, its edges closed down to the ground, the
  //    balustrades along its outer ends
  {
    const UB = 25, uuv = (a, b) => [(b + UB) / (2 * UB), 1 + (a + 51) / 16.5];
    const up = [[PLAN.upperA1, -PLAN.wallOut[1]], [PLAN.upperA1, PLAN.wallOut[1]], [PLAN.stairTopA, PLAN.wallOut[1]], [PLAN.stairTopA, PLAN.wallIn[0]], [aB + 0.02, PLAN.wallIn[0]], [aB + 0.02, -PLAN.wallIn[0]], [PLAN.stairTopA, -PLAN.wallIn[0]], [PLAN.stairTopA, -PLAN.wallOut[1]]];
    bag.add('upper', flatFace(up, [], yu, uuv));
    bag.add('sandD', skirt([up[0], up[1], up[2]], () => yl - 0.5, () => yu, true));
    bag.add('sandD', skirt([up[7], up[0]], () => yl - 0.5, () => yu, true));
    deck(PLAN.upperA1, PLAN.stairTopA, -PLAN.wallOut[1], PLAN.wallOut[1], yu);
    deck(PLAN.stairTopA, aB, -PLAN.wallIn[0], PLAN.wallIn[0], yu);
    for (const sg of [-1, 1]) balustrade(bag, balL, PLAN.stairTopA - 0.3, sg * (PLAN.wallOut[1] - 0.35), PLAN.upperA1 + 0.4, sg * (PLAN.wallOut[1] - 0.35), () => yu, { ends: [false, true], h: 0.95 });
    for (const sg of [-1, 1]) { lampPost(bag, PLAN.upperA1 + 1.6, sg * (PLAN.wallOut[1] - 1.4), yu); solid(PLAN.upperA1 + 1.35, PLAN.upperA1 + 1.85, sg * (PLAN.wallOut[1] - 1.4) - 0.25, sg * (PLAN.wallOut[1] - 1.4) + 0.25, yu, yu + 3.4); }   // tall lamps at the upper terrace's ends (the photograph from the Lake)
  }
  // 7. the Mall stair: a forecourt past the passage, two flights of 18 risers and the landing up to the Mall between
  //    walls; piers and lamps at its head
  {
    const B2 = PLAN.mallB, a0 = PLAN.mallLandA, fl = PLAN.mallFl, top = L.mall ?? yu, h2 = (top - ys) / 2, n2 = Math.max(8, Math.round(h2 / 0.1524)), r2 = h2 / n2, t2 = fl / (n2 - 1);
    bag.box('gran', a0, PLAN.tunnelA1, -B2, B2, ys - 0.3, ys);
    deck(a0, PLAN.tunnelA1, -B2, B2, ys);
    const fls = [[a0, ys], [PLAN.mallTopA + fl, ys + h2]];
    for (const [fa0, fy] of fls) for (let k = 0; k < n2 - 1; k++) {
      const A0 = fa0 - k * t2, A1 = fa0 - (k + 1) * t2, y = fy + (k + 1) * r2;
      bag.box('gran', A1, A0 + 0.03, -B2, B2, fy - 0.45 + k * r2 * 0.5, y);
      bag.box('granD', A0 - 0.02, A0 + 0.035, -B2 + 0.02, B2 - 0.02, y - 0.035, y - 0.012);
      deck(A1, A0, -B2, B2, y);
    }
    bag.box('gran', PLAN.mallTopA + fl, a0 - fl, -B2, B2, ys + h2 - 0.5, ys + h2);
    deck(PLAN.mallTopA + fl, a0 - fl, -B2, B2, ys + h2);
    const nose = (a) => (a >= a0 ? ys : a >= a0 - fl ? ys + ((a0 - a) / fl) * h2 : a >= PLAN.mallTopA + fl ? ys + h2 : a >= PLAN.mallTopA ? ys + h2 + ((PLAN.mallTopA + fl - a) / fl) * h2 : top);
    for (const sg of [-1, 1]) {
      const bw = sg * (B2 + PLAN.mallWall / 2);
      for (const [A, B] of [[PLAN.tunnelA1 - 0.9, a0], [a0, a0 - fl], [a0 - fl, PLAN.mallTopA + fl], [PLAN.mallTopA + fl, PLAN.mallTopA]]) {
        const og = Math.max(out(A, bw + sg * 1.5), out(B, bw + sg * 1.5));
        parapet(bag, [A, bw, nose(A)], [B, bw, nose(B)], PLAN.mallWall, 1.0, ys, { topMin: og + 0.9, lowKey: 'diaper' });
        solid(Math.min(A, B), Math.max(A, B), bw - 0.5, bw + 0.5, ys, og + 1.0);
      }
      const pt = pier(bag, PLAN.mallTopA - 0.2, bw, top, 1.25, 1.1, 'sand', false); lamp(bag, PLAN.mallTopA - 0.2, bw, pt);
    }
    bag.box('gran', PLAN.mallTopA - 0.5, PLAN.mallTopA + 0.02, -B2 - PLAN.mallWall, B2 + PLAN.mallWall, top - 0.4, top);
    deck(PLAN.mallTopA - 0.5, PLAN.mallTopA, -B2, B2, top);
    {
    }
  }
  const meshes = bag.mesh(G, M);
  if (balL.length) {
    const im = new THREE.InstancedMesh(balusterGeo(), M.sandL, balL.length), m4 = new THREE.Matrix4();
    balL.forEach(([a, b, y, h], i) => { m4.makeScale(1, h, 1); m4.setPosition(b, y, -a); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'cp32b:balusters';
    G.add(im);
  }
  return { meshes: meshes.length, balusters: balL.length, risers: nR, rise: +rise.toFixed(4), h1: +h1.toFixed(2), arches: arches.length };
}

// ---- the fountain ---------------------------------------------------------------------------------------------------
// ripple normals for the pools (the campus fountains' map: 32 sine trains)
let _rip = null;
function rippleTex() {
  if (_rip) return _rip;
  const N = 128, d = new Uint8Array(N * N * 4), WV = [];
  _seed = 555;
  [3, 4, 5, 6, 8, 10, 13, 16].forEach((k) => { for (let q = 0; q < 4; q++) { const th = rnd() * Math.PI * 2, kx = Math.round(k * Math.cos(th)), ky = Math.round(k * Math.sin(th)); if (kx || ky) WV.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 2.2), rnd() * 6.283]); } });
  const H = (x, y) => WV.reduce((h, [kx, ky, a, ph]) => h + a * Math.sin((2 * Math.PI * (kx * x + ky * y)) / N + ph), 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = -(H(x + 1, y) - H(x - 1, y)) * 12, ny = -(H(x, y + 1) - H(x, y - 1)) * 12, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return (_rip = t);
}
const waterMat = (rep) => {
  const t = rippleTex().clone(); t.repeat.set(rep, rep); t.needsUpdate = true;
  return LT(new THREE.MeshPhysicalMaterial({ color: 0x14201c, roughness: 0.08, metalness: 0, specularIntensity: 0.8, normalMap: t, normalScale: new THREE.Vector2(0.4, 0.4) }));
};
const cleanMerge = (parts) => {
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal'].includes(k)) q.deleteAttribute(k); return q; }), false);
  g.computeVertexNormals();
  return g;
};
const MX = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function limbTo(parts, p0, p1, r0, r1) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); parts.push(g);
  const s = new THREE.SphereGeometry(r1 * 1.05, 8, 6); s.translate(p1.x, p1.y, p1.z); parts.push(s);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// The Angel of the Waters (Emma Stebbins, 1873, bronze, 8 ft): a winged woman alighting on the fountain, the right arm
// held out over the water in blessing, a sheaf of lilies in the left hand against her side, the wings raised behind
// her, the robe falling in folds to the feet. Built here from its masses (no open-licence scan exists): 2.15 m from the
// feet to the crown in this frame (scaled to 8 ft by the caller), the wings' tips 0.75 m over the head; local +z her front.
export function angelGeo() {
  const parts = [], add = (g, m) => { if (m) g.applyMatrix4(m); parts.push(g); };
  // the robe: a lathe with deep irregular folds, swept back at the hem and out behind the stepping leg; an overgarment
  // falling from the waist to the knee over it, its own folds; a sash at the waist
  const fold = (g, y0, y1, amp, sweep) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), an = Math.atan2(x, z), t = 1 - Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      const f = 1 + amp * t * (0.6 * Math.cos(an * 7 + 0.4) + 0.3 * Math.cos(an * 13 + 1.7) + 0.2 * Math.cos(an * 23 + 0.9));
      p.setXYZ(i, x * f + sweep * t * t * 0.4, y, z * f - sweep * t * t);
    }
    g.computeVertexNormals();
    return g;
  };
  add(fold(lathe([[0.001, 0], [0.34, 0.02], [0.37, 0.1], [0.32, 0.4], [0.27, 0.75], [0.22, 1.02], [0.2, 1.16], [0.001, 1.18]], 44), 0, 1.1, 0.11, 0.2));
  add(fold(lathe([[0.001, 0.62], [0.33, 0.6], [0.34, 0.66], [0.29, 0.85], [0.235, 1.05], [0.21, 1.16], [0.001, 1.17]], 36), 0.6, 1.1, 0.14, 0.12));
  { const s = new THREE.TorusGeometry(0.2, 0.025, 6, 24); s.rotateX(Math.PI / 2); add(s, MX(0, 1.13, 0.0, 0.1, 0, 0, 1.12, 1, 0.82)); }
  add(new THREE.SphereGeometry(0.12, 10, 8), MX(0.1, 0.07, 0.32, 0, 0, 0, 0.8, 0.5, 1.4));   // the forward (left) foot
  // torso and bust, the shoulders, neck, the head (a nose, the hair drawn back into a knot)
  add(lathe([[0.001, 1.12], [0.21, 1.14], [0.2, 1.3], [0.22, 1.48], [0.23, 1.6], [0.17, 1.72], [0.07, 1.8], [0.001, 1.8]], 24), MX(0, 0, 0, 0, 0, 0, 1.15, 1, 0.8));
  for (const sg of [-1, 1]) add(new THREE.SphereGeometry(0.09, 12, 8), MX(sg * 0.22, 1.66, 0.0, 0, 0, 0, 1, 0.8, 1));
  add(new THREE.CylinderGeometry(0.055, 0.065, 0.16, 12), MX(0, 1.86, 0.02));
  add(new THREE.SphereGeometry(0.105, 18, 14), MX(0, 2.01, 0.03, -0.12, 0, 0, 0.95, 1.18, 1.05));
  add(new THREE.ConeGeometry(0.018, 0.05, 6), MX(0, 2.0, 0.145, Math.PI / 2, 0, 0));
  add(new THREE.SphereGeometry(0.108, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), MX(0, 2.03, 0.0, -0.5, 0, 0, 1.02, 1.1, 1.08));
  add(new THREE.SphereGeometry(0.065, 10, 8), MX(0, 2.04, -0.11, 0, 0, 0, 1.2, 0.9, 1));
  // the right arm held out forward and down in blessing, the palm down, the sleeve hanging from it (her right is -x:
  // she faces +z)
  limbTo(parts, V3(-0.25, 1.64, 0.0), V3(-0.36, 1.55, 0.32), 0.065, 0.052);
  limbTo(parts, V3(-0.36, 1.55, 0.32), V3(-0.46, 1.47, 0.64), 0.05, 0.04);
  add(new THREE.BoxGeometry(0.1, 0.03, 0.17), MX(-0.48, 1.45, 0.74, -0.25, 0, 0));
  add(new THREE.ConeGeometry(0.12, 0.42, 10, 1, true), MX(-0.34, 1.4, 0.34, 0.4, 0, 0));
  // the left arm bent, the hand at the hip holding the lilies
  limbTo(parts, V3(0.25, 1.64, 0.0), V3(0.3, 1.36, 0.06), 0.065, 0.055);
  limbTo(parts, V3(0.3, 1.36, 0.06), V3(0.14, 1.3, 0.2), 0.05, 0.045);
  for (const [dx, dz, h] of [[0, 0, 0.62], [-0.05, 0.03, 0.55], [0.04, 0.05, 0.5]]) {
    limbTo(parts, V3(0.14, 1.28, 0.21), V3(0.22 + dx, 1.28 + h, 0.3 + dz), 0.012, 0.01);
    add(new THREE.ConeGeometry(0.035, 0.09, 8, 1, true), MX(0.22 + dx, 1.28 + h + 0.03, 0.3 + dz, Math.PI, 0, 0));
  }
  // the drapery swept back from her left side and the hem (the photographs: the robe flies out behind the stepping leg)
  {
    const fl = lathe([[0.001, 0.05], [0.46, 0.08], [0.5, 0.3], [0.4, 0.6], [0.3, 0.9], [0.22, 1.1], [0.001, 1.12]], 16, 0, Math.PI * 0.9);
    const fp = fl.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i), t = 1 - y / 1.12; fp.setXYZ(i, x * (1 + 0.3 * t), y, z - 0.25 * t * t - 0.05); }
    add(fl, MX(-0.06, 0, -0.04, 0, Math.PI * 0.55, 0));
  }
  // the wings: raised in a V and spread, each a covert mass with primaries fanned over the head and secondaries along
  // the trailing edge (feather blades, so the silhouette is notched as the bronze is)
  const feather = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(w, len * 0.35, w * 0.5, len * 0.88); s.lineTo(0, len); s.lineTo(-w * 0.4, len * 0.86); s.quadraticCurveTo(-w * 0.75, len * 0.3, 0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: false, curveSegments: 4 });
  };
  const wing = () => {
    const W = [];
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.1, 0.3, 0.26, 0.62, 0.4, 0.98); s.lineTo(0.56, 0.86); s.quadraticCurveTo(0.58, 0.5, 0.36, 0.18); s.lineTo(0.12, -0.04); s.lineTo(0, 0);
    W.push(new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 8 }));
    for (let i = 0; i < 8; i++) {   // primaries from the hand, fanned from the vertical outward
      const t = i / 7, g = feather(0.95 - t * 0.35, 0.13), th = 0.12 + t * 1.05;
      g.rotateZ(-th); g.translate(0.3 + 0.14 * (1 - t), 0.62 + 0.36 * (1 - t), 0.035 + 0.006 * i); W.push(g);
    }
    for (let i = 0; i < 6; i++) {   // secondaries along the trailing edge, pointing out and down
      const t = i / 5, g = feather(0.52 - t * 0.12, 0.12), th = 1.5 + t * 0.75;
      g.rotateZ(-th); g.translate(0.36 - 0.26 * t, 0.46 - 0.44 * t, 0.03 + 0.005 * i); W.push(g);
    }
    const g = cleanMerge(W);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) - 0.16 * Math.sin(Math.min(1, Math.max(0, y) / 1.4) * Math.PI * 0.9) - 0.1 * x); }
    g.computeVertexNormals();
    return g;
  };
  for (const sg of [-1, 1]) {
    const g = wing();
    g.scale(sg * 1.15, 0.82, 1);
    if (sg < 0) flipWinding(g);
    g.applyMatrix4(MX(sg * 0.1, 1.55, -0.14, -0.22, sg * -0.35, sg * -0.58));
    add(g);
  }
  return cleanMerge(parts);
}
// one of the four cherubs (Temperance, Purity, Health and Peace) round the drum under the upper basin: a child figure,
// about 1.1 m, one arm raised with its attribute (local +z its front)
function cherubGeo(v) {
  const parts = [], add = (g, m) => { if (m) g.applyMatrix4(m); parts.push(g); };
  add(new THREE.CapsuleGeometry(0.075, 0.34, 3, 8), MX(-0.08, 0.24, 0, 0, 0, 0.06));
  add(new THREE.CapsuleGeometry(0.075, 0.34, 3, 8), MX(0.08, 0.24, 0.04, -0.15, 0, -0.06));
  add(lathe([[0.001, 0.42], [0.17, 0.46], [0.19, 0.62], [0.17, 0.78], [0.12, 0.86], [0.001, 0.88]], 14));
  add(new THREE.SphereGeometry(0.13, 12, 10), MX(0, 1.0, 0.02));
  add(new THREE.CapsuleGeometry(0.045, 0.3, 3, 8), MX(0.2, 0.9 + v * 0.03, 0.05, 0, 0, -0.9 - v * 0.2));
  add(new THREE.CapsuleGeometry(0.045, 0.28, 3, 8), MX(-0.19, 0.66, 0.08, 0.5, 0, 0.3));
  add(v === 0 ? new THREE.CylinderGeometry(0.06, 0.05, 0.18, 10) : v === 1 ? new THREE.SphereGeometry(0.07, 8, 6) : v === 2 ? new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6) : new THREE.TorusGeometry(0.1, 0.025, 6, 12), MX(0.36, 1.12, 0.08));
  for (const sg of [-1, 1]) add(new THREE.SphereGeometry(0.16, 8, 6), MX(sg * 0.12, 0.8, -0.14, 0.3, sg * 0.5, 0, 0.35, 0.8, 0.15));
  return cleanMerge(parts);
}


// The fountain, bottom to top (the pool 96 ft across, NYC Parks; the rest from the design elevation IO_ff402309 and the
// photograph of the drained fountain, 2025, scaled on its base, 16'6" on the drawing; heights over the pool's water, wl;
// the photograph from across the Lake, 2026, puts the upper tiers a little lower, and they are drawn between the two):
// the pool's granite rim; an octagonal bluestone base 5.03 m across with a carved frieze, its top at wl + 0.85; sixteen
// short columns in pairs on its eight corners; the lobed stone lower basin 5.5 m across the lobes, its rim at wl + 2.55;
// the octagonal plinth with the rock and the four bronze cherubs (4 ft) round the bronze stem; the bronze upper basin
// 2.9 m across, its rim at wl + 5.35; the rock; the angel, 8 ft, her feet at wl + 5.75 (her crown 8.7 m over the
// pool's floor: 26 ft published, 32 ft to the wing's tip on the design). The
// water falls in a sheet off the upper basin's rim into the lower basin and off the lower basin's lobes into the pool.
export const FOUNT = { wl: 0.30, floor: -0.25, rim: 0.45, base: { R: 2.515, top: 0.85 }, cols: { r: 2.02, top: 1.95 }, lower: { R: 2.75, rim: 2.55 },
  plinth: { R: 1.0, top: 3.1 }, rock: 3.35, upper: { R: 1.45, bot: 4.9, rim: 5.35 }, feet: 5.75, angel: 2.44 };
export function buildFountain(G, L, o) {
  const M = mats(), FG = new THREE.Group(), yl = L.low, F = FOUNT;
  FG.name = 'cp32b:fountain';
  G.add(FG);
  const R = PLAN.basinR, Ri = R - 0.62, rimTop = yl + F.rim, wl = yl + F.wl, floor = yl + F.floor, seg = 128;
  const part = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; FG.add(m); return m; };
  const Y = (h) => wl + h;
  // the pool's rim: the outer face, the rounded coping people sit on, the inner face down to the floor
  part(lathe([[R + 0.02, yl - 0.2], [R + 0.02, yl + 0.05], [R + 0.08, yl + 0.09], [R + 0.08, yl + 0.14], [R, yl + 0.17], [R, rimTop - 0.08], [R + 0.03, rimTop - 0.03], [R, rimTop], [Ri + 0.04, rimTop], [Ri, rimTop - 0.04], [Ri, wl - 0.05], [Ri - 0.02, floor]], seg), M.gran);
  const floorG = new THREE.CircleGeometry(Ri, 64); floorG.rotateX(-Math.PI / 2); floorG.translate(0, floor, 0); part(floorG, M.granD, false);
  const poolMat = waterMat(9);
  const setPool = FW25 ? poolRings(poolMat, { impR: F.lower.R + 0.35, amp: FW26 ? 0.06 : 0.12, k: 14, foam: 1, foamIn: 0.6, foamOut: 1.1,
    basin: { R: Ri, depth: 2.4, ped: F.base.R, veilR: F.lower.R + 0.2, veilH: F.lower.rim, copeH: rimTop - wl, floor: 0.05, chop: 0.8 } }) : null;   // the floor's albedo low: the pool reads dark green-grey from the terrace, as it does
  if (setPool) setPool(C0[0], C0[1]);
  const poolG = new THREE.RingGeometry(F.base.R - 0.05, Ri + 0.01, seg, 1); poolG.rotateX(-Math.PI / 2); poolG.translate(0, wl, 0);
  const pool = part(poolG, poolMat, false);
  // the octagonal base: a plain block in the water, a carved frieze band, a moulded top
  const oct = (r, y0, y1, mat, cast = true) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1); g.rotateY(Math.PI / 8); g.translate(0, (y0 + y1) / 2, 0); return part(g, mat, cast); };
  oct(F.base.R / Math.cos(Math.PI / 8), floor, Y(F.base.top - 0.45), M.sandD);
  { const m = oct(F.base.R / Math.cos(Math.PI / 8) - 0.05, Y(F.base.top - 0.45), Y(F.base.top - 0.12), M.carved), uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 8); }
  oct(F.base.R / Math.cos(Math.PI / 8) + 0.06, Y(F.base.top - 0.12), Y(F.base.top), M.sandL);
  oct(F.cols.r + 0.32, Y(F.base.top), Y(F.base.top + 0.1), M.sandD);
  // sixteen short columns in pairs at the octagon's corners, bronze bases and capitals
  const colH = F.cols.top - F.base.top - 0.1;
  for (let k = 0; k < 8; k++) for (const d of [-0.2, 0.2]) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8, cx = Math.sin(t) * F.cols.r + Math.cos(t) * d, cz = -Math.cos(t) * F.cols.r + Math.sin(t) * d;
    const sh = lathe([[0.001, 0], [0.16, 0], [0.16, 0.08], [0.12, 0.14], [0.105, 0.2], [0.095, colH - 0.24], [0.13, colH - 0.16], [0.17, colH - 0.06], [0.17, colH], [0.001, colH]], 12);
    sh.translate(cx, Y(F.base.top + 0.1), cz);
    part(sh, M.sandL);
  }
  // the lower basin: a lobed stone bowl on the columns (eight lobes), a moulded rim, water in it
  const LB = F.lower, lobe = (x, z) => { const an = Math.atan2(z, x); return 1 + 0.06 * Math.cos(an * 8); };
  const lbG = lathe([[0.9, Y(F.cols.top)], [1.9, Y(F.cols.top + 0.05)], [2.45, Y(F.cols.top + 0.25)], [LB.R - 0.06, Y(LB.rim - 0.3)], [LB.R + 0.04, Y(LB.rim - 0.18)], [LB.R + 0.02, Y(LB.rim - 0.05)], [LB.R - 0.04, Y(LB.rim)], [LB.R - 0.2, Y(LB.rim)], [LB.R - 0.22, Y(LB.rim - 0.14)], [1.6, Y(LB.rim - 0.3)], [0.001, Y(LB.rim - 0.32)]], 96);
  const lp = lbG.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); if (r > 1.8) { const k = lobe(x, z); lp.setX(i, x * k); lp.setZ(i, z * k); } }
  lbG.computeVertexNormals(); part(lbG, M.sandL);
  const lbw = waterMat(3);
  const setLB = FW25 ? poolRings(lbw, { impR: F.upper.R + 0.3, amp: 0.05, k: 18, foam: 0.8, foamIn: 0.5, foamOut: 1.6, basin: { R: LB.R - 0.25, depth: 0.28, ped: F.plinth.R, veilR: F.upper.R + 0.12, veilH: F.upper.rim - LB.rim + 0.1, copeH: 0.1, floor: 0.2, chop: 0.8 } }) : null;
  if (setLB) setLB(C0[0], C0[1]);
  const lwG = new THREE.RingGeometry(F.plinth.R - 0.02, LB.R - 0.2, 96, 1); lwG.rotateX(-Math.PI / 2); lwG.translate(0, Y(LB.rim - 0.1), 0);
  const lwp = lwG.attributes.position; for (let i = 0; i < lwp.count; i++) { const x = lwp.getX(i), z = lwp.getZ(i); if (Math.hypot(x, z) > 1.8) { const k = lobe(x, z); lwp.setX(i, x * k); lwp.setZ(i, z * k); } }
  const lowerPool = part(lwG, lbw, false);
  // the plinth (dark stone, a pale cap), the rock mound, the bronze stem
  oct(F.plinth.R / Math.cos(Math.PI / 8), Y(LB.rim - 0.3), Y(F.plinth.top - 0.1), M.sandD);
  oct(F.plinth.R / Math.cos(Math.PI / 8) + 0.06, Y(F.plinth.top - 0.1), Y(F.plinth.top), M.sandL);
  const rock = new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); rock.scale(1, (F.rock - F.plinth.top) / 0.95, 1); rock.translate(0, Y(F.plinth.top), 0);
  const rp = rock.attributes.position; for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), n = 1 + 0.08 * Math.sin(x * 7.1 + z * 3.3) + 0.05 * Math.sin(z * 11 - x * 4); rp.setX(i, x * n); rp.setZ(i, z * n); }
  rock.computeVertexNormals(); part(rock, M.bronzeD);
  part(lathe([[0.001, Y(F.rock - 0.1)], [0.34, Y(F.rock - 0.1)], [0.3, Y(F.rock + 0.4)], [0.24, Y(F.upper.bot - 0.5)], [0.3, Y(F.upper.bot - 0.25)], [0.45, Y(F.upper.bot)], [0.001, Y(F.upper.bot)]], 20), M.bronzeD);
  // the four cherubs on the rock at the diagonals, facing out
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2, r = 0.62;
    const c = part(cherubGeo(k), M.bronze);
    c.scale.setScalar(1.1);
    c.position.set(Math.sin(t) * r, Y(F.rock - 0.06), -Math.cos(t) * r);
    c.rotation.y = Math.PI - t;
  }
  // the upper basin: a broad bronze saucer with a gadrooned rim
  const UBs = F.upper, ubG = lathe([[0.4, Y(UBs.bot)], [0.9, Y(UBs.bot + 0.12)], [1.25, Y(UBs.rim - 0.22)], [UBs.R, Y(UBs.rim - 0.12)], [UBs.R + 0.05, Y(UBs.rim - 0.04)], [UBs.R, Y(UBs.rim)], [UBs.R - 0.12, Y(UBs.rim - 0.01)], [UBs.R - 0.14, Y(UBs.rim - 0.1)], [0.8, Y(UBs.rim - 0.2)], [0.001, Y(UBs.rim - 0.2)]], 96);
  const up2 = ubG.attributes.position; for (let i = 0; i < up2.count; i++) { const x = up2.getX(i), z = up2.getZ(i), r = Math.hypot(x, z); if (r > UBs.R - 0.2) { const k = 1 + 0.018 * Math.cos(Math.atan2(z, x) * 40); up2.setX(i, x * k); up2.setZ(i, z * k); } }
  ubG.computeVertexNormals(); part(ubG, M.bronze);
  const ubw = waterMat(1.6);
  const setUB = FW25 ? poolRings(ubw, { impR: 0.45, amp: 0.04, k: 22, foam: 0.5, foamIn: 0.4, foamOut: 2.4, basin: { R: UBs.R - 0.14, depth: 0.15, ped: 0.45, copeH: 0.03, floor: 0.2, chop: 0.5 } }) : null;
  if (setUB) setUB(C0[0], C0[1]);
  const uwG = new THREE.RingGeometry(0.42, UBs.R - 0.13, 72, 1); uwG.rotateX(-Math.PI / 2); uwG.translate(0, Y(UBs.rim - 0.035), 0); part(uwG, ubw, false);
  // the rock the angel alights on
  const rk = new THREE.DodecahedronGeometry(0.55, 1); rk.scale(1, (F.feet - UBs.rim + 0.25) / 1.1, 1); rk.translate(0, Y(UBs.rim + (F.feet - UBs.rim) / 2 - 0.1), 0);
  const rkp = rk.attributes.position; for (let i = 0; i < rkp.count; i++) { const x = rkp.getX(i), z = rkp.getZ(i), n = 1 + 0.1 * Math.sin(x * 9 + z * 5); rkp.setX(i, x * n); rkp.setZ(i, z * n); }
  rk.computeVertexNormals(); part(rk, M.bronzeD);
  // the angel, 8'7": her front to the south, toward the Arcade and the Mall (the photographs from the terrace)
  const ang = part(angelGeo(), M.bronze);
  ang.position.set(0, Y(F.feet - 0.05), 0);
  ang.scale.setScalar(F.angel / 2.15);
  ang.rotation.y = 0;
  // the water: a sheet off the upper basin's rim into the lower basin, another off the lower basin's lobes into the pool
  const fallT = (h, v0) => (-v0 + Math.sqrt(v0 * v0 + 19.62 * h)) / 9.81;
  const veil = (r0, y0, y1, spread, lob, key) => {
    const H = y0 - y1, pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([r0 + spread * Math.sqrt(t), y0 - H * t]); }
    const g = lathe(pts, 128);
    if (lob) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = lobe(x, z); p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); }
    const vm = veilMat(FW27 ? { y0, dir: 1, v0: 0.35, tMax: fallT(H, 0.35), aer: [0.3, 0.95], holes: 0.45, body: 0.2, freq: 7 } : { y0, dir: 1, v0: 0.35, tMax: fallT(H, 0.35), aer: [0.4, 1.0], holes: 0.5, body: 0.26, freq: 5 }, LT);
    const m = part(g, vm, false); m.renderOrder = 2; m.name = key;
  };
  if (FW26) {
    veil(UBs.R + 0.05, Y(UBs.rim + 0.02), Y(LB.rim - 0.1), 0.32, false, 'cp32b:veilUpper');
    veil(LB.R + 0.04, Y(LB.rim + 0.01), wl, 0.42, true, 'cp32b:veilLower');
  }
  if (FW25) {
    FG.add(fountainSpray({ lipR: UBs.R + 0.05, lipY: Y(UBs.rim + 0.02), wl: Y(LB.rim - 0.1), impR: UBs.R + 0.33, jetY: Y(UBs.rim - 0.03), jetH: 0.25, bowlY: Y(UBs.rim - 0.03), bowlR: UBs.R - 0.3, seed: 1873, sheet: 1400, splash: 1200, jet: 200, bowl: 300, mist: 200 }));
    FG.add(fountainSpray({ lipR: LB.R + 0.06, lipY: Y(LB.rim + 0.01), wl, impR: LB.R + 0.45, jetY: Y(LB.rim - 0.1), jetH: 0.05, bowlY: Y(LB.rim - 0.1), bowlR: LB.R - 0.4, seed: 1874, sheet: 2200, splash: 2000, jet: 50, bowl: 200, mist: 300 }));
  }
  if (FW27) fountainProbe(pool, FG, [poolMat, lbw, ubw], wl + 1.6);
  if (o.colliders && typeof o.addPrism === 'function') o.addPrism(circlePts(R + 0.02, 40), yl, rimTop, false);
  return { wl: +wl.toFixed(2), top: +(Y(F.feet) + F.angel + 0.2).toFixed(2), lowerRim: +Y(LB.rim).toFixed(2), upperRim: +Y(UBs.rim).toFixed(2), lowerPool: !!lowerPool };
}

// ---- the Cherry Hill Fountain (Jacob Wrey Mould, 1860s; a drinking fountain and horse trough on the Cherry Hill
// concourse): a 14 ft granite dome over a sculpted bluestone basin inset with Minton tiles, crowned with eight frosted
// round glass lamps and a golden spire (Commons, Charles Smith, CC BY-SA 2.0: the description and the photograph, look
// only). OSM way 959007357: the basin 6.3 m across at world (-127.2, 934.0). Built at the local origin (y 0 = the
// concourse's paving).
export const CHERRY = { x: -127.2, z: 934.0, R: 3.12 };
export function buildCherry(M) {
  const G = new THREE.Group(), R = CHERRY.R, Ri = R - 0.34;
  G.name = 'cp32b:cherryHill';
  const part = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; G.add(m); return m; };
  const gold = M.gold || (M.gold = LT(new THREE.MeshStandardMaterial({ color: 0xc9a045, roughness: 0.28, metalness: 1.0 })));
  const globe = M.globe || (M.globe = LT(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.45, emissive: 0xfff4e0, emissiveIntensity: 0.35 })));
  // the bluestone basin: a heavy rolled rim, lobed a little, its face carved (the relief panels)
  const rim = lathe([[R + 0.04, -0.05], [R + 0.04, 0.12], [R - 0.02, 0.2], [R + 0.03, 0.34], [R + 0.1, 0.46], [R + 0.08, 0.56], [R - 0.05, 0.62], [Ri + 0.1, 0.62], [Ri, 0.54], [Ri, 0.1]], 72);
  const rp = rim.attributes.position; for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), q = 1 + 0.012 * Math.cos(Math.atan2(z, x) * 12); rp.setX(i, x * q); rp.setZ(i, z * q); }
  rim.computeVertexNormals(); part(rim, M.sandD);
  const wm = waterMat(2); const wg = new THREE.RingGeometry(0.5, Ri + 0.01, 64, 1); wg.rotateX(-Math.PI / 2); wg.translate(0, 0.45, 0); part(wg, wm, false);
  const fg = new THREE.CircleGeometry(Ri, 48); fg.rotateX(-Math.PI / 2); fg.translate(0, 0.08, 0); part(fg, M.granD, false);
  // the buff stone plinth and vase, the granite dome
  part(lathe([[0.5, 0.05], [0.5, 0.78], [0.56, 0.84], [0.42, 0.92], [0.24, 1.05], [0.2, 1.3], [0.3, 1.55], [0.42, 1.75], [0.4, 1.88], [0.001, 1.9]], 4, Math.PI / 4), M.sandL);
  part(lathe([[0.001, 1.86], [0.45, 1.88], [0.8, 1.98], [0.98, 2.1], [0.96, 2.2], [0.75, 2.34], [0.4, 2.42], [0.12, 2.45], [0.001, 2.45]], 48), M.granD);
  // the black cast-iron standard: a shaft, a ring of six cups on brackets, the crown of eight frosted globes, the spire
  part(lathe([[0.001, 2.4], [0.13, 2.4], [0.1, 2.6], [0.08, 3.9], [0.11, 3.96], [0.001, 4.0]], 14), M.iron);
  for (let k = 0; k < 6; k++) {
    const an = (k / 6) * Math.PI * 2, x = Math.cos(an), z = Math.sin(an);
    const br = new THREE.TorusGeometry(0.2, 0.018, 5, 12, Math.PI * 0.8); br.rotateY(-an); br.translate(x * 0.2, 2.95, z * 0.2); part(br, M.iron);
    const cup = lathe([[0.001, 0], [0.04, 0], [0.09, 0.08], [0.1, 0.12], [0.001, 0.1]], 10); cup.translate(x * 0.42, 3.0, z * 0.42); part(cup, M.iron);
  }
  for (let k = 0; k < 8; k++) {
    const an = (k / 8) * Math.PI * 2 + 0.2, x = Math.cos(an), z = Math.sin(an), rr = k % 2 ? 0.38 : 0.5, y = k % 2 ? 3.92 : 3.8;
    const br = new THREE.TorusGeometry(rr * 0.5, 0.016, 5, 12, Math.PI * 0.9); br.rotateY(-an); br.translate(x * rr * 0.5, y - 0.12, z * rr * 0.5); part(br, M.iron);
    const g = new THREE.SphereGeometry(0.11, 14, 10); g.translate(x * rr, y + 0.1, z * rr); part(g, globe, false);
  }
  const ball = new THREE.SphereGeometry(0.08, 12, 8); ball.translate(0, 4.08, 0); part(ball, M.iron);
  const sp = new THREE.ConeGeometry(0.05, 0.42, 8); sp.translate(0, 4.36, 0); part(sp, gold);
  const fin = new THREE.SphereGeometry(0.035, 8, 6); fin.translate(0, 4.6, 0); part(fin, gold);
  // the water: a thin sheet round the dome's lip into the basin
  if (FW26) {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.99 + 0.3 * Math.sqrt(t), 2.1 - 1.65 * t]); }
    const vm = veilMat({ y0: 2.1, dir: 1, v0: 0.25, tMax: 0.52, aer: [0.35, 0.95], holes: 0.6, body: 0.18, freq: 9 }, LT);
    part(lathe(pts, 64), vm, false).renderOrder = 2;
  }
  return G;
}
