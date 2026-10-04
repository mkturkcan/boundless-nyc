// CP33 — the park's rock kit (city/cpRocks.js; docs/notes/central-park-photoreal.md, "Rocks"): the Manhattan schist
// material shared by the outcrops and the boulders, the scanned rock pieces, the grass tufts at the rocks' feet.
//
// The schist: a scanned rock face (Poly Haven dark_rock_02, CC0, 2.0 m square at 2K: ~1 texel per mm) projected
// triplanar in world space at two scales (2.0 m and 5.3 m, rotated, blended by a low-frequency mask so neither repeat
// shows), calibrated from its brown 0.036 mean to the park's grey-brown schist, with the lichen crusts of a second scan
// (lichen_rock, CC0) on the tops and the sun-facing flanks, then the schist's own features over it: foliation bands
// striking N30E, mica glints, the glacial polish and N30W striations on the up-ice tops, iron and water stains running
// down the steep faces, moss and soil in the cracks and hollows (the vertices carry their cavity), soil and leaf litter
// where the rock meets the ground, and on the boulders a dark wet line at the water.
import * as THREE from 'three';
import { ktx2Loader } from './mat/ktx2.js';   // the app's one KTX2 loader (MATS 06:15)
import { ENV, applyLightTrim, applyCityAO } from '../world/materials.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// `?cpr33=0` restores the CP32 outcrops and boulders (cpLand.js)
export const CPR33 = !(Q && (Q.get('cp32') === '0' || Q.get('cp32l') === '0' || Q.get('cpr33') === '0'));

// ---------------------------------------------------------------- textures (tools/cp33/rocks_build.mjs)
const px = (r, g, b, srgb) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
const SETS = {
  // mean linear albedo of the packed maps (rocks_build.mjs log), so the gain lands the set on the target colour
  schist: { mean: [0.0435, 0.0345, 0.0257] },
  lichen: { mean: [0.0715, 0.0553, 0.0395] },
};
const U = {};
for (const k of Object.keys(SETS)) U[k] = { alb: { value: px(160, 160, 160, true) }, nrm: { value: px(128, 128, 255) }, orm: { value: px(255, 200, 128) } };
let _loader = null, _tl = null, _queued = false;
function loadAll(L) {
  for (const name of Object.keys(SETS)) {
    for (const [k, srgb] of [['alb', true], ['nrm', false], ['orm', false]]) {
      const install = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = srgb ? 16 : 8; if (srgb && !t.isCompressedTexture) t.colorSpace = THREE.SRGBColorSpace; U[name][k].value = t; };
      L.load(`textures/cp33/rocks/${name}_${k}.ktx2`, install, undefined, () => {
        if (!_tl) _tl = new THREE.TextureLoader();
        console.warn('[cpr33] ktx2 missing, jpg fallback:', name, k);
        _tl.load(`textures/cp33/rocks/${name}_${k}.jpg`, (t) => { t.flipY = false; install(t); });   // as the KTX2: the stored top row at v = 0
      });
    }
  }
}
function pump() {
  if (_loader) return true;
  const r = typeof window !== 'undefined' && window.__ENGINE && window.__ENGINE.renderer;
  if (!r) return false;
  _loader = ktx2Loader(r);
  loadAll(_loader);
  return true;
}
function ensureTextures() {
  if (_queued || typeof window === 'undefined') return;
  _queued = true;
  if (!pump()) { const iv = setInterval(() => { if (pump()) clearInterval(iv); }, 200); }
}

// ---------------------------------------------------------------- the schist
// target albedo (linear, before applyLightTrim's 0.30): dark grey-brown schist; the review measured the CP32 outcrops
// and boulders as pale
const SCHIST = [0.19, 0.168, 0.14], LICHEN = [0.25, 0.245, 0.2];   // (the park kits' living rock is 0.195 / 0.178 / 0.153; the first pass at 0.118 read as wet chocolate)
const gainOf = (S, T) => new THREE.Vector3(T[0] / S.mean[0], T[1] / S.mean[1], T[2] / S.mean[2]);
const GLSL = /* glsl */ `
  uniform sampler2D rkSA; uniform sampler2D rkSN; uniform sampler2D rkSO;
  uniform sampler2D rkLA; uniform sampler2D rkLN; uniform sampler2D rkLO;
  uniform vec3 rkSG; uniform vec3 rkLG;
  varying vec3 vRkW; varying vec3 vRkN; varying vec3 vRkA; varying float vRkD;
  // WS34 (teaser 4 v3, 2026-10-01: a black block in the Lake one frame in 36, a few black pixels on the bank in most):
  // the simplified scans keep a few vertices whose normal is (0, 0, 0) (the faces round them collapsed to zero area), and
  // normalize() of a zero vector is NaN: the composer's guard paints the pixel black and the water's mirror spreads it
  // over a mip texel. Every normal here goes through rkNz, which falls back to the given direction.
  vec3 rkNz(vec3 v, vec3 fb) { float l = dot(v, v); return l > 1e-12 ? v * inversesqrt(l) : fb; }
  float rkH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float rkV(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(rkH(i), rkH(i + vec2(1.0, 0.0)), f.x), mix(rkH(i + vec2(0.0, 1.0)), rkH(i + vec2(1.0, 1.0)), f.x), f.y); }
  float rkF(vec2 p) { return rkV(p) * 0.55 + rkV(p * 2.3 + 5.1) * 0.28 + rkV(p * 5.9 + 1.7) * 0.17; }
  vec2 rkRot(vec2 p) { return vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y); }
  vec2 rkRotT(vec2 t) { return vec2(0.6 * t.x + 0.8 * t.y, -0.8 * t.x + 0.6 * t.y); }
  // the top plane's texture runs with the strike (N30E): (along, -across), a pure rotation; rkStT takes a tangent back to the plane
  vec2 rkSt(vec2 p) { return vec2(-0.5 * p.x + 0.866 * p.y, -0.866 * p.x - 0.5 * p.y); }
  vec2 rkStT(vec2 t) { return vec2(-0.5 * t.x - 0.866 * t.y, 0.866 * t.x - 0.5 * t.y); }
  // CP34: a boulder's own grain: the texture frame turned by its seed (any bearing, the foliation tilted up to +-60 deg), so
  // no two boulders carry their bands and their scan the same way
  mat3 rkFrame(float s) {
    float a = fract(s * 0.731 + 0.17) * 6.2832, b = (fract(s * 0.419 + 0.3) - 0.5) * 2.1;
    float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
    return mat3(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb) * mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca);
  }
  // the shading state shared by the chunks below
  vec3 rkNW; vec3 rkBW; float rkRough; float rkAO; float rkWet; float rkGlint; float rkNear;
  vec3 rkDX; vec3 rkDY;   // the world position's screen derivatives, taken once in uniform flow (textureGrad inside the branches)
  // the maps are not flipped on upload (KTX2 never is, and the JPG fallback has flipY off): the stored top row is at v = 0, so
  // sample at (u, -v): up the surface is up the image, and the normal map's green runs along +v, the frame the blend below uses
  vec4 rkG(sampler2D t, vec2 uv, vec2 a, vec2 b) { return textureGrad(t, vec2(uv.x, -uv.y), vec2(a.x, -a.y), vec2(b.x, -b.y)); }
  // triplanar sample of one map at world scale s (m per repeat), rotated for the second scale. The three planes are
  // sampled with explicit gradients: a texture() call under a branch on the blend weights had undefined derivatives,
  // and drew a seam of the wrong mip level along every weight threshold
  vec4 rkTri(sampler2D t, vec3 w, float s, bool rot) {
    vec2 ux = w.zy / s, uy = rkSt(w.xz) / s, uz = w.xy / s;
    vec2 xa = rkDX.zy / s, xb = rkDY.zy / s, ya = rkSt(rkDX.xz) / s, yb = rkSt(rkDY.xz) / s, za = rkDX.xy / s, zb = rkDY.xy / s;
    if (rot) {
      ux = rkRot(ux) + 0.37; uy = rkRot(uy) + 0.71; uz = rkRot(uz) + 0.13;
      xa = rkRot(xa); xb = rkRot(xb); ya = rkRot(ya); yb = rkRot(yb); za = rkRot(za); zb = rkRot(zb);
    }
    vec4 c = vec4(0.0);
    float ws = 0.0;
    if (rkBW.x > 0.01) { c += rkG(t, ux, xa, xb) * rkBW.x; ws += rkBW.x; }
    if (rkBW.y > 0.01) { c += rkG(t, uy, ya, yb) * rkBW.y; ws += rkBW.y; }
    if (rkBW.z > 0.01) { c += rkG(t, uz, za, zb) * rkBW.z; ws += rkBW.z; }
    return c / max(1e-4, ws);
  }
  // whiteout-blended triplanar normal (world space)
  vec3 rkTriN(sampler2D t, vec3 w, vec3 n, float s, bool rot, float k) {
    vec2 ux = w.zy / s, uy = rkSt(w.xz) / s, uz = w.xy / s;
    vec2 xa = rkDX.zy / s, xb = rkDY.zy / s, ya = rkSt(rkDX.xz) / s, yb = rkSt(rkDY.xz) / s, za = rkDX.xy / s, zb = rkDY.xy / s;
    if (rot) {
      ux = rkRot(ux) + 0.37; uy = rkRot(uy) + 0.71; uz = rkRot(uz) + 0.13;
      xa = rkRot(xa); xb = rkRot(xb); ya = rkRot(ya); yb = rkRot(yb); za = rkRot(za); zb = rkRot(zb);
    }
    vec3 tx = vec3(0.0, 0.0, 1.0), ty = vec3(0.0, 0.0, 1.0), tz = vec3(0.0, 0.0, 1.0);
    if (rkBW.x > 0.01) tx = rkG(t, ux, xa, xb).xyz * 2.0 - 1.0;
    if (rkBW.y > 0.01) ty = rkG(t, uy, ya, yb).xyz * 2.0 - 1.0;
    if (rkBW.z > 0.01) tz = rkG(t, uz, za, zb).xyz * 2.0 - 1.0;
    tx.xy *= k; ty.xy *= k; tz.xy *= k;
    // the tangents back to the planes' axes (the second scale is rotated, the top plane runs with the strike)
    if (rot) { tx.xy = rkRotT(tx.xy); ty.xy = rkRotT(ty.xy); tz.xy = rkRotT(tz.xy); }
    ty.xy = rkStT(ty.xy);
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    return rkNz(tx.zyx * rkBW.x + ty.xzy * rkBW.y + tz.xyz * rkBW.z, n);
  }
`;
function rockShader(sh, boulder, wl) {
  sh.uniforms.rkSA = U.schist.alb; sh.uniforms.rkSN = U.schist.nrm; sh.uniforms.rkSO = U.schist.orm;
  sh.uniforms.rkLA = U.lichen.alb; sh.uniforms.rkLN = U.lichen.nrm; sh.uniforms.rkLO = U.lichen.orm;
  sh.uniforms.rkSG = { value: gainOf(SETS.schist, SCHIST) };
  sh.uniforms.rkLG = { value: gainOf(SETS.lichen, LICHEN) };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      varying vec3 vRkW; varying vec3 vRkN; varying vec3 vRkA; varying float vRkD;
    vec3 rkNz(vec3 v, vec3 fb) { float l = dot(v, v); return l > 1e-12 ? v * inversesqrt(l) : fb; }
      ${boulder ? 'attribute float aCv; varying float vRkC; varying float vRkS;' : 'attribute vec3 aRk; attribute float aRd;'}`)
    // the boulders carry their per-instance data in instanceColor (not a colour: the shader reads it, vColor stays 1)
    .replace('#include <color_vertex>', boulder ? `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
        vColor = vec4( 1.0 );   // three r185: vColor is a vec4, and the fragment shader multiplies it into the albedo
      #endif` : '#include <color_vertex>')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 rkP = vec4(transformed, 1.0);
        vec3 rkN0 = objectNormal;
        #ifdef USE_INSTANCING
          rkP = instanceMatrix * rkP; rkN0 = mat3(instanceMatrix) * rkN0;
        #endif
        vRkW = (modelMatrix * rkP).xyz;
        vRkN = rkNz(mat3(modelMatrix) * rkN0, vec3(0.0, 1.0, 0.0));
        ${boulder
          // the boulders: instanceColor x the water's level under it (-1e4: none), y the ground's level at its centre, z its
          // seed (0-99) and the ground's slope there packed (seed + 100 (gx + 101 gz), gx gz in 0.02 steps from -1): vRkA.y
          // is the ground's plane under this vertex, so the foot's soil and shade follow a sloping bank
          ? `#ifdef USE_INSTANCING_COLOR
              {
                float pk = instanceColor.z, g2 = floor(pk / 100.0 + 1e-3), sd = pk - g2 * 100.0;
                float gzq = floor(g2 / 101.0 + 1e-3), gxq = g2 - gzq * 101.0;
                vec2 gq = vec2(gxq, gzq) * 0.02 - 1.0;
                vec3 c0 = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
                vRkA = vec3(instanceColor.x, instanceColor.y + gq.x * (vRkW.x - c0.x) + gq.y * (vRkW.z - c0.z), sd * 0.137);
              }
            #else
              vRkA = vec3(-1e4, -1e4, 0.0);
            #endif
            vRkC = aCv;
            #ifdef USE_INSTANCING
              vRkS = length(instanceMatrix[0].xyz);   // the boulder's size (its footprint's larger side, m)
            #else
              vRkS = 1.0;
            #endif`
          // the outcrops: x cavity (0 flat .. 1 a crack's floor), y height over the ground (m), z the joints' mask
          : 'vRkA = aRk;'}
        vRkD = ${boulder ? '99.0' : 'aRd'};
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL + (boulder ? '\nvarying float vRkC; varying float vRkS;' : ''))
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 w = vRkW, n = rkNz(vRkN, vec3(0.0, 1.0, 0.0));
        ${boulder
          // CP34: the boulders sample the scan in their own turned frame (wt, nt); the wet line, the moss and the light stay world
          ? 'float seed = vRkA.z; mat3 rkR = rkFrame(seed); vec3 wt = rkR * w + vec3(seed * 3.7, 0.0, seed * 5.3), nt = rkR * n;'
          : 'float seed = 0.0; vec3 wt = w, nt = n;'}
        rkBW = pow(abs(nt), vec3(4.0)); rkBW /= max(1e-6, rkBW.x + rkBW.y + rkBW.z);
        rkDX = dFdx(wt); rkDY = dFdy(wt);
        float fw = max(length(rkDX), length(rkDY));
        rkNear = 1.0 - smoothstep(0.004, 0.05, fw);
        ${boulder
          // the boulders: the scan's own hollows (aCv, rocks_build / loadRockPieces) for the cavity; moss on the lowest 0.4 m
          // (the shade, the damp), on the tops and on the north (shaded) side in patches
          ? `float cav = clamp(vRkC, 0.0, 1.0), hg = w.y - vRkA.y, jnt = 0.0;
             float bk1 = fract(seed * 7.31 + 0.13), bk2 = fract(seed * 3.17 + 0.41), bk3 = fract(seed * 11.9 + 0.71), bk4 = fract(seed * 5.03 + 0.27);
             float mossP = smoothstep(0.42, 0.78, rkF(w.xz * 1.6 + w.y * 1.1 + seed * 5.0) + cav * 0.35);
             float shadeS = clamp(-n.z * 0.8 - n.x * 0.25, 0.0, 1.0) * smoothstep(-0.35, 0.25, n.y);
             float fh = 0.08 + 0.14 * vRkS;   // the damp foot band, with the boulder's size
             jnt = clamp((1.0 - smoothstep(0.03, fh, hg)) * 0.5 + mossP * (0.15 + 0.35 * shadeS + 0.4 * smoothstep(0.55, 0.9, n.y)) * (0.25 + 0.7 * bk3), 0.0, 1.0);`
          : 'float cav = vRkA.x, hg = vRkA.y, jnt = vRkA.z;'}
        // the rock's edge: the lawn takes over in a ragged fringe (a dissolve into the turf over 0.4-1.3 m, blotchy at 5-30 cm),
        // the stone going to soil and grass-stained inside it. vRkD is the distance in from the outline (99: none)
        float fzw = 0.4 + 0.9 * rkF(w.xz * 0.7 + 13.0 + seed);
        float fcov = smoothstep(0.0, fzw, vRkD + (rkF(w.xz * 0.4 + 3.0 + seed) - 0.5) * 2.2 + 0.25);
        {
          float fn = rkV(w.xz * 5.5 + 3.0) * 0.55 + rkV(w.xz * 17.0 + 8.0) * 0.3 + rkV(w.xz * 53.0) * 0.15;
          if (fcov < fn * 0.92) discard;
        }
        // two scales of the scan, the second rotated, mixed by a 4 m mask
        float mk = smoothstep(0.3, 0.7, rkF(wt.xz * 0.23 + seed * 7.0));
        vec4 a1 = rkTri(rkSA, wt, 2.0, false), a2 = rkTri(rkSA, wt, 5.3, true);
        vec4 o1 = rkTri(rkSO, wt, 2.0, false), o2 = rkTri(rkSO, wt, 5.3, true);
        vec3 alb = mix(a1.rgb, a2.rgb, mk) * rkSG;
        // the rock's own tone drifts across the park (warm, brownish gneiss to cool grey schist, darker to lighter) at ~100 m
        {
          float tn = rkF(w.xz * 0.011 + 3.7 + seed * 0.7), tb = rkF(w.xz * 0.017 - 9.1);
          alb *= mix(vec3(1.07, 1.03, 0.96), vec3(0.92, 0.98, 1.08), tn) * (0.88 + 0.26 * tb);
        }
        vec3 orm = mix(o1.rgb, o2.rgb, mk);
        // foliation: layers striking N30E (bands across (0.866, 0.5)), folded, light and dark (a boulder's in its own frame)
        float across = dot(wt.xz, vec2(0.866, 0.5)) + (rkV(vec2(dot(wt.xz, vec2(-0.5, 0.866)) * 0.06, seed)) - 0.5) * 3.0;
        float band = rkF(vec2(across * 1.1, wt.y * 0.25));
        alb *= mix(0.78, 1.18, band);
        // the mica's sheen in the light bands: a little warmer and brighter
        alb = mix(alb, alb * vec3(1.12, 1.08, 1.0), smoothstep(0.6, 0.85, rkV(vec2(across * 4.0, wt.y * 2.0 + seed))) * 0.5);
        // quartz and feldspar veins and lenses, pale, along the grain
        alb = mix(alb, vec3(0.30, 0.29, 0.27), smoothstep(0.955, 0.99, rkV(vec2(across * 2.2, dot(wt.xz, vec2(-0.5, 0.866)) * 0.25) + 11.0)) * 0.75);
        ${boulder
          // CP34: no two boulders alike: the glacial erratics a third pale grey (granite, gneiss, weathered light), the rest the
          // schist from dark to light and warm to cool; a few with quartz veins across them
          ? `{
              // the scan's brown weathering greyed (the park's boulders read grey against the grass, gap_north.jpg)
              float lum = dot(alb, vec3(0.3, 0.45, 0.25));
              alb = mix(alb, vec3(lum) * vec3(1.0, 1.0, 0.985), 0.72) * 1.18;
              float pale = smoothstep(0.6, 0.66, bk1);
              alb *= mix(0.78, 1.3, bk2) * mix(vec3(1.03, 1.0, 0.96), vec3(0.96, 0.99, 1.04), bk4);
              alb = mix(alb, vec3(lum) * vec3(1.0, 1.0, 0.97) * 1.95, pale * 0.85);
              // the tops weathered pale (bleached, dusty, crusted: gap_north.jpg's light flat tops)
              alb *= 1.0 + 0.32 * smoothstep(0.45, 0.95, n.y);
              // a quartz vein across some: one wavering band every 2.7 m of the grain (at most one crosses a boulder)
              float vd = dot(wt, vec3(0.27, 0.9, -0.36)) + (rkV(wt.xz * 1.3 + seed) - 0.5) * 0.25;
              float vein = 1.0 - smoothstep(0.01, 0.028, abs(vd - floor(vd / 2.7) * 2.7 - 1.35));
              alb = mix(alb, vec3(0.36, 0.35, 0.32), vein * step(0.7, bk3) * 0.7);
            }`
          : ''}
        // iron staining (rust brown) where water seeps out of the foliation, and the dark water streaks down the steep faces
        float steep = 1.0 - smoothstep(0.35, 0.75, n.y);
        alb = mix(alb, alb * vec3(1.45, 1.02, 0.62), smoothstep(0.66, 0.9, rkF(wt.xz * 0.19 + 17.0 + seed)) * ${boulder ? '0.1' : '0.5'});
        float streak = smoothstep(0.55, 0.85, rkV(vec2(dot(w.xz, vec2(0.7071, 0.7071)) * 3.1, w.y * 0.35 + seed * 3.0)));
        alb *= 1.0 - streak * steep * 0.42;
        // lichen crusts (grey-green, a few pale and orange rosettes) on the tops and the flanks out of the wet
        float lm = smoothstep(0.52, 0.72, rkF(w.xz * 0.55 + w.y * 0.3 + 31.0 + seed)) * smoothstep(-0.1, 0.6, n.y) * (1.0 - cav);
        ${boulder ? 'lm *= (0.3 + 0.55 * bk4) * (1.0 - jnt * 0.6);' : ''}
        vec3 la = rkTri(rkLA, wt, 1.5, false).rgb * rkLG;
        ${boulder ? 'la = mix(la, vec3(dot(la, vec3(0.3, 0.5, 0.2))) * vec3(0.97, 1.02, 0.95), 0.5);   // grey-green crusts, not orange' : ''}
        alb = mix(alb, la, lm * 0.85);
        alb = mix(alb, vec3(0.42, 0.43, 0.38), smoothstep(0.8, 0.92, rkV(w.xz * 2.7 + 41.0)) * lm * ${boulder ? '0.2' : '0.5'});
        alb = mix(alb, vec3(0.42, 0.22, 0.06), smoothstep(0.93, 0.975, rkV(w.xz * 4.3 + 51.0)) * smoothstep(0.4, 0.9, n.y) * 0.65 * rkNear);
        // moss and soil in the cracks, the hollows and the joints (the up-facing parts of them)
        float moist = max(cav, jnt * 0.9) * smoothstep(-0.2, 0.5, n.y);
        float moss = smoothstep(0.25, 0.7, moist + (rkF(w.xz * 1.7 + 61.0) - 0.5) * 0.5);
        vec3 mossC = mix(vec3(0.045, 0.07, 0.022), vec3(0.09, 0.11, 0.035), rkV(w.xz * 9.0))${boulder ? ' * 1.35' : ''};
        alb = mix(alb, mossC * (0.7 + 0.6 * a1.g / max(0.02, rkSG.g * 0.03)), moss * 0.8);
        alb = mix(alb, vec3(0.085, 0.066, 0.046), smoothstep(0.75, 1.0, moist) * 0.5);
        // where the rock meets the ground: soil, leaf litter and the grass's shade over the lowest 10-30 cm
        float foot = 1.0 - smoothstep(0.02, 0.1 + 0.22 * rkF(w.xz * 1.3 + 7.0), hg);
        vec3 litter = mix(vec3(0.055, 0.042, 0.03), ${boulder ? 'vec3(0.1, 0.078, 0.05)' : 'vec3(0.16, 0.09, 0.035)'}, smoothstep(0.62, 0.8, rkV(w.xz * 13.0 + 3.0)));
        litter = mix(litter, vec3(0.05, 0.075, 0.025), smoothstep(0.55, 0.75, rkV(w.xz * 5.0 + 9.0)) * 0.6);
        alb = mix(alb, litter, foot * ${boulder ? '0.65' : '0.9'});
        {
          vec3 turf = mix(vec3(0.04, 0.062, 0.02), vec3(0.075, 0.095, 0.03), rkV(w.xz * 11.0 + 5.0));
          turf = mix(turf, vec3(0.05, 0.036, 0.024), smoothstep(0.55, 0.8, rkV(w.xz * 4.0 + 29.0)) * 0.7);
          alb = mix(alb, turf, (1.0 - fcov) * 0.75 * (1.0 - smoothstep(0.0, 0.25, rkF(w.xz * 3.1 + 2.0) - fcov * 0.5)));
        }
        // the wet line at the water
        ${boulder
          // CP34 (the boulders, gap_north.jpg): under the water algae-dark and olive; over it a wet, dark, glossy band of 5-25 cm
          // (wider on a bigger boulder) with a ragged top; a thin, broken, pale scum line right at the water; and over the wet,
          // only where the boulder stands in the water, a matte stain of old high water to 20-60 cm
          ? `{
              float dz = w.y - vRkA.x, wob = (rkV(w.xz * 3.1 + seed) - 0.5) * 0.06 + (rkV(w.xz * 13.0 + seed * 2.0) - 0.5) * 0.025;
              float wetTop = 0.04 + 0.1 * rkV(w.xz * 1.7 + seed * 3.0) + 0.04 * vRkS + wob;
              rkWet = 1.0 - smoothstep(wetTop * 0.45, wetTop, dz);
              float under = 1.0 - smoothstep(-0.03, 0.0, dz);
              // (the stain only where the ground under this point is at the water: a boulder up the bank has none)
              float atW = 1.0 - smoothstep(0.02, 0.12, vRkA.y - vRkA.x);
              float stain = (1.0 - smoothstep(0.1 + 0.12 * vRkS + wob * 2.0, 0.2 + 0.2 * vRkS + wob * 3.0, dz)) * (1.0 - rkWet) * smoothstep(-0.2, 0.0, dz) * atW;
              alb = mix(alb, alb * vec3(0.76, 0.79, 0.74), stain * 0.65);
              alb = mix(alb, alb * vec3(0.62, 0.7, 0.45), under);
              float scum = smoothstep(-0.004, 0.003, dz) * (1.0 - smoothstep(0.01, 0.022 + 0.014 * rkV(w.xz * 7.0 + seed), dz)) * smoothstep(0.3, 0.55, rkV(w.xz * 8.0 + seed * 4.0));
              alb *= mix(1.0, 0.55, rkWet);
              alb = mix(alb, vec3(0.34, 0.33, 0.27), scum * 0.75);
              rkWet *= 1.0 - scum;
            }`
          : (wl !== undefined ? `rkWet = 1.0 - smoothstep(${wl.toFixed(3)} + 0.03, ${wl.toFixed(3)} + 0.4 + 0.2 * rkV(w.xz * 2.3 + 5.0), w.y);
             alb *= mix(1.0, 0.42, rkWet);` : 'rkWet = 0.0;')}
        // mica glints: sparse bright flecks in the near field
        rkGlint = step(0.982, rkH(floor(wt.xz * 160.0) + floor(wt.y * 160.0) * 3.7)) * rkNear * (1.0 - lm) * (1.0 - moss);
        alb = mix(alb, vec3(0.5, 0.48, 0.44), rkGlint * 0.6);
        // roughness: the scan's, smoother on the polished tops, glossy where wet; AO: the scan's and the cavities'
        float top = smoothstep(0.75, 0.97, n.y) * (1.0 - jnt);
        rkRough = clamp(orm.g * mix(1.0, 0.82, top) + moss * 0.15 + lm * 0.08, 0.35, 1.0);
        rkRough = mix(rkRough, ${boulder ? '0.3' : '0.16'}, rkWet);
        rkAO = mix(1.0, orm.r, ${boulder ? '0.6' : '0.85'}) * (1.0 - cav * 0.42) * (1.0 - foot * 0.35);
        ${boulder
          // the contact: the underside and the lowest 30 cm in the ground's shade (the sky and the bounce cut off)
          ? 'rkAO *= mix(1.0, 0.55, (1.0 - smoothstep(0.0, 0.06 + 0.12 * vRkS, hg)) * (0.5 + 0.5 * (1.0 - smoothstep(-0.6, 0.3, n.y))));'
          : ''}
        diffuseColor.rgb *= clamp(alb, 0.0, 1.0);
        // the normal: the scan's at the two scales (and the lichen's where it grows), in the texture frame
        vec3 n1 = rkTriN(rkSN, wt, nt, 2.0, false, 1.15), n2 = rkTriN(rkSN, wt, nt, 5.3, true, 0.9);
        rkNW = rkNz(mix(n1, n2, mk), nt);
        rkNW = rkNz(mix(rkNW, rkTriN(rkLN, wt, nt, 1.5, false, 0.8), lm * 0.6), nt);
        ${boulder
          ? 'rkNW = rkNz(transpose(rkR) * rkNW, n);'
          // glacial striations on the up-ice tops: fine grooves along the ice's path N30W - S30E
          : `float sx = dot(w.xz, vec2(0.866, 0.5)) * 38.0 + rkV(w.xz * 0.8) * 9.0;
             float sg = cos(sx) * smoothstep(0.45, 0.8, rkV(w.xz * vec2(0.6, 2.4) + seed)) * top * rkNear;
             rkNW = rkNz(rkNW + vec3(0.866, 0.0, 0.5) * sg * 0.12, n);`}
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(rkRough, 0.22, rkGlint);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.65, rkGlint);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = rkNz((viewMatrix * vec4(rkNW, 0.0)).xyz, normal);`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
      reflectedLight.indirectDiffuse *= rkAO;
      reflectedLight.indirectSpecular *= rkAO * mix(1.0, 0.6, 1.0 - rkRough);`);
}
const _mats = {};
export function rockMat(kind, wl) {   // 'outcrop' | 'boulder' | 'vista' (an outcrop with a waterline at world y = wl: the wet band)
  const key = kind + (wl !== undefined ? ':' + wl.toFixed(2) : '');
  if (_mats[key]) return _mats[key];
  ensureTextures();
  const boulder = kind === 'boulder';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  m.name = 'cpr33:schist:' + kind;
  m.onBeforeCompile = (sh) => rockShader(sh, boulder, wl);
  m.customProgramCacheKey = () => 'cpr33-schist-' + key + '-4';
  applyCityAO(m);
  applyLightTrim(m);
  _mats[key] = m;
  return m;
}

// ---------------------------------------------------------------- the scanned pieces
// tools/cp33/rocks_build.mjs: each piece on its base, centred, its footprint's larger side 1 m, three LODs
let _pieces = null, _piecesP = null;
export function rockPieces() { return _pieces; }
// CP34: the height (a fraction of the piece's) up to which the scan narrows: the lowest of ten slices whose widest point
// reaches 85 % of the piece's widest. A boulder on the lawn is sunk at least this far, so no scan stands on a narrow
// waist or a keel (lakeNear_a8: a tall scan on its keel read as hovering over the grass)
function waistOf(P, H) {
  const R = new Float32Array(10);
  let rMax = 0;
  for (let v = 0; v < P.length; v += 3) {
    const r = Math.hypot(P[v], P[v + 2]), k = Math.min(9, Math.max(0, Math.floor((P[v + 1] / Math.max(1e-4, H)) * 10)));
    if (r > R[k]) R[k] = r;
    if (r > rMax) rMax = r;
  }
  for (let k = 0; k < 10; k++) if (R[k] >= 0.85 * rMax) return (k + 0.5) / 10;
  return 0.5;
}
// CP34: per vertex, how far the mean of its neighbours (two rings, ~5 cm on the 1 m piece) lies over its tangent plane, over
// the mean edge: a hollow, a crack or the crease under an overhang > 0, a ridge or a corner < 0; 0 .. 1 out
function cavityOf(g) {
  const P = g.attributes.position.array, Nn = g.attributes.normal, I = g.index.array, nv = P.length / 3;
  const sx = new Float32Array(nv), sy = new Float32Array(nv), sz = new Float32Array(nv), cnt = new Float32Array(nv), el = new Float32Array(nv);
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + ((e + 1) % 3)];
    const dx = P[b * 3] - P[a * 3], dy = P[b * 3 + 1] - P[a * 3 + 1], dz = P[b * 3 + 2] - P[a * 3 + 2], d = Math.hypot(dx, dy, dz);
    sx[a] += P[b * 3]; sy[a] += P[b * 3 + 1]; sz[a] += P[b * 3 + 2]; cnt[a]++; el[a] += d;
    sx[b] += P[a * 3]; sy[b] += P[a * 3 + 1]; sz[b] += P[a * 3 + 2]; cnt[b]++; el[b] += d;
  }
  let C = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    if (!cnt[v]) continue;
    const mx = sx[v] / cnt[v] - P[v * 3], my = sy[v] / cnt[v] - P[v * 3 + 1], mz = sz[v] / cnt[v] - P[v * 3 + 2];
    C[v] = (Nn.getX(v) * mx + Nn.getY(v) * my + Nn.getZ(v) * mz) / Math.max(1e-5, el[v] / cnt[v]);
  }
  // two passes of neighbour smoothing (the scan's pits and grains are noise at this scale)
  for (let pass = 0; pass < 2; pass++) {
    const S = new Float32Array(nv), K = new Float32Array(nv);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + ((e + 1) % 3)]; S[a] += C[b]; K[a]++; S[b] += C[a]; K[b]++; }
    const D = new Float32Array(nv);
    for (let v = 0; v < nv; v++) D[v] = (C[v] + S[v]) / (1 + K[v]);
    C = D;
  }
  for (let v = 0; v < nv; v++) C[v] = Math.min(1, Math.max(0, C[v] * 3.0));
  return C;
}
export function loadRockPieces() {
  if (_piecesP) return _piecesP;
  _piecesP = (async () => {
    const [J, B] = await Promise.all([
      fetch('models/cp33/rocks/rocks.json').then((r) => r.json()),
      fetch('models/cp33/rocks/rocks.bin').then((r) => r.arrayBuffer()),
    ]);
    _pieces = J.pieces.map((p) => ({
      src: p.src, piece: p.piece, dims: p.dims, waist: waistOf(new Float32Array(B, p.lods[0].p, p.lods[0].nv * 3), p.dims[1]),
      lods: p.lods.map((L) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(B, L.p, L.nv * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(B, L.n, L.nv * 3), 3, true));
        g.setIndex(new THREE.BufferAttribute(new Uint16Array(B, L.i, L.ni), 1));
        g.setAttribute('aCv', new THREE.BufferAttribute(cavityOf(g), 1));   // CP34: the scan's hollows (the shader's moss, soil and AO)
        g.computeBoundingSphere();
        return g;
      }),
    }));
    return _pieces;
  })().catch((e) => { console.warn('[cpr33] rock pieces unavailable', e); _pieces = []; return _pieces; });
  return _piecesP;
}

// ---------------------------------------------------------------- grass tufts
// at the rocks' feet: clumps of crossed quads the shader cuts into tapering, curving blades (as LAND's reeds), lawn green
// going to straw, lit from above
let _tuftMat = null;
export function tuftMat() {
  if (_tuftMat) return _tuftMat;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  m.name = 'cpr33:tufts';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rtWind = ENV.windT || { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRt; varying vec3 vRt; uniform float rtWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRt = aRt;
        {
          float sw = aRt.y * aRt.y;
          transformed.x += sw * 0.035 * sin(rtWind * 1.7 + position.x * 0.9 + position.z * 0.4);
          transformed.z += sw * 0.03 * cos(rtWind * 1.3 + position.z * 0.8);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRt;
        float rtH(float n) { return fract(sin(n * 91.3458) * 47453.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float u = vRt.x, v = vRt.y, cov = 0.0;
          float fw = fwidth(u) + 1e-4;
          for (int i = 0; i < 9; i++) {
            float fi = float(i);
            float r1 = rtH(fi + vRt.z * 13.1), r2 = rtH(fi * 1.7 + vRt.z * 7.3), r3 = rtH(fi * 2.3 + vRt.z * 3.9);
            float top = 0.45 + 0.55 * r3;
            if (v > top) continue;
            float c = (fi + 0.5) / 9.0 + (r1 - 0.5) * 0.1 + (r2 - 0.5) * 0.45 * (v / top) * (v / top);
            float wd = 0.03 * (1.0 - v / top) + 0.004;
            cov = max(cov, 1.0 - smoothstep(wd - fw, wd + fw, abs(u - c)));
          }
          float dith = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (cov < 0.5 * (fw > 0.05 ? dith * 2.0 : 1.0)) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.4, 1.0, smoothstep(0.0, 0.6, vRt.y));`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = dot(vNormal, vNormal) > 1e-12 ? normalize(vNormal) : normal;   // (WS34: no NaN from a zero normal)`);
  };
  m.customProgramCacheKey = () => 'cpr33-tufts-1';
  applyLightTrim(m);
  _tuftMat = m;
  return m;
}
