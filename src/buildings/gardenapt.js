// JACKSON HEIGHTS GARDEN APARTMENT — Queens co-op, 1922-1930, six storeys.
// A generous brick block (dark red iron-spot or grey-buff) on a U-plan around a
// planted court, with restrained Tudor / Italian-Renaissance dress: a limestone
// four-centred entrance arch between buttress piers, two-storey cast-stone
// window surrounds capped by a small cornice and a swag panel, diaperwork brick
// diamonds, quoined corners, round-arched openings at grade, rowlock sills, a
// corbelled brick frieze under a terracotta-coped parapet — and the signature
// street edge: a low brick curb wall carrying an iron picket fence with a
// planted strip of clipped hedge behind it.
// Refs: refs/boroughs/gardenapt-jackson-heights-*.jpg
import * as THREE from 'three';
import { at, punchedWall, shellWalls, facadeTint } from './lib.js';
import { box, boxUV, quad, cylinder, cone, compose, profileAlongX, ensureColor, tmat } from '../geo.js';
import { stoneTexture, stuccoTexture } from '../textures.js';

export const TYPE = 'gardenapt';

const q05 = (v) => Math.round(v * 20) / 20;
const q10 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// DIAPER BRICK — a true-scale brick field whose header bricks are switched to a
// contrasting burnt tone along a diagonal lattice, giving the 1920s diamond
// patterning.  Tile 2.0m so it courses with every other brick in the city.
// ---------------------------------------------------------------------------
function diaperBrickTexture({
  hue = 9, sat = 32, light = 33, dh = 6, ds = 10, dl = 8,
  accent = 'hsl(28,14%,52%)', mortar = '#a09689', lattice = 0.5, lineW = 0.085,
  plain = false, seed = 1, size = 1024, tile = 2.0,
} = {}) {
  const tileMeters = tile;
  const px = size / tileMeters;
  const bw = 0.194 * px, bh = 0.057 * px, joint = 0.010 * px;
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, size, size);
  const bump = document.createElement('canvas'); bump.width = bump.height = size;
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#5a5a5a'; bctx.fillRect(0, 0, size, size);

  const courseH = bh + joint, stride = bw + joint;
  const rows = Math.ceil(size / courseH) + 1;
  const fr = (v) => v - Math.floor(v);
  for (let r = 0; r < rows; r++) {
    const y = r * courseH;
    const offset = (r % 2) * stride * 0.5;
    for (let x = -stride; x < size + stride; x += stride) {
      const bx = x + offset;
      // world-metre centre of this brick
      const mx = (bx + bw / 2) / px, my = (y + bh / 2) / px;
      const u = mx / lattice, v = my / lattice;
      const onLat = !plain && (Math.abs(fr(u + v) - 0.5) < lineW || Math.abs(fr(u - v) - 0.5) < lineW);
      let fill;
      if (onLat) fill = accent;
      else if (rnd() < 0.028) fill = `hsl(${hue}, ${sat - 5}%, ${light - 8}%)`;
      else fill = `hsl(${(hue + (rnd() - 0.5) * dh).toFixed(1)},${clamp(sat + (rnd() - 0.5) * ds, 0, 100).toFixed(1)}%,${clamp(light + (rnd() - 0.5) * dl, 0, 100).toFixed(1)}%)`;
      ctx.fillStyle = fill;
      ctx.fillRect(bx, y, bw - joint * 0.15, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(bx, y, bw - joint * 0.15, bh * 0.15);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(bx, y + bh * 0.85, bw - joint * 0.15, bh * 0.15);
      if (rnd() < 0.28) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`;
        ctx.fillRect(bx + rnd() * bw * 0.5, y + rnd() * bh * 0.4, bw * (0.2 + rnd() * 0.35), bh * (0.3 + rnd() * 0.4));
      }
      bctx.fillStyle = `hsl(0,0%,${(onLat ? 70 : 62) + rnd() * 14}%)`;
      bctx.fillRect(bx, y, bw - joint * 0.15, bh);
    }
  }
  // weathering blotches — kills the flat "printed brick" read
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.6 ? '20,16,12' : '235,232,225'},${0.012 + rnd() * 0.032})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, size * (0.02 + rnd() * 0.10),
      size * (0.015 + rnd() * 0.07), rnd() * 3, 0, 7);
    ctx.fill();
  }
  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: mk(c, true), bumpMap: mk(bump, false), tileMeters };
}

function ensureMats(B) {
  if (B.M.has('gardenapt:brickRed')) return;
  const mk = (name, tex, opts) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, bumpMap: tex.bumpMap || null, ...opts,
    });
    m.userData.tileMeters = tex.tileMeters;
    m.name = name;
    B.M.set(name, m);
  };
  // variegated red-brown TAPESTRY brick: the per-brick scatter is the point.
  // light 21 rendered almost black-brown under flat noon light, which is well
  // below any Jackson Heights photo — 26 keeps it a deep iron-spot red while
  // leaving the mortar and the diaper accent room to read.
  // JITTER: dl 14 / ds 16 gave near-white and near-black individual bricks, so
  // at 30 m the field aliased into high-contrast confetti and read as noise
  // rather than masonry.  Tapestry brick IS variegated, but within about a
  // +/-4% luma band per brick, with the larger tonal drift coming from blend
  // patches (the weathering ellipses below) rather than brick to brick.
  mk('gardenapt:brickRed', diaperBrickTexture({
    hue: 13, sat: 28, light: 26, dh: 7, ds: 11, dl: 9,
    mortar: '#736a60', tile: 4, plain: true, seed: 201,
  }), { bumpScale: 1.35, roughness: 0.93, envMapIntensity: 0.36 });
  mk('gardenapt:brickRedDiaper', diaperBrickTexture({
    hue: 13, sat: 28, light: 26, dh: 7, ds: 11, dl: 9,
    accent: 'hsl(26,10%,40%)', mortar: '#736a60', lattice: 0.5, seed: 202,
  }), { bumpScale: 1.35, roughness: 0.93, envMapIntensity: 0.36 });
  // BUFF / tan brick.  refs/boroughs/gardenapt-jackson-heights-3456-74th-01.jpg
  // is the canonical Jackson Heights wall and it is a warm PALE buff — the old
  // hue 34 / sat 10 / light 31 was a cold mid-grey that read as concrete block.
  // light 40 + sat 18 lands on the photo without tipping into Miami sand.
  mk('gardenapt:brickTan', diaperBrickTexture({
    hue: 35, sat: 18, light: 40, dh: 5, ds: 7, dl: 8,
    mortar: '#8b8474', tile: 4, plain: true, seed: 203,
  }), { bumpScale: 1.3, roughness: 0.91, envMapIntensity: 0.34 });
  mk('gardenapt:brickTanDiaper', diaperBrickTexture({
    hue: 35, sat: 18, light: 40, dh: 5, ds: 7, dl: 8,
    accent: 'hsl(16,22%,26%)', mortar: '#8b8474', lattice: 0.5, seed: 204,
  }), { bumpScale: 1.3, roughness: 0.91, envMapIntensity: 0.34 });
  // darker base / water-table brick
  mk('gardenapt:brickBase', diaperBrickTexture({
    hue: 10, sat: 22, light: 16, dh: 5, ds: 8, dl: 8,
    mortar: '#5f584f', tile: 4, plain: true, seed: 205,
  }), { bumpScale: 1.35, roughness: 0.95, envMapIntensity: 0.35 });
  // cream cast stone — surrounds, entrance, keystones, quoins
  mk('gardenapt:caststone', stoneTexture({
    base: '#aca695', blockW: 0.72, blockH: 0.36, jointDark: 0.20, weather: 0.18, seed: 206,
  }), { roughness: 0.78, envMapIntensity: 0.45 });
  // clipped hedge / shrubs
  mk('gardenapt:foliage', stuccoTexture({ base: '#243619', blotch: 0.85, size: 512, seed: 207 }),
    { roughness: 0.98, envMapIntensity: 0.28 });
  // GLAZING — dark base colour so the sash can never wash out; the per-window
  // instance tint is a MULTIPLIER around 1.0, not an absolute colour.
  // ROUGHNESS 0.14 was the original bug behind the blown-white sashes: the GGX
  // lobe peaks at 1/(PI*alpha^2) ~= 830, so a near-head-on 4.4 sun deposited
  // tens of units of specular on the pane and one window even rendered as a
  // lens-flare blob.  0.40 killed the flare, but F*V*D was still ~0.10 against
  // an irradiance of 4.27, i.e. 0.44 of specular — more than the sunlit brick's
  // diffuse — so the sashes still came out AT OR ABOVE the wall value.
  // MeshPhysicalMaterial lets F0 come down (0.04 -> 0.014) which finally puts
  // the glass where every Jackson Heights photo has it: about half the sunlit
  // brick value (brick luma ~210, glass ~105).
  const gl = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0x414954, roughness: 0.44, metalness: 0.0,
    specularIntensity: 0.35, envMapIntensity: 0.28,
  });
  gl.userData.tileMeters = 1;
  gl.name = 'gardenapt:glaze';
  B.M.set('gardenapt:glaze', gl);
}

// opaque dark glazing pane replacing the kit's shared (too light) glass
function pPane(B, w, h, recess, frameW) {
  w = q05(w); h = q05(h);
  const id = `gardenapt:pane:${w}x${h}:${recess}`;
  if (B.hasPart(id)) return id;
  const g = quad(w - frameW - 0.02, h - frameW - 0.02);
  g.translate(0, frameW / 2 + 0.01, -recess + 0.026);
  B.definePart(id, g, 'gardenapt:glaze', { castShadow: false });
  return id;
}

// ---------------------------------------------------------------------------
// PROFILES (profileAlongX throws the profile toward LOCAL -Z: add ry = PI)
// ---------------------------------------------------------------------------
const PROF = {
  // corbelled brick frieze under the parapet — four stepped courses, 0.30 out
  corbel: [
    [0, 0], [0.05, 0.0], [0.05, 0.09], [0.12, 0.09], [0.12, 0.19], [0.21, 0.19],
    [0.21, 0.30], [0.30, 0.30], [0.30, 0.42], [0.24, 0.47], [0.26, 0.56], [0, 0.56],
  ],
  // terracotta parapet coping
  coping: [[0, 0], [0.09, 0.0], [0.11, 0.05], [0.11, 0.13], [0.06, 0.17], [0.06, 0.20], [0, 0.20]],
  // cast-stone belt / water-table cap
  belt: [[0, 0], [0.09, 0.01], [0.11, 0.07], [0.11, 0.17], [0.07, 0.22], [0.08, 0.28], [0, 0.28]],
  // small string course
  string: [[0, 0], [0.06, 0.01], [0.075, 0.05], [0.075, 0.12], [0.05, 0.16], [0.06, 0.18], [0, 0.18]],
  // modest bracketed cornice for the no-parapet seeds
  cornice: [
    [0, 0], [0.10, 0.02], [0.12, 0.10], [0.18, 0.14], [0.20, 0.26], [0.24, 0.30],
    [0.24, 0.42], [0.52, 0.54], [0.54, 0.63], [0.50, 0.70], [0.52, 0.78], [0, 0.78],
  ],
};

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

// two-storey cast-stone window surround: jambs, moulded cap, sill, swag panel
function pSurround(B, w, h, panelY) {
  w = q05(w); h = q10(h); panelY = q10(panelY);
  const id = `gardenapt:surround:${w}x${h}x${panelY}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const j = 0.28, pr = 0.09;
  for (const s of [-1, 1]) {
    const g = box(j, h, pr, { segY: 2 }); boxUV(g, j, h, pr, 2);
    items.push({ geom: g, x: s * (w / 2 + j / 2), y: 0, z: pr / 2 });
  }
  // sill band
  const sb = box(w + 2 * j + 0.24, 0.20, 0.16, { segY: 1 }); boxUV(sb, w + 2 * j + 0.24, 0.20, 0.16, 2);
  items.push({ geom: sb, x: 0, y: -0.20, z: 0.08 });
  // moulded cap: architrave + corona
  const c1 = box(w + 2 * j + 0.20, 0.15, 0.18, { segY: 1 }); boxUV(c1, w + 2 * j + 0.20, 0.15, 0.18, 2);
  items.push({ geom: c1, x: 0, y: h, z: 0.09 });
  const c2 = box(w + 2 * j + 0.46, 0.14, 0.34, { segY: 1 }); boxUV(c2, w + 2 * j + 0.46, 0.14, 0.34, 2);
  items.push({ geom: c2, x: 0, y: h + 0.15, z: 0.17 });
  const c3 = box(w + 2 * j + 0.32, 0.10, 0.24, { segY: 1 }); boxUV(c3, w + 2 * j + 0.32, 0.10, 0.24, 2);
  items.push({ geom: c3, x: 0, y: h + 0.29, z: 0.12 });
  // spandrel panel between the two floors, with a diamond-and-swag relief
  const pnH = 0.86;
  const pn = box(w + 2 * j, pnH, 0.07, { segY: 1 }); boxUV(pn, w + 2 * j, pnH, 0.07, 2);
  items.push({ geom: pn, x: 0, y: panelY, z: 0.035 });
  // relief depth: at 0.045 these read as lines scored into a flat panel and cast
  // no shadow of their own, which is the classic "printed on" ornament tell
  const dia = box(0.30, 0.30, 0.085, { segY: 1 });
  dia.rotateZ(Math.PI / 4);
  ensureColor(dia, new THREE.Color(1.06, 1.06, 1.04));
  items.push({ geom: dia, x: 0, y: panelY + pnH * 0.5, z: 0.105 });
  for (const s of [-1, 1]) {
    const sw = box(w * 0.30, 0.115, 0.075, { segY: 1 });
    ensureColor(sw, new THREE.Color(1.04, 1.04, 1.02));
    items.push({ geom: sw, x: s * (w * 0.22), y: panelY + pnH * 0.60, z: 0.10, rz: -s * 0.16 });
    items.push({ geom: box(0.11, 0.17, 0.075, { segY: 1 }), x: s * (w * 0.34), y: panelY + pnH * 0.34, z: 0.10 });
  }
  B.definePart(id, compose(items), 'gardenapt:caststone');
  return id;
}

// projecting quoin strip — alternating long/short cast-stone blocks, one storey
function pQuoin(B, h, w) {
  h = q10(h); w = q05(w);
  const id = `gardenapt:quoin:${w}x${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const ch = 0.40, pitch = ch * 2;
  for (let y = 0.03; y + ch <= h; y += pitch) {
    const g = box(w, ch, 0.075, { segY: 1 }); boxUV(g, w, ch, 0.075, 2);
    items.push({ geom: g, x: 0, y, z: 0.037 });
    const g2 = box(w * 0.6, ch, 0.075, { segY: 1 }); boxUV(g2, w * 0.6, ch, 0.075, 2);
    items.push({ geom: g2, x: -w * 0.2, y: y + ch, z: 0.037 });
  }
  if (!items.length) items.push({ geom: box(w, Math.max(0.2, h - 0.06), 0.075, { segY: 1 }), x: 0, y: 0.03, z: 0.037 });
  B.definePart(id, compose(items), 'gardenapt:caststone');
  return id;
}

// round-arch head: voussoir ring + keystone + spandrel infill, anchored at the
// springing line (y = window head), x centred on the opening.
function pArchHead(B, w, mat) {
  w = q05(w);
  const id = `gardenapt:arch:${mat}:${w}`;
  if (B.hasPart(id)) return id;
  const R = w / 2, T = 0.26;
  const items = [];
  const n = Math.max(9, Math.round((Math.PI * R) / 0.24));
  for (let i = 0; i < n; i++) {
    const a = Math.PI * ((i + 0.5) / n);
    const bwid = (Math.PI * (R + T / 2)) / n * 1.14;
    items.push({
      geom: box(bwid, T, 0.14, { segY: 1 }), rz: a - Math.PI / 2,
      x: Math.cos(a) * (R + T / 2), y: Math.sin(a) * (R + T / 2), z: 0.07,
    });
  }
  B.definePart(id, compose(items), mat);
  // keystone as its OWN cast-stone part.  Baked into the brick ring it took the
  // ring's brick tint and vanished, which left the ground-floor arcade reading
  // as faint scratches on the wall.  A pale stone key is what actually makes an
  // arch read as an arch at street distance.
  // 0.22 m of projection made it a cast-stone brick sticking out of the wall;
  // a real keystone stands only a course or so proud of the voussoir ring
  const ki = [];
  const ks = box(0.26, 0.54, 0.11, { segY: 1 }); boxUV(ks, 0.26, 0.54, 0.11, 2);
  ki.push({ geom: ks, x: 0, y: R + T - 0.17, z: 0.055 });
  B.definePart(id + ':key', compose(ki), 'gardenapt:caststone');
  // glazed lunette behind the ring (a stepped half-disc reads round at 30m)
  const g = new THREE.CircleGeometry(R - 0.02, 18, 0, Math.PI);
  g.translate(0, 0, -0.05);
  B.definePart(id + ':glass', g, 'gardenapt:glaze', { castShadow: false });
  // radiating muntins — thin, and set well back so they read as sash bars in
  // shadow rather than a white sunburst painted on the wall
  const mu = [];
  for (let i = 1; i < 4; i++) {
    const a = (Math.PI * i) / 4;
    mu.push({ geom: box(0.032, R - 0.06, 0.035, { segY: 1 }), rz: a - Math.PI / 2, x: 0, y: 0, z: -0.115 });
  }
  mu.push({ geom: box(w - 0.06, 0.045, 0.05, { segY: 1 }), x: 0, y: -0.02, z: -0.10 });
  B.definePart(id + ':muntin', compose(mu), 'windowFrame');
  return id;
}

// mullion between the lights of a three-part window
function pMullion(B, h) {
  h = q10(h);
  const id = `gardenapt:mullion:${h}`;
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.11, h, 0.10, { segY: 1 }), x: 0, y: 0, z: -0.05 });
  B.definePart(id, compose(items), 'windowFrame');
  return id;
}

// wall lantern beside the entrance
function pLantern(B) {
  const id = 'gardenapt:lantern';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.13, 0.30, 0.09, { segY: 1 }), x: 0, y: 0, z: 0.045 });
  items.push({ geom: cylinder(0.025, 0.025, 0.42, 6), x: 0, y: 0.24, z: 0.21, rx: Math.PI / 2 });
  items.push({ geom: box(0.10, 0.06, 0.10, { segY: 1 }), x: 0, y: 0.20, z: 0.44 });
  const gl = box(0.20, 0.30, 0.20, { segY: 1 });
  ensureColor(gl, new THREE.Color(1.9, 1.6, 1.05));
  items.push({ geom: gl, x: 0, y: -0.12, z: 0.44 });
  items.push({ geom: cone(0.17, 0.13, 4), x: 0, y: 0.18, z: 0.44 });
  items.push({ geom: box(0.05, 0.06, 0.05, { segY: 1 }), x: 0, y: 0.31, z: 0.44 });
  B.definePart(id, compose(items), 'ironwork');
  return id;
}

// stepped pinnacle capping a buttress pier
function pPinnacle(B) {
  const id = 'gardenapt:pinnacle';
  if (B.hasPart(id)) return id;
  const items = [];
  const g1 = box(0.42, 0.13, 0.42, { segY: 1 }); boxUV(g1, 0.42, 0.13, 0.42, 2);
  items.push({ geom: g1, x: 0, y: 0, z: 0 });
  const g2 = box(0.30, 0.30, 0.30, { segY: 1 }); boxUV(g2, 0.30, 0.30, 0.30, 2);
  items.push({ geom: g2, x: 0, y: 0.13, z: 0 });
  items.push({ geom: cone(0.21, 0.46, 4), x: 0, y: 0.42, z: 0, ry: Math.PI / 4 });
  B.definePart(id, compose(items), 'gardenapt:caststone');
  return id;
}

// clipped hedge run in the front planting strip
function pHedge(B, len) {
  len = Math.max(1, Math.round(len * 2) / 2);
  const id = `gardenapt:hedge:${len}`;
  if (B.hasPart(id)) return id;
  const items = [];
  // the base box used to be 0.58 tall and swallowed the shrub masses, so the
  // whole run read as one lumpy extruded strip.  Keep it low — just enough to
  // close the gaps at the foot — and let discrete masses make the silhouette.
  items.push({ geom: box(len, 0.30, 0.56, { segY: 1 }), x: 0, y: 0, z: 0 });
  const n = Math.max(3, Math.round(len / 0.62));
  for (let i = 0; i < n; i++) {
    // detail 2, non-uniform scale: level-0 icosahedra read as green dice
    const g = new THREE.IcosahedronGeometry(0.40 + ((i * 41) % 9) * 0.022, 2);
    g.scale(1.0 + ((i * 17) % 5) * 0.05, 0.72 + ((i * 23) % 6) * 0.05, 0.88);
    items.push({
      geom: g, x: -len / 2 + (len / n) * (i + 0.5),
      y: 0.34 + ((i * 53) % 7) * 0.030, z: ((i * 29) % 5) * 0.055 - 0.11,
    });
  }
  // a few taller shrubs breaking the clipped line
  for (let i = 0; i < Math.max(1, Math.round(len / 2.6)); i++) {
    const g = new THREE.IcosahedronGeometry(0.38, 2);
    g.scale(0.9, 1.30, 0.9);
    items.push({ geom: g, x: -len / 2 + len * ((i + 0.6) / Math.max(1, Math.round(len / 2.6))), y: 0.42, z: -0.02 });
  }
  B.definePart(id, compose(items), 'gardenapt:foliage');
  return id;
}

// terracotta window box with geraniums
function pWindowBox(B, w) {
  w = q05(w);
  const id = `gardenapt:winbox:${w}`;
  if (B.hasPart(id)) return id;
  const items = [];
  const g = box(w, 0.20, 0.24, { segY: 1 }); boxUV(g, w, 0.20, 0.24, 2);
  items.push({ geom: g, x: 0, y: 0, z: 0.13 });
  B.definePart(id, compose(items), 'terracotta');
  const f = [];
  f.push({ geom: box(w - 0.08, 0.20, 0.20, { segY: 1 }), x: 0, y: 0.19, z: 0.13 });
  B.definePart(id + ':plants', compose(f), 'gardenapt:foliage');
  return id;
}

// CRENELLATED PARAPET MERLON — the Jackson Heights skyline signature.  Every
// co-op block in refs/boroughs/gardenapt-jackson-heights-*.jpg tops out in a
// notched brick parapet: short raised blocks, three or four courses tall, with
// the coping carried over each one.  Without it the type reads as a generic
// flat-topped brick apartment house and loses half its identity at 30 m.
// Instanced (not merged) so a 26 m frontage costs one draw call, not forty.
function pMerlon(B, w, d, h, mat, capMat) {
  w = q05(w); d = q05(d); h = q05(h);
  const id = `gardenapt:merlon:${mat}:${capMat}:${w}x${d}x${h}`;
  if (B.hasPart(id)) return id;
  const g = box(w, h, d, { segY: 1 });
  boxUV(g, w, h, d, 2);
  B.definePart(id, g, mat);
  const cap = box(w + 0.10, 0.09, d + 0.10, { segY: 1 });
  boxUV(cap, w + 0.10, 0.09, d + 0.10, 2);
  cap.translate(0, h, 0);
  B.definePart(id + ':cap', cap, capMat);
  return id;
}

function pBracket(B) {
  const id = 'gardenapt:bracket';
  if (B.hasPart(id)) return id;
  const items = [];
  items.push({ geom: box(0.15, 0.42, 0.40, { segY: 1 }), x: 0, y: 0, z: 0.20 });
  items.push({ geom: box(0.21, 0.08, 0.50, { segY: 1 }), x: 0, y: 0.42, z: 0.25 });
  items.push({ geom: box(0.12, 0.16, 0.14, { segY: 1 }), x: 0, y: 0.02, z: 0.06 });
  B.definePart(id, compose(items), 'gardenapt:caststone');
  return id;
}

// ---------------------------------------------------------------------------
// FOUR-CENTRED (TUDOR) ENTRANCE ARCH — merged, one per building.
// anchor: x = centre of the opening, y = 0 at threshold, z = 0 wall face.
// ---------------------------------------------------------------------------
function tudorArchItems(openW, rise, thick) {
  const a = openW / 2;
  const items = [];
  const n = 13;
  const yOf = (u) => rise * Math.pow(1 - Math.abs(2 * u - 1), 0.55);
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    const x0 = -a + 2 * a * u0, x1 = -a + 2 * a * u1;
    const y0 = yOf(u0), y1 = yOf(u1);
    const len = Math.hypot(x1 - x0, y1 - y0) * 1.2;
    items.push({
      geom: box(len, thick, 0.30, { segY: 1 }),
      rz: Math.atan2(y1 - y0, x1 - x0),
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0.15,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// GENERATE
// ---------------------------------------------------------------------------
export function generate(ctx, lot, rng) {
  const { kit: K, batcher: B } = ctx;
  ensureMats(B);
  const F = lot.frame;

  const W = lot.width;
  const D = Math.max(13, lot.depth);
  const stories = clamp(lot.stories || rng.weighted([[5, 3], [6, 12], [7, 2]]), 4, 8);
  const corner = lot.corner | 0;
  const mir = lot.mirror ? -1 : 1;

  // ---- vertical schedule ---------------------------------------------------
  const plinth = q05(rng.range(0.75, 1.05));        // brick water table
  const story1 = q05(rng.range(3.30, 3.65));
  const floorH = q05(rng.range(2.92, 3.14));
  const floorY = (f) => (f <= 1 ? plinth : plinth + story1 + (f - 2) * floorH);
  const wallTop = floorY(stories) + floorH;
  const sillY = q05(rng.range(0.82, 0.98));
  const winH = q05(rng.range(1.62, 1.84));
  const g1WinH = q05(winH + rng.range(0.12, 0.28));

  // ---- palette -------------------------------------------------------------
  // Jackson Heights runs both ways — the tapestry-red blocks (Linden Court,
  // Chateau) and the pale buff ones (the 74th St co-ops in the refs) are both
  // everywhere, so the buff scheme is common rather than rare.
  const tanScheme = rng.bool(0.45);
  const brickMat = tanScheme ? 'gardenapt:brickTan' : 'gardenapt:brickRed';
  const diaperMat = tanScheme ? 'gardenapt:brickTanDiaper' : 'gardenapt:brickRedDiaper';
  const brickTint = facadeTint(rng);
  const stoneMat = 'gardenapt:caststone';
  // cast stone weathers grey-brown; pure white surrounds are the loudest CAD
  // tell, and at 0.88 the two-storey surrounds still read as chalk picture
  // frames pinned onto the brick rather than masonry set into it
  const stoneTint = facadeTint(rng, new THREE.Color(0.79, 0.78, 0.75));
  // 0xdedbd2 is linear-albedo 0.70: at NdotL 0.8 under a 4.4 sun that is 0.8
  // radiance BEFORE specular, so the white-framed seeds rendered their sashes
  // BRIGHTER than the brick (measured p50 204 vs a 180 wall) and the windows
  // read as pale cards stuck on the facade.  Off-white keeps the painted-frame
  // look with 40 code values of headroom.
  // White sash is what makes this type read at 30 m: it is the light grid over
  // the dark brick.  Seeds that drew the dark-brown frame lost the grid entirely
  // and scored a full point lower, so off-white now leads by a wide margin and
  // the stained-wood option survives only as a rarity.
  const frameTint = new THREE.Color(rng.weighted([
    [0xc4c0b6, 7], [0x4a3b30, 2], [0x2f3a33, 1],
  ]));
  const copingMat = rng.weighted([['terracotta', 5], [stoneMat, 3]]);
  const capStyle = 'parapet';   // corbelled brick + terracotta coping on every seed
  const quoins = rng.bool(0.55);
  const diaperBand = rng.bool(0.7);
  const archedGround = rng.bool(0.6);
  const gBase = rng.range(0.58, 0.82);          // per-building glazing value
  const glassFor = () => {
    const r = rng.next();
    // a net curtain is a mid grey seen through glass, not a white card: at 1.25
    // every curtained sash became a flat cream rectangle and the whole facade
    // read as painted-on windows
    if (r < 0.05) return new THREE.Color(1.45, 1.65, 1.95).multiplyScalar(gBase); // sky flash
    if (r < 0.20) return new THREE.Color(0.92, 0.90, 0.84).multiplyScalar(gBase); // blind / net curtain
    const j = rng.range(0.44, 0.76) * gBase;
    return new THREE.Color(j, j * rng.range(0.98, 1.05), j * rng.range(1.0, 1.1));
  };
  // 0.28 m: the Jackson Heights refs show a deep jamb shadow down one side of
  // every opening, and that shadow is the whole reason those walls read as
  // masonry at 30 m rather than as brick wallpaper with holes in it
  const RECESS = 0.28, FRAMEW = 0.06;
  const putWin = (w, h, m, lit, gTint = null) => {
    const ids = K.windowPart({ w, h, style: 'dh1', recess: RECESS, frameW: FRAMEW });
    B.addInstance(ids.id, m, frameTint);
    B.addInstance(pPane(B, w, h, RECESS, FRAMEW), m, gTint || glassFor());
    if (lit) B.addInstance(ids.litId, m, new THREE.Color(1.0, 0.86, 0.62));
  };

  // ---- U-plan court on wide lots ------------------------------------------
  const court = W >= 21.5 && rng.bool(0.82);
  const courtW = court ? q05(clamp(W * rng.range(0.30, 0.40), 6.0, 11.0)) : 0;
  const courtD = court ? q05(clamp(rng.range(6.2, 9.0), 4.0, D * 0.55)) : 0;
  const wingW = court ? (W - courtW) / 2 : W;

  // ---- bay generator: a run of bays across a wall of `len` -----------------
  const singleW = q05(rng.range(1.00, 1.16));
  const tripW = q05(rng.range(0.80, 0.95));
  const mull = 0.13;
  const tripSpan = q05(3 * tripW + 2 * mull);
  const pierMin = rng.range(0.95, 1.35);

  function layout(len, allowTriple) {
    // returns [{x, kind:'single'|'triple', span, offs:[..]}]
    const out = [];
    if (len < singleW + 1.4) return out;
    const useTriple = allowTriple && len >= tripSpan + 2 * pierMin + singleW + pierMin;
    if (useTriple) {
      // triple in the middle of the run, singles either side
      const n = clamp(Math.round((len - tripSpan - pierMin) / (singleW + pierMin)), 0, 8);
      const total = tripSpan + n * singleW;
      const gap = (len - total) / (n + 2);
      let cx = -len / 2 + gap;
      const tIdx = Math.floor(n / 2);
      for (let i = 0; i <= n; i++) {
        if (i === tIdx) {
          out.push({ x: q05(cx + tripSpan / 2), kind: 'triple', span: tripSpan, offs: [-(tripW + mull), 0, tripW + mull], w: tripW });
          cx += tripSpan + gap;
        }
        if (i < n) {
          out.push({ x: q05(cx + singleW / 2), kind: 'single', span: singleW, offs: [0], w: singleW });
          cx += singleW + gap;
        }
      }
      return out;
    }
    const n = clamp(Math.round((len - pierMin) / (singleW + pierMin)), 1, 9);
    const gap = (len - n * singleW) / (n + 1);
    for (let i = 0; i < n; i++) {
      out.push({ x: q05(-len / 2 + gap * (i + 1) + singleW * (i + 0.5)), kind: 'single', span: singleW, offs: [0], w: singleW });
    }
    return out;
  }

  // ---- entrance placement --------------------------------------------------
  const entOpenW = q05(rng.range(1.85, 2.25));
  const entRise = q05(entOpenW * 0.42);
  // the flight must actually climb the raised basement, not stop short of it
  const entStepN = Math.max(3, Math.round(plinth / 0.17));
  const stepH = 0.17;
  const entThreshold = q05(entStepN * stepH);
  const entDoorH = q05(clamp(plinth + story1 * 0.62 - entThreshold, 2.35, 3.1));

  // =========================================================================
  // WALL BUILDER — shared by the street front, the court sides and the back
  // =========================================================================
  const surroundFloors = clamp(rng.int(2, 3), 2, stories - 2);   // lowest floor of the 2-storey surround
  const surroundOn = rng.bool(0.85);
  const diaperFloor = stories - 1;                                // top storey band

  function buildWall(frame, len, opts = {}) {
    const {
      allowTriple = true, entranceX = null, ground = 'window', wallDepth = 0.42,
      grime = 0.28, faceMat = brickMat, windowBoxes = false, tintMul = 1,
    } = opts;
    const wallTint = tintMul === 1 ? brickTint : brickTint.clone().multiplyScalar(tintMul);
    const bays = layout(len, allowTriple);
    const nearEnt = (b) => entranceX !== null && Math.abs(b.x - entranceX) < (entOpenW + b.span) / 2 + 0.30;
    const surId = surroundOn ? pSurround(B, tripSpan, floorH + winH + 0.1, q10(winH + 0.22)) : null;
    const surCovers = (b, f) => surId && b.kind === 'triple'
      && (f === surroundFloors || f === surroundFloors + 1);

    const rows = [];
    const plinthTop = q05(plinth - 0.06);
    // ---- plinth band: basement lights + the lower part of the entrance ----
    const bsOps = [];
    if (plinthTop > 0.55 && ground !== 'none') {
      for (const b of bays) {
        if (nearEnt(b)) continue;
        bsOps.push({ x: b.x, w: q05(Math.min(b.span, 1.0)), y0: 0.20, y1: plinthTop - 0.06 });
      }
    }
    const entLow = entranceX !== null && entThreshold < plinthTop - 0.12;
    if (entLow) bsOps.push({ x: entranceX, w: entOpenW, y0: entThreshold, y1: plinthTop });
    bsOps.sort((a, b2) => a.x - b2.x);
    if (bsOps.length) rows.push({ y0: 0.02, y1: plinthTop, openings: bsOps });
    // BUG FIX: the basement lights were punched but never glazed — the window
    // loop below only runs f = 1..stories — so the camera looked straight
    // through the shell and they rendered as small emissive-looking white slots
    // at areaway level.  Cellar sash: dark, and grimier than anything above it.
    for (const o of bsOps) {
      if (entranceX !== null && Math.abs(o.x - entranceX) < 0.05) continue;
      const bh = q05(o.y1 - o.y0);
      if (bh < 0.4) continue;
      putWin(q05(o.w), bh, at(frame, o.x, o.y0, 0), false,
        new THREE.Color(0.19, 0.20, 0.21).multiplyScalar(rng.range(0.8, 1.2)));
    }

    for (let f = 1; f <= stories; f++) {
      const y = floorY(f);
      const h = f === 1 ? g1WinH : winH;
      const y0 = y + sillY, y1 = y0 + h;
      const ops = [];
      for (const b of bays) {
        if (f === 1 && nearEnt(b)) continue;
        for (const o of b.offs) ops.push({ x: q05(b.x + o), w: b.w, y0, y1 });
      }
      let rowY0 = y0;
      if (f === 1 && entranceX !== null) {
        rowY0 = entLow ? plinthTop : Math.max(0.04, entThreshold);
        ops.push({ x: entranceX, w: entOpenW, y0: rowY0, y1 });
      }
      ops.sort((a, b2) => a.x - b2.x);
      rows.push({ y0: rowY0, y1, openings: ops });
    }
    punchedWall(ctx, frame, {
      width: len, height: wallTop, depth: wallDepth, mat: faceMat, tint: wallTint,
      rows, grime, aoTop: wallTop,
    });

    // ---- window units, sills, trim ----
    for (let f = 1; f <= stories; f++) {
      const y = floorY(f);
      const h = f === 1 ? g1WinH : winH;
      const arch = f === 1 && archedGround;
      for (const b of bays) {
        if (f === 1 && nearEnt(b)) continue;
        for (const o of b.offs) putWin(b.w, h, at(frame, b.x + o, y + sillY, 0), rng.bool(0.34));
        if (b.kind === 'triple') {
          const mid = pMullion(B, h);
          for (const s of [-1, 1]) {
            B.addInstance(mid, at(frame, b.x + s * (tripW + mull) / 2, y + sillY, 0), frameTint);
          }
        }
        // stone dressings are RESERVED for the accents: the first storey and
        // the triple bays.  Everything else gets a plain rowlock brick sill and
        // a brick soldier-course head, so the wall reads as brick, not trim.
        const accent = f === 1 || b.kind === 'triple';
        K.sill(b.span, at(frame, b.x, y + sillY, 0),
          accent ? { mat: stoneMat, tint: stoneTint } : { mat: faceMat, tint: brickTint });
        if (arch) {
          const aid = pArchHead(B, b.span + 0.10, faceMat);
          // ring a touch darker than the field: real voussoirs sit in their own
          // shadow, and the value break is what separates the arc from the wall.
          // 0.84 was too far — it read as a hard black outline drawn on brick.
          B.addInstance(aid, at(frame, b.x, y + sillY + h + 0.02, 0),
            wallTint.clone().multiplyScalar(0.92));
          B.addInstance(aid + ':key', at(frame, b.x, y + sillY + h + 0.02, 0), stoneTint);
          B.addInstance(aid + ':glass', at(frame, b.x, y + sillY + h + 0.02, 0), glassFor());
          B.addInstance(aid + ':muntin', at(frame, b.x, y + sillY + h + 0.02, 0), frameTint);
        } else if (surCovers(b, f)) {
          if (f === surroundFloors) B.addInstance(surId, at(frame, b.x, y + sillY, 0), stoneTint);
        } else if (accent) {
          K.lintel(b.span, at(frame, b.x, y + sillY + h + 0.02, 0), { mat: stoneMat, tint: stoneTint });
        } else {
          K.lintel(b.span - 0.14, at(frame, b.x, y + sillY + h + 0.02, 0), { mat: faceMat, tint: brickTint });
        }
        if (windowBoxes && f === 1 && !arch && rng.bool(0.45)) {
          const wb = pWindowBox(B, q05(b.span * 0.9));
          B.addInstance(wb, at(frame, b.x, y + sillY - 0.20, 0));
          B.addInstance(wb + ':plants', at(frame, b.x, y + sillY - 0.20, 0), new THREE.Color(0.85, 0.5, 0.45));
        }
        // Window air-conditioners are a defining Jackson Heights texture — in
        // the refs there is a sleeve in most upper sashes.  At 30% they read as
        // stray specks; at 55% they read as an occupied co-op.  Upper floors
        // ONLY: on the ground floor, bays near the entrance and behind the
        // blind arcade have no sash to sit on, so the units floated on blank
        // brick.  Real ground-floor units are rare here anyway.
        if (f >= 2 && rng.bool(0.55)) {
          // grubby, not showroom-white
          K.acUnit(at(frame, b.x + b.offs[rng.int(0, b.offs.length - 1)], y + sillY + 0.03, 0.04),
            { tint: new THREE.Color(rng.range(0.52, 0.66), rng.range(0.53, 0.66), rng.range(0.50, 0.63)) });
        }
      }
    }
    return bays;
  }

  // =========================================================================
  // STREET FRONT
  // =========================================================================
  let entFrame = F, entX = 0;
  const streetFaces = [];          // [frame, bays] of the elevations facing the street
  if (court) {
    for (const s of [-1, 1]) {
      const wf = at(F, s * (W / 2 - wingW / 2), 0, 0);
      streetFaces.push([wf, buildWall(wf, wingW, { allowTriple: wingW > 8, windowBoxes: true })]);
    }
    // court rear wall carries the entrance
    entFrame = at(F, 0, 0, -courtD);
    entX = 0;
    buildWall(entFrame, courtW, { allowTriple: courtW > 8, entranceX: 0, grime: 0.14, tintMul: 1.14 });
    // court side walls
    for (const s of [-1, 1]) {
      const sf = at(F, s * (courtW / 2), 0, -courtD / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      buildWall(sf, courtD, { allowTriple: false, grime: 0.14, wallDepth: 0.38, tintMul: 1.14 });
    }
  } else {
    const bays = layout(W, true);
    // pick the most central bay for the entrance
    let best = bays[0], bd = 1e9;
    for (const b of bays) if (Math.abs(b.x) < bd) { bd = Math.abs(b.x); best = b; }
    entX = best ? best.x : 0;
    streetFaces.push([F, buildWall(F, W, { allowTriple: true, entranceX: entX, windowBoxes: true })]);
  }

  // ---- STREET-FRONT FIRE ESCAPE -------------------------------------------
  // Jackson Heights co-ops carry their fire escapes on the FRONT, not only in
  // the rear yard (see refs/boroughs/gardenapt-jackson-heights-3456-74th-01 and
  // -street-01): narrow black stacks over a single-window bay.  Their absence
  // was the loudest thing missing from the street elevation.
  if (rng.bool(0.6)) {
    const [feFrame, feBays] = streetFaces[rng.int(0, streetFaces.length - 1)];
    // singles only — a triple bay may carry the two-storey cast-stone surround,
    // and the surround's corona projects 0.34 straight into the balcony rail
    const cands = feBays.filter((b) => b.kind === 'single'
      && (feFrame !== F || Math.abs(b.x - entX) > entOpenW / 2 + 1.4));
    if (cands.length) {
      const b = cands[rng.int(0, cands.length - 1)];
      K.fireEscape({
        width: q05(rng.range(1.85, 2.20)), floors: stories - 1, floorH,
        firstY: floorY(2) + sillY - 0.15,
      }, at(feFrame, b.x, 0, 0.03), { tint: new THREE.Color(0x1b1a18) });
    }
  }

  // =========================================================================
  // ENTRANCE — limestone four-centred arch between buttress piers
  // =========================================================================
  {
    const EF = entFrame, ex = entX;
    const springY = q05(entThreshold + entDoorH + 0.10);
    const pierW = 0.58, pierPr = 0.50;
    const pierH = springY + entRise + 0.90;
    // steps
    for (let s = 0; s < entStepN; s++) {
      const run = (entStepN - s) * 0.33;
      B.addMerged(stoneMat, box(entOpenW + 1.7 - s * 0.14, stepH + 0.01, run),
        at(EF, ex, s * stepH, run / 2 + 0.02), { tint: stoneTint, grime: 0.3 });
    }
    // buttress piers with a battered offset near the top
    for (const s of [-1, 1]) {
      const px = ex + s * (entOpenW / 2 + 0.34 + pierW / 2);
      const g = box(pierW, pierH, pierPr, { segY: 3 }); boxUV(g, pierW, pierH, pierPr, 2);
      B.addMerged(stoneMat, g, at(EF, px, 0, pierPr / 2), { tint: stoneTint, grime: 0.26 });
      const w2 = box(pierW * 0.55, 0.30, pierPr * 0.75, { segY: 1 });
      boxUV(w2, pierW * 0.55, 0.30, pierPr * 0.75, 2);
      B.addMerged(stoneMat, w2, at(EF, px, pierH * 0.42, pierPr + 0.02), { tint: stoneTint });
      B.addInstance(pPinnacle(B), at(EF, px, pierH, pierPr / 2), stoneTint);
    }
    // the arch itself + deep reveal jambs (the shadow inside the arch is what
    // makes a real Tudor entrance read as a pavilion, not an applied plaque)
    B.addMerged(stoneMat, compose(tudorArchItems(entOpenW + 0.30, entRise, 0.36)),
      at(EF, ex, springY, 0.06), { tint: stoneTint });
    for (const s of [-1, 1]) {
      B.addMerged(stoneMat, box(0.36, springY, 0.42), at(EF, ex + s * (entOpenW / 2 + 0.18), 0, 0.21),
        { tint: stoneTint, grime: 0.26 });
    }
    // label mould + diamond frieze + cap over the arch
    const fw = entOpenW + 2 * (0.36 + pierW) + 0.7;
    B.addMerged(stoneMat, box(fw, 0.52, 0.34), at(EF, ex, springY + entRise + 0.16, 0.17), { tint: stoneTint });
    B.addMerged(stoneMat, box(fw + 0.26, 0.16, 0.50), at(EF, ex, springY + entRise + 0.68, 0.25), { tint: stoneTint });
    B.addMerged(stoneMat, box(fw + 0.12, 0.10, 0.40), at(EF, ex, springY + entRise + 0.84, 0.20), { tint: stoneTint });
    const nd = Math.max(3, Math.round(fw / 0.68));
    for (let i = 0; i < nd; i++) {
      const dg = box(0.21, 0.21, 0.09, { segY: 1 });
      dg.rotateZ(Math.PI / 4);
      ensureColor(dg, new THREE.Color(1.05, 1.05, 1.03));
      B.addMerged(stoneMat, dg, at(EF, ex - fw / 2 + (fw / nd) * (i + 0.5), springY + entRise + 0.42, 0.36),
        { tint: stoneTint, worldUV: false });
    }
    // recessed dark door with a leaded transom
    // transom: false — the kit's clear-glass transom mirrors the sky and blows
    // out to white inside a shaded reveal.  A leaded amber pane replaces it.
    K.door({ w: q05(entOpenW - 0.18), h: entDoorH, style: 'paneled', transom: false },
      at(EF, ex, entThreshold + 0.02, -0.06), { tint: new THREE.Color(0x241f1c) });
    B.addMerged('gardenapt:glaze', quad(q05(entOpenW - 0.34), 0.42),
      at(EF, ex, entThreshold + 0.02 + entDoorH - 0.54, -0.37),
      { tint: new THREE.Color(1.45, 1.25, 0.92), worldUV: false });
    B.addMerged('doorPaint', box(q05(entOpenW - 0.18), 0.09, 0.08),
      at(EF, ex, entThreshold + 0.02 + entDoorH - 0.60, -0.37),
      { tint: new THREE.Color(0.18, 0.15, 0.12), worldUV: false });
    for (const s of [-1, 1]) {
      B.addInstance(pLantern(B), at(EF, ex + s * (entOpenW / 2 + 0.68), entThreshold + 1.95, 0.30));
    }
  }

  // =========================================================================
  // BELT COURSES / QUOINS / DIAPER BAND / CORNICE
  // =========================================================================
  // [frame, length, allowTriple] of every "outside" elevation we dress.
  // allowTriple must MATCH the buildWall call for that face so the pier panels
  // below land between the same bays the windows were punched from.
  const faces = [];
  if (court) {
    for (const s of [-1, 1]) faces.push([at(F, s * (W / 2 - wingW / 2), 0, 0), wingW, wingW > 8]);
    faces.push([at(F, 0, 0, -courtD), courtW, courtW > 8]);
    for (const s of [-1, 1]) {
      faces.push([at(F, s * (courtW / 2), 0, -courtD / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2), courtD, false]);
    }
  } else {
    faces.push([F, W, true]);
  }
  if (corner) {
    faces.push([at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2), D, D > 12]);
  }

  // ---- VERTICAL PATTERNED-BRICK PIER PANELS -------------------------------
  // The Jackson Heights wall is never a plain field: every pier between window
  // columns carries a slightly proud strip of diaper/basketweave brick running
  // the height of the block (see refs/boroughs/gardenapt-jackson-heights-
  // 3456-74th-01.jpg).  Without them the elevation reads as a flat brick sheet
  // with holes punched in it, which was the weakest thing about the no-court
  // seeds.  One merged box per pier — cheap, and it does most of the work of
  // giving the facade a vertical rhythm.
  {
    const py0 = q05(plinth + 0.14);
    const py1 = q05(floorY(stories) - 0.44);
    if (py1 - py0 > 1.2) {
      for (const [frame, len, allowTriple] of faces) {
        const fb = layout(len, allowTriple);
        for (let i = 0; i + 1 < fb.length; i++) {
          const a = fb[i].x + fb[i].span / 2;
          const b = fb[i + 1].x - fb[i + 1].span / 2;
          // 0.35 m clear of each opening: the two-storey cast-stone surround
          // throws jambs 0.28 past its bay edge and must not be fouled
          const pw = q05(clamp((b - a) - 0.70, 0, 0.90));
          if (pw < 0.28) continue;
          const g = box(pw, py1 - py0, 0.045, { segY: 2 });
          B.addMerged(diaperMat, g, at(frame, q05((a + b) / 2), py0, 0.0225),
            { tint: brickTint, grime: 0.24 });
        }
      }
    }
  }

  const FP = (frame, len, y, name, mat, tint) => {
    B.addMerged(mat, profileAlongX(PROF[name], len), at(frame, 0, y, 0, Math.PI), { tint });
  };
  const bandY = q05(plinth - 0.06);
  const diaperY0 = floorY(diaperFloor) + sillY + winH + 0.35;
  for (const [frame, len] of faces) {
    // water-table cap
    FP(frame, len + 0.02, bandY, 'belt', stoneMat, stoneTint);
    // string course under the top floor
    if (rng.bool(0.8)) FP(frame, len + 0.02, floorY(stories) - 0.30, 'string', stoneMat, stoneTint);
    // corbelled brick frieze + coping (or a modest cornice)
    if (capStyle === 'parapet') {
      FP(frame, len + 0.04, wallTop - 0.50, 'corbel', brickMat, brickTint);
    } else {
      FP(frame, len + 0.16, wallTop - 0.78, 'cornice', stoneMat, stoneTint);
      const bid = pBracket(B);
      const n = Math.max(3, Math.round(len / 1.9));
      for (let i = 0; i <= n; i++) {
        B.addInstance(bid, at(frame, -len / 2 + (len / n) * i, wallTop - 0.72, 0.05), stoneTint);
      }
    }
  }
  // quoins only at the two real street corners of the block, never on every
  // internal court return (that reads as CG wallpaper)
  if (quoins) {
    const qw = 0.52;
    const qf = court ? [
      [at(F, -(W / 2 - wingW / 2), 0, 0), wingW, -1],
      [at(F, (W / 2 - wingW / 2), 0, 0), wingW, 1],
    ] : [[F, W, -1], [F, W, 1]];
    for (const [frame, len, s] of qf) {
      for (let f = 1; f <= stories; f++) {
        const qid = pQuoin(B, (f === 1 ? story1 : floorH) - 0.10, qw);
        B.addInstance(qid, at(frame, s * (len / 2 - qw / 2 - 0.02), floorY(f) + 0.05, 0.0), stoneTint);
      }
    }
  }

  // diaper panels: a band of patterned brick over the top storey, laid as flush
  // panels between the windows so the diamonds read against the plain field
  if (diaperBand) {
    for (const [frame, len] of faces) {
      const h = q05(clamp(floorY(stories) - diaperY0 + winH * 0.2, 0.7, 1.9));
      if (h < 0.5) continue;
      const g = box(len - 0.2, h, 0.06, { segY: 1 });
      B.addMerged(diaperMat, g, at(frame, 0, diaperY0, 0.03), { tint: brickTint });
    }
  }

  // =========================================================================
  // FRONT GARDEN — low brick curb wall, iron picket fence, hedge, soil
  // =========================================================================
  {
    const gd = q05(rng.range(1.35, 1.95));            // strip depth
    const curbH = 0.46;
    const gateW = 2.4;
    const gateX = court ? 0 : entX;
    const runs = [];
    if (court) {
      // planting fills the court + the two wing frontages
      runs.push([-W / 2, -gateW / 2 - 0.2], [gateW / 2 + 0.2, W / 2]);
    } else {
      runs.push([-W / 2, gateX - gateW / 2], [gateX + gateW / 2, W / 2]);
    }
    for (const [x0, x1] of runs) {
      const len = x1 - x0;
      if (len < 0.9) continue;
      const cx = (x0 + x1) / 2;
      const cw = box(len, curbH, 0.24, { segY: 1 }); boxUV(cw, len, curbH, 0.24, 2);
      B.addMerged('gardenapt:brickBase', cw, at(F, cx, 0.14, gd), { tint: brickTint, grime: 0.3 });
      const cap = box(len + 0.05, 0.08, 0.32, { segY: 1 }); boxUV(cap, len + 0.05, 0.08, 0.32, 2);
      B.addMerged(stoneMat, cap, at(F, cx, 0.14 + curbH, gd),
        { tint: new THREE.Color(0.80, 0.81, 0.80) });   // bluestone, not cast stone
      // soil bed behind the curb
      B.addMerged('soil', box(len, 0.26, gd - 0.12), at(F, cx, 0.14, (gd - 0.12) / 2),
        { tint: new THREE.Color(0.8, 0.75, 0.7), worldUV: false });
      // iron fence on the curb
      K.fence(len, at(F, cx, 0.14 + curbH + 0.07, gd));
      // hedge run
      const hid = pHedge(B, Math.min(len - 0.2, 5.5));
      const nH = Math.max(1, Math.round(len / 5.5));
      for (let i = 0; i < nH; i++) {
        B.addInstance(hid, at(F, x0 + (len / nH) * (i + 0.5), 0.38, gd * 0.45),
          new THREE.Color().setHSL(0.26, rng.range(0.24, 0.42), rng.range(0.26, 0.40)));
      }
    }
    // path to the entrance — flush bluestone, NOT a raised plank
    const pf = court ? -courtD : 0;
    B.addMerged(stoneMat, box(gateW, 0.035, gd - pf + 0.4),
      at(F, gateX, 0.145, pf + (gd - pf + 0.4) / 2 - 0.2),
      { tint: stoneTint.clone().multiplyScalar(0.74), grime: 0.4 });

    // COURT LAWN.  The whole point of a "garden apartment" is the planted court
    // and it was an empty paved slot — just a walk between two blank returns.
    // Two raised lawn panels either side of the axis walk, with shrub masses
    // against the court returns, is what every Jackson Heights court has.
    if (court) {
      const lawnD = gd + courtD - 0.5;
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -courtW / 2 + 0.35 : gateW / 2 + 0.30;
        const x1 = s < 0 ? -gateW / 2 - 0.30 : courtW / 2 - 0.35;
        const lw = x1 - x0;
        if (lw < 0.8 || lawnD < 1.2) continue;
        B.addMerged('gardenapt:foliage', box(lw, 0.15, lawnD),
          at(F, (x0 + x1) / 2, 0.14, gd - 0.25),
          { tint: new THREE.Color(0.72, 0.92, 0.66), worldUV: false });
        // low kerb round the lawn so it reads as a raised bed, not painted grass
        B.addMerged(stoneMat, box(lw + 0.10, 0.06, 0.14),
          at(F, (x0 + x1) / 2, 0.20, gd - 0.25), { tint: new THREE.Color(0.78, 0.79, 0.78) });
        const hid2 = pHedge(B, Math.min(lw - 0.2, 3.2));
        B.addInstance(hid2, at(F, (x0 + x1) / 2, 0.28, -courtD + 1.1),
          new THREE.Color().setHSL(0.27, rng.range(0.26, 0.44), rng.range(0.22, 0.34)));
      }
    }
  }

  // =========================================================================
  // SIDE / REAR SHELL + ROOF
  // =========================================================================
  let sideRows = { left: null, right: null };
  if (corner) {
    const cf = at(F, corner * (W / 2), 0, -D / 2, corner < 0 ? -Math.PI / 2 : Math.PI / 2);
    const cb = layout(D, D > 12);
    const rws = [];
    for (let f = 1; f <= stories; f++) {
      const y = floorY(f) + sillY;
      const h = f === 1 ? g1WinH : winH;
      const ops = [];
      for (const b of cb) for (const o of b.offs) ops.push({ x: q05(b.x + o), w: b.w });
      ops.sort((a, b2) => a.x - b2.x);
      rws.push({ y0: y, y1: y + h, openings: ops });
      for (const b of cb) {
        for (const o of b.offs) putWin(b.w, h, at(cf, b.x + o, y, 0), rng.bool(0.34));
        K.sill(b.span, at(cf, b.x, y, 0), { mat: stoneMat, tint: stoneTint });
        K.lintel(b.span, at(cf, b.x, y + h + 0.02, 0), { mat: stoneMat, tint: stoneTint });
      }
    }
    sideRows = corner < 0 ? { left: rws, right: null } : { left: null, right: rws };
  }
  const rearXs = [];
  {
    const n = clamp(Math.round(W / 4.0), 2, 6);
    for (let i = 0; i < n; i++) rearXs.push(q05(-W / 2 + (W / (n + 1)) * (i + 1)));
  }
  const rearRows = [];
  for (let f = 1; f <= stories; f++) {
    const y = floorY(f) + sillY;
    rearRows.push({ y0: y, y1: y + winH, openings: rearXs.map((x) => ({ x, w: 1.0 })) });
  }
  shellWalls(ctx, F, {
    width: W, depth: D, height: wallTop, mat: brickMat, tint: brickTint,
    wallT: 0.34, rearRows, rearMat: brickMat, sideRows,
  });
  for (let f = 1; f <= stories; f++) {
    const y = floorY(f) + sillY;
    for (const x of rearXs) putWin(1.0, winH, at(F, -x, y, -D, Math.PI), rng.bool(0.2));
  }

  // ---- roof deck + parapet (built by hand so the court stays open) ---------
  const parapetH = capStyle === 'parapet' ? q05(rng.range(0.85, 1.15)) : q05(rng.range(0.35, 0.55));
  const roofMat = rng.pick(['roofSilver', 'roofBlack']);
  const deck = (cx, cz, w, d) => {
    B.addMerged(roofMat, box(w, 0.12, d, { segY: 1 }), at(F, cx, wallTop - 0.12, cz - d / 2));
  };
  // crenellation: only the elevations that are actually seen from the street
  // get merlons.  Notching the rear and party-wall parapets too would read as
  // CG wallpaper (and nobody paid a mason to castellate a lot line).
  const crenel = rng.bool(0.92);
  const merW = q05(rng.range(0.62, 0.86));
  const merH = q05(rng.range(0.22, 0.34));
  const merPitch = merW + q05(rng.range(0.50, 0.78));
  const para = (cx, cz, w, d, notch = false) => {
    const g = box(w, parapetH, d, { segY: 1 });
    B.addMerged(brickMat, g, at(F, cx, wallTop, cz), { tint: brickTint });
    const cap = box(w + 0.10, 0.09, d + 0.10, { segY: 1 });
    boxUV(cap, w + 0.10, 0.09, d + 0.10, 2);
    B.addMerged(copingMat, cap, at(F, cx, wallTop + parapetH, cz), { tint: stoneTint });
    if (!notch || !crenel) return;
    // A crenellated parapet must START and END on a full merlon at the building
    // corners — a run that stops on a half-merlon (or short of the party wall)
    // is the giveaway that it was tiled rather than built.  So solve the pitch
    // FROM the wall length instead of centring a fixed pitch inside it.
    const n = Math.max(2, Math.round((w - merW) / merPitch) + 1);
    if (n < 2) return;
    const step = (w - merW) / (n - 1);
    if (step < merW + 0.22) return;         // would leave no gap between blocks
    const mid = pMerlon(B, merW, d + 0.12, merH, brickMat, copingMat);
    const y0 = wallTop + parapetH + 0.09;
    for (let i = 0; i < n; i++) {
      const mx = q05(cx - w / 2 + merW / 2 + step * i);
      B.addInstance(mid, at(F, mx, y0, cz), brickTint);
      B.addInstance(mid + ':cap', at(F, mx, y0, cz), stoneTint);
    }
  };
  const wallT = 0.30;
  if (court) {
    deck(0, -courtD, W - 0.1, D - courtD - 0.1);
    for (const s of [-1, 1]) deck(s * (W / 2 - wingW / 2), 0, wingW - 0.05, courtD);
    for (const s of [-1, 1]) {
      para(s * (W / 2 - wingW / 2), -wallT / 2, wingW, wallT, true);               // wing fronts
      para(s * (courtW / 2 + wallT / 2), -courtD / 2, wallT, courtD);              // court sides
    }
    para(0, -courtD + wallT / 2, courtW + wallT * 2, wallT, true);                 // court rear
  } else {
    deck(0, 0, W - 0.1, D - 0.1);
    para(0, -wallT / 2, W, wallT, true);
  }
  para(0, -D + wallT / 2, W, wallT);
  for (const s of [-1, 1]) para(s * (W / 2 - wallT / 2), -D / 2, wallT, D);
  // corner lots: carry the notched parapet round onto the exposed flank, since
  // that elevation is a real street front (merlons run along Z, so rotate 90°)
  if (corner && crenel) {
    const n = Math.max(2, Math.floor((D - 0.30) / merPitch));
    if (n >= 2) {
      const span = n * merPitch - (merPitch - merW);
      const mid = pMerlon(B, merW, wallT + 0.10, merH, brickMat, copingMat);
      const y0 = wallTop + parapetH + 0.09;
      const cx = corner * (W / 2 - wallT / 2);
      for (let i = 0; i < n; i++) {
        const mz = -D / 2 - span / 2 + merW / 2 + merPitch * i;
        B.addInstance(mid, at(F, cx, y0, mz, Math.PI / 2), brickTint);
        B.addInstance(mid + ':cap', at(F, cx, y0, mz, Math.PI / 2), stoneTint);
      }
    }
  }

  // ---- roof gear -----------------------------------------------------------
  {
    const rz = court ? -courtD : 0;
    const rd = D - (court ? courtD : 0);
    const h2 = (v) => Math.round(v * 2) / 2;
    K.bulkhead(at(F, rng.range(-W * 0.22, W * 0.22), wallTop, rz - rd * rng.range(0.35, 0.55)), {
      w: h2(rng.range(2.8, 3.8)), d: h2(rng.range(2.4, 3.2)), h: h2(rng.range(2.6, 3.4)),
      mat: brickMat, tint: brickTint,
    });
    // chimneys must clear the parapet + coping to read from the street
    for (let i = 0; i < rng.int(2, 4); i++) {
      K.chimney(at(F, rng.range(-W * 0.44, W * 0.44), wallTop + 0.05, rz - rd * rng.range(0.2, 0.85)), {
        w: q05(rng.range(0.80, 1.20)), h: h2(rng.range(2.6, 4.0)), mat: brickMat,
      });
    }
    // NO WATER TANK.  A six-storey Jackson Heights co-op is under the 6-storey
    // gravity-feed threshold and none of the reference blocks carries a wooden
    // tank — it was a straight type error and it dominated the silhouette.
    // Roof antennas and a satellite dish or two are what these roofs have.
    for (let i = 0; i < rng.int(1, 3); i++) {
      K.antenna(at(F, rng.range(-W * 0.38, W * 0.38), wallTop, rz - rd * rng.range(0.25, 0.7)));
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      K.vent(at(F, rng.range(-W * 0.42, W * 0.42), wallTop, rz - rd * rng.range(0.2, 0.9)), {
        kind: rng.pick(['pipe', 'pipe', 'goose', 'whirly']),
      });
    }
  }

  // rear-yard fire escape on the court elevation of some seeds
  if (court && rng.bool(0.5)) {
    const s = rng.bool() ? -1 : 1;
    const sf = at(F, s * (courtW / 2), 0, -courtD / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    K.fireEscape({
      width: 3.0, floors: stories - 1, floorH, firstY: floorY(2) + sillY - 0.15,
    }, at(sf, 0, 0, 0.02), { tint: new THREE.Color(0x1a1917) });
  }

  return { height: wallTop + parapetH + 0.1 };
}
