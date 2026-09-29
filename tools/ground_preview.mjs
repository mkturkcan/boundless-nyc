// The ground material without a GPU (GP31, docs/notes/ground-pbr.md): SwiftShader renders the real makeGroundMaterial
// (world/materials.js), its texture bank and the kerb worker on a synthetic cross-section of W 125th St (roadway, bus lane,
// gutters, kerbs, walks, a crosswalk, lane and centre lines, a Times Square paver patch and a Bryant Park gravel patch),
// under a simple sun, hemisphere and sky environment. No city, no streaming, no GPU lock: a shader change can be seen
// while the GPU queue is busy. Any GLSL error is printed. Lighting is approximate; tones are for comparing variants.
//   node tools/ground_preview.mjs <outPrefix> [flags] [views] [W=1280] [H=720]
//   flags: the page's URL flags, plus time=golden|night and rain (e.g. "time=golden&gpdefect=12", "gp31=0")
//   views: comma list of markings walk walkc gutter valve gravel gravelE macro close low pot bars allig street oblique far plaza
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'package.json'))('playwright');
const bdir = path.join(root, 'boundlessjs');
const [,, outPrefix, flags = '', viewsArg = 'markings,walk,oblique,plaza', Ws = '1280', Hs = '720'] = process.argv;
if (!outPrefix) { console.error('usage: node tools/ground_preview.mjs <outPrefix> [flags] [views] [W] [H]'); process.exit(2); }
const port = String(7100 + Math.floor(Math.random() * 800));
const vite = spawn(process.execPath, [path.join(bdir, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: bdir, stdio: 'ignore', env: { ...process.env, NYC_NOHMR: '1' } });
await new Promise((r) => setTimeout(r, 3000));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle'] });
try {
  const page = await browser.newPage({ viewport: { width: +Ws, height: +Hs } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 1500)}`));
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 1500)));
  await page.goto(`http://127.0.0.1:${port}/src/shared/geo.js`, { timeout: 120000 });
  const shots = await page.evaluate(async ({ flags, views, W, H }) => {
    history.replaceState(null, '', '/?' + flags);
    const msrc = await (await fetch('/src/world/materials.js')).text();
    const i0 = msrc.indexOf('/node_modules/.vite/deps/three.js');
    const tUrl = i0 >= 0 ? msrc.slice(i0, msrc.indexOf(msrc[i0 - 1], i0)) : '/node_modules/.vite/deps/three.js';
    const THREE = await import(tUrl);
    const M = await import('/src/world/materials.js');
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const errs = [];
    renderer.debug.onShaderError = (gl, prog, vs, fs) => { errs.push((gl.getShaderInfoLog(fs) || '').slice(0, 3000)); };
    M.applyLB14Ground(!/time=night/.test(flags));
    const night = /time=night/.test(flags);
    M.ENV.night.value = night ? 1 : 0;
    if (/rain/.test(flags)) M.ENV.wet.value = 0.55;
    M.initGTEX(renderer);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(night ? 0x0a0d14 : 0x9fc3e8);
    // day: elev 42 azim 128 (sky.js PRESETS.day); sun 2.5 and hemi 0.8 in the app's units, x pi for three's physical lights
    const golden = /time=golden/.test(flags); const el = (golden ? 15 : 42) * Math.PI / 180, az = (golden ? 205 : 128) * Math.PI / 180;
    const sun = new THREE.DirectionalLight(golden ? 0xffc890 : 0xfffcf2, night ? 0 : (golden ? 4.0 : 2.5) * Math.PI * 0.62);
    sun.position.set(Math.sin(az) * Math.cos(el) * 100, Math.sin(el) * 100, -Math.cos(az) * Math.cos(el) * 100);
    const hemi = new THREE.HemisphereLight(0xa8c8f0, 0x6d6a62, night ? 0.25 : 0.8 * Math.PI * 0.30);
    scene.add(sun, hemi); M.ENV.sunDir.value.copy(sun.position).normalize();
    {
      const skyScene = new THREE.Scene();
      const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.80, 0.84, 0.88), vec3(0.32, 0.52, 0.88), pow(clamp(h, 0.0, 1.0), 0.6)); if (h < 0.0) c = vec3(0.22, 0.20, 0.18); gl_FragColor = vec4(c * 1.1, 1.0); }' });
      skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
      const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(skyScene).texture; scene.environmentIntensity = night ? 0.05 : 0.45;
    }

    if (night) { const l = new THREE.PointLight(0xffd29a, 900, 60, 2); l.position.set(0, 0, 0); scene.add(l); scene.userData.lamp = l; }
    renderer.toneMappingExposure = night ? 1.1 : golden ? 0.76 : 0.62;
    // synthetic street at 125th: u along the cross-town street (MG_A), v across (MG_B)
    const O = [2128, -2765], A = [0.8744, 0.4853], B = [-0.4853, 0.8744];
    const X = (u, v) => [O[0] + u * A[0] + v * B[0], O[1] + u * A[1] + v * B[1]];
    const pos = [], mid = [];
    const quad = (m, u0, u1, v0, v1, y) => {
      for (let u = u0; u < u1 - 1e-6; u += 8) {
        const ua = u, ub = Math.min(u + 8, u1);
        const p = [X(ua, v0), X(ua, v1), X(ub, v1), X(ub, v0)];
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(p[k][0], y, p[k][1]); mid.push(m); }
      }
    };
    const wall = (m, u0, u1, v, y0, y1) => {
      for (let u = u0; u < u1 - 1e-6; u += 8) {
        const ua = u, ub = Math.min(u + 8, u1), a = X(ua, v), b = X(ub, v);
        const p = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); mid.push(m); }
      }
    };
    const R = 3.385, S = 3.52;
    const U0 = -20, U1 = 120;
    quad(11, U0, U1, -7, -6.55, R); quad(11, U0, U1, 6.55, 7, R);
    quad(0, U0, U1, -6.55, 3.2, R); quad(12, U0, U1, 3.2, 6.55, R);
    wall(2, U0, U1, -7, R, S); wall(2, U0, U1, 7, R, S);
    quad(1, U0, U1, 7, 11.5, S); quad(1, U0, U1, -11.5, -7, S);
    quad(16, 0, 60, 11.5, 30, S);
    quad(17, 60, 120, 11.5, 30, S);
    // paint 1 cm proud: crosswalk bars (0.61 m at 1.3 m pitch, 3.66 m deep), stop bar, double yellow, a dashed lane line
    for (let k = 0; k < 10; k++) quad(3, 30, 33.66, -6.3 + k * 1.3, -6.3 + k * 1.3 + 0.61, R + 0.01);
    quad(3, 28.2, 28.8, -6.55, 0, R + 0.01);
    quad(4, U0, 28, -0.24, -0.12, R + 0.01); quad(4, U0, 28, 0.12, 0.24, R + 0.01);
    for (let u = U0; u < 26; u += 9) quad(3, u, u + 3, -3.36, -3.24, R + 0.01);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('matId', new THREE.BufferAttribute(new Float32Array(mid), 1));
    g.computeVertexNormals();
    const mat = M.makeGroundMaterial();
    const mesh = new THREE.Mesh(g, mat); scene.add(mesh);
    // wait for the texture arrays (GP31) / GTEX
    const t0 = performance.now();
    while (performance.now() - t0 < 90000) {
      await new Promise((r) => setTimeout(r, 500));
      if (!M.GP31 || M.GP31_TEX.ready.value > 0.5) break;
    }
    await new Promise((r) => setTimeout(r, M.GP31 ? 500 : 15000));
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 2000);
    const V = {
      markings: [[18, -3, R + 2.0], [34, 1, R + 0.3]],
      walk: [[8, 9.3, S + 1.6], [30, 8.2, S]],
      walkc: [[10, 8.6, S + 1.5], [13.5, 9.6, S]],
      gutter: [[20, -5.2, R + 1.2], [22.5, -6.8, R]],
      valve: [[-5.2, -2.6, R + 0.9], [-4.0, -3.5, R]],
      gravel: [[70, 16, S + 1.7], [76, 19, S]],
      gravelE: [[70, 14.0, S + 1.7], [75, 12.0, S]],
      macro: [[20.0, -1.0, R + 0.9], [21.0, -0.9, R]],
      close: [[20, -2, R + 1.5], [22.5, -1.2, R]],
      low: [[12, -2.6, R + 1.2], [15.5, -2.6, R]],
      pot: [[13.6, -3.7, R + 1.0], [15.3, -4.7, R]],
      bars: [[28.0, -2.2, R + 1.3], [31.8, -3.3, R]],
      allig: [[17.5, 1.5, R + 1.1], [19.5, 2.5, R]],
      street: [[-12, -4.5, R + 1.6], [30, -3, R + 0.4]],
      oblique: [[5, -22, R + 22], [34, 2, R]],
      far: [[-15, -1, R + 3], [60, 0, R]],
      plaza: [[4, 14, S + 4.0], [26, 22, S]],
    };
    const out = {};
    { const c0 = V[views[0]]; const cp = X(c0[0][0], c0[0][1]), tp = X(c0[1][0], c0[1][1]); cam.position.set(cp[0], c0[0][2], cp[1]); cam.lookAt(tp[0], c0[1][2], tp[1]); renderer.render(scene, cam); for (let k = 0; k < 100 && M.GP31 && !(M.GP31_TEX.kerb.meshes > 0 && M.GP31_TEX.kerb.pending === 0); k++) await new Promise((r) => setTimeout(r, 100)); renderer.render(scene, cam); }
    for (const v of views) {
      const [c, t] = V[v];
      const cp = X(c[0], c[1]), tp = X(t[0], t[1]);
      cam.position.set(cp[0], c[2], cp[1]); cam.lookAt(tp[0], t[2], tp[1]);
      if (scene.userData.lamp) scene.userData.lamp.position.set(cp[0], R + 8, cp[1]);
      renderer.render(scene, cam);
      out[v] = canvas.toDataURL('image/png');
    }
    return { out, errs, gp31: M.GP31, ready: M.GP31_TEX.ready.value, kerb: M.GP31_TEX.kerb, nz: (() => { const a = g.attributes.gpK && g.attributes.gpK.array; if (!a) return -1; let n = 0, mx = 0; for (const x of a) { if (x) n++; if (x > mx) mx = x; } return [n, a.length, mx]; })() };
  }, { flags, views: viewsArg.split(','), W: +Ws, H: +Hs });
  for (const [v, d] of Object.entries(shots.out)) await fs.writeFile(`${outPrefix}_${v}.png`, Buffer.from(d.slice(22), 'base64'));
  console.log(JSON.stringify({ errs: shots.errs, gp31: shots.gp31, ready: shots.ready, kerb: shots.kerb, nz: shots.nz }));
  const bad = logs.filter((l) => /error|ERROR|warn/i.test(l));
  if (bad.length) console.log(bad.slice(0, 10).join('\n'));
} finally {
  await browser.close();
  vite.kill();
}
