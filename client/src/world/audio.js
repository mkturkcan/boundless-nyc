// Procedural ambient audio: everything is synthesized, no audio files needed
// (HuggingFace-space / Electron friendly). Starts on the first user click
// (browser gesture rule). Layers:
//   traffic hum: lowpassed brown noise, gain follows nearby car count
//   wind: bandpassed noise that rises with camera altitude and storms
//   birds: sparse FM chirps by day
//   distant siren: rare two-tone wail, panned, faded in and out
export function initAudio() {
  let ctx = null;
  let humGain = null, windGain = null, windFilt = null, rainGain = null;
  let nextChirp = 6, nextSiren = 45 + Math.random() * 120;
  const start = () => {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      // shared brown-noise loop
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      const noise = (filt) => {
        const s = ctx.createBufferSource();
        s.buffer = buf; s.loop = true;
        s.playbackRate.value = 0.85 + Math.random() * 0.3;
        s.connect(filt);
        s.start();
        return s;
      };
      // traffic hum
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 260;
      humGain = ctx.createGain(); humGain.gain.value = 0;
      hf.connect(humGain); humGain.connect(master);
      noise(hf);
      // wind
      windFilt = ctx.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 520; windFilt.Q.value = 0.45;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windFilt.connect(windGain); windGain.connect(master);
      noise(windFilt);
      // rain hiss
      const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2600;
      rainGain = ctx.createGain(); rainGain.gain.value = 0;
      rf.connect(rainGain); rainGain.connect(master);
      noise(rf);
      this_master = master;
    } catch (e) { console.warn('audio unavailable', e); }
  };
  let this_master = null;
  const chirp = () => {
    const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    o.type = 'sine';
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) {
      const s = t + i * 0.14;
      o.frequency.setValueAtTime(2600 + Math.random() * 900, s);
      o.frequency.exponentialRampToValueAtTime(3300 + Math.random() * 700, s + 0.06);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.028, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.12);
    }
    o.connect(g); g.connect(pan); pan.connect(this_master);
    o.start(t); o.stop(t + 1.2);
  };
  const siren = () => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
    f.type = 'lowpass'; f.frequency.value = 1200;
    pan.pan.value = Math.random() * 1.4 - 0.7;
    o.type = 'triangle';
    const t = ctx.currentTime, DUR = 11;
    for (let s = 0; s < DUR; s += 1.25) { // two-tone wail
      o.frequency.setValueAtTime(690, t + s);
      o.frequency.setValueAtTime(940, t + s + 0.62);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02, t + DUR * 0.4); // approach
    g.gain.exponentialRampToValueAtTime(0.0001, t + DUR);     // recede
    o.connect(f); f.connect(g); g.connect(pan); pan.connect(this_master);
    o.start(t); o.stop(t + DUR + 0.1);
  };
  if (typeof document !== 'undefined') document.addEventListener('click', start, { once: true });
  return {
    update(dt, s) { // s: {cars, alt, night, wet, wind}
      if (!ctx || !humGain) return;
      const k = Math.min(1, dt * 1.5);
      const humT = Math.min(0.09, (s.cars || 0) * 0.0012) * (1 - (s.alt || 0) / 400);
      humGain.gain.value += (Math.max(0, humT) - humGain.gain.value) * k;
      const windT = Math.min(0.11, 0.012 + (s.alt || 0) * 0.00055 + (s.wind || 0) * 0.03 + (s.wet || 0) * 0.02);
      windGain.gain.value += (windT - windGain.gain.value) * k;
      windFilt.frequency.value = 380 + Math.min(1, (s.alt || 0) / 260) * 500;
      rainGain.gain.value += (Math.min(0.075, (s.wet || 0) * 0.09) - rainGain.gain.value) * k;
      nextChirp -= dt;
      if (nextChirp <= 0) { nextChirp = 3.5 + Math.random() * 7; if ((s.night || 0) < 0.3 && (s.alt || 0) < 120) chirp(); }
      nextSiren -= dt;
      if (nextSiren <= 0) { nextSiren = 100 + Math.random() * 200; siren(); }
    },
  };
}
