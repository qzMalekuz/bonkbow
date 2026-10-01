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

// Stickman proportions (metres). The figure stands with feet on its ledge.
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

// Health is red, the shield (armour) is blue. Body hits drain the shield
// first; leg hits split between shield and health; headshots ignore it.
export const HP = { max: 100, shield: 80 };
export const DAMAGE = { head: 58, body: 34, legs: 26 };

export const AI = {
  noiseStart: 0.075,
  noiseMin: 0.018,
  noiseDecayPerKill: 0.006,
  skillSlackMax: 1.35,
  skillSlackMin: 0.7,
  speedFraction: 0.86,
  thinkMs: 900,
  respawnMs: 1900,
};

export const TURN_SECONDS = 20;
export const ARROW_LEN = 0.82;
export const MAX_STUCK = 12;
// Each archer stands this far back from the cliff edge of their ledge.
export const LEDGE_FRONT = 1.3;

export type HitZone = 'head' | 'body' | 'legs';
export type Zone = HitZone | 'miss';
export type Surface = 'ground' | 'ledge' | 'none';

// A round's arena: I stand at x = 0; the opponent at x = gap. Ledge heights
// are per role so both phones agree on who stands where.
export type Layout = { gap: number; hostLedge: number; guestLedge: number; theme: number };

export function layoutFor(seed: number, index: number): Layout {
  const rnd = mulberry32(seed + index * 7919);
  return {
    gap: 18 + rnd() * 12,
    hostLedge: 2 + rnd() * 4.5,
    guestLedge: 2 + rnd() * 4.5,
    theme: Math.floor(rnd() * 1000),
  };
}

// Where the bow hand is for an archer at (x, top) aiming at `angle` (y-up).
export function handPoint(x: number, top: number, angle: number) {
  return { x: x + Math.cos(angle) * ARM_REACH, y: top + SHOULDER_Y + Math.sin(angle) * ARM_REACH };
}

// Arrow tip vs a standing figure at (x, top).
export function hitTest(x: number, top: number, tx: number, ty: number): HitZone | null {
  const hx = tx - x;
  const hy = ty - (top + HEAD_Y);
  const r = BODY.headR + 0.05;
  if (hx * hx + hy * hy <= r * r) return 'head';
  if (Math.abs(hx) > 0.17 || ty < top || ty > top + SHOULDER_Y + BODY.neck) return null;
  return ty < top + HIP_Y ? 'legs' : 'body';
}

// Damage for a hit, split into what the shield soaks and what health loses.
// Harder draws hit harder (power 0.12..1 → ×0.8..×1.2).
export function damageFor(zone: HitZone, power: number, shield: number) {
  const raw = Math.round(DAMAGE[zone] * (0.75 + power * 0.45));
  if (zone === 'head') return { shield: 0, hp: raw, raw };
  const toShield = Math.min(shield, zone === 'body' ? raw : Math.round(raw / 2));
  return { shield: toShield, hp: raw - toShield, raw };
}

// Ledge geometry: each archer's ledge runs from LEDGE_FRONT in front of them
// back off-screen; the gap between the cliffs is ground level (y = 0).
export function onLedge(archerX: number, facing: 1 | -1, x: number) {
  return facing === 1 ? x <= archerX + LEDGE_FRONT : x >= archerX - LEDGE_FRONT;
}

export type FlightResult = { zone: Zone; surface: Surface; x: number; y: number; angle: number; steps: number };

type Side = { x: number; top: number; facing: 1 | -1 };

// Simulates a whole shot ahead of time with the same fixed step the live
// arrow uses. The scene uses it to know a lethal hit is coming (bullet time).
export function simulateShot(from: { x: number; y: number }, angle: number, power: number, target: Side, own: Side): FlightResult {
  const v = power * PHYS.maxSpeed;
  let x = from.x;
  let y = from.y;
  const vx = Math.cos(angle) * v;
  let vy = Math.sin(angle) * v;
  for (let i = 1; i < 120 * 8; i++) {
    const r = stepArrow(x, y, vx, vy);
    x = r.x;
    y = r.y;
    vy = r.vy;
    const a = Math.atan2(vy, vx);
    const zone = hitTest(target.x, target.top, x, y);
    if (zone) return { zone, surface: 'none', x, y, angle: a, steps: i };
    const surf = surfaceHit(x, y, target, own);
    if (surf) return { zone: 'miss', surface: surf, x, y: surf === 'ground' ? Math.max(0, y) : y, angle: a, steps: i };
    if (Math.abs(x - from.x) > 90 || y < -5) return { zone: 'miss', surface: 'none', x, y, angle: a, steps: i };
  }
  return { zone: 'miss', surface: 'none', x, y, angle: 0, steps: 0 };
}

export function stepArrow(x: number, y: number, vx: number, vy: number) {
  const nvy = vy - PHYS.gravity * PHYS.step;
  return { x: x + vx * PHYS.step, y: y + nvy * PHYS.step, vy: nvy };
}

// Solid rock: either cliff, or the ground in the gap.
export function surfaceHit(x: number, y: number, target: Side, own: Side): Surface | null {
  if (y <= target.top && onLedge(target.x, target.facing, x)) return 'ledge';
  if (y <= own.top && onLedge(own.x, own.facing, x)) return 'ledge';
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
