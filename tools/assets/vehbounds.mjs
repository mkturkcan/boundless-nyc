// Per-component bounds of an assembled CARLA vehicle blueprint in the runtime frame (+Z fwd, +X left), for placement QA.
//   node tools/assets/vehbounds.mjs BP_Mini2024
import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mul, applyPoint } from './lib/mat4.mjs';
import { readBlueprint, componentWorlds, EXPORT_ROOT, JSON_ROOT } from './lib/ue.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const bp = process.argv[2];
const comps = readBlueprint(path.join(JSON_ROOT, 'vehicles', bp + '.json'));
const root = comps.find((c) => c.type === 'SkeletalMeshComponent');
const sk = await io.read(path.join(EXPORT_ROOT, root.mesh + '.glb'));
const sockets = new Map();
for (const n of sk.getRoot().listNodes()) if (n.getName() && !n.getMesh()) sockets.set(n.getName(), n.getWorldMatrix());
componentWorlds(comps, root.name, sockets);
const toRt = (p) => [-p[2], p[1], p[0]];
for (const c of comps) {
  if (!c.mesh) continue;
  const f = path.join(EXPORT_ROOT, c.mesh + '.glb');
  if (!fs.existsSync(f)) { console.log(c.name, 'MISSING'); continue; }
  const d = await io.read(f);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const n of d.getRoot().listNodes()) {
    if (!n.getMesh()) continue;
    const M = mul(c.world, n.getWorldMatrix());
    for (const p of n.getMesh().listPrimitives()) {
      const P = p.getAttribute('POSITION'), v = [];
      for (let i = 0; i < P.getCount(); i++) { const q = toRt(applyPoint(M, P.getElement(i, v))); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } }
    }
  }
  console.log(`${c.name.padEnd(34)} socket ${String(c.socket).padEnd(18)} parent ${String(c.parent).padEnd(14)} x ${mn[0].toFixed(2)}..${mx[0].toFixed(2)}  y ${mn[1].toFixed(2)}..${mx[1].toFixed(2)}  z ${mn[2].toFixed(2)}..${mx[2].toFixed(2)}`);
}
