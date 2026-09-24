// Drives traffic-signal + pedestrian-signal state lamps from the shared phase clock.
// Cycle (40s): NS green 0-15, NS amber 15-18, all-red 18-20, EW green 20-35, EW amber 35-38, all-red 38-40.
export function signalState(t, servesEW) {
  const c = ((t % 40) + 40) % 40;
  if (!servesEW) {
    if (c < 15) return 'G';
    if (c < 18) return 'A';
    return 'R';
  }
  if (c >= 20 && c < 35) return 'G';
  if (c >= 35 && c < 38) return 'A';
  return 'R';
}
// seconds of green (WALK) left for the axis, 0 when it is not green — pedestrians do not step off the kerb into a
// crossing they cannot finish (sim/peds.js, src/api/bridge.js walker routes)
export function walkTimeLeft(t, servesEW) {
  const c = ((t % 40) + 40) % 40;
  if (!servesEW) return c < 15 ? 15 - c : 0;
  return c >= 20 && c < 35 ? 35 - c : 0;
}
export class SignalController {
  constructor(instancer, registry, traffic) {
    this.inst = instancer;
    this.reg = registry;
    this.traffic = traffic;
    this._acc = 1;
  }
  update(dt) {
    this._acc += dt;
    if (this._acc < 0.25) return;
    this._acc = 0;
    const t = this.traffic ? this.traffic.time : performance.now() / 1000;
    for (const e of this.reg) {
      // SG13 (docs/notes/signals-r13.md): a mast now owns TWO aimed heads, and
      // each head owns its own R/A/G lens instance. `servesEW` is decided at
      // claim time from the direction the heads FACE (assemble.js), which is the
      // axis traffic.js phases the cars on — the old `|sin rot| > |cos rot|` read
      // the ARM bearing, 90 deg off, so the lamps ran the opposite phase to the
      // traffic under them.
      if (e.heads) {
        const st = signalState(t, e.servesEW);
        for (const lp of ['sigR', 'sigA', 'sigG']) {
          const ids = e.ids[lp];
          if (!ids) continue;
          const on = st === lp.charAt(3);                      // sigR/sigA/sigG -> R/A/G
          for (let i = 0; i < ids.length; i++) {
            const h = e.heads[i];
            if (!h || ids[i] < 0) continue;
            this.inst.setMatrix(lp, ids[i], h.x, h.y, h.z, h.rot, on ? 1 : 0.001);
          }
        }
        continue;
      }
      const dirx = Math.sin(e.rot), dirz = Math.cos(e.rot);
      const servesEW = Math.abs(dirx) > Math.abs(dirz);
      const st = signalState(t, servesEW);
      if (e.veh) {
        this.inst.setMatrix('sigR', e.ids.sigR, e.x, e.y, e.z, e.rot, st === 'R' ? 1 : 0.001);
        this.inst.setMatrix('sigA', e.ids.sigA, e.x, e.y, e.z, e.rot, st === 'A' ? 1 : 0.001);
        this.inst.setMatrix('sigG', e.ids.sigG, e.x, e.y, e.z, e.rot, st === 'G' ? 1 : 0.001);
      } else {
        // walk parallel to a green street (i.e., the street you cross is red)
        const walk = st === 'G';
        this.inst.setMatrix('pedHand', e.ids.pedHand, e.x, e.y, e.z, e.rot, walk ? 0.001 : 1);
        this.inst.setMatrix('pedMan', e.ids.pedMan, e.x, e.y, e.z, e.rot, walk ? 1 : 0.001);
      }
    }
  }
}
