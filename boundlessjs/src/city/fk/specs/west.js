// AR33 building specs, segment west: 12th Avenue (Dinosaur Bar-B-Que) to Morningside Avenue (schema: docs/notes/ar33-spec.md; inventory: docs/notes/ar33-frontage/west.json).
// Owner: the WEST worker (docs/notes/ar33-west.md). References under boundlessjs/shots/ar33/west/refs; the
// ------------------------------------------------------------------ helpers for the plain frontages
// a walk-up tenement face: stores in the base, n floors of punched 1/1 sash in equal bays, fire escapes, a cornice
const DH = (o = {}) => ({ w: o.w ?? 1.05, h: o.h ?? 1.7, sill: o.sill ?? 0.8, kind: 'dh', lights: o.lights || '1/1', frame: o.frame || 'alu_white',
  reveal: 0.14, lintel: { kind: o.lintel || 'flat', mat: o.lintelMat || 'stone_lime', h: 0.22 }, sillStone: { mat: o.lintelMat || 'stone_lime', h: 0.1, proj: 0.05 },
  ac: o.ac ?? 0.35, blinds: 0.55, lit: 0.35 });
const STORE = (u0, u1, name, sign, x = {}) => ({ u0, u1, kind: 'store', name, h: x.h ?? 3.4, sign,
  glazing: { bulkhead: 0.45, transom: 0.4, mullions: x.mullions ?? 2, frame: x.frame || 'alu_clear' }, door: x.door === undefined ? { u: x.du ?? 0.8, w: 1.0 } : x.door,
  interior: x.interior || 'shop_food', gate: x.gate || { kind: 'rolldown', down: x.down ?? 0 }, awning: x.awning, vinyl: x.vinyl, lit: x.lit ?? 1 });
const SGN = (text, fg, bg, u0, u1, x = {}) => ({ kind: x.kind || 'panel', text, font: x.font || 'Oswald-600', fg, bg, u0, u1, y: x.y ?? 3.45, h: x.h ?? 0.7,
  lit: x.lit || (x.kind === 'lightbox' ? 'face' : 'none'), sub: x.sub, logo: x.logo, logoAt: x.logoAt });
const TEN = (o) => ({
  id: o.id, addr: o.addr, name: o.name || null, bin: null, at: o.at, comp: o.comp, h: o.h, status: o.status || 'draft',
  wall: { mat: o.brick || 'brick_buff', tint: o.tint || '#bfa27a', dirt: o.dirt ?? 0.45 },
  faces: [{
    edge: o.edge || 'front',
    base: { h: o.baseH ?? 4.2, fascia: o.fascia || null, bays: o.stores || [], piers: o.piers },
    floors: o.floors === 0 ? [] : [{ n: o.floors ?? 5, h: o.fh ?? 3.05, win: 'A' }],
    bays: { n: o.bays ?? 4, margin: [0.7, 0.7] },
    windows: { A: o.win || DH(o.dh) },
    fireEscape: o.fe ? { bays: o.fe, floors: [1, o.floors ?? 5], kind: 'balcony', drop: true } : undefined,
    bands: o.bands, graffiti: o.graffiti, items: o.items,
    cornice: o.cornice === null ? { kind: 'none' } : { kind: o.cornice || 'bracketed', h: o.cornH ?? 0.9, proj: o.cornP ?? 0.6, mat: o.cornMat || 'panel_alu', tint: o.cornTint || '#6b5a48', brackets: Math.max(4, (o.bays ?? 4) + 2) },
  }],
  roof: o.roof,
  refs: o.refs || [], notes: o.notes || '',
});
// side and rear walls in grey cement parging over the common brick (the exposed side wall of a tenement over a lower
// neighbour), the 125th face keeps the spec's brick
const PARGED = (s, tint = '#8f8e8a') => { s.faces[0].wall = { ...s.wall }; s.wall = { mat: 'stucco', tint, dirt: 0.55 }; return s; };
const R800 = 'west33/w33_m800_5O7Aege21yl6JWhRNz8FXA_202608.jpg h56 p14 f100 (n800)';
const R660 = 'west33/w33_m660_G-IIADSJHHs5NMrcVh0fMw_202608.jpg h56 p14 f100 (n660)';
const R540 = 'west33/w33_m540_rB36zTkONwCgnftKjA_6ZA_202608.jpg h56 p14 f100 (n540)';
const R580 = '';
const R920 = 'west33/w33_m920__yJO92l4-9Pi_dm5XNJ28g_202308.jpg h50 p14 f100 (n920)';
const RAM = 'west33/w33_amst_FE2VSSGonFxqCfZ9A0qlnQ_202608.jpg h20 / h120 p14 f100 (amst_n, amst_e)';

export default [
  // ------------------------------------------------------------------ south-west side, 12th Avenue to Broadway
  {
    id: 'w125-700', addr: '700 W 125th St (69 St Clair Pl)', name: 'Dinosaur Bar-B-Que', bin: null,
    at: [859.1, -3875.6], comp: '1_-8:15',
    h: 9.9,                       // coping top over the 125th Street sidewalk (dino_ne_22: sills 6.0, heads 8.15, coping 9.9)
    status: 'measured',
    custom: 'west:dino',          // the whole building: fk/custom/west.js dino()
    wall: { mat: 'brick_red', tint: '#8a4434', dirt: 0.4, bond: 'running' },
    refs: [],
    notes: 'Two-storey brick meatpacking building (1926), the restaurant at the 125th Street end, Floridita under the old ' +
      'loading dock canopy on the SE face. Frieze of a soldier course and stack-bond basketweave with white mortar over ' +
      'the second-floor window heads, all round. No neon roof signs: three billboard structures on the roof (invented ' +
      'brands here). Unknowns: the SE face storefront positions come from one oblique (+-0.5 m); the SW end is not seen; ' +
      'the billboard heights are estimates (bulletins 14.6 x 4.27 m).',
  },
  {
    id: 'w125-656', addr: '656 W 125th St', name: 'Cotton Club', bin: null,
    at: [917.1, -3833.4], comp: '1_-8:14',
    h: 4.3, status: 'measured',
    custom: { fn: 'west:cottonTop', with: 'kit' },
    // 154, 150), lower (140, 145, 140) under the overcast and the trees, a grey splash zone at the foot, a black tag on the
    // NW end): dirtier paint, tags at the NW end
    // (s2r1: the weather painter turned the white paint grey with dark runs and white flecks: the paint only, dirtier)
    // (s2r2 q0140Nx: still (232, 229, 224), std 3: flat; the paint over masonry, worn: MATS's painted brick set)
    wall: { mat: 'brick_painted', tint: '#e6e5df', dirt: 0.55 },
    faces: [{
      edge: 'front',
      base: { h: 3.9, bays: [
        // w2b3: the canopy is a marquee out toward the curb on posts (cottonTop draws it), not the kit's dome on the wall
        { u0: 1.4, u1: 3.4, kind: 'entrance', door: { kind: 'double', w: 1.7, recess: 0.35, h: 2.35 } },
      ] },
      floors: [],
      graffiti: [{ u0: 23.8, u1: 25.3, y0: 1.0, y1: 2.1, density: 0.2, style: 'throwups', bandTop: 0.1, seed: 657 }],
    }],
    roof: { kind: 'flat', parapet: { h: 0.35, coping: 'metal' }, membrane: 'black' },
    refs: [],
    notes: 'A low white-painted block building, one storey (~4 m), behind street trees; a black canopy with the round ' +
      '"CC" mark over the door "656" at the SE end; a tall billboard on steel posts over the NW half, face to the ' +
      'parkway (cottonTop). The AR32 build\'s "COTTON CLUB" neon board was from memory and is not verified. Open: ' +
      'the CC mark on the canopy (the kit awning has no sign slot), the side walls.',
  },
  {
    id: 'w125-632', addr: '632 W 125th St (628 W 125th St lot)', name: 'Prentis Hall (Columbia; the Sheffield Farms plant)', bin: null,
    at: [981.5, -3710.1], comp: '1_-8:12',
    h: 19.0, status: 'measured',
    wall: { mat: 'terracotta_cream', tint: '#e6e2d7', dirt: 0.3 },
    faces: [{
      edge: 'front',
      rustication: { to: 'base', mat: 'terracotta_cream', joint: 0.3, block: 0.9 },
      base: { h: 6.6, bays: Array.from({ length: 12 }, (_, j) => {
        const a = 0.9 + 4.52 * j + 0.45, b = a + 4.52 - 0.9;
        if (j === 10) return { u0: a, u1: b, kind: 'store', h: 4.2, door: { kind: 'solid', w: 2.8 }, gate: { kind: 'rolldown', down: 0.95, color: '#707274' }, interior: 'empty', lit: 0.2 };
        if (j === 2) return { u0: a, u1: b, kind: 'entrance', h: 4.6, door: { kind: 'double', w: 2.0, recess: 0.7, transom: 0.8 } };
        return { u0: a, u1: b, kind: 'window', h: 4.6, glazing: { bulkhead: 0.9, transom: 1.2, mullions: 3, frame: 'alu_black' }, interior: 'office', gate: { kind: 'none' }, lit: 0.6 };
      }) },
      bays: { n: 12, margin: [0.9, 1.0] },
      // w2r1: floors 2-3 are one round-arched opening per bay (prentis26: glazing from 7.1 m, the dark green louvred
      // spandrel 9.7-11.05 m, the crown at 13.5 m under the mid cornice), drawn with the kit's arch + spandrel
      floors: [{ n: 1, h: 7.9, win: 'A' }, { n: 1, h: 3.5, win: 'C' }],
      windows: {
        A: { w: 3.1, h: 6.4, sill: 0.5, kind: 'arch', mullions: 2, frame: { mat: 'alu_black', tint: '#2d3a32' }, reveal: 0.32,
          spandrel: { at: 2.6, h: 1.35, tint: '#2d3a32' },
          lintel: { kind: 'keystone', mat: 'terracotta_cream', tint: '#e1dccf', h: 0.38, proj: 0.08 },
          sillStone: { mat: 'terracotta_cream', tint: '#e1dccf', h: 0.14, proj: 0.06 }, blinds: 0.25, lit: 0.55 },
        B: { w: 3.1, h: 2.5, sill: 0.15, kind: 'fixed', mullions: 2, frame: { mat: 'alu_black', tint: '#2d3a32' }, reveal: 0.28,
          lintel: { kind: 'keystone', mat: 'terracotta_cream', tint: '#e1dccf', h: 0.55 }, sillStone: null, blinds: 0.25, lit: 0.55 },
        C: { w: 2.5, h: 1.9, sill: 1.1, kind: 'dh', lights: '2/2', frame: { mat: 'alu_black', tint: '#2d3a32' }, reveal: 0.2,
          lintel: { kind: 'flat', mat: 'terracotta_cream', h: 0.25 }, sillStone: { mat: 'terracotta_cream', h: 0.12, proj: 0.05 }, ac: 0.2, lit: 0.4 },
      },
      piers: { mat: 'terracotta_cream', tint: '#e8e4da', w: 0.75, proj: 0.14, at: 'bays', from: 'base', to: 'cornice' },
      bands: [{ at: 'base', h: 0.45, proj: 0.12, mat: 'terracotta_cream' }, { at: 14.5, h: 1.15, proj: 0.42, mat: 'terracotta_cream' }],
      cornice: { kind: 'modillion', h: 1.1, proj: 0.6, mat: 'terracotta_cream', tint: '#e4dfd3' },
    }],
    roof: { kind: 'flat', parapet: { h: 0.9, coping: 'terracotta' }, membrane: 'gravel', items: [{ k: 'bulkhead', at: [0.55, 0.45], w: 5, d: 4, h: 3 }] },
    refs: [],
    notes: 'White glazed terra cotta, 1909. Measured on prentis_26: bays at 4.52 m (12), floor-2 glazing 7.1-9.7 m, a dark ' +
      'green louvred spandrel 9.7-11.05 m, the floor-3 glazing to the arch at 13.5 m, the mid cornice 14.0-15.4 m, floor 4 ' +
      'above. Open: the openings are ROUND-ARCHED over floors 2-3 with ornamented archivolts and console keystones (the ' +
      'kit draws rectangles: request to KIT); the spandrel panels; the parapet piers with finials; a 2026 sidewalk shed ' +
      'hides the ground floor (not built).',
  },
  {
    id: 'w125-bway-sw', addr: 'SW corner of Broadway and W 125th St (tower; address to confirm)', name: null, bin: null,
    at: [1047.2, -3623.5], comp: '2_-8:132',
    h: 122.8, status: 'draft',
    wall: { mat: 'panel_alu', tint: '#eceeec', dirt: 0.12 },
    faces: [{
      edge: 'front',
      base: { h: 7.4, bays: [
        { u0: 0.6, u1: 9.6, kind: 'store', h: 6.6, glazing: { bulkhead: 0.3, transom: 2.2, mullions: 3, frame: 'alu_clear' }, door: { u: 0.2, w: 1.8, kind: 'double' }, interior: 'shop_clothing', gate: { kind: 'none' } },
        { u0: 10.2, u1: 19.6, kind: 'store', h: 6.6, glazing: { bulkhead: 0.3, transom: 2.2, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.8, kind: 'double' }, interior: 'restaurant', gate: { kind: 'none' } },
        { u0: 20.2, u1: 29.0, kind: 'store', h: 6.6, glazing: { bulkhead: 0.3, transom: 2.2, mullions: 3, frame: 'alu_clear' }, door: { u: 0.8, w: 1.8, kind: 'double' }, interior: 'shop_phone', gate: { kind: 'none' } },
      ], piers: { at: [9.9, 19.9], w: 0.6, mat: 'panel_alu', tint: '#f2f3f2' } },
      bays: { n: 7, margin: [0.6, 0.6] },
      floors: [{ n: 37, h: 3.12, win: 'A' }],
      windows: { A: { w: 2.3, h: 2.35, sill: 0.45, kind: 'fixed', mullions: 1, frame: 'alu_clear', glass: 'glass_blue', reveal: 0.12, lintel: null, sillStone: null, blinds: 0.35, lit: 0.45 } },
    }],
    refs: [],
    notes: 'White metal-panel tower over a glazed double-height base with slender white columns; windows in vertical ' +
      'pairs and triples. Open: the setbacks (a podium of ~8 floors under the tower), the exact window grouping, the ' +
      'shops (a blue sign at the corner not yet read), the address.',
  },
  {
    id: 'w125-3181bway', addr: '3181 Broadway', name: null, bin: null,
    at: [1033.5, -3600.2], comp: '2_-8:44',
    h: 24.7, status: 'draft',
    wall: { mat: 'brick_tan', tint: '#a88b6a', dirt: 0.4 },
    refs: [],
    notes: 'Six-storey tan brick apartment house (1926) on Broadway behind the tower; only a 7.9 m sliver faces 125th.',
  },
  // ------------------------------------------------------------------ north-east side, 12th Avenue to Broadway
  {
    id: 'w125-2286-12av', addr: '2286 12th Ave', name: null, bin: '1059983',
    at: [908.0, -3940.0], comp: '1_-8:2',
    h: 9.5, status: 'draft',
    wall: { mat: 'brick_brown', tint: '#7d4a36', dirt: 0.5 },
    // w2b3: the parkway faces carry dense graffiti in n12av_26 (arb_dX 2026-08, levelled: throw-ups and pieces over the old
    // brick from the foot to the top, silver, white and black with a few colour fills); the faces named by their ring
    // segment (frontage #0's W face; #1 has its own spec below: b3r7 showed 'also' resolves a face on #0's ring only). The
    // whole height is the base (no openings) so the paint reaches the top. The massing is still the compiled block: open
    faces: [
      { edge: [889.86, -3941.62, 898.09, -3953.74], floors: [], base: { h: 9.0, bays: [] },
        graffiti: [{ u0: 0.3, u1: 14.3, y0: 0.2, y1: 8.6, density: 0.9, style: 'throwups', seed: 22861 }, { u0: 0.3, u1: 14.3, y0: 0.2, y1: 3.0, density: 0.7, style: 'piece', seed: 22862 },
          { u0: 0.3, u1: 14.3, y0: 4.2, y1: 8.8, density: 0.8, style: 'throwups', seed: 22865 }] },
    ],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'metal' }, membrane: 'black', items: [{ k: 'hvac', at: [0.5, 0.5], n: 2 }] },
    refs: [],
    notes: 'Two-storey brick industrial building behind the planted plaza at 12th Avenue, a billboard on a tall frame over ' +
      'its roof (a real ad in 2023: to be drawn as an invented brand). Open: its faces are seen only across the plaza.',
  },
  {
    id: 'w125-2286-12av-b', addr: '2286 12th Ave (the second lot)', name: null, bin: null,
    at: [898.9, -3933.1], h: 9.5, status: 'draft',
    wall: { mat: 'brick_brown', tint: '#7d4a36', dirt: 0.5 },
    // w2b3: its SW face toward the parkway, painted as n12av_26 shows (see w125-2286-12av)
    faces: [
      { edge: [904.55, -3916.09, 888.41, -3939.5], floors: [], base: { h: 9.0, bays: [] },
        graffiti: [{ u0: 0.3, u1: 28.1, y0: 0.2, y1: 8.6, density: 0.85, style: 'throwups', seed: 22863 }, { u0: 0.3, u1: 28.1, y0: 0.2, y1: 2.8, density: 0.6, style: 'piece', seed: 22864 },
          { u0: 0.3, u1: 28.1, y0: 4.2, y1: 8.8, density: 0.75, style: 'throwups', seed: 22866 }] },
    ],
    roof: { kind: 'flat', parapet: { h: 0.8, coping: 'metal' }, membrane: 'black' },
    refs: [],
    notes: 'The second footprint of 2286 12th Ave (frontage #1), split from w125-2286-12av\'s also so its parkway face can be named.',
  },
  {
    id: 'w125-forum', addr: '605 W 125th St (3207 Broadway)', name: 'The Bollinger Forum (Columbia University)', bin: null,
    at: [1080.1, -3678.1], comp: '2_-8:117',
    h: 18.3, status: 'measured',
    custom: 'west:forum',
    refs: [],
    notes: 'Renzo Piano, 2018. Measured on forum_26: columns at 6.5 m (u 21.2 .. 47.4), band 5.1-7.0 m, floor lines 7.4 ' +
      'and 11.8 m, the concrete box from u 35.4 with slots u 36.8-43.8 (8.4-11.0 m). Open: the top floor and roof terrace ' +
      'are guessed; the Broadway and rear faces are not measured yet (built as the same ' +
      'system); the glass has a finer mullion rhythm than 1.5 m in places.',
  },
  {
    id: 'w125-kravis', addr: '665 W 130th St (faces 125th across the 12th Avenue plaza)', name: 'Henry R. Kravis Hall (Columbia Business School)', bin: null,
    at: [984.2, -3905.6], h: 52.2, floors: 11, status: 'measured',
    custom: 'west:kravis',
    wall: { mat: 'alu_clear', tint: '#cfd3d4' },
    refs: [],
    notes: 'Diller Scofidio + Renfro, 2022 (custom kravis, w2b3): a set-back two-storey glass lobby, then two-storey cycles ' +
      'of a projecting fritted-glass tray (white slab edge and cap, the cap kinked along each face, prows at some corners) ' +
      'over a recessed strip of dark vision glass with curved corners, a fritted screen round the roof plant. Measured on ' +
      'kravis23 at the ring distance: tray soffits 9.0 / 18.5 / 28.7 / 38.5 m (cycle 9.8 m), tops 7.4-7.8 m over the soffit ' +
      'at the W end, 5.6-6.2 m east of a step at u 11-14 m on the S face. The top ~51 m on n12av_26 (the parkway deck, ' +
      '2026-08): four cycles and the screen, h 52.2 to the screen top, the roof at 48.2 (the compiled 38.4 m is low). ' +
      'Open: the kink pattern on the E, N and W faces and the prows other than tray 1 SE are from the oblique, not measured.',
  },
  // ------------------------------------------------------------------ north-east side, Broadway to Old Broadway
  {
    id: 'w125-3200bway', addr: '3200 Broadway', name: 'Chase (corner)', bin: null,
    at: [1131.3, -3624.7], comp: '2_-8:57',
    h: 20.7, status: 'draft',
    wall: { mat: 'brick_buff', tint: '#c3a67d', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.3, fascia: { h: 0.95, mat: 'panel_alu', tint: '#1f5aa0' }, bays: [
        { u0: 0.4, u1: 14.2, kind: 'store', name: 'Chase', h: 4.1,
          sign: { kind: 'channel', text: 'CHASE', font: 'Inter-700', fg: '#ffffff', bg: null, logo: 'west:chase', logoAt: 'left', u0: 4.2, u1: 10.4, y: 4.45, h: 0.62, lit: 'face' },
          glazing: { bulkhead: 0.35, transom: 0.6, mullions: 4, frame: 'alu_clear' }, door: { u: 0.85, w: 1.8, kind: 'double' }, interior: 'bank', gate: { kind: 'none' } },
      ] },
      floors: [{ n: 5, h: 3.05, win: 'A' }],
      bays: { n: 5, margin: [0.8, 0.8] },
      windows: { A: { w: 1.1, h: 1.7, sill: 0.8, kind: 'dh', lights: '1/1', frame: 'alu_white', lintel: { kind: 'flat', mat: 'stone_lime', h: 0.22 }, ac: 0.35 } },
      fireEscape: { bays: [2], floors: [1, 5], kind: 'balcony', drop: true },
      cornice: { kind: 'bracketed', h: 0.9, proj: 0.55, mat: 'metal_painted', tint: '#6f5a46', brackets: 6 },
    }, {
      edge: 'corner',
      base: { h: 4.3, fascia: { h: 0.95, mat: 'panel_alu', tint: '#1f5aa0' }, bays: [
        { u0: 0.5, u1: 9.5, kind: 'window', h: 4.1, glazing: { bulkhead: 0.35, transom: 0.6, mullions: 3, frame: 'alu_clear' }, interior: 'bank', gate: { kind: 'none' } },
      ] },
      floors: [{ n: 5, h: 3.05, win: 'A' }],
      bays: { n: 4, margin: [0.8, 0.8] },
      windows: { A: { w: 1.1, h: 1.7, sill: 0.8, kind: 'dh', lights: '1/1', frame: 'alu_white', lintel: { kind: 'flat', mat: 'stone_lime', h: 0.22 }, ac: 0.35 } },
      cornice: { kind: 'bracketed', h: 0.9, proj: 0.55, mat: 'metal_painted', tint: '#6f5a46', brackets: 4 },
    }],
    refs: [],
    notes: 'Six-storey buff brick tenement (1901) on the NE corner of Broadway; Chase branch across the ground floor (blue ' +
      'fascia, white letters and the octagon mark, drawn here). Open: the Broadway face and the corner splay not ' +
      'measured yet; window count estimated.',
  },
  {
    id: 'w125-567', addr: '567 W 125th St', name: 'Red Olive Deli', bin: null,
    at: [1129.7, -3605.4], comp: '2_-8:36',
    h: 19.9, status: 'draft',
    wall: { mat: 'brick_buff', tint: '#b99a70', dirt: 0.45 },
    faces: [{
      edge: 'front',
      base: { h: 4.2, bays: [
        { u0: 0.3, u1: 6.9, kind: 'store', h: 3.4, sign: { kind: 'panel', text: 'MINI MARKET', font: 'Oswald-600', fg: '#ffffff', bg: '#b0161b', u0: 0.4, u1: 6.8, y: 3.45, h: 0.7 },
          glazing: { bulkhead: 0.45, transom: 0.4, mullions: 2, frame: 'alu_clear' }, door: { u: 0.8, w: 1.0 }, interior: 'shop_food', gate: { kind: 'rolldown', down: 0 } },
        { u0: 7.1, u1: 15.0, kind: 'store', name: 'Red Olive Deli', h: 3.4,
          sign: { kind: 'lightbox', text: 'RED OLIVE DELI', font: 'Anton', fg: '#e8231d', bg: '#0e0e0e', u0: 7.2, u1: 14.9, y: 3.45, h: 0.72, lit: 'face',
            sub: { text: 'DELI  •  GRILL  •  COFFEE  •  SALAD BAR  •  FRESH JUICE', font: 'Inter-600', fg: '#ffffff', size: 0.16 } },
          glazing: { bulkhead: 0.45, transom: 0.4, mullions: 3, frame: 'alu_clear' }, door: { u: 0.25, w: 1.0 }, interior: 'shop_food', gate: { kind: 'rolldown', down: 0 } },
      ] },
      floors: [{ n: 5, h: 3.05, win: 'A' }],
      bays: { n: 5, margin: [0.7, 0.7] },
      windows: { A: { w: 1.1, h: 1.7, sill: 0.8, kind: 'dh', lights: '1/1', frame: 'alu_white', lintel: { kind: 'flat', mat: 'stone_lime', h: 0.22 }, ac: 0.35 } },
      fireEscape: { bays: [1, 2], floors: [1, 5], kind: 'balcony', drop: true },
      cornice: { kind: 'bracketed', h: 1.0, proj: 0.6, mat: 'metal_painted', tint: '#5a2a22', brackets: 7 },
    }],
    refs: [],
    notes: 'Six-storey buff brick tenement; the dark red-brown bracketed cornice; fire escapes over the middle bays; the ' +
      'Red Olive Deli lightbox (red letters on black, a white line of services under it). Open: the left shop\'s name ' +
      '(a red sign, not legible at this angle).',
  },
  {
    id: 'w125-565', addr: '565 W 125th St (Old Broadway corner)', name: 'City Prime Health', bin: null,
    at: [1143.9, -3593.0], comp: '2_-8:74',
    h: 19.5, status: 'draft',
    wall: { mat: 'brick_buff', tint: '#c7ac80', dirt: 0.4 },
    faces: [{
      edge: 'front',
      base: { h: 4.3, fascia: { h: 0.85, mat: 'panel_alu', tint: '#123e86' }, bays: [
        { u0: 0.4, u1: 6.4, kind: 'entrance', door: { kind: 'double', w: 1.8, recess: 0.4 }, sign: { kind: 'panel', text: 'FIRST COMMUNITY HEALTH', font: 'Montserrat-600', fg: '#ffffff', bg: null, u0: 0.6, u1: 6.2, y: 4.5, h: 0.4 } },
        { u0: 6.6, u1: 15.0, kind: 'store', name: 'City Prime Health', h: 4.1,
          sign: { kind: 'channel', text: 'City Prime Health', font: 'Montserrat-700', fg: '#ffffff', bg: null, logo: 'west:cityPrime', logoAt: 'left', u0: 7.4, u1: 14.6, y: 4.42, h: 0.62, lit: 'face' },
          glazing: { bulkhead: 0.5, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: null, interior: 'pharmacy', gate: { kind: 'none' },
          vinyl: [{ text: 'INTERNAL MEDICINE', color: '#1f5fb0', u: 0.6, y: 1.3 }] },
      ] },
      floors: [{ n: 5, h: 3.05, win: 'A' }],
      bays: { n: 5, margin: [0.7, 0.7] },
      windows: { A: { w: 1.1, h: 1.7, sill: 0.8, kind: 'dh', lights: '1/1', frame: 'alu_white', lintel: { kind: 'flat', mat: 'stone_lime', h: 0.22 }, ac: 0.4 } },
      fireEscape: { bays: [1], floors: [1, 5], kind: 'balcony', drop: true },
      bands: [{ at: 'floor:2', h: 0.3, proj: 0.05, mat: 'stone_lime' }],
      cornice: { kind: 'bracketed', h: 0.9, proj: 0.6, mat: 'metal_painted', tint: '#b8a888', brackets: 7 },
    }],
    refs: [],
    notes: 'Six-storey buff brick tenement on the Old Broadway corner with quoins; the corner store City Prime Health under a ' +
      'blue fascia (white letters, the petal mark, drawn here), First Community Health beside it. Open: the Old Broadway ' +
      'face; the quoins and the rusticated second floor are not in the kit spec yet.',
  },
  {
    id: 'w125-564w126', addr: '564 W 126th St (a sliver on 125th)', name: null, bin: null,
    at: [1138.3, -3656.2], comp: '2_-8:7',
    h: 19.2, status: 'draft',
    wall: { mat: 'brick_buff', tint: '#b89c74', dirt: 0.45 },
    notes: 'Six-storey tenement on W 126th St whose 5.1 m side shows on 125th behind 3200 Broadway: plain wall.',
  },
  {
    id: 'w125-71stclair', addr: '71 St Clair Pl', name: 'Pedego Electric Bikes', bin: null,
    at: [858.6, -3908.8], comp: '1_-8:17',
    h: 4.4, status: 'draft',
    wall: { mat: 'brick_red', tint: '#74402f', dirt: 0.5 },
    faces: [{
      edge: 'front',
      wall: { mat: 'stucco', tint: '#e9e8e3', dirt: 0.3 },
      base: { h: 4.0, bays: [{ u0: 0.15, u1: 2.3, kind: 'store', h: 3.0, name: 'Pedego Electric Bikes',
        sign: { kind: 'panel', text: 'PEDEGO', font: 'Montserrat-700', fg: '#ffffff', bg: '#111111', u0: 0.1, u1: 2.36, y: 3.05, h: 0.8,
          sub: { text: 'ELECTRIC BIKES', font: 'Inter-700', fg: '#ffffff', size: 0.2 } },
        // AR34 w2 s3: PurSBCT2 shows the gate down, painted green with a bicycle
        glazing: { bulkhead: 0.55, transom: 0.2, mullions: 0, frame: 'alu_black' }, door: null, interior: 'shop_phone', gate: { kind: 'rolldown', down: 1, color: '#2f7d5c' } }] },
      floors: [],
    }],
    roof: { kind: 'flat', parapet: { h: 0.3, coping: 'metal' }, membrane: 'black' },
    refs: [],
    notes: 'A one-storey shop tucked under the Henry Hudson Parkway bridge beside the Dinosaur: white pilasters, a black ' +
      'fascia "PEDEGO / ELECTRIC BIKES" with a green bike icon (2022-03). Open: whether ' +
      'the shop is still there; its main front may be the 18.4 m NNE edge rather than the 2.5 m 125th sliver.',
  },
  // ------------------------------------------------------------------ north-east side, Old Broadway to Amsterdam Avenue
  TEN({ id: 'w125-1oldbway', addr: '1 Old Broadway', name: 'Miegamat Laundromat', at: [1166.7, -3566.7], comp: '2_-7:41', h: 5.0, floors: 0, baseH: 4.4, brick: 'stucco', tint: '#d9d2c4',
    stores: [STORE(0.4, 6.6, 'Miegamat Laundromat', SGN('MIEGAMAT LAUNDROMAT', '#f2d23b', '#1f4fa3', 0.4, 6.6, { font: 'Anton', h: 0.75, y: 3.35, sub: { text: 'WASH & FOLD  \u2022  OPEN 24 HOURS 7 DAYS A WEEK', font: 'Inter-700', fg: '#ffffff', size: 0.18 } }), { awning: { kind: 'fixed', color: '#1f4fa3', proj: 1.2, drop: 0.45 }, interior: 'shop_phone', gate: { kind: 'rolldown', down: 0.95 } }),
      STORE(6.9, 11.8, null, null, { door: null, interior: 'empty', gate: { kind: 'rolldown', down: 1 }, lit: 0 }),
      STORE(12.0, 17.8, null, SGN('', '#ffffff', '#b3262b', 12.1, 17.7, { h: 0.7, y: 3.45 }), { door: null, interior: 'empty', gate: { kind: 'rolldown', down: 1 }, lit: 0 })],
    cornice: null, roof: { kind: 'flat', parapet: { h: 0.5, coping: 'metal' }, membrane: 'black', items: [{ k: 'hvac', at: [0.5, 0.6], n: 2 }] },
    refs: [],
    notes: 'One-storey 1962 retail strip on the Old Broadway corner: the Miegamat Laundromat under a blue awning (yellow letters, WASH & FOLD / OPEN 24 HOURS), then shuttered stores under a red fascia (2024-08).' }),
  TEN({ id: 'w125-551', addr: '551 W 125th St', at: [1167.3, -3546.7], comp: '2_-7:111', h: 18.1, floors: 4, fh: 3.2, bays: 3, tint: '#b49775',
    stores: [STORE(0.4, 11.0, null, null, { interior: 'shop_clothing' })], fe: [1],
    notes: 'Five-storey 1901 walk-up (class N2). Bays and shop from the lot facts.' }),
  TEN({ id: 'w125-543', addr: '543 W 125th St', at: [1175.7, -3533.7], comp: '2_-7:7', h: 20.2, floors: 5, bays: 6, brick: 'brick_red', tint: '#8a4a3a',
    stores: [STORE(0.4, 10.6, null, null, { interior: 'shop_food' }), { u0: 10.8, u1: 12.6, kind: 'entrance', door: { kind: 'solid', w: 1.1 } }, STORE(12.8, 21.4, null, null, { interior: 'shop_clothing' })],
    fe: [1, 4], refs: [R540], notes: 'Six-storey red brick apartment house (1926), fire escapes over two bays (n540, left edge).' }),
  TEN({ id: 'w125-541', addr: '541 W 125th St', name: 'Manhattan Pentecostal Church', at: [1190.7, -3519.8], comp: '2_-7:152', h: 8.7, floors: 1, fh: 4.0, bays: 3,
    brick: 'stucco', tint: '#3f5a4f', baseH: 4.3,
    stores: [{ u0: 0.5, u1: 14.9, kind: 'store', h: 3.9, name: 'Manhattan Pentecostal Church',
      sign: SGN('MANHATTAN PENTECOSTAL CHURCH', '#f2f2f2', null, 1.0, 14.4, { kind: 'channel', font: 'Archivo-700', y: 3.95, h: 0.42 }),
      glazing: { bulkhead: 0.2, transom: 0.9, mullions: 6, frame: 'alu_black' }, door: { u: 0.5, w: 1.8, kind: 'double' }, interior: 'empty', gate: { kind: 'none' }, lit: 0.6 }],
    win: { w: 4.2, h: 2.4, sill: 0.8, kind: 'fixed', mullions: 3, frame: 'alu_black', reveal: 0.12, lintel: null, sillStone: null, lit: 0.4 },
    cornice: 'band', cornTint: '#34473f', refs: [R540],
    notes: 'Two storeys, a dark green painted front with pilasters; a wall of black steel-grid glazed doors on the ground floor; white letters.' }),
  TEN({ id: 'w125-537', addr: '537 W 125th St', name: 'Benjamin Moore paint store', at: [1196.9, -3510.4], comp: '2_-7:119', h: 12.7, floors: 2, fh: 3.8, bays: 1,
    brick: 'brick_tan', tint: '#c9c2ae', baseH: 4.4,
    stores: [STORE(0.3, 6.9, 'Benjamin Moore', SGN('Benjamin Moore', '#ffffff', '#d4145a', 0.35, 6.85, { font: 'LibreFranklin-700', y: 3.55, h: 0.75, sub: { text: 'PAINT CO.  EST. 1934', font: 'Inter-600', fg: '#ffffff', size: 0.2 } }), { interior: 'shop_clothing' })],
    win: { w: 5.6, h: 2.6, sill: 0.6, kind: 'fixed', mullions: 3, transom: 0.8, frame: 'steel_black', reveal: 0.16, lintel: null, sillStone: { mat: 'stone_lime', h: 0.12, proj: 0.04 }, lit: 0.3 },
    cornice: 'band', cornTint: '#b8b19c', refs: [R540],
    notes: 'Three storeys of pale brick with wide steel industrial windows; a Benjamin Moore dealer (magenta-red fascia, white letters; the dealer\'s own name not legible).' }),
  TEN({ id: 'w125-527', addr: '527 W 125th St', name: "Our Children's Foundation", at: [1209.6, -3498.6], comp: '2_-7:141', h: 13.3, floors: 2, fh: 3.6, bays: 6,
    brick: 'brick_buff', tint: '#d8cfb9', baseH: 4.4,
    stores: [{ u0: 0.5, u1: 13.6, kind: 'window', h: 3.2, glazing: { bulkhead: 0.9, transom: 0.4, mullions: 5, frame: 'steel_black' }, interior: 'office', gate: { kind: 'none' }, lit: 0.4 },
      { u0: 14.2, u1: 16.4, kind: 'entrance', door: { kind: 'solid', w: 1.2 } }, STORE(16.8, 19.4, null, null, { door: null, gate: { kind: 'rolldown', down: 1, graffiti: 0.8 } })],
    dh: { w: 1.2, h: 1.8, lintel: 'flat' }, cornice: 'parapet', cornTint: '#d0c7b1',
    bands: [{ at: 'base', h: 0.35, proj: 0.06, mat: 'stone_lime' }], refs: [R580],
    // w2r1 (m580_24): the base painted from the sidewalk to ~2.6 m over the barred windows, the name cut in the top band
    graffiti: [{ u0: 0.0, u1: 14.1, y0: 0.15, y1: 2.7, density: 0.85, style: 'throwups', seed: 527, overGlass: true }],
    items: [{ k: 'sign', z: 0.03, sign: { kind: 'channel', text: "OUR CHILDREN'S FOUNDATION", font: 'Montserrat-700', fg: '#e6e4de', bg: null, u0: 1.5, u1: 12.5, y: 12.05, h: 0.42, depth: 0.03, lit: 'none' } }],
    notes: 'Three storeys of cream brick and stone (1905), "OUR CHILDREN\'S FOUNDATION" cut in the parapet frieze (not drawn yet), a stepped parapet with a pediment, barred ground-floor windows under graffiti, a roll-down garage door at the east end.' }),
  TEN({ id: 'w125-525', addr: '525 W 125th St', at: [1217.2, -3477.5], comp: '2_-7:127', h: 11.2, floors: 2, fh: 3.4, bays: 2, brick: 'brick_tan', tint: '#b4966f',
    stores: [STORE(0.4, 6.6, null, null, { door: null, gate: { kind: 'rolldown', down: 1, graffiti: 0.6 } })], cornice: 'band', refs: [R580],
    notes: 'A garage (class G7) behind a 2026 sidewalk shed and scaffold netting; plain.' }),
  TEN({ id: 'w125-523', addr: '523 W 125th St', at: [1225.0, -3474.2], comp: '2_-7:131', h: 11.5, floors: 2, fh: 3.4, bays: 2, brick: 'stucco', tint: '#b9baae',
    stores: [STORE(0.4, 7.4, null, null, { door: null, gate: { kind: 'rolldown', down: 1, graffiti: 0.6 } })], cornice: 'band', refs: [R580],
    notes: 'A garage (class G7); plain.' }),
  TEN({ id: 'w125-521', addr: '521 W 125th St', at: [1227.2, -3466.1], comp: '2_-7:78', h: 14.6, floors: 3, bays: 3, brick: 'brick_red', tint: '#9c4a3c',
    stores: [STORE(0.3, 7.2, null, SGN('STORE OPEN', '#1b1b1b', '#f2f2ee', 0.4, 2.6, { h: 0.5 }), { interior: 'shop_phone' })], fe: [1], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#4a4540',
    refs: [],
    notes: 'Four/five-storey red brick walk-up with hooded lintels and a fire escape; a contractor sign (sidewalk shed, scaffold) and a small store.' }),
  TEN({ id: 'w125-515', addr: '515 W 125th St', name: 'Antioch Baptist Church', at: [1236.2, -3453.9], comp: '2_-7:45', h: 5.6, floors: 0, baseH: 4.6, brick: 'brick_painted', tint: '#b8433b',
    stores: [{ u0: 0.6, u1: 5.4, kind: 'entrance', door: { kind: 'double', w: 1.8, recess: 0.4 }, sign: SGN('Antioch Day Care', '#ffffff', '#1f58a8', 0.8, 5.2, { font: 'Montserrat-700', h: 0.5, y: 2.9 }) },
      { u0: 6.2, u1: 22.5, kind: 'window', h: 3.0, glazing: { bulkhead: 1.2, transom: 0, mullions: 6, frame: 'alu_white' }, interior: 'empty', gate: { kind: 'none' },
        sign: SGN('Antioch Baptist Church', '#ffffff', null, 10.0, 22.0, { kind: 'channel', font: 'LibreBaskerville-700', h: 0.55, y: 3.7, lit: 'face' }) }],
    cornice: 'band', cornTint: '#e9e6de', refs: [],
    notes: 'A one-storey 1970 church of red-painted brick with a white cornice, a gabled centre with a white cross, round-headed stained-glass windows (rectangles here), blue channel letters "Antioch Baptist Church" and "... Youth Center", Antioch Day Care at the west door.' }),
  TEN({ id: 'w125-511', addr: '511 W 125th St', at: [1244.6, -3436.7], comp: '2_-7:0', h: 19.3, floors: 5, bays: 4, brick: 'stone_lime', tint: '#c8b99a',
    stores: [STORE(0.4, 7.4, null, SGN('RESTAURANT', '#ffffff', '#c1272d', 0.4, 7.4, { font: 'Oswald-600' }), { awning: { kind: 'fixed', color: '#b3202a', proj: 1.0, drop: 0.3 }, interior: 'restaurant' }),
      { u0: 7.6, u1: 8.9, kind: 'entrance', door: { kind: 'solid', w: 1.1 } },
      STORE(9.1, 15.0, null, SGN('STORE FOR RENT', '#1b1b1b', '#f1efe8', 9.4, 12.6, { h: 0.55, y: 3.6 }), { door: null, interior: 'empty', lit: 0.2 })],
    fe: [0, 3], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#8b7b62', refs: [R660],
    notes: 'Six-storey tenement with a rock-faced stone front (1904), fire escapes, a restaurant under a red awning and an empty store.' }),
  TEN({ id: 'w125-507', addr: '507 W 125th St', at: [1254.5, -3426.4], comp: '2_-7:107', h: 13.8, floors: 2, fh: 3.7, bays: 3, brick: 'concrete_precast', tint: '#d3cdc0',
    stores: [STORE(0.4, 11.7, 'Fullwash laundromat', SGN('FULLWASH', '#1d3f8f', '#f4f4f4', 5.6, 11.4, { font: 'Montserrat-700', h: 0.62, y: 3.5 }), { awning: { kind: 'fixed', color: '#1f5fb5', proj: 1.1, drop: 0.35 }, interior: 'shop_phone' })],
    win: { w: 3.4, h: 2.2, sill: 0.7, kind: 'fixed', mullions: 3, frame: 'steel_black', reveal: 0.12, lintel: null, sillStone: null, lit: 0.3 },
    cornice: 'band', refs: [R660],
    notes: 'Three storeys of concrete frame with wide steel windows (1940); a laundromat under a blue awning (name read as "FULLWASH", to confirm).' }),
  TEN({ id: 'w125-501', addr: '501 W 125th St', at: [1256.3, -3411.0], comp: '2_-7:92', h: 8.2, floors: 1, fh: 3.4, bays: 6, brick: 'terracotta_cream', tint: '#d9d4c6',
    stores: [STORE(0.3, 5.0, 'Fofana Express Hair Braiding', SGN('FOFANA EXPRESS HAIR BRAIDING', '#ffffff', '#c3151c', 0.35, 4.95, { font: 'Oswald-600', h: 0.6 }), { interior: 'shop_clothing' }),
      STORE(5.2, 12.8, '501 Deli Corp', SGN('501 DELI CORP', '#ffe23a', '#111111', 5.3, 12.7, { font: 'Anton', h: 0.72, sub: { text: 'CONVENIENCE STORE', font: 'Inter-700', fg: '#ffffff', size: 0.2 } }), { interior: 'shop_food' }),
      STORE(13.0, 21.1, 'Better Health Pharmacy', SGN('PHARMACY', '#ffffff', '#1f8a3c', 13.1, 21.0, { font: 'Montserrat-700', h: 0.75 }), { interior: 'pharmacy' })],
    win: { w: 2.4, h: 1.7, sill: 0.8, kind: 'fixed', mullions: 1, frame: 'alu_black', reveal: 0.12, lintel: null, sillStone: null, lit: 0.5 },
    cornice: 'dentil', cornMat: 'terracotta_cream', cornTint: '#cfc8b6', refs: [R660],
    notes: 'Two storeys (1926) with an Art Deco terra-cotta frieze at the top; painted religious images in the upper windows; three shops to the Amsterdam corner. Open: the pharmacy\'s full name and the mortar mark.' }),
  // ------------------------------------------------------------------ Amsterdam Avenue corners
  TEN({ id: 'w125-1351amst', addr: '1351 Amsterdam Ave', at: [1311.7, -3404.6], comp: '2_-7:31', h: 8.1, floors: 1, fh: 3.4, bays: 4, brick: 'brick_tan', tint: '#b89c78',
    edge: [1299.01, -3406.52, 1305.91, -3418.97],   // w2r1: the Amsterdam Avenue wall (the b0 log: 'front' landed on a party wall)
    stores: [STORE(0.4, 6.9, null, SGN('99¢ & UP', '#ffffff', '#c8102e', 0.5, 6.8, { font: 'Anton' }), { awning: { kind: 'fixed', color: '#c8102e', proj: 1.0, drop: 0.3 } }), STORE(7.2, 13.8, null, null, { interior: 'shop_clothing' })],
    refs: [RAM], notes: 'Two-storey retail at the Amsterdam corner (1926). Open: the shop names (red awnings in amst_n, not legible).' }),
  TEN({ id: 'w125-1345amst-a', addr: '1345 Amsterdam Ave', at: [1300.2, -3397.3], comp: '2_-7:66', h: 17.8, floors: 4, bays: 2, brick: 'brick_red', tint: '#8a4e3a', edge: [1294.81, -3398.96, 1299.01, -3406.52], stores: [STORE(0.3, 6.7, null, null)], fe: [1], refs: [RAM], notes: 'Five-storey 1901 tenement on Amsterdam.' }),
  TEN({ id: 'w125-1345amst-b', addr: '1345 Amsterdam Ave', at: [1298.4, -3386.6], comp: '2_-7:138', h: 17.5, floors: 4, bays: 2, brick: 'brick_red', tint: '#8c5540', edge: [1290.58, -3391.33, 1294.81, -3398.96], stores: [STORE(0.3, 8.4, null, null, { interior: 'shop_phone' })], fe: [1], refs: [RAM], notes: 'Five-storey 1901 tenement on Amsterdam.' }),
  TEN({ id: 'w125-1345amst-c', addr: '1345 Amsterdam Ave', at: [1291.6, -3383.1], comp: '2_-7:47', h: 17.8, floors: 4, bays: 2, brick: 'brick_red', tint: '#8a5039', edge: [1286.5, -3383.96, 1290.58, -3391.33], stores: [STORE(0.2, 8.1, null, null)], refs: [RAM], notes: 'Five-storey 1901 tenement, a 4.3 m sliver on 125th.' }),
  // w2r1: MedRite's two street walls as a grey panel grid with big glass lights (amst26n / amst26e, FE2VSSGo 2026-08): the
  // b0 plate drew the Amsterdam wall as a blank panel box with small punched windows (no FACE on it). Bays and floor
  // lines are by eye.
  {
    id: 'w125-1343amst', addr: '1343 Amsterdam Ave (NE corner)', name: 'MedRite Urgent Care', bin: null, at: [1286.9, -3377.0], comp: '2_-7:126',
    h: 16.4, status: 'draft',
    wall: { mat: 'panel_alu', tint: '#8e9296', dirt: 0.15 },
    // AR34 w2 s2 (QA Q23): the compiled ring (2_-7:126) has five edges: e3 the Amsterdam wall (21.2 m), e2 the 4.4 m piece on
    // 125th at the corner, e1 (18.9 m) the wall shared with 471 (Nelson Cleaners' ring runs along it), e0 / e4 the rear.
    // The second face stood on e1 (the kit's 'party wall' warning since round 1); it is the 125th piece now.
    faces: [[1276.21, -3365.41, 1286.5, -3383.96, 7], [1278.66, -3361.75, 1276.21, -3365.41, 2]].map(([x0, z0, x1, z1, nb]) => ({
      edge: [x0, z0, x1, z1],
      base: { h: 4.6, fascia: { h: 0.75, mat: 'panel_alu', tint: '#1d1d1f' }, bays: [
        { u0: 0.3, u1: Math.hypot(x1 - x0, z1 - z0) - 0.3, kind: 'store', name: 'MedRite', h: 3.8,
          sign: { kind: 'channel', text: 'MEDRITE', font: 'Montserrat-700', fg: '#ffffff', bg: null, u0: Math.hypot(x1 - x0, z1 - z0) > 8 ? 1.0 : 0.35, u1: Math.min(6.0, Math.hypot(x1 - x0, z1 - z0) - 0.35), y: 4.0, h: 0.45, lit: 'face' },
          glazing: { bulkhead: 0.35, transom: 0.5, mullions: nb, frame: 'alu_clear' }, door: { u: 0.45, w: 1.8, kind: 'double' }, interior: 'pharmacy', gate: { kind: 'none' } },
      ] },
      floors: [{ n: 3, h: 3.6, win: 'A' }],
      // r3 read the grid too fine and dark against amst26n: wide grey panel piers and spandrels, light reflective lights
      curtain: { mullion: 3.0, transom: 'floor', frame: 'alu_clear', glass: 'glass_tower_grey', spandrel: 'panel_grey', spandrelH: 1.3, mullionW: 0.55, mullionD: 0.16, lit: 0.5, blinds: 0.3 },
      windows: { A: { w: 2.6, h: 2.5, sill: 0.6, kind: 'fixed', mullions: 1, frame: 'alu_clear', glass: 'glass_clear', reveal: 0.1, lintel: null, sillStone: null, lit: 0.5 } },
      cornice: { kind: 'band', h: 0.5, proj: 0.06, mat: 'panel_alu', tint: '#7d8186' },
    })),
    roof: { kind: 'flat', parapet: { h: 1.1, coping: 'metal' }, membrane: 'grey' },
    refs: [RAM],
    notes: 'The glass and grey-panel corner building (MedRite urgent care) with a glazed rooftop box (not drawn: open). Both ' +
      'street walls carry the curtain system; the bays and floor lines are not yet measured on an elevation.',
  },
  TEN({ id: 'w125-471', addr: '471 W 125th St (Amsterdam corner lot)', name: 'Nelson Cleaners', at: [1290.1, -3364.9], comp: '2_-7:134', h: 16.9, floors: 4, bays: 2, brick: 'brick_red', tint: '#9a4a36',
    stores: [STORE(0.2, 7.4, 'Nelson Cleaners', SGN('Nelson CLEANERS', '#ffffff', '#1c4b9c', 0.3, 7.3, { font: 'Montserrat-700', h: 0.75, y: 3.4, sub: { text: 'EXPERT TAILORING  •  PICK-UP & DELIVERY', font: 'Inter-600', fg: '#ffffff', size: 0.16 } }), { interior: 'shop_clothing' })],
    fe: [1], dh: { lintel: 'hood' }, cornice: 'bracketed', cornH: 1.1, cornTint: '#5b5550', refs: [RAM],
    notes: 'Five-storey red brick tenement (1910) with a pressed-metal cornice (a fan in its central pediment) and a fire escape; Nelson Cleaners under a blue fascia (the door is numbered 471 W). amst_e.' }),
  TEN({ id: 'w125-469', addr: '469 W 125th St', name: 'optical shop', at: [1291.4, -3356.7], comp: '2_-7:12', h: 6.9, floors: 1, fh: 2.6, bays: 1, brick: 'stucco', tint: '#e4e1d8',
    stores: [STORE(0.1, 2.9, null, SGN('OPTICAL', '#1d3f8f', '#f4f4f2', 0.2, 2.8, { font: 'Oswald-600', h: 0.5, y: 3.2 }), { interior: 'shop_phone' })],
    dh: { w: 0.9, h: 1.4, lintel: 'none' }, cornice: 'band', refs: [RAM],
    notes: 'A two-storey frame house with white siding (amst_e); an optical shop.' }),
  TEN({ id: 'w125-467', addr: '467 W 125th St', name: 'pharmacy', at: [1295.7, -3350.3], comp: '2_-7:156', h: 9.8, floors: 2, fh: 2.9, bays: 2, brick: 'stucco', tint: '#e2dfd6',
    stores: [STORE(0.3, 7.5, 'pharmacy', SGN('PHARMACY', '#ffffff', '#1d5fb3', 0.4, 7.4, { font: 'Montserrat-700', h: 0.6, y: 3.3 }), { interior: 'pharmacy' })],
    dh: { lintel: 'none' }, cornice: 'band', refs: [RAM],
    notes: 'A three-storey frame building with white siding beside the optical shop; a pharmacy (blue sign). amst_e.' }),
  TEN({ id: 'w125-465', addr: '465 W 125th St', at: [1300.7, -3344.5], comp: '2_-7:25', h: 13.6, floors: 3, bays: 2, brick: 'brick_red', tint: '#9a6440',
    stores: [STORE(0.3, 7.2, null, null, { interior: 'shop_phone' })], fe: [0], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#5c4a3a', refs: [RAM],
    notes: 'Four-storey 1901 walk-up with a pressed-metal cornice and fire escape (amst_e, right of Nelson Cleaners).' }),
  // ------------------------------------------------------------------ north-east side, Amsterdam Avenue to Morningside Avenue
  TEN({ id: 'w125-457', addr: '457 W 125th St', at: [1314.5, -3324.8], comp: '2_-7:120', h: 19.3, floors: 5, bays: 4, tint: '#d2c3a5',
    stores: [STORE(0.3, 5.6, 'Metro by T-Mobile', SGN('metro by T-Mobile', '#ffffff', '#5a2a86', 0.35, 5.55, { font: 'Montserrat-700', h: 0.62 }), { interior: 'shop_phone' }),
      STORE(5.9, 11.8, 'Harlem Deli Grocery', SGN('"HARLEM" DELI GROCERY CORP', '#1d5f2c', '#f3f0e2', 6.0, 11.7, { font: 'Oswald-600', h: 0.72 }), { interior: 'shop_food' })],
    fe: [0, 3], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#6c5c48', refs: [R800],
    notes: 'Six-storey buff brick tenement (1901) with fire escapes; Metro by T-Mobile (purple) and the Harlem Deli Grocery (green on cream).' }),
  TEN({ id: 'w125-453', addr: '453 W 125th St', at: [1324.5, -3315.3], comp: '2_-7:1', h: 19.3, floors: 5, bays: 4, tint: '#cdbfa2',
    stores: [STORE(0.3, 1.9, null, null, { door: { u: 0.5, w: 1.0, kind: 'solid' }, gate: { kind: 'none' } }), STORE(2.2, 12.0, null, null, { door: null, gate: { kind: 'rolldown', down: 1, color: '#9a9c9e', graffiti: 0.2 }, awning: { kind: 'fixed', color: '#8a1c1c', proj: 0.9, drop: 0.25 }, interior: 'empty', lit: 0 })],
    fe: [1, 2], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#6c5c48', refs: [R800],
    notes: 'Six-storey buff brick tenement; a closed store behind roll-down gates under a bare awning frame (2026-08).' }),
  TEN({ id: 'w125-449', addr: '449 W 125th St', name: 'Good Health Family Pharmacy', at: [1328.1, -3304.4], comp: '2_-7:63', h: 19.3, floors: 5, bays: 4, tint: '#d0c1a3',
    stores: [STORE(0.3, 11.9, 'Good Health Family Pharmacy', SGN('GOOD HEALTH FAMILY PHARMACY', '#ffffff', '#12703a', 0.4, 11.8, { font: 'Oswald-600', h: 0.75 }), { interior: 'pharmacy' })],
    fe: [2], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#6c5c48', refs: [R800],
    notes: 'Six-storey buff brick tenement; Good Health Family Pharmacy under a green fascia with white capitals and the cross.' }),
  TEN({ id: 'w125-445', addr: '445 W 125th St', at: [1338.5, -3294.4], comp: '2_-7:149', h: 19.2, floors: 5, bays: 4, brick: 'stone_lime', tint: '#c4b08c',
    stores: [STORE(0.3, 4.4, 'Soul food', SGN('SOUL FOOD', '#ffffff', '#1d6b35', 0.4, 4.3, { font: 'Oswald-600', h: 0.6 }), { awning: { kind: 'fixed', color: '#1d6b35', proj: 1.0, drop: 0.3 }, interior: 'restaurant' }),
      STORE(4.6, 8.4, 'Liberty Tax', SGN('LIBERTY TAX', '#ffffff', '#c8102e', 4.7, 8.3, { font: 'Montserrat-700', h: 0.6 }), { interior: 'bank' }),
      STORE(8.6, 13.0, 'beauty supply', SGN('BEAUTY SUPPLY', '#1b1b1b', '#e8dcc8', 8.7, 12.9, { font: 'PlayfairDisplay-700', h: 0.6 }), { interior: 'shop_clothing' })],
    fe: [0, 2], dh: { lintel: 'hood' }, cornice: 'bracketed', cornTint: '#4c4540', refs: [],
    notes: 'Six-storey buff stone-and-brick tenement (1901) with fire escapes; soul food (green awning), Liberty Tax (red), a beauty supply (2023-06).' }),
  TEN({ id: 'w125-443', addr: '443 W 125th St', at: [1344.5, -3275.8], comp: '2_-7:160', h: 18.5, floors: 5, bays: 8, brick: 'brick_red', tint: '#9c5a44',
    stores: [STORE(0.4, 14.0, null, SGN('COMMUNITY DEVELOPMENT ORGANIZATION', '#ffffff', '#1f5f3a', 1.0, 13.4, { font: 'Oswald-600', h: 0.5, y: 3.5 }), { awning: { kind: 'fixed', color: '#1f5f3a', proj: 1.1, drop: 0.35 }, interior: 'office' }),
      { u0: 14.2, u1: 15.8, kind: 'entrance', door: { kind: 'glass', w: 1.2 } },
      STORE(16.0, 22.0, "Charles' chicken", SGN("Charles'", '#b3151b', '#f3ecdc', 16.2, 21.8, { font: 'Lobster', h: 0.7 }), { interior: 'restaurant' })],
    dh: { w: 1.0, h: 1.5, lintel: 'none' }, cornice: 'band', cornTint: '#8a4c3a', refs: [],
    notes: 'A 1997 six-storey apartment house of red brick with plain punched windows; a community development organisation under a green awning and a chicken restaurant ("Charles\u2019", 2023-06).' }),
  // w2r1: one continuous red brick front in m864_23 (Hi2mcMTu 2023-03), not the compiled record's mixed colours
  ...[[1354.8, -3266.5, '2_-7:29', 17.1, '#8e4a38'], [1359.1, -3260.1, '2_-7:85', 17.7, '#8a4636'], [1363.4, -3253.7, '2_-7:8', 17.1, '#8a4a36'],
    [1367.8, -3247.6, '2_-7:69', 16.8, '#8c4a37'], [1371.9, -3241.2, '2_-7:81', 17.3, '#884434'], [1370.3, -3231.6, '2_-7:28', 17.3, '#8a4f3b']].map(([x, z, comp, h, tint], k) =>
    TEN({ id: 'w125-437-' + (k + 1), addr: '437 W 125th St (row of six)', at: [x, z], comp, h, floors: 5, bays: 2, brick: /^#[89]/.test(tint) ? 'brick_red' : 'brick_buff', tint,
      stores: [STORE(0.3, 7.2, null, null, { interior: ['shop_food', 'shop_phone', 'shop_clothing'][k % 3] })], fe: [k % 2], dh: { lintel: k % 2 ? 'hood' : 'flat' },
      notes: 'One of a row of six 1901 walk-ups on one lot; red brick in m864_23 (the white diamond plaques, the shops\' signs: open).' })),
  // w2b3: cream-tan brick in m900_23 (the shaded front (105, 90, 81)); w2r1 drew it white-grey
  TEN({ id: 'w125-421-a', addr: '421 W 125th St', name: 'Harlem Fresh Market', at: [1387.7, -3231.2], comp: '2_-7:83', h: 18.0, floors: 4, fh: 3.2, bays: 3, brick: 'brick_buff', tint: '#cdb998',
    // w2b3 (the lead's review: the sign read thin): m900_23 (eaS9WMyJ 2023-03) shows big white letters standing on the front
    // of a black canopy over the produce stands, not a red awning; letter height ~0.8 m by eye against the 3.4 m opening
    stores: [STORE(0.3, 9.0, 'Harlem Fresh Market', null, { awning: { kind: 'fixed', color: '#141414', proj: 1.5, drop: 0.55 }, interior: 'shop_food' })],
    items: [{ k: 'sign', sign: { kind: 'channel', text: 'HARLEM FRESH MARKET', font: 'Anton', fg: '#ffffff', bg: null, u0: 0.7, u1: 8.6, y: 3.95, h: 0.82, depth: 0.1, lit: 'face' }, z: 1.4 }],
    fe: [0, 2], dh: { lintel: 'keystone' }, cornice: 'bracketed', cornTint: '#4b4238', refs: [R920, 'west33 m900_23 eaS9WMyJ 2023-03 h~200 p12 f90'],
    notes: 'Five-storey cream brick tenement (1920) with keystoned lintels, fire escapes; Harlem Fresh Market: white channel letters on a black canopy (m900_23).' }),
  // where the twin drew this lot red;
  // AR34 w2 s2 (QA Q54): the side wall over the firehouse is grey cement parging, neither the red brick of w2r1b nor the
  // Joseph's, (188, 182, 169) in haze); the
  // front stays cream brick (m900_23 / m920_23): the building's wall is the parging, the 125th face its own brick
  PARGED(TEN({ id: 'w125-421-b', addr: '421 W 125th St', at: [1388.3, -3218.3], comp: '2_-7:105', h: 17.7, floors: 4, fh: 3.2, bays: 2, brick: 'brick_buff', tint: '#cbb796',
    stores: [STORE(0.3, 7.6, null, null, { interior: 'shop_phone' })], fe: [1], refs: [],
    notes: 'Five-storey tenement beside the firehouse; its side wall over the firehouse is parged grey (side421_23).' }), '#7f7f7d'),   // s2r1 q0940Sx: '#8f8e8a' read (216, 208, 199) in the sun
  {
    id: 'w125-415', addr: '415 W 125th St', name: 'FDNY Engine 37 / Ladder 40', bin: null,
    at: [1398.5, -3209.0], comp: '2_-7:103', h: 8.4, status: 'draft',
    wall: { mat: 'brick_tan', tint: '#b8a585', dirt: 0.4 },
    // w2r1: the face is the 13.6 m main front (the inventory's middle primary piece); the b0 plate put it on the 3.9 m
    // piece and left the three red apparatus doors of m920_23 off the street. Door spans by eye (not measured).
    faces: [{ edge: [1390.38, -3196.86, 1382.8, -3208.18], base: { h: 4.6, bays: [
      ...[[0.6, 3.8], [4.3, 7.5], [8.0, 11.2]].map(([u0, u1]) => ({ u0, u1, kind: 'store', h: 3.9, door: null, glazing: { bulkhead: 0, transom: 0, mullions: 0, frame: 'alu_clear' },
        gate: { kind: 'rolldown', down: 1, color: '#c3161d' }, interior: 'empty', lit: 0.3 })),
      { u0: 11.8, u1: 13.0, kind: 'entrance', door: { kind: 'solid', w: 1.0 } },
    ] }, floors: [{ n: 1, h: 3.4, win: 'A' }], bays: { n: 5, margin: [0.6, 0.6] },
      windows: { A: { w: 1.6, h: 1.2, sill: 1.0, kind: 'fixed', mullions: 1, frame: 'alu_bronze', reveal: 0.1, lintel: null, sillStone: null, ac: 0.5, lit: 0.5 } },
      cornice: { kind: 'band', h: 0.4, proj: 0.08, mat: 'stone_lime', tint: '#c8bba0' },
      items: [{ k: 'flagpole', u: 12.6, y: 7.0 }] }],
    refs: [R920],
    notes: 'The 1974 firehouse of tan brick with three red roll-up apparatus doors, the company apple emblem (not drawn), a flagpole. The inventory splits the front in three pieces (3.9, 13.6, 1.3 m); the face is the 13.6 m one.',
  },
  ...[[1402.6, -3192.8, '2_-7:115', 14.5], [1409.6, -3190.3, '2_-7:82', 14.4], [1418.3, -3190.2, '2_-7:117', 14.7]].map(([x, z, comp, h], k) =>
    TEN({ id: 'w125-409-' + (k + 1), addr: '409 W 125th St', at: [x, z], comp, h: 16.6, floors: 4, fh: 3.0, bays: 2, brick: 'brick_painted', tint: '#d49484',   // r4: m960_23 counts four floors over the shops (window rows; the compiled 14.5 m is not verified)
        // w2r1: one salmon-painted front in m960_23 (YAT1WDxG 2023-08)
      stores: [STORE(0.3, Math.max(2.0, [4.0, 7.9, 7.1][k]), null, null, { interior: ['shop_food', 'shop_phone', 'shop_clothing'][k] })], fe: k === 1 ? [0] : undefined,
      notes: 'Four-storey 1910 walk-ups at the Morningside end: one salmon-painted brick front with white lintels and fire escapes in m960_23 (the Coffee Shop and the pizza chain\'s sign: open).' })),
  TEN({ id: 'w125-405', addr: '405 W 125th St', at: [1431.7, -3192.9], comp: '2_-7:75', h: 14.5, floors: 2, fh: 3.8, bays: 3, brick: 'brick_tan', tint: '#b09474',
    stores: [{ u0: 3.8, u1: 6.4, kind: 'entrance', door: { kind: 'double', w: 1.8, recess: 0.5 } }], win: { w: 1.4, h: 2.4, sill: 0.8, kind: 'fixed', mullions: 1, frame: 'alu_bronze', reveal: 0.16, lintel: { kind: 'keystone', mat: 'stone_lime', h: 0.3 }, sillStone: { mat: 'stone_lime', h: 0.1, proj: 0.05 }, lit: 0.3 },
    cornice: 'band', notes: 'A 1910 church building (class M3) beside St. Joseph\'s.' }),
  {
    id: 'w125-140morn', addr: '140 Morningside Ave (W 125th St corner)', name: 'St. Joseph of the Holy Family Church', bin: null,
    at: [1443.1, -3181.2], comp: '2_-7:55', h: 12.5, status: 'draft',
    custom: { fn: 'west:stjoseph', with: 'kit' },
    wall: { mat: 'brick_red', tint: '#8f4c38', dirt: 0.45 },
    faces: [
      { edge: 'front', floors: [{ n: 1, h: 8.0, win: 'A' }], bays: { n: 3, margin: [1.2, 1.2] },
        windows: { A: { w: 1.5, h: 4.2, sill: 2.4, kind: 'arch', mullions: 1, glass: 'glass_grey', frame: 'alu_bronze', reveal: 0.35, lintel: { kind: 'arch', mat: 'brick_red', h: 0.3, proj: 0.04 }, sillStone: { mat: 'stone_lime', h: 0.14, proj: 0.06 }, lit: 0.5 } },
        piers: { mat: 'brick_red', w: 0.6, proj: 0.25, at: 'bays', from: 0, to: 'cornice' }, cornice: { kind: 'dentil', h: 0.6, proj: 0.3, mat: 'brick_red' } },
      { edge: 'corner', floors: [{ n: 1, h: 8.0, win: 'A' }], bays: { n: 6, margin: [1.0, 1.0] },
        windows: { A: { w: 1.5, h: 4.2, sill: 2.4, kind: 'arch', mullions: 1, glass: 'glass_grey', frame: 'alu_bronze', reveal: 0.35, lintel: { kind: 'arch', mat: 'brick_red', h: 0.3, proj: 0.04 }, sillStone: { mat: 'stone_lime', h: 0.14, proj: 0.06 }, lit: 0.5 } },
        piers: { mat: 'brick_red', w: 0.6, proj: 0.25, at: 'bays', from: 0, to: 'cornice' }, cornice: { kind: 'dentil', h: 0.6, proj: 0.3, mat: 'brick_red' } },
    ],
    roof: { kind: 'gable', parapet: { h: 0 }, membrane: 'black' },
    refs: [],
    notes: 'Individual landmark (1860): red brick Romanesque Revival church with round-arched windows between buttress piers, a corner bell tower with a copper cap and cross on Morningside Avenue. Open: the tower and the arched heads need a custom builder (the kit draws rectangles); the gable roof pitch.',
  },
  // ------------------------------------------------------------------ south-west side, Broadway to Morningside Avenue
  {
    id: 'w125-568', addr: '568 W 125th St', name: 'one-storey 1957 retail block (Duane Reade and five more stores)', bin: null,
    at: [1112.7, -3534.8], comp: '2_-7:110', h: 5.3, status: 'draft',
    wall: { mat: 'brick_red', tint: '#8c4632', dirt: 0.45 },
    // measured on elev/s568_cKwc26 (20 px/m, rows 0 / 180 = 9 / 0 m over the sidewalk): Island Grill's black fascia 3.5-5.3 m
    // (rows 74-110), the coping to 5.6 (row 68), its letters 4.0-4.6, Duane Reade's fascia top 5.5, its letters 4.25-4.9; the
    // spec drew the stores to 3.9, brick to 6.1 and a 2.0 m fascia over it (to 8.1), the parapet to 7.9
      faces: [{ edge: 'front', base: { h: 3.55, wall: { mat: 'panel_alu', tint: '#34332f', dirt: 0.35 }, fascia: { h: 1.75, mat: 'panel_alu', tint: '#151515' }, bays: [
      { u0: 1.0, u1: 30.0, kind: 'store', h: 3.45, name: 'supermarket', sign: { kind: 'channel', text: 'SUPERMARKET', font: 'Montserrat-700', fg: '#ffffff', bg: null, u0: 8.0, u1: 22.0, y: 4.1, h: 0.7, lit: 'face' },
        glazing: { bulkhead: 0.5, transom: 0.5, mullions: 8, frame: 'alu_clear' }, door: { u: 0.5, w: 2.4, kind: 'double' }, interior: 'shop_food', gate: { kind: 'none' } },
      // fascia 4.0-6.1 m, the blue 'pharmacy' panel near u 67), Island Grill 81.2-88.1, Subway 88.4-92.4, Bank of America
      // 92.7-99.0. Lettering drawn from scratch; the marks are text only.
      { u0: 31.0, u1: 40.8, kind: 'wall' },
      { u0: 41.2, u1: 49.8, kind: 'store', h: 3.45, glazing: { bulkhead: 0.4, transom: 0.3, mullions: 3, frame: 'alu_clear' }, door: { u: 0.5, w: 1.0 }, interior: 'shop_phone', gate: { kind: 'none' } },
      { u0: 50.2, u1: 56.4, kind: 'store', h: 3.45, name: '125 Spirits', sign: { kind: 'panel', text: '125 SPIRITS', font: 'Oswald-600', fg: '#ffffff', bg: '#141414', u0: 50.4, u1: 56.2, y: 3.95, h: 0.8 },
        glazing: { bulkhead: 0.4, transom: 0.3, mullions: 2, frame: 'alu_clear' }, door: { u: 0.2, w: 1.0 }, interior: 'shop_food', gate: { kind: 'rolldown', down: 0 } },
      { u0: 56.8, u1: 80.8, kind: 'store', h: 3.45, name: 'Duane Reade',
        sign: { kind: 'channel', text: 'DUANE reade', font: 'Montserrat-700', fg: '#ffffff', bg: null, u0: 58.6, u1: 65.6, y: 4.25, h: 0.62, lit: 'face' },
        glazing: { bulkhead: 0.45, transom: 0.4, mullions: 8, frame: 'alu_clear' }, door: { u: 0.12, w: 1.8, kind: 'double' }, interior: 'pharmacy', gate: { kind: 'none' } },
      { u0: 81.2, u1: 88.1, kind: 'store', h: 3.45, name: 'Island Grill', sign: { kind: 'channel', text: 'ISLAND GRILL', font: 'Montserrat-700', fg: '#ffffff', bg: null, u0: 81.7, u1: 87.6, y: 4.05, h: 0.55, lit: 'face' },
        glazing: { bulkhead: 0.4, transom: 0.4, mullions: 3, frame: 'alu_black' }, door: { u: 0.2, w: 1.0 }, interior: 'restaurant', gate: { kind: 'none' } },
      { u0: 88.4, u1: 92.4, kind: 'store', h: 3.45, name: 'Subway', sign: { kind: 'panel', text: 'SUBWAY', font: 'Montserrat-700', fg: '#f6c21a', bg: '#0f7a3a', u0: 88.5, u1: 92.3, y: 3.9, h: 0.9 },
        glazing: { bulkhead: 0.4, transom: 0.4, mullions: 2, frame: 'alu_clear' }, door: { u: 0.6, w: 1.0 }, interior: 'restaurant', gate: { kind: 'none' } },
      { u0: 92.7, u1: 99.0, kind: 'store', h: 3.45, name: 'Bank of America', sign: { kind: 'panel', text: 'BANK OF AMERICA', font: 'Montserrat-700', fg: '#0b2a6b', bg: '#f2f2f0', u0: 92.9, u1: 98.8, y: 3.95, h: 0.75 },
        glazing: { bulkhead: 0.3, transom: 0.5, mullions: 3, frame: 'alu_clear' }, door: { u: 0.2, w: 1.8, kind: 'double' }, interior: 'bank', gate: { kind: 'none' } },
    ] }, floors: [],
      items: [{ k: 'sign', sign: { kind: 'panel', text: 'pharmacy', font: 'Montserrat-700', fg: '#ffffff', bg: '#2a63c8', u0: 66.4, u1: 70.0, y: 4.3, h: 0.55 } },
        { k: 'sign', sign: { kind: 'channel', text: 'DUANE reade', font: 'Montserrat-700', fg: '#ffffff', bg: null, u0: 71.5, u1: 78.5, y: 4.25, h: 0.62, lit: 'face' } }] }],
    roof: { kind: 'flat', parapet: { h: 0.12, coping: 'metal' }, membrane: 'black', items: [{ k: 'hvac', at: [0.3, 0.5], n: 4 }] },
    refs: [R540.replace('h56', 'h236').replace('(n540)', '(s540)')],
    notes: 'A 99 m one-storey red brick retail block (1957) in front of the Grant Houses, a red "RG" mark over its entrance (the store\'s name not legible in s540: open), mostly blank brick behind trees.',
  },
  {
    id: 'w125-520', addr: '518-520 W 125th St', name: 'George Bruce Library (NYPL)', bin: null,
    at: [1197.8, -3417.5], comp: '2_-7:104', h: 15.1, status: 'measured',
    // 4.5 m high fills u 0-3.4, drawn here at the block's height: open), attic top 15.05, cornice 13.4-14.4, a limestone
    // frieze 12.5-13.4 with "NEW YORK PUBLIC LIBRARY", top-floor 6/6 windows 9.33-11.75 at u 5.05 / 8.3 / 11.55 / 14.8
    // (1.72 wide), the main floor's tall multi-pane windows 3.3-7.0 at u 8.2 / 11.4 / 14.6 (1.8 wide) under keystone
    // lintels, the arched entrance u 4.5-7.3 (crown 5.75) with an oculus over it, a limestone basement to 2.5 m.
    // Brick tint from the wall between the windows: ref (111,94,83) vs the r1 twin (172,125,116) sRGB.
    wall: { mat: 'brick_red', tint: '#603d2a', dirt: 0.35 },
    faces: [{
      edge: 'front',
      base: { h: 2.5, wall: { mat: 'stone_lime', tint: '#d6cfbf' }, bays: [
        { u0: 4.6, u1: 7.2, kind: 'entrance', door: { kind: 'double', w: 1.5, recess: 0.5 } },
        { u0: 8.2, u1: 10.0, kind: 'window', h: 1.5, glazing: { bulkhead: 0.5, transom: 0, mullions: 2, frame: 'alu_white' }, interior: 'office', gate: { kind: 'none' }, lit: 0.3 },
        { u0: 14.7, u1: 16.5, kind: 'window', h: 1.5, glazing: { bulkhead: 0.5, transom: 0, mullions: 2, frame: 'alu_white' }, interior: 'office', gate: { kind: 'none' }, lit: 0.3 },
      ] },
      floors: [
        { n: 1, h: 5.1, win: 'A', open: [[4.95, 6.85, 'D'], [8.2, 10.0, 'A'], [11.4, 13.2, 'A'], [14.6, 16.4, 'A']] },
        { n: 1, h: 5.0, win: 'B', open: [[5.05, 6.77, 'B'], [8.3, 10.02, 'B'], [11.55, 13.27, 'B'], [14.8, 16.52, 'B']] },
      ],
      bays: { n: 4, margin: [4.4, 1.5] },
      windows: {
        A: { w: 1.8, h: 3.7, sill: 0.8, kind: 'fixed', mullions: 1, transom: 1.15, frame: 'alu_white', reveal: 0.22,
          lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#ddd6c6', h: 0.55 }, sillStone: { mat: 'stone_lime', h: 0.12, proj: 0.06 }, lit: 0.6, blinds: 0.2 },
        B: { w: 1.72, h: 2.42, sill: 1.73, kind: 'dh', lights: '6/6', frame: 'alu_white', reveal: 0.18,
          lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#ddd6c6', h: 0.3 }, sillStone: { mat: 'stone_lime', h: 0.1, proj: 0.05 }, lit: 0.35, ac: 0 },
        D: { w: 1.9, h: 3.25, sill: 0.0, kind: 'arch', mullions: 2, frame: 'alu_white', reveal: 0.35,
          lintel: { kind: 'keystone', mat: 'stone_lime', tint: '#ddd6c6', h: 0.4, proj: 0.08 }, sillStone: null, lit: 0.7 },
      },
      bands: [{ at: 2.5, h: 0.3, proj: 0.08, mat: 'stone_lime' }, { at: 12.5, h: 0.9, proj: 0.04, mat: 'stone_lime', tint: '#bdb5a5' }],
      cornice: { kind: 'modillion', h: 1.0, proj: 0.6, mat: 'stone_lime', tint: '#b3ab9b' },   // weathered grey in lib24 (r2 drew it near white)
      items: [
        { k: 'sign', z: 0.046, sign: { kind: 'channel', text: 'NEW YORK PUBLIC LIBRARY', font: 'LibreBaskerville-700', fg: '#9b9483', bg: null, u0: 6.0, u1: 15.5, y: 12.75, h: 0.36, depth: 0.012, lit: 'none' } },
        { k: 'flagpole', u: 9.5, y: 10.6 }, { k: 'lamp', u: 4.25, y: 3.3 }, { k: 'lamp', u: 7.55, y: 3.3 },
      ],
    }],
    refs: [],
    notes: 'Individual landmark (1915, Carrere & Hastings): a three-storey red brick and limestone branch library, measured on ' +
      'the rectified 2024-08 elevation (positions to ~0.1 m). The main floor windows are tall rectangles under keystone ' +
      'lintels (not arches); only the entrance is round-headed. Open: the one-storey annex at u 0-3.4 (4.5 m) is drawn at ' +
      'the block height (the compiled footprint is one ring); the oculus over the door; the attic balustrade.',
  },
  ...[[1142.0, -3436.0, '2_-7:108', 59.1, 'w125-grant-1320a', '1320 Amsterdam Ave'], [1188.9, -3349.4, '2_-7:49', 58.4, 'w125-grant-1320b', '1320 Amsterdam Ave'],
    [1256.3, -3261.0, '2_-7:36', 62.5, 'w125-grant-450a', '450 W 123rd St'], [1337.1, -3152.8, '2_-7:23', 56.3, 'w125-grant-450b', '450 W 123rd St']].map(([x, z, comp, h, id, addr]) => ({
    id, addr, name: 'General Grant Houses (NYCHA, 1955)', bin: null, at: [x, z], comp, h, status: 'draft',
    wall: { mat: 'brick_red', tint: '#8d4f3a', dirt: 0.4 },
    faces: [{ edge: 'front', floors: [{ n: 20, h: 2.7, win: 'A' }], bays: { n: 6, margin: [0.8, 0.8] },
      base: { h: 3.4, bays: [{ u0: 0.8, u1: 3.4, kind: 'entrance', door: { kind: 'double', w: 1.8, recess: 0.4 } }] },
      windows: { A: { w: 1.5, h: 1.45, sill: 0.8, kind: 'casement', frame: 'alu_white', reveal: 0.1, lintel: { kind: 'flat', mat: 'concrete_precast', h: 0.15 }, sillStone: { mat: 'concrete_precast', h: 0.08, proj: 0.03 }, ac: 0.4, blinds: 0.6, lit: 0.4 } },
      cornice: { kind: 'band', h: 0.4, proj: 0.04, mat: 'concrete_precast' } }],
    roof: { kind: 'flat', parapet: { h: 1.0, coping: 'metal' }, membrane: 'black', items: [{ k: 'bulkhead', at: [0.5, 0.5], w: 6, d: 5, h: 3.2 }] },
    refs: [],
    notes: 'NYCHA General Grant Houses: 21-storey red brick cross-plan towers behind lawns and plane trees; steel casements with concrete sills and lintels, rows of AC units. Open: the cross-plan wings (the compiled ring is used as is), the ground-floor entrances.',
  })),
  {
    id: 'w125-grant-low', addr: '1320 Amsterdam Ave (low wing)', name: 'General Grant Houses', bin: null,
    at: [1195.2, -3378.6], comp: '2_-7:129', h: 3.4, status: 'draft',
    wall: { mat: 'brick_red', tint: '#8d4f3a', dirt: 0.45 },
    notes: 'A one-storey service wing of the Grant Houses (3.4 m); plain brick.',
  },
  {
    id: 'w125-558rsd', addr: '558 Riverside Dr (St. Clair Pl corner)', name: null, bin: null,
    at: [956.2, -3756.6], comp: '1_-8:8', h: 72.4, status: 'draft',
    wall: { mat: 'concrete_precast', tint: '#c8b99c', dirt: 0.3 },
    faces: [{ edge: 'front', base: { h: 4.2, bays: [{ u0: 9.5, u1: 13.5, kind: 'entrance', door: { kind: 'double', w: 2.2, recess: 1.0 } }] },
      floors: [{ n: 25, h: 2.73, win: 'A' }], bays: { n: 6, margin: [0.8, 0.8] },
      windows: { A: { w: 2.6, h: 1.5, sill: 0.75, kind: 'fixed', mullions: 1, frame: 'alu_bronze', reveal: 0.3, lintel: null, sillStone: null, ac: 0.3, blinds: 0.6, lit: 0.4 } },
      piers: { mat: 'concrete_precast', tint: '#d1c3a6', w: 0.6, proj: 0.3, at: 'bays', from: 'base', to: 'cornice' },
      cornice: { kind: 'band', h: 0.8, proj: 0.1, mat: 'concrete_precast' } }],
    refs: [],
    notes: 'The 1968 26-storey beige slab (piers and window bands) with its four-storey precast wing along St. Clair Place (deep-set windows with sloped sills). Open: the compiled footprint joins the tower and the wing at one height (72 m): a corrected ring for the tower and a spec for the wing are needed.',
  },
];
