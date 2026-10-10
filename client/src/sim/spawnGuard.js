// SPAWN GUARD (film recordings, 2026-09-23). While ON, traffic and walkers may not spawn inside the camera's view: a take
// shows no car or person popping into existence. The recorder turns it ON for the capture and OFF for the warm-up, when
// spawning in view is exactly what fills the shot (window.__SPAWNGUARD(on) in main.js). Off by default, so interactive
// sessions keep their near-camera spawning.
//
// The test is the view frustum widened by an angular margin (the sphere radius grows with distance), so a spawn just
// outside the frame cannot slide into it a moment later as the camera pans.
import * as THREE from 'three';

const fr = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), cam = new THREE.Vector3();

export const spawnGuard = {
  on: false,
  // call once per frame after the camera moved
  update(camera) {
    if (!this.on) return;
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    fr.setFromProjectionMatrix(pv);
    cam.copy(camera.position);
  },
  // is (x, y, z) — an object of radius r — in view (or within ~9 degrees of the frame edge)?
  inView(x, y, z, r = 1) {
    if (!this.on) return false;
    sph.center.set(x, y, z);
    sph.radius = r + 0.16 * Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    return fr.intersectsSphere(sph);
  },
};

// OV32 (sim/traffic.js): the same widened view, kept every frame whether or not a take is being recorded, for the one rule
// that behaves differently out of sight: two cars held in each other's way for 6 s pass the old way (through each other)
// only where no camera sees them, so a jam off screen dissolves and nothing on screen ever clips.
const fr2 = new THREE.Frustum(), pv2 = new THREE.Matrix4(), sph2 = new THREE.Sphere(), cam2 = new THREE.Vector3();
export const viewGuard = {
  ok: false,
  update(camera) {
    camera.updateMatrixWorld();
    pv2.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    fr2.setFromProjectionMatrix(pv2);
    cam2.copy(camera.position);
    this.ok = true;
  },
  // could the camera see an object of radius r at (x, y, z) (within ~9 degrees of the frame edge, or within 60 m)?
  seen(x, y, z, r = 3) {
    if (!this.ok) return true;
    const d = Math.hypot(x - cam2.x, y - cam2.y, z - cam2.z);
    if (d < 60) return true;
    sph2.center.set(x, y, z);
    sph2.radius = r + 0.16 * d;
    return fr2.intersectsSphere(sph2);
  },
};
