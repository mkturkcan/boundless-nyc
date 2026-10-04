// AR33 HPT: the Pepsi-Cola sign assembled from its parts (hptSignGrid.js steel, hptSignFaceGeo.js letters, neon and bottle) with
// PBR materials (hptSignMats.js) and the night look: the neon tubes lit from dusk (ENV.night 0.12 -> 0.5), the bottle and the
// lettering's faces faintly lit, the steel and columns faintly red. Everything is built into a temporary group, so a failure
// leaves the caller free to fall back to the AR32 sign (hptSignKit.js buildSign).
import * as THREE from 'three';
import { ENV, applyLightTrim as LT } from '../world/materials.js';
import { SIGN } from './hptSignData.js';
import { hmat } from './hptSignMats.js';
import { buildGrid } from './hptSignGrid.js';
import { lettersGeometry, bottleGeometry, neonLoops, bottleNeonLoop, neonGeometry, glowRibbon } from './hptSignFaceGeo.js';
import { BOT } from './hptSignStrokes.js';

const NEON_ON = 'clamp((kNight - 0.12) / 0.38, 0.0, 1.0)';
// a fragment patch chained after whatever the material already does: `glsl` runs after the emissive chunk (uniform kNight in scope)
export function nightPatch(mat, key, glsl) {
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.kNight = ENV.night;
    if (!/uniform float kNight;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glsl}`);
  };
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|' + key;
  mat.needsUpdate = true;
  return mat;
}

// AR34: the albedo dimmed after dusk (the night trim raises every diffuse; the faces must read dark between the tubes, as the
// photographs show them), `k` the share kept at full night
export function nightDim(mat, key, k) {
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.kNight = ENV.night;
    if (!/uniform float kNight;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= mix(1.0, ${k.toFixed(3)}, ${NEON_ON});`);
  };
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|' + key;
  mat.needsUpdate = true;
  return mat;
}

export function frameM(ox, oy, oz, ux, uz) {
  const X = new THREE.Vector3(ux, 0, uz).normalize(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(ox, oy, oz);
}

// ---------------------------------------------------------------- canvases (page only)
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let _grate = null;
function grateTexture() {
  if (_grate) return _grate;
  const c = cvs(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#7d8286';
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 16 + 6, 128, 4);      // bearing bars every 3.9 cm (the tile is 0.25 m)
  g.fillStyle = '#6a6f73';
  for (let i = 0; i < 2; i++) g.fillRect(i * 64 + 30, 0, 3, 128);      // cross bars
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_grate = t);
}
// the bottle's face: cream paint with the brown swirl stripes (the cola seen through, peeling), the neck's dark band, the crown,
// the red and blue shoulder wedges and the round label; 120 px a metre over the bottle's 4.2 x 15.2 m
function bottleArt() {
  const R = BOT.R, H = BOT.H, PXM = 120, W = Math.round(2 * R * PXM), Hc = Math.round(H * PXM);
  const c = cvs(W, Hc), g = c.getContext('2d');
  const X = (x) => ((x + R) / (2 * R)) * W, Yc = (y) => (1 - y / H) * Hc;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const prof = (h) => { // the half-width share of the body at height share h
    const P = [[0, 0.92], [0.03, 1], [0.34, 1], [0.44, 0.9], [0.54, 0.95], [0.62, 0.86], [0.72, 0.52], [0.82, 0.33], [0.92, 0.29], [1, 0.3]];
    for (let i = 1; i < P.length; i++) if (h <= P[i][0]) { const t = (h - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; }
    return 0.3;
  };
  const gr = g.createLinearGradient(0, 0, 0, Hc); gr.addColorStop(0, '#e9e8e3'); gr.addColorStop(0.5, '#f1f0ec'); gr.addColorStop(1, '#ddd9cf');
  g.fillStyle = gr; g.fillRect(0, 0, W, Hc);
  // AR34: the cola seen through the glass, as the May 2026 photograph shows it: thin, broken rust-brown streaks rising to the
  // right (about 30 degrees off the bottle's axis) over the white body below the label, a third of the body brown at most,
  // each streak a chain of short dabs that thin out at both ends and skip where the paint has gone
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let s = 0; s < 72; s++) {
    const len = 1.6 + rnd() * 2.8, h0 = 0.25 + rnd() * Math.max(0.2, 0.6 * H - len * 0.87 - 0.25);
    let x = (rnd() * 2.3 - 1.25) * R, y = h0;
    const w = 0.09 + rnd() * 0.18, n = Math.max(6, Math.round(len / 0.07));
    const cr = 122 + rnd() * 30, cg = 76 + rnd() * 20, cb = 48 + rnd() * 14;   // rust brown (the photograph: about 130, 85, 55)
    for (let k = 0; k < n; k++) {
      const t = k / n, nx = x + 0.07 * 0.5 + (rnd() - 0.5) * 0.02, ny = y + 0.07 * 0.87;
      if (rnd() > 0.14) {
        g.strokeStyle = `rgba(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)},${(0.62 + rnd() * 0.33).toFixed(2)})`;
        g.lineWidth = Math.max(2, w * (0.35 + 0.9 * Math.sin(Math.PI * t)) * PXM);
        g.beginPath(); g.moveTo(X(x), Yc(y)); g.lineTo(X(nx), Yc(ny)); g.stroke();
      }
      x = nx; y = ny;
    }
  }
  // peeling: flecks of the white back over the streaks, and grey ghosts of streaks that have worn away
  for (let i = 0; i < 140; i++) {
    const x = (rnd() * 2 - 1) * R * 0.95, h = 0.02 + rnd() * 0.6;
    g.fillStyle = `rgba(238,236,229,${(0.35 + rnd() * 0.5).toFixed(2)})`;
    g.beginPath(); g.ellipse(X(x), Yc(h * H), (0.015 + rnd() * 0.05) * PXM, (0.03 + rnd() * 0.12) * PXM, 0.5 + (rnd() - 0.5) * 0.4, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1.1) * R, h = 0.04 + rnd() * 0.5;
    g.strokeStyle = `rgba(150,140,128,${(0.12 + rnd() * 0.16).toFixed(2)})`; g.lineWidth = (0.04 + rnd() * 0.08) * PXM;
    g.beginPath(); g.moveTo(X(x), Yc(h * H)); g.lineTo(X(x + 0.6 + rnd() * 0.6), Yc(h * H + 1.1 + rnd() * 1.2)); g.stroke();
  }
  // the neck and the crown
  const ng = g.createLinearGradient(0, Yc(0.78 * H), 0, Yc(H));
  ng.addColorStop(0, '#d5dad6'); ng.addColorStop(1, '#eceeea');
  g.fillStyle = ng; g.fillRect(X(-0.5 * R), Yc(H), X(0.5 * R) - X(-0.5 * R), Yc(0.78 * H) - Yc(H));
  g.fillStyle = '#3a3533'; g.fillRect(X(-0.05 * R), Yc(0.775 * H), X(0.5 * R) - X(-0.05 * R), Yc(0.738 * H) - Yc(0.775 * H));   // AR34: the liquid line over the label
  g.fillStyle = '#e6e6e0'; g.fillRect(X(-0.5 * R), Yc(H), X(0.5 * R) - X(-0.5 * R), Yc(0.955 * H) - Yc(H));
  g.strokeStyle = 'rgba(120,120,116,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const x = X((-0.3 + 0.6 * i / 11) * R); g.beginPath(); g.moveTo(x, Yc(H)); g.lineTo(x, Yc(0.958 * H)); g.stroke(); }
  // the shoulder wedges and the round label
  const hc = 0.645 * H, cx = X(0.02 * R), cy = Yc(hc), r = 0.5 * R * PXM;
  g.fillStyle = '#c4272f'; g.beginPath(); g.moveTo(X(-0.86 * R), Yc(0.62 * H)); g.lineTo(cx - r * 0.2, Yc(0.735 * H)); g.lineTo(cx - r * 0.2, Yc(0.575 * H)); g.closePath(); g.fill();
  g.fillStyle = '#23468f'; g.beginPath(); g.moveTo(X(0.86 * R), Yc(0.62 * H)); g.lineTo(cx + r * 0.2, Yc(0.735 * H)); g.lineTo(cx + r * 0.2, Yc(0.575 * H)); g.closePath(); g.fill();
  g.fillStyle = '#f3f0e8'; g.beginPath(); g.arc(cx, cy, r * 1.06, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d02a33'; g.beginPath(); g.arc(cx, cy, r, Math.PI, Math.PI * 2); g.fill();
  g.fillStyle = '#20469a'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.fill();
  g.fillStyle = '#f3f0e8'; g.beginPath(); g.moveTo(cx - r, cy - r * 0.02); g.quadraticCurveTo(cx - r * 0.4, cy - r * 0.3, cx, cy - r * 0.05); g.quadraticCurveTo(cx + r * 0.4, cy + r * 0.2, cx + r, cy - r * 0.02);
  g.lineTo(cx + r, cy + r * 0.36); g.quadraticCurveTo(cx + r * 0.4, cy + r * 0.52, cx, cy + r * 0.3); g.quadraticCurveTo(cx - r * 0.4, cy + r * 0.12, cx - r, cy + r * 0.36); g.closePath(); g.fill();
  g.fillStyle = '#20469a'; g.font = `700 ${Math.round(r * 0.46)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PEPSI', cx, cy + r * 0.14);
  // weathering over everything: long dark streaks down the bottle and a grime gradient at the foot
  for (let i = 0; i < 40; i++) {
    const x = X((rnd() * 2 - 1) * R * 0.9), y0 = rnd() * Hc * 0.8;
    g.strokeStyle = `rgba(60,50,40,${0.03 + rnd() * 0.07})`; g.lineWidth = 2 + rnd() * 5;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rnd() - 0.5) * 12, y0 + 80 + rnd() * 300); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// AR34: the letters' faces are smooth enamel on aluminium sheets (the May 2026 photograph: no grain, no chips at that distance),
// 1.22 x 2.44 m sheets with their butt seams and the screw lines along them, a faint chalky bloom; UVs are the letters' metres
function faceArt() {
  const N = 512, c = cvs(N, N), g = c.getContext('2d'), px = N / 2.44;
  let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * N, y = rnd() * N, r = 40 + rnd() * 160, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? 'rgba(255,236,224,0.10)' : 'rgba(150,120,110,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.fillStyle = 'rgba(70,40,34,0.38)';
  g.fillRect(0, 0, N, 2); g.fillRect(0, Math.round(1.22 * px), N, 2); g.fillRect(0, 0, 2, N);       // the seams
  g.fillStyle = 'rgba(80,50,44,0.45)';
  for (let k = 0; k < 16; k++) { const t = ((k + 0.5) / 16) * N; g.fillRect(t, 5, 2, 2); g.fillRect(t, Math.round(1.22 * px) + 5, 2, 2); g.fillRect(5, t, 2, 2); }
  for (let i = 0; i < 18; i++) {                                                                     // run-off from the screws
    const x = rnd() * N, y = rnd() * N;
    g.strokeStyle = 'rgba(110,70,60,0.10)'; g.lineWidth = 2 + rnd() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y + 30 + rnd() * 90); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.44, 1 / 2.44); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function plateArt() {
  const c = cvs(512, 180), g = c.getContext('2d');
  g.fillStyle = '#121314'; g.fillRect(0, 0, 512, 180);
  g.fillStyle = '#e9e9e3'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 58px Arial, Helvetica, sans-serif';
  g.fillText('TRADE MARK', 256, 48);
  g.font = '700 42px Arial, Helvetica, sans-serif';
  g.fillText('REG. U. S. PAT. OFF.', 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- materials
let _M = null;
function signMats() {
  if (_M) return _M;
  const steel = hmat('sgSteel'), navy = hmat('sgNavy'), conc = hmat('concrete');
  // AR34: at night the faces and the steel stay dark, only the tubes light (photograph 46, 2024: dark red faces, the grid unseen);
  // the r1_night plate had the faces glowing orange and the grid red at a tenth of these
  nightPatch(steel, 'sgN1', `totalEmissiveRadiance += vec3(0.0016, 0.0003, 0.0002) * ${NEON_ON};`);
  nightPatch(navy, 'sgN2', `totalEmissiveRadiance += vec3(0.0012, 0.0002, 0.0002) * ${NEON_ON};`);
  // AR34: not the PBR paint set (its grain read as rows of beads); the albedo leans orange (hue 17) because the sky's specular pulls the
  // rendered face toward crimson (r1_c: hue 347-356, saturation 0.21-0.34 against the photograph's hue 11, saturation 0.62)
  const face = LT(new THREE.MeshStandardMaterial({ color: 0xcc4a18, map: faceArt(), roughness: 0.55, metalness: 0.0 }));
  nightPatch(face, 'sgN3', `totalEmissiveRadiance += vec3(0.010, 0.0012, 0.0005) * ${NEON_ON};`);
  nightDim(face, 'sgD3', 0.3);
  const cream = hmat('sgCream');
  nightPatch(cream, 'sgN4', `totalEmissiveRadiance += vec3(0.012, 0.003, 0.002) * ${NEON_ON};`);
  const back = hmat('letterBack');
  // the neon: glass tubes by day (pale, faintly pink), lit from dusk with the knee that keeps the saturated red from blooming white
  const neon = new THREE.MeshStandardMaterial({ color: 0xd9c8c3, roughness: 0.2, metalness: 0.0, emissive: 0xff2410 });
  neon.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float kNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance *= 5.5 * ${NEON_ON};`)
      .replace('#include <fog_fragment>', `{ float kmx = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), kex = max(kmx - 1.0, 0.0);
          gl_FragColor.rgb *= mix(1.0, min(1.0, (1.0 + kex / (1.0 + kex * 1.5)) / max(kmx, 1e-4)), ${NEON_ON}); }
        #include <fog_fragment>`);
  };
  neon.customProgramCacheKey = () => 'ar33h-neon';
  LT(neon);
  const art = bottleArt();
  const bottle = new THREE.MeshStandardMaterial({ map: art, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: art });
  nightPatch(bottle, 'sgN5', `totalEmissiveRadiance *= 0.26 * ${NEON_ON};`);   // AR34 b4: kept (measured: photograph 46's bottle body (151, 141, 142); 0.26 gave (155, 125, 107) in r1_n3 (round 1's lens), 0.11 (124, 90, 70) in b4_n, 0.05 with the paint dimmed (85, 59, 42) in b4_n3; same box)
  LT(bottle);
  const grate = new THREE.MeshStandardMaterial({ map: grateTexture(), alphaTest: 0.35, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide, color: 0x9aa0a4 });
  LT(grate);
  const pArt = plateArt();
  const plate = new THREE.MeshStandardMaterial({ map: pArt, roughness: 0.5, metalness: 0.1 });
  LT(plate);
  const led = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, emissive: 0xfff2d8 });
  // AR34 b5: 0.05 + 0.25 at night (was 0.25 + 2.2): night photograph 46 shows no lit strip on the grid's diagonals; the twin drew
  // them as bright white streaks across the letters (b5_en/hptSignNight46_night.jpg)
  nightPatch(led, 'sgN7', `totalEmissiveRadiance *= 0.05 + 0.25 * ${NEON_ON};`);
  LT(led);
  // the glow ribbon along the tubes: a soft red line 20 cm wide, additive, on from dusk (the halo that carries the neon at a distance)
  const gc = cvs(8, 64), gg = gc.getContext('2d');
  for (let y = 0; y < 64; y++) { const t = (y + 0.5) / 64 - 0.5, a = Math.exp(-(t * t) / (2 * 0.12 * 0.12)); gg.fillStyle = `rgb(${Math.round(255 * a)},${Math.round(255 * a)},${Math.round(255 * a)})`; gg.fillRect(0, y, 8, 1); }
  const gtex = new THREE.CanvasTexture(gc);
  const glow = new THREE.MeshBasicMaterial({ map: gtex, color: 0xff2a14, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float kNight;`)
      .replace('#include <fog_fragment>', `gl_FragColor.rgb *= 1.25 * ${NEON_ON};   // AR34 b4: wider and stronger halo (photograph 46 blooms; 0.9 in b4_n still thin)
#include <fog_fragment>`);
  };
  glow.customProgramCacheKey = () => 'ar33h-neonglow';
  return (_M = { steel, navy, conc, face, cream, back, neon, bottle, grate, plate, led, glow });
}

// the neon's red light on the lawn in front (after dusk): v across the quad (1 at the sign's side), u along it
let _spill = null;
function spillMat() {
  if (_spill) return _spill;
  const m = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.kNight = ENV.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec2 vSp;`).replace('#include <uv_vertex>', `#include <uv_vertex>
vSp = uv;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float kNight;
varying vec2 vSp;`)
      .replace('#include <fog_fragment>', `{ float a = pow(clamp(vSp.y, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.12, vSp.x) * smoothstep(1.0, 0.8, vSp.x);
          gl_FragColor.rgb *= 0.22 * a * ${NEON_ON}; }
        #include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'ar33h-spill';
  return (_spill = m);
}

// ---------------------------------------------------------------- the sign
export function buildSignAr33(group, y0) {
  const M = signMats(), spill = spillMat();
  const out = new THREE.Group(); out.name = 'ar33h:sign';
  const [nx, nz] = SIGN.N, [sx, sz] = SIGN.S, L = Math.hypot(sx - nx, sz - nz);
  const F = frameM(nx, y0, nz, (sx - nx) / L, (sz - nz) / L);
  const add = (geo, mat, name, cast = true, recv = true) => { geo.applyMatrix4(F); const m = new THREE.Mesh(geo, mat); m.name = 'ar33h:sign:' + name; m.castShadow = cast; m.receiveShadow = recv; out.add(m); return m; };
  const R = buildGrid();
  add(R.steel.geometry(), M.steel, 'steel');
  add(R.navy.geometry(), M.navy, 'columns');
  if (R.mast && R.mast.tris) add(R.mast.geometry(), hmat('sgMast'), 'mast', true);
  add(R.conc.geometry(), M.conc, 'caps', false);
  add(R.grate.geometry(), M.grate, 'grate', false);
  add(R.light.geometry(), M.led, 'led', false, false);
  // the letters: face, back, returns; placed so the face plane is SIGN.LETTER_W in front of the grid
  const lz = SIGN.LETTER_W - SIGN.LETTER_D, V0 = SIGN.LETTER_V0;
  const lg = lettersGeometry(SIGN.LETTER_D, 0.03); lg.translate(0, V0, lz);
  add(lg, [M.face, M.back, M.cream], 'letters');
  // the neon on the letters, on the bottle
  // AR34 b4: tubes 32 mm across (were 22): photograph 46 shows them as thick bright lines at 40-60 m
  const nn = neonGeometry(neonLoops(), SIGN.LETTER_D, 0.016, { seg: 0.5, radial: 6 });
  const nb = neonGeometry([bottleNeonLoop()], SIGN.LETTER_D, 0.016, { seg: 0.5, radial: 6 });
  const T = new THREE.Matrix4().makeTranslation(0, V0, lz);
  nn.tube.append(nb.tube, new THREE.Matrix4()); nn.sup.append(nb.sup, new THREE.Matrix4());   // both faces are the plane w = LETTER_W
  add(nn.tube.geometry(T), M.neon, 'neon', false, false);
  add(nn.sup.geometry(T), M.steel, 'neonSupports', false, false);
  { // the glow ribbon, 1 cm in front of the tubes' centre line
    const rb = glowRibbon(neonLoops().concat([bottleNeonLoop()]), SIGN.LETTER_D + 0.012, 0.2);
    const gm = add(rb.geometry(T), M.glow, 'neonGlow', false, false); gm.renderOrder = 3;
  }
  // the bottle: a cut-out 0.24 m deep with its cream return
  const bg = bottleGeometry(0.24, 0.02); bg.translate(0, V0, SIGN.LETTER_W - 0.24);
  add(bg, [M.bottle, M.back, M.cream], 'bottle');
  // the TRADE MARK plate under the swash, on four standoffs in front of the front girder
  {
    const pg = new THREE.PlaneGeometry(5.2, 1.82); pg.translate(22.8, 6.75, 0.275);   // AR34: 15 mm proud of its backing box (they were coplanar: the box won)
    add(pg, M.plate, 'plate', false);
    const pb = new THREE.BoxGeometry(5.2, 1.82, 0.06); pb.translate(22.8, 6.75, 0.23);
    add(pb, M.back, 'plateBack', false);
  }
  {
    const sg = new THREE.PlaneGeometry(56, 18);
    sg.rotateX(-Math.PI / 2); sg.translate(22.5, 0.12, 9 + SIGN.LETTER_W - 1.5);
    const sm = add(sg, spill, 'spill', false, false); sm.renderOrder = 3;
  }
  group.add(out);
  return { F, stats: { steel: R.steel.tris, navy: R.navy.tris, neon: nn.tube.tris, members: R.count, standoffs: R.nStand } };
}
