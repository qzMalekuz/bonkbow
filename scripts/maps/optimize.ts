// Simplifies the baked (flat-colour) props that export-environments.cs wrote
// to assets/licensed/maps/*.json, in place. Some packs are sculpt-dense (a
// HobiSoLoved cottage is ~25k triangles); as background set dressing on a
// phone each prop gets at most MAX_TRIS. Each part is welded by position +
// colour, so colour borders become seams the simplifier keeps, then
// un-welded back to one colour per face.
//
//   bun scripts/maps/optimize.ts            # every map
//   bun scripts/maps/optimize.ts snow       # one map
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TRIS = 2400;
// Props placed by the dozen get a tighter budget.
const CAPS: Record<string, number> = {
  pine2: 450, pine3: 450, pine4: 450, pine5: 450, tree1: 600, tree2: 600, cottage1: 1500, cottage2: 1500, cottage3: 1500,
  wall1: 500, wall3: 500, fence_1: 300, fence_2: 300, snowman: 400, sign1: 800, sign2: 800, well: 1200,
  snow1: 90, snow2: 90, snow3: 90, snow4: 90, snow5: 90,
};
const DIR = fileURLToPath(new URL('../../assets/licensed/maps/', import.meta.url).href);

type BakedPart = { p: number[]; c: number[] };
type Prop = { min: number[]; max: number[]; parts: (BakedPart | { i: number[] })[] };

await MeshoptSimplifier.ready;

function simplifyPart(part: BakedPart, target: number): BakedPart {
  const faces = part.c.length;
  if (faces <= target) return part;
  // Weld identical (position, colour) corners.
  const key = new Map<string, number>();
  const pos: number[] = [];
  const col: number[] = [];
  const idx = new Uint32Array(faces * 3);
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const v = f * 3 + k;
      const x = part.p[v * 3];
      const y = part.p[v * 3 + 1];
      const z = part.p[v * 3 + 2];
      const id = `${x},${y},${z},${part.c[f]}`;
      let j = key.get(id);
      if (j === undefined) {
        j = pos.length / 3;
        key.set(id, j);
        pos.push(x / 1000, y / 1000, z / 1000);
        col.push(part.c[f]);
      }
      idx[v] = j;
    }
  }
  const [out] = MeshoptSimplifier.simplify(idx, new Float32Array(pos), 3, target * 3, 0.02, ['Prune']);
  const p: number[] = [];
  const c: number[] = [];
  for (let t = 0; t < out.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const j = out[t + k];
      p.push(Math.round(pos[j * 3] * 1000), Math.round(pos[j * 3 + 1] * 1000), Math.round(pos[j * 3 + 2] * 1000));
    }
    c.push(col[out[t]]);
  }
  return { p, c };
}

const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['valley', 'snow'];
for (const id of maps) {
  const file = join(DIR, `${id}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8')) as { props: Record<string, Prop> };
  let before = 0;
  let after = 0;
  for (const [name, prop] of Object.entries(data.props)) {
    const baked = prop.parts.filter((q): q is BakedPart => 'c' in q);
    const tris = baked.reduce((n, q) => n + q.c.length, 0);
    before += tris;
    const cap = (id === 'snow' && CAPS[name]) || MAX_TRIS;
    if (tris > cap) {
      // Share the budget between parts by size.
      prop.parts = prop.parts.map((q) => ('c' in q ? simplifyPart(q, Math.max(12, Math.floor((q.c.length / tris) * cap))) : q));
      const now = prop.parts.reduce((n, q) => n + ('c' in q ? q.c.length : 0), 0);
      console.log(`${id}/${name}: ${tris} → ${now}`);
    }
    after += prop.parts.reduce((n, q) => n + ('c' in q ? q.c.length : 0), 0);
  }
  writeFileSync(file, JSON.stringify(data));
  console.log(`${id}: ${before} → ${after} triangles`);
}
