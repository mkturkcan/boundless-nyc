// Storefront FASCIA artwork for the facade shader — the "flat coloured
// storefront stripes with no text" of critic round 5 defect #19 / §7.8.
//
// `materials.js`'s storefront branch painted the sign band above every shop
// window as one flat random colour (`signCol`), so ~930 000 buildings' ground
// floors carried a coloured stripe where New York carries a sign. This is the
// content for that stripe: ONE 1024² canvas holding 32 fascia designs in a
// 2 x 16 grid of 512 x 64 cells, bound into the facade material as `t_sgn` and
// indexed per SHOP (one shop per ~7 m of frontage) from the building's own
// colorVar hash. It costs one texture and zero draw calls — the facade is
// already one merged mesh per tile.
//
// Division of labour (see the same note in panelArt.js): street furniture
// panels are panelArt.js, street-name blades are signText.js, Times Square
// boards are billboards.js, this is the shader facade's fascia.
//
// NO REAL BRANDS OR LOGOS. Every name is assembled from generic place words
// and trade words — which is what a real NYC fascia actually says ("LUCKY
// DELI", "AMSTERDAM HARDWARE"): descriptive, not proprietary.
//
// Readability: the cell is 512 x 64 for a fascia that is ~7 m x ~0.8 m, i.e.
// ~73 px/m. At 40 m and 1760 px wide (17.6 px/deg) a 7 m fascia subtends ~10°
// = 176 px, so the cell is over-sampled at the distance it is read at and the
// letterforms survive the mip chain. The shader fades the sign to its own mean
// once the footprint exceeds ~0.3 wall-metres per pixel (the project's stipple
// rule), so nothing here can alias.
import * as THREE from 'three';

// ?roof9=0 restores the pre-round-9 behaviour, i.e. mirrored sign text
// (docs/notes/roofs-r9.md §6). See MIRROR below.
const ROOF9 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('roof9') === '0');
// ?u10=0 restores the 32-slot atlas (docs/notes/uniformity-r10.md). The 06:45
// addendum to the round-10 brief filed the defect: "the storefront sign roster
// repeats within one frontage". With 32 slots and a HASH slot pick, two shops
// on one 20 m frontage collided about 1 time in 16. The atlas doubles and the
// shader's pick becomes a bijection over the shop index (materials.js storefront
// fascia block) — together those make a repeat on one frontage impossible.
const U10 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('u10') === '0');
const AW = U10 ? 2048 : 1024, AH = 1024;
const COLS = U10 ? 4 : 2, ROWS = 16;      // 64 slots of 512 x 64 (8:1, the fascia's own aspect)
const CW = AW / COLS, CH = AH / ROWS;     // 512 x 64
export const FASCIA_COLS = COLS, FASCIA_ROWS = ROWS, FASCIA_N = COLS * ROWS;

// place words, trade words, and the small second line
const P1 = ['LUCKY', 'GOLDEN', 'CITY', 'EMPIRE', 'ROYAL', 'SUNRISE', 'CORNER',
  'METRO', 'LIBERTY', 'AMSTERDAM', 'LENOX', 'HUDSON', 'PARK', 'STAR',
  'FAMILY', 'UNION', 'GRAND', 'RIVERSIDE', 'MORNINGSIDE', 'ATLANTIC',
  'CRESCENT', 'BROOK', 'PROSPECT', 'HAMILTON'];
// U10: padded from 24 to 32 trades ON PURPOSE. The slot pick in the shader is a
// bijection with an ODD stride over a 64-slot atlas; a trade assigned by
// `i % P2.length` then repeats on one frontage only when two slot indices differ
// by a multiple of P2.length, and an odd stride is coprime with 32 but NOT
// necessarily with 24 (fa = 3 and a gap of 8 shops would have collided). 32
// makes the guarantee unconditional.
const P2 = ['DELI', 'MARKET', 'PIZZA', 'CLEANERS', 'HARDWARE', 'BAKERY',
  'PHARMACY', 'BARBER SHOP', 'NAILS', 'COFFEE', 'GROCERY', 'WINE & LIQUOR',
  'FLOWERS', 'DINER', 'SHOE REPAIR', 'ELECTRONICS', 'LAUNDROMAT',
  'FISH MARKET', 'BODEGA', 'OPTICAL', 'STATIONERY', 'HAIR SALON',
  'LOCKSMITH', 'TAILOR', 'RECORDS', 'FURNITURE', 'JUICE BAR', 'TRAVEL',
  'CHECK CASHING', 'SUPERMARKET', 'CHICKEN & RIBS', 'COPY & PRINT'];
const SUB = ['OPEN 24 HOURS', 'EST. 1974', 'ATM INSIDE', 'COLD DRINKS',
  'HOT & COLD FOOD', 'FREE DELIVERY', 'WE BUY GOLD', 'SAME DAY SERVICE',
  'LOTTO', 'BREAKFAST ALL DAY', 'KEYS MADE', 'BEER & SODA'];
// awning / light-box grounds and their inks, in the values NYC fascias use:
// saturated and DARK, so white letterforms carry the contrast
const GROUND = [
  ['#8f1a1a', '#f6ecd2'], ['#12305e', '#ffffff'], ['#175733', '#eafff2'],
  ['#1a1a1e', '#ffd94a'], ['#6b1050', '#ffffff'], ['#8a5410', '#1a1410'],
  ['#0d4a56', '#ffffff'], ['#5a0f0f', '#f0dca8'], ['#233a1c', '#f4f0dc'],
  ['#2b2f36', '#7fd8ff'], ['#a8300f', '#fff2d8'], ['#0f3a2a', '#ffe9a8'],
];
const LIGHTBOX = [                        // internally-lit plastic: white ground
  ['#f2efe6', '#a01818'], ['#f4f2ea', '#123a70'], ['#f0eee4', '#1a5c2c'],
  ['#eeece2', '#1c1c20'],
];

let tex = null;
const drawn = new Set();          // U10: names already in the atlas

function drawSlot(c, i, ox, oy) {
  // deterministic per-slot choices: a hash, not Math.random, so the atlas is
  // byte-identical between runs and a shop keeps its sign across a reload
  const h = (n) => {
    const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const lit = h(1) < 0.28;
  const [bg, fg] = lit ? LIGHTBOX[(h(2) * LIGHTBOX.length) | 0] : GROUND[(h(2) * GROUND.length) | 0];
  // U10: 64 slots drawn from 24 x 24 place x trade words WILL collide by the
  // birthday rule (about a 1-in-4 chance of at least one duplicate pair over the
  // atlas), and a duplicate here is a duplicate NAME on the street. Reject a
  // string already drawn — a few retries with a salted hash, deterministic
  // because the slots are always built in index order.
  let name = `${P1[(h(3) * P1.length) | 0]} ${P2[(h(4) * P2.length) | 0]}`;
  if (U10) {
    // the TRADE is a round robin over the slot index, only the place word is
    // hashed and re-rolled — see the P2 note above and shopSigns.js nameFor().
    const trade = P2[i % P2.length];
    name = `${P1[(h(3) * P1.length) | 0]} ${trade}`;
    for (let t = 1; t < 24 && drawn.has(name); t++) {
      const hv = (n) => { const v = Math.sin(i * 12.9898 + n * 78.233 + t * 41.3) * 43758.5453; return v - Math.floor(v); };
      name = `${P1[(hv(3) * P1.length) | 0]} ${trade}`;
    }
    drawn.add(name);
  }
  const hasSub = h(5) < 0.45;
  const W = CW - 4, H = CH - 4, x0 = ox + 2, y0 = oy + 2;

  // ---- MIRROR (round 9). EVERY SIGN THIS ATLAS DRAWS RENDERED BACKWARDS, ON
  // EVERY STOREFRONT IN THE CITY, AND IT HAD NEVER BEEN SEEN.
  //
  // The facade shader samples this atlas with x increasing in `u`, and u is
  // WALL-LOCAL, increasing along the ring direction (assemble.js extrudePrism:
  // u = 0 at ring[i], u = len at ring[i+1]). For a shoelace-positive ring — the
  // winding the whole project assumes, with outward = (ez, -ex) — the direction
  // of increasing u is to the VIEWER'S LEFT when the wall is seen from outside:
  //   forward = -n = (-ez, ex)/len
  //   screen right = forward x up = (-f.z, f.x) = (-ex, -ez)/len = -e/len
  // so +u is screen-LEFT, and the glyphs come out reversed.
  //
  // Why nobody saw it: the fascia is covered wherever another system puts a
  // sign on the same band, and the two systems that do — the DRESSER's sign
  // atlas (../src/textures.js: BOOKS, BOTANICA, LOCKSMITH) and shopSigns.js's
  // applied boxes — get their orientation from their own quads and read
  // correctly. Between them they cover every building within DRESS_R = 150 m
  // that has a scored front edge, which is every storefront in every previous
  // round's plates. STYLE.RETAIL_MODERN is the first building to show the raw
  // fascia in a hero position: the dresser skips it (no RECIPE for style 13 —
  // by design, §0.3) and this one's compiler-scored frontIdx points at its BACK
  // edge, so shopSigns put its boxes on the wrong side of the block. Both
  // round-9 plates of it, harlem125 and retail125, read
  // "SLIAN LAYOR / ROLIAT NOTLIMAH / ILED KOORB".
  //
  // Fixed HERE rather than in the shader (`su = 1.0 - su`) because materials.js
  // is shared by every facade family, and mirroring the artwork at
  // bake time is exactly equivalent: mirror each cell about its own centre, so
  // the shader's left-running sample reads it forwards. Costs nothing at
  // runtime — this canvas is drawn once.
  c.save();
  if (ROOF9) { c.translate(ox * 2 + CW, 0); c.scale(-1, 1); }
  c.fillStyle = bg;
  c.fillRect(x0, y0, W, H);
  // the sign box's own frame: a bright top rail and a dark bottom shadow — this
  // is what makes a fascia read as a BOX bolted to a wall rather than as paint,
  // and it also hides the one blurry texel column the atlas seam costs
  c.fillStyle = 'rgba(255,255,255,0.30)'; c.fillRect(x0, y0, W, 3);
  c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(x0, y0 + H - 4, W, 4);
  c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(x0, y0, 3, H);
  c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x0 + W - 3, y0, 3, H);
  if (!lit) {  // awning-cloth vertical scallop shading
    for (let k = 0; k < 14; k++) {
      c.fillStyle = k % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
      c.fillRect(x0 + 3 + k * ((W - 6) / 14), y0 + 3, (W - 6) / 14, H - 7);
    }
  }

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const nameY = hasSub ? y0 + H * 0.40 : y0 + H * 0.52;
  let size = hasSub ? Math.round(H * 0.42) : Math.round(H * 0.54);
  const fam = h(6) < 0.22 ? 'Georgia, "Times New Roman", serif'
    : '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const wMax = W * 0.90;
  c.font = `700 ${size}px ${fam}`;
  while (c.measureText(name).width > wMax && size > 8) {
    size -= 1;
    c.font = `700 ${size}px ${fam}`;
  }
  // a soft drop shadow so the letters hold their edge against the ground once
  // the mip chain has softened them
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillText(name, x0 + W / 2 + 1.5, nameY + 1.5);
  c.fillStyle = fg;
  c.fillText(name, x0 + W / 2, nameY);
  if (hasSub) {
    const sub = SUB[(h(7) * SUB.length) | 0];
    let ss = Math.round(H * 0.21);
    c.font = `600 ${ss}px "Arial Narrow", Arial, sans-serif`;
    while (c.measureText(sub).width > W * 0.80 && ss > 6) {
      ss -= 1;
      c.font = `600 ${ss}px "Arial Narrow", Arial, sans-serif`;
    }
    c.fillStyle = lit ? 'rgba(30,30,34,0.85)' : 'rgba(255,255,255,0.80)';
    c.fillText(sub, x0 + W / 2, y0 + H * 0.74);
    // the rule between the two lines
    c.fillStyle = lit ? 'rgba(30,30,34,0.35)' : 'rgba(255,255,255,0.35)';
    c.fillRect(x0 + W * 0.20, y0 + H * 0.60, W * 0.60, 1.5);
  }
  // ---- U10 AGE, same argument as shopSigns.js: a block of fascias hung in the
  // same week is the identical-pale-curb tell one storey down. UV bleach (raises
  // the black point, kills chroma) and soot/rain off the top rail are different
  // looks with independent strengths per slot, so one frontage can carry a sign
  // from last month next to one that has been out since 1998.
  if (U10) {
    const bleach = h(21), soot = h(22);
    if (bleach > 0.28) {
      c.globalAlpha = (bleach - 0.28) * 0.44;
      c.fillStyle = '#b9b2a3';
      c.fillRect(x0, y0, W, H);
      c.globalAlpha = 1;
    }
    const g = c.createLinearGradient(0, y0, 0, y0 + H);
    g.addColorStop(0, `rgba(22,19,16,${(0.06 + soot * 0.30).toFixed(3)})`);
    g.addColorStop(0.5, 'rgba(22,19,16,0.015)');
    g.addColorStop(1, `rgba(22,19,16,${(0.03 + soot * 0.16).toFixed(3)})`);
    c.fillStyle = g; c.fillRect(x0, y0, W, H);
    for (let d = 0; d < 5; d++) {
      c.fillStyle = `rgba(20,17,14,${(0.03 + soot * 0.13).toFixed(3)})`;
      c.fillRect(x0 + h(30 + d) * (W - 10), y0, 2 + h(40 + d) * 8, H * (0.3 + h(50 + d) * 0.7));
    }
  }
  c.restore();
}

function build() {
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d');
  c.fillStyle = '#8a8a8a';
  c.fillRect(0, 0, AW, AH);
  for (let r = 0; r < ROWS; r++)
    for (let k = 0; k < COLS; k++) drawSlot(c, r * COLS + k, k * CW, r * CH);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function fasciaTexture() {
  if (!tex && typeof document !== 'undefined') tex = build();
  return tex;
}
