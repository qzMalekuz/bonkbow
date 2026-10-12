import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { COLORS } from '@/game/constants';
import { useGameStore } from '@/game/store';
import { shortAddress } from '@/solana/config';
import { fetchBestRuns, type RunRow } from '@/utils/scores';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Your best vs-AI runs on this device. The game is offline: nothing is
// uploaded, so the board is personal.
export default function LeaderboardScreen() {
  const styles = useStyles();
  const { s } = useMetrics();
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
      <View style={styles.content}>
        <View style={styles.header}>
          <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
            <Ionicons name="chevron-back" size={s(26)} color="#FFFFFF" />
          </HapticTouchable>
          <Text style={styles.title} numberOfLines={1}>
            Best runs
          </Text>
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
                  <Text style={[styles.rank, index < 3 && { color: COLORS.arrow }]} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                    {index + 1}
                  </Text>
                  <Text style={styles.addr} numberOfLines={1}>
                    {new Date(item.at).toLocaleDateString()}
                  </Text>
                  {top && (
                    <Text style={styles.you} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                      BEST
                    </Text>
                  )}
                  <Text style={styles.best} numberOfLines={1}>
                    {item.score}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((m) => ({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  // Don't stretch the board across a tablet or a 21:9 phone.
  content: { flex: 1, width: '100%', maxWidth: m.s(900), alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: m.s(8), paddingHorizontal: m.s(16), paddingVertical: m.s(12) },
  title: { color: '#FFFFFF', fontSize: m.s(22), fontWeight: '700' },
  meRow: {
    flexDirection: 'row',
    gap: m.s(12),
    justifyContent: 'space-between',
    marginHorizontal: m.s(16),
    marginBottom: m.s(8),
    padding: m.s(16),
    borderRadius: m.s(16),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stat: { gap: m.s(2), flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: m.s(20), fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: m.s(11), textTransform: 'uppercase', letterSpacing: m.s(1) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: m.s(24), gap: m.s(10) },
  muted: { color: 'rgba(255,255,255,0.6)', fontSize: m.s(15), textAlign: 'center', lineHeight: m.s(22) },
  list: { paddingHorizontal: m.s(16), paddingBottom: m.s(32), gap: m.s(6) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(12),
    paddingVertical: m.s(12),
    paddingHorizontal: m.s(14),
    borderRadius: m.s(12),
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowMe: { backgroundColor: 'rgba(244,162,97,0.15)', borderWidth: 1, borderColor: COLORS.arrow },
  rank: { width: m.s(28), fontSize: m.s(14), color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontVariant: ['tabular-nums'] },
  addr: { flex: 1, color: '#FFFFFF', fontSize: m.s(15), fontVariant: ['tabular-nums'] },
  you: { color: COLORS.arrow, fontSize: m.s(10), fontWeight: '900', letterSpacing: m.s(1) },
  best: { color: '#FFFFFF', fontSize: m.s(18), fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
