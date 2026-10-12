// What the shop sells besides maps (maps.ts), in five sections: characters
// (derps), clothes, hats ("they do not help"), bows and arrows. None of it
// changes a shot: hitboxes, damage and physics are the same for everyone.
//
// Two ways to pay:
// - SOL or SKR (the Seeker token, ~20% under the SOL price): the original
//   derps, hats and the shovel bow. Recorded server-side under the product
//   id; `ownedSkins` in the store is that server-verified list.
// - Coins, earned by playing (progression.ts): every newer item. Bought on
//   the device, kept in the store's `coinItems`, never sent to the server
//   and never mixed into `ownedSkins`.
// An item is sold one way only. Gary, no hat, no clothes, the plain bow and
// the plain arrow are free.
//
// SOL/SKR PRICES are the source of truth: solana/payments.ts checks the
// on-chain transfer against them. Changing one only affects new purchases;
// restoring an old purchase needs it paid at least the current price.
// 1 SOL = 1_000_000_000 lamports. 1 SKR = 1_000_000 base units (6 decimals).
import { SKR_DECIMALS } from '@/solana/config';
import { BOWS, BOW_IDS, DERPS, DERP_IDS, HATS, HAT_IDS, type BowId, type DerpId, type HatId } from '@/game/derps';
import { ARROWS, ARROW_IDS, OUTFITS, OUTFIT_IDS, type ArrowId, type OutfitId } from '@/game/gear';

// Whole SKR → base units. Kept here (not in solana/skr.ts) so this catalog
// stays free of native imports for the UI-thread game code.
const skr = (whole: number) => Math.round(whole * 10 ** SKR_DECIMALS);

export type Currency = 'SOL' | 'SKR';

export type ProductKind = 'derp' | 'outfit' | 'hat' | 'bow' | 'arrow';

// Kept as `Skin` (payments and the purchase records call every product a
// skin); `kind` + `item` say what it unlocks.
export type Skin = {
  id: string; // product id: derp_<id>, outfit_<id>, hat_<id>, bow_<id>, arrow_<id>
  kind: ProductKind;
  item: string; // DerpId | OutfitId | HatId | BowId | ArrowId
  name: string;
  description: string;
  priceLamports: number; // 0 = not sold for SOL
  priceSkr: number; // SKR base units; 0 = not sold for SKR
  priceCoins: number; // 0 = not sold for coins
  color: string; // UI accent
};

export const DEFAULT_SKIN_ID = 'derp_gary';

const DERP_PRICE = { sol: 50_000_000, skr: skr(1000) }; // 0.05 SOL
const HAT_PRICE = { sol: 20_000_000, skr: skr(400) }; // 0.02 SOL
const SHOVEL_PRICE = { sol: 80_000_000, skr: skr(1600) }; // 0.08 SOL

// Coin prices. A match pays ~30–90 coins (progression.ts), so a cheap item
// is a few matches and the gold ones are a goal.
const COIN_PRICES: Record<string, number> = {
  derp_bob: 600,
  derp_timmy: 750,
  derp_carl: 900,
  derp_chad: 1200,
  outfit_tie: 200,
  outfit_scarf: 250,
  outfit_onesie: 350,
  outfit_tutu: 400,
  outfit_cape: 550,
  outfit_belt: 750,
  outfit_gold: 1500,
  hat_beanie: 200,
  hat_bucket: 250,
  hat_cowboy: 350,
  hat_halo: 600,
  bow_toy: 300,
  bow_candy: 450,
  bow_bone: 700,
  bow_golden: 1500,
  arrow_fire: 250,
  arrow_ice: 250,
  arrow_neon: 300,
  arrow_candy: 350,
  arrow_pencil: 400,
  arrow_plunger: 500,
  arrow_golden: 1000,
};

// The real-money catalogue, unchanged from before coins existed.
const PAID_DERPS: DerpId[] = ['steve', 'doug', 'kevin', 'someguy'];
const PAID_HATS: HatId[] = ['tophat', 'party', 'propeller', 'cone', 'crown', 'pot', 'viking', 'arrow', 'fish', 'chef'];

const product = (kind: ProductKind, item: string, name: string, description: string, color: string, paid: { sol: number; skr: number } | null): Skin => {
  const id = `${kind}_${item}`;
  return {
    id,
    kind,
    item,
    name,
    description,
    priceLamports: paid?.sol ?? 0,
    priceSkr: paid?.skr ?? 0,
    priceCoins: COIN_PRICES[id] ?? 0,
    color,
  };
};

export const SKINS: Skin[] = [
  ...DERP_IDS.map((id) => product('derp', id, DERPS[id].name, DERPS[id].tagline, DERPS[id].color, PAID_DERPS.includes(id) ? DERP_PRICE : null)),
  ...OUTFIT_IDS.map((id: OutfitId) => product('outfit', id, OUTFITS[id].name, OUTFITS[id].tagline, OUTFITS[id].color, null)),
  ...HAT_IDS.map((id) => product('hat', id, HATS[id].name, HATS[id].tagline, '#FFD23F', PAID_HATS.includes(id) ? HAT_PRICE : null)),
  ...BOW_IDS.map((id: BowId) => product('bow', id, BOWS[id].name, BOWS[id].tagline, BOWS[id].wood, id === 'shovel' ? SHOVEL_PRICE : null)),
  ...ARROW_IDS.map((id: ArrowId) => product('arrow', id, ARROWS[id].name, ARROWS[id].tagline, ARROWS[id].trail, null)),
];

export const productId = (kind: ProductKind, item: string) => `${kind}_${item}`;
export const getSkin = (id: string | undefined) => SKINS.find((s) => s.id === id);

// Ids from saves made before the product catalogue existed.
const LEGACY_SKIN_IDS: Record<string, string> = { classic: DEFAULT_SKIN_ID };
export const canonicalSkinId = (id: string) => LEGACY_SKIN_IDS[id] ?? id;

export const isCoinSkin = (s: Skin) => s.priceCoins > 0;
export const isPaidSkin = (s: Skin) => s.priceLamports > 0 || s.priceSkr > 0;
export const isFreeSkin = (s: Skin) => !isPaidSkin(s) && !isCoinSkin(s);

// Owned = free, or bought the way it is sold: a SOL/SKR item only through
// the server-verified `paid` list, a coin item only through `coin`.
export const ownsProduct = (id: string, paid: string[], coin: string[] = []) => {
  const s = getSkin(id);
  if (!s) return false;
  if (isFreeSkin(s)) return true;
  return isCoinSkin(s) ? coin.includes(id) : paid.includes(id);
};

export const formatSol = (lamports: number) => {
  if (lamports === 0) return 'Free';
  const sol = lamports / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
};

export const formatCoins = (coins: number) => coins.toLocaleString();
