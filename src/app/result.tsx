import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { lookFor, sanitizeLoadout } from '@/game/cosmetics';
import { levelOf, useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { duckMusic, playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { FONT, GameButton, LaurelBadge } from '@/ui/kit';

// Win / lose ceremony in the colosseum: the winner laughs and celebrates,
// the loser sulks and stomps; coins count up and the XP bar fills (with a
// level-up burst when it rolls over).
export default function ResultScreen() {
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
    prevXp?: string;
    rivalName?: string;
    rivalHead?: string;
    rivalBow?: string;
    rivalTrail?: string;
  }>();
  const online = p.mode === 'online';
  const won = p.outcome === 'win' || p.outcome === 'left';
  const score = Number(p.score ?? 0);
  const shots = Number(p.shots ?? 0);
  const hits = Number(p.hits ?? 0);
  const headshots = Number(p.headshots ?? 0);
  const xpGain = Number(p.xp ?? 0);
  const coinGain = Number(p.coins ?? 0);
  const prevXp = Number(p.prevXp ?? 0);
  const highScore = useGameStore((s) => s.highScore);
  const coins = useGameStore((s) => s.coins);
  const loadout = useGameStore((s) => s.loadout);
  const me = useMemo(() => lookFor(loadout), [loadout]);
  const rival = useMemo(() => lookFor(sanitizeLoadout({ head: p.rivalHead, bow: p.rivalBow, trail: p.rivalTrail })), [p.rivalHead, p.rivalBow, p.rivalTrail]);

  // vs AI the run always ends with me down, but kills make it a good run.
  const iWon = online ? won : false;
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
    router.replace(online ? '/lobby' : '/match?mode=ai');
  };

  return (
    <View style={styles.root}>
      <Stage theme="colosseum" camera={{ x: 0, y: 1.75, z: 4.6, lookX: 0, lookY: 1.25, fov: 40, drift: 0.12 }} actors={actors} />
      <LinearGradient colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Name plates with laurel badges */}
      <Animated.View entering={FadeInDown.duration(400)} style={[styles.side, styles.left]}>
        <View style={styles.nameBox}>
          <Text style={styles.name}>You</Text>
        </View>
        <Animated.View entering={ZoomIn.delay(500).duration(240)}>
          <LaurelBadge label={iWon ? 'VICTORY!' : 'Defeat'} win={iWon} />
        </Animated.View>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(400)} style={[styles.side, styles.right]}>
        <Animated.View entering={ZoomIn.delay(650).duration(240)}>
          <LaurelBadge label={iWon ? 'Defeat' : 'VICTORY!'} win={!iWon} />
        </Animated.View>
        <View style={[styles.nameBox, { alignItems: 'flex-end' }]}>
          <Text style={styles.name} numberOfLines={1}>
            {p.rivalName ?? 'Rival'}
          </Text>
        </View>
      </Animated.View>

      <CoinCounter from={coins - coinGain} to={coins} />

      {/* Centre: run summary */}
      {!online && (
        <Animated.View entering={FadeIn.delay(700).duration(400)} style={styles.summary}>
          <Text style={styles.kills}>{score}</Text>
          <Text style={styles.killsLabel}>{score === 1 ? 'RIVAL DOWN' : 'RIVALS DOWN'}</Text>
          {score > 0 && score >= highScore && <Text style={styles.best}>NEW BEST!</Text>}
        </Animated.View>
      )}

      {/* Bottom: stats, XP, buttons */}
      <View style={styles.bottom}>
        <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.stats}>
          <Stat label="Accuracy" value={shots ? `${Math.round((hits / shots) * 100)}%` : '–'} />
          <Stat label="Headshots" value={String(headshots)} />
          <Stat label="Coins" value={`+${coinGain}`} color="#FFC83D" />
        </Animated.View>
        <XpBar prevXp={prevXp} gain={xpGain} />
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
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Coin purse that counts up from the old balance.
function CoinCounter({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (to <= from) return;
    let v = from;
    const step = Math.max(1, Math.round((to - from) / 20));
    const start = setTimeout(() => {
      playSfx('coin_gain');
      const id = setInterval(() => {
        v = Math.min(to, v + step);
        setShown(v);
        if (v >= to) clearInterval(id);
      }, 45);
    }, 900);
    return () => clearTimeout(start);
  }, [from, to]);
  return (
    <Animated.View entering={FadeIn.delay(300)} style={styles.purse}>
      <Text style={styles.purseText}>{shown}</Text>
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Circle cx={13} cy={13} r={11} fill="#F7A21B" stroke="#B85C00" strokeWidth={2} />
        <Circle cx={13} cy={13} r={7} fill="#FFC83D" />
        <Path d="M10 9.5h6M13 9.5v7" stroke="#B85C00" strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// XP bar that fills from the old total to the new one, rolling over levels.
function XpBar({ prevXp, gain }: { prevXp: number; gain: number }) {
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
        <Text style={styles.lvlText}>{level}</Text>
        <Animated.View style={[styles.lvlBurst, burstStyle]} />
      </Animated.View>
      <View style={styles.xpTrack}>
        <Animated.View style={[styles.xpFill, fillStyle]} />
      </View>
      <Text style={styles.xpGain}>+{gain} XP</Text>
      {after.level > before.level && (
        <Animated.Text entering={ZoomIn.delay(1800).duration(240)} style={styles.levelUp}>
          LEVEL UP!
        </Animated.Text>
      )}
    </Animated.View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  side: { position: 'absolute', top: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  left: { left: 16 },
  right: { right: 16 },
  nameBox: { backgroundColor: '#0B0B0F', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 6, minWidth: 150 },
  name: { fontFamily: FONT.bold, fontSize: 18, color: '#FFFFFF', maxWidth: 200 },
  purse: {
    position: 'absolute',
    top: 62,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0B0B0F',
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: 8,
    paddingVertical: 3,
  },
  purseText: { fontFamily: FONT.bold, fontSize: 16, color: '#FFFFFF' },
  summary: { position: 'absolute', top: '24%', alignSelf: 'center', alignItems: 'center' },
  kills: { fontFamily: FONT.bold, fontSize: 64, color: '#FFFFFF', ...shadow },
  killsLabel: { fontFamily: FONT.bold, fontSize: 14, letterSpacing: 3, color: 'rgba(255,255,255,0.85)', ...shadow, marginTop: -8 },
  best: { fontFamily: FONT.bold, fontSize: 18, color: '#FFD23F', ...shadow, marginTop: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 36 },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: FONT.bold, fontSize: 20, ...shadow },
  statLabel: { fontFamily: FONT.semi, fontSize: 11, letterSpacing: 1, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '50%' },
  lvl: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#7B5CE0',
    borderWidth: 3,
    borderColor: '#F7C948',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lvlText: { fontFamily: FONT.bold, fontSize: 17, color: '#FFFFFF' },
  lvlBurst: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: '#FFD23F' },
  xpTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1.5, borderColor: '#000000', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 6, backgroundColor: '#8E6CEF' },
  xpGain: { fontFamily: FONT.bold, fontSize: 14, color: '#C9B6FF', ...shadow },
  levelUp: { position: 'absolute', right: -110, fontFamily: FONT.bold, fontSize: 18, color: '#FFD23F', ...shadow },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: { minWidth: 150 },
});
