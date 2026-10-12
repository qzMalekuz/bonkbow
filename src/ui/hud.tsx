import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  ZoomOut,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { BloodSplat, EMOTES, EmoteArt, QUICK_MESSAGES, type EmoteId } from '@/ui/emotes';
import { FONT, HeartIcon, INK, ShieldIcon, StatBar } from '@/ui/kit';
import type { Anchors } from '@/game3d/Duel3D';
import type { Who } from '@/game3d/sim';
import { HP } from '@/game3d/world';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// In-duel HUD pieces. Bars, timer and chat follow the reference game; the
// signs and words (turn sign, "-N", "BONK", "...ow.") are hand-lettered in
// black ink like the launch videos (docs/trailer/tools/derpy20.py `hud`).

// ---- hand lettering --------------------------------------------------------------
// Deterministic 0..1 noise, so a word keeps its wonky letters across renders.
function noise(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Scrawled text: every letter a little rotated and off the line, ink with a
// white paper halo so it reads over any sky.
// `size` is a design size; it follows the screen scale.
export function Scrawl({ text, size: design, color = INK, seed = 0 }: { text: string; size: number; color?: string; seed?: number }) {
  const styles = useStyles();
  const size = useMetrics().s(design);
  const letters = useMemo(
    () =>
      [...text].map((c, i) => ({
        c,
        rot: (noise(seed * 31 + i) - 0.5) * 12,
        dy: (noise(seed * 17 + i * 3 + 1) - 0.5) * size * 0.14,
      })),
    [text, size, seed],
  );
  return (
    <View style={styles.scrawl}>
      {letters.map((l, i) => (
        <Text
          key={i}
          maxFontSizeMultiplier={TIGHT_FONT_SCALE}
          style={[styles.scrawlChar, { fontSize: size, lineHeight: size * 1.25, color, transform: [{ translateY: l.dy }, { rotate: `${l.rot}deg` }] }]}
        >
          {l.c}
        </Text>
      ))}
    </View>
  );
}

// ---- name plates ----------------------------------------------------------------
export function Plate({
  name,
  hp,
  shield,
  right,
  timer,
  hits,
  onHitDone,
  room,
}: {
  name: string;
  hp: number;
  shield: number;
  right?: boolean;
  timer?: { endsAt: number; seconds: number } | null;
  hits?: BarHit[];
  onHitDone?: (id: number) => void;
  // Design width this plate may take; the bars shorten so the two plates
  // never run into each other (or the pause button) on a narrow top bar.
  room?: number;
}) {
  const styles = useStyles();
  const { s } = useMetrics();
  const k = room ? Math.max(0.55, Math.min(1, (room - PLATE_FIXED) / (HP_BAR + SHIELD_BAR))) : 1;
  const nameMax = room ? Math.max(80, Math.min(220, room - 28)) : 220;
  return (
    <View style={[styles.plate, right && styles.plateRight]} pointerEvents="none">
      <View style={[styles.bars, right && styles.barsRight]}>
        <StatBar value={hp} max={HP.max} color="#E5383B" icon={<HeartIcon />} right={right} width={HP_BAR * k} />
        <StatBar value={shield} max={HP.shield} color="#2F8CE0" icon={<ShieldIcon broken={shield <= 0} />} right={right} width={SHIELD_BAR * k} />
        {timer && <TurnTimer key={timer.endsAt} endsAt={timer.endsAt} seconds={timer.seconds} />}
      </View>
      <View style={[styles.nameStrip, right && styles.nameStripRight]}>
        <Text style={[styles.name, { maxWidth: s(nameMax) }]} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
          {name}
        </Text>
      </View>
      {hits?.map((h) => (
        <BarFloat key={h.id} hit={h} right={right} k={k} onDone={onHitDone} />
      ))}
    </View>
  );
}

// ---- damage off the bars ------------------------------------------------------------
export type BarHit = { id: number; who: Who; bar: 'hp' | 'shield'; text: string; color: string; big?: boolean };

// Bar track lengths at design size, and the rest of a plate's bar row
// (icon overlaps, gaps, timer) that doesn't shorten.
const HP_BAR = 110;
const SHIELD_BAR = 90;
const PLATE_FIXED = 70;

// Centre of each bar's track, measured from the plate's outer edge (icon
// overlap + track widths in StatBar; the right plate is mirrored). `k` is
// the plate's bar shortening.
const barCentre = (bar: BarHit['bar'], k: number) => (bar === 'hp' ? 6 + (HP_BAR * k) / 2 : 6 + HP_BAR * k + 14 + 6 + (SHIELD_BAR * k) / 2);

// A scrawled "-N" that floats up off the bar it came out of, like the
// videos' "-1".
function BarFloat({ hit, right, k, onDone }: { hit: BarHit; right?: boolean; k: number; onDone?: (id: number) => void }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const lift = s(24);
  const travel = s(30);
  const rise = useSharedValue(0);
  const scale = useSharedValue(0.5);
  useEffect(() => {
    rise.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(withTiming(hit.big ? 1.35 : 1.15, { duration: 160, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 200 }));
    const id = setTimeout(() => onDone?.(hit.id), 1200);
    return () => clearTimeout(id);
  }, [hit, rise, scale, onDone]);
  const style = useAnimatedStyle(() => ({
    opacity: rise.value < 0.6 ? 1 : 1 - (rise.value - 0.6) * 2.5,
    transform: [{ translateY: lift - rise.value * travel }, { scale: scale.value }],
  }));
  const at = s(barCentre(hit.bar, k) - 40);
  return (
    <Animated.View style={[styles.barFloat, right ? { right: at } : { left: at }, style]}>
      <Scrawl text={hit.text} size={hit.big ? 30 : 24} color={hit.color} seed={hit.id} />
    </Animated.View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Orange pie that drains over the turn; pulses red in the last five seconds.
export function TurnTimer({ endsAt, seconds }: { endsAt: number; seconds: number }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const left = useSharedValue(1);
  const pulse = useSharedValue(1);
  useEffect(() => {
    const ms = Math.max(0, endsAt - Date.now());
    left.value = Math.min(1, ms / (seconds * 1000));
    left.value = withTiming(0, { duration: ms, easing: Easing.linear });
    const warnIn = ms - 5000;
    if (warnIn > 0) {
      pulse.value = withDelay(warnIn, withRepeat(withSequence(withTiming(1.2, { duration: 250 }), withTiming(1, { duration: 250 })), 10));
    }
  }, [endsAt, seconds, left, pulse]);
  const r = 9;
  const c = 2 * Math.PI * r;
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - left.value),
    stroke: left.value < 5 / seconds ? '#FF4D4D' : '#FFA41B',
  }));
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.timer, style]}>
      <Svg width={s(28)} height={s(28)} viewBox="0 0 28 28">
        <Circle cx={14} cy={14} r={13} fill="#1A1A1F" stroke="#FFFFFF" strokeWidth={1.5} />
        <AnimatedCircle
          cx={14}
          cy={14}
          r={r}
          fill="none"
          strokeWidth={r * 2 - 2}
          strokeDasharray={`${c} ${c}`}
          animatedProps={arc}
          transform="rotate(-90 14 14)"
        />
      </Svg>
    </Animated.View>
  );
}

// ---- head-anchored overlays -------------------------------------------------------
export type Bubble = { id: number; who: 'player' | 'enemy'; kind: 'emote' | 'text'; value: string };

// Speech bubble over an archer's head: an emote card or a quick message.
export function SpeechBubble({ bubble, anchors }: { bubble: Bubble; anchors: SharedValue<Anchors> }) {
  const styles = useStyles();
  const { s, width } = useMetrics();
  const insets = useSafeAreaInsets();
  const mine = bubble.who === 'player';
  const emote = bubble.kind === 'emote';
  const half = s(emote ? 40 : 75);
  const above = s(emote ? 104 : 54);
  const tailAt = s(emote ? 34 : 68);
  // Keep the bubble on screen (clear of a cutout) when the archer stands
  // near an edge; the tail slides to keep pointing at his head.
  const minX = insets.left + s(4);
  const maxX = width - insets.right - s(4) - half * 2;
  const shiftMax = half - s(14);
  const style = useAnimatedStyle(() => {
    const a = anchors.value;
    const on = mine ? a.pOn : a.eOn;
    const x = mine ? a.px : a.ex;
    const y = mine ? a.py : a.ey;
    return {
      opacity: on ? 1 : 0,
      transform: [{ translateX: Math.max(minX, Math.min(maxX, x - half)) }, { translateY: y - above }],
    };
  });
  const tail = useAnimatedStyle(() => {
    const a = anchors.value;
    const x = (mine ? a.px : a.ex) - half;
    const shift = x - Math.max(minX, Math.min(maxX, x));
    return { transform: [{ translateX: Math.max(-shiftMax, Math.min(shiftMax, shift)) }, { rotate: '45deg' }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.anchored, style]}>
      <Animated.View entering={ZoomIn.duration(240)} exiting={ZoomOut.duration(180)}>
        {bubble.kind === 'emote' ? (
          <View style={styles.emoteBubble}>
            <EmoteArt id={bubble.value as EmoteId} size={s(76)} />
          </View>
        ) : (
          <View style={styles.textBubble}>
            <Text
              style={styles.textBubbleText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={TIGHT_FONT_SCALE}
            >
              {bubble.value}
            </Text>
          </View>
        )}
        <Animated.View style={[styles.tail, { left: tailAt }, tail]} />
      </Animated.View>
    </Animated.View>
  );
}

// `word`: a scrawled ink word over the head ("BONK", "...ow.", "nailed it")
// that pops, hangs there a beat and drifts up; otherwise a number that pops
// off the head and floats up.
export type Floater = { id: number; who: Who; text: string; color: string; big?: boolean; word?: boolean };

export function FloatingNumber({ f, anchors, onDone }: { f: Floater; anchors: SharedValue<Anchors>; onDone: (id: number) => void }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const rise = useSharedValue(0);
  const scale = useSharedValue(0.4);
  const [seedDrift] = useState(() => (Math.random() - 0.5) * 30);
  const drift = s(seedDrift);
  const half = s(60);
  const [wordUp, wordRise, numUp, numRise] = [s(78), s(26), s(30), s(70)];
  const ms = f.word ? 1600 : 1100;
  useEffect(() => {
    rise.value = withTiming(1, { duration: ms, easing: f.word ? Easing.inOut(Easing.quad) : Easing.out(Easing.cubic) });
    scale.value = f.word
      ? withSequence(withTiming(f.big ? 1.25 : 1.08, { duration: 140, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 160 }))
      : withSequence(withTiming(f.big ? 1.5 : 1.15, { duration: 220, easing: Easing.out(Easing.cubic) }), withDelay(500, withTiming(0.9, { duration: 400 })));
    const id = setTimeout(() => onDone(f.id), ms + 100);
    return () => clearTimeout(id);
  }, [f, ms, rise, scale, onDone]);
  const word = !!f.word;
  const style = useAnimatedStyle(() => {
    const a = anchors.value;
    const mine = f.who === 'player';
    return {
      opacity: rise.value < 0.75 ? 1 : 1 - (rise.value - 0.75) * 4,
      transform: [
        { translateX: (mine ? a.px : a.ex) - half + (word ? 0 : drift * rise.value) },
        { translateY: (mine ? a.py : a.ey) - (word ? wordUp + rise.value * wordRise : numUp + rise.value * numRise) },
        { scale: scale.value },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.anchored, styles.floater, style]}>
      {f.word ? (
        <Scrawl text={f.text} size={f.big ? 38 : 22} color={f.color} seed={f.id} />
      ) : (
        <Text style={[styles.floaterText, { color: f.color, fontSize: s(f.big ? 30 : 24) }]} maxFontSizeMultiplier={TIGHT_FONT_SCALE} numberOfLines={1}>
          {f.text}
        </Text>
      )}
    </Animated.View>
  );
}

// Skull and crossbones with a bouncing arrow over a fallen archer.
export function SkullMarker({ who, anchors }: { who: 'player' | 'enemy'; anchors: SharedValue<Anchors> }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const [half, above, bobBy] = [s(28), s(120), s(8)];
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1);
  }, [bob]);
  const style = useAnimatedStyle(() => {
    const a = anchors.value;
    const mine = who === 'player';
    return {
      opacity: (mine ? a.pDead && a.pOn : a.eDead && a.eOn) ? 1 : 0,
      transform: [{ translateX: (mine ? a.px : a.ex) - half }, { translateY: (mine ? a.py : a.ey) - above }],
    };
  });
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value * bobBy }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.anchored, style]}>
      <Svg width={s(56)} height={s(52)} viewBox="0 0 56 52">
        <Path d="M6 40 L50 8 M6 8 L50 40" stroke="#F2F2F2" strokeWidth={7} strokeLinecap="round" />
        <Path d="M28 4c10 0 16 7 16 15 0 5-3 8-6 10v5H18v-5c-3-2-6-5-6-10 0-8 6-15 16-15Z" fill="#F2F2F2" stroke="#9E9E9E" strokeWidth={1.5} />
        <Circle cx={22} cy={19} r={4.5} fill="#1A1A1A" />
        <Circle cx={34} cy={19} r={4.5} fill="#1A1A1A" />
        <Path d="M26 27h4l-2-4Z" fill="#1A1A1A" />
      </Svg>
      <Animated.View style={[{ alignItems: 'center', marginTop: s(2) }, arrow]}>
        <Svg width={s(24)} height={s(22)} viewBox="0 0 24 22">
          <Path d="M8 0h8v9h7L12 22 1 9h7Z" fill="#FF6A13" stroke="#B83E00" strokeWidth={1.5} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// ---- chat / emotes ------------------------------------------------------------------
export function ChatPanel({
  onEmote,
  onText,
  blocked,
  onBlocked,
  onClose,
}: {
  onEmote: (id: EmoteId) => void;
  onText: (t: string) => void;
  blocked: boolean;
  onBlocked: (on: boolean) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { s, height } = useMetrics();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'emotes' | 'messages'>('emotes');
  // Sits just above game.tsx's corner buttons (margin 14 + 50 dp magnifier,
  // never under 44 dp) and never taller than the screen above them: the
  // emotes / messages scroll, the block switch and tabs stay put.
  const right = insets.right + s(14);
  const bottom = insets.bottom + s(14) + Math.max(44, s(50)) + s(14);
  const maxHeight = height - bottom - insets.top - s(8);
  const tabSlop = Math.max(0, (44 - s(32)) / 2);
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(180)} style={[styles.chat, { right, bottom, maxHeight }]}>
        <View style={styles.blockRow}>
          <Text style={styles.blockText}>Block opponent{"'"}s messages</Text>
          <Switch
            value={blocked}
            onValueChange={onBlocked}
            trackColor={{ false: '#55585E', true: '#5FA82E' }}
            thumbColor="#FFFFFF"
          />
        </View>
        <ScrollView style={styles.chatScroll} showsVerticalScrollIndicator={false} bounces={false}>
          {tab === 'emotes' ? (
            <View style={styles.grid}>
              {EMOTES.map((e) => (
                <HapticTouchable key={e.id} style={styles.gridCell} onPress={() => onEmote(e.id)} sound={null}>
                  <EmoteArt id={e.id} size={s(62)} animate={false} />
                </HapticTouchable>
              ))}
            </View>
          ) : (
            <View style={styles.msgList}>
              {QUICK_MESSAGES.map((m) => (
                <HapticTouchable key={m} style={styles.msg} onPress={() => onText(m)} sound={null}>
                  <Text style={styles.msgText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {m}
                  </Text>
                </HapticTouchable>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={styles.tabs}>
          <HapticTouchable
            style={[styles.tab, tab === 'emotes' && styles.tabOn]}
            onPress={() => setTab('emotes')}
            hitSlop={{ top: tabSlop, bottom: tabSlop }}
          >
            <Ionicons name="happy" size={s(20)} color="#FFFFFF" />
          </HapticTouchable>
          <HapticTouchable
            style={[styles.tab, tab === 'messages' && styles.tabOn]}
            onPress={() => setTab('messages')}
            hitSlop={{ top: tabSlop, bottom: tabSlop }}
          >
            <Ionicons name="chatbox-ellipses" size={s(20)} color="#FFFFFF" />
          </HapticTouchable>
        </View>
      </Animated.View>
    </>
  );
}

// ---- screen-edge blood ---------------------------------------------------------------
export function BloodEdge({ side, id }: { side: 'left' | 'right'; id: number }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withSequence(withTiming(1, { duration: 90 }), withDelay(700, withTiming(0, { duration: 900 })));
  }, [id, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[styles.bloodEdge, side === 'left' ? { left: s(-60) } : { right: s(-60) }, style]}>
      <View style={{ position: 'absolute', top: '5%' }}>
        <BloodSplat size={s(220)} seed={id * 3 + 1} />
      </View>
      <View style={{ position: 'absolute', top: '42%', left: s(side === 'left' ? 30 : -10) }}>
        <BloodSplat size={s(170)} seed={id * 3 + 2} />
      </View>
      <View style={{ position: 'absolute', bottom: '0%' }}>
        <BloodSplat size={s(240)} seed={id * 3 + 3} />
      </View>
    </Animated.View>
  );
}

// The turn sign: "YOUR TURN" / "HIS TURN" / "SUDDEN DEATH", scrawled near
// the top centre like the videos. It pops in for each turn (`id`), its
// letters boil a few times a second like redrawn ink, and it ducks out of
// the way (`up` false) while someone aims or an arrow flies.
export function TurnSign({ id, text, sub, up }: { id: number; text: string; sub?: string; up: boolean }) {
  const styles = useStyles();
  const duck = useMetrics().s(-22);
  const pop = useSharedValue(0.4);
  const show = useSharedValue(0);
  const boil = useSharedValue(0);
  const tilt = (noise(id) - 0.5) * 5;
  useEffect(() => {
    pop.value = 0.4;
    pop.value = withSequence(withTiming(1.12, { duration: 170, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 150 }));
  }, [id, pop]);
  useEffect(() => {
    show.value = withTiming(up ? 1 : 0, { duration: up ? 120 : 220 });
    if (!up) {
      cancelAnimation(boil);
      return;
    }
    boil.value = 0;
    boil.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1);
  }, [up, show, boil]);
  const style = useAnimatedStyle(() => {
    // Six redraws a second: a new small wobble each, held in between.
    const step = Math.floor(boil.value * 6) + 1;
    const j = Math.sin(step * 12.9898) * 43758.5453;
    const wob = (j - Math.floor(j) - 0.5) * 1.8;
    return {
      opacity: show.value,
      transform: [{ translateY: (1 - show.value) * duck }, { scale: pop.value }, { rotate: `${tilt + wob}deg` }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.signWrap, style]}>
      <Scrawl text={text} size={40} seed={text.length} />
      {sub ? <Scrawl text={sub} size={18} seed={sub.length + 5} /> : null}
    </Animated.View>
  );
}

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
};

const useStyles = makeStyles((m) => ({
  plate: { gap: m.s(3) },
  plateRight: { alignItems: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: m.s(14) },
  barsRight: { flexDirection: 'row-reverse' },
  nameStrip: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: m.s(4),
    paddingHorizontal: m.s(12),
    paddingVertical: m.s(1),
    minWidth: m.s(150),
    marginLeft: m.s(4),
  },
  nameStripRight: { marginLeft: 0, marginRight: m.s(4), alignItems: 'flex-end' },
  name: { fontFamily: FONT.bold, fontSize: m.s(13), color: '#FFFFFF', maxWidth: m.s(220) },
  timer: { marginLeft: m.s(2) },
  anchored: { position: 'absolute', left: 0, top: 0 },
  emoteBubble: {
    borderRadius: m.s(16),
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#BDBDBD',
    overflow: 'hidden',
  },
  textBubble: {
    width: m.s(150),
    alignItems: 'center',
    borderRadius: m.s(12),
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#B8B8B8',
    paddingVertical: m.s(6),
  },
  textBubbleText: { fontFamily: FONT.bold, fontSize: m.s(16), color: '#2A2A2A' },
  // Rotated by the bubble's animated style (with its edge-clamp slide).
  tail: {
    position: 'absolute',
    bottom: m.s(-7),
    width: m.s(14),
    height: m.s(14),
    backgroundColor: '#FFFFFF',
    zIndex: -1,
  },
  floater: { width: m.s(120), alignItems: 'center' },
  floaterText: { fontFamily: FONT.bold, ...textShadow },
  chat: {
    position: 'absolute',
    width: m.s(250),
    backgroundColor: '#141418',
    borderRadius: m.s(14),
    borderWidth: 2,
    borderColor: '#FFFFFF',
    padding: m.s(8),
    gap: m.s(8),
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#26262C',
    borderRadius: m.s(8),
    paddingLeft: m.s(10),
  },
  blockText: { fontFamily: FONT.semi, fontSize: m.s(12), color: '#FFFFFF', flexShrink: 1 },
  chatScroll: { flexGrow: 0, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: m.s(6), justifyContent: 'center' },
  gridCell: { borderRadius: m.s(12), overflow: 'hidden' },
  msgList: { gap: m.s(5) },
  msg: { backgroundColor: '#BDBDBD', borderRadius: m.s(8), paddingVertical: m.s(5), alignItems: 'center' },
  msgText: { fontFamily: FONT.bold, fontSize: m.s(16), color: '#2A2A2A' },
  tabs: { flexDirection: 'row', gap: m.s(6) },
  tab: { flex: 1, backgroundColor: '#3A3A42', borderRadius: m.s(8), paddingVertical: m.s(6), alignItems: 'center' },
  tabOn: { backgroundColor: '#5FA82E' },
  bloodEdge: { position: 'absolute', top: 0, bottom: 0, width: m.s(260) },
  barFloat: { position: 'absolute', top: 0, width: m.s(80), alignItems: 'center' },
  scrawl: { flexDirection: 'row', alignItems: 'center' },
  scrawlChar: {
    fontFamily: FONT.bold,
    includeFontPadding: false,
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  signWrap: { position: 'absolute', top: m.s(60), left: 0, right: 0, alignItems: 'center', gap: 0 },
}));
