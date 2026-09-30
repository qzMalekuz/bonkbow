import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  runOnUI,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurMask, Canvas, Group, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { ARROW, COLORS, EFFECTS, ENEMY, HP, PHYSICS, SCENERY, STICKMAN } from '@/game/constants';
import {
  addArrow,
  bowPath,
  bowStringPath,
  followFall,
  handPoint,
  hatPath,
  headCenter,
  hitTest,
  nockPoint,
  stickmanPath,
  type Pose,
} from '@/game/stickman';
import { enemyNoise, jitter, solveLaunchAngle } from '@/game/aim';
import { layoutFor } from '@/game/rng';
import { Scenery } from '@/game/scenery';
import type { Skin } from '@/game/skins';

export type Zone = 'head' | 'body' | 'miss';
export type Surface = 'ground' | 'pillar' | 'none';

export type GameEvent =
  | { type: 'aimStart' }
  | { type: 'drawTick' }
  | { type: 'release' }
  // My arrow left the bow — online mode broadcasts this so the opponent animates it.
  | { type: 'shotFired'; angle: number; power: number }
  // My arrow landed — authoritative outcome for the opponent's HP.
  | { type: 'shotResolved'; zone: Zone; hp: number }
  // My arrow missed; `long` = it flew past the target (vs. fell short).
  | { type: 'playerMiss'; long: boolean }
  | { type: 'enemyHit'; hp: number; zone: 'head' | 'body' }
  | { type: 'enemyRespawn' }
  | { type: 'enemyMiss' }
  | { type: 'playerHit'; hp: number; zone: 'head' | 'body' }
  // Presentation-only events (sound cues).
  | { type: 'enemyDraw' }
  | { type: 'enemyFired' }
  | { type: 'impact'; surface: Surface };

export type GameMode = 'ai' | 'online';

export type GameCanvasHandle = {
  // Opponent's shot, in THEIR frame (they shoot to the right too). Mirrored here.
  fireRemote: (shot: { angle: number; power: number }) => void;
  // Opponent's authoritative outcome for the arrow they just fired at me.
  applyRemoteResult: (result: { zone: Zone; hp: number }) => void;
};

type Props = {
  mode: GameMode;
  seed: number;
  role: 'host' | 'guest'; // which pillar height is mine (ai → 'host')
  myTurnFirst: boolean;
  skin: Skin;
  opponentSkin: Skin;
  score: number;
  // Player's lifetime hit rate in [0, 1] — drives the adaptive AI (aim.ts).
  skill: number;
  // Online: false until the opponent's channel is live, so a shot can't be
  // broadcast into the void (broadcasts are fire-and-forget).
  inputEnabled: boolean;
  onEvent: (e: GameEvent) => void;
};

type Shooter = 'player' | 'enemy';
type Phase = 'player' | 'flight' | 'enemyThink' | 'waitRemote' | 'over';
// Arrow left in the world. owner: 0 = ground/pillar, 1 = player body, 2 = enemy body.
type Stuck = { x: number; y: number; a: number; o: 0 | 1 | 2 };

const STEP = 1 / 120; // fixed physics step → identical results on both phones
const PART_STRIDE = 6; // x, y, vx, vy, life (1 → 0), kind
const KIND_BLOOD = 0;
const KIND_SPARK = 1;
const KIND_DUST = 2;
const PILLAR_HALF = 24;

// The whole simulation lives in Reanimated shared values and runs on the UI
// thread (useFrameCallback), so a busy JS thread never stutters the arrow.
// Only discrete events cross to JS (runOnJS → onEvent) for sound, haptics,
// HUD and the multiplayer channel. Effects (particles, shake, flashes, trail)
// are purely visual and never feed back into the simulation.
export const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(props, ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };
  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 && <Scene ref={ref} w={size.w} h={size.h} {...props} />}
    </View>
  );
});

const Scene = forwardRef<GameCanvasHandle, Props & { w: number; h: number }>(function Scene(
  { w, h, mode, seed, role, myTurnFirst, skin, opponentSkin, score, skill, inputEnabled, onEvent },
  ref,
) {
  const groundY = h * 0.8;
  const online = mode === 'online';

  // ---- layout (deterministic from seed) -------------------------------------
  const roundIndex = useSharedValue(0);
  const first = layoutFor(seed, 0);
  const playerX = w * 0.16;
  const playerPillarTop = useSharedValue(groundY - (role === 'host' ? first.hostPillar : first.guestPillar));
  const enemyX = useSharedValue(Math.min(w * 0.92, playerX + first.gapFrac * w));
  const enemyPillarTop = useSharedValue(groundY - (role === 'host' ? first.guestPillar : first.hostPillar));

  // ---- world state (UI thread) ------------------------------------------------
  const playerArm = useSharedValue(-0.6);
  const playerFall = useSharedValue(0);
  const playerHp = useSharedValue(HP.max);
  const enemyArm = useSharedValue(Math.PI + 0.6);
  const enemyFall = useSharedValue(0);
  const enemyHp = useSharedValue(HP.max);
  const enemyDraw = useSharedValue(0);
  const enemyPlanned = useSharedValue(Math.PI + 0.6);

  const phase = useSharedValue<Phase>(myTurnFirst ? 'player' : 'waitRemote');

  // Aim (while dragging)
  const aiming = useSharedValue(false);
  const aimAngle = useSharedValue(-0.6);
  const aimPower = useSharedValue(0);
  const lastTick = useSharedValue(0);

  // In-flight arrow + fixed-step accumulator
  const arrowActive = useSharedValue(false);
  const arrowShooter = useSharedValue<Shooter>('player');
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);
  const avx = useSharedValue(0);
  const avy = useSharedValue(0);
  const aAngle = useSharedValue(0);
  const acc = useSharedValue(0);

  // Online: the opponent's authoritative result may arrive before or after the
  // local animation of their arrow finishes — reconcile whichever comes last.
  const pendingRemote = useSharedValue<{ zone: Zone; hp: number } | null>(null);
  const awaitingRemote = useSharedValue(false);

  const stuck = useSharedValue<Stuck[]>([]);

  // ---- effects (visual only) ----------------------------------------------------
  const clock = useSharedValue(0);
  const shake = useSharedValue(0);
  const playerFlash = useSharedValue(0);
  const enemyFlash = useSharedValue(0);
  const parts = useSharedValue<number[]>(new Array(EFFECTS.particles * PART_STRIDE).fill(0));
  const partsAlive = useSharedValue(false);
  const trail = useSharedValue<number[]>([]);

  const scoreSv = useSharedValue(score);
  const skillSv = useSharedValue(skill);
  const inputSv = useSharedValue(inputEnabled);
  useEffect(() => {
    scoreSv.value = score;
    skillSv.value = skill;
    inputSv.value = inputEnabled;
  }, [score, skill, inputEnabled, scoreSv, skillSv, inputSv]);

  // ---- poses ------------------------------------------------------------------
  const playerPose = useDerivedValue<Pose>(() => ({
    x: playerX,
    y: playerPillarTop.value,
    facing: 1,
    armAngle: aiming.value ? aimAngle.value : playerArm.value,
    fall: playerFall.value,
    hat: skin.hat,
    draw: aiming.value ? aimPower.value : 0,
    breathe: aiming.value ? 0 : Math.sin(clock.value * 2.1) * EFFECTS.breatheAmp,
  }));
  const enemyPose = useDerivedValue<Pose>(() => ({
    x: enemyX.value,
    y: enemyPillarTop.value,
    facing: -1,
    armAngle: enemyArm.value,
    fall: enemyFall.value,
    hat: opponentSkin.hat,
    draw: enemyDraw.value,
    breathe: enemyDraw.value > 0 ? 0 : Math.sin(clock.value * 2.1 + 1.7) * EFFECTS.breatheAmp,
  }));

  const playerPath = useDerivedValue(() => stickmanPath(playerPose.value));
  const enemyPath = useDerivedValue(() => stickmanPath(enemyPose.value));
  const playerHat = useDerivedValue(() => hatPath(playerPose.value));
  const enemyHat = useDerivedValue(() => hatPath(enemyPose.value));
  const playerBow = useDerivedValue(() => bowPath(playerPose.value));
  const enemyBow = useDerivedValue(() => bowPath(enemyPose.value));
  const playerString = useDerivedValue(() => bowStringPath(playerPose.value));
  const enemyString = useDerivedValue(() => bowStringPath(enemyPose.value));

  // Soft contact shadows on the pillar tops (hidden once the figure falls).
  const shadows = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const add = (pose: Pose) => {
      if (pose.fall > 0.3) return;
      p.addOval(Skia.XYWHRect(pose.x - 15, pose.y - 3, 30, 6));
    };
    add(playerPose.value);
    add(enemyPose.value);
    return p;
  });

  // Aim preview: first ~0.5s of the trajectory as shrinking dots.
  const aimDots = useDerivedValue(() => {
    const p = Skia.Path.Make();
    if (!aiming.value || aimPower.value < PHYSICS.minPower) return p;
    const start = handPoint(playerPose.value);
    const v = aimPower.value * PHYSICS.maxSpeed;
    const vx = Math.cos(aimAngle.value) * v;
    let vy = Math.sin(aimAngle.value) * v;
    let x = start.x;
    let y = start.y;
    const dt = 0.045;
    for (let i = 0; i < 12; i++) {
      vy += PHYSICS.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      p.addCircle(x, y, 3.2 - i * 0.2);
    }
    return p;
  });

  // Every visible arrow: nocked ones, the one in flight, and the stuck ones.
  const arrows = useDerivedValue(() => {
    const shaft = Skia.Path.Make();
    const head = Skia.Path.Make();
    const fletch = Skia.Path.Make();
    const nocked = (pose: Pose, angle: number) => {
      const n = nockPoint(pose);
      addArrow(shaft, head, fletch, n.x + Math.cos(angle) * ARROW.length, n.y + Math.sin(angle) * ARROW.length, angle);
    };
    if (aiming.value && aimPower.value > 0.02) nocked(playerPose.value, aimAngle.value);
    if (enemyDraw.value > 0.02) nocked(enemyPose.value, enemyArm.value);
    if (arrowActive.value) addArrow(shaft, head, fletch, ax.value, ay.value, aAngle.value);
    const list = stuck.value;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.o === 0) {
        addArrow(shaft, head, fletch, s.x, s.y, s.a);
      } else {
        const pose = s.o === 1 ? playerPose.value : enemyPose.value;
        const q = followFall(pose, s.x, s.y);
        addArrow(shaft, head, fletch, q.x, q.y, s.a + pose.fall * (Math.PI / 2) * -pose.facing);
      }
    }
    return { shaft, head, fletch };
  });
  const arrowShaft = useDerivedValue(() => arrows.value.shaft);
  const arrowHead = useDerivedValue(() => arrows.value.head);
  const arrowFletch = useDerivedValue(() => arrows.value.fletch);

  // Motion trail behind the flying arrow: dots that grow toward the arrow.
  const trailPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const t = trail.value;
    const n = t.length / 2;
    for (let i = 0; i < n; i++) {
      p.addCircle(t[i * 2], t[i * 2 + 1], 0.6 + (i / n) * 2);
    }
    return p;
  });

  // Particles split by kind so each draws in one call with its own color.
  const particlePaths = useDerivedValue(() => {
    const blood = Skia.Path.Make();
    const spark = Skia.Path.Make();
    const dust = Skia.Path.Make();
    const a = parts.value;
    for (let i = 0; i < a.length; i += PART_STRIDE) {
      const life = a[i + 4];
      if (life <= 0) continue;
      const kind = a[i + 5];
      const r = kind === KIND_DUST ? 1.5 + (1 - life) * 4 : 1 + life * 2.4;
      (kind === KIND_BLOOD ? blood : kind === KIND_SPARK ? spark : dust).addCircle(a[i], a[i + 1], r);
    }
    return { blood, spark, dust };
  });
  const bloodPath = useDerivedValue(() => particlePaths.value.blood);
  const sparkPath = useDerivedValue(() => particlePaths.value.spark);
  const dustPath = useDerivedValue(() => particlePaths.value.dust);

  // Stone pillars: body, mortar lines, and a lighter cap slab.
  const pillarGeo = (x: number, top: number) => {
    'worklet';
    const body = Skia.Path.Make();
    const lines = Skia.Path.Make();
    const cap = Skia.Path.Make();
    body.addRRect(Skia.RRectXY(Skia.XYWHRect(x - PILLAR_HALF, top, PILLAR_HALF * 2, groundY - top + 4), 3, 3));
    cap.addRRect(Skia.RRectXY(Skia.XYWHRect(x - PILLAR_HALF - 3, top - 2, PILLAR_HALF * 2 + 6, 7), 2, 2));
    let row = 0;
    for (let y = top + 18; y < groundY; y += 14) {
      lines.moveTo(x - PILLAR_HALF, y);
      lines.lineTo(x + PILLAR_HALF, y);
      const jx = x + (row % 2 === 0 ? -6 : 8);
      lines.moveTo(jx, y);
      lines.lineTo(jx, Math.min(y + 14, groundY));
      row += 1;
    }
    return { body, lines, cap };
  };
  const playerPillarGeo = useDerivedValue(() => pillarGeo(playerX, playerPillarTop.value));
  const enemyPillarGeo = useDerivedValue(() => pillarGeo(enemyX.value, enemyPillarTop.value));
  const playerPillarBody = useDerivedValue(() => playerPillarGeo.value.body);
  const playerPillarLines = useDerivedValue(() => playerPillarGeo.value.lines);
  const playerPillarCap = useDerivedValue(() => playerPillarGeo.value.cap);
  const enemyPillarBody = useDerivedValue(() => enemyPillarGeo.value.body);
  const enemyPillarLines = useDerivedValue(() => enemyPillarGeo.value.lines);
  const enemyPillarCap = useDerivedValue(() => enemyPillarGeo.value.cap);
  const enemyGradStart = useDerivedValue(() => vec(enemyX.value - PILLAR_HALF, 0));
  const enemyGradEnd = useDerivedValue(() => vec(enemyX.value + PILLAR_HALF, 0));

  const shakeTransform = useDerivedValue(() => {
    const s = shake.value;
    const t = clock.value;
    return [{ translateX: Math.sin(t * 83) * s }, { translateY: Math.cos(t * 97) * s * 0.7 }];
  });

  // ---- effects helpers (UI thread) ------------------------------------------------
  const burst = (x: number, y: number, count: number, kind: number, dir: number, speed: number, spread: number) => {
    'worklet';
    const a = parts.value.slice();
    let spawned = 0;
    for (let i = 0; i < a.length && spawned < count; i += PART_STRIDE) {
      if (a[i + 4] > 0) continue;
      const ang = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.65);
      a[i] = x;
      a[i + 1] = y;
      a[i + 2] = Math.cos(ang) * v;
      a[i + 3] = Math.sin(ang) * v;
      a[i + 4] = 1;
      a[i + 5] = kind;
      spawned += 1;
    }
    parts.value = a;
    partsAlive.value = true;
  };

  const addStuck = (s: Stuck) => {
    'worklet';
    const next = stuck.value.concat([s]);
    stuck.value = next.length > ARROW.maxStuck ? next.slice(next.length - ARROW.maxStuck) : next;
  };

  // ---- events → JS --------------------------------------------------------------
  const emit = (e: GameEvent) => onEvent(e);

  // ---- firing -------------------------------------------------------------------
  const fire = (shooter: Shooter, angle: number, power: number) => {
    'worklet';
    const from = shooter === 'player' ? handPoint(playerPose.value) : handPoint(enemyPose.value);
    const v = power * PHYSICS.maxSpeed;
    ax.value = from.x;
    ay.value = from.y;
    avx.value = Math.cos(angle) * v;
    avy.value = Math.sin(angle) * v;
    aAngle.value = angle;
    acc.value = 0;
    arrowShooter.value = shooter;
    arrowActive.value = true;
    trail.value = [];
    phase.value = 'flight';
    if (shooter === 'enemy') {
      enemyDraw.value = 0;
      runOnJS(emit)({ type: 'enemyFired' });
    }
  };

  // AI mode: next opponent from the seed sequence.
  const spawnEnemy = () => {
    'worklet';
    roundIndex.value += 1;
    const l = layoutFor(seed, roundIndex.value);
    enemyX.value = Math.min(w * 0.92, playerX + l.gapFrac * w);
    enemyPillarTop.value = groundY - l.guestPillar;
    enemyFall.value = 0;
    enemyHp.value = HP.max;
    enemyArm.value = Math.PI + 0.6;
    enemyDraw.value = 0;
    // Arrows in the old enemy's body leave with it.
    stuck.value = stuck.value.filter((s) => s.o !== 2);
    phase.value = 'player';
    runOnJS(emit)({ type: 'enemyRespawn' });
  };

  // AI turn, part 1: pick the shot and visibly raise + draw the bow.
  const enemyAim = () => {
    'worklet';
    if (phase.value !== 'enemyThink') return;
    const from = handPoint({ ...enemyPose.value, armAngle: Math.PI + 0.6 });
    const target = headCenter(playerPose.value);
    const v = PHYSICS.maxSpeed * ENEMY.speedFraction;
    let angle = solveLaunchAngle(target.x - from.x, target.y - from.y, v);
    if (angle === null) angle = Math.PI + Math.PI / 4;
    angle += jitter(enemyNoise(scoreSv.value, skillSv.value));
    enemyPlanned.value = angle;
    const ms = ENEMY.thinkMs * 0.8;
    enemyArm.value = withTiming(angle, { duration: ms, easing: Easing.out(Easing.cubic) });
    enemyDraw.value = withTiming(ENEMY.speedFraction, { duration: ms, easing: Easing.inOut(Easing.quad) });
    runOnJS(emit)({ type: 'enemyDraw' });
  };

  // AI turn, part 2: release.
  const enemyShoot = () => {
    'worklet';
    if (phase.value !== 'enemyThink') return;
    enemyArm.value = enemyPlanned.value;
    fire('enemy', enemyPlanned.value, ENEMY.speedFraction);
  };

  // setTimeout lives on JS; hop back to the UI thread to mutate state.
  const scheduleEnemyShot = () => {
    setTimeout(() => runOnUI(enemyAim)(), 180);
    setTimeout(() => runOnUI(enemyShoot)(), 180 + ENEMY.thinkMs);
  };
  const scheduleRespawn = () => {
    setTimeout(() => runOnUI(spawnEnemy)(), ENEMY.respawnMs);
  };

  // ---- remote (online) ------------------------------------------------------------
  const applyRemote = (r: { zone: Zone; hp: number }) => {
    'worklet';
    pendingRemote.value = null;
    awaitingRemote.value = false;
    if (r.zone === 'miss') {
      runOnJS(emit)({ type: 'enemyMiss' });
      phase.value = 'player';
      return;
    }
    playerHp.value = r.hp;
    runOnJS(emit)({ type: 'playerHit', hp: r.hp, zone: r.zone });
    if (r.hp <= 0) {
      playerFall.value = withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) });
      phase.value = 'over';
    } else {
      phase.value = 'player';
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      fireRemote: ({ angle, power }) => {
        runOnUI(() => {
          'worklet';
          if (phase.value === 'over') return;
          // They aimed to the right in their frame; mirror horizontally for ours.
          const mirrored = Math.PI - angle;
          enemyArm.value = mirrored;
          awaitingRemote.value = true;
          fire('enemy', mirrored, power);
        })();
      },
      applyRemoteResult: (result) => {
        runOnUI(() => {
          'worklet';
          if (phase.value === 'over') return;
          // If their arrow is still flying on our screen, hold the result until
          // it lands so the HP drop lines up with the visual.
          if (arrowActive.value && arrowShooter.value === 'enemy') {
            pendingRemote.value = result;
            return;
          }
          applyRemote(result);
        })();
      },
    }),
    // Shared values and worklets are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---- resolution -----------------------------------------------------------------
  const resolve = (result: Zone, tipX: number, tipY: number, surface: Surface) => {
    'worklet';
    arrowActive.value = false;
    trail.value = [];
    const shooter = arrowShooter.value;
    const ang = aAngle.value;

    // Visuals first: stick the arrow, spray particles, shake, flash.
    if (result !== 'miss') {
      const owner = shooter === 'player' ? 2 : 1;
      addStuck({ x: tipX + Math.cos(ang) * 6, y: tipY + Math.sin(ang) * 6, a: ang, o: owner });
      const back = ang + Math.PI;
      burst(tipX, tipY, result === 'head' ? EFFECTS.headSparks : EFFECTS.hitSparks, KIND_BLOOD, ang, 260, 1.4);
      if (result === 'head') burst(tipX, tipY, 8, KIND_SPARK, back, 320, 2.4);
      if (owner === 2) enemyFlash.value = 1;
      else playerFlash.value = 1;
    } else if (surface !== 'none') {
      const y = surface === 'ground' ? Math.min(tipY, groundY + 4) : tipY;
      addStuck({ x: tipX, y, a: ang, o: 0 });
      burst(tipX, y, EFFECTS.dustPuff, KIND_DUST, -Math.PI / 2, 110, 2.2);
      runOnJS(emit)({ type: 'impact', surface });
    }

    const dmg = result === 'head' ? HP.headshot : HP.body;

    if (shooter === 'player') {
      if (result !== 'miss') enemyHp.value = Math.max(0, enemyHp.value - dmg);
      runOnJS(emit)({ type: 'shotResolved', zone: result, hp: enemyHp.value });

      if (result === 'miss') {
        runOnJS(emit)({ type: 'playerMiss', long: tipX > enemyX.value });
        phase.value = online ? 'waitRemote' : 'enemyThink';
        if (!online) runOnJS(scheduleEnemyShot)();
        return;
      }
      shake.value = enemyHp.value <= 0 ? EFFECTS.shakeKill : EFFECTS.shakeHit;
      runOnJS(emit)({ type: 'enemyHit', hp: enemyHp.value, zone: result });
      if (enemyHp.value <= 0) {
        enemyFall.value = withTiming(1, { duration: 550, easing: Easing.in(Easing.quad) });
        if (online) {
          phase.value = 'over';
        } else {
          phase.value = 'enemyThink'; // lock input during the fall
          runOnJS(scheduleRespawn)();
        }
      } else {
        phase.value = online ? 'waitRemote' : 'enemyThink';
        if (!online) runOnJS(scheduleEnemyShot)();
      }
      return;
    }

    // Opponent's arrow landed on our screen.
    if (result !== 'miss') shake.value = EFFECTS.shakeHit;
    if (online) {
      // Our sim is only visual here; the shooter's result is authoritative.
      if (pendingRemote.value) applyRemote(pendingRemote.value);
      // else: still awaitingRemote — applyRemoteResult will finish it.
      return;
    }
    if (result === 'miss') {
      runOnJS(emit)({ type: 'enemyMiss' });
      phase.value = 'player';
      return;
    }
    playerHp.value = Math.max(0, playerHp.value - dmg);
    if (playerHp.value <= 0) shake.value = EFFECTS.shakeKill;
    runOnJS(emit)({ type: 'playerHit', hp: playerHp.value, zone: result });
    if (playerHp.value <= 0) {
      playerFall.value = withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) });
      phase.value = 'over';
    } else {
      phase.value = 'player';
    }
  };

  // ---- frame loop -------------------------------------------------------------------
  useFrameCallback((frame) => {
    const dt = Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, PHYSICS.maxDt);
    clock.value += dt;

    // Effects decay (frame-rate independent).
    if (shake.value > 0.05) shake.value *= Math.exp(-EFFECTS.shakeDecay * dt);
    else if (shake.value !== 0) shake.value = 0;
    if (playerFlash.value > 0) playerFlash.value = Math.max(0, playerFlash.value - dt * 5);
    if (enemyFlash.value > 0) enemyFlash.value = Math.max(0, enemyFlash.value - dt * 5);

    if (partsAlive.value) {
      const a = parts.value.slice();
      let alive = false;
      for (let i = 0; i < a.length; i += PART_STRIDE) {
        if (a[i + 4] <= 0) continue;
        const kind = a[i + 5];
        const g = kind === KIND_DUST ? EFFECTS.particleGravity * 0.08 : EFFECTS.particleGravity;
        a[i + 3] += g * dt;
        a[i] += a[i + 2] * dt;
        a[i + 1] += a[i + 3] * dt;
        // Blood and sparks settle on the ground instead of falling through it.
        if (a[i + 1] > groundY + 2 && kind !== KIND_DUST) {
          a[i + 1] = groundY + 2;
          a[i + 2] *= 0.3;
          a[i + 3] = 0;
        }
        a[i + 4] -= dt * (kind === KIND_DUST ? 1.6 : 1.1);
        if (a[i + 4] > 0) alive = true;
      }
      parts.value = a;
      partsAlive.value = alive;
    }

    if (!arrowActive.value) return;

    // Arrow physics: fixed step so both phones compute the same flight.
    acc.value += dt;
    let steps = 0;
    while (acc.value >= STEP && steps < 8 && arrowActive.value) {
      acc.value -= STEP;
      steps += 1;
      avy.value += PHYSICS.gravity * STEP;
      ax.value += avx.value * STEP;
      ay.value += avy.value * STEP;
      aAngle.value = Math.atan2(avy.value, avx.value);

      const tipX = ax.value;
      const tipY = ay.value;
      const target = arrowShooter.value === 'player' ? enemyPose.value : playerPose.value;
      const zone = hitTest(target, tipX, tipY);
      if (zone) {
        resolve(zone, tipX, tipY, 'none');
        return;
      }
      const pillarX = arrowShooter.value === 'player' ? enemyX.value : playerX;
      const pillarTop = arrowShooter.value === 'player' ? enemyPillarTop.value : playerPillarTop.value;
      const onPillar = Math.abs(tipX - pillarX) < PILLAR_HALF + 2 && tipY >= pillarTop;
      if (onPillar) {
        resolve('miss', tipX, tipY, 'pillar');
        return;
      }
      if (tipY >= groundY) {
        resolve('miss', tipX, tipY, 'ground');
        return;
      }
      if (tipX < -60 || tipX > w + 60 || tipY > h + 60) {
        resolve('miss', tipX, tipY, 'none');
        return;
      }
    }
    // Trail samples once per rendered frame (not per physics step).
    const t = trail.value.concat([ax.value, ay.value]);
    trail.value = t.length > ARROW.trailPoints * 2 ? t.slice(t.length - ARROW.trailPoints * 2) : t;
  });

  // ---- input --------------------------------------------------------------------
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      if (phase.value !== 'player' || !inputSv.value) return;
      aiming.value = true;
      startX.value = e.x;
      startY.value = e.y;
      aimPower.value = 0;
      lastTick.value = 0;
      runOnJS(emit)({ type: 'aimStart' });
    })
    .onUpdate((e) => {
      if (!aiming.value || phase.value !== 'player') return;
      // Slingshot: pull back and down → shoot forward and up.
      const dx = startX.value - e.x;
      const dy = startY.value - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const power = Math.min(1, dist / PHYSICS.maxDrawPx);
      aimPower.value = power;
      if (dist > 4) aimAngle.value = Math.atan2(dy, dx);
      // Ratchet tick every 12.5% of draw
      const notch = Math.floor(power * 8);
      if (notch !== lastTick.value) {
        lastTick.value = notch;
        if (power >= PHYSICS.minPower) runOnJS(emit)({ type: 'drawTick' });
      }
    })
    .onFinalize(() => {
      if (!aiming.value) return;
      aiming.value = false;
      if (phase.value !== 'player') return;
      if (aimPower.value < PHYSICS.minPower) {
        aimPower.value = 0;
        return; // cancelled
      }
      const angle = aimAngle.value;
      const power = aimPower.value;
      playerArm.value = angle;
      runOnJS(emit)({ type: 'release' });
      runOnJS(emit)({ type: 'shotFired', angle, power });
      fire('player', angle, power);
      aimPower.value = 0;
    });

  const figure = (
    path: typeof playerPath,
    hat: typeof playerHat,
    bow: typeof playerBow,
    string: typeof playerString,
    flash: typeof playerFlash,
    s: Skin,
  ) => (
    <Group>
      <Path path={bow} color={s.bow} style="stroke" strokeWidth={3.5} strokeCap="round" />
      <Path path={string} color="rgba(255,255,255,0.75)" style="stroke" strokeWidth={1} />
      {/* Dark outline under the limbs gives the flat figure some depth. */}
      <Path path={path} color="rgba(0,0,0,0.35)" style="stroke" strokeWidth={STICKMAN.lineWidth + 2} strokeCap="round" strokeJoin="round" />
      <Path path={path} color={s.body} style="stroke" strokeWidth={STICKMAN.lineWidth} strokeCap="round" strokeJoin="round" />
      <Path path={hat} color={s.accent} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />
      {/* Hit flash */}
      <Path path={path} color="#FFFFFF" opacity={flash} style="stroke" strokeWidth={STICKMAN.lineWidth + 1} strokeCap="round" strokeJoin="round" />
    </Group>
  );

  return (
    <GestureDetector gesture={pan}>
      <Canvas style={styles.fill}>
        <Group transform={shakeTransform}>
          <Scenery w={w} h={h} groundY={groundY} seed={seed} clock={clock} />

          {/* Pillars */}
          <Path path={playerPillarBody}>
            <LinearGradient start={vec(playerX - PILLAR_HALF, 0)} end={vec(playerX + PILLAR_HALF, 0)} colors={[SCENERY.pillarLight, SCENERY.pillarDark]} />
          </Path>
          <Path path={playerPillarLines} color={SCENERY.pillarLines} style="stroke" strokeWidth={1} />
          <Path path={playerPillarCap} color={SCENERY.pillarCap} />
          <Path path={enemyPillarBody}>
            <LinearGradient start={enemyGradStart} end={enemyGradEnd} colors={[SCENERY.pillarLight, SCENERY.pillarDark]} />
          </Path>
          <Path path={enemyPillarLines} color={SCENERY.pillarLines} style="stroke" strokeWidth={1} />
          <Path path={enemyPillarCap} color={SCENERY.pillarCap} />

          <Path path={shadows} color={SCENERY.shadow}>
            <BlurMask blur={2} style="normal" />
          </Path>

          <Path path={aimDots} color={COLORS.aimDots} />

          {figure(playerPath, playerHat, playerBow, playerString, playerFlash, skin)}
          {figure(enemyPath, enemyHat, enemyBow, enemyString, enemyFlash, opponentSkin)}

          <Path path={trailPath} color="rgba(255,255,255,0.35)" />
          <Path path={arrowShaft} color={COLORS.arrowShaft} style="stroke" strokeWidth={ARROW.lineWidth} strokeCap="round" />
          <Path path={arrowFletch} color={COLORS.fletch} style="stroke" strokeWidth={2} strokeCap="round" />
          <Path path={arrowHead} color={COLORS.arrowHead} />

          <Path path={dustPath} color={SCENERY.dust} opacity={0.7} />
          <Path path={bloodPath} color={SCENERY.blood} />
          <Path path={sparkPath} color={SCENERY.spark}>
            <BlurMask blur={1.5} style="solid" />
          </Path>
        </Group>
      </Canvas>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
