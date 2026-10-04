// AR33 PROPS test board: the part's models standing on the sidewalk in the city's own light, for the close-up plates.
// Loaded into a running page by tools/bshot.mjs --evalfile (boundlessjs/tools/ar33/props/board.mjs writes the file and the
// cameras):  import('/src/city/pk/pkBoard.js').then((m) => m.place([{ kind, p, x, z, yaw, q }, ...]))
import * as THREE from 'three';
import { modelGroup, ready } from './props.js';

let _group = null;
export async function place(items, o = {}) {
  const E = window.__ENGINE;
  if (!E) return 'no engine';
  await ready;
  if (_group) { E.scene.remove(_group); _group = null; }
  const g = new THREE.Group(); g.name = 'pkBoard';
  let tris = 0;
  const report = [];
  for (const it of items) {
    let m;
    try { m = modelGroup(it.kind, it.p || {}, it.q ?? 1); } catch (e) { report.push(it.kind + ': ' + e.message); continue; }
    if (!m.children.length) { report.push(it.kind + ': empty'); continue; }
    m.position.set(it.x, it.y ?? 3.52, it.z);
    m.rotation.y = it.yaw || 0;
    g.add(m);
    tris += m.userData.tris || 0;
    report.push(`${it.kind} ${m.userData.tris | 0}`);
  }
  E.scene.add(g); _group = g;
  await new Promise((res) => setTimeout(res, o.settle ?? 2500));
  return `board: ${items.length} models, ${tris | 0} tris; ${report.join(', ')}`;
}
