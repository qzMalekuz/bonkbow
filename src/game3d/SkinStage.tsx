import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { StickmanRig } from '@/game3d/Stickman3D';
import type { Look } from '@/game/cosmetics';

// Turntable preview of a look for the shop: the black stickman on a lit
// plinth, slowly turning, drawing and relaxing the bow.
export function SkinStage({ look, style }: { look: Look; style?: ViewStyle }) {
  const focused = useIsFocused();
  const [view] = useState(() => new StageView(look));
  useEffect(() => view.setLook(look), [view, look]);
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Canvas gl={{ antialias: false }} style={styles.fill} frameloop={focused ? 'always' : 'never'} camera={{ fov: 30, position: [0, 1.4, 5.2] }}>
        <Stage view={view} />
      </Canvas>
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
  private rig: StickmanRig;
  private ringMat = new THREE.MeshBasicMaterial();
  private rim = new THREE.DirectionalLight('#FFFFFF', 2.2);
  private t = 0;

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

    const key = new THREE.DirectionalLight('#FFF4E0', 2.6);
    key.position.set(2.5, 4, 3);
    this.rim.position.set(-3, 2.5, -3);
    const hemi = new THREE.HemisphereLight('#BFD4FF', '#2A2030', 1.0);
    this.root.add(key, this.rim, hemi);
    this.setLook(look);
  }

  setLook(look: Look) {
    this.rig.setLook(look);
    this.ringMat.color.set(look.banner);
    this.rim.color.set(look.banner);
  }

  attach(scene: THREE.Scene, camera: THREE.Camera) {
    scene.background = new THREE.Color('#1A2344');
    scene.add(this.root);
    camera.lookAt(0, 0.95, 0);
    return () => {
      scene.remove(this.root);
    };
  }

  frame(dt: number) {
    this.t += dt;
    const t = this.t;
    this.spin.rotation.y = Math.sin(t * 0.5) * 0.9 - 0.2;
    const cycle = (Math.sin(t * 1.4) + 1) / 2;
    this.rig.update(
      {
        x: 0,
        y: 0,
        facing: 1,
        angle: 0.15 + Math.sin(t * 0.7) * 0.1,
        draw: cycle > 0.4 ? (cycle - 0.4) * 1.5 : 0,
        ready: true,
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
      },
      t,
    );
  }
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { flex: 1 },
});
