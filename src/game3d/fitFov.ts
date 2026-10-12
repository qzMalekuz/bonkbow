import * as THREE from 'three';

// three.js holds the vertical field of view, so on a screen boxier than the
// phones the shots were framed on (16:9, foldables, 4:3 tablets) the sides
// get cropped: archers slide under the HUD and the menu archer behind the
// menu. Below DESIGN_ASPECT, widen the vertical FOV so the horizontal view
// stays what a 2:1 phone sees; the extra room goes to sky and ground. Wider
// screens (20:9, 21:9) keep `baseFov` and simply see more to the sides.
export const DESIGN_ASPECT = 2;

export function fitFov(camera: THREE.Camera, baseFov: number) {
  const cam = camera as THREE.PerspectiveCamera;
  if (!cam.isPerspectiveCamera) return;
  const fov =
    cam.aspect >= DESIGN_ASPECT
      ? baseFov
      : THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * DESIGN_ASPECT) / cam.aspect));
  if (Math.abs(cam.fov - fov) < 1e-3) return;
  cam.fov = fov;
  cam.updateProjectionMatrix();
}
