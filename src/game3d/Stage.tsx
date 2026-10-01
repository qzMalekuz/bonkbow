import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Arena } from '@/game3d/Arena';
import { StickmanRig, type RigPose } from '@/game3d/Stickman3D';
import { themeById, type Theme } from '@/game3d/themes';
import { GESTURE_SECONDS, type Gesture, type Mood } from '@/game3d/sim';
import type { Look } from '@/game/cosmetics';

// A small 3D set for non-gameplay screens (VS, loading art, win/lose, style
// cards, menus): an arena backdrop plus a few stickmen performing scripted
// loops. One GL context per screen; rendering pauses when the screen is
// covered.

export type Performance =
  | 'idle' // relaxed breathing, glances around
  | 'ready' // bow raised, slow draw-and-relax
  | 'cheer' // winner: jumping, arms pumping, laughing
  | 'laugh'
  | 'sad' // loser: head hung
  | 'stomp' // annoyed loser
  | 'walkIn'
  | 'dropIn'
  | 'faceoff' // tense half-draw aimed at the other actor
  | 'wave'
  | 'bow'
  | 'flex'
  | 'think'
  | 'salute'
  | 'dance'
  | 'yawn' // sleepy, stretching
  | 'shrug'
  | 'facepalm'
  | 'thumbs'
  | 'cry'
  | 'scared' // wide-eyed shiver
  | 'smug' // smirk with a slow draw
  | 'wink'
  | 'mixed'; // cycles through a shuffled run of emotions and actions

export type Actor = {
  look: Look;
  x: number;
  y?: number;
  facing: 1 | -1;
  performance: Performance;
  hidden?: boolean;
};

export type StageCamera = { x: number; y: number; z: number; lookX: number; lookY: number; fov?: number; drift?: number };

type Props = {
  theme: string;
  actors: Actor[];
  camera: StageCamera;
  style?: ViewStyle;
  ledges?: boolean; // stand the actors on cliff ledges (else flat ground)
  ledgeTop?: number;
  // Fired once the first frame has rendered (loading screens wait for it).
  onReady?: () => void;
};

export function Stage({ theme, actors, camera, style, ledges = false, ledgeTop = 0, onReady }: Props) {
  const focused = useIsFocused();
  const [view] = useState(() => new StageView(themeById(theme), ledges, ledgeTop));
  useEffect(() => view.setActors(actors), [view, actors]);
  useEffect(() => view.setCamera(camera), [view, camera]);
  useEffect(() => view.setOnReady(onReady), [view, onReady]);
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Canvas
        gl={{ antialias: false }}
        style={styles.fill}
        frameloop={focused ? 'always' : 'never'}
        camera={{ fov: camera.fov ?? 34, near: 0.1, far: 900, position: [camera.x, camera.y, camera.z] }}
      >
        <StageScene view={view} />
      </Canvas>
    </View>
  );
}

function StageScene({ view }: { view: StageView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  useFrame((_, dt) => view.frame(Math.min(dt, 1 / 20), camera));
  return null;
}

type Slot = { rig: StickmanRig; actor: Actor; t: number; walk: number; drop: number; lookKey: string };

class StageView {
  private theme: Theme;
  private arena: Arena;
  private root = new THREE.Group();
  private slots: Slot[] = [];
  private cam: StageCamera = { x: 0, y: 2, z: 8, lookX: 0, lookY: 1.2 };
  private t = 0;
  private ledges: boolean;
  private ledgeTop: number;
  private onReady?: () => void;
  private readyFired = false;
  private frames = 0;
  private arenaKey = '';
  private focus = new THREE.Vector3();

  constructor(theme: Theme, ledges: boolean, ledgeTop: number) {
    this.theme = theme;
    this.ledges = ledges;
    this.ledgeTop = ledgeTop;
    this.arena = new Arena(theme, 4242, { min: -30, max: 30 });
    this.root.add(this.arena.group);
  }

  setOnReady(fn?: () => void) {
    this.onReady = fn;
  }

  setCamera(c: StageCamera) {
    this.cam = c;
  }

  setActors(actors: Actor[]) {
    actors.forEach((a, i) => {
      let slot = this.slots[i];
      if (!slot) {
        const rig = new StickmanRig(a.look);
        this.root.add(rig.root);
        slot = { rig, actor: a, t: 0, walk: 0, drop: 0, lookKey: a.look.key };
        this.slots[i] = slot;
        if (a.performance === 'walkIn') slot.walk = 3;
        if (a.performance === 'dropIn') slot.drop = 6;
      }
      // A performance switch restarts its loop (and its entrance).
      if (slot.actor.performance !== a.performance) {
        slot.t = 0;
        if (a.performance === 'walkIn') slot.walk = 3;
        if (a.performance === 'dropIn') slot.drop = 6;
      }
      if (slot.lookKey !== a.look.key) {
        slot.rig.setLook(a.look);
        slot.lookKey = a.look.key;
      }
      slot.actor = a;
      slot.rig.root.visible = !a.hidden;
    });
    // Banners only on the first two actors (the duellists).
    const key = actors
      .slice(0, 2)
      .map((a) => `${a.x}:${a.facing}:${a.look.banner}:${a.hidden ? 1 : 0}`)
      .join('|');
    if (key !== this.arenaKey && this.ledges) {
      this.arenaKey = key;
      actors.slice(0, 2).forEach((a, i) => {
        if (!a.hidden) this.arena.setArcher(i as 0 | 1, { x: a.x, top: this.ledgeTop, facing: a.facing, color: a.look.banner });
      });
    }
  }

  attach(scene: THREE.Scene) {
    scene.fog = new THREE.Fog(this.theme.fog, this.theme.fogNear, this.theme.fogFar);
    scene.background = new THREE.Color(this.theme.skyHorizon);
    scene.add(this.root);
    return () => {
      scene.remove(this.root);
    };
  }

  frame(dt: number, camera: THREE.Camera) {
    this.t += dt;
    const t = this.t;
    for (const s of this.slots) {
      if (!s) continue;
      s.t += dt;
      if (s.walk > 0) s.walk = Math.max(0, s.walk - dt * 2.2);
      if (s.drop > 0) s.drop = Math.max(0, s.drop - dt * (5 + (6 - s.drop) * 3));
      s.rig.update(perform(s, t), t + s.actor.x, dt);
    }
    const c = this.cam;
    const drift = c.drift ?? 0.25;
    camera.position.set(c.x + Math.sin(t * 0.2) * drift, c.y + Math.sin(t * 0.27) * drift * 0.4, c.z);
    camera.lookAt(c.lookX, c.lookY, 0);
    this.focus.set(c.lookX, c.lookY, 0);
    this.arena.update(t, dt, this.focus);
    this.frames += 1;
    if (!this.readyFired && this.frames > 2 && this.onReady) {
      this.readyFired = true;
      this.onReady();
    }
  }
}

// Gesture + face for the simple one-action performances.
const ACTS: Partial<Record<Performance, [Gesture | null, Mood]>> = {
  wave: ['wave', 'happy'],
  bow: ['bow', 'happy'],
  flex: ['flex', 'smug'],
  think: ['think', 'neutral'],
  salute: ['salute', 'neutral'],
  dance: ['dance', 'happy'],
  yawn: ['yawn', 'sleepy'],
  shrug: ['shrug', 'shock'],
  facepalm: ['facepalm', 'sad'],
  thumbs: ['thumbs', 'wink'],
  cry: ['cry', 'sad'],
  scared: [null, 'scared'],
  smug: [null, 'smug'],
  wink: [null, 'wink'],
};

// The 'mixed' reel: each beat is an action and the face that goes with it.
const REEL: [Gesture | null, Mood][] = [
  ['wave', 'happy'],
  [null, 'smug'],
  ['flex', 'smug'],
  ['think', 'neutral'],
  ['laugh', 'laugh'],
  [null, 'wink'],
  ['shrug', 'shock'],
  ['dance', 'happy'],
  [null, 'angry'],
  ['salute', 'neutral'],
  ['bow', 'happy'],
  ['facepalm', 'sad'],
  ['yawn', 'sleepy'],
  ['cheer', 'laugh'],
  [null, 'scared'],
  ['thumbs', 'wink'],
];
const BEAT = 2.6;

// Deterministic per-actor shuffle so two actors on one stage never sync up.
function reelAt(seed: number, beat: number) {
  const n = REEL.length;
  const off = Math.abs(Math.floor(seed * 7.13)) % n;
  const step = [1, 3, 5, 7, 9, 11, 13][Math.abs(Math.floor(seed * 3.7)) % 7]; // coprime with 16
  return REEL[(off + beat * step) % n];
}

// Scripted pose for a performance at its local time.
function perform(s: Slot, t: number): RigPose {
  const a = s.actor;
  const lt = s.t;
  let mood: Mood = 'neutral';
  let gesture: Gesture | null = null;
  let gestureT = 0;
  let ready = false;
  let draw = 0;
  let angle = a.facing === 1 ? 0.15 : Math.PI - 0.15;
  const loop = (g: Gesture) => {
    gesture = g;
    gestureT = lt % GESTURE_SECONDS[g];
  };
  switch (a.performance) {
    case 'ready':
      ready = true;
      draw = Math.max(0, Math.sin(lt * 1.2)) * 0.8;
      angle = a.facing === 1 ? 0.12 + Math.sin(lt * 0.5) * 0.08 : Math.PI - 0.12 - Math.sin(lt * 0.5) * 0.08;
      mood = draw > 0.5 ? 'angry' : 'neutral';
      break;
    case 'faceoff':
      ready = true;
      draw = 0.55 + Math.sin(lt * 1.6) * 0.15;
      angle = a.facing === 1 ? 0.05 : Math.PI - 0.05;
      mood = 'angry';
      break;
    case 'cheer':
      mood = 'laugh';
      loop('cheer');
      break;
    case 'laugh':
      mood = 'laugh';
      loop('laugh');
      break;
    case 'sad':
      mood = 'sad';
      break;
    case 'stomp':
      mood = 'angry';
      if (lt % 4 < GESTURE_SECONDS.stomp) {
        gesture = 'stomp';
        gestureT = lt % 4;
      } else mood = 'sad';
      break;
    case 'mixed': {
      const beat = Math.floor(lt / BEAT);
      const [g, m] = reelAt(a.x + a.facing, beat);
      const bt = lt - beat * BEAT;
      mood = m;
      if (g) {
        gesture = g;
        gestureT = bt;
        if (bt > GESTURE_SECONDS[g]) gesture = null; // hold the face a moment after the move
      } else if (m === 'angry') {
        ready = true;
        draw = 0.4 + Math.sin(bt * 4) * 0.1;
      }
      break;
    }
    default: {
      const act = ACTS[a.performance];
      if (act) {
        mood = act[1];
        if (act[0]) loop(act[0]);
      }
      break;
    }
  }
  return {
    x: a.x,
    y: (a.y ?? 0) + s.drop,
    facing: a.facing,
    angle,
    draw,
    ready,
    flash: 0,
    flinch: s.drop === 0 && a.performance === 'dropIn' && lt < 0.6 ? Math.max(0, 0.6 - lt) : 0,
    shieldFlash: 0,
    death: null,
    walk: s.walk,
    stepT: s.walk > 0 ? t * 2.6 : 0,
    mood,
    gesture,
    gestureT,
    recoil: 0,
    showNocked: ready,
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
