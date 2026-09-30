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
  { name: 'David Geffen Hall', osm: 1025959316, c: [1091.3, -3847.1], area: 2583, h: 28.2, floors: 8, fins: 3.0,
    ring: [[1086.3, -3883.7], [1125.1, -3862.0], [1096.8, -3811.0], [1058.4, -3831.4]] },
  { name: 'The Forum', osm: 664903766, c: [1066.9, -3700.5], area: 1608, h: 18.3, floors: 3, fins: 3.0,
    ring: [[1040.4, -3720.2], [1044.2, -3727.0], [1101.7, -3695.2], [1081.6, -3659.8], [1051.6, -3703.8], [1050.0, -3706.1]] },
];
// the Cotton Club, 656 W 125th St (OSM way 271923842, 6.4 m): its W 125th St front runs (916.8, -3844.0) -> (931.3, -3822.7)
export const COTTON = { a: [916.8, -3844.0], b: [931.3, -3822.7], c: [920.0, -3832.5] };
