// AR33 MATS test board: sample panels of the PBR library, in the city's own light, placed in front of the camera.
// Loaded into a running page by tools/bshot.mjs --evalfile:
// import('/src/city/mat/board.js').then((m) => m.place({ names: ['brick_red', 'stone_lime'], dist: 7 }))
// place is idempotent (a second call replaces the board) and resolves once the textures are in and compiled.
import * as THREE from 'three';
import { pbrMaterial, pbrReady, applyCityRefl } from './pbrLib.js';
import { applyLightTrim, applyCityAO } from '../../world/materials.js';

let _group = null;
function label(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#fff'; g.font = '600 34px Arial'; g.textBaseline = 'middle'; g.fillText(text, 12, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}
// a slab w x h x d with its front face's UVs in metres (u along, v up) and the sides' too
function slab(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv'), nrm = g.getAttribute('normal');
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const su = nx > 0.5 ? d : w, sv = ny > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}
// o: { names: [...], opts: { name: {...} } | common opts, dist (m, default 7), w, h (panel size), gap, lift (m above ground),
//      grid: columns (default: one row), yaw (deg, turn the board), wall: [w, h] (one big wall per name instead) }
export async function place(o = {}) {
  const E = window.__ENGINE, S = window.__STREAMER;
  if (!E) return 'no engine';
  if (_group) { E.scene.remove(_group); _group = null; }
  if (o.walls) return placeWalls(o, E, S);
  const cam = E.camera;
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const names = o.names || ['brick_red', 'brick_tan', 'stone_lime', 'granite_grey', 'concrete_precast', 'metal_painted', 'alu_clear', 'glass_clear'];
  const dist = o.dist ?? 7, w = o.w ?? 2.2, h = o.h ?? 3.2, gap = o.gap ?? 0.35, cols = o.grid || names.length;
  const rows = Math.ceil(names.length / cols);
  const g = new THREE.Group(); g.name = 'pbrBoard';
  const centre = cam.position.clone().addScaledVector(dir, dist);
  const ground = (x, z) => { const t = S && S.terrainAt ? S.terrainAt(x, z) : null; return t !== null && isFinite(t) ? t : 0; };
  const yaw = Math.atan2(-dir.x, -dir.z) + ((o.yaw || 0) * Math.PI) / 180;
  names.forEach((name, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const [pw, ph] = o.wall || [w, h];
    const off = (c - (cols - 1) / 2) * (pw + gap);
    const p = centre.clone().addScaledVector(right, off);
    const gy = ground(p.x, p.z) + (o.lift ?? 0) + (rows - 1 - r) * (ph + 0.45);
    const opts = { ...(o.common || {}), ...((o.opts && o.opts[name]) || {}), baseY: ground(p.x, p.z), topY: gy + ph };
    const m = pbrMaterial(name.split('#')[0], opts);
    const mesh = new THREE.Mesh(slab(pw, ph, 0.25), m);
    mesh.position.set(p.x, gy + ph / 2, p.z); mesh.rotation.y = yaw;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    if (o.labels !== false) {
      const l = label(name); l.position.set(p.x, gy + ph + 0.14, p.z); l.rotation.y = yaw;
      l.position.addScaledVector(dir, -0.14);
      g.add(l);
    }
  });
  E.scene.add(g); _group = g;
  await pbrReady;
  await new Promise((res) => setTimeout(res, o.settle ?? 2500));
  return `board: ${names.length} panels at ${centre.x.toFixed(1)}, ${centre.z.toFixed(1)}`;
}

// o.walls: [{ name, a: [x, z], b: [x, z], hdg (the face's outward compass heading), y0 (m over the terrain, default 0),
// h (height, m), out (m in front of the frontage line, default 0.3), opts }]: a slab of the material laid on a real
// building's frontage (docs/notes/ar33-frontage/*.json edges), for side-by-sides twin camera
async function placeWalls(o, E, S) {
  const g = new THREE.Group(); g.name = 'pbrBoard';
  const ground = (x, z) => { const t = S && S.terrainAt ? S.terrainAt(x, z) : null; return t !== null && isFinite(t) ? t : 0; };
  for (const w of o.walls) {
    const [ax, az] = w.a, [bx, bz] = w.b;
    const hd = (w.hdg * Math.PI) / 180, nx = Math.sin(hd), nz = -Math.cos(hd);
    const len = Math.hypot(bx - ax, bz - az), out = w.out ?? 0.3, h = w.h ?? 10;
    const mx = (ax + bx) / 2 + nx * out, mz = (az + bz) / 2 + nz * out;
    const gy = Math.min(ground(ax, az), ground(bx, bz)) + (w.y0 ?? 0);
    const m = pbrMaterial(w.name, { ...(w.opts || {}), baseY: ground(mx, mz), topY: gy + h });
    const mesh = new THREE.Mesh(slab(len, h, 0.2), m);
    mesh.position.set(mx, gy + h / 2, mz); mesh.rotation.y = Math.atan2(nx, nz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  E.scene.add(g); _group = g;
  await pbrReady;
  await new Promise((res) => setTimeout(res, o.settle ?? 3000));
  return `walls: ${o.walls.length}`;
}

// AR34: applyCityRefl on plain MeshStandardMaterials built as the kit builds its own (fk/kitMats.js S(): applyLightTrim then
// applyCityAO): each pair without / with it, in front of the camera (the kit's fire-escape iron, a dark grey plain paint)
export async function placeRefl(o = {}) {
  const E = window.__ENGINE, S = window.__STREAMER;
  if (!E) return 'no engine';
  if (_group) { E.scene.remove(_group); _group = null; }
  const cam = E.camera;
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const ground = (x, z) => { const t = S && S.terrainAt ? S.terrainAt(x, z) : null; return t !== null && isFinite(t) ? t : 0; };
  const yaw = Math.atan2(-dir.x, -dir.z);
  const mk = (c, r, m, city) => { const mat = applyCityAO(applyLightTrim(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }))); return city ? applyCityRefl(mat) : mat; };
  const P = [['iron', 0x1e201f, 0.62, 0.08, false], ['iron+city', 0x1e201f, 0.62, 0.08, true], ['plain', 0x3b3e41, 0.6, 0, false], ['plain+city', 0x3b3e41, 0.6, 0, true]];
  const g = new THREE.Group(); g.name = 'pbrBoard';
  const centre = cam.position.clone().addScaledVector(dir, o.dist ?? 8.5);
  P.forEach(([n, c, r, m, city], i) => {
    const p = centre.clone().addScaledVector(right, (i - 1.5) * 1.4);
    const gy = ground(p.x, p.z) + (o.lift ?? 1.9);
    const mesh = new THREE.Mesh(slab(1.15, 1.15, 0.25), mk(c, r, m, city));
    mesh.position.set(p.x, gy + 0.575, p.z); mesh.rotation.y = yaw;
    g.add(mesh);
    const l = label(n); l.position.set(p.x, gy + 1.3, p.z); l.rotation.y = yaw; l.position.addScaledVector(dir, -0.14); g.add(l);
  });
  E.scene.add(g); _group = g;
  await new Promise((res) => setTimeout(res, o.settle ?? 4000));
  return 'refl: ' + P.length;
}
// AR34 s6 A/B board (the per-vertex options): 12 panels in front of the lens; odd calls draw them with per-material options
// (dirt, seed, base, top, tint, body as uniforms), even calls with one material per set and the same values per vertex
// (aWeather.w the dirt, aFkTr / aPgBody the tower glass's tint, body and dirt).
export async function placeAB(opt = {}) {
  // opt.lift: the lowest row's height over the ground (2.2 = over the pedestrians); opt.same: also render both variants into
  // a float target in this frame (the same lights, people and shadows; no post) and compare them texel by texel
  const L = await import('./pbrLib.js');
  const E = window.__ENGINE, S = window.__STREAMER;
  window.__PBAB = (window.__PBAB || 0) + 1;
  const attr = !opt.same && window.__PBAB % 2 === 0;
  for (const k of ['__PBAB_G', '__PBAB_GA']) if (window[k]) { E.scene.remove(window[k]); window[k] = null; }
  const P = [
    ['brick_red', { tint: '#8e4a36', dirt: 0.6, seed: 3 }], ['stone_lime', { dirt: 0.45, seed: 5 }], ['stucco', { tint: '#cfc8b8', dirt: 0.85, seed: 9 }], ['terracotta_cream', { dirt: 0.3, seed: 11 }],
    ['metal_painted', { tint: '#94645a', chips: 0.3, seed: 2 }], ['steel_black', { dirt: 0.2, seed: 4 }], ['panel_grey', { dirt: 0.5, seed: 6 }], ['brick_buff', { dirt: 0.2, seed: 8 }],
    ['glass_tower_blue', { tint: '#9fb8c6', body: '#62788a' }], ['glass_tower_grey', { tint: '#b9c2c7', body: '#3b444b', dirt: 0.4 }], ['glass_tower_green', {}], ['glass_tower_bronze', { tint: '#c2a88c', body: '#9a9284', dirt: 0.3 }],
  ];
  const srgbLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const hexLin = (h) => [1, 3, 5].map((i) => srgbLin(parseInt(h.slice(i, i + 2), 16) / 255));
  const cam = E.camera;
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const dist = 8.5, w = 1.05, h = 1.15, gap = 0.2, cols = 4, rows = 3, lift = opt.lift ?? 0.3;
  const centre = cam.position.clone().addScaledVector(dir, dist);
  const ground = (x, z) => { const t = S && S.terrainAt ? S.terrainAt(x, z) : null; return t !== null && isFinite(t) ? t : 0; };
  const yaw = Math.atan2(-dir.x, -dir.z);
  const slab = () => {
    const b = new THREE.BoxGeometry(w, h, 0.25);
    const uv = b.getAttribute('uv'), nrm = b.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      uv.setXY(i, uv.getX(i) * (nx > 0.5 ? 0.25 : w), uv.getY(i) * (ny > 0.5 ? 0.25 : h));
    }
    return b;
  };
  const build = (asAttr) => {
    const g = new THREE.Group(); g.name = asAttr ? 'pbrBoardAB_attr' : 'pbrBoardAB';
    P.forEach(([name, o], i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const p = centre.clone().addScaledVector(right, (c - (cols - 1) / 2) * (w + gap));
      const gy0 = ground(p.x, p.z);
      const gy = gy0 + lift + (rows - 1 - r) * (h + 0.45);
      const geo = slab();
      const n = geo.getAttribute('position').count;
      const glass = /^glass/.test(name);
      let m;
      if (!asAttr) {
        m = glass ? L.pbrMaterial(name, o) : L.pbrMaterial(name, { ...o, baseY: gy0, topY: gy + h });
      } else if (glass) {
        m = L.pbrMaterial(name, { tintAttr: true });
        const base = L.pbrInfo(name).mean;
        const tl = o.tint ? hexLin(o.tint) : null, bl0 = hexLin(base);
        const tr = new Float32Array(n * 3), bo = new Float32Array(n * 4);
        const bl = o.body ? hexLin(o.body) : null;
        for (let j = 0; j < n; j++) {
          for (let q = 0; q < 3; q++) tr[j * 3 + q] = tl ? tl[q] / bl0[q] : 1;
          bo[j * 4] = bl ? bl[0] : -1; bo[j * 4 + 1] = bl ? bl[1] : -1; bo[j * 4 + 2] = bl ? bl[2] : -1; bo[j * 4 + 3] = o.dirt ?? -1;
        }
        geo.setAttribute('aFkTr', new THREE.BufferAttribute(tr, 3));
        geo.setAttribute('aPgBody', new THREE.BufferAttribute(bo, 4));
      } else {
        const { dirt, seed, ...rest } = o;
        m = L.pbrMaterial(name, { ...rest, weatherAttr: true, dirtAttr: true });
        const we = new Float32Array(n * 4);
        for (let j = 0; j < n; j++) { we[j * 4] = seed ?? 0; we[j * 4 + 1] = gy0; we[j * 4 + 2] = gy + h; we[j * 4 + 3] = dirt ?? -1; }
        geo.setAttribute('aWeather', new THREE.BufferAttribute(we, 4));
      }
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(p.x, gy + h / 2, p.z); mesh.rotation.y = yaw;
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    });
    return g;
  };
  const g = build(attr);
  E.scene.add(g);
  window.__PBAB_G = g;
  let ga = null;
  if (opt.same) { ga = build(true); ga.visible = false; E.scene.add(ga); window.__PBAB_GA = ga; }
  await L.pbrReady;
  for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 4000));
  const R = E.renderer;
  const out = { view: window.__PBAB, attr, same: !!opt.same, lift, programs: R.info.programs.length };
  if (opt.same) {
    // three renders in one tick into a float target: the board with options as uniforms, the same board per vertex, and
    // neither (the board's own pixels are those the first two change)
    const W = 800, Hh = 450;
    const rt = new THREE.WebGLRenderTarget(W, Hh, { type: THREE.FloatType });
    // (a pixel-pack buffer the page leaves bound makes a read into an array fail: unbind it first)
    const gl = R.getContext();
    const read = () => { const b = new Float32Array(W * Hh * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); R.readRenderTargetPixels(rt, 0, 0, W, Hh, b); return b; };
    const prev = R.getRenderTarget();
    const shot = (u, a) => { g.visible = u; ga.visible = a; R.setRenderTarget(rt); R.render(E.scene, cam); return read(); };
    const bU = shot(true, false), bA = shot(false, true), bN = shot(false, false), bU2 = shot(true, false);
    R.setRenderTarget(prev); g.visible = true; ga.visible = false;
    let px = 0, maxD = 0, sumD = 0, nD = 0, maxRep = 0, sumU = 0;
    for (let i = 0; i < W * Hh; i++) {
      let board = false, d = 0, rep = 0;
      for (let c = 0; c < 3; c++) {
        const k = i * 4 + c;
        if (Math.abs(bU[k] - bN[k]) > 1e-6 || Math.abs(bA[k] - bN[k]) > 1e-6) board = true;
        d = Math.max(d, Math.abs(bU[k] - bA[k]) / Math.max(Math.abs(bU[k]), 1e-3));
        rep = Math.max(rep, Math.abs(bU[k] - bU2[k]));
      }
      maxRep = Math.max(maxRep, rep);
      if (!board) continue;
      px++; sumU += bU[i * 4 + 1];
      maxD = Math.max(maxD, d); sumD += d; if (d > 1e-3) nD++;
    }
    rt.dispose();
    let tot = 0; for (let i = 0; i < bN.length; i += 4) tot += bN[i + 1];
    out.sameFrame = { frameMeanG: +(tot / (W * Hh)).toFixed(4), boardPixels: px, maxRelDiff: +maxD.toExponential(2), meanRelDiff: +(sumD / Math.max(px, 1)).toExponential(2), pixelsOver1e3: nD, repeatMaxAbs: +maxRep.toExponential(2), meanG: +(sumU / Math.max(px, 1)).toFixed(4) };
  }
  out.stats = L.pbrStats ? L.pbrStats() : null;
  return out;
}
