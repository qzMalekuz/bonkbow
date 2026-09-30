import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { APP_URI, CLUSTER } from '@/solana/config';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { useGameStore } from '@/game/store';

// Authentication = the wallet. One MWA sheet does it all:
//   1. `signIn` (Mobile Wallet Adapter authorize + Sign in with Solana): the
//      wallet — Seed Vault on Seeker — builds the SIWS message from our payload
//      and signs it. Keys never leave the wallet.
//   2. The signed message + signature go to Supabase (`signInWithWeb3`), which
//      verifies the Ed25519 signature and the domain/uri, and mints a session
//      whose `web3` identity IS the wallet address.
//   3. A DB trigger copies that identity onto profiles.wallet_address; the
//      client never writes the address (see schema.sql). Then we pull owned skins.
// Wallets without SIWS support fall back to authorize + signMessage with a
// message Supabase composes itself (two sheets).
//
// Dashboard: Auth → Providers → enable "Web3 Wallet". Add APP_URI to
// the allowed URLs (Supabase validates the SIWS domain/uri against them).
const STATEMENT = 'Sign in to Stickchers. This does not cost gas or move funds.';

export type WalletAuthState = {
  // A Supabase session that was created by a wallet signature — never the
  // anonymous guest session used for the leaderboard.
  session: Session | null;
  address: string | undefined;
  signingIn: boolean;
  error: string | null;
  // Resolves with the wallet address once the wallet is connected (and, when
  // Supabase is configured, the wallet session exists).
  signIn: () => Promise<string>;
  signOut: () => Promise<void>;
  // Re-pull server-side skin ownership into the local cache.
  refreshOwnedSkins: () => Promise<void>;
};

export const isWalletSession = (s: Session | null): s is Session => !!s && !s.user.is_anonymous;

// The address that signed this session's SIWS message (Supabase `web3`
// identity), or null. Compare against the MWA account before moving funds.
export const sessionWalletAddress = (s: Session | null): string | null => {
  const id = s?.user.identities?.find((i) => i.provider === 'web3');
  if (!id) return null;
  const fromData = id.identity_data?.address;
  if (typeof fromData === 'string' && fromData) return fromData;
  return id.id ? id.id.replace(/^web3:[^:]+:/, '') : null;
};

const utf8 = (bytes: Uint8Array): string => {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  // SIWS messages are ASCII apart from the statement; decode via URI escapes.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
};

export function useWalletAuth(): WalletAuthState {
  const wallet = useMobileWallet();
  const { account, connect, disconnect, signMessages, signIn: mwaSignIn } = wallet;
  const setOwnedSkins = useGameStore((s) => s.setOwnedSkins);
  const [session, setSession] = useState<Session | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const apply = (s: Session | null) => setSession(isWalletSession(s) ? s : null);
    supabase.auth.getSession().then(({ data }) => apply(data.session)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => apply(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshOwnedSkins = useCallback(async () => {
    if (!isSupabaseConfigured || !session) return;
    const { data } = await supabase.from('purchases').select('skin_id').eq('user_id', session.user.id);
    if (data) setOwnedSkins(data.map((r) => r.skin_id as string));
  }, [session, setOwnedSkins]);

  // Refresh owned skins whenever we have a wallet session.
  useEffect(() => {
    refreshOwnedSkins().catch(() => {});
  }, [refreshOwnedSkins]);

  const signIn = useCallback(async (): Promise<string> => {
    if (signingIn) throw new Error('Sign-in already in progress');
    setSigningIn(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        // Wallet-only mode: connected, no backend.
        const acct = account ?? (await connect());
        return acct.address;
      }
      const url = new URL(APP_URI);
      let message: string;
      let signature: Uint8Array;
      let addr: string;
      try {
        // One sheet: authorize + SIWS. The wallet composes the message per the
        // SIWS spec from these fields; Supabase requires version 1, domain and
        // uri to match an allowed URL, and shows `statement` to the user.
        const out = await mwaSignIn({
          domain: url.host,
          uri: url.href,
          statement: STATEMENT,
          version: '1',
          chainId: CLUSTER.id.replace('solana:', ''),
          issuedAt: new Date().toISOString(),
        });
        message = utf8(out.signedMessage);
        signature = out.signature;
        addr = out.account.address;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/cancel|declin|reject|user denied|dismiss/i.test(msg)) throw e;
        // Wallet doesn't implement SIWS: authorize, then sign Supabase's message.
        const acct = account ?? (await connect());
        addr = acct.address;
        const { data, error: err } = await supabase.auth.signInWithWeb3({
          chain: 'solana',
          statement: STATEMENT,
          wallet: {
            publicKey: { toBase58: () => acct.address },
            signMessage: async (m: Uint8Array) => await signMessages(m),
          },
          options: { url: APP_URI },
        });
        if (err) throw err;
        if (!data.session) throw new Error('No session returned');
        return addr;
      }
      const { data, error: err } = await supabase.auth.signInWithWeb3({ chain: 'solana', message, signature });
      if (err) throw err;
      if (!data.session) throw new Error('No session returned');
      return addr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|declin|reject/i.test(msg)) setError(msg);
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [account, connect, mwaSignIn, signMessages, signingIn]);

  const signOut = useCallback(async () => {
    await Promise.allSettled([disconnect(), isSupabaseConfigured ? supabase.auth.signOut() : Promise.resolve()]);
    setOwnedSkins([]);
  }, [disconnect, setOwnedSkins]);

  return { session, address: account?.address, signingIn, error, signIn, signOut, refreshOwnedSkins };
}
