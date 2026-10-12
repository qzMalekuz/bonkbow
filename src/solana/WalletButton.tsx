import { ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { shortAddress } from '@/solana/config';
import { isUserRejection, useWalletAuth } from '@/solana/auth';
import { haptic } from '@/game/haptics';
import { Text } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// "Sign in with wallet": one MWA sheet connects the wallet (Phantom, Solflare,
// Seed Vault). Tapping again when connected disconnects it.
export function WalletButton() {
  const styles = useStyles();
  const { s } = useMetrics();
  const { address, signingIn, signIn, signOut } = useWalletAuth();
  const signedIn = !!address;

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
      if (!isUserRejection(msg)) {
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
          <Ionicons name={signedIn ? 'wallet' : 'wallet-outline'} size={s(18)} color="#FFFFFF" />
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{signedIn && address ? shortAddress(address) : 'Sign in with wallet'}</Text>
        </>
      )}
    </HapticTouchable>
  );
}

const useStyles = makeStyles((m) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.s(8),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: m.s(14),
    paddingVertical: m.s(14),
    paddingHorizontal: m.s(18),
    minHeight: m.s(50),
  },
  label: { flexShrink: 1, color: '#FFFFFF', fontSize: m.s(16), fontWeight: '600', fontVariant: ['tabular-nums'] },
}));
