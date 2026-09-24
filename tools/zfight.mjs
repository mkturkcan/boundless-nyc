// Z-FIGHT HUNTER — boundless.js NYC digital twin.
//
// Two instruments in one harness, because an image diff alone cannot name the
// two surfaces that are fighting and a geometry census alone cannot prove that
// the fight is visible.
//
//  A/B DOLLY DIFF  (default).  Render the SAME framing twice with the camera
//      moved `--dolly` metres (1.5 cm) along its own view axis, everything else
//      frozen, and blend the two with ffmpeg `blend=all_mode=difference`. A
//      1.5 cm move at 100 m is a quarter of a pixel of parallax, so any BLOCK
//      of the frame that changes out on a flat surface changed because the
//      depth test picked a different winner: that is z-fighting. A third frame
//      is taken back at A as a control — diff(A, A') must be black or the pair
//      is not evidence. The mask is then scored per 32x32 tile and the worst
//      tiles are probed with a raycast that names the meshes/matIds, their
//      exact world Y, the separation ALONG THE VIEW RAY and the depth LSB at
//      that distance. That ratio is the proof, not the speckle.
//
//  PLANAR CENSUS   (--census).  Rasterises every near-horizontal triangle in
//      range — the whole live scene graph, so merged tile ground (matId per
//      vertex), runtime kit parts and instanced furniture alike — into a 0.5 m
//      grid and reports every cell holding two surfaces within `--dy` metres.
//      Exhaustive, deterministic, and it needs no discrete GPU, so `--sw` runs
//      it on SwiftShader without queueing on tools/gpulock.mjs behind the
//      other GPU jobs.
//
// WHY THE PAIR IS FROZEN. The film pipeline is temporal: Halton-jittered TAA
// with history accumulation (engine.js:485), a motion-blur pass, animated film
// grain keyed to uTimeG, a light probe that refreshes every 150 frames and an
// exposure meter that drifts every 8. All five make two renders of one framing
// differ everywhere. They are stubbed for the pair (see FREEZE) and the shadow
// maps are pinned with the existing window.__FREEZE_SHADOW(true), so the only
// thing left that can move a pixel is the geometry. `--film` keeps them.
//
// DEPTH PRECISION. PerspectiveCamera(66, a, 0.4, 22000) with a plain 24-bit
// DepthTexture (engine.js:22,696) — no logarithmic depth, no reverse-Z. One
// depth LSB in metres at range d is (f-n)*d^2/(f*n*2^24) = 1.490e-7 * d^2.
//
//   node tools/zfight.mjs --views fMarkings,mLenoxTop
//   node tools/zfight.mjs --views ad                    # all 14 ad framings
//   node tools/zfight.mjs --views closeups              # curbs/ramps/medians/plates/...
//   node tools/zfight.mjs --views fMarkings --census --sw     # no GPU lock
//   node tools/zfight.mjs --views cxRamp --census --diff --dy 0.05 --R 60
//
// Out: boundlessjs/shots/zfight/<view>_{a,b,c,a2,diff,jig,control,mask,jigmask}.png + <view>.json
//      a = the framing.  b = 1.5 cm dolly.  c = near-plane jig.  a2 = control.
//      *_jigmask.png is the one to look at: z-fighting, nothing else.
import { chromium } from 'playwright';
import { acquireGpu } from './gpulock.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bdir = path.join(root, 'boundlessjs');
const FFMPEG = path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1') : d; };
const has = (n) => args.includes('--' + n);

// ---------------------------------------------------------------- framings
// mirror of boundlessjs/src/shared/geo.js project()
const LAT0 = 40.7831, LON0 = -73.9712;
const M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const project = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const unproject = (x, z) => [x / M_LON + LON0, -z / M_LAT + LAT0];

const SPEC = JSON.parse(await fs.readFile(path.join(root, 'tools', 'ad', 'shots.json'), 'utf8'));
// AD framings = the FIRST KEY of each shot, held still. The camera maths is the
// ad's own: PathCam with a terrain-relative altitude and a look point, driven
// through window.__SET_PATH — so this is literally the film's frame 0.
const AD = {};
for (const [k, v] of Object.entries(SPEC.shots)) {
  const k0 = v.keys[0];
  AD[k] = { time: v.time || 'golden', p: k0.p, look: k0.look || k0.p, flags: v.flags || '', title: v.title || '' };
}
// close-ups. L(lon, lat, alt, lookLon, lookLat, lookAlt); W(x, z, alt, tx, tz, talt) in world metres.
const L = (lon, lat, alt, tlon, tlat, talt, time = 'day', title = '') => ({ time, p: [lon, lat, alt], look: [tlon, tlat, talt], title });
const W = (x, z, alt, tx, tz, talt, time = 'day', title = '') => {
  const [a, b] = unproject(x, z), [c, d] = unproject(tx, tz);
  return { time, p: [a, b, alt], look: [c, d, talt], title };
};
const CLOSE = {
  // --- 125th & Lenox (x 2100..2200, z -2780..-2690): where both earlier fixes landed
  cxRamp:      W(2143, -2757, 1.6, 2150, -2749, 0.2, 'day', 'curb ramp + dome plate, SE corner, 10 m'),
  cxRampLow:   W(2146.5, -2752.5, 0.55, 2151, -2748, 0.05, 'day', 'ramp pad vs dome plate at 6 m'),
  cxWalk:      W(2130, -2760, 1.7, 2180, -2735, 0.1, 'day', 'crosswalk bars running away down the avenue'),
  cxPaintFar:  W(2128, -2765, 3.4, 2400, -2650, 0.1, 'day', 'road paint at 250-300 m: the depth-LSB case'),
  cxCurb:      W(2139, -2748, 0.9, 2175, -2741, 0.1, 'day', 'curb face + gutter ribbon along the flags'),
  cxBus:       W(2120, -2762, 2.2, 2230, -2718, 0.1, 'day', 'bus-lane red ribbon + legends'),
  cxJunction:  W(2150, -2735, 9, 2150.2, -2745, 0.0, 'day', 'straight down on the junction cap fan + boxes'),
  cxJunctOb:   W(2170, -2718, 22, 2148, -2742, 0.0, 'day', 'the fan/box pair at a 22 m oblique'),
  cxMedian:    W(2101, -2700, 1.6, 2101, -2760, 0.3, 'day', 'Lenox median: planted bed top vs road'),
  cxTreePit:   W(2141, -2745, 1.3, 2148, -2744, 0.2, 'day', 'sidewalk tree pit: grate/soil vs flags'),
  cxStoop:     W(2044, -2432, 1.5, 2050, -2426, 0.6, 'day', 'W 121st rowhouse stoop bottom vs the flags'),
  // --- Columbia campus (CAMPUS_SHIFT terraces)
  cwTerrace:   L(-73.96205, 40.80740, 1.7, -73.96205, 40.80830, 4.0, 'golden', 'College Walk to the Low steps'),
  cwLawn:      L(-73.96250, 40.80790, 1.5, -73.96180, 40.80800, 0.3, 'golden', 'south lawn edge vs brick paving'),
  cwPlaza:     L(-73.96205, 40.80835, 8.0, -73.96205, 40.80770, 0.2, 'golden', 'off the Low plateau down the pad'),
  // --- LoD boundary + water
  lodEdge:     W(2128, -2765, 300, 2900, -3400, 0.0, 'day', 'near tiles -> macro ground at the seam'),
  lodEdge2:    W(0, 0, 420, 1400, 1900, 0.0, 'day', 'midtown, another LoD boundary bearing'),
  water:       W(-1500, 1200, 40, -2400, 1600, 0.0, 'day', 'Hudson bulkhead vs the water plane'),
  // --- building bases at +0.28
  bldgBase:    W(2136, -2742, 1.2, 2160, -2737, 0.5, 'day', 'storefront sills / floor slabs on the walk'),
  bldgBaseRow: W(2046, -2429, 1.4, 2062, -2424, 0.6, 'day', 'brownstone row: bases + stoops + areaways'),
};
const VIEWS = { ...AD, ...CLOSE };
const GROUPS = { ad: Object.keys(AD), closeups: Object.keys(CLOSE), all: Object.keys(VIEWS) };

const names = (opt('views', 'ad')).split(',').flatMap((n) => GROUPS[n] || [n]).filter((n) => {
  if (!VIEWS[n]) { console.log('unknown view', n); return false; }
  return true;
});
if (!names.length) { console.log('nothing to do'); process.exit(0); }

const outDir = path.resolve(root, opt('out', 'boundlessjs/shots/zfight'));
const [VW, VH] = (opt('size', has('sw') ? '960x540' : '1920x1080')).split('x').map(Number);
const DOLLY = Number(opt('dolly', '0.015'));      // metres along the view axis
const THRESH = Number(opt('thresh', '26'));       // 0..255 per-channel diff that counts as a flip
const NJIG = Number(opt('njig', '0.06'));         // near-plane jig (m): depth values move, projected x/y do not
const CENSUS = has('census');
const DIFF = !CENSUS || has('diff');
const DY = Number(opt('dy', '0.06'));             // census: max |dY| that counts as coplanar
const CR = Number(opt('R', '100'));               // census: radius in metres
const CELL = Number(opt('cell', '0.5'));          // census: grid cell in metres
const SW = has('sw');                             // SwiftShader: no GPU lock, no discrete GPU
const BASE_FLAGS = opt('flags', SPEC._meta?.flags || 'nopeds=1&hud=0');
const bootMs = Number(opt('boot', '220000'));
const label = opt('label', '');
const keepFilm = has('film');
const nProbes = Number(opt('probes', '14'));

await fs.mkdir(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MATID = { 0: 'asphalt', 1: 'sidewalk', 2: 'curb', 3: 'paintW', 4: 'paintY', 5: 'grass', 6: 'path', 7: 'terrain', 9: 'paintG', 10: 'brick', 11: 'gutter', 12: 'busred', 13: 'warn', 14: 'warnIron' };

// ---------------------------------------------------------------- page-side
// Everything below is injected with page.evaluate; it must be self-contained.

// FREEZE: kill every source of frame-to-frame variation that is not geometry.
const PURE = !has('film') && !has('nopure');   // screen-space passes off for the jig
const FREEZE = `(() => {
  const E = window.__ENGINE;
  if (!E) return 'no engine';
  const done = [];
  if (E.grade && E.grade.uniforms && E.grade.uniforms.uGrain) { E.grade.uniforms.uGrain.value = 0; done.push('grain'); }
  if (E.taa) { E.taa.enabled = false; E.taa.amount = 0; done.push('taa'); }
  if (E.moblur) { E.moblur.enabled = false; done.push('moblur'); }
  if (E.bokeh) { E.bokeh.enabled = false; done.push('bokeh'); }
  E._meterExposure = function () {}; done.push('exposure');
  E._updateProbe = function () {}; done.push('probe');
  try { E.camera.clearViewOffset(); done.push('viewoffset'); } catch (e) {}
  try { window.__FREEZE_SHADOW(true); done.push('shadow'); } catch (e) {}
  try { if (E.sun2) { E.sun2.shadow.autoUpdate = false; E.sun2.shadow.needsUpdate = false; } } catch (e) {}
  // SCREEN-SPACE PASSES OFF FOR THE JIG (--pure, default).
  //
  // This is not cosmetic, it is the difference between a measurement and a
  // rumour. GroundSSRPass, SSGIPass, GTAOPass, HazePass and GodraysPass all
  // ray-march or sample the pre-pass DEPTH TEXTURE, so moving camera.near
  // re-encodes the very buffer they read: their march steps land on different
  // texels and they produce a fresh speckle pattern along every depth
  // DISCONTINUITY. The first jig runs lit up a dense band on the near kerb line
  // — a textbook depth discontinuity — and the DoubleSide raycast at those
  // pixels found only the compiler's two opposite-wound curb quads, of which
  // FrontSide culling draws exactly one. That band was SSR/SSGI, not a depth
  // tie. With these off, the only thing camera.near can still change is which
  // surface wins the depth test.
  if (${PURE}) {
    for (const p of ['ssr', 'ssgi', 'gtao', 'haze', 'godrays']) if (E[p]) { E[p].enabled = false; done.push('-' + p); }
  }
  return done.join(',');
})()`;

// Resolve the three.js module namespace from inside an eval context. A bare
// 'three' specifier cannot be resolved there (page.evaluate is not a module),
// so the URL Vite actually served it from is recovered off the resource timing
// list and imported by URL. Cached on window.
const ZTHREE = `(async () => {
  if (window.__ZF_THREE) return 'cached';
  const rs = performance.getEntriesByType('resource').map((e) => e.name);
  const cands = rs.filter((n) => /three/i.test(n) && /\\.js(\\?|$)/.test(n));
  cands.sort((a, b) => (/deps\\/three\\.js/.test(b) ? 1 : 0) - (/deps\\/three\\.js/.test(a) ? 1 : 0));
  cands.push('/node_modules/three/build/three.module.js');
  for (const u of cands) {
    try {
      const m = await import(/* @vite-ignore */ u);
      if (m && m.Raycaster && m.Vector2) { window.__ZF_THREE = m; return u; }
    } catch (e) { /* next */ }
  }
  return 'FAILED; tried ' + cands.slice(0, 4).join(' , ');
})()`;

// PICK screen points and describe every surface the ray meets, with the world Y
// of each hit, the separation ALONG THE VIEW RAY and the depth LSB at that
// range. ratio = dRay / lsb; below ~2 the pair cannot hold a stable winner.
const PICKFN = `async (pts) => {
  const THREE = window.__ZF_THREE;
  if (!THREE) return [{ err: 'no THREE' }];
  const E = window.__ENGINE;
  const rc = new THREE.Raycaster();
  rc.far = 4000;
  // Raycaster honours material.side, and the compiler emits every vertical
  // ground quad TWICE with opposite winding (compile.mjs vertQuad, "both
  // windings — orientation varies"), so a FrontSide raycast sees only one of
  // each pair and reports "no coincident pair" on a surface that may well have
  // one. Force DoubleSide for the probe and put it back afterwards.
  const sideStash = [];
  E.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m.side !== 2) { sideStash.push([m, m.side]); m.side = 2; }
  });
  const out = [];
  for (const pt of pts) {
    const nx = pt[0], ny = pt[1];
    rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), E.camera);
    let hits = [];
    try { hits = rc.intersectObjects(E.scene.children, true); } catch (e) { out.push({ nx: nx, ny: ny, err: String(e).slice(0, 120) }); continue; }
    const seen = [];
    for (const h of hits) {
      if (!h.object.visible) continue;
      let mid = null;
      try { if (h.face && h.object.geometry && h.object.geometry.attributes.matId) mid = h.object.geometry.attributes.matId.getX(h.face.a); } catch (e) {}
      let nY = null;
      try { if (h.face) nY = +h.face.normal.y.toFixed(3); } catch (e) {}
      seen.push({
        d: +h.distance.toFixed(3), y: +h.point.y.toFixed(4), nY: nY, mid: mid,
        name: String(h.object.name || (h.object.parent && h.object.parent.name) || (h.object.material && h.object.material.name) || h.object.type).slice(0, 44),
        inst: h.instanceId === undefined ? null : h.instanceId,
      });
      if (seen.length >= 6) break;
    }
    const pairs = [];
    for (let i = 0; i < seen.length - 1; i++) {
      const dd = seen[i + 1].d - seen[i].d;
      if (dd < 0.30) pairs.push({
        a: seen[i], b: seen[i + 1],
        dRay: +dd.toFixed(5),
        dY: +(seen[i + 1].y - seen[i].y).toFixed(5),
        lsb: +(1.490e-7 * seen[i].d * seen[i].d).toFixed(6),
        ratio: +(dd / (1.490e-7 * seen[i].d * seen[i].d)).toFixed(2),
      });
    }
    out.push({ nx: +nx.toFixed(4), ny: +ny.toFixed(4), hits: seen, pairs: pairs });
  }
  return out;
}`;

// GRAB the A / B / A' triple. All three renders happen inside ONE synchronous
// block: no rAF between them, so the streamer, the dresser, the traffic and the
// clock cannot move, and the frame is read straight off the WebGL drawing
// buffer instead of the compositor surface (page.screenshot on this ANGLE/D3D11
// setup catches it mid-present — tools/ad/record.mjs re-shoots ~1.4 % of frames
// for exactly that). The camera is dollied on the camera object itself; the
// controller would overwrite it on the next frame, but there is no next frame.
// Frame `c` is the NEAR-PLANE JIG, and it is the discriminator the dolly cannot
// be. In a symmetric perspective frustum the projected x and y of a point are
// x_eye / (tan(fov/2) * aspect * -z_eye) — independent of `near`. Only the
// depth mapping uses it: z_win ~ 1 + n/f - n/d. Moving `near` therefore
// rasterises pixel-identical geometry with slightly different depth VALUES, and
// the relative shift between two surfaces dY apart at range d is
// dn * dY / d^2 — about one LSB for dn = 0.043 on a 14 mm pair at 100 m. So
// every pixel that changes between `a` and `c` changed because the depth test
// picked a different winner. No parallax, no silhouette edges, no foliage: the
// a/c mask is z-fighting and nothing else. (The 1.5 cm dolly a/b stays as the
// motion test the brief asks for — it is what the film's moving camera does —
// but its mask is dominated by honest parallax on every silhouette.)
const GRABFN = `(d, nj) => {
  const E = window.__ENGINE, gl = E.renderer.domElement;
  const shot = () => {
    E.camera.updateMatrixWorld(true);
    E.composer.render();
    const cv = document.createElement('canvas');
    cv.width = gl.width; cv.height = gl.height;
    cv.getContext('2d').drawImage(gl, 0, 0);
    return cv;
  };
  const e = E.camera.matrixWorld.elements;
  const f = [-e[8], -e[9], -e[10]];
  const p = E.camera.position;
  const n0 = E.camera.near;
  const a = shot();
  p.x += f[0] * d; p.y += f[1] * d; p.z += f[2] * d;
  const b = shot();
  p.x -= f[0] * d; p.y -= f[1] * d; p.z -= f[2] * d;
  E.camera.near = n0 + nj; E.camera.updateProjectionMatrix();
  const c = shot();
  E.camera.near = n0; E.camera.updateProjectionMatrix();
  const a2 = shot();
  window.__ZF = { a: a, b: b, c: c, a2: a2 };
  return { dir: f, size: [gl.width, gl.height], near: [n0, n0 + nj],
           cam: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)] };
}`;
const READFN = `(k) => window.__ZF[k].toDataURL('image/png')`;

// PLANAR CENSUS. Rasterise near-horizontal triangles into a CELL-metre grid and
// report every cell holding two surfaces within DY of each other.
const CENSUSFN = `async (cfg) => {
  // Vector3 / Matrix4 harvested off live instances — an eval context cannot
  // resolve the bare 'three' specifier and the census needs nothing else.
  const E0 = window.__ENGINE;
  const V3 = E0.camera.position.constructor, M4 = E0.camera.matrixWorld.constructor;
  const cx = cfg.cx, cz = cfg.cz, R = cfg.R, DY = cfg.dy, CELL = cfg.cell;
  const MIDNAME = cfg.midname;
  const E = window.__ENGINE;
  const nCell = Math.ceil((2 * R) / CELL);
  const grid = new Map();
  const tags = [];
  const tagIx = new Map();
  const tagId = (s) => { let i = tagIx.get(s); if (i === undefined) { i = tags.length; tags.push(s); tagIx.set(s, i); } return i; };
  let triN = 0, cellPuts = 0, triSeen = 0;
  const HORIZ = 0.985;
  const put = (x0, y0, z0, x1, y1, z1, x2, y2, z2, t) => {
    triSeen++;
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    // UPWARD-facing only. A building prism's BOTTOM face sits at the pavement
    // datum too, and with side: FrontSide it is back-facing and never rasterised
    // — counting it turned every footprint into a fake exact-tie. Winding is
    // CCW-front in three.js, so (v1-v0) x (v2-v0) with ny > 0 is a face the
    // camera above the ground can actually see.
    if (nl < 1e-9 || ny / nl < HORIZ) return;
    const minx = Math.min(x0, x1, x2), maxx = Math.max(x0, x1, x2);
    const minz = Math.min(z0, z1, z2), maxz = Math.max(z0, z1, z2);
    if (maxx < cx - R || minx > cx + R || maxz < cz - R || minz > cz + R) return;
    if (maxx - minx > 800 || maxz - minz > 800) return;
    triN++;
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(d) < 1e-9) return;
    const i0 = Math.max(0, Math.floor((minx - (cx - R)) / CELL)), i1 = Math.min(nCell - 1, Math.floor((maxx - (cx - R)) / CELL));
    const j0 = Math.max(0, Math.floor((minz - (cz - R)) / CELL)), j1 = Math.min(nCell - 1, Math.floor((maxz - (cz - R)) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = cx - R + (i + 0.5) * CELL, pz = cz - R + (j + 0.5) * CELL;
      const l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d;
      const l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const y = l0 * y0 + l1 * y1 + l2 * y2;
      const k = j * nCell + i;
      let a = grid.get(k); if (!a) grid.set(k, (a = []));
      let hit = false;
      for (let q = 0; q < a.length; q++) if (a[q][1] === t && Math.abs(a[q][0] - y) < 0.0008) { hit = true; break; }
      if (!hit) { a.push([y, t]); cellPuts++; }
    }
  };
  const v3 = new V3();
  const m4 = new M4();
  const scanMesh = (o, mtx, tag, cap) => {
    const g = o.geometry;
    const pa = g && g.attributes && g.attributes.position;
    if (!pa) return 0;
    const idx = g.index;
    const nTri = Math.floor((idx ? idx.count : pa.count) / 3);
    if (nTri > cap) return -nTri;
    const midA = (g.attributes && g.attributes.matId) || null;
    const P = new Float64Array(9);
    for (let t3 = 0; t3 < nTri; t3++) {
      let ok = true, mid = -1;
      for (let c = 0; c < 3; c++) {
        const vi = idx ? idx.getX(t3 * 3 + c) : t3 * 3 + c;
        v3.fromBufferAttribute(pa, vi).applyMatrix4(mtx);
        if (!isFinite(v3.x) || !isFinite(v3.y)) { ok = false; break; }
        P[c * 3] = v3.x; P[c * 3 + 1] = v3.y; P[c * 3 + 2] = v3.z;
        if (c === 0 && midA) mid = midA.getX(vi);
      }
      if (!ok) continue;
      const tg = mid >= 0 ? tag + '#' + (MIDNAME[mid] || ('m' + mid)) : tag;
      put(P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], tagId(tg));
    }
    return nTri;
  };
  E.scene.updateMatrixWorld(true);
  const stack = [E.scene];
  let meshes = 0;
  const skipped = [];
  while (stack.length) {
    const o = stack.pop();
    if (o.visible === false) continue;
    for (let i = 0; i < o.children.length; i++) stack.push(o.children[i]);
    if (!o.isMesh) continue;
    const nm = String(o.name || (o.parent && o.parent.name) || (o.material && o.material.name) || o.type);
    if (/sky|cloud|rain|snow|godray|Sprite/i.test(nm)) continue;
    if (o.isInstancedMesh) {
      const nTri = Math.floor((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
      if (nTri > 1200) { skipped.push(nm + ' inst tri=' + nTri); continue; }
      const cnt = Math.min(o.count, 6000);
      let used = 0;
      for (let i = 0; i < cnt; i++) {
        o.getMatrixAt(i, m4);
        m4.premultiply(o.matrixWorld);
        const px = m4.elements[12], pz = m4.elements[14];
        if (Math.abs(px) < 1e-6 && Math.abs(pz) < 1e-6) continue;          // unused slot
        if (Math.hypot(px - cx, pz - cz) > R + 14) continue;
        scanMesh(o, m4, 'inst:' + nm, 1200);
        used++;
      }
      if (used) meshes++;
    } else {
      const bs = o.geometry && o.geometry.boundingSphere;
      if (bs) {
        v3.copy(bs.center).applyMatrix4(o.matrixWorld);
        const s = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z));
        if (Math.hypot(v3.x - cx, v3.z - cz) > R + bs.radius * s + 4) continue;
      }
      const r = scanMesh(o, o.matrixWorld, 'mesh:' + nm, 900000);
      if (r < 0) skipped.push(nm + ' tri=' + (-r)); else meshes++;
    }
  }
  const agg = new Map();
  for (const kv of grid) {
    const k = kv[0], a = kv[1];
    if (a.length < 2) continue;
    a.sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < a.length - 1; i++) for (let j = i + 1; j < a.length; j++) {
      const d = a[j][0] - a[i][0];
      if (d > DY) break;
      if (a[i][1] === a[j][1]) continue;
      const kk = tags[a[i][1]] + ' || ' + tags[a[j][1]] + ' @' + d.toFixed(3);
      let r = agg.get(kk);
      if (!r) { r = { pair: tags[a[i][1]] + ' || ' + tags[a[j][1]], dY: +d.toFixed(4), yLo: +a[i][0].toFixed(4), yHi: +a[j][0].toFixed(4), cells: 0, at: null }; agg.set(kk, r); }
      r.cells++;
      if (!r.at) { const i2 = k % nCell, j2 = Math.floor(k / nCell); r.at = [+(cx - R + (i2 + 0.5) * CELL).toFixed(1), +(cz - R + (j2 + 0.5) * CELL).toFixed(1)]; }
    }
  }
  const rows = Array.from(agg.values()).sort((p, q) => q.cells - p.cells);
  // also: every distinct horizontal datum found, so a surprise layer cannot hide
  const datum = new Map();
  for (const kv of grid) for (const e of kv[1]) {
    const k2 = tags[e[1]] + ' @' + e[0].toFixed(3);
    datum.set(k2, (datum.get(k2) || 0) + 1);
  }
  const datums = Array.from(datum.entries()).filter((e) => e[1] >= 4).sort((p, q) => q[1] - p[1]).slice(0, 70)
    .map((e) => ({ layer: e[0], cells: e[1] }));
  return {
    cam: [+E.camera.position.x.toFixed(1), +E.camera.position.y.toFixed(2), +E.camera.position.z.toFixed(1)],
    meshes: meshes, triSeen: triSeen, horizTri: triN, cells: grid.size, cellPuts: cellPuts, tags: tags.length,
    skipped: skipped.slice(0, 10), area: (2 * R) + 'm cell=' + CELL,
    rows: rows.slice(0, 100), datums: datums,
  };
}`;

// Scoring runs in NODE off the raw RGB of the difference image, not in the page.
// The page route was wrong in a way worth recording: the grabs are RGBA and
// `blend=all_mode=difference` differences the ALPHA channel too, so a diff of
// two fully opaque frames comes out fully TRANSPARENT. ffmpeg's own signalstats
// still read the RGB (YMAX 235), but drawing that PNG into a 2D canvas gave
// (0,0,0,0) everywhere and every frame scored 0 % — a clean false negative.
// Every filter chain below therefore ends in format=rgb24 with -pix_fmt rgb24.

// ---------------------------------------------------------------- ffmpeg
const ff = (a) => new Promise((res, rej) => {
  const p = spawn(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c + ': ' + err.slice(-400)))));
});
// raw rgb24 pixels of a PNG, straight out of ffmpeg
const rawRGB = (file) => new Promise((res, rej) => {
  const p = spawn(FFMPEG, ['-loglevel', 'error', '-i', file, '-vf', 'format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const bufs = []; let err = '';
  p.stdout.on('data', (d) => bufs.push(d));
  p.stderr.on('data', (d) => (err += d));
  p.on('close', (c) => (c === 0 ? res(Buffer.concat(bufs)) : rej(new Error('ffmpeg raw ' + c + ': ' + err.slice(-300)))));
});
// % of pixels whose worst channel clears THRESH, plus the hottest 32 px tiles
const scoreDiff = async (file, W, H, thr) => {
  const d = await rawRGB(file);
  if (d.length < W * H * 3) throw new Error(`raw short: ${d.length} vs ${W * H * 3}`);
  const TS = 32, tw = Math.ceil(W / TS), th = Math.ceil(H / TS);
  const hot = new Float32Array(tw * th);
  let on = 0, sum = 0, mx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const v = Math.max(d[i], d[i + 1], d[i + 2]);
    sum += v; if (v > mx) mx = v;
    if (v > thr) { on++; hot[((y / TS) | 0) * tw + ((x / TS) | 0)]++; }
  }
  const tiles = [];
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const f = hot[j * tw + i] / (TS * TS);
    if (f > 0.04) tiles.push({ i, j, f: +f.toFixed(3), nx: (i + 0.5) * TS / W, ny: (j + 0.5) * TS / H });
  }
  tiles.sort((a, b) => b.f - a.f);
  return { pct: +((on / (W * H)) * 100).toFixed(3), mean: +(sum / (W * H)).toFixed(3), max: mx, tiles: tiles.slice(0, 48), nTiles: tiles.length };
};
// absolute-difference image of two frames, alpha dropped
const absDiff = (f1, f2, out) => ff(['-y', '-loglevel', 'error', '-i', f1, '-i', f2, '-filter_complex',
  '[0:v]format=rgb24[x];[1:v]format=rgb24[y];[x][y]blend=all_mode=difference,format=rgb24', '-pix_fmt', 'rgb24', out]);
const maskOf = (src, out) => ff(['-y', '-loglevel', 'error', '-i', src, '-vf',
  `format=rgb24,lutrgb=r='if(gt(val,${THRESH}),255,0)':g='if(gt(val,${THRESH}),255,0)':b='if(gt(val,${THRESH}),255,0)',format=rgb24`,
  '-pix_fmt', 'rgb24', out]);
// diff + jig + control + masks for one captured set; returns the scores
const makeDiffs = async (tag, W, H) => {
  const P = (s) => path.join(outDir, `${tag}_${s}.png`);
  const hasJig = !!(await fs.stat(P('c')).catch(() => null));
  await absDiff(P('a'), P('b'), P('diff'));
  await absDiff(P('a'), P('a2'), P('control'));
  await maskOf(P('diff'), P('mask'));
  const out = { score: await scoreDiff(P('diff'), W, H, THRESH), ctl: await scoreDiff(P('control'), W, H, THRESH) };
  if (hasJig) {
    await absDiff(P('a'), P('c'), P('jig'));
    await maskOf(P('jig'), P('jigmask'));
    out.jig = await scoreDiff(P('jig'), W, H, THRESH);
  }
  return out;
};

// ---------------------------------------------------------------- offline census
// The compiled-geometry census, straight out of the tile binaries. No browser,
// no GPU lock, no streaming — so it can be pointed at two tile sets and diffed
// while somebody else is rendering. It sees ONLY the compiler's sections (the
// in-page --census also covers runtime kit and instanced furniture), which is
// exactly what the lead's datum list needs.
//
//   node tools/zfight.mjs --offline --tilesdir boundlessjs/public/tiles      --keys 4_-6,3_-6,1_-6
//   node tools/zfight.mjs --offline --tilesdir boundlessjs/public/tiles_dev11 --keys 4_-6,3_-6,1_-6
if (has('offline')) {
  const tdir = path.resolve(root, opt('tilesdir', 'boundlessjs/public/tiles'));
  const keys = (opt('keys', '4_-6')).split(',');
  const CTOR = { Float32Array, Uint8Array, Uint32Array, Int16Array, Uint16Array };
  const SECT = [['asphalt', 0], ['sidewalk', 1], ['curb', 2], ['paintW', 3], ['paintY', 4], ['grass', 5], ['path', 6], ['paintG', 9], ['brick', 10], ['gutter', 11], ['busred', 12], ['warn', 13], ['warnIron', 14]];
  const man = JSON.parse(await fs.readFile(path.join(tdir, 'manifest.json'), 'utf8'));
  for (const key of keys) {
    const ent = man.tiles[key];
    if (!ent) { console.log(key, 'not in manifest'); continue; }
    const nbuf = await fs.readFile(path.join(tdir, ent.f));
    const ab = nbuf.buffer.slice(nbuf.byteOffset, nbuf.byteOffset + nbuf.byteLength);
    const dv = new DataView(ab);
    const hLen = dv.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, hLen)));
    const b0 = 8 + hLen + ((4 - ((8 + hLen) % 4)) % 4);
    const S = {};
    for (const s of header.sections) S[s.name] = new CTOR[s.type](ab, b0 + s.offset, s.length);
    const [ox, oz] = header.origin;
    const nCell = Math.ceil(512 / CELL);
    const grid = new Map();
    const tags = [];
    let horiz = 0;
    for (const [name, mid] of SECT) {
      const a = S[name];
      if (!a || a.length < 9) continue;
      const tid = tags.push(`${name}#${mid}`) - 1;
      for (let o = 0; o + 8 < a.length; o += 9) {
        const x0 = a[o], y0 = a[o + 1], z0 = a[o + 2];
        const x1 = a[o + 3], y1 = a[o + 4], z1 = a[o + 5];
        const x2 = a[o + 6], y2 = a[o + 7], z2 = a[o + 8];
        const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-9 || ny / nl < 0.985) continue;          // upward-facing horizontals only
        horiz++;
        const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
        if (Math.abs(d) < 1e-9) continue;
        const i0 = Math.max(0, Math.floor(Math.min(x0, x1, x2) / CELL)), i1 = Math.min(nCell - 1, Math.floor(Math.max(x0, x1, x2) / CELL));
        const j0 = Math.max(0, Math.floor(Math.min(z0, z1, z2) / CELL)), j1 = Math.min(nCell - 1, Math.floor(Math.max(z0, z1, z2) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = (i + 0.5) * CELL, pz = (j + 0.5) * CELL;
          const l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d;
          const l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d;
          const l2 = 1 - l0 - l1;
          if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
          const y = l0 * y0 + l1 * y1 + l2 * y2;
          const kk = j * nCell + i;
          let arr = grid.get(kk); if (!arr) grid.set(kk, (arr = []));
          let hit = false;
          for (const e of arr) if (e[1] === tid && Math.abs(e[0] - y) < 0.0008) { hit = true; break; }
          if (!hit) arr.push([y, tid]);
        }
      }
    }
    const agg = new Map();
    for (const [kk, arr] of grid) {
      if (arr.length < 2) continue;
      arr.sort((p, q) => p[0] - q[0]);
      for (let i = 0; i < arr.length - 1; i++) for (let j = i + 1; j < arr.length; j++) {
        const dd = arr[j][0] - arr[i][0];
        if (dd > DY) break;
        if (arr[i][1] === arr[j][1]) continue;
        const nk = `${tags[arr[i][1]]} || ${tags[arr[j][1]]} @${dd.toFixed(3)}`;
        let r = agg.get(nk);
        if (!r) { r = { pair: `${tags[arr[i][1]]} || ${tags[arr[j][1]]}`, dY: +dd.toFixed(4), yLo: +arr[i][0].toFixed(3), yHi: +arr[j][0].toFixed(3), cells: 0, at: null }; agg.set(nk, r); }
        r.cells++;
        if (!r.at) { const i2 = kk % nCell, j2 = Math.floor(kk / nCell); r.at = [+(ox + (i2 + 0.5) * CELL).toFixed(0), +(oz + (j2 + 0.5) * CELL).toFixed(0)]; }
      }
    }
    const rows = [...agg.values()].sort((p, q) => q.cells - p.cells);
    console.log(`\n=== ${path.basename(tdir)}  tile ${key}  origin ${header.origin}  upward-horizontal tris ${horiz}  cells ${grid.size}  pairs ${rows.length}`);
    for (const r of rows.slice(0, 30)) {
      const flag = r.dY < 0.004 ? '  <<< under 4 mm' : '';
      console.log(`  ${String(r.cells).padStart(6)} cells (${(r.cells * CELL * CELL).toFixed(0).padStart(5)} m2)  dY=${(r.dY * 1000).toFixed(1).padStart(6)} mm  y ${r.yLo}/${r.yHi}  @${r.at}  ${r.pair}${flag}`);
    }
  }
  process.exit(0);
}

// ---------------------------------------------------------------- rescore
// Re-derive diff / control / mask + scores from triples already on disk. No
// browser, no GPU lock: use it after a capture run, or to re-threshold.
if (has('rescore')) {
  const out = [];
  for (const name of names) {
    const tag = name + (label ? '_' + label : '');
    const fa = path.join(outDir, `${tag}_a.png`);
    if (!(await fs.stat(fa).catch(() => null))) { console.log(`${tag}: no capture on disk`); continue; }
    const probe = await rawRGB(fa);
    // dimensions come from the JSON the capture wrote, else from the default size
    let W = VW, H = VH;
    try { const j = JSON.parse(await fs.readFile(path.join(outDir, `${tag}.json`), 'utf8')); if (j.size) { W = j.size[0]; H = j.size[1]; } } catch {}
    if (probe.length !== W * H * 3) { const px = probe.length / 3; H = Math.round(Math.sqrt(px / (W / H))); W = Math.round(px / H); }
    const { score, ctl } = await makeDiffs(tag, W, H);
    console.log(`${tag.padEnd(16)} ${String(score.pct).padStart(7)}% over ${THRESH}  mean ${String(score.mean).padStart(6)}  max ${String(score.max).padStart(3)}  ${score.nTiles} hot tiles   [control ${ctl.pct}% max ${ctl.max}]`);
    for (const t of score.tiles.slice(0, 8)) console.log(`    hot @${(t.nx * 100).toFixed(1)}%,${(t.ny * 100).toFixed(1)}%  f=${t.f}`);
    out.push({ view: name, size: [W, H], score, control: ctl });
    try {
      const j = JSON.parse(await fs.readFile(path.join(outDir, `${tag}.json`), 'utf8'));
      j.score = score; j.control = ctl;
      await fs.writeFile(path.join(outDir, `${tag}.json`), JSON.stringify(j, null, 1));
    } catch {}
  }
  await fs.writeFile(path.join(outDir, `_rescore${label ? '_' + label : ''}.json`), JSON.stringify(out, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- run
// SwiftShader runs on the CPU: it must NOT take the GPU lock (that is the whole
// point of --sw) but it must also not be launched at full size next to another
// GPU run — 960x540 is the default there for exactly that reason.
// --nolock: skip the GPU lock (quick stills while another renderer holds it).
// Never use it for a measurement — two Chromiums on one GPU makes the numbers
// noise and can page the machine.
const releaseGpu = (SW || has('nolock')) ? (() => {}) : await acquireGpu('zfight ' + names.slice(0, 3).join(','));
let hb = null;
if (!SW && !has('nolock')) {
  // gpulock treats a lock older than 20 min as stale and never refreshes it; a
  // long sweep must touch its own lock or the next waiter steals the GPU.
  const lockFile = path.join(root, 'tools', 'gpu.lock');
  hb = setInterval(() => { fs.utimes(lockFile, new Date(), new Date()).catch(() => {}); }, 120000);
}
let port = opt('port');
let server = null;
if (!port) {
  port = String(5400 + Math.floor(Math.random() * 3000));
  const viteBin = path.join(bdir, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore' });
  await sleep(6000);   // vite needs longer than 2.5 s to bind on a loaded machine
}
const browser = await chromium.launch({
  headless: true,
  args: SW
    ? ['--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${VW},${VH}`]
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${VW},${VH}`],
});

const summary = [];
try {
  for (const name of names) {
    const V = VIEWS[name];
    const tag = name + (label ? '_' + label : '');
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await page.routeWebSocket('**', () => {}).catch(() => {});   // no HMR reload mid-measurement
    const errors = [], logs = [];
    page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); if (m.type() === 'error') errors.push(m.text().slice(0, 220)); });
    page.on('pageerror', (e) => { errors.push('PAGEERROR ' + String(e).slice(0, 260)); });
    const [sx, sz] = project(V.p[0], V.p[1]);
    const url = `http://127.0.0.1:${port}/?shot=1&record=1&${BASE_FLAGS}&x=${sx.toFixed(1)}&z=${sz.toFixed(1)}&y=${(V.p[2] + 40).toFixed(1)}&time=${V.time}${V.flags ? '&' + V.flags : ''}`;
    console.log(`\n=== ${tag}  ${V.time}  alt=${V.p[2]}m  ${V.title || ''}`);
    const rec = { view: name, time: V.time, alt: V.p[2], title: V.title || '', url };
    try {
      // A COLD vite transform of this module graph takes well over 90 s on a
      // loaded machine — the first framing of a run timed out on goto while the
      // second, hitting a warm server, booted fine. Long timeout, and retry once
      // (a concurrent edit can also leave a module briefly unparseable).
      let booted = false;
      for (let a = 0; a < 2 && !booted; a++) {
        if (a) { console.log('  boot retry:', [...new Set(errors)].slice(0, 2).join(' | ') || 'goto timeout'); errors.length = 0; }
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
          booted = await page.waitForFunction('typeof window.__SET_PATH === "function" && !!window.__ENGINE', null, { timeout: bootMs })
            .then(() => true).catch(() => false);
        } catch (e) { booted = false; }
      }
      if (!booted) throw new Error('page never reached record mode');
      // hold path on key 0. Two keys 1e-8 deg apart: getPointAt(0) returns
      // points[0] exactly, and a zero-length CatmullRomCurve3 is undefined.
      const hold = (dp) => {
        const d = dp || [0, 0, 0];
        return { duration: 30, ease: 0, keys: [
          { p: [V.p[0] + d[0], V.p[1] + d[1], V.p[2] + d[2]], look: V.look },
          { p: [V.p[0] + d[0] + 1e-8, V.p[1] + d[1], V.p[2] + d[2]], look: V.look },
        ] };
      };
      await page.evaluate((p) => window.__SET_PATH(p), hold());
      await page.evaluate(() => window.__advance(0));
      let st = null;
      for (let i = 0; i < 110; i++) {
        await page.evaluate(() => window.__advance(1 / 30));
        st = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
        if (i > 25 && st && st.idle && st.dressQ === 0 && st.near > 4) break;
        await sleep(350);
      }
      for (let i = 0; i < 150; i++) await page.evaluate(() => window.__advance(1 / 30));   // 5 s of sim so nothing is mid-build
      st = await page.evaluate(() => window.__RECSTAT()).catch(() => null);
      const world = await page.evaluate(() => {
        const s = window.__STREAMER;
        if (!s || !s.tiles) return false;
        if (typeof s.readyUnder === 'function' && s.readyUnder()) return true;
        let n = 0; for (const t of s.tiles.values()) if (t && t.state === 'ready') n++;
        return n >= 4;
      });
      rec.world = world; rec.stat = st;
      // draw-call / triangle cost, so a fix that splits meshes can be priced
      rec.perf = await page.evaluate(() => (window.__PERF ? window.__PERF() : null)).catch(() => null);
      rec.groundMeshes = await page.evaluate(() => {
        const E = window.__ENGINE; let n = 0, v = 0;
        E.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.matId) { n++; v += o.geometry.attributes.position.count; } });
        return { meshes: n, verts: v };
      }).catch(() => null);
      console.log(`  settled in ${((Date.now() - t0) / 1000).toFixed(0)}s  tiles=${st && st.near} dress=${st && st.dressActive}/${st && st.dressQ} cars=${st && st.cars} world=${world}`);
      if (rec.perf) console.log(`  cost: fps=${rec.perf.fps} calls=${rec.perf.calls} tris=${(rec.perf.tris / 1e6).toFixed(1)}M  groundMeshes=${rec.groundMeshes && rec.groundMeshes.meshes} groundVerts=${rec.groundMeshes && rec.groundMeshes.verts}`);
      if (!world) console.log('  *** NO WORLD under the camera — this framing is INVALID, re-run it');

      const three = await page.evaluate(ZTHREE);
      console.log('  three:', three);

      if (CENSUS) {
        const cam = await page.evaluate(() => { const c = window.__ENGINE.camera; return [c.position.x, c.position.z]; });
        const cfg = { cx: cam[0], cz: cam[1], R: CR, dy: DY, cell: CELL, midname: MATID };
        const out = await page.evaluate(`(${CENSUSFN})(${JSON.stringify(cfg)})`).catch((e) => ({ err: String(e).slice(0, 500) }));
        rec.census = out;
        if (out.err) console.log('  census ERR', out.err);
        else {
          console.log(`  census @${out.cam} R=${CR} cell=${CELL}: meshes=${out.meshes} horizTri=${out.horizTri}/${out.triSeen} cells=${out.cells} pairs=${out.rows.length}`);
          for (const r of out.rows.slice(0, 30)) {
            console.log(`   ${String(r.cells).padStart(6)} cells (${(r.cells * CELL * CELL).toFixed(0)} m2)  dY=${(r.dY * 1000).toFixed(1).padStart(7)} mm  y ${r.yLo.toFixed(3)}/${r.yHi.toFixed(3)}  @${r.at}  ${r.pair}`);
          }
          console.log('   datums:', out.datums.slice(0, 28).map((d) => d.layer + '(' + d.cells + ')').join('  '));
          if (out.skipped.length) console.log('   skipped:', out.skipped.join(' | '));
        }
      }

      if (DIFF) {
        const frozen = await page.evaluate(keepFilm ? '"film mode: nothing frozen"' : FREEZE);
        console.log('  frozen:', frozen);
        await page.evaluate(() => window.__advance(0));
        await page.evaluate(() => window.__advance(0));
        const fa = path.join(outDir, `${tag}_a.png`);
        const fb = path.join(outDir, `${tag}_b.png`);
        const fa2 = path.join(outDir, `${tag}_a2.png`);
        const fc = path.join(outDir, `${tag}_c.png`);
        const grab = await page.evaluate(`(${GRABFN})(${DOLLY}, ${NJIG})`);
        rec.dir = grab.dir; rec.dolly = DOLLY; rec.camA = grab.cam; rec.size = grab.size; rec.near = grab.near;
        for (const [k, f] of [['a', fa], ['b', fb], ['c', fc], ['a2', fa2]]) {
          const u = await page.evaluate(`(${READFN})(${JSON.stringify(k)})`);
          await fs.writeFile(f, Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
        }
        rec.moved = DOLLY;

        const { score, ctl, jig } = await makeDiffs(tag, grab.size[0], grab.size[1]);
        rec.score = score; rec.control = ctl; rec.jig = jig;
        console.log(`  camera dollied ${rec.moved} m along the view axis ${JSON.stringify(rec.dir)} from ${JSON.stringify(rec.camA)}, ${rec.size[0]}x${rec.size[1]}`);
        console.log(`  dolly diff (parallax + z-fight): ${score.pct}% over ${THRESH}/255, mean ${score.mean}, ${score.nTiles} hot tiles   [control A/A': ${ctl.pct}% max ${ctl.max}]`);
        if (jig) console.log(`  NEAR-JIG diff (Z-FIGHT ONLY, near ${rec.near[0]} -> ${rec.near[1].toFixed(3)}): ${jig.pct}% over ${THRESH}/255, mean ${jig.mean}, max ${jig.max}, ${jig.nTiles} hot tiles`);
        // probe the JIG's hot tiles when there is one — those are z-fight only;
        // the dolly's hot tiles are mostly honest silhouette parallax
        const hotTiles = (jig && jig.tiles.length ? jig : score).tiles;
        const pts = hotTiles.slice(0, nProbes).map((t) => [t.nx, t.ny]);
        if (pts.length) {
          const picks = await page.evaluate(`(${PICKFN})(${JSON.stringify(pts)})`).catch((e) => [{ err: String(e).slice(0, 220) }]);
          rec.picks = picks;
          for (let i = 0; i < picks.length; i++) {
            const p = picks[i], t = hotTiles[i];
            const head = `  probe ${String(i).padStart(2)} @${(t.nx * 100).toFixed(0)}%,${(t.ny * 100).toFixed(0)}% hot=${t.f}`;
            if (p.err) { console.log(head, 'ERR', p.err); continue; }
            if (!p.pairs.length) {
              const h0 = p.hits[0];
              console.log(head + '   no coincident pair; front: ' + (h0 ? `${h0.name}${h0.mid !== null ? '#' + (MATID[h0.mid] || 'm' + h0.mid) : ''} d=${h0.d} y=${h0.y} nY=${h0.nY}` : 'sky'));
              continue;
            }
            console.log(head);
            for (const pr of p.pairs) {
              const an = `${pr.a.name}${pr.a.mid !== null ? '#' + (MATID[pr.a.mid] || 'm' + pr.a.mid) : ''}`;
              const bn = `${pr.b.name}${pr.b.mid !== null ? '#' + (MATID[pr.b.mid] || 'm' + pr.b.mid) : ''}`;
              console.log(`      ${an} y=${pr.a.y} d=${pr.a.d}  VS  ${bn} y=${pr.b.y}   dY=${(pr.dY * 1000).toFixed(1)}mm  dRay=${(pr.dRay * 1000).toFixed(2)}mm  lsb=${(pr.lsb * 1000).toFixed(2)}mm  ratio=${pr.ratio}${pr.ratio < 2 ? '   <<< Z-FIGHT' : ''}`);
            }
          }
        }
      }
    } catch (e) {
      rec.error = String(e).split('\n')[0];
      console.log('  FAILED:', rec.error);
      console.log('  last logs:\n   ' + logs.slice(-8).join('\n   '));
    }
    rec.errors = [...new Set(errors)].slice(0, 6);
    if (rec.errors.length) console.log('  page errors:', rec.errors.join(' | '));
    summary.push(rec);
    await fs.writeFile(path.join(outDir, `${tag}.json`), JSON.stringify(rec, null, 1));
    await page.close();
  }
} finally {
  await browser.close();
  if (hb) clearInterval(hb);
  releaseGpu();
  if (server) server.kill();
}
await fs.writeFile(path.join(outDir, `_summary${label ? '_' + label : ''}.json`), JSON.stringify(summary, null, 1));
console.log('\n=== SUMMARY');
for (const r of summary) {
  console.log(`${r.view.padEnd(16)} ${r.error ? 'FAILED ' + r.error
    : `jig ${String(r.jig ? r.jig.pct : '-').padStart(7)}%  dolly ${String(r.score ? r.score.pct : '-').padStart(7)}%  ctlMax=${r.control ? r.control.max : '-'}  ${r.census && r.census.rows ? r.census.rows.length + ' coplanar pairs' : ''}${r.world === false ? '  INVALID(no world)' : ''}`}`);
}
