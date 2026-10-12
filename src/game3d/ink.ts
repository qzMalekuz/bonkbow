import * as THREE from 'three';
import type { InkPrim } from '@/game/derps';

// Hand-scrawled ink in 3D: turns derps.ts drawing instructions into one flat,
// vertex-coloured, unlit mesh (one draw call). Every stroke is resampled and
// nudged like an unsteady mouse, and the nudge changes with `boil`, so a held
// drawing shimmers the way the launch videos do (docs/trailer/tools/derpy.py).
//
// All triangles lie in z = 0 and are written back to front in drawing order;
// with the default less-or-equal depth test the later ones win, so layering
// is just the order of the primitives — from either side of the card.
// Buffers are allocated once; a rebuild only rewrites them.

const STEP = 0.14; // resample strokes every this many units
const AMP = 0.022; // wobble amplitude, units
const DISC = 6; // segments in a round joint / cap

export class InkMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0; // vertices written
  private cap: number;
  private seed = 1;
  private stroke = 0;
  private c = new THREE.Color();
  // Scratch for resampled points (x, y pairs).
  private pts: Float32Array;

  constructor(capacityVerts = 14000) {
    this.cap = capacityVerts;
    this.pos = new Float32Array(capacityVerts * 3);
    this.col = new Float32Array(capacityVerts * 3);
    this.pts = new Float32Array(2048);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  // Draw a whole picture. `boil` picks the wobble (change it a few times a
  // second for the shimmer); the same boil gives the same lines.
  draw(prims: InkPrim[], boil: number) {
    this.n = 0;
    this.seed = (boil * 104729) | 0;
    this.stroke = 0;
    for (const p of prims) {
      if (p.k === 'blob') this.blob(p.pts, p.fill, p.w, p.col ?? '#0C0C0C');
      else if (p.k === 'line') this.line(p.pts, p.w, p.col ?? '#0C0C0C');
      else this.dot(p.c[0], p.c[1], p.r, p.col ?? '#0C0C0C');
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, this.n);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  // ---- primitives -----------------------------------------------------------

  // Filled outline: a fan from the centroid (the shapes are all star-shaped
  // around it), then the outline stroke on top.
  private blob(pts: [number, number][], fill: string, w: number, ink: string) {
    const m = this.wobble(pts, true, AMP * 1.2);
    const P = this.pts;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < m; i++) {
      cx += P[i * 2];
      cy += P[i * 2 + 1];
    }
    cx /= m;
    cy /= m;
    this.c.set(fill);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      this.tri(cx, cy, P[i * 2], P[i * 2 + 1], P[j * 2], P[j * 2 + 1]);
    }
    this.c.set(ink);
    this.strokePts(m, true, w);
  }

  private line(pts: [number, number][], w: number, ink: string) {
    const m = this.wobble(pts, false, AMP * 0.8);
    this.c.set(ink);
    this.strokePts(m, false, w);
  }

  private dot(x: number, y: number, r: number, ink: string) {
    this.c.set(ink);
    this.disc(x + this.rnd() * AMP * 0.4, y + this.rnd() * AMP * 0.4, r, 8);
  }

  // Quads along the scratch polyline, round joints and caps.
  private strokePts(m: number, closed: boolean, w: number) {
    const P = this.pts;
    const h = w / 2;
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % m;
      const ax = P[i * 2];
      const ay = P[i * 2 + 1];
      const bx = P[j * 2];
      const by = P[j * 2 + 1];
      let nx = -(by - ay);
      let ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      nx = (nx / len) * h;
      ny = (ny / len) * h;
      this.tri(ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny);
      this.tri(bx + nx, by + ny, ax - nx, ay - ny, bx - nx, by - ny);
    }
    for (let i = 0; i < m; i++) this.disc(P[i * 2], P[i * 2 + 1], h, DISC);
  }

  private disc(x: number, y: number, r: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.tri(x, y, x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
  }

  private tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
    if (this.n + 3 > this.cap) return;
    const p = this.pos;
    const c = this.col;
    const o = this.n * 3;
    p[o] = ax;
    p[o + 1] = ay;
    p[o + 2] = 0;
    p[o + 3] = bx;
    p[o + 4] = by;
    p[o + 5] = 0;
    p[o + 6] = cx;
    p[o + 7] = cy;
    p[o + 8] = 0;
    for (let k = 0; k < 9; k += 3) {
      c[o + k] = this.c.r;
      c[o + k + 1] = this.c.g;
      c[o + k + 2] = this.c.b;
    }
    this.n += 3;
  }

  // Resample a polyline into the scratch buffer with a per-stroke wobble;
  // returns the point count. Closed outlines don't repeat the first point.
  private wobble(src: [number, number][], closed: boolean, amp: number) {
    this.stroke += 1;
    this.state = (this.seed ^ (this.stroke * 7919)) | 0;
    const P = this.pts;
    const max = P.length / 2 - 1;
    let m = 0;
    const count = closed ? src.length : src.length - 1;
    for (let i = 0; i < count && m < max; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.round(L / STEP));
      for (let k = 0; k < steps && m < max; k++) {
        const t = k / steps;
        P[m * 2] = a[0] + (b[0] - a[0]) * t + this.rnd() * amp;
        P[m * 2 + 1] = a[1] + (b[1] - a[1]) * t + this.rnd() * amp;
        m += 1;
      }
    }
    if (!closed && m < max) {
      const e = src[src.length - 1];
      P[m * 2] = e[0] + this.rnd() * amp * 0.5;
      P[m * 2 + 1] = e[1] + this.rnd() * amp * 0.5;
      m += 1;
    }
    return m;
  }

  // Small deterministic PRNG in [-1, 1] (mulberry32 step).
  private state = 1;
  private rnd() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
}
