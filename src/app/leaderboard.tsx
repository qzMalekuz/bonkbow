import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { HapticTouchable } from '@/components/haptic-touchable';
import { COLORS } from '@/game/constants';
import { useGameStore } from '@/game/store';
import { shortAddress } from '@/solana/config';
import { fetchLeaderboard, type LeaderboardRow } from '@/utils/scores';
import { isSupabaseConfigured } from '@/utils/supabase';

// Global best-run leaderboard keyed by wallet address (the account IS the
// wallet). Your own row is highlighted; your local best shows even offline.
export default function LeaderboardScreen() {
  const { account } = useMobileWallet();
  const highScore = useGameStore((s) => s.highScore);
  const streak = useGameStore((s) => s.streak);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh path (user-initiated, so the spinner is fine).
  const load = useCallback(async () => {
    setRefreshing(true);
    setRows(await fetchLeaderboard(50));
    setRefreshing(false);
  }, []);

  // Initial fetch: no synchronous state writes inside the effect body.
  useEffect(() => {
    let alive = true;
    fetchLeaderboard(50).then((r) => {
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
        <HapticTouchable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </HapticTouchable>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      <View style={styles.meRow}>
        <Stat label="Your best" value={String(highScore)} />
        <Stat label="Day streak" value={String(streak)} />
        <Stat label="You" value={mine ? shortAddress(mine) : 'No wallet'} />
      </View>

      {!isSupabaseConfigured ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.muted}>The global board needs Supabase configured (README → Services).</Text>
        </View>
      ) : rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.arrow} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => r.wallet_address ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.arrow} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No wallet-linked runs yet. Sign in with your wallet and play vs AI.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = !!mine && item.wallet_address === mine;
            return (
              <View style={[styles.row, isMe && styles.rowMe]}>
                <Text style={[styles.rank, index < 3 && { color: COLORS.arrow }]}>{index + 1}</Text>
                <Text style={styles.addr}>{item.wallet_address ? shortAddress(item.wallet_address, 6) : '—'}</Text>
                {isMe && <Text style={styles.you}>YOU</Text>}
                <Text style={styles.best}>{item.best}</Text>
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
