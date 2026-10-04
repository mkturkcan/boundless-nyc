// BX-LIGHT (AR34 BX, 2026-10-02): the light data of a harvest, for blender_light.py. Called from harvest.mjs (lines
// marked BX-LIGHT) with the booted page; nothing here changes the page's state except a sky capture drawn into its own
// render targets between two frames.
//
//   light_static.json  the time of day (preset, night level), the street lamps in the region (lampSpots with fixture,
//                      mount height and arm yaw; the fixture table; CityLamps' gain and throw shape), the HL24 headlamp
//                      constants, the sun, the sky uniforms, the haze, the bloom, the grade and the exposure
//   sky_vis.f16        the visible dome as the page draws it (Preetham x skyGain + TW36 twilight + N11 glow + CS25
//                      clouds), an equirect in three's own convention (u = atan(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5,
//                      rows bottom-up), RGB half floats, linear radiance before exposure
//   sky_env.f16        the sun-free dome the page bakes its IBL from (the same patches), same layout, smaller
//   light_<shot>.json  per frame of the take: the exposure, the bloom and the twelve HL24 headlamp spots as drawn
//
// The equirects are captured with a CubeCamera at the lens of the first key frame (the dome is the same from anywhere
// in a region; the clouds drift with ENV.time, a take's 3.6 s moves them by a few pixels).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const perShot = new Map();

// ---- in the page -------------------------------------------------------------------------------------------------------
async function pageStatic(cfg) {
  const T = await window.__EXP.getThree();
  const E = window.__ENGINE, S = E.sky;
  const imp = async (p) => { try { return await import(p); } catch (e) { return null; } };
  const MAT = await imp('/src/world/materials.js'), N11 = await imp('/src/world/night11.js');
  const CLM = await imp('/src/world/cityLamps.js'), HL = await imp('/src/sim/headlamps.js');
  const val = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    if (v.isColor) return [v.r, v.g, v.b];
    if (v.isVector2 || v.isVector3 || v.isVector4) return v.toArray();
    if (v.isMatrix3 || v.isMatrix4) return null;
    if (ArrayBuffer.isView(v)) return v.length <= 64 ? Array.from(v) : null;
    if (Array.isArray(v)) return v.length <= 64 ? v.map(val) : null;
    if (typeof v === 'object' && 'value' in v) return val(v.value);
    return null;
  };
  const unis = (u) => { const o = {}; for (const [k, x] of Object.entries(u || {})) { const y = val(x); if (y !== null) o[k] = y; } return o; };
  const out = { when: new Date().toString(), mode: S?.mode ?? null, night: MAT?.ENV?.night?.value ?? null };
  try { out.preset = JSON.parse(JSON.stringify(S.presets[S.mode] || {})); } catch {}
  // ---- street lamps: every pole in the far region (deduplicated as CityLamps does: a 0.5 m key)
  const seen = new Map();
  for (const s of window.__LIFE?.lampSpots || []) {
    const k = Math.round(s[0] * 2) + ',' + Math.round(s[2] * 2);
    if (seen.has(k)) continue;
    const lib = window.__EXP && window.__EXP.lib;
    if (lib && lib.inPath && cfg.path) { if (!lib.inPath(s[0], s[2], 'F') && !lib.inRegion?.(s[0], s[2], 60)) continue; }
    else if (Math.abs(s[0] - cfg.cx) > cfg.F + 60 || Math.abs(s[2] - cfg.cz) > cfg.F + 60) continue;
    seen.set(k, [s[0], s[1], s[2], s[3] ?? -1, s[4] ?? 8.2, s[5] === undefined ? null : s[5]]);
  }
  out.lamps = [...seen.values()];
  const CL = window.__LAMPS;
  out.lampRig = {
    cl24: CLM ? !!CLM.CL24 : null, on: CLM ? CLM.LAMPS_ON : 0.06, n: CLM ? CLM.CL_N : 64,
    gain: CL?.gain ?? 3.0, shape: CL?.shape ? Array.from(CL.shape) : [0.2, 0.17, 0.33], stats: CL?.stats?.() ?? null,
    fixtures: N11 ? N11.FIXTURES.map((f, i) => ({ ...f, lin: [N11.FIX_COLOR[i].r, N11.FIX_COLOR[i].g, N11.FIX_COLOR[i].b] })) : null,
    legacy: N11 ? { ...N11.LEGACY_FIXTURE, lin: [N11.LEGACY_COLOR.r, N11.LEGACY_COLOR.g, N11.LEGACY_COLOR.b] } : null,
  };
  out.headlamps = { hl24: HL ? !!HL.HL24 : null, aim: HL ? HL.AIM_RAD : 0.021, cd: 3600, angle: 0.72, penumbra: 0.35, distance: 75, decay: 2,
    led: [0xe9 / 255, 0xef / 255, 1], halogen: [1, 0xf0 / 255, 0xd6 / 255], halogenShare: 0.34, on: 0.06 };
  try { const c = new T.Color(0xe9efff), h = new T.Color(0xfff0d6); out.headlamps.led = [c.r, c.g, c.b]; out.headlamps.halogen = [h.r, h.g, h.b]; } catch {}
  // ---- sun, exposure, post
  const R = E.renderer;
  out.toneMapping = R.toneMapping; out.exposure = R.toneMappingExposure;
  const sun = E.sun;
  if (sun) { sun.updateMatrixWorld(); sun.target?.updateMatrixWorld(); out.sun = { pos: sun.position.toArray(), target: sun.target ? sun.target.getWorldPosition(new T.Vector3()).toArray() : null, color: [sun.color.r, sun.color.g, sun.color.b], intensity: sun.intensity, visible: sun.visible }; }
  if (E.bloom) out.bloom = { strength: E.bloom.strength, radius: E.bloom.radius, threshold: E.bloom.threshold, smoothWidth: E.bloom.highPassUniforms?.smoothWidth?.value, max: E.bloom.highPassUniforms?.uBloomMax?.value ?? null, enabled: E.bloom.enabled };
  if (E.grade) out.grade = unis(E.grade.uniforms);
  if (E.haze) out.haze = { enabled: E.haze.enabled, ...unis(E.haze.uniforms) };
  out.fog = E.scene.fog ? { color: E.scene.fog.color.toArray(), density: E.scene.fog.density } : null;
  out.envIntensity = E.scene.environmentIntensity;
  out.hdri = S?.hdri || false;
  if (S?.sky) out.skyUniforms = unis(S.sky.material.uniforms);
  if (S?.envSky) out.envSkyUniforms = unis(S.envSky.material.uniforms);
  // ---- the domes, captured as the page draws them (float cube -> equirect, three's convention)
  const cap = async (mesh, size, W, name) => {
    if (!mesh) return null;
    const rt = new T.WebGLCubeRenderTarget(size, { type: T.FloatType, format: T.RGBAFormat, generateMipmaps: false, depthBuffer: true });
    const cc = new T.CubeCamera(0.5, 1e6, rt);
    const scn = new T.Scene();
    const parent = mesh.parent, vis = mesh.visible, fc = mesh.frustumCulled;
    scn.add(mesh); mesh.visible = true; mesh.frustumCulled = false;
    cc.position.copy(E.camera.position);
    for (const c of cc.children) c.layers.mask = 0xffffffff;   // every layer (the scene holds the dome alone)
    cc.updateMatrixWorld(true);
    const prevRT = R.getRenderTarget(), prevAuto = R.autoClear;
    try { cc.update(R, scn); } finally { if (parent) parent.add(mesh); mesh.visible = vis; mesh.frustumCulled = fc; }
    const H = W / 2;
    const ert = new T.WebGLRenderTarget(W, H, { type: T.FloatType, format: T.RGBAFormat, depthBuffer: false });
    const mat = new T.ShaderMaterial({
      uniforms: { tCube: { value: rt.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform samplerCube tCube; varying vec2 vUv;
        void main(){
          float ph = (vUv.x - 0.5) * 6.283185307, th = (vUv.y - 0.5) * 3.141592654;
          vec3 d = vec3(cos(th) * cos(ph), sin(th), cos(th) * sin(ph));
          gl_FragColor = vec4(textureCube(tCube, d).rgb, 1.0);
        }`,
    });
    mat.toneMapped = false;
    const q = new T.Mesh(new T.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
    const qs = new T.Scene(); qs.add(q);
    const oc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    R.setRenderTarget(ert); R.autoClear = true; R.render(qs, oc);
    const px = new Float32Array(W * H * 4);
    // the exposure meter's readRenderTargetPixelsAsync leaves a PIXEL_PACK_BUFFER bound (core/engine.js), and with one bound
    // readPixels writes into that buffer, not into px (the first night harvest's domes came back all zero)
    const gl = R.getContext();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    R.readRenderTargetPixels(ert, 0, 0, W, H, px);
    R.setRenderTarget(prevRT); R.autoClear = prevAuto;
    rt.dispose(); ert.dispose(); mat.dispose(); q.geometry.dispose();
    // RGB half floats (rows bottom-up as read)
    const h16 = new Uint16Array(W * H * 3);
    const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
    const toHalf = (v) => {
      f32[0] = v; const x = u32[0];
      const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 112; let m = x & 0x7fffff;
      if (e <= 0) return s;                       // tiny -> 0
      if (e >= 31) return s | 0x7bff;             // clamp to the largest half
      return s | (e << 10) | (m >>> 13);
    };
    let mx = 0, sum = [0, 0, 0], bad = 0;
    for (let i = 0, j = 0; i < W * H; i++) {
      for (let c = 0; c < 3; c++) { let v = px[i * 4 + c]; if (!(v >= 0) || !isFinite(v)) { v = 0; bad++; } h16[j++] = toHalf(v); sum[c] += v; if (v > mx) mx = v; }
    }
    let ok = false;
    const lib = window.__EXP && window.__EXP.lib;
    if (lib && lib.post) ok = await lib.post(name, h16);
    else ok = (await fetch(cfg.sink + '/put/' + name, { method: 'POST', body: h16, headers: { 'Content-Type': 'application/octet-stream' } })).ok;
    return { file: name, w: W, h: H, layout: 'three-equirect, rows bottom-up, RGB float16', max: mx, mean: sum.map((v) => v / (W * H)), nonfinite: bad, ok: !!ok, at: E.camera.position.toArray() };
  };
  try { out.skyVis = await cap(S?.sky, cfg.cube || 1536, cfg.eqW || 4096, 'sky_vis.f16'); } catch (e) { out.skyVisErr = String(e).slice(0, 200); }
  try { out.skyEnv = await cap(S?.envSky, 256, 1024, 'sky_env.f16'); } catch (e) { out.skyEnvErr = String(e).slice(0, 200); }
  return out;
}

function pageFrame() {
  const E = window.__ENGINE;
  const o = { exposure: E.renderer.toneMappingExposure };
  if (E.bloom) o.bloom = [E.bloom.strength, E.bloom.radius, E.bloom.threshold, E.bloom.highPassUniforms?.smoothWidth?.value ?? null];
  // the HL24 headlamp spots as drawn this frame (sim/carlights.js: the nearest twelve moving cars)
  const sp = [];
  E.scene.traverse((L) => {
    if (!L.isSpotLight || L.name === 'cl26Sentinel' || !L.visible || !(L.intensity > 0)) return;
    L.updateMatrixWorld(); L.target.updateMatrixWorld();
    const p = L.getWorldPosition(L.position.clone()), t = L.target.getWorldPosition(L.position.clone());
    sp.push({ p: p.toArray(), t: t.toArray(), i: L.intensity, c: [L.color.r, L.color.g, L.color.b], a: L.angle, pe: L.penumbra, d: L.distance });
  });
  o.spots = sp;
  return o;
}

// ---- harness side ------------------------------------------------------------------------------------------------------
// once, at the first key frame (after harvest.mjs has written lights.json)
export async function lightsStatic(page, outDir, cfg) {
  const t0 = Date.now();
  const S = await page.evaluate(pageStatic, cfg);
  await fs.writeFile(path.join(outDir, 'light_static.json'), JSON.stringify(S, null, 1));
  console.log(`     [bx-light] ${S.mode} night ${S.night}: ${S.lamps?.length ?? 0} lamps, sky ${S.skyVis ? S.skyVis.w + 'x' + S.skyVis.h + ' max ' + (+S.skyVis.max).toFixed(2) : 'FAILED ' + S.skyVisErr} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return S;
}
// every frame of a take (cheap: the exposure, the bloom, the headlamp spots)
export async function lightsFrame(page, shot, frame) {
  let a = perShot.get(shot);
  if (!a) { a = []; perShot.set(shot, a); }
  try { a[frame] = await page.evaluate(pageFrame); } catch (e) { a[frame] = { err: String(e).slice(0, 120) }; }
}
export async function lightsShot(outDir, shot) {
  const a = perShot.get(shot) || [];
  await fs.writeFile(path.join(outDir, `light_${shot}.json`), JSON.stringify(a));
  perShot.delete(shot);
}

// BX-DUSK (2026-10-03): the street lamps again after the take, along the lens path. The static pass runs at the first
// frame, before harvest.mjs sets the path region (setPath runs after the take), so lib.inPath still tested the legacy
// square round the default centre (893.5, -3856.3): every path harvest kept the poles round the arch, and a shot elsewhere
// had none of its own (t7StreetGlide, 125th St east: the nearest of its 421 lamps 203 m from the lens, the street lit by
// the sky alone). At shotDone the path masks are set: the list is taken again with them (within F of the path, or within
// BXLAMPR m of the lens path when that is set) and replaces the first frame's. Dusk harvests only (golden and night as they
// were) unless BXLAMPPATH=1.
function pageLamps(cfg) {
  const lib = window.__EXP && window.__EXP.lib, RG = lib && lib.RG;
  if (!lib || !RG || !RG.on) return { on: false, lamps: [] };
  const pts = RG.pts || [], R = +cfg.R || 0;
  const near = (x, z) => { let b = Infinity; for (const p of pts) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
  const seen = new Map();
  for (const s of window.__LIFE?.lampSpots || []) {
    const k = Math.round(s[0] * 2) + ',' + Math.round(s[2] * 2);
    if (seen.has(k)) continue;
    if (R > 0 && pts.length) { if (near(s[0], s[2]) > R) continue; }
    else if (!lib.inPath(s[0], s[2], 'F') && !lib.inRegion?.(s[0], s[2], 60)) continue;
    seen.set(k, [s[0], s[1], s[2], s[3] ?? -1, s[4] ?? 8.2, s[5] === undefined ? null : s[5]]);
  }
  return { on: true, pts: pts.length, lamps: [...seen.values()] };
}
async function lampsAlongPath(ctx) {
  const p = path.join(ctx.outDir, 'light_static.json');
  let S;
  try { S = JSON.parse(await fs.readFile(p, 'utf8')); } catch { return; }
  if (process.env.BXLAMPPATH !== '1' && S.mode !== 'dusk' && S.mode !== 'night') return;   // the lamps along the path at dusk and night (the night shots away from the arch had none)
  const r = await ctx.page.evaluate(pageLamps, { R: +(process.env.BXLAMPR || 0) });
  if (!r || !r.on) return;
  S.lampsFirstFrame = S.lamps?.length ?? 0;
  S.lamps = r.lamps;
  S.lampsAt = 'shotDone, along the lens path (BX-DUSK)';
  await fs.writeFile(p, JSON.stringify(S, null, 1));
  console.log(`     [bx-light] lamps along the lens path: ${r.lamps.length} (the first frame's list: ${S.lampsFirstFrame})`);
}

// ---- BX-SEQ hook interface (docs/notes/ar34-bx-seq.md): HOOKS = ['harvest_lights'] in harvest.mjs ----------------------
let staticDone = false;
export default {
  async frame(ctx, shot, i) {
    if (ctx.has('nolights')) return;
    if (!staticDone) {
      staticDone = true;
      const r = ctx.region || {};
      try { await lightsStatic(ctx.page, ctx.outDir, { cx: r.cx, cz: r.cz, F: r.F, path: true }); } catch (e) { ctx.log?.('[bx-light] static failed: ' + (e?.message || e)); }
    }
    await lightsFrame(ctx.page, shot, i);
  },
  async shotDone(ctx, shot) {
    if (ctx.has('nolights')) return;
    try { await lampsAlongPath(ctx); } catch (e) { ctx.log?.('[bx-light] lamps along the path failed: ' + (e?.message || e)); }   // BX-DUSK
    await lightsShot(ctx.outDir, shot);
  },
};
