// Storefront identity: generated shop names on lit sign boxes over the
// storefront fascia. Unlit material reads as a printed sign by day and a lit
// box at night. All procedural, no assets.
import * as THREE from 'three';
import { paintSign, TSQ_SHOPS, citySign } from './signArt.js';
import { loadAdFonts, hs as ahs } from './adArt.js';
import { outwardNormal, spillTick } from './billboards.js';
import { ENV } from '../world/materials.js';
import { project } from '../shared/geo.js';

// ?gfix=0 restores the pre-2026-09-10 standoff for A/B measurement
// (docs/notes/glitch-r7.md 3.3; tools/tflick.mjs --flags "...&gfix=0").
const GFIX = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfix') === '0');
// ?fac8=0 restores the round-7 single sign template (docs/notes/facades-r8.md §7)
const FAC8 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fac8') === '0');

// ?u10=0 restores the round-9 64-slot atlas and its hash slot pick
// (docs/notes/uniformity-r10.md). The 06:45 addendum to the round-10 brief
// filed the defect this flag brackets: "the storefront sign roster repeats
// within one frontage (ROYAL NAILS twice on 100 W 125th)".
const U10 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('u10') === '0');

// U10: 128 slots, not 64, and the whole atlas is painted ONCE at first use
// rather than a cell at a time. That is not just a bigger roster — the lazy
// scheme re-uploaded the ENTIRE canvas texture every time a new cell was
// painted (64 uploads of 8 MB over a session), so building all 128 cells up
// front and uploading once is cheaper than what it replaces even at 4x the
// pixels. It also makes the atlas a pure function of nothing at all: slot 37 is
// the same sign in every run, which is what lets the per-face assignment below
// be a deterministic bijection instead of a cache.
const AW = 2048, AH = U10 ? 2048 : 1024, CW = 512, CH = 64;
const COLS = AW / CW, ROWS = AH / CH;      // 4 x 32 = 128 slots (round 9: 4 x 16 = 64)
const NSLOT = COLS * ROWS;
let tex = null, mat = null, next = 0;
const slots = [];

// ---- the roster. Round 9 had 16 x 16 place x trade words and drew ONE form
// from them, so every sign in the city was "<PLACE> <TRADE>" and the 64 cells
// held 64 of the 256 possible strings. NYC storefronts are not built that way:
// a third of them are somebody's surname, a quarter are the trade alone, and
// the rest carry a modifier. Five forms over a much larger word list, and the
// atlas builder rejects a name it has already drawn.
const W1 = ['LUCKY', 'GOLDEN', 'CITY', 'EMPIRE', 'ROYAL', 'SUNRISE', 'CORNER', 'METRO',
  'LIBERTY', 'BROADWAY', 'HARLEM', 'HUDSON', 'PARK', 'STAR', 'FAMILY', 'NEW YORK',
  'LENOX', 'AMSTERDAM', 'MORNINGSIDE', 'RIVERSIDE', 'UPTOWN', 'ATLANTIC', 'UNION',
  'GRAND', 'CRESCENT', 'PROSPECT', 'HAMILTON', 'CONVENT', 'MANHATTAN', 'APOLLO',
  'SUGAR HILL', 'TRIANGLE', 'PARADISE', 'BLUE SKY'];
const W2 = ['DELI', 'MARKET', 'PIZZA', 'CLEANERS', 'HARDWARE', 'BAKERY', 'PHARMACY',
  'BARBER SHOP', 'NAILS', 'COFFEE', 'GROCERY', 'LIQUORS', 'FLOWERS', 'DINER', 'SHOES',
  'ELECTRONICS', 'LAUNDROMAT', 'BODEGA', 'OPTICAL', 'STATIONERY', 'HAIR SALON',
  'LOCKSMITH', 'TAILOR', 'FISH MARKET', 'SHOE REPAIR', 'RECORDS', 'FURNITURE',
  'CHICKEN & RIBS', 'JUICE BAR', 'SUPERMARKET', 'TRAVEL', 'CHECK CASHING'];
// surnames, for the third of NYC storefronts that are somebody's name
const SUR = ['SANTIAGO', 'ROSA', 'MENDEZ', 'GARCIA', 'OKONKWO', 'DIALLO', 'KIM',
  'PATEL', 'HERNANDEZ', 'JACKSON', 'WASHINGTON', 'CARMELO', 'TONY', 'SAL',
  'MIKE', 'LOU', 'AHMED', 'CHEN', 'ORTIZ', 'BROOKS'];
const MOD = ['EXPRESS', 'PLUS', 'DISCOUNT', '& SONS', 'SUPPLY', 'CENTER', '24 HR', 'NO. 1'];
const BG = ['#a51f1f', '#173f7a', '#1c5c2e', '#7a1660', '#8f5a12', '#20242a', '#5a1212', '#0f4f57'];
const FG = ['#f4e9c8', '#ffffff', '#ffd94a', '#d8ecff'];
// FAC8: the round-7 atlas was ONE template — solid ground, 3 px white keyline,
// one line of centred Arial Narrow — so a whole avenue of shop bands differed
// only in hue, which is the "signage rhythm" the reference has and we do not.
// Six templates, drawn into the same 512 x 64 cell, cover what 125th St
// actually shows: painted fascia, white panel with coloured type, an awning
// valance, a black-and-gold box, a split ground with a second line, and the
// old lit box. All canvas work, no assets, no extra draw call.
const FG_DARK = ['#1a1a1c', '#2a1608', '#12233d', '#3a2a06'];
const SUB = ['OPEN 7 DAYS', 'ATM INSIDE', 'WE DELIVER', 'COLD BEER', 'LOTTO', 'SINCE 1974', 'TEL 212-555-0142', 'FRESH DAILY'];

// deterministic scrambler, same family as the rest of the project
function hs(i, n) {
  const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
// U10: five name FORMS, and a name already drawn into the atlas is rejected, so
// the 128 cells carry 128 DISTINCT strings rather than 64 draws from a 256-name
// space with collisions.
const usedNames = new Set();
function nameFor(i) {
  // THE TRADE IS A ROUND ROBIN, NOT A HASH, and that is what makes the block-face
  // bijection actually work. Distinct SLOTS were never the goal — distinct SIGNS
  // were, and the first retail125 plate after the bijection landed read
  // "HAMILTON LOCKSMITH ... MORNINGSIDE LOCKSMITH ... FAMILY BAKERY ... LIBERTY
  // BAKERY" on one frontage: six different slots, four different names, two
  // repeated TRADES, which is the same defect the addendum filed.
  // With `trade = W2[i % 32]` a trade repeats only when two slot indices differ
  // by a multiple of 32, and the face bijection advances the slot by an ODD
  // stride — coprime with 32 — so consecutive shops on a frontage are guaranteed
  // different trades for 32 bays (about 250 m of frontage). Only the place word,
  // the surname and the form are hashed, and only those are re-rolled on a
  // duplicate, so the guarantee survives the de-duplication.
  const trade = W2[i % W2.length];
  for (let t = 0; t < 40; t++) {
    const h = (n) => hs(i * 7.13 + t * 101.7 + 3.1, n);
    const f = h(1);
    let s;
    if (f < 0.30) s = `${W1[(h(2) * W1.length) | 0]} ${trade}`;
    else if (f < 0.55) s = `${SUR[(h(4) * SUR.length) | 0]}'S ${trade}`;
    else if (f < 0.72) s = trade;
    else if (f < 0.88) s = `${trade} ${MOD[(h(8) * MOD.length) | 0]}`;
    else s = `${W1[(h(9) * W1.length) | 0]} ${trade}`;
    if (!usedNames.has(s)) { usedNames.add(s); return s; }
  }
  return `${W1[i % W1.length]} ${W2[(i * 7) % W2.length]} ${i}`;
}

// U10: `seed` IS the slot index (the caller owns the assignment — see
// buildShopSigns). Round 9 hashed it here into 64 buckets and cached whichever
// name landed in each bucket first, which is exactly how two bays of one
// frontage ended up both saying ROYAL NAILS.
function slotFor(seed) {
  const want = U10 ? (((seed % NSLOT) + NSLOT) % NSLOT)
    : Math.abs(((seed * 9301 + 49297) | 0) % 233280) % 64;
  if (!tex) {
    const cv0 = document.createElement('canvas');
    cv0.width = AW; cv0.height = AH;
    tex = new THREE.CanvasTexture(cv0);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // U10: paint EVERY cell now. Round 9 painted one cell per newly-seen slot
    // and set needsUpdate each time, i.e. it re-uploaded the WHOLE canvas up to
    // 64 times across a session. One build, one upload, and the atlas becomes a
    // pure function of the slot index — which is what lets the assignment below
    // be a deterministic bijection rather than a first-come cache.
    if (U10) { for (let j = 0; j < NSLOT; j++) paintSlot(j, (j * 2654435761) % 1000003); tex.needsUpdate = true; }
  }
  if (!slots[want]) { paintSlot(want, ((seed * 9301 + 49297) | 0) % 233280); tex.needsUpdate = true; }
  return slots[want];
}

function paintSlot(i, idx) {
  const cv = tex.image, ctx = cv.getContext('2d');
  const cx = (i % COLS) * CW, cy = ((i / COLS) | 0) * CH;
  const h = U10 ? hs(i, 17.7) : Math.abs(idx * 7919) % 1000 / 1000;
  const name = U10 ? nameFor(i) : `${W1[(h * 16) | 0]} ${W2[(Math.abs(idx * 31) % 16)]}`;
  const bg = BG[(h * 8) | 0];
  const tpl = FAC8 ? (Math.abs(idx * 131) % 6) : 5;
  const fit = (t0, maxW, px) => {
    ctx.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    let t = t0;
    while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -1);
    return t;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (tpl === 0) {                       // painted fascia: type straight on brick-dark ground
    ctx.fillStyle = '#241f1b'; ctx.fillRect(cx, cy, CW, CH);
    ctx.fillStyle = FG[(h * 39) % 4 | 0];
    ctx.fillText(fit(name, CW - 24, 40), cx + CW / 2, cy + CH / 2 + 2);
  } else if (tpl === 1) {                // white panel, coloured type, thin rule
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(cx, cy, CW, CH);
    ctx.fillStyle = bg; ctx.fillRect(cx, cy + CH - 7, CW, 7);
    ctx.fillStyle = bg;
    ctx.fillText(fit(name, CW - 30, 36), cx + CW / 2, cy + CH / 2 - 2);
  } else if (tpl === 2) {                // awning valance: scalloped stripe band
    ctx.fillStyle = bg; ctx.fillRect(cx, cy, CW, CH);
    ctx.fillStyle = 'rgba(240,236,226,0.85)';
    for (let k = 0; k < 8; k++) ctx.fillRect(cx + k * 64 + 32, cy, 32, CH);
    ctx.fillStyle = '#f4f0e6'; ctx.fillRect(cx, cy + 10, CW, CH - 26);
    ctx.fillStyle = FG_DARK[(h * 13) % 4 | 0];
    ctx.fillText(fit(name, CW - 40, 32), cx + CW / 2, cy + CH / 2);
  } else if (tpl === 3) {                // black box, gold type, gold keyline
    ctx.fillStyle = '#141416'; ctx.fillRect(cx, cy, CW, CH);
    ctx.strokeStyle = '#c8a34a'; ctx.lineWidth = 2;
    ctx.strokeRect(cx + 5, cy + 5, CW - 10, CH - 10);
    ctx.fillStyle = '#d8b25a';
    ctx.fillText(fit(name, CW - 40, 34), cx + CW / 2, cy + CH / 2 + 1);
  } else if (tpl === 4) {                // split ground + a second line of copy
    ctx.fillStyle = bg; ctx.fillRect(cx, cy, CW, CH);
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(cx, cy + CH * 0.62, CW, CH * 0.38);
    ctx.fillStyle = FG[(h * 39) % 4 | 0];
    ctx.fillText(fit(name, CW - 30, 34), cx + CW / 2, cy + CH * 0.30);
    ctx.font = '600 18px Arial, sans-serif';
    ctx.fillStyle = 'rgba(244,238,222,0.9)';
    ctx.fillText(SUB[Math.abs(idx * 17) % SUB.length], cx + CW / 2, cy + CH * 0.79);
  } else {                               // the round-7 lit box, kept in the mix
    ctx.fillStyle = bg; ctx.fillRect(cx, cy, CW, CH);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    ctx.strokeRect(cx + 3, cy + 3, CW - 6, CH - 6);
    ctx.fillStyle = FG[(h * 39) % 4 | 0];
    ctx.fillText(fit(name, CW - 30, 34), cx + CW / 2, cy + CH / 2 + 2);
  }
  // ---- U10 AGE. A block of shop signs put up in the same week is the
  // storefront version of the identical-pale-curb tell: real fascias on one
  // frontage span a sign hung last month and one that has been bleaching since
  // 1998. Two mechanisms, because they are different looks — UV bleach raises
  // the black point and kills the chroma, soot and rain darken from the top
  // rail down in streaks — and their strengths are independent per slot.
  if (U10) {
    const bleach = hs(i, 91.3), soot = hs(i, 57.9);
    if (bleach > 0.30) {
      ctx.globalAlpha = (bleach - 0.30) * 0.46;
      ctx.fillStyle = '#bab3a3';
      ctx.fillRect(cx, cy, CW, CH);
      ctx.globalAlpha = 1;
    }
    const g = ctx.createLinearGradient(0, cy, 0, cy + CH);
    g.addColorStop(0, `rgba(24,21,17,${(0.06 + soot * 0.30).toFixed(3)})`);
    g.addColorStop(0.5, 'rgba(24,21,17,0.015)');
    g.addColorStop(1, `rgba(24,21,17,${(0.03 + soot * 0.15).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(cx, cy, CW, CH);
    for (let d = 0; d < 5; d++) {                 // drip runs off the top rail
      const dx = hs(i, 130 + d) * (CW - 12);
      ctx.fillStyle = `rgba(22,19,15,${(0.03 + soot * 0.13).toFixed(3)})`;
      ctx.fillRect(cx + dx, cy, 2 + hs(i, 170 + d) * 8, CH * (0.35 + hs(i, 210 + d) * 0.65));
    }
  }
  const s = { u0: cx / AW, u1: (cx + CW) / AW, v0: 1 - (cy + CH) / AH, v1: 1 - cy / AH };
  slots[i] = s;
  next++;
  return s;
}

// recs: [{ring, frontIdx, baseY, storeH, colorVar}] storefront buildings.
export function buildShopSigns(recs) {
  if (!recs.length) return null;
  if (TA31) return buildShopSignsTA(recs);
  if (!mat) {
    slotFor(1);
    mat = new THREE.MeshBasicMaterial({
      map: tex, polygonOffset: true,
      // U10: per-sign fade/age rides on a vertex colour (see below). On a
      // MeshBasicMaterial this is one multiply against the map — no new draw
      // call, no new texture, and `?u10=0` simply emits no colour attribute, in
      // which case three treats vColor as 1.
      vertexColors: U10,
      // FACTOR 0, NOT -3 (docs/notes/glitch-r7.md 3.3). polygonOffsetFactor
      // scales with the fragment's DEPTH SLOPE, and a sign box on a wall seen
      // down the street is at grazing incidence, where one pixel spans metres of
      // wall: -3 there is a large and uncontrolled push toward the camera, so
      // which of the sign and the fascia wins depends on the view angle and
      // flips as the camera moves. That is the "z-fighting as the camera moved"
      // this file's own comment below records. With the box now standing 2 cm
      // PROUD of the fascia the offset is only insurance against depth
      // quantisation at long range, which is the units term alone.
      polygonOffsetFactor: GFIX ? 0 : -3, polygonOffsetUnits: -3,
    });
  }
  const pos = [], uv = [], col = [];
  for (const r of recs) {
    const i = r.frontIdx;
    if (i < 0 || i >= r.ring.length) continue;
    const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % r.ring.length];
    const ex = x2 - x1, ez = z2 - z1;
    const len = Math.hypot(ex, ez);
    if (len < 5) continue;
    const nx = ez / len, nz = -ex / len;
    // ---- U10 BLOCK-FACE IDENTITY. `?u10=0` keeps round 9's per-building hash,
    // which is why two bays of one frontage could collide.
    //
    // A block FACE is "one side of one street": every storefront on it shares
    // an outward normal and lies on the same line. Quantise the normal to one
    // of four compass directions and the line's perpendicular offset to 6 m, and
    // two buildings on the same side of 125th St hash to the same face — across
    // a tile boundary too, since nothing here is tile-relative.
    //
    // Within a face, the slot is a BIJECTION of the bay's position ALONG the
    // street, not a hash of it: `slot = (a * ord + b) mod 128` with `a` forced
    // odd is a full-cycle LCG over a power-of-two modulus, so distinct ordinals
    // are guaranteed distinct slots — a frontage cannot repeat a name, and nor
    // can its neighbour, up to 128 bays (256 m at the 2 m bin) along one face.
    // A hash could only make a collision unlikely; this makes it impossible.
    // 4 compass dirs. The wrap matters: atan2 returns (-PI, PI], so a face
    // pointing due west rounds to -2 on one building and +2 on the next, which
    // would split ONE street side into two face keys and lose the dedup across
    // the seam. Fold into 0..3.
    const qd = ((Math.round(Math.atan2(nz, nx) / (Math.PI / 2)) % 4) + 4) % 4;
    const off = Math.round((nx * x1 + nz * z1) / 6);                 // the street line
    const fseed = Math.abs(((qd * 73856093) ^ (off * 19349663)) | 0);
    const fa = 1 + 2 * (fseed % (NSLOT >> 1));                       // odd => coprime with 128
    const fb = (fseed >>> 5) % NSLOT;
    // one sign box per ~7m of frontage, centered per bay — each bay is its own shop,
    // so each gets its own name (three identical EMPIRE MARKET signs read as a bug)
    const nSigns = Math.max(1, Math.min(3, (len / 8) | 0));
    for (let k = 0; k < nSigns; k++) {
      const t = (k + 0.5) / nSigns;
      let s;
      if (U10) {
        const bx = x1 + ex * t, bz = z1 + ez * t;
        const ord = Math.round((bx * (ex / len) + bz * (ez / len)) / 2);   // 2 m bins along the face
        s = slotFor(fa * ord + fb);
      } else s = slotFor(((r.colorVar * 100000) | 0) + k * 7919);
      const w = Math.min(5.6, len / nSigns - 1.2);
      if (w < 2) continue;
      // 0.13, not 0.10: these boxes ride on the storefront FASCIA, and the
      // hero-facade fascia band (heroFacades.js, storefront kit) protrudes
      // 0.11 m — at 0.10 the sign sat 1 cm INSIDE it and only polygonOffset
      // kept it visible, z-fighting as the camera moved. 0.13 puts the sign
      // face 2 cm proud of the fascia it is bolted to.
      //
      // THE COMMENT ABOVE WAS WRITTEN AND THE NUMBER WAS NEVER CHANGED
      // (docs/notes/glitch-r7.md 3.3, found via docs/notes/facades-r6.md, which
      // quotes this comment as the reason it did not touch this file). The code
      // said 0.1 for both components, i.e. exactly the 1 cm-inside case the
      // comment describes, held in front only by a slope-scaled polygonOffset —
      // and the owner is reporting flicker in motion. `(ez, -ex)/len` IS the
      // outward normal under this project's ring winding (same expression as
      // assemble.js's AO skirt, which pushes its ribbon out, and nycDress's wall
      // frames), so the standoff only had to grow.
      const STANDOFF = GFIX ? 0.13 : 0.1;
      const cx = x1 + ex * t + nx * STANDOFF, cz = z1 + ez * t + nz * STANDOFF;
      const sh = Math.abs(((r.colorVar * 7919) | 0) + k * 131) % 100 / 100;
      const cy = r.baseY + Math.max(2.6, r.storeH * (FAC8 ? 0.80 + sh * 0.16 : 0.88));
      const hh = FAC8 ? 0.30 + sh * 0.22 : 0.42;
      const hx = (ex / len) * w / 2, hz = (ez / len) * w / 2;
      const A = [cx - hx, cy - hh, cz - hz], B = [cx + hx, cy - hh, cz + hz];
      const C = [cx + hx, cy + hh, cz + hz], D = [cx - hx, cy + hh, cz - hz];
      for (const p of [A, B, C, A, C, D]) pos.push(...p);
      uv.push(s.u0, s.v0, s.u1, s.v0, s.u1, s.v1, s.u0, s.v0, s.u1, s.v1, s.u0, s.v1);
      if (U10) {
        // ---- U10 per-SIGN fade, on top of the per-SLOT age painted into the
        // atlas. A slot is reused across the city, so without this the same
        // name would also always be the same condition; this is the cheap half
        // (6 floats per quad, no extra draw call) and it is keyed on the sign's
        // own world position, so two neighbours never match.
        const fh = hs(cx * 0.37 + cz * 0.71, 13.9);
        const fw = hs(cx * 0.91 + cz * 0.23, 41.3) - 0.5;
        const cr = (0.74 + fh * 0.34) * (1 + fw * 0.10);
        const cg = (0.74 + fh * 0.34) * (1 + fw * 0.02);
        const cb = (0.74 + fh * 0.34) * (1 - fw * 0.12);
        // the box's own top-lit / bottom-shaded gradient rides on the same
        // attribute: A and B are the bottom edge, C and D the top
        for (const kk of [0, 1, 2, 0, 2, 3]) {
          const g = (kk === 0 || kk === 1) ? 0.90 : 1.06;
          col.push(cr * g, cg * g, cb * g);
        }
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // the attribute is NOT optional once the material declares vertexColors: a
  // missing `color` attribute reads as (0,0,0) in WebGL and every sign in the
  // city goes black. Pad rather than trust the loop.
  if (U10) {
    while (col.length < pos.length) col.push(1, 1, 1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------------- TA31: designed shop signs
// Owner 2026-09-28: "I don't want to see big letters in shops". Four changes, all behind `?ta31=0`:
//  - THE ARTWORK is signArt.js: a mark, the name in the trade's own letterform at about half the panel height, a small
//    second line, and plain ground either side. 64 cells of 512 x 128 (4:1, a 0.8 m sign's lettering zone is 3.2 m):
//    30 Times Square shops (invented chains and generic tourist trades), 32 citywide (the round-10 trades, now each
//    with its own face and mark), two utility cells for the box's sides.
//  - THE SHAPE. The round-10 box stretched an 8:1 cell over the whole 2.7-9.3:1 box. The lettering zone now keeps its
//    own 4:1 and the rest of the box is the zone's edge column (plain ground), so a long sign is a longer panel, not
//    longer letters; a short one lowers its height to width / 3.2 rather than squeezing more than 20 %.
//  - THE FACE. The round-10 quad's front face was e x up = -(ez, -ex), i.e. the opposite of the normal it was pushed
//    out along, so where (ez, -ex) is outward the box was culled from the street and where it is inward the box sat
//    inside the wall. The TA31 box takes billboards.js outwardNormal() (tested against the ring) and winds its face
//    along it, and it now has a top, a bottom and two ends in dark metal.
//  - BLADES. A projecting double-faced blade at the end of a frontage: two in five storefronts within 330 m of Times
//    Square, one in eight elsewhere. The blade carries the same shop's cell turned to read top to bottom.
// The sign pool (assemble.js poolStatic) keeps position/normal/uv only, so the TA31 material reads nothing else; the
// round-10 per-sign vertex colour never reached that pool.
const TA31 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ta31') === '0');
// The flat boxes stay off unless `?ta31box=1`: the storefronts a camera sees up close are the @nyc dresser's, which
// carry their own board at 3.15-3.9 m, 0.10 m off the wall, and a box at baseY + storeH * 0.8-0.96, 0.13 m off the
// wall, lands on the same band and fights it; further out the shader fascia already is the sign. The blades have no
// counterpart in either and are kept.
const TA31BOX = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ta31box') === '1';
const SW = 2048, SH = 2048, SCW = 512, SCH = 128, SCOLS = 4;
const N_TSQ = 30, N_CITY = 32, SLOT_DARK = 62, SLOT_LIGHT = 63;
const TSQ_C = project(-73.9866, 40.7575), TSQ_R = 330;
let taTexS = null, taMatS = null;
const CITY_HEAD = (j) => {
  const f = ahs(j, 2.9);
  if (f < 0.36) return `${SUR[(ahs(j, 4.1) * SUR.length) | 0]}'S`;
  if (f < 0.7) return W1[(ahs(j, 6.7) * W1.length) | 0];
  return '';
};
export function citySpec(j) { return citySign(CITY_HEAD(j), W2[j % W2.length], j); }
function slotXY(i) { return [(i % SCOLS) * SCW, ((i / SCOLS) | 0) * SCH]; }
function slotUV(i) { const [x, y] = slotXY(i); return [x / SW, 1 - (y + SCH) / SH, (x + SCW) / SW, 1 - y / SH]; }
function paintSignAtlas() {
  const c = taTexS.image.getContext('2d');
  c.fillStyle = '#1b1c1f'; c.fillRect(0, 0, SW, SH);
  for (let i = 0; i < N_TSQ; i++) { const [x, y] = slotXY(i); paintSign(c, x, y, SCW, SCH, TSQ_SHOPS[i % TSQ_SHOPS.length]); }
  for (let j = 0; j < N_CITY; j++) {
    const [x, y] = slotXY(N_TSQ + j);
    paintSign(c, x, y, SCW, SCH, citySpec(j));
    // city signs age (U10's argument): some bleach, soot runs off the top rail; Times Square's are kept new
    const bleach = ahs(j, 91.3), soot = ahs(j, 57.9);
    if (bleach > 0.55) { c.globalAlpha = (bleach - 0.55) * 0.35; c.fillStyle = '#bab3a3'; c.fillRect(x, y, SCW, SCH); c.globalAlpha = 1; }
    const g = c.createLinearGradient(0, y, 0, y + SCH);
    g.addColorStop(0, `rgba(24,21,17,${(0.04 + soot * 0.18).toFixed(3)})`); g.addColorStop(0.5, 'rgba(24,21,17,0)'); g.addColorStop(1, `rgba(24,21,17,${(0.02 + soot * 0.08).toFixed(3)})`);
    c.fillStyle = g; c.fillRect(x, y, SCW, SCH);
  }
  { const [x, y] = slotXY(SLOT_DARK); const g = c.createLinearGradient(0, y, 0, y + SCH); g.addColorStop(0, '#2a2c30'); g.addColorStop(1, '#141518'); c.fillStyle = g; c.fillRect(x, y, SCW, SCH); }
  { const [x, y] = slotXY(SLOT_LIGHT); c.fillStyle = '#d8d6d0'; c.fillRect(x, y, SCW, SCH); }
  taTexS.needsUpdate = true;
}
// ---- the dresser's storefront signs (the @nyc generator's `signs` atlas: 4 x 8 cells of 512 x 128 on 2048 x 1024,
// mapped onto (bay + 0.1) x 0.75 m boards, about 7.3:1). Those are the signs a street-level camera sees on dressed
// buildings, Times Square included, and they carried the same big block letters. The atlas is repainted in place
// once its merged mesh (`nyc:merge:<tile>:signs`) is in the scene, each design drawn pre-squeezed to 4 / 7.3 across
// so the board's stretch gives it back its shape. Guarded on the mesh name and the canvas size: if either changes,
// this does nothing and the generator's own atlas stays.
let dressDone = false, dressNext = 0;
// the dresser's atlas is citywide, so it takes the chain-like shops that could stand on any avenue (no box office, no
// souvenir shop, nothing named Midtown) and fills the rest with the city trades
const DRESS_TSQ = [0, 1, 2, 3, 13, 14, 15, 16, 18, 22, 24, 25, 26, 27, 28, 29];
function repaintDresserSigns(scene) {
  if (dressDone || !scene) return;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now < dressNext) return;
  dressNext = now + 2000;
  let tex = null;
  scene.traverse((o) => { if (!tex && o.isMesh && /^nyc:merge:.*:signs$/.test(o.name || '') && o.material && o.material.map) tex = o.material.map; });
  if (!tex) return;
  dressDone = true;
  const cv = tex.image;
  if (!cv || cv.width !== 2048 || cv.height !== 1024 || typeof cv.getContext !== 'function') return;
  const paint = () => {
    const c = cv.getContext('2d');
    const k = 4 / 7.3, LW = SCW / k;
    for (let i = 0; i < 32; i++) {
      const x = (i % 4) * SCW, y = Math.floor(i / 4) * SCH;
      const spec = i < DRESS_TSQ.length ? TSQ_SHOPS[DRESS_TSQ[i]] : citySpec(i * 3 + 1);
      c.save(); c.beginPath(); c.rect(x, y, SCW, SCH); c.clip();
      c.translate(x, y); c.scale(k, 1);
      paintSign(c, 0, 0, LW, SCH, { ...spec, maxW: 0.62 });
      c.restore();
    }
    tex.needsUpdate = true;
    if (typeof window !== 'undefined') window.__TA31_DRESSSIGNS = true;
  };
  loadAdFonts().then(paint);
}
function ensureSignsTA() {
  if (taMatS) return;
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  taTexS = new THREE.CanvasTexture(cv);
  taTexS.colorSpace = THREE.SRGBColorSpace;
  taTexS.anisotropy = 8;
  paintSignAtlas();                                         // fallback faces first, so a sign is never blank
  loadAdFonts().then(() => paintSignAtlas());
  taMatS = new THREE.MeshBasicMaterial({ map: taTexS, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3 });
  taMatS.onBeforeCompile = (sh) => {
    sh.uniforms.sgNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sgNight;')
      .replace('#include <fog_fragment>', `
        gl_FragColor.rgb *= mix(0.92, 1.55, sgNight);   // an internally lit box after dark, a painted panel by day
        #include <fog_fragment>`);
  };
  taMatS.customProgramCacheKey = () => 'ta31sign';
  taMatS.onBeforeRender = (renderer, scene, camera) => {
    repaintDresserSigns(scene);
    const rt = renderer.getRenderTarget();
    if (!(rt && rt.isWebGLCubeRenderTarget)) spillTick(scene, camera);   // billboards.js SP31: its off switch away from the Square
  };
}
function buildShopSignsTA(recs) {
  ensureSignsTA();
  const pos = [], uv = [];
  const quad = (A, B, C, D, ua, ub, uc, ud) => { for (const p of [A, B, C, A, C, D]) pos.push(...p); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  const [du0, dv0, du1, dv1] = slotUV(SLOT_DARK), dk = [(du0 + du1) / 2, (dv0 + dv1) / 2];
  const COP30 = [1, 7, 11, 13, 17, 19, 23, 29];
  let nSigns = 0, nBlades = 0;
  for (const r of recs) {
    const i = r.frontIdx;
    if (i < 0 || i >= r.ring.length) continue;
    const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % r.ring.length];
    const ex = x2 - x1, ez = z2 - z1, len = Math.hypot(ex, ez);
    if (len < 5) continue;
    const [nx, nz] = outwardNormal(r.ring, i);
    const ux = nz, uz = -nx;                                // the viewer's right on the outward face
    const inTsq = Math.hypot((x1 + x2) / 2 - TSQ_C[0], (z1 + z2) / 2 - TSQ_C[1]) < TSQ_R;
    // block-face identity (U10) on the tested normal: four compass faces, a 6 m street line, a bijection along it
    const qd = ((Math.round(Math.atan2(nz, nx) / (Math.PI / 2)) % 4) + 4) % 4;
    const off = Math.round((nx * x1 + nz * z1) / 6);
    const fseed = Math.abs(((qd * 73856093) ^ (off * 19349663)) | 0);
    const fa = inTsq ? COP30[fseed % 8] : 1 + 2 * (fseed % 16), fb = (fseed >>> 5) % (inTsq ? N_TSQ : N_CITY);
    const nS = Math.max(1, Math.min(3, (len / 8) | 0));
    for (let k = 0; k < nS; k++) {
      const t = (k + 0.5) / nS;
      const bx = x1 + ex * t, bz = z1 + ez * t;
      const ord = Math.round((bx * ux + bz * uz) / 2);
      const slot = inTsq ? ((((fa * ord + fb) % N_TSQ) + N_TSQ) % N_TSQ) : N_TSQ + ((((fa * ord + fb) % N_CITY) + N_CITY) % N_CITY);
      const w = Math.min(5.6, len / nS - 1.2);
      if (w < 2) continue;
      const sh = Math.abs(((r.colorVar * 7919) | 0) + k * 131) % 100 / 100;
      const cy = r.baseY + Math.max(2.6, r.storeH * (0.80 + sh * 0.16));
      let H = 0.6 + sh * 0.44;
      if (w < H * 3.2) H = w / 3.2;
      const Wz = Math.min(w, H * 4), hh = H / 2, D = 0.12, S0 = 0.13;
      const cx = bx + nx * S0, cz = bz + nz * S0;
      const at = (a, y, o = 0) => [cx + ux * a + nx * o, y, cz + uz * a + nz * o];
      const [u0, v0, u1, v1] = slotUV(slot), eL = u0 + 3 / SW, eR = u1 - 3 / SW;
      const y0 = cy - hh, y1 = cy + hh;
      // lettering zone and the two ground extensions (the zone's own edge columns)
      if (TA31BOX) quad(at(-Wz / 2, y0), at(Wz / 2, y0), at(Wz / 2, y1), at(-Wz / 2, y1), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      if (TA31BOX && w > Wz + 0.02) {
        quad(at(-w / 2, y0), at(-Wz / 2, y0), at(-Wz / 2, y1), at(-w / 2, y1), [eL, v0], [eL, v0], [eL, v1], [eL, v1]);
        quad(at(Wz / 2, y0), at(w / 2, y0), at(w / 2, y1), at(Wz / 2, y1), [eR, v0], [eR, v0], [eR, v1], [eR, v1]);
      }
      // the box: top, bottom and ends back to the fascia, in the dark utility cell
      if (TA31BOX) {
      quad(at(-w / 2, y1), at(w / 2, y1), at(w / 2, y1, -D), at(-w / 2, y1, -D), dk, dk, dk, dk);
      quad(at(-w / 2, y0, -D), at(w / 2, y0, -D), at(w / 2, y0), at(-w / 2, y0), dk, dk, dk, dk);
      quad(at(w / 2, y0), at(w / 2, y0, -D), at(w / 2, y1, -D), at(w / 2, y1), dk, dk, dk, dk);
      quad(at(-w / 2, y0, -D), at(-w / 2, y0), at(-w / 2, y1), at(-w / 2, y1, -D), dk, dk, dk, dk);
      nSigns++;
      }
      // a projecting blade at the frontage's first sign, above the box, reading top to bottom
      if (k === 0 && ahs(r.colorVar * 13.1, 4.4) < (inTsq ? 0.4 : 0.125) && r.height > cy - r.baseY + 3.5) {
        const bw = 0.62, bh = bw * 4, a0 = -w / 2 - 0.35, by0 = y1 + 0.35, by1 = by0 + bh, o0 = 0.1 - S0, o1 = o0 + bw;
        const E = (s, y, o) => [cx + ux * (a0 + s) + nx * o, y, cz + uz * (a0 + s) + nz * o];
        // the face looking along +u has the wall on its left: u runs top to bottom, v away from the wall
        quad(E(0.015, by0, o0), E(0.015, by0, o1), E(0.015, by1, o1), E(0.015, by1, o0), [u1, v0], [u1, v1], [u0, v1], [u0, v0]);
        // the face looking along -u has the far edge on its left
        quad(E(-0.015, by0, o1), E(-0.015, by0, o0), E(-0.015, by1, o0), E(-0.015, by1, o1), [u1, v0], [u1, v1], [u0, v1], [u0, v0]);
        // the bracket: a dark bar from the wall over the blade's top
        quad(E(-0.03, by1 + 0.06, o1 + 0.08), E(0.03, by1 + 0.06, o1 + 0.08), E(0.03, by1 + 0.06, o0), E(-0.03, by1 + 0.06, o0), dk, dk, dk, dk);
        quad(E(-0.03, by1, o0), E(-0.03, by1, o1 + 0.08), E(-0.03, by1 + 0.06, o1 + 0.08), E(-0.03, by1 + 0.06, o0), dk, dk, dk, dk);
        quad(E(0.03, by1, o1 + 0.08), E(0.03, by1, o0), E(0.03, by1 + 0.06, o0), E(0.03, by1 + 0.06, o1 + 0.08), dk, dk, dk, dk);
        nBlades++;
      }
    }
  }
  // one zero-area quad per tile, so the sign pool is never empty and its material's pre-render hook (which repaints the
  // dresser's atlas once that exists) runs in any district, blades or not
  { const r0 = recs[0], [qx, qz] = r0.ring[0], p0 = [qx, r0.baseY + 3, qz]; quad(p0, p0, p0, p0, dk, dk, dk, dk); }
  if (!pos.length) return null;
  if (typeof window !== 'undefined') { window.__TA31_SIGNS = window.__TA31_SIGNS || { signs: 0, blades: 0 }; window.__TA31_SIGNS.signs += nSigns; window.__TA31_SIGNS.blades += nBlades; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, taMatS);
  mesh.renderOrder = 1;
  return mesh;
}
