// Shared builder utilities. Local building space: facade runs along X centered
// on 0, front wall plane z=0, building extends into -z, y=0 at sidewalk.
// `frame` is the lot's local->world Matrix4.
import * as THREE from 'three';
import { box, boxUV, quad, tmat } from '../geo.js';

export const at = (frame, x, y, z, ry = 0) => frame.clone().multiply(tmat(x, y, z, ry));

// Facade with REAL punched openings: fills bands between rows and piers
// between openings. rows: [{y0, y1, openings:[{x, w, y0?, y1?}]}] (x = center;
// per-opening y0/y1 are ABSOLUTE and must lie within the row band — infill is
// added under/over such openings). Rows must not overlap each other.
export function punchedWall(ctx, frame, {
  width, height, depth = 0.35, mat = 'brickRed', tint = null,
  rows = [], grime = 0.2, zFace = 0, aoTop = 0,
}) {
  const B = ctx.batcher;
  const addBox = (w, h, cx, cy) => {
    if (w <= 0.005 || h <= 0.005) return;
    const g = box(w, h, depth);
    B.addMerged(mat, g, frame.clone().multiply(tmat(cx, cy, zFace - depth / 2)), { tint, grime, aoTop });
  };
  const sorted = [...rows].sort((a, b) => a.y0 - b.y0);
  let cursor = 0;
  for (const row of sorted) {
    if (row.y0 > cursor + 0.004) addBox(width, row.y0 - cursor, 0, cursor);
    const ops = [...row.openings].sort((a, b) => a.x - b.x);
    let px = -width / 2;
    for (const op of ops) {
      const left = op.x - op.w / 2;
      if (left > px + 0.004) addBox(left - px, row.y1 - row.y0, (px + left) / 2, row.y0);
      // infill under/over openings that don't span the full row band
      const oy0 = op.y0 ?? row.y0, oy1 = op.y1 ?? row.y1;
      if (oy0 > row.y0 + 0.004) addBox(op.w, oy0 - row.y0, op.x, row.y0);
      if (oy1 < row.y1 - 0.004) addBox(op.w, row.y1 - oy1, op.x, oy1);
      px = op.x + op.w / 2;
    }
    if (px < width / 2 - 0.004) addBox(width / 2 - px, row.y1 - row.y0, (px + width / 2) / 2, row.y0);
    cursor = row.y1;
  }
  if (cursor < height - 0.004) addBox(width, height - cursor, 0, cursor);
}

// Side + rear walls (party walls). Sides get light grime, no openings by default.
export function shellWalls(ctx, frame, {
  width, depth, height, mat = 'brickRed', tint = null, wallT = 0.3,
  rearRows = null, rearMat = null, sideRows = { left: null, right: null },
}) {
  const B = ctx.batcher;
  for (const side of [-1, 1]) {
    const rows = side < 0 ? sideRows.left : sideRows.right;
    if (rows) {
      // exposed side wall with windows: build punched, oriented along X in a
      // rotated sub-frame (rotate so wall runs along X, faces outward)
      const sub = frame.clone().multiply(tmat(side * (width / 2), 0, -depth / 2, side < 0 ? -Math.PI / 2 : Math.PI / 2));
      punchedWall(ctx, sub, { width: depth, height, depth: wallT, mat, tint, rows, grime: 0.15 });
    } else {
      // macro-scale history: the wall is 2-4 horizontal bands of slightly
      // different brick (old paint/tar lines, re-pointed courses), each with
      // its own grime level, plus 1-3 long drain/scupper stains from the roof
      const hsh0 = Math.abs(Math.sin(frame.elements[12] * 1.7 + frame.elements[14] * 3.3 + side * 2));
      const nBands = 3 + Math.floor(hsh0 * 2.99);
      const base = tint || new THREE.Color(1, 1, 1);
      let yb = 0;
      for (let b = 0; b < nBands; b++) {
        const jit = Math.abs(Math.sin(hsh0 * 17 + b * 5.1));
        const y1 = b === nBands - 1 ? height : Math.min(height, yb + (height / nBands) * (0.7 + 0.6 * jit));
        if (y1 - yb < 0.3) continue;
        const g = box(wallT, y1 - yb, depth - 0.02);
        B.addMerged(mat, g, frame.clone().multiply(tmat(side * (width / 2 - wallT / 2), yb, -depth / 2)), {
          tint: base.clone().multiplyScalar(0.84 + 0.24 * jit), grime: 0.05 + 0.23 * Math.abs(Math.sin(hsh0 * 9 + b * 3)),
        });
        yb = y1;
      }
      if (height > 6) {
        const nStain = 2 + Math.floor(hsh0 * 2.9);
        for (let s = 0; s < nStain; s++) {
          const u = Math.abs(Math.sin(hsh0 * 23 + s * 7.3));
          const len = Math.min(height * 0.7, 4 + u * 9);
          const q = quad(0.5 + u * 0.5, len);
          const sub = frame.clone().multiply(tmat(side * (width / 2 + 0.012), height - len, -depth * (0.15 + 0.7 * u), side < 0 ? -Math.PI / 2 : Math.PI / 2));
          B.addMerged('grimeStreak', q, sub, { tint: new THREE.Color().setScalar(0.08 + 0.1 * u), worldUV: false });
        }
      }
      // party-wall history: a demolished neighbour's roof-scar band (darker,
      // slightly proud, at a random old roofline) + sealed window ghosts
      const hsh = Math.abs(Math.sin(frame.elements[12] * 3.1 + frame.elements[14] * 7.7 + side));
      if (height > 9 && hsh > 0.3) {
        // roof-scar: a 1.1m band of the neighbour's old tar line, 12cm proud,
        // with a sloped flashing lip — legible at street distance
        const scarY = 5 + hsh * Math.min(height - 7, 14);
        const scar = box(0.12, 1.1, depth - 0.6);
        B.addMerged(mat, scar, frame.clone().multiply(tmat(side * (width / 2 + 0.06), scarY, -depth / 2)), {
          tint: (tint || new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.45),
        });
        const lip = box(0.2, 0.25, depth - 0.6);
        B.addMerged('roofBlack', lip, frame.clone().multiply(tmat(side * (width / 2 + 0.1), scarY + 1.1, -depth / 2)), {});
        // sealed window ghosts: recessed mismatched infill with a lighter mortar border
        // bricked-up openings sit ON the floor grid (sill 0.9m above each
        // ~3.0m floor line) at real window size, in slightly mismatched brick
        const nGhost = 1 + Math.floor(hsh * 2.9);
        const floors = Math.max(2, Math.floor((height - 1.5) / 3.0));
        for (let gI = 0; gI < nGhost; gI++) {
          const gz = -depth * (0.25 + 0.5 * ((gI + 1) / (nGhost + 1)));
          const fl = 1 + ((gI * 2 + Math.floor(hsh * 7)) % (floors - 1));
          const gy = 0.9 + fl * 3.0;
          const border = box(0.03, 1.66, 1.06);
          B.addMerged(mat, border, frame.clone().multiply(tmat(side * (width / 2 + 0.012), gy - 0.08, gz)), {
            tint: (tint || new THREE.Color(1, 1, 1)).clone().multiplyScalar(1.04),
          });
          const ghost = box(0.045, 1.5, 0.9);
          B.addMerged(mat, ghost, frame.clone().multiply(tmat(side * (width / 2 + 0.02), gy, gz)), {
            tint: (tint || new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.82),
          });
        }
      }
    }
  }
  if (rearRows) {
    const sub = frame.clone().multiply(tmat(0, 0, -depth, Math.PI));
    punchedWall(ctx, sub, { width, height, depth: wallT, mat: rearMat || mat, tint, rows: rearRows, grime: 0.15 });
  } else {
    const g = box(width - 0.02, height, wallT);
    B.addMerged(rearMat || mat, g, frame.clone().multiply(tmat(0, 0, -depth + wallT / 2)), { tint, grime: 0.12 });
  }
}

// Flat roof slab + parapet with stone coping. Returns roof deck y.
export function flatRoof(ctx, frame, {
  width, depth, height, parapet = 0.75, mat = 'brickRed', tint = null,
  roofMat = 'roofSilver', copingMat = 'limestone', wallT = 0.24, frontOnly = false,
}) {
  const B = ctx.batcher;
  const deck = box(width - 0.1, 0.12, depth - 0.1, { segY: 1 });
  B.addMerged(roofMat, deck, frame.clone().multiply(tmat(0, height - 0.12, -depth / 2)));
  if (parapet > 0) {
    const walls = frontOnly
      ? [[0, -wallT / 2 + 0.0, width, wallT]]
      : [
        [0, -wallT / 2, width, wallT],                          // front
        [0, -depth + wallT / 2, width, wallT],                  // rear
        [-width / 2 + wallT / 2, -depth / 2, wallT, depth],     // left (as w/d swap)
        [width / 2 - wallT / 2, -depth / 2, wallT, depth],
      ];
    walls.forEach(([cx, cz, w, d], i) => {
      const g = box(w, parapet, d, { segY: 1 });
      B.addMerged(mat, g, frame.clone().multiply(tmat(cx, height, cz)), { tint });
      const cap = box(w + 0.06, 0.07, d + 0.06, { segY: 1 });
      B.addMerged(copingMat, cap, frame.clone().multiply(tmat(cx, height + parapet, cz)));
    });
  }
  return height;
}

// Scatter standard roof gear. Building modules can add more specific items.
export function roofGear(ctx, frame, rng, {
  width, depth, height, bulkhead = true, waterTower = false, hvacCount = 0,
  vents = 2, chimney = false, antenna = false, mat = 'stucco',
}) {
  const K = ctx.kit;
  const rx = (a, b) => rng.range(a, b);
  if (bulkhead) {
    const bw = rng.range(2.2, 3.0);
    K.bulkhead(at(frame, rx(-width / 4, width / 4), height, -depth * rx(0.3, 0.6)), {
      w: bw, d: rng.range(1.8, 2.4), h: rng.range(2.2, 2.7), mat,
    });
  }
  if (waterTower) {
    K.waterTower(at(frame, rx(-width / 5, width / 5), height, -depth * rx(0.35, 0.65), rng.range(0, Math.PI)), {
      tint: new THREE.Color().setHSL(0.07, rng.range(0.2, 0.35), rng.range(0.28, 0.42)),
      legH: rng.range(3.2, 5.4), r: rng.range(1.7, 2.25), hBody: rng.range(3.0, 4.3),
    });
  }
  for (let i = 0; i < hvacCount; i++) {
    K.hvac(at(frame, rx(-width / 3, width / 3), height, -depth * rx(0.2, 0.8), rng.range(0, Math.PI)));
  }
  // roofs in NYC are never bare: extra stacks, dishes, conduit
  for (let i = 0; i < vents + rng.int(2, 5); i++) {
    K.vent(at(frame, rx(-width / 2.4, width / 2.4), height, -depth * rx(0.15, 0.85)), {
      kind: rng.pick(['pipe', 'pipe', 'pipe', 'goose', 'whirly']),
    });
  }
  const nDish = rng.int(0, 3);
  for (let i = 0; i < nDish; i++) {
    K.dish(at(frame, rx(-width / 2.2, width / 2.2), height, -depth * rx(0.06, 0.3), rng.range(2.4, 4.2)));
  }
  if (chimney) {
    K.chimney(at(frame, rx(-width / 2.6, width / 2.6), height - 0.4, -depth * rx(0.55, 0.9)), {
      h: rng.range(1.2, 2.0), mat: rng.pick(['brickRed', 'brickBrown']),
    });
  }
  if (antenna) K.antenna(at(frame, rx(-width / 3, width / 3), height, -depth * rx(0.3, 0.7)));
}

// Standard tint jitter for facade materials (subtle per-building variation).
export function facadeTint(rng, base = null) {
  const c = base ? base.clone() : new THREE.Color(1, 1, 1);
  const f = rng.range(0.9, 1.06);
  c.multiplyScalar(f);
  const h = { h: 0, s: 0, l: 0 };
  c.getHSL(h);
  c.setHSL(h.h + rng.range(-0.008, 0.008), Math.max(0, h.s + rng.range(-0.03, 0.03)), Math.min(1, h.l));
  return c;
}

// Evenly spaced bay centers across a width with edge margin.
export function bayCenters(n, width, margin = 0.8) {
  const usable = width - margin * 2;
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(-usable / 2 + (usable / (n - 1 || 1)) * i);
  if (n === 1) return [0];
  return xs;
}
