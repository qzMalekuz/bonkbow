import * as THREE from 'three';
import { mulberry32 } from '@/game/rng';
import type { Mood } from '@/game3d/sim';
import type { HeroSpec } from '@/game3d/heroSpecs';

// Sculpted chibi head for a hero character, built from a HeroSpec: skull,
// ears, nose, eyes, hair, beard and accessories are merged into ONE
// vertex-coloured mesh per hero (cached, shared by every rig wearing it).
// Only what an expression moves stays separate: four eyelids, two brows and
// the mouth — plain transforms, no morph targets, no textures.
//
// Head space (units of the head radius): +x = face forward, +y = up,
// +z = the archer's right. Places on the head are given as az (radians
// around the neck, 0 = nose) and el (radians above the eye line).

type Dir = { x: number; y: number; z: number; az: number; el: number };
type Field = (d: Dir) => number; // > 0 inside a region, fading through 0 at its edge

const sat = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (m: number) => Math.sin(sat(m) * Math.PI * 0.5);

function dirOf(az: number, el: number, o: Dir): Dir {
  const c = Math.cos(el);
  o.x = c * Math.cos(az);
  o.y = Math.sin(el);
  o.z = c * Math.sin(az);
  o.az = az;
  o.el = el;
  return o;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d: Dir = { x: 0, y: 0, z: 0, az: 0, el: 0 };

function trs(px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
  return _m.compose(_p.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Collects placed, tinted parts and bakes them into one geometry.
class Sculpt {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.Color, m: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const p = g.getAttribute('position').array;
    const n = g.getAttribute('normal').array;
    for (let i = 0; i < p.length; i += 3) this.vert(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2], color);
    g.dispose();
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
  }

  // Run every vertex added so far through `fn` (bends flat parts onto the face).
  warp(fn: (v: THREE.Vector3) => void) {
    for (let i = 0; i < this.pos.length; i += 3) {
      fn(_p.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]));
      this.pos[i] = _p.x;
      this.pos[i + 1] = _p.y;
      this.pos[i + 2] = _p.z;
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    return g;
  }
}

const BLOB = new THREE.SphereGeometry(1, 10, 7);
const BLOB_HI = new THREE.SphereGeometry(1, 16, 12);
const BLOB_LO = new THREE.SphereGeometry(1, 8, 5);
// A pillow: a ball squared off across y and z (sunglass lenses).
const PILLOW = (() => {
  const g = new THREE.SphereGeometry(1, 16, 12);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), Math.sign(p.getY(i)) * Math.abs(p.getY(i)) ** 0.5, Math.sign(p.getZ(i)) * Math.abs(p.getZ(i)) ** 0.5);
  g.computeVertexNormals();
  return g;
})();

type Shape = (d: Dir, o: THREE.Vector3) => THREE.Vector3;

// A skin-hugging layer: the head's lat/long grid, pushed out by `lift` where
// `field` is positive and tucked under the skull elsewhere, so the visible
// edge is a smooth contour rather than a stair-step of triangles. With a
// constant field it is the skull itself.
function shell(
  out: Sculpt,
  shape: Shape,
  W: number,
  H: number,
  field: Field,
  lift: (m: number, d: Dir) => number,
  drop: ((m: number, d: Dir) => number) | null,
  color: (d: Dir, m: number) => THREE.Color,
) {
  const cols = W + 1;
  const n = (H + 1) * cols;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const C = new Float32Array(n * 3);
  const M = new Float32Array(n);
  for (let i = 0; i <= H; i++) {
    for (let j = 0; j <= W; j++) {
      // Seam at the back of the head (az = ±π).
      const d = dirOf((j / W) * Math.PI * 2 - Math.PI, Math.PI / 2 - (i / H) * Math.PI, _d);
      const m = field(d);
      shape(d, _a).multiplyScalar(m > 0 ? 1 + lift(m, d) : 1 + 0.06 * Math.max(m, -1));
      if (drop && m > 0) _a.y -= drop(m, d);
      const k = i * cols + j;
      M[k] = m;
      P[k * 3] = _a.x;
      P[k * 3 + 1] = _a.y;
      P[k * 3 + 2] = _a.z;
      const c = color(d, m);
      C[k * 3] = c.r;
      C[k * 3 + 1] = c.g;
      C[k * 3 + 2] = c.b;
    }
  }
  const tris: number[] = [];
  const face = (a: number, b: number, c: number) => {
    _a.fromArray(P, a * 3);
    _b.fromArray(P, b * 3).sub(_a);
    _c.fromArray(P, c * 3).sub(_a);
    _b.cross(_c); // area-weighted face normal
    if (_b.lengthSq() < 1e-12) return;
    for (const v of [a, b, c]) {
      N[v * 3] += _b.x;
      N[v * 3 + 1] += _b.y;
      N[v * 3 + 2] += _b.z;
    }
    if (M[a] > 0 || M[b] > 0 || M[c] > 0) tris.push(a, b, c);
  };
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      face(a, b, c);
      face(b, c + 1, c);
    }
  }
  // Smooth across the seam and at the poles (grid duplicates those points).
  const share = (ids: number[]) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const v of ids) {
      x += N[v * 3];
      y += N[v * 3 + 1];
      z += N[v * 3 + 2];
    }
    for (const v of ids) {
      N[v * 3] = x;
      N[v * 3 + 1] = y;
      N[v * 3 + 2] = z;
    }
  };
  for (let i = 1; i < H; i++) share([i * cols, i * cols + W]);
  share(Array.from({ length: cols }, (_, j) => j));
  share(Array.from({ length: cols }, (_, j) => H * cols + j));
  const col = new THREE.Color();
  for (const v of tris) {
    _a.fromArray(N, v * 3).normalize();
    out.vert(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], _a.x, _a.y, _a.z, col.fromArray(C, v * 3));
  }
}

type EyeAt = { x: number; y: number; z: number; yaw: number; r: number };
type HeadGeo = {
  head: THREE.BufferGeometry;
  gloss: THREE.BufferGeometry | null; // shiny accessories (sunglasses)
  lidU: THREE.BufferGeometry;
  lidL: THREE.BufferGeometry;
  brow: THREE.BufferGeometry;
  eyes: EyeAt[]; // [right (+z), left (−z)]; empty behind glasses
  brows: { x: number; y: number; z: number; az: number }[];
  mouth: { x: number; y: number; z: number };
};

const EYE_AZ = 0.37;
const EYE_EL = -0.03;
const EYE_FLAT = 0.55; // eyeballs are flattened front to back
const MOUTH_EL = -0.53;

// 1 at the crown (up and a little back), falling toward the face and nape:
// thresholds on this draw every hairline.
const crown = (d: Dir) => d.x * -0.35 + d.y * 0.937;
// The strip in front of each ear, joining hair to beard.
const sideburn = (d: Dir) => {
  const A = Math.abs(d.az);
  return Math.min((A - 1.12) / 0.2, (1.46 - A) / 0.1, (d.el + 0.15) / 0.2, (0.6 - d.el) / 0.1);
};

// Jaw, chin and moustache, with an opening for the mouth. `cheek` is how
// high the beard starts at the mouth corners (el); it climbs to the sideburn.
function beardField(cheek: number): Field {
  return (d) => {
    const A = Math.abs(d.az);
    const top = A < 0.42 ? -0.3 : cheek + (0.04 - cheek) * sat((A - 0.42) / 0.85) ** 2.2;
    const hole = Math.hypot(d.az / 0.36, (d.el - MOUTH_EL) / 0.11) - 1;
    return Math.min((top - d.el) / 0.12, (1.44 - A) / 0.12, hole / 0.35);
  };
}

const HAIR = {
  // paint: [start, width, strength] of the skin-to-hair fade on the scalp;
  // cap: [start, width] of the raised hair; lift: its thickness.
  textured: { paint: [-0.06, 0.36, 0.9], cap: [0.42, 0.14], lift: 0.1 },
  neat: { paint: [-0.03, 0.22, 0.9], cap: [0.42, 0.14], lift: 0.065 },
  quiff: { paint: [-0.04, 0.28, 0.88], cap: [0.4, 0.14], lift: 0.085 },
  curls: { paint: [0.0, 0.2, 0.9], cap: [0.3, 0.16], lift: 0.08 },
} as const;

const BEARD = {
  // cheek line, thickness, how far the chin hangs, painted shadow strength
  stubble: { cheek: -0.34, lift: 0, drop: 0, paint: 0.6 },
  short: { cheek: -0.4, lift: 0.05, drop: 0.03, paint: 0.55 },
  full: { cheek: -0.34, lift: 0.09, drop: 0.14, paint: 0.6 },
  long: { cheek: -0.3, lift: 0.13, drop: 0.22, paint: 0.4 },
} as const;

function buildHead(spec: HeroSpec): HeadGeo {
  const s = new Sculpt();
  const rnd = mulberry32(spec.id.length * 7919 + spec.id.charCodeAt(0) * 131 + spec.id.charCodeAt(1));
  const skin = new THREE.Color(spec.skin);
  const skinDeep = skin.clone().multiplyScalar(0.8);
  const hairC = new THREE.Color(spec.hair.color);
  const hairT = new THREE.Color(spec.hair.tint);
  const beardC = new THREE.Color(spec.beard.color);
  const beardT = new THREE.Color(spec.beard.tint);
  const tmp = new THREE.Color();

  const [kx, ky, kz] = spec.skull;
  // Ball of a head with fuller cheeks below the eye line.
  const shape: Shape = (d, o) => {
    const cheek = 1 + 0.07 * Math.exp(-(((d.y + 0.4) / 0.33) ** 2));
    return o.set(d.x * kx * cheek, d.y * ky, d.z * kz * cheek);
  };
  const at = (az: number, el: number, out = 1) => shape(dirOf(az, el, _d), new THREE.Vector3()).multiplyScalar(out);

  const hair = spec.hair.style === 'bald' ? null : HAIR[spec.hair.style];
  const beard = spec.beard.style === 'none' ? null : BEARD[spec.beard.style];
  const jaw = beard ? beardField(beard.cheek) : null;

  // --- skull, with the fade and the stubble painted into its colours -------
  shell(
    s,
    shape,
    72,
    48,
    () => 1,
    () => 0,
    null,
    (d) => {
      tmp.copy(skin);
      if (hair) {
        // The fade runs round the sides and back; over the forehead the
        // hairline is a clean edge.
        const side = sat((Math.abs(d.az) - 0.75) / 0.5);
        const from = hair.cap[0] - 0.05 + (hair.paint[0] - hair.cap[0] + 0.05) * side;
        const width = 0.06 + (hair.paint[1] - 0.06) * side;
        tmp.lerp(hairC, sat(Math.max((crown(d) - from) / width, beard ? sideburn(d) * 0.8 : -1)) * hair.paint[2]);
      }
      if (jaw && beard) tmp.lerp(beardC, sat(jaw(d) * 0.7 + 0.4) * beard.paint);
      return tmp;
    },
  );

  // --- ears and nose -------------------------------------------------------
  for (const side of [1, -1]) {
    const e = spec.ears;
    s.add(BLOB, skin, trs(-0.04, -0.06, side * kz * 1.0, 0.13 * e, 0.2 * e, 0.085 * e, 0, side * -0.25, 0));
    s.add(BLOB, skinDeep, trs(0.0, -0.06, side * (kz * 1.0 + 0.045 * e), 0.07 * e, 0.12 * e, 0.05 * e, 0, side * -0.25, 0));
  }
  const nose = at(0, -0.2, 0.99);
  s.add(BLOB, tmp.copy(skin).lerp(new THREE.Color('#D9705A'), 0.14), trs(nose.x, nose.y, nose.z, 0.12, 0.1, 0.125));

  // --- hair ----------------------------------------------------------------
  if (hair) {
    const strand = (k: number) => tmp.copy(hairC).lerp(hairT, k);
    shell(
      s,
      shape,
      72,
      48,
      (d) => (crown(d) - hair.cap[0]) / hair.cap[1],
      (m) => hair.lift * ease(m),
      null,
      (d) => strand(0.25 + 0.25 * Math.sin(d.az * 11 + d.el * 5)),
    );
    // A tuft lying on the scalp along `flow`, tipped up by `tilt`.
    const flow = new THREE.Vector3();
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3();
    const Z = new THREE.Vector3();
    const tuft = (az: number, el: number, out: number, tilt: number, len: number, thick: number, wid: number, k: number) => {
      const d = dirOf(az, el, _d);
      const nrm = _a.set(d.x, d.y, d.z);
      const f = _b.copy(flow).addScaledVector(nrm, -flow.dot(nrm));
      if (f.lengthSq() < 1e-6) f.set(1, 0, 0);
      f.normalize();
      X.copy(f).multiplyScalar(Math.cos(tilt)).addScaledVector(nrm, Math.sin(tilt));
      Y.copy(nrm).multiplyScalar(Math.cos(tilt)).addScaledVector(f, -Math.sin(tilt));
      Z.crossVectors(X, Y);
      shape(d, _c).multiplyScalar(out);
      s.add(BLOB, strand(k), _m.makeBasis(X, Y, Z).scale(_s.set(len, thick, wid)).setPosition(_c));
    };
    // Scatter tufts over the part of the scalp where crown() > `from`.
    const scatter = (count: number, from: number, place: (az: number, el: number) => void) => {
      for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
        const az = (rnd() * 2 - 1) * Math.PI;
        const el = Math.asin(rnd());
        if (crown(dirOf(az, el, _d)) < from) continue;
        place(az, el);
        i++;
      }
    };
    const top = 1 + hair.lift;
    if (spec.hair.style === 'textured') {
      // Short choppy crop pushed forward, standing up at the fringe.
      scatter(38, 0.5, (az, el) => {
        flow.set(1, 0.35, (rnd() - 0.5) * 1.2);
        const front = sat(Math.cos(az)) * sat(1.3 - el);
        tuft(az, el, top + 0.02 + front * 0.04, 0.3 + front * 0.5 + rnd() * 0.25, 0.2 + rnd() * 0.07, 0.09 + rnd() * 0.04, 0.11, rnd());
      });
    } else if (spec.hair.style === 'neat') {
      // Close crop: a few low locks combed forward.
      scatter(18, 0.5, (az, el) => {
        flow.set(1, 0.1, (rnd() - 0.5) * 0.8);
        tuft(az, el, top, 0.12 + rnd() * 0.1, 0.2, 0.05, 0.11, rnd());
      });
    } else if (spec.hair.style === 'quiff') {
      // Top swept up and across from a side part; neat elsewhere.
      scatter(14, 0.6, (az, el) => {
        flow.set(0.6, 0.2, -1);
        tuft(az, el, top, 0.15, 0.22, 0.06, 0.11, rnd());
      });
      for (let i = 0; i < 9; i++) {
        const k = i / 8;
        flow.set(0.5, 1, -0.9);
        tuft(0.75 - k * 1.5, 0.92 + Math.sin(k * Math.PI) * 0.12 + rnd() * 0.06, top + 0.06 + Math.sin(k * Math.PI) * 0.08, 0.75, 0.27, 0.11, 0.13, 0.3 + rnd() * 0.7);
      }
    } else {
      // Curls: a shoulder-length cloud of ringlets around a darker core,
      // parted in the middle and open around the face.
      s.add(BLOB_HI, tmp.copy(hairC).multiplyScalar(0.55), trs(-0.3, -0.32, 0, 0.9, 1.08, 1.1));
      const N = 170;
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.39996;
        // Narrower over the crown, widest at the jaw, down to the shoulders.
        const flare = 1 - 0.14 * Math.max(0, y);
        const px = -0.16 + Math.cos(a) * r * 1.08 * flare;
        const py = -0.3 + y * (y > 0 ? 1.28 : 1.12);
        const pz = Math.sin(a) * r * 1.24 * flare;
        if (px > 0.3 && Math.abs(pz) < 0.84 && py < 0.58) continue; // the face
        if (py < -1.0 && px > -0.45) continue; // neck and chest
        const part = py > 0.6 && Math.abs(pz) < 0.12 ? 0.93 : 1;
        const size = 0.15 + rnd() * 0.07;
        s.add(BLOB_LO, strand(rnd()), trs(px, py * part, pz, size, size * (0.85 + rnd() * 0.3), size, rnd() * 3, rnd() * 3, 0));
      }
    }
  }

  // --- beard and moustache -------------------------------------------------
  if (jaw && beard && beard.lift > 0) {
    shell(
      s,
      shape,
      72,
      48,
      jaw,
      (m) => beard.lift * ease(m),
      (m, d) => beard.drop * ease(m) * sat((-d.el - 0.35) / 0.45) * Math.exp(-((d.az / 1.25) ** 2)),
      (d) => tmp.copy(beardC).lerp(beardT, 0.5 + 0.5 * Math.sin(d.az * 13 + d.el * 9)),
    );
  }
  if (spec.mustache === 'thin') {
    for (const side of [1, -1]) {
      const p = at(side * 0.15, -0.37, 1.005);
      s.add(BLOB, beardC, trs(p.x, p.y, p.z, 0.028, 0.022, 0.17, side * 0.2, side * -0.15, 0));
    }
  }

  // --- eyes (or the shades that hide them) ---------------------------------
  const eyes: EyeAt[] = [];
  let gloss: Sculpt | null = null;
  if (spec.glasses) {
    gloss = new Sculpt();
    const black = new THREE.Color('#0A0A0D');
    for (const side of [1, -1]) {
      const p = at(side * 0.38, 0.0, 1.03);
      gloss.add(PILLOW, black, trs(p.x, p.y, p.z, 0.07, 0.17, 0.3, side * 0.1, side * -0.4, 0));
    }
    const bridge = at(0, 0.04, 1.03);
    gloss.add(BLOB, black, trs(bridge.x, bridge.y, bridge.z, 0.05, 0.06, 0.12));
    // Wraparound arms: a band from temple to temple round the back of the lenses.
    const band = new THREE.TorusGeometry(1.0, 0.028, 6, 40, 2.9);
    band.rotateZ(-1.45).rotateX(Math.PI / 2);
    gloss.add(band, black, trs(0, 0.05, 0, kx, 2.2, kz));
    band.dispose();
  } else {
    const white = new THREE.Color('#F6F2EC');
    const iris = new THREE.Color(spec.eyes.iris);
    const pupil = new THREE.Color('#0B0908');
    const r = 0.225 * spec.eyes.size;
    for (const side of [1, -1]) {
      const p = at(side * EYE_AZ, EYE_EL, 0.9);
      const yaw = side * -EYE_AZ * 0.55;
      eyes.push({ x: p.x, y: p.y, z: p.z, yaw, r });
      const eye = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(r * EYE_FLAT, r, r));
      const part = (color: THREE.Color, x: number, y: number, z: number, depth: number, size: number) => s.add(BLOB_HI, color, trs(x, y, z, depth, size, size).premultiply(eye));
      part(white, 0, 0, 0, 1, 1);
      part(iris, 0.76, 0, 0, 0.27, 0.6);
      part(pupil, 0.87, 0, 0, 0.17, 0.36);
      part(white, 1.0, 0.2, 0.2, 0.07, 0.1);
    }
  }

  // --- the moving parts ----------------------------------------------------
  // Lids are half-domes over the eyeball; the upper one carries the lash line.
  const lash = skin.clone().multiplyScalar(0.28);
  const lid = (upper: boolean) => {
    const l = new Sculpt();
    const dome = new THREE.SphereGeometry(upper ? 1.1 : 1.05, 14, 5, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2);
    l.add(dome, skin, _m.identity());
    dome.dispose();
    if (upper) {
      const rim = new THREE.TorusGeometry(1.1, 0.035, 4, 16).rotateX(Math.PI / 2);
      l.add(rim, lash, _m.identity());
      rim.dispose();
    }
    return l.build();
  };
  const browS = new Sculpt();
  const cap = new THREE.CapsuleGeometry(0.058, 0.28, 3, 8).rotateX(Math.PI / 2);
  browS.add(cap, new THREE.Color(spec.brows.color), trs(0, 0, 0, 0.7, 0.85 * spec.brows.weight, 1));
  cap.dispose();
  browS.warp((v) => {
    v.y -= 1.1 * v.z * v.z;
    v.x -= 0.6 * v.z * v.z;
  });
  const browEl = EYE_EL + 0.1 + 0.25 * spec.eyes.size + spec.brows.lift;
  const brows = [1, -1].map((side) => {
    const p = at(side * 0.38, browEl, spec.glasses ? 1.06 : 1.04);
    return { x: p.x, y: p.y, z: p.z, az: side * 0.38 };
  });
  const mouth = at(0, MOUTH_EL, beard && beard.lift > 0 ? 1.02 : 1.0);

  return {
    head: s.build(),
    gloss: gloss ? gloss.build() : null,
    lidU: lid(true),
    lidL: lid(false),
    brow: browS.build(),
    eyes,
    brows,
    mouth: { x: mouth.x, y: mouth.y, z: mouth.z },
  };
}

const heads = new Map<string, HeadGeo>();
function headGeo(spec: HeroSpec) {
  let g = heads.get(spec.id);
  if (!g) {
    g = buildHead(spec);
    heads.set(spec.id, g);
  }
  return g;
}

// Mouth parts, shared by every hero (unlit: they read at any light angle).
const LIP_R = 0.24;
const LIP_ARC = 1.6;
let lipGeo: THREE.BufferGeometry | null = null;
let openGeo: THREE.BufferGeometry | null = null;
const LIP_MAT = new THREE.MeshBasicMaterial({ color: '#5E2F2A' });
const OPEN_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });
const GLOSS_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: new THREE.Color(0x8a8a90) });

function mouthGeos() {
  if (!lipGeo || !openGeo) {
    // Lip: the bottom of a circle, centred so scaling y flips smile ↔ frown.
    const lip = new THREE.TorusGeometry(LIP_R, 0.02, 5, 12, LIP_ARC);
    lip.rotateZ(-Math.PI / 2 - LIP_ARC / 2);
    lip.translate(0, (LIP_R * (1 + Math.cos(LIP_ARC / 2))) / 2, 0);
    lip.rotateY(Math.PI / 2);
    const lp = lip.getAttribute('position');
    for (let i = 0; i < lp.count; i++) lp.setX(i, lp.getX(i) - 0.5 * lp.getZ(i) ** 2);
    lipGeo = lip;
    // Open mouth: dark cavity, a row of teeth, a tongue; curved like a grin.
    const o = new Sculpt();
    o.add(BLOB_HI, new THREE.Color('#3A1216'), trs(0, 0, 0, 0.03, 0.12, 0.25));
    o.add(BLOB, new THREE.Color('#FBF8F2'), trs(0.014, 0.06, 0, 0.03, 0.055, 0.2));
    o.add(BLOB, new THREE.Color('#C2575A'), trs(0.012, -0.065, 0, 0.03, 0.04, 0.13));
    o.warp((v) => {
      v.y += 0.8 * v.z * v.z;
      v.x -= 0.5 * v.z * v.z;
    });
    openGeo = o.build();
  }
  return { lip: lipGeo, open: openGeo };
}

// An expression: lids 0 open … 1 shut (upper may go negative = wide-eyed;
// lower above 1 pushes up into a happy squint), brows, mouth.
type Face = { lidU: number; lidL: number; lift: number; tilt: number; smile: number; open: number; wide: number };
const F = (lidU: number, lidL: number, lift: number, tilt: number, smile: number, open: number, wide: number): Face => ({ lidU, lidL, lift, tilt, smile, open, wide });

const MOODS: Record<Mood, Face> = {
  neutral: F(0.08, 0.15, 0, 0, 0, 0, 1), // mouth comes from the hero's resting face
  angry: F(0.3, 0.35, -0.04, 0.75, -0.7, 0.25, 1),
  happy: F(0.15, 0.6, 0.04, -0.1, 1, 0.5, 1.05),
  laugh: F(0.3, 1.3, 0.06, -0.15, 1, 0.9, 1.05),
  hurt: F(0.75, 0.9, -0.03, 0.55, -0.8, 0.5, 0.9),
  sad: F(0.42, 0.2, -0.02, -0.7, -0.9, 0, 0.9),
  shock: F(-0.25, 0, 0.1, -0.2, 0, 1.5, 0.5),
  dead: F(1, 0.1, 0, -0.5, -0.5, 0.3, 0.7),
  smug: F(0.45, 0.4, 0.03, 0.2, 0.7, 0, 1),
  wink: F(0.15, 0.6, 0.05, -0.1, 1, 0.45, 1),
  sleepy: F(0.7, 0.2, -0.02, -0.3, 0, 0, 1),
  scared: F(-0.25, 0, 0.09, -0.75, -0.4, 0.7, 0.65),
};
// Aiming: narrowed eyes, lowered brows, mouth set.
const FOCUS = F(0.32, 0.45, -0.03, 0.4, -0.2, 0, 0.95);

export class HeroHead {
  readonly group = new THREE.Group();
  private mat: THREE.MeshPhongMaterial;
  private lids: { u: THREE.Mesh; l: THREE.Mesh }[] = [];
  private brows: { pivot: THREE.Group; y: number; side: number }[] = [];
  private lip: THREE.Mesh;
  private open: THREE.Mesh;
  private rest: Face;
  private restTilt: number;
  private cur: Face;
  private wink = 0;

  // Sphere filled by the head, hair and beard, in the head group's parent
  // space (the rig keeps hands out of it).
  readonly bounds: { center: THREE.Vector3; radius: number };

  constructor(spec: HeroSpec, R: number) {
    const geo = headGeo(spec);
    if (!geo.head.boundingSphere) geo.head.computeBoundingSphere();
    const bs = geo.head.boundingSphere!;
    this.bounds = { center: bs.center.clone().multiplyScalar(R), radius: bs.radius * R };
    // One material per head so the hit flash can tint it; brows and lids
    // carry their colours per vertex and share it.
    this.mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 22, specular: new THREE.Color(0x2a2622) });
    this.group.scale.setScalar(R);
    this.group.add(new THREE.Mesh(geo.head, this.mat));
    if (geo.gloss) this.group.add(new THREE.Mesh(geo.gloss, GLOSS_MAT));

    for (const e of geo.eyes) {
      const eye = new THREE.Group();
      eye.position.set(e.x, e.y, e.z);
      eye.rotation.y = e.yaw;
      eye.scale.set(e.r * EYE_FLAT, e.r, e.r);
      const u = new THREE.Mesh(geo.lidU, this.mat);
      const l = new THREE.Mesh(geo.lidL, this.mat);
      eye.add(u, l);
      this.lids.push({ u, l });
      this.group.add(eye);
    }
    for (const b of geo.brows) {
      const pivot = new THREE.Group();
      pivot.position.set(b.x, b.y, b.z);
      pivot.rotation.y = -b.az;
      const mesh = new THREE.Mesh(geo.brow, this.mat);
      pivot.add(mesh);
      this.brows.push({ pivot, y: b.y, side: Math.sign(b.az) });
      this.group.add(pivot);
    }
    const mg = mouthGeos();
    const mouth = new THREE.Group();
    mouth.position.set(geo.mouth.x, geo.mouth.y, geo.mouth.z);
    mouth.rotation.z = -0.38; // lips face forward and a little down, like the chin
    this.lip = new THREE.Mesh(mg.lip, LIP_MAT);
    this.open = new THREE.Mesh(mg.open, OPEN_MAT);
    mouth.add(this.lip, this.open);
    this.group.add(mouth);

    this.rest = { ...MOODS.neutral, smile: spec.rest.smile, open: spec.rest.open };
    this.restTilt = spec.brows.tilt;
    this.cur = { ...this.rest };
    this.apply(0);
  }

  // `focus` 0..1 = how hard the archer is aiming (the draw); `flash` = hit flash.
  update(mood: Mood, t: number, dt: number, focus = 0, flash = 0) {
    const c = this.cur;
    const calm = mood === 'neutral';
    const m = calm ? this.rest : MOODS[mood];
    const fk = calm ? sat(focus * 1.4) : 0;
    const k = 1 - Math.exp(-dt * 14);
    let lidU = m.lidU + (FOCUS.lidU - m.lidU) * fk;
    // Blink now and then while the face is at rest.
    if ((calm || mood === 'happy' || mood === 'smug') && t % 4.3 < 0.13) lidU = 1;
    if (mood === 'sleepy') lidU += Math.max(0, Math.sin(t * 0.9)) * -0.25;
    c.lidU += (lidU - c.lidU) * (lidU > c.lidU ? Math.min(1, k * 2.5) : k);
    c.lidL += (m.lidL + (FOCUS.lidL - m.lidL) * fk - c.lidL) * k;
    c.lift += (m.lift + (FOCUS.lift - m.lift) * fk - c.lift) * k;
    c.tilt += (m.tilt + (FOCUS.tilt - m.tilt) * fk - c.tilt) * k;
    c.smile += (m.smile + (FOCUS.smile - m.smile) * fk - c.smile) * k;
    c.open += (m.open + (FOCUS.open - m.open) * fk - c.open) * k;
    c.wide += (m.wide + (FOCUS.wide - m.wide) * fk - c.wide) * k;
    // One eye shuts at full draw (and for the wink emote).
    this.wink += ((mood === 'wink' || fk > 0.75 ? 1 : 0) - this.wink) * k;
    const chatter = mood === 'laugh' ? Math.sin(t * 18) * 0.2 : mood === 'scared' ? Math.sin(t * 26) * 0.08 : 0;
    this.apply(chatter);
    this.mat.emissive.setRGB(flash * 0.9, flash * 0.25, flash * 0.25);
  }

  private apply(chatter: number) {
    const c = this.cur;
    for (let i = 0; i < this.lids.length; i++) {
      const shut = i === 1 ? Math.max(c.lidU, this.wink) : c.lidU;
      this.lids[i].u.rotation.z = 0.9 - 1.6 * shut;
      this.lids[i].l.rotation.z = -0.75 + 0.75 * (i === 1 ? Math.max(c.lidL, this.wink * 0.4) : c.lidL);
    }
    const tilt = Math.max(-0.8, Math.min(0.8, c.tilt + this.restTilt));
    for (const b of this.brows) {
      b.pivot.position.y = b.y + c.lift - Math.max(0, tilt) * 0.03;
      b.pivot.children[0].rotation.x = -tilt * 0.55 * b.side;
    }
    const open = Math.max(0, c.open + chatter);
    const showOpen = open > 0.06;
    this.open.visible = showOpen;
    this.lip.visible = !showOpen;
    if (showOpen) this.open.scale.set(1, open * (0.55 + 0.45 * Math.abs(c.smile)) * (c.smile < -0.15 ? -1 : 1), c.wide);
    else this.lip.scale.set(1, Math.abs(c.smile) < 0.12 ? 0.12 : c.smile, c.wide);
  }

  dispose() {
    this.group.removeFromParent();
    this.mat.dispose(); // geometry is shared between rigs and stays cached
  }
}
