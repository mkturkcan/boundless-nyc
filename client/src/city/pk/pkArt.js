// AR33 PROPS art (part pk, docs/notes/ar33-props.md): the faces of the signs, banners, kiosk screens and pedestrian heads,
// drawn from scratch on canvases (fonts and shapes matched to the references by eye; nothing sampled from them). Ad
// screens carry invented brands only.
import * as THREE from 'three';

const _tex = new Map();
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function tex(key, w, h, draw, o = {}) {
  let t = _tex.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return null;
  const c = canvas(w, h), x = c.getContext('2d');
  draw(x, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  _tex.set(key, t);
  return t;
}
const FONT = '"Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function fitText(x, s, maxW, px, weight = 'bold', font = FONT) {
  let p = px;
  do { x.font = `${weight} ${p}px ${font}`; if (x.measureText(s).width <= maxW) break; p -= 2; } while (p > 8);
  return p;
}

// ---- NYC street name blades: DOT green, white border, white letters; `small` is the prefix (W / E) set smaller and
// raised, `suf` the suffix (St, Av, Blvd) in smaller caps
export const SIGNS = {
  w125: { pre: 'W', name: '125', suf: 'St' }, e125: { pre: 'E', name: '125', suf: 'St' },
  mlk: { name: 'Martin Luther King Jr', suf: 'Blvd' },
  acp: { name: 'Adam C Powell', suf: 'Blvd', sub: '7 Av' }, fdb: { name: 'Frederick Douglass', suf: 'Blvd', sub: '8 Av' },
  mx: { name: 'Malcolm X', suf: 'Blvd', sub: 'Lenox Av' }, lenox: { name: 'Lenox', suf: 'Av' },
  stn: { name: 'St Nicholas', suf: 'Av' }, morn: { name: 'Morningside', suf: 'Av' }, fifth: { name: '5', suf: 'Av' },
  mad: { name: 'Madison', suf: 'Av' }, park: { name: 'Park', suf: 'Av' }, lex: { name: 'Lexington', suf: 'Av' },
  third: { name: '3', suf: 'Av' }, second: { name: '2', suf: 'Av' }, first: { name: '1', suf: 'Av' },
  bway: { name: 'Broadway' }, amst: { name: 'Amsterdam', suf: 'Av' }, twelfth: { name: '12', suf: 'Av' },
  harlemBlvd: { name: 'Harlem Renaissance', suf: 'Way' }, afsq: { name: 'African', suf: 'Sq' },
};
export function signTex(k) {
  const S = SIGNS[k] || { name: String(k) };
  return tex('sign:' + k, 1024, 168, (x, w, h) => {
    x.fillStyle = '#0b6b45'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#f4f6f2'; x.lineWidth = 7; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#f7f8f4'; x.textBaseline = 'alphabetic';
    const main = S.name, y = S.sub ? 104 : 124;
    let px = fitText(x, main, w - 260, S.sub ? 92 : 112);
    const wm = x.measureText(main).width;
    x.font = `bold ${Math.round(px * 0.55)}px ${FONT}`;
    const wp = S.pre ? x.measureText(S.pre).width + 16 : 0, ws = S.suf ? x.measureText(S.suf).width + 14 : 0;
    let cx = (w - (wp + wm + ws)) / 2;
    if (S.pre) { x.fillText(S.pre, cx, y - px * 0.4); cx += wp; }
    x.font = `bold ${px}px ${FONT}`; x.fillText(main, cx, y); cx += wm + 14;
    if (S.suf) { x.font = `bold ${Math.round(px * 0.55)}px ${FONT}`; x.fillText(S.suf, cx, y - px * 0.4); }
    if (S.sub) { x.font = `bold 40px ${FONT}`; const t2 = S.sub; x.fillText(t2, (w - x.measureText(t2).width) / 2, 150); }
  });
}

// ---- the BID's banners (125th Street BID light-pole banners: a tall print, the BID's mark at the foot). The designs
// are this project's own compositions in the banners' palette: deep navy / purple grounds, a bold headline, a figure
// in silhouette, the district's name.
const BANNERS = [
  { bg: ['#1b1646', '#2f1c63'], head: 'EXPLORE', sub: 'Arts & Culture', acc: '#f25a29', fig: 'dancer' },
  { bg: ['#0f3d5c', '#15577a'], head: 'SHOP', sub: '125th Street', acc: '#f6c343', fig: 'bag' },
  { bg: ['#4a1238', '#7a1f4f'], head: 'DINE', sub: 'Harlem', acc: '#ffd166', fig: 'cup' },
  { bg: ['#123c2c', '#1d5a40'], head: 'CELEBRATE', sub: 'Harlem Week', acc: '#ff8c42', fig: 'star' },
];
export const NBANNER = BANNERS.length;
export function bannerTex(k) {
  const B = BANNERS[k % BANNERS.length];
  return tex('banner:' + k, 256, 640, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, B.bg[1]); g.addColorStop(1, B.bg[0]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a wide arc of the accent colour behind the figure
    x.fillStyle = B.acc; x.globalAlpha = 0.9;
    x.beginPath(); x.arc(w / 2, 300, 96, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    x.fillStyle = B.bg[0];
    if (B.fig === 'dancer') {
      x.beginPath(); x.arc(w / 2 + 6, 236, 17, 0, Math.PI * 2); x.fill();
      x.lineCap = 'round'; x.strokeStyle = B.bg[0]; x.lineWidth = 17;
      x.beginPath(); x.moveTo(w / 2 + 2, 258); x.lineTo(w / 2 - 6, 318); x.stroke();
      x.lineWidth = 11;
      x.beginPath(); x.moveTo(w / 2, 268); x.lineTo(w / 2 - 44, 238); x.moveTo(w / 2 + 2, 268); x.lineTo(w / 2 + 46, 300);
      x.moveTo(w / 2 - 6, 316); x.lineTo(w / 2 - 38, 372); x.moveTo(w / 2 - 4, 316); x.lineTo(w / 2 + 34, 350); x.lineTo(w / 2 + 58, 388); x.stroke();
    } else if (B.fig === 'bag') {
      x.fillRect(w / 2 - 50, 262, 100, 96);
      x.strokeStyle = B.bg[0]; x.lineWidth = 10; x.beginPath(); x.arc(w / 2, 262, 30, Math.PI, 0); x.stroke();
    } else if (B.fig === 'cup') {
      x.beginPath(); x.moveTo(w / 2 - 52, 250); x.lineTo(w / 2 + 52, 250); x.lineTo(w / 2 + 38, 356); x.lineTo(w / 2 - 38, 356); x.closePath(); x.fill();
    } else {
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 36 : 84; x.lineTo(w / 2 + Math.cos(a) * r, 300 + Math.sin(a) * r); }
      x.closePath(); x.fill();
    }
    x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic';
    const px = fitText(x, B.head, w - 36, 64, '900');
    x.fillText(B.head, (w - x.measureText(B.head).width) / 2, 120);
    x.fillStyle = B.acc; x.fillRect(40, 140, w - 80, 6);
    x.fillStyle = '#ffffff';
    fitText(x, B.sub, w - 40, 34, 'bold');
    x.fillText(B.sub, (w - x.measureText(B.sub).width) / 2, 470);
    // the district's mark at the foot: a circle with "125" and the street's name
    x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.beginPath(); x.arc(w / 2, 560, 38, 0, Math.PI * 2); x.stroke();
    x.font = `900 30px ${FONT}`; x.fillText('125', (w - x.measureText('125').width) / 2, 571);
    x.font = `bold 15px ${FONT}`; const t = '125TH STREET'; x.fillText(t, (w - x.measureText(t).width) / 2, 622);
    void px;
  });
}

// ---- the compactor's decal (the BID's green panel with its street name, no maker's mark)
export function bbTex() {
  return tex('bb', 256, 200, (x, w, h) => {
    x.fillStyle = '#233128'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e9efe9'; x.font = `bold 34px ${FONT}`; x.fillText('125th Street', 24, 64);
    x.fillStyle = '#9ccc65'; x.fillRect(24, 80, w - 48, 5);
    x.fillStyle = '#e9efe9'; x.font = `bold 26px ${FONT}`; x.fillText('LITTER', 24, 124); x.font = `20px ${FONT}`; x.fillText('Keep Harlem clean', 24, 160);
  });
}
// ---- the kiosk's screens: invented brands, one design per variant (a and b faces), and the top mark
const ADS = [
  { bg: ['#ff5f3c', '#ffb347'], t1: 'SOLA', t2: 'sparkling water', fg: '#ffffff' },
  { bg: ['#1f2a44', '#3e5c8a'], t1: 'Harbor', t2: 'mobile - 5G everywhere', fg: '#ffffff' },
  { bg: ['#0c7c59', '#58b368'], t1: 'MERIDIAN', t2: 'savings for real life', fg: '#ffffff' },
  { bg: ['#f2f2ee', '#d9d9d2'], t1: 'Loft & Co', t2: 'new season', fg: '#1a1a1a' },
  { bg: ['#6a1b9a', '#b447c9'], t1: 'Pulse', t2: 'music - live - free', fg: '#ffffff' },
  { bg: ['#0a0a0a', '#2d2d2d'], t1: 'NYC SAFE', t2: 'text 911 if you cannot call', fg: '#ffd400' },
];
export function screenTex(k) {
  const A = ADS[((k % ADS.length) + ADS.length) % ADS.length];
  return tex('ad:' + k, 256, 452, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, A.bg[0]); g.addColorStop(1, A.bg[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.18; x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(w * 0.8, h * 0.3, 120, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    x.fillStyle = A.fg;
    fitText(x, A.t1, w - 40, 64, '900'); x.fillText(A.t1, 22, h * 0.62);
    fitText(x, A.t2, w - 44, 22, 'bold'); x.fillText(A.t2, 24, h * 0.62 + 36);
  });
}
export function linkTopTex() {
  return tex('linktop', 256, 64, (x, w, h) => {
    x.fillStyle = '#1b1d1f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8eaec'; x.font = `bold 40px ${FONT}`; const t = 'LINK';
    x.fillText(t, (w - x.measureText(t).width) / 2, 46);
  });
}
export function tabletTex() {
  return tex('tablet', 128, 192, (x, w, h) => {
    x.fillStyle = '#0d2a4a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.font = `bold 14px ${FONT}`; x.fillText('Free Wi-Fi', 12, 30); x.fillText('Maps', 12, 60); x.fillText('311', 12, 90);
    x.fillStyle = '#e53935'; x.fillRect(12, 150, w - 24, 26); x.fillStyle = '#ffffff'; x.fillText('911', 50, 168);
  });
}
// ---- pedestrian heads: the upraised hand (Portland orange), the walking person (lunar white), the countdown digits
export function pedHandTex() {
  return tex('pedHand', 128, 224, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff7a1a';
    for (let i = 0; i < 4; i++) { x.beginPath(); x.roundRect(22 + i * 22, 36 - (i === 1 || i === 2 ? 14 : 0), 16, 88, 8); x.fill(); }
    x.beginPath(); x.roundRect(20, 100, 88, 92, 26); x.fill();
    x.beginPath(); x.roundRect(98, 110, 16, 56, 8); x.fill();
  });
}
export function pedManTex() {
  return tex('pedMan', 128, 224, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2f4f6'; x.strokeStyle = '#f2f4f6'; x.lineCap = 'round';
    x.beginPath(); x.arc(66, 40, 15, 0, Math.PI * 2); x.fill();
    x.lineWidth = 20; x.beginPath(); x.moveTo(64, 70); x.lineTo(60, 130); x.stroke();
    x.lineWidth = 12; x.beginPath(); x.moveTo(64, 78); x.lineTo(40, 118); x.moveTo(64, 78); x.lineTo(92, 110);
    x.moveTo(60, 128); x.lineTo(36, 196); x.moveTo(60, 128); x.lineTo(84, 160); x.lineTo(96, 200); x.stroke();
  });
}
export function pedCountTex(n) {
  return tex('pedCount:' + n, 128, 192, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    if (n > 0) { x.fillStyle = '#ff7a1a'; x.font = `bold 120px ${FONT}`; const t = String(n); x.fillText(t, (w - x.measureText(t).width) / 2, 150); }
  });
}
// a plain dark face (the unlit parts of a pedestrian head)
export function darkTex() { return tex('dark', 8, 8, (x, w, h) => { x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, w, h); }); }
export function solarTex() {
  return tex('solar', 128, 128, (x, w, h) => {
    x.fillStyle = '#0e1a2c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#8a9bb0'; x.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); }
  });
}
