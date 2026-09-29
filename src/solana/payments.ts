import { address, createNoopSigner, lamports, type Instruction } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { SKR_ENABLED, TREASURY_ADDRESS } from '@/solana/config';
import { buildSkrPayment } from '@/solana/skr';
import type { Currency, Skin } from '@/game/skins';
import { useGameStore } from '@/game/store';
import { supabase } from '@/utils/supabase';

// The minimum the shop needs from the wallet hook. Pass the *current* values
// (after any sign-in has completed and re-rendered): the kit's callbacks
// close over the selected account, so a snapshot taken before connecting
// throws "No account selected".
export type PaymentWallet = {
  address: string;
  sendTransactions: (instructions: Instruction[]) => Promise<string>;
};

export type PurchaseResult =
  | { ok: true; signature: string }
  | {
      ok: false;
      reason: 'no-treasury' | 'no-wallet' | 'not-for-sale' | 'cancelled' | 'tx-failed' | 'verify-failed';
      detail?: string;
      // verify-failed only: true when the signature is kept as a pending
      // purchase and will be re-checked next time the shop opens.
      retryable?: boolean;
      signature?: string;
    };

const isUserRejection = (msg: string) => /cancel|declin|reject|user denied|dismiss/i.test(msg);

// Buy a skin in SOL or SKR: one transfer from the connected wallet to the
// treasury, signed + sent by the wallet through MWA (Seed Vault on Seeker),
// then verified server-side.
//
// The client never grants itself the skin. `verify-purchase` (edge function)
// fetches the confirmed transaction from RPC, checks destination/amount/
// signer/mint against ITS price table, and inserts the purchases row. The
// client then refreshes ownership. Idempotent on signature (unique index).
export async function buySkin(wallet: PaymentWallet | null, skin: Skin, currency: Currency): Promise<PurchaseResult> {
  if (!TREASURY_ADDRESS) return { ok: false, reason: 'no-treasury' };
  if (!wallet) return { ok: false, reason: 'no-wallet' };
  const price = currency === 'SKR' ? skin.priceSkr : skin.priceLamports;
  if (price <= 0 || (currency === 'SKR' && !SKR_ENABLED)) return { ok: false, reason: 'not-for-sale' };

  let signature: string;
  try {
    let ixs: Instruction[];
    if (currency === 'SKR') {
      ixs = await buildSkrPayment(address(wallet.address), BigInt(price));
    } else {
      // The connected account is both fee payer and source. A no-op signer
      // marks it as a required signer in the message; sendTransactions then
      // fetches a blockhash, hands the message to the wallet via MWA to sign
      // and send, and returns the signature.
      ixs = [
        getTransferSolInstruction({
          source: createNoopSigner(address(wallet.address)),
          destination: address(TREASURY_ADDRESS),
          amount: lamports(BigInt(price)),
        }),
      ];
    }
    signature = await wallet.sendTransactions(ixs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUserRejection(msg)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'tx-failed', detail: msg };
  }

  // Money has moved. Remember the signature until the server confirms the
  // grant, so a dropped connection here can't eat the purchase.
  useGameStore.getState().setPendingPurchase({ signature, skinId: skin.id, currency });
  const verified = await verifyPurchase(signature, skin.id, currency);
  if (verified.ok || !verified.retryable) useGameStore.getState().setPendingPurchase(null);
  return verified.ok
    ? { ok: true, signature }
    : { ok: false, reason: 'verify-failed', detail: verified.error, retryable: verified.retryable, signature };
}

export type VerifyResult = { ok: boolean; error?: string; retryable: boolean };

// The wallet returns as soon as the transaction is *submitted*; the server
// reads it at `confirmed` commitment, so the first lookup usually races the
// cluster. Retry with backoff on "not found yet" and on network errors, and
// stop immediately on a definitive rejection (wrong amount, failed tx, …).
const RETRY_DELAYS_MS = [1500, 2000, 3000, 4000, 5000, 6000];

export async function verifyPurchase(signature: string, skinId: string, currency: Currency): Promise<VerifyResult> {
  let last: VerifyResult = { ok: false, error: 'not attempted', retryable: true };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    last = await verifyOnce(signature, skinId, currency);
    if (last.ok || !last.retryable) return last;
    if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  return last;
}

async function verifyOnce(signature: string, skinId: string, currency: Currency): Promise<VerifyResult> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-purchase', {
      body: { signature, skinId, currency },
    });
    if (error) {
      // Non-2xx: the body carries { ok: false, error } and the status tells us
      // whether waiting helps (404 = not confirmed yet).
      const ctx = (error as { context?: Response }).context;
      let message = error.message;
      let status = 0;
      if (ctx && typeof ctx.json === 'function') {
        status = ctx.status;
        try {
          const body = await ctx.json();
          if (body?.error) message = String(body.error);
        } catch {
          // no JSON body
        }
      }
      const retryable = status === 404 || status === 0 || status >= 500 || /not found yet/i.test(message);
      return { ok: false, error: message, retryable };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? 'rejected', retryable: false };
    return { ok: true, retryable: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

// Retry the pending purchase, if any. Returns the skin id that got unlocked.
// A definitive rejection clears the pending entry so it isn't retried forever.
export async function restorePendingPurchase(): Promise<string | null> {
  const pending = useGameStore.getState().pendingPurchase;
  if (!pending) return null;
  const res = await verifyPurchase(pending.signature, pending.skinId, pending.currency);
  if (!res.ok) {
    if (!res.retryable) useGameStore.getState().setPendingPurchase(null);
    return null;
  }
  useGameStore.getState().addOwnedSkin(pending.skinId);
  useGameStore.getState().setPendingPurchase(null);
  return pending.skinId;
}
