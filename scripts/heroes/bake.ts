// Bakes each hero's chibi suit (body.ts: sculpted, meshed, skinned to the
// rig's skeleton) into assets/heroes/<id>_body.json. Run via
// scripts/heroes/build.sh.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HERO_SPECS } from '../../src/game3d/heroSpecs';
import type { FaceId } from '../../src/game/faces';
import * as THREE from 'three';
import { sculptBody } from './body';
import { encode, mesh, simplify, type RawMesh } from './mesh';

const OUT = fileURLToPath(new URL('../../assets/heroes/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2) as FaceId[];
const ids = (only.length ? only : Object.keys(HERO_SPECS)) as FaceId[];

for (const id of ids) {
  const t0 = performance.now();
  writeFileSync(`${OUT}${id}_body.json`, JSON.stringify(await bakeBody(id)));
  console.log(`${id}: body (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
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

