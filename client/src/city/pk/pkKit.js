// AR33 PROPS model kit (part pk, docs/notes/ar33-props.md): NYC street furniture as it stands on 125th Street, modelled
// in code to the measured sizes (every model: local +z = the side facing the roadway, x along the kerb, y up, origin at
// the base on the pavement). Each builder takes q (1 = the near model, 0 = the far one) and returns a Model (pkGeo.js)
// whose parts are keyed by material (pkMats.js keys; 'lens*', 'lum', 'face:*', 'glow:*' are resolved by props.js).
import * as THREE from 'three';
import { Model, lathe, cyl, rbox, box, tube, rod, extrude, disc, plane, loft, at, rotY, rotX, rotZ, sleeve } from './pkGeo.js';
import { mutSize } from './pkSigns.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const seg = (q, hi, lo) => (q ? hi : lo);

// ---------------------------------------------------------------- the DOT street light (125th Street's galvanised
// tapered pole, upswept bracket arm, LED cobra head; the BID's banner arms). Head at ~9.2 m, 2.9 m out over the road.
export const LAMP = { armOut: 2.9, headY: 9.12, poleH: 8.65 };
export function luminaire(q = 1) {
  // an LED cobra head, 0.80 x 0.34 x 0.15 m: a cast housing with a blunt rear (the tenon), swelling to its full width a
  // third of the way out and tapering to a rounded tip, a flat lens under it, a photocell on the ridge
  const M = new Model();
  const L = 0.8, W = 0.17;
  const N = seg(q, 18, 9), ring = seg(q, 16, 8);
  const secs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -0.12 + t * L;
    // width: a quick swell from the rear, then a long taper; both ends close to a point
    const w = W * (0.3 + 0.7 * Math.sin(Math.min(1, t * 6) * Math.PI / 2)) * (1 - 0.5 * Math.pow(Math.max(0, t - 0.25) / 0.75, 1.6)) * (t > 0.93 ? Math.sqrt(Math.max(0, 1 - (t - 0.93) / 0.07)) : 1) * (t < 0.03 ? Math.sqrt(t / 0.03) : 1);
    const top = 0.085 * (0.72 + 0.28 * Math.sin(Math.min(1, t * 4) * Math.PI / 2)) * (1 - 0.4 * Math.pow(t, 1.8));
    secs.push({ x, w: Math.max(0.004, w), t: Math.max(0.004, top), b: 0.012, n: 2.6, cy: 0 });
  }
  M.add('luminaireBody', loft(secs, ring));
  // the lens: a slightly proud flat refractor under the housing, and its bezel
  M.add('luminaireBody', rbox(L * 0.74, 0.016, W * 1.5, 0.006, -0.12 + L * 0.5, -0.012, 0));
  M.add('lum', rbox(L * 0.66, 0.008, W * 1.3, 0.004, -0.12 + L * 0.5, -0.022, 0));
  if (q) {
    // the cooling fins along the ridge, the photocell, the tenon clamp and its bolts
    for (let kf = 0; kf < 5; kf++) M.add('luminaireBody', rbox(0.34, 0.03, 0.006, 0.002, 0.2, 0.095, -0.06 + kf * 0.03));
    M.add('luminaireBody', cyl(0.03, 0.03, 0.03, 12, 0.085).translate(0.0, 0, 0));
    M.add('plastic', lathe([[0.001, 0], [0.028, 0.0], [0.03, 0.02], [0.022, 0.038], [0.001, 0.043]], 12).translate(0.0, 0.11, 0));
    M.add('luminaireBody', rbox(0.15, 0.085, 0.1, 0.02, -0.1, 0.012, 0));
    for (const sz of [-1, 1]) M.add('galv', cyl(0.009, 0.009, 0.03, 6, 0).rotateX(Math.PI / 2).translate(-0.11, 0.03, sz * 0.055));
  }
  return M;
}
function bannerArm(M, y, len, q) {
  // a banner bracket: a clamp collar on the pole, a 32 mm tube out to a ball finial
  M.add('galv', cyl(0.085, 0.085, 0.08, seg(q, 14, 6), y - 0.04));
  M.add('galv', rod([0, y, 0.06], [0, y, len], 0.017, seg(q, 8, 4)));
  if (q) M.add('galv', lathe([[0.001, -0.02], [0.022, -0.012], [0.024, 0.0], [0.02, 0.014], [0.001, 0.022]], 8).translate(0, y, len + 0.01));
}
// the BID's banner: 0.76 x 1.83 m between the two arms, printed both sides (props.js draws the art: face:banner<k>)
export function banner(k, y0 = 4.55, y1 = 6.45, q = 1) {
  const M = new Model();
  const w = 0.74, h = y1 - y0 - 0.1;
  // printed both sides: the front faces +x (the approaching traffic), the back -x, each reading correctly
  for (const sgn of [1, -1]) {
    const g = plane(w, h);
    g.rotateY(sgn * Math.PI / 2);   // the banner stands in the y/z plane (faces along the kerb)
    const uv = g.getAttribute('uv'), p = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, sgn > 0 ? 1 - (p.getZ(i) + w / 2) / w : (p.getZ(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    g.translate(sgn * 0.003, (y0 + y1) / 2, 0.08 + w / 2);
    M.add('face:banner' + k, g);
  }
  // the pole pockets top and bottom (rolled fabric), a little thicker
  M.add('fabric', rbox(0.035, 0.05, w, 0.015, 0, y1 - 0.06, 0.08 + w / 2));
  M.add('fabric', rbox(0.035, 0.05, w, 0.015, 0, y0 + 0.06, 0.08 + w / 2));
  void q;
  return M;
}
export function lamp(q = 1, o = {}) {
  const M = new Model();
  const H = LAMP.poleH, s = seg(q, 20, 8);
  // anchor flange and nut caps
  M.add('galv', rbox(0.38, 0.03, 0.38, 0.01, 0, 0.015, 0));
  if (q) for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) M.add('galv', lathe([[0.001, 0.03], [0.026, 0.03], [0.026, 0.07], [0.018, 0.085], [0.001, 0.09]], 6).translate(x, 0, z));
  // the base shoe and the tapered shaft, the hand hole
  // the cast base (a 0.43 m skirt, 0.65 m high, with the hand hole), then the tapered shaft
  const pm = o.paint === 'white' ? 'whitePaint' : 'galv';
  M.add(pm, lathe([[0.001, 0.03], [0.215, 0.03], [0.215, 0.08], [0.2, 0.12], [0.19, 0.52], [0.15, 0.64], [0.118, 0.7]], s));
  M.add(pm, lathe([[0.116, 0.68], [0.105, 1.5], [0.094, 3.5], [0.083, 5.5], [0.072, 7.6], [0.066, H], [0.04, H + 0.03], [0.001, H + 0.05]], s));
  if (q) M.add('galvDark', rbox(0.12, 0.26, 0.02, 0.008, 0, 0.34, -0.19));
  if (q) {
    // the street's wear: stickers, flyers and tags at hand height, grime and rust spatter over the cast base
    const vk = (typeof o.banner === 'number' ? o.banner : 1) % 4;
    M.add('face:poleTags' + ((vk + 2) % 4), sleeve(0.1155, 0.1045, 0.9, 2.1, 16));
    M.add('face:poleGrime', sleeve(0.219, 0.219, 0.03, 0.08, 16), sleeve(0.204, 0.194, 0.12, 0.52, 16));
  }
  // regulation plates on the pole, facing the road
  for (const pl of o.plates || []) {
    const sq = pl.f >= 5, w = 0.305, h = sq ? 0.305 : 0.457, y = pl.y ?? 3.6, r = 0.105 - (y - 1.5) * 0.0055 + 0.012;
    M.add('aluBack', rbox(w, h, 0.004, 0.003, 0, y, r + 0.002));
    M.add('face:park' + pl.f, plane(w - 0.004, h - 0.004).translate(0, y, r + 0.0045));
    if (q) for (const dy of [h * 0.3, -h * 0.3]) M.add('galvDark', cyl(r - 0.008, r - 0.008, 0.025, 12, y + dy - 0.0125, true));
  }
  // the police cameras: two domes hung from a cross bracket and their box, at about 6 m
  if (o.cams) {
    const yc = o.camY || 6.0, rr = 0.079;
    // the shaft's radius at a height (the taper above), and the black band just proud of it
    const rAt = (y) => (y < 5.5 ? 0.094 - (y - 3.5) * 0.0055 : 0.083 - (y - 5.5) * 0.00524) + 0.0012;
    if (o.paint === 'white') M.add('black', sleeve(rAt(yc - 0.88), rAt(yc - 0.7), yc - 0.88, yc - 0.7, 16));
    M.add('galv', rod([-0.42, yc, 0], [0.42, yc, 0], 0.022, 6));
    M.add('whitePaint', rbox(0.34, 0.55, 0.26, 0.015, 0, yc + 0.45, rr + 0.12));   // the cameras' white housing above them
    for (const sx of [-0.42, 0.42]) {
      M.add('whitePaint', cyl(0.06, 0.07, 0.14, seg(q, 12, 6), yc - 0.16).translate(sx, 0, 0));
      M.add('pedDark', lathe([[0.075, yc - 0.16], [0.07, yc - 0.21], [0.045, yc - 0.25], [0.001, yc - 0.26]], seg(q, 12, 6)).translate(sx, 0, 0));
    }
  }
  // the bracket arm: a clamp sleeve, then the upswept tube to the head's tenon
  const out = LAMP.armOut, y0 = 7.35;
  M.add(pm, cyl(0.092, 0.084, 0.42, s, y0 - 0.1));
  const path = [V(0, y0, 0.0), V(0, y0 + 0.55, 0.12), V(0, y0 + 1.1, 0.55), V(0, y0 + 1.5, 1.25), V(0, y0 + 1.68, 2.0), V(0, y0 + 1.74, out)];
  M.add(pm, tube(path, (t) => 0.052 - 0.016 * t, seg(q, 36, 10), seg(q, 12, 6)));
  M.add('galv', cyl(0.032, 0.032, 0.18, 10, 0).rotateX(Math.PI / 2).translate(0, y0 + 1.74, out + 0.06));
  // the head at the arm's end, facing down the road (+z), 4 deg up
  const hd = luminaire(q);
  const Mh = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationX(-0.07)).premultiply(new THREE.Matrix4().makeTranslation(0, y0 + 1.72, out + 0.1));
  for (const [k, L] of hd.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
  // the banner arms (toward the road) and the banner
  if (o.banner !== false && o.banner !== undefined) {
    bannerArm(M, 6.5, 0.9, q);
    bannerArm(M, 4.5, 0.9, q);
    const b = banner(o.banner, 4.5, 6.5, q);
    for (const [k, L] of b.parts) M.add(k, ...L.map((g) => g.clone()));
  }
  return M;
}

// ---------------------------------------------------------------- traffic signals (NYC: a galvanised mast pole, a
// straight upswept mast arm, 12-inch three-section heads in yellow housings with tunnel visors; the pedestrian heads
// with the hand / person and the countdown; the street name blades on the arm)
export const SIG = { armY: 6.05, rise: 0.2 };   // the arm's rise per metre
function sigHead(M, q, lensKeys) {
  // a three-section head, 0.36 x 1.07 x 0.26 m, origin at its centre; lenses face +z
  const w = 0.36, h = 1.07, d = 0.26;
  M.add('yellowSig', rbox(w, h, d, 0.03, 0, 0, 0, seg(q, 2, 1)));
  // no backplate: NYC's heads hang bare
  for (let i = 0; i < 3; i++) {
    const y = (1 - i) * 0.345;
    M.add(lensKeys[i], disc(0.145, seg(q, 20, 8)).translate(0, y, d / 2 + 0.004));
    // the tunnel visor: a 240 degree shell over the lens (open below), 0.2 m deep, with a dark inside
    const vo = new THREE.CylinderGeometry(0.168, 0.168, 0.2, seg(q, 20, 8), 1, true, Math.PI / 3, (Math.PI * 4) / 3);
    vo.rotateX(Math.PI / 2); vo.translate(0, y, d / 2 + 0.1);
    const vi = new THREE.CylinderGeometry(0.158, 0.158, 0.2, seg(q, 20, 8), 1, true, Math.PI / 3, (Math.PI * 4) / 3);
    vi.rotateX(Math.PI / 2); vi.translate(0, y, d / 2 + 0.1);
    // flip the inner shell so it faces the lens
    const ip = vi.getAttribute('position'), ii = vi.index;
    const ni = []; for (let t = 0; t < ii.count; t += 3) ni.push(ii.getX(t), ii.getX(t + 2), ii.getX(t + 1));
    vi.setIndex(ni); vi.computeVertexNormals(); void ip;
    M.add('yellowSig', vo.toNonIndexed());
    M.add('sigBlack', vi.toNonIndexed());
    // the rim: a thin ring where the visor meets the housing
    if (q) M.add('yellowSig', new THREE.TorusGeometry(0.163, 0.006, 5, 20, (Math.PI * 4) / 3).rotateZ(Math.PI / 3 + Math.PI / 2 - Math.PI / 3 * 0).translate(0, y, d / 2 + 0.2).toNonIndexed());
  }
}
export function signalHead(q = 1, grp = 'ew') {
  const M = new Model();
  sigHead(M, q, ['lensR_' + grp, 'lensA_' + grp, 'lensG_' + grp]);
  // the hanger: a clamp and a 50 mm pipe up to the arm
  M.add('galv', rod([0, 0.53, -0.02], [0, 0.78, -0.02], 0.028, 8));
  return M;
}
// a horizontal three-section head hung under a viaduct's girder (QA Q15: two over E 125th St from the Park Avenue
// viaduct's west girder, red on the left as seen by the traffic): p.top the girder's underside over the ground, faces +z
export function girderHead(q = 1, p = {}) {
  const M = new Model(), top = p.top ?? 4.35, hd = signalHead(q, p.grp || 'ew'), yc = top - 0.36;
  const Mh = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, yc, 0));
  for (const [k, L] of hd.parts) for (const g of L) if (k !== 'galv') M.add(k, g.clone().applyMatrix4(Mh));
  // two hangers from the bottom flange (a clamp plate, a 50 mm pipe) to the housing's top
  for (const x of [-0.3, 0.3]) {
    M.add('galv', rod([x, yc + 0.17, -0.02], [x, top, -0.02], 0.026, 8));
    M.add('galv', rbox(0.16, 0.02, 0.16, 0.005, x, top - 0.01, -0.02));
  }
  return M;
}
// a regulation plate (pkSigns MUT p.f) hung from two rods under a girder or deck: p.top the underside, p.drop the rods'
// length; faces +z, a dull aluminium back
export function hangSign(q = 1, p = {}) {
  const M = new Model(), [w, h] = mutSize(p.f || 'noLeft'), top = p.top ?? 4.35, yc = top - (p.drop ?? 0.2) - h / 2;
  M.add('aluBack', rbox(w, h, 0.005, 0.006, 0, yc, -0.0025));
  M.add('face:mut' + (p.f || 'noLeft'), plane(w - 0.006, h - 0.006).translate(0, yc, 0.0012));
  for (const x of [-w * 0.3, w * 0.3]) M.add('galv', rod([x, yc + h / 2 - 0.03, -0.02], [x, top, -0.02], 0.01, 5));
  return M;
}
// a plate on its own pole (QA Q15: BUS CORRIDOR PHOTO ENFORCED at Park Avenue's NW corner): p.f, p.y its centre, p.H
export function poleSign(q = 1, p = {}) {
  const M = new Model(), [w, h] = mutSize(p.f || 'busCam'), yc = p.y ?? 4.5, H = p.H ?? Math.max(yc + h / 2 + 0.3, 3);
  M.add('galv', lathe([[0.001, 0], [0.075, 0], [0.075, 0.05], [0.05, 0.12], [0.045, H], [0.001, H + 0.03]], seg(q, 12, 6)));
  if (q) M.add('face:poleTags' + ((p.wear || 1) % 4), sleeve(0.0485, 0.0475, 0.9, 2.1, 12));
  M.add('aluBack', rbox(w, h, 0.005, 0.006, 0, yc, 0.07));
  M.add('face:mut' + (p.f || 'busCam'), plane(w - 0.006, h - 0.006).translate(0, yc, 0.0738));
  if (q) for (const dy of [h * 0.3, -h * 0.3]) M.add('galvDark', cyl(0.05, 0.05, 0.03, 10, yc + dy - 0.015, true));
  return M;
}
export function pedHead(q = 1, grp = 'ew') {
  // 0.46 x 0.48 x 0.2 m, black; the face: the hand / person (left) and the countdown (right); faces +z
  const M = new Model();
  // NYC's pedestrian heads are school-bus yellow, the face dark
  M.add('yellowSig', rbox(0.46, 0.48, 0.2, 0.02, 0, 0, 0));
  M.add('pedDark', plane(0.4, 0.4).translate(0, 0, 0.101));
  // the symbols in the near model only (a few pixels at most beyond the 110 m LOD radius; six keys in every far cell)
  if (q) {
    M.add('pedHand_' + grp, plane(0.17, 0.3).translate(-0.1, 0, 0.103));
    M.add('pedMan_' + grp, plane(0.17, 0.3).translate(-0.1, 0, 0.1035));
    M.add('pedCount_' + grp, plane(0.17, 0.26).translate(0.1, 0, 0.103));
  }
  if (q) {
    // the hood: a top and two sides
    M.add('yellowSig', box(0.47, 0.012, 0.16, 0, 0.24, 0.18));
    M.add('yellowSig', box(0.012, 0.48, 0.16, -0.235, 0, 0.18));
    M.add('yellowSig', box(0.012, 0.48, 0.16, 0.235, 0, 0.18));
  }
  return M;
}
// a street name blade (face:sign<k>, 1.83 x 0.3 m on a 1.9 m blank, both faces), centred on its origin, long side on x
export function nameBlade(k, w = 1.3, h = 0.3) {
  const M = new Model();
  M.add('aluBack', rbox(w, h, 0.012, 0.01, 0, 0, 0));
  for (const s of [1, -1]) {
    const g = plane(w - 0.02, h - 0.02);
    if (s < 0) g.rotateY(Math.PI);
    g.translate(0, 0, s * 0.0075);
    M.add('face:sign' + k, g);
  }
  return M;
}
// the mast pole: arm toward +z (over the road), reach in metres; heads: [{ at: metres along the arm, grp }]; pole heads
// [{ y, yaw, grp }]; peds: [{ y, yaw, grp }]; blades: [{ k, at }]; lampOn: a street light bracket at the pole top
export function signalMast(q = 1, o = {}) {
  const M = new Model();
  // o.postH: a pedestrian post (a slim pole of that height, no arm); o.rise: the arm's rise per metre (125th Street's
  // masts sweep up about 0.3); o.ext: the pole carried that far above its top, with two tie rods to the arm
  const s = seg(q, 20, 8), reach = o.reach ?? 7.5, slim = !!o.postH, H = o.postH || o.poleH || 7.1, rise = o.rise ?? SIG.rise;
  const rP = slim ? 0.062 : (o.poleR || 0.124), wear = Math.abs([...String(o.key || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 4;
  if (slim) {
    M.add('galv', lathe([[0.001, 0], [0.11, 0], [0.11, 0.05], [0.085, 0.09], [0.075, 0.35], [0.068, H], [0.03, H + 0.03], [0.001, H + 0.05]], s));
    if (q) {
      M.add('face:poleTags' + wear, sleeve(0.0775, 0.0745, 0.9, 2.1, 14));
      M.add('face:poleGrime', sleeve(0.0885, 0.0785, 0.06, 0.36, 14));
    }
  } else if (o.poleR) {
    // a slim mast pole on a square
    // cast base (o.base 'square': 0.37 m, 0.5 m tall), a ball finial over the cross bar
    const r = o.poleR, bH = o.base === 'square' ? 0.5 : 0.12;
    if (o.base === 'square') {
      M.add('galv', rbox(0.37, bH - 0.06, 0.37, 0.02, 0, (bH - 0.06) / 2, 0));
      M.add('galv', rbox(0.3, 0.06, 0.3, 0.012, 0, bH - 0.03, 0));
      if (q) M.add('galvDark', rbox(0.2, 0.26, 0.012, 0.004, 0, 0.22, 0.186));
    } else M.add('galv', lathe([[0.001, 0], [r + 0.06, 0], [r + 0.06, 0.06], [r + 0.02, bH]], s));
    M.add('galv', lathe([[0.001, bH], [r * 1.06, bH], [r, 2.5], [r * 0.9, H], [r * 0.55, H + 0.04], [0.001, H + 0.06]], s));
    M.add('galv', lathe([[0.001, H + 0.05], [0.03, H + 0.07], [0.045, H + 0.12], [0.03, H + 0.17], [0.001, H + 0.19]], seg(q, 10, 6)));
    if (q) {
      M.add('face:poleTags' + wear, sleeve(r + 0.0035, r + 0.002, 0.9, 2.1, 14));
      M.add('face:poleGrime', sleeve(r + 0.006, r + 0.004, bH, bH + 0.3, 14));
    }
  } else {
    M.add('galv', rbox(0.5, 0.04, 0.5, 0.012, 0, 0.02, 0));
    if (q) for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) M.add('galv', lathe([[0.001, 0.04], [0.03, 0.04], [0.03, 0.09], [0.02, 0.105], [0.001, 0.11]], 6).translate(x, 0, z));
    M.add('galv', lathe([[0.001, 0.04], [0.2, 0.04], [0.2, 0.12], [0.175, 0.16], [0.165, 0.6], [0.17, 0.64], [0.155, 0.68]], s));
    M.add('galv', lathe(o.ext ? [[0.152, 0.66], [0.146, 2.5], [0.132, 5.0], [0.124, H], [0.09, H + 0.06], [0.08, H + o.ext], [0.04, H + o.ext + 0.04], [0.001, H + o.ext + 0.07]]
      : [[0.152, 0.66], [0.146, 2.5], [0.132, 5.0], [0.124, H], [0.07, H + 0.04], [0.001, H + 0.08]], s));
    if (q) M.add('galvDark', rbox(0.13, 0.3, 0.02, 0.01, 0, 0.9, -0.16));
    if (q) {
      // the street's wear on the pole: stickers, flyers and tags at hand height, grime and rust spatter over the base
      M.add('face:poleTags' + wear, sleeve(0.1535, 0.1495, 0.9, 2.2, 16));
      M.add('face:poleGrime', sleeve(0.204, 0.204, 0.04, 0.12, 16), sleeve(0.18, 0.17, 0.12, 0.62, 16));
    }
  }
  // the arm: a bolted clamp plate, a tapered tube rising `rise` per metre, from o.armY (default SIG.armY)
  const y0 = o.armY ?? SIG.armY;
  // the arm sweeps up steeply off the pole and flattens toward the tip: height over its base at t
  // metres out, a quadratic through (0, 0), (0.45, 0.7) and (1, 1) of the full rise, level at the tip
  // (o.bow: how much of the rise comes early; 1.01 the default sweep, about 0.45 for the straighter Lenox NE arm, b4r4)
  const bow = o.bow ?? 1.01;
  const armAt = (t) => { const u = Math.max(0, Math.min(1, t / Math.max(reach, 1e-3))); return y0 + reach * rise * ((1 + bow) * u - bow * u * u); };
  const tip = [0, armAt(reach), reach];
  if (reach > 0.5) {
    // a slim mast (o.poleR) carries a slimmer arm on a smaller clamp (acpE / acpNEz: the arm ~0.1 m at the pole, a collar)
    const ka = o.poleR ? Math.max(0.5, Math.min(1, o.poleR / 0.15)) : 1;
    M.add('galv', rbox(0.34 * ka, 0.5 * ka, 0.06, 0.012, 0, y0, 0.15 * ka));
    M.add('galv', tube([V(0, y0, 0.12 * ka), ...[0.22, 0.42, 0.62, 0.82, 1].map((f) => V(0, armAt(reach * f), reach * f))], (t) => (0.1 - 0.045 * t) * ka, seg(q, 14, 6), seg(q, 14, 6)));
    M.add('galv', lathe([[0.001, -0.005], [0.058, 0], [0.058, 0.02], [0.001, 0.03]], 10).rotateX(Math.PI / 2).translate(...tip));
    if (o.ext || o.ties) {
      // the tie rods from the pole's top to the arm
      // the cross bar on the pole's top, along the arm, and a rod from each of its ends
      const top = H + (o.ext || 0) - 0.12;
      M.add('galv', rod([0, top + 0.04, -0.45], [0, top + 0.04, 0.45], 0.03, 6));
      if (q) for (const sz of [-0.45, 0.45]) M.add('galv', cyl(0.036, 0.036, 0.05, 8, top + 0.015).translate(0, 0, sz));
      M.add('galvDark', rod([0, top + 0.04, 0.45], [0, armAt(reach * 0.45) + 0.05, reach * 0.45], 0.009, 5));
      M.add('galvDark', rod([0, top + 0.04, -0.45], [0, armAt(reach * 0.85) + 0.05, reach * 0.85], 0.009, 5));
    }
  }
  // heads hung from the arm
  for (const h of o.heads || []) {
    const t = Math.min(reach, h.at), yA = armAt(t);
    // h.s: an 8 in head (ACP NE's tip head, acpNEz)
    const hd = signalHead(q, h.grp || 'ew'), hs = h.s || 1;
    const Mh = new THREE.Matrix4().makeScale(hs, hs, hs).premultiply(new THREE.Matrix4().makeRotationY(h.yaw ?? 0)).premultiply(new THREE.Matrix4().makeTranslation(0, yA - 0.84 * hs, t));
    for (const [k, L] of hd.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
  }
  for (const h of o.poleHeads || []) {
    // h.s: a smaller head (0.7 = the 8 in heads some corners carry on the pole, acpE)
    const hd = signalHead(q, h.grp || 'ew'), hs = h.s || 1;
    const off = 0.34 * hs;
    const Mh = new THREE.Matrix4().makeScale(hs, hs, hs).premultiply(new THREE.Matrix4().makeTranslation(0, 0, off)).premultiply(new THREE.Matrix4().makeRotationY(h.yaw ?? 0)).premultiply(new THREE.Matrix4().makeTranslation(0, h.y ?? 3.6, 0));
    for (const [k, L] of hd.parts) for (const g of L) if (k !== 'galv') M.add(k, g.clone().applyMatrix4(Mh));
    M.add('galv', rod([Math.sin(h.yaw ?? 0) * 0.12, (h.y ?? 3.6) + 0.3, Math.cos(h.yaw ?? 0) * 0.12], [Math.sin(h.yaw ?? 0) * 0.3, (h.y ?? 3.6) + 0.3, Math.cos(h.yaw ?? 0) * 0.3], 0.025, 6));
    M.add('galv', rod([Math.sin(h.yaw ?? 0) * 0.12, (h.y ?? 3.6) - 0.3, Math.cos(h.yaw ?? 0) * 0.12], [Math.sin(h.yaw ?? 0) * 0.3, (h.y ?? 3.6) - 0.3, Math.cos(h.yaw ?? 0) * 0.3], 0.025, 6));
  }
  for (const p of o.peds || []) {
    const hd = pedHead(q, p.grp || 'ew');
    const Mh = new THREE.Matrix4().makeTranslation(0, 0, rP + 0.18).premultiply(new THREE.Matrix4().makeRotationY(p.yaw ?? 0)).premultiply(new THREE.Matrix4().makeTranslation(0, p.y ?? 2.75, 0));
    for (const [k, L] of hd.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
    // two yellow bracket arms, above and below the head's centre
    for (const dy of [0.17, -0.17]) M.add('yellowSig', rod([Math.sin(p.yaw ?? 0) * (rP + 0.005), (p.y ?? 2.75) + dy, Math.cos(p.yaw ?? 0) * (rP + 0.005)], [Math.sin(p.yaw ?? 0) * (rP + 0.09), (p.y ?? 2.75) + dy, Math.cos(p.yaw ?? 0) * (rP + 0.09)], 0.022, 6));
  }
  for (const b of o.blades || []) {
    const t = b.at, yA = armAt(t) + 0.34;
    const nb = nameBlade(b.k);
    const Mh = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, yA, t));
    for (const [k, L] of nb.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
    M.add('galv', rod([0, yA - 0.34, t - 0.5], [0, yA - 0.15, t - 0.5], 0.012, 6));
    M.add('galv', rod([0, yA - 0.34, t + 0.5], [0, yA - 0.15, t + 0.5], 0.012, 6));
  }
  // the street name blades on the pole (both faces; yaw: the side it is read from), clamped on a short bracket
  for (const b of o.poleBlades || []) {
    // b.dx: the blade hung off-centre along its length (ACP NE: the African Sq blade reaches east of the pole)
    const nb = nameBlade(b.k, b.w || 1.22, 0.3);
    const Mh = new THREE.Matrix4().makeTranslation(b.dx || 0, 0, rP + 0.03).premultiply(new THREE.Matrix4().makeRotationY(b.yaw ?? 0)).premultiply(new THREE.Matrix4().makeTranslation(0, b.y ?? 4.4, 0));
    for (const [k, L] of nb.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
  }
  // the regulation signs (pkSigns.js MUT): on the arm (at: metres out, hung under it on two straps) or on the pole (y:
  // its centre's height, clamped on two bands), each facing its own yaw, the traffic it governs
  for (const sg of o.signs || []) {
    const [w, h] = mutSize(sg.f), yaw = sg.yaw ?? 0, P = new Model();
    P.add('aluBack', rbox(w, h, 0.005, 0.006, 0, 0, -0.0025));
    P.add('face:mut' + sg.f, plane(w - 0.006, h - 0.006).translate(0, 0, 0.0012));
    let Mh;
    if (sg.at !== undefined) {
      // hung from a short horizontal channel under the arm
      const t = Math.min(reach - 0.3, sg.at), yA = armAt(t), yc = yA - 0.1 - (sg.drop || 0) - h / 2;
      Mh = new THREE.Matrix4().makeRotationY(yaw).premultiply(new THREE.Matrix4().makeTranslation(0, yc, t));
      for (const dx of [-w * 0.3, w * 0.3]) {
        const a = new THREE.Vector3(dx, h / 2 - 0.02, -0.02).applyMatrix4(Mh);
        M.add('galv', rod([a.x, a.y, a.z], [a.x, yA - 0.03, a.z], 0.009, 5));
      }
      if (sg.drop) {
        const a = new THREE.Vector3(-w * 0.5 - 0.06, h / 2 + 0.04, -0.03).applyMatrix4(Mh), b = new THREE.Vector3(w * 0.5 + 0.06, h / 2 + 0.04, -0.03).applyMatrix4(Mh);
        M.add('galv', rod([a.x, a.y, a.z], [b.x, b.y, b.z], 0.016, 5));
      }
    } else {
      const yy = sg.y ?? 3.0, rr = yy > H ? 0.085 : rP + 0.012;
      Mh = new THREE.Matrix4().makeTranslation(0, 0, rr + 0.01).premultiply(new THREE.Matrix4().makeRotationY(yaw)).premultiply(new THREE.Matrix4().makeTranslation(0, yy, 0));
      if (q) for (const dy of [h * 0.3, -h * 0.3]) M.add('galvDark', cyl(rr + 0.004, rr + 0.004, 0.03, 12, yy + dy - 0.015, true));
    }
    for (const [k, L] of P.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
  }
  // a traffic camera: the gooseneck at the arm's tip and the dome
  if (o.cctv && reach > 1) {
    // the gooseneck rises about 0.95 m over the tip and the dome hangs just under its end (the levelled lenoxMast zoom)
    const ty = armAt(reach), gh = o.cctvH ?? 0.95, dy = gh - 0.13;
    M.add('galv', tube([V(0, ty, reach - 0.2), V(0, ty + gh * 0.72, reach - 0.1), V(0, ty + gh, reach + 0.25), V(0, ty + dy, reach + 0.42)], 0.03, seg(q, 12, 5), seg(q, 8, 5)));
    M.add('whitePaint', lathe([[0.001, ty + dy], [0.09, ty + dy - 0.02], [0.1, ty + dy - 0.12], [0.09, ty + dy - 0.16]], seg(q, 14, 7)).translate(0, 0, reach + 0.42));
    M.add('pedDark', lathe([[0.088, ty + dy - 0.16], [0.08, ty + dy - 0.22], [0.05, ty + dy - 0.26], [0.001, ty + dy - 0.27]], seg(q, 14, 7)).translate(0, 0, reach + 0.42));
  }
  if (o.lamp) {
    // a street light bracket on the pole top (the combination pole), over the road
    const out = 2.4, ly = H - 0.3;
    M.add('galv', tube([V(0, ly, 0), V(0, ly + 0.6, 0.25), V(0, ly + 1.05, 0.95), V(0, ly + 1.25, 1.8), V(0, ly + 1.3, out)], (t) => 0.05 - 0.014 * t, seg(q, 28, 8), seg(q, 12, 6)));
    const hd = luminaire(q);
    const Mh = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationX(-0.07)).premultiply(new THREE.Matrix4().makeTranslation(0, ly + 1.28, out + 0.1));
    for (const [k, L] of hd.parts) for (const g of L) M.add(k, g.clone().applyMatrix4(Mh));
  }
  return M;
}

// ---------------------------------------------------------------- litter: the BID's solar compactor (a 0.64 x 0.66 x
// 1.27 m cabinet, a pull-down hopper on the street face, the solar panel on the sloped roof) and the DSNY wire basket
export function compactor(q = 1) {
  const M = new Model();
  M.add('bbGreen', rbox(0.64, 1.02, 0.64, 0.035, 0, 0.53, 0, seg(q, 3, 1)));
  M.add('rubber', rbox(0.62, 0.04, 0.62, 0.01, 0, 0.02, 0));
  // the roof: sloped toward the front, the panel inset
  const roof = extrude([[-0.33, 0], [0.33, 0], [0.33, 0.16], [-0.33, 0.3]], 0.66, 0.012);
  roof.rotateY(Math.PI / 2); roof.translate(0, 1.03, 0);
  M.add('bbGreen', roof);
  const pnl = plane(0.56, 0.62); pnl.rotateX(-Math.PI / 2 + Math.atan2(0.14, 0.66)); pnl.translate(0, 1.265, 0.0);
  M.add('solar', pnl);
  // the hopper door: a recessed panel, a handle, the slot
  M.add('bbGreen', rbox(0.5, 0.42, 0.03, 0.02, 0, 0.8, 0.325));
  M.add('sigBlack', rbox(0.44, 0.1, 0.02, 0.01, 0, 0.92, 0.34));
  M.add('stainless', rbox(0.3, 0.035, 0.05, 0.012, 0, 0.66, 0.35));
  // a label panel lower down (the BID's decal)
  M.add('face:bb', plane(0.46, 0.36).translate(0, 0.34, 0.321));
  if (q) M.add('bbGreen', rbox(0.66, 0.06, 0.66, 0.012, 0, 1.04, 0));
  return M;
}
export function wireBasket(q = 1, p = {}) {
  // the DSNY basket: 0.58 m across the rim, 0.8 m tall, tapered; wire mesh (rings and staves), a solid base band
  const M = new Model();
  const H = 0.78, rT = 0.29, rB = 0.235;
  const nR = seg(q, 7, 3), nS = seg(q, 22, 10);
  for (let i = 0; i <= nR; i++) {
    const t = i / nR, y = 0.08 + t * (H - 0.08), r = rB + (rT - rB) * t;
    M.add('greenSub', new THREE.TorusGeometry(r, i === nR ? 0.012 : 0.005, 4, seg(q, 24, 10)).rotateX(Math.PI / 2).translate(0, y, 0).toNonIndexed());
  }
  for (let k = 0; k < nS; k++) {
    const a = (k / nS) * Math.PI * 2;
    M.add('greenSub', rod([Math.sin(a) * rB, 0.08, Math.cos(a) * rB], [Math.sin(a) * rT, H, Math.cos(a) * rT], 0.004, 3));
  }
  M.add('greenSub', cyl(rB + 0.004, rB + 0.004, 0.1, seg(q, 20, 8), 0, true));
  M.add('greenSub', cyl(rB - 0.01, rB - 0.01, 0.01, seg(q, 20, 8), 0.02, false));
  if (q) {
    // the liner bag's rim showing, and some litter inside
    M.add('plastic', cyl(rT - 0.02, rB - 0.02, 0.05, 16, H - 0.1, true));
    M.add('trash', lathe([[0.001, 0.12], [0.16, 0.13], [0.2, 0.2], [0.17, 0.3], [0.001, 0.32]], 9));
  }
  return M;
}

// ---------------------------------------------------------------- LinkNYC (the kiosk: 2.9 m, 0.88 x 0.3 m, a 55-inch
// portrait screen both faces, the tablet and the phone jacks on the side) and Link5G (the 9.75 m pole)
export function linkKiosk(q = 1, k = 0) {
  const M = new Model();
  const W = 0.88, D = 0.3, H = 2.9;
  // the plinth, the stainless frame (two side rails, the cap), the grey body between them
  M.add('stainless', rbox(W + 0.04, 0.12, D + 0.04, 0.02, 0, 0.06, 0));
  M.add('aluDark', rbox(W - 0.08, H - 0.2, D - 0.02, 0.02, 0, 0.12 + (H - 0.2) / 2, 0));
  for (const s of [-1, 1]) M.add('aluDark', rbox(0.07, H - 0.12, D, 0.03, s * (W / 2 - 0.035), 0.12 + (H - 0.12) / 2, 0));
  M.add('aluDark', rbox(W, 0.1, D, 0.04, 0, H - 0.05, 0));
  // the screens (face:link<k>a front, b back), set in with a black bezel
  for (const s of [1, -1]) {
    M.add('sigBlack', rbox(0.74, 1.3, 0.01, 0.01, 0, 1.62, s * (D / 2 - 0.004)));
    const g = plane(0.69, 1.22);
    if (s < 0) g.rotateY(Math.PI);
    g.translate(0, 1.62, s * (D / 2 + 0.002));
    M.add('screen:link' + k + (s > 0 ? 'a' : 'b'), g);
    // the LINK mark panel at the top and the grille at the foot
    M.add('face:linkTop', plane(0.5, 0.12).rotateY(s < 0 ? Math.PI : 0).translate(0, 2.56, s * (D / 2 + 0.002)));
    if (q) for (let r = 0; r < 6; r++) M.add('sigBlack', box(0.6, 0.012, 0.01, 0, 0.3 + r * 0.05, s * (D / 2 - 0.002)));
  }
  // the tablet on the street-side edge (+x), the emergency button
  M.add('sigBlack', rbox(0.02, 0.3, 0.2, 0.008, W / 2 + 0.002, 1.25, 0));
  M.add('screen:tablet', plane(0.18, 0.26).rotateY(Math.PI / 2).translate(W / 2 + 0.014, 1.25, 0));
  if (q) M.add('redPaint', cyl(0.018, 0.018, 0.012, 12, 0).rotateZ(Math.PI / 2).translate(W / 2 + 0.01, 1.02, 0));
  return M;
}
export function link5g(q = 1, k = 0) {
  const M = new Model();
  const s = seg(q, 16, 8);
  // the base cabinet with the screens (1.0 x 0.5 m, 2.7 m), then the tapered pole to 9.75 m with the radio shroud
  M.add('whitePaint', rbox(0.62, 2.7, 0.62, 0.05, 0, 1.35, 0, seg(q, 3, 1)));
  M.add('stainless', rbox(0.66, 0.1, 0.66, 0.02, 0, 0.05, 0));
  for (const r of [0, 1, 2, 3]) {
    if (r % 2) continue;
    const a = r * Math.PI / 2;
    const g = plane(0.5, 1.2); g.rotateY(a); g.translate(Math.sin(a) * 0.312, 1.55, Math.cos(a) * 0.312);
    M.add('screen:link' + k + (r ? 'b' : 'a'), g);
  }
  M.add('whitePaint', lathe([[0.25, 2.7], [0.2, 3.1], [0.17, 5.5], [0.2, 6.2], [0.2, 9.0], [0.17, 9.6], [0.001, 9.75]], s));
  if (q) for (let k2 = 0; k2 < 6; k2++) M.add('greyPaint', box(0.41, 0.012, 0.41, 0, 6.3 + k2 * 0.45, 0));
  return M;
}
