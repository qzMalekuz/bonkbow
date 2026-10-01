import * as THREE from 'three';
import { ARM_REACH, ARROW_LEN, BODY, HIP_Y } from '@/game3d/world';
import type { Death, Gesture, Mood } from '@/game3d/sim';
import type { Look } from '@/game/cosmetics';
import { ATLAS_COLS, ATLAS_ROWS, FACES, TILE, type FaceId } from '@/game/faces';

// Procedural 3D stickman: matte-black capsule limbs, a big head with white
// cartoon eyes, built from three.js primitives. The loadout (cosmetics.ts)
// adds glossy headgear, a themed bow and the trail colour on top — the body
// itself is always black, like the reference game. Driven imperatively every
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
};

const BODY_BLACK = '#0E0E10';
const YAW = 0.42; // turn the body toward the camera for a 3/4 view
const STRING_REST = 0.14;
const BOW_R = 0.55;
const BOW_HALF = 0.72;

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

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  return new THREE.Mesh(geo, mat);
}

// Phong (not PBR) keeps the glossy cosmetic look at a fraction of the
// per-pixel cost on phone GPUs. Rougher = duller highlight; metal = brighter.
function glossy(color: string, opts: { metal?: number; rough?: number; glow?: number } = {}) {
  const c = new THREE.Color(color);
  const rough = opts.rough ?? 0.32;
  return new THREE.MeshPhongMaterial({
    color: c,
    shininess: Math.round(10 + (1 - rough) * 80),
    specular: new THREE.Color(0xffffff).multiplyScalar(0.15 + (opts.metal ?? 0.15) * 0.6),
    emissive: opts.glow ? c : new THREE.Color(0x000000),
    emissiveIntensity: opts.glow ?? 0,
  });
}

const WHITE = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });

// Hero atlases, one per FaceId, shared by every rig on screen.
// @react-three/fiber/native patches TextureLoader to accept a require()'d
// asset module, so this works on device and on web alike.
const faceTextures = new Map<FaceId, THREE.Texture>();
function faceTexture(id: FaceId) {
  let tex = faceTextures.get(id);
  if (!tex) {
    tex = new THREE.TextureLoader().load(FACES[id].image as unknown as string);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    faceTextures.set(id, tex);
  }
  return tex;
}

// Hero head: the stickman's skull grows to chibi size and the atlas tiles
// are wrapped around it as sphere patches. Head frame: +x forward, +y up.
// Three's sphere runs phi around +y starting at -x, so the front patch is
// centred on phi = π, the character's right side (+z) on π/2, back on 0.
const HERO_HEAD = 1.5; // head radius multiplier vs the plain stickman
type Patch = { phi: number; width: number; theta0: number; height: number; r: number };
const HERO_PATCH: Record<'front' | 'right' | 'back' | 'left', Patch> = {
  front: { phi: Math.PI, width: 2.3, theta0: Math.PI * 0.1, height: Math.PI * 0.82, r: 1.012 },
  right: { phi: Math.PI / 2, width: 1.7, theta0: Math.PI * 0.08, height: Math.PI * 0.84, r: 1.0 },
  left: { phi: Math.PI * 1.5, width: 1.7, theta0: Math.PI * 0.08, height: Math.PI * 0.84, r: 1.0 },
  back: { phi: 0, width: 2.3, theta0: Math.PI * 0.06, height: Math.PI * 0.86, r: 0.994 },
};
// A sphere patch whose UVs address one atlas tile. Cached: the mapping only
// depends on the patch and tile, never on which hero wears it.
function heroPatchGeo(which: keyof typeof HERO_PATCH, tile: number, R: number) {
  return cached(`hero:${which}:${tile}`, () => {
    const p = HERO_PATCH[which];
    const g = new THREE.SphereGeometry(R * p.r, 28, 20, p.phi - p.width / 2, p.width, p.theta0, p.height);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const tx = tile % ATLAS_COLS;
    const ty = Math.floor(tile / ATLAS_COLS);
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (tx + uv.getX(i)) / ATLAS_COLS, (ATLAS_ROWS - 1 - ty + uv.getY(i)) / ATLAS_ROWS);
    }
    uv.needsUpdate = true;
    return g;
  });
}
// Which atlas tile a mood wears.
function heroTile(mood: Mood): number {
  switch (mood) {
    case 'happy':
    case 'smug':
      return TILE.smile;
    case 'laugh':
    case 'wink':
    case 'sleepy':
    case 'dead':
      return TILE.laugh;
    case 'angry':
    case 'hurt':
      return TILE.angry;
    case 'shock':
    case 'scared':
      return TILE.shock;
    default:
      return TILE.neutral;
  }
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

// Concatenate geometries into one non-indexed geometry with per-part colours.
function mergeColored(parts: [THREE.BufferGeometry, string][]) {
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
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// One cartoon eye: white sclera with black lids above and below that slide
// and tilt to make expressions, plus an X for dead.
class Eye {
  readonly group = new THREE.Group();
  private sclera: THREE.Mesh;
  private upper: THREE.Mesh;
  private lower: THREE.Mesh;
  private x: THREE.Group;
  private inner: 1 | -1; // which way (z) the nose is

  constructor(inner: 1 | -1, scale: number) {
    this.inner = inner;
    this.sclera = mesh(cached('eye', () => new THREE.SphereGeometry(0.06, 14, 10)), WHITE);
    this.sclera.scale.set(0.35, 1, 0.82);
    const lidGeo = cached('lid', () => new THREE.BoxGeometry(0.05, 0.08, 0.16));
    this.upper = mesh(lidGeo, BLACK);
    this.lower = mesh(lidGeo, BLACK);
    this.x = new THREE.Group();
    for (const r of [0.78, -0.78]) {
      const bar = mesh(cached('xbar', () => new THREE.BoxGeometry(0.02, 0.11, 0.022)), WHITE);
      bar.rotation.x = r;
      this.x.add(bar);
    }
    this.group.add(this.sclera, this.upper, this.lower, this.x);
    this.group.scale.setScalar(scale);
  }

  setGlow(mat: THREE.Material | null) {
    this.sclera.material = mat ?? WHITE;
  }

  // Lid positions in sclera units: upper drops from 0.11 (open) toward 0;
  // tilt > 0 lowers the inner corner (angry), < 0 the outer (sad).
  set(mood: Mood, t: number, winkEye = false) {
    let up = 0.085;
    let tilt = 0.32;
    let low = -0.11;
    let size = 1;
    let dead = false;
    switch (mood) {
      case 'angry':
        up = 0.055;
        tilt = 0.6;
        break;
      case 'happy':
        up = 0.12;
        low = -0.035;
        tilt = 0;
        break;
      case 'laugh':
        up = 0.12;
        low = -0.02 + Math.sin(t * 18) * 0.008;
        tilt = 0;
        break;
      case 'hurt':
        up = 0.03;
        low = -0.06;
        tilt = 0.45;
        break;
      case 'sad':
        up = 0.06;
        tilt = -0.55;
        break;
      case 'shock':
        up = 0.14;
        tilt = 0;
        size = 1.25;
        break;
      case 'dead':
        dead = true;
        break;
      case 'smug': // heavy lids, a touch of attitude
        up = 0.035;
        tilt = 0.18;
        low = -0.075;
        break;
      case 'sleepy': // lids sink and drift open again
        up = 0.012 + Math.max(0, Math.sin(t * 0.9)) * 0.03;
        tilt = -0.2;
        low = -0.05;
        break;
      case 'scared':
        up = 0.14;
        tilt = -0.35;
        size = 1.3 + Math.sin(t * 30) * 0.03;
        break;
      case 'wink': // one eye shut (the front eye), the other happy
        up = winkEye ? 0.0 : 0.11;
        low = winkEye ? -0.01 : -0.04;
        tilt = 0;
        break;
      default:
        // Idle blink every few seconds.
        if ((t % 4.3) < 0.12) up = 0.0;
        break;
    }
    this.sclera.visible = !dead;
    this.upper.visible = !dead;
    this.lower.visible = !dead;
    this.x.visible = dead;
    this.sclera.scale.set(0.35, size, 0.82 * size);
    this.upper.position.set(0.01, up + 0.04, 0);
    this.upper.rotation.x = tilt * this.inner;
    this.lower.position.set(0.01, low - 0.04, 0);
  }
}

export class StickmanRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // pivot at the hip; tumbles on death
  private hips = new THREE.Group(); // yawed toward camera
  private torso = new THREE.Group(); // +x along the spine
  private head = new THREE.Group(); // upright frame at the head centre
  private face = new THREE.Group();
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
  private headMat: THREE.MeshPhongMaterial;
  private cosmetics = new THREE.Group();
  private eyes: Eye[] = [];
  private mouthOpen: THREE.Mesh;
  private mouthLine: THREE.Mesh;
  private flagProp: THREE.Group;
  private shieldBubble: THREE.Mesh;
  private shadow: THREE.Mesh;
  private flutter: THREE.Object3D[] = [];
  private lookKey = '';
  private trail = '#FFFFFF';
  // Hero character (real-face chibi): the front patch swaps with the mood.
  private hero: { front: THREE.Mesh; tile: number } | null = null;
  // Smoothed blends so every state change eases instead of snapping.
  private aimBlend = 0;
  private gestBlend = 0;
  private lastGesture: Gesture | null = null;
  private sadBlend = 0;
  // Arrows stuck in this body are parented here so they tumble with it.
  readonly stuckMount = new THREE.Group();

  constructor(look: Look) {
    this.bodyMat = new THREE.MeshLambertMaterial({ color: BODY_BLACK });
    this.headMat = new THREE.MeshPhongMaterial({ color: BODY_BLACK, shininess: 60, specular: new THREE.Color(0x444444) });

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
    const skull = mesh(cached('head', () => new THREE.SphereGeometry(headR, 22, 16)), this.headMat);
    this.head.add(skull, this.face, this.cosmetics);
    this.torso.add(this.head);

    // Face: eyes sit on the front of the head, turned with its surface.
    for (const [z, inner, s] of [
      [headR * 0.4, -1, 1.05],
      [-headR * 0.34, 1, 0.9],
    ] as const) {
      const e = new Eye(inner, s);
      const theta = Math.atan2(z, headR * 0.84);
      e.group.position.set(Math.cos(theta) * headR * 0.92, headR * 0.16, z);
      e.group.rotation.y = -theta;
      this.eyes.push(e);
      this.face.add(e.group);
    }
    this.mouthOpen = mesh(
      cached('mouthOpen', () => {
        const g = new THREE.CircleGeometry(0.07, 14, Math.PI, Math.PI);
        g.rotateY(Math.PI / 2);
        return g;
      }),
      WHITE,
    );
    this.mouthOpen.position.set(headR * 0.93, -headR * 0.32, headR * 0.12);
    this.mouthOpen.rotation.y = -0.2;
    this.mouthLine = mesh(cached('mouthLine', () => new THREE.BoxGeometry(0.01, 0.012, 0.09)), WHITE);
    this.mouthLine.position.set(headR * 0.95, -headR * 0.38, headR * 0.1);
    this.face.add(this.mouthOpen, this.mouthLine);

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

    // Bowstring (tip → nock → tip)
    this.stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const str = new THREE.Line(this.stringGeo, new THREE.LineBasicMaterial({ color: '#F2F2F2', transparent: true, opacity: 0.9 }));
    str.frustumCulled = false;
    str.position.z = 0.06;
    this.arms.add(str);

    this.nocked = makeArrow(look.trail);
    this.arms.add(this.nocked);

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

  get trailColor() {
    return this.trail;
  }

  setLook(look: Look) {
    if (look.key === this.lookKey) return;
    this.lookKey = look.key;
    this.trail = look.trail;
    this.cosmetics.clear();
    this.flutter = [];
    this.buildBow(look);
    this.buildQuiver(look);
    this.buildHat(look);
    this.buildHero(look);
    // A hero head replaces the cartoon eyes and mouth entirely.
    this.face.visible = look.hat !== 'face';
    const glow = look.eyes ? new THREE.MeshBasicMaterial({ color: look.eyes }) : null;
    for (const e of this.eyes) e.setGlow(glow);

    // Nocked arrow takes the trail colour for its fletching
    this.arms.remove(this.nocked);
    this.nocked = makeArrow(look.trail);
    this.arms.add(this.nocked);
  }

  private buildBow(look: Look) {
    this.bow.clear();
    const limbGeo = cached('bowArc', () => {
      const g = new THREE.TorusGeometry(BOW_R, 0.022, 6, 24, BOW_HALF * 2);
      g.rotateZ(-BOW_HALF);
      g.translate(-BOW_R, 0, 0);
      return g;
    });
    const metal = look.bowColor === '#C9A227' ? 0.8 : 0.1;
    this.bow.add(mesh(limbGeo, glossy(look.bowColor, { rough: 0.35, metal, glow: look.bowGlow ? 0.35 : 0 })));
    this.bow.add(mesh(cached('bowGrip', () => new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8)), glossy(look.bowAccent)));
    for (const s of [1, -1]) {
      const cap = mesh(cached('bowCap', () => new THREE.SphereGeometry(0.035, 8, 6)), glossy(look.bowAccent, { glow: look.bowGlow ? 1.2 : 0 }));
      cap.position.set(-BOW_R + BOW_R * Math.cos(BOW_HALF), s * BOW_R * Math.sin(BOW_HALF), 0);
      this.bow.add(cap);
    }
  }

  private buildQuiver(look: Look) {
    this.torso.children.filter((c) => c.userData.quiver).forEach((c) => this.torso.remove(c));
    const quiver = new THREE.Group();
    quiver.add(mesh(cached('quiver', () => new THREE.CylinderGeometry(0.075, 0.06, 0.5, 10)), glossy('#3A2A1E', { rough: 0.7 })));
    const band = mesh(cached('qband', () => new THREE.CylinderGeometry(0.079, 0.079, 0.05, 10)), glossy(look.banner));
    band.position.y = 0.15;
    quiver.add(band);
    for (let i = 0; i < 3; i++) {
      const f = mesh(cached('qfl', () => new THREE.ConeGeometry(0.03, 0.12, 4)), glossy(look.trail, { rough: 0.6 }));
      f.position.set((i - 1) * 0.035, 0.3, (i % 2) * 0.02);
      quiver.add(f);
    }
    quiver.userData.quiver = true;
    // Torso space: +x runs up the spine, +y points behind the archer.
    quiver.rotation.set(0, 0, -Math.PI / 2 - 0.35);
    quiver.position.set(BODY.torso * 0.62, 0.09, 0);
    this.torso.add(quiver);
  }

  // Dress the rig as a hero: chibi head wrapped in its atlas, mitten hands,
  // chunky boots and a chest strap, like the character sheets. Everything
  // added here carries userData.hero so the next look can strip it.
  private buildHero(look: Look) {
    const { torso, neck, headR, shin, foreArm, torsoR } = BODY;
    const strip = (g: THREE.Object3D) => g.children.filter((c) => c.userData.hero).forEach((c) => g.remove(c));
    for (const g of [this.head, this.torso, this.shinF, this.shinB, this.foreBow, this.foreDraw]) strip(g);
    this.hero = null;
    this.head.position.x = torso + neck + headR * 0.92;
    if (look.hat !== 'face' || !look.face) return;

    const face = look.face;
    const def = FACES[face];
    const R = headR * HERO_HEAD;
    this.head.position.x = torso + neck + R * 0.95;
    const tag = (o: THREE.Object3D) => {
      o.userData.hero = true;
      return o;
    };
    const skin = new THREE.MeshBasicMaterial({ map: faceTexture(face), alphaTest: 0.45 });
    // Base skull in the hero's hair/skin colour, under the patches.
    this.head.add(tag(mesh(cached(`heroSkull:${HERO_HEAD}`, () => new THREE.SphereGeometry(R * 0.985, 28, 20)), glossy(def.base, { rough: 0.7 }))));
    const tile = TILE.neutral;
    const front = tag(mesh(heroPatchGeo('front', tile, R), skin)) as THREE.Mesh;
    this.head.add(front);
    this.head.add(tag(mesh(heroPatchGeo('right', TILE.right, R), skin)));
    this.head.add(tag(mesh(heroPatchGeo('left', TILE.left, R), skin)));
    this.head.add(tag(mesh(heroPatchGeo('back', TILE.back, R), skin)));
    this.hero = { front, tile };

    // Body: mitten hands, chunky boots, leather chest strap.
    const black = glossy('#141417', { rough: 0.6 });
    for (const fore of [this.foreBow, this.foreDraw]) {
      const hand = tag(mesh(cached('heroHand', () => new THREE.SphereGeometry(0.052, 10, 8)), black));
      hand.position.x = foreArm;
      fore.add(hand);
    }
    for (const sh of [this.shinF, this.shinB]) {
      const boot = tag(mesh(cached('heroBoot', () => new THREE.SphereGeometry(0.075, 12, 8)), black));
      boot.scale.set(0.9, 1.25, 1.1);
      boot.position.set(shin + 0.01, 0.03, 0);
      sh.add(boot);
    }
    const strap = tag(mesh(cached('heroStrap', () => new THREE.TorusGeometry(torsoR * 1.25, 0.014, 6, 28)), glossy('#5A3A22', { rough: 0.8 })));
    strap.rotation.set(0, Math.PI / 2, 0.55);
    strap.position.x = torso * 0.55;
    this.torso.add(strap);
  }

  private buildHat(look: Look) {
    const hr = BODY.headR;
    const acc = glossy(look.hatColor);
    const add = (...o: THREE.Object3D[]) => this.cosmetics.add(...o);
    switch (look.hat) {
      case 'cap': {
        const dome = mesh(new THREE.SphereGeometry(hr * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), acc);
        dome.position.y = hr * 0.12;
        const brim = mesh(new THREE.CylinderGeometry(hr * 0.75, hr * 0.75, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), glossy('#1B1B1B'));
        brim.position.set(-hr * 0.7, hr * 0.2, 0);
        add(dome, brim);
        break;
      }
      case 'helmet': {
        const dome = mesh(new THREE.SphereGeometry(hr * 1.14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), glossy(look.hatColor, { rough: 0.8 }));
        dome.position.y = hr * 0.05;
        const rim = mesh(new THREE.TorusGeometry(hr * 1.12, 0.022, 6, 24), glossy('#3E4A26', { rough: 0.8 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = hr * 0.08;
        add(dome, rim);
        // Camo blotches
        const blot = [glossy('#3E4A26', { rough: 0.9 }), glossy('#8A7B4A', { rough: 0.9 }), glossy('#2A2A1A', { rough: 0.9 })];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const el = 0.35 + (i % 3) * 0.25;
          const b = mesh(cached('blot', () => new THREE.SphereGeometry(0.05, 6, 4)), blot[i % 3]);
          b.scale.set(1.4, 0.35, 1);
          b.position.set(Math.cos(a) * Math.cos(el) * hr * 1.13, hr * 0.05 + Math.sin(el) * hr * 1.13, Math.sin(a) * Math.cos(el) * hr * 1.13);
          b.lookAt(0, 0, 0);
          add(b);
        }
        break;
      }
      case 'viking': {
        const steel = glossy(look.hatColor, { metal: 0.85, rough: 0.3 });
        const dome = mesh(new THREE.SphereGeometry(hr * 1.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
        dome.position.y = hr * 0.1;
        const nose = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.035), steel);
        nose.position.set(hr * 1.08, 0, 0.0);
        add(dome, nose);
        for (const s of [1, -1]) {
          const horn = mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12, Math.PI * 0.6), glossy('#F1E3C6', { rough: 0.4 }));
          horn.position.set(0, hr * 0.55, s * hr * 0.95);
          horn.rotation.set(0, s > 0 ? 0 : Math.PI, 0.3);
          add(horn);
        }
        break;
      }
      case 'dragon': {
        const purple = glossy(look.hatColor, { rough: 0.35 });
        const dome = mesh(new THREE.SphereGeometry(hr * 1.2, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), purple);
        dome.position.y = hr * 0.02;
        const snout = mesh(new THREE.ConeGeometry(0.12, 0.26, 6), purple);
        snout.rotation.z = -Math.PI / 2;
        snout.position.set(hr * 1.15, hr * 0.42, 0);
        add(dome, snout);
        const gold = glossy('#E9C46A', { metal: 0.7, rough: 0.3 });
        for (const s of [1, -1]) {
          const horn = mesh(new THREE.ConeGeometry(0.045, 0.32, 8), gold);
          horn.position.set(-hr * 0.35, hr * 1.05, s * hr * 0.5);
          horn.rotation.set(s * 0.4, 0, 0.9);
          add(horn);
        }
        for (let i = 0; i < 4; i++) {
          const fin = mesh(new THREE.ConeGeometry(0.04, 0.14, 4), glossy('#FF5AF1', { glow: 0.6 }));
          fin.position.set(-hr * (0.2 + i * 0.3), hr * (1.15 - i * 0.18), 0);
          fin.rotation.z = 0.6 + i * 0.25;
          add(fin);
        }
        break;
      }
      case 'crown': {
        const gold = glossy(look.hatColor, { metal: 0.9, rough: 0.2, glow: 0.12 });
        const band = mesh(new THREE.CylinderGeometry(hr * 0.8, hr * 0.85, 0.1, 14, 1, true), gold);
        band.position.y = hr * 0.95;
        add(band);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const spike = mesh(new THREE.ConeGeometry(0.035, 0.12, 4), gold);
          spike.position.set(Math.cos(a) * hr * 0.8, hr * 0.95 + 0.1, Math.sin(a) * hr * 0.8);
          const gem = mesh(new THREE.SphereGeometry(0.02, 6, 4), glossy('#9D0208', { glow: 0.5 }));
          gem.position.set(Math.cos(a) * hr * 0.85, hr * 0.95, Math.sin(a) * hr * 0.85);
          add(spike, gem);
        }
        break;
      }
      case 'horns': {
        for (const s of [1, -1]) {
          const horn = mesh(new THREE.ConeGeometry(0.05, 0.26, 8), glossy(look.hatColor, { rough: 0.25 }));
          horn.position.set(0.02, hr * 0.85, s * hr * 0.6);
          horn.rotation.set(s * 0.5, 0, -0.35);
          add(horn);
        }
        break;
      }
      case 'halo': {
        const halo = mesh(new THREE.TorusGeometry(hr * 0.85, 0.022, 8, 28), glossy(look.hatColor, { glow: 1.6 }));
        halo.rotation.x = Math.PI / 2;
        halo.position.y = hr * 1.6;
        halo.userData.bob = true;
        this.flutter.push(halo);
        for (const s of [1, -1]) {
          const wing = mesh(new THREE.SphereGeometry(0.16, 10, 8), glossy('#FFFFFF', { rough: 0.6, glow: 0.25 }));
          wing.scale.set(0.35, 1, 0.12);
          wing.position.set(-0.05, -BODY.torso * 0.45, s * 0.14);
          wing.rotation.set(s * 0.6, 0, 0.5);
          wing.userData.wing = s;
          this.flutter.push(wing);
          add(wing);
        }
        add(halo);
        break;
      }
      case 'hood': {
        const hood = mesh(new THREE.SphereGeometry(hr * 1.14, 16, 12, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.62), acc);
        hood.rotation.y = Math.PI;
        const peak = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), acc);
        peak.position.set(-hr * 0.9, hr * 0.55, 0);
        peak.rotation.z = 1.2;
        add(hood, peak);
        break;
      }
      case 'visor': {
        const visor = mesh(
          new THREE.CylinderGeometry(hr * 1.04, hr * 1.04, 0.075, 18, 1, true, -Math.PI * 0.4, Math.PI * 0.8),
          glossy(look.hatColor, { glow: 1.4, rough: 0.1 }),
        );
        visor.rotation.y = Math.PI / 2;
        visor.position.y = hr * 0.18;
        const band = mesh(new THREE.TorusGeometry(hr * 1.02, 0.018, 6, 24), glossy('#1B2B34', { metal: 0.6 }));
        band.rotation.x = Math.PI / 2;
        band.position.y = hr * 0.18;
        add(visor, band);
        break;
      }
      case 'headband':
      case 'bandana': {
        const band = mesh(new THREE.TorusGeometry(hr * 0.98, look.hat === 'bandana' ? 0.035 : 0.022, 8, 24), acc);
        band.rotation.x = Math.PI / 2;
        band.position.y = hr * 0.38;
        add(band);
        for (const s of [1, -1]) {
          const tail = mesh(new THREE.BoxGeometry(look.hat === 'bandana' ? 0.2 : 0.26, 0.04, 0.012), acc);
          tail.geometry.translate(-0.1, 0, 0);
          tail.position.set(-hr * 0.95, hr * 0.33, s * 0.03);
          tail.userData.tail = s;
          this.flutter.push(tail);
          add(tail);
        }
        break;
      }
      default:
        break;
    }
  }

  // Place every bone for this frame. `t` = time (s), `dt` = frame step.
  update(p: RigPose, t: number, dt = 1 / 60) {
    const f = p.facing;
    const d = p.death;
    this.root.rotation.y = f === 1 ? 0 : Math.PI;
    const limp = d ? Math.min(1, d.t * 3) : 0;
    const k = 1 - Math.exp(-dt * 8);

    // Blends: aim raises the bow; gestures and defeat take over the arms.
    const aiming = p.ready || p.draw > 0.02;
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * k;
    if (p.gesture) this.lastGesture = p.gesture;
    this.gestBlend += ((p.gesture ? 1 : 0) - this.gestBlend) * k;
    this.sadBlend += ((p.mood === 'sad' && !p.gesture ? 1 : 0) - this.sadBlend) * k;
    const g = this.gestBlend;
    const gt = p.gestureT;
    const gesture = p.gesture ?? this.lastGesture;

    // Root / tumble / walk-in / drop
    const walkOff = -f * p.walk;
    let bounce = 0;
    if (p.walk > 0) bounce = Math.abs(Math.sin(p.stepT * Math.PI)) * 0.05;
    if (gesture === 'cheer') bounce += g * Math.abs(Math.sin(gt * 7)) * 0.32;
    if (gesture === 'laugh') bounce += g * Math.abs(Math.sin(gt * 14)) * 0.04;
    if (gesture === 'dance') bounce += g * Math.abs(Math.sin(gt * 6)) * 0.12;
    if (gesture === 'flex') bounce += g * Math.max(0, Math.sin(gt * 5)) * 0.03;
    if (d) {
      this.root.position.set(d.x, d.y - (HIP_Y - 0.1) * Math.abs(Math.sin(d.rot)) * (d.landed ? 1 : 0.4), 0);
      // World spin d.rot, expressed in the (possibly flipped) root frame.
      this.body.rotation.z = d.rot * f;
    } else {
      // Hit stagger: a small shove back that springs out.
      const shove = -f * p.flinch * 0.12;
      this.root.position.set(p.x + walkOff + shove, p.y, 0);
      this.body.rotation.z = 0;
    }
    this.body.position.y = HIP_Y + bounce;
    this.shadow.visible = !d || d.landed;
    this.shadow.scale.setScalar(1 - Math.min(0.5, bounce));

    // Hit flash and shield shimmer
    this.bodyMat.emissive.setRGB(p.flash * 0.9, p.flash * 0.25, p.flash * 0.25);
    this.headMat.emissive.copy(this.bodyMat.emissive);
    const sb = this.shieldBubble.material as THREE.MeshBasicMaterial;
    sb.opacity = p.shieldFlash * 0.55;
    this.shieldBubble.visible = p.shieldFlash > 0.01;
    this.shieldBubble.rotation.y = t * 1.5;
    this.shieldBubble.scale.set(0.75 + (1 - p.shieldFlash) * 0.25, 1.2 + (1 - p.shieldFlash) * 0.3, 0.75 + (1 - p.shieldFlash) * 0.25);

    // Legs: planted stance, walk cycle, stomp, loose flail while dead
    const flail = (n: number) => (d && !d.landed ? Math.sin(d.t * 14 + n) * 0.9 : 0);
    const splay = d && d.landed ? 0.5 : 0;
    const walking = p.walk > 0 ? 1 : 0;
    const stride = Math.sin(p.stepT * Math.PI * 2) * 0.55 * walking;
    const stomp = gesture === 'stomp' ? g * Math.max(0, Math.sin(gt * 9)) * 0.8 : gesture === 'dance' ? g * Math.max(0, Math.sin(gt * 6)) * 0.5 : 0;
    const cheerKick = gesture === 'cheer' ? g * Math.max(0, Math.sin(gt * 7)) * 0.4 : 0;
    this.hips.rotation.y = -YAW * (1 - limp);
    this.thighF.rotation.z = -Math.PI / 2 + 0.3 * (1 - walking) + stride + flail(0) * limp + splay + stomp + cheerKick;
    this.shinF.rotation.z = -0.12 - Math.max(0, -stride) * 0.8 - stomp * 0.9 - cheerKick + Math.abs(flail(1)) * 0.5 * limp;
    this.thighB.rotation.z = -Math.PI / 2 - 0.26 * (1 - walking) - stride + flail(2) * limp - splay - cheerKick;
    this.shinB.rotation.z = -0.28 - Math.max(0, stride) * 0.8 - cheerKick + Math.abs(flail(3)) * 0.5 * limp;

    // Torso lean: breathe, lean into the draw, recoil on hit, emote lean
    const breathe = d ? 0 : Math.sin(t * 2.1) * 0.025;
    let gLean = 0;
    let headTilt = 0;
    if (gesture === 'laugh') {
      gLean = -0.25 - Math.sin(gt * 14) * 0.08;
      headTilt = 0.35;
    } else if (gesture === 'facepalm' || gesture === 'cry') {
      gLean = 0.2;
      headTilt = -0.3 + Math.sin(gt * (gesture === 'cry' ? 22 : 6)) * 0.08;
    } else if (gesture === 'cheer') {
      gLean = -0.1;
      headTilt = 0.3;
    } else if (gesture === 'stomp') {
      gLean = 0.12;
      headTilt = -0.1;
    } else if (gesture === 'shrug') {
      headTilt = Math.sin(gt * 3) * 0.15;
    } else if (gesture === 'bow') {
      // Fold forward, hold, rise.
      const k = Math.sin(Math.min(1, gt / 2.0) * Math.PI);
      gLean = 0.9 * Math.min(1, k * 1.6);
      headTilt = -0.2 * k;
    } else if (gesture === 'flex') {
      gLean = -0.08;
      headTilt = 0.15 + Math.sin(gt * 5) * 0.05;
    } else if (gesture === 'think') {
      gLean = 0.06;
      headTilt = 0.25 + Math.sin(gt * 1.6) * 0.12;
    } else if (gesture === 'salute') {
      gLean = -0.05;
    } else if (gesture === 'dance') {
      gLean = Math.sin(gt * 6) * 0.14;
      headTilt = Math.sin(gt * 6 + 1) * 0.3;
    } else if (gesture === 'yawn') {
      const k = Math.sin((gt / 2.4) * Math.PI);
      gLean = -0.18 * k;
      headTilt = 0.5 * k;
    }
    // Sad (defeat): head hangs, shoulders slump.
    const sad = this.sadBlend;
    const lean =
      (p.draw * 0.12 + p.flinch * 0.45 + breathe) * (1 - g) +
      gLean * g +
      sad * 0.22 +
      flail(4) * 0.3 * limp +
      (p.walk > 0 ? -0.06 : 0);
    // lean > 0 tips the spine backward (+x toward the archer's back).
    this.torso.rotation.z = Math.PI / 2 + lean;
    const idleLook = d ? 0 : Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.02;
    this.head.rotation.z = -Math.PI / 2 - lean * 0.3 + idleLook * (1 - g) + headTilt * g - sad * 0.55 - p.flinch * 0.3;

    // Face
    this.eyes.forEach((e, i) => e.set(p.mood, t, i === 0));
    const mouthOpen = p.mood === 'laugh' ? 1 + Math.sin(t * 18) * 0.25 : p.mood === 'shock' ? 0.6 : p.mood === 'hurt' ? 0.5 : p.mood === 'happy' ? 0.55 : p.mood === 'scared' ? 0.45 + Math.sin(t * 26) * 0.08 : p.mood === 'wink' ? 0.35 : p.gesture === 'yawn' ? Math.max(0, Math.sin((p.gestureT / 2.4) * Math.PI)) * 1.3 : 0;
    this.mouthOpen.visible = mouthOpen > 0;
    if (this.hero) {
      const tile = heroTile(p.mood);
      if (tile !== this.hero.tile) {
        this.hero.tile = tile;
        this.hero.front.geometry = heroPatchGeo('front', tile, BODY.headR * HERO_HEAD);
      }
    }
    this.mouthOpen.scale.set(1, mouthOpen, 1);
    this.mouthLine.visible = p.mood === 'angry' || p.mood === 'sad' || p.mood === 'smug' || p.mood === 'sleepy';
    this.mouthLine.rotation.x = p.mood === 'sad' ? 0.25 : p.mood === 'smug' ? -0.28 : 0;

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
    if (d) a = -1.2 + flail(5) * 0.6;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const aimHand = { x: cosA * ARM_REACH, y: sinA * ARM_REACH };
    const pull = STRING_REST + p.draw * 0.62;
    const lift = p.draw * 0.06;
    const aimNock = { x: aimHand.x - cosA * pull - sinA * lift, y: aimHand.y - sinA * pull + cosA * lift };
    // Relaxed: bow held low and forward, other hand hanging.
    const relaxBow = { x: 0.16, y: -0.48 + Math.sin(t * 2.1) * 0.01 };
    const relaxDraw = { x: -0.06, y: -0.52 };
    const ab = d ? 0 : this.aimBlend;
    let bowHand = lerp2(relaxBow, aimHand, ab);
    // After a release the string hand flows back past the chin.
    const follow = { x: -0.22, y: 0.1 };
    let drawHand = lerp2(relaxDraw, lerp2(aimNock, follow, rc), ab);
    if (p.walk > 0) {
      bowHand = { x: bowHand.x - stride * 0.15, y: bowHand.y };
      drawHand = { x: drawHand.x + stride * 0.15, y: drawHand.y };
    }
    if (g > 0.001 && gesture && !d) {
      const gp = gesturePose(gesture, gt);
      bowHand = lerp2(bowHand, gp.bow, g);
      drawHand = lerp2(drawHand, gp.draw, g);
    }
    if (sad > 0.001 && !d) {
      bowHand = lerp2(bowHand, { x: 0.05, y: -0.55 }, sad);
      drawHand = lerp2(drawHand, { x: -0.02, y: -0.56 }, sad);
    }

    // Bow arm: elbow bends down/out; draw arm: elbow up/behind when drawing.
    ik(this.upperBow, this.foreBow, sx, sy, sx + bowHand.x, sy + bowHand.y, BODY.upperArm, BODY.foreArm, -1);
    ik(this.upperDraw, this.foreDraw, sx, sy, sx + drawHand.x, sy + drawHand.y, BODY.upperArm, BODY.foreArm, -1);
    const hx = sx + bowHand.x;
    const hy = sy + bowHand.y;
    const nx = sx + drawHand.x;
    const ny = sy + drawHand.y;

    // Bow: perpendicular to the aim when raised, limbs vertical when held low.
    const bowRot = lerpAngle(-0.25, a, ab);
    this.bow.position.set(hx, hy, 0.06);
    this.bow.rotation.z = bowRot;
    const cosB = Math.cos(bowRot);
    const sinB = Math.sin(bowRot);

    // Bowstring through the nock while drawn, straight otherwise
    const tipBack = -BOW_R + BOW_R * Math.cos(BOW_HALF);
    const tipUp = BOW_R * Math.sin(BOW_HALF);
    const pos = this.stringGeo.getAttribute('position') as THREE.BufferAttribute;
    const tx = (lx: number, ly: number) => hx + lx * cosB - ly * sinB;
    const ty = (lx: number, ly: number) => hy + lx * sinB + ly * cosB;
    const drawn = p.draw > 0.01 && !d && ab > 0.5;
    // Twang: the released string vibrates around its rest line.
    const twang = Math.sin(t * 75) * 0.05 * rc;
    pos.setXYZ(0, tx(tipBack, tipUp), ty(tipBack, tipUp), 0);
    pos.setXYZ(1, drawn ? nx : tx(tipBack + twang, 0), drawn ? ny : ty(tipBack + twang, 0), 0);
    pos.setXYZ(2, tx(tipBack, -tipUp), ty(tipBack, -tipUp), 0);
    pos.needsUpdate = true;

    // Nocked arrow sits on the string
    this.nocked.visible = p.showNocked && !d && ab > 0.6;
    this.nocked.position.set(nx + cosA * ARROW_LEN, ny + sinA * ARROW_LEN, 0.06);
    this.nocked.rotation.z = a;

    // Surrender flag rides the draw hand
    this.flagProp.visible = gesture === 'flag' && g > 0.3 && !d;
    if (this.flagProp.visible) {
      this.flagProp.position.set(nx, ny - 0.3, -0.06);
      const cloth = this.flagProp.children[1];
      cloth.rotation.y = Math.sin(t * 8) * 0.4;
    }

    // Cosmetic flutter
    for (const o of this.flutter) {
      if (o.userData.bob) o.position.y = BODY.headR * 1.6 + Math.sin(t * 2.4) * 0.02;
      if (o.userData.tail) {
        o.rotation.z = 0.6 + Math.sin(t * 7 + o.userData.tail) * 0.25;
        o.rotation.y = Math.sin(t * 5.3 + o.userData.tail * 2) * 0.3;
      }
      if (o.userData.wing) o.rotation.x = o.userData.wing * (0.6 + Math.sin(t * 3) * 0.2);
    }
  }
}

type V2 = { x: number; y: number };

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
    case 'wave':
      return { bow: { x: 0.14, y: -0.48 }, draw: { x: 0.12 + Math.sin(t * 12) * 0.14, y: 0.5 } };
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
      const k = Math.sin((t / 2.4) * Math.PI);
      return { bow: { x: 0.34, y: 0.1 + k * 0.5 }, draw: { x: -0.26, y: 0.1 + k * 0.5 } };
    }
  }
}

function lerp2(a: V2, b: V2, k: number): V2 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
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
