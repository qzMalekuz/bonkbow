import * as THREE from 'three';
import { mulberry32 } from '@/game/rng';
import { PILLAR_HALF } from '@/game3d/world';
import type { Theme } from '@/game3d/themes';

// The 3D world around the duel, built imperatively from primitives and
// animated from the render loop: gradient sky with sun/moon, fogged low-poly
// mountains and hills, swaying trees, drifting clouds, birds, per-arena
// weather (snow, rain, embers, fireflies, pollen, dust), lightning, lava,
// the archers' rock towers and their waving pennants.
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

export class Arena {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private hemiBase: number;
  private theme: Theme;
  private rnd: () => number;
  private clouds: Mover[] = [];
  private birds: Mover[] = [];
  private trees: { mesh: THREE.InstancedMesh; items: { x: number; z: number; s: number; r: number; ph: number }[]; yOff: number; sway: number }[] = [];
  private weather: THREE.Points | THREE.LineSegments | null = null;
  private weatherVel: Float32Array | null = null;
  private towers: THREE.Group[] = [];
  private flags: { cloth: THREE.Mesh; base: Float32Array; pole: THREE.Group }[] = [];
  private lightningAt = 3;
  private flash = 0;
  private lava: THREE.MeshStandardMaterial | null = null;
  private skyMesh: THREE.Mesh;

  constructor(theme: Theme, seed: number, span: { min: number; max: number }) {
    this.theme = theme;
    this.rnd = mulberry32(seed ^ 0x5eed);

    // Sky dome
    this.skyMesh = new THREE.Mesh(
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
          sunDir: { value: new THREE.Vector3(...theme.sunDir) },
          moon: { value: theme.moon ? 1 : 0 },
        },
      }),
    );
    this.skyMesh.renderOrder = -1;
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);

    // Lights
    this.hemiBase = theme.hemiIntensity;
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 12;
    sc.bottom = -6;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.group.add(this.sun, this.sun.target);
    // Rim light from behind the duel plane outlines the black figures.
    const rim = new THREE.DirectionalLight(theme.rim, 1.4);
    rim.position.set(0, 6, -12);
    this.group.add(rim);

    this.buildGround(span);
    this.buildMountains(span);
    this.buildTrees(span);
    this.buildScatter(span);
    this.buildClouds(span);
    if (theme.weather === 'pollen' || theme.weather === 'rain' || theme.id === 'canyon') this.buildBirds(span);
    this.buildWeather();
    if (theme.lava) this.buildLava(span);
  }

  // ---- archers' towers and pennants ----------------------------------------------
  setArcher(i: 0 | 1, a: ArcherSlot) {
    const old = this.towers[i];
    if (old) this.group.remove(old);
    const tower = this.makeTower(a.top, a.x * 13.37 + i);
    tower.position.x = a.x;
    this.towers[i] = tower;
    this.group.add(tower);

    // Pennant planted on the tower cap, behind the archer, streaming away
    // from the opponent.
    const flag = this.makeFlag(a.color);
    flag.pole.position.set(-a.facing * 0.5, a.top, -0.5);
    flag.pole.scale.x = a.facing;
    tower.add(flag.pole);
    this.flags[i] = flag;
  }

  private makeTower(top: number, seed: number) {
    const rnd = mulberry32(Math.floor(seed * 1000));
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: this.theme.rock, roughness: 0.95, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: this.theme.rockDark, roughness: 1, flatShading: true });
    // Stacked, jittered stone drums from the ground up to `top`.
    let y = 0;
    const h = Math.max(0.3, top);
    const n = Math.max(1, Math.round(h / 1.1));
    const seg = h / n;
    for (let k = 0; k < n; k++) {
      const rTop = PILLAR_HALF * (0.92 + rnd() * 0.12);
      const rBot = PILLAR_HALF * (1.0 + rnd() * 0.18) + (k === 0 ? 0.25 : 0);
      const geo = new THREE.CylinderGeometry(rTop, rBot, seg * 1.02, 7, 2);
      jitter(geo, 0.06, rnd);
      const m = new THREE.Mesh(geo, k === 0 ? dark : rock);
      m.position.y = y + seg / 2;
      m.rotation.y = rnd() * Math.PI;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      y += seg;
    }
    // Cap slab the archer stands on
    const capGeo = new THREE.CylinderGeometry(PILLAR_HALF * 1.12, PILLAR_HALF * 1.0, 0.18, 8, 1);
    jitter(capGeo, 0.03, rnd);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(this.theme.rock).multiplyScalar(1.2), roughness: 0.9, flatShading: true }));
    cap.position.y = top - 0.09;
    cap.receiveShadow = true;
    cap.castShadow = true;
    g.add(cap);
    // Moss / snow tufts on the cap
    const tuft = new THREE.MeshStandardMaterial({ color: this.theme.id === 'frost' ? '#FFFFFF' : this.theme.foliage, roughness: 1, flatShading: true });
    for (let k = 0; k < 5; k++) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + rnd() * 0.1, 0), tuft);
      const a = rnd() * Math.PI * 2;
      t.position.set(Math.cos(a) * PILLAR_HALF * 0.95, top - 0.05, Math.sin(a) * PILLAR_HALF * 0.95);
      t.scale.y = 0.6;
      g.add(t);
    }
    return g;
  }

  private makeFlag(color: string) {
    const pole = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: '#3A2A1E', roughness: 0.8 }),
    );
    stick.position.y = 1.2;
    stick.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#E9C46A', metalness: 0.8, roughness: 0.3 }));
    knob.position.y = 2.42;
    const geo = new THREE.PlaneGeometry(1.0, 0.6, 12, 4);
    geo.translate(-0.5, 0, 0);
    // Pennant: taper toward the free end
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = 1 - Math.abs(x) * 0.7;
      p.setY(i, p.getY(i) * k);
    }
    const cloth = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }),
    );
    cloth.position.set(0, 2.05, 0);
    cloth.castShadow = true;
    pole.add(stick, knob, cloth);
    return { cloth, base: Float32Array.from(p.array as Float32Array), pole };
  }

  // ---- terrain -------------------------------------------------------------------
  private buildGround(span: { min: number; max: number }) {
    const w = span.max - span.min + 400;
    const geo = new THREE.PlaneGeometry(w, 260, 110, 52);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const near = new THREE.Color(this.theme.ground);
    const far = new THREE.Color(this.theme.groundFar);
    const c = new THREE.Color();
    const cx = (span.min + span.max) / 2;
    const lavaBand = !!this.theme.lava;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) - 60;
      // Flat duel strip near z = 0, rolling hills behind, gentle dip in front.
      const back = Math.max(0, -z - 8);
      let hgt = noise2(x * 0.045, z * 0.05) * Math.min(1, back / 25) * 7;
      hgt += noise2(x * 0.15, z * 0.15) * 0.35;
      if (z > 6) hgt -= Math.min(2.5, (z - 6) * 0.15);
      if (lavaBand && z < -18 && z > -46) hgt = Math.min(hgt, -0.6 - noise2(x * 0.1, z * 0.1) * 0.5);
      pos.setY(i, Math.abs(z) < 5 ? hgt * 0.1 : hgt);
      pos.setZ(i, z);
      pos.setX(i, x);
      const t = Math.min(1, Math.max(0, (-z - 4) / 70));
      c.copy(near).lerp(far, t);
      // Darker foreground edge: the stage reads as a silhouette like the reference.
      if (z > 3) c.multiplyScalar(Math.max(0.35, 1 - (z - 3) * 0.08));
      const v = 0.9 + noise2(x * 0.4, z * 0.4) * 0.1;
      colors[i * 3] = c.r * v;
      colors[i * 3 + 1] = c.g * v;
      colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private buildMountains(span: { min: number; max: number }) {
    const layers = [
      { z: -75, h: [18, 34], r: [16, 28], n: 14 },
      { z: -120, h: [30, 55], r: [26, 40], n: 12 },
      { z: -175, h: [45, 80], r: [40, 60], n: 10 },
    ];
    layers.forEach((L, li) => {
      const mat = new THREE.MeshStandardMaterial({ color: this.theme.mountains[li], roughness: 1, flatShading: true });
      const snow = new THREE.MeshStandardMaterial({ color: '#F4F8FF', roughness: 0.9, flatShading: true });
      const width = span.max - span.min + 260;
      for (let i = 0; i < L.n; i++) {
        const h = lerp(L.h[0], L.h[1], this.rnd());
        const r = lerp(L.r[0], L.r[1], this.rnd());
        const geo = new THREE.ConeGeometry(r, h, 6 + Math.floor(this.rnd() * 3), 3);
        jitter(geo, r * 0.08, this.rnd);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(span.min - 130 + (i + this.rnd() * 0.8) * (width / L.n), h / 2 - 2, L.z + (this.rnd() - 0.5) * 20);
        m.rotation.y = this.rnd() * Math.PI;
        this.group.add(m);
        if (this.theme.id === 'frost' || (li === 2 && this.theme.id === 'meadow')) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 6, 1), snow);
          cap.position.set(m.position.x, h - h * 0.16 - 2 + 0.2, m.position.z);
          cap.rotation.y = m.rotation.y;
          this.group.add(cap);
        }
      }
    });
  }

  private buildTrees(span: { min: number; max: number }) {
    const t = this.theme;
    const foliage = new THREE.MeshStandardMaterial({ color: t.foliage, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: t.trunk, roughness: 1, flatShading: true });
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
      // dead: bare forked branches
      crown = mergeCones([
        [0.12, 2.0, 2.2, 0.6],
        [0.1, 1.6, 2.0, -0.7],
        [0.08, 1.2, 2.8, 0.3],
      ]);
      crown.computeVertexNormals();
    }
    const trunk = new THREE.CylinderGeometry(0.14, 0.22, t.trees === 'dead' ? 2.6 : 1.8, 6);
    trunk.translate(0, t.trees === 'dead' ? 1.3 : 0.9, 0);
    const rows = [
      { z: [-34, -12], n: 46, s: [0.9, 1.6] },
      { z: [-60, -36], n: 40, s: [1.3, 2.2] },
      { z: [7, 14], n: 10, s: [1.2, 1.8] },
    ];
    const items: { x: number; z: number; s: number; r: number; ph: number }[] = [];
    const width = span.max - span.min + 120;
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const x = span.min - 60 + this.rnd() * width;
        const z = lerp(row.z[0], row.z[1], this.rnd());
        // Keep the foreground clear around the archers' sight line.
        if (z > 0 && this.rnd() < 0.5) continue;
        items.push({ x, z, s: lerp(row.s[0], row.s[1], this.rnd()), r: this.rnd() * Math.PI, ph: this.rnd() * 10 });
      }
    }
    const crowns = new THREE.InstancedMesh(crown, foliage, items.length);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, items.length);
    crowns.castShadow = true;
    trunks.castShadow = true;
    this.group.add(crowns, trunks);
    this.trees.push({ mesh: crowns, items, yOff, sway: 1 }, { mesh: trunks, items, yOff: 0, sway: 0.3 });
    this.updateTrees(0);
  }

  private buildScatter(span: { min: number; max: number }) {
    // Rocks and grass tufts on the duel floor, in front of and behind the line.
    const rockMat = new THREE.MeshStandardMaterial({ color: this.theme.rock, roughness: 1, flatShading: true });
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const n = 60;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const width = span.max - span.min + 80;
    for (let i = 0; i < n; i++) {
      const s = 0.3 + this.rnd() * 1.2;
      let z = -2 - this.rnd() * 20;
      if (this.rnd() < 0.3) z = 2.5 + this.rnd() * 5;
      e.set(this.rnd(), this.rnd() * 6, this.rnd());
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(span.min - 40 + this.rnd() * width, s * 0.2, z), q, new THREE.Vector3(s, s * 0.6, s));
      rocks.setMatrixAt(i, m);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.group.add(rocks);

    if (this.theme.id !== 'ember') {
      const grassMat = new THREE.MeshStandardMaterial({
        color: this.theme.id === 'frost' ? '#DCE8F2' : new THREE.Color(this.theme.foliage).multiplyScalar(1.25),
        roughness: 1,
        flatShading: true,
      });
      const blade = mergeCones([
        [0.05, 0.5, 0.25, 0.3],
        [0.05, 0.6, 0.3, -0.2],
        [0.05, 0.45, 0.22, 0.05],
      ]);
      const g = 220;
      const grass = new THREE.InstancedMesh(blade, grassMat, g);
      for (let i = 0; i < g; i++) {
        const s = 0.6 + this.rnd() * 0.9;
        const z = this.rnd() < 0.4 ? 1 + this.rnd() * 7 : -1 - this.rnd() * 14;
        e.set(0, this.rnd() * 6, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(span.min - 40 + this.rnd() * width, 0, z), q, new THREE.Vector3(s, s, s));
        grass.setMatrixAt(i, m);
      }
      this.group.add(grass);
    }
  }

  private buildClouds(span: { min: number; max: number }) {
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.cloud,
      roughness: 1,
      flatShading: true,
      transparent: this.theme.cloudOpacity < 1,
      opacity: this.theme.cloudOpacity,
      fog: false,
      emissive: new THREE.Color(this.theme.cloud),
      emissiveIntensity: 0.25,
    });
    const width = span.max - span.min + 300;
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(this.rnd() * 4);
      for (let k = 0; k < puffs; k++) {
        const r = 2.5 + this.rnd() * 3;
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
        p.position.set(k * 3.2 - puffs * 1.6, this.rnd() * 1.8, this.rnd() * 3);
        p.scale.y = 0.6;
        c.add(p);
      }
      const base = new THREE.Vector3(span.min - 150 + this.rnd() * width, 26 + this.rnd() * 26, -80 - this.rnd() * 90);
      c.position.copy(base);
      this.group.add(c);
      this.clouds.push({ o: c, base, speed: 0.6 + this.rnd() * 1.2, phase: 0 });
    }
  }

  private buildBirds(span: { min: number; max: number }) {
    const mat = new THREE.MeshBasicMaterial({ color: '#1A1A1A', side: THREE.DoubleSide });
    const wing = new THREE.PlaneGeometry(0.7, 0.18);
    wing.translate(0.35, 0, 0);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      r.rotation.y = Math.PI;
      b.add(l, r);
      const base = new THREE.Vector3(span.min + this.rnd() * (span.max - span.min), 14 + this.rnd() * 10, -20 - this.rnd() * 25);
      b.position.copy(base);
      this.group.add(b);
      this.birds.push({ o: b, base, speed: 3 + this.rnd() * 2, phase: this.rnd() * 10 });
    }
  }

  private buildLava(span: { min: number; max: number }) {
    this.lava = new THREE.MeshStandardMaterial({
      color: '#FF4A10',
      emissive: new THREE.Color(this.theme.lava),
      emissiveIntensity: 1.6,
      roughness: 0.4,
      fog: true,
    });
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(span.max - span.min + 300, 30, 1, 1), this.lava);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set((span.min + span.max) / 2, -0.35, -32);
    this.group.add(lake);
    const glow = new THREE.PointLight(this.theme.lava, 40, 60, 1.6);
    glow.position.set((span.min + span.max) / 2, 3, -26);
    this.group.add(glow);
  }

  private buildWeather() {
    const t = this.theme;
    if (t.weather === 'rain') {
      const n = 360;
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
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: t.weatherColor, transparent: true, opacity: 0.45 }));
      lines.frustumCulled = false;
      this.weather = lines;
      this.group.add(lines);
      return;
    }
    const n = t.weather === 'fireflies' ? 90 : t.weather === 'snow' ? 520 : t.weather === 'embers' ? 220 : 160;
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
    const additive = t.weather === 'embers' || t.weather === 'fireflies';
    const size = t.weather === 'snow' ? 0.12 : t.weather === 'fireflies' ? 0.22 : t.weather === 'embers' ? 0.14 : 0.08;
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: t.weatherColor,
        size,
        map: dotTexture(),
        transparent: true,
        depthWrite: false,
        opacity: t.weather === 'dust' ? 0.5 : 0.95,
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
    // Shadow frustum and weather volume follow the action.
    const sd = new THREE.Vector3(...this.theme.sunDir).normalize();
    this.sun.position.set(focus.x + sd.x * 30, Math.max(8, focus.y + sd.y * 30), sd.z * 30);
    this.sun.target.position.set(focus.x, focus.y - 2, 0);
    this.sun.target.updateMatrixWorld();

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
    this.updateTrees(t);
    this.updateFlags(t);
    this.updateWeather(t, dt, focus);

    if (this.lava) this.lava.emissiveIntensity = 1.4 + Math.sin(t * 1.7) * 0.35 + Math.sin(t * 4.3) * 0.12;

    // Storm lightning: brief double flash every few seconds.
    if (this.theme.weather === 'rain') {
      this.lightningAt -= dt;
      if (this.lightningAt <= 0) {
        this.flash = 1;
        this.lightningAt = 4 + this.rnd() * 7;
      }
      this.flash = Math.max(0, this.flash - dt * 3.5);
      // Two strobes: bright, dark gap, dimmer echo.
      const f = this.flash > 0.5 ? this.flash : this.flash > 0.3 ? 0 : this.flash * 2;
      this.hemi.intensity = this.hemiBase + f * 3;
    }
  }

  private updateTrees(t: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (const tr of this.trees) {
      tr.items.forEach((it, i) => {
        const sway = Math.sin(t * 1.3 + it.ph) * 0.035 + Math.sin(t * 2.9 + it.ph * 2) * 0.012;
        e.set(0, it.r, sway * tr.sway);
        q.setFromEuler(e);
        s.setScalar(it.s);
        p.set(it.x, tr.yOff * it.s, it.z);
        m.compose(p, q, s);
        tr.mesh.setMatrixAt(i, m);
      });
      tr.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateFlags(t: number) {
    for (const f of this.flags) {
      if (!f) continue;
      const pos = f.cloth.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3];
        const y = f.base[i * 3 + 1];
        const k = -x; // 0 at the pole → 1 at the tip
        pos.setZ(i, Math.sin(t * 6 + x * 7) * 0.12 * k + Math.sin(t * 3.1 + y * 5) * 0.03 * k);
        pos.setY(i, y - k * k * 0.08 + Math.sin(t * 5 + x * 5) * 0.02 * k);
      }
      pos.needsUpdate = true;
      f.cloth.geometry.computeVertexNormals();
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
