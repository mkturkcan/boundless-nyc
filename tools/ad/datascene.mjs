// AD VIDEO — the DATA SCENE: "this city was built from public records".
//
// A ~12 s sequence that draws the SOURCE layers as vector map overlays in the
// EXACT projection of the `fStreetGeom` nadir framing (125th & Lenox, 120 m),
// layer by layer with a source caption each, and holds the finished map so the
// cut can cross-dissolve it into the rendered clip of the same view.
//
// The point of the scene is the registration: when the drawing dissolves and
// the render underneath has the kerbs, the crossings and the bus lanes in the
// same places, the claim "accurate to the lot line" is made by the picture and
// not by a caption. So the projection here is not an approximation — it is the
// same perspective camera `PathCam` builds from the shot's key 0 (src/main.js:
// yaw/pitch from the look vector, no roll, three's 66 deg vertical FOV), with
// the ground taken as the plane the shot's terrain-relative altitudes are
// measured from.
//
//   node tools/ad/mapdata.mjs        # first: cut the data out of data/raw
//   node tools/ad/datascene.mjs      # -> shots/ad/data/frame_%05d.jpg + data.mp4
//   node tools/ad/datascene.mjs --still 9.5      # one PNG at t = 9.5 s (proofing)
//
// Software raster in Chromium (no GPU), so it never contends for the GPU lock.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d; };
const has = (n) => args.includes('--' + n);

const FPS = Number(opt('fps', '30'));
const W = 1920, H = 1080;
const DUR = Number(opt('dur', '12'));
const outDir = path.resolve(root, opt('out', 'boundlessjs/shots/ad/data'));

const MAP = JSON.parse(await fs.readFile(path.join(root, 'boundlessjs/shots/ad/mapdata.json'), 'utf8'));
const N = MAP.meta.counts;

// ---- DART palette (docs/notes/ad-video.md), same as the closing deck --------
const C = {
  WHITE: '236,236,236', BLUE: '88,196,221', YELLOW: '247,214,98', GREEN: '131,193,103',
  RED: '252,98,85', TEAL: '94,210,188', ORANGE: '245,160,80', GREY: '150,150,150',
};

// Inter (SIL OFL, boundlessjs/public/fonts, shared with the perception panel): owner review 2026-09-24 asked
// for a professional face on glass boxes in place of the Lato captions
const FONTS = [400, 500, 600, 700].map((wt) => [wt, path.join(root, 'boundlessjs', 'public', 'fonts', `Inter-${wt}.ttf`)]);
let faces = '';
for (const [wt, f] of FONTS) {
  try {
    const b64 = (await fs.readFile(f)).toString('base64');
    faces += `@font-face{font-family:'InterAd';font-weight:${wt};font-style:normal;font-display:block;src:url(data:font/ttf;base64,${b64}) format('truetype')}\n`;
  } catch { console.log('MISSING FONT', f); }
}

// ---------------------------------------------------------------- the script
// Each layer gets an in-time and a source caption. The captions stack in the
// lower left as a legend that BUILDS — a reader can still see, at the end,
// every dataset the frame is made of.
const nf = (v) => v.toLocaleString('en-US');
// Captions say plainly what each layer is and where it comes from (owner
// review 2026-09-24: no slogan headings, no dataset jargon on screen)
const LAYERS = [
  { id: 'grid',    t: 0.45, key: 'GRID',        color: 'GREY',   cap: null },
  { id: 'streets', t: 0.95, key: 'CENTERLINES', color: 'BLUE',
    cap: 'Street Centerlines', sub: `${N.streets} street segments in view, from the NYC street centerline map` },
  { id: 'roadbed', t: 2.15, key: 'ROADWAY',     color: 'BLUE',
    cap: 'Roadway Width, Lanes and Direction', sub: 'recorded for every street segment' },
  { id: 'foot',    t: 3.35, key: 'FOOTPRINTS',  color: 'TEAL',
    cap: 'Building Footprints', sub: `${N.footprints} in view and ${nf(930787)} across the city` },
  { id: 'pluto',   t: 4.65, key: 'LOT RECORD',  color: 'YELLOW',
    cap: 'Tax Lot Records', sub: `floor count, year built and building type for ${nf(MAP.meta.plutoRows)} lots` },
  { id: 'bus',     t: 5.85, key: 'BUS LANES',   color: 'RED',
    cap: 'Bus Lanes', sub: `${N.buslanes} segments in view, curbside from 7 to 10 AM on weekdays` },
  { id: 'trees',   t: 6.85, key: 'STREET TREES', color: 'GREEN',
    cap: 'Street Trees', sub: `${N.trees} in view, from the 2015 census of about 550,000 city trees` },
  { id: 'hyd',     t: 7.70, key: 'HYDRANTS',    color: 'ORANGE',
    cap: 'Fire Hydrants', sub: `${N.hydrants} in view and about 95,000 across the city` },
  { id: 'sig',     t: 8.50, key: 'SIGNALS',     color: 'ORANGE',
    cap: 'Traffic Signals', sub: `${N.signals} signalized intersections in view, derived from the street network` },
];
const T_HEAD = 9.45;        // the claim
const T_FADE = DUR - 1.35;  // annotation clears so the map can dissolve into the render

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0e0f11}
canvas{display:block}
</style></head><body><canvas id="cv" width="${W}" height="${H}"></canvas>
<script>
const W = ${W}, H = ${H};
const MAP = ${JSON.stringify(MAP)};
const C = ${JSON.stringify(C)};
const LAYERS = ${JSON.stringify(LAYERS)};
const T_HEAD = ${T_HEAD}, T_FADE = ${T_FADE}, DUR = ${DUR};
const FT = 0.3048;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const rgba = (k, a) => 'rgba(' + C[k] + ',' + a + ')';

// ---- projection: src/shared/geo.js project(), then the PathCam camera --------
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];

const CAM = MAP.meta.camera;
const [cx, cz] = project(CAM.p[0], CAM.p[1]);
const [lx, lz] = project(CAM.look[0], CAM.look[1]);
// terrain-relative altitudes: in the local ground frame the plane is y = 0,
// the camera is CAM.p[2] up and the look target CAM.look[2] up
const eye = [cx, CAM.p[2], cz], tgt = [lx, CAM.look[2], lz];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const FWD = norm(sub(tgt, eye));
const RIGHT = norm(cross(FWD, [0, 1, 0]));   // PathCam has no roll: world up
const UP = cross(RIGHT, FWD);
const TAN = Math.tan((CAM.fovY * Math.PI) / 180 / 2), ASP = CAM.aspect;
// world point (x, y, z) -> screen px, or null behind the lens
function toScreen(x, y, z) {
  const d = [x - eye[0], y - eye[1], z - eye[2]];
  const vz = dot(d, FWD);
  if (vz < 0.5) return null;
  const vx = dot(d, RIGHT), vy = dot(d, UP);
  return [((vx / (vz * TAN * ASP)) * 0.5 + 0.5) * W, (0.5 - (vy / (vz * TAN)) * 0.5) * H, vz];
}
const ll = (p) => { const [x, z] = project(p[0], p[1]); return toScreen(x, 0, z); };
// metres -> pixels at a ground point (for tree dots and the scale bar)
function pxPerM(x, z) {
  const a = toScreen(x, 0, z), b = toScreen(x + 1, 0, z);
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1;
}

// ---- geometry prep, once ----------------------------------------------------
const S = { streets: [], ribbons: [], foots: [], bus: [], trees: [], hyd: [], sig: [] };
for (const s of MAP.streets) {
  for (const ln of s.lines) {
    const pts = ln.map(ll).filter(Boolean);
    if (pts.length > 1) S.streets.push({ pts, s });
    // curb-to-curb ribbon: offset the centreline in WORLD metres, then project,
    // so the width narrows correctly with distance instead of being a fat stroke
    const w = ((s.w || (s.rw === 2 ? 60 : 30)) * FT) / 2;
    const wp = ln.map((p) => project(p[0], p[1]));
    if (wp.length > 1 && w > 1) {
      const L = [], R = [];
      for (let i = 0; i < wp.length; i++) {
        const a = wp[Math.max(0, i - 1)], b = wp[Math.min(wp.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l * w, nz = dx / l * w;
        L.push(toScreen(wp[i][0] + nx, 0, wp[i][1] + nz));
        R.push(toScreen(wp[i][0] - nx, 0, wp[i][1] - nz));
      }
      if (L.every(Boolean) && R.every(Boolean)) S.ribbons.push({ poly: L.concat(R.reverse()), s });
    }
  }
}
for (const f of MAP.footprints) {
  const rings = f.rings.map((r) => r.map(ll)).filter((r) => r.every(Boolean) && r.length > 2);
  if (rings.length) S.foots.push({ rings, f });
}
// DOT publishes a bus lane as a LION segment centreline plus its lane_type. Every
// one in this window is "Curbside", and that is where compile.mjs paints the red
// lane, so the drawing puts it there too: the segment offset to each kerb by
// half the CSCL width of the street it runs down. A centre stripe would be the
// same record drawn in a place the city does not put buses.
{
  const widx = [];
  for (const s of MAP.streets) for (const ln of s.lines) for (const p of ln) {
    widx.push([...project(p[0], p[1]), (s.w || (s.rw === 2 ? 60 : 30)) * FT]);
  }
  const widthAt = (x, z) => {
    let best = 1e9, w = 12;
    for (const e of widx) { const d = (e[0] - x) ** 2 + (e[1] - z) ** 2; if (d < best) { best = d; w = e[2]; } }
    return best < 900 ? w : 12;      // within 30 m, else a default street
  };
  for (const b of MAP.buslanes) for (const ln of b.lines) {
    const wp = ln.map((p) => project(p[0], p[1]));
    if (wp.length < 2) continue;
    // ONE width for the whole segment: sampling per vertex kinks the offset
    // where two DOT segments meet at a junction
    const ws = wp.map((p) => widthAt(p[0], p[1])).sort((a, c) => a - c);
    const off0 = Math.max(2, ws[ws.length >> 1] / 2 - 1.8);
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i < wp.length; i++) {
        const a = wp[Math.max(0, i - 1)], c = wp[Math.min(wp.length - 1, i + 1)];
        const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const off = off0 * side;
        const q = toScreen(wp[i][0] + (-dz / l) * off, 0, wp[i][1] + (dx / l) * off);
        if (q) pts.push(q);
      }
      if (pts.length > 1) S.bus.push({ pts, b });
    }
  }
}
for (const t of MAP.trees) { const p = ll(t.p); if (p) S.trees.push({ p, r: Math.max(1.6, pxPerM(...project(t.p[0], t.p[1]).map((v, i) => (i ? v : v))) * 0.9), t }); }
for (const h of MAP.hydrants) { const p = ll(h); if (p) S.hyd.push(p); }
for (const n of MAP.nodes) { const p = ll(n.p); if (p) S.sig.push({ p, n }); }
// biggest lots first: the PLUTO callouts should land on buildings you can see
S.callouts = S.foots
  .filter((o) => o.f.pluto && o.f.pluto.fl && o.f.pluto.yr)
  .map((o) => { const c = o.rings[0].reduce((a, p) => [a[0] + p[0] / o.rings[0].length, a[1] + p[1] / o.rings[0].length], [0, 0]); return { ...o, c }; })
  .filter((o) => o.c[0] > 200 && o.c[0] < W - 380 && o.c[1] > 140 && o.c[1] < H - 300)
  .sort((a, b) => (b.f.pluto.area || 0) - (a.f.pluto.area || 0))
  .slice(0, 7);

const cv = document.getElementById('cv'), g = cv.getContext('2d');
const path2 = (pts, close) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (close) g.closePath(); };
const A = {};   // per-layer alpha for the current frame

// ---- the type system (owner review 2026-09-24): every piece of text sits on
// a rounded, half-transparent black GLASS box (the map behind it, blurred and
// darkened, with a hairline edge), set in Inter. Boxes are sized from the
// measured text and clip it, so no text can ever leave its box.
const FONT = 'InterAd, sans-serif';
const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
function glass(x, y, w, h, r = 16, fill = 'rgba(7,9,12,0.60)') {
  g.save();
  rr(x, y, w, h, r); g.clip();
  const m = 36;
  g.filter = 'blur(14px)';
  g.drawImage(cv, x - m, y - m, w + 2 * m, h + 2 * m, x - m, y - m, w + 2 * m, h + 2 * m);
  g.filter = 'none';
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.restore();
  g.save();
  rr(x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.stroke();
  g.restore();
}
function wrapLines(text, font, maxW, spacing = '0px') {
  g.font = font; g.letterSpacing = spacing;
  const out = []; let line = '';
  for (const w of String(text).split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (!line || g.measureText(t).width <= maxW) line = t; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  g.letterSpacing = '0px';
  return out;
}
// a block of text runs: [{ text, font, color, size, lh, spacing, gapBefore }].
// Measures, sizes the glass box to fit (up to maxW), draws, clips.
function textBox(x, y, runs, o = {}) {
  const px = o.px ?? 26, py = o.py ?? 22, maxW = o.maxW ?? 900, r = o.r ?? 18;
  const laid = runs.map((R) => ({ ...R, lines: wrapLines(R.text, R.font, maxW - 2 * px, R.spacing || '0px') }));
  let tw = 0, th = 0;
  for (const R of laid) {
    g.font = R.font; g.letterSpacing = R.spacing || '0px';
    for (const l of R.lines) tw = Math.max(tw, g.measureText(l).width);
    th += (R.gapBefore || 0) + R.lines.length * R.lh;
  }
  g.letterSpacing = '0px';
  const w = Math.min(maxW, Math.ceil(tw) + 2 * px), h = Math.ceil(th) + 2 * py;
  const bx = o.alignRight ? x - w : x;
  if (o.measure) return { x: bx, y, w, h };
  glass(bx, y, w, h, r);
  g.save();
  rr(bx, y, w, h, r); g.clip();
  let ty = y + py;
  g.globalAlpha *= o.textAlpha ?? 1;
  for (const R of laid) {
    ty += R.gapBefore || 0;
    g.font = R.font; g.fillStyle = R.color; g.letterSpacing = R.spacing || '0px';
    for (const l of R.lines) { g.fillText(l, bx + px, ty + R.lh * 0.76); ty += R.lh; }
  }
  g.letterSpacing = '0px';
  g.restore();
  return { x: bx, y, w, h };
}
// small map labels: a glass pill with a colour dot, clamped into the frame
const PILLS = [];
function pill(x, y, text, color, alpha) { PILLS.push({ x, y, text, color, alpha }); }
// A pill that would touch a card or an earlier pill is left out. The test runs
// against the cards' FINAL extents (full legend, claim box), so a pill is either
// shown for the whole scene or never: nothing pops as the cards grow.
let RESERVED = null;
const hits = (a, b, m = 10) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
function drawPills() {
  if (!RESERVED) RESERVED = [titleRuns(true), legendRect(LAYERS.filter((L) => L.cap)), claimRuns(true)];
  const placed = [...RESERVED];
  for (const P of PILLS) {
    g.font = '500 16px ' + FONT;
    const tw = Math.ceil(g.measureText(P.text).width), w = tw + 42, h = 32;
    const x = Math.max(16, Math.min(P.x, W - w - 16)), y = Math.max(16, Math.min(P.y - h / 2, H - h - 16));
    const box = { x, y, w, h };
    if (placed.some((q) => hits(box, q))) continue;
    placed.push(box);
    if (P.alpha < 0.004) continue;
    g.save(); g.globalAlpha = P.alpha;
    glass(x, y, w, h, 10, 'rgba(7,9,12,0.66)');
    g.save(); rr(x, y, w, h, 10); g.clip();
    g.beginPath(); g.arc(x + 17, y + h / 2, 5, 0, 7); g.fillStyle = rgba(P.color, 1); g.fill();
    g.globalAlpha *= P.ta ?? 1;
    g.fillStyle = 'rgba(240,243,247,0.96)'; g.fillText(P.text, x + 30, y + 21.5);
    g.restore();
    g.restore();
  }
  PILLS.length = 0;
}

function drawGrid(a) {
  // a 50 m graticule on the ground plane: it is the thing that tells the eye
  // this drawing is IN the render's space and not a flat diagram
  g.save(); g.globalAlpha = a * 0.30; g.strokeStyle = rgba('GREY', 0.5); g.lineWidth = 1;
  const G = 50, x0 = Math.floor((eye[0] - 420) / G) * G, z0 = Math.floor((eye[2] - 420) / G) * G;
  for (let i = 0; i <= 17; i++) {
    const gx = x0 + i * G, gz = z0 + i * G;
    const a1 = [], a2 = [];
    for (let k = 0; k <= 17; k++) {
      const p = toScreen(gx, 0, z0 + k * G); if (p) a1.push(p);
      const q = toScreen(x0 + k * G, 0, gz); if (q) a2.push(q);
    }
    if (a1.length > 1) { path2(a1); g.stroke(); }
    if (a2.length > 1) { path2(a2); g.stroke(); }
  }
  g.restore();
  // scale bar, measured on the ground plane so it is a real 50 m
  const p0 = toScreen(eye[0] - 120, 0, eye[2] + 120), p1 = toScreen(eye[0] - 70, 0, eye[2] + 120);
  if (p0 && p1) {
    g.save(); g.globalAlpha = a; g.strokeStyle = rgba('WHITE', 0.75); g.lineWidth = 3;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    for (const p of [p0, p1]) { g.beginPath(); g.moveTo(p[0], p[1] - 7); g.lineTo(p[0], p[1] + 7); g.stroke(); }
    g.restore();
    pill((p0[0] + p1[0]) / 2 - 42, p0[1] - 34, '50 metres', 'WHITE', a);
  }
}

function drawRoadbed(a) {
  g.save(); g.globalAlpha = a;
  for (const r of S.ribbons) {
    path2(r.poly, true);
    g.fillStyle = rgba('BLUE', 0.115); g.fill();
    g.strokeStyle = rgba('BLUE', 0.42); g.lineWidth = 1.15; g.stroke();
  }
  g.restore();
  // width tag on the widest few, in the source's own unit (feet)
  const tagged = S.ribbons.filter((r) => r.s.w >= 60).slice(0, 5);
  for (const r of tagged) {
    const m = r.poly[Math.floor(r.poly.length / 4)];
    if (m[0] > 60 && m[0] < W - 220 && m[1] > 60 && m[1] < H - 220) {
      const parts = [r.s.w + ' ft wide'];
      if (r.s.lanes) parts.push(r.s.lanes + ' lanes');
      if (r.s.dir !== 'T') parts.push('one way');
      pill(m[0] + 8, m[1] - 24, parts.join('  ·  '), 'BLUE', a);
    }
  }
}

function drawStreets(a) {
  g.save(); g.globalAlpha = a;
  g.strokeStyle = rgba('BLUE', 0.95); g.lineWidth = 2.1; g.lineJoin = 'round';
  for (const s of S.streets) { path2(s.pts); g.stroke(); }
  // the vertices are the record: show them
  g.fillStyle = rgba('BLUE', 0.8);
  for (const s of S.streets) for (const p of s.pts) { g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 7); g.fill(); }
  g.restore();
}

function drawFoots(a, plutoA) {
  g.save(); g.globalAlpha = a;
  for (const o of S.foots) {
    for (const r of o.rings) {
      path2(r, true);
      // PLUTO fill: a floor-count ramp, so the layer READS as a data join
      const fl = o.f.pluto && o.f.pluto.fl;
      const v = fl ? Math.min(1, fl / 16) : 0;
      g.fillStyle = plutoA > 0.01 && fl
        ? 'rgba(' + (247 - v * 100) + ',' + (214 - v * 60) + ',' + (98 + v * 40) + ',' + ((0.10 + v * 0.30) * plutoA) + ')'
        : rgba('TEAL', 0.085);
      g.fill();
      g.strokeStyle = plutoA > 0.5 ? rgba('YELLOW', 0.55) : rgba('TEAL', 0.85);
      g.lineWidth = 1.25; g.stroke();
    }
  }
  g.restore();
  if (plutoA > 0.01) {
    for (const o of S.callouts) {
      const p = o.f.pluto;
      pill(o.c[0] - 12, o.c[1], p.fl + ' floors  ·  built ' + p.yr, 'YELLOW', plutoA);
    }
  }
}

function drawBus(a) {
  g.save(); g.globalAlpha = a; g.lineCap = 'round';
  for (const b of S.bus) {
    path2(b.pts); g.strokeStyle = rgba('RED', 0.20); g.lineWidth = 7; g.stroke();
    path2(b.pts); g.strokeStyle = rgba('RED', 0.92); g.lineWidth = 2.1; g.stroke();
  }
  g.restore();
}

function drawTrees(a) {
  g.save(); g.globalAlpha = a;
  for (const t of S.trees) {
    const r = Math.max(2.2, Math.min(9, 1.1 + (t.t.dbh || 6) * 0.30));
    g.beginPath(); g.arc(t.p[0], t.p[1], r, 0, 7);
    g.fillStyle = rgba('GREEN', 0.30); g.fill();
    g.strokeStyle = rgba('GREEN', 0.92); g.lineWidth = 1.3; g.stroke();
  }
  g.restore();
}

function drawHyd(a) {
  g.save(); g.globalAlpha = a; g.strokeStyle = rgba('ORANGE', 0.95); g.lineWidth = 1.7;
  for (const p of S.hyd) {
    g.beginPath(); g.moveTo(p[0] - 4, p[1]); g.lineTo(p[0] + 4, p[1]);
    g.moveTo(p[0], p[1] - 4); g.lineTo(p[0], p[1] + 4); g.stroke();
  }
  g.restore();
}

function drawSig(a) {
  g.save(); g.globalAlpha = a;
  for (const s of S.sig) {
    if (!s.n.signal) continue;
    g.beginPath(); g.arc(s.p[0], s.p[1], 13, 0, 7);
    g.strokeStyle = rgba('ORANGE', 0.95); g.lineWidth = 2.2; g.stroke();
    g.beginPath(); g.arc(s.p[0], s.p[1], 4.5, 0, 7); g.fillStyle = rgba('ORANGE', 0.9); g.fill();
  }
  g.restore();
}

// --------------------------------------------------------------- annotation
function titleRuns(measure, textAlpha = 1) {
  return textBox(64, 56, [
    { text: 'BUILT FROM NEW YORK CITY OPEN DATA', font: '600 15px ' + FONT, color: rgba('BLUE', 1), lh: 22, spacing: '2.4px' },
    { text: '125th Street and Lenox Avenue', font: '600 40px ' + FONT, color: 'rgba(245,247,250,1)', lh: 50, gapBefore: 8 },
    { text: 'Harlem, Manhattan', font: '400 20px ' + FONT, color: 'rgba(196,205,215,0.92)', lh: 28, gapBefore: 2 },
  ], { maxW: 760, measure, textAlpha });
}
// the closing deck's own numbers: 930,787 footprints and 268,096 sidewalk
// widths measured at a mean of 4.78 m (slides.mjs, from the compile log)
function claimRuns(measure, textAlpha = 1) {
  return textBox(W - 64, 56, [
    { text: 'Every Building and Street Comes from Public Records', font: '600 28px ' + FONT, color: 'rgba(245,247,250,1)', lh: 36 },
    { text: 'The twin is compiled from 930,787 building footprints and 268,096 measured sidewalk widths, together with the street centerlines, bus lanes and street trees that the city publishes.',
      font: '400 21px ' + FONT, color: 'rgba(222,228,235,0.95)', lh: 31, gapBefore: 14 },
    { text: 'When the city updates these datasets, the twin is rebuilt from them.', font: '400 18px ' + FONT, color: rgba('YELLOW', 1), lh: 26, gapBefore: 14 },
  ], { maxW: 790, alignRight: true, measure, textAlpha });
}
const LEG = { ROW: 56, px: 24, py: 18, sw: 14, gap: 16, CAPF: '600 20px ', SUBF: '400 16px ' };
function legendRect(shownRows) {
  let wMax = 0;
  for (const L of shownRows) {
    g.font = LEG.CAPF + FONT; wMax = Math.max(wMax, g.measureText(L.cap).width);
    g.font = LEG.SUBF + FONT; wMax = Math.max(wMax, g.measureText(L.sub).width);
  }
  const w = Math.ceil(LEG.px + LEG.sw + LEG.gap + wMax + LEG.px), h = LEG.py * 2 + shownRows.length * LEG.ROW - 8;
  return { x: 64, y: H - 64 - h, w, h };
}

function drawChrome(t, fadeB, fadeT) {
  const titleA = ease(t / 0.7) * fadeB;
  if (titleA > 0.004) { g.save(); g.globalAlpha = titleA; titleRuns(false, fadeT); g.restore(); }

  // the legend builds: one row per layer, in the layer's own colour, on a
  // single glass panel that grows as the rows arrive, sized to its longest line
  const rows = LAYERS.filter((L) => L.cap);
  const alphas = rows.map((L) => ease((t - L.t) / 0.55));
  const shownRows = rows.filter((L, i) => alphas[i] > 0.004);
  if (shownRows.length) {
    const { x, y, w, h } = legendRect(shownRows);
    g.save(); g.globalAlpha = Math.max(...alphas) * fadeB;
    glass(x, y, w, h, 18);
    g.restore();
    g.save();
    rr(x, y, w, h, 18); g.clip();
    shownRows.forEach((L, k) => {
      const ry = y + LEG.py + k * LEG.ROW, tx = x + LEG.px + LEG.sw + LEG.gap;
      g.save(); g.globalAlpha = alphas[rows.indexOf(L)] * Math.min(fadeB, fadeT);
      rr(x + LEG.px, ry + 6, LEG.sw, LEG.sw, 4); g.fillStyle = rgba(L.color, 1); g.fill();
      g.font = LEG.CAPF + FONT; g.fillStyle = 'rgba(245,247,250,1)';
      g.fillText(L.cap, tx, ry + 19);
      g.font = LEG.SUBF + FONT; g.fillStyle = 'rgba(178,189,201,1)';
      g.fillText(L.sub, tx, ry + 41);
      g.restore();
    });
    g.restore();
  }

  // the claim, in plain words
  const hA = ease((t - T_HEAD) / 0.8) * fadeB;
  if (hA > 0.004) { g.save(); g.globalAlpha = hA; claimRuns(false, fadeT); g.restore(); }
}

// ------------------------------------------------------------------- a frame
window.__frame = (t) => {
  const fade = 1 - ease((t - T_FADE) / 1.35);   // annotation clears for the dissolve
  const al = {};
  for (const L of LAYERS) al[L.id] = ease((t - L.t) / 0.7);
  g.fillStyle = '#0e0f11'; g.fillRect(0, 0, W, H);
  drawGrid(al.grid);
  if (al.roadbed > 0.004) drawRoadbed(al.roadbed);
  if (al.foot > 0.004) drawFoots(al.foot, al.pluto);
  if (al.streets > 0.004) drawStreets(al.streets);
  if (al.bus > 0.004) drawBus(al.bus);
  if (al.trees > 0.004) drawTrees(al.trees);
  if (al.hyd > 0.004) drawHyd(al.hyd);
  if (al.sig > 0.004) drawSig(al.sig);
  const fadeT = ease(Math.min(1, Math.max(0, 2 * fade - 1))), fadeB = ease(Math.min(1, 2 * fade));
  for (const P of PILLS) { P.alpha *= fadeB; P.ta = fadeT; }
  drawPills();
  drawChrome(t, fadeB, fadeT);
  return cv.toDataURL('image/jpeg', 0.95);
};
document.fonts.ready.then(() => { window.__FONTS = true; });
</script></body></html>`;

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, '_data.html'), html);

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction('window.__FONTS === true', null, { timeout: 30000 }).catch(() => console.log('fonts.ready timed out'));

const write = async (file, dataUrl) => fs.writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
const T0 = Date.now();
if (opt('still')) {
  const t = Number(opt('still'));
  const f = path.join(outDir, `still_${String(t).replace('.', 'p')}.png`);
  await page.evaluate((tt) => window.__frame(tt), t);
  await page.screenshot({ path: f });
  console.log('still ->', path.relative(root, f));
} else {
  const total = Math.round(DUR * FPS);
  for (let i = 0; i < total; i++) {
    const url = await page.evaluate((tt) => window.__frame(tt), i / FPS);
    await write(path.join(outDir, `frame_${String(i).padStart(5, '0')}.jpg`), url);
    if (i % 60 === 0) console.log(`  ${i}/${total}  [${((Date.now() - T0) / 1000).toFixed(0)}s]`);
  }
  console.log(`${total} frames in ${((Date.now() - T0) / 1000).toFixed(0)}s`);
  const bin = (await import('ffmpeg-static')).default;
  const mp4 = path.join(path.dirname(outDir), 'data.mp4');
  const r = spawnSync(bin, ['-y', '-framerate', String(FPS), '-i', path.join(outDir, 'frame_%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  console.log(r.status === 0 ? `wrote ${path.relative(root, mp4)} (${DUR} s)` : 'ffmpeg failed:\n' + (r.stderr || '').split('\n').slice(-12).join('\n'));
}
await browser.close();
