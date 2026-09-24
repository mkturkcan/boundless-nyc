// Landmark registry — compiler marks the building footprint containing (lat,lon)
// with the landmark id; the runtime swaps in / decorates with a custom builder.
// mode: 'replace' = custom massing replaces the extrusion
//       'decorate' = data extrusion kept, builder adds signature elements (spire, crown...)
export const LANDMARKS = [
  // ---- Morningside Heights & Harlem (priority) ----
  { id: 1,  key: 'lowLibrary',      name: 'Low Memorial Library',        lat: 40.80800, lon: -73.96188, mode: 'replace' },
  { id: 2,  key: 'butlerLibrary',   name: 'Butler Library',              lat: 40.80642, lon: -73.96319, mode: 'replace' },
  { id: 3,  key: 'stPaulsChapel',   name: "St. Paul's Chapel (Columbia)",lat: 40.80785, lon: -73.96035, mode: 'replace' },
  { id: 4,  key: 'riversideChurch', name: 'Riverside Church',            lat: 40.81110, lon: -73.96420, mode: 'replace' },
  { id: 5,  key: 'grantsTomb',      name: "General Grant National Memorial", lat: 40.81340, lon: -73.96320, mode: 'replace' },
  { id: 6,  key: 'stJohnDivine',    name: 'Cathedral of St. John the Divine', lat: 40.80390, lon: -73.96180, mode: 'replace' },
  { id: 7,  key: 'shepardHall',     name: 'Shepard Hall (City College)', lat: 40.81985, lon: -73.94935, mode: 'replace' },
  { id: 8,  key: 'apolloTheater',   name: 'Apollo Theater',              lat: 40.81007, lon: -73.95003, mode: 'decorate' },
  { id: 9,  key: 'hotelTheresa',    name: 'Hotel Theresa',               lat: 40.80920, lon: -73.94910, mode: 'decorate' },
  { id: 10, key: 'acpStateOffice',  name: 'A.C. Powell Jr. State Office Bldg', lat: 40.80950, lon: -73.94830, mode: 'decorate' },
  { id: 11, key: 'hamiltonGrange',  name: 'Hamilton Grange',             lat: 40.82140, lon: -73.94710, mode: 'replace' },
  { id: 12, key: 'schomburg',       name: 'Schomburg Center',            lat: 40.81460, lon: -73.94075, mode: 'decorate' },
  { id: 13, key: 'abyssinian',      name: 'Abyssinian Baptist Church',   lat: 40.81635, lon: -73.94085, mode: 'replace' },
  { id: 14, key: 'whittierHall',    name: 'Whittier Hall (Teachers College)', lat: 40.80987, lon: -73.95935, mode: 'decorate' }, // slate roof, dormers, turrets, limestone base (2026-09-15)

  // ---- Skyline icons ----
  { id: 20, key: 'empireState',     name: 'Empire State Building',       lat: 40.74842, lon: -73.98566, mode: 'replace' },
  { id: 21, key: 'chrysler',        name: 'Chrysler Building',           lat: 40.75162, lon: -73.97550, mode: 'replace' },
  { id: 22, key: 'oneWTC',          name: 'One World Trade Center',      lat: 40.71274, lon: -74.01339, mode: 'replace' },
  { id: 23, key: 'thirtyRock',      name: '30 Rockefeller Plaza',        lat: 40.75874, lon: -73.97870, mode: 'replace' },
  { id: 24, key: 'flatiron',        name: 'Flatiron Building',           lat: 40.74106, lon: -73.98964, mode: 'replace' },
  { id: 25, key: 'metLife',         name: 'MetLife Building',            lat: 40.75410, lon: -73.97640, mode: 'replace' },
  { id: 26, key: 'woolworth',       name: 'Woolworth Building',          lat: 40.71240, lon: -74.00834, mode: 'replace' },
  { id: 27, key: 'oneVanderbilt',   name: 'One Vanderbilt',              lat: 40.75290, lon: -73.97869, mode: 'replace' },
  { id: 28, key: 'p432park',        name: '432 Park Avenue',             lat: 40.76160, lon: -73.97190, mode: 'replace' },
  { id: 29, key: 'cpTower',         name: 'Central Park Tower',          lat: 40.76632, lon: -73.98103, mode: 'replace' },
  { id: 30, key: 'steinway',        name: '111 West 57th (Steinway)',    lat: 40.76470, lon: -73.97760, mode: 'replace' },
  { id: 31, key: 'hearst',          name: 'Hearst Tower',                lat: 40.76655, lon: -73.98565, mode: 'replace' },
  { id: 32, key: 'citigroup',       name: 'Citigroup Center',            lat: 40.75880, lon: -73.97020, mode: 'replace' },
  { id: 33, key: 'unSecretariat',   name: 'UN Secretariat',              lat: 40.74900, lon: -73.96800, mode: 'replace' },
  { id: 34, key: 'grandCentral',    name: 'Grand Central Terminal',      lat: 40.75266, lon: -73.97733, mode: 'replace' },
  // Bryant Park's OSM polygon swallows the library parcel: no lawn in a Manhattan-grid box around the
  // building (along the avenue +/-72 m, across from 46 m west of the centre to 56 m east = the 5th Ave
  // kerb). The old 78 m radius left lawn on the 5th Ave corners (critic R4 #8).
  // across reaches the 5th Ave kerb (~80 m east of the centre): the terrace between the library and
  // the avenue is stone, and lawn ran down that strip through critic rounds 4 and 5
  { id: 35, key: 'nypl',            name: 'NY Public Library',           lat: 40.75320, lon: -73.98220, mode: 'replace', noLawnBox: { along: [-72, 72], across: [-46, 84] } },
  { id: 36, key: 'stPatricks',      name: "St. Patrick's Cathedral",     lat: 40.75850, lon: -73.97600, mode: 'replace' },
  { id: 37, key: 'trinityChurch',   name: 'Trinity Church',              lat: 40.70810, lon: -74.01200, mode: 'replace' },
  { id: 38, key: 'federalHall',     name: 'Federal Hall',                lat: 40.70740, lon: -74.01020, mode: 'replace' },
  { id: 39, key: 'nyse',            name: 'NY Stock Exchange',           lat: 40.70690, lon: -74.01130, mode: 'replace' },
  { id: 40, key: 'municipalBldg',   name: 'Municipal Building',          lat: 40.71270, lon: -74.00410, mode: 'replace' },
  { id: 41, key: 'p56leonard',      name: '56 Leonard',                  lat: 40.71790, lon: -74.00480, mode: 'replace' },
  { id: 42, key: 'p8spruce',        name: '8 Spruce Street',             lat: 40.71100, lon: -74.00550, mode: 'replace' },
  { id: 43, key: 'msg',             name: 'Madison Square Garden',       lat: 40.75050, lon: -73.99340, mode: 'replace' },
  { id: 44, key: 'metMuseum',       name: 'The Met',                     lat: 40.77940, lon: -73.96320, mode: 'decorate' },
  { id: 45, key: 'guggenheim',      name: 'Guggenheim Museum',           lat: 40.78300, lon: -73.95900, mode: 'replace' },
  { id: 46, key: 'amnh',            name: 'Museum of Natural History',   lat: 40.78130, lon: -73.97400, mode: 'decorate' },
  { id: 47, key: 'dakota',          name: 'The Dakota',                  lat: 40.77650, lon: -73.97610, mode: 'decorate' },
  { id: 48, key: 'sanRemo',         name: 'The San Remo',                lat: 40.77490, lon: -73.97660, mode: 'replace' },
  { id: 49, key: 'plaza',           name: 'The Plaza',                   lat: 40.76450, lon: -73.97440, mode: 'decorate' },
  { id: 50, key: 'waldorf',         name: 'Waldorf Astoria',             lat: 40.75640, lon: -73.97430, mode: 'decorate' },
  { id: 51, key: 'p40wall',         name: '40 Wall Street',              lat: 40.70740, lon: -74.00890, mode: 'replace' },
  { id: 52, key: 'p70pine',         name: '70 Pine Street',              lat: 40.70630, lon: -74.00740, mode: 'replace' },
  { id: 53, key: 'p28liberty',      name: '28 Liberty',                  lat: 40.70805, lon: -74.00885, mode: 'replace' },
  { id: 54, key: 'seagram',         name: 'Seagram Building',            lat: 40.75850, lon: -73.97220, mode: 'replace' },
  { id: 55, key: 'leverHouse',      name: 'Lever House',                 lat: 40.75980, lon: -73.97240, mode: 'replace' },
  { id: 56, key: 'metOpera',        name: 'Metropolitan Opera House',    lat: 40.77280, lon: -73.98430, mode: 'replace' },
  { id: 57, key: 'oneTimesSquare',  name: 'One Times Square',            lat: 40.75630, lon: -73.98660, mode: 'replace' },
  { id: 58, key: 'boaTower',        name: 'Bank of America Tower',       lat: 40.75550, lon: -73.98450, mode: 'replace' },
  { id: 59, key: 'p30hudson',       name: '30 Hudson Yards',             lat: 40.75390, lon: -74.00110, mode: 'replace' },
  { id: 60, key: 'one57',           name: 'One57',                       lat: 40.76545, lon: -73.97875, mode: 'replace' },
];

// District style overrides — polygon (lon/lat) forcing palette/behavior.
export const DISTRICTS = [
  { key: 'columbia', style: 'COLUMBIA_CAMPUS', // full Morningside superblock: 114th-120th, Broadway-Amsterdam (property lines, fit from CSCL)
    poly: [[-73.96465, 40.80674], [-73.9621, 40.80566], [-73.95945, 40.80929], [-73.96203, 40.81037]] },
  // Teachers College block (W 120th-121st, Amsterdam-Broadway): red brick + limestone Collegiate Gothic halls, no shops,
  // no fire escapes, no wooden tanks (refs/earth/amst120_top.png, refs/streetview/amst120; owner 2026-09-15)
  { key: 'teachersCollege', style: 'TEACHERS_COLLEGE',
    poly: [[-73.95945, 40.80929], [-73.96203, 40.81037], [-73.96157, 40.81100], [-73.95899, 40.80992]] },
  { key: 'soho', style: 'CAST_IRON',
    poly: [[-74.0043, 40.7194], [-73.9959, 40.7228], [-73.9975, 40.7266], [-74.0053, 40.7237]] },
  { key: 'timessq', style: 'BILLBOARDS',
    poly: [[-73.9890, 40.7546], [-73.9856, 40.7541], [-73.9838, 40.7594], [-73.9873, 40.7599]] },
];

// Per-building TRUTH overrides (owner 2026-09-15): a (lat, lon) inside the footprint plus the facade facts read off
// reference imagery (refs/earth, refs/streetview — reference only, never shipped). The compiler applies them AFTER
// classify() and the district rules, so a campus building can escape the McKim copper-roof treatment when it is a
// 1961 brick tower. Fields: style (STYLE key), color [r,g,b], roofKind shape (0 flat, 1 gable, 2 hip), floors,
// floorH, winW, storeH, set/clear (BF flag names), wall (nycDress wall family, applied at read time only). Missing fields
// keep the classifier's value.
export const BUILDING_OVERRIDES = [
  // ---- W 120th St & Amsterdam Ave, Morningside Heights (refs/earth/amst120_*.png, refs/streetview/amst120/*) ----
  { key: 'muddHall', name: 'Seeley W. Mudd Hall (Columbia Engineering, 1961)', lat: 40.80939, lon: -73.96005,
    // PROJECT_BRICK = red-brown brick, regular small windows, no cornice/sills/AC clutter: the closest style to a 1961
    // engineering tower (the critic read the PREWAR_APT version as an apartment block, docs/notes/amst120-critic.md)
    style: 'PROJECT_BRICK', color: [112, 60, 46], roofKind: 0, floors: 14, floorH: 4.6, winW: 1.8, storeH: 0,
    clear: ['CORNICE', 'WATERTOWER', 'STOREFRONT', 'SETBACKS', 'FIRE_ESCAPE'] },
  { key: 'schapiroCepsr', name: 'Schapiro CEPSR (Columbia, 1992)', lat: 40.80957, lon: -73.96043,
    style: 'POSTWAR_BRICK', color: [150, 78, 58], roofKind: 0, storeH: 0,
    clear: ['CORNICE', 'WATERTOWER', 'STOREFRONT', 'SETBACKS'] },
  { key: 'whittierHall', name: 'Whittier Hall (Teachers College, 1901): red brick, limestone base', lat: 40.80978, lon: -73.95914,   // 3 m in from the Amsterdam wall: the centroid falls in a court
    // 11 storeys to the eave (two-storey rusticated limestone base, eight of brick, the gabled attic): the data's 9 x 4.8 m
    // put the base's water-table course across the second-floor windows (owner 2026-09-24, the white line)
    style: 'PREWAR_APT', color: [158, 74, 52], roofKind: 0, storeH: 0, floors: 11, floorH: 3.65,
    set: ['CORNICE'], clear: ['STOREFRONT', 'WATERTOWER', 'FIRE_ESCAPE'] },
  { key: 'tcLowWing', name: 'Teachers College low wing on W 120th', lat: 40.80983, lon: -73.95953,
    style: 'PREWAR_APT', color: [158, 74, 52], roofKind: 0, storeH: 0, clear: ['STOREFRONT', 'WATERTOWER'] },
  // the ground floors of the two east corners are modelled shop by shop in src/city/namedShops.js (Appletree Market / Deli
  // on 1225; Hartley Chemist, Hartley Pharmacy, Sliced, Suzi Confections on 1217-1219): the procedural storefront is off,
  // which also puts the residential limestone base back on their W 120th sides (refs: no shops there)
  { key: 'amst1225', name: 'NE corner: 1225 Amsterdam, tan pre-war apartments over Appletree Market', lat: 40.80945, lon: -73.95873,
    style: 'PREWAR_APT', color: [196, 172, 132], wall: 'brickTan', base: { wall: 'limestone', floors: 2 }, roofKind: 0, set: ['CORNICE'], clear: ['FIRE_ESCAPE', 'STOREFRONT'] },
  { key: 'amstSE120', name: 'SE corner: 1217-1219 Amsterdam, buff brick over a limestone base, Hartley Chemist', lat: 40.80897, lon: -73.95900,
    style: 'PREWAR_APT', color: [190, 166, 128], wall: 'brickTan', base: { wall: 'limestone', floors: 3 }, roofKind: 0, set: ['CORNICE'], clear: ['FIRE_ESCAPE', 'STOREFRONT'] },
];
