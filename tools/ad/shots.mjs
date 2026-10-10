// AD VIDEO — shot list author.
//
// The camera paths are easier to reason about in metres along a street bearing
// than in raw lon/lat, so they are authored here with metric helpers and
// serialised to tools/ad/shots.json, which every other tool in tools/ad/ reads.
//
//   node tools/ad/shots.mjs            # print the table
//   node tools/ad/shots.mjs --write    # (re)write tools/ad/shots.json
//
// Path contract is the same as tools/trailer/paths.json: keys of
// { p:[lon,lat,altAboveTerrain], look:[lon,lat,alt] }, Catmull-Rom interpolated
// by the PathCam installed by ?record=1 (client/src/main.js).
//
// ---- what round 1 of the framing probe taught (all applied below) ---------
//  * `golden` (elev 7 / azim 252) is DUSK at street level in a Harlem canyon:
//    the roadway went to sepia and the sky to deep blue. Every junction and
//    street-level Harlem shot is `day` (elev 42 / azim 215) now. Columbia's
//    open plaza and the two aerials keep `golden`.
//  * Low Library's dome is ~38 m: a camera 70 m south at 30 m up frames the
//    roof, not the building. The campus aerial is 120 m up / 240 m out.
//  * 40-50 m WNW of 125th/Lenox and ~8 m NORTH of the centreline is inside the
//    bare lot the lead has flagged (matId 7 reads as dirt), not on the road.
//    Everything on 125th is now offset to the SOUTH half of the carriageway.
//  * The Brooklyn Bridge deck framing is unusable (see docs/notes/ad-video.md):
//    dropped from the montage, kept only as a probe.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- metric helpers (mirror client/src/shared/geo.js scale) -----------
const LAT0 = 40.7831;
const M_LAT = 111132.0;                                    // metres per degree lat
const M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);  // 84,391 m per degree lon
/** move [lon,lat] by `d` metres along compass bearing `b` (degrees, 0 = north) */
const brg = ([lon, lat], b, d) => {
  const r = (b * Math.PI) / 180;
  return [lon + (Math.sin(r) * d) / M_LON, lat + (Math.cos(r) * d) / M_LAT];
};
/** [lon,lat] plus east/north metres */
const en = ([lon, lat], e, n) => [lon + e / M_LON, lat + n / M_LAT];
const at = (ll, alt) => [round(ll[0]), round(ll[1]), alt];
const round = (v) => Number(v.toFixed(6));

// ---- anchors ---------------------------------------------------------------
// Manhattan's grid: numbered streets run at bearing 119 deg (ESE) / 299 (WNW),
// avenues at 29 (NNE) / 209 (SSW). Every Harlem framing is built off that.
const ST_E = 119, ST_W = 299, AV_N = 29, AV_S = 209;
const PERP_S = 209;   // perpendicular to 125th, toward its south kerb

const LENOX = [-73.94530, 40.80790];      // W 125th St & Lenox Ave (Malcolm X Blvd)
const LOW = [-73.96205, 40.80862];        // Low Library front, Columbia
const WALK = [-73.96208, 40.80732];       // College Walk on the campus axis
const ROW = [-73.947749, 40.805388];      // W 122nd at Mt Morris Park W
const FOUNT_E = [-73.962013, 40.807570];  // Low Plaza, the east fountain's centre (public/data/columbia_campus.json)
const BKTOWER = [-73.99944, 40.70856];    // Brooklyn Bridge, Manhattan tower
const BK_BRG = 121.8;
// Midtown, for teaser 2 (landmarkSpec.js positions; Times Square's bowtie runs NNE between 42nd and 47th)
const ONE_TSQ = [-73.98660, 40.75630];    // One Times Square (the ball-drop tower at 42nd-43rd)
const TSQ_46 = [-73.98530, 40.75845];     // Broadway / Seventh Ave at 46th, mid-bowtie
const NYPL = [-73.98220, 40.75320];       // New York Public Library (Stephen A. Schwarzman Building)
const NYPL_5TH = [-73.98150, 40.75290];   // its Fifth Avenue steps
const BRYANT_C = [-73.98380, 40.75360];   // Bryant Park, the lawn's middle
const BRYANT_W = [-73.98500, 40.75410];   // Bryant Park, the Sixth Avenue end
const GCT = [-73.97733, 40.75266];        // Grand Central Terminal
const CHRYSLER = [-73.97550, 40.75162];   // Chrysler Building
const FLATIRON = [-73.98970, 40.74110];   // Flatiron Building
const ESB = [-73.98570, 40.74840];        // Empire State Building

/** a point on 125th St, `d` m WNW of the Lenox junction and `s` m toward the south kerb */
const on125 = (d, s) => brg(brg(LENOX, ST_W, d), PERP_S, s);
/** a point on W 122nd, `d` m ESE of the ROW anchor and `s` m toward the south kerb */
const on122 = (d, s) => brg(brg(ROW, ST_E, d), PERP_S, s);

const SHOTS = {
  // ======================= ACT 1 — montage, 5.4 s each =====================
  mCollegeWalk: {
    // warm 60 (film 7): campus walkers start where they spawned — on the plaza, the steps and College Walk. Walked for
    // 8 s they thin out along the campus footways (lensprobe --trace: the count within 40 m holds, but it leaves the frame).
    // film 10 (owner 2026-09-26: "the first clip in the trailer still has bad lighting and looks low quality"): the page's
    // 66 deg lens (a 16 mm wide angle) filled the lower third with the flat south steps and shrank Low to a strip; at 45 deg
    // the push frames Low, its staircase, Alma Mater and the fountain (lens sweep cw_lens, B -> D). The golden sun 10 deg
    // further south and 3 deg higher (195 / 18) lights the whole plaza instead of leaving the steps under a shadow band.
    act: 'montage', time: 'golden', duration: 5.4, ease: 0.22, warm: 60, fov: 45, flags: 'gfx=sunAzim:-10,sunElev:3',
    title: 'College Walk pushing north to Low Library',
    caption: 'A procedural digital twin of New York — in a browser tab',
    keys: [
      { p: at(en(WALK, 0, -4), 3.6), look: at(LOW, 25) },
      { p: at(en(WALK, -1, 14), 4.1), look: at(LOW, 25) },
      { p: at(en(WALK, -2, 32), 4.8), look: at(LOW, 26) },
    ],
  },
  mLowAerial: {
    // 120 m / 240 m out (round 2) put a flat white haze plane of the Hudson
    // across the upper third; 96 m / 170 m out makes the dome the subject.
    act: 'montage', time: 'golden', duration: 5.4, ease: 0.2, warm: 240,
    title: 'Morningside campus from 96 m SE, Low Library dome as the subject',
    caption: "Columbia's Morningside campus, built on the real lot lines",
    keys: [
      { p: at(en(LOW, 112, -164), 104), look: at(LOW, 26) },
      { p: at(en(LOW, 100, -146), 98), look: at(LOW, 26) },
      { p: at(en(LOW, 88, -128), 92), look: at(LOW, 27) },
    ],
  },
  mLenoxTop: {
    act: 'montage', time: 'day', duration: 5.4, ease: 0.2, warm: 600,
    title: '125th & Lenox from 52 m, descending oblique',
    caption: '125th Street & Lenox Avenue — every lane, crossing and signal from public data',
    keys: [
      { p: at(brg(LENOX, AV_S, 46), 52), look: at(LENOX, 1) },
      { p: at(brg(LENOX, AV_S, 38), 45), look: at(LENOX, 1) },
      { p: at(brg(LENOX, AV_S, 30), 38), look: at(LENOX, 1) },
    ],
  },
  mLenoxEye: {
    // s = 19 is ON the double-yellow centre line (film 7 lens probe, tools/ad/lensprobe.mjs: the sim's centreline is
    // at s = 19.0 all along this run, lateral = 19 - s). s = 22 put the lens 3 m into the eastbound inner lane at 2.6 m:
    // with the PV2 traffic fill a cab's roof filled the frame and a Sprinter van reached the lens. On the line, the
    // nearest lane centre is 1.64 m to either side — a box truck passes 0.4 m clear.
    // Film 10: 0.4 m is inside the 0.4 m near plane once a mirror sticks out — an oncoming box truck's cab corner was cut
    // open in front of the lens (frames 118-130). At 4.0 m the lens clears a 3.4 m truck or bus roof by 0.6 m, 0.7 m from
    // its roof edge.
    act: 'montage', time: 'day', duration: 5.4, ease: 0.2, warm: 600,
    title: '125th St mid-roadway at 4 m, creeping ESE toward the Lenox crossing',
    caption: null,                       // cut on the beat, no caption
    keys: [
      { p: at(on125(46, 19), 4.0), look: at(brg(LENOX, ST_E, 26), 7) },
      { p: at(on125(39, 19), 4.0), look: at(brg(LENOX, ST_E, 28), 7) },
      { p: at(on125(32, 19), 4.0), look: at(brg(LENOX, ST_E, 30), 7) },
    ],
  },
  mBrownstone: {
    // The anchor's own block is commercial brick with no stoops. The stoop
    // row is 90-120 m ESE of it (probe round 3, pRowE92): brownstone-red stoops
    // with railings marching down the block, quoined brick, fire escapes.
    // (film 7) s = 5 at 3.0 m is kept: the lens brushes the FD14 crowns for a few frames. Tested and rejected: 2.3 m
    // (parked vans across a third of the frame) and s = 2.2 (a parked box truck's side filled the frame for 2 s).
    act: 'montage', time: 'day', duration: 5.4, ease: 0.2, warm: 300, clearTrees: 5,   // film 7 review: the lens ran through the kerb crowns
    title: 'W 122nd St: truck ESE along the stoop row',
    caption: 'Harlem brownstone rows, stoop by stoop',
    keys: [
      { p: at(on122(84, 5), 3.0), look: at(brg(on122(84, 5), 72, 19), 4.0) },
      { p: at(on122(95, 5), 3.0), look: at(brg(on122(95, 5), 72, 19), 4.0) },
      { p: at(on122(106, 5), 3.0), look: at(brg(on122(106, 5), 72, 19), 4.0) },
    ],
  },
  mMidtownSky: {
    act: 'montage', time: 'golden', duration: 5.4, ease: 0.18, warm: 180,
    title: 'Midtown skyline from 1.7 km south at 330 m, slow push',
    caption: '930,787 buildings, streamed as 512 m tiles',
    keys: [
      { p: [-73.980387, 40.740775, 330], look: [-73.9793, 40.7565, 160] },
      { p: [-73.980340, 40.741320, 326], look: [-73.9793, 40.7565, 160] },
      { p: [-73.980290, 40.741880, 321], look: [-73.9793, 40.7565, 160] },
    ],
  },

  // ======================= ACT 2 — day/night swipe ========================
  // ONE path, recorded twice (--time day and --time night). Record mode is a
  // fixed-timestep simulation and the warm-up is identical, so the two takes
  // are frame-for-frame the same world down to the position of every car —
  // which is what makes the moving wipe a true A/B rather than a dissolve.
  swipeLenoxAir: {
    act: 'swipe', time: 'day', times: ['day', 'night'], duration: 9, ease: 0.16,
    warm: 900,                            // 30 s of sim: signals have cycled, queues exist
    title: 'Descending over 125th & Lenox — the day/night A/B path',
    caption: null,
    keys: [
      { p: at(brg(LENOX, AV_S, 82), 62), look: at(LENOX, 3) },
      { p: at(brg(LENOX, AV_S, 66), 53), look: at(LENOX, 3) },
      { p: at(brg(LENOX, AV_S, 49), 44), look: at(LENOX, 3) },
      { p: at(brg(LENOX, AV_S, 33), 35), look: at(LENOX, 3) },
    ],
  },

  // ======================= ACT 3 — feature clips ==========================
  fStreetGeom: {
    act: 'feature', time: 'day', duration: 9.5, ease: 0.14, warm: 600,
    title: 'Near-nadir over 125th & Lenox, 120 m descending to 104 m',
    caption: 'Real street geometry: CSCL centrelines, PLUTO lots and DOB footprints, compiled to tiles',
    keys: [
      { p: at(brg(LENOX, AV_S, 36), 120), look: at(brg(LENOX, ST_W, 4), 0) },
      { p: at(brg(LENOX, AV_S, 33), 114), look: at(LENOX, 0) },
      { p: at(brg(LENOX, AV_S, 30), 108), look: at(brg(LENOX, ST_E, 4), 0) },
      { p: at(brg(LENOX, AV_S, 27), 104), look: at(brg(LENOX, ST_E, 8), 0) },
    ],
  },
  fMarkings: {
    // s = 16 sat IN the red kerb bus lane (probe round 3, pLad16): the lane, the gutter, the kerb, the ladder bars and
    // the turn arrows all in one frame. Film 7: s = 15.7 is the sim's lane line between the westbound inner and kerb
    // lanes (lateral 3.27 m), and 4.2 m clears the tallest fleet kind (box truck ~3.6 m) — at 3.4 m over a lane centre,
    // oncoming traffic ran under the lens and a truck would have run through it.
    act: 'feature', time: 'day', duration: 9.5, ease: 0.18, warm: 600,
    title: '125th St red bus lane from 4.2 m, creeping ESE into the Lenox crossing',
    caption: 'NYC DOT markings: ladder crosswalks, stop bars, gutters, red bus lanes, BUS ONLY legends',
    keys: [
      { p: at(on125(36, 15.7), 4.2), look: at(brg(LENOX, ST_E, 6), 1.2) },
      { p: at(on125(28, 15.7), 4.2), look: at(brg(LENOX, ST_E, 8), 1.2) },
      { p: at(on125(20, 15.7), 4.2), look: at(brg(LENOX, ST_E, 10), 1.2) },
    ],
  },
  fBrownstone: {
    act: 'feature', time: 'day', duration: 9.5, ease: 0.18, warm: 300, clearTrees: 5,
    title: 'W 122nd St: long lateral truck along the stoop row',
    caption: 'Brownstone rows: per-lot massing, stoops and railings, fire escapes, tree pits',
    keys: [
      { p: at(on122(78, 5), 3.0), look: at(brg(on122(78, 5), 72, 19), 4.0) },
      { p: at(on122(92, 5), 3.0), look: at(brg(on122(92, 5), 72, 19), 4.0) },
      { p: at(on122(106, 5), 3.0), look: at(brg(on122(106, 5), 72, 19), 4.0) },
      { p: at(on122(120, 5), 3.0), look: at(brg(on122(120, 5), 72, 19), 4.0) },
    ],
  },
  fBrownstoneNight: {
    // film 9 (owner 2026-09-26: "an updated higher quality ad including the new better scenes"): the same truck as
    // fBrownstone after dark, for the street lamps as real luminaires (CL24), the night crowns and the lit rows
    act: 'feature', time: 'night', duration: 9.5, ease: 0.18, warm: 300, clearTrees: 5,
    title: 'W 122nd St after dark: the same truck along the stoop row',
    caption: 'After dark: every street lamp is a real light, the rows light up window by window',
    keys: [
      { p: at(on122(78, 5), 3.0), look: at(brg(on122(78, 5), 72, 19), 4.0) },
      { p: at(on122(92, 5), 3.0), look: at(brg(on122(92, 5), 72, 19), 4.0) },
      { p: at(on122(106, 5), 3.0), look: at(brg(on122(106, 5), 72, 19), 4.0) },
      { p: at(on122(120, 5), 3.0), look: at(brg(on122(120, 5), 72, 19), 4.0) },
    ],
  },
  fFountain: {
    // film 9: the Low Plaza fountain's water (FW26: veils, jet, crown, foam) at golden hour, an arc at 10 m and eye
    // height from its south-west round to its south, Low Library's steps behind it
    act: 'feature', time: 'golden', duration: 9.5, ease: 0.18, warm: 60,
    title: 'Low Plaza: an arc round the east fountain',
    caption: 'The Low Plaza fountains: water veils, the jet and its crown, foam on the pool',
    keys: [
      { p: at(en(FOUNT_E, -6.4, -7.7), 1.8), look: at(en(FOUNT_E, 0, 3), 1.9) },
      { p: at(en(FOUNT_E, -3.4, -9.4), 1.8), look: at(en(FOUNT_E, 0, 3), 1.9) },
      { p: at(en(FOUNT_E, 0, -10), 1.8), look: at(en(FOUNT_E, 0, 3), 1.9) },
      { p: at(en(FOUNT_E, 3.4, -9.4), 1.8), look: at(en(FOUNT_E, 0, 3), 1.9) },
    ],
  },
  fColumbia: {
    // `LOW` is Low Library's centre, not its front: the colonnade is only about
    // 65 m north of College Walk, so the first cut of this path (which pushed
    // 84 m) put the lens between the columns by t=7.5 s and INSIDE the wall by
    // t=8.4 s. It also rose only to 6.2 m, while `alt` is above the FLAT base
    // plane and the plaza in front of Low is raised — so the camera clipped the
    // steps. Now it stops at +38 m and climbs to 7 m, which flies up over the
    // staircase and lands on the portico instead of in it.
    act: 'feature', time: 'golden', duration: 9.5, ease: 0.16, warm: 60,   // film 7: see mCollegeWalk
    title: 'Campus axis: College Walk rising to the Low Library staircase and Alma Mater',
    caption: "Procedural landmarks: Low Library's colonnade, the grand staircase, Alma Mater",
    keys: [
      { p: at(en(WALK, 0, 2), 3.4), look: at(LOW, 23) },
      { p: at(en(WALK, 1, 14), 4.4), look: at(LOW, 23) },
      { p: at(en(WALK, 2, 26), 5.6), look: at(LOW, 24) },
      { p: at(en(WALK, 3, 38), 7.0), look: at(LOW, 25) },
    ],
  },
  fStreetLife: {
    // 2026-09-23 (owner: "the latest pedestrian models in the scenes"): the first take framed FOR the crowd. The lens
    // walks the building side of 125th's north sidewalk at walking pace. Lens probe: kerb at s = 9.9, the walk edge at
    // s = 8.0 and the walkers inside s = 6.5-8.9, so s = 5.6 keeps every walker at least 0.9 m to the lens's right;
    // the westbound lanes and their traffic fill the right of frame. 1.8 m: the kerb trees' lowest branches reach the
    // lens line at 2.3 m (pLifeB was a wall of leaves); the south-sidewalk mirror (pLifeC) stands inside a canopy.
    // Film 16 (2026-09-29): the 900-step warm-up's crowd sent a walker through the lens at frames 62-67 (LENS-INSIDE,
    // a half-dissolved ghost); 30 steps more put the crowd a second further along its paths.
    act: 'feature', time: 'day', duration: 9.5, ease: 0.18, warm: 930,
    title: "125th St north sidewalk at 1.8 m: walking ESE with the crowd, the westbound traffic alongside",
    caption: 'People and vehicles: 25 photoreal walkers with bags and phones, 13 NYC vehicle kinds, NY plates, TLC cabs',
    keys: [
      { p: at(on125(58, 5.6), 1.8), look: at(on125(34, 9.4), 1.3) },
      { p: at(on125(52, 5.6), 1.8), look: at(on125(28, 9.4), 1.3) },
      { p: at(on125(46, 5.6), 1.8), look: at(on125(22, 9.4), 1.3) },
    ],
  },
  fTraffic: {
    // film 11 re-shoot: the take starts 1.5 s before 125th St's green (PH27), the same moment as fWeather, so the two
    // shots of this junction differ by the weather and the light; 10 s of warm-up plus the wait for that phase, in the first
    // cycle (the 50 s warm-up had let the junction lock up, the first film 11 take fell inside one green with nothing moving,
    // a take at the avenue's green had its queue held by a car caught in the box, and 20 s of warm-up put this phase in the
    // second cycle, 59 s in, with the junction crawling again)
    act: 'feature', time: 'day', duration: 9.5, ease: 0.14, warm: 300, phase: 18.5,
    title: '125th & Lenox from 16 m — queues, signals, turns',
    caption: 'Traffic simulation on the compiled lane graph — signals, queues, turns, walkers on the crossings',
    keys: [
      { p: at(brg(LENOX, AV_S, 46), 17), look: at(LENOX, 2) },
      { p: at(brg(LENOX, AV_S, 40), 16), look: at(LENOX, 2) },
      { p: at(brg(LENOX, AV_S, 34), 15), look: at(LENOX, 2) },
    ],
  },
  fWeather: {
    // film 11 re-shoot: 125th St's queues pull away in the rain (1.5 s before the cross street's green, PH27)
    act: 'feature', time: 'dusk', flags: 'rain=0.55', duration: 9.5, ease: 0.14, warm: 300, phase: 18.5,
    title: 'The same junction at dusk in the rain',
    caption: 'Weather and time of day: wet asphalt, headlights, lit storefronts, skyglow',
    keys: [
      { p: at(brg(LENOX, AV_S, 46), 17), look: at(LENOX, 2) },
      { p: at(brg(LENOX, AV_S, 40), 16), look: at(LENOX, 2) },
      { p: at(brg(LENOX, AV_S, 34), 15), look: at(LENOX, 2) },
    ],
  },
  fSkyline: {
    // film 10: the golden sun moved to 205 deg (GH26) for the campus; this take looks south down the island straight into
    // it and washed out, so it keeps the old 245 deg / 14 deg sun through the sun offsets
    act: 'feature', time: 'golden', flags: 'gfx=sunAzim:40,sunElev:-1', duration: 9.5, ease: 0.14, warm: 180,
    title: 'From 560 m over Midtown looking down the island to FiDi',
    caption: '2,882 street tiles near the camera, 209 far-LoD macros carrying the skyline behind them',
    keys: [
      { p: [-73.97600, 40.75800, 560], look: [-74.00800, 40.71200, 100] },
      { p: [-73.97900, 40.75650, 552], look: [-74.00800, 40.71200, 100] },
      { p: [-73.98200, 40.75500, 545], look: [-74.00800, 40.71200, 100] },
    ],
  },
};

// ---- extra framings shot only as single-frame probes -----------------------
const P1 = (time, title, p, look) => ({ time, title, duration: 1, ease: 0,
  keys: [{ p, look }, { p: [p[0] + 1e-5, p[1] + 1e-5, p[2]], look }] });

// ======================= TEASER (owner 2026-09-27) =========================
// "create a new video with cinematic shots similar to those in references, we will call this the "teaser" - this is
// meant to be shorter (30s), and be super impressive for an X crowd". References: C:/Users/mehme/references (a street-level
// NYC game: vertigo dives over Midtown, swoops down street canyons, fast glides over traffic, a run down an avenue).
// Nine 3-4 s moves, faster than the ad's, cut by tools/ad/teaser_cut.mjs. TG: the teaser's grade on top of the film's clean
// preset (the URL gfx keys land after it): a little more colour and contrast than the ad, and the camera motion blur
// (MB28: a streak across each frame's move) so a fast move reads as motion, not a strobe.
const TG = 'saturation:1.16,contrast:0.2,motionBlur:0.5';
Object.assign(SHOTS, {
  tDive: {
    // the vertigo spiral: from 250 m straight over 125th & Lenox down to 95 m, the frame turning 70 deg round the junction
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.4, ease: 0.12, warm: 450,
    title: 'Teaser: spiral dive onto 125th & Lenox',
    keys: [
      { p: at(brg(LENOX, 200, 30), 250), look: at(LENOX, 0) },
      { p: at(brg(LENOX, 236, 26), 165), look: at(LENOX, 0) },
      { p: at(brg(LENOX, 270, 20), 95), look: at(LENOX, 0) },
    ],
  },
  tSwoop: {
    // down Lenox from rooftop height to 9 m over the avenue, looking south into the junction (the median's crowns cleared)
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.6, ease: 0.14, warm: 450, clearTrees: 6,
    title: 'Teaser: swoop down Lenox into the 125th St junction',
    keys: [
      { p: at(brg(LENOX, AV_N, 160), 42), look: at(brg(LENOX, AV_S, 30), 2) },
      { p: at(brg(LENOX, AV_N, 95), 24), look: at(brg(LENOX, AV_S, 60), 2) },
      { p: at(brg(LENOX, AV_N, 35), 9), look: at(brg(LENOX, AV_S, 110), 3) },
    ],
  },
  tAvenue: {
    // a fast glide ESE down the middle of 125th at 7 m, over the traffic, the storefronts streaming past
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.2, ease: 0.1, warm: 450, fov: 60,
    title: 'Teaser: glide down 125th St over the traffic',
    keys: [
      { p: at(on125(118, 19), 7.5), look: at(on125(60, 17), 4) },
      { p: at(on125(72, 19), 7.0), look: at(on125(14, 17), 4) },
      { p: at(on125(26, 19), 7.0), look: at(brg(LENOX, ST_E, 34), 4) },
    ],
  },
  tCurb: {
    // the ground at the lens: 0.6 m over the middle of 125th's north walk (kerb at s = 9.9, walkers at s = 6.5-8.9), pushing
    // ESE along the flags and looking a little toward the kerb and the bus lane; at s = 9.3 a parked car filled the right third
    act: 'teaserOut',   // out of the cut: the lens went through walkers' legs (LENS-INSIDE x40)
    flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.4, ease: 0.12, warm: 450, fov: 55,
    title: 'Teaser: along the kerb at 0.55 m',
    keys: [
      { p: at(on125(96, 6.4), 0.6), look: at(on125(80, 9.4), 0.1) },
      { p: at(on125(88, 6.4), 0.6), look: at(on125(72, 9.4), 0.1) },
      { p: at(on125(80, 6.4), 0.6), look: at(on125(64, 9.4), 0.1) },
    ],
  },
  tBrownstone: {
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.2, ease: 0.12, warm: 300, clearTrees: 5,
    title: 'Teaser: W 122nd stoop row, tracking',
    keys: [
      { p: at(on122(78, 5), 3.2), look: at(brg(on122(78, 5), 72, 19), 4.0) },
      { p: at(on122(96, 5), 3.2), look: at(brg(on122(96, 5), 72, 19), 4.0) },
      { p: at(on122(114, 5), 3.2), look: at(brg(on122(114, 5), 72, 19), 4.0) },
    ],
  },
  tCampus: {
    // crane up from the Low Plaza fountain to Low Library (the mCollegeWalk sun)
    act: 'teaser', time: 'golden', duration: 3.6, ease: 0.14, warm: 60, fov: 50, flags: 'fall=0.7&gfx=sunAzim:-10,sunElev:3,' + TG,
    title: 'Teaser: crane up over the Low Plaza fountain',
    keys: [
      { p: at(en(FOUNT_E, 7, -15), 1.7), look: at(LOW, 22) },
      { p: at(en(FOUNT_E, 3, -6), 6.0), look: at(LOW, 24) },
      { p: at(en(FOUNT_E, 0, 5), 13.0), look: at(LOW, 26) },
    ],
  },
  tRain: {
    // the junction at dusk in the rain, an arc over Lenox at 18 -> 13 m (1.5 s before 125th St's green, PH27; a first arc from 190 deg sat over a roof)
    act: 'teaser', time: 'dusk', flags: 'rain=0.55&fall=0.7&gfx=' + TG, duration: 3.2, ease: 0.12, warm: 300, phase: 18.5,
    title: 'Teaser: 125th & Lenox in the rain, arcing',
    keys: [
      { p: at(brg(LENOX, 201, 50), 18), look: at(LENOX, 2) },
      { p: at(brg(LENOX, 209, 44), 15.5), look: at(LENOX, 2) },
      { p: at(brg(LENOX, 217, 38), 13), look: at(LENOX, 2) },
    ],
  },
  tNight: {
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'night', duration: 3.2, ease: 0.1, warm: 450,
    title: 'Teaser: 125th St at night, low glide',
    keys: [
      { p: at(on125(96, 19), 5.0), look: at(on125(40, 17), 3) },
      { p: at(on125(66, 19), 4.8), look: at(on125(10, 17), 3) },
      { p: at(on125(36, 19), 4.6), look: at(brg(LENOX, ST_E, 20), 3) },
    ],
  },
  tTop: {
    // tCurb's replacement (its 0.6 m lens went through the walkers' legs): straight down from 7 m over the west crosswalk of
    // 125th & Lenox, drifting from the north walk's corner out over the roadway and turning 40 deg, 5 s into Lenox's green
    // (PH27) so the walkers are out on the zebra and 125th's traffic waits at the stop bar: the flags, the kerb, the paint
    // and the asphalt at a distance where their detail reads
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.6, ease: 0.14, warm: 300, phase: 5, fov: 58,
    title: 'Teaser: top-down drift over the 125th St crosswalk',
    keys: [
      { p: at(on125(23, 3), 7.2), look: at(brg(on125(23, 3), 100, 0.6), 0) },
      { p: at(on125(23, 8.5), 7.0), look: at(brg(on125(23, 8.5), 120, 0.6), 0) },
      { p: at(on125(23, 14), 6.8), look: at(brg(on125(23, 14), 140, 0.6), 0) },
    ],
  },
  tMedian: {
    // a run down Lenox's planted median at 1.6 m, south toward 125th at 50 km/h between the two carriageways (walkers keep
    // off the grass). The LENOX line is the middle of the EAST carriageway: a ground transect (scratchpad median_probe.mjs)
    // puts the median's grass at 5.5-8 m WNW of it from 90 to 120 m north, paved from 75 m, the cross street at ~150 m;
    // the first path (on the line itself) ran down the traffic lane into a van, a fire truck and a Mini
    act: 'teaserOut',   // out of the cut: flat median grass, bare trunks and empty tree guards once the crowns are cleared
    flags: 'fall=0.7&gfx=' + TG, time: 'day', duration: 3.4, ease: 0.1, warm: 300, clearTrees: 1.2, fov: 62,
    title: 'Teaser: down the Lenox median at 1.6 m',
    keys: [
      { p: at(brg(brg(LENOX, AV_N, 132), ST_W, 6.7), 1.6), look: at(brg(brg(LENOX, AV_N, 20), ST_W, 6.7), 1.4) },
      { p: at(brg(brg(LENOX, AV_N, 108), ST_W, 6.7), 1.6), look: at(brg(brg(LENOX, AV_N, -4), ST_W, 6.7), 1.4) },
      { p: at(brg(brg(LENOX, AV_N, 84), ST_W, 6.7), 1.6), look: at(brg(brg(LENOX, AV_N, -28), ST_W, 6.7), 1.4) },
    ],
  },
  tSkyline: {
    // Midtown from 1.7 km south at 330 m (mMidtownSky), pushed twice as fast
    act: 'teaser', flags: 'fall=0.7&gfx=' + TG, time: 'golden', duration: 4.0, ease: 0.16, warm: 180,
    title: 'Teaser: Midtown skyline push',
    keys: [
      { p: [-73.980450, 40.740300, 336], look: [-73.9793, 40.7565, 160] },
      { p: [-73.980350, 40.741250, 326], look: [-73.9793, 40.7565, 160] },
      { p: [-73.980250, 40.742200, 316], look: [-73.9793, 40.7565, 160] },
    ],
  },
});

// ======================= TEASER 2 (owner 2026-09-27 ~15:30) ======================
// "I want the teaser to have shots different than the trailer ... Work on some new areas like Times Square and Bryant
// Park for the new teaser". None of the trailer's places: Bryant Park and the library at golden hour on the music's
// breakdown (lofi.mp3 137.16 s, 32 beats), then Times Square at night from the drop at 150.87 s (38 beats), cut by
// tools/ad/teaser2_cut.mjs. Built on the TS28 screens, the TP28 plaza and red steps, BP28's park and NY28's marble.
const LON0 = -73.9712;
const W = (x, z) => [LON0 + x / M_LON, LAT0 - z / M_LAT];   // world metres (x east, z south) -> [lon, lat]
// Bryant Park's frame (city/bryantPark.js): u along 42nd St from the Sixth Avenue line, v from 40th St toward 42nd
const BP_SW = [-73.984802, 40.753557], BP_NW = [-73.984011, 40.754645], BP_NE = [-73.982616, 40.754058];
const bpU = (() => { const e = (BP_NE[0] - BP_NW[0]) * M_LON, n = (BP_NE[1] - BP_NW[1]) * M_LAT, l = Math.hypot(e, n); return [e / l, n / l]; })();
const bpV = (() => { const e = (BP_NW[0] - BP_SW[0]) * M_LON, n = (BP_NW[1] - BP_SW[1]) * M_LAT, l = Math.hypot(e, n); return [e / l, n / l]; })();
const bp = (u, v) => en(BP_SW, bpU[0] * u + bpV[0] * v, bpU[1] * u + bpV[1] * v);
// Times Square (world metres, from the compiled Broadway / Seventh Avenue records): the plaza's centre line at 44th, 45th
// and 46th, Seventh Avenue at 46th and 44th, the TKTS steps (centre, up-the-steps axis) and One Times Square
const TSQ = { b44: [-1232.5, 2871.0], b45: [-1208.6, 2791.5], b46: [-1191.9, 2711.4], s46: [-1167.5, 2724.7], s44: [-1248.8, 2861.9],
  tk: [-1157.65, 2661.15], tkA: [0.374, -0.927], one: [-1298.2, 2978.3], b43: [-1256.6, 2948.4] };   // tk: city/tsqPlaza.js DUFFY
const wAt = (xz, alt) => at(W(xz[0], xz[1]), alt);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const tkAt = (s) => [TSQ.tk[0] + TSQ.tkA[0] * s, TSQ.tk[1] + TSQ.tkA[1] * s];
const tkAtO = (s, o) => [TSQ.tk[0] + TSQ.tkA[0] * s - TSQ.tkA[1] * o, TSQ.tk[1] + TSQ.tkA[1] * s + TSQ.tkA[0] * o];   // + o: east of the steps' axis
const T2G = 'saturation:1.14,contrast:0.2,motionBlur:0.5';
const T2C = 'saturation:1.14,contrast:0.2,motionBlur:0.3';   // the calm golden takes: a 2 m dolly past chairs smeared at 0.5
Object.assign(SHOTS, {
  // ---- the breakdown: golden hour, calm
  t2Allee: {
    // down the north allee at 2.1 m, the plane trunks either side, chairs under them, the library's back at the end
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2C, time: 'golden', duration: 3.8, ease: 0.1, warm: 240, fov: 55,
    title: 'Teaser 2: down the Bryant Park allee at golden hour',
    // 3.5 m off the allee's walk line (v 109.5, bpPromenades) and 2.6 m up: on the line at 2.2 m (from the terrain, ~0.3 m
    // under the gravel) the lens went through the heads of the walkers coming the other way (LENS-INSIDE x13)
    keys: [
      { p: at(bp(34, 106), 2.6), look: at(bp(96, 107), 2.9) },
      { p: at(bp(43, 106), 2.6), look: at(bp(105, 107), 2.9) },
      { p: at(bp(52, 106), 2.6), look: at(bp(114, 107), 2.9) },
    ],
  },
  t2Lawn: {
    // off the lawn's west end: from 1.4 m over the grass up to 34 m, pulling back over the Sixth Avenue terrace
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2C, time: 'golden', duration: 3.8, ease: 0.14, warm: 240, fov: 55,
    title: 'Teaser 2: rise off the Bryant Park lawn to the Midtown towers',
    keys: [
      { p: at(bp(40, 69), 2.4), look: at(bp(112, 69), 5) },
      { p: at(bp(32, 69), 15), look: at(bp(116, 69), 8) },
      { p: at(bp(22, 69), 34), look: at(bp(122, 69), 14) },
    ],
  },
  t2Aerial: {
    // the establishing push: over the library's cornice (34 m) at 56 m, gliding west and down to 46 m above the park's east
    // end, the whole BP28 layout below (lawn, walks, allees, the fountain at the far end), Sixth Avenue's towers beyond.
    // (First take: from 88 m over the south-west corner it flew into the 40th St roofs and never showed the park.)
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2C, time: 'golden', duration: 3.8, ease: 0.12, warm: 240, fov: 55,
    title: 'Teaser 2: golden-hour push over Bryant Park',
    keys: [
      { p: at(bp(178, 69), 56), look: at(bp(40, 69), 4) },
      { p: at(bp(163, 69), 51), look: at(bp(30, 69), 4) },
      { p: at(bp(148, 69), 46), look: at(bp(20, 69), 4) },
    ],
  },
  t2Lions: {
    // Fifth Avenue: a lateral track north along the library's front at 3 m, the steps, the lions and the arches beyond.
    // The golden sun (205 deg) only grazes a front that faces 119 deg: swung to 160 deg it rakes the order across the marble
    // OUT of the cut (t2probe): the front is still one flat grey marble at a lateral 11.6 m/s over Fifth Avenue's traffic
    act: 'teaser2Out', flags: 'fall=0.7&gfx=sunAzim:-45,' + T2G, time: 'golden', duration: 3.8, ease: 0.12, warm: 240, fov: 50,
    title: 'Teaser 2: along the library front on Fifth Avenue',
    keys: [
      { p: at(brg(brg(NYPL_5TH, AV_S, 34), ST_E, 26), 3.2), look: at(brg(NYPL_5TH, AV_S, 8), 7) },
      { p: at(brg(brg(NYPL_5TH, AV_S, 12), ST_E, 26), 3.2), look: at(brg(NYPL_5TH, AV_N, 4), 7) },
      { p: at(brg(brg(NYPL_5TH, AV_N, 10), ST_E, 26), 3.2), look: at(brg(NYPL_5TH, AV_N, 16), 7) },
    ],
  },
  t2Canyon42: {
    // 42nd St east from Sixth Avenue at 13 m, the park's crowns on the right, the canyon running on to Grand Central
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2G, time: 'golden', duration: 3.8, ease: 0.1, warm: 240, fov: 55,
    title: 'Teaser 2: down 42nd St past Bryant Park',
    keys: [
      { p: at(bp(-12, 153), 13), look: at(bp(160, 153), 16) },
      { p: at(bp(22, 153), 12), look: at(bp(194, 153), 15) },
      { p: at(bp(56, 153), 11), look: at(bp(228, 153), 14) },
    ],
  },
  // ---- the drop: Times Square at night
  t2Drop: {
    // the vertigo drop into the bowtie: from 190 m straight over 45th down to 44 m, turning, the screens coming up round
    // the lens and the frame levelling out to look down the Square at One Times Square
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2G, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 62,
    title: 'Teaser 2: drop into Times Square at night',
    keys: [
      { p: wAt([TSQ.b45[0] + 10, TSQ.b45[1] - 26], 190), look: wAt(TSQ.b45, 0) },
      { p: wAt([TSQ.b45[0] + 18, TSQ.b45[1] - 44], 108), look: wAt(lerp2(TSQ.b45, TSQ.one, 0.35), 0) },
      { p: wAt([TSQ.b45[0] + 20, TSQ.b45[1] - 60], 44), look: wAt(TSQ.one, 26) },
    ],
  },
  t2Plaza: {
    // up the Broadway plaza at 4.2 m from 43rd toward 44th (the block where the plaza runs between two walls of screens;
    // from 44th to 45th it pinches out into Seventh Avenue), 8 m/s over the crowd (t2probe: 12 m/s smeared everything)
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2C, time: 'night', duration: 3.6, ease: 0.1, warm: 450, fov: 60,
    title: 'Teaser 2: over the Times Square crowd up the Broadway plaza',
    keys: [
      { p: wAt(lerp2(TSQ.b43, TSQ.b44, 0.14), 4.2), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.55), 12) },
      { p: wAt(lerp2(TSQ.b43, TSQ.b44, 0.32), 4.2), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.75), 12) },
      { p: wAt(lerp2(TSQ.b43, TSQ.b44, 0.50), 4.2), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.95), 12) },
    ],
  },
  t2Seventh: {
    // down Seventh Avenue from 46th at 24 m to 14 m over the taxis, the screen walls either side, One Times Square ahead
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2G, time: 'night', duration: 3.4, ease: 0.12, warm: 450, fov: 60,
    title: 'Teaser 2: down Seventh Avenue between the screens',
    keys: [
      { p: wAt(lerp2(TSQ.s46, TSQ.s44, -0.18), 24), look: wAt(TSQ.one, 20) },
      { p: wAt(lerp2(TSQ.s46, TSQ.s44, 0.2), 19), look: wAt(TSQ.one, 18) },
      { p: wAt(lerp2(TSQ.s46, TSQ.s44, 0.55), 14), look: wAt(TSQ.one, 16) },
    ],
  },
  t2Steps: {
    // the TKTS steps: a push in and up toward them from 24 m out at 1.7 m to 14 m out at 8.5 m, the risers glowing over the
    // crowd on the square (t2probe: a crane over them that turned 180 deg in 3.4 s was one whip-pan blur)
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2C, time: 'night', duration: 3.4, ease: 0.14, warm: 450, fov: 58,
    title: 'Teaser 2: rise toward the red steps in Duffy Square',
    keys: [
      { p: wAt(tkAt(-26), 1.7), look: wAt(tkAt(3), 3.2) },
      { p: wAt(tkAt(-21), 4.8), look: wAt(tkAt(4), 3.6) },
      { p: wAt(tkAt(-16), 8.5), look: wAt(tkAt(5), 4.0) },
    ],
  },
  t2Rise: {
    // the close: up and back from 22 m over 45th to 170 m, the whole bowtie glowing below
    act: 'teaser2', flags: 'fall=0.7&gfx=' + T2G, time: 'night', duration: 3.8, ease: 0.14, warm: 450, fov: 60,
    title: 'Teaser 2: rise out of Times Square',
    // up and back with One Times Square held in frame: the screens face the street, so a lens that ends looking straight
    // down (t2probe: 170 m) sees roofs; at 110 m the whole bowtie still shows its screens in perspective
    keys: [
      { p: wAt([-1196, 2752], 22), look: wAt(TSQ.one, 22) },
      { p: wAt([-1188, 2716], 46), look: wAt(TSQ.one, 14) },
      { p: wAt([-1180, 2680], 72), look: wAt(TSQ.one, 8) },
    ],   // (a first take to 110 m ended on dark tower faces: the canyon's screens were out of sight below)
  },
});

// ======================= TEASER 3 (owner 2026-09-28) ======================
// "nyc_teaser_v2.mp4 had a great motion blur and camera design remember that": teaser 1's recipe (TG, blur 0.5; fast
// eased 3.2-3.8 s moves with a strong change of direction: a spiral dive, a skim, an arc, a crane, a swoop) over this
// round's Bryant Park (BP31) and Times Square (TA31 boards, TF31 furniture, SW31 people seated at the tables and on the
// benches), cut by tools/ad/teaser3_cut.mjs. The park by day, the Square by day (TF32), the park at golden hour, then the
// drop into the Square at night.
// fall=0: the park's planes in their late-summer green, as in the references (fall=0.7 turns 84 % of every crown).
const BPC = [80, 70.35], FNT = [29.4, 70.6];   // the lawn's middle and the Lowell fountain (city/bryantParkKit.js), park frame
const bpPol = (c, a, r) => bp(c[0] + Math.cos((a * Math.PI) / 180) * r, c[1] + Math.sin((a * Math.PI) / 180) * r);   // a from +u (east), +v north
const wPol = (c, a, r) => [c[0] + Math.cos((a * Math.PI) / 180) * r, c[1] + Math.sin((a * Math.PI) / 180) * r];      // a from +x (east), +z south
const PLZ = (() => { const d = [TSQ.b44[0] - TSQ.b43[0], TSQ.b44[1] - TSQ.b43[1]], l = Math.hypot(d[0], d[1]); return { u: [d[0] / l, d[1] / l], r: [-d[1] / l, d[0] / l] }; })();   // up the plaza, and to its east side
const plz = (t, off) => { const c = lerp2(TSQ.b43, TSQ.b44, t); return [c[0] + PLZ.r[0] * off, c[1] + PLZ.r[1] * off]; };
// a point on Seventh Avenue (s46 -> s44 at t) moved `off` m to the right of a lens looking down it (west-north-west)
const s7w = (t, off) => { const c = lerp2(TSQ.s46, TSQ.s44, t), d = [TSQ.s44[0] - TSQ.s46[0], TSQ.s44[1] - TSQ.s46[1]], l = Math.hypot(d[0], d[1]); return [c[0] - (d[1] / l) * off, c[1] + (d[0] / l) * off]; };
Object.assign(SHOTS, {
  t3ParkDive: {
    // the spiral onto Bryant Park: from 210 m over its north-west corner down to 70 m, the frame turning 70 deg round the
    // lawn's middle, the library's back and the 42nd St towers swinging round it
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'day', duration: 3.5, ease: 0.12, warm: 450,
    title: 'Teaser 3: spiral dive onto Bryant Park',
    keys: [
      { p: at(bpPol(BPC, 135, 95), 210), look: at(bp(...BPC), 0) },
      { p: at(bpPol(BPC, 170, 75), 135), look: at(bp(...BPC), 0) },
      { p: at(bpPol(BPC, 205, 55), 70), look: at(bp(...BPC), 0) },
    ],
  },
  t3LawnSkim: {
    // east along the lawn's north walk at 3.4 m over the rows of chairs facing the lawn and the people in them, the lens
    // turning out over the lawn to the library's back
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'day', duration: 3.4, ease: 0.1, warm: 450, fov: 58,
    title: 'Teaser 3: skim along the Bryant Park lawn',
    keys: [
      // (first probe: at v 101 the north border's crowns hung over the lens; out over the chairs at v 99.2, and a steadier look)
      { p: at(bp(50, 99.2), 4.0), look: at(bp(90, 88), 1.2) },
      { p: at(bp(63, 99.2), 4.0), look: at(bp(108, 84), 1.5) },
      { p: at(bp(76, 99.2), 4.0), look: at(bp(126, 80), 2.5) },
    ],
  },
  // ---- TF32 (owner 2026-09-29: "add daytime shots using proper references"): Times Square by day, between the park by
  // day and the park at golden hour, on the TF32 pieces (city/tsqKit.js) and the references in docs/notes/tsq-graphics.md:
  // the 43rd St corner (r12: the cylindrical screen, r13: the station's neon flag, One Times Square) and Duffy Square (r04)
  t3DayCorner: {
    // the swoop into the Square's south triangle: from 34 m over the 43rd St junction looking at 4 Times Square's
    // cylindrical screen down to 7 m over the plaza, the look swinging 110 deg west onto One Times Square's stack
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'day', duration: 3.6, ease: 0.12, warm: 450, fov: 60,
    title: 'Teaser 3: swoop past the corner screen to One Times Square by day',
    keys: [
      { p: wAt([-1266, 2940], 34), look: wAt([-1243.5, 2976.5], 20) },
      { p: wAt([-1262, 2952], 18), look: wAt([-1262, 2992], 16) },
      { p: wAt([-1255, 2962], 7), look: wAt(TSQ.one, 30) },
    ],
  },
  t3DayFlag: {
    // a crane off the recruiting station's neon flag: from 2.6 m on the plaza facing the flag up to 30 m, the look turning
    // 100 deg from the flag (west) to the length of the bowtie (north-north-east) as the screen walls open out
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'day', duration: 3.6, ease: 0.14, warm: 450, fov: 58,
    title: 'Teaser 3: crane up from the neon flag over the bowtie by day',
    keys: [
      { p: wAt([-1246.5, 2916.0], 2.6), look: wAt([-1263.0, 2921.8], 2.4) },
      { p: wAt([-1247.5, 2912.0], 13), look: wAt([-1236.0, 2870.0], 10) },
      { p: wAt([-1248.5, 2908.0], 30), look: wAt(TSQ.b46, 22) },
    ],
  },
  t3DayDuffy: {
    // an arc round Father Duffy at 13 m, 3.2 -> 5 m up: 70 deg of orbit from his east to his west side, the statue and its
    // Celtic cross against the red steps and the ticket signs, Duffy Square's screens beyond (4.4 m/s)
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'day', duration: 3.4, ease: 0.14, warm: 450, fov: 55,
    title: 'Teaser 3: arc round Father Duffy and the red steps by day',
    keys: [
      { p: wAt([-1159.0, 2686.4], 3.2), look: wAt([-1161.9, 2673.8], 4.2) },
      { p: wAt([-1166.8, 2685.8], 4.1), look: wAt([-1161.9, 2673.8], 4.4) },
      { p: wAt([-1172.8, 2680.8], 5.0), look: wAt([-1161.9, 2673.8], 4.6) },
    ],
  },
  t3Fountain: {
    // an arc round the Lowell fountain from its west side at 5 -> 4 m, the jet in front, the lawn, its chairs and the
    // library's back beyond: 60 deg of orbit at 4.4 m/s
    act: 'teaser3', time: 'golden', duration: 3.6, ease: 0.14, warm: 240, fov: 55, flags: 'fall=0&gfx=' + TG,
    title: 'Teaser 3: arc round the Bryant Park fountain',
    keys: [
      { p: at(bpPol(FNT, 150, 15), 5.2), look: at(bp(62, 70.6), 1.5) },
      { p: at(bpPol(FNT, 180, 14), 4.6), look: at(bp(62, 70.6), 1.5) },
      { p: at(bpPol(FNT, 210, 15), 4.0), look: at(bp(62, 70.6), 1.5) },
    ],
  },
  t3Crane: {
    // a crane up from the lawn's south side, 1.8 m to 30 m, the lawn and its people opening out and the library's back
    // rising behind them
    act: 'teaser3', time: 'golden', duration: 3.6, ease: 0.14, warm: 240, fov: 55, flags: 'fall=0&gfx=' + TG,
    title: 'Teaser 3: crane up over the Bryant Park lawn',
    keys: [
      // (first probe: from the south walk (v 41.8 -> 39.2) it rose through the south allee's crowns; from the lawn now)
      // (second probe: a south-side crown still filled the frame's right third at 12 m; 6 m further north)
      { p: at(bp(68, 56), 1.8), look: at(bp(150, 75), 8) },
      { p: at(bp(64, 54), 12), look: at(bp(150, 75), 6) },
      { p: at(bp(60, 52.5), 30), look: at(bp(150, 75), 4) },
    ],
  },
  t3Drop: {
    // the spinning drop into the bowtie at night: 230 m over 45th straight down the Square's open axis to 50 m, the frame
    // turning 100 deg as the look swings from east, looking down, to One Times Square, the screens coming up round the lens
    // (first probe: an orbit 50 m out round 45th flew into a tower face at 130 m; the bowtie is open only along its axis)
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 62,
    title: 'Teaser 3: spinning drop into Times Square',
    keys: [
      { p: wAt([TSQ.b45[0] + 8, TSQ.b45[1] - 22], 230), look: wAt([TSQ.b45[0] + 38, TSQ.b45[1] - 12], 0) },
      { p: wAt([TSQ.b45[0] + 14, TSQ.b45[1] - 40], 125), look: wAt([TSQ.b45[0] + 10, TSQ.b45[1] + 30], 0) },
      { p: wAt([TSQ.b45[0] + 20, TSQ.b45[1] - 58], 50), look: wAt(TSQ.one, 24) },
    ],
  },
  t3Seventh: {
    // the swoop down Seventh Avenue from over the 47th St roofs to 10 m above the taxis, between the screen walls
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.4, ease: 0.14, warm: 450, fov: 60,
    title: 'Teaser 3: swoop down Seventh Avenue',
    keys: [
      { p: wAt(lerp2(TSQ.s46, TSQ.s44, -0.75), 62), look: wAt(lerp2(TSQ.s46, TSQ.s44, 0.6), 2) },
      // (first probe: the lower keys passed a few metres from the screens on the avenue's east side: 6 m to the west now)
      { p: wAt(s7w(-0.35, 6), 30), look: wAt(lerp2(TSQ.s46, TSQ.s44, 0.9), 6) },
      { p: wAt(s7w(0.05, 6), 10), look: wAt(TSQ.one, 18) },
    ],
  },
  t3Plaza: {
    // up the Broadway plaza at 6 m, sweeping from its west side to its east over the red tables, the granite benches and
    // the people sitting at them, the screen walls either side
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 60,
    title: 'Teaser 3: glide across the Times Square plaza',
    keys: [
      { p: wAt(plz(0.15, -5), 6), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.6), 10) },
      { p: wAt(plz(0.35, 0), 6), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.75), 10) },
      { p: wAt(plz(0.55, 5), 6), look: wAt(lerp2(TSQ.b44, TSQ.b45, 0.9), 10) },
    ],
  },
  t3Steps: {
    // the red steps: a crane from 2 m on the square in front of them up to 20 m, rising past Father Duffy, the risers
    // glowing under the lens and Duffy Square's screens rising beyond. 6.5 -> 4.5 m east of the steps' axis: on the axis
    // the lens started 2.8 m behind the statue (TF32, 13.3 m south of the steps' middle) and rose through its pedestal
    // (the recorder re-shot frames 20-27 as too plain: a stone face filling the frame)
    act: 'teaser3', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 4.0, ease: 0.14, warm: 450, fov: 58,
    title: 'Teaser 3: crane up the red steps past Father Duffy',
    keys: [
      { p: wAt(tkAtO(-18, 6.5), 2.0), look: wAt(tkAt(6), 4.5) },
      { p: wAt(tkAtO(-12, 5.5), 9), look: wAt(tkAt(14), 6) },
      { p: wAt(tkAtO(-6, 4.5), 20), look: wAt(tkAt(40), 10) },
    ],
  },
  t3Rise: {
    // out of the cut (second probe: from 95 m up it looks at flat tower faces; the red steps close the teaser instead)
    // the close: straight up over the bowtie's widest part (45th-46th) from 26 m to 190 m, One Times Square held in frame
    // (first probe: up and back toward Duffy Square it ended between two flat tower faces at 80-150 m)
    act: 'teaser3Out', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.8, ease: 0.16, warm: 450, fov: 60,
    title: 'Teaser 3: rise out of Times Square',
    keys: [
      { p: wAt([-1203, 2778], 26), look: wAt(TSQ.one, 18) },
      { p: wAt([-1197, 2752], 95), look: wAt(TSQ.one, 6) },
      { p: wAt([-1190, 2725], 190), look: wAt(TSQ.one, 0) },
    ],
  },
});

// ======================= TEASER 4 (owner 2026-09-30) ======================
// "getting Central Park working as a new update along with a new teaser for it ... the central fountain area": the park
// rebuilt by CP32 (city/centralPark.js: the Lake and the ponds, the canopy, the Mall's elms, Bethesda Terrace and the
// Angel of the Waters, Bow Bridge, the rowboats, Belvedere Castle, Gapstow Bridge), on teaser 3's recipe (TG, blur 0.5,
// eased 3.4-3.8 s moves with a strong change of direction), cut by tools/ad/teaser4_cut.mjs. The park by day from the
// air, the Mall, the terrace and the fountain, the Lake and its bridge, then the park at golden hour.
// World metres (OSM, 2026-09-30): Bethesda Fountain (30.9, 976.2), the Arcade (12.7, 1039.5), Bow Bridge (-47.9, 815.8),
// the Loeb Boathouse (205.1, 863.8), Belvedere Castle (194.5, 419.9), Turtle Pond (274.7, 404.3), the Great Lawn (389.9,
// 196.2), the Reservoir (768.9, -264.5), Gapstow Bridge (-221.7, 1797.3), the Pond (-290.1, 1870.9), the Plaza (-277.5,
// 2071.5). The Mall runs at bearing 16 deg from the Literary Walk's south end (-110, 1455) to the terrace (s 0 -> ~420 m).
// Heights on the relief (city/cpRelief.js) and the parts' levels (docs/notes/central-park-bethesda.md, -land.md): the
// Lake's surface y -4.15; Bethesda's lower terrace -3.20, the upper terrace and drive 2.59; the pool's water -2.90, the
// angel's feet 2.85, her crown ~5.3 (she faces south, toward the Arcade). The shots over the terrace and the water take
// those as absolute heights (abs: the path camera's ground follow would track the lake bed and the terrace's pit).
const CPY = { lake: -4.16, lower: -3.2, upper: 2.59, angel: 4.1, pond: -2.2, turtle: 8.69, castle: 15.6, res: 8.89 };
const CPK = { fount: [31.313, 976.286], arcade: [12.7, 1039.5], bow: [-47.9, 815.8], boathouse: [205.1, 863.8], castle: [194.5, 419.9],
  turtle: [274.7, 404.3], lawn: [389.9, 196.2], res: [768.9, -264.5], gapstow: [-221.7, 1797.3], pond: [-290.1, 1870.9], plaza: [-277.5, 2071.5] };
const MALL_U = [0.2756, -0.9613], MALL_R = [0.9613, 0.2756];   // up the Mall (bearing 16), and to its east side
const mall = (s, off = 0) => [-110 + MALL_U[0] * s + MALL_R[0] * off, 1455 + MALL_U[1] * s + MALL_R[1] * off];
const cpPol = (c, b, r) => [c[0] + Math.sin((b * Math.PI) / 180) * r, c[1] - Math.cos((b * Math.PI) / 180) * r];   // compass bearing b from c
const T4F = 'fall=0&gfx=' + TG;
Object.assign(SHOTS, {
  t4Dive: {
    // TEASER 4 v3 opener (review 2026-09-30: "billed as a dive but a straight descending push"): a fall from 260 m looking
    // down at the Pond and Gapstow (-65 deg) that tilts up 72 deg through the drop, so the park fills the first half and
    // Billionaires' Row arrives as the payoff just before the kick
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.12, warm: 450, fov: 60,
    title: "Teaser 4: dive over the Pond, tilting up to Billionaires' Row",
    keys: [
      { p: wAt([-245, 1600], 260), look: wAt([-262, 1720], 0) },
      { p: wAt([-255, 1660], 150), look: wAt([-330, 1950], 50) },
      { p: wAt([-265, 1710], 60), look: wAt([-470, 2120], 120) },
    ],
  },
  t4Arrive: {
    // the arrival, over the music's quiet intro (16 beats): 380 -> 290 m from over the Great Lawn's south end, drifting
    // south down the park toward Midtown, the whole park and Billionaires' Row ahead
    act: 'teaser4', flags: T4F, time: 'day', duration: 7.2, ease: 0.12, warm: 450, fov: 60,
    title: 'Teaser 4: over Central Park toward Midtown',
    keys: [
      { p: wAt([330, 240], 380), look: wAt([-380, 2250], 120) },
      { p: wAt([250, 450], 350), look: wAt([-395, 2290], 120) },
      { p: wAt([170, 660], 320), look: wAt([-410, 2330], 120) },
      { p: wAt([90, 870], 290), look: wAt([-425, 2370], 120) },
    ],
  },
  t4Gapstow: {
    // v3: a low push over the Pond into Gapstow's arch that rises over the parapet (1.2 -> 9.5 m over the water, the look
    // tilting up 16 deg), the walkers on the bridge passing under the lens and the Central Park South towers rising over
    // the deck; every key on the water (the Pond's north shore is at z ~1765 here)
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.12, warm: 450, fov: 55, abs: true,
    title: 'Teaser 4: up over Gapstow Bridge to Central Park South',
    keys: [
      { p: wAt([-226, 1768], CPY.pond + 1.2), look: wAt([-222, 1797], CPY.pond + 1.7) },
      { p: wAt([-224, 1780], CPY.pond + 3.5), look: wAt([-226, 1850], CPY.pond + 10) },
      { p: wAt([-222, 1792], CPY.pond + 8.5), look: wAt([-234, 1950], 38) },   // (a gentler last tilt: the probe's end smeared)
    ],
  },
  t4Mall: {
    // up the Mall under the elms at 4.5 m, the benches and the walkers either side, toward the terrace; v2: at golden hour
    // (by day the canopy's shade turned the promenade navy), the low sun behind the lens's left through the elms
    act: 'teaser4', flags: T4F, time: 'golden', duration: 4.0, ease: 0.1, warm: 240, fov: 58,
    title: 'Teaser 4: up the Mall under the elms',
    keys: [
      // v3: a lift from bench height into the elms' vault (2 -> 6.5 m), ending on the vault, not the one-point frame it began on
      { p: wAt(mall(40, -1), 2.0), look: wAt(mall(120, 0), 1.6) },
      { p: wAt(mall(80, 0), 4.0), look: wAt(mall(170, 0), 3.0) },
      { p: wAt(mall(125, 1), 6.5), look: wAt(mall(230, 0), 5.0) },
    ],
  },
  t4Crane: {
    // the crane down onto the fountain: from 30 m over the upper terrace, the Angel of the Waters and the Lake ahead, down
    // over the Arcade's balustrade to 4.5 m over the south terrace, the angel at eye level
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.14, warm: 450, fov: 58, abs: true,
    title: 'Teaser 4: crane down to Bethesda Fountain',
    keys: [
      { p: wAt([6, 1062], CPY.upper + 30), look: wAt(CPK.fount, CPY.lower) },
      { p: wAt([12, 1034], CPY.upper + 12), look: wAt(CPK.fount, CPY.angel - 2) },
      { p: wAt([18, 1010], CPY.lower + 4.5), look: wAt(CPK.fount, CPY.angel) },
    ],
  },
  t4Angel: {
    // v3, golden hour: an orbit 12 m out over the pool, 2.5 m over its water, looking up 24 deg at the Angel against the sky
    // (the v2 orbit level with her set the dark bronze against the dark tree line), bearings 135 -> 225, the low western
    // sun on her and the veils from the side
    act: 'teaser4', flags: T4F, time: 'golden', duration: 4.0, ease: 0.14, warm: 240, fov: 55, abs: true,
    title: 'Teaser 4: round the Angel of the Waters at golden hour',
    keys: [
      { p: wAt(cpPol(CPK.fount, 135, 12), CPY.lower + 2.8), look: wAt(CPK.fount, 5.0) },
      { p: wAt(cpPol(CPK.fount, 180, 12), CPY.lower + 2.8), look: wAt(CPK.fount, 5.0) },
      { p: wAt(cpPol(CPK.fount, 225, 12), CPY.lower + 2.8), look: wAt(CPK.fount, 5.0) },
    ],
  },
  t4Lake: {
    // v3: the postcard on a long lens, low over the Lake from the east with Bow Bridge and the San Remo's towers in frame
    // (the v2 line: the review's line further north ran into the east shore's crowns, probe 07:28), rising 2.4 -> 3.6 m;
    // every key 18-23 m inside LAND's shore
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.1, warm: 450, fov: 30, abs: true,
    title: 'Teaser 4: across the Lake to Bow Bridge and the San Remo',
    keys: [
      { p: wAt([72, 849], CPY.lake + 2.4), look: wAt([-212, 716], 26) },
      { p: wAt([60, 846], CPY.lake + 3.0), look: wAt([-214, 714], 26) },
      { p: wAt([48, 842], CPY.lake + 3.6), look: wAt([-216, 712], 26) },
    ],
  },
  t4Belvedere: {
    // v3: a 70 deg arc 80 m round Belvedere Castle over the canopy (62 -> 56 m), looking down only -14 deg so the castle sits
    // in the lower third with Central Park West's skyline and a band of sky over it
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.12, warm: 450, fov: 45, abs: true,
    title: 'Teaser 4: arc round Belvedere Castle',
    keys: [
      // (probe 07:28: from bearing 110 the canopy hid the castle; the arc now ends at 85, a little higher)
      { p: wAt(cpPol(CPK.castle, 35, 80), 72), look: wAt(CPK.castle, CPY.castle + 16) },
      { p: wAt(cpPol(CPK.castle, 60, 80), 68), look: wAt(CPK.castle, CPY.castle + 16) },
      { p: wAt(cpPol(CPK.castle, 85, 80), 64), look: wAt(CPK.castle, CPY.castle + 16) },
    ],
  },
  t4Turtle: {
    // CP34 (the castle rebuilt from the Commons views over Turtle Pond, refs/cp33/castle/belv_turtle.jpg): the castle's
    // postcard, low over the pond's west end sliding north-west 2.4 m over the water, the turret, the keep and the wing on
    // Vista Rock's cliff over the water and the San Remo's towers behind; the alternative to t4Belvedere's aerial arc
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.12, warm: 450, fov: 40, abs: true,
    title: 'Teaser 4: over Turtle Pond to Belvedere Castle',
    keys: [
      // a slide across the pond's west end, 80 deg off the look, ending on the castle worker's best low view (224, 10.8, 376):
      // the turret comes out from behind the island's trees a second in and the whole front holds clear to the end (cams
      // checked pose by pose, scratchpad turtle/paths.jpg row B)
      { p: wAt([238.5, 385.5], 11.4), look: wAt(CPK.castle, 18.5) },
      { p: wAt([231.3, 380.8], 11.1), look: wAt(CPK.castle, 18.5) },
      { p: wAt([224, 376], 10.8), look: wAt(CPK.castle, 18.5) },
    ],
  },
  t4Bow: {
    // v2: the view the park is known for: from low over the Lake east of Bow Bridge, up past its railing and over the
    // span, the look swinging from the bridge to the San Remo's twin towers across the water (compiled #13, tile -1_1,
    // (-336.8, 560.2), 120.5 m)
    act: 'teaser4', flags: T4F, time: 'day', duration: 3.6, ease: 0.12, warm: 450, fov: 55, abs: true,
    title: 'Teaser 4: over Bow Bridge to the San Remo',
    keys: [
      { p: wAt([-18, 832], CPY.lake + 1.6), look: wAt([-60, 812], CPY.lake + 2.5) },
      { p: wAt([-36, 824], CPY.lake + 6.5), look: wAt([-200, 690], 30) },
      { p: wAt([-55, 814], CPY.lake + 12), look: wAt([-337, 560], 95) },
    ],
  },
  t4Sheep: {
    // v2: low and fast across the Sheep Meadow, 3.2 -> 4.6 m over the grass, toward the towers at the park's south-east
    // corner (the Plaza, 432 Park); by day (the golden probe put the sun's glare behind the towers and browned the lawn)
    act: 'teaser4', flags: T4F, time: 'day', duration: 4.0, ease: 0.1, warm: 450, fov: 58,
    title: 'Teaser 4: across the Sheep Meadow toward the towers',
    keys: [   // v3: a hedge-hop reveal, 1.5 -> 2.5 m over the grass, then up to 16 m as the south treeline comes, the towers rising over the crowns
      { p: wAt([-335, 1170], 1.5), look: wAt([-120, 2300], 150) },
      { p: wAt([-320, 1235], 2.5), look: wAt([-115, 2300], 140) },
      { p: wAt([-303, 1300], 16), look: wAt([-110, 2300], 120) },
    ],
  },
  t4Reservoir: {
    // a skim over the Reservoir toward the Midtown skyline, 12-16 m over the water (by day: at golden hour the sun sat in
    // the frame and blew it out, lead probe 08:20)
    act: 'teaser4', flags: T4F, time: 'day', duration: 3.6, ease: 0.12, warm: 450, fov: 58, abs: true,
    title: 'Teaser 4: across the Reservoir toward Midtown',
    keys: [
      { p: wAt([960, -520], CPY.res + 12), look: wAt([100, 1200], 110) },
      { p: wAt([880, -440], CPY.res + 14), look: wAt([60, 1250], 110) },
      { p: wAt([800, -360], CPY.res + 16), look: wAt([20, 1300], 110) },
    ],
  },
  t4GreatLawn: {
    // golden hour: over the Great Lawn at 125-140 m looking north-north-east, the low sun behind the lens (the probe's look
    // toward Midtown sat in the sun's glare), Belvedere, the lawn and the Reservoir ahead
    act: 'teaser4', flags: T4F, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'Teaser 4: over the Great Lawn at golden hour',
    keys: [
      { p: wAt([250, 700], 140), look: wAt([650, -350], 30) },
      { p: wAt([290, 630], 132), look: wAt([670, -380], 30) },
      { p: wAt([330, 560], 125), look: wAt([690, -410], 30) },
    ],
  },
  t4Out: {
    // the close: back and up from over the terrace's drive, 32 -> 300 m, the Lake and the park opening out to the north
    // (the first probe started among the crowns 60 m east of the Mall)
    act: 'teaser4Out', flags: T4F, time: 'golden', duration: 4.4, ease: 0.16, warm: 240, fov: 60,
    title: 'Teaser 4: rise out of Bethesda Terrace',
    // CP34: the rise's left horizon is the Upper West Side to the Hudson, 2-3 km out: past the near ring the far LoD had no
    // trees or buildings in Riverside Park and the strip read as a bare grey wedge stepped along tile corners
    prestream: [wAt([-1200, -900], 300), wAt([-1100, 300], 300)],
    keys: [
      { p: wAt([25, 1030], 32), look: wAt([0, 800], 0) },
      { p: wAt([70, 1220], 150), look: wAt([60, 650], 0) },
      { p: wAt([110, 1400], 300), look: wAt([100, 500], 0) },
    ],
  },
});

// ---- AREA TEASERS BEGIN (written by the lead from the area builders' moves)

// ======================= TEASER 5 (owner 2026-09-30): 125th Street from Dinosaur Bar-B-Que to the East River (AR32 parts w125w, w125c, w125e)
// The moves were authored by each part's builder against its own stills (docs/notes/area-*.md).
Object.assign(SHOTS, {
  t5DinoGlide: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 58,
    title: 'Under the Riverside Drive Viaduct to Dinosaur Bar-B-Que',   // w125w
    keys: [
      { p: wAt([946, -3826], 4), look: wAt([905, -3878], 9) },
      { p: wAt([922, -3856], 5.5), look: wAt([884, -3897], 11) },
      { p: wAt([903, -3880], 9), look: wAt([876, -3902], 12.5) },
    ],
  },
  t5ValleyArch: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'The Manhattan Valley arch over 125th Street',   // w125w
    keys: [
      { p: wAt([1150, -3530], 30), look: wAt([1088, -3623], 10) },
      { p: wAt([1112, -3588], 6), look: wAt([1088, -3623], 9) },
      { p: wAt([1072, -3648], 5), look: wAt([1100, -3640], 17) },
    ],
  },
  t5ViaductCrane: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'dusk', duration: 3.6, ease: 0.12, warm: 450, fov: 60,
    title: 'Dinosaur Bar-B-Que\'s roof sign and the viaduct from Twelfth Avenue',   // w125w
    keys: [
      { p: wAt([828, -3900], 3), look: wAt([868, -3890], 12) },
      { p: wAt([846, -3906], 9), look: wAt([875, -3892], 12) },
      { p: wAt([850, -3935], 26), look: wAt([915, -3865], 18) },
    ],
  },
  t5ApolloDive: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 58,
    title: 'The Apollo: a dive from over 125th Street to the marquee',   // w125c
    keys: [
      { p: wAt([1723.6, -2979.5], 38), look: wAt([1774.5, -2976.5], 14) },
      { p: wAt([1745.2, -2973.2], 15), look: wAt([1774.5, -2976.5], 9) },
      { p: wAt([1760.5, -2969.8], 4.6), look: wAt([1776, -2976.2], 7.2) },
    ],
  },
  t5BladeCrane: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 56,
    title: 'The Apollo: a crane up the blade sign to the rooftop frame',   // w125c
    keys: [
      { p: wAt([1754.3, -2973], 2.4), look: wAt([1771.4, -2977.8], 9) },
      { p: wAt([1755, -2973.3], 12), look: wAt([1771.4, -2977.8], 17.5) },
      { p: wAt([1756.8, -2971.4], 27), look: wAt([1778.5, -2985.7], 20) },
    ],
  },
  t5StreetGlide: {
    act: 'teaser5', flags: 'fall=0&gfx=' + TG, time: 'dusk', duration: 3.6, ease: 0.12, warm: 450, fov: 60,
    title: '125th Street east: Hotel Theresa and the State Office Building plaza with its vendors',   // w125c
    keys: [
      { p: wAt([1803.2, -2945.7], 6), look: wAt([1864.9, -2912.6], 9) },
      { p: wAt([1863.9, -2910.9], 9), look: wAt([1899.4, -2861.5], 26) },
      { p: wAt([1919.1, -2882.6], 15), look: wAt([1992.5, -2883], 24) },
    ],
  },
});

// ======================= TEASER 6 (owner 2026-09-30): Hunters Point, the Pepsi-Cola sign and the waterfront (AR32 parts hptSign, hptShore)
// The moves were authored by each part's builder against its own stills (docs/notes/area-*.md).
Object.assign(SHOTS, {
  t6PepsiDive: {
    act: 'teaser6', flags: 'fall=0&gfx=' + TG, time: 'dusk', duration: 3.6, ease: 0.12, warm: 450, fov: 58, abs: true,
    title: 'Hunters Point: a dive from over the East River down to the Pepsi-Cola letters',   // hptSign
    keys: [
      { p: wAt([1003.6, 3892], 60), look: wAt([1140.7, 3953.7], 17.9) },
      { p: wAt([1076.4, 3925.8], 26), look: wAt([1140.7, 3953.7], 17.9) },
      { p: wAt([1123, 3949.7], 18.5), look: wAt([1138.4, 3959.8], 18) },
    ],
  },
  t6LetterGlide: {
    act: 'teaser6', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.6, ease: 0.12, warm: 450, fov: 55, abs: true,
    title: 'Hunters Point: a glide along the neon letters from the P\'s curl to the bottle',   // hptSign
    keys: [
      { p: wAt([1141.2, 3926.7], 18.5), look: wAt([1144.7, 3942.9], 18.5) },
      { p: wAt([1134, 3951.7], 16.5), look: wAt([1137, 3963.5], 17.5) },
      { p: wAt([1123.6, 3973.5], 19.5), look: wAt([1131, 3979.4], 18.5) },
    ],
  },
  t6MidtownTurn: {
    act: 'teaser6', flags: 'fall=0&gfx=' + TG, time: 'night', duration: 3.8, ease: 0.12, warm: 450, fov: 60, abs: true,
    title: 'Hunters Point: from under the neon, a crane and turn west to Midtown across the river',   // hptSign
    keys: [
      { p: wAt([1125.8, 3959.3], 7.5), look: wAt([1137.7, 3961.7], 20) },
      { p: wAt([1111, 3947.4], 20), look: wAt([900, 3900], 25) },
      { p: wAt([1089.7, 3932.9], 34), look: wAt([-600, 3860], 90) },
    ],
  },
  t6GantryArc: {
    act: 'teaser6', flags: 'fall=0&gfx=' + TG, time: 'dusk', duration: 3.6, ease: 0.12, warm: 450, fov: 58, abs: true,
    title: 'Hunters Point: an arc low over the slip up to the LONG ISLAND gantries',   // hptSign
    keys: [
      { p: wAt([984.2, 4290.5], 4), look: wAt([1044.2, 4260.5], 10) },
      { p: wAt([1004.2, 4260.5], 8), look: wAt([1044.2, 4260.5], 12) },
      { p: wAt([1022.2, 4238.5], 18), look: wAt([1044.5, 4262], 14) },
    ],
  },
});

// ======================= TEASER 7 (owner 2026-10-02 08:33: "let's get ready to render a new teaser in 2 hours. What I need is
// for you to make sure the camera doesn't pass through viaducts or other objects"): teaser 5's six 125th Street moves and
// teaser 6's four Hunters Point moves under t7 names (their takes land in new clip folders, so the teaser 5 / 6 takes stay),
// the Riverside Drive Viaduct's 125th Street arch as the showcase, and the tree push. The viaduct's moves are written in its
// own frame (city/vk/rsd.js RP: u along the OSM line from its south end A, NNE +; l across, ESE +, from the deck's centre
// 1.0 m east of the line; the arch's towers at u 102.0 / 140.0, the two rib lines at l -9.15 / +9.15, the road 23.3 m up,
// the fascia at l -12 / +12; Dinosaur Bar-B-Que's east face at l -32 .. -42 for u 80-128). Every move is audited by
// tools/ad/clearance.mjs (nothing drawn crossed, >= 0.6 m from everything drawn; docs/notes/ar34-film.md).
const RSA = [850.0, -3762.7], RSU = [0.48737, -0.87320];   // city/vk/rsd.js RS.A, RS.dir; RS.lc 1.0
const rsAt = (u, l, alt) => wAt([RSA[0] + RSU[0] * u - RSU[1] * (l + 1.0), RSA[1] + RSU[1] * u + RSU[0] * (l + 1.0)], alt);
const T7 = (from) => ({ ...SHOTS[from], act: 'teaser7', from });
Object.assign(SHOTS, {
  // the showcase: the arch's west elevation from the Twelfth Avenue side, 15 m out from the rib line, past the SW tower
  t7ArchTrack: {
    act: 'teaser7', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'The Riverside Drive Viaduct: along the spans to the 125th Street arch from the Twelfth Avenue side',
    keys: [
      { p: rsAt(70, -24, 14), look: rsAt(82, 4, 15) },
      { p: rsAt(99, -24.5, 14.5), look: rsAt(111, 4, 16) },
      { p: rsAt(128, -25, 15), look: rsAt(140, 4, 16) },
    ],
  },
  // a crane from the street up the arch's south-west tower to the deck, the arch turning into profile
  t7ArchCrane: {
    act: 'teaser7', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'The Riverside Drive Viaduct: a crane up the 125th Street arch\'s south-west tower to the deck',
    keys: [
      { p: rsAt(95, -24, 5), look: rsAt(102, -9.15, 6) },   // 5 m: the lens starts over the roadway (audit WARN at 2.5 m: a van passed 1.03 m away)
      { p: rsAt(96.5, -25.5, 13.5), look: rsAt(105, -9.15, 13.5) },
      { p: rsAt(98, -28, 28), look: rsAt(121, -9.15, 17) },
    ],
  },
  // a slow glide under the arch between its two ribs, looking up at the soffit, the bracing and the floor system
  t7ArchSoffit: {
    act: 'teaser7', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 60,
    title: 'The Riverside Drive Viaduct: under the 125th Street arch between its ribs',
    keys: [
      { p: rsAt(105, 0, 10), look: rsAt(125, 0, 19) },
      { p: rsAt(119, 0.4, 11), look: rsAt(139, 0, 19) },
      { p: rsAt(133, 0.8, 10.5), look: rsAt(155, 0, 16) },
    ],
  },
  // teaser 5's path, its two low keys raised (6 -> 7.5 m, 5 -> 6.5 m): the spline dipped to 3.8 m over Broadway's roadway
  // under the arch (audit WARN: a box truck could pass under the lens there)
  t7ValleyArch: {
    ...T7('t5ValleyArch'),
    keys: [
      { p: wAt([1150, -3530], 30), look: wAt([1088, -3623], 10) },
      { p: wAt([1112, -3588], 7.5), look: wAt([1088, -3623], 10) },
      { p: wAt([1072, -3648], 6.5), look: wAt([1100, -3640], 17.5) },
    ],
  },
  // teaser 5's t5ViaductCrane started under the Henry Hudson Parkway's deck at 12th Avenue (~6-9 m up) and rose through it
  // (FILM's audit: CROSSED at frames 22-30 and 32-40, tile_1_-8; the take's frames 20-40 show the slab cut open). The
  // same reveal of Dinosaur Bar-B-Que's roof sign and the viaduct now runs over the deck
  // OUT of the cut (act teaser7Out): lifted over the deck the frame is the restaurant's graffiti wall and two rooftop
  // billboards with the viaduct small and dark behind (the neon roof sign of teaser 5 is not on the roof now)
  t7ViaductCrane: {
    ...T7('t5ViaductCrane'), act: 'teaser7Out',
    // teaser 5's view lines, the whole path lifted over the parkway's deck (its road ~7.0 m over the street): 3 / 9 / 26 m ->
    // 12.5 / 15 / 27 m (5.5 m over the parkway's road: the tallest vehicle 4.05 m + 1.4 m)
    keys: [
      { p: wAt([828, -3900], 12.5), look: wAt([868, -3890], 12) },
      { p: wAt([846, -3906], 15), look: wAt([875, -3892], 13) },
      { p: wAt([850, -3935], 27), look: wAt([915, -3865], 18) },
    ],
  },

  // teaser 5's path with its two low keys raised (4 -> 5.2 m, 5.5 -> 6.3 m): it starts over W 125th St's roadway, and the
  // traffic is not seeded, so a box truck (fleet24's tallest body ~4.1 m) can pass under a 4 m lens in some take
  t7DinoGlide: {
    ...T7('t5DinoGlide'),
    keys: [
      { p: wAt([946, -3826], 5.2), look: wAt([905, -3878], 9) },
      { p: wAt([922, -3856], 6.3), look: wAt([884, -3897], 11) },
      { p: wAt([903, -3880], 9), look: wAt([876, -3902], 12.5) },
    ],
  },
  t7StreetGlide: T7('t5StreetGlide'),
  // the east end (EAST's teaser moves, docs/notes/area-w125e.md "Teaser shots"; owner 2026-10-02 10:02: "Let's not have
  // Hunter's point in this. I want to focus on 125th street."): the Park Avenue viaduct at the Harlem-125th St station, and
  // 125th Street's axis to the RFK Bridge's Harlem River lift span
  t7ParkCrane: {
    act: 'teaser7', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'The Park Avenue viaduct: from 125th Street up over the Harlem-125th St station to its platforms',
    keys: [
      { p: wAt([2668.2, -2462.1], 5.5), look: wAt([2716.6, -2452.5], 5.0) },
      { p: wAt([2688.4, -2444.5], 13), look: wAt([2726.1, -2467.7], 10) },   // 7 m east of EAST's key: its path crossed a street oak's crown and trunk (treeQ, audit frames 37-42)
      { p: wAt([2680.2, -2407.5], 24), look: wAt([2765.8, -2537.2], 11) },
    ],
  },
  // OUT (owner 10:20 on its probe: "The road needs proper spline curving and the bridge is completely broken right now"): the
  // east end's ramps and the RFK Bridge wait for a BRIDGES session
  t7RfkGlide: {
    act: 'teaser7Out', flags: 'fall=0&gfx=' + TG, time: 'golden', duration: 3.6, ease: 0.12, warm: 240, fov: 58,
    title: 'East along 125th Street to the RFK Bridge\'s Harlem River lift span',
    keys: [
      { p: wAt([3317.9, -2107.8], 18), look: wAt([3587.0, -1954.0], 32) },
      { p: wAt([3392.7, -2077.7], 24), look: wAt([3587.5, -1944.5], 34) },
      { p: wAt([3479.2, -2048.0], 34), look: wAt([3597.8, -1921.7], 38) },
    ],
  },
  // teaser 5's dive, its end 1 m higher (4.6 -> 5.6 m): it ends over 125th St's westbound lanes in front of the marquee, where
  // the audit's run had a 26 ft box truck pass 0.67 m from the lens (WARN: 4.47 m over the road)
  t7ApolloDive: {
    ...T7('t5ApolloDive'),
    keys: [
      { p: wAt([1723.6, -2979.5], 38), look: wAt([1774.5, -2976.5], 14) },
      { p: wAt([1745.2, -2973.2], 15), look: wAt([1774.5, -2976.5], 9) },
      { p: wAt([1760.5, -2969.8], 5.6), look: wAt([1776, -2976.2], 7.6) },
    ],
  },
  // teaser 5's crane, started at 5.2 m instead of 2.4 m: it stands over 125th St's kerb lane in front of the Apollo, where a 26 ft
  // box truck passed 0.31 m from the lens in the audit's run (FAIL; WARN 2.26 m over the road); the traffic is not seeded
  t7BladeCrane: {
    ...T7('t5BladeCrane'),
    keys: [
      { p: wAt([1754.3, -2973], 5.2), look: wAt([1771.4, -2977.8], 10.5) },
      { p: wAt([1755, -2973.3], 13), look: wAt([1771.4, -2977.8], 18) },
      { p: wAt([1756.8, -2971.4], 27), look: wAt([1778.5, -2985.7], 20) },
    ],
  },
  t7PepsiDive: { ...T7('t6PepsiDive'), act: 'teaser7Out' },   // out: 125th Street only (owner 10:02)
  t7GantryArc: { ...T7('t6GantryArc'), act: 'teaser7Out' },   // out: 125th Street only (owner 10:02)
  t7LetterGlide: { ...T7('t6LetterGlide'), act: 'teaser7Out' },   // out: 125th Street only (owner 10:02)
  t7MidtownTurn: { ...T7('t6MidtownTurn'), act: 'teaser7Out' },   // out: 125th Street only (owner 10:02)
  // the tree push (TR36-TR38 street and park trees): up the Mall under the elms
  // t4Mall's glide, its start 0.7 m higher (2 -> 2.7 m, 4 -> 4.3 m): the Mall's walkers pass under the lens, and a head
  // (to 1.95 m) under a 2 m lens is inside the near plane's cut; 2.7 m keeps 0.75 m over the tallest
  t7Mall: {
    ...T7('t4Mall'), act: 'teaser7Out', title: 'Central Park: up the Mall under the elms',   // out: 125th Street only (owner 10:02)
    keys: [
      { p: [-73.972386, 40.770356, 2.7], look: [-73.972113, 40.771045, 2.0] },
      { p: [-73.972243, 40.770699, 4.3], look: [-73.971949, 40.771478, 3.2] },
      { p: [-73.972085, 40.771086, 6.5], look: [-73.971753, 40.771997, 5] },
    ],
  },
});
// ---- AREA TEASERS END

const PROBES = {
  // round-2 alternates for the framings that were re-authored
  pBrownstoneB: P1('day', 'ALT brownstone: closer rake, 12 m off the north facade line',
    at(on122(18, 7), 1.7), at(brg(on122(18, 7), 66, 15), 4.0)),
  pBrownstoneC: P1('day', 'ALT brownstone: further ESE down W 122nd (next lot run)',
    at(on122(58, 5), 1.8), at(brg(on122(58, 5), 72, 19), 4.2)),
  pLenoxEyeB: P1('day', 'ALT Lenox eye: 34 m WNW, tighter on the crossing',
    at(on125(34, 5), 2.4), at(brg(LENOX, ST_E, 22), 6)),
  pMarkingsB: P1('day', 'ALT markings: 18 m WNW, lens almost on the bars',
    at(on125(18, 8), 1.4), at(brg(LENOX, ST_E, 12), 2.4)),
  pLowAerialB: P1('golden', 'ALT campus aerial: 95 m, closer on the dome',
    at(en(LOW, 96, -140), 96), at(LOW, 26)),

  // ---- offset ladder: where IS the 125th St carriageway? -----------------
  // The LENOX anchor is the junction as the compiler merged it, and it sits
  // NORTH of the 125th centreline: a 1.5 m camera offset 8 m "south" of it came
  // back standing on the north sidewalk twice (fMarkings, mLenoxEye, round 2).
  // Rather than guess again, walk the perpendicular in 4 m steps and read off
  // which one is in the kerb (bus) lane.
  pLad12: P1('day', 'LADDER 125th: 12 m south of the anchor', at(on125(30, 12), 1.5), at(brg(LENOX, ST_E, 8), 2.6)),
  pLad16: P1('day', 'LADDER 125th: 16 m south of the anchor', at(on125(30, 16), 1.5), at(brg(LENOX, ST_E, 8), 2.6)),
  pLad20: P1('day', 'LADDER 125th: 20 m south of the anchor', at(on125(30, 20), 1.5), at(brg(LENOX, ST_E, 8), 2.6)),
  pLad24: P1('day', 'LADDER 125th: 24 m south of the anchor', at(on125(30, 24), 1.5), at(brg(LENOX, ST_E, 8), 2.6)),
  // ---- which run of W 122nd actually reads as a brownstone row? -----------
  // The anchor's own block is commercial brick with no stoops in frame.
  pRowW40: P1('day', 'ROW W 122nd: 40 m WNW of the anchor', at(on122(-40, 5), 1.8), at(brg(on122(-40, 5), 72, 19), 4.2)),
  pRowW18: P1('day', 'ROW W 122nd: 18 m WNW of the anchor', at(on122(-18, 5), 1.8), at(brg(on122(-18, 5), 72, 19), 4.2)),
  pRowE64: P1('day', 'ROW W 122nd: 64 m ESE of the anchor', at(on122(64, 5), 1.8), at(brg(on122(64, 5), 72, 19), 4.2)),
  pRowE92: P1('day', 'ROW W 122nd: 92 m ESE of the anchor', at(on122(92, 5), 1.8), at(brg(on122(92, 5), 72, 19), 4.2)),
  // Mt Morris Park West itself — the classic Harlem brownstone frontage
  pMMPW: P1('day', 'ROW Mt Morris Park West, looking at the west-side houses',
    at(brg(brg(ROW, AV_N, 60), 119, 7), 1.8), at(brg(brg(brg(ROW, AV_N, 60), 119, 7), 341, 18), 4.4)),
  // ---- street life (film 7, 2026-09-23): where does a sidewalk lens see the crowd AND the traffic? ------
  pLifeA: P1('day', 'LIFE 125th north sidewalk, building side (s 5.6) at 1.9 m, looking ESE',
    at(on125(58, 5.6), 1.9), at(on125(34, 9.4), 1.3)),
  pLifeB: P1('day', 'LIFE 125th north sidewalk, edge of the walkers (s 6.4) at 2.3 m, looking ESE',
    at(on125(58, 6.4), 2.3), at(on125(34, 9.4), 1.3)),
  pLifeC: P1('day', 'LIFE 125th south sidewalk, building side (s 32.4) at 1.9 m, looking ESE',
    at(on125(58, 32.4), 1.9), at(on125(34, 28.6), 1.3)),
  // kept as evidence: the Brooklyn Bridge deck framings that did not work
  pBkBridge: P1('golden', 'REJECTED: Brooklyn Bridge deck at 30 m (camera beside a tower, blown river)',
    at(brg(BKTOWER, BK_BRG + 180, 92), 30), at(BKTOWER, 50)),
  pBkBridgeAlt: P1('golden', 'REJECTED: Brooklyn Bridge from the City Hall side at 40 m',
    at(brg(BKTOWER, BK_BRG + 180, 150), 40), at(BKTOWER, 60)),
  // ---- teaser 2 survey (owner 2026-09-27: "shots different than the trailer ... new areas like Times Square and Bryant
  // Park"): Midtown along 42nd St, one still each, before any work on them
  sTsqNightSt: P1('night', 'SURVEY Times Square at night from 46th St, 1.8 m, looking S at One Times Square',
    at(TSQ_46, 1.8), at(ONE_TSQ, 38)),
  sTsqNightAir: P1('night', 'SURVEY Times Square at night from 60 m over 47th, looking S down the bowtie',
    at(brg(TSQ_46, AV_N, 110), 60), at(brg(ONE_TSQ, AV_N, 40), 8)),
  sTsqDaySt: P1('day', 'SURVEY Times Square by day from 46th St, 1.8 m, looking S',
    at(TSQ_46, 1.8), at(ONE_TSQ, 38)),
  sTsqDusk: P1('dusk', 'SURVEY Times Square at dusk from 12 m over 45th, looking N to Duffy Square',
    at(brg(ONE_TSQ, AV_N, 120), 12), at(brg(ONE_TSQ, AV_N, 330), 6)),
  sBryantGold: P1('golden', 'SURVEY Bryant Park lawn from the 6th Ave end, 12 m, looking E to the library',
    at(BRYANT_W, 12), at(NYPL, 12)),
  sBryantLow: P1('day', 'SURVEY Bryant Park from the lawn edge at 1.7 m, looking E',
    at(brg(BRYANT_W, ST_E, 30), 1.7), at(NYPL, 8)),
  sBryantAir: P1('golden', 'SURVEY Bryant Park from 90 m SW, looking NE over the park to Bank of America Tower',
    at(brg(BRYANT_C, 225, 170), 90), at(BRYANT_C, 0)),
  sNyplFront: P1('day', 'SURVEY the library front on Fifth Ave at 41st, 2 m, looking at the entrance',
    at(brg(NYPL_5TH, AV_S, 40), 2.0), at(NYPL_5TH, 10)),
  sGct42: P1('golden', 'SURVEY 42nd St looking E at Grand Central and the Chrysler Building, 3 m',
    at(brg(GCT, ST_W, 150), 3.0), at(CHRYSLER, 90)),
  sFlatiron: P1('day', 'SURVEY the Flatiron from 25 m over Madison Square',
    at(brg(FLATIRON, 29, 150), 25), at(FLATIRON, 35)),
  sBryantTop: P1('day', 'SURVEY Bryant Park straight down from 230 m (layout: lawn, paths, trees, the library)',
    at(BRYANT_C, 230), at(brg(BRYANT_C, 29, 2), 0)),
  sTsqTop: P1('day', 'SURVEY Times Square straight down from 330 m (the bowtie: Broadway x Seventh Ave, 42nd-47th)',
    at(brg(ONE_TSQ, AV_N, 230), 330), at(brg(brg(ONE_TSQ, AV_N, 230), 29, 2), 0)),
  sEsb: P1('golden', 'SURVEY the Empire State from Fifth Ave at 33rd, 3 m, looking up',
    at(brg(ESB, AV_S, 120), 3.0), at(ESB, 180)),
  // TP28 checks: the Broadway plaza up the bowtie from 43rd at night, and the TKTS red steps from 30 m south of them
  sTsqPlaza: P1('night', 'SURVEY the Broadway plaza from 43rd at 1.8 m, looking N up the bowtie to Duffy Square',
    at([-73.986001, 40.756825], 1.8), at([-73.985687, 40.757692], 6)),
  sTkts: P1('night', 'SURVEY the TKTS red steps from 30 m S of them at 1.8 m',
    at([-73.985040, 40.758840], 1.8), at([-73.984913, 40.759092], 3.5)),
  sTkts2: P1('dusk', 'SURVEY the TKTS red steps from 14 m up, 45 m SSW, looking NNE',
    at([-73.98517, 40.75868], 14), at([-73.984913, 40.759092], 2.5)),
};

const OUT = {
  _meta: { generated: new Date().toISOString(), fps: 30, size: '2560x1440', flags: 'hud=0&lmwait=150&life=0&clean=1&f24lod=60,180&crowdlod=20,60&pedtarget=640&filmlod=1&accum=15' },   // 2026-09-23: walkers in the film, film LODs; 2026-09-26 filmlod: pre-streamed paths, held world, no tree LOD swap; accum: 6+ jittered samples a frame (AC26); 2026-09-28 AC30: 16 Gaussian samples (shimmer 0.52 -> 0.41 % of mLowAerial's pixels)
  shots: SHOTS, probes: PROBES,
};

// --merge-act <act>: write one act's entries into the existing shots.json and leave every other entry as it is there (entries
// other tracks added to the json alone, e.g. GROUND's gWindBorder, survive; --write would drop them)
if (process.argv.includes('--merge-act')) {
  const act = process.argv[process.argv.indexOf('--merge-act') + 1];
  const cur = JSON.parse(await fs.readFile(path.join(here, 'shots.json'), 'utf8'));
  let n = 0;
  for (const [k, v] of Object.entries(SHOTS)) if (v.act === act) { cur.shots[k] = v; n++; }
  await fs.writeFile(path.join(here, 'shots.json'), JSON.stringify(cur, null, 2));
  console.log(`merged ${n} '${act}' entries into tools/ad/shots.json`);
}
if (process.argv.includes('--write')) {
  await fs.writeFile(path.join(here, 'shots.json'), JSON.stringify(OUT, null, 2));
  console.log('wrote tools/ad/shots.json');
}
let total = 0, frames = 0;
for (const [k, v] of Object.entries(SHOTS)) {
  const n = (v.times || [v.time]).length;
  total += v.duration * n; frames += Math.round(v.duration * 30) * n;
  console.log(`${v.act.padEnd(8)} ${k.padEnd(13)} ${String(v.duration).padStart(4)}s x${n} ${String(Math.round(v.duration * 30) * n).padStart(4)}f ${(v.times || [v.time]).join('+').padEnd(10)} warm ${String(v.warm || 24).padStart(4)} ${(v.flags || '').padEnd(10)}` + (v.title || ''));
}
console.log(`\n${Object.keys(SHOTS).length} shots / ${total.toFixed(1)} s of new footage / ${frames} frames to capture`);
console.log(`${Object.keys(PROBES).length} extra probe framings`);
export { SHOTS, PROBES };
