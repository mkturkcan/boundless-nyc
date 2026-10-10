// VG37 shrubs, hedges and planted beds (GROUND, docs/notes/ar35-veg.md): the second kind of the owner's vegetation push
// (2026-10-02 ~05:00: "a push to improve trees and vegetation to a UE5 / Quixel / AAA level"). `?vg37=0` restores what was.
//
// What was: Central Park's understorey shrubs were the street-tree generator's crowns on the tree atlas's cells (city/
// cpFloraKit.js shrubForms), and the city had no hedges, no planted beds and no garden shrubs at all.
//
// THE LEAF ATLAS (public/textures/veg/vg37_leaf_col.webp, _nrm.webp; tools/ar35/veg/build_vg37.py): sixteen 512 px cells
// composed from scanned CC0 leaves (ambientCG LeafSet001 / 017 / 019 / 020 / 022 / 024 / 026), each leaf cut out, scaled to
// its species' size, turned and recoloured in linear light with its normal map turned with it: boxwood sprigs and a
// boxwood cushion, yew sprays, privet, rhododendron whorls, hydrangea leaves and an October mophead, two understorey sprigs
// (viburnum, spicebush), an English ivy runner, fountain grass with its plumes, liriope, a dandelion rosette, a
// chrysanthemum mound, a stem swatch. The normal map's alpha is each texel's translucency.
//
// THE PLANTS are cards of those cells on an envelope, built once per form (two LODs from one layout: LOD1 a quarter of
// the cards at twice the size), instanced per tile with cpFloraKit's lodSet (near / mid by distance):
//   * mound shrubs (rhododendron, hydrangea with its heads, privet, spreading yew, the woodland understorey): sprig cards
//     whose foot sits inside the envelope, pointing outward and up, the outer shell preferred; stems inside;
//   * clipped balls: cushion cards laid on the surface plus a fuzz of sprigs;
//   * tufts (fountain grass, liriope): cards radiating from the crown, arching out; rosettes lie flat;
//   * every card's normal is the plant's VOLUME normal (both faces lit alike), its colour the depth in the plant (the inside
//     and the foot darker), the leaf relief from the atlas's normals on top, the sun through backlit leaves by their
//     translucency, a sway from the foot and a flutter per card on the wind clock (ENV.windT, frozen at dt = 0).
// HEDGES (OpenStreetMap's barrier=hedge: lines and areas, world/vg37Data.js): a hull extruded from the footprint (sunk at
// the foot, a rounded top edge, the top level with the ground under it), textured with a tiling clipped-hedge face
// (vg37_hull_*: small leaves on leaves, the gaps dark), dressed with cushion cards just proud of it and a fuzz of sprigs at
// the top edges; the hull casts the sun's shadow. PLANTED BEDS (landuse=flowerbed): mulched soil (world/vg36Pits.js's pit
// material, its shredded-bark chips) and the planting by garden: the Conservatory Garden's North (French) garden in
// chrysanthemums (its October display), its South (English) garden a mixed border (hydrangea, fountain grass, rhododendron,
// mums, liriope at the edge), every other bed a shrub border. SCRUB (natural=scrub): the understorey shrubs.
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applySnowCap, applyStoneDetail } from './materials.js';
import { pitMat } from './vg36Pits.js';
import { lodSet, filmPath, fpNear2 } from '../city/cpFloraKit.js';
import { VG37_HEDGES, VG37_BEDS, VG37_SCRUB } from './vg37Data.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const VG37 = Q.get('vg37') !== '0';
// VG37H (session 3): the hedge's face relief-mapped (a scanned-leaf height field marched per pixel, its self-shadow and
// cavity AO), the sprigs only at the top's rim; `?vg37h=0` session 2's hull (a flat leaf picture) with sprigs over it
const VG37H = VG37 && Q.get('vg37h') !== '0';
const VG37SLICE = Q.get('vg37slice') !== '0';   // (session 3) a tile's hedges and beds laid out in slices between frames
const TEX = 'textures/veg/';
// x the leaf relief, y the sun through a backlit leaf, z / w spare (live: window.__VG37.K)
const VG37K = { value: new THREE.Vector4(0.55, 0.6, 0.8, 0) };
// the relief: x its depth in uv units (9 cm over the 0.5 m tile: build_vg37h.py DEPTH_M), y the self-shadow's strength,
// z the direct light's cavity term, w the distance (m) past which the march fades to plain mapping (live: __VG37.HK)
const VG37HK = { value: new THREE.Vector4(0.09 / 0.5, 1.0, 0.5, 22) };
const CAL = 2.6;   // the light trim (materials.js applyLightTrim: x mix(0.30, 0.88, night)); the atlas holds real leaf albedo

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- the materials
const CELL = { boxSprig: 0, boxCushion: 1, yewA: 2, yewB: 3, privet: 4, rhodo: 5, hydLeaf: 6, hydHead: 7, underA: 8, underB: 9,
  ivy: 10, fountain: 11, liriope: 12, dandelion: 13, mums: 14, stem: 15 };
const cellUV = (k) => { const i = k % 4, r = Math.floor(k / 4); return [i / 4, 1 - (r + 1) / 4, (i + 1) / 4, 1 - r / 4]; };
const STEM_UV = [0.75 + 0.06, 0.12];   // inside the stem swatch (cell 15's left half)

const TBN = `
mat3 vg37TBN(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 d2p = cross(dp2, N), d1p = cross(N, dp1);
  vec3 T = d2p * du1.x + d1p * du2.x, B = d2p * du1.y + d1p * du2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * im, B * im, N);
}`;
// the sun's shadowed light through a leaf, strongest looking into the sun (as world/vg36.js's blades)
function transChunk() {
  let lf = THREE.ShaderChunk.lights_fragment_begin;
  const a0 = lf.indexOf('directionalLight = directionalLights[ i ];');
  const re = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const a1 = a0 >= 0 ? lf.indexOf(re, a0) : -1;
  if (a1 < 0) return null;
  return lf.slice(0, a1 + re.length) + '\n\t\tvgTr += directLight.color * ( 0.15 + 0.85 * pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 3.0 ) );' + lf.slice(a1 + re.length);
}
let _leaf = null, _hull = null, _tex = null;
function tex() {
  if (_tex) return _tex;
  const L = new THREE.TextureLoader();
  const ld = (f, srgb, rep) => {
    const t = L.load(TEX + f);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  _tex = { col: ld('vg37_leaf_col.webp', true), nrm: ld('vg37_leaf_nrm.webp', false) };
  if (VG37H) { _tex.hcol = ld('vg37_hedge_col.webp', true, true); _tex.hnrm = ld('vg37_hedge_nrm.webp', false, true); }
  else { _tex.hcol = ld('vg37_hull_col.jpg', true, true); _tex.hnrm = ld('vg37_hull_nrm.jpg', false, true); }
  return _tex;
}
export function vg37LeafMat() {
  if (_leaf) return _leaf;
  const T = tex();
  const m = new THREE.MeshStandardMaterial({ map: T.col, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.68, metalness: 0 });
  m.name = 'vg37:leaf';
  const trans = transChunk();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.vgNrm = { value: T.nrm }; sh.uniforms.vg37K = VG37K;
    sh.uniforms.windT = ENV.windT; sh.uniforms.windAmp = ENV.windAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windT;\nuniform float windAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // the wind: the plant sways from its foot (height squared), each card flutters a little along its normal
        vec2 iw = vec2(0.0);
        #ifdef USE_INSTANCING
          iw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #endif
        float ph = fract(iw.x * 0.137 + iw.y * 0.071) * 6.283;
        float hy = max(position.y, 0.0);
        float sw = sin(windT * 1.3 + ph + iw.x * 0.05) * 0.6 + sin(windT * 2.1 + ph * 1.7) * 0.4;
        // (the sway from the plant's foot only on instanced plants, whose position is the plant's own: the hedges' rim cards are
        // one world-space mesh, where position.y is the ground's elevation, 20-40 m, and the sway went to metres the moment the
        // wind clock ran: a still at windT 0 hid it; session 3, 08:45. Those cards keep the flutter.)
        #ifdef USE_INSTANCING
        transformed.xz += vec2(sw, sw * 0.6) * (0.014 * windAmp * hy * hy);
        #endif
        transformed += objectNormal * (sin(windT * 6.7 + dot(position, vec3(9.1, 7.3, 8.7)) + ph) * 0.006 * windAmp * min(hy, 1.0));
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D vgNrm;\nuniform vec4 vg37K;\n' + TBN)
      // both faces lit alike: the normals are the plant's volume normals; the leaf's relief from the atlas on top
      // the instance's tint colours the flowers (pale, unsaturated texels: the mums, the hydrangea heads), the leaves take its value only
      .replace('#include <color_fragment>', `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  vec3 vgTint = vColor.rgb;   // (three r185: a vec4, the vertex colour times the instance's)
#else
  vec3 vgTint = vec3(1.0);
#endif
  {
    float vgMx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), vgMn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
    float vgFl = smoothstep(0.15, 0.28, vgMx) * (1.0 - smoothstep(0.75, 0.92, (vgMx - vgMn) / max(vgMx, 1e-4)));
    // the leaves take the tint's value; a flower's tint (saturated: burgundy, rust) only a little of it (0.75-1.1)
    float vgTl = dot(vgTint, vec3(0.3, 0.59, 0.11));
    float vgTx = max(vgTint.r, max(vgTint.g, vgTint.b)), vgTs = (vgTx - min(vgTint.r, min(vgTint.g, vgTint.b))) / max(vgTx, 1e-4);
    float vgLk = mix(vgTl, clamp(vgTl * 1.6, 0.75, 1.1), smoothstep(0.2, 0.45, vgTs));
    diffuseColor.rgb *= mix(vec3(vgLk), vgTint, vgFl);
  }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  normal *= faceDirection;
#endif
  vec4 vgN4 = texture2D(vgNrm, vMapUv);
  {
    vec3 mn = vgN4.xyz * 2.0 - 1.0;
    mat3 tb = vg37TBN(normal, - vViewPosition, vMapUv);
    normal = normalize(normal + (tb[0] * mn.x + tb[1] * mn.y) * vg37K.x);
  }`)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.specularColorBlended *= 0.6; material.specularF90 *= 0.45;')
      .replace('#include <lights_fragment_begin>', trans ? 'vec3 vgTr = vec3( 0.0 );\n' + trans + '\nreflectedLight.directDiffuse += vgTr * diffuseColor.rgb * ( vg37K.y * vgN4.a );' : '#include <lights_fragment_begin>');
  };
  m.customProgramCacheKey = () => 'vg37leaf5';
  _leaf = applyLightTrim(applyCityAO(applySnowCap(m, 0.6)), CAL);
  return _leaf;
}
// VG37H: the hedge's face relief-mapped. The textures (tools/ar35/veg/build_vg37h.py): vg37_hedge_col (albedo; A the cavity's
// AO) and vg37_hedge_nrm (tangent normal; A the height: 1 the clipped surface, 0 the dark inside 9 cm in). Per pixel: the
// tangent frame from the uv's screen derivatives (the hull's uv is world metres / 0.5 on every face), a march down the view
// ray through the height field (12-40 steps by the view's angle, the last step interpolated) to the leaf it meets; that
// leaf's albedo, normal and cavity; a short march up toward the sun for the leaves' shadows on the leaves behind them. The
// relief fades out at grazing views and past VG37HK.w metres (plain mapping there: the same leaves, flat). Every lookup
// takes the uv's own gradients (textureGrad), so a texel's mip never jumps with its neighbour's depth.
const HEDGE_GLSL = `
  vec2 vgUv = vMapUv, vgG1 = dFdx(vMapUv), vgG2 = dFdy(vMapUv);
  float vgHit = 1.0, vgSh = 1.0;
  vec3 vgT = vec3(1.0, 0.0, 0.0), vgB = vec3(0.0, 1.0, 0.0), vgNg = normalize(vNormal);
  {
    vec3 p = - vViewPosition;
    vec3 dp1 = dFdx(p), dp2 = dFdy(p);
    vec3 d2p = cross(dp2, vgNg), d1p = cross(vgNg, dp1);
    vec3 t0 = d2p * vgG1.x + d1p * vgG2.x, b0 = d2p * vgG1.y + d1p * vgG2.y;
    float lt = dot(t0, t0), lb = dot(b0, b0);
    if (lt > 1e-24 && lb > 1e-24) { vgT = t0 * inversesqrt(lt); vgB = b0 * inversesqrt(lb); }
    vec3 V = vViewPosition * inversesqrt(max(dot(vViewPosition, vViewPosition), 1e-8));
    vec3 vt = vec3(dot(V, vgT), dot(V, vgB), dot(V, vgNg));
    float dist = length(vViewPosition);
    float S = vg37HK.x * smoothstep(0.05, 0.2, vt.z) * (1.0 - smoothstep(vg37HK.w * 0.6, vg37HK.w, dist));
    // the march never runs more than 0.14 uv (7 cm) sideways: at a grazing view (a hedge's top from eye level) a long sweep
    // stretches every leaf it meets into a streak along the view (b8 vgHedge1 / vgHedge2), so the relief flattens there instead
    S = min(S, 0.14 * max(vt.z, 0.05) / max(length(vt.xy), 1e-3));
    if (S > 1e-4) {
      float ns = floor(mix(40.0, 12.0, clamp(vt.z, 0.0, 1.0)));
      float lay = 1.0 / ns;
      vec2 duv = - vt.xy / max(vt.z, 0.05) * S * lay;
      vec2 uv = vMapUv;
      float ray = 1.0, h = textureGrad(vgHN, uv, vgG1, vgG2).a, ph = h, pr = ray;
      for (int i = 0; i < 40; i++) {
        if (float(i) >= ns || h >= ray) break;
        ph = h; pr = ray;
        uv += duv; ray -= lay;
        h = textureGrad(vgHN, uv, vgG1, vgG2).a;
      }
      float a = h - ray, b = ph - pr;
      float w = clamp(a / max(a - b, 1e-5), 0.0, 1.0);
      vgUv = uv - duv * w;
      vgHit = clamp(ray + lay * w, 0.0, 1.0);
      #if NUM_DIR_LIGHTS > 0
      {
        // the sun (both suns share one direction): up the light's ray from the leaf met; a leaf above that ray shades it
        vec3 L = directionalLights[ 0 ].direction;
        vec3 lt3 = vec3(dot(L, vgT), dot(L, vgB), dot(L, vgNg));
        if (lt3.z > 0.0) {
          vec2 luv = lt3.xy / max(lt3.z, 0.08) * S;
          float occ = 0.0;
          for (int i = 1; i <= 8; i++) {
            float t = float(i) * 0.125 * (1.0 - vgHit);
            float hs = textureGrad(vgHN, vgUv + luv * t, vgG1, vgG2).a;
            occ = max(occ, (hs - (vgHit + t)) * (1.0 - float(i - 1) * 0.1));
          }
          vgSh = 1.0 - clamp(occ * 7.0, 0.0, 1.0) * vg37HK.y;
        } else vgSh = 1.0;
      }
      #endif
    }
  }
  // the footprint's anisotropy (the uv Jacobian's singular values): at a grazing view (a hedge's top from eye level, 6-20 deg)
  // the filtered leaves and their dark gaps average along the view into streaks (b6-b11: the band along the top; dbg12's fine
  // checker streaks the same way there, as correct filtering does), so the leaves' contrast fades toward the face's mean where
  // the footprint is long (vgAn: 0 below 2.5:1, 1 past 7:1); the full anisotropic filtering is kept
  float vgAn = 0.0;
  {
    float A = vgG1.x * vgG1.x + vgG2.x * vgG2.x, B = vgG1.x * vgG1.y + vgG2.x * vgG2.y, Cc = vgG1.y * vgG1.y + vgG2.y * vgG2.y;
    float dt = sqrt(max((A - Cc) * (A - Cc) + 4.0 * B * B, 0.0));
    float l1 = 0.5 * (A + Cc + dt), l2 = max(0.5 * (A + Cc - dt), 1e-24);
    vgAn = smoothstep(2.5, 7.0, sqrt(l1 / l2));
  }
  float vgAo = 1.0;`;
let _hedge = null;
function vg37HedgeMat() {
  if (_hedge) return _hedge;
  const T = tex();
  const m = new THREE.MeshStandardMaterial({ map: T.hcol, vertexColors: true, roughness: 0.55, metalness: 0 });
  m.name = 'vg37:hedge';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.vgHN = { value: T.hnrm }; sh.uniforms.vg37HK = VG37HK;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D vgHN;\nuniform vec4 vg37HK;')
      .replace('#include <map_fragment>', HEDGE_GLSL + `
  {
    vec4 vgC = textureGrad(map, vgUv, vgG1, vgG2);
    // (the face's lit surface leaves: build_vg37h.py surfMean, linear; the AO's surface mean)
    vgC = mix(vgC, vec4(0.034, 0.076, 0.019, 0.82), vgAn * 0.8);
    diffuseColor.rgb *= vgC.rgb;
    vgAo = vgC.a;
  }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  {
    vec3 mn = textureGrad(vgHN, vgUv, vgG1, vgG2).xyz * 2.0 - 1.0;
    mn = normalize(mix(mn, vec3(0.0, 0.0, 1.0), vgAn * 0.75));
    normal = normalize(vgT * mn.x + vgB * mn.y + normal * max(mn.z, 0.05));
  }`)
      // the leaves' gloss under the sky, kept below the sky's full sheen (as the plants' leaves)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.specularColorBlended *= 0.8 * vgAo; material.specularF90 *= 0.5 * vgAo;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  reflectedLight.indirectDiffuse *= vgAo;
  reflectedLight.indirectSpecular *= vgAo * vgAo;`);
    // the sun's light on the leaf met: its shadow from the leaves above it, and less of it down in the cavities
    const lf = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = lf.indexOf('directionalLight = directionalLights[ i ];');
    const re = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    const a1 = a0 >= 0 ? lf.indexOf(re, a0) : -1;
    if (a1 >= 0) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', lf.slice(0, a1) + 'directLight.color *= vgSh * mix(1.0 - vg37HK.z, 1.0, vgAo);\n\t\t' + lf.slice(a1));
  };
  m.customProgramCacheKey = () => 'vg37hedge3';
  _hedge = applyLightTrim(applyCityAO(applySnowCap(m, 0.8)), CAL);
  return _hedge;
}
// the hedge's hull: the tiling clipped face (0.5 m a repeat, world-space uv), its normal map, the depth colour per vertex
export function vg37HullMat() {
  if (VG37H) return vg37HedgeMat();
  if (_hull) return _hull;
  const T = tex();
  const m = new THREE.MeshStandardMaterial({ map: T.hcol, normalMap: T.hnrm, vertexColors: true, roughness: 0.72, metalness: 0 });
  m.normalScale.set(0.9, 0.9);
  m.name = 'vg37:hull';
  m.customProgramCacheKey = () => 'vg37hull1';
  _hull = applyLightTrim(applyCityAO(applySnowCap(m, 0.8)), CAL);
  return _hull;
}

// ---------------------------------------------------------------- geometry builder
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  v(p, n, u, v, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.c.push(c[0], c[1], c[2]); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get tris() { return this.i.length / 3; }
}
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
// a sprig card: the cell's foot (bottom centre) at `foot`, growing along `dir`, `side` across; normals from nrmAt(position)
function sprig(G, foot, dir, side, s, cell, nrmAt, col, uvr = null, aspect = 1) {
  const [u0, v0, u1, v1] = uvr || cellUV(cell);
  const f = V.add(foot, V.mul(dir, -0.03 * s));
  const bl = V.add(f, V.mul(side, -s / 2)), br = V.add(f, V.mul(side, s / 2));
  const tl = V.add(bl, V.mul(dir, s * aspect)), tr = V.add(br, V.mul(dir, s * aspect));
  const a = G.v(bl, nrmAt(bl), u0, v0, col), b = G.v(br, nrmAt(br), u1, v0, col), c = G.v(tr, nrmAt(tr), u1, v1, col), d = G.v(tl, nrmAt(tl), u0, v1, col);
  G.quad(a, b, c, d);
}
// a cushion card centred on `c`, in the plane of t1 / t2 (turned by `rot`), facing n
function cushion(G, c, t1, t2, s, cell, nrmAt, col, rot, uvr = null) {
  const [u0, v0, u1, v1] = uvr || cellUV(cell);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const a1 = V.add(V.mul(t1, cr), V.mul(t2, sr)), a2 = V.add(V.mul(t1, -sr), V.mul(t2, cr));
  const P = (x, y) => V.add(c, V.add(V.mul(a1, x * s / 2), V.mul(a2, y * s / 2)));
  const p0 = P(-1, -1), p1 = P(1, -1), p2 = P(1, 1), p3 = P(-1, 1);
  const a = G.v(p0, nrmAt(p0), u0, v0, col), b = G.v(p1, nrmAt(p1), u1, v0, col), cc = G.v(p2, nrmAt(p2), u1, v1, col), d = G.v(p3, nrmAt(p3), u0, v1, col);
  G.quad(a, b, cc, d);
}
// a stem: a thin four-sided prism from a to b, the stem swatch's colour
function stem(G, a, b, r0, r1, col) {
  const d = V.norm(V.sub(b, a));
  const s1 = V.norm(V.cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), s2 = V.cross(d, s1);
  const ring = [];
  for (let k = 0; k < 4; k++) {
    const an = (k / 4) * Math.PI * 2, o = V.add(V.mul(s1, Math.cos(an)), V.mul(s2, Math.sin(an)));
    ring.push([G.v(V.add(a, V.mul(o, r0)), o, STEM_UV[0], STEM_UV[1], col), G.v(V.add(b, V.mul(o, r1)), o, STEM_UV[0], STEM_UV[1], col)]);
  }
  for (let k = 0; k < 4; k++) { const q = ring[k], w = ring[(k + 1) % 4]; G.quad(q[0], w[0], w[1], q[1]); }
}
const perp = (d) => V.norm(V.cross(d, Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]));
const turn = (v, axis, a) => {   // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), k = V.norm(axis);
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
};

// ---------------------------------------------------------------- the forms
// spec: { H, W, cells: [[cell, weight]], n0, card: [min, max] (m), shell, up (0..1: how far the sprigs turn up), stems,
//         heads: { cell, n, card } (flower heads on the outer shell), ball (clipped: cushion cards on the surface), tuft, rosette, tint }
function pickCell(cells, r) { let t = 0; for (const [c, w] of cells) { t += w; if (r <= t) return c; } return cells[cells.length - 1][0]; }
function moundForm(S, seed, lod) {
  const rnd = mulberry(seed * 7 + lod);
  const G = new Geo();
  const R = [S.W / 2, S.H * (S.yK ?? 0.56), S.W / 2], C = [0, S.H - R[1], 0];
  const env = (p) => V.norm([(p[0] - C[0]) / (R[0] * R[0]), (p[1] - C[1]) / (R[1] * R[1]), (p[2] - C[2]) / (R[2] * R[2])]);
  const nrmAt = (p) => { const n = env(p); return V.norm([n[0], n[1] + 0.25, n[2]]); };
  const cw = S.cells.reduce((a, q) => a + q[1], 0);
  const n = lod ? Math.round(S.n0 * 0.25) : S.n0, sk = lod ? 1.8 : 1.0;
  for (let k = 0; k < n; k++) {
    // a point in the envelope, the outer shell preferred; the foot never under the ground
    let p, f, tries = 0;
    do {
      const th = rnd() * Math.PI * 2, ph = Math.asin(clamp(-0.35 + 1.35 * rnd(), -1, 1));
      f = 1 - (1 - S.shell) * Math.pow(rnd(), 1.6);
      p = [C[0] + R[0] * f * Math.cos(ph) * Math.cos(th), C[1] + R[1] * f * Math.sin(ph), C[2] + R[2] * f * Math.cos(ph) * Math.sin(th)];
    } while (p[1] < 0.04 * S.H && ++tries < 8);
    if (p[1] < 0.02) p[1] = 0.02;
    const out = env(p);
    // the sprig points outward and up, with a random spread
    let dir = V.norm(V.add(V.mul(out, 1.0), [0, S.up, 0]));
    dir = V.norm(V.add(dir, [(rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.7]));
    const side = turn(perp(dir), dir, rnd() * Math.PI);
    const s = (S.card[0] + (S.card[1] - S.card[0]) * rnd()) * sk;
    const cell = pickCell(S.cells, rnd() * cw);
    // the depth in the plant darkens it: the inside, the foot
    const ao = clamp(0.32 + 0.68 * Math.pow(f, 2.2), 0.25, 1) * (0.62 + 0.38 * clamp(p[1] / S.H, 0, 1));
    const tj = 0.9 + 0.2 * rnd();
    const col = [ao * tj * (S.tint ? S.tint[0] : 1), ao * tj * (S.tint ? S.tint[1] : 1), ao * tj * (S.tint ? S.tint[2] : 1)];
    // the card's foot sinks into the plant by a third of its size, so the plant reads solid
    const foot = V.add(p, V.mul(dir, -s * 0.33));
    sprig(G, foot, dir, side, s, cell, nrmAt, col);
  }
  if (S.heads) {
    const hn = lod ? Math.max(2, Math.round(S.heads.n * 0.5)) : S.heads.n;
    for (let k = 0; k < hn; k++) {
      const th = rnd() * Math.PI * 2, ph = 0.15 + 1.2 * rnd();
      const p = [C[0] + R[0] * 0.92 * Math.cos(ph) * Math.cos(th), C[1] + R[1] * 0.92 * Math.sin(ph), C[2] + R[2] * 0.92 * Math.cos(ph) * Math.sin(th)];
      const out = env(p), s = S.heads.card * (0.8 + 0.4 * rnd());
      const t1 = perp(out), t2 = V.cross(out, t1);
      const col = [1, 1, 1].map(() => 0.85 + 0.15 * rnd());
      cushion(G, V.add(p, V.mul(out, s * 0.15)), t1, t2, s, S.heads.cell, () => V.norm(V.add(out, [0, 0.4, 0])), col, rnd() * 6.28);
      // the head's back, so it is round from the side
      cushion(G, V.add(p, V.mul(out, -s * 0.05)), t1, V.norm(V.add(t2, V.mul(out, 0.8))), s * 0.9, S.heads.cell, () => V.norm(V.add(out, [0, 0.4, 0])), col.map((v) => v * 0.8), rnd() * 6.28);
    }
  }
  if (S.ball) {
    // clipped: cushion cards over the surface
    const nb = lod ? Math.max(4, Math.round(S.ball * 0.3)) : S.ball;
    for (let k = 0; k < nb; k++) {
      const th = rnd() * Math.PI * 2, ph = Math.asin(clamp(-0.25 + 1.25 * rnd(), -1, 1));
      const p = [C[0] + R[0] * Math.cos(ph) * Math.cos(th), C[1] + R[1] * Math.sin(ph), C[2] + R[2] * Math.cos(ph) * Math.sin(th)];
      if (p[1] < 0.03) continue;
      const out = env(p), t1 = perp(out), t2 = V.cross(out, t1);
      const ao = 0.6 + 0.4 * clamp(p[1] / S.H, 0, 1);
      cushion(G, V.add(p, V.mul(out, 0.01)), t1, t2, S.ballCard || S.card[1] * 1.2, S.ballCell ?? CELL.boxCushion, () => V.norm(V.add(out, [0, 0.2, 0])), [ao, ao, ao], rnd() * 6.28);
    }
  }
  if (S.stems && !lod) {
    for (let k = 0; k < S.stems; k++) {
      const a = [(rnd() - 0.5) * 0.15 * S.W, 0, (rnd() - 0.5) * 0.15 * S.W];
      const th = rnd() * Math.PI * 2, rr = (0.2 + 0.35 * rnd()) * S.W;
      const b = [Math.cos(th) * rr * 0.6, S.H * (0.45 + 0.35 * rnd()), Math.sin(th) * rr * 0.6];
      stem(G, V.add(a, [0, -0.05, 0]), b, 0.012 + 0.012 * rnd() * S.H / 3, 0.006, [0.55, 0.5, 0.45]);
    }
  }
  return G;
}
function tuftForm(S, seed, lod) {
  const rnd = mulberry(seed * 11 + lod);
  const G = new Geo();
  const n = lod ? Math.max(3, Math.round(S.n0 * 0.4)) : S.n0;
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2 + rnd() * 0.6, tilt = S.tilt[0] + (S.tilt[1] - S.tilt[0]) * rnd();
    const dir = V.norm([Math.cos(th) * Math.sin(tilt), Math.cos(tilt), Math.sin(th) * Math.sin(tilt)]);
    // half the cards face round the tuft, half across it, so it reads from every side
    const side = k % 2 ? V.norm([-Math.sin(th), 0, Math.cos(th)]) : V.norm(V.cross(dir, [-Math.sin(th), 0, Math.cos(th)]));
    const s = S.H * (0.85 + 0.3 * rnd()) * (lod ? 1.1 : 1.0);
    const foot = [Math.cos(th) * S.W * 0.06 * rnd(), -0.02, Math.sin(th) * S.W * 0.06 * rnd()];
    const ao = 0.85 + 0.15 * rnd();
    const nrmAt = (p) => V.norm([p[0] * 0.8, 0.9, p[2] * 0.8]);
    sprig(G, foot, dir, side, s, S.cell, nrmAt, [ao, ao, ao]);
  }
  return G;
}
function rosetteForm(S, seed, lod) {
  const rnd = mulberry(seed * 13 + lod);
  const G = new Geo();
  const n = lod ? 1 : S.n0;
  for (let k = 0; k < n; k++) {
    const s = S.W * (0.8 + 0.3 * rnd()), y = 0.012 + 0.02 * k;
    const t1 = V.norm([Math.cos(k * 1.7), 0.08 * (rnd() - 0.5), Math.sin(k * 1.7)]), t2 = V.norm(V.cross([0, 1, 0], t1));
    cushion(G, [0, y, 0], t1, V.mul(t2, -1), s, S.cell, () => [0, 1, 0], [0.9, 0.9, 0.9], rnd() * 6.28);
  }
  return G;
}
// FLOWERING PERENNIALS in 3D (session 3: the mums were flat shoot cards at 1-2 m): a dome of leafy shoot cards (a cell's
// leafy part), and over its upper half the flower heads as cards of their own, each facing out of the dome a little proud
// of the leaves, sized as the real heads (a Korean mum's single daisy 4-6 cm, a pompon 3-5 cm, an aster 2.5 cm, a sedum's
// flat head 10-14 cm); a pompon's head is two crossed cards (round from the side); an anemone holds its heads on wiry stalks
// over its leaves. The heads take the plant's tint (world/vg37.js's leaf material: pale florets), the leaves its value.
// cell 15's right half: the drawn heads (build_vg37.py flower_heads): the single daisy (top), the pompon (bottom)
const UV_DAISY = [0.875, 0.125, 1.0, 0.25], UV_POMPON = [0.875, 0.0, 1.0, 0.125];
const lowerPart = (cell, k) => { const [u0, v0, u1, v1] = cellUV(cell); return [u0, v0, u1, v0 + (v1 - v0) * k]; };
function perennialForm(S, seed, lod) {
  const rnd = mulberry(seed * 17 + lod);
  const G = new Geo();
  const R = [S.W / 2, S.H * (S.yK ?? 0.8), S.W / 2], C = [0, S.H - R[1], 0];
  const env = (p) => V.norm([(p[0] - C[0]) / (R[0] * R[0]), (p[1] - C[1]) / (R[1] * R[1]), (p[2] - C[2]) / (R[2] * R[2])]);
  const nrmAt = (p) => { const n = env(p); return V.norm([n[0], n[1] + 0.3, n[2]]); };
  const leafUV = S.leafUV || lowerPart(CELL.mums, 0.58), asp = S.leafAsp ?? 0.58;
  const nl = lod ? Math.max(6, Math.round(S.leaf * 0.3)) : S.leaf, sk = lod ? 1.6 : 1;
  for (let k = 0; k < nl; k++) {
    const lo = S.lo ?? -0.2, th = rnd() * Math.PI * 2, ph = Math.asin(clamp(lo + (1 - lo) * rnd(), -1, 1)), f = 0.6 + 0.4 * rnd();
    const p = [C[0] + R[0] * f * Math.cos(ph) * Math.cos(th), Math.max(0.02, C[1] + R[1] * f * Math.sin(ph)), C[2] + R[2] * f * Math.cos(ph) * Math.sin(th)];
    let dir = V.norm(V.add(env(p), [0, 0.7, 0]));
    dir = V.norm(V.add(dir, [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6]));
    const s = (S.card[0] + (S.card[1] - S.card[0]) * rnd()) * sk;
    const ao = clamp(0.4 + 0.6 * Math.pow(f, 2), 0.3, 1) * (0.7 + 0.3 * clamp(p[1] / S.H, 0, 1));
    sprig(G, V.add(p, V.mul(dir, -s * asp * 0.4)), dir, turn(perp(dir), dir, rnd() * Math.PI), s, 0, nrmAt, [ao, ao, ao], leafUV, asp);
  }
  const nh = lod ? Math.max(4, Math.round(S.heads * 0.3)) : S.heads, hk = lod ? 1.5 : 1;
  for (let k = 0; k < nh; k++) {
    const th = rnd() * Math.PI * 2, ph = (S.flat ? 0.75 : 0.12) + (Math.PI / 2 - (S.flat ? 0.75 : 0.12)) * Math.sqrt(rnd());
    const fr = 1 - (S.sink || 0) * rnd();   // some heads among the leaves, not all on the dome's skin
    let p = [C[0] + R[0] * fr * Math.cos(ph) * Math.cos(th), C[1] + R[1] * fr * Math.sin(ph), C[2] + R[2] * fr * Math.cos(ph) * Math.sin(th)];
    let out = env(p);
    if (S.stalk) {
      // an anemone's head on a wiry stalk over the leaves
      const top = [p[0] * 1.2, S.H + S.stalk * (0.5 + 0.5 * rnd()), p[2] * 1.2];
      if (!lod) stem(G, [p[0] * 0.5, p[1] * 0.6, p[2] * 0.5], top, 0.003, 0.002, [0.42, 0.45, 0.3]);
      p = top; out = V.norm([p[0], 1.6, p[2]]);
    }
    const s = S.head * (0.7 + 0.6 * rnd()) * hk;
    const fn = V.norm(V.add(out, [(rnd() - 0.5) * 0.9, S.flat ? 1.5 : 0.3, (rnd() - 0.5) * 0.9]));
    const t1 = perp(fn), t2 = V.cross(fn, t1);
    // (b11: every head one flat bright disc at 2 m) the heads low on the dome and those sunk among the leaves darker
    const v = (0.55 + 0.45 * clamp(p[1] / S.H, 0, 1)) * (1 - 2.5 * (1 - fr)) * (0.85 + 0.15 * rnd());
    const c = V.add(p, V.mul(out, s * (S.cross ? 0.25 : 0.12)));
    cushion(G, c, t1, t2, s, 0, () => fn, [v, v, v], rnd() * 6.28, S.headUV);
    if (S.cross) cushion(G, c, t1, V.norm(V.add(t2, V.mul(fn, 1.6))), s * 0.95, 0, () => fn, [v * 0.9, v * 0.9, v * 0.9], rnd() * 6.28, S.headUV);
  }
  return G;
}
const SPECS = {
  rhodo: { kind: 'mound', H: 1.5, W: 1.8, cells: [[CELL.rhodo, 1]], n0: 260, card: [0.38, 0.52], shell: 0.6, up: 0.5, stems: 5, tint: [0.95, 1, 0.95] },
  hydrangea: { kind: 'mound', H: 1.1, W: 1.3, cells: [[CELL.hydLeaf, 1]], n0: 170, card: [0.36, 0.5], shell: 0.5, up: 0.6, stems: 6, heads: { cell: CELL.hydHead, n: 16, card: 0.24 } },
  privet: { kind: 'mound', H: 1.6, W: 1.4, cells: [[CELL.privet, 1]], n0: 380, card: [0.26, 0.34], shell: 0.55, up: 0.7, stems: 6 },
  yew: { kind: 'mound', H: 1.0, W: 1.8, yK: 0.75, cells: [[CELL.yewA, 1], [CELL.yewB, 1]], n0: 300, card: [0.28, 0.36], shell: 0.6, up: 0.35, stems: 4 },
  boxball: { kind: 'mound', H: 0.75, W: 0.85, cells: [[CELL.boxSprig, 1]], n0: 90, card: [0.13, 0.17], shell: 0.85, up: 0.3, ball: 120 },
  // chrysanthemums: a dome of flowering shoots (the cell's flowers in its upper half), 0.45 x 0.55 m
  mums: { kind: 'mound', H: 0.45, W: 0.55, yK: 0.85, cells: [[CELL.mums, 1]], n0: 34, card: [0.27, 0.35], shell: 0.6, up: 1.5 },
  // the woodland understorey (viburnum, spicebush, witch hazel): 3.2 x 3.4 m at scale 1, as cpFloraKit's SHRUB_H / SHRUB_W
  underA: { kind: 'mound', H: 3.2, W: 3.4, cells: [[CELL.underA, 3], [CELL.underB, 1]], n0: 700, card: [0.45, 0.62], shell: 0.45, up: 0.45, stems: 8 },
  underB: { kind: 'mound', H: 3.2, W: 3.4, yK: 0.5, cells: [[CELL.underB, 3], [CELL.privet, 1]], n0: 700, card: [0.45, 0.6], shell: 0.45, up: 0.3, stems: 9 },
  underC: { kind: 'mound', H: 3.2, W: 3.4, yK: 0.62, cells: [[CELL.underA, 1], [CELL.rhodo, 1]], n0: 650, card: [0.45, 0.62], shell: 0.5, up: 0.4, stems: 7 },
  // the woodland's ground cover (cpFlora.js's drifts, 0.4 x 1.1 m at scale 1, as cpFloraKit's GC_H / GC_W): English ivy mats and sedge
  ivyMat: { kind: 'mound', H: 0.3, W: 1.1, yK: 0.95, cells: [[CELL.ivy, 1]], n0: 46, card: [0.34, 0.44], shell: 0.7, up: -0.25 },
  sedge: { kind: 'tuft', H: 0.38, W: 0.5, cell: CELL.liriope, n0: 9, tilt: [0.25, 0.75] },
  fountain: { kind: 'tuft', H: 1.0, W: 0.9, cell: CELL.fountain, n0: 12, tilt: [0.1, 0.55] },
  liriope: { kind: 'tuft', H: 0.42, W: 0.45, cell: CELL.liriope, n0: 8, tilt: [0.15, 0.6] },
  dandelion: { kind: 'rosette', H: 0.05, W: 0.28, cell: CELL.dandelion, n0: 1 },
  // October perennials (session 3), 3D heads: Korean mums (single daisies), pompon and decorative mums, asters, sedum, anemones
  mumS: { kind: 'perennial', H: 0.42, W: 0.55, yK: 0.8, leaf: 48, card: [0.15, 0.21], heads: 150, head: 0.042, headUV: UV_DAISY, sink: 0.08 },
  mumP: { kind: 'perennial', H: 0.38, W: 0.5, yK: 0.85, leaf: 46, card: [0.14, 0.2], heads: 150, head: 0.036, headUV: UV_POMPON, cross: true, sink: 0.08 },
  mumD: { kind: 'perennial', H: 0.5, W: 0.58, yK: 0.8, leaf: 50, card: [0.16, 0.22], heads: 70, head: 0.062, headUV: UV_POMPON, cross: true, sink: 0.06 },
  aster: { kind: 'perennial', H: 0.8, W: 0.7, yK: 0.62, lo: -0.6, leafUV: lowerPart(CELL.privet, 1), leafAsp: 1, leaf: 46, card: [0.2, 0.28], heads: 150, head: 0.028, headUV: UV_DAISY },
  sedum: { kind: 'perennial', H: 0.5, W: 0.5, yK: 0.75, leafUV: lowerPart(CELL.rhodo, 1), leafAsp: 1, leaf: 40, card: [0.12, 0.18], heads: 9, head: 0.12, headUV: cellUV(CELL.hydHead), flat: true },
  anemone: { kind: 'perennial', H: 0.45, W: 0.6, yK: 0.7, leafUV: lowerPart(CELL.hydLeaf, 1), leafAsp: 1, leaf: 28, card: [0.2, 0.28], heads: 14, head: 0.065, headUV: UV_DAISY, stalk: 0.45 },
};
const _forms = new Map();
export function vg37Form(name) {
  let f = _forms.get(name);
  if (f) return f;
  const S = SPECS[name];
  const mk = S.kind === 'tuft' ? tuftForm : S.kind === 'rosette' ? rosetteForm : S.kind === 'perennial' ? perennialForm : moundForm;
  const seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0xffff;
  const g0 = mk(S, seed, 0), g1 = mk(S, seed, 1);
  f = { lod0: g0.build(), lod1: g1.build(), tris0: g0.tris, tris1: g1.tris, H: S.H, W: S.W };
  _forms.set(name, f);
  return f;
}
// cpFlora.js's woodland ground cover: two ivy mats and a sedge (cpFloraKit groundForms' slots)
export function vg37CoverForms() {
  return ['ivyMat', 'sedge', 'ivyMat'].map((k) => { const f = vg37Form(k); return { trunk: null, leaves0: f.lod0, leaves1: f.lod1, stats: { leaves0: f.tris0, leaves1: f.tris1 } }; });
}
// cpFlora.js's woodland understorey takes these three forms in place of cpFloraKit's shrubForms (same base size)
export function vg37UnderForms() {
  return ['underA', 'underB', 'underC'].map((k) => { const f = vg37Form(k); return { trunk: null, leaves0: f.lod0, leaves1: f.lod1, stats: { leaves0: f.tris0, leaves1: f.tris1 } }; });
}

// ---------------------------------------------------------------- hedges
const HEDGE_H = { italian: 1.5, french: 1.0, conservatory: 1.2, '': 1.1 };
function ringArea(R) { let a = 0; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function inPoly(R, x, z) {
  let c = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const [xi, zi] = R[i], [xj, zj] = R[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function subdivide(R, step, closed = true) {
  const out = [];
  const n = closed ? R.length : R.length - 1;
  for (let i = 0; i < n; i++) {
    const p = R[i], q = R[(i + 1) % R.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k]);
  }
  if (!closed) out.push(R[R.length - 1]);
  return out;
}
// a line hedge's footprint: the polyline offset both ways (mitred, clamped)
function lineRing(P, w) {
  const L = [], Rr = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    L.push([P[i][0] - dz * w / 2, P[i][1] + dx * w / 2]); Rr.push([P[i][0] + dz * w / 2, P[i][1] - dx * w / 2]);
  }
  return L.concat(Rr.reverse());
}
// one hedge: the hull and its cards, in world coordinates (y from gy)
function hedgeInto(H, C, ring, h, gy, rnd, tint) {
  // (VG37H: 0.15 m steps, so the clipped top's lumps of shoots (topW) shape the silhouette itself)
  let R = subdivide(ring, VG37H ? 0.15 : 0.9);
  if (ringArea(R) < 0) R = R.reverse();   // counter-clockwise in (x, z): the outward normal of edge (p -> q) is (dz, -dx)
  const n = R.length;
  if (n < 3) return;
  const rr = 0.14;
  const nrm = R.map((p, i) => {
    const a = R[(i - 1 + n) % n], b = R[(i + 1) % n];
    const e1 = V.norm([p[0] - a[0], 0, p[1] - a[1]]), e2 = V.norm([b[0] - p[0], 0, b[1] - p[1]]);
    const n1 = [e1[2], 0, -e1[0]], n2 = [e2[2], 0, -e2[0]];
    let m = V.add(n1, n2); const ml = Math.hypot(m[0], m[2]);
    if (ml < 1e-3) m = n1; else m = [m[0] / ml, 0, m[2] / ml];
    const k = Math.min(2, 1 / Math.max(0.5, V.dot(m, n1)));
    return [m, k];
  });
  // the ground under the hedge; the clipped top follows it along the hedge but is LEVEL across it: each ring vertex's top
  // stands h over the highest ground within 1.5 m (session 3: Columbia's line hedge stands on a terrace edge, and a top that
  // followed the ground on both sides rose ~1 m across 0.6 m, a near-vertical ramp carrying the top's plan uv: the band of
  // vertical streaks of b6-b10, dbg12's fine checker in stripes there); the low side shows a taller face, as a real one does
  const ys = R.map((p) => gy(p[0], p[1]));
  if (ys.some((y) => y === null || !isFinite(y))) return;
  // (a 1.5 m grid of the ring's vertices: with the ring at 0.15 m steps a scan of every pair took the Conservatory tile to ~500 ms)
  const grid = new Map(), gk = (x, z) => Math.floor(x / 1.5) * 73856093 ^ Math.floor(z / 1.5) * 19349663;
  R.forEach((q, j) => { const k = gk(q[0], q[1]); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(j); });
  const ty = R.map((p) => {
    let m = -1e9;
    const cx = Math.floor(p[0] / 1.5), cz = Math.floor(p[1] / 1.5);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get((cx + a) * 73856093 ^ (cz + b) * 19349663);
      if (l) for (const j of l) { const q = R[j]; if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < 2.25) m = Math.max(m, ys[j]); }
    }
    return m + h;
  });
  const top = R.map((p, i) => [p[0] - nrm[i][0][0] * rr * nrm[i][1], p[1] - nrm[i][0][2] * rr * nrm[i][1]]);
  const base = H.p.length / 3;
  let acc = 0;
  // a clipped hedge is never a ruled solid: its faces bulge and dip (a few cm), its top rises and falls with the last cut
  const wob = (x, z) => 0.04 * Math.sin(x * 1.7 + z * 1.1) + 0.03 * Math.sin(x * 4.3 - z * 3.7) + 0.015 * Math.sin(x * 9.1 + z * 7.3);
  // (VG37H: plus the lumps of this year's shoots over the last cut, 20-30 cm across and up to ~3 cm proud: the top's silhouette
  // from the hull itself; the rim cards of b8-b13 read as feathers, stars, slivers or fins at 1-3 m)
  const topW = VG37H
    ? (x, z) => 0.045 * Math.sin(x * 0.9 - z * 1.3) + 0.025 * Math.sin(x * 3.1 + z * 2.3) + 0.03 * Math.max(0, Math.sin(x * 11.0 + Math.sin(z * 7.0) * 2.0) * Math.sin(z * 12.0 + Math.sin(x * 8.0) * 2.0))
    : (x, z) => 0.045 * Math.sin(x * 0.9 - z * 1.3) + 0.025 * Math.sin(x * 3.1 + z * 2.3);
  // (VG37H: the relief's AO and self-shadow darken the face, so the vertex colour carries the tint and the bare, shaded foot only)
  const kFoot = VG37H ? 0.45 : 0.26, kMid = VG37H ? 1.0 : 0.6, kTop = VG37H ? 1.0 : 0.51;
  for (let i = 0; i <= n; i++) {
    const k = i % n, p = R[k], y = ys[k], [m] = nrm[k];
    if (i > 0) acc += Math.hypot(p[0] - R[i - 1][0], p[1] - R[i - 1][1]);
    const w = wob(p[0], p[1]);
    const u = acc / 0.5, foot = tint.map((q) => q * kFoot), mid = tint.map((q) => q * kMid);
    const tw = topW(p[0], p[1]);
    const hk = ty[k] - y;   // the face's height here (h, or more on the low side of a slope)
    H.v([p[0] + m[0] * w, y - 0.08, p[1] + m[2] * w], m, u, 0, foot);
    H.v([p[0] + m[0] * w, y + hk - rr + tw, p[1] + m[2] * w], m, u, (hk - rr + 0.08) / 0.5, mid);
    H.v([top[k][0], y + hk + tw, top[k][1]], V.norm([m[0], 1.2, m[2]]), u, (hk + 0.08) / 0.5, tint.map((q) => q * kTop));
  }
  for (let i = 0; i < n; i++) {
    const a = base + i * 3, b = base + (i + 1) * 3;
    H.quad(a, a + 1, b + 1, b);
    H.quad(a + 1, a + 2, b + 2, b + 1);
  }
  // the top: the inset ring triangulated (three's ear clipping), uv in world metres / 0.5
  const t0 = H.p.length / 3;
  for (let i = 0; i < n; i++) H.v([top[i][0], ty[i] + topW(R[i][0], R[i][1]), top[i][1]], [0, 1, 0], top[i][0] / 0.5, top[i][1] / 0.5, tint.map((q) => q * (VG37H ? 1.0 : 0.55)));
  const tri = THREE.ShapeUtils.triangulateShape(top.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const [a, b, c] of tri) {
    const A = top[a], B = top[b], Cc = top[c];
    const up = (B[1] - A[1]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[1] - A[1]);   // the y of (B - A) x (C - A)
    if (up >= 0) H.i.push(t0 + a, t0 + b, t0 + c); else H.i.push(t0 + a, t0 + c, t0 + b);
  }
  if (VG37H) {
    // (session 3) no cards on the relief hedge: rim cards read as pale feathers, flat stars, slivers or dark fins at 1-3 m (b8-b13)
    // and the top's shoot tips as dark blobs on a lamp-lit top (n13); the relief carries the face, the lumpy top (topW) the silhouette
    return;
  }
  // the cards: short sprigs out of the walls (their feet in the hull, so the face reads as leaves on leaves, not pads), a denser
  // stand of them over the top (a clipped top is a mat of shoot tips: flat pads read as discs, the hull's own top as streaks at a
  // grazing view), a fuzz of longer unclipped shoots at the top edge
  const sp = (x, y, z, dir, s, col, nrm) => sprig(C, [x, y, z], dir, turn(perp(dir), dir, rnd() * 3.14), s, CELL.boxSprig, () => nrm, col);
  for (let i = 0; i < n; i++) {
    const p = R[i], q = R[(i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const e = V.norm([q[0] - p[0], 0, q[1] - p[1]]), out = [e[2], 0, -e[0]];
    // (the fuzz at 9 a metre, upright, read as a band of streaks along the far top edge: b2 / b3 vgColHedge)
    const nWall = Math.round(len * (h - rr) * 44), nFuzz = Math.round(len * 3.5);
    for (let k = 0; k < nWall; k++) {
      const t = rnd(), v = rnd();
      const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t, yb = ys[i] + (ys[(i + 1) % n] - ys[i]) * t;
      const y = yb + 0.02 + v * (h - rr - 0.02);
      const w = wob(x, z) - 0.03 - 0.02 * rnd();
      const ao = (0.3 + 0.3 * clamp((y - yb) / 0.6, 0, 1)) * (0.8 + 0.2 * rnd());
      const dir = V.norm([out[0] * (0.55 + 0.4 * rnd()) + (rnd() - 0.5) * 0.5 * e[0], 0.45 + 0.6 * rnd(), out[2] * (0.55 + 0.4 * rnd()) + (rnd() - 0.5) * 0.5 * e[2]]);
      sp(x + out[0] * w, y, z + out[2] * w, dir, 0.15 + 0.09 * rnd(), [ao * tint[0], ao * tint[1], ao * tint[2]], V.norm([out[0], 0.35, out[2]]));
    }
    for (let k = 0; k < nFuzz; k++) {
      const t = rnd();
      const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t, yb = ty[i] + (ty[(i + 1) % n] - ty[i]) * t - h;
      const y = yb + h - rr * (0.3 + 1.2 * rnd());
      let dir = V.norm([out[0] * (0.6 + 0.8 * rnd()), 0.5 + 0.6 * rnd(), out[2] * (0.6 + 0.8 * rnd())]);
      dir = V.norm(V.add(dir, [(rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4]));
      const ao = 0.55 + 0.12 * rnd();
      sp(x - out[0] * 0.03, y, z - out[2] * 0.03, dir, 0.15 + 0.09 * rnd(), [ao * tint[0], ao * tint[1], ao * tint[2]], V.norm([out[0], 0.8, out[2]]));
    }
  }
  // the top's shoot tips (rejection-sampled in the inset ring)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of top) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const area = Math.abs(ringArea(top)), nTop = Math.round(area * 90);
  let placed = 0;
  for (let k = 0; k < nTop * 4 && placed < nTop; k++) {
    const x = x0 + (x1 - x0) * rnd(), z = z0 + (z1 - z0) * rnd();
    if (!inPoly(top, x, z)) continue;
    let best = 1e9, yt = null;
    for (let j = 0; j < n; j++) { const d = (R[j][0] - x) ** 2 + (R[j][1] - z) ** 2; if (d < best) { best = d; yt = ty[j]; } }
    if (yt === null) continue;
    const y = yt - h;
    placed++;
    // tilted 40-70 deg: a clipped top seen from above shows its shoots' faces (upright ones read edge-on, a smooth slab)
    const dir = V.norm([(rnd() - 0.5) * 1.8, 0.75, (rnd() - 0.5) * 1.8]);
    const ao = 0.42 + 0.16 * rnd();   // (b5: at 0.66-0.84 they read as pale feathers on the darker hull at 1-2 m)
    sp(x, y + h - 0.06 + topW(x, z), z, dir, 0.14 + 0.08 * rnd(), [ao * tint[0], ao * tint[1], ao * tint[2]], V.norm([dir[0] * 0.3, 1, dir[2] * 0.3]));
  }
}

// ---------------------------------------------------------------- beds
// the soil: the outline (subdivided) triangulated, 5 cm over the ground, mulched (vg36Pits.js's chips: aK 0.4)
function bedSoil(S, ring, gy) {
  let R = subdivide(ring, 1.2);
  if (ringArea(R) < 0) R = R.reverse();
  const ys = R.map((p) => gy(p[0], p[1]));
  if (ys.some((y) => y === null || !isFinite(y))) return false;
  const b = S.p.length / 3;
  const mul = [0.115, 0.075, 0.05];   // the shredded bark's tone (the chip field shades it per pixel)
  R.forEach((p, i) => { S.p.push(p[0], ys[i] + 0.05, p[1]); S.n.push(0, 1, 0); S.c.push(...mul); S.k.push(0.4); });
  const tri = THREE.ShapeUtils.triangulateShape(R.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const [a, bb, c] of tri) S.i.push(b + a, b + c, b + bb);
  // the bed's lip: a 4 cm skirt down to the ground so the soil never floats
  const n = R.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, k0 = S.p.length / 3;
    S.p.push(R[i][0], ys[i] + 0.05, R[i][1], R[j][0], ys[j] + 0.05, R[j][1], R[j][0], ys[j] - 0.06, R[j][1], R[i][0], ys[i] - 0.06, R[i][1]);
    const e = V.norm([R[j][0] - R[i][0], 0, R[j][1] - R[i][1]]);
    for (let q = 0; q < 4; q++) { S.n.push(e[2], 0, -e[0]); S.c.push(...mul.map((v) => v * 0.8)); S.k.push(0.0); }
    S.i.push(k0, k0 + 2, k0 + 1, k0, k0 + 3, k0 + 2);
  }
  return true;
}
// (session 3) the Conservatory Garden's beds stand behind a granite curb (the photographs: a light, dressed stone edge between
// the bed and the paving): 12 cm wide, its top 9 cm over the ground, inside the bed's outline; the city's speckled granite
let _curb = null;
function curbMat() {
  if (_curb) return _curb;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });
  m.name = 'vg37:curb';
  _curb = applyLightTrim(applyCityAO(applyStoneDetail(m, 'cgranite', { amt: 0.6, nrm: 0.6, rgh: 0.35, scale: 0.7 })));
  return _curb;
}
function bedEdge(E, ring, gy, rnd) {
  let R = subdivide(ring, 0.6);
  if (ringArea(R) < 0) R = R.reverse();
  const n = R.length;
  if (n < 3) return;
  const ys = R.map((p) => gy(p[0], p[1]));
  if (ys.some((y) => y === null || !isFinite(y))) return;
  const W = 0.12, top = 0.09;
  const inner = R.map((p, i) => {
    const a = R[(i - 1 + n) % n], b = R[(i + 1) % n];
    const e1 = V.norm([p[0] - a[0], 0, p[1] - a[1]]), e2 = V.norm([b[0] - p[0], 0, b[1] - p[1]]);
    const n1 = [e1[2], 0, -e1[0]], n2 = [e2[2], 0, -e2[0]];
    let m = V.add(n1, n2); const ml = Math.hypot(m[0], m[2]);
    m = ml < 1e-3 ? n1 : [m[0] / ml, 0, m[2] / ml];
    const k = Math.min(2, 1 / Math.max(0.5, V.dot(m, n1)));
    return [[p[0] - m[0] * W * k, p[1] - m[2] * W * k], m];
  });
  const b0 = E.p.length / 3;
  for (let i = 0; i < n; i++) {
    const p = R[i], [q, m] = inner[i], y = ys[i];
    const g = 0.92 + 0.12 * hh(p[0], p[1], 4);
    const col = [0.366 * g, 0.33 * g, 0.27 * g], dk = col.map((v) => v * 0.8);
    E.v([p[0], y - 0.05, p[1]], m, 0, 0, dk);                             // 0 the outer foot
    E.v([p[0], y + top, p[1]], V.norm([m[0], 0.6, m[2]]), 0, 0, col);     // 1 the outer top arris
    E.v([q[0], y + top, q[1]], V.norm([-m[0], 0.6, -m[2]]), 0, 0, col);   // 2 the inner top arris
    E.v([q[0], y + 0.02, q[1]], [-m[0], 0, -m[2]], 0, 0, dk);             // 3 the inner foot, in the bed's soil
  }
  for (let i = 0; i < n; i++) {
    const a = b0 + i * 4, b = b0 + ((i + 1) % n) * 4;
    // (the windings as the hedge's hull: its wall quad (foot_i, top_i, top_i+1, foot_i+1) faces out on a CCW ring)
    E.quad(a, a + 1, b + 1, b);          // the outer face
    E.quad(a + 1, a + 2, b + 2, b + 1);  // the top
    E.quad(a + 3, b + 3, b + 2, a + 2);  // the inner face (toward the bed)
  }
}
// what grows in a bed, by the garden it is in
// bronze, gold, rust, rose, white, burgundy (on the cell's pale peach: the flowers take the tint, the leaves only its value)
const MUM_TINTS = [[1.0, 0.46, 0.14], [1.0, 0.76, 0.16], [0.78, 0.24, 0.12], [0.96, 0.42, 0.52], [1.0, 0.98, 0.9], [0.52, 0.13, 0.16]];
// (session 3) a French-garden bed's cultivars: [tint, form, height]; bronze, gold, rust, rose, white, burgundy, lavender-pink,
// coral, butter yellow; single daisies (mumS), pompons (mumP), decoratives (mumD)
const MT = { bronze: [1.0, 0.46, 0.14], gold: [1.0, 0.76, 0.16], rust: [0.78, 0.24, 0.12], rose: [0.96, 0.42, 0.52], white: [1.0, 0.98, 0.92],
  burgundy: [0.55, 0.13, 0.17], lav: [0.86, 0.56, 0.84], coral: [1.0, 0.52, 0.38], yellow: [1.0, 0.88, 0.32] };
const MUM_PAL = [
  [[MT.rose, 'mumS', 1.0], [MT.white, 'mumP', 0.9], [MT.lav, 'mumS', 1.1]],
  [[MT.bronze, 'mumD', 1.0], [MT.gold, 'mumP', 0.9], [MT.rust, 'mumS', 1.05]],
  [[MT.white, 'mumS', 1.0], [MT.coral, 'mumP', 0.9]],
  [[MT.burgundy, 'mumP', 0.95], [MT.rose, 'mumD', 1.05], [MT.white, 'mumS', 1.0]],
  [[MT.gold, 'mumS', 1.0], [MT.yellow, 'mumD', 1.1], [MT.bronze, 'mumP', 0.9]],
  [[MT.coral, 'mumS', 1.05], [MT.lav, 'mumP', 0.9], [MT.white, 'mumD', 1.0]],
];
const ASTER_TINTS = [[0.62, 0.5, 0.95], [0.72, 0.55, 0.92], [0.85, 0.6, 0.9], [0.55, 0.48, 0.9]];
function bedPlants(bed, ring, add, gy, rnd, clear = null) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const edgeD = (x, z) => { let best = 1e9; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)); } return best; };
  const put = (form, x, z, s, tint) => {
    if (clear && clear(x, z)) return;   // a bench's or a lamp's place in the bed (the caller's furniture)
    const y = gy(x, z); if (y === null) return;
    const k = form === 'fountain' ? 0.72 : 1;   // the grass's blades and plumes a little darker (pale lilac when backlit in b3)
    add(form, { x, y: y + 0.03, z, yaw: rnd() * 6.2832, sx: s, sy: s * (0.9 + 0.2 * rnd()), c: tint || [k * (0.92 + 0.16 * rnd()), k * (0.92 + 0.16 * rnd()), k * (0.9 + 0.12 * rnd())] });
  };
  if (bed.g === 'french') {
    if (!VG37H) {
      // (session 2) the October chrysanthemums: one colour a bed, set close (0.42 m)
      const t = MUM_TINTS[bed.id % MUM_TINTS.length];
      for (let x = x0 + 0.2; x < x1; x += 0.42) for (let z = z0 + 0.2; z < z1; z += 0.42) {
        const px = x + (rnd() - 0.5) * 0.16, pz = z + (rnd() - 0.5) * 0.16;
        if (!inPoly(ring, px, pz) || edgeD(px, pz) < 0.18) continue;
        put('mums', px, pz, 0.85 + 0.3 * rnd(), t.map((v) => v * (0.92 + 0.12 * rnd())));
      }
      return;
    }
    // the October display (session 3, the 2018 photograph): 2-3 cultivars a bed in drifts a few metres long, each its own
    // colour, flower form and height; taller toward the bed's middle; set close (0.4 m), every plant a 3D mum
    const pal = MUM_PAL[bed.id % MUM_PAL.length];
    const ph = hh(bed.id, 1, 9) * 6.28;
    for (let x = x0 + 0.2; x < x1; x += 0.4) for (let z = z0 + 0.2; z < z1; z += 0.4) {
      const px = x + (rnd() - 0.5) * 0.16, pz = z + (rnd() - 0.5) * 0.16;
      if (!inPoly(ring, px, pz)) continue;
      const d = edgeD(px, pz);
      if (d < 0.2) continue;
      const k = 0.5 + 0.5 * Math.sin(px * 0.55 + ph + Math.sin(pz * 0.4 + ph) * 1.6) * Math.cos(pz * 0.5 - ph * 0.7 + Math.sin(px * 0.3) * 1.2);
      const c = pal[Math.min(pal.length - 1, Math.floor(k * pal.length))];
      const mid = clamp((d - 0.2) / 1.4, 0, 1);
      put(c[1], px, pz, c[2] * (0.82 + 0.3 * mid) * (0.9 + 0.2 * rnd()), c[0].map((v) => v * (0.92 + 0.12 * rnd())));
    }
    return;
  }
  // a mixed border: liriope along the edge, then hydrangea / fountain grass / rhododendron / mums by drifts
  const drift = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.23) * 2.0) * Math.sin(z * 0.27 + Math.sin(x * 0.19) * 2.0);
  for (let x = x0 + 0.3; x < x1; x += 0.6) for (let z = z0 + 0.3; z < z1; z += 0.6) {
    const px = x + (rnd() - 0.5) * 0.3, pz = z + (rnd() - 0.5) * 0.3;
    if (!inPoly(ring, px, pz)) continue;
    const d = edgeD(px, pz);
    if (d < 0.2) continue;
    if (d < 0.55) { if (rnd() < 0.8) put('liriope', px, pz, 0.85 + 0.3 * rnd()); continue; }
    const k = drift(px, pz), r = rnd();
    if (bed.g === 'english' && VG37H) {
      // (session 3) a perennial border in October: hydrangea, fountain grass, asters, sedum, mums, Japanese anemones, rhododendron
      if (k < 0.2) { if (r < 0.28) put('hydrangea', px, pz, 0.8 + 0.4 * rnd()); }
      else if (k < 0.36) { if (r < 0.45) put('fountain', px, pz, 0.8 + 0.4 * rnd()); }
      else if (k < 0.5) { if (r < 0.55) put('aster', px, pz, 0.85 + 0.35 * rnd(), ASTER_TINTS[Math.floor(hh(px, pz, 6) * ASTER_TINTS.length)]); }
      else if (k < 0.62) { if (r < 0.65) put('sedum', px, pz, 0.85 + 0.3 * rnd(), [0.78 + 0.1 * rnd(), 0.4 + 0.08 * rnd(), 0.34]); }
      else if (k < 0.76) { if (r < 0.9) { const t = MUM_TINTS[Math.floor(hh(px, pz, 5) * MUM_TINTS.length)]; put(r < 0.45 ? 'mumS' : 'mumP', px, pz, 0.9 + 0.3 * rnd(), t); } }
      else if (k < 0.88) { if (r < 0.5) put('anemone', px, pz, 0.9 + 0.3 * rnd(), r < 0.25 ? [1.0, 0.98, 0.95] : [0.95, 0.62, 0.72]); }
      else if (r < 0.16) put('rhodo', px, pz, 0.7 + 0.4 * rnd());
    } else if (bed.g === 'english') {
      if (k < 0.3) { if (r < 0.28) put('hydrangea', px, pz, 0.8 + 0.4 * rnd()); }
      else if (k < 0.55) { if (r < 0.45) put('fountain', px, pz, 0.8 + 0.4 * rnd()); }
      else if (k < 0.75) { if (r < 0.9) put('mums', px, pz, 0.9 + 0.3 * rnd(), MUM_TINTS[Math.floor(hh(px, pz, 5) * MUM_TINTS.length)]); }
      else if (r < 0.16) put('rhodo', px, pz, 0.7 + 0.4 * rnd());
    } else {
      if (k < 0.35) { if (r < 0.16) put('rhodo', px, pz, 0.7 + 0.4 * rnd()); }
      else if (k < 0.55) { if (r < 0.24) put('hydrangea', px, pz, 0.8 + 0.4 * rnd()); }
      else if (k < 0.75) { if (r < 0.4) put('fountain', px, pz, 0.8 + 0.3 * rnd()); }
      else if (r < 0.2) put('boxball', px, pz, 0.8 + 0.4 * rnd());
    }
  }
}

// ---------------------------------------------------------------- per tile
const ring10 = (p) => { const R = []; for (let i = 0; i + 1 < p.length; i += 2) R.push([p[i] / 10, p[i + 1] / 10]); return R; };
const bbox = (R) => R.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
const FEATS = (() => {
  const L = [];
  for (const h of VG37_HEDGES) { const R = ring10(h.p); L.push({ kind: 'hedge', f: h, R, b: bbox(R) }); }
  for (const b of VG37_BEDS) { const R = ring10(b.p); L.push({ kind: 'bed', f: b, R, b: bbox(R) }); }
  for (const s of VG37_SCRUB) { const R = ring10(s.p); L.push({ kind: 'scrub', f: s, R, b: bbox(R) }); }
  return L;
})();
// a keep-out for walkers and props (the crowd's graph does not know the beds and hedges: walkers crossed the English garden's
// beds in b3 / b3off): true where (x, z) is inside a mapped hedge or planted bed, within `pad` metres
export function vg37Blocked(x, z, pad = 0.3, hedgesOnly = false) {
  if (!VG37) return false;
  for (const F of FEATS) {
    if (F.kind === 'scrub' || (hedgesOnly && F.kind !== 'hedge') || x < F.b[0] - pad - 1 || x > F.b[1] + pad + 1 || z < F.b[2] - pad - 1 || z > F.b[3] + pad + 1) continue;
    const R = F.kind === 'hedge' && !F.f.a ? F.ring || (F.ring = lineRing(F.R, 0.85)) : F.R;
    if (inPoly(R, x, z)) return true;
    if (pad > 0) for (let i = 0; i < R.length; i++) {
      const a = R[i], b = R[(i + 1) % R.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      if (Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < pad) return true;
    }
  }
  return false;
}
export const VG37_STATS = { tiles: {}, hedges: 0, beds: 0, plants: 0, hullTris: 0, cardTris: 0 };
// every tile's VG37 group, weakly held (a tile's group goes with its tile): the in-page A/B, window.__VG37.set(false), hides them
const _groups = new Set();
const vgSet = (on) => { let n = 0; for (const r of _groups) { const g = r.deref(); if (g) { g.visible = !!on; n++; } else _groups.delete(r); } return n; };
// build what stands in the 512 m tile at (ox, oz) into `group`; gy(x, z) the ground's height (null: not here).
// `meshes` (optional): a Set the caller keeps for its A/B toggles. Returns the count of features built.
export function vg37Tile(group, ox, oz, gy, meshes = null, key = '', park = true, clear = null) {
  if (!VG37) return 0;
  const mine = FEATS.filter((F) => { const cx = (F.b[0] + F.b[1]) / 2, cz = (F.b[2] + F.b[3]) / 2; return (F.f.z === 'cp') === park && cx >= ox && cx < ox + 512 && cz >= oz && cz < oz + 512; });
  if (!mine.length) return 0;
  const t0 = performance.now();
  const H = new Geo(), C = new Geo(), E = new Geo();
  const soil = { p: [], n: [], c: [], k: [], i: [] };
  const lists = new Map();
  const add = (form, t) => { let l = lists.get(form); if (!l) lists.set(form, (l = [])); l.push(t); };
  const st = { hedges: 0, beds: 0, plants: 0 };
  const doFeature = (F) => {
    const rnd = mulberry(F.f.id % 100000);
    if (F.kind === 'hedge') {
      const h = F.f.h > 0.3 && F.f.h < 4 ? F.f.h : HEDGE_H[F.f.g] ?? 1.1;
      const R = F.f.a ? F.R : lineRing(F.R, 0.85);
      const v = hh(F.R[0][0], F.R[0][1], 3);
      const tint = [0.92 + 0.12 * v, 0.95 + 0.1 * v, 0.9 + 0.1 * (1 - v)];
      hedgeInto(H, C, R, h, gy, rnd, tint);
      st.hedges++;
    } else if (F.kind === 'bed') {
      if (bedSoil(soil, F.R, gy)) {
        bedPlants(F.f, F.R, add, gy, rnd, clear); st.beds++;
        if (VG37H && (F.f.g === 'french' || F.f.g === 'english')) bedEdge(E, F.R, gy, rnd);
      }
    } else {
      // scrub: the understorey shrubs at ~2.6 m, smaller toward the edge
      const [x0, x1, z0, z1] = F.b;
      for (let x = x0 + 1.3; x < x1; x += 2.6) for (let z = z0 + 1.3; z < z1; z += 2.6) {
        const px = x + (rnd() - 0.5) * 2, pz = z + (rnd() - 0.5) * 2;
        if (!inPoly(F.R, px, pz)) continue;
        const y = gy(px, pz);
        if (y === null) continue;
        const s = 0.45 + 0.5 * rnd();
        add(['underA', 'underB', 'underC'][Math.floor(rnd() * 3)], { x: px, y: y - 0.05, z: pz, yaw: rnd() * 6.2832, sx: s, sy: s * (0.8 + 0.4 * rnd()), c: [0.9 + 0.2 * rnd(), 0.9 + 0.2 * rnd(), 0.9 + 0.1 * rnd()] });
      }
    }
  };
  const finish = (msLayout, slices, longest, busy0) => {
  const t1 = performance.now();
  const leaf = vg37LeafMat();
  const G = new THREE.Group();
  G.name = 'vg37:' + (key || `${ox}_${oz}`);
  if (H.tris) {
    const m = new THREE.Mesh(H.build(), vg37HullMat());
    m.name = 'vg37:hull'; m.castShadow = true; m.receiveShadow = true;
    G.add(m); if (meshes) meshes.add(m);
    VG37_STATS.hullTris += H.tris;
  }
  if (C.tris) {
    const m = new THREE.Mesh(C.build(), leaf);
    m.name = 'vg37:hedgeCards'; m.castShadow = false; m.receiveShadow = true;
    // the cards within 90 m of the lens (the hull alone beyond)
    const ctr = m.geometry.boundingSphere.center.clone(), rad = m.geometry.boundingSphere.radius;
    G.add(m); if (meshes) meshes.add(m);
    VG37_STATS.cardTris += C.tris;
    const trig = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
    trig.frustumCulled = false; trig.renderOrder = -1000; trig.name = 'vg37:hedgeLod';
    let fpV = -1;
    trig.onBeforeRender = (r, s, cam) => {
      if (!cam.isPerspectiveCamera || (cam.parent && cam.parent.isCubeCamera)) return;
      const fp = filmPath();   // FP37: while recording, the take's nearest approach decides, once per take
      if (fp) { if (fp.v !== fpV) { fpV = fp.v; m.visible = Math.sqrt(fpNear2(fp.pts, ctr.x, ctr.z)) - rad < 90; } return; }
      fpV = -1;
      const d = Math.hypot(cam.position.x - ctr.x, cam.position.z - ctr.z) - rad;
      m.visible = d < 90;
    };
    G.add(trig);
  }
  if (E.tris) {
    const m = new THREE.Mesh(E.build(), curbMat());
    m.name = 'vg37:curb'; m.castShadow = false; m.receiveShadow = true;
    G.add(m); if (meshes) meshes.add(m);
  }
  if (soil.i.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(soil.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(soil.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(soil.c, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(soil.k, 1));
    g.setIndex(soil.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, pitMat());
    m.name = 'vg37:bedSoil'; m.receiveShadow = true;
    G.add(m); if (meshes) meshes.add(m);
  }
  for (const [form, L] of lists) {
    const F = vg37Form(form);
    st.plants += L.length;
    const small = form === 'mums' || form === 'liriope' || SPECS[form].kind === 'perennial';
    G.add(lodSet('vg37:' + form, L, [{ near: F.lod0, mid: F.lod1, mat: leaf, cast: false, castMid: false }], small ? 45 : 70, small ? 140 : 300, meshes));
  }
  group.add(G);
  _groups.add(new WeakRef(G));
  VG37_STATS.hedges += st.hedges; VG37_STATS.beds += st.beds; VG37_STATS.plants += st.plants;
  const msMesh = performance.now() - t1;
  VG37_STATS.tiles[key || `${ox}_${oz}`] = { ...st, ms: +(busy0 + msMesh).toFixed(1), msLayout: +msLayout.toFixed(1), msMesh: +msMesh.toFixed(1), slices, longest: +Math.max(longest, msMesh).toFixed(1) };
  };
  if (!VG37SLICE) {
    for (const F of mine) doFeature(F);
    const ms = performance.now() - t0;
    finish(ms, 1, ms, ms);
    return mine.length;
  }
  // (session 3, item 7: the Conservatory Garden's tile laid its 12 hedges, 23 beds and ~5,200 plants out in one go on the main
  // thread, ~190 ms with VG37H, 460-620 ms before: one hitch as the tile assembled) the features are laid out a few at a time,
  // ~6 ms a slice between frames, and the meshes built in a slice of their own; the tile's group fills a few frames after the
  // tile appears. `?vg37slice=0` builds it in one go
  let i = 0, slices = 0, longest = 0, busy = 0, layout = 0;
  const step = () => {
    try {
      const s0 = performance.now();
      if (i < mine.length) {
        while (i < mine.length && performance.now() - s0 < 6) { try { doFeature(mine[i]); } catch (e) { console.warn('[vg37] feature', key, mine[i].f.id, e); } i++; }
        const d = performance.now() - s0; slices++; longest = Math.max(longest, d); busy += d; layout += d;
        setTimeout(step, 0);
      } else finish(layout, slices + 1, longest, busy);
    } catch (e) { console.warn('[vg37] tile', key, e); }
  };
  step();
  return mine.length;
}

// ---------------------------------------------------------------- the city outside Central Park (Bryant Park, the campus, Gantry
// Plaza, 125th Street): per tile on the streamer, the ground from streamer.surfaceAt. Central Park's features (zone 'cp') are
// built by city/cpFlora.js with the park's own ground (it knows the relief), so they are skipped here.
export function initVeg37(engine, streamer) {
  if (!VG37 || !engine || !streamer) return null;
  const root = new THREE.Group();
  root.name = 'vg37:city';
  engine.scene.add(root);
  const byTile = new Map();
  streamer.onTile((key, data) => {
    const [tx, tz] = key.split('_').map(Number);
    if (!isFinite(tx) || byTile.has(key)) return;
    const ox = tx * 512, oz = tz * 512;
    const gy = (x, z) => { const y = streamer.surfaceAt ? streamer.surfaceAt(x, z) : null; return y === null || !isFinite(y) ? null : y; };
    const G = new THREE.Group(); G.name = 'vg37:tile' + key;
    try { if (vg37Tile(G, ox, oz, gy, null, key, false)) { root.add(G); byTile.set(key, G); } } catch (e) { console.warn('[vg37] tile', key, e); }
  }, (key) => {
    const G = byTile.get(key);
    if (!G) return;
    root.remove(G);
    G.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
    byTile.delete(key);
  });
  const api = { stats: VG37_STATS, K: VG37K, HK: VG37HK, root, forms: _forms, set: vgSet, blocked: vg37Blocked };
  if (typeof window !== 'undefined') window.__VG37 = api;
  console.log(`[vg37] shrubs, hedges and beds on: ${VG37_HEDGES.length} hedges, ${VG37_BEDS.length} beds, ${VG37_SCRUB.length} scrub areas mapped`);
  return api;
}
if (typeof window !== 'undefined') window.__VG37 = window.__VG37 || { stats: VG37_STATS, K: VG37K, HK: VG37HK, forms: _forms, set: vgSet };
