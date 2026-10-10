// AR32 hptShore data: the East River fleet's courses off Hunters Point (world metres, x east, z south).
// The ferry courses are NYC Ferry's routes as mapped in OpenStreetMap (route=ferry ways 1082168064 "East 34th Street -
// Long Island City", 1481634301, 1082168061 "East 34th Street - Hunters Point South", 1456980628 "Greenpoint - Hunters
// Point South"; the landings' amenity=ferry_terminal nodes: East 34th Street/Midtown at (41, 4352), Long Island City -
// Gantry Plaza at (1136, 3853), Hunters Point South/Long Island City at (831, 4585)). OpenStreetMap contributors, ODbL 1.0.
// The river's banks are the compiled terrain grid's water (client/tools/ar32/hptw_probe.mjs): at z 4200 the river
// runs from x ~100 (Manhattan, East 38th Street) to x 1050 (Gantry Plaza's piers); at z 4600 to x 875 (Hunters Point
// South Park); the mouth of Newtown Creek is at z 4830-4990, x 750-1150.

// The ferries berth bow-in, their centre 13-16 m off the landing's float (the boats load over the bow).
// a course: pts (polyline, smoothed at build), stops [index into pts, dwell s], v cruise (m/s), a (m/s2), phase (s)
export const HPT_COURSES = {
  // the Astoria route's crossing: East 34th Street -> Long Island City (Gantry Plaza) and back
  ferryA: {
    pts: [[41, 4352], [68, 4311], [183, 4255], [276, 4246], [428, 4222], [593, 4175], [661, 4134], [834, 3934], [953, 3884],
      [1039, 3876], [1064, 3873], [1095, 3875], [1112, 3871]],
    stops: [[0, 45], [12, 45]], v: 8.5, a: 0.3, phase: 0,
  },
  // the East River route's crossing: Greenpoint -> Hunters Point South -> East 34th Street and back
  ferryB: {
    pts: [[590, 5688], [580, 5569], [660, 4772], [676, 4718], [710, 4666], [758, 4625], [802, 4594], [817, 4586],
      [790, 4577], [600, 4538], [147, 4445], [64, 4435], [23, 4413]],
    stops: [[0, 30], [7, 50], [12, 45]], v: 8.5, a: 0.3, phase: 140,
  },
  // tugs pushing deck barges on the channel, north and south of each other
  tugA: { pts: [[1050, 3050], [850, 3300], [740, 3500], [680, 3800], [600, 4300], [560, 4800], [540, 5400]], stops: [[0, 20], [6, 20]], v: 2.3, a: 0.05, phase: 300 },
  tugB: { pts: [[1090, 3050], [890, 3300], [780, 3500], [720, 3800], [640, 4300], [600, 4800], [580, 5400]], stops: [[0, 20], [6, 20]], v: 2.0, a: 0.05, phase: 1500 },
  // a sloop reaching across the wind (from the south-south-west) off Hunters Point South, another off Gantry Plaza
  sloopA: { pts: [[430, 4520], [790, 4610]], stops: [[0, 4], [1, 4]], v: 2.6, a: 0.15, phase: 30 },
  sloopB: { pts: [[520, 4020], [900, 4120]], stops: [[0, 4], [1, 4]], v: 2.3, a: 0.15, phase: 90 },
  // a motor yacht running the river
  yacht: { pts: [[1000, 3050], [800, 3300], [700, 3500], [620, 3850], [520, 4400], [470, 5000], [450, 5500]], stops: [[0, 10], [6, 10]], v: 6.5, a: 0.25, phase: 60 },
};

// the fleet: [kind, course, phase added to the course's (s)]; two boats on each ferry route (the second on the East
// River route berthed at Hunters Point South from 121 to 171 s on the fleet's clock)
export const HPT_FLEET = [
  ['ferry', 'ferryA'], ['ferry', 'ferryB'], ['ferry', 'ferryA', 220], ['ferry', 'ferryB', 278],
  ['tug', 'tugA'], ['tug', 'tugB'],
  ['sloop', 'sloopA'], ['sloop', 'sloopB'],
  ['yacht', 'yacht'],
];

// Hunters Point South Park's seawall, 50th Avenue to the overlook at the point: OpenStreetMap natural=coastline way
// 179055612 (OpenStreetMap contributors, ODbL 1.0), world metres, north to south (the river to the west)
export const HPT_SEAWALL = [[962.4, 4388], [954.7, 4389.2], [939.8, 4388.4], [907, 4396.1], [898.3, 4399.8], [881.3, 4418.8],
  [872.6, 4436.6], [871.1, 4442.5], [870.1, 4451.6], [859, 4482.4], [851.8, 4479], [812.1, 4568.3], [840.7, 4574.8],
  [843.8, 4579.4], [846.8, 4590.7], [848.2, 4599.4], [847.9, 4620.3], [846.1, 4630.9], [837.3, 4649.7], [843.1, 4658.6],
  [841.9, 4661.6], [834.7, 4659.5], [831.1, 4660.7], [822.4, 4661], [815.9, 4659.8], [798.7, 4664.1], [792.7, 4667.1],
  [787.7, 4672], [784.8, 4678.5], [781.1, 4687.7], [779.7, 4695.1], [780.5, 4702.4], [784.5, 4710], [790.4, 4718.2],
  [804, 4725], [815.1, 4728.1], [818.9, 4731.6], [826.9, 4735.1], [836, 4739], [836.7, 4741.6], [834.5, 4748.4],
  [828.3, 4750], [822.9, 4751.1], [819.7, 4758], [814.3, 4765], [811.1, 4765.6], [810.3, 4769], [806.6, 4775.2],
  [799.2, 4781.1], [794.5, 4785.1], [785, 4785.1], [777.5, 4783.9], [771.4, 4783.9], [766.8, 4782.1], [764.3, 4784.5],
  [752.4, 4792.6], [744.1, 4800.3], [734.7, 4813.7], [730.2, 4831.3], [729, 4848.2], [729.1, 4859.2], [726.8, 4870],
  [722.8, 4881.3], [719.4, 4890], [717.3, 4902.1], [715.8, 4920.6], [716, 4935.1], [719.6, 4940.8], [693.2, 4968.4]];
// the Hunters Point South ferry landing: OSM footway 306526981 (the gangway, shore end first) and man_made=pier 130468195
// (the float at its end, x 830-837, z 4581-4590)
export const HPT_LANDING = { shore: [855.4, 4589.2], float0: [836.7, 4584.1], float1: [830.8, 4584.7], floatW: 9.0 };
