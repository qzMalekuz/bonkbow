import * as THREE from 'three';
import { ARM_REACH, ARROW_LEN, BODY, HIP_Y } from '@/game3d/world';
import type { Death } from '@/game3d/sim';
import type { Skin } from '@/game/skins';

// Procedural 3D stickman: matte-black capsule limbs and a big head, built
// from three.js primitives. Skins add glossy cosmetics on top (hat, bow,
// quiver, scarf, glowing eyes) — the body itself is always black, like the
// reference game. The rig is driven imperatively every frame (no React
// re-render): `update()` takes the sim's pose and places every bone.
//
// Local frame: +x = the way the archer faces, +y = up, +z = toward camera.
// The root flips with `rotation.y = π` for an archer facing left.

export type RigPose = {
  x: number;
  y: number; // feet
  facing: 1 | -1;
  angle: number; // world aim, y-up
  draw: number; // 0..1
  flash: number;
  flinch: number;
  death: Death | null;
  drop: number;
  showNocked: boolean;
};

const BODY_BLACK = '#101012';
const YAW = 0.42; // turn the body toward the camera for a 3/4 view
const STRING_REST = 0.14;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

// Capsule lying along +x from the origin, total length `len`.
function boneGeo(len: number, r: number) {
  return cached(`bone:${len.toFixed(3)}:${r}`, () => {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 8);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    return g;
  });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

function glossy(color: string, opts: { metal?: number; rough?: number; glow?: number } = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: opts.rough ?? 0.32,
    metalness: opts.metal ?? 0.15,
    emissive: opts.glow ? c : new THREE.Color(0x000000),
    emissiveIntensity: opts.glow ?? 0,
  });
}

// An arrow whose TIP is at the local origin, pointing along +x.
export function makeArrow(fletch: string, shaft = '#D9C39A') {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: shaft, roughness: 0.6 });
  const s = mesh(
    cached('arrowShaft', () => {
      const c = new THREE.CylinderGeometry(0.012, 0.012, ARROW_LEN - 0.08, 5);
      c.rotateZ(Math.PI / 2);
      c.translate(-(ARROW_LEN - 0.08) / 2 - 0.08, 0, 0);
      return c;
    }),
    shaftMat,
  );
  const head = mesh(
    cached('arrowHead', () => {
      const c = new THREE.ConeGeometry(0.035, 0.1, 5);
      c.rotateZ(-Math.PI / 2);
      c.translate(-0.05, 0, 0);
      return c;
    }),
    new THREE.MeshStandardMaterial({ color: '#C8CCD2', roughness: 0.25, metalness: 0.8 }),
  );
  const fl = new THREE.MeshStandardMaterial({ color: fletch, roughness: 0.5, side: THREE.DoubleSide });
  const vane = cached('arrowVane', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.16, 0);
    shape.lineTo(0.2, 0.05);
    shape.lineTo(0.03, 0.05);
    const v = new THREE.ShapeGeometry(shape);
    v.translate(-ARROW_LEN, 0, 0);
    return v;
  });
  const v1 = mesh(vane, fl, false);
  const v2 = mesh(vane, fl, false);
  v2.rotation.x = Math.PI;
  const v3 = mesh(vane, fl, false);
  v3.rotation.x = Math.PI / 2;
  g.add(s, head, v1, v2, v3);
  return g;
}

export class StickmanRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // pivot at the hip; tumbles on death
  private hips = new THREE.Group(); // yawed toward camera
  private torso = new THREE.Group(); // +x along the spine
  private head = new THREE.Group(); // upright frame at the head centre
  private arms = new THREE.Group(); // not yawed: arms aim in the duel plane
  private thighF = new THREE.Group();
  private shinF = new THREE.Group();
  private thighB = new THREE.Group();
  private shinB = new THREE.Group();
  private upperBow = new THREE.Object3D();
  private foreBow = new THREE.Object3D();
  private upperDraw = new THREE.Object3D();
  private foreDraw = new THREE.Object3D();
  private bow = new THREE.Group();
  private stringGeo = new THREE.BufferGeometry();
  private nocked: THREE.Group;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private cosmetics = new THREE.Group();
  private flutter: THREE.Object3D[] = [];
  private skinId = '';
  // Arrows stuck in this body are parented here so they tumble with it.
  readonly stuckMount = new THREE.Group();

  constructor(skin: Skin) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: BODY_BLACK, roughness: 0.55, metalness: 0.05 });
    this.headMat = new THREE.MeshStandardMaterial({ color: BODY_BLACK, roughness: 0.3, metalness: 0.1 });

    const { thigh, shin, torso, neck, headR, upperArm, foreArm, limbR, torsoR } = BODY;

    this.root.add(this.body);
    this.body.position.y = HIP_Y;
    this.body.add(this.hips, this.arms, this.stuckMount);
    this.stuckMount.position.y = -HIP_Y; // stuck offsets are from the feet

    // Legs
    for (const [th, sh, z] of [
      [this.thighF, this.shinF, 0.07],
      [this.thighB, this.shinB, -0.07],
    ] as const) {
      th.position.z = z;
      th.add(mesh(boneGeo(thigh, limbR), this.bodyMat));
      sh.position.x = thigh;
      sh.add(mesh(boneGeo(shin + 0.02, limbR), this.bodyMat));
      th.add(sh);
      this.hips.add(th);
    }

    // Torso, neck, head
    this.torso.add(mesh(boneGeo(torso + neck, torsoR), this.bodyMat));
    this.hips.add(this.torso);
    this.head.position.x = torso + neck + headR * 0.92;
    this.head.rotation.z = -Math.PI / 2;
    const skull = mesh(cached('head', () => new THREE.SphereGeometry(headR, 20, 16)), this.headMat);
    this.head.add(skull, this.cosmetics);
    this.torso.add(this.head);

    // Arms (2D-placed segments in the arms group)
    const armSeg = (len: number) => mesh(boneGeo(len, limbR * 0.95), this.bodyMat);
    this.upperBow.add(armSeg(upperArm));
    this.foreBow.add(armSeg(foreArm));
    this.upperDraw.add(armSeg(upperArm));
    this.foreDraw.add(armSeg(foreArm));
    this.upperBow.position.z = 0.06;
    this.foreBow.position.z = 0.06;
    this.upperDraw.position.z = -0.06;
    this.foreDraw.position.z = -0.06;
    this.arms.add(this.upperBow, this.foreBow, this.upperDraw, this.foreDraw, this.bow);
    this.bow.position.z = 0.06;

    // Bowstring (tip → nock → tip)
    this.stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const str = new THREE.Line(this.stringGeo, new THREE.LineBasicMaterial({ color: '#F2F2F2', transparent: true, opacity: 0.9 }));
    str.frustumCulled = false;
    str.position.z = 0.06;
    this.arms.add(str);

    this.nocked = makeArrow(skin.trail);
    this.nocked.position.z = 0.06;
    this.arms.add(this.nocked);

    this.setSkin(skin);
  }

  setSkin(skin: Skin) {
    if (skin.id === this.skinId) return;
    this.skinId = skin.id;
    this.cosmetics.clear();
    this.flutter = [];
    // Bow: an arc bulging toward the target, tips back toward the archer.
    this.bow.clear();
    const R = 0.55;
    const half = 0.72;
    const limbGeo = cached('bowArc', () => {
      const g = new THREE.TorusGeometry(R, 0.022, 6, 24, half * 2);
      g.rotateZ(-half);
      g.translate(-R, 0, 0);
      return g;
    });
    const bowMat = glossy(skin.bow, { rough: 0.35, metal: skin.id === 'royal' ? 0.8 : 0.1 });
    this.bow.add(mesh(limbGeo, bowMat));
    const grip = mesh(cached('bowGrip', () => new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8)), glossy(skin.accent));
    this.bow.add(grip);
    // Tip caps in the accent colour
    for (const s of [1, -1]) {
      const cap = mesh(cached('bowCap', () => new THREE.SphereGeometry(0.035, 8, 6)), glossy(skin.accent, { glow: skin.eyes ? 0.6 : 0 }));
      cap.position.set(-R + R * Math.cos(half), s * R * Math.sin(half), 0);
      this.bow.add(cap);
    }

    // Quiver on the back
    const quiver = new THREE.Group();
    const q = mesh(cached('quiver', () => new THREE.CylinderGeometry(0.075, 0.06, 0.5, 10)), glossy(skin.color, { rough: 0.5 }));
    quiver.add(q);
    for (let i = 0; i < 3; i++) {
      const f = mesh(cached('qfl', () => new THREE.ConeGeometry(0.03, 0.12, 4)), glossy(skin.trail, { rough: 0.6 }), false);
      f.position.set((i - 1) * 0.035, 0.3, (i % 2) * 0.02);
      quiver.add(f);
    }
    this.torso.children.filter((c) => c.userData.quiver).forEach((c) => this.torso.remove(c));
    quiver.userData.quiver = true;
    // Torso space: +x runs up the spine, +y points behind the archer.
    quiver.rotation.set(0, 0, -Math.PI / 2 - 0.35);
    quiver.position.set(BODY.torso * 0.62, 0.09, 0);
    this.torso.add(quiver);

    const hr = BODY.headR;
    const acc = glossy(skin.accent);
    switch (skin.hat) {
      case 'cap': {
        const dome = mesh(new THREE.SphereGeometry(hr * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), acc);
        dome.position.y = hr * 0.12;
        const brim = mesh(new THREE.CylinderGeometry(hr * 0.75, hr * 0.75, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), glossy(skin.color));
        brim.position.set(-hr * 0.7, hr * 0.2, 0);
        this.cosmetics.add(dome, brim);
        break;
      }
      case 'crown': {
        const gold = glossy(skin.accent, { metal: 0.9, rough: 0.2, glow: 0.12 });
        const band = mesh(new THREE.CylinderGeometry(hr * 0.8, hr * 0.85, 0.1, 14, 1, true), gold);
        band.position.y = hr * 0.95;
        this.cosmetics.add(band);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const spike = mesh(new THREE.ConeGeometry(0.035, 0.12, 4), gold);
          spike.position.set(Math.cos(a) * hr * 0.8, hr * 0.95 + 0.1, Math.sin(a) * hr * 0.8);
          const gem = mesh(new THREE.SphereGeometry(0.02, 6, 4), glossy('#9D0208', { glow: 0.5 }), false);
          gem.position.set(Math.cos(a) * hr * 0.85, hr * 0.95, Math.sin(a) * hr * 0.85);
          this.cosmetics.add(spike, gem);
        }
        break;
      }
      case 'horns': {
        for (const s of [1, -1]) {
          const horn = mesh(new THREE.ConeGeometry(0.05, 0.26, 8), glossy(skin.accent, { rough: 0.25 }));
          horn.position.set(0.02, hr * 0.85, s * hr * 0.6);
          horn.rotation.set(s * 0.5, 0, -0.35);
          this.cosmetics.add(horn);
        }
        break;
      }
      case 'halo': {
        const halo = mesh(new THREE.TorusGeometry(hr * 0.85, 0.022, 8, 28), glossy(skin.accent, { glow: 1.6 }), false);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = hr * 1.6;
        halo.userData.bob = true;
        this.flutter.push(halo);
        // Small wings
        for (const s of [1, -1]) {
          const wing = mesh(new THREE.SphereGeometry(0.16, 10, 8), glossy('#FFFFFF', { rough: 0.6, glow: 0.25 }));
          wing.scale.set(0.35, 1, 0.12);
          wing.position.set(-0.05, -BODY.torso * 0.45, s * 0.14);
          wing.rotation.set(s * 0.6, 0, 0.5);
          wing.userData.wing = s;
          this.flutter.push(wing);
          this.cosmetics.add(wing);
        }
        this.cosmetics.add(halo);
        break;
      }
      case 'hood': {
        const hood = mesh(new THREE.SphereGeometry(hr * 1.14, 16, 12, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.62), acc);
        hood.rotation.y = Math.PI;
        const peak = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), acc);
        peak.position.set(-hr * 0.9, hr * 0.55, 0);
        peak.rotation.z = 1.2;
        this.cosmetics.add(hood, peak);
        break;
      }
      case 'visor': {
        const visor = mesh(
          new THREE.CylinderGeometry(hr * 1.04, hr * 1.04, 0.075, 18, 1, true, -Math.PI * 0.4, Math.PI * 0.8),
          glossy(skin.accent, { glow: 1.4, rough: 0.1 }),
          false,
        );
        visor.rotation.y = Math.PI / 2;
        visor.position.y = hr * 0.18;
        const band = mesh(new THREE.TorusGeometry(hr * 1.02, 0.018, 6, 24), glossy('#1B2B34', { metal: 0.6 }));
        band.rotation.x = Math.PI / 2;
        band.position.y = hr * 0.18;
        this.cosmetics.add(visor, band);
        break;
      }
      case 'bandana': {
        const band = mesh(new THREE.TorusGeometry(hr * 0.98, 0.035, 8, 24), acc);
        band.rotation.x = Math.PI / 2;
        band.position.y = hr * 0.35;
        this.cosmetics.add(band);
        for (const s of [1, -1]) {
          const tail = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.015), acc);
          tail.geometry.translate(-0.1, 0, 0);
          tail.position.set(-hr * 0.95, hr * 0.3, s * 0.03);
          tail.userData.tail = s;
          this.flutter.push(tail);
          this.cosmetics.add(tail);
        }
        break;
      }
      default:
        break;
    }

    if (skin.eyes) {
      for (const s of [1, -1]) {
        const eye = mesh(new THREE.SphereGeometry(0.028, 8, 6), glossy(skin.eyes, { glow: 2.2 }), false);
        eye.scale.set(0.6, 1, 1);
        eye.position.set(hr * 0.9, hr * 0.12, s * hr * 0.35);
        this.cosmetics.add(eye);
      }
    }

    if (skin.scarf) {
      const scarfMat = glossy(skin.scarf, { rough: 0.7 });
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.035, 8, 16), scarfMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -hr - 0.02;
      this.cosmetics.add(ring);
      const tail = mesh(new THREE.BoxGeometry(0.3, 0.07, 0.02), scarfMat);
      tail.geometry.translate(-0.15, 0, 0);
      tail.position.set(-0.05, -hr - 0.04, 0);
      tail.userData.tail = 1;
      tail.userData.long = true;
      this.flutter.push(tail);
      this.cosmetics.add(tail);
    }

    // Nocked arrow takes the trail colour for its fletching
    this.arms.remove(this.nocked);
    this.nocked = makeArrow(skin.trail);
    this.nocked.position.z = 0.06;
    this.arms.add(this.nocked);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  // Place every bone for this frame. `t` = time (s) for idle motion.
  update(p: RigPose, t: number) {
    const f = p.facing;
    const d = p.death;
    this.root.rotation.y = f === 1 ? 0 : Math.PI;
    const limp = d ? Math.min(1, d.t * 3) : 0;

    // Root / tumble
    if (d) {
      this.root.position.set(d.x, d.y - (HIP_Y - 0.1) * Math.abs(Math.sin(d.rot)) * (d.landed ? 1 : 0.4), 0);
      // World spin d.rot, expressed in the (possibly flipped) root frame.
      this.body.rotation.z = d.rot * f;
    } else {
      this.root.position.set(p.x, p.y + p.drop, 0);
      this.body.rotation.z = 0;
    }

    // Hit flash
    const fl = p.flash;
    this.bodyMat.emissive.setScalar(fl * 0.9);
    this.headMat.emissive.setScalar(fl * 0.9);

    // Legs: planted stance, loose flail while dead
    const flail = (k: number) => (d && !d.landed ? Math.sin(d.t * 14 + k) * 0.9 : 0);
    const splay = d && d.landed ? 0.5 : 0;
    this.hips.rotation.y = -YAW * (1 - limp);
    this.thighF.rotation.z = -Math.PI / 2 + 0.3 + flail(0) * limp + splay;
    this.shinF.rotation.z = -0.12 + Math.abs(flail(1)) * 0.5 * limp;
    this.thighB.rotation.z = -Math.PI / 2 - 0.26 + flail(2) * limp - splay;
    this.shinB.rotation.z = -0.28 + Math.abs(flail(3)) * 0.5 * limp;

    // Torso lean: breathe, lean back into the draw, recoil on hit
    const breathe = d ? 0 : Math.sin(t * 2.1) * 0.025;
    const lean = p.draw * 0.12 + p.flinch * 0.45 + breathe + flail(4) * 0.3 * limp;
    this.torso.rotation.z = Math.PI / 2 + lean;
    this.head.rotation.z = -Math.PI / 2 - lean * 0.3 + (d ? 0 : Math.sin(t * 1.3) * 0.03);

    // Shoulder point in body space (hip = origin), after lean & yaw
    const spine = BODY.torso;
    const sx = Math.cos(Math.PI / 2 + lean) * spine * Math.cos(this.hips.rotation.y);
    const sy = Math.sin(Math.PI / 2 + lean) * spine;

    // Aim angle in the archer's local frame
    let a = f === 1 ? p.angle : Math.PI - p.angle;
    if (d) a = -1.2 + flail(5) * 0.6;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const hx = sx + cosA * ARM_REACH;
    const hy = sy + sinA * ARM_REACH;

    // Bow arm: straight line shoulder → hand
    place(this.upperBow, sx, sy, a);
    place(this.foreBow, sx + cosA * BODY.upperArm, sy + sinA * BODY.upperArm, a - 0.04);

    // Bow at the hand, perpendicular to the aim
    this.bow.position.set(hx, hy, 0.06);
    this.bow.rotation.z = a;
    this.bow.visible = true;

    // String hand (nock): rests at the string, pulls back to the anchor
    const pull = STRING_REST + p.draw * 0.62;
    const lift = p.draw * 0.06;
    const nx = hx - cosA * pull - sinA * lift;
    const ny = hy - sinA * pull + cosA * lift;

    // Draw arm: two-bone IK shoulder → nock. Elbow hangs low at rest and
    // swings up behind the shoulder at full draw.
    ik(this.upperDraw, this.foreDraw, sx, sy, d ? hx - 0.2 : nx, d ? hy - 0.4 : ny, BODY.upperArm, BODY.foreArm, -1);

    // Bowstring through the nock
    const R = 0.55;
    const half = 0.72;
    const tipBack = -R + R * Math.cos(half);
    const tipUp = R * Math.sin(half);
    const pos = this.stringGeo.getAttribute('position') as THREE.BufferAttribute;
    const tx = (lx: number, ly: number) => hx + lx * cosA - ly * sinA;
    const ty = (lx: number, ly: number) => hy + lx * sinA + ly * cosA;
    const drawn = p.draw > 0.01 && !d;
    pos.setXYZ(0, tx(tipBack, tipUp), ty(tipBack, tipUp), 0);
    pos.setXYZ(1, drawn ? nx : tx(tipBack, 0), drawn ? ny : ty(tipBack, 0), 0);
    pos.setXYZ(2, tx(tipBack, -tipUp), ty(tipBack, -tipUp), 0);
    pos.needsUpdate = true;

    // Nocked arrow sits on the string
    this.nocked.visible = p.showNocked && !d;
    this.nocked.position.set(nx + cosA * ARROW_LEN, ny + sinA * ARROW_LEN, 0.06);
    this.nocked.rotation.z = a;

    // Cosmetic flutter
    for (const o of this.flutter) {
      if (o.userData.bob) o.position.y = BODY.headR * 1.6 + Math.sin(t * 2.4) * 0.02;
      if (o.userData.tail) {
        const amp = o.userData.long ? 0.35 : 0.25;
        o.rotation.z = 0.6 + Math.sin(t * 7 + o.userData.tail) * amp;
        o.rotation.y = Math.sin(t * 5.3 + o.userData.tail * 2) * 0.3;
      }
      if (o.userData.wing) o.rotation.x = o.userData.wing * (0.6 + Math.sin(t * 3) * 0.2);
    }
  }
}

// Point `o` (a +x capsule) from (x, y) along angle `a` in its parent's plane.
function place(o: THREE.Object3D, x: number, y: number, a: number) {
  o.position.x = x;
  o.position.y = y;
  o.rotation.z = a;
}

// Two-bone IK in the x/y plane. `bend` picks the elbow side (+1 = up/behind).
function ik(upper: THREE.Object3D, fore: THREE.Object3D, sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: 1 | -1) {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.min(l1 + l2 - 0.001, Math.max(0.08, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const cosOff = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const off = Math.acos(Math.max(-1, Math.min(1, cosOff)));
  const ua = base + off * bend;
  place(upper, sx, sy, ua);
  const ex = sx + Math.cos(ua) * l1;
  const ey = sy + Math.sin(ua) * l1;
  place(fore, ex, ey, Math.atan2(ty - ey, tx - ex));
}
