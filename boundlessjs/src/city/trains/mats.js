// TRAINS (AR34): materials for the rail cars. One material per class, shared by every car of every type, so a train
// costs one draw call per class (InstancedMesh). Weathering lives in the vertex colours (kit.js); the brushed stainless
// grain, the sign atlas (route bullets, car numbers, LED destinations: drawn here, no copied artwork) are canvases.
// Per-instance attributes the shaders read:
//   lamps:  iLampA (front white, front red, rear white, rear red), iLampB (door lights, interior, -, -)
//   decals / signs: iUvo (number cell offset xy, destination cell offset zw)
import * as THREE from 'three';
import { ENV } from '../../world/materials.js';

let _M = null;
export const ATLAS = { W: 2048, H: 1024 };
// atlas cells in pixels [x, y, w, h] (canvas origin top-left)
export const CELLS = {
  bullet1: [0, 0, 160, 160],          // the 1's front route sign: a red circle with a white 1 on black
  side1: [160, 0, 720, 120],          // the R62A's side sign: bullet + service name
  flag: [880, 0, 150, 84],
  mnrLogo: [1040, 0, 1, 1],           // (none: the MTA / Metro-North marks are left out)
  num0: [0, 200, 150, 54],            // R62A number plates: 4 x 8 cells of 150 x 54 from here
  numM: [0, 680, 200, 50],            // Metro-North car numbers (black on clear): 4 x 4 cells of 200 x 50
  dest0: [1040, 200, 600, 70],        // LED destination cells (orange on black): 1 x 6 cells of 600 x 70
  chevron: [1660, 200, 380, 120],     // M7A front band: white chevrons on Metro-North blue
};
export const R62A_NUMS = [];
for (let i = 0; i < 32; i++) R62A_NUMS.push(i < 16 ? 1651 + i * 13 : 2156 + (i - 16) * 19);     // within the 1's blocks 1651-1900, 2156-2475
export const MNR_NUMS = { m7a: [4012, 4093, 4170, 4231, 4302, 4387, 4110, 4255], m8: [9104, 9157, 9233, 9318, 9402, 9471, 9520, 9566] };
export const DESTS = ['Grand Central', 'Poughkeepsie', 'Southeast', 'New Haven', 'Stamford', 'Croton-Harmon'];

function drawAtlas() {
  const cv = document.createElement('canvas'); cv.width = ATLAS.W; cv.height = ATLAS.H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const bullet = (cx, cy, r, txt) => {
    g.fillStyle = '#ee352e'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(r * 1.45)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, cx, cy + r * 0.06);
  };
  { const [x, y, w, h] = CELLS.bullet1; g.fillStyle = '#0c0c0c'; g.fillRect(x, y, w, h); bullet(x + w / 2, y + h / 2, w * 0.36, '1'); }
  { const [x, y, w, h] = CELLS.side1; g.fillStyle = '#0c0c0c'; g.fillRect(x, y, w, h); bullet(x + h * 0.55, y + h / 2, h * 0.36, '1');
    g.fillStyle = '#f2f2f2'; g.font = `bold ${Math.round(h * 0.3)}px Helvetica, Arial, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('Broadway - 7 Av Local', x + h * 1.1, y + h * 0.36); g.font = `${Math.round(h * 0.24)}px Helvetica, Arial, sans-serif`; g.fillText('242 St - South Ferry', x + h * 1.1, y + h * 0.7); }
  { const [x, y, w, h] = CELLS.flag; for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(x, y + (h * i) / 13, w, h / 13 + 0.5); }
    g.fillStyle = '#3c3b6e'; g.fillRect(x, y, w * 0.4, h * 7 / 13); g.fillStyle = '#ffffff';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { g.beginPath(); g.arc(x + w * 0.4 * (c + 0.5) / 6, y + (h * 7 / 13) * (r + 0.5) / 5, 1.6, 0, 7); g.fill(); } }
  // R62A number plates: white digits on black, a red band under them (the plates over the end windows)
  for (let i = 0; i < 32; i++) {
    const [x0, y0, w, h] = CELLS.num0, x = x0 + (i % 4) * w, y = y0 + Math.floor(i / 4) * h;
    g.fillStyle = '#0d0d0d'; g.fillRect(x, y, w, h * 0.62); g.fillStyle = '#c8281e'; g.fillRect(x, y + h * 0.62, w, h * 0.38);
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(h * 0.52)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(R62A_NUMS[i]), x + w / 2, y + h * 0.33);
  }
  // Metro-North car numbers: black digits on clear
  const mn = [...MNR_NUMS.m7a, ...MNR_NUMS.m8];
  for (let i = 0; i < 16; i++) {
    const [x0, y0, w, h] = CELLS.numM, x = x0 + (i % 4) * w, y = y0 + Math.floor(i / 4) * h;
    g.fillStyle = '#121212'; g.font = `bold ${Math.round(h * 0.7)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(mn[i]), x + w / 2, y + h / 2);
  }
  // LED destination signs (amber dots on black)
  for (let i = 0; i < DESTS.length; i++) {
    const [x0, y0, w, h] = CELLS.dest0, y = y0 + i * h;
    g.fillStyle = '#070605'; g.fillRect(x0, y, w, h);
    g.fillStyle = '#ff9a2a'; g.font = `bold ${Math.round(h * 0.62)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(DESTS[i], x0 + w / 2, y + h / 2 + 1);
    g.fillStyle = 'rgba(7,6,5,0.55)'; for (let yy = y; yy < y + h; yy += 4) g.fillRect(x0, yy, w, 1.4);   // the LED rows
    for (let xx = x0; xx < x0 + w; xx += 4) g.fillRect(xx, y, 1.4, h);
  }
  // the M7A's front band: nested white V chevrons on blue (two strokes each), seen across the cab end
  { const [x, y, w, h] = CELLS.chevron; g.fillStyle = '#1d3f93'; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = '#f4f4f2'; g.lineWidth = h * 0.13; g.lineCap = 'butt'; g.lineJoin = 'miter';
    const n = 4, pw = w / n;
    for (let i = 0; i < n; i++) for (const o of [0, 0.36]) {
      const cx = x + (i + 0.5) * pw;
      g.beginPath(); g.moveTo(cx - pw * 0.5, y + h * (0.02 + o)); g.lineTo(cx, y + h * (0.5 + o)); g.lineTo(cx + pw * 0.5, y + h * (0.02 + o)); g.stroke();
    }
    g.restore(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// the UV rectangle of a cell (three's flipY: v from the bottom)
export function cellUV(name, i = 0, cols = 1) {
  const c = CELLS[name], x = c[0] + (i % cols) * c[2], y = c[1] + Math.floor(i / cols) * c[3];
  return { u0: x / ATLAS.W, u1: (x + c[2]) / ATLAS.W, v0: 1 - (y + c[3]) / ATLAS.H, v1: 1 - y / ATLAS.H };
}

// brushed stainless: fine streaks along u (the car's length), a slow cloud of rubbed and dull patches
function brushedTex() {
  const N = 512, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N);
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const row = new Float32Array(N);
  for (let y = 0; y < N; y++) row[y] = rnd();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const streak = row[y] * 0.6 + row[(y + 1) % N] * 0.25 + rnd() * 0.15;
    const cloud = 0.5 + 0.5 * Math.sin(x * 0.019 + Math.sin(y * 0.031) * 2.0) * Math.cos(y * 0.013 + x * 0.004);
    const v = Math.max(0, Math.min(255, 255 * (0.7 + 0.2 * streak + 0.1 * cloud)));   // multiplies the roughness: 0.7 .. 1.0
    const o = (y * N + x) * 4; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 3.0); t.anisotropy = 8;
  return t;
}

const NIGHT = { value: 0 }, GAIN = { value: 1 };
function nightGlow(mat, k) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tNight = NIGHT;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float tNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * tNight * ${k.toFixed(3)};\n#endif`);
  };
  mat.customProgramCacheKey = () => 'trNight' + k;
}
function lampPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGain = GAIN;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aux;\nattribute vec4 iLampA;\nattribute vec4 iLampB;\nvarying float vOn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float a = aux;
        vOn = a < 0.5 ? 1.0 : a < 1.5 ? iLampA.x : a < 2.5 ? iLampA.y : a < 3.5 ? iLampA.z : a < 4.5 ? iLampA.w : a < 5.5 ? iLampB.x : iLampB.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float tGain;\nvarying float vOn;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.07, tGain, vOn);');
  };
  mat.customProgramCacheKey = () => 'trLamp';
}
function uvoPatch(mat, tag) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aux;\nattribute vec4 iUvo;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n if (aux > 0.5 && aux < 1.5) vMapUv += iUvo.xy; else if (aux > 1.5 && aux < 2.5) vMapUv += iUvo.zw;\n#endif');
  };
  const pk = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => tag + (pk ? pk() : '');
}

export function trainMats() {
  if (_M) return _M;
  const brushed = brushedTex(), atlas = drawAtlas();
  const M = {};
  // stainless: the colour is the reflectance (vertex colours darken it where grime sits)
  M.stainless = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, metalness: 0.8, roughness: 0.42, roughnessMap: brushed, vertexColors: true, envMapIntensity: 0.55 });
  M.stainless.name = 'tr:stainless';
  // painted metal (M7A blue and M8 red cab ends, the M8 stripe): the colour per vertex, a clear coat
  M.paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, vertexColors: true, envMapIntensity: 0.7 });
  M.paint.name = 'tr:paint';
  // dark parts: underframe, equipment boxes, rubber gaskets, couplers, trucks (brake dust in the vertex colours)
  M.dark = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.74, vertexColors: true });
  M.dark.name = 'tr:dark';
  // glass: reflections on top, the lit interior through it (premultiplied blending, no depth write: fleet24's mkGlass)
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0e11, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false, envMapIntensity: 1.3 });
  M.glass.blending = THREE.CustomBlending; M.glass.blendSrc = THREE.OneFactor; M.glass.blendDst = THREE.OneMinusSrcAlphaFactor;
  M.glass.name = 'tr:glass';
  // the interior: seats, liners, floor, poles (vertex colours); after dark the cabin lights it (a glow of its own albedo)
  M.interior = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.7, vertexColors: true });
  nightGlow(M.interior, 1.6); M.interior.name = 'tr:interior';
  // far windows (LOD1): dark glass by day, the lit cabin's glow after dark
  M.winFar = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.12, vertexColors: true, emissive: 0xffe2b0, emissiveIntensity: 0 });
  M.winFar.name = 'tr:winFar';
  // light strips and ad panels (lit day and night)
  M.lit = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: true });
  M.lit.name = 'tr:lit';
  // head / marker / door lamps: on per instance (iLampA / iLampB), a dim lens when off
  M.lamps = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  lampPatch(M.lamps); M.lamps.name = 'tr:lamps';
  // signs: route and destination signs, lit (per-instance destination cell)
  M.signs = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff });
  uvoPatch(M.signs, 'trSign'); M.signs.name = 'tr:signs';
  // decals: car numbers (per-instance cell), flags, livery bands from the atlas; cut out
  M.decals = new THREE.MeshStandardMaterial({ map: atlas, color: 0xffffff, metalness: 0.1, roughness: 0.5, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  uvoPatch(M.decals, 'trDecal'); M.decals.name = 'tr:decals';
  M.atlas = atlas; M.brushed = brushed;
  _M = M;
  return M;
}
// per frame: the night level (ENV.night 0 day .. 1 night) drives the cabin glow and the lamp / sign gains
export function trainMatsUpdate() {
  const M = _M; if (!M) return;
  const n = Math.max(0, Math.min(1, ENV.night?.value ?? 0));
  NIGHT.value = 0.08 + 0.92 * n;
  GAIN.value = 2.2 + 5.0 * n;
  M.lit.color.setScalar(1.15 + 1.6 * n);
  M.signs.color.setScalar(1.0 + 1.2 * n);
  M.winFar.emissiveIntensity = 1.1 * n;
}
