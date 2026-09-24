// Procedural canvas texture factory. All facade textures are drawn at a known
// physical tile size (meters) so geometry can UV-map in world units and brick
// courses stay true to scale everywhere.
import * as THREE from 'three';

const _noiseCache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable value noise canvas (grayscale), cached by size/octaves.
function noiseCanvas(size = 256, octaves = 4, seed = 7) {
  const key = `${size}|${octaves}|${seed}`;
  if (_noiseCache.has(key)) return _noiseCache.get(key);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const base = makeCanvas(size, size);
  {
    const ctx = base.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor(rnd() * 256);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  // stack blurred octaves for smooth tileable-ish noise
  const out = makeCanvas(size, size);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'overlay';
  for (let o = 0; o < octaves; o++) {
    const scale = 2 ** o;
    ctx.globalAlpha = 0.5 / (o + 1);
    ctx.imageSmoothingEnabled = true;
    // draw wrapped 2x2 to hide seams
    const w = size / scale;
    for (let ix = 0; ix < scale + 1; ix++) {
      for (let iy = 0; iy < scale + 1; iy++) {
        ctx.drawImage(base, (ix * w) % size - (o * 17) % size, (iy * w) % size - (o * 31) % size, w, w);
      }
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  _noiseCache.set(key, out);
  return out;
}

function overlayNoise(ctx, w, h, alpha = 0.08, scale = 1, comp = 'overlay') {
  const n = noiseCanvas(256, 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = comp;
  for (let x = 0; x < w; x += 256 * scale) {
    for (let y = 0; y < h; y += 256 * scale) {
      ctx.drawImage(n, x, y, 256 * scale, 256 * scale);
    }
  }
  ctx.restore();
}

function jitterHsl(rnd, h, s, l, dh, ds, dl) {
  const hh = h + (rnd() - 0.5) * dh;
  const ss = Math.max(0, Math.min(100, s + (rnd() - 0.5) * ds));
  const ll = Math.max(0, Math.min(100, l + (rnd() - 0.5) * dl));
  return `hsl(${hh.toFixed(1)},${ss.toFixed(1)}%,${ll.toFixed(1)}%)`;
}

function finishTexture(canvas, { srgb = true, tileMeters = 2 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.userData.tileMeters = tileMeters;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

let _seedCounter = 1;
function localRnd(seed = _seedCounter++) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------------------
// BRICK — physically scaled. Tile = 2.0m x 2.0m. Standard NYC brick:
// 8" x 2.25" face + 3/8" joints -> course height ~0.067m, brick+joint ~0.213m.
// ---------------------------------------------------------------------------
export function brickTexture({
  hue = 12, sat = 42, light = 37,          // base HSL
  dh = 7, ds = 12, dl = 9,                 // per-brick jitter
  mortar = '#9c948a',
  mortarLight = 0,                          // extra mortar lightness shift
  flemish = false,                          // header bond accents
  darkBrickChance = 0.06,                   // clinker/burnt bricks
  darkBrickColor = 'hsl(9, 30%, 22%)',
  paint = null,                             // painted-brick overlay color
  paintAlpha = 0.88,
  seed = 1,
  size = 2048,
} = {}) {
  // 4m tile (same px/m as the old 2m@1024): halves the visible repeat period
  const tileMeters = 4.0;
  const px = size / tileMeters;             // pixels per meter
  const bw = 0.194 * px, bh = 0.057 * px, joint = 0.010 * px;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  // mortar background
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, size, size);
  if (mortarLight) { ctx.fillStyle = `rgba(255,255,255,${mortarLight})`; ctx.fillRect(0, 0, size, size); }

  const bump = makeCanvas(size, size);
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#5a5a5a'; bctx.fillRect(0, 0, size, size); // mortar recessed

  // a few small clinker CLUSTERS per tile (9 large ones repeated as a lattice)
  const clusters = [];
  for (let i = 0; i < 3; i++) {
    clusters.push([rnd() * size, rnd() * size, (0.04 + rnd() * 0.05) * size]);
  }
  const nearCluster = (x, y) => clusters.some(([cx, cy, cr]) => {
    const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx));
    const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy));
    return dx * dx + dy * dy < cr * cr;
  });

  const courseH = bh + joint;
  const stride = bw + joint;
  const rows = Math.ceil(size / courseH) + 1;
  for (let r = 0; r < rows; r++) {
    const y = r * courseH;
    // running bond offset; wrap-consistent because size is a multiple relationship approximated — we redraw edge bricks
    const offset = (r % 2) * stride * 0.5;
    if (flemish) {
      // TRUE Flemish bond: stretcher/header alternate WITHIN every course,
      // header centered over the stretcher below (half-repeat offset per row)
      const hw = bw * 0.48;
      const rep = bw + joint + hw + joint;
      const off = (r % 2) * rep * 0.5;
      for (let x = -rep; x < size + rep; x += rep) {
        for (const [bx0, w] of [[x + off, bw], [x + off + bw + joint, hw]]) {
          const isHeader = w < bw * 0.6;
          let fill;
          if (isHeader && rnd() < 0.55) fill = `hsl(${hue + 190},${8 + rnd() * 10}%,${light - 6 + rnd() * 8}%)`; // glazed header
          else if (rnd() < darkBrickChance) fill = darkBrickColor;
          else fill = jitterHsl(rnd, hue, sat, light, dh, ds, dl);
          ctx.fillStyle = fill;
          ctx.fillRect(bx0, y, w - joint * 0.15, bh);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(bx0, y, w - joint * 0.15, bh * 0.14);
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillRect(bx0, y + bh * 0.86, w - joint * 0.15, bh * 0.14);
          bctx.fillStyle = `hsl(0,0%,${62 + rnd() * 14}%)`;
          bctx.fillRect(bx0, y, w - joint * 0.15, bh);
        }
      }
      continue;
    }
    const w = bw;
    const strideR = w + joint;
    for (let x = -strideR; x < size + strideR; x += strideR) {
      const bx = x + offset;
      let fill;
      const inCluster = nearCluster(bx, y);
      if (inCluster && rnd() < darkBrickChance * 6) {
        // clustered clinkers at a gentler delta than the old confetti
        fill = jitterHsl(rnd, hue + 2, Math.max(10, sat - 12), Math.max(8, light - 7), 4, 6, 4);
      } else if (rnd() < darkBrickChance * 0.25) {
        fill = darkBrickColor;
      } else fill = jitterHsl(rnd, hue, sat, light, dh, ds, dl);
      ctx.fillStyle = fill;
      // slight size wobble
      const wob = (rnd() - 0.5) * joint * 0.6;
      ctx.fillRect(bx, y + wob * 0.3, w - joint * 0.15, bh);
      // top highlight + bottom shadow (fake bevel, sun-from-above)
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(bx, y + wob * 0.3, w - joint * 0.15, bh * 0.14);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(bx, y + wob * 0.3 + bh * 0.86, w - joint * 0.15, bh * 0.14);
      // subtle per-brick texture blotch
      if (rnd() < 0.3) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`;
        const px0 = bx + rnd() * w * 0.6, pw = w * (0.2 + rnd() * 0.3);
        ctx.fillRect(px0, y + rnd() * bh * 0.5, pw, bh * (0.3 + rnd() * 0.4));
      }
      // bump: brick faces raised
      bctx.fillStyle = `hsl(0,0%,${62 + rnd() * 14}%)`;
      bctx.fillRect(bx, y + wob * 0.3, w - joint * 0.15, bh);
    }
  }
  overlayNoise(ctx, size, size, 0.10, 2);
  overlayNoise(ctx, size, size, 0.06, 0.5);
  // large-scale blotching (multiply) so the tile has no repeating 'look'
  overlayNoise(ctx, size, size, 0.14, 8, 'multiply');
  if (paint) {
    ctx.globalAlpha = paintAlpha;
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    overlayNoise(ctx, size, size, 0.07, 1.5);
    // paint wear revealing brick tone at joints
    ctx.globalAlpha = 0.05; ctx.drawImage(bump, 0, 0); ctx.globalAlpha = 1;
  }
  const map = finishTexture(c, { tileMeters });
  const bumpMap = finishTexture(bump, { srgb: false, tileMeters });
  return { map, bumpMap, tileMeters };
}

// ---------------------------------------------------------------------------
// BROWNSTONE — sandstone ashlar. Tile 2m. Courses ~0.42m with tooled texture.
// ---------------------------------------------------------------------------
export function brownstoneTexture({ hue = 17, sat = 26, light = 30, seed = 2, size = 1024 } = {}) {
  const tileMeters = 2.0;
  const px = size / tileMeters;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${hue},${sat}%,${light}%)`; ctx.fillRect(0, 0, size, size);
  const courseH = 0.42 * px;
  const rows = Math.ceil(size / courseH);
  for (let r = 0; r < rows; r++) {
    const y = r * courseH;
    // per-course tint variation
    ctx.fillStyle = jitterHsl(rnd, hue, sat, light, 4, 6, 5);
    ctx.globalAlpha = 0.55; ctx.fillRect(0, y, size, courseH); ctx.globalAlpha = 1;
    // vertical block joints, offset per course (long blocks 0.9-1.4m)
    let x = -rnd() * 0.8 * px;
    while (x < size) {
      const bw = (0.9 + rnd() * 0.5) * px;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + bw, y + courseH * 0.06, 2, courseH * 0.88);
      // blotchy weathering per block
      if (rnd() < 0.5) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '20,12,8' : '90,60,40'},${0.05 + rnd() * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(x + bw * rnd(), y + courseH * rnd(), bw * (0.2 + rnd() * 0.3), courseH * (0.2 + rnd() * 0.3), 0, 0, 7);
        ctx.fill();
      }
      x += bw;
    }
    // horizontal joint shadow + top light
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, y + courseH - 2.5, size, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, y, size, 2);
    // faint vertical tooling striations
    ctx.globalAlpha = 0.05;
    for (let sx = 0; sx < size; sx += 3 + rnd() * 3) {
      ctx.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
      ctx.fillRect(sx, y + 2, 1, courseH - 4);
    }
    ctx.globalAlpha = 1;
  }
  overlayNoise(ctx, size, size, 0.12, 2);
  overlayNoise(ctx, size, size, 0.05, 0.5);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// ASHLAR STONE (limestone / granite base) — tile 2m
// ---------------------------------------------------------------------------
export function stoneTexture({ base = '#cdc4b3', blockW = 0.75, blockH = 0.38, jointDark = 0.28, seed = 3, size = 1024, weather = 0.1 } = {}) {
  const tileMeters = 2.0;
  const px = size / tileMeters;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const rows = Math.ceil(size / (blockH * px));
  for (let r = 0; r < rows; r++) {
    const y = r * blockH * px;
    let x = -(r % 2) * blockW * px * 0.5;
    while (x < size) {
      const bw = blockW * px * (0.9 + rnd() * 0.2);
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rnd() * 0.05})`;
      ctx.fillRect(x, y, bw, blockH * px);
      if (weather && rnd() < 0.4) {
        ctx.fillStyle = `rgba(60,50,40,${weather * (0.3 + rnd() * 0.7)})`;
        ctx.beginPath();
        ctx.ellipse(x + bw * rnd(), y + blockH * px * rnd(), bw * 0.3 * rnd(), blockH * px * 0.3 * rnd(), 0, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(0,0,0,${jointDark})`;
      ctx.fillRect(x + bw - 1.6, y + 1, 1.6, blockH * px - 2);
      x += bw;
    }
    ctx.fillStyle = `rgba(0,0,0,${jointDark})`; ctx.fillRect(0, y + blockH * px - 1.8, size, 1.8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, y, size, 1.5);
  }
  overlayNoise(ctx, size, size, 0.09, 2);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// STUCCO / CONCRETE — tile 2m
// ---------------------------------------------------------------------------
export function stuccoTexture({ base = '#b9b2a4', seed = 4, size = 512, blotch = 0.12 } = {}) {
  const tileMeters = 2.0;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${blotch * rnd() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, size * (0.05 + rnd() * 0.2), size * (0.03 + rnd() * 0.15), rnd() * 3, 0, 7);
    ctx.fill();
  }
  overlayNoise(ctx, size, size, 0.12, 1);
  overlayNoise(ctx, size, size, 0.08, 0.35);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// SIDEWALK — 3m tile, 1.5m slabs with expansion joints, aggregate speckle.
// ---------------------------------------------------------------------------
export function sidewalkTexture({ seed = 5, size = 2048 } = {}) {
  // 6 m tile (4x4 flags): a 3 m tile with 2x2 flags checkerboarded to the horizon
  const tileMeters = 6.0;
  const px = size / tileMeters;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a857d'; ctx.fillRect(0, 0, size, size);
  // slab tint variation: real flag-to-flag value drift (replaced flags, age)
  for (let sx = 0; sx < 4; sx++) {
    for (let sy = 0; sy < 4; sy++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.06 + rnd() * 0.12})`;
      ctx.fillRect(sx * 1.5 * px, sy * 1.5 * px, 1.5 * px, 1.5 * px);
    }
  }
  // aggregate speckle
  for (let i = 0; i < 36000; i++) {
    const v = 120 + Math.floor(rnd() * 110);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.12 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1.3, 1.3);
  }
  // stains
  for (let i = 0; i < 44; i++) {
    ctx.fillStyle = `rgba(40,35,30,${0.03 + rnd() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, size * 0.02 + rnd() * size * 0.09, size * 0.02 + rnd() * size * 0.06, rnd() * 3, 0, 7);
    ctx.fill();
  }
  // gum dots
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(25,24,22,${0.25 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 1.6 + rnd() * 2, 0, 7); ctx.fill();
  }
  // bump map: scored joints recessed, per-flag micro height offset
  const bump = makeCanvas(size, size);
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, size, size);
  for (let sx = 0; sx < 4; sx++) {
    for (let sy = 0; sy < 4; sy++) {
      const v = 118 + Math.floor(rnd() * 20);
      bctx.fillStyle = `rgb(${v},${v},${v})`;
      bctx.fillRect(sx * 1.5 * px + 2, sy * 1.5 * px + 2, 1.5 * px - 4, 1.5 * px - 4);
    }
  }
  // expansion joints every 1.5m (full 6 m tile: 4 flags each way)
  ctx.strokeStyle = 'rgba(30,28,26,0.55)'; ctx.lineWidth = 3;
  bctx.strokeStyle = 'rgb(40,40,40)'; bctx.lineWidth = 4;
  for (let j = 0; j <= 4; j++) {
    ctx.beginPath(); ctx.moveTo(j * 1.5 * px, 0); ctx.lineTo(j * 1.5 * px, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, j * 1.5 * px); ctx.lineTo(size, j * 1.5 * px); ctx.stroke();
    bctx.beginPath(); bctx.moveTo(j * 1.5 * px, 0); bctx.lineTo(j * 1.5 * px, size); bctx.stroke();
    bctx.beginPath(); bctx.moveTo(0, j * 1.5 * px); bctx.lineTo(size, j * 1.5 * px); bctx.stroke();
  }
  // hairline cracks
  ctx.strokeStyle = 'rgba(45,42,38,0.4)'; ctx.lineWidth = 1.1;
  for (let i = 0; i < 7; i++) {
    let x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 60; y += rnd() * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  overlayNoise(ctx, size, size, 0.1, 1.5);
  const map = finishTexture(c, { tileMeters });
  const bumpMap = finishTexture(bump, { srgb: false, tileMeters });
  return { map, bumpMap, tileMeters };
}

// ---------------------------------------------------------------------------
// ASPHALT — 4m tile
// ---------------------------------------------------------------------------
export function asphaltTexture({ seed = 6, size = 2048 } = {}) {
  // sunlit NYC asphalt is warm mid-gray (albedo ~0.12-0.18), not navy-black.
  // 14 m tile: a 3.5 m tile marched its patch/crack cluster to the vanishing
  // point on a visible grid. Lane wear comes from world-placed street:patch
  // runs (city.js), never from the tile.
  const tileMeters = 14.0;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#504d48'; ctx.fillRect(0, 0, size, size);
  const bump = makeCanvas(size, size);
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, size, size);
  // roughness channel: crown ~0.72, polished wheel paths ~0.45, fresh patches ~0.6
  const rough = makeCanvas(size, size);
  const rctx = rough.getContext('2d');
  rctx.fillStyle = '#b8b8b8'; rctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90000; i++) {
    const v = 58 + Math.floor(rnd() * 74);
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 5},${0.25 + rnd() * 0.3})`;
    const x = rnd() * size, y = rnd() * size;
    ctx.fillRect(x, y, 1.5, 1.5);
    bctx.fillStyle = `rgba(${rnd() < 0.5 ? 40 : 200},${rnd() < 0.5 ? 40 : 200},${rnd() < 0.5 ? 40 : 200},0.25)`;
    bctx.fillRect(x, y, 1.5, 1.5);
  }
  // (no baked wheel paths: they only align with lanes by accident and repeat)
  // patch rectangles (utility cuts) — darker fresh asphalt
  // only 3, faint and FEATHERED: hard-edged baked rectangles repeated every tile
  // as a visible "quilt" down every street (the real utility cuts are the
  // world-placed street:patch instances in city.js)
  for (let i = 0; i < 3; i++) {
    const px = rnd() * size, py = rnd() * size, pw = size * (0.1 + rnd() * 0.3), ph = size * (0.06 + rnd() * 0.15);
    const c = rnd() < 0.5 ? '38,37,36' : '88,85,80';
    const g = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 0, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.6);
    g.addColorStop(0, `rgba(${c},${0.10 + rnd() * 0.08})`);
    g.addColorStop(0.7, `rgba(${c},${0.06 + rnd() * 0.05})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(px - pw * 0.2, py - ph * 0.2, pw * 1.4, ph * 1.4);
  }
  // tar crack seals (shiny dark squiggles) + cracks
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(28,27,26,${0.35 + rnd() * 0.25})`; ctx.lineWidth = 1.4 + rnd() * 1.8;
    let x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) { x += (rnd() - 0.5) * 110; y += (rnd() - 0.5) * 110; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // oil drip stains along the parking-lane band
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(25,24,23,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, 6 + rnd() * 22, 4 + rnd() * 12, rnd() * 3, 0, 7);
    ctx.fill();
  }
  overlayNoise(ctx, size, size, 0.09, 2);
  const map = finishTexture(c, { tileMeters });
  const bumpMap = finishTexture(bump, { srgb: false, tileMeters });
  const roughMap = finishTexture(rough, { srgb: false, tileMeters });
  return { map, bumpMap, roughMap, tileMeters };
}

// ---------------------------------------------------------------------------
// ROOF — silver-coated tar w/ roller streaks & patches. 3m tile.
// ---------------------------------------------------------------------------
// RF13 (owner 2026-09-16: "avoid ... excessively tiled rooftop textures without details"). The old 3 m tile carried TEN dark
// tar blobs, so every roof was the same blob field repeated every three metres in world axes. This is a MEMBRANE: eight
// 0.914 m (36 in) rolls per 7.3 m tile laid along the texture's u axis (nycDress.js maps u along the building's longest
// parapet), each roll its own faint batch tint, a lap seam between rolls, brush/roller streaks along the rolls, one or two
// rectangular repair patches with a mastic border per tile at low contrast, and a couple of soft pooling stains.
export function roofTexture({ silver = true, seed = 7, size = 1024 } = {}) {
  const ROLL = 0.914, ROLLS = 8;
  const tileMeters = ROLL * ROLLS;            // 7.31 m — a repeat you do not see from the air
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = silver ? '#a4a5a1' : '#4f4c47';
  ctx.fillRect(0, 0, size, size);
  const rollPx = size / ROLLS;
  // roll batch tint + lap seam (rolls run along u -> bands are horizontal in v)
  for (let r = 0; r < ROLLS; r++) {
    const y0 = r * rollPx;
    const t = (rnd() - 0.5) * 0.09;
    ctx.fillStyle = t > 0 ? `rgba(255,255,255,${t})` : `rgba(0,0,0,${-t})`;
    ctx.fillRect(0, y0, size, rollPx);
    // lap: the upper roll overlaps the lower by ~75 mm — a shadow line and a thin lit edge
    ctx.fillStyle = silver ? 'rgba(60,60,58,0.34)' : 'rgba(8,8,8,0.5)';
    ctx.fillRect(0, y0 + rollPx - 3, size, 3);
    ctx.fillStyle = silver ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y0 + rollPx - 5, size, 2);
  }
  // roller / brush streaks along the rolls, long and faint
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${silver ? '255,255,255' : '0,0,0'},${0.025 + rnd() * 0.05})`;
    const y = rnd() * size, h = 2 + rnd() * 6, x = rnd() * size * 0.5, w = size * (0.3 + rnd() * 0.7);
    ctx.fillRect(x, y, w, h);
  }
  // soft pooling / soot stains: two per tile, very low contrast, broad
  for (let i = 0; i < 2; i++) {
    const x = rnd() * size, y = rnd() * size, rad = size * (0.10 + rnd() * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, silver ? 'rgba(70,72,70,0.16)' : 'rgba(0,0,0,0.20)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // repair patches: rectangles aligned with the rolls, a mastic border, one or two per tile
  const nP = 1 + (rnd() < 0.5 ? 1 : 0);
  for (let i = 0; i < nP; i++) {
    const w = size * (0.08 + rnd() * 0.12), h = rollPx * (0.6 + rnd() * 0.9);
    const x = rnd() * (size - w), y = rnd() * (size - h);
    ctx.fillStyle = silver ? 'rgba(40,40,38,0.22)' : 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);                 // mastic border
    ctx.fillStyle = silver ? 'rgba(150,152,148,0.55)' : 'rgba(70,68,63,0.6)';
    ctx.fillRect(x, y, w, h);                                 // the patch itself, a shade off the field
  }
  overlayNoise(ctx, size, size, 0.07, 1.2);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// CORRUGATED METAL (roll-down gates) — 1m tile, vertical ribs
// ---------------------------------------------------------------------------
export function corrugatedTexture({ base = '#8f9294', seed = 8, size = 512, graffiti = false } = {}) {
  const tileMeters = 1.0;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const ribW = size / 20;
  for (let x = 0; x < size; x += ribW) {
    const g = ctx.createLinearGradient(x, 0, x + ribW, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, ribW, size);
  }
  // horizontal slat joints
  for (let y = 0; y < size; y += size / 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y, size, 2);
  }
  // rust streaks
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(110,60,30,${0.06 + rnd() * 0.12})`;
    const x = rnd() * size;
    ctx.fillRect(x, rnd() * size * 0.4, 3 + rnd() * 6, size * (0.2 + rnd() * 0.5));
  }
  if (graffiti) {
    const cols = ['#c33', '#36c', '#fff', '#fc3', '#3c6'];
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.lineWidth = 6 + rnd() * 8; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.65;
      let x = rnd() * size * 0.6 + size * 0.1, y = size * (0.35 + rnd() * 0.4);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += 20 + rnd() * 40; y += (rnd() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  overlayNoise(ctx, size, size, 0.08, 1);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// VINYL / CLAPBOARD SIDING — 1m tile, ~0.2m boards
// ---------------------------------------------------------------------------
export function sidingTexture({ base = '#c8c2b2', seed = 9, size = 512 } = {}) {
  const tileMeters = 1.0;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const boardH = size / 5; // 0.2m boards
  for (let y = 0; y < size; y += boardH) {
    const g = ctx.createLinearGradient(0, y, 0, y + boardH);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g; ctx.fillRect(0, y, size, boardH);
  }
  overlayNoise(ctx, size, size, 0.05, 1);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// SLATE ROOF — 1.5m tile: half-lapped units w/ exposure lines, color outliers
// ---------------------------------------------------------------------------
export function slateTexture({ base = '#3f4148', seed = 12, size = 512 } = {}) {
  const tileMeters = 1.5;
  const px = size / tileMeters;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const unitW = 0.30 * px, expo = 0.145 * px;
  const rows2 = Math.ceil(size / expo) + 1;
  for (let r = 0; r < rows2; r++) {
    const y = r * expo;
    const off = (r % 2) * unitW * 0.5;
    for (let x = -unitW; x < size + unitW; x += unitW) {
      const outlier = rnd();
      ctx.fillStyle = outlier < 0.06 ? `hsla(280,12%,${24 + rnd() * 8}%,0.9)`
        : outlier < 0.12 ? `hsla(160,10%,${26 + rnd() * 8}%,0.9)`
        : `hsla(222,${5 + rnd() * 7}%,${22 + rnd() * 12}%,0.9)`;
      ctx.fillRect(x + off, y, unitW - 1.5, expo * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + off + unitW - 2.5, y, 2.5, expo * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y + expo - 2, size, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, y, size, 1.4);
  }
  overlayNoise(ctx, size, size, 0.1, 1.5);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// WOOD STAVES (water towers) — 1m tile, vertical boards
// ---------------------------------------------------------------------------
export function woodStaveTexture({ base = '#7a5c42', seed = 10, size = 512 } = {}) {
  const tileMeters = 1.0;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const staveW = size / 8;
  for (let x = 0; x < size; x += staveW) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.09})`;
    ctx.fillRect(x, 0, staveW, size);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, 0, 1.6, size);
    // grain
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rnd() < 0.6 ? '#000' : '#fff';
      ctx.fillRect(x + rnd() * staveW, 0, 1, size);
    }
    ctx.globalAlpha = 1;
  }
  // dark water staining bands near bottom
  const g = ctx.createLinearGradient(0, size * 0.6, 0, size);
  g.addColorStop(0, 'rgba(20,14,10,0)'); g.addColorStop(1, 'rgba(20,14,10,0.4)');
  ctx.fillStyle = g; ctx.fillRect(0, size * 0.6, size, size * 0.4);
  overlayNoise(ctx, size, size, 0.09, 1);
  const map = finishTexture(c, { tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// SIGN ATLAS — one 2048x1024 canvas, 4 cols x 8 rows of signs (512x128 each).
// Returns { map, uvFor(index) } — merged storefront sign quads pick a cell.
// ---------------------------------------------------------------------------
export const SIGN_TEXTS = [
  ['DELI & GROCERY', '#f8e408', '#c81f1f'], ['LAUNDROMAT', '#ffffff', '#1f52a8'],
  ['HAIR • NAILS', '#ffd3e2', '#8c1f5a'], ['PIZZA', '#ffffff', '#b3221c'],
  ['LIQUORS', '#ffe94d', '#111111'], ['FRIED CHICKEN', '#ffffff', '#d33a1e'],
  ['99¢ DISCOUNT', '#fff23d', '#d61c1c'], ['COFFEE SHOP', '#f3ead7', '#20402c'],
  ['PHARMACY RX', '#ffffff', '#0f7a3d'], ['HARDWARE', '#f6d648', '#333333'],
  ['CHECKS CASHED', '#ffe94d', '#0b56b3'], ['BARBER SHOP', '#ffffff', '#a01c1c'],
  ['TATTOO', '#e8e8e8', '#141414'], ['VINTAGE', '#f0e2c8', '#4a3524'],
  ['RECORDS', '#ffd23d', '#232323'], ['BAGELS', '#ffffff', '#8a5a1e'],
  ['FLORIST', '#ffffff', '#2e6b3e'], ['LOCKSMITH', '#ffe94d', '#222222'],
  ['DRY CLEANERS', '#ffffff', '#2879b8'], ['TAQUERIA', '#fff1c9', '#c2551b'],
  ['WINE & SPIRITS', '#e9ddc0', '#3a2430'], ['BOTANICA', '#ffffff', '#7a2ea0'],
  ['SMOKE SHOP', '#c9f24d', '#191919'], ['NAIL SALON', '#ffffff', '#d84a8b'],
  ['THRIFT', '#f2ede0', '#356060'], ['BOOKS', '#efe6d2', '#503a28'],
  ['CAFÉ', '#f5efdf', '#232a22'], ['DINER', '#ffffff', '#983036'],
  ['GROCERY CORP', '#ffe94d', '#0f8a44'], ['FISH MARKET', '#ffffff', '#1a4f7a'],
  ['JUICE BAR', '#173d1e', '#a8e063'], ['GALLERY', '#1a1a1a', '#efefef'],
];

export function signAtlas() {
  const W = 2048, H = 1024, CW = 512, CH = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rnd = localRnd(77);
  SIGN_TEXTS.forEach(([text, fg, bg], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * CW, y = row * CH;
    ctx.fillStyle = bg; ctx.fillRect(x, y, CW, CH);
    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 5;
    ctx.strokeRect(x + 8, y + 8, CW - 16, CH - 16);
    ctx.fillStyle = fg;
    const fonts = ['900 62px Arial Black, Arial', '800 60px Arial', 'bold 62px Georgia', '900 58px Verdana'];
    ctx.font = fonts[i % fonts.length];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 62;
    while (ctx.measureText(text).width > CW - 50 && size > 20) {
      size -= 4; ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    }
    ctx.fillText(text, x + CW / 2, y + CH / 2 + 4);
    // wear
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`;
    ctx.fillRect(x, y + CH - 14 - rnd() * 20, CW, 10 + rnd() * 16);
  });
  overlayNoise(ctx, W, H, 0.07, 1.5);
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const uvFor = (i) => {
    const col = i % 4, row = Math.floor(i / 4);
    return { u0: col / 4, v0: 1 - (row + 1) / 8, u1: (col + 1) / 4, v1: 1 - row / 8 };
  };
  return { map, uvFor, count: SIGN_TEXTS.length };
}

// ---------------------------------------------------------------------------
// AWNING ATLAS — 8 awning fabric variants in one 1024x512 canvas (2 rows x 4)
// ---------------------------------------------------------------------------
export const AWNING_STYLES = [
  { base: '#8e2f23', stripe: null }, { base: '#28502f', stripe: '#e8e0ca' },
  { base: '#274d7a', stripe: null }, { base: '#333333', stripe: null },
  { base: '#b03a2e', stripe: '#e8dcc0' }, { base: '#c2551b', stripe: null },
  { base: '#1f4d40', stripe: null }, { base: '#5a2d52', stripe: '#d8cfd8' },
];

export function awningAtlas() {
  const W = 1024, H = 512, CW = 256, CH = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  AWNING_STYLES.forEach((s, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * CW, y = row * CH;
    ctx.fillStyle = s.base; ctx.fillRect(x, y, CW, CH);
    if (s.stripe) {
      ctx.fillStyle = s.stripe;
      for (let sx = 0; sx < CW; sx += 48) ctx.fillRect(x + sx, y, 26, CH);
    }
    // fabric shading: scallop-ish bottom + ribs
    for (let sx = 0; sx < CW; sx += 32) {
      const g = ctx.createLinearGradient(x + sx, 0, x + sx + 32, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = g; ctx.fillRect(x + sx, y, 32, CH);
    }
    const g2 = ctx.createLinearGradient(0, y, 0, y + CH);
    g2.addColorStop(0, 'rgba(255,255,255,0.10)'); g2.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g2; ctx.fillRect(x, y, CW, CH);
  });
  overlayNoise(ctx, W, H, 0.06, 1);
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const uvFor = (i) => {
    const col = i % 4, row = Math.floor(i / 4);
    return { u0: col / 4, v0: 1 - (row + 1) / 2, u1: (col + 1) / 4, v1: 1 - row / 2 };
  };
  return { map, uvFor, count: AWNING_STYLES.length };
}

// ---------------------------------------------------------------------------
// STREET SIGN ATLAS — 8 cols x 4 rows of 128x128 cells on 1024x512.
// Regulation plates, street-name blades, transit signs. Invented names only.
// ---------------------------------------------------------------------------
export const STREET_SIGNS = [
  'noparking', 'altside', 'nostanding', 'oneway', 'blade-w132', 'blade-lenox',
  'blade-bedford', 'blade-berry', 'bus', 'subway', 'dontblock', 'loading',
];
export function streetSignAtlas() {
  const W = 1024, H = 512, CW = 128, CH = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const cell = (i) => [(i % 8) * CW, Math.floor(i / 8) * CH];
  const txt = (x, y, s, px, col, font = 'Arial') => {
    ctx.fillStyle = col;
    ctx.font = `bold ${px}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  };
  // regulation plates (white bg, red/green text), drawn portrait in each cell
  const plate = (i, lines, accent = '#c81f1f') => {
    const [x, y] = cell(i);
    ctx.fillStyle = '#f2f0ea'; ctx.fillRect(x + 34, y + 6, 60, 116);
    ctx.strokeStyle = '#8a8a86'; ctx.lineWidth = 2; ctx.strokeRect(x + 35, y + 7, 58, 114);
    lines.forEach((l, li) => txt(x + 64, y + 22 + li * 16, l, l.length > 7 ? 9 : 11, li === 0 ? accent : '#222'));
  };
  plate(0, ['NO', 'PARKING', 'ANYTIME', '→']);
  plate(1, ['NO', 'PARKING', 'MON&THU', '9:30-11AM'], '#1d6a34');
  plate(2, ['NO', 'STANDING', 'EXCEPT', 'TRUCKS']);
  // one-way arrow (black bg white arrow)
  {
    const [x, y] = cell(3);
    ctx.fillStyle = '#111'; ctx.fillRect(x + 10, y + 44, 108, 40);
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 64); ctx.lineTo(x + 78, y + 64 - 12); ctx.lineTo(x + 78, y + 64 - 4);
    ctx.lineTo(x + 106, y + 64 - 4); ctx.lineTo(x + 106, y + 64 + 4); ctx.lineTo(x + 78, y + 64 + 4);
    ctx.lineTo(x + 78, y + 64 + 12); ctx.closePath(); ctx.fill();
    txt(x + 64, y + 100, 'ONE WAY', 13, '#f4f4f4');
  }
  // street name blades (green bg, white text)
  const blade = (i, name) => {
    const [x, y] = cell(i);
    ctx.fillStyle = '#1d5c38'; ctx.fillRect(x + 4, y + 46, 120, 34);
    ctx.strokeStyle = '#f0f0ea'; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y + 48, 116, 30);
    txt(x + 64, y + 63, name, 15, '#f4f2ea', 'Arial Narrow, Arial');
  };
  blade(4, 'W 132 ST'); blade(5, 'LENOX AV'); blade(6, 'BEDFORD AV'); blade(7, 'BERRY ST');
  // bus sign
  {
    const [x, y] = cell(8);
    ctx.fillStyle = '#f2f0ea'; ctx.fillRect(x + 34, y + 10, 60, 108);
    ctx.fillStyle = '#0f4c8a'; ctx.fillRect(x + 34, y + 10, 60, 34);
    txt(x + 64, y + 27, 'BUS', 16, '#fff');
    txt(x + 64, y + 62, 'M7', 20, '#0f4c8a');
    txt(x + 64, y + 92, 'STOP', 13, '#222');
  }
  // subway sign (black bar, white text + green globe dot)
  {
    const [x, y] = cell(9);
    ctx.fillStyle = '#101010'; ctx.fillRect(x + 4, y + 48, 120, 32);
    ctx.fillStyle = '#2a9548';
    ctx.beginPath(); ctx.arc(x + 20, y + 64, 10, 0, 7); ctx.fill();
    txt(x + 74, y + 64, 'SUBWAY', 15, '#f2f2ee');
  }
  plate(10, ['DONT', 'BLOCK', 'THE', 'BOX'], '#1d6a34');
  plate(11, ['TRUCK', 'LOADING', 'ONLY', '7AM-7PM']);
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const uvFor = (i) => {
    const col = i % 8, row = Math.floor(i / 8);
    return { u0: col / 8, v0: 1 - (row + 1) / 4, u1: (col + 1) / 8, v1: 1 - row / 4 };
  };
  return { map, uvFor };
}

// ---------------------------------------------------------------------------
// FILLER FACADE — baked window grid for distant context massing. 3.6m tile
// (one floor, two bays). Tinted per-instance; detail only needs to read >150m.
// ---------------------------------------------------------------------------
export function fillerFacadeTexture({ seed = 61, size = 1024, base = '#9a7a64' } = {}) {
  // 7.2m tile = 4 bays x 2 floors: a larger repeat so distant lit windows read
  // as scattered dots instead of regular rows
  const tileMeters = 7.2;
  const px = size / tileMeters;
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  // bump: windows recessed so the painted grid self-shadows at mid distance
  const bump = makeCanvas(size, size);
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#8c8c8c'; bctx.fillRect(0, 0, size, size);
  // night emissive: ~14% of bays lit, warm/cool mix, varied intensity
  const night = makeCanvas(size, size);
  const nctx = night.getContext('2d');
  nctx.fillStyle = '#000'; nctx.fillRect(0, 0, size, size);
  // faint course lines
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < size; y += 0.45 * px) ctx.fillRect(0, y, size, 1);
  // four window bays x two floors per tile
  const bays = [];
  for (const fy of [1.05, 4.65]) for (const wx of [0.35, 2.15, 3.95, 5.75]) bays.push([wx, fy]);
  for (const [wx, fy] of bays) {
    const jitter = rnd() * 0.06;
    const x = (wx + jitter) * px, y = fy * px, w = 1.1 * px, h = 1.55 * px;
    ctx.fillStyle = `hsl(${210 + rnd() * 20}, ${10 + rnd() * 14}%, ${12 + rnd() * 14}%)`;
    ctx.fillRect(x, size - y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, size - y - h, w, 2.5);                    // lintel light
    ctx.fillStyle = 'rgba(230,225,215,0.55)';
    ctx.fillRect(x - 2, size - y + 1, w + 4, 3);              // sill
    if (rnd() < 0.3) {                                        // lit/shade variety
      ctx.fillStyle = `rgba(255,220,170,${0.12 + rnd() * 0.25})`;
      ctx.fillRect(x + 2, size - y - h + 2, w - 4, h * (0.3 + rnd() * 0.6));
    }
    bctx.fillStyle = '#2a2a2a';                               // 0.08m recess
    bctx.fillRect(x, size - y - h, w, h);
    if (rnd() < 0.14) {
      const warm = rnd() < 0.8;
      const a = 0.45 + rnd() * 0.55;
      nctx.fillStyle = warm ? `rgba(255,${170 + rnd() * 50 | 0},${90 + rnd() * 60 | 0},${a})`
        : `rgba(${170 + rnd() * 40 | 0},${200 + rnd() * 30 | 0},255,${a})`;
      nctx.fillRect(x + 2, size - y - h + 2, w - 4, h - 4);
    }
  }
  overlayNoise(ctx, size, size, 0.1, 1.5);
  const map = finishTexture(c, { tileMeters });
  const bumpMap = finishTexture(bump, { srgb: false, tileMeters });
  const emissiveMap = finishTexture(night, { tileMeters });
  return { map, bumpMap, emissiveMap, tileMeters };
}

// ---------------------------------------------------------------------------
// WATER NORMAL — tileable dual-octave ripple normal map (8m tile)
// ---------------------------------------------------------------------------
export function waterNormalTexture({ size = 512, seed = 23 } = {}) {
  const tileMeters = 24;   // broad river swell; fine chop would alias at 30m+
  const rnd = localRnd(seed);
  // height field from summed sines (tileable by construction)
  const h = new Float32Array(size * size);
  const waves = [];
  for (let i = 0; i < 9; i++) {
    waves.push({
      kx: Math.round(rnd() * 6 + 1) * (rnd() < 0.5 ? -1 : 1),
      ky: Math.round(rnd() * 6 + 1) * (rnd() < 0.5 ? -1 : 1),
      amp: 0.4 / (i + 1), ph: rnd() * 6.28,
    });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const w of waves) v += w.amp * Math.sin((x / size) * w.kx * 6.283 + (y / size) * w.ky * 6.283 + w.ph);
      h[y * size + x] = v;
    }
  }
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      const nx = (l - r) * 2.5, ny = (u - d) * 2.5;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + nx * 127; img.data[i + 1] = 128 + ny * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = finishTexture(c, { srgb: false, tileMeters });
  return { map, tileMeters };
}

// ---------------------------------------------------------------------------
// GRIME STREAK — soft vertical wash for under-sill / anchor rust stains.
// Alpha fades in from the top edge and out at the bottom; tint via instance.
// ---------------------------------------------------------------------------
export function grimeStreakTexture({ size = 128, seed = 17 } = {}) {
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * size, w = 2 + rnd() * 7, len = size * (0.4 + rnd() * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.4})`);
    g.addColorStop(0.25, `rgba(255,255,255,${0.2 + rnd() * 0.2})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
  }
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return { map };
}

// ---------------------------------------------------------------------------
// RADIAL GLOW — for streetlight ground pools (additive quad)
// ---------------------------------------------------------------------------
export function radialGlowTexture({ size = 256, inner = 'rgba(255,214,150,0.55)', outer = 'rgba(255,190,120,0)' } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  // inverse-square-like falloff: a bright core with a long dim tail — a linear
  // ramp to the rim read as an airbrushed ellipse on the asphalt
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, inner);
  g.addColorStop(0.22, inner.replace('0.55', '0.3'));
  g.addColorStop(0.5, inner.replace('0.55', '0.11'));
  g.addColorStop(0.78, inner.replace('0.55', '0.03'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return { map };
}

// ---------------------------------------------------------------------------
// TREE CANOPY — soft leafy blob w/ alpha, for cross-quad billboards
// ---------------------------------------------------------------------------
export function canopyTexture({ seed = 11, size = 512, hue = 96 } = {}) {
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // clumped foliage: dark interior mass, mid clusters, bright sun-side flecks,
  // ragged silhouette with gaps — kills the "bubble cluster" read
  const clump = (cx, cy, cr, baseL, n) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = (rnd() ** 0.7) * cr;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
      const l = baseL + rnd() * 12 - 4;
      ctx.fillStyle = `hsla(${hue + (rnd() - 0.5) * 30},${30 + rnd() * 24}%,${l}%,${0.35 + rnd() * 0.5})`;
      const leaf = 1 + rnd() * 2.6;   // ~10-12cm leaves at the 512px/4m crown scale
      ctx.beginPath();
      ctx.ellipse(x, y, leaf, leaf * (0.5 + rnd() * 0.7), rnd() * 3, 0, 7);
      ctx.fill();
    }
  };
  // core dark mass
  clump(size / 2, size / 2 + size * 0.04, size * 0.34, 14, 900);
  // 5-7 sub-clumps offset around the crown
  const nC = 6;
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2 + rnd();
    clump(size / 2 + Math.cos(a) * size * 0.22, size / 2 + Math.sin(a) * size * 0.2,
      size * (0.14 + rnd() * 0.08), 22 + rnd() * 8, 420);
  }
  // sun-side highlight flecks (upper-left biased)
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI * 2, r = (rnd() ** 0.5) * size * 0.4;
    const x = size / 2 + Math.cos(a) * r - size * 0.05, y = size / 2 + Math.sin(a) * r * 0.85 - size * 0.08;
    ctx.fillStyle = `hsla(${hue - 8 + rnd() * 18},${40 + rnd() * 25}%,${38 + rnd() * 16}%,${0.3 + rnd() * 0.4})`;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + rnd() * 3, 0, 7); ctx.fill();
  }
  // punch a few sky gaps
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = (0.24 + rnd() * 0.2) * size;
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r * 0.9, 3 + rnd() * 10, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const map = finishTexture(c, { tileMeters: 1 });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return { map };
}

// Partly-cloudy deck: 5-octave value-noise FBM on a torus (tiles seamlessly).
// Alpha = cloud coverage; RGB thins from white edges to gray-blue bellies so a
// sun-colored material tint lights the edges and leaves the bellies cool.
export function cloudTexture({ size = 1024, seed = 3, coverage = 0.55 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const hash = (i, j, k) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 13.3) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const vnoise = (x, y, cx, cy, k) => {
    const gx = x * cx, gy = y * cy;
    const i = Math.floor(gx), j = Math.floor(gy);
    const fx = smooth(gx - i), fy = smooth(gy - j);
    const i1 = (i + 1) % cx, j1 = (j + 1) % cy;
    const a = hash(i, j, k), b = hash(i1, j, k), cc = hash(i, j1, k), d = hash(i1, j1, k);
    return (a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy;
  };
  const lo = 0.5 - coverage * 0.25, hi = lo + 0.24;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = 0, amp = 0.5, cells = 3, tot = 0;
      for (let o = 0; o < 5; o++) {
        // fewer cells along u on the low octaves = wind-sheared decks; INTEGER
        // cell counts on both axes keep the torus tiling seamless (a fractional
        // stretch put a hard seam across the sky every tile)
        const cx = o < 2 ? Math.max(1, Math.round(cells * 0.6)) : cells;
        n += vnoise(u, v, cx, cells, o) * amp;
        tot += amp; amp *= 0.5; cells *= 2;
      }
      n /= tot;
      let a = Math.min(1, Math.max(0, (n - lo) / (hi - lo)));
      a = a * a * (3 - 2 * a);
      const dens = Math.pow(a, 1.4);
      const o = (y * size + x) * 4;
      data[o] = Math.round(250 - dens * 92);
      data[o + 1] = Math.round(250 - dens * 84);
      data[o + 2] = Math.round(252 - dens * 66);
      data[o + 3] = Math.round(a * 235);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.tileMeters = 2800;
  return tex;
}

// Shared world-space grunge mask (multiplied into every opaque albedo by the
// material factory): low-frequency blotches + fine speckle, tileable, 7 m.
export function grungeTexture({ size = 512, seed = 19 } = {}) {
  const n = noiseCanvas(size, 5, seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.drawImage(n, 0, 0);
  // widen the contrast a touch so the mask has real dark pockets
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(n, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const map = finishTexture(c, { srgb: false, tileMeters: 7 });
  return { map, tileMeters: 7 };
}

// Street-tree bark: vertical fissured plates over a dark ground, 1 m tile
export function barkTexture({ seed = 23, size = 512 } = {}) {
  const rnd = localRnd(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b3128'; ctx.fillRect(0, 0, size, size);
  // plates: tall narrow lighter slabs with dark fissures between
  for (let i = 0; i < 260; i++) {
    const w = 6 + rnd() * 18, h = 40 + rnd() * 140;
    const x = rnd() * size, y = rnd() * size;
    const l = 26 + rnd() * 16;
    ctx.fillStyle = `hsl(${24 + rnd() * 10}, ${14 + rnd() * 10}%, ${l}%)`;
    ctx.fillRect(x, y, w, h);
    if (y + h > size) ctx.fillRect(x, y - size, w, h);   // wrap vertically
    ctx.fillStyle = 'rgba(20,14,10,0.55)';
    ctx.fillRect(x + w - 1.5, y, 2, h);
  }
  // moss/lichen at the base band + soot
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${70 + rnd() * 30},${80 + rnd() * 30},${40 + rnd() * 20},${0.08 + rnd() * 0.12})`;
    ctx.beginPath(); ctx.ellipse(rnd() * size, rnd() * size, 8 + rnd() * 26, 5 + rnd() * 14, rnd() * 3, 0, 7); ctx.fill();
  }
  overlayNoise(ctx, size, size, 0.12, 1);
  const map = finishTexture(c, { tileMeters: 1 });
  return { map, tileMeters: 1 };
}
