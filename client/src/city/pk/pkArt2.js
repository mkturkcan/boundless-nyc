// AR33 PROPS art, part 2 (part pk, docs/notes/ar33-props.md): regulation plates, the MTA bus-stop blades, the subway stair and
// its name plate, drawn from scratch on canvases.
import * as THREE from 'three';

const _tex = new Map();
function tex(key, w, h, draw) {
  let t = _tex.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _tex.set(key, t);
  return t;
}
const FONT = '"Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function fitText(x, s, maxW, px, weight = 'bold') {
  let p = px;
  do { x.font = `${weight} ${p}px ${FONT}`; if (x.measureText(s).width <= maxW) break; p -= 2; } while (p > 8);
  return p;
}

// ---- regulation plates (NYC DOT: white ground, red or green lettering), 0.305 x 0.457 m (12 x 18 in), the last two square
const PARK = [
  { w: 256, h: 384, col: '#b3161c', lines: [['NO', 70], ['STANDING', 50], ['ANYTIME', 50]], arrow: 'both' },
  { w: 256, h: 384, col: '#b3161c', lines: [['NO PARKING', 42], ['7AM-7PM', 54], ['MON THRU FRI', 34]], arrow: 'left' },
  { w: 256, h: 384, col: '#1c6b3a', lines: [['1 HOUR', 62], ['PARKING', 54], ['9AM-7PM', 44], ['EXCEPT SUNDAY', 28]], arrow: 'right' },
  { w: 256, h: 384, col: '#b3161c', lines: [['NO STANDING', 36], ['EXCEPT', 40], ['TRUCKS', 50], ['LOADING AND', 34], ['UNLOADING', 34], ['7AM-7PM', 44]], arrow: 'both' },
  { w: 256, h: 384, col: '#b3161c', lines: [['BUS STOP', 52], ['NO', 50], ['STANDING', 44]], arrow: 'left' },
  { w: 256, h: 256, col: '#15181a', lines: [["DON'T", 48], ['BLOCK', 48], ['THE BOX', 48]], box: true },
  { w: 256, h: 256, col: '#15181a', lines: [['ONE WAY', 52]], arrow: 'big' },
];
export function parkTex(i) {
  const D = PARK[((i % PARK.length) + PARK.length) % PARK.length];
  return tex('park:' + i, D.w, D.h, (x, w, h) => {
    x.fillStyle = '#f1f1ec'; x.fillRect(0, 0, w, h);
    x.strokeStyle = D.col; x.lineWidth = 7; x.strokeRect(9, 9, w - 18, h - 18);
    x.fillStyle = D.col; x.textBaseline = 'middle';
    const n = D.lines.length, top = 26, avail = h - (D.arrow && D.arrow !== 'big' ? 100 : 52) - top;
    let y = top + (avail / n) / 2;
    for (const [t, px] of D.lines) {
      const p = fitText(x, t, w - 34, px, 'bold');
      x.font = `bold ${p}px ${FONT}`;
      x.fillText(t, (w - x.measureText(t).width) / 2, y);
      y += avail / n;
    }
    if (D.arrow === 'big') {
      x.fillRect(40, h - 100, w - 110, 20); x.beginPath(); x.moveTo(w - 70, h - 130); x.lineTo(w - 30, h - 90); x.lineTo(w - 70, h - 50); x.fill();
    } else if (D.arrow) {
      const yy = h - 52;
      x.lineWidth = 9; x.strokeStyle = D.col; x.beginPath(); x.moveTo(50, yy); x.lineTo(w - 50, yy); x.stroke();
      const head = (xx, dir) => { x.beginPath(); x.moveTo(xx, yy - 22); x.lineTo(xx + dir * 34, yy); x.lineTo(xx, yy + 22); x.fill(); };
      if (D.arrow !== 'right') head(40, -1);
      if (D.arrow !== 'left') head(w - 40, 1);
    }
    if (D.box) { x.strokeStyle = '#b3161c'; x.lineWidth = 8; x.beginPath(); x.moveTo(30, 30); x.lineTo(w - 30, h - 30); x.moveTo(w - 30, 30); x.lineTo(30, h - 30); x.stroke(); }
  });
}

// ---- MTA bus stop: the roundel (blue, white ring, a bus and the wheelchair mark), the route blade and the info plate
export function busRoundTex() {
  return tex('busRound', 256, 256, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0c3f8f'; x.beginPath(); x.arc(w / 2, h / 2, 118, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 9; x.beginPath(); x.arc(w / 2, h / 2, 104, 0, Math.PI * 2); x.stroke();
    // the bus seen from the front
    x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(72, 62, 112, 104, 14); x.fill();
    x.fillStyle = '#0c3f8f'; x.fillRect(82, 74, 92, 44); x.fillRect(82, 126, 30, 10); x.fillRect(144, 126, 30, 10);
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(90, 176, 12, 0, Math.PI * 2); x.arc(166, 176, 12, 0, Math.PI * 2); x.fill();
    // the wheelchair symbol at the foot
    x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.beginPath(); x.arc(122, 206, 12, Math.PI * 0.2, Math.PI * 1.7); x.stroke();
    x.beginPath(); x.arc(128, 188, 4, 0, Math.PI * 2); x.fill();
  });
}
const BLADES = [['M100', 'M101'], ['M101', 'M102', 'M103'], ['M60', 'SBS'], ['M35', 'M60', 'SBS']];
export function busBladeTex(k) {
  const R = BLADES[((k % BLADES.length) + BLADES.length) % BLADES.length];
  return tex('busBlade:' + k, 160, 320, (x, w, h) => {
    x.fillStyle = '#0c3f8f'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#ffffff'; x.textBaseline = 'middle';
    x.font = `bold 26px ${FONT}`; x.fillText('MTA BUS', (w - x.measureText('MTA BUS').width) / 2, 30);
    x.fillRect(16, 50, w - 32, 3);
    const n = R.length, avail = h - 80;
    R.forEach((t, i) => {
      const y = 70 + (avail / n) * (i + 0.5);
      if (t === 'SBS') { x.fillStyle = '#e8792b'; x.fillRect(22, y - 26, w - 44, 52); x.fillStyle = '#ffffff'; x.font = `bold 40px ${FONT}`; x.fillText('SBS', (w - x.measureText('SBS').width) / 2, y + 2); return; }
      x.fillStyle = '#ffffff'; x.fillRect(22, y - 24, w - 44, 48);
      x.fillStyle = '#0c3f8f'; x.font = `bold 38px ${FONT}`; x.fillText(t, (w - x.measureText(t).width) / 2, y + 2);
    });
  });
}
export function busInfoTex() {
  return tex('busInfo', 160, 128, (x, w, h) => {
    x.fillStyle = '#f4f4ef'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0c3f8f'; x.fillRect(0, 0, w, 26);
    x.fillStyle = '#ffffff'; x.font = `bold 15px ${FONT}`; x.fillText('Bus Time', 8, 18);
    x.fillStyle = '#20252a'; x.font = `bold 13px ${FONT}`; x.fillText('Text your stop code', 8, 48); x.fillText('to 511123', 8, 64);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (((i * 7 + j * 13 + i * j) % 3) !== 1) x.fillRect(100 + i * 8, 70 + j * 8, 7, 7);
    x.font = `11px ${FONT}`; x.fillText('mta.info/bus', 8, 118);
  });
}
// ---- subway: the stair's dark opening with the treads' yellow nosings, and the station name plate
export function stairsTex() {
  return tex('stairs', 128, 256, (x, w, h) => {
    x.fillStyle = '#0b0c0d'; x.fillRect(0, 0, w, h);
    // v = 0 (image bottom) is the open end: the first treads are lit
    const n = 14;
    for (let i = 0; i < n; i++) {
      const y = h - 6 - i * (h / n) * 0.92 * (1 - i * 0.02);
      const lum = Math.max(0, 1 - i / n) ** 1.6;
      x.fillStyle = `rgba(${Math.round(60 + 70 * lum)},${Math.round(62 + 68 * lum)},${Math.round(60 + 62 * lum)},${0.35 + 0.65 * lum})`;
      x.fillRect(4, y - 14, w - 8, 12);
      x.fillStyle = `rgba(214,170,30,${0.25 + 0.75 * lum})`; x.fillRect(4, y - 16, w - 8, 3);
    }
  });
}
const BULLET = { 1: '#ee352e', 2: '#ee352e', 3: '#ee352e', 4: '#00933c', 5: '#00933c', 6: '#00933c', A: '#0039a6', B: '#ff6319', C: '#0039a6', D: '#ff6319' };
export function subPlateTex(lines) {
  return tex('subPlate:' + lines, 256, 80, (x, w, h) => {
    x.fillStyle = '#16171a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.font = `bold 34px ${FONT}`; x.textBaseline = 'middle';
    x.fillText('125 St', 12, 42);
    // (AR34 STATIONS: three or four lines take smaller bullets so they clear the name, A C B D at St Nicholas Ave)
    const ls = String(lines).split(''), big = ls.length <= 2, r = big ? 22 : 14, step = big ? 52 : 31;
    ls.forEach((c, i) => {
      const cx = w - 8 - r - (ls.length - 1 - i) * step;
      x.fillStyle = BULLET[c] || '#555'; x.beginPath(); x.arc(cx, 40, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffffff'; x.font = `bold ${big ? 30 : 20}px ${FONT}`; x.fillText(c, cx - x.measureText(c).width / 2, big ? 42 : 41);
    });
  });
}

// ---- the SBS fare machine's face: the MTA header, the screen, the card reader, the receipt slot
export function sbsTex() {
  return tex('sbs', 256, 512, (x, w, h) => {
    x.fillStyle = '#1b4f9a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f3f3ee'; x.fillRect(10, 10, w - 20, 92);
    x.fillStyle = '#1b4f9a'; x.font = `bold 34px ${FONT}`; x.textBaseline = 'middle';
    x.fillText('SELECT BUS', 22, 40); x.fillText('SERVICE', 22, 78);
    x.fillStyle = '#e8792b'; x.fillRect(10, 106, w - 20, 10);
    // the screen
    x.fillStyle = '#0a0d12'; x.fillRect(26, 130, w - 52, 150);
    x.fillStyle = '#1e6fd0'; x.fillRect(32, 136, w - 64, 34);
    x.fillStyle = '#ffffff'; x.font = `bold 20px ${FONT}`; x.fillText('Pay Fare', 42, 154);
    x.fillStyle = '#d9e6f7'; for (let i = 0; i < 4; i++) x.fillRect(38, 184 + i * 24, w - 76 - (i % 2) * 40, 12);
    // card reader and keypad
    x.fillStyle = '#d4d6d8'; x.fillRect(34, 300, 80, 56); x.fillStyle = '#20252a'; x.fillRect(44, 312, 60, 12);
    x.fillStyle = '#d4d6d8'; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) x.fillRect(134 + i * 28, 300 + j * 19, 22, 14);
    // slots
    x.fillStyle = '#0b0c0d'; x.fillRect(34, 392, w - 68, 18); x.fillRect(34, 430, w - 68, 26);
    x.fillStyle = '#f3f3ee'; x.font = `bold 15px ${FONT}`; x.fillText('RECEIPT', 40, 484);
  });
}
