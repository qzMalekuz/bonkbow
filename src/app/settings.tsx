import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { usePostHog } from 'posthog-react-native';
import { useWalletAuth } from '@/solana/auth';
import { HapticTouchable } from '@/components/haptic-touchable';
import { checkForUpdateAndReload } from '@/hooks/useOTAUpdates';
import { useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { COLORS } from '@/game/constants';
import { CLUSTER, shortAddress } from '@/solana/config';
import { LEGAL_URLS, SUPPORT_EMAIL } from '@/utils/legal';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';

export default function SettingsScreen() {
  const posthog = usePostHog();
  const { address, signOut } = useWalletAuth();
  const hapticsEnabled = useGameStore((s) => s.hapticsEnabled);
  const vibrationEnabled = useGameStore((s) => s.vibrationEnabled);
  const setHaptics = useGameStore((s) => s.setHaptics);
  const setVibration = useGameStore((s) => s.setVibration);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const musicEnabled = useGameStore((s) => s.musicEnabled);
  const setSound = useGameStore((s) => s.setSound);
  const setMusic = useGameStore((s) => s.setMusic);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session)).catch(() => {});
  }, []);

  // Guarded opener: mailto/http can throw if no handler is configured.
  const openUrl = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Unavailable', "Couldn't open that link on this device.");
    } catch {
      Alert.alert('Unavailable', "Couldn't open that link on this device.");
    }
  };

  const toggleHaptics = (on: boolean) => {
    setHaptics(on);
    playSfx('ui_toggle');
    if (on) haptic.release(); // demo the setting as it turns on
  };
  const toggleVibration = (on: boolean) => {
    setVibration(on);
    playSfx('ui_toggle');
    if (on) haptic.takeHit();
  };
  const toggleSound = (on: boolean) => {
    setSound(on);
    if (on) playSfx('ui_toggle'); // store is updated first, so this is audible
  };
  const toggleMusic = (on: boolean) => {
    setMusic(on);
    playSfx('ui_toggle');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your leaderboard entries and account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
                method: 'POST',
                headers: {
                  apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
                  Authorization: `Bearer ${session.access_token}`,
                },
              });
              if (!res.ok) throw new Error(String(res.status));
              await supabase.auth.signOut();
              posthog.reset();
              haptic.warning();
              router.replace('/');
            } catch {
              Alert.alert('Error', 'Could not delete your account. Please try again or contact support.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HapticTouchable onPress={() => router.back()} style={styles.backButton} hitSlop={12} sound="ui_back">
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </HapticTouchable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Audio</Text>
        <View style={styles.group}>
          <ToggleRow label="Sound effects" hint="Bow, hits, button clicks" value={soundEnabled} onChange={toggleSound} />
          <Divider />
          <ToggleRow label="Music" hint="Menu, battle and shop tracks" value={musicEnabled} onChange={toggleMusic} />
        </View>

        <Text style={styles.section}>Feedback</Text>
        <View style={styles.group}>
          <ToggleRow label="Haptics" hint="Bow draw ticks, release, hits" value={hapticsEnabled} onChange={toggleHaptics} />
          <Divider />
          <ToggleRow label="Vibration" hint="Kills, taking damage, game over" value={vibrationEnabled} onChange={toggleVibration} />
        </View>

        <Text style={styles.section}>Wallet · {CLUSTER.name}</Text>
        <View style={styles.group}>
          {address ? (
            <MenuRow
              label={`Sign out ${shortAddress(address)}`}
              onPress={async () => {
                await signOut().catch(() => {});
                haptic.tap();
                router.replace('/');
              }}
            />
          ) : (
            <Text style={styles.empty}>Not signed in. Tap “Sign in with wallet” on the home screen.</Text>
          )}
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.group}>
          <MenuRow label="Privacy Policy" onPress={() => openUrl(LEGAL_URLS.privacy)} />
          <Divider />
          <MenuRow label="Terms & Conditions" onPress={() => openUrl(LEGAL_URLS.terms)} />
          <Divider />
          <MenuRow label="Get Help" onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)} />
          <Divider />
          <MenuRow label="Check for Updates" onPress={checkForUpdateAndReload} />
          {hasSession && (
            <>
              <Divider />
              <MenuRow label="Delete Account" onPress={handleDeleteAccount} destructive />
            </>
          )}
        </View>

        <Text style={styles.version}>
          v{Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? 'dev'})
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowText}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.arrow }} />
    </View>
  );
}

function MenuRow({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <HapticTouchable style={styles.row} onPress={onPress}>
      <Text style={[styles.rowText, destructive && { color: COLORS.enemy }]}>{label}</Text>
      <Text style={styles.arrow}>›</Text>
    </HapticTouchable>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { marginRight: 8 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  scroll: { padding: 16, gap: 8, paddingBottom: 40 },
  section: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginLeft: 4,
  },
  group: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { color: '#FFFFFF', fontSize: 16 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  arrow: { color: 'rgba(255,255,255,0.5)', fontSize: 20 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 16 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 14, padding: 16 },
  version: { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 24 },
});
