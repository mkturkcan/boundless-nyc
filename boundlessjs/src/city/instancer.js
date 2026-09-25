// Global instanced pools for street furniture; tiles claim/release slots.
//
// v4 — CULLED INSTANCING. One THREE.InstancedMesh per pool (real GPU
// instancing: one draw per pool per pass), fed each frame from a compact
// instance store: only instances whose bounding sphere intersects the (padded)
// camera frustum are copied into the draw buffer. A SECOND mesh per pool holds
// the instances inside the near shadow cascade's box and is made visible only
// while the shadow maps render (engine shadow-pass hooks), so casters outside
// the view still shadow what is in view. Tree pools get a third, low-poly
// proxy mesh for the cached far cascade (2.3 m texels — a blob is exact).
//
// Why not BatchedMesh: WEBGL_multi_draw is EMULATED on ANGLE/D3D11 — every
// instance of every batch became its own driver draw (45k per pass), which
// measured ~250 ms/frame on the RTX 3060 at street level. Real instancing at
// ~120 draws/pass with the culled triangle load is the right shape here.
//
// `pools.get(name).mesh` is the main draw mesh and stays the geometry/material
// carrier (props.js and trees.js swap geometry/material on it); flush()
// mirrors such swaps to the shadow/proxy meshes and refreshes bounds.
import * as THREE from 'three';
import { buildFurnitureGeos, TREE_SPECIES, LEAF_TEX, TV25, TV25_POOLS } from './furnitureKit.js';
import { panelTexture } from './panelArt.js';
import { ENV, applySnowCap, applyCityAO, applyLightTrim } from '../world/materials.js';
// CS11 contact shadows (docs/notes/contact-r11.md, ?cs11=0): every claimed prop that
// stands on a surface also claims one soft ellipse on that surface. Hooked here rather
// than in roofEngine/assemble so roof plant, street furniture and the props.js
// companion pools all get it from one table.
import { CS11, csClaim, csRelease, csAttach } from './contactShadow.js';

const Q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const CULL = Q0.get('cull') !== '0';          // ?cull=0: draw every instance (A/B)
// ?aa=0 restores the pre-2026-09-10 shading-antialiasing behaviour for A/B
// measurement (docs/notes/shading-aa-r8.md; tools/tflick.mjs --flags "...&aa=0").
const AAFIX = Q0.get('aa') !== '0';
// ?u10=0 restores the pre-round-10 behaviour for everything the UNIFORMITY
// BREAKER added (docs/notes/uniformity-r10.md). One parse site per file.
export const U10 = Q0.get('u10') !== '0';
const PAD_MAIN = 4;                            // metres added to every sphere vs the view frustum
const PAD_SHADOW = 14;                         // vs the near shadow box (recomputed only every 8 m)
const MIN_PX = 0.5;                            // drop instances whose whole sphere is under half a pixel

const CAPS = {
  // TC13 (docs/notes/canopy-r13.md): the compiler now plants BACKYARD trees in
  // block interiors as well as the DPR street-tree census, which roughly
  // doubles the resident tree population in the Brooklyn/Queens rowhouse
  // fabric. A cap is a ceiling, not a count — raising it costs nothing when the
  // trees are not there, and a pool that hits its cap silently drops every
  // further claim (claim() returns -1), which is a canopy that thins out as you
  // fly. No new POOLS, so draw calls are unchanged.
  treeATrunk: 12000, treeACrown: 12000, treeA2Trunk: 12000, treeA2Crown: 12000, treeA3Trunk: 12000, treeA3Crown: 12000,
  treeBTrunk: 8000, treeBCrown: 8000, treeB2Trunk: 8000, treeB2Crown: 8000,
  treeCTrunk: 4000, treeCCrown: 4000, treeC2Trunk: 4000, treeC2Crown: 4000,
  lampCobra: 12000, lampCrook: 2000, hydrant: 6000,
  signalMast: 5000, signalPed: 8000, sigR: 5000, sigG: 5000, sigA: 5000, pedHand: 8000, pedMan: 8000,
  // SG13: the mast is four pools so the arm can stretch and each head can be
  // aimed; every mast claims TWO heads, so the head/lens/lamp pools run 2x
  // signalMast (docs/notes/signals-r13.md).
  signalArm: 5000, signalHead: 10000, signalLens: 10000, sigR: 10000, sigG: 10000, sigA: 10000,
  streetSign: 9000, litter: 3000, mailbox: 1200,
  busShelter: 900, subway: 800, linknyc: 1200, newsstand: 300, scaffold: 2500, bench: 2000,
  awning: 16000, stoop: 7000, fireEscape3: 5000, fireEscape4: 5000, fireEscape5: 4000, waterTower: 8000, roofAC: 60000,
  bulkhead: 9000, standpipe: 5000, marquee: 300, bikeRack: 1500, viaductPier: 1500,
  ventPipe: 90000, roofDish: 16000, roofAntenna: 12000, skylight: 24000, ductRun: 16000,
  roofChair: 16000, roofTable: 7000, roofPlanter: 16000, roofUmbrella: 5000, coolingTower: 6000, solarPanel: 30000,
  cellSled: 10000, cellCabinet: 8000, cableTray: 20000, mushroomFan: 40000, upblastFan: 14000,
  gooseneck: 90000, chimneyMasonry: 24000, roofHatch: 24000, guardrail: 50000, davit: 8000,
  microwaveDrum: 5000, dishCluster: 16000, dunnage: 45000, screenWall: 12000, sedumTray: 60000, pergola: 3000,
  sawtoothMonitor: 12000, mechPenthouse: 3000, pipeRun: 90000, monopole5G: 4000,
  roofRTU: 20000, roofPlenum: 14000, roofPad: 45000, roofStack: 16000, roofWalk: 60000,   // ROOF9
  lampCobraGlow: 12000, lampCrookGlow: 2000,
  subwayGlow: 800, linknycGlow: 1200, busShelterGlow: 900, marqueeGlow: 300,
  signPole: 10000, signPoleOneWay: 6000, bollard: 5000, newsbox: 1500, cone: 3000, dumpster: 1200, foodcart: 400, treeFence: 12000,
  curbRamp: 16000,
  scaffoldGlow: 2500, // one glow set per shed (scaffold cap)
};
// TV25 (trees agent): the species-form pools (furnitureKit TREE_FORMS). The census + yard trees of the loaded tiles
// split over ~21 pools instead of 7; the maple pool alone carries ~a fifth of them (yard trees are mostly maple), so the
// ceiling stays at the old A-pool 12000. A cap is a ceiling, not a count: the store grows on demand.
if (TV25) for (const n of TV25_POOLS) CAPS[n + 'Trunk'] = CAPS[n + 'Crown'] = 12000;

// Low rooftop clutter (≤ ~1.6 m: vents, goosenecks, pipe runs, AC units, fans,
// hatches, trays, deck furniture, dishes) sits behind parapets: from a camera
// below the roof plane it is hidden by the building's own edge except within a
// few metres of the parapet, so beyond 25 m horizontal it is skipped (main
// draw and near-shadow set — its shadow lands on that same invisible roof).
// Tall/edge items (water towers, bulkheads, antennas, chimneys, guardrails,
// pergolas, monopoles) are never touched. 125th St: 64k → ~9k drawn instances.
const ROOF_LOW = new Set(['ventPipe', 'gooseneck', 'pipeRun', 'roofAC', 'mushroomFan', 'upblastFan', 'ductRun', 'skylight',
  'roofHatch', 'dunnage', 'sedumTray', 'cableTray', 'solarPanel', 'roofChair', 'roofTable', 'roofPlanter', 'roofUmbrella',
  'cellCabinet', 'cellSled', 'dishCluster', 'roofDish', 'microwaveDrum', 'davit',
  // ROOF9: the plenum (0.9 m + curb) and the stain decals are low clutter like
  // the rest. roofRTU (1.46 m to the fan deck) and roofStack (3.4 m) are NOT in
  // here on purpose — both stand proud of a 0.6-1.5 m parapet and are meant to
  // be the roofline's grain from the pavement.
  'roofPlenum', 'roofPad', 'roofWalk',
  // CS11: the roof half of the contact-shadow decals is deck-level clutter like
  // everything else here — from the pavement it is behind the same parapet, and
  // without this every street framing pays vertex + setup for tens of thousands of
  // ellipses that early-Z then throws away.
  'csBlobRoof']);
// Flat decals must not cast: a 12-tri disc 30 mm above the surface it would
// shadow produces nothing but shadow acne at any cascade texel size.
const NO_SHADOW = new Set(['roofPad', 'roofWalk']);
const ROOF_BELOW = 1.5;     // camera this far under the item's base ...
const ROOF_DIST2 = 25 * 25; // ... and this far away horizontally -> hidden

const _pl = new Float32Array(24);   // 6 planes × (nx, ny, nz, d)
const _pl2 = new Float32Array(24);
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
function planesFrom(camera, out) {
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
  for (let i = 0; i < 6; i++) {
    const p = _frustum.planes[i];
    out[i * 4] = p.normal.x; out[i * 4 + 1] = p.normal.y; out[i * 4 + 2] = p.normal.z; out[i * 4 + 3] = p.constant;
  }
}

function geoRadius(geo) {
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingSphere.radius;
}

// proxy geometry for the far cascade: crowns -> 20-tri blob, trunks -> 12-tri post
const CROWN_PROXY = new THREE.IcosahedronGeometry(1, 0);
const TRUNK_PROXY = new THREE.BoxGeometry(1, 1, 1);
const PROXY_MAT = new THREE.MeshBasicMaterial({ color: 0x000000 });

// ---------------------------------------------------------------- U10 tint
// ONE-SHOT PER-INSTANCE TINT. `claim()` has taken a `color` argument since the
// pools were written and the draw path has always uploaded it (`p.cols` ->
// `instanceColor`, and every pool material is `vertexColors: true`, so the
// instance colour MULTIPLIES the kit's baked vertex colours) — but the ROOF
// programme cannot reach it: `Roof.emit()` goes through `env.claim`, a 7-arg
// lambda built in assemble.js with a fixed signature. So the
// tint arrives out of band: set it immediately before the claim, and the next
// `claim()` consumes and clears it. Single-threaded, synchronous, one frame of
// life — the value cannot leak past the call it was set for because `claim()`
// clears it whether or not it used it.
let _tint = null;
export function nextTint(r, g, b) { _tint = (r === null) ? null : [r, g, b]; }

// U10 STREET FURNITURE. Every one of these is claimed from assemble.js or
// streetNYC.js — other people's files — with no colour and no scale, so a block
// of 1980s litter baskets, a row of hydrants and every stoop rail in Harlem are
// pixel-identical to each other. The variance is applied HERE, from the
// instance's own world position, for the same reason the tree lean is: it needs
// no caller change at all.
//   s = +-scale, v = value multiplier range, w = warm/cool swing.
// DELIBERATELY ABSENT: every signal head, pedestrian head, street-name blade,
// sign panel and *Glow pool. Those carry MUTCD colour and legibility that
// earlier rounds calibrated against real specs (docs/notes/video-review-lessons),
// and "variety" on a red signal lens is a defect, not a feature.
const STREET_VAR = {
  hydrant: [0.05, 0.72, 1.08, 0.20], litter: [0.05, 0.60, 1.05, 0.26],
  mailbox: [0.03, 0.74, 1.06, 0.16], bollard: [0.06, 0.70, 1.06, 0.18],
  // the cone is deliberately the tightest entry here: its safety orange is
  // already near the top of the linear range, so a 1.10 x 1.22 tint would
  // bleach it to near-white rather than read as a faded cone.
  cone: [0.10, 0.70, 1.00, 0.14], newsbox: [0.05, 0.64, 1.08, 0.24],
  bench: [0.04, 0.68, 1.06, 0.24], bikeRack: [0.04, 0.74, 1.05, 0.14],
  treeFence: [0.05, 0.66, 1.06, 0.20], dumpster: [0.06, 0.60, 1.06, 0.28],
  signPole: [0.02, 0.76, 1.05, 0.14], signPoleOneWay: [0.02, 0.76, 1.05, 0.14], lampCobra: [0.02, 0.80, 1.05, 0.12],
  lampCrook: [0.03, 0.78, 1.05, 0.14], scaffold: [0.00, 0.78, 1.06, 0.16],
  awning: [0.00, 0.70, 1.09, 0.22], stoop: [0.00, 0.80, 1.06, 0.14],
  fireEscape3: [0.00, 0.68, 1.05, 0.26], fireEscape4: [0.00, 0.68, 1.05, 0.26],
  fireEscape5: [0.00, 0.68, 1.05, 0.26], standpipe: [0.03, 0.70, 1.06, 0.24],
  curbRamp: [0.00, 0.78, 1.06, 0.12], curbRampBare: [0.00, 0.78, 1.06, 0.12],
  curbRampIron: [0.00, 0.76, 1.06, 0.14], busShelter: [0.00, 0.84, 1.04, 0.08],
  newsstand: [0.03, 0.78, 1.06, 0.14], planter: [0.06, 0.70, 1.08, 0.24],
};
function hpos(x, z, n) {
  const v = Math.sin(x * 127.1 + z * 311.7 + n * 74.731) * 43758.5453;
  return v - Math.floor(v);
}
// hash -> a weathering multiplier: `v` is the value scale, `w` the warm/cool
// swing (positive = rust/soot warm, negative = galvanised cool).
export function tintOf(v, w) { return [v * (1 + w), v * (1 + w * 0.18), v * (1 - w * 0.75)]; }

function mkInstanced(geo, mat, cap, name) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.name = name;
  m.count = 0;
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

export class Instancer {
  constructor(scene) {
    this.scene = scene;
    this.pools = new Map();
    this.engine = null;
    const geos = buildFurnitureGeos();
    // light trim (materials.js applyLightTrim): props got the untrimmed scene sun
    // and rendered 2-3x hot — the ramp plates read salmon instead of brick red
    // the ground's trim is 0.30 x its warm calibration (1.94, 1.70, 1.47); a flat
    // 0.30 left every prop darker and cooler than the pavement it stands on (street
    // audit round 3 §5). Props carry the same calibration; furnitureKit colours are
    // therefore authored PHYSICAL (no per-channel pre-multiply).
    const STREET_CAL = [1.94, 1.70, 1.47];
    this.baseMat = applyLightTrim(applyCityAO(applySnowCap(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }))), STREET_CAL);
    // SG13 signal glass (docs/notes/signals-r13.md): an UNLIT traffic signal
    // lens is not a black disc, it is a dark mirror with the sky in it — the one
    // cue that separates "off" from "painted out". baseMat at roughness 0.82
    // cannot give that, and the lens is 12 in of a whole city block, so it gets
    // its own material rather than its own shader branch. No snow cap: the lens
    // faces the horizon.
    this._lensMat = null;
    this.lensMat = () => {
      if (!this._lensMat) {
        this._lensMat = applyLightTrim(applyCityAO(new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.17, metalness: 0.55,
        })), STREET_CAL);
      }
      return this._lensMat;
    };
    // awning cloth: same look as baseMat plus a wind flutter on the loose edge
    this._clothMat = null;
    this.clothMat = () => {
      if (this._clothMat) return this._clothMat;
      const m = applyLightTrim(applyCityAO(applySnowCap(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 }))), [1.94, 1.70, 1.47]);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uWT = ENV.windT;
        sh.uniforms.uWA = ENV.windAmp;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\n uniform float uWT; uniform float uWA;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
      { // cloth flutter: outboard edge ripples, mount line stays pinned
        #ifdef USE_INSTANCING
          vec4 wp4 = instanceMatrix * vec4(position, 1.0);
        #else
          vec4 wp4 = vec4(position, 1.0);
        #endif
        float loose = clamp(abs(position.z) * 1.3, 0.0, 1.0);
        float w2 = (0.35 + uWA * 0.8);
        transformed.y += sin(uWT * 2.7 + wp4.x * 1.9 + wp4.z * 2.3 + position.x * 3.1) * 0.03 * w2 * loose;
        transformed.z += cos(uWT * 3.3 + wp4.x * 2.7) * 0.018 * w2 * loose;
      }`);
      };
      const oldKey = m.customProgramCacheKey;
      m.customProgramCacheKey = function () { return (oldKey ? oldKey.call(this) : '') + '|cloth'; };
      this._clothMat = m;
      return m;
    };
    // r8 foliage alpha ramp, see the alphatest_fragment hook below.
    // x = log2(texels/px) where the ramp opens, y = where it saturates,
    // z = alpha gain there (1.55 = an effective alphaTest of 0.35 -> 0.226).
    //
    // z DEFAULTS TO 1.0, i.e. the ramp is WIRED BUT OFF, and that is deliberate.
    // The gain is the only part of this pass whose calibration depends on
    // something the code cannot see: how many texels of the leaf atlas one leaf
    // CARD spans. The puff crowns map the whole 256 px LEAF_TEX over a ~3 m
    // canopy (8 texels/px only at ~78 m), while an ez-tree card maps a sub-rect
    // of a 512-1024 px atlas over ~0.3 m of quad (8 texels/px at ~4 m) — two
    // regimes an order of magnitude apart under ONE ramp. The 960x540 smoke
    // pair (notes 3.2) put +0.30 pp of the regression in the canopy band with
    // the ramp at 1.55, which is what an over-eager ramp looks like. So the
    // shipped default is the part that is unconditionally correct (the
    // coverage-preserving mip chain in furnitureKit.js) and the ramp is an
    // opt-in measured separately:
    //     tflick --eval "window.__AA_LEAF.value.z = 1.55"
    // It only becomes a default if that run wins.
    this._aaLeaf = { value: new THREE.Vector3(3.0, 6.0, 1.0) };
    if (typeof window !== 'undefined') window.__AA_LEAF = this._aaLeaf;   // tflick --eval isolation
    // foliage: high-frequency normal jitter breaks up the faceted-polygon look
    this.crownMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0.0,
      map: LEAF_TEX, alphaTest: 0.45, side: THREE.DoubleSide,
      // ALPHA TO COVERAGE (docs/notes/glitch-r7.md 3.4). The leaf atlas
      // (furnitureKit LEAF_TEX) is 95 OPAQUE ellipses painted on a transparent
      // canvas — binary alpha — mipmapped, and cut with a fixed alphaTest. Mip
      // averaging turns that binary alpha into a fraction, so at range the
      // threshold sits in the middle of the ramp and whole texels flip in and
      // out as the camera moves. Measured: the tree framing `gxTrees` scores
      // 40.8 % flickering pixels with shadows pinned, no screen-space passes and
      // no TAA, and all 8 worst tiles of the 120 m `fStreetGeom` are crowns
      // (tools/tflick.mjs). It is the single largest motion artefact in the film.
      // three 0.185's `alphatest_fragment` has an ALPHA_TO_COVERAGE branch that
      // replaces the binary cut with
      //   a = smoothstep(alphaTest, alphaTest + fwidth(a), a); if (a == 0.0) discard;
      // and lets SAMPLE_ALPHA_TO_COVERAGE spread the result over the scene RT's
      // MSAA samples (engine.js ScenePrePass, `samples: 2`). It is the textbook
      // fix for foliage crawl and it costs nothing.
      //
      // MEASURED, AND IT IS A REGRESSION HERE. DO NOT SWITCH IT ON.
      // tools/tflick.mjs, 1920x1080, 6 frames 2 cm apart, shadows pinned, no
      // screen-space passes, no TAA:
      //                     alphaToCoverage off      on
      //   gxTrees              40.81 %            41.84 %   control 0 px -> 86 508 px
      //   gxThin               23.13 %            23.60 %   control 0 px -> 42 668 px
      //   fMarkings            17.31 %            17.53 %   control 0 px -> 21 009 px
      // The control is two renders of ONE camera position inside one
      // synchronous block, which is byte-identical for every other
      // configuration this project has measured (zfight.md 3c) — so switching
      // this on makes the renderer itself non-deterministic, and it raises the
      // flicker it was meant to cut. The mechanism: these crowns are DoubleSide
      // cards that overlap heavily and draw in the OPAQUE pass with depth write,
      // so with dithered coverage the two samples of one pixel get filled by
      // DIFFERENT cards at near-equal depth; the resolve then mixes two cards'
      // shading, and which card owns which sample is decided per sample by the
      // driver. Coverage AA needs either non-overlapping cutouts or more
      // samples than this pipeline has. The real fix for the crawl is in the
      // TEXTURE and the threshold, not in coverage — see docs/notes/glitch-r7.md
      // 3.4 and 4.3.
      alphaToCoverage: false,
    });
    this.crownMat.onBeforeCompile = (sh) => {
      sh.uniforms.windT = ENV.windT;
      sh.uniforms.windAmp = ENV.windAmp;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vLeafP;
          uniform float windT; uniform float windAmp;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLeafP = position * 9.0;
          { // rooted whole-tree sway (bend grows with height^2, anchored at the
            // trunk) + leaf flutter along the crown normal — vegetation contract:
            // never translate the roots
            #ifdef USE_INSTANCING
              vec2 wrt = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            #else
              vec2 wrt = vec2(0.0);
            #endif
            float ph = fract(wrt.x * 0.171 + wrt.y * 0.113) * 6.283;
            float hgt = max(position.y - 1.6, 0.0);
            float bend = hgt * hgt * 0.0028 * windAmp;
            transformed.xz += vec2(sin(windT * 1.05 + ph) * 0.8 + 0.35, cos(windT * 0.83 + ph * 1.31) * 0.6) * bend;
            transformed += objectNormal * (sin(windT * 4.2 + ph * 3.0 + position.y * 1.7) * 0.035 * windAmp * step(0.01, hgt));
          }`);
      sh.uniforms.aaLeaf = this._aaLeaf;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vLeafP; uniform vec3 aaLeaf;
          float lhash(vec3 p){ p = fract(p * 0.3183) * 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
        // FOOTPRINT-RAMPED ALPHA TEST (r8, ?aa=0 reverts to a flat threshold).
        // The coverage-preserving mip chain (furnitureKit.alphaMipCanvasTexture)
        // fixes the SYSTEMATIC drift of the canopy alpha through alphaTest,
        // but once a leaf card is a handful of pixels wide the surviving
        // threshold-marginal band is most of the card, and a 2 cm dolly walks
        // texels across it. A distant street tree is a solid mass, not a lace
        // of individual leaves, so past ~8 texels per pixel the effective
        // threshold is lowered (alpha gained up) until the crown closes.
        // Cheaper and, unlike alphaToCoverage, deterministic: it is one
        // multiply on a value the alpha test already reads.
        // aaLeaf = (log2 texels/px where the ramp starts, where it ends, gain).
        // Exposed as a uniform so tflick --eval can sweep it without a rebuild.
        .replace('#include <alphatest_fragment>', `{
          vec2 aaTs = vec2(textureSize(map, 0));
          vec2 aaDx = dFdx(vMapUv) * aaTs, aaDy = dFdy(vMapUv) * aaTs;
          float aaMip = 0.5 * log2(max(max(dot(aaDx, aaDx), dot(aaDy, aaDy)), 1e-8));
          diffuseColor.a *= mix(1.0, aaLeaf.z, smoothstep(aaLeaf.x, aaLeaf.y, aaMip));
        }
        #include <alphatest_fragment>`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          // gentle leaf-cluster grain over the smooth crown-volume normals.
          // r8: floor(vLeafP) quantises to 1/9 m cells, which is 1.3 px at the
          // 120 m fStreetGeom framing — an unfiltered hash at pixel scale, i.e.
          // pure aliasing driving a SPECULAR normal. Every other derivative
          // effect in this project is footprint-gated; this one never was.
          // Fade it out before the cells reach a pixel (?aa=0 reverts).
          vec3 lj = vec3(lhash(floor(vLeafP)), lhash(floor(vLeafP) + 31.7), lhash(floor(vLeafP) + 57.3)) - 0.5;
          float ljVis = ${AAFIX ? 'smoothstep(1.0, 0.30, length(fwidth(vLeafP)))' : '1.0'};
          normal = normalize(normal + lj * (0.18 * ljVis));`);
    };
    applySnowCap(this.crownMat, 0.85); // snow-laden canopies (composes with sway)
    applyCityAO(this.crownMat);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.glowMat.onBeforeCompile = (sh) => {
      sh.uniforms.night = ENV.night;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float night;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= (0.25 + night * 2.4);');
    };
    // PANEL POOLS (`tex: true` in furnitureKit): the same look as their
    // neighbours plus the shared street-furniture panel atlas (city/panelArt.js).
    // A pool stays ONE draw call — every triangle of it that is not a panel has
    // its uv parked on the atlas's white block, where map * vertexColor is just
    // the vertex colour the kit already authored.
    this._texMat = null; this._glowTexMat = null;
    this.texMat = () => {
      if (!this._texMat) {
        this._texMat = applyLightTrim(applyCityAO(applySnowCap(new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.62, metalness: 0.05, map: panelTexture(),
        }))), STREET_CAL);
      }
      return this._texMat;
    };
    this.glowTexMat = () => {
      if (this._glowTexMat) return this._glowTexMat;
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, map: panelTexture() });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.night = ENV.night;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float night;')
          // A BACKLIT AD CASE IS ART BY DAY AND A LIGHT SOURCE AT NIGHT. The flat
          // glow curve (0.25 + night * 2.4) is right for a lamp lens baked at a
          // gain, and wrong for a printed panel: it rendered every kiosk face and
          // shelter poster at a QUARTER value, which is why they read as blank
          // grey rectangles in daylight (critic round 5 defect 19).
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= (0.85 + night * 1.6);');
      };
      m.customProgramCacheKey = () => 'panelglow';
      this._glowTexMat = m;
      return m;
    };
    const glowNames = ['lampCobraGlow', 'lampCrookGlow', 'signalMastGlow', 'signalPedGlow', 'subwayGlow', 'linknycGlow', 'busShelterGlow', 'marqueeGlow'];
    for (const [name, def] of Object.entries(geos)) {
      const cap = CAPS[name] ?? 2000;
      const isGlow = def.glow || glowNames.includes(name);
      const mat = def.tex ? (isGlow ? this.glowTexMat() : this.texMat())
        : isGlow ? this.glowMat : name.endsWith('Crown') ? this.crownMat : name === 'awning' ? this.clothMat()
          : name === 'signalLens' ? this.lensMat() : this.baseMat;   // SG13
      const main = mkInstanced(def.geo, mat, Math.min(cap, 4096), 'pool:' + name);
      main.castShadow = false;                 // the shadow set below casts instead
      main.receiveShadow = true;
      main.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(main.instanceMatrix.count * 3).fill(1), 3);
      main.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(main);
      this.pools.set(name, this._mkPool(name, main, cap, !isGlow && !NO_SHADOW.has(name), def.baseH));
      // A kit part may ship its own coarse level as `def.lod = { geo, dist }`
      // (furnitureKit `G.subway`): geometry whose finest members are sub-pixel
      // at range is a motion artefact, not detail — see docs/notes/glitch-r7.md
      // 3.2. Same mechanism trees already use through setLOD().
      if (def.lod && def.lod.geo) this.setLOD(name, def.lod.geo, def.lod.dist ?? 120);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._camPos = new THREE.Vector3(1e9, 1e9, 1e9);
    this._camQ = new THREE.Quaternion();
    this._sunT = new THREE.Vector3(1e9, 0, 1e9);
    this._sunD = new THREE.Vector3();
    this.stats = { mainInst: 0, shadowInst: 0, cullMs: 0 };
  }
  _mkPool(name, main, cap, castShadow, baseH) {
    const geo = main.geometry;
    const isTree = /^tree.*(Crown|Trunk)$/.test(name);
    const p = {
      name, mesh: main, cap, top: 0, free: [], dirty: true, sdirty: true, fdirty: true, baseH,
      geo, mat: main.material,
      radius: geoRadius(geo),
      h: geo.boundingBox ? Math.max(0.5, geo.boundingBox.max.y - geo.boundingBox.min.y) : 4,
      n: 0,                                     // live instances
      size: 0, pos: null, rad: null, scl: null, mats: null, cols: null, alive: null,
      shadow: null, far: null, isTree, roofLow: ROOF_LOW.has(name),
      lod: null, mesh2: null, shadow2: null,     // optional distance LOD (setLOD)
    };
    this._growStore(p, Math.min(cap, 1024));
    if (castShadow) {
      p.shadow = mkInstanced(geo, main.material, Math.min(cap, 4096), 'poolS:' + name);
      p.shadow.castShadow = true;
      // three's depth pass renders a FrontSide material's BACK faces, so a
      // CLOSED prop (hydrant, mailbox, stoop, bollard, dumpster, roof unit)
      // writes its own underside — level with the ground it stands on — and
      // throws nothing. Poles and leaf cards happened to work, which is why
      // critic r5 saw lamp standards and trees cast and nothing else.
      // (shadowSide is read ONLY by the shadow depth pass: the main draw is
      // unchanged, so this is a shadow flag, not a material change.)
      if (main.material && !Array.isArray(main.material)) main.material.shadowSide = THREE.DoubleSide;
      p.shadow.visible = false;                 // shown only inside the near shadow pass
      this.scene.add(p.shadow);
      if (isTree) {
        p.far = mkInstanced(name.endsWith('Crown') ? CROWN_PROXY : TRUNK_PROXY, PROXY_MAT, Math.min(cap, 4096), 'poolF:' + name);
        p.far.castShadow = true;
        p.far.visible = false;                  // shown only while the far cascade re-renders
        this.scene.add(p.far);
      }
    }
    return p;
  }
  _growStore(p, size) {
    const grow = (old, n, Ctor = Float32Array) => { const a = new Ctor(n); if (old) a.set(old); return a; };
    p.pos = grow(p.pos, size * 3); p.rad = grow(p.rad, size); p.scl = grow(p.scl, size);
    p.mats = grow(p.mats, size * 16); p.cols = grow(p.cols, size * 3); p.alive = grow(p.alive, size, Uint8Array);
    p.size = size;
  }
  // pools created by other modules (props.js companions) arrive as plain
  // {mesh, cap} records with a scene-attached InstancedMesh: adopt the mesh
  // as the main draw mesh and build the store + shadow set around it
  _ensure(p) {
    if (p.pos) return;
    const t = p.mesh;
    const cast = !!t.castShadow;
    t.count = 0; t.frustumCulled = false; t.castShadow = false; t.matrixAutoUpdate = false;
    t.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (!t.instanceColor) t.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(t.instanceMatrix.count * 3).fill(1), 3);
    t.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const name = p.name || t.name || 'ext';
    t.name = 'pool:' + name;
    Object.assign(p, this._mkPool(name, t, p.cap ?? 4000, cast, undefined));
  }
  attach(engine) {
    this.engine = engine;
    engine.addShadowListener?.((phase) => this._shadowPhase(phase));
    if (CS11) csAttach(this);                // CS11: blob strength reads engine.shadowMix
  }
  // distance LOD for a pool: instances farther than `dist` (horizontal) from
  // the camera draw `geo` instead (same material); trees.js feeds lighter
  // ez-tree builds — at 120 m a tree is ~60 px tall and branch segment counts
  // are invisible. Shadow set uses the same split.
  setLOD(name, geo, dist = 120) {
    const p = this.pools.get(name);
    if (!p) return;
    this._ensure(p);
    geoRadius(geo);
    if (!p.mesh2) {
      p.mesh2 = mkInstanced(geo, p.mat, Math.min(p.cap, 4096), 'pool:' + name + ':lod');
      p.mesh2.castShadow = false; p.mesh2.receiveShadow = true;
      p.mesh2.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(p.mesh2.instanceMatrix.count * 3).fill(1), 3);
      p.mesh2.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(p.mesh2);
      if (p.shadow) {
        p.shadow2 = mkInstanced(geo, p.mat, Math.min(p.cap, 4096), 'poolS:' + name + ':lod');
        p.shadow2.castShadow = true; p.shadow2.visible = false;
        this.scene.add(p.shadow2);
      }
    } else { p.mesh2.geometry = geo; if (p.shadow2) p.shadow2.geometry = geo; }
    p.lod = { geo, dist2: dist * dist };
    p.dirty = p.sdirty = true;
  }
  _shadowPhase(phase) {
    const on = Instancer.shadowSets;
    if (phase === 'nearBegin') { for (const p of this.pools.values()) { if (p.shadow) p.shadow.visible = on && p.shadow.count > 0; if (p.shadow2) p.shadow2.visible = on && p.shadow2.count > 0; } }
    else if (phase === 'nearEnd') { for (const p of this.pools.values()) { if (p.shadow) p.shadow.visible = false; if (p.shadow2) p.shadow2.visible = false; } }
    else if (phase === 'farBegin') { for (const p of this.pools.values()) if (p.far) { this._compactFar(p); p.far.visible = on && p.far.count > 0; } }
    else if (phase === 'farEnd') { for (const p of this.pools.values()) if (p.far) p.far.visible = false; }
  }
  claim(name, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, color = null) {
    const p = this.pools.get(name);
    if (!p) return -1;
    this._ensure(p);
    let slot;
    if (p.free.length) slot = p.free.pop();
    else {
      if (p.top >= p.cap) return -1;
      if (p.top >= p.size) this._growStore(p, Math.min(p.cap, p.size * 2));
      slot = p.top++;
    }
    // U10 STREET FURNITURE age/size (see STREET_VAR). Only when the caller gave
    // neither an explicit colour nor a tint, so nothing here can override a
    // deliberate one (tree crowns, roof props).
    if (U10 && color === null && _tint === null) {
      const V = STREET_VAR[name];
      if (V) {
        if (V[0] > 0) {
          const f = 1 + (hpos(x, z, 2.71) - 0.5) * 2 * V[0];
          sx *= f; sy *= 1 + (f - 1) * 0.6; sz *= f;
        }
        const v = V[1] + hpos(x, z, 7.43) * (V[2] - V[1]);
        const w = (hpos(x, z, 11.7) - 0.5) * 2 * V[3];
        _tint = tintOf(v, w);
      }
    }
    // U10 TREE LEAN. A street tree is not a plumb post: it leans away from the
    // wall it grew beside, and a row of them leaning the SAME way is the second
    // thing that reads as instancing after identical crowns. `claim()` only ever
    // took a Y rotation, so the lean is derived HERE from the instance's own
    // world position — the trunk and the crown of one tree share (x, z), so they
    // get the same tilt for free and nothing upstream has to pass anything.
    // ±0.055 rad = 3.2°, which moves a 10 m crown ~55 cm: visible in a row,
    // never enough to put a trunk through the kerb.
    let tX = 0, tZ = 0;
    if (U10 && p.isTree) {
      const h1 = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const h2 = Math.sin(x * 39.3467 + z * 11.1357) * 24634.6345;
      tX = (h1 - Math.floor(h1) - 0.5) * 0.11;
      tZ = (h2 - Math.floor(h2) - 0.5) * 0.11;
    }
    // TV25 (trees agent): the census hands every tree the ROAD's direction as its yaw, so two trees of one variant in
    // a row were the same crown turned the same way — a clone. A tree has no preferred azimuth: turn each one by its
    // own position hash, and stretch its crown +-11 % along a random horizontal axis. Trunk and crown share (x, z),
    // so they turn together; the pit fence is not a tree pool and keeps the kerb's alignment.
    if (TV25 && p.isTree) {
      rotY += hpos(x, z, 9.13) * 6.283185;
      const an = 1 + (hpos(x, z, 4.77) - 0.5) * 0.22;
      sx *= an; sz /= an;
    }
    this._e.set(tX, rotY, tZ);
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    p.mats.set(this._m.elements, slot * 16);
    p.pos[slot * 3] = x; p.pos[slot * 3 + 1] = y; p.pos[slot * 3 + 2] = z;
    const sc = Math.max(sx, sy, sz);
    p.scl[slot] = sc;
    p.rad[slot] = p.radius * sc;
    // `color` (a hex NUMBER) keeps priority; `_tint` is an [r,g,b] LINEAR
    // multiplier, which is what `instanceColor` is used as — `setRGB` writes
    // working-space values directly, so 0.7 really is 30 % darker.
    if (color !== null) this._c.set(color);
    else if (_tint !== null) this._c.setRGB(_tint[0], _tint[1], _tint[2]);
    else this._c.setRGB(1, 1, 1);
    _tint = null;                                  // one shot, consumed or not
    // U10 CANOPY DENSITY. assemble.js gives a crown one of THREE tints
    // (`sp.c + ((wx|0) % 3) * 0x050803`), so a street of the same species is
    // three colours repeating. A real row is a continuum: a thin crown lets the
    // sky through and reads light and grey-green, a dense one reads dark and
    // saturated, and a stressed one yellows. This multiplies the caller's colour
    // rather than replacing it, so the species palette is untouched.
    if (U10 && p.isTree && name.charCodeAt(name.length - 1) === 110 /* 'n' of Crown */) {
      if (TV25) {
        // TV25: the caller's colour is white (the species colour lives in the leaf atlas). Value spread of a street's
        // canopy, a graded stress term — most trees a little tired, ~12 % visibly yellowing and thin-looking (paler,
        // warmer, less blue) the way a drought-stressed or salt-burned street tree is — and a warm/cool green drift.
        const f = 0.84 + hpos(x, z, 3.91) * 0.30;
        const st = hpos(x, z, 5.17);
        const y = st > 0.88 ? 0.55 + ((st - 0.88) / 0.12) * 0.45 : st * 0.25;
        const hd = (hpos(x, z, 6.37) - 0.5) * 0.12;
        this._c.setRGB(this._c.r * f * (1 + y * 0.30 + hd), this._c.g * f * (1 + y * 0.08), this._c.b * f * (1 - y * 0.35 - hd));
      } else {
        const f = 0.80 + hpos(x, z, 3.91) * 0.40;          // density -> value
        const y = hpos(x, z, 5.17);                        // stress -> yellow
        this._c.setRGB(this._c.r * f * (1 + y * 0.16), this._c.g * f * (1 + y * 0.06), this._c.b * f * (1 - y * 0.18));
      }
    }
    // TV25: the bark of one species is not one colour either — weathering, moss on the shaded side, a wet or a dusty
    // trunk. The trunk pools are claimed without a colour (white), so give each its own value and warm/cool swing.
    if (TV25 && U10 && p.isTree && name.charCodeAt(name.length - 1) === 107 /* 'k' of Trunk */) {
      const f = 0.82 + hpos(x, z, 8.21) * 0.32, w = (hpos(x, z, 2.33) - 0.5) * 0.14;
      this._c.setRGB(this._c.r * f * (1 + w), this._c.g * f, this._c.b * f * (1 - w));
    }
    p.cols[slot * 3] = this._c.r; p.cols[slot * 3 + 1] = this._c.g; p.cols[slot * 3 + 2] = this._c.b;
    p.alive[slot] = 1;
    p.n++;
    p.ver = (p.ver | 0) + 1;       // slot contents changed (src/perception/segRender.js caches its id codes per version)
    p.dirty = p.sdirty = p.fdirty = true;
    // CS11: one contact ellipse per grounded prop. Returns immediately for every pool
    // that is not in the table (including csBlob itself, so this cannot recurse).
    if (CS11) csClaim(this, name, p, slot, x, y, z, rotY, sx, sy, sz);
    return slot;
  }
  release(name, handle) {
    const p = this.pools.get(name);
    if (!p || handle < 0 || !p.alive || handle >= p.top || !p.alive[handle]) return;
    if (CS11) csRelease(this, p, handle);    // CS11: drop this prop's contact ellipse
    p.alive[handle] = 0;
    p.free.push(handle);
    p.n--;
    p.ver = (p.ver | 0) + 1;
    p.dirty = p.sdirty = p.fdirty = true;
  }
  setMatrix(name, handle, x, y, z, rotY, sc = 1) {
    const p = this.pools.get(name);
    if (!p || handle < 0 || !p.alive || handle >= p.top || !p.alive[handle]) return;
    this._e.set(0, rotY, 0);
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(sc, sc, sc));
    p.mats.set(this._m.elements, handle * 16);
    p.pos[handle * 3] = x; p.pos[handle * 3 + 1] = y; p.pos[handle * 3 + 2] = z;
    p.scl[handle] = sc;
    p.rad[handle] = p.radius * sc;
    p.ver = (p.ver | 0) + 1;
    p.dirty = p.sdirty = true;
  }
  // geometry / material swaps on the main mesh (props.js, trees.js) propagate
  _sync(p) {
    const t = p.mesh;
    if (t.geometry !== p.geo) {
      p.geo = t.geometry;
      p.radius = geoRadius(p.geo);
      p.h = p.geo.boundingBox ? Math.max(0.5, p.geo.boundingBox.max.y - p.geo.boundingBox.min.y) : p.h;
      for (let i = 0; i < p.top; i++) p.rad[i] = p.radius * p.scl[i];
      if (p.shadow) p.shadow.geometry = p.geo;
      p.dirty = p.sdirty = p.fdirty = true;
    }
    if (t.material !== p.mat) {
      p.mat = t.material;
      if (p.shadow) p.shadow.material = p.mat;
      if (p.mesh2) p.mesh2.material = p.mat;
      if (p.shadow2) p.shadow2.material = p.mat;
    }
  }
  flush() {
    for (const p of this.pools.values()) { if (p.pos) this._sync(p); }
  }
  // grow a draw mesh's instance buffers (rare: aerial views of dense pools)
  _growMesh(mesh, need, withColor) {
    const cap = Math.min(Math.max(need, mesh.instanceMatrix.count * 2), 1 << 20);
    const im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
    im.setUsage(THREE.DynamicDrawUsage);
    im.array.set(mesh.instanceMatrix.array);
    mesh.instanceMatrix = im;
    if (withColor) {
      const ic = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      ic.setUsage(THREE.DynamicDrawUsage);
      if (mesh.instanceColor) ic.array.set(mesh.instanceColor.array);
      mesh.instanceColor = ic;
    }
  }
  // copy the instances of `p` that intersect the planes into `mesh`; with a
  // pool LOD, instances beyond lod.dist2 (horizontal) go to `mesh2` instead
  _compact(p, mesh, planes, pad, minAng, camX, camY, camZ, withColor, mesh2 = null) {
    const pos = p.pos, rad = p.rad, alive = p.alive, mats = p.mats, cols = p.cols;
    let out = mesh.instanceMatrix.array, outC = withColor ? mesh.instanceColor.array : null;
    const lod2 = mesh2 && p.lod ? p.lod.dist2 : Infinity;
    let out2 = mesh2 ? mesh2.instanceMatrix.array : null, outC2 = mesh2 && withColor ? mesh2.instanceColor.array : null;
    let k = 0, k2 = 0;
    const top = p.top;
    const roofLow = p.roofLow && planes !== null;
    for (let s = 0; s < top; s++) {
      if (!alive[s]) continue;
      const x = pos[s * 3], y = pos[s * 3 + 1], z = pos[s * 3 + 2];
      const r = rad[s] + pad;
      const dx = x - camX, dy = y - camY, dz = z - camZ;
      if (planes) {
        let inside = true;
        for (let i = 0; i < 24; i += 4) {
          if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < -r) { inside = false; break; }
        }
        if (!inside) continue;
        if (roofLow && camY < y - ROOF_BELOW && dx * dx + dz * dz > ROOF_DIST2) continue; // behind its parapet
        if (minAng > 0) {
          const d2 = dx * dx + dy * dy + dz * dz;
          const rr = rad[s];
          if (rr * rr < minAng * minAng * d2) continue;   // whole sphere under half a pixel
        }
      }
      if (dx * dx + dz * dz > lod2) {
        if (k2 >= mesh2.instanceMatrix.count) {
          this._growMesh(mesh2, k2 + 1, withColor);
          out2 = mesh2.instanceMatrix.array; outC2 = withColor ? mesh2.instanceColor.array : null;
        }
        out2.set(mats.subarray(s * 16, s * 16 + 16), k2 * 16);
        if (outC2) { outC2[k2 * 3] = cols[s * 3]; outC2[k2 * 3 + 1] = cols[s * 3 + 1]; outC2[k2 * 3 + 2] = cols[s * 3 + 2]; }
        k2++;
        continue;
      }
      if (k >= mesh.instanceMatrix.count) {
        this._growMesh(mesh, k + 1, withColor);
        out = mesh.instanceMatrix.array; outC = withColor ? mesh.instanceColor.array : null;
      }
      out.set(mats.subarray(s * 16, s * 16 + 16), k * 16);
      if (outC) { outC[k * 3] = cols[s * 3]; outC[k * 3 + 1] = cols[s * 3 + 1]; outC[k * 3 + 2] = cols[s * 3 + 2]; }
      k++;
    }
    mesh.count = k;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
    if (outC) { const ic = mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, k * 3); ic.needsUpdate = true; }
    if (mesh2) {
      mesh2.count = k2;
      const im2 = mesh2.instanceMatrix;
      im2.clearUpdateRanges(); im2.addUpdateRange(0, k2 * 16); im2.needsUpdate = true;
      if (outC2) { const ic2 = mesh2.instanceColor; ic2.clearUpdateRanges(); ic2.addUpdateRange(0, k2 * 3); ic2.needsUpdate = true; }
    }
    return k + k2;
  }
  // far-cascade proxies: every live tree as a blob/post fitted to the geometry bbox
  _compactFar(p) {
    if (!p.fdirty) return;
    p.fdirty = false;
    const bb = p.geo.boundingBox;
    if (!bb) return;
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const sx = Math.max(0.3, (bb.max.x - bb.min.x) / 2), sy = Math.max(0.3, (bb.max.y - bb.min.y) / 2), sz = Math.max(0.3, (bb.max.z - bb.min.z) / 2);
    const local = this._m.compose(this._v.set(cx, cy, cz), this._q.identity(), this._s.set(sx, sy, sz));
    const inst = new THREE.Matrix4();
    const mesh = p.far;
    let k = 0;
    for (let s = 0; s < p.top; s++) {
      if (!p.alive[s]) continue;
      if (k >= mesh.instanceMatrix.count) this._growMesh(mesh, k + 1, false);
      inst.fromArray(p.mats, s * 16).multiply(local);
      mesh.instanceMatrix.array.set(inst.elements, k * 16);
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, k * 16); mesh.instanceMatrix.needsUpdate = true;
  }
  // per frame, after the controller and updateSun: refresh the culled draw sets
  cull(camera = this.engine?.camera) {
    if (!camera) return;
    const t0 = performance.now();
    camera.updateMatrixWorld();
    const moved = camera.position.distanceToSquared(this._camPos) > 1.0 || 1 - Math.abs(camera.quaternion.dot(this._camQ)) > 6e-5;
    if (moved) { this._camPos.copy(camera.position); this._camQ.copy(camera.quaternion); planesFrom(camera, _pl); }
    const H = typeof innerHeight === 'number' ? innerHeight : 1080;
    const minAng = MIN_PX / (H / (2 * Math.tan((camera.fov * Math.PI) / 360)));
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let mainInst = 0, shadowInst = 0;
    // near shadow cascade box (planes of the light's ortho camera)
    const sun = this.engine?.sun;
    let smoved = false, shadowOn = false;
    if (sun && sun.castShadow) {
      shadowOn = true;
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
      const tp = sun.target.position;
      this._v.subVectors(sun.position, tp).normalize();
      // ...or the cascade resized (engine.shadowBoxV): the box follows camera
      // height now, and a stale plane set keeps the pools culled to the old one
      const bv = this.engine.shadowBoxV || 0;
      smoved = tp.distanceToSquared(this._sunT) > 64 || this._v.dot(this._sunD) < 0.99995 || bv !== this._shBoxV;
      this._shBoxV = bv;
      if (smoved) {
        this._sunT.copy(tp); this._sunD.copy(this._v);
        sun.shadow.updateMatrices(sun);
        planesFrom(sun.shadow.camera, _pl2);
      }
    }
    for (const p of this.pools.values()) {
      if (!p.pos) continue;
      if (p.n === 0) {
        if (p.mesh.count) { p.mesh.count = 0; }
        if (p.shadow && p.shadow.count) p.shadow.count = 0;
        p.dirty = p.sdirty = false;
        continue;
      }
      if (moved || p.dirty) {
        if (CULL) this._compact(p, p.mesh, _pl, PAD_MAIN, minAng, cx, cy, cz, true, p.mesh2);
        else this._compact(p, p.mesh, null, 0, 0, cx, cy, cz, true, p.mesh2);
        p.dirty = false;
      }
      mainInst += p.mesh.count + (p.mesh2 ? p.mesh2.count : 0);
      if (p.shadow && shadowOn && (smoved || p.sdirty)) {
        if (CULL) this._compact(p, p.shadow, _pl2, PAD_SHADOW, 0, cx, cy, cz, false, p.shadow2);
        else this._compact(p, p.shadow, null, 0, 0, cx, cy, cz, false, p.shadow2);
        p.sdirty = false;
      }
      if (p.shadow) shadowInst += p.shadow.count + (p.shadow2 ? p.shadow2.count : 0);
    }
    this.stats.mainInst = mainInst; this.stats.shadowInst = shadowInst;
    this.stats.cullMs = performance.now() - t0;
  }
  // pools with live instances in the main draw set (this frame's furniture draws)
  subCount() { let n = 0; for (const p of this.pools.values()) { if (p.mesh && p.mesh.count > 0) n++; if (p.mesh2 && p.mesh2.count > 0) n++; } return n; }
  treeSpecies(sp) { return TREE_SPECIES[sp] || TREE_SPECIES[0]; }
}
// debug: window.__SHADOWSETS(false) drops every furniture/vehicle caster from
// the shadow passes (attribution only — NOT a quality setting)
Instancer.shadowSets = true;
