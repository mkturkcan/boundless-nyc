// AR33 SIGN: marks of the chains and shops on 125th Street, drawn from scratch on canvas. Each export is a logo
// drawer fn(ctx2d, w, h) for a SIGN's `logo` (docs/notes/ar33-signs.md): it paints on a transparent w x h canvas;
// `fn.fonts` lists the fonts it sets text in (loaded before it runs). A segment uses one through its custom module
// (`export { capitalOneBank } from '../signMarks.js'` in fk/custom/<seg>.js, then logo: '<seg>:capitalOneBank').
// Owner: SIGN.

const TAU = Math.PI * 2;
const F = (w, px, key) => `${w} ${Math.max(1, Math.round(px))}px "ar33 ${key}"`;
function fitFont(c, text, weightStyle, key, px, maxW) {
  c.font = F(weightStyle, px, key);
  const m = c.measureText(text).width;
  if (m > maxW) { px *= maxW / m; c.font = F(weightStyle, px, key); }
  return px;
}

// Capital One Bank (2329 8th Ave): the whole face (a lightbox with logoAt 'fill').
export function capitalOneBank(c, w, h) {
  // the face as on the 2329 8th Avenue corner: a deep navy field with
  // a faint pattern of thin light lines, "Capital" heavy, "One" a light italic with a tall O set lower, "Bank" bold and
  // lower again, the red swoosh rising thin over "pital", thickest right of the O and hooking down-left to a point under
  // the "lO" join. Proportions are in units of the face height; the group is centred on a wider face.
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1d2d7a'); g.addColorStop(0.5, '#253894'); g.addColorStop(1, '#1b2a72');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, 'rgba(60,90,200,0.05)'); vg.addColorStop(1, 'rgba(5,10,40,0.16)');
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
  c.save(); c.strokeStyle = 'rgba(170,195,255,0.16)'; c.lineWidth = Math.max(1, h * 0.006);
  for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(w * (0.1 + i * 0.15), h * (1.3 + (i % 3) * 0.2), w * 0.42, h * (1.1 + i * 0.07), 0.15 * (i % 2 ? 1 : -1), Math.PI * 1.02, Math.PI * 1.75); c.stroke(); }
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(w * (i * 0.19 - 0.05), 0); c.lineTo(w * (i * 0.19 + 0.12), h); c.stroke(); }
  c.restore();
  // the group in face-height units: Capital u 0..1.15 (cap 0.36, baseline 0.69), One
  // 1.18..1.66 (cap 0.47, baseline 0.79), Bank 1.70..2.25 (cap 0.17, baseline 0.86); each word set to its measured width
  // (the real face is narrower than Lato); centred, shrunk to 92 % of the width if it would not fit
  const GW = 2.25, U = Math.min(h, (w * 0.92) / GW), ox = (w - GW * U) / 2, oy = (h - U) / 2;
  const X = (u) => ox + u * U, Y = (v) => oy + v * U;
  c.textBaseline = 'alphabetic';
  const word = (t, ws, cap, u0, u1, base) => {
    c.font = F(ws, (cap * U) / 0.72, 'Lato');
    const m = c.measureText(t).width || 1;
    c.save(); c.translate(X(u0), Y(base)); c.scale(((u1 - u0) * U) / m, 1); c.fillText(t, 0, 0); c.restore();
  };
  c.save(); c.shadowColor = 'rgba(0,0,10,0.55)'; c.shadowBlur = U * 0.025; c.shadowOffsetY = U * 0.018; c.fillStyle = '#f5f7fc';
  word('Capital', '900', 0.36, 0, 1.15, 0.69);
  word('One', 'italic 700', 0.47, 1.18, 1.66, 0.79);           // Lato bold italic: the face BID1's drawer list loads
  word('Bank', '900', 0.17, 1.70, 2.25, 0.86);
  c.restore();
  // the swoosh: outer edge S -> P1 -> tail T, inner edge back T -> P2 -> S
  const P = (u, v) => [X(u), Y(v)];
  const S = P(0.43, 0.245), C1 = P(1.035, 0.07), P1 = P(1.58, 0.335), C2 = P(1.6, 0.68), T = P(0.906, 0.898);
  const C3 = P(1.45, 0.62), P2 = P(1.45, 0.38), C4 = P(1.06, 0.1475);
  c.save(); c.shadowColor = 'rgba(0,0,10,0.45)'; c.shadowBlur = U * 0.02; c.shadowOffsetY = U * 0.014;
  const rg = c.createLinearGradient(S[0], S[1], P1[0], P1[1]);
  rg.addColorStop(0, '#c8281f'); rg.addColorStop(1, '#de2f22');
  c.fillStyle = rg;
  c.beginPath(); c.moveTo(...S);
  c.quadraticCurveTo(...C1, ...P1); c.quadraticCurveTo(...C2, ...T);
  c.quadraticCurveTo(...C3, ...P2); c.quadraticCurveTo(...C4, ...S);
  c.closePath(); c.fill();
  c.restore();
}
capitalOneBank.fonts = ['Lato-900', 'Lato-700i'];

// the Chase octagon: four pinwheel pieces round a square hole (Chase blue)
export function chaseOctagon(c, w, h, color = '#117aca') {
  const s = Math.min(w, h), cx = w / 2, cy = h / 2, R = s * 0.48;
  const oct = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; oct.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const q = R * 0.3;                      // half the hole
  const gap = s * 0.012;
  // intersect a ray from p along d with the octagon
  const hit = (p, d) => {
    let best = null, bt = 1e9;
    for (let i = 0; i < 8; i++) {
      const a = oct[i], b = oct[(i + 1) % 8];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = d[0] * ey - d[1] * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
      const u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < bt) { bt = t; best = { pt: [p[0] + d[0] * t, p[1] + d[1] * t], i }; }
    }
    return best;
  };
  c.save(); c.translate(cx, cy); c.fillStyle = color;
  for (let k = 0; k < 4; k++) {
    c.save(); c.rotate(k * Math.PI / 2);
    // piece: square top edge TL -> TR, the ray right from TR to the octagon, round the octagon back to the ray up from TL
    const TL = [-q, -q], TR = [q, -q];
    const A = hit(TR, [1, 0]), B = hit(TL, [0, -1]);
    if (A && B) {
      c.beginPath(); c.moveTo(TL[0] + gap, TL[1] - gap); c.lineTo(TR[0] + gap, TR[1] - gap); c.lineTo(A.pt[0], A.pt[1] - gap);
      // octagon vertices from A's edge going toward B (decreasing angle: up and over)
      let i = A.i;
      for (let n = 0; n < 8; n++) { const v = oct[i]; c.lineTo(v[0], v[1]); if (i === (B.i + 1) % 8) break; i = (i + 7) % 8; }
      c.lineTo(B.pt[0] + gap, B.pt[1]);
      c.closePath(); c.fill();
    }
    c.restore();
  }
  c.restore();
}

// CVS's heart (red), for a sign whose text is the wordmark
export function cvsHeart(c, w, h, color = '#cc0000') {
  const s = Math.min(w, h) * 0.9, cx = w / 2, cy = h / 2 + s * 0.04;
  c.fillStyle = color; c.beginPath();
  c.moveTo(cx, cy + s * 0.38);
  c.bezierCurveTo(cx - s * 0.62, cy - s * 0.02, cx - s * 0.36, cy - s * 0.52, cx, cy - s * 0.2);
  c.bezierCurveTo(cx + s * 0.36, cy - s * 0.52, cx + s * 0.62, cy - s * 0.02, cx, cy + s * 0.38);
  c.closePath(); c.fill();
}

// the golden arches
export function goldenArches(c, w, h, color = '#ffc72c') {
  const s = Math.min(w, h * 1.1), cx = w / 2, by = h * 0.92, top = h * 0.1;
  const lw = s * 0.13, half = s * 0.45;
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'butt';
  for (const side of [-1, 1]) {
    const x0 = cx + side * half, x1 = cx;
    const mid = (x0 + x1) / 2;
    c.beginPath(); c.moveTo(x0 - side * lw / 2 * 0, by);
    c.bezierCurveTo(x0, top - h * 0.05, x1, top - h * 0.05, x1, by * 0.72 + top * 0.28);
    c.stroke();
    void mid;
  }
}

// Cinderella Eyebrows' SPA badge: a yellow ellipse, navy italic letters
export function spaBadge(c, w, h) {
  c.save();
  c.fillStyle = '#f2c500';
  c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.48, h * 0.3, 0, 0, TAU); c.fill();
  c.fillStyle = '#1b3486';
  c.font = F('italic 800', h * 0.32, 'Poppins');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('SPA', w / 2, h / 2 + h * 0.02);
  c.restore();
}
spaBadge.fonts = ['Poppins-800'];

// Orange Beauty Supply's roundel: an orange disc in a
// silver ring that opens at the upper right, where the word runs out of the circle on a silver tongue; 'orange' in
// rounded lower case, red-edged; a dark red stem curling off the ring at the upper left. For a channel sign's
// logoAt 'left' (the kit raises it as a plate cut to this outline).
export function orangeBeauty(c, w, h) {
  const R = Math.min(w, h) * 0.47, cx = w * 0.47, cy = h * 0.53;
  c.save();
  // the silver tongue under 'ge' (drawn first: the ring and the disc overlap it)
  c.fillStyle = '#d4d6d8';
  c.beginPath(); c.ellipse(cx + R * 0.62, cy - R * 0.42, R * 0.5, R * 0.3, -0.38, 0, TAU); c.fill();
  // the ring and the disc
  c.fillStyle = '#c9cbce'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.fillStyle = '#eef0f1'; c.beginPath(); c.arc(cx, cy, R * 0.93, 0, TAU); c.fill();
  c.fillStyle = '#f26a35'; c.beginPath(); c.arc(cx, cy, R * 0.84, 0, TAU); c.fill();
  // the stem: a dark red curl off the ring at the upper left
  c.strokeStyle = '#8e1b22'; c.lineCap = 'round'; c.lineWidth = R * 0.085;
  c.beginPath(); c.moveTo(cx - R * 0.55, cy - R * 0.72); c.quadraticCurveTo(cx - R * 0.9, cy - R * 1.05, cx - R * 1.02, cy - R * 0.88); c.stroke();
  // the word, set across the disc and out over the tongue
  const px = fitFont(c, 'orange', '800', 'Nunito', R * 0.6, R * 1.85);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.save(); c.translate(cx + R * 0.12, cy - R * 0.02); c.rotate(-0.22);
  c.lineJoin = 'round'; c.lineWidth = px * 0.16; c.strokeStyle = '#c3202b'; c.strokeText('orange', 0, 0);
  c.fillStyle = '#f68a5c'; c.fillText('orange', 0, 0);
  c.restore();
  c.restore();
}
orangeBeauty.fonts = ['Nunito-800'];
