import { useCallback, useState } from 'react';
import { useMobileWallet } from '@wallet-ui/react-native-kit';

// Signing in = connecting a wallet. One Mobile Wallet Adapter sheet (Phantom,
// Solflare, Seed Vault on Seeker) authorizes Bonk Bow for an account; the
// provider caches the auth token, so the next launch reconnects silently.
// There is no server and no session: the wallet address is the identity, and
// every payment is signed by the wallet itself (see payments.ts).
//
// Signing out disconnects the wallet only. Items bought on this device stay
// unlocked (they are stored locally, not per account).

export type WalletAuthState = {
  address: string | undefined;
  signingIn: boolean;
  error: string | null;
  // Resolves with the wallet address once the wallet is connected.
  signIn: () => Promise<string>;
  signOut: () => Promise<void>;
};

export const isUserRejection = (msg: string) => /cancel|declin|reject|user denied|dismiss/i.test(msg);

export function useWalletAuth(): WalletAuthState {
  const { account, connect, disconnect } = useMobileWallet();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<string> => {
    if (account) return account.address;
    if (signingIn) throw new Error('Sign-in already in progress');
    setSigningIn(true);
    setError(null);
    try {
      const acct = await connect();
      return acct.address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isUserRejection(msg)) setError(msg);
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [account, connect, signingIn]);

  const signOut = useCallback(async () => {
    await disconnect().catch(() => {});
  }, [disconnect]);

  return { address: account?.address, signingIn, error, signIn, signOut };
}
