import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog } from 'posthog-react-native';
import { Duel3D, emptyAnchors, type Anchors, type DuelHandle, type GameEvent, type GameMode } from '@/game3d/Duel3D';
import type { Gesture, Mood } from '@/game3d/sim';
import type { Theme } from '@/game3d/themes';
import { HP } from '@/game3d/world';
import { haptic } from '@/game/haptics';
import { accuracyOf, useGameStore } from '@/game/store';
import { lookFor, sanitizeLoadout, DEFAULT_LOADOUT, type Loadout } from '@/game/cosmetics';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { duckMusic, playAmbience, playSfx } from '@/audio/sound';
import { submitScore } from '@/utils/scores';
import { supabase } from '@/utils/supabase';
import { useRoomChannel, type Role } from '@/multiplayer/useRoom';
import { LoadingScreen, nextLoadingVariant } from '@/ui/LoadingScreen';
import { BloodEdge, ChatPanel, FloatingNumber, Plate, SkullMarker, SpeechBubble, TurnBanner, type Bubble, type Floater } from '@/ui/hud';
import { EMOTES, type EmoteId } from '@/ui/emotes';
import { FONT, GameButton } from '@/ui/kit';

type Turn = 'player' | 'enemy' | 'over';
type Outcome = 'win' | 'lose' | 'left';

// What each emote / quick message makes the archer act out.
const EMOTE_ACT: Record<EmoteId, [Gesture, Mood]> = {
  angry: ['stomp', 'angry'],
  cry: ['cry', 'sad'],
  cool: ['thumbs', 'happy'],
  surrender: ['flag', 'sad'],
  dizzy: ['shrug', 'shock'],
  laugh: ['laugh', 'laugh'],
  lol: ['laugh', 'laugh'],
  tongue: ['wave', 'happy'],
  thumbs: ['thumbs', 'happy'],
};
const TEXT_ACT: Record<string, [Gesture, Mood]> = {
  'Thanks!': ['thumbs', 'happy'],
  'Well played': ['thumbs', 'happy'],
  'Oops!': ['facepalm', 'shock'],
  Missed: ['laugh', 'laugh'],
  Greetings: ['wave', 'happy'],
  'Wow!': ['shrug', 'shock'],
  'Nice shot!': ['thumbs', 'happy'],
  Unlucky: ['shrug', 'sad'],
};

const EMOTE_COOLDOWN_MS = 2500;
const LOADING_MIN_MS = 1500;

// The duel screen: the 3D duel plus HUD, chat, AI reactions, and the side
// effects that belong on JS (haptics, audio, persistence, analytics, the
// multiplayer channel). /game?mode=ai&seed=… | ?mode=online&code=&role=&seed=
export default function GameScreen() {
  useScreenMusic('battle');
  useKeepAwake();
  const params = useLocalSearchParams<{
    mode?: string;
    code?: string;
    role?: string;
    seed?: string;
    rivalHead?: string;
    rivalBow?: string;
    rivalTrail?: string;
    rivalName?: string;
  }>();
  const mode: GameMode = params.mode === 'online' ? 'online' : 'ai';
  const role: Role = params.role === 'guest' ? 'guest' : 'host';
  const code = mode === 'online' ? params.code : undefined;
  const online = mode === 'online';
  const [fallbackSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const seed = params.seed ? Number(params.seed) : fallbackSeed;
  const rivalName = params.rivalName || (online ? 'Opponent' : 'Rival');

  const posthog = usePostHog();
  const recordGame = useGameStore((s) => s.recordGame);
  const grantRewards = useGameStore((s) => s.grantRewards);
  const skill = useGameStore((s) => accuracyOf(s.shots, s.hits));
  const loadout = useGameStore((s) => s.loadout);
  const blocked = useGameStore((s) => s.blockOpponentMessages);
  const setBlocked = useGameStore((s) => s.setBlockOpponentMessages);
  const look = useMemo(() => lookFor(loadout), [loadout]);
  const [rivalLoadout, setRivalLoadout] = useState<Loadout>(() =>
    sanitizeLoadout(online ? DEFAULT_LOADOUT : { head: params.rivalHead, bow: params.rivalBow, trail: params.rivalTrail }),
  );
  const rivalLook = useMemo(() => lookFor(rivalLoadout), [rivalLoadout]);

  const duel = useRef<DuelHandle>(null);
  const anchors = useSharedValue<Anchors>(emptyAnchors);
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState({ me: HP.max, meShield: HP.shield, them: HP.max, themShield: online ? HP.shield : 0 });
  const [turn, setTurn] = useState<Turn>('enemy');
  const [timer, setTimer] = useState<{ who: 'player' | 'enemy'; endsAt: number; seconds: number } | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; color: string } | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [blood, setBlood] = useState<{ id: number; side: 'left' | 'right' } | null>(null);
  const [popup, setPopup] = useState<{ id: number; text: string; color: string } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [overview, setOverview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadVariant] = useState(nextLoadingVariant);
  const [loadStart] = useState(() => Date.now());
  const [loadProgress, setLoadProgress] = useState(0.1);
  const [theme, setTheme] = useState<Theme | null>(null);
  const runStats = useRef({ shots: 0, hits: 0, headshots: 0, long: 0, short: 0 });
  const nextId = useRef(1);
  const lastEmoteAt = useRef(0);
  const rivalEmoteAt = useRef(0);
  const ended = useRef(false);
  const tickTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const endRef = useRef<(o: Outcome) => void>(() => {});

  // Pre-match loading: progress creeps up, then completes when the 3D duel
  // has rendered its first frames (and at least a short beat has passed).
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadProgress((p) => Math.min(0.9, p + 0.12)), 300);
    return () => clearInterval(t);
  }, [loading]);
  const onReady = useCallback(() => {
    setLoadProgress(1);
    const wait = Math.max(0, LOADING_MIN_MS - (Date.now() - loadStart));
    setTimeout(() => setLoading(false), wait + 250);
  }, [loadStart]);

  useEffect(() => {
    if (theme) playAmbience(theme.ambience);
    return () => playAmbience(null);
  }, [theme]);

  const clearTicks = () => {
    tickTimers.current.forEach(clearTimeout);
    tickTimers.current = [];
  };
  useEffect(() => clearTicks, []);

  // ---- overlays ------------------------------------------------------------------
  const showBubble = useCallback((who: 'player' | 'enemy', kind: 'emote' | 'text', value: string) => {
    const b: Bubble = { id: nextId.current++, who, kind, value };
    setBubbles((list) => [...list.filter((x) => x.who !== who), b]);
    setTimeout(() => setBubbles((list) => list.filter((x) => x.id !== b.id)), 2800);
    playSfx('emote_pop');
    haptic.emote();
    const act = kind === 'emote' ? EMOTE_ACT[value as EmoteId] : TEXT_ACT[value];
    if (act) duel.current?.gesture(who, act[0], act[1]);
  }, []);
  const addFloater = useCallback((f: Omit<Floater, 'id'>) => setFloaters((l) => [...l, { ...f, id: nextId.current++ }]), []);
  const dropFloater = useCallback((fid: number) => setFloaters((l) => l.filter((f) => f.id !== fid)), []);
  const showPopup = useCallback((text: string, color: string) => {
    const pid = nextId.current++;
    setPopup({ id: pid, text, color });
    setTimeout(() => setPopup((p) => (p?.id === pid ? null : p)), 1000);
  }, []);

  // Damage-vignette flash when I get hit, and the kill counter pop.
  const damage = useSharedValue(0);
  const damageStyle = useAnimatedStyle(() => ({ opacity: damage.value }));
  const scorePop = useSharedValue(1);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: scorePop.value }] }));

  // AI rival chatter: occasional, with a cooldown, hidden while blocked.
  const rivalSays = useCallback(
    (kind: 'emote' | 'text', value: string, chance: number, delay = 700) => {
      if (online || Math.random() > chance) return;
      if (Date.now() - rivalEmoteAt.current < 3500) return;
      rivalEmoteAt.current = Date.now();
      setTimeout(() => {
        if (!useGameStore.getState().blockOpponentMessages) showBubble('enemy', kind, value);
      }, delay);
    },
    [online, showBubble],
  );

  // ---- multiplayer channel ---------------------------------------------------------
  const room = useRoomChannel(code, online ? role : undefined, {
    onShot: (s) => {
      setTurn('enemy');
      duel.current?.fireRemote(s);
    },
    onResult: (r) => duel.current?.applyRemoteResult(r),
    onLook: (l) => setRivalLoadout(sanitizeLoadout(l)),
    onEmote: (e) => {
      if (!useGameStore.getState().blockOpponentMessages) showBubble('enemy', e.kind, e.value);
    },
    onOpponentPresence: (present) => {
      if (present) room.send('look', loadout);
    },
    onOpponentLeft: () => endRef.current('left'),
  });

  useEffect(() => {
    posthog.capture('game_started', { mode });
  }, [posthog, mode]);

  // ---- match end → result ceremony ---------------------------------------------------
  const endMatch = useCallback(
    (outcome: Outcome) => {
      if (ended.current) return;
      ended.current = true;
      setTurn('over');
      setTimer(null);
      clearTicks();
      duckMusic(true);
      const st = runStats.current;
      const won = online ? outcome !== 'lose' : null;
      const xp = online ? (outcome === 'lose' ? 25 : 60) : 15 + score * 20 + st.headshots * 5;
      const coins = online ? (outcome === 'lose' ? 10 : 30) : score * 8 + st.headshots * 2;
      const prevXp = useGameStore.getState().xp;
      grantRewards({ xp, coins, won });
      posthog.capture('game_over', { mode, score, outcome, shots: st.shots, hits: st.hits });
      if (!online) {
        recordGame(score, st.shots, st.hits);
        submitScore(score);
      } else if (outcome !== 'lose') {
        supabase.auth.getUser().then(({ data }) => room.finish(data.user?.id ?? null));
      }
      // Let the death / victory celebration play before the ceremony.
      setTimeout(() => {
        router.replace({
          pathname: '/result',
          params: {
            mode,
            outcome: online ? outcome : 'run',
            score: String(score),
            shots: String(st.shots),
            hits: String(st.hits),
            headshots: String(st.headshots),
            xp: String(xp),
            coins: String(coins),
            prevXp: String(prevXp),
            rivalName,
            rivalHead: rivalLoadout.head,
            rivalBow: rivalLoadout.bow,
            rivalTrail: rivalLoadout.trail,
          },
        });
      }, 2600);
    },
    [online, score, grantRewards, posthog, mode, recordGame, room, rivalName, rivalLoadout],
  );
  useEffect(() => {
    endRef.current = endMatch;
  }, [endMatch]);

  // ---- game events → feedback ---------------------------------------------------------
  const onEvent = useCallback(
    (e: GameEvent) => {
      switch (e.type) {
        case 'aimStart':
          haptic.aimStart();
          playSfx('draw_start');
          setChatOpen(false);
          break;
        case 'drawTick':
          haptic.drawTick(e.power);
          playSfx('draw_tick', 0.6 + e.power * 0.6);
          break;
        case 'release':
          setBanner(null);
          haptic.release();
          playSfx('bow_release');
          playSfx('arrow_whoosh');
          clearTicks();
          setTimer(null);
          setTurn('enemy');
          break;
        case 'footstep':
          playSfx('footstep');
          break;
        case 'enemyDraw':
          playSfx('draw_start', 0.6);
          break;
        case 'enemyFired':
          playSfx('bow_release', 0.7);
          playSfx('arrow_whoosh', 0.7);
          setTimer(null);
          break;
        case 'impact':
          playSfx(e.surface === 'ledge' ? 'hit_wood' : 'hit_ground');
          break;
        case 'turnStart':
          clearTicks();
          setTurn(e.who === 'player' ? 'player' : 'enemy');
          setTimer({ who: e.who, endsAt: Date.now() + e.seconds * 1000, seconds: e.seconds });
          if (e.who === 'player') {
            const bid = nextId.current++;
            setBanner({ id: bid, text: 'YOUR TURN', color: '#FFD23F' });
            setTimeout(() => setBanner((b) => (b?.id === bid ? null : b)), 1300);
            playSfx('whoosh_fast');
            // Clock ticks for the last five seconds.
            for (let i = 5; i >= 1; i--) {
              tickTimers.current.push(
                setTimeout(() => {
                  playSfx('timer_tick');
                  haptic.timerWarn();
                }, (e.seconds - i) * 1000),
              );
            }
          }
          break;
        case 'turnTimeout':
          showPopup("TIME'S UP", '#FF6B6B');
          break;
        case 'shotFired':
          runStats.current.shots += 1;
          if (online) room.send('shot', { angle: e.angle, power: e.power });
          break;
        case 'shotResolved':
          if (e.zone !== 'miss') runStats.current.hits += 1;
          if (e.zone === 'head') runStats.current.headshots += 1;
          if (online) room.send('result', { zone: e.zone, hp: e.hp, shield: e.shield });
          break;
        case 'playerMiss':
          if (e.long) runStats.current.long += 1;
          else runStats.current.short += 1;
          haptic.miss();
          rivalSays(Math.random() < 0.5 ? 'text' : 'emote', Math.random() < 0.5 ? 'Missed' : 'laugh', 0.45);
          break;
        case 'enemyMiss':
          rivalSays('text', Math.random() < 0.5 ? 'Oops!' : 'Unlucky', 0.3, 300);
          break;
        case 'shieldBreak':
          playSfx('shield_break');
          haptic.shieldBreak();
          if (e.who === 'enemy') showPopup('SHIELD BROKEN!', '#7FD8FF');
          break;
        case 'enemyHit': {
          setHp((h) => ({ ...h, them: e.hp, themShield: e.shield }));
          const shieldOnly = e.dmg === 0;
          playSfx(shieldOnly ? 'shield_hit' : e.zone === 'head' ? 'hit_head' : 'body_hit_flesh');
          if (!shieldOnly) playSfx('grunt', 0.8);
          addFloater({
            who: 'enemy',
            text: `-${e.dmg + e.shieldDmg}`,
            color: shieldOnly ? '#7FD8FF' : e.zone === 'head' ? '#FFD23F' : '#FF4D4D',
            big: e.zone === 'head',
          });
          if (!shieldOnly) setBlood({ id: nextId.current++, side: 'right' });
          if (e.zone === 'head') showPopup('HEADSHOT!', '#FFD23F');
          if (e.hp <= 0) {
            haptic.kill();
            setTimeout(() => playSfx('body_drop'), 420);
            setTimeout(() => playSfx('laugh'), 500);
            if (online) endMatch('win');
            else {
              playSfx('jingle_kill');
              setScore((s) => s + 1);
              scorePop.set(withSequence(withTiming(1.15, { duration: 110 }), withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })));
            }
          } else {
            if (shieldOnly) haptic.shieldHit();
            else haptic.bodyHit();
            rivalSays('emote', Math.random() < 0.5 ? 'angry' : 'cry', 0.35);
          }
          break;
        }
        case 'enemyRespawn':
          setHp((h) => ({ ...h, them: e.hp, themShield: e.shield }));
          rivalSays('text', 'Greetings', 0.5, 1200);
          break;
        case 'playerHeal':
          setHp((h) => ({ ...h, me: e.hp, meShield: e.shield }));
          addFloater({ who: 'player', text: '+HP', color: '#7CC23A' });
          break;
        case 'playerHit': {
          setHp((h) => ({ ...h, me: e.hp, meShield: e.shield }));
          const shieldOnly = e.dmg === 0;
          playSfx(shieldOnly ? 'shield_hit' : e.zone === 'head' ? 'hit_head' : 'body_hit_flesh');
          if (!shieldOnly) playSfx('grunt');
          addFloater({ who: 'player', text: `-${e.dmg + e.shieldDmg}`, color: shieldOnly ? '#7FD8FF' : '#FF4D4D', big: e.zone === 'head' });
          if (!shieldOnly) {
            setBlood({ id: nextId.current++, side: 'left' });
            damage.set(withSequence(withTiming(0.6, { duration: 70 }), withTiming(0, { duration: 450 })));
          }
          if (e.hp <= 0) {
            haptic.death();
            setTimeout(() => playSfx('body_drop'), 450);
            rivalSays('emote', 'lol', 0.8, 900);
            endMatch('lose');
          } else {
            if (shieldOnly) haptic.shieldHit();
            else haptic.takeHit();
            rivalSays(e.zone === 'head' ? 'emote' : 'text', e.zone === 'head' ? 'cool' : 'Nice shot!', 0.35);
          }
          break;
        }
      }
    },
    [online, room, showPopup, addFloater, rivalSays, endMatch, damage, scorePop],
  );

  // ---- chat ----------------------------------------------------------------------------
  const send = (kind: 'emote' | 'text', value: string) => {
    if (Date.now() - lastEmoteAt.current < EMOTE_COOLDOWN_MS) {
      haptic.warning();
      return;
    }
    lastEmoteAt.current = Date.now();
    setChatOpen(false);
    playSfx('chat_send');
    showBubble('player', kind, value);
    if (online) {
      room.send('emote', { kind, value });
      return;
    }
    // The AI sometimes answers back.
    if (kind === 'emote') rivalSays('emote', EMOTES[Math.floor(Math.random() * EMOTES.length)].id, 0.55, 1300);
    else rivalSays('text', value === 'Well played' || value === 'Nice shot!' ? 'Thanks!' : value === 'Greetings' ? 'Greetings' : 'Wow!', 0.55, 1300);
  };

  const quit = () => {
    haptic.tap();
    haptic.cancelVibration();
    duckMusic(false);
    router.back();
  };

  const turnLabel = turn === 'player' ? 'YOUR TURN' : turn === 'enemy' ? (online ? 'OPPONENT' : 'RIVAL') : '';

  return (
    <View style={styles.root}>
      <Duel3D
        ref={duel}
        mode={mode}
        seed={seed}
        role={role}
        myTurnFirst={!online || role === 'host'}
        look={look}
        opponentLook={rivalLook}
        score={score}
        skill={skill}
        inputEnabled={(!online || room.opponentPresent) && !paused && !chatOpen}
        overview={overview}
        anchors={anchors}
        onEvent={onEvent}
        onTheme={setTheme}
        onReady={onReady}
      />

      {/* Head-anchored overlays */}
      <SkullMarker who="enemy" anchors={anchors} />
      <SkullMarker who="player" anchors={anchors} />
      {bubbles.map((b) => (
        <SpeechBubble key={b.id} bubble={b} anchors={anchors} />
      ))}
      {floaters.map((f) => (
        <FloatingNumber key={f.id} f={f} anchors={anchors} onDone={dropFloater} />
      ))}

      {blood && <BloodEdge key={blood.id} id={blood.id} side={blood.side} />}
      <Animated.View pointerEvents="none" style={[styles.damage, damageStyle]} />

      {popup && (
        <View pointerEvents="none" style={styles.popupWrap}>
          <Animated.Text key={popup.id} entering={ZoomIn.duration(240)} exiting={FadeOut.duration(250)} style={[styles.popup, { color: popup.color }]}>
            {popup.text}
          </Animated.Text>
        </View>
      )}
      {banner && <TurnBanner key={banner.id} text={banner.text} color={banner.color} />}

      {/* Top bar: my plate · pause + kills · rival plate */}
      <SafeAreaView style={styles.hud} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.hudRow} pointerEvents="box-none">
          <Plate name="You" hp={hp.me} shield={hp.meShield} timer={timer?.who === 'player' ? timer : null} />
          <View style={styles.center} pointerEvents="box-none">
            <HapticTouchable onPress={() => setPaused(true)} hitSlop={10} style={styles.pause} sound="ui_open">
              <Ionicons name="pause" size={18} color="#FFFFFF" />
            </HapticTouchable>
            {online ? (
              <Text style={styles.roomCode}>{code}</Text>
            ) : (
              <Animated.View style={[styles.kills, scoreStyle]}>
                <Ionicons name="skull" size={14} color="#FFFFFF" />
                <Text style={styles.killsText}>{score}</Text>
              </Animated.View>
            )}
            <Text style={styles.turnText}>{turnLabel}</Text>
          </View>
          <Plate name={rivalName} hp={hp.them} shield={hp.themShield} right timer={timer?.who === 'enemy' ? timer : null} />
        </View>
        {online && !room.opponentPresent && turn !== 'over' && <Text style={styles.waiting}>Waiting for opponent to connect…</Text>}
      </SafeAreaView>

      {/* Bottom-right: magnifier (hold to see the whole field) + chat */}
      <SafeAreaView style={styles.corner} edges={['bottom', 'right']} pointerEvents="box-none">
        <View style={styles.cornerRow}>
          <HapticTouchable
            style={[styles.roundBtn, overview && styles.roundBtnOn]}
            onPressIn={() => {
              setOverview(true);
              playSfx('whoosh_fast');
            }}
            onPressOut={() => setOverview(false)}
            hitSlop={8}
            sound={null}
          >
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </HapticTouchable>
          <HapticTouchable style={styles.chatBtn} onPress={() => setChatOpen((o) => !o)} hitSlop={8} sound="ui_open">
            <Ionicons name="chatbox-ellipses" size={24} color="#2A2A2A" />
          </HapticTouchable>
        </View>
      </SafeAreaView>

      {chatOpen && (
        <ChatPanel
          onEmote={(eid) => send('emote', eid)}
          onText={(t) => send('text', t)}
          blocked={blocked}
          onBlocked={setBlocked}
          onClose={() => setChatOpen(false)}
        />
      )}

      {paused && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.overlay}>
          <Animated.View entering={ZoomIn.duration(240)} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Paused</Text>
            <GameButton label="Resume" color="green" onPress={() => setPaused(false)} style={styles.sheetBtn} />
            <GameButton label="Quit duel" color="red" onPress={quit} style={styles.sheetBtn} sound="ui_back" />
          </Animated.View>
        </Animated.View>
      )}

      {loading && <LoadingScreen variant={loadVariant} progress={loadProgress} look={look} label={theme ? theme.name : undefined} />}
    </View>
  );
}

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  hud: { position: 'absolute', top: 0, left: 0, right: 0 },
  hudRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6 },
  center: { alignItems: 'center', gap: 2, paddingTop: 2 },
  pause: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  kills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  killsText: { fontFamily: FONT.bold, fontSize: 16, color: '#FFFFFF' },
  roomCode: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: 16, letterSpacing: 4, ...textShadow },
  turnText: { fontFamily: FONT.bold, color: 'rgba(255,255,255,0.9)', fontSize: 11, letterSpacing: 1.5, ...textShadow },
  waiting: { fontFamily: FONT.semi, color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 8, ...textShadow },
  corner: { position: 'absolute', right: 0, bottom: 0 },
  cornerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 14 },
  roundBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  roundBtnOn: { backgroundColor: 'rgba(255,164,27,0.75)' },
  chatBtn: { width: 54, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  damage: { ...StyleSheet.absoluteFill, borderWidth: 26, borderColor: 'rgba(170,10,20,0.85)' },
  popupWrap: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center' },
  popup: { fontFamily: FONT.bold, fontSize: 38, letterSpacing: 2, ...textShadow },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 300,
    backgroundColor: '#15161C',
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sheetTitle: { fontFamily: FONT.bold, fontSize: 24, color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  sheetBtn: { alignSelf: 'stretch' },
});
