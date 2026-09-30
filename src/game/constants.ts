// Tuning knobs for the archery duel. Units are canvas pixels and seconds.
// Everything scales off the canvas width so phones with different aspect
// ratios play the same.

export const PHYSICS = {
  gravity: 1400, // px/s² — chunky arc like Stickman Archer
  maxSpeed: 1500, // px/s at full draw
  minPower: 0.12, // below this a release is a cancelled shot, not a fire
  maxDt: 1 / 30, // clamp frame delta so a hitch doesn't tunnel the arrow
  maxDrawPx: 240, // finger travel for a full-power draw
};

export const STICKMAN = {
  headR: 11,
  neck: 6,
  torso: 30,
  legLen: 26,
  armLen: 22,
  lineWidth: 4,
  hitHalfWidth: 9, // torso collision half-width
};

export const ARROW = {
  length: 34,
  lineWidth: 2.5,
  headLen: 8,
  headHalf: 4,
  fletchLen: 9,
  trailPoints: 14, // positions kept for the motion trail
  maxStuck: 8, // arrows left in the ground/pillars/bodies before the oldest vanish
};

// Game-feel effects. Durations in seconds, distances in px.
export const EFFECTS = {
  shakeHit: 7, // screen shake amplitude when someone is hit
  shakeKill: 13,
  shakeDecay: 7, // exponential decay per second
  particles: 36, // pool size
  hitSparks: 14, // particles per body hit
  headSparks: 22,
  dustPuff: 8, // particles when an arrow hits ground/pillar
  particleGravity: 900,
  bowDrawPx: 12, // how far the string pulls back at full power
  breatheAmp: 1.2, // idle chest bob
};

// Painted backdrop palette (dusk). See scenery.tsx.
export const SCENERY = {
  skyTop: '#1D2B53',
  skyMid: '#7E5C8A',
  skyHorizon: '#F4A76B',
  sun: '#FFE2A8',
  sunGlow: '#FFB870',
  cloud: 'rgba(255,226,214,0.75)',
  farTop: '#8C7BA8',
  farBottom: '#B98E9E',
  nearTop: '#4E4A74',
  nearBottom: '#6D5E7E',
  trees: '#2C2A45',
  groundTop: '#3B5B3F',
  groundBottom: '#1E2F22',
  grassEdge: '#5E8B4F',
  pillarLight: '#A39584',
  pillarDark: '#6B6053',
  pillarLines: 'rgba(40,32,26,0.35)',
  pillarCap: '#C2B4A0',
  shadow: 'rgba(0,0,0,0.28)',
  blood: '#C1121F',
  spark: '#FFD166',
  dust: '#C9B79C',
};

export const HP = {
  max: 100,
  headshot: 100,
  body: 50,
};

export const ENEMY = {
  // Accuracy noise in radians; shrinks as score climbs (harder), floors at min.
  noiseStart: 0.14,
  noiseMin: 0.035,
  noiseDecayPerKill: 0.012,
  // Adaptive AI: multiplier on noise for a 0-skill player (max slack) and a
  // 1-skill player (min slack). See aim.ts enemyNoise.
  skillSlackMax: 1.35,
  skillSlackMin: 0.7,
  speedFraction: 0.8, // fraction of maxSpeed the AI launches at
  thinkMs: 700, // delay before the enemy shoots back
  respawnMs: 900, // time the corpse stays before the next enemy appears
};

export const COLORS = {
  skyTop: '#1D2B53', // matches SCENERY.skyTop so screen edges blend with the canvas
  skyBottom: '#2C5364',
  sun: '#F4D35E',
  ground: '#1B4332',
  pillar: '#40916C',
  pillarEdge: '#2D6A4F',
  player: '#F1FAEE',
  enemy: '#E63946',
  bow: '#B08968',
  arrow: '#F4A261',
  arrowShaft: '#E9D8A6',
  arrowHead: '#D9D9D9',
  fletch: '#E63946',
  aimDots: 'rgba(255,255,255,0.55)',
  hpGood: '#52B788',
  hpBad: '#E63946',
  hpTrack: 'rgba(255,255,255,0.18)',
};
