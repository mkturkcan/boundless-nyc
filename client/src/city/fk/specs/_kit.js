// AR33 facade kit test specs (loaded only with ?fktest=1). Owner: KIT (docs/notes/ar33-kit.md). References:
// h30 (243 W 125th), h45 (2330 8th Ave).
// The segment workers' own specs (fk/specs/bid2.js) take over these buildings; a segment spec for the same footprint
// wins (the kit's test specs load last).
export default [
  {
    id: 'kit-243', addr: '243 W 125th St', name: 'Cinderella Eyebrows, GameStop, Ballers', bin: '1058655',
    at: [1798.12, -2980.51], comp: '3_-6:163', h: 15.2, status: 'draft',
    wall: { mat: 'brick_painted', tint: '#e9e5da', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: {
        h: 5.0,
        // AR34 w2 b1 test: base piers fluted, with consoles under the fascia (BID4 1)
        piers: { at: [5.7, 11.5, 13.7], w: 0.36, mat: 'granite_grey', tint: '#2d2d2f', proj: 0.05, flute: 3, console: true, consoleH: 0.5 },
        bays: [
          { u0: 0.15, u1: 5.5, kind: 'store', name: 'GameStop', h: 3.7,
            glazing: { bulkhead: 0.3, transom: 0.45, mullions: 1, frame: 'alu_black' }, door: { u: 0.78, w: 1.0, recess: 0.9 },
            gate: { kind: 'rolldown', box: true, color: '#9aa0a3' }, interior: 'empty',
            sign: { kind: 'panel', text: 'GameStop', font: 'Inter-700', fg: '#e8102a', bg: '#141414', u0: 0.15, u1: 5.5, y: 3.75, h: 0.8 } },
          { u0: 5.9, u1: 11.3, kind: 'store', name: 'Ballers', h: 3.7,
            glazing: { bulkhead: 0.25, transom: 0.35, mullions: 2, frame: 'alu_clear' }, door: { u: 0.52, w: 0.95, kind: 'double', recess: 0.5 },
            gate: { kind: 'rolldown', box: true, color: '#a4a8aa' }, interior: 'shop_clothing', awning: { color: '#1d3b2a', top: 3.3, proj: 1.0 },
            sign: { kind: 'channel', text: 'BALLERS', font: 'Anton', fg: '#d9c9a0', bg: '#1a1a1a', u0: 5.9, u1: 11.3, y: 3.75, h: 0.8 } },
          { u0: 11.7, u1: 13.5, kind: 'entrance', door: { kind: 'glass', w: 1.0, recess: 0.45, h: 2.4, transom: 0.8 } },
          { u0: 13.9, u1: 22.7, kind: 'store', name: 'menswear and shoes', h: 3.8,
            glazing: { bulkhead: 0.28, transom: 0.0, mullions: 4, frame: 'alu_clear', frosted: true }, door: { u: 0.62, w: 0.95, kind: 'double', recess: 0.35 },
            gate: { kind: 'rolldown', box: true, color: '#8e9396', down: 1, graffiti: { density: 0.8, style: 'throwups' } }, interior: 'shop_clothing' },
        ],
      },
      // AR34 test: a painted zone over the piers and the wall between the stores
      graffiti: [{ u0: 5.4, u1: 6.2, y0: 0.2, y1: 2.6, density: 0.6, style: 'tags' }, { u0: 11.2, u1: 14.0, y0: 0.2, y1: 3.0, density: 0.9 }],
      bays: { n: 9, margin: [0.85, 0.85] },
      floors: [{ n: 1, h: 3.3, win: 'A' }, { n: 2, h: 3.25, win: 'A' }],
      windows: {
        A: { w: 1.02, h: 1.72, sill: 0.82, kind: 'dh', lights: '1/1', frame: 'alu_bronze', reveal: 0.13,
          lintel: { kind: 'jack', mat: 'brick_painted', tint: '#e2ddd0', h: 0.2 }, sillStone: { mat: 'stone_lime', tint: '#dcd7cb', h: 0.08, proj: 0.04 },
          ac: 0.12, blinds: 0.6, lit: 0.35 },
      },
      bands: [{ at: 'floor:3', h: 0.12, proj: 0.025, mat: 'brick_painted', tint: '#e2ddd2' }, { at: 'floor:4', h: 0.12, proj: 0.025, mat: 'brick_painted', tint: '#e2ddd2' }],
      cornice: { kind: 'parapet' },
      // AR34 w2 b1 test: a one-storey part at the west end (WEST 1)
      parts: [{ u0: 0.6, u1: 3.6, h: 6.6, d: 4.0 }],
      // AR34 w2 b1 test: end piers carried over the parapet to gabled caps (BID4 3)
      piers: { at: [0.25, 22.7], w: 0.5, proj: 0.07, from: 5.0, cap: { over: 0.32, gable: 0.32 } },
    }],
    roof: { kind: 'flat', parapet: { h: 0.75, coping: 'metal_painted' }, membrane: 'black',
      items: [{ k: 'bulkhead', at: [0.62, 0.55], w: 3.0, d: 2.4, h: 2.7 }, { k: 'hvac', at: [0.3, 0.4], n: 2 }],
      levels: [{ u0: 1.0, u1: 7.0, d0: 6.0, d1: 11.0, h: 3.4 }] },
    notes: 'KIT test: 9 bays over 4 stores; the storefront signs through fk/signKit.js once it is in.',
  },
  {
    id: 'kit-2330', addr: '2330 Frederick Douglass Blvd', name: 'corner of 125th St and Frederick Douglass Blvd', bin: '',
    at: [1730, -3023.28], comp: '3_-6:161', h: 19.2, status: 'draft',
    wall: { mat: 'brick_red', tint: '#9a5040', dirt: 0.35 },
    faces: [
      {
        edge: 'front',
        base: {
          h: 5.2,
          piers: { at: [0.3, 9.6, 19.0, 28.4, 37.35], w: 0.6, mat: 'stone_lime', tint: '#cdc6b6', proj: 0.08 },
          bays: [
            { u0: 0.6, u1: 9.3, kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 1.2, mullions: 3, frame: 'alu_black' }, door: { u: 0.2, w: 1.0, recess: 1.0 }, interior: 'fastfood' },
            { u0: 9.9, u1: 18.7, kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 1.2, mullions: 3, frame: 'alu_black' }, door: null, interior: 'shop_food' },
            { u0: 19.3, u1: 28.1, kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 1.2, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 1.2 }, interior: 'bank' },
            { u0: 28.7, u1: 37.05, kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 1.2, mullions: 3, frame: 'alu_black' }, door: { u: 0.8, w: 1.0, recess: 1.0 }, interior: 'shop_clothing' },
          ],
        },
        bays: { widths: [1.3, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.95] },
        floors: [{ n: 4, h: 3.3, win: 'P', bays: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
        windows: {
          P: { w: 2.3, h: 1.75, sill: 0.8, kind: 'casement', lights: '1/1', frame: 'alu_white', reveal: 0.16, spandrel: { at: 1.1, h: 0.25, tint: '#5a5d60' },
            lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d2cbbb', h: 0.26 }, sillStone: { mat: 'stone_lime', tint: '#cfc8b8', h: 0.11, proj: 0.05 } },
        },
        bands: [{ at: 'base', h: 0.45, proj: 0.12, mat: 'stone_lime', tint: '#cdc6b6' }, { at: 'floor:5', h: 0.42, kind: 'pressed', tint: '#4d5652' }],
        piers: { at: [1.3, 37.0], w: 0.7, proj: 0.1, mat: 'stone_lime', tint: '#cdc6b6', flute: 5, console: true, from: 5.2, to: 18.0 },
        cornice: { kind: 'modillion', h: 0.8, proj: 0.45, mat: 'stone_lime', tint: '#cfc8b8' },
      },
      {
        edge: 'corner',
        base: { h: 5.2, bays: [{ u0: 1.0, u1: 6.5, kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 1.2, mullions: 2, frame: 'alu_black' }, door: null, interior: 'restaurant' }] },
        bays: { n: 6, margin: [0.8, 0.8] },
        floors: [{ n: 3, h: 3.3, win: 'A' }, { n: 1, h: 3.3, win: 'X' }],
        windows: { A: { w: 1.1, h: 1.75, sill: 0.8, kind: 'dh', frame: 'alu_white', reveal: 0.16, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d2cbbb', h: 0.26 } },
          X: { w: 1.1, h: 1.75, sill: 0.8, kind: 'boarded', reveal: 0.16, lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#d2cbbb', h: 0.26 } } },
        bands: [{ at: 'base', h: 0.45, proj: 0.12, mat: 'stone_lime', tint: '#cdc6b6' }],
        cornice: { kind: 'modillion', h: 0.8, proj: 0.45, mat: 'stone_lime', tint: '#cfc8b8' },
        fireEscape: { bays: [2, 3], floors: [1, 4], kind: 'balcony', drop: true },
        // AR34 test: boarded windows on the top floor, a plywood cover with graffiti over the base's blank end
        items: [{ k: 'plywood', u0: 7.0, u1: 11.9, y0: 0, y1: 2.44, tint: '#5f7a52', graffiti: { density: 0.7 } }],
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'stone_lime' }, membrane: 'white', dirt: 0.6, clutter: 2.5,
      items: [{ k: 'tank', at: [0.35, 0.55], r: 2.0, h: 3.6, legs: 3.2 }, { k: 'bulkhead', at: [0.7, 0.4], w: 3.4, d: 2.6, h: 2.8 }] },
    notes: 'KIT test: a corner lot (the corner face, mitred cornices), a water tank, a fire escape.',
  },
];
