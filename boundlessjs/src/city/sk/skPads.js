// AR33 sk: the detectable warning pads. The compiled warn / warnIron rectangles (streetscape.padCentres: centre, size, the
// long side's direction, the compiled y) get a tactile quad 4 mm over them, in the library's tactile set (truncated domes
// on a 60 mm grid, UVs in metres from the pad's corner so the rows run with the kerb), a cast rim 25 mm wide round it
// and a darker worn border. Pure (no three): docs/notes/ar33-street.md.
export function buildPads(p, buf) {
  const ux = p.ux, uz = p.uz, vx = -uz, vz = ux;   // u along the long side, v across
  const hw = p.w / 2, hd = p.d / 2, y = p.y + 0.004;
  const C = (a, b) => [p.x + ux * a + vx * b, p.z + uz * a + vz * b];
  // the dome field
  const quad = [[-hw + 0.03, -hd + 0.03], [hw - 0.03, -hd + 0.03], [hw - 0.03, hd - 0.03], [-hw + 0.03, hd - 0.03]];
  const ids = quad.map(([a, b]) => { const [x, z] = C(a, b); return buf.v(x, y, z, 0, 1, 0, a + hw, b + hd, 1, 1, 1); });
  // wind so the face is up: the triangle (0, 1, 2) normal = (P1 - P0) x (P2 - P0) must have +y
  const P0 = C(quad[0][0], quad[0][1]), P1 = C(quad[1][0], quad[1][1]), P2 = C(quad[2][0], quad[2][1]);
  const cy = (P1[1] - P0[1]) * (P2[0] - P0[0]) - (P1[0] - P0[0]) * (P2[1] - P0[1]);
  if (cy > 0) buf.quad(ids[0], ids[1], ids[2], ids[3]); else buf.quad(ids[0], ids[3], ids[2], ids[1]);
  // the rim: four strips 30 mm wide, a few mm lower than the domes' plane, in the frame's dark cast iron
  const rim = 0.03, yr = p.y + 0.0025, dark = 0.45;
  const strip = (a0, b0, a1, b1) => {
    const pts = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => { const [x, z] = C(a, b); return buf.v(x, yr, z, 0, 1, 0, 0.5, 0.5, dark, dark, dark); });
    const Q0 = C(a0, b0), Q1 = C(a1, b0), Q2 = C(a1, b1);
    const c2 = (Q1[1] - Q0[1]) * (Q2[0] - Q0[0]) - (Q1[0] - Q0[0]) * (Q2[1] - Q0[1]);
    if (c2 > 0) buf.quad(pts[0], pts[1], pts[2], pts[3]); else buf.quad(pts[0], pts[3], pts[2], pts[1]);
  };
  strip(-hw, -hd, hw, -hd + rim); strip(-hw, hd - rim, hw, hd); strip(-hw, -hd + rim, -hw + rim, hd - rim); strip(hw - rim, -hd + rim, hw, hd - rim);
}
