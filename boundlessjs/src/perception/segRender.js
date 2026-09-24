// PERCEPTION OUTPUT — automatic detection / segmentation ground truth.
//
// Design, class table and exporter usage: docs/notes/perception.md
//
//   ?seg=semantic     class colour per pixel
//   ?seg=instance     24-bit instance code per pixel (stuff = 0)
//   ?seg=depth        viridis linear depth
//   ?seg=depthraw     24-bit linear depth (R = high byte)
//
// The whole module is a MATERIAL OVERRIDE PASS: nothing in the world is
// re-authored, every mesh keeps its geometry and its place in the scene graph,
// and each one is temporarily given a flat-id ShaderMaterial that writes the
// exact byte the label needs. Post-processing is bypassed (the engine's
// `segRender` hook renders the scene directly) so labels are crisp — no AA, no
// bloom, no haze, no tone mapping. A custom fragment shader also means three
// appends neither the tone-map nor the colour-space chunk, so `byte/255` lands
// on that exact byte.
//
// Per-pixel identity comes from what the world already carries:
//   ground        `matId` attribute            (materials.js:1219 documents ids)
//   tile facades  `aBid` attribute             (assemble.js GeoBuf)
//   dressed bldgs vertex ranges recovered from nycDress TileMerges / PartPools
//   hero trims    vertex ranges from heroFacades' StaticPool handles
//   props/trees   the instancer's per-instance `cols` -> `instanceColor`
//   vehicles      traffic pool instance slots (moving) / position hash (parked)
//
// AMODAL masks use a "solo" pass: the camera is switched to a scratch layer
// that only the target instance's meshes are on, and every override material
// discards fragments whose code != uSoloCode. Only that instance's fragments
// are ever written, so the depth test runs against the instance ALONE — its
// full silhouette, occluders gone, self-occlusion still correct.
import * as THREE from 'three';
import { CROWD_SEG_PARS, CROWD_SEG_APPLY } from '../sim/crowd.js';
import { ENV, FAR_UNIFORMS } from '../world/materials.js';
import { unproject } from '../shared/geo.js';

// ---------------------------------------------------------------- constants
const SOLO_LAYER = 7;                 // nothing else in the project uses layer 7
export const ID_MUL = 3635641;        // 0x3779B9, odd -> bijective mod 2^24
export const ID_INV = 5029001;        // 0x4CBC89, ID_MUL * ID_INV == 1 mod 2^24
export const ID_MOD = 1 << 24;
export const encodeId = (id) => (id * ID_MUL) % ID_MOD;
export const decodeCode = (code) => (code * ID_INV) % ID_MOD;

// Class table — docs/notes/perception.md §3.  [id, name, r, g, b, isThing]
//
// The Cityscapes-canonical entries (sky, building, road, sidewalk, terrain,
// vegetation, car/bus/truck/bicycle/person, traffic light, traffic sign, pole)
// keep their published colours so the frames read to anyone who has looked at a
// Cityscapes overlay. Every OTHER colour was placed by a search that maximises
// the minimum L1 distance to the whole palette inside a semantically-right hue
// box, because the first hand-picked table had `crosswalk` and `traffic_signal`
// on the SAME rgb and five more pairs under L1 45 — which is illegible in a
// video panel and, worse, quietly ambiguous. Every pair is now >= L1 80 apart
// except the two canonical ones (unlabeled/truck 70, car/truck 72).
const CLASS_ROWS = [
  [0, 'unlabeled', 0, 0, 0, 0],
  [1, 'sky', 70, 130, 180, 0],
  [2, 'building', 70, 70, 70, 1],
  [3, 'road', 128, 64, 128, 0],
  [4, 'sidewalk', 244, 35, 232, 0],
  [5, 'curb', 170, 0, 180, 0],
  [6, 'road_marking', 255, 255, 255, 0],
  [7, 'crosswalk', 0, 250, 250, 0],
  [8, 'lane_marking_yellow', 250, 255, 100, 0],
  [9, 'bike_lane', 0, 230, 60, 0],
  [10, 'bus_lane', 180, 80, 20, 0],
  [11, 'gutter', 60, 20, 190, 0],
  [12, 'detectable_warning', 200, 140, 0, 0],
  [13, 'plaza', 170, 150, 70, 0],
  [14, 'footpath', 230, 200, 180, 0],
  [15, 'terrain', 152, 251, 152, 0],
  [16, 'grass', 40, 180, 10, 0],
  [17, 'vegetation', 107, 142, 35, 1],
  [18, 'water', 30, 80, 160, 0],
  [19, 'car', 0, 0, 142, 1],
  [20, 'bus', 0, 60, 100, 1],
  [21, 'truck', 0, 0, 70, 1],
  [22, 'bicycle', 119, 11, 32, 1],
  [23, 'pedestrian', 220, 20, 60, 1],
  [24, 'traffic_signal', 250, 170, 30, 1],
  [25, 'pedestrian_signal', 210, 90, 190, 1],
  [26, 'street_sign', 220, 220, 0, 1],
  [27, 'street_light', 153, 153, 153, 1],
  [28, 'hydrant', 230, 110, 80, 1],
  [29, 'street_furniture', 140, 100, 250, 1],
  [30, 'bus_shelter', 90, 220, 220, 1],
  [31, 'subway_entrance', 110, 0, 250, 1],
  [32, 'scaffold', 210, 180, 90, 1],
  [33, 'building_appurtenance', 120, 70, 0, 1],
  [34, 'roof_structure', 120, 160, 210, 1],
  [35, 'bridge', 20, 170, 120, 0],
];
export const CLASSES = CLASS_ROWS.map(([id, name, r, g, b, t]) => ({ id, name, rgb: [r, g, b], isthing: !!t }));
const CID = {};
for (const c of CLASSES) CID[c.name] = c.id;
const CLASS_BY_ID = new Map(CLASSES.map((c) => [c.id, c]));
const CLS0 = CLASS_BY_ID.get(0);
const rgbCode = (cls) => { const c = CLASS_BY_ID.get(cls) || CLS0; return c.rgb[0] | (c.rgb[1] << 8) | (c.rgb[2] << 16); };
const isThing = (cls) => !!(CLASS_BY_ID.get(cls) && CLASS_BY_ID.get(cls).isthing);

// classes the amodal solo pass measures
const AMODAL_CLASSES = new Set([
  CID.car, CID.bus, CID.truck, CID.bicycle, CID.traffic_signal, CID.pedestrian_signal,
  CID.hydrant, CID.street_sign, CID.vegetation, CID.building, CID.pedestrian, CID.street_light,
]);

// matId (ground shader) -> class. materials.js:1219 + the assemble.js section list.
const MATID_CLASS = [
  CID.road,                 // 0 asphalt
  CID.sidewalk,             // 1 sidewalk flags
  CID.curb,                 // 2 curb face
  CID.road_marking,         // 3 white paint (crosswalk bars split out below)
  CID.lane_marking_yellow,  // 4 yellow paint
  CID.grass,                // 5
  CID.footpath,             // 6 park path
  CID.terrain,              // 7
  CID.terrain,              // 8 far carpet
  CID.bike_lane,            // 9 green paint
  CID.plaza,                // 10 brick / pavers
  CID.gutter,               // 11
  CID.bus_lane,             // 12 red bus lane
  CID.detectable_warning,   // 13 red composite dome plate
  CID.detectable_warning,   // 14 cast-iron dome plate
];
const CROSSWALK_KEY = 40;   // LUT slot for "matId 3 inside a crossing zone"
// matId 8 (the far ground carpet) gets its OWN key even though it shares the
// `terrain` colour, because the ground shader discards it inside nearR and the
// override has to do the same — and aSegKey is the only channel that reaches
// the fragment shader.
const FARCARPET_KEY = 41;

// instancer pool name -> class. Unknown pools fall back to street_furniture and
// are logged once so this table can be extended.
const POOL_EXACT = {
  lampCobra: CID.street_light, lampCrook: CID.street_light,
  hydrant: CID.hydrant,
  signalMast: CID.traffic_signal, sigR: CID.traffic_signal, sigA: CID.traffic_signal, sigG: CID.traffic_signal,
  // SG13: the mast is four pools now (docs/notes/signals-r13.md)
  signalArm: CID.traffic_signal, signalHead: CID.traffic_signal, signalLens: CID.traffic_signal,
  crossingBeacon: CID.traffic_signal,
  signalPed: CID.pedestrian_signal, pedHand: CID.pedestrian_signal, pedMan: CID.pedestrian_signal,
  streetSign: CID.street_sign, signPole: CID.street_sign, signPoleOneWay: CID.street_sign, warnsign: CID.street_sign,
  busShelter: CID.bus_shelter, newsstand: CID.bus_shelter, foodcart: CID.bus_shelter,
  subway: CID.subway_entrance,
  scaffold: CID.scaffold, viaductPier: CID.scaffold,
  awning: CID.building_appurtenance, marquee: CID.building_appurtenance,
  stoop: CID.building_appurtenance, standpipe: CID.building_appurtenance,
  fireEscape3: CID.building_appurtenance, fireEscape4: CID.building_appurtenance, fireEscape5: CID.building_appurtenance,
  curbRamp: CID.sidewalk, curbRampIron: CID.sidewalk, curbRampBare: CID.sidewalk,
  bike: CID.bicycle,
  linknyc: CID.street_furniture, treeFence: CID.street_furniture, bikeRack: CID.street_furniture,
  bench: CID.street_furniture, litter: CID.street_furniture, mailbox: CID.street_furniture,
  bollard: CID.street_furniture, newsbox: CID.street_furniture, cone: CID.street_furniture,
  conep: CID.street_furniture, dumpster: CID.street_furniture, barrier: CID.street_furniture,
  trashbag: CID.street_furniture, cbox: CID.street_furniture, phone: CID.street_furniture,
  planter: CID.street_furniture, parkingMeter: CID.street_furniture,
};
const ROOF_RE = /^(roof|vent|duct|cell|cable|mushroom|upblast|gooseneck|chimney|hatch|guardrail|davit|microwave|dish|dunnage|screenWall|sedum|pergola|sawtooth|mechPenthouse|pipeRun|monopole|coolingTower|solarPanel|waterTower|bulkhead|skylight|antenna)/i;
const _unknownPools = new Set();
function classifyPool(name) {
  if (/Glow$/.test(name)) return 0;                        // lamp / lens glows: not objects
  if (/^tree[A-Z]?\d*(Trunk|Crown)$/.test(name)) return CID.vegetation;
  if (name in POOL_EXACT) return POOL_EXACT[name];
  if (ROOF_RE.test(name)) return CID.roof_structure;
  if (!_unknownPools.has(name)) { _unknownPools.add(name); console.log('[perc] pool without a class:', name, '-> street_furniture'); }
  return CID.street_furniture;
}
function classifyVehicle(kind) {
  if (kind === 'bus' || kind === 'minibus') return CID.bus;   // PV2 fleet24: the Fuso Rosa shuttle
  if (/sprinter|ambulance|vwvan|van|truck|firetruck|carlacola|cybertruck/i.test(kind)) return CID.truck;
  return CID.car;
}
// nominal metric extents [w, h, l] (world/gt.js DIMS, extended over the fleet)
const VEH_DIMS = {
  bus: [2.5, 3.1, 11.5], sprinter: [2.1, 2.6, 6.0], ambulance: [2.3, 2.8, 6.6],
  vwvan: [2.0, 2.2, 5.2], van: [2.0, 2.2, 5.2], jeep: [2.0, 1.9, 4.8],
  tesla: [1.96, 1.44, 4.7], crown: [1.98, 1.5, 5.3], prius: [1.76, 1.47, 4.6],
  micra: [1.68, 1.46, 3.8], sedan: [1.95, 1.6, 4.7],
};

// ------------------------------------------------------------------ shaders
const VERT = /* glsl */ `
  #ifdef SEG_CROWD
  ${CROWD_SEG_PARS}
  #endif
  #if defined(SEG_KEY) || defined(SEG_HIDE)
    attribute float aSegKey;
    varying float vKey;
  #endif
  #ifdef SEG_FARCLIP
    varying vec3 vWPos;
  #endif
  #ifdef SEG_VCOL
    attribute vec3 aSegCol;
  #endif
  #ifdef SEG_CUTOUT
    varying vec2 vSegUv;
  #endif
  #ifdef SEG_SWAY
    uniform float uWindT; uniform float uWindA;
  #endif
  varying vec3 vCode;
  varying float vViewZ;
  void main() {
    vec3 tp = position;
    #ifdef SEG_CROWD
    ${CROWD_SEG_APPLY}
    #endif
    #ifdef SEG_SWAY
      // replica of the crown sway in instancer.crownMat, so the mask lines up
      // with the beauty frame instead of the un-swayed rest pose
      #ifdef USE_INSTANCING
        vec2 wrt = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 wrt = vec2(0.0);
      #endif
      float ph = fract(wrt.x * 0.171 + wrt.y * 0.113) * 6.283;
      float hgt = max(position.y - 1.6, 0.0);
      float bend = hgt * hgt * 0.0028 * uWindA;
      tp.xz += vec2(sin(uWindT * 1.05 + ph) * 0.8 + 0.35, cos(uWindT * 0.83 + ph * 1.31) * 0.6) * bend;
      tp += normal * (sin(uWindT * 4.2 + ph * 3.0 + position.y * 1.7) * 0.035 * uWindA * step(0.01, hgt));
    #endif
    vec4 mv;
    #ifdef USE_INSTANCING
      mv = modelViewMatrix * instanceMatrix * vec4(tp, 1.0);
    #else
      mv = modelViewMatrix * vec4(tp, 1.0);
    #endif
    vViewZ = -mv.z;
    #ifdef SEG_FARCLIP
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(tp, 1.0)).xyz;
      #else
        vWPos = (modelMatrix * vec4(tp, 1.0)).xyz;
      #endif
    #endif
    #if defined(SEG_KEY) || defined(SEG_HIDE)
      vKey = aSegKey;
    #endif
    #ifdef SEG_VCOL
      vCode = aSegCol;
    #elif defined(SEG_ICOL)
      #ifdef USE_INSTANCING_COLOR
        vCode = instanceColor;
      #else
        vCode = vec3(0.0);
      #endif
    #else
      vCode = vec3(0.0);
    #endif
    #ifdef SEG_CUTOUT
      vSegUv = uv;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  #ifdef SEG_CROWDHAIR
    precision highp sampler2DArray;
    uniform sampler2DArray uHairA;
    varying vec2 vUvA;
    varying float vLayer;
  #endif
  uniform vec3 uCode;
  uniform float uMode;        // 0 colour, 1 depth24, 2 depth viridis
  uniform float uSolo;
  uniform vec3 uSoloCode;
  uniform float uDepthMax;
  uniform float uVisFar;
  #ifdef SEG_KEY
    uniform sampler2D uLut; uniform float uLutW;
  #endif
  #if defined(SEG_KEY) || defined(SEG_HIDE)
    varying float vKey;
  #endif
  #ifdef SEG_HIDE
    uniform sampler2D uHideTex;
  #endif
  #ifdef SEG_FARCLIP
    varying vec3 vWPos;
    uniform vec2 uPlayerXZ; uniform float uNearR;
  #endif
  #ifdef SEG_CUTOUT
    uniform sampler2D uSegMap; uniform float uSegAlpha;
    varying vec2 vSegUv;
  #endif
  varying vec3 vCode;
  varying float vViewZ;
  vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.2670, 0.0049, 0.3294);
    vec3 c1 = vec3(0.2823, 0.1407, 0.4576);
    vec3 c2 = vec3(0.2540, 0.2650, 0.5299);
    vec3 c3 = vec3(0.1637, 0.4714, 0.5581);
    vec3 c4 = vec3(0.1340, 0.6588, 0.5176);
    vec3 c5 = vec3(0.4776, 0.8212, 0.3181);
    vec3 c6 = vec3(0.9932, 0.9062, 0.1439);
    float s = t * 6.0;
    if (s < 1.0) return mix(c0, c1, s);
    if (s < 2.0) return mix(c1, c2, s - 1.0);
    if (s < 3.0) return mix(c2, c3, s - 2.0);
    if (s < 4.0) return mix(c3, c4, s - 3.0);
    if (s < 5.0) return mix(c4, c5, s - 4.0);
    return mix(c5, c6, s - 5.0);
  }
  void main() {
    #ifdef SEG_CROWDHAIR
      if (texture(uHairA, vec3(vUvA, vLayer)).a < 0.35) discard;
    #endif
    #ifdef SEG_CUTOUT
      if (texture2D(uSegMap, vSegUv).a < uSegAlpha) discard;
    #endif
    #ifdef SEG_HIDE
      // the NYC dresser's per-building hide mask (materials.js:311/328): the
      // tile's shader facade is discarded for every building the dresser has
      // rebuilt, so the label must be discarded there too or the mask is the
      // union of the prism and the dressed walls
      { float b = floor(vKey + 0.5);
        if (texture2D(uHideTex, vec2((mod(b, 256.0) + 0.5) / 256.0, (floor(b / 256.0) + 0.5) / 256.0)).r > 0.5) discard; }
    #endif
    #ifdef SEG_FARCLIP
      // the macro LOD city and the far ground carpet PHYSICALLY OVERLAP the
      // near ring and are discarded inside nearR by their own shaders
      // (materials.js:1308 and :2322). Without this the macro blocks paint
      // the building class over the sky at 30-45 m — which is exactly what the
      // first signal-mast validation frame showed: 0 sky px, 59 % building.
      #ifdef SEG_KEY
        if (floor(vKey + 0.5) == 41.0 && distance(vWPos.xz, uPlayerXZ) < uNearR) discard;
      #else
        if (distance(vWPos.xz, uPlayerXZ) < uNearR) discard;
      #endif
    #endif
    vec3 c;
    #ifdef SEG_KEY
      c = texture2D(uLut, vec2((floor(vKey + 0.5) + 0.5) / uLutW, 0.5)).rgb;
    #elif defined(SEG_VCOL) || defined(SEG_ICOL)
      c = vCode;
    #else
      c = uCode;
    #endif
    if (uSolo > 0.5) {
      vec3 b = floor(c * 255.0 + 0.5);
      vec3 s = floor(uSoloCode * 255.0 + 0.5);
      if (any(greaterThan(abs(b - s), vec3(0.5)))) discard;
    }
    if (uMode > 1.5) {
      gl_FragColor = vec4(viridis(vViewZ / uVisFar), 1.0);
    } else if (uMode > 0.5) {
      float d = clamp(vViewZ / uDepthMax, 0.0, 1.0) * 16777215.0;
      float b2 = floor(d / 65536.0);
      float b1 = floor((d - b2 * 65536.0) / 256.0);
      float b0 = floor(d - b2 * 65536.0 - b1 * 256.0);
      gl_FragColor = vec4(b2 / 255.0, b1 / 255.0, b0 / 255.0, 1.0);   // R = high byte
    } else {
      gl_FragColor = vec4(c, 1.0);
    }
  }`;

// ----------------------------------------------------------------- helpers
const codeVec = (code) => new THREE.Vector3((code & 255) / 255, ((code >> 8) & 255) / 255, ((code >> 16) & 255) / 255);
// nearest-filtered 1-row RGBA LUT; values land in the shader as exact byte/255
function makeLut(width) {
  const t = new THREE.DataTexture(new Uint8Array(width * 4), width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// -------------------------------------------------------------- the module
export function initPerception(engine, refs) {
  const { scene, streamer, instancer, dresser, heroes, traffic, peds, sky, groundMat, farMat } = refs;
  const renderer = engine.renderer;
  const camera = engine.camera;

  // ---- instance registry: stable string key -> sequential id
  const idOf = new Map();
  const meta = [];             // id-1 -> { key, cls, pose }
  function newId(key, cls, pose) {
    let id = idOf.get(key);
    if (id === undefined) {
      id = meta.length + 1;
      idOf.set(key, id);
      meta.push({ key, cls, pose: pose || null });
    } else if (pose) meta[id - 1].pose = pose;
    return id;
  }
  const posKey = (tag, x, z) => `${tag}:${Math.round(x * 4)}_${Math.round(z * 4)}`;
  // Only instances within this radius get an id: the loaded ring holds ~230k
  // pooled instances (rooftop clutter alone is 90k caps) and every one of them
  // would cost a Map key. Beyond it an instance is sub-pixel anyway; ids are
  // cached on first sight, so coming into range does not renumber anything.
  let idRadius = 600;

  // ---- LUTs
  const clsLut = makeLut(64);
  {
    const d = clsLut.image.data;
    for (const c of CLASSES) { const o = c.id * 4; d[o] = c.rgb[0]; d[o + 1] = c.rgb[1]; d[o + 2] = c.rgb[2]; d[o + 3] = 255; }
    const cw = CLASS_BY_ID.get(CID.crosswalk).rgb, o = CROSSWALK_KEY * 4;
    d[o] = cw[0]; d[o + 1] = cw[1]; d[o + 2] = cw[2]; d[o + 3] = 255;
    const tr = CLASS_BY_ID.get(CID.terrain).rgb, o2 = FARCARPET_KEY * 4;
    d[o2] = tr[0]; d[o2 + 1] = tr[1]; d[o2 + 2] = tr[2]; d[o2 + 3] = 255;
    clsLut.needsUpdate = true;
  }
  const zeroLut = makeLut(4);   // ground / stuff in instance mode
  // semantic-mode facades still index by aBid (the hide mask needs it), so
  // they need a LUT that is the building colour at every slot
  const bldLut = makeLut(4);
  {
    const d = bldLut.image.data, c = CLASS_BY_ID.get(CID.building).rgb;
    for (let i = 0; i < 4; i++) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
    bldLut.needsUpdate = true;
  }

  // ---- shared uniforms + material cache (clones share the compiled program:
  // three keys its program cache on source + defines, not on uniform values)
  const uni = {
    uMode: { value: 0 }, uSolo: { value: 0 }, uSoloCode: { value: new THREE.Vector3() },
    uDepthMax: { value: 1000 }, uVisFar: { value: 150 },
    uWindT: ENV.windT, uWindA: ENV.windAmp,
    // shared uniform OBJECTS, so the near-ring radius the far shaders clip
    // against tracks the streamer without any per-frame bookkeeping here
    uPlayerXZ: FAR_UNIFORMS.playerXZ, uNearR: FAR_UNIFORMS.nearR,
  };
  // PV2 crowd draw sets: segRender's own class / id / depth material + the crowd's GPU skinning (sim/crowd.js
  // CROWD_SEG_*), one per (kind, code, skeleton, hair). A plain override drew T-posed bind meshes at the walkers' feet.
  const crowdMats = new Map();
  function crowdSegMat(kind, code, o) {
    const skin = o.userData.crowdSkin, hair = !!o.userData.crowdHair;
    const key = [kind, code | 0, hair ? 1 : 0, skin.uInstData.value?.uuid || 'x'].join('|');
    let m = crowdMats.get(key);
    if (m) return m;
    const base = mkMat(kind, { code });
    const defines = { ...base.defines, SEG_CROWD: '' };
    if (hair) defines.SEG_CROWDHAIR = '';
    m = new THREE.ShaderMaterial({
      defines,
      uniforms: { ...base.uniforms, ...skin },
      vertexShader: VERT, fragmentShader: FRAG,
      side: hair ? THREE.DoubleSide : THREE.FrontSide,
      fog: false, transparent: false, depthWrite: true, depthTest: true,
    });
    m.toneMapped = false;
    m.name = 'seg:crowd:' + kind;
    m.userData.__seg = true;
    crowdMats.set(key, m);
    return m;
  }
  const mats = new Map();
  function mkMat(kind, opts = {}) {
    const key = [kind, opts.code | 0, opts.lut ? opts.lut.id : 0, opts.map ? opts.map.id : 0,
      opts.alpha || 0, opts.side ?? 0, opts.sway ? 1 : 0, opts.farclip ? 1 : 0,
      opts.hide ? opts.hide.id : 0].join('|');
    let m = mats.get(key);
    if (m) return m;
    const defines = {};
    if (kind === 'KEY') defines.SEG_KEY = '';
    if (kind === 'VCOL') defines.SEG_VCOL = '';
    if (kind === 'ICOL') defines.SEG_ICOL = '';
    if (opts.map) defines.SEG_CUTOUT = '';
    if (opts.sway) defines.SEG_SWAY = '';
    if (opts.farclip) defines.SEG_FARCLIP = '';
    if (opts.hide) defines.SEG_HIDE = '';
    const lut = opts.lut || clsLut;
    m = new THREE.ShaderMaterial({
      defines,
      uniforms: {
        ...uni,
        uCode: { value: codeVec(opts.code | 0) },
        uLut: { value: lut }, uLutW: { value: lut.image.width },
        uSegMap: { value: opts.map || null }, uSegAlpha: { value: opts.alpha || 0.5 },
        uHideTex: { value: opts.hide || null },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      side: opts.side ?? THREE.FrontSide,
      fog: false, transparent: false, depthWrite: true, depthTest: true,
    });
    m.toneMapped = false;
    m.name = 'seg:' + kind;
    m.userData.__seg = true;
    mats.set(key, m);
    return m;
  }

  // =====================================================================
  //  ground: per-vertex class key (matId + the crosswalk reconstruction)
  // =====================================================================
  let zoneGen = 0, zones = null, zoneGrid = null;
  const ZCELL = 32;
  function buildCrossZones() {
    // A crossing's bars occupy [mouth + 0.15, mouth + 0.35 + XW + 0.3] from the
    // junction node along the leg; the stop bar starts 1.2 m past that, so the
    // band separates them. docs/notes/perception.md §3.1
    //
    // Node-centric, because the compiler paints per STUB at a node:
    //  * a road endpoint can sit several metres off its node — compile.mjs
    //    merges near-miss nodes and snaps endpoints, and traffic.js has its own
    //    "canonical junction clustering (scattered CSCL arms)" — so the match
    //    radius is 8 m, not the 3.5 m that missed a whole crossing leg in the
    //    first validation frame;
    //  * `mouthA/mouthB` are written onto the FIRST/LAST piece of a road
    //    (compile.mjs 2302), so a piece that meets the node without carrying
    //    the mouth reads 0. A stored 0 at a real junction is impossible (the
    //    compiler's own floor is 2.2 + 0.35), so it means "the mouth is on my
    //    sibling piece" — estimated from the node's widest OTHER leg, which is
    //    what the corner-return solver would have produced anyway.
    const nodes = [];
    if (streamer) for (const rec of streamer.tiles.values()) for (const n of (rec.data && rec.data.nodes) || []) nodes.push(n);
    const byNode = new Map();          // node index -> legs
    if (streamer) for (const rec of streamer.tiles.values()) {
      for (const r of (rec.data && rec.data.roads) || []) {
        if (!r.pts || r.pts.length < 2 || (r.level || 0) > 0) continue;
        for (const end of [0, 1]) {
          const p0 = end === 0 ? r.pts[0] : r.pts[r.pts.length - 1];
          const p1 = end === 0 ? r.pts[1] : r.pts[r.pts.length - 2];
          let bi = -1, bd = 8;
          for (let i = 0; i < nodes.length; i++) {
            const d = Math.hypot(nodes[i].x - p0[0], nodes[i].z - p0[2]);
            if (d < bd) { bd = d; bi = i; }
          }
          if (bi < 0) continue;
          const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1;
          let arr = byNode.get(bi); if (!arr) byNode.set(bi, (arr = []));
          arr.push({
            dx: dx / L, dz: dz / L, hw: (r.width || 12) / 2,
            mouth: end === 0 ? (r.mouthA || 0) : (r.mouthB || 0),
            // the compiler paints a crossing only on rclass <= 2 stubs
            paint: r.rclass <= 2,
            // XW11: NYC DOT crosswalk depth, same table as tools/pipeline/compile.mjs XW_DEPTH
            XW: r.rclass === 2 && (r.width || 12) >= 16.5 ? 7.62 : 4.57,
          });
        }
      }
    }
    const legs = [];
    for (const [ni, arr] of byNode) {
      if (arr.length < 2) continue;                 // compile.mjs skips k < 2 nodes
      const n = nodes[ni];
      let widest = 0;
      for (const g of arr) widest = Math.max(widest, g.hw);
      for (const g of arr) {
        if (!g.paint) continue;
        const mouth = g.mouth > 0 ? g.mouth : Math.max(2.55, widest + 0.35);
        legs.push({
          x: n.x, z: n.z, dx: g.dx, dz: g.dz,
          d0: mouth + 0.15, d1: mouth + 0.35 + g.XW + 0.3, hw: g.hw + 0.6,
        });
      }
    }
    zones = legs;
    zoneGrid = new Map();
    for (const g of legs) {
      const cx = Math.floor(g.x / ZCELL), cz = Math.floor(g.z / ZCELL);
      const R = Math.ceil((g.d1 + g.hw) / ZCELL) + 1;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        const k = `${cx + a}_${cz + b}`;
        let arr = zoneGrid.get(k); if (!arr) zoneGrid.set(k, (arr = []));
        arr.push(g);
      }
    }
    zoneGen++;
    return legs.length;
  }
  function inCrossZone(x, z) {
    const arr = zoneGrid && zoneGrid.get(`${Math.floor(x / ZCELL)}_${Math.floor(z / ZCELL)}`);
    if (!arr) return false;
    for (const g of arr) {
      const ax = x - g.x, az = z - g.z;
      const along = ax * g.dx + az * g.dz;
      if (along < g.d0 || along > g.d1) continue;
      if (Math.abs(ax * -g.dz + az * g.dx) <= g.hw) return true;
    }
    return false;
  }
  function groundKeys(geo) {
    if (geo.userData.__segGen === zoneGen && geo.getAttribute('aSegKey')) return true;
    const mid = geo.getAttribute('matId'), pos = geo.getAttribute('position');
    if (!mid || !pos) return false;
    const n = mid.count;
    let a = geo.getAttribute('aSegKey');
    if (!a || a.count !== n) { a = new THREE.BufferAttribute(new Float32Array(n), 1); geo.setAttribute('aSegKey', a); }
    const arr = a.array, mA = mid.array, pA = pos.array;
    for (let i = 0; i < n; i++) {
      const mi = mA[i] | 0;
      if (mi === 8) { arr[i] = FARCARPET_KEY; continue; }      // clipped inside nearR
      const c = MATID_CLASS[mi];
      arr[i] = c === undefined ? 0 : c;
    }
    if (!geo.index) {
      // crosswalk: per TRIANGLE (all three verts share the class), white paint only
      for (let t = 0; t + 2 < n; t += 3) {
        if ((mA[t] | 0) !== 3) continue;
        const cx = (pA[t * 3] + pA[t * 3 + 3] + pA[t * 3 + 6]) / 3;
        const cz = (pA[t * 3 + 2] + pA[t * 3 + 5] + pA[t * 3 + 8]) / 3;
        if (inCrossZone(cx, cz)) { arr[t] = CROSSWALK_KEY; arr[t + 1] = CROSSWALK_KEY; arr[t + 2] = CROSSWALK_KEY; }
      }
    }
    a.needsUpdate = true;
    geo.userData.__segGen = zoneGen;
    return true;
  }

  // =====================================================================
  //  buildings
  // =====================================================================
  const bidId = (recKey) => newId('bld:' + recKey, CID.building);

  // one LUT per tile facade mesh: slot = aBid, value = the instance code.
  // Keyed by TILE, not stashed on the mesh, so `pruneFacadeLuts` can dispose
  // the ones whose tile has streamed out — a 300-frame path cycles through
  // dozens of tiles and each leaked LUT is a live GPU texture.
  const facadeLuts = new Map();
  function pruneFacadeLuts() {
    if (!streamer) return;
    for (const [k, L] of facadeLuts) {
      if (streamer.tiles.has(k)) continue;
      L.tex.dispose();
      facadeLuts.delete(k);
    }
  }
  function facadeLut(mesh, tileKey) {
    const geo = mesh.geometry;
    const bidA = geo.getAttribute('aBid');
    if (!bidA) return null;
    if (!geo.getAttribute('aSegKey')) geo.setAttribute('aSegKey', bidA);   // alias: same VBO
    let L = facadeLuts.get(tileKey);
    if (!L) {
      let maxBid = 0;
      for (let i = 0; i < bidA.count; i++) if (bidA.array[i] > maxBid) maxBid = bidA.array[i];
      const w = Math.max(2, Math.min(8192, (maxBid | 0) + 2));
      L = { tex: makeLut(w), w, ready: false };
      facadeLuts.set(tileKey, L);
    }
    if (!L.ready) {
      const d = L.tex.image.data;
      for (let b = 0; b < L.w; b++) {
        const code = encodeId(bidId(`${tileKey}:${b}`));
        const o = b * 4;
        d[o] = code & 255; d[o + 1] = (code >> 8) & 255; d[o + 2] = (code >> 16) & 255; d[o + 3] = 255;
      }
      L.tex.needsUpdate = true;
      L.ready = true;
    }
    return L;
  }

  // `aSegCol` for a mesh whose vertices belong to buildings by RANGE
  function writeRanges(geo, ranges, nVerts) {
    let a = geo.getAttribute('aSegCol');
    // same ranges as the last write (the usual case from one capture to the next): the attribute already holds them,
    // and rewriting + re-uploading every building's vertex colours cost ~25 ms per API tick
    let h = 2166136261 ^ nVerts;
    for (const [s, c, id] of ranges) { h = Math.imul(h ^ s, 16777619); h = Math.imul(h ^ c, 16777619); h = Math.imul(h ^ id, 16777619); }
    if (a && a.count === nVerts && geo.userData.__segSig === h) return;
    geo.userData.__segSig = h;
    if (!a || a.count !== nVerts) { a = new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3); geo.setAttribute('aSegCol', a); }
    const arr = a.array;
    arr.fill(0);
    for (const [s, c, id] of ranges) {
      const code = encodeId(id);
      const r = (code & 255) / 255, g = ((code >> 8) & 255) / 255, b = ((code >> 16) & 255) / 255;
      const e = Math.min(nVerts, s + c);
      for (let i = s; i < e; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
    }
    a.needsUpdate = true;
  }
  // nycDress TileMerges: merged per tile per material, in `geos` insertion order
  function dresserMergeRanges(mesh) {
    if (!dresser || !dresser.merges) return false;
    const m = /^nyc:merge:(.+):([^:]+)$/.exec(mesh.name || '');
    if (!m) return false;
    const t = dresser.merges.tiles.get(m[1]);
    const b = t && t.get(m[2]);
    if (!b || !b.geos) return false;
    const nVerts = mesh.geometry.getAttribute('position').count;
    const ranges = [];
    let o = 0;
    for (const [recKey, g] of b.geos) {
      const p = g.getAttribute && g.getAttribute('position');
      const c = p ? p.count : 0;
      ranges.push([o, c, bidId(recKey)]);
      o += c;
    }
    if (o !== nVerts) {
      if (!mesh.userData.__segWarned) { mesh.userData.__segWarned = 1; console.warn('[perc] dresser merge range mismatch', mesh.name, o, nVerts); }
      return false;
    }
    writeRanges(mesh.geometry, ranges, nVerts);
    return true;
  }
  // nycDress PartPools + heroFacades: StaticPool buckets with per-building handles
  function poolRanges(mesh) {
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return false;
    const nVerts = pos.count;
    const ranges = [];
    if (/^nyc:parts:/.test(mesh.name || '') && dresser && dresser.active) {
      for (const [recKey, a] of dresser.active) {
        const id = bidId(recKey);
        for (const [, h] of a.handles || []) if (h && h.bucket && h.bucket.mesh === mesh) ranges.push([h.start, h.count, id]);
      }
    } else if (mesh.name === 'heroes' && heroes && heroes.active) {
      for (const [recKey, a] of heroes.active) if (a.h) ranges.push([a.h.start, a.h.count, bidId(recKey)]);
    } else return false;
    writeRanges(mesh.geometry, ranges, nVerts);
    return true;
  }

  // =====================================================================
  //  instanced pools: push codes through `cols` -> `instanceColor`
  // =====================================================================
  const colStash = new Map();
  const instColAdded = [];
  function writeInstancerCodes(inst) {
    if (!instancer) return;
    for (const [name, p] of instancer.pools) {
      if (!p || !p.cols) continue;
      const cls = classifyPool(name);
      if (!colStash.has(p)) {
        colStash.set(p, p.cols.slice());
        // instancer._sync() mirrors p.mesh.material onto the shadow / LOD
        // meshes every flush(), so the pool's own material is the only
        // trustworthy record of the original — remember it here (before the
        // swap) and put it back on exit, whatever _sync did in between
        p.__segOrigMat = p.mesh.material;
      }
      const cols = p.cols;
      if (!inst || cls === 0 || !isThing(cls)) {
        const col = inst ? [0, 0, 0] : (CLASS_BY_ID.get(cls) || CLS0).rgb;
        const r = col[0] / 255, g = col[1] / 255, b = col[2] / 255;
        for (let i = 0; i < p.top; i++) { cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b; }
      } else {
        const cx = camera.position.x, cz = camera.position.z, R2 = idRadius * idRadius;
        // The codes of a pool only change when its slots do (instancer.js bumps p.ver on every claim / release /
        // move) or the camera travels far enough to move the id radius: an API capture on every tick re-derived
        // ~100k position keys each time (70-90 ms) for the same answer. The ids stay registered (idOf / meta are
        // never cleared), so a cached code is still a valid one.
        const c = p.__segCodes;
        if (c && c.ver === p.ver && c.top === p.top && c.R2 === R2 && (c.cx - cx) ** 2 + (c.cz - cz) ** 2 < 625) {
          cols.set(c.cols);
        } else {
          for (let i = 0; i < p.top; i++) {
            if (!p.alive[i]) continue;
            const x = p.pos[i * 3], y = p.pos[i * 3 + 1], z = p.pos[i * 3 + 2];
            if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > R2) { cols[i * 3] = 0; cols[i * 3 + 1] = 0; cols[i * 3 + 2] = 0; continue; }
            const id = newId(posKey('f' + cls, x, z), cls, { pos: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], pool: name });
            const code = encodeId(id);
            cols[i * 3] = (code & 255) / 255;
            cols[i * 3 + 1] = ((code >> 8) & 255) / 255;
            cols[i * 3 + 2] = ((code >> 16) & 255) / 255;
          }
          p.__segCodes = { ver: p.ver, top: p.top, R2, cx, cz, cols: cols.slice(0, p.top * 3) };
        }
      }
      p.dirty = true;
    }
    instancer.cull(camera);          // propagate into the culled draw sets
  }
  function restoreInstancerCodes() {
    if (!instancer) return;
    for (const [p, saved] of colStash) {
      if (p.cols && p.cols.length === saved.length) p.cols.set(saved);
      p.dirty = true;
      if (p.__segOrigMat) {
        for (const m of [p.mesh, p.mesh2, p.shadow, p.shadow2]) if (m && m.material && m.material.userData.__seg) m.material = p.__segOrigMat;
        p.mat = p.__segOrigMat;
        p.__segOrigMat = null;
      }
    }
    colStash.clear();
    instancer.cull(camera);
  }

  // =====================================================================
  //  vehicles + pedestrians
  // =====================================================================
  const vehStash = new Map();
  let uidSeq = 0;
  function ensureInstColor(mesh, cap) {
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      instColAdded.push(mesh);
    }
    return mesh.instanceColor;
  }
  const putCode = (attr, i, code) => {
    attr.array[i * 3] = (code & 255) / 255;
    attr.array[i * 3 + 1] = ((code >> 8) & 255) / 255;
    attr.array[i * 3 + 2] = ((code >> 16) & 255) / 255;
  };
  const flatCol = (attr, n, rgb) => {
    for (let i = 0; i < n; i++) { attr.array[i * 3] = rgb[0] / 255; attr.array[i * 3 + 1] = rgb[1] / 255; attr.array[i * 3 + 2] = rgb[2] / 255; }
  };
  // sim/vehicleCull.js turns traffic's pool meshes into invisible STORAGE and
  // draws compacted `veh:<m|p>:<kind>[:shell|:lod]:<j>` render meshes instead.
  // Those are only refilled inside traffic.update(), which in ?record=1 mode
  // runs on __advance() — so the codes have to be written into the render
  // meshes here as well, keyed by each instance's matrix translation (the one
  // thing storage and draw set always agree on).
  const vehPosCode = new Map();
  const vposKey = (x, z) => `${Math.round(x * 100)}_${Math.round(z * 100)}`;
  function writeVehicleDrawSets(inst) {
    const m4 = new THREE.Matrix4();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !/^veh:/.test(o.name || '')) return;
      const a = ensureInstColor(o, Math.max(o.instanceMatrix.count, 1));
      if (!vehStash.has(o)) vehStash.set(o, a.array.slice());
      if (!inst) {
        const km = /^veh:[mp]:([^:]+)/.exec(o.name);
        flatCol(a, a.count, CLASS_BY_ID.get(classifyVehicle(km ? km[1] : 'sedan')).rgb);
      } else {
        a.array.fill(0);
        for (let i = 0; i < o.count; i++) {
          m4.fromArray(o.instanceMatrix.array, i * 16);
          const code = vehPosCode.get(vposKey(m4.elements[12], m4.elements[14]));
          if (code) putCode(a, i, code);
        }
      }
      a.needsUpdate = true;
    });
  }
  function writeVehicleCodes(inst) {
    if (!traffic) return;
    vehPosCode.clear();
    // --- moving cars: car.idx IS the instance slot
    for (const [kind, P] of Object.entries(traffic.pools || {})) {
      const cls = classifyVehicle(kind);
      const a = ensureInstColor(P.mb, P.cap);
      if (!vehStash.has(P.mb)) vehStash.set(P.mb, a.array.slice());
      if (inst) a.array.fill(0); else flatCol(a, a.count, CLASS_BY_ID.get(cls).rgb);
      a.needsUpdate = true;
      if (P.md && P.md.instanceColor !== a) { P.md.instanceColor = a; instColAdded.push(P.md); }
    }
    if (inst) {
      for (const car of traffic.cars || []) {
        const P = traffic.pools[car.kind];
        if (!P || !P.mb.instanceColor) continue;
        if (car.__percUid === undefined) car.__percUid = ++uidSeq;
        const p = car._pose || [0, 0, 0, 0];
        const id = newId(`veh:${car.kind}:${car.__percUid}`, classifyVehicle(car.kind), {
          pos: [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2)], yaw: +p[3].toFixed(3),
          dims: traffic.vehDims?.[car.kind] || VEH_DIMS[car.kind] || VEH_DIMS.sedan, speed_mps: +(car.v || 0).toFixed(2), moving: true, kind: car.kind,
        });
        putCode(P.mb.instanceColor, car.idx, encodeId(id));
        vehPosCode.set(vposKey(p[0], p[2]), encodeId(id));
      }
      for (const P of Object.values(traffic.pools || {})) if (P.mb.instanceColor) P.mb.instanceColor.needsUpdate = true;
    }
    // --- parked cars: rebucket order is unstable, position IS the identity
    const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();
    for (const [kind, P] of Object.entries(traffic.parked || {})) {
      const cls = classifyVehicle(kind);
      for (const mesh of [P.mb, P.shell]) {
        if (!mesh) continue;
        const a = ensureInstColor(mesh, mesh.instanceMatrix.count);
        if (!vehStash.has(mesh)) vehStash.set(mesh, a.array.slice());
        if (!inst) flatCol(a, a.count, CLASS_BY_ID.get(cls).rgb);
        else {
          a.array.fill(0);
          for (let i = 0; i < mesh.count; i++) {
            m4.fromArray(mesh.instanceMatrix.array, i * 16);
            v3.setFromMatrixPosition(m4);
            const id = newId(posKey(`park${cls}`, v3.x, v3.z), cls, {
              pos: [+v3.x.toFixed(2), +v3.y.toFixed(2), +v3.z.toFixed(2)],
              yaw: +Math.atan2(m4.elements[8], m4.elements[10]).toFixed(3),
              dims: traffic.vehDims?.[kind] || VEH_DIMS[kind] || VEH_DIMS.sedan, speed_mps: 0, moving: false, kind,
            });
            putCode(a, i, encodeId(id));
            vehPosCode.set(vposKey(v3.x, v3.z), encodeId(id));
          }
        }
        a.needsUpdate = true;
      }
      if (P.md && P.mb.instanceColor && P.md.instanceColor !== P.mb.instanceColor) { P.md.instanceColor = P.mb.instanceColor; instColAdded.push(P.md); }
    }
    // --- pedestrians
    if (peds && peds.mesh && peds.mesh.instanceColor) {
      const a = peds.mesh.instanceColor;
      if (!vehStash.has(peds.mesh)) vehStash.set(peds.mesh, a.array.slice());
      if (!inst) flatCol(a, a.count, CLASS_BY_ID.get(CID.pedestrian).rgb);
      else {
        a.array.fill(0);
        const pm = new THREE.Matrix4(), pv = new THREE.Vector3();
        for (const p2 of peds.peds || []) {
          peds.mesh.getMatrixAt(p2.idx, pm);
          pv.setFromMatrixPosition(pm);
          if (p2.__percUid === undefined) p2.__percUid = ++uidSeq;
          const id = newId(`ped:${p2.__percUid}`, CID.pedestrian, { pos: [+pv.x.toFixed(2), +pv.y.toFixed(2), +pv.z.toFixed(2)], dims: [0.55, 1.75, 0.4] });
          putCode(a, p2.idx, encodeId(id));
        }
      }
      a.needsUpdate = true;
    }
    writeVehicleDrawSets(inst);
  }
  function restoreVehicleCodes() {
    for (const [mesh, saved] of vehStash) {
      if (mesh.instanceColor && mesh.instanceColor.array.length === saved.length) {
        mesh.instanceColor.array.set(saved);
        mesh.instanceColor.needsUpdate = true;
      }
    }
    vehStash.clear();
    for (const mesh of instColAdded) mesh.instanceColor = null;
    instColAdded.length = 0;
  }

  // =====================================================================
  //  scene classification + material swap
  // =====================================================================
  const stash = new Map();      // Object3D -> original material
  const hidden = [];
  const soloGroups = new Map(); // class id -> Set<Object3D>
  let mode = null;              // 'semantic' | 'instance' | 'depth' | 'depthraw'
  let matMode = null;           // 'semantic' | 'instance'  (depth reuses semantic)
  let busy = false;

  const addSolo = (cls, o) => {
    let s = soloGroups.get(cls); if (!s) soloGroups.set(cls, (s = new Set()));
    s.add(o);
  };
  function isHideable(o) {
    const m = o.material;
    if (!m) return true;
    if (sky && (o === sky.sky || o === sky.envSky)) return true;
    if (m.blending === THREE.AdditiveBlending) return true;
    if (m.transparent === true && m.depthWrite === false) return true;
    return false;
  }

  function segMaterialFor(o) {
    const m = o.material;
    const name = o.name || '';
    const inst = matMode === 'instance';
    const cut = (mm) => (mm.alphaTest > 0 && mm.map ? mm.map : null);
    // ---- instanced pools (furniture, trees, signals, roof gear)
    const pm = /^pool([SF]?):([^:]+)/.exec(name);
    if (pm && instancer && instancer.pools.has(pm[2])) {
      if (pm[1] === 'F') return null;                    // far-cascade proxy blobs
      const cls = classifyPool(pm[2]);
      if (cls === 0) return null;                        // glow pools
      const sway = /Crown$/.test(pm[2]);
      const shared = { map: cut(m), alpha: m.alphaTest, side: m.side, sway };
      if (pm[1] === '') addSolo(cls, o);                 // only the visible draw mesh
      if (inst && isThing(cls)) return mkMat('ICOL', shared);
      return mkMat('UNI', { ...shared, code: inst ? 0 : rgbCode(cls) });
    }
    // ---- vehicles: the CULLED DRAW SETS are what actually renders
    // (sim/vehicleCull.js). `vehS:` are the shadow-only sets — invisible here.
    if (/^vehS:/.test(name)) return null;
    const vm = /^veh:([mp]):([^:]+)/.exec(name);
    if (vm) {
      const cls = classifyVehicle(vm[2]);
      addSolo(cls, o);
      return inst ? mkMat('ICOL') : mkMat('UNI', { code: rgbCode(cls) });
    }
    // ---- vehicles: the invisible storage meshes (kept in step so that a cull
    // inside seg mode mirrors the right material into the draw sets)
    if (traffic) {
      for (const [kind, P] of Object.entries(traffic.pools || {})) {
        if (o === P.mb || o === P.md) {
          const cls = classifyVehicle(kind);
          addSolo(cls, o);
          return inst ? mkMat('ICOL') : mkMat('UNI', { code: rgbCode(cls) });
        }
      }
      for (const [kind, P] of Object.entries(traffic.parked || {})) {
        if (o === P.mb || o === P.md || o === P.shell) {
          const cls = classifyVehicle(kind);
          addSolo(cls, o);
          return inst ? mkMat('ICOL') : mkMat('UNI', { code: rgbCode(cls) });
        }
      }
      const L = traffic.lights;
      if (L && (o === L.mesh || o === L.lampMesh || o === L.glowMesh)) return null;
    }
    // PV2 crowd draw sets (sim/crowd.js): shadow-only sets are invisible here; the draw sets are pedestrians
    if (/^pedS:/.test(name)) return null;
    if (/^ped:/.test(name)) {
      addSolo(CID.pedestrian, o);
      if (o.userData?.crowdSkin) return inst ? crowdSegMat('ICOL', 0, o) : crowdSegMat('UNI', rgbCode(CID.pedestrian), o);
      return inst ? mkMat('ICOL') : mkMat('UNI', { code: rgbCode(CID.pedestrian) });
    }
    if (peds && o === peds.mesh) {
      addSolo(CID.pedestrian, o);
      return inst ? mkMat('ICOL') : mkMat('UNI', { code: rgbCode(CID.pedestrian) });
    }
    // ---- ground (tile ground meshes + the far-terrain static pool)
    if (groundMat && m === groundMat) {
      if (!groundKeys(o.geometry)) return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.road) });
      return mkMat('KEY', { lut: inst ? zeroLut : clsLut, farclip: true });
    }
    // ---- tile shader facades
    if (m.userData && m.userData.isFacade) {
      addSolo(CID.building, o);
      const hide = m.userData.hideTex || null;
      const tm = /^tile_(.+)$/.exec((o.parent && o.parent.name) || '');
      if (tm) {
        const L = facadeLut(o, tm[1]);
        if (L) return mkMat('KEY', { lut: inst ? L.tex : bldLut, hide });
      }
      return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.building) });
    }
    // ---- dressed buildings + their kit-part pools
    if (o.userData && o.userData.nycDress) {
      addSolo(CID.building, o);
      if (inst && (/^nyc:merge:/.test(name) ? dresserMergeRanges(o) : poolRanges(o))) return mkMat('VCOL');
      return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.building) });
    }
    // ---- hero facade trims
    if (heroes && (m === heroes.mat || name === 'heroes')) {
      addSolo(CID.building, o);
      if (inst && poolRanges(o)) return mkMat('VCOL');
      return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.building) });
    }
    // ---- far LOD city (macro tiles): stuff, no instances beyond 1 km.
    // farclip is NOT optional here — the macro blocks sit on top of the near
    // ring and their own shader is what keeps them out of it.
    if (farMat && m === farMat) return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.building), farclip: true });
    // ---- water: the single 46 km, 4-vertex plane
    const pa = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (pa && pa.count === 4 && m.type === 'ShaderMaterial') {
      return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.water) });
    }
    if (/bridge/i.test(name) || /bridge/i.test((o.parent && o.parent.name) || '')) {
      return mkMat('UNI', { code: inst ? 0 : rgbCode(CID.bridge) });
    }
    // ---- everything else (landmarks, campus kit, signs, decals): class only
    const cls = fallbackClass(o);
    return mkMat('UNI', { code: inst ? 0 : rgbCode(cls), side: m.side, map: cut(m), alpha: m.alphaTest });
  }
  function fallbackClass(o) {
    // a mesh that says what it is (src/city/namedShops.js: a shopfront is building, whatever its merged shape)
    const said = o.userData && o.userData.segClass;
    if (said && CID[said] != null) return CID[said];
    const n = `${o.name || ''}|${(o.parent && o.parent.name) || ''}|${(o.material && o.material.name) || ''}`;
    if (/sign|text|blade/i.test(n)) return CID.street_sign;
    if (/tree|leaf|foliage|shrub|hedge|grass|lawn/i.test(n)) return CID.vegetation;
    if (/walk|step|stair|plaza|pave|path|terrace|ramp/i.test(n)) return CID.sidewalk;
    if (/wall|rail|fence|gate|lamp|urn|monument|bench|bollard/i.test(n)) return CID.street_furniture;
    const g = o.geometry;
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb) {
        const h = bb.max.y - bb.min.y, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
        if (h < 0.35 && w > 1.5) return CID.sidewalk;
      }
    }
    return CID.building;
  }

  function refresh() {
    if (!mode) return;
    scene.traverse((o) => {
      if (!o.isMesh || stash.has(o)) return;
      if (o.material && o.material.userData && o.material.userData.__seg) {
        // a mesh created DURING seg mode that inherited an override material
        // (instancer._sync mirrors p.mesh.material onto new shadow/LOD meshes).
        // The pool restore in restoreInstancerCodes() puts it back; anything
        // else would be stuck flat after exit, so say so.
        if (!/^pool[SF]?:/.test(o.name || '') && !o.userData.__segWarnInherit) {
          o.userData.__segWarnInherit = 1;
          console.warn('[perc] mesh appeared already wearing an override material:', o.name || o.type);
        }
        return;
      }
      if (isHideable(o)) { stash.set(o, o.material); if (o.visible) { o.visible = false; hidden.push(o); } return; }
      const seg = segMaterialFor(o);
      stash.set(o, o.material);
      if (seg === null) { if (o.visible) { o.visible = false; hidden.push(o); } }
      else o.material = seg;
    });
  }

  // ---- render-target pool
  const rts = new Map();
  function rt(w, h) {
    const k = `${w}x${h}`;
    let t = rts.get(k);
    if (!t) {
      t = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        depthBuffer: true, stencilBuffer: false, samples: 0,   // NO MSAA: it blends ids
        generateMipmaps: false, colorSpace: THREE.NoColorSpace,
      });
      rts.set(k, t);
    }
    return t;
  }

  const MODE_NUM = { semantic: 0, instance: 0, depthraw: 1, depth: 2 };
  const MODE_MAT = { semantic: 'semantic', instance: 'instance', depthraw: 'semantic', depth: 'semantic' };
  const clearFor = (m) => {
    if (m === 'depthraw') return [255, 255, 255];
    if (m === 'depth') return [253, 231, 37];              // viridis(1)
    if (m === 'instance') return [0, 0, 0];
    return CLASS_BY_ID.get(CID.sky).rgb;
  };
  const setClear = (rgb) => renderer.setClearColor(new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255), 1);

  const saved = {};
  function enter(m) {
    if (!m) { exit(); return; }
    if (mode === m) { refresh(); return; }
    const wantMat = MODE_MAT[m] || 'semantic';
    if (mode === null) {
      if (peds?.rig) peds.rig.extMat = true;   // sim/crowd.js: do not swap the draw sets' materials back mid-capture
      if (!zoneGrid) buildCrossZones();
      pruneFacadeLuts();
      saved.bg = scene.background;
      saved.shadowAuto = renderer.shadowMap.autoUpdate;
      saved.shadowNeeds = renderer.shadowMap.needsUpdate;
      saved.clear = renderer.getClearColor(new THREE.Color());
      saved.clearAlpha = renderer.getClearAlpha();
      saved.gtRaw = engine.gtRaw;
      // Park the engine's two ASYNC readback jobs for as long as the override
      // materials are installed. `_updateProbe` re-renders the whole scene six
      // times into a cube target and bakes the result into the light probe —
      // run mid-capture it bakes FLAT CLASS COLOURS into the city's ambient —
      // and `_meterExposure` meters the auto-exposure off the prepass buffer,
      // which during a capture is whatever the seg pass last left. Both bind
      // framebuffers around an await, so both can also interleave with the
      // capture's own passes. `_probeBusy`/`_meterBusy` are the engine's own
      // re-entry guards (engine.js:904, 955); exit() puts them back.
      saved.probeBusy = engine._probeBusy;
      saved.meterBusy = engine._meterBusy;
      engine._probeBusy = true;
      engine._meterBusy = true;
      scene.background = null;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      if (engine.sun2) engine.sun2.shadow.needsUpdate = false;
      engine.gtRaw = false;
      engine.segRender = () => {
        if (busy) return;
        if ((engine.frames & 7) === 0) { writeInstancerCodes(matMode === 'instance'); writeVehicleCodes(matMode === 'instance'); }
        refresh();
        peds?.rig?.syncIds?.();
        setClear(clearFor(mode));
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      };
    }
    if (wantMat !== matMode) {
      // material set differs: put the world back, then re-swap for the new mode
      for (const [o, mm] of stash) if (mm) o.material = mm;
      stash.clear();
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      soloGroups.clear();
      matMode = wantMat;
      writeInstancerCodes(matMode === 'instance');
      writeVehicleCodes(matMode === 'instance');
      mode = m;
      refresh();
    } else {
      mode = m;
    }
    uni.uMode.value = MODE_NUM[m] ?? 0;
    uni.uSolo.value = 0;
    setClear(clearFor(m));
  }
  function exit() {
    if (mode === null) return;
    if (peds?.rig) peds.rig.extMat = false;
    for (const [o, m] of stash) if (m) o.material = m;
    stash.clear();
    peds?.rig?.releaseIds?.();   // after the material restore: the draw sets' synced codes would tint the beauty pass
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    soloGroups.clear();
    restoreInstancerCodes();
    restoreVehicleCodes();
    scene.background = saved.bg ?? null;
    renderer.shadowMap.autoUpdate = saved.shadowAuto !== false;
    renderer.shadowMap.needsUpdate = true;
    if (engine.sun2) engine.sun2.shadow.needsUpdate = true;
    if (saved.clear) renderer.setClearColor(saved.clear, saved.clearAlpha ?? 1);
    engine._probeBusy = !!saved.probeBusy;
    engine._meterBusy = !!saved.meterBusy;
    engine.segRender = null;
    engine.gtRaw = !!saved.gtRaw;
    mode = null; matMode = null;
  }

  // ---- offscreen render + readback
  function drawSize() {
    const v = new THREE.Vector2();
    renderer.getDrawingBufferSize(v);
    return [Math.max(2, v.x | 0), Math.max(2, v.y | 0)];
  }
  // where a pass's time goes (ms, summed over a capture's passes; reported in capture().timing)
  const rrT = { enter: 0, sweep: 0, submit: 0, read: 0 };
  async function renderRead(m, opts = {}) {
    const [W, H] = opts.size || drawSize();
    const target = rt(W, H);
    let tq = performance.now();
    const lapq = (k) => { const n = performance.now(); rrT[k] += n - tq; tq = n; };
    enter(m);
    lapq('enter');
    // re-assert: a probe/meter job already in flight when the capture started
    // clears its own guard when it finishes, which would let the next one run
    engine._probeBusy = true; engine._meterBusy = true;
    // A capture awaits readbacks, and the rAF loop keeps running in between —
    // so a tile can stream in or the dresser can finish a building between two
    // passes of the SAME frame. The exporter's settle gate makes that
    // vanishingly rare, but an unswapped mesh would write a lit material into
    // the id buffer, so re-sweep before every pass. Cheap: with a full stash
    // this is a traverse of `has()` early-outs.
    refresh();
    peds?.rig?.syncIds?.();   // the crowd re-compacts every frame: push the current class / id codes into its draw sets
    lapq('sweep');
    const savedMask = camera.layers.mask;
    if (opts.solo) {
      uni.uSolo.value = 1;
      uni.uSoloCode.value.copy(codeVec(opts.solo.code));
      camera.layers.mask = 1 << SOLO_LAYER;
      for (const o of opts.solo.meshes) o.layers.enable(SOLO_LAYER);
      setClear([0, 0, 0]);
    }
    // Labels are never jittered: the engine leaves its TAA sub-pixel offset (setViewOffset) on the camera after a
    // frame, and a label pass rendered through it sat up to half a pixel off the converged beauty frame.
    const view = camera.view && camera.view.enabled ? { ...camera.view } : null;
    if (view) camera.clearViewOffset();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    lapq('submit');
    const buf = new Uint8Array(W * H * 4);
    // capture({sync: true}) (the external API): a blocking read keeps the whole capture in one task. The async read
    // lets the rAF loop run dt = 0 frames while it waits, and each of those still ran the full traffic / crowd update.
    // an async readback in flight (exposure meter, light probe) leaves its PIXEL_PACK_BUFFER bound, and a readPixels
    // with a pack buffer bound writes into it instead of buf: all-zero label buffers (core/engine.js _grab note)
    if (syncRead) { const g2 = renderer.getContext(); g2.bindBuffer(g2.PIXEL_PACK_BUFFER, null); renderer.readRenderTargetPixels(target, 0, 0, W, H, buf); }
    else await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H, buf);
    lapq('read');
    renderer.setRenderTarget(null);
    if (opts.solo) {
      for (const o of opts.solo.meshes) o.layers.disable(SOLO_LAYER);
      camera.layers.mask = savedMask;
      uni.uSolo.value = 0;
      setClear(clearFor(m));
    }
    return { buf, W, H };
  }

  // ---- PNG encode in the page (byte-exact: putImageData with alpha 255, then
  // toDataURL — PNG is lossless and alpha 255 makes premultiplication identity)
  const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  function pngFrom(buf, W, H, xf) {
    scratch.width = W; scratch.height = H;
    const cx = scratch.getContext('2d');
    const img = cx.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      const s = (H - 1 - y) * W * 4, o = y * W * 4;      // GL rows are bottom-up
      if (xf) { for (let x = 0; x < W; x++) { xf(buf, s + x * 4, d, o + x * 4); d[o + x * 4 + 3] = 255; } }
      else {
        for (let x = 0; x < W * 4; x += 4) {
          d[o + x] = buf[s + x]; d[o + x + 1] = buf[s + x + 1]; d[o + x + 2] = buf[s + x + 2]; d[o + x + 3] = 255;
        }
      }
    }
    cx.putImageData(img, 0, 0);
    return scratch.toDataURL('image/png');
  }

  // ---- the beauty-frame grab: readback -> canvas, and its blank-band gate
  const RGB_ATTEMPTS = 4;
  let rgbRetries = 0, rgbFailed = 0;

  // A GL readback is bottom-up like every other buffer here, and the panel
  // wants a real canvas (it draws boxes over it), so this is pngFrom's flip
  // onto a canvas of its own instead of the shared scratch one.
  function canvasFrom(buf, W, H) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      const s = (H - 1 - y) * W * 4, o = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) {
        d[o + x] = buf[s + x]; d[o + x + 1] = buf[s + x + 1]; d[o + x + 2] = buf[s + x + 2]; d[o + x + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  // "the grab may be blank or torn": a run of columns in which nothing appears
  // to have been rendered. An unwritten pixel still goes through the colour
  // grade, which lifts it to a near-black constant, so a suspect COLUMN is one
  // whose brightest sampled pixel is still nearly black — and a torn grab is a
  // solid band of them running to one edge of the frame.
  //
  // This is deliberately TRIGGER-HAPPY, and it is a retry trigger, not a
  // verdict. Being wrong costs three extra engine frames; being wrong the other
  // way ships a black flash. On the 125th St clip it fires on the few frames
  // where the dolly passes under a dense tree canopy, which are just as dark as
  // an empty render. Flatness was tried as a discriminator and is not one at
  // this sample density: a genuinely empty column measures ~0.9 levels of
  // vertical variation and a canopy column 1.2-2.2, which is far too close to
  // separate reliably. The authoritative check on a finished clip is the offline
  // scan, `tools/perception/scanclip.mjs`, which looks for the empty-render
  // COLOUR over the whole quadrant and separates 37/300 from 0/300 with a 4x
  // margin.
  function blankBand(px, W, H) {
    const COLS = 160, ROWS = 48, DARK = 34;
    let empty = 0, first = false, last = false;
    for (let c = 0; c < COLS; c++) {
      const x = Math.min(W - 1, Math.round(((c + 0.5) * W) / COLS));
      let mx = 0;
      for (let r = 0; r < ROWS && mx <= DARK; r++) {
        const y = Math.min(H - 1, Math.round(((r + 0.5) * H) / ROWS));
        const i = (y * W + x) * 4;
        const m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (m > mx) mx = m;
      }
      if (mx <= DARK) { empty++; if (c === 0) first = true; if (c === COLS - 1) last = true; }
    }
    // the band always reaches an edge — the write stops part way across
    return empty > COLS * 0.12 && (first || last);
  }
  const MASK_XF = (src, si, dst, di) => {          // "anything was drawn" (a solo pass)
    const on = (src[si] | src[si + 1] | src[si + 2]) !== 0 ? 255 : 0;
    dst[di] = on; dst[di + 1] = on; dst[di + 2] = on;
  };
  const codeXf = (code) => (src, si, dst, di) => { // "this exact instance" (the id buffer)
    const on = (src[si] | (src[si + 1] << 8) | (src[si + 2] << 16)) === code ? 255 : 0;
    dst[di] = on; dst[di + 1] = on; dst[di + 2] = on;
  };
  function bufToImageData(buf, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    const img = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const s = (H - 1 - y) * W * 4, o = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) {
        img.data[o + x] = buf[s + x]; img.data[o + x + 1] = buf[s + x + 1];
        img.data[o + x + 2] = buf[s + x + 2]; img.data[o + x + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return c;
  }

  // ---- per-instance statistics from an id buffer
  function statsOf(buf, W, H) {
    const out = new Map();                    // code -> [minx, miny, maxx, maxy, area]
    let lastCode = -1, lastS = null;          // runs of one code are the common case
    for (let y = 0; y < H; y++) {
      const yy = H - 1 - y, row = y * W * 4;
      for (let x = 0; x < W; x++) {
        const i = row + x * 4;
        const code = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
        if (code === 0) continue;
        let s;
        if (code === lastCode) s = lastS;
        else { s = out.get(code); lastCode = code; lastS = s; }
        if (!s) { s = [x, yy, x, yy, 1]; out.set(code, s); lastS = s; continue; }
        if (x < s[0]) s[0] = x;
        if (yy < s[1]) s[1] = yy;
        if (x > s[2]) s[2] = x;
        if (yy > s[3]) s[3] = yy;
        s[4]++;
      }
    }
    return out;
  }
  function soloStats(buf, W, H) {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9, area = 0;
    for (let y = 0; y < H; y++) {
      const yy = H - 1 - y, row = y * W * 4;
      for (let x = 0; x < W; x++) {
        const i = row + x * 4;
        if ((buf[i] | buf[i + 1] | buf[i + 2]) === 0) continue;
        if (x < mnx) mnx = x;
        if (yy < mny) mny = yy;
        if (x > mxx) mxx = x;
        if (yy > mxy) mxy = yy;
        area++;
      }
    }
    return area ? { bbox: [mnx, mny, mxx - mnx + 1, mxy - mny + 1], area } : null;
  }

  function cameraBlock(W, H) {
    const c = camera;
    c.updateMatrixWorld();
    const fy = H / (2 * Math.tan(((c.fov * Math.PI) / 180) / 2));
    const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
    const [lon, lat] = unproject(c.position.x, c.position.z);
    return {
      pos: c.position.toArray().map((v) => +v.toFixed(3)),
      quat: c.quaternion.toArray().map((v) => +v.toFixed(6)),
      yaw: +e.y.toFixed(5), pitch: +e.x.toFixed(5), roll: +e.z.toFixed(5),
      fov_y_deg: c.fov, aspect: +(W / H).toFixed(6), near: c.near, far: c.far,
      K: [[+fy.toFixed(3), 0, W / 2], [0, +fy.toFixed(3), H / 2], [0, 0, 1]],
      lonlat: [+lon.toFixed(7), +lat.toFixed(7)],
    };
  }

  // =====================================================================
  //  the public capture
  // =====================================================================
  let syncRead = false;
  async function capture(opts = {}) {
    const restore = opts.restore ?? mode;
    busy = true;
    syncRead = !!opts.sync;
    const t0 = performance.now();
    try {
      const size = opts.size || drawSize();
      const [W, H] = size;
      const minpx = opts.minpx ?? 30;
      const amodalMax = opts.amodalmax ?? 24;
      const amodalBld = opts.amodalbuildings ?? 4;
      const amodalN = opts.amodal ?? 8;
      const depthMax = opts.depthmax ?? 1000;
      const visFar = opts.visfar ?? 150;
      if (opts.idradius) idRadius = opts.idradius;
      uni.uDepthMax.value = depthMax;
      uni.uVisFar.value = visFar;
      const want = Object.assign({ rgb: 1, semantic: 1, instance: 1, depth: 1, depth_vis: 1, amodal: 1, panel: 1 }, opts.want || {});
      const png = {};
      // opts.raw (src/api/bridge.js): the external API takes the raw RGBA buffers (GL row order, bottom-up) instead of PNGs
      const raw = opts.raw ? {} : null;
      // per-phase milliseconds for a raw caller (the API reports them with every tick)
      const tm = raw ? {} : null;
      for (const k in rrT) rrT[k] = 0;
      let tl = performance.now();
      const lap = (k) => { if (!tm) return; const n = performance.now(); tm[k] = +(n - tl).toFixed(1); tl = n; };

      // ---- 1. instance buffer -> visible stats (a raw caller that wants neither labels nor the instance image —
      // the API's semantic- or depth-only cameras, want.labels = 0 — skips the pass)
      const inst = !raw || want.instance || want.labels !== 0 ? await renderRead('instance', { size }) : null;
      lap('instance');
      const st = inst ? statsOf(inst.buf, W, H) : new Map();
      if (want.instance) { if (raw) raw.instance = inst.buf; else png.instance = pngFrom(inst.buf, W, H); }

      // ---- 2. labels for every visible thing
      const rows = [];
      let unknown = 0;
      for (const [code, s] of st) {
        const id = decodeCode(code);
        const mi = meta[id - 1];
        if (!mi) { unknown += s[4]; continue; }
        if (s[4] < minpx) continue;
        const cl = CLASS_BY_ID.get(mi.cls) || CLS0;
        rows.push({
          id, code, rgb: [code & 255, (code >> 8) & 255, (code >> 16) & 255],
          class_id: mi.cls, class: cl.name, key: mi.key,
          bbox: [s[0], s[1], s[2] - s[0] + 1, s[3] - s[1] + 1], area: s[4],
          truncated: s[0] <= 0 || s[1] <= 0 || s[2] >= W - 1 || s[3] >= H - 1,
          pose: mi.pose || undefined,
        });
      }
      rows.sort((a, b) => b.area - a.area);

      lap('labels');
      // ---- 3. amodal solo passes
      const amodal = {};
      let measured = 0, bld = 0;
      for (const r of rows) {
        if (measured >= amodalMax) break;
        if (!AMODAL_CLASSES.has(r.class_id)) continue;
        if (r.class_id === CID.building && ++bld > amodalBld) continue;
        const meshes = soloGroups.get(r.class_id);
        if (!meshes || !meshes.size) continue;
        const solo = await renderRead('instance', { size, solo: { code: r.code, meshes: [...meshes] } });
        const ss = soloStats(solo.buf, W, H);
        measured++;
        if (!ss || ss.area <= r.area) { r.amodal_bbox = r.bbox; r.amodal_area = r.area; r.occlusion = 0; continue; }
        r.amodal_bbox = ss.bbox;
        r.amodal_area = ss.area;
        r.occlusion = +(1 - r.area / ss.area).toFixed(4);
        r.__mask = solo;
      }
      const visible = {};
      const occluded = rows.filter((r) => r.__mask && r.occlusion > 0.02)
        .sort((a, b) => b.occlusion - a.occlusion).slice(0, amodalN);
      for (const r of occluded) {
        // the path is only written when the PNG actually is: a clip run turns
        // the mask encoding off (`--amodalpng 0`) and labels.json must not name
        // a file that does not exist — the measurements stay either way
        if (!want.amodal || raw) continue;
        const tag = String(r.id).padStart(5, '0');
        r.amodal_mask = `amodal/${tag}.png`;
        r.visible_mask = `visible/${tag}.png`;
        amodal[tag] = pngFrom(r.__mask.buf, W, H, MASK_XF);
        visible[tag] = pngFrom(inst.buf, W, H, codeXf(r.code));
      }
      for (const r of rows) delete r.__mask;

      lap('amodal');
      // ---- 4. semantic
      let semBuf = null;
      if (want.semantic || want.panel) {
        const sem = await renderRead('semantic', { size });
        semBuf = sem.buf;
        if (want.semantic) { if (raw) raw.semantic = sem.buf; else png.semantic = pngFrom(sem.buf, W, H); }
      }
      lap('semantic');
      // ---- 5. depth
      if (want.depth) { const dr = (await renderRead('depthraw', { size })).buf; if (raw) raw.depth = dr; else png.depth = pngFrom(dr, W, H); }
      let visBuf = null;
      if (want.depth_vis || want.panel) {
        const d = await renderRead('depth', { size });
        visBuf = d.buf;
        if (want.depth_vis) png.depth_vis = pngFrom(d.buf, W, H);
      }

      // ---- 6. the beauty frame (full post chain). Restore the world FIRST,
      // then render three times so TAA history converges on the real frame.
      //
      // The grab is `gl.readPixels` of the DEFAULT FRAMEBUFFER, not a
      // `drawImage()` of the WebGL canvas. drawImage goes through Chromium's
      // canvas-snapshot path, and on this ANGLE/D3D11 box that path can be
      // handed a surface the GPU has not finished writing: 37 of the first
      // 300 frames of the ad clip came back with a hard VERTICAL seam — real
      // pixels to the left of it, the colour grade's lifted black (~17,14,13,
      // i.e. "nothing was rendered here") to the right — and 25 of those had
      // the seam at x = 0, a completely black RGB panel. The failure rate
      // CLIMBED through the clip (1 in 50 at the start, 1 in 2 by frame 240)
      // as the scene got heavier, which is the signature of a race against
      // outstanding GPU work rather than of a bad frame. It is the same
      // ANGLE/D3D11 present race `tools/ad/record.mjs` hit with Playwright
      // screenshots ("a hard vertical seam with a flat dark panel on one
      // side"), and re-submitting the frame first — which this code already
      // did, three times — does not close it.
      //
      // readPixels is the SAME synchronising readback the label buffers use
      // (300 frames x 5 buffers, zero corruption), it completes all pending
      // work targeting the framebuffer before it returns, and it never
      // touches the compositor surface. `preserveDrawingBuffer` stops
      // mattering too: the read happens before the buffer is presented.
      //
      // The frame itself is rendered by the ENGINE'S OWN LOOP, not by calling
      // `engine.composer.render()` from here. That was the other half of the
      // black panel: the composer's TAA blends the new frame against a history
      // buffer, and the engine's loop is what maintains that history along with
      // the jitter and the still/moving blend (engine.js: `taa.stillBlend`,
      // `setViewOffset`). A capture renders nothing through the loop for a
      // second or more, so `_still` saturates, the blend goes almost entirely
      // to history — and three hand-made composer renders converge on nothing.
      // What came out was the colour grade over an empty history: a uniformly
      // near-black frame, which is exactly what the panels showed. Swapping the
      // hand-render for engine frames fixed the ones the re-shoot could not
      // (46 re-shoots, 7 still blank, before this).
      //
      // In `?record=1` an rAF with no pending step runs the frame body with
      // dt = 0 (main.js:621), so the camera, the traffic and the clock do NOT
      // move between the label buffers and the beauty frame — the same dt = 0
      // re-submit `tools/ad/record.mjs` uses before every screenshot.
      lap('depth');
      exit();
      lap('exit');
      let rgbCanvas = null;
      const rgb0 = rgbRetries, rgbF0 = rgbFailed;
      if (want.rgb || want.panel) {
        const gl = renderer.domElement;
        const RW = gl.width, RH = gl.height;
        const ctx = renderer.getContext();
        const px = new Uint8Array(RW * RH * 4);
        const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
        let ok = false;
        for (let att = 0; att < RGB_ATTEMPTS && !ok; att++) {
          for (let k = 0; k < (att ? 6 : 3); k++) await nextFrame();
          // Read INSIDE an rAF callback, immediately after the engine's own
          // render for that frame: the engine re-arms its rAF at the TOP of its
          // loop, so its callback is registered before this one and runs first,
          // and the drawing buffer is still live when this one runs.
          await new Promise((res) => requestAnimationFrame(() => {
            renderer.setRenderTarget(null);
            ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);   // see renderRead: a bound pack buffer swallows the read
            ctx.readPixels(0, 0, RW, RH, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
            res();
          }));
          ok = !blankBand(px, RW, RH);
          if (!ok) { rgbRetries++; if (att === RGB_ATTEMPTS - 1) rgbFailed++; }
        }
        if (raw) { raw.rgb = px; raw.rgbSize = [RW, RH]; }
        else {
          rgbCanvas = canvasFrom(px, RW, RH);
          if (want.rgb) png.rgb = rgbCanvas.toDataURL('image/png');
        }
      }

      const labels = {
        frame: opts.frame ?? null,
        t: opts.t ?? null,
        image: { width: W, height: H, rgb: 'rgb.png' },
        camera: cameraBlock(W, H),
        depth: { max_m: depthMax, encoding: 'rgb24-be', vis_far_m: visFar },
        instance_encoding: { mul: ID_MUL, inv: ID_INV, mod: ID_MOD, note: 'code = (id*mul) mod 2^24; pixel = (code&255, (code>>8)&255, code>>16)' },
        classes: CLASSES,
        instances: rows,
        counts: {
          instances: rows.length, amodal_measured: measured, amodal_masks: occluded.length, unlabeled_id_px: unknown,
          // how many times the beauty-frame readback tripped the blank/torn
          // gate and had to be re-rendered, and whether it was still tripping
          // on the last attempt. `rgb_flagged` is a SUSPICION, not a verdict —
          // the gate is trigger-happy by design (see blankBand) and a very dark
          // frame can set it. `tools/perception/scanclip.mjs` is what says
          // whether a finished clip actually has a bad panel in it.
          rgb_retries: rgbRetries - rgb0, rgb_flagged: rgbFailed - rgbF0,
        },
        ms: +(performance.now() - t0).toFixed(0),
      };

      // ---- 7. composited video panel
      if (want.panel && rgbCanvas && semBuf) { await panelFonts(); png.panel = buildPanel(rgbCanvas, semBuf, inst.buf, visBuf, W, H, labels, opts); }

      busy = false; syncRead = false;
      if (restore) enter(restore);
      if (tm) for (const k in rrT) tm['pass_' + k] = +rrT[k].toFixed(1);
      return { labels, png, amodal, visible, raw, timing: tm };
    } catch (e) {
      busy = false; syncRead = false;
      try { exit(); if (restore) enter(restore); } catch { /* leave the world alone */ }
      throw e;
    }
  }

  // =====================================================================
  //  the composited "perception" video frame — a 16:9 dashboard:
  //    RGB + boxes 2/3 wide, semantic + instance stacked on the right,
  //    depth and the class legend along the bottom strip.
  // =====================================================================
  // ---- panel typography (owner review 2026-09-24: "the text overlays are way
  // too basic and rough looking"). Every caption sits on a rounded,
  // half-transparent black GLASS box: a blurred copy of what is behind it,
  // darkened, with a hairline edge. The type is Inter (public/fonts, SIL OFL).
  // Every box is sized from its measured text and CLIPS it, so no text can
  // leave its box. Headings say plainly what the viewer is looking at.
  const PANEL_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
  const PANEL_MONO = 'Consolas, "Cascadia Mono", ui-monospace, monospace';
  let panelFontsP = null;
  function panelFonts() {
    if (!panelFontsP) {
      panelFontsP = Promise.all([400, 500, 600, 700].map((w) => {
        const f = new FontFace('Inter', `url(fonts/Inter-${w}.ttf)`, { weight: String(w) });
        document.fonts.add(f);
        return f.load().catch(() => null);
      }));
    }
    return panelFontsP;
  }
  const rrect = (cx, x, y, w, h, r) => { cx.beginPath(); cx.roundRect(x, y, w, h, r); };
  function glass(cx, x, y, w, h, o = {}) {
    const r = o.r ?? 12;
    cx.save();
    rrect(cx, x, y, w, h, r);
    cx.clip();
    if (o.blur !== 0) {
      const m = 28;
      cx.filter = `blur(${o.blur ?? 12}px)`;
      cx.drawImage(cx.canvas, x - m, y - m, w + 2 * m, h + 2 * m, x - m, y - m, w + 2 * m, h + 2 * m);
      cx.filter = 'none';
    }
    cx.fillStyle = o.fill || 'rgba(6,8,11,0.58)';
    cx.fillRect(x, y, w, h);
    cx.restore();
    cx.save();
    rrect(cx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    cx.strokeStyle = o.edge || 'rgba(255,255,255,0.14)';
    cx.lineWidth = 1;
    cx.stroke();
    cx.restore();
  }
  function wrapLines(cx, text, font, maxW) {
    cx.font = font;
    const out = [];
    let line = '';
    for (const w of String(text).split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (!line || cx.measureText(t).width <= maxW) line = t;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
    return out;
  }
  // a caption card: a heading and an optional description, sized to the text
  function card(cx, x, y, head, sub, maxW, o = {}) {
    const hs = o.hs ?? 17, ss = o.ss ?? 13, px = o.px ?? 14, py = o.py ?? 10, r = o.r ?? 12;
    const HF = `600 ${hs}px ${PANEL_FONT}`, SF = `400 ${ss}px ${PANEL_FONT}`;
    const hl = wrapLines(cx, head, HF, maxW - 2 * px);
    const sl = sub ? wrapLines(cx, sub, SF, maxW - 2 * px) : [];
    const hh = hs * 1.28, sh = ss * 1.4, gap = sl.length ? 3 : 0;
    let tw = 0;
    cx.font = HF; for (const l of hl) tw = Math.max(tw, cx.measureText(l).width);
    cx.font = SF; for (const l of sl) tw = Math.max(tw, cx.measureText(l).width);
    const w = Math.min(maxW, Math.ceil(tw) + 2 * px), h = Math.ceil(2 * py + hl.length * hh + gap + sl.length * sh);
    glass(cx, x, y, w, h, { r });
    cx.save();
    rrect(cx, x, y, w, h, r);
    cx.clip();
    let ty = y + py;
    cx.font = HF; cx.fillStyle = '#f3f6fa';
    for (const l of hl) { cx.fillText(l, x + px, ty + hs * 1.02); ty += hh; }
    ty += gap;
    cx.font = SF; cx.fillStyle = 'rgba(214,224,235,0.80)';
    for (const l of sl) { cx.fillText(l, x + px, ty + ss * 1.06); ty += sh; }
    cx.restore();
    return { w, h };
  }

  function buildPanel(rgbCanvas, semBuf, instBuf, visBuf, W, H, labels, opts) {
    const PW = opts.panelWidth || 1920, PH = Math.round((PW * 9) / 16);
    const mainW = Math.round(PW * (2 / 3)), mainH = Math.round((mainW * H) / W);
    const sideW = PW - mainW, sideH = Math.round((sideW * H) / W);
    const cv = document.createElement('canvas');
    cv.width = PW; cv.height = PH;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#0a0b0d';
    cx.fillRect(0, 0, PW, PH);
    cx.textBaseline = 'alphabetic';

    // ---- main: RGB with boxes
    cx.drawImage(rgbCanvas, 0, 0, rgbCanvas.width, rgbCanvas.height, 0, 0, mainW, mainH);
    const sx = mainW / W, sy = mainH / H;
    const px2 = (W * H) / (1280 * 720);                 // thresholds scale with resolution
    const boxmin = (opts.boxminpx ?? 200) * px2;
    const labelmin = (opts.labelminpx ?? 1800) * px2;
    cx.lineJoin = 'miter';
    // amodal extents: WHITE dashed, so "how far the object really goes" reads
    // instantly against any background. It always encloses the instance's own
    // solid box, so no colour coding is needed to associate the two.
    for (const r of labels.instances) {
      if (!r.amodal_bbox || r.area < boxmin || !(r.occlusion > 0.02)) continue;
      const x = r.amodal_bbox[0] * sx, y = r.amodal_bbox[1] * sy;
      const w = r.amodal_bbox[2] * sx, h = r.amodal_bbox[3] * sy;
      cx.setLineDash([8, 6]);
      cx.strokeStyle = 'rgba(0,0,0,0.55)';              // casing, so it survives on white
      cx.lineWidth = 3.2;
      cx.strokeRect(x, y, w, h);
      cx.strokeStyle = 'rgba(255,255,255,0.96)';
      cx.lineWidth = 1.6;
      cx.strokeRect(x, y, w, h);
    }
    cx.setLineDash([]);
    const tags = [];
    for (const r of labels.instances) {                 // visible boxes, solid
      if (r.area < boxmin) continue;
      const c = (CLASS_BY_ID.get(r.class_id) || CLS0).rgb;
      const x = r.bbox[0] * sx, y = r.bbox[1] * sy, w = r.bbox[2] * sx, h = r.bbox[3] * sy;
      cx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      cx.lineWidth = 2;
      cx.strokeRect(x, y, w, h);
      if (r.area >= labelmin) tags.push([r, c, x, y, w, h]);   // boxes for all, text only for the readable ones
    }
    // class tags: rounded pills in the class colour, kept inside the RGB view.
    // Biggest objects first; a tag that would touch a placed tag or the
    // caption card is left out rather than drawn over another one.
    cx.font = `600 12px ${PANEL_FONT}`;
    const placed = [{ x: 0, y: 0, w: Math.min(mainW, 640), h: 84 }];
    tags.sort((p, q) => q[0].area - p[0].area);
    for (const [r, c, x, y, w, h] of tags) {
      const name = r.class.replace(/_/g, ' ');
      const txt = r.occlusion > 0.02 ? `${name}  ${Math.round(r.occlusion * 100)}% hidden` : name;
      const tw = Math.ceil(cx.measureText(txt).width) + 12, th = 18;
      const tx = Math.max(0, Math.min(x, mainW - tw));
      let ty = y - th - 2 < 0 ? y + h + 2 : y - th - 2;
      ty = Math.max(0, Math.min(ty, mainH - th));
      if (placed.some((q) => tx < q.x + q.w + 3 && q.x < tx + tw + 3 && ty < q.y + q.h + 3 && q.y < ty + th + 3)) continue;
      placed.push({ x: tx, y: ty, w: tw, h: th });
      rrect(cx, tx, ty, tw, th, 5);
      cx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.93)`;
      cx.fill();
      cx.fillStyle = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 > 150 ? '#0b0d10' : '#ffffff';
      cx.fillText(txt, tx + 6, ty + 13);
    }

    // ---- right column: semantic over instance
    const semC = bufToImageData(semBuf, W, H);
    const insC = bufToImageData(instBuf, W, H);
    cx.drawImage(semC, 0, 0, W, H, mainW, 0, sideW, sideH);
    cx.drawImage(insC, 0, 0, W, H, mainW, sideH, sideW, sideH);

    // ---- bottom strip: depth, then one card with the heading, the frame's
    // provenance, the class legend and a live window on labels.json
    const n = labels.counts;
    const stripY = Math.max(mainH, sideH * 2);
    const stripH = PH - stripY;
    let dw = 0;
    if (stripH > 20) {
      dw = Math.round((stripH * W) / H);
      if (visBuf) {
        const vC = bufToImageData(visBuf, W, H);
        cx.drawImage(vC, 0, 0, W, H, 0, stripY, dw, stripH);
      }
      const X0 = dw + 16, Y0 = stripY + 14, CW = PW - X0 - 16, CH = PH - Y0 - 14, pad = 22;
      glass(cx, X0, Y0, CW, CH, { r: 16, blur: 0, fill: 'rgba(255,255,255,0.035)', edge: 'rgba(255,255,255,0.11)' });
      cx.save();
      rrect(cx, X0, Y0, CW, CH, 16);
      cx.clip();
      const inner = CW - 2 * pad;
      let y = Y0 + pad;
      const lines = (text, font, color, lh) => {
        cx.fillStyle = color;
        for (const l of wrapLines(cx, text, font, inner)) { cx.fillText(l, X0 + pad, y + lh * 0.78); y += lh; }
      };
      lines('Ground Truth Masks and Boxes for Model Training', `600 28px ${PANEL_FONT}`, '#f4f7fb', 36);
      y += 4;
      const cam = labels.camera;
      const lat = cam.lonlat[1], lon = cam.lonlat[0];
      lines([opts.sceneLabel || 'New York City',
        `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${lon < 0 ? 'W' : 'E'}`,
        `${cam.fov_y_deg}° vertical field of view`, `${labels.image.width} × ${labels.image.height} pixels`,
        `frame ${labels.frame ?? 0}`].join('   ·   '), `400 14px ${PANEL_FONT}`, '#9fb0c2', 20);
      lines(`${n.instances} labelled objects   ·   ${n.amodal_measured} with measured occlusion   ·   ${n.amodal_masks} masks of hidden parts written`,
        `500 14px ${PANEL_FONT}`, '#d3dce6', 20);
      // the class legend: every class in this frame, with its object count
      const byCls = {};
      for (const r of labels.instances) byCls[r.class_id] = (byCls[r.class_id] || 0) + 1;
      const seen = new Set(labels.instances.map((r) => r.class_id));
      for (const c of CLASSES) if (!c.isthing && c.id > 1) seen.add(c.id);
      const chips = [...seen].sort((a, b) => a - b).map((i) => CLASS_BY_ID.get(i)).filter(Boolean);
      y += 8;
      let lx = X0 + pad, ly = y;
      cx.font = `500 12.5px ${PANEL_FONT}`;
      for (const c of chips) {
        const nm = c.name.replace(/_/g, ' '), txt = byCls[c.id] ? `${nm}  ${byCls[c.id]}` : nm;
        const tw = Math.ceil(cx.measureText(txt).width) + 22;
        if (lx + tw > X0 + CW - pad) { lx = X0 + pad; ly += 21; }
        rrect(cx, lx, ly + 2, 12, 12, 3);
        cx.fillStyle = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
        cx.fill();
        cx.strokeStyle = 'rgba(255,255,255,0.30)'; cx.lineWidth = 1;
        rrect(cx, lx + 0.5, ly + 2.5, 11, 11, 3);
        cx.stroke();
        cx.fillStyle = '#c9d3de';
        cx.fillText(txt, lx + 17, ly + 12.5);
        lx += tw + 10;
      }
      y = ly + 30;
      // a live window on labels.json: this is DATA, not a picture, so show the
      // rows being written for this frame
      const TY = y, TH = Y0 + CH - pad - TY;
      if (TH > 40) {
        glass(cx, X0 + pad, TY, inner, TH, { r: 10, blur: 0, fill: 'rgba(0,0,0,0.34)', edge: 'rgba(255,255,255,0.08)' });
        cx.save();
        rrect(cx, X0 + pad, TY, inner, TH, 10);
        cx.clip();
        const tx = X0 + pad + 14;
        let ry = TY + 20;
        cx.font = `600 12px ${PANEL_FONT}`;
        cx.fillStyle = '#8fa2b6';
        cx.fillText('labels.json, written for this frame', tx, ry);
        ry += 20;
        cx.font = `600 12px ${PANEL_MONO}`;
        cx.fillStyle = '#6f8196';
        cx.fillText('    id  ' + 'class'.padEnd(18) + 'box x, y, w, h'.padEnd(24) + 'area px'.padStart(8) + '  '
          + 'hidden'.padStart(6) + '   mask of the hidden part', tx + 14, ry);
        ry += 17;
        cx.font = `400 12px ${PANEL_MONO}`;
        for (const r of labels.instances) {
          if (ry > TY + TH - 8) break;
          if (!(r.area >= labelmin)) continue;
          const c = (CLASS_BY_ID.get(r.class_id) || CLS0).rgb;
          rrect(cx, tx, ry - 9, 8, 8, 2);
          cx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
          cx.fill();
          cx.fillStyle = '#b6c3d1';
          const occ = r.occlusion === undefined ? '-' : (r.occlusion * 100).toFixed(0) + '%';
          cx.fillText(String(r.id).padStart(6) + '  ' + r.class.padEnd(18) + r.bbox.join(', ').padEnd(24)
            + String(r.area).padStart(8) + '  ' + occ.padStart(6) + '   ' + (r.amodal_mask || ''), tx + 14, ry);
          ry += 16;
        }
        cx.restore();
      }
      cx.restore();
    }

    // ---- quadrant captions
    card(cx, 14, 14, 'Camera Image with Object Boxes',
      `${n.instances} objects   ·   solid box: the visible part   ·   dashed box: the full object, including what is hidden`, mainW - 28);
    card(cx, mainW + 12, 12, 'Semantic Classes', 'one colour for each class', sideW - 24);
    card(cx, mainW + 12, sideH + 12, 'Object Instances', `one colour for each object   ·   ${n.amodal_masks} masks of hidden parts`, sideW - 24);
    if (stripH > 20) card(cx, 12, stripY + 12, 'Depth', `0 to ${labels.depth.vis_far_m} m from the camera`, dw - 24);
    cx.strokeStyle = 'rgba(255,255,255,0.16)';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(mainW + 0.5, 0); cx.lineTo(mainW + 0.5, sideH * 2);
    cx.moveTo(mainW, sideH + 0.5); cx.lineTo(PW, sideH + 0.5);
    cx.moveTo(0, stripY + 0.5); cx.lineTo(PW, stripY + 0.5);
    cx.stroke();
    return cv.toDataURL('image/png');
  }

  // =====================================================================
  //  self test: the id bijection and PNG byte-exactness
  // =====================================================================
  async function selftest() {
    const out = { bijection: true, png: true, notes: [] };
    for (let i = 1; i < 8192; i++) if (decodeCode(encodeId(i)) !== i) { out.bijection = false; out.notes.push('bijection failed at ' + i); break; }
    const W = 64, H = 8, buf = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { buf[i * 4] = i & 255; buf[i * 4 + 1] = (i * 7) & 255; buf[i * 4 + 2] = (i * 31) & 255; buf[i * 4 + 3] = 255; }
    const url = pngFrom(buf, W, H);
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const g2 = c2.getContext('2d', { willReadFrequently: true });
    g2.drawImage(img, 0, 0);
    const back = g2.getImageData(0, 0, W, H).data;
    outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
      if (back[d] !== buf[s] || back[d + 1] !== buf[s + 1] || back[d + 2] !== buf[s + 2]) {
        out.png = false; out.notes.push(`png byte mismatch at ${x},${y}`); break outer;
      }
    }
    out.zones = zoneGrid ? zones.length : buildCrossZones();
    return out;
  }

  // WHICH MESH drew this pixel. Every swapped mesh is given a UNI material
  // carrying its index as the code, one render, one readback — so "the sky is
  // labelled building and 38 m away" becomes a name instead of a guess.
  // nx, ny are IMAGE coordinates in 0..1: ny = 0 is the TOP of the frame
  // (readPixels is bottom-up, hence the flip below).
  async function whoAt(nx = 0.5, ny = 0.1, size = null) {
    const restore = mode;
    busy = true;
    try {
      enter('semantic');
      const list = [...stash.keys()].filter((o) => o.material && o.material.userData.__seg);
      const probe = [];
      list.forEach((o, i) => { probe.push([o, o.material]); o.material = mkMat('UNI', { code: i + 1 }); });
      const [W, H] = size || drawSize();
      const target = rt(W, H);
      setClear([0, 0, 0]);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const x = Math.max(0, Math.min(W - 1, Math.round(nx * W)));
      const y = Math.max(0, Math.min(H - 1, Math.round((1 - ny) * H)));   // GL rows are bottom-up
      const buf = new Uint8Array(4);
      await renderer.readRenderTargetPixelsAsync(target, x, y, 1, 1, buf);
      renderer.setRenderTarget(null);
      for (const [o, m] of probe) o.material = m;
      const code = buf[0] | (buf[1] << 8) | (buf[2] << 16);
      const o = code > 0 ? list[code - 1] : null;
      const out = o ? {
        px: [x, y], code, name: o.name || o.type,
        parent: (o.parent && o.parent.name) || null,
        origMat: (stash.get(o) && (stash.get(o).name || stash.get(o).type)) || null,
        seg: (o.material && o.material.name) || null,
        instanced: !!o.isInstancedMesh, count: o.isInstancedMesh ? o.count : 1,
        dress: !!(o.userData && o.userData.nycDress),
        facade: !!(stash.get(o) && stash.get(o).userData && stash.get(o).userData.isFacade),
      } : { px: [x, y], code, name: '(clear colour — nothing drew here)' };
      busy = false;
      if (restore) enter(restore); else exit();
      return out;
    } catch (e) {
      busy = false;
      try { exit(); } catch { /* */ }
      throw e;
    }
  }

  const api = {
    enter, exit, refresh, capture, selftest, buildCrossZones, whoAt,
    get mode() { return mode; },
    classes: CLASSES,
    encodeId, decodeCode,
    async labels(o = {}) {
      const r = await capture({ ...o, want: { rgb: 0, instance: 0, semantic: 0, depth: 0, depth_vis: 0, amodal: 0, panel: 0 } });
      return r.labels;
    },
    stats() {
      return {
        mode, matMode, instances: meta.length, swapped: stash.size, hidden: hidden.length,
        pools: instancer ? instancer.pools.size : 0, zones: zones ? zones.length : 0,
        soloGroups: [...soloGroups.entries()].map(([k, v]) => `${(CLASS_BY_ID.get(k) || CLS0).name}:${v.size}`),
        unknownPools: [..._unknownPools],
        rgbRetries, rgbFailed,
      };
    },
  };
  if (typeof window !== 'undefined') window.__PERC = api;
  return api;
}
