// Signed distance fields for sculpting the hero characters offline
// (scripts/heroes/bake.ts). Negative inside, positive outside, in whatever
// units the caller works in. Plain numbers, no three.js: the bake runs under
// bun and only its output ships in the app.

export type V3 = [number, number, number];
export type SDF = (x: number, y: number, z: number) => number;

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Polynomial smooth union / subtraction / intersection (k = blend radius).
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export const sphere =
  (c: V3, r: number): SDF =>
  (x, y, z) =>
    Math.hypot(x - c[0], y - c[1], z - c[2]) - r;

// Ellipsoid (Inigo Quilez's bound; good near the surface).
export function ellipsoid(c: V3, r: V3, rot?: { y?: number; z?: number; x?: number }): SDF {
  const R = rotation(rot);
  return (x, y, z) => {
    let px = x - c[0];
    let py = y - c[1];
    let pz = z - c[2];
    if (R) [px, py, pz] = R(px, py, pz);
    const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
    return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
  };
}

// Segment a→b with radius ra at a, rb at b (round cone; ra = rb is a capsule).
export function capsule(a: V3, b: V3, ra: number, rb = ra): SDF {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  return (x, y, z) => {
    const px = x - a[0];
    const py = y - a[1];
    const pz = z - a[2];
    const h = clamp((px * bx + py * by + pz * bz) / l2);
    return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - mix(ra, rb, h);
  };
}

// Rounded box centred at c with half-size s and corner radius r.
export function roundBox(c: V3, s: V3, r: number, rot?: { y?: number; z?: number; x?: number }): SDF {
  const R = rotation(rot);
  return (x, y, z) => {
    let px = x - c[0];
    let py = y - c[1];
    let pz = z - c[2];
    if (R) [px, py, pz] = R(px, py, pz);
    const qx = Math.abs(px) - s[0] + r;
    const qy = Math.abs(py) - s[1] + r;
    const qz = Math.abs(pz) - s[2] + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

// Torus in the plane perpendicular to `axis` ('x' | 'y' | 'z').
export function torus(c: V3, R: number, r: number, axis: 'x' | 'y' | 'z' = 'y'): SDF {
  return (x, y, z) => {
    const px = x - c[0];
    const py = y - c[1];
    const pz = z - c[2];
    const [u, v, w] = axis === 'y' ? [px, pz, py] : axis === 'x' ? [py, pz, px] : [px, py, pz];
    return Math.hypot(Math.hypot(u, v) - R, w) - r;
  };
}

// Inverse rotation (world → local) for the given Euler angles (XYZ order).
function rotation(rot?: { x?: number; y?: number; z?: number }) {
  if (!rot || (!rot.x && !rot.y && !rot.z)) return null;
  const cx = Math.cos(rot.x ?? 0);
  const sx = Math.sin(rot.x ?? 0);
  const cy = Math.cos(rot.y ?? 0);
  const sy = Math.sin(rot.y ?? 0);
  const cz = Math.cos(rot.z ?? 0);
  const sz = Math.sin(rot.z ?? 0);
  return (x: number, y: number, z: number): V3 => {
    // Undo Z, then Y, then X.
    let px = cz * x + sz * y;
    let py = -sz * x + cz * y;
    let pz = z;
    const qx = cy * px - sy * pz;
    pz = sy * px + cy * pz;
    px = qx;
    const qy = cx * py + sx * pz;
    pz = -sx * py + cx * pz;
    py = qy;
    return [px, py, pz];
  };
}

export const union = (k: number, ...fs: SDF[]): SDF =>
  fs.length === 1
    ? fs[0]
    : (x, y, z) => {
        let d = fs[0](x, y, z);
        for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k);
        return d;
      };

// Cheap smooth value noise in 3D (hash on the lattice, quintic fade).
function hash(i: number, j: number, k: number, seed: number) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x: number, y: number, z: number, seed = 0) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const fx = x - i;
  const fy = y - j;
  const fz = z - k;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(
    L(L(hash(i, j, k, seed), hash(i + 1, j, k, seed), u), L(hash(i, j + 1, k, seed), hash(i + 1, j + 1, k, seed), u), v),
    L(L(hash(i, j, k + 1, seed), hash(i + 1, j, k + 1, seed), u), L(hash(i, j + 1, k + 1, seed), hash(i + 1, j + 1, k + 1, seed), u), v),
    w,
  );
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
