// The Bonk Bow cast: derpy stickmen who hold bows and not much else. Every
// archer is the same black stick body with a hand-scrawled paper head: a
// lumpy outline, eyes that wander independently under heavy uneven lids, a
// big grin and some drool (the house style of the launch videos,
// docs/trailer/tools/derpy.py). Hats sit on top. They do not help.
//
// This file is pure data and drawing instructions, no renderer: the 3D rig
// turns `derpDrawing()` into wobbly ink geometry (game3d/ink.ts), the UI
// into SVG (ui/DerpThumb.tsx). Units are "head units" (a head is about 2
// across), y up, origin at the neck.
import type { Mood } from '@/game3d/sim';

export type HeadShape = 'bean' | 'pea' | 'slab';
// A derp's signature bit of comedy; every archer does all of them now and
// then, the habit just a lot more often.
export type Habit = 'celebrate' | 'bonk' | 'eat' | 'backwards' | 'yawn';
export type DerpId = 'gary' | 'steve' | 'doug' | 'kevin' | 'someguy' | 'chad' | 'timmy' | 'carl' | 'bob';
export type HatId =
  | 'none'
  | 'tophat'
  | 'party'
  | 'propeller'
  | 'cone'
  | 'crown'
  | 'pot'
  | 'viking'
  | 'arrow'
  | 'fish'
  | 'chef'
  | 'beanie'
  | 'bucket'
  | 'cowboy'
  | 'halo';
export type BowId = 'bow' | 'shovel' | 'toy' | 'candy' | 'bone' | 'golden';

export type DerpDef = {
  id: DerpId;
  name: string;
  tagline: string;
  shape: HeadShape;
  neck: number; // extra neck, metres (visual only: hitboxes are the same for everyone)
  habit: Habit;
  seed: number; // how his eyes wander
  color: string; // banner, flag and UI accent
};

export const DERPS: Record<DerpId, DerpDef> = {
  gary: { id: 'gary', name: 'Gary', tagline: 'Accuracy: no. Confidence: yes.', shape: 'bean', neck: 0, habit: 'celebrate', seed: 0, color: '#F4A261' },
  steve: { id: 'steve', name: 'Tall Steve', tagline: 'Neck: too much. Shoots straight up a lot.', shape: 'pea', neck: 0.24, habit: 'bonk', seed: 3, color: '#4FA3E0' },
  doug: { id: 'doug', name: 'Doug', tagline: 'Eats the arrows.', shape: 'slab', neck: 0, habit: 'eat', seed: 7, color: '#8BC34A' },
  kevin: { id: 'kevin', name: 'Kevin', tagline: 'Faces the wrong way. Committed to it.', shape: 'bean', neck: 0.04, habit: 'backwards', seed: 11, color: '#E05A9C' },
  someguy: { id: 'someguy', name: 'Some Guy', tagline: '847 wins. Visibly bored.', shape: 'slab', neck: 0.02, habit: 'yawn', seed: 5, color: '#9E9E9E' },
  // Coin derps (skins.ts): bought with the coins earned in matches.
  chad: { id: 'chad', name: 'Chad', tagline: 'Celebrates every shot. Hits some.', shape: 'slab', neck: 0.06, habit: 'celebrate', seed: 13, color: '#FF7043' },
  timmy: { id: 'timmy', name: 'Lil Timmy', tagline: 'Tiny head. Big bow. Same arrows.', shape: 'pea', neck: 0.1, habit: 'backwards', seed: 17, color: '#FFD54F' },
  carl: { id: 'carl', name: 'Carl', tagline: 'Snacks between rounds. Snacks during them.', shape: 'bean', neck: 0.08, habit: 'eat', seed: 19, color: '#26A69A' },
  bob: { id: 'bob', name: 'Bob', tagline: 'Has never held a bow. Holding one now.', shape: 'bean', neck: 0.14, habit: 'bonk', seed: 23, color: '#7E57C2' },
};
export const DERP_IDS = Object.keys(DERPS) as DerpId[];

export type HatDef = { id: HatId; name: string; tagline: string };
export const HATS: Record<HatId, HatDef> = {
  none: { id: 'none', name: 'No hat', tagline: 'Just the head.' },
  tophat: { id: 'tophat', name: 'Top Hat', tagline: 'Very formal. Does not help.' },
  party: { id: 'party', name: 'Party Hat', tagline: 'Celebrates before the arrow lands.' },
  propeller: { id: 'propeller', name: 'Propeller Cap', tagline: 'Spins. Does not fly.' },
  cone: { id: 'cone', name: 'Traffic Cone', tagline: 'Found it. Kept it.' },
  crown: { id: 'crown', name: 'Paper Crown', tagline: 'King of missing.' },
  pot: { id: 'pot', name: 'Cooking Pot', tagline: 'Armour, he thinks.' },
  viking: { id: 'viking', name: 'Viking Helmet', tagline: 'Horns add zero damage.' },
  arrow: { id: 'arrow', name: 'Arrow Through Head', tagline: 'From practice.' },
  fish: { id: 'fish', name: 'Fish', tagline: 'Nobody knows why.' },
  chef: { id: 'chef', name: 'Chef Hat', tagline: 'Cooked. Every round.' },
  // Coin hats (skins.ts).
  beanie: { id: 'beanie', name: 'Beanie', tagline: 'Keeps the head warm. The aim stays cold.' },
  bucket: { id: 'bucket', name: 'Bucket Hat', tagline: 'Gone fishing. Came back with arrows.' },
  cowboy: { id: 'cowboy', name: 'Cowboy Hat', tagline: 'Fastest draw in the west. Worst aim.' },
  halo: { id: 'halo', name: 'Halo', tagline: 'Too good for this. Still misses.' },
};
export const HAT_IDS = Object.keys(HATS) as HatId[];

// `wood` and `accent` colour the recurve (limbs; grip and nocks), `scale`
// sizes it. Every bow shoots the same shot: looks only.
export type BowDef = { id: BowId; name: string; tagline: string; wood: string; accent: string; scale: number };
export const BOWS: Record<BowId, BowDef> = {
  bow: { id: 'bow', name: 'Bow', tagline: 'It is a bow.', wood: '#8B5A2B', accent: '#E9D8A6', scale: 1 },
  // Promised in the game-848 video, from a fan comment. Same shot as a bow
  // (the duel stays fair); it throws the shooter and digs into the cliff.
  shovel: { id: 'shovel', name: 'Shovel Bow', tagline: 'Someone in the comments said add this. So we did.', wood: '#6B4A2B', accent: '#2B2B2B', scale: 1.7 },
  // Coin bows (skins.ts).
  toy: { id: 'toy', name: 'Toy Bow', tagline: 'Ages 3 and up. He qualifies.', wood: '#2F80ED', accent: '#FFD23F', scale: 0.8 },
  candy: { id: 'candy', name: 'Candy Bow', tagline: 'Sweet. Sticky. Same damage.', wood: '#FF6FA8', accent: '#FFFFFF', scale: 1 },
  bone: { id: 'bone', name: 'Bone Bow', tagline: 'Somebody else’s bones. Probably.', wood: '#E8E2D0', accent: '#5A4A3A', scale: 1.05 },
  golden: { id: 'golden', name: 'Golden Bow', tagline: 'Expensive. Misses in style.', wood: '#E0B12B', accent: '#FFF4C2', scale: 1.1 },
};
export const BOW_IDS = Object.keys(BOWS) as BowId[];

export const INK = '#0C0C0C';
export const PAPER = '#FFFFFF';
export const DROOL = '#78BEF0';

// Head outlines (from derpy.py, flipped to y up).
export const HEAD_OUTLINE: Record<HeadShape, [number, number][]> = {
  bean: [[-0.95, 0.25], [-1.05, 0.95], [-0.6, 1.15], [-0.1, 0.85], [0.5, 1.05], [1.15, 1.35], [1.3, 0.8], [1.05, 0.2], [0.45, -0.05], [-0.4, -0.05]],
  pea: [[-0.3, 0.0], [-0.42, 0.35], [-0.25, 0.62], [0.1, 0.68], [0.4, 0.5], [0.42, 0.15], [0.2, -0.02]],
  slab: [[-1.0, 0.0], [-1.2, 0.5], [-0.9, 1.0], [-0.2, 1.2], [0.6, 1.15], [1.2, 0.75], [1.25, 0.3], [0.9, -0.05]],
};

// Eyes, mouth, eye radius and mouth width per shape; where a hat sits
// (centre of its brim) and how wide it is.
type Anchors = { e1: [number, number]; e2: [number, number]; mo: [number, number]; er: number; mw: number; hat: [number, number]; hatW: number; hatTilt: number };
const ANCHORS: Record<HeadShape, Anchors> = {
  bean: { e1: [-0.35, 0.52], e2: [0.72, 0.78], mo: [0.2, 0.3], er: 0.15, mw: 0.55, hat: [0.15, 0.98], hatW: 1.35, hatTilt: -0.12 },
  pea: { e1: [-0.14, 0.4], e2: [0.18, 0.42], mo: [0.03, 0.2], er: 0.085, mw: 0.2, hat: [0.02, 0.64], hatW: 0.62, hatTilt: 0.05 },
  slab: { e1: [-0.45, 0.62], e2: [0.55, 0.6], mo: [0.05, 0.28], er: 0.15, mw: 0.55, hat: [0.1, 1.15], hatW: 1.55, hatTilt: -0.04 },
};

// Rough extent of each head, for framing (thumbnails) and hand clearance.
export const HEAD_BOX: Record<HeadShape, { minX: number; maxX: number; maxY: number }> = {
  bean: { minX: -1.05, maxX: 1.3, maxY: 1.35 },
  pea: { minX: -0.42, maxX: 0.42, maxY: 0.68 },
  slab: { minX: -1.2, maxX: 1.25, maxY: 1.2 },
};

// ---- drawing instructions -------------------------------------------------
// blob: filled polygon with an ink outline; line: a stroke; dot: a filled disc.
// `w` is the stroke width in head units; renderers add their own wobble.
export type InkPrim =
  | { k: 'blob'; pts: [number, number][]; fill: string; w: number; col?: string }
  | { k: 'line'; pts: [number, number][]; w: number; col?: string }
  | { k: 'dot'; c: [number, number]; r: number; col?: string };

export type Eyes = 'derp' | 'shut' | 'wide' | 'x' | 'angry' | 'sad' | 'spiral' | 'wink' | 'heavy';
export type Mouth = 'smile' | 'grin' | 'o' | 'bigo' | 'chew' | 'flat' | 'frown' | 'wobble';
export type FaceState = {
  eyes: Eyes;
  mouth: Mouth;
  drool: boolean;
  stars: boolean;
  stare: boolean; // both pupils dead centre: looking at the camera
};

const LINE = 0.067; // the outline pen (9 px at 135 px per unit in the videos)
const THIN = 0.052;

// The face for a mood. Deadpan by default: the grin and the drool stay on
// through almost everything.
export function faceFor(mood: Mood): FaceState {
  const f: FaceState = { eyes: 'derp', mouth: 'smile', drool: true, stars: false, stare: false };
  switch (mood) {
    case 'happy':
      f.mouth = 'grin';
      break;
    case 'laugh':
      f.eyes = 'shut';
      f.mouth = 'bigo';
      f.drool = false;
      break;
    case 'hurt':
      f.eyes = 'shut';
      f.mouth = 'o';
      f.drool = false;
      break;
    case 'angry':
      f.eyes = 'angry';
      f.mouth = 'flat';
      f.drool = false;
      break;
    case 'sad':
      f.eyes = 'sad';
      f.mouth = 'frown';
      break;
    case 'shock':
      f.eyes = 'wide';
      f.mouth = 'o';
      f.drool = false;
      break;
    case 'dead':
      f.eyes = 'x';
      f.mouth = 'o';
      f.drool = false;
      break;
    case 'smug':
      f.eyes = 'heavy';
      break;
    case 'wink':
      f.eyes = 'wink';
      f.mouth = 'grin';
      break;
    case 'sleepy':
      f.eyes = 'shut';
      f.mouth = 'flat';
      break;
    case 'scared':
      f.eyes = 'wide';
      f.mouth = 'wobble';
      f.drool = false;
      break;
    case 'chew':
      f.mouth = 'chew';
      f.drool = false;
      break;
    case 'camera':
      f.eyes = 'wide';
      f.mouth = 'flat';
      f.stare = true;
      f.drool = false;
      break;
    case 'dazed':
      f.eyes = 'spiral';
      f.stars = true;
      break;
    default:
      break;
  }
  return f;
}

const P = (x: number, y: number): [number, number] => [x, y];

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 9): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

// Everything to draw for one head at time `t`: outline, face, hat. Pupils
// wander on their own clocks (seeded per derp) unless the face stares.
export function derpDrawing(shape: HeadShape, hat: HatId, face: FaceState, t: number, seed: number): InkPrim[] {
  const A = ANCHORS[shape];
  const out: InkPrim[] = [];
  const behind = hatBehind(hat, A, t);
  out.push(...behind);
  out.push({ k: 'blob', pts: HEAD_OUTLINE[shape], fill: PAPER, w: LINE });
  const { er, mw } = A;
  const [mx, my] = A.mo;

  // Eyes: each minds its own business.
  const wander: [number, number][] = face.stare
    ? [
        [0, 0],
        [0, 0],
      ]
    : [
        [Math.sin(t * 2.1 + seed) * 0.55, Math.cos(t * 1.3 + seed) * 0.4],
        [Math.sin(t * 1.4 + 2 + seed) * 0.55, Math.cos(t * 2.6 + 1 + seed) * 0.4],
      ];
  const eyes: [number, number][] = [A.e1, A.e2];
  eyes.forEach(([ex, ey], i) => {
    const big = i === 0 ? 1.0 : 1.25;
    const r = er * big;
    const shut = face.eyes === 'shut' || (face.eyes === 'wink' && i === 1);
    if (shut) {
      out.push({ k: 'line', pts: [P(ex - er * 1.1, ey), P(ex, ey - er * 0.25), P(ex + er * 1.1, ey)], w: THIN });
      return;
    }
    if (face.eyes === 'x') {
      out.push({ k: 'line', pts: [P(ex - r, ey + r), P(ex + r, ey - r)], w: THIN });
      out.push({ k: 'line', pts: [P(ex - r, ey - r), P(ex + r, ey + r)], w: THIN });
      return;
    }
    const wide = face.eyes === 'wide';
    const s = wide ? 1.25 : 1;
    out.push({ k: 'blob', pts: ellipse(ex, ey, r * 1.25 * s, r * 0.85 * s), fill: PAPER, w: 0.045 });
    if (face.eyes === 'spiral') {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 14; k++) {
        const a = k * 0.9 + t * 9 * (i === 0 ? 1 : -1);
        const rr = (k / 14) * r * 0.9;
        pts.push([ex + Math.cos(a) * rr, ey + Math.sin(a) * rr * 0.75]);
      }
      out.push({ k: 'line', pts, w: 0.03 });
      return;
    }
    const [wx, wy] = wander[i];
    const pr = r * (wide ? 0.3 : 0.5);
    out.push({ k: 'dot', c: [ex + clamp(wx) * r * 0.55, ey - clamp(wy) * r * 0.3], r: pr });
  });
  // Lids: heavy and uneven, or set for the mood.
  const [e1x, e1y] = A.e1;
  const [e2x, e2y] = A.e2;
  if (face.eyes === 'derp' || face.eyes === 'heavy' || face.eyes === 'wink') {
    const drop = face.eyes === 'heavy' ? er * 0.45 : 0;
    out.push({ k: 'line', pts: [P(e1x - er * 1.4, e1y + er * 0.75 - drop), P(e1x + er * 1.5, e1y + er * 0.2 - drop)], w: THIN });
    if (face.eyes !== 'wink') out.push({ k: 'line', pts: [P(e2x - er * 1.7, e2y + er * 0.35 - drop), P(e2x + er * 1.7, e2y + er * 0.9 - drop)], w: THIN });
  } else if (face.eyes === 'angry') {
    // Brows slope down toward the middle.
    out.push({ k: 'line', pts: [P(e1x - er * 1.4, e1y + er * 1.3), P(e1x + er * 1.5, e1y + er * 0.5)], w: THIN });
    out.push({ k: 'line', pts: [P(e2x - er * 1.7, e2y + er * 0.6), P(e2x + er * 1.7, e2y + er * 1.5)], w: THIN });
  } else if (face.eyes === 'sad') {
    out.push({ k: 'line', pts: [P(e1x - er * 1.4, e1y + er * 0.6), P(e1x + er * 1.5, e1y + er * 1.3)], w: THIN });
    out.push({ k: 'line', pts: [P(e2x - er * 1.7, e2y + er * 1.5), P(e2x + er * 1.7, e2y + er * 0.7)], w: THIN });
  }

  // Mouth
  const thick = shape === 'pea' ? 0.07 : 0.096;
  switch (face.mouth) {
    case 'smile':
    case 'grin': {
      const g = face.mouth === 'grin' ? 1.25 : 1;
      out.push({ k: 'line', pts: [P(mx - mw * g, my + 0.05), P(mx - mw * 0.2 * g, my - 0.12 * g), P(mx + mw * 0.7 * g, my - 0.02), P(mx + mw * g, my + 0.18 * g)], w: thick });
      break;
    }
    case 'o':
    case 'bigo': {
      const k = face.mouth === 'bigo' ? 1.5 + Math.sin(t * 18) * 0.2 : 1;
      const sc = shape === 'pea' ? 0.45 : 1;
      out.push({ k: 'blob', pts: ellipse(mx, my - 0.02, 0.16 * k * sc, 0.2 * k * sc, 8), fill: INK, w: 0.06 });
      break;
    }
    case 'chew': {
      const k = Math.sin(t * 22) * 0.06;
      out.push({ k: 'line', pts: [P(mx - mw * 0.8, my - k), P(mx, my - 0.1 + k), P(mx + mw * 0.8, my - k)], w: thick * 0.9 });
      break;
    }
    case 'flat':
      out.push({ k: 'line', pts: [P(mx - mw * 0.7, my), P(mx + mw * 0.7, my + 0.02)], w: thick * 0.8 });
      break;
    case 'frown':
      out.push({ k: 'line', pts: [P(mx - mw * 0.8, my - 0.1), P(mx, my + 0.04), P(mx + mw * 0.8, my - 0.08)], w: thick * 0.85 });
      break;
    case 'wobble': {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 6; k++) pts.push([mx - mw * 0.7 + (k / 6) * mw * 1.4, my + (k % 2 ? 0.05 : -0.05) + Math.sin(t * 30 + k) * 0.015]);
      out.push({ k: 'line', pts, w: thick * 0.7 });
      break;
    }
  }
  if (face.drool) {
    const dl = 0.25 + 0.18 * (Math.sin(t * 3 + seed) * 0.5 + 0.5);
    for (const dx of [-0.04, 0.05]) {
      const ax = mx - mw * 0.25 + dx;
      const ay = my - 0.12;
      out.push({ k: 'line', pts: [P(ax, ay), P(ax + 0.015, ay - dl)], w: 0.037, col: DROOL });
    }
  }
  out.push(...hatFront(hat, A, t));
  if (face.stars) out.push(...stars(A, t));
  return out;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

// ---- hats -------------------------------------------------------------------
// Drawn on a brim-centred frame (x across the brim, 1 = hat width; y up),
// then tilted and placed on the head's own hat anchor.
type HatFrame = (x: number, y: number) => [number, number];
function frame(A: Anchors): HatFrame {
  const c = Math.cos(A.hatTilt);
  const s = Math.sin(A.hatTilt);
  return (x, y) => {
    const px = x * A.hatW;
    const py = y * A.hatW;
    return [A.hat[0] + px * c - py * s, A.hat[1] + px * s + py * c];
  };
}

// The few hats with a part behind the head (the arrow's tail end).
function hatBehind(hat: HatId, A: Anchors, _t: number): InkPrim[] {
  if (hat !== 'arrow') return [];
  // Shaft passes behind: drawn first, the head covers its middle.
  const y = A.hat[1] * 0.62;
  const L = A.hatW * 1.15;
  return [{ k: 'line', pts: [P(A.hat[0] - L, y + 0.1), P(A.hat[0] + L, y - 0.04)], w: 0.07, col: '#96602D' }];
}

function hatFront(hat: HatId, A: Anchors, t: number): InkPrim[] {
  const F = frame(A);
  const pts = (list: [number, number][]) => list.map(([x, y]) => F(x, y));
  switch (hat) {
    case 'tophat':
      return [
        { k: 'blob', pts: pts([[-0.32, 0.02], [0.32, 0.02], [0.29, 0.78], [-0.3, 0.8]]), fill: '#1A1A1A', w: LINE },
        { k: 'line', pts: pts([[-0.3, 0.16], [0.3, 0.15]]), w: 0.09, col: '#C62828' },
        { k: 'line', pts: pts([[-0.58, 0.02], [0.6, 0.0]]), w: 0.09 },
      ];
    case 'party':
      return [
        { k: 'blob', pts: pts([[-0.34, 0], [0.34, 0], [0.04, 0.95]]), fill: '#FF5DA2', w: LINE },
        { k: 'dot', c: F(-0.08, 0.3), r: 0.05, col: '#FFD23F' },
        { k: 'dot', c: F(0.12, 0.5), r: 0.045, col: '#3FA9F5' },
        { k: 'dot', c: F(-0.02, 0.15), r: 0.04, col: '#8BC34A' },
        { k: 'dot', c: F(0.04, 0.98), r: 0.09, col: '#FFD23F' },
      ];
    case 'propeller': {
      const spin = t * 14;
      const L = 0.42;
      const cx = Math.cos(spin) * L;
      return [
        { k: 'blob', pts: pts([[-0.42, 0], [-0.36, 0.2], [-0.18, 0.33], [0.18, 0.33], [0.36, 0.2], [0.42, 0]]), fill: '#3FA9F5', w: LINE },
        { k: 'line', pts: pts([[0, 0.33], [0, 0.55]]), w: 0.05 },
        { k: 'line', pts: pts([[-cx, 0.55], [cx, 0.57]]), w: 0.08, col: '#E53935' },
        { k: 'dot', c: F(0, 0.56), r: 0.05, col: '#FFD23F' },
      ];
    }
    case 'cone':
      return [
        { k: 'blob', pts: pts([[-0.4, 0], [0.4, 0], [0.09, 1.0], [-0.08, 1.0]]), fill: '#FF7A1A', w: LINE },
        { k: 'line', pts: pts([[-0.27, 0.38], [0.27, 0.37]]), w: 0.1, col: '#FFFFFF' },
        { k: 'line', pts: pts([[-0.55, 0.0], [0.55, 0.0]]), w: 0.08 },
      ];
    case 'crown':
      return [
        {
          k: 'blob',
          pts: pts([[-0.4, 0], [0.4, 0], [0.42, 0.45], [0.24, 0.22], [0.1, 0.5], [-0.06, 0.24], [-0.22, 0.48], [-0.34, 0.22], [-0.44, 0.44]]),
          fill: '#FFD23F',
          w: LINE,
        },
      ];
    case 'pot':
      return [
        { k: 'blob', pts: pts([[-0.42, 0.42], [0.42, 0.42], [0.36, -0.04], [-0.36, -0.04]]), fill: '#9AA4AE', w: LINE },
        { k: 'line', pts: pts([[0.42, 0.32], [0.72, 0.36], [0.74, 0.28]]), w: 0.06 },
        { k: 'line', pts: pts([[-0.42, 0.32], [-0.62, 0.34]]), w: 0.06 },
      ];
    case 'viking':
      return [
        { k: 'blob', pts: pts([[-0.45, 0.42], [-0.62, 0.62], [-0.58, 0.95], [-0.48, 0.6]]), fill: '#F1E3C6', w: 0.05 },
        { k: 'blob', pts: pts([[0.45, 0.42], [0.62, 0.62], [0.58, 0.95], [0.48, 0.6]]), fill: '#F1E3C6', w: 0.05 },
        { k: 'blob', pts: pts([[-0.46, 0], [-0.4, 0.3], [-0.2, 0.46], [0.2, 0.46], [0.4, 0.3], [0.46, 0]]), fill: '#9AA4AE', w: LINE },
      ];
    case 'arrow': {
      // Tip out one side, fletching out the other; the shaft is in hatBehind.
      const y = A.hat[1] * 0.62;
      const L = A.hatW * 1.15;
      const tx = A.hat[0] + L;
      const ty = y - 0.04;
      const fx = A.hat[0] - L;
      const fy = y + 0.1;
      return [
        { k: 'line', pts: [P(tx - 0.16, ty + 0.1), P(tx, ty), P(tx - 0.15, ty - 0.11)], w: 0.06 },
        { k: 'line', pts: [P(fx, fy), P(fx - 0.12, fy + 0.13)], w: 0.06, col: '#D62828' },
        { k: 'line', pts: [P(fx + 0.1, fy - 0.01), P(fx - 0.02, fy + 0.13)], w: 0.06, col: '#D62828' },
      ];
    }
    case 'fish': {
      const flap = Math.sin(t * 6) * 0.06;
      return [
        { k: 'blob', pts: pts([[-0.42, 0.12], [-0.2, 0.3], [0.18, 0.32], [0.42, 0.15], [0.18, 0.0], [-0.2, 0.0]]), fill: '#5FB3B3', w: LINE },
        { k: 'blob', pts: pts([[-0.42, 0.14], [-0.66, 0.34 + flap], [-0.62, -0.04 + flap]]), fill: '#5FB3B3', w: 0.05 },
        { k: 'dot', c: F(0.26, 0.19), r: 0.04 },
      ];
    }
    case 'chef':
      return [
        { k: 'blob', pts: pts([[-0.34, 0], [0.34, 0], [0.36, 0.3], [0.5, 0.52], [0.36, 0.78], [0.1, 0.84], [-0.14, 0.82], [-0.42, 0.74], [-0.5, 0.48], [-0.36, 0.3]]), fill: PAPER, w: LINE },
        { k: 'line', pts: pts([[-0.34, 0.26], [0.35, 0.27]]), w: 0.05 },
      ];
    case 'beanie':
      return [
        { k: 'blob', pts: pts([[-0.42, 0], [-0.4, 0.24], [-0.22, 0.42], [0.22, 0.42], [0.4, 0.24], [0.42, 0]]), fill: '#E53935', w: LINE },
        { k: 'line', pts: pts([[-0.44, 0.06], [0.44, 0.06]]), w: 0.12, col: '#B71C1C' },
        { k: 'dot', c: F(0, 0.5), r: 0.11, col: '#FFFFFF' },
      ];
    case 'bucket':
      return [
        { k: 'blob', pts: pts([[-0.33, 0.12], [-0.28, 0.48], [0.28, 0.48], [0.33, 0.12]]), fill: '#C9B98A', w: LINE },
        { k: 'blob', pts: pts([[-0.6, 0.0], [0.6, 0.0], [0.36, 0.14], [-0.36, 0.14]]), fill: '#C9B98A', w: LINE },
        { k: 'line', pts: pts([[-0.31, 0.2], [0.31, 0.2]]), w: 0.07, col: '#6D5F3A' },
      ];
    case 'cowboy':
      return [
        { k: 'blob', pts: pts([[-0.32, 0.06], [0.32, 0.06], [0.3, 0.46], [0.12, 0.54], [0, 0.45], [-0.12, 0.54], [-0.3, 0.46]]), fill: '#A0703A', w: LINE },
        { k: 'line', pts: pts([[-0.31, 0.14], [0.31, 0.14]]), w: 0.08, col: '#4A2C14' },
        { k: 'blob', pts: pts([[-0.8, 0.14], [-0.58, 0.0], [0.58, 0.0], [0.8, 0.14], [0.55, 0.08], [-0.55, 0.08]]), fill: '#A0703A', w: LINE },
      ];
    case 'halo': {
      const bob = Math.sin(t * 2.4) * 0.03;
      const ring = ellipse(0, 0.5 + bob, 0.38, 0.09, 14).map(([x, y]) => F(x, y));
      return [{ k: 'line', pts: [...ring, ring[0]], w: 0.075, col: '#FFC400' }];
    }
    default:
      return [];
  }
}

function stars(A: Anchors, t: number): InkPrim[] {
  const out: InkPrim[] = [];
  const cx = A.hat[0];
  const cy = A.hat[1] + 0.25;
  const R = A.hatW * 0.55;
  for (let i = 0; i < 3; i++) {
    const a = t * 3 + (i / 3) * Math.PI * 2;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R * 0.25;
    const pts: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.05 : 0.13;
      const b = (k / 10) * Math.PI * 2 - Math.PI / 2;
      pts.push([x + Math.cos(b) * r, y + Math.sin(b) * r]);
    }
    out.push({ k: 'blob', pts, fill: '#FFD23F', w: 0.035 });
  }
  return out;
}
