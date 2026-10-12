import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { StickmanRig, makeProjectile, type RigPose } from '@/game3d/Stickman3D';
import { reelPose } from '@/game3d/derpReel';
import { ARM_REACH, PHYS, SHOULDER_Y } from '@/game3d/world';
import { GESTURE_SECONDS, type Death, type Gesture, type Mood } from '@/game3d/sim';
import type { Look } from '@/game/cosmetics';

// Developer character inspector: one archer on a neutral studio floor that
// can be swapped, turned, zoomed and put through every pose the rig has.
// Reached from Settings in dev builds only (src/app/showcase.tsx).

export type ShowAction =
  | 'reel'
  | 'idle'
  | 'aim'
  | 'shoot'
  | 'eat'
  | 'yawn'
  | 'shrug'
  | 'walk'
  | 'run'
  | 'crouch'
  | 'lookback'
  | 'hit'
  | 'win'
  | 'lose'
  | 'death';
export type ShowAngle = 'front' | 'side' | 'back' | 'left';
export type ShowState = { look: Look; action: ShowAction; mood: Mood | 'auto'; angle: ShowAngle; zoom: number; wire: boolean };

export function Showcase({ state, style }: { state: ShowState; style?: ViewStyle }) {
  const [view] = useState(() => new ShowcaseView(state));
  useEffect(() => view.set(state), [view, state]);
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Canvas gl={{ antialias: false }} style={styles.fill} camera={{ fov: 30, position: [0, 1.3, 5] }}>
        <Scene view={view} />
      </Canvas>
    </View>
  );
}

function Scene({ view }: { view: ShowcaseView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  useFrame((_, dt) => view.frame(Math.min(dt, 0.05), camera));
  return null;
}

// Turns that put the archer square-on to the camera from each side (the
// rig itself stands turned YAW to the camera for its 3/4 view).
const YAW = 0.42;
const ANGLES: Record<ShowAngle, number> = { front: YAW - Math.PI / 2, side: YAW, back: YAW + Math.PI / 2, left: YAW + Math.PI };
// Gesture actions loop: the gesture, then a beat of standing there.
const LOOPED: Partial<Record<ShowAction, { g: Gesture; mood: Mood }>> = {
  eat: { g: 'eat', mood: 'chew' },
  yawn: { g: 'yawn', mood: 'sleepy' },
  shrug: { g: 'shrug', mood: 'neutral' },
};

class ShowcaseView {
  private root = new THREE.Group();
  private turn = new THREE.Group();
  private rig: StickmanRig;
  private arrow = makeProjectile({ bow: 'bow', arrow: 'classic' });
  private arrowBow: Look['bow'] = 'bow';
  private shot = { live: false, t: 0, x: 0, y: 0, vx: 0, vy: 0 };
  private state: ShowState;
  private t = 0;
  private actT = 0;
  private fired = false;
  private yaw = ANGLES.front;
  private death: Death | null = null;
  private wire = false;
  private pose: RigPose = {
    x: 0,
    y: 0,
    facing: 1,
    angle: 0.15,
    draw: 0,
    ready: false,
    flash: 0,
    flinch: 0,
    shieldFlash: 0,
    death: null,
    walk: 0,
    stepT: 0,
    mood: 'neutral',
    gesture: null,
    gestureT: 0,
    recoil: 0,
    showNocked: true,
  };

  constructor(state: ShowState) {
    this.state = state;
    this.rig = new StickmanRig(state.look);
    this.arrow.visible = false;
    this.turn.add(this.rig.root, this.arrow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#AEB4BE' }));
    const key = new THREE.DirectionalLight('#FFF4E0', 2.4);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight('#FFFFFF', 1.2);
    rim.position.set(-3, 2.5, -3);
    this.root.add(this.turn, floor, key, rim, new THREE.HemisphereLight('#DDE6FF', '#5A5048', 1.3));
  }

  set(state: ShowState) {
    if (state.action !== this.state.action) {
      this.actT = 0;
      this.fired = false;
      this.death = null;
      this.shot.live = false;
    }
    this.state = state;
    // Swapping the character keeps the pose, the action and the camera.
    this.rig.setLook(state.look);
    if (this.arrowBow !== state.look.bow) {
      this.arrowBow = state.look.bow;
      this.turn.remove(this.arrow);
      this.arrow = makeProjectile(state.look);
      this.arrow.visible = false;
      this.turn.add(this.arrow);
    }
    this.setWire(state.wire);
  }

  attach(scene: THREE.Scene) {
    scene.background = new THREE.Color('#C9CED6');
    scene.add(this.root);
    return () => {
      this.setWire(false); // materials are shared with the game's rigs
      scene.remove(this.root);
    };
  }

  private setWire(on: boolean) {
    if (on === this.wire && !on) return;
    this.wire = on;
    this.rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh && 'wireframe' in o.material) o.material.wireframe = on;
    });
  }

  frame(dt: number, camera: THREE.Camera) {
    const s = this.state;
    const p = this.pose;
    this.t += dt;
    this.actT += dt;
    const a = this.actT;

    p.x = 0;
    p.angle = 0.15;
    p.draw = 0;
    p.ready = false;
    p.flash = 0;
    p.flinch = 0;
    p.death = null;
    p.walk = 0;
    p.mood = 'neutral';
    p.gesture = null;
    p.run = 0;
    p.crouch = 0;
    p.look = 0;
    p.recoil = Math.max(0, p.recoil - dt * 2.5);
    switch (s.action) {
      case 'reel': // the derp reel the shop plays
        reelPose(a, p);
        break;
      case 'eat':
      case 'yawn':
      case 'shrug': {
        const l = LOOPED[s.action]!;
        const c = a % (GESTURE_SECONDS[l.g] + 0.8);
        if (c < GESTURE_SECONDS[l.g]) {
          p.gesture = l.g;
          p.gestureT = c;
          p.mood = l.mood;
        }
        break;
      }
      case 'run':
        p.walk = 1;
        p.x = 1;
        p.stepT = a * 2.6;
        p.run = 1;
        break;
      case 'crouch': // drop to a knee and aim
        p.crouch = 1;
        p.ready = true;
        p.angle = 0.2 + Math.sin(this.t * 0.8) * 0.3;
        p.draw = Math.min(1, a / 0.9);
        break;
      case 'lookback':
        p.look = Math.sin(a * 0.9) > 0 ? 1 : -1;
        break;
      case 'aim': // sweep the aim up and down at full draw
        p.ready = true;
        p.angle = 0.25 + Math.sin(this.t * 0.8) * 0.45;
        p.draw = Math.min(1, a / 0.7);
        break;
      case 'shoot': {
        // Draw, hold, release; the arrow leaves the bow on the release frame.
        const c = a % 2.4;
        p.ready = true;
        p.angle = 0.3;
        if (c < 1.25) {
          p.draw = Math.min(1, c / 0.9);
          this.fired = false;
        } else if (!this.fired) {
          this.fired = true;
          p.recoil = 1;
          const v = PHYS.maxSpeed * 0.55;
          this.shot = { live: true, t: 0, x: Math.cos(p.angle) * ARM_REACH, y: SHOULDER_Y + Math.sin(p.angle) * ARM_REACH, vx: Math.cos(p.angle) * v, vy: Math.sin(p.angle) * v };
        }
        break;
      }
      case 'walk':
        p.walk = 1;
        p.x = 1; // the rig trails `walk` metres behind its spot
        p.stepT = a * 1.8;
        break;
      case 'hit': {
        const c = a % 1.6;
        p.flash = Math.max(0, 1 - c * 4);
        p.flinch = Math.max(0, 1 - c * 2.5);
        if (c < 0.8) p.mood = 'hurt';
        break;
      }
      case 'win':
        p.gesture = 'cheer';
        p.gestureT = a;
        p.mood = 'laugh';
        break;
      case 'lose':
        p.mood = 'sad';
        break;
      case 'death': {
        // Same knock-back tumble the duel sim runs.
        const d = (this.death ??= { t: 0, x: 0, y: 0, vx: -0.7, vy: 3.4, rot: 0, spin: 4.2, landed: false });
        d.t += dt;
        if (!d.landed) {
          d.vy -= PHYS.gravity * 0.8 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.rot += d.spin * dt;
          if (d.y <= 0 && d.vy < 0) {
            d.y = 0;
            d.landed = true;
            d.rot = Math.PI / 2;
          }
        }
        p.death = d;
        p.mood = 'dead';
        break;
      }
      default:
        break;
    }
    if (s.mood !== 'auto') p.mood = s.mood;
    p.showNocked = !this.shot.live && p.recoil < 0.2;
    this.rig.update(p, this.t, dt);

    const sh = this.shot;
    this.arrow.visible = sh.live;
    if (sh.live) {
      sh.t += dt;
      sh.vy -= PHYS.gravity * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      this.arrow.position.set(sh.x, sh.y, 0.06);
      this.arrow.rotation.z = Math.atan2(sh.vy, sh.vx);
      if (sh.t > 0.9) sh.live = false;
    }

    let target = ANGLES[s.angle];
    while (target - this.yaw > Math.PI) target -= Math.PI * 2;
    while (target - this.yaw < -Math.PI) target += Math.PI * 2;
    this.yaw += (target - this.yaw) * (1 - Math.exp(-dt * 6));
    this.turn.rotation.y = this.yaw;

    // Zoomed in, the camera rises to frame the head.
    const close = 1 - Math.min(1, Math.max(0, (s.zoom - 2.2) / 2.6));
    camera.position.set(0, 1.3 + close * 0.4, s.zoom);
    camera.lookAt(0, 0.95 + close * 0.72, 0);
  }
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { flex: 1 },
});
