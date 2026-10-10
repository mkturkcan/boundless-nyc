// AR33 part (city/areas.js) sk: the street surface along 125th Street and in Hunters Point to the references: concrete
// flags and their joints, granite kerbs with rounded arrises, curb ramps with detectable warning pads, covers and grates,
// crosswalks and markings, the red bus lanes, asphalt wear, patches. `?sk=0` restores the compiled surface; each piece has
// its own flag (`?skwalk=0`, `?skkerb=0`, `?skpads=0`, `?skcov=0`, `?skbus=0` the compiled bus-lane paint, `?skfix=0` the compiled pads and St Clair crossing, `?sktrench=1` the rule-placed trench patches, `?skrule=1` the rule-placed junction boxes and utility cuts instead of the captured ones). Owner: the STREET worker (docs/notes/ar33-street.md).
//
// How it sits on the compiled ground: world/assemble.js draws the tile's sections (tile.S.*) as one mesh with the ground
// shader. Nothing is removed from them (the ped and car sims, surfaceInfoAt, the kerb worker and the decals all read
// them). The meshes built here lie over them: the joint floor 2 mm, the flags 5 mm, the kerb top 10.5 mm over the compiled
// walk, each with a polygon offset in depth units, and they fade out past LOD_R so the far street is the compiled one.
import * as THREE from 'three';
import { skMat, skMatsReady, skCoverMat } from './skMats.js';
import { buildChunks } from './skBuild.js';
import { repaintBus, addWords } from './skBus.js';
import { fixCompiled } from './skFix.js';

export const ready = skMatsReady;

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const flag = (n) => !(Q && Q.get(n) === '0');
const ON = flag('sk'), OPT = { walk: flag('skwalk'), kerb: flag('skkerb'), pads: flag('skpads'), cov: flag('skcov'), wear: flag('skwear'), fx36: flag('fx36') };   // fx36: skBuild.js dropWet
const LOD_R = +(Q && Q.get('sklod')) || 280;      // metres: past this the compiled street is what is drawn

function toMesh(arr, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(arr.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(arr.uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(arr.color, arr.color.length / (arr.position.length / 3) === 4 ? 4 : 3));
  g.setIndex(new THREE.BufferAttribute(arr.index, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name; m.receiveShadow = true; m.castShadow = false;
  return m;
}

// Before anything samples or draws the tile's ground: compiled details that read wrong corrected (skFix.js: pads floating on
// the roadway, the skewed crossing over 125th's zebras at St Clair Place; `?skfix=0` keeps them) and the kerbside red bus
// lanes moved one parking lane out (skBus.js; `?skbus=0` keeps the compiled paint)
export function apply(tile, ox, oz) {
  if (!ON) return;
  const fx = fixCompiled(tile, ox, oz);
  if (fx.feet && typeof window !== 'undefined') window.__skfeet = { feet: fx.feet, list: fx.feetList, kerbFaces: fx.kerbFaces, kerbDropped: fx.kerbDropped, paint: fx.paint || 0, diag: fx.diag || 0, polys: fx.feetPolys };
  if ((fx.pads || fx.skewed) && typeof window !== 'undefined') { const W = (window.__skfix = window.__skfix || { tiles: 0, pads: 0, skewed: 0 }); W.tiles++; W.pads += fx.pads; W.skewed += fx.skewed; }
  const st = repaintBus(tile, ox, oz);
  const aw = addWords(tile, ox, oz);
  if (aw.words && typeof window !== 'undefined') { const W = (window.__skwords = window.__skwords || { tiles: 0, words: 0, tris: 0 }); W.tiles++; W.words += aw.words; W.tris += aw.tris; }
  if (st.red && typeof window !== 'undefined') { const W = (window.__skbus = window.__skbus || { tiles: 0, red: 0, moved: 0, paintMoved: 0, paintDropped: 0 }); W.tiles++; for (const k of ['red', 'moved', 'paintMoved', 'paintDropped']) W[k] += st[k]; }
}

// an overlay whose vertex alpha fades it into the compiled ground: blended, no depth write (the ground under it keeps its depth)
function fadeMat(m) {
  if (m && !m.transparent) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; }
  return m;
}

export function build(group, ctx) {
  if (!ON) return;
  const t0 = performance.now();
  const chunks = buildChunks(ctx.tile, ctx.ox, ctx.oz, OPT);
  if (!chunks.size) return;
  const mats = {
    flags: skMat('sidewalk_concrete', { pull: 5, pbr: { dirt: 1.0 } }),   // the set's oil and wear blotches at full strength (0.15 default)
    kerb: skMat('curb_granite', { pull: 7 }),
    padred: skMat('detectable_warning', { pull: 12, pbr: { tint: '#8c3a2b' } }), padiron: skMat('detectable_warning', { pull: 12, pbr: { tint: '#77736c' } }),   // the compiled pads' matId 13/14 are pulled 10 depth units by the ground shader
    cov: skCoverMat(), patch: skMat('asphalt_patch', { pull: 7 }),   // over the bus lane's 4 LSBs, under the paint's 10
    repave: fadeMat(skMat('asphalt_patch', { pull: 7, seed: 5 })),     // skCovers.REPAVES: a fresh mat with soft ragged edges (vertex alpha)
    wear: skMat('asphalt_worn', { pull: 13 }),                         // over the paint's 10 LSBs (world/assemble.js ground bias)
    xmask: skMat('asphalt_worn', { pull: 13 }), xpaint: skMat('paint_thermo', { pull: 16 }),   // skPaint.MARKS: a crossing the compiled ground lacks
    padwhite: skMat('detectable_warning', { pull: 12, pbr: { tint: '#bdbab2' } }),
  };
  let nTri = 0;
  for (const c of chunks.values()) {
    const det = new THREE.Group();
    for (const part of ['flags', 'kerb', 'padred', 'padiron', 'padwhite', 'cov', 'patch', 'repave', 'wear', 'xmask', 'xpaint']) {
      const b = c[part];
      if (!b.tris) continue;
      if (!mats[part]) { console.warn('[sk] no material for', part); continue; }   // a mesh without one draws plain white
      nTri += b.tris;
      const m = toMesh(b.arrays(c.cx, c.cz), mats[part], 'sk_' + part);
      if (part === 'repave') m.renderOrder = -1;   // drawn first of the see-through things (a car's glass over it keeps its tint)
      det.add(m);
    }
    if (!det.children.length) continue;
    const lod = new THREE.LOD();
    lod.position.set(c.cx, 0, c.cz);
    lod.addLevel(det, 0);
    lod.addLevel(new THREE.Object3D(), LOD_R);
    group.add(lod);
  }
  if (typeof window !== 'undefined') {
    const W = (window.__sk = window.__sk || { tiles: 0, tris: 0, ms: 0 });
    W.tiles++; W.tris += nTri; W.ms += performance.now() - t0;
  }
}
