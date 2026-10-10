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
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyLightTrim, applyStoneDetail } from '../world/materials.js';
import { FW25, FW26, FW27, fountainProbe, fountainSpray, poolRings, veilMat } from './fountainFX.js';
import { cpPoolWaterMat } from './cpWaterMat.js';
// CPFW (owner 2026-09-30: "Central park fountain water looks weird and tiled; the lake water has a much better shader"):
// the pool and the two basins take the Lake's water shader (city/cpWaterMat.js) scaled for a fountain, instead of the
// campus fountains' tiled ripple map under FW27's rings; `?cpfw=0` restores that
const CPFW = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpfw') === '0');
// CP33 (owner 2026-09-30 22:15: "for Central Park, stones, parts of bridges, and the castle area look really low poly ...
// update all details and objects so that nothing looks flat low poly"): the Angel of the Waters from a photogrammetry
// scan (models/cp33/bethesda/angel.glb, tools/cp33/bethesda/angel.mjs) in a patinated bronze, every bronze and stone
// part smooth-shaded, the fountain's tiers in their own stones (a dark granite base and frieze, eight pink-red granite
// columns with bronze capitals and bases, an octagonal pink-tan lower basin with a bronze rim), the lower veil as eight
// streams off the basin's corners and the upper one broken into drops, the bronze rock, the drive over the Arcade in
// granite setts, the treads nosed over darker risers. `?cp33b=0` restores CP32's build.
export const CP33B = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp33b') === '0');

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
  _relief = { nrm: texOf(nrm, false), ao: texOf(ao, true), H: H0, W, Hh };   // CP33: the height for carved geometry
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
// CP33 bronze with its patina: a dark brown metal where the rain washes it, a green-grey verdigris (a mineral, not a
// metal: rougher, no metallic reflection) in the recesses (the scan's cavity map where there is one, else the hollows
// of a world-space noise) and in streaks drawn down from the upward faces; smooth-shaded
function patinaBronze(o) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.6, map: o.cav || null });
  const base = new THREE.Color(o.base), verd = new THREE.Color(o.verd);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.paBase = { value: base }; sh.uniforms.paVerd = { value: verd }; sh.uniforms.paAmt = { value: o.amt ?? 0.55 };
    // o.attr: the cavity map is a per-vertex attribute 'cavity' (the cherubs: a scan without a texture, its photo shading baked
    // into the vertices by tools/cp33/bethesda/cherub.mjs)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPaW; varying vec3 vPaN;' + (o.attr ? '\nattribute float cavity; varying float vPaC;' : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPaW = (modelMatrix * vec4(transformed, 1.0)).xyz; vPaN = normalize(mat3(modelMatrix) * objectNormal);' + (o.attr ? '\nvPaC = cavity;' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 paBase; uniform vec3 paVerd; uniform float paAmt; varying vec3 vPaW; varying vec3 vPaN;${o.attr ? ' varying float vPaC;' : ''}
      float paH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float paN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(paH(i), paH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(paH(i + vec3(0.0, 1.0, 0.0)), paH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                   mix(mix(paH(i + vec3(0.0, 0.0, 1.0)), paH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(paH(i + vec3(0.0, 1.0, 1.0)), paH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `
      float paCav;
      ${o.attr ? 'paCav = smoothstep(0.16, 0.72, vPaC);' : `
      #ifdef USE_MAP
        paCav = smoothstep(0.16, 0.72, texture2D(map, vMapUv).r);
      #else
        paCav = 0.3 + 0.7 * (0.65 * paN(vPaW * 7.0) + 0.35 * paN(vPaW * 23.0));
      #endif`}
      float paStreak = paN(vec3(vPaW.x * 16.0, vPaW.y * 0.9, vPaW.z * 16.0));
      float paUp = clamp(vPaN.y, 0.0, 1.0);
      float pat = smoothstep(0.1, 0.85, clamp((1.0 - paCav) * 1.05 + paUp * 0.3 + (paStreak - 0.5) * 0.55, 0.0, 1.0) * paAmt * 1.4);
      diffuseColor.rgb = mix(paBase, paVerd, pat) * (0.86 + 0.28 * paN(vPaW * 61.0));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.34, 0.8, pat);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.62, 0.06, pat);');
  };
  m.customProgramCacheKey = () => 'cp33patina' + (o.cav ? 'C' : '') + (o.attr ? 'A' : '');
  return LT(m);
}
// CP33 the scanned cherubs (tools/cp33/bethesda/cherub.mjs: noe-3d.at's "Putto auf Fisch", CC0): two hands (A and B, mirror
// images) in three LODs each (70k, 12k and 2.5k triangles), the photo shading in a per-vertex 'cavity' attribute
let _cherubScan = null;
export const cherubScan = () => _cherubScan || (_cherubScan = (async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync('models/cp33/bethesda/cherub.glb');
  const geos = {};
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const col = o.geometry.getAttribute('color');
    if (col) { const c = new Float32Array(col.count); for (let i = 0; i < c.length; i++) c[i] = col.getX(i); o.geometry.setAttribute('cavity', new THREE.BufferAttribute(c, 1)); o.geometry.deleteAttribute('color'); }
    geos[o.name] = o.geometry;
  });
  return { A: [geos.A0, geos.A1, geos.A2], B: [geos.B0, geos.B1, geos.B2], mat: patinaBronze({ base: 0x40332a, verd: 0x62826f, amt: 0.62, attr: true }) };
})());
// CP33 a rock (bronze or stone): an icosphere welded and pushed out by lumps, three octaves of RIDGED noise (crests, not
// blobs), horizontal strata and eight cleavage planes that cut flat facets with sharp arrises; flattened at the bottom;
// rx, ry, rz the half extents. Smooth-shaded over 10-40k vertices
export function rockGeo(rx, ry, rz, seed = 1, detail = 5) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w); };
  const rd = (x, y, z, k) => 1 - Math.abs(2 * vn(x * k, y * k, z * k) - 1);
  const planes = Array.from({ length: 8 }, (_, i) => { const a = h(i, 1, 2) * 6.283, e = (h(i, 3, 4) - 0.25) * 1.3; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.7 + 0.2 * h(i, 5, 6)]; });
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let r = 1 + 0.17 * (vn(x * 1.9, y * 1.9, z * 1.9) - 0.5) + 0.10 * (rd(x, y, z, 4.3) - 0.5) + 0.055 * (rd(x, y, z, 9.1) - 0.5) + 0.03 * (rd(x, y, z, 19) - 0.5) + 0.012 * (vn(x * 41, y * 41, z * 41) - 0.5);
    r *= 1 + 0.018 * Math.sin((y * 8.5 + 2.4 * vn(x * 1.7, y * 1.7, z * 1.7)) * 3);
    for (const [nx, ny, nz, d] of planes) { const t = (x * nx + y * ny + z * nz) * r; if (t > d) r *= 1 - 0.9 * (t - d) / Math.max(t, 1e-3); }
    x *= r; y *= r; z *= r;
    if (y < -0.55) y = -0.55 - (y + 0.55) * 0.15;
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  return g;
}
// CP33 granite setts (Terrace Drive over the Arcade; Commons "Central Park Apr 2019 122", look only): grey granite blocks
// ~12 x 22 cm in courses across the drive, each its own tone with a split face, dark sanded joints; 1024 px over 2.4 m,
// mapped by the slab's (b, a) metres; the normal map from the blocks' domed tops and sunk joints
let _setts = null;
function settsMat() {
  if (_setts) return _setts;
  const N = 1024, S = 2.4, H = new Float32Array(N * N), cv = canvas(N, N), c = cv.getContext('2d'), img = c.createImageData(N, N);
  const cw = 0.12, rows = Math.round(S / cw), lenA = S / 11;
  const tone = new Float32Array(rows * 12 * 3);
  for (let i = 0; i < tone.length; i += 3) { const t = 0.36 + rnd() * 0.2, w = (rnd() - 0.5) * 0.03; tone[i] = t + w; tone[i + 1] = t; tone[i + 2] = t - w * 0.5 + 0.01; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x / N) * S, v = (y / N) * S, row = Math.floor(u / cw), fu = u / cw - row, off = (row % 2) * 0.5, sv = v / lenA + off, col = Math.floor(sv) % 11, fv = sv - Math.floor(sv);
    const du = Math.min(fu, 1 - fu) * cw, dv = Math.min(fv, 1 - fv) * lenA, d = Math.min(du, dv);   // metres to the joint
    const jw = 0.007 + 0.004 * Math.sin(row * 3.1 + col * 1.7);
    const k = (row * 12 + col) * 3, sp = 0.85 + 0.3 * rnd();
    const top = d < jw ? 0 : Math.min(1, (d - jw) / 0.018) * (0.75 + 0.25 * Math.sin(fu * 3.14) * Math.sin(fv * 3.14)) + (rnd() - 0.5) * 0.06;
    H[y * N + x] = top;
    const i = (y * N + x) * 4, j = d < jw ? 0.16 + rnd() * 0.04 : 1;
    img.data[i] = Math.min(255, tone[k] * sp * j * 255); img.data[i + 1] = Math.min(255, tone[k + 1] * sp * j * 255); img.data[i + 2] = Math.min(255, tone[k + 2] * sp * j * 255); img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const map = texOf(cv, true), nrm = texOf(heightToNormal(H, N, N, 3.0), false);
  map.repeat.set(1 / S, 1 / S); nrm.repeat.set(1 / S, 1 / S);
  _setts = LT(new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.86, metalness: 0 }));
  return _setts;
}
// CP33 the scanned angel (tools/cp33/bethesda/angel.mjs: noe-3d.at's "Engel", CC BY 4.0), its three LODs, loaded once
let _angelScan = null;
export const angelScan = () => _angelScan || (_angelScan = (async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync('models/cp33/bethesda/angel.glb');
  const geos = {};
  let cav = null;
  g.scene.traverse((o) => { if (o.isMesh) { geos[o.name] = o.geometry; cav = cav || o.material.map; } });
  if (cav) { cav.colorSpace = THREE.NoColorSpace; cav.anisotropy = 8; cav.needsUpdate = true; }
  return { geos: [geos.LOD0, geos.LOD1, geos.LOD2], mat: patinaBronze({ base: 0x45382b, verd: 0x6a8a76, amt: 0.6, cav }) };
})());

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
    bronze: CP33B ? patinaBronze({ base: 0x3b2f24, verd: 0x5d7b69, amt: 0.55 }) : LT(new THREE.MeshStandardMaterial({ color: 0x46503e, roughness: 0.5, metalness: 0.55, flatShading: true })),
    bronzeD: CP33B ? patinaBronze({ base: 0x2e271f, verd: 0x506c5c, amt: 0.62, rock: 1 }) : LT(new THREE.MeshStandardMaterial({ color: 0x2f3a31, roughness: 0.55, metalness: 0.5, flatShading: true })),
    // CP33 the fountain's tiers (the photographs): the base and its frieze a dark granite, the columns a pink-red polished
    // granite, the lower basin a pink-tan stone
    granDk: gran(0x56524d, 0.62),
    granRed: applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: 0x9a5a4c, roughness: 0.32, metalness: 0.02 })), 'cgranite', { amt: 0.75, nrm: 0.35, rgh: 0.25 }),
    basinTan: stone(0xb39782, { ashlar: 0 }),
    carvedDk: applyStoneDetail(LT(new THREE.MeshStandardMaterial({ color: 0x5c5853, roughness: 0.7, metalness: 0.02, vertexColors: true })), 'cgranite', { amt: 0.6, nrm: 0.4, rgh: 0.3 }),
    setts: settsMat(),
    riser: stone(0x6d675c, { ashlar: 0 }),
    iron: LT(new THREE.MeshStandardMaterial({ color: 0x1d2320, roughness: 0.55, metalness: 0.6 })),
    glass: LT(new THREE.MeshStandardMaterial({ color: 0xfff2d8, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0.6 })),
    dark: LT(new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.95 })),
    leaf: LT(new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.8, flatShading: !CP33B, side: CP33B ? THREE.DoubleSide : THREE.FrontSide })),
    leaf2: LT(new THREE.MeshStandardMaterial({ color: 0x597a34, roughness: 0.75, side: THREE.DoubleSide })),
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
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        float cpbH2( vec2 p ) { p = mod( p, 251.0 ); return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }   // reduced first: sin() of a 1e7 argument is noise stripes in fp32
        float cpbN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( cpbH2( i ), cpbH2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cpbH2( i + vec2( 0.0, 1.0 ) ), cpbH2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // CP33: Roman brick (20 x 10 cm) laid at 45 degrees to the axis in a stretcher bond, every brick its own tone and hue,
        // the pale bands as granite with grain; the brick/band split is the LINEAR red-green difference (brick .12-.15, band
        // .06; the earlier test on red-blue was ~.16 on both and the joints never showed). cpbH is the surface height in metres
        // (sunk mortar, domed faces) for the bump below; the detail fades into the mean tone with the pixel's footprint
        float cpbJ = 0.0, cpbBr = 0.0, cpbH = 0.0, cpbAa = 0.0;
        vec2 cpbPm = vec2( vMapUv.x * ${sx.toFixed(3)}, vMapUv.y * ${sy.toFixed(3)} );
        {
          vec2 q = vec2( 0.70711 * ( cpbPm.x + cpbPm.y ), 0.70711 * ( cpbPm.y - cpbPm.x ) );
          float fp = max( length( fwidth( q ) ), 1e-4 );
          cpbAa = clamp( 1.0 - fp / 0.07, 0.0, 1.0 );
          float row = floor( q.y / 0.1 );
          float xb = q.x / 0.2 + 0.5 * mod( row, 2.0 );
          vec2 cell = vec2( floor( xb ), row );
          vec2 f = vec2( fract( xb ) * 0.2, fract( q.y / 0.1 ) * 0.1 );
          float jd = min( min( f.x, 0.2 - f.x ), min( f.y, 0.1 - f.y ) );
          float h1 = cpbH2( cell ), h2 = cpbH2( cell + 17.3 ), h3 = cpbH2( cell + 41.9 );
          cpbBr = smoothstep( 0.075, 0.105, diffuseColor.r - diffuseColor.g );
          float jw = 0.0035, fw = fp * 0.5;
          float jSharp = ( 1.0 - smoothstep( jw - fw, jw + fw, jd ) ) * min( 1.0, jw / fw );
          cpbJ = mix( 0.105, jSharp, cpbAa );
          float mott = cpbN( cpbPm * 42.0 + cell * 7.3 ) * 0.6 + cpbN( cpbPm * 130.0 ) * 0.4;
          float tone = 0.80 + 0.36 * h1;
          tone *= mix( 1.0, 0.60, step( 0.93, h2 ) );                                   // dark, hard-fired bricks
          tone *= mix( 1.0, 1.22, step( 0.95, h3 ) * ( 1.0 - step( 0.93, h2 ) ) );     // pale, underfired ones
          vec3 hue = vec3( 1.0 + 0.10 * ( h2 - 0.5 ), 1.0, 1.0 - 0.20 * ( h3 - 0.5 ) );
          vec3 brickCol = diffuseColor.rgb * tone * hue * ( 0.88 + 0.24 * mott ) * 0.95;
          brickCol *= 1.0 - 0.28 * ( 1.0 - smoothstep( 0.0, 0.016, jd ) );              // the worn arris, grime at the edge
          vec3 mortar = vec3( 0.26, 0.23, 0.19 ) * ( 0.8 + 0.4 * cpbN( cpbPm * 70.0 ) );
          vec3 det = mix( brickCol, mortar, cpbJ );
          diffuseColor.rgb = mix( diffuseColor.rgb, det, cpbBr * mix( 0.6, 1.0, cpbAa ) );
          // the granite bands: grains 3-5 mm (pink feldspar, black mica), faded by the footprint
          float gA = clamp( 1.0 - fp / 0.025, 0.0, 1.0 ) * ( 1.0 - cpbBr );
          float g1 = cpbN( cpbPm * 240.0 ), g2 = cpbN( cpbPm * 610.0 + 5.0 ), g3 = cpbN( cpbPm * 410.0 + 11.0 );
          vec3 gr = diffuseColor.rgb * ( 0.84 + 0.30 * g1 );
          gr = mix( gr, gr * vec3( 1.28, 0.94, 0.90 ), smoothstep( 0.66, 0.78, g2 ) );
          gr = mix( gr, gr * 0.42, smoothstep( 0.74, 0.82, g3 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, gr, gA );
          cpbH = ( -0.0042 * ( 1.0 - smoothstep( jw, jw + 0.0045, jd ) ) + 0.0016 * smoothstep( 0.0, 0.05, jd ) * ( 0.4 + 0.6 * mott ) ) * cpbBr * cpbAa;
          cpbH += 0.0007 * ( g1 - 0.5 ) * gA;
        }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        roughnessFactor = clamp( mix( roughnessFactor, 0.97, cpbJ * cpbBr ), 0.05, 1.0 );`)
      .replace('#include <clearcoat_normal_fragment_begin>', `
        {
          // CP33: bump from cpbH (Mikkelsen's surface-gradient perturbation, unnormalised tangents: the height is in metres)
          vec2 cpbD = vec2( dFdx( cpbH ), dFdy( cpbH ) );
          vec3 cpbSx = dFdx( - vViewPosition ), cpbSy = dFdy( - vViewPosition );
          vec3 cpbR1 = cross( cpbSy, normal ), cpbR2 = cross( normal, cpbSx );
          float cpbDet = dot( cpbSx, cpbR1 );
          vec3 cpbG = sign( cpbDet ) * ( cpbD.x * cpbR1 + cpbD.y * cpbR2 );
          normal = normalize( abs( cpbDet ) * normal - cpbG );
        }
        #include <clearcoat_normal_fragment_begin>`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|cpbBrick33' + sx.toFixed(1) + sy.toFixed(1);
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
  if (!CP33B) return LT(new THREE.MeshStandardMaterial({ map: t, roughness: 0.28, metalness: 0.02, emissiveMap: t, emissive: 0x3a2a1a, emissiveIntensity: 0.6 }));
  // CP33: the tiles as glazed relief: each 13 cm tile a little domed (its own height), the grout sunk, the panel's frame
  // raised over the girders' soffit; the same layout as the colours, so one normal map on the same UVs
  const N = BAY * 2, NH = new Float32Array(N * N), hash = (a, b, c, d) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 19.3) * 43758.5453; return s - Math.floor(s); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const bx = x >= BAY ? 1 : 0, by = y >= BAY ? 1 : 0, lx = x - bx * BAY, ly = y - by * BAY, px = lx - off, py = ly - off;
    let h = 0.18;                                                       // the soffit
    if (px >= -6 && py >= -6 && px < panelPx + 6 && py < panelPx + 6) h = 0.5;      // the frame
    if (px >= 0 && py >= 0 && px < panelPx && py < panelPx) {
      const u = px / T, v = py / T, i = Math.floor(u), j = Math.floor(v), d = Math.min(u - i, i + 1 - u, v - j, j + 1 - v) * T;
      h = d < 1.4 ? 0.52 : 0.78 + 0.08 * hash(bx, by, i, j) + 0.06 * Math.min(1, (d - 1.4) / 5);
    }
    NH[y * N + x] = h;
  }
  const nrmT = texOf(heightToNormal(NH, N, N, 4.0), false);
  nrmT.anisotropy = 16;
  return LT(new THREE.MeshStandardMaterial({ map: t, normalMap: nrmT, normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.24, metalness: 0.02, emissiveMap: t, emissive: 0x3a2a1a, emissiveIntensity: 0.6 }));
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
      // CP33: arrised (a 1.2 cm bevel catches the light on every opening), the openings round at 24 segments
      let g = CP33B ? new THREE.ExtrudeGeometry(sh, { depth: 0.17, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.011, bevelOffset: -0.011, bevelSegments: 2, curveSegments: 24 })
        : new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, CP33B ? -0.085 : -0.1);
      if (CP33B) g = toCreasedNormals(g, 0.6);   // the openings' walls smooth over their 15-degree facets, the arrises crisp
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
  if (!CP33B) return lathe([[0.001, 0], [0.085, 0], [0.085, 0.07], [0.06, 0.1], [0.075, 0.2], [0.1, 0.36], [0.09, 0.5], [0.05, 0.64], [0.04, 0.72], [0.065, 0.78], [0.05, 0.84], [0.085, 0.9], [0.085, 1.0], [0.001, 1.0]], 10);
  // CP33: a turned baluster in 28 sides and a fuller profile (a plinth, a cyma, the swelling vase, a collar of fillets and
  // beads under the abacus), smooth-shaded; 1 m tall, scaled to the run
  return lathe([[0.001, 0], [0.088, 0], [0.088, 0.04], [0.098, 0.05], [0.098, 0.075], [0.074, 0.088], [0.064, 0.115], [0.07, 0.15], [0.086, 0.205], [0.103, 0.29], [0.11, 0.38], [0.103, 0.46],
    [0.086, 0.54], [0.064, 0.62], [0.048, 0.69], [0.042, 0.73], [0.05, 0.755], [0.068, 0.77], [0.07, 0.79], [0.056, 0.805], [0.05, 0.83], [0.058, 0.855], [0.074, 0.875], [0.09, 0.9], [0.094, 0.925], [0.094, 1.0], [0.001, 1.0]], 28);
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
// CP33 a block with its vertical corners chamfered (ch) and its edges arrised: a shape in (b, a) extruded up
function cbox(bag, key, a0, a1, b0, b1, y0, y1, ch = 0.03, bev = 0.008) {
  const c = Math.min(ch, (a1 - a0) / 3, (b1 - b0) / 3);
  const sh = new THREE.Shape([[b0 + c, a0], [b1 - c, a0], [b1, a0 + c], [b1, a1 - c], [b1 - c, a1], [b0 + c, a1], [b0, a1 - c], [b0, a0 + c]].map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, y1 - y0 - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0 + bev, 0);
  return bag.add(key, g);
}
// a pier (square, a base, a moulded cap and a ball finial), its foot at y, its shaft h tall
function pier(bag, a, b, y, h, w = 1.0, key = 'sand', ball = true) {
  if (CP33B) {
    // CP33: a stepped plinth, a shaft with chamfered corners and a sunk panel on each face, a three-step moulded cap, a turned
    // finial (a neck and bead under the ball)
    cbox(bag, 'sandD', a - w / 2 - 0.08, a + w / 2 + 0.08, b - w / 2 - 0.08, b + w / 2 + 0.08, y - 0.3, y + 0.28, 0.05);
    cbox(bag, 'sandD', a - w / 2 - 0.04, a + w / 2 + 0.04, b - w / 2 - 0.04, b + w / 2 + 0.04, y + 0.28, y + 0.38, 0.04);
    cbox(bag, key, a - w / 2, a + w / 2, b - w / 2, b + w / 2, y + 0.38, y + h, 0.045);
    const ph = h - 0.38 - 0.5, pw = w * 0.62;
    if (ph > 0.3) for (const [da, db, wa, wb] of [[w / 2, 0, 0.02, pw], [-w / 2, 0, 0.02, pw], [0, w / 2, pw, 0.02], [0, -w / 2, pw, 0.02]])
      bag.box('sandD', a + da - wa / 2, a + da + wa / 2, b + db - wb / 2, b + db + wb / 2, y + 0.38 + 0.25, y + 0.38 + 0.25 + ph);
    cbox(bag, 'sandL', a - w / 2 - 0.1, a + w / 2 + 0.1, b - w / 2 - 0.1, b + w / 2 + 0.1, y + h, y + h + 0.1, 0.04);
    cbox(bag, 'sandL', a - w / 2 - 0.04, a + w / 2 + 0.04, b - w / 2 - 0.04, b + w / 2 + 0.04, y + h + 0.1, y + h + 0.2, 0.04);
    cbox(bag, 'sandL', a - w / 2 + 0.12, a + w / 2 - 0.12, b - w / 2 + 0.12, b + w / 2 - 0.12, y + h + 0.2, y + h + 0.36, 0.05);
    if (ball) {
      const fin = lathe([[0.001, 0], [w * 0.2, 0], [w * 0.2, 0.025], [w * 0.13, 0.05], [w * 0.12, 0.09], [w * 0.17, 0.12], [w * 0.24, 0.17], [w * 0.265, 0.24], [w * 0.24, 0.31], [w * 0.17, 0.36], [w * 0.05, 0.385], [0.001, 0.39]], 28);
      fin.translate(b, y + h + 0.36, -a); bag.add('sandL', fin);
    }
    return y + h + 0.36;
  }
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
// CP33 the urns' planting: a mound of arching blades (fountain grass / spider plant), each a tapering six-segment ribbon bent over
// under its own weight, two greens by blade
function plantBlades(bag, a, b, y, n = 110, R = 0.3) {
  for (let i = 0; i < n; i++) {
    const th = i * 2.399963 + rnd() * 0.5, r0 = Math.sqrt((i + 0.5) / n) * R, L = 0.42 + rnd() * 0.4, w = 0.013 + rnd() * 0.01;
    const psi0 = 1.15 + rnd() * 0.35 - (r0 / R) * 0.55, bend = 1.5 + rnd() * 0.9, seg = 6, P = [], U = [], Ix = [];
    const cx = Math.cos(th), cz = Math.sin(th);
    let rr = r0, hh = 0;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, ww = w * (1 - 0.8 * t * t) * 0.5, px = b + cx * rr, pz = -a + cz * rr, py = y + hh;
      P.push(px - cz * ww, py, pz + cx * ww, px + cz * ww, py, pz - cx * ww); U.push(0, t, 1, t);
      const psi = psi0 - bend * t; rr += (L / seg) * Math.cos(psi); hh += (L / seg) * Math.sin(psi);
      if (k < seg) { const q = k * 2; Ix.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(Ix);
    g.computeVertexNormals();
    bag.add(i % 3 === 0 ? 'leaf2' : 'leaf', g);
  }
}
function urn(bag, a, b, y) {
  const g = lathe([[0.001, 0], [0.24, 0], [0.24, 0.08], [0.15, 0.14], [0.13, 0.24], [0.3, 0.36], [0.44, 0.56], [0.42, 0.72], [0.5, 0.78], [0.46, 0.84], [0.001, 0.84]], CP33B ? 44 : 20);
  g.translate(b, y, -a); bag.add('sandL', g);
  if (CP33B) { plantBlades(bag, a, b, y + 0.8); return; }
  for (let i = 0; i < 7; i++) { const an = i * 2.4, r = i ? 0.26 : 0, s = new THREE.IcosahedronGeometry(0.2 + (i % 3) * 0.04, 1); s.translate(b + Math.cos(an) * r, y + 0.95 + (i ? 0 : 0.12), -a + Math.sin(an) * r); bag.add('leaf', s); }
}
// the Arcade's north face (IO_88053a0f): seven arches in 2 + 3 + 2, the loggias' two either side of the passage's
// three; spans 7'9 2/3", the piers 0.58 m in the middle group, 0.69 m in the side ones; the crowns 13'6" over the floor
// CP33 an archivolt of cut voussoirs round an arch (centre cx, spring height sp, intrados radius r): n blocks (odd, the keystone
// in the middle standing a little further out and down) ring width w, each a wedge with a 1.1 cm joint and an arrised face,
// proud of the wall by depth, its back on z0 (local z = -a: z0 = -aFace - depth for a face looking toward +a)
function voussoirs(bag, key, cx, sp, r, w, depth, z0, n = 13) {
  const gap = 0.011, dth = Math.PI / n, mid = (n - 1) / 2;
  for (let k = 0; k < n; k++) {
    const t1 = k * dth + gap / (2 * r), t0 = (k + 1) * dth - gap / (2 * r), key_ = k === mid, ro = r + w + (key_ ? 0.1 : 0), ri = r - (key_ ? 0.035 : 0);
    const sh = new THREE.Shape([new THREE.Vector2(cx + ri * Math.cos(t0), sp + ri * Math.sin(t0)), new THREE.Vector2(cx + ro * Math.cos(t0), sp + ro * Math.sin(t0)),
      new THREE.Vector2(cx + ro * Math.cos(t1), sp + ro * Math.sin(t1)), new THREE.Vector2(cx + ri * Math.cos(t1), sp + ri * Math.sin(t1))]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - 0.016 + (key_ ? 0.02 : 0), bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelOffset: -0.007, bevelSegments: 1 });
    g.translate(0, 0, z0 + 0.008 - (key_ ? 0.02 : 0)); bag.add(key, g);
  }
}
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
  // CP33 a step: the riser's face a darker weathered stone under a granite tread slab whose rounded nosing projects 4 cm
  // and throws the shadow line that makes a flight read as steps from the air (review t4Crane: smooth grey ramps)
  const step = (A0, A1, b0, b1, y, yBot) => {
    if (!CP33B) { bag.box('gran', A1, A0 + 0.03, b0, b1, yBot, y); bag.box('granD', A0 - 0.02, A0 + 0.035, b0 + 0.02, b1 - 0.02, y - 0.035, y - 0.012); return; }
    bag.box('riser', A1, A0, b0, b1, yBot, y - 0.055);
    bag.box('gran', A1, A0 + 0.012, b0, b1, y - 0.06, y);
    const n = new THREE.CylinderGeometry(0.03, 0.03, b1 - b0, 12, 1); n.rotateZ(Math.PI / 2); n.translate((b0 + b1) / 2, y - 0.03, -(A0 + 0.012));
    bag.add('gran', n);
  };
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
        step(A0, A1, b0, b1, y, fy - 0.45 + k * rise * 0.5);   // the tread, its nosing and the riser under it
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
      if (CP33B) voussoirs(bag, 'sandL', cx, spring, r, 0.26, 0.1, -aF - 0.1, 13);
      else {
      const ring = new THREE.Shape();
      ring.moveTo(x1 + 0.26, spring); ring.absarc(cx, spring, r + 0.26, 0, Math.PI, false);
      ring.lineTo(x0, spring); ring.absarc(cx, spring, r, Math.PI, 0, true); ring.lineTo(x1 + 0.26, spring);
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: false, curveSegments: 16 });
      rg.translate(0, 0, -aF - 0.08); bag.add('sandL', rg);
      }
      for (const x of [x0, x1]) bag.box('sandL', aF - 0.02, aF + 0.1, x - 0.16, x + 0.16, spring - 0.2, spring);
    }
    for (let i = 0; i <= arches.length; i++) {
      const b0 = i === 0 ? -W : arches[i - 1][1], b1 = i === arches.length ? W : arches[i][0];
      solid(aB, aF, b0, b1, ys, yu);
    }
    const eg = new THREE.ExtrudeGeometry(sh, { depth: PLAN.arcadeT, bevelEnabled: false, curveSegments: 18 });
    eg.translate(0, 0, -aF);
    bag.add('sand', CP33B ? toCreasedNormals(eg, 0.75) : eg);   // CP33: the arches' soffits smooth over their 10-degree facets, the wall's faces and arrises crisp
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
      bag.add('sand', CP33B ? toCreasedNormals(eg2, 0.75) : eg2);
      bag.box('sandL', tA1 - 1.0, tA1 + 0.02, -PW - 0.1, PW + 0.1, yu + 1.0, yu + 1.16);
    }
  }
  // 6. the upper terrace: its paved slab over the Arcade and along the drive, its edges closed down to the ground, the
  //    balustrades along its outer ends
  {
    const UB = 25, uuv = (a, b) => [(b + UB) / (2 * UB), 1 + (a + 51) / 16.5];
    const up = [[PLAN.upperA1, -PLAN.wallOut[1]], [PLAN.upperA1, PLAN.wallOut[1]], [PLAN.stairTopA, PLAN.wallOut[1]], [PLAN.stairTopA, PLAN.wallIn[0]], [aB + 0.02, PLAN.wallIn[0]], [aB + 0.02, -PLAN.wallIn[0]], [PLAN.stairTopA, -PLAN.wallIn[0]], [PLAN.stairTopA, -PLAN.wallOut[1]]];
    bag.add(CP33B ? 'setts' : 'upper', CP33B ? flatFace(up, [], yu) : flatFace(up, [], yu, uuv));   // CP33: Terrace Drive's granite setts over the Arcade (review t4Crane)
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
      step(A0, A1, -B2, B2, y, fy - 0.45 + k * r2 * 0.5);
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
// CP33 an octagonal lathe: the profile [[apothem, y], ...] up the outside, eight flat sides (crisp corners, the corners at
// pi/8 + k pi/4 as (sin, cos), the columns' corners), the profile's own normals smooth along it
export function octLathe(pts, sides = 8, phase = Math.PI / 8) {
  const P = [], N = [], cr = 1 / Math.cos(Math.PI / sides);
  const n2 = pts.map((_, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l]; });
  const v = (r, y, t) => [r * cr * Math.sin(t), y, r * cr * Math.cos(t)];
  for (let k = 0; k < sides; k++) {
    const t0 = phase + (k * 2 * Math.PI) / sides, t1 = t0 + (2 * Math.PI) / sides, tc = (t0 + t1) / 2, fx = Math.sin(tc), fz = Math.cos(tc);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = v(pts[i][0], pts[i][1], t0), b = v(pts[i][0], pts[i][1], t1), c = v(pts[i + 1][0], pts[i + 1][1], t1), d = v(pts[i + 1][0], pts[i + 1][1], t0);
      const na = [fx * n2[i][0], n2[i][1], fz * n2[i][0]], nb = [fx * n2[i + 1][0], n2[i + 1][1], fz * n2[i + 1][0]];
      P.push(...a, ...b, ...c, ...a, ...c, ...d); N.push(...na, ...na, ...nb, ...na, ...nb, ...nb);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
// CP33 a carved frieze round an octagon (apothem A, y0..y1): Mould's scroll (reliefMaps' height) as real relief, depth d,
// each side a grid displaced out from its face, four panels a side; the recesses darker (vertex colour)
export function friezeBand(A, y0, y1, d, sides = 8, phase = Math.PI / 8, nu = 144, nv = 26) {
  const R = reliefMaps(), H = R.H, W = R.W, Hh = R.Hh, P = [], C = [], I = [], half = A * Math.tan(Math.PI / sides);
  const hAt = (u, v) => { const x = Math.min(W - 1.001, Math.max(0, u * (W - 1))), y = Math.min(Hh - 1.001, Math.max(0, v * (Hh - 1))), xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const a = H[yi * W + xi], b = H[yi * W + xi + 1], c = H[(yi + 1) * W + xi], e = H[(yi + 1) * W + xi + 1]; return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy; };
  const per = 4;
  for (let k = 0; k < sides; k++) {
    const tc = phase + ((k + 0.5) * 2 * Math.PI) / sides, nx = Math.sin(tc), nz = Math.cos(tc), tx = Math.cos(tc), tz = -Math.sin(tc), base = P.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv, uu = (s * per) % 1, h = (i === 0 || i === nu || j === 0 || j === nv) ? 0 : hAt(uu === 0 && s > 0 ? 1 : uu, 1 - t);
      const off = A + d * (h - 0.25), x = -half + 2 * half * s, y = y0 + (y1 - y0) * t;
      P.push(nx * off + tx * x, y, nz * off + tz * x);
      const g = 0.5 + 0.5 * Math.min(1, h * 1.3); C.push(g, g, g * 0.98);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1; I.push(a, b, e, a, e, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
export const FOUNT = { wl: 0.30, floor: -0.25, rim: 0.45, base: { R: 2.515, top: 0.85 }, cols: { r: 2.02, top: 1.95 }, lower: { R: 2.75, rim: 2.55 },
  plinth: { R: 1.0, top: 3.1 }, rock: 3.35, upper: { R: 1.45, bot: 4.9, rim: 5.35 }, feet: 5.75, angel: 2.44 };
// the lower and upper basins' water over the pool's (the ring meshes below: Y(LB.rim - 0.1), Y(UBs.rim - 0.035))
const LB_REL = (F) => F.lower.rim - 0.1, UB_REL = (F) => F.upper.rim - 0.035;
export function buildFountain(G, L, o) {
  const M = mats(), FG = new THREE.Group(), yl = L.low, F = FOUNT;
  FG.name = 'cp32b:fountain';
  G.add(FG);
  const R = PLAN.basinR, Ri = R - 0.62, rimTop = yl + F.rim, wl = yl + F.wl, floor = yl + F.floor, seg = 128;
  const part = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; FG.add(m); return m; };
  const Y = (h) => wl + h;
  // CP33: the lower basin's eight streams leave its corner spouts at vs m/s and land rS + vs tS from the axis (below); the pool's ring
  // waves and foam are centred on that circle (they sat at the old curtain's 3.1 m)
  const fallT = (h, v0) => (-v0 + Math.sqrt(v0 * v0 + 19.62 * h)) / 9.81;
  const vs = 1.05, rS = F.lower.R + 0.15, ys = Y(F.lower.rim - 0.11), Hs = ys - wl, tS = fallT(Hs, 0.15), landR = CP33B ? rS + vs * tS : F.lower.R + 0.35;
  // the pool's rim: the outer face, the rounded coping people sit on, the inner face down to the floor
  part(lathe([[R + 0.02, yl - 0.2], [R + 0.02, yl + 0.05], [R + 0.08, yl + 0.09], [R + 0.08, yl + 0.14], [R, yl + 0.17], [R, rimTop - 0.08], [R + 0.03, rimTop - 0.03], [R, rimTop], [Ri + 0.04, rimTop], [Ri, rimTop - 0.04], [Ri, wl - 0.05], [Ri - 0.02, floor]], seg), M.gran);
  const floorG = new THREE.CircleGeometry(Ri, 64); floorG.rotateX(-Math.PI / 2); floorG.translate(0, floor, 0); part(floorG, M.granD, false);
  // the fountain as the pools see it (m over each one's water): the veils, the rock, the angel and her wings
  const LBW = LB_REL(F), UBW = UB_REL(F);
  // CP33: the lower basin (eight streams now, the stone between them) is left out of the pool's mirror (review t4Crane:
  // its veil cylinder drew a dark slab wider than the basin); the scanned angel's wings are folded behind her, 1 m across
  const tiersOver = (h0) => [CP33B ? [0, 0, 0, 0] : [F.lower.R + 0.25, 0 - h0, F.lower.rim + 0.01 - h0, 0], [F.upper.R + 0.2, F.lower.rim - 0.1 - h0, F.upper.rim + 0.02 - h0, 0],
    [0.6, F.upper.rim - 0.3 - h0, F.feet - h0, 1], [0.36, F.feet - h0, F.feet + F.angel - h0, 1]].filter((t) => t[2] > 0.02).map((t) => [t[0], Math.max(0, t[1]), t[2], t[3]]);
  const wingOver = (h0) => CP33B ? [0.25, 0.5, F.feet + 1.1 - h0, F.feet + 2.35 - h0] : [0.25, 1.55, F.feet + 1.7 - h0, F.feet + 2.1 - h0];
  const poolAt = { c: C0, ax: [NA[0], NA[1], EB[0], EB[1]], probeY: wl + 1.6, ell: [150, 52, 32], col: [0.026, 0.042, 0.038] };
  const poolMat = CPFW ? cpPoolWaterMat({ ...poolAt, name: 'cp32b:pool', level: wl, rimR: Ri, pedR: F.base.R, depth: F.wl - F.floor, cope: rimTop - wl, amp: 0.045, bed: 0.09, lam: 0.3,
    ring: { impR: landR, amp: 0.06, k: 14, chop: 0.8 }, foam: { s: 1, in: 0.6, out: 1.1 }, tiers: tiersOver(0), wing: wingOver(0) }) : waterMat(9);
  const setPool = !CPFW && FW25 ? poolRings(poolMat, { impR: F.lower.R + 0.35, amp: FW26 ? 0.06 : 0.12, k: 14, foam: 1, foamIn: 0.6, foamOut: 1.1,
    basin: { R: Ri, depth: 2.4, ped: F.base.R, veilR: F.lower.R + 0.2, veilH: F.lower.rim, copeH: rimTop - wl, floor: 0.05, chop: 0.8 } }) : null;   // the floor's albedo low: the pool reads dark green-grey from the terrace, as it does
  if (setPool) setPool(C0[0], C0[1]);
  const poolG = new THREE.RingGeometry(F.base.R - 0.05, Ri + 0.01, seg, 1); poolG.rotateX(-Math.PI / 2); poolG.translate(0, wl, 0);
  const pool = part(poolG, poolMat, false);
  // the octagonal base: a plain block in the water, a carved frieze band, a moulded top
  const oct = (r, y0, y1, mat, cast = true) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1); g.rotateY(Math.PI / 8); g.translate(0, (y0 + y1) / 2, 0); return part(g, mat, cast); };
  const LB = F.lower;
  let lobe = (x, z) => { const an = Math.atan2(z, x); return 1 + 0.06 * Math.cos(an * 8); };
  if (CP33B) {
    // CP33 (the photographs): the base a dark granite octagon with arrised edges and a moulded top over a carved frieze
    // (Mould's scroll as real relief, 3.5 cm deep); eight pink-red granite columns on the corners with bronze bases and
    // capitals round a granite drum; the lower basin an octagonal pink-tan bowl (its corners over the columns) with a
    // bronze rim and a bronze spout at each corner
    const A = F.base.R, yb = Y(F.base.top);
    part(octLathe([[A + 0.02, floor], [A + 0.02, Y(-0.06)], [A, Y(0.0)], [A, yb - 0.5], [A + 0.025, yb - 0.475], [A + 0.025, yb - 0.45], [A - 0.05, yb - 0.43]]), M.granDk);
    part(friezeBand(A - 0.05, yb - 0.45, yb - 0.12, 0.035), M.carvedDk);
    part(octLathe([[A - 0.06, yb - 0.13], [A + 0.0, yb - 0.115], [A + 0.05, yb - 0.09], [A + 0.07, yb - 0.05], [A + 0.07, yb - 0.02], [A + 0.05, yb], [A - 0.1, yb + 0.005], [F.cols.r + 0.3, yb + 0.01], [F.cols.r + 0.29, yb + 0.1], [F.cols.r + 0.2, yb + 0.11], [0.001, yb + 0.11]]), M.granDk);
    lobe = (x, z) => { const an = Math.atan2(z, x), q = Math.PI / 4, d = ((((an - Math.PI / 8) % q) + q) % q) - Math.PI / 8; return Math.cos(Math.PI / 8) / Math.cos(d); };
  } else oct(F.base.R / Math.cos(Math.PI / 8), floor, Y(F.base.top - 0.45), M.sandD);
  if (CP33B) {
    const colH = F.cols.top - F.base.top - 0.11, y0 = Y(F.base.top + 0.11);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2 + Math.PI / 8, cx = Math.sin(t) * F.cols.r, cz = -Math.cos(t) * F.cols.r;
      const base = lathe([[0.001, 0], [0.2, 0], [0.2, 0.05], [0.19, 0.065], [0.185, 0.08], [0.17, 0.095], [0.15, 0.11], [0.15, 0.13], [0.135, 0.145], [0.125, 0.16], [0.001, 0.16]], 40);
      const shaft = lathe([[0.001, 0.15], [0.124, 0.15], [0.122, 0.3], [0.113, colH - 0.28], [0.112, colH - 0.2], [0.001, colH - 0.2]], 40);
      const cap = lathe([[0.001, colH - 0.21], [0.13, colH - 0.21], [0.135, colH - 0.19], [0.122, colH - 0.17], [0.15, colH - 0.12], [0.19, colH - 0.07], [0.215, colH - 0.04], [0.215, colH], [0.001, colH]], 40);
      for (const [g, m] of [[base, M.bronze], [shaft, M.granRed], [cap, M.bronze]]) { g.translate(cx, y0, cz); part(g, m); }
    }
    part(lathe([[0.001, y0 - 0.01], [0.95, y0 - 0.01], [0.95, Y(F.cols.top) + 0.02], [0.001, Y(F.cols.top) + 0.02]], 64), M.granDk);
    // the bowl: the rim's circumradius LB.R (corner), plan octagonal (lobe() above); a bead under the rim, the rim in bronze
    const lbG = lathe([[0.9, Y(F.cols.top)], [1.9, Y(F.cols.top + 0.05)], [2.42, Y(F.cols.top + 0.22)], [LB.R - 0.08, Y(LB.rim - 0.36)], [LB.R - 0.02, Y(LB.rim - 0.3)], [LB.R + 0.02, Y(LB.rim - 0.27)], [LB.R + 0.02, Y(LB.rim - 0.22)], [LB.R - 0.01, Y(LB.rim - 0.19)], [LB.R - 0.01, Y(LB.rim - 0.08)], [LB.R - 0.2, Y(LB.rim - 0.08)], [LB.R - 0.22, Y(LB.rim - 0.14)], [1.6, Y(LB.rim - 0.3)], [0.001, Y(LB.rim - 0.32)]], 96);
    const lp = lbG.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); if (r > 1.0) { const k = lobe(x, z); lp.setX(i, x * k); lp.setZ(i, z * k); } }
    lbG.computeVertexNormals(); part(lbG, M.basinTan);
    const rimG = lathe([[LB.R + 0.005, Y(LB.rim - 0.09)], [LB.R + 0.035, Y(LB.rim - 0.075)], [LB.R + 0.045, Y(LB.rim - 0.04)], [LB.R + 0.03, Y(LB.rim - 0.008)], [LB.R + 0.0, Y(LB.rim)], [LB.R - 0.12, Y(LB.rim + 0.002)], [LB.R - 0.2, Y(LB.rim - 0.02)], [LB.R - 0.215, Y(LB.rim - 0.09)]], 96);
    const rp2 = rimG.attributes.position;
    for (let i = 0; i < rp2.count; i++) { const x = rp2.getX(i), z = rp2.getZ(i), k = lobe(x, z); rp2.setX(i, x * k); rp2.setZ(i, z * k); }
    rimG.computeVertexNormals(); part(rimG, M.bronze);
    for (let k = 0; k < 8; k++) {   // the spouts: a bronze lip at each corner, the stream's source
      const t = (k / 8) * Math.PI * 2 + Math.PI / 8, sp = lathe([[0.001, 0], [0.055, 0.0], [0.07, 0.06], [0.06, 0.16], [0.045, 0.2], [0.001, 0.2]], 24, 0, Math.PI * 2);
      sp.rotateX(Math.PI / 2 + 0.25); sp.rotateY(Math.PI - t);
      sp.translate(Math.sin(t) * (LB.R - 0.04), Y(LB.rim - 0.06), -Math.cos(t) * (LB.R - 0.04));
      part(sp, M.bronze, false);
    }
  }
  if (!CP33B) {
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
  const lbG = lathe([[0.9, Y(F.cols.top)], [1.9, Y(F.cols.top + 0.05)], [2.45, Y(F.cols.top + 0.25)], [LB.R - 0.06, Y(LB.rim - 0.3)], [LB.R + 0.04, Y(LB.rim - 0.18)], [LB.R + 0.02, Y(LB.rim - 0.05)], [LB.R - 0.04, Y(LB.rim)], [LB.R - 0.2, Y(LB.rim)], [LB.R - 0.22, Y(LB.rim - 0.14)], [1.6, Y(LB.rim - 0.3)], [0.001, Y(LB.rim - 0.32)]], 96);
  const lp = lbG.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); if (r > 1.8) { const k = lobe(x, z); lp.setX(i, x * k); lp.setZ(i, z * k); } }
  lbG.computeVertexNormals(); part(lbG, M.sandL);
  }
  const lbw = CPFW ? cpPoolWaterMat({ ...poolAt, name: 'cp32b:lowerBasin', level: wl + LBW, rimR: LB.R - 0.25, pedR: F.plinth.R, depth: 0.28, cope: 0.1, amp: 0.03, bed: 0.2, lam: 0.22,
    ring: { impR: F.upper.R + 0.3, amp: 0.05, k: 18, chop: 0.8 }, foam: { s: 0.8, in: 0.5, out: 1.6 }, tiers: tiersOver(LBW).filter((t) => t[0] < 2), wing: wingOver(LBW) }) : waterMat(3);
  const setLB = !CPFW && FW25 ? poolRings(lbw, { impR: F.upper.R + 0.3, amp: 0.05, k: 18, foam: 0.8, foamIn: 0.5, foamOut: 1.6, basin: { R: LB.R - 0.25, depth: 0.28, ped: F.plinth.R, veilR: F.upper.R + 0.12, veilH: F.upper.rim - LB.rim + 0.1, copeH: 0.1, floor: 0.2, chop: 0.8 } }) : null;
  if (setLB) setLB(C0[0], C0[1]);
  const lwG = new THREE.RingGeometry(F.plinth.R - 0.02, LB.R - 0.2, 96, 1); lwG.rotateX(-Math.PI / 2); lwG.translate(0, Y(LB.rim - 0.1), 0);
  const lwp = lwG.attributes.position; for (let i = 0; i < lwp.count; i++) { const x = lwp.getX(i), z = lwp.getZ(i); if (Math.hypot(x, z) > 1.8) { const k = lobe(x, z); lwp.setX(i, x * k); lwp.setZ(i, z * k); } }
  const lowerPool = part(lwG, lbw, false);
  // the plinth (dark stone, a pale cap), the rock mound, the bronze stem
  if (CP33B) {
    const P0 = F.plinth.R, ya = Y(LB.rim - 0.3), yt = Y(F.plinth.top);
    part(octLathe([[P0, ya], [P0, yt - 0.14], [P0 + 0.02, yt - 0.125], [P0 + 0.02, yt - 0.1], [P0 + 0.06, yt - 0.08], [P0 + 0.075, yt - 0.04], [P0 + 0.06, yt - 0.005], [P0 + 0.03, yt], [0.001, yt]]), M.granDk);
    const mound = rockGeo(0.98, F.rock - F.plinth.top + 0.02, 0.98, 7, 6); mound.translate(0, yt - 0.02, 0);
    const mp = mound.attributes.position; for (let i = 0; i < mp.count; i++) if (mp.getY(i) < yt - 0.02) mp.setY(i, yt - 0.02 - (yt - 0.02 - mp.getY(i)) * 0.05);
    mound.computeVertexNormals(); part(mound, M.bronzeD);
    part(lathe([[0.001, Y(F.rock - 0.1)], [0.34, Y(F.rock - 0.1)], [0.31, Y(F.rock + 0.1)], [0.29, Y(F.rock + 0.35)], [0.25, Y(F.upper.bot - 0.62)], [0.27, Y(F.upper.bot - 0.56)], [0.25, Y(F.upper.bot - 0.5)], [0.27, Y(F.upper.bot - 0.38)], [0.33, Y(F.upper.bot - 0.22)], [0.41, Y(F.upper.bot - 0.08)], [0.45, Y(F.upper.bot)], [0.001, Y(F.upper.bot)]], 48), M.bronzeD);
  } else {
  oct(F.plinth.R / Math.cos(Math.PI / 8), Y(LB.rim - 0.3), Y(F.plinth.top - 0.1), M.sandD);
  oct(F.plinth.R / Math.cos(Math.PI / 8) + 0.06, Y(F.plinth.top - 0.1), Y(F.plinth.top), M.sandL);
  const rock = new THREE.SphereGeometry(0.95, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); rock.scale(1, (F.rock - F.plinth.top) / 0.95, 1); rock.translate(0, Y(F.plinth.top), 0);
  const rp = rock.attributes.position; for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), n = 1 + 0.08 * Math.sin(x * 7.1 + z * 3.3) + 0.05 * Math.sin(z * 11 - x * 4); rp.setX(i, x * n); rp.setZ(i, z * n); }
  rock.computeVertexNormals(); part(rock, M.bronzeD);
  part(lathe([[0.001, Y(F.rock - 0.1)], [0.34, Y(F.rock - 0.1)], [0.3, Y(F.rock + 0.4)], [0.24, Y(F.upper.bot - 0.5)], [0.3, Y(F.upper.bot - 0.25)], [0.45, Y(F.upper.bot)], [0.001, Y(F.upper.bot)]], 20), M.bronzeD);
  }
  // the four cherubs on the rock at the diagonals, facing out
  const cherubMasses = [];
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2, r = 0.62;
    const c = part(cherubGeo(k), M.bronze);
    c.scale.setScalar(1.1);
    c.position.set(Math.sin(t) * r, Y(F.rock - 0.06), -Math.cos(t) * r);
    c.rotation.y = Math.PI - t;
    cherubMasses.push(c);
  }
  // CP33: the scanned putti (two hands, 70k / 12k / 2.5k triangles to 22 m / 60 m / beyond) take the mass models' places once
  // they have loaded, their fish's head pointing out from the stem
  if (CP33B) cherubScan().then(({ A, B, mat }) => {
    for (let k = 0; k < 4; k++) {
      const t = Math.PI / 4 + (k * Math.PI) / 2, r = 0.74, lod = new THREE.LOD(); lod.name = 'cp33b:cherub' + k;
      (k % 2 ? B : A).forEach((g, i) => { if (!g) return; const m = new THREE.Mesh(g, mat); m.castShadow = i < 2; m.receiveShadow = true; m.name = `cp33b:cherub${k}L${i}`; lod.addLevel(m, [0, 22, 60][i]); });
      lod.position.set(Math.sin(t) * r, Y(F.rock - 0.17), -Math.cos(t) * r);
      lod.rotation.y = Math.PI - t;
      FG.add(lod); cherubMasses[k].visible = false;
    }
  }).catch((e) => console.warn('[cp33b] the cherub scan is unavailable; the mass models stay', e));
  // the upper basin: a broad bronze saucer with a gadrooned rim
  const UBs = F.upper, ubG = lathe([[0.4, Y(UBs.bot)], [0.9, Y(UBs.bot + 0.12)], [1.25, Y(UBs.rim - 0.22)], [UBs.R, Y(UBs.rim - 0.12)], [UBs.R + 0.05, Y(UBs.rim - 0.04)], [UBs.R, Y(UBs.rim)], [UBs.R - 0.12, Y(UBs.rim - 0.01)], [UBs.R - 0.14, Y(UBs.rim - 0.1)], [0.8, Y(UBs.rim - 0.2)], [0.001, Y(UBs.rim - 0.2)]], 96);
  const up2 = ubG.attributes.position; for (let i = 0; i < up2.count; i++) { const x = up2.getX(i), z = up2.getZ(i), r = Math.hypot(x, z); if (r > UBs.R - 0.2) { const k = 1 + 0.018 * Math.cos(Math.atan2(z, x) * 40); up2.setX(i, x * k); up2.setZ(i, z * k); } }
  ubG.computeVertexNormals(); part(ubG, M.bronze);
  const ubw = CPFW ? cpPoolWaterMat({ ...poolAt, name: 'cp32b:upperBasin', level: wl + UBW, rimR: UBs.R - 0.14, pedR: 0.45, depth: 0.15, cope: 0.03, amp: 0.025, bed: 0.12, lam: 0.16,
    ring: { impR: 0.45, amp: 0.04, k: 22, chop: 0.5 }, foam: { s: 0.5, in: 0.4, out: 2.4 }, tiers: tiersOver(UBW).filter((t) => t[0] < 1), wing: wingOver(UBW) }) : waterMat(1.6);
  const setUB = !CPFW && FW25 ? poolRings(ubw, { impR: 0.45, amp: 0.04, k: 22, foam: 0.5, foamIn: 0.4, foamOut: 2.4, basin: { R: UBs.R - 0.14, depth: 0.15, ped: 0.45, copeH: 0.03, floor: 0.2, chop: 0.5 } }) : null;
  if (setUB) setUB(C0[0], C0[1]);
  const uwG = new THREE.RingGeometry(0.42, UBs.R - 0.13, 72, 1); uwG.rotateX(-Math.PI / 2); uwG.translate(0, Y(UBs.rim - 0.035), 0); part(uwG, ubw, false);
  // the rock the angel alights on
  if (CP33B) {   // CP33: a smooth cast rock, its top broad enough for the scanned figure's hem (0.6 x 0.5 m)
    const rk = rockGeo(0.6, (F.feet - UBs.rim + 0.3) / 2, 0.55, 3, 6); rk.translate(0, Y(UBs.rim + (F.feet - UBs.rim) / 2 - 0.12), 0);
    part(rk, M.bronzeD);
  } else {
  const rk = new THREE.DodecahedronGeometry(0.55, 1); rk.scale(1, (F.feet - UBs.rim + 0.25) / 1.1, 1); rk.translate(0, Y(UBs.rim + (F.feet - UBs.rim) / 2 - 0.1), 0);
  const rkp = rk.attributes.position; for (let i = 0; i < rkp.count; i++) { const x = rkp.getX(i), z = rkp.getZ(i), n = 1 + 0.1 * Math.sin(x * 9 + z * 5); rkp.setX(i, x * n); rkp.setZ(i, z * n); }
  rk.computeVertexNormals(); part(rk, M.bronzeD);
  }
  // the angel, 8'7": her front to the south, toward the Arcade and the Mall (the photographs from the terrace)
  const ang = part(angelGeo(), M.bronze);
  ang.position.set(0, Y(F.feet - 0.05), 0);
  ang.scale.setScalar(F.angel / 2.15);
  ang.rotation.y = 0;
  // CP33: the scanned figure (three LODs: 220k triangles to 55 m, 50k to 150 m, 19k beyond) takes the mass model's
  // place once it has loaded; the mass model stays if it cannot load
  if (CP33B) angelScan().then(({ geos, mat }) => {
    const lod = new THREE.LOD(); lod.name = 'cp33b:angel';
    geos.forEach((g, i) => { if (!g) return; const m = new THREE.Mesh(g, mat); m.castShadow = i < 2; m.receiveShadow = true; m.name = 'cp33b:angelL' + i; lod.addLevel(m, [0, 55, 150][i]); });
    lod.position.set(0, Y(F.feet - 0.03), 0);
    FG.add(lod); ang.visible = false;
  }).catch((e) => console.warn('[cp33b] the angel scan is unavailable; the mass model stays', e));
  // the water: a sheet off the upper basin's rim into the lower basin, another off the lower basin's lobes into the pool
  const veil = (r0, y0, y1, spread, lob, key) => {
    const H = y0 - y1, pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([r0 + spread * Math.sqrt(t), y0 - H * t]); }
    const g = lathe(pts, 128);
    if (lob) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = lobe(x, z); p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); }
    const vm = veilMat(FW27 ? { y0, dir: 1, v0: 0.35, tMax: fallT(H, 0.35), aer: [0.3, 0.95], holes: 0.45, body: 0.2, freq: 7 } : { y0, dir: 1, v0: 0.35, tMax: fallT(H, 0.35), aer: [0.4, 1.0], holes: 0.5, body: 0.26, freq: 5 }, LT);
    const m = part(g, vm, false); m.renderOrder = 2; m.name = key;
  };
  // CP33 (the photographs): the upper basin's water leaves the gadrooned rim as a fringe that breaks into drops within a
  // few centimetres; the lower basin pours from its eight corner spouts as separate streams that thicken and aerate
  if (FW26 && CP33B) {
    const H = Y(UBs.rim + 0.02) - Y(LB.rim - 0.1), pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([UBs.R + 0.05 + 0.32 * Math.sqrt(t), Y(UBs.rim + 0.02) - H * t]); }
    const vmU = veilMat({ y0: Y(UBs.rim + 0.02), dir: 1, v0: 0.3, tMax: fallT(H, 0.3), aer: [0.1, 0.7], holes: 0.8, body: 0.22, freq: 11, tear0: 0.0 }, LT);
    const mu = part(lathe(pts, 192), vmU, false); mu.renderOrder = 2; mu.name = 'cp32b:veilUpper';
    const vmL = veilMat({ y0: ys, dir: 1, v0: 0.15, tMax: tS, aer: [0.22, 0.9], holes: 0.32, body: 0.34, freq: 9, tear0: 0.3 }, LT);
    const tubes = [];
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2 + Math.PI / 8, ox = Math.sin(t), oz = -Math.cos(t), P = [];
      for (let i = 0; i <= 16; i++) { const tt = (i / 16) * tS, r = rS + vs * tt, y = ys - 0.15 * tt - 4.905 * tt * tt; P.push(new THREE.Vector3(ox * r, Math.max(y, wl - 0.04), oz * r)); }
      const curve = new THREE.CatmullRomCurve3(P), nu = 40, nr = 14, tg = new THREE.TubeGeometry(curve, nu, 1, nr, false), tp = tg.attributes.position, c = new THREE.Vector3();
      for (let i = 0; i <= nu; i++) {
        curve.getPointAt(i / nu, c);
        const f = i / nu, rad = 0.042 + 0.05 * f * f, flat = 1 + 0.5 * f;   // 4 cm at the spout to 9 cm, spreading across
        for (let j = 0; j <= nr; j++) { const v = i * (nr + 1) + j; tp.setXYZ(v, c.x + (tp.getX(v) - c.x) * rad * flat, c.y + (tp.getY(v) - c.y) * rad, c.z + (tp.getZ(v) - c.z) * rad * flat); }
      }
      tg.deleteAttribute('uv'); tg.computeVertexNormals(); tubes.push(tg);
    }
    const ml = part(mergeGeometries(tubes, false), vmL, false); ml.renderOrder = 2; ml.name = 'cp32b:veilLower';
  } else if (FW26) {
    veil(UBs.R + 0.05, Y(UBs.rim + 0.02), Y(LB.rim - 0.1), 0.32, false, 'cp32b:veilUpper');
    veil(LB.R + 0.04, Y(LB.rim + 0.01), wl, 0.42, true, 'cp32b:veilLower');
  }
  if (FW25) {
    FG.add(fountainSpray({ lipR: UBs.R + 0.05, lipY: Y(UBs.rim + 0.02), wl: Y(LB.rim - 0.1), impR: UBs.R + 0.33, jetY: Y(UBs.rim - 0.03), jetH: 0.25, bowlY: Y(UBs.rim - 0.03), bowlR: UBs.R - 0.3, seed: 1873, sheet: CP33B ? 3400 : 1400, splash: 1200, jet: 200, bowl: 300, mist: 200 }));
    FG.add(fountainSpray(CP33B ? { lipR: rS, lipY: ys, wl, impR: rS + vs * tS, jetY: Y(LB.rim - 0.1), jetH: 0.05, bowlY: Y(LB.rim - 0.1), bowlR: LB.R - 0.4, seed: 1874, sheet: 900, splash: 1500, jet: 0, bowl: 200, mist: 260, spouts: 8, spA0: Math.PI / 8, spW: 0.03 }
      : { lipR: LB.R + 0.06, lipY: Y(LB.rim + 0.01), wl, impR: LB.R + 0.45, jetY: Y(LB.rim - 0.1), jetH: 0.05, bowlY: Y(LB.rim - 0.1), bowlR: LB.R - 0.4, seed: 1874, sheet: 2200, splash: 2000, jet: 50, bowl: 200, mist: 300 }));
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
  const wm = CPFW ? cpPoolWaterMat({ name: 'cp32b:cherryBasin', c: [CHERRY.x, CHERRY.z], level: 0.45, rimR: Ri, pedR: 0.5, depth: 0.37, cope: 0.17, amp: 0.012, bed: 0.12, lam: 0.3,
    ring: { impR: 1.3, amp: 0.04, k: 16, chop: 0.6 }, foam: { s: 0.7, in: 0.4, out: 1.8 } }) : waterMat(2);
  const wg = new THREE.RingGeometry(0.5, Ri + 0.01, 64, 1); wg.rotateX(-Math.PI / 2); wg.translate(0, 0.45, 0); part(wg, wm, false);
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
