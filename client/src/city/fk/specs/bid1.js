// AR33 building specs, segment bid1: Morningside Avenue to Frederick Douglass Boulevard (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/bid1.json).
// Owner: the BID1 worker (docs/notes/ar33-bid1.md).
// Measured off facade orthos rectified:
// heights from the sidewalk at the building's front, u from the left end of the face as seen from the street. Shops as of 2026-08.

// ---------------------------------------------------------------- shared pieces
const BROWN = '#a39a86';                       // the brownstone trim of the 1900s tenements (lintels, sills, courses)
const tenWin = (o = {}) => ({
  w: 0.88, h: 2.3, sill: 0.25, kind: 'dh', lights: '1/1', frame: { mat: 'alu_black', tint: '#56605a' }, reveal: 0.15,
  lintel: { kind: 'hood', mat: 'brownstone', tint: BROWN, h: 0.36, ext: 0.16, proj: 0.08 },
  sillStone: { mat: 'brownstone', tint: BROWN, h: 0.18, proj: 0.08, lug: 0.13 }, ac: 0.28, blinds: 0.85, lit: 0.4, ...o,
});
// the four-storey 20 ft tenement row 383-377 W 125th (1901-05): storefront 0-3.5 m, signband to 4.45 m, three floors of
// 3.30 m, three windows 0.88 x 2.3 m (sills 0.25 m over the floor) in each 20 ft front, continuous brownstone head and sill courses, a bracketed
// pressed-metal cornice 1.6 m deep over a 0.7 m parapet.
// Brick re-measured 2026-10-02 on round a3 (the brick set now renders redder: 381 twin #d2845f against t1's #c48667): brick-only means real / twin
// 383 (1.00, 1.17, 1.41) and 381 (0.85, 0.92, 0.98), geometric means over the s381 / s383 / s379 views, applied as ratio^0.65; 379 / 377 take 381's factor; wall dirt 0.6. Second pass on b3: 383 (1.03, 1.06, 1.12), 381 (0.96, 1.04, 1.09)
const tenFloors = [{ n: 3, h: 3.3, win: 'A' }];
const TD = -0.15;
const tenBands = (L) => [
  { at: 6.94 + TD, h: 0.13, proj: 0.035, mat: 'brownstone', tint: BROWN }, { at: 10.24 + TD, h: 0.13, proj: 0.035, mat: 'brownstone', tint: BROWN },
  { at: 13.54 + TD, h: 0.13, proj: 0.035, mat: 'brownstone', tint: BROWN },
  { at: 4.57 + TD, h: 0.1, proj: 0.03, mat: 'brownstone', tint: BROWN }, { at: 7.87 + TD, h: 0.1, proj: 0.03, mat: 'brownstone', tint: BROWN }, { at: 11.17 + TD, h: 0.1, proj: 0.03, mat: 'brownstone', tint: BROWN },
].map((b) => ({ ...b, u0: 0, u1: L }));
const tenCornice = (tint) => ({ kind: 'bracketed', h: 1.1, proj: 0.55, mat: 'plain', tint, brackets: 9, bracketW: 0.15, dirt: 0.35 });
const tenRoof = { kind: 'flat', parapet: { h: 0.7, coping: 'panel_grey' }, membrane: 'black' };
const bays3 = (L) => ({ widths: [L / 2 - 1.0, 2.0, L / 2 - 1.0] });
const B16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Gates (round a1, 2026-10-01): the kit draws a gate box over every store bay and its roll-down curtain in the chipped-paint
// A bay without a closed gate gets
// none; a closed one is kept as data (spec.gates: edge, u0, u1, H, color, down, tags) for fk/custom/bid1.js (bid1:gates), which
// draws the housing, guides, ribbed curtain and spray tags in smooth painted panel.
// A/B flags: ?b1gates=kit keeps the kit's own gates (its slat curtains and tags, 2026-10-01 17:15), ?b1lit=1 keeps the spec's own `lit`
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const KITGATES = !!(QS && QS.get('b1gates') === 'kit'), KEEPLIT = !!(QS && QS.get('b1lit') === '1');
// (2026-10-02) a closed gate is the kit's own again: smooth painted steel since AR34 and BID3's graffiti painter over its slats; my drawn curtains carried
// font-lettered tags that read as text (a3_s319). ?b1gates=own keeps my drawn gates (bid1:gates) for an A/B
const OWNGATES = !!(QS && QS.get('b1gates') === 'own');
// BF36 (BIDFIX, 2026-10-02: teaser 8's t8StNickDive / t8StNickDiveE frames): 324's St. Nicholas face read as a blind white box with
// four black slits. Rebuilt: the light grey panel box
// over a charcoal herringbone base, the corner entrance under a grey projecting canopy, the pharmacy's posted windows with louvres
// over them, the imaging centre's six second-floor windows round the corner (posters, the purple header), the lobby door to the
// south. `?bf36=0` keeps the blind face and the white wall.
const BF36 = !(QS && QS.get('bf36') === '0');
const W324M = { w: 1.42, h: 3.1, sill: 0.4, kind: 'fixed', mullions: 0, transom: 0.4, frame: 'alu_black', reveal: 0.1, lintel: { kind: 'none' }, sillStone: null, blinds: 0.9, lit: 0.6 };
const W324_STNICH = BF36 ? {
  // u from the 125th corner southward (as the blind face's signs and vents); 27.5 m
  edge: [1561.51, -3030.95, 1574.66, -3055.08],
  base: {
    h: 4.0, wall: { mat: 'brick_tan', tint: '#45484e', dirt: 0.32, to: 4.0 },
    // (no door under the canopy on this side: the corner doors face 125th, the pier carries the cameras and a small CVS blade)
    bays: [
      { u0: 4.5, u1: 13.0, kind: 'window', interior: { kind: 'pharmacy', tone: '#a06c68', lit: 0.75 }, glazing: { bulkhead: 0.35, transom: 0.5, mullions: 5, frame: 'alu_clear' } },
      { u0: 20.5, u1: 23.2, kind: 'entrance', h: 3.0, door: { kind: 'double', w: 0.9, transom: 0.5, frame: 'alu_black' } },
    ],
  },
  floors: [{ n: 1, h: 2.8, win: 'none' }, { n: 1, h: 4.4, win: 'M', bays: [1, 2, 3, 4, 5, 6] }],
  bays: { widths: [4.1, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 13.8] },
  windows: { M: W324M, none: { kind: 'none' } },
  items: [[5.3, 2.4], [8.7, 2.4], [12.1, 2.0], [25.0, 3.0]].map(([u, w]) => ({ k: 'vent', u, y: 4.2, w, h: 0.62, tint: '#1c1c1c' })),
  cornice: { kind: 'parapet', h: 0.25, mat: 'panel_grey', tint: '#a9aba8' },
} : {
  // the St. Nicholas Ave face: the charcoal
  // corner pier, a dark herringbone-brick base with black louvre panels, a blind white upper box (the compiled default drew 15 small windows)
  edge: [1561.51, -3030.95, 1574.66, -3055.08],
  base: {
    h: 4.0, wall: { mat: 'brick_tan', tint: '#4b4d52', dirt: 0.25, to: 4.0 },
    bays: [{ u0: 20.5, u1: 23.2, kind: 'entrance', h: 3.0, door: { kind: 'double', w: 0.9, transom: 0.5, frame: 'alu_black' } }],
  },
  floors: [{ n: 1, h: 2.8, win: 'none' }, { n: 1, h: 4.4, win: 'none' }],
  windows: { none: { kind: 'none' } },
  items: [4, 9, 14, 25].map((u) => ({ k: 'vent', u, y: 4.2, w: 3.0, h: 0.8, tint: '#1c1c1c' })),
  cornice: { kind: 'parapet', h: 0.25, mat: 'panel_alu', tint: '#c9c8c4' },
};
const EV = {};
const prep = (spec) => {
  const gates = [];
  for (const f of spec.faces || []) {
    for (const b of (f.base && f.base.bays) || []) {
      if (b.kind !== 'store' && b.kind !== 'window') continue;
      const g = b.gate;
      if (KITGATES) { if (g === undefined) b.gate = { kind: 'none' }; if (!KEEPLIT) b.lit = Math.min(b.lit ?? 1, 0.75); continue; }
      const closed = g && (g.kind === 'rolldown' || g.kind === 'grille') && (g.down ?? 0) > 0;
      if (closed && !OWNGATES) {
        if (typeof g.graffiti === 'number') b.gate = { ...g, graffiti: { density: g.graffiti, style: 'throwups', seed: Math.round(b.u0 * 10) + 1 } };
      } else {
        if (closed) gates.push({ edge: f.edge === undefined ? 'front' : f.edge, u0: b.u0, u1: b.u1, H: b.h ?? f.base.h, color: g.color, down: g.down, grille: g.kind === 'grille', tags: g.graffiti ? Math.round(b.u0 * 10) + 1 : 0, dens: g.graffiti || 0 });
        if (g === undefined || g.kind !== 'none') b.gate = { kind: 'none' };
      }
      if (!KEEPLIT) b.lit = Math.min(b.lit ?? 1, 0.75);   // shops read bright behind clear glass (a1 plates): the day emission follows `lit`
    }
  }
  if (gates.length) { spec.gates = gates; if (!spec.custom) spec.custom = { fn: 'bid1:gates', with: 'kit' }; }
  if (!spec.custom) spec.custom = { fn: 'bid1:roofs', with: 'kit' };
  if (EV[spec.id]) spec.notes = (spec.notes || '') + ' AR34 evidence: ' + EV[spec.id] + '.';
  return spec;
};

const SPECS = [
  // ============================================================== NORTH SIDE, Morningside Ave to St. Nicholas Ave
  {
    id: 'w125-383', addr: '383 W 125th St (NE corner of Morningside Ave)', bin: '1059303', status: 'measured',
    at: [1476.38, -3154.95], comp: '2_-7:67', h: 14.45,
    wall: { mat: 'brick_red', tint: '#b99278', dirt: 0.6 },
    faces: [
      {
        edge: 'front',
        base: {
          h: 3.35, fascia: { h: 0.95, mat: 'panel_alu', tint: '#121212', proj: 0.3 },
          bays: [
            // CAPSULE: RobotoSlab-900 sets narrower than AlfaSlabOne, so the same span takes taller letters
            { u0: 0.05, u1: 5.87, kind: 'store', name: 'Capsule', interior: { kind: 'shop_clothing', tone: '#2a2a2c', lit: 0.6 },
              sign: { kind: 'channel', text: 'CAPSULE', font: 'RobotoSlab-900', fg: '#5e4f3a', bg: null, u0: 0.35, u1: 3.95, h: 0.66, y: 3.49, depth: 0.08, lit: 'face', tracking: 0.04, bulbs: true },
              glazing: { bulkhead: 0.35, transom: 0, mullions: 3, frame: 'steel_black', kick: 'steel_black' },
              door: { u: 0.55, w: 1.0, kind: 'glass', recess: 0.25 }, gate: { kind: 'none' } },
          ],
        },
        floors: tenFloors, bays: bays3(5.92), windows: { A: tenWin({ lintel: { kind: 'hood', mat: 'brownstone', tint: BROWN, h: 0.36, ext: 0.16, proj: 0.08 }, sillStone: { mat: 'brownstone', tint: BROWN, h: 0.18, proj: 0.08, lug: 0.13 }, frame: { mat: 'alu_black', tint: '#2e2723' }, sheer: 0.85, blinds: 0.6, sheerTint: '#ffffff' }) }, bands: tenBands(5.92),
        cornice: tenCornice('#6e4a45'),
      },
      {
        // Morningside Ave side: a
        // brick ground floor with a side door, the Capsule window at the corner, eight irregular bays, a stair fire escape
        // at the north end and round iron balconies by the corner (bid1:w383)
        edge: [1469.47, -3148.56, 1480.55, -3168.65],
        base: {
          h: 3.35, wall: { mat: 'stucco', tint: '#8e5a4f', dirt: 0.45, to: 3.35 }, fascia: { h: 0.95, mat: 'panel_alu', tint: '#121212', proj: 0.3, u0: 19.3, u1: 22.94 },
          bays: [
            { u0: 19.4, u1: 22.85, kind: 'window', interior: { kind: 'shop_clothing', tone: '#2a2a2c', lit: 0.6 },
              sign: { kind: 'channel', text: 'CAPSULE', font: 'RobotoSlab-900', fg: '#5e4f3a', bg: null, u0: 19.5, u1: 22.8, h: 0.66, y: 3.49, depth: 0.08, lit: 'face', tracking: 0.04, bulbs: true },
              glazing: { bulkhead: 0.35, transom: 0, mullions: 2, frame: 'steel_black', kick: 'steel_black' }, gate: { kind: 'none' } },
            { u0: 3.1, u1: 4.3, kind: 'entrance', door: { kind: 'solid', w: 1.0, tint: '#2b2522', transom: 0.45 } },
          ],
        },
        floors: tenFloors, bays: { widths: [2.4, 2.8, 2.5, 2.5, 2.3, 2.4, 4.2, 3.81] }, windows: { A: tenWin({ lintel: { kind: 'hood', mat: 'brownstone', tint: BROWN, h: 0.36, ext: 0.16, proj: 0.08 }, sillStone: { mat: 'brownstone', tint: BROWN, h: 0.18, proj: 0.08, lug: 0.13 }, frame: { mat: 'alu_black', tint: '#2e2723' }, sheer: 0.85, blinds: 0.6, sheerTint: '#ffffff' }) }, bands: tenBands(22.94),
        fireEscape: { bays: [0, 1], floors: [1, 3], depth: 1.0, drop: true },
        // the red base carries one sprayed tag (ms383_S, 2026-08): invented tags in its place and size; the base paint re-measured on b3: real #805242 / twin #823d30, ratio^0.65 from #9c4b3d
        graffiti: { u0: 8.2, u1: 12.2, y0: 1.0, y1: 2.6, density: 0.7, style: 'tags', seed: 383 },   // (d3: at 0.35 the tags hardly showed)
        cornice: tenCornice('#6e4a45'),
      },
    ],
    custom: { fn: 'bid1:w383', with: 'kit' },
    roof: { ...tenRoof, items: [{ k: 'bulkhead', at: [0.5, 0.8], w: 2.6, d: 2.4, h: 2.6 }] },
    refs: [],
    notes: 'Capsule: gold marquee-bulb letters on a black box fascia that wraps the corner (SIGN request: bulb letters). ' +
      'Morningside face bays approximate; roof items not checked yet.',
  },
  {
    id: 'w125-381', addr: '381 W 125th St', bin: '1059319', status: 'measured',
    at: [1480.57, -3150.11], comp: '2_-7:56', h: 14.45,
    wall: { mat: 'brick_red', tint: '#c4937a', dirt: 0.6 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.15, fascia: { h: 1.15, mat: 'panel_alu', tint: '#141414', proj: 0.12, u0: 1.2, u1: 6.11 },
        bays: [
          { u0: 0.15, u1: 1.15, kind: 'entrance', h: 2.85, door: { kind: 'solid', w: 0.9, tint: '#3a322c', transom: 0.5 } },
          { u0: 1.25, u1: 6.0, kind: 'store', name: 'K Blessing Good Year (barbershop, braids)', interior: { kind: 'default', tone: '#434346', lit: 0.75 },
            sign: { kind: 'panel', text: 'Blessing   GOOD YEAR', font: 'Oswald-700', fg: '#ffffff', bg: '#0d0d0d', u0: 1.25, u1: 6.0, h: 1.0, y: 3.23, depth: 0.08, lit: 'face', logo: 'bid1:blessing', logoAt: 'fill' },
            glazing: { bulkhead: 0.3, transom: 0.35, mullions: 2, frame: 'alu_black' }, door: { u: 0.62, w: 0.95, kind: 'glass', recess: 0.2 },
            gate: { kind: 'rolldown', color: '#8e9396' } },
        ],
      },
      floors: tenFloors, bays: bays3(6.11), windows: { A: tenWin({ frame: { mat: 'alu_white', tint: '#e4e2dc' }, sheer: 0.8, blinds: 0.5, sheerTint: '#ffffff' }) }, bands: tenBands(6.11),
      cornice: tenCornice('#454546'),
    }],
    roof: tenRoof,
    refs: [],
    notes: 'the residential door (left) serves 381; the sign: white brush-script "Blessing" with a K monogram, bold "GOOD YEAR", two small service lines and phone numbers (drawn by bid1:blessing).',
  },
  {
    id: 'w125-379', addr: '379 W 125th St', bin: '1059304', status: 'measured',
    at: [1487.38, -3149.9], comp: '2_-7:3', h: 14.45,
    wall: { mat: 'brick_red', tint: '#c69980', dirt: 0.6 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.15, fascia: { h: 1.15, mat: 'panel_alu', tint: '#1b2f6e', proj: 0.12, u0: 1.25, u1: 6.02 },
        bays: [
          { u0: 0.15, u1: 1.15, kind: 'entrance', h: 3.05, door: { kind: 'solid', w: 0.9, tint: '#4a2e22', transom: 0.7 } },
          { u0: 1.3, u1: 5.95, kind: 'store', name: 'Family Pharmacy & Surgical', interior: { kind: 'pharmacy', tone: '#727575', lit: 0.5 },
            sign: { kind: 'panel', text: 'PHARMACY & SURGICAL', font: 'BarlowCondensed-800', fg: '#ffffff', bg: '#1d4fb0', u0: 1.3, u1: 5.95, h: 1.0, y: 3.23, depth: 0.1, lit: 'face', logo: 'bid1:pharmacy', logoAt: 'fill' },
            blade: { kind: 'blade', text: 'PHARMACY', lines: ['PHARMACY', 'SURGICAL'], font: 'BarlowCondensed-800', fg: '#1d4fb0', bg: '#ffffff', u0: 5.2, u1: 5.9, h: 0.9, y: 4.65, proj: 0.15, lit: 'face' },
            glazing: { bulkhead: 0.3, transom: 0.35, mullions: 2, frame: 'alu_clear' }, door: { u: 0.2, w: 0.95, kind: 'glass', recess: 0.25 },
            vinyl: [{ text: 'DESIGNER STYLE SUNGLASSES', color: '#e8e0d0', u: 1.4, y: 1.5, w: 1.6 }] },
        ],
      },
      floors: tenFloors, bays: bays3(6.02), windows: { A: tenWin({ sheer: 0.3 }) }, bands: tenBands(6.02),
      cornice: tenCornice('#454546'),
    }],
    roof: tenRoof,
    refs: [],
    notes: 'residential door with a round-arched transom (the kit draws a flat transom); sign: red script "Family" over white "PHARMACY & SURGICAL" on blue, a red strip "FARMACIA * LOTTO", "379 W 125 ST".',
  },
  {
    id: 'w125-377', addr: '377 W 125th St', bin: '1059320', status: 'measured',
    at: [1493.78, -3148.87], comp: '2_-7:161', h: 14.6,
    wall: { mat: 'brick_red', tint: '#ac7d61', dirt: 0.6 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.15, fascia: { h: 1.15, mat: 'panel_alu', tint: '#4a3524', proj: 0.12 },
        bays: [
          { u0: 0.15, u1: 5.9, kind: 'store', name: 'Yemeni restaurant', interior: { kind: 'restaurant', tone: '#34302c', lit: 0.3 },
            sign: { kind: 'panel', text: 'المطعم اليمني', font: 'Inter-700', fg: '#d9b25a', bg: '#4a3524', u0: 0.15, u1: 5.9, h: 1.0, y: 3.23, depth: 0.1, lit: 'face', logo: 'bid1:yemeni', logoAt: 'fill' },
            blade: { kind: 'blade', text: 'اليمني', font: 'Inter-700', fg: '#d9b25a', bg: '#141414', u0: 5.3, u1: 5.9, h: 2.2, y: 5.05, proj: 0.15, lit: 'face' },
            glazing: { bulkhead: 0.4, transom: 0.35, mullions: 2, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.3 } },
        ],
      },
      floors: tenFloors, bays: bays3(6.02), windows: { A: tenWin({ sheer: 0.3 }) }, bands: tenBands(6.02),
      cornice: tenCornice('#454546'),
    }],
    roof: tenRoof,
    refs: [],
    notes: 'a street tree hides the upper floors in 2026; the leaf-off 2023-03 view confirms the row pattern (three windows, brownstone heads and sills, black bracketed cornice). Arabic gold-on-brown sign with an eight-pointed star ornament at the left; two black vertical blades with gold Arabic on the piers.',
  },
  {
    id: 'w125-375', addr: '375 W 125th St (Showmans)', bin: '1059305', status: 'measured',
    at: [1497.86, -3143.07], comp: '2_-7:65', h: 14.6,
    wall: { mat: 'brick_painted', tint: '#e6e2da', dirt: 0.45 },
    faces: [{
      edge: 'front',
      wall: { mat: 'brick_painted', tint: '#e6e2da', dirt: 0.45 },
      base: {
        h: 4.3,
        bays: [
          { u0: 0.2, u1: 4.2, kind: 'store', h: 2.75, name: 'Showmans (jazz club)', interior: 'restaurant', lit: 0.8,
            sign: { kind: 'lightbox', text: 'Showmans', font: 'DancingScript-700', fg: '#111111', bg: '#f2f0ea', u0: 0.6, u1: 3.8, h: 0.62, y: 3.4, depth: 0.16, lit: 'face', frame: '#1a1a1a' },
            awning: { kind: 'fixed', color: '#141414', text: 'Showmans', drop: 0.3, proj: 1.3 },
            glazing: { bulkhead: 0.5, transom: 0.3, mullions: 1, frame: 'alu_black' }, door: { u: 0.35, w: 1.0, kind: 'glass', recess: 0.4 } },
          { u0: 4.5, u1: 6.3, kind: 'store', h: 2.75, interior: 'empty', gate: { kind: 'rolldown', color: '#b8b6b0', down: 1 } },
        ],
      },
      floors: tenFloors, bays: bays3(6.54),
      windows: { A: tenWin({ frame: { mat: 'alu_black', tint: '#2a2c2c' }, sheer: 0.55, sheerTint: '#ffffff', lintel: { kind: 'flat', mat: 'brick_painted', tint: '#d9d5cc', h: 0.2, ext: 0.08, proj: 0.03 }, sillStone: { mat: 'stone_lime', tint: '#d5d0c6', h: 0.12, proj: 0.05 } }) },
      fireEscape: { bays: [1, 2], floors: [1, 3], depth: 1.05, drop: true },
      cornice: tenCornice('#454546'),
    }],
    roof: tenRoof,
    refs: [],
    notes: 'ground floor front is exposed red brick (the painted white starts above the signband) -> a base wall override is not in the schema; Showmans: white lightbox with black script plus a black canopy with white script.',
  },
  {
    id: 'w125-365', addr: '365 W 125th St (USPS Manhattanville Station)', bin: '1059307', status: 'measured',
    at: [1524.16, -3152.81], comp: '2_-7:32', h: 11.7,
    wall: { mat: 'brick_tan', tint: '#cab49b', dirt: 0.35 },   // (b3 s375 / a3 s365: real / twin (0.92, 1.01, 1.12), (0.91, 0.99, 1.06), (1.03, 1.12, 1.15); ratio^0.65 from #d1b091)
    faces: [{
      edge: 'front',
      base: {
        h: 5.2,
        bays: [
          { u0: 3.1, u1: 9.95, kind: 'window', h: 3.9, interior: { kind: 'bank', lit: 0.75 },
            glazing: { bulkhead: 1.75, transom: 0.7, mullions: 8, frame: 'alu_white', kick: { mat: 'brick_tan', tint: '#cab49b' } }, gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#7d8083', drop: 0.12, proj: 0.9 } },
          { u0: 12.5, u1: 17.5, kind: 'store', h: 3.15, name: 'Manhattanville Station', interior: { kind: 'bank', tone: '#3a3c3c', lit: 0.5 },
            glazing: { bulkhead: 0.1, transom: 0.7, mullions: 2, frame: 'alu_clear', kick: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.6 }, gate: { kind: 'none' } },
          { u0: 19.1, u1: 26.1, kind: 'window', h: 3.9, interior: { kind: 'bank', lit: 0.75 },
            glazing: { bulkhead: 1.75, transom: 0.7, mullions: 8, frame: 'alu_white', kick: { mat: 'brick_tan', tint: '#cab49b' } }, gate: { kind: 'none' },
            awning: { kind: 'fixed', color: '#7d8083', drop: 0.12, proj: 0.9 } },
        ],
      },
      floors: [{ n: 1, h: 6.5, win: 'R', bays: [1, 3, 5] }],
      bays: { widths: [3.1, 6.87, 1.33, 6.67, 1.23, 6.67, 4.23] },
      windows: { R: { w: 6.6, h: 2.0, sill: 2.0, kind: 'ribbon', mullions: 5, transom: 0.7, frame: 'alu_white', reveal: 0.16, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#cfc8b8', h: 0.12, proj: 0.04 }, surround: { mat: 'cast_stone', tint: '#d4cdbe', w: 0.12, proj: 0.03 }, blinds: 0.2, lit: 0.3 } },
      items: [
        // raised brushed-aluminium letters over the entrance and the blue-and-white
        // Post Office sign standing on the parapet over the centre
        { k: 'sign', sign: { kind: 'channel', text: 'UNITED STATES POST OFFICE', font: 'Inter-500', fg: '#7a7068', bg: null, u0: 8.8, u1: 19.5, h: 0.46, y: 5.35, depth: 0.05, lit: 'none', tracking: 0.45 } },
        { k: 'sign', sign: { kind: 'panel', text: 'Post Office', font: 'Inter-700', fg: '#0b3d91', bg: '#ffffff', u0: 13.0, u1: 16.4, h: 1.0, y: 11.5, depth: 0.1, lit: 'none', logo: 'bid1:usps', logoAt: 'right' } },
      ],
      cornice: { kind: 'band', h: 0.35, proj: 0.06, mat: 'cast_stone', tint: '#cfc8b8' },
    }],
    custom: { fn: 'bid1:w365', with: 'kit' },
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'terracotta' }, membrane: 'white',
      items: [{ k: 'antenna', at: [0.47, 0.1], h: 6.5 }] },
    refs: [],
    notes: 'the three 2nd-floor openings are steel sash grids (6 x 3 lights, the top row hoppers) in cast-stone frames; the rows ' +
      'bays list uses bays 1, 3, 5; "UNITED STATES POST OFFICE" is raised aluminium letters at 5.4-5.85 m (the plaque item ' +
      'stands in until a letters item exists); the entrance surround is pale green glazed tile (celadon) - not in the schema. ' +
      'flag pole with the US flag on the roof over the entrance.',
  },
  {
    id: 'w125-361', addr: '361 W 125th St (Harlem Commonwealth Council)', bin: '1059308', status: 'measured',
    at: [1534.82, -3125.05], comp: '3_-7:209', h: 22.25,
    wall: { mat: 'brick_red', tint: '#b99b83', dirt: 0.35 },   // (b3: brick-only real #ae866b / twin #c58d6d, ratio^0.65 from #c9a085; piers likewise)
    custom: { fn: 'bid1:w361', with: 'kit' },
    faces: [{
      edge: 'front',
      base: {
        h: 3.0, fascia: { h: 1.5, mat: 'granite_pink', tint: '#7c4b3e', proj: 0.03 },
        bays: [
          { u0: 0.4, u1: 4.6, kind: 'store', h: 3.4, name: 'Harlem Commonwealth Council', interior: 'bank',
            sign: { kind: 'channel', text: 'HCC', font: 'Inter-800', fg: '#ffffff', bg: '#b3262c', u0: 1.5, u1: 2.3, h: 0.7, y: 1.9, depth: 0.02 },
            awning: { kind: 'fixed', color: '#b8262e', drop: 0.25, proj: 0.6 },
            glazing: { bulkhead: 0.2, transom: 0.4, mullions: 2, frame: 'alu_clear' }, door: { u: 0.35, w: 1.0, kind: 'glass', recess: 0.2 } },
          { u0: 4.8, u1: 9.8, kind: 'window', h: 3.4, interior: 'bank', awning: { kind: 'fixed', color: '#b8262e', drop: 0.25, proj: 0.6 },
            glazing: { bulkhead: 0.2, transom: 0.4, mullions: 3, frame: 'alu_clear' },
            vinyl: [{ text: 'EDUCATION  EMPOWERMENT', color: '#f0ece4', u: 0.5, y: 1.2, w: 3.2 }] },
          { u0: 10.0, u1: 15.0, kind: 'store', h: 3.4, interior: 'empty', awning: { kind: 'fixed', color: '#b8262e', drop: 0.25, proj: 0.6 },
            gate: { kind: 'grille', color: '#6e5a50', down: 1 } },
        ],
      },
      // one opening of three double-hung sashes in dark bronze between each pair of piers
      floors: [{ n: 5, h: 3.55, win: 'A', bays: [1, 2, 3] }],
      bays: { widths: [0.33, 4.667, 4.667, 4.667, 1.07] },
      windows: { A: { w: 3.85, h: 2.5, sill: 0.1, kind: 'fixed', mullions: 2, transom: 1.25, frame: { mat: 'alu_bronze', tint: '#3e3a2e' }, frameW: 0.06, reveal: 0.14, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#c9a88e', h: 0.12, proj: 0.04 }, ac: 0.3, blinds: 0.85, sheer: 0.15, sheerTint: '#ffffff', lit: 0.4 } },
      piers: { mat: 'brick_red', tint: '#b3957e', w: 0.8, proj: 0.12, at: [0.33, 5.0, 9.67, 14.33], from: 'base', to: 'cornice', capital: false },
      bands: [2, 3, 4, 5, 6, 7].map((n) => ({ at: `floor:${n}`, h: 0.22, proj: 0.06, mat: 'cast_stone', tint: '#c9a88e' })),
      items: [
        { k: 'sign', sign: { kind: 'panel', text: '', bg: '#141414', u0: 3.1, u1: 11.1, h: 0.62, y: 10.94, depth: 0.08, lit: 'none' }, z: 0.2 },
        // the letters,
        // the cap height ~0.55-0.6 of the bar, the letters' tops at the bar's top edge, deep returns
        { k: 'sign', sign: { kind: 'channel', text: 'HARLEM COMMONWEALTH COUNCIL', font: 'LibreFranklin-800', fg: '#f4f4f2', bg: null, u0: 3.2, u1: 11.0, h: 0.5, y: 11.11, fill: 0.76, tracking: 0.02, depth: 0.1, lit: 'none' }, z: 0.29 },
      ],
      cornice: { kind: 'band', h: 0.6, proj: 0.12, mat: 'brick_red', tint: '#a85c3e' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'terracotta' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.3, 0.6], w: 3.5, d: 3.0, h: 3.0 }] },
    refs: [],
    notes: 'HEIGHT: the inventory has 4 floors / 15.5 m; the building has six storeys to a 23.8 m parapet. ' +
      'Three bays of triple windows between brick piers with panelled spandrels; "HARLEM COMMONWEALTH COUNCIL" black box sign with white letters at the 4th floor (plaque stands in); granite base band.',
  },
  {
    id: 'w125-351', addr: '351 W 125th St (NW corner of St. Nicholas Ave)', bin: '1059309', status: 'measured',
    at: [1555.0, -3113.94], comp: '3_-7:205', h: 21.0, custom: { fn: 'bid1:w351', with: 'kit' },
    wall: { mat: 'brick_tan', tint: '#8b8678', dirt: 0.6 },   // (a3: real #8a8270 / twin #8f7d66 over the upper front, ratio^0.65 from #8e7f69 -> #8b8270; d3 still warm (1.0, 1.05, 1.1) -> #8b8678)
    faces: [
      {
        edge: 'front',
        base: {
          h: 4.5,
          piers: { at: [2.8, 6.4, 10.5, 14.6, 22.6, 25.95], w: 0.3, mat: 'cast_stone', tint: '#a79f90', proj: 0.05 },
          bays: [
            { u0: 0.05, u1: 2.65, kind: 'store', h: 2.75, name: 'Apollo Grab & Go', interior: 'shop_food', gate: { kind: 'rolldown', color: '#9a9ea2', down: 1 },
              sign: { kind: 'panel', text: 'APOLLO', font: 'Anton', fg: '#ffffff', bg: '#6a1f5c', u0: 0.05, u1: 2.65, h: 1.6, y: 2.85, depth: 0.1, lit: 'face', logo: 'bid1:apollograb', logoAt: 'fill' } },
            { u0: 2.95, u1: 6.25, kind: 'store', h: 2.75, name: 'iPizza NY', interior: 'restaurant', lit: 1,
              sign: { kind: 'panel', text: 'PIZZA', font: 'Anton', fg: '#ffffff', bg: '#c8202b', u0: 2.95, u1: 6.25, h: 1.6, y: 2.85, depth: 0.1, lit: 'face', logo: 'bid1:ipizza', logoAt: 'fill' },
              blade: { kind: 'blade', text: 'iPizza NY', font: 'KaushanScript', fg: '#c8202b', bg: '#ffffff', u0: 2.4, u1: 3.2, h: 0.8, y: 3.5, proj: 0.1, lit: 'face', logo: 'bid1:ipizzaround', logoAt: 'fill' },
              glazing: { bulkhead: 0.4, transom: 0.3, mullions: 1, frame: 'alu_clear' }, door: { u: 0.25, w: 0.95, kind: 'glass', recess: 0.3 } },
            { u0: 6.55, u1: 10.35, kind: 'store', h: 2.75, name: 'Kazourajab High Tech (phones)', interior: 'shop_phone', lit: 1,
              sign: { kind: 'panel', text: 'KAZOURAJAB HIGH TECH INC', font: 'BarlowCondensed-800', fg: '#1a1a1a', bg: '#f4f4f0', u0: 6.55, u1: 10.35, h: 1.6, y: 2.85, depth: 0.08, lit: 'face', logo: 'bid1:kazourajab', logoAt: 'fill' },
              glazing: { bulkhead: 0.4, transom: 0.3, mullions: 1, frame: 'alu_clear' }, door: { u: 0.5, w: 0.95, kind: 'glass', recess: 0.2 } },
            { u0: 10.65, u1: 14.45, kind: 'store', h: 2.75, name: 'Harlem USA Nails II', interior: 'default', lit: 1,
              sign: { kind: 'panel', text: 'NAILS II', font: 'BarlowCondensed-800', fg: '#ffffff', bg: '#1f3e9e', u0: 10.65, u1: 14.45, h: 1.6, y: 2.85, depth: 0.1, lit: 'face', logo: 'bid1:nails', logoAt: 'fill' },
              glazing: { bulkhead: 0.45, transom: 0.3, mullions: 1, frame: 'alu_clear' }, door: { u: 0.78, w: 0.95, kind: 'glass', recess: 0.2 },
              vinyl: [{ text: 'OPEN', color: '#ff3030', u: 2.8, y: 2.4, w: 0.5 }] },
            { u0: 14.75, u1: 15.85, kind: 'entrance', h: 2.7, door: { kind: 'glass', w: 1.0, transom: 0.55, frame: 'alu_bronze' }, sign: { kind: 'numbers', text: '351 W', fg: '#e8e2d2', u0: 14.8, u1: 15.8, h: 0.2, y: 2.95 } },
            { u0: 16.05, u1: 22.45, kind: 'store', h: 2.75, name: 'GEM Pawnbrokers / We Buy & Loan', interior: 'default', lit: 1,
              sign: { kind: 'panel', text: 'GEM PAWNBROKERS   WE BUY & LOAN', font: 'Anton', fg: '#ffffff', bg: '#0e0e0e', u0: 14.75, u1: 22.45, h: 1.35, y: 3.05, depth: 0.1, lit: 'face', logo: 'bid1:gem', logoAt: 'fill' },
              glazing: { bulkhead: 0.55, transom: 0.3, mullions: 3, frame: 'alu_clear', kick: 'granite_grey' }, door: { u: 0.3, w: 1.0, kind: 'glass', recess: 0.2 } },
            { u0: 22.75, u1: 25.8, kind: 'store', h: 2.75, name: 'Perfect Brows threading salon', interior: 'default', lit: 1,
              sign: { kind: 'panel', text: 'Perfect Brows', font: 'GreatVibes', fg: '#d0318a', bg: '#f7f5f2', u0: 22.75, u1: 25.8, h: 1.45, y: 2.9, depth: 0.08, lit: 'face', logo: 'bid1:perfectbrows', logoAt: 'fill' },
              glazing: { bulkhead: 0.4, transom: 0.3, mullions: 1, frame: 'alu_clear' }, door: { u: 0.75, w: 0.95, kind: 'glass', recess: 0.2 } },
            { u0: 26.1, u1: 30.6, kind: 'store', h: 2.75, name: 'Deli & Grill', interior: 'shop_food', lit: 1,
              sign: { kind: 'panel', text: 'DELI & GRILL', font: 'Oswald-700', fg: '#ffffff', bg: '#241a14', u0: 26.1, u1: 30.66, h: 0.55, y: 3.95, depth: 0.08, lit: 'face', logo: 'bid1:deligrill', logoAt: 'fill' },
              awning: { kind: 'fixed', color: '#7a2b24', text: 'FRESH JUICE - HOMEMADE SOUP - CREATE YOUR OWN SALAD - OPEN BUFFET', drop: 0.28, proj: 0.9, stripes: '#e9e2d4' },
              blade: { kind: 'blade', text: '24 HOURS GRILL', lines: ['24 HOURS', 'GRILL'], font: 'Oswald-700', fg: '#ffffff', bg: '#1f6b3a', u0: 28.1, u1: 29.1, h: 0.9, y: 5.6, proj: 0.2, lit: 'face' },
              glazing: { bulkhead: 0.4, transom: 0.3, mullions: 2, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0, kind: 'glass', recess: 0.2 } },
          ],
        },
        // (2026-10-02: everything over the shops 0.45 m lower, the top storey 0.45 m taller so the cornice stays: rows and signs 11-20 px high in the
        // levelled s351 (NCC +15 / +16 px at 10-16 m, the arched row +18) with the cornice's roofline at +4 px)
        floors: [{ n: 4, h: 3.13, win: 'A', bays: B16 }, { n: 1, h: 3.75, win: 'T', bays: B16 }],
        bays: { widths: [1.5, 1.77, 1.74, 1.84, 1.93, 1.97, 2.0, 1.93, 1.83, 1.84, 1.86, 1.84, 1.86, 1.9, 1.9, 1.95, 1.0] },
        // dark sashes and dressed upper sashes: frame #3a3b3a, blinds 0.6, sheer 0.25 (both faces)
        windows: {
          A: { w: 0.93, h: 1.83, sill: 0.28, kind: 'dh', lights: '1/1', frame: { mat: 'plain', tint: '#3a3b3a', rough: 0.5 }, reveal: 0.12, lintel: { kind: 'none' },
            sillStone: { mat: 'cast_stone', tint: '#aaa392', h: 0.1, proj: 0.04 }, surround: { mat: 'cast_stone', tint: '#aaa392', w: 0.17, proj: 0.035 }, ac: 0.2, blinds: 0.6, sheer: 0.25, sheerTint: '#ffffff', lit: 0.4 },
          T: { w: 0.93, h: 1.8, sill: 0.35, kind: 'dh', lights: '1/1', frame: { mat: 'plain', tint: '#3a3b3a', rough: 0.5 }, reveal: 0.12, lintel: { kind: 'none' },
            sillStone: { mat: 'cast_stone', tint: '#aaa392', h: 0.1, proj: 0.04 }, surround: null, ac: 0.1, blinds: 0.6, sheer: 0.25, sheerTint: '#ffffff', lit: 0.4 },
        },
        bands: [{ at: 4.5, h: 0.22, proj: 0.06, mat: 'cast_stone', tint: '#a9a192' }, { at: 16.95, h: 0.2, proj: 0.07, mat: 'cast_stone', tint: '#b3ab9b' }],
        fireEscape: { bays: [3, 4], floors: [1, 5], depth: 1.05, drop: true },
        cornice: { kind: 'bracketed', h: 1.25, proj: 0.75, mat: 'metal_painted', tint: '#505b56', brackets: 17, bracketW: 0.22, dirt: 0.35 },   // (2026-10-02: was 2.2 x 0.95 over a 1.85 m parapet, the roofline 44 px high in the levelled s351)
        items: [],
      },
      {
        // St. Nicholas Ave side (27.6 m), u from the 125th corner northward: the deli wraps the
        // corner, a gated store, a store boarded behind a poster, the residential entrance under a blue canopy, stone base
        edge: 'corner',
        base: {
          h: 4.5,
          bays: [
            { u0: 0.1, u1: 6.4, kind: 'window', h: 2.75, interior: 'shop_food', lit: 1,
              sign: { kind: 'panel', text: 'DELI & GRILL', font: 'Oswald-700', fg: '#ffffff', bg: '#241a14', u0: 0.1, u1: 6.4, h: 0.55, y: 3.95, depth: 0.08, lit: 'face', logo: 'bid1:deligrill', logoAt: 'fill' },
              awning: { kind: 'fixed', color: '#7a2b24', drop: 0.28, proj: 0.9 },
              glazing: { bulkhead: 0.4, transom: 0.3, mullions: 2, frame: 'alu_clear' } },
            { u0: 6.8, u1: 12.3, kind: 'store', h: 2.75, interior: 'empty', gate: { kind: 'rolldown', color: '#9a9ea2', down: 1 } },
            { u0: 12.6, u1: 20.4, kind: 'store', h: 2.75, interior: 'empty', gate: { kind: 'rolldown', color: '#8e9396', down: 0.85 } },
            { u0: 20.8, u1: 23.2, kind: 'entrance', h: 2.75, door: { kind: 'double', w: 0.9, transom: 0.6, frame: 'alu_bronze' },
              awning: { kind: 'dome', color: '#1f3f8c', text: '321', drop: 0.2, proj: 1.4 } },
          ],
        },
        rustication: { to: 4.5, mat: 'cast_stone', tint: '#bdb5a5', joint: 0.45, block: 1.2 },
        floors: [{ n: 4, h: 3.13, win: 'A' }, { n: 1, h: 3.75, win: 'T' }],
        bays: { n: 12, margin: [2.0, 0.3] },
        windows: {
          A: { w: 0.93, h: 1.83, sill: 0.28, kind: 'dh', lights: '1/1', frame: { mat: 'plain', tint: '#3a3b3a', rough: 0.5 }, reveal: 0.12, lintel: { kind: 'none' },
            sillStone: { mat: 'cast_stone', tint: '#aaa392', h: 0.1, proj: 0.04 }, surround: { mat: 'cast_stone', tint: '#aaa392', w: 0.17, proj: 0.035 }, ac: 0.2, blinds: 0.6, sheer: 0.25, sheerTint: '#ffffff', lit: 0.4 },
          T: { w: 0.93, h: 1.8, sill: 0.35, kind: 'dh', lights: '1/1', frame: { mat: 'plain', tint: '#3a3b3a', rough: 0.5 }, reveal: 0.12, lintel: { kind: 'none' },
            sillStone: { mat: 'cast_stone', tint: '#aaa392', h: 0.1, proj: 0.04 }, surround: null, ac: 0.1, blinds: 0.6, sheer: 0.25, sheerTint: '#ffffff', lit: 0.4 },
        },
        bands: [{ at: 4.5, h: 0.22, proj: 0.06, mat: 'cast_stone', tint: '#a9a192' }, { at: 16.95, h: 0.2, proj: 0.07, mat: 'cast_stone', tint: '#b3ab9b' }],
        cornice: { kind: 'bracketed', h: 1.25, proj: 0.75, mat: 'metal_painted', tint: '#505b56', brackets: 15, bracketW: 0.22, dirt: 0.35 },
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.35, coping: 'panel_grey' }, membrane: 'black',
      items: [{ k: 'bulkhead', at: [0.3, 0.55], w: 3.2, d: 3.2, h: 3.0 }, { k: 'bulkhead', at: [0.72, 0.55], w: 3.2, d: 3.2, h: 3.0 }] },
    refs: [],
    notes: '16 bays at a measured 1.73-2.0 m pitch; top floor windows are round-arched with brick voussoirs and a stone keystone (KIT request: arched heads - keystone lintel stands in); ' +
      'eared cast-stone architraves on every window (surround); two fire escapes (bays 3-4 and 11-12, only the first is in the schema: KIT request for a list); ' +
      'cornice: pressed metal, grey-green, a corona of 1.0 m over a 1.3 m frieze with scroll brackets at each pier; ' +
      'St. Nicholas side not yet measured (bays approximate). Stores: all seven signs 2026-08, drawn by bid1:* marks.',
  },
  // ============================================================== NORTH SIDE, St. Nicholas Ave to Frederick Douglass Blvd
  {
    id: 'w125-321', addr: '321 W 125th St (NE corner of St. Nicholas Ave)', bin: '1059310', status: 'measured',
    custom: { fn: 'bid1:w321', with: 'kit' },
    at: [1603.79, -3092.82], comp: '3_-7:18', h: 9.3,
    wall: { mat: 'brick_buff', tint: '#e5d8b6', dirt: 0.32 },
    faces: [{
      edge: 'front',
      base: {
        h: 2.85, fascia: { h: 2.05, mat: 'panel_alu', tint: '#55504d', proj: 0.12, u0: 0, u1: 10.9, corrugated: true },
        bays: [
          { u0: 0.2, u1: 10.7, kind: 'store', name: 'Chipotle', interior: 'restaurant', lit: 1,
            sign: { kind: 'lightbox', text: 'CHIPOTLE', font: 'Oswald-600', fg: '#ffffff', bg: '#a8231b', u0: 3.45, u1: 7.75, h: 0.82, y: 3.6, depth: 0.15, lit: 'face', frame: '#ffffff', logo: 'bid1:chipotleSign', logoAt: 'fill' },
            glazing: { bulkhead: 0.3, transom: 0, mullions: 4, frame: 'alu_black' }, door: { u: 0.37, w: 1.0, kind: 'glass', recess: 0.1 },
            vinyl: [{ text: '321', color: '#ffffff', u: 3.6, y: 2.5, w: 0.4 }] },
          { u0: 11.3, u1: 14.5, kind: 'store', h: 2.85, name: 'Harlem United', interior: 'empty', setback: 0.35,
            glazing: { bulkhead: 0.2, transom: 0.3, mullions: 1, frame: 'alu_black' }, door: { u: 0.35, w: 1.0, kind: 'solid', tint: '#111111', recess: 0.3 },
            vinyl: [{ text: 'HARLEM UNITED', color: '#ffffff', u: 1.1, y: 1.5, w: 0.8 }] },
        ],
      },
      floors: [{ n: 1, h: 4.4, win: 'S' }],
      bays: { widths: [0.35, 4.65, 0.37, 4.65, 0.37, 4.22, 0.35] },
      windows: { S: { w: 4.6, h: 2.55, sill: 0.25, kind: 'fixed', mullions: 5, transom: 0.7, frame: 'steel_black', frameW: 0.05, reveal: 0.12, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#c9bfa6', h: 0.1, proj: 0.03 }, blinds: 0.35, lit: 0.5 } },
      piers: { mat: 'brick_buff', tint: '#d6cbad', w: 0.4, proj: 0.07, at: [0.2, 5.1, 10.1, 14.76], from: 'base', to: 10.75, capital: false, base: false },
      cornice: { kind: 'parapet', h: 0.3, mat: 'brick_buff', tint: '#e5d8b6' },
    }, {
      // St. Nicholas Ave side: Gourmet Deli, Sea & Sea behind two graffiti gates, New Tang S.,
      // a dark painted flank with a service door, Chipotle wrapping the corner; over it seven bays of steel sash between brick piers
      edge: 'corner',
      base: {
        h: 3.3, fascia: { h: 1.6, mat: 'stucco', tint: '#46474d', proj: 0.02 },
        wall: { mat: 'stucco', tint: '#45464c', dirt: 0.4, to: 3.3 },
        bays: [
          { u0: 1.8, u1: 9.2, kind: 'store', h: 3.2, name: 'Gourmet Deli', interior: 'shop_food', lit: 1,
            sign: { kind: 'panel', text: 'GOURMET DELI', font: 'Oswald-700', fg: '#ffffff', bg: '#9a90b0', u0: 1.5, u1: 9.25, h: 0.95, y: 3.55, depth: 0.08, lit: 'face', logo: 'bid1:gourmetdeli', logoAt: 'fill' },
            glazing: { bulkhead: 0.45, transom: 0.3, mullions: 3, frame: 'alu_clear' }, door: { u: 0.7, w: 1.0, kind: 'glass', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 10.4, u1: 15.4, kind: 'store', h: 3.2, name: 'Sea & Sea', interior: 'empty', gate: { kind: 'rolldown', color: '#9a9d9f', down: 1, graffiti: 0.85 },
            sign: { kind: 'panel', text: 'SEA & SEA', font: 'Anton', fg: '#e9e9e6', bg: '#0c0c0d', u0: 9.3, u1: 19.7, h: 1.05, y: 3.5, depth: 0.1, lit: 'none', logo: 'bid1:seasea', logoAt: 'fill' } },
          { u0: 15.7, u1: 19.4, kind: 'store', h: 3.2, interior: 'empty', gate: { kind: 'rolldown', color: '#a0a3a4', down: 1, graffiti: 0.7 } },
          { u0: 19.9, u1: 23.4, kind: 'store', h: 3.2, name: 'New Tang S.', interior: 'empty', gate: { kind: 'rolldown', color: '#8f9396', down: 1, graffiti: 0.6 },
            sign: { kind: 'panel', text: 'New Tang S.', font: 'KaushanScript', fg: '#ffffff', bg: '#d4232c', u0: 19.75, u1: 23.5, h: 0.9, y: 3.55, depth: 0.08, lit: 'face', logo: 'bid1:newtang', logoAt: 'fill' } },
          { u0: 24.9, u1: 26.2, kind: 'entrance', h: 2.4, door: { kind: 'solid', w: 1.0, tint: '#2b2b2d', transom: 0.0, recess: 0.25 } },
          { u0: 35.0, u1: 40.0, kind: 'window', h: 3.2, name: 'Chipotle', interior: 'restaurant', lit: 1,
            sign: { kind: 'lightbox', text: 'CHIPOTLE', font: 'Oswald-600', fg: '#ffffff', bg: '#a8231b', u0: 34.9, u1: 39.3, h: 0.82, y: 3.75, depth: 0.15, lit: 'face', frame: '#ffffff', logo: 'bid1:chipotleSign', logoAt: 'fill' },
            glazing: { bulkhead: 0.3, transom: 0, mullions: 3, frame: 'alu_black' }, gate: { kind: 'none' } },
        ],
      },
      floors: [{ n: 1, h: 4.4, win: 'S', bays: [1, 2, 3, 4, 5, 6, 7] }],
      bays: { widths: [0.33, 5.72, 5.75, 5.75, 5.6, 5.9, 5.8, 5.15, 0.3] },
      windows: { S: { w: 5.0, h: 2.55, sill: 0.25, kind: 'fixed', mullions: 5, transom: 0.65, frame: 'steel_black', frameW: 0.05, reveal: 0.12, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#c9bfa6', h: 0.1, proj: 0.03 }, blinds: 0.3, lit: 0.5 } },
      piers: { mat: 'brick_buff', tint: '#d6cbad', w: 0.7, proj: 0.06, at: [0.33, 6.05, 11.8, 17.55, 23.15, 29.05, 34.85, 40.0], from: 'base', to: 10.75, capital: false, base: false },
      cornice: { kind: 'parapet', h: 0.3, mat: 'brick_buff', tint: '#e5d8b6' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.05, coping: 'terracotta' }, membrane: 'black', items: [] },
    refs: [],
    notes: 'the three 2nd-floor openings (bays 1, 3, 5) are steel industrial sash 4 wide x 2 high plus a transom row; brick piers rise 0.3 m above the parapet; ' +
      'the signband is brown corrugated metal (ribbed: SIGN/MATS: a corrugated panel); Chipotle: white-edged red lightbox, pepper roundel at the left (bid1:chipotle). ' +
      'The St. Nicholas side (40 m) is not spec\'d yet (plain face).',
  },
  {
    id: 'w125-319', addr: '319 W 125th St', bin: '1059311', status: 'measured',
    at: [1613.05, -3085.93], comp: '3_-7:176', h: 9.0,
    wall: { mat: 'brick_buff', tint: '#cdbf9e', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.45,
        bays: [
          { u0: 0.67, u1: 6.9, kind: 'store', h: 3.75, name: '(closed store, green frame)', interior: 'empty', setback: 0.3,
            glazing: { frame: 'metal_painted', kick: 'metal_painted' }, gate: { kind: 'rolldown', color: '#8a8e90', down: 1, graffiti: 0.95 } },
        ],
      },
      floors: [{ n: 1, h: 4.1, win: 'S' }],
      bays: { widths: [0.35, 7.2, 0.36] },
      windows: { S: { w: 6.6, h: 2.3, sill: 0.85, kind: 'fixed', mullions: 5, transom: 0.75, frame: 'steel_black', frameW: 0.07, reveal: 0.12, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#c7bca0', h: 0.1, proj: 0.03 }, blinds: 0.2, lit: 0.3 } },
      cornice: { kind: 'parapet', h: 0.3, mat: 'brick_buff', tint: '#cdbf9e' },
    }],
    custom: { fn: 'bid1:w319', with: 'kit' },
    roof: { kind: 'flat', parapet: { h: 1.6, coping: 'terracotta' }, membrane: 'black' },
    refs: [],
    notes: 'shuttered store: the whole ground floor behind a graffiti-covered roll-down in a green-painted steel frame whose top rises to a shallow point at the centre (not in the schema: piers + band stand in).',
  },
  {
    id: 'w125-317', addr: '317 W 125th St', bin: '1059312', status: 'measured',
    at: [1619.88, -3082.08], comp: '3_-7:149', h: 12.5,
    wall: { mat: 'terracotta_cream', tint: '#e6e2d8', dirt: 0.45 },
    custom: { fn: 'bid1:w317', with: 'kit' },
    faces: [{
      edge: 'front',
      base: {
        h: 3.47, fascia: { h: 1.3, mat: 'plain', tint: '#e1ab23', proj: 0.28 },
        bays: [
          { u0: 0.2, u1: 7.6, kind: 'store', name: 'Orange Beauty Supply', interior: 'shop_clothing', lit: 1,
            // SIGNS' values:
            // letters 0.54 of the fascia's height over 0.77 of its width, faces #c14e35 in sun (fg #d4482c), Nunito sets ~10 % wide (tracking -0.02),
            // the roundel taller than the letter band (logoScale 1.25);
            sign: { kind: 'channel', text: 'BEAUTY SUPPLY', font: 'Nunito-900', fg: '#d4482c', bg: null, u0: 0.25, u1: 7.45, y: 3.55, h: 1.15, fill: 0.78, depth: 0.1, lit: 'face', tracking: -0.02,
              logo: 'bid1:orangeBeauty', logoAt: 'left', logoScale: 1.25 },
            glazing: { bulkhead: 0.3, transom: 0.4, mullions: 3, frame: 'alu_clear' }, door: { u: 0.62, w: 1.0, kind: 'glass', recess: 0.2 } },
        ],
      },
      floors: [{ n: 2, h: 3.75, win: 'none' }],
      windows: { none: { kind: 'none' } },
      piers: { mat: 'terracotta_cream', tint: '#ece8de', w: 0.6, proj: 0.1, at: [0.3, 7.47], from: 'base', to: 12.1 },
      bands: [{ at: 5.0, h: 0.35, proj: 0.08, mat: 'terracotta_cream', tint: '#e0dbd0' }, { at: 11.6, h: 0.3, proj: 0.1, mat: 'terracotta_cream', tint: '#e0dbd0' }],
      cornice: { kind: 'band', h: 0.45, proj: 0.12, mat: 'terracotta_cream', tint: '#e4dfd4' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'terracotta' }, membrane: 'black' },
    refs: [],
    notes: 'the upper front is a blank white glazed-terracotta wall (no windows; painted-over tags) between edge pilasters, a belt course at 11.6 m, and a segmental arched parapet with a moulded coping rising from 13.3 m at the ends to 15.1 m at the crown (bid1:w317), per the leaf-off 2022-11 view (2026: the street tree hides it); orange logo roundel then red BEAUTY SUPPLY on an orange-yellow fascia.',
  },
  {
    id: 'w125-313', addr: '313 W 125th St', bin: '1059313', status: 'measured',
    at: [1630.64, -3077.94], comp: '3_-7:60', h: 19.3,
    custom: { fn: 'bid1:w313', with: 'kit' },
    wall: { mat: 'terracotta_cream', tint: '#e4e0d6', dirt: 0.38 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.2, fascia: { h: 1.6, mat: 'panel_alu', tint: '#ffffff', proj: 0.15 },
        bays: [
          { u0: 0.1, u1: 5.6, kind: 'store', name: 'Popeyes', interior: 'restaurant', lit: 1,
            // the wordmark as it stands (SIGNS 00:51 / 01:01 / 01:11 in docs/notes/ar34-req/BID1.md, shots/ar34/signs/refs2/sg_popb1.jpg): 115 x 645 px over the
            // 825 px storefront (~0.77 x 4.3 m), the lower-case e's ~0.12 cap height under the line, faces #ed743e, Baloo2 grown by bold 0.015;
            // the teal band at the fascia's foot is drawn by bid1:w313
            sign: { kind: 'channel', text: 'POPeYeS', font: 'Baloo2-800', fg: '#ed743e', bg: null, u0: 0.55, u1: 5.1, y: 3.45, h: 0.95, fill: 0.86, depth: 0.1, lit: 'face', bold: 0.015,
              runs: [{ text: 'POP' }, { text: 'e', dy: -0.12 }, { text: 'Y' }, { text: 'e', dy: -0.12 }, { text: 'S' }] },
            glazing: { bulkhead: 0.35, transom: 0.3, mullions: 2, frame: 'alu_clear' }, door: { u: 0.62, w: 1.0, kind: 'glass', recess: 0.25 } },
          { u0: 5.8, u1: 14.9, kind: 'store', name: 'Burger King / Louisiana Kitchen (Popeyes)', interior: 'restaurant', lit: 1,
            sign: { kind: 'panel', text: 'NOW OPEN', font: 'Anton', fg: '#ffcc33', bg: '#d6252e', u0: 5.8, u1: 14.9, h: 1.3, y: 3.35, depth: 0.12, lit: 'face', logo: 'bid1:bkpopeyes', logoAt: 'fill' },
            glazing: { bulkhead: 0.35, transom: 0.3, mullions: 3, frame: 'alu_clear' }, door: { u: 0.2, w: 1.0, kind: 'glass', recess: 0.25 } },
        ],
      },
      floors: [{ n: 4, h: 3.28, win: 'A' }],
      bays: { widths: [0.3, 1.47, 1.47, 1.47, 1.47, 1.47, 1.47, 1.47, 1.47, 1.47, 1.47, 0.06] },
      windows: { A: { w: 1.16, h: 2.5, sill: 0.3, kind: 'dh', lights: '1/1', frame: { mat: 'plain', tint: '#35302b', rough: 0.5 }, frameW: 0.09, reveal: 0.14, lintel: { kind: 'none' }, sillStone: { mat: 'terracotta_cream', tint: '#dcd6ca', h: 0.12, proj: 0.04 }, ac: 0.15, blinds: 0.5, lit: 0.35 } },
      piers: { mat: 'terracotta_cream', tint: '#ebe7de', w: 0.42, proj: 0.12, at: [0.3, 3.24, 6.18, 9.12, 12.06, 15.0], from: 'base', to: 17.9 },
      bands: [{ at: 7.95, h: 0.3, proj: 0.07 }, { at: 11.23, h: 0.3, proj: 0.07 }, { at: 14.51, h: 0.3, proj: 0.07 }, { at: 17.45, h: 0.45, proj: 0.09 }],
      cornice: { kind: 'modillion', h: 2.3, proj: 0.9, mat: 'metal_painted', tint: '#c2bcb0', dirt: 0.5 },
      // (the exposed parts of the two party walls, over 317 and over P.C. Richard, are bid1:w313's: no face on a party wall, QA Q49 2026-10-02)
    }],
    roof: { kind: 'flat', parapet: { h: 0.7, coping: 'panel_grey' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.3, 0.7], w: 3.0, d: 3.0, h: 3.0 }] },
    refs: [],
    notes: 'white-painted cast-iron / terracotta loft (1910): five bays between panelled Corinthian pilasters, each bay two windows split by a slender colonnette (the colonnettes: KIT request - piers at the odd bay edges stand in), ' +
      'spandrel panels, a frieze with an ornamental band and a modillion cornice (top 20.0 m). Ground floor: the Popeyes channel letters on white and a red Burger King / Popeyes "NOW OPEN" banner sign.',
  },
  {
    id: 'w125-309', addr: '309 W 125th St (P.C. Richard & Son)', bin: '1059314', status: 'measured',
    at: [1648.81, -3079.6], comp: '3_-7:212', h: 10.2,
    wall: { mat: 'panel_alu', tint: '#f1f1ef', dirt: 0.2 },
    custom: { fn: 'bid1:pcrichard', with: 'kit' },
    faces: [{
      edge: 'front',
      base: {
        h: 7.3,
        bays: [
          { u0: 0.15, u1: 5.0, kind: 'window', h: 7.25, interior: 'shop_phone', lit: 1, glazing: { bulkhead: 0.3, transom: 2.8, mullions: 1, frame: 'alu_clear' }, gate: { kind: 'none' } },
          { u0: 5.0, u1: 9.3, kind: 'store', h: 7.25, name: 'P.C. Richard & Son', interior: 'shop_phone', lit: 1, glazing: { bulkhead: 0.3, transom: 2.8, mullions: 1, frame: 'alu_clear' },
            door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.4 }, gate: { kind: 'none' },
          },
          { u0: 9.3, u1: 15.0, kind: 'window', h: 7.25, interior: 'shop_phone', lit: 1, glazing: { bulkhead: 0.3, transom: 2.8, mullions: 2, frame: 'alu_clear' }, gate: { kind: 'none' } },
        ],
      },
      floors: [{ n: 1, h: 2.9, win: 'none' }],
      cornice: { kind: 'parapet', h: 0.25, mat: 'panel_alu', tint: '#f1f1ef' },
      items: [],
    }],
    roof: { kind: 'flat', parapet: { h: 0.0 }, membrane: 'white', items: [] },
    refs: [],
    notes: 'a white-panel box: a two-storey glass curtain wall (mullions every 2.07 m, a spandrel line at 4.5 m carrying red "APPLIANCES - TV - ELECTRONICS - MATTRESSES" letters) under a 2.9 m white sign parapet with red italic "P.C. RICHARD & SON" (the custom bid1:pcrichard adds the letters, the spandrel lettering and the red dome awning text); parapet top 10.2 m.',
  },
  {
    id: 'w125-307', addr: '307 W 125th St', bin: '1059315', status: 'measured',
    at: [1651.35, -3062.26], comp: '3_-6:297', h: 14.4,
    wall: { mat: 'brick_painted', tint: '#e2dccd', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: {
        h: 3.4, fascia: { h: 1.2, mat: 'panel_alu', tint: '#5b3b8f', proj: 0.12 },
        bays: [
          { u0: 0.15, u1: 5.85, kind: 'store', name: '307 W (sneakers, shoes; nail salon 2nd fl)', interior: 'shop_clothing', lit: 1,
            sign: { kind: 'panel', text: '307W  SNEAKERS', font: 'Anton', fg: '#ffffff', bg: '#5b3b8f', u0: 0.15, u1: 5.85, h: 1.0, y: 3.5, depth: 0.08, lit: 'face' },
            blade: { kind: 'blade', text: 'NAIL 2 FL', lines: ['NAIL', '2 FL'], font: 'Oswald-700', fg: '#ffffff', bg: '#161616', u0: 5.3, u1: 5.9, h: 1.8, y: 5.4, proj: 0.15, lit: 'face' },
            glazing: { bulkhead: 0.3, transom: 0.3, mullions: 1, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.8 } },
        ],
      },
      floors: [{ n: 1, h: 5.9, win: 'W' }, { n: 1, h: 3.8, win: 'A' }],
      bays: bays3(6.01),
      windows: {
        W: { w: 4.6, h: 2.7, sill: 2.8, kind: 'fixed', mullions: 3, transom: 0.7, frame: 'alu_white', reveal: 0.15, du: 0, lintel: { kind: 'flat', mat: 'stone_lime', tint: '#d9d3c5', h: 0.25 }, sillStone: { mat: 'stone_lime', tint: '#d6d0c2', h: 0.12, proj: 0.05 }, blinds: 0.3, lit: 0.5 },
        A: tenWin({ w: 1.0, h: 2.0, sill: 0.9, lintel: { kind: 'hood', mat: 'cast_stone', tint: '#dcd6c8', h: 0.28, ext: 0.12, proj: 0.07 }, sillStone: { mat: 'stone_lime', tint: '#d6d0c2', h: 0.12, proj: 0.05 } }),
      },
      cornice: { ...tenCornice('#2a2624'), h: 1.1 },   // (2026-10-02: top 16.0 -> 15.0 m: roofline 32 / 61 px high in the levelled s307 / s305, LiDAR 14.1 m)
    }],
    custom: { fn: 'bid1:w307', with: 'kit' },
    roof: { ...tenRoof, parapet: { h: 0.6, coping: 'panel_grey' } },
    refs: [],
    notes: 'measured off the leaf-off 2022-11 view: a tall commercial 2nd floor (4.6-10.5 m) with one big 4-light window (7.4-10.1 m, the kit places it at the centre bay: bid1:w307 widens it across the front) under the salon sign, then one residential floor of three windows and the bracketed cornice (top 16.0 m); cream-painted brick.',
  },
  {
    id: 'w125-305', addr: '305 W 125th St (Discount Junction)', bin: '1059316', status: 'measured',
    at: [1657.99, -3057.51], comp: '3_-6:111', h: 15.0,
    wall: { mat: 'brick_painted', tint: '#e9e7e1', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.6, fascia: { h: 3.0, mat: 'panel_alu', tint: '#f4f3ef', proj: 0.2 },
        bays: [
          { u0: 0.2, u1: 9.1, kind: 'store', h: 3.6, name: 'Discount Junction', interior: 'shop_food', lit: 1,
            sign: { kind: 'panel', text: 'DISCOUNT JUNCTION', font: 'Oswald-700', fg: '#d9232d', bg: '#f4f3ef', u0: 0.1, u1: 9.2, h: 2.7, y: 4.75, depth: 0.2, lit: 'face', logo: 'bid1:discountjunction', logoAt: 'fill' },
            glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.1, kind: 'glass', recess: 0.3 } },
        ],
      },
      floors: [{ n: 2, h: 3.3, win: 'A' }],
      bays: { widths: [0.2, 2.25, 2.25, 2.25, 2.25, 0.09] },
      windows: { A: { w: 1.08, h: 2.0, sill: 0.5, kind: 'blind', frame: 'metal_painted', reveal: 0.12, lintel: { kind: 'hood', mat: 'cast_stone', tint: '#e6e3dc', h: 0.5, ext: 0.18, proj: 0.11 }, sillStone: { mat: 'stone_lime', tint: '#dedbd3', h: 0.12, proj: 0.05 } } },
      cornice: { kind: 'bracketed', h: 1.3, proj: 0.6, mat: 'plain', tint: '#1e1f20', brackets: 5, bracketW: 0.22, dirt: 0.45 },   // (2026-10-02: top 16.2 -> 15.6 m: the roofline 20 px high in s2329 (a4), 18 px low at 15.2 m (b4); LiDAR roof 14.3 m)
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'panel_grey' }, membrane: 'black' },
    custom: { fn: 'bid1:w305', with: 'kit' },
    refs: [],
    notes: 'the upper windows are boarded with grey panels (kind blind); the big white sign board covers the 2nd floor (4.0-6.6 m): red DISCOUNT JUNCTION + a red strip "SCHOOL & PARTY SUPPLIES  HARDWARE  BATH STUFF & MORE"; flaking paint on the brick (dirt 0.55).',
  },
  {
    id: '2329-8av', addr: '2329 Frederick Douglass Blvd (8th Ave), NE corner of 125th', bin: '1089315', status: 'measured',
    at: [1683.37, -3064.12], comp: '3_-6:335', h: 21.0,
    wall: { mat: 'panel_grey', tint: '#9c9fa0', dirt: 0.15 },
    custom: { fn: 'bid1:eighth2329', with: 'kit' },
    faces: [
      {
        edge: 'front',
        base: {
          h: 5.1, fascia: { h: 1.6, mat: 'panel_grey', tint: '#7f8489', proj: 0.02 },
          piers: { at: [0.61, 7.69, 14.77, 21.95, 29.08], w: 1.22, mat: 'panel_grey', tint: '#858a8f', proj: 0.02 },
          bays: [
            { u0: 1.22, u1: 7.08, kind: 'store', name: 'PureGym', interior: { kind: 'default', tone: '#4b5258', lit: 0.5 },
              sign: { kind: 'panel', text: 'PUREGYM', font: 'Montserrat-800', fg: '#ffffff', bg: '#1a1b1d', u0: 1.3, u1: 6.95, h: 0.95, y: 5.65, depth: 0.08, lit: 'face', logo: 'bid1:puregym', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: { u: 0.37, w: 0.95, kind: 'double', recess: 0.15 },
              vinyl: [{ text: 'PUREGYM', color: '#ffffff', u: 4.35, y: 0.95, w: 1.4, vertical: true, bg: '#101113' }], gate: { kind: 'none' } },
            { u0: 8.3, u1: 14.1, kind: 'store', name: '(discount apparel, "Great Style * Great Price")', interior: { kind: 'shop_clothing', tone: '#3a4046', lit: 0.5 },
              sign: { kind: 'banner', text: 'Great Style ★ Great Price', font: 'Montserrat-700', fg: '#ffffff', bg: '#d8566a', u0: 8.2, u1: 14.2, h: 0.95, y: 5.65, depth: 0.02, lit: 'none', logo: 'bid1:bannerGreat', logoAt: 'fill' },
              glazing: { bulkhead: 0.3, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: null, gate: { kind: 'none' } },
            { u0: 15.44, u1: 21.33, kind: 'store', name: 'Danice', interior: { kind: 'shop_clothing', tone: '#3a4046', lit: 0.5 },
              sign: { kind: 'panel', text: 'Danice', font: 'Poppins-700', fg: '#c8283a', bg: '#f7f3f1', u0: 16.8, u1: 21.3, h: 0.9, y: 3.1, depth: 0.08, lit: 'face', tracking: 0.12 },
              glazing: { bulkhead: 0.3, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: { u: 0.78, w: 1.1, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
            { u0: 22.6, u1: 28.4, kind: 'store', name: 'Capital One Bank', interior: { kind: 'bank', tone: '#555c62', lit: 0.5 },
              sign: { kind: 'lightbox', text: 'Capital One Bank', font: 'Inter-700', fg: '#ffffff', bg: '#11306e', u0: 22.7, u1: 28.35, h: 1.0, y: 5.62, depth: 0.14, lit: 'face', logo: 'bid1:capitalone', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: { u: 0.72, w: 0.95, kind: 'double', recess: 0.15 }, gate: { kind: 'none' } },
          ],
        },
        floors: [{ n: 1, h: 4.0, win: 'none' }, { n: 1, h: 4.0, win: 'none' }, { n: 1, h: 6.3, win: 'T', bays: [1, 2, 3, 4, 5, 6] }],
        bays: { widths: [0.61, 3.54, 3.54, 3.54, 3.54, 3.54, 3.54, 7.84] },
        windows: {
          T: { w: 2.32, h: 2.25, sill: 1.65, kind: 'fixed', mullions: 1, transom: 1.85, frame: 'alu_white', frameW: 0.07, reveal: 0.12, lintel: { kind: 'none' }, sillStone: null, blinds: 0.35, lit: 0.45 },
          none: { kind: 'none' },
        },
        items: [{ k: 'sign', sign: { kind: 'banner', text: 'Danice', font: 'Montserrat-700', fg: '#ffffff', bg: '#e3808c', u0: 15.2, u1: 21.6, h: 0.95, y: 5.65, depth: 0.02, lit: 'none', logo: 'bid1:bannerDanice', logoAt: 'fill' } }],
        cornice: { kind: 'parapet', h: 0.2, mat: 'panel_grey', tint: '#9c9fa0' },
      },
      {
        // Frederick Douglass Blvd side (60.2 m, u from the 125th corner northward): the same system, Capital One along
        // the ground floor, three glazed blocks alternating with three sign columns (bid1:eighth2329), twelve 4th-floor windows
        edge: [1710.9, -3083.3, 1681.8, -3030.6],
        base: {
          h: 5.1, fascia: { h: 1.6, mat: 'panel_grey', tint: '#7f8489', proj: 0.02 },
          piers: { at: [0.4, 8.05, 15.8, 23.15, 31.05, 38.55, 46.6, 54.45], w: 1.3, mat: 'panel_grey', tint: '#858a8f', proj: 0.02 },
          bays: [
            { u0: 1.05, u1: 7.4, kind: 'store', interior: 'bank', lit: 1, name: 'Capital One Bank',
              sign: { kind: 'lightbox', text: 'Capital One Bank', font: 'Inter-700', fg: '#ffffff', bg: '#11306e', u0: 1.1, u1: 7.2, h: 1.0, y: 5.62, depth: 0.14, lit: 'face', logo: 'bid1:capitalone', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: { u: 0.3, w: 0.95, kind: 'double', recess: 0.15 }, gate: { kind: 'none' } },
            { u0: 8.7, u1: 15.15, kind: 'window', interior: 'bank', lit: 1, glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, gate: { kind: 'none' } },
            { u0: 16.45, u1: 22.5, kind: 'window', interior: 'bank', lit: 1,
              sign: { kind: 'lightbox', text: 'Capital One Bank', font: 'Inter-700', fg: '#ffffff', bg: '#11306e', u0: 16.5, u1: 22.4, h: 1.0, y: 5.62, depth: 0.14, lit: 'face', logo: 'bid1:capitalone', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, gate: { kind: 'none' } },
            { u0: 23.8, u1: 30.4, kind: 'store', interior: 'default', lit: 1, glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 0.95, kind: 'double', recess: 0.15 }, gate: { kind: 'none' } },
            { u0: 31.7, u1: 37.9, kind: 'store', interior: 'default', lit: 1,
              sign: { kind: 'lightbox', text: 'Capital One Bank', font: 'Inter-700', fg: '#ffffff', bg: '#11306e', u0: 31.8, u1: 37.8, h: 1.0, y: 5.62, depth: 0.14, lit: 'face', logo: 'bid1:capitalone', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, door: { u: 0.35, w: 0.95, kind: 'double', recess: 0.3 }, gate: { kind: 'none' } },
            { u0: 39.2, u1: 45.95, kind: 'store', interior: 'default', lit: 1, glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, door: { u: 0.45, w: 1.0, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
            { u0: 47.25, u1: 53.8, kind: 'window', interior: 'default', lit: 1,
              sign: { kind: 'lightbox', text: 'Capital One Bank', font: 'Inter-700', fg: '#ffffff', bg: '#11306e', u0: 47.4, u1: 53.6, h: 1.0, y: 5.62, depth: 0.14, lit: 'face', logo: 'bid1:capitalone', logoAt: 'fill' },
              glazing: { bulkhead: 0.25, transom: 1.05, mullions: 3, frame: 'alu_clear' }, gate: { kind: 'none' } },
            { u0: 55.1, u1: 60.0, kind: 'store', interior: 'default', lit: 1, glazing: { bulkhead: 0.3, transom: 1.05, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.2 }, gate: { kind: 'none' } },
          ],
        },
        floors: [{ n: 1, h: 4.0, win: 'none' }, { n: 1, h: 4.0, win: 'none' }, { n: 1, h: 6.3, win: 'T', bays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
        bays: { widths: [7.7, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 3.78, 7.14] },
        windows: {
          T: { w: 2.32, h: 2.25, sill: 1.65, kind: 'fixed', mullions: 1, transom: 1.85, frame: 'alu_white', frameW: 0.07, reveal: 0.12, lintel: { kind: 'none' }, sillStone: null, blinds: 0.35, lit: 0.45 },
          none: { kind: 'none' },
        },
        cornice: { kind: 'parapet', h: 0.2, mat: 'panel_grey', tint: '#9c9fa0' },
      },
    ],
    roof: { kind: 'flat', parapet: { h: 0.56, coping: 'panel_grey' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.2, 0.7], w: 3.4, d: 4.0, h: 3.0 }] },
    refs: [],
    notes: 'heights scaled 0.965 to the footprint: parapet 21.56 m, glass tower top 22.8 m = the survey 22.86; ' +
      'zinc-grey metal panel skin (joints every ~1.0 m high x 2.3 m wide); floors 2-3: two double-height glazed blocks 5.86 x 7.6 m (u 1.22-7.08, 15.44-21.30, 4 x 3 lights, white frames) either side of a panel column carrying the Party City / FLAMING GRILL & MODERN BUFFET / PureGym letters on a darker ribbed panel; ' +
      'floor 4: six 2.32 x 2.25 m windows at 3.54 m pitch; the corner bay (u 22.6-28.4): a one-storey band window at 6.9-9.9 m then the structural-glass corner tower 11.5-22.8 m with the Party City / Capital One / PureGym signs inside; ' +
      'the kit cannot place the glazed blocks (one bay layout per face, window width capped at the bay): bid1:eighth2329 adds them and the tower until KIT has per-floor openings (request).',
  },

  // ============================================================== SOUTH SIDE, Morningside Ave to St. Nicholas Ave
  {
    id: 'w125-374', addr: '374 W 125th St (SE corner of Morningside Ave)', bin: '1087468', status: 'measured',
    at: [1474.68, -3081.94], comp: '2_-7:26', h: 18.0,
    wall: { mat: 'brick_tan', tint: '#9c948a', dirt: 0.3 },
    custom: { fn: 'bid1:w374', with: 'kit' },
    faces: [{
      edge: 'front',
      base: {
        h: 4.1, fascia: { h: 0.5, mat: 'cast_stone', tint: '#bdb6aa', proj: 0.06 },
        bays: [
          { u0: 1.0, u1: 5.0, kind: 'store', interior: 'empty', glazing: { bulkhead: 0.25, transom: 0.8, mullions: 2, frame: 'alu_clear' }, door: { u: 0.5, w: 0.95, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 9.4, u1: 17.4, kind: 'store', interior: 'empty', glazing: { bulkhead: 0.25, transom: 0.8, mullions: 4, frame: 'alu_clear' }, door: { u: 0.35, w: 0.95, kind: 'double', recess: 0.2 }, gate: { kind: 'none' },
            sign: { kind: 'numbers', text: '382', fg: '#dcdcdc', u0: 11.0, u1: 11.6, h: 0.2, y: 2.6 } },
          { u0: 18.2, u1: 26.8, kind: 'window', interior: 'empty', glazing: { bulkhead: 0.25, transom: 0.8, mullions: 4, frame: 'alu_clear' }, gate: { kind: 'none' } },
          { u0: 27.0, u1: 35.2, kind: 'store', interior: 'empty', glazing: { bulkhead: 0.25, transom: 0.8, mullions: 4, frame: 'alu_clear' }, door: { u: 0.2, w: 0.95, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
        ],
      },
      floors: [{ n: 3, h: 4.33, win: 'A', bays: [1, 2, 3, 4, 5, 6, 7, 8] }],
      bays: { widths: [0.75, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 8.89] },
      windows: { A: { w: 2.15, h: 2.4, sill: 1.35, kind: 'fixed', mullions: 1, transom: 1.6, frame: 'alu_black', frameW: 0.07, reveal: 0.25, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#b9b2a5', h: 0.1, proj: 0.04 }, blinds: 0.4, lit: 0.45 } },
      bands: [{ at: 'floor:2', h: 0.3, proj: 0.04, mat: 'cast_stone', tint: '#bdb6aa', u0: 0, u1: 35.5 }],
      cornice: { kind: 'band', h: 0.5, proj: 0.08, mat: 'cast_stone', tint: '#bdb6aa' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.8, coping: 'terracotta' }, membrane: 'gravel' },
    refs: [],
    notes: 'grey multi-tone (grey, buff, charcoal) brick street wall of four storeys (ground + three at 4.33 m, eight 2.56 m windows in deep 0.25 m reveals, parapet to 19.8 m) ' +
      'across u 0-35.5 m; u 35.5-44.8 m (the Morningside corner) is a blue-glass curtain wall the full 19.8 m (bid1:w374 adds it, the kit has no curtain yet); ' +
      'above, a tower set back ~4.4 m with five floors of 1.3 m square windows at 3.5 m pitch and a louvred mechanical band to 44.3 m: bid1:w374 builds it. ' +
      'Ground floor: glazed storefronts and lobby doors (382 on one), no signs: Industrial Bank (2023) has left; bays vacant.',
  },
  {
    id: 'hancock-11', addr: '11 Hancock Place (125th St frontage)', bin: '1059296', status: 'measured',
    at: [1498.07, -3073.09], comp: '2_-6:230', h: 38.7,
    custom: { fn: 'bid1:hancock', with: 'kit' },
    wall: { mat: 'panel_grey', tint: '#3c3f44', dirt: 0.15 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.9, fascia: { h: 0.6, mat: 'panel_grey', tint: '#2a2c30', proj: 0.03 },
        bays: [
          { u0: 0.2, u1: 2.7, kind: 'store', name: 'Gini\'s (pizza)', interior: 'restaurant',
            glazing: { bulkhead: 0.3, transom: 1.0, mullions: 1, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, kind: 'glass', recess: 0.1 } },
          { u0: 2.9, u1: 8.8, kind: 'store', name: 'Fitness Factory', interior: 'default',
            sign: { kind: 'channel', text: 'FITNESS FACTORY', font: 'BarlowCondensed-800', fg: '#2f6fd6', bg: null, u0: 3.2, u1: 8.0, h: 0.46, y: 4.95, depth: 0.06, lit: 'face', italic: true },
            glazing: { bulkhead: 0.25, transom: 1.2, mullions: 3, frame: 'alu_black' }, door: { u: 0.78, w: 1.0, kind: 'glass', recess: 0.1 } },
        ],
      },
      // floor lines read off the ortho's row luminance (dark slab bands at 8.25, 11.15, 14.25, 17.0, 20.0, 23.0, 26.0, 29.0 m): a glazed
      // second storey 5.5-8.25 m (the podium), then a 3.0 m pitch; three 2.95 m bays, a 0.75 m brick strip at the east end
      floors: [{ n: 1, h: 2.75, win: 'P', bays: [0, 1, 2] }, { n: 10, h: 3.0, win: 'A', bays: [0, 1, 2] }],
      bays: { widths: [2.95, 2.95, 2.95, 0.75] },
      windows: {
        P: { w: 2.75, h: 2.1, sill: 0.35, kind: 'fixed', mullions: 2, transom: 0.8, frame: 'alu_black', frameW: 0.08, reveal: 0.2, lintel: { kind: 'none' }, sillStone: null, blinds: 0.3, lit: 0.6 },
        A: { w: 2.75, h: 2.2, sill: 0.45, kind: 'fixed', mullions: 1, transom: 0.95, frame: 'alu_black', frameW: 0.08, reveal: 0.2, lintel: { kind: 'none' }, sillStone: null, blinds: 0.55, lit: 0.45 },
      },
      cornice: { kind: 'parapet', h: 0.2, mat: 'panel_grey', tint: '#3c3f44' },
    }, {
      // the set-back frontage east of the street wall (ring edge 1501.3,-3092.0 -> 1520.6,-3081.5, 22.0 m, u from the east end): the same dark panel grid,
      // a glazed base and 3.14 m bays (the kit's default windows on an unspecified face read as white E-shaped frames: a1 / h1 s11h plates)
      edge: [1501.3, -3092.0, 1520.6, -3081.5],
      base: {
        h: 4.9, fascia: { h: 0.6, mat: 'panel_grey', tint: '#2a2c30', proj: 0.03 },
        bays: [
          { u0: 0.3, u1: 7.0, kind: 'window', interior: { kind: 'default', tone: '#3a3d42', lit: 0.5 }, glazing: { bulkhead: 0.25, transom: 1.2, mullions: 4, frame: 'alu_black' } },
          { u0: 7.2, u1: 14.5, kind: 'store', interior: { kind: 'default', tone: '#3a3d42', lit: 0.5 }, glazing: { bulkhead: 0.25, transom: 1.2, mullions: 4, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, kind: 'glass', recess: 0.1 } },
          { u0: 14.7, u1: 21.7, kind: 'window', interior: { kind: 'default', tone: '#3a3d42', lit: 0.5 }, glazing: { bulkhead: 0.25, transom: 1.2, mullions: 4, frame: 'alu_black' } },
        ],
      },
      floors: [{ n: 1, h: 2.75, win: 'P' }, { n: 10, h: 3.0, win: 'A' }],
      bays: { widths: [3.14, 3.14, 3.14, 3.14, 3.14, 3.14, 3.14] },
      windows: {
        P: { w: 2.75, h: 2.1, sill: 0.35, kind: 'fixed', mullions: 2, transom: 0.8, frame: 'alu_black', frameW: 0.08, reveal: 0.2, lintel: { kind: 'none' }, sillStone: null, blinds: 0.3, lit: 0.6 },
        A: { w: 2.75, h: 2.2, sill: 0.45, kind: 'fixed', mullions: 1, transom: 0.95, frame: 'alu_black', frameW: 0.08, reveal: 0.2, lintel: { kind: 'none' }, sillStone: null, blinds: 0.55, lit: 0.45 },
      },
      cornice: { kind: 'parapet', h: 0.2, mat: 'panel_grey', tint: '#3c3f44' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.1, coping: 'panel_grey' }, membrane: 'pavers', items: [{ k: 'bulkhead', at: [0.5, 0.6], w: 4.0, d: 5.0, h: 3.5 }] },
    refs: [],
    notes: 'MEASURED 2026-10-01: slab bands (the row-luminance minima) at 8.25, 11.15, 14.25, 17.0, 20.0, 23.0, 26.0 and 29.0 m, so a glazed ' +
      'second storey (5.5-8.25 m) over the storefronts and a 3.0 m pitch above; three window bays of ~3 m between charcoal piers (2.6 / 5.7 m), a 0.75 m strip at the east end; ' +
      'ground floor: Gini\'s (red sign) at the west end, Fitness Factory (blue letters on a dark band at 4.9-5.4 m) with its entrance at the east. Dark metal-panel grid with black multi-light windows; ' +
      'the upper floors step back (above 29 m, not in the ortho: not modelled); only the 9.6 m on 125th is the street wall, the rest is set back 3 m on Hancock Pl. ' +
      'Side-by-side: client/shots/ar34/bid1/sbs/a1/a1_s11h.jpg (before this edit).',
  },
  {
    id: 'w125-350', addr: '350-360 W 125th St (SW corner of St. Nicholas Ave)', bin: '1059300', status: 'measured',
    at: [1524.38, -3064.71], comp: '2_-6:97', h: 10.2,
    wall: { mat: 'brick_tan', tint: '#a89c84', dirt: 0.38 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.2, fascia: { h: 1.2, mat: 'panel_alu', tint: '#2a2e36', proj: 0.14 },
        bays: [
          { u0: 0.2, u1: 12.9, kind: 'store', name: 'Chase', interior: 'bank', lit: 1,
            sign: { kind: 'channel', text: 'CHASE', font: 'Inter-700', fg: '#ffffff', bg: '#1b2a4a', u0: 2.4, u1: 7.8, h: 0.62, y: 4.47, depth: 0.08, lit: 'face', logo: 'bid1:chase', logoAt: 'right', tracking: 0.1 },
            glazing: { bulkhead: 0.3, transom: 0.6, mullions: 5, frame: 'alu_clear' }, door: { u: 0.62, w: 1.0, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 13.1, u1: 19.6, kind: 'store', name: 'McDonald\'s', interior: 'restaurant', lit: 1,
            sign: { kind: 'channel', text: 'McDonald\'s', font: 'Inter-700', fg: '#ffffff', bg: '#2f2f31', u0: 13.3, u1: 19.4, h: 0.55, y: 4.5, depth: 0.08, lit: 'face', logo: 'bid1:mcd', logoAt: 'right' },
            glazing: { bulkhead: 0.35, transom: 0.4, mullions: 3, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0, kind: 'glass', recess: 0.2 },
            awning: { kind: 'fixed', color: '#c42127', drop: 0.2, proj: 0.8 } },
          { u0: 19.8, u1: 28.8, kind: 'store', name: 'CityMD', interior: 'pharmacy', lit: 1,
            sign: { kind: 'panel', text: 'CityMD', font: 'Montserrat-800', fg: '#e11b2d', bg: '#ffffff', u0: 19.8, u1: 28.8, h: 1.15, y: 4.25, depth: 0.1, lit: 'face', logo: 'bid1:citymd', logoAt: 'fill' },
            glazing: { bulkhead: 0.35, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 29.4, u1: 33.7, kind: 'store', name: '(corner store, 360)', interior: 'shop_food', lit: 1,
            glazing: { bulkhead: 0.35, transom: 0.4, mullions: 2, frame: 'alu_clear' }, door: { u: 0.6, w: 1.0, kind: 'glass', recess: 0.2 },
            sign: { kind: 'numbers', text: '360', fg: '#e8e8e8', u0: 31.2, u1: 31.8, h: 0.2, y: 3.0 } },
        ],
      },
      floors: [{ n: 1, h: 4.2, open: [[2.1, 4.9, 'A'], [7.5, 11.8, 'A'], [14.3, 19.0, 'A'], [21.3, 25.3, 'A']] }],
      bays: { widths: [1.3, 4.0, 1.2, 4.0, 3.0, 5.2, 2.2, 3.2, 9.72] },
      windows: { A: { w: 2.6, h: 2.6, sill: 0.45, kind: 'fixed', mullions: 1, transom: 0.8, frame: 'alu_bronze', reveal: 0.14, lintel: { kind: 'none' }, sillStone: { mat: 'cast_stone', tint: '#cbc3b2', h: 0.1, proj: 0.04 }, blinds: 0.5, lit: 0.4 } },
      bands: [{ at: 9.0, h: 0.35, proj: 0.05, mat: 'cast_stone', tint: '#cbc3b2' }],
      cornice: { kind: 'parapet', h: 0.3, mat: 'brick_tan', tint: '#a89c84' },
    }, {
      // St. Nicholas Ave side: the entry pilaster,
      // Pizza Hut, a blank white-painted wall with three louvres, Chase wrapping the corner; above, five windows between tan brick
      // pilasters, each under a diaper-brick head panel
      edge: [1546.7, -3068.2, 1532.9, -3043.1],
      base: {
        h: 5.45, wall: { mat: 'stucco', tint: '#d8d4ca', dirt: 0.45, to: 5.45 },
        bays: [
          { u0: 1.4, u1: 3.1, kind: 'entrance', h: 3.0, door: { kind: 'solid', w: 1.0, tint: '#26262a', transom: 0.4, recess: 0.3 } },
          { u0: 4.2, u1: 10.0, kind: 'store', h: 3.8, name: 'Pizza Hut', interior: 'restaurant', lit: 1,
            glazing: { bulkhead: 0.45, transom: 0, mullions: 3, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, kind: 'glass', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 21.2, u1: 28.4, kind: 'window', h: 3.8, name: 'Chase', interior: 'bank', lit: 1,
            glazing: { bulkhead: 0.3, transom: 0, mullions: 5, frame: 'alu_clear' }, gate: { kind: 'none' } },
        ],
      },
      floors: [{ n: 1, h: 4.75, open: [[2.0, 3.0, 'Bs'], [5.4, 8.0, 'B'], [10.25, 12.9, 'B'], [15.2, 17.75, 'B'], [20.1, 22.7, 'B'], [25.0, 27.6, 'B']] }],
      windows: {
        B: { w: 2.6, h: 2.3, sill: 0.5, kind: 'fixed', mullions: 1, transom: 0.8, frame: 'alu_bronze', reveal: 0.2, lintel: { kind: 'flat', mat: 'brick_tan', tint: '#b09a72', h: 0.55, ext: 0.12, proj: 0.04 }, sillStone: { mat: 'cast_stone', tint: '#cbc3b2', h: 0.12, proj: 0.05 }, blinds: 0.4, lit: 0.4 },
        Bs: { w: 1.0, h: 1.8, sill: 0.75, kind: 'dh', lights: '1/1', frame: 'alu_bronze', reveal: 0.15, lintel: { kind: 'flat', mat: 'brick_tan', tint: '#b09a72', h: 0.3, ext: 0.08, proj: 0.03 }, sillStone: { mat: 'cast_stone', tint: '#cbc3b2', h: 0.1, proj: 0.04 }, blinds: 0.5, lit: 0.3 },
      },
      piers: { mat: 'brick_tan', tint: '#a8966f', w: 1.1, proj: 0.05, at: [4.2, 9.15, 14.1, 19.0, 23.9, 28.4], from: 'base', to: 9.9, capital: false, base: false },
      bands: [{ at: 9.0, h: 0.35, proj: 0.05, mat: 'cast_stone', tint: '#cbc3b2' }],
      items: [
        { k: 'sign', sign: { kind: 'panel', text: '', bg: '#14141a', u0: 3.9, u1: 10.3, h: 1.65, y: 3.85, depth: 0.06, lit: 'none' } },
        { k: 'sign', sign: { kind: 'panel', text: 'Pizza Hut', font: 'Inter-800', fg: '#ffffff', bg: null, u0: 4.6, u1: 9.6, h: 0.75, y: 4.3, depth: 0.04, lit: 'face', logo: 'bid1:pizzahut', logoAt: 'fill' }, z: 0.08 },
        { k: 'sign', sign: { kind: 'panel', text: '', bg: '#222d46', u0: 20.3, u1: 28.7, h: 1.6, y: 3.85, depth: 0.06, lit: 'none' } },
        { k: 'sign', sign: { kind: 'channel', text: 'CHASE', font: 'Inter-700', fg: '#ffffff', bg: null, u0: 21.7, u1: 26.3, h: 0.62, y: 4.35, depth: 0.08, lit: 'face', logo: 'bid1:chase', logoAt: 'right', tracking: 0.1 }, z: 0.07 },
        { k: 'vent', u: 12.0, y: 3.3, w: 0.8, h: 0.42, tint: '#cfcbc0' }, { k: 'vent', u: 14.2, y: 3.3, w: 0.8, h: 0.42, tint: '#cfcbc0' }, { k: 'vent', u: 17.2, y: 3.3, w: 0.8, h: 0.42, tint: '#cfcbc0' },
      ],
      cornice: { kind: 'parapet', h: 0.3, mat: 'brick_tan', tint: '#a89c84' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'terracotta' }, membrane: 'black', items: [] },
    refs: [],
    notes: 'two-storey tan brick (1955) with a cast-stone band; the 2nd floor windows carry "BR AC E2 / 212 222 3210" window lettering (a leasing office) - vinyl on the windows is not in the schema; a street tree hides the east half above the stores; St. Nicholas side not spec\'d.',
  },
  // ============================================================== SOUTH SIDE, St. Nicholas Ave to Frederick Douglass Blvd
  {
    id: 'w125-324', addr: '324 W 125th St (SE corner of St. Nicholas Ave)', bin: '1090670', status: 'measured',
    at: [1581.31, -3035.65], comp: '3_-6:187', h: 12.8,
    // (BF36) painted light grey panels with weathered joints; the brushed aluminium set (panel_alu) is a sky
    // mirror and glowed white at dusk and night over the whole box (t8StNickDive, cvs_nw_dusk)
    wall: BF36 ? { mat: 'panel_grey', tint: '#b3b4af', dirt: 0.4 } : { mat: 'panel_alu', tint: '#c9c8c4', dirt: 0.2 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.0, fascia: { h: 1.0, mat: 'brick_tan', tint: '#4b4d52', proj: 0.02 },
        // (BF36) the piers between the openings are the charcoal brick of the base, not the panel wall
        ...(BF36 ? { wall: { mat: 'brick_tan', tint: '#45484e', dirt: 0.32, to: 4.0 } } : {}),
        bays: [
          { u0: 4.2, u1: 26.8, kind: 'store', name: 'CVS pharmacy', interior: { kind: 'pharmacy', tone: '#a06c68', lit: 0.75 },
            glazing: { bulkhead: 0.3, transom: 0.8, mullions: 9, frame: 'alu_clear' }, door: { u: 0.92, w: 1.0, kind: 'double', recess: 0.1 }, gate: { kind: 'none' } },
          // (BF36) the pharmacy's corner doors are glass sliders under the canopy, not a panelled pair
          { u0: 27.6, u1: 29.9, kind: 'entrance', h: 3.2, door: BF36 ? { kind: 'glass', w: 2.0, transom: 0.6, frame: 'alu_clear', recess: 0.2 } : { kind: 'double', w: 1.0, transom: 0.6, frame: 'alu_clear' } },
        ],
      },
      // (BF36) the west windows too (four, behind the ENTRANCE AROUND CORNER graphics; a street tree hides them in s324):
      floors: [{ n: 1, h: 2.8, win: 'none' }, { n: 1, h: 4.4, win: 'M', bays: BF36 ? [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7] }],
      bays: { widths: BF36 ? [3.7, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 7.51, 1.6, 1.6, 1.6, 1.6, 1.5] : [3.7, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 15.41] },
      windows: {
        M: { w: 1.42, h: 3.1, sill: 0.4, kind: 'fixed', mullions: 0, transom: 0.4, frame: 'alu_black', reveal: 0.1, lintel: { kind: 'none' }, sillStone: null, blinds: 0.9, lit: 0.6 },
        none: { kind: 'none' },
      },
      items: [{ k: 'grille', u: 5.2, y: 4.25, w: 3.2, h: 0.55, tint: '#1c1c1c' }, { k: 'grille', u: 10.2, y: 4.25, w: 3.2, h: 0.55, tint: '#1c1c1c' }, { k: 'grille', u: 15.3, y: 4.25, w: 3.2, h: 0.55, tint: '#1c1c1c' }, { k: 'grille', u: 20.4, y: 4.25, w: 3.2, h: 0.55, tint: '#1c1c1c' }],
      cornice: BF36 ? { kind: 'parapet', h: 0.25, mat: 'panel_grey', tint: '#a9aba8' } : { kind: 'parapet', h: 0.25, mat: 'panel_alu', tint: '#c9c8c4' },
    }, W324_STNICH],
    custom: { fn: 'bid1:w324', with: 'kit' },
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'panel_grey' }, membrane: 'white', items: [] },
    refs: [],
    notes: '2016: a white panel box over a charcoal herringbone-brick band with four black louvre panels at 4.0-5.0 m; the big white sign band 5.1-7.8 m carries the CVS heart + "CVS pharmacy" (bid1:w324 adds the letters); the 2nd floor MRI / MRA / CT / XRAY / SONO windows (a medical imaging centre, "NOW OPEN" starburst) at 8.0-11.4 m; ' +
      'a charcoal brick pier at the St. Nicholas end (u 0-3.7) rises above the roof; the lobby door at the east end.',
  },
  {
    id: '280-stnich', addr: '280 St. Nicholas Ave (Harlem USA), 125th St front, SW corner of Frederick Douglass Blvd', bin: '1059298', status: 'measured',
    at: [1621.71, -2975.72], comp: '3_-6:128', h: 18.6,
    // (BF36) painted grey panels: the brushed aluminium set is a sky mirror and the walls round the CVS notch glowed white at dusk
    wall: BF36 ? { mat: 'panel_grey', tint: '#b9bcbd', dirt: 0.3 } : { mat: 'panel_alu', tint: '#c3c7ca', dirt: 0.2 },
    custom: { fn: 'bid1:harlemusa', with: 'kit' },
    faces: [{
      // u from the FDB corner (east end) westward, as seen from 125th
      edge: 'front',
      base: {
        h: 3.7, fascia: { h: 0.4, mat: 'panel_alu', tint: '#b3b8bb', proj: 0.35 },
        bays: [
          { u0: 0.3, u1: 15.2, kind: 'store', name: 'TD Bank', interior: 'bank', lit: 1,
            sign: { kind: 'lightbox', text: 'TD', font: 'Inter-800', fg: '#ffffff', bg: '#2d8a3e', u0: 9.4, u1: 11.2, y: 2.35, h: 1.3, depth: 0.14, lit: 'face', frame: '#ffffff' },
            glazing: { bulkhead: 0.3, transom: 0.5, mullions: 7, frame: 'alu_clear' }, door: { u: 0.55, w: 1.0, kind: 'double', recess: 0.3 }, gate: { kind: 'none' } },
          { u0: 15.5, u1: 24.4, kind: 'store', interior: 'shop_clothing', lit: 1,
            glazing: { bulkhead: 0.3, transom: 0.5, mullions: 4, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.3 }, gate: { kind: 'none' } },
          { u0: 24.7, u1: 38.3, kind: 'store', name: 'Rainbow (juniors, shoes, plus sizes)', interior: 'shop_clothing', lit: 1,
            sign: { kind: 'panel', text: 'Rainbow', font: 'Lobster', fg: '#ffffff', bg: '#1e67c6', u0: 24.8, u1: 28.9, y: 3.55, h: 1.45, depth: 0.12, lit: 'face', logo: 'bid1:rainbowpanel', logoAt: 'fill' },
            glazing: { bulkhead: 0.3, transom: 0.5, mullions: 6, frame: 'alu_clear' }, door: { u: 0.25, w: 1.0, kind: 'double', recess: 0.3 }, gate: { kind: 'none' } },
          { u0: 39.9, u1: 49.6, kind: 'store', name: 'Old Navy', interior: 'shop_clothing', lit: 1,
            glazing: { bulkhead: 0.3, transom: 0.4, mullions: 4, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 49.6, u1: 59.3, kind: 'store', interior: 'shop_clothing', lit: 1,
            glazing: { bulkhead: 0.3, transom: 0.4, mullions: 4, frame: 'alu_clear' }, door: { u: 0.2, w: 1.0, kind: 'double', recess: 0.2 }, gate: { kind: 'none' } },
          { u0: 61.2, u1: 75.6, kind: 'store', interior: 'shop_clothing', lit: 1,
            glazing: { bulkhead: 0.4, transom: 0.4, mullions: 6, frame: 'alu_clear' }, door: { u: 0.3, w: 1.0, kind: 'double', recess: 0.3 }, gate: { kind: 'none' } },
        ],
      },
      floors: [{ n: 1, h: 4.5, win: 'none' }, { n: 1, h: 10.0, win: 'none' }],
      windows: { none: { kind: 'none' } },
      cornice: { kind: 'parapet', h: 0.2, mat: 'panel_alu', tint: '#c3c7ca' },
    }, {
      // the Frederick Douglass Blvd face: two storeys of retail glass over a louvre band, the glass curtain wall with its billboard above (bid1:harlemusa
      // draws them), TD Bank at the corner; the kit's default for an unspecified face was a white wall with small windows
      edge: [1667.5, -3003.46, 1637.81, -2949.86],
      base: {
        h: 3.7, fascia: { h: 0.4, mat: 'panel_alu', tint: '#b3b8bb', proj: 0.35 },
        bays: [
          { u0: 0.4, u1: 22.0, kind: 'window', interior: { kind: 'shop_clothing', tone: '#4a4f55', lit: 0.5 }, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 8, frame: 'alu_clear' } },
          { u0: 22.3, u1: 45.0, kind: 'store', interior: { kind: 'shop_clothing', tone: '#4a4f55', lit: 0.5 }, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 8, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0, kind: 'double', recess: 0.3 } },
          { u0: 45.3, u1: 60.8, kind: 'store', name: 'TD Bank', interior: { kind: 'bank', tone: '#5a6066', lit: 0.5 }, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 6, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0, kind: 'double', recess: 0.3 } },
        ],
      },
      floors: [{ n: 1, h: 4.5, win: 'none' }, { n: 1, h: 10.0, win: 'none' }],
      windows: { none: { kind: 'none' } },
      cornice: { kind: 'parapet', h: 0.2, mat: 'panel_alu', tint: '#c3c7ca' },
    }].concat(BF36 ? [{
      // (BF36) the St. Nicholas Ave face south of the CVS: a tall blind box of light grey metal panels
      // over a dark base with the store glass, where the kit's default drew a white wall with rows of small black windows
      edge: [1561.51, -3030.95, 1545.2, -3001.1],
      wall: { mat: 'panel_grey', tint: '#b7babb', dirt: 0.35 },
      base: {
        h: 4.2, wall: { mat: 'brick_tan', tint: '#45484e', dirt: 0.3, to: 4.2 },
        bays: [{ u0: 1.5, u1: 13.5, kind: 'window', interior: { kind: 'shop_clothing', tone: '#4a4f55', lit: 0.5 }, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 5, frame: 'alu_clear' } }],
      },
      floors: [{ n: 1, h: 14.4, win: 'none' }],
      windows: { none: { kind: 'none' } },
      cornice: { kind: 'parapet', h: 0.2, mat: 'panel_grey', tint: '#a9adaf' },
    }] : []),
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'panel_grey' }, membrane: 'white', items: [{ k: 'antenna', at: [0.76, 0.05], h: 1.5 }] },
    refs: [],
    notes: 'Harlem USA (1998-2000), 125th front measured off two orthos (u from FDB): the 3rd-4th floors are a point-fixed glass curtain wall 10.3-19.2 m over the whole 75.9 m (mullions ~2.2 m, joints at 12.4 / 14.9 / 17.4 m, an internal louvred sunshade band at 16.0-17.4 m) carrying a vinyl billboard at u 27.5-74 (a real fintech ad in 2026: an invented brand here, bid1:billboard); ' +
      'below: two storeys of retail glass (u 0-38.3 and 61.2-75.6, 4.1-8.6 m) over a louvre band 8.6-9.0 m; Old Navy portal of cast stone u 38.5-61.0 to 9.8 m round a white segmental-arched sign panel (4.7-8.5 m) with the blue letters; ' +
      'the red K&G band (FOR MEN / FOR WOMEN / FOR LESS) at 8.9-9.8 m over u 0-7.3 (the upper-floor store), TD Bank at the corner, Rainbow (blue panel + red script on the 2nd-floor glass), a clothing store at the west end; the FDB and St. Nicholas faces are not spec-ed yet. bid1:harlemusa builds the glass, the portal, the bands and the letters.',
  },
];
export default SPECS.map(prep);
