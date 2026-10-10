// AR33 building specs, segment east: Fifth Avenue to the river (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/east.json).
// Owner: the EAST worker (docs/notes/ar33-east.md). References under client/shots/ar33/east/refs: b<idx>_s / b<idx>_o are
// u runs LEFT TO RIGHT AS YOU FACE THE BUILDING FROM THE STREET: u = 0 is the WEST end on the north side of 125th, the EAST end on the south side.

// ------------------------------------------------------------------ helpers (local to this file)
const stone = (tint, o = {}) => ({ mat: 'stone_lime', tint, ...o });
// a double-hung / casement window type
const win = (o = {}) => ({ w: 1.0, h: 1.7, sill: 0.9, kind: 'dh', lights: '2/2', frame: 'alu_white', reveal: 0.12, ac: 0.22, blinds: 0.55, lit: 0.3, ...o });
const lintelOf = (kind, tint, h = 0.22, mat = 'stone_lime') => ({ kind, mat, tint, h });
const sillOf = (tint, h = 0.1, proj = 0.05, mat = 'stone_lime') => ({ mat, tint, h, proj });
// a storefront bay (kind 'store')
const shop = (u0, u1, o = {}) => ({ kind: 'store', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.5, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.8 }, interior: 'shop_food', ...o, u0, u1 });
const gateBox = (color = '#7c8083', down = 0) => ({ kind: 'rolldown', box: true, color, down });
const signOf = (text, fg, bg, u0, u1, y, h, o = {}) => ({ kind: o.kind || 'lightbox', text, font: o.font || 'Inter-700', fg, bg, u0, u1, y, h, fill: o.fill ?? 0.55, ...(o.extra || {}) });
// the Popeyes wordmark as SIGNS measured it (ar34-req/EAST.md 01:01): the lower-case e's 0.12 cap height below the line
const POP_RUNS = [{ text: 'POP' }, { text: 'e', dy: -0.12 }, { text: 'Y' }, { text: 'e', dy: -0.12 }, { text: 'S' }];

// A walk-up tenement front: a shop base, n floors of double-hung windows in `bays` bays, a pressed-metal cornice, a fire escape.
// o: { id, addr, at, comp, also, ring, h (roof), n (floors above the ground floor), tint, trim, bays, shops: [bay...] | shop: {...}, fe: [bay indices] | null, ... }
function tenement(o) {
  const n = o.n, baseH = o.baseH ?? 4.3, h = o.h, parH = o.parH ?? 0.5, cornH = o.cornH ?? 1.25;
  const fh = +((h - baseH - 0.55) / n).toFixed(3);
  const nb = o.bays ?? 3, trim = o.trim ?? '#cbbd9f', trimMat = o.trimMat ?? 'stone_lime';
  const wT = win({ w: o.ww ?? 1.05, h: o.wh ?? Math.min(1.9, +(fh * 0.6).toFixed(2)), sill: o.sill ?? Math.max(0.6, +(fh * 0.27).toFixed(2)), frame: o.frame ?? 'alu_white', lights: o.lights ?? '2/2', reveal: 0.14,
    lintel: lintelOf(o.lintel ?? 'flat', trim, 0.22, trimMat), sillStone: sillOf(trim, 0.1, 0.05, trimMat), ac: o.ac ?? 0.35, blinds: o.blinds ?? 0.55 });
  const shops = o.shops ?? [shop(0.35, (o.w ?? 7.6) - 0.35 - (o.door ?? 1.7), { name: o.shopName ?? 'shop', h: baseH - 0.85, glazing: { bulkhead: 0.35, transom: 0.0, mullions: 2, frame: 'alu_black' },
    door: { u: 0.3, w: 0.95, recess: 0.4 }, gate: o.gate ?? gateBox('#77797b', o.gateDown ?? 0), interior: o.interior ?? 'shop_food',
    sign: o.sign ? { ...o.sign } : (o.signBg && o.shopName ? signOf(o.shopName, o.signFg ?? '#ffffff', o.signBg, 0.35, (o.w ?? 7.6) - 0.35 - (o.door ?? 1.7) - 0.05, baseH - 0.85 + 0.03, 0.72) : undefined), awning: o.awning }),
  { kind: 'entrance', u0: (o.w ?? 7.6) - 0.35 - (o.door ?? 1.7) + 0.2, u1: (o.w ?? 7.6) - 0.35, door: { kind: 'solid', w: 0.95, recess: 0.3, tint: o.doorTint ?? '#2e2b29' } }];
  const face = {
    edge: o.edge ?? 'front', base: { h: baseH, bays: shops }, bays: { n: nb, margin: o.margin ?? [0.6, 0.6] },
    floors: [{ n, h: fh, win: 'A' }], windows: { A: wT },
    bands: [{ at: 'base', h: 0.3, proj: 0.06, mat: trimMat, tint: trim }, ...(o.bands || [])],
    cornice: { kind: o.cornice ?? 'bracketed', h: cornH, proj: o.cornProj ?? 0.55, mat: o.cornMat ?? 'metal_painted', tint: o.cornTint ?? '#6b4a3a', brackets: Math.max(3, nb * 2) },
  };
  if (o.fe !== null) face.fireEscape = { bays: o.fe ?? [Math.min(1, nb - 1)], floors: [1, n], kind: 'balcony', drop: true, tint: '#26282a' };
  return {
    id: o.id, addr: o.addr, name: o.name ?? null, bin: null, at: o.at, comp: o.comp, also: o.also, ring: o.ring, h, status: o.status ?? 'draft',
    ...(o.custom ? { custom: o.custom } : {}), ...(o.gateArt ? { gateArt: o.gateArt } : {}),
    wall: { mat: o.mat ?? 'brick_red', tint: o.tint ?? '#9a4a3a', dirt: o.dirt ?? 0.5 },
    faces: [face],
    roof: { kind: 'flat', parapet: { h: parH, coping: 'metal' }, membrane: 'black' },
    refs: o.refs, notes: o.notes,
  };
}

// The Lexington Avenue SW hoarding's panels from the corner westward to Popeyes (u 0 of the corner lot e125-lot-lexSW2; e125-lot-lexSW starts
// 11.1 m in): kinds, order and widths read off b64_s (the corner end off b65_s) through their cameras, then scaled by 0.888 to the two lots'
// painters (custom/east.js MU_PANELS) invent every face, figure and letter in the panel's kind, palette and density. The hoarding stands
// ~1.8 m out on the sidewalk, not on the lot line: its foot sits lower in b63_s than Popeyes' and both b64_s and b65_s showed every panel
// ~13 % narrower in the twin's plates at the lot line (b3r1); `inset: -1.8` with returns to the lot line at both ends. Out there it runs
// on 0.8 m past the lot in front of Popeyes' east pier: `ext1: 0.8`, the run 35.96 m (the last two panels +0.4 m each).
const LEX_SW_RUN = [['pinkleaf', 2.22], ['greentags', 4.88], ['doodles', 4.35], ['woman', 3.05], ['leafy', 2.45], ['collage', 3.75], ['serpent', 2.55],
  ['elder', 2.51], ['door', 1.86], ['faces', 2.66], ['trees', 2.61], ['crowd', 3.07]];
// the yard fence of the Lexington-Third site, from the gate (the left end seen from the street)
const YARD_RUN = [['woman', 3.1], ['elder', 2.6], ['boombox', 3.4], ['faces', 2.8], ['collage', 4.2], ['pinkleaf', 2.3], ['crowd', 3.6], ['serpent', 2.7],
  ['figure', 3.0], ['leafy', 2.5], ['doodles', 4.4], ['trees', 2.8], ['greentags', 5.0], ['door', 1.9], ['faces', 2.6], ['collage', 3.1]];

export default [
  // ------------------------------------------------------------------ Park Avenue, north-east corner
  {
    id: 'e125-103', addr: '103 E 125th St (1825 Park Ave)', name: 'Chase, Zaro\'s, Lexington Optical', bin: null,
    at: [2755.97, -2450.51], comp: '5_-5:17', h: 43.21, status: 'draft',
    // b17 / b17_o (2026-08): 12 floors of dark brown-grey mottled brick over a tan limestone base of three floors (quoined corners, paired
    // windows between stone piers, a belt course over floor 3), a cornice with dentils. Ground floor: Chase at the Park Avenue corner,
    // a grey louvre panel over Zaro's and Lexington Optical, tan stone piers between.
    wall: { mat: 'brick_brown', tint: '#8f7d68', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: {
        h: 4.8,
        fascia: { h: 1.6, mat: 'panel_alu', tint: '#9ea2a4', u0: 11.4, u1: 23.4, proj: 0.1 },
        piers: { at: [0.5, 10.8, 23.9, 27.2], w: 1.0, mat: 'stone_lime', tint: '#b7a488', proj: 0.12 },
        bays: [
          shop(0.9, 10.3, { name: 'Chase', h: 4.4, interior: 'bank', glazing: { bulkhead: 0.45, transom: 0.6, mullions: 4, frame: 'alu_clear', kick: 'granite_grey' },
            door: { u: 0.8, w: 1.0, recess: 0.9 },
            sign: { kind: 'channel', text: 'CHASE', font: 'Inter-700', fg: '#2c7fd0', bg: '#4d5053', u0: 0.9, u1: 7.5, y: 4.0, h: 0.75, fill: 0.5 } }),
          shop(11.3, 16.6, { name: 'Zaro\'s', h: 4.2, interior: 'shop_food', glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_clear' },
            door: { u: 0.2, w: 0.95, recess: 0.5 },
            sign: { kind: 'panel', text: 'ZARO\'S', font: 'Inter-700', fg: '#f2efe8', bg: '#1f1f21', u0: 11.6, u1: 14.6, y: 3.45, h: 0.6, fill: 0.55 } }),
          shop(16.8, 23.4, { name: 'Lexington Optical', h: 4.2, interior: 'shop_phone', glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_clear' },
            door: { u: 0.78, w: 0.95, recess: 0.4 },
            sign: { kind: 'lightbox', text: 'LEXINGTON OPTICAL', font: 'Inter-700', fg: '#6f7275', bg: '#ecebe7', u0: 16.8, u1: 23.4, y: 3.75, h: 0.55, fill: 0.5 } }),
        ],
      },
      bays: { n: 9, margin: [0.7, 0.7] },
      floors: [
        { n: 2, h: 3.75, win: 'P' },
        { n: 9, h: 3.46, win: 'U' },
      ],
      windows: {
        P: win({ w: 1.15, h: 2.05, sill: 0.8, kind: 'dh', frame: 'alu_black', lights: '1/1', reveal: 0.18,
          lintel: lintelOf('flat', '#b7a488', 0.3), sillStone: sillOf('#b7a488', 0.14, 0.08), surround: { mat: 'stone_lime', tint: '#b7a488', w: 0.14, proj: 0.05 }, ac: 0.3 }),
        U: win({ w: 1.0, h: 1.62, sill: 0.95, frame: 'alu_black', lights: '1/1', reveal: 0.16,
          lintel: lintelOf('keystone', '#a89878', 0.2), sillStone: sillOf('#a89878', 0.1, 0.06), ac: 0.4 }),
      },
      rustication: { to: 12.3, mat: 'stone_lime', tint: '#b9a78b', joint: 0.55, block: 1.5, chamfer: 0.014 },
      piers: { mat: 'stone_lime', tint: '#b7a488', w: 0.95, proj: 0.1, at: [0.5, 27.4], from: 'base', to: 12.4, capital: false, base: false },
      bands: [
        { at: 'base', h: 0.5, proj: 0.16, mat: 'stone_lime', tint: '#c2b193' },
        { at: 'floor:4', h: 0.6, proj: 0.22, mat: 'stone_lime', tint: '#c2b193' },
        { at: 'floor:7', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#a89878' },
        { at: 'floor:11', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#a89878' },
      ],
      cornice: { kind: 'bracketed', h: 1.75, proj: 1.0, mat: 'stone_lime', tint: '#b09f82', brackets: 16 },
      items: [{ k: 'flagpole', u: 1.6, y: 7.0, tint: '#3a3a3a' }, { k: 'flagpole', u: 25.7, y: 7.0, tint: '#3a3a3a' }],
    }, {
      edge: 'corner',
      base: { h: 4.8, bays: [
        { kind: 'wall', u0: 0.2, u1: 20.0 },
        shop(20.6, 29.2, { name: 'Chase', h: 4.4, interior: 'bank', glazing: { bulkhead: 0.45, transom: 0, mullions: 3, frame: 'alu_clear', kick: 'granite_grey' }, door: null }),
      ] },
      bays: { n: 10, margin: [0.5, 0.5] },
      floors: [{ n: 2, h: 3.75, win: 'P' }, { n: 9, h: 3.46, win: 'U' }],
      windows: {
        P: win({ w: 1.15, h: 2.05, sill: 0.8, kind: 'dh', frame: 'alu_black', lights: '1/1', reveal: 0.18,
          lintel: lintelOf('flat', '#b7a488', 0.3), sillStone: sillOf('#b7a488', 0.14, 0.08), ac: 0.3 }),
        U: win({ w: 1.0, h: 1.62, sill: 0.95, frame: 'alu_black', lights: '1/1', reveal: 0.16,
          lintel: lintelOf('keystone', '#a89878', 0.2), sillStone: sillOf('#a89878', 0.1, 0.06), ac: 0.4 }),
      },
      rustication: { to: 12.3, mat: 'stone_lime', tint: '#b9a78b', joint: 0.55, block: 1.5, chamfer: 0.014 },
      bands: [{ at: 'floor:4', h: 0.6, proj: 0.22, mat: 'stone_lime', tint: '#c2b193' }, { at: 'floor:7', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#a89878' }],
      cornice: { kind: 'bracketed', h: 1.75, proj: 1.0, mat: 'stone_lime', tint: '#b09f82', brackets: 16 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.55, 0.45], w: 4.2, d: 3.0, h: 3.0 }] },
    refs: [],
    notes: 'Bay count (9) and floor heights estimated from b17_o; LED "HALAL" ticker signs over the ground floor are not drawn. Unknown: the Park Avenue face above the viaduct, the roof.',
  },

  // ------------------------------------------------------------------ 107-113 E 125th, between Park and Lexington (north side)
  {
    id: 'e125-107', addr: '107 E 125th St', name: 'QN Buffet & Deli', bin: null,
    at: [2771.32, -2441.94], comp: '5_-5:144', h: 13.29, status: 'draft',
    wall: { mat: 'terracotta_cream', tint: '#d3c5a2', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: { h: 4.7, bays: [
        shop(0.4, 6.9, { name: 'QN Buffet & Deli', h: 3.55, glazing: { bulkhead: 0.55, transom: 0.0, mullions: 2, frame: 'alu_white' }, door: { u: 0.52, w: 1.0, recess: 0.3 },
          gate: gateBox('#8d8f8c', 0), interior: 'shop_food',
          sign: { kind: 'lightbox', text: 'QN Buffet & Deli', font: 'Inter-700', fg: '#79c043', bg: '#141414', u0: 0.0, u1: 7.25, y: 3.65, h: 1.05, fill: 0.5 } }),
      ] },
      bays: { n: 4, margin: [0.55, 0.55] },
      floors: [{ n: 2, h: 3.55, win: 'A' }],
      windows: { A: win({ w: 1.0, h: 1.75, sill: 0.8, frame: 'alu_black', lights: '1/1', reveal: 0.14, lintel: lintelOf('flat', '#c9b98f', 0.2), sillStone: sillOf('#c9b98f', 0.1, 0.05), ac: 0.25 }) },
      bands: [{ at: 'base', h: 0.3, proj: 0.08, mat: 'terracotta_cream', tint: '#c7b894' }, { at: 'floor:3', h: 0.8, proj: 0.04, mat: 'terracotta_cream', tint: '#c1b18a' }],
      cornice: { kind: 'bracketed', h: 1.5, proj: 0.75, mat: 'metal_painted', tint: '#2c2926', brackets: 6 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Cream terracotta front between two taller neighbours; dark pedimented sheet-metal cornice (pediment not modelled).',
  },
  {
    id: 'e125-109', addr: '109 E 125th St', name: null, bin: null,
    at: [2780.44, -2442.9], comp: '5_-5:44', h: 15.3, status: 'draft',
    wall: { mat: 'brick_red', tint: '#8b6756', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: { h: 4.4, bays: [shop(0.4, 7.35, { h: 3.4, name: 'shop', glazing: { bulkhead: 0.4, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: { u: 0.25, w: 1.0, recess: 0.5 }, gate: gateBox('#6f7377', 0), interior: 'empty' })] },
      bays: { n: 3, margin: [0.55, 0.55] },
      floors: [{ n: 3, h: 3.55, win: 'A' }],
      windows: { A: win({ w: 1.05, h: 1.85, sill: 0.8, frame: 'alu_white', reveal: 0.14, lintel: lintelOf('flat', '#c7b89b', 0.22), sillStone: sillOf('#c7b89b', 0.1, 0.05), ac: 0.3 }) },
      bands: [{ at: 'base', h: 0.25, proj: 0.06, mat: 'stone_lime', tint: '#bfb298' }],
      cornice: { kind: 'bracketed', h: 1.2, proj: 0.55, mat: 'metal_painted', tint: '#6b5140', brackets: 5 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Red brick 4-storey tenement front between the QN deli and the 24/7 Quick market; 3 bays.',
  },
  {
    id: 'e125-111', addr: '111-113 E 125th St', name: '24/7 Quick Snacks & Mini Market', bin: null,
    at: [2785.14, -2435.81], comp: '5_-5:64', also: [[2790.02, -2429.04]],
    ring: [[2774.14, -2423.59], [2787.41, -2447.46], [2793.83, -2443.88], [2800.6, -2440.1], [2787.33, -2416.23]],
    h: 16.6, status: 'draft',
    // (AR34 w2 b3) the gate's boombox mural painted by east:gateArt (it was the kit's lettered piece)
    custom: { fn: 'east:gateArt', with: 'kit' }, gateArt: [{ u0: 8.62, u1: 14.78, y0: 0.16, y1: 3.16, plan: [['boombox', 6.16]] }],
    // b20_s (2026-08): one 15.1 m building of five storeys (the data splits it into 111 and 113): a green painted cast-iron front on floors 2-3
    // (eight arched openings), red-brown brick with terracotta bands on floors 4-5 (arched windows on the top floor), a fire escape on the
    // east bays; ground floor: the 24/7 shop (lit sign), a door, and a roll-down gate painted with a boombox mural.
    wall: { mat: 'brick_red', tint: '#926b59', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: { h: 4.4, bays: [
        shop(0.4, 6.3, { name: '24/7 Quick Snacks & Mini Market', h: 3.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.12, w: 0.95, recess: 0.6 },
          interior: 'shop_food',
          sign: { kind: 'lightbox', text: '24/7 Quick Snacks & Mini Market', font: 'Anton', fg: '#f4d61c', bg: '#33215f', u0: 0.0, u1: 7.4, y: 3.5, h: 1.0, fill: 0.55 } }),
        { kind: 'entrance', u0: 6.7, u1: 8.0, door: { kind: 'solid', w: 0.95, recess: 0.3, tint: '#2a2523' } },
        shop(8.6, 14.8, { name: 'roll-down gate mural', h: 3.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, gate: { kind: 'rolldown', box: true, color: '#c9c4b8', down: 0.97, graffiti: 0 }, interior: 'empty' }),
      ] },
      bays: { n: 8, margin: [0.25, 0.25] },
      floors: [
        { n: 1, h: 3.4, win: 'G' },
        { n: 1, h: 3.1, win: 'G' },
        { n: 1, h: 2.9, win: 'A' },
        { n: 1, h: 2.8, win: 'R' },
      ],
      windows: {
        G: win({ w: 1.25, h: 2.45, sill: 0.4, kind: 'fixed', frame: 'metal_painted', lights: '1/1', reveal: 0.2, lintel: lintelOf('none', '#2f5d4c'), sillStone: null, ac: 0, blinds: 0.9 }),
        A: win({ w: 0.95, h: 1.7, sill: 0.6, frame: 'alu_white', reveal: 0.14, lintel: lintelOf('flat', '#c08970', 0.2, 'terracotta_cream'), sillStone: sillOf('#c08970', 0.1, 0.05, 'terracotta_cream'), ac: 0.35 }),
        R: win({ w: 0.95, h: 1.6, sill: 0.6, frame: 'alu_white', lights: '1/1', reveal: 0.14, lintel: lintelOf('keystone', '#c08970', 0.22, 'terracotta_cream'), sillStone: sillOf('#c08970', 0.08, 0.04, 'terracotta_cream'), ac: 0.25 }),
      },
      bands: [
        { at: 'base', h: 0.5, proj: 0.1, mat: 'metal_painted', tint: '#2f5d4c' },
        { at: 'floor:4', h: 0.45, proj: 0.1, mat: 'metal_painted', tint: '#2f5d4c' },
        { at: 'floor:5', h: 0.3, proj: 0.06, mat: 'terracotta_cream', tint: '#c08970' },
      ],
      piers: { mat: 'metal_painted', tint: '#2f5d4c', w: 0.22, proj: 0.1, at: [0.25, 1.9, 3.8, 5.7, 7.6, 9.5, 11.4, 13.3, 14.85], from: 'base', to: 10.3, capital: true, base: true },
      cornice: { kind: 'bracketed', h: 1.4, proj: 0.6, mat: 'metal_painted', tint: '#8a4a38', brackets: 8 },
      fireEscape: { bays: [5, 6, 7], floors: [1, 4], kind: 'balcony', drop: true },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'The green ironwork is drawn as painted-steel piers and bands (round arches are flat-headed in the kit).',
  },
  {
    id: 'e125-115', addr: '115 E 125th St', name: 'breakfast and sandwich shop', bin: null,
    at: [2804.44, -2415.41], comp: '5_-5:129', h: 9.98, status: 'draft',
    // b22: two storeys, beige stucco with tan quoin frames, dark polished granite base; 30.7 m wide
    wall: { mat: 'stucco', tint: '#d9ceb7', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, bays: [
        shop(0.4, 8.4, { name: 'Breakfast & Sandwich', h: 3.2, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.85, w: 1.0, recess: 0.3 }, gate: gateBox('#46484a', 0), interior: 'shop_food',
          sign: { kind: 'lightbox', text: 'BREAKFAST & SANDWICH', font: 'Inter-700', fg: '#ffffff', bg: '#6d3b2a', u0: 0.5, u1: 8.3, y: 3.3, h: 0.7, fill: 0.5 } }),
        shop(9.2, 17.6, { h: 3.2, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: null, gate: gateBox('#3c3e40', 0.92), interior: 'empty' }),
        shop(24.4, 27.0, { h: 3.2, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, gate: gateBox('#46484a', 0.95), interior: 'empty' }),
      ] },
      bays: { widths: [2.0, 5.4, 4.2, 4.6, 5.5, 4.8, 4.2] },
      floors: [{ n: 1, h: 4.6, win: 'A', bays: [1, 3, 5] }],
      windows: { A: win({ w: 1.7, h: 1.6, sill: 1.1, frame: 'alu_black', lights: '1/1', reveal: 0.16, lintel: lintelOf('none', '#c9b48d'), sillStone: null, surround: { mat: 'stone_lime', tint: '#b99c6c', w: 0.22, proj: 0.04 }, ac: 0.3 }) },
      rustication: { to: 4.2, mat: 'granite_grey', tint: '#4a4144', joint: 0.6, block: 1.2, chamfer: 0.01 },
      bands: [{ at: 'base', h: 0.22, proj: 0.07, mat: 'stone_lime', tint: '#b99c6c' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.25, mat: 'stucco', tint: '#b99c6c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Two-storey stucco front with tan-painted quoined window frames above a dark polished stone base; roll-down gates.',
  },

  // ------------------------------------------------------------------ Lexington Avenue, north-west and north-east corners
  {
    id: 'e125-127', addr: '127 E 125th St', name: 'Olgam Life plasma center, delis', bin: null,
    at: [2836.61, -2405.95], comp: '5_-5:104', h: 14.3, status: 'draft',
    // b23 (2001): three storeys of silver aluminium panel with a red-painted band on the second floor and ribbons of grey glass
    // (AR34 w2 b3) the panels read white in b3r3: tint down; the second floor's windows framed in red
    wall: { mat: 'panel_alu', tint: '#8f9497', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        shop(0.4, 8.9, { name: 'Plasma Donation Center', h: 3.7, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 2, frame: 'alu_clear' }, door: { u: 0.22, w: 1.0, recess: 0.5 },
          interior: 'pharmacy', awning: { kind: 'fixed', color: '#3d2a86', drop: 0.42, proj: 1.35, text: 'PLASMA DONATION CENTER', font: 'Oswald-600', fg: '#ffffff' } }),
        shop(9.6, 14.8, { name: 'Fast Cash', h: 3.7, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 2, frame: 'alu_clear' }, door: null, gate: gateBox('#8d9296', 0.94), interior: 'empty' }),
        shop(15.2, 20.0, { name: 'Deli Cafe Salad & Juice Bar', h: 3.5, glazing: { bulkhead: 0.45, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, interior: 'shop_food',
          sign: { kind: 'lightbox', text: 'Deli Cafe Salad & Juice Bar', font: 'Inter-700', fg: '#ffffff', bg: '#2a2a2a', u0: 15.2, u1: 20.0, y: 3.6, h: 0.65, fill: 0.5 } }),
        shop(20.3, 25.0, { name: 'Deli', h: 3.5, glazing: { bulkhead: 0.45, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.25, w: 1.0, recess: 0.4 }, interior: 'shop_food',
          sign: { kind: 'lightbox', text: 'DELI', font: 'Anton', fg: '#ffffff', bg: '#232323', u0: 20.3, u1: 25.0, y: 3.6, h: 0.65, fill: 0.6 } }),
        shop(25.4, 29.9, { h: 3.6, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: null, interior: 'empty' }),
        shop(30.3, 34.3, { h: 3.6, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: { u: 0.7, w: 1.0, recess: 0.4 }, interior: 'empty' }),
      ] },
      bays: { n: 9, margin: [0.7, 0.7] },
      floors: [{ n: 1, h: 4.0, win: 'R2' }, { n: 1, h: 4.0, win: 'R' }],
      windows: {
        R: { w: 3.3, h: 2.55, sill: 0.6, kind: 'ribbon', mullions: 1, transom: 0.8, frame: 'alu_clear', glass: 'glass_grey', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.6, lit: 0.3 },
        R2: { w: 3.3, h: 2.0, sill: 1.0, kind: 'ribbon', mullions: 1, frame: 'metal_painted', frameTint: '#e04a44', frameW: 0.16, glass: 'glass_grey', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.7, lit: 0.3 },
      },
      // (AR34 w2 b3) the red frame of the second floor is smooth painted panel (refs_lv/b23_s.jpg): the chipped metal_painted set read as red
      // rock (sbs_w2r1/b23_s.jpg); the purple Olgam Life box over the west bay from the awning up into the third floor, its lettering at the top
      // (session 2: the box is a plain slab here, a face pier; as an empty sign panel it cost a 2176 x 1638 px canvas read back at load)
      piers: { at: [{ u: 4.65, w: 8.5, proj: 0.12, from: 4.75, to: 11.15, mat: 'plain', tint: '#46308f' }], capital: false, base: false },
      bands: [
        { at: 4.6, h: 1.0, proj: 0.05, mat: 'plain', tint: '#e04a44', rough: 0.45 },
        { at: 7.6, h: 0.75, proj: 0.05, mat: 'plain', tint: '#e04a44', rough: 0.45 },
        { at: 'floor:3', h: 0.12, proj: 0.1, mat: 'alu_clear' },
      ],
      items: [
        { k: 'grille', u: 9.2, y: 4.7, w: 0.6, h: 0.5 },
        { k: 'sign', sign: { kind: 'channel', text: 'Olgam Life', font: 'Inter-700', fg: '#ffffff', bg: null, u0: 1.0, u1: 8.3, y: 9.75, h: 1.05, fill: 0.85, lit: 'face' }, z: 0.14 },
        { k: 'sign', sign: { kind: 'panel', text: 'EARN CASH TODAY', lines: ['EARN CASH', 'TODAY'], font: 'Oswald-700', fg: '#ffffff', bg: '#7d6cc4', u0: 1.2, u1: 8.1, y: 5.9, h: 3.4, fill: 0.5 }, z: 0.14 },
      ],
      cornice: { kind: 'band', h: 0.75, proj: 0.25, mat: 'panel_alu', tint: '#9aa0a3' },
    }, {
      edge: 'corner',
      base: { h: 4.6, bays: [
        shop(1.0, 9.0, { h: 3.6, glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: null, interior: 'empty' }),
      ] },
      bays: { n: 6, margin: [0.7, 0.7] },
      floors: [{ n: 2, h: 4.0, win: 'R' }],
      windows: { R: { w: 3.6, h: 2.05, sill: 0.95, kind: 'ribbon', mullions: 1, frame: 'alu_clear', glass: 'glass_grey', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.6, lit: 0.3 } },
      bands: [{ at: 4.6, h: 1.0, proj: 0.05, mat: 'metal_painted', tint: '#e04a44' }, { at: 7.45, h: 0.85, proj: 0.05, mat: 'metal_painted', tint: '#e04a44' }],
      cornice: { kind: 'band', h: 0.75, proj: 0.25, mat: 'panel_alu', tint: '#9aa0a3' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.85, coping: 'metal' }, membrane: 'white', items: [{ k: 'hvac', at: [0.5, 0.5], n: 3 }] },
    refs: [], notes: 'Three-storey 2001 block: silver panels, red painted bands at the second floor, grey ribbon glazing. The Olgam Life purple sign panel over the west end is not drawn yet.',
  },
  {
    id: 'e125-145', addr: '145 E 125th St', name: '125th Street Community Health Center', bin: null,
    at: [2880.08, -2382.37], comp: '5_-5:120', h: 28.6, status: 'draft',
    // b24_s (2026-08): seven storeys of buff iron-spot brick with a brownstone belt course over floor 2, a two-storey base (red glazed tile at the
    // west half of the ground floor, a McDonald's-era window, the health-center entrance under a semicircular fanlight arch at the east end),
    // brownstone corner piers, paired windows in brick piers above, two round-arched windows in the top floor, a dentilled cornice.
    wall: { mat: 'brick_buff', tint: '#a28b6b', dirt: 0.45 },
    faces: [{
      edge: 'front',
      // ground floor read off b24_s at about 53 px/m (not rectified): red glazed tile from the west edge to u 10.4 round a closed gate
      // (u 0.1-3.9, marker tags on the tile and the curtain) and the vacant shop (u 6.0-10.3), a brownstone pier (u 10.4-11.7), the
      // health-center entrance (u 11.8-15.3) under the big round-arched fanlight of the second floor, the brownstone end pier
      base: { h: 4.6, wall: { mat: 'plain_tile', tint: '#bd2229', rough: 0.15, to: 4.35 },
        piers: { at: [{ u: 11.05, w: 1.3, mat: 'brownstone', tint: '#7c5645', proj: 0.12 }, { u: 16.3, w: 1.7, mat: 'brownstone', tint: '#7c5645', proj: 0.14 }] },
        bays: [
        shop(0.1, 3.9, { name: 'vacant shop', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, gate: { kind: 'rolldown', box: true, color: '#8d9094', down: 0.97, graffiti: { density: 0.45, style: 'tags', seed: 1451 } }, interior: 'empty' }),
        shop(6.0, 10.3, { name: 'Retail / restaurant space for lease', h: 3.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_clear' }, door: null, interior: { kind: 'empty', tone: '#d8d6d0', lit: 0.8 },
          vinyl: [{ text: 'Retail / Restaurant Space for Lease', u: 0.6, w: 1.4, y: 0.9, h: 1.5, fg: '#2d6fb7' }] }),
        { kind: 'entrance', u0: 11.8, u1: 15.4, door: { kind: 'double', w: 1.3, recess: 0.7, h: 2.6, transom: 0.9, frame: 'alu_clear' } },
      ] },
      graffiti: { u0: 0.15, u1: 10.35, y0: 0.25, y1: 3.6, density: 0.3, style: 'tags', seed: 145 },
      bays: { widths: [2.3, 1.6, 1.5, 1.4, 1.6, 1.8, 1.0, 1.8, 1.9, 1.56] },
      floors: [
        { n: 1, h: 4.4, win: 'B', open: [[1.4, 4.65, 'B'], [6.3, 9.3, 'B'], [11.6, 14.9, 'R']] },
        { n: 4, h: 3.75, win: 'M', bays: [1, 2, 4, 5, 7, 8] },
        { n: 1, h: 3.4, win: 'M', bays: [1, 2, 4, 5, 7, 8] },
      ],
      windows: {
        B: win({ w: 2.35, h: 2.55, sill: 0.55, kind: 'casement', frame: 'alu_black', reveal: 0.18, lintel: lintelOf('flat', '#a98c66', 0.3), sillStone: sillOf('#a98c66', 0.14, 0.07), ac: 0.1 }),
        R: win({ w: 3.3, h: 3.6, sill: 0.35, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.28, lintel: lintelOf('arch', '#7c5645', 0.5, 'brownstone'), sillStone: null, ac: 0, blinds: 0.1 }),
        M: win({ w: 1.2, h: 1.95, sill: 0.8, frame: 'alu_black', lights: '1/1', reveal: 0.18, lintel: lintelOf('flat', '#a98c66', 0.22), sillStone: sillOf('#a98c66', 0.1, 0.05), ac: 0.25 }),
      },
      piers: { mat: 'brownstone', tint: '#7c5645', w: 1.0, proj: 0.14, at: [{ u: 16.3, w: 1.7 }, { u: 11.05, w: 1.0 }], from: 'base', to: 8.9, capital: false, base: false },
      bands: [
        { at: 'base', h: 0.55, proj: 0.16, mat: 'brownstone', tint: '#7c5645' },
        { at: 'floor:3', h: 0.55, proj: 0.16, mat: 'brownstone', tint: '#7c5645' },
        { at: 'floor:4', h: 0.3, proj: 0.08, mat: 'stone_lime', tint: '#c7b48f' },
        { at: 'floor:6', h: 0.3, proj: 0.08, mat: 'stone_lime', tint: '#c7b48f' },
      ],
      cornice: { kind: 'dentil', h: 1.4, proj: 0.8, mat: 'brick_buff', tint: '#a98c66' },
      items: [{ k: 'plaque', u: 1.4, y: 8.95, w: 8.6, h: 0.4, mat: 'metal_painted', tint: '#5a4630' }],
    }, {
      edge: 'corner',
      base: { h: 4.6, bays: [
        shop(3.0, 11.0, { h: 3.7, glazing: { bulkhead: 0.4, transom: 0, mullions: 3, frame: 'alu_black' }, door: null, interior: 'empty' }),
        shop(14.0, 22.0, { h: 3.7, glazing: { bulkhead: 0.4, transom: 0, mullions: 3, frame: 'alu_black' }, door: null, interior: 'empty' }),
      ] },
      bays: { n: 9, margin: [0.8, 0.8] },
      floors: [{ n: 1, h: 4.4, win: 'M' }, { n: 5, h: 3.75, win: 'M' }],
      windows: {
        M: win({ w: 1.2, h: 1.95, sill: 0.8, frame: 'alu_black', lights: '1/1', reveal: 0.18, lintel: lintelOf('flat', '#a98c66', 0.22), sillStone: sillOf('#a98c66', 0.1, 0.05), ac: 0.25 }),
      },
      bands: [{ at: 'base', h: 0.55, proj: 0.16, mat: 'brownstone', tint: '#7c5645' }, { at: 'floor:3', h: 0.55, proj: 0.16, mat: 'brownstone', tint: '#7c5645' }],
      cornice: { kind: 'dentil', h: 1.4, proj: 0.8, mat: 'brick_buff', tint: '#a98c66' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.5, 0.55], w: 3.2, d: 2.6, h: 2.6 }] },
    refs: [], notes: 'Red tiled west half of the ground floor is approximated by terracotta kick plates; the semicircular fanlight arch over the entrance and the carved name band are not modelled. The 4/5/6 subway entrance at the corner belongs to PROPS.',
  },

  // ------------------------------------------------------------------ south side, Park to Lexington
  {
    id: 'e125-118', addr: '118 E 125th St', name: 'NMRNC nursing and rehabilitation', bin: null,
    at: [2761.18, -2365.3], comp: '5_-5:176', h: 37.25, status: 'draft',
    // b61 (1995): ten storeys of buff brick over a cream-tile base, brown awnings, a round-arch canopy at the entrance
    // (AR34 w2 b3) tint measured on b62_s: real h30 s.43 v.74, twin (b3r1, #c7a274) h30 s.48 v.65
    wall: { mat: 'brick_buff', tint: '#d6b385', dirt: 0.4 },
    faces: [{
      edge: [2759.08, -2396.67, 2785.63, -2381.98],
      base: { h: 4.8, bays: [
        shop(0.6, 3.6, { kind: 'window', h: 3.0, glazing: { bulkhead: 0.9, transom: 0.0, mullions: 1, frame: 'alu_bronze' }, door: null, interior: 'empty', awning: { kind: 'fixed', color: '#5a3a2a', drop: 0.3, proj: 1.0 } }),
        { kind: 'entrance', u0: 11.4, u1: 17.4, door: { kind: 'double', w: 1.2, recess: 0.8, h: 2.6, transom: 0.9, frame: 'alu_clear' },
          sign: { kind: 'panel', text: 'NMRNC', font: 'Inter-700', fg: '#ffffff', bg: '#6b3b2a', u0: 11.8, u1: 17.0, y: 3.5, h: 0.6, fill: 0.6 } },
        shop(20.0, 23.4, { kind: 'window', h: 2.9, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_bronze' }, door: null, interior: 'empty', awning: { kind: 'fixed', color: '#5a3a2a', drop: 0.3, proj: 1.0 } }),
        shop(24.0, 27.4, { kind: 'window', h: 2.9, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_bronze' }, door: null, interior: 'empty', awning: { kind: 'fixed', color: '#5a3a2a', drop: 0.3, proj: 1.0 } }),
        shop(28.0, 30.0, { kind: 'window', h: 2.9, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 0, frame: 'alu_bronze' }, door: null, interior: 'empty', awning: { kind: 'fixed', color: '#5a3a2a', drop: 0.3, proj: 1.0 } }),
      ] },
      bays: { n: 8, margin: [1.0, 1.0] },
      floors: [{ n: 9, h: 3.4, win: 'B' }],
      windows: { B: win({ w: 1.5, h: 1.45, sill: 0.95, frame: 'alu_bronze', lights: '1/1', reveal: 0.14, lintel: lintelOf('flat', '#c9b690', 0.16), sillStone: sillOf('#c9b690', 0.08, 0.04), ac: 0.6 }) },
      rustication: { to: 4.8, mat: 'stone_lime', tint: '#d6ccb4', joint: 0.6, block: 1.4, chamfer: 0.01 },
      bands: [{ at: 'base', h: 0.3, proj: 0.1, mat: 'stone_lime', tint: '#d0c5ab' }, { at: 'floor:6', h: 0.25, proj: 0.06, mat: 'stone_lime', tint: '#d0c5ab' }],
      cornice: { kind: 'band', h: 0.5, proj: 0.2, mat: 'brick_buff', tint: '#c0996b' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.4, 0.5], w: 4.0, d: 3.0, h: 3.0 }] },
    refs: [], notes: 'Buff-brick nursing home with a cream-tile base and brown awnings; the stepped upper floors are not modelled (the ring is the compiled one).',
  },
  {
    id: 'e125-120', addr: '120 E 125th St', name: 'former Harlem Free Library / Romanesque front', bin: null,
    at: [2781.65, -2366.61], comp: '5_-5:178', h: 13.2, status: 'draft',
    // b62_s: a red-painted cast-iron shopfront between
    // rock-faced brownstone piers (to ~5.8 m, its frieze at 4.4-5.0), two storeys of orange-red brick with three windows each and a narrow
    // stair window at the west (east? the left as seen) edge, a brownstone entablature over the third storey at ~12.6-13.2 m, then a brick
    // gable to ~18.0 m (the finial to 18.9) with an arched window in it (not drawn: the kit's gable parapet has no openings). The AR33
    // draft stood 19 m to the eaves with a 2.6 m gable over it (21.6 m). Brick tint calibrated on b3r1 (real h16-21 s.55 v.60, twin h16 s.64
    // v.42 at #8b634f: value x1.43, saturation x0.86).
    wall: { mat: 'brick_red', tint: '#c0907a', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: { h: 5.8, fascia: null, bays: [
        { kind: 'entrance', u0: 1.05, u1: 2.25, door: { kind: 'solid', w: 1.0, recess: 0.15, h: 2.9, transom: 0.7, tint: '#6e2a26', mat: 'wood_painted' } },
        shop(2.35, 5.55, { kind: 'store', h: 4.3, glazing: { bulkhead: 0.5, transom: 0.7, mullions: 2, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.3, kind: 'glass', recess: 0.6 }, interior: 'restaurant' }),
        { kind: 'entrance', u0: 5.65, u1: 6.85, door: { kind: 'solid', w: 1.0, recess: 0.15, h: 2.9, transom: 0.7, tint: '#6e2a26', mat: 'wood_painted' } },
      ], piers: { at: [{ u: 0.0, w: 0.95, proj: 0.12, mat: 'brownstone', tint: '#806452' }, { u: 6.95, w: 0.92, proj: 0.12, mat: 'brownstone', tint: '#806452' }] },
        wall: { mat: 'metal_painted', tint: '#6e2a26', to: 5.8 } },
      // openings measured on b62_s (the face 265 px over 7.87 m): a narrow stair window at u 0.8-1.3, windows at 1.9-3.0, 3.6-4.65, 5.2-6.25
      bays: { n: 3, margin: [1.6, 1.4] },
      floors: [{ n: 1, h: 3.6, win: 'T', open: [[0.8, 1.3, 'N'], [1.9, 3.0, 'T'], [3.6, 4.65, 'T'], [5.2, 6.25, 'T']] },
        { n: 1, h: 3.8, win: 'T3', open: [[0.8, 1.3, 'N'], [1.9, 3.0, 'T3'], [3.6, 4.65, 'T3'], [5.2, 6.25, 'T3']] }],
      windows: {
        T: win({ w: 1.05, h: 2.3, sill: 0.5, frame: 'wood_painted', lights: '1/1', reveal: 0.2, lintel: lintelOf('hood', '#806452', 0.28, 'brownstone'), sillStone: sillOf('#806452', 0.14, 0.06, 'brownstone'), ac: 0.05, blinds: 0.35 }),
        T3: win({ w: 1.05, h: 2.2, sill: 0.4, frame: 'wood_painted', lights: '1/1', reveal: 0.2, lintel: null, sillStone: sillOf('#806452', 0.14, 0.06, 'brownstone'), ac: 0.05, blinds: 0.35 }),
        N: win({ w: 0.45, h: 1.5, sill: 0.9, frame: 'wood_painted', lights: '1/1', reveal: 0.16, lintel: lintelOf('flat', '#806452', 0.2, 'brownstone'), sillStone: sillOf('#806452', 0.1, 0.05, 'brownstone'), ac: 0, blinds: 0.5 }),
      },
      rustication: { to: 5.8, mat: 'brownstone', tint: '#806452', joint: 0.5, block: 1.0, chamfer: 0.03, u0: 0, u1: 0.95 },
      bands: [{ at: 'base', h: 0.35, proj: 0.12, mat: 'brownstone', tint: '#806452' }, { at: 'floor:3', h: 0.22, proj: 0.06, mat: 'brownstone', tint: '#806452' }, { at: 12.55, h: 0.65, proj: 0.16, mat: 'brownstone', tint: '#7a5a4a' }],
      cornice: { kind: 'corbel' },
      parapet: { kind: 'gable', u0: 0.15, u1: 7.72, rise: 4.8, coping: 'brownstone', copingTint: '#6e5a4e' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'stone_lime' }, membrane: 'black' },
    refs: [], notes: 'Romanesque front re-measured on the levelled b62_s: 13.2 m to the gable foot, the gable to ~18 m; the gable window and finial are not drawn.',
  },
  {
    id: 'e125-122', addr: '122 E 125th St', name: 'Popeyes', bin: null,
    at: [2790.0, -2365.43], comp: '5_-5:29', h: 9.6, status: 'draft',
    // b63_s / b64_s (2026-08): two storeys of dark brown-red brick under a front wall to ~10.3 m (the compiled 8.93 m is the roof behind it).
    // Heights over the sidewalk measured on the LEVELLED b63_s through its ALT 2.3 camera (EAST 2026-10-02 02:45; the sidewalk taken 0.28 m
    // over the terrain datum, the compiled baseY): the lower awning 3.42-4.09 m, the lower wordmark 4.36-5.04, the upper glass 5.17-7.60,
    // the upper awning's foot 7.67, the pill 8.27-8.70, the upper wordmark 8.76-9.47. Red standing-seam awnings over the shop (the kit's) and over the upper glass (custom east:popeyes);
    // the white channel wordmarks on the brick and the red LOUISIANA KITCHEN pill with its white line (SIGNS' values, ar34-req/EAST.md
    // 00:51-01:18, the heights re-measured); a round blade sign at the east corner and promotion posters in the windows (custom, invented).
    wall: { mat: 'brick_red', tint: '#564139', dirt: 0.45 },
    custom: { fn: 'east:popeyes', with: 'kit' },
    awnings: [{ u0: 0.3, u1: 7.6, y: 7.67, drop: 0.6, proj: 1.0, color: '#b8262b' }],
    posters: [{ u: 1.8, y: 1.45, w: 0.87, h: 1.2 }, { u: 2.77, y: 1.45, w: 0.87, h: 1.2 }, { u: 5.7, y: 1.45, w: 0.87, h: 1.2 }, { u: 6.64, y: 1.45, w: 0.85, h: 1.2 },
      { u: 4.9, y: 5.45, w: 0.85, h: 1.1, upper: true }],
    roundel: { u: 0.18, y: 5.4, d: 1.05, proj: 0.25 },
    // the east side wall over the lot: grey concrete block
    sideWall: { mat: 'concrete_precast', tint: '#9c978d' },
    faces: [{
      edge: 'front',
      base: { h: 5.05, bays: [
        shop(0.4, 7.5, { name: 'Popeyes', h: 3.65, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.8 }, interior: 'fastfood',
          awning: { kind: 'fixed', color: '#b31e22', drop: 0.3, proj: 1.0, top: 4.12 },
          sign: { kind: 'channel', text: 'POPeYeS', runs: POP_RUNS, font: 'Baloo2-800', bold: 0.015, fg: '#fbfbf8', ret: '#cfcfca', bg: null, u0: 2.15, u1: 5.9, y: 4.33, h: 0.72, fill: 0.9, depth: 0.08, lit: 'face' } }),
      ] },
      bays: { n: 1, margin: [0.4, 0.4] },
      floors: [{ n: 1, h: 3.4, win: 'C' }],
      windows: { C: { w: 7.0, h: 2.43, sill: 0.12, kind: 'ribbon', mullions: 2, frame: 'alu_black', glass: 'glass_grey', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.2, lit: 0.4 } },
      items: [
        { k: 'sign', sign: { kind: 'channel', text: 'POPeYeS', runs: POP_RUNS, font: 'Baloo2-800', bold: 0.015, fg: '#fbfbf8', ret: '#cfcfca', bg: null, u0: 2.2, u1: 5.8, y: 8.76, h: 0.72, fill: 0.9, depth: 0.08, lit: 'face' } },
        { k: 'sign', sign: { kind: 'lightbox', shape: 'pill', text: 'LOUISIANA KITCHEN', font: 'RobotoSlab-700', fg: '#ffffff', bg: '#c8102e', frame: '#c8102e', inline: '#ffffff', u0: 2.25, u1: 5.7, y: 8.3, h: 0.36, depth: 0.06, fill: 0.56, tracking: 0.1 } },
      ],
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.7, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Popeyes: both wordmarks are white channel letters on the brick (SIGNS); the upper awning, the posters and the corner roundel are east:popeyes.',
  },

  // ------------------------------------------------------------------ Lexington to Third, north side
  {
    id: 'e125-159', addr: '159 E 125th St', name: 'CityMD, Bank of America, glass podium', bin: null,
    at: [2925.37, -2362.78], comp: '5_-5:106', h: 14.6, status: 'draft',
    // b25 (2001): an 82 m three-storey podium of grey aluminium panel and ribbon glass; the dark tower stands on its east half (custom east:podiumTower)
    wall: { mat: 'panel_alu', tint: '#7f8689', dirt: 0.35 },
    custom: { fn: 'east:podiumTower', with: 'kit' },
    tower: { u0: 28, u1: 70, w0: -8, w1: -36, h: 36.0, floors: 11, tint: '#2b3034' },
    faces: [{
      edge: 'front',
      base: { h: 5.2, fascia: { h: 1.1, mat: 'panel_alu', tint: '#c9cccd', u0: 0, u1: 51 }, bays: [
        shop(2.0, 16.0, { name: 'CityMD Urgent Care', h: 4.1, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 5, frame: 'alu_clear' }, door: { u: 0.45, w: 1.0, recess: 0.6 }, interior: 'pharmacy',
          sign: signOf('CityMD', '#e2231a', null, 2.0, 16.0, 4.15, 0.75, { kind: 'channel' }) }),
        shop(30.0, 50.0, { name: 'Bank of America', h: 4.1, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 7, frame: 'alu_clear' }, door: { u: 0.5, w: 1.1, kind: 'double', recess: 0.8 }, interior: 'bank',
          sign: signOf('Bank of America', '#0a3a7e', null, 30.0, 50.0, 4.15, 0.75, { kind: 'channel' }) }),
        { kind: 'entrance', u0: 54.0, u1: 60.0, door: { kind: 'double', w: 1.2, recess: 0.8, h: 2.6, transom: 1.0, frame: 'alu_clear' } },
        shop(62.0, 80.0, { h: 4.3, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 7, frame: 'alu_clear' }, door: { u: 0.3, w: 1.0, recess: 0.5 }, interior: 'empty' }),
      ] },
      bays: { n: 16, margin: [1.0, 1.0] },
      floors: [{ n: 1, h: 4.6, win: 'R' }, { n: 1, h: 3.8, win: 'R2' }],
      windows: {
        R: { w: 4.4, h: 2.1, sill: 0.9, kind: 'ribbon', mullions: 3, frame: 'alu_clear', glass: 'glass_blue', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.5, lit: 0.4 },
        R2: { w: 4.4, h: 1.5, sill: 1.1, kind: 'ribbon', mullions: 3, frame: 'alu_clear', glass: 'glass_blue', reveal: 0.1, lintel: null, sillStone: null, ac: 0, blinds: 0.4, lit: 0.4 },
      },
      bands: [{ at: 'floor:3', h: 0.25, proj: 0.08, mat: 'alu_clear' }],
      // b25_s (2026-08): over the shops the podium is glass, a continuous curtain of grey-blue panes in alu mullions on both upper floors
      // upper / lower ribbon): vision glass, a light grey-blue (glass_vision_blue's transmission 0.5, a tint a little bluer than its own)
      curtain: { u0: 0.6, u1: 81.4, y0: 6.4, y1: 13.9, mullion: 1.5, transom: 'floor', frame: 'alu_clear', glass: 'glass_vision_blue', glassTint: '#a4bccf', spandrel: 'panel_alu', spandrelH: 0.7, lit: 0.4, blinds: 0.45 },
      cornice: { kind: 'band', h: 0.9, proj: 0.3, mat: 'panel_alu', tint: '#b2b7ba' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'gravel', items: [{ k: 'hvac', at: [0.15, 0.5], n: 2 }, { k: 'hvac', at: [0.9, 0.5], n: 2 }] },
    refs: [], notes: 'Podium only is spec\'d; the 36 m dark tower is a custom box on its east half (window rhythm estimated). The sidewalk planters are PROPS\'s.',
  },
  {
    id: 'e125-2306', addr: '2306 Third Ave (175 E 125th St)', name: 'The Salvation Army Manhattan Citadel', bin: null,
    at: [2987.1, -2347.73], comp: '5_-5:156', h: 44.2, status: 'draft',
    // b26 (2017): dark-red brick with paired windows, a glass curtain wall over the east half of the base, a steel entrance canopy
    wall: { mat: 'brick_red', tint: '#77584c', dirt: 0.4 },
    faces: [{
      edge: [2975.72, -2311.53, 2952.56, -2324.4],
      base: { h: 5.2, bays: [
        { kind: 'entrance', u0: 4.2, u1: 8.2, door: { kind: 'double', w: 1.2, recess: 0.8, h: 2.7, transom: 1.0, frame: 'alu_bronze' },
          sign: { kind: 'panel', text: 'THE SALVATION ARMY', font: 'Inter-700', fg: '#d8dcdc', bg: '#3a3d3f', u0: 3.0, u1: 12.6, y: 4.1, h: 0.75, fill: 0.5, sub: { text: 'MANHATTAN CITADEL', size: 0.6 } } },
        { kind: 'entrance', u0: 9.6, u1: 13.4, door: { kind: 'double', w: 1.1, recess: 0.7, h: 2.7, transom: 1.0, frame: 'alu_bronze' } },
        shop(16.2, 26.4, { kind: 'window', h: 4.7, glazing: { bulkhead: 0.3, transom: 1.2, mullions: 8, frame: 'alu_bronze' }, door: null, interior: 'empty' }),
      ] },
      bays: { widths: [1.0, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.7] },
      floors: [{ n: 9, h: 3.5, win: 'P' }, { n: 2, h: 3.45, win: 'P' }],
      curtain: { u0: 15.6, u1: 26.5, y0: 5.2, y1: 12.2, mullion: 1.3, transom: 'floor', frame: 'alu_dark', glass: 'glass_grey', spandrel: 'glass_grey', lit: 0.4, blinds: 0.3 },
      windows: { P: win({ w: 1.8, h: 1.75, sill: 0.95, kind: 'casement', frame: 'alu_bronze', reveal: 0.14, lintel: lintelOf('flat', '#9d5a48', 0.18, 'brick_red'), sillStone: sillOf('#b8ab94', 0.08, 0.04), ac: 0.25 }) },
      bands: [{ at: 'base', h: 0.3, proj: 0.08, mat: 'stone_lime', tint: '#b8ab94' }],
      cornice: { kind: 'band', h: 0.8, proj: 0.3, mat: 'brick_red', tint: '#725447' },
    }],
    // (AR34 w2 b3, QA 03:17) the footprint is a C open on the west at mid-depth: [0.4, 0.5] fell in the gap ('does not fit inside the
    // footprint, left out' in QA's w2r2 pages); the bulkhead now on the front bar (its position is not measured)
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.75, 0.15], w: 5.0, d: 3.5, h: 3.4 }] },
    refs: [], notes: 'Front is the 26.5 m edge; the 11.3 m inner wall and the Third Avenue face are plain. The curtain wall over the east bays (floors 2-3) is drawn as bronze-framed casements for now.',
  },
  {
    id: 'e125-201', addr: '201 E 125th St (Third Ave corner)', name: 'Food Bazaar, Teriyaki Madness, Phenix Salon Suites', bin: null,
    at: [3043.01, -2308.15], comp: '5_-5:134', h: 64.01, status: 'draft',
    // b27 (2019): 19 floors of long-format grey-brown brick, a glazed retail base, bronze-framed windows
    wall: { mat: 'brick_brown', tint: '#8c7764', dirt: 0.35, bond: 'running' },
    faces: [{
      edge: 'front',
      base: { h: 5.4, bays: [
        shop(0.5, 17.0, { name: 'Food Bazaar Supermarket', h: 4.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 7, frame: 'alu_black' }, door: { u: 0.85, w: 1.2, kind: 'double', recess: 0.6 }, interior: 'shop_food',
          sign: { kind: 'lightbox', text: 'FOOD BAZAAR SUPERMARKET', font: 'Inter-700', fg: '#ffffff', bg: '#c4232a', u0: 1.0, u1: 11.0, y: 4.65, h: 0.7, fill: 0.5 } }),
        shop(18.0, 30.0, { name: 'Teriyaki Madness', h: 4.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.12, w: 1.0, recess: 0.6 }, interior: 'restaurant',
          sign: { kind: 'channel', text: 'TERIYAKI MADNESS', font: 'Anton', fg: '#d3202a', bg: null, u0: 20.0, u1: 26.0, y: 4.75, h: 0.55, fill: 0.7 } }),
        shop(31.5, 38.5, { name: 'Lashes boutique', h: 4.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.6 }, interior: 'shop_clothing' }),
        shop(39.5, 52.0, { name: 'Phenix Salon Suites', h: 4.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.8, w: 1.0, recess: 0.6 }, interior: 'shop_clothing',
          sign: { kind: 'channel', text: 'Phenix Salon Suites', font: 'Inter-700', fg: '#3a3a3a', bg: null, u0: 41.0, u1: 51.0, y: 4.7, h: 0.6, fill: 0.7, italic: true } }),
      ] },
      bays: { n: 13, margin: [0.8, 0.8] },
      floors: [{ n: 1, h: 4.3, win: 'W' }, { n: 4, h: 3.2, win: 'B' }, { n: 13, h: 3.13, win: 'B' }],
      windows: {
        W: { w: 3.3, h: 2.9, sill: 0.6, kind: 'ribbon', mullions: 2, frame: 'alu_black', glass: 'glass_clear', reveal: 0.12, lintel: null, sillStone: null, ac: 0, blinds: 0.3, lit: 0.5 },
        B: win({ w: 1.75, h: 1.75, sill: 0.85, kind: 'casement', frame: 'alu_black', reveal: 0.14, lintel: lintelOf('flat', '#8a7462', 0.16, 'brick_brown'), sillStone: sillOf('#7d6b5b', 0.08, 0.04, 'concrete_precast'), ac: 0.1, blinds: 0.6 }),
      },
      bands: [{ at: 'base', h: 0.4, proj: 0.1, mat: 'brick_brown', tint: '#7d6a59' }, { at: 'floor:6', h: 0.35, proj: 0.08, mat: 'brick_brown', tint: '#7d6a59' }],
      cornice: { kind: 'band', h: 1.0, proj: 0.3, mat: 'metal_painted', tint: '#3a3430' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.0, coping: 'metal' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.35, 0.5], w: 6.0, d: 4.0, h: 4.0 }, { k: 'hvac', at: [0.75, 0.5], n: 3 }] },
    refs: [], notes: 'Six-storey podium with a glazed retail floor, then the tower; the real tower is narrower than the compiled ring (setbacks above floor 7 not modelled).',
  },

  // ------------------------------------------------------------------ Lexington to Second, south side
  {
    id: 'e125-lot-lexSW', addr: 'Lexington Ave SW corner lot (construction site)', name: 'vacant lot behind a hoarding', bin: null,
    at: [2803.18, -2355.08], comp: '5_-5:185', h: 2.7, status: 'draft', custom: 'east:hoarding', site: { kind: 'hoarding', h: 2.7, inset: -1.8, returns: 'u1', ext1: 0.8, murals: { plan: LEX_SW_RUN, off: 11.1 } },
    refs: [], notes: 'The compiled 5-storey tenement no longer stands (2026-08: painted plywood hoarding, the backs of 124th Street behind). Murals invented in the real panels\' kinds, order and palette (LEX_SW_RUN).',
  },
  {
    id: 'e125-lot-lexSW2', addr: 'Lexington Ave SW corner lot (east part)', name: 'vacant lot behind a hoarding', bin: null,
    at: [2817.97, -2344.38], comp: '5_-5:188', h: 2.7, status: 'draft', custom: 'east:hoarding', site: { kind: 'hoarding', h: 2.7, inset: -1.8, returns: 'u0', murals: { plan: LEX_SW_RUN, off: 0 }, barricades: [[2.85, 4.95]] },
    refs: [], notes: 'Same site as the lot west of it: the pink leaf panel at the corner, the green tagged sheet with a steel barrier before it, the doodle wall.',
  },
  {
    id: 'e125-lot-parkSW', addr: 'Park Ave SW corner lot (construction site)', name: 'mesh fence', bin: null,
    at: [2694.77, -2408.14], comp: '5_-5:126', h: 2.4, status: 'draft', custom: 'east:hoarding', site: { kind: 'mesh', h: 2.4, inset: 0.3 },
    refs: [], notes: 'Black mesh fence and a crane in 2026-08 (BLASTING ZONE sign); the crane is not drawn.',
  },
  {
    id: 'e125-2282', addr: '2282 Third Ave', name: 'building under scaffold', bin: null,
    at: [2922.83, -2246.22], comp: '5_-5:112', h: 8.45, status: 'draft',
    // (AR34 w2 b3 sessions 2-3, QA Q02 / Q59) this spec also hosts the block under construction on 125th, Lexington to Third, its shed,
    // bridge, yard and plant (no compiled footprint; fk/custom/east.js siteBlock). The frame: s along 125th from o (east), t south of it.
    // MEASURED: the screen's top 32.9 m over the road; the shed's kerb-side posts and plank
    // hoarding 1.3 m in from the kerb, the deck ~3.4 m and its railing 1.07 m over the road; the bridge's deck ~5.9-6.15 m, its railing to
    // ~7.3 m (e2676); the west face, the gate and the bridge's ends from e2676 / 2694 / e2658; the Third Avenue face's south end from Zv58vM 2784 (t ~48 +-5 m: put at 2282 Third's north
    // wall, t 43.3); the 125th wing's depth (d1) from e2658 (~19-22 m). NOT MEASURED: the Third Avenue wing's width (wing[0]), the storey
    // heights (ten storeys between the base and the roof), the bridge's depth, the plant's sizes. The south building line (lot) and the
    // kerb are the compiled ground's; Third Avenue's building line (e) and kerb (outE + 1.3) too.
    custom: { fn: 'east:siteBlock', with: 'kit' },
    siteBlock: { o: [2901.04, -2318.6], dir: [0.87395, 0.48601], lot: -1.25, kerb: -6.0, w: -4.5, e: 69.25, d1: 19.0, wing: [45.25, 43.3],
      roof: 29.9, screen: 3, base: 4.4, deck: 3.45, out: -4.7, outE: 73.2, bridge: [-13.9, -4.4, 2.3], bridgeY: [5.85, 6.15], gate: [-11.3, -7.5],
      yard: [-59.75, 43.3], murals: YARD_RUN, muralSeed: 4125, cores: [[6.0, 0, 'n'], [48.6, 0, 'n'], [0, 3.0, 'e']],
      excavator: [-22.5, 8.8, 0], truck: [-9.5, 4.5, -2.74], crane: [-32.3, 27.4, 2.69, 40, 1.05] },
    // b66: a two-storey building wrapped in scaffolding with a sidewalk shed in 2026-08 (green plywood shed, CORE scaffold sign)
    wall: { mat: 'brick_tan', tint: '#8f8474', dirt: 0.5 },
    faces: [{ edge: [2913.98, -2261.79, 2940.69, -2247], base: { h: 4.4, bays: [shop(1.0, 28.0, { kind: 'window', h: 3.4, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 8, frame: 'alu_black' }, door: null, interior: 'empty' })] },
      bays: { n: 7, margin: [1.0, 1.0] }, floors: [{ n: 1, h: 3.6, win: 'A' }],
      windows: { A: win({ w: 2.0, h: 1.7, sill: 1.0, kind: 'fixed', frame: 'alu_black', reveal: 0.12, lintel: lintelOf('flat', '#8f8474', 0.2, 'concrete_precast'), sillStone: null, ac: 0 }) },
      cornice: { kind: 'band', h: 0.5, proj: 0.2, mat: 'concrete_precast', tint: '#9a9488' } }],
    roof: { kind: 'flat', parapet: { h: 0.45, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Scaffold and the green sidewalk shed are not drawn yet (custom item). The building behind is 1973, brick.',
  },
  {
    id: 'e125-2293', addr: '2293 Third Ave', name: 'Hassy Juice & Deli, Burger King', bin: null,
    at: [2994.21, -2259.78], comp: '5_-5:51', h: 27.87, status: 'draft',
    // b67 (2010): eight storeys of red and tan brick panels, paired windows; Hassy Juice & Deli, Burger King with a bus shelter
    wall: { mat: 'brick_red', tint: '#906854', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.5, bays: [
        shop(0.6, 9.0, { kind: 'window', h: 3.4, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_bronze' }, door: null, interior: 'empty' }),
        shop(14.5, 21.5, { name: 'Hassy Juice & Deli', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.12, w: 1.0, recess: 0.6 }, interior: 'shop_food', awning: { kind: 'fixed', color: '#8cc63f', drop: 0.4, proj: 1.3 },
          sign: signOf('HASSY JUICE & DELI', '#ffffff', '#2d8a3a', 14.5, 21.5, 3.75, 0.6) }),
        shop(21.8, 25.8, { name: 'Burger King', h: 3.6, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.6 }, interior: 'restaurant',
          sign: signOf('BURGER KING', '#f5ebdc', '#d6451f', 21.8, 25.8, 3.75, 0.6, { font: 'Oswald-600' }) }),
        shop(26.5, 37.0, { kind: 'window', h: 3.4, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: null, interior: 'empty' }),
      ] },
      bays: { n: 12, margin: [1.0, 1.0] },
      floors: [{ n: 7, h: 3.3, win: 'B' }],
      windows: { B: win({ w: 1.3, h: 1.5, sill: 0.95, frame: 'alu_white', lights: '1/1', reveal: 0.14, lintel: lintelOf('flat', '#8a3f2e', 0.14, 'brick_red'), sillStone: sillOf('#b9ac95', 0.08, 0.04), ac: 0.35 }) },
      bands: [{ at: 'base', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#b9ac95' }],
      cornice: { kind: 'band', h: 0.6, proj: 0.2, mat: 'brick_red', tint: '#7e5a49' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'metal' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.5, 0.5], w: 4.0, d: 3.0, h: 3.0 }] },
    refs: [], notes: 'The tan brick wings (outer bays) are the same red here; the bus shelter at the curb is PROPS\'s.',
  },
  {
    id: 'e125-216', addr: '214-216 E 125th St', name: 'white-panel residential building', bin: null,
    at: [3022.21, -2240.7], comp: '5_-5:183', also: [[3032.39, -2235.05]],
    ring: [[3014.92, -2235.58], [3022.71, -2249.61], [3043.06, -2238.29], [3035.28, -2224.25], [3021.72, -2231.8]],
    h: 36.5, status: 'draft',
    // b68 + b69 (one building in reality): ten storeys of white panel with dark-grey framed window groups over a dark granite base
    wall: { mat: 'stucco', tint: '#e6e4dc', dirt: 0.3 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        shop(0.6, 9.0, { kind: 'window', h: 3.6, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 4, frame: 'alu_black' }, door: null, interior: 'empty' }),
        { kind: 'entrance', u0: 10.2, u1: 13.2, door: { kind: 'glass', w: 1.3, recess: 0.6, h: 2.6, transom: 0.9, frame: 'alu_black' } },
        shop(14.5, 22.4, { kind: 'window', h: 3.6, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 4, frame: 'alu_black' }, door: null, interior: 'empty' }),
      ] },
      bays: { n: 6, margin: [0.8, 0.8] },
      floors: [{ n: 9, h: 3.53, win: 'D' }],
      windows: { D: win({ w: 2.3, h: 2.3, sill: 0.55, kind: 'casement', frame: 'alu_black', reveal: 0.2, lintel: null, sillStone: null,
        surround: { mat: 'metal_painted', tint: '#3a3c3f', w: 0.22, proj: 0.07 }, ac: 0.05, blinds: 0.6 }) },
      rustication: { to: 4.6, mat: 'granite_black', tint: '#2f3033', joint: 0.6, block: 1.3, chamfer: 0.01 },
      bands: [{ at: 'base', h: 0.3, proj: 0.1, mat: 'metal_painted', tint: '#2f3033' }],
      cornice: { kind: 'band', h: 0.7, proj: 0.25, mat: 'metal_painted', tint: '#3a3c3f' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.0, coping: 'metal' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.3, 0.5], w: 4.0, d: 3.0, h: 3.0 }] },
    refs: [], notes: 'Compiled as two footprints (b68 7.8 m, b69 15.5 m); one ring here. The real tower steps (taller at the west end).',
  },
  tenement({
    id: 'e125-218', addr: '218 E 125th St', name: 'nail salon', at: [3042.53, -2230.26], comp: '5_-5:90', h: 15.0, n: 3, w: 7.96, baseH: 4.6,
    tint: '#7f5d4d', trim: '#7d3c30', trimMat: 'brownstone', cornTint: '#6a3a2e', fe: [1], bays: 3, lintel: 'hood',
    shopName: 'Nail Spa', signBg: '#d0428f', refs: [], notes: 'Narrow red-brick tenement with a pink shopfront.',
  }),
  {
    id: 'e125-220', addr: '220 E 125th St', name: 'loft building with arched windows (Energy)', bin: null,
    at: [3048.74, -2218.39], comp: '5_-5:46', h: 22.6, status: 'draft',
    // b71 (1910): six storeys of ochre pressed brick, round-arched windows on floors 2-3, a corbelled cornice
    wall: { mat: 'brick_buff', tint: '#b59870', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 5.2, bays: [
        shop(1.2, 13.2, { name: 'shop', h: 4.0, glazing: { bulkhead: 0.4, transom: 0.6, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.0, recess: 0.7 }, interior: 'shop_food',
          sign: signOf('ENERGY', '#6b2a24', '#d8c9a4', 4.5, 9.0, 4.15, 0.6, { kind: 'panel' }) }),
      ] },
      bays: { n: 5, margin: [1.0, 1.0] },
      floors: [{ n: 2, h: 3.9, win: 'Ar' }, { n: 2, h: 3.4, win: 'S' }, { n: 1, h: 2.8, win: 'T' }],
      windows: {
        Ar: win({ w: 1.6, h: 3.1, sill: 0.4, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.18, lintel: lintelOf('keystone', '#8a4a38', 0.28, 'brownstone'), sillStone: sillOf('#8a4a38', 0.12, 0.05, 'brownstone'), ac: 0.1 }),
        S: win({ w: 1.25, h: 1.9, sill: 0.8, frame: 'alu_black', lights: '1/1', reveal: 0.15, lintel: lintelOf('flat', '#8a4a38', 0.22, 'brownstone'), sillStone: sillOf('#8a4a38', 0.1, 0.05, 'brownstone'), ac: 0.15 }),
        T: win({ w: 1.2, h: 1.45, sill: 0.7, frame: 'alu_black', lights: '1/1', reveal: 0.15, lintel: lintelOf('flat', '#8a4a38', 0.2, 'brownstone'), sillStone: sillOf('#8a4a38', 0.1, 0.05, 'brownstone'), ac: 0.05 }),
      },
      rustication: { to: 5.2, mat: 'brownstone', tint: '#8a4a3c', joint: 0.6, block: 1.2, chamfer: 0.014 },
      bands: [{ at: 'base', h: 0.45, proj: 0.14, mat: 'brownstone', tint: '#8a4a3c' }, { at: 'floor:4', h: 0.4, proj: 0.12, mat: 'brownstone', tint: '#8a4a3c' }, { at: 'floor:6', h: 0.35, proj: 0.1, mat: 'brownstone', tint: '#8a4a3c' }],
      cornice: { kind: 'modillion', h: 1.6, proj: 0.9, mat: 'brownstone', tint: '#8a4a3c' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'stone_lime' }, membrane: 'black' },
    refs: [], notes: 'Ochre loft building between the library and a red-brick tenement: brownstone-red pilasters at the base, large arches on floors 2-3 (double arches per bay not modelled).',
  },
  {
    id: 'e125-226', addr: '226 E 125th St', name: 'Harlem Library (NYPL, 1904, individual landmark)', bin: null,
    at: [3063.69, -2214.49], comp: '5_-5:125', h: 14.8, status: 'draft',
    // b72: Carnegie library, Italian Renaissance: grey-beige limestone, rusticated base, three arched windows on the piano nobile, a dentil cornice
    wall: { mat: 'stone_lime', tint: '#c7bca6', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        { kind: 'entrance', u0: 1.2, u1: 4.6, door: { kind: 'double', w: 1.2, recess: 0.6, h: 2.6, transom: 1.3, frame: 'alu_bronze', tint: '#3d342c' } },
        { kind: 'window', u0: 6.2, u1: 9.6, h: 3.4, glazing: { bulkhead: 0.9, transom: 0.0, mullions: 2, frame: 'alu_bronze' }, door: null, interior: 'empty' },
        { kind: 'window', u0: 11.0, u1: 14.4, h: 3.4, glazing: { bulkhead: 0.9, transom: 0.0, mullions: 2, frame: 'alu_bronze' }, door: null, interior: 'empty' },
      ] },
      bays: { n: 3, margin: [0.9, 0.9] },
      floors: [{ n: 1, h: 6.2, win: 'Ar' }, { n: 1, h: 2.6, win: 'T' }],
      windows: {
        Ar: win({ w: 1.9, h: 4.6, sill: 0.6, kind: 'arch', frame: 'alu_white', lights: '6/6', reveal: 0.25, lintel: lintelOf('keystone', '#c9bfaa', 0.3), sillStone: sillOf('#c9bfaa', 0.14, 0.08), ac: 0, blinds: 0.15 }),
        T: win({ w: 0.9, h: 0.8, sill: 1.0, kind: 'fixed', frame: 'alu_white', reveal: 0.15, lintel: lintelOf('flat', '#c9bfaa', 0.16), sillStone: sillOf('#c9bfaa', 0.08, 0.04), ac: 0 }),
      },
      rustication: { to: 4.6, mat: 'stone_lime_rusticated', tint: '#c3b8a1', joint: 0.55, block: 1.4, chamfer: 0.02 },
      bands: [{ at: 'base', h: 0.5, proj: 0.16, mat: 'stone_lime', tint: '#c9bfaa' }],
      cornice: { kind: 'dentil', h: 1.5, proj: 0.85, mat: 'stone_lime', tint: '#cbc1ac' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'stone_lime' }, membrane: 'black' },
    refs: [], notes: 'NYPL 125th Street branch. Access ramp with railings at the ground (not drawn).',
  },
  {
    id: 'e125-scientology', addr: '228-236 E 125th St', name: 'Church of Scientology Harlem Community Center', bin: null,
    at: [3073.9, -2207.96], comp: '6_-5:47', also: [[3079.02, -2201.51], [3085.77, -2198.11]],
    ring: [[3061.96, -2194.25], [3065.0, -2199.75], [3076.16, -2219.87], [3095.99, -2208.83], [3083.42, -2186.14], [3082.09, -2183.74]],
    h: 22.0, status: 'draft',
    // b73 + b74 + b75 (one building in reality): buff brick, a limestone plinth, a three-door portal, two bronze sign panels
    wall: { mat: 'brick_buff', tint: '#d8a56b', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: { h: 5.4, bays: [
        { kind: 'window', u0: 2.8, u1: 4.6, h: 3.4, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 0, frame: 'alu_bronze' }, door: null, interior: 'empty' },
        { kind: 'window', u0: 5.8, u1: 7.6, h: 3.4, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 0, frame: 'alu_bronze' }, door: null, interior: 'empty' },
        { kind: 'entrance', u0: 11.0, u1: 19.8, door: { kind: 'double', w: 1.3, recess: 0.9, h: 2.8, transom: 1.6, frame: 'alu_bronze' } },
      ] },
      bays: { n: 6, margin: [1.0, 1.0] },
      floors: [{ n: 4, h: 3.97, win: 'C' }],
      windows: { C: win({ w: 1.4, h: 2.3, sill: 0.8, frame: 'alu_bronze', lights: '1/1', reveal: 0.16, lintel: lintelOf('flat', '#c7b594', 0.16), sillStone: sillOf('#c7b594', 0.1, 0.05), ac: 0.05, blinds: 0.6 }) },
      rustication: { to: 0.9, mat: 'stone_lime', tint: '#cfc6b1', joint: 0.9, block: 1.4, chamfer: 0.01 },
      bands: [{ at: 'base', h: 0.35, proj: 0.12, mat: 'stone_lime', tint: '#cfc6b1' }],
      cornice: { kind: 'band', h: 0.6, proj: 0.2, mat: 'stone_lime', tint: '#cfc6b1' },
      items: [
        { k: 'plaque', u: 3.0, y: 5.6, w: 15.5, h: 0.85, mat: 'metal_painted', tint: '#5a2a26' },
        { k: 'plaque', u: 9.0, y: 14.6, w: 9.0, h: 2.4, mat: 'metal_painted', tint: '#4a3b2f' },
      ],
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'stone_lime' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.5, 0.5], w: 4.0, d: 3.0, h: 3.0 }] },
    refs: [], notes: 'Compiled as three 7.6 m tenement footprints (3-4 floors); the real building is one ~22 m block (estimated 5 floors). Sign panels are plaque boxes until the sign kit letters them.',
  },
  {
    id: 'e125-246', addr: '246 E 125th St', name: 'Harlem Gourmet Market, Healthy Hair Beauty Salon', bin: null,
    at: [3103.19, -2192.87], comp: '6_-5:45', h: 7.9, status: 'draft',
    // b76: a weathered two-storey cream-painted brick front with a corbelled frieze and red-brown paint patches
    wall: { mat: 'brick_buff', tint: '#c9b8a0', dirt: 0.75 },
    faces: [{
      edge: 'front',
      base: { h: 4.0, bays: [
        shop(0.4, 5.8, { name: 'Healthy Hair Beauty Salon', h: 3.1, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.2, w: 0.95, recess: 0.4 }, interior: 'shop_clothing',
          sign: signOf('HEALTHY HAIR BEAUTY SALON', '#b0636b', '#f0dcd4', 0.4, 5.8, 3.2, 0.6) }),
        shop(6.4, 12.0, { name: 'Harlem Gourmet Market', h: 3.1, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, recess: 0.4 }, interior: 'shop_food',
          sign: signOf('Harlem GOURMET MARKET', '#ffffff', '#1b1b1d', 6.4, 12.0, 3.2, 0.7) }),
        shop(12.6, 18.8, { name: 'vacant shop', h: 3.1, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 0, frame: 'alu_black' }, door: null, gate: gateBox('#a4a7a9', 0.95), interior: 'empty' }),
        { kind: 'entrance', u0: 19.4, u1: 21.4, door: { kind: 'solid', w: 1.0, recess: 0.3, tint: '#2e2a26' } },
        shop(22.4, 28.4, { name: 'shop', h: 3.1, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.4 }, interior: 'shop_food' }),
      ] },
      bays: { n: 9, margin: [1.0, 1.0] },
      floors: [{ n: 1, h: 3.4, win: 'A' }],
      windows: { A: win({ w: 0.95, h: 1.7, sill: 0.8, frame: 'alu_black', lights: '1/1', reveal: 0.14, lintel: lintelOf('flat', '#7a6a58', 0.2, 'concrete_precast'), sillStone: sillOf('#b4a894', 0.08, 0.04), ac: 0.25 }) },
      cornice: { kind: 'dentil', h: 0.7, proj: 0.3, mat: 'brick_buff', tint: '#bcae96' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Two-storey weathered brick front with a patterned brick frieze; five shops (two vacant) along 29 m.',
  },
  tenement({
    id: 'e125-254', addr: '254 E 125th St', name: 'Melcover Wine & Spirit', at: [3119.34, -2182.49], comp: '6_-5:1', h: 17.27, n: 4, w: 9.28, baseH: 4.2,
    tint: '#8b6552', trim: '#5e3a30', trimMat: 'brownstone', fe: [1], bays: 3, door: 1.6, shopName: 'Melcover Wine & Spirit', signBg: '#f0c419', signFg: '#2a1a0c', refs: [],
  }),
  tenement({
    id: 'e125-256', addr: '256 E 125th St', name: 'Pizza', at: [3127.36, -2178.51], comp: '6_-5:29', h: 17.82, n: 4, w: 8.17, baseH: 4.2,
    tint: '#886252', trim: '#5e3a30', trimMat: 'brownstone', fe: [1], bays: 3, shopName: 'PIZZA', signBg: '#f3efe4', signFg: '#b2311f', refs: [],
  }),
  tenement({
    id: 'e125-258', addr: '258 E 125th St', name: null, at: [3134.46, -2174.5], comp: '6_-5:6', h: 17.72, n: 4, w: 8.35, baseH: 4.4,
    tint: '#8b6654', trim: '#5e3a30', trimMat: 'brownstone', fe: [1], bays: 3, shopName: 'shop', refs: [],
  }),
  {
    id: 'e125-260', addr: '260 E 125th St (Second Ave corner)', name: 'Fresh Food Inc', bin: null,
    at: [3141.33, -2169.86], comp: '6_-5:32', h: 17.7, status: 'draft',
    // b80 (1930): five storeys of red brick with cream painted stone banding and white-framed windows at the Second Avenue corner
    wall: { mat: 'brick_red', tint: '#8c6352', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, bays: [
        shop(0.3, 6.2, { name: 'Fresh Food Inc', h: 3.35, glazing: { bulkhead: 0.45, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.25, w: 0.95, recess: 0.4 }, interior: 'shop_food',
          sign: signOf('Fresh Food Inc', '#ffffff', '#161616', 0.3, 6.2, 3.4, 0.75, { font: 'Oswald-600' }) }),
        { kind: 'entrance', u0: 6.6, u1: 7.9, door: { kind: 'solid', w: 0.95, recess: 0.3, tint: '#2e2b29' } },
      ] },
      bays: { n: 3, margin: [0.6, 0.6] },
      floors: [{ n: 4, h: 3.15, win: 'W' }],
      windows: { W: win({ w: 1.0, h: 1.9, sill: 0.75, frame: 'alu_white', reveal: 0.14, lintel: lintelOf('hood', '#e8e3d6', 0.24), sillStone: sillOf('#e8e3d6', 0.1, 0.05), surround: { mat: 'stone_lime', tint: '#e8e3d6', w: 0.12, proj: 0.03 }, ac: 0.35 }) },
      bands: [{ at: 'base', h: 0.35, proj: 0.08, mat: 'stone_lime', tint: '#e0dacb' }, { at: 'floor:3', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#e0dacb' }, { at: 'floor:5', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#e0dacb' }],
      cornice: { kind: 'bracketed', h: 1.3, proj: 0.6, mat: 'metal_painted', tint: '#6a4a3a', brackets: 6 },
      fireEscape: { bays: [0, 1], floors: [1, 4], kind: 'balcony', drop: true, tint: '#26282a' },
    }, {
      edge: 'corner',
      base: { h: 4.2, bays: [shop(1.0, 10.0, { name: 'deli', h: 3.35, glazing: { bulkhead: 0.45, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: null, interior: 'shop_food' })] },
      bays: { n: 6, margin: [0.8, 0.8] },
      floors: [{ n: 4, h: 3.15, win: 'W' }],
      windows: { W: win({ w: 1.0, h: 1.9, sill: 0.75, frame: 'alu_white', reveal: 0.14, lintel: lintelOf('hood', '#e8e3d6', 0.24), sillStone: sillOf('#e8e3d6', 0.1, 0.05), surround: { mat: 'stone_lime', tint: '#e8e3d6', w: 0.12, proj: 0.03 }, ac: 0.35 }) },
      bands: [{ at: 'base', h: 0.35, proj: 0.08, mat: 'stone_lime', tint: '#e0dacb' }],
      cornice: { kind: 'bracketed', h: 1.3, proj: 0.6, mat: 'metal_painted', tint: '#6a4a3a', brackets: 8 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Corner tenement at Second Avenue: cream stone banding and hooded, white-framed windows; deli at the ground floor.',
  },

  // ------------------------------------------------------------------ Park Avenue, north-west corner
  {
    id: 'e125-81', addr: '81 E 125th St', name: 'Mount Morris Bank Building (1884, individual landmark)', bin: null,
    at: [2695.36, -2471.47], comp: '5_-5:102', h: 19.8, status: 'measured',
    custom: { fn: 'east:mountMorris', with: 'kit' },
    // Measured on the rectified 2026-08 elevation (client/shots/ar34/east/elev/n_81e_DQf2.jpg, 26 px/m): a rock-faced brownstone
    // ground floor to 3.4 m, a red brick second floor (3.4-7.6 m) with four round-arched windows and terracotta roundels, two canted
    // oriels of grey-painted metal (centres u 7.58 and 20.4) from 7.6 m to the cornice (19.0-19.8 m), punched windows between them at
    // u 2.95-4.15, 10.9-12.15, 13.05-14.0 + 14.2-15.15, 16.0-17.2, 24.0-25.25 (sills 9.0 / 12.6 / 16.65 m; arched on floor 4), the
    // brownstone pavilion and big arch at the Park Avenue end (u 21.4-26.3); the slate mansard, the oriels' top stage, the dormers and
    // six stacks are in fk/custom/east.js mountMorris. Brick sampled #a46f5e lit / #8a5641 shaded (the AR33 draft read orange).
    // (#a77e6d: s2r4 read (149,97,78) s 0.48), then three quarters of the rest (#ab8b7b)
    wall: { mat: 'brick_red', tint: '#ab8b7b', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: { h: 3.4, bays: [
        { kind: 'entrance', u0: 2.4, u1: 3.9, door: { kind: 'solid', w: 1.0, recess: 0.45, h: 2.3, transom: 0.0, tint: '#2c2b29' } },
        { kind: 'window', u0: 8.6, u1: 9.6, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
        { kind: 'entrance', u0: 11.0, u1: 12.8, door: { kind: 'glass', w: 1.1, recess: 0.6, h: 2.3, transom: 0.0, frame: 'alu_black' } },
        { kind: 'window', u0: 13.6, u1: 15.4, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
        { kind: 'window', u0: 16.6, u1: 18.6, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
        { kind: 'entrance', u0: 22.1, u1: 25.6, door: { kind: 'double', w: 1.05, recess: 0.55, h: 2.45, transom: 0.6, frame: 'alu_black' },
          sign: { kind: 'channel', text: 'GINJAN Cafe', font: 'Inter-700', fg: '#e8742a', bg: null, u0: 22.9, u1: 24.8, y: 3.15, h: 0.28, fill: 0.6 } },
      ] },
      bays: { n: 6, margin: [0.5, 0.5] },
      floors: [
        // (AR34 w2 b3) the four arched windows of the second floor through the kit's own openings (the custom's windows sat behind the
        // face's wall: only their fanlights showed over blank brick in r4 / r5); measured 1.6 m wide from 3.55 m, the round head to 6.35 m
        { n: 1, h: 4.2, win: 'none', open: [[8.24, 9.84, 'B'], [11.47, 13.07, 'B'], [14.7, 16.3, 'B'], [17.93, 19.53, 'B']] },
        { n: 1, h: 3.8, win: 'M', open: [[2.95, 4.15, 'M'], [10.9, 12.15, 'M'], [13.05, 14.0, 'M'], [14.2, 15.15, 'M'], [16.0, 17.2, 'M'], [24.0, 25.25, 'M']] },
        { n: 1, h: 3.8, win: 'A', open: [[2.95, 4.15, 'A'], [10.9, 12.15, 'A'], [13.05, 14.0, 'A'], [14.2, 15.15, 'A'], [16.0, 17.2, 'A'], [24.0, 25.25, 'A']] },
        { n: 1, h: 3.6, win: 'M', open: [[2.95, 4.15, 'M'], [10.9, 12.15, 'M'], [13.05, 14.0, 'M'], [14.2, 15.15, 'M'], [16.0, 17.2, 'M'], [24.0, 25.25, 'M']] },
      ],
      windows: {
        M: win({ w: 1.2, h: 1.95, sill: 1.4, frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('flat', '#7a6152', 0.24, 'brownstone'), sillStone: sillOf('#7a6152', 0.12, 0.06, 'brownstone'), ac: 0.08, blinds: 0.5 }),
        A: win({ w: 1.2, h: 2.5, sill: 1.2, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('arch', '#7a6152', 0.26, 'brownstone'), sillStone: sillOf('#7a6152', 0.12, 0.06, 'brownstone'), ac: 0.05, blinds: 0.5 }),
        B: win({ w: 1.6, h: 2.8, sill: 0.15, kind: 'arch', frame: 'alu_black', lights: '3/3', reveal: 0.24, lintel: { kind: 'arch', mat: 'brick_red', tint: '#8a5444', h: 0.36, proj: 0.04 }, sillStone: sillOf('#7a6152', 0.14, 0.08, 'brownstone'), ac: 0, blinds: 0.25 }),
      },
      rustication: { to: 3.4, mat: 'brownstone', tint: '#6e5a4b', joint: 0.6, block: 1.15, chamfer: 0.035 },
      bands: [
        { at: 'base', h: 0.45, proj: 0.16, mat: 'brownstone', tint: '#76604f' },
        { at: 7.45, h: 0.4, proj: 0.12, mat: 'brownstone', tint: '#76604f' },
        { at: 'floor:4', h: 0.16, proj: 0.05, mat: 'brownstone', tint: '#76604f' },
        { at: 'floor:5', h: 0.16, proj: 0.05, mat: 'brownstone', tint: '#76604f' },
      ],
      quoins: { mat: 'brownstone', tint: '#76604f', h: 0.4, w: 0.7, ws: 0.4, proj: 0.03, at: 'left', from: 3.4, to: 19.0 },
      cornice: { kind: 'bracketed', h: 0.8, proj: 0.8, mat: 'plain', tint: '#4a4845', brackets: 18 },
    }, {
      edge: 'corner',
      base: { h: 3.4, bays: [
        { kind: 'window', u0: 1.6, u1: 3.0, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
        { kind: 'window', u0: 5.2, u1: 6.6, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
        { kind: 'window', u0: 8.8, u1: 10.2, h: 2.0, glazing: { bulkhead: 0.8, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, interior: 'empty' },
      ] },
      bays: { n: 4, margin: [0.9, 0.9] },
      floors: [{ n: 1, h: 4.2, win: 'A' }, { n: 1, h: 3.8, win: 'M' }, { n: 1, h: 3.8, win: 'A' }, { n: 1, h: 3.6, win: 'M' }],
      windows: {
        M: win({ w: 1.25, h: 1.95, sill: 1.4, frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('flat', '#7a6152', 0.24, 'brownstone'), sillStone: sillOf('#7a6152', 0.12, 0.06, 'brownstone'), ac: 0.08, blinds: 0.5 }),
        A: win({ w: 1.4, h: 2.6, sill: 1.1, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('arch', '#7a6152', 0.28, 'brownstone'), sillStone: sillOf('#7a6152', 0.12, 0.06, 'brownstone'), ac: 0.05, blinds: 0.5 }),
      },
      rustication: { to: 9.0, mat: 'brownstone', tint: '#6e5a4b', joint: 0.6, block: 1.15, chamfer: 0.035 },
      bands: [{ at: 'base', h: 0.45, proj: 0.16, mat: 'brownstone', tint: '#76604f' }, { at: 9.0, h: 0.4, proj: 0.12, mat: 'brownstone', tint: '#76604f' }],
      cornice: { kind: 'bracketed', h: 0.8, proj: 0.8, mat: 'plain', tint: '#4a4845', brackets: 10 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.1, coping: 'metal' }, membrane: 'black' },
    refs: [],
    notes: 'The landmark at the Park Avenue NW corner, measured (see the comment). The Park Avenue face (rock-faced to the ' +
      'second-floor sill, arched windows) is still a draft read off b15_o. Unknown: the rear and west walls (plain).',
  },

  // ------------------------------------------------------------------ Fifth Avenue to Madison, north side
  {
    id: 'e125-2', addr: '2 E 125th St (Fifth Ave NE corner)', name: 'Club Pilates, brick tower on a framed podium', bin: null,
    at: [2485.96, -2617.79], comp: '4_-6:536', h: 22.8, status: 'measured',
    // Measured on the rectified 2026-08 elevation (client/shots/ar34/east/elev/n_2e_yrk0.jpg, 26 px/m; u_orig from the Fifth Avenue corner,
    // the face's u = u_orig - 6.4 because the ring leaves the corner notch to fk/custom/east.js twoEast): a pink brick podium frame to
    // 22.8 m: shops under a stone band (5.0-5.5 m), three tall second-storey windows (5.85-10.1 m) at u_orig 7.6-10.2 / 11.2-13.4 /
    // 14.4-16.5, a second band at 11.0-11.6 m, blank brick panels between frame piers to the top beam (20.8-22.8 m), a dark louvre screen
    // at u_orig 17.85-23.35 from 5.1 to 21.0 m, the open corner loggia (custom). The tower over u_orig 5.2-23.6 (flush with the front):
    // 67.1 and 68.0 m over the lens, the lens 2.15 m over the road: the roof 69.7 m; a raised block
    // on the roof (its east corner ~6.6 m behind the south-east corner) to 78.3 m, not drawn (its extent is not measured).
    // agrees by proportion (~46 m of tower over the 22.8 m podium); its twenty storeys include the podium's.
    // The estimate before (82.8 m, twenty storeys over the podium) was 13 m too tall.
    // (The AR33 draft: 30 m, a window grid.)
    ring: [[2482.48, -2585.07], [2465.77, -2594.32], [2468.86, -2599.92], [2463.26, -2603.03], [2489.43, -2650.5], [2511.74, -2638.16]],
    custom: { fn: 'east:twoEast', with: 'kit' },
    tower: { u0: -1.2, u1: 17.2, w0: 0.0, w1: -48.0, h: 69.7, floors: 16, tint: '#a8806f',
      cols: [[-0.1, 1.5], [2.8, 4.6], [5.7, 7.6], [8.6, 10.5], [11.4, 13.4], [14.3, 16.3]] },
    wall: { mat: 'brick_red', tint: '#a8806f', dirt: 0.3 },
    faces: [{
      edge: 'front',
      base: { h: 5.1, bays: [
        shop(1.25, 10.1, { name: 'Club Pilates', h: 4.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.82, w: 1.2, kind: 'double', recess: 0.5 }, interior: { kind: 'restaurant', tone: '#2c2f33', lit: 0.8 },
          sign: { kind: 'channel', text: 'CLUB PILATES', font: 'Inter-700', fg: '#ffffff', bg: null, u0: 6.6, u1: 9.7, y: 4.3, h: 0.36, fill: 0.85 } }),
        shop(11.45, 16.9, { name: 'vacant shop', h: 4.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.9, w: 1.0, recess: 0.3 }, interior: { kind: 'empty', tone: '#3d6fb5', lit: 0.6 } }),
      ] },
      floors: [{ n: 1, h: 6.0, win: 'T', open: [[1.2, 3.8, 'T'], [4.8, 7.0, 'T'], [8.0, 10.1, 'T']] }, { n: 1, h: 11.2, win: 'none' }],
      windows: { T: win({ w: 2.2, h: 4.25, sill: 0.75, kind: 'casement', frame: 'alu_bronze', lights: '1/1', reveal: 0.3, lintel: null, sillStone: sillOf('#c7aa9c', 0.1, 0.05), ac: 0, blinds: 0.4 }) },
      piers: { mat: 'brick_red', tint: '#b08a79', w: 0.7, proj: 0.16, at: [0.35, 4.25, 7.55, 11.2, 16.95], from: 11.6, to: 20.8, capital: false, base: false },
      bands: [
        { at: 5.0, h: 0.5, proj: 0.12, mat: 'stone_lime', tint: '#c7aa9c' },
        { at: 11.0, h: 0.6, proj: 0.14, mat: 'brick_red', tint: '#b08a79' },
        { at: 17.9, h: 0.8, proj: 0.1, mat: 'brick_red', tint: '#b08a79', u0: 0, u1: 11.4 },
      ],
      items: [{ k: 'plywood', u0: 11.45, u1: 16.95, y0: 5.5, y1: 21.0, w: 0.06, mat: 'ribbed', tint: '#383b3e' }],
      cornice: { kind: 'band', h: 2.0, proj: 0.1, mat: 'brick_red', tint: '#b08a79' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.4, coping: 'metal' }, membrane: 'gravel' },
    refs: [],
    notes: 'Measured podium; the tower\'s height measured (see the comment), its depth estimated. The Fifth Avenue face, the tower\'s orange balconies on its east face and the solar array on its roof are not drawn.',
  },
  tenement({
    id: 'e125-11', addr: '11 E 125th St', name: null, at: [2488.42, -2591.99], comp: '4_-6:396', h: 12.84, n: 3, w: 5.06, baseH: 4.2,
    mat: 'brick_painted', tint: '#e6e3dc', trim: '#d4cfc4', trimMat: 'stucco', cornTint: '#2a2928', fe: [0], bays: 2, door: 1.4, shopName: 'shop', refs: [],
    notes: 'b02_s (2026-08): white-painted walk-up, a black bracketed sheet-metal cornice, a fire escape on the west bay (the AR33 draft drew it in brown brick).',
  }),
  {
    id: 'e125-13', addr: '13 E 125th St', name: 'white cast-iron front with caducei', bin: null,
    at: [2497.06, -2592.97], comp: '4_-6:52', h: 12.69, status: 'draft',
    // b02: a smooth white-painted front: the second floor a row of five sashes
    // with low iron railings, gilded caducei on brackets at both ends;
    // the third floor 2 + 3 + 2 sashes in a moulded frame; a plain moulded cornice and a panelled parapet. (The AR33 draft: block-jointed
    // terracotta, three windows a floor, a modillion cornice.)
    wall: { mat: 'stucco', tint: '#ebe8e0', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.8, bays: [
        shop(0.4, 4.6, { name: 'shop', h: 3.8, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_white' }, door: { u: 0.25, w: 1.0, recess: 0.5 }, interior: 'shop_clothing', gate: gateBox('#d9d6cf', 0.0) }),
        shop(5.2, 8.8, { name: 'shop', h: 3.8, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 1, frame: 'alu_white' }, door: null, interior: 'shop_food', gate: gateBox('#d9d6cf', 0.0) }),
      ] },
      bays: { n: 3, margin: [0.5, 0.5] },
      floors: [
        { n: 1, h: 3.7, win: 'G', open: [[1.06, 2.02, 'G'], [2.21, 3.27, 'G'], [3.56, 4.71, 'G'], [4.9, 6.15, 'G'], [6.35, 7.5, 'G']] },
        { n: 1, h: 3.5, win: 'G', open: [[0.87, 1.54, 'G'], [1.58, 2.21, 'G'], [2.6, 3.37, 'G'], [3.5, 4.62, 'G'], [4.81, 5.58, 'G'], [5.96, 6.63, 'G'], [6.83, 7.5, 'G']] },
      ],
      windows: { G: win({ w: 1.0, h: 1.8, sill: 0.8, kind: 'dh', frame: 'alu_white', lights: '1/1', reveal: 0.12, lintel: null, sillStone: sillOf('#e6e2d8', 0.08, 0.04, 'stucco'), ac: 0.25, blinds: 0.5, sheer: 0.3 }) },
      bands: [
        { at: 'base', h: 0.55, proj: 0.16, mat: 'stucco', tint: '#e4e0d6' },
        { at: 7.95, h: 0.5, proj: 0.08, mat: 'stucco', tint: '#e4e0d6' },
        { at: 'floor:3', h: 0.3, proj: 0.12, mat: 'stucco', tint: '#e4e0d6' },
        { at: 11.2, h: 0.18, proj: 0.1, mat: 'stucco', tint: '#e4e0d6' },
      ],
      items: [
        { k: 'plaque', u: 0.25, y: 6.1, w: 0.4, h: 1.0, mat: 'metal_painted', tint: '#b8922f' },
        { k: 'plaque', u: 7.75, y: 6.1, w: 0.4, h: 1.0, mat: 'metal_painted', tint: '#b8922f' },
        { k: 'grille', u: 1.0, y: 5.35, w: 6.6, h: 0.75 },
      ],
      cornice: { kind: 'band', h: 0.55, proj: 0.35, mat: 'stucco', tint: '#e8e5dd' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'stone_lime' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.15, 0.6], w: 1.6, d: 1.2, h: 1.8 }] },
    refs: [], notes: 'The caducei are gilded plaques (no relief); the iron railings of the second floor are a grille item.',
  },
  {
    id: 'e125-17', addr: '17 E 125th St', name: 'furniture and art gallery (gate down)', bin: null,
    at: [2505.09, -2588.53], comp: '4_-6:97', h: 5.3, status: 'draft',
    custom: { fn: 'east:wingsGate', with: 'kit' }, gateMural: { u0: 0.45, u1: 8.75, h: 3.4 },
    // b01_s / b03_s (2026-08) (not rectified): the roll-down gate is down across the front and painted (a sunset over a
    // brick wall, white wings in the middle: fk/custom/east.js wingsGate, invented in that palette), a cream sign band with brown letters
    // over it, and a sign board along the parapet in three panels (gallery and home decor, a laundromat 'coming soon' panel, cabinets and
    // counter tops). The AR33 draft drew an open laundromat.
    wall: { mat: 'stucco', tint: '#a39b8e', dirt: 0.55 },
    faces: [{ edge: 'front', base: { h: 3.9, bays: [{ kind: 'wall', u0: 0.4, u1: 8.8 }] },
      floors: [], cornice: { kind: 'parapet' },
      items: [
        { k: 'sign', sign: { kind: 'panel', text: 'FURNITURE  ART  FRAMING  ACCESSORIES', font: 'Inter-700', fg: '#7a2a1f', bg: '#e3d6bb', u0: 0.4, u1: 8.8, y: 3.45, h: 0.42, fill: 0.7 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['ART AND HOME DECOR', 'FINE ART GALLERY'], font: 'Inter-700', fg: '#151515', bg: '#f4f2ec', u0: 0.5, u1: 3.6, y: 3.95, h: 1.15, fill: 0.75 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['JBA LAUNDROMAT', 'COMING SOON'], font: 'Anton', fg: '#c4291f', bg: '#f2c31d', u0: 3.65, u1: 6.15, y: 3.95, h: 1.15, fill: 0.75 } },
        { k: 'sign', sign: { kind: 'panel', lines: ['CABINETS', 'COUNTER TOPS'], font: 'Inter-700', fg: '#151515', bg: '#f4f2ec', u0: 6.2, u1: 8.7, y: 3.95, h: 1.15, fill: 0.75 } },
      ] }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Draft; the sign texts are the shop\'s own words, the layout of the board is invented.',
  },
  {
    id: 'e125-35', addr: '35 E 125th St', name: 'Geoffrey Canada Community Center, Harlem Children\'s Zone Promise Academy', bin: null,
    at: [2543.93, -2568.62], comp: '4_-6:261', h: 19.3, status: 'measured',
    // Measured on the rectified 2026-08 elevations (client/shots/ar34/east/elev/n_35e_sY9H.jpg + n_35e_EyQc.jpg, 20 px/m; face u =
    // elevation u - 30): the school block east of the compiled lot's 1.3 m jog (this ring; the one-storey glazed wing west of it is drawn
    // by fk/custom/east.js hczWing): a glazed ground floor over a dark brick plinth to 5.0 m, a tan sill band 5.15-6.3 m, a curtain wall
    // with sun shelves on three floors (6.45-17.1 m, u 0-28.75), a deep recess (u 28.75-38) with a red panel (u 29.5-31.9) and a glass box,
    // the blind tan brick block (u 38-48.75) over the entrance canopy (u 38-50.75, 4.4-5.0 m), the parapet at 19.3 m, a glazed penthouse
    // set back (u 12-41.75) to 21.4 m and a shaft (u 29-31.75) to 24.6 m. Colours sampled: tan brick #d7bfa0, sill band #d0b38e, plinth
    // #655d53, curtain glass #768591, canopy #835d52. The AR33 draft (h 25.5, the whole 79 m compiled lot) drew punched windows here.
    ring: [[2581.98, -2564.89], [2578.7, -2558.92], [2582.97, -2556.56], [2571.64, -2536], [2528.6, -2559.81], [2543.26, -2586.3]],
    custom: { fn: 'east:hczWing', with: 'kit' },
    wall: { mat: 'brick_buff', tint: '#d0b896', dirt: 0.3 },
    faces: [{
      edge: [2571.64, -2536, 2528.6, -2559.81],
      base: { h: 5.15, bays: [
        { kind: 'window', u0: 0.25, u1: 16.9, h: 4.85, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 11, frame: 'alu_clear', kick: 'brick_brown' }, door: null, interior: { kind: 'empty', tone: '#3b4044', lit: 0.5 } },
        { kind: 'store', u0: 17.0, u1: 22.6, h: 4.85, glazing: { bulkhead: 0.5, transom: 2.2, mullions: 3, frame: 'alu_clear', kick: 'brick_brown' }, door: { u: 0.5, w: 1.8, kind: 'double', recess: 0.25 }, interior: { kind: 'empty', tone: '#3b4044', lit: 0.5 } },
        { kind: 'store', u0: 22.8, u1: 28.6, h: 4.85, glazing: { bulkhead: 0.5, transom: 2.2, mullions: 3, frame: 'alu_clear', kick: 'brick_brown' }, door: { u: 0.62, w: 1.8, kind: 'double', recess: 0.25 }, interior: { kind: 'empty', tone: '#3b4044', lit: 0.5 } },
        { kind: 'wall', u0: 28.8, u1: 37.6 },
        { kind: 'entrance', u0: 38.4, u1: 48.2, door: { kind: 'double', w: 1.8, recess: 1.6, h: 2.8, transom: 0.9, frame: 'alu_clear' } },
      ] },
      floors: [{ n: 3, h: 3.55, win: 'none' }],
      // (AR34 w2 b3) vision glass again now MATS fixed its shards (ar34-req/EAST.md 03:19 / 03:26).
      // (median, refs_lv/b04_s.jpg x 290-810, y 110-340); glass_blue read (88,100,109) in plate s2r1, glass_vision_blue (131,153,153) in
      // MATS's: glass_vision_grey's lower transmission (0.42) with a blue tint a little less green than glass_vision_blue's ('#a6c0ce')
      curtain: { u0: 0.0, u1: 37.5, y0: 6.45, y1: 17.1, mullion: 1.55, transom: 'floor', frame: 'alu_clear', glass: 'glass_vision_grey', glassTint: '#a6bcce', spandrel: 'glass_grey', spandrelH: 0.55, lit: 0.4, blinds: 0.8 },
      bands: [
        { at: 5.15, h: 1.15, proj: 0.04, mat: 'brick_buff', tint: '#cdb08c' },
        { at: 9.95, h: 0.06, proj: 0.7, mat: 'alu_clear', u0: 0, u1: 28.75 },
        { at: 13.5, h: 0.06, proj: 0.7, mat: 'alu_clear', u0: 0, u1: 28.75 },
        { at: 16.95, h: 0.06, proj: 0.7, mat: 'alu_clear', u0: 0, u1: 28.75 },
        { at: 0.0, h: 0.5, proj: 0.03, mat: 'brick_brown', tint: '#5f574d', u0: 0, u1: 28.75 },
      ],
      // the eight poster panels over the word plaques: plain slabs (session 2; as empty sign panels each cost a canvas read back at load)
      piers: { at: [{ u: 30.7, w: 2.4, proj: 0.06, from: 6.3, to: 17.2, mat: 'plain', tint: '#8f3429' },
        ...['#6f7f99', '#9b7a62', '#5f8a8f', '#a4867a', '#7d6f8f', '#8a9a7a', '#7a8899', '#c9b98a'].map((tint, k) => ({ u: 29.54 + k * 1.06, w: 0.98, proj: 0.05, from: 2.5, to: 5.0, mat: 'plain', tint }))],
        w: 0.4, proj: 0.05, mat: 'brick_buff', capital: false, base: false },   // plain slabs: no pilaster mouldings
      items: [
        { k: 'sign', sign: { kind: 'channel', text: 'GEOFFREY CANADA COMMUNITY CENTER', font: 'Inter-700', fg: '#4a4440', bg: null, u0: 41.0, u1: 48.2, y: 5.75, h: 0.32, fill: 0.85 } },
        { k: 'sign', sign: { kind: 'channel', text: 'HARLEM CHILDREN\'S ZONE & PROMISE ACADEMY', font: 'Inter-700', fg: '#f1ece2', bg: null, u0: 38.9, u1: 50.1, y: 4.52, h: 0.36, fill: 0.85 }, z: 3.03 },
        ...[['GROW', '#e3a23a'], ['THRIVE', '#2f6fb7'], ['EXPLORE', '#e2622f'], ['LEARN', '#d23c3c'], ['PLAY', '#e6b52e'], ['CREATE', '#3f9a4a'], ['COMMUNITY', '#2c5aa8'], ['', '#e9d9a8']]
          .map(([t, c], k) => ({ k: 'sign', sign: { kind: 'panel', text: t, font: 'Inter-700', fg: '#ffffff', bg: c, u0: 29.05 + k * 1.06, u1: 29.05 + k * 1.06 + 0.98, y: 1.5, h: 0.95, fill: 0.5 } })),
      ],
      cornice: { kind: 'band', h: 2.1, proj: 0.04, mat: 'brick_buff', tint: '#d4bc9a' },
    }, {
      edge: 4, floors: [], cornice: { kind: 'band', h: 2.1, proj: 0.04, mat: 'brick_buff', tint: '#d4bc9a' },
    }],
    roof: {
      kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'gravel', clutter: 0.6,
      levels: [{ u0: 12.0, u1: 41.75, d0: 1.6, d1: 24.0, h: 1.9, mat: 'panel_grey', tint: '#9aa3a8', membrane: 'white', coping: 'metal' }],
      items: [{ k: 'bulkhead', at: [0.63, 0.06], w: 2.75, d: 2.6, h: 5.3 }, { k: 'hvac', at: [0.25, 0.6], n: 3 }],
    },
    refs: [],
    notes: 'Measured (see the comment). The children\'s photo banners in the poster bays are plain colour panels with the words (no photographs). ' +
      'The rear and the penthouse depth are not measured.',
  },
  {
    id: 'e125-51', addr: '51 E 125th St', name: 'Manhattan Medical Arts & Dental Specialists, Island Juice & Grill', bin: null,
    at: [2608.33, -2529.27], comp: '5_-5:96', h: 15.9, status: 'draft',
    // b05 (1920): three storeys, grey-taupe pilasters framing white panels and ribbon windows; Island Juice & Grill under a black scalloped awning
    wall: { mat: 'panel_alu', tint: '#ebe8e0', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: { h: 4.8, bays: [
        shop(0.9, 6.0, { name: 'Healthcare', h: 3.7, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, interior: 'pharmacy' }),
        { kind: 'entrance', u0: 7.2, u1: 10.4, door: { kind: 'double', w: 1.0, recess: 0.5, h: 2.4, transom: 0.9, frame: 'alu_black' } },
        shop(11.0, 17.2, { name: 'Medical Arts storefront', h: 3.7, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, interior: 'pharmacy' }),
        shop(17.8, 21.6, { name: 'Island Juice & Grill', h: 3.4, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, recess: 0.5 }, interior: 'shop_food',
          awning: { kind: 'fixed', color: '#151515', drop: 0.42, proj: 1.2 },
          sign: { kind: 'lightbox', text: 'ISLAND JUICE & GRILL', font: 'Anton', fg: '#f2d21b', bg: '#1a1a1a', u0: 17.6, u1: 21.8, y: 3.65, h: 1.0, fill: 0.5 } }),
      ] },
      bays: { widths: [0.4, 4.0, 4.2, 4.2, 4.2, 4.0, 1.35] },
      floors: [{ n: 1, h: 3.6, win: 'G' }, { n: 2, h: 3.4, win: 'G' }],
      windows: { G: { w: 3.5, h: 1.7, sill: 0.85, kind: 'ribbon', mullions: 2, frame: 'alu_black', glass: 'glass_clear', reveal: 0.14, lintel: null, sillStone: null, ac: 0.1, blinds: 0.75, lit: 0.3 } },
      piers: { mat: 'concrete_precast', tint: '#85806f', w: 0.95, proj: 0.14, at: [0.5, 4.5, 8.7, 12.9, 17.1, 21.1], from: 'base', to: 'cornice', capital: false, base: false },
      bands: [{ at: 'base', h: 0.5, proj: 0.12, mat: 'concrete_precast', tint: '#85806f' }, { at: 'floor:3', h: 0.3, proj: 0.06, mat: 'concrete_precast', tint: '#85806f' }],
      cornice: { kind: 'band', h: 0.9, proj: 0.3, mat: 'concrete_precast', tint: '#85806f' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'White cement-board panels between taupe piers; window posters are not drawn.',
  },
  tenement({
    id: 'e125-57', addr: '57 E 125th St', name: 'Dunkin\' Donuts, Baskin-Robbins', at: [2620.2, -2521.64], comp: '5_-5:124', h: 12.46, n: 3, w: 5.81, baseH: 4.4,
    mat: 'brick_tan', tint: '#c7a672', trim: '#9b8161', trimMat: 'concrete_precast', cornTint: '#7a6248', fe: null, bays: 2, door: 0.6, shopName: 'DUNKIN\' BASKIN', signBg: '#e96b1f', signFg: '#ffffff', refs: [],
    cornice: 'parapet', cornH: 0.6,
  }),
  tenement({
    id: 'e125-59', addr: '59 E 125th St', name: null, at: [2626.62, -2521.19], comp: '5_-5:32', h: 8.63, n: 1, w: 5.67, baseH: 4.4,
    mat: 'brick_tan', tint: '#b09a7e', trim: '#8a7a66', trimMat: 'concrete_precast', cornTint: '#6b5d4c', fe: null, bays: 2, door: 0.8, shopName: 'shop', refs: [],
    cornice: 'parapet', cornH: 0.6,
  }),
  tenement({
    id: 'e125-61', addr: '61 E 125th St', name: 'Accra Restaurant Express', at: [2631.57, -2519.12], comp: '5_-5:41', h: 16.24, n: 4, w: 5.14, baseH: 4.3,
    mat: 'stucco', tint: '#e2d6b6', trim: '#a8603e', trimMat: 'terracotta_cream', cornTint: '#9a5a38', fe: [0], bays: 2, door: 1.2, shopName: 'ACCRA RESTAURANT EXPRESS', signBg: '#2a1c14', signFg: '#e7c14a', lintel: 'hood', refs: [],
  }),
  tenement({
    id: 'e125-63', addr: '63 E 125th St', name: 'Uptown Wine & Liquor', at: [2638.16, -2515.42], comp: '5_-5:3', h: 16.1, n: 4, w: 9.98, baseH: 4.3,
    mat: 'stucco', tint: '#e2d6b6', trim: '#a8603e', trimMat: 'terracotta_cream', cornTint: '#9a5a38', fe: [1, 2], bays: 3, door: 1.3, shopName: 'UPTOWN WINE & LIQUOR', signBg: '#14130f', signFg: '#e8c25a', lintel: 'hood', refs: [],
  }),
  {
    id: 'e125-65', addr: '65 E 125th St', name: 'The Universal Church, Direct Print', bin: null,
    at: [2646.3, -2512.05], comp: '5_-5:153', h: 9.07, status: 'draft',
    wall: { mat: 'brick_painted', tint: '#d8d3c6', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        shop(0.3, 6.6, { name: 'The Universal Church', h: 3.3, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.6, w: 1.0, recess: 0.5 }, interior: 'empty',
          sign: { kind: 'lightbox', text: 'Jesus Christ Is The Lord', font: 'Inter-700', fg: '#b2231c', bg: '#f4f1ea', u0: 0.15, u1: 6.9, y: 3.4, h: 1.15, fill: 0.42, extra: { sub: { text: 'The Universal Church', size: 0.6 } } } }),
        { kind: 'entrance', u0: 6.95, u1: 7.5, door: { kind: 'solid', w: 0.6, recess: 0.2, tint: '#1e1b18' } },
      ] },
      bays: { n: 1, margin: [0.7, 0.7] },
      floors: [{ n: 1, h: 3.2, win: 'W' }],
      windows: { W: { w: 5.0, h: 2.0, sill: 0.6, kind: 'ribbon', mullions: 3, frame: 'alu_black', glass: 'glass_grey', reveal: 0.12, lintel: null, sillStone: null, ac: 0, blinds: 0.8, lit: 0.2 } },
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'White-painted brick, a four-pane metal window band on the second floor, a wheelchair ramp with white railing in front (not drawn).',
  },
  {
    id: 'e125-69', addr: '69 E 125th St', name: 'Second Avenue Subway Community Information Center', bin: null,
    at: [2652.91, -2507.23], comp: '5_-5:190', h: 33.5, status: 'measured',
    // Measured on the rectified 2024-08 elevation (client/shots/ar34/east/elev/n_madpark_nuHH.jpg, 28 px/m; face u = elevation u - 39.97):
    // the grey-tan long-brick front runs u 0.2-15.1, over compiled lot 190 AND the empty strip east of it (no compiled building there: the
    // twin showed a gap), so this ring spans both. Base: a black-framed storefront to 3.2 m under a black signband (3.2-3.8 m), brick from
    // 4.1 m; floors every 2.86 m (window rows 4.4-6.4, 7.2-9.2, 10.1-12.1 m), staggered openings of mixed widths, alternating by floor
    // (patterns A/B/C below are rows 1/2/3 as measured; the upper floors repeat them).
    // (2024-10); 33.5 m is 4.1 + 10 x 2.86 + parapet, not measured directly. The orange-panel east part
    // (compiled lot 191) is 'e125-69b'.
    ring: [[2656.9, -2522.17], [2670.18, -2514.72], [2655.54, -2488.57], [2642.26, -2496.02], [2656.08, -2520.72]],
    wall: { mat: 'brick_tan', tint: '#a39886', dirt: 0.3, bond: 'running' },
    faces: [{
      edge: [2655.54, -2488.57, 2642.26, -2496.02],
      base: { h: 4.1, bays: [
        shop(0.3, 6.6, { name: 'Second Avenue Subway Community Information Center', h: 3.2, glazing: { bulkhead: 0.25, transom: 0.0, mullions: 4, frame: 'alu_black' },
          door: { u: 0.62, w: 1.6, kind: 'double', recess: 0.2 }, interior: { kind: 'bank', tone: '#3a3d42', lit: 0.8 },
          sign: { kind: 'panel', text: 'Second Avenue Subway  Community Information Center', font: 'Inter-700', fg: '#ffffff', bg: '#141414', u0: 0.0, u1: 7.4, y: 3.2, h: 0.6, fill: 0.45 } }),
        shop(7.0, 15.0, { name: 'retail space for lease', h: 3.2, glazing: { bulkhead: 0.25, transom: 0.0, mullions: 5, frame: 'alu_black' }, door: { u: 0.3, w: 1.6, kind: 'double', recess: 0.2 },
          interior: { kind: 'empty', tone: '#2e3033', lit: 0.2 },
          vinyl: [{ text: 'RETAIL SPACE FOR LEASE', u: 4.6, w: 0.85, y: 1.2, h: 0.95, fg: '#e8562a' }, { text: 'RETAIL SPACE FOR LEASE', u: 5.55, w: 0.85, y: 1.2, h: 0.95, fg: '#e8562a' }, { text: 'RETAIL SPACE FOR LEASE', u: 6.5, w: 0.85, y: 1.2, h: 0.95, fg: '#e8562a' }] }),
      ] },
      floors: [
        { n: 1, h: 2.86, win: 'P', open: [[0.93, 1.38, 'P'], [1.99, 5.03, 'P'], [5.83, 6.28, 'P'], [6.99, 8.17, 'P'], [9.63, 11.63, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.43, 6.13, 'P'], [6.99, 7.43, 'P'], [8.03, 11.43, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.28, 3.93, 'P'], [4.53, 7.33, 'P'], [8.0, 8.42, 'P'], [9.03, 11.6, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[0.93, 1.38, 'P'], [1.99, 5.03, 'P'], [5.83, 6.28, 'P'], [6.99, 8.17, 'P'], [9.63, 11.63, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.43, 6.13, 'P'], [6.99, 7.43, 'P'], [8.03, 11.43, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.28, 3.93, 'P'], [4.53, 7.33, 'P'], [8.0, 8.42, 'P'], [9.03, 11.6, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[0.93, 1.38, 'P'], [1.99, 5.03, 'P'], [5.83, 6.28, 'P'], [6.99, 8.17, 'P'], [9.63, 11.63, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.43, 6.13, 'P'], [6.99, 7.43, 'P'], [8.03, 11.43, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[1.28, 3.93, 'P'], [4.53, 7.33, 'P'], [8.0, 8.42, 'P'], [9.03, 11.6, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
        { n: 1, h: 2.86, win: 'P', open: [[0.93, 1.38, 'P'], [1.99, 5.03, 'P'], [5.83, 6.28, 'P'], [6.99, 8.17, 'P'], [9.63, 11.63, 'P'], [12.23, 13.78, 'P'], [14.23, 14.63, 'P']] },
      ],
      windows: { P: win({ w: 1.5, h: 2.0, sill: 0.3, kind: 'casement', frame: 'alu_dark', lights: '1/1', reveal: 0.2, lintel: null, sillStone: sillOf('#77736c', 0.06, 0.03, 'concrete_precast'), ac: 0.04, blinds: 0.35, sheer: 0.45 }) },
      bands: [{ at: 3.2, h: 0.62, proj: 0.04, mat: 'plain', tint: '#151516' }],
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'metal' }, membrane: 'white', clutter: 0.8, items: [{ k: 'bulkhead', at: [0.5, 0.45], w: 4.0, d: 3.5, h: 3.0 }] },
    refs: [],
    notes: 'Measured front, estimated height (see the comment). The KSR leasing posters are vinyl panels (invented text layout).',
  },
  {
    id: 'e125-69b', addr: '69 E 125th St (east part)', name: 'entrance wing in orange panels', bin: null,
    at: [2665.86, -2499.07], comp: '5_-5:191', h: 22.0, status: 'draft',
    // b12_s (2024-08) and the elevation n_madpark_nuHH (face u = elevation u - 55.2): orange-brown wood-look panel cladding over u 0-6.8 with
    // the '69 EAST 125TH' entrance (a black sign band, a glazed lobby door) and a service door; staggered dark-framed windows above. The
    wall: { mat: 'plain_cladding', tint: '#b1612f', dirt: 0.25 },
    faces: [{
      edge: 'front',
      base: { h: 4.1, bays: [
        { kind: 'entrance', u0: 0.5, u1: 4.6, door: { kind: 'double', w: 1.7, recess: 0.5, h: 2.6, transom: 0.6, frame: 'alu_black' },
          sign: { kind: 'panel', text: '69 EAST 125TH', font: 'Inter-700', fg: '#ffffff', bg: '#151515', u0: 0.0, u1: 4.9, y: 3.15, h: 0.62, fill: 0.62 } },
        { kind: 'entrance', u0: 5.6, u1: 6.6, door: { kind: 'solid', w: 0.95, recess: 0.15, h: 2.3, transom: 0.0, tint: '#1d1f22' } },
      ] },
      floors: [{ n: 6, h: 2.86, win: 'P', open: [[0.6, 3.4, 'P'], [4.1, 6.9, 'P']] }],
      windows: { P: win({ w: 1.5, h: 2.0, sill: 0.3, kind: 'casement', frame: 'alu_dark', lights: '1/1', reveal: 0.18, lintel: null, sillStone: null, ac: 0.0, blinds: 0.4, sheer: 0.5 }) },
      cornice: { kind: 'parapet' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'metal' }, membrane: 'white', clutter: 0.6 },
    refs: [], notes: 'Draft: cladding colour from b12_s, height estimated.',
  },
  tenement({
    id: 'e125-77', addr: '77 E 125th St', name: 'newsstand, bookshop', at: [2675.37, -2502.39], comp: '5_-5:30', h: 14.55, n: 3, w: 6.68, baseH: 4.4,
    mat: 'stucco', tint: '#ece6d6', trim: '#6d4a3c', trimMat: 'brownstone', cornTint: '#5e4438', fe: [0], bays: 2, door: 1.5, shopName: 'BOOKS', signBg: '#23402f', signFg: '#eae6d6', lintel: 'hood', refs: [],
  }),
  tenement({
    id: 'e125-79', addr: '79 E 125th St', name: 'Kebab, shuttered shop', at: [2679.06, -2494.21], comp: '5_-5:66', h: 18.17, n: 4, w: 8.51, baseH: 4.4,
    mat: 'stucco', tint: '#eadfc6', trim: '#6d4a3c', trimMat: 'brownstone', cornTint: '#4f6a52', fe: [1], bays: 3, door: 1.6, shopName: 'shop', lintel: 'hood', refs: [],
    gate: { kind: 'rolldown', box: true, color: '#b3362f', down: 0.97, graffiti: { density: 0.95, style: 'piece', seed: 79 } },
    // (AR34 w2 b3) the west 3.6 m of the closed gate carry a figure (b13_s / b14_s: a man in white on red), the kit's lettered piece the rest
    custom: { fn: 'east:gateArt', with: 'kit' }, gateArt: [{ u0: 0.37, u1: 3.97, y0: 0.16, y1: 3.2, plan: [['figure', 3.6]] }],
    awning: { kind: 'fixed', color: '#c1272d', drop: 0.3, proj: 1.1 },
    notes: 'b13_s / b14_s: cream walk-up with brown hoods and a fire escape; the closed red gate carries a large mural piece (painted, invented) under a red awning.',
  }),

  // ------------------------------------------------------------------ Fifth Avenue to Madison, south side
  {
    id: 'e125-4', addr: '4 E 125th St', name: 'Jamila\'s Braiding Salon, Edible Arrangements', bin: null,
    at: [2465.68, -2546.01], comp: '4_-5:179', also: [[2476.31, -2540.15]],
    ring: [[2454.19, -2537.7], [2466.52, -2560.17], [2477.17, -2554.31], [2487.78, -2548.47], [2475.45, -2525.99], [2464.84, -2531.83], [2459.5, -2534.77]],
    h: 18.75, status: 'draft',
    // b45 + b46 (one building, 1900): five storeys of red brick over a two-storey rock-faced brownstone base with round-arched windows; green-copper cornice
    wall: { mat: 'brick_red', tint: '#a0755b', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        shop(0.6, 10.8, { name: 'Jamila\'s Beauty Braiding Salon', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 4, frame: 'alu_black' }, door: { u: 0.1, w: 0.95, recess: 0.5 }, interior: 'shop_clothing',
          sign: signOf('Jamila\'s Beauty Braiding Salon', '#f3efe6', '#151515', 0.3, 11.0, 3.72, 0.9, { font: 'Inter-700' }) }),
        shop(11.4, 16.4, { name: 'vacant shop', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 1, frame: 'alu_black' }, door: null, gate: gateBox('#f1b13a', 0.95), interior: 'empty' }),
        shop(17.6, 24.0, { name: 'Edible Arrangements', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.3, w: 1.0, recess: 0.5 }, interior: 'shop_food',
          sign: signOf('edible', '#d6262c', '#f7f5f0', 17.6, 24.0, 3.75, 0.85) }),
      ] },
      bays: { widths: [0.6, 3.05, 3.05, 3.05, 3.05, 3.05, 3.05, 3.05, 2.35] },
      floors: [{ n: 1, h: 4.0, win: 'Ar' }, { n: 4, h: 3.3, win: 'W' }],
      windows: {
        Ar: win({ w: 1.4, h: 3.0, sill: 0.5, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('keystone', '#9a7b66', 0.3, 'brownstone'), sillStone: sillOf('#8b6f5b', 0.14, 0.07, 'brownstone'), ac: 0.15, blinds: 0.5 }),
        W: win({ w: 1.25, h: 1.95, sill: 0.8, frame: 'alu_white', lights: '1/1', reveal: 0.16, lintel: lintelOf('flat', '#c9b79c', 0.22), sillStone: sillOf('#c9b79c', 0.1, 0.05), ac: 0.35 }),
      },
      rustication: { to: 8.6, mat: 'brownstone', tint: '#8a6b5a', joint: 0.6, block: 1.0, chamfer: 0.03 },
      bands: [{ at: 'base', h: 0.5, proj: 0.14, mat: 'brownstone', tint: '#8a6b5a' }, { at: 'floor:3', h: 0.4, proj: 0.1, mat: 'stone_lime', tint: '#cbb99e' }],
      cornice: { kind: 'bracketed', h: 1.4, proj: 0.7, mat: 'metal_painted', tint: '#4d6e5f', brackets: 14 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Two compiled footprints of 12 m, one building of 24 m. The base is drawn as a rock-faced brownstone (rustication 8.6 m = two floors); arched windows on floor 2.',
  },
  tenement({
    id: 'e125-10', addr: '10 E 125th St', name: null, at: [2481.43, -2530.46], comp: '4_-5:256', h: 19.0, n: 5, w: 6.35, baseH: 4.4,
    mat: 'brick_red', tint: '#946c58', trim: '#b9a488', trimMat: 'stone_lime', cornTint: '#5e4a3c', fe: [0], bays: 2, door: 1.6, shopName: 'shop', refs: [],
  }),
  {
    id: 'e125-14', addr: '14 E 125th St', name: 'B\'Krowned Beauty Bar', bin: null,
    at: [2493.96, -2531.13], comp: '4_-5:97', h: 17.63, status: 'draft',
    // b48 (1900): dark-brown brownstone with a canted bay at the west end of floors 2-4, B'KROWNED sign, an arched doorway
    wall: { mat: 'brownstone', tint: '#5d4034', dirt: 0.45 },
    faces: [{
      edge: [2496.5, -2541.94, 2500.24, -2539.88],
      base: { h: 4.3, bays: [
        shop(0.2, 3.2, { name: 'B\'Krowned Beauty Bar', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'shop_clothing',
          sign: signOf('B\'KROWNED BEAUTY BAR', '#e5c35a', '#14130f', 0.0, 3.4, 3.55, 0.75) }),
      ] },
      bays: { n: 2, margin: [0.3, 0.3] },
      floors: [{ n: 4, h: 3.3, win: 'A' }],
      windows: { A: win({ w: 1.0, h: 1.85, sill: 0.75, frame: 'alu_bronze', lights: '1/1', reveal: 0.16, lintel: lintelOf('hood', '#6d4d3f', 0.24, 'brownstone'), sillStone: sillOf('#6d4d3f', 0.1, 0.05, 'brownstone'), ac: 0.25 }) },
      bands: [{ at: 'base', h: 0.3, proj: 0.08, mat: 'brownstone', tint: '#6d4d3f' }],
      cornice: { kind: 'bracketed', h: 1.4, proj: 0.7, mat: 'stone_lime', tint: '#d6cdb8', brackets: 4 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.6, coping: 'stone_lime' }, membrane: 'black' },
    refs: [], notes: 'The compiled footprint has a canted corner; the 2-storey bay window and the arched door next to it are approximated by plain windows.',
  },
  tenement({
    id: 'e125-16', addr: '16 E 125th St', name: 'Deli', at: [2503.29, -2529.3], comp: '4_-5:52', h: 13.45, n: 3, w: 6.1, baseH: 4.4,
    mat: 'brick_red', tint: '#815c4b', trim: '#b9a488', trimMat: 'stone_lime', cornTint: '#4c6f5c', fe: null, bays: 2, door: 1.3, shopName: 'DELI GRILL', signBg: '#2e9a3c', signFg: '#ffffff', refs: [],
  }),
  tenement({
    id: 'e125-18', addr: '18 E 125th St', name: null, at: [2507.94, -2524.88], comp: '4_-5:156', h: 13.48, n: 3, w: 6.2, baseH: 4.4,
    mat: 'brownstone', tint: '#6a4a3c', trim: '#7a5a4a', trimMat: 'brownstone', cornTint: '#4c3a30', fe: null, bays: 2, door: 1.4, shopName: 'shop', refs: [],
  }),
  tenement({
    id: 'e125-20', addr: '20 E 125th St', name: null, at: [2514.53, -2524.18], comp: '4_-5:5', h: 13.25, n: 3, w: 6.14, baseH: 4.4,
    mat: 'brownstone', tint: '#6e4c3e', trim: '#7d5c4c', trimMat: 'brownstone', cornTint: '#4c3a30', fe: null, bays: 3, door: 1.4, shopName: 'shop', refs: [],
  }),
  tenement({
    id: 'e125-22', addr: '22 E 125th St', name: 'Harlem Bubble Tea', at: [2519.81, -2521.27], comp: '4_-5:58', h: 13.31, n: 3, w: 5.96, baseH: 4.4,
    mat: 'brownstone', tint: '#66483b', trim: '#77574a', trimMat: 'brownstone', cornTint: '#2f5a4a', fe: null, bays: 2, door: 1.2, shopName: 'HARLEM BUBBLE TEA', signBg: '#2a1c14', signFg: '#f0a43a', refs: [],
  }),
  tenement({
    id: 'e125-24', addr: '24 E 125th St', name: 'Understand Medicare Now', at: [2524.88, -2517.43], comp: '4_-5:255', h: 13.52, n: 3, w: 6.59, baseH: 4.4,
    mat: 'brick_red', tint: '#95715d', trim: '#e7dfce', trimMat: 'stone_lime', cornTint: '#3d4a43', fe: [1], bays: 3, door: 1.4, shopName: 'UNDERSTAND MEDICARE NOW', signBg: '#151515', signFg: '#ffffff', lintel: 'hood', refs: [],
  }),
  {
    id: 'e125-26', addr: '26 E 125th St', name: 'retail space for rent', bin: null,
    at: [2529.52, -2507.82], comp: '4_-5:28', h: 16.39, status: 'draft',
    // b54 (1909): a three-storey ochre loft front: brown-and-white banded piers carrying paired windows under round arches, dark fascia over a glazed ground floor
    wall: { mat: 'brick_tan', tint: '#b79a6e', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 5.2, fascia: { h: 1.2, mat: 'panel_alu', tint: '#1b1b1c' }, bays: [
        shop(0.4, 5.0, { name: 'vacant', h: 4.0, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: null, interior: 'empty' }),
        shop(5.3, 10.4, { name: 'Retail space for rent', h: 4.0, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.45, w: 1.1, kind: 'double', recess: 0.6 }, interior: 'empty',
          sign: { kind: 'panel', text: 'RETAIL SPACE FOR RENT', font: 'Inter-700', fg: '#2b2b2b', bg: '#d9b648', u0: 3.0, u1: 7.6, y: 5.3, h: 0.65, fill: 0.5 } }),
      ] },
      bays: { n: 4, margin: [0.5, 0.5] },
      floors: [{ n: 1, h: 5.0, win: 'T' }, { n: 1, h: 4.6, win: 'T' }],
      windows: { T: { w: 2.0, h: 3.3, sill: 0.8, kind: 'ribbon', mullions: 1, frame: 'alu_black', glass: 'glass_grey', reveal: 0.18, lintel: null, sillStone: null, ac: 0, blinds: 0.2, lit: 0.2 } },
      piers: { mat: 'brick_tan', tint: '#d6c6a4', w: 0.65, proj: 0.12, at: 'bays', from: 'base', to: 'cornice', capital: true, base: false },
      bands: [{ at: 'floor:3', h: 0.4, proj: 0.1, mat: 'stone_lime', tint: '#d9ccb0' }, { at: 'floor:4', h: 0.5, proj: 0.14, mat: 'stone_lime', tint: '#d9ccb0' }],
      cornice: { kind: 'modillion', h: 1.6, proj: 0.8, mat: 'metal_painted', tint: '#4b4038' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'Loft building with a dark plate-glass ground floor; the round arched tops of the second-floor windows are simplified to rectangles.',
  },
  {
    id: 'e125-28', addr: '28 E 125th St (Madison Ave SE corner)', name: 'HD Wireless, UPS Store, N3xtflix & Grill', bin: null,
    at: [2544.16, -2500.08], comp: '4_-5:92', h: 19.05, status: 'draft',
    // b55 (1900): red brick with golden terracotta spandrels and arched cream hoods, fire escape, corner to Madison Avenue
    wall: { mat: 'brick_red', tint: '#8b6252', dirt: 0.4 },
    faces: [{
      edge: [2541.15, -2517.79, 2556.35, -2509.43],
      base: { h: 4.8, bays: [
        shop(0.3, 4.6, { name: 'N3xtflix & Grill', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.2, w: 1.0, recess: 0.6 }, interior: 'restaurant',
          sign: signOf('N3XTFLIX & GRILL', '#f2efe6', '#161616', 0.0, 4.8, 3.6, 0.9) }),
        shop(4.9, 8.6, { name: 'Hair Braiding', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'shop_clothing',
          sign: signOf('HAIR BRAIDING', '#f7d34a', '#b2245e', 4.9, 8.6, 3.6, 0.8) }),
        shop(8.9, 12.4, { name: 'The UPS Store', h: 3.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'pharmacy',
          sign: signOf('The UPS Store', '#f3c21c', '#3a2a1d', 8.9, 12.4, 3.6, 0.8) }),
        shop(12.7, 17.0, { name: 'HD Wireless', h: 3.5, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.45, w: 1.0, recess: 0.5 }, interior: 'shop_phone',
          sign: signOf('HD WIRELESS', '#ffd21a', '#23349a', 12.7, 17.0, 3.6, 0.95) }),
      ] },
      bays: { n: 4, margin: [0.6, 0.6] },
      floors: [{ n: 4, h: 3.35, win: 'A' }],
      windows: { A: win({ w: 1.05, h: 2.0, sill: 0.7, frame: 'alu_black', lights: '1/1', reveal: 0.16, lintel: lintelOf('keystone', '#e0d3b4', 0.3), sillStone: sillOf('#cdb982', 0.12, 0.06), ac: 0.2 }) },
      bands: [{ at: 'base', h: 0.5, proj: 0.1, mat: 'stone_lime', tint: '#d2c2a0' }, { at: 'floor:4', h: 0.3, proj: 0.06, mat: 'stone_lime', tint: '#d2c2a0' }],
      cornice: { kind: 'bracketed', h: 1.5, proj: 0.7, mat: 'metal_painted', tint: '#6a4a3a', brackets: 9 },
      fireEscape: { bays: [1, 2], floors: [1, 4], kind: 'balcony', drop: true, tint: '#1e2022' },
    }, {
      edge: 'corner',
      base: { h: 4.8, bays: [shop(1.0, 10.0, { name: 'corner shop', h: 3.5, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'shop_food' })] },
      bays: { n: 5, margin: [0.6, 0.6] },
      floors: [{ n: 4, h: 3.35, win: 'A' }],
      windows: { A: win({ w: 1.05, h: 2.0, sill: 0.7, frame: 'alu_black', lights: '1/1', reveal: 0.16, lintel: lintelOf('keystone', '#e0d3b4', 0.3), sillStone: sillOf('#cdb982', 0.12, 0.06), ac: 0.2 }) },
      bands: [{ at: 'base', h: 0.5, proj: 0.1, mat: 'stone_lime', tint: '#d2c2a0' }],
      cornice: { kind: 'bracketed', h: 1.5, proj: 0.7, mat: 'metal_painted', tint: '#6a4a3a', brackets: 8 },
    }],
    roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black' },
    refs: [], notes: 'The golden terracotta ornament on the spandrels and the arched hoods are not modelled (keystone lintels instead).',
  },


  // ------------------------------------------------------------------ Madison Avenue, south-east corner (54-58 E 125th)
  tenement({
    id: 'e125-56', addr: '1943 Madison Ave (corner sliver)', name: null, at: [2575.88, -2489.11], comp: '5_-5:142', h: 13.08, n: 3, w: 3.61, baseH: 4.4,
    mat: 'brick_tan', tint: '#9a8468', trim: '#7d6a55', trimMat: 'brownstone', cornTint: '#554638', fe: null, bays: 1, door: 1.2, ww: 0.95, shopName: 'shop', refs: [],
  }),
  tenement({
    id: 'e125-58', addr: '1943 Madison Ave', name: 'Beauty supply', at: [2580.59, -2485.99], comp: '5_-5:92', h: 13.07, n: 3, w: 6.09, baseH: 4.4,
    mat: 'brick_tan', tint: '#a78e70', trim: '#7d6a55', trimMat: 'brownstone', cornTint: '#554638', fe: null, bays: 2, door: 1.4, shopName: 'BEAUTY SUPPLY', signBg: '#f2efe8', signFg: '#c2232a', refs: [],
  }),
  {
    id: 'e125-54', addr: '54 E 125th St', name: 'Okis Soul Food Restaurant', bin: null,
    at: [2587.88, -2477.19], comp: '5_-5:84', h: 17.42, status: 'draft',
    // b58 (1926 front): three storeys of brown-red brick, three round-headed windows on the top floor, an ornate frieze and a segmental pediment
    wall: { mat: 'brick_brown', tint: '#7a4c38', dirt: 0.5 },
    faces: [{
      edge: 'front',
      base: { h: 4.6, bays: [
        shop(0.3, 5.4, { name: 'Beauty supply', h: 3.6, glazing: { bulkhead: 0.4, transom: 0.0, mullions: 3, frame: 'alu_bronze' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'shop_clothing',
          sign: signOf('BEAUTY', '#c2232a', '#f2efe8', 0.0, 5.6, 3.65, 0.9) }),
        shop(6.0, 10.6, { name: 'Okis Soul Food Restaurant', h: 3.5, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 3, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'restaurant',
          awning: { kind: 'fixed', color: '#e9701f', drop: 0.5, proj: 1.3 },
          sign: signOf('OKIS SOUL FOOD RESTAURANT', '#ffffff', '#b2231c', 6.0, 10.6, 3.65, 0.75) }),
        shop(11.0, 14.8, { name: 'Uptown Vegan', h: 3.5, glazing: { bulkhead: 0.5, transom: 0.0, mullions: 2, frame: 'alu_black' }, door: { u: 0.5, w: 1.0, recess: 0.5 }, interior: 'shop_food' }),
      ] },
      bays: { widths: [2.0, 3.7, 3.7, 3.7, 2.05] },
      floors: [{ n: 1, h: 4.1, win: 'Ar', bays: [1, 2, 3] }, { n: 1, h: 3.9, win: 'Ar2', bays: [1, 2, 3] }],
      windows: {
        Ar: win({ w: 1.2, h: 2.7, sill: 0.6, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('keystone', '#b98f6f', 0.28, 'brownstone'), sillStone: sillOf('#a07a5c', 0.12, 0.06, 'brownstone'), ac: 0.2 }),
        Ar2: win({ w: 1.2, h: 2.4, sill: 0.6, kind: 'arch', frame: 'alu_black', lights: '1/1', reveal: 0.2, lintel: lintelOf('keystone', '#b98f6f', 0.28, 'brownstone'), sillStone: sillOf('#a07a5c', 0.12, 0.06, 'brownstone'), ac: 0.1 }),
      },
      bands: [{ at: 'base', h: 0.5, proj: 0.14, mat: 'brownstone', tint: '#a07a5c' }, { at: 'floor:3', h: 0.35, proj: 0.1, mat: 'brownstone', tint: '#a07a5c' }],
      cornice: { kind: 'dentil', h: 2.0, proj: 0.6, mat: 'brownstone', tint: '#b09277' },
      parapet: { kind: 'segmental', u0: 4.5, u1: 10.6, rise: 1.3, coping: 'brownstone', copingTint: '#a0866c' },
    }],
    roof: { kind: 'flat', parapet: { h: 1.6, coping: 'stone_lime' }, membrane: 'black' },
    refs: [], notes: 'The segmental pediment above the cornice and the gilded ornaments are not drawn; the two side bays are blind brick.',
  },

  // ------------------------------------------------------------------ Second Avenue, north-east corner: the BP station
  {
    id: 'e125-bp', addr: '2449 Second Ave (BP gas station)', name: 'BP', bin: null,
    at: [3158.73, -2220.23], comp: '6_-5:35', also: [[3154.86, -2242.17]], h: 4.5, status: 'draft', custom: 'east:gasStation',
    refs: [], notes: 'Flat-roofed canopy on two steel columns (green and white BP band), two pump islands, a kiosk and a garage bay behind. Canopy size estimated.',
  },

  // ------------------------------------------------------------------ First Avenue, south side: the lots behind green-tarp chain-link fences (b81-b84 are compiled as 1-storey sheds)
  ...[['a', [3229.08, -2090.26], '6_-5:37'], ['b', [3238.66, -2085.18], '6_-5:14'], ['c', [3246.69, -2084.98], '6_-5:38'], ['d', [3251.2, -2078.17], '6_-5:30']].map(([k, at, comp]) => ({
    id: `e125-lot-1st-${k}`, addr: '2435 First Ave (vacant lot)', name: 'fenced lot', bin: null, at, comp, h: 2.6, status: 'draft',
    custom: 'east:hoarding', site: { kind: 'tarp', h: 2.6, inset: 0.35 },
    refs: [], notes: '2026-08: chain-link fence with a green windscreen tarp on precast barriers; the compiled 1975 sheds no longer stand.',
  })),
];
