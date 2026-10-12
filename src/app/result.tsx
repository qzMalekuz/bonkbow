import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Stage, type Actor } from '@/game3d/Stage';
import { lookFor, sanitizeLoadout, type Loadout } from '@/game/cosmetics';
import { levelOf, useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { duckMusic, playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { FONT, GameButton, LaurelBadge } from '@/ui/kit';
import { AnimatedText, Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Win / lose ceremony in the colosseum: the winner laughs and celebrates,
// the loser sulks and stomps; coins count up and the XP bar fills (with a
// level-up burst when it rolls over).
export default function ResultScreen() {
  const styles = useStyles();
  useScreenMusic('menu');
  const p = useLocalSearchParams<{
    mode?: string;
    outcome?: string;
    score?: string;
    shots?: string;
    hits?: string;
    headshots?: string;
    xp?: string;
    coins?: string;
    matchCoins?: string;
    dailyBonus?: string;
    levelBonus?: string;
    prevXp?: string;
    rivalName?: string;
    rivalDerp?: string;
    rivalHat?: string;
    rivalBow?: string;
    rivalOutfit?: string;
    rivalArrow?: string;
  }>();
  const score = Number(p.score ?? 0);
  const shots = Number(p.shots ?? 0);
  const hits = Number(p.hits ?? 0);
  const headshots = Number(p.headshots ?? 0);
  const xpGain = Number(p.xp ?? 0);
  const coinGain = Number(p.coins ?? 0);
  const dailyBonus = Number(p.dailyBonus ?? 0);
  const levelBonus = Number(p.levelBonus ?? 0);
  const playerName = useGameStore((s) => s.playerName);
  const prevXp = Number(p.prevXp ?? 0);
  const highScore = useGameStore((s) => s.highScore);
  const coins = useGameStore((s) => s.coins);
  const loadout = useGameStore((s) => s.loadout);
  const me = useMemo(() => lookFor(loadout), [loadout]);
  // The rival's loadout rides in the params as plain strings.
  const rival = useMemo(
    () =>
      lookFor(
        sanitizeLoadout({ derp: p.rivalDerp, hat: p.rivalHat, outfit: p.rivalOutfit, bow: p.rivalBow, arrow: p.rivalArrow } as Partial<Loadout>),
      ),
    [p.rivalDerp, p.rivalHat, p.rivalOutfit, p.rivalBow, p.rivalArrow],
  );

  // vs AI the run always ends with me down, but kills make it a good run.
  const iWon = false;
  const actors = useMemo<Actor[]>(
    () => [
      { look: me, x: -1.25, facing: 1, performance: iWon ? 'cheer' : score > 0 ? 'sad' : 'stomp' },
      { look: rival, x: 1.25, facing: -1, performance: iWon ? 'stomp' : 'cheer' },
    ],
    [me, rival, iWon, score],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (iWon) {
        playSfx('jingle_win');
        playSfx('crowd_cheer');
        haptic.victory();
      } else {
        playSfx('defeat_sting');
        haptic.defeat();
      }
    }, 300);
    return () => {
      clearTimeout(t);
      duckMusic(false);
    };
  }, [iWon]);

  const playAgain = () => {
    haptic.release();
    router.replace('/match');
  };

  return (
    <View style={styles.root}>
      <Stage theme="colosseum" camera={{ x: 0, y: 1.75, z: 4.6, lookX: 0, lookY: 1.25, fov: 40, drift: 0.12 }} actors={actors} />
      <LinearGradient colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Name plates with laurel badges: one row, so on a narrow screen the
          names shrink instead of the two sides running into each other. */}
      <View style={styles.sides} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.duration(400)} style={styles.side}>
          <View style={styles.nameBox}>
            <Text style={styles.name} numberOfLines={1}>
              {playerName || 'You'}
            </Text>
          </View>
          <Animated.View entering={ZoomIn.delay(500).duration(240)}>
            <LaurelBadge label={iWon ? 'WON. SOMEHOW.' : 'LOST'} win={iWon} />
          </Animated.View>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.side, styles.right]}>
          <Animated.View entering={ZoomIn.delay(650).duration(240)}>
            <LaurelBadge label={iWon ? 'LOST' : 'WON. SOMEHOW.'} win={!iWon} />
          </Animated.View>
          <View style={[styles.nameBox, { alignItems: 'flex-end' }]}>
            <Text style={styles.name} numberOfLines={1}>
              {p.rivalName ?? 'Rival'}
            </Text>
          </View>
        </Animated.View>
      </View>

      <CoinCounter from={coins - coinGain} to={coins} />
      {(dailyBonus > 0 || levelBonus > 0) && (
        <View style={styles.bonuses} pointerEvents="none">
          {dailyBonus > 0 && (
            <AnimatedText entering={FadeInDown.delay(1300).duration(300)} style={styles.bonus}>
              +{dailyBonus} daily bonus
            </AnimatedText>
          )}
          {levelBonus > 0 && (
            <AnimatedText entering={FadeInDown.delay(2000).duration(300)} style={styles.bonus}>
              +{levelBonus} level-up bonus
            </AnimatedText>
          )}
        </View>
      )}

      {/* Run summary up top and stats + XP at the bottom; on a short phone or
          with a large font they scroll, the buttons always stay on screen. */}
      <View style={styles.main} pointerEvents="box-none">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false} bounces={false}>
          <Animated.View entering={FadeIn.delay(700).duration(400)} style={styles.summary}>
            <Text style={styles.kills} numberOfLines={1}>
              {score}
            </Text>
            <Text style={styles.killsLabel}>{score === 1 ? 'GUY BONKED' : 'GUYS BONKED'}</Text>
            {score > 0 && score >= highScore && <Text style={styles.best}>NEW BEST. NOBODY SAW.</Text>}
          </Animated.View>

          <View style={styles.breakdown}>
            <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.stats}>
              <Stat label="Accuracy" value={shots ? `${Math.round((hits / shots) * 100)}%` : '–'} />
              <Stat label="Headshots" value={String(headshots)} />
              <Stat label="Coins" value={`+${coinGain}`} color="#FFC83D" />
            </Animated.View>
            <XpBar prevXp={prevXp} gain={xpGain} />
          </View>
        </ScrollView>
        <Animated.View entering={FadeInUp.delay(900).duration(400)} style={styles.buttons}>
          <GameButton label="Play again" color="green" onPress={playAgain} style={styles.btn} />
          <GameButton label="Style" color="purple" onPress={() => router.replace('/style')} style={styles.btn} />
          <GameButton label="Home" color="dark" onPress={() => router.replace('/')} style={styles.btn} sound="ui_back" />
        </Animated.View>
      </View>
    </View>
  );
}

function Stat({ label, value, color = '#FFFFFF' }: { label: string; value: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Coin purse that counts up from the old balance.
function CoinCounter({ from, to }: { from: number; to: number }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (to <= from) return;
    let v = from;
    const step = Math.max(1, Math.round((to - from) / 20));
    let id: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      playSfx('coin_gain');
      haptic.xpTick();
      id = setInterval(() => {
        v = Math.min(to, v + step);
        setShown(v);
        if (v >= to) clearInterval(id);
      }, 45);
    }, 900);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [from, to]);
  return (
    <Animated.View entering={FadeIn.delay(300)} style={styles.purse}>
      <Text style={styles.purseText} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
        {shown}
      </Text>
      <Svg width={s(26)} height={s(26)} viewBox="0 0 26 26">
        <Circle cx={13} cy={13} r={11} fill="#F7A21B" stroke="#B85C00" strokeWidth={2} />
        <Circle cx={13} cy={13} r={7} fill="#FFC83D" />
        <Path d="M10 9.5h6M13 9.5v7" stroke="#B85C00" strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// XP bar that fills from the old total to the new one, rolling over levels.
function XpBar({ prevXp, gain }: { prevXp: number; gain: number }) {
  const styles = useStyles();
  const before = levelOf(prevXp);
  const after = levelOf(prevXp + gain);
  const [level, setLevel] = useState(before.level);
  const fill = useSharedValue(before.into / before.need);
  const burst = useSharedValue(0);
  useEffect(() => {
    // Animate through each level boundary in turn.
    let delay = 1100;
    let lvl = before.level;
    const timers: ReturnType<typeof setTimeout>[] = [];
    while (lvl < after.level) {
      const at = delay;
      const next = lvl + 1;
      fill.value = withDelay(at, withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
      timers.push(
        setTimeout(() => {
          setLevel(next);
          fill.value = 0;
          playSfx('level_up');
          haptic.levelUp();
          burst.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 900 }));
        }, at + 680),
      );
      delay += 900;
      lvl = next;
    }
    fill.value = withDelay(delay, withTiming(after.into / after.need, { duration: 700, easing: Easing.out(Easing.quad) }));
    // XP ticks while filling.
    for (let i = 0; i < 8; i++) timers.push(setTimeout(() => playSfx('xp_tick'), 1100 + i * 90));
    return () => timers.forEach(clearTimeout);
  }, [before.level, after.level, after.into, after.need, fill, burst]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, fill.value) * 100}%` }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 1 + burst.value * 0.6 }] }));
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
  }, [glow]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.06 }] }));
  return (
    <Animated.View entering={FadeInUp.delay(700).duration(400)} style={styles.xpRow}>
      <Animated.View style={[styles.lvl, badgeStyle]}>
        <Text style={styles.lvlText} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
          {level}
        </Text>
        <Animated.View style={[styles.lvlBurst, burstStyle]} />
      </Animated.View>
      <View style={styles.xpTrack}>
        <Animated.View style={[styles.xpFill, fillStyle]} />
      </View>
      <Text style={styles.xpGain} numberOfLines={1}>
        +{gain} XP
      </Text>
      {after.level > before.level && (
        <AnimatedText entering={ZoomIn.delay(1800).duration(240)} style={styles.levelUp} numberOfLines={1}>
          LEVEL UP!
        </AnimatedText>
      )}
    </Animated.View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
};

const useStyles = makeStyles((m) => ({
  root: { flex: 1, backgroundColor: '#000000' },
  sides: {
    position: 'absolute',
    top: m.s(14),
    left: m.s(16),
    right: m.s(16),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: m.s(12),
  },
  side: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: m.s(10) },
  right: { justifyContent: 'flex-end' },
  // The plates only keep their minimum width where both sides fit with it.
  nameBox: {
    flexShrink: 1,
    backgroundColor: '#0B0B0F',
    borderRadius: m.s(10),
    paddingHorizontal: m.s(18),
    paddingVertical: m.s(6),
    minWidth: m.vw >= 780 ? m.s(150) : 0,
  },
  name: { flexShrink: 1, fontFamily: FONT.bold, fontSize: m.s(18), color: '#FFFFFF', maxWidth: m.s(200) },
  purse: {
    position: 'absolute',
    top: m.s(62),
    left: m.s(16),
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(6),
    backgroundColor: '#0B0B0F',
    borderRadius: m.s(10),
    paddingLeft: m.s(40),
    paddingRight: m.s(8),
    paddingVertical: m.s(3),
  },
  purseText: { fontFamily: FONT.bold, fontSize: m.s(16), color: '#FFFFFF' },
  bonuses: { position: 'absolute', top: m.s(96), left: m.s(16), gap: m.s(2) },
  bonus: { fontFamily: FONT.bold, fontSize: m.s(13), color: '#FFC83D', ...shadow },
  // Below the name plates down to the bottom edge.
  main: { position: 'absolute', top: m.s(64), left: 0, right: 0, bottom: m.s(12), alignItems: 'center', gap: m.s(8) },
  scroll: { alignSelf: 'stretch', flexShrink: 1 },
  scrollInner: { flexGrow: 1, alignItems: 'center', justifyContent: 'space-between', gap: m.s(8) },
  // Same spot as before: 24% down the screen.
  summary: { alignItems: 'center', marginTop: Math.max(0, m.height * 0.24 - m.s(64)) },
  kills: { fontFamily: FONT.bold, fontSize: m.s(64), color: '#FFFFFF', ...shadow },
  killsLabel: { fontFamily: FONT.bold, fontSize: m.s(14), letterSpacing: m.s(3), color: 'rgba(255,255,255,0.85)', ...shadow, marginTop: m.s(-8) },
  best: { fontFamily: FONT.bold, fontSize: m.s(18), color: '#FFD23F', ...shadow, marginTop: m.s(4) },
  breakdown: { alignSelf: 'stretch', alignItems: 'center', gap: m.s(8) },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: m.s(36), rowGap: m.s(4), paddingHorizontal: m.s(16) },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: FONT.bold, fontSize: m.s(20), ...shadow },
  statLabel: { fontFamily: FONT.semi, fontSize: m.s(11), letterSpacing: m.s(1), color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(10), width: '50%' },
  lvl: {
    width: m.s(38),
    height: m.s(38),
    borderRadius: m.s(19),
    backgroundColor: '#7B5CE0',
    borderWidth: 3,
    borderColor: '#F7C948',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lvlText: { fontFamily: FONT.bold, fontSize: m.s(17), color: '#FFFFFF' },
  lvlBurst: { position: 'absolute', width: m.s(60), height: m.s(60), borderRadius: m.s(30), borderWidth: 4, borderColor: '#FFD23F' },
  xpTrack: { flex: 1, height: m.s(14), borderRadius: m.s(7), backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1.5, borderColor: '#000000', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: m.s(6), backgroundColor: '#8E6CEF' },
  xpGain: { flexShrink: 0, fontFamily: FONT.bold, fontSize: m.s(14), color: '#C9B6FF', ...shadow },
  levelUp: { position: 'absolute', right: m.s(-110), fontFamily: FONT.bold, fontSize: m.s(18), color: '#FFD23F', ...shadow },
  buttons: { flexDirection: 'row', gap: m.s(12), maxWidth: '100%', paddingHorizontal: m.s(16) },
  btn: { minWidth: m.s(150), flexShrink: 1 },
}));
