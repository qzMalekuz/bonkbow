import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';
import { useGameStore } from '@/game/store';
import { playSfx } from '@/audio/sound';

// Two layers of feedback, both user-toggleable in Settings:
// - expo-haptics: short, precise taps (Android uses the haptic-feedback
//   constants; Seeker has a good actuator). Used for bow-draw ticks, release,
//   hits.
// - Vibration API: longer, coarser buzzes for big moments (kill, own death,
//   game over). Android needs the VIBRATE permission — Expo prebuild adds it.
//
// Every call is fire-and-forget and never throws into the game loop. Call
// these from the JS thread only (wrap in runOnJS from worklets).

const hapticsOn = () => useGameStore.getState().hapticsEnabled;
const vibrationOn = () => useGameStore.getState().vibrationEnabled;

const safe = (p: Promise<void>) => {
  p.catch(() => {});
};

export const haptic = {
  // Bow being drawn: one tick per power notch, like a ratchet — the ticks
  // get heavier as the string tightens so tension is felt, not just seen.
  drawTick: (power = 0) => {
    if (!hapticsOn()) return;
    if (power < 0.45) safe(Haptics.selectionAsync());
    else safe(Haptics.impactAsync(power < 0.8 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium));
  },
  // Touch down on the canvas.
  aimStart: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  // Arrow released.
  release: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  // Generic UI tap.
  tap: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  // Arrow landed in the enemy's body (not fatal).
  bodyHit: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    if (vibrationOn()) Vibration.vibrate(30);
  },
  // Enemy killed (headshot or final body hit).
  kill: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    if (vibrationOn()) Vibration.vibrate([0, 40, 60, 90]);
  },
  // Player took a hit but survived.
  takeHit: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
    if (vibrationOn()) Vibration.vibrate(70);
  },
  // Player died → game over.
  death: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    if (vibrationOn()) Vibration.vibrate([0, 120, 80, 220]);
  },
  // Arrow hit the ground / flew off screen.
  miss: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  },
  // Arrow clanged off armour.
  shieldHit: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
  },
  // Armour shattered.
  shieldBreak: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    if (vibrationOn()) Vibration.vibrate([0, 30, 40, 50]);
  },
  // Emote / message bubble popped up.
  emote: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  },
  // Turn timer is about to run out.
  timerWarn: () => {
    if (hapticsOn()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  // Opponent found / VS slam.
  matchFound: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    if (vibrationOn()) Vibration.vibrate(45);
  },
  victory: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    if (vibrationOn()) Vibration.vibrate([0, 50, 70, 50, 70, 120]);
  },
  defeat: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  // XP bar filling: tiny ticks; level-up: a satisfying thump.
  xpTick: () => {
    if (hapticsOn()) safe(Haptics.selectionAsync());
  },
  levelUp: () => {
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    if (vibrationOn()) Vibration.vibrate([0, 40, 50, 80]);
  },
  // UI outcomes also play their sound, so every call site gets both.
  success: () => {
    playSfx('ui_confirm');
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning: () => {
    playSfx('ui_error');
    if (hapticsOn()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  cancelVibration: () => Vibration.cancel(),
};
