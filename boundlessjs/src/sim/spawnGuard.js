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
