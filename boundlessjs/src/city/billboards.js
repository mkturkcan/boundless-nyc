// Times Square billboard district — large lit ad panels on the tall frontages
// around the Square, drawn on one shared canvas atlas that repaints every few
// seconds so the boards animate. One draw call for the whole district.
//
// Critic round 5 defect #19 / §3 #8: "EVERY TIMES SQUARE BILLBOARD IS A BLANK
// GREY RECTANGLE — about eight flat pale panels with a small dark post under
// each, on the one facade in New York that is nothing but screens." The old
// atlas was four 512² cells carrying a two-stop gradient, five translucent
// stripes and ONE word, on a MeshBasicMaterial with no night response — so at
// day exposure a board sat at the same value as the limestone behind it and
// read as a blank panel, and only four designs existed for the whole district.
//
// Now: SIXTEEN 512² designs on a 2048² sheet, five poster archetypes with real
// typographic hierarchy (wordmark / kicker / rule / footer), a screen archetype
// with scanlines and a ticker, a per-repaint reshuffle so no two boards match
// for long, and a shader that lifts the panel above the scene's exposure by day
// and makes it a light source at night (bloom threshold is 1.35 linear, so the
// brightest boards flare).
//
// NO REAL BRANDS OR LOGOS. Every wordmark below is an invented name and every
// line of copy is generic. Division of labour: street furniture panels are
// `panelArt.js`, storefront fascias are `fasciaAtlas.js` + the facade shader,
// street-name blades are `signText.js`, this file is the Square's big boards.
import * as THREE from 'three';
import { project } from '../shared/geo.js';
import { ENV } from '../world/materials.js';

const TSQ = project(-73.9866, 40.7575); // Times Square
const AW = 2048, AH = 2048, GRID = 4, CELL = AW / GRID; // 16 cells of 512
let tex = null, mat = null, animOn = false;

// Invented wordmarks, each with a category that picks its archetype and copy.
// Nothing here is a real company, product, show or slogan.
const BRANDS = [
  ['VERIDIAN', 'drink', '#0f6b3a', '#f2ffe8'],
  ['HALCYON', 'show', '#1a1030', '#ffd94a'],
  ['KESTREL', 'air', '#0e2f6e', '#ffffff'],
  ['OBSIDIA', 'tech', '#101014', '#4ad9ff'],
  ['MERIDIA', 'watch', '#2b2118', '#e8d8b0'],
  ['CINDERPEAK', 'shoe', '#b0210f', '#fff2d8'],
  ['AURELIA', 'scent', '#f0e6d8', '#2a2118'],
  ['NIMBUS', 'transit', '#0f5a72', '#eaffff'],
  ['SABLEWOOD', 'show', '#3a0f1e', '#f6d8a8'],
  ['LUMENCO', 'tech', '#141a30', '#8ab4ff'],
  ['TOPAZ LINE', 'air', '#7a0fa8', '#ffffff'],
  ['ELDERGLASS', 'drink', '#8a3a0f', '#ffe9c0'],
  ['QUARRY & CO', 'shoe', '#1c2a1c', '#dcf0c0'],
  ['PALEBLUE', 'scent', '#dfe8f0', '#1e2a3a'],
  ['VANTA', 'watch', '#18181c', '#c8ccd4'],
  ['STILLWATER', 'show', '#0b2438', '#9fe8ff'],
];
const COPY = {
  drink: ['COLD. ALWAYS.', 'NEW SMALL BATCH', 'TASTE THE SEASON'],
  show: ['NOW PLAYING', 'OPENS THIS FALL', 'FINAL WEEKS'],
  air: ['NONSTOP DAILY', 'MORE ROOM. MORE SKY.', 'FLY THE QUIET WAY'],
  tech: ['SEE FURTHER', 'BUILT FOR THE DARK', 'ONE DEVICE. ALL DAY.'],
  watch: ['MADE TO LAST', 'SINCE THE FIRST TIDE', 'TIME, KEPT'],
  shoe: ['RUN THE GRID', 'MILE AFTER MILE', 'MADE FOR PAVEMENT'],
  scent: ['A QUIETER MORNING', 'EAU DE PARFUM', 'WEAR THE WEATHER'],
  transit: ['EVERY 4 MINUTES', 'ACROSS THE RIVER', 'GO WITHOUT DRIVING'],
};
const FOOT = ['42ND & BROADWAY', 'TONIGHT', 'ON NOW', 'THIS WEEK ONLY',
  'SEE MORE IN STORE', 'STREAMING NOW', 'DOWNTOWN 8PM'];

function rnd(a) { return a[(Math.random() * a.length) | 0]; }

function drawCell(c, ox, oy) {
  const [name, cat, bg, fg] = rnd(BRANDS);
  const kind = (Math.random() * 6) | 0;
  const S = CELL;
  c.save();
  c.beginPath(); c.rect(ox, oy, S, S); c.clip();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const fit = (t, size, weight, fam, wMax) => {
    let s = size;
    c.font = `${weight} ${s}px ${fam}`;
    while (c.measureText(t).width > wMax && s > 8) { s -= 2; c.font = `${weight} ${s}px ${fam}`; }
    return s;
  };
  const SANS = '"Helvetica Neue", Arial, sans-serif';
  const copy = rnd(COPY[cat]), foot = rnd(FOOT), showLine = rnd(COPY.show);
  const SERIF = 'Georgia, "Times New Roman", serif';

  if (kind === 5) {
    // ---- LED SCREEN: scanlines, a huge numeral, a ticker strip. The one
    // archetype that has to look emitted rather than printed.
    c.fillStyle = '#05070c'; c.fillRect(ox, oy, S, S);
    for (let y = 0; y < S; y += 3) {
      c.fillStyle = `rgba(${20 + ((y * 7) % 40)},${40 + ((y * 11) % 60)},${90 + ((y * 13) % 90)},0.5)`;
      c.fillRect(ox, oy + y, S, 2);
    }
    const g = c.createRadialGradient(ox + S * 0.5, oy + S * 0.42, 10, ox + S * 0.5, oy + S * 0.42, S * 0.6);
    g.addColorStop(0, 'rgba(120,220,255,0.55)');
    g.addColorStop(1, 'rgba(6,10,20,0.0)');
    c.fillStyle = g; c.fillRect(ox, oy, S, S);
    const big = `${1 + ((Math.random() * 9) | 0)}${(Math.random() * 10) | 0}`;
    fit(big, S * 0.46, 900, SANS, S * 0.7);
    c.fillStyle = '#ffffff'; c.fillText(big, ox + S * 0.5, oy + S * 0.40);
    fit(name, S * 0.10, 700, SANS, S * 0.8);
    c.fillStyle = '#8fe4ff'; c.fillText(name, ox + S * 0.5, oy + S * 0.62);
    c.fillStyle = '#c01818'; c.fillRect(ox, oy + S * 0.80, S, S * 0.11);
    fit(foot, S * 0.072, 700, SANS, S * 0.92);
    c.fillStyle = '#ffffff'; c.fillText(foot, ox + S * 0.5, oy + S * 0.855);
    c.restore();
    return;
  }

  // ---- POSTER archetypes: a colour field, a wordmark, one line of copy, a
  // footer band. Hierarchy is what makes a board legible at 40 m; the old
  // version had one type size and nothing else.
  const grad = c.createLinearGradient(ox, oy, ox + S * 0.4, oy + S);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, kind === 2 ? '#0a0a10' : bg);
  c.fillStyle = grad; c.fillRect(ox, oy, S, S);

  if (kind === 0) {                 // full-bleed wordmark, rule, kicker
    fit(name, S * 0.24, 900, SANS, S * 0.86);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.44);
    c.fillStyle = fg; c.globalAlpha = 0.8;
    c.fillRect(ox + S * 0.18, oy + S * 0.575, S * 0.64, 6);
    c.globalAlpha = 1;
    fit(copy, S * 0.085, 400, SANS, S * 0.84);
    c.fillStyle = fg; c.fillText(copy, ox + S * 0.5, oy + S * 0.66);
  } else if (kind === 1) {          // split panel: image block + corner mark
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(ox + S * 0.06, oy + S * 0.06, S * 0.88, S * 0.52);
    // an abstract product form, not a logo: three overlapping bars
    for (let i = 0; i < 3; i++) {
      c.fillStyle = `rgba(255,255,255,${0.10 + i * 0.10})`;
      c.fillRect(ox + S * (0.16 + i * 0.10), oy + S * (0.14 + i * 0.05), S * 0.22, S * 0.38);
    }
    fit(name, S * 0.15, 900, SANS, S * 0.86);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.70);
    fit(copy, S * 0.075, 400, SANS, S * 0.8);
    c.fillStyle = fg; c.globalAlpha = 0.85;
    c.fillText(copy, ox + S * 0.5, oy + S * 0.80);
    c.globalAlpha = 1;
  } else if (kind === 2) {          // theatre poster: display serif + star rule
    fit(name, S * 0.20, 400, SERIF, S * 0.84);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.38);
    c.fillStyle = fg; c.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) c.fillText('★', ox + S * (0.30 + i * 0.10), oy + S * 0.52);
    c.globalAlpha = 1;
    fit(showLine, S * 0.11, 700, SANS, S * 0.8);
    c.fillStyle = fg; c.fillText(showLine, ox + S * 0.5, oy + S * 0.66);
  } else if (kind === 3) {          // stacked type block, left rule
    c.fillStyle = fg; c.fillRect(ox + S * 0.10, oy + S * 0.20, 8, S * 0.55);
    c.textAlign = 'left';
    fit(name, S * 0.17, 900, SANS, S * 0.72);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.18, oy + S * 0.34);
    const cp = copy.split(' ');
    fit(cp[0] || '', S * 0.10, 400, SANS, S * 0.72);
    c.fillStyle = fg; c.globalAlpha = 0.9;
    c.fillText(cp.slice(0, 2).join(' '), ox + S * 0.18, oy + S * 0.50);
    c.fillText(cp.slice(2).join(' '), ox + S * 0.18, oy + S * 0.60);
    c.globalAlpha = 1;
  } else {                          // centred mark in a keyline box
    c.strokeStyle = fg; c.globalAlpha = 0.7; c.lineWidth = 7;
    c.strokeRect(ox + S * 0.09, oy + S * 0.09, S * 0.82, S * 0.60);
    c.globalAlpha = 1;
    fit(name, S * 0.18, 700, SANS, S * 0.66);
    c.fillStyle = fg; c.fillText(name, ox + S * 0.5, oy + S * 0.39);
    fit(copy, S * 0.075, 400, SANS, S * 0.62);
    c.fillStyle = fg; c.globalAlpha = 0.85;
    c.fillText(copy, ox + S * 0.5, oy + S * 0.55);
    c.globalAlpha = 1;
  }
  // footer band on every poster: the thing that fills the bottom of a real
  // Times Square board and gives the panel a horizon
  c.fillStyle = 'rgba(0,0,0,0.42)';
  c.fillRect(ox, oy + S * 0.84, S, S * 0.16);
  c.textAlign = 'center';
  fit(foot, S * 0.068, 700, SANS, S * 0.9);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillText(foot, ox + S * 0.5, oy + S * 0.915);
  c.restore();
}

function paint() {
  const cv = tex.image, c = cv.getContext('2d');
  for (let i = 0; i < GRID * GRID; i++) drawCell(c, (i % GRID) * CELL, ((i / GRID) | 0) * CELL);
  tex.needsUpdate = true;
}

function ensure() {
  if (mat) return;
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = AH;
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  mat = new THREE.MeshBasicMaterial({
    map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  // A board is an EMITTER, not a painted wall. Unlit at scene exposure it
  // matched the limestone behind it; lifted 1.5x by day and 3.4x at night it
  // reads as a screen, and its brightest cells cross the 1.35 linear bloom
  // threshold so the district glows the way the Square does.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', `
        gl_FragColor.rgb *= mix(1.5, 3.4, bbNight);
        #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'tsqboard';
  paint();
  if (!animOn) { animOn = true; setInterval(paint, 4200); }
}

// The district atlas, for builders that clad a whole landmark in screens rather
// than posting boards on a compiled footprint (landmarks.js oneTimesSquare).
// Same material, so the landmark's panels merge into the same draw call the
// district already pays for, and they repaint on the same 4.2 s timer.
export const BOARD_SLOTS = GRID * GRID;
export function boardMaterial() { ensure(); return mat; }
export function boardUVRect(slot) {
  const i = ((slot % BOARD_SLOTS) + BOARD_SLOTS) % BOARD_SLOTS;
  const u0 = (i % GRID) / GRID, v1 = 1 - ((i / GRID) | 0) / GRID;
  return [u0, v1 - 1 / GRID, u0 + 1 / GRID, v1];
}

// recs: [{ring, frontIdx, baseY, height, colorVar}] near-TSQ tall buildings.
export function buildBillboards(recs) {
  const near = recs.filter((r) => {
    const [cx, cz] = r.ring[0];
    return (cx - TSQ[0]) ** 2 + (cz - TSQ[1]) ** 2 < 230 * 230 && r.height > 15;
  });
  // one line per tile that has ANY candidate frontage, and window.__TSQBOARDS,
  // because "the district is blank" and "the district was never built" look
  // identical in a frame and the old code returned null in silence (critic r5
  // #19). If a tile near the Square reports 0 boards from N frontages, the
  // placement gates below are what to look at, not the atlas.
  if (typeof window !== 'undefined') {
    window.__TSQBOARDS = window.__TSQBOARDS || { frontages: 0, boards: 0, tiles: 0 };
    if (near.length) { window.__TSQBOARDS.frontages += near.length; window.__TSQBOARDS.tiles++; }
  }
  if (!near.length) return null;
  ensure();
  const pos = [], uv = [];
  const slotOf = (h, k) => (Math.abs((h * 9781 + k * 3167) | 0)) % (GRID * GRID);
  for (const r of near) {
    const h = (r.colorVar * 977) % 1;
    // The sign district is dense but not universal, and the normal fix above
    // turned 405 built boards into 405 VISIBLE ones across a 300 m radius —
    // which spills onto ordinary Midtown blocks. 230 m is about the bowtie
    // plus a block each way, and a fifth of frontages stay bare.
    if (h > 0.80) continue;
    // Boards go on the THREE LONGEST walls, not on frontIdx + its neighbours.
    // A Times Square frontage is often a chamfered or L-shaped footprint whose
    // compiler-scored front edge is a 6 m corner cut, and the old code took
    // that edge, failed its own `len < 10` gate and placed nothing at all —
    // which is a large part of why the district read as bare (critic r5 #19).
    // Longest-first also puts the biggest board on the biggest wall, and a
    // corner building ends up clad on two sides the way the real ones are.
    const nR = r.ring.length;
    const edges = [];
    for (let i = 0; i < nR; i++) {
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      edges.push([Math.hypot(x2 - x1, z2 - z1), i]);
    }
    edges.sort((a2, b2) => b2[0] - a2[0]);
    const pick = edges.slice(0, 3);
    for (let e = 0; e < pick.length; e++) {
      const i = pick[e][1];
      const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % nR];
      const ex = x2 - x1, ez = z2 - z1;
      const len = pick[e][0];
      if (len < 9) continue;
      if (e > 0 && ((h * 31 + e) % 1) > 0.62) continue;
      const dEdge = e;
      // OUTWARD normal. This one line is why the district read as blank.
      // Under this project's ring winding (ez, -ex) points INTO the building —
      // shopSigns.js has been living with it for rounds (its own comment: "at
      // 0.10 the sign sat 1 cm INSIDE it and only polygonOffset kept it
      // visible"), and at the 0.35 m standoff a board wants, polygonOffset
      // cannot rescue it: every board was built 35 cm inside its own facade and
      // culled by the wall. buildBillboards was reporting 405 boards across five
      // tiles at Times Square while the frame showed none.
      const nx = -ez / len, nz = ex / len;
      const nB = 1 + (h < 0.55 ? 1 : 0) + (h < 0.25 ? 1 : 0);
      for (let k = 0; k < nB; k++) {
        const slot = slotOf(h, k + dEdge * 5);
        const u0 = (slot % GRID) / GRID, v1 = 1 - ((slot / GRID) | 0) / GRID;
        const u1 = u0 + 1 / GRID, v0 = v1 - 1 / GRID;
        // bigger than the old 14-24 m: the Square's boards run the full
        // frontage, and a board narrower than its building reads as a poster.
        // Height is CLAMPED to what the building actually has above the
        // storefront rather than tested after the fact — the old code computed
        // a 13 m board on a 16 m building and then `continue`d, so every
        // mid-rise frontage in the district silently got nothing.
        const w = Math.min(len * 0.94, 16 + h * 20);
        const y0 = r.baseY + 6.5;
        const avail = (r.baseY + r.height - 1.5) - y0;
        if (avail < 5) continue;
        const hgt = Math.min(w * (0.55 + ((h * 7) % 1) * 0.5), avail / nB - 2.5);
        if (hgt < 4) continue;
        const cy = y0 + hgt / 2 + k * (hgt + 2.5);
        if (cy + hgt / 2 > r.baseY + r.height - 1.5) continue;
        const cx = x1 + ex * 0.5 + nx * 0.35, cz = z1 + ez * 0.5 + nz * 0.35;
        const hx = (ex / len) * w / 2, hz = (ez / len) * w / 2;
        const A = [cx - hx, cy - hgt / 2, cz - hz], B = [cx + hx, cy - hgt / 2, cz + hz];
        const C = [cx + hx, cy + hgt / 2, cz + hz], D = [cx - hx, cy + hgt / 2, cz - hz];
        for (const p of [A, B, C, A, C, D]) pos.push(...p);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      }
    }
  }
  const nB2 = pos.length / 18;
  if (typeof window !== 'undefined' && window.__TSQBOARDS) window.__TSQBOARDS.boards += nB2;
  console.log('[billboards] ' + near.length + ' frontages near Times Square -> ' + nB2 + ' boards');
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}
