// AR34 LIFE materials (part lk, docs/notes/ar34-life.md). Each model part names a key below. Metals, paint and wood
// resolve to the materials library (mat/pbrLib.js, owner MATS) when it has loaded, else to a local MeshStandardMaterial
// with procedural grain; cloth, goods, produce, bags, tyres and glossy two-wheeler paint are this part's own physical
// materials (canvas atlases from lkArt.js, a crinkle normal for the bags, clearcoat for the scooters' bodies). Every one
// goes through the street light trim (the furniture's STREET_CAL), the city AO and the snow cap; metals and gloss take the
// scene's environment as their own envMap (as pk/pkMats.js does).
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applySnowCap } from '../../world/materials.js';
import { fabricTex, goodsTex, plywoodTex, shedSignTex, valanceTex, meshTex, crinkleTex, aframeTex, decalTex, brushedTex } from './lkArt.js';

const STREET_CAL = [1.94, 1.70, 1.47];
let PBR = null;
export const lkMatsReady = import('../mat/pbrLib.js').then((m) => { if (m && m.pbrMaterial) PBR = m; }).catch(() => { PBR = null; });

// library-backed keys: [pbrLib name, opts, fallback { color, rough, metal, env }]
const LIB = {
  galv:      ['steel_galvanized', { tint: '#a3a8aa', dirt: 0.25 }, { color: 0xa3a8aa, rough: 0.42, metal: 0.75, env: 0.5 }],
  galvDull:  ['steel_galvanized', { tint: '#8a8f90', dirt: 0.4 }, { color: 0x8a8f90, rough: 0.55, metal: 0.6, env: 0.4 }],
  stainless: ['stainless', { tint: '#c9ccce', dirt: 0.12 }, { color: 0xc9ccce, rough: 0.26, metal: 0.92, env: 0.75 }],
  alu:       ['alu_clear', { tint: '#b9bdc0', dirt: 0.15 }, { color: 0xb9bdc0, rough: 0.36, metal: 0.85, env: 0.55 }],
  black:     ['metal_painted', { tint: '#1b1c1d', dirt: 0.2 }, { color: 0x1b1c1d, rough: 0.45, metal: 0.3, env: 0.3 }],
  ply:       ['wood_painted', { tint: '#2b5a43', dirt: 0.35 }, { color: 0x2b5a43, rough: 0.8, metal: 0.0 }],
  deck:      ['wood_painted', { tint: '#34403a', dirt: 0.45 }, { color: 0x34403a, rough: 0.85, metal: 0.0 }],
  beam:      ['metal_painted', { tint: '#2a2e2c', dirt: 0.35 }, { color: 0x2a2e2c, rough: 0.55, metal: 0.25, env: 0.25 }],
  wood:      ['wood_painted', { tint: '#a8865c', dirt: 0.3 }, { color: 0xa8865c, rough: 0.82, metal: 0.0 }],
  woodDark:  ['wood_painted', { tint: '#5b4026', dirt: 0.3 }, { color: 0x5b4026, rough: 0.78, metal: 0.0 }],
  redPaint:  ['metal_painted', { tint: '#a3221d', dirt: 0.3 }, { color: 0xa3221d, rough: 0.5, metal: 0.15, env: 0.25 }],
  greenPaint: ['metal_painted', { tint: '#2f6b3a', dirt: 0.3 }, { color: 0x2f6b3a, rough: 0.5, metal: 0.15, env: 0.25 }],
  // dark plastics and the scooters' black paint: through the library (its reflection carries the city, not the bare sky,
  // so black stays black under the hot sky; a plain standard material read mid-grey on the 2026-10-01 plates)
  plasBlack: ['metal_painted', { tint: '#19191a', dirt: 0.12, chips: 0 }, { color: 0x1a1a1b, rough: 0.55, metal: 0.0 }],
  plasGrey:  ['metal_painted', { tint: '#5f6263', dirt: 0.2, chips: 0 }, { color: 0x6a6d6e, rough: 0.55, metal: 0.0 }],
  glossBlack: ['metal_painted', { tint: '#0f1011', dirt: 0.06, chips: 0 }, { color: 0x0e0f10, rough: 0.4, metal: 0.05 }],
  seat:      ['metal_painted', { tint: '#151515', dirt: 0.1, chips: 0 }, { color: 0x141414, rough: 0.6, metal: 0.0 }],
};
// this part's own: [factory]
const OWN = {
  fab:      () => std({ map: fabricTex(), rough: 0.86, side: THREE.DoubleSide }),
  // umbrella and tent cloth: the fabric atlas, the sun through the cloth (an emissive copy of its colour, by day only:
  canopy:   () => { const m = std({ map: fabricTex(), rough: 0.8, side: THREE.DoubleSide, emissive: 0xffffff, on: 0.3 }); m.emissiveMap = m.map; return m; },
  goods:    () => std({ map: goodsTex(), rough: 0.7, side: THREE.DoubleSide }),
  produce:  () => std({ map: goodsTex(), rough: 0.38, clearcoat: 0.25 }),
  cardboard: () => std({ map: goodsTex(), rough: 0.9 }),
  bagBlack: () => std({ color: 0x0b0b0c, rough: 0.3, nmap: crinkleTex(), nscale: 0.9, rep: 2.2, clearcoat: 0.3 }),
  bagWhite: () => std({ color: 0xdcdcd8, rough: 0.42, nmap: crinkleTex(), nscale: 0.7, rep: 2.2 }),
  tarp:     () => std({ color: 0x1f63b4, rough: 0.48, nmap: crinkleTex(), nscale: 0.5, rep: 0.8, side: THREE.DoubleSide }),
  rubber:   () => std({ color: 0x151515, rough: 0.82 }),
  plasGreen: () => std({ color: 0x2f8a3c, rough: 0.5 }),
  plasBlue: () => std({ color: 0x1d4f9e, rough: 0.5 }),
  plasWhite: () => std({ color: 0xe6e6e2, rough: 0.5 }),
  plasYellow: () => std({ color: 0xe8b818, rough: 0.45 }),
  glossOrange: () => std({ color: 0xe5651a, rough: 0.38, metal: 0.05, clearcoat: 0.5, ccRough: 0.12 }),
  glossWhite: () => std({ color: 0xe9e9e6, rough: 0.38, metal: 0.05, clearcoat: 0.5, ccRough: 0.12 }),
  glossRed: () => std({ color: 0xa8141a, rough: 0.38, metal: 0.05, clearcoat: 0.5, ccRough: 0.12 }),
  chrome:   () => std({ color: 0xd8dadc, rough: 0.16, metal: 1.0, env: 0.55 }),
  lensRed:  () => std({ color: 0x8a0d0d, rough: 0.15, emissive: 0x5a0606, on: 0.6 }),
  lensClear: () => std({ color: 0xd8dde0, rough: 0.08, metal: 0.4 }),
  mesh:     () => std({ color: 0x2b2c2c, rough: 0.5, metal: 0.5, env: 0.25, alpha: meshTex(), side: THREE.DoubleSide }),
  meshGalv: () => std({ color: 0x9da2a4, rough: 0.45, metal: 0.7, env: 0.45, alpha: meshTex(), side: THREE.DoubleSide }),
  plyFace:  () => std({ map: plywoodTex(), rough: 0.82 }),
  plyFacePlain: () => std({ map: plywoodTex(false), rough: 0.82 }),
  shedSign: () => std({ map: shedSignTex(), rough: 0.5 }),
  valance:  () => std({ map: valanceTex(), rough: 0.7, side: THREE.DoubleSide }),
  aframe:   () => std({ map: aframeTex(), rough: 0.45 }),
  tube:     () => std({ color: 0xf2f4f0, rough: 0.3, emissive: 0xf4f6ff, on: 1.6, noTrim: true }),
  // printed marks (lkArt.js decal atlas): menus, the bag's badge, stripes, plates; cut out by their alpha
  decal:    () => { const m = std({ map: decalTex(), rough: 0.5 }); m.alphaTest = 0.5; return m; },
  // the carts' brushed stainless: a grey grain, metal, a dimmer reflection than polished steel (a cart's side reflects the
  // street, not the sky: the library's bright stainless read as a white box on QA's q1174Sw)
  steelCart: () => std({ map: brushedTex(), rough: 0.4, metal: 0.8, env: 0.45, rep: 2 }),
  nylonBlack: () => std({ color: 0x141517, rough: 0.72, nmap: crinkleTex(), nscale: 0.18, rep: 1.4 }),
  lensAmber: () => std({ color: 0xc8700e, rough: 0.15, emissive: 0x2a1400, on: 0.5 }),
};
function std(o) {
  const P = o.clearcoat || o.sheen;
  const m = new (P ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
    color: o.color ?? 0xffffff, map: o.map ?? null, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.on ?? 0,
  });
  if (o.clearcoat) { m.clearcoat = o.clearcoat; m.clearcoatRoughness = o.ccRough ?? 0.1; }
  if (o.sheen) { m.sheen = 0.5; m.sheenRoughness = 0.7; m.sheenColor = new THREE.Color(0xffffff); }
  if (o.nmap) {
    const t = o.nmap.clone(); t.needsUpdate = true; t.repeat.set(o.rep || 1, o.rep || 1);
    m.normalMap = t; m.normalScale = new THREE.Vector2(o.nscale ?? 1, o.nscale ?? 1);
  }
  if (o.alpha) { m.alphaMap = o.alpha; m.alphaTest = 0.5; m.alphaMap.repeat.set(1, 1); }
  if (!o.noTrim) applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
  if (o.env) { m.envMapIntensity = o.env; envMats.add(m); }
  return m;
}
const _cache = new Map();
const envMats = new Set();
export function lkMat(key) {
  let m = _cache.get(key);
  if (m) return m;
  if (OWN[key]) { m = OWN[key](); _cache.set(key, m); return m; }
  const d = LIB[key] || LIB.black, f = d[2];
  if (PBR) {
    try { m = PBR.pbrMaterial(d[0], { ...d[1], seed: 340 + Object.keys(LIB).indexOf(key), trim: STREET_CAL }); } catch (e) { m = null; }
    if (m) {
      if (f.metal !== undefined) m.metalness = Math.max(m.metalness || 0, f.metal * 0.9);
      if (f.env) { m.envMapIntensity = f.env; envMats.add(m); }
      _cache.set(key, m);
      return m;
    }
  }
  m = std({ color: f.color, rough: f.rough, metal: f.metal, env: f.env });
  _cache.set(key, m);
  return m;
}
// metals and gloss reflect the scene's environment through their own envMap: call from a render hook
let _env = null;
export function lkEnvSync(scene) {
  const e = scene && scene.environment;
  if (!e || e === _env) return;
  const first = !_env;
  _env = e;
  for (const m of envMats) { m.envMap = e; if (first) m.needsUpdate = true; }
}
// the shed's tubes glow brighter at dusk and night (they burn all day under a deck)
export function lkTick() {
  const t = _cache.get('tube');
  if (t) t.emissiveIntensity = 1.4 + 1.6 * Math.min(1, Math.max(0, (ENV.night.value - 0.05) / 0.3));
  const c = _cache.get('canopy');
  if (c) c.emissiveIntensity = 0.3 * (1 - Math.min(1, Math.max(0, ENV.night.value / 0.4)));
}
