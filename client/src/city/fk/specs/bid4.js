// AR33 building specs, segment bid4: Lenox Avenue to Fifth Avenue (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/bid4.json).
// Owner: the BID4 worker (docs/notes/ar33-bid4.md).
// u runs left to right as seen from the street: eastward on the north side (Lenox to Fifth), westward on the south side.
// The Lenox corners are here; the north side is in bid4_north.js, the south side in bid4_south.js.

import { shop, fascia, win, widths } from './bid4_help.js';
import NORTH from './bid4_north.js';
import SOUTH from './bid4_south.js';

// AR34 w2r1 tinted the dark 'wood_painted' trims (tints under ~#4a4a4a) warm (x 1.30, 0.68, 0.49 in linear light) because they rendered navy in shade (44 W's cornice
// real #261c18, twin #1e2831, w2r1b). Batch 2 (2026-10-02) divided it back out after LOOK's shade fix (CS34) in bid4_north.js / bid4_south.js (none in this file).
// the stone of 290 Lenox: warm white limestone for the cornice, hoods and the archivolts
const LIME = '#e4dcc8';
// the white glazed tile of its base
const TILE = '#dddbd4';

const LENOX = [
  // ================================================================== 300 Lenox (NE corner), u eastward
  {
    id: 'lenox-300', addr: '300 Lenox Ave', name: 'Starbucks, AT&T, Juici Patties', bin: '1053494',
    at: [2212.9, -2750.9], comp: '4_-6:445', h: 12.4, status: 'measured',
    custom: { fn: 'bid4:lenox300', with: 'kit' },   // the billboard, the gabled pilaster caps, the parapet panels, the diamonds (custom/bid4.js)
    wall: { mat: 'brick_buff', tint: '#d8bb98', dirt: 0.4, bond: 'running' },   // w2r1a calib: wall patches real #c4ad93, twin #bda98d
    faces: [
      {
        edge: 'front',
        base: {
          h: 4.9,
          piers: { at: [0.1, 7.1, 17.8, 25.5], w: 0.6, mat: 'brick_buff', tint: '#c2a97f', proj: 0.06 },
          bays: [
            shop(0.4, 6.9, { name: 'Starbucks', door: null, h: 3.35, glazing: { bulkhead: 0.8, transom: 0.4, mullions: 3, frame: 'alu_bronze', kick: { mat: 'brick_red', tint: '#6d4a3c' } }, interior: 'restaurant',
              sign: fascia(0.4, 6.9, 3.6, 1.1, 'STARBUCKS COFFEE', { font: 'Montserrat-800', bg: '#4a403b', fg: '#f3efe6', tracking: 0.03 }) }),
            shop(7.3, 17.5, { name: 'AT&T', h: 3.35, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 3, frame: 'alu_black' }, door: { u: 0.52, w: 1.0, kind: 'double', recess: 0.7 }, interior: 'shop_phone',
              sign: fascia(7.3, 17.5, 3.8, 1.1, 'AT&T', { font: 'Montserrat-700', bg: '#303338', fg: '#ffffff', logo: 'bid4:att', logoAt: 'left', align: 'center' }) }),
            shop(18.0, 25.0, { name: 'Juici Patties', h: 3.35, glazing: { bulkhead: 0.85, transom: 0.4, mullions: 2, frame: 'alu_clear', kick: { mat: 'brick_white_glazed', tint: '#c7262d' } }, door: { u: 0.36, w: 1.0, kind: 'double', recess: 0.8 }, interior: 'restaurant',
              sign: fascia(17.7, 25.1, 3.85, 1.05, 'JUICI PATTIES', { font: 'ArchivoBlack', bg: '#d3222a', fg: '#ffffff', logo: 'bid4:juici', logoAt: 'left' }) }),
          ],
        },
        // sills 5.6 and 9.5 m, 2.6 m tall, a buff belt course 4.9-5.6 m, a darker spandrel band with diamond inlays 8.2-9.5 m, a stepped brick cap
        bays: { widths: [4.9, 5.8, 5.9, 6.9, 2.3] },
        floors: [{ n: 2, h: 3.9, win: 'A', open: [[0.0, 2.2], [2.6, 4.7], [5.8, 8.0], [8.5, 10.6], [11.7, 14.1], [14.5, 16.8], [17.9, 20.7], [21.2, 24.1]].map(([a, b]) => [a, b, 'A']) }],
        windows: { A: win(2.3, 2.6, 0.7, { kind: 'casement', lights: '2/2', frame: 'alu_bronze', reveal: 0.26,
          lintel: { kind: 'flat', mat: 'brick_red', tint: '#7a4535', h: 0.16, ext: 0.1, proj: 0.03 }, sillStone: { mat: 'cast_stone', tint: '#cbbfa8', h: 0.11, proj: 0.07 }, ac: 0.06, blinds: 0.5, lit: 0.3 }) },   // a thin dark header course
        bands: [
          { at: 'base', h: 0.7, proj: 0.07, mat: 'brick_buff', tint: '#cdb88c' },
          { at: 8.2, h: 1.3, proj: 0.03, mat: 'brick_tan', tint: '#bfa879' },
          { at: 8.2, h: 0.12, proj: 0.06, mat: 'brick_red', tint: '#8f5a43' },
          { at: 9.38, h: 0.12, proj: 0.06, mat: 'brick_red', tint: '#8f5a43' },
        ],
        cornice: { kind: 'parapet', h: 0.25, tint: '#c4ad80' },   // no projecting cornice: a flat brick parapet with a stone coping
      },
      {
        edge: 'corner',
        base: {
          h: 4.9,
          piers: { at: [0.1, 4.4, 14.2, 23.0], w: 0.5, mat: 'brick_buff', tint: '#c2a97f', proj: 0.04 },
          bays: [
            { kind: 'entrance', u0: 0.4, u1: 3.4, door: { kind: 'glass', w: 1.0, recess: 0.5, transom: 0.6 } },
            shop(4.9, 10.4, { name: '304 Mini Mart', h: 3.35, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 2 }, door: null, interior: 'shop_food', gate: { kind: 'rolldown', color: '#8f9193', down: 1, graffiti: 0.7 },
              sign: fascia(4.9, 10.4, 3.4, 1.0, '304 MINI MART CORP', { font: 'Oswald-600', bg: '#f0a08c', fg: '#ffffff' }) }),
            shop(10.8, 13.9, { h: 3.35, door: { u: 0.4, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'shop_food', gate: { kind: 'rolldown', color: '#8f9193', down: 0 },
              sign: fascia(10.8, 13.9, 3.4, 1.0, '', { bg: '#23272b' }) }),
            shop(14.7, 22.6, { name: 'Starbucks', door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.7 }, h: 3.35, glazing: { bulkhead: 0.8, transom: 0.4, mullions: 3, frame: 'alu_bronze', kick: { mat: 'brick_red', tint: '#6d4a3c' } }, interior: 'restaurant',
              sign: fascia(14.7, 22.6, 3.4, 1.0, 'STARBUCKS COFFEE', { font: 'Montserrat-800', bg: '#4a403b', fg: '#f3efe6', tracking: 0.03 }) }),
          ],
        },
        bays: { widths: widths([1.3, [2.1, 2.1], 1.2, [2.1, 2.1], 1.2, [2.1, 2.1], 1.2, [2.1, 2.1], 1.3, 1.0, 1.2]) },
        floors: [{ n: 2, h: 3.9, win: 'A', bays: [1, 2, 4, 5, 7, 8, 10, 11] }],
        windows: { A: win(2.0, 2.6, 0.7, { kind: 'casement', lights: '2/2', frame: 'alu_bronze', reveal: 0.16,
          lintel: { kind: 'flat', mat: 'brick_red', tint: '#8a4a36', h: 0.3 }, sillStone: { mat: 'cast_stone', tint: '#cbbfa8', h: 0.09, proj: 0.04 } }) },
        bands: [{ at: 'base', h: 0.7, proj: 0.07, mat: 'brick_buff', tint: '#cdb88c' }, { at: 8.2, h: 1.3, proj: 0.03, mat: 'brick_tan', tint: '#bfa879' }],
        cornice: { kind: 'parapet', h: 0.25, tint: '#c4ad80' },   // no projecting cornice: a flat brick parapet with a stone coping
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.75, coping: 'cast_stone' }, membrane: 'gravel',
      items: [{ k: 'hvac', at: [0.25, 0.4], n: 2 }, { k: 'bulkhead', at: [0.8, 0.55], w: 3.0, d: 2.4, h: 2.6 }] },
    notes: 'Three-storey buff-brick loft (1900): two floors of paired steel casements over the ground floor, dark-brick string ' +
      'courses and stepped brick caps. Shops on 125th St: Starbucks (corner), AT&T, Juici Patties (red tile piers). Lenox ' +
      'face: 304 Mini Mart, a deli, Starbucks corner door. Roof billboard (invented brand only) still to add.',
  },
  // ================================================================== 290 Lenox (SE corner), u westward
  {
    id: 'lenox-290', addr: '290 Lenox Ave', name: 'CityMD, Golden Ice Jewelry', bin: '1053487',
    at: [2183.65, -2698.99], comp: '4_-6:341', h: 14.8, status: 'measured',
    wall: { mat: 'brick_red', tint: '#8d5f4a', dirt: 0.4, bond: 'running' },   // w2r1a calib: real #643d34, twin #62362e (twin redder)
    faces: [
      {
        edge: 'front',
        // MEASURED (2026-08, shots/ar34/bid4/elev/lenox-290.jpg), u from the east end: five window columns (centres 3.45, 7.65, 11.85, 16.1, 20.35;
        // 3.0 m wide, 4.2 m pitch), second-floor sills 5.6 m under stone hoods with a cartouche (8.55-9.5 m), third-floor windows 9.7-14.0 m with segmental heads, cream stone caps on the
        // white-tile piers at 5.0-5.9 m, white glazed tile to 5.2 m: a bus shelter and shop (u 0-4.6), CityMD (5.7-13.4), Golden Ice Jewelry (14.5-19.9), two small units to the corner.
        base: {
          h: 5.2,
          bays: [
            { kind: 'window', u0: 0.5, u1: 4.7, h: 3.6, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 3, frame: 'alu_black' }, interior: 'shop_food', gate: { kind: 'none' } },
            shop(5.8, 9.1, { name: 'CityMD', kind: 'window', h: 3.7, glazing: { bulkhead: 0.85, transom: 0.0, mullions: 1, frame: 'alu_clear', kick: { mat: 'brick_white_glazed', tint: TILE } }, interior: 'pharmacy', gate: { kind: 'none' } }),
            shop(10.1, 13.4, { name: 'CityMD', h: 3.8, glazing: { bulkhead: 0.15, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.05, kind: 'double', recess: 0.6 }, interior: 'pharmacy', gate: { kind: 'none' } }),
            shop(14.5, 18.1, { name: 'Golden Ice Jewelry', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.3 }, door: null, interior: 'empty', gate: { kind: 'rolldown', color: '#9a9d9f', down: 1 } }),
            shop(18.8, 19.9, { h: 3.6, door: null, interior: 'empty', gate: { kind: 'rolldown', color: '#9a9d9f', down: 1 } }),
            shop(20.4, 21.7, { h: 3.6, door: null, interior: 'empty', glazing: { bulkhead: 0.45, transom: 0.3 }, gate: { kind: 'none' } }),
            shop(22.4, 23.5, { h: 3.6, door: null, interior: 'empty', glazing: { bulkhead: 0.45, transom: 0.3 }, gate: { kind: 'none' } }),
          ],
        },
        items: [
          ...[1.1, 5.35, 9.7, 14.0, 23.2].map((u) => ({ k: 'vent', u: u - 0.65, y: 5.0, w: 1.3, h: 0.85, mat: 'stone_lime', tint: LIME })),
          { k: 'sign', sign: { kind: 'channel', text: 'CITYMD', font: 'Montserrat-800', fg: '#c83a3a', bg: null, u0: 9.8, u1: 13.8, y: 4.1, h: 0.75, depth: 0.09, lit: 'face', logo: 'bid4:citymd', logoAt: 'left' } },
          { k: 'sign', sign: fascia(14.6, 19.9, 3.75, 1.25, 'GOLDEN ICE JEWELRY', { font: 'Cinzel-700', bg: '#3b2c24', fg: '#e3b84a', stroke: '#b31f24' }) },
        ],
        rustication: { to: 'base', mat: 'brick_white_glazed', tint: TILE, joint: 0.6, block: 0.9, chamfer: 0.004 },
        bays: { widths: [1.35, 4.2, 4.2, 4.2, 4.3, 4.2, 2.15] },
        floors: [{ n: 1, h: 4.1, win: 'A', bays: [1, 2, 3, 4, 5] }, { n: 1, h: 5.4, win: 'B', bays: [1, 2, 3, 4, 5] }],
        windows: {
          // b3r1: 2nd-floor frames two lights across and three high, the 3rd floor's two across and four high under a flat segmental head,
          // clear dark glass (the sheers read as pale folds): lights '3/3' -> '2/4' / '4/4', rise 0.85 -> 0.35, sheer 0 (both faces)
          A: win(3.0, 2.8, 0.4, { frame: 'alu_black', reveal: 0.3, lights: '2/4', sheer: 0,
            lintel: { kind: 'hood', mat: 'stone_lime', tint: LIME, h: 0.5, ext: 0.28 }, sillStone: { mat: 'stone_lime', tint: LIME, h: 0.18, proj: 0.1 }, ac: 0, blinds: 0.4 }),
          B: win(3.0, 4.3, 0.4, { kind: 'arch', rise: 0.35, frame: 'alu_black', reveal: 0.3, lights: '4/4', sheer: 0,
            lintel: { kind: 'keystone', mat: 'stone_lime', tint: LIME, h: 0.3, proj: 0.05 }, sillStone: { mat: 'stone_lime', tint: LIME, h: 0.18, proj: 0.1 }, ac: 0, blinds: 0.1 }),
        },
        bands: [
          { at: 'base', h: 0.42, proj: 0.12, mat: 'stone_lime', tint: LIME },
          { at: 'floor:3', h: 0.35, proj: 0.08, mat: 'stone_lime', tint: LIME },
        ],
        cornice: { kind: 'bracketed', h: 1.7, proj: 0.95, mat: 'stone_lime', tint: LIME, brackets: 14 },
      },
      {
        edge: 'corner',
        base: {
          h: 5.2,
          bays: [
            shop(0.9, 4.2, { name: 'Golden Ice Jewelry', h: 3.3, glazing: { bulkhead: 0.3, transom: 0.3 }, door: null, interior: 'empty', gate: { kind: 'rolldown', color: '#9a9d9f', down: 1 } }),
            shop(5.0, 8.6, { h: 3.6, door: null, interior: 'empty', glazing: { bulkhead: 0.85, transom: 0.3 }, gate: { kind: 'none' } }),
            shop(9.4, 13.0, { h: 3.6, door: null, interior: 'empty', glazing: { bulkhead: 0.85, transom: 0.3 }, gate: { kind: 'none' } }),
            shop(13.8, 17.4, { h: 3.6, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.7 }, interior: 'empty', glazing: { bulkhead: 0.85, transom: 0.3 }, gate: { kind: 'none' } }),
            shop(18.2, 21.8, { h: 3.6, door: null, interior: 'empty', glazing: { bulkhead: 0.85, transom: 0.3 }, gate: { kind: 'none' } }),
            shop(22.6, 26.2, { h: 3.3, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.7 }, interior: 'shop_food', gate: { kind: 'rolldown', color: '#9a9d9f', down: 1 } }),
          ],
        },
        rustication: { to: 'base', mat: 'brick_white_glazed', tint: TILE, joint: 0.6, block: 0.9, chamfer: 0.004 },
        bays: { n: 6, margin: [0.9, 1.4] },
        floors: [{ n: 1, h: 4.1, win: 'A' }, { n: 1, h: 5.4, win: 'B' }],
        windows: {
          A: win(3.0, 2.8, 0.4, { frame: 'alu_black', reveal: 0.3, lights: '2/4', sheer: 0, lintel: { kind: 'hood', mat: 'stone_lime', tint: LIME, h: 0.5, ext: 0.28 }, sillStone: { mat: 'stone_lime', tint: LIME, h: 0.18, proj: 0.1 } }),
          B: win(3.0, 4.3, 0.4, { kind: 'arch', rise: 0.35, frame: 'alu_black', reveal: 0.3, lights: '4/4', sheer: 0, lintel: { kind: 'keystone', mat: 'stone_lime', tint: LIME, h: 0.3, proj: 0.05 }, sillStone: { mat: 'stone_lime', tint: LIME, h: 0.18, proj: 0.1 } }),
        },
        bands: [
          { at: 'base', h: 0.42, proj: 0.12, mat: 'stone_lime', tint: LIME },
          { at: 'floor:3', h: 0.35, proj: 0.08, mat: 'stone_lime', tint: LIME },
          { at: 'floor:4', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: LIME },
        ],
        cornice: { kind: 'bracketed', h: 1.9, proj: 0.95, mat: 'stone_lime', tint: LIME, brackets: 16 },
      },
      {
        edge: 5,
        base: { h: 5.2, bays: [{ kind: 'entrance', u0: 0.35, u1: 2.15, door: { kind: 'glass', w: 1.0, recess: 0.5, transom: 0.7 } }] },
        rustication: { to: 'base', mat: 'brick_white_glazed', tint: TILE, joint: 0.6, block: 0.9, chamfer: 0.004 },
        bays: { n: 1, margin: [0.3, 0.3] },
        floors: [{ n: 1, h: 4.1, win: 'A' }, { n: 1, h: 5.4, win: 'A' }],
        windows: { A: win(1.3, 2.4, 0.5, { frame: 'alu_black', reveal: 0.3, lights: '2/2', lintel: { kind: 'hood', mat: 'stone_lime', tint: LIME, h: 0.4, ext: 0.22 } }) },
        bands: [{ at: 'base', h: 0.42, proj: 0.12, mat: 'stone_lime', tint: LIME }],
        cornice: { kind: 'bracketed', h: 1.7, proj: 0.95, mat: 'stone_lime', tint: LIME, brackets: 3 },
      },
    ],
    roof: { kind: 'flat', parapet: { h: 1.2, coping: 'stone_lime' }, membrane: 'white',
      items: [{ k: 'hvac', at: [0.3, 0.35], n: 3 }, { k: 'bulkhead', at: [0.75, 0.6], w: 3.2, d: 2.6, h: 2.6 }] },
    notes: 'Beaux-Arts corner block (1910): two floors over a 5.5 m white glazed-tile base, five bays of 4.4 m, hooded rectangular windows on the 2nd ' +
      'floor, round-headed windows on the 3rd under a 1.9 m bracketed limestone cornice. Arches: custom pass bid4:arches (archivolt, keystone, frame head). ' +
      'Shops: CityMD, Golden Ice Jewelry (corner), vacant stores with lease signs.',
  },
];

export default [...LENOX, ...NORTH, ...SOUTH];
