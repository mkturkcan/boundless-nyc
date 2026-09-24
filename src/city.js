// City layout: blocks, lots, streetscape. Grid runs along X ("streets" on the
// long sides, N/S) and Z ("avenues" on the short ends, E/W).
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { tmat, box, boxUV, compose } from './geo.js';
import { punchedWall } from './buildings/lib.js';
import { TYPES, generateBuilding } from './buildings/index.js';

const hash2 = (a, b) => ((Math.round(a * 7385) ^ Math.round(b * 19349)) >>> 0) || 1;

const STREET_W = 18;      // 60ft side street
const AVE_W = 26;         // avenue
const SIDEWALK = 4.0;
const CURB_H = 0.14;

// District recipes: which types fill a block side, with widths.
const DISTRICTS = {
  'harlem-row': {
    types: [['brownstone', 6], ['tenement', 1.6], ['prewar', 0.5]],
    commercialChance: 0.0,
    trees: true, lights: 'crook',
  },
  'harlem-125': {
    types: [['mixeduse', 5], ['tenement', 2], ['prewar', 1.6]],
    commercialChance: 0.9,
    trees: false, lights: 'cobra',
  },
  'harlem-mixed': {
    types: [['tenement', 4], ['brownstone', 2], ['prewar', 1.4], ['mixeduse', 1]],
    commercialChance: 0.22,
    trees: true, lights: 'cobra',
  },
  'wburg-industrial': {
    types: [['loft', 5], ['rowhouse', 2], ['tenement', 1], ['mixeduse', 0.7]],
    commercialChance: 0.3,
    trees: false, lights: 'cobra',
  },
  'wburg-bedford': {
    types: [['mixeduse', 4], ['tenement', 2], ['rowhouse', 2], ['loft', 1]],
    commercialChance: 0.75,
    trees: true, lights: 'cobra',
  },
  'wburg-waterfront': {
    types: [['glasstower', 5], ['loft', 2]],
    commercialChance: 0.3,
    trees: false, lights: 'cobra',
  },
  'soho': {
    types: [['castiron', 5], ['loft', 1.5], ['mixeduse', 1]],
    commercialChance: 0.85,
    trees: false, lights: 'crook',
  },
  'bedstuy': {
    types: [['victorian', 4], ['brownstone', 3], ['infill', 1.2], ['federal', 0.7], ['tenement', 0.8]],
    commercialChance: 0.05,
    trees: true, lights: 'crook',
  },
  'queens': {
    types: [['queensrow', 4], ['gardenapt', 2.2], ['rowhouse', 2], ['mixeduse', 0.8]],
    commercialChance: 0.15,
    trees: true, lights: 'cobra',
  },
  'ues': {
    types: [['whitebrick', 3.5], ['prewar', 2.5], ['deco', 1.4], ['mixeduse', 1], ['glasstower', 0.7]],
    commercialChance: 0.45,
    trees: true, lights: 'cobra',
  },
};

const TYPE_WIDTH = {
  brownstone: [5.2, 6.2],
  tenement: [7.3, 7.9],
  loft: [14, 23],
  prewar: [16, 25],
  nycha: [24, 32],
  glasstower: [20, 28],
  mixeduse: [10, 16],
  rowhouse: [5.0, 6.0],
  castiron: [10, 17],
  victorian: [5.5, 7.0],
  deco: [18, 28],
  whitebrick: [20, 30],
  gardenapt: [18, 30],
  queensrow: [5.4, 6.4],
  infill: [10, 18],
  federal: [4.8, 6.0],
};

const TYPE_DEPTH = {
  brownstone: [13, 16], tenement: [15, 19], loft: [16, 22], prewar: [16, 21],
  nycha: [16, 20], glasstower: [18, 24], mixeduse: [15, 19], rowhouse: [10, 13],
  castiron: [16, 22], victorian: [12, 15], deco: [16, 22], whitebrick: [17, 22],
  gardenapt: [15, 19], queensrow: [11, 14], infill: [14, 18], federal: [10, 13],
};

export function buildCity(ctx, { seed = 1, cols = 3, rowsN = 2 } = {}) {
  const rng = makeRng(seed);
  const B = ctx.batcher;
  const K = ctx.kit;
  const blockW = 130, blockD = 56;
  const pitchX = blockW + AVE_W, pitchZ = blockD + STREET_W;
  const info = { buildings: 0, blocks: [], bounds: null, lamps: [] };

  const originX = -((cols - 1) * pitchX + blockW) / 2;
  const originZ = -((rowsN - 1) * pitchZ + blockD) / 2;

  // Columns sweep the boroughs west→east: Harlem, NYCHA/mixed, Williamsburg,
  // SoHo/Bed-Stuy, Queens/UES. One NYCHA superblock.
  const districtFor = (bx, bz) => {
    const byCol = [
      [ 'harlem-row', 'harlem-125' ],
      [ 'nycha-campus', 'harlem-mixed' ],
      [ 'wburg-industrial', 'wburg-bedford' ],
      [ 'soho', 'bedstuy' ],
      [ 'queens', 'ues' ],
    ];
    const col = byCol[Math.min(bx, byCol.length - 1)];
    return col[bz % col.length];
  };

  for (let bx = 0; bx < cols; bx++) {
    for (let bz = 0; bz < rowsN; bz++) {
      const x0 = originX + bx * pitchX;
      const z0 = originZ + bz * pitchZ;
      const districtName = districtFor(bx, bz);
      info.blocks.push({ x0, z0, w: blockW, d: blockD, district: districtName });

      // sidewalk apron around block
      sidewalkRing(ctx, x0, z0, blockW, blockD);

      if (districtName === 'nycha-campus') {
        nychaCampus(ctx, rng, { x0, z0, w: blockW, d: blockD, info });
        furnish(ctx, rng, DISTRICTS['harlem-mixed'], x0, z0, blockW, blockD, info);
        continue;
      }

      const district = DISTRICTS[districtName];

      // building rows on both long sides (facing -Z street and +Z street)
      const aveLotDepth = 19;
      for (const side of [0, 1]) {
        const zFront = side === 0 ? z0 : z0 + blockD;
        fillRow(ctx, rng, district, {
          xStart: x0 + aveLotDepth, xEnd: x0 + blockW - aveLotDepth,
          zFront, facing: side === 0 ? Math.PI : 0, districtName,
          info,
        });
      }
      // avenue-facing ends; far-east avenue of the east column = waterfront row
      for (const side of [0, 1]) {
        const xFront = side === 0 ? x0 : x0 + blockW;
        const isWaterfront = cols >= 3 && bx === cols - 1 && side === 1;
        const aveDistrict = isWaterfront ? DISTRICTS['wburg-waterfront'] : district;
        fillRowZ(ctx, rng, aveDistrict, {
          zStart: z0 + 0.4, zEnd: z0 + blockD - 0.4,
          xFront, facing: side === 0 ? -Math.PI / 2 : Math.PI / 2,
          districtName: isWaterfront ? 'wburg-waterfront' : districtName,
          info,
        });
      }

      // street furniture around the block
      furnish(ctx, rng, district, x0, z0, blockW, blockD, info);
    }
  }

  // ground: asphalt only under the grid (+ margin); dark earth beyond it so the
  // far plane fogs to a neutral ground, not a desert-tan sheet
  {
    // asphalt exactly under the grid + its 5 context rings (both axes)
    const gw = (cols + 10) * pitchX + 40, gd = (rowsN + 10) * pitchZ + 40;
    const g = new THREE.PlaneGeometry(gw, gd, 1, 1);
    g.rotateX(-Math.PI / 2);
    B.addMerged('asphalt', g, tmat(0, -0.02, 0), {});
    const far = new THREE.PlaneGeometry(5000, 5000, 1, 1);
    far.rotateX(-Math.PI / 2);
    B.addMerged('groundDark', far, tmat(0, -0.06, 0), { worldUV: false });
    info.bounds = { w: gw, d: gd };
  }

  // East River along the east edge + far bank massing (Manhattan skyline hint).
  // Water sits just ABOVE the ground planes so it always shows; the asphalt
  // edge above becomes the bulkhead line.
  {
    const eastEdge = originX + cols * pitchX + 3 * pitchX - AVE_W;   // ring edge
    // water: segmented so vertex colors can ramp toward the sky at the horizon;
    // UVs in world meters so the 8m wave-normal tile repeats correctly
    const water = new THREE.PlaneGeometry(1200, 5000, 16, 48);
    water.rotateX(-Math.PI / 2);
    {
      const p = water.attributes.position, uv = water.attributes.uv;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i) + 600;                    // 0 at shore .. 1200 far
        const t = Math.min(1, Math.max(0, dx / 900));
        // East River is green-gray, never blue: near #28332f -> far #3a4448
        const nearC = [0.05, 0.075, 0.07], farC = [0.14, 0.17, 0.18];
        col[i * 3] = nearC[0] + (farC[0] - nearC[0]) * t;
        col[i * 3 + 1] = nearC[1] + (farC[1] - nearC[1]) * t;
        col[i * 3 + 2] = nearC[2] + (farC[2] - nearC[2]) * t;
        uv.setXY(i, p.getX(i) / 24, p.getZ(i) / 24);
      }
      water.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    B.addMerged('water', water, tmat(eastEdge + 600, 0.03, 0), { worldUV: false });
    // seawall / bulkhead: granite face standing 1.0m above the water line
    const wall = box(1.2, 1.1, 3200, { segY: 1 });
    B.addMerged('graniteBase', wall, tmat(eastEdge + 0.6, -0.1, 0), { tint: new THREE.Color(0.5, 0.5, 0.5) });
    // suspension-bridge silhouette across the river (Williamsburg-Bridge cue):
    // two steel towers, a deck, and sagging cable approximated by short segments
    {
      const bz = originZ - 210, span = 880, x0b = eastEdge + 10;   // in the river camera's sightline
      const deckY = 36;
      // Williamsburg-Bridge paint: neutral warm gray (the earlier tint read orange)
      const paint = new THREE.Color(1.06, 1.03, 0.98);
      const deck = box(span, 3.2, 22, { segY: 1 });
      B.addMerged('steelDark', deck, tmat(x0b + span / 2, deckY, bz), { tint: paint });
      // deck truss: chords + diagonals under the roadway
      for (const tz of [bz - 10, bz + 10]) {
        B.addMerged('steelDark', box(span, 0.9, 0.9, { segY: 1 }), tmat(x0b + span / 2, deckY - 4, tz), { tint: paint });
        for (let x = x0b + 6; x < x0b + span - 6; x += 12) {
          const dg = box(0.6, 5.2, 0.6, { segY: 1 }); dg.rotateZ(0.7);
          B.addMerged('steelDark', dg, tmat(x, deckY - 4, tz), { tint: paint });
          B.addMerged('steelDark', box(0.6, 4, 0.6, { segY: 1 }), tmat(x + 6, deckY - 4, tz), { tint: paint });
        }
      }
      for (const tx of [x0b + span * 0.22, x0b + span * 0.78]) {
        for (const tz of [bz - 9, bz + 9]) {
          B.addMerged('steelDark', box(6, 96, 5, { segY: 1 }), tmat(tx, 0, tz), { tint: paint });
        }
        B.addMerged('steelDark', box(8, 4, 24, { segY: 1 }), tmat(tx, 96, bz), { tint: paint });
        B.addMerged('steelDark', box(8, 4, 24, { segY: 1 }), tmat(tx, 60, bz), { tint: paint });
      }
      // masonry anchorages meeting the water at both ends
      for (const ax of [x0b - 8, x0b + span + 8]) {
        B.addMerged('graniteBase', box(22, deckY + 6, 30, { segY: 2 }), tmat(ax, -1, bz), { tint: new THREE.Color(0.62, 0.6, 0.57) });
      }
      // main cables: catenary between tower tops, sagging to the deck mid-span
      const segs = 18;
      const cableY = (t) => 96 - (96 - deckY - 4) * (1 - Math.pow(2 * t - 1, 2));
      for (const tz of [bz - 9, bz + 9]) {
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const xa = x0b + span * (0.22 + 0.56 * t0), xb = x0b + span * (0.22 + 0.56 * t1);
          const ya = cableY(t0), yb = cableY(t1);
          const len = Math.hypot(xb - xa, yb - ya);
          const seg = box(len, 1.1, 1.1, { segY: 1 });
          seg.rotateZ(Math.atan2(yb - ya, xb - xa));
          B.addMerged('steelDark', seg, tmat((xa + xb) / 2, (ya + yb) / 2 - 0.55, tz), { tint: paint });
          // vertical hangers cable -> deck
          const hy = (ya + yb) / 2, hx = (xa + xb) / 2;
          if (hy - deckY > 2) {
            B.addMerged('steelDark', box(0.35, hy - deckY, 0.35, { segY: 1 }), tmat(hx, deckY, tz), { tint: paint });
          }
        }
        // side spans down to anchorages
        for (const [xa, xb] of [[x0b, x0b + span * 0.22], [x0b + span * 0.78, x0b + span]]) {
          const seg = box(Math.hypot(xb - xa, 96 - deckY), 1.0, 1.0, { segY: 1 });
          const up = xa < x0b + span / 2 ? 1 : -1;
          seg.rotateZ(up * Math.atan2(96 - deckY, xb - xa));
          B.addMerged('steelDark', seg, tmat((xa + xb) / 2, (96 + deckY) / 2, tz), { tint: new THREE.Color(0.45, 0.47, 0.5) });
        }
      }
    }
    // far bank: a dark 30m apron + bulkhead so towers don't rise out of water
    const apron = box(34, 1.6, 3200, { segY: 1 });
    B.addMerged('graniteBase', apron, tmat(eastEdge + 900 - 17, -0.4, 0), {
      tint: new THREE.Color(0.32, 0.32, 0.31), worldUV: false,
    });
    // far bank in three depth bands (900 / 1600 / 2500m), each hazier; crowns
    // and spires via the same silhouette helper the other compass sides use
    const wRng = makeRng(seed + 1234);
    const bankSilhouette = (x, z, w, d, h, tintS) => {
      const g = box(w, h, d, { segY: 3 });
      B.addMerged('skyline', g, tmat(x, 0, z), { tint: new THREE.Color().setScalar(tintS), aoTop: 0 });
      if (h > 120 && wRng.bool(0.6)) {
        const g2 = box(w * 0.55, h * wRng.range(0.15, 0.3), d * 0.55, { segY: 1 });
        B.addMerged('skyline', g2, tmat(x, h, z), { tint: new THREE.Color().setScalar(tintS * 1.03) });
        if (wRng.bool(0.35)) {
          const g3 = box(w * 0.08, h * wRng.range(0.12, 0.25), d * 0.08, { segY: 1 });
          B.addMerged('skyline', g3, tmat(x, h * 1.2, z), { tint: new THREE.Color().setScalar(tintS) });
        }
      }
    };
    // aerial perspective: far bands tint UP toward the fog color, never darker
    for (const [dist, tintS, hScale] of [[900, 0.30, 1.0], [1600, 0.24, 1.25], [2500, 0.19, 1.5]]) {
      let wz = -1600;
      while (wz < 1600) {
        const w = wRng.range(30, 70), d = wRng.range(30, 60);
        const h = hScale * wRng.weighted([[wRng.range(40, 90), 4], [wRng.range(100, 220), 2.5], [wRng.range(240, 330), 0.6]]);
        bankSilhouette(eastEdge + dist + wRng.range(0, 160) + d / 2, wz + d / 2, w, d, h, tintS);
        wz += d + wRng.range(6, 40);
      }
    }
  }

  // ring-1 on the two faces hero cameras look into (south row, east column)
  // gets REAL generated buildings so no placeholder ever sits in a hero frame
  {
    const rRng = makeRng(seed + 5150);
    // only the blocks in hero sightlines: south of the SoHo/Bed-Stuy column
    // pair, and the east column facing the waterfront row
    const realRing = [];
    for (let bx = Math.max(0, cols - 3); bx < cols; bx++) realRing.push([bx, -1]);
    for (let bz = 0; bz < rowsN; bz++) realRing.push([cols, bz]);
    // (a real north row was tried: +25% triangles for 29 fps on the aerial
    // orbit — the mid-distance tier there stays as dressed filler instead)
    for (const [bx, bz] of realRing) {
      const x0 = originX + bx * pitchX, z0 = originZ + bz * pitchZ;
      const dName = bz === -1 ? (bx >= 3 ? 'soho' : 'harlem-mixed') : 'wburg-waterfront';
      const district = DISTRICTS[dName] || DISTRICTS['harlem-mixed'];
      info.blocks.push({ x0, z0, w: blockW, d: blockD, district: 'ring:' + dName });
      sidewalkRing(ctx, x0, z0, blockW, blockD);
      const aveLotDepth = 19;
      for (const side of [0, 1]) {
        fillRow(ctx, rRng, district, {
          xStart: x0 + aveLotDepth, xEnd: x0 + blockW - aveLotDepth,
          zFront: side === 0 ? z0 : z0 + blockD, facing: side === 0 ? Math.PI : 0,
          districtName: dName, info,
        });
      }
      for (const side of [0, 1]) {
        fillRowZ(ctx, rRng, district, {
          zStart: z0 + 0.4, zEnd: z0 + blockD - 0.4,
          xFront: side === 0 ? x0 : x0 + blockW, facing: side === 0 ? -Math.PI / 2 : Math.PI / 2,
          districtName: dName, info,
        });
      }
      furnish(ctx, rRng, district, x0, z0, blockW, blockD, info);
    }
  }

  // context ring: massing blocks continuing the grid on BOTH block faces so
  // aerials and vistas never end at a void (fog carries the rest)
  {
    const cRng = makeRng(seed + 77);
    const isReal = (bx, bz) => (bz === -1 && bx >= Math.max(0, cols - 3) && bx < cols)
      || (bx === cols && bz >= 0 && bz < rowsN);
    // rings 1-3 are dressed (cornice, coping, roof variety); rings 4-5 are
    // plain boxes that fill the void band between the city and the skyline
    // the East River begins at ring 3's east face: no massing stands in the water
    const waterX = originX + cols * pitchX + 3 * pitchX - AVE_W;
    for (let bx = -5; bx < cols + 5; bx++) {
      for (let bz = -5; bz < rowsN + 5; bz++) {
        if (bx >= 0 && bx < cols && bz >= 0 && bz < rowsN) continue;
        if (isReal(bx, bz)) continue;
        const ringDist = Math.max(bx < 0 ? -bx : bx >= cols ? bx - cols + 1 : 0, bz < 0 ? -bz : bz >= rowsN ? bz - rowsN + 1 : 0);
        const dressed = ringDist <= 3;
        const x0 = originX + bx * pitchX, z0 = originZ + bz * pitchZ;
        if (x0 >= waterX - 1) continue;
        for (const zSide of [0, 1]) {
          let cx = x0 + cRng.range(0, 4);
          while (cx < x0 + blockW - 8) {
            const w = cRng.range(12, 28);
            const d = cRng.range(14, 22);
            const h = cRng.weighted([[cRng.range(9, 16), 5], [cRng.range(17, 30), 3], [cRng.range(32, 60), 0.7]]);
            // ring-1 sits in street sightlines: real brick + real recessed windows;
            // farther rings use the baked window-grid texture
            // rings 1-3 get real punched windows (the baked window grid is
            // sub-pixel from an aerial); albedo spread: painted brick, limestone
            const punched = ringDist <= 5;
            const mat = punched
              ? cRng.weighted([['brickRed', 3], ['brickBrown', 2], ['brickTan', 2], ['brickOrange', 1.5],
                ['brickPaintedCream', 2], ['limestone', 1.5], ['brickPaintedGray', 1.5]])
              : cRng.weighted([['fillerFacade', 3], ['brickRed', 1.5], ['brickBrown', 1], ['brickTan', 1], ['brickPaintedCream', 0.8]]);
            const zPos = zSide === 0 ? z0 : z0 + blockD - d;
            // per-box value AND hue jitter: no two context boxes share an albedo
            const tint = new THREE.Color().setHSL(cRng.range(0.04, 0.11), cRng.range(0.04, 0.16), cRng.range(0.36, 0.58));
            if (punched) {
              // street face is a REAL punched wall with kit windows sitting in its
              // openings (reveal + glass + dark room); a solid body sits behind it
              const wallT = 0.35;
              const faceZ = zSide === 0 ? zPos : zPos + d;
              const frame = tmat(cx + w / 2, 0, faceZ, zSide === 0 ? Math.PI : 0);
              const bodyZ = zSide === 0 ? zPos + wallT + (d - wallT) / 2 : zPos + (d - wallT) / 2;
              // body in 2-4 tonal bands (old paint/tar lines) so the blank side and
              // rear faces are never one 30m value; 1-2 drain stains per side face
              const nB = 2 + Math.floor(cRng.range(0, 2.99));
              let yb = 0;
              for (let b = 0; b < nB; b++) {
                const y1 = b === nB - 1 ? h : Math.min(h, yb + (h / nB) * cRng.range(0.7, 1.3));
                if (y1 - yb < 0.3) continue;
                const body = box(ringDist <= 1 ? w - 2 * wallT : w, y1 - yb, d - wallT, { segY: 1 });
                B.addMerged(mat, body, tmat(cx + w / 2, yb, bodyZ), {
                  tint: tint.clone().multiplyScalar(cRng.range(0.8, 1.08)), grime: cRng.range(0.08, 0.34),
                });
                yb = y1;
              }
              if (h > 8) {
                for (const sx of [-1, 1]) {
                  if (cRng.bool(0.4)) continue;
                  const len = cRng.range(4, Math.min(12, h * 0.7));
                  const q = box(0.02, len, cRng.range(0.5, 1.0));   // thin dark stain slab on the x face
                  B.addMerged('grimeStreak', q, tmat(sx > 0 ? cx + w + 0.012 : cx - 0.012, h - len, bodyZ + cRng.range(-d * 0.3, d * 0.3)), {
                    tint: new THREE.Color().setScalar(cRng.range(0.08, 0.18)), worldUV: false,
                  });
                }
              }
              const floors = Math.max(2, Math.floor((h - 1.2) / 3.35));
              const bays = Math.max(2, Math.floor((w - 1.6) / 2.5));
              const ww = 1.2, wh = 1.9, rows = [];
              for (let f = 0; f < floors; f++) {
                const wy = 1.3 + f * 3.35;
                const openings = [];
                for (let b = 0; b < bays; b++) openings.push({ x: -w / 2 + (w / (bays + 1)) * (b + 1), w: ww });
                rows.push({ y0: wy, y1: wy + wh, openings });
              }
              punchedWall(ctx, frame, { width: w, height: h, depth: wallT, mat, tint, rows, grime: 0.25 });
              for (const row of rows) {
                for (const op of row.openings) {
                  ctx.kit.window({ w: ww, h: wh, style: 'dh1', recess: 0.14 },
                    frame.clone().multiply(tmat(op.x, row.y0, 0)), { lit: cRng.bool(0.36) });
                }
              }
              if (ringDist <= 1) {
                // avenue-facing ENDS get windows too: from an aerial the blank x
                // faces of the context boxes read as greybox
                const ew = d - wallT;
                const ebays = Math.max(1, Math.floor((ew - 1.6) / 3.2));
                const erows = rows.map((r) => ({
                  y0: r.y0, y1: r.y1,
                  openings: Array.from({ length: ebays }, (_, b) => ({ x: -ew / 2 + (ew / (ebays + 1)) * (b + 1), w: ww })),
                }));
                for (const [fx, ry] of [[cx, -Math.PI / 2], [cx + w, Math.PI / 2]]) {
                  const ef = tmat(fx, 0, bodyZ, ry);
                  punchedWall(ctx, ef, { width: ew, height: h, depth: wallT, mat, tint, rows: erows, grime: 0.25 });
                  for (const row of erows) {
                    for (const op of row.openings) {
                      ctx.kit.window({ w: ww, h: wh, style: 'dh1', recess: 0.14 },
                        ef.clone().multiply(tmat(op.x, row.y0, 0)), { lit: cRng.bool(0.36) });
                    }
                  }
                }
              }
            } else {
              const g = box(w, h, d, { segY: dressed ? 2 : 1 });
              B.addMerged(mat, g, tmat(cx + w / 2, 0, zPos + d / 2), { tint, grime: 0.25 });
            }
            if (!dressed) { cx += w + cRng.range(1, 7); continue; }
            // intermediate LOD: extruded cornice band + parapet coping so the
            // mid-distance tier isn't a bare box with a painted grid
            const corn = box(w + 0.5, 0.55, d + 0.5, { segY: 1 });
            B.addMerged('cornicePaint', corn, tmat(cx + w / 2, h - 0.55, zPos + d / 2), {
              tint: new THREE.Color().setScalar(cRng.range(0.3, 0.55)),
            });
            const roofMat = cRng.weighted([['roofBlack', 5.5], ['roofSilver', 2.5], ['roofGravel', 2]]);
            const cap = box(w + 0.1, 0.5, d + 0.1, { segY: 1 });
            B.addMerged(roofMat, cap, tmat(cx + w / 2, h, zPos + d / 2), {});
            if (cRng.bool(0.22)) {
              ctx.kit.waterTower(tmat(cx + w / 2, h + 0.4, zPos + d / 2, cRng.range(0, 3)), {
                legH: cRng.range(3.2, 5), r: cRng.range(1.7, 2.2), hBody: cRng.range(3, 4.2),
              });
            }
            // no NYC roof is bare: bulkhead, vents, an HVAC unit on the near rings
            if (ringDist <= 5) {
              const rx = (a, b) => cx + w / 2 + cRng.range(a, b) * w * 0.5;
              const rz = (a, b) => zPos + d / 2 + cRng.range(a, b) * d * 0.5;
              if (cRng.bool(0.6)) {
                ctx.kit.bulkhead(tmat(rx(-0.5, 0.5), h + 0.5, rz(-0.4, 0.4)), {
                  w: cRng.range(2.2, 3), d: cRng.range(1.8, 2.4), h: cRng.range(2.2, 2.7), mat: 'stucco',
                });
              }
              const nV = 2 + Math.floor(cRng.range(0, 3.99));
              for (let v = 0; v < nV; v++) {
                ctx.kit.vent(tmat(rx(-0.8, 0.8), h + 0.5, rz(-0.8, 0.8)), {
                  kind: cRng.pick(['pipe', 'pipe', 'goose', 'whirly']),
                });
              }
              if (cRng.bool(0.5)) ctx.kit.hvac(tmat(rx(-0.6, 0.6), h + 0.5, rz(-0.6, 0.6), cRng.range(0, 3)));
            }
            cx += w + cRng.range(1, 7);
          }
        }
      }
    }
    // distant skyline silhouettes on N, S and W (east has the river skyline):
    // haze-graded profiles with setbacks, not textured cutouts
    const silhouette = (x, z, w, d, h) => {
      const g = box(w, h, d, { segY: 3 });
      // distance-driven tint (farther = lighter, toward fog) + small jitter
      const distT = Math.min(1, Math.hypot(x, z) / 1500);
      const tintS = 0.42 - distT * 0.20 + cRng.range(-0.06, 0.06);   // farther = DARKER: the band must sit below the sky, not float above it
      B.addMerged('skyline', g, tmat(x, 0, z), { tint: new THREE.Color().setScalar(tintS), aoTop: 0 });
      if (h > 120 && cRng.bool(0.6)) {           // setback crown
        const g2 = box(w * 0.55, h * cRng.range(0.15, 0.3), d * 0.55, { segY: 1 });
        B.addMerged('skyline', g2, tmat(x, h, z), { tint: new THREE.Color().setScalar(tintS * 1.03) });
        if (cRng.bool(0.35)) {                   // spire / mast
          const g3 = box(w * 0.08, h * cRng.range(0.12, 0.25), d * 0.08, { segY: 1 });
          B.addMerged('skyline', g3, tmat(x, h * 1.2, z), { tint: new THREE.Color().setScalar(tintS) });
        }
      }
    };
    for (const [axis, sign, dist] of [['z', -1, 1250], ['z', 1, 1450], ['x', -1, 1350]]) {
      let s = -900;
      while (s < 900) {
        const w = cRng.range(35, 90), d = cRng.range(30, 60);
        const h = cRng.weighted([[cRng.range(60, 120), 4], [cRng.range(130, 240), 2.2], [cRng.range(250, 320), 0.5]]);
        const off = sign * (dist + cRng.range(-90, 90));
        if (axis === 'z') silhouette(s + w / 2, off, w, d, h);
        else silhouette(off, s + w / 2, d, w, h);
        s += w + cRng.range(10, 60);
      }
    }
  }

  // road markings: crosswalks, stop lines, avenue double-yellow
  markings(ctx, { originX, originZ, cols, rowsN, blockW, blockD, pitchX, pitchZ, info });

  // two subway entrances anchor the commercial spines
  {
    const b1x = originX, b1z = originZ + pitchZ;                    // harlem-125 block
    K.subwayEntrance(tmat(b1x + blockW - 9, 0.14, b1z + blockD + 2, 0));
    if (cols >= 3) {
      const b2x = originX + 2 * pitchX, b2z = originZ + pitchZ;     // wburg-bedford block
      K.subwayEntrance(tmat(b2x + 9, 0.14, b2z - 2, Math.PI));
    }
  }

  return info;
}

function pickType(rng, district, remaining) {
  // choose a type that fits remaining frontage
  for (let tries = 0; tries < 6; tries++) {
    const t = rng.weighted(district.types.filter(([name]) => TYPES.has(name)));
    if (!t) break;
    const [lo] = TYPE_WIDTH[t];
    if (lo <= remaining) return t;
  }
  return null;
}

function lotDepth(rng, type) {
  const [lo, hi] = TYPE_DEPTH[type] || [14, 18];
  return rng.range(lo, hi);
}

function fillRow(ctx, rng, district, { xStart, xEnd, zFront, facing, districtName, info }) {
  let x = xStart;
  let i = 0;
  // rowhouses and brownstones arrive in identical runs
  let runType = null, runLeft = 0, runW = 0;
  while (x < xEnd - 5.0) {
    let type = pickType(rng, district, xEnd - x);
    if (!type) break;
    if (runLeft > 0 && runType && TYPE_WIDTH[runType][0] <= xEnd - x) {
      type = runType; runLeft--;
    } else if (type === 'brownstone' || type === 'rowhouse') {
      runType = type; runLeft = rng.int(2, 6);
      runW = rng.range(...TYPE_WIDTH[type]);
    } else {
      runType = null; runLeft = 0;
    }
    const [lo, hi] = TYPE_WIDTH[type];
    const w = (runType === type && runW >= lo) ? Math.min(runW, xEnd - x) : rng.range(lo, Math.min(hi, xEnd - x));
    const commercial = rng.bool(district.commercialChance);
    const cx = x + w / 2;
    const frame = tmat(cx, 0, zFront, facing);
    const lot = {
      frame, width: w, depth: lotDepth(rng, type), corner: 0,
      commercial, mirror: i % 2 === 1, district: districtName,
    };
    generateBuilding(type, ctx, lot, rng.fork());
    info.buildings++;
    x += w + 0.02;
    i++;
  }
}

function fillRowZ(ctx, rng, district, { zStart, zEnd, xFront, facing, districtName, info }) {
  let z = zStart;
  let i = 0;
  const lots = [];
  while (z < zEnd - 5.0) {
    const type = pickType(rng, district, zEnd - z);
    if (!type) break;
    const [lo, hi] = TYPE_WIDTH[type];
    const w = rng.range(lo, Math.min(hi, zEnd - z));
    lots.push({ type, w, z });
    z += w + 0.02;
  }
  for (let li = 0; li < lots.length; li++) {
    const { type, w, z: lz } = lots[li];
    const cz = lz + w / 2;
    const frame = tmat(xFront, 0, cz, facing);
    // end lots hold the corner: flag which local side faces the cross street
    const corner = li === 0 ? (facing > 0 ? 1 : -1) : li === lots.length - 1 ? (facing > 0 ? -1 : 1) : 0;
    const lot = {
      frame, width: w, depth: lotDepth(rng, type), corner,
      commercial: rng.bool(Math.max(0.5, district.commercialChance)),
      mirror: i % 2 === 1, district: districtName,
    };
    generateBuilding(type, ctx, lot, rng.fork());
    info.buildings++;
    i++;
  }
}

// NYCHA superblock: towers on a lawn instead of perimeter lots.
function nychaCampus(ctx, rng, { x0, z0, w, d, info }) {
  const B = ctx.batcher;
  // lawn base
  const lawn = box(w - 0.4, 0.08, d - 0.4, { segY: 1 });
  B.addMerged(ctx.batcher.M.has('nycha:lawn') ? 'nycha:lawn' : 'concrete', lawn,
    tmat(x0 + w / 2, 0.05, z0 + d / 2), { tint: new THREE.Color(0.55, 0.6, 0.45) });
  // concrete paths from sidewalks to entrances
  for (const [px, pz, pw, pd] of [
    [x0 + w * 0.3, z0 + d / 2, 2.2, d], [x0 + w * 0.72, z0 + d / 2, 2.2, d],
    [x0 + w / 2, z0 + d * 0.5, w, 2.2],
  ]) {
    const g = box(pw, 0.1, pd, { segY: 1 });
    B.addMerged('sidewalk', g, tmat(px, 0.045, pz));
  }
  const placements = [
    { x: x0 + w * 0.28, z: z0 + d * 0.52, ry: Math.PI, st: rng.int(9, 14) },
    { x: x0 + w * 0.74, z: z0 + d * 0.5, ry: Math.PI + rng.range(-0.35, 0.35), st: rng.int(11, 16) },
  ];
  for (const p of placements) {
    const lot = {
      frame: tmat(p.x, 0.08, p.z, p.ry),
      width: rng.range(26, 32), depth: rng.range(16, 19), corner: 0,
      commercial: false, mirror: false, district: 'nycha-campus', stories: p.st,
    };
    generateBuilding('nycha', ctx, lot, rng.fork());
    info.buildings++;
  }
  // campus perimeter fence (hairpin style approximated with kit fence)
  for (let x = x0 + 4; x < x0 + w - 4; x += 5) {
    if (Math.abs(x - (x0 + w * 0.3)) < 2.5 || Math.abs(x - (x0 + w * 0.72)) < 2.5) continue;
    ctx.kit.fence(5, tmat(x + 2.5, 0.12, z0 + 0.3));
    ctx.kit.fence(5, tmat(x + 2.5, 0.12, z0 + d - 0.3));
  }
}

function sidewalkRing(ctx, x0, z0, w, d) {
  const B = ctx.batcher;
  const s = SIDEWALK;
  const slabs = [
    [x0 - s, z0 - s, w + s * 2, s],            // south apron
    [x0 - s, z0 + d, w + s * 2, s],            // north apron
    [x0 - s, z0, s, d],                        // west
    [x0 + w, z0, s, d],                        // east
  ];
  // flags laid in ~3m runs with per-run tint jitter and occasional repair
  // patches so the sidewalk stops reading as one continuous decal
  const sRng = makeRng(Math.floor(x0 * 7 + z0 * 13) >>> 0);
  for (const [sx, sz, sw, sd] of slabs) {
    const along = sw >= sd ? 'x' : 'z';
    const len = along === 'x' ? sw : sd;
    let t = 0;
    while (t < len - 0.01) {
      const seg = Math.min(len - t, 1.5 + sRng.next() * 1.5);
      const r = sRng.next();
      const tint = r < 0.08 ? 0.72 : r < 0.16 ? 1.12 : 0.76 + sRng.next() * 0.36;
      const g = along === 'x' ? box(seg, CURB_H, sd, { segY: 1 }) : box(sw, CURB_H, seg, { segY: 1 });
      boxUV(g, along === 'x' ? seg : sw, CURB_H, along === 'x' ? sd : seg, 3);
      const px = along === 'x' ? sx + t + seg / 2 : sx + sw / 2;
      const pz = along === 'x' ? sz + sd / 2 : sz + t + seg / 2;
      B.addMerged('sidewalk', g, tmat(px, 0, pz), { tint: new THREE.Color().setScalar(tint) });
      t += seg;
    }
  }
  // ground scatter: stains, gum clusters, leaf litter — flat tinted decals.
  // Every reference photo has it; not one render did.
  if (!B.hasPart('walk:stain')) {
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    B.definePart('walk:stain', sg, 'walkStain', { castShadow: false });
  }
  for (const [sx, sz, sw, sd] of slabs) {
    const n = Math.round((sw * sd) / 12);            // ~1 per 12 m²
    for (let i = 0; i < n; i++) {
      const px = sx + 0.3 + sRng.next() * (sw - 0.6), pz = sz + 0.3 + sRng.next() * (sd - 0.6);
      const sc = 0.4 + sRng.next() * 0.7;
      B.addInstance('walk:stain', tmat(px, CURB_H + 0.006, pz, sRng.next() * 3.14, sc, 1, sc * (0.5 + sRng.next() * 0.6)),
        new THREE.Color().setScalar(0.8 + sRng.next() * 0.3));
    }
  }
  // granite curb along the outer perimeter (reads as the gray edge line)
  const curbs = [
    [x0 - s, z0 - s, w + s * 2, 0.2],
    [x0 - s, z0 + d + s - 0.2, w + s * 2, 0.2],
    [x0 - s, z0 - s, 0.2, d + s * 2],
    [x0 + w + s - 0.2, z0 - s, 0.2, d + s * 2],
  ];
  for (const [cx, cz, cw, cd] of curbs) {
    const g = box(cw, CURB_H + 0.015, cd, { segY: 1 });
    boxUV(g, cw, CURB_H + 0.015, cd, 2);
    B.addMerged('graniteBase', g, tmat(cx + cw / 2, 0, cz + cd / 2), {
      tint: new THREE.Color(0.62, 0.62, 0.63),
    });
  }
  // interior of block (rear yards): dark soil/concrete + yard dividers/clutter
  const g = box(w - 0.2, 0.05, d - 0.2, { segY: 1 });
  ctxAddTint(B, 'concrete', g, tmat(x0 + w / 2, 0, z0 + d / 2), 0.72);
  {
    const yRng = makeRng(hash2(x0, z0));
    const zMid = z0 + d / 2;
    for (let x = x0 + 20 + yRng.range(0, 4); x < x0 + w - 20; x += yRng.range(5.4, 8)) {
      // wooden yard fences running into the block from both building rows
      const fl = yRng.range(6, 10);
      const fg = box(0.06, 1.85, fl, { segY: 1 });
      ctxAddTint(B, 'woodStave', fg, tmat(x, 0.05, zMid + (yRng.bool(0.5) ? -fl / 2 : fl / 2)), yRng.range(0.5, 0.85));
      // yard clutter: shed, planter bed, or junk box
      if (yRng.bool(0.4)) {
        const sw2 = yRng.range(1.6, 2.6);
        const sg = box(sw2, yRng.range(1.9, 2.3), sw2, { segY: 1 });
        ctxAddTint(B, yRng.bool(0.5) ? 'woodStave' : 'rollGate', sg,
          tmat(x + yRng.range(1, 3), 0.05, zMid + yRng.range(-4, 4), yRng.range(0, 3)), yRng.range(0.6, 0.9));
      }
      if (yRng.bool(0.35)) {
        const pg = box(yRng.range(1.5, 3), 0.3, yRng.range(1, 2), { segY: 1 });
        ctxAddTint(B, 'soil', pg, tmat(x - yRng.range(1, 3), 0.05, zMid + yRng.range(-3, 3)), 1);
      }
    }
  }
}

function ctxAddTint(B, mat, g, m, mul) {
  B.addMerged(mat, g, m, { tint: new THREE.Color(mul, mul, mul) });
}

function furnish(ctx, rng, district, x0, z0, w, d, info) {
  const K = ctx.kit;
  const s = SIDEWALK;
  // streetlights along both long sides, ~27m apart, at curb
  for (const side of [0, 1]) {
    const z = side === 0 ? z0 - s + 0.7 : z0 + d + s - 0.7;
    const ry = side === 0 ? Math.PI : 0;
    for (let x = x0 + 8 + rng.range(0, 6); x < x0 + w - 6; x += 27) {
      K.streetlight(tmat(x, CURB_H, z, ry), { kind: district.lights });
      if (info) info.lamps.push([x, z, district.lights, ry]);
    }
    // hydrant
    if (rng.bool(0.9)) {
      K.hydrant(tmat(x0 + rng.range(10, w - 10), CURB_H, z + (side === 0 ? 0.9 : -0.9), rng.range(0, 6.28)));
    }
    // trees: dense on residential sides, sparse elsewhere (NYC plants both)
    const treeChance = district.trees ? 0.85 : 0.35;
    for (let x = x0 + 12 + rng.range(0, 5); x < x0 + w - 8; x += rng.range(8, 13)) {
      if (rng.bool(treeChance)) {
        // pits abut the curb — never near the facades
        K.tree(tmat(x, CURB_H, z + (side === 0 ? 0.45 : -0.45), rng.range(0, 6.28)), {
          tint: new THREE.Color().setHSL(0.24 + rng.range(-0.04, 0.04), rng.range(0.3, 0.45), rng.range(0.28, 0.42)),
        });
      }
    }
  }
  // corner trash cans
  for (const [cx, cz] of [[x0 - s + 1, z0 - s + 1], [x0 + w + s - 1, z0 + d + s - 1]]) {
    if (rng.bool(0.6)) K.trashCan(tmat(cx, CURB_H, cz));
  }
  // curbside trash piles (collection night is every night somewhere in NYC)
  for (const side of [0, 1]) {
    const z = side === 0 ? z0 - s + 1.0 : z0 + d + s - 1.0;
    for (let x = x0 + 6; x < x0 + w - 6; x += rng.range(15, 28)) {
      if (rng.bool(0.5)) K.trashBags(tmat(x, CURB_H, z, rng.range(0, 6.28)), rng, rng.int(2, 5));
    }
  }

  // ---- street furniture II ---------------------------------------------------
  const commercial = district.commercialChance > 0.4;
  for (const side of [0, 1]) {
    const zCurb = side === 0 ? z0 - s + 0.7 : z0 + d + s - 0.7;
    const zInner = side === 0 ? z0 - 0.5 : z0 + d + 0.5;
    const ry = side === 0 ? Math.PI : 0;
    // parking-regulation sign poles between lamps
    for (let x = x0 + 15 + rng.range(0, 8); x < x0 + w - 8; x += rng.range(20, 30)) {
      K.signPole(tmat(x, CURB_H, zCurb, ry + rng.range(-0.1, 0.1)), {
        signs: rng.weighted([[['noparking'], 3], [['altside'], 3], [['nostanding', 'loading'], 2], [['oneway'], 1]]),
      });
    }
    if (commercial) {
      for (let x = x0 + 10 + rng.range(0, 10); x < x0 + w - 10; x += rng.range(24, 40)) {
        if (rng.bool(0.7)) K.bikeRack(tmat(x, CURB_H, zCurb + (side === 0 ? 1.4 : -1.4), ry + Math.PI / 2));
        if (rng.bool(0.6)) K.siamese(tmat(x + rng.range(3, 8), CURB_H, zInner));
      }
      // one scaffolding shed per commercial side sometimes — very NYC
      if (rng.bool(0.4)) {
        const sl = rng.pick([12, 16]);
        const sx = x0 + rng.range(sl / 2 + 4, w - sl / 2 - 4);
        K.shed(sl, tmat(sx, 0.02, side === 0 ? z0 - 3.75 : z0 + d + 3.75, side === 0 ? 0 : Math.PI));
      }
    }
  }
  // corners: name signs, ramps, mail, news boxes
  const corners = [
    [x0 - s + 0.9, z0 - s + 0.9, Math.PI * 0.75], [x0 + w + s - 0.9, z0 - s + 0.9, -Math.PI * 0.75],
    [x0 - s + 0.9, z0 + d + s - 0.9, Math.PI * 0.25], [x0 + w + s - 0.9, z0 + d + s - 0.9, -Math.PI * 0.25],
  ];
  const bladePairs = {
    crook: ['blade-w132', 'blade-lenox'], cobra: ['blade-bedford', 'blade-berry'],
  };
  corners.forEach(([cx, cz, cry], i) => {
    K.curbRamp(tmat(cx + Math.cos(cry) * 0.4, CURB_H + 0.005, cz + Math.sin(cry) * 0.4, cry));
    if (i % 2 === 0) K.streetName(tmat(cx, CURB_H, cz, cry + rng.range(-0.1, 0.1)), {
      blades: bladePairs[district.lights] || bladePairs.cobra,
    });
    if (i === 1 && rng.bool(0.4)) K.mailbox(tmat(cx - 1.2, CURB_H, cz + 0.6, cry));
    if (i === 3 && commercial && rng.bool(0.55)) K.newsBoxes(tmat(cx - 1.5, CURB_H, cz - 0.8, cry), rng, rng.int(2, 4));
  });
  // bus stop on the west avenue apron
  if (rng.bool(0.5)) K.busStop(tmat(x0 - s + 0.8, CURB_H, z0 + d / 2 + rng.range(-10, 10), Math.PI / 2));
}

function markings(ctx, { originX, originZ, cols, rowsN, blockW, blockD, pitchX, pitchZ, info }) {
  const B = ctx.batcher;
  const paint = (w, d, x, z) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    // tyre-worn thermoplastic: every stripe a different value (0.55–0.95), the
    // odd one nearly scrubbed off — clean uniform white stripes were a tell
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const wear = h < 0.12 ? 0.45 + h * 2 : 0.62 + h * 0.33;
    B.addMerged('roadPaint', g, tmat(x, 0.012, z), { worldUV: false, tint: new THREE.Color(0.9 * wear, 0.9 * wear, 0.88 * wear) });
  };
  // Street gaps run z ∈ [z0-STREET_W, z0] before each block row (and after the
  // last); avenue gaps run x ∈ [x0-AVE_W, x0] before each column.
  // NYC: one-way side streets have no centerline; avenues get double yellow.
  for (let bz = 0; bz <= rowsN; bz++) {
    const zTop = originZ + bz * pitchZ;                 // block-row south edge
    const zRoad0 = zTop - STREET_W + SIDEWALK, zRoad1 = zTop - SIDEWALK;
    const zc = (zRoad0 + zRoad1) / 2;
    for (let bx = 0; bx < cols; bx++) {
      const x0 = originX + bx * pitchX;
      // crosswalk ladders at both ends of the block (avenue crossings)
      for (const cx of [x0 - 2.2, x0 + blockW + 2.2]) {
        for (let z = zRoad0 + 0.7; z < zRoad1 - 0.3; z += 1.05) {
          paint(3.2, 0.55, cx, z);
        }
      }
      // stop line before the crosswalk
      paint(3.6, 0.5, x0 - 5.4, zc + (bz % 2 === 0 ? 1.6 : -1.6));
    }
  }
  // avenue luminaires: cobra heads down every avenue, alternating curbs (the
  // avenues are the brightest streets in the city — canyon views need them)
  {
    const K2 = ctx.kit;
    for (let bx = 0; bx <= cols; bx++) {
      const xLeft = originX + bx * pitchX - AVE_W;
      const xCurbW = xLeft + SIDEWALK - 0.7, xCurbE = xLeft + AVE_W - SIDEWALK + 0.7;
      const zStart = originZ - STREET_W, zEnd = originZ + rowsN * pitchZ;
      let i = 0;
      for (let z = zStart + 10; z < zEnd - 6; z += 27, i++) {
        const west = i % 2 === 0;
        const lx = west ? xCurbW : xCurbE;
        K2.streetlight(tmat(lx, CURB_H, z, west ? -Math.PI / 2 : Math.PI / 2), { kind: 'cobra' });
        // register for the night point lights — the avenues had luminaires but
        // no light, which is why every avenue night frame read as a black road
        if (info) info.lamps.push([lx, z, 'cobra', west ? -Math.PI / 2 : Math.PI / 2]);
      }
    }
  }

  // manhole covers + utility patches along street centerlines
  {
    const mRng = makeRng(9182);
    const B2 = ctx.batcher;
    if (!B2.hasPart('street:manhole')) {
      // 26" cover (0.66m) with a raised rim — an object, not a black disc
      const lid = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 24);
      lid.translate(0, 0.015, 0);
      const rim = new THREE.CylinderGeometry(0.36, 0.36, 0.02, 24, 1, true);
      rim.translate(0, 0.01, 0);
      const g = compose([{ geom: lid }, { geom: rim }]);
      B2.definePart('street:manhole', g, 'castIron', { castShadow: false });
    }
    if (!B2.hasPart('street:patch')) {
      const pg = new THREE.PlaneGeometry(1, 1);
      pg.rotateX(-Math.PI / 2);
      B2.definePart('street:patch', pg, 'asphalt', { castShadow: false });
      // wheel-polished lane bands: a GLOSSIER asphalt so they catch the sky at
      // grazing angles the way real tyre-polished paths do (a tint alone never read)
      const tg = new THREE.PlaneGeometry(1, 1);
      tg.rotateX(-Math.PI / 2);
      B2.definePart('street:track', tg, 'asphaltPolish', { castShadow: false });
    }
    for (let bz = 0; bz <= rowsN; bz++) {
      const zc = originZ + bz * pitchZ - STREET_W / 2;
      const zRoad0 = zc - (STREET_W - 2 * SIDEWALK) / 2, zRoad1 = zc + (STREET_W - 2 * SIDEWALK) / 2;
      for (let bx = 0; bx < cols; bx++) {
        const x0 = originX + bx * pitchX;
        for (let x = x0 + mRng.range(8, 30); x < x0 + blockW - 8; x += mRng.range(45, 70)) {
          const mz = zc + mRng.range(-2.5, 2.5);
          // every manhole sits in a ring of darker patched asphalt
          B2.addInstance('street:patch', tmat(x, 0.007, mz, mRng.range(0, 0.4), 1.6, 1, 1.6),
            new THREE.Color().setScalar(0.74));
          B2.addInstance('street:manhole', tmat(x, 0.012, mz, mRng.range(0, 6.28)),
            new THREE.Color().setScalar(mRng.range(0.8, 1.05)));
        }
        // wheel-polish tracks: broken 8-24m runs with slight wander, never a
        // ruled full-block stripe
        for (const tz of [zRoad0 + 2.2, zRoad0 + 4.0, zRoad1 - 2.2, zRoad1 - 4.0]) {
          let tx = x0 + mRng.range(2, 10);
          while (tx < x0 + blockW - 6) {
            const len = mRng.range(14, 40);
            const cx = Math.min(tx + len / 2, x0 + blockW - 3 - len / 2);
            B2.addInstance('street:track', tmat(cx, 0.005, tz + mRng.range(-0.18, 0.18), mRng.range(-0.01, 0.01), len, 1, mRng.range(0.75, 1.1)),
              new THREE.Color().setScalar(mRng.range(0.92, 1.10)));
            tx += len + mRng.range(2, 8);
          }
        }
        // utility patch quilt: 7-10 irregular resurfaced rectangles per block
        const nP = mRng.int(7, 10);
        for (let i = 0; i < nP; i++) {
          const pw = mRng.range(1.5, 4.2), pd = mRng.range(1.2, 3.5);
          const lighter = mRng.bool(0.6);
          B2.addInstance('street:patch',
            tmat(x0 + mRng.range(6, blockW - 6), 0.008, mRng.range(zRoad0 + 1.5, zRoad1 - 1.5), mRng.range(-0.04, 0.04), pw, 1, pd),
            new THREE.Color().setScalar(lighter ? 1.25 : 0.72));
        }
        // gutter line: darker, damp band along each curb
        for (const gz of [zRoad0 + 0.22, zRoad1 - 0.22]) {
          B2.addInstance('street:patch', tmat(x0 + blockW / 2, 0.006, gz, 0, blockW - 2, 1, 0.45),
            new THREE.Color().setScalar(0.72));
        }
      }
    }
  }

  // avenues: double yellow center + lane dashes
  for (let bx = 0; bx <= cols; bx++) {
    const xc = originX + bx * pitchX - AVE_W / 2;
    const zStart = originZ - STREET_W, zEnd = originZ + rowsN * pitchZ;
    for (let z = zStart + 2; z < zEnd - 2; z += 4) {
      const g1 = new THREE.PlaneGeometry(0.14, 3.2); g1.rotateX(-Math.PI / 2);
      const B = ctx.batcher;
      B.addMerged('roadPaint', g1, tmat(xc - 0.14, 0.012, z), { worldUV: false, tint: new THREE.Color(0.85, 0.7, 0.2) });
      const g2 = new THREE.PlaneGeometry(0.14, 3.2); g2.rotateX(-Math.PI / 2);
      B.addMerged('roadPaint', g2, tmat(xc + 0.14, 0.012, z), { worldUV: false, tint: new THREE.Color(0.85, 0.7, 0.2) });
    }
    // crosswalks across the avenue at each street
    for (let bz = 0; bz <= rowsN; bz++) {
      const zTop = originZ + bz * pitchZ;
      for (const cz of [zTop - STREET_W - 2.2, zTop + 2.2]) {
        if (cz < zStart || cz > zEnd) continue;
        for (let x = xc - AVE_W / 2 + SIDEWALK + 0.7; x < xc + AVE_W / 2 - SIDEWALK - 0.3; x += 1.05) {
          paint(0.55, 3.2, x, cz);
        }
      }
    }
  }
}
