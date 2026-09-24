// Component kit: parameterized, cached, instanced building parts.
// Anchor conventions (critical â€” every builder relies on these):
//  - Window/door/storefront parts: anchored at the WALL FACE PLANE (z=0 is the
//    outer wall surface, part extends into -z recess and +z projections),
//    x centered, y = bottom of the opening.
//  - Freestanding parts (water tower, hydrant, tree): y=0 ground, centered x/z.
// Building modules place instances with tmat(x, y, z, ry) where the matrix maps
// part space -> world. A facade facing +Z uses ry=0; facing -Z uses ry=PI; etc.
import * as THREE from 'three';
import { box, boxUV, quad, cylinder, cone, lathe, compose, profileAlongX, ensureColor, tmat } from './geo.js';

const DARK = new THREE.Color(0.16, 0.15, 0.145);   // window reveal shadow tint
const q05 = (v) => Math.round(v * 20) / 20;         // quantize 5cm

export function makeKit(batcher, extra) {
  const K = { batcher, extra };

  // ==========================================================================
  // WINDOW UNIT â€” reveal + frame (+sash bars) as one part, glass as another.
  // style: 'dh1' (1/1 double hung), 'dh2' (2/2), 'dh6' (6/6),
  //        'steel' (industrial grid, panesX x panesY), 'fixed' (plain).
  // Returns the part ids so callers can add lit-window overlays.
  // ==========================================================================
  K.windowPart = function ({ w = 0.9, h = 1.5, style = 'dh1', panesX = 4, panesY = 5, recess = 0.14, frameW = 0.075 }) {
    w = q05(w); h = q05(h);
    // masonry reveals read deeper than callers tend to ask for: +4cm (cap 0.22)
    // so every jamb throws a real shadow line at street distance
    recess = Math.min(0.22, recess + 0.04);
    const id = `win:${style}:${w}x${h}:${recess}:${style === 'steel' ? panesX + 'x' + panesY : ''}`;
    const glassId = `glass:${w}x${h}:${recess}`;
    const litId = `lit:${w}x${h}:${recess}`;
    if (!batcher.hasPart(id)) {
      const items = [];
      const rd = recess + 0.02;        // reveal depth
      // frame: outer casing at recess depth
      const fz = -recess + 0.045;
      const fd = 0.055;
      items.push({ geom: box(w, frameW, fd, { segY: 1 }), x: 0, y: h - frameW, z: fz });                          // top rail
      items.push({ geom: box(w, frameW * 1.25, fd, { segY: 1 }), x: 0, y: 0, z: fz });                            // bottom rail
      items.push({ geom: box(frameW, h, fd, { segY: 1 }), x: -w / 2 + frameW / 2, y: 0, z: fz });                 // left stile
      items.push({ geom: box(frameW, h, fd, { segY: 1 }), x: w / 2 - frameW / 2, y: 0, z: fz });                  // right stile
      if (style.startsWith('dh')) {
        // meeting rail (double-hung check rail) slightly proud
        items.push({ geom: box(w - frameW, frameW * 0.9, fd + 0.02, { segY: 1 }), x: 0, y: h * 0.52, z: fz });
        const bars = style === 'dh2' ? 1 : style === 'dh6' ? 2 : 0;
        const rows = style === 'dh6' ? 1 : 0;
        const bw = 0.024;
        for (const [y0, y1] of [[frameW * 1.2, h * 0.52], [h * 0.52 + frameW * 0.9, h - frameW]]) {
          for (let b = 1; b <= bars; b++) {
            const bx = -w / 2 + (w / (bars + 1)) * b;
            items.push({ geom: box(bw, y1 - y0, 0.03, { segY: 1 }), x: bx, y: y0, z: fz });
          }
          for (let r = 1; r <= rows; r++) {
            const by = y0 + ((y1 - y0) / (rows + 1)) * r;
            items.push({ geom: box(w - frameW * 2, bw, 0.03, { segY: 1 }), x: 0, y: by - bw / 2, z: fz });
          }
        }
      } else if (style === 'steel') {
        const bw = 0.028;
        for (let b = 1; b < panesX; b++) {
          const bx = -w / 2 + (w / panesX) * b;
          items.push({ geom: box(bw, h - frameW * 2, 0.035, { segY: 1 }), x: bx, y: frameW, z: fz });
        }
        for (let r = 1; r < panesY; r++) {
          const by = (h / panesY) * r;
          items.push({ geom: box(w - frameW * 2, bw, 0.035, { segY: 1 }), x: 0, y: by - bw / 2, z: fz });
        }
      }
      batcher.definePart(id, compose(items), 'windowFrame');
      // interior back panel is its OWN part so each window can vary its
      // room tone (dark / curtain / half-drawn shade) behind the glass
      const back = box(w + 0.08, h + 0.08, 0.02, { segY: 1 });
      const backG = compose([{ geom: back, x: 0, y: -0.04, z: -rd - 0.03 }]);
      batcher.definePart(id + ':back', backG, 'roomFill', { castShadow: false });
      // half-drawn shade sits just behind the glass on a subset of windows
      const shade = quad(w - frameW - 0.03, (h - frameW) * 0.45);
      shade.translate(0, (h - frameW) * 0.55, -recess + 0.008);
      batcher.definePart(id + ':shade', shade, 'roomFill', { castShadow: false, receiveShadow: false });
      const g = quad(w - frameW, h - frameW);
      g.translate(0, frameW / 2, -recess + 0.02);
      {
        // vertical value ramp baked into the pane: dark at the sill, sky-bright
        // at the head — the one gradient that separates glass from a painted card
        const pos = g.attributes.position, n = pos.count;
        let ymin = Infinity, ymax = -Infinity;
        for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const t = (pos.getY(i) - ymin) / Math.max(0.01, ymax - ymin);
          col[i * 3] = 0.30 + 1.55 * t; col[i * 3 + 1] = 0.32 + 1.60 * t; col[i * 3 + 2] = 0.36 + 1.70 * t;   // 5:1 sill→head
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      batcher.definePart(glassId, g, 'glass', { castShadow: false });
      // lit overlay sits IN FRONT of the (opaque) glass so night windows glow
      const lg = quad(w - frameW - 0.02, h - frameW - 0.02);
      lg.translate(0, frameW / 2 + 0.01, -recess + 0.033);
      batcher.definePart(litId, lg, 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
    }
    return { id, glassId, litId };
  };

  // Place a full window (frame+glass, maybe lit overlay) at wall-face anchor.
  // Lit rooms cycle through varied warm/cool tones (deterministic call order).
  // wide color-temperature spread: sodium-warm through daylight-LED, plus a
  // few cool TV-blue rooms; strengths vary so no two lit windows match
  const LIT_TONES = [
    new THREE.Color(1.0, 0.69, 0.4), new THREE.Color(1.0, 0.94, 0.81),
    new THREE.Color(0.95, 0.75, 0.45), new THREE.Color(0.85, 0.89, 1.0),
    new THREE.Color(1.0, 0.86, 0.62), new THREE.Color(0.55, 0.62, 0.8),
    new THREE.Color(1.0, 0.95, 0.8), new THREE.Color(0.9, 0.62, 0.38),
    new THREE.Color(0.72, 0.8, 0.95), new THREE.Color(1.0, 0.8, 0.55),
    new THREE.Color(0.62, 0.55, 0.42), new THREE.Color(1.0, 0.9, 0.7),
  ];
  // room tones seen through the (semi-transparent) glass
  // unlit fills are LINEAR values (sRGB output lifts them ~2x). A real facade
  // shows every pane at a different value — dim rooms, pale walls, curtains —
  // so the palette is wide (0.05 → 0.46) with 3-in-16 bright curtains; a
  // uniform dark tone read as hundreds of identical black rectangles
  const ROOM_TONES = [
    new THREE.Color(0.05, 0.05, 0.06), new THREE.Color(0.07, 0.065, 0.06),
    new THREE.Color(0.09, 0.08, 0.07), new THREE.Color(0.06, 0.065, 0.075),
    new THREE.Color(0.11, 0.095, 0.08), new THREE.Color(0.08, 0.085, 0.09),
    new THREE.Color(0.12, 0.11, 0.10), new THREE.Color(0.10, 0.09, 0.075),
    new THREE.Color(0.15, 0.14, 0.13), new THREE.Color(0.19, 0.17, 0.14),
    new THREE.Color(0.22, 0.21, 0.20), new THREE.Color(0.28, 0.26, 0.23),
    new THREE.Color(0.16, 0.15, 0.15),
    new THREE.Color(0.34, 0.32, 0.28), new THREE.Color(0.36, 0.35, 0.33), new THREE.Color(0.24, 0.22, 0.19),
  ];
  const SHADE_TONES = [
    new THREE.Color(0.12, 0.11, 0.095), new THREE.Color(0.15, 0.145, 0.135),
    new THREE.Color(0.09, 0.08, 0.07),
  ];
  let litCycle = 0, roomCycle = 0, shadeCycle = 0;
  // opts.interior: false  -> caller manages its own room fill (no back/shade)
  // opts.roomTone: Color  -> explicit room tone;  opts.shade: true|false forces
  K.window = function (params, matrix, {
    tint = null, glassTint = null, lit = false, litTint = null,
    interior = true, roomTone = null, shade = null,
  } = {}) {
    const { id, glassId, litId } = K.windowPart(params);
    batcher.addInstance(id, matrix, tint);
    if (interior) {
      batcher.addInstance(id + ':back', matrix, roomTone || ROOM_TONES[((roomCycle++) * 7) % ROOM_TONES.length]);
      const wantShade = shade !== null ? shade : (shadeCycle++ % 5 < 2);
      if (wantShade) {
        batcher.addInstance(id + ':shade', matrix, SHADE_TONES[shadeCycle % SHADE_TONES.length]);
      }
    }
    // ±15mm pane depth jitter: forty perfectly coplanar panes is a CG tell
    const pj = (((roomCycle * 37) % 11) / 11 - 0.5) * 0.03;
    // per-pane reflectance jitter (dirt, film, blinds behind) so no two panes
    // on a facade return the same sky value
    // modules declare ONE glassTint per building — jitter on top of it so a
    // whole block never shares a single pane value
    const gj = (glassTint ? glassTint.clone() : new THREE.Color(1, 1, 1)).multiplyScalar(0.75 + (((roomCycle * 37) % 13) / 13) * 0.5);
    // per-pane micro-tilt (≤0.8°): each pane mirrors a slightly different patch
    // of sky, so no two panes on a facade return the same reflection value
    const ryJ = (((roomCycle * 53) % 7) - 3) * 0.0045;
    const rxJ = (((roomCycle * 29) % 5) - 2) * 0.0035;
    batcher.addInstance(glassId, matrix.clone().multiply(tmat(0, 0, pj, ryJ)).multiply(new THREE.Matrix4().makeRotationX(rxJ)), gj);
    if (lit) {
      litCycle++;
      // floor 0.75 so no lit window falls under the night bloom threshold
      const tone = litTint || LIT_TONES[(litCycle * 7) % LIT_TONES.length].clone()
        .multiplyScalar(0.75 + 0.55 * ((litCycle * 13) % 9) / 9);
      batcher.addInstance(litId, matrix, tone);
    }
  };

  // ==========================================================================
  // SILLS & LINTELS (stone) â€” anchored like windows (x centered, y = window
  // sill/head line, z=0 wall face).
  // ==========================================================================
  let streakCycle = 0;
  // `over` (width added each side of the opening) and `proj` (how far the
  // stone stands off the wall face) are parameters because a 0.11 m projection
  // on a 1.05 m sill self-occludes the 0.35 m of wall between dense bays at any
  // grazing angle: 0.11 / tan(10 deg) = 0.62 m of wall hidden per sill, so the
  // sills of a FiDi office merge into one continuous white band down the whole
  // canyon (docs/notes/facades-r8.md §5; lead-intersections.md 2026-09-10).
  // Defaults are the pre-round-8 values.
  K.sill = function (w, matrix, { tint = null, mat = 'limestone', streak = true, over = 0.16, proj = 0.11 } = {}) {
    w = q05(w + over);
    const id = `sill:${mat}:${w}:${proj.toFixed(3)}`;
    if (!batcher.hasPart(id)) {
      const g = box(w, 0.075, proj, { segY: 1 });
      boxUV(g, w, 0.075, proj, 2);
      g.translate(0, -0.075, proj / 2 - 0.02);
      batcher.definePart(id, g, mat);
      // texture alpha is strongest at v=1 (canvas top) -> quad top under sill;
      // long enough to reach the head of the window below
      const sg = quad(w - 0.1, 1.6);
      sg.translate(0, -1.68, 0.012);
      batcher.definePart(`streak:${w}`, sg, 'grimeStreak', { castShadow: false, receiveShadow: false });
    }
    batcher.addInstance(id, matrix, tint);
    // rain-wash stain under ~45% of sills — the 'has been rained on' cue
    // (unlit dark quad with alpha streaks: tint = streak darkness)
    if (streak && streakCycle++ % 9 < 4) {
      batcher.addInstance(`streak:${w}`, matrix,
        new THREE.Color().setScalar(0.05 + 0.1 * ((streakCycle * 3) % 4) / 4));
    }
  };

  K.lintel = function (w, matrix, { tint = null, mat = 'limestone', style = 'flat', over = 0.18, proj = null } = {}) {
    w = q05(w + over);
    const id = `lintel:${mat}:${style}:${w}:${proj === null ? 'd' : proj.toFixed(3)}`;
    if (!batcher.hasPart(id)) {
      let g;
      if (style === 'peaked') {
        // simple pedimented lintel (brownstone Italianate)
        g = compose([
          { geom: box(w, 0.16, 0.09, { segY: 1 }), x: 0, y: 0, z: 0 },
          { geom: box(w * 0.86, 0.07, 0.12, { segY: 1 }), x: 0, y: 0.16, z: 0 },
        ]);
        g.translate(0, 0, 0.045);
      } else if (style === 'arch') {
        // segmental arch of voussoir look: shallow curved band approximated
        const pts = [];
        const R = w * 1.05, a0 = -Math.asin((w / 2) / R), a1 = -a0;
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        for (let i = 0; i <= 10; i++) {
          const a = a0 + (a1 - a0) * (i / 10);
          shape.lineTo(R * Math.sin(a), R * Math.cos(a) - R * Math.cos(a0));
        }
        for (let i = 10; i >= 0; i--) {
          const a = a0 + (a1 - a0) * (i / 10);
          shape.lineTo(R * Math.sin(a) * 1.0, R * Math.cos(a) - R * Math.cos(a0) + 0.17);
        }
        shape.closePath();
        g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 4 });
        g.translate(0, 0, -0.02);
      } else {
        const pz = proj === null ? 0.08 : proj;
        g = box(w, 0.15, pz, { segY: 1 });
        boxUV(g, w, 0.15, pz, 2);
        g.translate(0, 0, pz / 2 - 0.01);
      }
      batcher.definePart(id, g, mat);
    }
    batcher.addInstance(id, matrix, tint);
  };

  // ==========================================================================
  // CORNICE â€” merged extruded profile per facade + instanced brackets.
  // Anchored: x centered on facade, y = cornice base line, z = wall face.
  // ==========================================================================
  const CORNICE_PROFILES = {
    // bracketed Italianate crown (tenement/brownstone)
    main: [[0, 0], [0.05, 0.03], [0.07, 0.1], [0.15, 0.13], [0.17, 0.2], [0.3, 0.24], [0.44, 0.30], [0.46, 0.42], [0.48, 0.52], [0, 0.52]],
    // smaller band course
    band: [[0, 0], [0.1, 0.03], [0.12, 0.09], [0.16, 0.12], [0.18, 0.18], [0, 0.18]],
    // industrial corbelled brick (stepped)
    corbel: [[0, 0], [0.06, 0.0], [0.06, 0.1], [0.12, 0.1], [0.12, 0.22], [0.2, 0.22], [0.2, 0.38], [0, 0.38]],
  };

  // `scale` multiplies the whole profile (and its brackets and spacing). The
  // authored 'main' crown projects 0.48 m and stands 0.52 m: a real Harlem
  // sheet-metal Italianate cornice projects 0.6-0.9 m and stands 0.7-1.2 m, so
  // ours read as a thin lip where the reference reads as a shadow-casting
  // crown. Default 1 = unchanged (the standalone generator demo is untouched).
  K.cornice = function (width, matrix, { profile = 'main', tint = null, mat = 'cornicePaint', brackets = true, bracketTint = null, scale = 1 } = {}) {
    const prof = scale === 1 ? CORNICE_PROFILES[profile] : CORNICE_PROFILES[profile].map(([pz, py]) => [pz * scale, py * scale]);
    const g = profileAlongX(prof, width);
    batcher.addMerged(mat, g, matrix, { tint, worldUV: false });
    if (brackets && profile === 'main') {
      const bId = 'cornice:bracket:' + scale.toFixed(2);
      if (!batcher.hasPart(bId)) {
        const bg = compose([
          { geom: box(0.11 * scale, 0.34 * scale, 0.34 * scale, { segY: 1 }), x: 0, y: 0, z: 0.17 * scale },
          { geom: box(0.15 * scale, 0.1 * scale, 0.42 * scale, { segY: 1 }), x: 0, y: 0.34 * scale, z: 0.21 * scale },
        ]);
        batcher.definePart(bId, bg, 'cornicePaint');
      }
      const n = Math.max(2, Math.round(width / (0.8 * scale)));
      for (let i = 0; i <= n; i++) {
        const bx = -width / 2 + (width / n) * i;
        const local = tmat(bx, -0.02 * scale, 0.02);
        batcher.addInstance(bId, matrix.clone().multiply(local), bracketTint || tint);
      }
    }
  };

  // ==========================================================================
  // FIRE ESCAPE â€” platforms + angled stairs + drop ladder. Anchored: x centered
  // on the escape bay, y = first platform floor level, z = wall face (extends +z).
  // ==========================================================================
  // NYC pattern (see refs/tenement-fire-escape-avenue-a-01.jpg): slatted
  // platforms at each sill line, perimeter railing with corner finial posts,
  // steep stairs running PARALLEL to the facade zig-zagging per floor,
  // diagonal braces under the platform ends, stowed drop ladder at the bottom.
  const FE_D = 1.02;                                  // platform depth
  function feMkPlatform(width) {
    const id = `fe:plat:${width}`;
    if (batcher.hasPart(id)) return id;
    const items = [];
    const d = FE_D;
    // edge frame (angle iron)
    items.push({ geom: box(width, 0.075, 0.055, { segY: 1 }), x: 0, y: -0.045, z: d - 0.055 });
    items.push({ geom: box(width, 0.075, 0.045, { segY: 1 }), x: 0, y: -0.045, z: 0.03 });
    for (const s of [-1, 1]) {
      items.push({ geom: box(0.05, 0.075, d - 0.06, { segY: 1 }), x: s * (width / 2 - 0.025), y: -0.045, z: d / 2 });
    }
    // slatted floor â€” the striped-shadow signature
    for (let z = 0.12; z < d - 0.09; z += 0.105) {
      items.push({ geom: box(width - 0.10, 0.02, 0.052, { segY: 1 }), x: 0, y: 0.0, z });
    }
    // corner posts + finials
    for (const sx of [-1, 1]) {
      for (const sz of [0.055, d - 0.055]) {
        items.push({ geom: box(0.03, 1.0, 0.03, { segY: 1 }), x: sx * (width / 2 - 0.03), y: 0.02, z: sz });
        items.push({ geom: cone(0.028, 0.075, 6), x: sx * (width / 2 - 0.03), y: 1.02, z: sz });
      }
    }
    // rails: front + sides, top and mid
    for (const [ry, rl, px, pz] of [
      [0, width - 0.05, 0, d - 0.055], [Math.PI / 2, d - 0.08, -(width / 2 - 0.03), d / 2], [Math.PI / 2, d - 0.08, width / 2 - 0.03, d / 2],
    ]) {
      items.push({ geom: box(rl, 0.032, 0.032, { segY: 1 }), x: px, y: 0.96, z: pz, ry });
      items.push({ geom: box(rl, 0.024, 0.024, { segY: 1 }), x: px, y: 0.5, z: pz, ry });
    }
    // balusters
    for (let x = -width / 2 + 0.14; x <= width / 2 - 0.10; x += 0.135) {
      items.push({ geom: box(0.016, 0.93, 0.016, { segY: 1 }), x, y: 0.02, z: d - 0.055 });
    }
    for (let z = 0.16; z < d - 0.11; z += 0.14) {
      for (const s of [-1, 1]) {
        items.push({ geom: box(0.016, 0.93, 0.016, { segY: 1 }), x: s * (width / 2 - 0.03), y: 0.02, z });
      }
    }
    // diagonal braces under each end back to the wall
    for (const s of [-1, 1]) {
      const bl = Math.hypot(0.72, d - 0.2);
      const g = box(0.038, bl, 0.038, { segY: 1 });
      g.rotateX(Math.atan2(d - 0.2, 0.72));
      items.push({ geom: g, x: s * (width / 2 - 0.10), y: -0.78, z: 0.06 });
    }
    batcher.definePart(id, compose(items), 'ironwork');
    // rust wash below the wall anchors
    if (!batcher.hasPart('fe:rust')) {
      const rg = quad(0.5, 0.9);
      rg.translate(0, -0.95, 0.015);
      batcher.definePart('fe:rust', rg, 'grimeStreak', { castShadow: false, receiveShadow: false });
    }
    return id;
  }

  function feMkStair(floorH, dir) {
    const fh = Math.round(floorH * 20) / 20;
    const id = `fe:stair:${fh}:${dir > 0 ? 'R' : 'L'}`;
    if (batcher.hasPart(id)) return id;
    const items = [];
    const rise = fh, run = fh * 0.55;                 // ~61Â° â€” NYC steep
    const ang = Math.atan2(rise, run);
    const slen = Math.hypot(rise, run) + 0.25;
    const zIn = 0.20, zOut = 0.72;                    // stair channel inside platform
    // stringer plates (vertical plates along the slope)
    for (const z of [zIn, zOut]) {
      const g = box(slen, 0.26, 0.035, { segY: 1 });
      g.translate(dir * (slen / 2 - 0.12), 0, 0);
      g.rotateZ(-dir * ang);
      items.push({ geom: g, x: 0, y: -0.10, z });
    }
    // treads
    const steps = Math.max(8, Math.round(rise / 0.26));
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      items.push({
        geom: box(0.25, 0.022, zOut - zIn + 0.02, { segY: 1 }),
        x: dir * (t * run), y: -t * rise, z: (zIn + zOut) / 2,
      });
    }
    // handrails + stanchions on both sides
    for (const z of [zIn - 0.02, zOut + 0.02]) {
      const g = box(slen - 0.1, 0.03, 0.03, { segY: 1 });
      g.translate(dir * ((slen - 0.1) / 2 - 0.10), 0, 0);
      g.rotateZ(-dir * ang);
      items.push({ geom: g, x: 0, y: 0.78, z });
      for (let s = 0; s < 3; s++) {
        const t = (s + 0.5) / 3;
        items.push({ geom: box(0.02, 0.86, 0.02, { segY: 1 }), x: dir * (t * run), y: -t * rise, z });
      }
    }
    batcher.definePart(id, compose(items), 'ironwork');
    return id;
  }

  function feMkLadder(len) {
    const L = Math.max(1.6, Math.round(len * 4) / 4);
    const id = `fe:ladder:${L}`;
    if (batcher.hasPart(id)) return id;
    const items = [];
    const ang = 1.19;                                 // ~68Â° from horizontal
    for (const z of [0.18, 0.62]) {
      const g = box(0.04, L, 0.06, { segY: 1 });
      g.rotateZ(-(Math.PI / 2 + ang));                // +Y -> descending +x
      items.push({ geom: g, x: 0, y: 0, z });
    }
    const rungs = Math.floor(L / 0.3);
    for (let r = 1; r <= rungs; r++) {
      const t = r / (rungs + 1);
      items.push({
        geom: box(0.028, 0.028, 0.46, { segY: 1 }),
        x: t * L * Math.cos(ang), y: -t * L * Math.sin(ang), z: 0.4,
      });
    }
    batcher.definePart(id, compose(items), 'ironwork');
    return id;
  }

  K.fireEscape = function ({ width = 3.0, floors = 4, floorH = 2.9, firstY = 4.2, dropLadder = true }, baseMatrix, { tint = null } = {}) {
    width = [2.4, 3.0, 3.6].reduce((a, b) => Math.abs(b - width) < Math.abs(a - width) ? b : a);
    const platId = feMkPlatform(width);
    // paint varies per building: black, rust-brown, oxide red, dark green (a
    // block of identical escapes was a leading render tell)
    const FE_TINTS = [
      new THREE.Color(0.10, 0.095, 0.09), new THREE.Color(0.19, 0.13, 0.10),
      new THREE.Color(0.16, 0.10, 0.09), new THREE.Color(0.10, 0.14, 0.11),
      new THREE.Color(0.12, 0.115, 0.11),
    ];
    const feh = Math.abs(Math.sin(baseMatrix.elements[12] * 1.3 + baseMatrix.elements[14] * 2.1));
    const dark = tint || FE_TINTS[Math.floor(feh * FE_TINTS.length) % FE_TINTS.length];
    for (let f = 0; f < floors; f++) {
      const y = firstY + f * floorH;
      batcher.addInstance(platId, baseMatrix.clone().multiply(tmat(0, y, 0.02)), dark);
      // rust bleeding from the anchor points every other floor
      if (f % 2 === 0) {
        for (const s of [-1, 1]) {
          batcher.addInstance('fe:rust', baseMatrix.clone().multiply(tmat(s * (width / 2 - 0.12), y, 0.0)),
            new THREE.Color(0.28, 0.14, 0.07));
        }
      }
      if (f < floors - 1) {
        // stair from the platform above down to this one, alternating side
        const dir = f % 2 === 0 ? 1 : -1;
        const run = floorH * 0.55;
        const xTop = dir > 0 ? -width / 2 + 0.45 : width / 2 - 0.45;
        const stairId = feMkStair(floorH, dir);
        batcher.addInstance(stairId, baseMatrix.clone().multiply(tmat(xTop, y + floorH, 0.02)), dark);
      }
    }
    // stowed drop ladder (skippable where it would cross a sign band)
    if (dropLadder) {
      const ladLen = Math.min(2.6, Math.max(1.6, (firstY - 2.1) / Math.sin(1.19)));
      const ladId = feMkLadder(ladLen);
      const ladDir = (floors > 1 ? -1 : 1);
      batcher.addInstance(ladId,
        baseMatrix.clone().multiply(tmat(ladDir * (width / 2 - 0.55), firstY - 0.03, 0.02)), dark);
    }
  };

  // ==========================================================================
  // STOOP â€” brownstone entry stair with cheek walls + iron rails.
  // Anchored: x centered on door bay, y=0 sidewalk, z=0 at wall face, extends +z.
  // ==========================================================================
  K.stoop = function ({ width = 1.7, height = 2.2, mat = 'brownstone' }, matrix, { tint = null, railTint = null } = {}) {
    const steps = Math.max(6, Math.round(height / 0.19));
    const id = `stoop:${mat}:${q05(width)}:${steps}`;
    const run = steps * 0.28;
    if (!batcher.hasPart(id)) {
      const items = [];
      const stepH = height / steps;
      for (let s = 0; s < steps; s++) {
        const g = box(width, stepH, run - s * 0.28, { segY: 1 });
        boxUV(g, width, stepH, run - s * 0.28, 2);
        items.push({ geom: g, x: 0, y: s * stepH, z: (run - s * 0.28) / 2 });
      }
      // cheek walls
      for (const side of [-1, 1]) {
        const g = box(0.24, height + 0.25, run + 0.15, { segY: 2 });
        boxUV(g, 0.24, height + 0.25, run + 0.2, 2);
        items.push({ geom: g, x: side * (width / 2 + 0.12), y: 0, z: (run + 0.15) / 2 });
        // newel post at base
        const np = box(0.3, 0.9, 0.3, { segY: 1 });
        boxUV(np, 0.3, 0.9, 0.3, 2);
        items.push({ geom: np, x: side * (width / 2 + 0.12), y: 0, z: run + 0.02 });
      }
      batcher.definePart(id, compose(items), mat);
    }
    batcher.addInstance(id, matrix, tint);
    // iron handrails on top of cheek walls
    const railId = `stoop:rail:${steps}`;
    if (!batcher.hasPart(railId)) {
      const items = [];
      const ang = Math.atan2(height, run);
      const slen = Math.hypot(height, run) * 0.98;
      items.push({ geom: box(0.04, slen, 0.04, { segY: 1 }), x: 0, y: 0, z: 0, rx: Math.PI / 2 - ang });
      const n = Math.round(slen / 0.35);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        items.push({ geom: box(0.022, 0.62, 0.022, { segY: 1 }), x: 0, y: height * (1 - t) + 0.02 - 0.0, z: run * t, });
      }
      const g = compose(items);
      g.translate(0, 0.86, 0);
      batcher.definePart(railId, g, 'ironwork');
    }
    for (const side of [-1, 1]) {
      batcher.addInstance(railId, matrix.clone().multiply(tmat(side * (width / 2 + 0.12), 0.25, 0)), railTint);
    }
    return { run, steps };
  };

  // ==========================================================================
  // DOOR UNITS â€” paneled double door w/ transom, recessed. Anchor: x centered,
  // y=0 at threshold, z=0 wall face.
  // ==========================================================================
  K.door = function ({ w = 1.4, h = 2.6, style = 'paneled', transom = true }, matrix, { tint = null, surroundTint = null } = {}) {
    w = q05(w); h = q05(h);
    const id = `door:${style}:${w}x${h}:${transom ? 't' : ''}`;
    if (!batcher.hasPart(id)) {
      const items = [];
      const rd = 0.38;                                    // deep entrance reveal
      const mkDark = (g) => { ensureColor(g, DARK); return g; };
      items.push({ geom: mkDark(box(w + 0.04, 0.03, rd, { segY: 1 })), x: 0, y: h, z: -rd / 2 });
      items.push({ geom: mkDark(box(0.03, h, rd, { segY: 1 })), x: -w / 2, y: 0, z: -rd / 2 });
      items.push({ geom: mkDark(box(0.03, h, rd, { segY: 1 })), x: w / 2, y: 0, z: -rd / 2 });
      const doorH = transom ? h - 0.55 : h;
      // door slab(s) with recessed panels
      const leaves = w > 1.15 ? 2 : 1;
      const lw = (w - 0.06) / leaves;
      for (let l = 0; l < leaves; l++) {
        const cx = -w / 2 + 0.03 + lw * (l + 0.5);
        items.push({ geom: box(lw - 0.02, doorH, 0.06, { segY: 1 }), x: cx, y: 0, z: -rd + 0.05 });
        // panels (proud boxes)
        for (const [py, ph] of [[doorH * 0.12, doorH * 0.3], [doorH * 0.52, doorH * 0.34]]) {
          items.push({ geom: box(lw * 0.62, ph, 0.025, { segY: 1 }), x: cx, y: py, z: -rd + 0.09 });
        }
      }
      if (transom) {
        items.push({ geom: box(w, 0.06, 0.05, { segY: 1 }), x: 0, y: doorH, z: -rd + 0.06 });
      }
      batcher.definePart(id, compose(items), 'doorPaint');
      if (transom) {
        const g = quad(w - 0.1, h - doorH - 0.12);
        g.translate(0, 0, -rd + 0.04);
        batcher.definePart(id + ':transom', g, 'glass', { castShadow: false });
        const lg = quad(w - 0.12, h - doorH - 0.14);
        lg.translate(0, 0, -rd + 0.052);
        batcher.definePart(id + ':lit', lg, 'litWindow', { castShadow: false, receiveShadow: false, visible: false });
      }
    }
    batcher.addInstance(id, matrix, tint);
    if (transom) {
      const tm = matrix.clone().multiply(tmat(0, h - 0.5, 0));
      batcher.addInstance(id + ':transom', tm);
      batcher.addInstance(id + ':lit', tm);
    }
  };

  // ==========================================================================
  // WATER TOWER â€” the NYC icon. Anchor: y=0 at roof surface, centered.
  // ==========================================================================
  // Tank archetypes by POSITION hash: 0 staved wood + conical hat (classic),
  // 1 flat-top wood, 2 black steel cylinder, 3 square steel on lattice.
  K.waterTower = function (matrix, { tint = null, legH = 2.6, r = 2.0, hBody = 3.4, kind = null } = {}) {
    // quantize so varied sizes still share instanced geometry
    const q3 = (v) => Math.round(v / 0.35) * 0.35;
    legH = q3(legH); r = Math.round(r / 0.15) * 0.15; hBody = q3(hBody);
    if (kind === null) {
      const px = matrix.elements[12], pz = matrix.elements[14];
      let hsh = Math.floor(px * 3.17 + pz * 11.3 + 5e4) >>> 0;
      hsh = ((hsh ^ (hsh >>> 11)) * 2654435761) >>> 0;
      kind = [0, 0, 0, 1, 2, 2, 3][hsh % 7];
    }
    if (kind === 2 || kind === 3) {
      const skey = `wtower:steel${kind}:${legH}:${r}:${hBody}`;
      if (!batcher.hasPart(skey)) {
        const items = [];
        for (let l = 0; l < 4; l++) {
          const a = (l / 4) * Math.PI * 2 + Math.PI / 4;
          items.push({ geom: box(0.12, legH + 0.3, 0.12, { segY: 1 }), x: Math.cos(a) * r * 0.8, y: 0, z: Math.sin(a) * r * 0.8 });
        }
        items.push({ geom: box(r * 1.7, 0.12, 0.12, { segY: 1 }), x: 0, y: legH * 0.5, z: r * 0.8 * Math.sin(Math.PI / 4) });
        items.push({ geom: box(r * 1.7, 0.12, 0.12, { segY: 1 }), x: 0, y: legH * 0.5, z: -r * 0.8 * Math.sin(Math.PI / 4) });
        if (kind === 2) {
          const tank = cylinder(r, r, hBody, 20);
          const tuv = tank.attributes.uv;                       // panel seams every 0.6m
          for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * (2 * Math.PI * r) / 0.6, tuv.getY(i) * hBody / 0.6);
          items.push({ geom: tank, x: 0, y: legH, z: 0 });
          items.push({ geom: cylinder(r * 0.98, r * 1.02, 0.25, 20), x: 0, y: legH + hBody, z: 0 });
          for (const hy of [hBody * 0.33, hBody * 0.66]) {       // hoop bands
            const hoop = cylinder(r * 1.025, r * 1.025, 0.08, 20, true);
            ensureColor(hoop, new THREE.Color(0.55, 0.55, 0.56));
            items.push({ geom: hoop, x: 0, y: legH + hy, z: 0 });
          }
        } else {
          const bx = box(r * 1.8, hBody, r * 1.8, { segY: 1 });
          boxUV(bx, r * 1.8, hBody, r * 1.8, 0.6);
          items.push({ geom: bx, x: 0, y: legH, z: 0 });
          items.push({ geom: box(r * 1.9, 0.15, r * 1.9, { segY: 1 }), x: 0, y: legH + hBody, z: 0 });
          // corner angles + two horizontal stiffener bands (riveted-plate read)
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const ang = box(0.1, hBody, 0.1, { segY: 1 });
              ensureColor(ang, new THREE.Color(0.7, 0.7, 0.72));
              items.push({ geom: ang, x: sx * r * 0.9, y: legH, z: sz * r * 0.9 });
            }
          }
          for (const by of [hBody * 0.33, hBody * 0.66]) {
            const band = box(r * 1.86, 0.08, r * 1.86, { segY: 1 });
            ensureColor(band, new THREE.Color(0.66, 0.66, 0.68));
            items.push({ geom: band, x: 0, y: legH + by, z: 0 });
          }
        }
        items.push({ geom: cylinder(0.09, 0.09, legH + 0.4, 8), x: 0, y: 0, z: 0 });
        // access ladder like the wood tanks
        const ladH = legH + hBody + 0.3;
        items.push({ geom: box(0.035, ladH, 0.035, { segY: 1 }), x: r + 0.12, y: 0, z: -0.16 });
        items.push({ geom: box(0.035, ladH, 0.035, { segY: 1 }), x: r + 0.12, y: 0, z: 0.16 });
        for (let ry2 = 0.25; ry2 < ladH; ry2 += 0.34) {
          items.push({ geom: box(0.026, 0.026, 0.32, { segY: 1 }), x: r + 0.12, y: ry2, z: 0 });
        }
        batcher.definePart(skey, compose(items), 'steelBlack');
      }
      // per-instance lightness jitter so no two steel tanks match
      const jit = 0.82 + (((matrix.elements[12] * 13.3 + matrix.elements[14] * 7.7) % 1 + 1) % 1) * 0.36;
      batcher.addInstance(skey, matrix, new THREE.Color().setScalar(jit));
      return;
    }
    const key = `wtower:${kind}:${legH}:${r}:${hBody}`;
    if (!batcher.hasPart(key + ':tank')) {
      // tank: slightly tapered stave cylinder
      const items = [];
      const tank = cylinder(r * 0.94, r, hBody, 20);
      // stave texture wraps: scale UVs so tileâ‰ˆ1m
      const uv = tank.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r), uv.getY(i) * hBody);
      items.push({ geom: tank, x: 0, y: legH, z: 0 });
      batcher.definePart(key + ':tank', compose(items), 'woodStave');

      const steel = [];
      // 4 legs, splayed
      for (let l = 0; l < 4; l++) {
        const a = (l / 4) * Math.PI * 2 + Math.PI / 4;
        const lx = Math.cos(a) * r * 0.82, lz = Math.sin(a) * r * 0.82;
        const leg = box(0.12, legH + 0.4, 0.12, { segY: 1 });
        steel.push({ geom: leg, x: lx, y: 0, z: lz });
      }
      // cross bracing (X) between legs â€” thin diagonals
      for (let l = 0; l < 4; l++) {
        const a1 = (l / 4) * Math.PI * 2 + Math.PI / 4;
        const a2 = ((l + 1) / 4) * Math.PI * 2 + Math.PI / 4;
        const x1 = Math.cos(a1) * r * 0.82, z1 = Math.sin(a1) * r * 0.82;
        const x2 = Math.cos(a2) * r * 0.82, z2 = Math.sin(a2) * r * 0.82;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        const len = Math.hypot(x2 - x1, z2 - z1, legH);
        const ry = Math.atan2(x2 - x1, z2 - z1);
        const g1 = box(0.05, len, 0.05, { segY: 1 }); g1.rotateX(Math.atan2(Math.hypot(x2 - x1, z2 - z1), legH));
        const g2 = box(0.05, len, 0.05, { segY: 1 }); g2.rotateX(-Math.atan2(Math.hypot(x2 - x1, z2 - z1), legH)); g2.translate(0, legH, 0);
        // orient along the chord
        g1.rotateY(ry); g2.rotateY(ry);
        steel.push({ geom: g1, x: mx, y: 0, z: mz });
        steel.push({ geom: g2, x: mx, y: 0, z: mz });
      }
      // hoops
      for (const hy of [0.5, 1.6, 2.7]) {
        const hoop = cylinder(r * (1.005 - 0.017 * (hy / hBody)), r * (1.005 - 0.017 * (hy / hBody)), 0.06, 20, true);
        steel.push({ geom: hoop, x: 0, y: legH + hy, z: 0 });
      }
      // standpipe
      steel.push({ geom: cylinder(0.09, 0.09, legH + 0.4, 8), x: 0, y: 0, z: 0 });
      // access ladder up the tank side
      const ladH = legH + hBody + 0.3;
      steel.push({ geom: box(0.035, ladH, 0.035, { segY: 1 }), x: r + 0.12, y: 0, z: -0.16 });
      steel.push({ geom: box(0.035, ladH, 0.035, { segY: 1 }), x: r + 0.12, y: 0, z: 0.16 });
      for (let ry2 = 0.25; ry2 < ladH; ry2 += 0.34) {
        steel.push({ geom: box(0.026, 0.026, 0.32, { segY: 1 }), x: r + 0.12, y: ry2, z: 0 });
      }
      batcher.definePart(key + ':steel', compose(steel), 'steelDark');

      // conical roof + hatch (kind 0) or flat lid with rim (kind 1)
      const roof = [];
      if (kind === 1) {
        roof.push({ geom: cylinder(r * 1.04, r * 1.04, 0.14, 20), x: 0, y: legH + hBody - 0.04, z: 0 });
        roof.push({ geom: box(0.6, 0.35, 0.6, { segY: 1 }), x: -r * 0.35, y: legH + hBody + 0.1, z: 0 });
      } else {
        roof.push({ geom: cone(r * 1.06, r * 0.55, 20), x: 0, y: legH + hBody - 0.03, z: 0 });
        roof.push({ geom: box(0.5, 0.4, 0.5, { segY: 1 }), x: r * 0.4, y: legH + hBody + 0.12, z: 0 });
      }
      batcher.definePart(key + ':roof', compose(roof), 'roofBlack');
    }
    batcher.addInstance(key + ':tank', matrix, tint);
    batcher.addInstance(key + ':steel', matrix);
    batcher.addInstance(key + ':roof', matrix);
  };

  // ==========================================================================
  // ROOF GEAR â€” bulkhead, HVAC, vents, chimney, antenna. Anchors: y=0 roof.
  // ==========================================================================
  K.bulkhead = function (matrix, { w = 2.6, d = 2.2, h = 2.4, mat = 'stucco', tint = null } = {}) {
    const id = `bulkhead:${mat}:${q05(w)}x${q05(d)}x${q05(h)}`;
    if (!batcher.hasPart(id)) {
      const items = [];
      const wall = box(w, h, d, { segY: 2 }); boxUV(wall, w, h, d, 2);
      items.push({ geom: wall, x: 0, y: 0, z: 0 });
      const cap = box(w + 0.15, 0.09, d + 0.15, { segY: 1 }); boxUV(cap, w + 0.15, 0.09, d + 0.15, 2);
      items.push({ geom: cap, x: 0, y: h, z: 0 });
      const door = box(0.95, 2.0, 0.07, { segY: 1 });
      ensureColor(door, new THREE.Color(0.22, 0.2, 0.19));
      items.push({ geom: door, x: 0, y: 0, z: d / 2 });
      batcher.definePart(id, compose(items), mat);
    }
    batcher.addInstance(id, matrix, tint);
  };

  K.hvac = function (matrix, { tint = null } = {}) {
    const id = 'roof:hvac';
    if (!batcher.hasPart(id)) {
      const items = [];
      items.push({ geom: box(1.5, 0.95, 0.9, { segY: 1 }), x: 0, y: 0.12, z: 0 });
      items.push({ geom: box(0.1, 0.12, 0.1, { segY: 1 }), x: -0.6, y: 0, z: -0.3 });
      items.push({ geom: box(0.1, 0.12, 0.1, { segY: 1 }), x: 0.6, y: 0, z: -0.3 });
      items.push({ geom: box(0.1, 0.12, 0.1, { segY: 1 }), x: -0.6, y: 0, z: 0.3 });
      items.push({ geom: box(0.1, 0.12, 0.1, { segY: 1 }), x: 0.6, y: 0, z: 0.3 });
      const fan = cylinder(0.32, 0.32, 0.08, 14);
      ensureColor(fan, new THREE.Color(0.25, 0.25, 0.26));
      items.push({ geom: fan, x: -0.3, y: 1.07, z: 0 });
      const fan2 = cylinder(0.32, 0.32, 0.08, 14);
      ensureColor(fan2, new THREE.Color(0.25, 0.25, 0.26));
      items.push({ geom: fan2, x: 0.42, y: 1.07, z: 0 });
      batcher.definePart(id, compose(items), 'aluminum');
    }
    batcher.addInstance(id, matrix, tint);
  };

  K.vent = function (matrix, { kind = 'pipe', tint = null } = {}) {
    const id = `roof:vent:${kind}`;
    if (!batcher.hasPart(id)) {
      let g;
      if (kind === 'goose') {
        g = compose([
          { geom: cylinder(0.14, 0.14, 1.1, 10), x: 0, y: 0, z: 0 },
          { geom: cylinder(0.16, 0.16, 0.34, 10), x: 0, y: 1.02, z: 0.12, rx: Math.PI / 2 },
        ]);
      } else if (kind === 'whirly') {
        g = compose([
          { geom: cylinder(0.11, 0.11, 0.8, 8), x: 0, y: 0, z: 0 },
          { geom: new THREE.SphereGeometry(0.24, 10, 8), x: 0, y: 1.0, z: 0 },
        ]);
      } else {
        g = cylinder(0.09, 0.11, 0.9, 8);
      }
      batcher.definePart(id, g, 'aluminum');
    }
    batcher.addInstance(id, matrix, tint);
  };

  K.chimney = function (matrix, { w = 0.7, h = 1.6, mat = 'brickRed', tint = null } = {}) {
    const id = `roof:chimney:${mat}:${q05(w)}x${q05(h)}`;
    if (!batcher.hasPart(id)) {
      const items = [];
      const g = box(w, h, w, { segY: 1 }); boxUV(g, w, h, w, 2);
      items.push({ geom: g, x: 0, y: 0, z: 0 });
      const cap = box(w + 0.1, 0.09, w + 0.1, { segY: 1 }); boxUV(cap, w + 0.1, 0.09, w + 0.1, 2);
      ensureColor(cap, new THREE.Color(0.6, 0.58, 0.55));
      items.push({ geom: cap, x: 0, y: h, z: 0 });
      const flue = cylinder(0.09, 0.09, 0.28, 8);
      ensureColor(flue, new THREE.Color(0.3, 0.22, 0.18));
      items.push({ geom: flue, x: -w * 0.2, y: h + 0.09, z: 0 });
      const flue2 = cylinder(0.09, 0.09, 0.22, 8);
      ensureColor(flue2, new THREE.Color(0.3, 0.22, 0.18));
      items.push({ geom: flue2, x: w * 0.2, y: h + 0.09, z: 0 });
      batcher.definePart(id, compose(items), mat);
    }
    batcher.addInstance(id, matrix, tint);
  };

  K.dish = function (matrix, { tint = null } = {}) {
    if (!batcher.hasPart('roof:dish')) {
      const bowl = new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, 0.7);
      bowl.scale(1, 0.45, 1);
      bowl.rotateX(1.15);
      bowl.translate(0, 0.75, 0.1);
      const g = compose([
        { geom: cylinder(0.03, 0.035, 0.75, 6), x: 0, y: 0, z: 0 },
        { geom: bowl, x: 0, y: 0, z: 0 },
        { geom: box(0.025, 0.025, 0.3, { segY: 1 }), x: 0, y: 0.62, z: 0.22 },
      ]);
      batcher.definePart('roof:dish', g, 'aluminum');
    }
    batcher.addInstance('roof:dish', matrix, tint || new THREE.Color(0.85, 0.85, 0.83));
  };

  K.antenna = function (matrix, { tint = null } = {}) {
    const id = 'roof:antenna';
    if (!batcher.hasPart(id)) {
      const g = compose([
        { geom: cylinder(0.025, 0.03, 3.2, 6), x: 0, y: 0, z: 0 },
        { geom: box(0.9, 0.02, 0.02, { segY: 1 }), x: 0, y: 2.5, z: 0 },
        { geom: box(0.7, 0.02, 0.02, { segY: 1 }), x: 0, y: 2.8, z: 0, ry: 0.5 },
        { geom: box(0.5, 0.02, 0.02, { segY: 1 }), x: 0, y: 3.1, z: 0, ry: 1.1 },
      ]);
      batcher.definePart(id, g, 'aluminum');
    }
    batcher.addInstance(id, matrix, tint);
  };

  // ==========================================================================
  // AC UNIT â€” window air conditioner, anchor: bottom of window opening.
  // ==========================================================================
  K.acUnit = function (matrix, { tint = null } = {}) {
    const id = 'acUnit';
    if (!batcher.hasPart(id)) {
      const items = [];
      const body = box(0.62, 0.4, 0.55, { segY: 1 });
      items.push({ geom: body, x: 0, y: 0, z: -0.14 });
      const grille = box(0.56, 0.3, 0.02, { segY: 1 });
      ensureColor(grille, new THREE.Color(0.35, 0.36, 0.37));
      items.push({ geom: grille, x: 0, y: 0.05, z: 0.14 });
      const g = compose(items);
      g.rotateX(-0.035); // slight outward tilt
      batcher.definePart(id, g, 'aluminum');
    }
    batcher.addInstance(id, matrix, tint);
  };

  // ==========================================================================
  // STOREFRONT â€” bulkhead, glazing w/ mullions, recessed entry, sign band,
  // optional awning or roll gate. Anchor: x centered on bay, y=0 sidewalk,
  // z=0 wall face. Width = bay width. Height to top of sign ~3.9m.
  // ==========================================================================
  K.storefront = function ({ width = 5.4, signIndex = 0, awningIndex = -1, gate = 0, entrySide = 1 }, matrix, { frameTint = null } = {}) {
    const sfH = 2.9;          // glass top
    const signH = 0.75;
    const rd = 0.18;
    const w = width - 0.5;    // inset from piers
    // â€” merged pieces (unique widths): bulkhead, sign board â€”
    // bulkhead
    const bulk = box(w, 0.55, 0.12, { segY: 1 });
    ensureColor(bulk, new THREE.Color(0.16, 0.15, 0.15));
    batcher.addMerged('paintFlat', bulk, matrix.clone().multiply(tmat(0, 0.02, -rd + 0.06)), { worldUV: false });
    // sign board quad (atlas cell)
    const uv = extra.signUvFor(signIndex % extra.signCount);
    const sign = quad(w + 0.1, signH, uv);
    batcher.addMerged('signs', sign, matrix.clone().multiply(tmat(0, sfH + 0.12, 0.10)), { worldUV: false });
    // sign box sides
    const sbox = box(w + 0.18, signH + 0.08, 0.14, { segY: 1 });
    ensureColor(sbox, new THREE.Color(0.12, 0.11, 0.11));
    batcher.addMerged('paintFlat', sbox, matrix.clone().multiply(tmat(0, sfH + 0.08, 0.02)), { worldUV: false });
    // night-only spill pool on the sidewalk below the sign band
    if (!batcher.hasPart('light:pool')) {
      const pq = new THREE.PlaneGeometry(12, 12);
      pq.rotateX(-Math.PI / 2);
      batcher.definePart('light:pool', pq, 'lightPool', { castShadow: false, receiveShadow: false, visible: false });
    }
    // two overlapping jittered pools: a single ellipse reads as an airbrush disc
    const pj = Math.abs(Math.sin(matrix.elements[12] * 2.3 + matrix.elements[14] * 1.7));
    batcher.addInstance('light:pool', matrix.clone().multiply(tmat(-0.9 - pj * 0.6, 0.16, 1.4, 0.3, 0.5 + pj * 0.15, 1, 0.34)),
      new THREE.Color(0.7, 0.6, 0.48));
    batcher.addInstance('light:pool', matrix.clone().multiply(tmat(0.8 + pj * 0.5, 0.16, 1.7, -0.25, 0.42 + pj * 0.2, 1, 0.3)),
      new THREE.Color(0.7, 0.62, 0.5));

    // â€” instanced glazing: quantized â€”
    const gw = q05(Math.min(w - 0.1, 7));
    const glId = `sf:glass:${gw}`;
    if (!batcher.hasPart(glId)) {
      const g = quad(gw, sfH - 0.62);
      g.translate(0, 0.6, -rd + 0.02);
      batcher.definePart(glId, g, 'glass', { castShadow: false });
      // shallow lit interior behind the glazing: floor, back wall, shelf rows
      const inr = [];
      const idp = 1.1;
      const mk = (g2, c) => { ensureColor(g2, c); return g2; };
      // unlit fills (roomFill): these values ARE what shows through the glass
      // bright enough to read THROUGH 30%-opacity glass by day: a lit shop
      // interior, not a black card
      inr.push({ geom: mk(box(gw, sfH - 0.7, 0.05, { segY: 1 }), new THREE.Color(0.42, 0.38, 0.32)), x: 0, y: 0.55, z: -rd - idp });
      inr.push({ geom: mk(box(gw, 0.05, idp, { segY: 1 }), new THREE.Color(0.30, 0.27, 0.22)), x: 0, y: 0.55, z: -rd - idp / 2 });
      for (const sy of [1.15, 1.75]) {
        inr.push({ geom: mk(box(gw * 0.86, 0.5, 0.3, { segY: 1 }), new THREE.Color(0.50, 0.44, 0.36)), x: 0, y: sy, z: -rd - idp + 0.35 });
      }
      batcher.definePart(glId + ':interior', compose(inr), 'shopFill', { castShadow: false, receiveShadow: false });
      // warm ceiling light bands (two rows) => reads as store lighting
      const strip = compose([
        { geom: box(gw * 0.9, 0.07, 0.45, { segY: 1 }), x: 0, y: 0, z: 0 },
        { geom: box(gw * 0.9, 0.07, 0.45, { segY: 1 }), x: 0, y: -0.75, z: -0.45 },
      ]);
      batcher.definePart(glId + ':lights', strip, 'litWindow', { castShadow: false, receiveShadow: false });
      // mullion frame
      const items = [];
      const nM = Math.max(1, Math.round(gw / 1.4));
      for (let i = 0; i <= nM; i++) {
        const x = -gw / 2 + (gw / nM) * i;
        items.push({ geom: box(0.055, sfH - 0.6, 0.07, { segY: 1 }), x, y: 0.6, z: -rd + 0.03 });
      }
      items.push({ geom: box(gw, 0.06, 0.07, { segY: 1 }), x: 0, y: sfH - 0.06, z: -rd + 0.03 });
      items.push({ geom: box(gw, 0.05, 0.09, { segY: 1 }), x: 0, y: 0.55, z: -rd + 0.03 });
      // transom divider
      items.push({ geom: box(gw, 0.05, 0.07, { segY: 1 }), x: 0, y: sfH - 0.7, z: -rd + 0.03 });
      batcher.definePart(glId + ':frame', compose(items), 'steelDark');
    }
    batcher.addInstance(glId, matrix.clone().multiply(tmat(0, 0, 0)));
    batcher.addInstance(glId + ':frame', matrix.clone().multiply(tmat(0, 0, 0)), frameTint);
    if (gate !== 2) {
      batcher.addInstance(glId + ':interior', matrix.clone());
      batcher.addInstance(glId + ':lights', matrix.clone().multiply(tmat(0, sfH - 0.85, -0.6)),
        new THREE.Color(1, 0.92, 0.78));
    }

    if (gate > 0) {
      // rolled-down security gate covering part or all
      const gwidth = gate === 2 ? w : Math.min(2.2, w * 0.4);
      const gx = gate === 2 ? 0 : entrySide * (w / 2 - gwidth / 2);
      const gg = quad(gwidth, sfH - 0.25);
      const gu = gg.attributes.uv;
      for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * gwidth, gu.getY(i) * (sfH - 0.25));
      batcher.addMerged(gate === 2 ? 'rollGateTagged' : 'rollGate', gg, matrix.clone().multiply(tmat(gx, 0.02, -rd + 0.055)), { worldUV: false });
      // gate housing
      const hs = box(gwidth + 0.1, 0.3, 0.3, { segY: 1 });
      ensureColor(hs, new THREE.Color(0.3, 0.3, 0.31));
      batcher.addMerged('paintFlat', hs, matrix.clone().multiply(tmat(gx, sfH - 0.28, -rd + 0.1)), { worldUV: false });
    }

    if (awningIndex >= 0) {
      const aw = q05(Math.min(w * 0.92, 6.5));
      const aId = `awning:${aw}:${awningIndex % extra.awningCount}`;
      if (!batcher.hasPart(aId)) {
        // Anchor = top edge at the wall (y=0, z=0); fabric slopes DOWN and OUT.
        const auv = extra.awningUvFor(awningIndex % extra.awningCount);
        const theta = 0.72;                          // slope from horizontal
        const L = 1.35;
        const drop = L * Math.sin(theta), zOut = L * Math.cos(theta);
        const slope = quad(aw, L, auv);              // vertical, y∈[0,L]
        slope.rotateX(-Math.PI / 2);                 // lie flat, spans z∈[-L,0]... normalize:
        slope.translate(0, 0, 0);
        // after rotateX(-90°): y∈[0,L] -> z∈[0,-L]? Rebuild deterministically:
        const s2 = new THREE.PlaneGeometry(aw, L);
        const suv = s2.attributes.uv;
        suv.setXY(0, auv.u0, auv.v1); suv.setXY(1, auv.u1, auv.v1);
        suv.setXY(2, auv.u0, auv.v0); suv.setXY(3, auv.u1, auv.v0);
        s2.rotateX(-Math.PI / 2 + theta);            // flat then tipped down-out
        s2.translate(0, -drop / 2, zOut / 2);        // top edge -> origin
        // valance hanging from the outer edge
        const auv2 = { ...auv, v1: auv.v0 + (auv.v1 - auv.v0) * 0.25 };
        const val = quad(aw, 0.3, auv2);
        val.translate(0, -drop - 0.3, zOut - 0.015);
        // side gusset panels (wall-top, outer-bottom, wall-bottom)
        const mkGusset = (sx) => {
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            sx, 0, 0, sx, -drop, zOut, sx, -drop, 0,
          ]), 3));
          tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
            auv.u0, auv.v1, auv.u1, auv.v0, auv.u0, auv.v0,
          ]), 2));
          tri.computeVertexNormals();
          return tri;
        };
        // shaded soffit so the underside reads as an underside
        const soffit = new THREE.PlaneGeometry(aw - 0.02, Math.hypot(drop, zOut) - 0.02);
        const sfuv = soffit.attributes.uv;
        sfuv.setXY(0, auv.u0, auv.v1); sfuv.setXY(1, auv.u1, auv.v1);
        sfuv.setXY(2, auv.u0, auv.v0); sfuv.setXY(3, auv.u1, auv.v0);
        soffit.rotateX(Math.PI / 2 + theta);
        soffit.translate(0, -drop / 2 - 0.01, zOut / 2 - 0.005);
        ensureColor(soffit, new THREE.Color(0.45, 0.42, 0.4));
        const parts = [s2, mkGusset(-aw / 2), mkGusset(aw / 2), val, soffit];
        for (const p of parts) ensureColor(p);
        const merged = compose(parts.map((p) => ({ geom: p })));
        batcher.definePart(aId, merged, 'awning', { castShadow: true });
      }
      batcher.addInstance(aId, matrix.clone().multiply(tmat(0, sfH + 0.05, 0.02)));
    }
  };

  // ==========================================================================
  // AREAWAY FENCE (brownstone front yards) â€” anchor x centered, y=0, runs along X.
  // ==========================================================================
  K.fence = function (len, matrix, { tint = null } = {}) {
    len = Math.max(1, Math.round(len * 2) / 2);
    const id = `fence:${len}`;
    if (!batcher.hasPart(id)) {
      const items = [];
      const h = 0.95;
      items.push({ geom: box(len, 0.04, 0.04, { segY: 1 }), x: 0, y: h - 0.04, z: 0 });
      items.push({ geom: box(len, 0.035, 0.035, { segY: 1 }), x: 0, y: 0.15, z: 0 });
      for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.max(1, Math.round(len / 1.8))) {
        items.push({ geom: box(0.055, h + 0.12, 0.055, { segY: 1 }), x, y: 0, z: 0 });
        items.push({ geom: new THREE.SphereGeometry(0.05, 6, 5), x, y: h + 0.14, z: 0 });
      }
      for (let x = -len / 2 + 0.12; x < len / 2 - 0.06; x += 0.15) {
        items.push({ geom: box(0.02, h - 0.1, 0.02, { segY: 1 }), x, y: 0.1, z: 0 });
      }
      batcher.definePart(id, compose(items), 'ironwork');
    }
    batcher.addInstance(id, matrix, tint);
  };

  // ==========================================================================
  // STREET FURNITURE
  // ==========================================================================
  K.hydrant = function (matrix, { bodyTint = null, capTint = null } = {}) {
    if (!batcher.hasPart('hydrant:body')) {
      const body = compose([
        { geom: cylinder(0.16, 0.19, 0.12, 10), x: 0, y: 0, z: 0 },
        { geom: cylinder(0.115, 0.13, 0.5, 10), x: 0, y: 0.1, z: 0 },
        { geom: cylinder(0.09, 0.09, 0.12, 8), x: -0.16, y: 0.32, z: 0, rz: Math.PI / 2 },
        { geom: cylinder(0.09, 0.09, 0.12, 8), x: 0.16, y: 0.32, z: 0, rz: Math.PI / 2 },
        { geom: cylinder(0.095, 0.095, 0.14, 8), x: 0, y: 0.3, z: 0.1, rx: Math.PI / 2 },
      ]);
      batcher.definePart('hydrant:body', body, 'canvasFlat');
      const cap = compose([
        { geom: lathe([[0.13, 0], [0.12, 0.06], [0.07, 0.12], [0.02, 0.15], [0, 0.155]], 10), x: 0, y: 0.6, z: 0 },
      ]);
      batcher.definePart('hydrant:cap', cap, 'canvasFlat');
    }
    batcher.addInstance('hydrant:body', matrix, bodyTint || new THREE.Color(0.12, 0.12, 0.12));
    batcher.addInstance('hydrant:cap', matrix, capTint || new THREE.Color(0.75, 0.75, 0.72));
  };

  K.streetlight = function (matrix, { kind = 'cobra', tint = null } = {}) {
    const id = `light:${kind}`;
    if (!batcher.hasPart(id)) {
      let g;
      if (kind === 'crook') {
        // bishop's crook: pole + curl arcing over the sidewalk, pendant lamp
        const poleH = 4.5, Rc = 0.66;
        const C = { x: Rc, y: poleH };            // curl center right of pole top
        const items = [];
        const t0 = Math.PI, t1 = -Math.PI / 3, N = 12;
        for (let i = 0; i < N; i++) {
          const ta = t0 + (t1 - t0) * (i / N);
          const tb = t0 + (t1 - t0) * ((i + 1) / N);
          const tm = (ta + tb) / 2;
          const segLen = Math.abs(tb - ta) * Rc * 1.05;
          const gseg = cylinder(0.042, 0.042, segLen, 6);
          gseg.translate(0, -segLen / 2, 0);      // mid-centered so rz pivots correctly
          items.push({
            geom: gseg,
            x: C.x + Rc * Math.cos(tm), y: C.y + Rc * Math.sin(tm), z: 0,
            rz: tm,
          });
        }
        const curl = items;
        const tipX = C.x + Rc * Math.cos(t1), tipY = C.y + Rc * Math.sin(t1);
        g = compose([
          { geom: cylinder(0.07, 0.11, poleH, 8), x: 0, y: 0, z: 0 },
          { geom: cylinder(0.16, 0.12, 0.25, 8), x: 0, y: 0, z: 0 },
          { geom: cylinder(0.05, 0.06, 0.5, 6), x: 0, y: poleH - 0.5, z: 0 },
          ...curl,
          { geom: cylinder(0.03, 0.03, 0.3, 6), x: tipX, y: tipY - 0.28, z: 0 },
          { geom: lathe([[0.02, 0], [0.13, 0.06], [0.16, 0.24], [0.09, 0.38], [0.03, 0.44], [0, 0.46]], 10), x: tipX, y: tipY - 0.68, z: 0 },
        ]);
      } else {
        // cobra head davit
        const armLen = 3.4;
        g = compose([
          { geom: cylinder(0.09, 0.13, 7.6, 8), x: 0, y: 0, z: 0 },
          { geom: cylinder(0.055, 0.07, armLen, 7), x: armLen / 2 - 0.1, y: 7.45, z: 0, rz: Math.PI / 2 - 0.08 },
          { geom: box(0.72, 0.13, 0.3, { segY: 1 }), x: armLen - 0.4, y: 7.6, z: 0 },
        ]);
      }
      batcher.definePart(id, g, 'steelDark');
      // night parts: glow head + ground pool (hidden by day, toggled at night)
      if (!batcher.hasPart('light:glow')) {
        const gl = new THREE.SphereGeometry(0.21, 8, 6);
        batcher.definePart('light:glow', gl, 'lampGlow', { castShadow: false, receiveShadow: false, visible: false });
        const pq = new THREE.PlaneGeometry(8, 8);
        pq.rotateX(-Math.PI / 2);   // centered on origin, facing up
        batcher.definePart('light:pool', pq, 'lightPool', { castShadow: false, receiveShadow: false, visible: false });
      }
    }
    batcher.addInstance(id, matrix, tint || new THREE.Color(0.25, 0.27, 0.24));
    // lamp head world offset per kind
    const head = kind === 'crook' ? { x: 0.66 + 0.66 * Math.cos(-Math.PI / 3), y: 4.5 + 0.66 * Math.sin(-Math.PI / 3) - 0.5 }
      : { x: 3.0, y: 7.55 };
    batcher.addInstance('light:glow', matrix.clone().multiply(tmat(head.x, head.y, 0)));
    // pool floats just above pavement (lamp base sits on the 0.14 curb)
    batcher.addInstance('light:pool', matrix.clone().multiply(tmat(head.x, 0.05, 0)),
      new THREE.Color(1.0, 0.86, 0.6));
  };

  // Four species with genuinely different crown GEOMETRY (not just texture):
  //  0 London plane: broad, flat-topped, high crown       5.4 x 3.6, 6 cards
  //  1 Honeylocust : open, airy, layered                  4.2 x 4.6, 5 cards
  //  2 Callery pear: tight upright oval                   3.2 x 4.8, 4 cards
  //  3 Ginkgo      : narrow, slightly conical fan         2.9 x 5.0, 4 cards
  const TREE_SPECIES = [
    { w: 5.4, h: 3.6, base: 4.2, cards: 6, trunkH: 4.4, trunkR: 0.17, layers: [[0, 0], [0.5, 0.35], [-0.5, 0.2]] },
    { w: 4.2, h: 4.6, base: 3.6, cards: 5, trunkH: 4.0, trunkR: 0.13, layers: [[0, 0], [0.35, 0.9], [-0.3, 1.6]] },
    { w: 3.2, h: 4.8, base: 3.0, cards: 4, trunkH: 3.4, trunkR: 0.12, layers: [[0, 0], [0.15, 0.5]] },
    { w: 2.9, h: 5.0, base: 3.4, cards: 4, trunkH: 3.8, trunkR: 0.12, layers: [[0, 0], [0.1, 1.2]] },
  ];
  function treeParts(v) {
    const sp = TREE_SPECIES[v];
    if (batcher.hasPart(`tree:trunk${v}`)) return;
    // trunk tapers to a twig and ends INSIDE the crown; branch stubs fork
    batcher.definePart(`tree:trunk${v}`, compose([
      { geom: cylinder(0.045, sp.trunkR, sp.trunkH + sp.h * 0.35, 7), x: 0, y: 0, z: 0 },   // trunk ends inside the crown
      { geom: cylinder(0.03, 0.06, 1.3, 5), x: 0.10, y: sp.trunkH - 0.6, z: 0.05, rz: -0.6 },
      { geom: cylinder(0.03, 0.06, 1.1, 5), x: -0.08, y: sp.trunkH - 0.5, z: -0.04, rz: 0.55 },
      { geom: cylinder(0.025, 0.05, 0.9, 5), x: 0.02, y: sp.trunkH - 0.4, z: 0.1, rx: 0.5 },
    ]), 'bark');
    const items = [];
    // 10-14 tilted clump cards (vertical crossed cards read as hard flat planes)
    const nCards = sp.cards * 2 + 2;
    for (let i = 0; i < nCards; i++) {
      const ang = (i / nCards) * Math.PI * 2 + (i % 2) * 0.3;
      const lay = sp.layers[i % sp.layers.length];
      const scale = 0.35 + 0.65 * ((i * 7) % 3) / 2;
      const q = quad(sp.w * scale, sp.h * scale * (0.85 + 0.15 * (i % 2)));
      q.translate(0, -sp.h * scale * 0.5, 0);           // centre the card
      q.rotateX(((i * 13) % 7 - 3) * 0.11);              // ±0.35 rad tilt
      q.rotateZ(((i * 5) % 5 - 2) * 0.12);
      q.rotateY(ang);
      const r = sp.w * 0.38 * (0.35 + ((i * 3) % 4) / 4);   // clumps spread off one ring → no disc
      // big clumps sit low so the crown meets the trunk; small ones ride high
      const cy = sp.h * 0.42 + lay[1] * 0.3 - (1 - scale) * sp.h * 0.18 + scale * sp.h * 0.1;
      items.push({ geom: q, x: Math.cos(ang) * r + lay[0] * 0.3, y: cy, z: Math.sin(ang) * r + lay[0] * -0.25 });
    }
    // darker inner shell so the crown core isn't see-through
    for (let i = 0; i < 7; i++) {
      const q = quad(sp.w * 0.75, sp.h * 0.75);
      q.translate(0, -sp.h * 0.375, 0);
      q.rotateY((i / 7) * Math.PI);
      ensureColor(q, new THREE.Color(0.62, 0.66, 0.6));
      items.push({ geom: q, x: 0, y: sp.h * 0.5, z: 0 });
    }
    // top cap card for the flat-topped plane / layered locust silhouettes
    if (v <= 1) {
      const cap = quad(sp.w * 0.7, sp.w * 0.7);
      cap.rotateX(-Math.PI / 2);
      items.push({ geom: cap, x: 0, y: sp.h * 0.55, z: 0 });
    }
    const canopy = compose(items);
    canopy.translate(0, sp.base, 0);
    batcher.definePart(`tree:canopy${v}`, canopy, `canopy${v}`, { castShadow: true });
  }
  K.tree = function (matrix, { scale = 1, tint = null } = {}) {
    if (!batcher.hasPart('tree:pit')) {
      // recessed pit: granite curb ring raised 6cm, soil dropped 8cm inside
      const ring = [];
      for (const [x, z, w, d] of [[0, -0.7, 1.5, 0.1], [0, 0.7, 1.5, 0.1], [-0.7, 0, 0.1, 1.3], [0.7, 0, 0.1, 1.3]]) {
        const g = box(w, 0.2, d, { segY: 1 });
        ensureColor(g, new THREE.Color(0.58, 0.58, 0.6));
        ring.push({ geom: g, x, y: -0.14, z });
      }
      const soil = box(1.3, 0.03, 1.3, { segY: 1 });
      ensureColor(soil, new THREE.Color(0.24, 0.18, 0.13));
      ring.push({ geom: soil, x: 0, y: -0.1, z: 0 });
      // a few litter/mulch clumps
      for (const [x, z] of [[0.3, 0.2], [-0.35, -0.3], [0.1, -0.45]]) {
        const c = new THREE.IcosahedronGeometry(0.09, 0);
        c.scale(1, 0.5, 1); c.translate(x, -0.06, z);
        ensureColor(c, new THREE.Color(0.35, 0.3, 0.24));
        ring.push({ geom: c, x: 0, y: 0, z: 0 });
      }
      batcher.definePart('tree:pit', compose(ring), 'paintFlat', { castShadow: false });
      // cast-iron tree guard (1-in-4 pits)
      const gd = [];
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) {
        gd.push({ geom: box(0.04, 0.75, 0.04, { segY: 1 }), x, y: 0, z });
      }
      for (const [x, z, w, d] of [[0, -0.7, 1.4, 0.03], [0, 0.7, 1.4, 0.03], [-0.7, 0, 0.03, 1.4], [0.7, 0, 0.03, 1.4]]) {
        gd.push({ geom: box(w, 0.03, d, { segY: 1 }), x, y: 0.72, z });
        gd.push({ geom: box(w, 0.03, d, { segY: 1 }), x, y: 0.3, z });
      }
      for (let i = -0.55; i <= 0.56; i += 0.14) {
        gd.push({ geom: box(0.015, 0.72, 0.015, { segY: 1 }), x: i, y: 0, z: -0.7 });
        gd.push({ geom: box(0.015, 0.72, 0.015, { segY: 1 }), x: i, y: 0, z: 0.7 });
      }
      batcher.definePart('tree:guard', compose(gd), 'ironwork');
    }
    // species / yaw / scale from a POSITION hash so nothing repeats along a block
    const px = matrix.elements[12], pz = matrix.elements[14];
    let hsh = Math.floor(px * 7.31 + pz * 13.7 + 1e4) >>> 0;
    hsh = ((hsh ^ (hsh >>> 13)) * 1274126177) >>> 0;
    const variant = hsh % 4;
    // ~1 in 7 pits is empty or a cut stump — perfectly regular street trees are a tell
    if (hsh % 7 === 3) {
      if (!batcher.hasPart('tree:stump')) {
        batcher.definePart('tree:stump', cylinder(0.14, 0.17, 0.35, 8), 'bark');
      }
      if (!batcher.hasPart('tree:pit')) treeParts(variant);
      batcher.addInstance('tree:pit', matrix);
      if (((hsh >>> 4) & 1) === 1) batcher.addInstance('tree:stump', matrix);
      return;
    }
    treeParts(variant);
    const u1 = ((hsh >>> 8) & 1023) / 1023, u2 = ((hsh >>> 18) & 1023) / 1023;
    const s = scale * (0.82 + u1 * 0.46);
    const m = matrix.clone().multiply(tmat(0, 0, 0, u2 * 6.283, s, s * (0.9 + u1 * 0.2), s));
    batcher.addInstance('tree:pit', matrix);
    if (hsh % 4 === 1) batcher.addInstance('tree:guard', matrix);
    batcher.addInstance(`tree:trunk${variant}`, m);
    batcher.addInstance(`tree:canopy${variant}`, m, tint);
  };


  // NYC curbside trash pile: lumpy tied bags (deformed icosahedra + knot).
  K.trashBags = function (matrix, rngLike, count = 3) {
    if (!batcher.hasPart('trash:bag')) {
      const g = new THREE.IcosahedronGeometry(0.34, 1);
      // lump it: push vertices in/out pseudo-randomly so it stops reading as a tire
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = 0.82 + 0.36 * Math.abs(Math.sin(i * 12.9898) * 43758.545 % 1);
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.66, p.getZ(i) * f * 0.9);
      }
      g.computeVertexNormals();
      g.translate(0, 0.21, 0);
      const knot = new THREE.SphereGeometry(0.07, 6, 5);
      knot.scale(1, 0.7, 1);
      knot.translate(0.05, 0.44, 0);
      batcher.definePart('trash:bag', compose([{ geom: g }, { geom: knot }]), 'trashBag', { castShadow: true });
    }
    for (let i = 0; i < count; i++) {
      const dx = (i % 3) * 0.5 - 0.5 + rngLike.range(-0.12, 0.12);
      const dz = Math.floor(i / 3) * 0.45 + rngLike.range(-0.12, 0.12);
      const stack = i > 2 ? 0.28 : 0;                 // pile a second layer
      const s = rngLike.range(0.85, 1.2);
      const m = matrix.clone().multiply(
        tmat(dx, stack, dz, rngLike.range(0, 6.28), s, rngLike.range(0.7, 1.0), s * rngLike.range(0.85, 1.1)));
      batcher.addInstance('trash:bag', m,
        new THREE.Color().setHSL(rngLike.pick([0.6, 0.35, 0.62]), 0.05, rngLike.range(0.05, 0.1)));
    }
  };

  // (Vehicles and pedestrians are intentionally OUT OF SCOPE: buildings,
  // sidewalks, and street furniture only, per the owner.)

  // ==========================================================================
  // STREET FURNITURE II — signs, racks, mail, transit. All y=0 at pavement.
  // ==========================================================================
  const signQuad = (name, w, h) => {
    const uv = extra.streetSignUvFor(extra.streetSignIndex(name));
    return quad(w, h, uv);
  };

  // pole with 1-2 regulation plates
  K.signPole = function (matrix, { signs = ['noparking'], tint = null } = {}) {
    const id = `sign:${signs.join('+')}`;
    if (!batcher.hasPart(id)) {
      const items = [{ geom: cylinder(0.032, 0.038, 3.1, 7), x: 0, y: 0, z: 0 }];
      signs.forEach((s, i) => {
        const g = signQuad(s, 0.36, 0.75);
        g.translate(0, 2.25 - i * 0.85, 0.045);
        items.push({ geom: g });
      });
      batcher.definePart(id, compose(items), 'streetSigns');
    }
    batcher.addInstance(id, matrix, tint);
  };

  // corner street-name assembly: pole + two crossed blades
  K.streetName = function (matrix, { blades = ['blade-w132', 'blade-lenox'] } = {}) {
    const id = `sname:${blades.join('+')}`;
    if (!batcher.hasPart(id)) {
      const items = [{ geom: cylinder(0.036, 0.042, 3.7, 7), x: 0, y: 0, z: 0 }];
      const b0 = signQuad(blades[0], 0.95, 0.3); b0.translate(0.42, 3.42, 0);
      const b1 = signQuad(blades[1], 0.95, 0.3); b1.rotateY(Math.PI / 2); b1.translate(0, 3.18, 0.42);
      items.push({ geom: b0 }, { geom: b1 });
      batcher.definePart(id, compose(items), 'streetSigns');
    }
    batcher.addInstance(id, matrix);
  };

  K.bikeRack = function (matrix, { tint = null } = {}) {
    if (!batcher.hasPart('bikerack')) {
      const hoop = new THREE.TorusGeometry(0.34, 0.028, 7, 14, Math.PI);
      hoop.translate(0, 0.45, 0);
      const l1 = cylinder(0.028, 0.028, 0.45, 7); l1.translate(-0.34, 0, 0);
      const l2 = cylinder(0.028, 0.028, 0.45, 7); l2.translate(0.34, 0, 0);
      batcher.definePart('bikerack', compose([{ geom: hoop }, { geom: l1 }, { geom: l2 }]), 'steelDark');
    }
    batcher.addInstance('bikerack', matrix, tint || new THREE.Color(0.5, 0.52, 0.54));
  };

  K.siamese = function (matrix, { tint = null } = {}) {
    if (!batcher.hasPart('siamese')) {
      const items = [
        { geom: cylinder(0.055, 0.06, 0.62, 8), x: 0, y: 0, z: 0 },
        { geom: cylinder(0.05, 0.05, 0.22, 8), x: -0.09, y: 0.58, z: 0, rz: 0.5 },
        { geom: cylinder(0.05, 0.05, 0.22, 8), x: 0.09, y: 0.58, z: 0, rz: -0.5 },
        { geom: lathe([[0.02, 0], [0.075, 0.02], [0.08, 0.07], [0.02, 0.09], [0, 0.09]], 8), x: -0.16, y: 0.72, z: 0 },
        { geom: lathe([[0.02, 0], [0.075, 0.02], [0.08, 0.07], [0.02, 0.09], [0, 0.09]], 8), x: 0.16, y: 0.72, z: 0 },
      ];
      batcher.definePart('siamese', compose(items), 'canvasFlat');
    }
    batcher.addInstance('siamese', matrix, tint || new THREE.Color(0.55, 0.14, 0.12));
  };

  K.mailbox = function (matrix, { relay = false } = {}) {
    if (!batcher.hasPart('mailbox')) {
      const bodyH = 0.72;
      const body = box(0.64, bodyH, 0.66, { segY: 1 });
      body.translate(0, 0.38, 0);
      const top = new THREE.CylinderGeometry(0.33, 0.33, 0.64, 12, 1, false, 0, Math.PI);
      top.rotateZ(Math.PI / 2);
      top.translate(0, 0.38 + bodyH, 0);
      const legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        legs.push({ geom: box(0.05, 0.38, 0.05, { segY: 1 }), x: sx * 0.25, y: 0, z: sz * 0.25 });
      }
      batcher.definePart('mailbox', compose([{ geom: body }, { geom: top }, ...legs]), 'paintFlat');
    }
    batcher.addInstance('mailbox', matrix, relay ? new THREE.Color(0.35, 0.42, 0.3) : new THREE.Color(0.1, 0.22, 0.45));
  };

  K.newsBoxes = function (matrix, rngLike, n = 3) {
    if (!batcher.hasPart('newsbox')) {
      const items = [
        { geom: box(0.48, 0.62, 0.44, { segY: 1 }), x: 0, y: 0.28, z: 0 },
        { geom: box(0.05, 0.28, 0.05, { segY: 1 }), x: -0.18, y: 0, z: -0.15 },
        { geom: box(0.05, 0.28, 0.05, { segY: 1 }), x: 0.18, y: 0, z: -0.15 },
        { geom: box(0.05, 0.28, 0.05, { segY: 1 }), x: -0.18, y: 0, z: 0.15 },
        { geom: box(0.05, 0.28, 0.05, { segY: 1 }), x: 0.18, y: 0, z: 0.15 },
      ];
      const win = box(0.38, 0.3, 0.02, { segY: 1 });
      ensureColor(win, new THREE.Color(0.12, 0.12, 0.13));
      items.push({ geom: win, x: 0, y: 0.5, z: 0.22 });
      batcher.definePart('newsbox', compose(items), 'paintFlat');
    }
    const cols = [0xa32020, 0xd8b418, 0x1a4a8a, 0xe8e5da, 0x28502a];
    for (let i = 0; i < n; i++) {
      batcher.addInstance('newsbox',
        matrix.clone().multiply(tmat(i * 0.56, 0, 0, rngLike.range(-0.06, 0.06))),
        new THREE.Color(cols[(i + rngLike.int(0, 4)) % cols.length]));
    }
  };

  K.busStop = function (matrix) {
    if (!batcher.hasPart('busstop')) {
      const items = [{ geom: cylinder(0.034, 0.04, 3.3, 7), x: 0, y: 0, z: 0 }];
      const g = signQuad('bus', 0.4, 0.72);
      g.translate(0, 2.5, 0.04);
      items.push({ geom: g });
      batcher.definePart('busstop', compose(items), 'streetSigns');
    }
    batcher.addInstance('busstop', matrix);
  };

  // classic railed subway stair: granite curb walls, railings, globes, sign
  K.subwayEntrance = function (matrix) {
    if (!batcher.hasPart('subway')) {
      const L = 4.4, W = 2.4, wallH = 0.85;
      const items = [];
      const mkWall = (w, d, x, z) => {
        const g = box(w, wallH, d, { segY: 1 });
        boxUV(g, w, wallH, d, 2);
        items.push({ geom: g, x, y: 0, z });
      };
      mkWall(L, 0.22, 0, -W / 2 + 0.11);
      mkWall(L, 0.22, 0, W / 2 - 0.11);
      mkWall(0.22, W, -L / 2 + 0.11, 0);
      batcher.definePart('subway:walls', compose(items), 'graniteBase');
      // railings on the walls
      const rails = [];
      const mkRail = (len, x, z, ry) => {
        rails.push({ geom: box(len, 0.05, 0.05, { segY: 1 }), x, y: wallH + 0.5, z, ry });
        const n = Math.round(len / 0.4);
        for (let i = 0; i <= n; i++) {
          const t = i / n - 0.5;
          rails.push({
            geom: box(0.028, 0.5, 0.028, { segY: 1 }),
            x: x + (ry ? 0 : t * len), y: wallH, z: z + (ry ? t * len : 0), ry,
          });
        }
      };
      mkRail(L - 0.2, 0, -W / 2 + 0.11, 0);
      mkRail(L - 0.2, 0, W / 2 - 0.11, 0);
      mkRail(W - 0.2, -L / 2 + 0.11, 0, Math.PI / 2);
      batcher.definePart('subway:rails', compose(rails), 'ironwork');
      // descending stair + dark void
      const stairs = [];
      for (let s = 0; s < 7; s++) {
        const g = box(W - 0.5, 0.16, 0.32, { segY: 1 });
        ensureColor(g, new THREE.Color(0.5 - s * 0.055, 0.5 - s * 0.055, 0.5 - s * 0.05));
        stairs.push({ geom: g, x: L / 2 - 0.35 - s * 0.32, y: -0.16 - s * 0.16, z: 0, ry: Math.PI / 2 });
      }
      const voidBack = box(W - 0.4, 1.6, 0.1, { segY: 1 });
      ensureColor(voidBack, new THREE.Color(0.02, 0.02, 0.025));
      stairs.push({ geom: voidBack, x: -L / 2 + 0.5, y: -1.55, z: 0, ry: Math.PI / 2 });
      batcher.definePart('subway:stair', compose(stairs), 'concrete', { castShadow: false });
      // globe posts + sign
      const posts = [];
      for (const sz of [-1, 1]) {
        posts.push({ geom: cylinder(0.045, 0.05, 2.6, 8), x: L / 2 - 0.15, y: 0, z: sz * (W / 2 - 0.15) });
        posts.push({ geom: new THREE.SphereGeometry(0.13, 10, 8), x: L / 2 - 0.15, y: 2.75, z: sz * (W / 2 - 0.15) });
      }
      batcher.definePart('subway:posts', compose(posts), 'ironwork');
      const globes = [];
      for (const sz of [-1, 1]) {
        globes.push({ geom: new THREE.SphereGeometry(0.125, 10, 8), x: L / 2 - 0.15, y: 2.75, z: sz * (W / 2 - 0.15) });
      }
      batcher.definePart('subway:globes', compose(globes), 'litWindow', { castShadow: false });
      const sg = signQuad('subway', 2.0, 0.5);
      sg.translate(0, 2.35, 0);
      sg.rotateY(Math.PI / 2);
      batcher.definePart('subway:sign', sg, 'streetSigns', { castShadow: false });
    }
    batcher.addInstance('subway:walls', matrix);
    batcher.addInstance('subway:rails', matrix);
    batcher.addInstance('subway:stair', matrix);
    batcher.addInstance('subway:posts', matrix);
    batcher.addInstance('subway:globes', matrix, new THREE.Color(0.35, 1.2, 0.5));
    batcher.addInstance('subway:sign', matrix.clone().multiply(tmat(2.2 - 0.15, 0, 0)));
  };

  // tactile curb ramp pad at intersections
  K.curbRamp = function (matrix) {
    if (!batcher.hasPart('curbramp')) {
      const g = box(1.3, 0.03, 1.3, { segY: 1 });
      batcher.definePart('curbramp', g, 'paintFlat', { castShadow: false });
    }
    batcher.addInstance('curbramp', matrix, new THREE.Color(0.78, 0.55, 0.12));
  };

  // sidewalk shed (scaffolding) over the sidewalk along a facade
  K.shed = function (len, matrix, { tint = null } = {}) {
    len = Math.max(8, Math.round(len / 4) * 4);
    const id = `shed:${len}`;
    if (!batcher.hasPart(id)) {
      const d = 3.6, h = 3.5;
      const items = [];
      const bays = Math.round(len / 4);
      for (let b = 0; b <= bays; b++) {
        const x = -len / 2 + (len / bays) * b;
        items.push({ geom: cylinder(0.045, 0.045, h, 7), x, y: 0, z: 0.3 });
        items.push({ geom: cylinder(0.045, 0.045, h, 7), x, y: 0, z: d - 0.3 });
        // X-braces on street side every other bay
        if (b < bays && b % 2 === 0) {
          const bl = Math.hypot(len / bays, h * 0.6);
          for (const dir of [1, -1]) {
            const g = box(0.03, bl, 0.03, { segY: 1 });
            g.rotateZ(dir * Math.atan2(len / bays, h * 0.6));
            items.push({ geom: g, x: x + (len / bays) / 2, y: h * 0.2, z: d - 0.3 });
          }
        }
      }
      // deck + parapet
      const deck = box(len + 0.3, 0.12, d, { segY: 1 });
      ensureColor(deck, new THREE.Color(0.25, 0.24, 0.22));
      items.push({ geom: deck, x: 0, y: h, z: d / 2 });
      const par = box(len + 0.3, 0.95, 0.05, { segY: 1 });
      items.push({ geom: par, x: 0, y: h + 0.12, z: d - 0.03 });
      const parS1 = box(0.05, 0.95, d, { segY: 1 });
      const parS2 = box(0.05, 0.95, d, { segY: 1 });
      items.push({ geom: parS1, x: -len / 2 - 0.12, y: h + 0.12, z: d / 2 });
      items.push({ geom: parS2, x: len / 2 + 0.12, y: h + 0.12, z: d / 2 });
      batcher.definePart(id, compose(items), 'paintFlat');
    }
    batcher.addInstance(id, matrix, tint || new THREE.Color(0.16, 0.3, 0.2));
  };


  K.trashCan = function (matrix, { tint = null } = {}) {
    if (!batcher.hasPart('trash')) {
      const g = lathe([[0.28, 0], [0.3, 0.05], [0.33, 0.75], [0.31, 0.78], [0.27, 0.78]], 12);
      batcher.definePart('trash', g, 'ironwork');
    }
    batcher.addInstance('trash', matrix, tint || new THREE.Color(0.16, 0.3, 0.2));
  };

  return K;
}
