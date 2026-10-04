import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Stage, type Actor } from '@/game3d/Stage';
import { arenaTheme } from '@/game3d/themes';
import { randomSeed } from '@/game/maps';
import { layoutFor } from '@/game3d/world';
import { DEFAULT_LOADOUT, lookFor, randomLoadout, type Loadout } from '@/game/cosmetics';
import { mulberry32 } from '@/game/rng';
import { useGameStore, levelOf } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { FONT, TIPS } from '@/ui/kit';

// Matchmaking / VS screen: you on the left, a VS badge in the middle, and an
// opponent slot that searches, then reveals the rival dropping into the
// colosseum. Picks the duel's seed (and so its map) and hands everything to
// /game.

const RIVAL_NAMES = [
  'ShadowQuiver',
  'Hedgehog in Sneakers',
  'BowBandit',
  'Ctg',
  'NockNorris',
  'Robin Hoodie',
  'ArrowDynamic',
  'Legolasagna',
  'StringTheory',
  'Feather Fury',
  'HeadshotHank',
  'Twang',
];

export default function MatchScreen() {
  useScreenMusic('menu');
  const params = useLocalSearchParams<{ mode?: string; code?: string; role?: string; seed?: string }>();
  const online = params.mode === 'online';
  const loadout = useGameStore((s) => s.loadout);
  const xp = useGameStore((s) => s.xp);
  const me = useMemo(() => lookFor(loadout), [loadout]);

  // Everything about the match is decided up front from one seed.
  const [match] = useState(() => {
    // The duel happens on my chosen map (online, the host's: it's in the room's seed).
    const seed = params.seed ? Number(params.seed) : randomSeed(useGameStore.getState().equippedMap);
    const rnd = mulberry32(seed ^ 0xa11ce);
    // Online, the real opponent's style arrives over the room channel in-game.
    const rivalLoadout: Loadout = online ? DEFAULT_LOADOUT : randomLoadout(rnd);
    return {
      seed,
      rivalLoadout,
      rivalName: online ? 'Opponent' : RIVAL_NAMES[Math.floor(rnd() * RIVAL_NAMES.length)],
      rivalLevel: Math.max(1, levelOf(xp).level + Math.floor(rnd() * 5) - 2),
      searchMs: online ? 1100 : 1700 + rnd() * 1500,
      tip: TIPS[Math.floor(rnd() * TIPS.length)],
    };
  });
  const rival = useMemo(() => lookFor(match.rivalLoadout), [match]);
  const arena = arenaTheme(match.seed, layoutFor(match.seed, 0).theme);
  const [found, setFound] = useState(false);

  useEffect(() => {
    playSfx('search_loop');
    const loop = setInterval(() => playSfx('search_loop'), 1600);
    const t1 = setTimeout(() => {
      clearInterval(loop);
      setFound(true);
      playSfx('match_found');
      haptic.matchFound();
      setTimeout(() => playSfx('vs_slam'), 250);
    }, match.searchMs);
    const t2 = setTimeout(() => {
      const q = new URLSearchParams({
        mode: online ? 'online' : 'ai',
        seed: String(match.seed),
        rivalHead: match.rivalLoadout.head,
        rivalBow: match.rivalLoadout.bow,
        rivalTrail: match.rivalLoadout.trail,
        rivalName: match.rivalName,
        ...(online ? { code: params.code ?? '', role: params.role ?? 'host' } : {}),
      });
      router.replace(`/game?${q.toString()}`);
    }, match.searchMs + 2600);
    return () => {
      clearInterval(loop);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [match, online, params.code, params.role]);

  const actors = useMemo<Actor[]>(
    () => [
      { look: me, x: -1.5, facing: 1, performance: 'ready' },
      { look: rival, x: 1.5, facing: -1, performance: found ? 'dropIn' : 'idle', hidden: !found },
    ],
    [me, rival, found],
  );

  return (
    <View style={styles.root}>
      <Stage theme="colosseum" camera={{ x: 0, y: 1.9, z: 5.4, lookX: 0, lookY: 1.35, fov: 38, drift: 0.15 }} actors={actors} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <Animated.View entering={FadeInDown.duration(400)} style={[styles.plate, styles.plateLeft]}>
        <Text style={styles.plateName}>You</Text>
        <Text style={styles.plateLevel}>Lv {levelOf(xp).level}</Text>
      </Animated.View>

      {found ? (
        <Animated.View entering={FadeInRight.duration(350)} style={[styles.plate, styles.plateRight]}>
          <Text style={styles.plateName} numberOfLines={1}>
            {match.rivalName}
          </Text>
          {!online && <Text style={styles.plateLevel}>Lv {match.rivalLevel}</Text>}
        </Animated.View>
      ) : (
        <View style={styles.searching}>
          <PaperPlaneSpinner />
          <Text style={styles.searchText}>Searching for an opponent</Text>
        </View>
      )}

      <VsBadge slammed={found} />

      {found && (
        <Animated.View entering={FadeIn.delay(500).duration(400)} style={styles.arenaTag}>
          <Text style={styles.arenaLabel}>ARENA</Text>
          <Text style={styles.arenaName}>{arena.name}</Text>
        </Animated.View>
      )}

      <Text style={styles.tip}>{match.tip}</Text>
    </View>
  );
}

// "VS" coin: idles with a gentle pulse, then slams in bigger when matched.
function VsBadge({ slammed }: { slammed: boolean }) {
  const pulse = useSharedValue(1);
  const slam = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1);
  }, [pulse]);
  useEffect(() => {
    if (slammed) slam.value = withSequence(withTiming(1.9, { duration: 120 }), withTiming(1.25, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [slammed, slam]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value * slam.value }] }));
  return (
    <Animated.View entering={ZoomIn.duration(240)} style={[styles.vs, style]}>
      <Svg width={74} height={74} viewBox="0 0 74 74" style={StyleSheet.absoluteFill}>
        <Circle cx={37} cy={37} r={34} fill="#F7A21B" stroke="#B85C00" strokeWidth={4} />
        <Circle cx={37} cy={37} r={27} fill="#FFC23D" stroke="#FFE08A" strokeWidth={2} />
      </Svg>
      <Text style={styles.vsText}>VS</Text>
    </Animated.View>
  );
}

// Folded paper-plane arrowhead circling inside a two-tone ring.
function PaperPlaneSpinner() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.linear }), -1);
  }, [spin]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={styles.spinner}>
      <Animated.View style={[StyleSheet.absoluteFill, ring]}>
        <Svg width={84} height={84} viewBox="0 0 84 84">
          <Circle cx={42} cy={42} r={34} stroke="rgba(255,255,255,0.4)" strokeWidth={5} fill="none" />
          <Path d="M42 8 A34 34 0 0 1 76 42" stroke="#FF9F1C" strokeWidth={5} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={40} height={40} viewBox="0 0 44 44">
        <Path d="M6 30 L34 6 L30 34 L20 26 Z" fill="#F2F2F2" />
        <Path d="M6 30 L20 26 L30 34 Z" fill="#BDBDBD" />
      </Svg>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.75)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 4,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  plate: {
    position: 'absolute',
    top: 18,
    backgroundColor: '#0B0B0F',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 6,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  plateLeft: { left: 20 },
  plateRight: { right: 20, justifyContent: 'flex-end' },
  plateName: { fontFamily: FONT.bold, fontSize: 20, color: '#FFFFFF', maxWidth: 220 },
  plateLevel: { fontFamily: FONT.semi, fontSize: 13, color: '#F7C948' },
  searching: { position: 'absolute', right: '12%', top: '30%', alignItems: 'center', gap: 10 },
  searchText: { fontFamily: FONT.bold, fontSize: 19, color: '#FFFFFF', ...shadow },
  spinner: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  vs: { position: 'absolute', alignSelf: 'center', top: '38%', width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  vsText: { fontFamily: FONT.bold, fontSize: 28, color: '#FFFFFF', ...shadow, textShadowColor: '#9A4A00' },
  arenaTag: { position: 'absolute', alignSelf: 'center', top: '62%', alignItems: 'center' },
  arenaLabel: { fontFamily: FONT.semi, fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,0.75)', ...shadow },
  arenaName: { fontFamily: FONT.bold, fontSize: 22, color: '#FFFFFF', ...shadow },
  tip: {
    position: 'absolute',
    bottom: 14,
    left: 60,
    right: 60,
    textAlign: 'center',
    fontFamily: FONT.semi,
    fontSize: 14,
    color: '#FFFFFF',
    ...shadow,
  },
});
