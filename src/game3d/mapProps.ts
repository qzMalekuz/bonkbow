import * as THREE from 'three';

// Props from the Unity environment packs behind the shop maps, exported by
// scripts/unity/export-environments.cs to the gitignored
// assets/licensed/maps/ (Asset Store EULA: ship in the app, never in the
// public repo). Without the files Metro resolves these requires to empty
// modules, `PropKit.load` returns null and Arena dresses the map with its
// procedural landscape instead.
//
// A kit collects placements and flushes them in as few draws as possible:
// light props are merged per material into one mesh (flat-colour packs are
// all one vertex-coloured material), heavy ones become one InstancedMesh per
// prop. Geometry and materials are parsed once per app run and shared.

export type KitId = 'grove' | 'valley' | 'snow';

type BakedPart = { p: number[]; c: number[] };
type TexPart = { mat: number; p: number[]; n: number[]; uv: number[]; i: number[] };
type PropData = { min: number[]; max: number[]; parts: (BakedPart | TexPart)[] };
type KitData = { props?: Record<string, PropData>; mats?: { tex: string | null; color: string }[] };

const DATA: Record<KitId, KitData> = {
  grove: require('../../assets/licensed/maps/grove.json'),
  valley: require('../../assets/licensed/maps/valley.json'),
  snow: require('../../assets/licensed/maps/snow.json'),
};
const TEXTURES: Record<string, number> = {
  'grove_foliage.jpg': require('../../assets/licensed/maps/grove_foliage.jpg'),
  'grove_moss_light.jpg': require('../../assets/licensed/maps/grove_moss_light.jpg'),
  'grove_road.jpg': require('../../assets/licensed/maps/grove_road.jpg'),
  'grove_roadSignAndBridge.jpg': require('../../assets/licensed/maps/grove_roadSignAndBridge.jpg'),
  'grove_stone.jpg': require('../../assets/licensed/maps/grove_stone.jpg'),
  'grove_treeStumpAndRoot.jpg': require('../../assets/licensed/maps/grove_treeStumpAndRoot.jpg'),
  'grove_tree_fir.jpg': require('../../assets/licensed/maps/grove_tree_fir.jpg'),
  'grove_tree_leaf.jpg': require('../../assets/licensed/maps/grove_tree_leaf.jpg'),
};

// Above this many triangles a prop is instanced instead of merged.
const MERGE_TRIS = 400;

type Piece = { mat: THREE.Material; geo: THREE.BufferGeometry };
type Prop = { pieces: Piece[]; tris: number; min: THREE.Vector3; max: THREE.Vector3 };

const textureCache = new Map<string, THREE.Texture>();
export function kitTexture(file: string, repeat?: [number, number]): THREE.Texture | null {
  const src = TEXTURES[file];
  if (typeof src !== 'number' && typeof src !== 'string') return null;
  const key = repeat ? `${file}@${repeat.join('x')}` : file;
  let t = textureCache.get(key);
  if (!t) {
    t = new THREE.TextureLoader().load(src as unknown as string);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    textureCache.set(key, t);
  }
  return t;
}

const kits = new Map<KitId, Map<string, Prop>>();
const bakedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

function parseKit(id: KitId): Map<string, Prop> | null {
  const data = DATA[id];
  if (!data?.props) return null;
  const cached = kits.get(id);
  if (cached) return cached;
  const mats = (data.mats ?? []).map(
    (m) => new THREE.MeshLambertMaterial({ color: m.color, map: (m.tex && kitTexture(m.tex)) || null }),
  );
  const col = new THREE.Color();
  const props = new Map<string, Prop>();
  for (const [key, d] of Object.entries(data.props)) {
    const pieces: Piece[] = [];
    let tris = 0;
    for (const part of d.parts) {
      const geo = new THREE.BufferGeometry();
      const pos = Float32Array.from(part.p, (v) => v / 1000);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if ('c' in part) {
        // One sRGB colour per face → linear per vertex; flat face normals.
        const c = new Float32Array(part.c.length * 9);
        part.c.forEach((hex, f) => {
          col.setHex(hex);
          for (let k = 0; k < 3; k++) c.set([col.r, col.g, col.b], f * 9 + k * 3);
        });
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        geo.computeVertexNormals();
        tris += part.c.length;
        pieces.push({ mat: bakedMaterial, geo });
      } else {
        geo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.n, (v) => v / 1000), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(part.uv, (v) => v / 10000), 2));
        geo.setIndex(part.i);
        tris += part.i.length / 3;
        pieces.push({ mat: mats[part.mat], geo });
      }
    }
    props.set(key, { pieces, tris, min: new THREE.Vector3(...d.min), max: new THREE.Vector3(...d.max) });
  }
  kits.set(id, props);
  return props;
}

type Placement = THREE.Matrix4;

export class PropKit {
  private props: Map<string, Prop>;
  private placed = new Map<string, Placement[]>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  private constructor(props: Map<string, Prop>) {
    this.props = props;
  }

  // null when the licensed export isn't in this build.
  static load(id: KitId): PropKit | null {
    const props = parseKit(id);
    return props ? new PropKit(props) : null;
  }

  has(key: string) {
    return this.props.has(key);
  }

  keys() {
    return [...this.props.keys()];
  }

  // Footprint of a prop at scale 1 (x, y, z extents).
  size(key: string) {
    const p = this.props.get(key);
    return p ? p.max.clone().sub(p.min) : new THREE.Vector3();
  }

  place(key: string, x: number, y: number, z: number, rotY = 0, scale: number | [number, number, number] = 1) {
    if (!this.props.has(key)) return;
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.e.set(0, rotY, 0);
    this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s[0], s[1], s[2]));
    const list = this.placed.get(key) ?? [];
    list.push(m);
    this.placed.set(key, list);
  }

  // A standalone mesh of one prop (for things that move, like clouds).
  mesh(key: string, material?: THREE.Material): THREE.Object3D | null {
    const p = this.props.get(key);
    if (!p) return null;
    if (p.pieces.length === 1) return new THREE.Mesh(p.pieces[0].geo, material ?? p.pieces[0].mat);
    const g = new THREE.Group();
    for (const piece of p.pieces) g.add(new THREE.Mesh(piece.geo, material ?? piece.mat));
    return g;
  }

  flush(into: THREE.Group) {
    const merged = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const [key, list] of this.placed) {
      const prop = this.props.get(key)!;
      if (prop.tris <= MERGE_TRIS) {
        for (const m of list) {
          for (const piece of prop.pieces) {
            const g = (piece.geo.index ? piece.geo.toNonIndexed() : piece.geo.clone()).applyMatrix4(m);
            const bucket = merged.get(piece.mat) ?? [];
            bucket.push(g);
            merged.set(piece.mat, bucket);
          }
        }
        continue;
      }
      for (const piece of prop.pieces) {
        const inst = new THREE.InstancedMesh(piece.geo, piece.mat, list.length);
        list.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.matrixAutoUpdate = false;
        into.add(inst);
      }
    }
    for (const [mat, geos] of merged) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.matrixAutoUpdate = false;
      into.add(mesh);
    }
    this.placed.clear();
  }
}

// Concatenates non-indexed geometries with the same attributes.
function mergeGeometries(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geos[0].attributes)) {
    const size = geos[0].getAttribute(name).itemSize;
    const total = geos.reduce((n, g) => n + g.getAttribute(name).array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of geos) {
      const a = g.getAttribute(name).array as Float32Array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
