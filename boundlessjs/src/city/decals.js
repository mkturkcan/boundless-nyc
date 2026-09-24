// Street-level decals: procedural graffiti tags, wheat-paste posters and
// grime on street-facing ground-floor WALLS. One shared canvas atlas (no asset
// files), one quad mesh per tile, applique over the facade shader with polygon
// offset (the heroFacades trick).
//
// SCOPE, because round 3 filed a road-wear defect against this file: nothing
// here touches the ground. Every quad this module emits is VERTICAL, built off
// a building ring edge with the wall's outward normal, and its lowest point is
// `baseY`. The wheel-path arcs, the crosswalk-bar veining and the crack
// sealant all live in the ground shader's material branches
// (`world/materials.js`, m == 0 asphalt and m == 3/4 paint) — see
// docs/notes/furniture.md §B for the diagnosis and the patch request.
import * as THREE from 'three';

const AS = 1024, CS2 = 256, GRID = AS / CS2; // 4x4 cells
const PAD = 7;       // transparent margin inside every cell: mip levels 4+ bleed
const OFF = 0.045;   // decal standoff from the wall plane (m)
let tex = null, mat = null;
const stats = { quads: 0, grime: 0, tag: 0, poster: 0 };
if (typeof window !== 'undefined') window.__DECALS = stats;

function rng(seed) {
  let s = seed | 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const frac = (v) => ((v % 1) + 1) % 1;
// darken a hex by k for the thin tag outline (a real tag is outlined in its own
// hue, not haloed in black)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------------------------------------------------------------------------
// Atlas. Cell layout (index = row * 4 + col, canvas row 0 = quad TOP):
//   0-4   marker/spray tags        5     throw-up
//   6-10  wheat-paste posters      11    poster cluster
//   12-15 grime: splash band at the cell BOTTOM + drip runs from the top
// ---------------------------------------------------------------------------
function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = AS;
  const ctx = cv.getContext('2d');
  const cell = (i) => [(i % GRID) * CS2, ((i / GRID) | 0) * CS2];
  const inCell = (i, draw) => {   // clip to the cell: the old code fillRect'd the
    const [ox, oy] = cell(i);     // WHOLE atlas per stain, so every gradient bled
    ctx.save();                   // into its neighbours and cost 16x the fill
    ctx.beginPath();
    ctx.rect(ox + PAD, oy + PAD, CS2 - PAD * 2, CS2 - PAD * 2);
    ctx.clip();
    draw(ox, oy);
    ctx.restore();
  };

  // ---- 0-4: marker / spray tags.
  // The old tag was a 7-segment random loop stroked TWICE: 20 px of
  // rgba(20,20,25,0.85) under 13 px of colour. 20 px of a 256 px cell on a
  // 1.7 m quad is a 13 cm BLACK stroke, and the quadratic loop field made it
  // wander in closed hooks — i.e. exactly the "black tendrils and scribbles"
  // the critic named. A real tag is ONE colour at ~5 cm with a thin outline in
  // its own hue, written left-to-right with vertical strokes and drips.
  const tagCols = ['#c9ced2', '#1c1c20', '#c4322b', '#2c55a8', '#e6e3da'];
  for (let i = 0; i < 5; i++) {
    inCell(i, (ox, oy) => {
      const r = rng(100 + i * 777);
      const col = tagCols[i];
      // a tag is WRITING: a baseline, letters of different shapes, one long
      // flourish. Amplitude has to stay under the letter pitch or the whole
      // thing collapses into a sawtooth.
      const yMid = oy + 128 + r() * 18, amp = 27 + r() * 13;
      const slant = (r() - 0.5) * 0.16;        // written by hand, never level
      const path = new Path2D();
      let x = ox + 24;
      const yAt = (xx) => yMid + (xx - (ox + 128)) * slant;
      path.moveTo(x, yAt(x) + amp * 0.7);
      for (let k = 0; k < 5; k++) {
        const w = 32 + r() * 16, f = r();
        if (f < 0.42) {                        // a loop letter (a, o, e)
          path.bezierCurveTo(x - 4, yAt(x) - amp, x + w + 6, yAt(x) - amp * 1.15, x + w * 0.6, yAt(x) + amp * 0.75);
          path.lineTo(x + w, yAt(x) + amp * 0.2);
        } else if (f < 0.72) {                 // a stem with a crossbar (t, k)
          path.lineTo(x + w * 0.42, yAt(x) - amp * 1.05);
          path.lineTo(x + w * 0.10, yAt(x) - amp * 0.25);
          path.lineTo(x + w, yAt(x) - amp * 0.35);
        } else {                               // a zig (n, m, w)
          path.lineTo(x + w * 0.30, yAt(x) - amp * 0.95);
          path.lineTo(x + w * 0.62, yAt(x) + amp * 0.55);
          path.lineTo(x + w, yAt(x) - amp * 0.75);
        }
        x += w + 3;
      }
      path.lineTo(ox + 236, yAt(ox + 236) + amp * 1.5);   // the flourish off the last letter
      const drips = [];
      for (let k = 0; k < 3; k++) {            // spray drips off the low points
        const dx = ox + 44 + r() * 150, dy = yMid + amp * 0.5;
        drips.push([dx, dy, 16 + r() * 40]);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = shade(col, i === 1 ? 1.9 : 0.55);  // thin outline in the tag's own hue
      ctx.lineWidth = 13;
      ctx.stroke(path);
      ctx.strokeStyle = col;
      ctx.lineWidth = 8.5;                                  // ~5.5 cm on the quad
      ctx.stroke(path);
      ctx.lineWidth = 3.4;
      for (const [dx, dy, dl] of drips) {
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, dy + dl); ctx.stroke();
      }
    });
  }
  // ---- 5: throw-up — three fat bubble strokes, thin dark outline
  inCell(5, (ox, oy) => {
    const r = rng(4211);
    const p = new Path2D();
    for (let k = 0; k < 3; k++) {
      const bx = ox + 46 + k * 62, by = oy + 128;
      p.moveTo(bx, by + 34);
      p.bezierCurveTo(bx - 26, by - 10, bx - 8, by - 52, bx + 20, by - 40);
      p.bezierCurveTo(bx + 46, by - 30, bx + 40, by + 18, bx + 16, by + 36);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(24,22,26,0.9)'; ctx.lineWidth = 34; ctx.stroke(p);
    ctx.strokeStyle = ['#d8d24a', '#e0663a', '#8fd0e8'][(r() * 3) | 0]; ctx.lineWidth = 25; ctx.stroke(p);
  });

  // ---- 6-10: wheat-paste posters. 24 x 36 in = 0.61 x 0.91 m, so the artwork
  // is drawn at 168 x 250 inside the cell and the quad is sized to match; the
  // old 150-220 x 190-240 art on a 0.85 x 1.1 m quad was a poster the size of
  // a door. Slight rotation and a torn bottom corner: paste is never square.
  const grounds = ['#e7e1d2', '#dde3ea', '#e9d8c6', '#f1efe7', '#dbe7dc', '#e5dbea'];
  const inks = ['#26437a', '#7a2626', '#286034', '#2c2c30', '#6a3d8d', '#a0581d'];
  for (let i = 6; i < 11; i++) {
    inCell(i, (ox, oy) => {
      const r = rng(500 + i * 313);
      ctx.translate(ox + CS2 / 2, oy + CS2 / 2);
      ctx.rotate((r() - 0.5) * 0.10);
      const w = 168, h = 250, px = -w / 2, py = -h / 2;
      ctx.fillStyle = grounds[i - 6]; ctx.fillRect(px, py, w, h);
      ctx.fillStyle = inks[i - 6]; ctx.fillRect(px, py, w, 40 + r() * 26);
      ctx.fillStyle = 'rgba(38,38,44,0.72)';
      for (let ln = 0; ln < 8; ln++) {
        const ly = py + 84 + ln * 19;
        if (ly > py + h - 16) break;
        ctx.fillRect(px + 13, ly, (w - 26) * (0.45 + r() * 0.55), 6);
      }
      ctx.fillStyle = inks[i - 6];
      ctx.fillRect(px + 13, py + h - 40, (w - 26) * 0.55, 22);   // date/venue block
      ctx.clearRect(px + w - 26 - r() * 22, py + h - 22, 52, 26); // torn corner
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
  }
  // ---- 11: a cluster — three overlapping posters, which is how they appear
  inCell(11, (ox, oy) => {
    const r = rng(9137);
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(ox + 62 + k * 66, oy + 122 + (r() - 0.5) * 22);
      ctx.rotate((r() - 0.5) * 0.16);
      const w = 74, h = 112;
      ctx.fillStyle = grounds[(k * 2 + 1) % 6]; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = inks[(k * 3 + 2) % 6]; ctx.fillRect(-w / 2, -h / 2, w, 20);
      ctx.fillStyle = 'rgba(38,38,44,0.68)';
      for (let ln = 0; ln < 5; ln++) ctx.fillRect(-w / 2 + 7, -h / 2 + 30 + ln * 13, (w - 14) * (0.5 + r() * 0.5), 4);
      ctx.restore();
    }
  });

  // ---- 12-15: grime.
  // The old "stain" cells were 14 radial blobs scattered over the cell at
  // 10-23 % alpha, which renders as pale leopard spots floating in the middle
  // of a wall (visible on the cream building in
  // shots/critic/xwalk125_day_crit3_top.png and crit3_lenox_front_day.png).
  // Building grime is DIRECTIONAL and EDGE-ANCHORED: a splash/soot band rising
  // off the pavement, and drip runs coming DOWN from sills and the cornice.
  // Nothing round, nothing floating.
  for (let i = 12; i < 16; i++) {
    inCell(i, (ox, oy) => {
      const r = rng(900 + i * 131);
      // splash / soot band off the pavement. The quad is base-anchored, so the
      // cell BOTTOM is the wall foot: hold the gradient's peak past the clip
      // margin or the darkest 7 px are the ones thrown away.
      const bandH = 118 + r() * 70;
      const gb = ctx.createLinearGradient(0, oy + CS2 - PAD, 0, oy + CS2 - bandH);
      gb.addColorStop(0, 'rgba(26,23,19,0.56)');
      gb.addColorStop(0.30, 'rgba(26,23,19,0.26)');
      gb.addColorStop(1, 'rgba(26,23,19,0)');
      ctx.fillStyle = gb;
      ctx.fillRect(ox, oy + CS2 - bandH, CS2, bandH);
      // drip runs down from sills and the cornice. Blurred: a hard-edged
      // rectangle gradient reads as a bar chart, which is what the first pass
      // of this pane looked like.
      ctx.filter = 'blur(5px)';
      for (let d = 0; d < 7; d++) {
        const dx = ox + 14 + r() * (CS2 - 34);
        const dw = 4 + r() * r() * 22, dl = 70 + r() * 165;
        const gd = ctx.createLinearGradient(0, oy, 0, oy + dl);
        const a = 0.10 + r() * 0.15;
        gd.addColorStop(0, `rgba(30,27,22,${a})`);
        gd.addColorStop(0.55, `rgba(30,27,22,${a * 0.62})`);
        gd.addColorStop(1, 'rgba(30,27,22,0)');
        ctx.fillStyle = gd;
        ctx.fillRect(dx, oy, dw, dl);
      }
      // two broad soft smears, still vertical — weathering, not blotches
      for (let d = 0; d < 2; d++) {
        const dx = ox + 20 + r() * (CS2 - 110);
        const gs = ctx.createLinearGradient(dx, 0, dx + 84, 0);
        gs.addColorStop(0, 'rgba(28,25,21,0)');
        gs.addColorStop(0.5, `rgba(28,25,21,${0.06 + r() * 0.07})`);
        gs.addColorStop(1, 'rgba(28,25,21,0)');
        ctx.fillStyle = gs;
        ctx.fillRect(dx, oy + 24 + r() * 60, 84, CS2 - 40);
      }
      ctx.filter = 'none';
    });
  }

  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.92, metalness: 0,
    alphaTest: 0.012,                      // the empty 80 % of every quad never blends
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    depthWrite: false,
  });
}

// recs: [{ring, frontIdx, baseY, storeH, height, colorVar, style, store}] world-space.
// Returns a tile decal mesh or null.
export function buildDecals(recs) {
  if (!mat) buildAtlas();
  const pos = [], uv = [], nor = [];
  const quad = (cx, cy, cz, ax, az, nx, nz, w, h, cellI) => {
    const u0 = (cellI % GRID) / GRID, v1 = 1 - ((cellI / GRID) | 0) / GRID;
    const u1 = u0 + 1 / GRID, v0 = v1 - 1 / GRID;
    const hx = ax * w / 2, hz = az * w / 2;
    const A = [cx - hx, cy - h / 2, cz - hz], B = [cx + hx, cy - h / 2, cz + hz];
    const C = [cx + hx, cy + h / 2, cz + hz], D = [cx - hx, cy + h / 2, cz - hz];
    for (const p of [A, B, C, A, C, D]) { pos.push(...p); nor.push(nx, 0, nz); }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  for (const r of recs) {
    const i = r.frontIdx;
    if (i < 0 || i >= r.ring.length) continue;
    const [x1, z1] = r.ring[i], [x2, z2] = r.ring[(i + 1) % r.ring.length];
    const ex = x2 - x1, ez = z2 - z1;
    const len = Math.hypot(ex, ez);
    // 4 m, not 6: a Harlem rowhouse frontage is 5-6 m and the 6 m gate put the
    // whole brownstone typology out of reach of every wall decal.
    if (len < 4) continue;
    const ax = ex / len, az = ez / len;
    const nx = ez / len, nz = -ex / len;         // exterior (shoelace-positive convention)
    const cv = r.colorVar, st = r.style | 0;
    // Typology decides what a wall carries. Tags land on tenement brick, loft
    // and industrial walls, retail roll-down shutters and project brick; they
    // do NOT land on limestone civic frontages, curtain wall, prewar co-ops or
    // a maintained brownstone, and the old rule (everything except style 6)
    // had it close to backwards — LOFT_CASTIRON is the Williamsburg graffiti
    // wall the critic found bare.
    const tagProne = st === 0 || st === 2 || st === 6 || st === 7 || st === 10 || st === 12;
    const glassy = st === 3 || st === 11;
    // 3 cm off the facade: a flat card 4.5 cm proud read as a floating sticker
    // at grazing angles and picked up its own AO band. Paint and paper on brick
    // is millimetres; 3 cm is the minimum that survives the shader facade's own
    // relief without z-fighting it.
    const put = (t, cellI, w, h, cy) => {
      const tt = Math.min(1 - (w / 2 + 0.3) / len, Math.max((w / 2 + 0.3) / len, t));
      quad(x1 + ex * tt + nx * OFF, cy, z1 + ez * tt + nz * OFF, ax, az, nx, nz, w, h, cellI);
    };
    // a storefront occupies the whole ground floor: wall decals go on the
    // masonry ABOVE the fascia, never across the plate glass
    const sH = r.store ? Math.min(Math.max(r.storeH || 0, 2.6), 5.2) + 0.45 : 0;
    const base = r.baseY + sH;
    const head = r.baseY + Math.max(3, r.height || 4);   // never above the wall

    const hG = frac(cv * 977.13), hT = frac(cv * 313.7 + 0.31), hP = frac(cv * 617.9 + 0.62);
    // grime: the common case. Subtle, base-anchored, and on most masonry —
    // a clean-swept wall on every building was its own tell.
    if (!glassy && hG < 0.66 && base + 1.6 < head) {
      const w = Math.min(len - 0.6, 2.3 + frac(cv * 71) * 1.7);
      put(0.18 + hG * 0.62, 12 + ((hG * 29) | 0) % 4, w, 1.55, base + 0.76);
      stats.grime++;
      if (len > 15 && hG < 0.30) { put(0.72, 12 + ((hG * 17) | 0) % 4, w * 0.9, 1.45, base + 0.70); stats.grime++; }
    }
    // tags: the reachable band, 1.0-2.1 m up
    if (tagProne && hT < 0.30 && base + 2.2 < head) {
      if (hT < 0.06) { put(0.34 + hT * 2.4, 5, 2.35, 1.45, base + 1.72); }   // throw-up
      else { put(0.20 + hT * 2.0, ((hT * 41) | 0) % 5, 1.52, 1.02, base + 1.55); }
      stats.tag++;
    }
    // posters: on shopfront piers and on blank industrial/loft walls
    if ((r.store || st === 6 || st === 7 || st === 0) && hP < 0.36 && base + 2.1 < head) {
      if (hP < 0.11) put(0.30 + hP * 1.7, 11, 1.72, 0.98, base + 1.62);      // cluster
      else put(0.24 + hP * 1.5, 6 + ((hP * 53) | 0) % 5, 0.61, 0.91, base + 1.55);
      stats.poster++;
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  stats.quads += pos.length / 18;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}
