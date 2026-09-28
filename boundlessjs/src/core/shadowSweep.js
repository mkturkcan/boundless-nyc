// SV29 (owner 2026-09-27: "Improve game performance without sacrificing visual quality"): shadow casters whose shadow
// cannot reach the picture. The near cascade draws every caster in its box round the camera (+-150-700 m), and at street
// level most of them stand behind or beside the view. A caster's shadow lies inside the capsule its bounding sphere
// sweeps down the sun's rays to the lowest ground (SWEEP.gy); when that capsule is wholly outside one plane of the view
// frustum, or of a sphere of SWEEP.near metres round the camera (what the reflection probes nearby still see: the fleet's
// clear coats mirror the street BEHIND the lens), the caster is left out of the shadow pass. The instancer, the fleet
// and the crowd ask sweepOut() for their near-cascade shadow sets; the frames that feed the engine's light probe keep
// every caster. On by default since the A/B (docs/notes/ad-video.md, SV29: frozen frames bit-identical at three views,
// instanced / vehicle / walker shadow casters down 43-90 %, +1-7 % fps over DC29 alone); `?sv29=0` turns it off.
import * as THREE from 'three';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const SV29 = { on: Q.get('sv29') !== '0' };
// A/B inside one page (perf probes): window.__SV29(true | false)
if (typeof window !== 'undefined') window.__SV29 = (on) => { SV29.on = !!on; return SV29.on; };
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(), _v = new THREE.Vector3();
export const SWEEP = { ok: false, pl: new Float32Array(24), dx: 0, dy: -1, dz: 0, gy: -30, cx: 0, cy: 0, cz: 0, near: 45, frame: -1, out: 0, kept: 0 };

// once per frame, before the systems cull: the view planes, the direction the shadows run, the camera
export function sweepFrame(engine) {
  const S = SWEEP;
  S.ok = false;
  if (!SV29.on || !engine || !engine.camera) return;
  const sun = engine.sun;
  if (!sun || !sun.castShadow) return;
  // the light probe re-captures from the last frame's shadow map at frames % 150 == 40 (% 24 == 12 while it warms up):
  // the frames before and at a capture draw every caster, so the ambient it measures is the one it always measured
  const f = engine.frames | 0, warm = (engine._probeWarm ?? 9) < 5;
  const p = warm ? 24 : 150, at = warm ? 12 : 40, m = ((f % p) + p) % p;
  if (m === at || m === (at + p - 1) % p || engine._probeBusy) return;   // ...and every frame of a capture (PS29: a face a frame)
  const cam = engine.camera;
  cam.updateMatrixWorld();
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_pv);
  for (let i = 0; i < 6; i++) {
    const q = _fr.planes[i];
    S.pl[i * 4] = q.normal.x; S.pl[i * 4 + 1] = q.normal.y; S.pl[i * 4 + 2] = q.normal.z; S.pl[i * 4 + 3] = q.constant;
  }
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  _v.subVectors(sun.target.position, sun.position).normalize();   // the way the shadows run (down)
  if (_v.y > -0.02) return;                                        // a sun at the horizon: everything shadows everything
  S.dx = _v.x; S.dy = _v.y; S.dz = _v.z;
  S.cx = cam.position.x; S.cy = cam.position.y; S.cz = cam.position.z;
  S.gy = Math.min(-30, cam.position.y - 120);
  S.ok = true; S.frame = f;
}

// true when the sphere (x, y, z, r), swept down the shadow direction to height SWEEP.gy, cannot darken anything in view
export function sweepOut(x, y, z, r) {
  const S = SWEEP;
  if (!S.ok) return false;
  const T = Math.max(0, y + r - S.gy) / -S.dy;
  const ex = x + S.dx * T, ey = y + S.dy * T, ez = z + S.dz * T;
  // the near sphere: the capsule's closest point to the camera
  {
    const sx = ex - x, sy = ey - y, sz = ez - z, L2 = sx * sx + sy * sy + sz * sz;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((S.cx - x) * sx + (S.cy - y) * sy + (S.cz - z) * sz) / L2)) : 0;
    const qx = x + sx * t - S.cx, qy = y + sy * t - S.cy, qz = z + sz * t - S.cz, rr = S.near + r;
    if (qx * qx + qy * qy + qz * qz < rr * rr) { S.kept++; return false; }
  }
  const P = S.pl;
  for (let q = 0; q < 24; q += 4) {
    if (P[q] * x + P[q + 1] * y + P[q + 2] * z + P[q + 3] < -r && P[q] * ex + P[q + 1] * ey + P[q + 2] * ez + P[q + 3] < -r) { S.out++; return true; }
  }
  S.kept++;
  return false;
}
