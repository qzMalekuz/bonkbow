import { ENEMY, PHYSICS } from '@/game/constants';

// Ballistics helpers. Pure worklets so the enemy AI and the aim preview can
// run on the UI thread.

// Launch angle to hit (dx, dy) — screen coords, y down — at speed v. Solves the
// projectile equation and returns the flatter of the two solutions (the
// "direct" shot), or null when the target is out of range.
export const solveLaunchAngle = (dx: number, dy: number, v: number): number | null => {
  'worklet';
  const g = PHYSICS.gravity;
  // Work in y-up: h = -dy
  const h = -dy;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * h * v2);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  // Two solutions; pick the one with the smaller |angle| for a flatter shot
  // when shooting horizontally far, else the higher lob if that's the only one.
  const a1 = Math.atan2(v2 - root, g * dx);
  const a2 = Math.atan2(v2 + root, g * dx);
  const pick = Math.abs(a1) < Math.abs(a2) ? a1 : a2;
  // Convert y-up angle back to screen (y down): negate.
  return -pick;
};

// Enemy accuracy noise (radians). Two inputs:
//   score — tightens within a run, so a streak keeps getting harder;
//   skill — the player's lifetime hit rate in [0, 1] (game/store.ts). A sharp
//           shooter faces a sharper AI; a struggling one gets more slack.
// The result is the adaptive difficulty the HUD calls "Adaptive AI".
export const enemyNoise = (score: number, skill: number) => {
  'worklet';
  const base = ENEMY.noiseStart - score * ENEMY.noiseDecayPerKill;
  const k = Math.min(1, Math.max(0, skill));
  const factor = ENEMY.skillSlackMax - (ENEMY.skillSlackMax - ENEMY.skillSlackMin) * k;
  return Math.max(ENEMY.noiseMin, base * factor);
};

// Symmetric random in [-n, n]
export const jitter = (n: number) => {
  'worklet';
  return (Math.random() * 2 - 1) * n;
};
