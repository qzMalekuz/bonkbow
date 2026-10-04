import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';
import { StickmanRig, type RigPose } from '@/game3d/Stickman3D';
import { SIDE, reelPose } from '@/game3d/heroReel';
import { Turntable, useSpinGesture } from '@/game3d/Turntable';
import type { Look } from '@/game/cosmetics';

// Shop preview of a hero on a lit plinth, playing the character-sheet reel
// (heroReel.ts): the expressions, aiming, shooting, walk, run, crouch aim
// and look back, turning to show each; drag sideways to spin the hero.
// `onStep` hears each step's label.
export function SkinStage({ look, style, onStep }: { look: Look; style?: ViewStyle; onStep?: (label: string) => void }) {
  const focused = useIsFocused();
  const [view] = useState(() => new StageView(look));
  useEffect(() => view.setLook(look), [view, look]);
  useEffect(() => view.onStep(onStep), [view, onStep]);
  const spinPan = useSpinGesture(view.spinner);
  return (
    <View style={[styles.wrap, style]}>
      <Canvas gl={{ antialias: false }} style={styles.fill} frameloop={focused ? 'always' : 'never'} camera={{ fov: 30, position: [0, 1.45, 5.7] }}>
        <Stage view={view} />
      </Canvas>
      <GestureDetector gesture={spinPan}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  );
}

function Stage({ view }: { view: StageView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene, camera), [view, scene, camera]);
  useFrame((_, dt) => view.frame(dt));
  return null;
}

class StageView {
  private root = new THREE.Group();
  private spin = new THREE.Group();
  readonly spinner = new Turntable();
  private rig: StickmanRig;
  private ringMat = new THREE.MeshBasicMaterial();
  private rim = new THREE.DirectionalLight('#FFFFFF', 2.2);
  private t = 0;
  private yaw = SIDE.front;
  private yawVel = 0;
  private label = '';
  private stepFn: ((label: string) => void) | undefined;
  private pose: RigPose = {
    x: 0,
    y: 0,
    facing: 1,
    angle: 0.12,
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

  constructor(look: Look) {
    this.rig = new StickmanRig(look);
    this.spin.add(this.rig.root);
    this.root.add(this.spin);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.0, 0.25, 32),
      new THREE.MeshStandardMaterial({ color: '#23263A', roughness: 0.4, metalness: 0.3 }),
    );
    plinth.position.y = -0.125;
    plinth.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 8, 48), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.root.add(plinth, ring);

    const key = new THREE.DirectionalLight('#FFF1E2', 2.6);
    key.position.set(2.5, 4, 3);
    const fill = new THREE.DirectionalLight('#FFF6EE', 0.9);
    fill.position.set(-2.5, 1.5, 3);
    this.rim.position.set(-3, 2.5, -3);
    const hemi = new THREE.HemisphereLight('#DCE6FF', '#3A3040', 1.1);
    this.root.add(key, fill, this.rim, hemi);
    this.setLook(look);
  }

  setLook(look: Look) {
    this.rig.setLook(look);
    this.ringMat.color.set(look.banner);
    // A hint of the hero's colour in the rim; mostly white so hair stays its own colour.
    this.rim.color.set('#FFFFFF').lerp(new THREE.Color(look.banner), 0.3);
  }

  attach(scene: THREE.Scene, camera: THREE.Camera) {
    scene.background = new THREE.Color('#1A2344');
    scene.add(this.root);
    camera.lookAt(0, 1.1, 0);
    return () => {
      scene.remove(this.root);
    };
  }

  onStep(fn: ((label: string) => void) | undefined) {
    this.stepFn = fn;
    this.label = '';
  }

  frame(dt: number) {
    const h = Math.min(dt, 0.05);
    this.t += h;
    const step = reelPose(this.t, this.pose);
    if (step.label !== this.label) {
      this.label = step.label;
      this.stepFn?.(step.label);
    }
    // The turn follows each step's angle on a critically damped spring.
    const w = 3.2;
    // Turn the short way round (left side and front are a quarter turn apart).
    let target = step.yaw;
    while (target - this.yaw > Math.PI) target -= Math.PI * 2;
    while (target - this.yaw < -Math.PI) target += Math.PI * 2;
    this.yawVel += (w * w * (target - this.yaw) - 2 * w * this.yawVel) * h;
    this.yaw += this.yawVel * h;
    this.spinner.frame(h);
    this.spin.rotation.y = this.yaw + this.spinner.yaw;
    this.rig.update(this.pose, this.t, h);
  }
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { flex: 1 },
});
