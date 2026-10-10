// AR33 BID3 measured facts for the w125cb part (125th Street, Adam Clayton Powell Jr. Boulevard to Lenox Avenue): the State
// Office Building's plaza and the sidewalk vendors. Owner: the BID3 worker (docs/notes/ar33-bid3.md). World metres (x east,
// z south). Copied from w125cData.js (BID2's file) on 2026-09-30 and re-measured: the plaza off the 2024-08 / 2026-08

// The street frame (as w125cData.js STREET): origin the Apollo's frontage midpoint, t east along 125th Street (bearing
// 119), b south across it (b = 0 the north building line, the north kerb 5.75, the south kerb 24.0, the south building
// line 31.0). Adam Clayton Powell Jr. Blvd's east kerb crosses at t 199.5; its east sidewalk runs to the plaza at t 207.
export const STREET = { o: [1775.45, -2978.2], u: [0.8746, 0.4848], n: [-0.4848, 0.8746] };

// The State Office Building's plaza: the tower's south face at b -33.0 (t 205.84-267.56), its north face at b -57.7; the
// plaza from the boulevard's east kerb to the white retail block (t 293.9), and east of the tower north to b -57.7.
export const PLAZA = {
  quads: [[199.5, 294.0, -33.5, 0.2], [267.3, 294.0, -58.0, -33.3]],     // [t0, t1, b0, b1] paved in the ground section
  // the light pavers' field (buff granite squares, ~0.9 m) and the dark-grey granite crescent band that sweeps from the
  // tower's north-east round the east and the south sides to a point by the west planter
  field: [[207.0, 294.0, -33.1, 0.2], [267.4, 294.0, -57.8, -33.1]],
  crescentOuter: [[276.9, -55.9], [283.4, -56.5], [289.9, -53.0], [293.1, -47.0], [293.6, -37.5], [292.0, -28.0], [286.6, -18.5],
    [278.0, -11.4], [265.1, -5.4], [250.0, -2.1], [234.9, -1.3], [222.0, -2.4], [214.4, -6.6], [211.2, -12.5], [211.2, -20.9],
    [212.8, -26.8], [214.4, -27.4]],
  crescentInner: [[276.9, -55.3], [281.2, -39.9], [282.3, -29.2], [275.8, -20.9], [265.1, -14.3], [250.0, -10.2], [234.9, -9.0],
    [222.0, -10.4], [215.5, -14.9], [214.2, -22.1], [214.4, -27.4]],
  // the serpentine planters: dark granite walls 0.55 m high round clipped boxwood, S-shaped chains of lobes along the front
  // (b -4.8..-1.8) and one along the boulevard side; [t0, t1, b] of each chain (the lobes alternate either side of b)
  planters: [[218.7, 233.8, -3.3], [245.7, 264.0, -3.3], [273.2, 286.6, -3.3]],
  westPlanter: [210.6, -28.6, -14.3],                                     // [t, b0, b1]
  benches: [[219.0, 225.0, -5.6], [227.0, 233.0, -5.6], [246.0, 252.0, -5.6], [254.0, 260.0, -5.6], [274.0, 280.0, -5.6]],   // steel slat, facing the street
  // The Higher Ground (Branly Cadet, 2005): a bronze figure of Adam Clayton Powell Jr. striding west up the slanted top of a
  // polished stainless-steel form (an oval plaque on its south face), on a low black granite drum lettered ADAM CLAYTON
  // POWELL JR. in gold.
  // from the bisectors of its tangents); az the compass bearing of the long axis (local +x, toward its east-north-east end;
  // local +z toward the street); drum [half-length, half-width, height] (an ellipse, not a circle: 01600 sees 9.1 m across,
  // 01584 4.4 m); form: the stainless form in the drum's frame: its base centre `at` (triangulated: 01600 x 01584), its
  // base's half-length / half-width, `lean` (the west edge's rise toward the east per metre), the peak [x, height over the
  // drum] (2.89 / 2.96 / 3.07 m seen from 01600 / 01610 / 01584), `east` the east end's height (1.74 / 1.87), cSlope the
  // half-width lost per metre up (along the axis 01565 / 01584 see 0.78 m at the foot, ~0.49 at 1.6 m, ~0.28 at 2.3 m);
  // plaque [x, height, width, height] on the south face; fig: the figure's scale (head top 5.0-5.26 m over the drum)
  monument: { t: 208.78, b: -3.48, az: 79, drum: [4.7, 2.0, 0.45],
    form: { at: [1.66, -0.33], half: [1.65, 0.85], lean: 0.27, peak: [-0.85, 3.12], east: 1.97, cSlope: 0.2, cCurve: 0.025 },
    plaque: [0.3, 1.0, 2.0, 0.75], fig: 1.32 },
  flagpoles: [[224.6, -11.2], [227.8, -10.8]],
  lamps: [[217.0, -27.6], [256.5, -27.6], [236.8, -14.0], [270.5, -24.0]],   // black poles with a pair of lantern heads
  // bollards: grey steel posts 0.9 m along the plaza's front and its boulevard side, gaps at the planters' ends
  bollards: { front: [207.4, 293.4, 0.05, 1.55], west: [207.1, -29.0, 0.0, 1.55] },
};

// Vendors' tables [t, b, facing (1 south, -1 north), kind]; kind 0 a tent, 1 an umbrella, 2 a bare table. 125th Street's
// sidewalk trade (hats, shirts, incense, oils, books).
// front (backs to the street, facing the sidewalk) and on the south sidewalk in front of the Studio Museum, Panda Express
// and the Koch building; the south-sidewalk row across from the Apollo and the Victoria is kept from w125cData.js.
export const VENDORS = [
  // the north kerb along the State Office plaza, 1.6 m in from the kerb (b 5.75), facing the sidewalk
  [224.5, 4.15, -1, 1], [230.5, 4.15, -1, 2], [237.0, 4.15, -1, 0], [258.5, 4.15, -1, 1], [264.5, 4.15, -1, 2], [277.0, 4.15, -1, 0], [284.0, 4.15, -1, 1],
  // the produce stall in front of 105 W's entrance: white umbrellas over a long table, 2-3 m off the white block
  [301.5, 3.3, -1, 1], [307.0, 3.0, -1, 1], [312.5, 3.4, -1, 0],
  // the south sidewalk (building line b 31.0): the Studio Museum (t 258.9-281.8), the Koch building (t 281.8-312.1),
  // Panda Express (t 312.1-318.6)
  [268.6, 27.6, -1, 0], [285.5, 26.2, -1, 2], [316.0, 26.2, -1, 1],
  // the south sidewalk across from the Apollo and the Victoria (w125cData.js, BID2's stretch; unchanged)
  [-28.3, 26.0, 1, 1], [-10.1, 26.0, 1, 2], [6.35, 26.0, 1, 1], [28, 26.0, 1, 0], [33.5, 26.0, 1, 2], [50, 26.0, 1, 0],
  [57, 26.0, 1, 1], [123, 26.0, 1, 0], [136.1, 26.0, 1, 2],
];
