// ez-tree street trees (MIT, github.com/dgreenheck/ez-tree): replaces the
// procedural puff trees with parametric trunks/branches + textured leaf cards.
// Same pool-geometry-swap pattern as props.js — instances (real street-tree
// census positions) stay; trunk pools get a bark-textured material, crown
// pools keep the shared wind/snow crownMat whose map becomes the ez-tree leaf.
import * as THREE from 'three';
import { ENV, applySnowCap, applyLightTrim, applyCityAO } from '../world/materials.js';
import { alphaMipTexture, alphaMipDataTexture, TREE_ARCH, TV25, TREE_FORMS, TV25_POOLS, tv25Spec, TV25_BAKE } from './furnitureKit.js';
import { buildTree, bakeKey25 } from './treeGen.js';
import { ATLAS, LEAF_CELLS, cellUV25, paintLeafAtlas25, planeCamoCanvas25 } from './treeAtlas.js';

// TC13 STREET CANOPY (docs/notes/canopy-r13.md, critic-r13 ranked fix 9).
// `?tc13=0` restores the r12 crown: height-only normalisation, 0.32x leaf
// count, and the near-white colour bake. One parse site per file.
const TC13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tc13') === '0');
// FD14 (docs/notes/fd14.md) — ?fd14=0 restores the TC13 crown. In THIS file: leaf card
// area and count (the crowns are still see-through at 3x; critic-r14 fix 8).
const FD14T = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fd14') === '0');

export async function upgradeTrees(instancer) {
  if (TV25) return upgradeTreesTV25(instancer);   // TV25 species forms (below); ?tv25=0 runs the round-14 build
  const tBoot0 = performance.now();   // (TV25 boot census: timing only)
  const { Tree } = await import('@dgreenheck/ez-tree');
  const tBoot1 = performance.now();
  // variant pools per species: same preset, DIFFERENT SEEDS + small parameter
  // jitter, so neighboring street trees stop being clones.
  // TC13 adds `k` — this variant's size relative to its archetype's mature
  // envelope (TREE_ARCH) — and `d`, its leaf density relative to the archetype:
  // a honeylocust is an OPEN crown you can read the sky through, a plane is a
  // solid mass. targetH stays as the ?tc13=0 fallback.
  const SPECIES = [
    ['A', 'Oak Medium', 0x3f6d2e, 11.5, 4171, 0.97, 1.00],
    ['A2', 'Oak Medium', 0x426f2c, 12.4, 9313, 1.07, 1.06],
    ['A3', 'Oak Medium', 0x3c682f, 10.8, 22571, 0.90, 0.94],
    ['B', 'Ash Medium', 0x4a7a33, 9.0, 517, 0.95, 0.80],
    ['B2', 'Ash Medium', 0x4e7d30, 9.8, 7789, 1.05, 0.86],
    ['C', 'Aspen Small', 0x5d8a3c, 7.6, 1201, 0.95, 0.92],
    ['C2', 'Aspen Small', 0x578540, 8.4, 30011, 1.05, 0.98],
  ];
  let leafTex = null, barkMat = null;
  for (const [sp, preset, tint, targetH0, seed, kVar, dVar] of SPECIES) {
    const arch = TREE_ARCH[sp[0]] || TREE_ARCH.A;
    const targetH = TC13 ? arch.h * kVar : targetH0;
    const targetW = TC13 ? arch.w * kVar : 0;
    const pT = instancer.pools.get('tree' + sp + 'Trunk');
    const pC = instancer.pools.get('tree' + sp + 'Crown');
    if (!pT || !pC) continue;
    try {
      const tree = new Tree();
      tree.loadPreset(preset);
      // cap density: pools hold thousands of instances — a preset tree at
      // full detail would be 5-10x our budget
      const o = tree.options;
      o.seed = seed;
      const jit = ((seed % 97) / 97 - 0.5); // deterministic per-variant jitter
      // radial segments / length sections per branch level: the trunk pools
      // were the single biggest triangle sink in the frame (6.4M per variant
      // at {8,6,4,3}); thin branches read identically at 3-4 radial segs
      o.branch.segments = { 0: 6, 1: 3, 2: 3, 3: 3 };
      o.branch.sections = { 0: 5, 1: 3, 2: 2, 3: 1 };
      // leaves.count is PER TERMINAL BRANCH (x children product x double
      // billboards) — cut density, grow card size to keep canopy coverage
      // TC13: 0.32x count / 1.5x card was a SEE-THROUGH crown — the 3x zoom
      // shots/canopy-r13/v_wb_tree.png is branches with a few leaf clusters on
      // them, and the twin measured 0.74 % vegetation against Earth's 6.10 %.
      // Coverage goes as count * size^2 but COST goes as count alone, so buy
      // most of it in the card: 2.15x card area for zero extra triangles, and
      // 1.44x count to close the gaps between cards. Net ~3.1x canopy coverage
      // for +44 % leaf triangles and NO new pools (draw calls unchanged).
      // FD14 (critic-r14 fix 8): TC13's own argument, applied once more. Canopy is 1.8 /
      // 4.0 / 3.3 % of frame against the references' 3.4 / 9.8 / 10.4 %, and at 3x the
      // crowns are still see-through — the Amsterdam street tree (fd14/before/amst_tree.png)
      // reads the whole facade through it, where a London plane in July is a solid mass.
      // Coverage goes as count * size^2 and COST goes as count alone, so again buy it in
      // the card: 2.55/2.2 is +34 % of card AREA for zero triangles, and count goes up only
      // 15 %. Net ~1.54x crown coverage for +15 % leaf tris. `?fd14=0` restores TC13.
      const DENS = TC13 ? (FD14T ? 0.53 : 0.46) * dVar : 0.32;
      o.leaves.count = Math.max(4, Math.round(o.leaves.count * (DENS + jit * 0.08)));
      o.leaves.size *= (TC13 ? (FD14T ? 2.55 : 2.2) : 1.5) + jit * 0.25;
      if (o.branch.angle) o.branch.angle[1] = (o.branch.angle[1] ?? 0) + jit * 12;
      if (o.branch.children[2] > 2) o.branch.children[2] = 2;
      tree.generate();

      const trunkG = tree.branchesMesh.geometry.clone();
      const leafG = tree.leavesMesh.geometry.clone();
      for (const g of [trunkG, leafG]) {
        for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
      }
      // one uniform scale for the whole tree: match the species target height
      const bb = new THREE.Box3().setFromBufferAttribute(trunkG.getAttribute('position'));
      const bbL = new THREE.Box3().setFromBufferAttribute(leafG.getAttribute('position'));
      bb.union(bbL);
      const s = targetH / Math.max(bb.max.y, 0.01);
      // TC13 CANOPY WIDTH. Height-only normalisation left the crown diameter at
      // whatever the preset gave after the branch-budget cuts (branch.levels and
      // children[2] both trimmed, which NARROWS an ez-tree). Measured on the
      // Williamsburg twin: ~5 m crowns. A mature London plane, pin oak or
      // honeylocust on a New York street is 10-15 m across. Normalise XZ to the
      // archetype envelope as well, clamped so the trunk never turns into a
      // column (the same factor scales the branch mesh, which is what keeps the
      // leaf cards ON the branch tips) — a 1.55 cap is a 55 % fatter bole at
      // dbh 30", which is what a 90-year-old plane's bole looks like.
      let sw = s;
      if (TC13) {
        const cw = Math.max(bbL.max.x - bbL.min.x, bbL.max.z - bbL.min.z) * s;
        sw = s * Math.min(1.55, Math.max(0.80, targetW / Math.max(cw, 0.01)));
      }
      trunkG.scale(sw, s, sw);
      leafG.scale(sw, s, sw);
      // leaf cards lit by their own facing direction go half-black — use the
      // crown-volume radial normal (position from canopy center + up bias),
      // the same contract that fixed the faceted puff trees
      {
        const pos = leafG.getAttribute('position');
        const nor = leafG.getAttribute('normal');
        // keep the TRUE card facing before it is overwritten: the crown shader
        // fades cards seen edge-on (critic round 2: bright fully-lit slivers)
        leafG.setAttribute('aFace', new THREE.BufferAttribute(Float32Array.from(nor.array), 3));
        const cb = new THREE.Box3().setFromBufferAttribute(pos);
        const cc = cb.getCenter(new THREE.Vector3());
        cc.y = cb.min.y + (cb.max.y - cb.min.y) * 0.62;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i) - cc.x, pos.getY(i) - cc.y, pos.getZ(i) - cc.z).normalize();
          v.y += 0.55; // strong up bias — canopy undersides live off sky light
          v.normalize();
          nor.setXYZ(i, v.x, v.y, v.z);
        }
      }

      // baked colors: white on bark (texture carries the look), per-leaf
      // green variation on the crown (crownMat multiplies map * vColor)
      const bakeCol = (g, fn) => {
        const n = g.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) fn(i).toArray(arr, i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      };
      bakeCol(trunkG, () => new THREE.Color(1, 1, 1));
      // the leaf map is already fully colored — vColor is only a brightness/
      // hue JITTER around white (a saturated tint double-multiplies to black)
      const base = new THREE.Color(tint);
      const white = new THREE.Color(1, 1, 1);
      const c2 = new THREE.Color();
      // TC13 CHROMA, NOT BRIGHTNESS. The r12 bake multiplied an already-lit,
      // already-coloured leaf map by a near-white value brightened 1.00-1.45,
      // and the top of that range pushes the green channel into tone-map
      // compression — which is precisely what "desaturated to near-white in a
      // summer scene" is. Measured: our foliage LUMINANCE already matched the
      // Bedford Ave pano (93,108,89 vs 89,112,85); its mean SATURATION was
      // 0.210 against the pano's 0.312. So: normalise the species tint to unit
      // LUMA before blending (the blend then moves hue and chroma only, not
      // brightness) and centre the per-card jitter on 1.0 instead of 1.225.
      const tintN = new THREE.Color(tint);
      tintN.multiplyScalar(1 / Math.max(1e-4, 0.2126 * tintN.r + 0.7152 * tintN.g + 0.0722 * tintN.b));
      const leafCol = (i) => {
        const leaf = (i / 4) | 0; // 4 verts per card
        const h = Math.sin(leaf * 127.1) * 43758.5453;
        const r = h - Math.floor(h);
        // FD14: more CHROMA and a trimmed top end on the per-card jitter. The jitter ran
        // 0.88-1.12 about a unit-luma tint, so an eighth of the cards were 12 % hotter
        // than the sheet and those are the ones that clip on the sun side; 0.86-1.02 caps
        // it without flattening the crown, and 0.46 of tint (was 0.32) keeps the bright
        // cards GREEN through the tone-map shoulder instead of letting them go neutral.
        return TC13
          ? c2.copy(white).lerp(tintN, FD14T ? 0.46 : 0.32).multiplyScalar(FD14T ? 0.86 + r * 0.16 : 0.88 + r * 0.24)
          : c2.copy(white).lerp(base, 0.15).multiplyScalar(1.0 + r * 0.45);
      };
      bakeCol(leafG, leafCol);

      if (!barkMat) {
        const src = tree.branchesMesh.material;
        barkMat = applySnowCap(new THREE.MeshStandardMaterial({
          map: src.map ?? null, normalMap: src.normalMap ?? null,
          roughness: 0.92, metalness: 0, vertexColors: true,
        }));
      }
      if (!leafTex) leafTex = tree.leavesMesh.material.map;

      const oldT = pT.mesh.geometry, oldC = pC.mesh.geometry;
      pT.mesh.geometry = trunkG;
      pT.mesh.material = barkMat;
      pC.mesh.geometry = leafG;
      oldT.dispose(); oldC.dispose();
      {
        // TC13 census: the canopy envelope actually achieved, so a regression in
        // the ez-tree preset or the branch budget shows up in the console rather
        // than in a plate three hours later.
        const cb2 = new THREE.Box3().setFromBufferAttribute(leafG.getAttribute('position'));
        console.log(`[trees] ${sp} <- ${preset}: trunk ${(trunkG.index ? trunkG.index.count : trunkG.getAttribute('position').count) / 3 | 0} tris,`
          + ` ${leafG.getAttribute('position').count / 4 | 0} leaves, canopy ${(Math.max(cb2.max.x - cb2.min.x, cb2.max.z - cb2.min.z)).toFixed(1)}m wide`
          + ` x ${cb2.max.y.toFixed(1)}m tall (target ${TC13 ? targetW.toFixed(1) : '-'} x ${targetH.toFixed(1)})`);
      }

      // distance LOD (instancer routes instances past 120 m here): same seed,
      // preset and height, branches at the minimum segment/section counts and
      // half the leaf cards at 1.4x size — at ≤60 px tall the canopy reads the
      // same; ~1/4 of the triangles. Trees were 14M of the 20M tris in view.
      if (instancer.setLOD) {
        try {
          const lt = new Tree();
          lt.loadPreset(preset);
          const lo = lt.options;
          lo.seed = seed;
          lo.branch.segments = { 0: 4, 1: 3, 2: 3, 3: 3 };
          lo.branch.sections = { 0: 3, 1: 2, 2: 1, 3: 1 };
          lo.branch.levels = Math.min(lo.branch.levels ?? 3, 2);
          // TC13 holds the FAR-FIELD budget flat. `o.leaves.count` is already the
          // boosted near count, so the r12 0.5x would have carried the whole
          // +44 % into the LOD as well; 0.38x x a 2.0x card puts the far crown
          // back within ~9 % of r12's leaf triangles at MORE coverage, which is
          // the half of the frame that costs the most (every tree past 120 m).
          lo.leaves.count = Math.max(3, Math.round(o.leaves.count * (TC13 ? 0.38 : 0.5)));
          lo.leaves.size = o.leaves.size * (TC13 ? 2.0 : 1.4);
          if (lo.branch.angle) lo.branch.angle[1] = (lo.branch.angle[1] ?? 0) + jit * 12;
          if (lo.branch.children[2] > 2) lo.branch.children[2] = 2;
          lt.generate();
          const trunkL = lt.branchesMesh.geometry.clone();
          const leafL = lt.leavesMesh.geometry.clone();
          for (const g of [trunkL, leafL]) {
            for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
          }
          // TC13: THE FAR LOD MUST BE THE SAME TREE. It is built with
          // branch.levels capped at 2, which shortens AND narrows an ez-tree, so
          // reusing the near build's `s`/`sw` shrank the canopy at the 120 m
          // handover — a crown that pops smaller is the swap announcing itself.
          // Normalise this build to the SAME envelope instead of inheriting a
          // scale measured on a different geometry.
          let lsH = s, lsW = sw;
          if (TC13) {
            const lb = new THREE.Box3().setFromBufferAttribute(trunkL.getAttribute('position'));
            const lbL = new THREE.Box3().setFromBufferAttribute(leafL.getAttribute('position'));
            lb.union(lbL);
            lsH = targetH / Math.max(lb.max.y, 0.01);
            const lcw = Math.max(lbL.max.x - lbL.min.x, lbL.max.z - lbL.min.z) * lsH;
            lsW = lsH * Math.min(1.75, Math.max(0.80, targetW / Math.max(lcw, 0.01)));
          }
          for (const g of [trunkL, leafL]) g.scale(lsW, lsH, lsW);
          {
            const pos = leafL.getAttribute('position');
            const nor = leafL.getAttribute('normal');
            leafL.setAttribute('aFace', new THREE.BufferAttribute(Float32Array.from(nor.array), 3)); // true card facing (edge-on fade)
            const cb = new THREE.Box3().setFromBufferAttribute(pos);
            const cc = cb.getCenter(new THREE.Vector3());
            cc.y = cb.min.y + (cb.max.y - cb.min.y) * 0.62;
            const v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
              v.set(pos.getX(i) - cc.x, pos.getY(i) - cc.y, pos.getZ(i) - cc.z).normalize();
              v.y += 0.55; v.normalize();
              nor.setXYZ(i, v.x, v.y, v.z);
            }
          }
          bakeCol(trunkL, () => new THREE.Color(1, 1, 1));
          bakeCol(leafL, leafCol);   // TC13: same chroma contract as the near build
          instancer.setLOD('tree' + sp + 'Trunk', trunkL, 120);
          instancer.setLOD('tree' + sp + 'Crown', leafL, 120);
          console.log(`[trees] ${sp} LOD: trunk ${(trunkL.index ? trunkL.index.count : trunkL.getAttribute('position').count) / 3 | 0} tris, ${leafL.getAttribute('position').count / 4 | 0} leaves,`
            + ` h ${(new THREE.Box3().setFromBufferAttribute(leafL.getAttribute('position')).max.y).toFixed(1)}m`);
        } catch (e) { console.warn('[trees] LOD failed', sp, e); }
      }
    } catch (e) { console.warn('[trees] failed', sp, e); }
  }
  applyEdgeFade(instancer);
  if (typeof window !== 'undefined') window.__TREE25_BOOT = { from: 'ez-tree', wallMs: performance.now() - tBoot0, mainMs: performance.now() - tBoot1, readyS: performance.now() / 1000 };
  console.log(`[trees] ez-tree build: ${(performance.now() - tBoot0).toFixed(0)} ms wall, ${(performance.now() - tBoot1).toFixed(0)} ms main thread after the module import`);
  // the shared crown material now samples the ez-tree leaf card texture.
  // MIP RULE for alpha cutouts: transparent texels ship with BLACK rgb, and
  // street-distance mips blend that black into every sample (slate canopy) —
  // flood-fill transparent rgb with the mean leaf color before upload.
  if (leafTex) {
    const apply = () => {
      const img = leafTex.image;
      if (!img || !img.width) { setTimeout(apply, 120); return; }
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      const px = d.data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      if (n) { r /= n; g /= n; b /= n; }
      // ---- FD14 LEAF ALBEDO CAP (owner note 2026-09-17: "the lit tops of the crowns go
      // near-white, which turns the biggest object in the frame into a pale cloud").
      // MEASURED on the ez-tree source art (node_modules/@dgreenheck/ez-tree/src/lib/
      // assets/leaves): oak_color is a good albedo at mean 96,126,54 but its p95 is L 163
      // and its max L 207; ash_color the same; **aspen_color — which the C archetype
      // (callery pear / ginkgo) uses — is an AUTUMN card, mean 195,150,56, with 32 % of
      // its texels above L 170.** Those are baked highlights, not albedo: a real leaf
      // reflects 0.10-0.20, i.e. sRGB 90-125, and a 163-207 albedo under a direct sun
      // clips to white and then desaturates in the tone-map shoulder. Reference: the lit
      // foliage in critic-r13/WB_bedN7.png measures 118,142,116 — never neutral.
      // So the top end is shouldered: L <= KNEE is untouched (the mean and the hue of the
      // card are preserved), and [KNEE, 255] is remapped onto [KNEE, CAP] at constant
      // chromaticity. On oak that moves a 163 texel to 128 and a 207 to 139 and leaves
      // three quarters of the card alone; on the aspen card it takes the whole sheet down
      // to a leaf albedo. `?fd14=0` skips it.
      const KNEE = 118, CAP = 150;
      if (FD14T) {   // …and the transparent-texel flood fill is that same capped mean
        const Lm = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (Lm > KNEE) {
          const k = (KNEE + (CAP - KNEE) * Math.min(1, (Lm - KNEE) / (255 - KNEE))) / Lm;
          r *= k; g *= k; b *= k;
        }
      }
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (FD14T && a >= 128) {
          const L = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          if (L > KNEE) {
            const k = (KNEE + (CAP - KNEE) * Math.min(1, (L - KNEE) / (255 - KNEE))) / L;
            px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
          }
        }
        if (a < 128) { px[i] = r; px[i + 1] = g; px[i + 2] = b; }
        else if (a < 250) {
          // canvas 2D round-trips premultiplied — un-premultiply semi-alpha
          // edge texels or every leaf border darkens toward black in the mips
          const k = 255 / a;
          px[i] = Math.min(255, px[i] * k); px[i + 1] = Math.min(255, px[i + 1] * k); px[i + 2] = Math.min(255, px[i + 2] * k);
        }
      }
      ctx.putImageData(d, 0, 0);
      // r8: the flood fill above only fixes the COLOUR of the mip chain. The
      // ALPHA still box-averages a binary cutout, so the canopy loses coverage
      // with every level and slides through alphaTest as the footprint changes
      // — the dominant motion artefact in glitch-r7.md 2.2 family B. Build the
      // chain here instead, with each level's alpha rescaled to preserve
      // level 0's coverage at the 0.35 this material cuts at (?aa=0 reverts).
      const t2 = alphaMipTexture(cv, 0.35, { name: 'ezleaf' });
      instancer.crownMat.map = t2;
      instancer.crownMat.alphaTest = 0.35;
      instancer.crownMat.needsUpdate = true;
      console.log('[trees] leaf texture mip-safe fill applied');
    };
    apply();
  }
}

// EDGE-ON FADE: leaf cards carry crown-radial normals for lighting, so a card
// seen edge-on is still "fully lit" and, after the alpha test, renders as a
// bright hairline sliver (critic round 2, defect 9). `aFace` (set above) is
// the card's true facing; fade alpha as the view direction grazes it, before
// the alpha test discards. Geometries without `aFace` read (0,0,0) -> no fade.
// (TV25: factored out of upgradeTrees unchanged, so both builds share it.)
function applyEdgeFade(instancer) {
  if (!instancer.crownMat.__edgeFade) {
    const m = instancer.crownMat;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aFace; varying float vFaceDot;')
        .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec3 fN = aFace;
          #ifdef USE_INSTANCING
            fN = mat3(instanceMatrix) * fN;
          #endif
          fN = normalMatrix * fN;
          float fl = length(fN);
          vFaceDot = fl < 0.5 ? 1.0 : abs(dot(normalize(-mvPosition.xyz), fN / fl));
        }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFaceDot;')
        .replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0.10, 0.32, vFaceDot);\n#include <alphatest_fragment>');
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|edgefade';
    m.__edgeFade = true;
    m.needsUpdate = true;
  }
}

// =====================================================================================================================
// TV25 SPECIES TREES (trees agent, 2026-09-25). `?tv25=0` runs the round-14 build above, untouched.
//
// What the round-14 build did, measured before this was written (scratchpad trees_agent/notes.md):
//   * 74 % of the census drew ONE ez-tree preset in three seeds, one oak spray for every crown, the road's yaw on
//     every tree in a row -> same-variant neighbours were exact clones;
//   * the oak spray card was ~1.8 m, so its leaves rendered ~28 cm (2x a real leaf): the "coarse card" canopy;
//   * the crown albedo was the spray x the c13 tint decoded to LINEAR (0.047, 0.084, 0.033): ~0.018 green, a tenth
//     of a leaf, while the IBL specular was not scaled at all -> crowns measured (35-46, 40-60, 42-56), neutral to
//     blue-grey with a pale sheen on grazing cards, where Street View foliage is clearly yellow-green;
//   * DoubleSide + crown-volume normals: three flips the normal on back faces, so ~half the cards shaded with an
//     INWARD normal (salt-and-pepper dark cards);
//   * the bark had no light trim (props take 0.30 x STREET_CAL), so trunks rendered pale.
// TV25: per-species forms from city/treeGen.js; a 2048^2 leaf atlas of species sprays at the right leaf scale
// (painted here, plus ez-tree's oak/ash sprays and its aspen spray recoloured for linden); four bark materials
// with the prop light trim; the crown shaded with outward normals on both faces, wrap + transmission for thin
// backlit leaves, and the baked crown AO on the ambient; far trees carry their trunk in the crown LOD.
const T25 = { NC: ATLAS.NC, CS: ATLAS.CS, ALPHA: 0.42, LOD: 90 };
// calibration uniforms, live-tunable from a measurement page (window.__TREE25)
const LEAF25 = {
  gain: { value: new THREE.Vector3(1.75, 1.75, 1.55) },       // x mix(0.30, 0.88, night): the prop light-trim contract
  light: { value: new THREE.Vector4(0.4, 4.0, 0.45, 0.3) },  // x transmission, y its view exponent, z AO on direct, w wrap
  trans: { value: new THREE.Vector3(0.85, 1.25, 0.3) },       // transmitted tint (chlorophyll passes a deep yellow-green)
  // direct-diffuse gain, indirect-diffuse gain, indirect-specular gain, AO floor. A canopy's shade is lit by light the
  // leaves around it scattered (each passes ~10 % and reflects ~10 %): measured against Street View the first TV25 plates
  // had the shaded crown at ~0.45x the reference while sun-facing cards blew out to cream, i.e. too much key, too little fill.
  // Swept at harlemRow (sweep1/sweep3): (0.72, 1.5) left sun-facing cards cream and the shade at ~0.5x the reference;
  // (0.32, 3.2) puts the mid canopy at (96-102, 109-115, 44-46) against Street View's (93-123, 113-143, 50-69).
  bal: { value: new THREE.Vector4(0.32, 3.2, 0.75, 0.3) },
  // TC26 sun self-shadow: x floor, y peak (mixed by the baked sun visibility toward the actual sun), z visibility exponent,
  // w clump-normal weight on the sun's diffuse
  sun: { value: new THREE.Vector4(0.08, 1.25, 1.2, 1.5) },
  // TC26 waxy sheen: x roughness, y gain, z true-card-facing share of its normal; w per-clump tone amplitude
  sheen: { value: new THREE.Vector4(0.5, 0.0, 0.5, 0.10) },
  // TC26 clump sky: x how much ambient a clump's underside loses (tops keep theirs: nothing is lifted), y the sheen's F90,
  // z the indirect gain at night (replaces bal.y as ENV.night goes 0.15 -> 0.6; golden 0.05 keeps bal.y)
  clu: { value: new THREE.Vector4(0.6, 0.5, 1.2, 0) },
  // TC26 sun share: the SUN's reflected light (diffuse + specular) is multiplied by this on top of bal.x, and nothing else
  // is. bal.x scales the transmission and the lamps as well, which is why raising it to deepen the lit side whitened
  // every backlit crown; this keeps those at their calibration while the sunlit clump shells carry more of the light.
  // y: the share of that reflection left where the camera sees a clump from its FAR side (a backlit crown seen from below):
  // there the light arrives through the leaves (the transmission term), and lighting the far side as if its sunlit top were
  // in view is what put cream highlights on every backlit crown
  // z: the sun's specular on its own (1 = as bal.x gives it). Swept 2026-09-26 (lead sw8/sw9/sw11, harlemRow front-lit,
  // columbia backlit, amst120N shade): x 1.45 gives the sunlit clumps their depth, the far-side share 0.25 takes the
  // backlit cream (warm pale pixels 0.46 % at TC26 as shipped, 0.34 % TV25) back down, the shade crown is untouched.
  sunK: { value: new THREE.Vector3(1.45, 0.25, 1.0) },
};
// TC26 (2026-09-25 night): the sunlit half of a crown read as ONE flat tone, because the only occlusion on the sun was the
// sky AO (direction-blind) over a half-volume, half-clump normal. Now the bake carries each vertex's visibility toward any
// sun direction (aSun: a linear fit of the leaf-density transmittance, treeGen.js) and the pure clump normal (aClu, with a
// per-clump tone), so the sun lights the sun-side shell of every clump, the clump's far side and the crown interior fall
// into their own shade, and a rougher cuticle lobe gives waxy leaves their sheen. Lamps keep the sky AO, and the crown sees
// them as finite luminaires (cityLamps.js CL_R0): the near field no longer blows the crown out under the lamp head.
// The day terms are ON at the TV25 balance (backlit check: no lift, columbia 104,130,101 -> 104,129,102; the lit half of a
// front-lit crown gains cluster shade, lead sweep sw3 harlemRow). A larger direct share (0.55) gave more depth front-lit but
// whitened backlit crowns, so the balance stays. `?tc26=0` restores TV25 by day exactly; window.__TC26(on) switches in place.
// The NIGHT half (N26: CL_R0 near field + the night indirect gain) is on; `?tc26n=0` restores TV25 at night exactly.
let TC26 = !(typeof location !== 'undefined' && /(^|[?&])tc26=0/.test(location.search));
const N26 = !(typeof location !== 'undefined' && /(^|[?&])tc26n=0/.test(location.search));
if (typeof window !== 'undefined') window.__TREE25 = LEAF25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- leaf atlas cells (cell index = cx + cy * NC, v up; 15 = solid bark swatch for the far-LOD trunk proxy)
// (leaf atlas cells, sprays and the plane bark painter live in ./treeAtlas.js — shared with the offline bake)
async function texImage25(tex) {
  for (let i = 0; i < 240 && !(tex && tex.image && tex.image.width); i++) await sleep(50);
  return tex && tex.image && tex.image.width ? tex.image : null;
}
function canvasTex25(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function wrapTex25(img, srgb) {
  if (!img) return null;
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
// TC26: the crown takes the street lamps as finite luminaires (cityLamps.js CL_R0, metres): leaves 1-3 m from a lamp head
// sat in its inverse-square near field and blew out
function tc26Defines(m) {
  m.defines = { ...(m.defines || {}) };
  if (TC26 || N26) m.defines.CL_R0 = '2.5';
  else delete m.defines.CL_R0;
}
// the crown's TV25 shading, chained after every other hook on the shared crownMat
function applyCrownShading25(m) {
  if (m.__tv25) return;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uLeafGain = LEAF25.gain; sh.uniforms.uLeafLight = LEAF25.light; sh.uniforms.uLeafTrans = LEAF25.trans; sh.uniforms.uLeafBal = LEAF25.bal;
    sh.uniforms.uLeafNight = ENV.night;
    if (TC26) { sh.uniforms.uLeafSun = LEAF25.sun; sh.uniforms.uLeafSheen = LEAF25.sheen; sh.uniforms.uLeafClu = LEAF25.clu; sh.uniforms.uLeafSunK = LEAF25.sunK; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; varying float vAO25;' + (TC26 ? '\nattribute vec4 aSun; attribute vec3 aClu; varying vec4 vSun26; varying vec3 vClu26; varying vec3 vFace26; varying float vTone26;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO25 = aAO;' + (TC26 ? `
      {
        // TC26: the sun visibility gradient, the clump normal and the card facing into view space (a missing attribute
        // reads (0,0,0,1): fully visible, no clump, no facing)
        mat3 m26 = mat3( modelViewMatrix );
        #ifdef USE_INSTANCING
          m26 = m26 * mat3( instanceMatrix );
        #endif
        float sl26 = length( aSun.xyz ), cl26 = length( aClu );
        vec3 s26 = m26 * aSun.xyz, c26 = m26 * aClu, f26 = m26 * aFace;
        vSun26 = vec4( sl26 > 1e-3 ? normalize( s26 ) * sl26 : vec3( 0.0 ), aSun.w );
        vClu26 = cl26 > 0.3 ? normalize( c26 ) : vec3( 0.0 );
        vTone26 = cl26 > 0.3 ? clamp( ( cl26 - 0.75 ) * 4.0, -1.0, 1.0 ) : 0.0;
        vFace26 = length( f26 ) > 1e-3 ? normalize( f26 ) : vec3( 0.0 );
      }` : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLeafGain; uniform vec4 uLeafLight; uniform vec3 uLeafTrans; uniform vec4 uLeafBal; uniform float uLeafNight; varying float vAO25;'
        + (TC26 ? '\nuniform vec4 uLeafSun; uniform vec4 uLeafSheen; uniform vec4 uLeafClu; uniform vec3 uLeafSunK; varying vec4 vSun26; varying vec3 vClu26; varying vec3 vFace26; varying float vTone26; float leaf26Sun = 0.0;' : ''))
      // the prop light-trim contract (materials.js applyLightTrim), with the atlas carrying a real leaf albedo
      // (TC26: x a per-clump tone, lighter and warmer or darker and cooler, so clumps read as units)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uLeafGain * mix(0.30, 0.88, uLeafNight)'
        + (TC26 ? ' * ( 1.0 + uLeafSheen.w * vTone26 * vec3( 1.3, 1.0, 0.45 ) );' : ';'))
      // both faces of a card take the OUTWARD crown-volume normal (three flips it on back faces)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif')
      // wrap + transmission: thin leaves light around the terminator, and a backlit crown rim glows
      .replace('#include <lights_physical_pars_fragment>', TC26 ? `#include <lights_physical_pars_fragment>
void RE_Direct_Leaf25( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  // lamps (and any light but the sun): the sky AO on the direct, as in TV25
  vec3 N = geometryNormal;
  float occ = mix( 1.0, vAO25, uLeafLight.z );
  if ( leaf26Sun > 0.5 ) {
    // the sun: clump-weighted normal, and the baked visibility toward THIS light direction (per-clump self-shadowing)
    N = normalize( geometryNormal + vClu26 * uLeafSun.w );
    float vis = saturate( vSun26.w + dot( vSun26.xyz, directLight.direction ) );
    occ = mix( uLeafSun.x, uLeafSun.y, pow( vis, uLeafSun.z ) );
  }
  vec3 col = directLight.color * occ;
  float dotNL = dot( N, directLight.direction );
  float w = uLeafLight.w;
  vec3 irradiance = saturate( ( dotNL + w ) / ( 1.0 + w ) ) * col;
  // the sun's reflection only (not the transmission, not the lamps), and only on the side of the clump the camera sees
  float seen = dot( vClu26, vClu26 ) > 0.25 ? smoothstep( -0.3, 0.35, dot( vClu26, geometryViewDir ) ) : 1.0;
  float kSun = leaf26Sun > 0.5 ? uLeafSunK.x * mix( uLeafSunK.y, 1.0, seen ) : 1.0;
  reflectedLight.directSpecular += saturate( dotNL ) * col * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, N, material ) * kSun * ( leaf26Sun > 0.5 ? uLeafSunK.z : 1.0 );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * kSun;
  float back = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), uLeafLight.y );
  float away = saturate( -dotNL );
  // (transmission takes the visibility but never the sunlit lift: a backlit crown goes darker green with glowing rims)
  reflectedLight.directDiffuse += directLight.color * min( occ, 1.0 ) * material.diffuseContribution * uLeafTrans * ( 0.3 * away + back ) * uLeafLight.x * RECIPROCAL_PI;
  if ( leaf26Sun > 0.5 && uLeafSheen.y > 0.0 ) {
    // waxy cuticle sheen: a rougher lobe on a normal between the clump's and the card's own (turned to the viewer)
    vec3 F = vFace26 * ( dot( vFace26, geometryViewDir ) < 0.0 ? -1.0 : 1.0 );
    vec3 Ns = normalize( mix( N, F, uLeafSheen.z ) + N * 1e-3 );
    PhysicalMaterial ms = material;
    ms.roughness = uLeafSheen.x;
    ms.specularColorBlended = vec3( 0.04 );
    ms.specularF90 = uLeafClu.y;
    reflectedLight.directSpecular += saturate( dot( Ns, directLight.direction ) ) * col * BRDF_GGX( directLight.direction, geometryViewDir, Ns, ms ) * uLeafSheen.y;
  }
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf25` : `#include <lights_physical_pars_fragment>
void RE_Direct_Leaf25( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  float w = uLeafLight.w;
  vec3 irradiance = saturate( ( dotNL + w ) / ( 1.0 + w ) ) * directLight.color;
  reflectedLight.directSpecular += saturate( dotNL ) * directLight.color * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
  float back = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), uLeafLight.y );
  float away = saturate( -dotNL );
  reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * uLeafTrans * ( 0.3 * away + back ) * uLeafLight.x * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf25`)
      // baked crown AO: all of the ambient, part of the direct (self-shadowing the shadow map is too coarse for)
      .replace('#include <lights_fragment_end>', TC26 ? `#include <lights_fragment_end>
      // (the canopy's multiple-scattering gain is a DAYLIGHT calibration: at night the ambient is the warm street bounce, and
      // x3.2 on it lit every crown in the street like a lamp; night takes uLeafClu.z)
      reflectedLight.indirectDiffuse *= mix(uLeafBal.w, 1.0, vAO25) * mix( uLeafBal.y, uLeafClu.z, smoothstep( 0.15, 0.6, uLeafNight ) )
        * ( 1.0 - uLeafClu.x * 0.5 * saturate( -dot( vClu26, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) ) );
      reflectedLight.indirectSpecular *= mix(0.35, 1.0, vAO25) * uLeafBal.z;
      reflectedLight.directDiffuse *= uLeafBal.x;
      reflectedLight.directSpecular *= uLeafBal.x;` : `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= mix(uLeafBal.w, 1.0, vAO25) * uLeafBal.y;
      reflectedLight.indirectSpecular *= mix(0.35, 1.0, vAO25) * uLeafBal.z;
      reflectedLight.directDiffuse *= mix(1.0, vAO25, uLeafLight.z) * uLeafBal.x;
      reflectedLight.directSpecular *= mix(1.0, vAO25, uLeafLight.z) * uLeafBal.x;`);
    // TC26: flag the directional (sun) loop, so RE_Direct_Leaf25 knows the sun from the street lamps and headlamps
    if (TC26) {
      const lfb = THREE.ShaderChunk.lights_fragment_begin, mk = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
      if (lfb.includes(mk)) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', lfb.replace(mk, 'leaf26Sun = 1.0;\n' + mk));
    }
  };
  tc26Defines(m);
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + (TC26 ? '|tv25|tc26' : '|tv25');
  // measurement pages: window.__TC26(false|true) switches the crown between TV25 and TC26 shading in place (one recompile)
  if (typeof window !== 'undefined') window.__TC26 = (on) => { TC26 = !!on; tc26Defines(m); m.needsUpdate = true; return TC26; };
  m.__tv25 = true;
  m.needsUpdate = true;
}

// ---- the TV25 set: BAKED (public/models/trees25, tools/bake_trees.mjs) or, when the bake is missing or stale, generated
// here. Both return { geos: Map(base -> { trunk0, leaves0, leaves1, bark }), atlas, barkTex, stats, main }.
// `main` is the main-thread time spent (the loader's work is fetches and image decodes, which run off the main thread).
const BAKE25 = 'models/trees25/';
const TA25 = { f32: Float32Array, i8: Int8Array, u8: Uint8Array, u16: Uint16Array, u32: Uint32Array };
function geoFromBake25(bin, G) {
  const g = new THREE.BufferGeometry();
  for (const [name, [off, count, size, type, norm]] of Object.entries(G.attrs)) g.setAttribute(name, new THREE.BufferAttribute(new TA25[type](bin, off, count * size), size, norm));
  const [ioff, icount, itype] = G.index;
  g.setIndex(new THREE.BufferAttribute(new TA25[itype](bin, ioff, icount), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
function texFromBitmap25(bm, srgb) {
  const t = new THREE.Texture(bm);
  t.flipY = false;   // ImageBitmaps ignore UNPACK_FLIP_Y; the bark is decoded flipped (imageOrientation) to match TextureLoader
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
// gzip -> ArrayBuffer off the main thread: a throwaway worker running DecompressionStream (main-thread fallback)
function gunzip25(getSlice) {
  const inflate = (b) => new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  try {
    const src = "onmessage=async(e)=>{try{const o=await new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();postMessage(o,[o]);}catch(err){postMessage(null);}}";
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    return new Promise((res) => {
      const done = (v) => { w.terminate(); URL.revokeObjectURL(url); res(v); };
      w.onmessage = (e) => done(e.data || inflate(getSlice()));
      w.onerror = () => done(inflate(getSlice()));
      const c = getSlice();
      w.postMessage(c, [c]);
    });
  } catch (e) { return inflate(getSlice()); }
}
const px25 = (r, g, b, a = 255) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; };
async function loadBake25() {
  const tL = performance.now(), steps = {}, mark = (k) => { steps[k] = Math.round(performance.now() - tL); };
  let main = 0, m0 = performance.now();
  const key = bakeKey25(TREE_FORMS, TV25_POOLS, 'a' + ATLAS.VERSION + '|t' + T25.ALPHA);
  main += performance.now() - m0;
  // started at page load by furnitureKit.js (TV25_BAKE); a late fallback fetch only if that is missing
  const J = TV25_BAKE ? await TV25_BAKE.json : await (await fetch(BAKE25 + 'trees25.json', { priority: 'high' })).json();
  if (!J) throw new Error('trees25.json unavailable');
  mark('json');
  if (J.key !== key) throw new Error(`stale bake (key ${J.key}, forms/generator ${key})`);
  if (J.version !== 4) throw new Error('bake format v' + J.version);
  // ONE bundle: geometry, the atlas mip chain (gzip raw RGBA) and the bark JPGs
  const bin = TV25_BAKE ? await TV25_BAKE.bin : await fetch(BAKE25 + 'trees25.bin', { priority: 'high' }).then((r) => { if (!r.ok) throw new Error('trees25.bin HTTP ' + r.status); return r.arrayBuffer(); });
  if (!bin) throw new Error('trees25.bin unavailable');
  mark('bin');
  // ---- the atlas: no image decoder (they are queued behind the whole boot's textures: 62 s measured) — inflate the raw
  // chain in a worker and upload it as a DataTexture, the path furnitureKit's alphaMipTexture takes at runtime
  const [go, gn] = J.atlas.gz;
  const rawBuf = await gunzip25(() => bin.slice(go, go + gn));
  mark('atlasInflated');
  m0 = performance.now();
  const atlas = alphaMipDataTexture(J.atlas.raw.map(([o, w, h]) => ({ data: new Uint8Array(rawBuf, o, w * h * 4), width: w, height: h })), { anisotropy: 8 });
  // ---- bark: JPGs, decoded whenever the image decoders get to them. The materials start on 1x1 placeholders (a mean
  // bark colour and a flat normal — same defines, so the swap is not a recompile) and take the real maps when ready.
  const raw = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  const blob = ([o, n, type]) => new Blob([new Uint8Array(bin, o, n)], { type });
  const barkTex = {};
  for (const [k, [, , ns]] of Object.entries(J.bark)) barkTex[k] = { map: px25(104, 96, 86), normal: px25(128, 128, 255), ns };
  for (const B of Object.values(barkTex)) B.map.colorSpace = THREE.SRGBColorSpace;
  const barkReady = Promise.all(Object.entries(J.bark).map(async ([k, [c, n, ns]]) => {
    const [bc, bn] = await Promise.all([createImageBitmap(blob(c), { imageOrientation: 'flipY' }), createImageBitmap(blob(n), { ...raw, imageOrientation: 'flipY' })]);
    return [k, { map: texFromBitmap25(bc, true), normal: texFromBitmap25(bn, false), ns }];
  })).then((b) => { mark('bark'); return Object.fromEntries(b); });
  const geos = new Map();
  let trisT = 0, tris0 = 0, tris1 = 0;
  for (const [base, P] of Object.entries(J.pools)) {
    geos.set(base, { trunk0: geoFromBake25(bin, P.trunk0), leaves0: geoFromBake25(bin, P.leaves0), leaves1: geoFromBake25(bin, P.leaves1), bark: P.bark, stats: P.stats });
    trisT += P.stats.trunkTris; tris0 += P.stats.leafTris0; tris1 += P.stats.leafTris1;
  }
  main += performance.now() - m0;
  mark('geometry');
  return { geos, atlas, barkTex, barkReady, stats: { trisT, tris0, tris1, bytes: bin.byteLength }, main, steps };
}
async function generate25() {
  let main = 0;
  const { Tree } = await import('@dgreenheck/ez-tree');
  let m0 = performance.now();
  // ez-tree keeps its textures in a module registry; a throwaway trunk per type hands them over
  const ezTex = (barkType, leafType) => {
    const t = new Tree();
    t.options.bark.type = barkType; t.options.leaves.type = leafType; t.options.branch.levels = 0; t.options.leaves.count = 0;
    t.generate();
    const out = { color: t.branchesMesh.material.map, normal: t.branchesMesh.material.normalMap, leaf: t.leavesMesh.material.map };
    t.branchesMesh.geometry.dispose(); t.leavesMesh.geometry.dispose();
    return out;
  };
  const ez = { oak: ezTex('oak', 'oak'), willow: ezTex('willow', 'ash'), birch: ezTex('birch', 'aspen') };
  main += performance.now() - m0;
  const [oakLeaf, ashLeaf, aspenLeaf, oakC, oakN, wilC, wilN, birC, birN] = await Promise.all([
    ez.oak.leaf, ez.willow.leaf, ez.birch.leaf, ez.oak.color, ez.oak.normal, ez.willow.color, ez.willow.normal, ez.birch.color, ez.birch.normal,
  ].map(texImage25));
  m0 = performance.now();
  const atlasCanvas = paintLeafAtlas25({ oak: oakLeaf, ash: ashLeaf, aspen: aspenLeaf });
  // (debug handle for the tree lab's per-cell coverage census only: the 16 MB canvas is not kept otherwise)
  if (typeof window !== 'undefined' && /(^|[?&])tv25dbg=1/.test(location.search)) window.__TREE25_ATLAS = atlasCanvas;
  const atlas = alphaMipTexture(atlasCanvas, T25.ALPHA, { name: 'leafAtlas25', cells: T25.NC, anisotropy: 8 });
  const barkTex = {
    oak: { map: wrapTex25(oakC, true), normal: wrapTex25(oakN, false), ns: 1.0 },
    willow: { map: wrapTex25(wilC, true), normal: wrapTex25(wilN, false), ns: 1.0 },
    birch: { map: wrapTex25(birC, true), normal: wrapTex25(birN, false), ns: 0.8 },
    plane: { map: canvasTex25(planeCamoCanvas25()), normal: wrapTex25(birN, false), ns: 0.35 },
  };
  main += performance.now() - m0;
  const geos = new Map();
  let trisT = 0, tris0 = 0, tris1 = 0;
  for (const base of TV25_POOLS) {
    const S = tv25Spec(base);
    if (!S) continue;
    m0 = performance.now();
    try {
      const r = buildTree(S.F, S.H, S.W, S.seed, { cellUV: cellUV25, barkCell: LEAF_CELLS.bark });
      geos.set(base, { trunk0: r.trunk0, leaves0: r.leaves0, leaves1: r.leaves1, bark: S.F.bark || 'oak', stats: r.stats });
      trisT += r.stats.trunkTris; tris0 += r.stats.leafTris0; tris1 += r.stats.leafTris1;
    } catch (e) { console.warn('[trees25] failed', base, e); }
    main += performance.now() - m0;
    await sleep(0);   // one form per task: no long main-thread stall while the city streams
  }
  return { geos, atlas, barkTex, stats: { trisT, tris0, tris1 }, main };
}

async function upgradeTreesTV25(instancer) {
  const t0 = performance.now();
  let T = null, from = 'bake';
  if (!/(^|[?&])tv25gen=1/.test(location.search)) {
    try { T = await loadBake25(); }
    catch (e) { console.warn(`[trees25] no usable bake (${e.message}): generating at runtime — run \`node tools/bake_trees.mjs\``); }
  }
  if (!T) { from = 'runtime'; T = await generate25(); }
  const m0 = performance.now();
  // ---- bark: the prop light trim (STREET_CAL) like every other thing standing on the pavement. Four materials, one
  // program (identical defines and hooks; only the textures differ).
  const STREET_CAL = [1.94, 1.70, 1.47];
  const mkBark = (B) => {
    const m = new THREE.MeshStandardMaterial({ map: B.map, normalMap: B.normal, roughness: 0.93, metalness: 0, vertexColors: true });
    if (B.normal) m.normalScale.set(B.ns, B.ns);
    return applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
  };
  const bark = {};
  for (const [k, B] of Object.entries(T.barkTex)) bark[k] = mkBark(B);
  // baked set: the bark JPGs decode after the trees are up; swap the real maps in when they land (no recompile)
  if (T.barkReady) T.barkReady.then((D) => { for (const [k, B] of Object.entries(D)) if (bark[k]) { bark[k].map = B.map; bark[k].normalMap = B.normal; } }).catch((e) => console.warn('[trees25] bark maps', e));
  const NOTHING = new THREE.BufferGeometry();
  NOTHING.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  NOTHING.setIndex([0, 1, 2]);
  let nBuilt = 0;
  for (const [base, G] of T.geos) {
    const pT = instancer.pools.get(base + 'Trunk'), pC = instancer.pools.get(base + 'Crown');
    if (!pT || !pC) continue;
    pT.mesh.geometry = G.trunk0; pT.mesh.material = bark[G.bark] || bark.oak;
    pC.mesh.geometry = G.leaves0;
    instancer.setLOD(base + 'Crown', G.leaves1, T25.LOD);
    // far trees draw their trunk inside the crown LOD (the bark-cell proxy): the trunk pool draws near only
    instancer.setLOD(base + 'Trunk', NOTHING, T25.LOD);
    if (pT.mesh2) pT.mesh2.visible = false;
    if (pT.shadow2) pT.shadow2.castShadow = false;
    // …and no far-cascade proxy for the bark: it is a BOX fitted to the whole branch mesh (limbs span the crown),
    // i.e. a crown-sized box shadow under every distant tree; the crown's own blob proxy already covers it
    if (pT.far) pT.far.castShadow = false;
    nBuilt++;
  }
  applyEdgeFade(instancer);
  applyCrownShading25(instancer.crownMat);
  // N26: the canopy's x3.2 multiple-scattering gain is a DAYLIGHT calibration; on the warm night bounce it lit every crown in
  // the street (harlemRowN: canopy 60,51 -> 34,24 at x1.0, lamp core unchanged). Night 0.15 -> 0.6 takes it to 1.0; golden
  // (0.05) and day keep 3.2 exactly.
  if (N26) {
    const B0 = LEAF25.bal.value.y;
    const nightBal = () => { const n = ENV.night.value, t = Math.min(1, Math.max(0, (n - 0.15) / 0.45)); LEAF25.bal.value.y = B0 + (1.0 - B0) * t * t * (3 - 2 * t); requestAnimationFrame(nightBal); };
    requestAnimationFrame(nightBal);
  }
  instancer.crownMat.map = T.atlas;
  instancer.crownMat.alphaTest = T25.ALPHA;
  instancer.crownMat.needsUpdate = true;
  const main = T.main + performance.now() - m0;
  const s = T.stats;
  console.log(`[trees25] ${nBuilt} forms from the ${from} in ${(performance.now() - t0).toFixed(0)} ms wall, ${main.toFixed(0)} ms main thread`
    + ` (ready ${(performance.now() / 1000).toFixed(1)} s after navigation): bark ${s.trisT} tris, leaves ${s.tris0} (LOD0) / ${s.tris1} (LOD1, ${T25.LOD} m)`);
  if (typeof window !== 'undefined') window.__TREE25_BOOT = { from, wallMs: performance.now() - t0, mainMs: main, readyS: performance.now() / 1000, startS: t0 / 1000, fetchStartS: TV25_BAKE ? TV25_BAKE.t0 / 1000 : null, steps: T.steps || null };
}
