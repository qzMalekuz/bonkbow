import * as THREE from 'three';
import { ARM_REACH, ARROW_LEN, BODY, HIP_Y } from '@/game3d/world';
import type { Death, Gesture, Mood } from '@/game3d/sim';
import type { Look } from '@/game/cosmetics';
import { DerpHead } from '@/game3d/DerpHead';
import { STICKMAN_DATA, StickmanBody, WALK_STRIDE, type BodyTargets } from '@/game3d/StickmanBody';

// 3D derp: a hand-scrawled paper head (DerpHead.ts, drawn like the launch
// videos) on a black stick body. The body is the Unity Asset Store "Free
// Pack - Stick Man" skinned mesh (StickmanBody.ts) when its licensed export
// is present, else capsule limbs built from three.js primitives. Either way
// the pose comes from here. The loadout (cosmetics.ts) picks the head, the
// hat drawn on it and the bow (or the shovel bow). Driven imperatively every
// frame (no React re-render): `update()` takes the sim's state and places
// every bone, blending between relaxed, aiming, walking, gesturing and dead.
//
// Local frame: +x = the way the archer faces, +y = up, +z = toward camera.
// The root flips with `rotation.y = π` for an archer facing left.

export type RigPose = {
  x: number;
  y: number; // feet
  facing: 1 | -1;
  angle: number; // world aim, y-up
  draw: number; // 0..1
  ready: boolean; // bow raised (my turn / aiming) vs held low
  flash: number;
  flinch: number;
  shieldFlash: number;
  death: Death | null;
  walk: number; // metres still to walk in
  stepT: number;
  mood: Mood;
  gesture: Gesture | null;
  gestureT: number;
  recoil: number; // 1 → 0 after a release
  showNocked: boolean;
  // Character-sheet actions layered on top (each eases in and out): run
  // turns a walk into a sprint, crouch drops to one knee to shoot, look
  // turns the head back over the shoulder (−1..1, + = over the right).
  run?: number;
  crouch?: number;
  look?: number;
  // 1 = turned round the wrong way (eases over); the aim is unaffected.
  turn?: number;
};

const BODY_BLACK = '#0E0E10';
const YAW = 0.42; // turn the body toward the camera for a 3/4 view
const STRING_REST = 0.14;
const BOW_R = 0.55;
const BOW_HALF = 0.72;
// Where the string is nocked on the upper limb (bow space: +x toward the
// target, grip at the origin); the lower limb mirrors it.
const BOW_TIP = { x: -BOW_R + BOW_R * Math.cos(BOW_HALF), y: BOW_R * Math.sin(BOW_HALF) };

// Upper recurve limb: from the grip back toward the archer, out to the nock,
// then a short flick forward. Wide and flat, tapering to the tip.
function recurveGeo() {
  const T = BOW_TIP;
  const pts = [
    [0, 0.06],
    [-0.01, 0.12],
    [-0.045, 0.2],
    [-0.095, 0.27],
    [-0.135, 0.32],
    [T.x, T.y],
    [T.x + 0.035, T.y + 0.035],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const SEG = 28;
  const RAD = 8;
  const g = new THREE.TubeGeometry(curve, SEG, 1, RAD, false);
  const pos = g.getAttribute('position');
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.floor(i / (RAD + 1)) / SEG);
    curve.getPointAt(t, c);
    const r = 0.024 * (1 - 0.55 * t);
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * r * 0.7, c.y + (pos.getY(i) - c.y) * r * 0.7, c.z + (pos.getZ(i) - c.z) * r * 1.5);
  }
  g.computeVertexNormals();
  return g;
}

// A mirrored copy turns its triangles inside out: swap two corners of each.
function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Leather-wrapped grip: a fat cylinder with wrap ridges.
function gripGeo() {
  const g = new THREE.CylinderGeometry(0.032, 0.032, 0.16, 12, 16);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.08 * Math.abs(Math.sin(pos.getY(i) * 110));
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

// Capsule along +x whose round ends are centred on the joints at 0 and
// `len`, so two bones meeting at a joint share one ball and bend without a
// pinch or a gap. `tip` = false ends flush at `len` (feet, hands).
function boneGeo(len: number, r: number, tip = true) {
  return cached(`bone:${len.toFixed(3)}:${r}:${tip ? 1 : 0}`, () => {
    const span = tip ? len : len - r;
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, span), 4, 10);
    g.rotateZ(-Math.PI / 2);
    g.translate(span / 2, 0, 0);
    return g;
  });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  return new THREE.Mesh(geo, mat);
}

const BLACK = new THREE.MeshBasicMaterial({ color: BODY_BLACK });

// An arrow whose TIP is at the local origin, pointing along +x. Shaft, head
// and three vanes are merged into one vertex-coloured mesh (one draw call per
// arrow), cached per fletching colour.
const ARROW_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const arrowGeos = new Map<string, THREE.BufferGeometry>();

export function makeArrow(fletch: string, shaft = '#D9C39A') {
  const key = `${fletch}|${shaft}`;
  let geo = arrowGeos.get(key);
  if (!geo) {
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, ARROW_LEN - 0.08, 5);
    shaftGeo.rotateZ(Math.PI / 2);
    shaftGeo.translate(-(ARROW_LEN - 0.08) / 2 - 0.08, 0, 0);
    const headGeo = new THREE.ConeGeometry(0.035, 0.1, 5);
    headGeo.rotateZ(-Math.PI / 2);
    headGeo.translate(-0.05, 0, 0);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.16, 0);
    shape.lineTo(0.2, 0.05);
    shape.lineTo(0.03, 0.05);
    const vanes = [0, Math.PI, Math.PI / 2].map((rx) => {
      const v = new THREE.ShapeGeometry(shape);
      v.translate(-ARROW_LEN, 0, 0);
      v.rotateX(rx);
      return v;
    });
    geo = mergeColored([
      [shaftGeo, shaft],
      [headGeo, '#C8CCD2'],
      ...vanes.map((v) => [v, fletch] as [THREE.BufferGeometry, string]),
    ]);
    arrowGeos.set(key, geo);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, ARROW_MAT));
  return g;
}

// The shovel bow's projectile: a garden shovel, blade first. Like makeArrow
// its TIP (the blade's edge) is the local origin, pointing along +x; one
// merged mesh, shared.
let shovelGeo: THREE.BufferGeometry | null = null;
export const SHOVEL_LEN = 1.3;

export function makeShovel() {
  if (!shovelGeo) {
    const blade = new THREE.BoxGeometry(0.3, 0.025, 0.24);
    // Pointed spade: pull the two front corners in to a point.
    const pos = blade.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) > 0) pos.setZ(i, pos.getZ(i) * 0.35);
    }
    blade.computeVertexNormals();
    blade.rotateX(Math.PI / 2);
    blade.translate(-0.15, 0, 0);
    const neck = new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).rotateZ(Math.PI / 2).translate(-0.34, 0, 0);
    const handle = new THREE.CylinderGeometry(0.024, 0.024, SHOVEL_LEN - 0.52, 6).rotateZ(Math.PI / 2).translate(-0.4 - (SHOVEL_LEN - 0.52) / 2, 0, 0);
    const grip = new THREE.TorusGeometry(0.07, 0.018, 5, 10).translate(-SHOVEL_LEN + 0.05, 0, 0);
    shovelGeo = mergeColored([
      [blade, '#9AA4AE'],
      [neck, '#5E666E'],
      [handle, '#A0703A'],
      [grip, '#2B2B2B'],
    ]);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shovelGeo, ARROW_MAT));
  return g;
}

// What a look shoots: arrows, or shovels from the shovel bow.
export const makeProjectile = (look: Pick<Look, 'bow' | 'trail'>) => (look.bow === 'shovel' ? makeShovel() : makeArrow(look.trail));

// Concatenate geometries into one non-indexed geometry with per-part colours.
// With `keep`, parts that already have vertex colours keep them.
function mergeColored(parts: [THREE.BufferGeometry, string][], keep = false) {
  const flat = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    return { g: n, c: new THREE.Color(c) };
  });
  const count = flat.reduce((k, p) => k + p.g.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const { g, c } of flat) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    const own = keep ? g.getAttribute('color') : null;
    if (own) col.set(own.array as Float32Array, o * 3);
    else for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export class StickmanRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // pivot at the hip; tumbles on death
  private hips = new THREE.Group(); // yawed toward camera
  private torso = new THREE.Group(); // +x along the spine
  private head = new THREE.Group(); // upright frame at the neck
  private headYaw = new THREE.Group(); // turns the head about its own up axis (look back)
  private derp = new DerpHead();
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
  private bodyMat: THREE.MeshLambertMaterial;
  // The skinned body driven from this rig's joints: the Unity stickman (null
  // without the licensed file, then capsules).
  private skin: StickmanBody | null = null;
  private stickSkin: StickmanBody | null = null;
  private skinMat: THREE.MeshPhongMaterial | null = null;
  private sticks: THREE.Mesh[] = []; // capsule body, hidden while a skin is on
  private targets: BodyTargets;
  // Continuity across state changes: the walk phase and emote clock hold
  // while their blends ease out; the death landing settles instead of
  // snapping; hand targets have a top speed.
  private walkBlend = new Blend(8);
  private walkPhase = 0;
  private clipPhase = 0; // Walk clip cycles, from distance walked
  private deathRot = 0;
  private land = new Blend(10);
  private prevBow: V2 | null = null;
  private prevDraw: V2 | null = null;
  private headClearance: { center: THREE.Vector3; radius: number } = PLAIN_HEAD;
  private flagProp: THREE.Group;
  // The arrow he is eating (the 'eat' emote), held across the mouth.
  private snack: THREE.Group;
  private shieldBubble: THREE.Mesh;
  private shadow: THREE.Mesh;
  private lookKey = '';
  private trail = '#FFFFFF';
  private neckExtra = 0;
  // Shovel bow: a giant bow (scaled), shovels for arrows, and a recoil that
  // throws him off his feet (`thrown` counts up from each release).
  private shovel = false;
  private bowScale = 1;
  private thrown = -1;
  private lastRecoil = 0;
  private turnBlend = new Blend(7);
  // Smoothed blends so every state change eases instead of snapping.
  private aimBlend = new Blend(12);
  private gestBlend = new Blend(10);
  // Emote clock and crossfade: the clock keeps running while an emote eases
  // out, and a new or restarted emote fades in over the old one.
  private gest: Gesture | null = null;
  private gestT = 0;
  private prevGest: Gesture | null = null;
  private prevGestT = 0;
  private xfade = 1;
  private fx: GestureFx = newFx();
  private fxPrev: GestureFx = newFx();
  private sadBlend = new Blend(6);
  private runBlend = new Blend(7);
  private crouchBlend = new Blend(7);
  private lookBlend = new Blend(5);
  private lookSide = 1;
  // Arrows stuck in this body are parented here so they tumble with it.
  readonly stuckMount = new THREE.Group();

  constructor(look: Look) {
    this.bodyMat = new THREE.MeshLambertMaterial({ color: BODY_BLACK });

    const { thigh, shin, torso, neck, upperArm, foreArm, limbR, torsoR } = BODY;

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
      th.add(this.stick(boneGeo(thigh, limbR)));
      sh.position.x = thigh;
      sh.add(this.stick(boneGeo(shin + 0.02, limbR, false)));
      th.add(sh);
      this.hips.add(th);
    }

    // Torso, neck, head: the neck runs on up the spine to the paper head
    // (a long-necked derp gets a longer one in setLook).
    this.torso.add(this.stick(boneGeo(torso + neck, torsoR)));
    this.hips.add(this.torso);
    this.head.rotation.z = -Math.PI / 2;
    this.head.add(this.headYaw);
    this.headYaw.add(this.derp.group);
    this.torso.add(this.head);
    this.neckBone = mesh(boneGeo(1, torsoR * 0.8), BLACK);
    this.neckBone.visible = false;
    this.torso.add(this.neckBone);

    // Arms (2D-placed segments in the arms group)
    const armSeg = (len: number, tip = true) => this.stick(boneGeo(len, limbR * 0.95, tip));
    this.upperBow.add(armSeg(upperArm));
    this.foreBow.add(armSeg(foreArm, false));
    this.upperDraw.add(armSeg(upperArm));
    this.foreDraw.add(armSeg(foreArm, false));
    this.upperBow.position.z = 0.06;
    this.foreBow.position.z = 0.06;
    this.upperDraw.position.z = -0.06;
    this.foreDraw.position.z = -0.06;
    this.arms.add(this.upperBow, this.foreBow, this.upperDraw, this.foreDraw, this.bow);

    // Smooth skinned body from the Unity asset, when it ships with this build.
    if (STICKMAN_DATA) {
      this.skinMat = new THREE.MeshPhongMaterial({ color: BODY_BLACK, shininess: 45, specular: new THREE.Color(0x3a3a3a) });
      this.stickSkin = new StickmanBody(STICKMAN_DATA, this.skinMat);
    }
    const v = () => new THREE.Vector3();
    this.targets = {
      hips: new THREE.Matrix4(),
      spine: v(),
      legs: [0, 1].map(() => ({ ankle: v() })),
      arms: [0, 1].map(() => ({ shoulder: v(), elbow: v(), hand: v(), spread: 1, hang: 1 })),
      head: v(),
      headR: BODY.headR,
      walk: 0,
      walkPhase: 0,
    };

    // Bowstring (tip → nock → tip)
    this.stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const str = new THREE.Line(this.stringGeo, new THREE.LineBasicMaterial({ color: '#F2F2F2', transparent: true, opacity: 0.9 }));
    str.frustumCulled = false;
    this.arms.add(str);

    this.nocked = makeArrow(look.trail);
    this.arms.add(this.nocked);

    // The snack: one arrow, held level across the mouth while he chews.
    this.snack = makeArrow(look.trail);
    this.snack.visible = false;
    this.arms.add(this.snack);

    // Little white surrender flag, shown during the "flag" emote.
    this.flagProp = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), new THREE.MeshStandardMaterial({ color: '#6B4F2A' }));
    pole.position.y = 0.3;
    const cloth = mesh(new THREE.PlaneGeometry(0.32, 0.22), new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide }));
    cloth.position.set(0.16, 0.55, 0);
    cloth.userData.cloth = true;
    this.flagProp.add(pole, cloth);
    this.flagProp.visible = false;
    this.arms.add(this.flagProp);

    // Shield shimmer and contact shadow
    this.shieldBubble = mesh(
      cached('bubble', () => new THREE.IcosahedronGeometry(1, 2)),
      new THREE.MeshBasicMaterial({ color: '#4FC3F7', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }),
    );
    this.shieldBubble.position.y = HIP_Y + 0.25;
    this.shieldBubble.scale.set(0.75, 1.2, 0.75);
    this.shadow = mesh(
      cached('blob', () => new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.shadow.position.y = 0.015;
    this.root.add(this.shieldBubble, this.shadow);

    this.setLook(look);
  }

  private neckBone: THREE.Mesh;

  private stick(geo: THREE.BufferGeometry) {
    const m = mesh(geo, this.bodyMat);
    this.sticks.push(m);
    return m;
  }

  get trailColor() {
    return this.trail;
  }

  setLook(look: Look) {
    if (look.key === this.lookKey) return;
    this.lookKey = look.key;
    this.trail = look.trail;
    this.shovel = look.bow === 'shovel';
    this.bowScale = this.shovel ? 1.7 : 1;
    this.buildBow(look);
    this.useBody();
    this.derp.set(look.shape, look.hat, look.seed);
    // Head on the neck; a long-necked derp shows the extra as a thin stalk.
    const { torso, neck } = BODY;
    this.neckExtra = look.neck;
    this.head.position.x = torso + neck + look.neck;
    this.neckBone.visible = look.neck > 0.01;
    if (this.neckBone.visible) {
      this.neckBone.position.x = torso + neck - 0.02;
      this.neckBone.scale.set(look.neck + 0.02, 1, 1);
    }
    const hc = this.derp.clearance;
    this.headClearance = hc;

    // Nocked arrow (or shovel) takes the trail colour for its fletching
    this.arms.remove(this.nocked);
    this.nocked = makeProjectile(look);
    this.arms.add(this.nocked);
  }

  private buildBow(look: Look) {
    this.bow.clear();
    // A recurve: limbs curve back toward the archer and flick forward at the
    // tips, string nocked where they turn (BOW_TIP); wrapped grip with metal
    // ferrules either side, as on the character sheets. One merged,
    // vertex-coloured mesh per look (one draw call).
    const shovel = look.bow === 'shovel';
    const wood = shovel ? '#6B4A2B' : '#8B5A2B';
    const accent = shovel ? '#2B2B2B' : '#E9D8A6';
    const key = `bow|${wood}|${accent}`;
    const geo = cached(key, () => {
      const limb = recurveGeo();
      const lower = limb.clone().scale(1, -1, 1);
      const ferrules = [1, -1].map((s) => new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10).translate(-0.004, s * 0.085, 0));
      const nocks = [1, -1].map((s) => new THREE.SphereGeometry(0.016, 8, 6).translate(BOW_TIP.x, s * BOW_TIP.y, 0));
      return mergeColored([
        [limb, wood],
        [flipWinding(lower), wood],
        [ferrules[0], '#B9B6AE'],
        [ferrules[1], '#B9B6AE'],
        [nocks[0], accent],
        [nocks[1], accent],
        [gripGeo(), accent],
      ]);
    });
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: new THREE.Color(0x333333) });
    const m = mesh(geo, mat);
    m.scale.setScalar(this.bowScale);
    this.bow.add(m);
  }

  // The skinned body: the Unity stickman, or the capsule limbs when that
  // file isn't in the build.
  private useBody() {
    const next = this.stickSkin;
    if (next === this.skin) return;
    this.skin?.group.removeFromParent();
    this.skin = next;
    if (next) this.root.add(next.group);
    for (const m of this.sticks) m.visible = !next;
    // Fresh body: no hand-speed history to sweep in from.
    this.prevBow = this.prevDraw = null;
  }

  // Place every bone for this frame. `t` = time (s), `dt` = frame step.
  update(p: RigPose, t: number, dt = 1 / 60) {
    const f = p.facing;
    const d = p.death;
    // Wrong way round: he turns his back on the target (the aim is the sim's,
    // unchanged — he just draws at the scenery behind him for a moment).
    this.turnBlend.to(p.turn && !d ? p.turn : 0, dt);
    const turn = this.turnBlend.v;
    this.root.rotation.y = (f === 1 ? 0 : Math.PI) + turn * Math.PI;
    const limp = d ? Math.min(1, d.t * 3) : 0;
    // Shovel bow recoil: each release throws him back off his feet; he lands
    // on his back, then shuffles back to his spot. Visual only.
    if (this.shovel && p.recoil > this.lastRecoil + 0.5) this.thrown = 0;
    this.lastRecoil = p.recoil;
    let throwX = 0;
    let throwY = 0;
    let throwTilt = 0;
    if (this.thrown >= 0) {
      this.thrown += dt;
      const k = this.thrown;
      if (k > THROW_TIME || d) this.thrown = -1;
      else {
        const fly = Math.min(1, k / 0.4);
        const back = k < 1.1 ? 1 - (1 - fly) * (1 - fly) : 1 - smooth((k - 1.1) / (THROW_TIME - 1.1));
        throwX = -1.3 * back;
        throwY = k < 0.4 ? Math.sin((k / 0.4) * Math.PI) * 0.5 : 0;
        throwTilt = k < 1.1 ? Math.min(1, k / 0.3) * 1.15 : 1.15 * (1 - smooth((k - 1.1) / 0.35));
      }
    }

    // Blends: aim raises the bow; gestures and defeat take over the arms.
    const aiming = p.ready || p.draw > 0.02;
    this.aimBlend.to(aiming ? 1 : 0, dt);
    if (p.gesture) {
      const restart = p.gesture !== this.gest || p.gestureT < this.gestT - 0.05;
      if (restart && this.gest && this.gestBlend.v > 0.02) {
        this.prevGest = this.gest;
        this.prevGestT = this.gestT;
        this.xfade = 0;
      }
      this.gest = p.gesture;
      this.gestT = p.gestureT;
    } else this.gestT += dt;
    this.gestBlend.to(p.gesture ? 1 : 0, dt);
    this.sadBlend.to(p.mood === 'sad' && !p.gesture ? 1 : 0, dt);
    const g = this.gestBlend.v;
    const fx = this.fx;
    if (this.gest) gestureFx(this.gest, this.gestT, fx);
    if (this.prevGest) {
      this.prevGestT += dt;
      this.xfade = Math.min(1, this.xfade + dt / XFADE);
      gestureFx(this.prevGest, this.prevGestT, this.fxPrev);
      mixFx(this.fxPrev, fx, this.xfade * this.xfade * (3 - 2 * this.xfade), fx);
      if (this.xfade >= 1) this.prevGest = null;
    }
    // Same for the walk: the legs settle out of the stride they were in.
    this.walkBlend.to(p.walk > 0 && !d ? 1 : 0, dt);
    if (p.walk > 0) {
      this.walkPhase = p.stepT;
      this.clipPhase = -p.walk / WALK_STRIDE;
    }
    const walking = this.walkBlend.v;
    this.runBlend.to(p.run && p.walk > 0 && !d ? p.run : 0, dt);
    this.crouchBlend.to(p.crouch && !d ? p.crouch : 0, dt);
    if (p.look) this.lookSide = p.look < 0 ? -1 : 1;
    this.lookBlend.to(p.look && !d ? Math.abs(p.look) : 0, dt);
    const run = this.runBlend.v * walking;
    const crouch = this.crouchBlend.v;
    const look = this.lookBlend.v * this.lookSide;
    // Death: follow the sim's tumble in the air, then ease onto the ground.
    if (d) {
      if (!d.landed) {
        this.deathRot = d.rot;
        this.land.set(0);
      } else {
        this.land.to(1, dt);
        this.deathRot += (d.rot - this.deathRot) * Math.min(1, this.land.v * 1.5);
      }
    } else this.land.set(0);
    const land = this.land.v;

    // Root / tumble / walk-in / drop
    const walkOff = -f * p.walk;
    let bounce = 0;
    bounce = Math.abs(Math.sin(this.walkPhase * Math.PI)) * (0.05 + 0.035 * run) * walking - crouch * 0.32;
    bounce += g * fx.bounce;
    if (d) {
      this.root.position.set(d.x, d.y - (HIP_Y - 0.1) * Math.abs(Math.sin(this.deathRot)) * (0.4 + 0.6 * land), 0);
      // World spin, expressed in the (possibly flipped) root frame.
      this.body.rotation.z = this.deathRot * f;
    } else {
      // Hit stagger: a small shove back that springs out.
      const shove = -f * p.flinch * 0.12;
      this.root.position.set(p.x + walkOff + shove + f * throwX, p.y + throwY, 0);
      // Local +z tips the body backward whichever way he faces.
      this.body.rotation.z = throwTilt;
    }
    this.body.position.y = HIP_Y + bounce - throwTilt * 0.42;
    this.shadow.visible = !d || d.landed;
    this.shadow.scale.setScalar(1 - Math.min(0.5, Math.max(0, bounce)));

    // Hit flash and shield shimmer
    this.bodyMat.emissive.setRGB(p.flash * 0.9, p.flash * 0.25, p.flash * 0.25);
    this.skinMat?.emissive.copy(this.bodyMat.emissive);
    const sb = this.shieldBubble.material as THREE.MeshBasicMaterial;
    sb.opacity = p.shieldFlash * 0.55;
    this.shieldBubble.visible = p.shieldFlash > 0.01;
    this.shieldBubble.rotation.y = t * 1.5;
    this.shieldBubble.scale.set(0.75 + (1 - p.shieldFlash) * 0.25, 1.2 + (1 - p.shieldFlash) * 0.3, 0.75 + (1 - p.shieldFlash) * 0.25);

    // Legs: planted stance, walk cycle, stomp, loose flail while dead
    const flail = (n: number) => (d ? Math.sin(d.t * 14 + n) * 0.9 * (1 - land) : 0);
    // Lying still: which way is the ground, along the body's own +x? On its
    // back (ground behind) the front knee lifts; face down a heel lifts. No
    // limb may bend toward the ground.
    const groundAhead = -Math.sin(this.body.rotation.z) > 0;
    const kneeUp = groundAhead ? 0 : 0.4 * land;
    const heelUp = (groundAhead ? 0.7 : 0.55) * land;
    const stride = Math.sin(this.walkPhase * Math.PI * 2) * (0.55 + 0.32 * run) * walking;
    const stomp = g * fx.stomp;
    const cheerKick = g * fx.kick;
    // Looking back twists the hips a little toward the look.
    this.hips.rotation.y = -YAW * (1 - limp) - look * 0.3;
    // Standing stance fades out as the body lies down.
    const stance = (1 - walking) * (1 - land);
    const flex = 0.8 + 0.6 * run; // knees fold more in a sprint
    const tF = -Math.PI / 2 + 0.3 * stance + stride + flail(0) * limp + kneeUp + stomp + cheerKick;
    const sF = -0.12 * (1 - land) - Math.max(0, -stride) * flex - stomp * 0.9 - cheerKick + Math.abs(flail(1)) * 0.5 * limp - heelUp;
    const tB = -Math.PI / 2 - 0.26 * stance - stride + flail(2) * limp - cheerKick;
    const sB = -0.28 * (1 - land) - Math.max(0, stride) * flex - cheerKick + Math.abs(flail(3)) * 0.5 * limp;
    // Crouch: front foot planted ahead under a bent knee, back knee down.
    this.thighF.rotation.z = tF + (-0.25 - tF) * crouch;
    this.shinF.rotation.z = sF + (-1.32 - sF) * crouch;
    this.thighB.rotation.z = tB + (-1.92 - tB) * crouch;
    this.shinB.rotation.z = sB + (-1.07 - sB) * crouch;

    // Torso lean: breathe, lean into the draw, recoil on hit, emote lean
    const breathe = d ? 0 : Math.sin(t * 2.1) * 0.025;
    const gLean = fx.lean;
    const headTilt = fx.tilt;
    // Sad (defeat): head hangs, shoulders slump.
    const sad = this.sadBlend.v;
    const lean =
      (p.draw * 0.12 + p.flinch * 0.45 + breathe) * (1 - g) +
      gLean * g +
      sad * 0.22 +
      flail(4) * 0.3 * limp -
      0.06 * walking -
      0.32 * run -
      0.1 * crouch;
    // lean > 0 tips the spine backward (+x toward the archer's back).
    this.torso.rotation.z = Math.PI / 2 + lean;
    const idleLook = d ? 0 : Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.02;
    this.head.rotation.z = -Math.PI / 2 - lean * 0.3 + idleLook * (1 - g) + headTilt * g - sad * 0.55 - p.flinch * 0.3 + run * 0.12;
    // Seeing stars: the head lolls about.
    if (p.mood === 'dazed' && !d) this.head.rotation.z += Math.sin(t * 5.5) * 0.22;
    // Look back: the head turns about its own up axis, over the shoulder.
    this.headYaw.rotation.y = -look * 1.5;

    // Face: the paper head redraws itself for the mood (and blushes on a hit).
    this.derp.update(d ? 'dead' : p.mood, t, p.flash);

    // Shoulder point in body space (hip = origin), after lean & yaw
    const spine = BODY.torso;
    const sAng = Math.PI / 2 + lean;
    const sx = Math.cos(sAng) * spine * Math.cos(this.hips.rotation.y);
    const sy = Math.sin(sAng) * spine - sad * 0.05;

    // ---- arm targets (relative to the shoulder) ---------------------------
    // Aiming: bow hand straight out along the aim; string hand at the nock.
    let a = f === 1 ? p.angle : Math.PI - p.angle;
    // Release follow-through: the bow arm kicks up and settles.
    const rc = p.recoil * p.recoil;
    a += rc * 0.22;
    // Dead: arms flop toward the feet, settling on the side away from the ground.
    if (d) a = -1.2 + flail(5) * 0.6 - (groundAhead ? 0.7 : 0) * land;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const aimHand = { x: cosA * ARM_REACH, y: sinA * ARM_REACH };
    // Hands work in the aim plane; with the Unity body it sits out at the front
    // shoulder, further for a big head.
    const aimZ = this.skin ? 0.2 + Math.max(0, this.headClear().radius - BODY.headR) * 0.4 : 0.06;
    const pull = STRING_REST + p.draw * 0.62;
    const lift = p.draw * 0.06;
    let aimNock = { x: aimHand.x - cosA * pull - sinA * lift, y: aimHand.y - sinA * pull + cosA * lift };
    // Anchor point: the drawing hand stops at the face instead of inside it
    // (a big paper head would swallow it), pushed straight out of the head
    // so it moves continuously. Visual only — the shot is the sim's.
    {
      const hc = this.headClear();
      // Head space +y runs up the spine.
      const Lh = this.head.position.x + hc.center.y;
      const cx = Math.cos(sAng) * Lh * Math.cos(this.hips.rotation.y) - sx;
      const cy = Math.sin(sAng) * Lh - (sy + sad * 0.05);
      const r2 = (hc.radius + 0.04) ** 2 - aimZ * aimZ;
      const dx = aimNock.x - cx;
      const dy = aimNock.y - cy;
      const dd = Math.hypot(dx, dy);
      if (r2 > 0 && dd * dd < r2 && dd > 1e-4) {
        const r = Math.sqrt(r2);
        aimNock = { x: cx + (dx / dd) * r, y: cy + (dy / dd) * r };
      }
    }
    // Relaxed: bow held low and forward, other hand hanging.
    const relaxBow = { x: 0.16, y: -0.48 + Math.sin(t * 2.1) * 0.01 };
    const relaxDraw = { x: -0.06, y: -0.52 };
    const ab = d ? 0 : this.aimBlend.v;
    // Hand blends swing around the shoulder (angle + reach), like a real arm,
    // rather than cutting straight through it.
    let bowHand = swing(relaxBow, aimHand, ab);
    // After a release the string hand flows back past the chin.
    const follow = { x: -0.22, y: 0.1 };
    let drawHand = swing(relaxDraw, lerp2(aimNock, follow, rc), ab);
    if (walking > 0.001) {
      bowHand = { x: bowHand.x - stride * 0.15, y: bowHand.y };
      drawHand = { x: drawHand.x + stride * 0.15, y: drawHand.y };
      // Sprinting: elbows bent, fists pumping at chest height.
      if (run > 0.001 && ab < 0.999) {
        const sw = Math.sin(this.walkPhase * Math.PI * 2);
        const k = run * (1 - ab);
        bowHand = swing(bowHand, { x: 0.12 - sw * 0.3, y: -0.26 + Math.max(0, -sw) * 0.2 }, k);
        drawHand = swing(drawHand, { x: 0.12 + sw * 0.3, y: -0.26 + Math.max(0, sw) * 0.2 }, k);
      }
    }
    if (g > 0.001 && this.gest && !d) {
      bowHand = swing(bowHand, fx.bow, g);
      drawHand = swing(drawHand, fx.draw, g);
      // The snack goes to the mouth, wherever a long neck put it.
      if (this.gest === 'eat') drawHand = { x: drawHand.x, y: drawHand.y + this.neckExtra * g };
    }
    if (sad > 0.001 && !d) {
      bowHand = swing(bowHand, { x: 0.05, y: -0.55 }, sad);
      drawHand = swing(drawHand, { x: -0.02, y: -0.56 }, sad);
    }

    // Top hand speed (shoulder-relative): normal motion is far below it; a
    // pose that would jump (a looped emote restarting, a cut between
    // performances) sweeps across in a few frames instead. Off while dead.
    if (d) this.prevBow = this.prevDraw = null;
    else {
      bowHand = capStep(this.prevBow, bowHand, HAND_SPEED * dt);
      drawHand = capStep(this.prevDraw, drawHand, HAND_SPEED * dt);
      this.prevBow = bowHand;
      this.prevDraw = drawHand;
    }

    // Bow arm: elbow bends down/out; draw arm: elbow up/behind when drawing.
    ik(this.upperBow, this.foreBow, sx, sy, sx + bowHand.x, sy + bowHand.y, BODY.upperArm, BODY.foreArm, -1);
    ik(this.upperDraw, this.foreDraw, sx, sy, sx + drawHand.x, sy + drawHand.y, BODY.upperArm, BODY.foreArm, -1);
    let hx = sx + bowHand.x;
    let hy = sy + bowHand.y;
    let hz = 0.06;
    let nx = sx + drawHand.x;
    let ny = sy + drawHand.y;
    let nz = -0.06;

    // With the Unity body, pose it now and hang the bow and string on its
    // real hands. While aiming both hands work in one plane, a little in
    // front of the big head so the string never cuts through the face.
    if (this.skin) {
      const aimW = ab * (1 - g) * (1 - sad);
      // Hanging (not aiming, not emoting): arms rest at their full length.
      const hang = (1 - ab) * (1 - g);
      this.syncSkin(this.skin, this.targets, 1 - aimW, hang, aimZ, d ? 0 : walking * (1 - this.runBlend.v) * (1 - crouch));
      this.skin.grip(0, _grip).applyMatrix4(_armsInv);
      hx = _grip.x;
      hy = _grip.y;
      hz = _grip.z;
      this.skin.grip(1, _grip).applyMatrix4(_armsInv);
      nx = _grip.x;
      ny = _grip.y;
      nz = _grip.z;
    }

    // Bow: perpendicular to the aim when raised, limbs vertical when held low.
    const bowRot = lerpAngle(-0.25, a, ab);
    this.bow.position.set(hx, hy, hz);
    this.bow.rotation.z = bowRot;
    const cosB = Math.cos(bowRot);
    const sinB = Math.sin(bowRot);

    // Bowstring through the nock while drawn, straight otherwise
    const tipBack = BOW_TIP.x * this.bowScale;
    const tipUp = BOW_TIP.y * this.bowScale;
    const pos = this.stringGeo.getAttribute('position') as THREE.BufferAttribute;
    const tx = (lx: number, ly: number) => hx + lx * cosB - ly * sinB;
    const ty = (lx: number, ly: number) => hy + lx * sinB + ly * cosB;
    const drawn = p.draw > 0.01 && !d && ab > 0.5;
    // Twang: the released string vibrates around its rest line.
    const twang = Math.sin(t * 75) * 0.05 * rc;
    pos.setXYZ(0, tx(tipBack, tipUp), ty(tipBack, tipUp), hz);
    pos.setXYZ(1, drawn ? nx : tx(tipBack + twang, 0), drawn ? ny : ty(tipBack + twang, 0), drawn ? nz : hz);
    pos.setXYZ(2, tx(tipBack, -tipUp), ty(tipBack, -tipUp), hz);
    pos.needsUpdate = true;

    // Nocked arrow sits on the string
    this.nocked.visible = p.showNocked && !d && ab > 0.6;
    const len = this.shovel ? SHOVEL_LEN : ARROW_LEN;
    this.nocked.position.set(nx + cosA * len, ny + sinA * len, hz);
    this.nocked.rotation.z = a;

    // Surrender flag rides the draw hand
    this.flagProp.visible = this.gest === 'flag' && g > 0.3 && !d;
    if (this.flagProp.visible) {
      this.flagProp.position.set(nx, ny - 0.3, nz);
      const cloth = this.flagProp.children[1];
      cloth.rotation.y = Math.sin(t * 8) * 0.4;
    }

    // Lunch: one arrow held level across the mouth, tip forward.
    this.snack.visible = this.gest === 'eat' && g > 0.3 && !d;
    if (this.snack.visible) {
      this.snack.position.set(nx + ARROW_LEN * 0.55, ny + 0.02, nz + 0.04);
      this.snack.rotation.z = Math.sin(t * 22) * 0.04;
    }
  }

  // The sphere hands must stay out of, in head-group space.
  private headClear() {
    return this.headClearance;
  }

  // Report this frame's joints (in root space) and bend the Unity skeleton to
  // them. `spread` 0..1: hands from the aim plane (z = aimZ) out to the
  // asset's shoulder planes.
  private syncSkin(skin: StickmanBody, tg: BodyTargets, spread: number, hang: number, aimZ: number, walk: number) {
    this.root.updateMatrixWorld(true);
    _rootInv.copy(this.root.matrixWorld).invert();
    const rel = (o: THREE.Object3D) => _rel.multiplyMatrices(_rootInv, o.matrixWorld);
    const at = (o: THREE.Object3D, x: number, out: THREE.Vector3) => out.set(x, 0, 0).applyMatrix4(rel(o));
    tg.hips.copy(rel(this.hips));
    tg.spine.set(1, 0, 0).transformDirection(rel(this.torso));
    const { shin, foreArm, upperArm } = BODY;
    at(this.shinF, shin + 0.02, tg.legs[0].ankle);
    at(this.shinB, shin + 0.02, tg.legs[1].ankle);
    for (const [i, up, fore] of [
      [0, this.upperBow, this.foreBow],
      [1, this.upperDraw, this.foreDraw],
    ] as const) {
      const arm = tg.arms[i];
      at(up, 0, arm.shoulder);
      at(up, upperArm, arm.elbow);
      // Aim for the wrist so the asset's palm (grip) lands on the rig's hand.
      at(fore, foreArm - 0.05, arm.hand);
      arm.hand.z = aimZ;
      arm.spread = spread;
      arm.hang = hang;
    }
    const hc = this.headClear();
    tg.head.copy(hc.center).applyMatrix4(rel(this.head));
    tg.headR = hc.radius + 0.06; // + the hand's own thickness
    tg.walk = walk;
    tg.walkPhase = this.clipPhase;
    skin.update(tg);
    _armsInv.copy(rel(this.arms)).invert();
  }
}

// A 0..1 blend that eases like a critically damped spring: it leaves at rest
// (no jolt on the first frame, unlike exponential easing), arrives without
// overshoot, and stays stable at low frame rates.
class Blend {
  v = 0;
  private vel = 0;
  constructor(private w: number) {}
  to(target: number, dt: number) {
    const h = Math.min(dt, 0.05);
    const a = this.w * this.w * (target - this.v) - 2 * this.w * this.vel;
    this.vel += a * h;
    this.v = Math.min(1, Math.max(0, this.v + this.vel * h));
    if ((this.v === 0 || this.v === 1) && this.v === target) this.vel = 0;
  }
  set(v: number) {
    this.v = v;
    this.vel = 0;
  }
}

const PLAIN_HEAD = { center: new THREE.Vector3(), radius: BODY.headR };
const THROW_TIME = 2.2; // shovel bow: thrown, lying there, back on his spot
const smooth = (x: number) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};
const HAND_SPEED = 4.5; // m/s — above any aim drag the sim produces (~3.3 m/s)
const _grip = new THREE.Vector3();
const _armsInv = new THREE.Matrix4();

// Move from `prev` toward `next`, at most `max` metres.
function capStep(prev: V2 | null, next: V2, max: number): V2 {
  if (!prev) return next;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy);
  return len <= max ? next : { x: prev.x + (dx / len) * max, y: prev.y + (dy / len) * max };
}

const _rootInv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();

type V2 = { x: number; y: number };

// Everything an emote does at its local time t: hand targets (relative to
// the shoulder, local frame), spine lean, head tilt, hop height, leg kicks and
// yawn. Every curve is periodic or holds its end pose, so an emote may run
// past its length while it eases out.
type GestureFx = { bow: V2; draw: V2; lean: number; tilt: number; bounce: number; stomp: number; kick: number; yawn: number };
const XFADE = 0.35; // seconds to crossfade between emotes

function newFx(): GestureFx {
  return { bow: { x: 0, y: 0 }, draw: { x: 0, y: 0 }, lean: 0, tilt: 0, bounce: 0, stomp: 0, kick: 0, yawn: 0 };
}

function mixFx(a: GestureFx, b: GestureFx, k: number, out: GestureFx) {
  const m = (x: number, y: number) => x + (y - x) * k;
  out.bow = swing(a.bow, b.bow, k);
  out.draw = swing(a.draw, b.draw, k);
  out.lean = m(a.lean, b.lean);
  out.tilt = m(a.tilt, b.tilt);
  out.bounce = m(a.bounce, b.bounce);
  out.stomp = m(a.stomp, b.stomp);
  out.kick = m(a.kick, b.kick);
  out.yawn = m(a.yawn, b.yawn);
}

function gestureFx(g: Gesture, t: number, out: GestureFx) {
  const hands = gesturePose(g, t);
  out.bow = hands.bow;
  out.draw = hands.draw;
  out.lean = 0;
  out.tilt = 0;
  out.bounce = 0;
  out.stomp = 0;
  out.kick = 0;
  out.yawn = 0;
  switch (g) {
    case 'laugh':
      out.lean = -0.25 - Math.sin(t * 14) * 0.08;
      out.tilt = 0.35;
      out.bounce = Math.abs(Math.sin(t * 14)) * 0.04;
      break;
    case 'facepalm':
    case 'cry':
      out.lean = 0.2;
      out.tilt = -0.3 + Math.sin(t * (g === 'cry' ? 22 : 6)) * 0.08;
      break;
    case 'cheer':
      out.lean = -0.1;
      out.tilt = 0.3;
      out.bounce = Math.abs(Math.sin(t * 7)) * 0.32;
      out.kick = Math.max(0, Math.sin(t * 7)) * 0.4;
      break;
    case 'stomp':
      out.lean = 0.12;
      out.tilt = -0.1;
      out.stomp = Math.max(0, Math.sin(t * 9)) * 0.8;
      break;
    case 'shrug':
      out.tilt = Math.sin(t * 3) * 0.15;
      break;
    case 'bow': {
      // Fold forward, hold, rise.
      const k = Math.sin(Math.min(1, t / 2.0) * Math.PI);
      out.lean = 0.9 * Math.min(1, k * 1.6);
      out.tilt = -0.2 * k;
      break;
    }
    case 'flex':
      out.lean = -0.08;
      out.tilt = 0.15 + Math.sin(t * 5) * 0.05;
      out.bounce = Math.max(0, Math.sin(t * 5)) * 0.03;
      break;
    case 'think':
      out.lean = 0.06;
      out.tilt = 0.25 + Math.sin(t * 1.6) * 0.12;
      break;
    case 'salute':
      out.lean = -0.05;
      break;
    case 'dance':
      out.lean = Math.sin(t * 6) * 0.14;
      out.tilt = Math.sin(t * 6 + 1) * 0.3;
      out.bounce = Math.abs(Math.sin(t * 6)) * 0.12;
      out.stomp = Math.max(0, Math.sin(t * 6)) * 0.5;
      break;
    case 'yawn': {
      const k = yawnK(t);
      out.lean = -0.18 * k;
      out.tilt = 0.5 * k;
      out.yawn = Math.max(0, k);
      break;
    }
    case 'eat':
      out.lean = 0.04;
      out.tilt = 0.12 + Math.sin(t * 22) * 0.03;
      break;
    default:
      break;
  }
}

// Yawn: stretch up and back down once, then hold still.
const yawnK = (t: number) => Math.sin(Math.min(1, t / 2.4) * Math.PI);

// Hand targets (relative to the shoulder, local frame) for each emote.
function gesturePose(g: Gesture, t: number): { bow: V2; draw: V2 } {
  switch (g) {
    case 'cheer':
      return {
        bow: { x: 0.12, y: 0.5 + Math.sin(t * 7) * 0.06 },
        draw: { x: -0.05, y: 0.32 + Math.abs(Math.sin(t * 9)) * 0.22 },
      };
    case 'laugh':
      return { bow: { x: 0.14, y: -0.3 }, draw: { x: 0.12, y: -0.36 + Math.sin(t * 14) * 0.03 } };
    case 'facepalm':
      return { bow: { x: 0.1, y: -0.5 }, draw: { x: 0.2, y: 0.3 } };
    case 'cry':
      return { bow: { x: 0.2, y: 0.28 + Math.sin(t * 22) * 0.01 }, draw: { x: 0.18, y: 0.3 } };
    case 'shrug':
      return { bow: { x: 0.36, y: 0.02 + Math.sin(t * 3) * 0.04 }, draw: { x: -0.32, y: 0.02 + Math.sin(t * 3) * 0.04 } };
    case 'wave': // hand up in front of the face, where it reads
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.3 + Math.sin(t * 12) * 0.12, y: 0.42 } };
    case 'stomp':
      return { bow: { x: 0.18, y: -0.4 - Math.max(0, Math.sin(t * 9)) * 0.1 }, draw: { x: -0.12, y: -0.38 - Math.max(0, Math.sin(t * 9)) * 0.1 } };
    case 'thumbs':
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.42, y: 0.12 + Math.min(1, t * 4) * 0.05 } };
    case 'flag':
      return { bow: { x: 0.1, y: 0.52 }, draw: { x: -0.04, y: 0.56 + Math.sin(t * 6) * 0.03 } };
    case 'bow':
      return { bow: { x: 0.2, y: -0.42 }, draw: { x: 0.1, y: -0.5 } };
    case 'flex': {
      const f = 0.5 + Math.sin(t * 5) * 0.5;
      return { bow: { x: 0.3, y: 0.3 + f * 0.1 }, draw: { x: -0.22, y: 0.3 + f * 0.1 } };
    }
    case 'think':
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.22, y: 0.2 + Math.sin(t * 2.2) * 0.015 } };
    case 'salute':
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.2, y: 0.44 } };
    case 'dance':
      return {
        bow: { x: 0.18 + Math.sin(t * 6) * 0.12, y: 0.42 + Math.sin(t * 12) * 0.1 },
        draw: { x: -0.12 - Math.sin(t * 6) * 0.12, y: 0.42 - Math.sin(t * 12) * 0.1 },
      };
    case 'yawn': {
      const k = yawnK(t);
      return { bow: { x: 0.34, y: 0.1 + k * 0.5 }, draw: { x: -0.26, y: 0.1 + k * 0.5 } };
    }
    case 'eat': // arrow up to the mouth, chewing
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.1, y: 0.15 + Math.sin(t * 22) * 0.012 } };
  }
}

function lerp2(a: V2, b: V2, k: number): V2 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

// Shoulder-relative blend: reach and angle separately, along the short arc.
function swing(a: V2, b: V2, k: number): V2 {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const r = Math.hypot(a.x, a.y) * (1 - k) + Math.hypot(b.x, b.y) * k;
  const ang = lerpAngle(Math.atan2(a.y, a.x), Math.atan2(b.y, b.x), k);
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// Point `o` (a +x capsule) from (x, y) along angle `a` in its parent's plane.
function place(o: THREE.Object3D, x: number, y: number, a: number) {
  o.position.x = x;
  o.position.y = y;
  o.rotation.z = a;
}

// Two-bone IK in the x/y plane. `bend` picks the elbow side.
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
