// N11 — NIGHT AMBIENT (round 11, docs/notes/night-r11.md). `?n11=0` disables
// every change of that round, everywhere.
//
// This module owns the DATA the night rig is built from — the street-lighting
// fixture library, the sky-glow radiances and the ambient palette — so that the
// four shared files it feeds (core/engine.js, world/sky.js, world/weather.js,
// sim/carlights.js, city/props.js) each take only a handful of targeted lines.
//
// WHY THE NIGHT WAS BLACK. The probe rejection below L0 0.3 (engine.js, film v4)
// was blamed for it, but the rejection is not the cause: measured, a night probe
// delivers ~0.005 of irradiance against a hemi that delivers ~0.005, so letting
// it through changes almost nothing. The cause is that the night preset has no
// ambient AT ALL —
//   sun   = 3.4 * sqrt(sin(-14 deg)) = 0
//   bounce= 0.62 * trans * (1 - night) * bnc = 0, and bnc is 0 anyway
//   env   = 0.08 of an analytic Preetham sky whose sun is 14 deg under = ~0
//   hemi  = 0.22 * 0x202a3c = irradiance ~0.005
// so a night frame is lit by 24 point lights and the emissives, and nothing
// else. Everything here exists to put a believable ~0.6-0.9 of street-level
// ambient back, with the right colour and the right direction.
import * as THREE from 'three';

export const N11 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('n11') === '0');

// ---------------------------------------------------------------- fixtures
// NYC finished converting its ~250 000 cobraheads to LED in 2017. The Street
// Design Manual standard is 3000 K; a large share of the ARTERIAL fixtures went
// in during the first (2013-2015) wave at 4000 K and are still there; and a tail
// of un-converted high-pressure sodium (~2000 K, the orange of every pre-2015
// photograph of the city) survives on park drives, under-bridge lighting and
// some Bishop's Crook posts.
//
// `cd`    point-light intensity (candela; three's physical point light). Scaled
//         with mounting height squared — see carlights.js `mh`.
// `range` the `decay 2` cutoff distance
// `poolR` radius of the additive ground decal, metres
// `pool`  additive decal RGB gain (the elliptical pool the point light cannot make)
// `head`  HDR core of the lamp head sprite (this is what feeds bloom)
// `halo`  the wide soft halo around it
// Head and halo are deliberately LESS saturated than the lamp's own colour: a
// luminaire lens at night is clipping at its centre, so it photographs nearly
// white-hot however amber the lamp is, with the colour in the halo around it.
// The legacy row reproduces the pre-round-11 literals exactly, so `?n11=0` is
// not merely "close to" the old look.
// COLOUR-BALANCE PASS (measured, third round). A 3000 K blackbody against a D65
// white point really is linear (1.00, 0.62, 0.33) and rendering it literally put the
// whole night frame on two channels — harlem125 measured asphalt R,G,B 51,31,**6**
// and brick 110,62,16, i.e. a sepia filter rather than a night. Every night
// PHOTOGRAPH carries partial chromatic adaptation (the camera, or the eye, white-
// balances part of the way toward the lamps), so the fixture colours sit ~35 % of the
// way to neutral from their blackbody values, the hemisphere goes back to a distinctly
// COOL slate, and the two together give a frame the warm/cool contrast that is what
// actually reads as night. Their RELATIVE order is unchanged, which is the part the
// brief asks for: 4000 K is visibly whiter than 3000 K, sodium visibly amber.
export const FIXTURES = [
  { key: 'led3000', hex: 0xffdcb6, cd: 245, range: 56, poolR: 7.4, pool: [0.052, 0.038, 0.022], head: [3.40, 2.60, 1.55], halo: [0.100, 0.070, 0.042] },
  { key: 'led4000', hex: 0xffeddc, cd: 275, range: 60, poolR: 8.0, pool: [0.055, 0.046, 0.035], head: [3.40, 2.95, 2.25], halo: [0.100, 0.083, 0.062] },
  { key: 'hps2000', hex: 0xffb972, cd: 185, range: 46, poolR: 6.2, pool: [0.050, 0.028, 0.010], head: [3.40, 2.05, 0.85], halo: [0.100, 0.052, 0.020] },
];
// ?n11=0 fixture: the single pre-round-11 lamp (carlights.js literals).
export const LEGACY_FIXTURE = { key: 'legacy', hex: 0xffc27a, cd: 165, range: 44, poolR: 5.4, pool: [0.034, 0.025, 0.012], head: [3.40, 2.50, 1.35], halo: [0.100, 0.072, 0.038] };
export const FIX_COLOR = FIXTURES.map((f) => new THREE.Color(f.hex));
export const LEGACY_COLOR = new THREE.Color(LEGACY_FIXTURE.hex);

// Same cheap hash props.js already uses for its companion decisions, so a pole
// keeps its fixture for the life of the session and across claim/release.
const h2 = (x, z, s) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };

// Fixture index for a pole at (x, z). Cobraheads: 62 % 3000 K, 26 % 4000 K,
// 12 % sodium. Bishop's Crooks (historic districts) keep a sodium majority —
// the teardrop luminaire on those posts is the one people photograph as orange.
export function lampKind(x, z, crook = false) {
  if (!N11) return -1;                       // -1 = the legacy single fixture
  const r = h2(x, z, 5.13);
  if (crook) return r < 0.66 ? 2 : 0;
  return r < 0.62 ? 0 : r < 0.88 ? 1 : 2;
}
export const fixtureOf = (k) => (k >= 0 && k < FIXTURES.length ? FIXTURES[k] : LEGACY_FIXTURE);
export const fixtureColor = (k) => (k >= 0 && k < FIX_COLOR.length ? FIX_COLOR[k] : LEGACY_COLOR);

// ------------------------------------------------------------- sky glow
// Manhattan's is the brightest urban sky glow in North America and a night
// frame with a PURE BLACK sky reads as a render every time. These are RADIANCE
// values (pre-tonemap), solved backwards from the display values a night
// photograph carries through this rig's night exposure (0.95) and three's ACES
// fit: horizon ~sRGB 65, zenith ~sRGB 30.
//   sRGB 65 -> linear out 0.052 -> ACES pre-image v 0.113 -> radiance 0.113*0.6/0.95
//   sRGB 30 -> linear out 0.010 -> ACES pre-image v 0.041 -> radiance 0.041*0.6/0.95
// Horizon is the sodium/LED-scattered orange-grey; the zenith keeps a cool cast
// because what is left up there is the actual atmosphere.
export const GLOW_LOW = new THREE.Vector3(0.062, 0.048, 0.038);
// MEASURED CORRECTION (round 11, second pass). The analytic Preetham dome with its
// sun 14 deg under the horizon is NOT black: harlem125 measured sRGB 42.6 at the
// zenith where the designed glow alone accounts for ~19, so the model was adding as
// much again, in blue. sky.js now crushes the analytic content at night with its own
// skyGain (PRESETS.night.nSkyG) and the zenith term is scaled to suit, which also
// widens the horizon-to-zenith gradient — a light-polluted sky is much brighter at
// the horizon than overhead, and at 0.024 the two ends were nearly equal.
export const GLOW_HIGH = new THREE.Vector3(0.0125, 0.0135, 0.0178);

// ------------------------------------------------------------- ambient palette
// hemi = the SKY-GLOW half of the ambient (cool, from above).
// bounce = the STREET-LIGHT half (warm; `color` is the lamp spill a horizontal
//   surface sees from the luminaires above it, `groundColor` the warm bounce off
//   the pavement that reaches soffits, awning undersides and the lower facade).
// A vertical facade takes the 50/50 mix of each, which is exactly the
// warm-below / cool-above split a photograph of a lit avenue carries.
// Near-neutral with only a faint cool cast: at 0x5d6474 (linear 1 : 1.13 : 1.56)
// the hemisphere was blue enough to invert the asphalt's hue against warm lamps —
// measured R,G,B 72,85,94 on night asphalt, where a lit avenue reads R > B.
export const AMB_HEMI_SKY = 0x646c7c;
export const AMB_HEMI_GND = 0x2e241a;
export const AMB_STREET_UP = 0xffdcb6;   // the 3000 K fleet mean
export const AMB_STREET_DN = 0xdcbb9e;   // lamp colour through an asphalt albedo
