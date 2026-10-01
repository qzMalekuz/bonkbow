import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Arena } from '@/game3d/Arena';
import { StickmanRig, makeArrow, type RigPose } from '@/game3d/Stickman3D';
import { themeFor, type Theme } from '@/game3d/themes';
import { PHYS, handPoint, HEAD_Y } from '@/game3d/world';
import {
  DuelSim,
  P_BLOOD,
  P_DUST,
  P_POOL,
  P_SPARK,
  P_STRIDE,
  type Archer,
  type GameEvent,
  type GameMode,
  type Zone,
} from '@/game3d/sim';
import type { Skin } from '@/game/skins';

export type { GameEvent, GameMode, Zone };

export type DuelHandle = {
  // Opponent's shot, in THEIR frame (they shoot to the right too). Mirrored here.
  fireRemote: (shot: { angle: number; power: number }) => void;
  // Opponent's authoritative outcome for the arrow they just fired at me.
  applyRemoteResult: (result: { zone: Zone; hp: number }) => void;
};

type Props = {
  mode: GameMode;
  seed: number;
  role: 'host' | 'guest';
  myTurnFirst: boolean;
  skin: Skin;
  opponentSkin: Skin;
  score: number;
  skill: number; // lifetime hit rate in [0, 1] → adaptive AI
  inputEnabled: boolean;
  overview: boolean; // HUD's hold-to-zoom-out: frame the whole field
  onEvent: (e: GameEvent) => void;
};

// Landscape 3D duel. The sim (sim.ts) runs inside the R3F render loop on the
// JS thread with a fixed physics step; DuelView turns its state into meshes
// and drives the cinematic camera; a touch layer on top feeds the slingshot.
export const Duel3D = forwardRef<DuelHandle, Props>(function Duel3D(props, ref) {
  // One sim + view per mount; game.tsx re-keys this component for a new round.
  const [{ sim, view }] = useState(() => {
    const s = new DuelSim({ mode: props.mode, seed: props.seed, role: props.role, myTurnFirst: props.myTurnFirst });
    return { sim: s, view: new DuelView(s, props.skin, props.opponentSkin) };
  });

  useEffect(() => {
    view.setProps(props);
  });

  useImperativeHandle(
    ref,
    () => ({
      fireRemote: ({ angle, power }) => sim.fireRemote(angle, power),
      applyRemoteResult: (r) => sim.applyRemoteResult(r),
    }),
    [sim],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => sim.aimBegin(e.x, e.y))
        .onUpdate((e) => sim.aimMove(e.x, e.y))
        .onFinalize(() => sim.aimEnd()),
    [sim],
  );

  return (
    <View style={styles.fill}>
      <Canvas style={styles.fill} shadows camera={{ fov: 36, near: 0.1, far: 900, position: [10, 4, 30] }}>
        <DuelScene view={view} />
      </Canvas>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  );
});

function DuelScene({ view }: { view: DuelView }) {
  const { scene, camera } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  useFrame((_, delta) => view.frame(delta, camera));
  return null;
}

const SPAN = { min: -45, max: 120 };
const TRAIL_N = 20;
const DOTS = 9;

class DuelView {
  private sim: DuelSim;
  private props: Props | null = null;
  private theme: Theme;
  private arena: Arena;
  private player: StickmanRig;
  private enemy: StickmanRig;
  private root = new THREE.Group();
  private flying: THREE.Group;
  private trail: THREE.Mesh;
  private parts: THREE.InstancedMesh;
  private aimLine: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  private stuck = new Map<number, THREE.Group>();
  private enemyKey = '';
  private skinKey = '';
  private camPos = new THREE.Vector3(10, 6, 34);
  private look = new THREE.Vector3(10, 3, 0);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private e = new THREE.Euler();

  constructor(sim: DuelSim, skin: Skin, opponentSkin: Skin) {
    this.sim = sim;
    this.theme = themeFor(sim.layout.theme);
    this.arena = new Arena(this.theme, sim.seed, SPAN);
    this.player = new StickmanRig(skin);
    this.enemy = new StickmanRig(opponentSkin);
    this.root.add(this.arena.group, this.player.root, this.enemy.root);

    this.flying = makeArrow(skin.trail);
    this.flying.visible = false;
    this.root.add(this.flying);

    // Glowing ribbon behind the flying arrow.
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    trailGeo.setIndex(idx);
    this.trail = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.trail.frustumCulled = false;
    this.root.add(this.trail);

    // Particles: blood mist, sparks, dust.
    this.parts = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }),
      P_POOL,
    );
    this.parts.frustumCulled = false;
    this.parts.setColorAt(0, new THREE.Color());
    this.root.add(this.parts);

    // Aim guide: an orange line out of the bow plus shrinking trajectory dots.
    this.aimLine = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.035, 0.035).translate(0.5, 0, 0),
      new THREE.MeshBasicMaterial({ color: '#FF7A1A', transparent: true, opacity: 0.9, fog: false }),
    );
    this.aimLine.visible = false;
    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, fog: false }),
      DOTS,
    );
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.root.add(this.aimLine, this.dots);
  }

  setProps(p: Props) {
    this.props = p;
    this.sim.score = p.score;
    this.sim.skill = p.skill;
    this.sim.inputEnabled = p.inputEnabled;
    const key = `${p.skin.id}:${p.opponentSkin.id}`;
    if (key !== this.skinKey) {
      this.skinKey = key;
      this.player.setSkin(p.skin);
      this.enemy.setSkin(p.opponentSkin);
      this.arena.setArcher(0, { x: this.sim.player.x, top: this.sim.player.top, facing: 1, color: p.skin.color });
      this.enemyKey = ''; // re-plant the opponent's pennant in their colour
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

  frame(delta: number, camera: THREE.Camera) {
    const p = this.props;
    if (!p) return;
    const sim = this.sim;
    const events = sim.update(delta);
    for (const e of events) p.onEvent(e);
    const t = sim.real;

    // Enemy pillar moved (AI respawn) or skin changed: rebuild its tower + pennant.
    const key = `${sim.enemy.x.toFixed(2)}:${sim.enemy.top.toFixed(2)}`;
    if (key !== this.enemyKey) {
      this.enemyKey = key;
      this.arena.setArcher(1, { x: sim.enemy.x, top: sim.enemy.top, facing: -1, color: p.opponentSkin.color });
    }

    this.player.update(pose(sim.player, sim.phase === 'player' || sim.aiming), t);
    this.enemy.update(pose(sim.enemy, sim.phase === 'enemyThink' && sim.enemy.draw > 0.02), t + 1.7);

    // Flying arrow + trail
    const a = sim.arrow;
    this.flying.visible = a.active;
    if (a.active) {
      this.flying.position.set(a.x, a.y, 0);
      this.flying.rotation.z = a.angle;
    }
    const trailColor = a.active ? (a.shooter === 'player' ? p.skin.trail : p.opponentSkin.trail) : '#000000';
    this.updateTrail(sim.trail, trailColor);

    this.syncStuck(p);
    this.updateParticles(t);
    this.updateAim();
    this.updateCamera(delta, t, camera, p.overview);

    this.arena.update(t, delta * sim.timeScale, this.look);
  }

  // Stuck arrows: scenery ones live in the world, body ones ride the rig.
  private syncStuck(p: Props) {
    const sim = this.sim;
    const alive = new Set<number>();
    for (const s of sim.stuck) {
      alive.add(s.id);
      if (this.stuck.has(s.id)) continue;
      // Body arrows came from the other archer; scenery ones from whoever just shot.
      const fromPlayer = s.owner === 2 || (s.owner === 0 && sim.arrow.shooter === 'player');
      const mesh = makeArrow(fromPlayer ? p.skin.trail : p.opponentSkin.trail);
      if (s.owner === 0) {
        mesh.position.set(s.x + Math.cos(s.angle) * 0.2, s.y + Math.sin(s.angle) * 0.2, 0);
        mesh.rotation.z = s.angle;
        this.root.add(mesh);
      } else {
        const rig = s.owner === 1 ? this.player : this.enemy;
        const f = s.owner === 1 ? sim.player.facing : sim.enemy.facing;
        mesh.position.set(s.x * f, s.y, 0.05);
        mesh.rotation.z = f === 1 ? s.angle : Math.PI - s.angle;
        rig.stuckMount.add(mesh);
      }
      this.stuck.set(s.id, mesh);
    }
    for (const [id, mesh] of this.stuck) {
      if (alive.has(id)) continue;
      mesh.removeFromParent();
      this.stuck.delete(id);
    }
  }

  private updateParticles(t: number) {
    const pa = this.sim.parts;
    const dust = this.theme.id === 'frost' ? '#FFFFFF' : '#C9B79C';
    for (let i = 0; i < P_POOL; i++) {
      const o = i * P_STRIDE;
      const life = pa[o + 6];
      const kind = pa[o + 7];
      let r = 0;
      if (life > 0) r = kind === P_DUST ? 0.08 + (1 - life) * 0.3 : kind === P_BLOOD ? 0.035 + life * 0.05 : 0.03 + life * 0.03;
      this.v.set(pa[o], pa[o + 1], pa[o + 2]);
      this.e.set(t * 3 + i, t * 2, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(r);
      this.m.compose(this.v, this.q, this.s);
      this.parts.setMatrixAt(i, this.m);
      this.c.set(kind === P_BLOOD ? '#A4101C' : kind === P_SPARK ? '#FFD166' : dust);
      this.parts.setColorAt(i, this.c);
    }
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  private updateAim() {
    const sim = this.sim;
    const on = sim.aiming && sim.aimPower >= PHYS.minPower * 0.5;
    this.aimLine.visible = on;
    this.dots.visible = on;
    if (!on) return;
    const h = handPoint(sim.player.x, sim.player.top, sim.aimAngle);
    this.aimLine.position.set(h.x, h.y, 0.08);
    this.aimLine.rotation.z = sim.aimAngle;
    this.aimLine.scale.set(0.6 + sim.aimPower * 2.4, 1, 1);
    const v = sim.aimPower * PHYS.maxSpeed;
    const vx = Math.cos(sim.aimAngle) * v;
    const vy = Math.sin(sim.aimAngle) * v;
    this.q.identity();
    for (let i = 0; i < DOTS; i++) {
      const tt = 0.06 + i * 0.045;
      this.v.set(h.x + vx * tt, h.y + vy * tt - 0.5 * PHYS.gravity * tt * tt, 0);
      this.s.setScalar(0.07 - i * 0.006);
      this.m.compose(this.v, this.q, this.s);
      this.dots.setMatrixAt(i, this.m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(delta: number, t: number, camera: THREE.Camera, overview: boolean) {
    const sim = this.sim;
    const focus = cameraTarget(sim, overview);
    const k = 1 - Math.exp(-delta * (sim.arrow.active ? 7 : 3.2));
    // Slightly above and to the left of the look point for a 3/4 perspective,
    // with a slow drift so the scene never feels static.
    this.v.set(focus.x - focus.d * 0.12 + Math.sin(t * 0.25) * 0.4, focus.y + focus.d * 0.16, focus.d);
    this.camPos.lerp(this.v, k);
    this.look.x += (focus.x - this.look.x) * k;
    this.look.y += (focus.y - this.look.y) * k;
    const sh = sim.shake;
    camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    camera.lookAt(this.look.x, this.look.y, 0);
  }

  private updateTrail(pts: number[], color: string) {
    const geo = this.trail.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const n = Math.min(TRAIL_N, pts.length / 2);
    const off = pts.length / 2 - n;
    this.c.set(color);
    for (let i = 0; i < TRAIL_N; i++) {
      if (n < 2) {
        pos.setXYZ(i * 2, 0, -100, 0);
        pos.setXYZ(i * 2 + 1, 0, -100, 0);
        continue;
      }
      const j = Math.min(n - 1, i);
      const x = pts[(off + j) * 2];
      const y = pts[(off + j) * 2 + 1];
      const k = Math.max(1, j);
      const px = pts[(off + k - 1) * 2];
      const py = pts[(off + k - 1) * 2 + 1];
      let nx = -(y - py);
      let ny = x - px;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const f = j / (n - 1); // 0 oldest → 1 newest
      const w = 0.01 + f * 0.07;
      pos.setXYZ(i * 2, x + nx * w, y + ny * w, 0);
      pos.setXYZ(i * 2 + 1, x - nx * w, y - ny * w, 0);
      const b = f * f * 1.2;
      col.setXYZ(i * 2, this.c.r * b, this.c.g * b, this.c.b * b);
      col.setXYZ(i * 2 + 1, this.c.r * b, this.c.g * b, this.c.b * b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

function pose(a: Archer, nocked: boolean): RigPose {
  return {
    x: a.x,
    y: a.top,
    facing: a.facing,
    angle: a.angle,
    draw: a.draw,
    flash: a.flash,
    flinch: a.flinch,
    death: a.death,
    drop: a.drop,
    showNocked: nocked,
  };
}

// Where the camera wants to be: look point {x, y} and distance d.
function cameraTarget(sim: DuelSim, overview: boolean) {
  const P = sim.player;
  const E = sim.enemy;
  const mid = { x: (P.x + E.x) / 2, y: (P.top + E.top) / 2 + 1.5, d: (E.x - P.x) * 1.25 + 4 };
  if (overview) return mid;
  const since = sim.real - sim.lastImpact.at;

  // Round intro: look at the opponent, pull out over the whole field, settle on me.
  if (sim.phase === 'intro') {
    const t = sim.time;
    if (t < 0.9) return { x: E.x - 1, y: E.top + HEAD_Y * 0.7, d: 7 };
    if (t < 1.7) return mid;
    return { x: P.x + 3.2, y: P.top + 1.3, d: 9 };
  }
  // Chase the arrow; push in close during bullet time.
  if (sim.arrow.active) {
    const a = sim.arrow;
    const dir = Math.sign(a.vx) || 1;
    const victim = a.shooter === 'player' ? E : P;
    const slow = sim.timeScale < 0.5;
    return {
      x: a.x + dir * (slow ? 0.6 : 2),
      y: a.y * 0.6 + (victim.top + 1.2) * 0.4,
      d: slow ? 4.2 : 10,
    };
  }
  // Linger on the impact.
  if (since < (sim.lastImpact.kill ? 1.6 : 0.9)) {
    return { x: sim.lastImpact.x, y: sim.lastImpact.y + 0.4, d: sim.lastImpact.kill ? 6 : 7.5 };
  }
  if (sim.phase === 'enemyThink' || sim.phase === 'waitRemote') {
    if (E.drop > 0 || E.death) return { x: E.x - 1, y: E.top + 1.4, d: 8.5 };
    return { x: E.x - 3.2, y: E.top + 1.3, d: 9 };
  }
  if (sim.phase === 'over') {
    const dead = P.death ? P : E;
    const d = dead.death;
    return { x: d ? d.x : dead.x, y: (d ? d.y : dead.top) + 0.8, d: 7 };
  }
  // My turn: frame me with room ahead; pull back a little as I draw.
  const pow = sim.aiming ? sim.aimPower : 0;
  return { x: P.x + 3.4 + pow * 1.6, y: P.top + 1.3 + pow * 0.4, d: 9 + pow * 2.5 };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
