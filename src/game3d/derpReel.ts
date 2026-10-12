import type { RigPose } from '@/game3d/Stickman3D';
import { GESTURE_SECONDS, type Gesture, type Mood } from '@/game3d/sim';

// The derp reel: what an archer gets up to in the shop's preview (and the
// showcase's `reel` action). Standing there, a snack (an arrow), a rough
// aim and a release, seeing stars, a long look down the lens, celebrating
// for no reason, a yawn and a shrug, looping. The rig's blends ease every
// cut between steps.

export type ReelStep = {
  label: string;
  seconds: number;
  mood: Mood;
  gesture?: Gesture;
  aim?: boolean;
  shoot?: boolean;
  bonk?: boolean; // flinch at the start, as if the arrow came back down
};

export const REEL: ReelStep[] = [
  { label: 'Standing there', seconds: 2.2, mood: 'neutral' },
  { label: 'Snack', seconds: GESTURE_SECONDS.eat, mood: 'chew', gesture: 'eat' },
  { label: 'Aiming, roughly', seconds: 2.2, mood: 'neutral', aim: true },
  { label: 'Fires', seconds: 1.4, mood: 'happy', aim: true, shoot: true },
  { label: 'Bonk', seconds: 2.4, mood: 'dazed', bonk: true },
  { label: 'Looks at you', seconds: 2.2, mood: 'camera' },
  { label: 'Celebrates early', seconds: GESTURE_SECONDS.cheer, mood: 'laugh', gesture: 'cheer' },
  { label: 'Yawns', seconds: GESTURE_SECONDS.yawn, mood: 'sleepy', gesture: 'yawn' },
  { label: 'Shrugs', seconds: GESTURE_SECONDS.shrug + 0.4, mood: 'neutral', gesture: 'shrug' },
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

// Fill the pose for time t of the reel. Returns the step it is on.
export function reelPose(t: number, p: RigPose) {
  const { step: s, at } = reelStep(t);
  p.x = 0;
  p.walk = 0;
  p.run = 0;
  p.crouch = 0;
  p.look = 0;
  p.ready = !!s.aim;
  p.draw = 0;
  p.angle = 0.12;
  p.mood = s.mood;
  p.gesture = s.gesture ?? null;
  p.gestureT = at;
  p.flash = 0;
  p.flinch = s.bonk ? Math.max(0, 1 - at * 2.2) : 0;
  p.showNocked = true;
  if (s.aim && !s.shoot) {
    // Draws, then wanders the aim about with total confidence.
    p.draw = Math.min(1, Math.max(0, (at - 0.4) / 1.1));
    p.angle = 0.12 + Math.sin(at * 2.3) * 0.25;
  }
  if (s.shoot) {
    // Straight up, mostly. The string twangs, the arm kicks.
    p.angle = 0.12 + Math.min(1, at / 0.3) * 1.1;
    p.draw = at < 0.35 ? 1 : 0;
    p.recoil = at < 0.35 ? 0 : Math.max(0, 1 - (at - 0.35) * 1.6);
    p.showNocked = at < 0.35 || at > 1.1;
  } else p.recoil = 0;
  return s;
}
