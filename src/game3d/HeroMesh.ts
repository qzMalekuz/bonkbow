import * as THREE from 'three';

// Decodes the meshes scripts/heroes/bake.ts writes (assets/heroes/*.json):
// int16 positions over the mesh bounds, int8 normals, sRGB uint8 colours,
// uint16/32 indices, optional uint8 channels — all base64.

export type EncodedMesh = {
  n: number;
  lo: number[];
  scale: number[];
  pos: string;
  nor: string;
  col: string;
  idx32: boolean;
  idx: string;
  extra?: string[];
  uv?: string; // uint16 over [0, 2) × [0, 1]
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LUT = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LUT[B64.charCodeAt(i)] = i;

export function fromBase64(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s.charCodeAt(len - 1) === 61) len--; // '='
  const out = new Uint8Array((len * 3) >> 2);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LUT[s.charCodeAt(i)];
    const b = LUT[s.charCodeAt(i + 1)];
    const c = i + 2 < len ? LUT[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? LUT[s.charCodeAt(i + 3)] : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (v >> 16) & 255;
    if (o < out.length) out[o++] = (v >> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}

// sRGB byte → linear float (three.js treats vertex colours as linear).
const SRGB = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB[i] = c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const aligned = (u8: Uint8Array) => (u8.byteOffset % 4 === 0 ? u8.buffer : u8.slice().buffer);

export function decodeMesh(m: EncodedMesh): THREE.BufferGeometry {
  const q = new Uint16Array(aligned(fromBase64(m.pos)), 0, m.n * 3);
  const nq = new Int8Array(aligned(fromBase64(m.nor)), 0, m.n * 3);
  const cq = fromBase64(m.col);
  const pos = new Float32Array(m.n * 3);
  const nor = new Float32Array(m.n * 3);
  const col = new Float32Array(m.n * 3);
  for (let i = 0; i < m.n; i++) {
    for (let a = 0; a < 3; a++) {
      const k = i * 3 + a;
      pos[k] = m.lo[a] + q[k] * m.scale[a];
      col[k] = SRGB[cq[k]];
    }
    const x = nq[i * 3];
    const y = nq[i * 3 + 1];
    const z = nq[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nor[i * 3] = x / l;
    nor[i * 3 + 1] = y / l;
    nor[i * 3 + 2] = z / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (m.uv) {
    const uq = new Uint16Array(aligned(fromBase64(m.uv)), 0, m.n * 2);
    const uv = new Float32Array(m.n * 2);
    for (let i = 0; i < m.n; i++) {
      uv[i * 2] = (uq[i * 2] / 65535) * 2;
      uv[i * 2 + 1] = uq[i * 2 + 1] / 65535;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const ib = fromBase64(m.idx);
  g.setIndex(new THREE.BufferAttribute(m.idx32 ? new Uint32Array(aligned(ib)) : new Uint16Array(aligned(ib)), 1));
  g.computeBoundingSphere();
  return g;
}

// A hero's suit (assets/heroes/<id>_body.json) in StickmanBody's data
// shape: skeleton, bind inverses, skinned mesh with vertex colours.
export type EncodedBody = {
  bones: { name: string; parent: number; p: number[]; q: number[] }[];
  inverses: number[][];
  mesh: EncodedMesh;
};

export function decodeBody(b: EncodedBody) {
  const g = decodeMesh(b.mesh);
  const idx = g.getIndex()!.array;
  const [si, sw] = (b.mesh.extra ?? []).map(fromBase64);
  const weights = new Float32Array(sw.length);
  for (let i = 0; i < sw.length; i++) weights[i] = sw[i] / 255;
  return {
    bones: b.bones,
    inverses: b.inverses,
    position: g.getAttribute('position').array as Float32Array,
    normal: g.getAttribute('normal').array as Float32Array,
    color: g.getAttribute('color').array as Float32Array,
    skinIndex: new Uint16Array(si),
    skinWeight: weights,
    index: idx as Uint16Array | Uint32Array,
    clips: {},
  };
}
