import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { COLORS } from '@/game/constants';
import { useGameStore } from '@/game/store';
import { shortAddress } from '@/solana/config';
import { fetchBestRuns, type RunRow } from '@/utils/scores';

// Your best vs-AI runs on this device. The game is offline: nothing is
// uploaded, so the board is personal.
export default function LeaderboardScreen() {
  useScreenMusic('menu');
  const { account } = useMobileWallet();
  const highScore = useGameStore((s) => s.highScore);
  const streak = useGameStore((s) => s.streak);
  const [rows, setRows] = useState<RunRow[] | null>(null);

  // Initial read: no synchronous state writes inside the effect body.
  useEffect(() => {
    let alive = true;
    fetchBestRuns().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mine = account?.address;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </HapticTouchable>
        <Text style={styles.title}>Best runs</Text>
      </View>

      <View style={styles.meRow}>
        <Stat label="Your best" value={String(highScore)} />
        <Stat label="Day streak" value={String(streak)} />
        <Stat label="You" value={mine ? shortAddress(mine) : 'No wallet'} />
      </View>

      {rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.arrow} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.at)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No runs yet. Play a duel and your best ones land here.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const top = item.score === highScore && index === 0;
            return (
              <View style={[styles.row, top && styles.rowMe]}>
                <Text style={[styles.rank, index < 3 && { color: COLORS.arrow }]}>{index + 1}</Text>
                <Text style={styles.addr}>{new Date(item.at).toLocaleDateString()}</Text>
                {top && <Text style={styles.you}>BEST</Text>}
                <Text style={styles.best}>{item.score}</Text>
              </View>
            );
          }}
        />
      )}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  meRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stat: { gap: 2, flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  muted: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowMe: { backgroundColor: 'rgba(244,162,97,0.15)', borderWidth: 1, borderColor: COLORS.arrow },
  rank: { width: 28, color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontVariant: ['tabular-nums'] },
  addr: { flex: 1, color: '#FFFFFF', fontSize: 15, fontVariant: ['tabular-nums'] },
  you: { color: COLORS.arrow, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  best: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
