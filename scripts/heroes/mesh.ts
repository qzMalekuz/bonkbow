// Turns a signed distance field into a compact, vertex-coloured triangle
// mesh: surface nets on a regular grid, vertices projected onto the true
// surface, normals from the field's gradient (smoother than the facets),
// ambient occlusion and colour baked per vertex. Output is quantised and
// base64'd for a JSON module the app loads with require() (HeroMesh.ts).
import type { SDF, V3 } from './sdf';

export type Shade = (x: number, y: number, z: number, n: V3) => { rgb: V3; group: number };

export type Grid = { min: V3; max: V3; step: number };

export type RawMesh = { pos: number[]; nor: number[]; col: number[]; idx: number[]; uv?: number[]; extra?: number[][] };

const EPS = 1e-4;

export function gradient(f: SDF, x: number, y: number, z: number, h = 0.004): V3 {
  const gx = f(x + h, y, z) - f(x - h, y, z);
  const gy = f(x, y + h, z) - f(x, y - h, z);
  const gz = f(x, y, z + h) - f(x, y, z - h);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// Surface nets. `groups` meshes are returned (triangles go to the group of
// their first vertex's shade); `ao` = occlusion strength (0 = off).
export function mesh(f: SDF, shade: Shade, grid: Grid, opts: { ao?: number; aoStep?: number; groups?: number; normalH?: number } = {}): RawMesh[] {
  const { min, max, step } = grid;
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const D = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) D[at(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);

  // One vertex per cell the surface crosses, at the mean of its edge crossings.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cell = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const P: number[] = [];
  const corners: [number, number, number][] = [];
  for (let c = 0; c < 8; c++) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const edges: [number, number][] = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if ([0, 1, 2].filter((t) => corners[a][t] !== corners[b][t]).length === 1) edges.push([a, b]);
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = D[at(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        cellVert[cell(i, j, k)] = P.length / 3;
        P.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
      }

  // Snap onto the true surface (two Newton steps along the gradient).
  const nH = opts.normalH ?? step * 0.35;
  for (let p = 0; p < P.length; p += 3) {
    for (let it = 0; it < 2; it++) {
      const d = f(P[p], P[p + 1], P[p + 2]);
      if (Math.abs(d) < EPS) break;
      const g = gradient(f, P[p], P[p + 1], P[p + 2], nH);
      const s = Math.max(-step * 0.5, Math.min(step * 0.5, d));
      P[p] -= g[0] * s;
      P[p + 1] -= g[1] * s;
      P[p + 2] -= g[2] * s;
    }
  }

  // Quads across every grid edge with a sign change.
  const quads: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) quads.push(a, d, c, b);
    else quads.push(a, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const s0 = D[at(i, j, k)] < 0;
        if (s0 === D[at(i + 1, j, k)] < 0) continue;
        quad(cellVert[cell(i, j - 1, k - 1)], cellVert[cell(i, j, k - 1)], cellVert[cell(i, j, k)], cellVert[cell(i, j - 1, k)], !s0);
      }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = D[at(i, j, k)] < 0;
        if (s0 === D[at(i, j + 1, k)] < 0) continue;
        quad(cellVert[cell(i - 1, j, k - 1)], cellVert[cell(i - 1, j, k)], cellVert[cell(i, j, k)], cellVert[cell(i, j, k - 1)], !s0);
      }
  for (let k = 0; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = D[at(i, j, k)] < 0;
        if (s0 === D[at(i, j, k + 1)] < 0) continue;
        quad(cellVert[cell(i - 1, j - 1, k)], cellVert[cell(i, j - 1, k)], cellVert[cell(i, j, k)], cellVert[cell(i - 1, j, k)], !s0);
      }

  // Per-vertex normal, occlusion and colour.
  const nv = P.length / 3;
  const N = new Float32Array(P.length);
  const C = new Float32Array(P.length);
  const G = new Int8Array(nv);
  const ao = opts.ao ?? 0;
  const aoStep = opts.aoStep ?? 0.05;
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    const n = gradient(f, x, y, z, nH);
    N.set(n, i * 3);
    const s = shade(x, y, z, n);
    let occ = 1;
    if (ao > 0) {
      let sum = 0;
      let w = 0.5;
      for (let k = 1; k <= 5; k++) {
        const h = aoStep * k;
        sum += w * Math.max(0, h - f(x + n[0] * h, y + n[1] * h, z + n[2] * h));
        w *= 0.5;
      }
      occ = Math.max(0.5, 1 - (ao * sum) / aoStep);
    }
    // Occlusion darkens toward a warm shadow rather than grey.
    C[i * 3] = s.rgb[0] * (0.25 + 0.75 * occ);
    C[i * 3 + 1] = s.rgb[1] * (0.18 + 0.82 * occ);
    C[i * 3 + 2] = s.rgb[2] * (0.16 + 0.84 * occ);
    G[i] = s.group;
  }

  const groups = opts.groups ?? 1;
  const out: RawMesh[] = [];
  for (let g = 0; g < groups; g++) {
    const remap = new Int32Array(nv).fill(-1);
    const m: RawMesh = { pos: [], nor: [], col: [], idx: [] };
    const take = (i: number) => {
      if (remap[i] < 0) {
        remap[i] = m.pos.length / 3;
        m.pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        m.nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        m.col.push(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]);
      }
      return remap[i];
    };
    for (let q = 0; q < quads.length; q += 4) {
      const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
      if (majority(G[a], G[b], G[c], G[d]) !== g) continue;
      // Split along the shorter diagonal.
      const dAC = dist2(P, a, c);
      const dBD = dist2(P, b, d);
      const [A, B, Cc, Dd] = [take(a), take(b), take(c), take(d)];
      if (dAC <= dBD) m.idx.push(A, B, Cc, A, Cc, Dd);
      else m.idx.push(A, B, Dd, B, Cc, Dd);
    }
    out.push(m);
  }
  return out;
}

// The group most corners of a quad belong to (ties: the lowest id).
function majority(...g: number[]) {
  let best = g[0];
  let most = 0;
  for (const c of g) {
    const k = g.filter((t) => t === c).length;
    if (k > most || (k === most && c < best)) {
      best = c;
      most = k;
    }
  }
  return best;
}

function dist2(P: number[], a: number, b: number) {
  return (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
}

// Laplacian-free cleanup: drop vertices no triangle uses (none expected).
export function stats(m: RawMesh) {
  return `${m.pos.length / 3} verts, ${m.idx.length / 3} tris`;
}

const b64 = (u8: Uint8Array) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');

// Quantised, base64'd mesh for HeroMesh.ts: positions as int16 over the
// mesh's bounds, normals as int8, colours as uint8 (sRGB), indices uint16/32.
// `extra` channels (e.g. skin indices / weights) are stored as uint8.
export function encode(m: RawMesh) {
  const n = m.pos.length / 3;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], m.pos[i * 3 + a]);
      hi[a] = Math.max(hi[a], m.pos[i * 3 + a]);
    }
  const scale = hi.map((h, a) => (h - lo[a]) / 65535 || 1);
  const pos = new Uint16Array(n * 3);
  const nor = new Int8Array(n * 3);
  const col = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] = Math.round((m.pos[i * 3 + a] - lo[a]) / scale[a]);
      nor[i * 3 + a] = Math.round(Math.max(-1, Math.min(1, m.nor[i * 3 + a])) * 127);
      col[i * 3 + a] = Math.round(Math.max(0, Math.min(1, linearToSrgb(m.col[i * 3 + a]))) * 255);
    }
  const idx = n > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
  // Texture coordinates as uint16 over [0, 2) × [0, 1] (u may wrap past 1).
  const uv = m.uv ? new Uint16Array(m.uv.map((t, i) => Math.round((i % 2 === 0 ? t / 2 : t) * 65535))) : null;
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    n,
    lo: lo.map(r),
    scale: scale.map((s) => Math.round(s * 1e9) / 1e9),
    pos: b64(new Uint8Array(pos.buffer)),
    nor: b64(new Uint8Array(nor.buffer)),
    col: b64(col),
    idx32: n > 65535,
    idx: b64(new Uint8Array(idx.buffer)),
    extra: m.extra?.map((e) => b64(new Uint8Array(e))),
    uv: uv ? b64(new Uint8Array(uv.buffer)) : undefined,
  };
}

// Colours are authored in sRGB hex and shaded (AO) in linear space.
export function hex(h: string): V3 {
  const v = parseInt(h.replace('#', ''), 16);
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}
export const srgbToLinear = (c: number) => (c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// Cut a mesh down to about `tris` triangles with meshoptimizer, weighing
// normals and colours so silhouettes, creases and colour edges survive.
// Borders stay put (they are seams with another group's mesh).
export async function simplify(m: RawMesh, tris: number, error = 0.02): Promise<RawMesh> {
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const n = m.pos.length / 3;
  if (m.idx.length / 3 <= tris) return m;
  const attrs = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) attrs.set([m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2], m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], i * 6);
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(m.idx),
    new Float32Array(m.pos),
    3,
    attrs,
    6,
    [0.4, 0.4, 0.4, 1.5, 1.5, 1.5],
    null,
    tris * 3,
    error,
    ['LockBorder'],
  );
  // Keep only the vertices still in use.
  const remap = new Int32Array(n).fill(-1);
  const out: RawMesh = { pos: [], nor: [], col: [], idx: [] };
  for (const v of idx) {
    if (remap[v] < 0) {
      remap[v] = out.pos.length / 3;
      out.pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
      out.nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]);
      out.col.push(m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]);
    }
    out.idx.push(remap[v]);
  }
  return out;
}
