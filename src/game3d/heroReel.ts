import type { RigPose } from '@/game3d/Stickman3D';
import type { Mood } from '@/game3d/sim';

// The character-sheet reel (archer-boys.pdf): the five expressions from the
// front, a turnaround of the other three sides, then aiming → shooting →
// walk → run → crouch aim → look back from the side, looping.
// The shop stage plays it so a hero is seen doing everything on its sheet;
// the rig's blends make every cut between segments ease.

export type ReelStep = {
  label: string;
  seconds: number;
  yaw: number; // stage turn (see SIDE): heroes are shown square-on to one side
  mood?: Mood;
  aim?: boolean;
  shoot?: boolean;
  walk?: boolean;
  run?: boolean;
  crouch?: boolean;
  look?: boolean;
};

// Stage turns that put a hero square-on to the camera from each side the
// character sheet drew (the rig itself stands turned 0.42 rad to the camera).
const YAW = 0.42;
export const SIDE = { front: YAW - Math.PI / 2, right: YAW, back: YAW + Math.PI / 2, left: YAW + Math.PI } as const;

export const REEL: ReelStep[] = [
  { label: 'Smile', seconds: 2.2, yaw: SIDE.front, mood: 'happy' },
  { label: 'Neutral', seconds: 1.5, yaw: SIDE.front, mood: 'neutral' },
  { label: 'Angry', seconds: 1.5, yaw: SIDE.front, mood: 'angry' },
  { label: 'Wink', seconds: 1.3, yaw: SIDE.front, mood: 'wink' },
  { label: 'Shock', seconds: 1.4, yaw: SIDE.front, mood: 'shock' },
  { label: 'Right side', seconds: 1.3, yaw: SIDE.right },
  { label: 'Back', seconds: 1.3, yaw: SIDE.back },
  { label: 'Left side', seconds: 1.3, yaw: SIDE.left },
  { label: 'Aiming', seconds: 2.2, yaw: SIDE.right, aim: true },
  { label: 'Shooting', seconds: 1.4, yaw: SIDE.right, aim: true, shoot: true },
  { label: 'Walk', seconds: 2.6, yaw: SIDE.right, walk: true, mood: 'happy' },
  { label: 'Run', seconds: 2.2, yaw: SIDE.right, walk: true, run: true, mood: 'happy' },
  { label: 'Crouch aim', seconds: 2.6, yaw: SIDE.right, aim: true, crouch: true },
  { label: 'Look back', seconds: 2.4, yaw: SIDE.right, look: true },
];
const TOTAL = REEL.reduce((k, s) => k + s.seconds, 0);

export function reelStep(t: number): { step: ReelStep; index: number; at: number } {
  let x = ((t % TOTAL) + TOTAL) % TOTAL;
  for (let i = 0; i < REEL.length; i++) {
    if (x < REEL[i].seconds) return { step: REEL[i], index: i, at: x };
    x -= REEL[i].seconds;
  }
  return { step: REEL[0], index: 0, at: 0 };
}

// Fill the pose for time t of the reel (walk/run in place).
export function reelPose(t: number, p: RigPose) {
  const { step: s, at } = reelStep(t);
  p.x = 0;
  p.walk = 0;
  p.ready = !!s.aim;
  p.draw = 0;
  p.angle = 0.12;
  p.mood = s.mood ?? 'neutral';
  p.run = s.run ? 1 : 0;
  p.crouch = s.crouch ? 1 : 0;
  p.look = s.look ? 1 : 0;
  p.showNocked = true;
  if (s.aim && !s.shoot) p.draw = Math.min(1, Math.max(0, (at - 0.4) / 1.1));
  if (s.shoot) {
    // Full draw, then the release a moment in: the string twangs, the arm kicks.
    p.draw = at < 0.35 ? 1 : 0;
    p.recoil = at < 0.35 ? 0 : Math.max(0, 1 - (at - 0.35) * 1.6);
    p.showNocked = at < 0.35 || at > 1.1;
  } else p.recoil = 0;
  if (s.walk) {
    p.walk = 1;
    p.x = 1; // the rig trails `walk` metres behind its spot: walks in place
    p.stepT = t * (s.run ? 2.6 : 1.7);
  }
  return s;
}
