import * as THREE from 'three';

// The archer's body from the Unity Asset Store "Free Pack - Stick Man"
// (PolyOne Studio): its skinned mesh, skeleton and Walk clip, exported from
// Unity to assets/licensed/stickman/stickman.json (gitignored — the Asset Store
// EULA allows shipping it in the app, not publishing it in the repo; see
// docs/ASSETS.md). When that file is absent the bundler hands us an empty
// module and the rig keeps its own capsule body.
//
// The rig (Stickman3D.ts) still decides every pose: each frame it reports its
// hips, spine, shoulders, elbows, hands and feet, and this class bends the
// asset's skeleton to match with two-bone IK at the asset's own bone lengths.
// Limb twist is anchored to the joint's hinge axis (elbows bend back, knees
// forward), calibrated once against the bind pose, so a limb never flips
// about its own axis however far it folds. Relaxed hands hang at the asset's shoulder width, and no hand is let
// inside the head. The rig then hangs the bow and string on `grip()`.

export type StickmanData = {
  bones: { name: string; parent: number; p: number[]; q: number[] }[];
  inverses: number[][];
  position: number[];
  normal: number[];
  skinIndex: number[];
  skinWeight: number[];
  index: number[];
  clips: Record<string, { fps: number; length: number; frames: number[][] }>;
};

// Metro resolves this to an empty module when the licensed file is missing.
const mod = require('../../assets/licensed/stickman/stickman.json');
export const STICKMAN_DATA: StickmanData | null = mod && Array.isArray(mod.bones) ? (mod as StickmanData) : null;

// Joint targets in the rig root's space (+x = facing, +y = up, +z = the
// archer's front side, toward the camera), refreshed by the rig every frame.
export type BodyTargets = {
  hips: THREE.Matrix4; // hip joint and orientation (facing, yaw, death tumble)
  spine: THREE.Vector3; // unit direction up the spine
  legs: { ankle: THREE.Vector3 }[]; // [front, back]
  // [bow, draw]: the rig's own shoulder, elbow and hand. `spread` 0..1 moves
  // the hand from the given plane out to the asset's own shoulder plane;
  // `hang` 0..1 lets a resting hand drop to the arm's natural length.
  arms: { shoulder: THREE.Vector3; elbow: THREE.Vector3; hand: THREE.Vector3; spread: number; hang: number }[];
  head: THREE.Vector3; // keep hands out of this sphere
  headR: number;
  walk: number; // 0..1 how much of the Walk clip drives the legs
  walkPhase: number; // walk cycles, any real number (distance / WALK_STRIDE keeps feet planted)
};

// The model faces +z; the rig faces +x.
const FACE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const ONE = new THREE.Vector3(1, 1, 1);
const TINY = new THREE.Vector3(1e-3, 1e-3, 1e-3);
const BEHIND = new THREE.Vector3(-1, 0, 0);
const AHEAD = new THREE.Vector3(1, 0, 0);
const GRIP = 0.05; // palm centre, past the wrist along the hand
// Ground covered by one cycle of the asset's Walk clip (each foot sweeps
// 0.74 m while planted for ~60% of the 1.02 s cycle). Advancing the clip by
// distance / WALK_STRIDE keeps the feet from sliding.
export const WALK_STRIDE = 1.23;

type Limb = {
  upper: number;
  lower: number;
  end: number;
  a: number; // upper length
  b: number; // lower length
  side: 1 | -1; // +z = front
  offUpper: THREE.Quaternion; // hinge frame → bone, from the bind pose
  offLower: THREE.Quaternion;
  pole: THREE.Vector3; // which way the middle joint should stick out
  bend: THREE.Vector3; // last good bend direction (kept when the limb is straight)
  hinge: THREE.Vector3; // joint axis this frame
  base: THREE.Vector3; // where the limb starts this frame (a shoulder may shrug)
  goal: THREE.Vector3; // this frame's hand target after spread/hang/head
  wrist: THREE.Vector3; // this frame's IK end point
  elbow: THREE.Vector3;
};

const _r = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

// Rotation whose +y is `dir` and whose +z is the hinge axis.
function hingeFrame(dir: THREE.Vector3, hinge: THREE.Vector3, out: THREE.Quaternion) {
  _y.copy(dir).normalize();
  _z.copy(hinge).addScaledVector(_y, -hinge.dot(_y));
  if (_z.lengthSq() < 1e-10) _z.set(_y.y, -_y.x, 0); // any perpendicular
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
const MAX_SHRUG = 0.08; // a shoulder may rise this far toward an out-of-reach hand

export class StickmanBody {
  readonly group = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private bones: THREE.Bone[];
  private parent: number[];
  private restP: THREE.Vector3[];
  private restQ: THREE.Quaternion[];
  private world: THREE.Matrix4[];
  private root: number;
  private spine: number;
  private head: number;
  private legs: Limb[]; // [front, back]
  private arms: Limb[]; // [bow, draw]
  private limbs: Limb[]; // legs then arms
  private walkFrames: number[][] | null;
  private walkBones: Set<number>;

  constructor(data: StickmanData, material: THREE.Material) {
    this.parent = data.bones.map((b) => b.parent);
    this.restP = data.bones.map((b) => new THREE.Vector3().fromArray(b.p));
    this.restQ = data.bones.map((b) => new THREE.Quaternion().fromArray(b.q));
    this.world = data.bones.map(() => new THREE.Matrix4());
    this.bones = data.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      return bone;
    });
    this.bones.forEach((bone, i) => {
      bone.position.copy(this.restP[i]);
      bone.quaternion.copy(this.restQ[i]);
      const p = this.parent[i];
      (p < 0 ? this.group : this.bones[p]).add(bone);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(data.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.skinWeight, 4));
    geo.setIndex(data.index);
    const inverses = data.inverses.map((m) => new THREE.Matrix4().fromArray(m));
    this.mesh = new THREE.SkinnedMesh(geo, material);
    this.mesh.frustumCulled = false; // it tumbles far from its bind-pose bounds
    this.group.add(this.mesh);
    this.mesh.bind(new THREE.Skeleton(this.bones, inverses), new THREE.Matrix4());

    // Bind-pose world matrices, turned to face +x.
    const restW = data.bones.map(() => new THREE.Matrix4());
    restW.forEach((m, i) => {
      m.compose(this.restP[i], this.restQ[i], ONE);
      if (this.parent[i] >= 0) m.premultiply(restW[this.parent[i]]);
      else m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(FACE));
    });
    const id = (name: string) => {
      const i = data.bones.findIndex((b) => b.name === name);
      if (i < 0) throw new Error(`stickman.json: no bone ${name}`);
      return i;
    };
    const at = (i: number) => new THREE.Vector3().setFromMatrixPosition(restW[i]);
    const limb = (side: 1 | -1, prefix: string, upper: string, lower: string, end: string, pole: THREE.Vector3): Limb => {
      const u = id(prefix + upper);
      const l = id(prefix + lower);
      const e = id(prefix + end);
      // Offset mapping "+y along the bone, +z along the hinge" onto the
      // bone's real axes, measured in the (straight-limbed) bind pose.
      const hinge = at(e).sub(at(u)).normalize().cross(pole).normalize();
      const off = (i: number, child: number) =>
        hingeFrame(at(child).sub(at(i)), hinge, new THREE.Quaternion())
          .clone()
          .invert()
          .multiply(new THREE.Quaternion().setFromRotationMatrix(restW[i]));
      return {
        upper: u,
        lower: l,
        end: e,
        a: this.restP[l].length(),
        b: this.restP[e].length(),
        side,
        offUpper: off(u, l),
        offLower: off(l, e),
        pole: pole.clone(),
        bend: pole.clone(),
        hinge: hinge.clone(),
        base: new THREE.Vector3(),
        goal: new THREE.Vector3(),
        wrist: new THREE.Vector3(),
        elbow: new THREE.Vector3(),
      };
    };
    this.root = id('Root');
    this.spine = id('Spine');
    this.head = id('Head');
    // Front = the side nearer the camera (+z) once turned to face +x.
    const [f, b] = at(id('RightUpLeg')).z > 0 ? ['Right', 'Left'] : ['Left', 'Right'];
    this.legs = [limb(1, f, 'UpLeg', 'Leg', 'Foot', AHEAD), limb(-1, b, 'UpLeg', 'Leg', 'Foot', AHEAD)];
    this.arms = [limb(1, f, 'Arm', 'ForeArm', 'Hand', BEHIND), limb(-1, b, 'Arm', 'ForeArm', 'Hand', BEHIND)];
    this.limbs = [...this.legs, ...this.arms];
    this.walkFrames = data.clips.walk?.frames ?? null;
    this.walkBones = new Set(this.legs.flatMap((l) => [l.upper, l.lower, l.end]));
  }

  // Palm centre of arm k (0 = bow, 1 = draw) in rig-root space, after update().
  grip(k: number, out: THREE.Vector3) {
    const w = this.world[this.arms[k].end];
    return out.setFromMatrixPosition(w).addScaledVector(_v.setFromMatrixColumn(w, 1).normalize(), GRIP);
  }

  update(t: BodyTargets) {
    const W = this.world;
    // Walk clip sample between its two nearest frames (the clip's last frame
    // repeats its first, so the loop is seamless).
    const walk = this.walkFrames && t.walk > 0.001 ? this.walkFrames : null;
    let f0: number[] | null = null;
    let f1: number[] | null = null;
    let fk = 0;
    if (walk) {
      const x = (((t.walkPhase % 1) + 1) % 1) * (walk.length - 1);
      const i0 = Math.floor(x);
      f0 = walk[i0];
      f1 = walk[Math.min(walk.length - 1, i0 + 1)];
      fk = x - i0;
    }
    for (let i = 0; i < this.bones.length; i++) {
      const p = this.parent[i];
      const bone = this.bones[i];
      const parentW = p < 0 ? null : W[p];
      // Rest placement under the (already posed) parent.
      _r.compose(this.restP[i], this.restQ[i], i === this.head ? TINY : ONE);
      if (parentW) _r.premultiply(parentW);
      W[i].copy(_r);
      if (i === this.root) {
        _q.setFromRotationMatrix(t.hips).multiply(FACE).multiply(this.restQ[i]);
        W[i].compose(_p.setFromMatrixPosition(t.hips), _q, ONE);
      } else if (i === this.spine) {
        // Minimal turn of the spine onto the rig's (always near-upright) spine.
        _y.setFromMatrixColumn(_r, 1).normalize();
        _q.setFromRotationMatrix(_r).premultiply(_q2.setFromUnitVectors(_y, _v.copy(t.spine).normalize()));
        W[i].compose(_p.setFromMatrixPosition(_r), _q, ONE);
      } else {
        for (let k = 0; k < 4; k++) {
          const l = this.limbs[k];
          if (i === l.upper) {
            if (k < 2) this.solveLeg(l, _r, t.legs[k].ankle, t.hips);
            else this.solveArm(l, _r, t.arms[k - 2], t.head, t.headR);
            this.place(l, l.offUpper, l.base, l.elbow, W[i]);
          } else if (i === l.lower) this.place(l, l.offLower, l.elbow, l.wrist, W[i]);
        }
      }
      // Local transform for three.js, optionally blended toward the Walk clip.
      if (parentW) _r.copy(_inv.copy(parentW).invert()).multiply(W[i]);
      else _r.copy(W[i]);
      _r.decompose(bone.position, bone.quaternion, bone.scale);
      if (f0 && f1 && this.walkBones.has(i)) {
        _q2.fromArray(f0, 3 + i * 4).slerp(_q.fromArray(f1, 3 + i * 4), fk);
        bone.quaternion.slerp(_q2, t.walk);
        W[i].compose(bone.position, bone.quaternion, bone.scale);
        if (parentW) W[i].premultiply(parentW);
      }
    }
  }

  // Bone from `from` to `to`, twisted so its hinge matches the limb's.
  private place(l: Limb, off: THREE.Quaternion, from: THREE.Vector3, to: THREE.Vector3, out: THREE.Matrix4) {
    hingeFrame(_d.subVectors(to, from), l.hinge, _q).multiply(off);
    out.compose(_t.copy(from), _q, ONE);
  }

  // Knees bend forward; ankles keep the asset's hip width.
  private solveLeg(l: Limb, rest: THREE.Matrix4, ankle: THREE.Vector3, hips: THREE.Matrix4) {
    const s = _p.setFromMatrixPosition(rest);
    _z.setFromMatrixColumn(hips, 2).normalize();
    _v.copy(ankle).addScaledVector(_z, _t.subVectors(s, ankle).dot(_z));
    l.pole.setFromMatrixColumn(hips, 0).normalize();
    this.twoBone(l, s, _v);
  }

  // Elbows bend the way the rig's own arm does; relaxed hands hang beside the
  // body; no hand inside the head.
  private solveArm(l: Limb, rest: THREE.Matrix4, arm: BodyTargets['arms'][number], head: THREE.Vector3, headR: number) {
    const s = _p.setFromMatrixPosition(rest);
    _v.copy(arm.hand);
    _v.z += (s.z + l.side * 0.04 - _v.z) * arm.spread;
    // A resting arm hangs nearly straight (the rig's own arm is shorter).
    if (arm.hang > 0) {
      _t.subVectors(_v, s);
      const len = _t.length();
      const want = 0.9 * (l.a + l.b);
      if (len > 1e-4 && len < want) _v.addScaledVector(_t, ((want - len) / len) * arm.hang);
    }
    // Out of the head, toward this hand's own side (the aim plane's side
    // while aiming) and forward, so a raised hand goes up beside the face,
    // not over or behind the head.
    // The side bias grows from zero at the head's surface: no jump on entry.
    _t.subVectors(_v, head);
    const dh = _t.length();
    if (dh < headR) {
      const side = l.side * arm.spread + (1 - arm.spread);
      if (dh > 1e-4) _t.divideScalar(dh);
      else _t.set(0, 0, 0);
      // Gains under 1 so the push never moves the hand faster than its target.
      const depth = 1 - dh / headR;
      _t.z += side * 0.7 * depth;
      _t.x += 0.4 * depth; // and forward, where the camera sees it
      _v.copy(head).addScaledVector(_t.normalize(), headR);
    }
    // Bend side from the rig's elbow relative to its shoulder→hand line.
    _d.subVectors(arm.hand, arm.shoulder);
    _t.subVectors(arm.elbow, arm.shoulder);
    if (_d.lengthSq() > 1e-8) _t.addScaledVector(_d, -_t.dot(_d) / _d.lengthSq());
    if (_t.lengthSq() > 1e-6) l.pole.copy(_t).normalize();
    l.goal.copy(_v);
    this.twoBone(l, s, _v, MAX_SHRUG);
  }

  private twoBone(l: Limb, s: THREE.Vector3, end: THREE.Vector3, shrug = 0) {
    const { a, b } = l;
    l.base.copy(s);
    _d.subVectors(end, s);
    if (_d.lengthSq() < 1e-10) _d.copy(l.bend);
    let len = _d.length();
    _d.normalize();
    // An out-of-reach hand lifts the shoulder a little toward it.
    const over = Math.min(shrug, len - (a + b - 1e-4));
    if (over > 0) {
      l.base.addScaledVector(_d, over);
      len -= over;
    }
    const dist = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-3, len));
    // Bend side: the pole, made perpendicular; if the pole lines up with the
    // limb, keep last frame's bend so the joint never flips.
    _t.copy(l.pole).addScaledVector(_d, -l.pole.dot(_d));
    if (_t.lengthSq() < 0.04 * l.pole.lengthSq()) _t.copy(l.bend).addScaledVector(_d, -l.bend.dot(_d));
    if (_t.lengthSq() < 1e-8) _t.set(_d.y, -_d.x, 0);
    _t.normalize();
    l.bend.copy(_t);
    l.hinge.crossVectors(_d, _t).normalize();
    const x = (a * a - b * b + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    l.elbow.copy(l.base).addScaledVector(_d, x).addScaledVector(_t, h);
    l.wrist.copy(l.base).addScaledVector(_d, dist);
  }
}
