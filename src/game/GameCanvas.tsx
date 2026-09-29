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
import { Canvas, Circle, LinearGradient, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { ARROW, COLORS, ENEMY, HP, PHYSICS, STICKMAN } from '@/game/constants';
import { bowPath, handPoint, hatPath, headCenter, hitTest, stickmanPath, type Pose } from '@/game/stickman';
import { enemyNoise, jitter, solveLaunchAngle } from '@/game/aim';
import { layoutFor } from '@/game/rng';
import type { Skin } from '@/game/skins';

export type Zone = 'head' | 'body' | 'miss';

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
  | { type: 'playerHit'; hp: number; zone: 'head' | 'body' };

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

const STEP = 1 / 120; // fixed physics step → identical results on both phones

// The whole simulation lives in Reanimated shared values and runs on the UI
// thread (useFrameCallback), so a busy JS thread never stutters the arrow.
// Only discrete events cross to JS (runOnJS → onEvent) for haptics, HUD and
// the multiplayer channel.
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

  const stuck = useSharedValue<{ x: number; y: number; angle: number; visible: boolean }>({
    x: 0,
    y: 0,
    angle: 0,
    visible: false,
  });

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
  }));
  const enemyPose = useDerivedValue<Pose>(() => ({
    x: enemyX.value,
    y: enemyPillarTop.value,
    facing: -1,
    armAngle: enemyArm.value,
    fall: enemyFall.value,
    hat: opponentSkin.hat,
  }));

  const playerPath = useDerivedValue(() => stickmanPath(playerPose.value));
  const enemyPath = useDerivedValue(() => stickmanPath(enemyPose.value));
  const playerHat = useDerivedValue(() => hatPath(playerPose.value));
  const enemyHat = useDerivedValue(() => hatPath(enemyPose.value));
  const playerBow = useDerivedValue(() => bowPath(playerPose.value));
  const enemyBow = useDerivedValue(() => bowPath(enemyPose.value));

  // Aim preview: first ~0.5s of the trajectory as fading dots.
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
      p.addCircle(x, y, 3 - i * 0.15);
    }
    return p;
  });

  const arrowPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const draw = (x: number, y: number, ang: number) => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      p.moveTo(x - c * ARROW.length, y - s * ARROW.length);
      p.lineTo(x, y);
    };
    if (arrowActive.value) draw(ax.value, ay.value, aAngle.value);
    if (stuck.value.visible) draw(stuck.value.x, stuck.value.y, stuck.value.angle);
    return p;
  });

  const enemyPillar = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(enemyX.value - 24, enemyPillarTop.value, 48, groundY - enemyPillarTop.value + 4), 4, 4));
    return p;
  });
  const playerPillar = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(playerX - 24, playerPillarTop.value, 48, groundY - playerPillarTop.value + 4), 4, 4));
    return p;
  });

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
    stuck.value = { ...stuck.value, visible: false };
    phase.value = 'flight';
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
    phase.value = 'player';
    runOnJS(emit)({ type: 'enemyRespawn' });
  };

  const enemyShoot = () => {
    'worklet';
    if (phase.value !== 'enemyThink') return;
    const from = handPoint({ ...enemyPose.value, armAngle: Math.PI + 0.6 });
    const target = headCenter(playerPose.value);
    const v = PHYSICS.maxSpeed * ENEMY.speedFraction;
    let angle = solveLaunchAngle(target.x - from.x, target.y - from.y, v);
    if (angle === null) angle = Math.PI + Math.PI / 4;
    angle += jitter(enemyNoise(scoreSv.value, skillSv.value));
    enemyArm.value = angle;
    fire('enemy', angle, ENEMY.speedFraction);
  };

  // setTimeout lives on JS; hop back to the UI thread to mutate state.
  const scheduleEnemyShot = () => {
    setTimeout(() => runOnUI(enemyShoot)(), ENEMY.thinkMs);
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
  const resolve = (result: Zone, tipX: number, tipY: number) => {
    'worklet';
    arrowActive.value = false;
    const shooter = arrowShooter.value;
    if (result !== 'miss') {
      stuck.value = { x: tipX, y: tipY, angle: aAngle.value, visible: true };
    } else if (tipY >= groundY) {
      stuck.value = { x: tipX, y: groundY, angle: aAngle.value, visible: true };
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
    runOnJS(emit)({ type: 'playerHit', hp: playerHp.value, zone: result });
    if (playerHp.value <= 0) {
      playerFall.value = withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) });
      phase.value = 'over';
    } else {
      phase.value = 'player';
    }
  };

  // ---- frame loop (fixed step) --------------------------------------------------------
  useFrameCallback((frame) => {
    if (!arrowActive.value) return;
    acc.value += Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, PHYSICS.maxDt);
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
        resolve(zone, tipX, tipY);
        return;
      }
      const pillarX = arrowShooter.value === 'player' ? enemyX.value : playerX;
      const pillarTop = arrowShooter.value === 'player' ? enemyPillarTop.value : playerPillarTop.value;
      const onPillar = Math.abs(tipX - pillarX) < 26 && tipY >= pillarTop;
      if (tipY >= groundY || onPillar || tipX < -60 || tipX > w + 60 || tipY > h + 60) {
        resolve('miss', tipX, tipY);
        return;
      }
    }
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

  return (
    <GestureDetector gesture={pan}>
      <Canvas style={styles.fill}>
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[COLORS.skyTop, COLORS.skyBottom]} />
        </Rect>
        <Circle cx={w * 0.82} cy={h * 0.16} r={34} color={COLORS.sun} opacity={0.9} />
        <Rect x={0} y={groundY} width={w} height={h - groundY} color={COLORS.ground} />
        <RoundedRect x={0} y={groundY} width={w} height={6} r={0} color={COLORS.pillarEdge} />

        <Path path={playerPillar} color={COLORS.pillar} />
        <Path path={enemyPillar} color={COLORS.pillar} />

        <Path path={aimDots} color={COLORS.aimDots} />

        <Path path={playerBow} color={skin.bow} style="stroke" strokeWidth={3} strokeCap="round" />
        <Path path={playerPath} color={skin.body} style="stroke" strokeWidth={STICKMAN.lineWidth} strokeCap="round" strokeJoin="round" />
        <Path path={playerHat} color={skin.accent} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />

        <Path path={enemyBow} color={opponentSkin.bow} style="stroke" strokeWidth={3} strokeCap="round" />
        <Path path={enemyPath} color={opponentSkin.body} style="stroke" strokeWidth={STICKMAN.lineWidth} strokeCap="round" strokeJoin="round" />
        <Path path={enemyHat} color={opponentSkin.accent} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />

        <Path path={arrowPath} color={COLORS.arrow} style="stroke" strokeWidth={ARROW.lineWidth} strokeCap="round" />
      </Canvas>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
