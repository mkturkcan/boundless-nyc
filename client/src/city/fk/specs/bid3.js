// AR33 building specs, segment bid3: Adam Clayton Powell Jr. Boulevard to Lenox Avenue (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/bid3.json).
// Owner: the BID3 worker (docs/notes/ar33-bid3.md). Measurements: orthographic elevations rectified from the newest
// obliques. u along a face runs from its left end as seen from the street: on the
// south side (facing south) from the EAST end, on the north side (facing north) from the WEST end.
// The south frontage in one coordinate (docs/notes/ar33-bid3.md "south-u"): metres west from the Lenox Avenue corner
// (2140.3, -2740.5) along 125th Street: 100 W 0-45.8, 117 W 124th 45.8-76.3, 120 W 76.3-91.3, 124 W 91.3-122.2,
// 132 W 122.2-152.5, the Studio Museum 152.5-175.4, 148 W 175.4-190.6, 158 W 190.6-221.6, 2089 ACP 221.6-227.8.
// The north frontage ("north-u", metres east of (1944.94, -2883.88) on the building line): the State Office plaza
// 0-100, 105 W (low) 100.0-130.5, the Urban League Empowerment Center 130.5-194.7, the Harlem Center 194.7-240.1.
import { KC, KB } from '../custom/bid3Koch.js';
// BF36 (BIDFIX 2026-10-02, teaser 8's plaza frames): the white block east of the State Office plaza (w125-105a) showed the kit's default
// on its west wall over the plaza, four rows of small black windows;
// by the street, a painted mural at the plaza's level and white panels above. `?bf36=0` keeps the default wall
const BF36 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('bf36') === '0');
// the west wall: the ring's edge (2049.14, -2865.7) -> (2032.43, -2835.36), 34.64 m (docs/notes/ar33-frontage/bid3.json), the kit's u
// from its north end (the first render had the glazing at the north end), so the 125th corner is u 34.64
const W105A_WEST = {
  edge: [2032.49, -2835.72, 2044.61, -2857.59],
  base: { h: 4.7, bays: [{ u0: 25.44, u1: 34.34, kind: 'window', h: 4.3, glazing: { bulkhead: 0.25, transom: 0, mullions: 2, frame: 'alu_clear' }, door: null, gate: { kind: 'none' }, interior: { kind: 'empty', tone: '#9a9fa2', lit: 1.0 } }] },
  bays: { widths: [25.64, 3.0, 3.0, 3.0] },
  floors: [{ n: 1, h: 8.5, win: 'C', bays: [1, 2, 3] }],
  windows: { C: { w: 2.6, h: 3.1, sill: 0.35, kind: 'ribbon', frame: 'alu_clear', reveal: 0.12, lintel: { kind: 'none' }, sillStone: null, lit: 0.7, blinds: 0 } },
  cornice: { kind: 'band', h: 0.35, proj: 0.08, mat: 'metal_painted', tint: '#ecebe6' },
};
// two windows a bay (1.75 m wide with a 0.41 m stone mullion between), each under a louvred panel: floors 2 and 3 of the Koch building
const kochOpen = (bays, win, sill, h, pwin, psill, ph) => bays.flatMap((cb) => [-1, 1].flatMap((s) => {
  const u0 = cb + s * 1.08 - 0.875, u1 = cb + s * 1.08 + 0.875;
  return [{ u0, u1, win, sill, h }, { u0, u1, win: pwin, sill: psill, h: ph }];
}));
const STONE = '#c9bda7';        // the State Office Building's cladding: warm beige precast with a limestone face (sunlit #d2c6b0, shade #a39a88)
// the windows of 100 W (both faces): glass bands of floors 2-3, the 1.85 m rain-screen windows of floors 4-5, the glazed corner strips
const W100WIN = {
  G2: { kind: 'ribbon', sill: 0.5, h: 4.4, mullions: 30, transom: 0.85, frame: 'alu_clear', frameW: 0.035, reveal: 0.12, glass: 'glass_green', lintel: { kind: 'none' }, sillStone: null, lit: 0.6, blinds: 0 },
  G3: { kind: 'ribbon', sill: 0.55, h: 4.9, mullions: 30, transom: 0.8, frame: 'alu_clear', frameW: 0.035, reveal: 0.12, glass: 'glass_green', lintel: { kind: 'none' }, sillStone: null, lit: 0.6, blinds: 0 },
  W4: { kind: 'fixed', w: 1.85, h: 2.8, sill: 1.2, frame: 'alu_white', frameW: 0.06, reveal: 0.2, glass: 'glass_clear', lintel: { kind: 'none' }, sillStone: { mat: 'panel_alu', tint: '#7d8287', h: 0.1, proj: 0.04 }, blinds: 0.5, lit: 0.5 },
  W5: { kind: 'fixed', w: 1.85, h: 2.5, sill: 1.1, frame: 'alu_white', frameW: 0.06, reveal: 0.2, glass: 'glass_clear', lintel: { kind: 'none' }, sillStone: { mat: 'panel_alu', tint: '#7d8287', h: 0.1, proj: 0.04 }, blinds: 0.5, lit: 0.5 },
  CS: { kind: 'ribbon', mullions: 5, transom: 0, frame: 'alu_clear', frameW: 0.06, reveal: 0.25, glass: 'glass_blue', lintel: { kind: 'none' }, sillStone: null, lit: 0.4, blinds: 0 },
};

export default [
  // ============================================================== NORTH SIDE, west to east
  {
    id: 'w125-163', addr: '163 W 125th St', name: 'Adam Clayton Powell Jr. State Office Building', bin: '1081602',
    at: [2004.62, -2903.41], comp: '3_-6:8',
    // the tower's bounding rectangle (the compiled ring is the pier outline): s 0-61.72 along 125th Street from its west
    // face, b -20.52 (the north pier faces) to 4.17 (the south central section) in the street frame, NW, NE, SE, SW
    ring: [[1983.45, -2928.85], [2037.43, -2898.93], [2025.46, -2877.33], [1971.48, -2907.25]],
    h: 90.1, status: 'measured', custom: 'bid3:sob',
    wall: { mat: 'stone_lime', tint: STONE, dirt: 0.3 },
    refs: [],
    notes: 'Ifill Johnson Hanchard, 1973; 19 storeys. South face (rectified at 14 px/m, u = s): four full-height piers ' +
      'A 4.9-8.1, B 14.8-18.0, C 42.8-46.0, D 53.1-56.4 rising to 90.1 m, two narrow glass bays (8.5-13.9, 47.4-52.4; 4 ' +
      'panes) topped at 77.9 by stone to 88.4, each broken at 42.6-47.6 by a stone shelf under a projecting upper box; ' +
      'the central curtain wall 19.3-42.0 (14 panes of 1.62 m) from 12.5 to 77.9 under a 12 m stone attic (to 89.8) with ' +
      'a vent line at its foot; the corner boxes (s 0-4.9 and 56.8-61.7) hung between 39.8 (a chamfered soffit) and 74.6, ' +
      'set back below and open above; the base: a stone lettering band 7.8-12.5 (ADAM CLAYTON POWELL JR. STATE OFFICE ' +
      'BUILDING at 9.6, letters ~0.45 m, u 23.2-38.1; 163 at 8.7 over each door group), the lobby recessed behind it to ' +
      '7.6 m, open arcades under the narrow bays, battered pier feet. Floors: 17 of ~3.85 m over the lobby and the band ' +
      'floor; vision glass over a dark spandrel each floor. North face assumed the mirror of the south (not measured). ' +
      'Roof: piers as fins over a membrane roof with a plant penthouse and a drum.',
  },
  {
    id: 'w125-105a', addr: '105 W 125th St (west part)', name: 'Harlem Center, the two-storey retail block (vacant)', bin: '1081601',
    at: [2054.1, -2843.18], comp: '4_-6:380', h: 13.2, status: 'measured', custom: { fn: 'bid3:w105a', with: 'kit' },
    wall: { mat: 'stucco', tint: '#e9e8e3', dirt: 0.25 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.7,
        bays: [
          { u0: 0.4, u1: 9.2, kind: 'window', h: 4.3, glazing: { bulkhead: 0.25, transom: 0, mullions: 3, frame: 'alu_clear' }, door: null,
            gate: { kind: 'none' }, interior: { kind: 'empty', tone: '#9a9fa2', lit: 1.0 },
            },
          { u0: 9.6, u1: 18.2, kind: 'store', h: 4.3, glazing: { bulkhead: 0.2, transom: 0.5, mullions: 4, frame: 'alu_clear' },
            door: { u: 0.45, w: 1.8, kind: 'double', recess: 0.3 }, gate: { kind: 'none' }, interior: { kind: 'empty', tone: '#9a9fa2', lit: 1.0 } },
          { u0: 18.9, u1: 27.2, kind: 'wall' },
          { u0: 27.4, u1: 29.4, kind: 'entrance', door: { kind: 'solid', w: 1.2, recess: 0.1, h: 2.3, transom: 0 } },
        ],
      },
      bays: { widths: [9.6, 8.6, 12.2] },
      floors: [{ n: 1, h: 8.5, win: 'G', bays: [0, 1] }],
      windows: { G: { w: 8.2, h: 3.1, sill: 0.35, kind: 'ribbon', frame: 'alu_clear', reveal: 0.12, lintel: { kind: 'none' }, sillStone: null, lit: 0.7, blinds: 0 } },
      cornice: { kind: 'band', h: 0.35, proj: 0.08, mat: 'metal_painted', tint: '#ecebe6' },
      items: [{ k: 'lamp', u: 11.0, y: 8.7 }, { k: 'lamp', u: 14.4, y: 8.7 }, { k: 'lamp', u: 16.0, y: 8.7 }, { k: 'lamp', u: 22.6, y: 8.7 }, { k: 'lamp', u: 24.2, y: 8.7 }, { k: 'lamp', u: 26.0, y: 8.7 }],
    }].concat(BF36 ? [W105A_WEST] : []),
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black', items: [{ k: 'hvac', at: [0.4, 0.5], n: 3 }, { k: 'hvac', at: [0.75, 0.6], n: 2 }] },
    refs: [],
    notes: 'Two tall storeys of white-painted panels, 13.2 m to the parapet (compiled 11.6). Vacant (2026-08): leasing ' +
      'graphics over the west store glass (magenta and navy, real agent banners drawn generic), a clerestory band 4.9-8.1 m ' +
      'over the west half, six gooseneck sign lamps at 8.7 m, a mural on the west wall facing the plaza (not modelled yet).',
  },
  {
    id: 'w125-121', addr: '121 W 125th St', name: 'Urban League Empowerment Center (Target, Trader Joe\'s, Pandora, Sephora, the Urban Civil Rights Museum)', bin: '',
    at: [2101.54, -2830.02], comp: '4_-6:537', h: 30.6, status: 'measured', custom: { fn: 'bid3:ulec', with: 'kit' },
    wall: { mat: 'panel_grey', tint: '#3a3d40', dirt: 0.15 },
    // the ground floor is the kit's (lit shops behind clear glass, doors, the dark signband); the glass podium above is bid3:ulec's
    faces: [{
      edge: 'front',
      base: {
        h: 4.2,
        fascia: { h: 1.3, mat: 'panel_grey', tint: '#585b5f' },
        bays: [
          { u0: 0.4, u1: 11.8, kind: 'store', name: 'Trader Joe\'s', h: 4.0, glazing: { bulkhead: 0.25, transom: 0.5, mullions: 4, frame: 'alu_black' }, door: { u: 0.45, w: 1.8, kind: 'double', recess: 0.3 }, gate: { kind: 'none' }, interior: { kind: 'shop_food', tone: '#bfc3c4', lit: 1.0 } },
          { u0: 12.0, u1: 23.4, kind: 'store', name: 'vacant (for lease)', h: 4.0, glazing: { bulkhead: 0.25, transom: 0.5, mullions: 5, frame: 'alu_black' }, door: { u: 0.8, w: 1.8, kind: 'double', recess: 0.3 }, gate: { kind: 'none' }, interior: { kind: 'empty', tone: '#a9aeb0', lit: 0.9 } },
          { u0: 23.6, u1: 35.0, kind: 'store', name: 'Pandora', h: 4.0, glazing: { bulkhead: 0.25, transom: 0.5, mullions: 4, frame: 'alu_black' }, door: { u: 0.65, w: 1.8, kind: 'double', recess: 0.3 }, gate: { kind: 'none' }, interior: { kind: 'shop_phone', tone: '#c3c5c6', lit: 1.0 } },
          { u0: 35.2, u1: 46.6, kind: 'store', name: 'Sephora', h: 4.0, glazing: { bulkhead: 0.25, transom: 0.5, mullions: 4, frame: 'alu_black' }, door: { u: 0.55, w: 1.8, kind: 'double', recess: 0.3 }, gate: { kind: 'none' }, interior: { kind: 'shop_clothing', tone: '#c6c8c9', lit: 1.0 } },
          { u0: 46.8, u1: 53.8, kind: 'store', name: 'retail', h: 4.0, glazing: { bulkhead: 0.25, transom: 0.5, mullions: 3, frame: 'alu_black' }, door: null, gate: { kind: 'none' }, interior: { kind: 'empty', tone: '#a9aeb0', lit: 0.9 } },
        ],
      },
      floors: [],
    }],
    refs: [],
    // AR34 evidence: ground floor and podium measured on the elevation rectified from (2026-08, 20 px/m: shop doors at u 5.4, 21.0, 31.1, 41.6;
    // signband 4.2-5.5; panes 0.78 m; blades 17.5-28.6 over u 0-31; terrace frame 31.8-47.2 x 13.0-19.9); the slab and the sedum roofs from
    // (2024-10-11, +-1.5 m); engine plates client/shots/ar34/bid3/sbs_r12/nulec.jpg.
    notes: 'No footprint record (newer than the data). A glass podium on 125th Street 30.6 m high (vertical fins at an ' +
      'irregular pitch, a slight inward cant, a heavy transom line every floor), a grey-framed terrace box cut in at ' +
      'north-u 162.3-177.7, 13.0-19.9 m; the museum\'s projecting grey portal at the east end (north-u 186-195, to 8.7 m); ' +
      'a dark ground-floor fascia 4.2-5.5 m with PANDORA and SEPHORA, target and TRADER JOE\'S channel letters at 8.7-10.5 m ' +
      'on the glass; a residential slab (~17 storeys, ~61 m) set back to the rear on 126th Street, a green roof ' +
      'on the podium.',
  },
  {
    id: 'w125-105b', addr: '105 W 125th St (Lenox corner)', name: 'Harlem Center (Marshalls, Dunkin\', CVS pharmacy)', bin: '1085673',
    at: [2149.74, -2805.06], comp: '4_-6:454', h: 21.0, status: 'measured',
    wall: { mat: 'brick_red', tint: '#c29d8c', dirt: 0.3 },
    faces: [{
      edge: 'front',
      base: {
        h: 7.2,
        bays: [
          { u0: 0.5, u1: 9.8, kind: 'store', name: 'TurboTax', h: 5.4, glazing: { bulkhead: 0.3, transom: 0.8, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.6 }, interior: { kind: 'shop_phone', lit: 0.6 } },
          { u0: 10.4, u1: 25.2, kind: 'store', name: 'Marshalls', h: 5.4, glazing: { bulkhead: 0.3, transom: 0.8, mullions: 5, frame: 'alu_bronze' }, door: { u: 0.35, w: 3.2, kind: 'double', recess: 0.8 }, interior: { kind: 'shop_clothing', lit: 0.6 },
            sign: { kind: 'panel', text: 'Marshalls', font: 'LibreFranklin-700', fg: '#0d3b8c', bg: '#ffffff', italic: true, u0: 19.8, u1: 23.9, y: 5.95, h: 1.6 } },
          { u0: 25.8, u1: 34.4, kind: 'store', name: 'Dunkin\'', h: 5.4, glazing: { bulkhead: 0.3, transom: 0.8, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.3, w: 1.1, recess: 0.4 }, interior: { kind: 'fastfood', lit: 0.8 },
            sign: { kind: 'panel', text: 'DUNKIN\'', font: 'Poppins-800', fg: '#f26a21', bg: '#ffffff', u0: 27.3, u1: 31.5, y: 5.95, h: 1.6 } },
          { u0: 35.0, u1: 45.0, kind: 'store', name: 'CVS pharmacy', h: 5.4, glazing: { bulkhead: 0.3, transom: 0.8, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.7, w: 1.8, kind: 'double', recess: 0.6 }, interior: { kind: 'pharmacy', lit: 0.6 },
            sign: { kind: 'panel', text: 'CVS pharmacy', font: 'Inter-700', fg: '#cc0000', bg: '#ffffff', u0: 39.4, u1: 43.2, y: 5.95, h: 1.6 } },
        ],
      },
      bays: { widths: [3.9, 2.8, 4.4, 2.8, 7.1, 2.8, 4.5, 2.8, 14.3] },
      floors: [{ n: 1, h: 13.8, win: 'Q', bays: [1, 3, 5, 7] }],
      windows: { Q: { w: 2.6, h: 2.6, sill: 4.9, kind: 'fixed', lights: '3/2', frame: 'alu_white', reveal: 0.22, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#d7cfc0', h: 0.12, proj: 0.04 }, lit: 1.0, blinds: 0 } },
      bands: [{ at: 18.0, h: 0.35, proj: 0.06, mat: 'cast_stone', tint: '#d9d2c4' }, { at: 16.5, h: 0.12, proj: 0.03, mat: 'cast_stone', tint: '#d9d2c4' }, { at: 8.4, h: 0.16, proj: 0.02, mat: 'brick_red', tint: '#c9987e' }, { at: 9.6, h: 0.16, proj: 0.02, mat: 'brick_red', tint: '#c9987e' }, { at: 14.9, h: 0.16, proj: 0.02, mat: 'brick_red', tint: '#c9987e' }, { at: 19.6, h: 0.16, proj: 0.02, mat: 'brick_red', tint: '#c9987e' }, { at: 20.3, h: 0.16, proj: 0.02, mat: 'brick_red', tint: '#c9987e' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.12, mat: 'cast_stone', tint: '#d9d2c4' },
    }],
    custom: { fn: 'bid3:hctop', with: 'kit' },
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.3, 0.5], n: 3 }, { k: 'hvac', at: [0.7, 0.6], n: 2 }, { k: 'bulkhead', at: [0.5, 0.8], w: 5, d: 4, h: 2.8 }] },
    refs: [],
    // the shed signs 3.9-4.2 m wide at 5.95-7.55 m; the slab's roof from; the slab's own windows are NOT measured (a plain ribbon).
    notes: '2001. A red-brick base 21 m high (vertical-bond panels round four 2.6 m square 6-light windows at 12.1-14.7 m, ' +
      'cast-stone belts at 16.5 and 18.0), the Lenox corner a brick tower with light stripes to 20 m and a wide window ' +
      'lettered Marshalls; the grey office slab above set back (ribbon windows with white frames, ~53 m to the roof per ' +
      'the compiled record) is drawn here as a plain bulkhead until the custom top is in. A sidewalk shed with signs on its ' +
      'parapet (TurboTax, Marshalls, Dunkin\', CVS pharmacy, 2026-08) covers the ground floor: the shop signs stand on it ' +
      'at 6.1 m.',
  },
  // ============================================================== SOUTH SIDE, west to east
  {
    id: 'acp-2089', addr: '2089 Adam Clayton Powell Jr. Blvd', name: 'Verizon, under a billboard tower (SE corner of ACP and 125th)', bin: '1057837',
    at: [1936.09, -2836.66], comp: '3_-6:61', h: 18.3, status: 'measured', custom: { fn: 'bid3:boards', with: 'kit' },
    wall: { mat: 'brick_painted', tint: '#847e6a', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 5.4,
        fascia: { h: 1.0, mat: 'panel_alu', tint: '#26282b' },
        bays: [
          { u0: 0.1, u1: 6.0, kind: 'store', name: 'Verizon', h: 4.2, glazing: { bulkhead: 0.15, transom: 0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.2 }, interior: { kind: 'shop_phone', lit: 0.6 },
            sign: { kind: 'channel', text: 'verizon', font: 'Inter-700', fg: '#ffffff', bg: null, u0: 0.6, u1: 4.8, y: 4.35, h: 0.75, lit: 'face' } },
        ],
      },
      bays: { n: 1, margin: [0.3, 0.3] },
      floors: [{ n: 3, h: 3.95, win: 'A', bays: [] }],
      windows: { A: { w: 1.0, h: 1.6, sill: 0.9, kind: 'dh', frame: 'alu_white' } },
      cornice: { kind: 'none' },
    }, {
      edge: 'corner',
      base: {
        h: 5.4, fascia: { h: 1.0, mat: 'panel_alu', tint: '#26282b' },
        bays: [{ u0: 0.3, u1: 8.0, kind: 'window', h: 4.2, glazing: { bulkhead: 0.15, transom: 0, mullions: 3, frame: 'alu_black' }, door: null, interior: { kind: 'shop_phone', lit: 0.6 } }],
      },
      bays: { n: 3, margin: [0.5, 0.5] },
      floors: [{ n: 3, h: 3.95, win: 'A', bays: [] }],
      windows: { A: { w: 1.0, h: 1.6, sill: 0.9, kind: 'dh', frame: 'alu_white' } },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black', items: [] },
    refs: [],
    notes: 'A narrow four-storey building (compiled 12.5 m; the billboard frame tops out at 18.3 m) clad on 125th Street ' +
      'and round the ACP corner in a grey metal billboard frame: one large panel 12.9-17.5 m and two stacked panels 5.2-10.8 m ' +
      '(the real advertisers are replaced by invented brands, bid3:boards, pending), the east wall a blind ' +
      'cream-painted brick party wall. Verizon at the ground floor under a black fascia wrapping the corner (2024-08).',
  },
  {
    id: 'w125-158', addr: '158 W 125th St', name: 'metro by T-Mobile, Apollo Beauty, and the vacant lot', bin: '1057836',
    at: [1952.78, -2827.43], comp: '3_-6:245', h: 5.45, status: 'measured', custom: { fn: 'bid3:lot158', with: 'kit' },
    // the two one-storey shops only (south-u 190.6-206.3, 20 m deep); the rest of the lot (206.3-221.6) is vacant behind a fence
    ring: [[1964.1, -2815.9], [1950.6, -2823.4], [1960.3, -2840.9], [1973.8, -2833.4]],
    wall: { mat: 'stucco', tint: '#d7ccb2', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: {
        h: 5.3,
        bays: [
          { u0: 0.5, u1: 8.0, kind: 'store', name: 'Apollo Beauty', h: 3.1, glazing: { bulkhead: 0.3, transom: 0, mullions: 2, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0, recess: 0.3 }, gate: { kind: 'rolldown', box: true, color: '#9aa0a3' }, interior: { kind: 'pharmacy', lit: 0.6 },
            sign: { kind: 'panel', text: 'APOLLO BEAUTY', font: 'AlfaSlabOne-400', fg: '#ffffff', bg: '#d8231f', stroke: { color: '#111111', w: 0.06 }, u0: 0.4, u1: 8.1, y: 3.3, h: 2.1, sub: null } },
          { u0: 8.3, u1: 15.6, kind: 'store', name: 'metro by T-Mobile', h: 3.1, glazing: { bulkhead: 0.25, transom: 0, mullions: 2, frame: 'alu_clear' }, door: { u: 0.55, w: 1.0, recess: 0.3 }, gate: { kind: 'rolldown', box: true, color: '#9aa0a3' }, interior: { kind: 'shop_phone', lit: 0.6 },
            sign: { kind: 'panel', text: 'metro', lines: null, font: 'Poppins-700', fg: '#46196e', bg: '#f4f2ee', u0: 8.2, u1: 15.7, y: 3.15, h: 2.25, sub: { text: 'by T-Mobile', font: 'Poppins-700', fg: '#e20074', size: 0.35 } } },
        ],
      },
      floors: [],
      cornice: { kind: 'none' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.12, coping: 'metal' }, membrane: 'black', items: [] },
    refs: [],
    notes: 'The compiled record (31 m, two storeys) is two one-storey shops 5.8 m high (Apollo Beauty 191.1-198.6: a red ' +
      'sign board 2.5-5.1 m, APOLLO BEAUTY in white with a black outline, a small "Apollo" script above; metro by T-Mobile ' +
      '198.8-206.3: a white board 2.7-5.4 m, metro in purple, by T-Mobile in magenta) and a vacant lot 206.3-221.6 behind a ' +
      '2.4 m green plywood fence with posters and graffiti, weeds and young trees (the fence and the lot: bid3 custom, pending).',
  },
  {
    id: 'w125-148', addr: '148 W 125th St', name: 'McDonald\'s, Sneakers & Jewelers (blue glass office block)', bin: '1057835',
    at: [1973.88, -2817.82], comp: '3_-6:211', h: 18.1, status: 'measured', custom: { fn: 'bid3:w148', with: 'kit' },
    wall: { mat: 'panel_alu', tint: '#c9ccce', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.3,
        wall: { mat: 'stone_lime', tint: '#cfc8ba', dirt: 0.3, to: 4.3 },   // pale warm-grey stone panels
        fascia: { h: 0.7, mat: 'stone_lime', tint: '#cfc8ba' },
        bays: [
          { u0: 0.3, u1: 4.0, kind: 'window', h: 3.4, glazing: { bulkhead: 0.7, transom: 0.5, mullions: 1, frame: 'alu_white' }, door: null, gate: { kind: 'none' }, interior: 'empty' },
          { u0: 4.1, u1: 8.3, kind: 'store', name: 'Sneakers & Jewelers', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.4 }, gate: { kind: 'rolldown', box: true, color: '#8e9396' }, interior: { kind: 'shop_clothing', lit: 0.6 },
            sign: { kind: 'panel', text: 'SNEAKERS & JEWELERS', font: 'Cinzel-700', fg: '#d8b25a', bg: '#16201a', u0: 4.1, u1: 8.3, y: 3.45, h: 0.78 } },
          { u0: 8.4, u1: 14.9, kind: 'store', name: 'McDonald\'s', h: 3.3, glazing: { bulkhead: 0.3, transom: 0.4, mullions: 3, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, recess: 0.6 }, interior: { kind: 'fastfood', lit: 0.8 },
            sign: { kind: 'channel', text: 'McDonald\'s', font: 'Inter-700', fg: '#ffffff', bg: '#4a2e22', u0: 9.0, u1: 14.2, y: 4.3, h: 0.72, lit: 'face' },
            awning: { kind: 'none' } },   // the red band is drawn by bid3:w148 (the kit's awning hangs from the fascia top, over the letters)
        ],
      },
      floors: [],
      cornice: { kind: 'band', h: 0.5, proj: 0.05, mat: 'panel_alu', tint: '#b8bcbf' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal' }, membrane: 'white',
      items: [{ k: 'hvac', at: [0.4, 0.5], n: 3 }, { k: 'bulkhead', at: [0.2, 0.7], w: 3.5, d: 3, h: 2.8 }, { k: 'sign', at: [0.9, 0.2], sign: { kind: 'lightbox', text: 'M', font: 'Inter-900', fg: '#ffc72c', bg: '#da291c', u0: 12.5, u1: 14.5, y: 0.4, h: 2.0 } }] },
    refs: [],
    notes: '1972, four storeys: a blue-glass curtain wall 5.4-18.1 m with light grey mullions every ~1.67 m and a transom ' +
      'each ~3.2 m floor, a narrower-gridded glass corner strip at the west end, grey metal panel returns; the ground floor ' +
      'Sneakers & Jewelers (east) and McDonald\'s (west, the golden arches on the fascia\'s west end).',
  },
  {
    id: 'w125-144', addr: '144 W 125th St', name: 'The Studio Museum in Harlem', bin: '',
    at: [1978.87, -2794.44], comp: '3_-6:378', h: 30.2, status: 'measured', custom: 'bid3:studio',
    // the whole lot between 148 W and 132 W (22.9 m; the compiled footprint was 15.0 m of it), through to 124th Street
    ring: [[1977.3, -2760.8], [1957.1, -2772.0], [1987.1, -2826.1], [2007.1, -2815.0]],
    wall: { mat: 'concrete_precast', tint: '#3a3b3e', dirt: 0.15 },
    refs: [],
    notes: 'Adjaye Associates with Cooper Robertson, opened November 2025. Charcoal precast (a fine granular face) in stacked ' +
      'boxes with deep frames; bronze doors under a bronze fascia lettered STUDIO MUSEUM IN HARLEM; the tall glazed box over ' +
      'the west end; loggias in the top boxes; the vertical STUDIO MUSEUM blade at the east end. Measured in bid3:studio. ' +
      'The rear (124th Street) and the sides are plain charcoal (no reference).',
  },
  {
    id: 'w125-132', addr: '132-140 W 125th St', name: 'Koch & Co. building (Fino, Snipes, Homeboy)', bin: '1057820',
    at: [2005.45, -2780.57], comp: '3_-6:122', h: 27.0, status: 'measured', custom: { fn: 'bid3:koch', with: 'kit' },
    wall: { mat: 'brick_buff', tint: '#cdb98d', dirt: 0.38 },
    faces: [{
      edge: 'front',
      base: {
        h: 6.5,
        wall: { mat: 'panel_grey', tint: '#17181a', dirt: 0.3, to: 6.5 },
        piers: { at: KC, w: 0.95, mat: 'panel_grey', tint: '#141517', proj: 0.07 },
        bays: [
          { u0: 1.75, u1: 12.05, kind: 'store', name: 'Fino', h: 4.4, glazing: { bulkhead: 0.35, transom: 0, mullions: 3, frame: 'alu_black' }, door: { u: 0.34, w: 1.4, kind: 'double', recess: 0.9 }, gate: { kind: 'rolldown', box: true, color: '#2a2b2d' }, interior: { kind: 'shop_clothing', tone: '#a39c92', lit: 1.0 },
            sign: { kind: 'panel', text: 'Fino', font: 'Jost-400', fg: '#f4f4f2', bg: '#7d8185', u0: 2.7, u1: 9.9, y: 4.75, h: 1.45, sub: null } },
          { u0: 12.55, u1: 24.2, kind: 'store', name: 'Snipes', h: 4.4, glazing: { bulkhead: 0.3, transom: 0, mullions: 3, frame: 'alu_black' }, door: { u: 0.42, w: 1.8, kind: 'double', recess: 0.8 }, gate: { kind: 'rolldown', box: true, color: '#7d8185' }, interior: { kind: 'shop_clothing', tone: '#a39c92', lit: 1.0 },
            sign: { kind: 'channel', text: 'snipes', font: 'Montserrat-800', fg: '#ffffff', bg: '#55585b', u0: 12.45, u1: 24.3, y: 4.5, h: 1.95 } },
          { u0: 24.75, u1: 29.9, kind: 'store', name: 'Homeboy', h: 4.1, glazing: { bulkhead: 0.3, transom: 0, mullions: 1, frame: 'alu_black' }, door: { u: 0.72, w: 1.0, recess: 0.5 }, gate: { kind: 'rolldown', box: true, color: '#7d8185' }, interior: { kind: 'shop_clothing', tone: '#a39c92', lit: 1.0 },
            sign: { kind: 'panel', text: 'HOMEBOY', font: 'Montserrat-800', fg: '#ffffff', bg: '#1f4fa3', u0: 24.8, u1: 28.2, y: 4.2, h: 2.1 } },
        ],
      },
      floors: [
        { n: 1, h: 3.5, open: kochOpen(KB, 'W2', 0.22, 2.08, 'P', 2.45, 0.85) },
        { n: 1, h: 4.0, open: kochOpen(KB, 'W3', 1.2, 1.73, 'P', 3.07, 0.8) },
        { n: 1, h: 4.7, open: KB.flatMap((cb) => [-1.55, 0, 1.55].map((d) => ({ u0: cb + d - 0.52, u1: cb + d + 0.52, win: 'A4', sill: 1.93, h: 2.02 }))) },
        { n: 1, h: 4.3, open: KB.map((cb) => ({ u0: cb - 2.13, u1: cb + 2.13, win: 'AR', sill: 0.65, h: 2.83 })) },
        { n: 1, h: 3.0, open: KB.flatMap((cb) => [-1.55, 0, 1.55].map((d) => ({ u0: cb + d - 0.52, u1: cb + d + 0.52, win: 'T6', sill: 0.8, h: 1.1 }))) },
      ],
      windows: {
        W2: { kind: 'fixed', w: 1.75, h: 2.08, sill: 0.22, mullions: 1, transom: 0.62, frame: 'steel_black', frameW: 0.07, reveal: 0.22, glass: 'glass_clear', lintel: { kind: 'none' },
          sillStone: { mat: 'terracotta_cream', tint: '#b4aa9b', h: 0.16, proj: 0.07 }, surround: { mat: 'terracotta_cream', tint: '#b9afa0', w: 0.15, proj: 0.05 }, blinds: 0.5, lit: 0.3 },
        W3: { kind: 'fixed', w: 1.75, h: 1.73, sill: 1.2, mullions: 1, transom: 0.5, frame: 'steel_black', frameW: 0.07, reveal: 0.22, glass: 'glass_clear', lintel: { kind: 'none' },
          sillStone: { mat: 'terracotta_cream', tint: '#b4aa9b', h: 0.14, proj: 0.08 }, surround: { mat: 'terracotta_cream', tint: '#b9afa0', w: 0.15, proj: 0.05 }, blinds: 0.5, lit: 0.3 },
        P: { kind: 'louvre', w: 1.75, h: 0.85, sill: 2.45, frame: 'metal_painted', reveal: 0.07, lintel: { kind: 'none' }, sillStone: null, surround: { mat: 'terracotta_cream', tint: '#b9afa0', w: 0.1, proj: 0.04 } },
        A4: { kind: 'arch', w: 1.04, h: 2.02, sill: 1.93, mullions: 1, frame: 'steel_black', frameW: 0.06, reveal: 0.2, glass: 'glass_clear',
          lintel: { kind: 'arch', mat: 'terracotta_cream', tint: '#b9afa0', h: 0.2, proj: 0.05 }, sillStone: { mat: 'terracotta_cream', tint: '#b4aa9b', h: 0.1, proj: 0.05 }, blinds: 0.5, lit: 0.3 },
        AR: { kind: 'arch', w: 4.26, h: 2.83, sill: 0.65, mullions: 3, frame: 'steel_black', frameW: 0.07, reveal: 0.8, glass: 'glass_clear',
          lintel: { kind: 'arch', mat: 'terracotta_cream', tint: '#c2b9ab', h: 0.62, proj: 0.1 }, sillStone: null, blinds: 0, lit: 0.25 },
        T6: { kind: 'fixed', w: 1.04, h: 1.1, sill: 0.8, frame: 'steel_black', frameW: 0.06, reveal: 0.18, glass: 'glass_clear', lintel: { kind: 'none' },
          sillStone: { mat: 'terracotta_cream', tint: '#b4aa9b', h: 0.1, proj: 0.06 }, surround: { mat: 'terracotta_cream', tint: '#b9afa0', w: 0.1, proj: 0.04 }, blinds: 0.4, lit: 0.3 },
      },
      piers: { mat: 'terracotta_cream', tint: '#dcd0b8', w: 0.95, proj: 0.14, at: KC, from: 6.5, to: 18.4, capital: false, base: false },
      cornice: { kind: 'none' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.1, coping: 'terracotta' }, membrane: 'white', items: [{ k: 'tank', at: [0.085, 0.84], r: 1.9, h: 3.2, legs: 2.4 }, { k: 'tank', at: [0.915, 0.84], r: 1.9, h: 3.2, legs: 2.4 }, { k: 'bulkhead', at: [0.5, 0.5], w: 8.0, d: 6.0, h: 3.2 }, { k: 'bulkhead', at: [0.3, 0.35], w: 4.0, d: 3.0, h: 3.0 }, { k: 'hvac', at: [0.6, 0.72], n: 4 }, { k: 'hvac', at: [0.25, 0.8], n: 3 }] },
    refs: [],
    notes: 'Koch & Co. department store (1893). Six buff-brick piers 5.69 m apart (centres u 1.25 ... 29.70 from the east end), banded in grey ' +
      'terracotta, five bays. Floors 2-3: two 1.75 m windows a bay (a mullion and a transom bar) under a dark louvred panel, a carved frieze ' +
      'at 10.0-11.07 with roundels on the piers, Corinthian capitals at 13.55-14.5, a belt cornice 15.0-15.93; floor 4: three round-headed ' +
      'windows a bay; a stone string course and balustrade 18.4-19.4; the arcade: a giant arch a bay (opening 4.26 m, crown 22.18, the ring 0.62 ' +
      'wide) over two posts and a lintel, carved spandrels with shields; the modillion cornice 23.0-23.7; the attic: three windows a bay under a ' +
      'band, pier caps to 26.2; plain brick parapet to 28.1 (the earlier 29.4 was a mosaic error). ' +
      'Shops (2026-08): Fino (a grey banner), Snipes (white letters on a corrugated grey fascia), Homeboy (blue board) between black granite piers.',
  },
  {
    id: 'w125-124', addr: '124 W 125th St', name: 'Panda Express, a vacant store, Raising Cane\'s', bin: '1081600',
    at: [2035.6, -2771.84], comp: '3_-6:331', h: 7.05, status: 'measured', custom: { fn: 'bid3:shut124', with: 'kit' },   // (AR34 batch 3: heights re-read, bid3Shops.js shut124)
    wall: { mat: 'panel_alu', tint: '#1e1f21', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: {
        h: 7.05,
        bays: [
          { u0: 1.1, u1: 6.1, kind: 'store', name: 'Raising Cane\'s', h: 3.3, glazing: { bulkhead: 0.6, transom: 0.75, mullions: 3, frame: 'alu_black', kick: 'brick_red' }, door: null, gate: { kind: 'none' }, interior: { kind: 'fastfood', tone: '#1e1f22', lit: 1.5 },
            // the vertical red CANE'S blade on the cladding at the east end
            blade: { kind: 'blade', text: 'CANE\'S', font: 'Oswald-700', fg: '#ffffff', bg: '#c8102e', u0: 1.15, w: 0.6, y: 5.0, h: 1.6 } },   // (c124east: four lights under a transom bar)
          { u0: 6.3, u1: 10.5, kind: 'store', name: 'Raising Cane\'s (the tower bay)', h: 3.0, glazing: { bulkhead: 0.1, transom: 0, mullions: 1, frame: 'alu_black' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.15, tint: '#c8102e' }, interior: { kind: 'fastfood', lit: 0.8 },
            gate: { kind: 'none' },
            },
          { u0: 10.8, u1: 24.2, kind: 'store', name: 'vacant', h: 3.0, glazing: { bulkhead: 0.3, transom: 0, mullions: 3, frame: 'alu_black' }, door: null,
            gate: { kind: 'none' }, interior: 'empty' },
          { u0: 24.6, u1: 30.7, kind: 'store', name: 'Panda Express', h: 3.1, glazing: { bulkhead: 0.4, transom: 0, mullions: 3, frame: 'alu_black' }, door: { u: 0.8, w: 1.0, recess: 0.3 }, interior: { kind: 'fastfood', lit: 0.8 },
            sign: { kind: 'channel', text: 'PANDA', font: 'Oswald-700', fg: '#d52b1e', bg: null, u0: 27.4, u1: 30.6, y: 4.45, h: 1.25 },
          },
        ],
      },
      floors: [],
      cornice: { kind: 'band', h: 0.3, proj: 0.04, mat: 'panel_alu', tint: '#26282a' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.08, coping: 'metal' }, membrane: 'black', items: [{ k: 'hvac', at: [0.3, 0.5], n: 3 }, { k: 'hvac', at: [0.75, 0.5], n: 2 }] },   // (b3b s124: no parapet shows over the black box)
    refs: [],
    notes: 'One storey, 7.7 m to the top of the black fascia wall. East to west (2026-08): Raising Cane\'s (south-u 92.3-101.9: ' +
      'a grey tower bay to 8.8 m with the Cane\'s oval, a brick bulkhead, red double doors, silver corrugated cladding over ' +
      'a wood-slat fascia), a vacant store under a black box with three grey roll gates (101.9-115.7), Panda Express ' +
      '(115.7-122.2: a wood-slat fascia with red letters and the panda roundel, a black vertical blade at its east end). ' +
      'Face u from the east end: Cane\'s 1.0-10.5, the vacant store 10.8-24.2, Panda Express 24.6-30.7.',
  },
  {
    id: 'w125-120', addr: '120 W 125th St', name: 'the former Fino shoe store (moved to 136 W 125th)', bin: '1057834',
    // (AR34 batch 3) heights: the compiled roof is 6.49 m (heightM);
    // height the gates' top reads 3.4-3.55 m and
    // the fascia's top 6.1-6.2 m (the 2.6-2.7 m fascia over the MOVED sheet's scale agrees); the w2 spec's 4.55 / 7.2 were read with the lens at 2.46 m
    at: [2059.81, -2768.21], comp: '4_-6:328', h: 6.3, status: 'measured', custom: { fn: 'bid3:shut120', with: 'kit' },
    wall: { mat: 'stucco', tint: '#bdb5a6', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: {
        h: 6.3,
        bays: [
          { u0: 0.85, u1: 14.75, kind: 'store', name: 'vacant (was Fino)', h: 3.5, glazing: { bulkhead: 0.3, transom: 0, mullions: 4, frame: 'alu_black' }, door: null,
            gate: { kind: 'rolldown', box: false, color: '#8a8d90', down: 0 }, interior: 'empty' },
        ],
      },
      floors: [],
      cornice: { kind: 'band', h: 0.1, proj: 0.04, mat: 'plain', tint: '#3a3936' },   // a dark metal cap on the fascia
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal' }, membrane: 'black', items: [] },
    refs: [],
    notes: 'One storey under a beige fascia to 6.2 m (a dark metal cap), the MENS WEAR / script F / SHOES letters still on it, graffiti-covered ' +
      'roll gates, a red "MOVED" sign (2026-08).',
  },
  {
    id: 'w124-117', addr: '117 W 124th St (the 125th Street front)', name: 'Victoria\'s Secret (glass retail block)', bin: '1089537',
    at: [2077.69, -2746.22], comp: '4_-6:137', h: 27.9, status: 'measured', custom: { fn: 'bid3:w117', with: 'kit' },
    wall: { mat: 'panel_alu', tint: '#aeb3b6', dirt: 0.15 },
    faces: [{
      edge: 'front',
      base: {
        h: 5.25,
        bays: [
          { u0: 0.4, u1: 11.8, kind: 'store', name: 'Bath & Body Works', h: 5.2, glazing: { bulkhead: 0.1, transom: 0.8, mullions: 5, frame: 'alu_clear' }, door: { u: 0.3, w: 1.8, kind: 'double', recess: 0.2 }, interior: { kind: 'shop_phone', lit: 0.6 },
            sign: { kind: 'channel', text: 'Bath & Body Works', font: 'Inter-700', fg: '#f4f4f0', bg: null, u0: 2.2, u1: 8.6, y: 4.5, h: 0.5, lit: 'face' } },
          { u0: 12.0, u1: 16.5, kind: 'store', name: 'Victoria\'s Secret', h: 5.2, glazing: { bulkhead: 0.1, transom: 0.8, mullions: 3, frame: 'alu_clear' }, door: null, interior: { kind: 'shop_clothing', lit: 0.6 } },
          { u0: 16.6, u1: 22.4, kind: 'store', name: 'Victoria\'s Secret (entrance)', h: 5.2, glazing: { bulkhead: 0.1, transom: 0.8, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.6, kind: 'double', recess: 0.5 }, interior: { kind: 'shop_clothing', lit: 0.6 },
            sign: { kind: 'channel', text: 'VICTORIA\'S SECRET', font: 'LibreBaskerville-400', fg: '#26344f', bg: null, u0: 16.9, u1: 22.1, y: 4.2, h: 0.4 },
            awning: { kind: 'none' } },   // the flat canopy is drawn by bid3:w117 (bid3Shops.js)
          { u0: 22.6, u1: 30.2, kind: 'store', name: 'Victoria\'s Secret', h: 5.2, glazing: { bulkhead: 0.1, transom: 0.8, mullions: 5, frame: 'alu_clear' }, door: null, interior: { kind: 'shop_clothing', lit: 0.6 } },
        ],
      },
      curtain: { mullion: 1.95, transom: 'floor', frame: 'alu_clear', glass: 'glass_clear', spandrel: 'alu_clear', spandrelH: 0.14, firstSpandrel: false, y1: 11.0 },   // floors 2-3 (the drapes); the glass above is bid3:w117's
      floors: [{ n: 1, h: 5.5, win: 'C' }, { n: 4, h: 4.2, win: 'C' }],
      windows: { C: { kind: 'ribbon', w: 1.9, h: 4.0, sill: 0.1, frame: 'alu_clear' } },
      cornice: { kind: 'band', h: 0.4, proj: 0.05, mat: 'panel_alu', tint: '#aeb3b6' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'white', items: [{ k: 'hvac', at: [0.5, 0.4], n: 4 }, { k: 'hvac', at: [0.3, 0.7], n: 5 }, { k: 'bulkhead', at: [0.7, 0.5], w: 5, d: 4, h: 3.2 }, { k: 'bulkhead', at: [0.15, 0.3], w: 4, d: 3, h: 3.0 }] },
    refs: [],
    // AR34 evidence: rectified (24 px/m): the glass front to 27.6-28 m, the shops (Bath & Body Works 0.4-11.8, Victoria's Secret 12.0-30.2), drapes over floors 2-3
    // at 3.7-11.0 m; the 14-storey part (48.8 m compiled) is NOT drawn.
    notes: '2017. On 125th Street a curved glass curtain wall (silver mullions ~1.95 m apart) to 28.2 m, pink drapes behind ' +
      'the glass of the lower two floors (Victoria\'s Secret), a flat canopy over revolving doors, the name in serif capitals ' +
      'over it; the 14-storey part (48.8 m compiled) is set back on 124th Street (drawn here at the frontage height: the ' +
      'tower is pending).',
  },
  {
    id: 'w125-100', addr: '100 W 125th St', name: 'Whole Foods Market, H&M, Burlington, Raymour & Flanigan', bin: '',
    at: [2100.8, -2723.78], comp: '4_-6:535', h: 28.9, status: 'measured', custom: { fn: 'bid3:w100', with: 'kit' },
    wall: { mat: 'panel_grey', tint: '#4a5058', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: {
        h: 5.6,
        bays: [
          { u0: 0.4, u1: 4.3, kind: 'store', name: 'Whole Foods Market (corner)', h: 5.2, glazing: { bulkhead: 0.1, transom: 0.4, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.3 }, interior: { kind: 'shop_food', tone: '#c9c6bb', lit: 1.0 } },
          { u0: 4.8, u1: 30.2, kind: 'store', name: 'Whole Foods Market', h: 5.0, glazing: { bulkhead: 0.1, transom: 0.6, mullions: 12, frame: 'alu_clear' }, door: { u: 0.35, w: 1.9, kind: 'double', recess: 0.3 }, interior: { kind: 'shop_food', tone: '#c9c6bb', lit: 1.0 },
            sign: { kind: 'channel', text: 'WHOLE FOODS MARKET', font: 'LibreBaskerville-700', fg: '#00674b', bg: null, u0: 8.6, u1: 18.2, y: 6.45, h: 0.9, lit: 'face' } },
          { u0: 30.5, u1: 34.6, kind: 'store', name: 'H&M', h: 5.0, glazing: { bulkhead: 0.1, transom: 0.6, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.3 }, interior: { kind: 'shop_clothing', tone: '#d6d2cb', lit: 1.0 },
            sign: { kind: 'panel', text: 'H&M', font: 'Inter-800', fg: '#e50010', bg: '#ffffff', u0: 31.0, u1: 34.0, y: 4.0, h: 1.0 } },
          { u0: 34.9, u1: 40.5, kind: 'store', name: 'retail', h: 5.0, glazing: { bulkhead: 0.1, transom: 0.6, mullions: 3, frame: 'alu_clear' }, door: null, interior: { kind: 'shop_clothing', tone: '#d6d2cb', lit: 1.0 } },
          { u0: 40.9, u1: 45.5, kind: 'entrance', door: { kind: 'double', w: 3.0, recess: 0.4, h: 2.7, transom: 0.8 },
            sign: { kind: 'panel', text: 'Raymour & Flanigan', font: 'PlayfairDisplay-700', fg: '#ffffff', bg: '#1c2f6b', u0: 41.0, u1: 45.4, y: 3.9, h: 1.3 } },
        ],
      },
      // the rain-screen mosaic (bid3:w100) with 1.85 x 2.5 m windows every 3.75 m from u 7.4; the recessed glass tower at the west end
      curtain: { u0: 40.8, u1: 46.3, y0: 5.6, y1: 22.7, mullion: 1.4, transom: 'floor', frame: 'alu_clear', glass: 'glass_blue', spandrel: 'panel_grey' },
      floors: [
        { n: 1, h: 5.4, keep: true, open: [{ u0: 0.85, u1: 4.25, win: 'CS', sill: 0.3, h: 4.8 }] },
        { n: 1, h: 6.0, keep: true, open: [{ u0: 0.85, u1: 4.25, win: 'CS', sill: 0.3, h: 5.4 }] },
        { n: 1, h: 5.7, keep: true, open: [...Array(9)].map((_, j) => ({ u0: 7.4 + 3.75 * j, u1: 7.4 + 3.75 * j + 1.85, win: 'W4', sill: 1.2, h: 2.8 })).concat([{ u0: 0.85, u1: 4.25, win: 'CS', sill: 0.3, h: 5.1 }]) },
        { n: 1, h: 6.6, open: [...Array(11)].map((_, j) => ({ u0: 7.4 + 3.75 * j, u1: 7.4 + 3.75 * j + 1.85, win: 'W5', sill: 1.1, h: 2.5 })).concat([{ u0: 0.85, u1: 4.25, win: 'CS', sill: 0.3, h: 6.0 }]) },
      ],
      windows: W100WIN,
      bands: [{ at: 11.0, h: 0.4, proj: 0.05, mat: 'panel_grey', tint: '#5a5f65' }],
      cornice: { kind: 'band', h: 0.45, proj: 0.08, mat: 'panel_grey', tint: '#6d7277' },
    }, {
      // the Lenox Avenue wall
      edge: 'corner',
      // the grocery's glass wall is bid3:w100's (opaque pale-teal panes under a louvre band); the kit draws the entrance only
      base: {
        h: 5.6,
        bays: [
          { u0: 11.0, u1: 16.4, kind: 'entrance', door: { kind: 'double', w: 1.4, recess: 0.4, h: 2.7, transom: 0.8 } },
        ],
      },
      floors: [
        { n: 1, h: 5.4, keep: true, open: [{ u0: 0.4, u1: 4.1, win: 'CS', sill: 0.3, h: 4.8 }, { u0: 57.6, u1: 61.2, win: 'CS', sill: 0.3, h: 4.8 }] },
        { n: 1, h: 6.0, keep: true, open: [{ u0: 0.4, u1: 4.1, win: 'CS', sill: 0.3, h: 5.4 }, { u0: 57.6, u1: 61.2, win: 'CS', sill: 0.3, h: 5.4 }] },
        { n: 1, h: 5.7, keep: true, open: [...Array(12)].map((_, j) => ({ u0: 6.2 + 4.0 * j, u1: 6.2 + 4.0 * j + 1.9, win: 'W4', sill: 1.3, h: 2.7 })).concat([{ u0: 0.4, u1: 4.1, win: 'CS', sill: 0.3, h: 5.1 }, { u0: 57.6, u1: 61.2, win: 'CS', sill: 0.3, h: 5.1 }]) },
        { n: 1, h: 6.6, open: [...Array(12)].map((_, j) => ({ u0: 6.2 + 4.0 * j, u1: 6.2 + 4.0 * j + 1.9, win: 'W5', sill: 0.5, h: 2.7 })).concat([{ u0: 0.4, u1: 4.1, win: 'CS', sill: 0.3, h: 6.0 }, { u0: 57.6, u1: 61.2, win: 'CS', sill: 0.3, h: 6.0 }]) },
      ],
      windows: W100WIN,
      bands: [{ at: 11.0, h: 0.4, proj: 0.05, mat: 'panel_grey', tint: '#3f444a' }],
      cornice: { kind: 'band', h: 0.45, proj: 0.08, mat: 'panel_grey', tint: '#4a4f55' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'white', items: [{ k: 'hvac', at: [0.2, 0.3], n: 5 }, { k: 'hvac', at: [0.55, 0.35], n: 6 }, { k: 'hvac', at: [0.8, 0.28], n: 4 }, { k: 'hvac', at: [0.35, 0.62], n: 5 }, { k: 'hvac', at: [0.7, 0.62], n: 5 }, { k: 'bulkhead', at: [0.5, 0.78], w: 6, d: 4, h: 3.5 }, { k: 'bulkhead', at: [0.12, 0.85], w: 4, d: 3.5, h: 3.2 }, { k: 'bulkhead', at: [0.9, 0.8], w: 4, d: 3, h: 3.0 }, { k: 'skylight', at: [0.4, 0.45], w: 5, d: 3 }] },
    refs: [],
    notes: '2013-17 retail block, five storeys to 29.5 m. A glazed corner strip at Lenox (u 0.85-4.25); floors 2-3 glass bands (white mullions ~1.1 m, ' +
      'louvre strips at the head of each) with the tenants\' banners on floor 3 (FURNITURE DELIVERY IN 3 DAYS OR LESS on orange, Raymour & ' +
      'Flanigan on navy); floors 4-5 a rain-screen mosaic of grey panels (bid3:w100) with 1.85 x 2.5 m windows every 3.75 m from u 7.4; the glass tower at u 40.8-46.3 ' +
      '(recessed in fact, drawn flush) with the Raymour & Flanigan and Burlington graphics; shops: Whole Foods at the corner, H&M, an empty store, the Raymour entrance.',
  },
];
