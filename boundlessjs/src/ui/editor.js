// Tab-toggled live weather + post-processing editor. Mutates the shared GFX
// params (src/world/weather.js) which weather.update composes onto the engine
// every frame — every slider is live. "Export JSON" downloads graphics.json;
// drop it in public/settings/graphics.json and main.js loads it at boot.
// "Import" applies a local .json without a reload for A/B comparison.
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { GFX, applyGfx } from '../world/weather.js';

export function initEditor(ctx = {}) {
  const gui = new GUI({ title: 'boundless.js Weather / Post (G)', width: 300 });
  gui.domElement.style.cssText += 'position:fixed;top:12px;right:12px;z-index:40;';

  const fW = gui.addFolder('Weather');
  fW.add(GFX, 'rain', 0, 1, 0.01).name('rain');
  fW.add(GFX, 'snow', 0, 1, 0.01).name('snow');
  fW.add(GFX, 'cloud', 0, 1, 0.01).name('cloud cover');
  fW.add(GFX, 'wind', 0, 2.5, 0.01).name('wind / tree sway');
  fW.add(GFX, 'lightning').name('lightning');

  const fL = gui.addFolder('Lighting');
  if (ctx.sky) fL.add({ mode: 'day' }, 'mode', ['day', 'golden', 'dusk', 'night']).name('time of day').onChange((m) => ctx.sky.apply(m));
  if (ctx.sky) {
    import('../world/sky.js').then(({ HDRI_LIST }) => {
      fL.add({ sky: 'procedural' }, 'sky', ['procedural', ...HDRI_LIST]).name('sky HDRI (relights)')
        .onChange((v) => ctx.sky.setHDRI(v === 'procedural' ? false : v));
    });
  }
  fL.add(GFX, 'toneMap', ['ACES', 'AgX', 'Neutral', 'Reinhard', 'Cineon']).name('tone mapping');
  fL.add(GFX, 'exposure', 0.3, 1.6, 0.01).name('exposure');
  fL.add(GFX, 'autoExposure', 0, 1, 0.01).name('auto exposure (eye)');
  fL.add(GFX, 'sunScale', 0, 2, 0.01).name('sun intensity');
  // sun position/color offsets recompute the whole sky + env bake on change
  const reSky = () => ctx.sky && ctx.sky.apply(ctx.sky.mode);
  fL.add(GFX, 'sunElev', -30, 45, 0.5).name('sun elevation ±°').onChange(reSky);
  fL.add(GFX, 'sunAzim', -180, 180, 1).name('sun azimuth ±°').onChange(reSky);
  fL.add(GFX, 'sunWarmth', -0.5, 0.5, 0.01).name('sun warmth').onChange(reSky);
  fL.add(GFX, 'turbidity', 1, 14, 0.1).name('sky haze').onChange(reSky);
  fL.add(GFX, 'hemiScale', 0, 2.5, 0.01).name('sky/ambient');
  fL.add(GFX, 'cityAO', 0, 1.2, 0.01).name('city AO (canyons)');
  fL.add(GFX, 'envScale', 0, 2.5, 0.01).name('reflections (IBL)');
  fL.add(GFX, 'shadowSoft', 0, 8, 0.1).name('shadow softness');
  fL.add(GFX, 'shadowStrength', 0, 1, 0.01).name('shadow strength');
  fL.add(GFX, 'fogDensity', 0, 0.0006, 0.00001).name('fog density');
  const fH = gui.addFolder('Volumetric haze');
  fH.add(GFX, 'hazeDensity', 0, 0.004, 0.00005).name('density');
  fH.add(GFX, 'hazeFalloff', 0.002, 0.05, 0.001).name('height falloff');
  fH.add(GFX, 'hazeG', 0, 0.92, 0.01).name('sun anisotropy');
  fH.add(GFX, 'hazeSun', 0, 5, 0.05).name('sun in-scatter');
  fH.add(GFX, 'godrays', 0, 2, 0.01).name('god rays');
  fL.add(GFX, 'gi', 0, 2.5, 0.01).name('SSGI bounce');
  fL.add(GFX, 'giRad', 2, 14, 0.1).name('SSGI radius (m)');
  fL.add(GFX, 'probe', 0, 1.5, 0.01).name('light probe');

  const fP = gui.addFolder('Post');
  fP.add(GFX, 'bloomMul', 0, 4, 0.05).name('bloom');
  fP.add(GFX, 'vignette', 0, 0.7, 0.01).name('vignette');
  fP.add(GFX, 'saturation', 0.6, 1.5, 0.01).name('saturation');
  fP.add(GFX, 'contrast', 0, 0.5, 0.01).name('filmic contrast');
  fP.add(GFX, 'warmth', -0.1, 0.2, 0.005).name('warmth');
  fP.add(GFX, 'tint', -0.08, 0.12, 0.005).name('tint (green)');
  fP.add(GFX, 'lut', ['none', 'teal_orange', 'bleach_bypass', 'film_warm', 'noir_cool', 'vintage_fade', 'vibrant']).name('LUT grade');
  fP.add(GFX, 'lutAmt', 0, 1, 0.01).name('LUT intensity');
  fP.add(GFX, 'taa', 0, 0.95, 0.01).name('temporal AA');
  fP.add(GFX, 'sharpness', 0, 1.5, 0.01).name('sharpness');
  fP.add(GFX, 'definition', 0, 1.5, 0.01).name('definition');
  fP.add(GFX, 'motionBlur', 0, 1, 0.01).name('motion blur');
  fP.add(GFX, 'grain', 0, 0.2, 0.005).name('film grain');
  fP.add(GFX, 'chromAb', 0, 1.5, 0.01).name('chromatic aberration');
  fP.add(GFX, 'ssr', 0, 1, 0.01).name('SSR strength');
  fP.add(GFX, 'dof').name('depth of field');
  if (ctx.engine && ctx.engine.gtao) {
    fP.add(ctx.engine.gtao, 'blendIntensity', 0, 1.5, 0.01).name('AO intensity');
    fP.add({ r: 3.4 }, 'r', 0.5, 8, 0.1).name('AO radius').onChange((v) => ctx.engine.gtao.updateGtaoMaterial({ radius: v }));
  }
  if (ctx.engine) {
    const rs = { scale: Math.min(devicePixelRatio, 1.6) };
    fP.add(rs, 'scale', 0.75, Math.max(2, devicePixelRatio), 0.05).name('render scale').onChange((v) => {
      ctx.engine.renderer.setPixelRatio(v);
      ctx.engine.renderer.setSize(innerWidth, innerHeight);
      ctx.engine.composer.setSize(innerWidth, innerHeight);
    });
  }

  // one-click looks: tone map + LUT + grade + atmosphere bundles
  const LOOKS = {
    Neutral: { toneMap: 'AgX', lut: 'none', saturation: 1.07, warmth: 0.05, contrast: 0.2, tint: 0, vignette: 0.2, cloud: 0.18, fogDensity: 0.00012, ssr: 0.55, hazeDensity: 0.0009, hazeSun: 1.6, godrays: 0.5, sky: 'day' },
    'Golden Hour': { toneMap: 'AgX', lut: 'film_warm', lutAmt: 0.6, saturation: 1.1, warmth: 0.1, contrast: 0.22, tint: -0.01, vignette: 0.24, cloud: 0.12, fogDensity: 0.00015, ssr: 0.5, hazeDensity: 0.0016, hazeSun: 2.6, godrays: 0.9, sky: 'golden' },
    Blockbuster: { toneMap: 'AgX', lut: 'teal_orange', lutAmt: 0.75, saturation: 1.05, warmth: 0.02, contrast: 0.24, tint: 0, vignette: 0.28, cloud: 0.2, fogDensity: 0.00012, ssr: 0.6, hazeDensity: 0.0011, hazeSun: 1.8, godrays: 0.6, sky: 'day' },
    'Matrix Overcast': { toneMap: 'Cineon', lut: 'none', saturation: 0.86, warmth: -0.02, contrast: 0.28, tint: 0.05, vignette: 0.3, cloud: 0.72, fogDensity: 0.00026, ssr: 0.85, rain: 0.25, hazeDensity: 0.0018, hazeSun: 0.5, godrays: 0.1, sky: 'day' },
    Noir: { toneMap: 'Reinhard', lut: 'noir_cool', lutAmt: 0.8, saturation: 0.35, warmth: -0.03, contrast: 0.34, tint: 0, vignette: 0.46, cloud: 0.55, fogDensity: 0.0003, ssr: 0.7, hazeDensity: 0.0022, hazeSun: 0.8, godrays: 0.25, sky: 'dusk' },
    Vintage: { toneMap: 'Neutral', lut: 'vintage_fade', lutAmt: 0.75, saturation: 0.9, warmth: 0.07, contrast: 0.16, tint: 0.015, vignette: 0.34, cloud: 0.3, fogDensity: 0.0002, ssr: 0.45, hazeDensity: 0.0014, hazeSun: 1.4, godrays: 0.4, sky: 'golden' },
    Crisp: { toneMap: 'ACES', lut: 'vibrant', lutAmt: 0.5, saturation: 1.1, warmth: 0.03, contrast: 0.22, tint: 0, vignette: 0.16, cloud: 0.1, fogDensity: 0.00008, ssr: 0.55, hazeDensity: 0.0004, hazeSun: 1.0, godrays: 0.35, sky: 'day' },
  };
  gui.add({ look: 'Neutral' }, 'look', Object.keys(LOOKS)).name('LOOK preset').onChange((k) => {
    const { sky: skyMode, ...gfx } = LOOKS[k];
    applyGfx(gfx);
    if (ctx.sky && !ctx.sky.hdri) ctx.sky.apply(skyMode);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  });

  const actions = {
    exportJSON() {
      const blob = new Blob([JSON.stringify(GFX, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'graphics.json';
      a.click();
      URL.revokeObjectURL(a.href);
      console.log('[editor] exported — put it at public/settings/graphics.json to load at boot');
    },
    importJSON() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async () => {
        if (!inp.files?.[0]) return;
        applyGfx(JSON.parse(await inp.files[0].text()));
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
      };
      inp.click();
    },
    reset() {
      applyGfx({ rain: 0, snow: 0, cloud: 0.18, wind: 0.35, lightning: false, exposure: 0.74, sunScale: 1, hemiScale: 1, fogDensity: 0.00014, bloomMul: 1, vignette: 0.2, saturation: 1.07, contrast: 0.16, warmth: 0.05 });
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
  };
  gui.add(actions, 'exportJSON').name('⬇ export graphics.json');
  gui.add(actions, 'importJSON').name('⬆ import json (live)');
  gui.add(actions, 'reset').name('reset defaults');

  let shown = new URLSearchParams(location.search).has('editor');
  gui.show(shown);
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyG') { // G = graphics (Tab switches drone/first-person)
      e.preventDefault();
      shown = !shown;
      gui.show(shown);
      if (typeof document !== 'undefined' && document.pointerLockElement && shown) document.exitPointerLock();
    }
  });
  window.__EDITOR = { gui, show: (v = true) => { shown = v; gui.show(v); } };
  return gui;
}
