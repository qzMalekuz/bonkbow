import * as THREE from 'three';
import type { FaceId } from '@/game/faces';
import type { Mood } from '@/game3d/sim';
import { HERO_ASSETS } from '@/game3d/heroAssets';
import { decodeBody, type EncodedBody } from '@/game3d/HeroMesh';
import type { StickmanData } from '@/game3d/StickmanBody';

// A hero's head is the character sheet's own drawing (archer-boys.pdf):
// heroes are shown from four sides, and scripts/heroes/sprites.py cuts each
// side — front once per facial expression, then right, back, left — into an
// atlas of tiles that all share one head frame (eyes, axis and scale line
// up). Here that atlas goes on an upright card that turns to face the
// camera and shows the tile for the side the head is seen from. Changing
// expression crossfades two tiles; changing side flips the card (edge-on,
// swap, back), so there is never a see-through double head. One draw.
//
// Head space (units of the head, the sheet's eye gap = 0.76): +x = face
// forward, +y = up, +z = the archer's right; `chin` is the chin's height.

type Meta = { tiles: string[]; cols: number; rows: number; tile: number; px: number; top: number; chin: number };

export function heroBody(id: FaceId): StickmanData {
  let b = bodies.get(id);
  if (!b) {
    b = decodeBody(HERO_ASSETS[id].body as EncodedBody);
    bodies.set(id, b);
  }
  return b;
}
const bodies = new Map<FaceId, StickmanData>();

// Which sheet expression each mood shows, best first; the first one the
// hero's sheet has wins. Aiming at full draw squints one eye (the wink).
const MOOD_FACE: Record<Mood | 'focus', string[]> = {
  neutral: ['neutral'],
  happy: ['smile', 'neutral'],
  laugh: ['smile', 'neutral'],
  smug: ['smile', 'neutral'],
  wink: ['wink', 'smile', 'neutral'],
  angry: ['angry', 'stern', 'neutral'],
  hurt: ['stern', 'angry', 'shock', 'neutral'],
  sad: ['neutral'],
  shock: ['shock', 'neutral'],
  scared: ['shock', 'neutral'],
  dead: ['wink', 'neutral'],
  sleepy: ['neutral'],
  focus: ['wink', 'angry', 'neutral'],
};
// Resting face per hero: the sheet's idle look.
const REST: Partial<Record<FaceId, string>> = { akshay: 'smile', mit: 'smile' };

type Sheet = { tex: THREE.Texture; meta: Meta; index: Record<string, number> };
const sheets = new Map<FaceId, Sheet>();
function sheet(id: FaceId): Sheet {
  let s = sheets.get(id);
  if (!s) {
    const a = HERO_ASSETS[id];
    const meta = a.meta as Meta;
    const tex = new THREE.TextureLoader().load(a.heads as unknown as string);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const index: Record<string, number> = {};
    meta.tiles.forEach((t, i) => (index[t] = i));
    s = { tex, meta, index };
    sheets.set(id, s);
  }
  return s;
}

// Two atlas tiles (offsets in uv) mixed by `k`; straight alpha, sheet art
// is already lit; `flash` tints for the hit flash.
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 tileSize;
uniform vec2 offA;
uniform vec2 offB;
uniform float k;
uniform vec3 flash;
varying vec2 vUv;
void main() {
  vec4 a = texture2D(map, offA + vUv * tileSize);
  vec4 b = texture2D(map, offB + vUv * tileSize);
  vec4 c = mix(a, b, k);
  if (c.a < 0.02) discard;
  gl_FragColor = vec4(c.rgb + flash * c.a, c.a);
  #include <colorspace_fragment>
}`;

const FADE_SECONDS = 0.16;
const FLIP_SECONDS = 0.14;
const _cam = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export class HeroHead {
  readonly group = new THREE.Group();
  readonly chin: number;
  private card: THREE.Mesh;
  private turn = new THREE.Group(); // yaws the card toward the camera
  private mat: THREE.ShaderMaterial;
  private sheet: Sheet;
  private rest: string;
  private face: string; // the front tile the mood wants
  private side: 'front' | 'right' | 'back' | 'left' = 'front';
  private from = 0; // tile shown at k = 0
  private to = 0; // tile shown at k = 1
  private fade = 1;
  private flip = 1; // 0..1: side change in progress (the card turns edge-on, swaps, turns back)
  private flipTo = -1;

  // Sphere the hands keep out of, in the head group's parent space.
  readonly bounds: { center: THREE.Vector3; radius: number };

  constructor(id: FaceId, R: number) {
    const s = sheet(id);
    this.sheet = s;
    const m = s.meta;
    this.chin = m.chin;
    this.rest = REST[id] && s.index[REST[id]!] !== undefined ? REST[id]! : m.tiles[0];
    this.face = this.rest;
    this.from = this.to = s.index[this.rest];
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: s.tex },
        tileSize: { value: new THREE.Vector2(1 / m.cols, 1 / m.rows) },
        offA: { value: new THREE.Vector2() },
        offB: { value: new THREE.Vector2() },
        k: { value: 1 },
        flash: { value: new THREE.Color(0, 0, 0) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.setTiles();
    // The card: one tile, in head units, top edge at `top`, centred on the
    // head's axis; pushed toward the camera so the collar never cuts the chin.
    const size = m.tile / m.px;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.translate(0, m.top - size / 2, 0);
    this.card = new THREE.Mesh(geo, this.mat);
    this.card.position.z = 0.55;
    this.card.renderOrder = 1;
    this.card.onBeforeRender = (_r, _s, camera) => this.aim(camera);
    this.turn.add(this.card);
    this.group.add(this.turn);
    this.group.scale.setScalar(R);
    this.bounds = { center: new THREE.Vector3(0, 0.05 * R, 0), radius: 1.15 * R };
  }

  private setTiles() {
    const m = this.sheet.meta;
    const u = this.mat.uniforms;
    const off = (i: number, v: THREE.Vector2) => v.set((i % m.cols) / m.cols, 1 - (Math.floor(i / m.cols) + 1) / m.rows);
    off(this.from, u.offA.value);
    off(this.to, u.offB.value);
  }

  // Face the camera (about the head's own up axis) and pick the side tile.
  private aim(camera: THREE.Camera) {
    _inv.copy(this.group.matrixWorld).invert();
    _cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv);
    const az = Math.atan2(_cam.z, _cam.x); // 0 = camera in front of the face
    this.turn.rotation.y = Math.PI / 2 - az; // the card's +z toward the camera
    // This frame's draw uses the matrix three is about to read: update it now.
    this.turn.updateMatrixWorld(true);
    const a = Math.abs(az);
    // A little hysteresis so a camera sitting right on 45° doesn't flicker.
    const h = 0.06;
    const cur = this.side;
    const want = a < Math.PI / 4 ? 'front' : a > (3 * Math.PI) / 4 ? 'back' : az > 0 ? 'right' : 'left';
    const onEdge = Math.abs(a - Math.PI / 4) < h || Math.abs(a - (3 * Math.PI) / 4) < h;
    if (want !== cur && !onEdge) this.side = want;
    this.show();
  }

  private show() {
    const want = this.sheet.index[this.side === 'front' ? this.face : this.side];
    if (want === undefined || want === this.to || want === this.flipTo) return;
    // A different side has a different outline: crossfading the two would
    // show a see-through double head, so the card flips instead.
    const sideOf = (i: number) => (['right', 'back', 'left'].includes(this.sheet.meta.tiles[i]) ? this.sheet.meta.tiles[i] : 'front');
    if (sideOf(want) !== sideOf(this.to)) {
      this.flipTo = want;
      this.flip = 0;
      return;
    }
    if (want === this.from && this.fade < 1) {
      this.from = this.to;
      this.fade = 1 - this.fade;
    } else {
      this.from = this.fade < 0.5 ? this.from : this.to;
      this.fade = 0;
    }
    this.to = want;
    this.setTiles();
  }

  private pick(key: Mood | 'focus') {
    if (key === 'neutral') return this.rest;
    for (const name of MOOD_FACE[key]) if (this.sheet.index[name] !== undefined) return name;
    return this.rest;
  }

  // `focus` 0..1 = how hard the archer is aiming (the draw); `flash` = hit flash.
  update(mood: Mood, _t: number, dt: number, focus = 0, flash = 0) {
    this.face = this.pick(mood === 'neutral' && focus > 0.75 ? 'focus' : mood);
    this.show();
    if (this.flip < 1) {
      const was = this.flip;
      this.flip = Math.min(1, this.flip + dt / FLIP_SECONDS);
      if (was < 0.5 && this.flip >= 0.5 && this.flipTo >= 0) {
        this.from = this.to = this.flipTo; // swap while edge-on
        this.flipTo = -1;
        this.fade = 1;
        this.setTiles();
      }
    }
    this.card.scale.x = Math.max(0.02, Math.abs(Math.cos(this.flip * Math.PI)));
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / FADE_SECONDS);
    const k = this.fade;
    this.mat.uniforms.k.value = k * k * (3 - 2 * k);
    (this.mat.uniforms.flash.value as THREE.Color).setRGB(flash * 0.55, flash * 0.12, flash * 0.12);
  }

  dispose() {
    this.group.removeFromParent();
    this.mat.dispose(); // texture is shared and stays cached
  }
}
