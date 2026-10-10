// AR33 BID4 specs, south side of 125th Street from 72 W to 2018 Fifth Avenue, u WESTWARD (from each building's east end).
// Owner: the BID4 worker (docs/notes/ar33-bid4.md). References:
import { shop, fascia, win, widths, cols, refit } from './bid4_help.js';

// AR34 w2r1 tinted the dark 'wood_painted' trims (tints under ~#4a4a4a) warm (x 1.30, 0.68, 0.49 in linear light) because they rendered navy in shade (44 W's cornice
// real #261c18, twin #1e2831, w2r1b). Batch 2 (2026-10-02) divided it back out after LOOK's shade fix (CS34): the tints below are the untinted ones again.
// the cream stone of hoods, sills and bands on the red-brick tenements
const CREAM = '#c2c3b6';

export default [
  // ------------------------------------------------------------------ 72 W 125th: Chipotle, Armed Forces Career Center (2000)
  // MEASURED: one storey of storefronts to 4.2 m under a red-brown brick wall that rises to 7.1 m; Chipotle's red plate (u 5.5-9.4, y 5.3-6.1) and the
  // Armed Forces Career Center letters (u 11.6-16.2, y 4.7-5.9) sit on the brick band; narrow door at the west end of the first unit, glass units east of it.
  {
    id: 'w125-72', addr: '72 W 125th St', name: 'Chipotle, Armed Forces Career Center', bin: '1053485',
    at: [2203.9, -2690.8], comp: '4_-6:486', h: 7.1, status: 'measured',
    wall: { mat: 'brick_red', tint: '#593529', dirt: 0.4, bond: 'running' },   // w2r1b: wall over the shops real #322321, twin #5d2d2c (tint x ratio^0.6)
    faces: [{
      edge: 'front',
      base: {
        h: 4.2,
        piers: { at: [0.3, { u: 4.15, mat: 'brick_red', tint: '#593529' }, { u: 9.65, mat: 'plain', tint: '#2e2b27' }, { u: 12.4, mat: 'brick_red', tint: '#593529' }, 15.6], w: 0.5, mat: 'stone_lime', tint: '#cfc6b0', proj: 0.05 },
        bays: [
          { kind: 'entrance', u0: 0.6, u1: 2.1, door: { kind: 'solid', w: 0.9, recess: 0.3, tint: '#3c3e40' } },
          shop(2.5, 4.0, { name: 'unit', kind: 'window', h: 3.3, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 1, frame: 'alu_black' }, interior: 'empty', gate: { kind: 'none' } }),
          shop(4.4, 9.4, { name: 'Chipotle', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.3 }, interior: 'restaurant', gate: { kind: 'none' } }),
          shop(9.9, 12.2, { name: 'Armed Forces Career Center', kind: 'window', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_black' }, interior: 'shop_phone', gate: { kind: 'none' } }),
          shop(12.6, 15.4, { name: 'Armed Forces Career Center', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'shop_phone', gate: { kind: 'none' } }),
        ],
        fascia: { h: 2.9, mat: 'brick_red', tint: '#593529', proj: 0.0 },
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', text: 'CHIPOTLE', font: 'Montserrat-800', fg: '#ffffff', bg: '#b81d24', u0: 5.5, u1: 9.4, y: 5.25, h: 0.85, depth: 0.1, logo: 'bid4:chipotle', logoAt: 'left' } },
        { k: 'sign', sign: { kind: 'channel', lines: ['Armed Forces', 'Career Center'], font: 'Barlow-700', fg: '#c9252c', bg: null, u0: 11.7, u1: 16.2, y: 4.75, h: 1.15, depth: 0.05, lit: 'face' } },
      ],
      floors: [],
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'stone_lime' }, membrane: 'white', items: [{ k: 'hvac', at: [0.4, 0.5], n: 2 }] },
    notes: 'Strip_S6 (2026-08): storefronts to 4.2 m under a brick wall to 7.1 m (compiled 5.18), Chipotle plate and the Armed Forces sign on the brick band, glass units, doors at both ends. The compiled lot starts about 0.5 m west of the real brick wall.',
  },
  // ------------------------------------------------------------------ 70 W 125th: Golden Krust (brown brick, three storeys)
  // MEASURED (strip_S6): three window columns a floor (u 1.2-2.4, 2.9-4.1, 4.8-6.0), 2nd-floor glass 5.5-7.1 m, 3rd-floor glass 8.3-10.0 m, a dark cast cornice 11.4-12.5 m with a centre pediment,
  // Golden Krust's white sign (3.9-4.8 m) over the shop.
  {
    id: 'w125-70', addr: '70 W 125th St', name: 'Golden Krust Caribbean Restaurant', bin: '1053484',
    at: [2213.37, -2684.24], comp: '4_-6:317', h: 12.5, status: 'measured',
    wall: { mat: 'brick_brown', tint: '#796053', dirt: 0.5, bond: 'running' },   // w2r1a calib: real #493e3b, twin #483932 (twin oranger)
    faces: [{
      edge: 'front',
      base: {
        h: 4.9,
        bays: [shop(0.5, 5.9, { name: 'Golden Krust', h: 3.7, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.8, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
          sign: { kind: 'panel', text: 'Golden Krust', font: 'Yellowtail', fg: '#c4161c', bg: '#f4f0e6', u0: 0.3, u1: 6.0, y: 3.9, h: 0.95, depth: 0.1, sub: { text: 'CARIBBEAN RESTAURANT', font: 'Inter-700', fg: '#20408c', size: 0.22 } } })],
      },
      bays: { n: 3, margin: [0.6, 0.6] },
      floors: [
        { n: 1, h: 3.0, win: 'A', open: cols([1.8, 3.5, 5.4], 1.15, 'A', 0.6, 1.6) },
        { n: 1, h: 3.2, win: 'A', open: cols([1.8, 3.5, 5.4], 1.15, 'A', 0.4, 1.7) },
      ],
      windows: { A: win(1.15, 1.7, 0.5, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'flat', mat: 'brownstone', tint: '#8a6654', h: 0.26, ext: 0.1 }, sillStone: { mat: 'brownstone', tint: '#8a6654', h: 0.12, proj: 0.06 }, ac: 0.3, blinds: 0.6 }) },
      bands: [{ at: 'floor:2', h: 0.3, proj: 0.1, mat: 'brownstone', tint: '#8a6654' }, { at: 11.57, h: 0.45, kind: 'pressed', proj: 0.05, mat: 'wood_painted', tint: '#3a2f2b' }],
      cornice: { kind: 'bracketed', h: 1.4, proj: 0.55, mat: 'wood_painted', tint: '#3a2f2b', brackets: 6 },
      // the triangular pediment over the middle of the cornice
      parapet: { kind: 'gable', u0: 1.7, u1: 4.7, rise: 0.8, coping: 'wood_painted', copingTint: '#42261c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Three-storey brown brick building (strip_S6): three windows a floor (compiled spec had two), 12.5 m to the top of a dark cast cornice (compiled 10.14), Golden Krust sign 3.9-4.8 m.',
  },
  // ------------------------------------------------------------------ 68 W 125th: Diamond Braces
  // MEASURED (strip_S6): a white-and-grey panel wall to 6.8 m (blue DIAMOND BRACES lettering at 5.4-6.8 m) over a blue band (4.6-5.4 m) and a glass shop front with two big posters; the door at the west end.
  {
    id: 'w125-68', addr: '68 W 125th St', name: 'Diamond Braces', bin: '1053483',
    at: [2218.5, -2679.73], comp: '4_-6:269', h: 6.8, status: 'measured',
    wall: { mat: 'panel_alu', tint: '#e2e4e5', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.6,
        fascia: { h: 2.2, mat: 'panel_alu', tint: '#e2e4e5', proj: 0.05 },
        bays: [shop(0.3, 6.8, { name: 'Diamond Braces', h: 4.2, glazing: { bulkhead: 0.15, transom: 0.0, mullions: 3, frame: 'alu_clear' }, door: { u: 0.82, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'pharmacy', gate: { kind: 'none' },
          sign: { kind: 'panel', text: 'DIAMOND BRACES', font: 'Montserrat-700', fg: '#1c3f9c', bg: '#f1f3f4', u0: 0.5, u1: 6.7, y: 5.35, h: 1.2, depth: 0.06, sub: { text: 'ORTHODONTIC AND PEDIATRIC DENTISTRY', font: 'Inter-700', fg: '#1c3f9c', size: 0.18 } } })],
      },
      bands: [{ at: 4.6, h: 0.75, proj: 0.04, mat: 'panel_alu', tint: '#1c3f9c' }],
      floors: [],
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'white', items: [{ k: 'antenna', at: [0.5, 0.5], h: 3 }] },
    notes: 'One-storey dental clinic (strip_S6): white panel wall with blue lettering to 6.8 m (compiled 5.71) over a blue band and a glass front with posters.',
  },
  // ------------------------------------------------------------------ 64 W 125th: vacant unit and the hot chicken shop (black, 7.0 m)
  // MEASURED (strip_S6): a black granite front 7.0 m high (compiled 4.7): the west unit (u 0.5-5.6) behind a grey roll-down gate under an orange realty sign (u 0.7-5.5, y 4.4-5.9), the hot chicken
  // shop (u 6.5-15.2) under one black box sign 3.05 m tall (flame mark, yellow and red lettering; the first word is hidden by a tree).
  {
    id: 'w125-64', addr: '64 W 125th St', name: 'retail for lease, hot chicken shop', bin: '1053482',
    at: [2228.46, -2674.22], comp: '4_-6:368', h: 7.0, status: 'measured',
    wall: { mat: 'granite_black', tint: '#26282c', dirt: 0.25 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.9,
        fascia: { h: 3.1, mat: 'granite_black', tint: '#26282c', proj: 0.04 },
        bays: [
          shop(0.5, 5.6, { name: 'vacant', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0 }, door: null, interior: 'empty', gate: { kind: 'rolldown', color: '#7f8386', down: 1, graffiti: { density: 0.9, style: 'throwups', seed: 7 } } }),   // batch 2: the 2026-08 gate is covered edge to edge in layered throw-ups and tags (0.35 drew two clean bubble pieces)
          shop(6.5, 15.2, { name: 'hot chicken', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.45, w: 1.0, kind: 'glass', recess: 0.8 }, interior: 'restaurant', gate: { kind: 'none' } }),
        ],
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', text: 'RETAIL FOR LEASE', font: 'Barlow-700', fg: '#ffffff', bg: '#e8752a', u0: 0.7, u1: 5.5, y: 4.4, h: 1.5, depth: 0.04 } },
        { k: 'sign', sign: { kind: 'lightbox', lines: ['HOT CHICKEN'], font: 'Anton', fg: '#d9272c', bg: '#15161a', stroke: '#f0a52a', u0: 6.5, u1: 15.2, y: 3.95, h: 3.0, depth: 0.2 } },
      ],
      floors: [],
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'granite_grey' }, membrane: 'white', items: [{ k: 'hvac', at: [0.5, 0.5], n: 2 }] },
    notes: 'Black granite front to 7.0 m (strip_S6; compiled 4.71): grey graffiti-marked roll-down gate under the orange realty sign, the hot chicken shop under a 3 m black box sign. Sign text: first word hidden by a tree.',
  },
  // ------------------------------------------------------------------ 56 W 125th: condominium tower (2019), 17 floors
  // MEASURED (2026-08, shots/ar34/bid4/elev/w125-56.jpg): modules of 2.53 m (a 1.25 m casement, a 0.5 m light-grey panel on its right,
  // dark rain-screen frames between), floors of 3.0 m from 7.4 m up (a short first row at 5.6-7.2 m), an orange-copper fascia over the shops at 4.1-5.1 m, the east wing (u > 22) in
  // white and grey panels with orange strips from about 16.5 m. Shops: lobby (60 West 125), Brasserie Steak House, Steak House, Teriyaki One, Buffalo Wild Wings GO, Just Salad.
  {
    id: 'w125-56', addr: '56 W 125th St', name: 'The 56 West 125th Street Condominium', bin: '1053478',
    at: [2251.97, -2661.22], comp: '4_-6:279', h: 54.1, status: 'measured',
    wall: { mat: 'concrete_board', tint: '#b4b8ba', dirt: 0.3 },   // the sides and the rear: light grey panels
    custom: { fn: 'bid4:w56', with: 'kit' },
    faces: [{
      edge: 'front',
      wall: { mat: 'concrete_board', tint: '#5c595a', dirt: 0.2 },   // w2r1a calib: real #3c434c, twin #464b52 (twin lighter, less blue)
      base: {
        h: 4.1,
        fascia: { h: 1.0, mat: 'panel_alu', tint: '#c9792c', proj: 0.16 },
        piers: { at: [0.3, 9.9, 17.2, 22.7, 28.1, 31.4, 37.7], w: 0.7, mat: 'concrete_board', tint: '#4b4d50', proj: 0.08 },
        bays: [
          { kind: 'store', u0: 0.9, u1: 9.5, name: '60 West 125 lobby', h: 3.9, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.6, w: 1.1, kind: 'double', recess: 1.1 }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 10.4, u1: 17.0, name: 'Brasserie Steak House', h: 3.9, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.8 }, interior: 'restaurant', gate: { kind: 'none' } },
          { kind: 'store', u0: 17.5, u1: 22.4, name: 'Steak House', h: 3.9, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.4, w: 1.0, kind: 'double', recess: 0.8 }, interior: 'restaurant', gate: { kind: 'none' } },
          { kind: 'store', u0: 22.9, u1: 27.8, name: 'Teriyaki One', h: 3.9, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.65, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' } },
          { kind: 'store', u0: 28.3, u1: 31.1, name: 'Buffalo Wild Wings GO', h: 3.9, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.6 }, interior: 'restaurant', gate: { kind: 'none' } },
          { kind: 'store', u0: 31.8, u1: 37.3, name: 'Just Salad', h: 3.9, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.6 }, interior: 'restaurant', gate: { kind: 'none' } },
        ],
      },
      // the shop signs sit on the orange fascia and the dark bays under it
      items: [
        { k: 'sign', sign: { kind: 'channel', text: '60 WEST 125', font: 'Montserrat-700', fg: '#e9e8e4', bg: null, u0: 0.6, u1: 6.3, y: 4.3, h: 0.6, depth: 0.07, lit: 'none' } },
        { k: 'sign', sign: { kind: 'panel', lines: ['BRASSERIE', 'STEAK HOUSE'], font: 'Montserrat-700', fg: '#e3c682', bg: '#14130f', u0: 10.4, u1: 15.0, y: 3.55, h: 1.15, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', text: 'STEAK HOUSE', font: 'Montserrat-700', fg: '#e3c682', bg: '#14130f', u0: 17.8, u1: 22.4, y: 3.7, h: 0.85, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['TERIYAKI ONE', 'CHICKEN COMBO'], font: 'Archivo-900', fg: '#ffffff', bg: '#d4232a', u0: 22.9, u1: 27.6, y: 3.45, h: 1.0, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['BUFFALO', 'WILD WINGS GO'], font: 'Archivo-900', fg: '#ffffff', bg: '#151514', u0: 28.2, u1: 31.1, y: 3.55, h: 1.0, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'channel', text: 'just salad', font: 'Poppins-700', fg: '#ffffff', bg: null, u0: 32.0, u1: 36.8, y: 4.3, h: 0.65, depth: 0.07, lit: 'face' } },
      ],
      bays: { widths: [...Array(14).fill(2.53), 2.58] },
      floors: [{ n: 1, h: 2.3, win: 'P0' }, { n: 15, h: 3.0, win: 'P' }],
      windows: {
        P0: { w: 1.25, h: 1.6, sill: 0.25, du: -0.3, kind: 'casement', lights: '1/1', frame: 'alu_black', reveal: 0.18, surround: { mat: 'concrete_board', tint: '#2d2f31', w: 0.17, proj: 0.09 }, lintel: null, sillStone: null, ac: 0, blinds: 0.85, lit: 0.3 },
        P: { w: 1.25, h: 2.0, sill: 0.5, du: -0.3, kind: 'casement', lights: '1/1', frame: 'alu_black', reveal: 0.18, surround: { mat: 'concrete_board', tint: '#2d2f31', w: 0.17, proj: 0.09 }, lintel: null, sillStone: null, ac: 0, blinds: 0.85, lit: 0.35 },
      },
      bands: [],
      cornice: { kind: 'band', h: 0.6, proj: 0.25, mat: 'concrete_board', tint: '#3a3c3e' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.0, coping: 'panel_grey' }, membrane: 'gravel',
      items: [{ k: 'bulkhead', at: [0.4, 0.5], w: 9, d: 6, h: 4 }, { k: 'hvac', at: [0.75, 0.5], n: 3 }, { k: 'antenna', at: [0.9, 0.3], h: 5 }] },
    notes: '17 storeys (2019). Elevation 2026-08: charcoal rain-screen modules of 2.53 m with a casement and a light-grey panel each, an orange fascia over six shops, a white and grey ' +
      'east wing with orange strips (bid4:w56). Wall material concrete_board (matte): panel_grey is glossy and mirrors the sky navy at grazing angles. The tower steps back at the top (not modelled).',
  },
  // ------------------------------------------------------------------ 52 W 125th (cream, black surrounds)
  // MEASURED: lot refitted to its real street wall (u 1.3-6.2 from the compiled east end); four storeys to a dark frieze and cornice at 14.0-15.3 m; two windows
  // a floor (glass 0.4-1.4 and 2.4-3.3 from the east edge, black cast-iron-look surrounds 0.3 m wide), the 2nd floor a wide shop window with a For Sale banner (4.9-6.9 m), the blue AMERICAN SALADS & DELI awning.
  {
    id: 'w125-52', addr: '52 W 125th St', name: 'American Salads & Deli', bin: '1053476',
    at: [2273.51, -2655.8], comp: '4_-6:234', h: 15.3, status: 'measured',
    ring: refit('w125-52', 1.3, 6.2),
    wall: { mat: 'brick_painted', tint: '#ddd5c2', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.8,
        bays: [shop(0.3, 4.5, { name: 'American Salads & Deli', h: 3.4, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.6, w: 0.95, kind: 'glass', recess: 0.4 }, interior: 'shop_food', gate: { kind: 'none' },
          awning: { kind: 'fixed', color: '#1d57c8', proj: 0.9, drop: 0.6 },
          sign: { kind: 'panel', lines: ['AMERICAN', 'SALADS & DELI'], font: 'Archivo-900', fg: '#ffffff', bg: '#1d57c8', u0: 0.0, u1: 4.9, y: 3.7, h: 0.9, depth: 0.15 } })],
      },
      bays: { n: 2, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 2.6, win: 'S2', open: [[0.5, 4.3, 'S2']] },
        { n: 1, h: 3.1, win: 'A', open: cols([0.9, 2.85], 0.95, 'A', 0.1, 2.1) },
        { n: 1, h: 3.1, win: 'A', open: cols([0.9, 2.85], 0.95, 'A', 0.1, 2.1) },
      ],
      windows: {
        S2: { sill: 0.2, h: 1.7, kind: 'fixed', mullions: 2, frame: 'alu_black', reveal: 0.2, lintel: null, sillStone: null, blinds: 0.3, lit: 0.5, ac: 0 },
        A: win(0.95, 2.1, 0.1, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'hood', mat: 'wood_painted', tint: '#2c252b', h: 0.34, ext: 0.1 }, sillStone: { mat: 'wood_painted', tint: '#2c252b', h: 0.12, proj: 0.08 },
          surround: { mat: 'wood_painted', tint: '#2e262c', w: 0.25, proj: 0.07 }, ac: 0.35, blinds: 0.55 }),   // the twin's read navy-grey (36,38,41) / (45,54,62)
      },
      bands: [{ at: 14.0, h: 1.3, proj: 0.2, mat: 'wood_painted', tint: '#3a2a27' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.3, mat: 'wood_painted', tint: '#3a2a27' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Cream-painted brick, black window surrounds, wide 2nd-floor shop window, dark frieze at 14.0-15.3 m (compiled 12.83). The compiled lot is 1.3 m east of the real wall (refit).',
  },
  // ------------------------------------------------------------------ 50 W 125th (cream, green surrounds)
  // MEASURED: refit u 0.9-6.0; two windows a floor with dark-green surrounds (glass 0.9-1.9 and 3.0-4.0 from the east edge, 2.2 m glass, 3rd floor sill 7.2, 4th 10.4), 2nd-floor window ribbon 5.1-6.6 m
  // (xBandz sign), top frieze and cornice 14.1-15.4 m, Steak House II sign (grey, red letters) over the shop.
  {
    id: 'w125-50', addr: '50 W 125th St', name: 'Steak House II, xBandz', bin: '1053492',
    at: [2275.49, -2649.56], comp: '4_-6:429', h: 15.4, status: 'measured',
    ring: refit('w125-50', 0.9, 6.0),
    wall: { mat: 'brick_painted', tint: '#e0dccd', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.9,
        bays: [shop(0.3, 4.8, { name: 'Steak House II', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
          // b3r1: the name in big red letters across a black fascia, the B.B.Q / seafood line small (the twin's two equal lines read small on grey)
          sign: { kind: 'panel', text: 'STEAK HOUSE II', font: 'Anton', fg: '#e0262b', bg: '#1b1b1d', u0: 0.0, u1: 5.1, y: 3.7, h: 1.2, depth: 0.12,
            sub: { text: 'B.B.Q & GRILL   SEAFOOD', size: 0.2, font: 'Anton', fg: '#f2f2f2' } } })],
      },
      bays: { n: 2, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 2.5, win: 'S2', open: [[0.4, 4.7, 'S2']] },
        { n: 1, h: 3.1, win: 'A', open: cols([1.4, 3.5], 1.0, 'A', 0.0, 2.2) },
        { n: 1, h: 3.1, win: 'A', open: cols([1.4, 3.5], 1.0, 'A', 0.2, 2.3) },
      ],
      windows: {
        S2: { sill: 0.3, h: 1.6, kind: 'fixed', mullions: 3, frame: 'alu_black', reveal: 0.15, lintel: null, sillStone: null, blinds: 0.2, lit: 0.6, ac: 0 },
        A: win(1.0, 2.2, 0.1, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'hood', mat: 'wood_painted', tint: '#4b5a4c', h: 0.36, ext: 0.1 }, sillStone: { mat: 'wood_painted', tint: '#4b5a4c', h: 0.12, proj: 0.08 },
          surround: { mat: 'wood_painted', tint: '#4b5a4c', w: 0.25, proj: 0.07 }, ac: 0.1, blinds: 0.7 }),
      },
      bands: [{ at: 14.1, h: 1.3, proj: 0.2, mat: 'wood_painted', tint: '#3a2a27' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.3, mat: 'wood_painted', tint: '#3a2a27' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Cream-painted brick with dark-green window surrounds, xBandz and Steak House II signs. 15.4 m to the top of the cornice (compiled 12.82). ' +
      'Batch 2: the surrounds\' green measured (55,63,61), b2r1 twin (26,49,43) with the untinted #2f4c3c; now #4b5a4c (x ratio^0.7).',
  },
  // ------------------------------------------------------------------ 48 W 125th (brown, Posh salon)
  // MEASURED: refit u 0.8-5.6; two windows a floor (glass 0.9-1.9 and 3.2-4.2 from the east edge; 3rd-floor sill 7.6, 4th 10.8), 2nd-floor window ribbon 5.0-6.6 m with the Envy Nails sign, the 48W blade,
  // Posh Exclusive Salon below a black awning; top cornice at 14.5-15.0 m.
  {
    id: 'w125-48', addr: '48 W 125th St', name: 'Envy Nails, Posh Exclusive Salon', bin: '1053475',
    at: [2279.36, -2646.94], comp: '4_-6:9', h: 15.0, status: 'measured',
    ring: refit('w125-48', 0.8, 5.6),
    wall: { mat: 'brick_brown', tint: '#746655', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.9,
        bays: [shop(0.3, 4.4, { name: 'Posh Exclusive Salon', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'shop_clothing', gate: { kind: 'rolldown', color: '#8f9193', down: 0.5 },
          awning: { kind: 'fixed', color: '#1c1a1c', proj: 0.9, drop: 0.5 } })],
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', text: '48W', font: 'Montserrat-800', fg: '#ffffff', bg: '#26262a', u0: 0.1, u1: 1.9, y: 4.0, h: 0.9, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', text: 'Envy Nails', font: 'GreatVibes', fg: '#e6e0d4', bg: '#1b1a1a', u0: 1.7, u1: 5.1, y: 5.5, h: 1.0, depth: 0.1 } },
      ],
      bays: { n: 2, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 2.6, win: 'S2', open: [[0.4, 4.4, 'S2']] },
        { n: 1, h: 3.1, win: 'A', open: cols([1.4, 3.7], 1.0, 'A', 0.3, 2.0) },
        { n: 1, h: 3.1, win: 'A', open: cols([1.4, 3.7], 1.0, 'A', 0.2, 2.1) },
      ],
      windows: {
        S2: { sill: 0.15, h: 1.5, kind: 'fixed', mullions: 3, frame: 'alu_black', reveal: 0.15, lintel: null, sillStone: null, blinds: 0.2, lit: 0.6, ac: 0 },
        A: win(1.0, 2.0, 0.1, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'hood', mat: 'brownstone', tint: '#8c6652', h: 0.4, ext: 0.1 }, sillStone: { mat: 'brownstone', tint: '#8c6652', h: 0.12, proj: 0.07 }, ac: 0.1, blinds: 0.6 }),
      },
      bands: [{ at: 14.3, h: 0.7, proj: 0.18, mat: 'brownstone', tint: '#8c6652' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.25, mat: 'brownstone', tint: '#8c6652' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Brown brick with brownstone hoods, Envy Nails (second-floor ribbon) and Posh Exclusive Salon (strip rowS1); 15.0 m (compiled 12.91).',
  },
  // ------------------------------------------------------------------ 46 W 125th (brown, canted oriel, Watkins Healthy Foods)
  // MEASURED: refit u 0.7-5.5; a canted three-window oriel on the 3rd and 4th floors (3rd-floor glass 7.4-9.8, 4th 10.8-13.0 m), three small 2nd-floor windows (5.3-6.6 m), brick spandrel
  // band under them, the green WATKINS awning and sign; cornice at 15.2 m.
  {
    id: 'w125-46', addr: '46 W 125th St', name: 'Watkins Healthy Foods', bin: '1053491',
    at: [2283.46, -2644.68], comp: '4_-6:113', h: 15.2, status: 'measured',
    ring: refit('w125-46', 0.7, 5.5),
    wall: { mat: 'brick_brown', tint: '#7f6d58', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.9,
        bays: [shop(0.3, 4.4, { name: 'Watkins Healthy Foods', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.6, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'shop_food', gate: { kind: 'none' },
          awning: { kind: 'fixed', color: '#4c7a3a', proj: 0.6, drop: 0.5 }, sign: { kind: 'lightbox', text: 'WATKINS HEALTHY FOODS', font: 'Oswald-700', fg: '#ffffff', bg: '#4c7a3a', u0: 0.3, u1: 4.4, y: 3.8, h: 0.8, depth: 0.15 } })],
      },
      bays: { n: 1, margin: [0.3, 0.3] },
      floors: [
        { n: 1, h: 2.6, win: 'S2', open: cols([1.0, 2.3, 3.6], 1.0, 'S2', 0.3, 1.3) },
        { n: 1, h: 3.0, win: 'O', open: [[0.5, 4.3, 'O']] },
        { n: 1, h: 3.2, win: 'O', open: [[0.5, 4.3, 'O']] },
      ],
      windows: {
        S2: { sill: 0.3, h: 1.3, kind: 'dh', lights: '1/1', frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'flat', mat: 'brick_red', tint: '#80614f', h: 0.2 }, sillStone: { mat: 'cast_stone', tint: '#9a7058', h: 0.1, proj: 0.05 }, ac: 0.1, blinds: 0.5 },
        O: { sill: 0.3, h: 2.2, kind: 'ribbon', mullions: 2, frame: 'alu_bronze', glass: 'glass_clear', reveal: 0.12, lintel: null, sillStone: { mat: 'cast_stone', tint: '#9a7058', h: 0.1, proj: 0.06 }, ac: 0.1, blinds: 0.55, lit: 0.3 },
      },
      oriels: [{ u0: 0.3, u1: 4.5, from: 7.5, to: 14.5, depth: 0.7, kind: 'canted', win: 'O', mat: 'brick_brown', tint: '#7f6d58', cornice: { mat: 'wood_painted', tint: '#3a2a27' } }],   // w2r1a: the default cornice read as speckled white stone
      bands: [{ at: 7.4, h: 0.4, proj: 0.05, mat: 'brick_red', tint: '#80614f' }],
      cornice: { kind: 'band', h: 0.7, proj: 0.25, mat: 'wood_painted', tint: '#3a2a27' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Brown brick with a three-part canted oriel (strip rowS1); 15.2 m (compiled 12.91). The oriel here replaces the flat windows of the first pass.',
  },
  // ------------------------------------------------------------------ 44 W 125th (ornate red brick and terracotta, Lady Love, Yoga)
  // MEASURED: the pink-jambed entrance (u 0.4-1.2) under a
  // grey gate box (4.74-5.2 m) whose curtain is down to 3.3 m; Lady Love (u 1.6-5.6) under a navy box awning (3.94-5.64 m) with gold serif letters, the window filled with hats; a light-grey
  // pier with posters (5.6-6.5); the 2nd floor a pressed-metal bay (5.7-8.65 m): three windows (u 0.6-2.2, 2.36-3.94, 4.1-5.7; glass 5.84-8.4, transom bar 7.7) in dark frames and posts,
  // AC units in the outer upper lights, red cast-iron pilasters at both ends (u 0-0.6, 5.7-6.5) with capitals; a heavy bracketed cornice 8.65-9.75 m; the 3rd floor (9.75-12.25)
  // banded brick piers with carved terracotta caps (11.45-11.75) and a sill course (11.95-12.25); carved panels under the outer 4th-floor windows (12.25-12.85), windows 12.94-14.84
  // under carved arched tympana (to 15.85), the frieze with the 1898 plaque (u 2.6-4.2, 16.05-16.75) and the top cornice from 17.1 m; the blue YOGA box sign (5.5-8.15 m) at the east end.
  // Colours (shade): wall (90,66,63), banded piers (92,54,47), carved blocks (69,35,31), pilasters (103,70,63), cornice and posts (46,36,31), pink jambs (127,73,84).
  {
    id: 'w125-44', addr: '44 W 125th St', name: 'Lady Love, Yoga', bin: '1053474',
    at: [2288.35, -2641.77], comp: '4_-6:95', h: 18.3, status: 'measured',
    ring: refit('w125-44', 0.9, 7.4),
    custom: { fn: 'bid4:w44', with: 'kit' },   // the bay's posts and AC units, the cornice over the bay, the carved terracotta, the tympana, the entrance gate (custom/bid4.js)
    wall: { mat: 'brick_red', tint: '#796f68', dirt: 0.7, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 5.7,
        wall: { mat: 'brick_painted', tint: '#9e6f7e', dirt: 0.5, to: 4.74 },
        piers: { at: [{ u: 0.2, w: 0.4 }, { u: 1.38, w: 0.36 }, { u: 6.05, w: 0.9, mat: 'stucco', tint: '#c9c5bc' }], w: 0.4, mat: 'brick_painted', tint: '#9e6f7e', proj: 0.04 },
        bays: [
          { kind: 'entrance', u0: 0.4, u1: 1.2, h: 3.3, door: { kind: 'glass', w: 0.78, recess: 1.0, h: 2.5, transom: 0.4, frame: 'alu_white' },
            // the YOGA box sign: its side face as the kit's blade (letters on it), its front face (0.5 m wide, facing the street) in custom/bid4.js w44
            blade: { kind: 'blade', text: '', fg: '#ffffff', bg: '#1d55d6', logo: 'bid4:yogaV', logoAt: 'fill', u0: 0.0, w: 0.36, h: 2.65, y: 5.5, depth: 0.06 } },
          shop(1.6, 5.6, { name: 'Lady Love', h: 3.9, glazing: { bulkhead: 0.25, transom: 0.0, mullions: 2, frame: 'alu_clear' }, door: { u: 0.25, w: 0.9, kind: 'glass', recess: 0.3 }, interior: 'shop_clothing', gate: { kind: 'none' },
            awning: { kind: 'dome', color: '#575a5f', proj: 0.55, drop: 1.15, top: 5.64, text: 'Lady Love', font: 'LibreBaskerville-700', fg: '#fad59c', fill: 0.42, tracking: 0.05,
              sub: { text: '44W.', size: 0.12, font: 'LibreBaskerville-700' } } }),   // b2r2: Cinzel set it in capitals;
        ],
      },
      bays: { n: 3, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 4.05, win: 'G', open: [[0.6, 2.2, 'G'], [2.36, 3.94, 'G'], [4.1, 5.7, 'G']] },          // 5.7-9.75: the pressed-metal bay
        { n: 1, h: 2.5, win: 'A3', open: [[1.0, 1.8, 'A3'], [2.86, 3.66, 'A3'], [4.7, 5.5, 'A3']] },        // 9.75-12.25: banded brick
        { n: 1, h: 6.05, win: 'A4', open: [[1.04, 1.9, 'A4'], [2.9, 3.74, 'A4'], [4.76, 5.56, 'A4']] },     // 12.25-18.3
      ],
      windows: {
        G: { sill: 0.14, h: 2.56, kind: 'fixed', mullions: 0, transom: 0.7, frame: 'wood_painted', frameTint: '#4a3a33', frameW: 0.08, reveal: 0.1, lintel: null, sillStone: null, blinds: 0.1, sheer: 0, lit: 0.4, ac: 0 },   // b2r2: sheers read white;
        A3: win(0.8, 1.75, 0.0, { frame: 'wood_painted', frameTint: '#4a3a33', reveal: 0.18, lintel: null, sillStone: null, ac: 0, blinds: 0.5 }),
        A4: win(0.84, 1.9, 0.69, { frame: 'wood_painted', frameTint: '#4a3a33', reveal: 0.18, lintel: null, sillStone: null, ac: 0, blinds: 0.3, sheer: 0.5 }),
      },
      bands: [
        // the banded brick of the 3rd-floor piers, seven courses 0.17 m high over 0.07 m grooves (9.78-11.39 m), redder than the wall
        ...[9.78, 10.02, 10.26, 10.5, 10.74, 10.98, 11.22].flatMap((y) => [[0, 0.95], [1.85, 2.81], [3.71, 4.65], [5.55, 6.5]].map(([u0, u1]) => ({ at: y, u0, u1, h: 0.17, proj: 0.04, mat: 'brick_red', tint: '#866c62' }))),   // b2r2 '#895240' read orange;
        { at: 11.95, h: 0.3, proj: 0.1, mat: 'cast_stone', tint: '#8e7a6a' },   // the 4th floor's sill course
        { at: 16.82, h: 0.28, kind: 'pressed', proj: 0.05, mat: 'wood_painted', tint: '#4d3e30' },   // the pressed frieze under the top cornice
      ],
      items: [
        { k: 'sign', sign: { kind: 'panel', text: '1898', font: 'LibreBaskerville-700', fg: '#b07a62', bg: '#74402f', u0: 2.6, u1: 4.2, y: 16.05, h: 0.7, depth: 0.05, lit: 'none' } },
        { k: 'sign', sign: { kind: 'panel', text: '', fg: '#ffffff', bg: '#2a2422', logo: 'bid4:hats', logoAt: 'fill', u0: 3.15, u1: 5.45, y: 0.3, h: 3.3, depth: 0.02, lit: 'none', push: false }, z: -0.75 },
      ],
      // the red cast-iron pilasters at the ends of the 2nd-floor bay
      piers: { mat: 'wood_painted', tint: '#81685d', w: 0.6, proj: 0.1, at: [0.3, { u: 6.1, w: 0.8 }], from: 5.7, to: 8.65, flute: 3, capital: true, base: false },   // b2r2: metal_painted with chips read as green camouflage
      cornice: { kind: 'bracketed', h: 1.2, proj: 0.6, mat: 'wood_painted', tint: '#4d3e30', brackets: 6 },   // (46,36,31); '#3a2e29' rendered (29,26,28) in b2r1
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Ornate red brick and terracotta tenement (elev/w125-44.jpg): 18.3 m, the pressed-metal 2nd-floor bay with its cornice, banded 3rd-floor piers, carved panels and arched tympana (custom bid4:w44), the YOGA box sign, the pink entrance under a half-down gate, Lady Love\'s hats.',
  },
  // ------------------------------------------------------------------ 35 W 124th: the school building's 125th St face (Harlem Village Academies; Cohen's Fashion Optical, Cap USA, Simply Smiles Dental)
  // MEASURED: 26.0 m high (compiled 11.5), five storeys of buff brick: a 6.3 m limestone base (shops to 4.9 m under signs to 5.9-6.4 m, a belt course 6.3-7.1 m),
  // a floor of three big steel-framed windows (u 1.75-5.8, 9.5-14.8, 17.4-22.9; 7.45-14.3 m), two rows of twelve small windows in four groups of three (glass 16.1-17.9 and 20.4-22.6 m),
  // a stone-banded parapet 23.2-26.0 m with pilasters; the round-fronted HVA entrance (u 25.4-30.6) under the red crest banner.
  {
    id: 'w125-school', addr: '35 W 124th St (125th St face)', name: 'Harlem Village Academies; Cohen\'s Fashion Optical, Cap USA, Simply Smiles Dental', bin: '1053473',
    at: [2301.56, -2620.94], comp: '4_-6:383', h: 26.0, status: 'measured',
    // batch 2: the compiled ring with its west side moved 0.9 m west, onto 44 W's refit east wall: 44 W's refit (u 0.9-7.4) had opened a 0.9 m slot between the two in
    // which 44 W's side wall showed with windows (w2r1h s_w125-44);
    ring: [[2315.32, -2618.38], [2311.14, -2610.8], [2299.91, -2617.02], [2284.95, -2589.87], [2272.93, -2596.52], [2287.8, -2623.5], [2282.67, -2626.35], [2297.36, -2653.03], [2325.75, -2637.32]],
    custom: { fn: 'bid4:school', with: 'kit' },   // the three pole banners (custom/bid4.js)
    wall: { mat: 'brick_buff', tint: '#d8c6ad', dirt: 0.35, bond: 'running' },   // w2r1a calib: real #969085, twin #918d80
    faces: [{
      edge: 'front',
      rustication: { to: 6.3, mat: 'stone_lime', tint: '#d3c09a', joint: 0.7, block: 1.4, chamfer: 0.025 },
      base: {
        h: 6.3,
        piers: { at: [0.7, 8.3, 14.8, 21.7, 25.2, 31.0], w: 0.7, mat: 'stone_lime', tint: '#d6c39d', proj: 0.1, plinth: false },
        bays: [
          shop(1.3, 8.0, { name: 'Cohen\'s Fashion Optical', h: 4.9, glazing: { bulkhead: 0.5, transom: 0.5, mullions: 4, frame: 'alu_black' }, door: { u: 0.7, w: 1.0, kind: 'double', recess: 0.6 }, interior: 'shop_clothing', gate: { kind: 'none' } }),
          shop(8.7, 14.5, { name: 'Cap USA', h: 4.9, glazing: { bulkhead: 0.2, transom: 0.4, mullions: 5, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'double', recess: 0.6 }, interior: 'shop_clothing', gate: { kind: 'none' } }),
          shop(15.2, 21.4, { name: 'Simply Smiles Dental', h: 4.9, glazing: { bulkhead: 0.3, transom: 0.6, mullions: 4, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'double', recess: 0.6 }, interior: 'pharmacy', gate: { kind: 'none' } }),
          { kind: 'entrance', u0: 21.9, u1: 23.8, door: { kind: 'glass', w: 1.0, recess: 0.5, transom: 0.9, frame: 'alu_black' } },
          shop(25.6, 30.4, { name: 'Harlem Village Academies entrance', h: 4.9, glazing: { bulkhead: 0.4, transom: 0.8, mullions: 5, frame: 'alu_black' }, door: { u: 0.5, w: 1.1, kind: 'double', recess: 1.2 }, interior: 'empty', gate: { kind: 'none' } }),
        ],
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', lines: ['COHEN\'S', 'Fashion Optical'], font: 'Archivo-900', fg: '#16181a', bg: '#f2f0ea', u0: 2.7, u1: 8.1, y: 4.95, h: 0.95, depth: 0.1 } },
        { k: 'sign', sign: { kind: 'panel', text: 'CAP USA', font: 'ArchivoBlack', fg: '#ffffff', bg: '#101012', u0: 8.2, u1: 14.7, y: 5.0, h: 1.35, depth: 0.14 } },
        { k: 'sign', sign: { kind: 'panel', text: 'simply smiles dental', font: 'Poppins-700', fg: '#1d6fd6', bg: '#ffffff', u0: 14.7, u1: 21.5, y: 4.95, h: 0.75, depth: 0.1 } },
        { k: 'sign', sign: { kind: 'panel', text: '', font: 'LibreBaskerville-700', fg: '#f4efe6', bg: '#a8232c', u0: 25.7, u1: 30.3, y: 7.5, h: 6.4, depth: 0.03, push: false, logo: 'bid4:hva', logoAt: 'fill' } },   // the crest banner (custom/bid4.js hva)
      ],
      bays: { n: 12, margin: [1.5, 0.8] },
      floors: [
        { n: 1, h: 8.1, win: 'Big', open: [[1.75, 5.8, 'Big'], [9.5, 14.8, 'Big'], [17.4, 22.9, 'Big']] },
        { n: 1, h: 3.9, win: 'S1', open: cols([2.1, 4.3, 6.6, 10.05, 12.3, 14.5, 18.0, 20.2, 22.4, 25.85, 28.1, 30.3], 1.2, 'S1', 1.7, 1.8) },
        { n: 1, h: 4.4, win: 'S2', open: cols([2.1, 4.3, 6.6, 10.05, 12.3, 14.5, 18.0, 20.2, 22.4, 25.85, 28.1, 30.3], 1.2, 'S2', 2.1, 2.2) },
      ],
      windows: {
        Big: { sill: 1.15, h: 6.9, kind: 'fixed', mullions: 3, transom: 1.4, frame: 'alu_black', reveal: 0.35, lintel: null, sillStone: { mat: 'stone_lime', tint: '#d6c39d', h: 0.16, proj: 0.08 }, ac: 0, blinds: 0.4, lit: 0.3 },
        S1: { sill: 1.7, h: 1.8, kind: 'dh', lights: '1/1', frame: 'alu_black', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d6c39d', h: 0.25, ext: 0.1, proj: 0.04 }, sillStone: { mat: 'stone_lime', tint: '#d6c39d', h: 0.12, proj: 0.07 }, ac: 0, blinds: 0.6, lit: 0.3 },
        S2: { sill: 2.1, h: 2.2, kind: 'dh', lights: '1/1', frame: 'alu_black', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d6c39d', h: 0.25, ext: 0.1, proj: 0.04 }, sillStone: { mat: 'stone_lime', tint: '#d6c39d', h: 0.12, proj: 0.07 }, ac: 0, blinds: 0.6, lit: 0.3 },
      },
      bands: [
        { at: 6.3, h: 0.8, proj: 0.14, mat: 'stone_lime', tint: '#d6c39d' },
        { at: 23.0, h: 0.5, proj: 0.1, mat: 'stone_lime', tint: '#d6c39d' },
      ],
      piers: { mat: 'stone_lime', tint: '#d6c39d', w: 1.2, proj: 0.1, at: [8.25, 15.95, 24.35], from: 22.5, to: 26.0, capital: false, base: false },
      cornice: { kind: 'band', h: 0.6, proj: 0.22, mat: 'stone_lime', tint: '#d6c39d' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.5, 0.5], n: 3 }, { k: 'bulkhead', at: [0.3, 0.6], w: 4, d: 3, h: 2.8 }] },
    notes: 'Strip_S3t (2026-08): 26.0 m (compiled 11.5), a 6.3 m limestone base with four shops and the round-fronted school entrance, three large steel windows over it, two rows of small windows, a banded parapet, the red Harlem Village Academies banner. ' +
      'The pole banners (red, black, red) and the crest banner are in custom/bid4.js school since wave 2 round 1, the round-fronted glass entrance since batch 2 (2026-10-02); ' +
      'the street lamps on the corner are not modelled.',
  },
  // ------------------------------------------------------------------ 28 W 125th: red-brick tenement (European Wax Center, Makuu Trading)
  // MEASURED: five storeys, 19.6 m to the top of a beige stucco parapet (brick to 17.4 m); six windows a floor at 2.2 m pitch (glass 0.85 x 1.7,
  // centres 1.4, 3.65, 5.95, 8.1, 10.3, 12.55; glass 5.1-6.9, 8.2-10.0, 11.6-13.3, 14.8-16.5 m) in cream stone surrounds with hoods, cream bands at every floor line, two zigzag fire escapes; shops:
  // European Wax Center (u 0.7-5.9), a recessed door (6.5-8.2), Makuu Trading / Harlem General Store (8.7-13.7).
  {
    id: 'w125-28', addr: '28 W 125th St', name: 'European Wax Center, Makuu Trading / Harlem General Store', bin: '1053472',
    at: [2324.04, -2622.17], comp: '4_-6:246', h: 19.6, status: 'measured',
    // batch 2: MATS's sooted set (darker joints, redder faces); b2r10 with '#ad8d88': brick pixels (R>G+8, R-B>20, upper floors of s_w125-28) twin (146,118,104),
    // a hue-measured step ('#987d81', b2r11) read purple (its faces fell outside that filter): the b2r10 tint darkened x0.86 instead
    wall: { mat: 'brick_red_sooted', tint: '#957975', dirt: 0.5, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 4.6,
        piers: { at: [0.4, 6.3, 8.5, 13.9], w: 0.5, mat: 'wood_painted', tint: '#26282b', proj: 0.05 },
        bays: [
          shop(0.7, 5.9, { name: 'European Wax Center', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.25, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' } }),
          { kind: 'entrance', u0: 6.6, u1: 8.2, door: { kind: 'solid', w: 0.9, recess: 0.5, tint: '#2b2b2e' } },
          shop(8.8, 13.6, { name: 'Makuu Trading', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.7, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_clothing', gate: { kind: 'rolldown', color: '#8f9193', down: 0 } }),
        ],
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', lines: ['EUROPEAN', 'WAX CENTER'], font: 'Jost-700', fg: '#ffffff', bg: '#0f0f10', u0: 0.4, u1: 6.1, y: 3.5, h: 1.05, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['MAKUU TRADING', 'HARLEM GENERAL STORE'], font: 'Jost-700', fg: '#ffffff', bg: '#141416', u0: 8.7, u1: 13.8, y: 3.5, h: 1.05, depth: 0.12 } },
      ],
      bays: { n: 6, margin: [0.3, 0.3] },
      floors: [
        { n: 1, h: 3.2, win: 'A', open: cols([1.4, 3.65, 5.95, 8.1, 10.3, 12.55], 0.85, 'A', 0.5, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.4, 3.65, 5.95, 8.1, 10.3, 12.55], 0.85, 'A', 0.4, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.4, 3.65, 5.95, 8.1, 10.3, 12.55], 0.85, 'A', 0.5, 1.7) },
        { n: 1, h: 3.1, win: 'A', open: cols([1.4, 3.65, 5.95, 8.1, 10.3, 12.55], 0.85, 'A', 0.4, 1.7) },
      ],
      windows: { A: win(0.85, 1.75, 0.5, { frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'hood', mat: 'cast_stone', tint: CREAM, h: 0.4, ext: 0.28 }, sillStone: { mat: 'cast_stone', tint: CREAM, h: 0.14, proj: 0.07 },
        surround: { mat: 'cast_stone', tint: CREAM, w: 0.16, proj: 0.04 }, ac: 0.25, blinds: 0.5 }) },
      bands: [
        { at: 4.6, h: 0.3, proj: 0.06, mat: 'cast_stone', tint: CREAM },
        { at: 7.8, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
        { at: 11.1, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
        { at: 14.4, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
      ],
      fireEscape: [{ bays: [1, 2, 3, 4], floors: [1, 4], kind: 'balcony', drop: true }],
      cornice: { kind: 'band', h: 2.2, proj: 0.2, mat: 'stucco', tint: '#c3b79c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.6, 0.5], w: 3, d: 2.4, h: 2.3 }] },
    notes: 'Five-storey red-brick tenement (strip_S2b): 19.6 m with the beige stucco parapet (compiled 17.84), six windows a floor, cream hoods and bands, a zigzag fire escape, shops measured on the strip. The lot is about 0.4 m east of the compiled one.',
  },
  // ------------------------------------------------------------------ 24 W 125th: its twin (Custom EZ, 99 cent Department Store)
  // MEASURED (strip_S2b): 19.6 m; six windows a floor (centres 1.8, 4.0, 6.25, 8.45, 10.7, 13.0), same floor lines as 28 W; shops: Custom EZ (u 1.0-6.4, red sign 2.5-4.6 m), a door (6.9-8.1),
  // the 99c Department Store (8.9-13.5, red sign), a fire escape across u 3.2-11.7.
  {
    id: 'w125-24', addr: '24 W 125th St', name: 'Custom EZ, 99 cent Department Store', bin: '1053471',
    at: [2335.57, -2615.55], comp: '4_-6:167', h: 19.6, status: 'measured',
    // batch 2: sooted set (as 28 W); the hue step ('#a78091', b2r11)
    // read purple: the b2r10 tint darkened x0.74 instead
    wall: { mat: 'brick_red_sooted', tint: '#9e7f7f', dirt: 0.5, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 4.6,
        piers: { at: [0.5, 6.65, 8.5, 13.9], w: 0.5, mat: 'wood_painted', tint: '#26282b', proj: 0.05 },
        bays: [
          shop(1.0, 6.4, { name: 'Custom EZ', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.25, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_clothing', gate: { kind: 'none' } }),
          { kind: 'entrance', u0: 6.9, u1: 8.2, door: { kind: 'solid', w: 0.9, recess: 0.4, tint: '#2b2b2e' } },
          shop(8.8, 13.5, { name: '99c Department Store', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.5 }, interior: 'shop_food', gate: { kind: 'none' } }),
        ],
      },
      items: [
        { k: 'sign', sign: { kind: 'panel', lines: ['CUSTOM EZ', 'EMBROIDERY, PRINT & MORE'], font: 'Archivo-900', fg: '#ffffff', bg: '#e0424f', u0: 0.9, u1: 6.6, y: 3.5, h: 1.1, depth: 0.12 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['99¢ DEPARTMENT STORE'], font: 'Archivo-900', fg: '#ffffff', bg: '#d6262b', u0: 8.8, u1: 14.1, y: 3.5, h: 1.1, depth: 0.12 } },
      ],
      bays: { n: 6, margin: [0.8, 0.5] },
      floors: [
        { n: 1, h: 3.2, win: 'A', open: cols([1.8, 4.0, 6.25, 8.45, 10.7, 13.0], 0.85, 'A', 0.5, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.8, 4.0, 6.25, 8.45, 10.7, 13.0], 0.85, 'A', 0.4, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.8, 4.0, 6.25, 8.45, 10.7, 13.0], 0.85, 'A', 0.5, 1.7) },
        { n: 1, h: 3.1, win: 'A', open: cols([1.8, 4.0, 6.25, 8.45, 10.7, 13.0], 0.85, 'A', 0.4, 1.7) },
      ],
      windows: { A: win(0.85, 1.75, 0.5, { frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'hood', mat: 'cast_stone', tint: CREAM, h: 0.4, ext: 0.28 }, sillStone: { mat: 'cast_stone', tint: CREAM, h: 0.14, proj: 0.07 },
        surround: { mat: 'cast_stone', tint: CREAM, w: 0.16, proj: 0.04 }, ac: 0.25, blinds: 0.5 }) },
      bands: [
        { at: 4.6, h: 0.3, proj: 0.06, mat: 'cast_stone', tint: CREAM },
        { at: 7.8, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
        { at: 11.1, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
        { at: 14.4, h: 0.3, proj: 0.05, mat: 'cast_stone', tint: CREAM },
      ],
      fireEscape: [{ bays: [1, 2, 3, 4], floors: [1, 4], kind: 'balcony', drop: true }],
      cornice: { kind: 'band', h: 2.2, proj: 0.2, mat: 'stucco', tint: '#c3b79c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'tank', at: [0.4, 0.6], r: 1.9, h: 3.4, legs: 3.0 }] },
    notes: 'Twin of 28 W (strip_S2b): 19.6 m (compiled 18.66), six windows a floor, cream hoods and bands, fire escape across the middle, Custom EZ and the 99c store at street level.',
  },
  // ------------------------------------------------------------------ 20 W 125th: brown tenement with a dark cornice, H&R Block
  // MEASURED: lot refitted to its real wall (u 1.0-5.9 from the compiled east end); 14.3 m to the top of a dark cornice; a wide 2nd-floor window with an OFFICE SPACE FOR RENT banner
  // (4.2-5.9 m), two windows on each of the 3rd and 4th floors; H&R Block's black sign (2.5-3.4 m) with the green square over a gated shop.
  {
    id: 'w125-20', addr: '20 W 125th St', name: 'H&R Block', bin: '1053470',
    at: [2346.24, -2613.27], comp: '4_-6:447', h: 14.3, status: 'measured',
    ring: refit('w125-20', 1.0, 5.9, 2.0),
    wall: { mat: 'brick_brown', tint: '#7a5141', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.9,
        bays: [shop(0.3, 4.7, { name: 'H&R Block', h: 3.3, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.8, w: 0.9, kind: 'glass', recess: 0.4 }, interior: 'bank', gate: { kind: 'rolldown', color: '#3a3b3d', down: 0 },
          sign: { kind: 'panel', text: 'H&R BLOCK', font: 'Inter-800', fg: '#ffffff', bg: '#151516', u0: 0.1, u1: 4.9, y: 2.5, h: 0.95, depth: 0.12, logo: 'bid4:hrblock', logoAt: 'left' } })],
      },
      bays: { n: 2, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 2.9, win: 'W', open: [[0.3, 4.7, 'W']] },
        { n: 1, h: 3.3, win: 'A', open: cols([2.35, 4.2], 0.95, 'A', 1.1, 1.5) },
        { n: 1, h: 3.0, win: 'A', open: cols([2.35, 4.2], 0.95, 'A', 0.4, 1.5) },
      ],
      windows: {
        W: { sill: 0.3, h: 1.7, kind: 'fixed', mullions: 3, frame: 'alu_black', reveal: 0.2, lintel: null, sillStone: { mat: 'brownstone', tint: '#7e5a48', h: 0.12, proj: 0.06 }, blinds: 0.2, lit: 0.5, ac: 0.4 },
        A: win(0.95, 1.5, 0.5, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'hood', mat: 'brownstone', tint: '#7e5a48', h: 0.35, ext: 0.2 }, sillStone: { mat: 'brownstone', tint: '#7e5a48', h: 0.1, proj: 0.06 }, ac: 0.2, blinds: 0.5 }),
      },
      bands: [{ at: 'floor:2', h: 0.5, proj: 0.12, mat: 'brownstone', tint: '#7e5a48' }],
      cornice: { kind: 'bracketed', h: 1.2, proj: 0.6, mat: 'wood_painted', tint: '#3a2f2b', brackets: 4 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Brown tenement (strip_S2a): 14.3 m, wide 2nd-floor window with the OFFICE SPACE banner, H&R Block. Cornice dark.',
  },
  // ------------------------------------------------------------------ 18 W 125th: pale grey tenement (Cap USA)
  // MEASURED (strip_S2a): lot refitted (u 0.3-6.6); 19.0 m to the top of a verdigris cornice (compiled 16.48); three windows a floor (centres 1.05, 3.05, 5.25, glass 0.9 x 1.7-1.8), floors at 3.3 m
  // from 3.9 m, a fire escape across the front, the red CAP USA sign (2.3-3.7 m).
  {
    id: 'w125-18', addr: '18 W 125th St', name: 'Cap USA', bin: '1053490',
    at: [2349.91, -2608.8], comp: '4_-6:173', h: 19.0, status: 'measured',
    ring: refit('w125-18', 0.3, 6.6),
    wall: { mat: 'brick_painted', tint: '#c4c4c2', dirt: 0.5 },   // w2r1a calib: real #8b9396, twin #8f999c;
    faces: [{
      edge: 'front',
      base: {
        h: 3.9,
        bays: [shop(0.3, 5.9, { name: 'Cap USA', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'shop_clothing', gate: { kind: 'none' },
          sign: { kind: 'panel', text: 'CAP USA', font: 'Archivo-900', fg: '#ffffff', bg: '#d6262b', u0: 0.0, u1: 5.0, y: 2.4, h: 1.3, depth: 0.12 } })],
      },
      bays: { n: 3, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 3.3, win: 'A', open: cols([1.05, 3.05, 5.25], 0.9, 'A', 0.8, 1.7) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.05, 3.05, 5.25], 0.9, 'A', 0.9, 1.7) },
        { n: 1, h: 3.3, win: 'A', open: cols([1.05, 3.05, 5.25], 0.9, 'A', 0.7, 1.8) },
        { n: 1, h: 3.5, win: 'A', open: cols([1.05, 3.05, 5.25], 0.9, 'A', 0.6, 1.8) },
      ],
      windows: { A: win(0.9, 1.75, 0.7, { frame: 'alu_white', reveal: 0.2, lintel: { kind: 'hood', mat: 'cast_stone', tint: '#e6e4de', h: 0.5, ext: 0.3 }, sillStone: { mat: 'cast_stone', tint: '#e6e4de', h: 0.16, proj: 0.08 },
        surround: { mat: 'cast_stone', tint: '#e6e4de', w: 0.2, proj: 0.05 }, ac: 0.15, blinds: 0.5 }) },
      bands: [{ at: 'floor:2', h: 0.3, proj: 0.06, mat: 'cast_stone', tint: '#e6e4de' }, { at: 'floor:3', h: 0.3, proj: 0.06, mat: 'cast_stone', tint: '#e6e4de' }, { at: 'floor:4', h: 0.3, proj: 0.06, mat: 'cast_stone', tint: '#e6e4de' }, { at: 'floor:5', h: 0.3, proj: 0.06, mat: 'cast_stone', tint: '#e6e4de' },
        { at: 17.78, h: 0.55, kind: 'pressed', proj: 0.05, mat: 'panel_grey', tint: '#5f8f7b' }],   // the cornice's pressed frieze (cornice 17.7-19.4)
      fireEscape: [{ bays: [0, 1, 2], floors: [1, 4], kind: 'balcony', drop: true }],
      cornice: { kind: 'bracketed', h: 1.7, proj: 0.75, mat: 'panel_grey', tint: '#5f8f7b', brackets: 6 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal_painted' }, membrane: 'gravel' },
    notes: 'Pale blue-grey painted tenement (strip_S2a): 19.0 m with the verdigris cornice, three windows a floor, fire escape across the front, Cap USA sign.',
  },
  // ------------------------------------------------------------------ 16 W 125th: red brick, brownstone trim, green cornice (Boost Mobile, JB Sportswear)
  // MEASURED (strip_S2a, 2024-08): 19.0 m to the top of a verdigris cornice (16.6-19.0 m); four windows a floor (centres 2.45, 4.35, 7.65, 9.9 from the east end; glass 5.0-6.8, 8.2-10.0, 11.5-13.3, 15.2-16.8 m) in brownstone
  // surrounds, a terracotta panel between the 2nd and 3rd columns, a carved frieze band at 14.7 m; Boost Mobile (white sign), the residential gate, JB Sportswear (grey awning).
  {
    id: 'w125-16', addr: '16 W 125th St', name: 'Boost Mobile, JB Sportswear', bin: '1053469',
    at: [2356.4, -2603.91], comp: '4_-6:256', h: 19.0, status: 'measured',
    wall: { mat: 'brick_red', tint: '#a88f8b', dirt: 0.45, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 4.1,
        bays: [
          shop(0.3, 4.9, { name: 'Boost Mobile', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.2, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_phone', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'boost mobile', font: 'Poppins-700', fg: '#4a4d50', bg: '#f1f1f0', u0: 0.1, u1: 4.9, y: 2.8, h: 1.2, depth: 0.12 } }),
          { kind: 'entrance', u0: 5.3, u1: 6.7, door: { kind: 'solid', w: 0.9, recess: 0.4, tint: '#2b2b2e' } },
          shop(7.0, 11.2, { name: 'JB Sportswear', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.55, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_clothing', gate: { kind: 'none' },
            awning: { kind: 'retractable', color: '#8a8d90', proj: 1.0, drop: 0.45 }, sign: { kind: 'panel', text: 'JB SPORTSWEAR', font: 'Barlow-700', fg: '#ffffff', bg: '#6b6e71', u0: 6.8, u1: 11.6, y: 3.3, h: 0.8, depth: 0.08 } }),
        ],
      },
      bays: { n: 4, margin: [0.6, 0.6] },
      floors: [
        { n: 1, h: 3.3, win: 'A', open: cols([2.45, 4.35, 7.65, 9.9], 0.9, 'A', 0.9, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([2.45, 4.35, 7.65, 9.9], 0.9, 'A', 0.8, 1.8) },
        { n: 1, h: 3.3, win: 'A', open: cols([2.45, 4.35, 7.65, 9.9], 0.9, 'A', 0.8, 1.8) },
        { n: 1, h: 2.6, win: 'A', open: cols([2.45, 4.35, 7.65, 9.9], 0.9, 'A', 1.2, 1.6) },
      ],
      windows: { A: win(0.9, 1.8, 0.8, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'hood', mat: 'brownstone', tint: '#8c6550', h: 0.45, ext: 0.25 }, sillStone: { mat: 'brownstone', tint: '#8c6550', h: 0.16, proj: 0.08 },
        surround: { mat: 'brownstone', tint: '#8c6550', w: 0.18, proj: 0.04 }, ac: 0.15, blinds: 0.5 }) },
      bands: [{ at: 7.4, h: 0.5, proj: 0.14, mat: 'brownstone', tint: '#8c6550' }, { at: 14.4, h: 0.7, proj: 0.12, mat: 'brownstone', tint: '#8c6550' },
        { at: 17.0, h: 0.8, kind: 'pressed', proj: 0.06, pitch: 0.5, mat: 'panel_grey', tint: '#5f8f7b' }],   // the cornice's pressed frieze (cornice 16.9-19.3)
      items: [{ k: 'plaque', u: 5.2, y: 5.5, w: 1.6, h: 2.0, mat: 'terracotta_cream', tint: '#b9705a' }],
      cornice: { kind: 'bracketed', h: 2.4, proj: 0.7, mat: 'panel_grey', tint: '#5f8f7b', brackets: 10 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.5, 0.5], w: 3, d: 2.4, h: 2.3 }] },
    notes: 'Red brick, brownstone hoods and frieze, carved terracotta panel, verdigris cornice at 16.6-19.0 m (strip_S2a), four windows a floor.',
  },
  // ------------------------------------------------------------------ 8-14 W 125th: the buff loft with arched top windows (Harlem Furniture, Valentina's Pharmacy)
  // MEASURED: 19.8 m (compiled 16.6); four window columns (centres 3.5, 8.25, 13.25, 18.15, glass 3.8-4.1 m wide) on three floors at 3.55 m
  // from 5.1 m (glass 6.7-9.1, 10.2-12.5 and the arched 13.8-15.9 m), brick piers 1.0 m between them, a verdigris bracketed cornice 16.6-19.8 m with consoles over the piers, a blue awning (5.4-6.5 m) over the
  // HARLEM FURNITURE sign (u 5.3-12.3, 4.2-5.8 m) and Valentina's Pharmacy (blue) at the west end.
  {
    id: 'w125-8', addr: '8-14 W 125th St', name: 'Harlem Furniture, Valentina\'s Pharmacy', bin: '1053468',
    at: [2371.13, -2595.81], comp: '4_-6:499', h: 19.8, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#c9bdab', dirt: 0.4, bond: 'running' },   // w2r1b: the spandrels read white-blue under '#dde7e8'; w2r1f wall patches real #928b7c, twin #909284 (greener)
    faces: [{
      edge: 'front',
      base: {
        h: 5.1,
        piers: { at: [0.5, 5.0, 10.0, 15.2, 20.5], w: 0.9, mat: 'stone_lime', tint: '#d6c8a6', proj: 0.08 },
        bays: [
          shop(0.9, 14.7, { name: 'Harlem Furniture', h: 3.8, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 9, frame: 'alu_black' }, door: { u: 0.55, w: 1.3, kind: 'double', recess: 0.8 }, interior: 'shop_clothing', gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#2d6fb0', proj: 1.2, drop: 0.55 } }),
          shop(15.6, 20.3, { name: 'Valentina\'s Pharmacy', h: 3.8, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 3, frame: 'alu_clear' }, door: { u: 0.35, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' },
            sign: { kind: 'panel', lines: ['VALENTINA\'S PHARMACY INC', 'FREE DELIVERY'], font: 'Inter-800', fg: '#ffffff', bg: '#1d4fb3', u0: 15.5, u1: 20.5, y: 4.0, h: 1.0, depth: 0.12 } }),
        ],
      },
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'HARLEM FURNITURE', font: 'DMSerifDisplay', fg: '#151515', bg: '#efe9db', u0: 5.3, u1: 12.3, y: 4.2, h: 1.0, depth: 0.1 } }],
      bays: { n: 4, margin: [0.9, 0.9] },
      floors: [
        { n: 1, h: 3.55, win: 'L', open: cols([3.5, 8.25, 13.25, 18.15], 3.8, 'L', 1.6, 2.4) },
        { n: 1, h: 3.55, win: 'L2', open: cols([3.5, 8.25, 13.25, 18.15], 3.8, 'L2', 1.55, 2.3) },
        { n: 1, h: 3.55, win: 'Ar', open: cols([3.5, 8.25, 13.25, 18.15], 3.8, 'Ar', 1.6, 2.2) },
      ],
      windows: {
        L: { sill: 1.6, h: 2.4, kind: 'fixed', mullions: 3, transom: 0.6, frame: 'alu_black', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d6c8a6', h: 0.3, ext: 0.15 }, sillStone: { mat: 'stone_lime', tint: '#d6c8a6', h: 0.16, proj: 0.07 }, ac: 0, blinds: 0.4, lit: 0.3 },
        L2: { sill: 1.55, h: 2.3, kind: 'fixed', mullions: 3, transom: 0.6, frame: 'alu_black', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d6c8a6', h: 0.3, ext: 0.15 }, sillStone: { mat: 'stone_lime', tint: '#d6c8a6', h: 0.16, proj: 0.07 }, ac: 0, blinds: 0.4, lit: 0.3 },
        Ar: { sill: 1.6, h: 2.2, kind: 'arch', rise: 0.9, frame: 'alu_black', reveal: 0.25, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d6c8a6', h: 0.32, proj: 0.05 }, sillStone: { mat: 'stone_lime', tint: '#d6c8a6', h: 0.16, proj: 0.07 }, ac: 0, blinds: 0.4, lit: 0.3 },
      },
      bands: [{ at: 5.1, h: 0.3, proj: 0.08, mat: 'stone_lime', tint: '#d6c8a6' }, { at: 8.65, h: 0.3, proj: 0.07, mat: 'stone_lime', tint: '#d6c8a6' }, { at: 12.2, h: 0.3, proj: 0.07, mat: 'stone_lime', tint: '#d6c8a6' },
        // the pressed-metal frieze of the verdigris cornice (its frieze zone: the cornice runs 16.9-20.1 with the parapet)
        { at: 17.05, h: 0.95, kind: 'pressed', proj: 0.06, pitch: 0.5, mat: 'panel_grey', tint: '#6fa595' }],
      // w2r1a calib (the wall patches between the window columns are these piers): real #929285, twin #8a7d5f, a neutral grey-beige brick (the set is yellow: blue x2)
      piers: { mat: 'brick_buff', tint: '#c9bdab', w: 1.0, proj: 0.1, at: [0.5, 5.9, 10.75, 15.7, 20.6], from: 5.1, to: 16.6, capital: false, base: false },
      cornice: { kind: 'bracketed', h: 3.2, proj: 0.9, mat: 'panel_grey', tint: '#6fa595', brackets: 14 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'black', items: [{ k: 'hvac', at: [0.4, 0.5], n: 2 }, { k: 'bulkhead', at: [0.7, 0.5], w: 3.4, d: 2.6, h: 2.5 }] },
    notes: 'Buff-brick loft (strip_S1): 19.8 m (compiled 16.6), three floors of 3.8-4.1 m windows, the top row arched, a deep verdigris cornice, the HARLEM FURNITURE sign under a blue awning, Valentina\'s Pharmacy at the west end.',
  },
  // ------------------------------------------------------------------ 4-6 W 125th: buff brick, verdigris cornice (YoYo Chicken)
  // MEASURED (strip_S1): 19.5 m (compiled 16.8); four window columns (centres 2.4, 4.6, 6.8, 9.0, 0.8 m wide) on three floors of 3.5 m from 6.0 m (glass 7.1-9.0, 10.7-12.5, 14.1-16.0 m) with stone sills and keystone
  // lintels, a stone belt course at 6.0-6.9 m, a 2.7 m verdigris cornice; the 4.4-6.0 m black YOYO CHICKEN sign over a gated shop, the narrow entrance at the east end.
  {
    id: 'w125-4', addr: '4-6 W 125th St', name: 'YoYo Chicken', bin: '1053467',
    at: [2387.47, -2593.47], comp: '4_-6:387', h: 19.5, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#e8d7c1', dirt: 0.4, bond: 'running' },   // w2r1a calib: real #a3a098, twin #9b9b92
    faces: [{
      edge: 'front',
      base: {
        h: 6.0,
        bays: [
          { kind: 'entrance', u0: 0.6, u1: 2.6, door: { kind: 'glass', w: 0.95, recess: 0.5, transom: 1.2, frame: 'alu_black' } },
          shop(3.0, 9.6, { name: 'YoYo Chicken', h: 4.3, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 4, frame: 'alu_black' }, door: null, interior: 'restaurant', gate: { kind: 'rolldown', color: '#8f9193', down: 1, graffiti: { density: 0.3, style: 'tags', seed: 11 } } }),
        ],
      },
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'YOYO CHICKEN', font: 'ArchivoBlack', fg: '#f26a21', bg: '#0d0d0f', u0: 2.9, u1: 9.8, y: 4.4, h: 1.6, depth: 0.15, logo: 'bid4:yoyo', logoAt: 'left', sub: { text: 'CHICKEN  SMASH BURGER  FRIES  SHAKES', font: 'Inter-700', fg: '#ffffff', size: 0.2 } } }],
      bays: { n: 4, margin: [0.6, 0.6] },
      floors: [
        { n: 1, h: 3.5, win: 'A', open: cols([2.4, 4.6, 6.8, 9.0], 0.8, 'A', 1.1, 1.9) },
        { n: 1, h: 3.5, win: 'A', open: cols([2.4, 4.6, 6.8, 9.0], 0.8, 'A', 1.2, 1.8) },
        { n: 1, h: 3.8, win: 'A', open: cols([2.4, 4.6, 6.8, 9.0], 0.8, 'A', 1.1, 1.9) },
      ],
      windows: { A: win(0.8, 1.9, 1.1, { frame: 'alu_black', reveal: 0.2, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d8cbac', h: 0.4, ext: 0.12 }, sillStone: { mat: 'stone_lime', tint: '#d8cbac', h: 0.14, proj: 0.08 }, ac: 0.1, blinds: 0.6 }) },
      bands: [{ at: 6.0, h: 0.9, proj: 0.1, mat: 'stone_lime', tint: '#d8cbac' }, { at: 9.5, h: 0.25, proj: 0.05, mat: 'stone_lime', tint: '#d8cbac' }, { at: 13.0, h: 0.25, proj: 0.05, mat: 'stone_lime', tint: '#d8cbac' },
        { at: 17.22, h: 0.85, kind: 'pressed', proj: 0.06, pitch: 0.5, mat: 'panel_grey', tint: '#6fa595' }],   // the cornice's pressed frieze (cornice 17.1-19.8)
      piers: { mat: 'stone_lime', tint: '#d8cbac', w: 0.5, proj: 0.04, at: [0.3, 9.7], from: 6.9, to: 16.8, capital: false, base: false },
      cornice: { kind: 'bracketed', h: 2.7, proj: 0.85, mat: 'panel_grey', tint: '#6fa595', brackets: 8 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal_painted' }, membrane: 'black' },
    notes: 'Four-storey buff brick (strip_S1) 19.5 m (compiled 16.8), windows 0.8 x 1.9 m at 2.2 m pitch, verdigris cornice, YoYo Chicken sign over a closed gate (graffiti light).',
  },
  // ------------------------------------------------------------------ 2018 Fifth Ave: the SW corner (tan stucco, 1940)
  // MEASURED (strip_S1): 18.9 m (compiled 15.8) with a stepped parapet in darker ochre above 17.2 m; five storeys: shops to 4.4 m, the 2nd floor a row of big dark windows (4.5-6.6 m) over the shops, then three floors
  // of single windows in eight columns (u 2.0-3.0, 4.8-5.4, 8.2-10.1, 11.0-11.5, 12.3-13.0, 15.3-16.3, 18.5-19.6, 21.7-22.8; glass 7.5-9.3, 10.7-12.6, 14.2-16.0 m; the west columns 0.7 m higher); the black Luxe Touch sign
  // (7.0-8.2 m, u 0-7.8); shops: Burgers & Shakes (0-3.7), Jerk House (3.9-7.7), Casa Bonita (7.9-12.3), A Taste of Seafood (12.6-16.1), Perfect Brows (16.4-20.2), total wireless (20.5-23.3).
  {
    id: 'fifth-2018', addr: '2018 Fifth Ave (2 W 125th St)', name: 'Luxe Touch Nails, Burgers & Shakes, Jerk House, Casa Bonita, A Taste of Seafood, Perfect Brows', bin: '1053466',
    at: [2407.35, -2585.85], comp: '4_-6:352', h: 18.9, status: 'measured',
    wall: { mat: 'stucco', tint: '#b6a589', dirt: 0.5 },   // w2r1a calib: real #857e6c, twin #88836d
    faces: [
      {
        edge: 'front',
        base: {
          h: 4.4,
          bays: [
            shop(0.1, 3.7, { name: 'Burgers & Shakes', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
              awning: { kind: 'fixed', color: '#c2282c', proj: 1.0, drop: 0.5 } }),
            shop(4.0, 7.6, { name: 'Jerk House', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
              awning: { kind: 'fixed', color: '#151516', proj: 0.9, drop: 0.5 }, sign: { kind: 'panel', text: 'JERK HOUSE', font: 'Anton', fg: '#f0a52a', bg: '#151516', u0: 3.9, u1: 7.8, y: 3.55, h: 0.8, depth: 0.08 } }),
            shop(8.0, 12.2, { name: 'Casa Bonita Gourmet Deli', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_food', gate: { kind: 'none' },
              sign: { kind: 'panel', lines: ['CASA BONITA', 'GOURMET DELI'], font: 'Archivo-800', fg: '#ffffff', bg: '#7a1f2a', u0: 7.9, u1: 12.4, y: 3.5, h: 0.95, depth: 0.1 } }),
            shop(12.7, 16.0, { name: 'A Taste of Seafood', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
              sign: { kind: 'panel', text: 'A Taste of Seafood', font: 'Yellowtail', fg: '#2a58c8', bg: '#ffffff', u0: 12.5, u1: 16.2, y: 3.0, h: 1.4, depth: 0.1 } }),
            shop(16.5, 20.1, { name: 'Perfect Brows Threading Salon', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.7, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' },
              sign: { kind: 'panel', lines: ['Perfect Brows', 'THREADING SALON'], font: 'Poppins-700', fg: '#d64a86', bg: '#ffffff', u0: 16.4, u1: 20.2, y: 3.2, h: 1.1, depth: 0.1 } }),
            shop(20.6, 23.3, { name: 'total wireless', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_phone', gate: { kind: 'none' },
              awning: { kind: 'retractable', color: '#17203a', proj: 0.8, drop: 0.5 } }),
          ],
        },
        items: [{ k: 'sign', sign: { kind: 'panel', text: 'Luxe Touch', font: 'GreatVibes', fg: '#e6bd5a', bg: '#121214', u0: 0.0, u1: 7.8, y: 6.85, h: 1.2, depth: 0.08, sub: { text: 'NAILS', font: 'Inter-700', fg: '#e6bd5a', size: 0.2 } } }],
        bays: { n: 8, margin: [0.3, 0.3] },
        floors: [
          { n: 1, h: 2.9, win: 'Sh', open: [[0.2, 4.1, 'Sh'], [5.0, 8.3, 'Sh'], [12.6, 16.1, 'Sh'], [16.9, 19.8, 'Sh'], [20.4, 23.3, 'Sh']] },
          { n: 1, h: 3.1, win: 'A', open: [
            { u0: 1.5, u1: 2.5, win: 'A', sill: 1.1, h: 1.7 }, { u0: 4.8, u1: 5.4, win: 'A', sill: 1.1, h: 1.7 },
            { u0: 8.2, u1: 10.1, win: 'A', sill: 0.2, h: 1.8 }, { u0: 12.3, u1: 13.0, win: 'A', sill: 0.2, h: 1.8 }, { u0: 15.3, u1: 16.3, win: 'A', sill: 0.2, h: 1.8 }, { u0: 18.5, u1: 19.6, win: 'A', sill: 0.2, h: 1.8 }, { u0: 21.7, u1: 22.8, win: 'A', sill: 0.2, h: 1.8 }] },
          { n: 1, h: 3.3, win: 'A', open: [
            { u0: 2.0, u1: 2.8, win: 'A', sill: 1.2, h: 1.7 }, { u0: 4.8, u1: 5.4, win: 'A', sill: 1.2, h: 1.7 },
            { u0: 8.2, u1: 10.1, win: 'A', sill: 0.3, h: 1.9 }, { u0: 11.0, u1: 11.5, win: 'A', sill: 0.3, h: 1.9 }, { u0: 12.3, u1: 13.0, win: 'A', sill: 0.3, h: 1.9 }, { u0: 15.3, u1: 16.3, win: 'A', sill: 0.3, h: 1.9 }, { u0: 18.5, u1: 19.6, win: 'A', sill: 0.3, h: 1.9 }, { u0: 21.7, u1: 22.8, win: 'A', sill: 0.3, h: 1.9 }] },
          { n: 1, h: 3.5, win: 'A', open: [
            { u0: 2.0, u1: 3.0, win: 'A', sill: 1.2, h: 1.8 }, { u0: 4.8, u1: 5.4, win: 'A', sill: 1.2, h: 1.8 },
            { u0: 8.2, u1: 10.1, win: 'A', sill: 0.5, h: 1.8 }, { u0: 11.0, u1: 11.5, win: 'A', sill: 0.5, h: 1.8 }, { u0: 12.3, u1: 13.0, win: 'A', sill: 0.5, h: 1.8 }, { u0: 15.3, u1: 16.3, win: 'A', sill: 0.5, h: 1.8 }, { u0: 18.5, u1: 19.6, win: 'A', sill: 0.5, h: 1.8 }, { u0: 21.7, u1: 22.8, win: 'A', sill: 0.5, h: 1.8 }] },
        ],
        windows: {
          Sh: { sill: 0.1, h: 2.1, kind: 'fixed', mullions: 2, transom: 0.6, frame: 'steel_black', reveal: 0.2, lintel: null, sillStone: null, blinds: 0.1, lit: 0.5, ac: 0 },
          A: win(1.0, 1.8, 0.3, { frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'flat', mat: 'stucco', tint: '#b98f5a', h: 0.2, ext: 0.1 }, sillStone: { mat: 'stucco', tint: '#b98f5a', h: 0.14, proj: 0.08 }, ac: 0.3, blinds: 0.6 }),
        },
        bands: [{ at: 'base', h: 0.3, proj: 0.06, mat: 'stucco', tint: '#b9a473' }],
        graffiti: [{ u0: 8.0, u1: 12.3, y0: 0.15, y1: 1.15, density: 0.85, style: 'piece' }],
        cornice: { kind: 'band', h: 1.7, proj: 0.2, mat: 'stucco', tint: '#b98f5a' },
      },
      {
        edge: 'corner',
        base: {
          h: 4.4,
          bays: [
            shop(1.2, 7.0, { name: 'total wireless', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_phone', gate: { kind: 'none' } }),
            shop(8.0, 14.0, { name: 'Luxe Touch Nails', h: 3.2, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' },
              sign: { kind: 'panel', text: 'The Luxe Touch NAILS', font: 'Yellowtail', fg: '#e6bd5a', bg: '#121214', u0: 8.0, u1: 14.6, y: 3.3, h: 0.85, depth: 0.08 } }),
          ],
        },
        bays: { n: 5, margin: [0.8, 0.8] },
        floors: [{ n: 1, h: 2.9, win: 'Sh' }, { n: 1, h: 3.1, win: 'A' }, { n: 1, h: 3.3, win: 'A' }, { n: 1, h: 3.5, win: 'A' }],
        windows: {
          Sh: { sill: 0.1, h: 2.1, w: 2.0, kind: 'fixed', mullions: 1, frame: 'steel_black', reveal: 0.2, lintel: null, sillStone: null, blinds: 0.1, lit: 0.5, ac: 0 },
          A: win(1.0, 1.8, 0.3, { frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'flat', mat: 'stucco', tint: '#b98f5a', h: 0.2, ext: 0.1 }, sillStone: { mat: 'stucco', tint: '#b98f5a', h: 0.14, proj: 0.08 }, ac: 0.3, blinds: 0.6 }),
        },
        bands: [{ at: 'base', h: 0.3, proj: 0.06, mat: 'stucco', tint: '#b9a473' }],
        cornice: { kind: 'band', h: 1.7, proj: 0.2, mat: 'stucco', tint: '#b98f5a' },
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal_painted' }, membrane: 'black', items: [{ k: 'hvac', at: [0.3, 0.5], n: 2 }, { k: 'bulkhead', at: [0.7, 0.4], w: 3.2, d: 2.6, h: 2.6 }] },
    notes: 'Deco-era corner block (strip_S1): 18.9 m (compiled 15.8), eight window columns on the 125th front, the second-floor Luxe Touch salon and its sign, six shops measured on the strip. The Fifth Avenue face is not measured (only the 125th face was rectified).',
  },
];
