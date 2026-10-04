// CP33 FAR PARK: the park past the near tiles, with its canopy (teaser 4 review: "everything more than ~900 m from the lens
// renders as a flat grey plane with no trees and a straight edge across the park ... the Reservoir is a darker grey slab").
// The far LoD draws the park as the NAIP photo laid flat (world/materials.js, matId 8); this is the park again, drawn where the
// near tiles are not: one displaced mesh over the park's rectangle (4 m vertices, 8 chunks; heights = the relief + every
// crown's dome + the lakes at their levels, baked by cpFarRaster.js from the same data the near tiles plant from) and two
// 2 m textures (albedo; normal, canopy and water coverage). The material is the far LoD's own (MeshBasicMaterial, fog,
// the live sun/sky uniforms) and drops a fragment exactly where a READY near tile covers it (materials.js farHidden, the NM24
// mask), so the two never draw the same ground. The lawns get the lawn palette with the aerial's bare ground (ballfields,
// courts, paths) over it; the lakes a sky-reflecting water. `?cp33far=0` restores the flat photo.
// Called from cpFlora.js build() (the first park tile builds it once, under the streamer's macro group).
import * as THREE from 'three';
import { ENV, FAR_UNIFORMS, NEARMASK_GLSL } from '../world/materials.js';
import { farRasters, farXZ, FAR } from './cpFarRaster.js';

export const CPFAR = typeof window !== 'undefined' && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp33far') === '0');
const { NU, NV } = FAR;

function farMaterial(tCol, tNrm, tPhoto, tHgt) {
  const mat = new THREE.MeshBasicMaterial({ fog: true });
  mat.name = 'cp33:farPark';
  // (the far LoD's own ground sits at 2.74 and this stands at >= 3.6; the offset keeps the two apart at 2 km)
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
  mat.customProgramCacheKey = () => 'cp33farPark2';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.playerXZ = FAR_UNIFORMS.playerXZ; sh.uniforms.nearR = FAR_UNIFORMS.nearR;
    sh.uniforms.nearMask = FAR_UNIFORMS.nearMask; sh.uniforms.nearMaskO = FAR_UNIFORMS.nearMaskO; sh.uniforms.nearMaskOn = FAR_UNIFORMS.nearMaskOn;
    sh.uniforms.night = ENV.night; sh.uniforms.sunDirF = ENV.sunDir; sh.uniforms.sunColF = ENV.sunColor; sh.uniforms.skyAmbF = ENV.skyAmbient;
    sh.uniforms.cpfCol = { value: tCol }; sh.uniforms.cpfNrm = { value: tNrm }; sh.uniforms.cpfPhoto = { value: tPhoto }; sh.uniforms.cpfHgt = { value: tHgt };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec2 playerXZ; uniform float nearR; uniform float night;${NEARMASK_GLSL}
        uniform vec3 sunDirF; uniform vec3 sunColF; uniform vec3 skyAmbF;
        uniform sampler2D cpfCol; uniform sampler2D cpfNrm; uniform sampler2D cpfPhoto; uniform sampler2D cpfHgt;
        varying vec3 vWPos;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        if (farHidden(vWPos.xz)) discard;   // NM24: a ready near tile draws this ground
        vec2 cq = vWPos.xz - vec2(447.2, 82.2);
        vec2 cuv = vec2(dot(cq, vec2(0.4848, -0.8746)) / 4168.0 + 0.5, dot(cq, vec2(0.8746, 0.4848)) / 902.0 + 0.5);
        vec4 cT = texture2D(cpfCol, cuv);
        if (cT.a < 0.5) discard;                    // outside the park's outline: the city's far LoD
        vec4 nT = texture2D(cpfNrm, cuv);
        vec3 N = vec3(nT.r * 2.0 - 1.0, 0.0, nT.g * 2.0 - 1.0);
        N.y = sqrt(max(0.0, 1.0 - dot(N.xz, N.xz)));
        float can = nT.b, wat = nT.a;
        // open ground: the aerial's bare ground (ballfields, courts, paths: little green in it) over the lawn palette
        vec3 ph = texture2D(cpfPhoto, vec2(cuv.x, 1.0 - cuv.y)).rgb;
        float veg = ph.g - 0.5 * (ph.r + ph.b);
        vec3 alb = mix(ph * 1.7, cT.rgb, max(can, smoothstep(0.010, 0.055, veg)));
        // a steep face (the wall of crowns where a heightfield drops to a lake or a lawn) is the planar texture stretched into streaks:
        // it is leaf instead, lit by its own normal
        vec3 Ng = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
        vec3 V = normalize(cameraPosition - vWPos);
        if (dot(Ng, V) < 0.0) Ng = -Ng;
        float wall = smoothstep(0.50, 0.22, Ng.y);   // (slopes over ~60 deg: crown domes stay crown-coloured)
        float wn = 0.65 + 0.7 * fract(sin(dot(floor(vWPos.xz * 0.45), vec2(12.9898, 78.233))) * 43758.5453);
        alb = mix(alb, vec3(0.040, 0.066, 0.024) * wn, wall);
        N = normalize(mix(N, Ng, wall));
        wat *= 1.0 - wall;
        can = max(can, wall);
        vec3 L = sunDirF;
        float dl = dot(N, L);
        float lam = mix(max(dl, 0.0), clamp((dl + 0.30) / 1.30, 0.0, 1.0), can);   // a crown is leaf: light wraps round it
        // the sun's shadow across the surface (crowns on crowns and on the lawns): 10 taps of the height texture toward the sun, out to 176 m
        float shd = 1.0;
        if (sunDirF.y > 0.02 && wat < 0.5) {
          float hS = texture2D(cpfHgt, cuv).r * 80.0 - 8.0;
          vec2 Ls = normalize(sunDirF.xz + vec2(1e-5)); float tanE = sunDirF.y / max(length(sunDirF.xz), 1e-3);
          for (int i = 1; i <= 10; i++) {
            float dd = 7.0 * pow(float(i), 1.4);   // 7 .. 176 m: a low sun throws a 25 m crown 200 m
            vec2 q = vWPos.xz + Ls * dd - vec2(447.2, 82.2);
            vec2 qc = vec2(dot(q, vec2(0.4848, -0.8746)) / 4168.0 + 0.5, dot(q, vec2(0.8746, 0.4848)) / 902.0 + 0.5);
            float hq = texture2D(cpfHgt, qc).r * 80.0 - 8.0;
            shd = min(shd, clamp((hS + dd * tanE - hq) / 4.0 + 0.5, 0.0, 1.0));
          }
        }
        lam *= mix(1.0, shd, 0.9);
        vec3 lit = alb * (skyAmbF * (0.8 + 0.3 * max(N.y, 0.0)) + sunColF * lam * 1.05);
        // water: the sky in it at the view's grazing angle (the sky's own colour towards the reflected ray), a trace of the sun
        float fr = 0.03 + 0.97 * pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        vec3 Rv = reflect(-V, vec3(0.0, 1.0, 0.0));
        vec3 skyH = fogSkyColor(vec3(Rv.x, max(Rv.y, 0.02), Rv.z), fogColor);
        vec3 skyC = mix(skyAmbF * 1.3, skyH, pow(1.0 - clamp(Rv.y, 0.0, 1.0), 2.0));
        vec3 wc = mix(vec3(0.011, 0.028, 0.030), skyC * 0.82, clamp(fr * 0.62 + 0.05, 0.0, 0.7)) + sunColF * pow(max(dot(Rv, L), 0.0), 240.0) * 0.6 * (1.0 - night);
        diffuseColor.rgb = mix(lit, wc, wat);
        diffuseColor.rgb *= (1.0 - night * 0.55);
        diffuseColor.a = 1.0;
      }`);
  };
  return mat;
}

// the chunks along the park (even texel boundaries: the vertices are every other texel)
const CUTS = [0, 260, 520, 780, 1040, 1300, 1560, 1820, NU];
function chunkGeometry(R, c) {
  const i0 = CUTS[c], i1 = CUTS[c + 1];
  const is = [], js = [];
  for (let i = i0; i <= i1; i += 2) is.push(i);
  if (is[is.length - 1] !== i1) is.push(i1);
  for (let j = 0; j <= NV; j += 2) js.push(j);
  if (js[js.length - 1] !== NV) js.push(NV);
  const nx = is.length, nz = js.length;
  const pos = new Float32Array(nx * nz * 3);
  const { S } = R;
  const at = (i, j) => S[Math.max(0, Math.min(NV - 1, j)) * NU + Math.max(0, Math.min(NU - 1, i))];
  let p = 0;
  for (const j of js) for (const i of is) {
    // a vertex stands on the corner of four texels: half their mean, half their highest (crown tops keep their height)
    const a = at(i - 1, j - 1), b = at(i, j - 1), d = at(i - 1, j), e = at(i, j);
    const y = 0.5 * 0.25 * (a + b + d + e) + 0.5 * Math.max(a, b, d, e);
    const [x, z] = farXZ(i, j);
    pos[p++] = x; pos[p++] = y; pos[p++] = z;
  }
  const idx = new Uint16Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let b = 0; b + 1 < nz; b++) for (let a = 0; a + 1 < nx; a++) {
    const v00 = b * nx + a, v10 = v00 + 1, v01 = v00 + nx, v11 = v01 + 1;
    // (the frame's u runs up the park and v across it, east: u x v points DOWN in x-z, so the winding is reversed to face up)
    idx[q++] = v00; idx[q++] = v11; idx[q++] = v10; idx[q++] = v00; idx[q++] = v01; idx[q++] = v11;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

let _built = false;
export const CPFAR_STATE = { built: false, ms: 0 };
// build once, when the streamer exists (main.js sets window.__STREAMER after it makes it: a tile asking earlier asks again)
export function cpFarEnsure() {
  if (_built || !CPFAR) return;
  const st = window.__STREAMER;
  const parent = st && (st.macroGroup || st.scene);
  if (!parent) return;
  _built = true;
  const t0 = performance.now();
  try {
    const R = farRasters();
    const tCol = new THREE.DataTexture(R.col, NU, NV, THREE.RGBAFormat, THREE.UnsignedByteType);
    tCol.colorSpace = THREE.SRGBColorSpace; tCol.wrapS = tCol.wrapT = THREE.ClampToEdgeWrapping;
    tCol.magFilter = THREE.LinearFilter; tCol.minFilter = THREE.LinearMipmapLinearFilter; tCol.generateMipmaps = true; tCol.anisotropy = 8; tCol.needsUpdate = true;
    const tNrm = new THREE.DataTexture(R.nrm, NU, NV, THREE.RGBAFormat, THREE.UnsignedByteType);
    tNrm.wrapS = tNrm.wrapT = THREE.ClampToEdgeWrapping;
    tNrm.magFilter = THREE.LinearFilter; tNrm.minFilter = THREE.LinearMipmapLinearFilter; tNrm.generateMipmaps = true; tNrm.anisotropy = 8; tNrm.needsUpdate = true;
    const hb = new Uint8Array(NU * NV);
    for (let k = 0; k < hb.length; k++) hb[k] = Math.max(0, Math.min(255, Math.round((255 * (R.S[k] + 8)) / 80)));
    const tHgt = new THREE.DataTexture(hb, NU, NV, THREE.RedFormat, THREE.UnsignedByteType);
    tHgt.wrapS = tHgt.wrapT = THREE.ClampToEdgeWrapping; tHgt.magFilter = THREE.LinearFilter; tHgt.minFilter = THREE.LinearFilter; tHgt.generateMipmaps = false; tHgt.needsUpdate = true;
    const tPhoto = new THREE.TextureLoader().load('textures/cp32_park_far.jpg');
    tPhoto.colorSpace = THREE.SRGBColorSpace; tPhoto.anisotropy = 4;
    const mat = farMaterial(tCol, tNrm, tPhoto, tHgt);
    const grp = new THREE.Group();
    grp.name = 'cp33:farPark';
    for (let c = 0; c + 1 < CUTS.length; c++) {
      const m = new THREE.Mesh(chunkGeometry(R, c), mat);
      m.name = 'cp33:farPark' + c; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false;
      grp.add(m);
    }
    parent.add(grp);
    CPFAR_STATE.built = true; CPFAR_STATE.stats = R.stats;
    if (typeof window !== 'undefined') window.__CP33FAR = CPFAR_STATE;
  } catch (e) { console.warn('[cp33] far park', e); }
  CPFAR_STATE.ms = +(performance.now() - t0).toFixed(0);
}
