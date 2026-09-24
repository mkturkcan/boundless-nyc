import * as THREE from 'three';
import { Sky as SkyMesh } from 'three/addons/objects/Sky.js';
import { ENV, applyLB14Ground } from './materials.js';   // LB14 — day-only ground/roof calibration
import { GFX } from './weather.js';
// N11 — night ambient (docs/notes/night-r11.md). `?n11=0` restores the round-10 rig.
import {
  N11, GLOW_LOW, GLOW_HIGH, AMB_HEMI_SKY, AMB_HEMI_GND, AMB_STREET_UP, AMB_STREET_DN,
} from './night11.js';

// Time-of-day presets.
//
// `sun` / `env` / `bnc` are the RATIO that makes or breaks a daylight frame, and
// the day row was measured, not chosen (docs/notes/lighting.md 2). At env 0.52
// the environment map was doing ~75 % of the lighting: with the sun switched off
// the roadway only fell 18 sRGB, and a SHADED concrete flag rendered at L 180
// where the photograph of the same block reads L 137 — brighter than the
// photograph's SUNLIT flag. Cutting the env to 0.14, tripling the key and
// putting the missing inter-reflection into `engine.bounce` lands the shaded
// flag on 136 and takes the frame's 1st-percentile luma from 83 to 40 (the
// photograph's is 28). Retune the three together — they trade against each
// other — and re-measure with the patch table in the notes.
//   sun: multiplies the 3.4 * sqrt(sin elev) key
//   env: scene.environmentIntensity (the sky-only IBL: cool, and the ambient's bulk)
//   bnc: engine.bounce, the warm inter-reflected half of a canyon's ambient
const PRESETS = {
  // LB13 — THE SHADOW BUDGET (docs/notes/light-r13.md). `?lb13=0` restores the row below verbatim
  // (DAY_R12). Four changes, all day-only, so golden/dusk/night are bit-identical:
  //   azim 215 -> 128. 215 is 6 deg off the AVENUE bearing (209) and 186 deg from the heading every
  //     Google-Earth swipe preset uses (29) — i.e. the camera looked straight down-sun, every visible
  //     wall was the maximally lit set (cos 6 deg) and every cast shadow hid behind its own caster.
  //     Measured on the lens-matched pairs: 6-9 % of frame below L 80 against the photograph's 22-35 %,
  //     and a uniform darkening to the photograph's mean only reaches 12.6 % because the frame needs
  //     shadow STRUCTURE, not gain. 128 cross-lights the grid (walls facing 119 lit, 209 at 0.16 fill,
  //     29/299 dead) and is a real solar position at this latitude: dec ~0, i.e. ~10:15 on 20 Sept,
  //     which is what Google's NYC captures are (m_lenox_earth: E-facing walls lit L 112, SSW-facing
  //     walls L 69 and sky-blue, street-tree shadows running WSW).
  //   bnc 3.4 -> 1.5 and a new `hemi` 0.48 -> 0.80. The urban bounce was 5.2x the sky hemi (1.01 vs
  //     0.19 irradiance) and it is a HemisphereLight with no falloff, so a roof at 150 m took the full
  //     canyon bounce; with applyCityAO's RF13 up-facing exemption nothing clawed it back. That one
  //     term is most of why four frames out of four read WARM (R>=G>=B) where the photograph reads cool.
  //   probeK 0.42. The auto probe delivers ~1.56 of irradiance (SH L0 2.70,4.07,5.78 at GFX.probe 0.45)
  //     — more than hemi+bounce together — on top of an ambient it has just re-photographed, while
  //     weather.js hands back only 0.4*pOn of the hemi. Day fill was 3.07 against a 7.27 key on a
  //     horizontal surface: a 2.4:1 sun/fill ratio where a clear midday is 6-10:1.
  //   expoK 0.72. The meter sat PINNED at its 0.70 clamp floor (meterAvg 0.310 vs target 0.20), so
  //     lowering the target did nothing under the old rig — but taking the fill out drops meterAvg to
  //     0.174 (measured, wbEarthBedford A/B) and the meter would then unpin and hand ~24 % of the
  //     darkening straight back. 0.72 puts the loop's equilibrium (want = 0.144/0.174 = 0.83) exactly
  //     where the measured plate sits, so the frame no longer drifts while the camera holds.
  //   warmK 0.35 trims the grade's shadow warm-push (+12.8 sRGB R / -7.7 B on every shaded pixel).
  day:    { elev: 42, azim: 128, expo: 0.62, fog: 0xcfd8e2, fogD: 0.000095, night: 0, env: 0.14, sun: 2.5, bnc: 1.5, skyGain: 0.55,
            hemi: 0.80, probeK: 0.42, expoK: 0.72, warmK: 0.35 },
  golden: { elev: 7,  azim: 252, expo: 0.76, fog: 0xe2b98e, fogD: 0.00013, night: 0.05, env: 0.20, sun: 1.9, bnc: 3.0, skyGain: 0.7 },
  // N11: `nAmb` = street-lighting ambient level, `nGlow` = sky-glow level, `nFog` =
  // the horizon colour the aerial perspective fades the distance INTO after dark
  // (the old 0x39394e / 0x07090f faded it into black, which is why a night skyline
  // had no depth and the night swipe read as a failure even when it was lit).
  // `env` at night is no longer ~0: the env bake's dome now carries the glow, so
  // the IBL is the DIRECTIONAL half of the sky-glow ambient. All four are read ONLY
  // inside the `nAmb > 0` block in apply(), i.e. never under ?n11=0, and never by
  // day or golden (both are gated on p.night > 0.15).
  // `nSkyG` MULTIPLIES `skyGain` on BOTH domes after dark. The analytic Preetham
  // sky with its sun 14 deg under the horizon is not black — measured, it was
  // contributing as much again as the designed glow at the zenith, in blue, and
  // through the env bake it was the reason night asphalt rendered B > R. Crushing
  // it leaves the designed glow as the night sky, which is the only way the
  // horizon/zenith gradient and the hue are under control. Dusk keeps its real
  // twilight sky (nSkyG 1) and takes the glow on top.
  dusk:   { elev: -3, azim: 262, expo: 0.74, fog: 0x39394e, fogD: 0.00014, night: 0.55, env: 0.16, sun: 1.0, bnc: 1.0, skyGain: 0.9,
            nAmb: 0.34, nGlow: 0.45, nFog: 0x3c3a44, nSkyG: 1.0 },
  night:  { elev: -14, azim: 280, expo: 0.95, fog: 0x07090f, fogD: 0.00012, night: 1, env: 0.08, sun: 1.0, bnc: 0, skyGain: 1.0,
            nAmb: 1.0, nGlow: 1.0, nFog: 0x241d17, nEnv: 1.0, nSkyG: 0.12 },
};
// LB13 — the round-12 `day` row, verbatim. `?lb13=0` puts it back, and a measurement tool can A/B
// both rigs in ONE page (no reload, no second tile stream) with
//   Object.assign(sky.presets.day, sky.DAY_R12); sky.apply('day')
// ...and back with Object.assign(sky.presets.day, sky.DAY_LB13); sky.apply('day').
export const DAY_R12 = { elev: 42, azim: 215, expo: 0.62, env: 0.14, sun: 2.5, bnc: 3.4,
                         hemi: 0.48, probeK: 1, expoK: 1, warmK: 1 };
export const DAY_LB13 = { ...PRESETS.day };
const LB13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('lb13') === '0');
if (!LB13) Object.assign(PRESETS.day, DAY_R12);
// ---- LB14 — THE TOP END AND THE COLOUR OF SHADE (docs/notes/lb14.md, critic r14 fixes 1 + 2).
// `?lb14=0` restores DAY_LB13 verbatim. Every key here is read ONLY off `day`, so golden/dusk/night
// are bit-identical by construction. Why each one:
//   sun 2.5 -> 4.0 with hemi 0.80 -> 1.55 / bnc 1.5 -> 0.42: the r14 plates put 0.0-0.1 % of frame
//     above L 200 against the Earth crops' 6.3-12.1 %, with p95 175-185 against 207-219. The live
//     rig tone-maps with **AgX** (public/settings/graphics.json overrides weather.js's ACES default
//     at main.js:426, BEFORE `?gfx=`), whose base look is a flat 16.5-stop sigmoid worth ~25 sRGB per
//     stop at the top; under the old grade (contrast 0.5, definition 0.32, sharpness 0.45) the post
//     chain put the punch back, and `clean=1` — correctly — takes all three away. So the top end has
//     to come from the LIGHT: a bigger key on a smaller fill, which is also the only thing that
//     widens p5-p95 (117-126 against Earth's 152-175) without moving the mean.
//   the fill is also RECOLOURED, not just cut: the r13 rig's hemi (cool, 0.32 irradiance) and urban
//     bounce (warm, 0.45) summed to (0.554,0.504,0.490) — dead neutral, R over B — which is why the
//     L30-70 band reads B-R -10..+5 against the photograph's +17..+29 and the shaded Amsterdam walk
//     renders olive. Trading the warm bounce for the blue hemi takes the fill to B/R ~1.8.
//   sunW 0.26 puts the warmth back where it physically belongs. The day key saturates to a neutral
//     0xfffcf7 by elev 42 (trans*1.3 = 1.06), so ALL the warmth in sunlit concrete was coming from
//     the ground shader's albedo calibration, which necessarily warmed the shade too. A warm sun on
//     a neutral albedo with a blue sky fill is the only structure that reads R>B in sun AND B>R in
//     shade at once (materials.js ENV.lb14StCal is the other half of this change).
//   expoK 0.72 -> 0.58 deliberately PINS the auto-exposure meter at its 0.70 clamp floor, so the
//     bigger key sticks instead of being handed a third of the way back every frame (LB13 tuned
//     0.72 to sit at the loop's unpinned equilibrium, which makes the rig a negative feedback on
//     exactly the change this round needs).
//   conFloor 0.26 is a day-only FLOOR on the grade's contrast, so `clean=1` (contrast 0.10) gets a
//     real S-curve while the un-cleaned day preset keeps graphics.json's 0.5 untouched.
//   hemiC deepens the day sky-fill colour (0x9db9de is B/R 2.17; 0x8fb6e4 is 2.82) — day only, so
//     golden keeps 0x9db9de.
// SWEEP 1 (docs/notes/lb14.md 19:25, wbEarthBedford, 12 variants in one page) settled three things:
//   * L>200 tracks the KEY, not the grade: 0.6 / 2.5 / 5.3 % of frame at sun 3.2 / 4.0 / 4.8, against
//     0.0 % on the shipped v19 plate and 10.1 % on the Earth crop. conFloor 0.10 -> 0.26 is worth
//     +0.1 pp of that, i.e. a third of one sun step; it is a real but small part of the fix.
//   * expoK 0.58 pins the meter at its 0.70 clamp floor (meterAvg 0.197-0.212 against a 0.116 target),
//     so the key increase sticks and the rig stops drifting while a camera holds.
//   * the fill RECOLOURING did nothing: hemi 0.32 -> 0.63, bnc 0.45 -> 0.12 and a bluer hemi colour
//     left the L30-70 band at B-R +1, identical to r13. By day the ambient is carried by the auto
//     light PROBE (a cube capture of the scene, so it re-photographs a neutral city) and SSGI (bounce
//     off warm brick) — hence probeK/giK below, and `coolSh` for the measured remainder.
// SWEEP 2 then added the one that decided the shadow hue: on an Earth pose, setting probeK AND giK to
// ZERO moves the L30-70 band from B-R +6 to +5. Not the hemi, not the bounce, not the probe, not SSGI.
// The chroma is being eaten by **AgX's outset matrix** — the same rig renders a key whose LINEAR R/B
// is 1.27 as a bright band at B-R -5, i.e. about a third of the chroma survives the tone map. So
// probeK/giK are back at values that do not cost eye-level brightness for nothing, `satFloor` gives
// some of the chroma back globally, and the remainder is carried by `coolSh` — the grade's OWN shadow
// split (shW = 1 - smoothstep(0.10, 0.72, luma)), run negative because real NYC shade is sky-filled.
// SWEEP 3 (eye level, amst120N) fixed the two faults the lead caught in FD14's 18:44 plates:
//   * `gao` (the city-AO gate) -> 0: it halves a canyon ground's indirect diffuse (-1.1 stops, the
//     shaded carriageway fell from L 78 to L 51) and CANNOT do the job it was added for, because the
//     bake is 14.3 x 19.8 m per texel and darkens walk and roadway equally.
//   * `bnc` is the over-blueing. The urban bounce is the only warm term in a canyon's fill and at eye
//     level it is a large share of it (at 150 m it is nothing). Cutting it to 0.28 took the shaded
//     carriageway's linear B/R to 7.22 against the reference's 2.77.
export const DAY_LB14 = {
  // LB14b (lead, 2026-09-22, verify_r14/street): with bnc 0.8 / coolSh -0.028 / hemiC 0x8fb6e4 the shaded Amsterdam
  // carriageway read 54,84,115 (B-R +61) against the pano's 58,79,96 (+38) and v19's +32, the shaded walk 75,105,127, and
  // every shaded leaf went grey-teal (51,66,71 vs the pano's 118,142,116). The sunlit 125th plate was right (R>B, paint
  // bright). So the shade overshot: bounce back up, the cool grade term halved, the hemi colour half-way back.
  // LB14c (lead, 2026-09-22, shots/lb14/sweep4.txt — 12 rows in one page at amst120N, reference shaded road 58,79,96):
  //   LB14b row: road 63,90,118 (B-R +55) walk 71,97,116 (+45)  |  satFloor 0: +49  |  coolSh 0: +50  |  hemiC r13: +53
  //   hemi 1.2 + bnc 1.5: +51  |  probeK .42 giK .7: +54  |  walk neutral: walk +33  |  LB14 light + r13 ground: road +48
  //   r13 light + LB14 ground: road +33 walk +26  => the blue was the LIGHT (satFloor/coolSh/hemiC/fill mix together), the
  //   ground row only sets the walk. Row D = all of those back at r13 with the r13 fill colour and road hue, walk neutral:
  //   road 68,86,105 (+37, reference +38), walk 81,96,104 (+23), paint - asphalt +56 (target 55-65), frame L<80 30 %
  //   (r13 band 24-49), sunlit wall 79,73,73 R>B. The key (sun 5.0, expoK 0.58, conFloor 0.34) is what makes the top end;
  //   the hue levers were fighting the tonemapper and are gone.
  sun: 5.0, hemi: 1.3, bnc: 1.5, env: 0.22, probeK: 0.34, giK: 1.0, expoK: 0.58,
  // coolSh -0.010 (not 0): the aerial L30-70 band went Lenox +23 -> +10 / Bedford +13 -> +1 without it (c_earth) while
  // the eye-level road needs <= +40; sweep4 prices the term at ~5 of road B-R per 0.014, so -0.010 buys the aerial ~+9.
  sunW: 0.26, conFloor: 0.34, satFloor: 0, coolSh: -0.010, hemiC: 0x9db9de,
  hazeDK: 1.0, hazeSunK: 0.45,
};
export const LB14 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('lb14') === '0');
if (LB13 && LB14) Object.assign(PRESETS.day, DAY_LB14);
// N11 street-level ambient budget, in irradiance on an UP-FACING surface at
// nAmb 1.0. MEASURED, not derived — the first derivation (0.46 / 0.30, from "a
// 0.22 night ground albedo through exposure 0.95 needs E ~ 0.9 for sRGB 55-70")
// rendered harlem125's asphalt at sRGB 83 and its brick at 116, i.e. an overcast
// AFTERNOON, because it ignored two things: the auto-exposure meter (which sits
// at its 1.35 ceiling in a dark frame and drops to its 0.70 floor in a lit one,
// a 1.5x swing that fights any open-loop calculation) and the fact that
// `engine.bounce` is a HEMISPHERE light with no falloff, so unlike the 24 point
// lights it lands its full value on every surface in the city at once.
//
// THE AMBIENT IS A FLOOR, NOT THE KEY. The brief's "pavement under a cobrahead
// reads mid-grey" is the POINT LIGHTS' job (measured: ~150 sRGB at the pool
// centre, ~100 at 5 m, ~43 at 10 m); the ambient only has to stop everything
// between and beyond the pools from going to black, i.e. land the unlit asphalt
// around sRGB 30-45 and an unlit facade around 30-55. Retune these two numbers,
// not the colours.
const N11_STREET = 0.25;   // bounce (warm): lamp spill + shopfront spill
const N11_SKYGLOW = 0.21;  // hemi (cool): the glow overhead
// Sun colour. COOL is the MIDDAY end and a midday sun in a white-balanced
// photograph is very nearly neutral: at 0xfff4e8 the key was linear R/B 1.51 and
// it pushed sunlit asphalt to R−B 34 sRGB where the panoramas read 5–11. The
// warmth of a NYC noon lives in the bounce off the masonry, not in the key.
const WARM = new THREE.Color(0xffb072), COOL = new THREE.Color(0xfffcf7);

// Photographed sky library (Poly Haven CC0, 4K .hdr in public/textures/hdri/).
// Each sky drives the WHOLE lighting rig: the brightest texel gives the sun
// direction/color, luminance statistics set sun/ambient intensity and night
// factor, and a horizon-band average recolors the fog — so picking an HDRI in
// the editor relights the city to match the photo.
export const HDRI_LIST = [
  'kloofendal_48d_partly_cloudy_puresky', 'qwantani_mid_morning_puresky',
  'lonely_road_afternoon_puresky', 'belfast_sunset_puresky',
  'qwantani_dusk_2_puresky', 'kloofendal_overcast_puresky',
  'kloofendal_misty_morning_puresky', 'qwantani_night_puresky',
];
const half2float = (h) => {
  const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
};

export class Sky {
  async setHDRI(name) {
    if (name === true) name = HDRI_LIST[0]; // legacy checkbox compat
    if (!name) {
      this.hdri = false;
      this.sky.visible = true;
      this.engine.scene.background = null;
      this.apply(this.mode); // rebuild analytic env + lighting bases
      return;
    }
    const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
    const tex = await new RGBELoader().loadAsync('textures/hdri/' + name + '.hdr');
    tex.mapping = THREE.EquirectangularReflectionMapping;
    // ---- analyze: brightest texel = sun; stats drive the lighting rig
    const { data, width, height } = tex.image;
    const stride = 4; // sample every 4th px
    let peak = 0, px = 0, py = 0, sum = 0, n = 0, horiz = [0, 0, 0], hn = 0;
    const rd = typeof data[0] === 'number' && data.BYTES_PER_ELEMENT === 2
      ? (i) => half2float(data[i]) : (i) => data[i];
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const i = (y * width + x) * 4;
        const r = rd(i), g = rd(i + 1), b = rd(i + 2);
        const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
        sum += l; n++;
        if (l > peak) { peak = l; px = x; py = y; }
        if (Math.abs(y - height / 2) < height * 0.04) { horiz[0] += r; horiz[1] += g; horiz[2] += b; hn++; }
      }
    }
    const avgL = sum / n;
    // uv -> world dir (three equirect convention: u=atan(z,x)/2pi+0.5, v=asin(y)/pi+0.5)
    const theta = (px / width - 0.5) * Math.PI * 2;
    const phi = (0.5 - py / height) * Math.PI; // image y down = +v up flip
    const sunDir = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi)).normalize();
    // sun color from a small patch around the peak, normalized
    const i0 = (py * width + px) * 4;
    const sc3 = new THREE.Color(rd(i0), rd(i0 + 1), rd(i0 + 2));
    const m = Math.max(sc3.r, sc3.g, sc3.b) || 1;
    sc3.multiplyScalar(1 / m);
    // ---- swap background/env (dispose previous — 4K halffloat skies are 67MB each)
    if (this._hdriTex && this._hdriTex !== tex) { this._hdriTex.dispose(); this._hdriEnv?.dispose(); }
    this._hdriTex = tex;
    this._hdriEnv = this.pmrem.fromEquirectangular(tex);
    this.hdri = name;
    this.sky.visible = false;
    const sc = this.engine.scene;
    // Poly Haven night skies are LONG-EXPOSURE (avgL ~0.6 — brighter than
    // some day skies), so luminance alone can't detect night: use the name
    // as the authoritative hint and keep the sky dim instead of normalizing
    // it up to daytime levels
    const isNight = /night|moonl/i.test(name);
    const norm = Math.min(4, Math.max(0.05, 0.32 / Math.max(avgL, 1e-4))) * (isNight ? 0.16 : 1);
    sc.background = tex;
    sc.backgroundIntensity = norm;
    sc.environment = this._hdriEnv.texture;
    sc.environmentIntensity = norm * 0.9;
    this.engine.envBase = norm * 0.9;
    // ---- relight the world to match the photo
    const ratio = peak / Math.max(avgL, 1e-5);
    const sunny = Math.min(1, ratio / 400) * (isNight ? 0.12 : 1); // moonlight, not sunlight
    const night = isNight ? 0.92 : 1 - Math.min(1, avgL / 0.045);
    const dayL = Math.max(0, 1 - Math.max(0, night));
    this.sunDir = sunDir;
    ENV.sunDir.value.copy(sunDir);
    ENV.sunColor.value.copy(sc3);
    ENV.night.value = Math.max(0, night);
    const s = this.engine.sun;
    s.color.copy(sc3);
    s.position.copy(sunDir).multiplyScalar(600);
    this.engine.sunBase = 3.4 * sunny * Math.max(dayL, isNight ? 0.55 : 0) * Math.max(0.15, sunDir.y + 0.1);
    this.engine.hemiBase = 0.18 + 0.4 * dayL;
    if (this.engine.bounce) {
      // same urban bounce as the analytic path, keyed off the photo's own sun
      const wall = sc3.clone().multiply(new THREE.Color(0.62, 0.50, 0.38));
      const grnd = sc3.clone().multiply(new THREE.Color(0.60, 0.53, 0.44));
      const bm = Math.max(wall.r, wall.g, wall.b) || 1;
      this.engine.bounce.color.copy(wall).multiplyScalar(1 / bm);
      this.engine.bounce.groundColor.copy(grnd).multiplyScalar(1 / bm);
      this.engine.bounce.intensity = 0.62 * sunny * dayL;
      this.engine.bounceBase = this.engine.bounce.intensity;
    }
    this.engine.expoBase = 0.74;
    const fogC = hn ? new THREE.Color(horiz[0] / hn, horiz[1] / hn, horiz[2] / hn).multiplyScalar(norm) : new THREE.Color(0.7, 0.75, 0.8);
    const fm = Math.max(fogC.r, fogC.g, fogC.b);
    if (fm > 1) fogC.multiplyScalar(1 / fm);
    this.engine.scene.fog.color.copy(fogC);
    ENV.fogColor.value.copy(fogC);
    ENV.skyAmbient.value.copy(fogC).multiplyScalar(0.6 + 0.4 * dayL);
    // N11: a photographed sky IS the ambient — no designed night floor here, so
    // the probe keeps its original darkness rejection on the HDRI path.
    this.engine.probeFloor = null;
    this.engine.setBloom?.(Math.max(0, night));
    console.log(`[hdri] ${name}: avgL ${avgL.toFixed(3)} ratio ${ratio.toFixed(0)} sun(${sunDir.x.toFixed(2)},${sunDir.y.toFixed(2)},${sunDir.z.toFixed(2)}) night ${Math.max(0, night).toFixed(2)}`);
  }

  constructor(engine) {
    this.engine = engine;
    this.presets = PRESETS; // live-editable from a tool: sky.presets.day.expo = x; sky.apply('day')
    this.DAY_R12 = DAY_R12; this.DAY_LB13 = DAY_LB13;   // LB13 — one-session A/B of the two day rigs
    this.mode = 'day';
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(20000);
    // background: draw AFTER the city so the atmosphere shader only runs on
    // visible sky pixels (it is centred on the camera and sorted first otherwise)
    this.sky.renderOrder = 1;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 2.5;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.95;
    // cap the sun disc's HDR radiance so bloom gets a halo, not a whiteout.
    // Matched by regex: the output variable keeps getting renamed between three
    // versions (retColor -> texColor), so anchor on the final gl_FragColor line.
    // ...and a GAIN, because the Sky model's absolute radiance is arbitrary
    // relative to the sun and IBL levels chosen above. At gain 1 the day sky
    // rendered at sRGB L 233 against a photograph's 196, i.e. the sky sat on the
    // tone curve's shoulder where AgX flattens it to a cream-cyan with no blue
    // left. The gain is a CALIBRATION of that one arbitrary scale, applied only
    // to the visible dome — the env bake (envSky) is a separate mesh, so the
    // ambient is untouched by it.
    this.sky.material.uniforms.skyGain = { value: 1 };
    // N11 — CITY SKY GLOW (docs/notes/night-r11.md 1.3). The analytic sky with its
    // sun 14 deg under the horizon renders essentially BLACK, and a night frame
    // whose sky is pure black reads as a render every time: Manhattan's sky glow is
    // the brightest in North America and in a photograph the horizon is an
    // orange-grey band, never nothing. This is an ADDITIVE horizon-hugging term:
    //   * exp(-y * 6.5) hugs the horizon, blending the warm low colour into the
    //     cool zenith colour over ~20 deg, which is the real profile;
    //   * the two-lobe azimuth modulation stops it being a perfect ring (a ring
    //     reads as a dome). It is a sum of two sines over the whole sky, i.e. the
    //     lowest frequency an image can carry, so it can neither alias nor flicker;
    //   * nGlowAmt is 0 for day and golden, so those presets are bit-identical.
    // The SAME patch goes on envSky, so the env bake carries the glow and the IBL
    // becomes the directional half of the night ambient (up-facing surfaces see
    // more of it than a soffit does, which a HemisphereLight cannot express).
    const glowPatch = (mat) => {
      if (!mat.uniforms.skyGain) mat.uniforms.skyGain = { value: 1 };
      mat.uniforms.nGlowAmt = { value: 0 };
      mat.uniforms.nGlowLo = { value: new THREE.Vector3().copy(GLOW_LOW) };
      mat.uniforms.nGlowHi = { value: new THREE.Vector3().copy(GLOW_HIGH) };
      const f0 = mat.fragmentShader;
      mat.fragmentShader = f0.replace(
        /gl_FragColor\s*=\s*vec4\(\s*(\w+)\s*,\s*1\.0\s*\)\s*;/,
        'gl_FragColor = vec4( min( $1 * skyGain + n11Glow( direction ), vec3( 5.0 ) ), 1.0 );'
      ).replace('void main() {', `uniform float skyGain;
        uniform float nGlowAmt; uniform vec3 nGlowLo; uniform vec3 nGlowHi;
        vec3 n11Glow( vec3 dir ) {
          if ( nGlowAmt <= 0.0 ) return vec3( 0.0 );
          float h = clamp( dir.y, -0.30, 1.0 );
          float band = exp( - max( h, 0.0 ) * 6.5 );              // horizon-hugging
          float az = atan( dir.z, dir.x );
          float lobes = 1.0 + 0.30 * sin( az + 0.7 ) + 0.14 * sin( az * 2.0 - 1.3 );
          float under = mix( 0.55, 1.0, smoothstep( -0.30, 0.02, h ) );
          return mix( nGlowHi, nGlowLo, band ) * ( nGlowAmt * max( lobes, 0.35 ) * under );
        }
        void main() {`);
      if (mat.fragmentShader === f0) console.warn('sky clamp/glow patch did not match');
      mat.needsUpdate = true;
    };
    glowPatch(this.sky.material);
    this.sky.material.needsUpdate = true;
    engine.scene.add(this.sky);
    // separate sun-free sky used for the environment bake (no solar blast in IBL)
    this.envSky = new SkyMesh();
    this.envSky.scale.setScalar(20000);
    const eu = this.envSky.material.uniforms;
    eu.turbidity.value = 8;
    eu.rayleigh.value = 3;
    eu.mieCoefficient.value = 0.0002;
    eu.mieDirectionalG.value = 0.7;
    glowPatch(this.envSky.material);   // N11: the env bake carries the sky glow too
    this.envScene = new THREE.Scene();
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.pmrem.compileEquirectangularShader();
    this._envRT = null;
    engine.scene.fog = new THREE.FogExp2(0xcfd8e2, 0.0001);
    engine.sky = this; // debug/A-B handle: window.__ENGINE.sky.apply('day')
    this.apply('day');
  }
  apply(mode) {
    const changed = this.mode !== mode;
    this.mode = mode;
    const p = PRESETS[mode];
    // N11: a new sky invalidates the stored light probe outright (engine.resetProbe).
    if (changed) this.engine.resetProbe?.();
    // GFX sun/sky offsets compose with the preset (editor re-applies on change)
    const el = ((p.elev + (GFX.sunElev || 0)) * Math.PI) / 180;
    const az = ((p.azim + (GFX.sunAzim || 0)) * Math.PI) / 180;
    this.sky.material.uniforms.turbidity.value = GFX.turbidity ?? 5;
    if (this.sky.material.uniforms.skyGain) this.sky.material.uniforms.skyGain.value = (p.skyGain ?? 1) * (GFX.skyGain ?? 1);
    const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    this.sunDir = sunDir;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    ENV.sunDir.value.copy(sunDir);
    ENV.night.value = p.night;

    // atmospheric transmittance drives sun color/intensity (PR technique).
    // The colour lerp saturates 1.3x faster than the intensity: by 40 deg the
    // sun is white-balanced neutral, which is what a photograph of noon shows.
    const trans = Math.sqrt(Math.max(Math.sin(el), 0));
    // LB14: `p.sunW` is a DAY-ONLY offset on the same axis as GFX.sunWarmth (see DAY_LB14 above) —
    // the warmth a sunlit frame needs, taken out of the albedo and put into the key.
    const sunCol = WARM.clone().lerp(COOL, Math.min(1, Math.max(0, trans * 1.3 - (GFX.sunWarmth || 0) - (p.sunW || 0))));
    ENV.sunColor.value.copy(sunCol);
    const sky = new THREE.Color().lerpColors(new THREE.Color(0x1a2333), new THREE.Color(0x9db8d8), Math.max(trans, p.night > 0.5 ? 0.02 : 0.15));
    ENV.skyAmbient.value.copy(sky);

    const s = this.engine.sun, hm = this.engine.hemi;
    s.color.copy(sunCol);
    s.intensity = 3.4 * trans * (p.sun ?? 1); // punchy key light — weather.update re-splits across both suns
    s.position.copy(sunDir).multiplyScalar(600);
    hm.color.set(mode === 'night' ? 0x202a3c : (p.hemiC ?? 0x9db9de));   // LB14: only `day` declares hemiC
    hm.groundColor.set(mode === 'night' ? 0x141210 : 0x6a5e49);
    hm.intensity = mode === 'night' ? 0.22 : (p.hemi ?? 0.48);   // LB13: only `day` declares `hemi`
    // ---- urban bounce (engine.bounce): the inter-reflected half of the
    // ambient that a sky-only environment map cannot contain. Colour = the
    // sun's own colour through a masonry/concrete albedo, so it tracks the
    // time of day for free; level scales with the direct sun, because bounce
    // IS sun that has hit something first. Retune with `?gfx=bounce:x`.
    const bnc = this.engine.bounce;
    if (bnc) {
      const wall = sunCol.clone().multiply(new THREE.Color(0.62, 0.50, 0.38));  // sunlit brick/stone
      const grnd = sunCol.clone().multiply(new THREE.Color(0.60, 0.53, 0.44));  // sunlit concrete/asphalt
      const m = Math.max(wall.r, wall.g, wall.b) || 1;
      bnc.color.copy(wall).multiplyScalar(1 / m);
      bnc.groundColor.copy(grnd).multiplyScalar(1 / m);
      // p.night 0 -> full, 1 -> none: at night the only bounce is sodium lamps
      // and the ground shader already carries that in its own night pass.
      bnc.intensity = 0.62 * trans * (1 - p.night) * (p.bnc ?? 0);
      this.engine.bounceBase = bnc.intensity;
    }
    // ---------------------------------------------- N11 NIGHT AMBIENT --------
    // (docs/notes/night-r11.md 1.2.) Everything above leaves a night frame with
    // sun 0, bounce 0, env ~0 and a 0.22 hemi — i.e. NO ambient, which is why
    // night has been carried entirely by 24 point lights and the emissives and
    // why the film's night swipe read as a failure. Put the ambient back in two
    // halves that come from two different places in the real city:
    //   hemi   = the SKY GLOW, cool, from above (at night it replaces the
    //            twilight blue outright; at dusk it is added to the residual sky)
    //   bounce = the STREET LIGHTING, warm — the lamp spill a horizontal surface
    //            sees from the luminaires (`color`) and the bounce off the
    //            pavement that reaches soffits and the lower facade
    //            (`groundColor`). A vertical wall takes the 50/50 mix, which is
    //            the warm-below / cool-above split of a lit avenue.
    // Levels are stated as IRRADIANCE on an up-facing surface (N11_STREET /
    // N11_SKYGLOW) and divided by each colour's own luminance, so recolouring a
    // term does not silently change how bright the street is.
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const nAmb = N11 && (p.night ?? 0) > 0.15 ? (p.nAmb ?? 0) : 0;
    let nFog = p.fog, nEnv = p.env;
    if (nAmb > 0) {
      if (mode === 'night') { hm.color.set(AMB_HEMI_SKY); hm.groundColor.set(AMB_HEMI_GND); hm.intensity = 0; }
      hm.intensity += (N11_SKYGLOW * nAmb) / Math.max(1e-4, lum(hm.color));
      if (bnc) {
        // the daytime bounce is already 0 at dusk and night (it scales with
        // `trans`, and the sun is under the horizon in both), so this replaces
        // nothing — it fills a term that was empty.
        bnc.color.set(AMB_STREET_UP);
        bnc.groundColor.set(AMB_STREET_DN);
        bnc.intensity = (N11_STREET * nAmb) / Math.max(1e-4, lum(bnc.color));
        this.engine.bounceBase = bnc.intensity;
      }
      nFog = p.nFog ?? p.fog;      // fade the distance into sky glow, not into black
      nEnv = p.nEnv ?? p.env;      // the env bake's dome now carries the glow
    }
    // sky-glow level for both domes, and the crush on their analytic content.
    // Set BEFORE the pmrem bake below so the environment map contains both.
    // Both are 0 / 1 for day and golden — those presets are untouched.
    {
      const lit = N11 && (p.night ?? 0) > 0.15;
      const g = lit ? (p.nGlow ?? 0) : 0;
      const sg = lit ? (p.nSkyG ?? 1) : 1;
      const su = this.sky.material.uniforms, eu2 = this.envSky.material.uniforms;
      if (su.nGlowAmt) su.nGlowAmt.value = g;
      if (eu2.nGlowAmt) eu2.nGlowAmt.value = g;
      // the visible dome's gain was written above from p.skyGain * GFX.skyGain;
      // envSky had no gain at all before this round, so its base is 1.
      if (su.skyGain) su.skyGain.value *= sg;
      if (eu2.skyGain) eu2.skyGain.value = sg;
      // ENV.skyAmbient is the ZENITH colour every analytic sky reflection reads
      // (skyLook's `uZenC`: facade glass, landmark curtain walls, the far macro).
      // The daylight lerp leaves it at 0x1a2333 after dark — linear 1 : 1.75 :
      // 3.76, i.e. far bluer than the sky now above it — so glass at night
      // mirrored a twilight that is no longer there. Match the zenith glow.
      if (lit && (p.night ?? 0) > 0.9) ENV.skyAmbient.value.setRGB(GLOW_HIGH.x, GLOW_HIGH.y, GLOW_HIGH.z).multiplyScalar(1.15);
    }
    // PROBE FLOOR (engine._updateProbe). weather.js hands the probe 40 % of the
    // hemi and 35 % of the bounce as `probeOn` fades in; the floor is exactly
    // that share expressed as radiance, so a dark or poisoned capture can only
    // ever degrade the ambient back to the one designed above, never to black.
    if (nAmb > 0) {
      const hi = hm.color.clone().multiplyScalar(hm.intensity);
      const bi = bnc ? bnc.color.clone().multiplyScalar(bnc.intensity) : new THREE.Color(0, 0, 0);
      this.engine.probeFloor = new THREE.Color(
        (0.40 * hi.r + 0.35 * bi.r) / Math.PI,
        (0.40 * hi.g + 0.35 * bi.g) / Math.PI,
        (0.40 * hi.b + 0.35 * bi.b) / Math.PI);
    } else this.engine.probeFloor = null;
    // bases the per-frame GFX composition multiplies (weather.update)
    this.engine.sunBase = s.intensity;
    this.engine.hemiBase = hm.intensity;
    this.engine.expoBase = PRESETS[mode].expo;
    // LB13 — three per-preset scalars weather.js composes each frame. All three default to 1, and
    // only the `day` row declares them, so golden / dusk / night compose exactly as before:
    //   probeK     scales the delivered light-probe intensity (the ambient's biggest term by far)
    //   expoTargetK scales the auto-exposure meter's target (keeps it pinned at its 0.70 clamp floor
    //              once the fill is out, instead of unpinning and handing the darkening back)
    //   warmK      scales the grade's shadow warm-push
    this.engine.probeK = p.probeK ?? 1;
    this.engine.expoTargetK = p.expoK ?? 1;
    this.engine.warmK = p.warmK ?? 1;
    // LB14 — day-only floor under the grade's contrast (weather.js composes it), and the day row of
    // the four ground/roof calibration uniforms. Both are the r13 values on any non-day preset, so
    // golden / dusk / night render bit-identically to round 13.
    this.engine.conFloor = p.conFloor ?? 0;
    this.engine.satFloor = p.satFloor ?? 0;
    this.engine.coolSh = p.coolSh ?? 0;
    this.engine.giK = p.giK ?? 1;
    this.engine.hazeDK = p.hazeDK ?? 1;
    this.engine.hazeSunK = p.hazeSunK ?? 1;
    applyLB14Ground(mode === 'day');

    const fogC = new THREE.Color(nFog);   // N11: p.nFog at dusk/night, p.fog otherwise
    this.engine.scene.fog.color.copy(fogC);
    this.engine.scene.fog.density = p.fogD;
    ENV.fogColor.value.copy(fogC);
    ENV.fogDensity.value = p.fogD;
    this.engine.renderer.toneMappingExposure = p.expo;
    this.engine.setBloom?.(p.night);

    // rebuild environment map from the sun-free sky (reflections on glass)
    if (this._envRT) this._envRT.dispose();
    this.envSky.material.uniforms.sunPosition.value.copy(sunDir);
    this._envRT = this.pmrem.fromScene(this.envScene, 0.02);
    this.engine.scene.environment = this._envRT.texture;
    this.engine.scene.environmentIntensity = nEnv;   // N11: p.nEnv at dusk/night
    this.engine.envBase = nEnv; // weather multiplies GFX.envScale per frame
  }
  cycle() {
    const order = ['day', 'golden', 'dusk', 'night'];
    this.apply(order[(order.indexOf(this.mode) + 1) % order.length]);
    return this.mode;
  }
  update(dt) {
    ENV.time.value += dt;
    this.sky.position.copy(this.engine.camera.position);
  }
}
