// BX-WIN (AR34 BX, 2026-10-02): the tile facades' look baked in the page for the offline targets (harvest.mjs -> usd_write.py
// with usd_windows.py -> blender_windows.py). Owner on the first Cycles frames: the windows were "too basic"; the tile facades
// (TOWERFX and the generic buildings) drew their window grids, rooms, sashes, signs and masonry in the facade shader
// (world/materials.js makeFacadeMaterial), so the export had plain shells (the green building right of the 125th St pier).
//
// What it does, in the page, once a shot's static world is captured (BX-SEQ hook shotDone; the dresser still frozen):
//   1. every tile-facade mesh of the near level (material userData.isFacade; the streamer's far level left out) whose
//      triangles lie in the capture's own region (window.__EXP.lib.inRegion with F: along the lens path the 4 m cells within
//      F of every frame's lens position and the ready near tiles; else the legacy square), the buildings the dresser rebuilt
//      (uHide) dropped, cut into charts: a wall in its own facade metres (uv: along the wall, height above the building's
//      base), a roof or any up / down face in world x, -z per 24 m cell;
//   2. a texel density per chart by its distance to the lens path (every frame's lens position; the shots' key points in
//      the legacy square mode): --bxdens near,...,far px/m at < 90, 180, 320, 520 m and beyond, scaled down together when the
//      atlases would exceed --bxatlases; shelf-packed into square atlases (--bxsize, 4096);
//   3. one render per atlas with the page's own facade program in UV space (gl_Position = the atlas position) and a head-on
//      view (the lens 8 m straight out from the wall, so nothing view-dependent is baked at the take's angle) into three
//      colour attachments at once:
//        alb: the facade's albedo (diffuseColor after the facade code, sRGB-encoded), alpha = coverage;
//        dat: R roughness (before the specular AA), G window glass of the generic grid (the opening less the AC units),
//             B the room's lit state (the shader's own `lit`), alpha = coverage;
//        emi: the shader's emission without its fake reflections (the analytic sky / sun mirror and the street bounce are
//             the path tracer's job), sqrt(emis / 8) per channel, alpha = coverage;
//      the program compiled once in its own page.evaluate, one evaluate per atlas, the GPU waited on through a fence from
//      timers, so the page keeps answering the harness guard;
//   4. the charts' triangles de-indexed in world space with their attributes (position, normal, colour, facade uv, atlas uv,
//      aux / aux2 / aux3 / aBid and the chart's atlas-uv-per-metre) as geo/bxw_<shot>_fac<k>.bin, and bxwin_<shot>.json
//      (bxwin.json indexes the shots).
// The kit's window glass materials are tagged with their shader constants (f0, rough, dirt, canyon) in userData before the
// first static capture, so the harvest's material table carries them (usd_windows.py / blender_windows.py build thin glass).
//   flags (harvest.mjs): --nobxwin, --bxsize 4096, --bxatlases 12, --bxdens 16,12,8,4,2.5

function bxwinLib(cfg) {
  const E = window.__ENGINE;
  if (window.__BXWIN) { window.__BXWIN.cfg = cfg; return 'present'; }
  const C = { cfg };
  const post = async (name, body) => {
    const c = C.cfg;
    if (!c.sink && window.__EXP && window.__EXP.lib && window.__EXP.lib.post) return window.__EXP.lib.post(name, body);   // SEQ's hook API
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(c.sink + '/put/' + name, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });
        if (r.ok) return true;
      } catch (e) { if (a === 3) throw e; }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('sink failed ' + name);
  };
  // ---- the kit's window glass: its shader constants (fk/kitMats.js winGlass, program key 'kitwinglass3|f0|rough|dirt|cf')
  const tagKitGlass = () => {
    let n = 0;
    const seen = new Set();
    E.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m || seen.has(m.uuid)) continue;
        seen.add(m.uuid);
        if (!m.userData || !m.userData.fkGlass || typeof m.customProgramCacheKey !== 'function') continue;
        const k = String(m.customProgramCacheKey() || '');
        const p = /kitwinglass\d*\|([\d.eE+-]+)\|([\d.eE+-]+)\|([\d.eE+-]+)\|([\d.eE+-]+)/.exec(k);
        if (!p) continue;
        m.userData.bxwF0 = +p[1]; m.userData.bxwRough = +p[2]; m.userData.bxwDirt = +p[3]; m.userData.bxwCanyon = +p[4];
        n++;
      }
    });
    return n;
  };
  // ---- the bake material: the facade's own onBeforeCompile chain, then the UV-space / head-on / three-output patch
  const bakeMats = new Map();
  const bakeMat = (T, orig) => {
    if (bakeMats.has(orig.uuid)) return bakeMats.get(orig.uuid);
    const bm = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0 });
    bm.side = T.DoubleSide; bm.depthTest = false; bm.depthWrite = false; bm.blending = T.NoBlending; bm.toneMapped = false;
    bm.userData = { ...orig.userData };
    bm.onBeforeCompile = (sh, r) => {
      orig.onBeforeCompile.call(orig, sh, r);
      sh.defines = sh.defines || {};
      sh.defines.BXBAKE = 4;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aBkUv; varying vec3 vBkCam;')
        .replace('#include <fog_vertex>', `#include <fog_vertex>
          { vec3 bkN = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
            vec3 bkW = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vBkCam = bkW + bkN * 8.0;                                     // the lens 8 m straight out from the wall
            vViewPosition = (viewMatrix * vec4(bkN * 8.0, 0.0)).xyz;      // fragment -> lens, view space (head-on)
            gl_Position = vec4(aBkUv * 2.0 - 1.0, 0.0, 1.0); }`);
      let f = sh.fragmentShader;
      const cnt = (re) => (f.match(re) || []).length;
      const stats = C.cfg.patchStats;
      const before = { refl: cnt(/FAC_emis \+= (mirC|sunColW|skyLook\(|vec3\(0\.35, 0\.24, 0\.12\) \* night)/g), dbg1: cnt(/FAC_dbg = 1\.0;/g), glow: cnt(/float roomGlow = lit \* mix\(0\.22, 1\.0, night\);/g), ac: cnt(/albedo = mix\(albedo, acCol, acM\);/g) };
      f = f.replace('#include <common>', '#include <common>\nlayout(location = 1) out highp vec4 bkOut1;\nlayout(location = 2) out highp vec4 bkOut2;\nvarying vec3 vBkCam;\nfloat BK_win = 0.0; float BK_lit = 0.0; float BK_ac = 0.0; float BK_rough = 1.0; vec3 BK_refl = vec3(0.0);\n#define cameraPosition vBkCam\n')
        .replace(/FAC_emis \+= mirC/g, 'BK_refl += mirC')
        .replace(/FAC_emis \+= sunColW/g, 'BK_refl += sunColW')
        .replace(/FAC_emis \+= skyLook\(/g, 'BK_refl += skyLook(')
        .replace(/FAC_emis \+= vec3\(0\.35, 0\.24, 0\.12\) \* night/g, 'BK_refl += vec3(0.35, 0.24, 0.12) * night')
        .replace('FAC_dbg = 1.0;', 'FAC_dbg = 1.0; BK_win = 1.0;')
        .replace('float roomGlow = lit * mix(0.22, 1.0, night);', 'float roomGlow = lit * mix(0.22, 1.0, night); BK_lit = lit;')
        .replace('albedo = mix(albedo, acCol, acM);', 'albedo = mix(albedo, acCol, acM); BK_ac = max(BK_ac, acM);')
        .replace('albedo = mix(diffuseColor.rgb * 0.92, albedo, winMask);', 'albedo = mix(diffuseColor.rgb * 0.92, albedo, winMask); BK_win *= winMask;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nBK_rough = roughnessFactor;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          { vec3 bc = clamp(diffuseColor.rgb, 0.0, 1.0);
            bc = mix(bc * 12.92, 1.055 * pow(bc, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), bc));
            gl_FragColor = vec4(bc, 1.0);
            bkOut1 = vec4(clamp(BK_rough, 0.0, 1.0), clamp(BK_win * (1.0 - BK_ac), 0.0, 1.0), clamp(BK_lit, 0.0, 1.0), 1.0);
            bkOut2 = vec4(sqrt(clamp(FAC_emis / 8.0, 0.0, 1.0)), 1.0); }`);
      sh.fragmentShader = f;
      if (stats && !stats.done) { stats.done = true; Object.assign(stats, before, { out: f.includes('bkOut2 = vec4') }); }
    };
    const ok = orig.customProgramCacheKey ? orig.customProgramCacheKey.bind(orig) : () => '';
    bm.customProgramCacheKey = () => ok() + '|bxwbake3mrt';
    bm.needsUpdate = true;
    bakeMats.set(orig.uuid, bm);
    return bm;
  };
  let st = null;
  // ---- 1-2: the facade meshes, charts, densities, packing (one shot's region)
  const plan = async () => {
    const cfg = C.cfg;
    const T = await window.__EXP.getThree();
    const R = E.renderer, cam = E.camera, gl = R.getContext();
    const t0 = performance.now();
    const lib = window.__EXP.lib || {};
    const RG = lib.RG || { on: false };
    const inReg = lib.inRegion ? (x, z) => lib.inRegion(x, z, 0, cfg.F) : (x, z) => Math.abs(x - cfg.cx) <= cfg.F && Math.abs(z - cfg.cz) <= cfg.F;
    const farGroup = window.__STREAMER ? window.__STREAMER.macroGroup : null;
    const isFar = (o) => { for (let p = o.parent; p; p = p.parent) if (farGroup && p === farGroup) return true; return /^(macroCrowns_|farTerrain)/.test(o.name || ''); };
    const facs = [];
    const visChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    let nFar = 0;
    E.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const slot = ms.findIndex((m) => m && m.userData && m.userData.isFacade);
      if (slot < 0 || !visChain(o)) return;
      if (isFar(o)) { nFar++; return; }
      facs.push({ o, slot, mat: ms[slot], multi: Array.isArray(o.material) });
    });
    // the lens path the density is measured from (every frame's lens position along the path; else the key points)
    const pts = RG.on && RG.pts && RG.pts.length ? RG.pts : (cfg.pts || [[cfg.cx, cfg.cz]]);
    const dens = cfg.dens || [16, 12, 8, 4, 2.5];
    const ring = [90, 180, 320, 520];
    // a coarse grid of the path points (8 m) for the nearest-point search per chart
    const G8 = new Map();
    for (const [px, pz] of pts) { const k = Math.floor(px / 8) + ',' + Math.floor(pz / 8); if (!G8.has(k)) G8.set(k, [px, pz]); }
    const P8 = [...G8.values()];
    const distTo = (x, z) => { let d = 1e18; for (const [px, pz] of P8) { const q = (x - px) * (x - px) + (z - pz) * (z - pz); if (q < d) d = q; } return Math.sqrt(d); };
    const densAt = (d) => { for (let i = 0; i < ring.length; i++) if (d < ring[i]) return dens[i]; return dens[dens.length - 1]; };
    const charts = new Map();
    const skipped = { attrs: 0, hidden: 0, region: 0, nan: 0, far: nFar };
    const meshes = [];
    for (let mi = 0; mi < facs.length; mi++) {
      const { o, slot, mat, multi } = facs[mi];
      const g = o.geometry, A = g.attributes;
      if (!A.uv || !A.aux || !A.aux2 || !A.aux3) { skipped.attrs++; continue; }
      const hide = mat.userData && mat.userData.hideTex && mat.userData.hideTex.image ? mat.userData.hideTex.image.data : null;
      const idx = g.index ? g.index.array : null;
      const nI = idx ? g.index.count : A.position.count;
      const start = Math.max(0, g.drawRange.start), end = Math.min(nI, start + g.drawRange.count);
      const grp = multi && g.groups && g.groups.length ? g.groups : null;
      o.updateMatrixWorld(true);
      const e = o.matrixWorld.elements;
      const P = A.position;
      const wp = (i) => { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
      let nIn = 0;
      for (let t = start; t + 2 < end; t += 3) {
        if (grp) { let ok = false; for (const q of grp) if (t >= q.start && t < q.start + q.count) { ok = (q.materialIndex ?? 0) === slot; break; } if (!ok) continue; }
        const ia = idx ? idx[t] : t, ib = idx ? idx[t + 1] : t + 1, ic = idx ? idx[t + 2] : t + 2;
        const pa = wp(ia), pb = wp(ib), pc = wp(ic);
        const mx = (pa[0] + pb[0] + pc[0]) / 3, mz = (pa[2] + pb[2] + pc[2]) / 3;
        if (!inReg(mx, mz)) { skipped.region++; continue; }
        const bid = A.aBid ? Math.round(A.aBid.getX(ic)) : -1;
        if (hide && bid >= 0 && bid < hide.length && hide[bid] > 127) { skipped.hidden++; continue; }
        const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz);
        if (!(nl > 1e-9) || !isFinite(mx)) { skipped.nan++; continue; }
        nx /= nl; ny /= nl; nz /= nl;
        const wall = Math.abs(ny) < 0.6;
        let key, cu;
        if (wall) {
          const ang = Math.round((Math.atan2(nz, nx) * 180) / Math.PI / 2);
          const dpl = Math.round((nx * pa[0] + nz * pa[2]) / 0.5);
          key = `${mi}|${bid}|w|${A.aux3.getY(ic).toFixed(4)}|${A.aux3.getX(ic).toFixed(2)}|${ang}|${dpl}`;
          cu = [[A.uv.getX(ia), A.uv.getY(ia)], [A.uv.getX(ib), A.uv.getY(ib)], [A.uv.getX(ic), A.uv.getY(ic)]];
        } else {
          // (a 24 m cell too: one building's roof pieces at one height are often far apart, plant boxes, bulkheads)
          key = `${mi}|${bid}|r|${Math.round(((pa[1] + pb[1] + pc[1]) / 3) * 4)}|${ny > 0 ? 1 : 0}|${Math.floor(mx / 24)}|${Math.floor(mz / 24)}`;
          cu = [[pa[0], -pa[2]], [pb[0], -pb[2]], [pc[0], -pc[2]]];
        }
        let ch = charts.get(key);
        if (!ch) { ch = { key, mi, wall, tris: [], cu: [], u0: 1e9, u1: -1e9, v0: 1e9, v1: -1e9, sx: 0, sz: 0, n: 0 }; charts.set(key, ch); }
        ch.tris.push(ia, ib, ic);
        for (const [cuu, cvv] of cu) { ch.cu.push(cuu, cvv); if (cuu < ch.u0) ch.u0 = cuu; if (cuu > ch.u1) ch.u1 = cuu; if (cvv < ch.v0) ch.v0 = cvv; if (cvv > ch.v1) ch.v1 = cvv; }
        ch.sx += mx; ch.sz += mz; ch.n++;
        nIn++;
      }
      if (nIn) meshes.push({ name: (o.name || '') + (o.parent && o.parent.name ? ' < ' + o.parent.name : ''), uuid: o.uuid, mat: mat.uuid, tris: nIn });
    }
    // 3. densities and packing (shelves, tallest first); the whole set scaled down together if over budget
    const S = cfg.S || 4096, PAD = 2, maxA = cfg.maxAtlas || 12;
    const CH = [...charts.values()];
    const dhist = [0, 0, 0, 0, 0];
    for (const ch of CH) {
      ch.dist = distTo(ch.sx / ch.n, ch.sz / ch.n);
      ch.D0 = densAt(ch.dist); ch.du = Math.max(ch.u1 - ch.u0, 0.01); ch.dv = Math.max(ch.v1 - ch.v0, 0.01);
      dhist[Math.min(4, ring.findIndex((r) => ch.dist < r) < 0 ? 4 : ring.findIndex((r) => ch.dist < r))]++;
    }
    // over budget, the far charts (320 m and beyond) give up density first (down to 0.6: 1.5 px/m, a far window still 2 texels), then all of them
    let scale = 1, scFar = 1, atl = [];
    const pack = (sc) => {
      for (const ch of CH) {
        let D = ch.D0 * sc * (ch.dist >= 320 ? scFar : 1);
        const lim = (S - 2 * PAD - 2) / Math.max(ch.du, ch.dv);
        if (D > lim) D = lim;
        ch.D = D; ch.w = Math.ceil(ch.du * D) + 2 * PAD + 1; ch.h = Math.ceil(ch.dv * D) + 2 * PAD + 1;
      }
      CH.sort((a, b) => b.h - a.h || b.w - a.w);
      const out = [];
      let cur = null, x = 0, y = 0, sh = 0;
      for (const ch of CH) {
        if (!cur || x + ch.w > S) { y += sh; x = 0; sh = 0; }
        if (!cur || y + ch.h > S) { cur = { k: out.length, charts: [] }; out.push(cur); x = 0; y = 0; sh = 0; }
        ch.ax = x; ch.ay = y; ch.atlas = cur.k; cur.charts.push(ch);
        x += ch.w; sh = Math.max(sh, ch.h);
      }
      return out;
    };
    if (CH.length) {
      for (let it = 0; it < 16; it++) {
        atl = pack(scale);
        if (atl.length <= maxA) break;
        const f = Math.sqrt(maxA / atl.length) * 0.97;
        if (scFar > 0.6) scFar = Math.max(0.6, scFar * f); else scale *= f;
      }
    }
    const out = { when: new Date().toString(), tag: cfg.tag, size: S, pad: PAD, densityScale: +scale.toFixed(3), farScale: +scFar.toFixed(3), dens, ring, mode: RG.on ? 'path' : 'square', pathPts: pts.length,
      chartsByRing: dhist, atlases: [], meshes, kitGlass: cfg.kitGlass || 0, skipped, charts: CH.length, patch: cfg.patchStats, timing: { planMs: Math.round(performance.now() - t0), gpuMs: 0, readMs: 0, postMs: 0 } };
    st = { T, R, cam, gl, atl, S, PAD, facs, out, t0 };
    return { atlases: atl.length, charts: CH.length, mode: out.mode, pathPts: pts.length, planMs: out.timing.planMs };
  };
  // the bake program, compiled in its own evaluate (the facade program is large and its compile blocks the page)
  const compile = async () => {
    const { T, R, cam, facs } = st;
    const sc = new T.Scene();
    const G = new T.BufferGeometry();
    for (const [nm, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['aBkUv', 2], ['aux', 4], ['aux2', 4], ['aux3', 3], ['aBid', 1]]) G.setAttribute(nm, new T.BufferAttribute(new Float32Array(3 * k), k));
    const seen = new Set();
    for (const f of facs) {
      if (seen.has(f.mat.uuid)) continue;
      seen.add(f.mat.uuid);
      const m = new T.Mesh(G, bakeMat(T, f.mat));
      m.frustumCulled = false; m.layers.mask = cam.layers.mask;
      sc.add(m);
    }
    const t0 = performance.now();
    const rt = new T.WebGLRenderTarget(4, 4, { depthBuffer: false, type: T.UnsignedByteType, count: 3 });
    const prev = R.getRenderTarget();
    R.setRenderTarget(rt); R.render(sc, cam); R.setRenderTarget(prev);
    rt.dispose(); G.dispose();
    return Math.round(performance.now() - t0);
  };
  // 3-4: one atlas: the bake meshes, one render into three attachments, the GPU fence, readbacks, the export blob
  const bakeOne = async (k) => {
    const { T, R, cam, gl, S, PAD, facs, out } = st;
    const tag = C.cfg.tag;
    const rt = st.rt || (st.rt = new T.WebGLRenderTarget(S, S, { depthBuffer: false, type: T.UnsignedByteType, colorSpace: T.NoColorSpace, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false, count: 3 }));
    const bscene = new T.Scene();
    const prevRT = R.getRenderTarget(), prevAuto = R.autoClear, prevCC = R.getClearColor(new T.Color()), prevCA = R.getClearAlpha();
    const at = st.atl[k];
    const tb = performance.now();
    let nt = 0;
    for (const ch of at.charts) nt += ch.tris.length / 3;
    const pos = new Float32Array(nt * 9), nrm = new Float32Array(nt * 9), col = new Float32Array(nt * 9), fuv = new Float32Array(nt * 6), bk = new Float32Array(nt * 6);
    const tri = new Float32Array(nt * 13);
    const per = {};
    let j = 0;
    for (const ch of at.charts) {
      const { o } = facs[ch.mi];
      const A = o.geometry.attributes, e = o.matrixWorld.elements;
      const nm = new T.Matrix3().getNormalMatrix(o.matrixWorld).elements;
      for (let q = 0; q < ch.tris.length; q += 3, j++) {
        const ic = ch.tris[q + 2];
        for (let c = 0; c < 3; c++) {
          const vi = ch.tris[q + c];
          const x = A.position.getX(vi), y = A.position.getY(vi), z = A.position.getZ(vi);
          pos[j * 9 + c * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[j * 9 + c * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[j * 9 + c * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          if (A.normal) {
            const a = A.normal.getX(vi), b = A.normal.getY(vi), d = A.normal.getZ(vi);
            const X = nm[0] * a + nm[3] * b + nm[6] * d, Y = nm[1] * a + nm[4] * b + nm[7] * d, Z = nm[2] * a + nm[5] * b + nm[8] * d;
            const l = Math.hypot(X, Y, Z) || 1; nrm[j * 9 + c * 3] = X / l; nrm[j * 9 + c * 3 + 1] = Y / l; nrm[j * 9 + c * 3 + 2] = Z / l;
          }
          if (A.color) { col[j * 9 + c * 3] = A.color.getX(vi); col[j * 9 + c * 3 + 1] = A.color.getY(vi); col[j * 9 + c * 3 + 2] = A.color.getZ(vi); }
          else { col[j * 9 + c * 3] = 1; col[j * 9 + c * 3 + 1] = 1; col[j * 9 + c * 3 + 2] = 1; }
          fuv[j * 6 + c * 2] = A.uv.getX(vi); fuv[j * 6 + c * 2 + 1] = A.uv.getY(vi);
          const cu = ch.cu[(q + c) * 2], cv = ch.cu[(q + c) * 2 + 1];
          bk[j * 6 + c * 2] = (ch.ax + PAD + 0.5 + (cu - ch.u0) * ch.D) / S;
          bk[j * 6 + c * 2 + 1] = (ch.ay + PAD + 0.5 + (cv - ch.v0) * ch.D) / S;
        }
        // the flat per-face data: the provoking (last) vertex's, as the facade shader's flat varyings read them
        const t13 = j * 13;
        tri[t13] = A.aux.getX(ic); tri[t13 + 1] = A.aux.getY(ic); tri[t13 + 2] = A.aux.getZ(ic); tri[t13 + 3] = A.aux.getW(ic);
        tri[t13 + 4] = A.aux2.getX(ic); tri[t13 + 5] = A.aux2.getY(ic); tri[t13 + 6] = A.aux2.getZ(ic); tri[t13 + 7] = A.aux2.getW(ic);
        tri[t13 + 8] = A.aux3.getX(ic); tri[t13 + 9] = A.aux3.getY(ic); tri[t13 + 10] = A.aux3.getZ(ic);
        tri[t13 + 11] = A.aBid ? A.aBid.getX(ic) : -1;
        tri[t13 + 12] = ch.wall ? ch.D / S : -ch.D / S;   // atlas uv per facade metre (negative: a roof chart, world x / -z)
        (per[ch.mi] = per[ch.mi] || []).push(j);
      }
    }
    // the bake meshes (one per source facade material, flat attributes repeated per corner)
    for (const [mi, list] of Object.entries(per)) {
      const n = list.length;
      const G = new T.BufferGeometry();
      const P3 = new Float32Array(n * 9), N3 = new Float32Array(n * 9), C3 = new Float32Array(n * 9), U2 = new Float32Array(n * 6), K2 = new Float32Array(n * 6);
      const X4 = new Float32Array(n * 12), Y4 = new Float32Array(n * 12), Z3 = new Float32Array(n * 9), B1 = new Float32Array(n * 3);
      list.forEach((jj, i) => {
        P3.set(pos.subarray(jj * 9, jj * 9 + 9), i * 9); N3.set(nrm.subarray(jj * 9, jj * 9 + 9), i * 9); C3.set(col.subarray(jj * 9, jj * 9 + 9), i * 9);
        U2.set(fuv.subarray(jj * 6, jj * 6 + 6), i * 6); K2.set(bk.subarray(jj * 6, jj * 6 + 6), i * 6);
        for (let c = 0; c < 3; c++) {
          for (let q = 0; q < 4; q++) { X4[i * 12 + c * 4 + q] = tri[jj * 13 + q]; Y4[i * 12 + c * 4 + q] = tri[jj * 13 + 4 + q]; }
          for (let q = 0; q < 3; q++) Z3[i * 9 + c * 3 + q] = tri[jj * 13 + 8 + q];
          B1[i * 3 + c] = tri[jj * 13 + 11];
        }
      });
      G.setAttribute('position', new T.BufferAttribute(P3, 3)); G.setAttribute('normal', new T.BufferAttribute(N3, 3));
      G.setAttribute('color', new T.BufferAttribute(C3, 3)); G.setAttribute('uv', new T.BufferAttribute(U2, 2)); G.setAttribute('aBkUv', new T.BufferAttribute(K2, 2));
      G.setAttribute('aux', new T.BufferAttribute(X4, 4)); G.setAttribute('aux2', new T.BufferAttribute(Y4, 4)); G.setAttribute('aux3', new T.BufferAttribute(Z3, 3)); G.setAttribute('aBid', new T.BufferAttribute(B1, 1));
      const m = new T.Mesh(G, bakeMat(T, facs[mi].mat));
      m.frustumCulled = false; m.layers.mask = cam.layers.mask; m.matrixAutoUpdate = false; m.matrix.identity(); m.matrixWorld.identity();
      bscene.add(m);
    }
    const files = {};
    const tg = performance.now();
    R.setRenderTarget(rt); R.autoClear = true; R.setClearColor(0x000000, 0); R.clear(); R.render(bscene, cam);
    // the render is GPU-heavy (the facade program over a 4096 square): wait on a fence from timers so the page's main
    // thread stays free (the harness guard probes it) instead of blocking in readPixels for the whole render
    try {
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      await new Promise((res) => { const poll = () => { const s = gl.getSyncParameter(fence, gl.SYNC_STATUS); if (s === gl.SIGNALED || performance.now() - tg > 120000) res(); else setTimeout(poll, 25); }; poll(); });
      gl.deleteSync(fence);
    } catch (e) { /* no fences: readPixels waits */ }
    out.timing.gpuMs += Math.round(performance.now() - tg);
    // each attachment encoded as PNG in the page (the raw 64 MB per attachment through the sink took ~10 s each: 92 % of a
    // bake in the 21:59 timing), rows flipped to top-down so uv (0, 0) is the PNG's bottom left as the sink writes them
    const row = S * 4;
    for (const [ti, pass] of [[0, 'alb'], [1, 'dat'], [2, 'emi']]) {
      const tr0 = performance.now();
      const px = new Uint8Array(S * S * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      R.readRenderTargetPixels(rt, 0, 0, S, S, px, undefined, ti);
      out.timing.readMs += Math.round(performance.now() - tr0);
      const te0 = performance.now();
      const flip = new Uint8ClampedArray(px.length);
      for (let y = 0; y < S; y++) flip.set(px.subarray((S - 1 - y) * row, (S - y) * row), y * row);
      const cv = new OffscreenCanvas(S, S);
      cv.getContext('2d').putImageData(new ImageData(flip, S, S), 0, 0);
      const png = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
      out.timing.encMs = (out.timing.encMs || 0) + Math.round(performance.now() - te0);
      out.timing.bytes = (out.timing.bytes || 0) + png.byteLength;
      const tp0 = performance.now();
      const base = `tex/${tag}_a${at.k}_${pass}`;
      await post(`${base}.png`, png);
      out.timing.postMs += Math.round(performance.now() - tp0);
      files[pass] = base + '.png';
      await new Promise((r) => setTimeout(r, 0));
    }
    while (bscene.children.length) { const m = bscene.children[0]; bscene.remove(m); m.geometry.dispose(); }
    R.setRenderTarget(prevRT); R.autoClear = prevAuto; R.setClearColor(prevCC, prevCA);
    // the export blob: per triangle corners (pos, nrm, col, facade uv, atlas uv) and per triangle data (13 floats)
    const parts = [['pos', pos, 9], ['nrm', nrm, 9], ['col', col, 9], ['fuv', fuv, 6], ['bk', bk, 6], ['tri', tri, 13]];
    let bytes = 0;
    const layout = parts.map(([name, a, per3]) => { const L = { name, offset: bytes, count: a.length, per: per3 }; bytes += a.byteLength; return L; });
    const buf = new Uint8Array(bytes);
    parts.forEach(([, a], i) => buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), layout[i].offset));
    const gfile = `geo/${tag}_fac${at.k}.bin`;
    await post(gfile, buf);
    const dsum = at.charts.reduce((s, ch) => s + ch.D * ch.du * ch.dv, 0), asum = at.charts.reduce((s, ch) => s + ch.du * ch.dv, 0);
    out.atlases.push({ k: at.k, tris: nt, charts: at.charts.length, files, geo: { file: gfile, layout, tris: nt }, densMean: +(dsum / Math.max(asum, 1e-6)).toFixed(2), bakeMs: Math.round(performance.now() - tb),
      fill: +(at.charts.reduce((s, ch) => s + ch.w * ch.h, 0) / (S * S)).toFixed(3) });
    return out.atlases[out.atlases.length - 1].bakeMs;
  };
  const finish = () => {
    if (st.rt) st.rt.dispose();
    for (const m of bakeMats.values()) m.dispose();
    bakeMats.clear();
    const out = st.out;
    out.ms = Math.round(performance.now() - st.t0);
    out.tris = out.atlases.reduce((s, a) => s + a.tris, 0);
    st = null;
    return out;
  };
  window.__BXWIN = { plan, compile, bakeOne, finish, tagKitGlass, cfg };
  Object.defineProperty(window.__BXWIN, 'cfg', { get: () => C.cfg, set: (v) => { C.cfg = v; } });
  return 'installed';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotTag = (s) => 'bxw_' + String(s || 'all').replace(/[^A-Za-z0-9]/g, '_').slice(0, 40);

// Node side: one bake (one shot's region, or the legacy square), written as bxwin_<shot>.json and indexed in bxwin.json
export async function bxwinHarvest(page, o) {
  const t0 = Date.now();
  const tag = shotTag(o.shot);
  const cfg = { sink: o.sink || null, cx: o.cx, cz: o.cz, R: o.R, F: o.F, pts: o.pts, S: o.size || 4096, maxAtlas: o.atlases || 12, dens: o.dens || [16, 12, 8, 4, 2.5], patchStats: {}, tag, kitGlass: o.kitGlass || 0 };
  await page.evaluate(bxwinLib, cfg);
  await page.evaluate((c) => { window.__BXWIN.cfg = c; }, cfg);
  const pl = await page.evaluate(() => window.__BXWIN.plan());
  let compileMs = 0;
  if (pl.atlases) { compileMs = await page.evaluate(() => window.__BXWIN.compile()); await sleep(800); }
  for (let k = 0; k < pl.atlases; k++) { await page.evaluate((kk) => window.__BXWIN.bakeOne(kk), k); await sleep(400); }
  const res = await page.evaluate(() => window.__BXWIN.finish());
  res.secs = +((Date.now() - t0) / 1000).toFixed(1); res.compileMs = compileMs; res.shot = o.shot || null;
  const file = o.shot ? `bxwin_${String(o.shot).replace(/[^A-Za-z0-9_.-]/g, '_')}.json` : 'bxwin.json';
  await o.fs.writeFile(o.path.join(o.outDir, file), JSON.stringify(res, null, 1));
  if (o.shot) {   // the index of the shots' bakes (usd_windows.py reads it)
    const ip = o.path.join(o.outDir, 'bxwin.json');
    let idx = { version: 2, shots: {} };
    try { const j = JSON.parse(await o.fs.readFile(ip, 'utf8')); if (j && j.version === 2) idx = j; } catch {}
    idx.shots[o.shot] = file;
    await o.fs.writeFile(ip, JSON.stringify(idx, null, 1));
  }
  const tm = res.timing || {};
  console.log(`     BX-WIN facades (${o.shot || 'all'}, ${res.mode}, ${res.pathPts} path points): ${res.meshes.length} facade meshes, ${res.charts} charts (by ring ${JSON.stringify(res.chartsByRing)}), ${res.tris} triangles in ${res.atlases.length} atlases of ${res.size} (density x${res.densityScale}, far x${res.farScale}), ${res.secs}s (plan ${((tm.planMs || 0) / 1000).toFixed(1)}, compile ${(compileMs / 1000).toFixed(1)}, gpu ${((tm.gpuMs || 0) / 1000).toFixed(1)}, readback ${((tm.readMs || 0) / 1000).toFixed(1)}, png ${((tm.encMs || 0) / 1000).toFixed(1)}, post ${((tm.postMs || 0) / 1000).toFixed(1)}, ${((tm.bytes || 0) / 1e6).toFixed(0)} MB); patch ${JSON.stringify(res.patch)}; skipped ${JSON.stringify(res.skipped)}`);
  return res;
}

// BX-SEQ's hook form (docs/notes/ar34-bx-seq.md: HOOKS = ['harvest_facades', ...]): the kit glass tagged when the first shot
// is ready (before any static capture); the bake when a shot is done (its static world captured, the dresser still frozen):
// along the lens path one bake per shot over that shot's region, in the legacy square mode one bake at the first shot
export default {
  async shotReady(ctx, shot) {
    if (shot !== ctx.names[0] || ctx.has('nobxwin')) return;
    await ctx.page.evaluate(bxwinLib, { sink: null, patchStats: {} });
    this._kitGlass = await ctx.page.evaluate(() => window.__BXWIN.tagKitGlass());
  },
  async shotDone(ctx, shot) {
    if (ctx.has('nobxwin')) return;
    const pathMode = await ctx.page.evaluate(() => !!(window.__EXP && window.__EXP.lib && window.__EXP.lib.RG && window.__EXP.lib.RG.on));
    if (!pathMode && shot !== ctx.names[0]) return;
    const fs = (await import('node:fs')).promises, path = (await import('node:path')).default;
    const pts = ctx.names.flatMap((n) => ctx.POOL[n].keys.map((k) => ctx.project(k.p[0], k.p[1])));
    const num = (k, d) => Number(ctx.opt(k, String(d)));
    try {
      return await bxwinHarvest(ctx.page, { outDir: ctx.outDir, fs, path, sink: null, shot: pathMode ? shot : null, cx: ctx.region.cx, cz: ctx.region.cz, R: ctx.region.R, F: ctx.region.F, pts,
        size: num('bxsize', 4096), atlases: num('bxatlases', 12), dens: String(ctx.opt('bxdens', '16,12,8,4,2.5')).split(',').map(Number), kitGlass: this._kitGlass || 0 });
    } catch (e) { console.log(`     [bx-win] facade bake failed (${shot}): ${e?.stack || e}`); return null; }
  },
};
