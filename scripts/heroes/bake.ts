// Bakes the hero characters into the JSON the app requires from
// assets/heroes/: each head meshed from the volume project.py rebuilt from
// the character sheet (with uvs for its sheet-painted textures), and the
// chibi suit (body.ts) sculpted and skinned. Run via scripts/heroes/build.sh.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HERO_SPECS } from '../../src/game3d/heroSpecs';
import type { FaceId } from '../../src/game/faces';
import * as THREE from 'three';
import { sculptBody } from './body';
import { encode, hex, mesh, simplify, stats, type RawMesh } from './mesh';

const OUT = fileURLToPath(new URL('../../assets/heroes/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2) as FaceId[];
const ids = (only.length ? only : Object.keys(HERO_SPECS)) as FaceId[];

// Heads come from the character sheets (project.py): a signed distance grid
// per hero in the cache dir, meshed here, painted by the sheet textures.
const CACHE = process.env.HERO_CACHE ?? fileURLToPath(new URL('./.cache/', import.meta.url));

for (const id of ids) {
  const t0 = performance.now();
  const head = await sheetHead(id);
  const meta = JSON.parse(readFileSync(`${CACHE}${id}_sdf.json`, 'utf8')) as { chin: number };
  const expressions = JSON.parse(readFileSync(`${CACHE}${id}_expr.json`, 'utf8')) as string[];
  const views = JSON.parse(readFileSync(`${CACHE}${id}_views.json`, 'utf8')) as Record<string, number>;
  writeFileSync(`${OUT}${id}.json`, JSON.stringify({ v: 3, chin: meta.chin, expressions, views, head: encode(head) }));
  writeFileSync(`${OUT}${id}_body.json`, JSON.stringify(await bakeBody(id)));
  console.log(`${id}: head ${stats(head)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

async function sheetHead(id: FaceId): Promise<RawMesh> {
  const meta = JSON.parse(readFileSync(`${CACHE}${id}_sdf.json`, 'utf8')) as { lo: number[]; step: number; n: number[] };
  const g = new Float32Array(readFileSync(`${CACHE}${id}_sdf.bin`).buffer.slice(0));
  const [nx, ny, nz] = meta.n;
  const { lo, step } = meta;
  const at = (i: number, j: number, k: number) => g[(Math.min(nx - 1, Math.max(0, i)) * ny + Math.min(ny - 1, Math.max(0, j))) * nz + Math.min(nz - 1, Math.max(0, k))];
  // Trilinear sample of the grid.
  const f = (x: number, y: number, z: number) => {
    const fx = (x - lo[0]) / step;
    const fy = (y - lo[1]) / step;
    const fz = (z - lo[2]) / step;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const u = fx - i;
    const v = fy - j;
    const w = fz - k;
    const L = (a: number, b: number, t: number) => a + (b - a) * t;
    return L(
      L(L(at(i, j, k), at(i + 1, j, k), u), L(at(i, j + 1, k), at(i + 1, j + 1, k), u), v),
      L(L(at(i, j, k + 1), at(i + 1, j, k + 1), u), L(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), u), v),
      w,
    );
  };
  const white = hex('#FFFFFF');
  const [m] = mesh(f, () => ({ rgb: white, group: 0 }), { min: [lo[0], lo[1], lo[2]], max: [lo[0] + step * (nx - 1), lo[1] + step * (ny - 1), lo[2] + step * (nz - 1)], step: 0.022 });
  // The shape is smooth (the sheet paint carries the detail): ~10k triangles.
  return withSphericalUV(await simplify(m, 10000, 0.004));
}

// u = angle round the neck (0.5 = nose), v = elevation (1 = straight up),
// matching project.py's equirect textures. Triangles across the seam at the
// back of the head get their own vertices with u + 1 (the texture repeats).
function withSphericalUV(m: RawMesh): RawMesh {
  const n = m.pos.length / 3;
  const uv: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    uv.push((Math.atan2(z, x) / Math.PI + 1) / 2, 0.5 + Math.atan2(y, Math.hypot(x, z)) / Math.PI);
  }
  const out: RawMesh = { pos: [...m.pos], nor: [...m.nor], col: [...m.col], idx: [], uv };
  const twin = new Map<number, number>();
  const wrapped = (v: number) => {
    let t = twin.get(v);
    if (t === undefined) {
      t = out.pos.length / 3;
      out.pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
      out.nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]);
      out.col.push(1, 1, 1);
      uv.push(uv[v * 2] + 1, uv[v * 2 + 1]);
      twin.set(v, t);
    }
    return t;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    const us = tri.map((v) => uv[v * 2]);
    const seam = Math.max(...us) - Math.min(...us) > 0.5;
    for (const v of tri) out.idx.push(seam && uv[v * 2] < 0.5 ? wrapped(v) : v);
  }
  return out;
}

// The suit: mesh + skeleton in StickmanBody's format (bones with local
// position/rotation, bind inverses), skin indices/weights as bytes.
async function bakeBody(id: FaceId) {
  const b = sculptBody(HERO_SPECS[id]);
  const [m0] = mesh(b.f, b.shade, b.grid, { ao: 1.2, aoStep: 0.012 });
  const m: RawMesh = await simplify(m0, 9000, 0.003);
  const n = m.pos.length / 3;
  const si = new Uint8Array(n * 4);
  const sw = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = b.weights(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
    // Bytes that sum to exactly 255; the rounding remainder goes to the heaviest.
    const q = w.map(([, wt]) => Math.floor(wt * 255));
    q[0] += 255 - q.reduce((k, v) => k + v, 0);
    w.forEach(([bone], k) => {
      si[i * 4 + k] = bone;
      sw[i * 4 + k] = q[k];
    });
  }
  m.extra = [Array.from(si), Array.from(sw)];
  // Bone frames: +y along the bone toward its (first) child.
  const up = new THREE.Vector3(0, 1, 0);
  const at = b.bones.map((bn) => new THREE.Vector3(...bn.at));
  const worldQ: THREE.Quaternion[] = [];
  const world = b.bones.map((bn, i) => {
    const child = b.bones.findIndex((c) => c.parent === i);
    const q = new THREE.Quaternion();
    if (i > 0 && child >= 0) q.setFromUnitVectors(up, at[child].clone().sub(at[i]).normalize());
    else if (bn.parent > 0) q.copy(worldQ[bn.parent]);
    worldQ[i] = q;
    return q;
  });
  const bones = b.bones.map((bn, i) => {
    const pq = bn.parent >= 0 ? world[bn.parent].clone().invert() : new THREE.Quaternion();
    const p = bn.parent >= 0 ? at[i].clone().sub(at[bn.parent]).applyQuaternion(pq) : at[i].clone();
    const q = pq.multiply(world[i]);
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    return { name: bn.name, parent: bn.parent, p: p.toArray().map(r), q: q.toArray().map(r) };
  });
  const inverses = b.bones.map((_, i) =>
    new THREE.Matrix4()
      .compose(at[i], world[i], new THREE.Vector3(1, 1, 1))
      .invert()
      .toArray()
      .map((v) => Math.round(v * 1e6) / 1e6),
  );
  return { v: 1, bones, inverses, mesh: encode(m) };
}

