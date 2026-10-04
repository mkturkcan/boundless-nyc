// Landmark registry — compiler marks the building footprint containing (lat,lon)
// with the landmark id; the runtime swaps in / decorates with a custom builder.
// mode: 'replace' = custom massing replaces the extrusion
//       'decorate' = data extrusion kept, builder adds signature elements (spire, crown...)
export const LANDMARKS = [
  // ---- Morningside Heights & Harlem (priority) ----
  { id: 1,  key: 'lowLibrary',      name: 'Low Memorial Library',        lat: 40.80800, lon: -73.96188, mode: 'replace' },
  { id: 2,  key: 'butlerLibrary',   name: 'Butler Library',              lat: 40.80642, lon: -73.96319, mode: 'replace' },
  // CR24: was lon -73.96035, 55 m east of the chapel, inside Fayerweather Hall's footprint (the chapel replaced Fayerweather
  // and the real chapel drew as a generic hall); this point is the chapel's own crossing (refs/earth/col_earth_north.png)
  { id: 3,  key: 'stPaulsChapel',   name: "St. Paul's Chapel (Columbia)",lat: 40.807854, lon: -73.960942, mode: 'replace' },
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
  // CP33: the old point (40.77490, -73.97660) was 370 m south-west of the San Remo, on an 18-storey block at Columbus Avenue
  // and W 73rd (the twin-tower builder had replaced that block; the San Remo stayed a plain 120 m extrusion). This point is
  // the pole of inaccessibility of the San Remo's compiled footprint (tile -1_1 #13, 145-146 Central Park West, 10 m clear
  // of every wall, in the wing behind the park front); a recompile marks it, the read-time overrides at the end of this
  // file (CP33) do the same on the tiles already built
  { id: 48, key: 'sanRemo',         name: 'The San Remo',                lat: 40.777914, lon: -73.975386, mode: 'replace' },
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
  // CP33 (the Central Park South skyline the teaser frames): decorate builders on the rooftops; points are the poles of
  // inaccessibility of the compiled footprints (tile -2_3 #37 and #50)
  { id: 61, key: 'essexHouse',      name: 'Essex House (160 Central Park South)', lat: 40.766182, lon: -73.978516, mode: 'decorate' },
  { id: 62, key: 'hampshireHouse',  name: 'Hampshire House (150 Central Park South)', lat: 40.766044, lon: -73.977978, mode: 'decorate' },
];
// AR32C (city/w125c.js): the 125th Street part builds the Apollo's front itself (the terracotta, the marquee, the blade
// sign); the old decorate builder's red and white boxes are kept off by giving the entry, in the browser only, a key no
// builder has (the compiled footprint keeps its landmark id). `?ar32c=0` or `?ar32=0` restores it.
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && q.get('ar32c') !== '0' && q.get('ar32') !== '0') { const a = LANDMARKS.find((l) => l.id === 8); if (a) a.key = 'apolloTheaterAR32C'; }
}
// /AR32C

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
  // CR24: the old point (40.80957, -73.96043) fell in a 32 m2 sliver between CEPSR and Mudd; this one is inside CEPSR, whose
  // crown is a pale copper-green mansard with a flat top (refs/earth/col_earth_north.png)
  { key: 'schapiroCepsr', name: 'Schapiro CEPSR (Columbia, 1992)', lat: 40.809604, lon: -73.960750,
    style: 'POSTWAR_BRICK', color: [150, 78, 58], roofKind: 2, storeH: 0, roof: { form: 'mansard', tone: 'pale', dormers: 0 },
    clear: ['CORNICE', 'WATERTOWER', 'STOREFRONT', 'SETBACKS'] },
  { key: 'whittierHall', name: 'Whittier Hall (Teachers College, 1901): red brick, limestone base', lat: 40.80978, lon: -73.95914,   // 3 m in from the Amsterdam wall: the centroid falls in a court
    // 11 storeys to the eave (two-storey rusticated limestone base, eight of brick, the gabled attic): the data's 9 x 4.8 m
    // put the base's water-table course across the second-floor windows (owner 2026-09-24, the white line)
    style: 'PREWAR_APT', color: [158, 74, 52], roofKind: 0, storeH: 0, floors: 11, floorH: 3.65,
    set: ['CORNICE'], clear: ['STOREFRONT', 'WATERTOWER', 'FIRE_ESCAPE'] },
  { key: 'tcLowWing', name: 'Teachers College low wing on W 120th', lat: 40.80983, lon: -73.95953,
    style: 'PREWAR_APT', color: [158, 74, 52], roofKind: 0, storeH: 0, clear: ['STOREFRONT', 'WATERTOWER'] },
  // ---- COLUMBIA MORNINGSIDE CAMPUS ROOFS (CR24, owner 2026-09-24: "Columbia buildings' roofs are missing; look at Google
  // Earth images etc. to see what they look like and implement them correctly"). Read off refs/earth/col_earth_{top,north,n,
  // e,w}.png (reference only, never shipped). `roof` is runtime-only (tiledata.js -> assemble.js crPlan): form 'mansard'
  // (steep copper holding the attic storey, flat top), 'hip' (to a ridge), 'dome', 'flat'; tone 'mint' (verdigris) or 'pale'
  // (the grey-green of Kent, Hamilton, Journalism, Havemeyer); dormers (row density, 0 = none); chimneys (count); domes
  // (observatory domes on the top). Points are the pole of inaccessibility of each compiled footprint.
  { key: 'cuHavemeyer', name: 'Havemeyer Hall', lat: 40.809311, lon: -73.962214, roofKind: 2, roof: { form: 'mansard', tone: 'pale', dormers: 1, chimneys: 2 } },
  { key: 'cuSchermerhorn', name: 'Schermerhorn Hall', lat: 40.808560, lon: -73.960426, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 0.8, chimneys: 2 } },
  { key: 'cuAvery', name: 'Avery Hall', lat: 40.808379, lon: -73.960863, roofKind: 2, roof: { form: 'hip', tone: 'mint', dormers: 0 } },
  { key: 'cuFayerweather', name: 'Fayerweather Hall (the chapel landmark had been placed here)', lat: 40.808131, lon: -73.960432, landmarkId: 0, roofKind: 2, roof: { form: 'hip', tone: 'mint', dormers: 0 } },
  { key: 'cuStPauls', name: 'St. Paul\'s Chapel footprint (landmark builder)', lat: 40.807854, lon: -73.960942, landmarkId: 3 },
  { key: 'cuPhilosophy', name: 'Philosophy Hall', lat: 40.807489, lon: -73.960901, roofKind: 2, roof: { form: 'hip', tone: 'mint', dormers: 0.6, chimneys: 2 } },
  { key: 'cuBuell', name: 'Buell Hall (1885): slate', lat: 40.807715, lon: -73.961427, roofKind: 2, roof: { form: 'hip', tone: 'slate', dormers: 0, pitch: 42 } },
  { key: 'cuEarl', name: 'Earl Hall: pale dome', lat: 40.808602, lon: -73.962707, roofKind: 2, roof: { form: 'dome', tone: 'lead' } },
  { key: 'cuMathematics', name: 'Mathematics Hall', lat: 40.809107, lon: -73.962674, roofKind: 2, roof: { form: 'hip', tone: 'mint', dormers: 0.6 } },
  { key: 'cuLewisohn', name: 'Lewisohn Hall', lat: 40.808349, lon: -73.963224, roofKind: 2, roof: { form: 'hip', tone: 'mint', dormers: 0.7 } },
  { key: 'cuJournalism', name: 'Pulitzer Hall (Journalism)', lat: 40.808064, lon: -73.963401, roofKind: 2, roof: { form: 'mansard', tone: 'pale', dormers: 1 } },
  { key: 'cuKent', name: 'Kent Hall', lat: 40.807235, lon: -73.961388, roofKind: 2, roof: { form: 'mansard', tone: 'pale', dormers: 1, chimneys: 2 } },
  { key: 'cuDodge', name: 'Dodge Hall', lat: 40.807530, lon: -73.963326, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 1 } },
  { key: 'cuFurnald', name: 'Furnald Hall', lat: 40.807502, lon: -73.963830, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 1.2, chimneys: 3 } },
  { key: 'cuHamilton', name: 'Hamilton Hall', lat: 40.806881, lon: -73.961770, roofKind: 2, roof: { form: 'mansard', tone: 'pale', dormers: 1, chimneys: 2 } },
  { key: 'cuHartley', name: 'Hartley Hall', lat: 40.806325, lon: -73.961760, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 1.2, chimneys: 3 } },
  { key: 'cuWallach', name: 'Wallach Hall', lat: 40.806041, lon: -73.961968, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 1.2, chimneys: 3 } },
  { key: 'cuJohnJay', name: 'John Jay Hall', lat: 40.805905, lon: -73.962362, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 1.2, chimneys: 4 } },
  { key: 'cuPupin', name: 'Pupin Hall: copper with the Rutherfurd Observatory domes', lat: 40.809925, lon: -73.961203, roofKind: 2, roof: { form: 'mansard', tone: 'mint', dormers: 0.6, domes: 2 } },
  // post-war and late-modern buildings: flat roofs (Uris 1964, Carman 1959, Fairchild 1977, Lerner 1999, NW Corner 2010...)
  { key: 'cuNwCorner', name: 'Northwest Corner Building', lat: 40.810180, lon: -73.961882, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuFairchild', name: 'Sherman Fairchild Center', lat: 40.809139, lon: -73.960331, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuEngTerrace', name: 'Engineering Terrace', lat: 40.809040, lon: -73.959845, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuSchermerhornExt', name: 'Schermerhorn Extension', lat: 40.808653, lon: -73.960064, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuUris', name: 'Uris Hall', lat: 40.809021, lon: -73.961266, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuChandler', name: 'Chandler Hall', lat: 40.809612, lon: -73.962291, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuAveryPlaza', name: 'the plaza over the Avery extension', lat: 40.808294, lon: -73.960603, roofKind: 0, memb: 3, roof: { form: 'flat' } },
  { key: 'cuLerner', name: 'Alfred Lerner Hall', lat: 40.806864, lon: -73.963942, roofKind: 0, roof: { form: 'flat' } },
  { key: 'cuCarman', name: 'Carman Hall', lat: 40.806719, lon: -73.964391, roofKind: 0, roof: { form: 'flat' } },
  // the ground floors of the two east corners are modelled shop by shop in src/city/namedShops.js (Appletree Market / Deli
  // on 1225; Hartley Chemist, Hartley Pharmacy, Sliced, Suzi Confections on 1217-1219): the procedural storefront is off,
  // which also puts the residential limestone base back on their W 120th sides (refs: no shops there)
  { key: 'amst1225', name: 'NE corner: 1225 Amsterdam, tan pre-war apartments over Appletree Market', lat: 40.80945, lon: -73.95873,
    style: 'PREWAR_APT', color: [196, 172, 132], wall: 'brickTan', base: { wall: 'limestone', floors: 2 }, roofKind: 0, set: ['CORNICE'], clear: ['FIRE_ESCAPE', 'STOREFRONT'] },
  { key: 'amstSE120', name: 'SE corner: 1217-1219 Amsterdam, buff brick over a limestone base, Hartley Chemist', lat: 40.80897, lon: -73.95900,
    style: 'PREWAR_APT', color: [190, 166, 128], wall: 'brickTan', base: { wall: 'limestone', floors: 3 }, roofKind: 0, set: ['CORNICE'], clear: ['FIRE_ESCAPE', 'STOREFRONT'] },
];
// AR32C (city/w125c.js, docs/notes/area-w125c.md): 125th Street's landmarks on their real footprints, read-time only (the
// browser, world/tiledata.js; `?ar32c=0` or `?ar32=0` keeps the compiled records). The compile had put Hotel Theresa's
// point (id 9) on a 10.4 m shop row (#202) beside the Theresa and the State Office Building's (id 10) on a 26.1 m block west of
// the boulevard; the Theresa is the 51.5 m, 12-storey footprint between 124th and 125th Streets west of the boulevard
// (Wikipedia: "2082-96 Adam Clayton Powell Jr. Boulevard between West 124th and 125th Streets", 13 storeys, white
// terracotta) and the State Office Building the 88.9 m, 19-storey tower east of it (163 W 125th St). Points are the
// footprints' centroids (boundlessjs/tools/ar32/w125c_inside.mjs: each lies inside its footprint).
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q && q.get('ar32c') !== '0' && q.get('ar32') !== '0') BUILDING_OVERRIDES.push(
    { key: 'ar32cShopRow', name: 'shop row at 125th St and ACP Blvd (not the Theresa)', lat: 40.808924, lon: -73.949173, landmarkId: 0 },
    { key: 'ar32cTheresa', name: 'Hotel Theresa (1913, George & Edward Blum): white terracotta, 13 storeys', lat: 40.808761, lon: -73.948930,
      landmarkId: -9, color: [226, 223, 214], wall: 'limestone' },
    { key: 'ar32cWestOfAcp', name: 'block west of ACP Blvd (not the State Office Building)', lat: 40.809595, lon: -73.948399, landmarkId: 0 },
    { key: 'ar32cStateOffice', name: 'Adam Clayton Powell Jr. State Office Building (1973), 19 storeys', lat: 40.809219, lon: -73.947423, landmarkId: -10 },
    // the Apollo's lobby (a point 3 m inside its frontage): the part builds the ground floor under the marquee, so the
    // procedural shop fronts and awnings (they stood out under the marquee in the r1 stills) are off
    { key: 'ar32cApollo', name: 'Apollo Theater lobby, 253 W 125th St', lat: 40.809923, lon: -73.950126, clear: ['STOREFRONT'] },
  );
}
// /AR32C

// CP33 (landmarks round, 2026-09-30; owner on teaser 4: the park's surroundings must not read as flat low-poly blocks).
// Read-time like the AR32C entries (world/tiledata.js applies them when a tile is read; `?rto=0` disables them): each point is
// the pole of inaccessibility of its compiled footprint (boundlessjs/tools/ar33 style probe: tile and index in the name).
// - the San Remo's landmark id (48) sat on an 18-storey block at Columbus and W 73rd (tile -1_1 #36), 370 m from the building,
//   so the twin-tower builder drew that block and the real San Remo (tile -1_1 #13) stayed a plain 120 m extrusion
// - One57's id (60) sat on a 31 m 9-storey building (tile -2_3 #81) beside the tower, which the blue-glass builder had replaced
// - the Plaza (tile -1_4 #130, decorate id 49): white glazed brick and marble under the green mansard (the compiled colour was
//   a dirty tan, [211, 203, 180]); the Essex House (tile -2_3 #37) takes the new decorate id 61 (the red roof sign);
//   Hampshire House (tile -2_3 #50) a steep verdigris copper roof with chimneys through the CR24 roof table
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (!q || q.get('cp33lm') !== '0') BUILDING_OVERRIDES.push(
    { key: 'cp33SanRemo', name: 'The San Remo, 145-146 Central Park West (tile -1_1 #13)', lat: 40.777914, lon: -73.975386, landmarkId: 48 },
    { key: 'cp33NotSanRemo', name: 'the 18-storey block at Columbus and W 73rd that id 48 had replaced (tile -1_1 #36)', lat: 40.775502, lon: -73.976816, landmarkId: 0 },
    { key: 'cp33NotOne57', name: 'the 9-storey building beside One57 that id 60 had replaced (tile -2_3 #81)', lat: 40.765646, lon: -73.978591, landmarkId: 0 },
    { key: 'cp33Plaza', name: 'The Plaza (1907): white glazed brick and marble', lat: 40.764439, lon: -73.974378, color: [236, 232, 222], wall: 'limestone',
      clear: ['SETBACKS'] },   // the compiled stepping tiers are not the Plaza: one wall to the cornice, the mansard (city/lmPlaza.js) above it
    { key: 'cp33Essex', name: 'Essex House (1931): the roof sign', lat: 40.766182, lon: -73.978516, landmarkId: -61 },
    { key: 'cp33Hampshire', name: 'Hampshire House (1937): the steep copper roof with its chimneys (city/lmPlaza.js)', lat: 40.766089, lon: -73.977909,
      landmarkId: -62, clear: ['SETBACKS'] },
  );
}
// /CP33
