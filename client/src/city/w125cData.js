// AR32C measured facts for 125th Street's middle segment (docs/notes/area-w125c.md). World metres (x east, z south).
// Frontages are read off the compiled footprints (client/tools/probe_buildings.mjs, the tiles of 2026-09-30); the
// sidewalk and roadway widths off the compiled ground (client/tools/ar32/w125c_probe.mjs, a line at bearing 209 deg).

// The Apollo Theater, 253 W 125th St (compiled footprint #281 in tile 3_-6, landmark -8, h 20.0 m, pavement 3.52): the
// lobby building's 125th Street frontage, west end to east end, facing 209 deg. The north sidewalk is 5.75 m from the
// building line to the gutter, the roadway 18.25 m (bus lanes both sides), the south sidewalk 6.5 m.
export const APOLLO = {
  w: [1769.0, -2981.7],          // the frontage's west end
  e: [1781.9, -2974.7],          // its east end (14.68 m)
  walk: 5.75,                    // building line to the gutter
  h: 20.0,                       // the compiled extrusion (the balustrade's top)
};

// The facade (Commons photographs, docs/notes/area-w125c.md refs a1-a3): pale grey glazed terracotta, a rusticated pier
// at each end and four bays between three fluted Ionic pilasters, the second- and third-storey windows of each bay
// joined by a spandrel with a shield, a frieze, a modillion cornice and a balustrade; the marquee across the ground
// floor, the blade sign on the pilaster between the first and second bays from the west.
export const FACADE = {
  pier: 1.2, pil: 0.83,          // end piers and pilasters, m wide (the four bays share the rest: 2.46 m)
  win2: [6.8, 10.0], span: [10.0, 11.2], win3: [11.2, 15.4],   // over the pavement
  frieze: [15.8, 17.0], cornice: [17.0, 18.0], bal: [18.0, 20.0],
  mq: { y0: 4.35, y1: 6.95, d: 4.2, crest: 1.35 },             // the marquee: soffit, top, depth, the crest's height
  blade: { y0: 12.4, y1: 26.6, w: 2.5, t: 0.55, off: 1.05 },   // the blade sign: bottom, top, width, thickness, stand-off (clear of the cornice)
};

// The street frame for the sidewalk pieces: origin the Apollo's frontage midpoint (1775.45, -2978.2), t along 125th Street
// to the east (bearing 119 deg), b across it to the south (b = 0 the north building line, the north kerb at 5.75, the
// south kerb at 24.0, the south building line at 30.5; the Apollo's line probe). Frederick Douglass Blvd crosses the north
// sidewalk at t -101..-83, Adam Clayton Powell Jr Blvd at t 168..199 (a grass median at 182-186), both from the line
// probe at b = 3 (tools/ar32/w125c_probe.mjs). Everything here stays west of t 280 (Lenox Avenue's west kerb is at t 447,
// so the lenoxRef view's 40 m margin begins at t 407).
export const STREET = { o: [1775.45, -2978.2], u: [0.8746, 0.4848], n: [-0.4848, 0.8746] };

// The State Office Building's plaza (163 W 125th St): the compile left the lot between the north sidewalk and the
// tower's south face (e41, b -33.0) bare terrain; paved here from the boulevard's east sidewalk (t 199.5) to past the
// tower's east face (t 267.5), at the sidewalk's level.
export const SOB_PLAZA = { t0: 199.5, t1: 268.0, b0: -33.5, b1: 0.2 };

// Vendors' tables (125th Street's sidewalk trade: tables of hats, shirts, incense, oils and books under pop-up tents and
// umbrellas, the densest along the State Office plaza and across from the Apollo): [t, b, facing (1 south, -1 north), kind]
// kind 0 a tent, 1 an umbrella, 2 a bare table
export const VENDORS = [
  // the State Office plaza's front, a row 2 m back from the building line, facing the street
  [207, -2.2, 1, 0], [212, -2.2, 1, 1], [217.5, -2.2, 1, 0], [224, -2.2, 1, 2], [229, -2.2, 1, 0], [235, -2.2, 1, 1],
  [241, -2.2, 1, 0], [247.5, -2.2, 1, 2], [253, -2.2, 1, 0], [259, -2.2, 1, 1],
  // the south sidewalk across from the Apollo and the Victoria, 2 m in from the kerb (b 24.0), facing the shops, in the
  // gaps between the compiled street trees (t -39.8, -32.9, -23.7, -14.4, -5.8, 2.3, 10.4, 18.5, 65.7 ... 131.2, 141.0),
  // lamps (t -19.9, 40.1, 100.1), hydrants and bike racks (the tile's furniture records): 2 m or more from each
  [-28.3, 26.0, 1, 1], [-10.1, 26.0, 1, 2], [6.35, 26.0, 1, 1], [28, 26.0, 1, 0], [33.5, 26.0, 1, 2], [50, 26.0, 1, 0],
  [57, 26.0, 1, 1], [123, 26.0, 1, 0], [136.1, 26.0, 1, 2],
];

// The Studio Museum in Harlem's building (144 W 125th St, Adjaye Associates with Cooper Robertson, opened November 2025):
// the compiled footprint #378 (TENEMENT, 22.3 m, 15.0 x 61.9 m, centroid (1978.9, -2794.4), area 930) is replaced by the
// part's own massing. Frontage (e2) west end to east end, facing 29 deg onto 125th Street. The front (Commons "Studio
// Museum in Harlem, Nov 2025.jpg", s1): charcoal precast panels in stacked boxes with deep frames, a two-storey glazed
// lobby, ribbon windows, a tall glazed box over the entrance side, loggias cut into the upper boxes, the vertical STUDIO
// MUSEUM sign at the east end. H read off s1 against the width: about 1.9 x 15 m.
export const STUDIO = {
  w: [1987.2, -2825.2], e: [2000.4, -2817.9], D: 61.9, H: 28.5,
  skip: { cx: 1978.9, cz: -2794.4, area: 930 },
  // openings as [x0, x1, y0, y1, kind] in fractions of the width from the EAST end (as s1 is seen from the street) and
  // metres over the pavement; kind 0 glass, 1 lit lobby glass, 2 a loggia (a deep dark recess)
  open: [
    [0.05, 0.60, 3.2, 8.6, 1], [0.44, 0.66, 0.0, 2.6, 1], [0.66, 0.88, 0.0, 2.9, 0], [0.62, 0.88, 5.8, 8.9, 1],
    [0.26, 0.60, 10.3, 11.1, 1], [0.62, 0.88, 12.6, 21.0, 1], [0.10, 0.56, 14.9, 16.3, 1],
    [0.08, 0.28, 17.2, 20.0, 2], [0.36, 0.60, 17.6, 19.6, 0], [0.16, 0.40, 21.6, 27.4, 2],
  ],
  bands: [[9.3, 0, 1], [12.3, 0, 1], [16.8, 0, 0.6], [20.4, 0, 1]],   // the boxes' projecting slabs [y, from, to]: the
                                       // tall glazed box (0.62-0.88) runs through 16.8 unbroken (s1)
  fins: [0.60, 0.88],                  // and their vertical edges
};
