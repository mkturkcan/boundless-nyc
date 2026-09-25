import * as THREE from 'three';
import { TILE } from '../shared/geo.js';
import { fasciaTexture } from '../city/fasciaAtlas.js';  // 2 x 16 slots of 512x64 (inlined in the GLSL below)

// FS26 SKY-MATCHED FOG (owner 2026-09-25: golden hour "flat and low quality"). The far field faded into ONE colour per
// preset (golden: a warm beige, warmed again by the horizon tint below) while the analytic sky at the horizon is a
// neutral white away from the sun and a bright warm white toward it, so every aerial showed a tan band ending in a
// hard seam where fogged geometry met the sky. sky.js renders the sky dome into a 16-texel float strip after every sky
// change (8 azimuths just above the horizon, 8 at ~11 deg) and the fog fades toward THAT colour along each fragment's
// view direction: distance converges on the sky it stands against. The haze pass (engine.js) and the water use the
// same ring. A shader that includes the fog chunks without binding the ring reads fogSkyP = 0 and keeps the old colour.
// `?fs26=0` off.
export const FS26 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fs26') === '0');
export const FOG_SKY = { ring: new Float32Array(16 * 3), p: new Float32Array(4) };   // p: x on, y weight
export const FOG_SKY_GLSL = `
  uniform vec3 fogSkyRing[ 16 ];
  uniform vec4 fogSkyP;
  vec3 fogSkyColor( vec3 d, vec3 base ) {
    if ( fogSkyP.x < 0.5 ) return base;
    vec3 fd = normalize( d );
    float fa = ( atan( fd.z, fd.x + 1e-6 ) + 3.14159265 ) * 1.27323954;   // 0..8 round the horizon
    float fi = floor( fa ); float ff = fa - fi;
    int i0 = int( mod( fi, 8.0 ) ); int i1 = int( mod( fi + 1.0, 8.0 ) );
    vec3 lo = mix( fogSkyRing[ i0 ], fogSkyRing[ i1 ], ff );
    vec3 hi = mix( fogSkyRing[ i0 + 8 ], fogSkyRing[ i1 + 8 ], ff );
    return mix( base, mix( lo, hi, smoothstep( 0.02, 0.22, fd.y ) ), fogSkyP.y );
  }`;

// GLOBAL height fog (aerial perspective): override three's fog chunks BEFORE
// any material compiles — haze thickens toward street level and warms slightly
// at the horizon, hitting every fogged material (buildings, ground, trees,
// cars) from this one place.
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWorldY;
  varying vec3 vFogDir;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef USE_INSTANCING
    vec3 fogWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vec3 fogWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  vFogWorldY = fogWP.y;
  vFogDir = fogWP - cameraPosition;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWorldY;
  varying vec3 vFogDir;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${FOG_SKY_GLSL}
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogHeight = exp(-max(vFogWorldY - 6.0, 0.0) * 0.010);
    float fogD2 = fogDensity * mix(0.55, 1.45, fogHeight);
    float fogFactor = 1.0 - exp(-fogD2 * fogD2 * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  // FS26: the sky's own horizon colour along this view direction; without the ring, the preset colour warmed at the horizon
  vec3 fogCol3 = fogSkyP.x > 0.5 ? fogSkyColor(vFogDir, fogColor) : fogColor * mix(vec3(1.0), vec3(1.07, 1.02, 0.94), fogFactor);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol3, fogFactor);
#endif`;
// every built-in fogged shader binds the ring, by reference (three's cloneUniforms shares typed arrays), and so does
// any ShaderMaterial that merges UniformsLib.fog
if (FS26) {
  const fsU = () => ({ fogSkyRing: { value: FOG_SKY.ring }, fogSkyP: { value: FOG_SKY.p } });
  Object.assign(THREE.UniformsLib.fog, fsU());
  for (const sh of Object.values(THREE.ShaderLib)) if (sh && sh.uniforms && sh.uniforms.fogColor) Object.assign(sh.uniforms, fsU());
}

// Shared uniforms mutated by sky.js / streamer.
export const ENV = {
  night: { value: 0.0 },
  time: { value: 0 },
  fogColor: { value: new THREE.Color(0.78, 0.83, 0.9) },
  fogDensity: { value: 0.00011 },
  sunDir: { value: new THREE.Vector3(-0.5, 0.7, 0.3).normalize() },
  sunColor: { value: new THREE.Color(1.0, 0.93, 0.82) },
  skyAmbient: { value: new THREE.Color(0.5, 0.6, 0.75) },
  // weather bus (src/world/weather.js): shared by rain streaks, wet surfaces,
  // tree sway — one clock and one wetness so nothing drifts out of lockstep
  wet: { value: 0.0 },        // 0 dry .. 1 soaked
  snow: { value: 0.0 },       // 0 bare .. 1 blanketed
  windT: { value: 0.0 },      // wind clock (seconds, always running)
  windAmp: { value: 0.35 },   // breeze .. storm
  // city-scale sky occlusion (compile-time horizon bake, textures/cityao.bin):
  // R = sky visibility at street level, G = terrain height * 2. Scales
  // INDIRECT light only — canyon floors go moody, rooftops stay airy.
  cityAO: { value: null },
  cityAORect: { value: new THREE.Vector4(0, 0, 0, 0) }, // x0, z0, 1/w, 1/h
  cityAOAmt: { value: 0.85 },
  // ---- SPECULAR / REFLECTION GAIN (facades-r6 §0) -------------------------
  // The city's only reflection source used to be three's IBL, i.e.
  // getIBLRadiance() * envMapIntensity, and three r185 drives that uniform
  // from scene.environmentIntensity whenever material.envMap is null
  // (three.module.js:18690). lighting.md §2c cut scene.environmentIntensity
  // from 0.52 to 0.14 to fix a blue, flat ambient — which switched off every
  // glass reflection in Manhattan at the same time (critic r5 defect #2:
  // "NO SPECULAR REFLECTION ON ANYTHING", seven skyline frames, zero glints).
  // Reflections are therefore no longer taken from the IBL at all: the facade,
  // far-macro and landmark-glass/metal shaders answer the sky ANALYTICALLY
  // with this independent gain, so the ambient can be retuned freely.
  // ?refl=<x> scales it; ?refl=0 is the A/B that restores the r5 look.
  reflGain: { value: 1.0 },
  // LB13 — SILVER ROOF MEMBRANE ALBEDO TRIM (docs/notes/light-r13.md, critic r13 fix 3).
  // Multiplies the `kindR < 0.34` aged-silver-coating branch of the facade/roof shader and
  // nothing else (tar, gravel, EPDM, pavers, sedum and slate are already at reference values).
  // 1.0 restores the round-12 membrane; `?lb13=0` sets it back. Live-tunable for a measurement
  // session through window.__ENV.
  lbRoof: { value: 1.0 },
  // LB14 — GROUND CALIBRATION KNOBS (docs/notes/lb14.md, critic r14 fixes 2/3 + the paint half of 4).
  // The round-13 street calibration is ONE warm vec3 (1.94,1.70,1.47) on road + walk + terrain, and
  // it is the only warmth in a sunlit frame (the day sun saturates to neutral 0xfffcf7 at elev 42).
  // That structure cannot be right in both places at once: it warms the SHADE as well, which is why
  // the L30-70 band reads B-R -10..+5 against the Earth crops' +17..+29 and the shaded Amsterdam
  // walk renders olive. LB14 splits it in three, neutralises the hue and puts the warmth back in the
  // SUN (sky.js PRESETS.day.sunW), so a frame can read R>B in sun and B>R in shade at the same time.
  //   lb14StCal  road (0/11/12) + terrain filler (7)      — luminance held at the r13 value
  //   lb14Walk   sidewalk (1)                             — neutral, and DARKER (see below)
  //   lb14Paint  thermoplastic (3/4), scaled by intact film coverage
  //   lb14Gao    how much of the baked city AO the GROUND plane takes back (RF13 exempted it)
  // All four are live-tunable from a measurement session through window.__ENV, all four lerp to the
  // r13 value at night, and `?lb14=0` restores the r13 row exactly.
  lb14StCal: { value: new THREE.Vector3(1.94, 1.70, 1.47) },
  lb14Walk: { value: new THREE.Vector3(1.94, 1.70, 1.47) },
  lb14Paint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
  lb14Gao: { value: 0.0 },
  lb14Roof: { value: 0.0 },   // per-roof membrane value spread (0 = r13's single tone)
  lb14Road: { value: 0.0 },   // extra amplitude on the road's aperiodic repair mosaic (0 = r13)
  // FS26: the sky ring, for the shaders that take ENV as their uniforms (the water)
  fogSkyRing: { value: FOG_SKY.ring },
  fogSkyP: { value: FOG_SKY.p },
};
// LB14 — the DAY row of the four knobs above. sky.apply() writes these on `day` and the r13 row
// (LB14_R13) on golden/dusk/night, so every non-day preset stays bit-identical by construction and
// a measurement session can still sweep window.__ENV live between sky.apply() calls.
export const LB14_R13 = { stCal: [1.94, 1.70, 1.47], walk: [1.94, 1.70, 1.47], paint: [1, 1, 1], gao: 0, roof: 0, road: 0 };
export const LB14_DAY = {
  // same luminance (1.7389) as r13, R/B 1.32 -> 1.185 — HALF the neutralisation I first shipped.
  // Sunlit asphalt then reads R/B ~1.30 (Street View measures 1.08-1.27) and the shaded carriageway
  // keeps the value the r14 critic called exactly right; a full neutralisation to 1.08, combined with
  // the bounce cut, took the shaded roadway to linear B/R 7.22 against the reference 2.77.
  stCal: [1.94, 1.70, 1.47],   // LB14c: the r13 road hue — with the neutral fill it lands 68,86,105 vs the pano's 58,79,96
  // the walk has to UNDO its own base albedo, not just scale it: (0.496,0.437,0.261) was fitted in r13
  // to fight a blue ambient and is R/B 1.89 on its own. (1.20,1.33,1.64) -> effective (0.191,0.188,
  // 0.138), R/B 1.385 and 0.75x the r13 luminance: sunlit walk R/B ~1.65 (the reference sunlit
  // concrete, 229,214,192, is 1.49 — deliberately on the warm side of it), shaded walk B > R, and
  // walk-minus-road +26 -> ~+7 luma (measured on amst120N_day: walk L 104 / road L 78, Earth +6..+7).
  walk: [1.02, 1.04, 1.12],    // LB14c: near-neutral, a touch of blue. Sweep4 row D at 1.30: walk L 100 vs road 83 (+17); at 1.18 the c_street plate read 84,101,107 L 98 vs road 79 (+19, greenish) against the pano walk 67,87,105 L 78 — one more step down and bluer
  // thermoplastic never took the street lift at all: m 3/4 fell through every branch of the r13
  // calibration, so intact white film sat at 1.5x the road's effective albedo where a real crossing is
  // 6-7x. Measured on amst120N_day: the lane line is L 92 on an L 72 road, i.e. +20 luma where AgX at
  // that level should give +55-65.
  paint: [2.20, 2.17, 2.13],
  // gao 0 (LB14, after sweep 3): re-enabling the baked city AO on the street plane HALVES a canyon
  // ground's indirect diffuse (caoF = mix(1, cao, 0.85) on a bake value near 0.35, about -1.1 stops —
  // the shaded carriageway fell from L 78 to L 51) and it cannot separate a walk from its roadway
  // anyway: the bake is 2048 px over 29.4 x 40.6 km = 14.3 x 19.8 m per texel. The shader gate stays
  // in (one uniform, live-tunable) but ships OFF; the sidewalk fix rides entirely on `walk` above.
  gao: 0.0,
  roof: 1.0,                   // per-roof membrane value/speckle spread + a wider coating blotch
  road: 0.85,                  // extra amplitude on the (zero-mean) aperiodic repair mosaic
};
export const LB14 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('lb14') === '0');
export function applyLB14Ground(day) {
  const r = LB14 && day ? LB14_DAY : LB14_R13;
  ENV.lb14StCal.value.fromArray(r.stCal);
  ENV.lb14Walk.value.fromArray(r.walk);
  ENV.lb14Paint.value.fromArray(r.paint);
  ENV.lb14Gao.value = r.gao;
  ENV.lb14Roof.value = r.roof;
  ENV.lb14Road.value = r.road;
}
if (typeof location !== 'undefined') {
  const rq = new URLSearchParams(location.search).get('refl');
  if (rq !== null && rq !== '') ENV.reflGain.value = Math.max(0, parseFloat(rq) || 0);
  // LB13: the trim is ON by default and `?lb13=0` restores the round-12 value.
  if (new URLSearchParams(location.search).get('lb13') !== '0') ENV.lbRoof.value = 0.78;
  if (typeof window !== 'undefined') window.__ENV = ENV;   // LB13 debug/A-B handle, same contract as window.__GFX
}
{ // 1x1 white placeholder so the sampler is bindable before the bake loads
  const t = new THREE.DataTexture(new Uint8Array([255, 255]), 1, 1, THREE.RGFormat);
  t.needsUpdate = true;
  ENV.cityAO.value = t;
}
// NM24 (owner 2026-09-24: "building faces sometimes get lost or disappear"). The far LoD (the macro buildings and the
// macro terrain) was discarded inside a fixed circle of 0.82 x NEAR_R round the player as soon as five near tiles
// EXISTED, loading ones included. Wherever a near tile was still being fetched or assembled, neither representation drew,
// so whole blocks and their ground went missing after a teleport or a fast move. Past the circle both drew over the same
// footprints, and the macro box sits up to 8 m off its near twin (its 0.996 shrink is about the macro origin), so facades
// traded places as the circle moved with the camera. Now a NEAR_MASK_N x NEAR_MASK_N mask centred on the player's tile
// marks the near tiles that are READY (streamer.js), and a far fragment is dropped exactly where a ready near tile covers
// it: never both, never neither. ?nmask=0 restores the circle.
export const NEAR_MASK_N = 16;
const NM24 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('nmask') === '0');
const nearMaskTex = new THREE.DataTexture(new Uint8Array(NEAR_MASK_N * NEAR_MASK_N), NEAR_MASK_N, NEAR_MASK_N, THREE.RedFormat, THREE.UnsignedByteType);
nearMaskTex.magFilter = nearMaskTex.minFilter = THREE.NearestFilter;
nearMaskTex.generateMipmaps = false;
nearMaskTex.needsUpdate = true;
export const FAR_UNIFORMS = {
  playerXZ: { value: new THREE.Vector2(0, 0) }, nearR: { value: 0 },
  nearMask: { value: nearMaskTex }, nearMaskO: { value: new THREE.Vector2(-1e5, -1e5) }, nearMaskOn: { value: NM24 ? 1 : 0 },
};
// declared after `playerXZ` and `nearR` in both far shaders (the macro buildings and the ground's far terrain, matId 8)
// and in the label passes' far clip (perception/segRender.js)
export const NEARMASK_GLSL = `
        uniform sampler2D nearMask; uniform vec2 nearMaskO; uniform float nearMaskOn;
        bool farHidden(vec2 xz) {
          if (nearMaskOn < 0.5) return distance(xz, playerXZ) < nearR;
          vec2 t = floor(xz / ${TILE}.0) - nearMaskO;
          if (t.x < 0.0 || t.y < 0.0 || t.x >= ${NEAR_MASK_N}.0 || t.y >= ${NEAR_MASK_N}.0) return false;
          return texture2D(nearMask, (t + 0.5) / ${NEAR_MASK_N}.0).r > 0.5;
        }`;

// Snow-cap any lit material: up-facing fragments whiten with ENV.snow. Uses
// the fully-transformed VIEW-SPACE normal, so it's correct for skinned rigs,
// instanced cars/peds/furniture and static props alike with zero vertex work.
// Composes with an existing onBeforeCompile (tree crowns, etc).
export function applySnowCap(mat, amount = 1) {
  const prev = mat.onBeforeCompile;
  const std = !!mat.isMeshStandardMaterial;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.snowCapA = ENV.snow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float snowCapA;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      {
        float upD = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        float capM = snowCapA * ${amount.toFixed(2)} * smoothstep(0.4, 0.75, upD);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.87, 0.9, 0.94), capM);
        ${std ? 'roughnessFactor = mix(roughnessFactor, 0.62, capM);' : ''}
      }`);
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|snowcap' + amount + std;
  mat.needsUpdate = true;
  return mat;
}

// Light trim for plain MeshStandardMaterial geometry (landmarks, campus kit,
// props). The sun/sky in this scene are hot by design and every custom shader
// trims its albedo to match — the ground by `mix(0.30, 0.88, night)`, the
// facades by their global value calibration. A standard material gets the raw
// light, so a 0.27-albedo granite tread or a limestone wall clipped to pure
// white at noon (Low Library, the plaza steps, the ramp plates). Same curve as
// the ground: 0.30 by day, relaxing to 0.88 at night when lights are dim.
// `scale` may be a number or an [r, g, b] array: props standing ON the street
// pass the ground's warm calibration (1.94, 1.70, 1.47) so they match the flags
// they sit in (street audit round 3 §5) — a flat trim left every prop cooler and
// darker than the pavement.
export function applyLightTrim(mat, scale = 1) {
  const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.ltNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float ltNight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(0.30, 0.88, ltNight) * vec3(${sc.map((v) => v.toFixed(3)).join(', ')});`);
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|lighttrim' + sc.join(',');
  mat.needsUpdate = true;
  return mat;
}

// City-scale AO on any MeshStandardMaterial: samples the baked sky-visibility
// field by world XZ and scales indirect diffuse/specular. Fragments fade to
// full ambient with height above LOCAL TERRAIN (G channel) so towers escape
// their own street's gloom. Composes with existing onBeforeCompile.
export function applyCityAO(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.cityAO = ENV.cityAO;
    sh.uniforms.cityAORect = ENV.cityAORect;
    sh.uniforms.cityAOAmt = ENV.cityAOAmt;
    sh.uniforms.lb14Gao = ENV.lb14Gao;           // LB14 — the STREET plane takes the bake back (day only)
    if (N11) sh.uniforms.caoNight = ENV.night;   // N11 — see the height ramp below
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCAOw; varying vec3 vCAOn;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 caoP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          caoP = instanceMatrix * caoP;
        #endif
        vCAOw = (modelMatrix * caoP).xyz;
        // RF13: the world-space geometric normal, so an UP-facing surface (a roof deck) can skip the bake — the 14 x 20 m
        // cells of a street-level sky-visibility bake drew as blocky dark squares on every membrane (owner 2026-09-16)
        vec3 caoN = objectNormal;
        #ifdef USE_INSTANCING
          caoN = mat3(instanceMatrix) * caoN;
        #endif
        vCAOn = normalize(mat3(modelMatrix) * caoN);
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCAOw; varying vec3 vCAOn;
        uniform sampler2D cityAO; uniform vec4 cityAORect; uniform float cityAOAmt;
        uniform float lb14Gao;   // LB14
        ${N11 ? 'uniform float caoNight;' : ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if (cityAORect.z > 0.0) {
        vec2 caoUV = (vCAOw.xz - cityAORect.xy) * cityAORect.zw;
        vec2 caoS = texture2D(cityAO, caoUV).rg;
        float caoHgt = vCAOw.y - caoS.g * 127.5;      // height above local street
        float cao = mix(caoS.r, 1.0, smoothstep(6.0, 46.0, caoHgt));
        // RF13: roofs and other up-facing decks see the sky — no baked street AO.
        // LB14 (docs/notes/lb14.md): that exemption also fired on the STREET PLANE ITSELF (n.y = 1),
        // so a sidewalk tucked against a 20-storey wall took exactly the same sky fill as the middle
        // of the avenue — which is most of critic r14 #3 (sidewalk 27-52 luma over the road in shade
        // against the Earth crop's +6..+7) and part of why the shade has no depth. The height ramp
        // above already hands a roof its sky back by 46 m, so the exemption only has to start ABOVE
        // the street. lb14Gao is 0 outside the day preset, so golden/dusk/night are bit-identical.
        cao = mix(cao, 1.0, smoothstep(0.55, 0.8, vCAOn.y) * mix(1.0, smoothstep(1.2, 5.0, caoHgt), lb14Gao));
        ${N11 ? `
        // N11 — AFTER DARK THE HEIGHT RAMP RUNS THE WRONG WAY (night-r11.md 1.6).
        // This bake is SKY VISIBILITY, and the ramp above exists because a tower's
        // upper floors see more sky than its canyon floor does — true at noon, and
        // exactly inverted at night, when the ambient is the street lighting and the
        // shopfronts and the sky is the dim half. Left alone it lit a Harlem walk-up
        // uniformly from pavement to cornice, which is most of why a night frame read
        // as an overcast afternoon rather than as night. Above ~4 m the indirect term
        // falls away with height instead of opening up; the sky-glow share that a
        // roof really does keep is the 0.42 floor.
        float caoUp = mix(1.0, 0.42, smoothstep(4.0, 34.0, caoHgt));
        // gated with a smoothstep, not with caoNight raw: the GOLDEN preset carries
        // night 0.05, and a 5 % blend toward a night-only ramp is still a change to a
        // preset this round is not allowed to touch. Below 0.15 this is exactly 0.
        cao = mix(cao, min(cao, caoUp), smoothstep(0.15, 0.60, caoNight));` : ''}
        float caoF = mix(1.0, cao, cityAOAmt);
        reflectedLight.indirectDiffuse *= caoF;
        reflectedLight.indirectSpecular *= mix(0.65, 1.0, caoF);
      }`);
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|cityao' + (N11 ? 'n' : '');
  mat.needsUpdate = true;
  return mat;
}

export function initCityAO() {
  (async () => {
    try {
      const [meta, buf] = await Promise.all([
        (await fetch('textures/cityao.json')).json(),
        (await fetch('textures/cityao.bin')).arrayBuffer(),
      ]);
      const t = new THREE.DataTexture(new Uint8Array(buf), meta.res, meta.res, THREE.RGFormat);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      ENV.cityAO.value = t;
      ENV.cityAORect.value.set(meta.x0, meta.z0, 1 / (meta.x1 - meta.x0), 1 / (meta.z1 - meta.z0));
      console.log('[cityao] loaded', meta.res, 'covering', Math.round(meta.x1 - meta.x0), 'x', Math.round(meta.z1 - meta.z0), 'm');
    } catch (e) { console.warn('[cityao] unavailable (recompile tiles to bake)', e.message); }
  })();
}
// in public/textures/ — GPU-native BC formats, ~4-8x less VRAM than JPG).
// KTX2Loader is ASYNC and needs a renderer for detectSupport, so the bank
// boots as 1px placeholders and main.js calls initGTEX(renderer); every
// onBeforeCompile that captured t_* uniforms registers itself in
// GTEX_UNIFORM_REFS and gets its .value refreshed when the real texture
// lands. Color maps carry sRGB in the container DFD; data maps are linear.
const GTEX_DEFS = [
  ['asC', 'asphalt_col', 1], ['asN', 'asphalt_nrm', 0], ['asR', 'asphalt_rgh', 0], ['asD', 'asphalt_disp', 0],
  ['coC', 'concrete_col', 1], ['coN', 'concrete_nrm', 0],
  ['grC', 'grass_col', 1], ['grN', 'grass_nrm', 0],
  ['pvC', 'paving_col', 1], ['pvN', 'paving_nrm', 0], ['pvR', 'paving_rgh', 0], ['pvD', 'paving_disp', 0],
  ['brN', 'brick_nrm', 0], ['brR', 'brick_rgh', 0],
  ['wA', 'wall_redbrick', 1], ['wB', 'wall_brownbrick', 1], ['wC', 'wall_whitebrick', 1],
  ['wS', 'wall_stone', 1], ['wP', 'wall_plaster', 1],
];
// ?notower=1 — A/B switch for the whole 2026-09-04 skyscraper pass
// (docs/notes/skyscrapers.md): tower geometry in assemble.js, the tower facade
// block below, the far-macro block, and the macro crowns in streamer.js.
export const NO_TOWER_FX = typeof location !== 'undefined' && new URLSearchParams(location.search).get('notower') === '1';

// ?aa=0 restores the pre-2026-09-10 SHADING-ANTIALIASING behaviour for A/B
// measurement (docs/notes/shading-aa-r8.md; tools/tflick.mjs --flags "...&aa=0").
// Same convention as ?gfix=0 / ?zfix=0. Default ON.
export const AAFIX = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('aa') === '0');

// ?mat9=0 restores the pre-round-9 material richness (docs/notes/materials-r9.md §2).
// Round 9's brief A came out of the r8 BLIND pass (facades-r8.md §14: identified 6/6,
// reference preferred 5/6), whose facade tells were "brick one flat hue", "every window
// identical" and "nothing on a roof is stained". Measured against ref_lenox.png with a
// low-frequency metric (§2.2): our brick facades carry 10-17 % sd/mean at the 3-8 m scale
// where the reference carries 28 %. Everything under this flag is either a LOW-frequency
// term (far below Nyquist at any framing, so it cannot alias) or is explicitly faded out
// by the pixel footprint before its feature reaches a pixel — the project's stipple rule.
// Separate from ?aa (shading-aa-r8) and ?fac8 (facades-r8) on purpose: three independent
// A/B switches over the same shader.
export const MAT9 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('mat9') === '0');

// ?u10=0 restores the pre-round-10 UNIFORMITY behaviour (docs/notes/uniformity-r10.md).
// Same r9 blind pass, the OTHER recurring tell: **repeated elements are identical**.
// In this file that flag covers exactly four blocks, all of them per-instance identity
// rather than new material physics, and all four are listed in the notes:
//   1. the storefront FASCIA slot pick (64 slots and a bijection over the shop index,
//      so two shops on one frontage cannot draw the same sign);
//   2. the window SASH: paint state and dirt per building;
//   3. the road-paint branch (m == 3/4): a per-JUNCTION age and a per-BAR coverage,
//      because `age` is an fbm at a ~42 m wavelength — LARGER than a crossing;
//   4. the storefront GLAZING: roll-down grilles, a back wall that is not vertical
//      pastel bars, and a far-field fallback with a shop's vertical profile.
//
// RESTORED 2026-09-11 after a lost update: a concurrent whole-file write (the E10
// edges/grime pass, whose own work is intact) removed all four blocks before the WIP
// commit, so 73da69b never contained them either.
// Kept separate from ?e10 so the two rounds' claims stay independently measurable.
export const U10 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('u10') === '0');

// ?e10=0 restores the pre-round-10 EDGE / CONTACT behaviour (docs/notes/edges-r10.md).
// The r9 blind pass (materials-r9.md §11: identified 6/6, preferred 0/6) named two
// recurring tells, and this flag covers the second one: **perfect edges — there is no
// dirt where two surfaces meet**. Every grime term the r8/r9 shader had is anchored to
// an opening, a wall END or a HEIGHT; none of them is anchored to a JOINT. In a
// photograph of New York almost every dark accent in the frame is a contact: the pack
// of grit in the gutter against the kerb stone, the splash-and-salt zone where the
// sidewalk meets the wall, the tar line where a roof membrane turns up onto its
// parapet, the drip off a fascia, the rust run under a through-wall AC sleeve.
// Same design rules as MAT9: every term here is either LOW-frequency (2-12 m feature
// size, far below Nyquist at any framing) or is anchored to a geometric datum the
// shader already has (v, storeH, bldgH, the new face-height in aux3.z, the roof rim
// attribute), and the two that carry fine structure (gum spots, gutter litter) are
// derivative-faded by the ground shader's own gNear/gMid gates before their feature
// reaches a pixel. Nothing here adds a draw call, a material, a texture or a program.
export const E10 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('e10') === '0');

// ?n11=0 restores the pre-round-11 NIGHT behaviour (docs/notes/night-r11.md). Most of
// that round lives in core/engine.js (the probe floor), world/sky.js (sky glow + the
// night ambient rig), world/weather.js and sim/carlights.js; in THIS file it covers
// exactly one thing — WINDOW OCCUPANCY, which was a day/night constant. `lit` was
// `step(1 - (resi ? 0.20 : 0.42), id3)` at every hour, so a residential block at
// 3 a.m. and the same block at noon had the same one window in five lit, and the
// night frames sat at the bottom of the 30-60 % the brief asks for. The threshold
// now moves with ENV.night in opposite directions for the two uses a building has:
// apartments FILL after dark and offices EMPTY but leave their floor lighting on.
// It is a per-ROOM hash against a uniform — nothing varies per pixel and nothing
// varies per frame — so it is outside the stipple rules and cannot flicker.
// Declared here (not imported from world/night11.js) to match this file's own
// AAFIX / MAT9 / U10 / E10 convention.
export const N11 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('n11') === '0');

// WL11 — ?wl11=0 restores the perfect window lattice (docs/notes/lattice-r11.md).
// Three blind packs in a row identified our facades by the GRID: every bay exactly winW
// wide, every sill exactly at 0.3 of the floor, every sash the same colour, and not one
// opening in the city bricked up. This flag covers, in this file: per-bay width/offset
// jitter, per-window sill and lintel noise, bricked-up openings, replaced sashes, and
// correlated (rather than independently random) blind states.
export const WL11 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('wl11') === '0');

// WL11 — the ONE hash that the facade shader, heroFacades.js and nycDress.js all evaluate
// for the same bay. It exists because `hash12` cannot be replicated across the CPU/GPU
// boundary: it is chaotic, and its inputs there (`wallSeed`, derived from a cumulative
// perimeter float) are not bit-identical in JS and in a float32 GPU lane — so the hero
// ring's appliqué frames would sit a few centimetres off the shader's jittered openings.
// This one is an integer LCG mod a prime, evaluated in floats: every intermediate is an
// exact integer below 2^24, so float32 and float64 return the SAME value. Feed it exact
// small integers only (see `cvI` in the shader / `wlSeed` in the two JS twins).
// The GLSL twin is `wlh()` in the facade shader's <common> block — keep them identical.
// The two SQUARING steps are not decoration. A chain of affine steps mod p is itself one
// affine map, so consecutive bay indices came out as an arithmetic progression — measured
// as a clean ramp of offsets (-1.6, -0.8, -0.1, +0.6, +1.4, +2.1 %, wrap) which on a
// facade is a systematic lean, not jitter. x -> x^2 + c breaks it: lag-1 correlation over
// 40k adjacent bays is 0.0002 and the deciles are flat. Every intermediate stays exactly
// representable: max 4092^2 + 2411 = 16 746 875 < 2^24, which is the whole contract.
export function wlHash(a, b) {
  let s = (a * 127 + b * 311 + 7) % 4093;
  s = (s * s + 1153) % 4093;
  s = (s * 137 + 59) % 4093;
  s = (s * s + 2411) % 4093;
  return s / 4093;
}
// WL11 — signed ±1 convenience (the jitter amplitudes are all symmetric)
export const wlSign = (a, b) => wlHash(a, b) * 2 - 1;

// WB13 — ?wb13=0 restores round-12 behaviour for the two new outer-borough styles
// (docs/notes/wburg-r13.md). In THIS file: the lap-siding branch for
// STYLE.FRAME_HOUSE (14), the rainscreen/spandrel branch for STYLE.CONDO_NEW (15),
// their window proportions, their white trim, and the four style RANGE tests that
// used to read `style > 11.5` — i.e. "anything above PROJECT_BRICK is NYCHA red
// brick". Turning the flag OFF re-opens those ranges, so 14 and 15 render as the
// red-brick walk-up they rendered as in round 12 and the A/B pair differs by the
// typology rather than by an untextured wall. The tile data is the same either way.
export const WB13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('wb13') === '0');

// ------------------------------------------------------ GROUND TONE (r13, GT13)
// docs/notes/ground-r13.md. The round-13 critic ranked "city-wide asphalt" and
// "road/sidewalk/kerb tone inversion" 1 and 7; measured against the Google Earth
// crops on MATCHED, paint-free surfaces the level and the order are already right
// (walk 190/182, road 143/136, walk-minus-road +47/+46 — ours/Earth). What the
// same crops DO show is that our carriageway is a rectangular TILING: the
// mill-and-pave lot field is a fixed 78 x 26 m pitch on the two grid axes, so a
// street running on the short axis gets a new pour every 26 m and a longitudinal
// seam down the middle of its roadway, and the lot-to-lot value range is 3.16x —
// every block face draws its asphalt from a lottery three stops wide, which is the
// real content of "one stretch of road in the whole city has the right asphalt".
// GT13 makes the lot a BLOCK FACE at either orientation (~80 m both ways, joints
// that wander by metres), cuts the neighbour-to-neighbour range to 1.9x with the
// MEAN HELD EXACTLY (so the measured tone does not move), and hands the variance
// it took off the lattice to the aperiodic skin-patch field. `?gt13=0` reverts.
export const GT13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gt13') === '0');

// ------------------------------------------------ GEOMETRIC SPECULAR AA (r8)
// Kaplanyan et al. 2016 "Filtering Distributions of Normals for Shading
// Antialiasing" / Tokuyoshi & Kaplanyan 2019 "Improved Geometric Specular
// Antialiasing": the shading normal is not constant inside a pixel, so treat
// its screen-space variation as an extra NDF lobe and CONVOLVE it into the
// roughness. A specular lobe that no longer resolves at this pixel density then
// widens instead of sparkling.
//
//   sigma^2      = SIGMA2 * (|dN/dx|^2 + |dN/dy|^2)      screen-space variance
//   kernelRough2 = min(2 * sigma^2, KAPPA)               clamped lobe widening
//   rough'       = sqrt(rough^2 + kernelRough2)
//
// SIGMA2 = 0.25 is the pixel reconstruction filter's variance (sigma = 0.5 px).
// KAPPA bounds how much roughness ONE pixel may gain, so a silhouette, a
// normal-map discontinuity or a crease cannot flatten the material to matte —
// it is the knob the "does it look matte in stills?" check tunes.
//
// WHY THIS IS NOT ALREADY COVERED. three's own <lights_physical_fragment> does
// a crude version of this:
//     vec3 dxy = max(abs(dFdx(nonPerturbedNormal)), abs(dFdy(nonPerturbedNormal)));
//     material.roughness += max(max(dxy.x, dxy.y), dxy.z);
// but it reads `nonPerturbedNormal` — the INTERPOLATED GEOMETRIC normal, saved
// before <normal_fragment_maps>. Every normal the ground and facade shaders
// synthesise (mip-averaged PBR normal maps, albedo relief, rain rings, leaf
// grain) is invisible to it, and glitch-r7.md 4.3 measured exactly that detail
// as the residue: 61 % of hot pixels the compiled ground, 24 % the facades, all
// at rms 4-5. This wrapper re-derives the variance from the FINAL shading
// normal, which is in scope and fully perturbed at <lights_physical_fragment>.
export const SPECAA_GLSL = /* glsl */ `
  uniform vec2 uAaK;   // live (sigma2, kappa) MULTIPLIER — see AA_SPEC below
  float specAARough(vec3 nrm, float rough, float sigma2, float kappa) {
    vec3 ndx = dFdx(nrm), ndy = dFdy(nrm);
    float variance = sigma2 * uAaK.x * (dot(ndx, ndx) + dot(ndy, ndy));
    float kernel = min(2.0 * variance, kappa * uAaK.y);
    return min(sqrt(rough * rough + kernel), 1.0);
  }
`;
// ONE shared multiplier for every specular-AA program, so the effect can be
// isolated and tuned live with no rebuild — which is what makes the A/B
// attribution in docs/notes/shading-aa-r8.md possible in a single boot:
//   tflick --eval "window.__AA_SPEC.value.set(0, 0)"   specular AA OFF only
//   tflick --eval "window.__AA_SPEC.value.set(1, 2)"   kappa doubled (matte check)
export const AA_SPEC = { value: new THREE.Vector2(1, 1) };
if (typeof window !== 'undefined') window.__AA_SPEC = AA_SPEC;
// Composes with an existing onBeforeCompile. Hooks the LAST point at which the
// shading normal is final and `roughnessFactor` has not been consumed yet, and
// PREPENDS to the include so a material that appends to the same chunk (the
// ground's `material.specularColor *= GND_spec`) composes either way round.
// `clearcoat` also widens clearcoatRoughness (car paint: the 0.06 clearcoat
// lobe is the one that sparkles, not the 0.30 base).
export function applySpecAA(mat, o = {}) {
  // `__specAA` means "already considered", set even when the flag is off, so
  // per-frame callers (vehicleCull's `_finish`, which has to catch async fleet
  // material swaps) stay a single property test under ?aa=0 too.
  if (!mat || mat.__specAA) return mat;
  mat.__specAA = true;
  if (!AAFIX) return mat;
  const sigma2 = (o.sigma2 ?? 0.25).toFixed(4);
  const kappa = (o.kappa ?? 0.18).toFixed(4);
  const cc = !!o.clearcoat;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (sh.fragmentShader.indexOf('specAARough') >= 0) return;
    sh.uniforms.uAaK = AA_SPEC;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SPECAA_GLSL)
      // `clearcoatRoughness` is a UNIFORM (read-only), and the clearcoat lobe
      // shades off `clearcoatNormal`, not `normal` — so that half has to be
      // done on `material.*` AFTER the include.
      .replace('#include <lights_physical_fragment>', `roughnessFactor = specAARough(normal, roughnessFactor, ${sigma2}, ${kappa});
        #include <lights_physical_fragment>
        ${cc ? `#ifdef USE_CLEARCOAT
        material.clearcoatRoughness = specAARough(clearcoatNormal, material.clearcoatRoughness, ${sigma2}, ${kappa});
        #endif` : ''}`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|specaa' + sigma2 + kappa + (cc ? 'c' : '');
  mat.__specAA = true;
  mat.needsUpdate = true;
  return mat;
}

export const GTEX = {};
export const GTEX_UNIFORM_REFS = []; // sh.uniforms objects holding t_* slots
if (typeof document !== 'undefined') {
  for (const [k, , srgb] of GTEX_DEFS) {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    GTEX[k] = t;
  }
}

// ------------------------------------------------------------------ CT25 STONE DETAIL
// (owner 2026-09-25: the trailer's first shot, Columbia's College Walk, "feels really flat and low quality".) The campus
// kit and the campus landmarks were plain single-colour MeshStandardMaterials, so a 60 m granite stair, the Low Plaza
// panels and Low Library's limestone were each one flat value. This gives such a material a real stone surface: colour
// variation, micro-relief normals and roughness from a photographed CC0 set (Poly Haven; tools/assets/encode_stone.mjs),
// projected TRIPLANAR in the campus frame (the Manhattan grid, 29 deg off true north), so it needs no UVs and the
// texture runs square to the steps and walks. The colour term is the texture divided by its own linear mean: a material
// keeps its calibrated value on average (applyLightTrim, the critic-round palette) and takes only the variation.
// `?ct25=0` leaves the materials flat.
export const CT25 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ct25') === '0');
export const CT26 = CT25 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ct26') === '0');
const STONE_SETS = {
  cgranite:   { mean: [0.3769, 0.2992, 0.1664], size: 2.17 },   // stone_wall_03: speckled, jointless (steps, walls, rims)
  climestone: { mean: [0.3772, 0.2890, 0.1764], size: 3.00 },   // sandstone_blocks_08: ashlar coursing (Low Library)
  cpave:      { mean: [0.0928, 0.0947, 0.0888], size: 3.00 },   // concrete_floor_worn_001: worn slab (plaza panels)
};
const STONE_AXIS = new THREE.Vector2(0.885, 0.465);   // campus east in world xz (x east, z south); north = (0.465, -0.885)
const _stone = {};      // set -> { col, nrm, rgh } uniform objects, filled when the textures land
let _stoneLoader = null;
function stoneUniforms(name) {
  if (_stone[name]) return _stone[name];
  const px = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
  const S = STONE_SETS[name];
  const u = _stone[name] = {
    col: { value: px(255, 255, 255) }, nrm: { value: px(128, 128, 255) }, rgh: { value: px(200, 200, 200) },
    mean: { value: new THREE.Vector3(1, 1, 1) }, ready: false,
  };
  u._S = S;
  if (_stoneLoader) _stoneLoader(name, u);
  return u;
}
// called from initGTEX once the KTX2 loader exists
function stoneLoaderReady(loader, tl) {
  _stoneLoader = (name, u) => {
    for (const [k, suf, srgb] of [['col', 'col', true], ['nrm', 'nrm', false], ['rgh', 'rgh', false]]) {
      const install = (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = srgb ? 16 : 8;
        u[k].value = t;
        if (k === 'col') u.mean.value.set(...u._S.mean);   // the ratio uses the mean only once the real texture is in
      };
      loader.load(`textures/${name}_${suf}.ktx2`, install, undefined, () => {
        const t = tl.load(`textures/${name}_${suf}.jpg`); if (srgb) t.colorSpace = THREE.SRGBColorSpace; install(t);
      });
    }
  };
  for (const [name, u] of Object.entries(_stone)) _stoneLoader(name, u);
}
// o: { amt (colour variation 0..1), nrm (normal strength 0..1), rgh (roughness blend 0..1), scale (x the set size) }
export function applyStoneDetail(mat, name, o = {}) {
  if (!CT25 || !STONE_SETS[name] || !mat || mat.userData.stoneDetail) return mat;
  const S = STONE_SETS[name], U = stoneUniforms(name);
  const amt = o.amt ?? 0.85, nAmt = o.nrm ?? 0.8, rAmt = o.rgh ?? 0.5, size = S.size * (o.scale ?? 1);
  // CT26 (`?ct26=0` off): ashlar block tone + weathering for dressed stone walls (o.ashlar = strength, 1 = full)
  const ashlarK = CT26 ? +(o.ashlar || 0) : 0, ashlar = ashlarK > 0;
  const prev = mat.onBeforeCompile;
  mat.userData.stoneDetail = name;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.stCol = U.col; sh.uniforms.stNrm = U.nrm; sh.uniforms.stRgh = U.rgh; sh.uniforms.stMean = U.mean;
    sh.uniforms.stAxis = { value: STONE_AXIS };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStW; varying vec3 vStN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 stP = vec4( transformed, 1.0 );
          vec3 stN = objectNormal;
          #ifdef USE_INSTANCING
            stP = instanceMatrix * stP; stN = mat3( instanceMatrix ) * stN;
          #endif
          vStW = ( modelMatrix * stP ).xyz;
          vStN = mat3( modelMatrix ) * stN;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D stCol; uniform sampler2D stNrm; uniform sampler2D stRgh; uniform vec3 stMean; uniform vec2 stAxis;
        varying vec3 vStW; varying vec3 vStN;
        vec3 stF( vec3 w ) { return vec3( dot( w.xz, stAxis ), w.y, dot( w.xz, vec2( -stAxis.y, stAxis.x ) ) ); }
        vec3 stFi( vec3 f ) { vec2 e = stAxis, n = vec2( -stAxis.y, stAxis.x ); return vec3( e.x * f.x + n.x * f.z, f.y, e.y * f.x + n.y * f.z ); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 stP3 = stF( vStW ) / ${size.toFixed(3)};
        vec3 stN3 = normalize( stF( normalize( vStN ) ) );
        vec3 stWt = pow( abs( stN3 ), vec3( 4.0 ) ); stWt /= max( stWt.x + stWt.y + stWt.z, 1e-4 );
        vec2 stUx = stP3.zy, stUy = stP3.xz, stUz = stP3.xy;
        {
          vec3 c = texture2D( stCol, stUx ).rgb * stWt.x + texture2D( stCol, stUy ).rgb * stWt.y + texture2D( stCol, stUz ).rgb * stWt.z;
          diffuseColor.rgb *= mix( vec3( 1.0 ), clamp( c / max( stMean, vec3( 1e-3 ) ), vec3( 0.35 ), vec3( 1.9 ) ), ${amt.toFixed(3)} );
        }${ashlar ? `
        {
          // CT26 ashlar: what survives distance once the detail maps have mipped to their mean. Each block its own shade
          // (0.62 m courses of 1.24 m blocks, staggered), darker joints, broad weathering, and on walls rain streaks
          // that darken downward from every course
          vec3 f = stF( vStW ); vec3 an = abs( stN3 );
          vec2 bq = an.y > max( an.x, an.z ) ? f.xz : ( an.x > an.z ? f.zy : f.xy );
          float crs = floor( bq.y / 0.62 );
          float bx = floor( ( bq.x + mod( crs, 2.0 ) * 0.62 ) / 1.24 );
          float bh = fract( sin( dot( vec2( bx, crs ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
          vec2 inb = vec2( fract( ( bq.x + mod( crs, 2.0 ) * 0.62 ) / 1.24 ) * 1.24, fract( bq.y / 0.62 ) * 0.62 );
          float jn = 1.0 - smoothstep( 0.0, 0.012, min( min( inb.x, 1.24 - inb.x ), min( inb.y, 0.62 - inb.y ) ) );
          float pw = sin( f.x * 0.23 + f.y * 0.11 ) * sin( f.z * 0.19 - f.y * 0.07 + 1.7 ) * 0.5 + 0.5;       // broad patches
          float wall = smoothstep( 0.6, 0.9, 1.0 - an.y );
          float stk = fract( sin( floor( bq.x * 2.3 ) * 91.7 ) * 4375.85 );                                  // streak columns
          float streak = wall * smoothstep( 0.55, 0.95, stk ) * ( 1.0 - fract( bq.y / 0.62 ) ) * 0.6;
          float tone = 1.0 + ( bh - 0.5 ) * ${(0.11 * ashlarK).toFixed(3)} - ( pw - 0.5 ) * ${(0.12 * ashlarK).toFixed(3)} - streak * ${(0.10 * ashlarK).toFixed(3)} - jn * ${(0.16 * ashlarK).toFixed(3)};
          diffuseColor.rgb *= tone;
          diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.02, 1.0, 0.965 ), ( bh - 0.5 ) * 2.0 * ${(0.5 * ashlarK).toFixed(3)} );   // warm / cool stones
        }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          float rt = texture2D( stRgh, stUx ).g * stWt.x + texture2D( stRgh, stUy ).g * stWt.y + texture2D( stRgh, stUz ).g * stWt.z;
          roughnessFactor = clamp( mix( roughnessFactor, rt, ${rAmt.toFixed(3)} ), 0.08, 1.0 );
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // whiteout-blended triplanar normal map in the campus frame, back to world, then to view space
          vec3 tx = texture2D( stNrm, stUx ).xyz * 2.0 - 1.0, ty = texture2D( stNrm, stUy ).xyz * 2.0 - 1.0, tz = texture2D( stNrm, stUz ).xyz * 2.0 - 1.0;
          vec3 n3 = stN3;
          tx = vec3( tx.xy + n3.zy, abs( tx.z ) * n3.x );
          ty = vec3( ty.xy + n3.xz, abs( ty.z ) * n3.y );
          tz = vec3( tz.xy + n3.xy, abs( tz.z ) * n3.z );
          vec3 pn = normalize( tx.zyx * stWt.x + ty.xzy * stWt.y + tz.xyz * stWt.z );
          vec3 vn = normalize( ( viewMatrix * vec4( stFi( pn ), 0.0 ) ).xyz );
          normal = normalize( mix( normal, vn * sign( dot( vn, normal ) + 1e-4 ), ${nAmt.toFixed(3)} ) );
        }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + `|ct25${name}${amt}${nAmt}${rAmt}${size}${ashlar ? '|a' + ashlarK : ''}`;
  mat.needsUpdate = true;
  return mat;
}

export function initGTEX(renderer) {
  (async () => {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    const loader = new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer);
    const tl = new THREE.TextureLoader();
    stoneLoaderReady(loader, tl);   // CT25
    const install = (k, t, srgb) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      // r8 (?aa=0 -> 8 on everything). A street plane at a 3 m eye is the most
      // extreme minification anisotropy in the frame: at 40 m one pixel spans
      // ~0.4 m ALONG the view and ~0.02 m across it, a 20:1 footprint against
      // 8:1 filtering. glitch-r7.md 2.6 lists `aniso16` as one of the two
      // unrun experiments; running it splits into two OPPOSITE answers and the
      // split is the point:
      //   * COLOUR maps (srgb): sharper filtering is a pure win. Colour
      //     aliasing is what mips and anisotropy exist to fix, and colour does
      //     not drive a specular lobe. -> 16.
      //   * NORMAL / roughness / displacement maps (data): anisotropy is the
      //     CORRECT filter and therefore the WRONG thing here — it retains the
      //     short-axis high frequency, and on a normal map that frequency goes
      //     straight into a specular that has one sample per pixel to resolve
      //     it with. Sharper normals at grazing incidence is more sparkle, not
      //     less. -> left at 8, and `applySpecAA` handles what survives.
      t.anisotropy = (AAFIX && srgb) ? 16 : 8;
      GTEX[k] = t;
      const un = 't_' + k;
      for (const u of GTEX_UNIFORM_REFS) if (u[un]) u[un].value = t;
    };
    for (const [k, name, srgb] of GTEX_DEFS) {
      loader.load('textures/' + name + '.ktx2', (t) => install(k, t, srgb), undefined, () => {
        // fallback: uncompressed jpg (dev before encoding / exotic GPU)
        const t = tl.load('textures/' + name + '.jpg');
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        install(k, t, srgb);
        console.warn('[gtex] ktx2 missing, jpg fallback:', name);
      });
    }
  })();
}

const TEX_GLSL = /* glsl */ `
  vec2 rot2(vec2 p, float a) { float c = cos(a), sn = sin(a); return vec2(c * p.x - sn * p.y, sn * p.x + c * p.y); }
  // anti-tiled lookup: two rotated/offset taps blended by a low-frequency mask
  vec4 atex(sampler2D t, vec2 uv, float mk) {
    return mix(texture2D(t, uv), texture2D(t, rot2(uv, 2.03) + vec2(0.37, 0.71)), mk);
  }
`;

const HASH_GLSL = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { return vnoise(p) * 0.6 + vnoise(p * 2.7) * 0.25 + vnoise(p * 7.1) * 0.15; }
  // box-filtered pulse train: exact mean of the [lo,hi) indicator (period 1) over a
  // pixel footprint w centered at x — converges to (hi-lo) at any minification.
  float pcovI(float x, float lo, float hi) { return floor(x) * (hi - lo) + clamp(fract(x) - lo, 0.0, hi - lo); }
  float pcov(float x, float lo, float hi, float w) {
    w = max(w, 1e-5);
    return clamp((pcovI(x + 0.5 * w, lo, hi) - pcovI(x - 0.5 * w, lo, hi)) / w, 0.0, 1.0);
  }
`;

// ------------------------------------------------------- ANALYTIC SKY MIRROR
// docs/notes/facades-r6.md §0. What a real glass facade does, in the three
// terms that survive from 5 m to 2 km, none of them per-pane so minification
// cannot kill any of them:
//
//   1. a SKY GRADIENT along the reflection vector: pale zenith, a brighter and
//      warmer horizon band (the haze layer, which is where a vertical wall's
//      reflection vector actually points), and the CITY below the horizon —
//      dark. That last one is why a real tower is bright at the top and nearly
//      black at the bottom of the same sheet of glass.
//   2. the SOLAR AUREOLE: a broad glow around the sun, which is what makes the
//      sun side of an avenue hot and the shade side near-black without any
//      non-physical N.L term.
//   3. the SUN DISC: a tight lobe that clips to white and blooms. Its exponent
//      is widened by the pixel footprint (specular-AA) and its peak clamped,
//      or sub-pixel mirrors strobe — the same rule as every other high
//      frequency in this project.
//
// Fed from ENV (sunDir/sunColor/skyAmbient/fogColor), so it tracks time of day,
// HDRI relighting and weather for free. `gain` is ENV.reflGain.
const SKYREFL_GLSL = /* glsl */ `
  // radiance seen along reflection direction R
  vec3 skyLook(vec3 R, vec3 sunD, vec3 sunC, vec3 zenC, vec3 horC, float gain, float aur) {
    float up = clamp(R.y, -1.0, 1.0);
    vec3 zen = zenC * (1.95 * gain);
    vec3 hor = horC * (2.55 * gain);
    // below the horizon a wall mirrors the CITY, which is dark but not black
    // and warm (sunlit masonry and asphalt, not sky). Measured against
    // crownClose: at 0.20 * horC every tower face above the camera went to
    // near-black because from 170 m most reflection vectors point down.
    vec3 gnd = horC * vec3(0.45, 0.40, 0.34) * gain;
    vec3 c = up >= 0.0 ? mix(hor, zen, pow(up, 0.42))
                       : mix(hor, gnd, pow(-up, 0.55));
    float mu = max(dot(R, sunD), 0.0);
    c += sunC * (aur * gain) * pow(mu, 7.0);               // aureole
    return c;
  }
  // Schlick, with the grazing tail kept honest at large pixel footprints
  float fresnelR(float cosT, float f0) {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
  }
  // tight solar disc with specular-AA: fp = max(fwidth) of the surface param
  float sunDisc(vec3 R, vec3 sunD, float rough, float fp) {
    float e = (2.0 / max(rough * rough, 1e-4)) / (1.0 + fp * 220.0);
    return min(pow(max(dot(R, sunD), 0.0), clamp(e, 12.0, 4000.0)), 6.0);
  }
`;
export const SKYREFL_CHUNK = SKYREFL_GLSL;

// Uniform block every sky-mirror shader needs. Kept in one place so the facade,
// the far macro and the landmark helpers cannot drift apart.
function skyReflUniforms(sh) {
  sh.uniforms.uRefl = ENV.reflGain;
  sh.uniforms.uSunD = ENV.sunDir;
  sh.uniforms.uSunC = ENV.sunColor;
  sh.uniforms.uZenC = ENV.skyAmbient;
  sh.uniforms.uHorC = ENV.fogColor;
}
const SKYREFL_PARS = /* glsl */ `
  uniform float uRefl; uniform vec3 uSunD; uniform vec3 uSunC; uniform vec3 uZenC; uniform vec3 uHorC;`;

/* --------------------------------------------------------------------------
   applySkyGlass(mat, o) — give a plain MeshStandardMaterial (landmark curtain
   walls: One Vanderbilt, 432 Park, One WTC, Central Park Tower, Hearst...) the
   same analytic mirror the 930k shader facades get. `applyLightTrim` has
   already crushed these materials' diffuse to 30 % by day, which is right for
   stone and fatal for glass: a curtain wall is ~5 % diffuse and 10-30 %
   MIRROR, and the mirror was coming from an IBL at 0.14. Composes with an
   existing onBeforeCompile.
     f0     Fresnel reflectance at normal incidence (0.06 clear .. 0.30 coated)
     tint   reflection tint (bronze glass mirrors warm, blue-green cool)
     rough  plate roughness for the sun disc (0.03 mirror .. 0.12 fritted)
   -------------------------------------------------------------------------- */
export function applySkyGlass(mat, o = {}) {
  const f0 = o.f0 ?? 0.14, rough = o.rough ?? 0.05, aur = o.aureole ?? 1.5;
  const tint = o.tint || [1, 1, 1], mull = o.mullion ?? 0;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    skyReflUniforms(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSGw;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSGw = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSGw;${SKYREFL_PARS}
        ${SKYREFL_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 Ng = normalize(cross(dFdx(vSGw), dFdy(vSGw)));
        vec3 Vg = normalize(cameraPosition - vSGw);
        if (dot(Ng, Vg) < 0.0) Ng = -Ng;
        vec3 Rg = reflect(-Vg, Ng);
        float fp = length(fwidth(vSGw)) * 0.05;
        float F = fresnelR(max(dot(Vg, Ng), 0.0), ${f0.toFixed(3)});
        vec3 tn = vec3(${tint.map((v) => v.toFixed(3)).join(', ')});
        vec3 refl = skyLook(Rg, uSunD, uSunC, uZenC, uHorC, uRefl, ${aur.toFixed(2)}) * tn * F;
        refl += uSunC * tn * sunDisc(Rg, uSunD, ${rough.toFixed(3)}, fp) * F * 14.0 * uRefl;
        ${mull ? `// spandrel/mullion banding so a landmark slab is not one sheet
        float fb = vSGw.y / 3.9; float aaFb = max(fwidth(fb), 1e-4);
        float band = mix(1.0, 0.34 + 0.72 * pcovSG(fb, 0.26, 0.95, aaFb * 1.25), smoothstep(1.1, 0.25, aaFb));
        refl *= band; diffuseColor.rgb *= mix(1.0, band, 0.6);` : ''}
        totalEmissiveRadiance += refl;
        roughnessFactor = min(roughnessFactor, ${Math.max(rough, 0.04).toFixed(3)});
      }`);
    if (mull) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        float pcovISG(float x, float lo, float hi) { return floor(x) * (hi - lo) + clamp(fract(x) - lo, 0.0, hi - lo); }
        float pcovSG(float x, float lo, float hi, float w) { w = max(w, 1e-5);
          return clamp((pcovISG(x + 0.5 * w, lo, hi) - pcovISG(x - 0.5 * w, lo, hi)) / w, 0.0, 1.0); }`);
    }
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|skyglass' + f0 + rough + aur + tint.join(',') + mull;
  mat.needsUpdate = true;
  return mat;
}

/* --------------------------------------------------------------------------
   applySkyMetal(mat, o) — brushed / polished architectural metal. The Chrysler
   Building's crown is the mirror-bright Nirosta (18-8 chrome-nickel) object in
   New York and it rendered MATTE WHITE (critic r5 #2). Two reasons: the IBL at
   0.14, and `applyLightTrim` multiplying diffuseColor at <color_fragment> —
   which is BEFORE <lights_physical_fragment> derives
   specularColor = mix(0.04, diffuse, metalness), so the day trim crushes a
   metal's MIRROR colour to 30 % as well as its (nonexistent) diffuse.
   This puts a real metal reflection back on top, anisotropically smeared along
   the brush direction (vertical for a spire, radial for a crown tier).
     tint    metal reflectance colour (steel 0.86/0.88/0.91, brass 0.83/0.68/0.42)
     rough   0.04 polished .. 0.30 heavily brushed
     brush   0 = isotropic, 1 = smear the highlight vertically (rolled sheet)
   -------------------------------------------------------------------------- */
export function applySkyMetal(mat, o = {}) {
  const tint = o.tint || [0.86, 0.88, 0.91], rough = o.rough ?? 0.12;
  const brush = o.brush ?? 0.7, gain = o.gain ?? 1.0;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    skyReflUniforms(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSMw;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSMw = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSMw;${SKYREFL_PARS}
        ${SKYREFL_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 Nm = normalize(cross(dFdx(vSMw), dFdy(vSMw)));
        vec3 Vm = normalize(cameraPosition - vSMw);
        if (dot(Nm, Vm) < 0.0) Nm = -Nm;
        vec3 Rm = reflect(-Vm, Nm);
        // brushed sheet: pull the reflection vector toward the horizontal
        // plane so the highlight smears in a band, the way rolled stainless
        // does on a spire — this is the read that says "metal" at 600 m
        Rm = normalize(mix(Rm, normalize(vec3(Rm.x, Rm.y * 0.42, Rm.z)), ${brush.toFixed(2)}));
        float fp = length(fwidth(vSMw)) * 0.05;
        vec3 tn = vec3(${tint.map((v) => v.toFixed(3)).join(', ')});
        // a metal has no F0 dielectric tail: reflectance is the tint, near flat
        float F = mix(1.0, 1.0 + 0.6 * pow(1.0 - max(dot(Vm, Nm), 0.0), 5.0), 0.8);
        vec3 refl = skyLook(Rm, uSunD, uSunC, uZenC, uHorC, uRefl, 2.2) * tn * F * ${gain.toFixed(2)};
        refl += uSunC * tn * sunDisc(Rm, uSunD, ${rough.toFixed(3)}, fp) * 10.0 * uRefl * ${gain.toFixed(2)};
        totalEmissiveRadiance += refl;
        roughnessFactor = min(roughnessFactor, ${Math.max(rough, 0.04).toFixed(3)});
      }`);
  };
  mat.customProgramCacheKey = () => (prev ? String(prev) : '') + '|skymetal' + tint.join(',') + rough + brush + gain;
  mat.needsUpdate = true;
  return mat;
}

// ------------------------------------------------------------------ FACADES
// MeshStandardMaterial + injected procedural facade logic:
// windows from real floor count/width, party-wall blanking, storefronts,
// grime-driven glass roughness (PR #33906 technique), night interiors.
// Per-building hide mask: a 256x256 R8 texture indexed by the building's index
// within its tile (attribute aBid). The NYC dresser (nycDress.js) sets a texel
// to 255 when it has rebuilt that building with real geometry, and the shader
// facade for that building is discarded — the two never z-fight or double up.
let _nullHide = null;
function nullHideTex() {
  if (!_nullHide) {
    _nullHide = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
    _nullHide.needsUpdate = true;
  }
  return _nullHide;
}
export function makeHideTexture() {
  const t = new THREE.DataTexture(new Uint8Array(256 * 256), 256, 256, THREE.RedFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
// one facade material per near tile: same shader program, own hide texture
export function makeTileFacadeMaterial() {
  const hideTex = makeHideTexture();
  const m = makeFacadeMaterial({ hideTex });
  m.userData.hideTex = hideTex;
  return m;
}

export function makeFacadeMaterial({ hideTex = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0,
  });
  mat.userData.isFacade = true;
  const FACDEBUG = typeof location !== 'undefined' ? parseInt(new URLSearchParams(location.search).get('facdebug') || '0') : 0;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHide = { value: hideTex || nullHideTex() };
    sh.uniforms.night = ENV.night;
    sh.uniforms.wet = ENV.wet;
    sh.uniforms.snowA = ENV.snow;
    sh.uniforms.uTimeF = ENV.time;
    sh.uniforms.t_sgn = { value: fasciaTexture() || nullHideTex() };
    sh.uniforms.t_brN = { value: GTEX.brN };
    sh.uniforms.t_brR = { value: GTEX.brR };
    sh.uniforms.sunDirW = ENV.sunDir;
    sh.uniforms.sunColW = ENV.sunColor;
    sh.uniforms.lbRoof = ENV.lbRoof;   // LB13
    sh.uniforms.lb14Roof = ENV.lb14Roof;   // LB14 — per-roof membrane value + speckle-scale spread (day only)
    skyReflUniforms(sh);
    for (const k of ['wA', 'wB', 'wC', 'wS', 'wP']) sh.uniforms['t_' + k] = { value: GTEX[k] };
    GTEX_UNIFORM_REFS.push(sh.uniforms); // async KTX2 arrivals refresh these
    sh.defines = sh.defines || {};
    if (FACDEBUG) sh.defines.FACDEBUG = FACDEBUG;
    if (!NO_TOWER_FX) sh.defines.TOWERFX = 1;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aux; attribute vec4 aux2; attribute vec3 aux3; attribute float aBid;
        uniform sampler2D uHide; flat varying float vHide;
        varying vec2 vFUv; flat varying vec4 vAux; flat varying vec4 vAux2; flat varying vec3 vAux3; varying vec3 vWP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFUv = uv; vAux = aux; vAux2 = aux2; vAux3 = aux3;
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vHide = texture2D(uHide, vec2((mod(aBid, 256.0) + 0.5) / 256.0, (floor(aBid / 256.0) + 0.5) / 256.0)).r;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        flat varying float vHide;
        uniform float night; uniform float wet; uniform float snowA; uniform float uTimeF;
        uniform sampler2D t_brN; uniform sampler2D t_brR; uniform sampler2D t_sgn;
        uniform sampler2D t_wA; uniform sampler2D t_wB; uniform sampler2D t_wC; uniform sampler2D t_wS; uniform sampler2D t_wP;
        uniform vec3 sunDirW; uniform vec3 sunColW;
        uniform float lbRoof;   // LB13 — silver-membrane albedo trim (docs/notes/light-r13.md)
        uniform float lb14Roof; // LB14 — per-roof membrane value + speckle-scale spread (docs/notes/lb14.md)
        // per-building/per-wall constants MUST interpolate flat: perspective-correct
        // interpolation of equal vertex values wobbles by ~1 ulp per pixel, and a hash
        // amplifies that wobble on large seeds (cvar*511, wallSeed*53...) into per-pixel
        // white noise — this was THE window-stipple root cause (proven via facdebug=6)
        varying vec2 vFUv; flat varying vec4 vAux; flat varying vec4 vAux2; flat varying vec3 vAux3; varying vec3 vWP;
        ${SKYREFL_PARS}
        ${HASH_GLSL}
        ${WL11 ? `
        // WL11 — the GLSL twin of \`wlHash\` (exported above). Integer LCG mod a prime:
        // every intermediate is an exact integer below 2^24, so this lane and the JS in
        // heroFacades.js / nycDress.js return the same value bit for bit, which is what
        // lets the hero ring's appliqué frames land on the shader's jittered openings.
        // Feed it exact small integers only. Do not "simplify" it into hash12.
        // the two SQUARINGS break the affine chain: without them consecutive bays get an
        // arithmetic progression of offsets, i.e. a systematic lean instead of jitter.
        // max intermediate 4092^2 + 2411 = 16 746 875 < 2^24, so every step is exact.
        float wlh(float a, float b) {
          float s = mod(a * 127.0 + b * 311.0 + 7.0, 4093.0);
          s = mod(s * s + 1153.0, 4093.0);
          s = mod(s * 137.0 + 59.0, 4093.0);
          s = mod(s * s + 2411.0, 4093.0);
          return s * (1.0 / 4093.0);
        }
        float wlsg(float a, float b) { return wlh(a, b) * 2.0 - 1.0; }` : ''}
        ${SKYREFL_GLSL}
        vec3 FAC_emis; float FAC_rough; vec3 FAC_nrmAdj; float FAC_dbg; vec3 FAC_dbgV;
        // per-building reflectivity FAMILY, set once in the tower block and
        // read by the glass paths: x = F0, y = plate roughness, z = aureole
        vec3 FAC_glassF; vec3 FAC_reflTint; float FAC_spand;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        if (vHide > 0.5) discard;   // building rebuilt by the NYC dresser
        FAC_emis = vec3(0.0); FAC_rough = 0.92; FAC_nrmAdj = vec3(0.0); FAC_dbg = 0.0; FAC_dbgV = vec3(0.0); FAC_spand = 0.0;
        float floorH = vAux.x, winW = vAux.y, storeH = vAux.z, style = vAux.w;
        float bldgH = vAux2.x, litAmt = vAux2.y, flags = vAux2.w;
        // seed snapped to a coarse grid: belt-and-suspenders for any geometry path
        // where the flat qualifier can't guarantee bit-stability
        float cvar = floor(vAux2.z * 1024.0 + 0.5) * (1.0 / 1024.0);
        bool cornice = mod(flags, 2.0) >= 1.0;
        bool blind = mod(floor(flags / 2.0), 2.0) >= 1.0;
        bool isRoof = mod(floor(flags / 4.0), 2.0) >= 1.0;
        bool store = mod(floor(flags / 8.0), 2.0) >= 1.0;
        // ---- SKYSCRAPER PASS (docs/notes/skyscrapers.md, world/towers.js) ----
        // bit 16: mechanical penthouse / crown screen wall (louvred metal, lit
        // at night). bit 32: crown surface — with bit 16 it is the aviation
        // obstruction light on a mast tip, without it a floodlit masonry crown
        // tier (parapets, setback steps, pylons).
        bool mech = mod(floor(flags / 16.0), 2.0) >= 1.0;
        bool crownF = mod(floor(flags / 32.0), 2.0) >= 1.0;
        bool avLight = mech && crownF;
        // ---- WB13 (docs/notes/wburg-r13.md): the two outer-borough styles.
        // 14 FRAME_HOUSE — vinyl/aluminium lap siding over a frame or re-clad
        // masonry house, 2-3 storeys, flat roof, boxed cornice, white trim.
        // 15 CONDO_NEW  — the post-2000 4-9 floor condo: big openings, panel and
        // thin-set brick, slab edges, roof deck.
        // With ?wb13=0 both stay false and the (re-opened) \`style > 11.5\` tests
        // below put them back on NYCHA red brick, which is the round-12 look.
        bool sidingS = ${WB13 ? 'style > 13.5 && style < 14.5' : 'false'};
        bool condoS  = ${WB13 ? 'style > 14.5 && style < 15.5' : 'false'};
        // ---- E10 (edges-r10 §2): bit 64 says "this prism knows its OWN height, in
        // metres, in aux3.z" and bit 128 says "and it is the roof-side face of it".
        // aux3.z is the door pack on a windowed wall and unused (0) on every blind and
        // mech prism in the city, so this costs no attribute and no draw call — it is
        // the one datum a parapet or a bulkhead needs to place a contact: v alone is
        // height above the BUILDING base, and a parapet's own foot is where the roof
        // membrane turns up onto it, 60 m higher.
        float faceH = mod(floor(flags / 64.0), 2.0) >= 1.0 ? vAux3.z : 0.0;
        bool faceIn = mod(floor(flags / 128.0), 2.0) >= 1.0;
        vec3 albedo = diffuseColor.rgb * (0.92 + 0.16 * cvar);
        float u = vFUv.x, v = vFUv.y;
        // ---- REFLECTIVITY FAMILIES (facades-r6 §1). classify.mjs hands out
        // pastel glassBlue/glassGreen at 0.5-0.7 DIFFUSE, and no reflection
        // gain can make a 0.6-albedo wall read as glass: its own diffuse
        // swamps the mirror. Manhattan's real curtain-wall families are dark
        // (0.03-0.10 diffuse) and reflective (8-30 %), so albedo, F0, plate
        // roughness and reflection tint are picked TOGETHER, per building,
        // from one hash. Masonry families stay matte stone with only a
        // grazing sheen.
        //   FAC_glassF = (F0, plate roughness, solar aureole strength)
        bool fGlass = (style > 2.5 && style < 3.5) || (style > 10.5 && style < 11.5);
        float famR = hash12(vec2(floor(cvar * 233.0), 31.7));
        vec3 famAlb;
        if (fGlass) {
          if (famR < 0.30) {          // bronze / near-black glass (Seagram, 9 West 57th)
            famAlb = vec3(0.036, 0.028, 0.021); FAC_glassF = vec3(0.26, 0.055, 1.9);
            FAC_reflTint = vec3(1.06, 0.95, 0.80);
          } else if (famR < 0.62) {   // blue-green vision glass (the postwar default)
            famAlb = vec3(0.030, 0.052, 0.055); FAC_glassF = vec3(0.15, 0.045, 1.6);
            FAC_reflTint = vec3(0.82, 0.98, 1.02);
          } else if (famR < 0.84) {   // silver / clear low-iron (One Vanderbilt, Hearst)
            famAlb = vec3(0.052, 0.056, 0.062); FAC_glassF = vec3(0.10, 0.038, 1.5);
            FAC_reflTint = vec3(0.97, 0.99, 1.02);
          } else {                    // warm gold-tinted reflective coating
            famAlb = vec3(0.062, 0.050, 0.030); FAC_glassF = vec3(0.30, 0.060, 2.1);
            FAC_reflTint = vec3(1.10, 0.98, 0.74);
          }
        } else {
          famAlb = vec3(1.0); FAC_glassF = vec3(0.045, 0.55, 0.5);
          FAC_reflTint = vec3(1.0);
        }

        if (!isRoof && v < 0.02) {
          // below-grade foundation course: rusticated stone/brick, darker and coarser
          float course = step(0.5, fract(v / 0.42));
          float blocks = hash12(vec2(floor(u / 1.1), floor(v / 0.42) + cvar * 41.0));
          albedo = mix(vec3(0.32, 0.28, 0.24), vec3(0.42, 0.38, 0.33), blocks) * (0.85 + 0.1 * course);
          FAC_rough = 0.96;
        } else if (isRoof) {
          // NYC roof membranes — DATA-DRIVEN from the compiler's packed roof
          // byte via aux.z (1 silver coat, 2 dark EPDM/tar, 3 gravel ballast,
          // 4 pavers on pedestals, 5 sedum green roof, 6 mansard slate;
          // 0 = legacy hash pick for hip fills etc). Seams, wear, patches.
          // RF13: the roof plane is measured in the BUILDING'S frame — assemble.js roofFill() hands the
          // longest parapet edge's angle and first vertex in aux3 — so seams, blotches, drains and the
          // dresser's texture all run along the building instead of along world X/Z (owner 2026-09-16:
          // "avoid non-aligned textures on the rooftops"). aux3 = 0 (legacy call sites) keeps world space.
          vec2 rp = vWP.xz;
          if (abs(vAux3.x) + abs(vAux3.y) + abs(vAux3.z) > 1e-4) {
            vec2 dR = vWP.xz - vAux3.yz;
            float cR = cos(vAux3.x), sR = sin(vAux3.x);
            rp = vec2(cR * dR.x + sR * dR.y, -sR * dR.x + cR * dR.y);
          }
          float membF = vAux.z;
          float kindR = hash12(vec2(floor(cvar * 253.0), 7.31));
          if (membF > 0.5 && membF < 3.5) kindR = membF < 1.5 ? 0.2 : membF < 2.5 ? 0.5 : 0.7;
          float wear = fbm(rp * 0.13 + cvar * 19.0);
          // fine grain is derivative-faded to its mean (stipple rule: raw
          // vnoise(rp*5) was per-pixel shimmer from every aerial vantage);
          // a 2-5m blotch layer carries the visible variation instead —
          // real membranes are SMOOTH with soft coating blotches
          float rFp = max(fwidth(rp.x), fwidth(rp.y));
          float microVis = smoothstep(0.5, 0.12, rFp);
          // LB14 (docs/notes/lb14.md, critic r14 runner-up): the membrane speckle was ONE noise at ONE
          // SCALE on every roof in the frame — only its phase varied (cvar), which reads as the same
          // material stamped over the whole block. Two decorrelated per-building draws give each roof
          // its own granule scale and its own coating value; the value spread is also what widens the
          // per-roof span the critic measured at 100 against the photograph's 154, and it lifts p95
          // WITHOUT lowering p50 (which lbRoof 0.78 -> 0.70 would have done — see the notes).
          // lb14Roof is 0 on every non-day preset, so golden/dusk/night are bit-identical.
          float rScl = 1.0 + lb14Roof * 0.30 * (hash12(vec2(floor(cvar * 173.0), 5.17)) * 2.0 - 1.0);
          float rVal = 1.0 + lb14Roof * 0.27 * (hash12(vec2(floor(cvar * 311.0), 13.9)) * 2.0 - 1.0);
          float micro = mix(0.5, vnoise(rp * 5.0 * rScl + cvar * 7.0), microVis);
          float blotch = fbm(rp * 0.31 * (2.0 - rScl) + cvar * 11.0);
          // RF13 MEMBRANE ROLL SEAMS: a coated or bituminous roof is laid in 0.91 m (36 in) rolls along the
          // building's long axis, each lap a faint raised line; the seams are what make a big flat roof read
          // as a roof and not as one tiled texture (owner 2026-09-16: "excessively tiled rooftop textures
          // without details"). AA'd against the screen derivative and faded out where a roll is under ~2 px.
          float rollW = 0.914;
          float rollV = rp.y / rollW;
          float rollAA = max(fwidth(rollV), 1e-4);
          float rollVis = smoothstep(0.6, 0.18, rollAA);
          float seamL = smoothstep(0.045 + rollAA, 0.0, abs(fract(rollV) - 0.5) * 2.0 - 0.93) * rollVis;
          float rollTint = (hash12(vec2(floor(rollV), cvar * 53.0)) - 0.5) * 0.06 * rollVis;   // roll-to-roll batch tint
          vec3 roofC;
          bool patterned = false; // pavers/sedum/slate carry their own detail
          bool copperF = false;   // CR24 verdigris copper: keeps its own albedo (no colour-keep test, no membrane terms)
          if (membF > 6.5 && membF < 7.5) {
            // ---- CR24 VERDIGRIS COPPER (Columbia's McKim roofs, domes and dormers; assemble.js crBuild). The vertex
            // colour is the patina base (mint verdigris, the paler grey-green, lead, painted metal); uv.x runs along the
            // eave in metres and uv.y is the height above the eave, so the standing seams run DOWN every slope and the
            // gutter line is where the drip darkens it. Patina is a matte mineral crust: dielectric, rough, no sheen.
            float sx = vFUv.x / 0.46;
            float sAA = max(fwidth(sx), 1e-4);
            float sVis = smoothstep(0.75, 0.22, sAA);
            float sd = abs(fract(sx) - 0.5) * 2.0;                        // 0 mid-pan, 1 on the seam
            float rib = smoothstep(0.86 - sAA, 0.95, sd) * sVis;
            float ribLit = smoothstep(0.80 - sAA, 0.88, sd) * (1.0 - rib) * sVis;
            float pan = floor(sx);
            float hy = vFUv.y;
            vec3 base = diffuseColor.rgb;
            float pT = hash12(vec2(pan, cvar * 97.0)) - 0.5;               // sheet-to-sheet patina batch
            float blt = fbm(vec2(vFUv.x, hy) * 0.28 + cvar * 13.0);         // soft weathering blotches
            float strk = vnoise(vec2(vFUv.x * 1.6 + cvar * 31.0, hy * 0.20)); // run-off streaks down the slope
            vec3 cu = base * (0.92 + 0.12 * pT + 0.22 * (blt - 0.5));
            cu = mix(cu, base * vec3(0.70, 0.80, 0.74), smoothstep(0.58, 0.88, strk) * 0.42);
            cu = mix(cu, base * vec3(0.46, 0.44, 0.38), smoothstep(0.55, 0.0, hy) * 0.40);   // the drip over the gutter
            cu *= 1.0 - rib * 0.24;
            cu *= 1.0 + ribLit * 0.07;
            roofC = cu;
            FAC_rough = 0.76 + 0.08 * blt;
            patterned = true;
            copperF = true;
          } else if (membF > 5.5) {         // mansard slate: horizontal shingle courses
            float crs = vWP.y / 0.34;
            float cAA = max(fwidth(crs), 1e-4);
            float cLine = smoothstep(0.1 + cAA, 0.0, abs(fract(crs) - 0.5) * 2.0 - 0.8);
            float shTint = hash12(vec2(floor(crs), floor(rp.x * 1.4) + cvar * 31.0));
            roofC = mix(vec3(0.14, 0.15, 0.17), vec3(0.2, 0.21, 0.24), shTint) * (1.0 - cLine * 0.35);
            FAC_rough = 0.75;
            patterned = true;
          } else if (membF > 4.5) {  // sedum: mottled planting with dry patches
            float sed = fbm(rp * 0.8 + cvar * 5.0);
            float dry = smoothstep(0.72, 0.95, vnoise(rp * 1.7 + cvar * 9.0));
            vec3 g1 = vec3(0.20, 0.28, 0.12), g2 = vec3(0.36, 0.34, 0.16), g3 = vec3(0.32, 0.24, 0.15);
            roofC = mix(mix(g1, g2, smoothstep(0.3, 0.72, sed)), g3, dry);
            roofC *= 0.92 + 0.2 * mix(0.5, vnoise(rp * 7.0), microVis);
            FAC_rough = 0.97;
            patterned = true;
          } else if (membF > 3.5) {  // pavers on pedestals: 0.6m grid, AA'd joints
            vec2 pv = rp / 0.6;
            vec2 pAA = max(fwidth(pv), vec2(1e-4));
            float jx = smoothstep(0.05 + pAA.x, 0.0, abs(fract(pv.x) - 0.5) * 2.0 - 0.9);
            float jz = smoothstep(0.05 + pAA.y, 0.0, abs(fract(pv.y) - 0.5) * 2.0 - 0.9);
            float pTint = hash12(floor(pv) + cvar * 43.0);
            roofC = mix(vec3(0.42, 0.405, 0.38), vec3(0.52, 0.5, 0.468), pTint) * (1.0 - max(jx, jz) * 0.3) * (0.8 + 0.25 * wear);
            FAC_rough = 0.9;
            patterned = true;
          } else if (kindR < 0.34) { // aged silver coating: smooth, soft blotches
            // LB13 (docs/notes/light-r13.md): lbRoof trims THIS branch only. Measured on the
            // lens-matched Lenox pair, the west-side roof block rendered L p50 205 with a p50->p95
            // span of 14 against the photograph's 180 and 52 — i.e. the membrane was not merely two
            // stops hot, it was sitting on the tone curve's shoulder, where the blotches, the roll
            // seams and the ponding are all squeezed into 14 sRGB. The albedo comes back down the
            // curve so the detail that is already in the shader can be seen. Uniform, not a constant,
            // so a session can sweep it live (window.__ENV.lbRoof.value); 1.0 under ?lb13=0.
            // LB14: the LEVEL of this membrane is right and its SPREAD is a fifth of the photograph's.
            // Same rect, same roof block, lens-matched Lenox pair: ours p50 184 / p95 193 (span 9),
            // the Earth capture p50 178 / p95 231 (span 53). Dropping lbRoof to 0.70 (LB13's open
            // item 3) would land the p50 and take the p95 to ~193 — i.e. make critic r14 #1 (no top
            // end) strictly worse. Widen the coating blotch about its own midpoint instead, and give
            // each roof its own value (rVal) and its own granule scale (rScl). mix(x, y, 0) is exact,
            // so lb14Roof = 0 on golden/dusk/night is bit-identical to r13.
            vec3 rSil = mix(vec3(0.5, 0.495, 0.475), vec3(0.585, 0.575, 0.54), blotch);
            vec3 rMid = vec3(0.5425, 0.535, 0.5075);
            rSil = mix(rSil, rMid + (rSil - rMid) * 3.4, lb14Roof);
            roofC = rSil * (0.8 + 0.22 * wear) * lbRoof * rVal;
            roofC *= 0.96 + 0.08 * micro; // faint granule sparkle, derivative-faded
            FAC_rough = 0.6 + wear * 0.22 + blotch * 0.1;
          } else if (kindR < 0.62) { // black tar / smooth bitumen
            roofC = mix(vec3(0.085, 0.085, 0.09), vec3(0.12, 0.115, 0.11), blotch) * (0.9 + 0.2 * wear);
            roofC *= 0.94 + 0.12 * micro;
            FAC_rough = 0.62 + blotch * 0.2; // sheen varies at blotch scale, not per pixel
          } else if (kindR < 0.85) { // gravel ballast: real granularity, mip-faded
            float grv = mix(0.5, vnoise(rp * 11.0), microVis);
            roofC = mix(vec3(0.28, 0.255, 0.222), vec3(0.39, 0.365, 0.322), grv) * (0.84 + 0.22 * wear);
            roofC *= 0.94 + 0.12 * blotch;
            FAC_rough = 0.98;
          } else {                   // gray EPDM membrane: near-uniform, soft blotches
            roofC = mix(vec3(0.24, 0.245, 0.255), vec3(0.29, 0.295, 0.30), blotch) * (0.9 + 0.16 * wear);
            roofC *= 0.97 + 0.06 * micro;
            FAC_rough = 0.85;
          }
          if (!patterned) {
            // RF13: the roll seams now come from the building-frame pass above (rollV / seamL); the old seams ran at a
            // RANDOM angle per building and were exactly the "non-aligned rooftop texture" the owner called out.
            // Repair patches (RF13): a real roof carries a FEW small flashed-in patches, not a 9 % field of 3.6 m black
            // squares plus an 8.4 m family (final_v17 / roofs13 plates read as tiled blocks from 150 m). Rate 2 %, the
            // patch fills only the middle ~55 % of its cell (1.6-2.2 m), 40 % darker with a light mastic rim.
            vec2 pcQ = rp / 3.6 + cvar * 53.0;
            vec2 pc = floor(pcQ);
            float pr = hash12(pc);
            if (pr < 0.02) {
              vec2 pf = fract(pcQ);
              vec2 pin = vec2(0.18 + hash12(pc + 7.0) * 0.14, 0.18 + hash12(pc + 13.0) * 0.14);   // per-patch margins
              float pe = min(min(pf.x - pin.x, 1.0 - pin.x - pf.x), min(pf.y - pin.y, 1.0 - pin.y - pf.y));
              float inP = smoothstep(0.0, 0.05, pe);
              roofC = mix(roofC, roofC * 0.6, inP * 0.9);                                        // the patch, a shade darker
              roofC = mix(roofC, roofC * 1.3 + vec3(0.02), smoothstep(0.05, 0.0, pe) * step(-0.04, pe) * 0.5); // mastic rim
            }
          }
          // soot pooling
          roofC *= 1.0 - smoothstep(0.55, 0.95, wear) * 0.25;
          ${MAT9 ? `
          // ---- MAT9: PONDING. §2.2 measured our roof membranes at 16-17 % sd/mean
          // against the reference's 15-30 %, so the roofs are NOT too flat — the variation
          // is simply not organised. In ref_lenox every roof reads as water: dark standing
          // pools in the hollows, a tan drying rim around each one, rust where a pool has
          // sat for years, and the darkest run pooled against the parapet. Anchoring all
          // of it to ONE low-frequency field instead of three independent fbms is what
          // turns it from noise into water. Low frequency (0.24 c/m ≈ a 4 m feature), so
          // it cannot alias at any framing, and it costs one fbm on roof fragments only.
          if (!patterned) {
            float pond = fbm(rp * 0.24 + cvar * 31.0);
            float ponW = smoothstep(0.36, 0.76, pond);
            roofC *= 1.0 - ponW * 0.28;                                   // standing water
            FAC_rough = mix(FAC_rough, 0.46, ponW * 0.5);                 // ...and it glosses
            float rim = smoothstep(0.24, 0.37, pond) * (1.0 - smoothstep(0.37, 0.54, pond));
            roofC = mix(roofC, roofC * vec3(1.18, 0.96, 0.72), rim * 0.6); // tan drying rim
            // RF13: rust only where a pool has sat for years — 3 % of 2.6 m cells, not 13 % (the orange squares on every dark roof)
            if (hash12(floor(rp / 2.6 + cvar * 71.0)) > 0.97) roofC = mix(roofC, vec3(0.24, 0.14, 0.09), rim * 0.4 + 0.06);
          }` : ''}
          ${E10 ? `
          // ---- E10 (brief B/C): THE PARAPET RIM AND THE DRAINS.
          // r8 blind finding 3 ("nothing on a roof is stained... a dark rim where water
          // and soot pool against the parapet") was handed to the shader and the shader
          // could not do it, because the roof deck is earcut from the footprint ring and
          // therefore has NO interior vertices: every vertex is on the boundary, so a
          // per-vertex distance-to-edge is identically zero. assemble.js roofFill() now
          // emits a 1.25 m rim BAND between the ring and its inset before the earcut, and
          // carries the distance in uv.x as (1 + metres) so 0 still means "no rim data"
          // (hip fills, tower caps that have not been converted). +2 triangles per ring
          // edge, no draw call, no attribute.
          // The drains are a hash grid rather than real positions — a roof drain is at a
          // low point and ours are where the ponding field is low, which is the same
          // statement — and each carries the tar boot and the mastic ring that a real one
          // is flashed in with. Everything here is a 0.3-4 m feature.
          if (!patterned) {
            // 1.16 not 1.25: the inset fill carries the band's far edge exactly, so this
            // skips the whole interior of the deck instead of running four smoothsteps
            // that are all identically zero there.
            float rimD = vFUv.x > 0.5 ? vFUv.x - 1.0 : 99.0;
            if (rimD < 1.16) {
              float rN = 0.45 + 0.55 * fbm(rp * 0.55 + cvar * 43.0);
              roofC *= 1.0 - smoothstep(1.15, 0.0, rimD) * rN * 0.34;     // silt and soot pooled at the upstand
              roofC = mix(roofC, roofC * vec3(0.72, 0.70, 0.68), smoothstep(0.42, 0.0, rimD) * 0.7);
              FAC_rough = mix(FAC_rough, 0.72, smoothstep(0.5, 0.0, rimD) * 0.5);
            }
            // 21 m cell at 52 %: a real roof has two to four drains, not one every 16 m.
            // The boot SIZE varies per cell (0.75-1.35x) — round 10's other half is the
            // uniformity brief, and a field of identical discs is exactly the tell it is
            // about (roofs-r9 blind finding 2: "the pale 1 m squares are the loudest CG
            // tell on every roof").
            vec2 dC = rp / 21.0 + cvar * 29.0;
            vec2 dId = floor(dC);
            if (hash12(dId + 3.1) < 0.52) {
              vec2 dOff = vec2(hash12(dId + 8.7), hash12(dId + 15.3)) * 0.66 + 0.17;
              float dS = 0.75 + 0.60 * hash12(dId + 21.9);
              float dR = length((fract(dC) - dOff) * 21.0) / dS;
              roofC *= 1.0 - smoothstep(5.0, 1.1, dR) * 0.13;                                  // the sump the deck falls to
              roofC = mix(roofC, roofC * 1.22 + vec3(0.022), smoothstep(0.62, 1.35, dR) * smoothstep(2.0, 1.35, dR) * 0.4); // mastic ring
              roofC = mix(roofC, vec3(0.055, 0.052, 0.048), smoothstep(1.25, 0.42, dR) * 0.78); // tar boot
              FAC_rough = mix(FAC_rough, 0.55, smoothstep(1.1, 0.3, dR) * 0.6);
            }
          }` : ''}
          if (!patterned) roofC *= (1.0 - seamL * 0.10) * (1.0 + rollTint);   // RF13 roll seams + batch tint on coated/bitumen/gravel
          albedo = roofC;
          if (!copperF && diffuseColor.g > diffuseColor.r * 1.25 && diffuseColor.g > diffuseColor.b * 1.12) { // copper verdigris only: greens, not blue-glass teals
            albedo = diffuseColor.rgb * (0.85 + 0.2 * blotch + 0.1 * micro);
            FAC_rough = 0.6;
          }
          if (snowA > 0.003) { // roof snow cap (roof-flagged faces are up-facing)
            float rsm = clamp(snowA * (0.5 + 0.9 * (vnoise(vWP.xz * 0.42) * 0.5 + vnoise(vWP.xz * 0.09) * 0.5)), 0.0, 1.0);
            albedo = mix(albedo, vec3(0.87, 0.895, 0.94), rsm);
            FAC_rough = mix(FAC_rough, 0.62, rsm);
          }
        } else if (!blind) {
          bool glassStyle = (style > 2.5 && style < 3.5) || (style > 10.5 && style < 11.5);
          bool loftStyle = (style > 5.5 && style < 7.5);
          // per-wall bay layout (PR frame.bays): whole bays only, remainder becomes
          // corner margins — a window can NEVER be sliced by a building corner
          float wallLen = max(vAux3.x, 0.01);
          float wallSeed = floor(vAux3.y * 128.0 + 0.5) * (1.0 / 128.0); // hash seed — snap to grid
          float bayN = floor((wallLen - 0.44) / winW);
          float sideM = (wallLen - max(bayN, 0.0) * winW) * 0.5;
          float cuC = (u - sideM) / winW, cvC = v / floorH;
          float fx = fract(cuC), fy = fract(cvC);
          float cellU = floor(cuC), cellV = floor(cvC);
          float cellUS = cellU + wallSeed * 37.0; // decorrelate walls in hashes
          bool inBay = bayN >= 1.0 && cuC >= 0.0 && cuC < bayN;
          float x0 = 0.2, x1 = 0.8, y0 = 0.3, y1 = 0.88;
          if (glassStyle) { x0 = 0.05; x1 = 0.95; y0 = 0.08; y1 = 0.96; }
          if (loftStyle) { x0 = 0.1; x1 = 0.9; y0 = 0.14; y1 = 0.92; }
          // ---- WB13. The frame house's opening is UNDERSIZED and that is the point:
          // a 0.81 x 1.37 m vinyl replacement unit sits inside a 19th-century hole in a
          // 2.0-2.4 m bay with a 2.90 m floor, the difference panned over in flat coil
          // (docs/typology/08-vinyl-rowhouse.md §5). The generic residential 0.2-0.8
          // x 0.3-0.88 draws a 1.44 m sash, i.e. a tenement window on a house.
          if (sidingS) { x0 = 0.30; x1 = 0.70; y0 = 0.28; y1 = 0.80; }
          // ...and the condo is the opposite tell: floor-to-ceiling-ish glazing filling
          // most of the bay, which is what separates the two at a block's distance.
          if (condoS) { x0 = 0.10; x1 = 0.90; y0 = 0.16; y1 = 0.94; }
          // exact box-filtered window coverage per pixel: cannot stipple at ANY
          // view angle/minification (point-sampled fract() wraps within a pixel on
          // up-views and turned the window/wall decision into per-pixel noise)
          float aaU = max(fwidth(cuC), 1e-4), aaV = max(fwidth(cvC), 1e-4);
          // WL11 — the BASE opening, kept for the three places that run a PERIODIC pcov
          // over x0/x1/y0/y1 (the pier rhythm and the masonry-tower spandrel). pcovI
          // carries floor(x)*(hi-lo) across a cell boundary, so feeding it a per-cell
          // (lo,hi) draws a bright line down every pier. Those keep the base pair.
          float xb0 = x0, xb1 = x1, yb0 = y0, yb1 = y1;
          ${WL11 ? `
          // ---- WL11 (brief B): THE LATTICE. Three blind packs in a row named the window
          // grid, and the grid really is exact: every bay is winW wide to the micron and
          // every sill sits at 0.30 of its floor on every building in the city. A real
          // facade is laid out by a mason from both ends of a wall, so bay to bay it
          // drifts by a couple of per cent and no two sills are at the same height to the
          // centimetre — refs/streetview/morningside shows sills DEAD level across a floor
          // (which is why the amplitude here is ±2 cm and not ±10) but bays that pair and
          // breathe. Three independent per-bay numbers:
          //   * \`off\` slides the opening inside its bay (±2.8 % of the bay ≈ ±7 cm),
          //   * \`wsc\` scales the opening width (±2.6 %),
          //   * \`sJ\`/\`lJ\` move the sill and the lintel INDEPENDENTLY by ±2 cm, so the
          //     opening HEIGHT varies too, which is what a replaced unit in an old hole
          //     actually looks like.
          // THE CELL INDEX NEVER MOVES — only the opening inside it — which is the whole
          // door-bay guarantee: assemble.js doorAnchors, nycDress and heroFacades all put
          // the entrance at sideM + (bay + 0.5)*ww and that arithmetic is untouched. The
          // door bay is additionally pinned to zero jitter below, belt and braces.
          // \`wlh\` (not hash12) because heroFacades.js has to reproduce these three
          // numbers exactly in JS — see docs/notes/lattice-r11.md §3.
          float cvI = floor(vAux2.z * 1024.0 + 0.5);       // exact integer, same value in JS
          float wlDC = vAux3.z >= 8.0 ? floor(vAux3.z / 8.0) - 1.0 : -1.0;
          float wlPin = (cellU == wlDC) ? 0.0 : 1.0;       // the door bay does not move. ever.
          float bk = clamp(cellU, 0.0, 4090.0) + 1.0;
          float off = wlsg(cvI + 17.0, bk) * 0.028 * wlPin;
          float wsc = 1.0 + wlsg(cvI + 53.0, bk) * 0.026 * wlPin;
          // per-OPENING (bay x floor) index, wrapped to 64x64 so a*127 + b*311 stays an
          // exact integer below 2^24 in a float32 lane (see wlHash's contract)
          float bkv = mod(cellU, 64.0) + mod(cellV, 64.0) * 64.0 + 1.0;
          float sJ = wlsg(cvI + 89.0, bkv) * (0.02 / max(floorH, 2.0));
          float lJ = wlsg(cvI + 131.0, bkv) * (0.02 / max(floorH, 2.0));
          x0 = 0.5 + (x0 - 0.5) * wsc + off;
          x1 = 0.5 + (x1 - 0.5) * wsc + off;
          y0 += sJ; y1 += lJ;
          // the jitter has to be GONE before a bay reaches a pixel: cellU decorrelates per
          // pixel under minification, so a per-cell offset that survived there would be the
          // window stipple this project spent two rounds removing (tflick gate).
          float jFade = smoothstep(0.30, 0.09, aaU);
          x0 = mix(xb0, x0, jFade); x1 = mix(xb1, x1, jFade);
          y0 = mix(yb0, y0, jFade); y1 = mix(yb1, y1, jFade);` : ''}
          ${WL11 ? `
          // WL11 — coverage with a per-cell opening. The periodic pcov is still the right
          // answer at any minification (it converges to the mean); the in-cell box filter
          // is the right answer once one cell owns the pixel footprint. Blend on the same
          // jFade, so wherever the jitter is live the box filter is what is being read and
          // wherever pcov's periodicity matters the jitter is already zero.
          float hwU = aaU * 0.625, hwV = aaV * 0.625;
          float covU = mix(pcov(cuC, xb0, xb1, aaU * 1.25),
                           clamp((min(fx + hwU, x1) - max(fx - hwU, x0)) / max(2.0 * hwU, 1e-5), 0.0, 1.0), jFade);
          float covV = mix(pcov(cvC, yb0, yb1, aaV * 1.25),
                           clamp((min(fy + hwV, y1) - max(fy - hwV, y0)) / max(2.0 * hwV, 1e-5), 0.0, 1.0), jFade);` : `
          float covU = pcov(cuC, x0, x1, aaU * 1.25);
          float covV = pcov(cvC, y0, y1, aaV * 1.25);`}
          float winMask = covU * covV;
          if (v > bldgH - 0.8 || v < 0.15 || !inBay) winMask = 0.0;
          // entrance door bay: ONE per building, on the compiler-scored street
          // wall — assemble packs (bay+1)*8 + color*2 into aux3.z (0 = no door),
          // and heroFacades reads the same values, so shader and hero geometry
          // always agree on wall, bay and paint color
          float doorPack = vAux3.z;
          float doorCell = floor(doorPack / 8.0) - 1.0;
          float doorColI = mod(floor(doorPack / 2.0), 4.0);
          bool doorWall = doorPack >= 8.0 && bayN >= 1.0 && !store && !glassStyle && wallLen > 3.6;
          if (doorWall && cellU == doorCell && v < 3.6) winMask = 0.0;
          float wlBrick = 0.0;
          ${WL11 ? `
          // ---- WL11: BRICKED-UP OPENINGS (brief B). Not one opening in 930k buildings is
          // filled in, and in New York they are everywhere: a light court that lost its
          // daylight when the neighbour built higher, a stair that was moved, a lot-line
          // wall that must be closed to satisfy the fire code when the next lot is
          // developed. They cluster HARD — on the two bays nearest a party wall, and often
          // as a whole vertical column of a light court, top to bottom.
          //   * not every building: a per-building gate at 38 %, so a block has a few;
          //   * end bays 20 %, the rest 2.5 %, and a 5 % chance the whole bay COLUMN goes;
          //   * never on the street wall's parlour floor, never on glass, and never on
          //     the door bay (a bricked door is a different, much rarer thing).
          // The opening keeps its sill and its lintel — that is what makes it read as a
          // filled opening and not as a patch of wall — and the infill itself is painted
          // in the masonry branch below (\`wlBrick\`), because from here on this fragment
          // IS wall.
          if (!glassStyle && inBay && bayN >= 2.0 && wlh(cvI + 211.0, 3.0) < 0.38) {
            float endB = (cellU < 0.5 || cellU > bayN - 1.5) ? 1.0 : 0.0;
            float colR = wlh(cvI + 307.0, clamp(cellU, 0.0, 4090.0) + 1.0);
            float opR = wlh(cvI + 401.0, bkv);
            float rate = mix(0.025, 0.20, endB);
            float br = (opR < rate || colR < 0.05) ? 1.0 : 0.0;
            // the street door's own two floors stay open. Tested on the CELL, not on v:
            // a per-fragment v test would brick the top half of an opening that straddles
            // the threshold and leave the bottom half glazed.
            if (doorWall && cellV < 1.5) br = 0.0;
            if (cellU == wlDC) br = 0.0;                       // and the door bay is never filled
            // ...and it fades out on the SAME footprint gate as the jitter. "This cell has
            // no window" is a per-cell decision, and a per-cell decision that survives
            // minification is a stipple: at 400 m adjacent pixels sample different cells
            // and the facade would boil. Beyond the gate every cell is a window again,
            // continuously — no pop, and nothing for tflick to find.
            br *= jFade;
            wlBrick = br * winMask;                            // the opening's own AA'd coverage
            winMask *= 1.0 - br;
          }` : ''}
          float tiny = smoothstep(0.28, 0.62, max(aaU, aaV));
          bool inWin = winMask > 0.5 && tiny < 0.9;
          float winFade = 1.0 - tiny;

          if (store && v < storeH) {
            FAC_dbg = 2.0;
            float band = storeH * 0.78;
            if (v > band) {
              // ---- STOREFRONT FASCIA (facades-r6 item 5). Critic r5 #19:
              // "flat coloured storefront stripes with no text" — this band
              // used to be one random hue per bay, on the ground floor of
              // every storefront building in the city. It now carries a
              // GENERATED SIGN from the 32-slot fascia atlas
              // (src/city/fasciaAtlas.js): one shop per ~7 m of frontage, the
              // slot picked from the building's own colorVar so a shop keeps
              // its name, and no real brand anywhere in the set.
              // Costs one texture and zero draw calls.
              float shopW = 7.0;
              float shopI = floor(u / shopW);
              ${U10 ? `
              // ---- U10: the atlas is 64 slots (4 x 16) and the pick is a
              // BIJECTION, not a hash. \`slot = (a * shopI + b) mod 64\` with \`a\`
              // forced odd is a full-cycle LCG over a power-of-two modulus, so
              // consecutive shops on one wall are guaranteed different slots.
              // The hash it replaces collided about 1 frontage in 16, which is
              // the 06:45 addendum's "ROYAL NAILS twice on 100 W 125th" — and
              // the restored retail125 plate shows exactly that failure, twice
              // on one frontage, because this block had been lost.
              // \`wallSeed\` is in the OFFSET because \`u\` is WALL-local and
              // restarts at 0 on every ring edge: without it a building made of
              // several prisms replays the same slot sequence on each wall.
              float fa = 1.0 + 2.0 * floor(hash12(vec2(cvar * 131.0, 3.7)) * 32.0);
              float fb = floor(hash12(vec2(cvar * 57.0 + wallSeed * 13.0, 9.1)) * 64.0);
              float slot = mod(fa * shopI + fb, 64.0);
              float sCol = mod(slot, 4.0);
              float sRow = floor(slot / 4.0);` : `
              float slot = floor(hash12(vec2(shopI * 3.17 + cvar * 91.0, 7.31)) * 32.0);
              float sCol = mod(slot, 2.0);
              float sRow = floor(slot / 2.0);`}
              float su = clamp((u - shopI * shopW) / shopW, 0.0, 1.0);
              float sv = clamp((v - band) / max(storeH - band, 0.01), 0.0, 1.0);
              vec2 sUV = vec2((sCol + su) * (1.0 / ${U10 ? '4.0' : '2.0'}),
                              1.0 - (sRow + 1.0 - sv) * (1.0 / 16.0));
              vec3 sgn = texture2D(t_sgn, sUV).rgb;
              // stipple rule: converge the sign to its own mean once a shop is
              // under ~20 px wide, so the letterforms can never alias (and the
              // one blurry texel column at the atlas seam disappears with them)
              float sVis = smoothstep(0.34, 0.06, max(fwidth(u), fwidth(v)));
              vec3 sMean = mix(vec3(0.14, 0.13, 0.13), sgn, 0.35);
              vec3 signCol = mix(sMean, sgn, sVis);
              albedo = signCol;
              // internally-lit sign boxes at night, plus a little by day
              FAC_emis += signCol * (night * (0.75 + 0.8 * hash12(vec2(shopI, cvar)))
                                   + (1.0 - night) * 0.10);
              FAC_rough = 0.52;
            } else {
              float bayS = floor(u / 4.0);
              float dust0 = vnoise(vec2(u * 0.3, v * 0.5 + cvar * 5.0)) * 0.3;
              float gate = hash12(vec2(bayS, cvar * 37.0));
              ${U10 ? `
              // ---- U10 (round-10 addendum, seen on the v14 retail125 plate).
              // The shutter was 14 % of bays and it was drawn as VERTICAL
              // stripes on a 0.3 m pitch in one grey — a real roll-down grille
              // has 5-6 cm HORIZONTAL slats, a dark hood box above the opening,
              // and it is never the same grey twice (galvanised, painted, tagged).
              // Rate up to 22 % because a daytime NYC block really does carry
              // one closed shop in four or five, and because a shuttered bay is
              // the cheapest way to break a run of identical glazed ones.
              if (gate < 0.22) {
                // 5.9 cm slats. THE STIPPLE RULE APPLIES: this is a 6 cm feature
                // on a wall read from 5 m to 300 m, so it is box-filtered by its
                // own footprint AND converged to its mean before it can reach a
                // pixel — a raw fract() ladder here would be the window stipple
                // this project spent a round removing, and this round's whole
                // claim is that variety must not add flicker.
                float slat = fract(v * 17.0);
                float sFw = fwidth(v) * 17.0;
                float sAA = clamp(sFw, 1e-4, 0.45);
                float ribV = smoothstep(0.50 - sAA, 0.50 + sAA, slat)
                           * (1.0 - smoothstep(0.86 - sAA, 0.86 + sAA, slat));
                float rib = mix(0.36, ribV, smoothstep(0.95, 0.25, sFw));
                float gTone = 0.30 + 0.34 * hash12(vec2(bayS * 3.3 + 7.0, cvar * 91.0));
                vec3 gCol = mix(vec3(gTone), vec3(gTone * 1.06, gTone * 0.99, gTone * 0.90),
                                step(0.62, hash12(vec2(bayS * 1.9, cvar * 23.0))));
                albedo = gCol * (0.80 + 0.30 * rib);
                albedo = mix(albedo, albedo * 0.42, smoothstep(band - 0.55, band - 0.18, v));
                float tg = hash12(vec2(bayS * 11.0, cvar * 53.0));
                if (tg < 0.34) albedo = mix(albedo, vec3(0.12, 0.10, 0.16),
                  smoothstep(0.55, 0.9, vnoise(vec2(u * 2.6, v * 3.4) + tg * 40.0)) * 0.55);
                FAC_rough = 0.62;
              }` : `
              if (gate < 0.14) { albedo = vec3(0.55) * (0.85 + 0.15 * sin(u * 21.0)); FAC_rough = 0.5; }`}
              else {
                // shop-window interior mapping (PR shopInterior): deep retail room
                float litS = step(0.18, hash12(vec2(bayS + 31.0, cvar * 71.0))); // 82% lit
                vec3 sLight = hash12(vec2(bayS, cvar * 3.0)) < 0.88
                  ? mix(vec3(0.87, 0.92, 1.0), vec3(0.93, 0.96, 1.0), gate)   // cool fluorescent
                  : mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.92, 0.75), gate);   // warm halogen
                vec3 NnS = normalize(vNormal);
                vec3 rayS = normalize(-vViewPosition);
                vec3 upS = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
                vec3 TvS = normalize(cross(NnS, upS)); // exact +u direction (winding convention)
                vec3 BvS = normalize(cross(NnS, TvS));
                if (dot(BvS, upS) < 0.0) BvS = -BvS;
                float dotNS = dot(rayS, -NnS);
                float grazeS = smoothstep(0.05, 0.17, dotNS);
                vec3 rdS = vec3(dot(rayS, TvS), dot(rayS, BvS), max(0.04, dotNS));
                float RWs = 4.0, RHs = max(1.6, band - 0.5), RDs = RHs * 2.4 + 1.5;
                float rxS = clamp(u - bayS * 4.0, 0.0, RWs);
                float ryS = clamp(v - 0.45, 0.0, RHs);
                float txS = rdS.x > 0.0 ? (RWs - rxS) / max(rdS.x, 1e-4) : rxS / max(-rdS.x, 1e-4);
                float tyS = rdS.y > 0.0 ? (RHs - ryS) / max(rdS.y, 1e-4) : ryS / max(-rdS.y, 1e-4);
                float tzS = RDs / rdS.z;
                float tS = min(txS, min(tyS, tzS));
                vec3 hS = vec3(rxS, ryS, 0.0) + rdS * tS;
                vec3 qS = vec3(hS.x / RWs, hS.y / RHs, hS.z / RDs);
                float qdS = max(fwidth(qS.x), max(fwidth(qS.y), fwidth(qS.z)));
                float roomVisS = smoothstep(0.06, 0.015, qdS);
                float eAAS = clamp(qdS * 1.5, 0.004, 0.08);
                vec3 shopWall = mix(vec3(0.55, 0.52, 0.48), vec3(0.66, 0.64, 0.6), gate);
                vec3 room;
                if (tS == tzS) { // back wall: stocked shelves (footprint-faded)
                  float shelf = smoothstep(0.82 - eAAS * 5.0, 0.82 + eAAS * 5.0, fract(qS.y * 5.0));
                  ${U10 ? `
                  // ---- U10 (addendum: "big-box storefront glazing reads as FLAT
                  // PASTEL PANELS behind the glass"). Two faults, both here.
                  //  (1) the goods hash is keyed on the COLUMN only — all three
                  //      channels read floor(qS.x * 10.0) and none reads the shelf
                  //      ROW — so a stocked wall was full-height vertical bars.
                  //      That IS the pastel-panel read.
                  //  (2) the amplitude is 0.28 + 0.6 in three independent
                  //      channels: fully saturated primaries. A shelf of packaged
                  //      goods through glass at 25 m is a mid-dark speckle with a
                  //      little chroma, not a paint chart.
                  float gRow = floor(qS.y * 5.0);
                  float gCol = floor(qS.x * 12.0);
                  vec3 goods = 0.20 + 0.34 * vec3(hash12(vec2(gCol, gRow * 3.1 + bayS)),
                                                  hash12(vec2(gRow * 1.7 + bayS, gCol)),
                                                  hash12(vec2(gCol * 3.0 + 5.0, gRow + cvar * 77.0)));
                  goods = mix(vec3(dot(goods, vec3(0.33))), goods, 0.55);
                  // an opaque display backdrop with a poster on a third of bays,
                  // which is what a big-box window actually has
                  float bkd = hash12(vec2(bayS * 7.7 + 2.0, cvar * 61.0));
                  if (bkd < 0.34) {
                    vec3 card = mix(vec3(0.30, 0.29, 0.27), vec3(0.52, 0.50, 0.47), bkd * 2.4);
                    float pos = step(0.18, fract(qS.x * 2.0)) * step(0.28, qS.y) * step(qS.y, 0.82);
                    vec3 poster = 0.30 + 0.45 * vec3(hash12(vec2(floor(qS.x * 2.0), bayS + 3.0)),
                                                     hash12(vec2(bayS + 9.0, floor(qS.x * 2.0))),
                                                     hash12(vec2(floor(qS.x * 2.0) * 7.0, cvar * 13.0)));
                    goods = mix(card, mix(card, poster, 0.7), pos);
                    shelf *= 0.15;
                  }` : `
                  vec3 goods = 0.28 + 0.6 * vec3(hash12(vec2(floor(qS.x * 10.0), bayS)), hash12(vec2(bayS, floor(qS.x * 10.0))), hash12(vec2(floor(qS.x * 10.0) * 3.0, cvar * 77.0)));`}
                  vec3 stocked = mix(mix(shopWall * 0.7, goods, 0.6), shopWall * 0.45, shelf);
                  room = mix(shopWall * 0.6, stocked, roomVisS);
                } else if (tS == tyS) {
                  if (rdS.y < 0.0) { // terrazzo floor w/ dark seams + counter shadow
                    float tile = smoothstep(0.93 - eAAS * 6.0, 0.93 + eAAS * 6.0, max(fract(qS.x * 6.0), fract(qS.z * 6.0)));
                    vec3 terr2 = mix(mix(vec3(0.5, 0.47, 0.43), vec3(0.58, 0.56, 0.52), hash12(floor(vec2(qS.x, qS.z) * 6.0))), vec3(0.2), tile);
                    float cM = smoothstep(0.12 + eAAS, 0.12 - eAAS, abs(qS.z - 0.55)) * smoothstep(0.3 + eAAS, 0.3 - eAAS, abs(qS.x - 0.62));
                    terr2 *= mix(1.0, 0.45, cM * roomVisS);
                    room = mix(vec3(0.5, 0.47, 0.43), terr2, roomVisS);
                  } else { // suspended grid ceiling with troffer strips (intensity footprint-faded)
                    float troffer = smoothstep(0.6 - eAAS * 3.0, 0.6 + eAAS * 3.0, fract(qS.x * 3.0)) * smoothstep(0.35 - eAAS * 2.0, 0.35 + eAAS * 2.0, fract(qS.z * 2.0));
                    room = mix(vec3(0.62), sLight * mix(0.8, 5.0, litS), troffer * 0.8 * mix(0.35, 1.0, roomVisS));
                  }
                } else { room = shopWall * 0.75; }
                room *= mix(1.0, 0.5, qS.z);
                float glowS = litS * mix(0.5, 1.0, night);
                room *= (0.22 * (1.0 - night) + glowS * 1.4 + 0.03);
                room = mix(room, room * sLight, litS * 0.6);
                // derivative LOD for shop detail + grazing fade
                float detVisS = smoothstep(${U10 ? '0.95' : '0.5'}, 0.15, fwidth(u)) * grazeS;
                vec3 shopMean = shopWall * (0.22 * (1.0 - night) + glowS * 1.2 + 0.03) * 0.6;
                ${U10 ? `
                // ---- U10: the far fallback is the rest of the addendum's tell.
                // The whole parallax room collapses to \`shopMean\` once a bay is
                // wider than ~0.5 wall-metres per pixel, which on a 60 m big-box
                // frontage seen obliquely is most of it — and shopMean was
                // literally ONE colour per bay. Two fixes, both free: the
                // collapse starts at 0.95 m/px instead of 0.5 (the fine detail
                // inside is separately faded by roomVisS, so this cannot alias),
                // and the fallback carries the VERTICAL PROFILE every shop has —
                // dark at the head where the ceiling plane never faces you,
                // brightest under the lit ceiling, dark again at the floor —
                // plus a per-bay level, so even the collapsed case reads as a row
                // of rooms rather than a paint chip.
                {
                  float syS = clamp((v - 0.45) / max(band - 0.95, 0.5), 0.0, 1.0);
                  float prof = mix(0.40, 1.0, smoothstep(0.04, 0.40, syS))
                             * mix(1.0, 0.52, smoothstep(0.60, 1.0, syS));
                  shopMean *= prof * (0.72 + 0.56 * hash12(vec2(bayS * 5.1 + 3.0, cvar * 13.0)));
                }` : ''}
                room = mix(shopMean, room, detVisS);
                float filmS = 0.12 + dust0 * 0.2;
                vec3 shopGlass = vec3(0.8, 0.83, 0.81);
                albedo = mix(room * shopGlass, vec3(0.08, 0.09, 0.095), max(filmS, (1.0 - grazeS) * 0.75));
                FAC_emis += room * shopGlass * glowS * 2.0 * (1.0 - filmS) * grazeS;
                FAC_rough = 0.1 + filmS * 0.3;
                FAC_rough = mix(FAC_rough, 0.7, smoothstep(0.15, 0.5, fwidth(u))); // specular-AA
              }
            }
            ${E10 ? `
            // ---- E10: the two contacts a shopfront makes, and we had neither.
            //  * UNDER THE FASCIA. A sign band is a horizontal ledge with a sheet-metal
            //    or plywood face; everything that lands on it runs off its bottom edge in
            //    streaks onto the glass and the transom below. In every Street View frame
            //    of a Harlem or Bushwick frontage that drip line is the darkest thing on
            //    the shopfront, and it is what separates the sign from the glass.
            //  * AT THE PAVEMENT. The bottom 0.35 m of a shopfront is a bulkhead that is
            //    kicked, mopped, splashed and salted: near-black, with the sidewalk's own
            //    grit line right at the joint. Ours ran the interior mapping to y = 0, so
            //    the glass met the flags with no transition at all — the literal
            //    "perfect edge" the blind pass kept naming.
            {
              float dBelow = band - v;                       // metres below the fascia
              if (dBelow > -0.05 && dBelow < 1.05) {
                float dN = 0.30 + 0.70 * vnoise(vec2(u * 4.3 + cvar * 13.0, v * 0.8));
                float drip = smoothstep(1.0, -0.02, dBelow) * smoothstep(-0.05, 0.03, dBelow) * dN;
                albedo *= 1.0 - drip * 0.34;
                FAC_emis *= 1.0 - drip * 0.30;
              }
              float kick = smoothstep(0.40, 0.05, v);
              albedo = mix(albedo, albedo * vec3(0.30, 0.30, 0.31), kick * 0.72);
              FAC_emis *= 1.0 - kick * 0.85;
              albedo *= 1.0 - smoothstep(0.13, 0.0, v) * 0.35;   // the joint itself
              FAC_rough = mix(FAC_rough, 0.9, kick * 0.7);
            }` : ''}
          } else if (inWin) {
            FAC_dbg = 1.0;
            // ============ interior-mapped window (PR #33906: ray-marched virtual room) ============
            // rooms span 2-3 window bays (PR roomSize); interiors continue behind the piers
            float span = 2.0 + step(0.55, hash12(vec2(floor(cellUS / 2.0), cellV + cvar * 7.0)));
            float roomI = floor(cellU / span);
            float roomK = roomI + wallSeed * 53.0;
            float id  = hash12(vec2(roomK + cvar * 511.0, cellV * 1.7));
            float id2 = hash12(vec2(cellV * 3.7 + cvar * 131.0, roomK * 1.3));
            float id3 = hash12(vec2(roomK * 7.9, cellV * 5.1 + cvar * 57.0));
            float mottleG = vnoise(vec2(u, v) * 0.3 + cvar * 19.0);
            float dust = vnoise(vec2(u * 0.3, v * 0.06 + cvar * 5.0)) * 0.3;
            float pooled = smoothstep(0.32, 0.0, (fy - y0) / max(0.001, y1 - y0)) * 0.4;
            float grime = clamp(0.3 + dust + pooled, 0.0, 0.9);
            bool resi = style < 2.5 || (style > 4.5 && style < 5.5) || style > 11.5;
            ${N11 ? `
            // N11 — OCCUPANCY (docs/notes/night-r11.md 1.5). Apartments fill after
            // dark (0.20 -> 0.44); offices empty out but leave floor and cleaners'
            // lighting on, so the count drops rather than collapsing (0.42 -> 0.56
            // of panes reading lit, which is what a photograph of a Midtown block
            // at 9 p.m. shows). Both land inside the brief's 30-60 % band.
            // same gate as applyCityAO: golden (night 0.05) must land on the old
            // 0.20 / 0.42 exactly, so the blend is smoothstep(0.15, 0.60, night), not night.
            float litN = smoothstep(0.15, 0.60, night);
            float litFrac = resi ? mix(0.20, 0.44, litN) : mix(0.42, 0.56, litN);
            float lit = step(1.0 - litFrac, id3);` : `
            float lit = step(1.0 - (resi ? 0.2 : 0.42), id3);`}
            // living windows: ~12% of rooms drift on/off over minutes (slow,
            // per-room-constant phase — safe under the stipple rules: nothing
            // here varies per PIXEL, only per room per frame), and a few lit
            // rooms carry TV flicker at night
            {
              float wPh = hash12(vec2(cellU * 7.3 + wallSeed * 3.0, cellV * 11.1 + cvar * 5.0));
              if (wPh < 0.12) lit = step(0.0, sin(uTimeF * (0.011 + wPh * 0.02) + wPh * 251.0));
            }
            vec3 lightCol = id2 < 0.88
              ? mix(vec3(1.0, 0.72, 0.27), vec3(1.0, 0.89, 0.61), hash12(vec2(cellU, cellV + 9.0)))
              : mix(vec3(0.87, 0.91, 1.0), vec3(0.62, 0.71, 1.0), hash12(vec2(cellV, cellU + 4.0)));
            { // TV rooms: cool flickering light (8% of lit rooms, night only)
              float tvR = hash12(vec2(cellV * 3.9 + cvar * 41.0, cellU * 6.1));
              if (tvR < 0.08) {
                float fl = 0.6 + 0.4 * sin(uTimeF * 9.0 + tvR * 300.0) * sin(uTimeF * 23.7 + tvR * 91.0);
                lightCol = mix(lightCol, vec3(0.55, 0.68, 1.0) * (0.7 + fl * 0.6), night);
              }
            }
            // room frame in view space. Under our winding convention (shoelace-positive
            // ring, exterior normal (+ez,-ex)), cross(N, up) IS the wall's +u direction —
            // exact, per-vertex, no screen-derivative sign guessing (that guess flipped
            // per 2x2 quad at steep angles and caused checkerboard noise).
            vec3 Nn = normalize(vNormal);
            vec3 rayV = normalize(-vViewPosition); // camera -> fragment
            vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            vec3 Tv = normalize(cross(Nn, upV));
            vec3 Bv = normalize(cross(Nn, Tv));
            if (dot(Bv, upV) < 0.0) Bv = -Bv;
            float RW = span * winW, RH = (y1 - y0) * floorH;
            float RD = (resi ? 1.55 : 2.4) * RH + 1.2;
            float dotN = dot(rayV, -Nn);
            // grazing incidence: rays nearly parallel to the pane make the march
            // numerically meaningless — and real glass turns mirror there anyway
            float grazeVis = smoothstep(0.05, 0.17, dotN);
            vec3 rd = vec3(dot(rayV, Tv), dot(rayV, Bv), max(0.04, dotN));
            // ---- true parallax inset: the glass plane sits REC meters behind
            // the wall face. Marching the view ray from the wall-plane point to
            // that plane shifts the pane CONTENT by rd.xy*REC/rd.z, and where
            // the shifted point exits the opening the ray has hit a reveal wall
            // (jamb / lintel soffit / sill) instead of glass — the same depth
            // cue the hero ring builds as geometry, here for all 930k buildings.
            // All edges AA'd by pixel footprint (the stipple rules), clamped at
            // grazing where the parallax would smear meters wide.
            float REC = glassStyle ? 0.045 : 0.15;
            vec2 parS = clamp(rd.xy * (REC / max(rd.z, 0.2)), vec2(-0.5), vec2(0.5));
            float Wp = max((x1 - x0) * winW, 1e-3), Hp = max((y1 - y0) * floorH, 1e-3);
            float pu = (fx - x0) * winW + parS.x;
            float pv = (fy - y0) * floorH + parS.y;
            float aaPm = clamp(aaU * winW, 0.004, 0.09);
            float insU = smoothstep(-aaPm, aaPm, pu) * smoothstep(-aaPm, aaPm, Wp - pu);
            float insV = smoothstep(-aaPm, aaPm, pv) * smoothstep(-aaPm, aaPm, Hp - pv);
            float revealM = (1.0 - insU * insV) * smoothstep(0.08, 0.28, dotN) * (1.0 - tiny);
            // shifted entry point for the room march (content parallax)
            float rx = clamp((cuC + parS.x / winW - roomI * span) / span, 0.0, 1.0) * RW;
            float ry = clamp((fy + parS.y / floorH - y0) / (y1 - y0), 0.0, 1.0) * RH;
            // slab method: nearest far plane
            float tx = rd.x > 0.0 ? (RW - rx) / max(rd.x, 1e-4) : rx / max(-rd.x, 1e-4);
            float ty = rd.y > 0.0 ? (RH - ry) / max(rd.y, 1e-4) : ry / max(-rd.y, 1e-4);
            float tz = RD / rd.z;
            float t = min(tx, min(ty, tz));
            vec3 hit = vec3(rx, ry, 0.0) + rd * t;
            vec3 q = vec3(hit.x / RW, hit.y / RH, hit.z / RD);
            FAC_dbgV = q; // facdebug=2 visualizes the room-space hit coordinate
            // room-space pixel footprint: q's derivatives explode at grazing angles even
            // when the pane covers many pixels — fade ALL interior detail by it, and AA
            // every edge with it (fixes motion shimmer)
            float qd = max(fwidth(q.x), max(fwidth(q.y), fwidth(q.z)));
            float roomVis = smoothstep(0.06, 0.015, qd);
            float eAA = clamp(qd * 1.5, 0.004, 0.08); // edge softening in q units
            vec3 iWall = mix(vec3(0.62, 0.58, 0.52), vec3(0.72, 0.70, 0.66), id2);
            float aoQx = smoothstep(0.0, 0.15, q.x) * smoothstep(0.0, 0.15, 1.0 - q.x);
            float aoQy = smoothstep(0.0, 0.15, q.y) * smoothstep(0.0, 0.15, 1.0 - q.y);
            float aoQz = smoothstep(0.0, 0.15, q.z) * smoothstep(0.0, 0.15, 1.0 - q.z);
            vec3 room;
            if (t == tz) { // back wall
              room = iWall;
              if (resi) {
                float doorX = mix(0.22, 0.78, id);
                float doorM = smoothstep(0.09 + eAA, 0.09 - eAA, abs(q.x - doorX)) * smoothstep(0.72 + eAA, 0.72 - eAA, q.y);
                room = mix(room, mix(vec3(0.32, 0.22, 0.13), vec3(0.5, 0.38, 0.24), id2), doorM * roomVis);
                float picX = doorX < 0.5 ? mix(0.68, 0.82, id2) : mix(0.18, 0.32, id2);
                float picM = smoothstep(0.05 + eAA, 0.05 - eAA, abs(q.x - picX)) * smoothstep(0.07 + eAA, 0.07 - eAA, abs(q.y - 0.55));
                room = mix(room, mix(vec3(0.2), lightCol * 0.4, id3), picM * roomVis);
                float sofaX = 0.5 + (id - 0.5) * 0.4;
                float sofaM = smoothstep(0.22 + eAA, 0.22 - eAA, abs(q.x - sofaX)) * smoothstep(0.3 + eAA, 0.3 - eAA, q.y);
                room = mix(room, mix(vec3(0.24, 0.2, 0.18), vec3(0.36, 0.3, 0.26), id2) * 1.15, sofaM * roomVis);
              } else {
                float shC = fract(q.y * 4.0);
                float shelf = smoothstep(0.86 - eAA * 4.0, 0.86 + eAA * 4.0, shC);
                vec3 goods = 0.3 + 0.55 * vec3(hash12(vec2(floor(q.x * 8.0), cellV)), hash12(vec2(cellUS, floor(q.x * 8.0))), hash12(vec2(floor(q.x * 8.0) * 3.0, cvar * 77.0)));
                vec3 shelved = mix(mix(iWall * 0.85, goods, 0.5), iWall * 0.55, shelf);
                room = mix(iWall * 0.72, shelved, roomVis);
              }
              room *= mix(0.72, 1.0, aoQx * aoQy);
            } else if (t == ty) {
              if (rd.y < 0.0) { // floor: boards + rug (AA'd, detail-faded)
                float seam = smoothstep(0.94 - eAA * 6.0, 0.94 + eAA * 6.0, fract(q.x * 6.0));
                vec3 boards = mix(mix(vec3(0.29, 0.2, 0.125), vec3(0.42, 0.3, 0.19), id2), vec3(0.12, 0.1, 0.08), seam);
                float rugM = resi ? smoothstep(0.28 + eAA, 0.28 - eAA, abs(q.x - 0.5)) * smoothstep(0.3 + eAA, 0.3 - eAA, abs(q.z - 0.45)) : 0.0;
                boards = mix(boards, mix(vec3(0.48, 0.23, 0.2), vec3(0.23, 0.34, 0.38), id3), rugM);
                room = mix(vec3(0.34, 0.25, 0.16), boards, roomVis);
              } else { // ceiling + bulb (bulb intensity fades with footprint — no hot pixel at range)
                float lamp = smoothstep(0.16 + eAA, 0.13 - eAA, length(vec2(q.x - 0.5, q.z - 0.5)));
                vec3 ceilBase = mix(iWall, vec3(1.0), 0.5);
                room = mix(ceilBase, lightCol * mix(1.0, 4.5, lit), lamp * mix(0.3, 1.0, roomVis));
              }
              room *= mix(0.72, 1.0, aoQx * aoQz);
            } else { // side walls
              room = iWall * 0.8;
              room *= mix(0.72, 1.0, aoQy * aoQz);
            }
            float dayAmb = (1.0 - night) * (0.08 + 0.26 * id); // per-room daylight depth: some rooms read dark, some airy
            float roomGlow = lit * mix(0.22, 1.0, night);
            room *= (dayAmb + roomGlow * 1.6 + 0.02) * mix(1.0, 0.45, q.z);
            room = mix(room, room * lightCol, lit * mix(0.25, 0.85, night)); // bulb tint mostly at night
            // curtains from the sides (rarely fully drawn), transmit 20% of glow — AA'd edges
            float cwid = pow(id2, 2.0) * 0.42;
            float fxn = clamp(pu / Wp, 0.0, 1.0); // curtains hang at the glass plane: parallax with it
            float aaFx = aaU / max(0.05, x1 - x0);
            float curtM = clamp(smoothstep(cwid + aaFx, cwid - aaFx, fxn) + smoothstep(1.0 - cwid - aaFx, 1.0 - cwid + aaFx, fxn), 0.0, 1.0);
            vec3 fab = mix(vec3(0.72, 0.68, 0.6), vec3(0.5, 0.55, 0.52), id3) * (dayAmb * 1.6 + roomGlow * 0.2 + 0.02);
            room = mix(room, fab, curtM);
            // derivative-based interior LOD: collapse room detail to its mean when the
            // window covers few pixels (kills mid-range window noise on real GPUs)
            float detVis = smoothstep(0.16, 0.05, aaU) * grazeVis;
            vec3 roomMean = iWall * (dayAmb + roomGlow * 1.3 + 0.02) * 0.55;
            roomMean = mix(roomMean, roomMean * lightCol, lit * mix(0.25, 0.85, night));
            room = mix(roomMean, room, detVis);
            // ---- per-window dressing states (the clone-killer): roller
            // shades at random pull heights on residential panes, venetian
            // blinds at random drop heights on office panes. Both hang at the
            // glass plane (pane-space pu/pv — same parallax as the curtains),
            // transmit a little warm glow at night, and every edge/slat is
            // fwidth-AA'd or pcov box-filtered (stipple rules).
            {
              float fyn = clamp(pv / Hp, 0.0, 1.0);
              float aaFy = aaV / max(0.05, y1 - y0);
              float dressR = hash12(vec2(cellUS * 3.3 + cvar * 97.0, cellV * 9.4));
              float fynS = fyn;   // WL11 overwrites this with a CROOKED hem
              ${WL11 ? `
              // ---- WL11: the blind states were varied but INDEPENDENT — p = 0.42 per
              // pane, drawn to an unrelated height — and a Bernoulli sprinkle over a grid
              // still reads as a grid, evenly dusted. Three corrections, all free:
              //   * PRESENCE is mostly per FLAT (the interior mapper's room already spans
              //     2-3 bays): one apartment keeps every shade down, the next has none.
              //   * HEIGHT is per flat for a home and per FLOOR for an office (a managed
              //     building's blinds are dropped to one level down a whole floor), with a
              //     small per-window deviation on top — that deviation is the tell that a
              //     human pulled each one, so it is not zero either.
              //   * every roller blind hangs CROOKED. Not one hem in New York is level,
              //     and a dead-level hem across a whole facade is a stamped texture.
              float dRoom = wlh(cvI + 1013.0, mod(floor(cellU / 2.0), 64.0) + mod(cellV, 64.0) * 64.0 + 1.0);
              float dPane = wlh(cvI + 1117.0, bkv);
              dressR = dRoom * 0.72 + dPane * 0.28;
              float hRoom = wlh(cvI + 1229.0, mod(floor(cellU / 2.0), 64.0) + mod(cellV, 64.0) * 64.0 + 1.0);
              float hFloor = wlh(cvI + 1321.0, mod(cellV, 64.0) + 1.0);
              float hPane = wlh(cvI + 1433.0, bkv);
              fynS = clamp(fyn + (fxn - 0.5) * wlsg(cvI + 1553.0, bkv) * 0.07, 0.0, 1.0);` : ''}
              if (resi) {
                if (dressR < 0.42) { // vinyl roller shade, drawn 15-95%
                  float shH = mix(0.15, 0.95, hash12(vec2(cellV * 5.9 + cvar * 23.0, cellUS * 1.9)));
                  ${WL11 ? 'shH = clamp(mix(0.12, 0.97, hRoom * 0.74 + hPane * 0.26), 0.05, 0.99);' : ''}
                  float shM = smoothstep(1.0 - shH - aaFy, 1.0 - shH + aaFy, fynS);
                  vec3 shC = mix(vec3(0.80, 0.76, 0.68), vec3(0.60, 0.59, 0.55), id2);
                  vec3 shade = shC * (dayAmb * 1.9 + roomGlow * 0.55 + 0.02); // translucent: warm night glow
                  shade *= 0.93 + 0.07 * sin(fxn * 19.0); // soft fold ripple (smooth fn, no fract)
                  room = mix(room, shade, shM);
                }
              } else if (dressR < 0.6) { // office venetians, dropped 20-100%
                float blH = mix(0.2, 1.0, hash12(vec2(cellUS * 7.1, cellV * 3.7 + cvar * 51.0)));
                ${WL11 ? 'blH = clamp(mix(0.18, 1.0, hFloor * 0.62 + hRoom * 0.24 + hPane * 0.14), 0.05, 1.0);' : ''}
                float blM = smoothstep(1.0 - blH - aaFy, 1.0 - blH + aaFy, fynS);
                float slat = pcov(fyn * 16.0, 0.0, 0.72, max(fwidth(fyn * 16.0), 1e-4) * 1.25);
                vec3 blC = vec3(0.72, 0.73, 0.71) * (0.55 + 0.45 * slat);
                room = mix(room, blC * (dayAmb * 1.7 + roomGlow * 0.4 + 0.02), blM);
              }
            }
            #if defined(FACDEBUG) && FACDEBUG == 6
            FAC_dbgV = vec3(id, id2, id3); FAC_dbg = 9.0; // room hash ids — must be constant per room
            #endif
            #if defined(FACDEBUG) && FACDEBUG == 7
            FAC_dbgV = vec3(roomVis, detVis, grazeVis); FAC_dbg = 9.0; // derivative-LOD factors
            #endif
            #if defined(FACDEBUG) && FACDEBUG == 9
            FAC_dbgV = vec3(0.5); FAC_dbg = 9.0; // flat control — residue = post/framebuffer
            #endif
            // glass compositing (PR): tinted room vs dirty film, emissive when lit
            vec3 dirtyGlass = mix(vec3(0.05, 0.06, 0.068), vec3(0.105, 0.12, 0.128), mottleG);
            float tintR = hash12(vec2(cellUS * 7.7 + cvar * 43.0, cellV * 3.1));
            vec3 glassTint = mix(vec3(0.71, 0.78, 0.75),
              tintR < 0.33 ? vec3(0.64, 0.73, 0.78) : tintR < 0.66 ? vec3(0.75, 0.78, 0.69) : vec3(0.70, 0.74, 0.77),
              0.55) * 0.86; // calibrated down: real panes read darker than their rooms
            // grazing → reflective film dominates (Fresnel look, hides the dead march)
            albedo = mix(room * glassTint, dirtyGlass, max(grime * (1.0 - lit * 0.35), (1.0 - grazeVis) * 0.75));
            ${MAT9 ? `
            // ---- MAT9: PER-PANE identity, applied to the pane's MEAN so it survives the
            // interior LOD collapse. The r8 shader already varies a lot pane to pane —
            // roller shades on 42 % of residential panes, venetians on 60 % of office
            // panes, three glass tints, 0.55-1.45x reflectivity — but the interior itself
            // is per-ROOM (a room spans 2-3 bays) and every detail inside it is multiplied
            // by \`detVis = smoothstep(0.16, 0.05, aaU)\`, so by ~60 m the panes of a room
            // are clones of each other and the facade reads as a stamped grid. That is
            // blind-pass tell #4. This acts on the composited pane colour instead, with a
            // per-CELL hash (cellUS/cellV are flat per cell, so nothing varies per pixel)
            // faded by the cell footprint so it converges to the facade mean BEFORE a pane
            // reaches a pixel — otherwise a per-pane hash below Nyquist is exactly the
            // window stipple this project spent a round removing.
            {
              // The first version keyed the whole deviation on the PANE, and this round's own
              // blind pass called it (docs/notes/materials-r9.md §11, pair p6): random per-pane
              // value reads as film grain on a grid. A real facade's variance is CORRELATED —
              // one blind is drawn to the same height across the three windows of one apartment,
              // a whole floor goes dark after hours, a stairwell column stays lit. So the same
              // total amplitude is split: most of it per ROOM (the interior mapper's own roomK,
              // which already spans 2-3 bays), some per FLOOR, and a small per-pane jitter on
              // top. Structure instead of noise, for the same cost.
              float paneVis = smoothstep(0.95, 0.22, aaU);
              float rv = hash12(vec2(roomK * 3.7 + cvar * 11.0, cellV * 2.3));
              float fv = hash12(vec2(cellV * 7.1 + cvar * 29.0, 5.31));
              float pj = hash12(vec2(cellUS * 11.3 + cvar * 7.0, cellV * 4.9));
              albedo *= 1.0 + ((rv - 0.5) * 0.34 + (fv - 0.5) * 0.16 + (pj - 0.5) * 0.14) * paneVis;
              float tv = hash12(vec2(roomK * 13.7, cellV * 1.9 + cvar * 83.0));
              albedo *= mix(vec3(1.0), mix(vec3(1.07, 1.0, 0.92), vec3(0.92, 0.99, 1.09), tv), 0.4 * paneVis);
            }` : ''}
            FAC_rough = 0.16 + pooled * 0.45 + dust * 0.2;
            // specular-AA: widen roughness with pixel footprint so env highlights can't sparkle
            FAC_rough = mix(FAC_rough, 0.72, smoothstep(0.05, 0.2, aaU));
            FAC_emis += room * glassTint * roomGlow * 2.2 * (1.0 - grime * 0.6) * grazeVis;
            // soft sky occlusion on the glass just under the lintel (the reveal
            // walls carry the hard depth cue; this keeps a gentle gradient on
            // the pane itself). Far fallback when parallax is subpixel.
            {
              float wyR = clamp(pv / Hp, 0.0, 1.0);
              float recess = 1.0 - 0.24 * smoothstep(0.62, 0.98, wyR);
              albedo *= recess;
              FAC_emis *= mix(1.0, recess, 0.4);
            }
            // ---- glass acts like glass (the Matrix-city signature): per-pane
            // jittered normal (plate waviness — reflections break up pane to
            // pane), fresnel-weighted sky/environment reflection, and a tight
            // sun glint that flares into bloom when a pane aligns camera<->sun
            {
              vec3 Vw = normalize(cameraPosition - vWP);
              vec3 NwG = normalize(cross(dFdx(vWP), dFdy(vWP)));
              if (dot(NwG, Vw) < 0.0) NwG = -NwG;
              float pj1 = hash12(vec2(cellU * 3.1 + wallSeed * 11.0, cellV * 5.3)) - 0.5;
              float pj2 = hash12(vec2(cellV * 9.7 + cvar * 31.0, cellU * 1.7)) - 0.5;
              vec3 Nj = normalize(NwG + vec3(pj1, pj2, pj1 * 0.5) * 0.055);
              vec3 Rw = reflect(-Vw, Nj);
              float fres = 0.05 + 0.95 * pow(1.0 - max(dot(Vw, Nj), 0.0), 5.0);
              float glassW = winMask * grazeVis * (1.0 - grime * 0.7);
              // pane-to-pane reflectivity variance (replaced sashes, film age)
              glassW *= 0.55 + 0.9 * hash12(vec2(cellUS * 5.3, cellV * 8.9 + cvar * 17.0));
              // ---- ANALYTIC sky/sun mirror (facades-r6 §0). This used to be
              // textureCubeUV(envMap) * envMapIntensity, i.e. the IBL — which
              // lighting.md cut to 0.14 to fix the ambient, taking every glass
              // reflection in the city with it (critic r5 #2). It also used to
              // be gated by (1 - tiny) so it faded out with distance; the
              // gradient below is per-FACE, not per-pane, so nothing about it
              // depends on a pane covering pixels.
              float f0P = fGlass ? FAC_glassF.x : 0.075;    // punched glazing is clear glass
              float fresP = fresnelR(max(dot(Vw, Nj), 0.0), f0P);
              float fpP = max(aaU, aaV) * 0.35;
              FAC_emis += skyLook(Rw, sunDirW, sunColW, uZenC, uHorC, uRefl, FAC_glassF.z)
                        * FAC_reflTint * fresP * glassW;
              // specular AA: the disc exponent is widened by the pixel
              // footprint and its peak clamped inside sunDisc(), otherwise
              // sub-pixel mirrors strobe (and sparkle through bloom)
              FAC_emis += sunColW * FAC_reflTint
                        * sunDisc(Rw, sunDirW, fGlass ? FAC_glassF.y : 0.06, fpP)
                        * fresP * 16.0 * uRefl * glassW * (1.0 - night);
            }
            // ---- sash frames at the glass plane: perimeter stiles + a
            // double-hung meeting rail (residential/punched), or a full
            // steel-sash muntin grid (loft/industrial). Pane-space pu/pv so
            // they parallax with the inset glass; they occlude interior glow
            // and reflections; box-filtered/AA'd per the stipple rules.
            if (!glassStyle && tiny < 0.9) {
              float sashR = hash12(vec2(floor(cvar * 253.0), 4.17));
              vec3 sashC = sashR < 0.5 ? vec3(0.66, 0.65, 0.60)      // painted white/cream
                         : sashR < 0.8 ? vec3(0.085, 0.085, 0.095)   // factory black
                         : vec3(0.22, 0.15, 0.10);                   // stained wood
              float dEdgeS = min(min(pu, Wp - pu), min(pv, Hp - pv));
              float stileW = 0.055;
              float wlRep = 0.0; vec3 wlRepC = vec3(0.0);
              ${WL11 ? `
              // ---- WL11: REPLACED SASHES (brief B, 5-10 %). Every window in a building
              // is currently the same unit, and that is not how any New York building
              // over forty years old looks: sashes are replaced one FLAT at a time, so a
              // wood-sash tenement carries a scatter of white vinyl or mill-finish
              // aluminium units, and the giveaway at 20 m is not the colour but the
              // PROFILE — a replacement unit has a fat frame (a 1-over-1 insert loses
              // 6-8 cm to the new jamb liner), one meeting rail dead centre, and no
              // muntins at all where the original had a grid.
              // CORRELATED, not sprinkled: the gate is mostly per-ROOM (= per flat: the
              // interior mapper's rooms already span 2-3 bays) with a small per-window
              // term, because a landlord replaces a whole apartment's windows in one day.
              // ~7 % of openings overall.
              {
                float rr = wlh(cvI + 613.0, mod(floor(cellU / 2.0), 64.0) + mod(cellV, 64.0) * 64.0 + 1.0);
                float rw = wlh(cvI + 727.0, bkv);
                wlRep = (rr < 0.12 && rw < 0.62) || rw < 0.022 ? 1.0 : 0.0;
                if (wlRep > 0.5) {
                  stileW = 0.085;                              // the fat insert frame
                  float rc = wlh(cvI + 829.0, bkv);
                  wlRepC = rc < 0.62 ? vec3(0.80, 0.795, 0.775) // white vinyl (the common one)
                         : rc < 0.86 ? vec3(0.52, 0.53, 0.545)  // mill-finish aluminium
                         : vec3(0.16, 0.145, 0.125);            // dark bronze anodised
                  sashC = wlRepC;
                }
              }` : ''}
              float sashM = smoothstep(stileW + aaPm, stileW - aaPm, dEdgeS);
              if (loftStyle && wlRep < 0.5) { // steel-sash lights, ~0.56 x 0.47m
                float gU = pu / 0.56, gV = pv / 0.47;
                float mUL = 1.0 - pcov(gU, 0.05, 0.95, max(fwidth(gU), 1e-4) * 1.25);
                float mVL = 1.0 - pcov(gV, 0.06, 0.94, max(fwidth(gV), 1e-4) * 1.25);
                sashM = clamp(sashM + mUL + mVL, 0.0, 1.0);
              } else { // meeting rail just above pane middle (a replacement unit's is centred)
                sashM = clamp(sashM + smoothstep(0.045 + aaPm, 0.045 - aaPm, abs(pv - Hp * (wlRep > 0.5 ? 0.50 : 0.53))), 0.0, 1.0);
              }
              sashM *= insU * insV * (1.0 - tiny) * winMask;
              ${U10 ? `
              // ---- U10: the FRAME's own identity (this is the pane-variance
              // block the brief scopes to me, extended rather than duplicated).
              // Three colours per city and a single value each is the same
              // defect the r9 block fixed one layer in: a whole avenue of
              // windows whose frames are pixel-identical. What varies on a real
              // facade, in the order it reads at 40 m:
              //   * paint STATE per BUILDING — the last repaint was 2 or 22
              //     years ago, and a chalked frame is both lighter and much
              //     rougher than a fresh one, so this has to move roughness too;
              //   * hue drift per building (the same "white" from two decades);
              //   * a per-WINDOW deviation (sashes get replaced one flat at a
              //     time — an aluminium unit in a wooden-sash building);
              //   * DIRT, which is not uniform over a frame: it collects on the
              //     bottom rail and in the corners, where rain sits.
              // All cell- or building-constant, never per-pixel, and faded by
              // the pane footprint so it converges to the facade mean before a
              // frame subtends a pixel.
              {
                float paneVisU = smoothstep(0.95, 0.22, aaU);
                float paint = hash12(vec2(floor(cvar * 253.0) + 11.0, 8.3));
                float chalk = smoothstep(0.45, 1.0, paint);
                sashC = mix(sashC, mix(sashC, vec3(0.52, 0.51, 0.49), 0.55), chalk);
                float hueB = hash12(vec2(floor(cvar * 253.0) + 29.0, 2.1)) - 0.5;
                sashC *= vec3(1.0 + hueB * 0.10, 1.0 + hueB * 0.02, 1.0 - hueB * 0.09);
                float rep = hash12(vec2(cellUS * 9.1 + cvar * 17.0, cellV * 4.3));
                sashC *= 1.0 + (rep - 0.5) * 0.26 * paneVisU;
                float lowF = smoothstep(0.34, 0.0, pv / max(Hp, 0.01));
                float cornF = smoothstep(0.22, 0.0, min(pu, Wp - pu) / max(Wp, 0.01));
                float dirtF = clamp(lowF * 0.7 + cornF * 0.45, 0.0, 1.0)
                            * (0.30 + 0.70 * hash12(vec2(floor(cvar * 253.0) + 5.0, 6.7)));
                sashC = mix(sashC, sashC * vec3(0.60, 0.585, 0.55), dirtF * 0.55 * paneVisU);
                FAC_rough = mix(FAC_rough, mix(0.38, 0.74, max(chalk, dirtF * 0.6)), sashM);
              }` : ''}
              ${WL11 ? `
              // WL11: U10's paint state is the BUILDING's last repaint — a unit that was
              // swapped in five years ago did not get chalky with it, and vinyl does not
              // chalk at all. Take most of the clean colour back (a little of the wall's
              // dirt stays: the frame still lives under the same sill) and give it the
              // semi-gloss a new frame actually has.
              if (wlRep > 0.5) {
                sashC = mix(sashC, wlRepC, 0.75);
                FAC_rough = mix(FAC_rough, 0.30, sashM);
              }` : ''}
              if (sashM > 0.003) {
                albedo = mix(albedo, sashC, sashM);
                FAC_emis *= 1.0 - sashM * 0.92;
                ${U10 ? '' : 'FAC_rough = mix(FAC_rough, 0.38, sashM); // semi-gloss paint'}
              }
            }
            // ---- reveal walls (parallax inset): occlude glass, reflections
            // and glints where the shifted ray left the opening. Which face by
            // largest violation: lintel soffit darkest, sill face lit stone,
            // jambs mid-tone wall; deeper into the reveal shades darker.
            if (revealM > 0.003) {
              float dL2 = -pu, dR2 = pu - Wp, dB2 = -pv, dT2 = pv - Hp;
              float mV = max(max(dL2, dR2), max(dB2, dT2));
              vec3 rev = diffuseColor.rgb * 0.66;
              if (dT2 >= mV - 1e-5) rev = diffuseColor.rgb * 0.40;
              else if (dB2 >= mV - 1e-5) rev = vec3(0.5, 0.47, 0.42) * 1.06;
              rev *= 1.0 - 0.45 * clamp(mV / max(REC, 1e-3), 0.0, 1.0);
              albedo = mix(albedo, rev, revealM);
              FAC_emis *= (1.0 - revealM);
              FAC_rough = mix(FAC_rough, 0.85, revealM);
            }
            if (glassStyle) {
              float mullA = smoothstep(0.045 - aaU, 0.045 + aaU, fx) * (1.0 - smoothstep(0.955 - aaU, 0.955 + aaU, fx))
                          * smoothstep(0.05 - aaV, 0.05 + aaV, fy) * (1.0 - smoothstep(0.95 - aaV, 0.95 + aaV, fy));
              vec3 mullCol = diffuseColor.rgb * 0.45;
              albedo = mix(mullCol, albedo, mullA);
              FAC_emis *= mullA;
              FAC_rough = mix(0.55, FAC_rough, mullA);
              if (fy < 0.3 && fy > 0.05 && style > 2.5 && style < 3.5) { albedo = diffuseColor.rgb * 0.55; FAC_emis = vec3(0.0); FAC_rough = 0.4; }
              // subpixel collapse: blended curtain-wall average
              vec3 cwAvg = mix(diffuseColor.rgb * 0.5, vec3(0.10, 0.125, 0.14), 0.55);
              albedo = mix(albedo, cwAvg, tiny);
              FAC_emis *= (1.0 - tiny * 0.7);
              // ---- tower lobby entrance in the packed door bay: dark portal
              // frame, twin glass leaves w/ center stile + push bars, warm
              // lobby glow (glass styles never had ANY entrance before)
              if (doorPack >= 8.0 && cellU == doorCell && v < 3.9 && tiny < 0.8) {
                float inP = pcov(cuC, 0.5 - 0.38, 0.5 + 0.38, aaU * 1.25) * (1.0 - smoothstep(3.35, 3.6, v));
                float frameB = clamp(max(1.0 - pcov(cuC, 0.5 - 0.30, 0.5 + 0.30, aaU * 1.25), smoothstep(3.1, 3.35, v)), 0.0, 1.0);
                float frameM = inP * frameB;
                albedo = mix(albedo, vec3(0.05, 0.055, 0.06), frameM);
                FAC_emis *= 1.0 - frameM;
                FAC_rough = mix(FAC_rough, 0.35, frameM);
                float inDoor = inP * (1.0 - frameB);
                if (inDoor > 0.003) {
                  float stile = 1.0 - smoothstep(0.015, 0.045, abs(fx - 0.5));
                  float pushb = smoothstep(0.98, 1.02, v) * (1.0 - smoothstep(1.1, 1.14, v));
                  albedo = mix(albedo, vec3(0.05, 0.055, 0.06), inDoor * clamp(stile + pushb, 0.0, 1.0));
                  FAC_emis += vec3(1.0, 0.75, 0.45) * inDoor * (0.3 + night * 1.2);
                }
              }
            } else {
              // punched-window average for subpixel cells: wall w/ darkened fill ratio
              float fill = (x1 - x0) * (y1 - y0);
              vec3 punchAvg = mix(diffuseColor.rgb * 0.98, vec3(0.06, 0.07, 0.08), fill * 0.85);
              albedo = mix(albedo, punchAvg, tiny);
              FAC_emis *= max(winFade, 0.25);
              FAC_rough = mix(FAC_rough, 0.85, tiny);
              // recessed reveal: darken cell top (lintel shadow) + inner edges (AA'd)
              albedo *= mix(1.0, 0.62, smoothstep(y1 - 0.14 - aaV, y1 - 0.14 + aaV, fy) * (1.0 - tiny));
              float edgeD = min(smoothstep(x0 + 0.08 + aaU, x0 + 0.08 - aaU, fx), 1.0) + (1.0 - smoothstep(x1 - 0.08 - aaU, x1 - 0.08 + aaU, fx));
              albedo *= 1.0 - clamp(edgeD, 0.0, 1.0) * 0.2 * (1.0 - tiny);
              // window AC unit (BuildingGeneratorThreeJS kit idea — the NYC
              // staple): ~8% of punched residential cells carry a boxy unit
              // filling the lower sash, slatted vent face, killing the glow
              float acR = hash12(vec2(cellU * 13.7 + wallSeed * 57.0, cellV * 7.9 + cvar * 23.0));
              float acLo = x0 + 0.14, acHi = x1 - 0.14, acTop = y0 + 0.38;
              vec3 acTint = vec3(1.0);
              ${WL11 ? `
              // ---- WL11: the AC units were the most REGULAR thing on the facade — 8 % of
              // cells, independent, and every one of them the same size, the same grey and
              // dead centre in its sash. refs/streetview/morningside (prewar brick, Broadway)
              // has a unit in a quarter of the openings; not one is centred (a window unit
              // sits against one jamb so the accordion panel takes up the rest), they are
              // three different colours and depths, and they CLUSTER by apartment because a
              // flat that buys one buys three. Rate, correlation, position, size, colour.
              acR = wlh(cvI + 1667.0, bkv) * 0.45
                  + wlh(cvI + 1789.0, mod(floor(cellU / 2.0), 64.0) + mod(cellV, 64.0) * 64.0 + 1.0) * 0.55;
              float acW2 = 0.10 + 0.05 * wlh(cvI + 1861.0, bkv);            // half-width: a 0.52-0.78 m unit
              float acSide = wlh(cvI + 1907.0, bkv) < 0.5 ? -1.0 : 1.0;     // hard left or hard right
              float acCx = mix(x0 + acW2 + 0.03, x1 - acW2 - 0.03, acSide * 0.5 + 0.5);
              acLo = acCx - acW2; acHi = acCx + acW2;
              acTop = y0 + 0.26 + 0.14 * wlh(cvI + 2039.0, bkv);
              float acT = wlh(cvI + 2113.0, bkv);
              acTint = acT < 0.5 ? vec3(1.04, 1.03, 1.0) : acT < 0.78 ? vec3(0.94, 0.92, 0.84) : vec3(0.66, 0.67, 0.70);` : ''}
              // WB13: the sided house's single loudest detail after the lap itself is the
              // through-wall / window AC (docs/typology §6 — the "Fedders" sleeve). The
              // "v > 6.0" floor exists to keep units off a tenement's shopfront storey;
              // on a 9 m three-storey house it would leave only the top floor, so the
              // frame belt gets 3.2 m (i.e. everything above the parlour). The condo is
              // excluded on purpose: that generation is PTAC or split, and a grid of
              // window boxes is what makes it read as old stock.
              if (acR < ${WL11 ? '0.26' : '0.08'} && (style < 2.5${WB13 ? ' || sidingS' : ''}) && v > ${WB13 ? '(sidingS ? 3.2 : 6.0)' : '6.0'}) {
                float acM = smoothstep(y0 + 0.02, y0 + 0.06, fy) * (1.0 - smoothstep(acTop - 0.04, acTop, fy))
                          * smoothstep(acLo, acLo + 0.04, fx) * (1.0 - smoothstep(acHi - 0.04, acHi, fx));
                // WL11: own-footprint gate (the E10 rust-run rule). A unit is 0.2-0.3 of a
                // bay; at 26 % of cells rather than 8 % a sub-pixel, cell-decorrelated box
                // is exactly the stipple the project keeps removing. \`tiny\` only reaches
                // zero at ~2 m per pixel, which is far too late for a 0.6 m box.
                acM *= winMask * (1.0 - tiny)${WL11 ? ' * smoothstep(0.24, 0.07, aaU)' : ''};
                vec3 acCol = vec3(0.60, 0.61, 0.60) * acTint * (0.82 + 0.26 * sin(fy * 92.0));
                albedo = mix(albedo, acCol, acM);
                FAC_emis *= 1.0 - acM * 0.9;
                FAC_rough = mix(FAC_rough, 0.55, acM);
              }
            }
            // soften window↔wall boundary with the AA mask
            albedo = mix(diffuseColor.rgb * 0.92, albedo, winMask);
            FAC_emis *= winMask;
            FAC_rough = mix(0.9, FAC_rough, winMask);
          } else {
            FAC_dbg = 0.0;
            // masonry: per-brick coursing with AA mortar joints (PR technique)
            float tone = fbm(vec2(u, v) * 0.03 + cvar * 7.0) * 0.2 - 0.1;   // slow patina
            float mottle = vnoise(vec2(u, v) * 0.7 + cvar * 31.0) * 0.14 - 0.07;
            albedo *= 1.0 + tone + mottle;
            // large weather-stain patches + grounding gradients: splash-zone
            // damp at the base, soot line under the parapet — kills the
            // "vector-clean" mid-distance wall
            float stain = smoothstep(0.55, 0.9, fbm(vec2(u * 0.045, v * 0.11) + cvar * 13.0));
            albedo *= 1.0 - stain * 0.16;
            albedo *= 1.0 - smoothstep(3.4, 0.0, v) * (0.1 + 0.16 * vnoise(vec2(u * 0.5, v * 0.8) + cvar * 19.0)); // splash-zone base grime, varied
            albedo *= 1.0 - smoothstep(bldgH - 2.5, bldgH, v) * 0.1;
            FAC_rough = 0.9;
            // grazing sheen: fired brick and cut stone pick up a low-gloss
            // streak when the view skims the wall (masonry currently went
            // fully matte and carried no light response at all)
            {
              float gDot = abs(dot(normalize(vViewPosition), normalize(vNormal)));
              FAC_rough -= 0.22 * pow(1.0 - gDot, 4.0);
            }
            if (!glassStyle) {
              // ---- Poly Haven wall tiles (CC0): family picked by style, each
              // sample normalized by its own mean and multiplied into the
              // PLUTO-tinted albedo — the photo supplies masonry pattern and
              // grain, the palette keeps per-building identity. Because the
              // ratio mips toward 1.0, distant walls converge to the flat
              // tint (no far-field noise, far macro material untouched).
              {
                vec2 wuv = vec2(u, v);
                vec3 wallT, wallM;
                // WB13: the open-ended "style > 11.5" is CLOSED at 13.5 so ids 14/15
                // (no raw back-ticks in this comment: it is inside a template literal)
                // (siding, rainscreen) do not inherit NYCHA red brick — the exact trap
                // the geo.js NOTE warns about. ?wb13=0 re-opens it (round-12 look).
                if (style < 0.5 || (style > 6.5 && style < 7.5) || (style > 11.5${WB13 ? ' && style < 13.5' : ''})) {        // tenement/industrial/projects: red brick
                  wallT = texture2D(t_wA, wuv * (1.0 / 2.6)).rgb; wallM = vec3(0.126, 0.048, 0.017);
                } else if (style < 1.5) {                                                  // prewar: brown brick
                  wallT = texture2D(t_wB, wuv * (1.0 / 2.4)).rgb; wallM = vec3(0.500, 0.308, 0.158);
                } else if (style < 2.5) {                                                  // postwar: white/tan brick
                  wallT = texture2D(t_wC, wuv * (1.0 / 2.4)).rgb; wallM = vec3(0.304, 0.253, 0.184);
                } else if ((style > 3.5 && style < 5.5) || (style > 7.5 && style < 9.5)) { // deco/rowhouse/civic/church: cut stone
                  wallT = texture2D(t_wS, wuv * (1.0 / 3.4)).rgb; wallM = vec3(0.571, 0.386, 0.221);
                } else if ((style > 5.5 && style < 6.5) || (style > 9.5 && style < 10.5)) {// cast iron/retail: painted plaster
                  wallT = texture2D(t_wP, wuv * (1.0 / 3.0)).rgb; wallM = vec3(0.057, 0.063, 0.072);
                } else { wallT = vec3(0.5); wallM = vec3(0.5); }
                // ---- photo grain, tamed: the raw mean-ratio railed its 0.25-2.6
                // clamp on almost every texel (linear-space texels span ~0.03-0.68
                // against tiny channel means) and read as hard salt-and-pepper up
                // close, with per-CHANNEL clipping adding pink/blue hue confetti.
                // Luminance-led soft-knee (pow keeps gradients where a hard clamp
                // made flat rails), clamped hue at 35%, distance-shaped strength:
                // calm at sniff range, full grain mid-range; mips still converge
                // the ratio to 1.0 so the far field stays the flat PLUTO tint.
                // ---- 2026-09-09 (docs/notes/facades-r6.md §0b): critic r5
                // defect #11 called this "a crazed crushed-gravel speckle that
                // reads as granulated cork or camouflage, with magenta/cyan
                // chromatic fringing on every band edge". Three causes, all
                // here:
                //  1. wStr ramped UP with the pixel footprint —
                //     mix(0.42, 0.62, smoothstep(0.006, 0.05, wFp)) saturates
                //     at 0.05 m/px, i.e. beyond ~30 m — so the photo grain was
                //     at MAXIMUM strength at exactly the 30-600 m distances a
                //     tower is read at, where anisotropic filtering at grazing
                //     incidence under-samples it into per-pixel confetti. The
                //     ramp is now inverted: grain at sniff range, none at
                //     range, and a COURSED ASHLAR term (below, box-filtered)
                //     carries the mid-range read instead.
                //  2. the per-channel wHue push. wallM is
                //     srgbToLinear(mean sRGB), so for cut stone it is
                //     (0.571, 0.386, 0.221) — R/B 2.58 — and a NEUTRAL texel
                //     came out of the ratio at (0.53, 0.78, 1.36): after the
                //     0.6..1.6 clamp and the 35 % mix every texel got its own
                //     hue push of up to -11 % R / +21 % B. That is the
                //     magenta/cyan. Stone families are now LUMINANCE ONLY (a
                //     photo of sandstone may not recolour a limestone tower);
                //     brick keeps a tight hue term because brick-to-brick
                //     colour really is the signal there.
                //  3. the pow(x, 0.55) knee still spanned 0.52x..1.62x, i.e.
                //     +-55 % albedo at texel scale. 0.79x..1.24x now.
                vec3 wRat = wallT / max(wallM, vec3(0.01));
                float wLum = dot(wRat, vec3(0.2126, 0.7152, 0.0722));
                float wLumC = pow(clamp(wLum, 0.55, 1.7), 0.42);      // 0.79x .. 1.24x
                bool wStone = (style > 3.5 && style < 5.5) || (style > 7.5 && style < 9.5)
                            || (style > 5.5 && style < 6.5) || (style > 9.5 && style < 10.5);
                vec3 wHue = clamp(wRat / max(wLum, 0.05), 0.86, 1.16);
                vec3 wRatC = wLumC * mix(vec3(1.0), wHue, wStone ? 0.0 : 0.30);
                float wFp = max(fwidth(u), fwidth(v));                // wall-meters per pixel
                float wStr = mix(0.36, 0.05, smoothstep(0.008, 0.06, wFp));
                albedo *= mix(vec3(1.0), wRatC, wStr);
                // low-frequency hierarchy: 2-6m sun-bleach / repointing blotches so
                // the grain reads as material inside structure, not even noise
                float wBlotch = fbm(vec2(u, v) * 0.27 + cvar * 23.0);
                albedo *= 0.93 + 0.14 * wBlotch;
              }
              // WB13: same closure as the wall-tile family above. Siding has no brick
              // module at all, and a condo's thin-set veneer has a joint no frame ever
              // resolves — both would read as a red brick grid under the tint.
              bool brickish = style < 2.5 || (style > 4.5 && style < 5.5) || (style > 6.5 && style < 8.5) || (style > 11.5${WB13 ? ' && style < 13.5' : ''});
              if (brickish) {
                // brick grid: 0.3m courses, 0.62m bricks, offset alternate rows.
                // Visibility is DERIVATIVE-based (a shader mip): when a brick spans
                // less than ~2px, per-brick variance/joints fade to the mean —
                // this is the fix for mid-range facade "dither" on real GPUs.
                float row = v / 0.3;
                float colB = u / 0.62 + step(0.5, fract(row * 0.5)) * 0.5;
                vec2 bc = vec2(fract(colB), fract(row));
                float aaBu = fwidth(colB), aaBv = fwidth(row);
                float brickVis = smoothstep(0.55, 0.22, max(aaBu, aaBv));
                if (brickVis > 0.003) {
                  float joint = 1.0 - (smoothstep(0.0, 0.045 + aaBu * 1.6, bc.x) * smoothstep(0.0, 0.045 + aaBu * 1.6, 1.0 - bc.x)
                                     * smoothstep(0.0, 0.09 + aaBv * 1.6, bc.y) * smoothstep(0.0, 0.09 + aaBv * 1.6, 1.0 - bc.y));
                  float brickRnd = hash12(vec2(floor(colB) * 3.1, floor(row) * 7.7) + cvar * 13.0);
                  // photo tiles carry the brick pattern now — procedural jitter/
                  // joints are dialed down to a relief accent so the two brick
                  // grids don't visibly clash
                  albedo *= 1.0 + (brickRnd - 0.5) * 0.05 * brickVis;
                  float jointMean = 0.16;
                  albedo = mix(albedo, albedo * 0.62, mix(jointMean, joint, brickVis) * 0.4);
                  FAC_rough += joint * 0.1 * brickVis;
                  FAC_nrmAdj += vec3(dFdx(joint), dFdy(joint), 0.0) * -0.5 * brickVis;
                } else {
                  albedo = mix(albedo, albedo * 0.62, 0.16 * 0.85);
                }
              } else {
                // ---- COURSED ASHLAR (facades-r6 §0b). What replaces the photo
                // grain at 30-600 m on limestone / granite / terracotta: a real
                // STRUCTURE at a frequency the frame can resolve, instead of
                // noise at a frequency it cannot. Both joint families are pcov
                // box-filtered, so each converges to its own mean under
                // minification rather than beating against the pixel grid —
                // the project's stipple rule — and the whole term is
                // derivative-faded so a 2 km tower gets the flat tint.
                bool ashlar = (style > 3.5 && style < 5.5) || (style > 7.5 && style < 9.5);
                float crs = v / 0.66;                                   // 0.66 m bed courses
                float aaCr = max(fwidth(crs), 1e-4);
                float crVis = ashlar ? smoothstep(0.80, 0.10, aaCr) : 0.0;
                if (crVis > 0.004) {
                  float crJ = 1.0 - pcov(crs, 0.05, 0.985, aaCr * 1.25);          // bed joint
                  float blk = u / 1.32 + step(0.5, fract(crs * 0.5)) * 0.5;       // 1.32 m blocks, alternate courses broken
                  float aaBk = max(fwidth(blk), 1e-4);
                  float bkJ = 1.0 - pcov(blk, 0.035, 0.99, aaBk * 1.25);          // perpend joint
                  float joint = clamp(crJ + bkJ * 0.75, 0.0, 1.0);
                  float bTone = hash12(vec2(floor(blk) * 2.7, floor(crs) * 5.3) + cvar * 17.0);
                  albedo *= 1.0 + (bTone - 0.5) * 0.07 * crVis;         // block-to-block value spread
                  albedo *= 1.0 - joint * 0.19 * crVis;                 // the joints are recessed and in shadow
                  FAC_nrmAdj += vec3(dFdx(joint), dFdy(joint), 0.0) * -0.42 * crVis;
                  FAC_rough = min(FAC_rough + joint * 0.05 * crVis, 0.98);
                }
                // ---- and the SPANDREL-AND-MULLION read for a prewar tower:
                // a continuous vertical pier every bay with the spandrel set
                // back between stacked windows is what makes a setback-era
                // shaft read as verticals at a kilometre. The tower block's
                // (b) pier term is a value step only; this gives it relief, so
                // the piers catch the sun and the spandrels do not.
                if (bldgH > 26.0 && inBay) {
                  float pv2 = (u - sideM) / winW;
                  float aaP2 = max(fwidth(pv2), 1e-4);
                  // WL11: the BASE opening — pcov is periodic, and a per-cell (lo,hi)
                  // makes pcovI's floor(x)*(hi-lo) term jump at every cell boundary,
                  // i.e. a bright line down every pier. The pier rhythm is a per-wall
                  // read anyway; it does not want the per-bay jitter.
                  float pierM = 1.0 - pcov(pv2, xb0 - 0.06, xb1 + 0.06, aaP2 * 1.25);
                  float pVis = smoothstep(0.85, 0.16, aaP2);
                  FAC_nrmAdj += vec3(-dFdx(pierM), 0.0, 0.0) * 0.55 * pVis;
                  albedo *= 1.0 + pierM * 0.035 * pVis;
                }
              }
              ${WB13 ? `
              // ================= WB13: LAP SIDING (STYLE.FRAME_HOUSE) =================
              // docs/notes/wburg-r13.md, docs/typology/08-vinyl-rowhouse.md §3. The
              // typology's own first line: "the EXPOSURE sets the horizontal texture
              // that defines this typology at every distance. Get this wrong and
              // nothing else saves the model." So the exposure is not one constant —
              // the trade sizes and their shares are Double-4 0.102 m (.34), Double-5
              // 0.127 (.26), Double-4.5 0.114 (.18), Double-3.5 0.089 (.08) and the
              // aluminium singles 0.152 / 0.203 — drawn per BUILDING off cvar, so a row
              // of six re-clads laps at six pitches the way a real street does.
              if (sidingS) {
                float aaUm = max(fwidth(u), 1e-4);          // wall metres per pixel, u
                float expR = hash12(vec2(floor(cvar * 191.0), 3.17));
                float expo = expR < 0.34 ? 0.102 : expR < 0.60 ? 0.127 : expR < 0.78 ? 0.114
                           : expR < 0.86 ? 0.089 : expR < 0.95 ? 0.152 : 0.203;
                float crsS = v / expo;
                float aaCs = max(fwidth(crsS), 1e-4);
                // Derivative fade, the project's stipple rule: under ~1.5 px per course
                // the lap converges to its own mean instead of beating against the pixel
                // grid. A 0.102 m course is ~1 px at 220 m in the 1080p aerial, which is
                // exactly where the aerial plate is shot from — so the aerial reads the
                // COLOUR and the roofline, and the street plates read the lap.
                float lapVis = smoothstep(0.75, 0.16, aaCs);
                float fcS = fract(crsS);
                // The profile, in the SAME sense as the hero generator's relief pass
                // (src/buildings/rowhouse.js sidingRelief): a board's butt is at its
                // BOTTOM and catches the light; the darkest line on the wall is the
                // shadow the butt of the board ABOVE throws on the top of this one. So
                // in wall space, fract -> 1 is the shadow and fract -> 0 is the drip
                // edge, and the face ramps between them. Both members are pcov
                // box-filtered, so each converges to its own AREA under minification
                // instead of beating against the pixel grid.
                float butt = 1.0 - pcov(crsS, 0.0, 0.945, aaCs * 1.25);   // top 5.5 % = the 10-16 mm lap step
                float lip  = pcov(crsS, 0.0, 0.10, aaCs * 1.25);          // the drip edge, in the light
                float face = 1.0 - fcS;                                    // ramp out of the shadow
                albedo *= mix(1.0, (1.0 - butt * 0.32) * (0.960 + face * 0.066) * (1.0 + lip * 0.055), lapVis);
                // ...and the RELIEF, which is what actually sells it: a lit wall goes
                // striped and a shaded one goes flat, which is how you tell siding from
                // a painted-on texture in an oblique aerial.
                FAC_nrmAdj += vec3(dFdx(butt), dFdy(butt), 0.0) * -0.70 * lapVis;
                // ---- butt joints (§3.3, "non-negotiable for realism"). A panel runs
                // 3.66 m, so a 6.10 m front carries 1-2 seams per course and never zero;
                // adjacent courses are staggered by >= 0.61 m on the installer's 6-value
                // cut-off cycle, which is quasi-periodic rather than white noise because
                // a real installer works from a small pile of offcuts.
                float cIdx = floor(crsS);
                float k6 = mod(cIdx + floor(hash12(vec2(floor(cvar * 71.0), 11.3)) * 6.0), 6.0);
                float offS = k6 < 0.5 ? 0.0 : k6 < 1.5 ? 1.22 : k6 < 2.5 ? 2.44
                           : k6 < 3.5 ? 0.61 : k6 < 4.5 ? 1.83 : 3.05;
                float runS = (u + offS) / 3.66;
                float aaRs = max(fwidth(runS), 1e-4);
                float seamS = (1.0 - pcov(runS, 0.0016, 1.0, aaRs * 1.25)) * smoothstep(0.40, 0.09, aaRs) * lapVis;
                albedo *= 1.0 - seamS * 0.12;
                // ---- panel wave (§ WEATHERING, "mandatory, all vinyl"): 3-8 mm over a
                // 1.0-1.5 m wavelength, along the run only. Vinyl hangs loose on nail
                // slots and a dead-flat plane is the fastest CG tell there is.
                float waveS = sin((u + cvar * 37.0) * 4.6) * sin((u * 0.37 + cvar * 11.0));
                // (both screen derivatives, not just dFdx: waveS depends on u alone, and
                // on a wall whose u axis runs down the screen dFdx of it is identically
                // zero — the wave would vanish on exactly half the buildings in a block.)
                FAC_nrmAdj += vec3(dFdx(waveS), dFdy(waveS), 0.0) * 0.30 * smoothstep(0.10, 0.02, aaUm);
                // ---- chalking (UV binder erosion): 8-25 % luminance lift, starting
                // 1.5 m above grade and increasing upward, masked under the cornice
                // soffit. This is what stops a pale palette reading as new suburban
                // vinyl and starts it reading as thirty-year-old plastic.
                float chalkA = 0.05 + 0.13 * hash12(vec2(floor(cvar * 233.0), 17.3));
                float chalk = smoothstep(1.5, 11.0, v) * chalkA * (1.0 - smoothstep(bldgH - 1.6, bldgH - 0.6, v) * 0.7);
                albedo = mix(albedo, albedo * 0.80 + vec3(0.155, 0.153, 0.146), chalk);
                // vinyl is low-gloss PLASTIC, not fired clay: 0.55-0.75, and aluminium
                // (the wide singles) a little crisper still.
                FAC_rough = expo > 0.14 ? 0.52 : 0.66;
                // ---- white trim on coloured siding — p 0.72, and the single strongest
                // mid-distance tell in the typology (§4). Two members: the outside
                // CORNER POST at each wall end, and the brickmold CASING round every
                // opening. Without them a sided wall reads as a printed texture, which
                // is precisely what a flat tint with a lap pattern is.
                float trimR = hash12(vec2(floor(cvar * 149.0), 5.9));
                vec3 trimC = trimR < 0.72 ? vec3(0.585, 0.578, 0.552)      // white  #f2f1ec, on the shader's value ladder
                           : trimR < 0.88 ? vec3(0.545, 0.505, 0.400)      // almond #e8e1cd
                           : diffuseColor.rgb * 1.10;                      // matched to the field (0.12)
                float dEndS = min(u, wallLen - u);
                float postM = smoothstep(0.082 + aaUm, 0.082 - aaUm, dEndS) * smoothstep(0.22, 0.05, aaUm);
                albedo = mix(albedo, trimC, postM * 0.90);
                FAC_rough = mix(FAC_rough, 0.45, postM);
                if (inBay) {
                  float du0 = (x0 - fx) * winW, du1 = (fx - x1) * winW;    // metres outside the opening
                  float dv0 = (y0 - fy) * floorH, dv1 = (fy - y1) * floorH;
                  float dOut = max(max(du0, du1), max(dv0, dv1));
                  float aaTm = max(fwidth(dOut), 1e-4);
                  float caseM = smoothstep(-aaTm, aaTm, dOut) * smoothstep(0.072 + aaTm, 0.072 - aaTm, dOut)
                              * smoothstep(0.16, 0.04, aaTm);
                  albedo = mix(albedo, trimC, caseM * 0.92);
                  FAC_rough = mix(FAC_rough, 0.42, caseM);
                }
              }
              // ============= WB13: RAINSCREEN + SLAB (STYLE.CONDO_NEW) =============
              // The post-2000 4-9 floor condo. No masonry module: the cladding is a
              // cassette panel on a 1.2-1.5 m module with an open joint, or thin-set
              // brick veneer whose joint no frame at this distance resolves. What DOES
              // read is the grid — vertical joints on the panel module, a horizontal
              // joint at every floor line, and the projecting SLAB EDGE / balcony line
              // that is the silhouette difference between this and the walk-up next door.
              if (condoS) {
                float panW = 1.15 + 0.45 * hash12(vec2(floor(cvar * 173.0), 9.1));
                float pnU = u / panW;
                float aaPn = max(fwidth(pnU), 1e-4);
                float pnVis = smoothstep(0.55, 0.14, aaPn);
                float jV = (1.0 - pcov(pnU, 0.010, 1.0, aaPn * 1.25)) * pnVis;     // open vertical joint
                float rowC = v / floorH;
                float aaRc = max(fwidth(rowC), 1e-4);
                float jH = (1.0 - pcov(rowC, 0.012, 1.0, aaRc * 1.25)) * smoothstep(0.55, 0.14, aaRc);
                float pnTint = hash12(vec2(floor(pnU) * 3.7, floor(rowC) * 6.1 + cvar * 43.0));
                albedo *= 1.0 + (pnTint - 0.5) * 0.055 * pnVis;   // cassette-to-cassette batch spread
                albedo *= 1.0 - clamp(jV + jH * 0.85, 0.0, 1.0) * 0.30;
                FAC_nrmAdj += vec3(dFdx(jV + jH), dFdy(jV + jH), 0.0) * -0.45;
                // spandrel course under each window band: the panel between the head of
                // one floor's glazing and the sill of the next is a different (darker)
                // cassette on nearly every building of this generation.
                // (rcVis on every fract(rowC) term below, not just the slab: an
                // unfiltered smoothstep on a fract() is exactly the stipple this project
                // keeps removing — once a floor is under ~2 px the band wraps inside the
                // pixel and turns into per-pixel noise. Faded to its mean instead.)
                float rcVis = smoothstep(0.55, 0.14, aaRc);
                float spF = fract(rowC);
                float spM = smoothstep(y1 - 0.02, y1 + 0.05, spF) * (1.0 - smoothstep(0.985, 1.0, spF)) * rcVis;
                albedo *= 1.0 - spM * 0.14;
                // the slab edge / balcony line: a 0.22 m band of exposed concrete at
                // every floor, lighter than the cladding and casting its own line. This
                // is the horizontal banding that reads at 300 m in the aerial.
                float slab = smoothstep(0.0, 0.055, spF) * (1.0 - smoothstep(0.075, 0.13, spF)) * rcVis;
                albedo = mix(albedo, vec3(0.44, 0.435, 0.415), slab * 0.55);
                albedo *= 1.0 - smoothstep(0.075, 0.13, spF) * (1.0 - smoothstep(0.13, 0.20, spF)) * rcVis * 0.22;   // its shadow
                FAC_rough = 0.58;
              }` : ''}
              // ---- opening-anchored weathering: rain wash bleeding down
              // from each sill, lime leach under the coping, party-wall soot
              // at the facade edges — grime forms where water sheds, not in
              // free-floating noise patches
              if (inBay && bldgH > 6.0 && tiny < 0.9) {
                float belowS = (y0 - fy) * floorH; // meters below this cell's sill
                if (belowS > 0.0) {
                  float sNw = 0.4 + 0.6 * vnoise(vec2(u * 2.7, cellV * 5.0 + cvar * 11.0));
                  float sProf = smoothstep(x0 - 0.04, x0 + 0.16, fx) * smoothstep(x1 + 0.04, x1 - 0.16, fx);
                  albedo *= 1.0 - sProf * smoothstep(1.15, 0.02, belowS) * sNw * 0.2 * (1.0 - tiny);
                }
              }
              {
                float dTopW = bldgH - 1.95 - v; // lime run-off under the coping
                if (dTopW > -0.2 && dTopW < 1.6) {
                  float limeN = smoothstep(0.6, 0.95, vnoise(vec2(u * 2.9, cvar * 47.0)));
                  float lime = limeN * smoothstep(-0.1, 0.12, dTopW) * smoothstep(1.5, 0.25, dTopW);
                  albedo = mix(albedo, albedo * 1.3 + vec3(0.05), lime * 0.45);
                }
              }
              {
                float dEndW = min(u, wallLen - u); // party-wall joint soot
                float eNw = 0.55 + 0.45 * vnoise(vec2(v * 0.6, wallSeed * 31.0));
                albedo *= 1.0 - smoothstep(0.85, 0.04, dEndW) * eNw * 0.13;
              }
              ${MAT9 ? `
              // ---- MAT9 (brief A.4): weathering keyed on HEIGHT. Every grime term the
              // r8 shader had was anchored to an opening (rain wash under a sill) or to a
              // wall END (party-wall soot), so a wall was exactly as clean at 2 m as at
              // 40 m. On a real street wall height is the strongest weathering axis there
              // is: traffic film and splash at the bottom, dirt pooling against the back
              // of the coping at the top, exhaust and sign wash over a shopfront.
              {
                // (i) traffic film + splash: the bottom three storeys of every masonry
                // street wall in Manhattan are darker than the shaft
                float sootN = 0.55 + 0.45 * fbm(vec2(u * 0.33, v * 0.12) + cvar * 37.0);
                albedo *= 1.0 - smoothstep(14.0, 0.0, v) * sootN * 0.17;
                // (ii) grime at the parapet line. The lime-leach term above LIGHTENS the
                // last 1.5 m (calcium carried out of the mortar); the dirt that water
                // carries INTO the same joint darkens it. Both are real, they interleave
                // up a run, and having only the light one is why our rooflines read as
                // freshly capped.
                float dTopG = bldgH - v;
                float parN = 0.4 + 0.6 * vnoise(vec2(u * 1.7, cvar * 19.0));
                albedo *= 1.0 - smoothstep(2.3, 0.4, dTopG) * smoothstep(-0.1, 0.3, dTopG) * parN * 0.2;
                // (iii) grime above the storefront: the band over a shop fascia collects
                // kitchen exhaust, sign wash and whatever runs off the awning
                if (store && storeH > 1.0) {
                  float dS = v - storeH;
                  float sN = 0.45 + 0.55 * vnoise(vec2(u * 2.1 + cvar * 53.0, v * 0.9));
                  albedo *= 1.0 - smoothstep(2.4, 0.0, dS) * step(0.0, dS) * sN * 0.16;
                }
              }` : ''}
              ${E10 ? `
              // ---- E10 (brief B): THE CONTACTS. MAT9 keyed weathering on HEIGHT, which
              // is a gradient over 14 m; what a photograph actually shows is dirt packed
              // into JOINTS — a 0.3-1.5 m accent exactly where two surfaces meet. Three of
              // them live on a masonry street wall, and all three are missing:
              //   * the WALL/SIDEWALK joint. Splash off the flags, dog urine, salt and the
              //     sweepings a super piles against the building line: the bottom 1.2 m of
              //     every unpainted wall in New York is materially different from the wall
              //     1 m higher. It is ALSO where efflorescence blooms — salt carried out of
              //     the brick by rising damp and left as a pale mineral crust — so the band
              //     is not simply darker, it is darker WITH a pale bloom in it, and that
              //     contrast is the read.
              //   * the SILL joint. MAT9/r8 wash the wall below a sill uniformly; real
              //     run-off leaves the CENTRE cleaner than the two ENDS, because a sill
              //     sheds to its drip ends. Two dark runs, not one broad smudge.
              //   * the AC SLEEVE. A through-wall or window unit rusts and drips: a narrow
              //     rust-brown run under one opening in five or six on a residential wall.
              //     This is the single most New York mark on a brick facade and we had none.
              // All three are anchored to a datum (v = 0, the sill line, the bay), so none
              // of them is free-floating noise, and all three are 0.2-1.5 m features.
              {
                // (i) the sidewalk-to-wall joint
                float cN = 0.45 + 0.55 * fbm(vec2(u * 0.7, v * 1.1) + cvar * 71.0);
                float splash = smoothstep(1.35, 0.02, v) * cN;
                albedo *= 1.0 - splash * 0.26;
                float bloomN = smoothstep(0.55, 0.93, vnoise(vec2(u * 1.25 + cvar * 23.0, v * 2.2)));
                float bloom = bloomN * smoothstep(1.05, 0.12, v) * smoothstep(0.02, 0.22, v) * (1.0 - tiny);
                albedo = mix(albedo, albedo * 0.55 + vec3(0.125, 0.121, 0.112), bloom * 0.5);
                FAC_rough = min(0.99, FAC_rough + bloom * 0.06);
                // the hard line AT grade: where the flags butt the wall there is a 6-10 cm
                // shadow-and-grit seam that no amount of gradient reproduces
                albedo *= 1.0 - smoothstep(0.16, 0.0, v) * 0.34;
              }
              if (inBay && tiny < 0.9 && bldgH > 6.0) {
                // (ii) sill drip ENDS + the dark line under the sill lip
                float belowE = (y0 - fy) * floorH;
                if (belowE > -0.04 && belowE < 1.5) {
                  float endP = smoothstep(0.20, 0.05, abs(fx - x0 - 0.055)) + smoothstep(0.20, 0.05, abs(fx - x1 + 0.055));
                  float dripN = 0.35 + 0.65 * vnoise(vec2(u * 3.9, cellV * 7.0 + cvar * 13.0));
                  albedo *= 1.0 - clamp(endP, 0.0, 1.0) * smoothstep(1.45, 0.0, belowE) * dripN * 0.26;
                  // the lip line itself: 4 cm of shadow directly under the stone
                  float lipM = smoothstep(-0.02, 0.01, belowE) * smoothstep(0.11, 0.02, belowE)
                             * smoothstep(x0 - 0.09, x0 + 0.02, fx) * smoothstep(x1 + 0.09, x1 - 0.02, fx);
                  // 9 cm of wall: faded on its own footprint, not on the generic tiny
                  albedo *= 1.0 - lipM * 0.30 * smoothstep(0.050, 0.015, aaV);
                }
                // (iii) AC sleeve rust run, ~17 % of residential openings
                bool resiW = style < 2.5 || (style > 4.5 && style < 5.5) || style > 11.5;
                if (resiW && v > 3.0 && belowE > 0.0) {
                  float acR = hash12(vec2(cellUS * 13.3, cellV * 5.9 + cvar * 29.0));
                  if (acR < 0.17) {
                    float acX = x0 + 0.20 + 0.34 * fract(acR * 37.0);
                    float acW = 0.055 + 0.035 * fract(acR * 91.0);
                    float rustP = smoothstep(acW + 0.05, acW - 0.03, abs(fx - acX));
                    float rustN = 0.4 + 0.6 * vnoise(vec2(u * 6.0 + cvar * 7.0, v * 1.6));
                    // own-footprint gate, NOT the generic tiny: this streak is 0.1 of a
                    // bay (~0.3 m) and it is hash-gated per opening, so once a bay drops
                    // under ~7 px the streak is sub-pixel AND decorrelated cell to cell,
                    // which is a stipple. tiny only reaches zero at ~2 m per pixel.
                    float rust = rustP * smoothstep(1.45, 0.0, belowE) * rustN * smoothstep(0.15, 0.045, aaU);
                    albedo = mix(albedo, albedo * vec3(0.86, 0.52, 0.34), rust * 0.62);
                  }
                }
              }` : ''}
              // repointed panels: masonry ages in bay-aligned rectangles
              // (mortar campaigns, roof-leak lines) — the big low-frequency
              // value structure real brick facades carry between floors
              {
                float pnl = hash12(vec2(floor(cuC / 2.0) + wallSeed * 19.0, floor(v / (floorH * 2.0)) * 1.7 + cvar * 29.0));
                albedo *= ${MAT9 ? '0.88 + 0.24 * pnl' : '0.93 + 0.14 * pnl'};
                ${MAT9 ? `
                // MAT9: the panel tier was ±7 % of value and nothing else, so a whole
                // facade still read as one hue at 60 m (§2.2: ours 10-17 % sd/mean at the
                // 3-8 m scale, the reference 28 %). Three changes, all low-frequency:
                //  * ±7 % -> ±12 % on the 2-bay x 2-floor panel (≈ 6 x 8 m);
                //  * one panel in four shifts HUE as well — a repointing campaign is a
                //    different batch of brick, not a different exposure of the same one,
                //    and hue is what makes it read as repaired rather than as noise;
                //  * a coarser ~6-bay x 12 m tier on top of it (a facade rebuilt above a
                //    floor line, a leak stain down a bay group, a cleaned section).
                float pHue = hash12(vec2(floor(cuC / 2.0) * 5.3 + cvar * 61.0, floor(v / (floorH * 2.0)) + wallSeed * 7.0));
                // 0.55 -> 0.20 after the measurement in §2.2b: our facades already carry 4-7x the
                // reference's WITHIN-facade hue spread (R-B sd 11.6-20.5 against 2.4-2.9), so a
                // hue push adds to the statistic we are already over on. Kept small, because a
                // repointed panel really is a different batch — it just is not a big hue move.
                albedo *= mix(vec3(1.0), vec3(1.11, 0.93, 0.86), smoothstep(0.74, 0.98, pHue) * 0.20);
                float big = hash12(vec2(floor(cuC / 6.0) * 2.9 + wallSeed * 31.0, floor(v / 12.0) * 3.3 + cvar * 17.0));
                albedo *= 0.93 + 0.14 * big;` : ''}
              }
              // pier-line drip channels: thin dark verticals where water runs
              // down the bay boundaries, strength varying up the wall
              {
                float bEdge = min(fx, 1.0 - fx);
                float dripN = 0.5 + 0.5 * vnoise(vec2(cellU * 7.7 + wallSeed * 23.0, v * 0.1));
                albedo *= 1.0 - smoothstep(0.16, 0.02, bEdge) * dripN * 0.1 * (1.0 - tiny);
              }
              // soot streaks pooling downward + string course every 6 floors
              float streak = fbm(vec2(u * 0.11, v * 0.06) + cvar * 3.0);
              albedo *= 1.0 - smoothstep(0.25, 0.8, streak) * 0.18;
              float six = fract(v / (floorH * 6.0));
              if (six > 0.985 || six < 0.012) albedo *= 1.14; // string course highlight
              if (fy < 0.1) albedo *= 0.93;
              if (fy > y1 && fy < y1 + 0.07) albedo *= 0.75;
              if (fy > y0 - 0.06 && fy < y0) albedo *= 1.1;
              ${WL11 ? `
              // ---- WL11: the INFILL of a bricked-up opening. \`wlBrick\` is the opening's
              // own coverage on a fragment the window branch has handed back to the wall.
              // What makes a filled opening read as filled, in the order the eye takes it:
              //   1. it is a DIFFERENT batch of brick — usually greyer and flatter than the
              //      wall around it, sometimes concrete block, never a perfect match;
              //   2. its courses do not line up with the wall's, so there is a visible
              //      break at the jamb;
              //   3. it is set BACK 5-10 cm in the old reveal, so the head and the jambs
              //      carry a shadow the field does not;
              //   4. the sill and the lintel are still there — the two lines above this
              //      block draw them, and they are drawn on the JITTERED y0/y1, so they
              //      stay with the opening they belong to.
              if (wlBrick > 0.002) {
                float bTone2 = wlh(cvI + 509.0, bkv);
                // grey CMU on a third, a redder/flatter brick on the rest
                vec3 fillC = bTone2 < 0.34 ? vec3(0.42, 0.41, 0.39) : mix(vec3(0.34, 0.25, 0.21), vec3(0.46, 0.37, 0.31), bTone2);
                fillC *= 0.86 + 0.22 * vnoise(vec2(u * 1.7, v * 2.3) + cvI * 0.031);
                // the infill's own coursing, offset from the wall's (0.082 m courses,
                // half-lapped) and box-filtered so it converges instead of aliasing
                float ic = (v + 0.031 * (1.0 + bTone2)) / 0.082;
                float aaIc = max(fwidth(ic), 1e-4);
                float icJ = 1.0 - pcov(ic, 0.10, 0.97, aaIc * 1.25);
                float ib = u / 0.21 + step(0.5, fract(ic * 0.5)) * 0.5;
                float aaIb = max(fwidth(ib), 1e-4);
                float ibJ = 1.0 - pcov(ib, 0.06, 0.98, aaIb * 1.25);
                float icVis = smoothstep(0.9, 0.15, aaIc);
                fillC *= 1.0 - clamp(icJ + ibJ * 0.7, 0.0, 1.0) * 0.16 * icVis;
                // set back in the reveal: the head is darkest, the jambs next, the sill
                // catches light. 0.16 of a bay / 0.10 of a floor ~ the 6-10 cm recess.
                float rvT = smoothstep(y1, y1 - 0.10, fy);
                float rvL = smoothstep(x0, x0 + 0.06, fx) * smoothstep(x1, x1 - 0.06, fx);
                fillC *= mix(0.62, 1.0, rvT) * mix(0.78, 1.0, rvL);
                fillC *= 1.0 - smoothstep(0.55, 0.0, (fy - y0) / max(y1 - y0, 0.01)) * 0.10; // dirt sits in the bottom of the reveal
                albedo = mix(albedo, fillC, wlBrick * (1.0 - tiny));
                FAC_rough = mix(FAC_rough, 0.95, wlBrick * (1.0 - tiny));
              }` : ''}
              if (loftStyle && (fx < 0.06 || fx > 0.94)) albedo *= 1.12;
              // ---- embossed corner quoins: alternating 0.6m stone blocks at
              // both wall ends (matches the hero-ring geometry so nothing pops
              // at the ring boundary). Lightened stone + per-course tint + a
              // relief normal from the mask gradient; derivative-faded.
              if (!loftStyle && style < 9.5 && bldgH > 8.0 && wallLen > 4.0 && v < bldgH - 1.2) {
                float courseQ = floor(v / 0.6);
                float wQ = 0.55 * (mod(courseQ, 2.0) > 0.5 ? 1.0 : 0.66);
                float dEnd = min(u, wallLen - u);
                float aaQ = max(fwidth(u), 1e-4);
                float qVis = smoothstep(0.5, 0.2, fwidth(v) / 0.6) * (1.0 - tiny);
                float qM = smoothstep(wQ + aaQ, wQ - aaQ, dEnd) * qVis;
                if (qM > 0.003) {
                  float jvQ = fract(v / 0.6);
                  float aaJv = fwidth(v) / 0.6;
                  float qJoint = 1.0 - smoothstep(0.0, 0.07 + aaJv * 1.5, jvQ) * smoothstep(0.0, 0.07 + aaJv * 1.5, 1.0 - jvQ);
                  float qTint = 0.9 + 0.2 * hash12(vec2(courseQ * 3.7, wallSeed * 91.0));
                  vec3 qCol = vec3(0.585, 0.565, 0.525) * qTint * (1.0 - qJoint * 0.35);
                  albedo = mix(albedo, qCol, qM * 0.85);
                  FAC_rough = mix(FAC_rough, 0.72, qM * 0.6);
                  FAC_nrmAdj += vec3(dFdx(qM * (1.0 - qJoint)), dFdy(qM * (1.0 - qJoint)), 0.0) * 0.3 * qVis;
                }
              }
              // ---- keystone over the lintel + twin brackets under the sill
              // (stone-dressed styles): the small punctuation that makes bays
              // read hand-built instead of stamped. Bay-gated, AA'd, near-only.
              bool stoneD = (style > 0.5 && style < 2.5) || (style > 3.5 && style < 5.5) || (style > 7.5 && style < 9.5);
              if (stoneD && inBay && !(doorWall && cellU == doorCell && v < 3.6) && tiny < 0.7) {
                float aaFy = max(fwidth(fy), 1e-4);
                float kW = 0.05 + max(fy - y1, 0.0) * 0.35;
                float keyM = smoothstep(y1 - aaFy, y1 + 0.02, fy) * (1.0 - smoothstep(y1 + 0.14, y1 + 0.16 + aaFy, fy))
                           * smoothstep(kW + aaU, kW - aaU, abs(fx - 0.5)) * (1.0 - tiny);
                // stone tone derived from the wall like heroFacades' trim —
                // keystones sit IN the palette instead of floating chalk-white
                float lumW = dot(diffuseColor.rgb, vec3(0.4, 0.45, 0.15));
                vec3 keyC = vec3(1.03, 1.0, 0.93) * (0.40 + lumW * 0.38) * (0.94 + 0.12 * hash12(vec2(cellUS * 9.1, cvar * 61.0)));
                albedo = mix(albedo, keyC, keyM * 0.92);
                float bM = clamp(smoothstep(0.035 + aaU, 0.035 - aaU, abs(fx - x0 - 0.09)) + smoothstep(0.035 + aaU, 0.035 - aaU, abs(fx - x1 + 0.09)), 0.0, 1.0)
                         * smoothstep(y0 - 0.16, y0 - 0.13 + aaFy, fy) * (1.0 - smoothstep(y0 - 0.075, y0 - 0.06 + aaFy, fy)) * (1.0 - tiny);
                albedo = mix(albedo, albedo * vec3(0.58, 0.56, 0.55), bM * 0.85);
                FAC_nrmAdj += vec3(dFdx(keyM - bM), dFdy(keyM - bM), 0.0) * 0.22 * (1.0 - tiny);
              }
            } else { albedo = diffuseColor.rgb * 0.55; FAC_rough = 0.4; }
            if (v < 4.5 && !store && style < 9.0 && bldgH > 20.0) {
              // rusticated limestone water table (was one flat pasted band):
              // 0.56m coursing + running-bond block verticals via pcov, per-
              // course tint (derivative-gated), plinth grime, AA'd top edge
              float aaWv = max(fwidth(v), 1e-4);
              float crs = v / 0.56;
              float crsVis = smoothstep(0.55, 0.22, fwidth(crs)); // hash/offset terms fade before they can stipple
              float cJ = 1.0 - pcov(crs, 0.055, 0.97, max(fwidth(crs), 1e-4) * 1.25);
              float cId = floor(crs);
              float bTint = 1.0 + (hash12(vec2(cId * 3.3, wallSeed * 71.0)) - 0.5) * 0.16 * crsVis;
              float blk = u / 1.15 + mod(cId, 2.0) * 0.5;
              float bJ = (1.0 - pcov(blk, 0.03, 0.985, max(fwidth(blk), 1e-4) * 1.25)) * crsVis;
              vec3 baseC = vec3(0.70, 0.67, 0.60) * bTint;
              baseC *= 1.0 - max(cJ, bJ * 0.7) * 0.36;
              baseC *= 1.0 - smoothstep(0.55, 0.0, v) * 0.22; // plinth shadow/grime
              ${E10 ? `
              // E10: a water table is a PROJECTING course, so it makes two contacts and
              // both are dark. At its TOP the stone is washed clean and the wall above it
              // is shielded, but the 6-10 cm immediately under the projection is a
              // permanent shadow-and-soot line (this is what makes a rusticated base read
              // as base and not as paint). At its FOOT the splash zone of the E10 wall term
              // lands on stone instead of brick, where it shows far more because limestone
              // is pale. Both anchored to the band's own datum, both ~0.1-0.6 m.
              baseC *= 1.0 - smoothstep(4.50, 4.38, v) * smoothstep(4.28, 4.40, v) * 0.30;
              baseC *= 1.0 - smoothstep(0.85, 0.05, v) * (0.30 + 0.30 * vnoise(vec2(u * 0.9 + cvar * 17.0, v * 1.7)));
              baseC = mix(baseC, baseC * 0.6 + vec3(0.16, 0.155, 0.145),
                          smoothstep(0.58, 0.92, vnoise(vec2(u * 1.6 + cvar * 31.0, v * 2.4))) * smoothstep(0.9, 0.1, v) * 0.45);` : ''}
              float bandM = smoothstep(4.5 + aaWv, 4.5 - aaWv, v) * (1.0 - tiny);
              albedo = mix(albedo, baseC, 0.72 * bandM);
              FAC_rough = mix(FAC_rough, 0.7, bandM);
              FAC_nrmAdj += vec3(dFdx(-cJ * bandM), dFdy(-cJ * bandM), 0.0) * 0.3 * crsVis;
            }
            // ---- entrance door (painted slab, casing, transom, entry light)
            if (doorWall && cellU == doorCell && v < 3.6 && tiny < 0.8) {
              float aaM = max(fwidth(v), 1e-3);
              float caseM = pcov(cuC, 0.5 - 0.36, 0.5 + 0.36, aaU * 1.25) * smoothstep(2.95 + aaM, 2.86 - aaM, v);
              float doorM = pcov(cuC, 0.5 - 0.28, 0.5 + 0.28, aaU * 1.25) * smoothstep(2.72 + aaM, 2.63 - aaM, v);
              // painted casing slightly proud of the wall
              albedo = mix(albedo, vec3(0.58, 0.56, 0.51), caseM * 0.9);
              if (doorM > 0.003) {
                float dfx = clamp((fx - 0.5) / 0.28, -1.0, 1.0);
                // paint color index packed with the bay (shared with heroFacades)
                vec3 dCol = doorColI < 0.5 ? vec3(0.16, 0.11, 0.08)     // dark wood
                          : doorColI < 1.5 ? vec3(0.26, 0.09, 0.08)     // oxblood
                          : doorColI < 2.5 ? vec3(0.09, 0.14, 0.12)     // bottle green
                          : vec3(0.12, 0.12, 0.14);                     // black steel
                // recessed reveal shading + twin panels + kick plate
                vec3 slab = dCol * (0.72 + 0.28 * smoothstep(1.0, 0.55, abs(dfx)));
                float panel = smoothstep(0.12, 0.2, abs(dfx)) * (1.0 - smoothstep(0.72, 0.8, abs(dfx)))
                            * smoothstep(0.3, 0.42, v) * (1.0 - smoothstep(2.2, 2.32, v));
                slab *= 1.0 - panel * 0.22;
                if (v < 0.28) slab = vec3(0.32, 0.33, 0.34); // kick plate
                // transom glass above the leaves
                if (v > 2.32 && v < 2.63) {
                  slab = vec3(0.07, 0.09, 0.1);
                  FAC_emis += vec3(1.0, 0.8, 0.5) * night * 0.5 * doorM;
                }
                albedo = mix(albedo, slab, doorM);
                FAC_rough = mix(FAC_rough, 0.45, doorM);
              }
              // warm entry light over the door
              float dl = length(vec2((fx - 0.5) * winW, v - 2.98));
              float lampD = smoothstep(0.15, 0.06, dl);
              albedo = mix(albedo, vec3(0.2, 0.19, 0.17), lampD);
              FAC_emis += vec3(1.0, 0.72, 0.4) * night * lampD * 2.4;
            }
          }
          #ifdef TOWERFX
          // ================= SKYSCRAPER PASS — TOWER FACADES =================
          // docs/notes/skyscrapers.md. A tower is read at 0.3-2 km, where a
          // single window is sub-pixel. What survives that far out is (a) the
          // horizontal floor rhythm (spandrel band vs vision glass), (b) the
          // vertical pier rhythm, (c) how the wall answers the SKY, and (d) the
          // building's colour identity. All four were missing: tiny collapsed
          // every tower to one flat average and took the environment reflection
          // with it, so Midtown rendered as pastel cardboard.
          //
          // Everything here is box-filtered (pcov) or derivative-faded, per the
          // project's stipple rules: a 3.8 m floor band is ~5 px at 600 m and
          // ~2 px at 1.7 km, so it MUST converge to its own mean rather than
          // beat against the pixel grid.
          {
            float towerF = smoothstep(34.0, 60.0, bldgH);
            if (towerF > 0.01) {
              float fl = v / max(floorH, 2.0);
              float aaF = max(fwidth(fl), 1e-4);
              float bandVis = smoothstep(0.85, 0.22, aaF) * towerF;
              // ---- (a) FLOOR RHYTHM
              if (glassStyle) {
                // curtain wall: an opaque spandrel panel over each slab edge.
                // ~1.1 m of a 3.8 m floor — the proportion every postwar Sixth
                // Avenue tower is built from, and the reason a real curtain
                // wall reads as stacked ribbons and not as one sheet.
                float sp = 1.0 - pcov(fl, 0.30, 0.97, aaF * 1.25);
                vec3 spC = diffuseColor.rgb * (0.40 + 0.20 * hash12(vec2(floor(cvar * 199.0), 5.71)));
                albedo = mix(albedo, spC, sp * bandVis * 0.80);
                FAC_rough = mix(FAC_rough, 0.34, sp * bandVis * 0.7);
                FAC_emis *= 1.0 - sp * bandVis * 0.85;
                FAC_spand = sp * bandVis;   // opaque panel: it takes less mirror than the glass
              } else if (!store) {
                // masonry tower: the spandrel between vertically stacked
                // windows sits BACK from the pier face. That recess is what
                // makes a setback-era tower read as continuous verticals at a
                // kilometre instead of as a dotted grid.
                // WL11: base pair — both of these are PERIODIC pcov reads (see the pier
                // rhythm above); the spandrel recess is a per-wall read, not a per-bay one
                float sp = 1.0 - pcov(fl, yb0, yb1, aaF * 1.25);
                float inCol = pcov(cuC, xb0, xb1, aaU * 1.25);
                albedo *= 1.0 - sp * inCol * bandVis * 0.15;
              }
              // ---- (b) PIER RHYTHM: a heavier column line every 3rd or 4th bay
              if (!store) {
                float grp = 3.0 + step(0.5, hash12(vec2(floor(cvar * 173.0), 11.9)));
                float pc = cuC / grp;
                float aaP = max(fwidth(pc), 1e-4);
                float pier = 1.0 - pcov(pc, 0.10, 0.94, aaP * 1.25);
                albedo *= 1.0 - pier * smoothstep(0.9, 0.25, aaP) * towerF * (glassStyle ? 0.17 : 0.11);
              }
              // ---- (d) MIDTOWN PALETTE. classify.mjs hands out pastel blues
              // and mints; with sky bouncing off them the skyline read as
              // sugared almonds. MASONRY towers are pushed toward the families
              // Manhattan actually has, with a real value spread. GLASS towers
              // are handled by the family block at the top of this shader
              // instead — a curtain wall's albedo, F0, plate roughness and
              // reflection tint are one decision, not four (facades-r6 §1).
              if (!glassStyle) {
                float fam = famR;
                vec3 tint = fam < 0.34 ? vec3(1.06, 0.99, 0.86)     // limestone
                          : fam < 0.58 ? vec3(1.04, 0.92, 0.80)     // terracotta / buff
                          : fam < 0.80 ? vec3(0.95, 0.94, 0.92)     // grey granite
                          : vec3(1.0, 0.94, 0.90);                  // white brick
                float val = 0.78 + 0.36 * hash12(vec2(cvar * 419.0, 13.31));
                albedo *= mix(vec3(1.0), tint * val, towerF * 0.7);
                // distance deepens a tower: sub-pixel windows are holes, and the
                // tiny-collapse averages above are too pale to say so
                albedo *= mix(1.0, 0.86, tiny * towerF);
              }
              // ---- (e) NIGHT BY FLOOR. Offices light by FLOOR, not by room:
              // a few floors fully on for the cleaning crews, most dark, and a
              // black mechanical band. The room shader only knew about rooms.
              if (night > 0.01) {
                float fl2 = floor(v / max(floorH, 2.0));
                float fLit = hash12(vec2(fl2 * 3.71 + cvar * 61.0, 1.93));
                float whole = step(0.86, fLit);
                float darkF = step(fLit, 0.34);
                FAC_emis *= mix(1.0, mix(1.0, 2.5, whole) * mix(1.0, 0.28, darkF), night * towerF);
              }
            }
            // ---- (c) THE SKY ANSWER, rebuilt (facades-r6 §0/§1).
            // The r5 version was textureCubeUV(envMap) * envMapIntensity
            // inside #ifdef USE_ENVMAP, gated by towerF and handed over from
            // a per-pane term with mix(0.45, 1.0, tiny). Three things were
            // wrong with it: envMapIntensity is scene.environmentIntensity,
            // which lighting.md cut to 0.14 (so the term was worth ~1 % of the
            // pixel); the IBL bake is SUN-FREE, so no reflection anywhere in
            // the city could contain the sun; and a 0.6-albedo pastel wall
            // cannot read as a mirror whatever you add to it.
            // Now: the family block at the top of the shader has already
            // chosen this building's glass albedo, F0, plate roughness and
            // reflection tint together; here the wall answers the sky
            // analytically at its own gain. Nothing is per-pane, so
            // minification cannot kill it — a tower at 1.7 km still mirrors
            // the sky — and it runs from 18 m up, not 34, because a 20 m
            // curtain wall is still a curtain wall.
            float cwF = smoothstep(18.0, 30.0, bldgH);
            if (fGlass && cwF > 0.01 && !isRoof && !blind) {
              // ---- glass VALUE. This is half the defect: real curtain-wall
              // glass is 3-10 % diffuse, ours was 50-70 %. The pattern
              // (mullions, spandrels, room content) is kept as a RELATIVE
              // modulation and the whole wall is rescaled to glass values;
              // 6 % of the original survives so lit interiors and shop
              // windows do not go pitch black at street level.
              float dBase = max(dot(diffuseColor.rgb, vec3(0.3333)), 1e-3);
              float pat = clamp(dot(albedo, vec3(0.3333)) / dBase, 0.18, 2.0);
              albedo = mix(albedo, famAlb * pat, 0.94 * cwF);
              vec3 Vw2 = normalize(cameraPosition - vWP);
              vec3 Nw2 = normalize(cross(dFdx(vWP), dFdy(vWP)));
              if (dot(Nw2, Vw2) < 0.0) Nw2 = -Nw2;
              // per-building plate lean: neighbouring towers must not all
              // mirror the same patch of sky (the tell of a fake skyline)
              Nw2 = normalize(Nw2 + vec3(hash12(vec2(cvar * 311.0, 2.13)) - 0.5, 0.0,
                                         hash12(vec2(7.31, cvar * 431.0)) - 0.5) * 0.030);
              vec3 Rw2 = reflect(-Vw2, Nw2);
              float cosT = max(dot(Vw2, Nw2), 0.0);
              float F = fresnelR(cosT, FAC_glassF.x);
              float fpW = length(fwidth(vWP)) * 0.06;
              // per-building reflectance spread: coatings, age, cleaning
              float kR = cwF * (0.72 + 0.56 * hash12(vec2(floor(cvar * 89.0), 21.7)))
                       * (1.0 - 0.62 * FAC_spand);   // spandrels are painted metal, not glass
              // canyon occlusion: below ~50 m a wall reflection vector runs
              // into the building opposite, not into the sky, so the horizon
              // band must not reach it at full strength. This is also what
              // gives a real glass tower its dark-base / bright-top gradient.
              float canyonF = mix(0.42, 1.0, smoothstep(6.0, 52.0, v));
              FAC_emis += skyLook(Rw2, sunDirW, sunColW, uZenC, uHorC, uRefl, FAC_glassF.z)
                        * FAC_reflTint * F * kR * canyonF;
              // the sun in the glass: the brightest pixel in any real frame of
              // Midtown. Clipped and specular-AA'd inside sunDisc().
              FAC_emis += sunColW * FAC_reflTint
                        * sunDisc(Rw2, sunDirW, FAC_glassF.y, fpW)
                        * F * 20.0 * uRefl * kR * (1.0 - night);
              FAC_rough = min(FAC_rough, mix(0.9, FAC_glassF.y, kR));
            }
          }
          // =============== END SKYSCRAPER PASS — TOWER FACADES ===============
          #endif
          ${WB13 ? `
          // WB13: the frame belt's cornice is a BOXED aluminium-coil wrap — fascia
          // 0.25-0.46 m over a flat vented soffit, no brackets, no dentils, reading
          // (docs/typology/08-vinyl-rowhouse.md §2.3) as "a plain shadow band". The
          // generic 1.15 m masonry cornice is a quarter of a three-storey house's
          // facade, and it is the member the typology calls "the strongest single
          // authenticity variable", so it gets its own depth and its own value: white
          // coil is LIGHTER than the wall it sits on, where a pressed-metal cornice
          // painted dark is darker. Soffit line below it stays dark either way.
          if (cornice && sidingS) {
            float cFas = 0.40;
            if (v > bldgH - cFas && v < bldgH) { albedo = mix(albedo, vec3(0.555, 0.548, 0.522), 0.75); FAC_rough = 0.45; FAC_nrmAdj = vec3(0.0, 0.22, 0.0); }
            else if (v > bldgH - cFas - 0.22 && v <= bldgH - cFas) albedo *= 0.52;   // the vented soffit in its own shadow
          } else` : ''}
          if (cornice && v > bldgH - 1.15 && v < bldgH) { albedo *= 0.6; FAC_nrmAdj = vec3(0.0, 0.25, 0.0); }
          if (cornice && !sidingS && v > bldgH - 1.85 && v < bldgH - 1.15) albedo *= 0.85;   // WB13: the boxed branch above owns this zone
          albedo *= 1.0 - 0.24 * (1.0 - smoothstep(0.0, 9.0, v)); // street grime (reference: bases run dark)
          // GLOBAL VALUE CALIBRATION: real masonry/trim sits darker than our
          // PLUTO tints render — a gentle power curve deepens mids and tames
          // chalky whites while leaving blacks alone (reference-matched).
          // 2026-09-03 (docs/notes/lighting.md): re-measured against the
          // FOV-matched W 125th crop after the sun/ambient rebalance. The
          // facades never got the trim the ground did, so a SHADED brick wall
          // rendered at sRGB L 194 where the photograph reads 110-127 and
          // sunlit stone at 215 against 156-193. 1.13/0.94 -> 1.22/0.88 takes
          // ~10 % off a light wall and ~17 % off a mid one, which is where the
          // "milky buildings, no blacks" of critic rounds 2-3 lives. Retune
          // together with the sun/env/bnc ratio in sky.js PRESETS, not alone.
          albedo = pow(max(albedo, vec3(0.0)), vec3(1.22)) * 0.88;
        } else if (mech) {
          // ============ SKYSCRAPER PASS: mechanical penthouse / crown ========
          // Every NYC tower ends in one of these: a louvred screen around the
          // cooling plant, a lift overrun, a stone crown pylon. Louvres are the
          // read at 200-600 m; at 1 km+ they must converge to their MEAN, not
          // moire, so both bands are pcov box-filtered and derivative-faded.
          float lc = v / 0.24;                      // 0.24 m louvre blades
          float aaL = max(fwidth(lc), 1e-4);
          float lVis = smoothstep(0.55, 0.16, aaL);
          float louv = pcov(lc, 0.14, 0.90, aaL * 1.25);
          float lBank = 1.0;          // 1 = the whole face is louvre (pre-E10 behaviour)
          float mpv = -1.0, mWallL = max(vAux3.x, 0.01);
          ${E10 ? `
          // ---- E10 (brief C): THE MECHANICAL PENTHOUSE IS NOT A LOUVRE SCREEN.
          // r9 fixed this branch's band-limited MEAN (it used to fade to 1.0, i.e. to
          // nothing) and gave 58 % of penthouses a masonry material, and the r9 blind pass
          // still called it "three plain faces — no coping line and no louvre bank reads at
          // 150 m". The reason is that the louvres run edge to edge and floor to ceiling on
          // every face: a uniform 0.24 m corduroy over a 15 m box has no SHAPE, so once the
          // blades drop under a pixel the whole prism converges to one value, which is
          // exactly the flat grey the critic saw. A real Manhattan bulkhead is a masonry or
          // panelled box with a louvre BANK let into the upper half of one or two faces, a
          // door at the deck, and a coping. The bank is the read at 150 m because it is a
          // 4 x 3 m DARK RECTANGLE on a lighter box — a shape, not a texture.
          if (faceH > 0.05) {
            mpv = v - (bldgH - faceH);                       // 0 = the roof deck it stands on
            float bLo = max(0.9, faceH * 0.34), bHi = max(bLo + 0.6, faceH - 0.75);
            float aaPv = max(fwidth(mpv), 1e-4);
            float bV = smoothstep(bLo - aaPv, bLo + 0.10 + aaPv, mpv) * smoothstep(bHi + aaPv, bHi - 0.10 - aaPv, mpv);
            // 2-3 bays of louvre with solid piers between them, inset from both wall ends
            float nBay = mWallL > 11.0 ? 3.0 : mWallL > 5.5 ? 2.0 : 1.0;
            float inset = min(1.4, mWallL * 0.13);
            float bu = (u - inset) / max(0.01, (mWallL - 2.0 * inset) / nBay);
            float aaBu = max(fwidth(bu), 1e-4);
            float bH = pcov(bu, 0.06, 0.94, aaBu * 1.25) * step(0.0, bu) * step(bu, nBay);
            lBank = clamp(bV * bH, 0.0, 1.0);
          }` : ''}
          ${MAT9 ? `
          // ---- MAT9 (round-9 brief item 3): the mechanical penthouse is what the r8 blind
          // pass called "a bare untextured box — three flat grey faces, no louvres, no
          // coping, ~15 m across, in a hero position", and the cause is on the line below.
          // Two faults, both about the far field:
          //  * THE BAND-LIMITED MEAN WAS WRONG. \`mix(1.0, …, lVis)\` converges to 1.0 as
          //    the 0.24 m blade falls under ~2 px (beyond roughly 40 m at this fov), i.e.
          //    the louvres do not fade to the louvre bank's average, they fade to NOTHING.
          //    The box therefore renders as flat grey at exactly the distances the film
          //    sees it from. A louvre bank's true far-field value is DARK — you are looking
          //    into an unlit plenum between lit blades — so the mean must be ~0.8, not 1.0.
          //  * EVERY FACE WAS METAL. Most mechanical bulkheads in Manhattan are brick or
          //    painted stucco carrying a metal louvre bank, not an all-metal screen; the
          //    material is the read at 150 m, long after the blades have gone.
          float mFam = hash12(vec2(floor(cvar * 317.0), 23.9));
          if (mFam < 0.58) {                                   // brick / buff brick / stucco
            vec3 mCol = mFam < 0.26 ? vec3(0.255, 0.150, 0.120)
                      : mFam < 0.44 ? vec3(0.300, 0.258, 0.205)
                      : vec3(0.340, 0.330, 0.300);
            albedo = mCol * (0.88 + 0.26 * hash12(vec2(cvar * 97.0, 7.3)));
            // brick bulkheads are the dirtiest surface on a roof: soot off their own
            // exhaust, run-off streaks down every face
            albedo *= 1.0 - smoothstep(0.45, 0.9, fbm(vec2(u * 0.8, v * 0.25) + cvar * 13.0)) * 0.26;
            albedo *= 0.93 + 0.14 * vnoise(vec2(u * 2.3 + cvar * 41.0, v * 0.18));
          }
          albedo *= mix(1.0, mix(0.80, 0.62 + 0.52 * louv, lVis), lBank);` : `
          albedo *= mix(1.0, mix(1.0, 0.70 + 0.46 * louv, lVis), lBank);`}
          ${E10 ? `
          // ---- E10: the rest of what a bulkhead is, all anchored to its own foot.
          //  * the DECK CONTACT — a cast curb and the membrane turned up onto it, then the
          //    silt that packs into the corner. This is the same contact as the parapet's
          //    and it is the one that makes the box stand ON the roof instead of floating.
          //  * a DOOR at the deck on one face (hash-picked so a box has one, not four),
          //    because at 150 m a 1 m dark slot is the only thing that gives the box scale.
          //  * a value break between the box and its membrane. roofs-r9 blind finding 4:
          //    "everything on our roofs sits at nearly the membrane's own value" — the
          //    reference roof-with-plant spans 148 L, ours 126. A bulkhead standing on a
          //    dark EPDM deck must be LIGHT, and one on a silver coating must be darker.
          if (mpv > -0.5) {
            float dCol2 = 0.0;
            // door: 1.05 m wide, 2.2 m high, at a wall-seeded position, one wall in ~2.6
            float dSeed = hash12(vec2(floor(vAux3.y * 64.0) * 3.1, cvar * 83.0));
            if (dSeed < 0.38 && mWallL > 3.2) {
              float dx = 0.9 + hash12(vec2(dSeed * 311.0, cvar * 7.7)) * max(0.0, mWallL - 1.8);
              float aaDu = max(fwidth(u), 1e-4), aaDv = max(fwidth(mpv), 1e-4);
              float dM = smoothstep(0.525 + aaDu, 0.525 - aaDu, abs(u - dx))
                       * smoothstep(2.2 + aaDv, 2.2 - aaDv, mpv) * step(0.06, mpv);
              float frM = smoothstep(0.66 + aaDu, 0.66 - aaDu, abs(u - dx))
                        * smoothstep(2.36 + aaDv, 2.36 - aaDv, mpv) * step(0.0, mpv) - dM;
              albedo = mix(albedo, albedo * 1.28 + vec3(0.03), clamp(frM, 0.0, 1.0) * 0.7);
              albedo = mix(albedo, vec3(0.085, 0.082, 0.078), dM * 0.92);
              FAC_rough = mix(FAC_rough, 0.48, dM * 0.8);
              dCol2 = dM;
            }
            // cast curb + membrane turn-up + the silt line in the corner
            float curb = smoothstep(0.30, 0.10, mpv);
            albedo = mix(albedo, vec3(0.075, 0.072, 0.068), curb * 0.72 * (1.0 - dCol2));
            albedo *= 1.0 - smoothstep(1.4, 0.28, mpv) * (0.35 + 0.45 * fbm(vec2(u * 0.7, mpv * 1.1) + cvar * 67.0)) * 0.22;
            // run-off streaks from the coping down the whole box
            albedo *= 1.0 - smoothstep(0.62, 0.95, vnoise(vec2(u * 1.5 + cvar * 19.0, mpv * 0.30))) * 0.15;
          }` : ''}
          float mu = u / 1.35;                      // structural mullions
          float aaM = max(fwidth(mu), 1e-4);
          albedo *= mix(1.0, 0.88 + 0.16 * pcov(mu, 0.07, 0.93, aaM * 1.25), smoothstep(0.5, 0.15, aaM));
          albedo *= 0.94 + 0.12 * fbm(vec2(u * 0.6, v * 0.6) + cvar * 29.0); // panel weathering
          FAC_rough = 0.42 + 0.2 * louv;
          FAC_nrmAdj += vec3(0.0, (louv - 0.5) * 0.25 * lVis, 0.0);
          // ILLUMINATED CROWN. Manhattan floodlights its bulkheads and crowns
          // from below; a lit crown is most of what a night skyline IS. Warm
          // white on masonry, cool on glass, a coloured minority.
          {
            float ck = hash12(vec2(floor(cvar * 251.0), 17.31));
            vec3 cCol = ck < 0.58 ? vec3(1.0, 0.87, 0.64)
                      : ck < 0.86 ? vec3(0.80, 0.88, 1.0)
                      : mix(vec3(1.0, 0.42, 0.32), vec3(0.35, 0.72, 1.0), hash12(vec2(cvar * 91.0, 3.17)));
            float onC = step(0.22, hash12(vec2(cvar * 137.0, 9.7)));   // 78% of crowns are lit
            // floodlights sit at the FOOT of the crown and wash upward
            float upl = mix(0.38, 1.0, smoothstep(0.0, 9.0, bldgH - v));
            FAC_emis += cCol * night * onC * upl * 1.25 * (0.55 + 0.55 * louv);
            albedo = mix(albedo, albedo * (0.7 + 0.5 * dot(cCol, vec3(0.33))), night * onC * 0.4);
          }
          if (avLight) {  // aviation obstruction light: red, always on, slow blink
            float bl = 0.55 + 0.45 * sin(uTimeF * 1.9 + cvar * 40.0);
            albedo = vec3(0.30, 0.05, 0.05);
            FAC_emis += vec3(1.0, 0.12, 0.06) * (0.8 + 2.6 * night) * bl;
            FAC_rough = 0.35;
          }
          albedo = pow(max(albedo, vec3(0.0)), vec3(1.22)) * 0.88; // same value calibration as the facades
        } else if (crownF) {
          // ====== SKYSCRAPER PASS: masonry crown tier (setback step, pylon) ===
          // Limestone/terracotta crowns are the lightest surface on a prewar
          // tower and they carry a coarse ashlar course, not the flat noise the
          // generic blind wall gets. Floodlit at night like the bulkheads.
          float crs = v / 0.62;                       // 0.62 m ashlar courses
          float aaC = max(fwidth(crs), 1e-4);
          float cVis = smoothstep(0.55, 0.16, aaC);
          float cJ = 1.0 - pcov(crs, 0.05, 0.97, aaC * 1.25);
          float blk = u / 1.25 + mod(floor(crs), 2.0) * 0.5;
          float aaB = max(fwidth(blk), 1e-4);
          float bJ = 1.0 - pcov(blk, 0.03, 0.985, aaB * 1.25);
          albedo *= 1.0 - max(cJ, bJ * 0.7) * 0.28 * cVis;
          albedo *= 0.95 + 0.12 * fbm(vec2(u * 0.5, v * 0.5) + cvar * 17.0);
          albedo *= 1.0 - smoothstep(0.55, 0.92, fbm(vec2(u * 0.09, v * 0.2) + cvar * 7.0)) * 0.12;
          FAC_rough = 0.72;
          FAC_nrmAdj += vec3(dFdx(-cJ), dFdy(-cJ), 0.0) * 0.3 * cVis;
          {
            float ck = hash12(vec2(floor(cvar * 251.0), 17.31));
            vec3 cCol = ck < 0.72 ? vec3(1.0, 0.88, 0.66) : vec3(0.82, 0.89, 1.0);
            float onC = step(0.26, hash12(vec2(cvar * 137.0, 9.7)));
            FAC_emis += cCol * night * onC * mix(0.4, 1.0, smoothstep(0.0, 12.0, bldgH - v)) * 0.95;
          }
          albedo = pow(max(albedo, vec3(0.0)), vec3(1.22)) * 0.88;
        } else {
          FAC_dbg = 3.0;
          float n = fbm(vec2(vFUv.x * 2.0, vFUv.y * 2.1));
          albedo *= 0.88 + 0.12 * n;
          albedo *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 9.0, vFUv.y));
          FAC_rough = 0.95;
          ${E10 ? `
          // ---- E10: THE PARAPET, which is the longest contact line in the city and had
          // five lines of shader. Every flat-roofed building in the frame ends in one, and
          // in ref_lenox.png the roofline is never a clean band: the roof-side face is the
          // dirtiest surface of the whole building (it is in its own shade all day and
          // everything on the deck drains against it) and the street-side face carries the
          // run-off of the coping above it. Anchored to the prism's own foot and head via
          // the aux3.z face height, so it lands correctly on a 0.62 m taxpayer lip and on
          // a 2.4 m tower parapet alike.
          if (faceH > 0.05) {
            float pv = vFUv.y - (bldgH - faceH);   // 0 = roof deck, faceH = coping
            float pu = vFUv.x;
            float gN = 0.4 + 0.6 * fbm(vec2(pu * 0.55, pv * 0.9) + cvar * 53.0);
            if (faceIn) {
              // the TAR LINE: the membrane does not stop at the deck, it turns up 0.2-0.4 m
              // onto the parapet and is capped with a bead of flashing mastic. That black
              // skirt, and the silt packed into its corner, is what a roof edge looks like.
              float turn = smoothstep(0.34, 0.05, pv);
              albedo = mix(albedo, vec3(0.055, 0.052, 0.050), turn * 0.80);
              FAC_rough = mix(FAC_rough, 0.68, turn * 0.7);
              // and the whole inner face is soiled, strongest low down
              albedo *= 1.0 - smoothstep(1.5, 0.1, pv) * gN * 0.26;
              albedo *= 0.80 + 0.14 * fbm(vec2(pu * 0.22, pv * 0.6) + cvar * 11.0);
            } else {
              // street side: a wash band under the coping's drip, then vertical run-off
              // streaks down the face (the coping sheds onto it every time it rains)
              float dCop = faceH - pv;
              albedo *= 1.0 - smoothstep(0.55, 0.02, dCop) * smoothstep(-0.03, 0.06, dCop) * gN * 0.24;
              float strk = smoothstep(0.58, 0.93, vnoise(vec2(pu * 1.9 + cvar * 37.0, pv * 0.35)));
              albedo *= 1.0 - strk * smoothstep(faceH, 0.0, pv) * 0.18;
            }
          }` : ''}
        }
        // faint warm street bounce at night
        FAC_emis += vec3(0.35, 0.24, 0.12) * night * (1.0 - smoothstep(0.0, 6.5, vFUv.y)) * 0.14;
        diffuseColor.rgb = albedo;
        #if defined(FACDEBUG) && FACDEBUG == 1
        {
          vec3 dbg = vec3(0.5);                            // masonry: gray
          if (isRoof) dbg = vec3(1.0, 0.1, 0.1);           // roof: red
          else if (FAC_dbg == 3.0) dbg = vec3(0.1, 0.8, 0.2); // blind: green
          else if (FAC_dbg == 2.0) dbg = vec3(1.0, 0.9, 0.1); // storefront: yellow
          else if (FAC_dbg == 1.0) dbg = vec3(0.15, 0.3, 1.0);// window: blue
          else if (v < 0.02) dbg = vec3(1.0, 0.4, 0.05);   // foundation: orange
          diffuseColor.rgb = dbg;
          FAC_emis = vec3(0.0);
        }
        #endif
        #if defined(FACDEBUG) && FACDEBUG == 2
        diffuseColor.rgb = FAC_dbgV; FAC_emis = vec3(0.0); // q coordinate
        #endif
        #if defined(FACDEBUG) && FACDEBUG == 4
        diffuseColor.rgb = FAC_emis * 2.0; FAC_emis = vec3(0.0); // emissive isolated
        #endif
        #if defined(FACDEBUG) && FACDEBUG == 5
        FAC_emis = diffuseColor.rgb; diffuseColor.rgb = vec3(0.0); // unlit albedo
        #endif
        #if defined(FACDEBUG) && (FACDEBUG == 6 || FACDEBUG == 7 || FACDEBUG == 9)
        // pane-factor bisection: value shown UNLIT (emissive), diffuse+spec suppressed
        FAC_emis = FAC_dbgV * step(8.5, FAC_dbg);
        diffuseColor.rgb = vec3(0.0);
        FAC_rough = 1.0;
        #endif
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = FAC_rough;
        // rain-damp masonry: porous surfaces darken and gloss, glass stays glass
        {
          float dampF = wet * smoothstep(0.5, 0.85, FAC_rough);
          diffuseColor.rgb *= 1.0 - 0.26 * dampF;
          roughnessFactor = mix(roughnessFactor, 0.4, dampF * 0.55);
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(normal + FAC_nrmAdj);
        // real masonry micro-relief: photographed brick normal map in a screen-
        // derivative TBN over the wall's (u,v) — masonry only (FAC_rough gate),
        // distance-faded like every derivative effect in this project
        {
          // r8 BAND-LIMIT (?aa=0 restores 0.5, 0.18). vFUv is in WALL METRES,
          // so buv = vFUv * 0.42 tiles the brick normal map every 2.4 m: on a
          // 1024 map that is 2.3 mm per texel. The old gate held the map at
          // FULL weight out to 0.18 m of wall per pixel (~150 m at this fov)
          // and only reached zero at 0.5 (~415 m) — 78 texels per pixel of a
          // NORMAL map, whose mip average shortens the mean normal and whose
          // residue is specular sparkle. glitch-r7.md 3.6 #6 puts 24 % of the
          // frame's hot pixels on tile facades "worst at 60-460 m", which is
          // this range exactly. Below the resolution limit, surface detail
          // belongs in the ROUGHNESS (applySpecAA now supplies that), not in a
          // normal nobody can resolve. Full to ~58 m, gone by ~166 m.
          float bw = smoothstep(0.86, 0.9, FAC_rough) * smoothstep(${AAFIX ? '0.20, 0.07' : '0.5, 0.18'}, length(fwidth(vWP)));
          if (bw > 0.02) {
            vec2 buv = vec2(vFUv.x, vFUv.y) * 0.42;
            vec3 mapN = texture2D(t_brN, buv).xyz * 2.0 - 1.0;
            vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
            vec2 st0 = dFdx(buv), st1 = dFdy(buv);
            vec3 Tt = q0 * st1.t - q1 * st0.t;
            vec3 Bt = -q0 * st1.s + q1 * st0.s;
            float tl = max(length(Tt), 1e-6), bl = max(length(Bt), 1e-6);
            mat3 tsn = mat3(Tt / tl, Bt / bl, normal);
            vec3 pn = tsn * normalize(vec3(mapN.xy * 1.3, max(mapN.z, 0.4)));
            if (dot(pn, pn) > 1e-8) normal = normalize(mix(normal, normalize(pn), bw * 0.8));
            FAC_rough = mix(FAC_rough, texture2D(t_brR, buv).x * 1.05, bw * 0.5);
          }
        }
        { // albedo-relief: the procedural pattern's luminance IS its heightfield
          // (mortar dark = recessed, stone light = proud). Derivative-based, so
          // it needs the same care as the window shaders: patterns are already
          // fwidth-AA'd (bounded gradients) and the relief is clamped.
          float bumpG = smoothstep(0.45, 0.75, FAC_rough); // glass/polished stay smooth
          // r8 BAND-LIMIT (?aa=0 restores 0.4, 0.14). The comment on the right
          // is the correct rule and the numbers did not implement it: the
          // heightfield here IS the procedural albedo, whose finest features
          // are the course lines (0.34-0.66 m period) and the block joints
          // inside them, and dFdx() of a signal near Nyquist is noise, not a
          // gradient. Holding this at FULL strength out to 0.14 m of wall per
          // pixel (~116 m) put a 0.34 m course at 2.4 px and a joint below 1 px
          // while still taking its screen derivative — and a derivative gets
          // LARGER as the feature compresses, so the relief grew with distance.
          // Full to ~37 m (a course is 7.5 px), gone by ~100 m.
          bumpG *= smoothstep(${AAFIX ? '0.12, 0.045' : '0.4, 0.14'}, length(fwidth(vWP))); // fade before pattern gradients hit pixel scale (shimmer)
          float bh = dot(diffuseColor.rgb, vec3(1.05)) * bumpG;
          vec3 bsx = dFdx(-vViewPosition), bsy = dFdy(-vViewPosition);
          vec3 br1 = cross(bsy, normal), br2 = cross(normal, bsx);
          float bdet = dot(bsx, br1);
          vec3 bgrad = sign(bdet) * (dFdx(bh) * br1 + dFdy(bh) * br2);
          float bgl = length(bgrad);
          bgrad *= min(bgl, 0.55) / max(bgl, 1e-5);
          vec3 bn = abs(bdet) * normal - bgrad * 2.0;
          if (dot(bn, bn) > 1e-9) normal = normalize(bn); // degenerate dets keep the geo normal
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += FAC_emis;`);
  };
  // r8 geometric specular AA (?aa=0 to disable). The facade builds its shading
  // normal out of the photographed brick normal map and the albedo-relief
  // gradient, neither of which three's own geometryRoughness can see — it
  // reads `nonPerturbedNormal`, saved BEFORE those writes. 24 % of the hot
  // pixels in glitch-r7.md 2.3 are tile facades at rms 5-33.
  return applySpecAA(applyCityAO(mat), { sigma2: 0.25, kappa: 0.14 });
}

// ------------------------------------------------------------------ GROUND
// matId: 0 asphalt 1 sidewalk 2 curb 3 paintW 4 paintY 5 grass 6 path 7 terrain 8 far-carpet
//        9 paintG (bike lane) 10 brick/plaza
// Surface research + calibration notes: boundlessjs/docs/notes/surfaces.md
const GND_GLSL = /* glsl */ `
  // Manhattan grid bearing, taken from the OSM College Walk axis (the campus
  // and the commissioners' grid share it): MG_A runs with the cross-town
  // streets, MG_B with the avenues. Wheel paths, rubber scrub, mill-and-pave
  // lots and utility trenches all follow a road, never a random cloud, so the
  // road-history fields are laid out in this frame instead of world XZ.
  const vec2 MG_A = vec2(0.8744, 0.4853);
  const vec2 MG_B = vec2(-0.4853, 0.8744);
  // ridged noise: creases instead of blobs (cracks, strata, flaking edges)
  float gridge(vec2 p) { return 1.0 - abs(vnoise(p) * 2.0 - 1.0); }
  // anisotropic streak field locked to whichever grid axis the block runs on
  // (a ~130 m mask picks the axis, so streaks never cross into a plaid)
  float gstreak(vec2 g, float along, float across, float seed) {
    float sA = vnoise(vec2(g.x * along, g.y * across) + seed);
    float sB = vnoise(vec2(g.x * across, g.y * along) + seed + 19.7);
    return mix(sA, sB, smoothstep(0.38, 0.62, vnoise(g * 0.0075 + 41.0)));
  }
  // AA'd axis-aligned rectangle coverage in cell space
  float grect(vec2 f, vec2 lo, vec2 hi, vec2 aa) {
    vec2 s = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
    return s.x * s.y;
  }
  // mean-preserving detail multiply: a mip-filtered tap converges to the map's
  // own mean, so dividing by that mean gives a ~1.0 field — distance neither
  // darkens nor lightens the surface, and the authored albedo survives while
  // the map supplies the grain procedural noise can only alias.
  vec3 gdet(vec3 tc, vec3 invMean, float k, float det) {
    return mix(vec3(1.0), clamp(mix(vec3(1.0), tc * invMean, k), 0.34, 2.1), det);
  }
`;
export function makeGroundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.playerXZ = FAR_UNIFORMS.playerXZ;
    sh.uniforms.nearR = FAR_UNIFORMS.nearR;
    sh.uniforms.nearMask = FAR_UNIFORMS.nearMask; sh.uniforms.nearMaskO = FAR_UNIFORMS.nearMaskO; sh.uniforms.nearMaskOn = FAR_UNIFORMS.nearMaskOn;   // NM24
    sh.uniforms.night = ENV.night;
    sh.uniforms.wet = ENV.wet;
    sh.uniforms.windT = ENV.windT;
    sh.uniforms.snowA = ENV.snow;
    for (const k of ['asC', 'asN', 'asR', 'asD', 'coC', 'coN', 'grC', 'grN', 'pvC', 'pvN']) sh.uniforms['t_' + k] = { value: GTEX[k] };
    GTEX_UNIFORM_REFS.push(sh.uniforms); // async KTX2 arrivals refresh these
    sh.uniforms.lb14StCal = ENV.lb14StCal;   // LB14
    sh.uniforms.lb14Walk = ENV.lb14Walk;     // LB14
    sh.uniforms.lb14Paint = ENV.lb14Paint;   // LB14
    sh.uniforms.lb14Road = ENV.lb14Road;     // LB14
    sh.defines = sh.defines || {};
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('gnddebug')) sh.defines.GNDDEBUG = 1;
    // ?gndcheap=1 compiles the road WITHOUT the procedural history layers
    // (wheel paths, utility cuts, crack sealant, castings). It exists so the
    // per-layer fps probe can price this shader's added ALU directly:
    //   node tools/bshot.mjs --views harlem125 --wait 80 --fps ground
    //   node tools/bshot.mjs --views harlem125 --wait 80 --fps ground --flags gndcheap=1
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('gndcheap')) sh.defines.GNDCHEAP = 1;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float matId; varying float vMat; varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vMat = matId;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      // per-layer depth bias (docs/notes/zfight.md 6.1): paint / plates win over the asphalt and
      // the gutter / bus-lane strips over the cap fan by a fixed number of 24-bit depth LSBs,
      // independent of distance — the compiled datum offsets alone lose at 100-300 m in the aerials.
      // one LSB of window depth is 2/2^24 of NDC, so bias = LSBs / 8388608 (times w for clip space).
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          float zb = (matId == 3.0 || matId == 4.0 || matId == 13.0 || matId == 14.0) ? 10.0
                   : matId == 9.0 ? 8.0                       // green bike box under its white edge line (zfight.md)
                   : (matId == 11.0 || matId == 12.0) ? 4.0
                   // TL26: the two layers that lie UNDER the others by design lose every tie: the campus lawn underlay
                   // (15) under paths, brick and beds, the terrain grid (7) under everything
                   : matId == 15.0 ? -4.0 : matId == 7.0 ? -8.0
                   // ...and campus brick (10) yields its ties: the College Walk brick ribbons run under the grey walk
                   // and the lawn beds either side of it (refs/earth/col_earth_top.png)
                   : matId == 10.0 ? -2.0 : 0.0;
          gl_Position.z -= (zb / 8388608.0) * gl_Position.w;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec2 playerXZ; uniform float nearR; uniform float night;${NEARMASK_GLSL}
        uniform sampler2D t_asC; uniform sampler2D t_asN; uniform sampler2D t_asR; uniform sampler2D t_asD;
        uniform sampler2D t_coC; uniform sampler2D t_coN;
        uniform sampler2D t_grC; uniform sampler2D t_grN;
        uniform sampler2D t_pvC; uniform sampler2D t_pvN;
        uniform vec3 lb14StCal; uniform vec3 lb14Walk; uniform vec3 lb14Paint; uniform float lb14Road;   // LB14 (docs/notes/lb14.md)
        varying float vMat; varying vec3 vWPos;
        ${HASH_GLSL}
        ${TEX_GLSL}
        ${GND_GLSL}
        float GND_rough; float GND_patch; float GND_manhole; float GND_oil;
        float GND_paint;  // 1 = intact thermoplastic film (fills the aggregate)
        float GND_wall;   // 1 = near-vertical face (curb face, park rock cut)
        float GND_rock;   // 1 = schist outcrop (steep terrain/grass)
        float GND_spec;   // dielectric F0 scale (see the specular trim below)
        // three values the asphalt branch computes anyway, published so the
        // gutter (11) and the red bus lane (12) can key off them instead of
        // re-deriving their own fields (see the roadway-edge block below):
        float GND_age;    // block-face binder age, 0 fresh pave -> 1 ten summers
        float GND_wheel;  // 1 = inside a polished wheel track
        float GND_cast;   // 1 = manhole/basin casting or its patched collar
        vec3 GND_tn; float GND_tnW; vec3 GND_wn;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        int m = int(vMat + 0.5);
        int mRaw = m;                       // 11 gutter / 12 red bus lane are asphalt variants
        if (m == 11 || m == 12) m = 0;
        if (m == 15) m = 5;                 // TL26: the campus lawn underlay is lawn (its own id only for the depth order)
        GND_patch = 0.0; GND_manhole = 0.0; GND_oil = 0.0; GND_tn = vec3(0.0, 0.0, 1.0); GND_tnW = 0.0;
        GND_paint = 0.0; GND_rock = 0.0; GND_spec = 1.0;
        GND_age = 0.5; GND_wheel = 0.0; GND_cast = 0.0;
        if (m == 8 && farHidden(vWPos.xz)) discard;   // NM24: far terrain only where no ready near tile is
        GND_rough = 0.95;
        vec3 albedo;
        float n1 = vnoise(vWPos.xz * 0.35); // macro variation (~9m) only
        // fine grain comes EXCLUSIVELY from the mip-filtered PBR textures now —
        // procedural per-pixel noise reads as salt-and-pepper at any distance
        float n2 = 0.5;
        // geometric world normal (vNormal is VIEW space): the curb face, park
        // rock cuts and river banks are all vertical strips of the same merged
        // ground mesh, and everything below keys off this instead of guessing.
        GND_wn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
        GND_wall = smoothstep(0.62, 0.30, abs(GND_wn.y));   // 52deg -> 73deg
        // world-XZ pixel footprint: the one AA/LOD gate the whole shader shares
        float gFw = max(fwidth(vWPos.x), fwidth(vWPos.z));
        float gNear = smoothstep(0.30, 0.06, gFw);   // fine detail visibility
        float gMid  = smoothstep(1.10, 0.22, gFw);   // coarse detail visibility
        // grid-frame coordinates (metres along the street / along the avenue)
        vec2 gG = vec2(dot(vWPos.xz, MG_A), dot(vWPos.xz, MG_B));
        if (m == 0) {
          // ---- NYC asphalt. A street here is never one pour: it is a stack of
          // mill-and-pave lots, DEP/Con Ed utility trenches cut and backfilled
          // years apart, crack sealant, and wheel paths polished lighter with
          // an oil-black strip down the middle of every lane. Everything is
          // laid out in the grid frame (gG) so it runs WITH the roadway.
          //
          // 1. mill-and-pave lots: ~55 x 40 m resurfacing jobs, each its own age
          // NYC repaves a BLOCK FACE at a time, so the age unit is the block
          // (~78 m of roadway x its width), not a 57 x 41 m rectangle, and the
          // joint between two pours wanders — a paver follows the crown, not a
          // ruler. Measured off the Street View set (sunlit, docs/notes/streets-audit.md):
          //   fresh binder  Amsterdam Ave @ 116  sRGB (82, 94,110)  DARK and BLUE
          //   ten summers   W 122nd St           sRGB (180,173,161) LIGHT and WARM
          // The old range (0.070 -> 0.158, always warm) could reach neither end:
          // every street rendered as the same mid blue-grey sheet.
          // warp in LOT units: 0.30 was +/-23 m along / +/-7.8 m across, which drew the
          // "long smooth wide-radius arcs" that read as wear (review R3 #2); a
          // paver's joint wanders by decimetres, not by a lane
          // GT13 (docs/notes/ground-r13.md): the 26 m ACROSS pitch is the bug. gG's two
          // axes are the commissioners' grid, so a street that runs on the short axis got
          // a fresh pour every 26 m up its length and a cold joint down the centre of its
          // own carriageway — which is the rectangular tiling the r13 critic read off
          // Amsterdam at 1:3 (shots/critic-r13/z_t_road.png). A mill-and-pave lot is a
          // BLOCK FACE: ~80 m of roadway by its full width, and it has to be that at
          // EITHER orientation, so the cell is near-square. The warp goes up with it
          // (a paver's joint wanders by metres over 80 m, not by 0.8 m over 26).
          vec2 lotQ = gG / ${GT13 ? 'vec2(82.0, 76.0) + vec2(fbm(gG * 0.013 + 4.0), fbm(gG * 0.015 + 21.0)) * vec2(0.075, 0.075)'
                                  : 'vec2(78.0, 26.0) + vec2(fbm(gG * 0.013 + 4.0), fbm(gG * 0.015 + 21.0)) * vec2(0.055, 0.030)'};
          vec2 lotId = floor(lotQ);
          // GT13: one hash12 draw spanned the WHOLE mix (0.0649 -> 0.2050) block face to
          // block face, so the asphalt tone was a lottery two-and-a-bit stops wide and the
          // city had no single asphalt — the critic's fix 1 in one line ("one stretch of
          // road in the whole city has the right asphalt"). AVERAGING FOUR decorrelated
          // draws of the same lot halves the standard deviation and leaves the MEAN
          // EXACTLY where it was — which matters, because the mean is already on the
          // Earth crop (ground-r13.md: our sunlit carriageway 143 / walk 190 against the
          // Earth's 136 / 182) and must not move. It also turns a flat uniform draw into
          // a bell, so most block faces sit near the city's asphalt and the odd one is
          // a fresh or a bleached pour, which is what a block face actually is.
          ${GT13 ? `float lotH = (hash12(lotId + 3.3) + hash12(lotId + 11.7)
                              + hash12(lotId + 27.1) + hash12(lotId + 41.9)) * 0.25;`
                 : `float lotH = hash12(lotId + 3.3);`}
          float lotAge = clamp(lotH * 0.86 + n1 * 0.28, 0.0, 1.0);
          // ROUND 3: the bleached end was (0.2840, 0.2440, 0.1560), linear R/B
          // 1.82. Every sunlit asphalt patch in the panorama table above has a
          // linear R/B of 1.08-1.27, and the 125th St lane in the FOV-matched
          // reference is nearly neutral (sRGB R-B = 2-8). With stCal's own 1.32
          // R/B boost on top, the roadway rendered at R-B = 27 — above every
          // entry in that table and 1.7x the 16 the round-2 pass was aiming at.
          // B up 22 %, R down 5 %: R/B 1.42 at the aged end, 1.21 at mid-age,
          // luma unchanged, and rendered R still leads B by ~35 % so the round-2
          // "never blue slate again" property is untouched.
          albedo = mix(vec3(0.0649, 0.0781, 0.0868), vec3(0.2050, 0.2120, 0.2220), lotAge);   // AM120 (critic 2026-09-15): the aged end was a warm tan and a sunlit avenue read 55 % too bright; worn NYC asphalt bleaches to a COOL mid-grey
          GND_age = lotAge;                 // the gutter's grime tracks the block face
          // asphalt is one of the roughest surfaces in a city: a low value here
          // lets the grazing sky specular sheet the road over as a wet look
          GND_rough = 0.92 + lotAge * 0.05;
          GND_spec = 0.50;
          // lot seam: the cold joint where a new pass met the old surface
          {
            vec2 lf = abs(fract(lotQ) - 0.5);
            // GT13: the seam's AA width has to be in the SAME cell units as lotQ, or the
            // joint is filtered at the wrong scale (with the new near-square lot it would
            // have been 2.9x too wide across and drawn a soft band instead of a joint).
            vec2 lw = fwidth(gG) / ${GT13 ? 'vec2(82.0, 76.0)' : 'vec2(78.0, 26.0)'} * 1.5 + 0.0016;
            float seam = max(smoothstep(0.5 - lw.x, 0.5 - lw.x * 0.25, lf.x), smoothstep(0.5 - lw.y, 0.5 - lw.y * 0.25, lf.y));
            albedo *= 1.0 - seam * 0.12 * gMid;   // measured 138 -> 108 across the seam at 0.3; a cold joint is a tone change, not a trench
          }
          // 1b. skin patches: the mosaic of 3-10 m repairs with SINUOUS edges
          // that a Williamsburg or Harlem block actually is (Bedford & N 7th:
          // five distinct tones inside one block face). A domain-warped blob
          // field, so no edge is straight and nothing reads as a rectangle.
          {
            vec2 pw = gG + vec2(fbm(gG * 0.19 + 31.0), fbm(gG * 0.21 + 47.0)) * 3.4;
            float pf = fbm(pw * 0.135 + 9.7);
            float skin = smoothstep(0.44, 0.58, pf) - smoothstep(0.70, 0.84, pf);
            // GT13: this is the APERIODIC half of the road's variety and it was the
            // weaker of the two — the lot lattice carried more spread than the patch
            // mosaic, which is exactly backwards for a NYC block face. The lattice
            // gave up 40 % of its range above, so the patches take it: amplitude up
            // 0.34 -> 0.46, and zero-meaned (the old draw averaged +4 %, a bias that
            // lifted every road by a fifth of a stop for no reason).
            // LB14 (docs/notes/lb14.md): the r14 critic's "the brightest, flattest, emptiest place in
            // the set" — the sunlit carriageway in wbBedfordN7_day measures a p5-p95 span of **14**
            // over 500 x 180 px. The LEVEL is right (L 143 is inside the Street View sunlit band
            // 136-188, streets-audit.md; the critic compared it against a SHADED pano value), the
            // VARIETY is not: a block face draws one lotAge, so inside one block the only aperiodic
            // term is this mosaic. Its draw is zero-meaned by GT13, so scaling it widens the span
            // without moving the mean the Earth crop is already calibrated on. lb14Road is 0 outside
            // the day preset, and mix/multiply by 1.0 is exact, so golden/dusk/night are identical.
            albedo *= 1.0 + skin * (${GT13 ? '0.46 * hash12(floor(pw * 0.135) + 5.0) - 0.23'
                                           : '0.34 * hash12(floor(pw * 0.135) + 5.0) - 0.13'}) * gMid * (1.0 + lb14Road);
          }
          // 2. broad traffic soot / shade darkening (unchanged in spirit)
          albedo *= 1.0 - smoothstep(0.55, 0.95, fbm(vWPos.xz * 0.035 + 9.1)) * 0.18;
          // 3. wheel paths: two polished, lighter ribbons per lane with the
          // oil-black strip between them. Anisotropic along the road axis.
          #ifndef GNDCHEAP
          {
            float wp = gstreak(gG, 0.02, 0.62, 7.1);
            GND_wheel = smoothstep(0.60, 0.86, wp);   // the bus lane scrubs on the same tracks
            albedo *= 1.0 + GND_wheel * 0.30 * gMid;                        // polished, lighter
            float oil = gstreak(gG, 0.035, 0.55, 3.7);
            GND_oil = smoothstep(0.72, 0.93, oil) * 0.55;                    // drip line
          }
          #endif
          // 4. utility cuts: saw-cut rectangles backfilled with a different mix.
          // Two scales — a long trench along the roadway (gas/water main) and
          // small square service cuts — each with a dark saw-cut outline.
          #ifndef GNDCHEAP
          {
            vec2 cs = vec2(13.0, 8.0);
            vec2 cc = floor(gG / cs), cf = fract(gG / cs);
            float cr = hash12(cc + 17.9);
            if (cr < 0.26) {
              // the long axis follows the road on half the cuts. Sizes are 1-3 m
              // now (Street Works Manual restorations are service-lateral wide,
              // not lane wide): the old 0.30-0.64 cell fractions drew 4-7 m
              // slabs that read from the air as holes in the roadway.
              vec2 p0 = vec2(hash12(cc + 3.1), hash12(cc + 5.7)) * 0.52 + 0.08;
              vec2 sz = vec2(cr < 0.13 ? 0.075 + hash12(cc + 9.3) * 0.085 : 0.135 + hash12(cc + 9.3) * 0.150,
                             cr < 0.13 ? 0.175 + hash12(cc + 11.1) * 0.200 : 0.080 + hash12(cc + 11.1) * 0.090);
              vec2 aa = fwidth(gG) / cs * 0.9 + 0.0016;
              float inner = grect(cf, p0, p0 + sz, aa);
              float outer = grect(cf, p0 - aa * 2.4 - 0.006, p0 + sz + aa * 2.4 + 0.006, aa);
              // Backfill tone. A NYC cold patch is DARKER than the road, never
              // black: in the refs a fresh restoration reads sRGB ~95-115 in sun
              // against a 150 road. The old 0.036 fill rendered as a black
              // rectangle, which is the single most obvious "processed wrong"
              // artefact in the top-down. It also fades with gMid so a minified
              // roadway never gets punched full of dark squares.
              vec3 fill = mix(vec3(0.0827, 0.0807, 0.0760), vec3(0.2293, 0.2080, 0.1573), hash12(cc + 23.0));
              albedo = mix(albedo, fill, inner * 0.70 * mix(0.45, 1.0, gMid));
              albedo *= 1.0 - (outer - inner) * 0.34 * gMid;                 // saw-cut kerf
              GND_patch = inner;                                             // roughness/relief only
            }
          }
          #endif
          // 5. crack sealant: the black tar snakes NYC pours over every seam —
          // shiny, ~6 cm, wandering, and the single most recognisable NYC road
          // detail. Ridged noise at two scales, mip-faded.
          #ifndef GNDCHEAP
          {
            float aged = smoothstep(0.52, 0.88, fbm(vWPos.xz * 0.021 + 5.3));
            if (aged > 0.01 && gNear > 0.01) {
              // DOMAIN WARP. Straight ridged noise on a lattice reads as a
              // repeating diagonal weave from above — a dead giveaway. Pushing
              // the lookup around with a low-frequency field breaks the period
              // and gives the wandering, branching run a sealed crack has.
              //
              // ROUND 3: the warp amplitude is down 9.0 -> 4.6 m and the ridge
              // band 0.925 -> 0.962. A 9 m warp on a 3.9 m lattice is locally
              // COMPRESSIVE, and where it compresses it inflated the 6 cm band
              // into 0.4-0.8 m strokes. From a 2.5 m eye looking ALONG the
              // roadway that is fatal: gFw is isotropic, so a grazing fragment
              // keeps gNear = 1 while perspective stretches each stroke over
              // hundreds of pixels, and W 125th rendered as black smoke snakes
              // across the whole near field (shots/audit/R3bus125_day.png, before
              // this change). The same street in refs/streetview (2023-08) carries
              // a handful of faint sealed cracks and nothing else. The fill is
              // also lifted 0.030 -> 0.052 and capped 0.90 -> 0.60: weathered
              // sealant is a dark grey line on a 150-luma road, not a hole in it.
              vec2 wq = vWPos.xz + vec2(fbm(vWPos.xz * 0.055 + 3.0), fbm(vWPos.xz * 0.055 + 17.0)) * 4.6;
              float web = gridge(wq * 0.26 + 8.8);
              float sealer = smoothstep(0.962, 0.999, web) * aged * gNear;
              float hair = smoothstep(0.975, 1.0, gridge(wq * 0.95 + 21.0)) * aged * gNear;
              albedo = mix(albedo, vec3(0.052, 0.049, 0.047), clamp(sealer * 0.85 + hair * 0.40, 0.0, 0.60));
              GND_rough = mix(GND_rough, 0.62, sealer * 0.7);                // tar stays glossy
            }
          }
          #endif
          // 6. castings: manhole, valve box and the asphalt collar patched
          // around them. Rim + cover, AA'd on the radial derivative.
          #ifndef GNDCHEAP
          {
            vec2 mc = floor(vWPos.xz / 15.0);
            float mr = hash12(mc);
            if (mr < 0.42) {
              vec2 mo = vec2(hash12(mc + 1.7), hash12(mc + 2.9)) * 0.7 + 0.15;
              float md = length((fract(vWPos.xz / 15.0) - mo) * 15.0);
              float R = mr < 0.28 ? 0.36 : 0.16;                             // manhole / valve box
              float ae = max(fwidth(md), 0.004);
              // patched ring: half the castings sit in a lighter concrete
              // collar (grates, DEP basins), half in a darker asphalt re-set
              float collar = 1.0 - smoothstep(R + 0.34, R + 0.62, md);
              albedo *= 1.0 + collar * mix(-0.16, 0.22, step(0.5, hash12(mc + 41.0))) * gMid;
              float rim = smoothstep(R + 0.09 + ae, R + 0.09 - ae, md);
              float cover = smoothstep(R + ae, R - ae, md);
              GND_manhole = max(cover, rim * 0.45);
              // a paint crew skirts a casting: the red bus lane stops at the
              // collar and the lid and its ring stay unpainted grey (visible on
              // every casting inside the 125th St lane, refs 2023-08).
              GND_cast = max(GND_manhole, collar * 0.85);
            }
          }
          #endif
        } else if (m == 1) {
          // ---- NYC sidewalk: 5 ft (1.524 m) concrete flags on a 4-flag,
          // 20 ft expansion-joint panel (DOT Street Works Manual 4.4). The
          // flags are laid to the STREET grid, not to world XZ, and each is a
          // separate pour: its own age, its own warm/cool cast. Concrete here
          // is a warm mid grey, never white. Measured off the refs (sunlit):
          // Amsterdam & 116 (229,214,192), Bedford & N 7 (198,188,176) — light,
          // and always R > G > B by a wide margin. The old value was both too
          // dark AND rendered COOL (the render read B > R), which is most of
          // why the ground looked "processed wrong": NYC concrete is sandy warm
          // grey, never the blue-slate the sky-dominated ambient turns it into.
          albedo = mix(vec3(0.496, 0.437, 0.261), vec3(0.571, 0.501, 0.299), n1);
          vec2 sco = gG / 1.524;
          vec2 sid = floor(sco);
          float slab = hash12(sid);
          vec2 j = min(fract(sco), 1.0 - fract(sco));
          vec2 jAA = fwidth(sco) * 1.2 + 1e-4;
          // A NYC walk is scored ACROSS its width: the strong, continuous joints
          // run curb-to-building line every 5 ft and the joints parallel to the
          // curb are secondary (often only one or two down a 4.5 m walk). An
          // equal-weight checker is the tell of a tiled floor, so the two axes
          // are weighted per block by the same ~130 m mask gstreak uses to pick
          // the street bearing.
          float swAx = smoothstep(0.38, 0.62, vnoise(gG * 0.0075 + 41.0));
          vec2 jW = vec2(mix(1.0, 0.42, swAx), mix(0.42, 1.0, swAx));
          // tooled joint: a hand-run groove with a LIGHTER trowelled bevel each
          // side. The bevel is the tell that reads "sidewalk" and not "tiles".
          float joint = max((1.0 - smoothstep(0.0, jAA.x * 1.7 + 0.008, j.x)) * jW.x,
                            (1.0 - smoothstep(0.0, jAA.y * 1.7 + 0.008, j.y)) * jW.y);
          float bevel = max(smoothstep(jAA.x * 1.4 + 0.028, jAA.x + 0.011, j.x) * jW.x,
                            smoothstep(jAA.y * 1.4 + 0.028, jAA.y + 0.011, j.y) * jW.y) - joint;
          albedo *= 1.0 - joint * 0.24;
          albedo *= 1.0 + max(bevel, 0.0) * 0.12 * gNear;
          // expansion joints every 4th flag (20 ft): a wider, darker bitumen
          // recess — the long rhythm a plain 1.5 m checker lacks. It is a THIN
          // dark line in the refs, not a black band, so the fill is a warm
          // bitumen grey and the coverage is down from 0.62.
          vec2 e4 = min(fract(sco / 4.0), 1.0 - fract(sco / 4.0)) * 4.0;
          float ej = max((1.0 - smoothstep(0.0, jAA.x * 1.4 + 0.030, e4.x)) * jW.x,
                         (1.0 - smoothstep(0.0, jAA.y * 1.4 + 0.030, e4.y)) * jW.y);
          albedo = mix(albedo, vec3(0.115, 0.104, 0.083), ej * 0.46);
          // per-flag pour: age value + warm/cool cement cast. HALVED — at
          // +-8 % value and +-4 % hue the top-down read as a random light/dark
          // checkerboard, where a real walk is nearly uniform with the odd
          // obviously-new flag (kept below as the 7 % replacement case).
          albedo *= 0.952 + 0.078 * slab;
          albedo *= mix(vec3(1.016, 0.998, 0.972), vec3(0.978, 0.992, 1.018), hash12(sid + 11.7));
          GND_rough = 0.86 + 0.08 * slab; GND_spec = 0.72;
          // replacements: ~7% fresh flags (lighter, smoother, sharper joints),
          // ~4% cold-patch asphalt repairs, ~5% bluestone (historic districts —
          // Harlem/Brooklyn brownstone blocks still carry the blue-grey slabs)
          float srep = hash12(sid + 7.3);
          // Bluestone and asphalt-patch flags were scattered at 5 % and 4 % of
          // EVERY block, and at less than half the concrete's value they read
          // from above as dark holes punched at random in the walk (the lead
          // logged this off the flat set: "some sidewalk flags render as dark
          // bluestone squares"). Both are real, but neither is random: bluestone
          // survives in RUNS on the brownstone blocks (W 122nd, Strivers' Row,
          // Bedford) and nowhere else, and it is a blue-GREY slab, not a black
          // one. So bluestone is gated on a ~126 m block mask and, ON those
          // blocks, takes nearly the WHOLE walk: a 35 % mix rendered as a
          // 128-vs-208 chequerboard (measured along the W 125th walk in
          // shots/audit/R3bus125_day.png), where a real bluestone walk is a
          // continuous blue-grey field with the odd concrete repair let into it.
          // Blocks 28 % -> 18 %, share on a bluestone block 35 % -> 86 %, value
          // lifted to land at 165-185 against concrete's 200. Patches: 4 % -> 2 %.
          float bsBlk = step(0.82, hash12(floor(gG / 126.0) + 5.9));
          if (srep < 0.07) { albedo = mix(albedo, vec3(0.693, 0.627, 0.400), 0.8); GND_rough = 0.68; }
          else if (srep > 0.978) { albedo = mix(albedo, vec3(0.168, 0.152, 0.124), 0.80); GND_rough = 0.9; }
          else if (bsBlk > 0.5 && srep > 0.12) {  // bluestone flag
            float bs = vnoise(gG * 6.0 + slab * 31.0);
            albedo = mix(albedo, mix(vec3(0.318, 0.330, 0.338), vec3(0.412, 0.424, 0.426), bs), 0.88);
            GND_rough = 0.74;
          }
          // The hardware a NYC walk is peppered with, and which no amount of
          // concrete tone can stand in for: 20-30 cm cast-iron pull-box lids
          // (rust brown, smooth) and the orange/pink utility LOCATE marks the
          // Con Ed/DEP crews spray before a dig. Both are all over the refs
          // (Amsterdam & 116, W 125th & Lenox). Folded into one 4.4 m cell so
          // this costs two hashes, not a new noise field.
          if (gNear > 0.02) {
            vec2 hc = gG / 4.4;
            vec2 hid = floor(hc);
            float hr = hash12(hid + 19.3);
            if (hr < 0.30) {
              vec2 hp = (fract(hc) - vec2(hash12(hid + 2.3), hash12(hid + 6.1)) * 0.7 - 0.15) * 4.4;
              float hd = length(hp);
              float lid = smoothstep(0.145, 0.115, hd) * gNear;
              albedo = mix(albedo, vec3(0.141, 0.093, 0.059), lid * 0.9);      // rusted iron lid
              albedo *= 1.0 - smoothstep(0.175, 0.148, hd) * (1.0 - lid) * 0.35; // seating ring
              GND_rough = mix(GND_rough, 0.52, lid * 0.8);
            } else if (hr > 0.86) {
              // spray-paint locate mark: a short fat stroke, orange or pink
              float mk2 = smoothstep(0.86, 0.995, gridge(gG * vec2(3.1, 11.0) + hid * 7.0));
              vec3 lc = hash12(hid + 31.7) > 0.45 ? vec3(0.55, 0.19, 0.030) : vec3(0.53, 0.13, 0.210);
              albedo = mix(albedo, lc, mk2 * 0.30 * gNear);
            }
          }
          // hairline cracks on ~22% of flags, corner spalls on a few
          if (hash12(sid + 3.9) < 0.22 && gNear > 0.01) {
            float rdg = gridge(gG * 3.4 + slab * 17.0);
            albedo *= 1.0 - smoothstep(0.90, 0.99, rdg) * 0.30 * gNear;
          }
          // staining: hosing/foot-traffic blotches, dark drip runs off the
          // building line, and the sooty grey that collects along the kerb
          albedo *= 1.0 - smoothstep(0.46, 0.9, fbm(vWPos.xz * 0.14 + 23.0)) * 0.13;
          albedo *= 1.0 - smoothstep(0.5, 0.9, fbm(vWPos.xz * 0.05 + 4.2)) * 0.17;
          // tree-pit / scaffold rust and grease haloes: warm dark, ~8 m apart
          {
            float halo = smoothstep(0.72, 0.97, fbm(vWPos.xz * 0.09 + 55.0));
            albedo = mix(albedo, albedo * vec3(0.86, 0.835, 0.825), halo * 0.45);
          }
          ${E10 ? `
          // ---- E10: GUM. Every square metre of a New York walk carries three to six
          // flattened black discs, and they are the single most recognisable thing about
          // the surface — more so than the flag joints, which we already draw. They are
          // also a CONTACT term in the sense that matters here: they give the walk a
          // population of small dark marks, which is what our concrete lacks against the
          // reference's (streets-audit measured our sidewalk as one value with two soft
          // ~5-11 cm feature, so it is gated on its OWN footprint and not on the shader's
          // generic gNear (which is still at 0.89 where a 5 cm disc is half a pixel — a
          // hash-gated sub-pixel disc is the window-stipple failure of round 7, in the
          // ground shader). Full weight while a spot is >= 6 px, gone before it is 2, i.e.
          // present within ~10 m of the camera and absent from every aerial. The correct
          // band-limited far field of gum really is nothing: 30 % of 0.46 m cells carrying
          // a 7 cm disc is 0.7 % of the surface by area.
          {
            float gumVis = smoothstep(0.030, 0.008, gFw);
            if (gumVis > 0.01) {
              vec2 mc = gG / 0.46;
              vec2 mid2 = floor(mc);
              float mh2 = hash12(mid2 + 91.7);
              if (mh2 < 0.30) {
                vec2 mp = (fract(mc) - vec2(hash12(mid2 + 4.7), hash12(mid2 + 12.1)) * 0.7 - 0.15) * 0.46;
                float md = length(mp) / (0.024 + 0.031 * fract(mh2 * 53.0));
                float gum = smoothstep(1.0, 0.62, md) * gumVis;
                albedo = mix(albedo, mix(vec3(0.055, 0.052, 0.048), vec3(0.150, 0.145, 0.138), fract(mh2 * 17.0)), gum * 0.85);
                GND_rough = mix(GND_rough, 0.62, gum * 0.5);
              }
            }
          }` : ''}
        } else if (m == 2) {
          // ---- NYC curb: matId 2 is ONLY the 0.14 m vertical face of the
          // granite/bluestone kerb (the top surface belongs to the sidewalk
          // mesh). World-XZ noise on a vertical strip smears into infinite
          // vertical streaks, so build a real 2D frame first: s runs ALONG the
          // kerb (arc length), vWPos.y runs up the face.
          // NYCDDC SB25-011: random lengths >= 36 in, 1/4 in mortared joints,
          // 6 in reveal. Measured off the refs, the kerb is NOT the dark mid
          // grey the last pass assumed: at Amsterdam & 116 the sunlit kerb
          // strip reads sRGB (203,186,167) — LIGHTER than the roadway (173) and
          // just below the flag above it (216), and warm. What makes it read as
          // stone is not its value but its VERTICAL STRUCTURE (below).
          vec2 ctan = normalize(vec2(-GND_wn.z, GND_wn.x) + 1e-5);
          float cs = dot(vWPos.xz, ctan);
          float blkLen = 1.2 + 0.9 * hash12(floor(vec2(cs / 3.0, 0.0)) + 4.1);
          float bId = floor(cs / blkLen);
          float blk = hash12(vec2(bId, 4.1));
          // granite speckle: grain that survives minification via the pixel
          // footprint along the kerb, not per-pixel salt
          float csFw = max(fwidth(cs), 1e-4);
          float spk = mix(0.5, vnoise(vec2(cs, vWPos.y) * 46.0), smoothstep(0.05, 0.008, csFw));
          albedo = mix(vec3(0.300, 0.286, 0.236), vec3(0.380, 0.362, 0.298), blk) * (0.90 + 0.20 * spk);
          // ---- FACE-LOCAL HEIGHT. The last pass could not do this because the
          // kerb was draped on a heightmap; the city now compiles on ONE FLAT
          // base plane, so world Y *is* face-local height:
          //   compile.mjs  BASE_Y 3.24 | asphalt BASE+0.145 = 3.385
          //                sidewalk/kerb top BASE+0.28 = 3.520  (0.135 reveal)
          // (the analytic-sidewalk path emits 3.385 -> 3.525; both share the
          // top, which is what the gradient is measured down from). CURB_TOP is
          // the only place that number appears — if TERRAIN=real comes back, or
          // LOT_Y moves, change it here. The inBand guard makes the failure
          // mode graceful: off the expected plane the face just loses its
          // gradient instead of banding at a wrong height.
          const float CURB_TOP = 3.520, CURB_REVEAL = 0.135;
          float cyRaw = (CURB_TOP - vWPos.y) / CURB_REVEAL;         // 0 = top arris, 1 = gutter
          float inBand = smoothstep(0.42, 0.26, abs(vWPos.y - (CURB_TOP - CURB_REVEAL * 0.5)));
          float cy = mix(0.5, clamp(cyRaw, 0.0, 1.0), inBand);
          // mortared block joints (1/4 in): thin dark verticals, AA'd
          {
            float jf = abs(fract(cs / blkLen) - 0.5) * blkLen;
            albedo *= 1.0 - smoothstep(csFw * 1.6 + 0.014, csFw * 0.4 + 0.002, jf) * 0.42;
          }
          // The three bands every NYC kerb has, top to bottom:
          //  1. the TOP ARRIS — 2 cm of stone rubbed bright by forty years of
          //     feet, salt and street sweepers, and the one part of the face
          //     that sees the whole sky. It is the brightest line in the frame
          //     at eye level and it is what makes a kerb legible at all.
          //  2. the stone body, with vertical splash mottle.
          //  3. the GUTTER FOOT — the bottom 3-4 cm, where grit, oil and leaf
          //     litter pack against the stone. Near black, and the thing that
          //     separates the kerb from the roadway without any geometry.
          albedo *= 1.0 + smoothstep(0.18, 0.02, cy) * 0.26 * inBand;
          albedo = mix(albedo, albedo * vec3(0.30, 0.30, 0.31),
                       smoothstep(0.62, 0.97, cy) * 0.80 * inBand);
          {
            float gr = fbm(vec2(cs * 1.1, vWPos.y * 5.5) + 12.0);
            albedo = mix(albedo, vec3(0.083, 0.077, 0.069),
                         smoothstep(0.52, 0.90, gr) * (0.30 + 0.42 * cy));
            float salt = smoothstep(0.72, 0.95, vnoise(vec2(cs * 2.3, vWPos.y * 9.0) + 71.0));
            albedo = mix(albedo, albedo * vec3(1.20, 1.17, 1.08), salt * 0.35 * gNear); // salt bloom
          }
          albedo *= 1.0 - smoothstep(0.5, 0.92, fbm(vWPos.xz * 0.09 + 2.2)) * 0.24;   // grime runs
          // Yellow "no standing" kerb paint. NYC paints the FACE AND THE TOP
          // ARRIS in one pass, so the top band takes it at full strength and it
          // thins out towards the gutter where the roller could not reach; it
          // is a saturated school-bus yellow, not a mustard tint.
          if (hash12(vec2(bId, 61.0)) > 0.90) {
            float yp = (0.55 + 0.45 * smoothstep(0.85, 0.35, cy))
                     * (0.72 + 0.28 * smoothstep(0.35, 0.75, vnoise(vec2(cs * 1.7, vWPos.y * 6.0) + 5.0)));
            albedo = mix(albedo, vec3(0.500, 0.310, 0.035), yp * 0.86);
            GND_paint = max(GND_paint, yp * 0.5);
          }
          GND_rough = 0.70 + 0.14 * blk; GND_spec = 0.90;   // polished granite keeps its sheen
        }
        else if (m == 3 || m == 4) {
          // ---- NYC road paint: hot-applied THERMOPLASTIC, ~2-3 mm proud of the
          // road, glass beads on top. Fresh it is a bright warm white; it
          // yellows and greys with age, and it fails in three distinct ways:
          //   * rubber transfer  — tyres lay a neutral grey-brown film over it
          //   * scuffing/polish  — the beads are ground off, roughness drops
          //   * chipping         — flakes lift and the asphalt shows through
          // Those are three different looks and the old single "wear" lerp to
          // asphalt could only do the third one.
          float age = fbm(vWPos.xz * 0.024 + 1.9);                 // per-crossing freshness
          float barCov = 1.0, barTone = 1.0;
          ${U10 ? `
          // ---- U10 (r9 blind pair p5: "crosswalk bars uniformly bright and
          // IDENTICAL"). The line above calls itself "per-crossing freshness"
          // and it is not: an fbm at 0.024 has a ~42 m wavelength, LONGER than a
          // crossing is wide, so every bar of one crossing sampled essentially
          // the same value and the crossing came out one flat tone. Nothing in
          // this branch was ever keyed to a BAR.
          //
          // Two seeds, no new physics. A crossing is painted in one visit, so
          // its bars share a base age -> a per-JUNCTION hash on a 55 m cell of
          // the grid frame (the Manhattan block is ~80 x 270 m, so one cell
          // holds at most one crossing). On top of that a per-BAR coverage,
          // 60-100 %: the bars in the wheel tracks lose their film first, a bus
          // that stops on one bar takes it off in a summer, and DOT patches
          // single bars.
          {
            age = clamp(mix(age, hash12(floor(gG * (1.0 / 55.0)) + 7.13), 0.70), 0.0, 1.0);
            // Bar AXIS from the same ~130 m mask gstreak uses to decide which
            // grid axis a block runs on, so the bar grain and the tyre streaks
            // can never disagree: fine (1.45 m, the continental bar pitch)
            // across the bars, coarse (9 m) along them, which is why this does
            // not draw a checkerboard on a stop bar or a lane line.
            float axm = step(0.5, smoothstep(0.38, 0.62, vnoise(gG * 0.0075 + 41.0)));
            vec2 bq = mix(vec2(floor(gG.x * (1.0 / 1.45)), floor(gG.y * (1.0 / 9.0))),
                          vec2(floor(gG.x * (1.0 / 9.0)), floor(gG.y * (1.0 / 1.45))), axm);
            barCov = 0.60 + 0.40 * hash12(bq + 11.37);
            barTone = 0.93 + 0.14 * hash12(bq + 29.71);
            // STIPPLE RULE: a 1.45 m bin is 6.6 px at gFw 0.22 and 1.3 px at
            // 1.10, so both terms converge to their OWN MEAN (0.80 and 1.0, not
            // to "no wear") before a bar can reach a pixel. Converging to 1.0
            // would make every distant crossing brighter than the near ones.
            barCov = mix(0.80, barCov, gMid);
            barTone = mix(1.00, barTone, gMid);
          }` : ''}
          vec3 fresh = m == 3 ? vec3(0.618, 0.600, 0.556) : vec3(0.408, 0.212, 0.014);
          vec3 old   = m == 3 ? vec3(0.446, 0.420, 0.336) : vec3(0.292, 0.160, 0.026);
          vec3 paintC = mix(fresh, old, smoothstep(0.34, 0.86, age)) * barTone;
          // rubber film: anisotropic along the roadway, the strongest and most
          // recognisable contamination on a NYC crosswalk bar
          float rubber = smoothstep(0.46, 0.90, gstreak(gG, 0.03, 0.85, 4.4)) * (0.35 + 0.65 * age);
          paintC = mix(paintC, paintC * vec3(0.70, 0.695, 0.68), rubber * 0.60);
          // chipping: fine ridged flakes at 4-12 cm, plus a coarser blotch, all
          // mip-faded. The old 50 m low-frequency blob erased whole junction
          // halves, so it now contributes barely a third of the wear budget and
          // the fine scales carry the rest.
          // wear follows the DIRECTION OF TRAVEL (grid frame gG), never world XZ:
          // the old ridged noise in world space drew isotropic creases that read as
          // worm doodles / black tendrils across every crosswalk (review R3 #2).
          // The wheel-track streak the asphalt branch already
          // computes carries the fine wear; the blotch and pits stretch along travel.
          float wearArea = fbm(gG * vec2(0.021, 0.034) + 7.3);
          float flake = smoothstep(0.55, 0.95, gstreak(gG, 0.02, 0.62, 7.1));
          float pit   = smoothstep(0.58, 0.93, vnoise(gG * vec2(2.4, 6.4)));
          float wear = smoothstep(0.30, 0.95,
              wearArea * 0.15 + flake * 0.48 * gNear + pit * 0.31 + rubber * 0.30);
          // NYC DOT repaints often enough that a crossing is ALWAYS legible.
          // The cap is down from 0.62 to 0.46 and the 50 m blob from 0.26 to
          // 0.15 of the budget: at 0.62 towards bare asphalt the bars grew
          // black blotches big enough to read as half-erased paint, which is
          // not a failure mode NYC thermoplastic has — it goes grey and
          // translucent from the aggregate showing through a THINNED film, and
          // it wears at the bar edges and in the wheel tracks, in fine speckle.
          wear = clamp(wear, 0.03, 0.46);
          float wearCap = 0.46;
          ${U10 ? `
          // spend the per-bar budget. A 60 %-coverage bar carries about 1.9x the
          // wear of a fresh one and the CAP moves with it, so the worst bar in a
          // crossing can go further than the round-9 ceiling while the best one
          // stays crisper than it used to — which is the point: the tell was the
          // absence of a SPREAD, not the level.
          wear = clamp(wear * (2.40 - 1.40 * barCov) + (1.0 - barCov) * 0.10, 0.02, 0.62);
          wearCap = 0.62;` : ''}
          // AM120 (2026-09-15, docs/notes/amst120-critic.md): the light end of the asphalt mix was a warm TAN (0.55,0.41,0.23),
          // so a sunlit avenue sampled rgb(160,150,135) against rgb(~100,107,120) on the real Amsterdam Ave — 55 % too bright and
          // the wrong hue. Worn NYC asphalt is a cool mid-grey: the light end is now neutral-cool and the mix range narrower.
          vec3 asph = mix(vec3(0.1259, 0.1328, 0.1276), vec3(0.3300, 0.3380, 0.3520), n1 * 0.5 + 0.15);
          // worn target: aggregate read through a residual film, NEVER bare road
vec3 worn = mix(asph, paintC * 0.80, 0.62);
          albedo = mix(paintC, worn, wear / wearCap);
          GND_paint = 1.0 - wear;                                  // intact film coverage
          // thermoplastic is much smoother than the aggregate around it, and
          // polishes further where the tyres run
          GND_rough = mix(mix(0.62, 0.50, rubber), 0.88, wear);
          GND_spec = mix(0.50, 1.0, GND_paint);   // glass beads: the film really is glossy
        }
        else if (m == 5) {
          // lawn: broad hue drift + dry/trodden patches. Blade detail lives in
          // the grass PBR set; this only sets the value and hue it modulates.
          vec3 base = mix(vec3(0.082, 0.152, 0.048), vec3(0.152, 0.238, 0.076), n1);
          float pat = fbm(vWPos.xz * 0.055 + 17.0);
          base = mix(base, vec3(0.205, 0.208, 0.086), smoothstep(0.58, 0.82, pat) * 0.55); // worn/dry patches
          albedo = base;
          GND_rough = 0.97;
        }
        else if (m == 6) {
          // park path: compacted stone dust / hexblock, warm grey — never the
          // flat tan card it used to be (n2 is a constant, so the old mix
          // resolved to one colour everywhere)
          float pg = fbm(vWPos.xz * 0.6 + 13.0);
          albedo = mix(vec3(0.162, 0.150, 0.130), vec3(0.238, 0.220, 0.190), pg * 0.55 + n1 * 0.45);
          albedo *= 1.0 - smoothstep(0.55, 0.92, fbm(vWPos.xz * 0.07 + 8.0)) * 0.22;
          GND_rough = 0.92;
        }
        else if (m == 9) {
          // NYC bike lane: MUTCD green (a deep emerald, not a lawn green),
          // rolled thin over the asphalt so the aggregate reads through, and
          // scrubbed to bare road in the wheel line
          // ROUND 3: measured on the Amsterdam Ave lane, FOV-matched
          // (shots/audit/R3amst116gutter_day.png): the lane rendered
          // (100,123,111) — G-R only 23, G-B only 12 — a desaturated sage where
          // §4 targets MUTCD/IA-14 at (62,151,98). Same cause as the bus lane:
          // the sky fill is blue and adds to R and B, and ACES pulls the rest of
          // the chroma out. R x0.55, B x0.75, G x1.25 on the authored value, and
          // the wear cap down 0.72 -> 0.58 so a scrubbed lane keeps a film.
          vec3 bkC = mix(vec3(0.0145, 0.135, 0.039), vec3(0.026, 0.210, 0.058), n1);
          float bw2 = smoothstep(0.34, 0.92, gstreak(gG, 0.045, 0.7, 12.0) * 0.62
                    + fbm(vWPos.xz * 0.4 + 12.0) * 0.24 + fbm(vWPos.xz * 0.03 + 5.0) * 0.30) * 0.58;
          vec3 asph2 = mix(vec3(0.1259, 0.1328, 0.1276), vec3(0.3300, 0.3380, 0.3520), n1 * 0.5 + 0.15);   // AM120: see asph above
          albedo = mix(bkC, asph2, bw2);
          GND_paint = (1.0 - bw2) * 0.7;
          GND_rough = mix(0.70, 0.88, bw2);
        } // bike lane green, worn
        else if (m == 10) {
          // Campus red brick, herringbone at 45° to the TRUE College Walk axis
          // (0.8744, 0.4853 — derived from the OSM pedestrian way; the campus
          // grid shares this bearing). No granite bands — they read as stray
          // white lines cutting across the paths.
          float wAlong = vWPos.x * 0.8744 + vWPos.z * 0.4853;
          float wAcross = -vWPos.x * 0.4853 + vWPos.z * 0.8744;
          vec2 hb = mat2(0.7071, -0.7071, 0.7071, 0.7071) * vec2(wAlong, wAcross);
          vec2 bc = vec2(hb.x / 0.62, hb.y / 0.205);
          float bt = hash12(floor(bc) + 7.0);
          albedo = mix(vec3(0.148, 0.066, 0.050), vec3(0.212, 0.110, 0.076), bt) * (0.86 + 0.2 * n2);
          // mortar joints, derivative-faded so distance doesn't sparkle
          vec2 jf = abs(fract(bc) - 0.5);
          float jw = max(fwidth(bc.y), 0.02);
          float joint = smoothstep(0.5 - jw * 1.6, 0.5 - jw * 0.2, max(jf.x * 0.42, jf.y));
          float jointVis = smoothstep(0.45, 0.12, fwidth(bc.y));
          albedo = mix(albedo, vec3(0.176, 0.160, 0.143), joint * 0.55 * jointVis);
          GND_rough = 0.86;
          // ---- Low Plaza granite motifs (McKim paving: nested square panels,
          // fountain medallions, granite frame) — campus-axis coords rel. Alma
          {
            float pa = (vWPos.x - 764.23) * 0.465 + (vWPos.z + 2747.81) * -0.885;
            float pc = (vWPos.x - 764.23) * 0.885 + (vWPos.z + 2747.81) * 0.465;
            if (pa > -45.0 && pa < -6.0 && abs(pc) < 56.0) {
              float gm = 0.0;
              float aaP = fwidth(pa) + fwidth(pc);
              float e = max(0.06, aaP * 0.75);
              // fountain medallion distance (field panels yield to the circles —
              // the outer panels read as the photo's chamfered pentagons)
              float rrW = length(vec2(pa, pc) - vec2(-21.0, -23.0));
              float rrE = length(vec2(pa, pc) - vec2(-21.0, 23.0));
              float rr = min(rrW, rrE);
              // nested-square panel field: 7 x 2 cells (outer two cut by medallions)
              if (pa > -31.4 && pa < -10.6 && abs(pc) < 27.5 && rr > 6.2) {
                vec2 cell = vec2((pc + 27.5) / 7.857, (pa + 31.4) / 10.4);
                vec2 cu = abs(fract(cell) - 0.5) * vec2(7.857, 10.4); // meters from cell center
                float m1 = max(cu.x, cu.y);
                gm = max(gm, smoothstep(3.55 - e, 3.55, m1));                      // cell border
                gm = max(gm, smoothstep(2.3 - e, 2.3, m1) * smoothstep(2.95 + e, 2.95, m1)); // outer band
                gm = max(gm, smoothstep(1.05 - e, 1.05, m1) * smoothstep(1.65 + e, 1.65, m1)); // inner band
                gm = max(gm, smoothstep(0.45 + e, 0.45, m1));                      // center block
              }
              // medallions: granite ring + X diagonals + hub around the basin
              if (rr < 6.6) {
                gm = max(gm, smoothstep(5.4 - e, 5.4, rr) * smoothstep(6.05 + e, 6.05, rr)); // outer ring
                vec2 d2 = vec2(pa, pc) - (rrW < rrE ? vec2(-21.0, -23.0) : vec2(-21.0, 23.0));
                float diag = min(abs(d2.x - d2.y), abs(d2.x + d2.y));
                gm = max(gm, smoothstep(0.5 + e, 0.5 - e, diag) * smoothstep(5.4, 2.2, rr));
                gm = max(gm, smoothstep(2.55 + e, 2.55, rr));                      // hub under the fountain
              }
              // ref photo: the WHOLE court reads tan granite; red brick is the
              // accent — pattern bands, medallions, and the border frames
              float redM = clamp(gm, 0.0, 1.0);
              redM = max(redM, smoothstep(52.6 - e, 52.6 + e, abs(pc)));  // side border strips at the Kent/Dodge building line
              redM = max(redM, smoothstep(-8.2 - e, -8.2 + e, pa));       // north band at the parterre wall
              redM = max(redM, smoothstep(-43.6 + e, -43.6 - e, pa));     // south band at the walk flight
              vec3 gran2 = mix(vec3(0.246, 0.233, 0.211), vec3(0.278, 0.264, 0.242), n2);
              // faint 1.5m paver joints on the tan court
              vec2 pj = abs(fract(vec2(pa, pc) / 1.5) - 0.5);
              float pjw = max(fwidth(pa) / 1.5, 0.015);
              float pjoint = smoothstep(0.5 - pjw * 1.5, 0.5 - pjw * 0.2, max(pj.x, pj.y)) * smoothstep(0.4, 0.1, fwidth(pa));
              gran2 *= 1.0 - pjoint * 0.1;
              vec3 brickBand = mix(vec3(0.184, 0.084, 0.063), vec3(0.228, 0.118, 0.084), n2);
              albedo = mix(gran2, brickBand, redM);
              GND_rough = mix(0.72, 0.86, redM);
            }
          }
          albedo *= 0.92 + 0.13 * n1; // weathering drift
        }
        else if (m == 13 || m == 14) {
          // ---- detectable-warning plate (compiler sections warn / warnIron at
          // every crosswalk end): 60 mm dome grid, 34 mm truncated domes, laid in the
          // street frame so the rows run with the kerb. 13 = brick-red composite,
          // 14 = bare cast iron (a recent capital job: concrete's own value, neutral).
          // Each dome shades light on its sun-facing quadrant and dark on the far one.
          vec2 dq = fract(gG / 0.06) - 0.5;
          float dd = length(dq) * 0.06;                               // metres from the dome centre
          float dome = 1.0 - smoothstep(0.015, 0.019, dd);            // r 17 mm with AA
          float shade = clamp(0.5 + (dq.x - dq.y) * 0.9, 0.0, 1.0);
          vec3 plate = (m == 13 ? vec3(0.235, 0.085, 0.062) : vec3(0.190, 0.185, 0.175)) * (0.86 + 0.14 * n1);
          albedo = mix(plate * 0.74, plate * (0.92 + 0.34 * shade), dome * gMid);
          GND_rough = m == 13 ? 0.78 : 0.62;
        }
        else {
          // terrain / far carpet. Inside the city this is the filler between
          // compiled sidewalk polygons and the building line, so it must read
          // as dusty urban ground, not as the pale desert soil it used to be
          // (which drew tan strips down every block in the top-down).
          // (critic r5: the vacant lot at 125th & Lenox and every backlot read as a "blank quad" of
          // dirt.) In Manhattan the ground between sidewalks and building lines is paved — concrete
          // yards, asphalt lots, gravel — so the filler is weathered pavement with darker damp patches,
          // not soil; the detail block below gives it the concrete grain when it is not schist.
          vec3 soil = mix(vec3(0.158, 0.152, 0.140), vec3(0.235, 0.228, 0.212), n1);
          soil *= 1.0 - smoothstep(0.5, 0.9, fbm(vWPos.xz * 0.06 + 19.0)) * 0.30;
          albedo = soil;
          if (m == 8) albedo = mix(albedo, vec3(0.118, 0.116, 0.112), 0.55); // urban carpet tint
          GND_rough = 0.95;
        }
        // ---- roadway edge classes the compiler cuts out of the asphalt ribbon
        // (11 gutter, 12 red bus lane). Both keep everything the asphalt branch
        // just did — lot age, skin patches, sealant, castings and the asphalt
        // texture tap below — because a gutter and a bus lane ARE that pavement,
        // treated. Only the treatment is authored here.
        //
        // ONE COORDINATE MAKES THE GUTTER POSSIBLE. The ground mesh carries only
        // position and matId: no distance-to-kerb, no lane axis (audit G7). But
        //     gT = gG.x + gG.y
        // is arc length ALONG any kerb that runs on either commissioners'-grid
        // axis — dot((1,1), MG_A) = dot((1,1), MG_B) = 1 per metre — while it
        // varies by at most the strip's own 0.45 m ACROSS it. So inside a gutter
        // fragment gT is a true along-kerb parameter that needs NO guess about
        // the street bearing: the grime can run lengthwise and a catch basin can
        // sit square across the strip whichever way the kerb goes. (It degenerates
        // only on a kerb at 45 deg to both axes — Broadway — which simply gets no
        // basins.) The bus lane is 3.35 m wide, so gT is useless there and the
        // scrub keeps using the asphalt branch's own wheel tracks.
        float gT = gG.x + gG.y;
        if (mRaw == 11) {
          // ---- GUTTER: 0.45 m against every kerb and every corner return.
          // Measured (sunlit) off refs/streetview — lane vs gutter in the SAME frame:
          //   Bedford Ave & N 7, 2022-07     lane (130,124,113) -> gutter (120,111,101)  x0.80 linear
          //   Amsterdam & W 116, 2021-08     lane (172,167,155) -> gutter (170,164,152)  x0.97 (paved that year)
          //   Broadway & Chambers, 2024-11   lane (58,67,83) BLUE -> gutter (83,75,71) WARM, +10 luma
          // The unifying read is NOT "darker". It is the roadway pushed WARM and
          // matte: an oil-and-dirt pack right at the stone, plus bright warm
          // grit, salt and leaf litter in lengthwise clumps. Over a fresh blue
          // binder that LIGHTENS the gutter; over a bleached tan lane it darkens
          // it. Mean here lands at x0.84 with R/B up ~3 %, and the value shift is
          // deliberately NOT gated on gMid — the dark line at the kerb is the
          // strongest read of a street edge from 100 m, and the lead's minimal
          // version faded it out with distance. Only the grit texture fades.
          float run  = vnoise(vec2(gT * 0.21, 3.3)) * 0.62 + vnoise(vec2(gT * 1.05, 8.7)) * 0.38;
          float grit = smoothstep(0.40, 0.78, run) * mix(0.45, 1.0, gMid);
          float dirty = mix(0.34, 1.0, GND_age);        // a repaved block face has a clean gutter
          albedo = mix(albedo, vec3(0.050, 0.042, 0.032), 0.34 * dirty);
          albedo = mix(albedo, vec3(0.270, 0.222, 0.146), grit * 0.42);
          GND_rough = min(1.0, GND_rough + 0.035);
          GND_spec *= 0.88;                              // silted: never a wet sheen
          // DEP catch basin: a ~0.6 m cast grate hard against the stone every
          // 30-90 m of kerb (Broadway & Chambers, W 125th at ACP), set in a
          // concrete/granite header, bars ~5 cm and running INTO the kerb.
          {
            float bc = gT / 34.0, bId = floor(bc);
            if (hash12(vec2(bId, 71.3)) < 0.66) {
              float bp = abs(fract(bc) - (0.18 + 0.64 * hash12(vec2(bId, 13.7)))) * 34.0;
              float bAA = max(fwidth(gT), 0.006);
              float hdr = smoothstep(0.62 + bAA, 0.62 - bAA, bp);
              float grt = smoothstep(0.31 + bAA, 0.31 - bAA, bp);
              albedo = mix(albedo, vec3(0.238, 0.216, 0.180), hdr * 0.72);
              albedo = mix(albedo, vec3(0.060, 0.055, 0.050), grt * 0.92);
              albedo *= 1.0 + grt * (0.5 - abs(fract(gT / 0.052) - 0.5)) * 1.25 * gNear;
              GND_rough = mix(GND_rough, 0.52, grt * 0.8);
              GND_spec = max(GND_spec, grt * 0.95);
            }
          }
          ${E10 ? `
          // ---- E10: the gutter is where the street's dirt COLLECTS, and collected dirt
          // is spotty, not a uniform tint. The r8/r9 strip is a value shift plus one
          // lengthwise grit run: from 2 m it reads as a painted band. What a photograph of
          // a NYC gutter has is discrete marks — flattened black gum, tar drips, a crushed
          // can's shadow — over larger soft oil-and-silt blots that kill the sheen the
          // asphalt beside them still has. The spots are a 5-11 cm feature, so they are
          // gated on their OWN footprint (full at >= 6 px, gone before 2 px) rather than on
          // the shader's generic gNear — a hash-gated sub-pixel disc is a stipple, and
          // gNear is still 0.9 at a footprint where one of these is half a pixel. The blots
          // are a 1.4 m feature and survive to the aerials.
          {
            float spotVis = smoothstep(0.030, 0.008, gFw);
            vec2 gc = vWPos.xz / 0.55;
            vec2 gid = floor(gc);
            float gh = hash12(gid + 57.1);
            if (gh < 0.34 && spotVis > 0.01) {
              vec2 gp = (fract(gc) - vec2(hash12(gid + 2.9), hash12(gid + 8.3)) * 0.72 - 0.14) * 0.55;
              float gd = length(gp) / (0.026 + 0.032 * fract(gh * 31.0));
              float spot = smoothstep(1.0, 0.68, gd) * spotVis;
              albedo = mix(albedo, vec3(0.050, 0.046, 0.041), spot * 0.82);
              GND_rough = mix(GND_rough, 0.58, spot * 0.6);
            }
            float oil = smoothstep(0.60, 0.86, fbm(vWPos.xz * 0.72 + 19.0)) * mix(0.55, 1.0, gMid);
            albedo = mix(albedo, albedo * vec3(0.44, 0.43, 0.46), oil * 0.55);
            GND_rough = mix(GND_rough, 0.46, oil * 0.5);
            GND_spec = max(GND_spec, oil * 0.9);
          }` : ''}
        } else if (mRaw == 12) {
          // ---- NYC DOT RED BUS LANE (W 125th, 5th Ave, 1st/2nd Ave...).
          // Measured on W 125th at ACP Blvd, 2023-08, FULL SUN, the red and the
          // lane beside it in the same frame, three patches each:
          //   red (186,140,134) / (193,142,135)   lane (142,138,134) / (153,151,146)
          // In LINEAR terms the film keeps the asphalt's G, drops B by ~6 % and
          // multiplies R by 1.63. It is a thin red-oxide coating over grey
          // aggregate, not an opaque slab: luma barely moves (+4 to +12), the
          // aggregate reads straight through, and the entire read is CHROMA
          // (R-G = 46). Authoring it as a multiply on this block's own asphalt is
          // therefore both cheaper and more faithful than an absolute albedo.
          // The round-2 note's (121,89,94) is the same paint in the 2022-06
          // OVERCAST panorama of this block — 50 luma below its sunlit value.
          // The multiply SHIPS at (1.98, 0.826, 0.765), not the measured
          // (1.63, 1.00, 0.94), and the two rounds of correction are worth
          // recording because the naive value is what fails:
          //   at (1.63,1.00,0.94) the render was (178,152,137) — the right LUMA
          //   (156 vs the panorama's 150) but only R-G = 26 against 46-51;
          //   at (1.90,0.96,0.93) it was (186,150,136) — R exactly on the
          //   panorama's linear 0.491, R-G up to 35, the whole residual in G
          //   (linear 0.305 vs 0.262) and B (0.246 vs 0.238).
          // ACES desaturates hard once the road is this bright and the
          // mean-preserving texture multiply pulls chroma out again, so the film
          // has to ABSORB G and B, not just add R — which is what a red pigment
          // does anyway. G x0.826 and B x0.765 close the gap; B carries the extra
          // 12 % because the asphalt's own B went up 14 % in the hue fix above.
          // ---- LIGHTING-R6 CORRECTION (docs/notes/lighting-r6.md 2). The
          // shipped multiply (1.98, 0.826, 0.765) has a Rec.709 LUMA of
          //   0.2126*1.98 + 0.7152*0.826 + 0.0722*0.765 = 1.067
          // so the film made the lane 6.7 % BRIGHTER than the asphalt it sits
          // on, and the 0.35 blend toward (0.340,0.129,0.098) lifted it further.
          // Measured on the shipped build at markings125, same row, mean sRGB:
          //   DAY   red 129.2 / 131.2   asphalt 127.3 / 125.0
          //   DUSK  red  38.7 /  39.2   asphalt  37.1 /  33.3
          // The lane is lighter than the road at BOTH times of day, so the
          // round-5 hypothesis that this was the daylight tonemap cannot be
          // right: a tone curve is monotone in luminance and cannot invert an
          // ordering. What makes dusk LOOK right is chroma, not value — the
          // asphalt goes strongly blue under skylight (R-B -25..-30) while the
          // red stays neutral-warm (R-B -1), and that chroma break reads as
          // "darker and far more saturated". At day the asphalt is +15 warm, the
          // break collapses, and the pale luma is all that is left.
          // Fixed here, in the only place it can be: luma factor 0.80 (a fifth
          // darker than the road, which is what NYC DOT red actually is) with R
          // held at 1.70 so the chroma break survives ACES/AgX desaturation.
          //   0.2126*1.70 + 0.7152*0.558 + 0.0722*0.550 = 0.801
          vec3 filmed = albedo * vec3(1.70, 0.558, 0.550);
          // ...blended toward the product's own value so a lane laid on fresh
          // black binder still reads red instead of maroon-black. The constant
          // is now BELOW a typical asphalt albedo instead of well above it, and
          // the blend is lighter, so it can no longer lift the lane over the road.
          vec3 red = mix(filmed, vec3(0.150, 0.048, 0.040), 0.18);
          float cov = 0.95 * (1.0 - GND_wheel * 0.42) * (1.0 - GND_cast);
          cov *= 1.0 - smoothstep(0.52, 0.90, fbm(vWPos.xz * 0.075 + 3.7)) * 0.24;
          albedo = mix(albedo, red, cov);
          GND_rough = mix(GND_rough, 0.88, cov);
          GND_spec = mix(GND_spec, 0.58, cov);
        }
        // ---- steep ground: Manhattan schist. Morningside and Riverside are
        // scoured schist outcrops with retaining cuts, so anything past ~35 deg
        // has to stop being lawn: grass texels stretch into vertical smears on
        // a wall and read as painted concrete. Strata are laid out in an
        // (along-face, world-Y) frame, so they never stretch with the slope.
        if (m == 5 || m == 7 || m == 8) {
          GND_rock = smoothstep(0.819, 0.500, abs(GND_wn.y)); // 35 deg -> 60 deg
          // ...but the COLUMBIA SUPERBLOCK is not a schist outcrop. Its terraces
          // are padAt banks — granite retaining walls with lawn over them — and
          // the slope rule was turning the plaza flank ramps either side of the
          // cascade into bare cliff rock (campus owner, 2026-09-03). Morningside
          // Park's real outcrops start east of x ~ 1100, so this box is clear of
          // them; Riverside is far west. Feathered 16 m so a steep surface
          // straddling the edge does not step. AABB, not the campus-axis frame
          // the matId 10 branch uses, because this runs on every grass and
          // terrain fragment in the city and four compares are the cheap way.
          {
            vec2 c0 = smoothstep(vec2(545.0, -3036.0), vec2(561.0, -3020.0), vWPos.xz);
            vec2 c1 = smoothstep(vec2(995.0, -2502.0), vec2(979.0, -2518.0), vWPos.xz);
            GND_rock *= 1.0 - c0.x * c0.y * c1.x * c1.y;
          }
          if (GND_rock > 0.004) {
            float ha = dot(vWPos.xz, normalize(vec2(GND_wn.z, -GND_wn.x) + 1e-5));
            vec2 rf = vec2(ha, vWPos.y);
            // Feature scales are chosen so nothing lands under a pixel at the
            // 40-90 m the park cliffs are actually seen from: 15 cm laminations
            // aliased into a dotted screen door on the first pass.
            float mass = fbm(rf * vec2(0.10, 0.075) + 41.0);              // 10-13 m blocks: gives the cut form
            float band = fbm(rf * vec2(0.40, 1.10) + 5.0);                // ~0.9 m foliation
            float lam = gridge(rf * vec2(1.0, 3.0) + 2.0);                // ~0.33 m laminations
            vec3 rock = mix(vec3(0.082, 0.076, 0.068), vec3(0.208, 0.192, 0.170), band * 0.6 + mass * 0.4);
            // muscovite is silvery, biotite near black: the seams read as a
            // cool glitter, with a sparser warm band for the iron/garnet staining
            rock = mix(rock, rock * vec3(1.42, 1.42, 1.38), smoothstep(0.62, 0.97, lam) * 0.80 * gMid);
            rock = mix(rock, rock * vec3(0.42, 0.40, 0.38), smoothstep(0.55, 0.20, band) * 0.55);   // biotite / shadowed cleavage
            rock = mix(rock, rock * vec3(1.24, 1.02, 0.78), smoothstep(0.72, 0.97, fbm(rf * vec2(0.55, 1.7) + 61.0)) * 0.55);
            rock *= 0.86 + 0.28 * vnoise(rf * 6.0) * gNear + 0.14 * (1.0 - gNear);
            // quartz / pegmatite dikes: the NYC Parks outcrops are cut by pale
            // veins running ACROSS the foliation, which is what stops a banded
            // wall from reading as corduroy. Rotated frame, wider AA than the
            // laminations because they must survive minification.
            {
              vec2 dk = vec2(rf.x * 0.62 + rf.y * 0.78, -rf.x * 0.78 + rf.y * 0.62);
              float vein = gridge(dk * vec2(0.42, 0.085) + 77.0);
              rock = mix(rock, rock * vec3(1.65, 1.62, 1.55) + 0.010,
                         smoothstep(0.86, 0.995, vein) * 0.75 * gMid);
            }
            // seepage: water tracks down a cut face and leaves near-black
            // vertical stains with a mineral crust at the bottom. Stretched
            // 8:1 in the (along-face, height) frame.
            float seep = smoothstep(0.50, 0.90, fbm(vec2(rf.x * 1.30, rf.y * 0.16) + 53.0));
            rock = mix(rock, rock * vec3(0.44, 0.46, 0.50), seep * 0.72);
            // Moss / lichen. There is no face-local height (the cut is a
            // terrain-draped grid, no UV), so the toe is inferred from the
            // rock mask itself: moss takes the two TRANSITION bands where the
            // slope is easing back into ground — the crest and the toe — which
            // is exactly where Morningside is green, and never the open face.
            float toe = smoothstep(0.06, 0.42, GND_rock) * (1.0 - smoothstep(0.55, 0.90, GND_rock));
            float moss = smoothstep(0.46, 0.88, fbm(rf * vec2(0.55, 0.9) + 30.0));
            rock = mix(rock, vec3(0.052, 0.076, 0.038), moss * (0.34 + 0.62 * toe));
            // damp algae film in the crevices themselves (low bands of the foliation)
            rock = mix(rock, vec3(0.040, 0.058, 0.034),
                       smoothstep(0.42, 0.10, band) * smoothstep(0.35, 0.8, moss) * 0.45);
            GND_spec = 0.80;   // wet-looking schist is real, but not a mirror
            albedo = mix(albedo, rock, GND_rock);
            GND_rough = mix(GND_rough, 0.82, GND_rock);
          }
        }
        #ifdef GNDDEBUG
        {
          vec3 pal[16];
          pal[0]=vec3(0.8,0.1,0.1); pal[1]=vec3(0.9,0.9,0.1); pal[2]=vec3(0.9,0.1,0.9); pal[3]=vec3(1.0);
          pal[4]=vec3(0.9,0.6,0.1); pal[5]=vec3(0.1,0.9,0.1); pal[6]=vec3(0.1,0.3,0.9); pal[7]=vec3(0.1,0.9,0.9);
          pal[8]=vec3(0.3); pal[9]=vec3(0.05,0.45,0.2); pal[10]=vec3(1.0,0.5,0.0); pal[11]=vec3(0.45,0.45,0.5);
          pal[12]=vec3(0.6,0.0,0.3); pal[13]=vec3(1.0,0.35,0.1); pal[14]=vec3(0.55,0.55,0.62); pal[15]=vec3(0.0);
          albedo = pal[mRaw > 15 ? 15 : mRaw];   // 11 gutter (slate), 12 bus lane (wine), 13 warn plate (orange), 14 iron plate (steel), 15 unknown
        }
        #endif
        // rain response (precipitation-surfaces contract: wetness, puddles and
        // ripples share the SAME weather clock/coverage as the falling rain)
        if (wet > 0.003) {
          float wpn = vnoise(vWPos.xz * 0.13) * 0.6 + vnoise(vWPos.xz * 0.031) * 0.4;
          float damp = wet * (0.5 + 0.5 * wpn);
          float pud = smoothstep(0.66, 0.8, wpn) * wet * step(0.5, abs(float(m) - 5.0)); // pooling on pavements, not grass
          albedo *= 1.0 - 0.3 * damp - 0.25 * pud;
          GND_rough = mix(GND_rough, 0.32, damp * 0.65);
          GND_rough = mix(GND_rough, 0.06, pud);
          // specular-AA: mirror-gloss puddles alias into white sparkle at
          // distance — widen roughness with the pixel footprint
          GND_rough = max(GND_rough, smoothstep(0.1, 0.45, length(fwidth(vWPos.xz))) * 0.5 * wet);
          GND_spec = mix(GND_spec, 1.0, clamp(damp + pud, 0.0, 1.0));  // water film restores a full dielectric F0
        }
        // ---- real PBR surface detail (Phase 1/2): world-UV texture layer with
        // anti-tiling, single-tap parallax from displacement, crevice grime,
        // normal + roughness response. Procedural paint/pattern/wet/snow layers
        // composite ON TOP so nothing regresses.
        //
        // Every colour tap is now a MEAN-PRESERVING DETAIL MULTIPLY (gdet):
        // the old code lerped the authored albedo towards (tex * k), so at
        // close range the map's own level replaced the value the branch above
        // had chosen — which is why NYC asphalt authored at 0.05 rendered as a
        // uniform grey-blue sheet, and why the surface changed value as you
        // walked towards it. Dividing by each map's measured mean keeps the
        // authored albedo and takes only the grain. Means (linear, 256px
        // average of the source jpg) are in docs/notes/surfaces.md.
        {
          float fw = length(fwidth(vWPos.xz));
          float det = smoothstep(1.0, 0.3, fw);
          if (det > 0.02) {
            float mk = smoothstep(0.35, 0.65, vnoise(vWPos.xz * 0.017));
            vec3 wV = normalize(vWPos - cameraPosition);
            if (m == 0 || m == 3 || m == 4 || m == 9) {           // asphalt (+ paint keeps its colour, gains relief)
              vec2 uv = vWPos.xz * 0.16; // finer tiling: 0.09 read as blown-up macro texture
              float hgt = atex(t_asD, uv, mk).x;
              // r8 BAND-LIMIT (?aa=0 reverts to plain det). The parallax offset is
              // a function of a TEXTURE READ (hgt), so uv carries hgt's own
              // high-frequency gradient — and the hardware picks the mip level
              // for t_asC / t_asN from dFdx(uv). Neighbouring pixels therefore
              // sample DIFFERENT mip levels of the colour and normal maps in a
              // noisy pattern, which is per-pixel LOD jitter: the textbook
              // parallax-mapping shimmer, and it drives the normal that drives
              // the specular. det kept it alive out to a 1 m pixel footprint,
              // where the relief it buys is long invisible (a 3 cm crevice at
              // 0.3 m/px is a tenth of a pixel). Gate it on the near footprint
              // instead: the look is identical inside ~20 m and the LOD noise
              // is gone beyond it. The DISPLACEMENT is still read for crevice
              // grime, which is a scalar multiply and cannot destabilise a mip.
              float pxDet = det * ${AAFIX ? 'smoothstep(0.26, 0.05, fw)' : '1.0'};
              uv -= wV.xz / max(-wV.y, 0.3) * 0.03 * (1.0 - hgt) * pxDet * (1.0 - GND_paint);
              vec3 tc = atex(t_asC, uv, mk).rgb;
              // thermoplastic is a 2-3 mm film: it FILLS the aggregate, so the
              // grain, the crevice grime and the normal relief all fade out
              // with paint coverage and come back exactly where it has worn.
              float bare = 1.0 - GND_paint;
              float agg = 0.55 + 0.85 * vnoise(vWPos.xz * 0.62 + 3.0);
              albedo *= gdet(tc, vec3(43.5, 43.5, 50.0), 0.30 * agg * mix(1.0, 0.30, GND_paint), det);
              albedo *= 1.0 - (1.0 - hgt) * 0.22 * det * bare;   // crevice grime
              GND_tn = atex(t_asN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = det * 0.85 * mix(1.0, 0.22, GND_paint);
              if (m == 0) GND_rough = mix(GND_rough, GND_rough * (0.82 + atex(t_asR, uv, mk).x * 0.30), det * 0.8);
            } else if (m == 1 || m == 2 || m == 6) {             // concrete sidewalk/curb/path
              // the kerb face is vertical: an XZ lookup smears it into vertical
              // stripes and lifted it to near-white. Sample it in the
              // (along-kerb, height) frame instead — same tap count.
              vec2 uvF = vWPos.xz * 0.34;                        // ~3m slabs — 6m read as speckle
              vec2 uvW = vec2(dot(vWPos.xz, normalize(vec2(-GND_wn.z, GND_wn.x) + 1e-5)), vWPos.y) * 1.1;
              vec2 uv = mix(uvF, uvW, GND_wall);
              vec3 tc = atex(t_coC, uv, mk).rgb;
              float detC = det * smoothstep(0.55, 0.2, fw);      // fade earlier: minified concrete = static
              albedo *= gdet(tc, vec3(5.50, 6.02, 7.40), 0.45, detC);
              GND_tn = atex(t_coN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = detC * 0.6 * (1.0 - GND_wall);
              // gum specks: ~7% of 0.55m sidewalk cells carry a trodden-flat dark dot
              if (m == 1) {
                vec2 gc = vWPos.xz / 0.55;
                vec2 gid = floor(gc);
                if (hash12(gid * 1.7) < 0.07) {
                  vec2 gp = fract(gc) - 0.5 - (vec2(hash12(gid + 3.1), hash12(gid + 7.7)) - 0.5) * 0.5;
                  float gd = smoothstep(0.17, 0.1, length(gp)) * detC;
                  albedo = mix(albedo, albedo * 0.5, gd * 0.85);
                  GND_rough = mix(GND_rough, 0.4, gd * 0.5);
                }
              }
            } else if (m == 7 && GND_rock < 0.5) {               // paved backlot / vacant lot (not a rock cut)
              vec2 uv = vWPos.xz * 0.34;
              vec3 tc = atex(t_coC, uv, mk).rgb;
              float detC = det * smoothstep(0.55, 0.2, fw);
              albedo *= gdet(tc, vec3(5.50, 6.02, 7.40), 0.40, detC);
              GND_tn = atex(t_coN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = detC * 0.5;
              GND_rough = 0.88;
            } else if (m == 5 || m == 7) {                       // grass / terrain / schist
              // on a schist cut the XZ lookup stretches the grass texels into
              // vertical smears — swap the UV to (along-face, height) BEFORE
              // the tap so the rock keeps grain at zero extra cost.
              vec2 uvF = vWPos.xz * 0.22;
              vec2 uvR = vec2(dot(vWPos.xz, normalize(vec2(GND_wn.z, -GND_wn.x) + 1e-5)), vWPos.y) * 0.20;
              vec2 uv = mix(uvF, uvR, GND_rock);
              vec3 tc = atex(t_grC, uv, mk).rgb;
              float detG = det * smoothstep(0.6, 0.22, fw);
              albedo *= gdet(tc, vec3(3.30, 4.48, 10.3), mix(0.45, 0.20, GND_rock), detG);
              // the horizontal tangent frame is meaningless on a rock wall, and a
              // grass normal map on schist reads as a dotted screen door
              GND_tn = atex(t_grN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = detG * 0.45 * (1.0 - GND_rock);
            } else if (m == 10) {                                // plaza brick/pavers
              // (pvR/pvD dropped — ground was at the 16-sampler limit once the
              // city AO field joined; detail-multiply + normals carry the look)
              vec2 uv = vWPos.xz * 0.15;
              float pvt = atex(t_pvC, uv, mk).r;
              albedo *= mix(1.0, 0.72 + 0.55 * pvt, det * 0.75); // detail-multiply keeps the pattern colors
              GND_tn = atex(t_pvN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = det * 0.9;
              GND_rough = mix(GND_rough, 0.55 + pvt * 0.5, det * 0.6);
            }
          }
        }
        // waterfront revetment — LAST albedo writer before decals/rain/snow.
        // It must sit AFTER the PBR detail block: the grass texture mix above
        // washed every earlier placement back to pale tan at close range (det
        // rises as you approach, so the rock only survived at a distance).
        // Soft ground sloping into the water reads as riprap: dry rock on any
        // bank steeper than ~9 degrees, wet dark rock in the splash zone, and
        // a low-band override so anything within a meter of sea level is wet
        // rock/mud regardless of slope (the terrain-grid crossing row at the
        // seawall toe is gentle but it is still tidal ground, never lawn).
        // vNormal is VIEW-space in three's pipeline — the slope gate needs the
        // geometric world normal from position derivatives.
        if (m == 5 || m == 7 || m == 8 || m == 6) {
          vec3 nWG = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          float bankSl = 1.0 - abs(nWG.y);
          float bank = smoothstep(0.012, 0.05, bankSl); // 1-cos: 9deg=0.012 18deg=0.05
          // riprap belongs to the waterline: fade the rock out above ~6m so
          // graded park slopes (Riverside's 20m bank) stay green hillside
          // instead of reading as a full-height quarry cut
          bank *= mix(0.18, 1.0, 1.0 - smoothstep(6.0, 14.0, vWPos.y));
          float low = 1.0 - smoothstep(0.25, 0.95, vWPos.y);
          float n2r = vnoise(vWPos.xz * 2.3);
          vec3 dryRock = mix(vec3(0.112, 0.106, 0.100), vec3(0.170, 0.163, 0.152), n2r)
                       * (0.85 + 0.3 * vnoise(vWPos.xz * 0.9));
          albedo = mix(albedo, dryRock, bank * 0.85);
          vec3 wetRock = mix(vec3(0.050, 0.053, 0.056), vec3(0.086, 0.089, 0.092), n2r);
          float wetW = max((1.0 - smoothstep(0.35, 2.8, vWPos.y)) * bank, low * 0.9);
          albedo = mix(albedo, wetRock, wetW);
          albedo = mix(albedo, vec3(0.055, 0.076, 0.048),
            smoothstep(0.8, 0.15, abs(vWPos.y - 0.35)) * max(bank, low) * 0.5); // algae line
          // matte banks (never below the soft-ground baseline): the daytime
          // white sheet on the old shore aprons was grazing-angle Fresnel,
          // which no roughness value kills — the compile-side drape clamp is
          // what actually removes the grazing surface
          GND_rough = max(GND_rough, 0.9 * max(bank, wetW));
        }
        // pavement in the splash zone: the compiled toe apron (overlay fringe
        // dropped to ~0.45m at the seawall base) must read as tide-stained
        // concrete, not fresh sidewalk. Gated on height alone — carved road
        // trenches this deep are rare and damp-dark suits them anyway.
        if (m == 1 || m == 2 || m == 10) {
          float lowP = 1.0 - smoothstep(0.2, 0.9, vWPos.y);
          albedo = mix(albedo, mix(vec3(0.106, 0.113, 0.113), vec3(0.148, 0.152, 0.148), vnoise(vWPos.xz * 1.7)), lowP * 0.8);
          albedo = mix(albedo, vec3(0.058, 0.074, 0.050),
            smoothstep(0.75, 0.15, abs(vWPos.y - 0.32)) * lowP * 0.45); // algae stain
          GND_rough = max(GND_rough, 0.85 * lowP);
        }
        // composite road decals (asphalt only sets them). The utility-cut
        // backfill tone is applied in-branch now; GND_patch only carries the
        // surface response (a cold patch is coarser and flatter than the mix
        // around it, and it never took the parent surface's polish).
        GND_rough = mix(GND_rough, 0.93, GND_patch * 0.7);
        GND_tnW *= 1.0 - GND_patch * 0.35;
        // cast iron: dark, worn smooth by tyres, and warmer than the asphalt
        albedo = mix(albedo, vec3(0.088, 0.080, 0.070), GND_manhole);
        albedo = mix(albedo, albedo * 0.5, GND_oil);
        GND_rough = mix(GND_rough, 0.48, GND_manhole);
        GND_rough = mix(GND_rough, 0.62, GND_oil);
        GND_spec = max(GND_spec, max(GND_manhole, GND_oil) * 0.95);
        GND_tnW *= 1.0 - GND_manhole * 0.85;
        // ---- ground exposure trim.
        // A street plane takes the whole sky dome plus a 42 deg sun, so it is
        // the brightest-lit surface in the frame; with the day preset's
        // exposure 0.62 and the ACES lift, sunlit asphalt at a physical 0.10
        // albedo rendered at sRGB 155-170 where a photograph of 125th St reads
        // 100-130, and paint clipped to white before the bloom pass even ran.
        // Everything above is authored at physical albedo; this single factor
        // puts the ground back on photographic values, and stays near 1 at
        // night where the only light is a sodium lamp and 0.3 would read black.
        // Retune HERE (not per material) if the exposure or sun intensity move.
        // A vertical face (kerb, schist cut, revetment) sees roughly half the
        // sky dome, so it needs less of the trim or it goes to soot.
        albedo *= mix(0.30, 0.88, night) * (1.0 + 0.60 * (1.0 - abs(GND_wn.y)));
        // ---- STREET-SURFACE CALIBRATION (2026-09-03, docs/notes/streets-audit.md).
        // The trim above was fitted to "a photograph of 125th St reads sRGB
        // 100-130". The 80-panorama Street View set says otherwise: EVERY sunlit
        // road patch in refs/streetview measures 136-188 and every sunlit
        // concrete flag 189-237, and every one of them has R > G > B (by 16 on
        // asphalt, 37 on concrete). Against this exposure and a sky-dominated,
        // therefore BLUE, ambient, the 0.30 trim landed the roadway at 118 and
        // INVERTED the hue (render B > R by 6-13) — which is what reads as wet
        // slate instead of dry warm concrete, and is most of the "processed
        // incorrectly" complaint. This factor puts asphalt / flag / kerb back
        // on the measured values and leaves every other surface on the
        // 2026-09-02 calibration. Daytime only: at night the one light is a
        // sodium lamp and the trim has already lerped to 0.88.
        // Retune HERE, and re-measure with the boxes in the notes.
        // LB14 (docs/notes/lb14.md, critic r14 fixes 2/3/4): the ONE warm vec3 above was doing three
        // different jobs and could not be right for any of them at once — it is the only warmth in a
        // sunlit frame (the day key saturates to a neutral 0xfffcf7 by elev 42), so all of it also
        // lands on the SHADE, where the reference is sky-blue. Split into three live uniforms
        // (ENV.lb14StCal / lb14Walk / lb14Paint), hue-neutralised, with the warmth moved into the sun
        // (sky.js PRESETS.day.sunW). ?lb14=0 restores (1.94,1.70,1.47) on road+walk and 1.0 on paint.
        //   road/terrain: same luminance (1.734), R/B 1.32 -> 1.08
        //   walk:  0.79x luminance and neutral — it measured 27-52 luma OVER the road in shade
        //          against the Earth crop's +6..+7, and rendered olive-green (98,107,104) where the
        //          reference is blue-grey (67,87,105)
        //   paint: thermoplastic never took the street lift at all (m 3/4 fell through every branch),
        //          so intact white film sat at only 1.5x the road's effective albedo where a real
        //          crossing is 6-7x. Scaled by GND_paint so WORN film keeps the low end the critic
        //          measured right (the band was 119-178 against the photograph's 92-217).
        {
          vec3 stCal = mix(lb14StCal, vec3(1.0), night);
          // the kerb face is vertical, so the trim above has already handed it
          // +60 %; a full street lift on top of that pushed the warm stone to
          // khaki. It gets a gentler, more neutral one.
          if (m == 2) albedo *= mix(vec3(1.44, 1.39, 1.31), vec3(1.0), night);
          else if (m == 0) albedo *= stCal;
          else if (m == 1) albedo *= mix(lb14Walk, vec3(1.0), night);
          else if (m == 3 || m == 4) albedo *= mix(mix(vec3(1.0), lb14Paint, GND_paint), vec3(1.0), night);
          // the terrain filler between the compiled walk and the building line
          // has to hold the same value as the walk or every block face gets a
          // dark rim; the schist cut keeps its own calibration.
          else if (m == 7 && GND_rock < 0.02) albedo *= mix(lb14Walk, vec3(1.0), night);
        }
        // ---- night pass.
        // 1. Retroreflection. Thermoplastic carries glass beads: under a street
        //    lamp or a headlight the film throws light back and reads far
        //    brighter than the road, which is the whole reason NYC markings
        //    work at night. Only the INTACT film does it — beads are the first
        //    thing tyres grind off, so it scales with GND_paint, and the kerb
        //    face gets a smaller share of the same effect from its salt bloom.
        if (night > 0.01) {
          albedo = min(albedo * (1.0 + night * GND_paint * 0.70), vec3(0.95));
          // 2. A dry street at night must not read wet. The sodium lamps are
          //    small, bright sources: at day roughness the road throws a long
          //    specular streak that looks like rain even with SSR at its dry
          //    floor. Roughen and de-spec the road while ENV.wet is ~0, and
          //    hand it all back the moment it starts raining (the wet block
          //    above has already pushed GND_spec to 1 and roughness down).
          float dryN = night * (1.0 - clamp(wet * 3.0, 0.0, 1.0));
          // a vertical face (kerb, schist) never throws the long grazing
          // streak a road plane does, so it keeps its stone sheen
          float roadPlane = (1.0 - GND_paint) * (1.0 - GND_wall);   // (flat is a reserved GLSL keyword)
          GND_rough = mix(GND_rough, max(GND_rough, 0.97), dryN * roadPlane);
          GND_spec *= 1.0 - 0.45 * dryN * roadPlane;
        }
        if (snowA > 0.003) { // accumulation: patchy at first, blanket at 1 —
          // grass holds snow sooner than trafficked pavement
          float snn = vnoise(vWPos.xz * 0.31) * 0.5 + vnoise(vWPos.xz * 0.06) * 0.5;
          float grassBias = 1.0 - step(0.5, abs(float(m) - 5.0)) * 0.35;
          float sm = clamp(snowA * (0.55 + 0.9 * snn) * (0.65 + grassBias), 0.0, 1.0);
          albedo = mix(albedo, vec3(0.86, 0.885, 0.93), sm);
          GND_rough = mix(GND_rough, 0.62, sm);
        }
        // distance specular AA: the polished bits (thermoplastic, cast iron,
        // granite, wet tar) sparkle once a pixel covers many of them, so relax
        // every roughness back to matte with the world-XZ pixel footprint.
        GND_rough = mix(0.95, GND_rough, smoothstep(0.85, 0.14, gFw));
        diffuseColor.rgb = albedo;
      }`)
      .replace('#include <common>', `#include <common>
        uniform float wet; uniform float windT; uniform float snowA;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = GND_rough;`)
      // Specular trim. Three's dielectric F0 of 0.04 is right for a smooth
      // surface; on porous, sooty, very rough ground the microfacet model
      // over-predicts the grazing sky reflection and the road sheets over into
      // a wet-looking mirror as soon as the albedo is dark enough to show it.
      // Asphalt drops to half F0, concrete to 0.72; paint, cast iron, granite
      // and anything with a water film keep the full value.
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= GND_spec;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (GND_tnW > 0.003) { // texture normal map, ground tangent frame (T=+x, B=+z)
          vec3 tn2 = normalize(vec3(GND_tn.xy, max(GND_tn.z, 0.3)));
          vec3 wN = normalize(vec3(tn2.x, tn2.z * 1.6, tn2.y));
          vec3 vN = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
          normal = normalize(mix(normal, vN, GND_tnW * 0.85));
        }
        // rain rings on standing water — same clock (windT) as the falling rain
        if (wet > 0.003) {
          float wpn2 = vnoise(vWPos.xz * 0.13) * 0.6 + vnoise(vWPos.xz * 0.031) * 0.4;
          float pud2 = smoothstep(0.66, 0.8, wpn2) * wet
            * smoothstep(0.28, 0.1, length(fwidth(vWPos.xz))); // rings only near the eye — they alias to sparkle far out
          if (pud2 > 0.02) {
            vec2 ruv = vWPos.xz * 1.9;
            vec2 rg = floor(ruv), rf = fract(ruv);
            float rs = hash12(rg);
            float life = windT * 1.25 + rs * 7.0;
            float rt = fract(life);
            vec2 rc = vec2(hash12(rg + floor(life)), hash12(rg + floor(life) + 9.3)) * 0.6 + 0.2;
            float rd = length(rf - rc);
            float ring = sin((rd - rt * 0.55) * 30.0) * exp(-pow((rd - rt * 0.55) * 7.0, 2.0)) * sin(rt * 3.14159);
            vec3 rperp = normalize(vec3(dFdx(ring), 0.0, dFdy(ring)) * -2.2 * pud2 + vec3(0.0, 1.0, 0.0));
            normal = normalize(mix(normal, rperp, pud2 * 0.85));
          }
        }`);
  };
  // r8 geometric specular AA (?aa=0 to disable). The ground's shading normal
  // comes from the mip-averaged PBR normal maps (asphalt / concrete / grass /
  // paving) and the rain rings; at 50 m a road pixel already covers ~80 texels
  // of `t_asN` along the view, anisotropy is 8, and mip-averaging a normal map
  // shortens the mean normal without telling the BRDF — which is precisely the
  // low-amplitude sparkle glitch-r7.md 2.3 attributed to 61 % of hot pixels.
  // kappa is a touch looser than the facade's because the road is the surface
  // that takes the whole sky dome at grazing incidence.
  return applySpecAA(applyCityAO(mat), { sigma2: 0.25, kappa: 0.16 });
}

// ------------------------------------------------------------------ FAR LOD (unlit, baked shading, fog)
export function makeFarMaterial() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.playerXZ = FAR_UNIFORMS.playerXZ;
    sh.uniforms.nearR = FAR_UNIFORMS.nearR;
    sh.uniforms.nearMask = FAR_UNIFORMS.nearMask; sh.uniforms.nearMaskO = FAR_UNIFORMS.nearMaskO; sh.uniforms.nearMaskOn = FAR_UNIFORMS.nearMaskOn;   // NM24
    sh.uniforms.night = ENV.night;
    sh.uniforms.wet = ENV.wet;
    sh.uniforms.snowA = ENV.snow;
    sh.uniforms.sunDirF = ENV.sunDir;
    sh.uniforms.sunColF = ENV.sunColor;
    sh.uniforms.skyAmbF = ENV.skyAmbient;
    skyReflUniforms(sh);
    sh.uniforms.cityAO = ENV.cityAO;
    sh.uniforms.cityAORect = ENV.cityAORect;
    sh.uniforms.cityAOAmt = ENV.cityAOAmt;
    sh.uniforms.uScale = { value: 1 / 8 };
    sh.defines = sh.defines || {};
    if (!NO_TOWER_FX) sh.defines.TOWERFX = 1;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uScale; varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = position * uScale;
        transformed.xz *= 0.996; transformed.y -= 0.6;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec2 playerXZ; uniform float nearR; uniform float night;${NEARMASK_GLSL}
        uniform float wet; uniform float snowA;
        uniform vec3 sunDirF; uniform vec3 sunColF; uniform vec3 skyAmbF;
        uniform sampler2D cityAO; uniform vec4 cityAORect; uniform float cityAOAmt;
        varying vec3 vWPos;${SKYREFL_PARS}
        ${HASH_GLSL}
        ${SKYREFL_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        if (farHidden(vWPos.xz)) discard;   // NM24: a ready near tile draws this ground
        diffuseColor.rgb *= diffuseColor.rgb; // sRGB bytes → approx linear
        // LIT far macro (was flat unlit albedo = the "whole horizon looks
        // flat" root cause): flat-shaded facet normals from derivatives,
        // lambert sun + hemispheric sky — tracks time of day for free since
        // sunDir/sunColor/skyAmbient are the live ENV uniforms
        {
          vec3 N = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          vec3 V = normalize(cameraPosition - vWPos);
          if (dot(N, V) < 0.0) N = -N;
          float ndl = max(dot(N, sunDirF), 0.0);
          float caoV = 1.0;
          if (cityAORect.z > 0.0) {
            vec2 caoS = texture2D(cityAO, (vWPos.xz - cityAORect.xy) * cityAORect.zw).rg;
            caoV = mix(1.0, mix(caoS.r, 1.0, smoothstep(6.0, 46.0, vWPos.y - caoS.g * 127.5)), cityAOAmt);
          }
          vec3 light = skyAmbF * (0.8 + 0.3 * max(N.y, 0.0)) * caoV + sunColF * ndl * 1.05;
          diffuseColor.rgb *= light;
          #ifdef TOWERFX
          // ===== SKYSCRAPER PASS (docs/notes/skyscrapers.md) =================
          // The far city was ONE flat colour per baked face, so a 200 m tower at
          // 2 km read as a coloured card and the whole horizon as one wall.
          // Three cheap terms give back exactly what distance preserves: the
          // floor rhythm, per-lot value variety, and a specular answer to the
          // sky (which is what separates a glass tower from a brick one when
          // nothing else is resolvable).
          float vertF = 1.0 - abs(N.y);
          if (vertF > 0.12) {
            float fb = vWPos.y / 3.8;                       // floor lines
            float aaFb = max(fwidth(fb), 1e-4);
            float bv = smoothstep(1.1, 0.28, aaFb) * vertF;  // box-filtered, so it
            diffuseColor.rgb *= mix(1.0, 0.80 + 0.30 * pcov(fb, 0.24, 0.96, aaFb * 1.25), bv * 0.7);
            // per-lot spread on a ~26 m cell: the macro palette repeats, and
            // without this neighbouring towers merge into one flat mass
            diffuseColor.rgb *= 0.85 + 0.30 * hash12(floor(vWPos.xz / 26.0) + 3.7);
            // ---- the far skyline answers the sky too (facades-r6 §1). The r5
            // term was skyAmbF * frF * ... with frF = 0.04 at normal
            // incidence, i.e. ~1.5 % of an already-dim ambient colour: nothing
            // in skyMidtown or skyFidi glinted. Same analytic gradient as
            // the near facades, so the handover at nearR does not step.
            vec3 Rf = reflect(-V, N);
            float glassy = smoothstep(0.0, 0.10, diffuseColor.b - diffuseColor.r * 0.9);
            float f0F = mix(0.05, 0.20, glassy);
            float frF = fresnelR(max(dot(V, N), 0.0), f0F);
            float fpF = length(fwidth(vWPos)) * 0.02;
            diffuseColor.rgb *= mix(1.0, mix(0.55, 0.30, glassy), glassy * 0.9); // far glass is DARK, not pastel
            diffuseColor.rgb += skyLook(Rf, sunDirF, sunColF, uZenC, uHorC, uRefl, 1.6)
                              * frF * vertF * (0.55 + 1.15 * glassy);
            diffuseColor.rgb += sunColF * sunDisc(Rf, sunDirF, mix(0.16, 0.06, glassy), fpF)
                              * frF * (6.0 + 16.0 * glassy) * uRefl * vertF * (1.0 - night);
          }
          // ---- distance silhouette. Measured (scratchpad patch.ps1) against
          // refs/water-tower-rooftops-chelsea-01.jpg, where FiDi at 3-5 km sits
          // at L 81-106 under an L 163 sky (50-65 % of it) with R-B -58..-96 —
          // it takes the SKY's own blue and stays much darker. Our far city
          // measured L 147-178 under an L 166 sky (89-107 %) at R-B +54..+64:
          // the same value as the sky and the opposite hue, i.e. no silhouette
          // at all. Most of that gap is the screen-space HazePass (78 % of a
          // 5 km pixel, docs/notes/lighting.md 1b) and is the lighting owner's,
          // but the far material can stop ADDING to it — vertical faces past
          // 2 km give up ambient and drift toward the sky hue, so there is
          // still a value break left for the haze to wash.
          {
            float aer = smoothstep(1800.0, 7000.0, distance(vWPos, cameraPosition)) * vertF;
            diffuseColor.rgb *= mix(1.0, 0.66, aer);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.95, 1.12), aer * 0.6);
          }
          // ================= END SKYSCRAPER PASS ============================
          #endif
        }
        diffuseColor.rgb *= (1.0 - night * 0.55);
        // weather continuity to the horizon: the near tiles' PBR wet/snow look
        // stops at nearR, so the unlit macro world must darken/whiten in step
        diffuseColor.rgb *= 1.0 - 0.3 * wet * (0.6 + 0.4 * vnoise(vWPos.xz * 0.031));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.83, 0.88), snowA * (0.4 + 0.4 * vnoise(vWPos.xz * 0.06)));
        vec2 cell = floor(vec2(vWPos.x + vWPos.z * 0.7, vWPos.y) / 3.0);
        float sp = step(hash12(cell), vColor.a * 0.28) * night;
        diffuseColor.rgb += vec3(1.0, 0.82, 0.5) * sp * 1.1;
        diffuseColor.a = 1.0;
      }`);
  };
  return mat;
}

// ------------------------------------------------------------------ WATER (custom, fog-synced)
export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: ENV,
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying float vDist;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying float vDist;
      uniform float time; uniform float night;
      uniform vec3 fogColor; uniform float fogDensity;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 skyAmbient;
      ${FOG_SKY_GLSL}
      ${HASH_GLSL}
      // three-octave animated height field; taps widen with distance so the
      // derivative normals self-antialias instead of shimmering at range
      float wH(vec2 q) {
        return vnoise(q * 0.045 + vec2(time * 0.25, time * 0.17)) * 0.6
             + vnoise(q * 0.14 - vec2(time * 0.14, time * 0.2)) * 0.3
             + vnoise(q * 0.5 + vec2(time * 0.05, -time * 0.4)) * 0.1;
      }
      void main() {
        vec2 p = vWorld.xz;
        // large-scale current patches: tidal rivers read as broad calm/ruffled
        // lanes from the air, never as one uniform tone
        float cur = fbm(p * 0.006 + vec2(time * 0.012, -time * 0.008));
        float amp = 0.7 + 0.9 * smoothstep(0.35, 0.75, cur);
        float e = max(0.35, vDist * 0.0045);
        float hC = wH(p), hX = wH(p + vec2(e, 0.0)), hZ = wH(p + vec2(0.0, e));
        vec3 N = normalize(vec3((hC - hX) / e * 1.7 * amp, 1.0, (hC - hZ) / e * 1.7 * amp));
        vec3 V = normalize(cameraPosition - vWorld);
        // water body color varies with the current field (silt vs deep)
        vec3 deep = mix(vec3(0.04, 0.085, 0.1), vec3(0.085, 0.15, 0.165), hC);
        deep = mix(deep, vec3(0.075, 0.115, 0.105), smoothstep(0.55, 0.85, cur) * 0.6);
        deep = mix(deep, vec3(0.012, 0.028, 0.045), night);
        // sky reflection graded to the view: zenith color overhead, brighter
        // horizon color at grazing angles (sells reflection without a cubemap)
        vec3 horizonC = mix(fogColor * 1.18, sunColor * 0.35 + fogColor * 0.75, 0.35);
        // FS26: the reflected ray's own sky at the horizon (the sun side of a river glows, the far side stays cool)
        vec3 Rw = reflect(-V, N);
        horizonC = fogSkyP.x > 0.5 ? fogSkyColor(vec3(Rw.x, max(Rw.y, 0.0), Rw.z), horizonC) : horizonC;
        vec3 skyRef = mix(skyAmbient * 1.05, horizonC, pow(1.0 - max(V.y, 0.0), 2.0));
        skyRef *= (1.0 - night * 0.82);
        float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 3.2);
        vec3 col = mix(deep, skyRef, clamp(0.16 + fres * 0.7, 0.0, 0.95));
        // sun streak: lobe widens with distance (a razor lobe vanishes from the
        // air), sparkle modulated by the ripple field, amp specular-AA faded
        float glExp = mix(620.0, 70.0, smoothstep(120.0, 2600.0, vDist));
        float glAmp = mix(0.9, 0.1, smoothstep(120.0, 2600.0, vDist));
        float glint = pow(max(dot(reflect(-sunDir, N), V), 0.0), glExp);
        glint *= 0.45 + 0.7 * vnoise(p * 1.7 + vec2(time * 0.9, -time * 0.7));
        col += sunColor * glint * glAmp * (1.0 - night);
        // city light streaks at night ride the ripples
        col += vec3(0.9, 0.6, 0.3) * night * fres * (hC * 0.7 + 0.3) * 0.1;
        float f = 1.0 - exp(-fogDensity * fogDensity * vDist * vDist);
        col = mix(col, fogSkyColor(vWorld - cameraPosition, fogColor), clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
