// AR33 facade kit: materials (owner KIT, docs/notes/ar33-kit.md). The wall, stone, metal and glass sets come from
// mat/pbrLib.js `pbrMaterial(name, { tint, dirt, seed, baseY, topY, grimeAttr })` (owner MATS, docs/notes/ar33-materials.md)
// once it is in; until then (or with ?fkpbr=0) a local fallback: a MeshStandardMaterial of the family's colour through
// applyLightTrim + applyCityAO (the hot sun), a procedural brick bond in world space for the brick families, the stone
// grain of world/materials.js applyStoneDetail for stone and granite, the analytic sky mirror for glass and metal.
// The kit's own pieces (interiors, blinds, lit rooms, fire escape iron) are made here in either case.
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applyStoneDetail, applySkyGlass, applySkyMetal, SKYREFL_CHUNK } from '../../world/materials.js';
import { slatsTex, curtainTex, stainTex, postersTex, shopWallTex, shopAtlasTex, shopTile, shutterTex, shutterNormalTex, ribTex, ribAlbedoTex, roofStainTex, ROOF_STAIN_M, SHOP_KINDS } from './kitTex.js';
const SHOP_ROWS = SHOP_KINDS.length;

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const NOPBR = !!(Q && Q.get('fkpbr') === '0');
let PBR = null;
// a dynamic import: a broken mat/pbrLib.js (mid-edit) leaves the kit on its fallback instead of taking it down
export const matsReady = NOPBR ? Promise.resolve() : import('../mat/pbrLib.js')
  .then((m) => { PBR = m; console.log('[fk] materials: mat/pbrLib.js'); })
  .catch(() => { console.log('[fk] materials: mat/pbrLib.js not in yet, the kit\'s fallback materials'); });
export const hasPBR = () => !!PBR;
// AR34 w2 b1 (MATS 2, BID1 7, BID4 1): the city in the reflection (mat/pbrLib.js applyCityRefl) for the kit's own smooth
// paints, iron, ribbed cladding and shutters: three's environment is the sky alone, so their dark paints read navy by day
// (`?pbrcity=0` turns it off in pbrLib; the kit's fallback (`?fkpbr=0`) has none)
// (`?fkcity=0`: the kit's own materials without it, the A/B)
const FKCITY = !(Q && Q.get('fkcity') === '0');
// (AR34 w2 s5, LOOK 00:02: `?fkenv=0` drops the kit's default sky share on dark plain paints (0.3) and the fire-escape iron
// (0.5), the A/B for retiring them now that applyCityAO / applyLightTrim take the blue out engine-side; an explicit `env` stays)
const FKENV = !(Q && Q.get('fkenv') === '0');
const cityRefl = (m) => (FKCITY && PBR && PBR.applyCityRefl ? PBR.applyCityRefl(m) : m);

// ------------------------------------------------------------------ families (fallback colours, roughness, metalness)
const FAM = [
  [/^brick_white|^brick_glazed/, { c: '#e2ded5', r: 0.6, brick: 1 }],
  [/^brick_painted/, { c: '#e6e2da', r: 0.8, brick: 1 }],
  [/^brick_buff/, { c: '#c9b38c', r: 0.85, brick: 1 }],
  [/^brick_tan/, { c: '#b99a73', r: 0.85, brick: 1 }],
  [/^brick_brown/, { c: '#6b4a3a', r: 0.86, brick: 1 }],
  [/^brick_orange/, { c: '#a8603e', r: 0.86, brick: 1 }],
  [/^brick/, { c: '#8e4a36', r: 0.86, brick: 1 }],
  [/^brownstone/, { c: '#6e4b3a', r: 0.8, stone: 'climestone' }],
  [/^granite_pink/, { c: '#a88a80', r: 0.55, stone: 'cgranite' }],
  [/^granite/, { c: '#8b8a88', r: 0.55, stone: 'cgranite' }],
  [/^terracotta/, { c: '#e0d4bc', r: 0.55, stone: 'climestone' }],
  [/^stone|^limestone|^cast_stone/, { c: '#cfc6b4', r: 0.72, stone: 'climestone' }],
  [/^marble/, { c: '#e4e0d8', r: 0.35, stone: 'climestone' }],
  [/^concrete|^precast/, { c: '#a9a7a1', r: 0.85, stone: 'cpave' }],
  [/^stucco|^plaster|^eifs/, { c: '#cfc8bb', r: 0.9 }],
  [/^panel_alu|^panel/, { c: '#9a9ea3', r: 0.45, m: 0.5 }],
  [/^metal_painted|^metal/, { c: '#d8d0c0', r: 0.55, m: 0.15 }],
  [/^steel_rust/, { c: '#6b3a22', r: 0.8, m: 0.3 }],
  [/^steel|^iron/, { c: '#2b2d2c', r: 0.55, m: 0.55 }],
  [/^alu_bronze|^bronze/, { c: '#4a3b2c', r: 0.4, m: 0.7, sky: 1 }],
  [/^alu_black/, { c: '#1d1e20', r: 0.45, m: 0.6, sky: 1 }],
  [/^alu_white/, { c: '#e6e6e2', r: 0.45, m: 0.1 }],
  [/^alu|^stainless|^chrome/, { c: '#b8bcc0', r: 0.32, m: 0.85, sky: 1 }],
  [/^glass/, { c: '#1f262b', r: 0.05, glass: 1 }],
  [/^wood/, { c: '#6a5a48', r: 0.7 }],
  [/^roof_white|^membrane_white|^roof_tpo|^roof_membrane/, { c: '#c9c9c4', r: 0.85 }],
  [/^roof_black|^membrane_black|^roof_epdm/, { c: '#2c2d2f', r: 0.9 }],
  [/^gravel|^roof_gravel/, { c: '#8e8a82', r: 0.95 }],
  [/^mulch/, { c: '#4f6a36', r: 0.95 }],
  [/^pavers/, { c: '#9c958a', r: 0.9 }],
  [/^green/, { c: '#4f6a36', r: 0.95 }],
  [/^canvas|^fabric|^fab_/, { c: '#8a1c1c', r: 0.92, fab: 1 }],
];
const famOf = (name) => { for (const [re, f] of FAM) if (re.test(name)) return f; return { c: '#b8b2a8', r: 0.85 }; };

// ------------------------------------------------------------------ the procedural brick bond (fallback only)
// World space: along the wall's horizontal (perpendicular to its normal) and world y, a US modular brick (203 x 68 mm
// module, 10 mm joints), running or Flemish bond, each brick its own shade, the joints recessed in the normal.
function brickSkin(mat, bond = 'running') {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFkW; varying vec3 vFkN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 fp = vec4(transformed, 1.0); vec3 fn = objectNormal;
        #ifdef USE_INSTANCING
          fp = instanceMatrix * fp; fn = mat3(instanceMatrix) * fn;
        #endif
        vFkW = (modelMatrix * fp).xyz; vFkN = normalize(mat3(modelMatrix) * fn); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vFkW; varying vec3 vFkN;
      float fkH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float fkJ = 0.0;
      {
        vec3 n = normalize(vFkN);
        if (abs(n.y) < 0.6) {
          vec2 t = normalize(vec2(-n.z, n.x) + 1e-5);
          float s = dot(vFkW.xz, t), y = vFkW.y;
          float crs = floor(y / 0.0677);
          float L = ${bond === 'flemish' ? '0.1524' : '0.2032'};
          float off = mod(crs, 2.0) * L * 0.5;
          float bi = floor((s + off) / L);
          vec2 ib = vec2(fract((s + off) / L) * L, fract(y / 0.0677) * 0.0677);
          float aa = max(fwidth(s), fwidth(y)) * 1.2;
          float jx = 1.0 - smoothstep(0.0, 0.0095 + aa, min(ib.x, L - ib.x));
          float jy = 1.0 - smoothstep(0.0, 0.0095 + aa, min(ib.y, 0.0677 - ib.y));
          fkJ = max(jx, jy) * (1.0 - smoothstep(0.004, 0.012, aa));
          float h = fkH(vec2(bi, crs));
          vec3 tone = vec3(1.0 + (h - 0.5) * 0.22, 1.0 + (h - 0.5) * 0.18, 1.0 + (h - 0.5) * 0.14);
          float far = smoothstep(0.004, 0.012, aa);
          diffuseColor.rgb *= mix(tone, vec3(1.0), far);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.60, 0.56) * 0.9, fkJ * 0.75);
        }
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, fkJ);');
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|fkbrick' + bond;
  mat.needsUpdate = true;
  return mat;
}

// the streaks under sills and the soot under the roof line from the geometry's aGrime (fallback only; MATS's sets do
// their own weathering from the same attribute)
function grimeSkin(mat, amt = 0.35) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGrime; varying float vFkG; varying vec3 vFkGw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFkG = aGrime; vFkGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vFkG; varying vec3 vFkGw;
      float fkGh(float x) { return fract(sin(x * 91.7) * 4375.85); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float s = (vFkGw.x + vFkGw.z) * 7.0;
        float st = mix(fkGh(floor(s)), fkGh(floor(s) + 1.0), smoothstep(0.0, 1.0, fract(s)));
        float g = clamp(vFkG, 0.0, 1.0) * (0.45 + 0.9 * st);
        diffuseColor.rgb *= 1.0 - ${amt.toFixed(3)} * g;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.92, 0.9), g);
      }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|fkgrime' + amt;
  mat.needsUpdate = true;
  return mat;
}
// ------------------------------------------------------------------ the fallback
const CACHE = new Map();
function fallback(name, o) {
  const f = famOf(name);
  const col = new THREE.Color(o.tint || f.c);
  if (f.glass) {
    const g = new THREE.MeshStandardMaterial({ color: col, roughness: 0.04, metalness: 0.0, transparent: true, opacity: name.includes('storefront') || name.includes('clear') ? 0.22 : 0.42, depthWrite: false });
    applySkyGlass(applyLightTrim(g), { f0: 0.07, rough: 0.05 });
    g.userData.fkGlass = true;
    return g;
  }
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: f.r, metalness: f.m || 0, side: o.side || THREE.FrontSide });
  applyLightTrim(m);
  applyCityAO(m);
  if (f.brick) brickSkin(m, o.bond);
  if (o.grime) grimeSkin(m, 0.2 + 0.4 * (o.dirt ?? 0.35));
  if (f.stone) applyStoneDetail(m, f.stone, { amt: 0.35, nrm: 0.4, rgh: 0.3, scale: 0.7 });
  if (f.sky) applySkyMetal(m, { tint: [col.r * 0.9 + 0.1, col.g * 0.9 + 0.1, col.b * 0.9 + 0.1], rough: 0.2, brush: 0.6, gain: 0.35 });
  m.shadowSide = THREE.DoubleSide;
  return m;
}

// kitMat(name, { tint, dirt, seed, baseY, topY, grime, bond, side, chips, rough, nrm, scale, opacity, mapping }) -> a
// material, cached. chips / rough / nrm / scale / opacity / mapping go through to MATS's pbrMaterial (each distinct value
// of chips, rough or nrm is its own shader program: keep to a few). 'plain' / 'plain_<any>': a flat colour, smooth, no
// texture (a backing, a painted sheet): { tint, rough (0.6), metal (0) }.
// AR34 w2 (MATS 01:11 / 03:19): MATS's vision glass (glass_vision*: the office behind the pane drawn in its shader) takes
// storey [h, y0], bay, bayAt [x, z], blinds, sheers, glow, depth, trans, f0, street and room (and seed, below); each a
// uniform of one program, so a curtain zone's own grid is a material of its own, not a program
// (AR34 w2 s6, MATS 06:16 item 5: and `lit`, the share of its rooms lit at night (the library's default 0.4; HPT's curtains
// 0.2, night photograph 46); a curtain's `lit` already set the kit's own rooms, now also its vision glass's)
// (`?fklit=0` leaves it out: the library's default, as before)
const PASS = ['chips', 'rough', 'nrm', 'scale', 'opacity', 'mapping', 'body', 'env', 'storey', 'bay', 'bayAt', 'blinds', 'sheers', 'glow', 'depth', 'trans', 'f0', 'street', 'room', 'lit'];
const FKLIT = !(Q && Q.get('fklit') === '0');
export const VISION_KEYS = ['storey', 'bay', 'bayAt', 'blinds', 'sheers', 'glow', 'depth', 'trans', 'f0', 'street', 'room', 'lit'];
// (AR34 w2 s5: a material asked with no options (kitMat('int_blind'), once per window) comes from its own map; the full key,
// ~30 fields joined, was 4 % of the kit's build)
const CACHE0 = new Map();
export function kitMat(name, o) {
  if (o) for (const k in o) if (o[k] !== undefined) return kitMatO(name, o);
  let m = CACHE0.get(name);
  if (!m) { m = kitMatO(name, {}); CACHE0.set(name, m); }
  return m;
}
function kitMatO(name, o) {
  const key = `${name}|${o.tint || ''}|${o.dirt ?? ''}|${o.seed ?? ''}|${o.baseY ?? ''}|${o.topY ?? ''}|${o.grime ? 1 : 0}|${o.bond || ''}|${o.side || ''}|${o.weather ? 'w' : ''}|${PASS.map((k) => o[k] ?? '').join(',')}|${o.metal ?? ''}|${o.pitch ?? ''}|${o.dir || ''}|${o.share === false ? 'ns' : ''}`;
  let m = CACHE.get(key);
  if (m) return m;
  // AR34: ribbed / corrugated metal cladding ('ribbed', 'ribbed_<any>' box ribs every 0.15 m; 'corrugated' a 68 mm wave):
  // { tint, pitch, dir: 'v' (ribs upright, default) | 'h', rough (0.5), metal (0.3) }; one program for all of them
  if (/^(ribbed|corrugated)/.test(String(name))) {
    const wave = /^corrugated/.test(String(name)), pitch = +(o.pitch ?? (wave ? 0.068 : 0.15));
    const a = ribAlbedoTex(pitch).clone(), nm = ribTex(pitch, wave ? 'wave' : 'box').clone();
    if (o.dir === 'h') for (const t of [a, nm]) { t.rotation = Math.PI / 2; t.needsUpdate = true; }
    m = S({ color: new THREE.Color(o.tint || '#8f9396'), map: a, normalMap: nm, normalScale: new THREE.Vector2(1, 1), roughness: +(o.rough ?? 0.5), metalness: +(o.metal ?? 0.3), side: o.side || THREE.FrontSide });
    m.name = 'fk:ribbed';
    cityRefl(m);
    CACHE.set(key, m);
    return m;
  }
  if (/^plain/.test(String(name))) {
    // (AR34: one white material per finish, the colour per vertex through the shared-material path, as the wall sets)
    // (AR34 w2: a dark plain paint takes the sky at 0.3 unless `env` is given, as the dark sets below)
    const dl = o.env === undefined ? hexLin(o.tint || '#8c8c8a') : null;
    const env = FKENV && dl && 0.2126 * dl[0] + 0.7152 * dl[1] + 0.0722 * dl[2] < 0.068 ? 0.3 : o.env;
    const base = plainBase(+(o.rough ?? 0.6), +(o.metal ?? 0), o.side || THREE.FrontSide, env);
    const r = FKTR && o.share !== false ? ratioOf(o.tint || '#8c8c8a', '#ffffff') : null;
    // (a handle is never drawn by the kit; one a custom builder puts on a mesh of its own still shows its colour)
    if (r) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.tint || '#8c8c8a'), roughness: +(o.rough ?? 0.6), metalness: +(o.metal ?? 0) }); m.name = 'fk:handle'; m.userData = { fkBase: base, fkTr: r }; }
    else {
      m = S({ color: new THREE.Color(o.tint || '#8c8c8a'), roughness: +(o.rough ?? 0.6), metalness: +(o.metal ?? 0), side: o.side || THREE.FrontSide });
      m.name = 'fk:plain';
      if (env !== undefined) envScale(m, Math.max(0, +env));
      cityRefl(m);
    }
    CACHE.set(key, m);
    return m;
  }
  if (PBR && !/^(int_|fab_)/.test(String(name))) {
    const xo = {};
    for (const k of PASS) if (o[k] !== undefined && o[k] !== null && (FKLIT || k !== 'lit')) xo[k] = o[k];
    // AR34 w2 (BID1 7, BID4 1): a dark smooth paint (a painted-metal, panel or painted-wood set in a tint darker than
    // about #4a4a4a) takes the sky in its specular at 0.3 unless the spec gives `env`: at full strength the black
    // cornices of 381-375 read #40474b (real #1d2123) and BID4's black trim navy
    // (19:25: no default here any more: it never reached the shader, see envScale, and MATS now takes the city into its
    // sets' reflection; an explicit `env` still applies)
    // AR34: the kit's wall sets share one material per set and options, the tint per vertex (fewer draw calls)
    if (o.weather && FKTR) {
      const base = sharedBase(name, o, xo);
      if (base) {
        const dv = FKDIRT && o.dirt !== undefined && o.dirt !== null ? +o.dirt : undefined;
        if (!o.tint && dv === undefined) m = base;
        else {
          const r = o.tint ? ratioOf(o.tint, base.userData.fkBaseHex) : ONE3K;
          if (r) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.tint || base.userData.fkBaseHex) }); m.name = 'fk:handle'; m.userData = { fkBase: base, fkTr: r, fkDirt: dv, pbr: base.userData.pbr }; }
        }
        if (m) { CACHE.set(key, m); return m; }
      }
    }
    if (!o.weather && FKTR && FKMET && o.share !== false && o.seed === undefined) {
      const base = sharedMetalBase(name, o, xo);
      if (base) {
        const dv = FKDIRT && o.dirt !== undefined && o.dirt !== null ? +o.dirt : undefined;
        // (a paint base made at the neutral grey (FKNEUT) draws a writer that gives no tint at its set's own tint)
        const ud = base.userData, tn = o.tint || (ud.fkSetHex && ud.fkSetHex !== ud.fkBaseHex ? ud.fkSetHex : undefined);
        if (!tn && dv === undefined) m = base;
        else {
          const r = tn ? ratioOf(tn, ud.fkBaseHex) : ONE3K;
          if (r) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tn || ud.fkBaseHex) }); m.name = 'fk:handle'; m.userData = { fkBase: base, fkTr: r, fkDirt: dv, pbr: ud.pbr }; }
        }
        if (m) { CACHE.set(key, m); return m; }
      }
    }
    if (FKGLS && o.share !== false && /^glass_tower/.test(String(name))) {
      const base = sharedGlassBase(name, o, xo);
      if (base) {
        const bl = xo.body ? hexLin(xo.body) : null;
        const r = o.tint ? ratioOf(o.tint, base.userData.fkBaseHex) : ONE3K;
        if (r) {
          m = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.tint || base.userData.fkBaseHex) }); m.name = 'fk:handle';
          m.userData = { fkBase: base, fkTr: r, fkBo: [bl ? bl[0] : -1, bl ? bl[1] : -1, bl ? bl[2] : -1, o.dirt !== undefined && o.dirt !== null ? +o.dirt : -1], pbr: base.userData.pbr };
          CACHE.set(key, m); return m;
        }
      }
    }
    try {
      m = o.weather ? PBR.pbrMaterial(name, { tint: o.tint, dirt: o.dirt, grimeAttr: !!o.grime, weatherAttr: true, side: o.side, ...xo })
        : PBR.pbrMaterial(name, { tint: o.tint, dirt: o.dirt, seed: o.seed, baseY: o.baseY, topY: o.topY, grimeAttr: !!o.grime, side: o.side, ...xo });
    } catch (e) { console.warn('[fk] pbrMaterial', name, e); m = null; }
    if (m) m = unbakeSkyMetal(m);
    // `env` (0..1): the sky's share in the specular (a dark smooth paint read lighter and bluer than its tint: BID1 7);
    // `env` is in pbrMaterial's options, so this material is this option set's own
    if (m && xo.env !== undefined) envScale(m, Math.max(0, +xo.env));
  }
  if (!m && FKATLAS && /^int_(shop|goods)(@|$)/.test(String(name))) {
    // (AR34 w2: a shop room's or its goods' light level per vertex, one material for every level; see levelBase)
    const [base, lv] = String(name).split('@'), lit = lv !== undefined ? +lv : 1;
    m = base === 'int_shop'
      ? levelHandle('shop', () => levelBase(IN({ color: 0xffffff, vertexColors: true, roughness: 0.8 }, 0.3, 0.7), 0.13, 1.3, false), [lit, 0, 0], `sh:${lit}`)
      : levelHandle('goods', () => levelBase(IN({ color: 0xffffff, vertexColors: true, roughness: 0.75 }, 0.3, 0.7), 0.22, 1.1, false), [lit, 0, 0], `gd:${lit}`);
    CACHE.set(key, m);
    return m;
  }
  if (!m) {
    const [base, lv] = String(name).split('@');
    m = KIT_OWN[base] ? KIT_OWN[base]({ ...o, lit: lv !== undefined ? +lv : 1 }) : fallback(name, o);
  }
  if (m && !m.userData.fkGlass && !m.transparent) m.shadowSide = THREE.DoubleSide;
  // (a name for the kit's own materials, for the draw-call probes; three's program key does not read it)
  if (m && !m.name) m.name = 'fk:' + String(name).split('@')[0];
  CACHE.set(key, m);
  return m;
}
export const isGlass = (m) => !!(m && (m.transparent || m.userData.fkGlass));

// ------------------------------------------------------------------ the kit's own pieces
function nightEmit(m, k = 1) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.fkN = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float fkN;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= fkN * ${k.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fknight' + k;
  m.needsUpdate = true;
  return m;
}
const S = (o) => { const m = applyCityAO(applyLightTrim(new THREE.MeshStandardMaterial(o))); m.shadowSide = THREE.DoubleSide; return m; };
// AR34: an interior seen from the street by day takes only a share of the outdoor light (the room is lit through its
// window, the sky light is not occluded by anything in the engine), so rooms, shops and their goods read dark behind the
// a lit shop adds its own light (selfLit). kInd scales the indirect (sky, probe) light, kDir the
// direct (sun through the opening, mostly shadowed by the wall already).
function inside(m, kInd = 0.3, kDir = 0.7) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= ${kInd.toFixed(3)}; reflectedLight.indirectSpecular *= ${kInd.toFixed(3)};
      reflectedLight.directDiffuse *= ${kDir.toFixed(3)}; reflectedLight.directSpecular *= ${kDir.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fkin' + kInd + ',' + kDir;
  m.needsUpdate = true;
  return m;
}
const IN = (o, kInd, kDir) => inside(S(o), kInd, kDir);
// a shop lit from inside, by day as well (the lights are on in business hours): the surface's own albedo (vertex
// colours included) as emission, dayK by day rising to nightK after dark
// (the day and night levels are the material's own uniforms: every light level of every shop shares one program)
function selfLit(m, dayK, nightK) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  const fkLv = { value: new THREE.Vector2(dayK, nightK) };
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.fkN = ENV.night;
    sh.uniforms.fkLv = fkLv;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float fkN; uniform vec2 fkLv;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * mix(fkLv.x, fkLv.y, fkN);`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fkselfU';
  m.needsUpdate = true;
  return m;
}
// AR34: shared set materials. A wall set (brick, stone, stucco, concrete, terracotta, granite: MATS's non-metal sets) is one
// material per set and options for every building of the kit; each writer's tint goes per vertex (aFkTr = its tint over the
// set's default tint, linear) and multiplies pbRatio in the shader, which is what a material of that tint computes. Checked
// on a stand-in shader first (the albedo line must be there); `?fktr=0` keeps one material per tint (the A/B).
const FKTR = !(Q && Q.get('fktr') === '0');
// AR34 w2 b1 (draw calls): MATS's metal sets (panel_alu, panel_grey, metal_painted, alu_*: the kit's frames, gate boxes,
// fascias, copings) shared the same way, one material per set and options, the tint per vertex (and in the sky mirror's
// tint for the bright metals); `?fkmet=0` = one material per tint as before (the A/B)
const FKMET = !(Q && Q.get('fkmet') === '0');
// AR34 w2 s6 (MATS 06:16, its diff): a shared set material's dirt per vertex (aWeather.w, the library's dirtAttr), so one
// base per set and options serves every dirt; the opaque tower glasses one base per set and options, their tint, body and
// dirt per vertex (the library's tintAttr: aFkTr, aPgBody); `?fkdirt=0` / `?fkgls=0` = one material per dirt / per glass
// colour, as before
const FKDIRT = !(Q && Q.get('fkdirt') === '0');
const FKGLS = !(Q && Q.get('fkgls') === '0');
// AR34 w2 s6 (MATS 06:16 / 06:25): the paint bases (metal_painted, steel_black, wood_painted) made at a neutral grey, so a
// writer's tint ratio stays under ratioOf's cap of 8: at the set's own dark tint (metal_painted #1f3327, steel_black #151617)
// a light or red tint lost its strong channels (BID4's 44 W pier, #94645a, drew green-grey); a writer with no tint keeps
// its set's tint (fkSetHex). The bright metals keep their set's tint (the sky mirror's 7 % floor is computed on the base's
// tint). `?fkneut=0` = before
const FKNEUT = !(Q && Q.get('fkneut') === '0');
const NEUTRAL = '#808080';
const BASES = new Map();
const srgbLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const hexLin = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => srgbLin(parseInt(h.slice(i, i + 2), 16) / 255)) : null);
function ratioOf(tint, baseHex) {
  const a = hexLin(tint), b = hexLin(baseHex);
  if (!a || !b) return null;
  return a.map((v, i) => Math.min(8, v / Math.max(b[i], 1e-3)));
}
const TR_A = 'alb *= pbRatio;', TR_P = 'vec3 pc = pbRatio * pbLum(alb);';
// the shared 'plain' finishes: white, the writer's colour per vertex (aFkTr, linear) multiplied in at color_fragment
const PLAIN = new Map();
function plainBase(rough, metal, side, env) {
  const k = `${rough}|${metal}|${side}|${env ?? ''}`;
  let m = PLAIN.get(k);
  if (m) return m;
  m = S({ color: 0xffffff, roughness: rough, metalness: metal, side });
  if (env !== undefined) envScale(m, Math.max(0, +env));
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFkTr; varying vec3 vFkTr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFkTr = aFkTr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFkTr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vFkTr;');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fkplain';
  m.name = 'fk:plain';
  m.userData.fkShared = true;
  cityRefl(m);
  m.needsUpdate = true;
  PLAIN.set(k, m);
  return m;
}
const ONE3K = [1, 1, 1];
function sharedBase(name, o, xo) {
  const k = `${name}|${FKDIRT ? '*' : o.dirt ?? ''}|${o.grime ? 1 : 0}|${o.side || ''}|${JSON.stringify(xo)}`;
  if (BASES.has(k)) return BASES.get(k);
  let base = null;
  try {
    const info = PBR.pbrInfo ? PBR.pbrInfo(name) : null;
    const m0 = info && info.family !== 'metal' && info.family !== 'glass' ? PBR.pbrMaterial(name, { tint: undefined, dirt: FKDIRT ? undefined : o.dirt, grimeAttr: !!o.grime, weatherAttr: true, dirtAttr: FKDIRT || undefined, side: o.side, ...xo }) : null;
    if (m0 && !m0.transparent && hexLin(info.mean)) {
      if (m0.userData.fkShared) base = m0;
      else {
        const obc = m0.onBeforeCompile, key0 = m0.customProgramCacheKey;
        const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>' };
        obc.call(m0, sh, undefined);
        if (sh.fragmentShader.includes(TR_A) || sh.fragmentShader.includes(TR_P)) {
          m0.onBeforeCompile = (s2, r) => {
            obc.call(m0, s2, r);
            s2.vertexShader = s2.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFkTr; varying vec3 vFkTr;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFkTr = aFkTr;');
            s2.fragmentShader = s2.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFkTr;')
              .replace(TR_A, 'alb *= pbRatio * vFkTr;').replace(TR_P, 'vec3 pc = pbRatio * vFkTr * pbLum(alb);');
          };
          m0.customProgramCacheKey = () => (typeof key0 === 'function' ? key0.call(m0) : '') + '|fktr';
          m0.userData.fkShared = true;
          m0.userData.fkBaseHex = info.mean;
          m0.shadowSide = THREE.DoubleSide;
          if (xo.env !== undefined) envScale(m0, Math.max(0, +xo.env));
          m0.needsUpdate = true;
          base = m0;
        }
      }
    }
  } catch (e) { base = null; }
  BASES.set(k, base);
  return base;
}
// AR34 w2 b1: a metal set shared across tints (see FKMET): built with weatherAttr (its own cache entry in pbrLib, never a
// material a custom builder's mesh draws without aFkTr), checked on a stand-in shader first: the albedo line must be there,
// and for a bright metal the sky mirror's tint line (applySkyMetal), which takes the per-vertex ratio too
const MBASES = new Map();
function sharedMetalBase(name, o, xo) {
  const k = `${name}|${FKDIRT ? '*' : o.dirt ?? ''}|${o.side || ''}|${JSON.stringify(xo)}`;
  if (MBASES.has(k)) return MBASES.get(k);
  let base = null;
  try {
    const info = PBR.pbrInfo ? PBR.pbrInfo(name) : null;
    const neut = FKNEUT && info && info.family === 'paint';
    const m0 = info && (info.family === 'metal' || info.family === 'paint') && hexLin(info.mean) ? PBR.pbrMaterial(name, { tint: neut ? NEUTRAL : undefined, dirt: FKDIRT ? undefined : o.dirt, weatherAttr: true, dirtAttr: FKDIRT || undefined, side: o.side, ...xo }) : null;
    if (m0 && !m0.transparent && !m0.userData.fkShared) {
      const obc = m0.onBeforeCompile, key0 = m0.customProgramCacheKey;
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <lights_fragment_end>' };
      obc.call(m0, sh, undefined);
      const fs0 = sh.fragmentShader;
      const albOK = fs0.includes(TR_A) || fs0.includes(TR_P);
      // (the sky mirror's tint: baked (`vec3 tn = vec3(..)`, before LOOK34) or world/materials.js's uniform (`vec3 tn = uSmTn;`))
      const nBaked = (fs0.match(new RegExp(SM_RE.source, 'g')) || []).length, nU = fs0.split(SM_U).length - 1;
      const sky = nBaked + nU > 0 || (typeof key0 === 'function' && key0.call(m0).includes('|skymetal'));
      const smOK = !sky || nBaked + nU === 1;
      if (albOK && smOK) {
        m0.onBeforeCompile = (s2, r) => {
          obc.call(m0, s2, r);
          s2.vertexShader = s2.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFkTr; varying vec3 vFkTr;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFkTr = aFkTr;');
          let f = s2.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFkTr;')
            .replace(TR_A, 'alb *= pbRatio * vFkTr;').replace(TR_P, 'vec3 pc = pbRatio * vFkTr * pbLum(alb);');
          if (sky) f = nU ? f.replace(SM_U, 'vec3 tn = uSmTn * vFkTr;') : f.replace(SM_RE, (mm, a, b, c) => `vec3 tn = vec3(${a}, ${b}, ${c}) * vFkTr;`);
          s2.fragmentShader = f;
        };
        m0.customProgramCacheKey = () => (typeof key0 === 'function' ? key0.call(m0) : '') + '|fktrm';
        m0.userData.fkShared = true;
        m0.userData.fkBaseHex = neut ? NEUTRAL : info.mean;
        m0.userData.fkSetHex = info.mean;
        m0.shadowSide = THREE.DoubleSide;
        if (xo.env !== undefined) envScale(m0, Math.max(0, +xo.env));
        m0.needsUpdate = true;
        base = m0;
      }
    }
  } catch (e) { base = null; }
  MBASES.set(k, base);
  return base;
}
// AR34 w2 s6 (MATS 06:16): the opaque tower glasses: one base per set and options (side, f0, street ...), the tint (aFkTr), body and
// dirt (aPgBody) per vertex through MATS's tintAttr
const GBASES = new Map();
function sharedGlassBase(name, o, xo) {
  const xg = { ...xo }; delete xg.body;
  const k = `${name}|${o.side || ''}|${JSON.stringify(xg)}`;
  if (GBASES.has(k)) return GBASES.get(k);
  let base = null;
  try {
    const info = PBR.pbrInfo ? PBR.pbrInfo(name) : null;
    const m0 = info && info.family === 'glass' && hexLin(info.mean) ? PBR.pbrMaterial(name, { tintAttr: true, side: o.side, ...xg }) : null;
    if (m0 && !m0.transparent) {
      m0.userData.fkShared = true; m0.userData.fkGlassShared = true; m0.userData.fkBaseHex = info.mean;
      base = m0;
    }
  } catch (e) { base = null; }
  GBASES.set(k, base);
  return base;
}
// AR34: world/materials.js applySkyMetal bakes a metal's tint into its shader, so MATS's metal sets (panel_alu, alu_*,
// stainless, galvanized) compile one program per tint: 109 panel_alu programs at apFront (docs/notes/ar33-kit.md). The
// kit's copies take the tint as a uniform instead; checked on a stand-in shader first, and left as they are if the
// pattern is not there (a material whose key dropped the tint while its shader kept it would draw another one's colour).
const SM_RE = /vec3 tn = vec3\(([-0-9.e]+), ([-0-9.e]+), ([-0-9.e]+)\);/;
const SM_U = 'vec3 tn = uSmTn;';
function unbakeSkyMetal(m) {
  if (!m || m.userData.fkSmU || typeof m.customProgramCacheKey !== 'function') return m;
  const key0 = m.customProgramCacheKey.call(m);
  if (!key0.includes('|skymetal')) return m;
  const obc = m.onBeforeCompile;
  let tn = null;
  try {
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    obc.call(m, sh, undefined);
    const mm = SM_RE.exec(sh.fragmentShader);
    if (mm) tn = [+mm[1], +mm[2], +mm[3]];
  } catch (e) { tn = null; }
  if (!tn) return m;
  const fkTn = { value: new THREE.Vector3(tn[0], tn[1], tn[2]) };
  const base = key0.split('|skymetal')[0];
  m.onBeforeCompile = (sh, r) => {
    obc.call(m, sh, r);
    sh.uniforms.fkSmTn = fkTn;
    sh.fragmentShader = sh.fragmentShader.replace(SM_RE, 'vec3 tn = fkSmTn;').replace('#include <common>', '#include <common>\nuniform vec3 fkSmTn;');
  };
  m.customProgramCacheKey = () => base + '|skymetalU';
  m.userData.fkSmU = true;
  m.needsUpdate = true;
  return m;
}
// the window glass of the floors above the shops: transparent and premultiplied like MATS's glass (the room behind shows
// through, the reflection is added unfaded), but the reflection is taken from the pane's own vertex normal (the kit tilts
// each pane a little) and each pane carries its own character in its vertex colour: r = reflectance, g = dirt film,
// b = clarity (1 clear, lower = frosted or tinted). The street canyon term: below ~30 m a window mirrors the wall opposite
// (mid grey), not the sky, so the glass of the lower floors is darker than the glass of the top.
function winGlass(o) {
  // (AR34 w2: f0 0.12, a sash with its storm window: four faces of glass; the sun's glint keeps a single pane's 0.05)
  const f0 = o.f0 ?? 0.2, op = o.opacity ?? 0.36, dirt = o.dirt ?? 0.3, rough = o.rough ?? 0.03, cf = o.canyon ?? 0.26;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e4ecea'), roughness: rough, metalness: 0, transparent: true, opacity: op, depthWrite: false, vertexColors: true });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRefl = ENV.reflGain; sh.uniforms.uSunD = ENV.sunDir; sh.uniforms.uSunC = ENV.sunColor;
    sh.uniforms.uZenC = ENV.skyAmbient; sh.uniforms.uHorC = ENV.fogColor; sh.uniforms.kgNight = ENV.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKgW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 kgP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            kgP = instanceMatrix * kgP;
          #endif
          vKgW = (modelMatrix * kgP).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vKgW;
        uniform float uRefl; uniform vec3 uSunD; uniform vec3 uSunC; uniform vec3 uZenC; uniform vec3 uHorC; uniform float kgNight;
        ${SKYREFL_CHUNK}
        float kgH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float kgN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(kgH(i), kgH(i + vec2(1.0, 0.0)), f.x), mix(kgH(i + vec2(0.0, 1.0)), kgH(i + vec2(1.0, 1.0)), f.x), f.y); }
        vec3 kgRefl; float kgFr;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 Nw = inverseTransformDirection(normal, viewMatrix);
        vec3 Vg = normalize(cameraPosition - vKgW);
        if (dot(Nw, Vg) < 0.0) Nw = -Nw;
        vec3 Rg = reflect(-Vg, Nw);
        float cosT = max(dot(Vg, Nw), 0.0);
        kgFr = fresnelR(cosT, ${f0.toFixed(4)});
        bool noCol = (vColor.r + vColor.g + vColor.b) < 0.01;
        float kR = noCol ? 1.0 : vColor.r, kD = noCol ? 1.0 : vColor.g, kO = noCol ? 1.0 : vColor.b;
        float film = (kgN(vKgW.xz * 0.9 + vKgW.y * 0.5) * 0.6 + kgN(vec2(vKgW.x + vKgW.z, vKgW.y * 3.1) * 2.3) * 0.4) * ${dirt.toFixed(3)} * kD;
        // old float glass: a slow ripple in the reflected direction
        vec3 Rw = normalize(Rg + (vec3(kgN(vKgW.xy * 2.1), 0.0, kgN(vKgW.zy * 2.1 + 3.1)) - 0.5) * 0.03);
        // AR34 w2 (BID1 8): what the pane mirrors. A ray reflected from a pane below the roofline of the street wall
        // opposite (30 m off: 125th Street's building lines) meets that wall first: its masonry (each building its own
        // tone), its windows, the shop band and its signs, or the street in front of it; over the roofline the sky. Was the
        // sky times a height ramp (0.26 below 6 m), which read every pane of the lower floors near black.
        vec3 kgSky = skyLook(Rw, uSunD, uSunC, uZenC, uHorC, uRefl, 1.4);
        float kgT = 30.0 / max(dot(Rw, Nw), 0.06);
        float kgHy = vKgW.y + Rw.y * kgT - min(cameraPosition.y - 1.7, vKgW.y);
        vec3 kgTw = normalize(vec3(-Nw.z, 0.0, Nw.x) + vec3(1e-5, 0.0, 0.0));
        float kgU = dot(vKgW + Rw * kgT, kgTw);
        float kgAA = clamp(1.5 - 4.0 * max(fwidth(kgU) / 2.7, fwidth(kgHy) / 3.3), 0.0, 1.0);
        // (19:30, QA Q21: at a grazing look along the shop fronts the window rows of a far stretch of the street read as
        // curved dashes printed on the glass; the rows and signs fade to the wall's mean beyond ~45 m of reflected run and
        // below a 15-30 degree reflection off the pane, as a real reflection there is a blur of fronts and sky)
        kgAA *= smoothstep(0.25, 0.5, dot(Rw, Nw)) * (1.0 - smoothstep(45.0, 80.0, kgT));
        float kgB = floor(kgU / 11.0);
        vec3 kgHn = mix(vec3(dot(uHorC, vec3(0.2126, 0.7152, 0.0722))), uHorC, 0.35);
        vec3 kgWall = kgHn * mix(vec3(1.05, 0.9, 0.78), vec3(0.86, 0.87, 0.9), kgH(vec2(kgB, 7.0))) * (0.7 + 0.6 * kgH(vec2(kgB, 3.0))) * uRefl;
        float kgWin = (1.0 - smoothstep(0.17, 0.22, abs(fract(kgU / 2.7) - 0.5))) * (1.0 - smoothstep(0.2, 0.26, abs(fract((kgHy - 4.0) / 3.3) - 0.5))) * step(4.6, kgHy);
        float kgSign = smoothstep(3.0, 3.15, kgHy) * (1.0 - smoothstep(3.95, 4.1, kgHy));
        vec3 kgOpp = mix(kgWall * mix(0.72, mix(0.85, 0.38, kgWin), kgAA), kgWall * mix(0.62, mix(0.45, 1.25, kgSign), kgAA), 1.0 - smoothstep(3.9, 4.4, kgHy));
        kgOpp = kgHy < 0.0 ? kgHn * vec3(0.34, 0.33, 0.31) * uRefl : kgOpp;
        float kgSkyF = smoothstep(14.0, 27.0, kgHy);
        kgRefl = mix(kgOpp, kgSky, kgSkyF) * diffuse * kgFr * kR * (1.0 - film * 0.55);
        kgRefl += uSunC * diffuse * sunDisc(Rw, uSunD, ${rough.toFixed(3)} + film * 0.1, length(fwidth(vKgW)) * 0.05) * fresnelR(cosT, 0.05) * kgSkyF * 12.0 * uRefl * (1.0 - kgNight) * kR;
        diffuseColor.rgb = diffuse * (0.04 + film * 0.3);
        diffuseColor.a = clamp(opacity * (1.0 + (1.0 - kO) * 1.4) + film * 0.14, 0.0, 0.95);
      }`)
      .replace('#include <opaque_fragment>', `
        {
          float a = clamp(diffuseColor.a, 0.0, 1.0);
          float at = a + (1.0 - a) * kgFr;
          // AR34: the pane's mirror is kgRefl alone (Fresnel, the street canyon below ~30 m); three's own environment
          // specular on top of it read every pane of the lower floors as white paper from the sidewalk (BID1, 351 W 125th)
          gl_FragColor = vec4(max(outgoingLight - totalSpecular, vec3(0.0)) * a + kgRefl, at);
        }`);
  };
  mat.customProgramCacheKey = () => 'kitwinglass3|' + f0 + '|' + rough + '|' + dirt + '|' + cf;
  mat.userData.fkGlass = true;
  return mat;
}
// AR34 w2: `env` as the share of the environment in the specular, in the shader: three r185 overwrites a material's
// envMapIntensity with scene.environmentIntensity whenever material.envMap is null and scene.environment is set (MATS,
// 19:20), so `m.envMapIntensity = env` never reached the shader. Wrapped once per material (userData.fkEnv).
function envScale(m, k) {
  if (!m || m.userData.fkEnv !== undefined || !(k >= 0) || k >= 0.999) return m;
  m.userData.fkEnv = k;
  // (the share is the material's own uniform: every value shares one program)
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey, fkEnvK = { value: +k };
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.fkEnvK = fkEnvK;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float fkEnvK;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectSpecular *= fkEnvK;`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fkenvU';
  m.needsUpdate = true;
  return m;
}
// AR34 w2: a map at k of its contrast (diffuse *= mix(1, map, k)): the sheers' soft folds
function softMap(m, k) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb, ${k.toFixed(3)});
      #endif`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fksoft' + k;
  m.needsUpdate = true;
  return m;
}
const sheerTex = () => { const t = curtainTex().clone(); t.repeat.set(1 / 0.7, 1); t.needsUpdate = true; return t; };
// textured surfaces of the kit: the wall of a shop behind the glass (self-lit like int_shop), posters, slats, curtains, stains
// AR34 w2 (draw calls; `?fkatlas=0` = one material per kind, variant and light level as before, the A/B): the shop walls
// (one atlas, fk/kitTex.js shopAtlasTex), the shop rooms and goods (int_shop@lvl, int_goods@lvl) and the posters are one
// material each: the light level per vertex (aFkTr.x, the emission dayK..nightK times it), the shop wall's atlas tile per
// vertex (aFkTr.yz); each (kind, variant, level) is a handle (userData.fkBase / fkTr) the cell's sink resolves to the base
const FKATLAS = !(Q && Q.get('fkatlas') === '0');
function levelBase(m, dayK, nightK, atlas) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.fkN = ENV.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFkTr; varying vec3 vFkTr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFkTr = aFkTr;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float fkN; varying vec3 vFkTr;');
    if (atlas) {
      fs = fs.replace('#include <map_fragment>', `#ifdef USE_MAP
        { vec2 sc = vec2(0.25, 1.0 / ${SHOP_ROWS.toFixed(1)}); vec2 f = clamp(vMapUv - floor(vMapUv * 0.99999), vec2(0.004), vec2(0.996));
          diffuseColor *= textureGrad(map, vFkTr.yz + f * sc, dFdx(vMapUv) * sc, dFdy(vMapUv) * sc); }
        #endif`);
    }
    sh.fragmentShader = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vFkTr.x * mix(${dayK.toFixed(3)}, ${nightK.toFixed(3)}, fkN);`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|fklv' + (atlas ? 'a' : '') + dayK + ',' + nightK;
  m.userData.fkShared = true;
  m.shadowSide = THREE.DoubleSide;
  m.needsUpdate = true;
  return m;
}
const LVB = {}, LVH = new Map();
function levelHandle(bk, mk, tr, key) {
  let h = LVH.get(key);
  if (!h) {
    const base = LVB[bk] || (LVB[bk] = mk());
    if (!base.name) base.name = 'fk:lv:' + bk;
    h = new THREE.MeshStandardMaterial();
    h.name = 'fk:handle';
    h.userData = { fkBase: base, fkTr: tr };
    LVH.set(key, h);
  }
  return h;
}
const SHOP_MATS = new Map();
export function kitShopWallMat(kind, variant, lit = 1) {
  if (FKATLAS) {
    const [tu, tv] = shopTile(kind, variant);
    return levelHandle('shopwall', () => levelBase(IN({ color: 0xffffff, vertexColors: true, roughness: 0.85, map: shopAtlasTex() }, 0.3, 0.7), 0.16, 1.25, true), [lit, tu, tv], `sw:${kind}:${variant}:${lit}`);
  }
  const key = `${kind}:${variant}:${lit}`;
  let m = SHOP_MATS.get(key);
  if (!m) {
    m = selfLit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.85, map: shopWallTex(kind, variant) }, 0.3, 0.7), 0.16 * lit, 1.25 * lit);
    m.shadowSide = THREE.DoubleSide;
    SHOP_MATS.set(key, m);
  }
  return m;
}
let _poster = null;
export function kitPosterMat(lit = 1) {
  if (FKATLAS) return levelHandle('poster', () => levelBase(IN({ color: 0xffffff, roughness: 0.6, map: postersTex(), side: THREE.DoubleSide }, 0.45, 0.8), 0.2, 0.9, false), [lit, 0, 0], `po:${lit}`);
  if (!_poster) { _poster = selfLit(IN({ color: 0xffffff, roughness: 0.6, map: postersTex(), side: THREE.DoubleSide }, 0.45, 0.8), 0.2 * lit, 0.9 * lit); }
  return _poster;
}
// AR34: a graffiti layer (fk/kitTex.js graffitiTex) as a decal over a wall or a curtain: the paint with its alpha, its own
// sheen (roughnessMap), on a curtain the slats' normal map so the paint follows them. One material per painted zone (its
// own canvas), one program for all of them. uv: the decal quad's metre UVs map onto the zone [u0, u0 + wM] x [y0, y0 + hM].
export function kitGraffitiMat(tx, wM, hM, u0 = 0, y0 = 0, o = {}) {
  const map = tx.map.clone(), rough = tx.rough.clone();
  for (const t of [map, rough]) { t.repeat.set(1 / wM, 1 / hM); t.offset.set(-u0 / wM, -y0 / hM); t.needsUpdate = true; }
  const m = S({ color: 0xffffff, map, roughnessMap: rough, roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    ...(o.slats ? { normalMap: shutterNormalTex(), normalScale: new THREE.Vector2(1, 1) } : {}) });
  m.name = 'fk:graffiti';
  return m;
}
// AR34: a roll-down security curtain in the gate's colour: 75 mm slats in the albedo and the normal map, tags in a share
const _shut = new Map();
export function kitShutterMat(color = '#8e9396', variant = 0) {
  const key = `${color}:${variant}`;
  let m = _shut.get(key);
  if (!m) {
    m = S({ color: new THREE.Color(color), map: shutterTex(variant), normalMap: shutterNormalTex(), normalScale: new THREE.Vector2(1, 1), roughness: 0.48, metalness: 0.25 });
    m.name = 'fk:shutter';
    cityRefl(m);
    _shut.set(key, m);
  }
  return m;
}
// AR34: the roof membrane's weathering decal (fk/kitTex.js roofStainTex, world metres, a 24 m tile)
let _roofStain = null;
export function kitRoofStainMat() {
  if (!_roofStain) {
    const t = roofStainTex().clone(); t.repeat.set(1 / ROOF_STAIN_M, 1 / ROOF_STAIN_M); t.needsUpdate = true;
    _roofStain = S({ map: t, color: 0xffffff, roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    _roofStain.name = 'fk:roofstain';
  }
  return _roofStain;
}
const _stain = {};
export function kitStainMat(kind = 'drip') {
  let m = _stain[kind];
  if (!m) {
    m = S({ map: stainTex(kind), color: 0xffffff, roughness: 1, transparent: true, depthWrite: false, opacity: kind === 'rust' ? 0.62 : 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    m.name = 'fk:stain:' + kind;
    _stain[kind] = m;
  }
  return m;
}
const KIT_OWN = {
  // the glass of the upper windows (see winGlass)
  int_winglass: (o) => winGlass(o),
  // venetian slats and folded curtains: the texture is the shading, the vertex colour the cloth
  // (behind the glass: the blinds hang at the pane and catch the daylight through it, the rooms behind them less of it)
  int_slats: () => { const t = slatsTex(); t.repeat.set(1, 39.37); return IN({ color: 0xffffff, vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, map: t }, 0.6, 0.85); },
  int_curtain: () => { const t = curtainTex(); t.repeat.set(1 / 0.7, 1); return IN({ color: 0xffffff, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, map: t }, 0.6, 0.85); },
  // AR34 w2 (BID1 6): a sheer hangs at the glass and takes the whole of the daylight through it, and glows a little
  // with the light from behind (the room's other windows): it reads white-grey from the street, as in the 2026-08
  // (the curtain texture's folds at 20 % of their contrast: a sheer's folds are soft; int_sheerLit glows after dark)
  int_sheer: () => softMap(selfLit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, map: sheerTex() }, 1.0, 1.0), 0.12, 0.0), 0.2),
  int_sheerLit: () => softMap(selfLit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, map: sheerTex() }, 1.0, 1.0), 0.12, 0.75), 0.2),
  // the room behind an unlit window: a dim back wall (vertex colours carry each room's tone)
  int_dark: () => IN({ color: 0xffffff, vertexColors: true, roughness: 0.92 }, 0.28, 0.6),
  // a lit room after dark: the same by day, warm light at night
  int_lit: () => nightEmit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.9, emissive: 0xffd6a0, emissiveIntensity: 0.55 }, 0.3, 0.6)),
  // blinds and curtains (vertex colours), glowing when the room is lit
  int_blind: () => IN({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }, 0.6, 0.85),
  int_blindLit: () => nightEmit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffe2b8, emissiveIntensity: 0.4 }, 0.6, 0.85)),
  // a shop: lit from inside, by day as well. AR34: next (BID1's a1 plates) a lit shop reads
  // mid to dark grey behind its glass by day, never white: a share of the outdoor light (inside) and a low day emission
  int_shop: (o) => selfLit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.8 }, 0.3, 0.7), 0.13 * (o.lit ?? 1), 1.3 * (o.lit ?? 1)),
  int_shopLight: () => nightEmit(S({ color: 0xf6f4ee, roughness: 0.5, emissive: 0xfff4e2, emissiveIntensity: 1.3 })),
  int_goods: (o) => selfLit(IN({ color: 0xffffff, vertexColors: true, roughness: 0.75 }, 0.3, 0.7), 0.22 * (o.lit ?? 1), 1.1 * (o.lit ?? 1)),
  // the storefront glass: the window glass's shader (the reflection of the street canyon, a dirt film), thinner
  // (a shop window at street level mirrors the sunlit street and the far side of it more than a pane up the wall does)
  int_shopglass: () => winGlass({ f0: 0.07, opacity: 0.16, dirt: 0.22, rough: 0.02, canyon: 0.6 }),
  // AR34 w2 b1 (HPT): frosted storefront glass: a milky white-grey sheet (acid-etched), a soft sheen, the shop's light
  // through it a little by day and warm after dark
  int_frosted: () => cityRefl(selfLit(S({ color: 0xd9dcda, roughness: 0.32, metalness: 0 }), 0.07, 0.9)),
  // the fire escape's iron (painted black, rust at the joints comes with MATS's steel_rust)
  // (painted black iron, not bare metal: as a metal it mirrored the sky and the platforms read as blue slabs from below)
  // (AR34 w2: the sky at 0.3 in its specular: at full strength the platforms read as blue slabs from below, s351)
  int_iron: () => cityRefl(FKENV ? envScale(S({ color: 0x323432, roughness: 0.62, metalness: 0.08 }), 0.5) : S({ color: 0x323432, roughness: 0.62, metalness: 0.08 })),
};
export function kitReady() { return matsReady; }
