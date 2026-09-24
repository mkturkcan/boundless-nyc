// TRAILER DEMO — "building template morph".
//
// One procedural building on a lot whose footprint (width / depth) and story
// count animate continuously. The building is FULLY REGENERATED every frame
// from the same module contract the city uses (src/buildings/index.js), so the
// viewer watches floors appear, bays re-flow, storefronts/cornices re-fit and
// palettes switch as the type cycles.
//
// Deterministic capture contract (tools/trailer/morph-record.mjs):
//   window.__step(dt)  advance the timeline by dt seconds and render ONE frame
//   window.__frame     frames rendered so far
//   window.__READY     true once the first frame is on screen
//   window.__STATS()   { ms, calls, tris, type, w, d, stories, t }
//
// Query flags:
//   ?record=1          no rAF loop — the recorder drives __step()
//   ?time=golden|noon|night|dusk
//   ?dur=18            seconds for one full pass through the segment list
//   ?seg=2             jump straight into segment N (preview)
//   ?hud=0             hide the debug HUD (implied by record=1)
//   ?size=1920x1080    force a canvas size (record mode uses the viewport)
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createMaterials } from '../materials.js';
import { Batcher } from '../batcher.js';
import { makeKit } from '../kit.js';
import { generateBuilding } from '../buildings/index.js';
import { makeRng } from '../rng.js';
import { cloudTexture } from '../textures.js';
import { tmat, box, boxUV } from '../geo.js';

const params = new URLSearchParams(location.search);
const P = {
  record: params.get('record') === '1',
  time: params.get('time') || 'golden',
  dur: Number(params.get('dur') || 18),
  seg: params.get('seg') !== null ? Number(params.get('seg')) : null,
  hud: params.get('hud') !== '0',
};
P.night = P.time === 'night';
if (P.record) P.hud = false;

const app = document.getElementById('app');
const hud = document.getElementById('hud');
if (!P.hud) hud.style.display = 'none';

// ---------------------------------------------------------------------------
// The morph timeline. Each segment holds ONE building type while the lot
// breathes: width/depth/stories ride a raised cosine that is at its minimum at
// both ends, so the cut between types lands on the smallest massing and reads
// as a continuation rather than a jump.
// ---------------------------------------------------------------------------
const SEGMENTS = [
  { type: 'tenement',   w: [6.6, 12.4], d: [13, 20], st: [4, 7],   commercial: true,  seed: 7 },
  { type: 'brownstone', w: [5.4, 9.6],  d: [12, 18], st: [3, 5],   commercial: false, seed: 12 },
  { type: 'castiron',   w: [9.0, 19.5], d: [14, 24], st: [4, 7],   commercial: true,  seed: 3 },
  { type: 'prewar',     w: [12, 26],    d: [16, 26], st: [6, 13],  commercial: true,  seed: 21 },
  { type: 'deco',       w: [14, 30],    d: [18, 28], st: [7, 17],  commercial: true,  seed: 5 },
  { type: 'glasstower', w: [14, 28],    d: [18, 28], st: [8, 20],  commercial: true,  seed: 9 },
];

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: false, powerPreference: 'high-performance', stencil: false,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(P.record ? 1 : Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.25, 4000);

// ---------------------------------------------------------------------------
// Lighting / sky (mirrors src/main.js so the demo matches the project look)
// ---------------------------------------------------------------------------
const TIMES = {
  golden: { elev: 13, azim: 245, expo: 0.82, turb: 5.5, rayl: 2.4, mieC: 0.006, mieG: 0.82, sunI: 4.3, sunC: 0xffc98e, envI: 0.30, fogLinear: [600, 3400], fogC: 0x6a7280, amb: 0.06, ambC: 0xd8c0a0, hemi: 0.30, hemiSky: 0xb9a487, hemiGround: 0x8b7a63 },
  dusk:   { elev: 5,  azim: 252, expo: 0.95, turb: 6.5, rayl: 2.9, mieC: 0.008, mieG: 0.84, sunI: 3.1, sunC: 0xffb277, envI: 0.36, fogLinear: [500, 3000], fogC: 0x5a5f70, amb: 0.07, ambC: 0xd0b49a, hemi: 0.34, hemiSky: 0xa08c78, hemiGround: 0x76685a },
  noon:   { elev: 58, azim: 155, expo: 0.32, turb: 4.6, rayl: 2.8, mieC: 0.002, mieG: 0.8,  sunI: 6.0, sunC: 0xfff2dd, envI: 0.18, fogLinear: [2200, 4200], fogC: 0x6d7684, amb: 0.05, ambC: 0xc8c4bc, hemi: 0.18, hemiSky: 0x92a6c0, hemiGround: 0x8e8478 },
  night:  { elev: -6, azim: 0,   expo: 1.15, turb: 6,   rayl: 2.2, mieC: 0.006, mieG: 0.8,  sunI: 0.0, sunC: 0x223048, envI: 0.20, fog: 0.0010, fogC: 0x241a12, amb: 0.05, hemi: 0.14, hemiSky: 0x2a3450, hemiGround: 0x161c26 },
};
const T = { ...(TIMES[P.time] || TIMES.golden) };

const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
const sunDir = new THREE.Vector3();
// showcase buildings face +z — swing the sun round for three-quarter light
const azim = (T.azim + 135) % 360;
{
  const phi = THREE.MathUtils.degToRad(90 - T.elev);
  const theta = THREE.MathUtils.degToRad(azim);
  sunDir.setFromSphericalCoords(1, phi, theta);
  const u = sky.material.uniforms;
  u.turbidity.value = T.turb;
  u.rayleigh.value = T.rayl;
  u.mieCoefficient.value = T.mieC;
  u.mieDirectionalG.value = T.mieG;
  u.sunPosition.value.copy(sunDir);
  if (u.showSunDisc) u.showSunDisc.value = 0;
}
renderer.toneMappingExposure = T.expo;

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(20000);
  const u2 = sky2.material.uniforms;
  u2.turbidity.value = T.turb; u2.rayleigh.value = T.rayl;
  u2.mieCoefficient.value = T.mieC; u2.mieDirectionalG.value = T.mieG;
  u2.sunPosition.value.copy(sunDir);
  if (u2.showSunDisc) u2.showSunDisc.value = 0;
  skyScene.add(sky2);
  const env = pmrem.fromScene(skyScene, 0.02);
  scene.environment = env.texture;
  scene.environmentIntensity = T.envI;
  pmrem.dispose();
}

const sun = new THREE.DirectionalLight(T.sunC, T.sunI);
sun.position.copy(sunDir).multiplyScalar(500);
sun.castShadow = T.sunI > 0.1;
scene.add(sun);
scene.add(sun.target);
if (T.amb > 0) scene.add(new THREE.AmbientLight(T.ambC || 0xbdc8d8, T.amb));
if (T.hemi) scene.add(new THREE.HemisphereLight(T.hemiSky || 0xa9b6c6, T.hemiGround || 0x8b7a63, T.hemi));

// cloud deck (the pure-gradient sky is the #1 render tell)
{
  const cloudTex = cloudTexture({ seed: 3 });
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const DECK = 14000, TILE = 1700;
  cloudTex.repeat.set(DECK / TILE, DECK / TILE);
  const isNight = T.sunI === 0;
  const cm = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true,
    color: isNight ? new THREE.Color(0x4a3e34) : new THREE.Color(T.sunC).lerp(new THREE.Color(1, 1, 1), 0.55),
    opacity: isNight ? 0.65 : 0.92,
  });
  const geo = new THREE.PlaneGeometry(DECK, DECK, 48, 48);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    const t = Math.min(1, Math.max(0, (r - 1800) / 1600));
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = 1 - t * t * (3 - 2 * t);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const deck = new THREE.Mesh(geo, cm);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 900;
  deck.renderOrder = -1;
  deck.frustumCulled = false;
  deck.onBeforeRender = (_r, _s, cam) => {
    deck.position.x = cam.position.x;
    deck.position.z = cam.position.z;
    cloudTex.offset.set(cam.position.x / TILE, -cam.position.z / TILE);
    deck.updateMatrixWorld();
  };
  scene.add(deck);
}

if (P.night) {
  const gc = document.createElement('canvas');
  gc.width = 4; gc.height = 256;
  const gctx = gc.getContext('2d');
  const grad = gctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#232b40');
  grad.addColorStop(0.25, '#2a2a38');
  grad.addColorStop(0.45, '#2c2520');
  grad.addColorStop(1, '#4a3826');
  gctx.fillStyle = grad; gctx.fillRect(0, 0, 4, 256);
  const bgTex = new THREE.CanvasTexture(gc);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  sky.visible = false;
  scene.add(new THREE.HemisphereLight(0x2a3450, 0x141118, 0.12));
}
// demo-scale aerial perspective: the whole set lives inside 300 m, so the city
// preset's 600 m fog start would give the frame zero depth cueing
scene.fog = new THREE.Fog(T.fogC, 30, P.night ? 240 : 320);

// ---------------------------------------------------------------------------
// Two batchers: the street is built once, the building every frame.
// ---------------------------------------------------------------------------
const { M, extra } = createMaterials();
const staticB = new Batcher(M);
const staticKit = makeKit(staticB, extra);
const dynB = new Batcher(M);
const dynKit = makeKit(dynB, extra);
const dynCtx = { batcher: dynB, kit: dynKit, extra };

const GLASS_ALIASES = ['loft:glassInd', 'tenement:glass', 'castiron:glassWin', 'castiron:glassBig'];
function forceGlassAliases() {
  const g = M.get('glass');
  for (const a of GLASS_ALIASES) M.set(a, g);
}

// ---- static street ---------------------------------------------------------
{
  const SW = 210;                                  // sidewalk strip length (X)
  const g1 = box(SW, 0.14, 4.6, { segY: 1 }); boxUV(g1, SW, 0.14, 4.6, 3);
  staticB.addMerged('sidewalk', g1, tmat(0, 0, 2.3));
  const curb = box(SW, 0.16, 0.34, { segY: 1 });
  staticB.addMerged('graniteBase', curb, tmat(0, 0, 4.77));
  const road = new THREE.PlaneGeometry(SW + 120, 60); road.rotateX(-Math.PI / 2);
  staticB.addMerged('asphalt', road, tmat(0, -0.02, 25));
  // ground far enough out that the camera never finds its edge
  const back = new THREE.PlaneGeometry(1400, 1100); back.rotateX(-Math.PI / 2);
  staticB.addMerged('asphalt', back, tmat(0, -0.08, -430));

  // context block behind + far skyline band: without them the frame shows a
  // void over the party walls, which reads as a turntable, not a street
  const cr = makeRng(4242);
  for (let row = 0; row < 3; row++) {
    const z = [-74, -142, -265][row];
    const hLo = [9, 14, 22][row], hHi = [17, 30, 62][row];
    const wid = [19, 26, 40][row];
    for (let i = -6; i <= 6; i++) {
      const w = wid * cr.range(0.7, 1.25);
      const h = cr.range(hLo, hHi);
      const x = i * (wid + 6) + cr.range(-4, 4);
      if (Math.abs(x) < 24 && row === 0) continue;   // keep the lot's rear clear
      const g = box(w, h, wid * 0.9);
      staticB.addMerged('fillerFacade', g, tmat(x, 0, z), {
        tint: new THREE.Color().setHSL(cr.range(0.04, 0.10), cr.range(0.02, 0.09), cr.range(0.30, 0.46)),
      });
    }
  }

  staticKit.streetlight(tmat(-31, 0.14, 3.7, Math.PI), { kind: 'crook' });
  staticKit.streetlight(tmat(34, 0.14, 3.7, Math.PI), { kind: 'crook' });
  staticKit.hydrant(tmat(21.5, 0.14, 3.5, 1.2));
  staticKit.tree(tmat(-25.5, 0.14, 3.4), { scale: 1.05 });
  staticKit.tree(tmat(26.5, 0.14, 3.4), { scale: 0.92 });
  staticKit.trashCan(tmat(-29.5, 0.14, 3.4));
  staticKit.signPole(tmat(-30.2, 0.14, 3.9, Math.PI), { signs: ['noparking'] });
  const street = staticB.build();
  street.name = 'street';
  street.traverse((o) => { if (o.isMesh && /^merge:(fillerFacade|groundDark)$/.test(o.name)) o.castShadow = false; });
  scene.add(street);
}

// ---------------------------------------------------------------------------
// Per-frame building rebuild
// ---------------------------------------------------------------------------
let current = null;                                 // THREE.Group of the last build
let lastBuildMs = 0;
const state = { type: '', w: 0, d: 0, stories: 0, height: 18 };

function disposeGroup(g) {
  if (!g) return;
  scene.remove(g);
  for (const o of g.children) {
    if (o.isInstancedMesh) o.dispose();             // frees instance buffers, keeps shared part geom
    else if (o.isMesh) o.geometry.dispose();        // merged geometry is per-build
  }
  g.clear();
}

// party-wall neighbours re-roll with the segment so the whole block, not just
// the subject, reads as a different street when the type changes
const NEIGHBOURS = [
  ['brickBrown', 'brickTan'], ['brownstone', 'brickRed'], ['brickRed', 'brickPaintedCream'],
  ['brickTan', 'limestone'], ['brickPaintedGray', 'brickBrown'], ['limestone', 'brickOrange'],
];

function rebuild(type, w, d, stories, commercial, seed, segIndex = 0) {
  const t0 = performance.now();
  // the batcher keeps its part CACHE but its per-build bins must be empty
  dynB.mergeBins.clear();
  dynB.instances.clear();
  dynB.stats.merged = 0; dynB.stats.instanced = 0;

  const rng = makeRng(seed);
  const lot = {
    frame: tmat(0, 0, 0, 0), width: w, depth: d, corner: 0,
    commercial, mirror: false, district: 'showcase', stories,
  };
  let res = {};
  try {
    res = generateBuilding(type, dynCtx, lot, rng) || {};
  } catch (e) {
    console.error('[morph] generate failed', type, w.toFixed(2), d.toFixed(2), stories, e);
  }
  const bH = res.height || stories * 3.1;
  const setback = res.setback || 0;

  // party-wall neighbours that slide outward as the lot grows (kept well below
  // the subject so the orbit never has to look past a wall)
  for (const side of [-1, 1]) {
    const nw = 7;
    const nh = Math.min(26, Math.max(7, bH * (side < 0 ? 0.72 : 0.55)));
    const nx = side * (w / 2 + nw / 2 + 0.05);
    const g = box(nw, nh, 17);
    const mat = NEIGHBOURS[segIndex % NEIGHBOURS.length][side < 0 ? 0 : 1];
    dynB.addMerged(mat, g, tmat(nx, 0, -8.6 - setback), {
      tint: new THREE.Color(0.8, 0.8, 0.8), grime: 0.25,
    });
    // parapet cap: a bare box top reads as plywood, a capped one as a party wall
    dynB.addMerged('roofBlack', box(nw + 0.16, 0.34, 17.16), tmat(nx, nh, -8.6 - setback), {
      tint: new THREE.Color(0.55, 0.54, 0.52),
    });
  }

  forceGlassAliases();
  const g = dynB.build();
  g.name = 'building';
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (/^merge:(skyline|fillerFacade|groundDark|water)$/.test(o.name)) o.castShadow = false;
    if (/^part:(win:|glass:|lit:|streak:|sill:|lintel:|acUnit|roof:vent|roof:dish|tree:pit|tree:guard|light:|trash:|hydrant|siamese|street:)/.test(o.name)) o.castShadow = false;
    if (P.night && (o.name.startsWith('part:lit') || o.name.includes(':lit') || o.name === 'part:light:glow' || o.name === 'part:light:pool')) o.visible = true;
  });
  disposeGroup(current);
  current = g;
  scene.add(g);

  state.type = type; state.w = w; state.d = d; state.stories = stories; state.height = bH;
  lastBuildMs = performance.now() - t0;
  return bH;
}

// night material tweaks (once — materials are shared and persistent)
if (P.night) {
  const signMat = M.get('signs'); if (signMat) signMat.emissiveIntensity = 0.75;
  const filler = M.get('fillerFacade'); if (filler) { filler.emissiveIntensity = 0.28; filler.emissive.setHex(0xffd2a0); }
  const rf = M.get('roomFill'); if (rf) rf.color.setScalar(0.3);
  const sf = M.get('shopFill'); if (sf) sf.color.setScalar(0.85);
  for (const m of M.values()) {
    if (!/glass|glaze|vision|curtain|Pool|Glow|lit/i.test(m.name || '') && m.envMapIntensity > 0.5) m.envMapIntensity = 0.5;
  }
}
// glazing must not be starved by scene.environmentIntensity
{
  const envDiv = Math.max(0.12, T.envI);
  for (const m of M.values()) {
    const glassy = m.userData.envNormalize || /glass|glaze|vision|curtain/i.test(m.name || '');
    if (glassy && m.envMapIntensity) m.envMapIntensity = Math.min(6, m.envMapIntensity / envDiv);
  }
}

// ---------------------------------------------------------------------------
// Shadows — extents follow the building, map size NEVER changes (disposing a
// shadow map every frame stalls the GPU and leaks; see docs/notes)
// ---------------------------------------------------------------------------
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00015;
sun.shadow.radius = 2;
function fitShadows(radius, center) {
  const c = sun.shadow.camera;
  c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
  c.near = 1; c.far = 1200;
  sun.shadow.normalBias = Math.max(0.03, (radius * 2) / 4096);
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(sunDir, 500);
  c.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Post: N8AO + bloom + output (same chain as src/main.js)
// ---------------------------------------------------------------------------
let composer = null;
try {
  const { N8AOPass } = await import('n8ao');
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
  });
  composer = new EffectComposer(renderer, rt);
  const n8ao = new N8AOPass(scene, camera, innerWidth, innerHeight);
  n8ao.configuration.screenSpaceRadius = true;
  n8ao.configuration.aoRadius = 20;
  n8ao.configuration.distanceFalloff = 1.0;
  n8ao.configuration.intensity = 3.0;
  n8ao.configuration.halfRes = true;
  n8ao.configuration.aoSamples = 16;
  n8ao.configuration.denoiseSamples = 8;
  n8ao.configuration.gammaCorrection = false;
  composer.addPass(n8ao);
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(innerWidth / 2, innerHeight / 2),
    P.night ? 0.55 : 0.1, 0.5, P.night ? 0.85 : 2.4,
  ));
  composer.addPass(new OutputPass());
} catch (e) {
  console.warn('n8ao unavailable, falling back to plain render', e);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// Timeline evaluation
// ---------------------------------------------------------------------------
const SEG_DUR = P.dur / SEGMENTS.length;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// what the lot looks like at absolute time t
function lotAt(t) {
  const total = SEG_DUR * SEGMENTS.length;
  const tt = ((t % total) + total) % total;
  const i = Math.min(SEGMENTS.length - 1, Math.floor(tt / SEG_DUR));
  const s = SEGMENTS[(P.seg !== null ? P.seg : i) % SEGMENTS.length];
  const u = (tt - i * SEG_DUR) / SEG_DUR;                 // 0..1 inside segment
  const g = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);        // 0 at both ends, 1 mid
  const gd = 0.5 - 0.5 * Math.cos(u * Math.PI * 2 + 0.9); // depth trails width
  const w = lerp(s.w[0], s.w[1], g);
  const d = lerp(s.d[0], s.d[1], clamp(gd, 0, 1));
  // floors ride a slightly LEADING phase so the height change and the bay
  // re-flow are never simultaneous — you read them as two separate events
  const gs = 0.5 - 0.5 * Math.cos(clamp(u * 1.12, 0, 1) * Math.PI * 2);
  const stories = Math.round(lerp(s.st[0], s.st[1], gs));
  return { s, u, w, d, stories, index: i };
}

// smoothed camera distance so a jumped story count doesn't snap the framing
let camDist = 34, camY = 8, camLook = 8;
let time = 0;
let firstBuild = true;

function update(dt) {
  time += dt;
  const L = lotAt(time);
  const H = rebuild(L.s.type, L.w, L.d, L.stories, L.s.commercial, L.s.seed, L.index);

  // ---- camera: slow arc across the facade, framing driven by the massing ----
  // frame against the massing 0.7 s AHEAD as well: while the story count is
  // ramping, a purely reactive dolly lags and crops the parapet off the top
  const A = lotAt(time + 0.7);
  const Hf = Math.max(H, A.stories * 3.15);
  const wf = Math.max(L.w, A.w);
  const wantDist = clamp(Math.max(Hf * 1.40, wf * 2.0) + 9, 32, 110);
  const wantY = clamp(1.9 + Hf * 0.25, 3, 28);
  const wantLook = clamp(Hf * 0.55, 4, 36);
  const k = firstBuild ? 1 : clamp(dt * 3.0, 0, 1);      // critically damped-ish
  camDist = lerp(camDist, wantDist, k);
  camY = lerp(camY, wantY, k);
  camLook = lerp(camLook, wantLook, k);
  // one continuous sweep across the whole clip, ±33° about head-on
  const totalT = SEG_DUR * SEGMENTS.length;
  const a = Math.sin((time / totalT) * Math.PI * 2 - Math.PI / 2) * 0.58;
  camera.position.set(Math.sin(a) * camDist, camY, Math.cos(a) * camDist);
  camera.lookAt(0, camLook, 0);
  camera.updateMatrixWorld();

  fitShadows(clamp(Math.max(H * 0.85, L.w * 1.1), 18, 60), new THREE.Vector3(0, H * 0.35, 0));
  firstBuild = false;
}

function draw() {
  renderer.info.reset();
  composer.render();
  window.__frame = (window.__frame || 0) + 1;
  if (P.hud) {
    hud.textContent =
      `t ${time.toFixed(2)}s  frame ${window.__frame}  build ${lastBuildMs.toFixed(0)}ms\n` +
      `${state.type}  w ${state.w.toFixed(1)}m  d ${state.d.toFixed(1)}m  ${state.stories} fl  h ${state.height.toFixed(1)}m\n` +
      `calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1e6).toFixed(2)}M`;
  }
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------
window.__frame = 0;
window.__STATS = () => ({
  ms: +lastBuildMs.toFixed(1), calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles, type: state.type,
  w: +state.w.toFixed(2), d: +state.d.toFixed(2), stories: state.stories,
  height: +state.height.toFixed(2), t: +time.toFixed(3), frame: window.__frame,
});
window.__step = (dt) => { update(dt || 1 / 30); draw(); return window.__frame; };
// re-submit the SAME frame (no state change) so the compositor is guaranteed to
// hold the current image when the recorder grabs a screenshot
window.__redraw = () => { renderer.info.reset(); composer.render(); return window.__frame; };
window.__APP = { renderer, scene, camera, M, dynB };

// first frame: build + render so shaders compile before the recorder starts
update(0);
draw();
// warm the pipeline (shader compiles, PMREM upload) before the recorder counts
for (let i = 0; i < 2; i++) draw();
window.__frame = 0;
window.__READY = true;

if (!P.record) {
  let last = performance.now();
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
  };
  tick();
}
