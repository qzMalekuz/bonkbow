// Destination: supabase/functions/verify-purchase/index.ts
// Deploy:      supabase functions deploy verify-purchase
// Secrets:     supabase secrets set SOLANA_RPC_URL=https://... TREASURY_ADDRESS=<pubkey> SKR_MINT=<mint>
//
// Grants a skin after verifying the payment on-chain. The client sends
// { signature, skinId, currency: 'SOL' | 'SKR' }; we fetch the confirmed
// transaction from RPC and check:
//   - it succeeded (meta.err == null)
//   - SOL: a System Program transfer FROM the user's wallet TO the treasury
//   - SKR: an SPL Token transfer/transferChecked authorized by the user's
//          wallet INTO a token account owned by the treasury for the SKR mint
//   - the amount >= the price in OUR table (never trust the client's price)
//   - the sender is the wallet that signed the caller's Sign in with Solana
//     (auth identity provider 'web3' — never a client-writable column)
// Then insert into purchases (service role — clients have no INSERT policy).
// Idempotent: the unique index on signature makes a replay a no-op.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// MUST mirror src/game/skins.ts. SOL in lamports, SKR in base units (6 dp).
const PRICES_SOL: Record<string, number> = {
  ranger: 20_000_000,
  street: 30_000_000,
  royal: 50_000_000,
  inferno: 50_000_000,
  seraph: 80_000_000,
}
const PRICES_SKR: Record<string, number> = {
  ranger: 400_000_000,
  street: 600_000_000,
  royal: 1_000_000_000,
  inferno: 1_000_000_000,
  seraph: 1_600_000_000,
  seeker: 750_000_000,
}

type Currency = 'SOL' | 'SKR'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function rpc(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await res.json()
  return j?.result
}

type Parsed = {
  program?: string
  parsed?: {
    type?: string
    info?: {
      source?: string
      destination?: string
      lamports?: number
      authority?: string
      multisigAuthority?: string
      mint?: string
      amount?: string
      tokenAmount?: { amount?: string }
    }
  }
}

// Owner + mint of a token account, via jsonParsed getAccountInfo.
async function tokenAccountMeta(url: string, account: string): Promise<{ owner?: string; mint?: string }> {
  const info = await rpc(url, 'getAccountInfo', [account, { encoding: 'jsonParsed', commitment: 'confirmed' }])
  const parsed = info?.value?.data?.parsed
  if (parsed?.type !== 'account') return {}
  return { owner: parsed.info?.owner, mint: parsed.info?.mint }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const rpcUrl = Deno.env.get('SOLANA_RPC_URL')
  const treasury = Deno.env.get('TREASURY_ADDRESS')
  const skrMint = Deno.env.get('SKR_MINT') ?? ''
  if (!rpcUrl || !treasury) return json({ ok: false, error: 'server not configured' }, 500)

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)
  if (user.is_anonymous) return json({ ok: false, error: 'sign in with your wallet first' }, 401)
  // Wallet address = the SIWS identity (the address that signed). identity_data
  // carries it raw; the provider id is 'web3:solana:<address>'.
  const web3 = (user.identities ?? []).find((i) => i.provider === 'web3')
  const wallet: string | undefined =
    web3?.identity_data?.address ?? (web3?.id ? web3.id.replace(/^web3:[^:]+:/, '') : undefined)
  if (!wallet) return json({ ok: false, error: 'no wallet identity on this account' }, 400)

  let body: { signature?: string; skinId?: string; currency?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'bad json' }, 400)
  }
  const { signature, skinId } = body
  const currency: Currency = body.currency === 'SKR' ? 'SKR' : 'SOL'
  const table = currency === 'SKR' ? PRICES_SKR : PRICES_SOL
  if (!signature || !skinId || !(skinId in table)) return json({ ok: false, error: 'bad request' }, 400)
  if (currency === 'SKR' && !skrMint) return json({ ok: false, error: 'SKR not enabled on server' }, 400)
  const price = table[skinId]

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Already granted? (replay / restore). A signature belongs to exactly one user.
  const { data: existing } = await admin
    .from('purchases')
    .select('user_id, skin_id')
    .eq('signature', signature)
    .maybeSingle()
  if (existing) {
    if (existing.user_id !== user.id) return json({ ok: false, error: 'signature already used by another account' }, 409)
    return json({ ok: true, alreadyGranted: true, skinId: existing.skin_id })
  }

  // Fetch the transaction, parsed, at confirmed commitment.
  const tx = await rpc(rpcUrl, 'getTransaction', [
    signature,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ])
  if (!tx) return json({ ok: false, error: 'transaction not found yet — retry in a few seconds' }, 404)
  if (tx.meta?.err) return json({ ok: false, error: 'transaction failed on-chain' }, 400)

  const instructions: Parsed[] = [
    ...(tx.transaction?.message?.instructions ?? []),
    ...((tx.meta?.innerInstructions ?? []).flatMap((i: { instructions: Parsed[] }) => i.instructions)),
  ]

  let paid = 0
  if (currency === 'SOL') {
    paid = instructions
      .filter((ix) => ix.program === 'system' && ix.parsed?.type === 'transfer')
      .filter((ix) => ix.parsed?.info?.destination === treasury && ix.parsed?.info?.source === wallet)
      .reduce((sum, ix) => sum + (ix.parsed?.info?.lamports ?? 0), 0)
  } else {
    // SPL transfers name token ACCOUNTS, not wallets. Resolve each destination
    // account's owner + mint and only count SKR landing in a treasury-owned account
    // where the user's wallet was the authority.
    const candidates = instructions.filter(
      (ix) =>
        ix.program === 'spl-token' &&
        (ix.parsed?.type === 'transferChecked' || ix.parsed?.type === 'transfer') &&
        (ix.parsed?.info?.authority === wallet || ix.parsed?.info?.multisigAuthority === wallet),
    )
    for (const ix of candidates) {
      const info = ix.parsed!.info!
      if (!info.destination) continue
      const dest = await tokenAccountMeta(rpcUrl, info.destination)
      if (dest.owner !== treasury || dest.mint !== skrMint) continue
      if (info.mint && info.mint !== skrMint) continue
      const amt = Number(info.tokenAmount?.amount ?? info.amount ?? 0)
      if (Number.isFinite(amt)) paid += amt
    }
  }

  if (paid < price) return json({ ok: false, error: `paid ${paid} < price ${price} ${currency}` }, 402)

  const { error: insErr } = await admin.from('purchases').insert({
    user_id: user.id,
    skin_id: skinId,
    signature,
    currency,
    lamports: paid, // base units of `currency` (column name predates SKR)
    wallet_address: wallet,
  })
  if (insErr) {
    // unique_violation on signature → a concurrent request already granted it
    if ((insErr as { code?: string }).code === '23505') {
      const { data: row } = await admin.from('purchases').select('user_id').eq('signature', signature).maybeSingle()
      if (row && row.user_id !== user.id) return json({ ok: false, error: 'signature already used by another account' }, 409)
      return json({ ok: true, alreadyGranted: true })
    }
    return json({ ok: false, error: insErr.message }, 500)
  }
  return json({ ok: true })
})
