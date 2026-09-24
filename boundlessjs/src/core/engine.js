import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';

// NaN / Inf GUARD (film 7, 2026-09-23). A pose-specific non-finite pixel in the HDR chain came out of the final frame as a
// PURE-BLACK half or box: the bloom mip chain spreads one NaN over whole blocks (NaN + colour = NaN, and bloom strength
// 0 still adds 0 x NaN), and the TAA history keeps it. It is deterministic per pose, so no re-shoot cures it:
// mMidtownSky frames 0/17/22/24/27/47/63/69 in both recording passes, all whole with the guard. Very likely the
// round-15 "composer void" of wbEarthBroadway too (not re-rendered). NaN / Inf are tested by bit pattern, because FXC
// is allowed to fold isnan() and x != x away.
const NF_GLSL = /* glsl */ `
  bool nfBad(float x) { return (floatBitsToUint(x) & 0x7F800000u) == 0x7F800000u; }
  bool nfBad3(vec3 v) { return nfBad(v.x) || nfBad(v.y) || nfBad(v.z); }
`;
const NaNGuardShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; ${NF_GLSL}
    void main(){ vec4 c = texture2D(tDiffuse, vUv); if (nfBad3(c.rgb) || nfBad(c.a)) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = c; }`,
};
// Scene pre-pass: renders into a DEDICATED color+depth target that is never
// a draw target again during the frame — the only feedback-proof way to hand
// scene depth to later passes — then copies color into the composer chain.
class ScenePrePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(innerWidth, innerHeight),
      samples: 2, // 2x MSAA + TAA/SMAA — 4x measured fragment-bound on SW raster with no shimmer win
    });
    this._copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: NaNGuardShader.fragmentShader,
    }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._copy.render(renderer);
  }
}

// Screen-space reflections for upward surfaces (wet streets, plazas): depth-
// march in view space against the scene depth attached to the composer RTs.
// Normals come from depth derivatives — exact for the planar ground that this
// pass targets; walls/glass keep their env-probe reflections.
class GroundSSRPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
      uUpView: { value: new THREE.Vector3(0, 1, 0) },
      uStrength: { value: 0.0 },
      // MISS FALLBACK (docs/notes/lighting-r6.md 3). The march reflects about
      // true up, so a NEAR ground pixel (steep view) sends its ray almost
      // straight up, off the geometry and into sky — depth 1.0, which can never
      // satisfy the hit test — and the pixel returned dry. A FAR ground pixel
      // grazes, runs up the facades and hits. The changeover is a horizontal
      // screen line, and that is the razor-straight wet/dry boundary at
      // y = 560 in xwalk125_dusk_rain (critic r5 11 #1). canyon5th looks down
      // an open avenue where the march never hits at any row, which is why the
      // same rain value left it bone dry (11's "diagnostic").
      // A wet surface whose reflected ray escapes still reflects the SKY, so a
      // miss composites this colour instead of returning the dry pixel.
      uSkyCol: { value: new THREE.Color(0.62, 0.69, 0.78) },
      uSkyAmt2: { value: 0.55 },
      // wet asphalt is DARKER than dry asphalt (the film fills the aggregate)
      uWetDark: { value: 0.0 },
    };
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      // fullscreen composite: NEVER depth-test against the target's stale
      // depth buffer — the quad gets randomly rejected and the frame blacks out
      depthTest: false,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 uProj, uInvProj; uniform vec3 uUpView; uniform float uStrength;
        uniform vec3 uSkyCol; uniform float uSkyAmt2; uniform float uWetDark;
        varying vec2 vUv;
        vec3 viewPos(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          return c.xyz / c.w;
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          gl_FragColor = base;
          if (uStrength < 0.004) return;
          vec3 p = viewPos(vUv);
          if (-p.z > 900.0) return;
          vec3 n = normalize(cross(dFdx(p), dFdy(p)));
          if (n.z < 0.0) n = -n;
          float upD = dot(n, uUpView);
          if (upD < 0.72) return;               // ground-ish pixels only
          vec3 vd = normalize(p);
          vec3 r = reflect(vd, uUpView);        // mirror about true up: stable, no derivative noise
          float stepL = max(0.3, -p.z * 0.03);
          vec3 q = p;
          // the sky is what a wet street reflects wherever the march escapes,
          // and the value must be continuous with a real hit or the fallback
          // draws its own edge
          vec3 refl = uSkyCol * uSkyAmt2; float hitW = uSkyAmt2 > 0.001 ? 0.55 : 0.0;
          for (int i = 0; i < 26; i++) {
            q += r * stepL;
            stepL *= 1.14;
            vec4 cp = uProj * vec4(q, 1.0);
            vec2 uv2 = cp.xy / cp.w * 0.5 + 0.5;
            if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0 || cp.w < 0.0) break;
            float sd = viewPos(uv2).z;
            if (sd >= q.z && sd - q.z < stepL * 2.4 + 0.9) {
              float edge = smoothstep(0.0, 0.08, uv2.x) * smoothstep(1.0, 0.92, uv2.x)
                         * smoothstep(0.0, 0.06, uv2.y) * smoothstep(1.0, 0.94, uv2.y);
              refl = texture2D(tDiffuse, uv2).rgb;
              hitW = edge;
              break;
            }
          }
          if (hitW <= 0.0) return;
          float fres = pow(1.0 - clamp(dot(-vd, n), 0.0, 1.0), 2.0);
          // the fresnel floor was 0.3; a wet road 3 m from the eye is viewed at
          // ~70 deg incidence where fres is near zero, so the near field lost the
          // sheen a second time on top of the march miss. 0.45 keeps the near
          // road wet while the grazing distance still goes to a mirror.
          float w = uStrength * hitW * (0.45 + 0.55 * fres) * smoothstep(0.72, 0.86, upD);
          // wet asphalt is darker than dry asphalt everywhere, hit or miss —
          // this is the term that makes the wetness continuous across the frame
          vec3 wetBase = base.rgb * (1.0 - uWetDark * smoothstep(0.72, 0.86, upD));
          gl_FragColor = vec4(mix(wetBase, refl, clamp(w, 0.0, 0.85)), base.a);
        }`,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uProj.value.copy(this.camera.projectionMatrix);
    this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.uUpView.value.set(0, 1, 0).transformDirection(this.camera.matrixWorldInverse);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
  }
}

// Screen-space GI: half-res gather of first-bounce radiance from the lit
// frame (12-tap golden spiral against scene depth, cosine-weighted, stable
// IGN rotation — no TAA to hide shimmer), then a chroma-preserving composite:
// bounce is modulated by an albedo proxy so shadowed walls pick up colored
// light from sunlit pavement/facades instead of multiplying toward black.
class SSGIPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(innerWidth >> 1, innerHeight >> 1, { type: THREE.HalfFloatType });
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2(innerWidth >> 1, innerHeight >> 1) },
      uRad: { value: 6.0 },
    };
    this._gather = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 uProj, uInvProj; uniform vec2 uRes; uniform float uRad;
        varying vec2 vUv;
        vec3 viewPos(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          return c.xyz / c.w;
        }
        void main() {
          vec3 p = viewPos(vUv);
          if (-p.z > 520.0) { gl_FragColor = vec4(0.0); return; }
          vec3 n = normalize(cross(dFdx(p), dFdy(p)));
          if (n.z < 0.0) n = -n;
          float ang = 6.28318 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec2 rot = vec2(cos(ang), sin(ang));
          float radPx = clamp(uRad * uProj[1][1] * uRes.y * 0.5 / max(1.0, -p.z), 6.0, 140.0);
          vec3 gi = vec3(0.0);
          for (int i = 0; i < 12; i++) {
            float fi = (float(i) + 0.5) / 12.0;
            float a = fi * 39.9;
            vec2 sp = vec2(cos(a), sin(a));
            sp = vec2(sp.x * rot.x - sp.y * rot.y, sp.x * rot.y + sp.y * rot.x);
            vec2 uv2 = vUv + sp * (sqrt(fi) * radPx) / uRes;
            if (uv2.x <= 0.001 || uv2.x >= 0.999 || uv2.y <= 0.001 || uv2.y >= 0.999) continue;
            vec3 q = viewPos(uv2);
            vec3 d = q - p;
            float dist = length(d);
            if (dist < 0.05 || dist > uRad * 2.5) continue;
            float ndl = max(0.0, dot(n, d / dist));
            float fall = 1.0 / (1.0 + dist * dist * (3.0 / (uRad * uRad)));
            gi += min(texture2D(tDiffuse, uv2).rgb, vec3(2.5)) * (ndl * fall);
          }
          gl_FragColor = vec4(gi * (1.0 / 12.0), 1.0);
        }`,
    }));
    this.compUniforms = {
      tDiffuse: { value: null }, tGI: { value: this.rt.texture },
      uStrength: { value: 0.0 },
      uGiTexel: { value: new THREE.Vector2(2 / innerWidth, 2 / innerHeight) },
    };
    this._comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.compUniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tGI; uniform float uStrength;
        uniform vec2 uGiTexel;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          gl_FragColor = base;
          if (uStrength < 0.004) return;
          // 5-tap cross blur over the half-res gather: IGN speckle averages out,
          // bounce light is low-frequency so no detail is lost
          vec3 gi = texture2D(tGI, vUv).rgb * 0.36
                  + texture2D(tGI, vUv + vec2(uGiTexel.x * 1.5, 0.0)).rgb * 0.16
                  + texture2D(tGI, vUv - vec2(uGiTexel.x * 1.5, 0.0)).rgb * 0.16
                  + texture2D(tGI, vUv + vec2(0.0, uGiTexel.y * 1.5)).rgb * 0.16
                  + texture2D(tGI, vUv - vec2(0.0, uGiTexel.y * 1.5)).rgb * 0.16;
          vec3 alb = base.rgb / (dot(base.rgb, vec3(0.299, 0.587, 0.114)) + 0.35);
          gl_FragColor = vec4(base.rgb + gi * alb * uStrength, base.a);
        }`,
    }));
  }
  setSize(w, h) {
    this.rt.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.uniforms.uRes.value.set(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.compUniforms.uGiTexel.value.set(2 / Math.max(2, w), 2 / Math.max(2, h));
  }
  render(renderer, writeBuffer, readBuffer) {
    if (this.compUniforms.uStrength.value >= 0.004) {
      this.uniforms.tDiffuse.value = readBuffer.texture;
      this.uniforms.uProj.value.copy(this.camera.projectionMatrix);
      this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
      renderer.setRenderTarget(this.rt);
      this._gather.render(renderer);
    }
    this.compUniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._comp.render(renderer);
  }
}

// Volumetric haze: ANALYTIC exponential height fog with Henyey-Greenstein sun
// in-scattering — fog as a lit participating medium (warm glow toward the sun,
// cool blue-gray away) instead of a flat distance fade. Closed-form optical
// depth along the reconstructed world ray (no marching = no banding, no
// sprites); IGN dither hides the last quantization step. Composited before
// bloom so hazy highlights still glow.
class HazePass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture },
      uInvProj: { value: new THREE.Matrix4() }, uCamMat: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.9, 0.8) },
      uFogCol: { value: new THREE.Color(0.7, 0.75, 0.82) },
      uDensity: { value: 0.0 },   // extinction at ground level
      uFalloff: { value: 0.012 }, // 1/m height falloff
      uG: { value: 0.55 },        // HG anisotropy
      uSunBoost: { value: 1.0 },
      uBaseY: { value: 0.0 },     // fog "sea level" follows the local ground
      // How much of the haze reaches SKY pixels. The Sky mesh has
      // depthWrite:false, so sky fragments keep the cleared depth of 1.0 and
      // this pass used to reconstruct 14 km of fog through every one of them:
      // at the day density that is optical depth 4.3, i.e. 99 % of the sky
      // replaced by the haze colour. The analytic sky ALREADY contains its own
      // Rayleigh/Mie scattering, so haze on top of it is double-counted — and
      // it is what critic rounds 2-3 called "a pale cyan-to-cream sky with no
      // blue anywhere" and "veiling glare on sun-facing headings".
      uSkyAmt: { value: 0.0 },
      // Ceiling on the Henyey-Greenstein sun glow, in units of sun colour.
      // Unclamped, ph(mu=1, g=0.6) = 2.5 and at the shipped boost the
      // in-scattered radiance reached ~3.5 — brighter than the sky itself,
      // pasted over the lower half of every sun-facing frame.
      uGlowMax: { value: 0.9 },
      // AERIAL PERSPECTIVE IS RAYLEIGH (docs/notes/lighting-r6.md 4). The veil a
      // distant tower is seen through is SKY-coloured, not fog-grey: the
      // reference reads L 81-106 at 50-65 % of sky value with R-B -58..-96
      // against our L 147-178 at 89-107 % and R-B +54..+64
      // (docs/notes/skyscrapers.md 3.1). uBlue pushes the base colour toward
      // the sky's own spectrum; the HG horizon glow rides on top untouched.
      uBlue: { value: 0.0 },
      // Contrast floor. Physical extinction alone takes a 5 km pixel to
      // T = 0.44, i.e. 56 % haze, and no material can win against that. This is
      // a soft floor (a lerp, not a clamp), so near-field haze stays physical
      // and the far field keeps a stated fraction of its own value.
      uTmin: { value: 0.0 },
    };
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 uInvProj, uCamMat;
        uniform vec3 uCamPos, uSunDir, uSunCol, uFogCol;
        uniform float uDensity, uFalloff, uG, uSunBoost, uBaseY, uSkyAmt, uGlowMax, uBlue, uTmin;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          gl_FragColor = base;
          if (uDensity < 1e-6) return;
          float d = texture2D(tDepth, vUv).x;
          float sky = step(0.999995, d);          // nothing was drawn: this is the sky
          if (sky > 0.5 && uSkyAmt < 1e-4) return;
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec3 viewP = vp.xyz / vp.w;
          float dist = min(length(viewP), 14000.0);
          vec3 rd = normalize((uCamMat * vec4(viewP, 0.0)).xyz);
          // closed-form optical depth of exp height fog along the ray
          float h0 = uCamPos.y - uBaseY;
          float ky = rd.y * uFalloff;
          float od;
          if (abs(ky) > 1e-5) od = uDensity * exp(-h0 * uFalloff) * (1.0 - exp(-ky * dist)) / ky;
          else od = uDensity * exp(-h0 * uFalloff) * dist;
          od *= mix(1.0, uSkyAmt, sky);
          float T = exp(-max(od, 0.0));
          // Henyey-Greenstein phase toward the sun, with a ceiling: the forward
          // peak is 2.5 at g = 0.6 and the product used to exceed the sky's own
          // radiance, which is veiling glare by construction
          float mu = dot(rd, uSunDir);
          float g2 = uG * uG;
          float ph = (1.0 - g2) / pow(1.0 + g2 - 2.0 * uG * mu, 1.5) * 0.25;
          float sunUp = smoothstep(-0.06, 0.12, uSunDir.y);
          // Rayleigh tint on the base veil, strongest away from the sun and
          // toward the zenith — a distant Manhattan tower is seen through BLUE
          // air, and the round-5 plates read our distant city as warmer than
          // the sky it stands against.
          float away = 0.5 - 0.5 * mu;                       // 0 at the sun, 1 opposite
          float up = smoothstep(-0.25, 0.35, rd.y);
          vec3 fogC = mix(uFogCol, uFogCol * vec3(0.70, 0.87, 1.26), uBlue * mix(0.45, 1.0, max(away, up)));
          vec3 scat = fogC + uSunCol * min(ph * uSunBoost, uGlowMax) * sunUp;
          // IGN dither on transmittance kills residual banding on long ramps
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          T = clamp(T + (ign - 0.5) * 0.012, 0.0, 1.0);
          // soft contrast floor on GEOMETRY only (the sky already carries its
          // own scattering and is gated by uSkyAmt)
          T = mix(T, uTmin + (1.0 - uTmin) * T, 1.0 - sky);
          gl_FragColor = vec4(mix(scat, base.rgb, T), base.a);
        }`,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.uCamMat.value.copy(this.camera.matrixWorld);
    this.uniforms.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
  }
}

// Screen-space god rays: quarter-res sky/sun occlusion mask -> 48-tap radial
// march toward the projected sun -> additive composite. Sun screen position
// and off-screen/behind-camera fade are computed CPU-side each frame.
class GodraysPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;
    const w = innerWidth >> 2, h = innerHeight >> 2;
    this.maskRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.rayRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.uniforms = {
      tDepth: { value: depthTexture },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
      uFade: { value: 0 },
    };
    this._mask = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth; uniform vec2 uSunUV; uniform float uFade;
        varying vec2 vUv;
        void main() {
          float sky = step(0.99995, texture2D(tDepth, vUv).x);
          vec2 d = (vUv - uSunUV) * vec2(${(innerWidth / innerHeight).toFixed(4)}, 1.0);
          float glow = pow(max(0.0, 1.0 - length(d) * 2.2), 2.0);
          gl_FragColor = vec4(vec3(sky * glow * uFade), 1.0);
        }`,
    }));
    this.rayUniforms = {
      tMask: { value: this.maskRT.texture },
      uSunUV: this.uniforms.uSunUV,
      uDecay: { value: 0.955 },
    };
    this._march = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.rayUniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tMask; uniform vec2 uSunUV; uniform float uDecay;
        varying vec2 vUv;
        void main() {
          vec2 dir = (uSunUV - vUv) / 48.0;
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec2 uv = vUv + dir * ign;
          float acc = 0.0, wgt = 1.0;
          for (int i = 0; i < 48; i++) {
            acc += texture2D(tMask, uv).r * wgt;
            wgt *= uDecay;
            uv += dir;
          }
          gl_FragColor = vec4(vec3(acc / 22.0), 1.0);
        }`,
    }));
    this.compUniforms = {
      tDiffuse: { value: null },
      tRays: { value: this.rayRT.texture },
      uSunCol: { value: new THREE.Color(1, 0.9, 0.75) },
      uIntensity: { value: 0.0 },
    };
    this._comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.compUniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tRays;
        uniform vec3 uSunCol; uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float r = texture2D(tRays, vUv).r;
          gl_FragColor = vec4(base.rgb + uSunCol * r * uIntensity, base.a);
        }`,
    }));
    this._v = new THREE.Vector3();
  }
  setSize(w, h) { this.maskRT.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); this.rayRT.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); }
  setSun(sunDirWorld, intensity, color) {
    // project a far point along the sun direction; fade behind/off-screen
    this._v.copy(sunDirWorld).multiplyScalar(5000).add(this.camera.position);
    const p = this._v.project(this.camera);
    const behind = p.z > 1 ? 0 : 1;
    this.uniforms.uSunUV.value.set((p.x + 1) / 2, (p.y + 1) / 2);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y));
    this.uniforms.uFade.value = behind * (1 - THREE.MathUtils.smoothstep(edge, 0.95, 1.6));
    this.compUniforms.uIntensity.value = intensity;
    if (color) this.compUniforms.uSunCol.value.copy(color);
    this.enabled = intensity * this.uniforms.uFade.value > 0.004;
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.maskRT);
    this._mask.render(renderer);
    renderer.setRenderTarget(this.rayRT);
    this._march.render(renderer);
    this.compUniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._comp.render(renderer);
  }
}

// Camera motion blur: reproject each pixel into LAST frame's clip space via
// the depth buffer, blur along the screen-space velocity. Sells swing speed
// (this is a grapple game) at 8 taps; object motion isn't tracked — camera
// motion dominates traversal anyway.
class MotionBlurPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;
    this.prevVP = new THREE.Matrix4();
    this._curVP = new THREE.Matrix4();
    this._first = true;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture },
      uInvProj: { value: new THREE.Matrix4() }, uCamMat: { value: new THREE.Matrix4() },
      uPrevVP: { value: new THREE.Matrix4() },
      uAmt: { value: 0.0 },
    };
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 uInvProj, uCamMat, uPrevVP;
        uniform float uAmt;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          gl_FragColor = base;
          if (uAmt < 0.004) return;
          float d = texture2D(tDepth, vUv).x;
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 wp = uCamMat * vec4(vp.xyz / vp.w, 1.0);
          vec4 pc = uPrevVP * wp;
          vec2 prevUV = pc.xy / pc.w * 0.5 + 0.5;
          vec2 vel = (vUv - prevUV);
          float vl = length(vel);
          if (vl < 1e-4) return;
          vel *= min(1.0, 0.045 / vl) * uAmt; // clamp streak length
          vec3 acc = base.rgb;
          float w = 1.0;
          for (int i = 1; i < 8; i++) {
            vec2 uv2 = vUv - vel * (float(i) / 7.0);
            if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) break;
            float fw = 1.0 - float(i) / 9.0;
            acc += texture2D(tDiffuse, uv2).rgb * fw;
            w += fw;
          }
          gl_FragColor = vec4(acc / w, base.a);
        }`,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    this._curVP.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    if (this._first) { this.prevVP.copy(this._curVP); this._first = false; }
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.uCamMat.value.copy(this.camera.matrixWorld);
    this.uniforms.uPrevVP.value.copy(this.prevVP);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
    this.prevVP.copy(this._curVP);
  }
}

// Temporal AA: the camera projection is jittered a fraction of a pixel each
// frame (Halton 2,3 in the render loop) and this pass integrates the samples
// over time with depth reprojection + 3x3 neighborhood clamping. This is what
// supersamples SHADER detail (procedural facades, speculars). MSAA only covers
// triangle edges and SMAA only smooths them after the fact, which is why the
// far field read as "Unity pixelation" without it.
class TAAPass extends Pass {
  constructor(camera, depthTexture, w, h) {
    super();
    this.camera = camera;
    this.amount = 0.85; // history weight; 0 = off (passthrough)
    this.prevVP = new THREE.Matrix4();
    this._curVP = new THREE.Matrix4();
    this._first = true;
    const mk = () => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.histA = mk(); this.histB = mk();
    this.uniforms = {
      tDiffuse: { value: null }, tHistory: { value: null }, tDepth: { value: depthTexture },
      uInvProj: { value: new THREE.Matrix4() }, uCamMat: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uBlend: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
    };
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform sampler2D tHistory; uniform sampler2D tDepth;
        uniform mat4 uInvProj, uCamMat, uPrevVP;
        uniform float uBlend; uniform vec2 uTexel;
        varying vec2 vUv;
        ${NF_GLSL}
        void main() {
          vec3 cur = texture2D(tDiffuse, vUv).rgb;
          if (nfBad3(cur)) cur = vec3(0.0);
          if (uBlend < 0.01) { gl_FragColor = vec4(cur, 1.0); return; }
          // neighborhood bounds of the CURRENT frame bound the history (kills ghosting)
          vec3 mn = cur, mx = cur;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
            if (i == 0 && j == 0) continue;
            vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * uTexel).rgb;
            mn = min(mn, c); mx = max(mx, c);
          }
          float d = texture2D(tDepth, vUv).x;
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 wp = uCamMat * vec4(vp.xyz / vp.w, 1.0);
          vec4 pc = uPrevVP * wp;
          vec2 prevUV = pc.xy / pc.w * 0.5 + 0.5;
          bool uvOk = !(nfBad(prevUV.x) || nfBad(prevUV.y));
          float valid = (uvOk && prevUV.x > 0.001 && prevUV.x < 0.999 && prevUV.y > 0.001 && prevUV.y < 0.999) ? 1.0 : 0.0;
          // reprojection HANDLES motion — only violent cuts reject history.
          // (aggressive rejection here made the whole frame show raw jitter as
          // a constant camera shake whenever the drone was moving)
          if (valid > 0.0) valid *= 1.0 - smoothstep(0.22, 0.55, length(vUv - prevUV));
          vec3 histRaw = valid > 0.0 ? texture2D(tHistory, prevUV).rgb : cur;
          if (nfBad3(histRaw)) { histRaw = cur; valid = 0.0; }
          vec3 hist = clamp(histRaw, mn, mx);
          // anti-ghost: where the clamp fought the history (moving cars, peds,
          // disocclusion), trust it less — kills trailing smears
          float fight = length(histRaw - hist) / (length(cur) + 0.15);
          float bl = uBlend * valid * (1.0 - smoothstep(0.04, 0.3, fight));
          vec3 o = mix(cur, hist, bl);
          gl_FragColor = vec4(nfBad3(o) ? cur : o, 1.0);
        }`,
    }));
    this._copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
    }));
  }
  setSize(w, h) {
    this.histA.setSize(w, h); this.histB.setSize(w, h);
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
    this._first = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    // CRITICAL: reproject with JITTER-FREE matrices. Using the jittered
    // projection made prevUV wander sub-pixel every frame even at rest —
    // linear-filtered history then wobbled: the "TAA shake while still".
    const proj = this.unjitProj || this.camera.projectionMatrix;
    const invProj = this.unjitProjInv || this.camera.projectionMatrixInverse;
    this._curVP.multiplyMatrices(proj, this.camera.matrixWorldInverse);
    if (this._first) this.prevVP.copy(this._curVP);
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tHistory.value = this.histA.texture;
    const still = this.stillBlend ?? 1;
    this.uniforms.uBlend.value = this._first ? 0 : this.amount * (0.3 + 0.7 * still);
    this.uniforms.uInvProj.value.copy(invProj);
    this.uniforms.uCamMat.value.copy(this.camera.matrixWorld);
    this.uniforms.uPrevVP.value.copy(this.prevVP);
    renderer.setRenderTarget(this.histB); // resolve into the new history
    this._quad.render(renderer);
    this._copy.material.uniforms.tDiffuse.value = this.histB.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._copy.render(renderer);
    const t = this.histA; this.histA = this.histB; this.histB = t;
    this.prevVP.copy(this._curVP);
    this._first = false;
  }
}

// ---- SHADOW CASCADE GEOMETRY (docs/notes/lighting-r6.md 1b/1c, 2)
// Near cascade half-extent in metres. 150 covers a full Manhattan block plus
// the avenue either side at 4096 -> 7.3 cm/texel, which is what a 100 mm sill
// needs in order to throw anything at all.
const SHADOW_S = 150;
// N11 (docs/notes/night-r11.md): `?n11=0` restores the round-10 night rig, which in
// this file means the probe's hard darkness rejection. Read locally rather than
// imported from world/night11.js — core/ does not depend on world/.
const N11 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('n11') === '0');
// Both cascades follow camera HEIGHT, because a fixed pair cannot serve a 2.5 m
// eye and a 552 m aerial: a 150 m box is the whole world at street level and a
// rounding error over Midtown. Near map 4096, far map 2048.
//   y=2.5  near +/-153 (7.5 cm/texel)  far +/-1150 (1.12 m/texel)
//   y=170  near +/-337 (16 cm)         far +/-1594 (1.56 m)
//   y=552  near +/-700 (34 cm)         far +/-2600 (2.54 m)
const nearExtent = (camY) => Math.max(150, Math.min(700, 150 + Math.max(0, camY) * 1.1));
const far2Extent = (camY) => Math.max(1150, Math.min(2600, 1050 + Math.max(0, camY) * 3.2));
// ...and so does the key split between them (weather.js reads engine.shadowMix).
// At eye level the near map does the work and the far map is only aerial
// perspective, so it must not leak shadow strength: 0.88/0.12. From an aerial
// the near map covers a fraction of the frame and the far map is the ONLY
// shadow in it, so the weight has to move across. This is what left every
// crownClose / esbCrown / skyMidtown tower unshadowed: the far cascade held
// 26 % of the key at 2.34 m/texel with a 1.5 m normal bias.
// CS11 (docs/notes/contact-r11.md, ?cs11=0 / ?cs11cas=0). That height ramp is the
// reason nothing on a roof casts a shadow that reads from the air: instanced props
// cast into the NEAR map only, so at lenoxTop (260 m) a roof unit's shadow is worth
// 0.34 of the key while the building masses beside it are shadowed by both maps and
// read at 1.0. But height alone is the wrong variable — it cannot tell a NADIR plate
// at 260 m, where the near box (+/-436 m) covers the entire frame and the far map is
// carrying two thirds of the key for nothing, from a 3 km skyline at the same height.
// So: measure what the near box actually covers (the horizontal ground reach of the
// TOP-of-frame ray) and hand the near map back that fraction of what the height ramp
// took. Strictly non-decreasing — `Math.max` — so no framing can lose shadow it has
// today, and a ray that leaves the ground (every crown/skyline preset looks up) gets
// coverage 0 and is untouched.
const CS11CAS = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('cs11') === '1'   // opt-in until the blob blend is fixed (r11-triage.md)
  && new URLSearchParams(location.search).get('cs11cas') !== '0';
const shadowMixCover = (base, camY, camera, S) => {
  if (!CS11CAS || !camera) return base;
  const a = -Math.asin(Math.max(-1, Math.min(1, camera.getWorldDirection(_csFwd).y)))
          - (camera.fov * Math.PI) / 360;        // depression of the top-of-frame ray
  if (a < 0.035) return base;                    // ray leaves the ground -> no coverage
  const dFar = Math.max(1, camY / Math.tan(a));  // horizontal ground reach, metres
  const cov = Math.max(0, Math.min(1, S / dFar));
  return Math.max(base, base + (0.88 - base) * cov);
};
const _csFwd = new THREE.Vector3();
const shadowMixFor = (camY) => {
  const w = Math.max(0, Math.min(1, (camY - 25) / 175));
  return 0.88 + (0.34 - 0.88) * w;
};

// Halton (2,3) 8-point sub-pixel jitter pattern, centered on 0
const HALTON8 = [
  [0.0, -0.1667], [-0.25, 0.1667], [0.25, -0.3889], [-0.375, -0.0556],
  [0.125, 0.2778], [-0.125, -0.2778], [0.375, 0.0556], [-0.4375, 0.3889],
];

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.2 }, uSat: { value: 1.07 }, uCon: { value: 0.16 }, uWarm: { value: 0.05 }, uTintG: { value: 0.0 }, uSharp: { value: 0.4 }, uDef: { value: 0.25 }, uTexel: { value: new THREE.Vector2(1 / innerWidth, 1 / innerHeight) }, uGrain: { value: 0.05 }, uCA: { value: 0.35 }, uTimeG: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform float uCon; uniform float uWarm; uniform float uTintG;
    uniform float uSharp; uniform float uDef; uniform vec2 uTexel; uniform float uGrain; uniform float uCA; uniform float uTimeG;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uCA > 0.003) {
        // chromatic aberration: radial RGB split, zero at center (lens feel)
        vec2 rd = (vUv - 0.5);
        float r2 = dot(rd, rd);
        vec2 off = rd * r2 * uCA * 0.014;
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.b = texture2D(tDiffuse, vUv - off).b;
      }
      if (uSharp > 0.003) {
        // clamped unsharp mask on display-referred color: crisp micro-contrast,
        // the delta clamp keeps edges from ringing into halos
        vec3 nb = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb
                + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        vec3 hp = c.rgb - nb * 0.25;
        c.rgb += clamp(hp * uSharp, vec3(-0.05), vec3(0.05));
      }
      if (uDef > 0.003) {
        // DEFINITION: wide-radius local contrast (clarity). Same unsharp idea
        // as sharpness but at ~4 texel radius on LUMINANCE only, midtone
        // weighted, so structure pops without edge halos or color shifts
        vec2 t4 = uTexel * 4.0;
        float lw = dot(texture2D(tDiffuse, vUv + vec2( t4.x,  t4.y)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv + vec2(-t4.x,  t4.y)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv + vec2( t4.x, -t4.y)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv + vec2(-t4.x, -t4.y)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv + vec2( t4.x * 1.6, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv - vec2( t4.x * 1.6, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv + vec2(0.0,  t4.y * 1.6)).rgb, vec3(0.2126, 0.7152, 0.0722))
                 + dot(texture2D(tDiffuse, vUv - vec2(0.0,  t4.y * 1.6)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float lc = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float dHp = lc - lw * 0.125;
        float mid = smoothstep(0.02, 0.18, lc) * smoothstep(1.0, 0.72, lc); // protect deep shadows + highlights
        float gain = clamp(dHp * uDef * 1.4, -0.12, 0.12) * mid;
        c.rgb *= 1.0 + gain / max(lc, 0.06);
      }
      // filmic S-curve + split tone. The split used to run WARM IN THE
      // HIGHLIGHTS (uWarm * l0 * l0), which put +10 sRGB of red and -6 of blue
      // into the sky and nothing at all into shadow — the exact inverse of the
      // references, where the sky is the only strongly blue thing in the frame
      // (R-B -59) and every shaded surface is warm (R-B +24). At warmth 0.07
      // that one term, not the haze, was most of the "pale cyan-to-cream sky".
      // Now: warm the shadows and mids (where masonry bounce actually lives),
      // let the highlights keep their own colour.
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), uCon);
      float l0 = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float shW = 1.0 - smoothstep(0.10, 0.72, l0);
      c.rgb += vec3(uWarm, uWarm * 0.45, -uWarm * 0.6) * shW;
      c.rgb += vec3(-uTintG * 0.55, uTintG, -uTintG * 0.4) * (0.35 + l0 * 0.65); // green-magenta axis
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb += vec3(0.005, 0.006, 0.01) * (1.0 - l); // cool shadow lift (subtle — milky kills contrast)
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.35, 0.95, dot(q, q) * 2.6);
      if (uGrain > 0.001) {
        // animated film grain, strongest in mids, luminance-weighted
        float gN = fract(sin(dot(vUv * 1447.0 + fract(uTimeG) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        float lg = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb += gN * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.35, lg) * smoothstep(1.0, 0.6, lg));
      }
      gl_FragColor = c;
    }`,
};

export class Engine {
  constructor(el, opts = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.74;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated in current three (falls back to PCF with a
    // console warning) — request PCF explicitly and soften via shadow.radius
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Opaque draw order: three sorts by each object's ORIGIN depth, and every
    // tile/ground/water mesh here lives at the world origin (positions baked in
    // world space), so far ground, water (renderOrder -3) and far tiles were
    // shaded first and overdrawn by the near city — the heavy ground/facade
    // shaders paid twice. Sort front-to-back by bounding-sphere centre instead
    // (renderOrder still wins; instanced pools keep three's key).
    {
      const cp = new THREE.Vector3();
      const key = (it) => {
        const o = it.object, bs = o.geometry && o.geometry.boundingSphere;
        if (!bs || o.isInstancedMesh || bs.radius > 5000) return it.z;
        const c = bs.center;
        const dx = c.x + o.position.x - cp.x, dy = c.y + o.position.y - cp.y, dz = c.z + o.position.z - cp.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz); // centre distance: big far meshes must NOT sort early
      };
      this._sortCamPos = cp;
      this._opaqueSortBS = (a, b) => {
        if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
        if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
        if (a.material.id !== b.material.id && false) return 0;
        const ka = key(a), kb = key(b);
        return ka !== kb ? ka - kb : a.id - b.id;
      };
      this.renderer.setOpaqueSort(this._opaqueSortBS);
    }
    // ?fov=<deg>: vertical field of view (default 66). The trailer's Google Earth <-> twin swipes render the twin with the
    // Earth web camera's own 35 deg lens and pose so the wipe reveals the same framing (owner 2026-09-16).
    const fovQ = typeof location !== 'undefined' ? parseFloat(new URLSearchParams(location.search).get('fov')) : NaN;
    this.camera = new THREE.PerspectiveCamera(fovQ > 5 && fovQ < 150 ? fovQ : 66, innerWidth / innerHeight, 0.4, 22000);
    this.camera.position.set(0, 120, 200);

    this.hemi = new THREE.HemisphereLight(0x9db9de, 0x6a5e49, 0.55);
    // URBAN BOUNCE. The environment map is a PMREM of the analytic sky and
    // NOTHING ELSE — no ground, no walls — so in shadow every surface in the
    // city is lit by a pure Rayleigh spectrum (linear R:G:B ~ 0.45:0.62:1.0).
    // applyCityAO then multiplies indirect diffuse by the baked sky-visibility
    // field, i.e. it REMOVES the sky a canyon hides and puts nothing back,
    // where in life it is replaced by sunlit masonry. Result, measured: the
    // same sidewalk material renders R-B 34 in sun and R-B 5 in shade against a
    // panorama that reads R-B 32 at the same spot (streets-audit.md 11), and a
    // brownstone's rendered blue moves only 0.26 sRGB per 1 sRGB of albedo blue
    // so the photograph's value is unreachable from any albedo (furniture.md A).
    // This light is that missing inter-reflection: sun colour times a masonry/
    // concrete albedo, from every direction, scaled with the sun and (through
    // applyCityAO, which scales it like any other indirect term) killed indoors.
    // sky.js sets the colour/level per time-of-day; weather.js scales GFX.bounce.
    this.bounce = new THREE.HemisphereLight(0xffd9b0, 0xffc48a, 0.0);
    this.sun = new THREE.DirectionalLight(0xfff2e2, 3.5);
    this.sun.position.set(-600, 700, 300);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(4096, 4096);
    // DEPTH RANGE (lighting-r6 1b/1c). This was 350..1150 with the light 700 m
    // up-sun of the camera, i.e. a slab from 350 m up-sun to 450 m down-sun.
    // Measured at the day preset (elev 42): a caster in the up-sun corner of the
    // box is clipped by the near plane above Y = 1.49*Y + 211 <= 350, i.e.
    // ~93 m, and ~234 m at the box centre — so every tall tower's upper half was
    // missing from the map and could not shadow anything. An ortho map has
    // uniform depth precision, so a wide slab costs nothing: one 24-bit LSB over
    // 1400 m is 83 microns.
    sh.camera.near = 1;
    sh.camera.far = 1400;
    this._S = SHADOW_S;
    this.shadowMix = 0.88; // near-cascade share of the key (updateSun drives it)
    const S = SHADOW_S; // near cascade half-extent: 7.3 cm texels at 4096
    sh.camera.left = -S; sh.camera.right = S; sh.camera.top = S; sh.camera.bottom = -S;
    // NORMAL BIAS was 0.38 m. normalBias offsets the RECEIVER along its own
    // normal before the lookup, so it erases every shadow whose penumbra is
    // narrower than the offset — which is exactly the 100 mm projecting sill,
    // the lintel reveal and a colonnade intercolumniation (critic r5 7.1:
    // "the limestone reads as paper"). At 7.3 cm texels 6 cm is enough.
    sh.normalBias = 0.06;
    // three ADDS shadowBias to the receiver's depth, so a POSITIVE bias makes
    // more shadow (more acne); acne is pushed away with a negative one. 1.2e-4
    // of the 1400 m range = 17 cm along the light ray.
    sh.bias = -0.00012;
    sh.radius = 1.6; // PCF spread in shadow-map texels (~12 cm) — NYC midday is a hard edge
    // CRITICAL: ortho bounds set after construction do NOTHING until the
    // projection is rebuilt; without this the shadow camera stays the default
    // 10m box with far=500 and the light 700m out renders an EMPTY depth map
    sh.camera.updateProjectionMatrix();
    // far-shadow companion sun (poor-man's second cascade): same direction,
    // the two intensities always SUM to the sky's key value (weather.update),
    // so lighting is unchanged while its wide 1200m frustum shadows the mid
    // distance. Areas only the far map darkens read at ~45% — softer distant
    // shadows, which is what aerial perspective does anyway.
    this.sun2 = new THREE.DirectionalLight(0xfff2e2, 0);
    this.sun2.castShadow = true;
    const sh2 = this.sun2.shadow;
    sh2.mapSize.set(2048, 2048);
    sh2.camera.near = 1; sh2.camera.far = 5200;
    // FAR CASCADE EXTENT is now driven by camera height (updateSun): at 2400 m
    // over a 2048 map it was 2.34 m/texel with a 1.5 m normal bias, so no
    // building edge anywhere resolved and every "distant" shadow was a smear at
    // the wrong offset. On the street it drops to ~1.18 m/texel; from an
    // aerial it opens back out so the skyline stays covered.
    this._S2 = far2Extent(120);
    sh2.camera.left = -this._S2; sh2.camera.right = this._S2; sh2.camera.top = this._S2; sh2.camera.bottom = -this._S2;
    sh2.normalBias = 0.4;
    sh2.bias = -0.0002;
    sh2.radius = 1.5;
    sh2.camera.updateProjectionMatrix();
    // far cascade sees ONLY layer-3 casters (buildings/landmarks, set in
    // assemble): at 2.3m/texel the small casters (trees, cars, props, peds)
    // shade nothing visible but cost a full extra vertex pass over every pool
    sh2.camera.layers.set(3);
    // The far cascade is CACHED: its casters are static buildings, so the depth
    // map is re-rendered only when the snapped target has moved ~24 m, the sun
    // moved, a tile streamed in, or 3 s passed — not every frame. Its shadow
    // matrix is only refreshed when it renders, so lookups stay consistent
    // with the stored depth (see updateSun).
    sh2.autoUpdate = false;
    sh2.needsUpdate = true;
    this._farShadowAt = new THREE.Vector3(1e9, 0, 1e9);
    this._farShadowDir = new THREE.Vector3();
    this._farShadowT = 0;
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.sun2.target = this.sunTarget;
    this.scene.add(this.hemi, this.bounce, this.sun, this.sun2);
    // shadow-pass hooks: the renderer's single shadowMap.render(lights) call is
    // split into the near cascade and the (cached) far cascade so systems can
    // swap in pass-specific caster sets (instancer shadow sets, tree proxies).
    // NOTE three tests casters against the SCENE camera's layers, so the
    // sh2.camera.layers mask above never filtered anything — listeners do.
    this._shadowListeners = [];
    {
      const sm = this.renderer.shadowMap;
      const orig = sm.render.bind(sm);
      const emit = (ph) => { for (const fn of this._shadowListeners) fn(ph); };
      sm.render = (lights, scene, camera) => {
        if (!lights || lights.length === 0) return;
        const near = [], far = [];
        for (const l of lights) (l === this.sun2 ? far : near).push(l);
        if (near.length) { emit('nearBegin'); orig(near, scene, camera); emit('nearEnd'); }
        if (far.length && (this.sun2.shadow.autoUpdate || this.sun2.shadow.needsUpdate)) { emit('farBegin'); orig(far, scene, camera); emit('farEnd'); }
      };
    }

    // auto light probe: an SH-L2 irradiance probe re-captured from a tiny cube
    // render at the camera every ~2.5s and lerped — location-aware ambient
    // (green bounce under trees, warm brick canyons, cool open sky) that flat
    // hemi light can't give. weather.js drives intensity (GFX.probe) and dials
    // hemi down in step so ambient isn't double-counted.
    this.probe = new THREE.LightProbe();
    this.probe.intensity = 0;
    this.scene.add(this.probe);
    this.probeGoal = 1; // desired strength (weather writes GFX.probe here; 0 stops captures)
    // N11: the ambient a capture is never allowed to fall below, as RADIANCE
    // (THREE.Color). sky.js sets it per time-of-day from the street-lighting
    // colour + sky glow; null/black on day and golden, where a dark capture is
    // still a poisoned capture and is still rejected. See _updateProbe.
    this.probeFloor = null;
    this.probeOn = 0; // 0->1 once the first capture lands (weather fades hemi comp with it)
    this._probeHas = false;
    this._probeBusy = false;
    this._probeWarm = N11 ? 0 : 9;   // N11: captures since the last reset (warm-up cadence)
    this._cubeRT = new THREE.WebGLCubeRenderTarget(32, { type: THREE.HalfFloatType });
    this._cubeCam = new THREE.CubeCamera(2, 350, this._cubeRT);

    // post chain: render -> (GTAO) -> bloom -> SMAA -> output -> grade
    this.composer = new EffectComposer(this.renderer);
    this.prepass = new ScenePrePass(this.scene, this.camera);
    this.prepass.needsSwap = true;
    this.composer.addPass(this.prepass);
    this.ssr = new GroundSSRPass(this.camera, this.prepass.rt.depthTexture);
    this.composer.addPass(this.ssr);
    this.ssgi = new SSGIPass(this.camera, this.prepass.rt.depthTexture);
    this.composer.addPass(this.ssgi);
    const q = new URLSearchParams(location.search);
    if (q.get('ao') !== '0') { // works in SwiftShader shots too now (external depth g-buffer)
      // feed the prepass depth as the g-buffer: alpha-cutout foliage renders
      // into it as thin card slivers (the internal normal-pass override
      // material IGNORES alphaTest — leaf cards became solid rectangles and
      // canopy interiors crushed to black occlusion). Also skips GTAO's
      // second full-scene render: normals derive from depth.
      const gtao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      // NOTE: can't pass depthTexture via constructor params — three's
      // setGBuffer external path dereferences this.normalRenderTarget which
      // only exists after the default-path construction. Calling it after
      // works: _renderGBuffer=false, normals derive from depth.
      gtao.setGBuffer(this.prepass.rt.depthTexture);
      gtao.updateGtaoMaterial({ radius: 3.4, distanceExponent: 1.5, thickness: 1.8, scale: 1.15, samples: 16 });
      gtao.blendIntensity = 1.0; // AO softened — pitch-black corners read CG
      // raw GTAO is a dither pattern by design — the built-in Poisson denoiser
      // was running at defaults and compositing most of that noise straight in
      gtao.updatePdMaterial({ lumaPhi: 12, depthPhi: 2.5, normalPhi: 4, radius: 8, rings: 3, samples: 12 });
      this.composer.addPass(gtao);
      this.gtao = gtao; // editor drives blendIntensity
    }
    this.haze = new HazePass(this.camera, this.prepass.rt.depthTexture);
    this.composer.addPass(this.haze);
    this.godrays = new GodraysPass(this.camera, this.prepass.rt.depthTexture);
    this.godrays.enabled = false; // weather.update drives via setSun
    this.composer.addPass(this.godrays);
    // temporal AA integrates the jittered frames; sits on the fully lit HDR
    // frame before motion blur/bloom so those operate on a stable image
    this.taa = new TAAPass(this.camera, this.prepass.rt.depthTexture, innerWidth, innerHeight);
    this.composer.addPass(this.taa);
    this.moblur = new MotionBlurPass(this.camera, this.prepass.rt.depthTexture);
    this.composer.addPass(this.moblur);
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 28, aperture: 0.00004, maxblur: 0.008 });
    this.bokeh.enabled = false; // cinematic DoF — editor toggle
    this.composer.addPass(this.bokeh);
    this.nanGuard = new ShaderPass(NaNGuardShader);   // film 7: see NaNGuardShader
    this.composer.addPass(this.nanGuard);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.45, 1.35);
    this.composer.addPass(this.bloom);
    this.smaa = new SMAAPass(innerWidth, innerHeight);
    this.composer.addPass(this.smaa);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.lut = null; // created lazily by setLUT (Data3DTexture cube grading)
    this._lutCache = new Map();

    // auto-exposure metering: 32x32 log-luminance reduction of the HDR
    // prepass, async readback every 8 frames, exposure drifts toward a
    // mid-gray target (eye adaptation — canyons feel dark, plazas adapt down)
    this.autoExpo = 1;
    this.expoTarget = 0.20; // scene log-average the meter aims at (weather writes GFX.autoExpoTarget)
    this._meterRT = new THREE.WebGLRenderTarget(32, 32);
    this._meterQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      // R = encoded log-luminance, G = 1 for pixels that count. SKY IS EXCLUDED:
      // the sky's HDR radiance runs to the 5.0 clamp in sky.js, so with it in
      // the average a street frame metered as "bright" and, on a canyon frame
      // where the sky is a small slot, as "dark" — the meter was reading the
      // weather, not the subject, and then lifting the whole image toward a
      // mid-grey it should never have been asked to hit.
      uniforms: { tSrc: { value: this.prepass.rt.texture }, tDepthM: { value: this.prepass.rt.depthTexture } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tSrc; uniform sampler2D tDepthM; varying vec2 vUv;
        void main(){
          float l = dot(texture2D(tSrc, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
          float w = 1.0 - step(0.999995, texture2D(tDepthM, vUv).x);
          gl_FragColor = vec4(clamp(log2(l + 1e-4) / 16.0 + 0.5, 0.0, 1.0) * w, w, 0.0, 1.0);
        }`,
    }));
    this._meterBuf = new Uint8Array(32 * 32 * 4);
    this._meterBusy = false;
    this._lastT = performance.now(); // THREE.Clock is deprecated — time frames directly
    this.onFrame = null;
    this.frames = 0;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.grade.uniforms.uTexel.value.set(1 / innerWidth, 1 / innerHeight);
    });
    // IDLE NAP (src/api/bridge.js sets idleNap): a synchronous-mode API server between ticks has nothing moving, so
    // rather than rendering flat out (the next tick's step frame then queued behind an idle frame on the GPU) the loop
    // sleeps idleNap() ms between frames; wake() re-arms it at once when a request needs frames.
    let napT = 0;
    const arm = () => { napT = 0; requestAnimationFrame(loop); };
    this.wake = () => { if (napT) { clearTimeout(napT); arm(); } };
    const loop = () => {
      const nap = this.idleNap ? this.idleNap() : 0;
      if (nap > 0) napT = setTimeout(arm, nap);
      else requestAnimationFrame(loop);
      const now = performance.now();
      const rawDt = (now - this._lastT) / 1000; // unclamped: fps/profiling must see real frame time
      const dt = Math.min(0.05, rawDt);
      this._lastT = now;
      this.rawDt = rawDt;
      this._fpsAcc += rawDt; this._fpsN++;
      if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
      if (this.onFrame) this.onFrame(dt);
      // one frame of simulation without a picture (src/api/bridge.js: a label camera's switch needs the per-camera
      // culls that run in the sim update, not a render)
      if (this.skipDraw) { this.skipDraw = false; return; }
      // N11: WARM-UP CADENCE. Re-capturing every 150 FRAMES is right for tracking a
      // moving camera and wrong for converging on a new sky: a fresh probe starts from
      // whatever the FIRST capture saw (at boot that is the Sky constructor's own
      // apply('day')) and is then lerped away only 40 % per capture. At the 0.4-20 fps
      // a cold page or a loading frame runs at, 150 frames is 7-370 s — which is how
      // the film's v3 dusk/night takes ran on a DAY probe from beginning to end
      // (PROGRESS 2026-09-11 10:40). The first five captures after a reset go every
      // 24 frames instead; 0.6^5 leaves 8 % of the old sky.
      const warmP = (this._probeWarm ?? 9) < 5;
      if ((warmP ? this.frames % 24 === 12 : this.frames % 150 === 40) && !this._probeBusy && this.probeGoal > 0) this._updateProbe();
      if (this._probeHas) this.probeOn = Math.min(1, this.probeOn + dt * 0.7);
      // TAA jitter + deep accumulation ONLY while the camera is (near) still —
      // that is when facade pixelation shows; in motion we drop to a light
      // temporal blend + SMAA, which kills both visible jitter shake and the
      // reprojection ghosting a motion-vector-less TAA cannot avoid
      {
        this._pp = this._pp || new THREE.Vector3();
        this._pq = this._pq || new THREE.Quaternion();
        const dp = this._pp.distanceTo(this.camera.position);
        const dq = 1 - Math.abs(this._pq.dot(this.camera.quaternion));
        this._pp.copy(this.camera.position);
        this._pq.copy(this.camera.quaternion);
        const movingNow = dp > 0.012 || dq > 2.5e-6;
        this._still = Math.max(0, Math.min(1, (this._still ?? 1) + (movingNow ? -0.25 : 0.06)));
        const still = this._still;
        if (this.taa) this.taa.stillBlend = still;
        // capture the jitter-free projection for the TAA reprojection FIRST
        if (this._jittered) this.camera.clearViewOffset();
        if (this.taa) {
          this.taa.unjitProj = this.taa.unjitProj || new THREE.Matrix4();
          this.taa.unjitProjInv = this.taa.unjitProjInv || new THREE.Matrix4();
          this.taa.unjitProj.copy(this.camera.projectionMatrix);
          this.taa.unjitProjInv.copy(this.camera.projectionMatrixInverse);
        }
        if (this.taa && this.taa.amount > 0.01 && still > 0.55) {
          const j = HALTON8[this.frames % 8];
          this.camera.setViewOffset(innerWidth, innerHeight, j[0] * still, j[1] * still, innerWidth, innerHeight);
          this._jittered = true;
        } else this._jittered = false;
      }
      const tr0 = performance.now();
      if (this._sortCamPos) this._sortCamPos.copy(this.camera.position);
      if (this.segRender) {
        // PERCEPTION OUTPUT (?seg=..., src/perception/segRender.js): the seg
        // pass owns the whole frame — flat id/class/depth materials straight to
        // the screen, no composer, so labels carry no AA, bloom or haze.
        this.segRender();
      } else if (this.gtRaw) {
        const tm = this.renderer.toneMapping;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.render(this.scene, this.camera);
        this.renderer.toneMapping = tm;
      } else this.composer.render();
      // TEAR-PROOF CAPTURE (2026-09-17): `engine.capture()` resolves with the canvas read back in the SAME task as the
      // draw above. Playwright's page.screenshot() races the compositor and returned a dark rectangle over most of the
      // canvas on 68 of 3507 film frames (long sim frames: tile stream-ins); a toDataURL here cannot tear because the
      // drawing buffer is only cleared after this task yields.
      if (this._cap) {
        const cap = this._cap; this._cap = null;
        try { cap.res(this.renderer.domElement.toDataURL(cap.type, cap.q)); } catch (e) { cap.rej(e); }
      }
      // RAW GRAB for the external API (src/api/bridge.js): the same same-task read of the frame just drawn, as RGBA
      // bytes in GL row order (bottom-up). Only a beauty frame serves it, never a perception pass.
      if (this._grab && !this.segRender && !this.gtRaw) {
        const g = this._grab; this._grab = null;
        try {
          const gl = this.renderer.getContext();
          const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
          this.renderer.setRenderTarget(null);
          // three's readRenderTargetPixelsAsync (the exposure meter, the light probe) leaves its PIXEL_PACK_BUFFER bound
          // while it waits for its fence, and a readPixels with a pack buffer bound writes THERE, not into px: a black
          // frame about one tick in eight (2026-09-24 release test). It rebinds its own buffer before collecting.
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
          g.res({ px, W, H });
        } catch (e) { g.rej(e); }
      }
      if (this.prof) {
        // CPU submit time of the whole render (shadow passes + composer) and
        // the full frame interval, for window.__PROF()
        this.profRender = this.profRender || { t: 0, f: 0, n: 0 };
        this.profRender.t += performance.now() - tr0;
        this.profRender.f += rawDt * 1000;
        this.profRender.n++;
      }
      if (this.frames % 8 === 3 && !this._meterBusy) this._meterExposure(dt);
      this.frames++;
    };
    loop();
    // see the capture block in the frame loop: one pending request, served by the next rendered frame
    this.capture = (type = 'image/jpeg', q = 0.95) => new Promise((res, rej) => { this._cap = { type, q, res, rej }; });
    // debug/A-B handle: lets a tool read the metered exposure and drive the
    // whole rig (sun, hemi, env, haze, bloom) live from the page
    if (typeof window !== 'undefined') window.__ENGINE = this;
  }
  async _meterExposure() {
    this._meterBusy = true;
    try {
      this._meterQuad.material.uniforms.tSrc.value = this.prepass.rt.texture;
      this._meterQuad.material.uniforms.tDepthM.value = this.prepass.rt.depthTexture;
      const prevRT = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this._meterRT);
      this._meterQuad.render(this.renderer);
      this.renderer.setRenderTarget(prevRT);
      await this.renderer.readRenderTargetPixelsAsync(this._meterRT, 0, 0, 32, 32, this._meterBuf);
      let s = 0, w = 0;
      for (let i = 0; i < 1024; i++) { s += this._meterBuf[i * 4]; w += this._meterBuf[i * 4 + 1] / 255; }
      if (w < 24) { this._meterBusy = false; return; } // almost all sky (aerial straight up): hold
      const avgLogL = (s / w / 255 - 0.5) * 16; // decode (sky-weighted average)
      const avg = Math.pow(2, avgLogL);
      this.meterAvg = avg;
      // Target is a scene log-average, not a target output value. 0.30 sat well
      // above the 0.18 of a photographic grey card and asked a correctly exposed
      // street to go BRIGHTER — that lift is a large part of what reads as veil.
      if (!Number.isFinite(avg)) throw new Error('meter NaN');   // a NaN pixel in the readback must not reach autoExpo
      const want = Math.min(1.35, Math.max(0.70, this.expoTarget / Math.max(avg, 1e-4)));
      this.autoExpo += (want - this.autoExpo) * 0.06; // slow adaptation
    } catch { /* readback unsupported — stays 1 */ }
    this._meterBusy = false;
  }
  async _updateProbe() {
    this._probeBusy = true;
    try {
      this._cubeCam.position.copy(this.camera.position);
      // shadow maps are fresh from the main frame — don't re-render them 6x
      const auto = this.renderer.shadowMap.autoUpdate;
      this.renderer.shadowMap.autoUpdate = false;
      this._cubeCam.update(this.renderer, this.scene);
      this.renderer.shadowMap.autoUpdate = auto;
      const p = await LightProbeGenerator.fromCubeRenderTarget(this.renderer, this._cubeRT);
      // GUARD (film v4, 2026-09-11): one bad capture (a NaN pixel in the cube render, or a capture
      // taken while the scene was mid-load) poisons the SH for the rest of the session — every
      // non-emissive surface goes near-black while the lit windows stay, which is exactly the
      // dusk+rain fWeather take from frame 85 on. Reject non-finite or degenerate captures.
      let shOk = true;
      for (const v of p.sh.coefficients) if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) shOk = false;
      // Luminance floor: film console logs put a day capture at L0 (2.70,4.07,5.78), golden hour at
      // (0.73,0.87,1.02) and the dusk-rain / night captures that blacked out fWeather at (0.03..0.09).
      // A probe that dark REPLACES the hemi ambient (weather.js fades the hemi comp with probeOn) and
      // every non-emissive surface goes near-black. Below 0.3 the hemi ambient carries on instead.
      const c0 = p.sh.coefficients[0];
      const lum0 = 0.2126 * c0.x + 0.7152 * c0.y + 0.0722 * c0.z;
      // N11 (docs/notes/night-r11.md 1.1) — A DARK PROBE IS ALLOWED, A BLACK ONE IS NOT.
      // The luminance floor above is the right guard for a POISONED capture and the wrong
      // one for a genuinely dark scene: it is why dusk and night have run on the flat hemi
      // fallback with no location-aware ambient at all. When the active preset declares a
      // night ambient (`probeFloor`, set by sky.js from the street-lighting colour and the
      // sky glow), a dark-but-FINITE capture is no longer thrown away — it is lifted by an
      // ADDITIVE DC floor, sh = capture + floor:
      //   * additive is monotone, cannot invert the capture or amplify its noise, needs no
      //     division, and is NaN-safe the moment the finite check above has passed;
      //   * SH DC convention: a constant environment of radiance L is coefficients[0] =
      //     L * 2*sqrt(pi) = 3.5449 L (three's shGetIrradianceAt scales c0 by 0.886227,
      //     which returns the correct pi*L irradiance);
      //   * probe.intensity is GFX.probe * probeOn, so the floor is pre-divided by
      //     probeGoal and what reaches the scene is independent of the GI slider.
      // The worst case is therefore "the ambient sky.js designed", never black.
      // NOTHING BELOW WEAKENS THE NaN GUARDS. Non-finite SH and absurd magnitudes still
      // reject, and so does a dark capture under a preset with no floor (day/golden) —
      // that is still the daytime poisoning this guard was written for.
      const pf = N11 && this.probeFloor ? this.probeFloor : null;
      const pfLum = pf ? 0.2126 * pf.r + 0.7152 * pf.g + 0.0722 * pf.b : 0;
      if (!shOk || lum0 > 1e4 || !(lum0 > 0.3 || pfLum > 1e-4)) { console.warn('[gi] light probe capture rejected:', shOk ? 'L0 luminance ' + lum0.toFixed(3) : 'non-finite SH'); throw new Error('probe rejected'); }
      if (pfLum > 1e-4) { // N11: DC floor, scaled so the delivered irradiance is GFX.probe-independent
        const k = 3.5449077 / Math.max(0.2, this.probeGoal || 1);
        c0.x += pf.r * k; c0.y += pf.g * k; c0.z += pf.b * k;
      }
      if (this._probeHas) this.probe.sh.lerp(p.sh, 0.4); else { this.probe.sh.copy(p.sh); console.log('[gi] light probe live, SH L0', p.sh.coefficients[0].toArray().map((v) => v.toFixed(2)).join(',')); }
      this._probeHas = true;
      this._probeWarm = (this._probeWarm ?? 9) + 1;   // N11: leave the warm-up cadence after 5
    } catch (e) { /* capture failed — hemi ambient carries on */ }
    this._probeBusy = false;
  }
  // N11 — a TIME-OF-DAY CHANGE INVALIDATES THE PROBE. The stored SH is a capture of a
  // different sky; lerping 40 % per capture away from it means a `--time night` take
  // opens with the boot-time day ambient and keeps some of it for as long as the
  // convergence takes. sky.apply() calls this, so the next capture REPLACES instead of
  // blending and the warm-up cadence above runs again.
  resetProbe() {
    if (!N11) return;
    this._probeHas = false;
    this.probeOn = 0;
    this._probeWarm = 0;
  }
  async setLUT(name) {
    if (!name || name === 'none') { if (this.lut) this.lut.enabled = false; return; }
    if (!this.lut) {
      const { LUTPass } = await import('three/addons/postprocessing/LUTPass.js');
      this.lut = new LUTPass({ intensity: 0.7 });
      this.composer.addPass(this.lut); // after grade — grades display-referred output
    }
    let t = this._lutCache.get(name);
    if (!t) {
      const { LUTCubeLoader } = await import('three/addons/loaders/LUTCubeLoader.js');
      const r = await new LUTCubeLoader().loadAsync('luts/' + name + '.cube');
      t = r.texture3D;
      this._lutCache.set(name, t);
    }
    this.lut.lut = t;
    this.lut.enabled = true;
  }
  setBloom(night) {
    // soft low-opacity glow on bright surfaces by day (the AAA sheen: sky,
    // sunlit walls, water glints bleed gently), stronger halo glow at night.
    // Threshold lives in LINEAR pre-tonemap space: 0.95 sat below routine
    // daylight values and veiled the whole frame in milk — only genuinely
    // bright pixels (sky, specular, lit glass) may cross it.
    // BLOOM ON OPAQUE SURFACES (critic r5 7.3 / defect #10, mine). At radius
    // 0.45 UnrealBloom's widest mip spreads over a large fraction of the
    // screen, and the analytic sky around the sun runs to a radiance of 5 — so
    // an off-frame sun still painted "a large soft white glow ON the surface of
    // the masonry" in harlem125 and canyon5th, washing ~15 % of the frame and
    // costing blind pair P02 outright. Daylight bloom is a SPECULAR sheen, not
    // an atmosphere: the threshold now sits above every diffuse daylight value
    // so only clipped glass, water glint and the sun's own disc cross it, and
    // the radius is tight enough that the halo stays on the object.
    this.bloom.strength = 0.09 + night * 0.20;
    this.bloom.threshold = 2.30 - night * 1.45;
    this.bloom.radius = 0.26 + night * 0.10;
  }
  // shadow frustum follows the player, snapped to the texel grid IN LIGHT SPACE —
  // world-space snapping leaves subpixel drift, which makes acne crawl during movement
  addShadowListener(fn) { this._shadowListeners.push(fn); }
  updateSun(sunDir, tx, ty, tz) {
    const s = this.sun;
    // near cascade extent + key split follow camera height (nearExtent /
    // shadowMixFor). Rebuilding the ortho projection is only worth it past 5 %.
    {
      const wantN = nearExtent(ty);
      if (Math.abs(wantN - this._S) > this._S * 0.05) {
        this._S = wantN;
        const c = s.shadow.camera;
        c.left = -wantN; c.right = wantN; c.top = wantN; c.bottom = -wantN;
        c.updateProjectionMatrix();
        // the culled caster sets cache the near box's planes and only refresh
        // them when the light MOVES — a resize must invalidate that too or the
        // pools stay compacted to the old, smaller box
        this.shadowBoxV = (this.shadowBoxV || 0) + 1;
      }
      // CS11: hand the near cascade back the share the height ramp took, in
      // proportion to how much of the frame its box actually covers.
      this.shadowMix = shadowMixCover(shadowMixFor(ty), ty, this.camera, this._S);
    }
    // the snap grid MUST be the map's own texel: this read (2*300)/4096 against
    // a 2*190 frustum, so the snap was 1.58 texels and the map crawled by up to
    // a texel every frame instead of standing still
    const texel = (2 * this._S) / s.shadow.mapSize.x;
    // ACNE FROM THE AIR (film 7 review: "widespread z fighting in Columbia buildings" in the golden campus aerial). The
    // near box grows with camera height (nearExtent) but normalBias stayed at the street calibration, 0.06 m = 0.82 of a
    // 7.3 cm texel; at 96 m up a texel is 12.7 cm and a low golden sun grazing the facades drew crawling acne bands over
    // the brick. The bias now keeps the calibrated 0.82 texel at every height (street level unchanged).
    s.shadow.normalBias = Math.max(0.06, 0.82 * texel);
    this._lsUp = this._lsUp || new THREE.Vector3();
    this._lsRight = this._lsRight || new THREE.Vector3();
    this._lsT = this._lsT || new THREE.Vector3();
    const up = Math.abs(sunDir.y) > 0.95 ? this._lsUp.set(1, 0, 0) : this._lsUp.set(0, 1, 0);
    this._lsRight.crossVectors(up, sunDir).normalize();
    this._lsUp.crossVectors(sunDir, this._lsRight).normalize();
    this._lsT.set(tx, ty, tz);
    // project target onto the light's basis, snap there, rebuild the position
    let r = this._lsRight.dot(this._lsT), u = this._lsUp.dot(this._lsT), d = sunDir.dot(this._lsT);
    r = Math.round(r / texel) * texel;
    u = Math.round(u / texel) * texel;
    this.sunTarget.position
      .set(0, 0, 0)
      .addScaledVector(this._lsRight, r)
      .addScaledVector(this._lsUp, u)
      .addScaledVector(sunDir, d);
    s.position.copy(this.sunTarget.position).addScaledVector(sunDir, 700);
    if (this.sun2) {
      const sh2 = this.sun2.shadow;
      // the wide map's extent follows camera height (far2Extent): resolution on
      // the street, coverage from the air. Re-snap the ortho box only when it
      // has to move by more than 5 % — every change rebuilds the projection and
      // invalidates the cached depth map.
      const want = far2Extent(ty);
      if (Math.abs(want - this._S2) > this._S2 * 0.05) {
        this._S2 = want;
        sh2.camera.left = -want; sh2.camera.right = want; sh2.camera.top = want; sh2.camera.bottom = -want;
        sh2.camera.updateProjectionMatrix();
        sh2.needsUpdate = true;
      }
      // own texel snap for the wide map so its edges don't crawl either
      const tex2 = (2 * this._S2) / sh2.mapSize.x;
      sh2.normalBias = Math.max(0.4, 0.6 * tex2);   // same idea for the wide map (0.4 m was set for ~1.1 m street texels)
      const r2 = Math.round(r / tex2) * tex2, u2 = Math.round(u / tex2) * tex2;
      // cached far cascade: only move the light (and re-render the map) when
      // the target drifted far enough, the sun moved, or the cache is stale
      const now = performance.now();
      const moved = Math.hypot(tx - this._farShadowAt.x, tz - this._farShadowAt.z) > 64;
      const sunMoved = this._farShadowDir.dot(sunDir) < 0.99995;
      if (moved || sunMoved || this.sun2.shadow.needsUpdate) {
        this.sun2.position.set(0, 0, 0)
          .addScaledVector(this._lsRight, r2).addScaledVector(this._lsUp, u2)
          .addScaledVector(sunDir, d).addScaledVector(sunDir, 2600);
        this.sun2.shadow.needsUpdate = true;
        this._farShadowAt.set(tx, ty, tz);
        this._farShadowDir.copy(sunDir);
        this._farShadowT = now;
      }
    }
    s.target.updateMatrixWorld();
  }
  // tiles streaming in add casters the cached far map has not seen
  invalidateFarShadow() { if (this.sun2) this.sun2.shadow.needsUpdate = true; }
}
