import * as THREE from 'three';
import { derpDrawing, faceFor, HEAD_BOX, type HatId, type HeadShape } from '@/game/derps';
import type { Mood } from '@/game3d/sim';
import { InkMesh } from '@/game3d/ink';

// A derp's head: the hand-scrawled drawing from derps.ts as a paper cut-out
// on the 3D body. The card always turns to face the camera (about the head's
// own up axis, so it still tilts and nods with the rig) and mirrors so the
// face looks the way the archer faces on screen — the 2D videos' look on a
// 3D figure, from any angle. One draw call; redrawn a dozen times a second
// for the boiling line, and at once when the expression changes.

export const DERP_SCALE = 0.3; // metres per head unit (big heads, like the videos)
// The pea is drawn small (it's a pea); on a body it needs a little help.
const SHAPE_SCALE: Record<HeadShape, number> = { bean: 1, pea: 1.45, slab: 1 };
const BOIL_HZ = 12;
const LIFT = 0.3; // metres the card sits toward the camera

const _cam = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class DerpHead {
  // Pivot at the neck, in the rig's head frame (+x the way he faces, +y up).
  readonly group = new THREE.Group();
  private ink = new InkMesh();
  private card: THREE.Mesh;
  private shape: HeadShape = 'bean';
  private hat: HatId = 'none';
  private seed = 0;
  private size = DERP_SCALE;
  private flip = 1;
  private boil = -1;
  private key = '';
  private white = new THREE.Color('#FFFFFF');
  private hurt = new THREE.Color('#FF9A9A');

  constructor() {
    this.card = this.ink.mesh;
    this.card.scale.setScalar(DERP_SCALE);
    this.group.add(this.card);
    // Face the camera at draw time, whatever the rig did this frame.
    this.card.onBeforeRender = (_r, _s, camera) => this.faceCamera(camera);
  }

  set(shape: HeadShape, hat: HatId, seed: number) {
    if (shape === this.shape && hat === this.hat && seed === this.seed) return;
    this.shape = shape;
    this.hat = hat;
    this.seed = seed;
    this.size = DERP_SCALE * SHAPE_SCALE[shape];
    this.key = '';
  }

  // Sphere the hands keep out of, in group space.
  get clearance() {
    const b = HEAD_BOX[this.shape];
    const k = this.size;
    const r = Math.max((b.maxX - b.minX) / 2, b.maxY / 2) * k * 0.75;
    return { center: new THREE.Vector3(((b.maxX + b.minX) / 2) * k, (b.maxY / 2) * k, 0), radius: r };
  }

  update(mood: Mood, t: number, flash: number) {
    const boil = Math.floor(t * BOIL_HZ);
    const key = `${mood}|${this.shape}|${this.hat}`;
    if (boil !== this.boil || key !== this.key) {
      this.boil = boil;
      this.key = key;
      this.ink.draw(derpDrawing(this.shape, this.hat, faceFor(mood), t, this.seed), boil + this.seed * 31);
    }
    this.ink.material.color.copy(this.white).lerp(this.hurt, Math.min(1, flash));
  }

  dispose() {
    this.ink.dispose();
  }

  private faceCamera(camera: THREE.Camera) {
    const g = this.group;
    // Camera in the head's frame: turn about local up to face it.
    _cam.setFromMatrixPosition(camera.matrixWorld);
    _inv.copy(g.matrixWorld).invert();
    _cam.applyMatrix4(_inv);
    const yaw = Math.atan2(_cam.x, _cam.z);
    // Which way he faces on screen: his +x against the camera's right.
    _fwd.set(1, 0, 0).transformDirection(g.matrixWorld);
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    const d = _fwd.dot(_right);
    if (Math.abs(d) > 0.2) this.flip = d > 0 ? 1 : -1;
    const c = this.card;
    // Step out toward the camera, in front of his own arms and bow: the head
    // is drawn on top, as in the videos.
    c.position.set(Math.sin(yaw) * LIFT, 0, Math.cos(yaw) * LIFT);
    c.rotation.set(0, yaw, 0);
    c.scale.set(this.size * this.flip, this.size, this.size);
    c.updateMatrix();
    c.matrixWorld.multiplyMatrices(g.matrixWorld, c.matrix);
  }
}
