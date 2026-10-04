// AR33 building specs, segment hpt: Hunters Point, Queens (schema: docs/notes/ar33-spec.md; no frontage inventory for hpt: rings and
// heights are the compiled records in docs/notes/ar33-compiled.json). Owner: the HPT worker (docs/notes/ar33-hpt.md).
// Faces are given as ring segments [x0, z0, x1, z1] (the kit picks the ring edge nearest to it).

// ------------------------------------------------------------------ helpers (local to this file)
// the towers' podium: buff face brick over a dark granite plinth
const BRICK = { mat: 'brick_buff', tint: '#d5cbae', dirt: 0.3 };
// the towers' window wall: aluminium mullions about 1.5 m apart, a grey spandrel band at every floor line, blue-grey glass
const CW = { mullion: 1.55, transom: 'floor', frame: 'alu_clear', glass: 'glass_vision_grey', spandrel: 'panel_grey', spandrelH: 1.0, mullionW: 0.05, lit: 0.2, blinds: 0.3 };   // lit: night photograph 46 shows about one window in five lit
// a double-height glazed bay of the podium (a restaurant, a lobby): frosted / dark glass, no gate
const hall = (u0, u1, o = {}) => ({ kind: 'window', u0, u1, h: 4.2, glazing: { bulkhead: 0.15, transom: 0.0, mullions: Math.max(1, Math.round((u1 - u0) / 1.6) - 1), frame: 'alu_clear' }, gate: { kind: 'none' }, interior: 'empty', ...o });
// the restaurant's milky glass: the kit's frosted pane (KIT, 2026-10-02)
const frost = (b) => ({ ...b, glazing: { ...b.glazing, frosted: true } });

// face over a glazed lobby storey; the faces are the compiled ring's edges of 7.5 m and more (the kit merges collinear ones).
// Floor heights are the compiled height shared out over the compiled storeys (not measured).
// AR34 b4: MATS's vision glass (the room drawn behind an opaque pane) for the glass, an opaque blue-grey body for the spandrels
const CWG = { mullion: 1.5, transom: 'floor', frame: 'alu_clear', glass: 'glass_vision_blue', spandrel: 'glass_tower_blue', lit: 0.2, blinds: 0.4 };
function glassTower(o) {
  const base = o.base ?? 5.0, fh = +((o.h - base - 0.6) / o.n).toFixed(3);
  return {
    id: o.id, name: o.name, at: o.at, comp: o.comp, h: o.h, status: 'draft',
    wall: { mat: 'panel_grey', tint: '#5d646b', dirt: 0.15 },
    faces: o.edges.map(([x0, z0, x1, z1], i) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      // AR34 b5: an edge against lower compiled neighbours (o.party[i] = their height, QA Q43): a blank base to that height (whole
      // floors), no lobby glazing inside the neighbours, the curtain above
      const P = o.party && o.party[i];
      if (P) { const n = o.n - Math.ceil((P - base) / fh), bh = +(o.h - 0.6 - n * fh).toFixed(3); return { edge: [x0, z0, x1, z1], base: { h: bh, bays: [] }, curtain: CWG, floors: [{ n, h: fh }] }; }
      return {
        edge: [x0, z0, x1, z1],
        base: { h: base, bays: L > 4 ? [{ u0: 0.6, u1: +(L - 0.6).toFixed(2), kind: 'window', h: base - 0.7, glazing: { bulkhead: 0.1, transom: 0.0, mullions: Math.max(1, Math.round(L / 1.8) - 1), frame: 'alu_clear' }, gate: { kind: 'none' }, interior: 'empty' }] : [] },
        curtain: CWG,
        floors: [{ n: o.n, h: fh }],
      };
    }),
    roof: { kind: 'flat', parapet: { h: 1.2, coping: 'metal' }, membrane: 'white', items: [{ k: 'bulkhead', at: [0.5, 0.5], w: 8.0, d: 6.0, h: 4.5 }] },
    refs: [],
    notes: o.notes || 'the lobby, the crown and the balconies are not measured',
  };
}

export default [
  {
    // The tower at 46th Avenue and Center Boulevard, behind the Pepsi-Cola sign (compiled 2_7:21, 80.47 m, an L: a wing along 46th
    // Avenue and a wing along Center Boulevard). On Center Boulevard the buff brick podium is one tall storey to 6.4 m with glass
    // to 4.4 m; on 46th Avenue the
    // brick runs to about 9.4 m; a window wall above with the balcony slabs hptShoreTowers.js adds.
    id: 'hpt-2_7-21', name: 'tower at 46th Ave and Center Blvd (behind the Pepsi-Cola sign)',
    at: [1215.0, 3980.0], comp: '2_7:21', h: 80.47, status: 'draft',
    wall: BRICK,
    faces: [
      {
        // Center Boulevard (51.3 m; u from the south end). Bays from: the
        // restaurant's frosted glass u 9-23.8 with its name in white script, a brick pier, frosted glass u 26.2-31.5, a
        // service door under a louvre u 33.0-34.4, dark lobby glass u 35.3-44.0
        edge: [1226.96, 3958.28, 1233.52, 4009.21],
        base: {
          h: 6.4,
          bays: [
            frost(hall(9.0, 23.8, { name: 'Maiella (restaurant)', vinyl: [{ text: 'Maiella', u: 2.2, w: 3.4, y: 3.0, h: 0.9, fg: '#f6f4ef', font: 'GreatVibes-400' }, { text: 'On the Water', u: 5.8, w: 1.9, y: 3.15, h: 0.26, fg: '#f6f4ef', font: 'LibreBaskerville-400i' }] })),
            frost(hall(26.2, 31.5)),
            { u0: 33.0, u1: 34.4, kind: 'entrance', h: 2.6, door: { kind: 'solid', w: 1.1, h: 2.3, tint: '#e9e8e2' }, gate: { kind: 'none' } },
            hall(35.3, 44.0, { interior: 'empty' }),
          ],
        },
        curtain: CW,
        floors: [{ n: 23, h: 3.22 }],
        plinth: { mat: 'granite_black', h: 0.6, proj: 0.03 },
      },
      {
        // 46th Avenue (61.5 m; u from the east end). From: a dark glass
        // window, a service door and a louvred opening near the east end (positions not rectified). The brick's top: 6.5 m over
        // the view's centre column the top is 6.1 deg over the horizon where the ray meets this face 41.6 m out (row 495 of 900;
        // a second column gave 6.6 m); it was 9.4 (not measured). The other faces. podium likewise (the Center Boulevard one: 6.4);
        // 24 floors of 3.08 over it keep the compiled 80.47 m (6.5 + 73.9)
        // AR34 b5: that measure stood the lens 2.15 m over the road (ALT 2.3, the 2026-08 rig's);
        // ~0.6 m higher (the lead's lens by date, ALT 2.9 = 2.76 m), so the same angles give 7.1 m (and 7.2 at the second column):
        // the podium 7.1, 24 floors of 3.057 keep 80.47
        edge: [1162.65, 3939.59, 1222.34, 3954.58],
        base: {
          h: 7.1,
          bays: [
            { u0: 3.0, u1: 6.6, kind: 'window', h: 3.4, glazing: { bulkhead: 0.3, transom: 0.0, mullions: 1, frame: 'alu_clear' }, gate: { kind: 'none' }, interior: 'empty' },
            { u0: 7.2, u1: 8.4, kind: 'entrance', h: 2.6, door: { kind: 'solid', w: 1.0, h: 2.3, tint: '#dcdcd6' }, gate: { kind: 'none' } },
            { u0: 10.5, u1: 14.0, kind: 'window', h: 3.6, glazing: { bulkhead: 0.0, transom: 0.0, mullions: 0, frame: 'alu_black' }, gate: { kind: 'none' }, interior: 'empty' },
          ],
        },
        curtain: CW,
        floors: [{ n: 24, h: 3.057 }],
        plinth: { mat: 'granite_black', h: 0.6, proj: 0.03 },
      },
      // the river end and the park side: the same window wall over a plain brick podium (7.1 as the 46th Avenue face, AR34 b5)
      { edge: [1151.81, 3959.49, 1160.38, 3939.74], base: { h: 7.1 }, curtain: CW, floors: [{ n: 24, h: 3.057 }] },
      { edge: [1206.33, 3976.45, 1154.06, 3963.34], base: { h: 7.1 }, curtain: CW, floors: [{ n: 24, h: 3.057 }] },
      { edge: [1209.94, 4005.83, 1206.33, 3976.45], base: { h: 7.1 }, curtain: CW, floors: [{ n: 24, h: 3.057 }] },
      { edge: [1231.38, 4011.64, 1211.32, 4006.81], base: { h: 7.1 }, curtain: CW, floors: [{ n: 24, h: 3.057 }] },
    ],
    roof: { kind: 'flat', parapet: { h: 1.2, coping: 'metal' }, membrane: 'white', items: [{ k: 'bulkhead', at: [-0.22, 0.45], w: 9.0, d: 7.0, h: 4.2 }, { k: 'hvac', at: [0.6, 0.15], n: 3 }] },   // AR34 b4: the bulkhead on the 46th Ave wing, the HVAC on the Center Blvd wing
    refs: [],
    notes: 'the rounded west end (the curved balcony fronts on every floor) and the balcony glass are not in the kit; the bays are approximate',
  },
  glassTower({ id: 'hpt-2_7-30', name: 'glass tower north-east of the Pepsi-Cola sign', comp: '2_7:30', at: [1186.97, 3898.57], h: 107, n: 31,
    edges: [[1188.72, 3883.44, 1197.18, 3880.65], [1197.18, 3880.65, 1204.28, 3902.33], [1204.9, 3909.03, 1186.19, 3915.19], [1185.47, 3912.99, 1176.3, 3916], [1176.3, 3916, 1169.59, 3895.51], [1168.89, 3888.11, 1188.17, 3881.76]] }),
  glassTower({ id: 'hpt-2_7-17', name: 'glass tower south-east of the Pepsi-Cola sign', comp: '2_7:17', at: [1203.4, 4042.96], h: 62.52, n: 17,
    edges: [[1185.96, 4020.56, 1202.81, 4028.93], [1203.65, 4027.22, 1212.77, 4031.75], [1228.08, 4033.55, 1224.71, 4048.01], [1223.6, 4047.75, 1213.87, 4089.62], [1213.87, 4089.62, 1176.54, 4080.33], [1176.54, 4080.33, 1180.78, 4064.54], [1180.78, 4064.54, 1188.76, 4066.69], [1188.76, 4066.69, 1194.91, 4043.82], [1194.91, 4043.82, 1180.12, 4035.22], [1180.12, 4035.22, 1184.22, 4019.7]] }),
  // its south edge (0) is against 2_8:0, 2_8:30 and 2_8:194, five storeys of 15.8-16.2 m (the compiled records; QA Q43's warning)
  glassTower({ id: 'hpt-2_8-209', name: 'glass tower behind the gantries', comp: '2_8:209', at: [1261.33, 4208.95], h: 114.6, n: 37, party: { 0: 16.2 },
    edges: [[1270.66, 4260.23, 1222.18, 4247.37], [1217.29, 4252.7, 1173.55, 4241.11], [1172.94, 4243.14, 1155.94, 4238.66], [1155.94, 4238.66, 1158, 4230.78], [1166.17, 4219.35, 1189.53, 4187.57], [1207.87, 4194.14, 1187.15, 4223.81], [1187.15, 4223.81, 1221.8, 4232.63], [1225.98, 4234.98, 1235.05, 4199.16], [1235.05, 4199.16, 1289.1, 4212.93], [1289.1, 4212.93, 1277.8, 4255.79]] }),
];
