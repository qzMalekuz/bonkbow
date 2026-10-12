import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { fitFov } from '@/game3d/fitFov';
import { Arena } from '@/game3d/Arena';
import { SHOVEL_LEN, StickmanRig, makeProjectile, type RigPose } from '@/game3d/Stickman3D';
import { arenaTheme, type Theme } from '@/game3d/themes';
import { HEAD_Y, PHYS, handPoint } from '@/game3d/world';
import {
  DuelSim,
  P_BLOOD,
  P_DUST,
  P_POOL,
  P_SHIELD,
  P_SPARK,
  P_STRIDE,
  type Archer,
  type GameEvent,
  type GameMode,
  type Gesture as Act,
  type Mood,
  type Who,
  type Zone,
} from '@/game3d/sim';
import type { Look } from '@/game/cosmetics';

export type { GameEvent, GameMode, Mood, Who, Zone };

export type DuelHandle = {
  // Opponent's shot, in THEIR frame (they shoot to the right too). Mirrored here.
  fireRemote: (shot: { angle: number; power: number }) => void;
  // Opponent's authoritative outcome for the arrow they just fired at me.
  applyRemoteResult: (result: { zone: Zone; hp: number; shield: number }) => void;
  // Act out an emote.
  gesture: (who: Who, g: Act, mood: Mood) => void;
};

// Where each archer's head is on screen, refreshed every frame, so the HUD
// can pin speech bubbles, damage numbers and the death marker to them.
export type Anchors = {
  px: number;
  py: number;
  pOn: boolean;
  ex: number;
  ey: number;
  eOn: boolean;
  pDead: boolean;
  eDead: boolean;
};

export const emptyAnchors: Anchors = { px: 0, py: 0, pOn: false, ex: 0, ey: 0, eOn: false, pDead: false, eDead: false };

type Props = {
  mode: GameMode;
  seed: number;
  role: 'host' | 'guest';
  myTurnFirst: boolean;
  look: Look;
  opponentLook: Look;
  score: number;
  skill: number; // lifetime hit rate in [0, 1] → adaptive AI
  inputEnabled: boolean;
  overview: boolean; // HUD's hold-to-zoom-out: frame the whole field
  anchors: SharedValue<Anchors>;
  onEvent: (e: GameEvent) => void;
  onTheme?: (t: Theme) => void;
  // First frames rendered: the pre-match loading screen can lift.
  onReady?: () => void;
};

// Landscape 3D duel. The sim (sim.ts) runs inside the R3F render loop on the
// JS thread with a fixed physics step; DuelView turns its state into meshes
// and drives the cinematic camera; a touch layer on top feeds the slingshot
// and draws the tension cone.
export const Duel3D = forwardRef<DuelHandle, Props>(function Duel3D(props, ref) {
  // One sim + view per mount; game.tsx re-keys this component for a new round.
  const [{ sim, view }] = useState(() => {
    const s = new DuelSim({ mode: props.mode, seed: props.seed, role: props.role, myTurnFirst: props.myTurnFirst });
    return { sim: s, view: new DuelView(s, props.look, props.opponentLook) };
  });

  useEffect(() => {
    view.setProps(props);
  });
  const { onTheme } = props;
  useEffect(() => {
    onTheme?.(view.theme);
  }, [view, onTheme]);

  useImperativeHandle(
    ref,
    () => ({
      fireRemote: ({ angle, power }) => sim.fireRemote(angle, power),
      applyRemoteResult: (r) => sim.applyRemoteResult(r),
      gesture: (who, g, mood) => sim.gesture(who, g, mood),
    }),
    [sim],
  );

  // Drag indicator (screen space): touch-down point, finger, tension 0..1.
  const drag = useSharedValue({ x0: 0, y0: 0, x: 0, y: 0, on: false, power: 0 });
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => {
          sim.aimBegin(e.x, e.y);
          drag.set({ x0: e.x, y0: e.y, x: e.x, y: e.y, on: sim.aiming, power: 0 });
        })
        .onUpdate((e) => {
          sim.aimMove(e.x, e.y);
          drag.set({ x0: drag.get().x0, y0: drag.get().y0, x: e.x, y: e.y, on: sim.aiming, power: sim.aimPower });
        })
        .onFinalize(() => {
          sim.aimEnd();
          drag.set({ ...drag.get(), on: false, power: 0 });
        }),
    [sim, drag],
  );

  return (
    <View style={styles.fill}>
      <Canvas
        gl={{ antialias: false }}
        style={styles.fill}
        camera={{ fov: DUEL_FOV, near: 0.1, far: 900, position: [8, 4, 24] }}
      >
        <DuelScene view={view} />
      </Canvas>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <TensionCone drag={drag} />
        </View>
      </GestureDetector>
    </View>
  );
});

const DUEL_FOV = 34;

function DuelScene({ view }: { view: DuelView }) {
  const { scene, camera, size } = useThree();
  useEffect(() => view.attach(scene), [view, scene]);
  // Priority 1: we render ourselves so the draw itself can be timed.
  useFrame((state, delta) => {
    fitFov(camera, DUEL_FOV);
    view.frame(Math.min(delta, 1 / 20), camera, size.width, size.height);
    const t0 = PERF_LOG ? Date.now() : 0;
    state.gl.render(scene, camera);
    if (PERF_LOG) view.recordRender(Date.now() - t0, delta, state.gl.info.render.calls, state.gl.info.render.triangles);
  }, 1);
  return null;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The pull-back cone from the touch point to the finger: yellow when slack,
// orange, then red at full tension — the reference game's draw indicator.
function TensionCone({ drag }: { drag: SharedValue<{ x0: number; y0: number; x: number; y: number; on: boolean; power: number }> }) {
  const coneProps = useAnimatedProps(() => {
    const d = drag.value;
    const dx = d.x - d.x0;
    const dy = d.y - d.y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = 3;
    const w1 = 6 + d.power * 16;
    const path = `M ${d.x0 + nx * w0} ${d.y0 + ny * w0} L ${d.x + nx * w1} ${d.y + ny * w1} L ${d.x - nx * w1} ${d.y - ny * w1} L ${d.x0 - nx * w0} ${d.y0 - ny * w0} Z`;
    return { d: path, fill: tensionColor(d.power), fillOpacity: d.on && len > 6 ? 0.75 : 0 };
  });
  const ringProps = useAnimatedProps(() => {
    const d = drag.value;
    return { cx: d.x0, cy: d.y0, stroke: tensionColor(d.power), strokeOpacity: d.on ? 1 : 0, r: 14 + d.power * 6 };
  });
  const dotProps = useAnimatedProps(() => {
    const d = drag.value;
    return { cx: d.x0, cy: d.y0, fill: tensionColor(d.power), fillOpacity: d.on ? 1 : 0 };
  });
  const style = useAnimatedStyle(() => ({ opacity: drag.value.on ? 1 : 0 }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg style={StyleSheet.absoluteFill}>
        <AnimatedPath animatedProps={coneProps} />
        <AnimatedCircle animatedProps={ringProps} fill="none" strokeWidth={4} />
        <AnimatedCircle animatedProps={dotProps} r={6} />
      </Svg>
    </Animated.View>
  );
}

// Yellow → orange → red as the draw tightens.
function tensionColor(p: number) {
  'worklet';
  const k = Math.max(0, Math.min(1, p));
  const r = 255;
  const g = Math.round(k < 0.5 ? 214 - (214 - 140) * (k / 0.5) : 140 - (140 - 40) * ((k - 0.5) / 0.5));
  const b = Math.round(k < 0.5 ? 64 - 64 * (k / 0.5) : 0 + 30 * ((k - 0.5) / 0.5));
  return `rgb(${r},${g},${b})`;
}

// Frame-timing log (logcat "[perf]"). On for the current perf pass; set to
// __DEV__ (or false) once the release build's numbers are confirmed.
const PERF_LOG = true;

const SPAN = { min: -45, max: 120 };
const TRAIL_N = 20;
const DOTS = 14;

class DuelView {
  readonly theme: Theme;
  private sim: DuelSim;
  private props: Props | null = null;
  private arena: Arena;
  private player: StickmanRig;
  private enemy: StickmanRig;
  private root = new THREE.Group();
  private flying: THREE.Group;
  private flyingKey = '';
  private trail: THREE.Mesh;
  private parts: THREE.InstancedMesh;
  private aimLine: THREE.Mesh;
  private aimMat: THREE.MeshBasicMaterial;
  private dots: THREE.InstancedMesh;
  private rims: THREE.InstancedMesh;
  private ghost: THREE.InstancedMesh;
  private stuck = new Map<number, THREE.Group>();
  private alive = new Set<number>();
  private enemyKey = '';
  private lookKey = '';
  private camPos = new THREE.Vector3(8, 6, 26);
  private look = new THREE.Vector3(8, 3, 0);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private e = new THREE.Euler();
  private proj = new THREE.Vector3();
  private frames = 0;
  private partsLive = false;
  private trailLive = false;
  private partColors: THREE.Color[];
  // Dev-only frame timing, logged every few seconds.
  private perf = { frames: 0, time: 0, work: 0, render: 0, calls: 0, tris: 0, slow: 0 };
  private pLife = new Uint8Array(P_POOL); // 1 once a particle has been drawn live (so we zero it once)
  private shakeT = 0;
  private anchorLast = emptyAnchors;
  private colBlood = new THREE.Color('#A4101C');
  private colSpark = new THREE.Color('#FFD166');
  private colShield = new THREE.Color('#7FD8FF');
  private colDust: THREE.Color;

  constructor(sim: DuelSim, look: Look, opponentLook: Look) {
    this.sim = sim;
    this.theme = arenaTheme(sim.seed, sim.layout.theme);
    this.colDust = new THREE.Color(this.theme.id === 'frost' ? '#FFFFFF' : '#C9B79C');
    this.arena = new Arena(this.theme, sim.seed, SPAN);
    this.player = new StickmanRig(look);
    this.enemy = new StickmanRig(opponentLook);
    this.root.add(this.arena.group, this.player.root, this.enemy.root);

    this.flying = makeProjectile(look);
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

    // Particles: paper bits (the sim calls them blood; nobody bleeds in Bonk
    // Bow), sparks, dust, shield shards.
    this.parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), P_POOL);
    this.parts.frustumCulled = false;
    this.parts.setColorAt(0, new THREE.Color());
    this.root.add(this.parts);
    const dust = this.theme.id === 'frost' ? '#FFFFFF' : '#C9B79C';
    this.partColors = [new THREE.Color('#F4F1E8'), new THREE.Color('#FFD166'), new THREE.Color(dust), new THREE.Color('#7FD8FF')];

    // Aim guide: a tension-coloured line out of the bow, the live trajectory
    // as a dotted ink arc (black dots on a white rim, like the videos, so it
    // reads on any sky), and my previous shot (green ghost).
    this.aimMat = new THREE.MeshBasicMaterial({ color: '#FFD640', transparent: true, opacity: 0.95, fog: false });
    this.aimLine = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 0.04).translate(0.5, 0, 0), this.aimMat);
    this.aimLine.visible = false;
    const dotGeo = new THREE.SphereGeometry(1, 8, 6);
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#0C0C0C', fog: false }), DOTS);
    this.rims = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#FFFFFF', fog: false }), DOTS);
    this.ghost = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.28, 6, 12),
      new THREE.MeshBasicMaterial({ color: '#8BE04E', transparent: true, opacity: 0.85, fog: false }),
      DOTS,
    );
    for (const d of [this.dots, this.rims, this.ghost]) {
      d.frustumCulled = false;
      d.visible = false;
    }
    this.rims.position.z = -0.05;
    this.root.add(this.aimLine, this.rims, this.dots, this.ghost);
  }

  setProps(p: Props) {
    this.props = p;
    this.sim.score = p.score;
    this.sim.skill = p.skill;
    this.sim.inputEnabled = p.inputEnabled;
    const key = `${p.look.key}:${p.opponentLook.key}`;
    if (key !== this.lookKey) {
      this.lookKey = key;
      this.sim.setHabits(p.look.habit, p.opponentLook.habit);
      this.player.setLook(p.look);
      this.enemy.setLook(p.opponentLook);
      this.arena.setArcher(0, { x: this.sim.player.x, top: this.sim.player.top, facing: 1, color: p.look.banner });
      this.enemyKey = ''; // re-plant the opponent's banner in their colour
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

  frame(delta: number, camera: THREE.Camera, w: number, h: number) {
    const p = this.props;
    if (!p) return;
    const t0 = PERF_LOG ? Date.now() : 0;
    const sim = this.sim;
    const events = sim.update(delta);
    for (const e of events) p.onEvent(e);
    const t = sim.real;

    // Enemy ledge moved (AI respawn) or look changed: rebuild ledge + banner.
    const key = `${sim.enemy.x.toFixed(2)}:${sim.enemy.top.toFixed(2)}`;
    if (key !== this.enemyKey) {
      this.enemyKey = key;
      this.arena.setArcher(1, { x: sim.enemy.x, top: sim.enemy.top, facing: -1, color: p.opponentLook.banner });
    }

    const myTurn = sim.phase === 'player';
    this.player.update(pose(sim.player, myTurn || sim.aiming, myTurn || sim.aiming), t, delta);
    const theirTurn = sim.phase === 'enemyThink' || sim.phase === 'waitRemote';
    this.enemy.update(pose(sim.enemy, theirTurn, sim.enemy.draw > 0.02), t + 1.7, delta);

    // Flying arrow (or shovel) + trail, in the shooter's look
    const a = sim.arrow;
    this.flying.visible = a.active;
    if (a.active) {
      const shot = a.shooter === 'player' ? p.look : p.opponentLook;
      const fk = `${shot.bow}|${shot.arrow}`;
      if (fk !== this.flyingKey) {
        this.flyingKey = fk;
        this.root.remove(this.flying);
        this.flying = makeProjectile(shot);
        this.root.add(this.flying);
      }
      this.flying.position.set(a.x, a.y, 0);
      this.flying.rotation.z = a.angle;
    }
    this.updateTrail(sim.trail, a.active ? (a.shooter === 'player' ? p.look.trail : p.opponentLook.trail) : '#000000');

    this.syncStuck(p);
    this.updateParticles(t);
    this.updateAim();
    this.updateCamera(delta, t, camera, p.overview);
    this.updateAnchors(camera, w, h, p.anchors);

    this.arena.update(t, delta * sim.timeScale, this.look);
    this.frames += 1;
    if (this.frames === 4) p.onReady?.();
    if (PERF_LOG) {
      const pf = this.perf;
      pf.frames += 1;
      pf.time += delta;
      pf.work += Date.now() - t0;
      if (pf.time >= 3) {
        console.log(
          `[perf] ${(pf.frames / pf.time).toFixed(1)} fps · sim ${(pf.work / pf.frames).toFixed(1)} ms · render ${(pf.render / pf.frames).toFixed(1)} ms · ${pf.calls} draws · ${Math.round(pf.tris / 1000)}k tris · ${pf.slow} slow frames`,
        );
        Object.assign(pf, { frames: 0, time: 0, work: 0, render: 0, slow: 0 });
      }
    }
  }

  recordRender(ms: number, delta: number, calls: number, tris: number) {
    const pf = this.perf;
    pf.render += ms;
    pf.calls = calls;
    pf.tris = tris;
    if (delta > 0.021) pf.slow += 1;
  }

  // Head positions in screen px for the HUD overlays.
  private updateAnchors(camera: THREE.Camera, w: number, h: number, anchors: SharedValue<Anchors>) {
    const sim = this.sim;
    const at = (a: Archer) => {
      const d = a.death;
      const x = d ? d.x : a.x - a.facing * a.walk;
      const y = d ? d.y + 0.5 : a.top + HEAD_Y + 0.45;
      this.proj.set(x, y, 0).project(camera);
      return { x: (this.proj.x * 0.5 + 0.5) * w, y: (-this.proj.y * 0.5 + 0.5) * h, on: this.proj.z < 1 && Math.abs(this.proj.x) < 1.1 && Math.abs(this.proj.y) < 1.1 };
    };
    const pp = at(sim.player);
    const ep = at(sim.enemy);
    const pDead = !!sim.player.death;
    const eDead = !!sim.enemy.death;
    const l = this.anchorLast;
    if (
      Math.abs(pp.x - l.px) < 0.4 && Math.abs(pp.y - l.py) < 0.4 && Math.abs(ep.x - l.ex) < 0.4 && Math.abs(ep.y - l.ey) < 0.4 &&
      pp.on === l.pOn && ep.on === l.eOn && pDead === l.pDead && eDead === l.eDead
    ) return;
    this.anchorLast = { px: pp.x, py: pp.y, pOn: pp.on, ex: ep.x, ey: ep.y, eOn: ep.on, pDead, eDead };
    anchors.set(this.anchorLast);
  }

  // Stuck arrows: scenery ones live in the world, body ones ride the rig.
  private syncStuck(p: Props) {
    const sim = this.sim;
    this.alive.clear();
    for (const s of sim.stuck) {
      this.alive.add(s.id);
      if (this.stuck.has(s.id)) continue;
      const shot = s.shooter === 'player' ? p.look : p.opponentLook;
      const mesh = makeProjectile(shot);
      if (s.owner === 0) {
        // A shovel digs in deeper than an arrow.
        const dig = shot.bow === 'shovel' ? 0.05 - SHOVEL_LEN * 0.08 : 0.2;
        mesh.position.set(s.x + Math.cos(s.angle) * dig, s.y + Math.sin(s.angle) * dig, 0);
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
      if (this.alive.has(id)) continue;
      mesh.removeFromParent();
      this.stuck.delete(id);
    }
  }

  private updateParticles(t: number) {
    const pa = this.sim.parts;
    let live = false;
    for (let i = 0; i < P_POOL; i++) if (pa[i * P_STRIDE + 6] > 0) live = true;
    // Nothing alive now and nothing left visible from last frame: skip.
    if (!live && !this.partsLive) return;
    this.partsLive = live;
    for (let i = 0; i < P_POOL; i++) {
      const o = i * P_STRIDE;
      const life = pa[o + 6];
      const kind = pa[o + 7];
      let r = 0;
      if (life > 0) {
        if (kind === P_DUST) r = 0.08 + (1 - life) * 0.3;
        else if (kind === P_BLOOD) r = 0.03 + life * 0.05;
        else if (kind === P_SHIELD) r = 0.03 + life * 0.04;
        else r = 0.03 + life * 0.03;
      }
      this.v.set(pa[o], pa[o + 1], pa[o + 2]);
      this.e.set(t * 3 + i, t * 2, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(r);
      this.m.compose(this.v, this.q, this.s);
      this.parts.setMatrixAt(i, this.m);
      if (life > 0) this.parts.setColorAt(i, this.partColors[kind === P_BLOOD ? 0 : kind === P_SPARK ? 1 : kind === P_DUST ? 2 : 3]);
    }
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  private updateAim() {
    const sim = this.sim;
    const on = sim.aiming && sim.aimPower >= PHYS.minPower * 0.5;
    this.aimLine.visible = on;
    this.dots.visible = on;
    this.rims.visible = on;
    this.ghost.visible = on && !!sim.prevShot;
    if (!on) return;
    const h = handPoint(sim.player.x, sim.player.top, sim.aimAngle);
    this.aimLine.position.set(h.x, h.y, 0.08);
    this.aimLine.rotation.z = sim.aimAngle;
    this.aimLine.scale.set(0.6 + sim.aimPower * 2.4, 1 + sim.aimPower, 1 + sim.aimPower);
    setTension(this.aimMat.color, sim.aimPower);
    this.placeDots(this.dots, h, sim.aimAngle, sim.aimPower, 0.06);
    this.placeDots(this.rims, h, sim.aimAngle, sim.aimPower, 0.085);
    if (sim.prevShot) this.placeDots(this.ghost, handPoint(sim.player.x, sim.player.top, sim.prevShot.angle), sim.prevShot.angle, sim.prevShot.power, 0.055);
  }

  private placeDots(mesh: THREE.InstancedMesh, from: { x: number; y: number }, angle: number, power: number, size: number) {
    const v = power * PHYS.maxSpeed;
    const vx = Math.cos(angle) * v;
    const vy = Math.sin(angle) * v;
    this.q.identity();
    for (let i = 0; i < DOTS; i++) {
      const tt = 0.06 + i * 0.045;
      this.v.set(from.x + vx * tt, from.y + vy * tt - 0.5 * PHYS.gravity * tt * tt, 0);
      this.s.setScalar(size * (1 - i * 0.05));
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(delta: number, t: number, camera: THREE.Camera, overview: boolean) {
    const sim = this.sim;
    const focus = cameraTarget(sim, overview);
    const k = 1 - Math.exp(-delta * (sim.arrow.active ? 7 : overview ? 5 : 3.2));
    // Slightly above and to the left of the look point for a 3/4 perspective,
    // with a slow drift so the scene never feels static.
    this.v.set(focus.x - focus.d * 0.1 + Math.sin(t * 0.25) * 0.3, focus.y + focus.d * 0.12, focus.d);
    this.camPos.lerp(this.v, k);
    this.look.x += (focus.x - this.look.x) * k;
    this.look.y += (focus.y - this.look.y) * k;
    const sh = sim.shake;
    this.shakeT += delta * 38;
    camera.position.set(this.camPos.x + Math.sin(this.shakeT * 1.7) * 0.5 * sh, this.camPos.y + Math.sin(this.shakeT * 2.3 + 1.3) * 0.5 * sh, this.camPos.z);
    camera.lookAt(this.look.x, this.look.y, 0);
  }

  private updateTrail(pts: number[], color: string) {
    // Only rewrite the ribbon while there is one (plus one frame to clear it).
    if (pts.length < 4 && !this.trailLive) return;
    this.trailLive = pts.length >= 4;
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
      const w = 0.004 + f * 0.035; // thin streak, widest at the arrow
      pos.setXYZ(i * 2, x + nx * w, y + ny * w, 0);
      pos.setXYZ(i * 2 + 1, x - nx * w, y - ny * w, 0);
      const b = f * f * 0.85;
      col.setXYZ(i * 2, this.c.r * b, this.c.g * b, this.c.b * b);
      col.setXYZ(i * 2 + 1, this.c.r * b, this.c.g * b, this.c.b * b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

// Same yellow → orange → red ramp as the on-screen cone, without parsing.
function setTension(c: THREE.Color, p: number) {
  const k = Math.max(0, Math.min(1, p));
  const g = k < 0.5 ? 214 - 74 * (k / 0.5) : 140 - 100 * ((k - 0.5) / 0.5);
  const b = k < 0.5 ? 64 - 64 * (k / 0.5) : 30 * ((k - 0.5) / 0.5);
  c.setRGB(1, g / 255, b / 255, THREE.SRGBColorSpace);
}

function pose(a: Archer, ready: boolean, nocked: boolean): RigPose {
  return {
    x: a.x,
    y: a.top,
    facing: a.facing,
    angle: a.angle,
    draw: a.draw,
    ready,
    flash: a.flash,
    flinch: a.flinch,
    shieldFlash: a.shieldFlash,
    death: a.death,
    walk: a.walk,
    stepT: a.stepT,
    mood: a.mood,
    gesture: a.gesture,
    gestureT: a.gestureT,
    recoil: a.recoil,
    showNocked: nocked,
    turn: a.turn,
  };
}

// Where the camera wants to be: look point {x, y} and distance d.
function cameraTarget(sim: DuelSim, overview: boolean) {
  const P = sim.player;
  const E = sim.enemy;
  const mid = { x: (P.x + E.x) / 2, y: (P.top + E.top) / 2 + 1.5, d: (E.x - P.x) * 1.25 + 4 };
  if (overview) return mid;
  const since = sim.real - sim.lastImpact.at;

  // Round intro: watch the rival walk in, sweep over the field, settle on me.
  if (sim.phase === 'intro') {
    const t = sim.time;
    if (t < 1.0) return { x: E.x - 0.8, y: E.top + HEAD_Y * 0.7, d: 6.5 };
    if (t < 1.8) return mid;
    return { x: P.x + 2.6, y: P.top + 1.25, d: 7.2 };
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
      d: slow ? 4 : 9,
    };
  }
  // Linger on the impact.
  if (since < (sim.lastImpact.kill ? 1.7 : 1.0)) {
    return { x: sim.lastImpact.x, y: sim.lastImpact.y + 0.3, d: sim.lastImpact.kill ? 5.5 : 6.5 };
  }
  if (sim.phase === 'enemyThink' || sim.phase === 'waitRemote') {
    if (E.walk > 0 || E.death) return { x: E.x - 0.8, y: E.top + 1.3, d: 7 };
    return { x: E.x - 2.6, y: E.top + 1.25, d: 7.2 };
  }
  if (sim.phase === 'over') {
    const w = sim.winner === 'player' ? P : E;
    return { x: w.x - w.facing * 0.2, y: w.top + 1.2, d: 5.5 };
  }
  // My turn: frame me with room ahead; pull back a little as I draw.
  const pow = sim.aiming ? sim.aimPower : 0;
  return { x: P.x + 2.6 + pow * 1.8, y: P.top + 1.25 + pow * 0.5, d: 7.2 + pow * 3 };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
