// Duel rules for the 3D game, renderer-independent. The fight happens in the
// x/y plane (x = along the duel, y = up, metres); the 3D scene is dressing
// around it. Both multiplayer phones run this same fixed-step sim, so every
// function here must stay deterministic for the same inputs.
import { mulberry32 } from '@/game/rng';

export const PHYS = {
  gravity: 18, // m/s²
  maxSpeed: 31, // m/s at full draw
  minPower: 0.12, // below this a release is a cancelled shot
  maxDrawPx: 220, // finger travel for a full draw
  step: 1 / 120, // fixed physics step
};

// Stickman proportions (metres). The figure stands with feet at the pillar top.
export const BODY = {
  thigh: 0.44,
  shin: 0.42,
  torso: 0.58,
  neck: 0.07,
  headR: 0.19,
  upperArm: 0.3,
  foreArm: 0.29,
  limbR: 0.042,
  torsoR: 0.05,
};
export const HIP_Y = BODY.thigh + BODY.shin - 0.04; // slight knee bend
export const SHOULDER_Y = HIP_Y + BODY.torso;
export const HEAD_Y = SHOULDER_Y + BODY.neck + BODY.headR;
export const ARM_REACH = BODY.upperArm + BODY.foreArm - 0.04;

export const HP = { max: 100, headshot: 100, body: 50 };

export const AI = {
  noiseStart: 0.075,
  noiseMin: 0.018,
  noiseDecayPerKill: 0.006,
  skillSlackMax: 1.35,
  skillSlackMin: 0.7,
  speedFraction: 0.86,
  thinkMs: 900,
  respawnMs: 1600,
};

export const ARROW_LEN = 0.82;
export const MAX_STUCK = 10;

export type Zone = 'head' | 'body' | 'miss';
export type Surface = 'ground' | 'pillar' | 'none';

// A round's arena: I stand at x = 0; the opponent at x = gap. Pillar heights
// are per role so both phones agree on who stands where.
export type Layout = { gap: number; hostPillar: number; guestPillar: number; theme: number };

export function layoutFor(seed: number, index: number): Layout {
  const rnd = mulberry32(seed + index * 7919);
  return {
    gap: 17 + rnd() * 13,
    hostPillar: 1.2 + rnd() * 5.5,
    guestPillar: 1.2 + rnd() * 5.5,
    theme: Math.floor(rnd() * 1000),
  };
}

// Where the bow hand is for an archer at (x, top) aiming at `angle` (y-up).
export function handPoint(x: number, top: number, angle: number) {
  return { x: x + Math.cos(angle) * ARM_REACH, y: top + SHOULDER_Y + Math.sin(angle) * ARM_REACH };
}

// Arrow tip vs a standing figure at (x, top).
export function hitTest(x: number, top: number, tx: number, ty: number): 'head' | 'body' | null {
  const hx = tx - x;
  const hy = ty - (top + HEAD_Y);
  const r = BODY.headR + 0.05;
  if (hx * hx + hy * hy <= r * r) return 'head';
  if (Math.abs(hx) <= 0.17 && ty >= top && ty <= top + SHOULDER_Y + BODY.neck) return 'body';
  return null;
}

export const PILLAR_HALF = 0.75;

export type FlightResult = { zone: Zone; surface: Surface; x: number; y: number; angle: number; steps: number };

// Simulates a whole shot ahead of time with the same fixed step the live
// arrow uses. The scene uses it to know a headshot is coming (bullet time)
// and the AI uses nothing more than the closed-form solver below.
export function simulateShot(
  from: { x: number; y: number },
  angle: number,
  power: number,
  target: { x: number; top: number },
  ownPillarX: number,
): FlightResult {
  const v = power * PHYS.maxSpeed;
  let x = from.x;
  let y = from.y;
  const vx = Math.cos(angle) * v;
  let vy = Math.sin(angle) * v;
  const dir = Math.sign(vx) || 1;
  for (let i = 1; i < 120 * 8; i++) {
    const r = stepArrow(x, y, vx, vy);
    x = r.x;
    y = r.y;
    vy = r.vy;
    const a = Math.atan2(vy, vx);
    const zone = hitTest(target.x, target.top, x, y);
    if (zone) return { zone, surface: 'none', x, y, angle: a, steps: i };
    const surf = surfaceHit(x, y, target, ownPillarX, dir);
    if (surf) return { zone: 'miss', surface: surf, x, y: surf === 'ground' ? Math.max(0, y) : y, angle: a, steps: i };
    if (Math.abs(x - from.x) > 90 || y < -5) return { zone: 'miss', surface: 'none', x, y, angle: a, steps: i };
  }
  return { zone: 'miss', surface: 'none', x, y, angle: 0, steps: 0 };
}

export function stepArrow(x: number, y: number, vx: number, vy: number) {
  const nvy = vy - PHYS.gravity * PHYS.step;
  return { x: x + vx * PHYS.step, y: y + nvy * PHYS.step, vy: nvy };
}

// Pillars are solid stone; the arrow only collides with the target's pillar
// (it has already left its own).
export function surfaceHit(x: number, y: number, target: { x: number; top: number }, _ownX: number, _dir: number): Surface | null {
  if (Math.abs(x - target.x) < PILLAR_HALF && y <= target.top) return 'pillar';
  if (y <= 0) return 'ground';
  return null;
}

// Launch angle (y-up) that hits (dx, dy) at speed v — the flatter solution.
// Solved for a rightward shot and mirrored, so leftward shots also get the
// direct arc instead of the lob.
export function solveLaunchAngle(dx: number, dy: number, v: number): number | null {
  const g = PHYS.gravity;
  const v2 = v * v;
  const ax = Math.abs(dx);
  const disc = v2 * v2 - g * (g * ax * ax + 2 * dy * v2);
  if (disc < 0) return null;
  const flat = Math.atan2(v2 - Math.sqrt(disc), g * ax);
  return dx < 0 ? Math.PI - flat : flat;
}

// Adaptive AI accuracy noise (radians): tighter as the run's score climbs and
// as the player's lifetime accuracy (skill) rises.
export function enemyNoise(score: number, skill: number) {
  const base = AI.noiseStart - score * AI.noiseDecayPerKill;
  const k = Math.min(1, Math.max(0, skill));
  const factor = AI.skillSlackMax - (AI.skillSlackMax - AI.skillSlackMin) * k;
  return Math.max(AI.noiseMin, base * factor);
}
