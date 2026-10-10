// Ambient life: the motion layer that separates "rendered" from "inhabited".
// - Steam columns at curbside grates (NYC signature) — camera-facing soft
//   billboards rising/swirling from a rotating set of the nearest spots.
// - Bird flocks orbiting above the blocks near the player, shader-flapped.
// All GPU-side animation off shared clocks; two draw calls total.
import * as THREE from 'three';
import { ENV } from './materials.js';

export const steamSpots = []; // [x, y, z] registered by props.js companions
export const plumeSpots = []; // [x, y, z, strength] roof vents/chimneys (props.js)
export const lampSpots = [];  // [x, y, z] streetlight heads (props.js) for night pools
if (typeof window !== 'undefined') window.__LIFE = { steamSpots, plumeSpots, lampSpots };

const SPOTS = 12, PER = 14;
const PLUMES = 10, PPER = 16;

// procedural smoke sprite: layered soft blobs read as photographic smoke once
// they overlap, rotate and scale; a radial-gradient disc reads as a video game
function makeSmokeTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const r = 8 + rnd() * 22;
    const x = 64 + (rnd() - 0.5) * (86 - r), y = 64 + (rnd() - 0.5) * (86 - r);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.1;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function initLife(scene, camera) {
  // ---------------------------------------------------------------- steam
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  sg.setIndex([0, 1, 2, 0, 2, 3]);
  const N = SPOTS * PER;
  const aSeed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { aSeed[i * 2] = i % PER; aSeed[i * 2 + 1] = Math.random(); }
  sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 2));
  sg.instanceCount = N;
  const spotU = { value: Array.from({ length: SPOTS }, () => new THREE.Vector3(0, -999, 0)) };
  const steamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: ENV.windT, uSpots: spotU, uFog: ENV.fogColor, uNight: ENV.night,
    },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime; uniform vec3 uSpots[${SPOTS}];
      varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv;
        int spot = int(gl_InstanceID) / ${PER};
        vec3 base = uSpots[spot];
        float ph = fract(aSeed.y + uTime * (0.06 + aSeed.y * 0.025)); // life cycle
        float h = ph * (5.5 + aSeed.y * 3.0);
        float sway = sin(uTime * 0.7 + aSeed.y * 17.0 + h * 0.5);
        vec3 wp = base + vec3(sway * (0.25 + h * 0.16), h, cos(uTime * 0.53 + aSeed.y * 9.0) * (0.2 + h * 0.14));
        float size = (0.7 + ph * 2.6) * (0.75 + aSeed.y * 0.5);
        vA = sin(ph * 3.14159) * 0.5 * step(-500.0, base.y);
        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        mv.xy += (uv - 0.5) * size; // billboard
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uNight;
      varying vec2 vUv; varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = vA * smoothstep(1.0, 0.35, d);
        vec3 col = mix(uFog * 1.06, vec3(0.85), 0.35) * (1.0 - uNight * 0.72);
        gl_FragColor = vec4(col, a * 0.34);
      }`,
  });
  const steam = new THREE.Mesh(sg, steamMat);
  steam.frustumCulled = false;
  scene.add(steam);

  // ---------------------------------------------------------------- roof smoke plumes
  const pg = new THREE.InstancedBufferGeometry();
  pg.setAttribute('position', sg.getAttribute('position'));
  pg.setAttribute('uv', sg.getAttribute('uv'));
  pg.setIndex([0, 1, 2, 0, 2, 3]);
  const PN = PLUMES * PPER;
  const pSeed = new Float32Array(PN * 2);
  for (let i = 0; i < PN; i++) { pSeed[i * 2] = i % PPER; pSeed[i * 2 + 1] = Math.random(); }
  pg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(pSeed, 2));
  pg.instanceCount = PN;
  const plumeU = { value: Array.from({ length: PLUMES }, () => new THREE.Vector4(0, -9999, 0, 0)) };
  const plumeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: ENV.windT, uPl: plumeU, uFog: ENV.fogColor, uNight: ENV.night, tSmoke: { value: makeSmokeTexture() }, uWindA: ENV.windAmp },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime; uniform float uWindA; uniform vec4 uPl[${PLUMES}];
      varying vec2 vUv; varying float vA; varying float vRot;
      void main() {
        vUv = uv;
        int spot = int(gl_InstanceID) / ${PPER};
        vec4 base = uPl[spot];
        float ph = fract(aSeed.y + uTime * (0.028 + aSeed.y * 0.012)); // slow life cycle
        float h = ph * (9.0 + aSeed.y * 6.0) * (0.6 + base.w * 0.5);
        // wind shear: drift grows with height; direction slowly wanders
        vec2 wd = normalize(vec2(0.8, 0.35 + sin(uTime * 0.05) * 0.3)) * (0.35 + uWindA * 0.5);
        vec3 wp = base.xyz + vec3(wd.x * h * 0.8 + sin(uTime * 0.5 + aSeed.y * 21.0) * 0.3, h,
                                  wd.y * h * 0.8 + cos(uTime * 0.43 + aSeed.y * 13.0) * 0.3);
        float size = (1.1 + ph * 6.5) * (0.7 + aSeed.y * 0.6) * (0.7 + base.w * 0.5);
        vA = sin(ph * 3.14159) * (1.0 - ph * 0.35) * step(-500.0, base.y);
        vRot = aSeed.y * 6.28 + uTime * (0.12 + aSeed.y * 0.1) * (aSeed.y > 0.5 ? 1.0 : -1.0);
        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        vec2 o = uv - 0.5;
        float cr = cos(vRot), sr = sin(vRot);
        mv.xy += vec2(o.x * cr - o.y * sr, o.x * sr + o.y * cr) * size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uNight; uniform sampler2D tSmoke;
      varying vec2 vUv; varying float vA;
      void main() {
        float t = texture2D(tSmoke, vUv).a;
        vec3 col = mix(uFog, vec3(0.62, 0.6, 0.58), 0.4) * (1.0 - uNight * 0.6);
        gl_FragColor = vec4(col, t * vA * 0.5);
      }`,
  });
  const plumes = new THREE.Mesh(pg, plumeMat);
  plumes.frustumCulled = false;
  scene.add(plumes);

  // ---------------------------------------------------------------- dust motes
  // near-camera particulate: tiny drifting quads that catch the light, the
  // subtle "air is a medium" cue photoreal engines rely on
  const MOTES = 600;
  const mg = new THREE.InstancedBufferGeometry();
  mg.setAttribute('position', sg.getAttribute('position'));
  mg.setAttribute('uv', sg.getAttribute('uv'));
  mg.setIndex([0, 1, 2, 0, 2, 3]);
  const mSeed = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES * 3; i++) mSeed[i] = Math.random();
  mg.setAttribute('aM', new THREE.InstancedBufferAttribute(mSeed, 3));
  mg.instanceCount = MOTES;
  const camU = { value: new THREE.Vector3() };
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: ENV.windT, uCam: camU, uNight: ENV.night, uSunC: ENV.sunColor },
    vertexShader: /* glsl */ `
      attribute vec3 aM;
      uniform float uTime; uniform vec3 uCam;
      varying float vA; varying vec2 vUv;
      void main() {
        vUv = uv;
        const float R = 34.0;
        vec3 drift = vec3(uTime * (0.12 + aM.x * 0.2), -uTime * (0.05 + aM.y * 0.06), uTime * 0.09);
        // camera-wrapped volume: motes tile an R-cube that follows the camera
        vec3 wp = uCam - R * 0.5 + mod(aM * R + drift - uCam, vec3(R));
        float dc = length(wp - uCam);
        vA = smoothstep(1.2, 5.0, dc) * smoothstep(R * 0.5, R * 0.32, dc);
        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        mv.xy += (uv - 0.5) * (0.022 + aM.z * 0.05);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; uniform vec3 uSunC;
      varying float vA; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = vA * smoothstep(1.0, 0.2, d) * 0.055;
        vec3 col = normalize(uSunC + vec3(0.4)) * (1.1 - uNight * 0.55);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const motes = new THREE.Mesh(mg, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // ---------------------------------------------------------------- birds
  const BIRDS = 42;
  const bg = new THREE.InstancedBufferGeometry();
  // 4 verts: body line + two wing tips (x = wing axis)
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.9, 0, 0, 0, 0, 0.35, 0.9, 0, 0, 0, 0, -0.5]), 3));
  bg.setIndex([0, 1, 3, 1, 2, 3]);
  const bSeed = new Float32Array(BIRDS * 3);
  for (let i = 0; i < BIRDS; i++) {
    bSeed[i * 3] = Math.random() * 6.28;       // orbit phase
    bSeed[i * 3 + 1] = 18 + Math.random() * 55; // orbit radius
    bSeed[i * 3 + 2] = Math.random();           // jitter
  }
  bg.setAttribute('aBird', new THREE.InstancedBufferAttribute(bSeed, 3));
  bg.instanceCount = BIRDS;
  const flockU = { value: new THREE.Vector3(0, -999, 0) };
  const birdMat = new THREE.ShaderMaterial({
    uniforms: { uTime: ENV.windT, uFlock: flockU, uFog: ENV.fogColor, uFogD: ENV.fogDensity },
    vertexShader: /* glsl */ `
      attribute vec3 aBird;
      uniform float uTime; uniform vec3 uFlock;
      varying float vDist;
      void main() {
        float sp = 0.14 + aBird.z * 0.08;
        float ang = aBird.x + uTime * sp;
        vec3 c = uFlock + vec3(cos(ang) * aBird.y, sin(uTime * 0.4 + aBird.x * 3.0) * 4.0 + aBird.z * 14.0, sin(ang) * aBird.y);
        // face travel direction (tangent), flap wings (position.x = wing axis)
        vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)));
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        float flap = sin(uTime * (7.0 + aBird.z * 3.0) + aBird.x * 5.0) * 0.7;
        vec3 p = position * (0.9 + aBird.z * 0.5);
        vec3 wp = c + side * p.x + fwd * p.z + vec3(0.0, abs(p.x) * flap, 0.0);
        vec4 mv = modelViewMatrix * vec4(wp, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uFogD;
      varying float vDist;
      void main() {
        float f = 1.0 - exp(-uFogD * uFogD * vDist * vDist * 40.0);
        gl_FragColor = vec4(mix(vec3(0.09, 0.09, 0.1), uFog, clamp(f, 0.0, 0.9)), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const birds = new THREE.Mesh(bg, birdMat);
  birds.frustumCulled = false;
  scene.add(birds);

  let acc = 9;
  return {
    update(dt) {
      camU.value.copy(camera.position);
      acc += dt;
      if (acc > 2) { // re-pick nearest steam/plume spots + keep the flock nearby
        acc = 0;
        const p = camera.position;
        const sorted = steamSpots
          .map((s) => ({ s, d: (s[0] - p.x) ** 2 + (s[2] - p.z) ** 2 }))
          .sort((a, b) => a.d - b.d)
          .slice(0, SPOTS);
        for (let i = 0; i < SPOTS; i++) {
          const v = spotU.value[i];
          if (sorted[i] && sorted[i].d < 360 * 360) v.set(sorted[i].s[0], sorted[i].s[1], sorted[i].s[2]);
          else v.set(0, -9999, 0);
        }
        const psorted = plumeSpots
          .map((s) => ({ s, d: (s[0] - p.x) ** 2 + (s[2] - p.z) ** 2 }))
          .sort((a, b) => a.d - b.d)
          .slice(0, PLUMES);
        for (let i = 0; i < PLUMES; i++) {
          const v = plumeU.value[i];
          if (psorted[i] && psorted[i].d < 550 * 550) v.set(psorted[i].s[0], psorted[i].s[1], psorted[i].s[2], psorted[i].s[3] ?? 0.7);
          else v.set(0, -9999, 0, 0);
        }
        const f = flockU.value;
        if (f.y < -900 || f.distanceTo(p) > 420) {
          const a = Math.random() * 6.28;
          f.set(p.x + Math.cos(a) * 190, p.y + 55 + Math.random() * 45, p.z + Math.sin(a) * 190);
        }
      }
    },
  };
}
