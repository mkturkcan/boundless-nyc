import { cloudTexture } from "./textures.js";
// Bootstrap: renderer, environment, city/showcase build, views, bench.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createMaterials } from './materials.js';
import { Batcher } from './batcher.js';
import { makeKit } from './kit.js';
import { buildCity } from './city.js';
import { TYPES, generateBuilding } from './buildings/index.js';
import { makeRng, hashStr } from './rng.js';
import { tmat, box, boxUV } from './geo.js';

const params = new URLSearchParams(location.search);
const P = {
  view: params.get('view') || 'aerial',
  time: params.get('time') || 'golden',
  seed: Number(params.get('seed') || 1),
  type: params.get('type') || null,          // showcase mode: single building type
  shot: params.get('shot') === '1',
  bench: params.get('bench') === '1',
  commercial: params.get('commercial') === '1',
  stories: params.get('stories') ? Number(params.get('stories')) : undefined,
  width: params.get('width') ? Number(params.get('width')) : undefined,
  cols: Number(params.get('cols') || 5),
  rows: Number(params.get('rows') || 2),
  night: false,
};
P.night = P.time === 'night';

const app = document.getElementById('app');
const hud = document.getElementById('hud');
if (P.shot) hud.style.display = 'none';   // keep renders clean for blind review

const renderer = new THREE.WebGLRenderer({
  antialias: false, powerPreference: 'high-performance', stencil: false,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(P.shot ? 1 : Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
// r182+ removed the PCF_SOFT shader branch; PCFShadowMap is the soft one now
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 4000);

// ---------------------------------------------------------------------------
// Lighting / sky
// ---------------------------------------------------------------------------
// Sky (r183+) outputs raw linear radiance â€” run ACES at ~0.6 exposure with the
// sun disc hidden, and let the DirectionalLight be the sun.
const TIMES = {
  // envI must FALL as the sky gets brighter (PMREM of a bright high-sun
  // Preetham sky otherwise swamps direct light and washes out all shadows)
  // thin fog: a clear Manhattan cross-street stays legible past 400m; distance
  // is carried by desaturation and the skyline silhouettes, not a white wall
  // golden: azim 245 rakes light ALONG the street facades (cross-light shows
  // brick relief; cameras no longer stare down the sun bearing). Linear fog:
  // near 250m / far 2200m so distance reads as aerial perspective, not a wall.
  // fog far planes sit BEYOND the 2500m skyline band (a 2200m far plane had
  // been fogging the far bank to a single white card); warmer hemisphere
  // bounce keeps shadows gray-warm instead of periwinkle
  golden: { elev: 13, azim: 245, expo: 0.82, turb: 5.5, rayl: 2.4, mieC: 0.006, mieG: 0.82, sunI: 4.3, sunC: 0xffc98e, envI: 0.30, fogLinear: [600, 3400], fogC: 0x6a7280, amb: 0.06, ambC: 0xd8c0a0, hemi: 0.30, hemiSky: 0xb9a487, hemiGround: 0x8b7a63 },   // fog darker than the sky so the skyline band sits BELOW it
  // noon: higher turbidity/rayleigh keep the horizon disc inside ACES range (a
  // clear low-turbidity sky clipped the vanishing point to paper white)
  // fog far must sit INSIDE the camera far plane (4000) or raw sky shows at the
  // vanishing point; neutral-warm bounce so noon shadow sides aren't cyan
  noon: { elev: 58, azim: 155, expo: 0.32, turb: 4.6, rayl: 2.8, mieC: 0.002, mieG: 0.8, sunI: 6.0, sunC: 0xfff2dd, envI: 0.18, fogLinear: [2200, 4200], fogC: 0x6d7684, amb: 0.05, ambC: 0xc8c4bc, hemi: 0.18, hemiSky: 0x92a6c0, hemiGround: 0x8e8478 },   // low hemi: the sky-colored fill was the "milky veil"
  morning: { elev: 24, azim: 150, expo: 0.65, turb: 4.2, rayl: 1.7, mieC: 0.005, mieG: 0.8, sunI: 4.2, sunC: 0xffe7c2, envI: 0.32, fog: 0.001, fogC: 0xd9dfe6, amb: 0 },
  overcast: { elev: 45, azim: 180, expo: 0.7, turb: 12, rayl: 0.5, mieC: 0.07, mieG: 0.95, sunI: 0.5, sunC: 0xe8eef4, envI: 1.0, fog: 0.0014, fogC: 0xc9cfd4, amb: 0.3 },
  night: { elev: -6, azim: 0, expo: 1.15, turb: 6, rayl: 2.2, mieC: 0.006, mieG: 0.8, sunI: 0.0, sunC: 0x223048, envI: 0.20, fog: 0.0010, fogC: 0x241a12, amb: 0.05, hemi: 0.14, hemiSky: 0x2a3450, hemiGround: 0x161c26 },   // night hemi colors: without them the DAY ground bounce (tan) painted the whole road
};
const T = { ...(TIMES[P.time] || TIMES.golden) };
if (params.get('elev')) T.elev = Number(params.get('elev'));
if (params.get('azim')) T.azim = Number(params.get('azim'));

const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
const sunDir = new THREE.Vector3();
// showcase buildings face +z â€” swing the sun around to front-light them
// three-quarter light for showcases (head-on is the worst case for glazing)
const azim = P.type ? (T.azim + 135) % 360 : T.azim;
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

// environment from the sky itself
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(20000);
  sky2.material.uniforms.turbidity.value = T.turb;
  sky2.material.uniforms.rayleigh.value = T.rayl;
  sky2.material.uniforms.mieCoefficient.value = T.mieC;
  sky2.material.uniforms.mieDirectionalG.value = T.mieG;
  sky2.material.uniforms.sunPosition.value.copy(sunDir);
  if (sky2.material.uniforms.showSunDisc) sky2.material.uniforms.showSunDisc.value = 0;
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
// sky/ground bounce: per-preset colors (golden hour fills shadow sides with
// warm bounced light, not blue sky — the blue shadow side was a render tell)
if (T.hemi) scene.add(new THREE.HemisphereLight(T.hemiSky || 0xa9b6c6, T.hemiGround || 0x8b7a63, T.hemi));

// cloud deck: a partly cloudy layer at 900m. A pure-gradient sky was the single
// most frequent render tell (13/14 frames); the deck is unlit, tinted by the
// sun color, fogged so it dissolves into the horizon haze
{
  const cloudTex = cloudTexture({ seed: 3 });
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const DECK = 14000, TILE = 1700;   // 1.7 km tile: a street camera's sky wedge always meets cloud
  cloudTex.repeat.set(DECK / TILE, DECK / TILE);
  const isNight = T.sunI === 0;
  const cm = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true,
    color: isNight ? new THREE.Color(0x4a3e34) : new THREE.Color(T.sunC).lerp(new THREE.Color(1, 1, 1), 0.55),   // night: bellies lit by city glow
    opacity: isNight ? 0.65 : 0.92,
  });
  // radial alpha fade (1.8-3.4 km) so the deck dissolves into haze well before
  // the camera far plane (4 km) can clip it to a hard straight edge
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
  // the deck follows the camera in xz; the texture offset keeps clouds world-fixed
  deck.onBeforeRender = (_r, _s, cam) => {
    deck.position.x = cam.position.x;
    deck.position.z = cam.position.z;
    cloudTex.offset.set(cam.position.x / TILE, -cam.position.z / TILE);
    deck.updateMatrixWorld();
  };
  scene.add(deck);
}

if (P.night) {
  // sodium skyglow ramp — NYC never has a #000 sky
  const gc = document.createElement('canvas');
  gc.width = 4; gc.height = 256;
  const gctx = gc.getContext('2d');
  const grad = gctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#232b40');     // zenith — NYC skyglow, never black
  grad.addColorStop(0.25, '#2a2a38');
  grad.addColorStop(0.45, '#2c2520');
  grad.addColorStop(1, '#4a3826');     // sodium horizon glow
  gctx.fillStyle = grad; gctx.fillRect(0, 0, 4, 256);
  const bgTex = new THREE.CanvasTexture(gc);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  sky.visible = false;
  scene.add(new THREE.HemisphereLight(0x2a3450, 0x141118, 0.12));  // skyglow fill (cool ground term: no tan sidewalk wash)
}

scene.fog = T.fogLinear ? new THREE.Fog(T.fogC, T.fogLinear[0], T.fogLinear[1]) : new THREE.FogExp2(T.fogC, T.fog);

// ---------------------------------------------------------------------------
// Build the world
// ---------------------------------------------------------------------------
const { M, extra } = createMaterials();
const batcher = new Batcher(M);
const kit = makeKit(batcher, extra);
const ctx = { batcher, kit, extra };

let cityInfo = null;
let focusBox = null;

if (P.type) {
  // SHOWCASE: one building + street context strip
  const rng = makeRng(P.seed);
  const widths = {
    brownstone: 5.8, tenement: 7.6, loft: 18, prewar: 20, nycha: 26,
    glasstower: 24, mixeduse: 12, rowhouse: 5.5,
    castiron: 14, victorian: 6.4, deco: 24, whitebrick: 26,
    gardenapt: 26, queensrow: 5.8, infill: 14, federal: 5.5,
  };
  // seed-jittered massing so per-seed variation is actually reviewable
  const jit = (makeRng(P.seed * 31 + 7)).range(0.88, 1.14);
  const w = P.width || (widths[P.type] || 10) * jit;
  const lot = {
    frame: tmat(0, 0, 0, 0), width: w, depth: 15 + (P.seed * 2.3) % 5, corner: 0,
    commercial: P.commercial, mirror: false, district: 'showcase',
    stories: P.stories,
  };
  const res = generateBuilding(P.type, ctx, lot, rng) || {};
  const bH = res.height || 18;
  const setback = res.setback || 0;   // types with areaways return their front setback
  // neighbors: quiet massing so the party walls read correctly
  for (const side of [-1, 1]) {
    const nw = 8;
    const nh = Math.min(22, Math.max(6, bH * (0.55 + 0.15 * ((P.seed + side + 3) % 3))));
    const g = box(nw, nh, 16);
    batcher.addMerged(side < 0 ? 'brickBrown' : 'brickTan', g, tmat(side * (w / 2 + nw / 2 + 0.05), 0, -8.2 - setback), {
      tint: new THREE.Color(0.8, 0.8, 0.8), grime: 0.25,
    });
  }
  focusBox = new THREE.Box3(
    new THREE.Vector3(-w / 2, 0, -6),
    new THREE.Vector3(w / 2, bH, 0),
  );
  // sidewalk + curb + road
  const sw = Math.max(26, w + 14);
  const g1 = box(sw, 0.14, 4.4, { segY: 1 }); boxUV(g1, sw, 0.14, 4.4, 3);
  batcher.addMerged('sidewalk', g1, tmat(0, 0, 2.2));
  const g2 = new THREE.PlaneGeometry(sw + 60, 40); g2.rotateX(-Math.PI / 2);
  batcher.addMerged('asphalt', g2, tmat(0, -0.02, 12));
  kit.streetlight(tmat(-w / 2 - 2, 0.14, 3.6, Math.PI), { kind: 'crook' });
  if (P.seed % 2) kit.hydrant(tmat(w / 2 + 1.5, 0.14, 3.4, 1.2));
} else {
  cityInfo = buildCity(ctx, { seed: P.seed, cols: P.cols, rowsN: P.rows });
}

// Force the glazing aliases AFTER generation: some modules register their
// private glass unconditionally (overwriting the alias); parts resolve their
// material by NAME at build(), so re-pointing the names here wins.
{
  const g = M.get('glass');
  for (const alias of ['loft:glassInd', 'tenement:glass', 'castiron:glassWin', 'castiron:glassBig']) M.set(alias, g);
}
const city = batcher.build();
scene.add(city);

// context massing, skyline silhouettes, water and far ground never need to
// feed the shadow pass (they're 1-5 km out or flat)
city.traverse((o) => {
  if (o.isMesh && /^merge:(skyline|fillerFacade|groundDark|water)$/.test(o.name)) o.castShadow = false;
  // small facade parts don't need to feed the shadow pass (their shadows fall
  // inside their own reveals); this removes hundreds of shadow draw calls
  if (o.isMesh && /^part:(win:|glass:|lit:|streak:|sill:|lintel:|acUnit|roof:vent|roof:dish|tree:pit|tree:guard|light:|trash:|hydrant|siamese|street:)/.test(o.name)) {
    o.castShadow = false;
  }
});

// river view only: a planar Reflector mirrors the skyline + bridge in the
// water (a StandardMaterial can only mirror the environment map). Costs a
// second scene render, so it exists only where the water is the subject.
if (!P.type && !P.cars && P.view === 'river' && cityInfo) {
  const waterMesh = city.children.find((o) => o.name === 'merge:water');
  if (waterMesh) {
    waterMesh.geometry.computeBoundingBox();
    const bb = waterMesh.geometry.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
    // East River is a turbid green-gray body, not a mirror: Fresnel-weighted
    // reflection (grazing only), wind-ripple distortion, roughness streaks
    const RIVER_SHADER = {
      name: 'RiverReflector',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 vUv4;
        varying vec3 vWorld;
        void main() {
          vUv4 = textureMatrix * vec4(position, 1.0);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        varying vec4 vUv4;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec3 V = cameraPosition - vWorld;
          float dist = length(V);
          vec3 viewDir = V / dist;
          float n1 = noise(vWorld.xz * 0.35) * 2.0 - 1.0;
          float n2 = noise(vWorld.xz * 1.7 + 13.0) * 2.0 - 1.0;
          float n3 = noise(vWorld.xz * 0.9 + 31.0) * 2.0 - 1.0;   // chop (sub-metre octaves alias to speckle at distance)
          vec2 uv = vUv4.xy / vUv4.w;
          uv += vec2(n1 + 0.35 * n3, n2 + 0.35 * n3) * 0.05 * clamp(dist / 300.0, 0.3, 1.2);
          vec3 refl = texture2D(tDiffuse, uv).rgb;
          float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
          float k = mix(0.06, 0.16, fres);   // turbid: the body color wins even at grazing
          vec3 c = mix(color, refl * (0.55 + 0.45 * (1.0 - fres)), k);
          float streak = noise(vWorld.xz * vec2(0.02, 0.12));
          c = mix(c, color, 0.35 * smoothstep(0.55, 0.85, streak) * (1.0 - fres * 0.5));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    };
    const refl = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: 2048, textureHeight: 2048, color: 0x2a3540, clipBias: 0.003, shader: RIVER_SHADER,
    });
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(cx, 0.06, cz);
    scene.add(refl);
    waterMesh.visible = false;
  }
}

// glass must not be starved by scene.environmentIntensity: normalize any
// glazing material so its effective reflectance is constant across presets
{
  const envDiv = Math.max(0.12, T.envI);
  for (const m of M.values()) {
    const glassy = m.userData.envNormalize
      || /glass|glaze|vision|curtain/i.test(m.name || '');
    if (glassy && m.envMapIntensity) m.envMapIntensity = Math.min(6, m.envMapIntensity / envDiv);
  }
}

// toggle night layers: lit windows, lamp glows, ground pools, bright signs
if (P.night) {
  city.traverse((o) => {
    if (!o.name) return;
    if (o.name.startsWith('part:lit') || o.name.includes(':lit')) o.visible = true;
    if (o.name === 'part:light:glow' || o.name === 'part:light:pool') o.visible = true;
  });
  const signMat = M.get('signs');
  if (signMat) signMat.emissiveIntensity = 0.75;   // legible letterforms; pools below do the lighting
  // mid-distance context buildings show scattered lit windows at night
  const filler = M.get('fillerFacade');
  if (filler) { filler.emissiveIntensity = 0.28; filler.emissive.setHex(0xffd2a0); }   // dim warm dots, not white slabs
  // unlit room fills/shades must not outshine the lit-window overlays at night
  const rf = M.get('roomFill');
  if (rf) rf.color.setScalar(0.3);   // a multiply: unlit panes keep their relative variety at night
  const sf = M.get('shopFill');
  if (sf) sf.color.setScalar(0.85);  // shop interiors stay LIT at night (roomFill dims residential rooms)
  // trim/stone must not pick up night lamp spill as specular blowout
  for (const m of M.values()) {
    if (!/glass|glaze|vision|curtain|Pool|Glow|lit/i.test(m.name || '') && m.envMapIntensity > 0.5) m.envMapIntensity = 0.5;
  }
}

// ---------------------------------------------------------------------------
// Shadows fitted to view
// ---------------------------------------------------------------------------
function fitShadows(radius, center = new THREE.Vector3()) {
  const c = sun.shadow.camera;
  c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
  c.near = 1; c.far = 1200;
  // street-level (≤250m) gets the full 8K map; whole-city aerials don't need it
  const mapRes = radius > 250 ? 6144 : radius > 120 ? 8192 : 4096;
  sun.shadow.mapSize.set(mapRes, mapRes);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.bias = params.get('sbias') !== null ? Number(params.get('sbias')) : -0.00015;
  // normalBias â‰ˆ 1 texel of world size; radius = penumbra in shadow texels
  sun.shadow.normalBias = params.get('snb') !== null ? Number(params.get('snb')) : Math.max(0.03, (radius * 2) / mapRes);
  sun.shadow.radius = params.get('srad') !== null ? Number(params.get('srad')) : 2;
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(sunDir, 500);
  c.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function cityViews() {
  // interior anchors â€” cameras live INSIDE the city so both street walls exist
  const blocks = cityInfo.blocks.filter((b) => !b.district.startsWith('ring:'));
  const b00 = blocks[0];
  const b11 = blocks.find((b) => b.district === 'harlem-mixed') || blocks[Math.min(3, blocks.length - 1)];
  const b21 = blocks.find((b) => b.district === 'wburg-bedford') || b11;
  const stZ = b00.z0 + b00.d + 9;             // interior street centerline
  const aveX1 = b11.x0 - 13;                  // avenue between columns 0|1
  const aveX2 = b21.x0 - 13;                  // avenue between columns 1|2
  return {
    aerial: { pos: [b00.x0 - 150, 140, stZ - 150], look: [b00.x0 + 240, 0, stZ + 30], fog: 1 },
    aerial2: { pos: [b00.x0 - 55, 52, stZ - 68], look: [b00.x0 + 135, 6, stZ + 28], fog: 1 },
    street: { pos: [b00.x0 + 8, 1.7, stZ + 2.4], look: [b00.x0 + 130, 4.5, stZ - 0.5], fog: 1 },
    facade: { pos: [b11.x0 + 26, 1.7, stZ + 2.5], look: [b11.x0 + 58, 8, stZ + 12], fog: 1 },
    corner: { pos: [aveX1 - 8, 1.7, stZ - 7], look: [b11.x0 + 14, 9, b11.z0 + 9], fog: 1 },
    rooftops: { pos: [b00.x0 - 38, 30, stZ + 24], look: [b00.x0 + 150, 10, stZ + 55], fog: 1 },
    canyon: { pos: [aveX2, 1.7, stZ + 44], look: [aveX2 + 1, 15, stZ - 130], fog: 1 },
    ...extraDistrictViews(blocks, stZ),
  };
}

function extraDistrictViews(blocks, stZ) {
  const v = {};
  const bSoho = blocks.find((b) => b.district === 'soho');
  const bBed = blocks.find((b) => b.district === 'bedstuy');
  const bQue = blocks.find((b) => b.district === 'queens');
  const bUes = blocks.find((b) => b.district === 'ues');
  // soho: inside its own south street (ring-1 across it is now real buildings)
  if (bSoho) v.soho = { pos: [bSoho.x0 + 6, 1.7, bSoho.z0 - 9 - 2.5], look: [bSoho.x0 + 110, 6, bSoho.z0 - 9 + 1], fog: 1 };
  if (bBed) v.bedstuy = { pos: [bBed.x0 + 12, 1.7, bBed.z0 - 9 + 2.5], look: [bBed.x0 + 115, 5, bBed.z0 - 9 - 1], fog: 1 };
  if (bQue) v.queens = { pos: [bQue.x0 + 8, 1.7, bQue.z0 + bQue.d + 9 - 2.5], look: [bQue.x0 + 115, 5, bQue.z0 + bQue.d + 10], fog: 1 };
  // UES on its OWN north street (the previous anchor collided with the queens camera)
  if (bUes) v.ues = { pos: [bUes.x0 + 14, 1.7, bUes.z0 + bUes.d + 9 - 2.5], look: [bUes.x0 + 118, 12, bUes.z0 + bUes.d + 10], fog: 1 };
  // waterfront glass row: stand IN the east avenue (ring-1 east is now real
  // buildings) looking north along the tower row
  const east = blocks.filter((b) => !b.district.startsWith('ring:'))
    .reduce((a, b) => (b.x0 > a.x0 ? b : a), blocks[0]);
  v.waterfront = {
    pos: [east.x0 + east.w + 13, 2.2, east.z0 + east.d + 4],
    look: [east.x0 + east.w + 9, 30, east.z0 - 60], fog: 1,
  };
  // river: from the last ring's edge looking east across the water to the far bank
  // camera OUT over the water (past the 3 ring blocks and the seawall), elevated:
  // water foreground, far-bank skyline behind — ring towers stay behind the lens
  // river: OUT over the water (the seawall is ring 3's east face), low, looking
  // north along the river: shoreline receding left, bridge crossing ahead,
  // far bank right — water and its rippled reflections fill the foreground
  // seawall = core east edge + 3 ring pitches (blocks[] holds core blocks only)
  const shoreX = east.x0 + east.w + 3 * (east.w + 26);
  const zNorth = blocks.reduce((a, b) => Math.min(a, b.z0), Infinity);
  v.river = { pos: [shoreX + 55, 10, zNorth + 170], look: [shoreX + 150, 22, zNorth - 300], fog: 1 };
  return v;
}

function showcaseViews() {
  const size = focusBox.getSize(new THREE.Vector3());
  const c = focusBox.getCenter(new THREE.Vector3());
  const h = size.y, w = size.x;
  const d = Math.max(14, h * 1.15, w * 1.35);
  return {
    hero: { pos: [c.x - d * 0.62, 1.7 + h * 0.12, d * 0.86], look: [c.x, h * 0.45, 0], fog: 0 },
    front: { pos: [c.x, 1.6, d * 1.05], look: [c.x, h * 0.42, 0], fog: 0 },
    detail: { pos: [c.x - w * 0.28, 1.6, 7.5], look: [c.x, 2.6, 0], fog: 0 },
    upper: { pos: [c.x + d * 0.5, h * 0.75, d * 0.62], look: [c.x, h * 0.72, 0], fog: 0 },
    roof: { pos: [c.x - d * 0.55, h + 12, d * 0.6], look: [c.x, h - 1, -4], fog: 0 },
  };
}

const VIEWS = P.type ? showcaseViews() : cityViews();
const view = VIEWS[P.view] || Object.values(VIEWS)[0];
camera.position.set(...view.pos);
camera.lookAt(...view.look);
if (view.fog === 0) scene.fog = null;

if (P.type) {
  fitShadows(Math.max(20, focusBox.getSize(new THREE.Vector3()).length() * 0.7), focusBox.getCenter(new THREE.Vector3()));
} else {
  // street-level views: tight shadow frustum around the view target (sharper
  // texels AND fewer casters); aerials cover the whole city
  const isAerial = P.view.startsWith('aerial') || P.view === 'rooftops' || P.bench;
  if (isAerial) {
    fitShadows(340);
  } else {
    const lookAt = new THREE.Vector3(...view.look);
    const eye = camera.position.clone();
    const mid = eye.clone().lerp(lookAt, 0.45).setY(0);
    fitShadows(190, mid);
  }
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...view.look);
controls.update();

// night: real point lights marching ahead of the camera to carry the near field.
// The lights live on layer 1; tree canopies stay layer-0-only so foliage does
// not glow daylight-green under a lamp (it reads silhouetted, correctly).
if (P.night) {
  camera.layers.enable(1);   // lights are culled against CAMERA layers
  city.traverse((o) => {
    if (o.isMesh && !o.name.startsWith('part:tree:canopy')) o.layers.enable(1);
  });
  // real luminaires: light the ~24 lamps nearest the camera (city mode);
  // showcase falls back to two lamps ahead of the camera
  const addLamp = (x, z, kind, near) => {
    // clamped range so lamps never over-light sills/lintels into bloom
    // tight pools: light POOLS, it doesn't paint the plane. Cobra heads sit at
    // 7.3 m over 26 m avenues and need more reach than 5.2 m crooks
    const cobra = kind !== 'crook';
    const pl = new THREE.PointLight(0xffb268, near ? (cobra ? 95 : 52) : (cobra ? 42 : 24), near ? (cobra ? 27 : 17) : (cobra ? 19 : 12), 2);
    pl.layers.set(1);
    pl.position.set(x, kind === 'crook' ? 5.2 : 7.3, z);
    scene.add(pl);
  };
  if (cityInfo && cityInfo.lamps.length) {
    const cp = camera.position;
    [...cityInfo.lamps]
      .sort((a, b) => ((a[0] - cp.x) ** 2 + (a[1] - cp.z) ** 2) - ((b[0] - cp.x) ** 2 + (b[1] - cp.z) ** 2))
      .slice(0, 24)
      .forEach(([x, z, kind], i) => addLamp(x, z, kind, i < 14));
  } else {
    const dir = new THREE.Vector3(...view.look).sub(camera.position).setY(0).normalize();
    for (const dd of [8, 26]) {
      const p = camera.position.clone().addScaledVector(dir, dd);
      addLamp(p.x, p.z, 'cobra');
    }
  }
}

// ---------------------------------------------------------------------------
// Post: N8AO + MSAA + Output
// ---------------------------------------------------------------------------
let composer = null;
try {
  const { N8AOPass } = await import('n8ao');
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
  });
  composer = new EffectComposer(renderer, rt);
  const n8ao = new N8AOPass(scene, camera, innerWidth, innerHeight);
  // screen-space radius: world-space AO radii can't span a street-to-skyline
  // depth range (per n8ao guidance). Pixel radius + ratio falloff instead.
  n8ao.configuration.screenSpaceRadius = true;
  n8ao.configuration.aoRadius = 20;          // tighter: contact darkening at junctions
  n8ao.configuration.distanceFalloff = 1.0;
  n8ao.configuration.intensity = 3.0;
  n8ao.configuration.halfRes = true;
  n8ao.configuration.aoSamples = 16;
  n8ao.configuration.denoiseSamples = 8;
  n8ao.configuration.gammaCorrection = false;   // OutputPass handles transfer
  if (params.get('ao')) n8ao.configuration.renderMode = Number(params.get('ao'));
  composer.addPass(n8ao);
  // bloom: strong at night (sign/window glow); day threshold sits well above
  // sunlit-white so facades and glass never halo
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
// Loop / HUD / bench / shot-ready
// ---------------------------------------------------------------------------
const stats = city.userData.stats || {};
let frames = 0, lastT = performance.now(), fpsEMA = 0;
const benchSamples = [];
let benchStart = 0;

function tick() {
  requestAnimationFrame(tick);
  renderer.info.reset();
  const now = performance.now();
  const dt = now - lastT; lastT = now;
  const fps = 1000 / Math.max(0.01, dt);
  fpsEMA = fpsEMA ? fpsEMA * 0.95 + fps * 0.05 : fps;

  if (P.bench) {
    if (!benchStart) benchStart = now;
    const t = (now - benchStart) / 1000;
    if (t > 2 && t <= 14) benchSamples.push(fps);
    if (t > 14 && !window.__BENCH_RESULT) {
      const sorted = [...benchSamples].sort((a, b) => a - b);
      window.__BENCH_RESULT = {
        avgFps: benchSamples.reduce((a, b) => a + b, 0) / benchSamples.length,
        p1Low: sorted[Math.floor(sorted.length * 0.01)],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        frames: benchSamples.length,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        gpu: gpuName(),
      };
    }
    // slow orbit during bench
    const a = t * 0.15;
    const r = P.type ? 40 : 330;
    camera.position.set(Math.cos(a) * r, P.type ? 12 : 130, Math.sin(a) * r);
    camera.lookAt(0, P.type ? 8 : 0, 0);
  }

  controls.update();
  composer.render();
  frames++;
  if (frames === 6 && P.shot) window.__SHOT_READY = true;
  if (frames % 15 === 0) {
    hud.textContent =
      `fps ${fpsEMA.toFixed(0)}  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1e6).toFixed(2)}M\n` +
      `bldgs ${cityInfo ? cityInfo.buildings : 1}  view ${P.view}  time ${P.time}  seed ${P.seed}${P.type ? '  type ' + P.type : ''}`;
  }
}

function gpuName() {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  } catch { return 'unknown'; }
}

window.__APP = { renderer, scene, camera, stats, gpuName };
console.log('[nyc] stats', stats, 'gpu:', gpuName());
tick();
