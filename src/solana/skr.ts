import { useCallback, useEffect, useState } from 'react';
import { address, createNoopSigner, type Address, type Instruction } from '@solana/kit';
import {
  TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
} from '@solana-program/token';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { SKR_DECIMALS, SKR_ENABLED, SKR_MINT, TREASURY_ADDRESS } from '@/solana/config';

// SKR (Seeker token) integration.
//
// Two things live here:
//   1. useSkrBalance — reads the connected wallet's SKR associated token
//      account through the MWA provider's @solana/kit RPC client.
//   2. buildSkrPayment — instructions for paying the treasury in SKR:
//      an idempotent "create treasury ATA" (so the first ever SKR sale works
//      even if the treasury never held SKR) followed by a TransferChecked,
//      which pins the mint + decimals so a wallet can't be tricked into
//      moving a different token.
// The wallet signs and sends via MWA; the server (verify-purchase) checks the
// transfer on-chain before granting anything.

export type SkrWallet = ReturnType<typeof useMobileWallet>;

const ONE_SKR = 10 ** SKR_DECIMALS;

// Base units → "1,250 SKR". Whole SKR only in the UI; prices are whole numbers.
export const formatSkr = (baseUnits: number | bigint) => {
  const n = Number(baseUnits) / ONE_SKR;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 2 : 0 })} SKR`;
};

export const skr = (whole: number) => Math.round(whole * ONE_SKR);

export async function ownerSkrAta(owner: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint: address(SKR_MINT),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

export async function buildSkrPayment(owner: Address, amountBaseUnits: bigint): Promise<Instruction[]> {
  if (!SKR_ENABLED) throw new Error('SKR is not configured');
  const mint = address(SKR_MINT);
  const treasury = address(TREASURY_ADDRESS);
  const payer = createNoopSigner(owner);
  const source = await ownerSkrAta(owner);
  const destination = await ownerSkrAta(treasury);
  const createDest = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    owner: treasury,
    mint,
  });
  const transfer = getTransferCheckedInstruction({
    source,
    mint,
    destination,
    authority: payer,
    amount: amountBaseUnits,
    decimals: SKR_DECIMALS,
  });
  return [createDest, transfer];
}

export type SkrBalance = {
  enabled: boolean;
  loading: boolean;
  // Base units; null when unknown (no wallet / no ATA yet / fetch failed).
  baseUnits: bigint | null;
  refresh: () => Promise<void>;
};

// Live SKR balance of the connected account. Refetches when the account
// changes and on demand (after a purchase).
export function useSkrBalance(): SkrBalance {
  const { account, client } = useMobileWallet();
  const [baseUnits, setBaseUnits] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  // Pure read: null when there's nothing to read or the RPC call failed.
  const read = useCallback(async (): Promise<bigint | null> => {
    if (!SKR_ENABLED || !account) return null;
    try {
      const ata = await ownerSkrAta(account.address);
      const token = await fetchMaybeToken(client.rpc, ata);
      return token.exists ? token.data.amount : 0n;
    } catch {
      return null;
    }
  }, [account, client]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setBaseUnits(await read());
    setLoading(false);
  }, [read]);

  useEffect(() => {
    let alive = true;
    // Kick off asynchronously so no state is set synchronously in the effect.
    Promise.resolve()
      .then(() => {
        if (alive) setLoading(true);
        return read();
      })
      .then((b) => {
        if (!alive) return;
        setBaseUnits(b);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [read]);

  return { enabled: SKR_ENABLED, loading, baseUnits, refresh };
}
