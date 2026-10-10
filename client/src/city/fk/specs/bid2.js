// AR33 building specs, segment bid2: Frederick Douglass to Adam Clayton Powell Jr. Boulevard (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/bid2.json).
// Owner: the BID2 worker (docs/notes/ar33-bid2.md). Measured off rectified facade elevations sampled from the newest
// every sign is drawn from scratch.
// u runs from the face's left end as seen from the street: the WEST end on the north side, the EAST end on the south.

// the typical Harlem sash: 1/1 double hung, a painted frame, a stone sill, a flat lintel
const DH = (o = {}) => ({ w: 1.0, h: 1.75, sill: 0.85, kind: 'dh', lights: '1/1', frame: 'alu_bronze', reveal: 0.13,
  lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d4cebf', h: 0.2 }, sillStone: { mat: 'stone_lime', tint: '#d0cabb', h: 0.09, proj: 0.045 },
  ac: 0.15, blinds: 0.55, lit: 0.35, ...o });
const STORE = (u0, u1, o = {}) => ({ u0, u1, kind: 'store', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.3, mullions: 2, frame: 'alu_clear' },
  door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.6 }, gate: { kind: 'rolldown', box: true, color: '#9aa0a3' }, interior: 'shop_clothing', lit: 1.0, ...o });

// AR34 wave 2: every flat roof `dirt: 0.7` and `clutter` in three classes read off bid2_top: 0.6 sparse, 1.2 some, 2.0 crowded items per 100 m2 (the
// crowded class checked by counting units on three roofs at 0.255 m/px: 2310's north part ~2.4, Blumstein's ~1.9, 208's
// ~2.7 per 100 m2; the others by eye)
export default [
  // =================================================================== NORTH SIDE, west to east
  {
    id: 'fdb-2330', addr: '2330 Frederick Douglass Blvd', name: 'corner building, 125th Street and Frederick Douglass Boulevard', bin: '1058652',
    at: [1730, -3023.28], comp: '3_-6:161', h: 17.1, status: 'measured',
    wall: { mat: 'brick_red', tint: '#94513f', dirt: 0.35, bond: 'running' },
    faces: [{
      edge: 'front',
      // a band of large silver
      // metal panels 3.4-5.0 m over black-framed shop glass, a black corner entrance on the boulevard, boost mobile's
      // orange sign at the east end; tags on the piers
      base: { h: 5.0, wall: { mat: 'panel_alu', tint: '#c3c6c8', dirt: 0.3 }, piers: { at: [0.35, 9.6, 18.9, 28.2, 37.3], w: 0.55, mat: 'granite_grey', tint: '#3a3a3c', proj: 0.05 },
        bays: [STORE(0.7, 9.3, { h: 3.4, interior: { kind: 'shop_food', tone: '#2b2b2d', lit: 0.4 }, gate: { kind: 'none' }, glazing: { bulkhead: 0.15, transom: 0, mullions: 2, frame: 'alu_black' }, door: { u: 0.25, w: 1.8, kind: 'double', recess: 0.4 } }),
          STORE(9.9, 18.6, { h: 3.4, interior: { kind: 'empty', tone: '#2b2b2d', lit: 0.2 }, gate: { kind: 'none' }, glazing: { bulkhead: 0.15, transom: 0, mullions: 3, frame: 'alu_black' } }),
          STORE(19.2, 27.9, { h: 3.4, interior: { kind: 'empty', tone: '#2b2b2d', lit: 0.2 }, gate: { kind: 'none' }, glazing: { bulkhead: 0.15, transom: 0, mullions: 3, frame: 'alu_black' } }),
          STORE(28.5, 37.0, { name: 'Boost Mobile', h: 3.4, interior: 'shop_phone', gate: { kind: 'none' }, glazing: { bulkhead: 0.15, transom: 0, mullions: 2, frame: 'alu_black' },
            sign: { kind: 'panel', text: 'boost', font: 'Montserrat-800', fg: '#ffffff', bg: '#f26522', u0: 33.4, u1: 36.9, y: 3.5, h: 1.3, fill: 0.5, lit: 'face', sub: { text: 'mobile', font: 'Montserrat-600', size: 0.16 } } })] },
      graffiti: [{ u0: 18.6, u1: 19.2, y0: 0.3, y1: 3.0, density: 0.8, style: 'tags', seed: 2330 }, { u0: 27.9, u1: 28.5, y0: 0.3, y1: 3.0, density: 0.8, style: 'tags', seed: 2331 }],
      // AR34, measured on the mosaic elevation north_m0 (20 px/m): seven pairs of 1.0 m sashes, pair centres every 5.0 m
      // from 2.25, a single sash at 35.45; the third and fourth floors' windows 9.0-11.0 and 12.75-14.75, the second
      // floor's green steel windows 5.5-7.5; blind strips between the pairs
      bays: { widths: [0.75, 1.5, 1.5, 2.0, 1.5, 1.5, 2.0, 1.5, 1.5, 2.0, 1.5, 1.5, 2.0, 1.5, 1.5, 2.0, 1.5, 1.5, 2.0, 1.5, 1.5, 0.95, 1.5, 1.5] },
      // the second floor: seven continuous green steel windows ~3.9 m wide under the pairs
      floors: [{ n: 1, h: 3.2, win: 'F', open: [[0.35, 4.15, 'F'], [5.35, 9.15, 'F'], [10.35, 14.15, 'F'], [15.35, 19.15, 'F'], [20.35, 24.15, 'F'], [25.35, 29.15, 'F'], [30.35, 34.15, 'F']] },
        { n: 2, h: 3.75, win: 'P', bays: [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22] }],
      windows: {
        F: { w: 3.8, h: 2.0, sill: 0.5, kind: 'fixed', mullions: 3, transom: 0.6, frame: { mat: 'steel_black', tint: '#274236' }, reveal: 0.16, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d2cbbb', h: 0.3 } },
        P: DH({ w: 1.0, h: 2.0, sill: 0.8, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d2cbbb', h: 0.26 } }),
      },
      bands: [{ at: 'base', h: 0.45, proj: 0.12, mat: 'stone_lime', tint: '#cdc6b6' }, { at: 'floor:3', h: 0.2, proj: 0.06, mat: 'stone_lime', tint: '#cdc6b6' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.25, mat: 'stone_lime', tint: '#cfc8b8' },
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 1.8, coping: 'stone_lime' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.7, 0.4], w: 3.4, d: 2.6, h: 2.8 }, { k: 'hvac', at: [0.25, 0.5], n: 6 }] },   // AR34: off (10/11/2024): a dark roof, HVAC on the west half
    refs: [],
    notes: 'Red brick, stone bands; the second floor has wide green steel shop windows in groups, two storeys of ' +
      'paired 1/1 sashes over it. Ground floor under a construction fence in 2024-08 (a fish market sign at the east ' +
      'end, boost mobile). The avenue face is BID1\'s side of the corner; its shops are not resolved yet. Bays and ' +
      'window heights measured on north_m0 (AR34); the shop bays are still the earlier estimate.',
  },
  {
    id: 'w125-261', addr: '261 W 125th St', name: 'Banana Republic Factory Store, Blick Art Materials', bin: '1089941',
    at: [1762.91, -3002.85], comp: '3_-6:100', h: 12.9, status: 'measured',
    ring: [[1783.25, -3008.87], [1768.75, -2982.41], [1742.07, -2997.09], [1756.57, -3023.56]],   // the east wall 0.57 m west: the Apollo's real front is 15.15 m
    wall: { mat: 'ribbed', tint: '#4b4c4e', dir: 'h', pitch: 0.3, dirt: 0.25 },   // AR34: horizontal lap panels
    faces: [{
      edge: 'front',
      base: { h: 4.4, fascia: { h: 0.9, mat: 'panel_alu', tint: '#c9cccd' },
        // AR34, measured on the mosaic elevation north_m1 (20 px/m, u = strip + 31): Fresh Fish Live Lobster u 0.75-4.5,
        // the upstairs entrance, Banana Republic Factory Store u 9.25-22.75 (its signband the same), BLICK u 22.75-28.0, a
        // dark panel with BLICK's vertical sign to the Apollo (the earlier layout had BLICK west of Banana Republic)
        bays: [
          STORE(0.4, 4.8, { name: 'Fresh Fish Live Lobster', h: 4.2, glazing: { bulkhead: 0.3, transom: 0, mullions: 2, frame: 'alu_black' }, door: { u: 0.7, w: 1.0, kind: 'glass', recess: 0.4 }, gate: { kind: 'none' }, interior: 'shop_food',
            sign: { kind: 'panel', lines: ['FRESH FISH', 'LIVE LOBSTER'], font: 'Oswald-600', fg: '#ffffff', bg: '#2e6f68', u0: 0.6, u1: 4.6, y: 4.45, h: 0.85, lit: 'face' } }),
          { u0: 5.2, u1: 6.6, kind: 'entrance', door: { kind: 'glass', w: 1.1, recess: 0.6, h: 2.4, transom: 0.6 } },
          { u0: 6.8, u1: 8.9, kind: 'wall' },
          STORE(9.25, 22.6, { name: 'Banana Republic Factory Store', h: 4.2, glazing: { bulkhead: 0.15, transom: 0, mullions: 5, frame: 'alu_black' }, door: { u: 0.5, w: 1.9, kind: 'double', recess: 0.3 }, gate: { kind: 'none' },
            sign: { kind: 'channel', text: 'BANANA REPUBLIC  FACTORY STORE', font: 'LibreBaskerville-400', fg: '#3a3b3d', u0: 9.5, u1: 22.3, y: 4.45, h: 0.75, lit: 'halo' } }),
          STORE(22.9, 27.9, { name: 'Blick Art Materials', h: 4.2, glazing: { bulkhead: 0.2, transom: 0, mullions: 2, frame: 'alu_black' }, door: { u: 0.7, w: 1.1, kind: 'glass', recess: 0.4 }, gate: { kind: 'none' }, interior: 'shop_food',
            sign: { kind: 'channel', text: 'BLICK', font: 'Arimo-700', fg: '#e31b23', u0: 23.2, u1: 27.6, y: 4.45, h: 0.8, lit: 'face', sub: { text: 'art materials', font: 'Arimo-700', fg: '#ffffff', size: 0.45 } } }),
          { u0: 28.2, u1: 30.7, kind: 'wall' },
        ] },
      bays: { n: 1, margin: [0.5, 0.5] },
      floors: [{ n: 1, h: 3.0, win: 'S' }, { n: 1, h: 4.6, win: 'G' }],
      // the strip window 5.5-6.85 m over u 0.75-29.75, the glass band 8.1-12.4 m over u 1.5-25.2 (north_m1)
      windows: { S: { kind: 'ribbon', w: 29.0, h: 1.35, sill: 0.2, frame: 'alu_black', mullions: 18, glass: 'glass_grey' },
        G: { kind: 'ribbon', w: 23.7, h: 4.1, sill: 0.0, frame: 'alu_black', mullions: 8, du: -2.15, glass: 'glass_grey' } },
      items: [{ k: 'sign', sign: { kind: 'channel', lines: ['BANANA', 'REPUBLIC', 'FACTORY STORE'], font: 'LibreBaskerville-400', fg: '#f2f2ef', u0: 26.4, u1: 30.2, y: 9.2, h: 2.0, lit: 'halo' } }],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'white', items: [{ k: 'hvac', at: [0.5, 0.5], n: 4 }] },
    refs: [],
    notes: 'The 2013 retail building: dark grey horizontal lap panels, a full-width glass band over the store with a ' +
      'Banana Republic graphic ("#HARLEMLOVE") inside it, a strip of windows under it, BANANA REPUBLIC FACTORY STORE ' +
      'in serif channel letters at the east end, Blick (red BLICK, white "art materials") in the east bay. Its compiled ' +
      'east end overlaps the Apollo\'s real front by 0.57 m (the Apollo is built from u -0.57). Draft: the glass band ' +
      'needs the kit\'s curtain wall; the graphic is left out (a real ad).',
  },
  {
    id: 'w125-253', addr: '253 W 125th St', name: 'Apollo Theater', bin: '1058654',
    at: [1787.58, -3000.32], comp: '3_-6:281', h: 20.05, status: 'measured',
    custom: 'bid2:apollo',           // the whole lot: the lobby building's terracotta front, the marquee, the blade, the rooftop frame, the auditorium behind
    letters: { font: 'Jost-600' },   // the blade's and the crests' letters (city/w125cKit.js chanNeon): named here so the sign kit loads the face
    wall: { mat: 'brick_tan', tint: '#9b8a74', dirt: 0.4 },
    refs: [],
    notes: 'Measured in docs/notes/ar33-bid2.md. The front is 15.15 m (u -0.57 .. 14.58), 13.9 m to the balustrade top; ' +
      'the auditorium behind at the compiled 20.05. The marquee depth is the least certain number (5.2 m used).',
  },
  {
    id: 'w125-243', addr: '243 W 125th St', name: 'GameStop, Ballers, Portabella; Cinderella Eyebrows', bin: '1058655',
    at: [1798.12, -2980.51], comp: '3_-6:163', h: 15.3, status: 'measured',
    wall: { mat: 'brick_painted', tint: '#e7e3d8', dirt: 0.45, bond: 'running' },
    faces: [{
      edge: 'front',
      base: {
        h: 5.0,
        piers: { at: [0.12, 5.08, 10.0, 12.35, 22.75], w: 0.28, mat: 'brick_painted', tint: '#d8d4c8', proj: 0.04 },
        bays: [
          STORE(0.3, 4.9, { name: 'GameStop', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 1, frame: 'alu_black' }, door: { u: 0.72, w: 1.0, recess: 0.9 }, interior: 'shop_phone',
            sign: { kind: 'channel', text: 'GameStop', font: 'Montserrat-900', italic: true, fg: '#e3161d', trim: '#f2f2f0', ret: '#b8141a', bg: '#101112',
              u0: 0.3, u1: 4.9, y: 3.45, h: 0.95, depth: 0.1, lit: 'face', fill: 0.62, tracking: -0.01 } }),
          STORE(5.3, 9.85, { name: 'Ballers', h: 3.45, glazing: { bulkhead: 0.25, transom: 0.35, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 1.1, kind: 'double', recess: 0.5 },
            // SIGNS 19:08: dimensional cream letters with a shadow under each on the grey framed panel (as flat
            // paint on the panel they nearly vanished): channel letters on a backer
            sign: { kind: 'channel', text: 'BALLERS', font: 'ArchivoBlack', fg: '#efe4c8', ret: '#b9ab86', bg: '#c3c4c0', depth: 0.05, lit: 'none', fill: 0.62, tracking: 0.06, u0: 5.3, u1: 9.85, y: 3.5, h: 0.85 } }),
          { u0: 10.15, u1: 12.2, kind: 'entrance', door: { kind: 'glass', w: 1.0, recess: 0.9, h: 2.3, transom: 0.6 },
            sign: { kind: 'panel', text: 'DREADLOCKS', font: 'Oswald-600', fg: '#1d1d1d', bg: '#e8e2cf', u0: 10.4, u1: 12.0, y: 2.45, h: 0.38, fill: 0.6 } },
          STORE(12.5, 22.6, { name: 'Portabella', h: 3.5, glazing: { bulkhead: 0.2, transom: 0.0, mullions: 4, frame: 'alu_clear' }, door: { u: 0.55, w: 1.8, kind: 'double', recess: 0.35 }, interior: 'shop_clothing',
            // SIGNS 19:08: the name fills ~60 % of the panel, set 'PORTAbella' in a wide geometric face
            sign: { kind: 'panel', text: 'PORTAbella', font: 'Poppins-500', fg: '#f4f4f2', bg: '#16181d', frame: '#101114', u0: 12.5, u1: 22.6, y: 3.55, h: 0.8, fill: 0.95, tracking: 0.3, lit: 'face',
              sub: { text: 'W E A R      2 4 3      S H O E S', font: 'Montserrat-500', size: 0.18 } } }),
        ],
      },
      bays: { n: 9, margin: [0.25, 0.44] },
      floors: [{ n: 1, h: 3.4, win: 'A' }, { n: 1, h: 3.4, win: 'B' }, { n: 1, h: 3.2, win: 'C' }],
      windows: {
        A: DH({ w: 0.98, h: 1.85, sill: 0.9, lintel: { kind: 'flat', mat: 'brick_painted', tint: '#dedace', h: 0.18 }, sillStone: { mat: 'stone_lime', tint: '#dcd7cb', h: 0.08, proj: 0.04 }, ac: 0.3 }),
        B: DH({ w: 0.98, h: 1.8, sill: 0.8, lintel: { kind: 'flat', mat: 'brick_painted', tint: '#dedace', h: 0.18 }, sillStone: { mat: 'stone_lime', tint: '#dcd7cb', h: 0.08, proj: 0.04 }, ac: 0.15 }),
        C: DH({ w: 0.98, h: 1.75, sill: 0.5, lintel: { kind: 'flat', mat: 'brick_painted', tint: '#dedace', h: 0.18 }, sillStone: { mat: 'stone_lime', tint: '#dcd7cb', h: 0.08, proj: 0.04 }, ac: 0.2 }),
      },
      bands: [{ at: 'base', h: 0.3, proj: 0.05, mat: 'brick_painted', tint: '#e0dcd0' }, { at: 8.45, h: 0.14, proj: 0.03, mat: 'brick_painted', tint: '#e2ddd2' }, { at: 11.85, h: 0.14, proj: 0.03, mat: 'brick_painted', tint: '#e2ddd2' }],
      cornice: { kind: 'bracketed', h: 1.35, proj: 0.62, mat: 'metal_painted', tint: '#2c2b29', brackets: 12, chips: 0.1 },
      items: [
        { k: 'sign', sign: { kind: 'channel', bg: '#1d3990', logo: 'bid2:spa', logoAt: 'right', runs: [
          { text: 'Cinderella', font: 'Poppins-800', italic: true, fg: '#f4c600', ret: '#c89e00' },
          { text: 'EYEBROWS', font: 'ArchivoBlack', fg: '#f7f7f4', ret: '#cfcfcb', gap: 0.35 }], u0: 0.2, u1: 8.3, y: 7.2, h: 0.95, depth: 0.03, lit: 'none', fill: 0.8 } },   // fill 0.62 -> 0.8: SIGNS 19:14 (sg_cind_r2)
        { k: 'sign', sign: { kind: 'blade', text: 'BALLERS', font: 'Archivo-800', fg: '#d9c9a0', bg: '#f1efe8', u0: 9.95, u1: 10.9, y: 4.9, h: 3.4, lit: 'face' } },
        { k: 'sign', sign: { kind: 'panel', logo: 'bid2:suit', logoAt: 'fill', bg: '#15171b', frame: '#0e0f12', u0: 18.9, u1: 20.5, y: 4.55, h: 4.0, lit: 'none' } },
        { k: 'sign', sign: { kind: 'panel', logo: 'bid2:suit', logoAt: 'fill', bg: '#15171b', frame: '#0e0f12', u0: 21.2, u1: 22.75, y: 4.55, h: 4.0, lit: 'none' } },
        { k: 'sign', sign: { kind: 'painted', text: 'DREADLOCK', font: 'Oswald-600', fg: '#8a2a1f', bg: '#d9c68a', u0: 17.2, u1: 22.7, y: 11.0, h: 0.8, fill: 0.4 } },
      ],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.9, coping: 'alu_clear' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.62, 0.55], w: 3.0, d: 2.4, h: 2.7 }, { k: 'hvac', at: [0.3, 0.4], n: 2 }] },   // AR34: off (10/11/2024): a light grey roof
    refs: [],
    notes: 'White painted brick, four storeys, nine bays at a 2.465 m pitch (window centres 1.48 + 2.465 k), 0.98 x ' +
      '1.75-1.85 m 1/1 sashes in dark bronze frames; thin painted bands at 8.45 and 11.85; a dark bracketed metal ' +
      'cornice 15.0-16.4. Shops (2024-08) west to east: GameStop, BALLERS, a narrow door to the upstairs (a DREADLOCKS ' +
      'salon), PORTABELLA (menswear, WEAR 243 SHOES). Cinderella EYEBROWS spa: a navy backer across the west half of the ' +
      'second floor; two Portabella suit banners at the east end; a faded yellow DREADLOCK sign on the third floor. The ' +
      'sign specs follow SIGN\'s calibration board (tools/ar33/signs/boardSpecs.js).',
  },
  {
    id: 'w125-239', addr: '239 W 125th St', name: 'Jimmy Jazz', bin: '1058656',
    at: [1816.16, -2973.11], comp: '3_-6:267', h: 10.1, status: 'draft',
    custom: { fn: 'bid2:jimmyjazz', with: 'kit' },   // the folded copper panels over the kit's face
    wall: { mat: 'panel_alu', tint: '#b8805a', dirt: 0.15 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [STORE(0.4, 15.5, { name: 'Jimmy Jazz', h: 4.2, glazing: { bulkhead: 0.1, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.35, w: 2.0, kind: 'double', recess: 1.2 }, gate: { kind: 'none' } })] },
      floors: [{ n: 1, h: 5.0, win: 'G' }],
      windows: { G: { kind: 'ribbon', w: 12.8, h: 2.7, sill: 0.9, frame: 'alu_black', frameW: 0.03, mullions: 2, du: 0.0 } },   // AR34: near-frameless glass
      items: [{ k: 'sign', sign: { kind: 'channel', text: 'JIMMY JAZZ', font: 'Montserrat-800', fg: '#f7f7f5', u0: 1.6, u1: 14.4, y: 4.45, h: 1.35, fill: 0.92, depth: 0.12, lit: 'face', tracking: 0.04 }, z: 0.3 }],   // AR34: the letters 1.25 m, bold, standing off the folded panels
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 0.6, parapet: { h: 0.4, coping: 'alu_clear' }, membrane: 'white' },
    refs: [],
    notes: 'Two storeys clad in copper-coloured folded perforated metal panels (a pyramid relief pattern, ~1.2 x 0.6 m ' +
      'units), a full-width glass band on the second floor with mannequins behind it and five spotlights on arms, ' +
      'JIMMY JAZZ in white channel letters, glass storefront. Needs a MATS folded-panel set or a custom panel builder.',
  },
  {
    id: 'w125-233', addr: '233 W 125th St', name: 'The Victoria (the Victoria Theater front and the tower)', bin: '1058657',
    at: [1845.24, -2986.24], comp: '3_-6:69', h: 101.5, status: 'measured',
    custom: 'bid2:victoria',          // the 1917 theatre front, the gold marquee, the VICTORIA blade, the podium and the glass tower
    refs: [],
    notes: 'Custom builder (fk/custom/bid2.js victoria): the 1917 Victoria Theater front ' +
      '(terracotta, 15.4 m, two giant Ionic columns and end pilasters, bronze windows 6.0-8.4 and 9.2-11.4, frieze 11.6-12.6, ' +
      'cornice 12.6-13.2, balustrade 13.2-14.0 with sculpture groups over the columns), the VICTORIA bulb blade (u 7.0-9.3, ' +
      '4.8-16.8, gold with a crest), the gold bulb marquee (3.1-5.1, Renaissance New York Harlem Hotel), the glass tower ' +
      'set back behind it.',
  },
  {
    id: 'w125-219', addr: '219 W 125th St', name: 'Factory Outlet', bin: '1058658',
    at: [1842.07, -2957.09], comp: '3_-6:155', h: 11.0, status: 'draft',
    wall: { mat: 'stucco', tint: '#e9e8e3', dirt: 0.25 },
    faces: [{
      edge: 'front',
      // AR34: the black panel sits right over the shuttered store, its centre ~4.4 m; the store 3.1 m
      base: { h: 5.2, bays: [STORE(1.0, 14.6, { name: 'Factory Outlet', h: 3.1, gate: { kind: 'rolldown', box: true, color: '#b9bcbe', down: 0.2 },
        sign: { kind: 'channel', lines: ['FACTORY', 'OUTLET'], font: 'Montserrat-800', fg: '#ffffff', bg: '#1c1d20', u0: 3.8, u1: 11.8, y: 3.2, h: 2.6, lit: 'face' } })] },
      floors: [],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 0.6, parapet: { h: 0.5, coping: 'alu_clear' }, membrane: 'white' },
    refs: [],
    notes: 'A plain white rendered box with a dark sign panel (FACTORY OUTLET in white capitals, partly seen) over a ' +
      'shuttered store. Height estimated.',
  },
  {
    id: 'w125-215', addr: '215 W 125th St', name: 'Bank of America (the 1971 office building)', bin: '1058659',
    at: [1876.9, -2957.07], comp: '3_-6:176', h: 19.3, status: 'measured',
    wall: { mat: 'concrete_precast', tint: '#e4e3de', dirt: 0.3 },
    faces: [{
      edge: 'front',
      // AR34, measured on the mosaic elevation north_m3 (zoomed: 30 px/m): five window rows over the shops (sills at 4.5,
      // 7.3, 10.2, 12.6, 15.3 m: a 2.7 m storey from 4.3), the parapet band 17.8-19.2; each 4.87 m module of the precast
      // grid holds a narrow, a wide and a narrow window (0.75 / 2.05 / 0.75 m) between deep fins
      base: { h: 3.9, fascia: { h: 0.4, mat: 'concrete_precast', tint: '#e8e7e2' },
        // the shops off north_m3: PNC at the west end (u 1.3-6.3), Bank of America's red band at the east end
        bays: [STORE(0.6, 9.0, { name: 'PNC Bank', h: 3.0, interior: 'bank', glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_clear' }, door: { u: 0.8, w: 1.8, kind: 'double', recess: 0.6 }, gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'PNC', font: 'Inter-800', fg: '#1d1d1b', bg: '#ffffff', u0: 1.3, u1: 6.3, y: 3.05, h: 0.75, fill: 0.6, lit: 'face' } }),
          STORE(9.4, 26.8, { interior: 'shop_phone', h: 3.0 }),
          STORE(27.2, 42.9, { name: 'Bank of America', h: 3.0, interior: 'bank', glazing: { bulkhead: 0.3, transom: 0.0, mullions: 5, frame: 'alu_clear' }, door: { u: 0.2, w: 1.8, kind: 'double', recess: 0.8 }, gate: { kind: 'none' },
            sign: { kind: 'panel', text: 'Bank of America', font: 'Inter-600', fg: '#ffffff', bg: '#d52b1e', u0: 28.0, u1: 38.0, y: 3.05, h: 0.8, lit: 'face' } })] },
      bays: { n: 14, margin: [0.4, 0.4] },
      floors: [{ n: 5, h: 2.7, win: 'W', open: (() => { const o = []; for (let m = 0; m < 8; m++) { const a = 2.27 + m * 4.87; o.push([a, a + 0.75, 'N'], [a + 1.1, a + 3.15, 'W'], [a + 3.5, a + 4.25, 'N']); } return o; })() }],
      windows: { W: { w: 2.05, h: 2.0, sill: 0.2, kind: 'fixed', mullions: 1, frame: 'alu_black', reveal: 0.35, lintel: { kind: 'none' }, sillStone: null },
        N: { w: 0.75, h: 2.0, sill: 0.2, kind: 'fixed', frame: 'alu_black', reveal: 0.35, lintel: { kind: 'none' }, sillStone: null } },
      piers: { mat: 'concrete_precast', tint: '#ecebe6', w: 0.35, proj: 0.25, at: (() => { const a = []; for (let m = 0; m <= 8; m++) a.push(2.27 + m * 4.87 - 0.31); return a; })(), from: 'base', to: 'cornice' },
      cornice: { kind: 'parapet', mat: 'concrete_precast', tint: '#e4e3de' },   // AR34: the wall's own material (the kit default is chipped metal_painted)
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 1.0, coping: 'alu_clear' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.55, 0.45], w: 14, d: 11, h: 3.4 }, { k: 'hvac', at: [0.2, 0.3], n: 3 }] },   // AR34: off (10/11/2024): a white roof, a big screened plant enclosure in the middle
    refs: [],
    notes: 'The 1971 office block: a white precast grid, recessed dark windows, Bank of America at the west end of the ' +
      'ground floor. Bay count and floor heights to be measured on an elevation.',
  },
  {
    id: 'acp-2100', addr: '2100 Adam Clayton Powell Jr Blvd', name: 'FedEx Office, KFC, Citibank, T-Mobile', bin: '1058660',
    at: [1906.07, -2923.05], comp: '3_-6:254', h: 17.2, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#c8b99c', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: { h: 5.0, fascia: { h: 0.8, mat: 'panel_alu', tint: '#dfe0e0' },
        bays: [
          STORE(0.4, 7.2, { name: 'T-Mobile', sign: { kind: 'panel', text: 'T-Mobile', font: 'Inter-800', fg: '#ffffff', bg: '#e20074', u0: 1.0, u1: 6.5, y: 4.65, h: 0.7, lit: 'face' } }),
          STORE(7.6, 16.0, { name: 'FedEx Office', sign: { kind: 'channel', runs: [{ text: 'Fed', font: 'Inter-800', fg: '#4d148c' }, { text: 'Ex', font: 'Inter-800', fg: '#ff6200' }, { text: ' Office', font: 'Inter-700', fg: '#4d148c', gap: 0.1 }], u0: 8.2, u1: 15.4, y: 4.65, h: 0.75, lit: 'face' } }),
          STORE(16.4, 24.0, { name: 'vacant', gate: { kind: 'rolldown', box: true, color: '#9aa0a3', down: 1 } }),
          STORE(24.4, 30.4, { name: 'KFC', interior: 'restaurant', sign: { kind: 'panel', text: 'KFC', font: 'Arimo-700', fg: '#ffffff', bg: '#c8102e', u0: 25.0, u1: 29.8, y: 4.65, h: 0.75, lit: 'face' } }),
          STORE(30.8, 36.7, { name: 'Citibank', interior: 'bank', sign: { kind: 'panel', text: 'citibank', font: 'Inter-600', fg: '#ffffff', bg: '#056dae', u0: 31.2, u1: 36.4, y: 4.65, h: 0.75, lit: 'face' } }),
        ] },
      bays: { n: 6, margin: [0.8, 0.8] },
      floors: [{ n: 1, h: 5.0, win: 'C' }, { n: 1, h: 4.7, win: 'C' }],
      windows: { C: { w: 4.2, h: 3.0, sill: 0.5, kind: 'fixed', mullions: 3, frame: 'alu_bronze', reveal: 0.18, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d6ccb5', h: 0.3 } } },
      piers: { mat: 'brick_buff', tint: '#cbbd9f', w: 1.0, proj: 0.06, at: 'bays', from: 'base', to: 'cornice' },
      cornice: { kind: 'modillion', h: 0.9, proj: 0.6, mat: 'metal_painted', tint: '#4f6f5a', chips: 0.1 },
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 0.5, coping: 'alu_clear' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.8, 0.4], n: 4 }] },   // AR34: off (10/11/2024): a grey-brown gravel roof, units at the east end
    refs: [],
    notes: 'Three storeys of buff brick with rusticated piers between wide Chicago windows, a green-painted metal ' +
      'modillion cornice. Shops (2024-08) west to east: T-Mobile, FedEx Office, a boarded store, KFC, Citibank.',
  },

  // =================================================================== SOUTH SIDE, west to east (u from the EAST end of each face)
  {
    id: 'fdb-2310', addr: '2310 Frederick Douglass Blvd', name: 'Foot Locker, Kids Foot Locker', bin: '1058638',
    at: [1692.38, -2954.14], comp: '3_-6:301', h: 10.3, status: 'draft',
    // AR34: grey standing-seam metal, upright ribs
    wall: { mat: 'ribbed', tint: '#9fa2a3', dir: 'v', pitch: 0.3, dirt: 0.3 },
    faces: [{
      edge: 'front',
      base: { h: 4.4, fascia: { h: 1.0, mat: 'panel_alu', tint: '#141416' },
        bays: [
          // AR34: Kids Foot Locker is the EAST store (u 0.3-15.0) and Foot Locker the corner store, its gates down in 2024-08
          STORE(0.3, 15.0, { name: 'Kids Foot Locker', sign: { kind: 'channel', text: 'Kids Foot Locker', font: 'Inter-800', italic: true, fg: '#ffffff', u0: 2.0, u1: 12.5, y: 4.5, h: 0.75, lit: 'face' } }),
          // 2026-08: the corner store open (black frames, a double door), its letters upright
          STORE(15.4, 30.2, { name: 'Foot Locker', gate: { kind: 'none' }, glazing: { bulkhead: 0.1, transom: 0, mullions: 2, frame: 'alu_black' }, door: { u: 0.82, w: 1.8, kind: 'double', recess: 0.3 }, sign: { kind: 'channel', text: 'Foot Locker', font: 'Inter-800', fg: '#ffffff', u0: 18.5, u1: 27.5, y: 4.55, h: 0.8, lit: 'face' } }),
        ] },
      bays: { n: 4, margin: [1.0, 1.0] },
      // the second-floor windows: u 2.9-6.0 and 9.0-12.3, 5.5-8.7 m (mosaic south_m3, strip 84.8-94.2 from the east end at
      // 01320 (square to u 25) gives the west one u 25.1-28.5 and the east one's right edge 20.75 (its left behind the
      // tree; taken at the same 3.4 m width), (oblique) 24.4-27.6 and 16.6-20.0: not mirrored (centre spacing
      // 8.4 m against the east pair's 6.2)
      floors: [{ n: 1, h: 4.2, win: 'W', open: [[2.9, 6.0, 'W'], [9.0, 12.3, 'W'], [17.35, 20.75, 'W'], [25.1, 28.5, 'W']] }],
      // THE UNITED HOUSE OF PRAYER FOR ALL PEOPLE in raised silver capitals along the top (2026-08)
      items: [{ k: 'sign', sign: { kind: 'channel', text: 'THE UNITED HOUSE OF PRAYER FOR ALL PEOPLE', font: 'Arimo-400', fg: '#cfd1d2', u0: 8.0, u1: 29.9, y: 8.95, h: 0.62, fill: 0.92, depth: 0.05, lit: 'none', metal: true, tracking: 0.02 }, z: 0.02 }],
      windows: { W: { w: 3.1, h: 3.2, sill: 0.1, kind: 'fixed', mullions: 1, transom: 0.9, frame: 'alu_white', reveal: 0.12, lintel: { kind: 'none' }, sillStone: null } },
      cornice: { kind: 'parapet', mat: 'panel_alu', tint: '#a8aaa9' },   // AR34: the wall's own material (the kit default is chipped metal_painted)
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'black', items: [{ k: 'hvac', at: [0.5, 0.2], n: 8 }] },   // AR34: off (10/11/2024): a dark roof, a field of units on its north half
    refs: [],
    notes: 'Two storeys of pale grey metal panels, a few punched windows upstairs, a black signband over Foot Locker and ' +
      'Kids Foot Locker. The compiled 19.7 m (CHURCH) is wrong: two storeys, ~9.6 m.',
  },
  {
    id: 'w125-268', addr: '268 W 125th St', name: null, bin: '1058651',
    at: [1720.77, -2958.23], comp: '3_-6:24', h: 8.2, status: 'measured',
    // AR34: upright ribbed grey metal over a dark glass front,
    // a silver-and-black throw-up on the east pier
    wall: { mat: 'ribbed', tint: '#8a8d8f', dir: 'v', pitch: 0.15, dirt: 0.5 },
    // the glass front u 1.6-11.5 and a dark service door in the solid west end (mosaic south_m3: strip 69.1-79.0 of 67.5-81.9)
    faces: [{ edge: 'front', base: { h: 5.4, bays: [STORE(1.6, 11.5, { name: 'vacant store', interior: { kind: 'empty', tone: '#2b2b2d', lit: 0 }, gate: { kind: 'none' } }),
        { u0: 12.3, u1: 13.5, kind: 'entrance', door: { kind: 'solid', w: 1.0, recess: 0.15, mat: 'steel_black' } }] }, floors: [],
      graffiti: [{ u0: 0.1, u1: 1.55, y0: 0.2, y1: 3.2, density: 0.85, style: 'throwups', seed: 268 }] }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 0.6, parapet: { h: 0.5, coping: 'alu_clear' }, membrane: 'white' },   // AR34: off (10/11/2024): light
    refs: [],
    notes: 'One storey (top 8.3 m on the mosaic elevation south_m3, 20 px/m): grey ribbed metal, a glass front u 1.6-11.5 ' +
      '(vacant in 2024-08), a throw-up on the east pier (invented in that style), a service door at the west end.',
  },
  {
    id: 'w125-264', addr: '264 W 125th St', name: 'Gap Factory Store', bin: '1058650',
    at: [1727.57, -2938.85], comp: '3_-6:136', h: 16.0, status: 'measured',
    wall: { mat: 'stucco', tint: '#eeeeea', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, bays: [STORE(0.8, 14.7, { name: 'Gap Factory Store', h: 3.9, gate: { kind: 'none' }, glazing: { bulkhead: 0.3, transom: 0, mullions: 4, frame: 'alu_black' } })] },
      floors: [],
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'GAP', font: 'LibreBaskerville-400', fg: '#ffffff', bg: '#16336b', u0: 4.4, u1: 10.7, y: 5.9, h: 7.2, fill: 0.36, sub: { text: 'Factory Store', font: 'Inter-500', size: 0.1 }, lit: 'face' } }],
      // AR34: navy corner pilasters and a navy band along the top, a white moulding over the shop
      piers: { mat: 'panel_alu', tint: '#1b2c5e', w: 0.6, proj: 0.12, at: [0.3, 15.2], from: 0, to: 'cornice' },
      bands: [{ at: 'base', h: 0.32, proj: 0.12, mat: 'stucco', tint: '#f3f3ef' }],
      cornice: { kind: 'band', h: 0.55, proj: 0.14, mat: 'panel_alu', tint: '#1b2c5e' },
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 0.6, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'white' },
    refs: [],
    notes: 'A white rendered box with navy trim and corner pilasters; the big navy GAP Factory Store panel; an arched ' +
      'band over the entrance. Measured on the mosaic elevation south_m3 (21 px/m): the top 15.7-16.0 m, the GAP panel ' +
      'u 4.6-10.7 x 5.8-13.1 m, the store glass u 0.9-14.6 (AR34 check).',
  },
  {
    id: 'w125-260', addr: '260 W 125th St', name: 'Harlem Museum (closed)', bin: '1058649',
    at: [1743.07, -2935.16], comp: '3_-6:148', h: 10.4, status: 'measured',
    wall: { mat: 'stucco', tint: '#d7d8d6', dirt: 0.35 },
    // a tall gridded shopfront u 1.1-4.8 up to 5.2 m; piers u 4.8-5.3
    // and 10.9-11.5; the closed museum front u 5.3-10.9 with its banner sign u 7.6-9.7 at 2.2-3.4 m; grilles u 11.5-13.3
    // and 13.3-15.6 under a band of posters and stickers (2.8-3.6 m); an orange perforated screen u 0.2-1.5 at 5.3-8.3 m;
    // a faded mural of walking figures u 9.5-12.9 at 4.6-6.4 m (not drawn, below)
    faces: [{ edge: 'front', base: { h: 5.2, bays: [
        STORE(1.1, 4.8, { h: 5.0, gate: { kind: 'none' }, glazing: { bulkhead: 0.4, transom: 1.4, mullions: 4, frame: 'alu_black' }, door: null, interior: { kind: 'empty', tone: '#2b2b2d', lit: 0 } }),
        STORE(5.3, 10.9, { name: 'Harlem Museum', gate: { kind: 'grille', box: true, color: '#8e9396', down: 1.0 },
          sign: { kind: 'panel', text: 'HARLEM MUSEUM', font: 'Inter-800', fg: '#7a2a1c', bg: '#efe7d6', u0: 7.6, u1: 9.7, y: 2.2, h: 1.2, fill: 0.62, sub: { text: 'History & Culture', font: 'Inter-500', size: 0.16 }, lit: 'none' } }),
        STORE(11.5, 13.3, { gate: { kind: 'grille', box: true, color: '#8e9396', down: 1.0, graffiti: { density: 0.5, style: 'tags', seed: 2602 } } }),
        STORE(13.3, 15.6, { gate: { kind: 'grille', box: true, color: '#8e9396', down: 1.0, graffiti: { density: 0.55, style: 'tags', seed: 2603 } } })] },
      floors: [],
      // (the faded figures u 9.5-12.9 are left out: the kit's mural styles are colour fields, bands or a lettered piece,
      // and a 'blocks' mural there read as a dark window in w2c / w2e)
      items: [{ k: 'sign', sign: { kind: 'panel', text: '', bg: '#c8652c', u0: 0.2, u1: 1.5, y: 5.3, h: 3.0, lit: 'none' } }],
      graffiti: [{ u0: 13.3, u1: 15.6, y0: 2.8, y1: 3.8, density: 0.95, style: 'throwups', seed: 260, overGlass: true }] }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.5, coping: 'alu_clear' }, membrane: 'gravel' },   // AR34: off (10/11/2024): brown
    refs: [],
    notes: 'A pale rendered two-storey front: a tall gridded shopfront, the closed Harlem Museum front behind grilles with ' +
      'its banner, two grilled stores under a band of posters and stickers, an orange perforated screen at the east end, ' +
      'a faded mural of figures upstairs (not drawn). Measured in AR34 wave 2.',
  },
  {
    id: 'w125-256', addr: '256 W 125th St', name: 'Spectrum; The Cliffs climbing gym', bin: '1058648',
    at: [1752.65, -2913.3], comp: '3_-6:63', h: 11.9, status: 'measured',
    wall: { mat: 'brick_red', tint: '#74402f', dirt: 0.35 },   // AR34: a darker brown-red
    // ONE tall window band 6.0-9.5 m (the climbing gym's double-height
    // floor; the draft had two storeys), black frames, piers at u 3.8-4.1 and 11.5-12.1 (the middle two windows behind
    // the tree, split evenly); 'spectrum' over the WEST half u 8.4-14.0 at 10.4-11.5 (the draft had it east), a second
    // one u 10.4-13.0 at 4.7-5.4 and THE CLIFFS board u 1.0-4.4 at 4.2-5.5 in the brick band; The Cliffs' glass entrance
    // u 0.8-4.9 and the Spectrum store u 5.6-15.1 under it (glass 0.2-3.9)
    faces: [{
      edge: 'front',
      base: { h: 4.1, bays: [STORE(0.8, 4.9, { name: 'The Cliffs', interior: 'shop_clothing', gate: { kind: 'none' }, h: 3.7, glazing: { bulkhead: 0.1, transom: 0.5, mullions: 2, frame: 'alu_black' }, door: { u: 0.45, w: 1.5, kind: 'double', recess: 0.2 } }),
        STORE(5.6, 15.1, { name: 'Spectrum', interior: 'shop_phone', gate: { kind: 'none' }, h: 3.7, glazing: { bulkhead: 0.2, transom: 0.3, mullions: 4, frame: 'alu_black' }, door: { u: 0.62, w: 1.8, kind: 'double', recess: 0.3 } })] },
      floors: [{ n: 1, h: 7.8, win: 'W', open: [[0.9, 3.8, 'W'], [4.1, 7.65, 'W'], [7.95, 11.5, 'W'], [12.1, 15.0, 'W']] }],
      windows: { W: { w: 3.5, h: 3.5, sill: 1.9, kind: 'fixed', mullions: 1, transom: 0, frame: 'alu_black', reveal: 0.2, lintel: { kind: 'none' }, sillStone: null } },
      items: [{ k: 'sign', sign: { kind: 'channel', text: 'spectrum', font: 'Inter-700', fg: '#1a4f9c', u0: 8.4, u1: 14.0, y: 10.4, h: 1.1, lit: 'face' } },
        { k: 'sign', sign: { kind: 'channel', text: 'spectrum', font: 'Inter-700', fg: '#1a4f9c', u0: 10.4, u1: 13.0, y: 4.7, h: 0.7, lit: 'face' } },
        { k: 'sign', sign: { kind: 'panel', text: 'THE CLIFFS', font: 'Montserrat-800', fg: '#ffffff', bg: '#1f1f1f', u0: 1.0, u1: 4.4, y: 4.2, h: 1.3, sub: 'COME ROCK CLIMB WITH US' } }],
      cornice: { kind: 'parapet', mat: 'brick_red', tint: '#8c4d3c' },   // AR34: the wall's own material (the kit default is chipped metal_painted)
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'black' },   // AR34: off (10/11/2024): dark
    refs: [],
    notes: 'Three storeys of red brick with big black-framed windows; Spectrum on the ground floor and the blue ' +
      '"spectrum" letters on top; The Cliffs climbing gym upstairs (sign).',
  },
  {
    id: 'w125-252', addr: '252 W 125th St', name: 'Hip Hop Jewelry', bin: '1058647',
    at: [1773.06, -2926.69], comp: '3_-6:23', h: 8.8, status: 'measured',
    wall: { mat: 'brick_painted', tint: '#1c1c1d', dirt: 0.3 },
    // AR34, measured on the mosaic elevation south_m2 (19.6 px/m; this front is its u 7.5-23.4): Hip Hop Jewelry u 0.7-5.5
    // (its sign 4.9-6.3 m, a JEWELRY / SNEAKERS / CAPS / TATTOOS board over it 6.7-8.0), the HARLEM box over a white
    // store u 6.0-9.3 (5.6-7.1 m), a painted graffiti mural over the third store u 9.6-15.6 (4.4-9.0 m)
    faces: [{ edge: 'front', base: { h: 4.4, bays: [
        STORE(0.5, 5.6, { name: 'Hip Hop Jewelry', interior: 'shop_phone', h: 3.6,
          sign: { kind: 'panel', bg: '#121212', u0: 0.6, u1: 5.5, y: 4.8, h: 1.6, lit: 'none' } }),
        STORE(6.0, 9.3, { name: 'Harlem', interior: 'shop_clothing', h: 3.6, glazing: { bulkhead: 0.2, transom: 0.3, mullions: 1, frame: { mat: 'alu_white', tint: '#f1f1ee' } } }),
        STORE(9.6, 15.4, { interior: { kind: 'shop_food', tone: '#2b2b2d', lit: 0.6 }, h: 3.6 })] }, floors: [],
      items: [
        { k: 'sign', sign: { kind: 'channel', text: 'Hip Hop', font: 'KaushanScript-400', fg: '#d81f26', u0: 1.6, u1: 4.6, y: 5.55, h: 0.75, depth: 0.03, lit: 'face' }, z: 0.07 },
        { k: 'sign', sign: { kind: 'channel', text: 'JEWELRY', font: 'LibreBaskerville-700', fg: '#f4f4f2', u0: 1.0, u1: 5.1, y: 4.95, h: 0.5, depth: 0.03, lit: 'face', tracking: 0.08 }, z: 0.07 },
        { k: 'sign', sign: { kind: 'panel', text: 'JEWELRY · SNEAKERS · CAPS · TATTOOS', font: 'Oswald-600', fg: '#141414', bg: '#f2f0ea', u0: 0.6, u1: 5.5, y: 6.7, h: 1.2, fill: 0.4, lit: 'face' } },
        { k: 'sign', sign: { kind: 'panel', bg: '#f1f1ee', u0: 5.9, u1: 9.4, y: 4.4, h: 4.6, lit: 'none' } },
        { k: 'sign', sign: { kind: 'lightbox', text: 'HARLEM', font: 'Montserrat-700', fg: '#1b1b1b', bg: '#f5f5f3', frame: '#1b1b1b', u0: 6.1, u1: 9.2, y: 5.5, h: 1.6, fill: 0.55 }, z: 0.06 }],
      graffiti: [{ u0: 9.6, u1: 15.6, y0: 4.4, y1: 9.0, density: 0.95, style: 'piece', seed: 252, bandTop: 0.02 }] }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.4, coping: 'alu_clear' }, membrane: 'white' },   // AR34: off (10/11/2024): light beige
    refs: [],
    notes: 'One storey: Hip Hop Jewelry (252 W 125 ST.) with a JEWELRY / SNEAKERS / CAPS / TATTOOS panel, the HARLEM ' +
      'store in a white front, a graffiti mural over the third store. Shop extents and sign heights measured on the ' +
      'mosaic elevation south_m2 (AR34); the mural is invented in the style of the real one (never copied).',
  },
  {
    id: 'w125-250', addr: '250 W 125th St', name: 'Aldo', bin: '1058646',
    at: [1783.18, -2921.07], comp: '3_-6:294', h: 9.4, status: 'measured',
    wall: { mat: 'brick_painted', tint: '#1e1e20', dirt: 0.3 },
    // ALDO u 3.06-6.3 at 5.8-6.4 m; a dark band 3.7-4.2; the glass front
    // u 1.1-7.7 (0.5-3.5 m) with its double door u 4.4-6.2; a black pier u -0.5..1.1 with a tag at 1.4-2.8 m; the black
    // paint flaking to red brick over 7.0-9.0 m (not drawn: no kit option for paint over brick yet)
    faces: [{ edge: 'front', base: { h: 4.2, bays: [STORE(1.1, 7.7, { name: 'Aldo', gate: { kind: 'none' }, h: 3.5, glazing: { bulkhead: 0.35, transom: 0.4, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.3 } })] }, floors: [],
      items: [{ k: 'sign', sign: { kind: 'channel', text: 'ALDO', font: 'Montserrat-500', fg: '#e9e9e7', u0: 3.06, u1: 6.3, y: 5.8, h: 0.62, lit: 'halo', tracking: 0.12 } }],
      graffiti: [{ u0: 0.1, u1: 0.9, y0: 1.3, y1: 2.9, density: 0.8, style: 'tags', seed: 250 }] }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.4, coping: 'alu_clear' }, membrane: 'white' },   // AR34: off (10/11/2024): light grey
    refs: [],
    notes: 'Black painted brick with ALDO in white letters over the glass shoe store.',
  },
  {
    id: 'w125-246', addr: '246 W 125th St', name: 'Gotham Buds; Cell City / Gold of Harlem', bin: '1058645',
    at: [1793.14, -2915.53], comp: '3_-6:278', h: 9.4, status: 'measured',
    wall: { mat: 'brick_painted', tint: '#1b1b1c', dirt: 0.3 },
    // AR34, measured on south_m2 (this front is its u -15.7 to -0.4): Cell City / Gold of Harlem u 0.4-5.0 (CELL CITY
    // 7.1-8.3 m, GOLD of HARLEM 3.7-7.1, the jewelry counter under it), Gotham Buds u 5.2-15.4: a black panel 4.1-9.3 m
    // in a white outline, GOTHAM BUDS in yellow at u 8.6-12.6, 5.6-7.0 m
    faces: [{ edge: 'front', base: { h: 3.7, bays: [
      STORE(0.4, 5.0, { name: 'Gold of Harlem', interior: 'shop_phone', h: 3.2, sign: { kind: 'panel', lines: ['GOLD', 'of', 'HARLEM'], font: 'Oswald-600', fg: '#c8102e', bg: '#f2efe6', frame: '#c8102e', u0: 0.4, u1: 5.0, y: 3.75, h: 3.3 } }),
      STORE(5.4, 15.1, { name: 'Gotham Buds', gate: { kind: 'none' }, h: 3.2, glazing: { bulkhead: 0.1, transom: 0, mullions: 2, frame: 'alu_black' }, interior: { kind: 'shop_food', tone: '#2b2b2d', lit: 0.7 } }),
    ] }, floors: [],
      items: [{ k: 'sign', sign: { kind: 'panel', bg: '#141414', frame: '#eeeeec', u0: 5.3, u1: 15.3, y: 4.1, h: 5.2, lit: 'none' } },
        { k: 'sign', sign: { kind: 'channel', lines: ['GOTHAM', 'BUDS'], font: 'Anton', italic: true, fg: '#f5c518', ret: '#3a3000', u0: 8.0, u1: 13.2, y: 5.2, h: 2.2, depth: 0.06, lit: 'face' }, z: 0.06 },
        { k: 'sign', sign: { kind: 'panel', lines: ['CELL CITY', 'of HARLEM'], font: 'Oswald-600', fg: '#d4121c', bg: '#f2f0ea', u0: 0.4, u1: 5.0, y: 7.1, h: 1.2 } }],
      // a white marker tag on the black pier by ALDO's door
      graffiti: [{ u0: 14.9, u1: 15.4, y0: 1.0, y1: 2.4, density: 0.7, style: 'tags', seed: 246 }] }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 1.2, parapet: { h: 0.4, coping: 'alu_clear' }, membrane: 'black' },
    refs: [],
    notes: 'Black painted fronts: GOTHAM BUDS in yellow inside a white outline frame; CELL CITY of HARLEM and GOLD of ' +
      'HARLEM (248) signs over a jewelry counter at the east end. Shop extents and sign heights measured on the mosaic ' +
      'elevation south_m2 (AR34). Not modelled: the painted portrait on the pier west of the Gotham Buds door (a real ' +
      'person: left out).',
  },
  {
    id: 'w125-230', addr: '230 W 125th St', name: 'Blumstein\'s department store (1922)', bin: '1058644',
    at: [1790.15, -2890.71], comp: '3_-6:177', h: 29.6, status: 'measured',
    custom: { fn: 'bid2:blumstein', with: 'kit' },   // the kit's faces, then the green cast-iron colonettes, spandrels, canopy and finials
    wall: { mat: 'stone_lime', tint: '#b9ae98', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: {
        h: 8.8,
        piers: { at: [1.2, 8.8, 20.9, 26.1], w: 1.2, mat: 'stone_lime', tint: '#b5aa94', proj: 0.08 },
        bays: [
          STORE(1.2, 3.6, { name: 'Touro University', h: 3.9, interior: 'bank' }),
          STORE(3.8, 8.2, { name: 'Easy Shopping Dept Store', h: 3.9, sign: { kind: 'panel', text: 'EASY SHOPPING', font: 'Arimo-700', fg: '#ffffff', bg: '#d0202a', u0: 3.9, u1: 8.1, y: 3.95, h: 0.55, sub: 'DEPT STORE', lit: 'face' } }),
          STORE(9.4, 20.3, { name: 'Platinum Jewelry of Harlem', h: 3.9, interior: 'shop_phone', sign: { kind: 'panel', text: 'Apollo', font: 'Inter-700', fg: '#ffffff', bg: '#1b1b1b', u0: 12.5, u1: 18.5, y: 3.95, h: 0.55 } }),
          STORE(21.5, 25.9, { h: 3.9 }),
        ],
      },
      bays: { widths: [1.8, 2.0, 2.0, 2.0, 2.0, 2.08, 2.08, 2.08, 2.08, 2.08, 1.4, 2.1, 2.1, 0.65] },
      floors: [{ n: 3, h: 4.8, win: 'M', bays: [1, 2, 3, 5, 6, 7, 8, 9, 11, 12] }, { n: 1, h: 3.8, win: 'T', bays: [1, 2, 3, 5, 6, 7, 8, 9, 11, 12] }],
      windows: {
        M: { w: 1.72, h: 3.2, sill: 0.2, kind: 'casement', transom: 0.7, lights: '1/1', frame: 'metal_painted', tint: '#3f7d68', reveal: 0.2, lintel: { kind: 'none' }, sillStone: null, blinds: 0.4, lit: 0.3 },
        T: { w: 1.6, h: 2.8, sill: 0.8, kind: 'casement', lights: '1/1', frame: 'metal_painted', tint: '#3f7d68', reveal: 0.25, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#b9ae98', h: 0.2 } },
      },
      bands: [{ at: 'base', h: 0.3, proj: 0.15, mat: 'metal_painted', tint: '#3d7a66', chips: 0.1 }],
      cornice: { kind: 'parapet', mat: 'stone_lime', tint: '#b9ae98' },   // AR34: the wall's own material (the kit default is chipped metal_painted)
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'RETAIL STORES FOR LEASE', font: 'Arimo-700', fg: '#ffffff', bg: '#b3262c', u0: 1.4, u1: 7.8, y: 7.9, h: 0.9 } },
        { k: 'sign', sign: { kind: 'blade', lines: ['PLATINUM', 'JEWELRY', 'OF HARLEM'], font: 'Oswald-600', fg: '#c8102e', bg: '#f4f2ec', u0: 9.2, u1: 11.4, y: 4.2, h: 4.2 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['TOURO', 'UNIVERSITY'], font: 'Inter-700', fg: '#ffffff', bg: '#1a3f8f', u0: 0.4, u1: 3.4, y: 2.6, h: 4.0, lit: 'face' } }],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 1.2, coping: 'stone_lime' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.5, 0.6], w: 5, d: 4, h: 4 }, { k: 'hvac', at: [0.5, 0.35], n: 8 }] },   // AR34: off (10/11/2024): a light roof crowded with units, no tank
    refs: [],
    notes: 'Blumstein\'s (1922, Robert D. Kohn): limestone-faced, three bays divided by broad piers (u 7.8-9.8, 20.2-21.6) ' +
      'that rise past the parapet (29.5) into finials (to ~31); in each bay green-painted cast-iron colonettes and ' +
      'ornate spandrels over three storeys (windows 9.8-12.0, 13.6-16.0, 17.4-19.9), a green metal canopy cornice at ' +
      '22.4-23.6 over them, an attic storey 24.0-26.8. The mezzanine (5-9.4) carries leasing banners. The colonettes, ' +
      'spandrel ornament and finials need a custom builder (next). The compiled 39.65 is the rear.',
  },
  {
    id: 'w125-226', addr: '226 W 125th St', name: 'Joyce Leslie', bin: '1058643',
    at: [1821.95, -2882.15], comp: '3_-6:12', h: 11.7, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#d7ccb2', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, fascia: { h: 1.4, mat: 'panel_alu', tint: '#141414' },
        bays: [STORE(0.4, 14.3, { name: 'Joyce Leslie', h: 3.9, sign: { kind: 'channel', text: 'joyce leslie', font: 'Montserrat-600', fg: '#f1c21b', u0: 2.0, u1: 12.5, y: 4.4, h: 0.9, lit: 'face' } })] },
      bays: { n: 3, margin: [0.6, 0.6] },
      floors: [{ n: 1, h: 4.6, win: 'W' }],
      windows: { W: { w: 3.6, h: 3.2, sill: 0.5, kind: 'casement', mullions: 2, transom: 0.6, frame: 'alu_white', reveal: 0.2, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#e0d9c6', h: 0.3 } } },
      cornice: { kind: 'dentil', h: 0.5, proj: 0.35, mat: 'stone_lime', tint: '#e2dccb' },
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 1.4, coping: 'stone_lime' }, membrane: 'white' },   // AR34: off (10/11/2024): light, cluttered
    refs: [],
    notes: 'Three storeys, buff brick and limestone, wide windows, a balustrade/dentil top; joyce leslie in yellow ' +
      'letters on a black signband.',
  },
  {
    id: 'w125-222', addr: '222 W 125th St', name: 'JD Sports', bin: '1058642',
    at: [1833.77, -2875.6], comp: '3_-6:112', h: 11.8, status: 'measured',
    wall: { mat: 'brick_buff', tint: '#e0d6bd', dirt: 0.25 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, bays: [STORE(0.4, 11.9, { name: 'JD Sports', gate: { kind: 'none' }, glazing: { bulkhead: 0.15, transom: 0, mullions: 4, frame: 'alu_black' },
        sign: { kind: 'channel', text: 'JD', font: 'Montserrat-900', italic: true, fg: '#ffffff', u0: 5.8, u1: 7.4, y: 3.25, h: 0.75, lit: 'face' } })] },
      floors: [],
      // AR34: the black panel over the store is blank in 2024-08; the store's black fascia carries
      // JDSPORTS.COM (east, u 1.6-4.4) and the JD mark (u 5.8-7.4)
      items: [{ k: 'sign', sign: { kind: 'panel', bg: '#1c1c1e', frame: '#141415', u0: 2.2, u1: 11.0, y: 5.4, h: 4.9, lit: 'none' } },
        { k: 'sign', sign: { kind: 'channel', text: 'JDSPORTS.COM', font: 'Montserrat-800', fg: '#f4f4f2', u0: 1.6, u1: 4.6, y: 3.4, h: 0.4, depth: 0.03, lit: 'face', tracking: 0.02 }, z: 0.03 }],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'white' },
    refs: [],
    notes: 'Cream brick with a large black panel over the JD Sports store front (JDSPORTS.COM, the JD mark).',
  },
  {
    id: 'w125-208', addr: '208 W 125th St', name: 'Easy Pickins, Planet Fitness, Chick-fil-A', bin: '1058641',
    at: [1854.02, -2864.34], comp: '3_-6:202', h: 10.4, status: 'draft',
    wall: { mat: 'stucco', tint: '#c9c19a', dirt: 0.3 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, fascia: { h: 1.3, mat: 'panel_alu', tint: '#161616' },
        bays: [
          STORE(0.5, 14.5, { name: 'Champs Sports', sign: { kind: 'panel', text: 'CHAMPS SPORTS', font: 'Oswald-600', fg: '#ffffff', bg: '#1d3a8a', u0: 6.0, u1: 13.5, y: 4.55, h: 0.9, lit: 'face' } }),
          STORE(15.3, 27.0, { name: 'Easy Pickins', sign: { kind: 'channel', text: 'EASY PICKINS', font: 'Anton', fg: '#e8337a', u0: 15.8, u1: 26.6, y: 5.4, h: 1.3, lit: 'face' } }),
          STORE(27.4, 33.8, { name: 'Chick-fil-A', interior: 'restaurant', sign: { kind: 'channel', text: 'Chick-fil-A', font: 'Lobster', fg: '#dd0033', u0: 28.0, u1: 33.4, y: 8.4, h: 1.1, lit: 'face' } }),
        ] },
      floors: [{ n: 1, h: 4.5, win: 'P' }],
      bays: { n: 1, margin: [15.3, 0.3] },
      windows: { P: { kind: 'ribbon', w: 17.5, h: 3.2, sill: 0.4, frame: 'alu_black', mullions: 6 } },
      // AR34: Planet Fitness's yellow band along the top with its purple lowercase name, its purple-and-
      // magenta glazing over Easy Pickins (drawn from scratch: a frosted tint and the name in big letters on the glass)
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'planet fitness', font: 'Poppins-700', fg: '#5b2c86', bg: '#f6d917', u0: 15.0, u1: 33.6, y: 9.2, h: 1.2, fill: 0.62, lit: 'face' } },
        { k: 'sign', sign: { kind: 'painted', text: 'fitness', font: 'Poppins-700', fg: '#d6338a', u0: 15.6, u1: 26.4, y: 6.2, h: 2.6, fill: 0.9, onGlass: true }, z: -0.1 }],
      // a silver throw-up on the black pier at the west end of Easy Pickins, invented in that style
      graffiti: [{ u0: 26.2, u1: 27.4, y0: 0.3, y1: 2.6, density: 0.9, style: 'throwups', seed: 208 }],
    }],
    roof: { kind: 'flat', dirt: 0.7, clutter: 2.0, parapet: { h: 0.6, coping: 'alu_clear' }, membrane: 'black', items: [{ k: 'hvac', at: [0.5, 0.5], n: 6 }] },   // AR34: off (10/11/2024): dark grey, rows of vents
    refs: [],
    notes: 'Two storeys: EASY PICKINS (pink letters on black) with Planet Fitness upstairs behind purple/yellow glazing ' +
      '(its graphic is a real brand: the kit draws plain glass); Chick-fil-A in the cream brick part at the east end. ' +
      'The compiled landmark id -9 (the old Theresa decorate placement) sat here.',
  },
  {
    id: 'acp-2082', addr: '2082-2096 Adam Clayton Powell Jr Blvd', name: 'Hotel Theresa (1913)', bin: '1058640',
    at: [1877.17, -2851.81], comp: '3_-6:207', h: 51.52, status: 'measured',
    custom: 'bid2:theresa',
    letters: { font: 'DMSerifDisplay-400' },   // the painted HOTEL THERESA on the west wall: named here so the sign kit loads the face
    wall: { mat: 'brick_glazed_cream', tint: '#cbc9c0', dirt: 0.5 },   // AR34 b3: as the custom builder's walls (MATS 01:18)
    refs: [],
    notes: 'White glazed brick and terracotta, 12 storeys; see docs/notes/ar33-bid2.md. 2024-08: under a sidewalk shed.',
  },
];
