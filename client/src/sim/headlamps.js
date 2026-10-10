// HL24 — vehicle headlamp beams (owner 2026-09-24: "The headlights showing transparent circles on the ground at night
// looks really silly and basic; replace with proper high quality headlights").
//
// Every THREE.SpotLight in this app is a car's headlamp pair (sim/carlights.js owns them; nothing else creates spot
// lights). This module rewrites three's spot evaluation, at module scope before any material compiles, so that inside
// the cone the light follows a LOW-BEAM PHOTOMETRIC PATTERN instead of three's round cone:
//   * a sharp horizontal cut-off 0.57 deg below the horizon on the oncoming (left) side,
//   * the 15 deg step that lifts the cut-off to about +1 deg on the kerb (right) side, from the elbow on the axis,
//   * a hot spot 1-2 deg down and 2 deg right, where the beam reaches the road 15-40 m ahead,
//   * a broad, dimmer spread (about +-25 deg) that lights the near road, the kerbs and the pavement edge,
//   * a faint glare fringe above the cut-off.
// Angles are taken in the lamp's own frame (beam axis, world up), so the pattern stays level on any street. The
// ground term is then carried by three's own BRDF: cosine incidence and inverse-square falloff give the long,
// sharp-ended wedge a real low beam draws on asphalt, and walls, kerbs, cars and people in the beam are lit, with
// their specular on wet roads. The cut-off is measured from the horizon, and carlights.js aims each axis AIM_RAD
// below it. `?hl24=0` keeps three's round cone.
import * as THREE from 'three';

export const HL24 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hl24') === '0');
export const AIM_RAD = 0.021;   // the beam axis sits 1.2 deg below the horizon (the aim a headlamp is set to)

const BEAM_GLSL = /* glsl */ `
	// HL24 low-beam intensity factor, 1 at the hot spot: th = horizontal angle right of the axis, tvH = vertical angle
	// from the HORIZON (rad). Fitted to a typical ECE low-beam isocandela chart: (0, -2 deg) ~0.6-0.85, (+-10, -2) ~0.3,
	// (+-20, -2) ~0.1, (0, -4) ~0.3, (0, -10) ~0.05, (+-30, -6) ~0.05, above the cut-off ~0.015.
	float hl24Beam( float th, float tvH ) {
		float cut = -0.0100 + clamp( th, 0.0, 0.103 ) * 0.268;               // -0.57 deg left, the 15 deg step to +1 deg right
		float below = smoothstep( cut + 0.0045, cut - 0.0035, tvH );          // the sharp cut-off
		float hx = ( th - 0.030 ) / 0.070, hy = ( tvH + 0.022 ) / 0.014;
		float hot = exp( -( hx * hx + hy * hy ) );                           // hot spot: 1.7 deg right, 1.3 deg down
		float mx = th / 0.22, my = ( tvH + 0.035 ) / 0.035;
		float mid = 0.35 * exp( -( mx * mx + my * my ) );                     // the +-13 deg band 2 deg down
		float wx = th / 0.45, wy = ( tvH + 0.070 ) / 0.060;
		float wide = 0.14 * exp( -( wx * wx + wy * wy ) );                    // the +-26 deg spread 4 deg down
		float nx = th / 0.70;
		float nearF = 0.04 * exp( -( nx * nx ) ) * smoothstep( -0.50, -0.10, tvH );   // the near road and kerbs
		return below * ( hot + mid + wide + nearF ) + ( 1.0 - below ) * 0.015 * exp( -( wx * wx ) );
	}
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		float lightDistance = length( lVector );
		light.direction = lVector / max( lightDistance, 1e-4 );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 && lightDistance < spotLight.distance ) {
			vec3 F = -spotLight.direction;                                       // beam axis, lamp -> target (view space)
			vec3 Wup = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
			vec3 R = normalize( cross( F, Wup ) );
			vec3 U = cross( R, F );
			vec3 D = -light.direction;                                           // lamp -> surface
			float fz = max( dot( D, F ), 1e-3 );
			float th = atan( dot( D, R ), fz );
			float tvH = atan( dot( D, U ), fz ) - ${AIM_RAD.toFixed(4)};
			light.color = spotLight.color * ( spotAttenuation * hl24Beam( th, tvH ) );
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
`;

if (HL24) {
  const src = THREE.ShaderChunk.lights_pars_begin;
  const a = src.indexOf('void getSpotLightInfo(');
  const b = a >= 0 ? src.indexOf('#endif', a) : -1;
  if (a > 0 && b > a) {
    // drop the light's own comment line with it, keep the struct and uniform declarations above
    THREE.ShaderChunk.lights_pars_begin = src.slice(0, a) + BEAM_GLSL + '\n' + src.slice(b);
  } else console.warn('[hl24] three changed getSpotLightInfo; headlamps keep the round cone');
}
