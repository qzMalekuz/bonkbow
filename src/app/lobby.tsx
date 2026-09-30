import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { COLORS } from '@/game/constants';
import { haptic } from '@/game/haptics';
import { useWalletAuth } from '@/solana/auth';
import { cancelRoom, createRoom, joinRoom, useWaitForGuest, type Room } from '@/multiplayer/useRoom';
import { isSupabaseConfigured } from '@/utils/supabase';

// Multiplayer lobby: create a room (get a 6-letter code to share) or join one.
// Requires a wallet session — rooms are tied to the signed-in user.
export default function LobbyScreen() {
  useScreenMusic('menu');
  const { session, signIn, signingIn } = useWalletAuth();
  const [hosting, setHosting] = useState<Room | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const started = useRef(false);
  const start = useCallback((room: Room, role: 'host' | 'guest') => {
    if (started.current) return;
    started.current = true;
    haptic.success();
    router.replace({ pathname: '/game', params: { mode: 'online', code: room.code, role, seed: String(room.seed) } });
  }, []);

  useWaitForGuest(hosting?.code, !!hosting, (room) => start(room, 'host'));

  const requireSession = async () => {
    if (session) return true;
    try {
      await signIn();
      return true;
    } catch {
      return false;
    }
  };

  const onCreate = async () => {
    if (busy) return;
    setBusy('create');
    try {
      if (!(await requireSession())) return;
      const room = await createRoom();
      haptic.release();
      setHosting(room);
    } catch (e) {
      Alert.alert('Could not create room', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async () => {
    if (busy || joinCode.trim().length !== 6) return;
    setBusy('join');
    try {
      if (!(await requireSession())) return;
      const room = await joinRoom(joinCode);
      start(room, 'guest');
    } catch (e) {
      haptic.warning();
      Alert.alert('Could not join', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (!hosting) return;
    haptic.tap();
    Share.share({ message: `Duel me in Stickchers — room code ${hosting.code}` }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </HapticTouchable>
        <Text style={styles.title}>Multiplayer</Text>
      </View>

      {!isSupabaseConfigured ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.muted}>Multiplayer needs Supabase configured (see README → Services).</Text>
        </View>
      ) : hosting ? (
        <View style={styles.center}>
          <Text style={styles.label}>ROOM CODE</Text>
          <Text style={styles.code}>{hosting.code}</Text>
          <Text style={styles.muted}>Share it with a friend. The duel starts when they join.</Text>
          <ActivityIndicator color={COLORS.arrow} style={{ marginTop: 16 }} />
          <HapticTouchable style={styles.primary} onPress={share}>
            <Ionicons name="share-social-outline" size={20} color="#0B0B0F" />
            <Text style={styles.primaryText}>Share code</Text>
          </HapticTouchable>
          <HapticTouchable
            style={styles.secondary}
            onPress={() => {
              const code = hosting.code;
              setHosting(null);
              cancelRoom(code).catch(() => {});
            }}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </HapticTouchable>
        </View>
      ) : (
        <View style={styles.content}>
          {!session && (
            <Text style={styles.muted}>
              {signingIn ? 'Confirm in your wallet…' : 'You’ll sign in with your wallet to create or join a room.'}
            </Text>
          )}

          <HapticTouchable style={styles.primary} onPress={onCreate} disabled={!!busy}>
            {busy === 'create' ? (
              <ActivityIndicator color="#0B0B0F" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={22} color="#0B0B0F" />
                <Text style={styles.primaryText}>Create room</Text>
              </>
            )}
          </HapticTouchable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or join with a code</Text>
            <View style={styles.divider} />
          </View>

          <TextInput
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.input}
            returnKeyType="join"
            onSubmitEditing={onJoin}
          />
          <HapticTouchable
            style={[styles.outline, joinCode.length !== 6 && { opacity: 0.4 }]}
            onPress={onJoin}
            disabled={!!busy || joinCode.length !== 6}
          >
            {busy === 'join' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.outlineText}>Join room</Text>}
          </HapticTouchable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  code: { color: '#FFFFFF', fontSize: 56, fontWeight: '900', letterSpacing: 10, fontVariant: ['tabular-nums'] },
  muted: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  primary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.arrow,
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 16,
  },
  primaryText: { color: '#0B0B0F', fontSize: 18, fontWeight: '800' },
  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14 },
  secondaryText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.3)' },
  dividerText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  input: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 16,
  },
  outline: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 16,
    paddingVertical: 16,
  },
  outlineText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
