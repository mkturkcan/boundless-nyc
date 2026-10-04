// QA round 4: every drawn triangle and instance box crossed by the vertical line at ARG.p = [x, z] (all meshes, no
// filters), with its mesh label, material and the y of the crossing; and the ground functions there. Evaluated in the
// page by tools/qa/qa_page.mjs ({ "op": "eval", "file": ".../column_probe.js", "arg": { "p": [x, z], "r": 40 } }).
(() => {
  const A = window.ARG || {}, E = window.__ENGINE, S = window.__STREAMER, sc = E.scene;
  const [px, pz] = A.p, R = A.r || 40, out = [];
  const lab = (o) => { const a = []; let p = o; while (p && p !== sc && a.length < 5) { if (p.name) a.push(p.name); p = p.parent; } return a.reverse().join('/') || o.type; };
  const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  sc.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.geometry || !vis(o)) return;
    const g = o.geometry, p = g.attributes.position; if (!p) return;
    const e = o.matrixWorld.elements, mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const minfo = mat ? `${mat.type}${mat.transparent ? ' transp ' + (+mat.opacity).toFixed(2) : ''}${mat.visible === false ? ' invisible' : ''}${mat.name ? ' ' + mat.name : ''}` : '';
    if (o.isInstancedMesh) {
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, arr = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const I = arr.subarray(i * 16, i * 16 + 16);
        const cx = e[0] * I[12] + e[4] * I[13] + e[8] * I[14] + e[12], cz = e[2] * I[12] + e[6] * I[13] + e[10] * I[14] + e[14];
        if (Math.hypot(cx - px, cz - pz) > 6) continue;
        out.push({ inst: lab(o), i, at: [+cx.toFixed(2), +(e[1] * I[12] + e[5] * I[13] + e[9] * I[14] + e[13]).toFixed(2), +cz.toFixed(2)], mat: minfo });
      }
      return;
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = g.boundingSphere;
    if (Math.hypot(e[12] + s.center.x - px, e[14] + s.center.z - pz) > s.radius + R) return;
    const idx = g.index ? g.index.array : null, n = idx ? g.index.count : p.count;
    const P = (v) => { const x = p.getX(v), y = p.getY(v), z = p.getZ(v); return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
    const ys = [];
    for (let t = 0; t + 2 < n; t += 3) {
      const a = P(idx ? idx[t] : t), b = P(idx ? idx[t + 1] : t + 1), c = P(idx ? idx[t + 2] : t + 2);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
      const l0 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d, l1 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d, l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      ys.push(+(l0 * a[1] + l1 * b[1] + l2 * c[1]).toFixed(2));
    }
    if (ys.length) out.push({ mesh: lab(o), ys: [...new Set(ys)].sort((x, y) => x - y).slice(0, 24), mat: minfo });
  });
  const si = S.surfaceInfoAt ? S.surfaceInfoAt(px, pz, 0.05) : null;
  return { p: A.p, terrain: S.terrainAt(px, pz), surface: si, hits: out };
})()
