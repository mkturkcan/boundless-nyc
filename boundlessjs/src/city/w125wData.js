// AR32 W125W data: measured positions for W 125th Street's west end (docs/notes/area-w125w.md). World metres (shared/geo.js
// project: x east, z south). Positions from OpenStreetMap (ODbL 1.0, (c) OpenStreetMap contributors, Overpass 2026-09-30):
// the buildings' rings, the viaducts' centrelines, the station's platforms. No imports: city/elevatedKit.js asks this file
// which of its IRT bents the Manhattan Valley arch replaces.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const AR32W = !(Q && (Q.get('ar32') === '0' || Q.get('ar32w') === '0'));

// Dinosaur Bar-B-Que, 700 W 125th St (OSM node 2479519219 at (875.3, -3894.6), inside building way 271923881, height
// 8.1 m): the two-storey brick industrial building on the block between W 125th St (its NE front, 24.9 m), Twelfth
// Avenue (NW, 59.1 m) and St Clair Place (SE). Ring as compiled (centroid (862.5, -3877.2), 1,135 m2).
export const DINO = {
  ring: [[853.6, -3852.6], [837.2, -3861.6], [871.2, -3910.0], [885.3, -3889.5], [883.8, -3887.7]],
  centroid: [862.5, -3877.2], area: 1135, eave: 8.1, parapet: 0.9,
  // frontage edges by ring index (edge i runs ring[i] -> ring[i+1]): 2 = W 125th St (NE), 1 = Twelfth Avenue (NW)
  front125: 2, front12: 1,
};

// Riverside Drive Viaduct (1900; OSM way 46568321, bridge, layer 1): straight from (850.0, -3762.7) to (1077.5, -4170.3),
// 466.8 m at bearing 29.2 deg. W 125th St's centreline crosses it 124.45 m from the south end, at (910.65, -3871.37),
// at 67 deg. The "Riverside Viaduct" footways (ways 1097593544, 1097592591) run 9.0 m west and 12.1 m east of the road's
// centreline, so the deck is taken 26 m wide on a centre 1.5 m east of it.
export const RSD = {
  A: [850.0, -3762.7], B: [1077.5, -4170.3], L: 466.79, dir: [0.48737, -0.87320],
  x125: 124.45, span125: 44.0, lc: 1.5, W: 26.0, deckAbove: 19.5, ribs: [-10, -5, 0, 5, 10], cols: [-12.6, 12.6],
};

// The Manhattan Valley Viaduct (1904; OSM ways 46344717, 426103187, 426103191, "bridge:name" Manhattan Valley Viaduct):
// the centre track runs from (963.6, -3398.0) to (1284.5, -3977.1) (unit (0.48469, -0.87468)); W 125th St's centreline
// (way 196117067) crosses it at (1088.46, -3623.33). The arch over 125th St spans 168 ft 6 in (51.36 m). The platforms of
// the 125th Street station (ways 426103086 Downtown, 426103087 Uptown) run from u = -98.8 to +58.0 m along the line from
// that crossing, 5.0-7.3 m either side of the centre track.
export const MVV = {
  C: [1088.46, -3623.33], dir: [0.48469, -0.87468], span: 51.36, rib: 5.0,
  topRail: 19.5, girderUnder: 18.06, plat: { u0: -98.8, u1: 58.0, l0: 5.15, l1: 7.75 },
};
// city/elevatedKit.js: an IRT bent standing inside the arch's span (the four bents in the street at 125th St)
export function mvvArchSkip(x, z) {
  if (!AR32W) return false;
  const dx = x - MVV.C[0], dz = z - MVV.C[1];
  const u = dx * MVV.dir[0] + dz * MVV.dir[1], l = dx * -MVV.dir[1] + dz * MVV.dir[0];
  return Math.abs(u) < MVV.span / 2 + 1.0 && Math.abs(l) < 20;
}

// Columbia's Manhattanville buildings the compile drew as stone boxes (CIVIC_STONE): rebuilt as their curtain walls on
// the OSM rings at the compiled heights (NYC building footprints). Kravis Hall (Diller Scofidio + Renfro, 2022): clear
// and fritted glass behind white vertical fins; David Geffen Hall (the same architects, 2022): fritted glass with
// horizontal floor bands; the Forum (Renzo Piano Building Workshop, 2018): glass with white aluminium floor bands.
export const COLUMBIA = [
  { name: 'Henry R. Kravis Hall', osm: 1025959314, c: [984.2, -3905.6], area: 2360, h: 38.4, floors: 11, fins: 1.5,
    ring: [[952.8, -3890.0], [989.3, -3870.7], [1016.2, -3921.3], [979.7, -3940.5]] },
  // AR34 w2 s2: lot162_23 and forum26nw (lS4mMvx 2026-08) show Geffen Hall as continuous light
  // grey slab bands (~0.7 m) with glass between and fine mullions, no vertical fins (the 3 m fin grid read as a box of
  // windows): `band` / `bandD` the bands' height and depth, `mullion` a fine pitch in place of `fins`. The bands' kinks and
  // the offset floors are not drawn (not measured). The height: lot162_23's top row (70 of 900, 26 deg up through the pair's
  // lens) at the ring's nearest corner (111 m) is ~56 m over the street, the bands' rows 45-55 px apart (~5 m there), each
  // ~1.2 m tall: `hReal` 51 m in 10 floors over the compiled 28.2 m;
  { name: 'David Geffen Hall', osm: 1025959316, c: [1091.3, -3847.1], area: 2583, h: 28.2, hReal: 51.0, floors: 10, fins: 3.0, band: 1.15, bandD: 0.6, mullion: 1.5, blinds: 0.06,
    ring: [[1086.3, -3883.7], [1125.1, -3862.0], [1096.8, -3811.0], [1058.4, -3831.4]] },
  { name: 'The Forum', osm: 664903766, c: [1066.9, -3700.5], area: 1608, h: 18.3, floors: 3, fins: 3.0,
    ring: [[1040.4, -3720.2], [1044.2, -3727.0], [1101.7, -3695.2], [1081.6, -3659.8], [1051.6, -3703.8], [1050.0, -3706.1]] },
];
// the Cotton Club, 656 W 125th St (OSM way 271923842, 6.4 m): its W 125th St front runs (916.8, -3844.0) -> (931.3, -3822.7)
export const COTTON = { a: [916.8, -3844.0], b: [931.3, -3822.7], c: [920.0, -3832.5] };

// shows it: green painted plywood at the back of the
// sidewalk, 2.74 m (the gate run 3.26 m), two diamond viewing panels, white concrete barriers with orange stripes in
// front. The line: the surface probe (boundlessjs/shots/ar34/west/b3_off/log.txt `eval:` line: the sidewalk ends 11-12 m
// out on the view's h45 ray, then no surface) along the corridor (unit (0.567, 0.824), ar33-corridor.json); heights and
// extents rows and columns at that line (t from o along d, metres): fence -5..16, gate 0.6-8.5, barriers
// -9..16, diamonds at -0.7 and 9.3 (1.39 m up). `?w33fence=0`: left out.
// barriers unbroken from the viaduct end to past t 111: its base projects onto this line within a few
// pixels at t 90-110 through that pair's lens; a second, taller gate run at t 96.5-101, diamonds at 104.5 and 110.5 there; the others every ~11 m between (not measured); the east end at t 116
export const FENCE23 = {
  on: !(Q && Q.get('w33fence') === '0'), o: [938.8, -3867.05], d: [0.567, 0.824], n: [-0.824, 0.567],
  t0: -5, t1: 116, b0: -9, b1: 117, gates: [[0.6, 8.5], [96.5, 101.0]], h: 2.74, hg: 3.26,
  diamonds: [-0.7, 9.3, 20.5, 31.5, 42.5, 53.5, 64.5, 75.5, 86.5, 104.5, 110.5], dy: 1.39,
};
// AR34 w2 s3 (FILM's t7ArchCrane review, 2026-10-02): the plaza under the Riverside Drive viaduct between Twelfth Avenue and
// the viaduct's roadway has a diagonal band of grey granite setts across its light paving; the compiled tile 1_-8 has no section there (terrain only,
// 0.28 m under the plaza's paving at 3.52: a sunken strip). Rows [z, x0, x1] of the terrain-only cells (0.25 m samples of
// the tile's sections, every second row kept), widened 0.3 m so the fill runs under the paving round it; the fill is laid
// at the paving's height (y). `?w33setts=0` leaves it out.
export const SETTS = {
  on: !(Q && Q.get('w33setts') === '0'), y: 3.52,
  rows: [[-3860.8, 888.2, 888.8], [-3860, 887.95, 889.05], [-3859.5, 887.7, 889.05], [-3859, 886.95, 889.05], [-3858.5, 886.45, 888.55],
    [-3858, 886.2, 888.3], [-3857.5, 885.7, 888.05], [-3857, 885.2, 887.8], [-3856.5, 884.95, 887.55], [-3856, 884.45, 887.3],
    [-3855.5, 883.95, 887.05], [-3855, 883.7, 886.8], [-3854.5, 883.2, 886.55], [-3854, 882.7, 886.05], [-3853.5, 882.45, 885.8],
    [-3853, 881.95, 885.55], [-3852.5, 881.45, 885.3], [-3852, 881.2, 885.05], [-3851.5, 880.7, 884.8], [-3851, 880.45, 884.55],
    [-3850.5, 879.95, 884.3], [-3850, 879.45, 883.8], [-3849.5, 879.2, 883.55], [-3849, 878.7, 883.3], [-3848.5, 878.2, 883.05],
    [-3848, 877.95, 882.8], [-3847.5, 877.45, 882.55], [-3847, 876.95, 882.3], [-3846.5, 876.7, 882.05], [-3846, 876.2, 881.8],
    [-3845.5, 875.95, 881.3], [-3845, 875.45, 881.05], [-3844.5, 874.95, 880.8], [-3844, 874.7, 880.55], [-3843.5, 874.2, 880.3],
    [-3843, 873.7, 880.05], [-3842.5, 873.7, 879.8], [-3842, 874.7, 879.55], [-3841.5, 875.45, 879.3], [-3841, 876.45, 878.55],
    [-3840.45, 876.95, 878.05]],
};
