// Building type registry.
//
// CONTRACT for building modules (read this before writing a new type):
//   export const TYPE = 'name';
//   export function generate(ctx, lot, rng) -> { height }
//
// ctx  = { batcher, kit, extra }  (see batcher.js / kit.js)
// lot  = {
//   frame: Matrix4 local->world. LOCAL SPACE: facade centered on x=0 along X,
//          front wall plane at z=0 (street side is +z), building extends -z,
//          y=0 at sidewalk level.
//   width:  facade width (m)
//   depth:  building depth (m)
//   corner: 0 none | -1 left side exposed | +1 right side exposed (cross street)
//   commercial: bool — ground floor should be retail
//   stories: optional override
//   mirror: bool — alternate handedness down a row
//   district: string tag ('harlem', 'wburg', ...)
// }
// rng  = seeded rng (rng.js) — use ONLY this for randomness (reproducibility).
//
// Rules:
//  - Add geometry ONLY via ctx.batcher / ctx.kit with matrices derived from
//    lot.frame (see lib.js `at`). Never touch the scene directly.
//  - Define private instanced parts with batcher.definePart using a type-
//    prefixed id ('loft:sash:...') to avoid collisions.
//  - Every material name must exist in materials.js.
//  - Keep per-building merged boxes < ~400 and instanced parts quantized.

import * as tenement from './tenement.js';
import * as brownstone from './brownstone.js';
import * as loft from './loft.js';
import * as prewar from './prewar.js';
import * as nycha from './nycha.js';
import * as glasstower from './glasstower.js';
import * as mixeduse from './mixeduse.js';
import * as rowhouse from './rowhouse.js';
import * as castiron from './castiron.js';
import * as victorian from './victorian.js';
import * as deco from './deco.js';
import * as whitebrick from './whitebrick.js';
import * as gardenapt from './gardenapt.js';
import * as queensrow from './queensrow.js';
import * as infill from './infill.js';
import * as federal from './federal.js';

export const TYPES = new Map();
for (const m of [
  tenement, brownstone, loft, prewar, nycha, glasstower, mixeduse, rowhouse,
  castiron, victorian, deco, whitebrick, gardenapt, queensrow, infill, federal,
]) {
  TYPES.set(m.TYPE, m);
}

export function generateBuilding(type, ctx, lot, rng) {
  const mod = TYPES.get(type);
  if (!mod) throw new Error(`unknown building type: ${type}`);
  return mod.generate(ctx, lot, rng);
}
