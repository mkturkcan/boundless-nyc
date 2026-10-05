// AR33 PROPS materials (part pk, docs/notes/ar33-props.md). Each model part names a key below; the key resolves to the
// materials library (mat/pbrLib.js, owner MATS) when it has loaded, else to a local MeshStandardMaterial with procedural
// grain (normal + roughness noise) so a prop never renders flat. Every material goes through the street light trim
// (STREET_CAL, like the rest of the furniture), the city AO and the snow cap. Metals take the scene's environment as
// their OWN envMap (three substitutes scene.environmentIntensity for envMapIntensity otherwise, 0.14-0.22 by day, and a
// galvanised pole read as grey plastic).
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applySnowCap } from '../../world/materials.js';

const STREET_CAL = [1.94, 1.70, 1.47];
let PBR = null;
export const pkMatsReady = import('../mat/pbrLib.js').then((m) => { if (m && m.pbrMaterial) PBR = m; }).catch(() => { PBR = null; });

// ---- procedural grain (tiling, 256 px): a height noise -> normal map, and a roughness map
let _grain = null;
function grain() {
  if (_grain || typeof document === 'undefined') return _grain;
  const N = 256, h = new Float32Array(N * N);
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // value noise at three octaves, tiled
  for (const [cell, amp] of [[32, 0.5], [16, 0.3], [4, 0.2]]) {
    const G = N / cell, g = new Float32Array((G + 1) * (G + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let j = 0; j <= G; j++) g[j * (G + 1) + G] = g[j * (G + 1)];
    for (let i = 0; i <= G; i++) g[G * (G + 1) + i] = g[i];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (g[y0 * (G + 1) + x0] * (1 - sx) + g[y0 * (G + 1) + x0 + 1] * sx) * (1 - sy) + (g[(y0 + 1) * (G + 1) + x0] * (1 - sx) + g[(y0 + 1) * (G + 1) + x0 + 1] * sx) * sy;
      h[y * N + x] += v * amp;
    }
  }
  const mk = (fn) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x2 = c.getContext('2d'), im = x2.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = (y * N + x) * 4, v = fn(x, y); im.data[o] = v[0]; im.data[o + 1] = v[1]; im.data[o + 2] = v[2]; im.data[o + 3] = 255; }
    x2.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  };
  const H = (x, y) => h[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const nrm = mk((x, y) => {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
  const rgh = mk((x, y) => { const v = 150 + (H(x, y) - 0.5) * 150; return [v, v, v]; });
  return (_grain = { nrm, rgh });
}

// key -> [pbrLib name, pbrLib opts, fallback { color, rough, metal, nrm (strength), grain (m per repeat) }]
const DEFS = {
  galv:      ['steel_galvanized', { tint: '#9ba1a3', dirt: 0.18 }, { color: 0x9ba1a3, rough: 0.46, metal: 0.72, nrm: 0.35, grain: 0.6, env: 0.45 }],
  galvDark:  ['steel_galvanized', { tint: '#6f7577', dirt: 0.3 }, { color: 0x6f7577, rough: 0.55, metal: 0.65, nrm: 0.35, grain: 0.6, env: 0.4 }],
  alu:       ['alu_clear', { tint: '#b9bdc0', dirt: 0.1 }, { color: 0xb9bdc0, rough: 0.38, metal: 0.85, nrm: 0.2, grain: 0.4, env: 0.55 }],
  // the backs of the sign blanks: mill-finish aluminium gone dull and grey with years of street grime (QA Q36: the
  // polished 'alu' mirrored the sky as flat pale-blue planes)
  aluBack:   ['alu_clear', { tint: '#a4a8aa', dirt: 0.35 }, { color: 0xa4a8aa, rough: 0.62, metal: 0.35, nrm: 0.35, grain: 0.7, env: 0.3 }],
  aluDark:   ['alu_black', { tint: '#2c2f31', dirt: 0.1 }, { color: 0x2c2f31, rough: 0.42, metal: 0.6, nrm: 0.2, grain: 0.4, env: 0.35 }],
  stainless: ['stainless', { tint: '#c4c8ca', dirt: 0.08 }, { color: 0xc4c8ca, rough: 0.28, metal: 0.92, nrm: 0.15, grain: 0.3, env: 0.7 }],
  black:     ['metal_painted', { tint: '#1d1f1f', dirt: 0.2 }, { color: 0x1d1f1f, rough: 0.5, metal: 0.25, nrm: 0.3, grain: 0.5, env: 0.25 }],
  green:     ['metal_painted', { tint: '#1f3b2b', dirt: 0.25 }, { color: 0x1f3b2b, rough: 0.52, metal: 0.25, nrm: 0.3, grain: 0.5, env: 0.25 }],
  greenSub:  ['metal_painted', { tint: '#2a4a36', dirt: 0.35 }, { color: 0x2a4a36, rough: 0.58, metal: 0.2, nrm: 0.4, grain: 0.5, env: 0.2 }],
  yellowSig: ['metal_painted', { tint: '#e0a81c', dirt: 0.25 }, { color: 0xe0a81c, rough: 0.5, metal: 0.05, nrm: 0.25, grain: 0.4 }],
  sigBlack:  ['metal_painted', { tint: '#151617', dirt: 0.15 }, { color: 0x151617, rough: 0.6, metal: 0.05, nrm: 0.2, grain: 0.4 }],
  greyPaint: ['metal_painted', { tint: '#5d6366', dirt: 0.25 }, { color: 0x5d6366, rough: 0.55, metal: 0.2, nrm: 0.3, grain: 0.5, env: 0.2 }],
  silverPaint: ['metal_painted', { tint: '#aeb2b1', dirt: 0.3 }, { color: 0xaeb2b1, rough: 0.5, metal: 0.35, nrm: 0.35, grain: 0.4, env: 0.3 }],
  redPaint:  ['metal_painted', { tint: '#9e1c1a', dirt: 0.3 }, { color: 0x9e1c1a, rough: 0.5, metal: 0.1, nrm: 0.3, grain: 0.4 }],
  bluePaint: ['metal_painted', { tint: '#1e4f9c', dirt: 0.25 }, { color: 0x1e4f9c, rough: 0.5, metal: 0.1, nrm: 0.3, grain: 0.4 }],
  whitePaint: ['metal_painted', { tint: '#dcdcd6', dirt: 0.25 }, { color: 0xdcdcd6, rough: 0.5, metal: 0.05, nrm: 0.25, grain: 0.4 }],
  plastic:   ['concrete_smooth', { tint: '#2b2d2d', dirt: 0.1 }, { color: 0x2b2d2d, rough: 0.62, metal: 0.0, nrm: 0.15, grain: 0.3 }],
  bbGreen:   ['metal_painted', { tint: '#27352e', dirt: 0.2 }, { color: 0x27352e, rough: 0.55, metal: 0.15, nrm: 0.25, grain: 0.4 }],
  rubber:    ['concrete_smooth', { tint: '#161616', dirt: 0.05 }, { color: 0x161616, rough: 0.85, metal: 0.0, nrm: 0.2, grain: 0.2 }],
  concrete:  ['concrete_precast', { tint: '#a7a397', dirt: 0.3 }, { color: 0xa7a397, rough: 0.9, metal: 0.0, nrm: 0.6, grain: 0.8 }],
  granite:   ['granite_grey', { tint: '#8d8b86', dirt: 0.25 }, { color: 0x8d8b86, rough: 0.7, metal: 0.0, nrm: 0.5, grain: 0.6 }],
  wood:      ['wood_painted', { tint: '#7a5a3a', dirt: 0.2 }, { color: 0x7a5a3a, rough: 0.75, metal: 0.0, nrm: 0.5, grain: 0.6 }],
  plywood:   ['wood_painted', { tint: '#2f4a33', dirt: 0.35 }, { color: 0x2f4a33, rough: 0.8, metal: 0.0, nrm: 0.5, grain: 0.8 }],
  canvasW:   ['concrete_smooth', { tint: '#e8e6e0', dirt: 0.1 }, { color: 0xe8e6e0, rough: 0.9, metal: 0.0, nrm: 0.3, grain: 0.4, side: THREE.DoubleSide }],
  fabric:    ['concrete_smooth', { tint: '#ffffff', dirt: 0.0 }, { color: 0xffffff, rough: 0.9, metal: 0.0, nrm: 0.2, grain: 0.3, side: THREE.DoubleSide }],
  soil:      ['concrete_smooth', { tint: '#3b2e24', dirt: 0.0 }, { color: 0x3b2e24, rough: 0.98, metal: 0.0, nrm: 0.8, grain: 0.5 }],
  orange:    ['concrete_smooth', { tint: '#e2581c', dirt: 0.2 }, { color: 0xe2581c, rough: 0.55, metal: 0.0, nrm: 0.15, grain: 0.3 }],
  // the work-zone pieces (pkStreet.js drum, pitBarrier): the drum's polyethylene and its retroreflective white bands, rough sawn timber
  drumOrange: ['concrete_smooth', { tint: '#e5541a', dirt: 0.25 }, { color: 0xe5541a, rough: 0.5, metal: 0.0, nrm: 0.12, grain: 0.3 }],
  drumWhite: ['concrete_smooth', { tint: '#e6e6e0', dirt: 0.3 }, { color: 0xe6e6e0, rough: 0.35, metal: 0.05, nrm: 0.12, grain: 0.3 }],
  timber:    ['wood_painted', { tint: '#8e877b', dirt: 0.4 }, { color: 0x8e877b, rough: 0.88, metal: 0.0, nrm: 0.5, grain: 0.8 }],
  whitePlas: ['concrete_smooth', { tint: '#e4e4df', dirt: 0.2 }, { color: 0xe4e4df, rough: 0.5, metal: 0.0, nrm: 0.15, grain: 0.3 }],
  // AR33 PROPS street pieces (pkStreet.js)
  sbsBlue:   ['metal_painted', { tint: '#1b4f9a', dirt: 0.2 }, { color: 0x1b4f9a, rough: 0.4, metal: 0.15, nrm: 0.25, grain: 0.4, env: 0.3 }],
  luminaireBody: ['metal_painted', { tint: '#8d9396', dirt: 0.25 }, { color: 0x8d9396, rough: 0.45, metal: 0.45, nrm: 0.3, grain: 0.5, env: 0.35 }],
  hydrantY:  ['metal_painted', { tint: '#d3a51d', dirt: 0.32 }, { color: 0xd3a51d, rough: 0.52, metal: 0.05, nrm: 0.45, grain: 0.35 }],
  hydrantCap: ['metal_painted', { tint: '#b7bbb8', dirt: 0.3 }, { color: 0xb7bbb8, rough: 0.45, metal: 0.45, nrm: 0.35, grain: 0.35, env: 0.35 }],
  rackMetal: ['metal_painted', { tint: '#26292a', dirt: 0.3 }, { color: 0x26292a, rough: 0.5, metal: 0.35, nrm: 0.3, grain: 0.5, env: 0.25 }],
  scaffold:  ['steel_galvanized', { tint: '#8c9193', dirt: 0.35 }, { color: 0x8c9193, rough: 0.5, metal: 0.6, nrm: 0.3, grain: 0.5, env: 0.38 }],
  shelterFrame: ['stainless', { tint: '#aeb3b5', dirt: 0.12 }, { color: 0xaeb3b5, rough: 0.34, metal: 0.85, nrm: 0.15, grain: 0.3, env: 0.6 }],
  shelterSeat: ['metal_painted', { tint: '#34383a', dirt: 0.2 }, { color: 0x34383a, rough: 0.5, metal: 0.4, nrm: 0.25, grain: 0.4, env: 0.3 }],
  shelterRoof: ['metal_painted', { tint: '#6d7375', dirt: 0.35 }, { color: 0x6d7375, rough: 0.5, metal: 0.3, nrm: 0.25, grain: 0.4, env: 0.25 }],
  subGreen:  ['metal_painted', { tint: '#1c3a2c', dirt: 0.3 }, { color: 0x1c3a2c, rough: 0.5, metal: 0.2, nrm: 0.35, grain: 0.4, env: 0.25 }],
  // ST38 (STATIONS2, stations/subEnt38.js): the stair well's glazed tile walls, concrete treads, yellow nosings, the soffit
  subTile:   ['concrete_smooth', { tint: '#d9d5c8', dirt: 0.3 }, { color: 0xd9d5c8, rough: 0.32, metal: 0.0, nrm: 0.15, grain: 0.3, env: 0.15 }],
  subTread:  ['concrete_precast', { tint: '#8e8a82', dirt: 0.5 }, { color: 0x8e8a82, rough: 0.88, metal: 0.0, nrm: 0.5, grain: 0.7 }],
  subNosing: ['metal_painted', { tint: '#c9a227', dirt: 0.45 }, { color: 0xc9a227, rough: 0.55, metal: 0.2, nrm: 0.3, grain: 0.4 }],
  subGranite: ['granite_grey', { tint: '#4c4c4a', dirt: 0.35 }, { color: 0x4c4c4a, rough: 0.6, metal: 0.0, nrm: 0.5, grain: 0.6 }],   // the heads' dark granite base (2026-08)
  subDark:   ['concrete_smooth', { tint: '#4a4844', dirt: 0.4 }, { color: 0x4a4844, rough: 0.9, metal: 0.0, nrm: 0.3, grain: 0.5 }],
  shedDeck:  ['wood_painted', { tint: '#27392d', dirt: 0.4 }, { color: 0x27392d, rough: 0.8, metal: 0.0, nrm: 0.5, grain: 0.6 }],
  shedFascia: ['wood_painted', { tint: '#243c2e', dirt: 0.3 }, { color: 0x243c2e, rough: 0.75, metal: 0.0, nrm: 0.5, grain: 0.6 }],
  mailBlue:  ['metal_painted', { tint: '#1f418a', dirt: 0.25 }, { color: 0x1f418a, rough: 0.45, metal: 0.1, nrm: 0.3, grain: 0.4, env: 0.25 }],
  binRed:    ['metal_painted', { tint: '#6a2b27', dirt: 0.3 }, { color: 0x6a2b27, rough: 0.5, metal: 0.25, nrm: 0.3, grain: 0.5, env: 0.2 }],
  binGrey:   ['metal_painted', { tint: '#4b5052', dirt: 0.3 }, { color: 0x4b5052, rough: 0.55, metal: 0.25, nrm: 0.3, grain: 0.5, env: 0.2 }],
  binGreyLid: ['metal_painted', { tint: '#2a2d2e', dirt: 0.3 }, { color: 0x2a2d2e, rough: 0.5, metal: 0.2, nrm: 0.3, grain: 0.5, env: 0.2 }],
  binBlue:   ['metal_painted', { tint: '#1d4d92', dirt: 0.25 }, { color: 0x1d4d92, rough: 0.5, metal: 0.15, nrm: 0.3, grain: 0.5, env: 0.2 }],
  binBlueLid: ['metal_painted', { tint: '#153a6d', dirt: 0.25 }, { color: 0x153a6d, rough: 0.5, metal: 0.15, nrm: 0.3, grain: 0.5, env: 0.2 }],
  plantLeaf: ['concrete_smooth', { tint: '#3d6a33', dirt: 0.0 }, { color: 0x3d6a33, rough: 0.8, metal: 0.0, nrm: 0.4, grain: 0.3, side: THREE.DoubleSide }],
  wireRed:   ['metal_painted', { tint: '#5a2b26', dirt: 0.3 }, { color: 0x5a2b26, rough: 0.6, metal: 0.25, nrm: 0.3, grain: 0.4 }],
};
const _cache = new Map();
export const metalMats = new Set();
function fallback(key, f) {
  const G = grain();
  const m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.rough, metalness: f.metal, side: f.side ?? THREE.FrontSide });
  if (G) {
    m.normalMap = G.nrm; m.normalScale = new THREE.Vector2(f.nrm, f.nrm);
    m.roughnessMap = G.rgh;
    const rep = 1 / (f.grain || 0.5);
    for (const t of [m.normalMap, m.roughnessMap]) t.repeat.set(rep, rep);
  }
  return m;
}
function finish(m, env) {
  applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
  if (env) { m.envMapIntensity = env; metalMats.add(m); }
  return m;
}
// the material for a key (instanced furniture: vertex colours off, instance colour on where the mesh sets it)
export function pkMat(key) {
  let m = _cache.get(key);
  if (m) return m;
  const d = DEFS[key] || DEFS.greyPaint;
  const f = d[2];
  if (PBR) {
    // the library caches by name + opts: this part's own seed (and the key) keeps the instance ours, so the envMap and
    // metalness below never reach a building's material (a clone would drop the library's shader patches)
    try { m = PBR.pbrMaterial(d[0], { ...d[1], seed: 330 + Object.keys(DEFS).indexOf(key), trim: STREET_CAL, side: f.side ?? THREE.FrontSide }); } catch (e) { m = null; }
    if (m) {
      if (f.metal !== undefined) m.metalness = Math.max(m.metalness || 0, f.metal * 0.9);
      if (f.side) m.side = f.side;
      if (f.env) { m.envMapIntensity = f.env; metalMats.add(m); }
      _cache.set(key, m);
      return m;
    }
  }
  m = finish(fallback(key, f), f.env);
  _cache.set(key, m);
  return m;
}
// the far models' one material (batch 5, draw calls at the corridor-long views): a far cell's flat keys merged into one
// mesh, each key's colour per vertex (its tint here, a face's texture mean in props.js); both sides (banners, canvas)
export function pkFarMat() {
  let m = _cache.get('far');
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
  m.name = 'pk-far';
  finish(m, 0.3);
  _cache.set('far', m);
  return m;
}
export const pkTint = (key) => (DEFS[key] ? DEFS[key][2].color : null);
// emissive keys: a lens / screen / luminaire that glows (tex optional), driven by the caller
export function pkGlow(key, color = 0xffffff, tex = null, o = {}) {
  const ck = 'glow:' + key;
  let m = _cache.get(ck);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: o.base ?? 0x202020, roughness: o.rough ?? 0.25, metalness: 0.0, emissive: color, emissiveIntensity: o.on ?? 0, emissiveMap: tex, map: o.map ?? null, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent });
  finish(m, 0);
  _cache.set(ck, m);
  return m;
}
// a textured face (a sign, a banner, a map panel): the canvas texture carries the colour
export function pkFace(key, tex, o = {}) {
  const ck = 'face:' + key;
  let m = _cache.get(ck);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.0, side: o.side ?? THREE.FrontSide, emissive: o.emissive ?? 0x000000, emissiveMap: o.emissive ? tex : null, emissiveIntensity: o.on ?? 0, alphaTest: o.alphaTest ?? 0, transparent: false });
  finish(m, o.env || 0);
  _cache.set(ck, m);
  return m;
}
// shelter and newspaper-box glass: clear tempered glass, a faint green-grey tint, reflecting the scene's environment
export function pkGlass(kind = '') {
  let m = _cache.get('glass' + kind);
  if (m) return m;
  // the shelters' roof glass is a laminated light green-grey, more opaque than the walls
  m = kind === 'roof'
    ? new THREE.MeshStandardMaterial({ color: 0xa8c4ba, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0xc9dcdc, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  m.envMapIntensity = 0.9;
  m.userData.pkGlass = true;
  metalMats.add(m);
  _cache.set('glass' + kind, m);
  return m;
}
// metals reflect the scene's environment through their own envMap (see the header): call from a render hook
let _env = null;
export function pkEnvSync(scene) {
  const e = scene && scene.environment;
  if (!e || e === _env) return;
  const first = !_env;
  _env = e;
  for (const m of metalMats) { m.envMap = e; if (first) m.needsUpdate = true; }
}
export const pkNight = () => ENV.night.value;
