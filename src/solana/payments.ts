import AsyncStorage from '@react-native-async-storage/async-storage';
import { address, createNoopSigner, lamports, type Instruction } from '@solana/kit';
import { LEGACY_MEMO_PROGRAM_ADDRESS_V3, getAddMemoInstruction } from '@solana-program/memo';
import { getTransferSolInstruction } from '@solana-program/system';
import {
  CLUSTER,
  DUEL_FEE_LAMPORTS,
  DUEL_MEMO,
  MEMO_PREFIX,
  SKR_ENABLED,
  SKR_MINT,
  TREASURY_ADDRESS,
} from '@/solana/config';
import { buildSkrPayment, ownerSkrAta } from '@/solana/skr';
import { SKINS, type Currency, type Skin } from '@/game/skins';
import { MAPS } from '@/game/maps';
import { useGameStore } from '@/game/store';

// Payments without a server. Every payment is one transaction from the
// connected wallet to the treasury, signed and sent by the wallet through
// Mobile Wallet Adapter (Phantom, Solflare, Seed Vault):
//   - a SOL transfer (System Program) or an SKR TransferChecked, and
//   - an SPL memo "bonkbow:<item id>" (or "bonkbow:duel") naming what it pays for.
// The app then reads the confirmed transaction back from the cluster and only
// unlocks the item when the transfer really landed in the treasury for at
// least the price. Ownership is stored on this device (game/store.ts); a new
// install gets it back by scanning the wallet's history for those memos
// (restorePurchasesFromChain).
//
// Nothing here is trusted by anyone but this device: the items are cosmetic,
// so a patched client unlocking them for itself only fools itself.

// The minimum the shop needs from the wallet hook. Pass the *current* values
// (after any connect has completed and re-rendered): the kit's callbacks
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
      // payment and will be re-checked next time.
      retryable?: boolean;
      signature?: string;
    };

export type VerifyResult = { ok: boolean; error?: string; retryable: boolean };

type Expected = { currency: Currency; amount: number; memo: string; payer?: string };

const isUserRejection = (msg: string) => /cancel|declin|reject|user denied|dismiss/i.test(msg);

const itemMemo = (id: string) => `${MEMO_PREFIX}${id}`;

// Everything sold for real money: derps, hats, the shovel bow, maps.
const realMoneyItem = (id: string) =>
  [...SKINS, ...MAPS].find((p) => p.id === id && (p.priceLamports > 0 || p.priceSkr > 0));

const priceOf = (id: string, currency: Currency): number => {
  const item = realMoneyItem(id);
  if (!item) return 0;
  return currency === 'SKR' ? item.priceSkr : item.priceLamports;
};

// ---- sending -----------------------------------------------------------------

async function sendPayment(wallet: PaymentWallet, currency: Currency, amount: number, memo: string): Promise<string> {
  const payer = address(wallet.address);
  // The connected account is fee payer, source and memo signer. A no-op
  // signer marks it as a required signer; sendTransactions fetches a
  // blockhash, hands the message to the wallet to sign and send, and
  // returns the signature.
  const signer = createNoopSigner(payer);
  const transfer: Instruction[] =
    currency === 'SKR'
      ? await buildSkrPayment(payer, BigInt(amount))
      : [
          getTransferSolInstruction({
            source: signer,
            destination: address(TREASURY_ADDRESS),
            amount: lamports(BigInt(amount)),
          }),
        ];
  // The classic SPL Memo program (MemoSq4g…), not the package's newer
  // default: RPC jsonParsed decoding and getSignaturesForAddress's `memo`
  // field only recognise the classic one, and both checks below rely on them.
  const memoIx = getAddMemoInstruction({ memo, signers: [signer] }, { programAddress: LEGACY_MEMO_PROGRAM_ADDRESS_V3 });
  return wallet.sendTransactions([...transfer, memoIx]);
}

// ---- reading it back -----------------------------------------------------------

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(CLUSTER.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? `${method} failed`);
  return body.result ?? null;
}

type ParsedIx = {
  program?: string;
  // spl-memo: the memo string; system / spl-token: { type, info }.
  parsed?:
    | string
    | {
        type?: string;
        info?: {
          source?: string;
          destination?: string;
          lamports?: number;
          authority?: string;
          multisigAuthority?: string;
          mint?: string;
          amount?: string;
          tokenAmount?: { amount?: string };
        };
      };
};

type ParsedTx = {
  meta?: { err?: unknown; innerInstructions?: { instructions: ParsedIx[] }[] };
  transaction?: {
    message?: {
      accountKeys?: { pubkey: string; signer?: boolean }[];
      instructions?: ParsedIx[];
    };
  };
};

type Check = { status: 'ok' } | { status: 'pending' } | { status: 'rejected'; error: string };

// One look at the transaction: did it pay the treasury what we expected, for
// what we expected? 'pending' = not visible at `confirmed` yet.
async function checkPayment(signature: string, expect: Expected): Promise<Check> {
  const tx = await rpc<ParsedTx>('getTransaction', [
    signature,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx) return { status: 'pending' };
  if (tx.meta?.err) return { status: 'rejected', error: 'The transaction failed on-chain.' };

  const message = tx.transaction?.message;
  // The fee payer (first signer) is the wallet that paid, unless told otherwise.
  const payer = expect.payer ?? message?.accountKeys?.find((k) => k.signer)?.pubkey;
  if (!payer) return { status: 'rejected', error: 'No signer on the transaction.' };
  const ixs: ParsedIx[] = [
    ...(message?.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];

  if (!ixs.some((ix) => ix.program === 'spl-memo' && ix.parsed === expect.memo)) {
    return { status: 'rejected', error: `The payment is not marked "${expect.memo}".` };
  }

  let paid = 0;
  if (expect.currency === 'SOL') {
    for (const ix of ixs) {
      if (ix.program !== 'system' || typeof ix.parsed !== 'object' || ix.parsed.type !== 'transfer') continue;
      const info = ix.parsed.info;
      if (info?.destination === TREASURY_ADDRESS && info.source === payer) paid += info.lamports ?? 0;
    }
  } else {
    // SPL transfers name token accounts: count SKR landing in the treasury's
    // SKR account, moved with the payer's authority.
    const treasuryAta = await ownerSkrAta(address(TREASURY_ADDRESS));
    for (const ix of ixs) {
      if (ix.program !== 'spl-token' || typeof ix.parsed !== 'object') continue;
      if (ix.parsed.type !== 'transferChecked' && ix.parsed.type !== 'transfer') continue;
      const info = ix.parsed.info;
      if (!info || info.destination !== treasuryAta) continue;
      if (info.authority !== payer && info.multisigAuthority !== payer) continue;
      if (info.mint && info.mint !== SKR_MINT) continue;
      const amount = Number(info.tokenAmount?.amount ?? info.amount ?? 0);
      if (Number.isFinite(amount)) paid += amount;
    }
  }
  if (paid < expect.amount) return { status: 'rejected', error: 'The payment to the treasury is less than the price.' };
  return { status: 'ok' };
}

// The wallet returns as soon as the transaction is *submitted*, so the first
// lookups usually race the cluster. Retry "not visible yet" and network
// errors with backoff (~30 s); stop at once on a definitive rejection.
const RETRY_DELAYS_MS = [1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000];

async function confirmPayment(signature: string, expect: Expected): Promise<VerifyResult> {
  let last: VerifyResult = { ok: false, error: 'not attempted', retryable: true };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const check = await checkPayment(signature, expect);
      if (check.status === 'ok') return { ok: true, retryable: false };
      if (check.status === 'rejected') return { ok: false, error: check.error, retryable: false };
      last = { ok: false, error: 'The transaction is not confirmed yet.', retryable: true };
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
    }
    if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  return last;
}

// Pay, then confirm. Shared by the shop and the duel fee.
async function payAndConfirm(
  wallet: PaymentWallet,
  expect: Expected,
  // Called with the signature as soon as money has moved, before confirming,
  // so a crash or a dropped connection can't eat the payment.
  onSent: (signature: string) => void,
): Promise<PurchaseResult> {
  let signature: string;
  try {
    signature = await sendPayment(wallet, expect.currency, expect.amount, expect.memo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUserRejection(msg)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'tx-failed', detail: msg };
  }
  onSent(signature);
  const verified = await confirmPayment(signature, { ...expect, payer: wallet.address });
  return verified.ok
    ? { ok: true, signature }
    : { ok: false, reason: 'verify-failed', detail: verified.error, retryable: verified.retryable, signature };
}

// ---- shop ----------------------------------------------------------------------

// Buy a product in SOL or SKR. The price comes from the catalogue
// (skins.ts / maps.ts), never from the caller. On success the caller adds the
// id to the owned list; on a retryable failure the signature stays as the
// store's pendingPurchase and restorePendingPurchase() finishes it later.
export async function buySkin(
  wallet: PaymentWallet | null,
  skin: Pick<Skin, 'id'>,
  currency: Currency,
): Promise<PurchaseResult> {
  if (!TREASURY_ADDRESS) return { ok: false, reason: 'no-treasury' };
  if (!wallet) return { ok: false, reason: 'no-wallet' };
  const price = priceOf(skin.id, currency);
  if (price <= 0 || (currency === 'SKR' && !SKR_ENABLED)) return { ok: false, reason: 'not-for-sale' };

  const store = useGameStore.getState();
  const result = await payAndConfirm(wallet, { currency, amount: price, memo: itemMemo(skin.id) }, (signature) =>
    store.setPendingPurchase({ signature, skinId: skin.id, currency }),
  );
  if (result.ok || !result.retryable) store.setPendingPurchase(null);
  return result;
}

// Re-check one signature for one item (pending purchase, restore).
export async function verifyPurchase(signature: string, skinId: string, currency: Currency): Promise<VerifyResult> {
  const price = priceOf(skinId, currency);
  if (price <= 0) return { ok: false, error: 'That item is not sold for ' + currency + '.', retryable: false };
  return confirmPayment(signature, { currency, amount: price, memo: itemMemo(skinId) });
}

// Retry the pending purchase, if any. Returns the item id that got unlocked.
// A definitive rejection clears the pending entry so it isn't retried forever.
export async function restorePendingPurchase(): Promise<string | null> {
  const store = useGameStore.getState();
  const pending = store.pendingPurchase;
  if (!pending) return null;
  const res = await verifyPurchase(pending.signature, pending.skinId, pending.currency);
  if (!res.ok) {
    if (!res.retryable) store.setPendingPurchase(null);
    return null;
  }
  store.addOwnedSkin(pending.skinId);
  store.setPendingPurchase(null);
  return pending.skinId;
}

// Rebuild ownership from the chain: every "bonkbow:<item>" payment this wallet
// made to the treasury. getSignaturesForAddress returns each transaction's
// memo ("[len] text"), so only matching transactions are fetched. Adds what it
// finds to the owned list and returns the ids that were new on this device.
export async function restorePurchasesFromChain(walletAddress: string): Promise<string[]> {
  if (!TREASURY_ADDRESS) return [];
  type SigInfo = { signature: string; err: unknown; memo: string | null };
  const candidates = new Map<string, string>(); // signature → item id
  let before: string | undefined;
  for (let page = 0; page < 5; page++) {
    const sigs = await rpc<SigInfo[]>('getSignaturesForAddress', [
      walletAddress,
      { limit: 1000, commitment: 'confirmed', ...(before ? { before } : {}) },
    ]);
    if (!sigs?.length) break;
    for (const s of sigs) {
      if (s.err || !s.memo) continue;
      // Memo field: "[13] bonkbow:hat_pot" — possibly several "; "-joined.
      for (const part of s.memo.split('; ')) {
        const text = part.replace(/^\[\d+\]\s*/, '');
        if (!text.startsWith(MEMO_PREFIX) || text === DUEL_MEMO) continue;
        const id = text.slice(MEMO_PREFIX.length);
        if (realMoneyItem(id)) candidates.set(s.signature, id);
      }
    }
    if (sigs.length < 1000) break;
    before = sigs[sigs.length - 1].signature;
  }

  const store = useGameStore.getState();
  const found: string[] = [];
  for (const [signature, id] of candidates) {
    if (found.includes(id) || store.ownedSkins.includes(id)) continue;
    // Either currency may have paid for it.
    for (const currency of ['SOL', 'SKR'] as Currency[]) {
      const price = priceOf(id, currency);
      if (price <= 0 || (currency === 'SKR' && !SKR_ENABLED)) continue;
      const check = await checkPayment(signature, { currency, amount: price, memo: itemMemo(id), payer: walletAddress }).catch(
        () => null,
      );
      if (check?.status === 'ok') {
        found.push(id);
        break;
      }
    }
  }
  for (const id of found) store.addOwnedSkin(id);
  return found;
}

// ---- duel entry fee ----------------------------------------------------------------

// A paid entry not yet used by a duel. Kept in storage from the moment the
// fee is sent, so paying and then losing the app (crash, back-out, a
// confirmation that took too long) leaves a credit for the next duel instead
// of charging twice.
const DUEL_CREDIT_KEY = 'bonkbow.duelCredit';
type DuelCredit = { signature: string; payer: string; confirmed: boolean };

const readCredit = async (): Promise<DuelCredit | null> => {
  try {
    const raw = await AsyncStorage.getItem(DUEL_CREDIT_KEY);
    return raw ? (JSON.parse(raw) as DuelCredit) : null;
  } catch {
    return null;
  }
};
const writeCredit = (c: DuelCredit | null) =>
  (c ? AsyncStorage.setItem(DUEL_CREDIT_KEY, JSON.stringify(c)) : AsyncStorage.removeItem(DUEL_CREDIT_KEY)).catch(() => {});

const duelExpect = (payer: string): Expected => ({ currency: 'SOL', amount: DUEL_FEE_LAMPORTS, memo: DUEL_MEMO, payer });

// Is there an entry already paid for? 'ready' = confirmed, use it; 'pending' =
// sent but not confirmed yet (try again shortly); 'none' = pay first.
export async function duelCreditStatus(): Promise<'ready' | 'pending' | 'none'> {
  const credit = await readCredit();
  if (!credit) return 'none';
  if (credit.confirmed) return 'ready';
  const res = await confirmPayment(credit.signature, duelExpect(credit.payer));
  if (res.ok) {
    await writeCredit({ ...credit, confirmed: true });
    return 'ready';
  }
  if (!res.retryable) {
    await writeCredit(null);
    return 'none';
  }
  return 'pending';
}

// Pay the entry fee. On success the credit is stored confirmed; the duel
// spends it with spendDuelCredit() when it starts.
export async function payDuelFee(wallet: PaymentWallet | null): Promise<PurchaseResult> {
  if (!TREASURY_ADDRESS) return { ok: false, reason: 'no-treasury' };
  if (!wallet) return { ok: false, reason: 'no-wallet' };
  const result = await payAndConfirm(wallet, duelExpect(wallet.address), (signature) => {
    writeCredit({ signature, payer: wallet.address, confirmed: false });
  });
  if (result.ok) await writeCredit({ signature: result.signature, payer: wallet.address, confirmed: true });
  else if (result.reason === 'verify-failed' && !result.retryable) await writeCredit(null);
  return result;
}

// The duel is starting: the entry is used up.
export const spendDuelCredit = () => writeCredit(null);
