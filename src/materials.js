// Material library. Every material carries userData.tileMeters so geometry
// builders can UV-map in true world units. All facade materials accept vertex
// colors (merged batches) and instance colors (instanced batches) for tinting.
import * as THREE from 'three';
import {
  brickTexture, brownstoneTexture, stoneTexture, stuccoTexture, sidewalkTexture,
  asphaltTexture, roofTexture, corrugatedTexture, sidingTexture, woodStaveTexture,
  signAtlas, awningAtlas, canopyTexture, radialGlowTexture, fillerFacadeTexture,
  streetSignAtlas, STREET_SIGNS, grimeStreakTexture, waterNormalTexture, grungeTexture, barkTexture,
} from './textures.js';

export function createMaterials() {
  const M = new Map();
  const extra = {};

  // Global per-instance detail layer: a world-space grunge mask (7 m period,
  // triplanar) multiplied into every opaque albedo at ±17%. One albedo + one
  // roughness per material read as a repeated tile under one sun; this breaks
  // the repeat on brick, stone, asphalt and concrete at once.
  const grunge = grungeTexture();
  function grungeHook(shader) {
    shader.uniforms.grungeMap = { value: grunge.map };
    // normal-weighted triplanar: horizontal surfaces take the top-down
    // projection (the side projections streak along a road's long axis)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrungeP;\nvarying vec3 vGrungeN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 gp = vec4(transformed, 1.0);\n vec3 gn = objectNormal;\n#ifdef USE_INSTANCING\n gp = instanceMatrix * gp;\n gn = mat3(instanceMatrix) * gn;\n#endif\n vGrungeP = (modelMatrix * gp).xyz;\n vGrungeN = normalize(mat3(modelMatrix) * gn); }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D grungeMap;\nvarying vec3 vGrungeP;\nvarying vec3 vGrungeN;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec3 gw = abs(vGrungeN); gw /= max(0.001, gw.x + gw.y + gw.z);\n float ga = texture2D(grungeMap, vGrungeP.xy * 0.143).r;\n float gb = texture2D(grungeMap, vGrungeP.zy * 0.143 + vec2(0.37, 0.61)).r;\n float gc = texture2D(grungeMap, vGrungeP.xz * 0.143 + vec2(0.71, 0.13)).r;\n float g = ga * gw.z + gb * gw.x + gc * gw.y;\n float ha = texture2D(grungeMap, vGrungeP.xy * 0.031 + vec2(0.23, 0.47)).r;\n float hb = texture2D(grungeMap, vGrungeP.zy * 0.031 + vec2(0.59, 0.11)).r;\n float hc = texture2D(grungeMap, vGrungeP.xz * 0.031 + vec2(0.83, 0.29)).r;\n float h2 = ha * gw.z + hb * gw.x + hc * gw.y;\n g = mix(g, h2, 0.30);\n float k3 = texture2D(grungeMap, vGrungeP.xz * 0.008 + vGrungeP.yy * 0.003 + vec2(0.41, 0.77)).r;\n g = mix(g, k3, 0.55);\n diffuseColor.rgb *= 1.0 + (g - 0.5) * 0.70; }');
  }
  function std(name, opts, tileMeters = 2, more = {}) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, dithering: true, ...opts });
    mat.userData.tileMeters = tileMeters;
    Object.assign(mat, more);
    mat.name = name;
    mat.onBeforeCompile = grungeHook;
    mat.customProgramCacheKey = () => 'grunge1';
    M.set(name, mat);
    return mat;
  }

  // ---- masonry -------------------------------------------------------------
  const bRed = brickTexture({ hue: 9, sat: 33, light: 34, seed: 21 });
  std('brickRed', { map: bRed.map, bumpMap: bRed.bumpMap, bumpScale: 1.2, roughness: 0.92, envMapIntensity: 0.55 }, bRed.tileMeters);

  const bOrange = brickTexture({ hue: 18, sat: 34, light: 42, mortar: '#a89f92', seed: 22 });
  std('brickOrange', { map: bOrange.map, bumpMap: bOrange.bumpMap, bumpScale: 1.2, roughness: 0.92, envMapIntensity: 0.55 }, bOrange.tileMeters);

  const bTan = brickTexture({ hue: 34, sat: 30, light: 56, dh: 6, dl: 8, mortar: '#b0a898', darkBrickChance: 0.03, seed: 23 });
  std('brickTan', { map: bTan.map, bumpMap: bTan.bumpMap, bumpScale: 1.1, roughness: 0.9, envMapIntensity: 0.55 }, bTan.tileMeters);

  const bBrown = brickTexture({ hue: 12, sat: 30, light: 26, dh: 5, dl: 7, mortar: '#8a8178', darkBrickChance: 0.1, seed: 24 });
  std('brickBrown', { map: bBrown.map, bumpMap: bBrown.bumpMap, bumpScale: 1.2, roughness: 0.93, envMapIntensity: 0.5 }, bBrown.tileMeters);

  const bNycha = brickTexture({ hue: 10, sat: 32, light: 31, dh: 4, ds: 8, dl: 6, mortar: '#93897d', darkBrickChance: 0.04, seed: 25 });
  std('brickNycha', { map: bNycha.map, bumpMap: bNycha.bumpMap, bumpScale: 1.1, roughness: 0.94, envMapIntensity: 0.5 }, bNycha.tileMeters);

  const bWhite = brickTexture({ hue: 40, sat: 12, light: 55, paint: 'rgba(226,220,206,0.9)', seed: 26 });
  std('brickPaintedCream', { map: bWhite.map, bumpMap: bWhite.bumpMap, bumpScale: 1.0, roughness: 0.85, envMapIntensity: 0.55 }, bWhite.tileMeters);

  const bGray = brickTexture({ hue: 30, sat: 8, light: 42, paint: 'rgba(126,124,120,0.9)', seed: 27 });
  std('brickPaintedGray', { map: bGray.map, bumpMap: bGray.bumpMap, bumpScale: 1.0, roughness: 0.85, envMapIntensity: 0.55 }, bGray.tileMeters);

  const bPRed = brickTexture({ hue: 8, sat: 40, light: 30, paint: 'rgba(112,44,36,0.88)', seed: 28 });
  std('brickPaintedRed', { map: bPRed.map, bumpMap: bPRed.bumpMap, bumpScale: 1.0, roughness: 0.88, envMapIntensity: 0.5 }, bPRed.tileMeters);

  const brown = brownstoneTexture({ seed: 31 });
  std('brownstone', { map: brown.map, roughness: 0.9, envMapIntensity: 0.5 }, brown.tileMeters);

  const brownD = brownstoneTexture({ hue: 14, sat: 22, light: 24, seed: 32 });
  std('brownstoneDark', { map: brownD.map, roughness: 0.92, envMapIntensity: 0.45 }, brownD.tileMeters);

  const lime = stoneTexture({ base: '#cdc4b3', seed: 33 });
  std('limestone', { map: lime.map, roughness: 0.85, envMapIntensity: 0.6 }, lime.tileMeters);

  const granite = stoneTexture({ base: '#8f8b84', blockW: 1.0, blockH: 0.45, weather: 0.16, seed: 34 });
  std('graniteBase', { map: granite.map, roughness: 0.8, envMapIntensity: 0.6 }, granite.tileMeters);

  const terra = stoneTexture({ base: '#c8a87e', blockW: 0.6, blockH: 0.3, weather: 0.08, seed: 35 });
  std('terracotta', { map: terra.map, roughness: 0.75, envMapIntensity: 0.65 }, terra.tileMeters);

  const stu = stuccoTexture({ base: '#b9b2a4', seed: 36 });
  std('stucco', { map: stu.map, roughness: 0.9, envMapIntensity: 0.5 }, stu.tileMeters);

  const conc = stuccoTexture({ base: '#a5a3a0', blotch: 0.18, seed: 37 });
  std('concrete', { map: conc.map, roughness: 0.88, envMapIntensity: 0.5 }, conc.tileMeters);

  const sid = sidingTexture({ seed: 38 });
  std('siding', { map: sid.map, roughness: 0.72, envMapIntensity: 0.6 }, sid.tileMeters);

  const filler = fillerFacadeTexture({});
  std('fillerFacade', {
    map: filler.map, bumpMap: filler.bumpMap, bumpScale: 2.5, roughness: 0.9, envMapIntensity: 0.5,
    emissiveMap: filler.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0,   // main.js raises at night
  }, filler.tileMeters);
  std('roofGravel', { color: 0x8d8a82, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.35 }, 1);
  std('castIron', { color: 0x3a3835, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.6 }, 1);

  // ---- trim / metal / wood -------------------------------------------------
  std('cornicePaint', { color: 0xbdb9b0, roughness: 0.78, metalness: 0.04, envMapIntensity: 0.5 }, 1);
  std('windowFrame', { color: 0xbdb9b0, roughness: 0.62, metalness: 0.04, envMapIntensity: 0.6 }, 1);
  std('ironwork', { color: 0x1f1e1c, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.9 }, 1);
  std('steelDark', { color: 0x3a3d40, roughness: 0.45, metalness: 0.85, envMapIntensity: 1.0 }, 1);
  std('aluminum', { color: 0xb8bcc0, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 }, 1);
  std('paintFlat', { color: 0xf2eee4, roughness: 0.55, metalness: 0.08, envMapIntensity: 0.7 }, 1);
  // UNLIT room fill for window interiors/shades: an interior seen through glass
  // must not be raked by the exterior sun (lit dark cards read as pale slabs)
  {
    const rf = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    rf.name = 'roomFill'; rf.userData.tileMeters = 1; M.set('roomFill', rf);
    // storefront interiors: same unlit fill, but main.js keeps it bright at night
    const sf = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    sf.name = 'shopFill'; sf.userData.tileMeters = 1; M.set('shopFill', sf);
  }
  // truly matte fabric/canvas/matte-paint: specular can never outweigh diffuse
  std('canvasFlat', { color: 0xf2eee4, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.2 }, 1);
  std('doorPaint', { color: 0xf2eee4, roughness: 0.64, metalness: 0.04, envMapIntensity: 0.55 }, 1);

  const stave = woodStaveTexture({ seed: 41 });
  std('woodStave', { map: stave.map, roughness: 0.85, envMapIntensity: 0.5 }, stave.tileMeters);

  // ---- glass ---------------------------------------------------------------
  // dielectric physical glass: true Fresnel — weak reflection head-on (room
  // tone shows through), strong sky reflection at grazing angles
  {
    const g = new THREE.MeshPhysicalMaterial({
      vertexColors: true, color: 0x2f363e, roughness: 0.22, metalness: 0.0,
      // base 1.0: main.js divides by scene envI (clamp 14) so EFFECTIVE
      // reflectance is exactly physical in every preset
      envMapIntensity: 1.0, transparent: true, opacity: 0.42, depthWrite: false,
      reflectivity: 0.78, specularIntensity: 1.0, ior: 1.52,
      // (clearcoat dropped: with every pane in the city on this material it
      // cost ~25% of frame time for no visible gain at street distance)
    });
    g.name = 'glass'; g.userData.tileMeters = 1;
    g.userData.envNormalize = true;   // main.js divides envMapIntensity by T.envI
    M.set('glass', g);
    // Unify glazing: building modules guard their private glass materials with
    // `if (!M.has(name))`, so pre-registering these names as aliases of the
    // shared physical glass routes every pane through one Fresnel model.
    for (const alias of ['loft:glassInd', 'tenement:glass', 'castiron:glassWin', 'castiron:glassBig']) {
      M.set(alias, g);
    }
  }
  std('glassCurtain', {
    color: 0x4a606c, roughness: 0.18, metalness: 0.65, envMapIntensity: 1.05,   // curtain wall: not a flat mint mirror
  }, 1);
  std('spandrel', { color: 0x232d33, roughness: 0.25, metalness: 0.7, envMapIntensity: 1.0 }, 1);
  // capped so near-camera lit panes don't clip to a white slab (tones + bloom do the work)
  const lit = new THREE.MeshBasicMaterial({ color: 0xb08a5c, vertexColors: true });
  lit.name = 'litWindow'; lit.userData.tileMeters = 1; M.set('litWindow', lit);

  // ---- roofs / ground ------------------------------------------------------
  const roofS = roofTexture({ silver: true, seed: 43 });
  std('roofSilver', { map: roofS.map, roughness: 0.75, metalness: 0.15, envMapIntensity: 0.6 }, roofS.tileMeters);
  const roofB = roofTexture({ silver: false, seed: 44 });
  std('roofBlack', { map: roofB.map, roughness: 0.88, envMapIntensity: 0.95 }, roofB.tileMeters);

  const walk = sidewalkTexture({ seed: 45 });
  std('sidewalk', { map: walk.map, bumpMap: walk.bumpMap, bumpScale: 1.6, roughness: 0.93, envMapIntensity: 0.5 }, walk.tileMeters);
  const asp = asphaltTexture({ seed: 46 });
  std('asphalt', { map: asp.map, bumpMap: asp.bumpMap, bumpScale: 2.0, roughnessMap: asp.roughMap, roughness: 0.78, envMapIntensity: 1.1 }, asp.tileMeters);
  std('asphaltPolish', { map: asp.map, bumpMap: asp.bumpMap, bumpScale: 1.0, roughness: 0.36, envMapIntensity: 1.5 }, asp.tileMeters);   // tyre-polished lane bands
  std('roadPaint', { color: 0xd8d5cc, roughness: 0.9, envMapIntensity: 0.4 }, 1);
  std('soil', { color: 0x3d3229, roughness: 1.0, envMapIntensity: 0.3 }, 1);

  // ---- gates / storefront extras --------------------------------------------
  const gate = corrugatedTexture({ seed: 47 });
  std('rollGate', { map: gate.map, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.8 }, gate.tileMeters);
  const gateG = corrugatedTexture({ seed: 48, graffiti: true, base: '#87898b' });
  std('rollGateTagged', { map: gateG.map, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.8 }, gateG.tileMeters);

  const signs = signAtlas();
  extra.signUvFor = signs.uvFor;
  extra.signCount = signs.count;
  std('signs', { map: signs.map, emissiveMap: signs.map, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6 }, 1);

  const awn = awningAtlas();
  extra.awningUvFor = awn.uvFor;
  extra.awningCount = awn.count;

  const ssigns = streetSignAtlas();
  extra.streetSignUvFor = ssigns.uvFor;
  extra.streetSignIndex = (name) => STREET_SIGNS.indexOf(name);
  std('streetSigns', {
    map: ssigns.map, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.8,
    side: THREE.DoubleSide, alphaTest: 0.05, transparent: false,
  }, 1);
  std('awning', { map: awn.map, roughness: 0.9, envMapIntensity: 0.5, side: THREE.DoubleSide }, 1);

  // ---- world context ---------------------------------------------------------
  // distant massing gets internal structure: faint window speckle + gradient
  const skyTex = fillerFacadeTexture({ seed: 91, base: '#8d8f96' });
  std('skyline', { map: skyTex.map, color: 0x5d6b7d, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.3 }, skyTex.tileMeters);
  std('groundDark', { color: 0x3a3d3f, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.3 }, 1);   // fogs toward city tone, not a void
  // sidewalk scatter decal (stains, gum, litter): a dark translucent quad
  std('walkStain', { color: 0x3a3632, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3, transparent: true, opacity: 0.35, depthWrite: false }, 1, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  {
    // river water: static dual-octave wave normal map (renders are stills),
    // horizon ramp comes from vertex colors laid down in city.js
    const wn = waterNormalTexture({});
    // calm-mirror river: any tiled normal map aliases into moiré at grazing
    // angles from a 30m camera, so the surface is smooth and the depth read
    // comes from the vertex-color ramp + sky reflection
    // the Preetham horizon is HDR-bright (radiance >> 1): at a 3° grazing angle
    // Fresnel reflects it fully, so env must be an order of magnitude lower than
    // for facades or the river reads as pale fog
    std('water', {
      color: 0xffffff, roughness: 0.14, metalness: 0.0, envMapIntensity: 0.25,
      normalMap: wn.map, normalScale: new THREE.Vector2(0.55, 0.55),   // wind chop breaks the mirror
      fog: false,
    }, wn.tileMeters);
  }
  // weathered galvanized tank steel: panel seams, daylight albedo ≈ #949a9d
  const galv = corrugatedTexture({ seed: 63, base: '#8f9498' });
  std('steelBlack', { map: galv.map, color: 0xffffff, roughness: 0.62, metalness: 0.15, envMapIntensity: 1.6 }, 0.6);

  // ---- street objects --------------------------------------------------------
  std('carPaint', { color: 0xffffff, roughness: 0.4, metalness: 0.55, envMapIntensity: 0.95 }, 1);
  std('trashBag', { color: 0x17181a, roughness: 0.32, metalness: 0.12, envMapIntensity: 0.8 }, 1);

  // ---- night ------------------------------------------------------------------
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffd9a4, vertexColors: true });
  lampGlow.name = 'lampGlow'; lampGlow.userData.tileMeters = 1; M.set('lampGlow', lampGlow);
  {
    // MULTIPLY-blended so the streak darkens whatever is behind it instead of
    // being re-lit by the sun (a lit dark quad over bright brick barely reads)
    const gs = grimeStreakTexture({});
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, map: gs.map, transparent: true, opacity: 0.7,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    m.name = 'grimeStreak'; m.userData.tileMeters = 1; M.set('grimeStreak', m);
  }
  const pool = radialGlowTexture({});
  const lightPool = new THREE.MeshBasicMaterial({
    map: pool.map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  });
  lightPool.opacity = 0.40; lightPool.transparent = true;
  lightPool.name = 'lightPool'; lightPool.userData.tileMeters = 1; M.set('lightPool', lightPool);

  // ---- vegetation ----------------------------------------------------------
  // four species-ish canopy variants (plane, honeylocust, pear, ginkgo-ish)
  [[49, 96], [83, 88], [131, 102], [177, 74]].forEach(([seed, hue], i) => {
    const can = canopyTexture({ seed, hue });
    std(`canopy${i}`, {
      map: can.map, roughness: 0.95, envMapIntensity: 0.4,
      alphaTest: 0.30, transparent: false, side: THREE.DoubleSide,   // blended leaves read as sparse confetti; cutout at 0.30
    }, 1);
  });
  M.set('canopy', M.get('canopy0'));   // back-compat alias
  const barkT = barkTexture({});
  std('bark', { map: barkT.map, roughness: 0.95, envMapIntensity: 0.4 }, barkT.tileMeters);

  return { M, extra };
}
