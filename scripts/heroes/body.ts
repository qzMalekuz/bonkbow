// The heroes' chibi suit (archer-boys.pdf): chunky black body, turtleneck
// collar, mitten hands, round boots, and per hero the leather straps and
// jacket details. Sculpted as a signed distance field in metres in the bind
// pose (model faces +z, y up) and skinned to a small skeleton that
// StickmanBody.ts drives exactly like the Unity asset's (same bone names).
import type { HeroSpec } from '../../src/game3d/heroSpecs';
import { BODY } from '../../src/game3d/world';
import { type SDF, type V3, capsule, clamp, ellipsoid, noise3, roundBox, smax, smin, smoothstep, sphere } from './sdf';
import { type Grid, type Shade, hex, lerp3 } from './mesh';

export type Bone = { name: string; parent: number; at: V3 }; // joint position, bind pose
export type BodySculpt = { f: SDF; shade: Shade; grid: Grid; bones: Bone[]; weights: (x: number, y: number, z: number) => [number, number][] };

// Bind-pose joints. Leg and arm lengths match the rig (world.ts BODY) so the
// IK reaches what the rig asks for; the ankle joint sits at the sole.
const HIP = BODY.thigh + BODY.shin;
const SH_Y = HIP + BODY.torso - 0.06; // shoulders sit a little low on the chunky torso
const SH_X = 0.3;
const ARM_DROP = 0.25; // arms hang slightly out (A-pose), radians from straight down
const HIP_X = 0.125;

function armJoints(side: number): [V3, V3, V3, V3] {
  const sx = side * SH_X;
  const dx = Math.sin(ARM_DROP) * side;
  const dy = -Math.cos(ARM_DROP);
  const s: V3 = [sx, SH_Y, 0];
  const e: V3 = [sx + dx * BODY.upperArm, SH_Y + dy * BODY.upperArm, 0];
  const w: V3 = [e[0] + dx * BODY.foreArm, e[1] + dy * BODY.foreArm, 0];
  const tip: V3 = [w[0] + dx * 0.1, w[1] + dy * 0.1, 0];
  return [s, e, w, tip];
}

export function sculptBody(s: HeroSpec): BodySculpt {
  // Right = model −x (the rig's camera side once turned to face +x).
  const bones: Bone[] = [];
  const add = (name: string, parent: number, at: V3) => bones.push({ name, parent, at }) - 1;
  const root = add('Root', -1, [0, HIP, 0]);
  const spine = add('Spine', root, [0, HIP + 0.06, 0]);
  add('Head', spine, [0, HIP + BODY.torso + BODY.neck, 0]);
  const limbs: Record<string, number> = {};
  for (const [name, side] of [
    ['Right', -1],
    ['Left', 1],
  ] as const) {
    const up = add(`${name}UpLeg`, root, [side * HIP_X, HIP - 0.04, 0]);
    const knee = add(`${name}Leg`, up, [side * HIP_X, HIP - 0.04 - BODY.thigh, 0]);
    limbs[`${name}Foot`] = add(`${name}Foot`, knee, [side * HIP_X, HIP - 0.04 - BODY.thigh - BODY.shin, 0]);
    limbs[`${name}UpLeg`] = up;
    limbs[`${name}Leg`] = knee;
    const [sh, el, wr] = armJoints(side);
    const arm = add(`${name}Arm`, spine, sh);
    const fore = add(`${name}ForeArm`, arm, el);
    limbs[`${name}Hand`] = add(`${name}Hand`, fore, wr);
    limbs[`${name}Arm`] = arm;
    limbs[`${name}ForeArm`] = fore;
  }

  // --- parts (each tagged with the bone it moves with) -------------------
  type Part = { f: SDF; bone: number };
  const parts: Part[] = [];
  const part = (f: SDF, bone: number) => parts.push({ f, bone });
  // Torso: a soft barrel, fuller at the chest, narrowing to the waist.
  const chestY = SH_Y - 0.08;
  part(ellipsoid([0, HIP + 0.28, 0], [0.29, 0.33, 0.2]), spine);
  part(ellipsoid([0, chestY, 0.01], [0.33, 0.2, 0.21]), spine);
  // Shoulders, rounded over.
  for (const side of [-1, 1]) part(sphere([side * SH_X * 0.8, SH_Y - 0.03, 0], 0.1), spine);
  // Turtleneck collar.
  part(capsule([0, SH_Y, -0.01], [0, SH_Y + 0.06, -0.015], 0.15, 0.14), spine);
  // Pelvis.
  part(ellipsoid([0, HIP + 0.02, 0], [0.26, 0.16, 0.19]), root);
  for (const [name, side] of [
    ['Right', -1],
    ['Left', 1],
  ] as const) {
    const hx = side * HIP_X;
    const kneeY = HIP - 0.04 - BODY.thigh;
    part(capsule([hx, HIP - 0.04, 0], [hx, kneeY, 0], 0.13, 0.112), limbs[`${name}UpLeg`]);
    part(capsule([hx, kneeY, 0], [hx, 0.14, 0], 0.11, 0.1), limbs[`${name}Leg`]);
    // Boot: round toe forward, flat sole.
    const boot: SDF = (x, y, z) => {
      const b = roundBox([hx, 0.08, 0.05], [0.1, 0.08, 0.15], 0.075)(x, y, z);
      const toe = ellipsoid([hx, 0.085, 0.13], [0.103, 0.085, 0.11])(x, y, z);
      return smax(smin(b, toe, 0.04), -y, 0.01);
    };
    part(boot, limbs[`${name}Foot`]);
    const [sh, el, wr, tip] = armJoints(side);
    part(capsule(sh, el, 0.1, 0.088), limbs[`${name}Arm`]);
    part(capsule(el, wr, 0.088, 0.08), limbs[`${name}ForeArm`]);
    // Mitten: a round fist with a thumb.
    const hc: V3 = [(wr[0] + tip[0]) / 2, (wr[1] + tip[1]) / 2, 0.005];
    const mitt: SDF = (x, y, z) => smin(ellipsoid(hc, [0.1, 0.11, 0.1])(x, y, z), capsule([hc[0] - side * 0.012, hc[1] + 0.025, 0.07], [hc[0] - side * 0.05, hc[1] - 0.012, 0.105], 0.038)(x, y, z), 0.02);
    part(mitt, limbs[`${name}Hand`]);
  }

  // --- straps and jacket (on the torso surface) ---------------------------
  const torso: SDF = (x, y, z) => smin(parts[0].f(x, y, z), parts[1].f(x, y, z), 0.08);
  // A strap: band where the torso shell crosses a slab across the chest.
  const strap = (from: V3, to: V3, w: number): SDF => {
    const d: V3 = [to[0] - from[0], to[1] - from[1], 0];
    const l = Math.hypot(d[0], d[1]);
    const n: V3 = [-d[1] / l, d[0] / l, 0]; // slab normal in the xy-plane
    return (x, y, z) => {
      const slab = Math.abs((x - from[0]) * n[0] + (y - from[1]) * n[1]) - w;
      const shell = Math.abs(torso(x, y, z) - 0.012) - 0.011;
      return Math.max(slab, shell);
    };
  };
  const straps: SDF[] = [];
  const o = s.outfit;
  if (o.straps === 'single' || o.straps === 'cross') straps.push(strap([-0.26, SH_Y + 0.02, 0], [0.28, HIP + 0.05, 0], 0.032)); // right shoulder → left hip
  if (o.straps === 'cross') straps.push(strap([0.26, SH_Y + 0.02, 0], [-0.28, HIP + 0.05, 0], 0.032));
  const quilt = o.jacket === 'quilted';
  const blazer = o.jacket === 'blazer';
  // Blazer: lapels folded back either side of the chest, a hem round the hips.
  const lapels: SDF[] = blazer
    ? [-1, 1].map((side) => {
        const f0 = roundBox([side * 0.11, chestY + 0.02, 0.205], [0.06, 0.13, 0.014], 0.012, { z: side * 0.35, y: side * -0.3 });
        return (x: number, y: number, z: number) => f0(x, y, z);
      })
    : [];
  const hem = blazer ? ellipsoid([0, HIP + 0.04, 0.0], [0.265, 0.12, 0.2]) : null;

  const f: SDF = (x, y, z) => {
    let d = 1e9;
    for (const p of parts) d = smin(d, p.f(x, y, z), 0.07);
    if (quilt && y > HIP && y < SH_Y + 0.02) d += 0.004 * Math.abs(Math.sin((y - HIP) * 55)) - 0.002;
    for (const st of straps) d = Math.min(d, st(x, y, z));
    for (const l of lapels) d = smin(d, l(x, y, z), 0.01);
    if (hem) d = smin(d, hem(x, y, z), 0.02);
    return d;
  };

  const suit = hex('#141417');
  const suitHi = hex('#1D1D22');
  const leather = hex('#6E3F22');
  const leatherDark = hex('#4A2814');
  const buckle = hex('#B8B2A6');
  const shade: Shade = (x, y, z) => {
    for (const st of straps) {
      const d = st(x, y, z);
      if (d < 0.004) {
        // Stitched edges darker; a buckle on the chest.
        const edge = clamp((d + 0.006) / 0.006);
        if (Math.hypot(x + 0.02, y - (chestY - 0.06)) < 0.03 && z > 0) return { rgb: buckle, group: 0 };
        return { rgb: lerp3(leather, leatherDark, edge * 0.7 + noise3(x * 60, y * 60, z * 60, 4) * 0.2), group: 0 };
      }
    }
    for (const l of lapels) if (l(x, y, z) < 0.004) return { rgb: suitHi, group: 0 };
    let c = suit;
    if (quilt && y > HIP && y < SH_Y + 0.02) c = lerp3(suit, hex('#0C0C0E'), smoothstep(0.85, 1, Math.abs(Math.cos((y - HIP) * 55))));
    // Boot soles a touch lighter so the feet read.
    if (y < 0.025) c = hex('#26262B');
    return { rgb: c, group: 0 };
  };

  // Skin weights: soft-min over the parts' distances, so each joint blends
  // between the two parts that meet there.
  const weights = (x: number, y: number, z: number): [number, number][] => {
    const acc = new Map<number, number>();
    for (const p of parts) {
      const d = p.f(x, y, z);
      const w = Math.exp(-Math.max(0, d + 0.02) / 0.012);
      acc.set(p.bone, (acc.get(p.bone) ?? 0) + w);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((k, [, w]) => k + w, 0) || 1;
    return top.map(([b, w]) => [b, w / sum]);
  };

  const grid: Grid = { min: [-0.58, -0.01, -0.28], max: [0.58, SH_Y + 0.22, 0.34], step: 0.009 };
  return { f, shade, grid, bones, weights };
}
