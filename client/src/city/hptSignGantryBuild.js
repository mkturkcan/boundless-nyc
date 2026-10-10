// AR33 HPT: the LONG ISLAND gantries assembled (hptSignGantry.js steel) with PBR materials, the real lettering (typeface
// outlines from the sign kit's fonts, extruded with a cream rim) and the night look (lettering and windows lit, the steel
// faintly floodlit). Built into a temporary group so a failure leaves the AR32 gantries to the caller.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { ENV, applyLightTrim as LT } from '../world/materials.js';
import { GANTRY, GANTRY_S } from './hptSignData.js';
import { hmat } from './hptSignMats.js';
import { gantryGeo, cabinGeo, catwalkGeo, DECK } from './hptSignGantry.js';
import { channelGeo } from './hptSignTrace.js';
import { Builder } from './hptSignSteel.js';
import { nightPatch, frameM } from './hptSignBuild.js';

const NEON_ON = 'clamp((kNight - 0.12) / 0.38, 0.0, 1.0)';
// the lettering's typeface; the page waits for it
let FONT = null;
export const gantryReady = (typeof fetch === 'undefined' ? Promise.resolve() : fetch('fonts/ar33/o/BarlowCondensed-700.json')
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((j) => { FONT = new FontLoader().parse(j); }, (e) => { console.warn('[ar33h] gantry lettering font unavailable', e && e.message); FONT = null; }));

let _M = null;
function gMats() {
  if (_M) return _M;
  const steel = hmat('gtSteel'), roof = hmat('gtRoof'), conc = hmat('concrete');
  // AR34: plain paint now (hptSignMats.js), so the floodlit share is a tenth of what it was: r1_night had the steel near white
  nightPatch(steel, 'gtN1', `totalEmissiveRadiance += vec3(0.0034, 0.003, 0.0028) * ${NEON_ON};`);
  nightPatch(roof, 'gtN2', `totalEmissiveRadiance += vec3(0.002, 0.0019, 0.0019) * ${NEON_ON};`);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.12, metalness: 0.5, emissive: 0xffc27a });
  nightPatch(glass, 'gtN3', `totalEmissiveRadiance *= 0.85 * ${NEON_ON};`);
  LT(glass);
  const letter = new THREE.MeshStandardMaterial({ color: 0xe08a68, roughness: 0.5, metalness: 0.05, emissive: 0xff7a44 });
  nightPatch(letter, 'gtN4', `totalEmissiveRadiance *= 0.5 * ${NEON_ON};`);
  LT(letter);
  const rim = new THREE.MeshStandardMaterial({ color: 0xe3d9c4, roughness: 0.5, metalness: 0.05, emissive: 0xffd9a8 });
  nightPatch(rim, 'gtN5', `totalEmissiveRadiance *= 0.3 * ${NEON_ON};`);
  LT(rim);
  return (_M = { steel, roof, conc, glass, letter, rim });
}

// "LONG" / "ISLAND": per-glyph outlines from the typeface, spaced to span `width`, each `height` tall, as 7 cm plates with a cream rim
function lettersGeometry(text, width, height) {
  const glyphs = [...text].map((ch) => {
    const shapes = FONT.generateShapes(ch, 1);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const sh of shapes) for (const p of sh.getPoints(2)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { shapes, x0, x1, y0, y1 };
  });
  const cap = Math.max(...glyphs.map((g) => g.y1)) || 0.7, k = height / cap;
  const ws = glyphs.map((g) => (g.x1 - g.x0) * k), sum = ws.reduce((a, b) => a + b, 0);
  const gap = Math.max(0.12, Math.min(1.4, (width - sum) / Math.max(1, glyphs.length - 1)));
  let x = -(sum + gap * (glyphs.length - 1)) / 2;
  const geos = [];
  glyphs.forEach((g, i) => {
    const geo = channelGeo(g.shapes, 0.07, 0.03, { curveSegments: 4 });
    geo.translate(-g.x0, 0, 0); geo.scale(k, k, 1); geo.translate(x, -cap * k / 2, 0);
    geos.push(geo); x += ws[i] + gap;
  });
  return geos;
}

// Builds both gantries, the cabin and the catwalk; returns { tris }
export function buildGantriesAr33(group) {
  const M = gMats(), out = new THREE.Group(); out.name = 'ar33h:gantries';
  const [tx, tz] = GANTRY.T, ax = -tz, az = tx;
  const S = new Builder(), R = new Builder(), G = new Builder(), C = new Builder();
  const I = new THREE.Matrix4();
  // the frames move 1.2 m inland (along T) so the towers' plinths stand wholly on the deck, clear of the pier edge railing
  const INL = 1.2, sh = (C) => [C[0] + tx * INL, C[1] + tz * INL];
  const place = (name, Gd0) => {
    const Gd = { ...Gd0, C: sh(Gd0.C) };
    const F = frameM(Gd.C[0], 0, Gd.C[1], ax, az);
    const r = gantryGeo(Gd, name);
    S.append(r.steel, F); R.append(r.roof, F); G.append(r.glass, F); C.append(r.conc, F);
    if (FONT) {
      const wallH = (Gd.HT - Gd.HB) * 0.69, geos = lettersGeometry(name, Gd.W * 0.86, wallH * 0.84);   // AR34: tall condensed capitals filling the wall
      const M4 = new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, Gd.HB + wallH * 0.5, 1.7 + 0.03));
      for (const g of geos) { g.applyMatrix4(M4); const m = new THREE.Mesh(g, [M.letter, M.rim, M.rim]); m.name = `ar33h:gantry:${name}:letter`; m.castShadow = false; m.receiveShadow = true; out.add(m); }
    }
    return { F, r };
  };
  place('LONG', GANTRY.LONG); place('ISLAND', GANTRY.ISLAND);
  // the cabin and the catwalk between the frames
  const A = sh(GANTRY.LONG.C), B = sh(GANTRY.ISLAND.C);
  const across = (B[0] - A[0]) * ax + (B[1] - A[1]) * az;
  const gap = across - (GANTRY.LONG.W / 2 + 0.45) - (GANTRY.ISLAND.W / 2 + 0.45);
  const mid = [(A[0] + B[0]) / 2 + tx * 0.8, (A[1] + B[1]) / 2 + tz * 0.8];
  const Fm = frameM(mid[0], 0, mid[1], ax, az);
  const cab = cabinGeo(gap), cat = catwalkGeo(gap, 12.0);
  S.append(cab.steel, Fm); G.append(cab.glass, Fm); R.append(cab.roof, Fm);
  S.append(cat.steel, frameM((A[0] + B[0]) / 2, 0, (A[1] + B[1]) / 2, ax, az));
  const mesh = (B2, mat, name, cast = true) => { if (!B2.tris) return; const m = new THREE.Mesh(B2.geometry(I), mat); m.name = 'ar33h:gantries:' + name; m.castShadow = cast; m.receiveShadow = true; out.add(m); };
  mesh(S, M.steel, 'steel'); mesh(R, M.roof, 'roof'); mesh(G, M.glass, 'windows', false); mesh(C, M.conc, 'plinths', false);
  group.add(out);
  return { tris: S.tris + R.tris + G.tris + C.tris, lettered: !!FONT };
}

// The south gantry (hptSignData.js GANTRY_S): one wide unlettered frame, each tower on a concrete caisson in the water, two operator
// cabins hung on the south tower (one between the towers, one on its land side with a railed landing); the same steel as LONG
// ISLAND. Returns { tris }.
export function buildSouthGantries(group) {
  const M = gMats(), out = new THREE.Group(); out.name = 'ar33h:gantryS';
  const [tx, tz] = GANTRY_S.T, ax = -tz, az = tx;
  const S = new Builder(), R = new Builder(), G = new Builder(), C = new Builder();
  const Gd = GANTRY_S.F, [b0, b1] = GANTRY_S.BASE;
  const F = frameM(Gd.C[0], 0, Gd.C[1], ax, az);
  const r = gantryGeo(Gd, 'SOUTH');
  S.append(r.steel, F); R.append(r.roof, F); G.append(r.glass, F); C.append(r.conc, F);
  const legX = Gd.W / 2 - 1.75, base = new Builder(), cab = new Builder(), cg = new Builder(), cr = new Builder();
  for (const sx of [-1, 1]) {
    base.box([sx * legX, (b0 + b1) / 2, 0], 2.9, (b1 - b0) / 2, 2.9);                     // the caisson
    base.box([sx * legX, b1 - 0.1, 0], 3.05, 0.1, 3.05);                                  // its cap, a little proud
  }
  // the cabins: x along the frame (+x the south tower), z toward the river; walls with battens, two-pane windows, flat roofs
  const cabin = (x, y0, z, hx, hy, hz) => {
    cab.box([x, y0 + hy, z], hx, hy, hz);
    for (let u = -hx + 0.5; u < hx - 0.2; u += 0.9) for (const sz of [-1, 1]) cab.box([x + u, y0 + hy, z + sz * (hz + 0.01)], 0.035, hy - 0.05, 0.01);
    for (const sz of [-1, 1]) for (const u of [-hx * 0.45, hx * 0.3]) {
      cab.box([x + u, y0 + hy * 1.15, z + sz * (hz + 0.02)], 0.5, 0.45, 0.02); cg.box([x + u, y0 + hy * 1.15, z + sz * (hz + 0.035)], 0.42, 0.38, 0.008);
      cab.box([x + u, y0 + hy * 1.15, z + sz * (hz + 0.045)], 0.018, 0.38, 0.008);
    }
    cr.box([x, y0 + 2 * hy + 0.07, z], hx + 0.18, 0.07, hz + 0.18);
  };
  cabin(legX - 1.9 - 2.2, 6.4, 0.2, 2.1, 1.55, 1.55);
  cabin(legX, 5.9, -1.75 - 1.8, 1.9, 1.45, 1.5);
  cab.box([legX, 5.84, -1.75 - 1.8], 2.4, 0.06, 2.1);                                    // its landing
  for (const sx of [-1, 1]) cab.box([legX + sx * 2.35, 6.4, -1.75 - 1.8], 0.025, 0.55, 2.05);   // the landing's rails
  cab.box([legX, 6.95, -1.75 - 1.8 - 2.08], 2.4, 0.025, 0.025);
  S.append(cab, F); G.append(cg, F); R.append(cr, F); C.append(base, F);
  const I = new THREE.Matrix4();
  const mesh = (B2, mat, name, cast = true) => { if (!B2.tris) return; const m = new THREE.Mesh(B2.geometry(I), mat); m.name = 'ar33h:gantryS:' + name; m.castShadow = cast; m.receiveShadow = true; out.add(m); };
  mesh(S, M.steel, 'steel'); mesh(R, M.roof, 'roof'); mesh(G, M.glass, 'windows', false); mesh(C, M.conc, 'caissons', false);
  group.add(out);
  return { tris: S.tris + R.tris + G.tris + C.tris };
}
