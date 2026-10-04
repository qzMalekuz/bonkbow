import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

// Touch turntable for menu characters: drag sideways to spin the archer a
// full 360°, flick to let it coast to a stop, touch to catch it. The yaw is
// added on top of the rig's own facing after each `rig.update`.

const RAD_PER_PX = 0.012; // a full turn is ~520 px of drag
const MAX_SPIN = 14; // rad/s, cap on a flick
const FRICTION = 2.6; // 1/s, exponential coast-down
const TAU = Math.PI * 2;

// Something a spin gesture drives. `fx` is where the touch landed, 0..1
// across the screen, for views that hold several turntables.
export interface Spinnable {
  hold(fx: number): void;
  start(): void;
  move(dx: number): void;
  release(vx: number): void;
}

export class Turntable implements Spinnable {
  yaw = 0;
  private vel = 0;
  private base = 0;
  private held = false;

  hold() {
    this.held = true;
    this.vel = 0;
  }

  start() {
    this.base = this.yaw;
  }

  move(dx: number) {
    this.yaw = this.base + dx * RAD_PER_PX;
  }

  release(vx: number) {
    this.held = false;
    this.vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, vx * RAD_PER_PX));
  }

  frame(dt: number) {
    if (this.held || this.vel === 0) return;
    this.yaw = (this.yaw + this.vel * dt) % TAU;
    this.vel *= Math.exp(-FRICTION * dt);
    if (Math.abs(this.vel) < 0.05) this.vel = 0;
  }
}

// Horizontal pan that spins `target`. Wrap a full-screen view in a
// GestureDetector with it, under the menu UI.
export function useSpinGesture(target: Spinnable) {
  const { width } = useWindowDimensions();
  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-6, 6])
        .onBegin((e) => target.hold(e.absoluteX / width))
        .onStart(() => target.start())
        .onUpdate((e) => target.move(e.translationX))
        .onFinalize((e) => target.release(e.velocityX)),
    [target, width],
  );
}
