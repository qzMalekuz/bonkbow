import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { StaggerIn } from '@/components/stagger-in';
import { WalletButton } from '@/solana/WalletButton';
import { useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { COLORS } from '@/game/constants';
import { getSkin } from '@/game/skins';
import { MenuScene } from '@/game3d/MenuScene';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';

// Main menu: two modes + shop. Playing vs AI never requires a wallet; online
// and the shop sign you in with your wallet when you tap them.
export default function HomeScreen() {
  useScreenMusic('menu');
  const highScore = useGameStore((s) => s.highScore);
  const streak = useGameStore((s) => s.streak);
  const skin = getSkin(useGameStore((s) => s.equippedSkin));

  // Gentle pulse on the Play button so the primary action draws the eye.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const go = (path: '/game?mode=ai' | '/lobby' | '/shop' | '/leaderboard') => {
    haptic.release();
    router.push(path);
  };

  return (
    <View style={styles.container}>
      <MenuScene skin={skin} focusRight />
      {/* Left-side scrim so the menu reads over the 3D scene */}
      <View style={styles.scrim} pointerEvents="none" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.left}>
          <StaggerIn style={styles.content}>
            <Text style={styles.wordmark}>STICKCHERS</Text>
            <Text style={styles.title}>Stickman Archery</Text>
            <Text style={styles.subtitle}>Drag back to draw. Release to fire. Headshots kill.</Text>
            <View style={styles.statsRow}>
              <Stat label="Best" value={String(highScore)} />
              <Stat label="Streak" value={`${streak}d`} />
              <Stat label="Skin" value={skin.name} />
            </View>
          </StaggerIn>

          <View style={styles.footer}>
            <Animated.View style={pulseStyle}>
              <HapticTouchable style={styles.playButton} onPress={() => go('/game?mode=ai')} sound="ui_open">
                <Ionicons name="play" size={22} color="#0B0B0F" />
                <Text style={styles.playText}>Play vs AI</Text>
              </HapticTouchable>
            </Animated.View>
            <View style={styles.row}>
              <HapticTouchable style={styles.secondary} onPress={() => go('/lobby')}>
                <Ionicons name="people-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryText}>Multiplayer</Text>
              </HapticTouchable>
              <HapticTouchable style={styles.secondary} onPress={() => go('/shop')}>
                <Ionicons name="shirt-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryText}>Shop</Text>
              </HapticTouchable>
              <HapticTouchable style={styles.secondary} onPress={() => go('/leaderboard')}>
                <Ionicons name="podium-outline" size={18} color="#FFFFFF" />
                <Text style={styles.secondaryText}>Ranks</Text>
              </HapticTouchable>
            </View>
          </View>
        </View>

        <View style={styles.topRight}>
          <View style={styles.wallet}>
            <WalletButton />
          </View>
          <HapticTouchable style={styles.gear} onPress={() => router.push('/settings')} hitSlop={12} sound="ui_open">
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </HapticTouchable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  scrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '55%',
    backgroundColor: 'rgba(8,10,24,0.45)',
  },
  safe: { flex: 1, flexDirection: 'row' },
  left: { width: '48%', maxWidth: 440, paddingHorizontal: 24, paddingVertical: 14, justifyContent: 'space-between' },
  content: { gap: 6 },
  wordmark: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 4 },
  title: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 6 },
  stat: { gap: 0 },
  statValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  footer: { gap: 10 },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.arrow,
    borderRadius: 14,
    paddingVertical: 14,
  },
  playText: { color: '#0B0B0F', fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  secondary: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(20,22,44,0.6)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  secondaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  topRight: { position: 'absolute', top: 12, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  wallet: { width: 220 },
  gear: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
