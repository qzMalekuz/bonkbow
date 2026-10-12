import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog } from 'posthog-react-native';
import { Duel3D, emptyAnchors, type Anchors, type DuelHandle, type GameEvent, type GameMode } from '@/game3d/Duel3D';
import type { Gesture, Mood } from '@/game3d/sim';
import type { Theme } from '@/game3d/themes';
import { HP } from '@/game3d/world';
import { haptic } from '@/game/haptics';
import { accuracyOf, useGameStore } from '@/game/store';
import { randomSeed } from '@/game/maps';
import { lookFor, sanitizeLoadout, type Loadout } from '@/game/cosmetics';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { duckMusic, playAmbience, playSfx } from '@/audio/sound';
import { submitScore } from '@/utils/scores';
import { LoadingScreen, nextLoadingVariant } from '@/ui/LoadingScreen';
import { BloodEdge, ChatPanel, FloatingNumber, Plate, Scrawl, SkullMarker, SpeechBubble, TurnSign, type BarHit, type Bubble, type Floater } from '@/ui/hud';
import { EMOTES, type EmoteId } from '@/ui/emotes';
import { FONT, GameButton, INK } from '@/ui/kit';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

type Turn = 'player' | 'enemy' | 'over';
type Outcome = 'win' | 'lose';

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

// The turn sign reads "SUDDEN DEATH" while both archers are down to a third
// of their health or less (one decent hit from the end). Presentation only:
// no rule changes.
const SUDDEN_DEATH_HP = Math.floor(HP.max / 3);

// Top bar budget in design units: side padding and the pause/kills column
// (plus a little air either side) that the two plates share the rest around.
const HUD_PAD = 18;
const HUD_CENTER = 76;
// Smallest touch target any HUD button may shrink to on a small screen.
const MIN_TAP = 44;

// What an archer says while his arrow is still in the air.
const EARLY_CHEERS = ['nailed it', 'called it', 'easy', 'got him'];

// Route params are untyped strings; sanitizeLoadout
// keeps only ids it knows and maps a legacy `head` from older builds.
type LooseLoadout = { derp?: string; hat?: string; outfit?: string; bow?: string; arrow?: string; head?: string };
const loadoutFrom = (l: LooseLoadout | undefined) => sanitizeLoadout(l as Parameters<typeof sanitizeLoadout>[0]);

// The duel screen: the 3D duel against the AI plus HUD, chat, AI reactions,
// and the side effects that belong on JS (haptics, audio, persistence,
// analytics). /game?seed=…&rivalDerp=…  (the entry fee is paid on /match).
export default function GameScreen() {
  useScreenMusic('battle');
  useKeepAwake();
  const styles = useStyles();
  const m = useMetrics();
  const { s } = m;
  const insets = useSafeAreaInsets();
  // Each plate gets half of what's left of the top bar after the notch
  // insets, padding and centre column; Plate shortens its bars to fit.
  const plateRoom = ((m.width - insets.left - insets.right) / m.scale - HUD_PAD * 2 - HUD_CENTER) / 2;
  const params = useLocalSearchParams<{
    seed?: string;
    rivalDerp?: string;
    rivalHat?: string;
    rivalBow?: string;
    rivalOutfit?: string;
    rivalArrow?: string;
    rivalName?: string;
  }>();
  const mode: GameMode = 'ai';
  const [fallbackSeed] = useState(() => randomSeed(useGameStore.getState().equippedMap));
  const seed = params.seed ? Number(params.seed) : fallbackSeed;
  const rivalName = params.rivalName || 'Rival';
  const playerName = useGameStore((s) => s.playerName);

  const posthog = usePostHog();
  const recordGame = useGameStore((s) => s.recordGame);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const skill = useGameStore((s) => accuracyOf(s.shots, s.hits));
  const loadout = useGameStore((s) => s.loadout);
  const blocked = useGameStore((s) => s.blockOpponentMessages);
  const setBlocked = useGameStore((s) => s.setBlockOpponentMessages);
  const look = useMemo(() => lookFor(loadout), [loadout]);
  const [rivalLoadout] = useState<Loadout>(() =>
    loadoutFrom({ derp: params.rivalDerp, hat: params.rivalHat, outfit: params.rivalOutfit, bow: params.rivalBow, arrow: params.rivalArrow }),
  );
  const rivalLook = useMemo(() => lookFor(rivalLoadout), [rivalLoadout]);

  const duel = useRef<DuelHandle>(null);
  const anchors = useSharedValue<Anchors>(emptyAnchors);
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState({ me: HP.max, meShield: HP.shield, them: HP.max, themShield: 0 });
  const [turn, setTurn] = useState<Turn>('enemy');
  const [timer, setTimer] = useState<{ who: 'player' | 'enemy'; endsAt: number; seconds: number } | null>(null);
  const [sign, setSign] = useState<{ id: number; who: 'player' | 'enemy' } | null>(null);
  const [signUp, setSignUp] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [barHits, setBarHits] = useState<BarHit[]>([]);
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
  const suddenAnnounced = useRef(false);

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
  const addBarHit = useCallback((h: Omit<BarHit, 'id'>) => setBarHits((l) => [...l, { ...h, id: nextId.current++ }]), []);
  const dropBarHit = useCallback((hid: number) => setBarHits((l) => l.filter((h) => h.id !== hid)), []);
  // Damage comes off the bar it hit: red off health, blue off the shield.
  const barDamage = useCallback(
    (who: 'player' | 'enemy', dmg: number, shieldDmg: number, head: boolean) => {
      if (dmg > 0) addBarHit({ who, bar: 'hp', text: `-${dmg}`, color: '#E5383B', big: head });
      if (shieldDmg > 0) addBarHit({ who, bar: 'shield', text: `-${shieldDmg}`, color: '#2F8CE0' });
    },
    [addBarHit],
  );
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
      if (Math.random() > chance) return;
      if (Date.now() - rivalEmoteAt.current < 3500) return;
      rivalEmoteAt.current = Date.now();
      setTimeout(() => {
        if (!useGameStore.getState().blockOpponentMessages) showBubble('enemy', kind, value);
      }, delay);
    },
    [showBubble],
  );

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
      setSignUp(false);
      clearTicks();
      duckMusic(true);
      const st = runStats.current;
      const reward = finishMatch({ online: false, outcome: 'run', kills: score, headshots: st.headshots });
      posthog.capture('game_over', { mode, score, outcome, shots: st.shots, hits: st.hits });
      recordGame(score, st.shots, st.hits);
      submitScore(score);
      // Let the death / victory celebration play before the ceremony.
      setTimeout(() => {
        router.replace({
          pathname: '/result',
          params: {
            mode,
            outcome: 'run',
            score: String(score),
            shots: String(st.shots),
            hits: String(st.hits),
            headshots: String(st.headshots),
            xp: String(reward.xp),
            coins: String(reward.coins),
            matchCoins: String(reward.matchCoins),
            dailyBonus: String(reward.dailyBonus),
            levelBonus: String(reward.levelBonus),
            prevXp: String(reward.prevXp),
            rivalName,
            rivalDerp: rivalLoadout.derp,
            rivalHat: rivalLoadout.hat,
            rivalBow: rivalLoadout.bow,
            rivalOutfit: rivalLoadout.outfit,
            rivalArrow: rivalLoadout.arrow,
          },
        });
      }, 2600);
    },
    [score, finishMatch, posthog, mode, recordGame, rivalName, rivalLoadout],
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
          setSignUp(false);
          break;
        case 'drawTick':
          haptic.drawTick(e.power);
          playSfx('draw_tick', 0.6 + e.power * 0.6);
          break;
        case 'release':
          setSignUp(false);
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
          setSignUp(false);
          break;
        case 'enemyFired':
          playSfx('bow_release', 0.7);
          playSfx('arrow_whoosh', 0.7);
          setTimer(null);
          setSignUp(false);
          break;
        case 'impact':
          playSfx(e.surface === 'ledge' ? 'hit_wood' : 'hit_ground');
          break;
        case 'turnStart':
          clearTicks();
          setTurn(e.who === 'player' ? 'player' : 'enemy');
          setTimer({ who: e.who, endsAt: Date.now() + e.seconds * 1000, seconds: e.seconds });
          setSign({ id: nextId.current++, who: e.who });
          setSignUp(true);
          if (e.who === 'player') {
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
          showPopup("TIME'S UP", '#E5383B');
          break;
        case 'shotFired':
          runStats.current.shots += 1;
          break;
        case 'shotResolved':
          if (e.zone !== 'miss') runStats.current.hits += 1;
          if (e.zone === 'head') runStats.current.headshots += 1;
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
          if (e.who === 'enemy') showPopup('NO MORE SHIELD', '#2F8CE0');
          break;
        case 'enemyHit': {
          setHp((h) => ({ ...h, them: e.hp, themShield: e.shield }));
          const shieldOnly = e.dmg === 0;
          playSfx(shieldOnly ? 'shield_hit' : e.zone === 'head' ? 'hit_head' : 'body_hit_flesh');
          if (!shieldOnly) playSfx('grunt', 0.8);
          barDamage('enemy', e.dmg, e.shieldDmg, e.zone === 'head');
          if (!shieldOnly) setBlood({ id: nextId.current++, side: 'right' });
          if (e.zone === 'head') showPopup('HEADSHOT', INK);
          if (e.hp <= 0) {
            haptic.kill();
            setTimeout(() => playSfx('body_drop'), 420);
            setTimeout(() => playSfx('laugh'), 500);
            playSfx('jingle_kill');
            setScore((s) => s + 1);
            scorePop.set(withSequence(withTiming(1.15, { duration: 110 }), withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })));
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
          barDamage('player', e.dmg, e.shieldDmg, e.zone === 'head');
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
        // Comedy beats: words over the archer's head, deadpan and short.
        case 'selfBonk':
          playSfx('hit_wood');
          addFloater({ who: e.who, text: 'BONK', color: INK, big: true, word: true });
          if (e.who === 'player') {
            haptic.shieldHit();
            rivalSays('emote', 'lol', 0.6, 900);
          } else haptic.miss();
          break;
        case 'ow':
          playSfx('emote_pop', 0.4);
          if (e.who === 'player') haptic.emote();
          addFloater({ who: e.who, text: '...ow.', color: INK, word: true });
          break;
        case 'earlyCheer':
          addFloater({ who: e.who, text: EARLY_CHEERS[Math.floor(Math.random() * EARLY_CHEERS.length)], color: INK, word: true });
          break;
      }
    },
    [showPopup, addFloater, barDamage, rivalSays, endMatch, damage, scorePop],
  );

  // Sudden death: announced once with a slam when the sign first shows it.
  const sudden = turn !== 'over' && hp.me > 0 && hp.them > 0 && hp.me <= SUDDEN_DEATH_HP && hp.them <= SUDDEN_DEATH_HP;
  useEffect(() => {
    if (!sudden) {
      suddenAnnounced.current = false;
      return;
    }
    if (!signUp || suddenAnnounced.current) return;
    suddenAnnounced.current = true;
    playSfx('vs_slam');
    haptic.shieldBreak();
  }, [sudden, signUp]);

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

  // Android back never drops the duel: it opens the pause sheet (or closes
  // whatever sheet is open). Leaving is the sheet's "Quit duel".
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (ended.current) return true;
      if (chatOpen) setChatOpen(false);
      else setPaused((p) => !p);
      haptic.tap();
      return true;
    });
    return () => sub.remove();
  }, [chatOpen]);

  const signText = sudden ? 'SUDDEN DEATH' : sign?.who === 'player' ? 'YOUR TURN' : 'HIS TURN';
  const signSub = sudden ? (sign?.who === 'player' ? '(your turn)' : '(his turn)') : undefined;

  return (
    <View style={styles.root}>
      <Duel3D
        ref={duel}
        mode={mode}
        seed={seed}
        role="host"
        myTurnFirst
        look={look}
        opponentLook={rivalLook}
        score={score}
        skill={skill}
        inputEnabled={!paused && !chatOpen}
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
          <Animated.View key={popup.id} entering={ZoomIn.duration(240)} exiting={FadeOut.duration(250)}>
            <Scrawl text={popup.text} size={36} color={popup.color} seed={popup.id} />
          </Animated.View>
        </View>
      )}
      {sign && turn !== 'over' && <TurnSign id={sign.id} text={signText} sub={signSub} up={signUp && !loading} />}

      {/* Top bar: my plate · pause + kills · rival plate */}
      <SafeAreaView style={styles.hud} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.hudRow} pointerEvents="box-none">
          <Plate
            name={playerName || 'You'}
            hp={hp.me}
            shield={hp.meShield}
            timer={timer?.who === 'player' ? timer : null}
            hits={barHits.filter((h) => h.who === 'player')}
            onHitDone={dropBarHit}
            room={plateRoom}
          />
          <View style={styles.center} pointerEvents="box-none">
            <HapticTouchable
              onPress={() => setPaused(true)}
              hitSlop={Math.max(10, (MIN_TAP - s(30)) / 2)}
              style={styles.pause}
              sound="ui_open"
            >
              <Ionicons name="pause" size={s(18)} color="#FFFFFF" />
            </HapticTouchable>
            <Animated.View style={[styles.kills, scoreStyle]}>
              <Ionicons name="skull" size={s(14)} color="#FFFFFF" />
              <Text style={styles.killsText} maxFontSizeMultiplier={TIGHT_FONT_SCALE} numberOfLines={1}>
                {score}
              </Text>
            </Animated.View>
          </View>
          <Plate
            name={rivalName}
            hp={hp.them}
            shield={hp.themShield}
            right
            timer={timer?.who === 'enemy' ? timer : null}
            hits={barHits.filter((h) => h.who === 'enemy')}
            onHitDone={dropBarHit}
            room={plateRoom}
          />
        </View>
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
            <Ionicons name="search" size={s(24)} color="#FFFFFF" />
          </HapticTouchable>
          <HapticTouchable style={styles.chatBtn} onPress={() => setChatOpen((o) => !o)} hitSlop={8} sound="ui_open">
            <Ionicons name="chatbox-ellipses" size={s(24)} color="#2A2A2A" />
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
            <Text style={styles.sheetTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              Paused
            </Text>
            <GameButton label="Resume" color="green" onPress={() => setPaused(false)} style={styles.sheetBtn} />
            <GameButton label="Quit duel" color="red" onPress={quit} style={styles.sheetBtn} sound="ui_back" />
          </Animated.View>
        </Animated.View>
      )}

      {loading && <LoadingScreen variant={loadVariant} progress={loadProgress} look={look} label={theme ? theme.name : undefined} />}
    </View>
  );
}

const useStyles = makeStyles((m) => ({
  root: { flex: 1, backgroundColor: '#000000' },
  hud: { position: 'absolute', top: 0, left: 0, right: 0 },
  hudRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: m.s(HUD_PAD), paddingTop: m.s(6) },
  center: { alignItems: 'center', gap: m.s(2), paddingTop: m.s(2), maxWidth: m.s(HUD_CENTER) },
  pause: { width: m.s(30), height: m.s(30), borderRadius: m.s(15), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  kills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(4),
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: m.s(10),
    paddingHorizontal: m.s(8),
    paddingVertical: m.s(1),
  },
  killsText: { fontFamily: FONT.bold, fontSize: m.s(16), color: '#FFFFFF' },
  corner: { position: 'absolute', right: 0, bottom: 0 },
  cornerRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(12), margin: m.s(14) },
  roundBtn: {
    width: Math.max(MIN_TAP, m.s(50)),
    height: Math.max(MIN_TAP, m.s(50)),
    borderRadius: Math.max(MIN_TAP, m.s(50)) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  roundBtnOn: { backgroundColor: 'rgba(255,164,27,0.75)' },
  chatBtn: { width: Math.max(MIN_TAP, m.s(54)), height: Math.max(MIN_TAP, m.s(46)), borderRadius: m.s(12), alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  damage: { ...StyleSheet.absoluteFill, borderWidth: m.s(26), borderColor: 'rgba(170,10,20,0.85)' },
  popupWrap: { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: m.s(300),
    maxWidth: '90%',
    backgroundColor: '#15161C',
    borderRadius: m.s(20),
    padding: m.s(20),
    gap: m.s(10),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sheetTitle: { fontFamily: FONT.bold, fontSize: m.s(24), color: '#FFFFFF', textAlign: 'center', marginBottom: m.s(4) },
  sheetBtn: { alignSelf: 'stretch' },
}));
