// ez-tree street trees (MIT, github.com/dgreenheck/ez-tree): replaces the
// procedural puff trees with parametric trunks/branches + textured leaf cards.
// Same pool-geometry-swap pattern as props.js — instances (real street-tree
// census positions) stay; trunk pools get a bark-textured material, crown
// pools keep the shared wind/snow crownMat whose map becomes the ez-tree leaf.
import * as THREE from 'three';
import { ENV, applySnowCap } from '../world/materials.js';
import { alphaMipTexture, TREE_ARCH } from './furnitureKit.js';

// TC13 STREET CANOPY (docs/notes/canopy-r13.md, critic-r13 ranked fix 9).
// `?tc13=0` restores the r12 crown: height-only normalisation, 0.32x leaf
// count, and the near-white colour bake. One parse site per file.
const TC13 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tc13') === '0');
// FD14 (docs/notes/fd14.md) — ?fd14=0 restores the TC13 crown. In THIS file: leaf card
// area and count (the crowns are still see-through at 3x; critic-r14 fix 8).
const FD14T = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('fd14') === '0');

export async function upgradeTrees(instancer) {
  const { Tree } = await import('@dgreenheck/ez-tree');
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
  // EDGE-ON FADE: leaf cards carry crown-radial normals for lighting, so a card
  // seen edge-on is still "fully lit" and, after the alpha test, renders as a
  // bright hairline sliver (critic round 2, defect 9). `aFace` (set above) is
  // the card's true facing; fade alpha as the view direction grazes it, before
  // the alpha test discards. Geometries without `aFace` read (0,0,0) -> no fade.
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
