// CARLA 0.10 vehicle blueprint -> web-ready multi-LOD GLB for the NYC twin's fleet (boundlessjs/public/models/fleet24).
//   node tools/assets/build_vehicle.mjs <kind|all> [--notex] [--out <dir>]
//
// Assembly follows the blueprint exactly: the skeletal body, door meshes on their Door_* sockets, door glass parented to
// the doors, body glass and lamp shells on the vehicle root. Materials collapse into runtime classes (paint, detail
// atlases, glass, lens, lamp, lampInner, siren); wheels are tagged per vertex (_WHEEL 1..4 = FL FR RL RR) from the
// skin joints (LOD0) or the hub cylinders (LOD1/2); lamp vertices carry a role (_LAMP, see ROLE). Output frame: +Z
// forward, +Y up, origin at the ground centre, right side at -X — the traffic sim's convention (sim/vehicles.js).
// Sources: CARLA 0.10.0 content, CC-BY 4.0 (boundlessjs/DATA_SOURCES.md).
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { mul, applyPoint, applyDir, normalMatrix, det3 } from './lib/mat4.mjs';
import { readBlueprint, componentWorlds, readMaterial, findTexture, EXPORT_ROOT, JSON_ROOT } from './lib/ue.mjs';
import { makeTexture, sampler } from './lib/tex.mjs';
import { TAXI_OUT } from './livery_taxi.mjs';
import { PLATE_OUT } from './livery_plate.mjs';
import { BOXTRUCK_SRC, BOXTRUCK_OUT } from './livery_boxtruck.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const OUT = opt('out', path.join(ROOT, 'boundlessjs/public/models/fleet24'));
const NOTEX = !!opt('notex', false);

const S = 'CarlaUnreal/Content/Carla/Static/';
// NYC liveries painted over CARLA's decal sheets (livery_*.mjs writes them; missing file = CARLA original)
const TEX_OVERRIDE = { T_FordCrown2024_Bodywork_BaseColor: TAXI_OUT, T_LicensePlate_d: PLATE_OUT, [BOXTRUCK_SRC]: BOXTRUCK_OUT };   // plate: CARLA's "California CARLA" -> NY Empire Gold
// kind -> blueprint, parked (LOD1) mesh + its glass, paint handling
export const KINDS = {
  taxi: { bp: 'BP_Ford_Crown2024', parked: S + 'Car/4Wheeled/FordCrown2024/Parked/SM_FordCrown2024_Parked', parkedGlass: S + 'Car/4Wheeled/FordCrown2024/Parked/SM_FordCrown2024_Parked_Glass', livery: true },
  lincoln: { bp: 'BP_Lincoln2024', parked: S + 'Car/4Wheeled/LincolnMKZ2024/Parked/SM_LincolnMKZ2024Parked', parkedGlass: S + 'Car/4Wheeled/LincolnMKZ2024/Parked/SM_LincolnMKZ2024_parked_glass' },
  charger: { bp: 'BP_Charger2024', parked: S + 'Car/4Wheeled/DodgeCharger2024/Parked/SM_DodgeCharger2024Parked', parkedGlass: S + 'Car/4Wheeled/DodgeCharger2024/Parked/SM_DodgeCharger2024Parked_Glass' },
  police: { bp: 'BP_ChargerCop2024', parked: S + 'Car/4Wheeled/DodgeCharger2024/DodgeChargerCop2024/Parked/SM_DodgeChargerCop2024Parked', parkedGlass: S + 'Car/4Wheeled/DodgeCharger2024/DodgeChargerCop2024/Parked/SM_DodgePolice2024Parked_glass', livery: true },
  // scale: CARLA's Mini2024 is ~8 % over a real Mini (4.55 m long); the Fuso Rosa is authored ~1.55x (wheelbase 5.64 m vs
  // the real bus's 3.49 m, 1.26 m wheels — the legacy fleet already ran it at 0.645)
  mini: { scale: 0.93, bp: 'BP_Mini2024', parked: S + 'Car/4Wheeled/Mini2024/Parked/SM_MiniCooper2024Parked', parkedGlass: S + 'Car/4Wheeled/Mini2024/Parked/SM_MiniCooper2024Parked_glass' },
  suv: { bp: 'BP_NissanPatrol2024', parked: S + 'Car/4Wheeled/NissanPatrol2024/Parked/SM_Patrol2024_Parked', parkedGlass: S + 'Car/4Wheeled/NissanPatrol2024/Parked/SM_Patrol2024_Parked_glass' },
  van: { bp: 'BP_Sprinter2024', parked: S + 'Truck/Sprinter2024/Parked/SM_MercedesSprinter_Parked', parkedGlass: S + 'Truck/Sprinter2024/Parked/SM_Sprinter_Parked_Glass' },
  ambulance: { bp: 'BP_Ambulance2024', livery: true },
  boxtruck: { bp: 'BP_CarlaCola2024', parked: S + 'Truck/CarlaCola2024/SM_CarlaCola2024Parked', parkedGlass: S + 'Truck/CarlaCola2024/SM_CarlaCola2024Parked_Glasses', livery: true },
  minibus: { scale: 0.645, bp: 'BP_FusoRosa2024', parked: S + 'Bus/Mitsubishi_FusoRosa2024/Parked/SM_FusoRosa2024Parked', parkedGlass: S + 'Bus/Mitsubishi_FusoRosa2024/Parked/SM_FusoRosa2024Parked_glass' },
  firetruck: { bp: 'BP_FireTruck2024', livery: true },
  // older CARLA content still in the 0.10 package (PV2 variety pass: NYC traffic is mostly US sedans and SUVs). The BMW
  // Gran Turismo is left out: its body material was never exported and its lamps use names classify() does not know.
  impala: { bp: 'BP_ChevroletImpala' },
  mercedes: { bp: 'BP_MercedesCCC', parked: S + 'Car/4Wheeled/ParkedVehicles/MercedesCCC/SM_MercedesCCC_Parked', parkedGlass: S + 'Car/4Wheeled/ParkedVehicles/MercedesCCC/SM_MercedesCCC_Parked_glass' },
};

// lamp roles (per vertex, _LAMP): 1 head/DRL, 2 front blinker L, 3 front blinker R, 4 tail+brake, 5 rear blinker L,
// 6 rear blinker R, 7 reverse, 8 siren red, 9 siren blue
export const ROLE = { head: 1, fbl: 2, fbr: 3, tail: 4, rbl: 5, rbr: 6, rev: 7, sirenR: 8, sirenB: 9 };

// ---------------- material classes ----------------
function classify(mat, comp, meshName) {
  const n = (mat || '').toLowerCase(), c = (comp || '').toLowerCase(), m = (meshName || '').toLowerCase();
  if (!mat || /worldgridmaterial|plaguedoll|^none$/.test(n) || /customcollision|plaguedoll|^sm_sc_/.test(c + ' ' + m)) return null;
  const isInt = /(^|_)int_?\d|int\d|_int_|glassint/.test(m) || /glassint/.test(n);
  const isExt2 = /ext_?2/.test(m);
  if (/siren/.test(n) || /glassint_(blue|red)/.test(n)) return 'siren';
  if (/glass.*light|light.*glass|lights_backup|glassintlights/.test(n)) return isInt ? 'lampInner' : (isExt2 ? null : 'lens');
  if (/glass/.test(n)) return isInt || isExt2 ? null : 'glass';
  if (/lights?(_|$)|vehiclelights/.test(n)) return 'lamp';
  if (/bodywork|bodtwork|carpaint/.test(n)) return 'paint';
  return 'detail';
}

// ---------------- geometry gathering ----------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const docCache = new Map();
async function loadGlb(pkg) {
  if (docCache.has(pkg)) return docCache.get(pkg);
  const f = path.join(EXPORT_ROOT, pkg + '.glb');
  const d = fs.existsSync(f) ? await io.read(f) : null;
  docCache.set(pkg, d);
  return d;
}

// runtime frame: glTF (x fwd, y up, z right) -> (x, y, z) = (-z, y, x): +Z forward, right side at -X
const toRt = (p) => [-p[2], p[1], p[0]];

// one bucket per (class, material)
function bucket(buckets, cls, mat) {
  const key = cls === 'detail' || cls === 'paint' ? `${cls}:${mat}` : cls;
  if (!buckets.has(key)) buckets.set(key, { key, cls, mat, pos: [], nrm: [], uv: [], idx: [], wheel: [], lamp: [], mats: new Set() });
  const b = buckets.get(key);
  b.mats.add(mat);
  return b;
}

// append a primitive under matrix M; wheelOf(vertexIndex) -> 0..4 (optional)
function addPrimitive(b, prim, M, wheelOf) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
  const I = prim.getIndices();
  const base = b.pos.length / 3;
  const nm = normalMatrix(M);
  const flip = det3(M) < 0;
  const v = [], n = [], t = [];
  for (let i = 0; i < P.getCount(); i++) {
    const p = toRt(applyPoint(M, P.getElement(i, v)));
    b.pos.push(p[0], p[1], p[2]);
    if (N) {
      let q = applyDir(nm, N.getElement(i, n));
      const l = Math.hypot(q[0], q[1], q[2]) || 1;
      q = toRt([q[0] / l, q[1] / l, q[2] / l]);
      b.nrm.push(q[0], q[1], q[2]);
    } else b.nrm.push(0, 1, 0);
    if (T) { const uv = T.getElement(i, t); b.uv.push(uv[0], uv[1]); } else b.uv.push(0, 0);
    b.wheel.push(wheelOf ? wheelOf(i) : 0);
    b.lamp.push(0);
  }
  const ia = I ? I.getArray() : null;
  const cnt = I ? I.getCount() : P.getCount();
  for (let k = 0; k < cnt; k += 3) {
    const a = ia ? ia[k] : k, b1 = ia ? ia[k + 1] : k + 1, c = ia ? ia[k + 2] : k + 2;
    if (flip) b.idx.push(base + a, base + c, base + b1); else b.idx.push(base + a, base + b1, base + c);
  }
}

async function gather(meshes) {
  // meshes: [{ pkg, M, comp, wheelFromSkin }]
  const buckets = new Map();
  const stats = {};
  for (const m of meshes) {
    const doc = await loadGlb(m.pkg);
    if (!doc) { console.warn('  missing glb', m.pkg); continue; }
    const meshName = m.pkg.split('/').pop();
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const M = mul(m.M, node.getWorldMatrix());
      const skin = node.getSkin();
      const jointNames = skin ? skin.listJoints().map((j) => j.getName()) : [];
      const wheelIds = jointNames.map((nm) => {
        const mm = /^wheel_(front|rear)_(left|right)$/i.exec(nm);
        if (!mm) return 0;
        return (mm[1].toLowerCase() === 'front' ? 1 : 3) + (mm[2].toLowerCase() === 'right' ? 1 : 0);
      });
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial()?.getName() || '';
        const cls = classify(mat, m.comp, meshName);
        const tris = (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
        const sk = `${cls || 'DROP'}:${mat}`;
        stats[sk] = (stats[sk] || 0) + tris;
        if (!cls) continue;
        let wheelOf = null;
        if (skin && m.wheelFromSkin) {
          const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
          if (J && W) {
            const jv = [], wv = [];
            wheelOf = (i) => {
              J.getElement(i, jv); W.getElement(i, wv);
              let best = 0, bw = -1;
              for (let k = 0; k < 4; k++) if (wv[k] > bw) { bw = wv[k]; best = jv[k]; }
              return wheelIds[best] || 0;
            };
          }
        }
        addPrimitive(bucket(buckets, cls, mat), prim, M, wheelOf);
      }
    }
  }
  return { buckets, stats };
}

// ---------------- helpers ----------------
function boundsOf(buckets, filter = () => true) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const b of buckets.values()) {
    if (!filter(b)) continue;
    for (let i = 0; i < b.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      if (b.pos[i + k] < mn[k]) mn[k] = b.pos[i + k];
      if (b.pos[i + k] > mx[k]) mx[k] = b.pos[i + k];
    }
  }
  return { mn, mx };
}
function translate(buckets, d) {
  for (const b of buckets.values()) for (let i = 0; i < b.pos.length; i += 3) { b.pos[i] += d[0]; b.pos[i + 1] += d[1]; b.pos[i + 2] += d[2]; }
}
// geometric wheel tagging for meshes without a skin (parked LODs): inside a hub cylinder (lateral axis = X)
function tagWheels(buckets, hubs) {
  for (const b of buckets.values()) {
    if (b.cls === 'glass' || b.cls === 'lamp' || b.cls === 'lens') continue;
    for (let i = 0, v = 0; i < b.pos.length; i += 3, v++) {
      const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2];
      for (const h of hubs) {
        if (Math.abs(x - h.p[0]) > h.w) continue;
        if (Math.hypot(y - h.p[1], z - h.p[2]) <= h.r * 1.02) { b.wheel[v] = h.id; break; }
      }
    }
  }
}
// lamp roles from position (front/rear, side) and lens colour sampled from LightColors at uv0
async function tagLamps(buckets, lenCar) {
  const lc = findTexture('LightColors');
  const col = lc ? await sampler(lc, 512) : null;
  for (const b of buckets.values()) {
    if (b.cls !== 'lamp' && b.cls !== 'lens' && b.cls !== 'lampInner' && b.cls !== 'siren') continue;
    for (let i = 0, v = 0; i < b.pos.length; i += 3, v++) {
      const x = b.pos[i], z = b.pos[i + 2];
      const front = z > 0, left = x > 0;
      if (b.cls === 'siren') { b.lamp[v] = left ? ROLE.sirenR : ROLE.sirenB; continue; }
      let c = 'white';
      if (col && b.cls === 'lamp') {
        const [r, g, bb] = col(b.uv[v * 2], b.uv[v * 2 + 1]);
        c = g < 60 ? 'red' : bb < 60 ? 'amber' : 'white';
      }
      if (front) b.lamp[v] = c === 'amber' ? (left ? ROLE.fbl : ROLE.fbr) : ROLE.head;
      else b.lamp[v] = c === 'amber' ? (left ? ROLE.rbl : ROLE.rbr) : ROLE.tail;   // reverse lamps are not simulated: white rear glass reads as tail
    }
  }
}

// ---------------- glTF writing ----------------
async function materialFor(doc, key, b, kindCfg, texCache) {
  const m = doc.createMaterial(key);
  const extras = { cls: b.cls, ue: [...b.mats] };
  const ue = readMaterial([...b.mats][0]);
  const tex = async (name, kind, size, mode = 'uastc') => {
    if (NOTEX || !name) return null;
    const f = TEX_OVERRIDE[name] && fs.existsSync(TEX_OVERRIDE[name]) ? TEX_OVERRIDE[name] : findTexture(name);
    if (!f) { console.warn('  texture not exported:', name); return null; }
    const k = `${f}|${kind}|${size}|${mode}`;
    if (!texCache.has(k)) {
      const r = await makeTexture(f, { kind, size, mode });
      const t = doc.createTexture(name).setImage(r.bytes).setMimeType('image/ktx2').setURI(`${name}_${size}.ktx2`);
      texCache.set(k, t);
    }
    return texCache.get(k);
  };
  const lin = (c) => [c[0], c[1], c[2]];
  if (b.cls === 'paint') {
    const t = ue?.textures || {};
    // legacy bodies feed flake / noise sheets (even an ASPHALT texture on the Impala) through Diffuse and ORM: not a paint map
    const diff = t.Diffuse && !/flat_white|flakes|asphalt|noise/i.test(t.Diffuse) ? t.Diffuse : null;
    const orm = t.PM_SpecularMasks && !/flat_orm|asphalt|noise/i.test(t.PM_SpecularMasks) ? t.PM_SpecularMasks : null;
    const bc = ue?.colors?.['Base Color'] || [0.5, 0.5, 0.5, 1];
    m.setBaseColorFactor([...lin(bc), 1]).setMetallicFactor(0).setRoughnessFactor(0.4);
    if (diff) m.setBaseColorTexture(await tex(diff, 'color', kindCfg.livery ? 2048 : 1024));
    if (orm) { const o = await tex(orm, 'data', 1024); if (o) { m.setMetallicRoughnessTexture(o); m.setOcclusionTexture(o); } }
    const cc = doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05);
    m.setExtension('KHR_materials_clearcoat', cc);
    extras.defaultColor = lin(bc);
    extras.decals = !!diff;
    extras.flakeDensity = ue?.scalars?.FlakeDensity ?? null;
  } else if (b.cls === 'detail') {
    const t = ue?.textures || {};
    const d = t.Diffuse || t.PM_Diffuse, n = t.Normal || t.PM_Normals, o = t.ORM || t.PM_SpecularMasks;
    const big = b.idx.length / 3 > 50000;
    m.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(ue?.scalars?.['Metallic Multiplier'] ?? 1)
      .setRoughnessFactor(Math.min(2, ue?.scalars?.['Roughness Multiply'] ?? 1));
    if (d && !/flat_white/i.test(d)) m.setBaseColorTexture(await tex(d, 'color', big ? 2048 : 1024));
    if (n && !/flat_n/i.test(n)) m.setNormalTexture(await tex(n, 'normal', big ? 2048 : 1024));
    if (o && !/flat_orm/i.test(o)) { const ot = await tex(o, 'data', 1024); if (ot) { m.setMetallicRoughnessTexture(ot); m.setOcclusionTexture(ot); } }
    extras.roughMul = ue?.scalars?.['Roughness Multiply'] ?? 1;
  } else if (b.cls === 'glass') {
    m.setBaseColorFactor([0.02, 0.025, 0.03, 0.35]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.03).setDoubleSided(false);
  } else if (b.cls === 'lens') {
    m.setBaseColorFactor([0.9, 0.9, 0.9, 0.12]).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.02);
  } else if (b.cls === 'lampInner') {
    m.setBaseColorFactor([0.02, 0.02, 0.02, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.25);
  } else if (b.cls === 'lamp') {
    m.setBaseColorFactor([0.85, 0.85, 0.85, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.2).setEmissiveFactor([0, 0, 0]);
  } else if (b.cls === 'siren') {
    m.setBaseColorFactor([0.5, 0.5, 0.5, 1]).setMetallicFactor(0).setRoughnessFactor(0.15);
  }
  if (ue?.twoSided) m.setDoubleSided(true);
  m.setExtras(extras);
  return m;
}

function writePrimitive(doc, buf, b, material) {
  const p = doc.createPrimitive().setMaterial(material);
  const acc = (arr, type, Ctor = Float32Array) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
  p.setAttribute('POSITION', acc(b.pos, 'VEC3'));
  p.setAttribute('NORMAL', acc(b.nrm, 'VEC3'));
  p.setAttribute('TEXCOORD_0', acc(b.uv, 'VEC2'));
  if (b.wheel.some((w) => w)) p.setAttribute('_WHEEL', acc(b.wheel, 'SCALAR'));
  if (b.lamp.some((w) => w)) p.setAttribute('_LAMP', acc(b.lamp, 'SCALAR'));
  const maxI = b.pos.length / 3;
  p.setIndices(acc(b.idx, 'SCALAR', maxI > 65535 ? Uint32Array : Uint16Array));
  return p;
}

// gltf-transform's Mesh.clone() SHARES its primitives (and a primitive clone shares accessors), so simplifying a
// "cloned" LOD rewrote the one it came from: copy every primitive and accessor
function deepCloneMesh(doc, mesh, name) {
  const out = doc.createMesh(name);
  for (const p of mesh.listPrimitives()) {
    const q = doc.createPrimitive().setMaterial(p.getMaterial()).setMode(p.getMode());
    for (const sem of p.listSemantics()) q.setAttribute(sem, p.getAttribute(sem).clone());
    if (p.getIndices()) q.setIndices(p.getIndices().clone());
    out.addPrimitive(q);
  }
  return out;
}

// ---------------- build ----------------
async function build(kind) {
  const cfg = KINDS[kind];
  const t0 = Date.now();
  console.log(`\n=== ${kind} (${cfg.bp})`);
  const comps = readBlueprint(path.join(JSON_ROOT, 'vehicles', cfg.bp + '.json'));
  const root = comps.find((c) => c.type === 'SkeletalMeshComponent');
  if (!root) throw new Error('no skeletal root in ' + cfg.bp);
  const skDoc = await loadGlb(root.mesh);
  if (!skDoc) throw new Error('root mesh not exported: ' + root.mesh);
  const K = cfg.scale || 1, SM = [K, 0, 0, 0, 0, K, 0, 0, 0, 0, K, 0, 0, 0, 0, 1];
  const sockets = new Map();
  const hubsG = [];
  for (const n of skDoc.getRoot().listNodes()) {
    if (!n.getName() || n.getMesh()) continue;
    const w = n.getWorldMatrix();
    sockets.set(n.getName(), w);
    const mm = /^wheel_(front|rear)_(left|right)$/i.exec(n.getName());
    if (mm) hubsG.push({ id: (mm[1].toLowerCase() === 'front' ? 1 : 3) + (mm[2].toLowerCase() === 'right' ? 1 : 0), g: [w[12] * K, w[13] * K, w[14] * K], name: n.getName() });
  }
  componentWorlds(comps, root.name, sockets);
  const lights = comps.filter((c) => c.light).map((c) => ({ name: c.name, p: toRt([c.world[12] * K, c.world[13] * K, c.world[14] * K]) }));
  const meshes = comps.filter((c) => c.mesh && !/customcollision/i.test(c.name))
    .map((c) => ({ pkg: c.mesh, M: K === 1 ? c.world : mul(SM, c.world), comp: c.name, wheelFromSkin: c === root }));
  const lod0 = await gather(meshes);
  // frame: ground at the lowest tyre point, x/z centred on the body envelope (glass/lamps included)
  const bb = boundsOf(lod0.buckets);
  const tyres = boundsOf(lod0.buckets, (b) => b.wheel.some((w) => w));
  const groundY = tyres.mn[1] < 1e8 ? tyres.mn[1] : bb.mn[1];
  const shift = [-(bb.mn[0] + bb.mx[0]) / 2, -groundY, -(bb.mn[2] + bb.mx[2]) / 2];
  translate(lod0.buckets, shift);
  const size = [bb.mx[0] - bb.mn[0], bb.mx[1] - groundY, bb.mx[2] - bb.mn[2]];
  // wheel hubs in the runtime frame, radius/width measured from the tagged vertices
  const hubs = hubsG.map((h) => {
    const p = toRt(h.g); p[0] += shift[0]; p[1] += shift[1]; p[2] += shift[2];
    let r = 0, x0 = 1e9, x1 = -1e9;
    for (const b of lod0.buckets.values()) for (let i = 0, v = 0; i < b.pos.length; i += 3, v++) {
      if (b.wheel[v] !== h.id) continue;
      r = Math.max(r, Math.hypot(b.pos[i + 1] - p[1], b.pos[i + 2] - p[2]));
      x0 = Math.min(x0, b.pos[i]); x1 = Math.max(x1, b.pos[i]);
    }
    return { id: h.id, p: p.map((v) => +v.toFixed(4)), r: +r.toFixed(4), w: +(Math.max(Math.abs(x0 - p[0]), Math.abs(x1 - p[0])) + 0.02).toFixed(4) };
  }).sort((a, b) => a.id - b.id);
  for (const l of lights) { l.p[0] += shift[0]; l.p[1] += shift[1]; l.p[2] += shift[2]; l.p = l.p.map((v) => +v.toFixed(3)); }
  await tagLamps(lod0.buckets, size[2]);
  const report = (tag, bk) => {
    let t = 0;
    const parts = [...bk.values()].map((b) => { const n = b.idx.length / 3; t += n; return `${b.key.replace(/^(detail|paint):MI_/, '$1:')}=${n}`; });
    console.log(`  ${tag}: ${t} tris  ${parts.join(' ')}`);
    return t;
  };
  console.log(`  size ${size.map((v) => v.toFixed(2)).join(' x ')} m  hubs ${hubs.map((h) => `${h.id}:${h.p.join(',')} r${h.r}`).join(' | ')}`);
  report('LOD0 raw', lod0.buckets);
  const dropped = Object.entries(lod0.stats).filter(([k]) => k.startsWith('DROP')).map(([k, v]) => `${k.slice(5)}=${v}`);
  if (dropped.length) console.log(`  dropped: ${dropped.join(' ')}`);

  // LOD1 = CARLA's parked mesh (same materials/UVs) when the vehicle has one
  let lod1 = null;
  if (cfg.parked) {
    const pm = [{ pkg: cfg.parked, M: SM, comp: 'Parked' }];
    if (cfg.parkedGlass) pm.push({ pkg: cfg.parkedGlass, M: pm[0].M, comp: 'ParkedGlass' });
    lod1 = await gather(pm);
    if (lod1.buckets.size) {
      translate(lod1.buckets, shift);
      const b1 = boundsOf(lod1.buckets);
      const dc = [(b1.mn[0] + b1.mx[0]) / 2, (b1.mn[2] + b1.mx[2]) / 2];
      if (Math.hypot(dc[0], dc[1]) > 0.08) console.warn(`  parked mesh centre off by ${dc.map((v) => v.toFixed(3))}`);
      tagWheels(lod1.buckets, hubs);
      await tagLamps(lod1.buckets, size[2]);
      report('LOD1 parked', lod1.buckets);
    } else lod1 = null;
  }

  // ---- document
  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const scene = doc.createScene(kind);
  const rootNode = doc.createNode(kind);
  scene.addChild(rootNode);
  const texCache = new Map();
  const matCache = new Map();
  const matOf = async (b) => {
    if (!matCache.has(b.key)) matCache.set(b.key, await materialFor(doc, b.key, b, cfg, texCache));
    return matCache.get(b.key);
  };
  const addLod = async (name, buckets) => {
    const mesh = doc.createMesh(name);
    for (const b of buckets.values()) if (b.idx.length) mesh.addPrimitive(writePrimitive(doc, buf, b, await matOf(b)));
    const node = doc.createNode(name).setMesh(mesh);
    rootNode.addChild(node);
    return mesh;
  };
  const m0 = await addLod('LOD0', lod0.buckets);
  const m1 = lod1 ? await addLod('LOD1', lod1.buckets) : null;
  // welding first so the simplifier sees connected surfaces
  await doc.transform(weld({ tolerance: 0.0001 }));
  await MeshoptSimplifier.ready;
  const tris = (mesh) => mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  // LOD0 budget: the details atlases are 280-490k tris of which most is sub-millimetre; error-bounded simplify
  for (const p of m0.listPrimitives()) {
    const n = p.getIndices().getCount() / 3;
    const cls = p.getMaterial().getExtras().cls;
    if (n < 4000 || cls === 'lamp' || cls === 'lens') continue;
    // paint: a clear coat mirrors the horizon, so long simplification slivers interpolating the dense mesh's normals read
    // as dents (the yellow taxi2 doors): paint keeps up to 90k tris at a tighter error, details stay at 45k
    const target = cls === 'detail' ? Math.max(6000, Math.min(n, 45000)) : cls === 'paint' ? Math.max(4000, Math.min(n, 90000)) : Math.max(4000, Math.min(n, 30000));
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: Math.min(1, target / n), error: cls === 'paint' ? 0.0003 : 0.0006, lockBorder: true });
  }
  // LOD1: parked mesh, or a coarse simplification of LOD0
  let lod1Mesh = m1;
  if (!lod1Mesh) {
    lod1Mesh = deepCloneMesh(doc, m0, 'LOD1');
    rootNode.addChild(doc.createNode('LOD1').setMesh(lod1Mesh));
    for (const p of lod1Mesh.listPrimitives()) {
      const n = p.getIndices().getCount() / 3;
      if (n < 400) continue;
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: Math.min(1, Math.max(0.03, 2500 / n)), error: 0.01, lockBorder: false });
    }
  }
  else {
    for (const p of lod1Mesh.listPrimitives()) {
      const n = p.getIndices().getCount() / 3;
      const cls = p.getMaterial().getExtras().cls;
      if (cls === 'glass' && n > 3000) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: Math.min(1, 2500 / n), error: 0.004, lockBorder: false });
    }
  }
  // LOD2: LOD1 at ~25 %
  const lod2Mesh = deepCloneMesh(doc, lod1Mesh, 'LOD2');
  rootNode.addChild(doc.createNode('LOD2').setMesh(lod2Mesh));
  for (const p of lod2Mesh.listPrimitives()) {
    const n = p.getIndices().getCount() / 3;
    const cls = p.getMaterial().getExtras().cls;
    if (cls === 'lamp' || cls === 'lens' || cls === 'lampInner') { if (n > 60) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.02 }); continue; }
    if (n < 200) continue;
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.02, lockBorder: false });
  }
  console.log(`  LOD0 ${tris(m0)} | LOD1 ${tris(lod1Mesh)} | LOD2 ${tris(lod2Mesh)} tris`);
  rootNode.setExtras({
    kind, bp: cfg.bp, size: size.map((v) => +v.toFixed(3)), hubs, lights,
    wheelbase: hubs.length >= 4 ? +Math.abs(hubs[0].p[2] - hubs[2].p[2]).toFixed(3) : null,
    source: 'CARLA 0.10.0 (CC-BY 4.0)', built: new Date().toISOString(),
  });
  await doc.transform(prune(), dedup());
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, `${kind}.glb`);
  io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.writeFileSync(outFile, await io.writeBinary(doc));
  console.log(`  -> ${path.relative(ROOT, outFile)} ${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const which = args.filter((a) => !a.startsWith('--') && !(args[args.indexOf(a) - 1] || '').startsWith('--out'));
const list = which[0] === 'all' || !which.length ? Object.keys(KINDS) : which;
for (const k of list) {
  if (!KINDS[k]) { console.error('unknown kind', k); continue; }
  try { await build(k); } catch (e) { console.error(`FAILED ${k}:`, e.stack || e); }
}
