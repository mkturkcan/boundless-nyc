// VG36 ground (GROUND, docs/notes/ar35-veg.md): the lawn's ground under the blades of world/vg36.js. Called from the ground
// material's onBeforeCompile (world/materials.js makeGroundMaterial); a no-op under `?vg36=0` or `?vg36g=0`.
//
// The lawn's ground is the grass photo set over a pale yellow-green (GR28): a dry, leaf-strewn ground that reads between
// the blades as bare earth and sets the near sward against a straw-coloured floor. Within the blades' reach (fading out
// 38-62 m from the lens, and from 60-110 m of lens height, where the blades are gone) the lawn's ground becomes the
// sward's own floor: the dense, shaded thatch of a turf, a darker and greener colour with the photo's grain kept at a third
// of its swing and a blade-scale grain of its own, the grass normal at 65 % and little sky sheen. Past the blades, to
// ~160 m, part way to a lighter turf with less sheen, so the blades' edge draws no line. Aerials (lens over 110 m) and the
// lawn past ~160 m keep their look.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const ON = Q.get('vg36') !== '0' && Q.get('vg36g') !== '0';
const ANCHOR = 'GND_tn = atex(t_grN, uv, mk).xyz * 2.0 - 1.0; GND_tnW = detG * mix(0.45, 0.8, lawn) * (1.0 - GND_rock);';
// the floor's sheen: three r185 shades with material.specularColorBlended and specularF90, which the ground's own
// `material.specularColor *= GND_spec` (applied after they are set) no longer reaches; under the blades both are scaled here
const SPEC_DECL = 'float GND_spec;', SPEC_INIT = 'GND_paint = 0.0; GND_rock = 0.0; GND_spec = 1.0;', SPEC_USE = 'material.specularColor *= GND_spec;';
let warned = false;
export function vgGroundPatch(sh) {
  if (!ON || !sh || typeof sh.fragmentShader !== 'string') return;
  if (!sh.fragmentShader.includes(ANCHOR)) {
    if (!warned) { warned = true; console.warn('[vg36] the ground shader has changed (no lawn anchor): the turf under the blades is off'); }
    return;
  }
  const fs = sh.fragmentShader;
  const spec = fs.includes(SPEC_DECL) && fs.includes(SPEC_INIT) && fs.includes(SPEC_USE);
  if (spec) {
    // LOOK's GS35 (07:17) carries GND_spec into specularColorBlended by day, so the floor's GND_spec (0.2 under the blades) now
    // reaches it there: this patch then scales only F90 by day, and both where GS35 is off (`?gs35=0`, dusk and night), so the
    // two never stack (0.2 x 0.12 under the blades)
    const gs = /uniform float gs35;/.test(fs) && /material\.specularColorBlended \*= mix\(1\.0, GND_spec, gs35/.test(fs);
    const blend = gs ? 'mix(vgSpecK, 1.0, gs35 * (1.0 - smoothstep(0.0, 0.05, night)))' : 'vgSpecK';
    sh.fragmentShader = fs.replace(SPEC_DECL, SPEC_DECL + ' float vgSpecK;').replace(SPEC_INIT, SPEC_INIT + ' vgSpecK = 1.0;')
      .replace(SPEC_USE, SPEC_USE + `\n        material.specularColorBlended *= ${blend}; material.specularF90 *= vgSpecK;   // VG36 (GROUND): the sward floor`);
  }
  sh.fragmentShader = sh.fragmentShader.replace(ANCHOR, ANCHOR + `
              if (lawn > 0.5) {
                // VG36: the sward's floor under the blades (world/vg36Ground.js)
                float vgD = length(vWPos.xz - cameraPosition.xz);
                float vgH = 1.0 - smoothstep(60.0, 110.0, cameraPosition.y - vWPos.y);
                // the sward's floor under the blades (to ~40 m), then part way to a lighter turf with less sheen out to ~160 m, so
                // the blades' edge draws no line across the lawn (the far lawn itself is left for a far-field pass with LOOK: a
                // golden-hour key, t4Mall, darkened by 8 % with a stronger far term)
                float vgK = (1.0 - smoothstep(38.0, 62.0, vgD)) * vgH;
                float vgF = 0.45 * (1.0 - smoothstep(62.0, 160.0, vgD)) * vgH;
                if (max(vgK, vgF) > 0.002) {
                  float vgL = dot(albedo, vec3(0.30, 0.59, 0.11));
                  float vgG = clamp(vgL / 0.19, 0.55, 1.6);                         // the photo grain's swing, relative
                  float vgM = fbm(vWPos.xz * 0.21 + 7.0), vgS = vnoise(vWPos.xz * 2.3 + 3.0);
                  vec3 turf = mix(vec3(0.047, 0.104, 0.024), vec3(0.067, 0.137, 0.031), vgM) * vec3(1.33, 1.45, 1.62);   // (session 2: x1.5 lighter than session 1, a little yellower; session 3: x1.45 to the sunny photographs, less red)
                  turf = mix(turf, vec3(0.096, 0.104, 0.040), smoothstep(0.62, 0.9, fbm(vWPos.xz * 0.055 + 17.0)) * 0.5);   // the dry patches
                  // the photo's leaf-litter grain at a third (it read as soil between the blades), and the sward's own grain:
                  // blade-scale streaks and specks, faded by the pixel's footprint so they never alias
                  float vgFw = smoothstep(0.06, 0.012, fw);
                  float vgB = vnoise(vec2(dot(vWPos.xz, vec2(0.8744, 0.4853)) * 9.0, dot(vWPos.xz, vec2(-0.4853, 0.8744)) * 23.0) + 5.0);
                  turf *= mix(1.0, vgG, 0.35) * (0.84 + 0.32 * vgS) * mix(1.0, 0.72 + 0.56 * vgB, vgFw * 0.8);
                  albedo = mix(albedo, mix(turf * 1.25, turf, vgK), max(vgK * 0.85, vgF));
                  GND_tnW *= 1.0 - 0.35 * vgK;
                  GND_rough = mix(GND_rough, 0.95, vgK);
                  GND_spec = mix(GND_spec, 0.2, vgK);   // the blades hide the sky from the sward's floor: little sheen
                  ${spec ? 'vgSpecK = mix(1.0, 0.12, vgK) * mix(1.0, 0.75, vgF / 0.45);' : ''}
                }
              }`);
}
