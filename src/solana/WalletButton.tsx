import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { shortAddress } from '@/solana/config';
import { useWalletAuth } from '@/solana/auth';
import { haptic } from '@/game/haptics';
import { isSupabaseConfigured } from '@/utils/supabase';

// "Sign in with wallet": MWA authorize → Sign in with Solana → Supabase
// session. Tapping again when signed in signs out (wallet + session).
export function WalletButton() {
  const { address, session, signingIn, signIn, signOut } = useWalletAuth();
  const signedIn = !!address && (session != null || !isSupabaseConfigured);

  const onPress = async () => {
    if (signingIn) return;
    try {
      if (signedIn) {
        await signOut();
        haptic.tap();
      } else {
        await signIn();
        haptic.success();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|declin|reject/i.test(msg)) {
        Alert.alert(
          'Wallet sign-in failed',
          /wallet|MWA|intent|activity/i.test(msg)
            ? 'Install a Solana Mobile wallet (Phantom, Solflare or Seed Vault) and try again.'
            : msg,
        );
      }
    }
  };

  return (
    <HapticTouchable style={styles.button} onPress={onPress}>
      {signingIn ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          <Ionicons name={signedIn ? 'wallet' : 'wallet-outline'} size={18} color="#FFFFFF" />
          <Text style={styles.label}>{signedIn && address ? shortAddress(address) : 'Sign in with wallet'}</Text>
        </>
      )}
    </HapticTouchable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 50,
  },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
