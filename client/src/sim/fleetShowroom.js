// Fleet SHOWROOM debug mode (`?fleet=1`) — model QA for the CARLA fleet.
//
// Traffic spawning and the parked fleet go off, and one instance of every kind
// is placed in a row through the REAL moving pools (pool.mb/md/mx), so every
// path the street uses stays live: PART_MATS, instanceColor, the snow-cap
// shader patch and vehicleCull's compaction/LOD. A model that looks right here
// looks right on 125th St.
//
//   ?fleet=1                      the whole fleet, front-3/4, on the Great Lawn
//   ?fleet=1&fleetonly=jeep,bus   just those kinds (close-ups without new presets)
//   ?fleet=1&fleetyaw=270         side view      (heading, degrees; 210 = front-3/4)
//   ?fleet=1&fleetyaw=30          rear-3/4
//   ?fleet=1&fleetat=cam          row in front of the player instead of the anchor
//   ?fleet=1&fleetsp=9&fleetd=14  spacing / distance ahead of the camera
//   ?fleet=1&fleetaxis=90         lay the row along the view axis (nose-to-tail)
//
// bshot presets: fleetNear / fleetRow / fleetHigh / fleetLod (tools/bshot.mjs).
import * as THREE from 'three';

// Great Lawn, Central Park: 330 x 200 m of flat, unbuilt, unshadowed ground.
const ANCHOR = [396, 215];
// showroom palette — the fleet's own colours, cycled, taxi yellow first
const COLORS = [0xf7b500, 0x1a1c1f, 0xe8e8e6, 0x9aa0a4, 0x35404e, 0x6e1f1f, 0x274a30, 0x7a5b28, 0x5b6165];

export function installFleetShowroom(traffic, fleet, streamer, Q) {
  if (!traffic || !fleet) return null;
  const num = (k, d) => { const raw = Q.get(k); if (raw == null || raw === '') return d; const v = Number(raw); return Number.isFinite(v) ? v : d; };

  // ---- 1. quiet the street: no spawning, no parked cars, no cars already out
  traffic.target = 0;
  for (let i = traffic.cars.length - 1; i >= 0; i--) traffic._remove(i);
  traffic.parkedRecs.clear();
  traffic.parkedRecs.set = function () { return this; };   // shadows Map.prototype.set: later tiles add nothing
  traffic._parkDirty = true;

  // ---- 2. where the row stands
  const only = (Q.get('fleetonly') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const kinds = Object.keys(traffic.pools).filter((k) => !only.length || only.includes(k));
  const sp = num('fleetsp', 6.5);
  const d = num('fleetd', 11);
  const axis = (num('fleetaxis', 0) * Math.PI) / 180;      // 0 = across the view, 90 = down it
  const camYaw = num('yaw', 0);
  const at = Q.get('fleetat');
  let ax, az, base;
  if (at === 'cam') {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    ax = num('x', 0) + fx * d; az = num('z', 0) + fz * d; base = camYaw;
  } else if (at && at.includes(',')) {
    const p = at.split(',').map(Number); ax = p[0]; az = p[1]; base = p.length > 2 ? (p[2] * Math.PI) / 180 : Math.PI;
  } else {
    ax = ANCHOR[0]; az = ANCHOR[1]; base = Math.PI;        // anchor row faces the camera standing to its -Z
  }
  // row direction: `base` is the camera's view yaw, so its right vector is the
  // default lay-out axis and `fleetyaw` is a heading RELATIVE to that view
  const rot = base + axis;
  const rx = Math.cos(rot), rz = -Math.sin(rot);           // right vector of view yaw `rot`
  const head = base + (num('fleetyaw', 210) * Math.PI) / 180;

  // ---- 3. place, once the ground under the row exists
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const row = [];
  // terrainAt is the BASE PLANE; the drawn grass/pavement stack sits 0.15-0.30 m
  // above it, so placing on terrainAt sank every car to its wheel arches.
  const groundAt = (x, z) => {
    const s = streamer.surfaceAt ? streamer.surfaceAt(x, z) : null;
    if (s != null && isFinite(s)) return s;
    const t = streamer.terrainAt(x, z);
    return t != null && isFinite(t) ? t : null;
  };
  const place = () => {
    const y0 = groundAt(ax, az);
    if (y0 == null) { setTimeout(place, 400); return; }
    kinds.forEach((k, i) => {
      const P = traffic.pools[k];
      if (!P) return;
      const t = (i - (kinds.length - 1) / 2) * sp;
      const x = ax + rx * t, z = az + rz * t;
      const y = (groundAt(x, z) ?? y0) + 0.002 + num('fleetlift', 0);
      e.set(0, head, 0);
      q.setFromEuler(e);
      m.compose(v.set(x, y, z), q, s);
      P.mb.setMatrixAt(0, m); P.md.setMatrixAt(0, m);
      for (const mx of P.mx) { mx.setMatrixAt(0, m); mx.instanceMatrix.needsUpdate = true; mx.count = 1; }
      col.set(COLORS[i % COLORS.length]);
      P.mb.setColorAt(0, col);
      P.mb.instanceColor.needsUpdate = true;
      P.mb.instanceMatrix.needsUpdate = P.md.instanceMatrix.needsUpdate = true;
      P.mb.count = P.md.count = 1;
      P.n = 0;                                             // spawnCar must never reuse slot 0
      row.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(3), color: '#' + COLORS[i % COLORS.length].toString(16).padStart(6, '0') });
    });
    // hide the kinds that are not in this shot
    for (const [k, P] of Object.entries(traffic.pools)) {
      if (kinds.includes(k)) continue;
      P.mb.count = P.md.count = 0;
      for (const mx of P.mx) mx.count = 0;
    }
    // measure what actually got built: bucket sizes and the world bbox of each
    // model (a kind that floats or is out of scale shows up here before pixels)
    const bb = new THREE.Box3(), sz = new THREE.Vector3();
    const info = {};
    for (const k of kinds) {
      const f = fleet[k]; if (!f) continue;
      bb.makeEmpty();
      for (const g of [f.paint, f.dark, ...Object.values(f.parts || {})]) {
        if (!g || !g.getAttribute('position') || g.getAttribute('position').count <= 24) continue;
        bb.union(new THREE.Box3().setFromBufferAttribute(g.getAttribute('position')));
      }
      bb.getSize(sz);
      const tris = {};
      for (const [n2, g] of Object.entries({ paint: f.paint, dark: f.dark, ...(f.parts || {}) })) tris[n2] = (g?.getAttribute('position')?.count ?? 0) / 3 | 0;
      info[k] = { L: +sz.z.toFixed(2), W: +sz.x.toFixed(2), H: +sz.y.toFixed(2), y0: +bb.min.y.toFixed(3), tris, shell: !!f.shell };
    }
    // ?fleetdebug=1 — flat unlit colour per material class, so a render STATES
    // which bucket every pixel came from instead of leaving you to guess from
    // a lit shade (is that silver wheel arch chrome, or glass reflecting sky?)
    if (Q.get('fleetdebug') === '1') {
      const CLS = { paint: 0xff00c8, dark: 0x1b1b1b, glass: 0x00d5ff, chrome: 0xf2f2f2, trim: 0xff7a00, body2: 0x9dff00, light: 0xffe600, tail: 0xff0000, tire: 0x00a03c, plate: 0x2b4bff };
      const flat = (c) => new THREE.MeshBasicMaterial({ color: c });
      for (const P of Object.values(traffic.pools)) {
        P.mb.material = flat(CLS.paint);
        P.mb.instanceColor.array.fill(1); P.mb.instanceColor.needsUpdate = true;
        P.md.material = flat(CLS.dark);
        for (const mx of P.mx) mx.material = flat(CLS[(mx.name || '').split(':')[1]] ?? 0xffffff);
      }
    }
    window.__FLEET = { row, info, anchor: [ax, az], head: +((head * 180) / Math.PI).toFixed(1) };
    console.log('[showroom]', row.length, 'kinds at', ax.toFixed(0), az.toFixed(0), 'heading', ((head * 180) / Math.PI).toFixed(0) + 'deg');
    for (const k of kinds) if (info[k]) console.log('[showroom]', k.padEnd(11), 'L', info[k].L, 'W', info[k].W, 'H', info[k].H, 'y0', info[k].y0, JSON.stringify(info[k].tris));
  };
  place();
  return { row, kinds };
}
