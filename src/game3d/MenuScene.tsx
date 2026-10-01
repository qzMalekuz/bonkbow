import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Arena } from '@/game3d/Arena';
import { StickmanRig, makeArrow } from '@/game3d/Stickman3D';
import { THEMES, type Theme } from '@/game3d/themes';
import { PHYS, handPoint, solveLaunchAngle } from '@/game3d/world';
import type { Look } from '@/game/cosmetics';

// Living 3D backdrop for menus: your equipped archer on a rock tower, loosing
// arrows at a straw target across the field while the camera drifts. The
// arena rotates daily. Rendering pauses while another screen covers it.
export function MenuScene({ look, focusRight = false }: { look: Look; focusRight?: boolean }) {
  const focused = useIsFocused();
  const [view] = useState(() => new MenuView(look, focusRight));
  useEffect(() => view.setLook(look), [view, look]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas
        gl={{ antialias: false }}
        style={styles.fill}
        frameloop={focused ? 'always' : 'never'}
        camera={{ fov: 34, near: 0.1, far: 900, position: [4, 3, 11] }}
      >
        <Scene view={view} />
      </Canvas>
    </View>
  );
}

function Scene({ view }: { view: MenuView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  useFrame((_, dt) => view.frame(Math.min(dt, 1 / 20), camera));
  return null;
}

const TOWER = 2.2;
const TARGET_X = 15;
const TARGET_Y = 1.4;
const SHOT = 0.62; // fraction of max speed
// Arena of the day (the darkest arenas are skipped for the title screen).
const BRIGHT = THEMES.filter((t) => t.id !== 'ember' && t.id !== 'storm');
const DAY = Math.floor(Date.now() / 86_400_000);

class MenuView {
  private theme: Theme = BRIGHT[DAY % BRIGHT.length];
  private arena = new Arena(this.theme, 20261008, { min: -30, max: 50 });
  private rig: StickmanRig;
  private root = new THREE.Group();
  private arrow: THREE.Group;
  private stuck: THREE.Group[] = [];
  private look: Look;
  private focusRight: boolean;
  private t = 0;
  private cycle = 0;
  private angle = 0.3;
  private shot = { flying: false, x: 0, y: 0, vx: 0, vy: 0 };
  private focus = new THREE.Vector3();

  constructor(look: Look, focusRight: boolean) {
    this.look = look;
    this.focusRight = focusRight;
    this.rig = new StickmanRig(look);
    this.arena.setArcher(0, { x: 0, top: TOWER, facing: 1, color: look.banner });
    this.root.add(this.arena.group, this.rig.root, makeTarget());
    this.arrow = makeArrow(look.trail);
    this.arrow.visible = false;
    this.root.add(this.arrow);
  }

  setLook(look: Look) {
    if (look.key === this.look.key) return;
    this.look = look;
    this.rig.setLook(look);
    this.arena.setArcher(0, { x: 0, top: TOWER, facing: 1, color: look.banner });
    this.root.remove(this.arrow);
    this.arrow = makeArrow(look.trail);
    this.arrow.visible = false;
    this.root.add(this.arrow);
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
    this.cycle += dt;
    // 4.2 s loop: idle → aim & draw → release → watch it land
    const from = handPoint(0, TOWER, this.angle);
    const want = solveLaunchAngle(TARGET_X - 0.2 - from.x, TARGET_Y + 0.1 - from.y, PHYS.maxSpeed * SHOT) ?? 0.4;
    let draw = 0;
    if (this.cycle > 1.2 && this.cycle < 2.2) {
      this.angle += (want - this.angle) * Math.min(1, dt * 5);
      draw = Math.min(1, (this.cycle - 1.2) / 0.8) * SHOT;
    } else if (this.cycle <= 1.2) {
      this.angle += (0.3 - this.angle) * Math.min(1, dt * 2);
    }
    const s = this.shot;
    if (this.cycle >= 2.2 && this.cycle < 2.3 && !s.flying) {
      const v = PHYS.maxSpeed * SHOT;
      const h = handPoint(0, TOWER, this.angle);
      Object.assign(s, { flying: true, x: h.x, y: h.y, vx: Math.cos(this.angle) * v, vy: Math.sin(this.angle) * v });
    }
    if (s.flying) this.fly(dt);
    if (this.cycle > 4.2) this.cycle = 0;

    this.rig.update(
      {
        x: 0,
        y: TOWER,
        facing: 1,
        angle: this.angle,
        draw,
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
        recoil: Math.max(0, 1 - (this.cycle - 2.2) * 2.2) * (this.cycle > 2.2 ? 1 : 0),
        showNocked: this.cycle > 0.6 && this.cycle < 2.2,
      },
      this.t,
    );

    // Slow cinematic drift. focusRight puts the archer in the right third so
    // the menu can sit on the left.
    const orbit = Math.sin(this.t * 0.12);
    const lx = this.focusRight ? -2.4 : 2.2;
    this.focus.set(lx + orbit * 0.6, TOWER + 1.2, 0);
    camera.position.set(lx - 1.6 + orbit * 2.2, TOWER + 1.9 + Math.sin(this.t * 0.2) * 0.3, 8.2 + Math.cos(this.t * 0.12) * 0.8);
    camera.lookAt(this.focus);
    this.arena.update(this.t, dt, this.focus);
  }

  private fly(dt: number) {
    const s = this.shot;
    s.vy -= PHYS.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const a = Math.atan2(s.vy, s.vx);
    this.arrow.visible = true;
    this.arrow.position.set(s.x, s.y, 0);
    this.arrow.rotation.z = a;
    if (s.x < TARGET_X - 0.15 && s.y > 0) return;
    s.flying = false;
    this.arrow.visible = false;
    const stuck = makeArrow(this.look.trail);
    stuck.position.set(Math.min(s.x, TARGET_X - 0.05), Math.max(0.05, s.y), (Math.random() - 0.5) * 0.3);
    stuck.rotation.z = a;
    this.root.add(stuck);
    this.stuck.push(stuck);
    if (this.stuck.length > 6) this.stuck.shift()?.removeFromParent();
  }
}

// Straw archery target on a wooden stand, facing the archer.
function makeTarget() {
  const target = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.25, 20),
    new THREE.MeshStandardMaterial({ color: '#D9B866', roughness: 1 }),
  );
  face.rotation.z = Math.PI / 2;
  target.add(face);
  ['#E63946', '#F1FAEE', '#E63946', '#FFD166'].forEach((c, i) => {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.62 - i * 0.15, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    r.rotation.y = -Math.PI / 2;
    r.position.x = -0.13 - i * 0.002;
    target.add(r);
  });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), new THREE.MeshStandardMaterial({ color: '#5A3E2B' }));
    leg.position.set(0.25, -0.75, s * 0.4);
    leg.rotation.x = s * 0.2;
    target.add(leg);
  }
  target.position.set(TARGET_X, TARGET_Y, 0);
  target.traverse((o) => {
    o.castShadow = true;
  });
  return target;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
