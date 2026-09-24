// Parametric NYC bridge kit — builds visual meshes + colliders + traffic decks
// from real CSCL alignments (bridges.json emitted by the compiler).
import * as THREE from 'three';
import { COLLIDERS } from './colliders.js';
import { mergeGeometries as mergeBG } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
function M(hex, opts = {}) {
  const k = hex + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
  return matCache.get(k);
}
const STEEL = {
  brooklyn: 0xb9a888, manhattanBr: 0x5b7da0, williamsburg: 0x8a9098, queensboro: 0xb5a284,
  gwb: 0x8d979f, rfk: 0x53616e, hellgate: 0x7a3530, henryHudson: 0x3f5a70, washingtonBr: 0x7a8288,
  hamiltonBr: 0x8a9298, highBr: 0x9a8f78, macombs: 0x4e7a56, br145: 0x518060, madisonAv: 0x4e7a56,
  thirdAv: 0x6a7278, willis: 0x4e7a56, universityHts: 0x5a7a62, broadwayBr: 0x5b7da0,
  rooseveltBr: 0x8a4a42, pulaski: 0x8a3a32, wardsFoot: 0x3f6a5a,
};

function deckColor() { return 0x2c2c2e; }

function box(parent, w, h, d, hex, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(hex));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  parent.add(m);
  return m;
}

function sampleAt(deck, t) {
  // t in 0..1 along deck point list
  const i = Math.min(deck.length - 2, Math.floor(t * (deck.length - 1)));
  const f = t * (deck.length - 1) - i;
  const a = deck[i], b = deck[i + 1];
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const L = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + dz * f, dirx: dx / L, dirz: dz / L };
}
function deckLength(deck) {
  let L = 0;
  for (let i = 1; i < deck.length; i++) L += Math.hypot(deck[i][0] - deck[i - 1][0], deck[i][2] - deck[i - 1][2]);
  return L;
}

function buildDeckRibbon(group, deck, width, steelHex, opts = {}) {
  const pos = [], nrm = [], col = [];
  const c = new THREE.Color(deckColor());
  const cSide = new THREE.Color(steelHex).multiplyScalar(0.75);
  const pushQuad = (a, b, cc, d, n, color) => {
    for (const p of [a, b, cc, a, cc, d]) { pos.push(...p); nrm.push(...n); col.push(color.r, color.g, color.b); }
  };
  const w2 = width / 2, girder = opts.foot ? 0.8 : 2.2;
  for (let i = 0; i < deck.length - 1; i++) {
    const A = deck[i], B = deck[i + 1];
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    // top
    pushQuad(
      [A[0] + nx * w2, A[1], A[2] + nz * w2], [A[0] - nx * w2, A[1], A[2] - nz * w2],
      [B[0] - nx * w2, B[1], B[2] - nz * w2], [B[0] + nx * w2, B[1], B[2] + nz * w2],
      [0, 1, 0], c);
    // sides + bottom
    for (const s of [1, -1]) {
      pushQuad(
        [A[0] + nx * w2 * s, A[1] - girder, A[2] + nz * w2 * s], [A[0] + nx * w2 * s, A[1], A[2] + nz * w2 * s],
        [B[0] + nx * w2 * s, B[1], B[2] + nz * w2 * s], [B[0] + nx * w2 * s, B[1] - girder, B[2] + nz * w2 * s],
        [nx * s, 0, nz * s], cSide);
    }
    pushQuad(
      [A[0] - nx * w2, A[1] - girder, A[2] - nz * w2], [A[0] + nx * w2, A[1] - girder, A[2] + nz * w2],
      [B[0] + nx * w2, B[1] - girder, B[2] + nz * w2], [B[0] - nx * w2, B[1] - girder, B[2] - nz * w2],
      [0, -1, 0], cSide);
    // railings
    for (const s of [1, -1]) {
      pushQuad(
        [A[0] + nx * (w2 - 0.15) * s, A[1] + 1.15, A[2] + nz * (w2 - 0.15) * s], [A[0] + nx * w2 * s, A[1] + 1.15, A[2] + nz * w2 * s],
        [B[0] + nx * w2 * s, B[1] + 1.15, B[2] + nz * w2 * s], [B[0] + nx * (w2 - 0.15) * s, B[1] + 1.15, B[2] + nz * (w2 - 0.15) * s],
        [0, 1, 0], cSide);
      pushQuad(
        [A[0] + nx * w2 * s, A[1], A[2] + nz * w2 * s], [A[0] + nx * w2 * s, A[1] + 1.15, A[2] + nz * w2 * s],
        [B[0] + nx * w2 * s, B[1] + 1.15, B[2] + nz * w2 * s], [B[0] + nx * w2 * s, B[1], B[2] + nz * w2 * s],
        [nx * s, 0, nz * s], cSide);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function towerGothic(group, x, z, dirx, dirz, deckY, topY, width, hex) {
  // Brooklyn Bridge: granite, two pointed arches
  const g = new THREE.Group();
  const across = Math.atan2(dirx, dirz) + Math.PI / 2;
  const H = topY, W = width + 7;
  box(g, W, H, 7, hex, 0, H / 2 - 12, 0);                       // main mass
  box(g, W + 2.5, 3, 9, hex, 0, H - 1, 0);                      // cap
  box(g, W + 1.5, 2, 8, hex, 0, deckY - 6, 0);                  // deck band
  // arch cutouts (fake with dark inset boxes)
  const dark = 0x2a2620;
  for (const s of [-1, 1]) {
    box(g, width / 2 - 2, deckY * 0.9, 7.6, dark, s * (width / 4 + 0.5), deckY * 0.28 + deckY * 0.16, 0);
    // pointed arch tops
    const cone = new THREE.Mesh(new THREE.ConeGeometry((width / 4) - 1.2, 12, 4), M(dark));
    cone.position.set(s * (width / 4 + 0.5), deckY * 0.73 + 8, 0);
    cone.rotation.y = Math.PI / 4;
    g.add(cone);
    box(g, width / 2 - 2, (H - deckY) * 0.5, 7.6, dark, s * (width / 4 + 0.5), deckY + (H - deckY) * 0.3, 0);
  }
  g.position.set(x, 0, z);
  g.rotation.y = across;
  group.add(g);
  COLLIDERS.addBox('bridges', { x, y: H / 2, z, hw: (W) / 2, hh: H / 2, hd: 3.5, rotY: across });
}
function towerSteel(group, x, z, dirx, dirz, deckY, topY, width, hex, lattice = false) {
  const g = new THREE.Group();
  const across = Math.atan2(dirx, dirz) + Math.PI / 2;
  const H = topY;
  for (const s of [-1, 1]) {
    const lx = s * (width / 2 + 1.2);
    box(g, 3.4, H, 3.4, hex, lx, H / 2, 0);
    if (lattice) for (let y = 8; y < H - 6; y += 14) {
      const d1 = box(g, 0.7, 16, 0.7, hex, lx, y + 7, 0);
      d1.rotation.z = 0.55 * s;
    }
  }
  for (let y = deckY + 8; y < H; y += (H - deckY - 6) / 3) box(g, width + 4, 2.6, 2.8, hex, 0, y, 0);
  box(g, width + 5, 3, 3.4, hex, 0, H - 1.5, 0);
  g.position.set(x, 0, z);
  g.rotation.y = across;
  group.add(g);
  COLLIDERS.addBox('bridges', { x, y: H / 2, z, hw: width / 2 + 3, hh: H / 2, hd: 2.2, rotY: across });
}

function suspensionCables(group, br, hex) {
  const deck = br.deck, W = br.width;
  const L = deckLength(deck);
  const [t1, t2] = br.towers.map((tw) => {
    // param along deck for tower
    let best = 0, bd = 1e9;
    for (let i = 0; i < 200; i++) {
      const s = sampleAt(deck, i / 199);
      const d = Math.hypot(s.x - tw.x, s.z - tw.z);
      if (d < bd) { bd = d; best = i / 199; }
    }
    return best;
  });
  const topY = br.towerH;
  const cableY = (t) => {
    // piecewise: anchor->tower1 (parabola), tower1->tower2 (sag), tower2->anchor
    const dy = sampleAt(deck, t).y;
    if (t < t1) { const u = t / t1; return dy + 2 + (topY - dy - 2) * u * u; }
    if (t > t2) { const u = (1 - t) / (1 - t2); return dy + 2 + (topY - dy - 2) * u * u; }
    const u = (t - t1) / (t2 - t1);
    const mid = sampleAt(deck, (t1 + t2) / 2).y + 3;
    return topY + (mid - topY) * (1 - (2 * u - 1) * (2 * u - 1));
  };
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const s = sampleAt(deck, t);
      pts.push(new THREE.Vector3(s.x - s.dirz * side * (W / 2 - 0.4), cableY(t), s.z + s.dirx * side * (W / 2 - 0.4)));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.42, 6, false), M(hex));
    group.add(tube);
    // suspenders
    const susGeo = [];
    for (let i = 2; i <= 118; i += 2) {
      const t = i / 120;
      const s = sampleAt(deck, t);
      const cy = cableY(t);
      if (cy - s.y < 1.5) continue;
      const x = s.x - s.dirz * side * (W / 2 - 0.4), z = s.z + s.dirx * side * (W / 2 - 0.4);
      const h = cy - s.y;
      const g2 = new THREE.CylinderGeometry(0.07, 0.07, h, 4);
      g2.translate(x, s.y + h / 2, z);
      susGeo.push(g2);
    }
    if (susGeo.length) {
      const merged = mergeGeos(susGeo);
      group.add(new THREE.Mesh(merged, M(hex)));
    }
  }
}
function mergeGeos(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3);
  let o = 0;
  const idxGeos = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    idxGeos.push(ng);
  }
  total = 0;
  for (const g of idxGeos) total += g.attributes.position.count;
  const pos2 = new Float32Array(total * 3), nrm2 = new Float32Array(total * 3);
  o = 0;
  for (const g of idxGeos) {
    pos2.set(g.attributes.position.array, o * 3);
    nrm2.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm2, 3));
  return out;
}

function trussSpan(group, deck, t0, t1, height, hex, W) {
  // repeating X-brace side trusses + top chords between params t0..t1
  const boxes = [];
  const L = deckLength(deck) * (t1 - t0);
  const n = Math.max(4, Math.floor(L / 12));
  for (let i = 0; i < n; i++) {
    const t = t0 + ((i + 0.5) / n) * (t1 - t0);
    const s = sampleAt(deck, t);
    const profile = height * (0.55 + 0.45 * Math.cos(((t - (t0 + t1) / 2) / ((t1 - t0) / 2)) * Math.PI * 0.5));
    for (const side of [-1, 1]) {
      const x = s.x - s.dirz * side * (W / 2), z = s.z + s.dirx * side * (W / 2);
      const g1 = new THREE.BoxGeometry(0.55, profile, 0.55);
      g1.translate(x, s.y + profile / 2, z);
      boxes.push(g1);
      const d = new THREE.BoxGeometry(0.4, Math.hypot(profile, 12), 0.4);
      d.rotateZ(Math.atan2(12 * (i % 2 === 0 ? 1 : -1), profile));
      d.rotateY(Math.atan2(s.dirx, s.dirz));
      d.translate(x, s.y + profile / 2, z);
      boxes.push(d);
    }
    // top lateral
    const gl = new THREE.BoxGeometry(W + 0.5, 0.5, 0.5);
    gl.rotateY(Math.atan2(s.dirx, s.dirz) + Math.PI / 2);
    gl.translate(s.x, s.y + profile, s.z);
    boxes.push(gl);
  }
  group.add(new THREE.Mesh(mergeGeos(boxes), M(hex)));
}
function archSpan(group, deck, t0, t1, rise, hex, W, above = false) {
  const boxes = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = t0 + (i / n) * (t1 - t0);
    const s = sampleAt(deck, t);
    const u = (t - (t0 + t1) / 2) / ((t1 - t0) / 2); // -1..1
    const archY = s.y + (above ? 1 : -1) * rise * (1 - u * u) - (above ? 0 : 2);
    for (const side of [-1, 1]) {
      const x = s.x - s.dirz * side * (W / 2 - 0.5), z = s.z + s.dirx * side * (W / 2 - 0.5);
      const seg = new THREE.BoxGeometry(1.3, 2.2, deckLength(deck) * (t1 - t0) / n + 1);
      seg.rotateY(Math.atan2(s.dirx, s.dirz));
      seg.translate(x, archY, z);
      boxes.push(seg);
      // spandrel/hanger
      const h = Math.abs(archY - s.y);
      if (h > 2.5) {
        const c = new THREE.BoxGeometry(0.5, h, 0.5);
        c.translate(x, Math.min(archY, s.y) + h / 2, z);
        boxes.push(c);
      }
    }
  }
  group.add(new THREE.Mesh(mergeGeos(boxes), M(hex)));
}

// A bridge is built from hundreds of small parts (hanger boxes, piers, cones);
// as separate meshes they were ~630 draw calls per frame on their own. Merge
// every part sharing a material into one static mesh per material.
function mergeBridgeGroup(bg) {
  bg.updateMatrixWorld(true);
  const meshes = [];
  bg.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const byMat = new Map();
  for (const m of meshes) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const list = byMat.get(m.material) || [];
    list.push(g);
    byMat.set(m.material, list);
  }
  const out = new THREE.Group();
  let merged = 0;
  for (const [mat, geos] of byMat) {
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]));
    for (const g of geos) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    const allIndexed = geos.every((g) => g.index);
    const ready = allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const mg = mergeBG(ready, false);
    if (!mg) {
      // attribute mismatch: keep these parts as they were
      for (const m of meshes) if (m.material === mat) out.add(m.clone());
      continue;
    }
    mg.computeBoundingSphere();
    const mesh = new THREE.Mesh(mg, mat);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
    merged += geos.length;
  }
  for (const m of meshes) m.geometry.dispose();
  out.userData.merged = merged;
  return out;
}

export function buildBridges(bridges, scene, streamer) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const trafficDecks = [];
  for (const br of bridges) {
    if (!br.deck || br.deck.length < 2) continue;
    const hex = STEEL[br.key] ?? 0x707880;
    const W = Math.min(38, br.width);
    const bg = new THREE.Group();
    buildDeckRibbon(bg, br.deck, W, hex, { foot: br.foot });
    const L = deckLength(br.deck);
    const [w0, w1] = br.waterRun;
    const t0 = Math.max(0.02, w0 / L), t1 = Math.min(0.98, w1 / L);
    if (br.type === 'suspension') {
      for (const tw of br.towers) {
        const fn = br.tower === 'gothic' ? towerGothic : towerSteel;
        fn(bg, tw.x, tw.z, tw.dirx, tw.dirz, tw.deckY, br.towerH, W, hex);
      }
      suspensionCables(bg, { ...br, width: W }, hex);
    } else if (br.type === 'cantilever') {
      trussSpan(bg, br.deck, t0, t1, 32, hex, W + 1);
      for (const tw of br.towers) towerSteel(bg, tw.x, tw.z, tw.dirx, tw.dirz, tw.deckY, br.towerH * 0.6, W, hex);
    } else if (br.type === 'arch' || br.type === 'archRail') {
      archSpan(bg, br.deck, t0, t1, br.type === 'archRail' ? 34 : 22, hex, W + 2, br.type === 'archRail');
    } else if (br.type === 'swing' || br.type === 'lift' || br.type === 'bascule') {
      trussSpan(bg, br.deck, Math.max(0.3, t0), Math.min(0.7, t1), 9, hex, W + 1);
      // center pier
      const mid = sampleAt(br.deck, (t0 + t1) / 2);
      box(bg, 10, mid.y, 12, 0x8a8578, mid.x, mid.y / 2 - 1, mid.z, Math.atan2(mid.dirx, mid.dirz));
    }
    // approach piers
    for (let d = 15; d < L - 10; d += 24) {
      const t = d / L;
      if (t > t0 - 0.02 && t < t1 + 0.02 && (br.type === 'suspension' || br.type === 'archRail')) continue;
      const s = sampleAt(br.deck, t);
      const ground = streamer ? 1.0 : 1.0;
      const h = s.y - 2.2;
      if (h < 4) continue;
      box(bg, 2.6, h, W * 0.7, 0x77716a, s.x, h / 2, s.z, Math.atan2(s.dirx, s.dirz));
    }
    // deck colliders (per 2 segments) — only where the deck is genuinely elevated,
    // otherwise at-grade approaches become invisible walls across streets
    for (let i = 0; i < br.deck.length - 1; i += 2) {
      const A = br.deck[i], B = br.deck[Math.min(i + 2, br.deck.length - 1)];
      const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, cz = (A[2] + B[2]) / 2;
      const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
      if (len < 1) continue;
      const endA = br.deck[0][1], endB = br.deck[br.deck.length - 1][1];
      const nearEnd = i < br.deck.length / 2 ? endA : endB;
      if (cy - nearEnd < 2.8) continue; // at-grade approach: no invisible wall across the street
      COLLIDERS.addBox('bridges', { x: cx, y: cy - 1.2, z: cz, hw: len / 2 + 1, hh: 1.2, hd: W / 2, rotY: -Math.atan2(B[2] - A[2], B[0] - A[0]) });
    }
    if (!br.foot) trafficDecks.push({ pts: br.deck.map((p) => [...p]), width: W, lanes: Math.max(2, Math.round(W / 3.6)), speed: 40, oneway: 0, rclass: 3, name: br.name, level: 1 });
    group.add(mergeBridgeGroup(bg));
  }
  scene.add(group);
  if (streamer) streamer.bridgeRoads = trafficDecks;
  return group;
}
