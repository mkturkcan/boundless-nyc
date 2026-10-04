// AR33 BID4 specs, north side of 125th Street from 75 W to 1 W (Lenox to Fifth), u eastward. Owner: the BID4 worker
// (docs/notes/ar33-bid4.md).

// AR34 w2r1 tinted the dark 'wood_painted' trims (tints under ~#4a4a4a) warm (x 1.30, 0.68, 0.49 in linear light) because they rendered navy in shade (44 W's cornice
// real #261c18, twin #1e2831, w2r1b). Batch 2 (2026-10-02) divided it back out after LOOK's shade fix (CS34): the tints below are the untinted ones again.


export default [
  // ------------------------------------------------------------------ 75 W 125th: Carver Federal Savings Bank (1994)
  // MEASURED (2026-08, shots/ar34/bid4/elev/w125-75.jpg): rose granite, a ground floor of three dark openings under the
  // Carver canopy sign (y 4.65-5.6), then a bronze glass block 11.8 m wide (u 2.1-13.9) of three vision bands (7.1-9.4, 11.5-13.7, 16.1-18.3 m) between dark
  // spandrels, narrow windows at the same heights in the granite at each side (u 0-1.0 and 14.9-16.0), a dark head band and a stepped granite crown.
  {
    id: 'w125-75', addr: '75 W 125th St', name: 'Carver Federal Savings Bank', bin: '1053496',
    at: [2232.95, -2742.05], comp: '4_-6:313', h: 21.0, status: 'measured',
    custom: { fn: 'bid4:glasswall', with: 'kit' },
    wall: { mat: 'granite_pink', tint: '#bac2b8', dirt: 0.2 },
    faces: [{
      edge: 'front',
      rustication: { to: 18.9, mat: 'granite_pink', tint: '#c6b4a8', joint: 1.3, block: 1.7, chamfer: 0.005 },
      base: {
        h: 5.9,
        piers: { at: [6.0, 10.6], w: 0.85, mat: 'granite_pink', tint: '#b9a699', proj: 0.12, plinth: false },
        bays: [
          { kind: 'window', u0: 2.6, u1: 5.6, h: 4.6, glazing: { bulkhead: 0.6, transom: 0.0, mullions: 2, frame: 'alu_bronze', kick: { mat: 'granite_pink', tint: '#9a8477' } }, interior: 'bank', gate: { kind: 'none' } },
          { kind: 'store', u0: 6.4, u1: 10.2, h: 4.6, glazing: { bulkhead: 0.0, transom: 0.8, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.1, kind: 'double', recess: 1.2 }, interior: 'bank', gate: { kind: 'none' } },
          { kind: 'window', u0: 11.0, u1: 13.9, h: 4.6, glazing: { bulkhead: 0.6, transom: 0.0, mullions: 2, frame: 'alu_bronze', kick: { mat: 'granite_pink', tint: '#9a8477' } }, interior: 'bank', gate: { kind: 'none' } },
        ],
      },
      // the sign canopy and the crown's mouldings
      items: [
        { k: 'sign', sign: { kind: 'panel', lines: ['CARVER', 'FEDERAL SAVINGS BANK'], font: 'Montserrat-700', fg: '#ffffff', bg: '#2c2f31', u0: 2.1, u1: 14.4, y: 4.65, h: 0.95, depth: 0.2, logo: 'bid4:carver', logoAt: 'left' } },
      ],
      bays: { n: 1, margin: [0.0, 0.0] },
      // one deep recess (0.5 m, a blind hole) for the glass block and a window at the same heights in the granite at each side
      floors: [{ n: 1, h: 13.1, open: [
        { u0: 2.1, u1: 13.9, win: 'Zb', sill: 0.7, h: 12.0 },
        ...[0.5, 5.2, 9.8].flatMap((sl) => [{ u0: 0.05, u1: 1.05, win: 'Sd', sill: sl, h: 2.1 }, { u0: 14.9, u1: 16.0, win: 'Sd', sill: sl, h: 2.1 }]),
      ] }],
      windows: {
        Zb: { kind: 'blind', reveal: 0.5, lintel: null, sillStone: null },
        Sd: { kind: 'fixed', mullions: 0, frame: 'alu_bronze', glass: 'glass_bronze', reveal: 0.3, lintel: null, sillStone: { mat: 'granite_pink', tint: '#b9a699', h: 0.12, proj: 0.06 }, ac: 0, blinds: 0.3, lit: 0.3 },
      },
      glassWall: { zones: [{ u0: 2.1, u1: 13.9, mullion: 0.8, w: -0.46,
        rows: [[7.1, 9.4, 'v'], [9.4, 11.5, 's'], [11.5, 13.7, 'v'], [13.7, 16.1, 's'], [16.1, 18.3, 'v'], [18.3, 19.0, 's']] }],
        glass: 'glass_tower_bronze', body: '#6c6259', tint: '#d9c9b0', spandrelBody: '#4a423b', frame: 'alu_bronze', frameTint: '#5a4d3f', mullionW: 0.05, mullionD: 0.1 },
      bands: [
        { at: 'base', h: 0.5, proj: 0.16, mat: 'granite_pink', tint: '#7b6a60' },
        { at: 19.0, h: 0.6, proj: 0.28, mat: 'granite_pink', tint: '#8a766a' },
      ],
      cornice: { kind: 'band', h: 0.5, proj: 0.2, mat: 'granite_pink', tint: '#a88f82' },
    }],
    // the stepped crown: its middle (u 5-11) stands about 0.7 m over the rest (elevation): a raised block at the front over the parapet (KIT roof.levels, d0 0)
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'granite_pink' }, membrane: 'gravel', levels: [{ u0: 5.0, u1: 11.0, d0: 0, d1: 2.5, h: 1.5, mat: 'granite_pink', tint: '#c6b4a8' }],
      items: [{ k: 'bulkhead', at: [0.5, 0.4], w: 5.0, d: 3.0, h: 2.8 }, { k: 'hvac', at: [0.25, 0.6], n: 2 }] },
    notes: 'Rose-granite bank of 1994. Elevation 2026-08: three dark ground-floor openings under the Carver canopy, a bronze glass block between granite piers (vision bands over ' +
      'dark spandrels, 4.4 m pitch), single narrow windows in the granite at each side, a dark head band and a stepped crown whose middle (u 5-11) rises about 0.7 m higher ' +
      '(not modelled). The footprint edge to 67 W sits about 0.5 m east of the lot line seen in the elevation.',
  },
  // ------------------------------------------------------------------ 67 W 125th: the boarded bank (1910)
  // MEASURED (2026-08, shots/ar34/bid4/elev/w125-67.jpg): a mauve painted-stone base 8.0 m tall (fluted pilasters, the
  // entrance, a big window over it), a cream entablature to 9.9 m, a grey-olive brick shaft of three storeys of boarded windows at 4.0 m pitch (the top one
  // round-headed), a heavy dark cornice at 21.9 m and a boarded attic to 23.9 m.
  {
    id: 'w125-67', addr: '67 W 125th St', name: 'former bank, boarded', bin: '1053497',
    at: [2246.75, -2735.7], comp: '4_-6:89', h: 23.9, status: 'measured',
    custom: { fn: 'bid4:boards', with: 'kit' },
    wall: { mat: 'brick_tan', tint: '#b8ac93', dirt: 0.55 },   // w2r1a calib: real #9e937f, twin #968e7a
    faces: [{
      edge: 'front',
      boards: { tones: ['#bdb59f', '#b0a88f', '#c4bca6', '#a99d82', '#8b6c52'] },
      base: {
        h: 4.3,
        // w2r1b: real base #987f6f, twin #73534a (twin darker and redder): a mauve-grey paint
        wall: { mat: 'stucco', tint: '#a49484', dirt: 0.45, to: 7.9 },
        bays: [
          { kind: 'entrance', u0: 4.2, u1: 6.7, h: 4.3, door: { kind: 'double', w: 1.0, h: 3.3, recess: 0.5, transom: 1.0, mat: 'brownstone', tint: '#9a7433', frame: 'steel_black' } },
          { kind: 'store', u0: 8.6, u1: 10.4, h: 3.0, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 0, frame: 'steel_black' }, door: null, interior: 'empty', gate: { kind: 'rolldown', color: '#9a9c9d', down: 1 } },
        ],
      },
      // the entablature over the base (cream, 7.9-9.7 m): a moulded course, the frieze, a cap course
      items: [
        { k: 'plaque', u: 0.0, y: 8.4, w: 11.6, h: 1.2, mat: 'stone_lime', tint: '#bcb4a0' },
      ],
      // the four fluted pilasters of the base (elevation), to the entablature at 7.9 m: the face's piers (the kit flutes those), in the calibrated mauve-grey
      piers: { at: [{ u: 0.35, w: 0.9 }, { u: 3.3, w: 1.2 }, { u: 7.5, w: 1.2 }, { u: 11.2, w: 1.4 }], w: 1.2, mat: 'stone_lime', tint: '#aa9786', proj: 0.2, from: 0.0, to: 7.9, flute: 7 },
      bays: { n: 1, margin: [0.0, 0.0] },
      floors: [
        { n: 1, h: 3.6, win: 'Bw', open: [[4.3, 6.9, 'Bw']] },
        { n: 1, h: 1.8, win: 'none' },
        { n: 1, h: 4.0, win: 'R', open: [[1.5, 2.6, 'R'], [3.3, 4.4, 'R'], [5.8, 6.8, 'R'], [7.6, 8.8, 'R'], [10.0, 11.1, 'R']] },
        { n: 1, h: 4.1, win: 'R2', open: [[1.4, 2.4, 'R2'], [3.3, 4.3, 'R2'], [5.6, 6.7, 'R2'], [7.5, 8.6, 'R2'], [9.9, 11.0, 'R2']] },
        { n: 1, h: 4.1, win: 'Ar', open: [[1.3, 2.3, 'Ar'], [3.1, 4.1, 'Ar'], [5.5, 6.6, 'Ar'], [7.3, 8.4, 'Ar'], [9.8, 10.8, 'Ar']] },
        { n: 1, h: 2.0, win: 'At', open: [[1.1, 2.1, 'At'], [3.0, 4.0, 'At'], [5.3, 6.4, 'At'], [7.2, 8.3, 'At'], [9.6, 10.7, 'At']] },
      ],
      windows: {
        Bw: { sill: 0.7, h: 2.4, kind: 'fixed', mullions: 2, transom: 0.0, frame: 'steel_black', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#a8a08c', h: 0.3, ext: 0.12 }, sillStone: { mat: 'stone_lime', tint: '#a8a08c', h: 0.14, proj: 0.07 }, ac: 0, blinds: 0.3, lit: 0.2 },
        R: { sill: 0.0, h: 2.0, kind: 'blind', lintel: { kind: 'flat', mat: 'stone_lime', tint: '#a8a08c', h: 0.25, ext: 0.1 }, sillStone: { mat: 'stone_lime', tint: '#a8a08c', h: 0.12, proj: 0.06 }, reveal: 0.1 },
        R2: { sill: 0.0, h: 2.3, kind: 'blind', lintel: { kind: 'flat', mat: 'stone_lime', tint: '#a8a08c', h: 0.25, ext: 0.1 }, sillStone: { mat: 'stone_lime', tint: '#a8a08c', h: 0.12, proj: 0.06 }, reveal: 0.1 },
        Ar: { sill: 0.0, h: 2.7, kind: 'arch', boarded: true, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#a8a08c', h: 0.3, proj: 0.04 }, sillStone: { mat: 'stone_lime', tint: '#a8a08c', h: 0.12, proj: 0.06 }, frame: 'steel_black', reveal: 0.14, ac: 0, blinds: 0, lit: 0 },
        At: { sill: 0.45, h: 1.45, kind: 'blind', lintel: null, sillStone: { mat: 'stone_lime', tint: '#9a9280', h: 0.1, proj: 0.04 }, reveal: 0.1 },
      },
      bands: [
        { at: 7.9, h: 0.5, proj: 0.3, mat: 'stone_lime', tint: '#bcb4a0' },
        { at: 9.55, h: 0.3, proj: 0.14, mat: 'stone_lime', tint: '#a8a08c' },
        { at: 16.2, h: 0.28, proj: 0.06, mat: 'stone_lime', tint: '#a8a08c' },
        { at: 21.7, h: 0.6, proj: 0.55, mat: 'cast_stone', tint: '#6f6a5e' },
      ],
      cornice: { kind: 'band', h: 0.45, proj: 0.15, mat: 'cast_stone', tint: '#7b7467' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'cast_stone' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.4, 0.5], n: 1 }] },
    notes: 'Boarded-up classical bank (1910). Elevation 2026-08: base 8.0 m of mauve painted stone with fluted pilasters, a golden-wood entrance with a large window above, ' +
      'a cream entablature, grey-olive brick shaft with five windows a floor on an irregular 1.8 / 2.4 m rhythm, all boarded with weathered plywood, the top shaft floor ' +
      'round-headed with consoles, a heavy cornice and an attic of boarded windows. A sixth window column at u -0.3 falls outside the compiled footprint (the lot line is ' +
      'about 0.7 m west of it).',
  },
  // ------------------------------------------------------------------ 63 W 125th: Wingstop (2015), a glass box on a blue-grey brick base
  // glass corner at the west, a framed entrance bay at the east), two blue-grey brick storeys to 10.5 m with two square windows, then a glass box of 3 storeys on
  // the west 3.4 m with white frames and a 1.0 m strip of small square windows (u 3.6-4.6), the east 3.4 m plain brick; roof at about 24.6 m.
  {
    id: 'w125-63', addr: '63 W 125th St', name: 'Wingstop', bin: '1053498',
    at: [2255.19, -2729.82], comp: '4_-6:415', h: 24.1, status: 'measured',
    custom: { fn: 'bid4:glasswall', with: 'kit' },
    wall: { mat: 'brick_painted', tint: '#a9b2b8', dirt: 0.3 },   // w2r1b: real brick (128,135,136) blue-grey, twin (110,117,97) olive (brick_brown under a grey tint): a neutral set; b3r1 '#b0b4b6' neutral (B-R -3..+5) blue-grey (B-R +6..+11)
    faces: [{
      edge: 'front',
      base: {
        h: 5.4,
        fascia: { h: 0.35, mat: 'panel_grey', tint: '#2a2d31' },
        bays: [
          { kind: 'store', u0: 0.15, u1: 3.9, name: 'Wingstop', h: 5.0, glazing: { bulkhead: 0.0, transom: 1.2, mullions: 4, frame: 'alu_white' }, door: null, interior: 'restaurant', gate: { kind: 'none' } },
          { kind: 'store', u0: 4.3, u1: 6.7, name: 'Wingstop entrance', h: 5.0, glazing: { bulkhead: 0.0, transom: 1.4, mullions: 2, frame: 'alu_white' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'restaurant', gate: { kind: 'none' } },
        ],
      },
      items: [
        // b3r4: the letters run across the shop glass at about 2.2-3.0 m (the twin's sat at 3.5 m); the leasing board is blue with white type
        { k: 'sign', sign: { kind: 'channel', text: 'WINGSTOP', font: 'Montserrat-800', fg: '#ffffff', bg: null, u0: 0.5, u1: 6.6, y: 2.2, h: 0.75, depth: 0.1, lit: 'face' } },
        { k: 'sign', sign: { kind: 'panel', lines: ['FOR LEASE', '718.437.6100'], font: 'Inter-700', fg: '#ffffff', bg: '#1f4f9a', u0: 0.1, u1: 2.5, y: 6.0, h: 1.3, depth: 0.05 } },
      ],
      bays: { n: 1, margin: [0, 0] },
      floors: [
        { n: 1, h: 4.75, open: [[0.0, 1.1, 'Sq'], [2.1, 3.2, 'Sq']] },
        ...Array.from({ length: 10 }, () => ({ n: 1, h: 1.35, open: [[3.6, 4.6, 'Sm']] })),
      ],
      windows: {
        Sq: { sill: 1.9, h: 1.2, kind: 'fixed', mullions: 0, frame: 'alu_white', glass: 'glass_blue', reveal: 0.14, lintel: null, sillStone: { mat: 'cast_stone', tint: '#a9a9a6', h: 0.08, proj: 0.05 }, ac: 0, blinds: 0.3, lit: 0.3 },
        Sm: { sill: 0.15, h: 1.0, kind: 'fixed', mullions: 0, frame: 'alu_white', glass: 'glass_blue', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.2, lit: 0.3 },
      },
      // b3r1: the strip of small square panes runs down to the shop front's head as one glazed column (the twin had brick and two windows there)
      glassWall: { zones: [{ u0: 0.0, u1: 3.4, mullion: 0.95, rows: { y0: 10.5, y1: 24.0, vh: 1.45 } }, { u0: 3.6, u1: 4.6, mullion: 1.0, rows: { y0: 5.55, y1: 24.0, vh: 1.0, sh: 0.14 } }],   // b3r4: to the roof (the Sm windows behind it)
        glass: 'glass_tower_blue', body: '#5f87ab', tint: '#c4dcec', frame: 'alu_white', mullionW: 0.07, mullionD: 0.1 },
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.5, 0.5], n: 1 }] },
    notes: 'Narrow new building (2015), six storeys: blue-grey brick with two square windows over the Wingstop ground floor, a glass box (white frames) on the west part of the ' +
      'upper three floors beside a strip of small square windows, plain brick to the east. Height measured (the compiled record says 12.9 m, PLUTO six floors).',
  },
  // ------------------------------------------------------------------ 55 W 125th (1974): CUNY Center in Harlem, Chase, T-Mobile
  // MEASURED (2026-08, boundlessjs/shots/ar34/bid4/elev/w125-55.jpg): tan brick piers 1.2 m wide
  // every 8.9 m (centres u 6.85, 15.9, 24.75, 33.6, 42.4, 51.25), a bronze glass wall between them on a 1.5 m mullion grid (vision glass 2.6 m, spandrel
  // 1.1 m, floors of 3.7 m), a 1.7 m brick band (y 4.25-5.95) over a dark granite base with five shops (Chase 8.2-15.5, the 55 W125 lobby 16.9-24.7,
  // CUNY 26.0-33.9, a vacant unit 35.0-42.6, T-Mobile 44.1-50.6).
  {
    id: 'w125-55', addr: '55 W 125th St', name: 'CUNY Center in Harlem, Chase, T-Mobile', bin: '1053499',
    at: [2281.68, -2714.83], comp: '4_-6:494', h: 59.0, status: 'measured',
    custom: { fn: 'bid4:glasswall', with: 'kit' },
    wall: { mat: 'brick_tan', tint: '#b68a73', dirt: 0.25 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.25,
        wall: { mat: 'granite_red', tint: '#4b3430' },
        piers: { at: [16.2, 25.35, 34.4, 43.3, 51.4], w: 1.1, mat: 'granite_red', tint: '#5d3c35', proj: 0.14 },
        bays: [
          { kind: 'window', u0: 0.5, u1: 7.7, h: 3.4, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 3, frame: 'alu_black' }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 8.2, u1: 15.5, name: 'Chase', h: 4.05, glazing: { bulkhead: 0.4, transom: 0.9, mullions: 4, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, kind: 'double', recess: 1.0 }, interior: 'bank', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'CHASE', font: 'Montserrat-700', fg: '#ffffff', bg: '#14161a', u0: 8.2, u1: 15.5, y: 3.25, h: 0.85, depth: 0.12, logo: 'bid4:chase', logoAt: 'right' } },
          { kind: 'store', u0: 16.9, u1: 24.7, name: '55 W125 lobby', h: 4.05, glazing: { bulkhead: 0.0, transom: 0.9, mullions: 4, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.1, kind: 'double', recess: 1.4 }, interior: 'empty', gate: { kind: 'none' },
            sign: { kind: 'panel', text: '55 W125', font: 'Montserrat-700', fg: '#ffffff', bg: '#2b2a2a', u0: 19.5, u1: 22.1, y: 3.25, h: 0.7, depth: 0.1 } },
          { kind: 'store', u0: 26.0, u1: 33.9, name: 'The CUNY Center in Harlem', h: 4.05, glazing: { bulkhead: 0.4, transom: 0.8, mullions: 5, frame: 'alu_black' }, door: { u: 0.45, w: 1.0, kind: 'double', recess: 0.8 }, interior: 'shop_phone', gate: { kind: 'none' },
            sign: { kind: 'lightbox', text: 'The CUNY Center in Harlem', font: 'Inter-700', fg: '#ffffff', bg: '#0f63c9', u0: 25.9, u1: 34.0, y: 3.0, h: 0.8, depth: 0.25 } },
          { kind: 'store', u0: 35.0, u1: 42.6, name: 'retail space available', h: 4.05, glazing: { bulkhead: 0.45, transom: 1.0, mullions: 5, frame: 'alu_black' }, door: null, interior: 'empty', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'Leasing@CogswellRealty.com', font: 'Inter-700', fg: '#ffffff', bg: '#1aa0d6', u0: 35.0, u1: 42.6, y: 3.25, h: 0.65, depth: 0.04 },
            vinyl: [{ text: 'RETAIL SPACE AVAILABLE', color: '#ffffff', u: 0.5, y: 1.3, w: 3.6, h: 0.4 }] },
          { kind: 'store', u0: 44.1, u1: 50.6, name: 'T-Mobile', h: 4.05, glazing: { bulkhead: 0.3, transom: 0.8, mullions: 4, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'double', recess: 0.8 }, interior: 'shop_phone', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'T-Mobile', font: 'Montserrat-700', fg: '#ffffff', bg: '#e20074', u0: 44.0, u1: 50.7, y: 3.35, h: 0.7, depth: 0.1 } },
        ],
      },
      bands: [{ at: 'base', h: 1.7, proj: 0.08, mat: 'brick_tan', tint: '#c9a894' }],
      // the glass wall: the first spandrel hides behind the brick band, so the vision glass starts at 5.9 and the floor lines fall at 8.6 + 3.7 k
      glassWall: { zones: [{ u0: 0.05, u1: 52.7, mullion: 1.5, rows: { y0: 5.95, y1: 56.7, vh: 2.6, sh: 1.1 } }], glass: 'glass_tower_bronze', body: '#9a9284', tint: '#ece0cc',
        spandrelBody: '#625c53', frame: 'alu_bronze', frameTint: '#7a6e58' },
      // w2r1b: real piers (189,163,147), twin (161,117,97): too orange (tint x ratio^0.6)
      piers: { mat: 'brick_tan', tint: '#caa996', w: 1.2, proj: 0.3, at: [0.2, 6.85, 15.9, 24.75, 33.6, 42.4, 51.25, 52.35], from: 5.95, to: 57.0, capital: false, base: false },
      floors: [],
      cornice: { kind: 'band', h: 0.7, proj: 0.18, mat: 'brick_tan', tint: '#b68a73' },
    }],
    // a 24 x 10 m penthouse on the back edge (u 17-41); a round enclosure with a white conical tank at the east end
    // (about 12 m across, u 42); two round fans and a condenser (u 17-24, mid-depth); a thin parapet. Measured off the nadir at 5 px/m (lean of a 60 m roof: about 8 m).
    roof: { kind: 'flat', parapet: { h: 1.2, coping: 'metal_painted' }, membrane: 'black',
      items: [{ k: 'bulkhead', at: [0.55, 0.88], w: 24, d: 10, h: 4.5 }, { k: 'tank', at: [0.82, 0.55], r: 3.6, h: 4.6, legs: 2.2 }, { k: 'hvac', at: [0.37, 0.55], n: 2 }, { k: 'antenna', at: [0.95, 0.9], h: 6 }] },
    notes: '15 storeys (1974). Elevation 2026-08: tan brick piers 1.2 m every 8.9 m, bronze glass wall between (1.5 m grid, 2.6 m vision glass over a 1.1 m spandrel, ' +
      '3.7 m floors), 1.7 m brick band over the granite base: Chase, the 55 W125 lobby, the CUNY Center (blue box sign), a vacant unit with the Cogswell banner, ' +
      'T-Mobile (magenta). The building top above 56.7 m is not verified (not in the elevation).',
  },
  // ------------------------------------------------------------------ 35 W 125th: new residential (2025), multi-coloured brick fins
  // MEASURED (2026-08, shots/ar34/bid4/elev/w125-35.jpg): floors of 2.7 m (not 3.03), window rows at y 6.3 + 2.7 k, eleven window columns
  // (centres u 1.3, 4.2, 6.8, 9.7, 12.7, 15.6, 18.6, 21.6, 24.7, 27.8, 30.7) of paired white casements 1.5 m wide under a dark metal head flange, dark-grey ribbed brick fields with
  // full-height fins in red (u 3.0-3.4, 4.9-6.1), cream and tan (13.4-14.7, 19.7-21.1, 25.6-26.9, 29.3-30.5) (bid4:n35), a dark brick base band to 5.0 m, bare-glass shops.
  // The part above 25.3 m on the east half (u > 16) steps back with a glass terrace rail (not modelled).
  {
    id: 'w125-35', addr: '35 W 125th St', name: 'new residential building (shops not yet fitted)', bin: '1053500',
    at: [2318.17, -2694.57], comp: '4_-6:409', h: 30.0, status: 'measured',
    // finished front running on to Mushtari's pier (a 120 ft lot); the compiled record stopped at u 30.66, and the slot showed 31 W's side wall with windows
    ring: [[2343.72, -2697.35], [2329.07, -2670.86], [2297.29, -2688.5], [2297.59, -2689.04], [2311.94, -2714.99]],
    wall: { mat: 'brick_brown', tint: '#8a8f8b', dirt: 0.2, bond: 'running' },
    custom: { fn: 'bid4:n35', with: 'kit' },
    faces: [{
      edge: 'front',
      // b3r1 / b3r2: the shop glass runs up to a thin dark band and the fins start
      // right above it; the twin's 1.5 m of dark brick over the shops read ~100 / ~126 px too high in the two frames: base 5.0 -> 3.9 m, fascia 0.95 -> 0.5,
      // floors 2.7 -> 2.82 m
      base: {
        h: 3.9,
        wall: { mat: 'brick_brown', tint: '#625e5b', dirt: 0.25, bond: 'running' },
        fascia: { h: 0.5, mat: 'brick_brown', tint: '#625e5b', proj: 0.08 },
        piers: { at: [7.3, 9.6, 16.65, 17.95, 21.2, { u: 35.45, w: 1.78 }], w: 0.6, mat: 'brick_brown', tint: '#55514e', proj: 0.08 },   // batch 2: the east end pier (strip_N4 u 34.6-35.9)
        bays: [
          { kind: 'entrance', u0: 7.6, u1: 9.4, door: { kind: 'glass', w: 1.0, recess: 0.6, transom: 0.7, frame: 'alu_black' } },
          { kind: 'store', u0: 9.9, u1: 13.6, h: 3.3, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: null, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 13.8, u1: 16.5, h: 3.3, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.8 }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 18.15, u1: 21.05, h: 3.3, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 21.35, u1: 34.5, h: 3.3, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 11, frame: 'alu_black' }, door: { u: 0.95, w: 0.9, kind: 'glass', recess: 0.4 }, interior: 'empty', gate: { kind: 'none' } },
        ],
      },
      bays: { widths: [2.8, 2.9, 2.9, 2.9, 3.0, 2.9, 3.0, 3.0, 3.1, 3.1, 3.0] },
      // batch 2: the last column at 30.5 and a twelfth at 33.7 on the extended front (strip_N4: windows u 29.7-31.4 and 32.8-34.6 against the compiled lot line)
      floors: [{ n: 9, h: 2.82, win: 'A', open: [1.3, 4.2, 6.8, 9.7, 12.7, 15.6, 18.6, 21.6, 24.7, 27.8, 30.5, 33.7].map((c) => [Math.max(0.15, c - 0.75), Math.min(36.2, c + 0.75), 'A']) }],
      windows: {
        A: { w: 1.5, h: 2.2, sill: 0.35, kind: 'casement', lights: '2/2', frame: 'alu_white', reveal: 0.26,
          lintel: { kind: 'flat', mat: 'wood_painted', tint: '#222527', h: 0.4, ext: 0.12, proj: 0.17 }, sillStone: { mat: 'wood_painted', tint: '#222527', h: 0.09, proj: 0.09 }, ac: 0, blinds: 0.6, lit: 0.3 },
      },
      bands: [{ at: 'base', h: 0.16, proj: 0.1, mat: 'wood_painted', tint: '#222527' }],
      cornice: { kind: 'band', h: 0.7, proj: 0.22, mat: 'wood_painted', tint: '#222527' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.5, 0.45], w: 6, d: 4, h: 3.2 }, { k: 'hvac', at: [0.25, 0.6], n: 3 }] },
    notes: 'Ten storeys, finished 2025, shops bare glass behind barriers. Elevation: dark-grey ribbed brick with full-height fins in red, cream and tan, ' +
      'paired white casements under black metal head flanges at 2.7 m floors. The compiled record is an 8.7 m foundation stage; the spec overrides the height.',
  },
  // ------------------------------------------------------------------ 36 W 126th (spec id w125-33): a rowhouse BEHIND the 125th Street wall, not a shop front
  // The frontage inventory lists it (its rear faces 125th St, 42 m away behind 31 W / 29 W and 35 W); the first pass drew a shop on that rear wall. Left as the compiled building.
  {
    id: 'w125-33', addr: '36 W 126th St (behind 125th St)', name: 'rowhouse on 126th St', bin: '1053516',
    at: [2351.46, -2717.0], comp: '4_-6:133', h: 13.0, status: 'measured', skip: true,
    faces: [],
    notes: 'Not on the 125th Street wall (strip_N4: nothing of it shows between 35 W and 31 W; the inventory distance is 58.8 m). skip: the compiled building stays.',
  },
  // ------------------------------------------------------------------ 31 W 125th: Mushtari Hardware Home & Garden Center
  // MEASURED: 17.5 m to the top of a yellow-ochre cornice (15.7-17.5 m; compiled 16.25); four floors of white-framed window bands
  // (glass 5.2-6.4, 7.6-9.5, 10.5-12.4, 13.6-15.5 m, 4.4 m wide, u 1.0-5.4) between rusticated buff stone piers 0.9 m wide, stone bands with yellow trim between the floors; the Mushtari Hardware
  // signband (black, 'Benjamin Moore' red) 3.4-5.2 m over a plant-filled shop, the black hanging banner.
  {
    id: 'w125-31', addr: '31 W 125th St', name: 'Mushtari Hardware Home & Garden Center, Thompson Studios 125', bin: '1053502',
    at: [2336.12, -2677.26], comp: '4_-6:190', h: 17.5, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#bab29e', dirt: 0.5 },   // w2r1c: spandrel brick real (180,173,163), twin (175,160,129): too yellow; b2r9: real (173,161,139), twin (200,187,170) with '#cec6b6'
    faces: [{
      edge: 'front',
      rustication: { to: 5.0, mat: 'stone_lime', tint: '#cdc6b6', joint: 0.5, block: 1.0, chamfer: 0.005 },
      base: {
        h: 5.1,
        piers: { at: [0.3, 5.3], w: 0.7, mat: 'stone_lime_rusticated', tint: '#c9c2b4', proj: 0.1 },
        bays: [{ kind: 'store', u0: 0.7, u1: 4.8, h: 3.3, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'glass', recess: 0.7 }, interior: 'shop_food', gate: { kind: 'none' } }],
      },
      items: [
        // batch 2: a black band with the name over a red Benjamin Moore band with the trades line, and the shop's black banner hung off the west pier
        { k: 'sign', sign: { kind: 'panel', text: 'MUSHTARI HARDWARE', font: 'Inter-700', fg: '#ffffff', bg: '#151617', u0: 0.0, u1: 5.7, y: 4.35, h: 0.75, depth: 0.2, sub: { text: 'Home & Garden Center', font: 'Inter-700', fg: '#e8e8e8', size: 0.28 } } },
        { k: 'sign', sign: { kind: 'panel', lines: ['Benjamin Moore', 'PAINT-LUMBER-PLUMBING-ELECTRIC'], font: 'Inter-700', fg: '#ffffff', bg: '#d0212f', u0: 0.15, u1: 5.55, y: 3.4, h: 0.95, depth: 0.12 } },
        { k: 'sign', z: 0.55, sign: { kind: 'panel', text: '', fg: '#ffffff', bg: '#141414', logo: 'bid4:mushtariBanner', logoAt: 'fill', u0: -0.4, u1: 0.6, y: 7.1, h: 3.0, depth: 0.03, lit: 'none', push: false } },   // b2r8: hung 1.3 m too high and 0.5 m too far west
      ],
      bays: { n: 1, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 2.5, win: 'B', open: [[0.4, 4.8, 'B']] },
        { n: 1, h: 2.9, win: 'B2', open: [[0.4, 4.8, 'B2']] },
        { n: 1, h: 3.0, win: 'B2', open: [[0.4, 4.8, 'B2']] },
        { n: 1, h: 2.2, win: 'B3', open: [[0.4, 4.8, 'B3']] },
      ],
      windows: {
        B: { sill: 0.2, h: 1.2, kind: 'ribbon', mullions: 4, frame: 'alu_white', reveal: 0.2, lintel: null, sillStone: { mat: 'stone_lime', tint: '#cdc6b6', h: 0.12, proj: 0.06 }, blinds: 0.5, lit: 0.3, ac: 0 },
        B2: { sill: 0.0, h: 1.9, kind: 'ribbon', mullions: 4, transom: 0.7, frame: 'alu_white', reveal: 0.2, lintel: null, sillStone: { mat: 'stone_lime', tint: '#cdc6b6', h: 0.12, proj: 0.06 }, blinds: 0.5, lit: 0.3, ac: 0 },
        B3: { sill: 0.1, h: 1.9, kind: 'ribbon', mullions: 4, transom: 0.7, frame: 'alu_white', reveal: 0.2, lintel: null, sillStone: { mat: 'stone_lime', tint: '#cdc6b6', h: 0.12, proj: 0.06 }, blinds: 0.5, lit: 0.3, ac: 0 },
      },
      bands: [
        { at: 7.5, h: 0.5, proj: 0.08, mat: 'stone_lime', tint: '#cdc6b6' }, { at: 10.4, h: 0.45, proj: 0.08, mat: 'stone_lime', tint: '#cdc6b6' }, { at: 13.4, h: 0.45, proj: 0.08, mat: 'stone_lime', tint: '#cdc6b6' },
      ],
      piers: { mat: 'stone_lime_rusticated', tint: '#c9c2b4', w: 0.9, proj: 0.1, at: [0.3, 5.3], from: 5.1, to: 15.7, capital: false, base: false },
      cornice: { kind: 'bracketed', h: 1.8, proj: 0.8, mat: 'plain', tint: '#d4c28c', rough: 0.55, brackets: 4 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.5, 0.4], n: 1 }] },
    notes: 'Buff stone loft with white steel window bands (strip_N4): 17.5 m with the yellow cornice, rusticated piers, Mushtari Hardware signband.',
  },
  // ------------------------------------------------------------------ 29 W 125th: Golden Smile Pawn / Cash Loans
  // MEASURED (strip_N4; u from the west end of the lot): 17.5 m (compiled 15.8) with a crenellated brick parapet (15.9-17.5 m); window ribbons 4.8 m wide with white curtains on the 3rd, 4th and 5th floors
  // (glass 7.5-9.7, 10.8-12.6, 13.8-15.7 m; u 0.4-5.2), a shop sign window on the 2nd floor (5.1-6.3 m, SUNSHINE PAWN), the yellow CASH LOAN awning (3.4-4.4 m); beige-pink stucco.
  {
    id: 'w125-29', addr: '29 W 125th St', name: 'Golden Smile Pawn, Cash Loans', bin: '1053529',
    at: [2342.05, -2674.68], comp: '4_-6:115', h: 17.5, status: 'measured',
    // batch 2: the upper floors are painted brick, the base and the 2nd-floor zone stucco ((186,176,162))
    wall: { mat: 'brick_painted', tint: '#d6d0c8', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.8,
        wall: { mat: 'stucco', tint: '#c9b9a6', dirt: 0.5, to: 7.3 },
        bays: [{ kind: 'store', u0: 0.4, u1: 6.3, h: 3.4, glazing: { bulkhead: 0.5, transom: 0.4, mullions: 3, frame: 'steel_black' }, door: { u: 0.85, w: 0.95, kind: 'glass', recess: 0.6 }, interior: 'shop_clothing', gate: { kind: 'rolldown', color: '#3a3b3d' },
          awning: { kind: 'fixed', color: '#e8c33a', proj: 0.5, drop: 0.5 } }],
      },
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'CASH LOAN', font: 'Archivo-900', fg: '#c93a4a', bg: '#e8c33a', u0: 0.1, u1: 6.6, y: 3.6, h: 0.95, depth: 0.1 } },
        // the pink vinyl letters on the 2nd-floor window
        { k: 'sign', z: 0.01, sign: { kind: 'painted', lines: ['SUNSHINE', 'GOLDEN SMILE'], font: 'Oswald-700', fg: '#d2566e', bg: null, u0: 0.9, u1: 3.5, y: 5.2, h: 1.0 } },
        // the air-conditioner sleeves under the 3rd-5th floor windows, two a floor
        ...[6.98, 10.28, 13.58].flatMap((y) => [{ k: 'vent', u: 0.67, y, w: 0.56, h: 0.32 }, { k: 'vent', u: 3.95, y, w: 0.55, h: 0.32 }])],
      bays: { n: 1, margin: [0.4, 0.4] },
      floors: [
        { n: 1, h: 2.5, win: 'W2', open: [[0.3, 4.9, 'W2']] },
        { n: 1, h: 3.3, win: 'R', open: [[0.2, 4.8, 'R']] },
        { n: 1, h: 3.3, win: 'R', open: [[0.2, 4.8, 'R']] },
        { n: 1, h: 3.1, win: 'R', open: [[0.2, 4.8, 'R']] },
      ],
      windows: {
        W2: { sill: 0.25, h: 1.8, kind: 'fixed',
           mullions: 2, frame: 'steel_black', reveal: 0.15, lintel: null, sillStone: null, blinds: 0.2, lit: 0.6, ac: 0 },
        R: { sill: 0.1, h: 2.0, kind: 'ribbon', mullions: 2, transom: 0.6, frame: 'alu_white',   // batch 2: white frames (was steel_black)
           reveal: 0.2, lintel: null, sillStone: { mat: 'cast_stone', tint: '#bbb19c', h: 0.12, proj: 0.06 }, blinds: 0.9, lit: 0.3, ac: 0 },
      },
      bands: [{ at: 5.0, h: 0.5, proj: 0.1, mat: 'cast_stone', tint: '#bbb19c' }, { at: 15.9, h: 0.3, proj: 0.05, mat: 'brick_red', tint: '#9a6e5a' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.15, mat: 'cast_stone', tint: '#bbb19c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'cast_stone' }, membrane: 'gravel' },
    notes: 'Beige stucco front (strip_N4) 17.5 m with window ribbons on three floors and the yellow CASH LOAN awning; the crenellated brick parapet is a plain band here.',
  },
  // ------------------------------------------------------------------ 17-25 W 125th ([9], 34.6 m): red brick banded tenements, canted oriels
  // MEASURED (2024-08, shots/ar34/bid4/elev/w125-17.jpg): four storeys at a 3.6 m pitch over a 5.25 m ground floor (black pressed-metal
  // cornice over the shops at 4.85-5.25 m), eight groups across: three flat fire-escape bays with two or four windows (u 0-6.4, 14.7-18.4, 26.5-30.2) and five canted
  // oriels (u 6.9-10.4, 11.0-14.6, 18.8-22.0, 22.9-26.2, 30.2-33.6) running from the second floor to the cornice, cream brick bands at every floor line, a brick frieze with
  // lion-head paterae under a dark bracketed cornice. Shops: wellness, Physical Therapy, Insomnia Cookies, the residential door, Essex Organic, Capt Loui, Hot Pizza, an east unit.
  {
    id: 'w125-17', addr: '17-25 W 125th St', name: 'Insomnia Cookies, Essex Organic, Capt Loui, Fresh Hot Pizza', bin: '1053503',
    at: [2354.51, -2667.58], comp: '4_-6:433', h: 20.0, status: 'measured',
    // batch 2 (b2r1, brick pixels R>G>B, R-B>25): real upper floors (167,127,110); twin flat wall (175,128,88) with '#f3ccbf' (yellow), oriels (199,104,79) with '#b3705d' (red):
    // b2r5: oriels (160,117,99) close (167,127,110);
    // one brick over oriels and wall, so the wall takes the oriels' tint
    wall: { mat: 'brick_red', tint: '#a48a80', dirt: 0.45, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 4.85,
        fascia: { h: 0.4, mat: 'wood_painted', tint: '#202225', proj: 0.12 },
        piers: { at: [0.2, 5.6, 10.75, 14.95, 18.0, 23.7, 28.55, 31.8, 34.4], w: 0.5, mat: 'wood_painted', tint: '#2a2c2d', proj: 0.05 },
        bays: [
          { kind: 'store', u0: 0.3, u1: 5.45, name: 'Wellness Solutions', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_white' }, door: { u: 0.3, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#6e1f28', proj: 0.9, drop: 0.45 } },
          { kind: 'store', u0: 5.75, u1: 10.65, name: 'Physical Therapy', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_white' }, door: { u: 0.82, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'PHYSICAL THERAPY', font: 'Inter-700', fg: '#21406f', bg: '#f4f2ee', u0: 5.6, u1: 10.6, y: 3.7, h: 1.0, depth: 0.1 } },
          { kind: 'store', u0: 10.85, u1: 14.85, name: 'Insomnia Cookies', h: 3.5, glazing: { bulkhead: 0.35, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#3a2b5f', proj: 0.9, drop: 0.45 },
            sign: { kind: 'channel', text: 'insomnia cookies', font: 'Montserrat-800', fg: '#f3e9d8', bg: null, u0: 10.9, u1: 14.6, y: 4.1, h: 0.55, depth: 0.06, lit: 'halo' } },
          { kind: 'entrance', u0: 15.2, u1: 17.7, door: { kind: 'glass', w: 1.1, recess: 0.4, transom: 0.7, frame: 'alu_black' } },
          { kind: 'store', u0: 18.15, u1: 23.65, name: 'Essex Organic', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.72, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'shop_food', gate: { kind: 'rolldown', color: '#444648', down: 0 },
            sign: { kind: 'panel', lines: ['ESSEX ORGANIC', 'CONVENIENCE'], font: 'Montserrat-800', fg: '#ffffff', bg: '#16181a', u0: 18.15, u1: 23.65, y: 3.7, h: 1.0 } },
          { kind: 'store', u0: 23.85, u1: 28.5, name: 'Capt Loui', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
            sign: { kind: 'panel', lines: ['CAPT LOUI', 'SEAFOOD BOIL'], font: 'Oswald-700', fg: '#f7f2e8', bg: '#15191c', u0: 23.85, u1: 28.5, y: 3.8, h: 0.95 } },
          { kind: 'store', u0: 28.65, u1: 31.7, name: 'Fresh Hot Pizza', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.7, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
            sign: { kind: 'lightbox', lines: ['FRESH', 'HOT PIZZA $1.50'], font: 'Archivo-900', fg: '#d6262b', bg: '#f7f7f4', u0: 28.65, u1: 30.9, y: 3.85, h: 0.95, depth: 0.2 } },
          { kind: 'store', u0: 31.95, u1: 34.35, name: 'east unit', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 0.95, kind: 'glass', recess: 0.5 }, interior: 'shop_clothing', gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#6e1f28', proj: 0.9, drop: 0.45 } },
        ],
      },
      bays: { widths: [6.4, 4.3, 4.0, 3.7, 4.0, 4.1, 3.7, 4.4] },
      floors: [{ n: 4, h: 3.6, win: 'F', open: [[0.0, 0.85, 'F'], [1.6, 2.45, 'F'], [3.5, 4.4, 'F'], [5.0, 5.9, 'F'], [15.2, 16.2, 'F'], [16.6, 17.6, 'F'], [27.6, 28.6, 'F'], [29.0, 30.0, 'F']] }],
      windows: {
        F: { w: 0.9, h: 2.1, sill: 0.3, kind: 'dh', lights: '1/1', frame: 'alu_bronze', reveal: 0.24,
          lintel: { kind: 'flat', mat: 'brick_painted', tint: '#e2d3b4', h: 0.3, ext: 0.1, proj: 0.04 }, sillStone: { mat: 'cast_stone', tint: '#e2d3b4', h: 0.14, proj: 0.08 }, ac: 0.3, blinds: 0.5, lit: 0.3 },
      },
      oriels: [[6.9, 10.4], [11.0, 14.6], [18.8, 22.0], [22.9, 26.2], [30.2, 33.6]].map(([u0, u1]) => ({ u0, u1, from: 5.25, to: 19.2, depth: 0.7, kind: 'canted', win: 'F', mat: 'brick_red', tint: '#a48a80', cornice: { mat: 'cast_stone', tint: '#e2d3b4' } })),
      bands: [
        { at: 5.0, h: 0.55, proj: 0.05, mat: 'brick_painted', tint: '#e2d3b4' },
        { at: 8.6, h: 0.55, proj: 0.05, mat: 'brick_painted', tint: '#e2d3b4' },
        { at: 12.2, h: 0.55, proj: 0.05, mat: 'brick_painted', tint: '#e2d3b4' },
        { at: 15.8, h: 0.55, proj: 0.05, mat: 'brick_painted', tint: '#e2d3b4' },
        { at: 18.55, h: 0.6, proj: 0.05, mat: 'brick_painted', tint: '#e2d3b4' },
      ],
      fireEscape: [0, 3, 6].map((b) => ({ bays: [b], floors: [1, 4], kind: 'balcony', drop: true })),
      cornice: { kind: 'bracketed', h: 1.3, proj: 0.8, mat: 'wood_painted', tint: '#3a2f2b', brackets: 22 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.45, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.3, 0.6], w: 3, d: 2.5, h: 2.4 }, { k: 'tank', at: [0.75, 0.6], r: 1.9, h: 3.4, legs: 3.0 }] },
    notes: 'Five-storey red-brick apartment row (1900). Elevation 2024-08: salmon brick with cream brick courses at every floor line, canted oriels in five of eight groups, three fire escapes, ' +
      'black bracketed cornice under a frieze of lion-head paterae (not drawn). The shops sit about 4-5 m east of where the first pass put them: wellness unit u 0.3-5.45, ' +
      'Physical Therapy 5.75-10.65, Insomnia Cookies 10.85-14.85, residential door 15.2-17.7, Essex Organic 18.15-23.65, Capt Loui 23.85-28.5, Hot Pizza 28.65-31.7, east unit 31.95-34.35.',
  },
  // ------------------------------------------------------------------ 5-15 W 125th: Nike, T.J.Maxx, DMV (2014)
  // MEASURED (2024-08, shots/ar34/bid4/elev/w125-5.jpg): a ground floor of shops to 3.9 m, a louvre band
  // (3.9-5.0 m) and a silver panel band (to 6.2 m), then a glass wall of eight 1.35 m rows on a 2.9 m grid over u 6.3-29.7 between two full-height frameless
  // glass boxes (u 0.4-5.9 and 30.3-36.4), a silver parapet band 17.0-17.7 m.
  {
    id: 'w125-5', addr: '5-15 W 125th St', name: 'Nike, T.J.Maxx, Department of Motor Vehicles', bin: '1089797',
    at: [2407.26, -2671.52], comp: '4_-6:427', h: 17.7, status: 'measured',
    custom: { fn: 'bid4:glassdeck', with: 'kit' },
    wall: { mat: 'panel_alu', tint: '#d6cbc5', dirt: 0.15, env: 0.45 },   // w2r1b: real panels #c5c5c5, twin #97aab4 (the sky in the metal): less sky, warmer
    faces: [{
      edge: 'front',
      base: {
        h: 3.9,
        fascia: { h: 2.3, mat: 'panel_alu', tint: '#d5d0c9' },   // real band (197,197,197); twin w2r1c (170,184,185): still blue-grey; b3r2 '#d8cdc4' read (197,189,186) warm (193,193,193)
        bays: [
          { kind: 'window', u0: 0.5, u1: 3.9, h: 3.6, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 2, frame: 'alu_clear' }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'entrance', u0: 4.0, u1: 5.8, door: { kind: 'glass', w: 0.9, recess: 0.4, transom: 0.5, frame: 'alu_clear' } },
          { kind: 'window', u0: 6.3, u1: 11.3, h: 3.6, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 3, frame: 'alu_clear' }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'window', u0: 11.7, u1: 17.8, name: 'Nike', h: 3.6, glazing: { bulkhead: 0.25, transom: 0.7, mullions: 5, frame: 'alu_clear' }, interior: 'empty', gate: { kind: 'none' } },   // b2r3: the clothing backdrops hid the posters
          { kind: 'entrance', u0: 18.0, u1: 19.9, door: { kind: 'glass', w: 1.75, recess: 0.3, transom: 0.7, frame: 'alu_clear' } },
          { kind: 'window', u0: 20.1, u1: 29.7, name: 'Nike', h: 3.6, glazing: { bulkhead: 0.25, transom: 0.7, mullions: 7, frame: 'alu_clear' }, interior: 'empty', gate: { kind: 'none' } },
          { kind: 'store', u0: 30.2, u1: 36.4, name: 'T.J.Maxx', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.7, mullions: 3, frame: 'alu_clear' }, door: { u: 0.25, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'shop_clothing', gate: { kind: 'none' } },
        ],
      },
      // the swoosh on the silver band over the Nike entrance, the T.J.Maxx sign over its door
      items: [
        // the two vacant units: kraft paper taped inside the glass (elevation: u -0.6-3.4 and 6.7-9.8, 0.3-2.85 m), matte, behind the panes (the storefront glass is 0.28 m back)
        { k: 'plywood', u0: 0.55, u1: 3.45, y0: 0.32, y1: 2.85, mat: 'plywood', tint: '#d1c29b', chips: 0, w: -0.24 },
        { k: 'plywood', u0: 6.75, u1: 9.8, y0: 0.32, y1: 2.85, mat: 'plywood', tint: '#d1c29b', chips: 0, w: -0.24 },
        // the tenants' banners hung inside the two frameless glass boxes (elevation 2024-08; drawn on the glass, which is opaque here): T.J.maxx, New York & Company outlet, WeWork, DMV
        ...[[1.15, 5.75, 0], [30.45, 33.5, 0.45]].flatMap(([b0, b1, dy]) => [
          { k: 'sign', z: 0.07, sign: { kind: 'panel', text: 'T\u00b7J\u00b7maxx', font: 'Archivo-900', fg: '#ffffff', bg: '#b5121b', u0: b0, u1: b1, y: 12.6 + dy, h: 1.7, depth: 0.02 } },
          { k: 'sign', z: 0.07, sign: { kind: 'panel', text: 'NEW YORK & COMPANY', font: 'Montserrat-600', fg: '#ffffff', bg: '#3a3c40', u0: b0, u1: b1, y: 11.3 + dy, h: 1.1, depth: 0.02, sub: { text: 'OUTLET', font: 'Montserrat-600', fg: '#ffffff', size: 0.2 } } },
          { k: 'sign', z: 0.07, sign: { kind: 'panel', text: 'wework', font: 'DMSerifDisplay', fg: '#ffffff', bg: '#151517', u0: b0, u1: b1, y: 9.65 + dy, h: 1.55, depth: 0.02 } },
          { k: 'sign', z: 0.07, sign: { kind: 'panel', lines: ['Department of', 'Motor Vehicles'], font: 'Inter-700', fg: '#ffffff', bg: '#2f5f9c', u0: b0 + 0.25, u1: b1, y: 6.95 + dy, h: 1.35, depth: 0.02 } },
        ]),
        // (the swoosh, u 17.8-20.05 at 5.0-5.86 m, is geometry in custom/bid4.js glassdeck since batch 2: the painted mark read as a faint thin arc)
        // the sports store's window graphics, inside the glass (z -0.31; the storefront glass is 0.28 m back) over the lower lights (0.35-2.85 m), invented style:
        // west window (u 11.7-17.8): an orange panel, an aerial photograph, a pattern of words, an athlete, big type; east window (20.1-29.7): a sale card, an athlete with vertical type
        ...[[11.85, 12.5, 'postOrange', 0.6, 2.4], [12.55, 13.4, 'postAerial', 0.55, 2.45], [13.45, 14.75, 'postPattern', 0.4, 2.6], [14.8, 16.3, 'postAth1', 0.35, 2.75], [16.35, 17.7, 'postType', 0.35, 2.75],
          [21.0, 21.6, 'postSale', 1.0, 1.75], [23.0, 24.8, 'postAth2', 0.35, 2.75], [25.6, 26.9, 'postType', 0.35, 2.75], [27.2, 28.9, 'postAth1', 0.35, 2.75]].map(([a, b, fn, y0, y1]) =>
          // (b2r3, b2r4: at depth 0.005 the sign kit's face quad (at depth - 0.006) sat behind the panel's back skin and the posters read blank: depth 0.03, back at -0.34)
          ({ k: 'sign', z: -0.34, sign: { kind: 'panel', text: '', fg: '#ffffff', bg: '#1b1b1c', logo: 'bid4:' + fn, logoAt: 'fill', u0: a, u1: b, y: y0, h: y1 - y0, depth: 0.03, lit: 'none', push: false } })),
        { k: 'sign', sign: { kind: 'panel', text: 'T.J.maxx', font: 'Archivo-900', fg: '#ffffff', bg: '#c8102e', u0: 30.5, u1: 33.3, y: 4.85, h: 0.65, depth: 0.1 } },
        // batch 2: the red T.J.maxx blade at the east corner, lettering down the blade
        { k: 'sign', sign: { kind: 'blade', text: '', fg: '#ffffff', bg: '#c8102e', logo: 'bid4:tjBlade', logoAt: 'fill', u0: 36.45, u1: 37.25, y: 9.8, h: 3.2, depth: 0.12 } },
      ],
      glassWall: { zones: [
        { u0: 6.3, u1: 29.7, mullion: 2.9, rows: { y0: 6.2, y1: 17.0, vh: 1.35 } },
        { u0: 0.4, u1: 5.9, mullion: 5.5, rows: { y0: 6.3, y1: 17.0, vh: 10.7 }, mullionW: 0.03, w: 0.03 },
        { u0: 30.3, u1: 36.4, mullion: 6.1, rows: { y0: 6.3, y1: 17.0, vh: 10.7 }, mullionW: 0.03, w: 0.03 },
      // batch 2 (MATS 01:11, lead 01:32): MATS's vision glass (the room behind drawn in the pane's shader); `body` is not used by it
      // KIT 05:26 / MATS 01:11: the panes' rooms on the wall's own floor lines (6.2 + k x 3.6 m, read on the elevation) and one shade bay per pane
      // b3r3: the glass median (181,191,194) (190,199,203): tint '#e2e9ea' x (ratio^0.7)
      ], glass: 'glass_vision', tint: '#e9f0f2', storey: [3.6, 6.2], sheers: 0.45, frame: 'alu_clear', frameTint: '#d2d5d6', mullionW: 0.09 },   // real glass (197,204,206); twin w2r1b (130,162,180), w2r1c (178,190,197); b2r1 (209,218,221) flat
      floors: [],
      piers: { mat: 'panel_alu', tint: '#c6c5c1', env: 0.45, w: 0.55, proj: 0.12, at: [0.15, 6.1, 30.0, 36.6], from: 'base', to: 'cornice', capital: false, base: false },
      cornice: { kind: 'band', h: 0.7, proj: 0.12, mat: 'panel_alu', tint: '#c6c5c1', env: 0.45 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal_painted' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.3, 0.5], n: 4 }, { k: 'bulkhead', at: [0.75, 0.6], w: 6, d: 4, h: 3.0 }] },
    notes: 'Retail building (2014). Elevation 2024-08: shops to 3.9 m (two boarded units, Nike with a double door at u 18-20, T.J.Maxx at the east end), a louvre band, ' +
      'a silver panel band with the Nike swoosh, an eight-row glass wall on a 2.9 m grid between two frameless glass boxes carrying the T.J.Maxx / New York & Company / ' +
      'WeWork / DMV banners (not drawn yet).',
  },
  // ------------------------------------------------------------------ 1 W 125th: Fifth Avenue corner (NW): Shake Shack, PLS, Pantry Plus, Advanced Dermatology
  // MEASURED (2026-08, shots/ar34/bid4/elev/w125-1.jpg), u from the west end: grey painted stucco, a ground floor of shops to 4.3 m under a continuous sign
  // band (3.4-5.6 m), a second floor of window ribbons (glass 6.3-8.4 m) at u 15.8-19.4, 21.3-24.2, 26.2-29.8, 31.4-33.1 (the part west of u 15 is hidden by a tree: windows copied at the same 2.9 m pitch,
  // not verified), a roof at 9.2 m and a raised block over u 22.4-33.1 to 13.0 m carrying the Missy, HAIR, PLS, Offices Coworking and Regus signs. Shops: Missy Hair Boutique (u 0.2-3.4), Advanced Dermatology
  // (3.6-8.0, white sign 2.5-8.4 m), Harlem Market Pantry Plus (8.4-14.4), PLS Check Cashing (16.2-22.3, black sign 17.5-22.2 m), the '15' lobby, a geometric mural (22.6-27.0), Shake Shack (25.6-33.1 and round the corner).
  {
    id: 'w125-1', addr: '1 W 125th St', name: 'Shake Shack, PLS Check Cashing, Harlem Market Pantry Plus, Advanced Dermatology', bin: '1053504',
    at: [2425.83, -2634.46], comp: '4_-6:260', h: 9.2, status: 'measured',
    custom: { fn: 'bid4:raised1', with: 'kit' },
    wall: { mat: 'stucco', tint: '#a8a8a6', dirt: 0.4 },
    faces: [
      {
        edge: 'front',
        base: {
          h: 4.3,
          piers: { at: [3.5, 8.2, 14.6, 22.4, 25.3], w: 0.6, mat: 'stucco', tint: '#9c9c9a', proj: 0.06 },
          bays: [
            { kind: 'store', u0: 0.3, u1: 3.3, name: 'Missy Hair Boutique', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 0.9, kind: 'glass', recess: 0.4 }, interior: 'shop_clothing', gate: { kind: 'none' }, awning: { kind: 'fixed', color: '#7a1e2a', proj: 0.8, drop: 0.45 } },
            { kind: 'store', u0: 3.8, u1: 8.0, name: 'Advanced Dermatology', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.4, mullions: 3, frame: 'alu_black' }, door: { u: 0.25, w: 1.0, kind: 'glass', recess: 0.5 }, interior: 'pharmacy', gate: { kind: 'none' } },
            { kind: 'store', u0: 8.4, u1: 14.4, name: 'Harlem Market Pantry Plus', h: 3.6, glazing: { bulkhead: 0.5, transom: 0.4, mullions: 4, frame: 'alu_black' }, door: { u: 0.75, w: 1.0, kind: 'glass', recess: 0.4 }, interior: 'shop_food', gate: { kind: 'rolldown', color: '#8f9193', down: 0.5 } },
            { kind: 'entrance', u0: 14.9, u1: 16.0, door: { kind: 'glass', w: 0.9, recess: 0.3, transom: 0.5, frame: 'alu_black' } },
            { kind: 'store', u0: 16.3, u1: 22.0, name: 'PLS Check Cashing', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 4, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'double', recess: 0.5 }, interior: 'bank', gate: { kind: 'none' } },
            { kind: 'store', u0: 25.7, u1: 33.1, name: 'Shake Shack', h: 3.7, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.78, w: 1.0, kind: 'double', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' } },
          ],
        },
        items: [
          { k: 'sign', sign: { kind: 'panel', lines: ['ADVANCED DERMATOLOGY', 'Medical, Cosmetic & Surgical Dermatology'], font: 'Inter-700', fg: '#27508c', bg: '#f4f4f4', u0: 2.5, u1: 8.4, y: 3.95, h: 1.35, depth: 0.08 } },
          // SIGNS (ar34-req/BID4.md 19:05): coloured letters on a black backer cut round them, two lines as two signs
          { k: 'sign', sign: { kind: 'channel', bg: '#0e0e10', bgShape: 'contour', bgPad: 0.12, depth: 0.05, lit: 'face', u0: 9.2, u1: 14.0, y: 4.78, h: 0.47,
            runs: [{ text: 'HARLEM ', font: 'Archivo-900', fg: '#2f6fe0' }, { text: 'MARKET', font: 'Archivo-900', fg: '#f0522d' }] } },
          { k: 'sign', sign: { kind: 'channel', bg: '#0e0e10', bgShape: 'contour', bgPad: 0.12, depth: 0.05, lit: 'face', u0: 9.6, u1: 13.6, y: 4.3, h: 0.45,
            runs: [{ text: 'PANTRY ', font: 'Archivo-900', fg: '#e8283a' }, { text: 'Plus', font: 'KaushanScript', fg: '#ffffff' }] } },
          { k: 'sign', sign: { kind: 'panel', text: '', font: 'Archivo-900', fg: '#42b649', bg: '#101012', u0: 15.2, u1: 17.4, y: 4.0, h: 0.85, depth: 0.1, logo: 'bid4:pls', logoAt: 'fill' } },
          { k: 'sign', sign: { kind: 'panel', lines: ['CHECK CASHING', 'FREE MONEY ORDERS'], font: 'Inter-800', fg: '#ffffff', bg: '#101012', u0: 17.4, u1: 22.3, y: 3.85, h: 1.1, depth: 0.1 } },
          { k: 'sign', sign: { kind: 'painted', text: '', logo: 'bid4:mural', logoAt: 'fill', bg: null, u0: 22.6, u1: 25.4, y: 3.9, h: 1.8 } },
          // SIGNS (19:05): white channel letters on a black slatted fascia, the menu line painted on the band below
          { k: 'sign', sign: { kind: 'channel', text: 'SHAKE SHACK', font: 'Montserrat-500', fg: '#f6f6f4', bg: '#111113', bgRibs: 0.1, depth: 0.06, lit: 'face', fill: 0.5, u0: 25.5, u1: 33.1, y: 3.95, h: 1.65 } },
          { k: 'sign', sign: { kind: 'painted', text: 'BURGERS  FROZEN CUSTARD  FRIES  SHAKES  HOT DOGS  CONCRETES  SODA  FLOATS', font: 'Inter-700', fg: '#ffffff', bg: '#111113', u0: 25.5, u1: 33.1, y: 3.5, h: 0.42 } },
        ],
        bays: { widths: [1.3, 2.9, 3.0, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9, 2.9] },
        floors: [{ n: 1, h: 4.9, win: 'Off', open: [[1.4, 3.1, 'Off'], [4.2, 7.2, 'Off'], [8.2, 11.0, 'Off'], [11.9, 14.7, 'Off'], [15.8, 19.4, 'Off'], [21.3, 24.2, 'Off'], [26.2, 29.8, 'Off'], [31.4, 33.0, 'Off']] }],
        windows: { Off: { sill: 2.0, h: 2.1, kind: 'ribbon', mullions: 1, frame: 'alu_black', glass: 'glass_clear', reveal: 0.2, lintel: null, sillStone: { mat: 'cast_stone', tint: '#a9a8a2', h: 0.1, proj: 0.05 }, ac: 0, blinds: 0.7, lit: 0.4 } },
        cornice: { kind: 'band', h: 0.5, proj: 0.15, mat: 'cast_stone', tint: '#a9a8a2' },
      },
      {
        edge: 'corner',
        base: {
          h: 4.6,
          bays: [{ kind: 'store', u0: 0.8, u1: 11.0, name: 'Shake Shack', h: 3.7, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.2, w: 1.0, kind: 'double', recess: 0.5 }, interior: 'restaurant', gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'SHAKE SHACK', font: 'Montserrat-700', fg: '#ffffff', bg: '#111213', u0: 0.8, u1: 11.0, y: 3.8, h: 1.1, depth: 0.15 } }],
        },
        bays: { n: 6, margin: [1.0, 1.0] },
        floors: [{ n: 1, h: 4.6, win: 'Off' }],
        windows: { Off: { w: 2.2, h: 2.1, sill: 2.0, kind: 'fixed', mullions: 1, frame: 'alu_black', reveal: 0.2, lintel: null, sillStone: null, ac: 0, blinds: 0.7, lit: 0.4 } },
        cornice: { kind: 'band', h: 0.5, proj: 0.15, mat: 'cast_stone', tint: '#a9a8a2' },
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'cast_stone' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.3, 0.5], n: 3 }] },
    notes: 'Fifth Avenue NW corner, two storeys of grey painted stucco with a raised three-storey block over the east third (bid4:raised1). Elevation 2026-08 (above). Fifth Avenue face not measured.',
  },
];
