import * as THREE from 'three';
import { mulberry32 } from '@/game/rng';
import { LEDGE_FRONT } from '@/game3d/world';
import type { Theme } from '@/game3d/themes';

// The 3D world around the duel, built imperatively from primitives and
// animated from the render loop. Each archer stands on a black cliff ledge
// with a banner; the map's set dressing (misty forest, rainy town,
// colosseum, or open landscape) fills the background, with fog doing the
// painterly depth and the dark foreground making the stickmen read as
// silhouettes — the look of the reference game, in 3D.
//
// Performance: static scenery is merged per material into a handful of
// meshes (Baker), there are no shadow maps (contact shadows live on the
// rigs), and only a few things animate (clouds, birds, weather, banners,
// torches, smoke, crowd, tree sway).
//
// Coordinates: x along the duel, y up, z toward the camera. The duel plane
// is z = 0; everything decorative stays out of the arrow's way.

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float moon;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
  col = mix(col, horizon * 0.85, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  float disc = smoothstep(0.9975, 0.999, s);
  float glow = pow(s, 12.0) * 0.45 + pow(s, 120.0) * 0.6;
  col += sunColor * (glow * (1.0 - moon * 0.6) + disc * (moon > 0.5 ? 0.9 : 1.4));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type ArcherSlot = { x: number; top: number; facing: 1 | -1; color: string };

type Mover = { o: THREE.Object3D; base: THREE.Vector3; speed: number; phase: number };
type TreeItem = { x: number; z: number; s: number; r: number; ph: number };

// Collects static meshes and merges them per material into single draws.
class Baker {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) {
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.getAttribute('position'));
    clean.setAttribute('normal', g.getAttribute('normal'));
    const list = this.buckets.get(mat) ?? [];
    list.push(clean);
    this.buckets.set(mat, list);
  }

  flush(into: THREE.Group) {
    for (const [mat, geos] of this.buckets) {
      const count = geos.reduce((n, g) => n + g.getAttribute('position').count, 0);
      const pos = new Float32Array(count * 3);
      const nor = new Float32Array(count * 3);
      let o = 0;
      for (const g of geos) {
        pos.set(g.getAttribute('position').array as Float32Array, o);
        nor.set(g.getAttribute('normal').array as Float32Array, o);
        o += g.getAttribute('position').count * 3;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      into.add(mesh);
    }
    this.buckets.clear();
  }
}

const lambert = (color: string, opts: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

export class Arena {
  readonly group = new THREE.Group();
  readonly theme: Theme;
  private hemi: THREE.HemisphereLight;
  private hemiBase: number;
  private rnd: () => number;
  private span: { min: number; max: number };
  private clouds: Mover[] = [];
  private birds: Mover[] = [];
  private swayers: { o: THREE.Object3D; ph: number; amp: number }[] = [];
  private trees: { mesh: THREE.InstancedMesh; items: TreeItem[]; yOff: number; sway: number }[] = [];
  private weather: THREE.Points | THREE.LineSegments | null = null;
  private weatherVel: Float32Array | null = null;
  private ledges: (THREE.Group | null)[] = [null, null];
  private banners: (THREE.Object3D | null)[] = [null, null];
  private flames: { mesh: THREE.Mesh; light: THREE.PointLight | null; ph: number }[] = [];
  private smoke: { pts: THREE.Points; base: THREE.Vector3 }[] = [];
  private rays: THREE.Mesh[] = [];
  private lightningAt = 3;
  private flash = 0;
  private slow = 0;
  private lava: THREE.MeshStandardMaterial | null = null;
  private crowd: THREE.InstancedMesh | null = null;
  private crowdBase: { x: number; y: number; z: number; ph: number }[] = [];
  private sunDir: THREE.Vector3;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();

  constructor(theme: Theme, seed: number, span: { min: number; max: number }) {
    this.theme = theme;
    this.span = span;
    this.rnd = mulberry32(seed ^ 0x5eed);
    this.sunDir = new THREE.Vector3(...theme.sunDir).normalize();

    // Sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(theme.skyTop) },
          horizon: { value: new THREE.Color(theme.skyHorizon) },
          sunColor: { value: new THREE.Color(theme.sun) },
          sunDir: { value: this.sunDir.clone() },
          moon: { value: theme.moon ? 1 : 0 },
        },
      }),
    );
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    this.group.add(sky);

    // Lights: sky/ground fill, a key light, and a rim light from behind the
    // duel plane that outlines the black figures.
    this.hemiBase = theme.hemiIntensity;
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
    sun.position.copy(this.sunDir).multiplyScalar(50);
    const rim = new THREE.DirectionalLight(theme.rim, 1.5);
    rim.position.set(0, 6, -12);
    this.group.add(this.hemi, sun, rim);

    const baker = new Baker();
    this.buildGround();
    switch (theme.decor) {
      case 'forest':
        this.buildForest(baker);
        break;
      case 'town':
        this.buildTown(baker);
        break;
      case 'colosseum':
        this.buildColosseum(baker);
        break;
      default:
        this.buildMountains(baker);
        this.buildWildTrees();
        this.buildScatter(baker);
        if (theme.lava) this.buildLava();
        break;
    }
    baker.flush(this.group);
    if (theme.decor !== 'colosseum') this.buildClouds();
    if (theme.decor !== 'colosseum' && theme.weather !== 'snow' && theme.weather !== 'embers') this.buildBirds();
    this.buildWeather();
  }

  // ---- archers' ledges and banners ----------------------------------------------
  // `ledge: false` keeps only the banner (flat stages like the VS screen).
  setArcher(i: 0 | 1, a: ArcherSlot, ledge = true) {
    const old = this.ledges[i];
    if (old) this.group.remove(old);
    const g = ledge ? this.makeLedge(a) : new THREE.Group();
    this.ledges[i] = g;
    this.group.add(g);
    const banner = this.makeBanner(a.color);
    banner.position.set(a.x - a.facing * 0.95, a.top, -0.7);
    g.add(banner);
    this.banners[i] = banner;
    if (this.theme.decor === 'town') this.addTorch(g, a.x - a.facing * 2.6, a.top, -1.1, i);
  }

  private makeLedge(a: ArcherSlot) {
    const g = new THREE.Group();
    const t = this.theme;
    const rnd = mulberry32(Math.floor(a.x * 997 + a.top * 131));
    const baker = new Baker();
    const rock = lambert(t.rockDark);
    const top = lambert(t.ledgeTop);
    const lip = lambert(t.ledgeLip);
    const edge = a.x + a.facing * LEDGE_FRONT;
    const len = 60;
    const cx = edge - a.facing * (len / 2);
    const h = a.top + 3;
    const box = new THREE.BoxGeometry(1, 1, 1);
    // Main block and a slightly lighter walkable top.
    baker.add(box, rock, [cx, a.top - h / 2, -1], [0, 0, 0], [len, h, 8]);
    baker.add(box, top, [cx, a.top - 0.04, -1], [0, 0, 0], [len, 0.08, 8]);
    // Bright rim along the front and the cliff edge (grass / snow / sand).
    baker.add(box, lip, [cx, a.top - 0.02, 3.02], [0, 0, 0], [len, 0.1, 0.12]);
    baker.add(box, lip, [edge + a.facing * 0.02, a.top - 0.02, -1], [0, 0, 0], [0.14, 0.1, 8]);
    // Jagged cliff face: rocks jutting out of the edge.
    for (let k = 0; k < 9; k++) {
      const s = 0.5 + rnd() * 0.9;
      const y = a.top - 0.4 - rnd() * (a.top + 1.5);
      // Kept behind z = 1.5 so nothing pokes up between the camera and the duel.
      baker.add(box, rock, [edge + a.facing * (0.15 + rnd() * 0.3), Math.min(y, a.top - s * 0.8), -4 + rnd() * 5.5], [rnd(), rnd(), rnd()], [s, s * 1.4, s]);
    }
    // Rim tufts along the front edge for a soft silhouette.
    const tuft = new THREE.ConeGeometry(0.09, 0.32, 4);
    for (let k = 0; k < 26; k++) {
      const x = edge - a.facing * rnd() * 14;
      baker.add(tuft, lip, [x, a.top + 0.1, 2.9 + rnd() * 0.15], [0, rnd() * 3, (rnd() - 0.5) * 0.6], [1, 0.6 + rnd() * 0.8, 1]);
    }
    baker.flush(g);
    return g;
  }

  // Black shield-shaped banner on a crossbar, trimmed in the archer's colour.
  private makeBanner(color: string) {
    const root = new THREE.Group();
    const wood = lambert('#1A1410');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.6, 6), wood);
    pole.position.y = 1.3;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 5), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 2.42;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), lambert('#2A2A2A'));
    tip.position.y = 2.67;
    const shield = (w: number, hgt: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(w / 2, -hgt * 0.55);
      s.quadraticCurveTo(w / 2, -hgt * 0.85, 0, -hgt);
      s.quadraticCurveTo(-w / 2, -hgt * 0.85, -w / 2, -hgt * 0.55);
      s.closePath();
      return new THREE.ShapeGeometry(s, 6);
    };
    const cloth = new THREE.Group();
    const trim = new THREE.Mesh(shield(0.66, 0.92), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    const face = new THREE.Mesh(shield(0.56, 0.82), new THREE.MeshLambertMaterial({ color: '#0B0B0D', side: THREE.DoubleSide }));
    face.position.set(0, -0.04, 0.01);
    // Emblem: a small diamond in the trim colour.
    const gem = new THREE.Mesh(new THREE.CircleGeometry(0.09, 4), new THREE.MeshBasicMaterial({ color }));
    gem.position.set(0, -0.36, 0.02);
    cloth.add(trim, face, gem);
    cloth.position.y = 2.4;
    cloth.userData.cloth = true;
    root.add(pole, bar, tip, cloth);
    return root;
  }

  private addTorch(into: THREE.Group, x: number, y: number, z: number, slot: number) {
    this.flames = this.flames.filter((f) => f.mesh.userData.slot !== slot);
    const wood = lambert('#2A1E14');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.2, 6), wood);
    pole.position.set(x, y + 1.1, z);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 0.16, 7), lambert('#3A3530'));
    cup.position.set(x, y + 2.25, z);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.42, 7),
      new THREE.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.95, fog: false }),
    );
    flame.position.set(x, y + 2.5, z);
    flame.userData.slot = slot;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), new THREE.MeshBasicMaterial({ color: '#FFF3B0', fog: false }));
    core.position.set(0, -0.06, 0.01);
    flame.add(core);
    const light = new THREE.PointLight('#FF9A3C', 6, 9, 1.6);
    light.position.set(x, y + 2.6, z + 0.3);
    into.add(pole, cup, flame, light);
    this.flames.push({ mesh: flame, light, ph: this.rnd() * 10 });
  }

  // ---- terrain -------------------------------------------------------------------
  private buildGround() {
    const span = this.span;
    const t = this.theme;
    const w = span.max - span.min + 400;
    const geo = new THREE.PlaneGeometry(w, 260, 100, 48);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const near = new THREE.Color(t.ground);
    const far = new THREE.Color(t.groundFar);
    const c = new THREE.Color();
    const cx = (span.min + span.max) / 2;
    const flat = t.decor === 'colosseum' || t.decor === 'town';
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) - 60;
      // Flat duel strip near z = 0, rolling hills behind.
      const back = Math.max(0, -z - 8);
      let hgt = flat ? 0 : noise2(x * 0.045, z * 0.05) * Math.min(1, back / 25) * 7;
      hgt += noise2(x * 0.15, z * 0.15) * (flat ? 0.05 : 0.35);
      if (t.lava && z < -18 && z > -46) hgt = Math.min(hgt, -0.6 - noise2(x * 0.1, z * 0.1) * 0.5);
      pos.setY(i, Math.abs(z) < 5 ? hgt * 0.1 : hgt);
      pos.setZ(i, z);
      pos.setX(i, x);
      const k = Math.min(1, Math.max(0, (-z - 4) / 70));
      c.copy(near).lerp(far, k);
      const v = 0.9 + noise2(x * 0.4, z * 0.4) * 0.1;
      colors[i * 3] = c.r * v;
      colors[i * 3 + 1] = c.g * v;
      colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !flat }));
    ground.matrixAutoUpdate = false;
    this.group.add(ground);
  }

  // ---- set pieces: misty forest --------------------------------------------------
  private buildForest(baker: Baker) {
    const t = this.theme;
    const { min, max } = this.span;
    const width = max - min + 100;
    const rnd = this.rnd;
    const deadMat = [lambert('#8A9A8C'), lambert('#A8B8AA'), lambert('#C0CEC2')];
    const cyl = new THREE.CylinderGeometry(0.5, 1, 1, 6);
    // Dead trees fading into the fog in three depth layers.
    [-14, -28, -48].forEach((zBase, layer) => {
      for (let i = 0; i < 18; i++) {
        const x = min - 50 + rnd() * width;
        const z = zBase - rnd() * 10;
        const h = 6 + rnd() * 8;
        const r = 0.18 + rnd() * 0.12;
        const mat = deadMat[layer];
        baker.add(cyl, mat, [x, h / 2, z], [0, 0, (rnd() - 0.5) * 0.12], [r, h, r]);
        const branches = 3 + Math.floor(rnd() * 3);
        for (let b = 0; b < branches; b++) {
          const by = h * (0.45 + rnd() * 0.5);
          const bl = 1.2 + rnd() * 2.2;
          const ang = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6);
          baker.add(cyl, mat, [x - Math.sin(ang) * bl * 0.5, by + Math.cos(ang) * bl * 0.5, z], [0, 0, ang], [r * 0.35, bl, r * 0.35]);
        }
      }
    });
    // Mossy boulders with green caps
    const stone = lambert('#6E7B70');
    const moss = lambert('#6FA83A');
    const ico = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const x = min - 30 + rnd() * width;
      const z = -3 - rnd() * 14;
      const s = 0.6 + rnd() * 1.8;
      baker.add(ico, stone, [x, s * 0.3, z], [rnd(), rnd(), rnd()], [s, s * 0.7, s]);
      baker.add(ico, moss, [x, s * 0.62, z], [rnd(), rnd(), rnd()], [s * 0.8, s * 0.25, s * 0.8]);
    }
    // Fallen logs
    const bark = lambert('#4A3F33');
    for (let i = 0; i < 4; i++) {
      const x = min + rnd() * (max - min);
      baker.add(cyl, bark, [x, 0.5, -6 - rnd() * 8], [0, rnd() * 0.6, Math.PI / 2 + (rnd() - 0.5) * 0.4], [0.45, 7, 0.45]);
    }
    // Purple mushrooms and bright fern tufts
    const stem = lambert('#E8E0D0');
    const cap = new THREE.MeshLambertMaterial({ color: '#9C6ADE', emissive: '#5B2E9E', emissiveIntensity: 0.5 });
    const capGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      const x = min - 20 + rnd() * width;
      const z = -1.5 - rnd() * 10;
      const s = 0.2 + rnd() * 0.45;
      baker.add(cyl, stem, [x, s * 0.5, z], [0, 0, 0], [s * 0.15, s, s * 0.15]);
      baker.add(capGeo, cap, [x, s * 0.95, z], [0, 0, 0], [s * 0.6, s * 0.4, s * 0.6]);
    }
    const fern = lambert('#8BC34A');
    const cone = new THREE.ConeGeometry(0.12, 0.6, 4);
    for (let i = 0; i < 160; i++) {
      const x = min - 30 + rnd() * width;
      const z = rnd() < 0.3 ? 3.3 + rnd() * 4 : -1.5 - rnd() * 16;
      baker.add(cone, fern, [x, 0.25, z], [(rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8], [1, 0.6 + rnd(), 1]);
    }
    // Wooden warning sign
    const plank = lambert('#7A5A3A');
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sx = (min + max) / 2 + 3;
    baker.add(box, plank, [sx, 0.7, -5], [0, 0.2, 0], [0.08, 1.4, 0.08]);
    baker.add(box, plank, [sx, 1.35, -5], [0, 0.2, 0], [0.9, 0.55, 0.06]);
    // Silhouette trees framing the shot: black crowns with a lit green rim.
    const black = lambert(t.foliageDark);
    const rimLeaf = lambert('#7CB342');
    const trunk = lambert('#0A0D08');
    for (let i = 0; i < 9; i++) {
      const x = min - 10 + rnd() * (max - min + 20);
      const z = rnd() < 0.5 ? -1.8 - rnd() * 2 : 4.5 + rnd() * 3;
      const h = 6 + rnd() * 3;
      const tree = new THREE.Group();
      const tr = new THREE.Mesh(cyl, trunk);
      tr.position.y = h / 2;
      tr.scale.set(0.35, h, 0.35);
      tree.add(tr);
      for (let k = 0; k < 9; k++) {
        const s = 1.2 + rnd() * 1.3;
        const leaf = new THREE.Mesh(ico, k < 2 ? rimLeaf : black);
        leaf.position.set((rnd() - 0.5) * 3.2, h + (rnd() - 0.3) * 2.2, (rnd() - 0.5) * 1.6 - (k < 2 ? 0.6 : 0));
        leaf.scale.setScalar(s);
        leaf.rotation.set(rnd(), rnd(), rnd());
        tree.add(leaf);
      }
      tree.position.set(x, 0, z);
      this.group.add(tree);
      this.swayers.push({ o: tree, ph: rnd() * 10, amp: 0.015 });
    }
    // Soft god rays slanting through the canopy
    for (let i = 0; i < 6; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5 + rnd() * 3, 40),
        new THREE.MeshBasicMaterial({
          color: '#FFF8D8',
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      ray.position.set(min + rnd() * (max - min), 14, -10 - rnd() * 14);
      ray.rotation.z = -0.45;
      ray.userData.ph = rnd() * 10;
      this.rays.push(ray);
      this.group.add(ray);
    }
  }

  // ---- set pieces: rainy night town ---------------------------------------------
  private buildTown(baker: Baker) {
    const { min, max } = this.span;
    const rnd = this.rnd;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    roofGeo.rotateX(Math.PI / 2);
    const walls = [lambert('#6B6560'), lambert('#7A6F62'), lambert('#5C5A58'), lambert('#8A7A66')];
    const timber = lambert('#3A2A1E');
    const roofs = [lambert('#2F6B6B'), lambert('#7A3B32'), lambert('#3E5A6E'), lambert('#5A3A3A')];
    const lit = new THREE.MeshBasicMaterial({ color: '#FFC94D' });
    const dark = new THREE.MeshBasicMaterial({ color: '#1A1C22' });
    // Two rows of houses, the far row fogged out.
    [
      { z: -9, s: 1 },
      { z: -20, s: 1.25 },
    ].forEach((row) => {
      let x = min - 30;
      while (x < max + 30) {
        const w = (3 + rnd() * 3) * row.s;
        const h = (3.5 + rnd() * 3) * row.s;
        const d = 3 * row.s;
        const z = row.z - rnd() * 3;
        const cx = x + w / 2;
        baker.add(box, walls[Math.floor(rnd() * walls.length)], [cx, h / 2, z], [0, 0, 0], [w, h, d]);
        // Timber frame beams
        baker.add(box, timber, [cx, h * 0.55, z + d / 2 + 0.02], [0, 0, 0], [w, 0.12, 0.05]);
        baker.add(box, timber, [cx, h, z + d / 2 + 0.02], [0, 0, 0], [w, 0.14, 0.05]);
        // Gabled roof: a triangular prism along x
        baker.add(roofGeo, roofs[Math.floor(rnd() * roofs.length)], [cx, h + d * 0.25, z], [0, 0, Math.PI / 2], [d * 0.62, w * 1.04, d * 0.62]);
        // Windows: most lit, a few dark
        const cols = Math.max(1, Math.floor(w / 1.4));
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < cols; c++) {
            const wx = x + (c + 0.5) * (w / cols);
            const wy = h * (r === 0 ? 0.3 : 0.75);
            baker.add(box, rnd() < 0.62 ? lit : dark, [wx, wy, z + d / 2 + 0.03], [0, 0, 0], [0.45, 0.6, 0.04]);
          }
        }
        // Chimney with smoke
        if (rnd() < 0.35) {
          const chx = cx + (rnd() - 0.5) * w * 0.5;
          const chy = h + d * 0.4;
          baker.add(box, walls[2], [chx, chy, z], [0, 0, 0], [0.4, 1.2, 0.4]);
          if (this.smoke.length < 5) this.addSmoke(chx, chy + 0.7, z);
        }
        x += w + 0.2 + rnd() * 0.8;
      }
    });
    // Castle wall with crenellations and conical towers, far back.
    const castle = lambert('#5A5E66');
    const z0 = -46;
    baker.add(box, castle, [(min + max) / 2, 6, z0], [0, 0, 0], [max - min + 160, 12, 3]);
    for (let x = min - 80; x < max + 80; x += 2.4) baker.add(box, castle, [x, 12.6, z0], [0, 0, 0], [1.2, 1.2, 3]);
    const towerRoof = lambert('#2F5A62');
    const banner = lambert('#8E1B1B');
    const towerGeo = new THREE.CylinderGeometry(1, 1.1, 1, 10);
    const roofCone = new THREE.ConeGeometry(1, 1, 10);
    for (let i = 0; i < 6; i++) {
      const tx = min - 20 + rnd() * (max - min + 40);
      const th = 16 + rnd() * 8;
      baker.add(towerGeo, castle, [tx, th / 2, z0 + 2], [0, 0, 0], [2.6, th, 2.6]);
      baker.add(roofCone, towerRoof, [tx, th + 2.4, z0 + 2], [0, 0, 0], [3.2, 5, 3.2]);
      baker.add(box, lit, [tx, th * 0.7, z0 + 4.65], [0, 0, 0], [0.5, 0.9, 0.05]);
    }
    for (let x = min - 60; x < max + 60; x += 7) baker.add(box, banner, [x, 9, z0 + 1.6], [0, 0, 0], [0.9, 3.5, 0.05]);
    // Stone arch bridge in the middle distance
    const bridge = lambert('#4E5056');
    baker.add(new THREE.TorusGeometry(5, 0.9, 6, 16, Math.PI), bridge, [(min + max) / 2, 0, -14], [0, 0, 0], [1, 0.7, 1.4]);
    baker.add(box, bridge, [(min + max) / 2, 4.1, -14], [0, 0, 0], [12, 0.6, 2.4]);
    // Parapet posts and sagging chains along the front of the duel line
    const post = lambert('#3E3F44');
    const chain = lambert('#22242A');
    const link = new THREE.TorusGeometry(0.06, 0.018, 4, 8);
    for (let x = min - 10; x < max + 10; x += 3.2) {
      baker.add(box, post, [x, 0.55, 4.2], [0, 0, 0], [0.45, 1.1, 0.45]);
      baker.add(box, post, [x, 1.15, 4.2], [0, 0, 0], [0.55, 0.12, 0.55]);
      for (let k = 1; k < 16; k++) {
        const u = k / 16;
        const sag = Math.sin(u * Math.PI) * 0.35;
        baker.add(link, chain, [x + u * 3.2, 0.95 - sag, 4.2], [0, k % 2 ? Math.PI / 2 : 0, 0]);
      }
    }
    // Wet cobbles: a slightly glossy street in the gap
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(max - min + 200, 14),
      new THREE.MeshStandardMaterial({ color: '#2E3138', roughness: 0.35, metalness: 0.2 }),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.set((min + max) / 2, 0.02, -2);
    this.group.add(street);
  }

  private addSmoke(x: number, y: number, z: number) {
    const n = 26;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y + (i / n) * 5;
      pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: '#B8BEC8', size: 1.1, map: dotTexture(), transparent: true, opacity: 0.35, depthWrite: false }),
    );
    pts.frustumCulled = false;
    this.smoke.push({ pts, base: new THREE.Vector3(x, y, z) });
    this.group.add(pts);
  }

  // ---- set pieces: colosseum -----------------------------------------------------
  private buildColosseum(baker: Baker) {
    const { min, max } = this.span;
    const cx = (min + max) / 2;
    const cz = -6;
    const R = Math.max(42, (max - min) * 0.55);
    const stone = lambert('#CDB993');
    const stoneDark = lambert('#A8946E');
    const shade = lambert('#5A4A36');
    const blue = lambert('#3A7BC8');
    const red = lambert('#C83A3A');
    const box = new THREE.BoxGeometry(1, 1, 1);
    const n = 64;
    const seg = (Math.PI * 2 * R) / n;
    const people: { x: number; y: number; z: number; ph: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const z = cz + Math.sin(a) * R;
      if (z > 4) continue; // never between the camera and the duel
      const rot: [number, number, number] = [0, -a + Math.PI / 2, 0];
      // Three tiers of arcades, stepping back as they rise.
      for (let tier = 0; tier < 3; tier++) {
        const r = R + tier * 3;
        const y0 = tier * 6;
        baker.add(box, tier === 1 ? stoneDark : stone, [cx + Math.cos(a) * r, y0 + 3, cz + Math.sin(a) * r], rot, [seg * 1.02, 6, 1.6]);
        // Arch openings (dark recesses)
        baker.add(box, shade, [cx + Math.cos(a) * (r - 0.82), y0 + 2.6, cz + Math.sin(a) * (r - 0.82)], rot, [seg * 0.45, 3.4, 0.05]);
        // Seating step with spectators
        if (tier < 2) {
          const sx = cx + Math.cos(a) * (r + 1.5);
          const sz = cz + Math.sin(a) * (r + 1.5);
          for (let k = 0; k < 2; k++) people.push({ x: sx + (k - 0.5) * seg * 0.4, y: y0 + 6.5, z: sz, ph: this.rnd() * 10 });
        }
      }
      // Hanging banners every few bays, alternating blue/red
      if (i % 4 === 0) {
        baker.add(box, i % 8 === 0 ? blue : red, [cx + Math.cos(a) * (R - 0.9), 8.5, cz + Math.sin(a) * (R - 0.9)], rot, [1.4, 4, 0.05]);
      }
    }
    // Crowd: little bobbing figures on the stands
    this.crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.35, 2, 6), new THREE.MeshLambertMaterial(), people.length);
    const c = new THREE.Color();
    const palette = ['#C0392B', '#2980B9', '#F1C40F', '#ECF0F1', '#8E44AD', '#27AE60', '#D35400', '#2C3E50'];
    people.forEach((_, i) => {
      c.set(palette[i % palette.length]);
      this.crowd!.setColorAt(i, c);
    });
    this.crowdBase = people;
    this.group.add(this.crowd);
    // Barrels on the arena floor
    const wood = lambert('#6B4A2E');
    const barrel = new THREE.CylinderGeometry(0.45, 0.45, 1, 10);
    for (let i = 0; i < 8; i++) {
      baker.add(barrel, wood, [min + this.rnd() * (max - min), 0.5, -8 - this.rnd() * 18]);
    }
  }

  // ---- open landscape --------------------------------------------------------------
  private buildMountains(baker: Baker) {
    const span = this.span;
    const layers = [
      { z: -75, h: [18, 34], r: [16, 28], n: 14 },
      { z: -120, h: [30, 55], r: [26, 40], n: 12 },
      { z: -175, h: [45, 80], r: [40, 60], n: 10 },
    ];
    const snow = lambert('#F4F8FF');
    layers.forEach((L, li) => {
      const mat = lambert(this.theme.mountains[li]);
      const width = span.max - span.min + 260;
      for (let i = 0; i < L.n; i++) {
        const h = lerp(L.h[0], L.h[1], this.rnd());
        const r = lerp(L.r[0], L.r[1], this.rnd());
        const geo = new THREE.ConeGeometry(r, h, 6 + Math.floor(this.rnd() * 3), 3);
        jitter(geo, r * 0.08, this.rnd);
        const x = span.min - 130 + (i + this.rnd() * 0.8) * (width / L.n);
        const z = L.z + (this.rnd() - 0.5) * 20;
        const ry = this.rnd() * Math.PI;
        baker.add(geo, mat, [x, h / 2 - 2, z], [0, ry, 0]);
        if (this.theme.id === 'frost' || (li === 2 && this.theme.id === 'meadow')) {
          baker.add(new THREE.ConeGeometry(r * 0.32, h * 0.32, 6, 1), snow, [x, h - h * 0.16 - 1.8, z], [0, ry, 0]);
        }
      }
    });
  }

  private buildWildTrees() {
    const t = this.theme;
    const span = this.span;
    const foliage = new THREE.MeshLambertMaterial({ color: t.foliage, flatShading: true });
    const trunkMat = lambert(t.trunk);
    let crown: THREE.BufferGeometry;
    let yOff = 0;
    if (t.trees === 'pine') {
      crown = mergeCones([
        [1.3, 2.2, 1.4],
        [1.0, 1.8, 2.5],
        [0.7, 1.4, 3.5],
      ]);
    } else if (t.trees === 'round') {
      crown = new THREE.IcosahedronGeometry(1.5, 0);
      yOff = 2.6;
    } else if (t.trees === 'mushroom') {
      crown = new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      crown.scale(1, 0.6, 1);
      yOff = 2.4;
      foliage.color.set('#2E7A6A');
      foliage.emissive = new THREE.Color('#1F6A5A');
      foliage.emissiveIntensity = 0.35;
    } else {
      crown = mergeCones([
        [0.12, 2.0, 2.2, 0.6],
        [0.1, 1.6, 2.0, -0.7],
        [0.08, 1.2, 2.8, 0.3],
      ]);
    }
    const trunk = new THREE.CylinderGeometry(0.14, 0.22, t.trees === 'dead' ? 2.6 : 1.8, 6);
    trunk.translate(0, t.trees === 'dead' ? 1.3 : 0.9, 0);
    const rows = [
      { z: [-34, -12], n: 46, s: [0.9, 1.6] },
      { z: [-60, -36], n: 40, s: [1.3, 2.2] },
      { z: [7, 14], n: 10, s: [1.2, 1.8] },
    ];
    const items: TreeItem[] = [];
    const width = span.max - span.min + 120;
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const x = span.min - 60 + this.rnd() * width;
        const z = lerp(row.z[0], row.z[1], this.rnd());
        if (z > 0 && this.rnd() < 0.5) continue;
        items.push({ x, z, s: lerp(row.s[0], row.s[1], this.rnd()), r: this.rnd() * Math.PI, ph: this.rnd() * 10 });
      }
    }
    const crowns = new THREE.InstancedMesh(crown, foliage, items.length);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, items.length);
    this.group.add(crowns, trunks);
    this.trees.push({ mesh: crowns, items, yOff, sway: 1 }, { mesh: trunks, items, yOff: 0, sway: 0.3 });
    this.updateTrees(0);
  }

  private buildScatter(baker: Baker) {
    const span = this.span;
    const rockMat = lambert(this.theme.rock);
    const rock = new THREE.DodecahedronGeometry(0.5, 0);
    const width = span.max - span.min + 80;
    for (let i = 0; i < 50; i++) {
      const s = 0.3 + this.rnd() * 1.2;
      const z = this.rnd() < 0.3 ? 3.5 + this.rnd() * 5 : -2 - this.rnd() * 20;
      baker.add(rock, rockMat, [span.min - 40 + this.rnd() * width, s * 0.2, z], [this.rnd(), this.rnd() * 6, this.rnd()], [s, s * 0.6, s]);
    }
    if (this.theme.id === 'ember') return;
    const grass = new THREE.Color(this.theme.foliage).multiplyScalar(1.25);
    const grassMat = lambert(this.theme.id === 'frost' ? '#DCE8F2' : `#${grass.getHexString()}`);
    const blade = new THREE.ConeGeometry(0.06, 0.55, 4);
    for (let i = 0; i < 180; i++) {
      const s = 0.6 + this.rnd() * 0.9;
      const z = this.rnd() < 0.4 ? 3.5 + this.rnd() * 6 : -1 - this.rnd() * 14;
      baker.add(blade, grassMat, [span.min - 40 + this.rnd() * width, 0.2 * s, z], [(this.rnd() - 0.5) * 0.6, 0, (this.rnd() - 0.5) * 0.6], [s, s, s]);
    }
  }

  private buildLava() {
    const span = this.span;
    this.lava = new THREE.MeshStandardMaterial({
      color: '#FF4A10',
      emissive: new THREE.Color(this.theme.lava),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(span.max - span.min + 300, 30, 1, 1), this.lava);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set((span.min + span.max) / 2, -0.35, -32);
    this.group.add(lake);
    const glow = new THREE.PointLight(this.theme.lava, 40, 60, 1.6);
    glow.position.set((span.min + span.max) / 2, 3, -26);
    this.group.add(glow);
  }

  private buildClouds() {
    const span = this.span;
    const mat = new THREE.MeshLambertMaterial({
      color: this.theme.cloud,
      flatShading: true,
      transparent: this.theme.cloudOpacity < 1,
      opacity: this.theme.cloudOpacity,
      fog: false,
      emissive: new THREE.Color(this.theme.cloud),
      emissiveIntensity: 0.25,
    });
    const width = span.max - span.min + 300;
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      // Each cloud's puffs are merged into one mesh: one draw per cloud.
      const c = new THREE.Group();
      const baker = new Baker();
      const puffs = 4 + Math.floor(this.rnd() * 4);
      for (let k = 0; k < puffs; k++) {
        const r = 2.5 + this.rnd() * 3;
        baker.add(puff, mat, [k * 3.2 - puffs * 1.6, this.rnd() * 1.8, this.rnd() * 3], [0, 0, 0], [r, r * 0.6, r]);
      }
      baker.flush(c);
      const base = new THREE.Vector3(span.min - 150 + this.rnd() * width, 26 + this.rnd() * 26, -80 - this.rnd() * 90);
      c.position.copy(base);
      this.group.add(c);
      this.clouds.push({ o: c, base, speed: 0.6 + this.rnd() * 1.2, phase: 0 });
    }
  }

  private buildBirds() {
    const span = this.span;
    const mat = new THREE.MeshBasicMaterial({ color: '#141414', side: THREE.DoubleSide });
    const wing = new THREE.PlaneGeometry(0.7, 0.18);
    wing.translate(0.35, 0, 0);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      r.rotation.y = Math.PI;
      b.add(l, r);
      const base = new THREE.Vector3(span.min + this.rnd() * (span.max - span.min), 13 + this.rnd() * 10, -18 - this.rnd() * 25);
      b.position.copy(base);
      this.group.add(b);
      this.birds.push({ o: b, base, speed: 3 + this.rnd() * 2, phase: this.rnd() * 10 });
    }
  }

  private buildWeather() {
    const t = this.theme;
    if (t.weather === 'rain') {
      const n = 420;
      const pos = new Float32Array(n * 6);
      this.weatherVel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (this.rnd() - 0.5) * 50;
        const y = this.rnd() * 22;
        const z = -12 + this.rnd() * 20;
        pos.set([x, y, z, x - 0.08, y - 0.7, z], i * 6);
        this.weatherVel[i] = 22 + this.rnd() * 8;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: t.weatherColor, transparent: true, opacity: 0.4 }));
      lines.frustumCulled = false;
      this.weather = lines;
      this.group.add(lines);
      return;
    }
    const n = t.weather === 'fireflies' ? 90 : t.weather === 'snow' ? 480 : t.weather === 'embers' ? 220 : 140;
    const pos = new Float32Array(n * 3);
    this.weatherVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (this.rnd() - 0.5) * 50;
      pos[i * 3 + 1] = this.rnd() * 20;
      pos[i * 3 + 2] = -14 + this.rnd() * 22;
      this.weatherVel[i * 3] = this.rnd();
      this.weatherVel[i * 3 + 1] = this.rnd();
      this.weatherVel[i * 3 + 2] = this.rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const additive = t.weather === 'embers' || t.weather === 'fireflies' || t.weather === 'spores';
    const size = t.weather === 'snow' ? 0.12 : t.weather === 'fireflies' ? 0.22 : t.weather === 'embers' ? 0.14 : t.weather === 'spores' ? 0.1 : 0.08;
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: t.weatherColor,
        size,
        map: dotTexture(),
        transparent: true,
        depthWrite: false,
        opacity: t.weather === 'dust' ? 0.5 : 0.9,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
        fog: !additive,
      }),
    );
    pts.frustumCulled = false;
    this.weather = pts;
    this.group.add(pts);
  }

  // ---- per frame ------------------------------------------------------------------
  update(t: number, dt: number, focus: THREE.Vector3) {
    for (const c of this.clouds) {
      c.o.position.x += c.speed * dt;
      if (c.o.position.x > c.base.x + 160) c.o.position.x -= 320;
    }
    for (const b of this.birds) {
      b.phase += dt;
      b.o.position.x = b.base.x + ((b.phase * b.speed) % 140) - 70;
      b.o.position.y = b.base.y + Math.sin(b.phase * 0.7) * 1.5;
      const flap = Math.sin(b.phase * 11) * 0.7;
      b.o.children[0].rotation.x = flap;
      b.o.children[1].rotation.x = flap;
    }
    for (const s of this.swayers) s.o.rotation.z = Math.sin(t * 1.1 + s.ph) * s.amp;
    this.slow ^= 1; // trees and crowd sway every other frame
    if (this.slow) {
      if (this.trees.length) this.updateTrees(t);
      if (this.crowd) this.updateCrowd(t);
    }
    for (const b of this.banners) {
      if (!b) continue;
      const cloth = b.children[3];
      cloth.rotation.x = Math.sin(t * 1.7 + b.position.x) * 0.12;
      cloth.rotation.y = Math.sin(t * 1.1 + b.position.x) * 0.18;
    }
    for (const f of this.flames) {
      const flick = 0.85 + Math.sin(t * 17 + f.ph) * 0.1 + Math.sin(t * 29 + f.ph * 2) * 0.06;
      f.mesh.scale.set(1, flick, 1);
      if (f.light) f.light.intensity = 5 + flick * 2.5;
    }
    for (const s of this.smoke) this.updateSmoke(s, dt);
    for (const r of this.rays) (r.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(t * 0.4 + r.userData.ph) * 0.035;
    this.updateWeather(t, dt, focus);

    if (this.lava) this.lava.emissiveIntensity = 1.4 + Math.sin(t * 1.7) * 0.35 + Math.sin(t * 4.3) * 0.12;

    // Rain storms: occasional double lightning flash.
    if (this.theme.weather === 'rain') {
      this.lightningAt -= dt;
      if (this.lightningAt <= 0) {
        this.flash = 1;
        this.lightningAt = 5 + this.rnd() * 8;
      }
      this.flash = Math.max(0, this.flash - dt * 3.5);
      const f = this.flash > 0.5 ? this.flash : this.flash > 0.3 ? 0 : this.flash * 2;
      this.hemi.intensity = this.hemiBase + f * 3;
    }
  }

  private updateSmoke(s: { pts: THREE.Points; base: THREE.Vector3 }, dt: number) {
    const pos = s.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] += dt * 0.9;
      a[i] += dt * 0.5;
      if (a[i + 1] > s.base.y + 6) {
        a[i] = s.base.x;
        a[i + 1] = s.base.y;
      }
    }
    pos.needsUpdate = true;
  }

  private updateCrowd(t: number) {
    const crowd = this.crowd!;
    this.tmpQ.identity();
    this.tmpS.setScalar(1);
    this.crowdBase.forEach((p, i) => {
      this.tmpP.set(p.x, p.y + Math.max(0, Math.sin(t * 6 + p.ph)) * 0.25, p.z);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      crowd.setMatrixAt(i, this.tmpM);
    });
    crowd.instanceMatrix.needsUpdate = true;
  }

  private updateTrees(t: number) {
    for (const tr of this.trees) {
      tr.items.forEach((it, i) => {
        const sway = Math.sin(t * 1.3 + it.ph) * 0.035 + Math.sin(t * 2.9 + it.ph * 2) * 0.012;
        this.tmpE.set(0, it.r, sway * tr.sway);
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpS.setScalar(it.s);
        this.tmpP.set(it.x, tr.yOff * it.s, it.z);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        tr.mesh.setMatrixAt(i, this.tmpM);
      });
      tr.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateWeather(t: number, dt: number, focus: THREE.Vector3) {
    const w = this.weather;
    const v = this.weatherVel;
    if (!w || !v) return;
    const kind = this.theme.weather;
    const pos = w.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const cx = focus.x;
    const wrapX = (x: number) => (x < cx - 25 ? x + 50 : x > cx + 25 ? x - 50 : x);
    if (kind === 'rain') {
      for (let i = 0; i < v.length; i++) {
        const o = i * 6;
        const dy = v[i] * dt;
        a[o + 1] -= dy;
        a[o + 4] -= dy;
        a[o] -= dy * 0.12;
        a[o + 3] -= dy * 0.12;
        if (a[o + 1] < 0) {
          const x = cx + (Math.random() - 0.5) * 50;
          const y = 18 + Math.random() * 6;
          a[o] = x;
          a[o + 1] = y;
          a[o + 3] = x - 0.08;
          a[o + 4] = y - 0.7;
        }
        const nx = wrapX(a[o]);
        if (nx !== a[o]) {
          a[o + 3] += nx - a[o];
          a[o] = nx;
        }
      }
      pos.needsUpdate = true;
      return;
    }
    for (let i = 0; i < a.length; i += 3) {
      const r0 = v[i];
      const r1 = v[i + 1];
      switch (kind) {
        case 'snow':
          a[i] += (Math.sin(t * 0.8 + r0 * 20) * 0.4 + 0.3) * dt;
          a[i + 1] -= (0.8 + r1 * 0.9) * dt;
          if (a[i + 1] < 0) a[i + 1] = 20;
          break;
        case 'embers':
          a[i] += (Math.sin(t * 2 + r0 * 30) * 0.6 + 0.4) * dt;
          a[i + 1] += (0.8 + r1 * 1.6) * dt;
          if (a[i + 1] > 18) a[i + 1] = 0;
          break;
        case 'fireflies':
          a[i] += Math.sin(t * 0.9 + r0 * 40) * 0.5 * dt;
          a[i + 1] = 0.5 + r1 * 5 + Math.sin(t * 0.7 + r0 * 20) * 0.6;
          a[i + 2] += Math.cos(t * 0.8 + r1 * 30) * 0.4 * dt;
          break;
        case 'spores':
          a[i] += Math.sin(t * 0.5 + r0 * 30) * 0.3 * dt + 0.15 * dt;
          a[i + 1] += (Math.sin(t * 0.8 + r1 * 20) * 0.2 + 0.08) * dt;
          if (a[i + 1] > 14) a[i + 1] = 0.3;
          break;
        default: // pollen, dust
          a[i] += (kind === 'dust' ? 2.2 : 0.5) * (0.5 + r0) * dt;
          a[i + 1] += Math.sin(t * 1.2 + r1 * 20) * 0.25 * dt;
          if (a[i + 1] > 20) a[i + 1] = 0.5;
          break;
      }
      a[i] = wrapX(a[i]);
    }
    pos.needsUpdate = true;
    if (kind === 'fireflies') (w.material as THREE.PointsMaterial).opacity = 0.65 + Math.sin(t * 3) * 0.3;
  }
}

// ---- helpers ------------------------------------------------------------------------

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function jitter(geo: THREE.BufferGeometry, amt: number, rnd: () => number) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  // Weld-safe jitter: same displacement for vertices sharing a position.
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rnd() - 0.5) * amt * 2, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt * 2];
      seen.set(key, d);
    }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
}

// Stack cones into one geometry: [radius, height, centerY, tiltZ?]
function mergeCones(parts: number[][]) {
  const geos = parts.map(([r, h, y, tilt]) => {
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    if (tilt) g.rotateZ(tilt);
    g.translate(tilt ? Math.sin(-tilt) * h * 0.4 : 0, y, 0);
    return g.toNonIndexed();
  });
  const total = geos.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const a = g.getAttribute('position').array as Float32Array;
    pos.set(a, o);
    o += a.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

// Smooth value noise in [-1, 1].
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

let dotTex: THREE.DataTexture | null = null;
// Soft round sprite for Points (Points are square without a map).
export function dotTexture() {
  if (dotTex) return dotTex;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d);
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(a, 1.6) * 255);
    }
  }
  dotTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  dotTex.needsUpdate = true;
  return dotTex;
}
