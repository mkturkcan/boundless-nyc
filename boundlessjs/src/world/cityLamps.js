// CL24 — street lighting as real lights (owner 2026-09-25: "Fix streetlights, I hate this transparent ellipse effect
// it's horrible. Improve/replace every such effect wherever they might be").
//
// A street lamp used to be three fakes: an additive ellipse laid on the asphalt (the "light pool"), a wide soft disc
// billboarded round the lamp head, and, for the nearest 24 poles only, a round point light. This module replaces all
// three with luminaires that light the city the way a real one does. Every lit material in the scene (ground, facades,
// dressed buildings, furniture, trees, vehicles and pedestrians) evaluates the CL_N most relevant street lamps through
// three's own BRDF, so a pool on the road is the light's falloff, a wet road carries its specular streak, a wall is lit
// on the lamp side, and a car under a lamp shows the lamp on its paint. The lamp head itself glows through the
// furniture kit's emissive lens geometry and the bloom pass.
//
// PHOTOMETRY. A NYC cobrahead is a full-cut-off Type II luminaire: no light above the horizontal, its peak candela about
// 65-70 deg from nadir along the street and nearer 50 deg across it, and much less behind the pole. `cl24Throw()`
// reproduces that shape; the pool it draws is long along the street and soft-edged, not a disc. A Bishop's Crook
// teardrop throws symmetrically. Colours and candela come from night11.js FIXTURES.
//
// DATA PATH. Lamp positions are WORLD-space uniforms, and the shader brings the fragment into world space once, so the
// same data is right for every camera that renders (the main view, API sensors, the reflection and probe cameras).
// The uniform values are flat Float32Arrays: three's cloneUniforms() shares a typed array by reference, so one write
// here reaches every material program. `?cl24=0` restores the decal pools and the 24 point lights.
import * as THREE from 'three';
import { lampSpots } from './life.js';
import { fixtureOf, fixtureColor } from './night11.js';

export const CL24 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cl24') === '0');
export const CL_N = 64;
const P = new Float32Array(CL_N * 4);   // xyz luminaire (world), w range (m)
const C = new Float32Array(CL_N * 4);   // rgb linear colour x candela, w arm yaw (rad) or 99 for a symmetric post top
const M = new Float32Array(4);          // x count, y peak shift (cos), z lobe width, w nadir floor

const PARS = /* glsl */ `
uniform vec4 cityLampP[ ${CL_N} ];
uniform vec4 cityLampC[ ${CL_N} ];
uniform vec4 cityLampM;
// relative intensity towards world direction D (lamp -> surface) for a luminaire whose arm points along yaw
float cl24Throw( vec3 D, float yaw ) {
	float c = -D.y;                                   // cos of the angle from nadir
	if ( c <= 0.0 ) return 0.0;                       // full cut-off
	float c0 = 0.45 + cityLampM.y, back = 1.0;
	if ( yaw < 50.0 ) {
		vec2 h = D.xz;
		float hl = length( h );
		vec2 arm = vec2( sin( yaw ), cos( yaw ) );
		float wa = hl > 1e-4 ? dot( h / hl, arm ) : 0.0;      // +1 over the street, -1 behind the pole
		c0 = mix( 0.60, 0.36, 1.0 - wa * wa ) + cityLampM.y;   // peak ~53 deg across the street, ~69 deg along it
		back = mix( 1.0, 0.42, smoothstep( 0.0, -0.85, wa ) );
	}
	float x = ( c - c0 ) / cityLampM.z;
	return smoothstep( 0.0, 0.2, c ) * ( cityLampM.w + ( 1.0 - cityLampM.w ) * exp( - x * x ) ) * back;
}`;

// CL26 (boot profile 2026-09-25): the loop doubled every lit program's compile, day or night. It is compiled in only when the
// scene has spot lights, which happens exactly when the lamps are on: the headlamps (carlights.js) and this module's
// sentinel spot switch on together at night 0.06, so the day programs are lamp-free and the dusk switch recompiles once,
// as it already did for the headlamps. `?cl26=0` keeps the loop in every program.
const CL26 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cl26') === '0');
export const LAMPS_ON = 0.06;   // night level at which the street lamps (and the headlamps) switch on
const LOOP = /* glsl */ `
#if defined( RE_Direct )${CL26 ? ' && ( NUM_SPOT_LIGHTS > 0 )' : ''}
{
	int clN = int( cityLampM.x + 0.5 );
	if ( clN > 0 ) {
		mat3 clR = mat3( viewMatrix );
		vec3 clW = transpose( clR ) * ( geometryPosition - viewMatrix[ 3 ].xyz );   // this fragment in world space
		for ( int i = 0; i < clN; i ++ ) {
			vec4 lp = cityLampP[ i ];
			vec3 lw = lp.xyz - clW;
			float d2 = dot( lw, lw );
			if ( d2 >= lp.w * lp.w ) continue;
			float d = sqrt( d2 );
			vec3 Lw = lw / max( d, 1e-4 );
			vec4 lc = cityLampC[ i ];
			float f = cl24Throw( -Lw, lc.w );
			if ( f <= 0.0 ) continue;
			directLight.direction = clR * Lw;
			directLight.color = lc.rgb * ( f * getDistanceAttenuation( d, lp.w, 2.0 ) );
			directLight.visible = true;
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
	}
}
#endif
`;

if (CL24) {
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin + '\n' + PARS + '\n';
  const lf = THREE.ShaderChunk.lights_fragment_begin;
  const at = lf.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  if (at > 0) THREE.ShaderChunk.lights_fragment_begin = lf.slice(0, at) + LOOP + '\n' + lf.slice(at);
  else console.warn('[cl24] three changed lights_fragment_begin; street lamps fall back to no lighting');
  // every built-in lit shader gets the three uniforms, bound to the SAME typed arrays (cloneUniforms shares them)
  for (const id of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    const sh = THREE.ShaderLib[id];
    if (!sh) continue;
    sh.uniforms.cityLampP = { value: P };
    sh.uniforms.cityLampC = { value: C };
    sh.uniforms.cityLampM = { value: M };
  }
}

// ---------------------------------------------------------------- selection
// The CL_N lamps that matter for this frame: every luminaire whose light sphere touches the view frustum comes first,
// nearest first, then the rest by distance (they still light what the camera sees near its own position). Re-chosen
// every 0.25 s or on a big camera move; written every frame so intensity follows `night` smoothly.
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere();
const TAKE_R2 = 520 * 520;
// candela at the throw peak per fixture candela. night11's `cd` was the whole round point light; the throw above puts
// 0.16 of the peak at nadir, so the peak carries more to leave the street as bright on average and far more even
const PEAK_K = 3.0;   // live: window.__LAMPS.gain (tuned on W 122nd St and 125th St, 2026-09-25)

export class CityLamps {
  constructor() {
    this.sel = [];
    this._acc = 1;
    this._cam = new THREE.Vector3(1e9, 0, 0);
    this._seen = new Map();          // dedupe: props.js registers a pole again every time its tile is claimed
    this._n = 0;
    this.gain = PEAK_K;
    this.shape = [0.2, 0.17, 0.33];   // live: peak shift (cos), lobe width, nadir floor: pools that read, soft edges
  }
  _dedupe() {
    // lampSpots only ever grows; index new entries by a 0.5 m key so a re-claimed pole is one lamp
    for (let i = this._n; i < lampSpots.length; i++) {
      const s = lampSpots[i];
      const k = Math.round(s[0] * 2) + ',' + Math.round(s[2] * 2);
      if (!this._seen.has(k)) this._seen.set(k, s);
    }
    this._n = lampSpots.length;
  }
  update(camera, night, dt = 0.016, engine = null) {
    if (!CL24) return;
    // the uniform warm street bounce stood in for EVERY lamp; near the ground the real lamps now carry most of it, from
    // the air only the CL_N selected ones do, so the stand-in keeps more of its level as the camera climbs
    if (engine) { const a = camera.position.y; const t = Math.min(1, Math.max(0, (a - 30) / 150)); engine.lampBounceK = 0.35 + (0.9 - 0.35) * t * t * (3 - 2 * t); }
    // CL26: the sentinel spot keeps NUM_SPOT_LIGHTS > 0 while the lamps are on, with or without traffic (zero intensity,
    // out of range: getSpotLightInfo returns black at once)
    if (engine && !this._sentinel) {
      const L = new THREE.SpotLight(0x000000, 0, 0.01, 0.1);
      L.position.set(0, -9000, 0); L.target.position.set(0, -9001, 0); L.castShadow = false; L.name = 'cl26Sentinel';
      L.visible = false;
      engine.scene.add(L); engine.scene.add(L.target);
      this._sentinel = L;
    }
    if (this._sentinel) this._sentinel.visible = CL26 && night >= LAMPS_ON;
    if (night < (CL26 ? LAMPS_ON : 0.04)) { M[0] = 0; return; }
    this._dedupe();
    this._acc += dt;
    const cp = camera.position;
    if (this._acc > 0.25 || cp.distanceToSquared(this._cam) > 400) {
      this._acc = 0;
      this._cam.copy(cp);
      camera.updateMatrixWorld();
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _fr.setFromProjectionMatrix(_pm);
      const cand = [];
      for (const s of this._seen.values()) {
        const dx = s[0] - cp.x, dz = s[2] - cp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > TAKE_R2) continue;
        const F = fixtureOf(s[3] ?? -1);
        _sp.center.set(s[0], s[1] + (s[4] ?? 8.2), s[2]);
        _sp.radius = F.range;
        cand.push({ s, k: (_fr.intersectsSphere(_sp) ? 0 : 1e7) + d2 });
      }
      cand.sort((a, b) => a.k - b.k);
      this.sel = cand.slice(0, CL_N).map((c) => c.s);
    }
    let n = 0;
    for (const s of this.sel) {
      const F = fixtureOf(s[3] ?? -1), FC = fixtureColor(s[3] ?? -1);
      const o = n * 4;
      P[o] = s[0]; P[o + 1] = s[1] + (s[4] ?? 8.2); P[o + 2] = s[2]; P[o + 3] = F.range;
      const I = F.cd * this.gain * night;
      C[o] = FC.r * I; C[o + 1] = FC.g * I; C[o + 2] = FC.b * I;
      C[o + 3] = s[5] === undefined || s[5] === null ? 99 : s[5];
      n++;
    }
    M[0] = n; M[1] = this.shape[0]; M[2] = this.shape[1]; M[3] = this.shape[2];
  }
  stats() { return { lamps: this._seen.size, selected: this.sel.length, n: M[0] }; }
}
