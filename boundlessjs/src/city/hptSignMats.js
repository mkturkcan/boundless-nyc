// AR33 HPT: materials for the Hunters Point parts (docs/notes/ar33-hpt.md). The structures take mat/pbrLib.js sets
// (owner MATS: `pbrMaterial(name, opts)`, UVs in metres, the light trim and weathering built in) once the library has
// loaded (`hpMatsReady`), else a local MeshStandardMaterial through the scene's light trim. The pieces that carry their
// own art (the letters' faces, the neon, the bottle, the lettering) are built in hptSignKit.js / hptSignLetters.js.
import * as THREE from 'three';
import { applyLightTrim } from '../world/materials.js';

let PBR = null;
export const hpMatsReady = import('./mat/pbrLib.js')
  .then((m) => { if (m && m.pbrMaterial) PBR = m; })
  .catch(() => { PBR = null; });

// [pbrLib name, opts, fallback { color, rough, metal }]
const DEF = {
  steel: ['steel_black', { tint: '#1a1b1d', dirt: 0.22, seed: 3 }, { color: 0x1b1c1e, rough: 0.55, metal: 0.35 }],
  steelBlue: ['metal_painted', { tint: '#1f3f78', dirt: 0.2, seed: 5 }, { color: 0x1f3f78, rough: 0.5, metal: 0.3 }],
  column: ['metal_painted', { tint: '#161c28', dirt: 0.2, seed: 7 }, { color: 0x161c28, rough: 0.5, metal: 0.35 }],
  cream: ['metal_painted', { tint: '#e3d9c4', dirt: 0.28, seed: 11 }, { color: 0xe3d9c4, rough: 0.5, metal: 0.1 }],
  letterBack: ['metal_painted', { tint: '#2a2a29', dirt: 0.3, seed: 13 }, { color: 0x2a2a29, rough: 0.6, metal: 0.2 }],
  concrete: ['concrete_precast', { tint: '#9d9a92', dirt: 0.25, seed: 17 }, { color: 0x9d9a92, rough: 0.9, metal: 0.0 }],
  concreteDark: ['concrete_precast', { tint: '#7a766e', dirt: 0.4, seed: 19 }, { color: 0x7a766e, rough: 0.92, metal: 0.0 }],
  galv: ['steel_galvanized', { tint: '#8f9395', dirt: 0.15, seed: 23 }, { color: 0x8f9395, rough: 0.45, metal: 0.8 }],
  rust: ['steel_rust', { tint: '#5a3524', dirt: 0.3, seed: 29 }, { color: 0x5a3524, rough: 0.85, metal: 0.1 }],
  gantry: ['steel_black', { tint: '#1e1f20', dirt: 0.3, seed: 31 }, { color: 0x1e1f20, rough: 0.6, metal: 0.3 }],
  wood: ['wood_painted', { tint: '#7c6147', dirt: 0.3, seed: 37 }, { color: 0x7c6147, rough: 0.8, metal: 0.0 }],
  timber: ['wood_painted', { tint: '#6e5a45', dirt: 0.45, seed: 41 }, { color: 0x6e5a45, rough: 0.85, metal: 0.0 }],
  iron: ['metal_painted', { tint: '#26282a', dirt: 0.2, seed: 43 }, { color: 0x26282a, rough: 0.5, metal: 0.4 }],
  railPale: ['metal_painted', { tint: '#b9bcbc', dirt: 0.15, seed: 47 }, { color: 0xb9bcbc, rough: 0.45, metal: 0.5 }],
  deckConcrete: ['concrete_precast', { tint: '#8f8b83', dirt: 0.3, seed: 53 }, { color: 0x8f8b83, rough: 0.9, metal: 0.0 }],
  railSteel: ['steel_galvanized', { tint: '#6d6a66', dirt: 0.25, seed: 59 }, { color: 0x6d6a66, rough: 0.45, metal: 0.7 }],
  plateBlack: ['metal_painted', { tint: '#121314', dirt: 0.15, seed: 61 }, { color: 0x121314, rough: 0.55, metal: 0.2 }],
  // the Pepsi-Cola sign (hptSignBuild.js): its own instances, so the night glow patched onto them reaches nothing else
  sgSteel: ['steel_black', { tint: '#1b1c1e', dirt: 0.25, seed: 101 }, { color: 0x1b1c1e, rough: 0.5, metal: 0.4 }],
  sgNavy: ['metal_painted', { tint: '#171e30', dirt: 0.22, seed: 103 }, { color: 0x171e30, rough: 0.45, metal: 0.4 }],
  sgMast: ['metal_painted', { tint: '#2a4f96', dirt: 0.2, seed: 105 }, { color: 0x2a4f96, rough: 0.5, metal: 0.3 }, { plain: true }],   // AR34: the bottle's blue mast
  // AR34: the faces are smooth enamel on sheet aluminium (the photographs: no chips, no hammered grain), the orange-red of the
  // sunlit faces in the May 2026 photograph (rgb 122-143, 42-52, 27-33 there)
  sgFace: ['metal_painted', { tint: '#bf3a1e', dirt: 0.1, seed: 107, chips: 0, nrm: 0.2 }, { color: 0xbf3a1e, rough: 0.42, metal: 0.05 }],
  // AR34: the gantries' paint is a smooth blue-black; the PBR paint
  // set's chips and grain read as a mottled camouflage on the house walls, so these two are plain paint (the fourth entry)
  gtSteel: ['steel_black', { tint: '#2a2d3a', dirt: 0.2, seed: 113 }, { color: 0x2a2d3a, rough: 0.5, metal: 0.3 }, { plain: true }],
  gtRoof: ['steel_black', { tint: '#30323c', dirt: 0.28, seed: 127 }, { color: 0x30323c, rough: 0.62, metal: 0.25 }, { plain: true }],
  towerSlab: ['concrete_precast', { tint: '#b7b3aa', dirt: 0.3, seed: 131 }, { color: 0xb7b3aa, rough: 0.9, metal: 0.0 }],
  // AR34 b5: the greenway's split-face granite wall and its coping
  wallGranite: ['granite_grey', { tint: '#9c8a83', dirt: 0.3, seed: 137, nrm: 1.2 }, { color: 0x9c8a83, rough: 0.85, metal: 0.0 }],   // b5_c: the pink set read salmon at 1:1
  copeGranite: ['granite_grey_flamed', { tint: '#a0958e', dirt: 0.25, seed: 139 }, { color: 0xa0958e, rough: 0.7, metal: 0.0 }],
  mortar: ['concrete_precast', { tint: '#5e5853', dirt: 0.4, seed: 141 }, { color: 0x5e5853, rough: 0.95, metal: 0.0 }],
  // AR34 b5: the rip-rap below the park south of the slip
  riprap: ['granite_grey_flamed', { tint: '#9a9893', dirt: 0.35, seed: 143, nrm: 1.0 }, { color: 0x9a9893, rough: 0.85, metal: 0.0 }],
  riprapWeed: ['granite_grey_flamed', { tint: '#56702f', dirt: 0.45, seed: 149, nrm: 1.0 }, { color: 0x56702f, rough: 0.7, metal: 0.0 }],
  sgCream: ['metal_painted', { tint: '#e6dcc6', dirt: 0.3, seed: 109 }, { color: 0xe6dcc6, rough: 0.5, metal: 0.05 }, { plain: true }],   // AR34: a clean cream lip (the set's chips read as grit)
};
const _cache = new Map();
// the named material (DEF key), shared; `side` for thin plates seen from both sides
export function hmat(key, side = THREE.FrontSide) {
  const k = key + '|' + side;
  if (_cache.has(k)) return _cache.get(k);
  const [name, opts, fb, fl] = DEF[key] || DEF.steel;
  let m = null;
  if (PBR && !(fl && fl.plain)) { try { m = PBR.pbrMaterial(name, { ...opts, side }); } catch (e) { m = null; } }
  if (!m) m = applyLightTrim(new THREE.MeshStandardMaterial({ color: fb.color, roughness: fb.rough, metalness: fb.metal, side }));
  _cache.set(k, m);
  return m;
}
export const hasPBR = () => !!PBR;
