// AR33 SIGN: the storefront sign and logo kit. KIT (fk/facades.js, fk/facadeKit.js) and the segment workers call it
// (API and kinds: docs/notes/ar33-signs.md; the SIGN object: docs/notes/ar33-spec.md).
//   signsReady           a promise: the fonts the specs name are loaded (FontFace + document.fonts), with their outlines
//   buildSign(sign, o)   a THREE.Object3D in wall-local coordinates (x along the face, y up, z out; origin at the sign's
//                        bottom-left on the wall plane), o = { logo: fn(ctx2d, w, h) | null, seed }
//   textTexture(spec)    { map, emissiveMap, aspect } for awnings, vinyl and banners
// Every sign is built from scratch: the letters are the real font (public/fonts/ar33, raw files from
// github.com/google/fonts, OFL / Apache), faces are painted on canvases at >= 256 px per metre (mipmapped, anisotropic),
// channel letters are the font's outlines extruded with painted returns and trim caps. Night light goes through
// ENV.night: lit faces glow at their LED / fluorescent / neon colour temperature, unlit ones stay dark.
// Owner: SIGN (docs/notes/ar33-signs.md).
import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV, applyLightTrim as LT } from '../../world/materials.js';
import { parseFont, loadFont, loadOutline, outlineOf, fontReady, drawText, drawRuns, fontsIn, DEFAULT_FONT, setFont, fontCSS, ARABIC, ARABIC_FONT } from './signPaint.js';
import { neonStrokes, joinStrokes, glyphStrokes, resample, neonContours } from './signNeon.js';

export { parseFont, loadFont, fontCSS, setFont };
export const SIGN_PPM = 256;          // canvas pixels per metre of sign (the floor; small signs get more)
const MAX_PX = 4096;

// ---------------------------------------------------------------- readiness
// the fonts every sign kit user needs, then every font the segment specs name (their `font` fields), with outlines
// for the kinds that are geometry (channel letters, numbers, neon)
const CORE = ['Inter-700', 'Inter-500', 'Arimo-700', 'Oswald-600', 'BarlowCondensed-700', 'Montserrat-800'];
const SEGS = ['bid1', 'bid2', 'bid3', 'bid4', 'west', 'east', 'hpt'];
function withTimeout(p, ms) { return Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), ms))]); }
export function loadSignFonts(names) {
  return Promise.all([...names].map((n) => {
    const [nm, ...fl] = String(n).split('|');
    const fi = parseFont(nm, fl.includes('i'));
    return Promise.all([loadFont(fi), fl.includes('o') ? loadOutline(fi) : null]);
  })).then(() => true);
}
// fonts named anywhere in a spec tree (for callers that build specs of their own)
export function preloadSignFonts(tree) { return loadSignFonts(fontsIn(tree)); }
export const signsReady = withTimeout((async () => {
  const names = new Set(CORE.map((n) => n + '|o'));
  await Promise.all(SEGS.map(async (s) => {
    try { const m = await import(`./specs/${s}.js`); fontsIn(m.default, names); } catch (e) { /* a broken spec file is the kit's problem */ }
  }));
  await loadSignFonts(names);
  return true;
})(), 20000).then((r) => { if (r === 'timeout') console.warn('[ar33 signs] signsReady timed out; signs repaint when their fonts land'); return true; });

// ---------------------------------------------------------------- small helpers
function rng(seed) {
  let s = (Math.floor(Math.abs(seed || 1) * 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hexOf(c, dflt = '#ffffff') { if (c == null || c === '') return dflt; if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0'); return String(c); }
function col(c) { return new THREE.Color(hexOf(c)); }
function lum(hex) { const c = new THREE.Color(hexOf(hex)); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function shadeHex(hex, k) {         // k > 0 toward white, k < 0 toward black (sRGB space)
  const c = new THREE.Color(hexOf(hex)); const t = k < 0 ? 0 : 1, f = Math.abs(k);
  c.convertLinearToSRGB();
  c.r += (t - c.r) * f; c.g += (t - c.g) * f; c.b += (t - c.b) * f;
  c.convertSRGBToLinear();
  return '#' + c.getHexString();
}
// black-body colour for a lamp temperature (Kelvin), linear, normalised to its brightest channel
const _kel = new Map();
export function kelvin(K) {
  if (_kel.has(K)) return _kel.get(K);
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const c = new THREE.Color(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255);
  c.convertSRGBToLinear();
  const m = Math.max(c.r, c.g, c.b); c.multiplyScalar(1 / m);
  // the rig renders a 6500 K source as white: divide by it so LED signs read white, fluorescent and neon warmer
  _kel.set(K, c);
  return c;
}
function kelvinRel(K) { const c = kelvin(K).clone(), w = kelvin(6500); c.r /= w.r; c.g /= w.g; c.b /= w.b; const m = Math.max(c.r, c.g, c.b); return c.multiplyScalar(1 / m); }

// ---------------------------------------------------------------- materials
// night: lights come on from dusk (ENV.night 0.12 -> 0.55); saturated colours are eased above 1 so a red face blooms red
const ON = 'smoothstep(0.12, 0.55, sgNight)';
const EASE = `{ float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
    gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), ${ON}); }`;
const _mats = new Map();
// painted metal, anodised aluminium, stainless: returns, frames, brackets, fasteners
export function metalMat(hex, metal = 0.55, rough = 0.38) {
  const k = `m|${hexOf(hex)}|${metal}|${rough}`;
  if (_mats.has(k)) return _mats.get(k);
  const m = metalOf(col(hex), metal, rough, false);
  _mats.set(k, m);
  return m;
}
// the same finish with the colour in the vertices (mergeSigns: one draw call per finish across a tile's signs)
function metalVCMat(metal, rough) {
  const k = `mvc|${metal}|${rough}`;
  if (_mats.has(k)) return _mats.get(k);
  const m = metalOf(new THREE.Color(1, 1, 1), metal, rough, true);
  _mats.set(k, m);
  return m;
}
function metalOf(color, metal, rough, vc) {
  const m = LT(new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, vertexColors: vc }));
  m.name = vc ? 'ar33sign:metalvc' : 'ar33sign:metal';
  if (SG2) {
    // (AR34 w2 r2) dust and soot settle on what faces up (letter tops, raceway lids, cabinet tops, bracket arms): a
    // greyer, rougher film on surfaces whose normal is near world-up
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `{
        float sgUp = smoothstep( 0.5, 0.92, dot( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) ) * 0.42;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.15, 0.138, 0.12 ), sgUp ); roughnessFactor = mix( roughnessFactor, 0.86, sgUp ); }
        #include <emissivemap_fragment>`);
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|ar33sgDu';
  }
  return m;
}
// a sign face with its canvas (rgb = the day face, a = the lit mask or the coverage)
//   mode 'lit'   : opaque; emission at night = face colour x mask x gain x lamp colour
//   mode 'decal' : alpha = coverage (painted letters, vinyl); emission only if gain > 0
// (AR34 w2 s3) a face's terms (colours, lamp x gain, day glow, grime, lamp falloff, roughness, metalness) ride in its
// vertices (userData.sgv, written by Bag.build): a tile's faces then share atlas pages and one material per page and
// variant (mergeSigns), and every face, merged or not, draws with the same few programs. sgRect maps the face's own UV
// (0..1, which the grime and the falloff read) into its texture: (0, 0, 1, 1) alone, its slot in an atlas page.
const FACE_VS_DECL = `#include <common>
attribute vec4 sgRect; attribute vec3 sgBg; attribute vec3 sgFg; attribute vec3 sgLamp; attribute vec4 sgP; attribute vec4 sgF;
varying vec2 vSgUv; varying vec3 vSgBg; varying vec3 vSgFg; varying vec3 vSgLamp; varying vec4 vSgP; varying vec4 vSgF;`;
const FACE_VS_MAIN = `#include <uv_vertex>
vSgUv = sgRect.xy + uv * sgRect.zw; vSgBg = sgBg; vSgFg = sgFg; vSgLamp = sgLamp; vSgP = sgP; vSgF = sgF;`;
const FACE_FS_DECL = 'varying vec2 vSgUv; varying vec3 vSgBg; varying vec3 vSgFg; varying vec3 vSgLamp; varying vec4 vSgP; varying vec4 vSgF;';
// a lit face's light across it (f = amount, width / height, lamp rows): darker towards the cabinet's rim, brighter along
// the lamp rows behind the face (fluorescent tubes or LED strips); amount 0 = even
const FALLV = `
  float sgFallKv( vec2 uv, vec3 f ) {
    if ( f.x <= 0.0 ) return 1.0;
    float ex = min( uv.x, 1.0 - uv.x ) * f.y, ey = min( uv.y, 1.0 - uv.y );
    float e = smoothstep( 0.0, 0.3, min( ex, ey ) );
    float rows = 0.5 + 0.5 * cos( ( uv.y * f.z - 0.5 ) * 6.2832 );
    return mix( 1.0, ( 0.58 + 0.42 * e ) * ( 0.86 + 0.14 * rows ) * 1.12, f.x );
  }`;
// the face shader: mask = a one-ink coverage (R8) on a field (sgBg, sgFg), else an RGBA face (rgb = colours, a = the lit mask
// or, for a decal, the coverage). vSgP = (all lit, grime, day glow, roughness), vSgF = (falloff xyz, metalness)
function faceShader(m, decal, mask) {
  const U = { sgNight: ENV.night, sgSatK: { value: SATK } };
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', FACE_VS_DECL).replace('#include <uv_vertex>', FACE_VS_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sgNight; uniform float sgSatK;\n' + FACE_FS_DECL + FALLV + SAT_GLSL)
      .replace('#include <map_fragment>', mask ? `
        float sgCov = texture2D( map, vSgUv ).r;
        vec3 sgCol = mix( vSgBg, vSgFg, sgCov );
        diffuseColor.rgb *= sgCol;
        ${decal ? 'diffuseColor.a *= sgCov;' : ''}
        diffuseColor.rgb *= 1.0 - vSgP.y * ( smoothstep( 0.3, 0.0, vMapUv.y ) * 0.8 + smoothstep( 0.86, 1.0, vMapUv.y ) * 0.45 );` : `
        vec4 sgT = texture2D( map, vSgUv );
        diffuseColor.rgb *= sgT.rgb;
        ${decal ? 'diffuseColor.a *= sgT.a;' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n        roughnessFactor = vSgP.w;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n        metalnessFactor = vSgF.w;')
      .replace('#include <emissivemap_fragment>', mask ? `#include <emissivemap_fragment>
        { vec3 sgE = mix( vSgFg * sgCov, sgCol, vSgP.x ); totalEmissiveRadiance += sgE * vSgLamp * max( ${ON}, vSgP.z ) * sgFallKv( vMapUv, vSgF.xyz ) * sgSatF( mix( vSgFg, sgCol, vSgP.x ) ); }` : `#include <emissivemap_fragment>
        totalEmissiveRadiance += sgT.rgb * vSgLamp * sgT.a * max( ${ON}, vSgP.z ) * sgFallKv( vMapUv, vSgF.xyz ) * sgSatF( sgT.rgb );`)
      .replace('#include <fog_fragment>', `${EASE}\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|ar33sg3' + (mask ? 'M' : 'F') + (decal ? 'd' : 'l');
}
// the face terms into a geometry's vertices (rect: the face's slot in its texture)
function faceAttrs(g, v, rect = [0, 0, 1, 1]) {
  const n = g.attributes.position.count;
  const put = (name, vals) => { const k = vals.length, a = new Float32Array(n * k); for (let i = 0; i < n; i++) a.set(vals, i * k); g.setAttribute(name, new THREE.BufferAttribute(a, k)); };
  put('sgRect', rect); put('sgBg', v.bg); put('sgFg', v.fg); put('sgLamp', v.lamp); put('sgP', v.p); put('sgF', v.f);
  return g;
}
function faceMat(tex, { mode = 'lit', gain = 0, temp = 6500, rough = 0.32, metal = 0.0, side = THREE.FrontSide, dayGlow = 0, fall = null } = {}) {
  const decal = mode === 'decal';
  const m = LT(new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, side,
    transparent: decal, depthWrite: !decal, alphaTest: decal ? 0.02 : 0, polygonOffset: decal, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const lamp = kelvinRel(temp), F = fall || [0, 1, 1];
  m.userData.sgFace = 'face';
  m.userData.sgv = { bg: [0, 0, 0], fg: [0, 0, 0], lamp: [lamp.r * gain, lamp.g * gain, lamp.b * gain], p: [0, 0, dayGlow, rough], f: [F[0], F[1], F[2], metal] };
  faceShader(m, decal, false);
  m.name = 'ar33sign:face';
  return m;
}
// a flat-coloured lit part: channel letter faces (acrylic), neon tubes
// nightDiffuse: how much of the day colour stays lit by the scene after dark (neon glass: little, the tube is the light)
function glowMat(hex, { gain = 1.8, temp = 6500, rough = 0.28, metal = 0.0, dayCol = null, day = 0, nightDiffuse = 1 } = {}) {
  const k = `g|${hexOf(hex)}|${gain}|${temp}|${rough}|${metal}|${dayCol}|${day}|${nightDiffuse}`;
  if (_mats.has(k)) return _mats.get(k);
  const lamp = kelvinRel(temp), c = col(hex);
  const m = LT(new THREE.MeshStandardMaterial({ color: dayCol ? col(dayCol) : c, roughness: rough, metalness: metal }));
  const sk = nightDiffuse >= 1 ? satK(c) : 1;
  const U = { sgNight: ENV.night, sgDay: { value: day }, sgNd: { value: nightDiffuse }, sgEm: { value: new THREE.Vector3(c.r * lamp.r * gain * sk, c.g * lamp.g * gain * sk, c.b * lamp.b * gain * sk) } };
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sgNight; uniform vec3 sgEm; uniform float sgDay; uniform float sgNd;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, sgNd, ${ON});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += sgEm * max(${ON}, sgDay);`)
      .replace('#include <fog_fragment>', `${EASE}\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|ar33sgG';
  m.name = 'ar33sign:glow';
  // (AR34 w2 s3) the same terms for the tile merge's vertex-colour copy (glowVCMat)
  const dc = m.color;
  m.userData.sgGlow = { col: [dc.r, dc.g, dc.b], em: [U.sgEm.value.x, U.sgEm.value.y, U.sgEm.value.z], day, nd: nightDiffuse };
  _mats.set(k, m);
  return m;
}
// the glow finish with its colour (vertex colours), emission and day / night terms in the vertices (mergeSigns: one draw call
// per finish across a tile's lit letters, neon and bulbs of every colour)
function glowVCMat(rough, metal) {
  const k = `gvc|${rough}|${metal}`;
  if (_mats.has(k)) return _mats.get(k);
  const m = LT(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: metal, vertexColors: true }));
  const U = { sgNight: ENV.night };
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 sgLamp; attribute vec4 sgP; varying vec3 vSgLamp; varying vec4 vSgP;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSgLamp = sgLamp; vSgP = sgP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sgNight; varying vec3 vSgLamp; varying vec4 vSgP;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, vSgP.y, ${ON});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vSgLamp * max(${ON}, vSgP.x);`)
      .replace('#include <fog_fragment>', `${EASE}\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|ar33sgGvc';
  m.name = 'ar33sign:glowvc';
  _mats.set(k, m);
  return m;
}
// additive light on the wall (halo-lit letters, neon glow), after dark only
function haloMat(tex, hex, gain) {
  const c = col(hex);
  const m = new THREE.MeshBasicMaterial({ map: tex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const U = { sgNight: ENV.night, sgGain: { value: gain } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sgNight; uniform float sgGain;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= sgGain * ${ON};\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'ar33sgH';
  m.name = 'ar33sign:halo';
  return m;
}
// W2 (AR34 wave 2): contact shadows under raised letters, lightbox lamp falloff and seams, raceway caps. On unless the
// page URL has sg2=0 (A/B against the AR33 look).
const SG2 = (() => { try { return new URLSearchParams(globalThis.location?.search || '').get('sg2') !== '0'; } catch (e) { return true; } })();
// (AR34 w2 r2) red lit colours after dark: a red face or letter driven far above 1 went salmon-pink through the
// tonemapper (ACES spills a bright red into green: r7n, #d8262c letters measured #fe8b76); the emission of a colour whose
// linear red share r / (r + g + b) is high is scaled down by up to 0.75 (red and orange; yellow a little; white, blue,
// green unchanged), so it stays red. `sgsat=0` turns it off (A/B). r13n tried 1 - 0.5 x sat^2 (too little: #fd735d).
const SGSAT = (() => { try { return new URLSearchParams(globalThis.location?.search || '').get('sgsat') !== '0'; } catch (e) { return true; } })();
const SATK = SGSAT ? 0.75 : 0;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function satK(c) { const sm = c.r + c.g + c.b; return 1 - SATK * ss(0.5, 0.9, sm > 1e-4 ? c.r / sm : 0); }
const SAT_GLSL = 'float sgSatF( vec3 c ) { float sm = c.r + c.g + c.b; return 1.0 - sgSatK * smoothstep( 0.5, 0.9, sm > 1e-4 ? c.r / sm : 0.0 ); }';
// one pass for what raised letters do to the wall behind them: by day a soft contact shadow (the R channel: the letters'
// footprint blurred and dropped a little, as the light comes from above), after dark the spill of their own colour (G
// channel). Premultiplied output: dst' = glow + dst x (1 - shade).
function shadeMat(tex, hex, glowGain, shade) {
  const c = col(hex);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // (AR34 w2 s3) the glow colour x gain and the shadow strength ride in the vertices (as the faces' terms: sgLamp, sgP.x), so
  // a tile's shade quads share atlas pages (mergeSigns)
  m.userData.sgShadeQ = true;
  m.userData.sgv = { bg: [0, 0, 0], fg: [0, 0, 0], lamp: [c.r * glowGain, c.g * glowGain, c.b * glowGain], p: [shade, 0, 0, 0], f: [0, 0, 0, 0] };
  const U = { sgNight: ENV.night };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', FACE_VS_DECL).replace('#include <uv_vertex>', FACE_VS_MAIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sgNight;\n' + FACE_FS_DECL)
      .replace('#include <fog_fragment>', `{ vec4 sgM = texture2D( map, vSgUv ); float sgOn = ${ON};
        gl_FragColor = vec4( vSgLamp * sgM.g * sgOn, sgM.r * vSgP.x * ( 1.0 - 0.6 * sgOn ) ); }
        #include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'ar33sgS3';
  m.name = 'ar33sign:shade';
  return m;
}

// ---------------------------------------------------------------- textures (two opaque canvases -> one RGBA texture)
let _texBytes = 0;
export function signTextureStats() { return { mb: +(_texBytes / 1048576).toFixed(1) }; }
// (AR34 w2 s3) a canvas the kit reads back (getImageData: the faces, the marks, the LED boards) or draws into one that it
// reads is a CPU canvas (willReadFrequently): an accelerated canvas's read-back waits on the GPU process, which compiles
// hundreds of programs while the city loads (EAST 04:17, KIT 05:26: packMask + packTexture 4.3 s of the kit's 10.1 s
// main-thread build at qc_lenox). Canvases that only become textures (the glow and contact-shadow passes) stay on the GPU.
// `sgwrf=0`: every canvas accelerated, as before (A/B); setSignCanvasRead(false) does the same for tools (the face diff).
let READ_CPU = (() => { try { return new URLSearchParams(globalThis.location?.search || '').get('sgwrf') !== '0'; } catch (e) { return true; } })();
export function setSignCanvasRead(on) { READ_CPU = !!on; }
function mkCanvas(w, h, read = false) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  // the context's attributes are fixed by its first getContext call: later getContext('2d') calls get this one
  if (read && READ_CPU) cv.getContext('2d', { willReadFrequently: true });
  return cv;
}
// rgb: the colours (opaque); a: a grey mask (opaque, white = 1). Packed straight (not premultiplied), rows flipped for GL.
// aConst (0..255): the mask is that value everywhere (an unlit face: 0, a face lit all over: 255), so it is not read.
function packTexture(rgbCv, aCv, tex = null, aConst = null) {
  const w = rgbCv.width, h = rgbCv.height;
  const A = rgbCv.getContext('2d').getImageData(0, 0, w, h).data;
  const B = aCv && aConst == null ? aCv.getContext('2d').getImageData(0, 0, w, h).data : null;
  const out = tex ? tex.image.data : new Uint8Array(w * h * 4);
  if (READ_CPU && A.length === w * h * 4 && (!B || B.length === w * h * 4)) {
    // 32-bit words (little-endian RGBA): the colours' low 24 bits, the mask's red as the alpha byte
    const n = w * h, A32 = new Uint32Array(A.buffer, A.byteOffset, n), O32 = new Uint32Array(out.buffer, out.byteOffset, n);
    const B32 = B ? new Uint32Array(B.buffer, B.byteOffset, n) : null, K = (aConst ?? 255) << 24;
    for (let y = 0; y < h; y++) {
      const src = y * w, dst = (h - 1 - y) * w;
      if (B32) for (let x = 0; x < w; x++) O32[dst + x] = (A32[src + x] & 0xffffff) | (B32[src + x] << 24);
      else for (let x = 0; x < w; x++) O32[dst + x] = (A32[src + x] & 0xffffff) | K;
    }
  } else {
    for (let y = 0; y < h; y++) {
      const src = y * w * 4, dst = (h - 1 - y) * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        out[dst + x] = A[src + x]; out[dst + x + 1] = A[src + x + 1]; out[dst + x + 2] = A[src + x + 2];
        out[dst + x + 3] = B ? B[src + x] : (aConst ?? 255);
      }
    }
  }
  if (tex) { tex.needsUpdate = true; return tex; }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.needsUpdate = true;
  _texBytes += w * h * 4 * 1.33;
  return t;
}
// one byte a pixel: the ink's coverage (the colours are the material's), for faces of one ink on one field
function packMask(aCv) {
  const w = aCv.width, h = aCv.height;
  const B = aCv.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const src = y * w * 4, dst = (h - 1 - y) * w; for (let x = 0; x < w; x++) out[dst + x] = B[src + x * 4]; }
  const t = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace; t.unpackAlignment = 1;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; t.needsUpdate = true;
  _texBytes += w * h * 1.33;
  return t;
}
// a face from a coverage mask: field bg, ink fg (linear, from #hex); lit 'letters' | 'all' | 'none'; grime at the edges
function maskFaceMat(tex, { bg, fg, lit = 'none', decal = false, gain = 0, temp = 6500, rough = 0.32, metal = 0, grime = 0.12, day = 0, side = THREE.FrontSide, fall = null } = {}) {
  const m = LT(new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: metal, side,
    transparent: decal, depthWrite: !decal, alphaTest: decal ? 0.02 : 0, polygonOffset: decal, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const lamp = kelvinRel(temp), B = col(bg || fg || '#000000'), G = col(fg || '#ffffff'), k = lit === 'none' ? 0 : gain, F = fall || [0, 1, 1];
  m.userData.sgFace = 'mask';
  m.userData.sgv = { bg: [B.r, B.g, B.b], fg: [G.r, G.g, G.b], lamp: [lamp.r * k, lamp.g * k, lamp.b * k], p: [lit === 'all' ? 1 : 0, decal ? 0 : grime, day, rough], f: [F[0], F[1], F[2], metal] };
  faceShader(m, decal, true);
  m.name = 'ar33sign:mask';
  return m;
}
// the face of a sign: a coverage mask when it is one ink on one field (a quarter of the memory), else RGBA
// wear on a coverage mask (painted wall signs, old vinyl): flaked specks, faded patches, rain streaks; amt 0..1
function wearMask(cv, amt, seed) {
  if (!(amt > 0)) return;
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, R = rng((seed || 3) * 7.13 + 1);
  c.save();
  const n = Math.round(amt * W * H / 90);
  for (let i = 0; i < n; i++) {                       // flakes: small, opaque
    const r = H * (0.004 + R() ** 3 * 0.03);
    c.fillStyle = `rgba(0,0,0,${0.55 + R() * 0.45})`;
    c.beginPath(); c.ellipse(R() * W, R() * H, r * (0.6 + R()), r, R() * 3.14, 0, 6.2832); c.fill();
  }
  for (let i = 0; i < Math.round(amt * 14); i++) {   // faded patches
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${0.25 + R() * 0.35})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(R() * W, R() * H); c.scale(H * (0.3 + R() * 0.8), H * (0.2 + R() * 0.5)); c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
  }
  c.globalAlpha = 0.18 * amt;                         // streaks down from the top
  c.fillStyle = '#000';
  for (let i = 0; i < Math.round(amt * W / 6); i++) c.fillRect(R() * W, R() * H * 0.3, 1 + R() * 2, H * (0.2 + R() * 0.8));
  c.restore();
}
// sun-faded colour: pigment bleached towards a paler, greyer tone (reds go pink); f 0..1
export function fadeHex(hex, f) {
  if (!(f > 0)) return hex;
  const c = new THREE.Color(hexOf(hex)), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, hsl.s * (1 - 0.5 * f), Math.min(0.92, hsl.l + (1 - hsl.l) * 0.35 * f), THREE.SRGBColorSpace);
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}
function fadeCanvas(cv, f) {
  if (!(f > 0)) return;
  const tmp = mkCanvas(cv.width, cv.height, true), t = tmp.getContext('2d');
  t.filter = `saturate(${(1 - 0.5 * f).toFixed(3)}) brightness(${(1 + 0.18 * f).toFixed(3)})`; t.drawImage(cv, 0, 0);
  const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(tmp, 0, 0);
}
function signFace(po, mo) {
  const s = po.sign;
  const fade = +(s.fade || 0);
  const fg = fadeHex(hexOf(s.fg, '#ffffff'), fade);
  const single = !po.logo && !po.inline && !(s.runs && s.runs.length) && !s.stroke && !(s.sub && s.sub.fg && hexOf(s.sub.fg) !== hexOf(s.fg, '#ffffff'));
  if (single) {
    // (AR34 w2 s3) only the coverage is read: the colour canvas is not painted (a 1 px stand-in takes its calls)
    const p = paintFace({ ...po, lit: 'coverage', weather: false, noRgb: READ_CPU });
    if (po.wear) wearMask(p.a, po.wear, po.seed);
    return maskFaceMat(packMask(p.a), { bg: po.bg ? fadeHex(po.bg, fade) : po.bg, fg, lit: mo.lit, decal: mo.decal, gain: mo.gain, temp: mo.temp, rough: mo.rough, metal: mo.metal, grime: po.weather === false ? 0 : 0.1 + rng(po.seed || 7)() * 0.08, day: mo.day || 0, side: mo.side, fall: mo.fall || null });
  }
  const lm = mo.decal ? 'coverage' : (mo.lit === 'all' ? 'all' : mo.lit === 'letters' ? 'letters' : 'none');
  // a mask that is one value all over (lit 'all': 255, 'none': 0) is neither painted nor read
  const aConst = READ_CPU && (lm === 'all' || lm === 'none') ? (lm === 'all' ? 255 : 0) : null;
  const p = paintFace({ ...po, lit: lm, noMask: aConst != null });
  fadeCanvas(p.rgb, fade);
  if (po.wear && mo.decal) wearMask(p.a, po.wear, po.seed);
  return faceMat(packTexture(p.rgb, p.a, null, aConst), { mode: mo.decal ? 'decal' : 'lit', gain: mo.lit === 'none' ? 0 : mo.gain, temp: mo.temp, rough: mo.rough, metal: mo.metal, side: mo.side, dayGlow: mo.day || 0, fall: mo.fall || null });
}

// canvas size for a face of w x h metres
function pxFor(w, h, ppm = SIGN_PPM) {
  let k = ppm;
  if (w * k > MAX_PX) k = MAX_PX / w;
  if (h * k > MAX_PX) k = Math.min(k, MAX_PX / h);
  // small faces get more pixels (a 0.4 m plaque at 512 px per metre)
  if (Math.max(w, h) * k < 256) k = Math.min(1024, 256 / Math.max(w, h, 0.05));
  return [Math.max(8, Math.round(w * k)), Math.max(8, Math.round(h * k)), k];
}

// ---------------------------------------------------------------- face painting
function linesOf(sign) {
  let L = sign.lines && sign.lines.length ? sign.lines.slice() : String(sign.text ?? '').split('\n');
  if (sign.caps) L = L.map((s) => s.toUpperCase());
  return L.filter((s) => s.length);
}
// paint a sign face: rgb (day colours) and a (mask). o = { W, H (px), k (px per m), bg, fg, sign, logo, lit: 'letters' |
// 'all' | 'none' | 'coverage', seed, frameIn (px of the face hidden under a retainer) }
function paintFace(o) {
  const { W, H, k, sign } = o;
  const rgb = o.noRgb ? mkCanvas(1, 1, true) : mkCanvas(W, H, true), a = o.noMask ? mkCanvas(1, 1, true) : mkCanvas(W, H, true);
  const c = rgb.getContext('2d'), m = a.getContext('2d');
  const fi = parseFont(sign.font || DEFAULT_FONT, sign.italic);
  const fg = hexOf(sign.fg, '#ffffff');
  const bg = o.bg;
  const R = rng(o.seed || 7);
  // the field
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
  else { c.fillStyle = fg; c.fillRect(0, 0, W, H); }       // decal: rgb = the ink colour everywhere (clean edges)
  m.fillStyle = o.lit === 'all' ? '#fff' : '#000'; m.fillRect(0, 0, W, H);
  // (AR34 w2 r2) an inline: a thin ring printed on the face, inset from its edge, following the outline (a pill's ends):
  // o.inline = { color, w, inset, r } in px (the LOUISIANA KITCHEN pill's white line)
  if (o.inline) {
    const q = o.inline, x0 = q.inset, y0 = q.inset, x1 = W - q.inset, y1 = H - q.inset, r = Math.max(0, Math.min(q.r ?? 0, (x1 - x0) / 2, (y1 - y0) / 2));
    c.save(); c.strokeStyle = q.color; c.lineWidth = q.w; c.beginPath();
    c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.arcTo(x1, y0, x1, y0 + r, r); c.lineTo(x1, y1 - r); c.arcTo(x1, y1, x1 - r, y1, r);
    c.lineTo(x0 + r, y1); c.arcTo(x0, y1, x0, y1 - r, r); c.lineTo(x0, y0 + r); c.arcTo(x0, y0, x0 + r, y0, r); c.closePath(); c.stroke(); c.restore();
  }
  const inset = o.frameIn || 0;
  // content box: the face inside the retainer, with a margin
  const padX = o.padX ?? Math.max(inset + H * 0.08, W * 0.02), padY = inset + H * (o.padY ?? 0.12);
  let box = [padX, padY, W - 2 * padX, H - 2 * padY];
  // the logo slot
  if (o.logo) {
    const at = sign.logoAt || 'left';
    if (at === 'fill') {
      drawLogo(o.logo, c, m, 0, 0, W, H, o.lit);
      box = null;
    } else {
      const s = Math.min(H - 2 * padY, W * 0.4);
      const lx = at === 'right' ? W - padX - s : padX;
      drawLogo(o.logo, c, m, lx, (H - s) / 2, s, s, o.lit);
      box = at === 'right' ? [padX, padY, W - 3 * padX - s, H - 2 * padY] : [padX * 2 + s, padY, W - 3 * padX - s, H - 2 * padY];
    }
  }
  if (box && sign.runs && sign.runs.length && o.text !== false) {
    const runs = sign.runs.map((r) => ({ ...r, fi: parseFont(r.font || sign.font || DEFAULT_FONT, r.italic), color: hexOf(r.fg || fg),
      stroke: r.stroke ? (typeof r.stroke === 'string' ? { color: r.stroke, w: 0.05 } : r.stroke) : null }));
    runs.forEach((r) => { r.italic = r.fi.synthItalic; });
    if (runs.every((r) => fontReady(r.fi))) {
      drawRuns(c, box, runs, { fill: sign.fill ?? 0.62, align: sign.align || 'center' });
      if (o.lit === 'letters' || o.lit === 'coverage') drawRuns(m, box, runs, { fill: sign.fill ?? 0.62, align: sign.align || 'center', maskColor: '#fff' });
    }
  } else if (box && fontReady(fi) && o.text !== false) {
    const L = linesOf(sign);
    const stroke = sign.stroke ? (typeof sign.stroke === 'string' ? { color: sign.stroke, w: 0.05 } : sign.stroke) : null;
    const sub = sign.sub ? (typeof sign.sub === 'string' ? { text: sign.sub } : sign.sub) : null;
    let mainBox = box;
    if (sub) { const sh = box[3] * (sub.size || 0.28); mainBox = [box[0], box[1], box[2], box[3] - sh * 1.15]; }
    const T = { lines: L, fi, fill: sign.fill ?? (L.length > 1 ? null : 0.62), tracking: sign.tracking || 0, align: sign.align || 'center',
      italic: fi.synthItalic, stroke, lead: sign.lead };
    drawText(c, mainBox, { ...T, color: fg });
    if (o.lit === 'letters' || o.lit === 'coverage') drawText(m, mainBox, { ...T, color: '#fff', stroke: stroke && o.lit === 'coverage' ? { ...stroke, color: '#fff' } : null });
    if (sub) {
      const sfi = parseFont(sub.font || sign.font || DEFAULT_FONT);
      const sb = [box[0], box[1] + box[3] - box[3] * (sub.size || 0.28), box[2], box[3] * (sub.size || 0.28)];
      const S = { lines: [sub.text], fi: sfi, fill: 0.75, tracking: sub.tracking ?? 0.04, align: sign.align || 'center' };
      if (fontReady(sfi)) {
        drawText(c, sb, { ...S, color: hexOf(sub.fg || fg) });
        if (o.lit === 'letters' || o.lit === 'coverage') drawText(m, sb, { ...S, color: '#fff' });
      }
    }
  }
  // weathering by day: a faint grime line along the bottom, dust on the top edge (panels and cabinets only)
  if (bg && o.weather !== false) {
    const g = c.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0, 'rgba(40,34,26,0)'); g.addColorStop(1, `rgba(40,34,26,${0.10 + R() * 0.08})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const g2 = c.createLinearGradient(0, 0, 0, H * 0.15);
    g2.addColorStop(0, `rgba(60,52,40,${0.06 + R() * 0.05})`); g2.addColorStop(1, 'rgba(60,52,40,0)');
    c.fillStyle = g2; c.fillRect(0, 0, W, H);
  }
  return { rgb, a, fi };
}
function drawLogo(fn, c, m, x, y, w, h, lit) {
  const W = Math.max(8, Math.round(w)), H = Math.max(8, Math.round(h));
  const cv = mkCanvas(W, H, true);
  const g = cv.getContext('2d');
  try { fn(g, W, H); } catch (e) { console.warn('[ar33 signs] logo drawer failed', e && e.message); return; }
  c.drawImage(cv, x, y, w, h);
  if (lit === 'letters' || lit === 'coverage') {
    // the mark's own coverage lights (its alpha)
    const mc = mkCanvas(W, H, true), mg = mc.getContext('2d');
    mg.drawImage(cv, 0, 0);
    mg.globalCompositeOperation = 'source-in'; mg.fillStyle = '#fff'; mg.fillRect(0, 0, W, H);
    m.drawImage(mc, x, y, w, h);
  }
}

// ---------------------------------------------------------------- geometry helpers
const _pending = new Set();
function nonIndexed(g) { const n = g.index ? g.toNonIndexed() : g.clone(); n.clearGroups(); for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; }
// a parts bag: material -> geometries, merged into one mesh per material
class Bag {
  constructor() { this.m = new Map(); }
  add(mat, g, mtx = null) { if (!g) return; const n = nonIndexed(g); if (mtx) n.applyMatrix4(mtx); if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(n); }
  build(group, name, shadowMats = new Set()) {
    for (const [mat, gs] of this.m) {
      const g = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      if (!g) continue;
      if (mat.userData && mat.userData.sgv) faceAttrs(g, mat.userData.sgv);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name; mesh.castShadow = shadowMats.has(mat); mesh.receiveShadow = !mat.transparent;
      group.add(mesh);
    }
    this.m.clear();
    return group;
  }
}
const M4 = () => new THREE.Matrix4();
function tr(x, y, z) { return M4().makeTranslation(x, y, z); }
// a box spanning [x, x + w] x [y, y + h] x [z, z + d]
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x + w / 2, y + h / 2, z + d / 2); return g; }
// a rounded, bevelled slab w x h x d, its back on z (the extruded-aluminium cabinet)
function slab(w, h, d, x, y, z, r = 0.015, bev = 0.006) {
  r = Math.max(0.001, Math.min(r, w / 2 - bev - 0.001, h / 2 - bev - 0.001));
  bev = Math.max(0.0005, Math.min(bev, d / 3, w / 4, h / 4));
  const s = new THREE.Shape(), X0 = bev, Y0 = bev, X1 = w - bev, Y1 = h - bev;
  s.moveTo(X0 + r, Y0); s.lineTo(X1 - r, Y0); s.quadraticCurveTo(X1, Y0, X1, Y0 + r); s.lineTo(X1, Y1 - r); s.quadraticCurveTo(X1, Y1, X1 - r, Y1);
  s.lineTo(X0 + r, Y1); s.quadraticCurveTo(X0, Y1, X0, Y1 - r); s.lineTo(X0, Y0 + r); s.quadraticCurveTo(X0, Y0, X0 + r, Y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 3 });
  g.translate(x, y, z + bev);
  return g;
}
// a rectangular frame ring (outer w x h, bar width b), depth d, back on z
function ring(w, h, b, d, x, y, z) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.lineTo(0, 0);
  const hole = new THREE.Path(); hole.moveTo(b, b); hole.lineTo(b, h - b); hole.lineTo(w - b, h - b); hole.lineTo(w - b, b); hole.lineTo(b, b);
  s.holes.push(hole);
  const bev = Math.min(0.004, d / 4, b / 4);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: -bev * 0.0 + bev * 0.5, bevelOffset: -bev * 0.5, bevelSegments: 1, curveSegments: 1 });
  g.translate(x, y, z + bev);
  return g;
}
// an outline into a THREE.Shape / Path over [0, W] x [0, H], inset by `inset`: 'pill' (round ends), 'oval' / 'round' (an
// ellipse), 'rounded' (corner radius r, less the inset)
function outlineTo(p, kind, W, H, r, inset = 0) {
  const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset, w = x1 - x0, h = y1 - y0;
  if (kind === 'oval' || kind === 'round') { p.absellipse(W / 2, H / 2, w / 2, h / 2, 0, Math.PI * 2, false, 0); return p; }
  const R = Math.max(0.001, Math.min(kind === 'pill' ? Math.min(w, h) / 2 : (r ?? 0.1) - inset, w / 2, h / 2));
  p.moveTo(x0 + R, y0); p.lineTo(x1 - R, y0); p.absarc(x1 - R, y0 + R, R, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - R); p.absarc(x1 - R, y1 - R, R, 0, Math.PI / 2, false);
  p.lineTo(x0 + R, y1); p.absarc(x0 + R, y1 - R, R, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + R); p.absarc(x0 + R, y0 + R, R, Math.PI, Math.PI * 1.5, false);
  return p;
}
// a plane w x h facing +z at depth z (UV 0..1), lower-left at (x, y)
function quad(w, h, x, y, z, flip = false) {
  const g = new THREE.PlaneGeometry(w, h);
  if (flip) { g.rotateY(Math.PI); }
  g.translate(x + w / 2, y + h / 2, z);
  return g;
}
const _screw = new THREE.CylinderGeometry(0.0065, 0.0075, 0.005, 8, 1);
_screw.rotateX(Math.PI / 2);
// pan-head fasteners along a rim: rows at y0 and y1 (and columns at the ends when tall), z at the rim face
function fasteners(bag, mat, x0, x1, ys, z, pitch = 0.45) {
  const n = Math.max(2, Math.round((x1 - x0) / pitch) + 1);
  for (const y of ys) for (let i = 0; i < n; i++) bag.add(mat, _screw, tr(x0 + (x1 - x0) * (i / (n - 1)), y, z + 0.0025));
}

const _bulbPaths = new Map();
const _bulb = new THREE.IcosahedronGeometry(1, 1);
const _socket = new THREE.CylinderGeometry(1, 1, 1, 8, 1); _socket.rotateX(Math.PI / 2);
// ---------------------------------------------------------------- glyph outlines -> extruded letters
const _fonts = new Map(), _glyphs = new Map();
function fontOf(fi) {
  const j = outlineOf(fi); if (!j) return null;
  if (!_fonts.has(fi.outline)) _fonts.set(fi.outline, new Font(j));
  return _fonts.get(fi.outline);
}
// one glyph at 1 em, extruded to depth 1: { cap (front face at z = 1), side (the returns, z 0..1), w (advance, em) }.
// bold (em, AR34 w2 r2): the outline grown outward by that much (ExtrudeGeometry's bevel offset with a zero-size bevel),
// for a wordmark heavier than the library's heaviest weight (Popeyes' letters against Baloo 2 Bold)
function glyphGeo(fi, ch, seg, bold = 0) {
  const b = Math.max(0, Math.min(0.06, +bold || 0));
  const key = fi.outline + '|' + ch + '|' + seg + (b ? '|' + b : '');
  if (_glyphs.has(key)) return _glyphs.get(key);
  const font = fontOf(fi), j = outlineOf(fi);
  const gl = j && j.glyphs[ch];
  let out = { cap: null, side: null, adv: gl ? gl.ha / j.resolution : 0.3 };
  if (font && gl && gl.o) {
    const shapes = font.generateShapes(ch, 1);
    if (shapes.length) {
      const g = new THREE.ExtrudeGeometry(shapes, b ? { depth: 1, bevelEnabled: true, bevelThickness: 1e-4, bevelSize: 0, bevelOffset: b, bevelSegments: 1, curveSegments: seg }
        : { depth: 1, bevelEnabled: false, curveSegments: seg });
      out = { ...out, ...splitExtrude(g) };
      g.dispose();
    }
  }
  _glyphs.set(key, out);
  return out;
}
// ExtrudeGeometry: group 0 = the caps (front z = depth, back z = 0), group 1 = the sides
function splitExtrude(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const cap = { p: [], n: [], u: [] }, side = { p: [], n: [], u: [] };
  for (const gr of g.groups) {
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      let tgt;
      if (gr.materialIndex === 0) {
        const zAvg = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        if (zAvg < 0.5) continue;       // the back cap sits against the wall: dropped
        tgt = cap;
      } else tgt = side;
      for (let v = i; v < i + 3; v++) {
        tgt.p.push(pos.getX(v), pos.getY(v), pos.getZ(v)); tgt.n.push(nor.getX(v), nor.getY(v), nor.getZ(v)); tgt.u.push(uv.getX(v), uv.getY(v));
      }
    }
  }
  const mk = (s) => { if (!s.p.length) return null; const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3)); b.setAttribute('normal', new THREE.Float32BufferAttribute(s.n, 3)); b.setAttribute('uv', new THREE.Float32BufferAttribute(s.u, 2)); return b; };
  return { cap: mk(cap), side: mk(side) };
}
// lay out lines of text as glyph placements: [{ ch, x, y (baseline), s (em -> m) }], fitted into w x h (metres)
function layoutGlyphs(fi, L, w, h, { fill = 0.7, tracking = 0, align = 'center', lead = 1.4, italic = false } = {}) {
  const j = outlineOf(fi); if (!j) return null;
  const R = j.resolution, capK = (j.capHeight || j.ascender * 0.7) / R, kern = j.kern || {};
  const n = L.length;
  const lineW = (s) => {
    let x = 0, xMin = 1e9, xMax = -1e9;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], g = j.glyphs[ch] || j.glyphs['?'];
      if (!g) continue;
      xMin = Math.min(xMin, x + g.x_min / R); xMax = Math.max(xMax, x + g.x_max / R);
      x += g.ha / R + tracking + (i + 1 < s.length ? (kern[ch + s[i + 1]] || 0) / R : 0);
    }
    return { adv: x, ink0: xMin > 1e8 ? 0 : xMin, ink1: xMax < -1e8 ? x : xMax };
  };
  let ch = (h * fill) / (n + (n - 1) * (lead - 1));
  let s = ch / capK;
  let wMax = 0;
  const ws = L.map(lineW);
  for (const q of ws) wMax = Math.max(wMax, q.ink1 - q.ink0);
  const slant = italic ? 0.21 * capK : 0;
  if ((wMax + slant) * s > w) s = w / (wMax + slant);
  ch = s * capK;
  const pitch = ch * lead, blockH = ch + (n - 1) * pitch;
  const y0 = (h - blockH) / 2 + (n - 1) * pitch;      // baseline of the first (top) line
  const out = [];
  for (let li = 0; li < n; li++) {
    const str = L[li], q = ws[li], inkW = (q.ink1 - q.ink0) * s;
    let x = align === 'left' ? 0 : align === 'right' ? w - inkW : (w - inkW) / 2;
    x -= q.ink0 * s;
    const yb = y0 - li * pitch;
    for (let i = 0; i < str.length; i++) {
      const c = str[i], g = j.glyphs[c] || j.glyphs['?'];
      if (!g) continue;
      out.push({ ch: j.glyphs[c] ? c : '?', x, y: yb, s });
      x += (g.ha / R + tracking + (i + 1 < str.length ? (kern[c + str[i + 1]] || 0) / R : 0)) * s;
    }
  }
  return { glyphs: out, s, ch, blockH, wInk: wMax * s };
}

// lines of styled runs -> glyph placements [{ ch, fi, run, x, y, s, adv }], every run at one cap height per line
// (run.scale multiplies it), fitted into w x h; returns the line boxes too (for raceways)
// sy: the letters stretched vertically by this factor (a sign's scaleY; the glyphs' sy is their vertical scale)
function layoutRuns(RL, w, h, { fill = 0.7, align = 'center', lead = 1.35, sy = 1 } = {}) {
  const n = RL.length;
  for (const line of RL) for (const r of line) if (!outlineOf(r.fi)) return null;
  const capOf = (fi) => { const j = outlineOf(fi); return (j.capHeight || j.ascender * 0.7) / j.resolution; };
  // widths at cap height 1
  const measure = (line) => {
    let x = 0, first = true; const parts = [];
    for (const r of line) {
      const j = outlineOf(r.fi), R = j.resolution, sc = (r.scale || 1) / capOf(r.fi), kern = j.kern || {};
      x += (r.gap || 0) * sc;
      const str = String(r.text || '');
      const gl = [];
      for (let i = 0; i < str.length; i++) {
        const c = str[i], g = j.glyphs[c] || j.glyphs['?'];
        if (!g) continue;
        if (first && g.o) { x -= g.x_min / R * sc; first = false; }
        gl.push({ ch: j.glyphs[c] ? c : '?', x, s: sc, adv: g.ha / R * sc });
        x += (g.ha / R + (r.tracking || 0) + (i + 1 < str.length ? (kern[c + str[i + 1]] || 0) / R : 0)) * sc;
      }
      const last = gl[gl.length - 1];
      parts.push({ r, gl, slant: r.fi.synthItalic ? 0.21 * (r.scale || 1) : 0 });
      if (last) { const g = j.glyphs[last.ch]; last.inkEnd = last.x + g.x_max / R * sc; }
    }
    let end = 0; for (const p of parts) for (const g of p.gl) end = Math.max(end, g.inkEnd ?? g.x + g.adv);
    end += Math.max(0, ...parts.map((p) => p.slant));
    return { parts, W: end };
  };
  const M = RL.map(measure);
  sy = Math.max(0.5, Math.min(2, +sy || 1));
  let ch = (h * fill) / (n + (n - 1) * (lead - 1)) / sy;
  const wMax = Math.max(...M.map((m) => m.W));
  if (wMax * ch > w) ch = w / wMax;
  const cv = ch * sy;                     // the letters' cap height (ch: the width's)
  const pitch = cv * lead, blockH = cv + (n - 1) * pitch;
  const yTop = (h - blockH) / 2 + (n - 1) * pitch;
  const glyphs = [], lines = [];
  M.forEach((m, li) => {
    const lw = m.W * ch;
    const xl = align === 'left' ? 0 : align === 'right' ? w - lw : (w - lw) / 2;
    const yb = yTop - li * pitch;
    lines.push({ x: xl, w: lw, yb });
    for (const p of m.parts) for (const g of p.gl) glyphs.push({ ch: g.ch, fi: p.r.fi, run: p.r, x: xl + g.x * ch, y: yb + (p.r.dy || 0) * cv, s: g.s * ch, sy: g.s * cv, adv: g.adv * ch });
  });
  return { glyphs, lines, ch: cv, blockH };
}

// ---------------------------------------------------------------- the kinds
const KIND_DEF = {
  panel: { depth: 0.08, lit: 'none', frame: '#2a2b2d', fill: 0.58 },
  lightbox: { depth: 0.22, lit: 'face', frame: '#1e1f21', fill: 0.56 },
  channel: { depth: 0.1, lit: 'face', fill: 0.78 },
  blade: { depth: 0.16, lit: 'face', frame: '#1e1f21', fill: 0.5 },
  painted: { depth: 0, lit: 'none', fill: 0.7 },
  numbers: { depth: 0.012, lit: 'none', fill: 0.9 },
  plaque: { depth: 0.012, lit: 'none', fill: 0.3 },
  neon: { depth: 0.05, lit: 'neon', fill: 0.72 },
  marquee: { depth: 1.5, lit: 'face', frame: '#1e1f21', fill: 0.6 },
  led: { depth: 0.06, lit: 'face', frame: '#141516', fill: 0.7 },
  banner: { depth: 0.01, lit: 'none', fill: 0.6 },
};

export function buildSign(sign, opts = {}) {
  const s = sign || {};
  const kind = KIND_DEF[s.kind] ? s.kind : 'panel';
  const D = KIND_DEF[kind];
  const W = Math.max(0.05, (s.u1 ?? 1) - (s.u0 ?? 0)), H = Math.max(0.03, s.h ?? 0.8);
  const group = new THREE.Group();
  group.name = `ar33sign:${kind}:${String(s.text || (s.lines || []).join(' ')).slice(0, 24)}`;
  group.userData.sign = s;
  const fi = parseFont(s.font || DEFAULT_FONT, s.italic);
  // push-through letters on lit panels are geometry too (their outlines), unless the panel carries a mark or Arabic
  const txt0 = [s.text, ...(s.lines || []), ...(s.runs || []).map((r) => r.text)].filter((x) => typeof x === 'string').join('');
  const wantPush = kind === 'panel' && (s.lit || D.lit) === 'face' && !opts.logo && s.push !== false && !ARABIC.test(txt0) && txt0.trim().length > 0;
  const needOutline = (kind === 'channel' || (kind === 'numbers' && !s.onGlass) || wantPush) && !ARABIC.test(txt0);
  const ctx = { s, W, H, D, fi, seed: opts.seed ?? hashStr(group.name), logo: opts.logo || null, wantPush };
  const run = () => {
    try {
      if (kind === 'panel') buildPanel(group, ctx);
      else if (kind === 'lightbox') buildLightbox(group, ctx);
      else if (kind === 'blade') buildBlade(group, ctx);
      else if (kind === 'painted') buildPainted(group, ctx);
      else if (kind === 'numbers' && s.onGlass) buildPainted(group, ctx);   // vinyl or gold-leaf numbers on the transom glass
      else if ((kind === 'channel' || kind === 'numbers') && ARABIC.test(txt0)) buildPainted(group, ctx);   // Arabic letters: the outlines are unshaped, so they paint
      else if (kind === 'channel' || kind === 'numbers') buildChannel(group, ctx);
      else if (kind === 'plaque') buildPlaque(group, ctx);
      else if (kind === 'neon') buildNeon(group, ctx);
      else if (kind === 'marquee') buildMarquee(group, ctx);
      else if (kind === 'led') buildLed(group, ctx);
      else if (kind === 'banner') buildBanner(group, ctx);
    } catch (e) { console.warn('[ar33 signs] build failed', group.name, e); }
  };
  // fonts: build now if they are in, else when they land (the object is returned at once and fills in)
  const fis = [fi];
  for (const r of s.runs || []) fis.push(parseFont(r.font || s.font || DEFAULT_FONT, r.italic));
  if (s.sub && s.sub.font) fis.push(parseFont(s.sub.font));
  // a mark drawer may name the fonts it sets text in: fn.fonts = ['Lato-900', ...] (canvas only)
  const lfis = (opts.logo && Array.isArray(opts.logo.fonts) ? opts.logo.fonts : []).map((n) => parseFont(n));
  const allText = [s.text, ...(s.lines || []), ...(s.runs || []).map((r) => r.text), s.sub && (s.sub.text || s.sub)].filter((x) => typeof x === 'string').join(' ');
  if (ARABIC.test(allText)) lfis.push(parseFont(ARABIC_FONT));
  const inNow = fis.every((f) => fontReady(f) && (!needOutline || outlineOf(f))) && lfis.every((f) => fontReady(f));
  if (inNow) run();
  else {
    const p = Promise.all([...fis.map((f) => Promise.all([loadFont(f), needOutline ? loadOutline(f) : null])), ...lfis.map((f) => loadFont(f))]).then(run);
    _pending.add(p); p.finally(() => _pending.delete(p));
  }
  return group;
}
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296 * 1000; }
// resolves when every sign built so far has its geometry (for tools and tests)
export function signsSettled() { return Promise.all([..._pending]).then(() => true); }
// Merge placed signs into one mesh per shared material (frames, returns, trims, tubes, bulbs share materials across
// signs; each face keeps its own). objs: sign objects with their final matrices (matrixWorld is used). Returns a Group
// in the objs' parent space (world when they have no parent). A sign still filling in (fonts late) is merged when it
// is complete: call after signsSettled().
// (AR34 w2 r2) painted-metal parts (returns, trims, frames, cabinets, raceways, brackets, fasteners) of every colour merge
// into one mesh per finish (metalness, roughness), their colours in the vertices: s313 had 40 metal draw calls in view,
// one per colour per tile. `sgcell=<m>` also splits the groups by a cell of that size (fewer triangles drawn when only
// part of a tile is in view, more draw calls): measured 2026-10-02 (docs/notes/ar33-signs.md), the whole tile (0, the
// default) has the fewest sign draws in every view (bway26n 470 -> 302, s313 108 -> 84, N243w_sq 37 -> 25) for +0.03 to
// +0.35 M sign triangles. URL flags for A/B: sgvc=0 keeps one mesh per colour, sgmerge=0 no merge at all.
const URLQ = (() => { try { return new URLSearchParams(globalThis.location?.search || ''); } catch (e) { return new URLSearchParams(''); } })();
const SGVC = URLQ.get('sgvc') !== '0', SGMERGE = URLQ.get('sgmerge') !== '0';
const SGGVC = SGVC && URLQ.get('sggvc') !== '0';     // (AR34 w2 s3) `sggvc=0`: the glow parts merged per glow material, as before
const SGCELL = Math.max(0, +(URLQ.get('sgcell') ?? 0) || 0);
// (AR34 w2 s3) the faces' atlas: a tile's sign faces (each its own canvas texture, one draw call each: 357 of the sign draws
// at qc_lenox) are copied into a few atlas pages, one-ink masks into R8 pages and coloured faces into RGBA pages, and drawn
// with one material per page and variant (lit / decal, side, shadow); their terms are already in their vertices. Each slot
// is aligned to 16 px with at least 8 px of the face's border pixels round it, so bilinear samples of mip levels 0-4 never
// mix two faces (a face's edge sits on the centre of its level-4 texel; as the face's own clamp-to-edge texture); pages of
// at most 4096 px. `sgatlas=0`: one mesh per face, as before.
const SGATLAS = URLQ.get('sgatlas') !== '0';
const AT_G = 8, AT_MAX = 4096;
const up16 = (v) => Math.ceil(v / 16) * 16;
let _atlas = { pages: 0, bytes: 0, faces: 0, facePx: 0, pagePx: 0, shadePages: 0 };
export function signAtlasStats() { return { pages: _atlas.pages, mb: +(_atlas.bytes / 1048576).toFixed(1), faces: _atlas.faces, faceMpx: +(_atlas.facePx / 1e6).toFixed(1), pageMpx: +(_atlas.pagePx / 1e6).toFixed(1), shadePages: _atlas.shadePages }; }
// shelves, tallest first, in pages w wide (at most AT_MAX tall): the pages' heights
function shelfPack(items, w) {
  const pages = [];
  let pg = null;
  for (const it of items) {
    if (pg && pg.x + it.sw > w) { pg.y += pg.shelf; pg.x = 0; pg.shelf = 0; }
    if (!pg || pg.y + it.sh > AT_MAX) { pg = { x: 0, y: 0, shelf: 0, items: [] }; pages.push(pg); }
    it.x = pg.x; it.y = pg.y; it.pg = pg; pg.x += it.sw; pg.shelf = Math.max(pg.shelf, it.sh); pg.items.push(it);
  }
  return pages;
}
function atlasable(mat, gg) {
  const t = mat && mat.userData && mat.userData.sgFace && mat.map;
  if (!t || !t.isDataTexture || !t.image || !t.image.data || !gg.attributes.sgRect) return false;
  const { width: w, height: h } = t.image;
  if (w + 2 * AT_G > AT_MAX || h + 2 * AT_G > AT_MAX) return false;
  return mat.userData.sgFace === 'mask' ? t.format === THREE.RedFormat && t.image.data.length === w * h : t.format === THREE.RGBAFormat && t.image.data.length === w * h * 4;
}
// copy a face (w x h, ch bytes a pixel, GL rows: row 0 at the bottom) into its slot [x, x + sw) x [y, y + sh) of a page
// PW wide, at (x + AT_G, y + AT_G), the rest of the slot filled with its edge pixels
function blit(D, PW, ch, S, w, h, x, y, sw, sh) {
  const dx = x + AT_G, dy = y + AT_G, gl = AT_G, gr = sw - w - AT_G;
  for (let r = 0; r < h; r++) {
    const src = r * w * ch, row = ((dy + r) * PW + dx) * ch;
    D.set(S.subarray(src, src + w * ch), row);
    for (let c = 0; c < ch; c++) {
      const a = S[src + c], b = S[src + (w - 1) * ch + c];
      for (let g = 1; g <= gl; g++) D[row - g * ch + c] = a;
      for (let g = 0; g < gr; g++) D[row + (w + g) * ch + c] = b;
    }
  }
  const len = sw * ch, at = (rr) => ((dy + rr) * PW + x) * ch;
  for (let g = 1; g <= AT_G; g++) D.copyWithin(at(-g), at(0), at(0) + len);
  for (let g = 0; g < sh - h - AT_G; g++) D.copyWithin(at(h + g), at(h - 1), at(h - 1) + len);
}
function atlasFaces(faces, out) {
  const groups = new Map();
  for (const cls of ['mask', 'face']) {
    const ch = cls === 'mask' ? 1 : 4;
    const list = faces.filter((f) => f.mat.userData.sgFace === cls);
    if (!list.length) continue;
    const slots = new Map();
    for (const f of list) { const t = f.mat.map; if (!slots.has(t)) slots.set(t, { t, w: t.image.width, h: t.image.height, sw: up16(t.image.width + 2 * AT_G), sh: up16(t.image.height + 2 * AT_G) }); }
    const items = [...slots.values()].sort((a, b) => b.sh - a.sh || b.sw - a.sw);
    // the page width with the least page area (shelves, tallest first), from the widest slot up to AT_MAX
    const wide = items.reduce((v, it) => Math.max(v, it.sw), 0);
    let PW = wide, best = Infinity;
    for (let w = wide; w <= AT_MAX; w += w < 1024 ? 64 : 256) {
      const ps = shelfPack(items, w), a = ps.reduce((v, p) => v + w * up16(p.y + p.shelf), 0);
      if (a < best - 1) { best = a; PW = w; }
    }
    const pages = shelfPack(items, PW);
    for (const it of items) _atlas.facePx += it.w * it.h;
    for (const p of pages) {
      const PH = up16(p.y + p.shelf), D = new Uint8Array(PW * PH * ch);
      for (const it of p.items) blit(D, PW, ch, it.t.image.data, it.w, it.h, it.x, it.y, it.sw, it.sh);
      const t = new THREE.DataTexture(D, PW, PH, ch === 1 ? THREE.RedFormat : THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = ch === 1 ? THREE.NoColorSpace : THREE.SRGBColorSpace; if (ch === 1) t.unpackAlignment = 1;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; t.needsUpdate = true;
      p.tex = t; p.PH = PH; p.mats = new Map();
      _atlas.pages++; _atlas.bytes += D.length * 1.33; _atlas.pagePx += PW * PH;
    }
    for (const f of list) {
      const it = slots.get(f.mat.map), p = it.pg;
      const rect = [(it.x + AT_G) / PW, (it.y + AT_G) / p.PH, it.w / PW, it.h / p.PH];
      const a = f.gg.attributes.sgRect;
      for (let i = 0; i < a.count; i++) a.setXYZW(i, rect[0] + a.getX(i) * rect[2], rect[1] + a.getY(i) * rect[3], a.getZ(i) * rect[2], a.getW(i) * rect[3]);
      const decal = !!f.mat.transparent, side = f.mat.side;
      const mk = `${decal ? 'd' : 'l'}|${side}`;
      if (!p.mats.has(mk)) {
        const m = cls === 'mask' ? maskFaceMat(p.tex, { decal, side }) : faceMat(p.tex, { mode: decal ? 'decal' : 'lit', side });
        m.name += 'A';
        p.mats.set(mk, m);
      }
      const mat = p.mats.get(mk), gk = mat.uuid + '|' + (f.cast ? 1 : 0);
      if (!groups.has(gk)) groups.set(gk, { mat, cast: f.cast, gs: [] });
      groups.get(gk).gs.push(f.gg);
      _atlas.faces++;
    }
  }
  for (const e of groups.values()) {
    const merged = e.gs.length === 1 ? e.gs[0] : mergeGeometries(e.gs, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, e.mat);
    mesh.name = e.mat.name; mesh.castShadow = e.cast; mesh.receiveShadow = !e.mat.transparent;
    out.add(mesh);
  }
  // the faces' own textures and materials are drawn no more
  const done = new Set();
  for (const f of faces) if (!done.has(f.mat)) { done.add(f.mat); f.mat.map.dispose(); f.mat.dispose(); }
}
// the shade quads' canvases (GPU canvases, never read back) drawn into page canvases on a black field (no shadow, no glow:
// as their own edges), 16 px aligned slots with 8 px round each; one material per page
function atlasShades(list, out) {
  const slots = new Map();
  for (const f of list) { const t = f.mat.map; if (!slots.has(t)) slots.set(t, { t, w: t.image.width, h: t.image.height, sw: up16(t.image.width + 2 * AT_G), sh: up16(t.image.height + 2 * AT_G) }); }
  const items = [...slots.values()].sort((a, b) => b.sh - a.sh || b.sw - a.sw);
  const wide = items.reduce((v, it) => Math.max(v, it.sw), 0);
  let PW = wide, best = Infinity;
  for (let w = wide; w <= AT_MAX; w += w < 1024 ? 64 : 256) {
    const ps = shelfPack(items, w), a = ps.reduce((v, p) => v + w * up16(p.y + p.shelf), 0);
    if (a < best - 1) { best = a; PW = w; }
  }
  const pages = shelfPack(items, PW);
  for (const p of pages) {
    const PH = up16(p.y + p.shelf), cv = mkCanvas(PW, PH), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
    for (const it of p.items) g.drawImage(it.t.image, it.x + AT_G, it.y + AT_G);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
    p.tex = t; p.PH = PH; p.mat = shadeMat(t, '#000000', 0, 0); p.mat.name += 'A';
    _atlas.shadePages++;
  }
  const groups = new Map();
  for (const f of list) {
    const it = slots.get(f.mat.map), p = it.pg;
    // a canvas texture is flipped (flipY): its rows count from the top
    const rect = [(it.x + AT_G) / PW, (p.PH - it.y - AT_G - it.h) / p.PH, it.w / PW, it.h / p.PH];
    const a = f.gg.attributes.sgRect;
    for (let i = 0; i < a.count; i++) a.setXYZW(i, rect[0] + a.getX(i) * rect[2], rect[1] + a.getY(i) * rect[3], a.getZ(i) * rect[2], a.getW(i) * rect[3]);
    if (!groups.has(p.mat)) groups.set(p.mat, []);
    groups.get(p.mat).push(f.gg);
  }
  for (const [mat, gs] of groups) {
    const merged = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = mat.name; mesh.castShadow = false; mesh.receiveShadow = false;
    out.add(mesh);
  }
  const done = new Set();
  for (const f of list) if (!done.has(f.mat)) { done.add(f.mat); f.mat.map.dispose(); f.mat.dispose(); }
}
export function mergeSigns(objs) {
  if (!SGMERGE) return null;
  const byMat = new Map();
  const faces = [], shades = [];
  for (const o of objs) {
    if (!o) continue;
    o.updateMatrixWorld(true);
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
      const gg = m.geometry.clone(); gg.applyMatrix4(m.matrixWorld);
      let mat = m.material;
      if (SGATLAS && atlasable(mat, gg)) { faces.push({ gg, mat, cast: m.castShadow }); return; }
      if (SGATLAS && mat && mat.userData && mat.userData.sgShadeQ && mat.map && mat.map.isCanvasTexture && mat.map.image && gg.attributes.sgRect
        && mat.map.image.width + 2 * AT_G <= AT_MAX && mat.map.image.height + 2 * AT_G <= AT_MAX) { shades.push({ gg, mat }); return; }
      if (SGGVC && mat && mat.name === 'ar33sign:glow' && mat.userData.sgGlow && !gg.index && gg.attributes.normal && gg.attributes.uv && Object.keys(gg.attributes).length === 3) {
        const G = mat.userData.sgGlow, n = gg.attributes.position.count;
        const put = (name, v) => { const a = new Float32Array(n * v.length); for (let i = 0; i < n; i++) a.set(v, i * v.length); gg.setAttribute(name, new THREE.BufferAttribute(a, v.length)); };
        put('color', G.col); put('sgLamp', G.em); put('sgP', [G.day, G.nd, 0, 0]);
        mat = glowVCMat(mat.roughness, mat.metalness);
      }
      if (SGVC && mat && mat.name === 'ar33sign:metal' && !gg.index && gg.attributes.normal && gg.attributes.uv && Object.keys(gg.attributes).length === 3) {
        const c = mat.color, n = gg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
        mat = metalVCMat(mat.metalness, mat.roughness);
      }
      let cell = '';
      if (SGCELL > 0) { gg.computeBoundingSphere(); const q = gg.boundingSphere.center; cell = Math.floor(q.x / SGCELL) + ',' + Math.floor(q.z / SGCELL); }
      if (!byMat.has(mat)) byMat.set(mat, new Map());
      const cells = byMat.get(mat);
      if (!cells.has(cell)) cells.set(cell, { gs: [], cast: false, name: m.name });
      const e = cells.get(cell); e.gs.push(gg); e.cast = e.cast || m.castShadow;
    });
  }
  const out = new THREE.Group(); out.name = 'ar33sign:merged';
  if (faces.length) atlasFaces(faces, out);
  if (shades.length) atlasShades(shades, out);
  for (const [mat, cells] of byMat) for (const e of cells.values()) {
    const merged = e.gs.length === 1 ? e.gs[0] : mergeGeometries(e.gs, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'ar33sign:' + (mat.name || 'part'); mesh.castShadow = e.cast; mesh.receiveShadow = !mat.transparent;
    out.add(mesh);
  }
  return out;
}

function litMode(s, D) { return s.lit || D.lit; }
function lampK(s, kind) { return s.temp || (kind === 'lightbox' ? 5000 : 6500); }

// -- panel: a routed aluminium face in an extruded frame with returns, fasteners on the rim
// can every character of the sign's main text be drawn from the outlines?
function outlinesCover(s, fi) {
  const parts = s.runs && s.runs.length ? s.runs.map((r) => [r.text, parseFont(r.font || s.font || DEFAULT_FONT, r.italic)]) : linesOf(s).map((l) => [l, fi]);
  for (const [txt, f] of parts) { const j = outlineOf(f); if (!j) return false; for (const ch of String(txt || '')) if (ch !== ' ' && !j.glyphs[ch]) return false; }
  return true;
}
function buildPanel(group, { s, W, H, D, fi, seed, logo, wantPush }) {
  const bag = new Bag();
  const d = s.depth ?? D.depth, fw = Math.min(0.05, H * 0.07, W * 0.07);
  const frameHex = hexOf(s.frame, shadeHex(hexOf(s.bg, D.frame), -0.35));
  const fm = metalMat(frameHex, 0.08, 0.42);             // painted extrusion: a paint film, not bare metal
  const lit = litMode(s, D);
  // the frame: a bevelled extrusion ring round the face, returns to the wall
  bag.add(fm, ring(W, H, fw, d, 0, 0, 0));
  bag.add(fm, box(W - 2 * fw, H - 2 * fw, 0.01, fw, fw, 0));                   // the back skin
  // the face: 3 mm routed aluminium set 6 mm behind the frame's front
  const [px, py, k] = pxFor(W - 2 * fw, H - 2 * fw);
  const bg = hexOf(s.bg, '#1b1b1b');
  const push = wantPush && lit === 'face' && outlinesCover(s, fi);
  // push-through: the field is painted without the main text (the letters are acrylic geometry through it); a sub line stays painted
  const paintSign = push ? { ...s, text: s.sub ? ' ' : '', lines: s.sub ? [' '] : null, runs: null, fill: s.fill ?? D.fill } : { ...s, fill: s.fill ?? D.fill };
  const faceM = signFace({ W: px, H: py, k, sign: paintSign, bg, logo, seed },
    { lit: lit === 'face' ? 'letters' : 'none', gain: 2.1, temp: lampK(s, 'panel'), rough: s.gloss ? 0.2 : 0.34, metal: 0.0 });
  bag.add(faceM, quad(W - 2 * fw, H - 2 * fw, fw, fw, d - 0.006));
  if (push) {
    // the same box the canvas lays the text in (paintFace), in metres on the face
    const FW = W - 2 * fw, FH = H - 2 * fw;
    const padX = Math.max(FH * 0.08, FW * 0.02), padY = FH * 0.12;
    let bw = FW - 2 * padX, bh = FH - 2 * padY, by = padY;
    if (s.sub) { const sh = bh * ((typeof s.sub === 'object' && s.sub.size) || 0.28); bh -= sh * 1.15; by += sh * 1.15; }
    const RL = s.runs && s.runs.length ? [s.runs.map((r) => ({ ...r, fi: parseFont(r.font || s.font || DEFAULT_FONT, r.italic) }))]
      : linesOf(s).map((l) => [{ text: l, fi, fg: s.fg, tracking: s.tracking || 0 }]);
    const lay = layoutRuns(RL, bw, bh, { fill: s.fill ?? D.fill, align: s.align || 'center', lead: s.lead || 1.45, sy: s.scaleY ?? 1 });
    if (lay) {
      const pd = s.pushDepth ?? 0.012, z0 = d - 0.006;
      const seg = lay.ch > 0.4 ? 8 : 6;
      const SHEAR = new THREE.Matrix4().set(1, 0.21, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      for (const gp of lay.glyphs) {
        const G = glyphGeo(gp.fi, gp.ch, seg); if (!G.cap) continue;
        const m = glowMat(hexOf(gp.run.fg || s.fg, '#ffffff'), { gain: s.gain ?? 2.0, temp: lampK(s, 'panel'), rough: 0.2, day: s.dayGlow ?? 0.06 });
        const base = new THREE.Matrix4().makeTranslation(fw + padX + gp.x, fw + by + gp.y, z0);
        if (gp.fi.synthItalic) base.multiply(SHEAR);
        bag.add(m, G.side, base.clone().multiply(M4().makeScale(gp.s, gp.sy ?? gp.s, pd)));
        bag.add(m, G.cap, base.clone().multiply(M4().makeScale(gp.s, gp.sy ?? gp.s, pd + 0.0005)));
      }
    }
  }
  // fasteners: pan heads along the rim, top and bottom
  const scr = fm;
  fasteners(bag, scr, fw * 1.6, W - fw * 1.6, [fw * 0.5, H - fw * 0.5], d, 0.5);
  return bag.build(group, group.name, new Set());
}

// -- lightbox: an extruded aluminium cabinet, a translucent face glowing evenly at night
function buildLightbox(group, { s, W, H, D, fi, seed, logo }) {
  const bag = new Bag();
  const d = s.depth ?? D.depth, rim = Math.min(0.045, H * 0.08, W * 0.08);
  const frameHex = hexOf(s.frame, D.frame);
  const fm = metalMat(frameHex, 0.08, 0.4);
  const lit = litMode(s, D);
  // (AR34 w2 r2) s.shape: 'pill' (round ends), 'oval' / 'round' (an ellipse, a circle when square), 'rounded' (corners of
  // s.radius m): the cabinet, the retainer and the face follow the outline; s.faceRough / s.matte: a matte face (a black
  // field that read teal by day in the sky's reflection at 0.22)
  const shp = s.shape === 'pill' || s.shape === 'oval' || s.shape === 'round' || s.shape === 'rounded' ? s.shape : null;
  if (shp) {
    const bev = Math.min(0.006, d / 4);
    const cab = new THREE.ExtrudeGeometry(outlineTo(new THREE.Shape(), shp, W, H, s.radius, 0), { depth: Math.max(0.002, d - 0.014 - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.5, bevelOffset: -bev * 0.5, bevelSegments: 2, curveSegments: 24 });
    cab.translate(0, 0, bev);
    bag.add(fm, cab);
    const rs = outlineTo(new THREE.Shape(), shp, W, H, s.radius, 0); rs.holes.push(outlineTo(new THREE.Path(), shp, W, H, s.radius, rim));
    const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.02, bevelEnabled: false, curveSegments: 24 }); rg.translate(0, 0, d - 0.02);
    bag.add(fm, rg);
  } else {
    bag.add(fm, slab(W, H, d - 0.014, 0, 0, 0, 0.02, 0.008));            // the cabinet
    bag.add(fm, ring(W, H, rim, 0.02, 0, 0, d - 0.02));                   // the retainer, 6 mm proud of the face
  }
  const [px, py, k] = pxFor(W - 2 * rim, H - 2 * rim);
  const bg = hexOf(s.bg, '#f4f4f0');
  // the lamps behind the face: rows every ~0.3 m (fluorescent at <= 5000 K, LED strips above), dimmer towards the rim
  const FWb = W - 2 * rim, FHb = H - 2 * rim;
  const fall = SG2 && s.fall !== 0 ? [s.fall ?? (lampK(s, 'lightbox') <= 5000 ? 1 : 0.7), FWb / FHb, Math.max(1, Math.round(FHb / 0.3))] : null;
  // a pill's text keeps clear of the round ends
  const padX = shp === 'pill' ? Math.min(FWb, FHb) * 0.42 * k : shp === 'oval' || shp === 'round' ? FWb * 0.16 * k : undefined;
  // s.inline: '#rrggbb' or { color, w (m), inset (m) }: a ring printed on the face following its outline
  const il = s.inline ? (typeof s.inline === 'string' ? { color: s.inline } : s.inline) : null;
  const inline = il ? { color: hexOf(il.color, '#ffffff'), w: Math.max(1, (il.w ?? Math.min(FWb, FHb) * 0.045) * k), inset: (il.inset ?? Math.min(FWb, FHb) * 0.1) * k,
    r: shp === 'pill' ? (Math.min(FWb, FHb) / 2 - (il.inset ?? Math.min(FWb, FHb) * 0.1)) * k : shp === 'rounded' ? Math.max(0, (s.radius ?? 0.1) - rim - (il.inset ?? 0)) * k : 0 } : null;
  const faceM = signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg, logo, seed, padX, inline },
    { lit: lit === 'none' ? 'none' : (s.blockout ? 'letters' : 'all'), gain: 1.7, temp: lampK(s, 'lightbox'), rough: s.faceRough ?? (s.matte ? 0.62 : 0.22), metal: 0, day: s.dayGlow ?? 0.05, fall });
  if (shp) {
    const fgeo = new THREE.ShapeGeometry(outlineTo(new THREE.Shape(), shp, W, H, s.radius, rim), 24);
    const pos = fgeo.attributes.position, uv = fgeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - rim) / FWb, (pos.getY(i) - rim) / FHb);
    fgeo.translate(0, 0, d - 0.012);
    bag.add(faceM, fgeo);
    return bag.build(group, group.name, new Set());
  }
  bag.add(faceM, quad(FWb, FHb, rim, rim, d - 0.012));
  if (SG2 && s.seams && FWb > 2.5) {
    // a pan face wider than a sheet (2.44 m) is two or more panels: an H-bar of the retainer's metal at each joint, 5 mm
    // proud of the face (opt-in: most wide boxes on 125th Street are flex faces without joints)
    const n = Math.ceil(FWb / 2.4);
    for (let i = 1; i < n; i++) bag.add(fm, box(0.028, FHb, 0.009, rim + FWb * i / n - 0.014, rim, d - 0.012));
  }
  // weep holes and the service screws on the retainer's bottom rail
  const scr = fm;
  fasteners(bag, scr, rim * 2, W - rim * 2, [rim * 0.5], d, 0.6);
  return bag.build(group, group.name, new Set());
}

// -- blade: a double-sided lightbox (or panel) on a steel bracket, projecting from the wall along +z
//    width (u1 - u0) is the blade's projection; it hangs in the plane x = 0, from z = gap to z = gap + width
function buildBlade(group, { s, W: W0, H, D, fi, seed, logo }) {
  const bag = new Bag();
  // the projection: sign.w, else u1 - u0 when it is a plausible blade width (a caller giving a 0.3 m slot gets 0.9 m)
  const W = s.w ?? (W0 >= 0.45 ? W0 : 0.9);
  const t = s.depth ?? D.depth, gap = s.proj ?? 0.18;
  const frameHex = hexOf(s.frame, D.frame);
  const fm = metalMat(frameHex, 0.08, 0.4);
  const steel = metalMat('#232527', 0.1, 0.5);
  const lit = litMode(s, D);
  const rim = Math.min(0.04, W * 0.07, H * 0.07);
  // the cabinet, built facing +z then turned so its faces look along +x and -x
  const inner = new Bag();
  inner.add(fm, slab(W, H, t, -W / 2, 0, -t / 2, 0.02, 0.007));
  const [px, py, k] = pxFor(W - 2 * rim, H - 2 * rim);
  const bg = hexOf(s.bg, '#f4f4f0');
  const neon = lit === 'neon';
  const faceM = neon ? metalMat(bg, 0.05, 0.55)
    : signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg, logo, seed },
      { lit: lit === 'none' ? 'none' : (s.blockout || s.kind2 === 'panel' ? 'letters' : 'all'), gain: 1.7, temp: lampK(s, 'lightbox'), rough: s.faceRough ?? (s.matte ? 0.62 : 0.24), day: s.dayGlow ?? 0.05 });
  inner.add(faceM, quad(W - 2 * rim, H - 2 * rim, -W / 2 + rim, rim, t / 2 + 0.001));
  // the far face reads left to right from its own side: the same art, mirrored geometry
  const back = quad(W - 2 * rim, H - 2 * rim, -W / 2 + rim, rim, 0, true); back.translate(0, 0, -t / 2 - 0.001);
  // mirror the UVs so the text is not reversed on the far side
  { const uv = back.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i)); }
  if ((s.sides ?? 2) > 1) inner.add(faceM, back);
  // turn: the cabinet's +z (its face normal) to +x; its width (x) runs out from the wall (+z world)
  const turn = M4().makeRotationY(-Math.PI / 2).premultiply(tr(0, 0, gap + W / 2));
  for (const [mat, gs] of inner.m) for (const g of gs) bag.add(mat, g, turn);
  if (neon) {
    // the tubes on each face, in the face's own frame: x along the face (-W/2 .. W/2 of the cabinet), z out of it
    const front = M4().makeTranslation(-W / 2, 0, t / 2).premultiply(turn);
    neonTubes(bag, { ...s, bg: null }, fi, D, W, H, 0, front);
    if ((s.sides ?? 2) > 1) { const backM = M4().makeRotationY(Math.PI).multiply(M4().makeTranslation(-W / 2, 0, t / 2)).premultiply(turn); neonTubes(bag, { ...s, bg: null }, fi, D, W, H, 0, backM); }
  }
  // the bracket: a wall plate and two arms (top and bottom), hanger rods through the cabinet's top rail
  const aY = [H + 0.05, Math.max(0.05, H * 0.1)];
  bag.add(steel, box(0.16, H * 0.9 + 0.2, 0.012, -0.08, -0.05, 0));
  bag.add(steel, box(0.04, 0.05, gap + W + 0.04, -0.02, aY[0] - 0.025, 0));
  if (H > 0.9) bag.add(steel, box(0.03, 0.03, gap, -0.015, aY[1] - 0.015, 0));
  for (const zc of [gap + 0.12, gap + W - 0.12]) bag.add(steel, box(0.012, 0.06, 0.012, -0.006, H - 0.005, zc - 0.006));
  return bag.build(group, group.name, new Set([fm, steel]));
}

// -- painted: letters on the wall or the glass (a decal 3 mm off the surface)
function buildPainted(group, { s, W, H, D, fi, seed, logo }) {
  const bag = new Bag();
  const [px, py, k] = pxFor(W, H, Math.max(SIGN_PPM, 320));
  const bg = s.bg ? hexOf(s.bg) : null;
  const lit = litMode(s, D);
  let m;
  if (bg) {
    // a painted field with letters (a sign board painted on the wall): opaque
    m = signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg, logo, seed, padY: 0.06, weather: false }, { lit: lit === 'face' ? 'letters' : 'none', gain: 1.2, rough: 0.7 });
  } else {
    m = signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg: null, logo, seed, padY: 0.06, weather: false, wear: s.worn || 0 }, { decal: true, lit: lit === 'face' ? 'letters' : 'none', gain: 1.2, rough: s.onGlass ? 0.15 : 0.6 });
  }
  bag.add(m, quad(W, H, 0, 0, s.onGlass ? 0.002 : 0.003));
  return bag.build(group, group.name);
}

// -- channel letters: extruded outlines, painted returns, trim caps, acrylic faces (face-lit) or metal faces on
//    stand-offs with a halo on the wall (halo-lit); a backer panel when bg is set, a raceway when raceway is set
function buildChannel(group, { s, W, H, D, fi, seed, logo }) {
  const bag = new Bag();
  const kind = s.kind === 'numbers' ? 'numbers' : 'channel';
  const lit = litMode(s, D);
  const halo = lit === 'halo';
  const depth = s.depth ?? (kind === 'numbers' ? 0.012 : Math.min(0.13, Math.max(0.05, H * 0.18)));
  const L = linesOf(s);
  let x0 = 0, y0 = 0, w = W, h = H, zBase = 0;
  // a backer panel behind the letters: a rectangle (ribbed with bgRibs: a slatted fascia), or cut to the letters' contour
  // (bgShape 'contour': the letters dilated by bgPad, the counters filled, as delis' cloud backers)
  const contour = !!s.bg && s.bgShape === 'contour';
  const cPad = contour ? (s.bgPad ?? Math.min(0.12, H * 0.1)) : 0;
  if (contour) { zBase = s.backerDepth ?? 0.03; x0 = cPad; y0 = cPad; w = W - 2 * cPad; h = H - 2 * cPad; }
  else if (s.bg) {
    const bm = metalMat(hexOf(s.bg), 0.06, 0.42);
    const bd = s.backerDepth ?? 0.05;
    bag.add(bm, slab(W, H, bd, 0, 0, 0, 0.01, 0.004));
    const scr = bm;
    fasteners(bag, scr, 0.05, W - 0.05, [0.03, H - 0.03], bd, 0.6);
    zBase = bd; x0 = Math.min(0.08, W * 0.04); y0 = H * 0.1; w = W - 2 * x0; h = H - 2 * y0;
    if (s.bgRibs) {
      // slats: a rib every bgRibs m (half of it proud, 14 mm), the shadow lines between them read from across the street
      const rp = Math.max(0.04, +s.bgRibs), rib = metalMat(shadeHex(hexOf(s.bg), 0.06), 0.1, 0.38);
      for (let ry = rp * 0.5; ry < H - rp * 0.4; ry += rp) bag.add(rib, box(W - 0.02, rp * 0.5, 0.014, 0.01, ry - rp * 0.25, bd));
      zBase = bd + 0.014;
    }
    if (logo) {
      const [px, py, k] = pxFor(W - 0.01, H - 0.01);
      const aC = READ_CPU && lit !== 'face' ? 0 : null;
      const paint = paintFace({ W: px, H: py, k, sign: s, bg: hexOf(s.bg), logo, lit: lit === 'face' ? 'letters' : 'none', seed, text: false, noMask: aC != null });
      bag.add(faceMat(packTexture(paint.rgb, paint.a, null, aC), { mode: 'lit', gain: lit === 'face' ? 1.8 : 0, rough: 0.34, metal: 0.2 }), quad(W - 0.01, H - 0.01, 0.005, 0.005, bd + 0.0006));
      // the letters keep clear of the mark
      const sq = Math.min(H * 0.76, W * 0.4) + x0;
      if ((s.logoAt || 'left') === 'right') w -= sq; else if ((s.logoAt || 'left') === 'left') { x0 += sq; w -= sq; }
    }
  }
  // (AR34 w2 r2) a mark beside letters that stand on the wall or on a contour backer: a raised plate cut to the mark's
  // own silhouette, its art on the face (before, the drawer was dropped unless the sign had a rectangular backer:
  // Beauty Supply's orange roundel never showed). logoScale sizes it against the sign's height, logoDepth its depth.
  const cast = new Set();
  let emb = null;
  const lAt = s.logoAt || 'left';
  if (logo && (!s.bg || contour) && lAt !== 'fill') {
    const sq = Math.min(H * (s.logoScale ?? 1), W * 0.4);
    const ex = lAt === 'right' ? W - sq : 0, ey = (H - sq) / 2;
    emb = emblem(bag, logo, ex, ey, sq, zBase, { depth: s.logoDepth ?? Math.min(0.08, Math.max(0.03, sq * 0.05)), lit: lit === 'face' ? 'face' : 'none', cast });
    if (emb) {
      const gap = sq * (s.logoGap ?? 0.1);
      if (lAt === 'right') w -= sq + gap - (contour ? cPad : 0); else { x0 = sq + gap; w -= sq + gap - (contour ? cPad : 0); }
    }
  }
  // runs: the line's styled parts (a single-style sign is one run per line). Bold letters (grown by `bold` em a side) get
  // twice that in tracking, so neighbours keep the font's own gaps (grown solids that touch z-fight on their faces)
  const bo = (r) => 2 * Math.max(0, Math.min(0.06, +(r.bold ?? s.bold ?? 0) || 0));
  const RL = s.runs && s.runs.length ? [s.runs.map((r) => ({ ...r, tracking: (r.tracking || 0) + bo(r), fi: parseFont(r.font || s.font || DEFAULT_FONT, r.italic) }))]
    : L.map((t) => [{ text: t, fi, fg: s.fg, tracking: (s.tracking || 0) + bo(s) }]);
  const lay = layoutRuns(RL, w, h, { fill: s.fill ?? (s.bg ? 0.7 : D.fill), align: s.align || 'center', lead: s.lead || 1.35, sy: s.scaleY ?? 1 });
  if (!lay) return group;
  if (contour) contourBacker(bag, lay, x0, y0, W, H, cPad, zBase, s);
  if (s.raceway) {
    const rm = metalMat(hexOf(s.raceway), 0.06, 0.45);
    const rh = Math.max(0.12, lay.ch * 0.3), rd = 0.1;
    for (const ln of lay.lines) {
      const rw = Math.min(w, ln.w + 0.1);
      const rx = x0 + ln.x + (ln.w - rw) / 2, ry = y0 + ln.yb + lay.ch * 0.5 - rh / 2;
      bag.add(rm, slab(rw, rh, rd, rx, ry, zBase, 0.005, 0.003));
      if (SG2) {
        // end caps (a shade darker, 6 mm proud all round), the lid's screws along the top, a wall clip each metre
        const cap = metalMat(shadeHex(hexOf(s.raceway), -0.18), 0.06, 0.5);
        for (const ex of [rx - 0.006, rx + rw - 0.016]) bag.add(cap, slab(0.022, rh + 0.012, rd + 0.006, ex, ry - 0.006, zBase, 0.003, 0.002));
        fasteners(bag, cap, rx + 0.08, rx + rw - 0.08, [ry + rh * 0.82], zBase + rd, 0.6);
        for (let cx = rx + 0.3; cx < rx + rw - 0.2; cx += 1.0) bag.add(cap, box(0.03, 0.02, 0.012, cx, ry - 0.02, zBase));
      }
    }
    zBase += 0.1;
  }
  const standoff = halo ? (s.standoff ?? 0.04) : 0;
  const trimD = kind === 'numbers' || halo ? 0 : Math.min(0.022, depth * 0.25);
  const matsOf = new Map();
  const runMats = (r) => {
    const fg = fadeHex(hexOf(r.fg || s.fg, '#ffffff'), +(s.fade || 0));
    const k = fg + '|' + (r.ret || s.ret) + '|' + (r.trim || s.trim);
    if (matsOf.has(k)) return matsOf.get(k);
    const retHex = hexOf(r.ret || s.ret, halo ? fg : (kind === 'numbers' ? fg : shadeHex(fg, lum(fg) > 0.5 ? -0.25 : -0.1)));
    const trimHex = hexOf(r.trim || s.trim, lit === 'face' ? shadeHex(fg, -0.08) : retHex);
    const metalFace = halo || kind === 'numbers' || (lit === 'none' && s.metal);
    const faceM = lit === 'face' && !s.bulbs ? glowMat(fg, { gain: s.gain ?? 2.0, temp: lampK(s, 'channel'), rough: 0.22, day: s.dayGlow ?? 0.08 })
      : metalMat(fg, metalFace ? 0.75 : 0.04, metalFace ? 0.3 : 0.3);
    // returns: painted aluminium coil (a paint film: dielectric), trim caps: coloured plastic
    const M = { faceM, retM: metalMat(retHex, 0.06, 0.38), trimM: metalMat(trimHex, 0.0, 0.3) };
    if (depth > 0.03) { cast.add(M.faceM); cast.add(M.retM); cast.add(M.trimM); }
    matsOf.set(k, M);
    return M;
  };
  const seg = lay.ch > 0.5 ? 10 : lay.ch > 0.25 ? 7 : 5;
  const SHEAR = new THREE.Matrix4().set(1, 0.21, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const palAt = new Map();      // fgs: a colour per letter, cycled (Party City's letters each in their own colour)
  for (const gp of lay.glyphs) {
    const G = glyphGeo(gp.fi, gp.ch, seg, gp.run.bold ?? s.bold ?? 0);
    if (!G.cap) continue;
    const pal = gp.run.fgs || s.fgs;
    let rr = gp.run;
    if (Array.isArray(pal) && pal.length) { const i = palAt.get(gp.run) || 0; palAt.set(gp.run, i + 1); rr = { ...gp.run, fg: pal[i % pal.length] }; }
    const { faceM, retM, trimM } = runMats(rr);
    const sc = gp.s, scy = gp.sy ?? gp.s;
    const base = new THREE.Matrix4().makeTranslation(x0 + gp.x, y0 + gp.y, zBase + standoff);
    if (gp.fi.synthItalic) base.multiply(SHEAR);
    bag.add(retM, G.side, base.clone().multiply(M4().makeScale(sc, scy, depth - trimD)));
    if (trimD > 0) bag.add(trimM, G.side, base.clone().multiply(tr(0, 0, depth - trimD)).multiply(M4().makeScale(sc, scy, trimD)));
    bag.add(faceM, G.cap, base.clone().multiply(M4().makeScale(sc, scy, depth + 0.0008)));
  }
  // bulb letters (marquee style): lamps along each letter's centreline on its face, lit after dark (2700 K)
  if (s.bulbs) {
    const bulbM = glowMat(s.bulbColor || '#ffe2a8', { gain: s.bulbGain ?? 3.2, temp: 2700, rough: 0.08, dayCol: '#efe9dc', day: 0.04 });
    const sockM = metalMat('#2a2724', 0.1, 0.5);
    const r = s.bulbR ?? Math.max(0.012, lay.ch * 0.034), pitch = s.bulbPitch ?? Math.max(r * 3.2, lay.ch * 0.15);
    for (const gp of lay.glyphs) {
      if (gp.ch === ' ') continue;
      const key = gp.fi.outline + '|' + gp.ch;
      let S = _bulbPaths.get(key);
      if (!S) { const j = outlineOf(gp.fi), gl = j && j.glyphs[gp.ch]; S = gl ? glyphStrokes(gl.o, j.resolution, gl.ha) : []; _bulbPaths.set(key, S); }
      for (const st of S) for (const [ex, ey] of resample(st.pts, pitch / gp.s, st.closed)) {
        const gy = gp.sy ?? gp.s, x = x0 + gp.x + ex * gp.s + (gp.fi.synthItalic ? 0.21 * ey * gy : 0), y = y0 + gp.y + ey * gy, z = zBase + standoff + depth;
        bag.add(sockM, _socket, M4().compose(new THREE.Vector3(x, y, z + r * 0.35), new THREE.Quaternion(), new THREE.Vector3(r * 1.25, r * 1.25, r * 0.7)));
        bag.add(bulbM, _bulb, M4().compose(new THREE.Vector3(x, y, z + r * 1.1), new THREE.Quaternion(), new THREE.Vector3(r, r, r)));
      }
    }
  }
  // stand-off pins under halo letters, and the halo itself on the wall
  if (halo) {
    const pin = metalMat('#6d7072', 0.8, 0.35);
    const pinG = new THREE.CylinderGeometry(0.005, 0.005, standoff, 6); pinG.rotateX(Math.PI / 2);
    for (const gp of lay.glyphs) { if (gp.ch === ' ') continue; bag.add(pin, pinG, tr(x0 + gp.x + gp.adv * 0.4, y0 + gp.y + lay.ch * 0.5, zBase + standoff / 2)); }
    bag.add(haloMat(glyphGlow(lay, x0, y0, W, H, lay.ch * 0.5, 0.12), s.halo || '#ffffff', s.haloGain ?? 1.4), quad(W + lay.ch, H + lay.ch, -lay.ch * 0.5, -lay.ch * 0.5, zBase + 0.002));
  } else if (SG2 && s.shade !== false && depth > 0.006) {
    // what the letters do to the surface behind them, in one pass: a contact shadow by day (soft, dropped a little:
    // the light comes from above), the spill of a face-lit letter's colour after dark. On a raceway the surface is the
    // wall (or the backer) behind it, and the letters stand further out.
    const spill = lit === 'face' && !s.bulbs && s.spill !== false && depth > 0.03;
    const zs = zBase - (s.raceway ? 0.1 : 0), stand = depth + (s.raceway ? 0.1 : 0);
    const soft = 0.012 + stand * 0.5, drop = stand * 0.55;
    const pad = spill ? lay.ch * 0.9 : Math.max(0.06, soft * 3 + drop);
    const fgc = hexOf((s.runs && s.runs[0] && s.runs[0].fg) || s.fg, '#ffffff');
    const tex = glyphShade(lay, x0, y0, W, H, pad, { soft, drop, glow: spill ? 0.38 : 0, more: emb ? emb.loops : null });
    bag.add(shadeMat(tex, fgc, spill ? (s.spillGain ?? 0.22) : 0, s.shadeK ?? (kind === 'numbers' ? 0.32 : 0.42)), quad(W + 2 * pad, H + 2 * pad, -pad, -pad, zs + 0.002));
  } else if (lit === 'face' && !s.bulbs && s.spill !== false && depth > 0.03) {
    // face-lit letters throw a little of their colour on the wall or backer round them after dark
    const fgc = hexOf((s.runs && s.runs[0] && s.runs[0].fg) || s.fg, '#ffffff');
    bag.add(haloMat(glyphGlow(lay, x0, y0, W, H, lay.ch * 0.9, 0.38), fgc, s.spillGain ?? 0.22), quad(W + lay.ch * 1.8, H + lay.ch * 1.8, -lay.ch * 0.9, -lay.ch * 0.9, zBase + 0.002));
  }
  return bag.build(group, group.name, cast);
}

// the laid-out glyphs as Path2D in canvas pixels (canvas over [-pad, W + pad] x [-pad, H + pad] m at kx, ky px per m)
function layPaths(lay, x0, y0, H, pad, kx, ky) {
  const out = [];
  for (const gp of lay.glyphs) {
    const j = outlineOf(gp.fi), gl = j && j.glyphs[gp.ch];
    if (!gl || !gl.o) continue;
    const sc = gp.s / j.resolution, scy = (gp.sy ?? gp.s) / j.resolution, sh = gp.fi.synthItalic ? 0.21 : 0;
    const X = (fx, fy) => (pad + x0 + gp.x + fx * sc + sh * fy * scy) * kx, Y = (fy) => (pad + H - (y0 + gp.y + fy * scy)) * ky;
    const tk = gl.o.split(' '), p = new Path2D();
    for (let i = 0; i < tk.length;) {
      const cmd = tk[i++];
      if (cmd === 'm') { p.moveTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'l') { p.lineTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'q') { p.quadraticCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 4; }
      else if (cmd === 'b') { p.bezierCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i + 4], +tk[i + 5]), Y(+tk[i + 5]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 6; }
      else i++;
    }
    out.push(p);
  }
  return out;
}
// a backer cut round the letters: their outlines grown by pad (round joins), traced (signNeon's contour tracer), the
// counters dropped, extruded bd deep with a small bevel, in the backer's colour
function contourBacker(bag, lay, x0, y0, W, H, pad, bd, s) {
  const k = Math.max(40, Math.min(140, 110 / Math.max(0.15, lay.ch)));
  const px = Math.min(3000, Math.round(W * k)), py = Math.min(3000, Math.round(H * k));
  const kx = px / W, ky = py / H;
  const paths = layPaths(lay, x0, y0, H, 0, kx, ky);
  const loops = neonContours((c) => {
    c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 2 * pad * Math.min(kx, ky);
    for (const p of paths) { c.fill(p, 'nonzero'); c.stroke(p); }
  }, px, py, { inset: 0, minLen: 10, eps: 0.9, smooth: 2 });
  if (!loops.length) return;
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const A = loops.map((l) => area(l.pts));
  const big = A.reduce((m, a, i) => (Math.abs(a) > Math.abs(A[m]) ? i : m), 0), sg = Math.sign(A[big]);
  const bm = metalMat(hexOf(s.bg), 0.06, 0.42);
  const bev = Math.min(0.004, bd / 4);
  for (let i = 0; i < loops.length; i++) {
    if (Math.sign(A[i]) !== sg) continue;                       // a counter (hole): the backer fills it
    const sh = new THREE.Shape(loops[i].pts.map(([x, y]) => new THREE.Vector2(x / kx, H - y / ky)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.002, bd - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 2 });
    g.translate(0, 0, bev);
    bag.add(bm, g);
  }
}
// a raised plate cut to a mark's silhouette (the drawer's coverage on a transparent canvas, traced with signNeon's
// contour tracer, counters filled), `depth` deep at (x, y, z) in the sign's frame, size x size m: the art on the front
// (its colours bled past the cut so the edge shows no fringe), the returns in the mark's rim colour a shade darker.
// Returns { loops } (the outline in the sign's metres, for the contact shadow), null when the drawer paints nothing.
function emblem(bag, logo, x, y, size, z, { depth = 0.04, lit = 'none', cast = null } = {}) {
  const N = Math.max(128, Math.min(1024, Math.round(size * SIGN_PPM * 1.5)));
  const cv = mkCanvas(N, N, true), g = cv.getContext('2d');
  try { logo(g, N, N); } catch (e) { console.warn('[ar33 signs] logo drawer failed', e && e.message); return null; }
  const cov = mkCanvas(N, N, true), cg = cov.getContext('2d');
  cg.drawImage(cv, 0, 0); cg.globalCompositeOperation = 'source-in'; cg.fillStyle = '#fff'; cg.fillRect(0, 0, N, N);
  const loops0 = neonContours((c) => c.drawImage(cov, 0, 0), N, N, { inset: 0, minLen: 12, eps: 0.7, smooth: 2 });
  if (!loops0.length) return null;
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const A = loops0.map((l) => area(l.pts));
  const big = A.reduce((m, a, i) => (Math.abs(a) > Math.abs(A[m]) ? i : m), 0), sgn = Math.sign(A[big]);
  const outer = loops0.filter((l, i) => Math.sign(A[i]) === sgn && Math.abs(A[i]) > N * N * 0.002);
  // holes the mark leaves open (Chase's square, a ring) stay open: each goes to the outline that holds it
  const inside = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const holesOf = new Map();
  loops0.forEach((l, i) => {
    if (Math.sign(A[i]) === sgn || Math.abs(A[i]) < N * N * 0.002) return;
    const host = outer.find((o) => inside(o.pts, l.pts[0][0], l.pts[0][1]));
    if (host) { if (!holesOf.has(host)) holesOf.set(host, []); holesOf.get(host).push(l); }
  });
  // the rim colour: the opaque pixels near the silhouette's edge, averaged
  const d = g.getImageData(0, 0, N, N).data, st = Math.max(2, Math.round(N * 0.02));
  const al = (xx, yy) => (xx < 0 || yy < 0 || xx >= N || yy >= N ? 0 : d[(yy * N + xx) * 4 + 3]);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let yy = 0; yy < N; yy += 2) for (let xx = 0; xx < N; xx += 2) {
    const i = (yy * N + xx) * 4;
    if (d[i + 3] < 200) continue;
    if (al(xx - st, yy) > 40 && al(xx + st, yy) > 40 && al(xx, yy - st) > 40 && al(xx, yy + st) > 40) continue;
    r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
  }
  const rim = n ? '#' + [r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('') : '#8a8a86';
  const rgb = mkCanvas(N, N, true), rc = rgb.getContext('2d');
  rc.fillStyle = rim; rc.fillRect(0, 0, N, N); rc.drawImage(cv, 0, 0);
  const msk = mkCanvas(N, N, true), mc = msk.getContext('2d');
  mc.fillStyle = '#000'; mc.fillRect(0, 0, N, N);
  if (lit === 'face') mc.drawImage(cov, 0, 0);
  const faceM = faceMat(packTexture(rgb, msk), { mode: 'lit', gain: lit === 'face' ? 1.8 : 0, rough: 0.3, dayGlow: lit === 'face' ? 0.05 : 0 });
  const retM = metalMat(shadeHex(rim, -0.22), 0.06, 0.4);
  const loops = [];
  for (const l of outer) {
    const shape = new THREE.Shape(l.pts.map(([px, py]) => new THREE.Vector2(px / N, 1 - py / N)));
    for (const hl of holesOf.get(l) || []) shape.holes.push(new THREE.Path(hl.pts.map(([px, py]) => new THREE.Vector2(px / N, 1 - py / N))));
    const eg = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    const { cap, side } = splitExtrude(eg); eg.dispose();
    const base = tr(x, y, z);
    if (side) bag.add(retM, side, base.clone().multiply(M4().makeScale(size, size, depth)));
    if (cap) bag.add(faceM, cap, base.clone().multiply(M4().makeScale(size, size, depth + 0.0008)));
    loops.push(l.pts.map(([px, py]) => [x + (px / N) * size, y + (1 - py / N) * size]));
  }
  if (cast && depth > 0.03) { cast.add(faceM); cast.add(retM); }
  return loops.length ? { loops } : null;
}
// a blurred mask of laid-out glyphs on a canvas covering [-pad, W + pad] x [-pad, H + pad] m; blur = share of cap height
function glyphGlow(lay, x0, y0, W, H, pad, blur) {
  const k = Math.max(24, Math.min(96, 48 / Math.max(0.2, lay.ch)));
  const px = Math.min(2048, Math.round((W + 2 * pad) * k)), py = Math.min(2048, Math.round((H + 2 * pad) * k));
  const kx = px / (W + 2 * pad), ky = py / (H + 2 * pad);
  const cv = mkCanvas(px, py), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, px, py);
  c.filter = `blur(${Math.max(1.5, lay.ch * ky * blur).toFixed(1)}px)`;
  c.fillStyle = '#fff';
  for (const gp of lay.glyphs) {
    const j = outlineOf(gp.fi), gl = j && j.glyphs[gp.ch];
    if (!gl || !gl.o) continue;
    const sc = gp.s / j.resolution, scy = (gp.sy ?? gp.s) / j.resolution, sh = gp.fi.synthItalic ? 0.21 : 0;
    const X = (fx, fy) => (pad + x0 + gp.x + fx * sc + sh * fy * scy) * kx, Y = (fy) => (pad + H - (y0 + gp.y + fy * scy)) * ky;
    const tk = gl.o.split(' '), p = new Path2D();
    for (let i = 0; i < tk.length;) {
      const cmd = tk[i++];
      if (cmd === 'm') { p.moveTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'l') { p.lineTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'q') { p.quadraticCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 4; }
      else if (cmd === 'b') { p.bezierCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i + 4], +tk[i + 5]), Y(+tk[i + 5]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 6; }
      else i++;
    }
    c.fill(p, 'nonzero');
  }
  c.filter = 'none';
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
// the canvas of shadeMat over [-pad, W + pad] x [-pad, H + pad] m: R = the contact shadow (the glyphs blurred by `soft` m
// and dropped `drop` m), G = the spill glow (blurred `glow` x cap height); data, not colour (no sRGB decode)
function glyphShade(lay, x0, y0, W, H, pad, { soft, drop, glow, more = null }) {
  const k = Math.max(32, Math.min(128, 64 / Math.max(0.2, lay.ch)));
  const px = Math.min(2048, Math.round((W + 2 * pad) * k)), py = Math.min(2048, Math.round((H + 2 * pad) * k));
  const kx = px / (W + 2 * pad), ky = py / (H + 2 * pad);
  const cv = mkCanvas(px, py), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, px, py);
  const paths = [];
  // other raised parts' outlines (an emblem plate: loops of [x, y] in the sign's metres) shade the wall as the letters do
  for (const P of more || []) {
    const p = new Path2D();
    P.forEach(([x, y], i) => { const X = (pad + x) * kx, Y = (pad + H - y) * ky; if (i) p.lineTo(X, Y); else p.moveTo(X, Y); });
    p.closePath(); paths.push(p);
  }
  for (const gp of lay.glyphs) {
    const j = outlineOf(gp.fi), gl = j && j.glyphs[gp.ch];
    if (!gl || !gl.o) continue;
    const sc = gp.s / j.resolution, scy = (gp.sy ?? gp.s) / j.resolution, sh = gp.fi.synthItalic ? 0.21 : 0;
    const X = (fx, fy) => (pad + x0 + gp.x + fx * sc + sh * fy * scy) * kx, Y = (fy) => (pad + H - (y0 + gp.y + fy * scy)) * ky;
    const tk = gl.o.split(' '), p = new Path2D();
    for (let i = 0; i < tk.length;) {
      const cmd = tk[i++];
      if (cmd === 'm') { p.moveTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'l') { p.lineTo(X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 2; }
      else if (cmd === 'q') { p.quadraticCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 4; }
      else if (cmd === 'b') { p.bezierCurveTo(X(+tk[i + 2], +tk[i + 3]), Y(+tk[i + 3]), X(+tk[i + 4], +tk[i + 5]), Y(+tk[i + 5]), X(+tk[i], +tk[i + 1]), Y(+tk[i + 1])); i += 6; }
      else i++;
    }
    paths.push(p);
  }
  // the shadow: a tight core under the letter (ambient occlusion) and a softer drop below it
  c.globalCompositeOperation = 'lighter';
  for (const [blur, dy, a] of [[soft * 0.45, drop * 0.4, 0.55], [soft * 1.3, drop, 0.45]]) {
    c.save(); c.filter = `blur(${Math.max(0.8, blur * ky).toFixed(1)}px)`; c.translate(0, dy * ky);
    c.fillStyle = `rgba(255,0,0,${a})`;
    for (const p of paths) c.fill(p, 'nonzero');
    c.restore();
  }
  if (glow > 0) {
    c.save(); c.filter = `blur(${Math.max(1.5, lay.ch * ky * glow).toFixed(1)}px)`; c.fillStyle = '#00ff00';
    for (const p of paths) c.fill(p, 'nonzero');
    c.restore();
  }
  c.filter = 'none'; c.globalCompositeOperation = 'source-over';
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.NoColorSpace; tx.anisotropy = 4;
  return tx;
}
// -- plaque: a cast bronze plate with a bevelled edge and raised letters (the letters polished lighter)
function buildPlaque(group, { s, W, H, D, fi, seed, logo }) {
  const bag = new Bag();
  const d = s.depth ?? D.depth;
  const base = hexOf(s.bg, '#5a4630');
  const fm = metalMat(base, 0.85, 0.42);
  bag.add(fm, slab(W, H, d, 0, 0, 0, 0.004, Math.min(0.004, d / 3)));
  const [px, py, k] = pxFor(W, H, 640);
  const paint = paintFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill, fg: hexOf(s.fg, '#c9a86a') }, bg: base, logo, lit: 'none', seed, weather: false, padY: 0.1, noMask: READ_CPU });
  const tex = packTexture(paint.rgb, null);
  bag.add(faceMat(tex, { mode: 'lit', gain: 0, rough: 0.38, metal: 0.8 }), quad(W - 0.01, H - 0.01, 0.005, 0.005, d + 0.0005));
  return bag.build(group, group.name);
}

// -- neon: glass tubes along the letters' centrelines (signNeon.js: the text drawn in the sign's font, thinned and
//    traced), on GTO supports off a backer (bg), a raceway, or the wall; electrodes at the ends; a glow on what is behind
function textDrawer(s, fi, D, box) {
  return (c) => {
    if (s.runs && s.runs.length) {
      const runs = s.runs.map((r) => ({ ...r, fi: parseFont(r.font || s.font || DEFAULT_FONT, r.italic), color: '#fff' }));
      runs.forEach((r) => { r.italic = r.fi.synthItalic; });
      drawRuns(c, box, runs, { fill: s.fill ?? D.fill, align: s.align || 'center', maskColor: '#fff' });
    } else drawText(c, box, { lines: linesOf(s), fi, fill: s.fill ?? (linesOf(s).length > 1 ? null : D.fill), tracking: s.tracking || 0, align: s.align || 'center', italic: fi.synthItalic, color: '#fff', lead: s.lead });
  };
}
// tubes for a face W x H (metres) into bag, in the face's frame (x along, y up, z out from zb); place = an extra matrix
function neonTubes(bag, s, fi, D, W, H, zb, place = null, logo = null) {
  const color = hexOf(s.fg, '#ff2a1a');
  const nL = s.runs ? 1 : Math.max(1, linesOf(s).length);
  const k = Math.max(80, Math.min(700, 150 / (H / nL)));          // ~150 px a line
  let px = Math.round(W * k), py = Math.round(H * k);
  const kk = px > 4096 ? 4096 / px : 1; px = Math.round(px * kk); py = Math.round(py * kk);
  const K = k * kk;
  const pad = 0.04 * K;
  // the shape the tubes follow: the text, or a drawer's painted shape (its coverage: any colour on a transparent canvas)
  const shape = logo ? (c, w, h) => {
    const tmp = mkCanvas(w, h, true), tc = tmp.getContext('2d');
    try { logo(tc, w, h); } catch (e) { console.warn('[ar33 signs] neon drawer failed', e && e.message); }
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = '#fff'; tc.fillRect(0, 0, w, h);
    c.drawImage(tmp, 0, 0);
  } : textDrawer(s, fi, D, [pad, pad, px - 2 * pad, py - 2 * pad]);
  // along: 'centre' (one tube down each stroke) or 'outline' (tubes round each letter, inset from its edge)
  const S = s.along === 'outline' ? neonContours(shape, px, py, { inset: Math.max(1, Math.round((s.inset ?? 0.025) * K)), minLen: 0.05 * K })
    : joinStrokes(neonStrokes(shape, px, py, { minLen: 0.03 * K, eps: 0.8, smooth: 2, spur: 0.16 * py / nL }), 3);
  const r = s.tube ?? 0.0065, so = s.standoff ?? 0.035;
  const dayHex = s.dayColor || shadeHex(color, 0.62);
  // dayGlow > 0: the tubes are on by day as well (many shops leave them on): the glass shows its lit colour, not pale
  const dayOn = +(s.dayGlow || 0) > 0;
  const tubeM = glowMat(color, { gain: s.gain ?? (SG2 ? 4.6 : 3.4), temp: 6500, rough: 0.12, dayCol: dayOn ? color : dayHex, nightDiffuse: 0.08, day: dayOn ? +s.dayGlow : 0 });
  const dark = metalMat('#141414', 0.2, 0.6);
  const clear = metalMat('#9aa3a8', 0.1, 0.25);
  const P = place || M4();
  const toM = (p) => new THREE.Vector3(p[0] / K, H - p[1] / K, zb + so);
  const ends = [];
  let total = 0;
  for (const st of S) {
    const pts = st.pts.map(toM);
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts, st.closed, 'centripetal');
    const L = curve.getLength(); total += L;
    const g = new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(L / 0.012)), r, 6, st.closed);
    bag.add(tubeM, g, P);
    if (!st.closed) ends.push(pts[0], pts[pts.length - 1]);
    // GTO supports every 0.3 m: a clear post from the backer to the tube
    for (let d = 0.15; d < L - 0.1; d += 0.3) {
      const q = curve.getPointAt(d / L);
      const post = new THREE.CylinderGeometry(0.004, 0.005, so, 5); post.rotateX(Math.PI / 2); post.translate(q.x, q.y, zb + so / 2);
      bag.add(clear, post, P);
    }
  }
  // electrode housings: black boots where each tube turns back through the backer
  for (const e of ends) {
    const boot = new THREE.CylinderGeometry(0.011, 0.011, so + 0.004, 8); boot.rotateX(Math.PI / 2); boot.translate(e.x, e.y, zb + so / 2);
    bag.add(dark, boot, P);
  }
  // the glow on the backer: the strokes, blurred, additive after dark
  const gk = 48, gp = 0.25;
  const gw = Math.round((W + 2 * gp) * gk), gh = Math.round((H + 2 * gp) * gk);
  const cv = mkCanvas(Math.min(2048, gw), Math.min(2048, gh)), c = cv.getContext('2d');
  const sx = cv.width / gw, sy = cv.height / gh;
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  c.save(); c.scale(sx, sy);
  c.filter = SG2 ? 'blur(9px)' : 'blur(6px)'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = (SG2 ? 0.06 : 0.05) * gk;
  for (const st of S) {
    c.beginPath();
    st.pts.forEach((p, i) => { const x = (p[0] / K + gp) * gk, y = (p[1] / K + gp) * gk; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    if (st.closed) c.closePath();
    c.stroke();
  }
  c.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  bag.add(haloMat(t, color, s.glow ?? (SG2 ? 1.4 : 0.9)), quad(W + 2 * gp, H + 2 * gp, -gp, -gp, zb + 0.003), P);
  return { strokes: S.length, length: total };
}
function buildNeon(group, { s, W, H, D, fi, seed, logo }) {
  const bag = new Bag();
  let zb = 0;
  if (s.bg) {
    const bm = metalMat(hexOf(s.bg), 0.06, 0.5);
    zb = s.backerDepth ?? 0.04;
    bag.add(bm, slab(W, H, zb, 0, 0, 0, 0.01, 0.004));
  } else if (s.raceway) {
    const rm = metalMat(hexOf(s.raceway), 0.06, 0.45);
    bag.add(rm, slab(W * 0.96, Math.min(0.14, H * 0.2), 0.08, W * 0.02, H * 0.4, 0, 0.005, 0.003));
    zb = 0.08;
  }
  const info = neonTubes(bag, s, fi, D, W, H, zb, null, logo);
  group.userData.neon = info;
  return bag.build(group, group.name, new Set());
}

// -- led: a dot-matrix message board (shop windows, pharmacies, check cashers): a thin black cabinet, LEDs at `pitch` (m,
//    default 0.01) lit in `fg` where the text falls (the text drawn one pixel per LED), on by day too; a lens grid of dark
//    dots where they are off. Far away the dots fade to their average so the grid does not shimmer.
function ledMat(tex, { color, dots, gain = 2.2 }) {
  const c = col(color);
  const m = LT(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0 }));
  const U = { sgNight: ENV.night, sgDots: { value: new THREE.Vector2(dots[0], dots[1]) }, sgLed: { value: new THREE.Vector3(c.r * gain, c.g * gain, c.b * gain) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sgNight; uniform vec2 sgDots; uniform vec3 sgLed;')
      .replace('#include <map_fragment>', `
        vec2 sgG = vMapUv * sgDots, sgC = ( floor( sgG ) + 0.5 ) / sgDots;
        float sgOnL = textureGrad( map, sgC, dFdx( vMapUv ), dFdy( vMapUv ) ).r;
        float sgAA = clamp( 1.6 - 1.2 * max( length( fwidth( sgG.x ) ), length( fwidth( sgG.y ) ) ), 0.0, 1.0 );
        float sgDot = mix( 0.36, smoothstep( 0.46, 0.26, length( fract( sgG ) - 0.5 ) ), sgAA );
        diffuseColor.rgb = mix( vec3( 0.012 ), vec3( 0.05 ), sgDot );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += sgLed * sgOnL * sgDot * mix( 1.0, 1.6, smoothstep( 0.12, 0.55, sgNight ) );`)
      .replace('#include <fog_fragment>', `${EASE}\n#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'ar33sgLED';
  m.name = 'ar33sign:led';
  return m;
}
function buildLed(group, { s, W, H, D, fi }) {
  const bag = new Bag();
  const d = s.depth ?? D.depth, rim = Math.min(0.03, H * 0.1);
  const fm = metalMat(hexOf(s.frame, D.frame), 0.1, 0.45);
  bag.add(fm, slab(W, H, d, 0, 0, 0, 0.008, 0.004));
  const pitch = s.pitch ?? 0.01, FW = W - 2 * rim, FH = H - 2 * rim;
  const nx = Math.max(8, Math.min(2048, Math.round(FW / pitch))), ny = Math.max(5, Math.min(512, Math.round(FH / pitch)));
  const cv = mkCanvas(nx, ny, true), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, nx, ny);
  if (fontReady(fi)) drawText(c, [1, 1, nx - 2, ny - 2], { lines: linesOf(s), fi, fill: s.fill ?? D.fill, tracking: s.tracking || 0.06, align: s.align || 'center', italic: fi.synthItalic, color: '#fff', lead: s.lead });
  const tex = packMask(cv);
  tex.magFilter = THREE.NearestFilter;
  bag.add(ledMat(tex, { color: hexOf(s.fg, '#ff3a1a'), dots: [nx, ny], gain: s.gain ?? 3.6 }), quad(FW, FH, rim, rim, d + 0.0005));
  return bag.build(group, group.name, new Set());
}

// -- banner: a vinyl banner tied to the wall at grommets (GRAND OPENING, sale banners): the cloth bellies out between
//    the ties and creases towards the corners, matte vinyl, no frame; grommets every ~0.6 m along the top and bottom hems
function buildBanner(group, { s, W, H, D, seed, logo }) {
  const bag = new Bag();
  const [px, py, k] = pxFor(W, H);
  const faceM = signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg: hexOf(s.bg, '#f4f4f2'), logo, seed, padY: 0.12 },
    { lit: 'none', gain: 0, rough: 0.62, metal: 0 });
  const nx = Math.max(8, Math.min(96, Math.round(W / 0.08))), ny = Math.max(3, Math.min(24, Math.round(H / 0.08)));
  const g = new THREE.PlaneGeometry(W, H, nx, ny); g.translate(W / 2, H / 2, 0);
  const R = rng((seed || 5) * 3.1 + 2), pos = g.attributes.position;
  const pitch = W / Math.max(1, Math.round(W / 0.6)), amp = s.slack ?? Math.min(0.035, H * 0.05);
  const p1 = R() * 6.28, p2 = R() * 6.28, lam = 0.35 + R() * 0.25;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), v = y / H;
    const between = Math.sin(Math.PI * ((x / pitch) % 1));                  // 0 at a tie, 1 midway
    const belly = Math.sin(Math.PI * v);                                    // the hems are held, the middle bellies
    const crease = Math.sin((x + y * 0.8) / lam * 6.2832 + p1) * Math.sin((x - y * 0.6) / (lam * 1.7) * 6.2832 + p2);
    pos.setZ(i, 0.006 + amp * (0.55 * belly + 0.35 * between * belly + 0.25 * crease * belly));
  }
  g.computeVertexNormals();
  bag.add(faceM, g);
  const grom = new THREE.TorusGeometry(0.011, 0.0035, 5, 10);
  const gm = metalMat('#c9c9c4', 0.85, 0.35);
  for (let x = Math.min(0.05, W * 0.1); x <= W - Math.min(0.05, W * 0.1) + 1e-6; x += Math.max(0.1, (W - 2 * Math.min(0.05, W * 0.1)) / Math.max(1, Math.round(W / 0.6)))) {
    for (const y of [H - 0.035, 0.035]) bag.add(gm, grom, tr(x, y, 0.008));
  }
  return bag.build(group, group.name, new Set());
}

// -- marquee (generic): a projecting box, lettered front and ends, bulbs under the soffit
function buildMarquee(group, { s, W, H, D, fi, seed, logo }) {
  // a theatre marquee: a box projecting P from the wall, its front and both ends lettered (reader boards or the
  // name), chrome bands top and bottom, a soffit of lamps under it; hung on two chains or rods to the wall above
  const bag = new Bag();
  const P = s.proj ?? D.depth;
  const fm = metalMat(hexOf(s.frame, D.frame), 0.08, 0.4);
  const chrome = metalMat('#c9ccd0', 0.9, 0.18);
  const bandH = Math.min(0.12, H * 0.1);
  bag.add(fm, slab(W, H, P, 0, 0, 0, 0.02, 0.01));
  bag.add(chrome, box(W + 0.02, bandH, P + 0.02, -0.01, H - bandH, 0));
  bag.add(chrome, box(W + 0.02, bandH, P + 0.02, -0.01, 0, 0));
  const fh = H - 2 * bandH - 0.04;
  const bg = hexOf(s.bg, '#f2efe6');
  const [px, py, k] = pxFor(W - 0.1, fh);
  const faceM = signFace({ W: px, H: py, k, sign: { ...s, fill: s.fill ?? D.fill }, bg, logo, seed }, { lit: s.lit === 'none' ? 'none' : 'all', gain: 1.5, temp: 4000, rough: 0.25 });
  bag.add(faceM, quad(W - 0.1, fh, 0.05, bandH + 0.02, P + 0.001));
  // the ends: the same lettering at the ends' width (P)
  if (P > 0.4) {
    const [ex, ey, ek] = pxFor(P - 0.1, fh);
    const endM = signFace({ W: ex, H: ey, k: ek, sign: { ...s, fill: (s.fill ?? D.fill) * 0.9 }, bg, logo: null, seed: seed + 1 }, { lit: s.lit === 'none' ? 'none' : 'all', gain: 1.5, temp: 4000, rough: 0.25 });
    const L = quad(P - 0.1, fh, 0, 0, 0); L.rotateY(-Math.PI / 2); L.translate(-0.001, bandH + 0.02, P - 0.05);
    const R = quad(P - 0.1, fh, 0, 0, 0); R.rotateY(Math.PI / 2); R.translate(W + 0.001, bandH + 0.02, 0.05);
    bag.add(endM, L); bag.add(endM, R);
  }
  // the soffit: rows of lamps (2700 K), lit after dark
  const bulbM = glowMat('#fff0d0', { gain: 2.6, temp: 2700, rough: 0.1, dayCol: '#efe9dc', day: 0.03 });
  const pitch = 0.3, r = 0.025;
  for (let z = 0.25; z < P - 0.1; z += pitch) for (let x = 0.2; x < W - 0.1; x += pitch) {
    bag.add(bulbM, _bulb, M4().compose(new THREE.Vector3(x, -r * 0.4, z), new THREE.Quaternion(), new THREE.Vector3(r, r, r)));
  }
  // the hangers: two rods from the top corners back to the wall 1 m up
  const rod = metalMat('#2a2c2e', 0.3, 0.5);
  for (const x of [0.15, W - 0.15]) {
    const len = Math.hypot(P - 0.15, 1.0);
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 6); g.translate(0, len / 2, 0);
    g.rotateX(-Math.atan2(P - 0.15, 1.0) - Math.PI);
    g.translate(x, H + 1.0, 0);
    bag.add(rod, g);
  }
  return bag.build(group, group.name, new Set([fm, chrome]));
}

// ---------------------------------------------------------------- 2D preview (tools: the sign sheets without WebGL)
// A sign's face as the kit paints it, on canvases: { day, mask, W, H } (mask = what glows after dark). Channel letters and
// neon are shown as their letters on the backer (or a wall grey). Await loadSignFonts / the drawer's fonts first.
export function previewFace(sign, opts = {}, ppm = 96) {
  const s = sign || {};
  const kind = KIND_DEF[s.kind] ? s.kind : 'panel';
  const D = KIND_DEF[kind];
  const W = Math.max(0.05, (s.u1 ?? 1) - (s.u0 ?? 0)), H = Math.max(0.03, s.h ?? 0.8);
  const px = Math.max(8, Math.round(W * ppm)), py = Math.max(8, Math.round(H * ppm));
  const bgDef = { panel: '#1b1b1b', lightbox: '#f4f4f0', blade: '#f4f4f0', marquee: '#f2efe6', plaque: '#5a4630', channel: '#6b6862', numbers: '#6b6862', painted: '#8a857c', neon: '#141414' }[kind];
  const lit = litMode(s, D);
  const litMode2 = lit === 'none' ? 'none' : (kind === 'lightbox' || kind === 'blade' || kind === 'marquee') && !s.blockout ? 'all' : 'letters';
  const p = paintFace({ W: px, H: py, k: ppm, sign: { ...s, fill: s.fill ?? D.fill }, bg: hexOf(s.bg, bgDef), logo: opts.logo || null, lit: litMode2, seed: opts.seed || 1, weather: false });
  return { day: p.rgb, mask: p.a, W, H, kind, lit };
}

// ---------------------------------------------------------------- textures for awnings, vinyl, banners
// spec = { text | lines, font, fg, bg (null = transparent), w, h (metres; w omitted = from the text), ppm, fill, align,
//          tracking, italic, caps, stroke, sub, lit: 'none' | 'letters' | 'all' }
// map: sRGB, straight alpha (the ink's coverage when bg is null); emissiveMap: the lit parts (null when unlit)
export function textTexture(spec = {}) {
  const fi = parseFont(spec.font || DEFAULT_FONT, spec.italic);
  const h = spec.h ?? 0.3;
  let w = spec.w;
  const L = linesOf(spec);
  if (!w) {
    // measure at the target cap height
    const probe = mkCanvas(8, 8, true).getContext('2d');
    const capH = h * (spec.fill ?? 0.62) * 256;
    setFont(probe, fi, capH / 0.72, spec.tracking || 0);
    let mw = 0; for (const s of L) mw = Math.max(mw, probe.measureText(s).width);
    w = Math.max(h, mw / 256 + h * 0.3);
  }
  const [px, py, k] = pxFor(w, h, spec.ppm || SIGN_PPM);
  const lit = spec.lit || 'none';
  const make = () => paintFace({ W: px, H: py, k, sign: { ...spec, lines: L, fill: spec.fill ?? 0.62 }, bg: spec.bg ? hexOf(spec.bg) : null, logo: spec.logo || null,
    lit: spec.bg ? (lit === 'all' ? 'all' : 'letters') : 'coverage', seed: spec.seed || 3, padY: spec.padY ?? 0.1, weather: false });
  let p = make();
  const alphaMask = spec.bg ? null : p.a;
  const map = packTexture(p.rgb, alphaMask);
  let emissiveMap = null;
  const emi = () => {
    if (lit === 'none') return null;
    // the lit parts in their own colour on black
    const cv = mkCanvas(px, py, true), c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, px, py);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(p.rgb, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.drawImage(p.a, 0, 0);
    return cv;
  };
  const ecv = emi();
  if (ecv) { emissiveMap = packTexture(ecv, null); }
  // the fonts were not in yet: repaint in place once they are (never shown in a fallback face: blank until then)
  if (!fontReady(fi)) {
    loadFont(fi).then(() => {
      p = make();
      packTexture(p.rgb, spec.bg ? null : p.a, map);
      const e2 = emi(); if (e2 && emissiveMap) packTexture(e2, null, emissiveMap);
    });
  }
  return { map, emissiveMap, aspect: w / h, w, h };
}

// ---------------------------------------------------------------- the list of font names, for the notes and tests
export function fontList() {
  return import('./signFonts.js').then((m) => m.SIGN_FONTS.map((F) => ({ key: F.key, weights: Object.keys(F.outlines), licence: F.licence })));
}
