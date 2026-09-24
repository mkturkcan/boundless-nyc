// Weather + presentation bus. One params object (GFX) is the single source of
// truth: the Tab editor (src/ui/editor.js) mutates it live, this module
// composes it onto the engine/uniforms EVERY FRAME (after sky.update, so these
// values win), and main.js boot-loads public/settings/graphics.json over the
// defaults. Rain/snow are camera-wrapped instanced quads (mod-wrapped volume —
// infinite field, one shared clock); ground puddles/ripples, facade damp, roof
// snow and tree sway all key off the same ENV uniforms so nothing drifts.
// Refs: Threejs-Awesome-Graphics-Agent-Skills precipitation-surfaces contract,
// BuildingGeneratorThreeJS rain.ts/wet.ts/snow.ts.
import * as THREE from 'three';
import { ENV } from './materials.js';
import { N11 } from './night11.js';   // N11 — night ambient (docs/notes/night-r11.md)

export const GFX = {
  // weather (a few scattered clouds by default — an empty gradient sky reads fake)
  rain: 0, snow: 0, cloud: 0.24, wind: 0.35, lightning: false,
  // lighting
  exposure: 0.74, sunScale: 1.0, hemiScale: 1.0, fogDensity: 0.00014,
  // sun & sky: OFFSETS composed with the time-of-day preset (sky.apply reads
  // these), so an exported json tweaks every mode instead of pinning the sun
  sunElev: 0, sunAzim: 0, sunWarmth: 0, turbidity: 5, envScale: 1.0, shadowSoft: 1.6, shadowStrength: 1.0, taa: 0.85,
  // radiance gain on the VISIBLE sky dome only (not the env bake) — see sky.js
  skyGain: 1.0,
  // post
  bloomMul: 1.0, vignette: 0.2, saturation: 1.0, contrast: 0.18, warmth: 0.04,
  tint: 0.0, ssr: 0.55, dof: false,
  // global illumination: screen-space bounce + auto SH light probe
  gi: 0.9, giRad: 6.0, probe: 0.55,
  // volumetric haze (analytic lit height fog — the AAA atmosphere layer)
  hazeDensity: 0.0009, hazeFalloff: 0.014, hazeG: 0.6, hazeSun: 1.6,
  godrays: 0.5,
  cityAO: 0.85, autoExposure: 0.65, autoExpoTarget: 0.20,
  // urban inter-reflection (engine.bounce). 1.0 = the level sky.js derives from
  // the sun; the missing warm half of a canyon's ambient. 0 restores the
  // sky-only ambient that read R-B 5 on shaded pavement against a photograph's 32.
  bounce: 1.0,
  // haze reaching SKY pixels (0 = none). The analytic sky already contains its
  // own scattering; running the height fog over it too was the "pale cyan-to-
  // cream sky with no blue anywhere" of critic rounds 2-3.
  hazeSky: 0.0, hazeGlowMax: 0.9, hazeBaseY: -25,
  // aerial perspective: how far the veil's colour is pushed toward the sky's own
  // Rayleigh blue (0 = the preset's fog grey), and the soft floor on distant
  // transmittance (0.42 = a 2-5 km tower keeps ~42 % of its own contrast)
  hazeBlue: 0.85, hazeTmin: 0.42,
  // cinematic camera
  motionBlur: 0.4, grain: 0.05, chromAb: 0.35,
  // definition
  definition: 0.25, sharpness: 0.4,
  // tone mapping: ACES | AgX | Neutral | Reinhard | Cineon (OutputPass applies
  // it, so switching is free — no material recompiles)
  toneMap: 'ACES',
  // LUT color grading (public/luts/*.cube, applied after the grade pass)
  lut: 'none', lutAmt: 0.7,
};
export const TONE_MAPS = {
  ACES: [THREE.ACESFilmicToneMapping, 1.0],
  AgX: [THREE.AgXToneMapping, 1.35],       // AgX mid-gray sits lower — trim up
  Neutral: [THREE.NeutralToneMapping, 1.0],
  Reinhard: [THREE.ReinhardToneMapping, 1.2],
  Cineon: [THREE.CineonToneMapping, 1.1],
};
// Debug / A-B handle. Every lever in this file is composed onto the engine each
// frame, so a tool can drive the whole rig live from the page (a single-session
// A/B rig: one tile stream, N variants) without a
// rebuild. The app never reads it back.
if (typeof window !== 'undefined') window.__GFX = GFX;
// CLEAN (owner 2026-09-17, the ad): "our postprocessing makes everything look washed out and weird ... too much
// postprocessing that results in weird sharpness/AA artifacts". ?clean=1 turns off every stylising pass — unsharp mask,
// clarity, chromatic aberration, grain, motion blur, TAA (and with it the sub-pixel jitter), vignette, warmth and the
// saturation lift — and leaves the physically motivated ones (tone mapping, bloom at a whisper, haze, SSR, GTAO). SMAA and
// the 1440p -> 1080p downscale of the recording carry the anti-aliasing. Re-applied after every applyGfx(), because
// settings/graphics.json (main.js) and the editor's presets are loaded AFTER this module and would put the stack back.
const CLEAN = typeof location !== 'undefined' && new URLSearchParams(location.search).get('clean') === '1';
// PV2 (2026-09-23): side-by-sides against NYC street photos showed the AgX base still washed out once the stylising
// contrast/saturation lift is off (pale sky, light-grey asphalt, milky people); Khronos PBR Neutral keeps albedo hue and
// saturation up to the highlight shoulder and matched the photos' deep sky / dark asphalt / skin (shots/pv2/tone_a).
const CLEAN_GFX = { sharpness: 0, definition: 0, chromAb: 0, grain: 0, motionBlur: 0, taa: 0, vignette: 0.04, saturation: 1.0, warmth: 0, tint: 0, contrast: 0.10, toneMap: 'Neutral' };
function applyClean() {
  if (!CLEAN) return;
  Object.assign(GFX, CLEAN_GFX);
  GFX.bloomMul = Math.min(GFX.bloomMul ?? 1, 0.6);
}
applyClean();
if (CLEAN) console.log('[gfx] clean preset: post stylisation off');

export function applyGfx(json) {
  for (const k of Object.keys(GFX)) if (json[k] !== undefined) GFX[k] = json[k];
  applyClean();   // CLEAN: the saved preset must not put the stylisation back
}

function makeParticles(scene, max, vtxExtra, opts) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const aSeed = new Float32Array(max * 3), aRand = new Float32Array(max);
  for (let i = 0; i < max; i++) {
    aSeed[i * 3] = Math.random(); aSeed[i * 3 + 1] = Math.random(); aSeed[i * 3 + 2] = Math.random();
    aRand[i] = Math.random();
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 3));
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 1));
  const uniforms = {
    uTime: ENV.windT, uCameraPos: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector3(2.2, 0, 1.1) },
    uVolume: { value: new THREE.Vector3(58, 44, 58) },
    uSpeed: { value: opts.speed }, uLength: { value: opts.len },
    uWidth: { value: opts.width }, uOpacity: { value: opts.opacity },
    uColor: { value: new THREE.Color(opts.color) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uWind; uniform vec3 uCameraPos;
      uniform vec3 uVolume; uniform float uSpeed; uniform float uLength; uniform float uWidth;
      attribute vec3 aSeed; attribute float aRand;
      varying vec2 vUv; varying float vRand;
      void main() {
        vUv = uv; vRand = aRand;
        vec3 vol = uVolume;
        vec3 origin = uCameraPos - vec3(vol.x * 0.5, vol.y * 0.82, vol.z * 0.5);
        float speed = uSpeed * (0.75 + 0.5 * aRand);
        vec3 disp = vec3(uWind.x, -speed, uWind.z) * uTime;
        vec3 pos = mod(aSeed * vol + disp - origin, vol) + origin;
        ${vtxExtra}
        vec3 vel = normalize(vec3(uWind.x, -speed, uWind.z));
        vec3 toCam = normalize(uCameraPos - pos);
        vec3 side = normalize(cross(vel, toCam));
        float len = uLength * (0.7 + 0.6 * aRand);
        vec3 world = pos + side * (position.x * uWidth) + vel * (position.y * len);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor;
      varying vec2 vUv; varying float vRand;
      void main() {
        float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        float along = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        gl_FragColor = vec4(uColor, across * along * uOpacity * (0.6 + 0.4 * vRand));
      }`,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  g.instanceCount = 0;
  scene.add(mesh);
  return { mesh, g, uniforms, max };
}

export function createWeather(scene, camera, engine) {
  // rain: fast thin streaks along velocity; snow: slow wobbling flakes.
  // Volumes must FILL THE VIEW, not just a bubble: wide XZ, and the count
  // scales with the footprint so density holds up
  const rain = makeParticles(scene, 46000, '', { speed: 21, len: 1.35, width: 0.016, opacity: 0.42, color: 0xaeb6c2 });
  rain.uniforms.uVolume.value.set(150, 70, 150);
  const snow = makeParticles(scene, 30000,
    'pos.xz += vec2(sin(uTime * 1.7 + aRand * 40.0), cos(uTime * 1.3 + aRand * 27.0)) * 0.35;',
    { speed: 1.9, len: 0.085, width: 0.085, opacity: 0.85, color: 0xf4f7fb });
  snow.uniforms.uVolume.value.set(130, 60, 130);

  // cloud deck: one big camera-following FBM sheet — cheap overcast that the
  // sun/hemisphere dimming below stays in step with
  const cloudU = {
    uTime: ENV.windT, uCover: { value: 0 }, uFlash: { value: 0 },
    uSun: ENV.sunDir,
  };
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 14000, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: cloudU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uCover; uniform float uFlash;
        varying vec2 vU;
        float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vU * 34.0 + vec2(uTime * 0.008, uTime * 0.003);
          float f = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { f += a * n2(p); p *= 2.03; a *= 0.5; }
          // distinct cloud blobs, not a murky ceiling: higher threshold makes
          // separated masses at partial cover, and the underside stays bright
          // (real overcast reads 0.5-0.9, never charcoal)
          float cov = smoothstep(1.08 - uCover * 0.95, 1.34 - uCover * 0.8, f);
          float shade = mix(0.98, 0.52, cov * (0.35 + uCover * 0.65));
          vec3 col = vec3(1.02, 1.0, 0.975) * shade * (1.0 + uFlash * 3.0);
          float edge = smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x)
                     * smoothstep(0.0, 0.12, vU.y) * smoothstep(1.0, 0.88, vU.y);
          // fade the deck out well before the horizon line (a flat plane
          // slamming into the horizon reads as a tent seam)
          float rad = smoothstep(0.485, 0.3, length(vU - 0.5));
          gl_FragColor = vec4(col, cov * 0.82 * edge * rad);
        }`,
    }));
  cloud.rotation.x = -Math.PI / 2;
  cloud.position.y = 780;
  cloud.visible = false;
  scene.add(cloud);

  const baseSun = engine.sun.intensity, baseHemi = engine.hemi.intensity;
  const baseFog = ENV.fogDensity.value;
  let flash = 0, nextStrike = 5;

  return {
    gfx: GFX,
    set(t) { GFX.rain = THREE.MathUtils.clamp(t, 0, 1); },
    get wet() { return ENV.wet.value; },
    update(dt) {
      ENV.windT.value += dt;
      const w = ENV.wet.value = THREE.MathUtils.damp(ENV.wet.value, GFX.rain, 0.6, dt);
      const s = ENV.snow.value = THREE.MathUtils.damp(ENV.snow.value, GFX.snow, 0.35, dt);
      const cl = Math.max(GFX.cloud, w * 0.8, s * 0.7); // precipitation implies cover
      ENV.windAmp.value = GFX.wind + w * 1.3 + s * 0.3;

      rain.mesh.visible = w > 0.02;
      rain.g.instanceCount = Math.floor(rain.max * w);
      rain.uniforms.uCameraPos.value.copy(camera.position);
      rain.uniforms.uWind.value.set(2.2 + ENV.windAmp.value * 3.2, 0, 1.1 + ENV.windAmp.value * 1.4);
      snow.mesh.visible = s > 0.02;
      snow.g.instanceCount = Math.floor(snow.max * s);
      snow.uniforms.uCameraPos.value.copy(camera.position);
      snow.uniforms.uWind.value.set(0.6 + ENV.windAmp.value, 0, 0.3 + ENV.windAmp.value * 0.5);

      cloud.visible = cl > 0.02;
      cloud.position.x = camera.position.x; cloud.position.z = camera.position.z;
      // A dusk rainstorm is a CONTINUOUS LOW OVERCAST. At rain 0.55 the deck was
      // getting cover 0.44, whose threshold (smoothstep(0.66, 0.99, f)) leaves
      // "about a dozen small, soft, pale-grey irregular blobs scattered over a
      // black sky ... they read as lens dirt" (critic r5 11 #3, mine). Rain and
      // snow now push the DECK toward full cover without touching `cl`, which
      // also drives the sun dimming, the hemisphere and the haze.
      cloudU.uCover.value = Math.min(1, cl + w * 0.45 + s * 0.35);

      // lightning: random strikes while storming — flash decays fast, kicks
      // the cloud deck, the ambient light and the bloom in the same frame
      if (GFX.lightning && w > 0.35) {
        nextStrike -= dt;
        if (nextStrike <= 0) { flash = 1; nextStrike = 2.5 + Math.random() * 9; }
      }
      flash = Math.max(0, flash - dt * 5.5);
      cloudU.uFlash.value = flash;

      // ---- compose lighting + post over the sky preset's bases (this runs
      // AFTER sky.update so GFX always wins; mode changes re-seed the bases)
      const dim = 1 - 0.62 * w - 0.55 * cl * (1 - w) - 0.25 * s;
      const key = (engine.sunBase ?? baseSun) * GFX.sunScale * Math.max(0.12, dim);
      // The near map carries the key. This was 0.74/0.26, which meant a street
      // pixel the near cascade put in full shadow still received 26 % of the
      // sun from sun2 — measured 110.5 vs 173.4 sRGB on the shadowed bus lane
      // at harlem125, a ratio of 0.64 where a real midday shadow is nearer 0.3.
      // The far cascade now resolves (engine.js far2Extent), so it keeps a
      // token share: 12 % is the aerial-perspective softening the far distance
      // wants and no longer a shadow-strength leak at eye level.
      const mix = engine.shadowMix ?? 0.88;
      engine.sun.intensity = key * mix;
      if (engine.sun2) { engine.sun2.intensity = key * (1 - mix); engine.sun2.color.copy(engine.sun.color); }
      // probe replaces part of the flat hemi ambient once its SH is live —
      // scale hemi down in step so ambient isn't double-counted
      const pOn = (engine.probeOn ?? 0) * Math.min(1, GFX.probe);
      // LB13 (docs/notes/light-r13.md): `probeK` is the preset's own share of the probe — 1 everywhere
      // but `day`, where the capture was delivering ~1.56 of irradiance on top of the ambient it had
      // just re-photographed. probeGoal is left at GFX.probe on purpose: the N11 night floor is
      // pre-divided by it, and probeK is 1 after dark, so the night ambient is untouched.
      // `pOn` above is deliberately NOT scaled by probeK: the hemi/bounce give-back stays at the full
      // 0.4/0.35, i.e. by day the rig now takes slightly MORE ambient out than the probe puts back.
      // That conservative direction is the measured one (sky.js raises `hemi` 0.48 -> 0.80 over it);
      // do not "fix" it without re-running the wbEarthBedford A/B in docs/notes/light-r13.md.
      if (engine.probe) { engine.probeGoal = GFX.probe; engine.probe.intensity = GFX.probe * (engine.probeOn ?? 0) * (engine.probeK ?? 1); }
      engine.hemi.intensity = (engine.hemiBase ?? baseHemi) * GFX.hemiScale * (1 + 0.35 * w + 0.3 * cl) * (1 - 0.4 * pOn) + flash * 6.0;
      // urban bounce dies with the sun that feeds it: rain/overcast kill the
      // hard sun, so the warm inter-reflection goes with it and the ambient
      // returns to the (correctly) cool overcast sky
      // N11 (docs/notes/night-r11.md 1.2): after dark `bounce` is no longer SUN
      // that has hit something — sky.js has reloaded it with the STREET LIGHTING,
      // which does not dim when a cloud arrives (if anything an overcast night is
      // brighter, because the deck reflects the whole city's light back down). So
      // the `dim` term fades out with ENV.night instead of applying to it.
      // gated like the shader terms: golden carries night 0.05 and must not move.
      const nB = N11 ? THREE.MathUtils.smoothstep(ENV.night.value, 0.15, 0.60) : 0;
      const bncDim = Math.max(0.08, dim) * (1 - nB) + (1 + 0.22 * cl) * nB;
      if (engine.bounce) engine.bounce.intensity = (engine.bounceBase ?? 0) * GFX.bounce * bncDim * (1 - 0.35 * pOn);
      // CLEAN capture: PBR Neutral by DAY only (it matched the NYC street photos: deep sky, dark asphalt, true hue); golden,
      // dusk and night keep AgX, whose log curve lifts the shade those presets were exposed for — under Neutral the
      // golden College Walk plate fell to a third of its luma (film 7 probes, 2026-09-23). ENV.night: day 0, golden 0.05.
      const tmName = CLEAN && GFX.toneMap === 'Neutral' && ENV.night.value > 0.02 ? 'AgX' : GFX.toneMap;
      const tm = TONE_MAPS[tmName] ?? TONE_MAPS.ACES;
      if (engine.renderer.toneMapping !== tm[0]) engine.renderer.toneMapping = tm[0];
      engine.expoTarget = (GFX.autoExpoTarget ?? 0.20) * (engine.expoTargetK ?? 1);   // LB13: day-only
      const autoE = 1 + ((engine.autoExpo ?? 1) - 1) * GFX.autoExposure;
      engine.renderer.toneMappingExposure = (engine.expoBase ?? 0.74) * (GFX.exposure / 0.74) * tm[1] * autoE;
      engine.bloom.strength = (0.05 + ENV.night.value * 0.25) * GFX.bloomMul + flash * 0.9;
      ENV.fogDensity.value = baseFog * (GFX.fogDensity / 0.00011) * (1 + w * 2.2 + s * 3.0 + cl * 1.2);
      engine.grade.uniforms.uVig.value = GFX.vignette;
      // LB14: a day-only FLOOR, like conFloor. AgX's outset matrix desaturates by construction — it is
      // why our L>160 band reads a dead-neutral 177,177,177 where the Earth crops read 196,192,183 —
      // and `clean=1` removes graphics.json's 1.3 compensation. Floor, so the un-cleaned day preset and
      // every non-day preset are untouched.
      engine.grade.uniforms.uSat.value = Math.max(GFX.saturation, engine.satFloor ?? 0) * (1 - 0.18 * cl - 0.12 * s);
      // LB14 (docs/notes/lb14.md): a DAY-ONLY floor under the grade's contrast. The live rig tone-maps
      // with AgX (graphics.json overrides the ACES default here), whose base look is deliberately flat;
      // `clean=1` drops contrast 0.5 -> 0.10 along with the stylising passes, and AgX's own flatness is
      // what the r14 critic measured as "nothing in any twin frame exceeds L 200". A floor, not a
      // multiplier, so the UNCLEANED day preset keeps graphics.json's 0.5 exactly and every non-day
      // preset (conFloor undefined -> 0) is bit-identical.
      engine.grade.uniforms.uCon.value = Math.max(GFX.contrast, engine.conFloor ?? 0);
      // LB13: day-only warmK. LB14 adds a day-only ADDITIVE on the same term, and it is NEGATIVE:
      // the grade's split-tone already targets exactly the band this round has to fix (shW =
      // 1 - smoothstep(0.10, 0.72, luma), i.e. shadows and lower mids, highlights untouched), and the
      // measurement says the r13 rig's warm push is pointed the wrong way for a DAY frame — real NYC
      // shade is sky-filled and therefore blue (Earth crops: L30-70 band B-R +17..+29; ours +1).
      // Sweep 1 proved the physical route alone cannot get there (see docs/notes/lb14.md 19:25): hemi
      // 0.32 -> 0.63, bounce 0.45 -> 0.12 and a bluer hemi colour moved the band by ZERO, because by
      // day the ambient is carried by the auto light probe + SSGI + the env bake. `coolSh` is the
      // measured remainder after probeK/giK have taken out as much of the neutral fill as the frame
      // can afford. 0 on golden/dusk/night and under ?lb14=0.
      engine.grade.uniforms.uWarm.value = GFX.warmth * (engine.warmK ?? 1) + (engine.coolSh ?? 0);
      engine.grade.uniforms.uTintG.value = GFX.tint;
      engine.grade.uniforms.uSharp.value = GFX.sharpness;
      engine.grade.uniforms.uDef.value = GFX.definition ?? 0.25;
      if (engine.taa) {
        engine.taa.amount = GFX.taa ?? 0.85;
        // SMAA stays on: it covers motion frames where TAA history is shallow
        if (engine.smaa) engine.smaa.enabled = true;
      }
      engine.grade.uniforms.uGrain.value = GFX.grain;
      engine.grade.uniforms.uCA.value = GFX.chromAb;
      engine.grade.uniforms.uTimeG.value = ENV.time.value;
      if (engine.moblur) engine.moblur.uniforms.uAmt.value = GFX.motionBlur;
      // SSR: always a whisper on streets, full mirror as they wet down
      // dry asphalt is matte: the old 12 % floor put a wet sheen on every dry street
      // SSR / WETNESS (docs/notes/lighting-r6.md 3).
      // `w` is a single global scalar, so wetness always followed the camera —
      // the razor-straight wet/dry line at y = 560 and the bone-dry Fifth
      // Avenue at the same rain=0.55 were both the screen-space MARCH, not the
      // wetness. The pass now has a sky fallback, so the strength no longer has
      // to be nursed. A NIGHT street is polished by oil and traffic and mirrors
      // the lit windows and the signals even when it has not rained
      // (critic r5 10 #3, "the biggest night-specific gap"), so wetness gets a
      // night floor.
      if (engine.ssr) {
        const nt = ENV.night.value;
        const wetEff = Math.max(w, nt * 0.40);
        const U = engine.ssr.uniforms;
        U.uStrength.value = GFX.ssr * wetEff;
        // what a wet surface reflects where the march escapes the frame: the
        // sky by day, near-black at night (so the night road shows the marched
        // window/signal hits against a dark ground instead of a grey veil)
        U.uSkyCol.value.copy(ENV.fogColor.value);
        U.uSkyAmt2.value = (0.62 - 0.55 * nt) * (0.45 + 0.55 * w);
        // a wet road is 25-40 % darker than a dry one; at night the polish is
        // real but the film is not, so the darkening is small
        U.uWetDark.value = 0.34 * w + 0.10 * nt * (1 - w);
      }
      ENV.cityAOAmt.value = GFX.cityAO;
      if (engine._lutName !== GFX.lut) { engine._lutName = GFX.lut; engine.setLUT(GFX.lut); }
      if (engine.lut) engine.lut.intensity = GFX.lutAmt;
      if (engine.ssgi) {
        // LB14: day-only trim on the screen-space bounce. SSGI is inter-reflection off whatever is on
        // screen, i.e. warm brick, and sweep 1 showed it (with the light probe) is what actually
        // carries the daytime ambient — hemi/bounce could not move the shadow hue at all.
        engine.ssgi.compUniforms.uStrength.value = GFX.gi * (engine.giK ?? 1);
        engine.ssgi.uniforms.uRad.value = GFX.giRad;
      }
      if (engine.envBase != null) engine.scene.environmentIntensity = engine.envBase * GFX.envScale;
      engine.sun.shadow.radius = GFX.shadowSoft;
      engine.sun.shadow.intensity = GFX.shadowStrength ?? 1;
      engine.sun2.shadow.intensity = GFX.shadowStrength ?? 1;
      if (engine.haze) {
        const H = engine.haze.uniforms;
        // weather thickens the haze; sun boost dies with cloud cover
        // LB14 (docs/notes/lb14.md): `hazeDK` / `hazeSunK` are DAY-ONLY trims (sky.js PRESETS.day),
        // 1 everywhere else. The r14 critic's "every street plate fades to near-white haze at the
        // vanishing point" is NOT density — at the live hazeDensity (0.00016 from graphics.json, not
        // the 0.0009 in weather.js's literal) the transmittance over 400 m is 0.95, and uTmin floors
        // it at 0.42 besides. It is the FORWARD-SCATTER GLARE: LB13's day azimuth 128 happens to sit
        // within a degree of the bearing of the wbBedfordN7 / Bedford Ave street presets (129), so
        // those cameras look straight down-sun, the Henyey-Greenstein peak saturates its 0.9 ceiling
        // and the veil arrives at roughly twice the fog colour's own radiance right at the vanishing
        // point. Trimming the sun boost kills the blowout without touching the sky's colour, the
        // aerial perspective on the skyline, or any non-day preset.
        H.uDensity.value = GFX.hazeDensity * (engine.hazeDK ?? 1) * (1 + w * 2.5 + s * 3.0 + cl * 1.6);
        H.uFalloff.value = GFX.hazeFalloff;
        H.uG.value = GFX.hazeG;
        H.uSunBoost.value = GFX.hazeSun * (engine.hazeSunK ?? 1) * (1 - 0.85 * cl) * Math.max(0.15, dim);
        H.uSunDir.value.copy(ENV.sunDir.value);
        H.uSunCol.value.copy(ENV.sunColor.value);
        H.uFogCol.value.copy(ENV.fogColor.value);
        // fog "sea level": the city now compiles on a flat base plane (y ~3.5 everywhere),
        // so at 0 the whole city sat in the densest layer and every frame read veiled
        // (critic rounds 2-3). -25 restores the density a 25 m plateau used to get.
        H.uBaseY.value = GFX.hazeBaseY ?? -25;
        H.uSkyAmt.value = GFX.hazeSky ?? 0;
        H.uGlowMax.value = GFX.hazeGlowMax ?? 0.9;
        // aerial perspective is blue, and it must keep a stated fraction of a
        // distant tower's own value — but only on a clear day: rain and snow
        // genuinely do grey the distance out and must not be floored.
        const clr = Math.max(0, 1 - w * 1.6 - s * 1.6 - cl * 0.8);
        H.uBlue.value = (GFX.hazeBlue ?? 0.85) * clr;
        H.uTmin.value = (GFX.hazeTmin ?? 0.42) * clr;
      }
      if (engine.godrays) {
        const sunUp = Math.max(0, Math.min(1, (ENV.sunDir.value.y + 0.04) * 8));
        engine.godrays.setSun(ENV.sunDir.value, GFX.godrays * sunUp * (1 - 0.8 * cl) * Math.max(0.1, dim), ENV.sunColor.value);
      }
      if (engine.bokeh) engine.bokeh.enabled = !!GFX.dof;
    },
  };
}
