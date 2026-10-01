import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog } from 'posthog-react-native';
import { Duel3D, type DuelHandle, type GameEvent, type GameMode } from '@/game3d/Duel3D';
import { HP } from '@/game3d/world';
import { COLORS } from '@/game/constants';
import { haptic } from '@/game/haptics';
import { accuracyOf, useGameStore } from '@/game/store';
import { AI_SKIN, DEFAULT_SKIN_ID, getSkin, type Skin } from '@/game/skins';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { duckMusic, playSfx } from '@/audio/sound';
import { submitScore } from '@/utils/scores';
import { supabase } from '@/utils/supabase';
import { useRoomChannel, type Role } from '@/multiplayer/useRoom';

type Turn = 'player' | 'enemy' | 'over';

// Screen shell around the canvas: HUD, result sheet, and the side effects that
// belong on JS (haptics, persistence, analytics, the multiplayer channel).
// Routes: /game?mode=ai   |   /game?mode=online&code=ABC123&role=host&seed=123
export default function GameScreen() {
  useScreenMusic('battle');
  useKeepAwake();
  const params = useLocalSearchParams<{ mode?: string; code?: string; role?: string; seed?: string }>();
  const mode: GameMode = params.mode === 'online' ? 'online' : 'ai';
  const role: Role = params.role === 'guest' ? 'guest' : 'host';
  const code = mode === 'online' ? params.code : undefined;
  const [randomSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const seed = params.seed ? Number(params.seed) : randomSeed;
  const online = mode === 'online';

  const posthog = usePostHog();
  const recordGame = useGameStore((s) => s.recordGame);
  const highScore = useGameStore((s) => s.highScore);
  // Adaptive AI: lifetime hit rate (decayed) → how tightly the AI aims.
  const skill = useGameStore((s) => accuracyOf(s.shots, s.hits));
  const skin = getSkin(useGameStore((s) => s.equippedSkin));
  const [opponentSkin, setOpponentSkin] = useState<Skin>(online ? getSkin(DEFAULT_SKIN_ID) : AI_SKIN);

  const canvas = useRef<DuelHandle>(null);
  const [overview, setOverview] = useState(false);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [playerHp, setPlayerHp] = useState(HP.max);
  const [enemyHp, setEnemyHp] = useState(HP.max);
  const [turn, setTurn] = useState<Turn>(online && role === 'guest' ? 'enemy' : 'player');
  const [outcome, setOutcome] = useState<'win' | 'lose' | 'left' | null>(null);
  // Per-run shot log for the coach tip + adaptive AI. Refs: no re-render per arrow.
  const runStats = useRef({ shots: 0, hits: 0, long: 0, short: 0 });
  const [coachTip, setCoachTip] = useState<string | null>(null);
  // Floating callout over the arena ("HEADSHOT!", "-50"). `id` re-keys the
  // animated view so back-to-back hits each get a fresh entrance.
  const [popup, setPopup] = useState<{ id: number; text: string; color: string } | null>(null);
  const popupId = useRef(0);
  const showPopup = useCallback((text: string, color: string) => {
    popupId.current += 1;
    const id = popupId.current;
    setPopup({ id, text, color });
    setTimeout(() => setPopup((p) => (p?.id === id ? null : p)), 900);
  }, []);
  // Red edge flash when you take damage.
  const damage = useSharedValue(0);
  const damageStyle = useAnimatedStyle(() => ({ opacity: damage.value }));
  const flashDamage = useCallback(() => {
    damage.set(withSequence(withTiming(0.55, { duration: 70 }), withTiming(0, { duration: 420 })));
  }, [damage]);
  // Score pop.
  const scorePop = useSharedValue(1);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: scorePop.value }] }));

  // ---- multiplayer channel -------------------------------------------------------
  const room = useRoomChannel(code, online ? role : undefined, {
    onShot: (s) => {
      setTurn('enemy');
      canvas.current?.fireRemote(s);
    },
    onResult: (r) => canvas.current?.applyRemoteResult(r),
    onSkin: (id) => setOpponentSkin(getSkin(id)),
    onOpponentPresence: (present) => {
      if (present) room.send('skin', { skinId: skin.id });
    },
    onOpponentLeft: () => {
      if (!outcome) {
        setOutcome('left');
        setTurn('over');
      }
    },
  });

  useEffect(() => {
    posthog.capture('game_started', { mode });
  }, [posthog, round, mode]);

  const onEvent = useCallback(
    (e: GameEvent) => {
      switch (e.type) {
        case 'aimStart':
          haptic.aimStart();
          playSfx('draw_start');
          break;
        case 'drawTick':
          haptic.drawTick();
          playSfx('draw_tick');
          break;
        case 'release':
          haptic.release();
          playSfx('bow_release');
          playSfx('arrow_whoosh');
          setTurn('enemy');
          break;
        case 'enemyDraw':
          playSfx('draw_start', 0.6);
          break;
        case 'enemyFired':
          playSfx('bow_release', 0.7);
          playSfx('arrow_whoosh', 0.7);
          break;
        case 'impact':
          playSfx(e.surface === 'pillar' ? 'hit_wood' : 'hit_ground');
          break;
        case 'shotFired':
          runStats.current.shots += 1;
          if (online) room.send('shot', { angle: e.angle, power: e.power });
          break;
        case 'shotResolved':
          if (e.zone !== 'miss') runStats.current.hits += 1;
          if (online) room.send('result', { zone: e.zone, hp: e.hp });
          break;
        case 'enemyHit':
          setEnemyHp(e.hp);
          playSfx(e.zone === 'head' ? 'hit_head' : 'hit_body');
          showPopup(e.zone === 'head' ? 'HEADSHOT!' : `-${HP.body}`, e.zone === 'head' ? '#FFD166' : '#FFFFFF');
          if (e.hp <= 0) {
            haptic.kill();
            setTimeout(() => playSfx('body_drop'), 420);
            if (online) {
              setOutcome('win');
              setTurn('over');
            } else {
              playSfx('jingle_kill');
              setScore((s) => s + 1);
              scorePop.set(withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 8 })));
            }
          } else {
            haptic.bodyHit();
          }
          break;
        case 'enemyRespawn':
          setEnemyHp(HP.max);
          setTurn('player');
          break;
        case 'playerMiss':
          if (e.long) runStats.current.long += 1;
          else runStats.current.short += 1;
          haptic.miss();
          break;
        case 'enemyMiss':
          setTurn('player');
          break;
        case 'playerHit':
          setPlayerHp(e.hp);
          playSfx(e.zone === 'head' ? 'hit_head' : 'hit_body');
          flashDamage();
          if (e.hp <= 0) {
            haptic.death();
            setTimeout(() => playSfx('body_drop'), 450);
            setOutcome('lose');
            setTurn('over');
          } else {
            haptic.takeHit();
            setTurn('player');
          }
          break;
      }
    },
    [online, room, showPopup, flashDamage, scorePop],
  );

  // Persist + report once, when the run ends.
  useEffect(() => {
    if (turn !== 'over') return;
    duckMusic(true);
    setTimeout(() => playSfx(outcome === 'lose' ? 'jingle_lose' : 'jingle_win'), 500);
    const st = runStats.current;
    posthog.capture('game_over', { mode, score, outcome, shots: st.shots, hits: st.hits });
    if (!online) {
      setCoachTip(coachTipFor(st, skill));
      recordGame(score, st.shots, st.hits);
      submitScore(score);
    } else if (outcome === 'win' || outcome === 'left') {
      supabase.auth.getUser().then(({ data }) => room.finish(data.user?.id ?? null));
    }
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    haptic.release();
    duckMusic(false);
    setScore(0);
    setPlayerHp(HP.max);
    setEnemyHp(HP.max);
    setOutcome(null);
    setCoachTip(null);
    runStats.current = { shots: 0, hits: 0, long: 0, short: 0 };
    setTurn('player');
    setRound((r) => r + 1);
  };

  const quit = () => {
    haptic.tap();
    haptic.cancelVibration();
    duckMusic(false);
    router.back();
  };

  const turnLabel =
    turn === 'over' ? '' : turn === 'player' ? 'YOUR SHOT' : online ? 'OPPONENT…' : 'INCOMING…';

  return (
    <View style={styles.root}>
      <Duel3D
        key={round}
        ref={canvas}
        mode={mode}
        seed={seed + round}
        role={role}
        myTurnFirst={!online || role === 'host'}
        skin={skin}
        opponentSkin={opponentSkin}
        score={score}
        skill={skill}
        inputEnabled={!online || room.opponentPresent}
        overview={overview}
        onEvent={onEvent}
      />

      <Animated.View pointerEvents="none" style={[styles.damage, damageStyle]} />

      {popup && (
        <View pointerEvents="none" style={styles.popupWrap}>
          <Animated.Text
            key={popup.id}
            entering={ZoomIn.springify().damping(9)}
            exiting={FadeOut.duration(250)}
            style={[styles.popup, { color: popup.color }]}
          >
            {popup.text}
          </Animated.Text>
        </View>
      )}

      <SafeAreaView style={styles.hud} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.hudRow} pointerEvents="box-none">
          <HapticTouchable onPress={quit} hitSlop={12} style={styles.iconButton} sound="ui_back">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </HapticTouchable>
          <Nameplate name="You" hp={playerHp} color={skin.color} />
          <View style={styles.center} pointerEvents="none">
            {online ? (
              <Text style={styles.roomCode}>{code}</Text>
            ) : (
              <Animated.Text style={[styles.score, scoreStyle]}>{score}</Animated.Text>
            )}
            <Text style={styles.turnText}>{turnLabel || ' '}</Text>
          </View>
          <Nameplate
            name={online ? 'Opponent' : `Rival · AI ${Math.round(skill * 100)}%`}
            hp={enemyHp}
            color={opponentSkin.color}
            right
            dot={online ? room.opponentPresent : undefined}
          />
          <View style={styles.iconButton} />
        </View>
        {online && !room.opponentPresent && turn !== 'over' && (
          <Text style={styles.waiting}>Waiting for opponent to connect…</Text>
        )}
      </SafeAreaView>

      {/* Hold to zoom out and see the whole field (like the reference's magnifier). */}
      <SafeAreaView style={styles.zoomWrap} edges={['bottom', 'left']} pointerEvents="box-none">
        <HapticTouchable
          style={[styles.zoom, overview && styles.zoomOn]}
          onPressIn={() => setOverview(true)}
          onPressOut={() => setOverview(false)}
          hitSlop={10}
        >
          <Ionicons name={overview ? 'contract-outline' : 'search-outline'} size={22} color="#FFFFFF" />
        </HapticTouchable>
      </SafeAreaView>

      {turn === 'over' && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.overlay}>
          <Animated.View entering={ZoomIn.delay(350).springify().damping(14)} style={styles.sheet}>
            <Text style={styles.overTitle}>
              {outcome === 'win' ? 'You win' : outcome === 'left' ? 'Opponent left' : 'You got shot'}
            </Text>
            {online ? (
              <Ionicons name={outcome === 'lose' ? 'skull-outline' : 'trophy-outline'} size={72} color={COLORS.arrow} />
            ) : (
              <>
                <Text style={styles.overScore}>{score}</Text>
                <Text style={styles.overSub}>{score >= highScore && score > 0 ? 'New best!' : `Best ${highScore}`}</Text>
                {coachTip && (
                  <View style={styles.coach}>
                    <Ionicons name="sparkles-outline" size={16} color={COLORS.arrow} />
                    <Text style={styles.coachText}>{coachTip}</Text>
                  </View>
                )}
              </>
            )}
            {!online && (
              <HapticTouchable style={styles.primary} onPress={restart}>
                <Ionicons name="refresh" size={20} color="#0B0B0F" />
                <Text style={styles.primaryText}>Play again</Text>
              </HapticTouchable>
            )}
            <HapticTouchable style={online ? styles.primary : styles.secondary} onPress={quit}>
              <Text style={online ? styles.primaryText : styles.secondaryText}>{online ? 'Back to lobby' : 'Home'}</Text>
            </HapticTouchable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// Rules-based post-run coaching from the shot log. Deliberately not an LLM:
// it runs offline, instantly, and every tip is grounded in what just happened.
function coachTipFor(st: { shots: number; hits: number; long: number; short: number }, skill: number): string | null {
  if (st.shots === 0) return null;
  const acc = st.hits / st.shots;
  const misses = st.long + st.short;
  if (misses >= 2 && st.long >= st.short * 2) return 'Most misses flew long. Ease off the draw a notch.';
  if (misses >= 2 && st.short >= st.long * 2) return 'Most misses fell short. Pull further back, aim a touch higher.';
  if (acc >= 0.7) return `Sharp shooting (${Math.round(acc * 100)}%). The AI is tightening its aim to match you.`;
  if (skill < 0.35) return 'Aim just above the head: the arrow drops faster than it looks.';
  return `${Math.round(acc * 100)}% accuracy. Headshots end it in one; go for the top of the arc.`;
}

// Name + HP pill. The bar drains smoothly; a pale "recent damage" ghost lags
// behind the real value.
function Nameplate({ name, hp, color, right, dot }: { name: string; hp: number; color: string; right?: boolean; dot?: boolean }) {
  const pct = Math.max(0, Math.min(1, hp / HP.max));
  const fill = useSharedValue(pct);
  const ghost = useSharedValue(pct);
  useEffect(() => {
    fill.value = withTiming(pct, { duration: 260 });
    ghost.value = pct >= ghost.value ? pct : withSequence(withTiming(ghost.value, { duration: 350 }), withTiming(pct, { duration: 450 }));
  }, [pct, fill, ghost]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const ghostStyle = useAnimatedStyle(() => ({ width: `${ghost.value * 100}%` }));
  return (
    <View style={[styles.plate, right && styles.plateRight]} pointerEvents="none">
      <View style={[styles.plateHead, right && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={styles.plateName} numberOfLines={1}>
          {name}
        </Text>
        {dot !== undefined && <View style={[styles.presence, { backgroundColor: dot ? COLORS.hpGood : 'rgba(255,255,255,0.3)' }]} />}
      </View>
      <View style={[styles.hpTrack, right && { transform: [{ scaleX: -1 }] }]}>
        <Animated.View style={[styles.hpGhost, ghostStyle]} />
        <Animated.View style={[styles.hpFill, fillStyle, { backgroundColor: pct > 0.5 ? '#E5383B' : '#FF8A00' }]} />
        <Text style={[styles.hpText, right && { transform: [{ scaleX: -1 }] }]}>{Math.ceil(hp)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.skyTop },
  hud: { position: 'absolute', top: 0, left: 0, right: 0 },
  hudRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 12, paddingTop: 8 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  center: { flex: 1, alignItems: 'center' },
  score: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  plate: { width: 220, gap: 4 },
  plateRight: { alignItems: 'flex-end' },
  plateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)' },
  plateName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  presence: { width: 8, height: 8, borderRadius: 4 },
  hpText: { position: 'absolute', left: 8, top: 0, bottom: 0, color: '#FFFFFF', fontSize: 11, fontWeight: '900', lineHeight: 16 },
  zoomWrap: { position: 'absolute', left: 0, bottom: 0 },
  zoom: {
    margin: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  zoomOn: { backgroundColor: 'rgba(244,162,97,0.55)' },
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(244,162,97,0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  coachText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  roomCode: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: 4 },
  hpTrack: {
    alignSelf: 'stretch',
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
  },
  hpFill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 6 },
  hpGhost: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.6)' },
  damage: {
    ...StyleSheet.absoluteFill,
    borderWidth: 28,
    borderColor: 'rgba(193,18,31,0.9)',
  },
  popupWrap: { position: 'absolute', top: '26%', left: 0, right: 0, alignItems: 'center' },
  popup: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  turnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  waiting: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 10 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: '#11151C', borderRadius: 24, padding: 20, alignItems: 'center', gap: 6 },
  overTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  overScore: { color: '#FFFFFF', fontSize: 56, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overSub: { color: COLORS.arrow, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  primary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.arrow,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryText: { color: '#0B0B0F', fontSize: 17, fontWeight: '800' },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14 },
  secondaryText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
});
