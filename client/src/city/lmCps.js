// lmCps.js: the Central Park South rooftops the teaser frames (CP33 landmarks round, 2026-10-01).
//   * the Essex House (160 Central Park South, 1931): the red ESSEX HOUSE letters on their steel frame over the park front
//   * the Plaza (1907): a French-Renaissance mansard in verdigris copper on the compiled ring, dormers, chimneys, pavilions
// Both are 'decorate' builders: the compiled extrusion stays, these add the roofline. Geometry merged per material
// (lmFacadeKit.js); the sign's letters are stroke boxes, red by day and glowing at night (ENV.night).
import * as THREE from 'three';
import { KIT } from './landmarkKit.js';
import { ENV, applyLightTrim } from '../world/materials.js';
import { Acc, box, cyl, loft, capRing, plane, offsetRing, ringOutSign, addMeshes, triCount, rng } from './lmFacadeKit.js';
import { lotFrame } from './lmSteinway.js';

const { mat } = KIT;

// a night glow on a lit material: the emissive term is faint by day and rises with ENV.night
function nightGlow(m, k = 1.6, day = 0.1) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.csNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float csNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance *= (${day.toFixed(3)} + ${k.toFixed(3)} * csNight);`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|csGlow' + k + '|' + day;
  m.needsUpdate = true;
  return m;
}

/* ------------------------------------------------------------- stroke letters */
const GLYPH = {
  E: [[[0.55, 1], [0, 1], [0, 0], [0.55, 0]], [[0, 0.5], [0.46, 0.5]]],
  S: [[[0.55, 0.88], [0.44, 1], [0.12, 1], [0, 0.88], [0, 0.62], [0.12, 0.5], [0.43, 0.5], [0.55, 0.38], [0.55, 0.12], [0.43, 0], [0.11, 0], [0, 0.12]]],
  X: [[[0, 0], [0.55, 1]], [[0, 1], [0.55, 0]]],
  H: [[[0, 0], [0, 1]], [[0.55, 0], [0.55, 1]], [[0, 0.5], [0.55, 0.5]]],
  O: [[[0.12, 0], [0.43, 0], [0.55, 0.12], [0.55, 0.88], [0.43, 1], [0.12, 1], [0, 0.88], [0, 0.12], [0.12, 0]]],
  U: [[[0, 1], [0, 0.12], [0.12, 0], [0.43, 0], [0.55, 0.12], [0.55, 1]]],
};
// text laid out along the reading coordinate u (toward the WEST, -E: a sign facing north is read with east on the left hand), standing on
// baseY at plane offset nPl (along N). P(u, n) is the lot frame's point for reading coordinate u.
// opts: { F: lot frame, str, u0 (left end), nPl, baseY, h (letter height), t (stroke), d (depth), gap }
function strokeText(acc, o) {
  const { F, str, u0, nPl, baseY, h, t, d } = o;
  const cw = 0.55 * h, adv = cw + (o.gap ?? 0.28 * h);
  let u = u0;
  for (const ch of str) {
    if (ch === ' ') { u += adv * 0.7; continue; }
    const strokes = GLYPH[ch];
    if (!strokes) { u += adv; continue; }
    for (const pl of strokes) {
      for (let i = 0; i + 1 < pl.length; i++) {
        const [ax, ay] = pl[i], [bx, by] = pl[i + 1];
        const du = (bx - ax) * h, dv = (by - ay) * h, L = Math.hypot(du, dv) + t * 0.7;
        const ang = Math.atan2(dv, du);
        const mu = u + ((ax + bx) / 2) * h, mv = baseY + ((ay + by) / 2) * h;
        const [px, pz] = F.P(-mu, nPl);
        box(acc, px, mv - t / 2, pz, L, t, d, F.rot + Math.PI, ang);
      }
    }
    u += adv;
  }
  return u - o.u0;
}
export function textWidth(str, h, gap = 0.28) {
  const cw = 0.55 * h, adv = cw + gap * h;
  let w = 0;
  for (const ch of str) w += ch === ' ' ? adv * 0.7 : adv;
  return w - gap * h;
}

/* ------------------------------------------------------------------- Essex House */
let _EM = null;
function essexMats() {
  if (_EM) return _EM;
  _EM = {
    letters: nightGlow(applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xd2231c, roughness: 0.5, metalness: 0.1, emissive: 0xff2a1a, emissiveIntensity: 1.0 })), 1.7, 0.12),
    steel: mat(0x3a3d40, { rough: 0.6, metal: 0.6, flat: false }),
    back: mat(0x2c2f33, { rough: 0.8, flat: true }),
  };
  return _EM;
}

export function buildEssexSign(ctx) {
  const g = new THREE.Group();
  const ring = ctx.footprint;
  if (!ring || ring.length < 4) return null;
  const F = lotFrame(ring);
  const M = essexMats();
  const H = ctx.height || 134;
  // the compiled tower steps in twice (about 8.8 m a step, towers.js buildSetbacks); the sign stands on the top deck, on the
  // park (north) side of it, facing north
  const inset = Math.min(19, 0.14 * Math.min(F.e1 - F.e0, F.n1 - F.n0) * 2.1);
  const topE0 = F.e0 + inset, topE1 = F.e1 - inset, topN1 = F.n1 - inset;
  const ce = -(topE0 + topE1) / 2;                       // reading coordinate (toward the west)
  const txt = 'ESSEX HOUSE';
  const lh = 3.7, t = 0.56, d = 0.55;
  let w = textWidth(txt, lh);
  const maxW = (topE1 - topE0) * 0.92;
  const sc = Math.min(1, maxW / w);
  const hh = lh * sc;
  w = textWidth(txt, hh);
  const LET = new Acc(), STEEL = new Acc(), BACK = new Acc();
  // the deck is a little under the nominal top; the frame legs stand on it, the letters ride 1.1 m above on the rails
  const yDeck = H - 1.4, yBase = yDeck + 2.2;
  const nPl = topN1 - 3.0;
  const u0 = ce - w / 2;
  strokeText(LET, { F, str: txt, u0, nPl, baseY: yBase, h: hh, t: t * sc, d });
  // the frame: two rails behind the letters, a dozen posts down to the deck, diagonal braces between them
  const nBack = nPl - 0.7;
  for (const yy of [yBase - 0.15, yBase + hh * 0.5, yBase + hh + 0.1]) {
    const [cx, cz] = F.P(-ce, nBack);
    box(STEEL, cx, yy, cz, w + 1.6, 0.18, 0.18, F.rot);
  }
  const nPost = Math.max(5, Math.round(w / 4.2));
  for (let i = 0; i <= nPost; i++) {
    const uu = u0 - 0.8 + (w + 1.6) * (i / nPost);
    const [cx, cz] = F.P(-uu, nBack);
    box(STEEL, cx, yDeck, cz, 0.2, yBase + hh + 0.3 - yDeck, 0.2, F.rot);
    if (i < nPost) {
      const u2 = u0 - 0.8 + (w + 1.6) * ((i + 1) / nPost), [c2x, c2z] = F.P(-(uu + u2) / 2, nBack);
      const dv = yBase + hh + 0.1 - (yBase - 0.15), du = u2 - uu, L = Math.hypot(du, dv);
      box(STEEL, c2x, (yBase - 0.15) + dv / 2 - 0.07, c2z, L, 0.14, 0.14, F.rot + Math.PI, (i % 2 ? 1 : -1) * Math.atan2(dv, du));
    }
  }
  const meshes = [[LET, M.letters, 'es-letters'], [STEEL, M.steel, 'es-frame'], [BACK, M.back, 'es-back']];
  addMeshes(g, meshes);
  g.userData.tris = triCount(meshes.map((m) => [m[0]]));
  return g;
}
