// NM24 (owner 2026-09-24: "building faces sometimes get lost or disappear") — polygon offsets that cannot fold, and
// horizontal triangles that cannot face down. Shared by assemble.js and towers.js.
//
// The radial and proportional insets used for parapets, copings and roof rim bands move each vertex toward the
// centroid. On a concave footprint that moves some edges ACROSS themselves, and a band built between the ring and
// such an inset has triangles wound downward: the facade material culls them from above, so rooflines lose bites and
// roof edges show holes into the building (17,400 triangles on 1,928 buildings in the harlem125 ring).

// Miter offset of a shoelace-positive (x, z) ring by d metres: d > 0 inward, d < 0 outward. Every edge moves exactly
// d along its own normal. Returns null unless the result is a clean offset: each edge keeps its direction, the area
// moves the right way, and no two edges cross (O(n^2); footprint rings are at most a few dozen vertices).
export function ringOffsetMiter(ring, d) {
  const n = ring.length;
  if (n < 3 || n > 96 || !(Math.abs(d) > 1e-4)) return null;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    let ax = p1[0] - p0[0], az = p1[1] - p0[1];
    const la = Math.hypot(ax, az);
    let bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) return null;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const nax = -az, naz = ax, nbx = -bz, nbz = bx;          // inward normals of a shoelace-positive ring
    let mx = nax + nbx, mz = naz + nbz;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { out[i] = [p1[0] + nax * d, p1[1] + naz * d]; continue; }
    mx /= ml; mz /= ml;
    const c = mx * nax + mz * naz;
    if (c < 0.26) return null;                                // a spike: the miter would run away
    out[i] = [p1[0] + mx * (d / c), p1[1] + mz * (d / c)];
  }
  let A0 = 0, A1 = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], c2 = out[i], e = out[(i + 1) % n];
    if ((b[0] - a[0]) * (e[0] - c2[0]) + (b[1] - a[1]) * (e[1] - c2[1]) <= 0) return null;   // edge folded
    A0 += a[0] * b[1] - b[0] * a[1];
    A1 += c2[0] * e[1] - e[0] * c2[1];
  }
  if (!(A0 > 0) || !(A1 > 0) || (d > 0 ? A1 >= A0 : A1 <= A0)) return null;
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 0; i < n; i++) {
    const a = out[i], b = out[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;                   // neighbours share a vertex
      const r = out[j], t = out[(j + 1) % n];
      if (((side(a, b, r) > 0) !== (side(a, b, t) > 0)) && ((side(r, t, a) > 0) !== (side(r, t, b) > 0))) return null;
    }
  }
  return out;
}

// One horizontal triangle wound to face +Y whatever order its corners come in (a triangle faces up iff its (x, z)
// shoelace cross is negative). `buf` is a GeoBuf; uvs follow their corners if the order is swapped.
export function upTri(buf, a, b, c, col, aux, aux2, uvs = null, aux3 = null) {
  const cr = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  if (Math.abs(cr) < 1e-9) return;
  if (cr < 0) buf.tri(a, b, c, [0, 1, 0], col, aux, aux2, uvs, aux3);
  else buf.tri(a, c, b, [0, 1, 0], col, aux, aux2, uvs ? [uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]] : null, aux3);
}
