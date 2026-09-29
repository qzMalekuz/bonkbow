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
  lineWidth: 3,
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
  skyTop: '#0F2027',
  skyBottom: '#2C5364',
  sun: '#F4D35E',
  ground: '#1B4332',
  pillar: '#40916C',
  pillarEdge: '#2D6A4F',
  player: '#F1FAEE',
  enemy: '#E63946',
  bow: '#B08968',
  arrow: '#F4A261',
  arrowHead: '#FFE8D6',
  aimDots: 'rgba(255,255,255,0.55)',
  hpGood: '#52B788',
  hpBad: '#E63946',
  hpTrack: 'rgba(255,255,255,0.18)',
};
