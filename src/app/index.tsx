import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { StaggerIn } from '@/components/stagger-in';
import { WalletButton } from '@/solana/WalletButton';
import { useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { COLORS } from '@/game/constants';
import { getSkin } from '@/game/skins';

// Main menu: two modes + shop. Playing vs AI never requires a wallet; online
// and the shop sign you in with your wallet when you tap them.
export default function HomeScreen() {
  const highScore = useGameStore((s) => s.highScore);
  const streak = useGameStore((s) => s.streak);
  const skin = getSkin(useGameStore((s) => s.equippedSkin));

  const go = (path: '/game?mode=ai' | '/lobby' | '/shop' | '/leaderboard') => {
    haptic.release();
    router.push(path);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.wordmark}>MONOLITH</Text>
        <HapticTouchable onPress={() => router.push('/settings')} hitSlop={12}>
          <Ionicons name="settings-outline" size={26} color="#FFFFFF" />
        </HapticTouchable>
      </View>

      <StaggerIn style={styles.content}>
        <Text style={styles.title}>Stickman{'\n'}Archery</Text>
        <Text style={styles.subtitle}>Drag back to draw. Release to fire. Headshots kill.</Text>
        <View style={styles.statsRow}>
          <Stat label="Best" value={String(highScore)} />
          <Stat label="Streak" value={`${streak}d`} />
          <Stat label="Skin" value={skin.name} />
        </View>
      </StaggerIn>

      <View style={styles.footer}>
        <HapticTouchable style={styles.playButton} onPress={() => go('/game?mode=ai')}>
          <Ionicons name="play" size={22} color="#0B0B0F" />
          <Text style={styles.playText}>Play vs AI</Text>
        </HapticTouchable>
        <View style={styles.row}>
          <HapticTouchable style={styles.secondary} onPress={() => go('/lobby')}>
            <Ionicons name="people-outline" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryText}>Multiplayer</Text>
          </HapticTouchable>
          <HapticTouchable style={styles.secondary} onPress={() => go('/shop')}>
            <Ionicons name="shirt-outline" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryText}>Shop</Text>
          </HapticTouchable>
          <HapticTouchable style={styles.secondary} onPress={() => go('/leaderboard')}>
            <Ionicons name="podium-outline" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryText}>Ranks</Text>
          </HapticTouchable>
        </View>
        <WalletButton />
      </View>
    </SafeAreaView>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  wordmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  title: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', lineHeight: 56 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 24 },
  statsRow: { flexDirection: 'row', gap: 28, marginTop: 16 },
  stat: { gap: 2 },
  statValue: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.arrow,
    borderRadius: 16,
    paddingVertical: 18,
  },
  playText: { color: '#0B0B0F', fontSize: 19, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 12 },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  secondaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
