// Procedural articulated pedestrian mesh: one InstancedMesh, one draw call.
// The body is a merged geometry of proportioned parts; limbs carry per-vertex
// part/side tags and the walk cycle runs entirely in the vertex shader
// (hip -> knee and shoulder -> elbow chains rotated about their joint pivots),
// driven by per-instance [phaseOffset, rate, amplitude, skinTone]. Colors are
// classed per part in the shader: shirt = instanceColor, pants = darkened,
// skin/hair from the tone channel, shoes dark. The same displacement is
// injected into a custom depth material so shadows articulate too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV } from '../world/materials.js';

// part transform classes            color classes
const P_STATIC = 0, P_THIGH = 1, P_SHIN = 2, P_UARM = 3, P_FARM = 4;
const C_SHIRT = 0, C_PANTS = 1, C_SKIN = 2, C_HAIR = 3, C_SHOE = 4;

// joint pivots (must match the shader constants below)
const HIP_Y = 0.96, KNEE_Y = 0.50, SHO_Y = 1.40, ELB_Y = 1.12;
const HIP_X = 0.09, SHO_X = 0.22;

function tag(geo, part, col, side) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  geo.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(n).fill(col), 1));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(new Float32Array(n).fill(side), 1));
  return geo;
}

function buildBody() {
  const parts = [];
  // torso: capsule widened at the shoulders, shirt
  parts.push(tag(new THREE.CapsuleGeometry(0.145, 0.34, 3, 8).scale(1.5, 1, 0.82).translate(0, 1.24, 0), P_STATIC, C_SHIRT, 0));
  // pelvis: pants
  parts.push(tag(new THREE.CapsuleGeometry(0.14, 0.1, 2, 8).scale(1.3, 0.9, 0.85).translate(0, 0.97, 0), P_STATIC, C_PANTS, 0));
  // neck + head: skin, hair cap
  parts.push(tag(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 7).translate(0, 1.5, 0), P_STATIC, C_SKIN, 0));
  parts.push(tag(new THREE.SphereGeometry(0.095, 9, 7).scale(0.92, 1.08, 0.98).translate(0, 1.615, 0), P_STATIC, C_SKIN, 0));
  parts.push(tag(new THREE.SphereGeometry(0.099, 9, 6, 0, Math.PI * 2, 0, 1.9).scale(0.95, 1.1, 1).translate(0, 1.625, -0.008), P_STATIC, C_HAIR, 0));
  for (const s of [-1, 1]) {
    // thigh: hip to knee
    parts.push(tag(new THREE.CapsuleGeometry(0.062, 0.34, 2, 7).translate(s * HIP_X, (HIP_Y + KNEE_Y) / 2 - 0.02, 0), P_THIGH, C_PANTS, s));
    // shin: knee to ankle
    parts.push(tag(new THREE.CapsuleGeometry(0.05, 0.32, 2, 7).translate(s * HIP_X, (KNEE_Y + 0.07) / 2, 0), P_SHIN, C_PANTS, s));
    // shoe: swings with the shin
    parts.push(tag(new THREE.BoxGeometry(0.09, 0.07, 0.24).translate(s * HIP_X, 0.045, 0.05), P_SHIN, C_SHOE, s));
    // upper arm: shoulder to elbow
    parts.push(tag(new THREE.CapsuleGeometry(0.048, 0.24, 2, 7).translate(s * SHO_X, (SHO_Y + ELB_Y) / 2, 0), P_UARM, C_SHIRT, s));
    // forearm + hand: elbow down
    parts.push(tag(new THREE.CapsuleGeometry(0.04, 0.22, 2, 7).translate(s * SHO_X, ELB_Y - 0.13, 0), P_FARM, C_SHIRT, s));
    parts.push(tag(new THREE.SphereGeometry(0.045, 7, 6).translate(s * SHO_X, ELB_Y - 0.28, 0), P_FARM, C_SKIN, s));
  }
  // ---- accessories, one of each in the shared geometry; the shader shows
  // them per instance from the aStyle bitmask (hidden parts collapse to the
  // origin). NYC kit: coats over half the year, hoodies, backpacks, handbags,
  // phone-walkers, umbrellas that only open when ENV.wet says rain.
  parts.push(tag(new THREE.CapsuleGeometry(0.185, 0.52, 3, 8).scale(1.42, 1, 0.9).translate(0, 1.12, 0), 10, C_SHIRT, 0)); // coat body
  parts.push(tag(new THREE.CapsuleGeometry(0.2, 0.06, 2, 8).scale(1.35, 0.8, 0.9).translate(0, 0.78, 0), 10, C_SHIRT, 0));  // coat hem flare
  parts.push(tag(new THREE.SphereGeometry(0.105, 8, 6).scale(1, 0.82, 1).translate(0, 1.55, -0.1), 11, C_SHIRT, 0));        // hood
  parts.push(tag(new THREE.BoxGeometry(0.3, 0.42, 0.15).translate(0, 1.16, -0.235), 12, 5, 0));                             // backpack
  parts.push(tag(new THREE.BoxGeometry(0.05, 0.1, 0.03).translate(0, 1.4, -0.19), 12, 5, 0));                               // backpack handle
  parts.push(tag(new THREE.BoxGeometry(0.2, 0.24, 0.09).translate(SHO_X + 0.06, ELB_Y - 0.42, 0.03), 13, 5, 1));            // handbag (right forearm)
  parts.push(tag(new THREE.BoxGeometry(0.045, 0.14, 0.075).translate(-SHO_X - 0.01, ELB_Y - 0.26, 0.09), 14, 6, -1));       // phone (left forearm)
  parts.push(tag(new THREE.CylinderGeometry(0.012, 0.016, 0.95, 5).translate(SHO_X + 0.02, 1.35, 0.06), 15, 6, 1));         // umbrella shaft
  parts.push(tag(new THREE.CylinderGeometry(0.02, 0.44, 0.16, 9).translate(SHO_X + 0.02, 1.86, 0.06), 15, 7, 1));           // umbrella canopy
  return mergeGeometries(parts);
}

const CHUNK_ANIM = /* glsl */ `
  float ph = uPedTime * aAnim.y + aAnim.x;
  float amp = aAnim.z;
  float lp = ph + (aSide * 0.5 + 0.5) * 3.14159; // legs half a cycle apart
  float thigh = 0.55 * amp * sin(lp);
  float knee  = 0.95 * amp * max(0.0, sin(lp - 1.35)); // heel lifts on recovery
  float armSw = -0.45 * amp * sin(lp);
  float elbow = -(0.30 + 0.18 * amp * (0.5 + 0.5 * sin(lp))); // arms carry bent
  // accessory visibility: hidden parts collapse to the origin (one mesh, one
  // draw call, per-instance outfits). Umbrellas only exist while it rains.
  float mask = aStyle.x;
  if (aPart > 9.5) {
    float bit = aPart < 10.5 ? 1.0 : aPart < 11.5 ? 2.0 : aPart < 12.5 ? 4.0
              : aPart < 13.5 ? 8.0 : aPart < 14.5 ? 16.0 : 32.0;
    float on = pedBit(mask, bit);
    if (aPart > 14.5) on *= step(0.22, uPedWet);
    if (on < 0.5) { transformed = vec3(0.0); } // zero-area at the feet = invisible
  }
  // phone-walker: the LEFT arm holds a fixed raised pose instead of swinging
  float phoneOn = pedBit(mask, 16.0);
  bool leftArm = aSide < 0.0 && (aPart > 2.5 && aPart < 4.5 || (aPart > 13.5 && aPart < 14.5));
  if (phoneOn > 0.5 && leftArm) { armSw = 0.5; elbow = -1.5; }
  // umbrella arm: right arm raises slightly while the umbrella is up
  float umbOn = pedBit(mask, 32.0) * step(0.22, uPedWet);
  bool rightArm = aSide > 0.0 && (aPart > 2.5 && aPart < 4.5 || aPart > 12.5 && aPart < 13.5 || aPart > 14.5);
  if (umbOn > 0.5 && rightArm) { armSw = 0.32; elbow = -1.15; }
  vec3 pp = transformed;
  float chain = aPart;
  if (aPart > 12.5 && aPart < 14.5) chain = 4.0;      // bag/phone ride the forearm
  if (aPart > 14.5) chain = 4.0;                       // umbrella rides the right forearm
  if (chain > 0.5 && chain < 2.5) {
    if (chain > 1.5) { pp = pedRot(pp, vec3(aSide * 0.09, 0.50, 0.0), knee); }
    pp = pedRot(pp, vec3(aSide * 0.09, 0.96, 0.0), thigh);
  } else if (chain > 2.5 && chain < 4.5) {
    if (chain > 3.5) { pp = pedRot(pp, vec3(aSide * 0.22, 1.12, 0.0), elbow); }
    pp = pedRot(pp, vec3(aSide * 0.22, 1.40, 0.0), armSw);
  }
  pp.y += abs(sin(ph)) * 0.045 * amp; // gait bob
  transformed = pp;
`;

const FN_ROT = /* glsl */ `
attribute float aPart;
attribute float aCol;
attribute float aSide;
attribute vec4 aAnim;
attribute vec4 aStyle; // x: accessory bitmask (1 coat, 2 hood, 4 backpack, 8 bag, 16 phone, 32 umbrella), y: bag tone, z: umbrella tone, w: reserved
uniform float uPedTime;
uniform float uPedWet;
varying float vPedCol;
float pedBit(float mask, float bit) { return mod(floor(mask / bit + 0.5 / bit), 2.0); }
vec3 pedRot(vec3 p, vec3 piv, float a) {
  float c = cos(a), s = sin(a);
  vec3 q = p - piv;
  return piv + vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z);
}
`;

function injectAnim(shader, timeRef, withColor) {
  shader.uniforms.uPedTime = timeRef;
  shader.uniforms.uPedWet = ENV.wet;
  shader.vertexShader = (withColor ? FN_ROT : FN_ROT.replace('varying float vPedCol;\n', ''))
    + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n' + CHUNK_ANIM + (withColor ? '  vPedCol = aCol;\n' : ''),
  );
  if (!withColor) return;
  // per-part color classes; shirt keeps the instance color
  shader.vertexShader = shader.vertexShader.replace(
    '#include <color_vertex>',
    `#include <color_vertex>
    {
      vec3 shirt = vColor.rgb;
      vec3 pants = shirt * vec3(0.30, 0.30, 0.36) + vec3(0.03);
      // three-stop skin ramp: light / medium / deep, driven by one channel
      vec3 skin = mix(mix(vec3(0.87, 0.68, 0.55), vec3(0.62, 0.44, 0.32), smoothstep(0.0, 0.55, aAnim.w)),
                      vec3(0.35, 0.22, 0.155), smoothstep(0.55, 1.0, aAnim.w));
      vec3 hair = mix(vec3(0.09, 0.075, 0.06), vec3(0.45, 0.33, 0.20), fract(aAnim.w * 7.31));
      vec3 bagC = aStyle.y < 0.33 ? vec3(0.08, 0.08, 0.09) : aStyle.y < 0.66 ? vec3(0.25, 0.16, 0.1) : vec3(0.14, 0.2, 0.28);
      vec3 umbC = aStyle.z < 0.5 ? vec3(0.06, 0.06, 0.07) : aStyle.z < 0.75 ? vec3(0.5, 0.1, 0.1) : vec3(0.12, 0.2, 0.45);
      vColor.rgb = aCol < 0.5 ? shirt : aCol < 1.5 ? pants : aCol < 2.5 ? skin : aCol < 3.5 ? hair
                 : aCol < 4.5 ? vec3(0.10, 0.10, 0.11)
                 : aCol < 5.5 ? bagC : aCol < 6.5 ? vec3(0.04, 0.04, 0.05) : umbC;
    }`,
  );
}

export function buildPedMesh(cap, baseMaterial) {
  const geo = buildBody();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  anim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAnim', anim);
  const style = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  style.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStyle', style);
  const timeRef = { value: 0 };
  const baseRate = new Float32Array(cap);
  const mat = baseMaterial;
  const prevHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prevHook) prevHook(shader, renderer);
    injectAnim(shader, timeRef, true);
  };
  mat.customProgramCacheKey = () => 'pedanim';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  // articulated shadows: same displacement in the depth pass
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => injectAnim(shader, timeRef, false);
  depth.customProgramCacheKey = () => 'pedanimdepth';
  mesh.customDepthMaterial = depth;
  return {
    mesh,
    timeRef,
    setAnim(idx, phase, rate, amp, skin) {
      anim.setXYZW(idx, phase, rate, amp, skin);
      baseRate[idx] = rate;
      anim.needsUpdate = true;
    },
    // PY25 (sim/peds.js): walk-cycle rate x f for a walker slowed behind someone; the phase offset absorbs the change so
    // the legs do not jump (phase = t * rate + offset)
    setPace(idx, f) {
      const r0 = anim.getY(idx), r1 = baseRate[idx] * f;
      if (Math.abs(r1 - r0) < 0.04 * (baseRate[idx] || 1)) return;
      anim.setX(idx, anim.getX(idx) + timeRef.value * (r0 - r1));
      anim.setY(idx, r1);
      anim.needsUpdate = true;
    },
    setAmp(idx, amp) {
      if (anim.getZ(idx) !== amp) { anim.setZ(idx, amp); anim.needsUpdate = true; }
    },
    setStyle(idx, mask, bagTone, umbTone) {
      style.setXYZW(idx, mask, bagTone, umbTone, 0);
      style.needsUpdate = true;
    },
  };
}
