// AR33 HPT: the Pepsi-Cola sign's script letters and bottle as data (docs/notes/ar33-hpt.md). No imports: node tests and the
// browser read the same file. The strokes are chains of cubic curves traced on the Commons photograph "Pepsi-Cola sign
// SWW.jpg" (its pixel frame), each with a width that changes along it; the letters are drawn from scratch (no logo
// artwork file). A stroke's [u, v, w] polyline is in metres on the sign: u along it from the P's curl, v up from the swash.
// The photograph's frame: x 20 -> 955 px is the letters' 39 m, y 22 -> 310 px their 13.5 m.
export const SX = 39 / 935, SY = 13.5 / 288;
export const toU = (x) => (x - 20) * SX, toV = (y) => (310 - y) * SY;
// strokes: [points (cubic chain p0 c c p1 c c p2 ...), widths at p0, p1, ... (photo px)]
export const STROKES = [
  // the swash along the bottom, from the C's foot under "epsi" to the P's curl at the far left
  [[[612, 282], [470, 306], [260, 314], [112, 300], [60, 296], [22, 274], [34, 244], [44, 222], [82, 214], [98, 236], [104, 246], [96, 258], [86, 252]], [32, 26, 16, 9, 7]],
  // the P's stem into the swash
  [[[228, 108], [214, 170], [178, 246], [118, 298]], [34, 28]],
  // the P's bowl: a flattened loop over the top-left, its start curled
  [[[150, 98], [134, 64], [196, 34], [252, 36], [302, 38], [338, 58], [322, 86], [306, 110], [262, 120], [214, 112]], [16, 32, 26, 14]],
  [[[150, 98], [160, 110], [178, 104], [172, 92]], [16, 10]],
  // the C's spine (AR34: as thick as the photograph's, about 0.75 m, from under the head)
  [[[646, 62], [604, 104], [584, 196], [606, 266]], [36, 40]],
  // the C's bottom loop
  [[[606, 266], [612, 304], [764, 302], [816, 270], [846, 250], [832, 212], [782, 206], [722, 200], [652, 214], [626, 242]], [34, 26, 18, 12]],
  // the C's head (AR34, remeasured on the May 2026 photograph): a full, round swell over the "o" that turns down at the right and
  // curls back in to a hooked tip, about 0.7 m thick at its crown
  [[[656, 60], [676, 32], [730, 22], [766, 28], [800, 34], [804, 70], [770, 74], [748, 76], [730, 68], [732, 56]], [36, 34, 22, 10]],
  // the C's flourish over "epsi", tapering to its hooked tip at the left, and its barb
  [[[652, 50], [600, 76], [480, 82], [402, 78], [376, 76], [360, 62], [356, 46]], [40, 22, 6]],
  [[[404, 80], [396, 90], [390, 96], [384, 100]], [12, 3]],
  // E: the upper bowl, the notch, the lower bowl
  [[[284, 158], [256, 138], [204, 150], [216, 180], [222, 196], [250, 196], [258, 196]], [10, 22, 12]],
  [[[258, 196], [200, 194], [184, 240], [232, 246], [262, 248], [282, 232], [286, 220]], [14, 24, 10]],
  // P: the stem, the bowl, the foot
  [[[334, 164], [328, 200], [318, 230], [302, 248]], [26, 22]],
  [[[318, 156], [346, 134], [398, 140], [392, 172], [386, 196], [352, 206], [326, 200]], [14, 26, 12]],
  [[[288, 250], [298, 248], [310, 248], [320, 248]], [12, 12]],
  // S
  [[[462, 142], [432, 124], [394, 140], [410, 170], [420, 190], [456, 196], [452, 222], [446, 252], [396, 252], [386, 230]], [12, 26, 26, 12]],
  // I: the stem, the head serif, the foot
  [[[506, 136], [500, 172], [490, 210], [478, 243]], [26, 22]],
  [[[484, 133], [498, 131], [516, 129], [532, 127]], [14, 12]],
  [[[464, 244], [474, 244], [486, 244], [496, 244]], [12, 12]],
  // the colon between the words (AR34: two slanted dashes, one over the other, as the photographs show)
  [[[561, 148], [559, 154], [557, 160], [555, 166]], [12, 11]],
  [[[553, 180], [551, 186], [549, 192], [547, 198]], [12, 11]],
  // O
  [[[712, 106], [668, 106], [668, 190], [712, 190], [756, 190], [756, 106], [712, 106]], [16, 26, 16]],
  // L: the stem, its head curl, the foot
  [[[796, 106], [792, 140], [782, 170], [770, 190]], [24, 22]],
  [[[796, 106], [810, 94], [834, 104], [820, 120]], [16, 10]],
  [[[770, 190], [758, 204], [792, 202], [832, 188]], [18, 10]],
  // A: the left leg with its foot curl, the right leg to its tail, the bar
  [[[852, 190], [870, 160], [894, 122], [906, 104]], [14, 22]],
  [[[852, 190], [838, 202], [832, 186], [842, 180]], [12, 8]],
  [[[906, 104], [912, 160], [926, 222], [952, 262]], [26, 8]],
  [[[866, 170], [882, 169], [898, 167], [916, 165]], [12, 12]],
];
export const WK = 1.18;   // the traced widths read thin against the photograph's bold strokes (the overlay check)
const cub = (a, b, c, d, t) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d; };
// every stroke as a polyline [[u, v, w (m)], ...]; `n` samples per cubic
export function strokeLines(n = 28) {
  const out = [];
  for (const [P, W] of STROKES) {
    const pts = [];
    const nseg = (P.length - 1) / 3;
    for (let s = 0; s < nseg; s++) {
      const [a, b, c, d] = [P[s * 3], P[s * 3 + 1], P[s * 3 + 2], P[s * 3 + 3]];
      const w0 = W[Math.min(s, W.length - 1)], w1 = W[Math.min(s + 1, W.length - 1)];
      for (let k = s === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        pts.push([toU(cub(a[0], b[0], c[0], d[0], t)), toV(cub(a[1], b[1], c[1], d[1], t)), (w0 + (w1 - w0) * t) * SX * WK]);
      }
    }
    out.push(pts);
  }
  return out;
}
// the bottle: 15.2 m tall, 4.2 m wide, leaning 8 degrees to the right (the photographs), its foot at v -0.1, u 45.9.
// BPROF: [height share, half-width share] from the foot to the crown; lean in radians (negative = clockwise seen from the river)
export const BOT = { u: 45.9, v: -0.1, H: 15.2, R: 2.1, lean: -0.14 };
export const BPROF = [[0, 0.92], [0.03, 1], [0.34, 1], [0.44, 0.9], [0.54, 0.95], [0.62, 0.86], [0.72, 0.52], [0.82, 0.33], [0.92, 0.29], [0.94, 0.35], [0.965, 0.35], [0.975, 0.3], [1, 0.3]];
