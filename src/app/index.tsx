import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { StaggerIn } from '@/components/stagger-in';
import { WalletButton } from '@/solana/WalletButton';
import { levelOf, useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { lookFor } from '@/game/cosmetics';
import { Stage, type Actor, type StageCamera } from '@/game3d/Stage';
import { Turntable, useSpinGesture } from '@/game3d/Turntable';
import { CoinPill, FONT, GameButton, TIPS } from '@/ui/kit';
import { NameModal } from '@/ui/NameModal';
import { Text } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Big close-up of the player's stickman in the colosseum, running through a
// reel of emotions and actions behind the menu.
const HOME_CAMERA: StageCamera = { x: 1.3, y: 1.25, z: 5.4, lookX: 1.15, lookY: 1.0, fov: 36, drift: 0.1 };

// Main menu. Every duel is against the AI and costs a SOL entry fee, paid on
// the match screen; the shop and the duel fee connect your wallet when needed.
export default function HomeScreen() {
  useScreenMusic('menu');
  const styles = useStyles();
  const { s } = useMetrics();
  const highScore = useGameStore((s) => s.highScore);
  const streak = useGameStore((s) => s.streak);
  const games = useGameStore((s) => s.gamesPlayed);
  const coins = useGameStore((s) => s.coins);
  const xp = useGameStore((s) => s.xp);
  const loadout = useGameStore((s) => s.loadout);
  const playerName = useGameStore((s) => s.playerName);
  // Name editor: opens by itself on first launch (once the save has loaded
  // and still has no name), or from the name pill.
  const [naming, setNaming] = useState<'first' | 'edit' | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      t = setTimeout(() => {
        if (!useGameStore.getState().playerName) setNaming('first');
      }, 900);
    };
    const unsub = useGameStore.persist.hasHydrated() ? (ask(), () => {}) : useGameStore.persist.onFinishHydration(ask);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);
  const look = useMemo(() => lookFor(loadout), [loadout]);
  const lvl = levelOf(xp);
  // Drag anywhere off the menu to spin the archer.
  const [spin] = useState(() => new Turntable());
  const spinPan = useSpinGesture(spin);
  const actors = useMemo<Actor[]>(() => [{ look, x: 0, facing: 1, performance: 'mixed', spin }], [look, spin]);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

  // Gentle pulse on the Play button so the primary action draws the eye.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const go = (path: '/match' | '/shop' | '/leaderboard' | '/style') => {
    haptic.release();
    router.push(path);
  };
  // When the header doesn't fit above the buttons (short phone, big system
  // font), Ranks joins Style and Shop on one row to give it room. Measured,
  // and latched per window + font size so the switch can't flip back and forth.
  const { width, height, fontScale } = useWindowDimensions();
  const sizeKey = `${width}x${height}@${fontScale}`;
  const [tightFor, setTightFor] = useState<string | null>(null);
  const tight = tightFor === sizeKey;
  const header = useRef({ view: 0, content: 0 });
  const checkHeader = (part: 'view' | 'content', h: number) => {
    header.current[part] = h;
    const { view, content } = header.current;
    if (!tight && view > 0 && content > view + 1) setTightFor(sizeKey);
  };
  const ranksButton = (
    <GameButton
      label="Ranks"
      color="dark"
      small
      onPress={() => go('/leaderboard')}
      style={styles.flex}
      icon={<Ionicons name="podium" size={s(16)} color="#FFFFFF" />}
    />
  );

  return (
    <View style={styles.container}>
      <Stage theme="colosseum" camera={HOME_CAMERA} actors={actors} />
      <LinearGradient
        colors={['rgba(8,10,24,0.82)', 'rgba(8,10,24,0.4)', 'rgba(8,10,24,0)']}
        start={{ x: 1, y: 0.5 }}
        end={{ x: 0.45, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={styles.bottomShade} pointerEvents="none" />
      <GestureDetector gesture={spinPan}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <HapticTouchable style={styles.namePill} onPress={() => setNaming('edit')} sound="ui_open" accessibilityLabel="Change your name">
          <Text style={styles.nameText} numberOfLines={1}>
            {playerName || 'Pick a name'}
          </Text>
          <Ionicons name="pencil" size={s(13)} color="rgba(255,255,255,0.7)" />
        </HapticTouchable>
        <View style={styles.tipPill} pointerEvents="none">
          <Text style={styles.tipText} numberOfLines={2}>
            {tip}
          </Text>
        </View>
        <View style={styles.left}>
          {/* The header scrolls only when it has to (a short phone or a large
              system font); the buttons below it always stay on screen. */}
          <ScrollView
            style={styles.header}
            contentContainerStyle={styles.headerInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
            onLayout={(e) => checkHeader('view', e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => checkHeader('content', h)}
          >
            <StaggerIn style={styles.content}>
              <Text style={styles.wordmark}>BONK BOW</Text>
              <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {'They have bows.\nThat’s about it.'}
              </Text>
              <View style={styles.levelRow}>
                <View style={styles.lvlBadge}>
                  <Text style={styles.lvlText}>{lvl.level}</Text>
                </View>
                <View style={styles.xpTrack}>
                  <View style={[styles.xpFill, { width: `${(lvl.into / lvl.need) * 100}%` }]} />
                </View>
                <Text style={styles.xpText}>
                  {lvl.into}/{lvl.need} XP
                </Text>
              </View>
              <View style={styles.statsRow}>
                <Stat label="Best" value={String(highScore)} />
                <Stat label="Duels" value={String(games)} />
                <Stat label="Streak" value={`${streak}d`} />
              </View>
            </StaggerIn>
          </ScrollView>

          <View style={styles.footer}>
            <Animated.View style={pulseStyle}>
              <GameButton
                label="PLAY"
                color="orange"
                onPress={() => go('/match')}
                sound="ui_open"
                icon={<Ionicons name="play" size={s(22)} color="#0B0B0F" />}
                textStyle={styles.playText}
              />
            </Animated.View>
            <View style={styles.row}>
              <GameButton
                label="Style"
                color="purple"
                small
                onPress={() => go('/style')}
                style={styles.flex}
                icon={<Ionicons name="shirt" size={s(16)} color="#FFFFFF" />}
              />
              <GameButton
                label="Shop"
                color="green"
                small
                onPress={() => go('/shop')}
                style={styles.flex}
                icon={<Ionicons name="cart" size={s(16)} color="#FFFFFF" />}
              />
              {tight && ranksButton}
            </View>
            {!tight && <View style={styles.row}>{ranksButton}</View>}
          </View>
        </View>

        <View style={styles.topRight}>
          <HapticTouchable onPress={() => go('/shop')} hitSlop={8} accessibilityLabel="Coins: open the shop">
            <CoinPill coins={coins} />
          </HapticTouchable>
          <View style={styles.wallet}>
            <WalletButton />
          </View>
          <HapticTouchable style={styles.gear} onPress={() => router.push('/settings')} hitSlop={12} sound="ui_open">
            <Ionicons name="settings-sharp" size={s(20)} color="#FFFFFF" />
          </HapticTouchable>
        </View>
      </SafeAreaView>
      <NameModal visible={!!naming} firstTime={naming === 'first'} onClose={() => setNaming(null)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 6,
};

const useStyles = makeStyles((m) => ({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  safe: { flex: 1, flexDirection: 'row' },
  left: { width: '44%', maxWidth: m.s(420), marginLeft: 'auto', gap: m.s(8), paddingHorizontal: m.s(24), paddingVertical: m.s(12), paddingTop: m.s(m.compact ? 60 : 70) },
  header: { flexShrink: 1 },
  headerInner: { flexGrow: 1, justifyContent: 'flex-start' },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%' },
  namePill: {
    position: 'absolute',
    top: m.s(12),
    left: m.s(16),
    minWidth: m.s(150),
    maxWidth: m.s(240),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.s(8),
    paddingHorizontal: m.s(16),
    paddingVertical: m.s(6),
    borderRadius: m.s(12),
    backgroundColor: '#000000',
  },
  nameText: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(15), textAlign: 'center', flexShrink: 1 },
  tipPill: { position: 'absolute', left: m.s(16), bottom: m.s(14), width: '48%', paddingHorizontal: m.s(14), paddingVertical: m.s(6), borderRadius: m.s(10), backgroundColor: 'rgba(10,8,20,0.7)' },
  tipText: { fontFamily: FONT.semi, color: '#FFFFFF', fontSize: m.s(12), textAlign: 'center' },
  content: { gap: m.s(4) },
  wordmark: { fontFamily: FONT.semi, color: 'rgba(255,255,255,0.75)', fontSize: m.s(12), letterSpacing: m.s(4) },
  title: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(28), lineHeight: m.s(32), ...shadow },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(8), marginTop: m.s(4) },
  lvlBadge: {
    width: m.s(30),
    height: m.s(30),
    borderRadius: m.s(15),
    backgroundColor: '#7B5CE0',
    borderWidth: 2.5,
    borderColor: '#F7C948',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lvlText: { fontFamily: FONT.bold, fontSize: m.s(14), color: '#FFFFFF' },
  xpTrack: { flex: 1, height: m.s(10), borderRadius: m.s(5), backgroundColor: 'rgba(0,0,0,0.6)', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: m.s(5), backgroundColor: '#8E6CEF' },
  xpText: { flexShrink: 0, fontFamily: FONT.semi, fontSize: m.s(11), color: 'rgba(255,255,255,0.8)' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: m.s(24), rowGap: m.s(4), marginTop: m.s(6) },
  stat: { gap: 0 },
  statValue: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(20), ...shadow },
  statLabel: { fontFamily: FONT.semi, color: 'rgba(255,255,255,0.65)', fontSize: m.s(11), textTransform: 'uppercase', letterSpacing: m.s(1) },
  footer: { marginTop: 'auto', gap: m.s(8) },
  playText: { fontSize: m.s(22), letterSpacing: m.s(2) },
  row: { flexDirection: 'row', gap: m.s(8) },
  flex: { flex: 1 },
  topRight: { position: 'absolute', top: m.s(12), right: m.s(16), flexDirection: 'row', alignItems: 'center', gap: m.s(10) },
  wallet: { width: m.s(m.vw < 760 ? 170 : 200) },
  gear: { width: m.s(40), height: m.s(40), borderRadius: m.s(20), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
}));
