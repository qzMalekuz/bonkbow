// What the shop sells besides maps (maps.ts): derps (the archer you play
// as), hats ("they do not help") and the shovel bow. Gary, no hat and the
// plain bow are free; everything else is bought in SOL or SKR (the Seeker
// token, ~20% under the SOL price) and recorded server-side under the
// product id. None of it changes a shot: hitboxes, damage and physics are
// the same for every archer.
//
// PRICES ARE PLACEHOLDERS. Set real amounts before mainnet, and keep
// supabase/functions/verify-purchase/index.ts's PRICES in sync — the server
// re-checks the paid amount against its own copy, never the client's.
// 1 SOL = 1_000_000_000 lamports. 1 SKR = 1_000_000 base units (6 decimals).
import { SKR_DECIMALS } from '@/solana/config';
import { BOWS, DERPS, DERP_IDS, HATS, HAT_IDS, type BowId, type DerpId } from '@/game/derps';

// Whole SKR → base units. Kept here (not in solana/skr.ts) so this catalog
// stays free of native imports for the UI-thread game code.
const skr = (whole: number) => Math.round(whole * 10 ** SKR_DECIMALS);

export type Currency = 'SOL' | 'SKR';

export type ProductKind = 'derp' | 'hat' | 'bow';

// Kept as `Skin` (payments and the purchase records call every product a
// skin); `kind` + `item` say what it unlocks.
export type Skin = {
  id: string; // product id: derp_<id>, hat_<id>, bow_<id>
  kind: ProductKind;
  item: string; // DerpId | HatId | BowId
  name: string;
  description: string;
  priceLamports: number; // 0 = free
  priceSkr: number; // SKR base units; 0 = not sold for SKR
  color: string; // UI accent
};

export const DEFAULT_SKIN_ID = 'derp_gary';

const DERP_PRICE = { sol: 50_000_000, skr: skr(1000) }; // 0.05 SOL
const HAT_PRICE = { sol: 20_000_000, skr: skr(400) }; // 0.02 SOL
const SHOVEL_PRICE = { sol: 80_000_000, skr: skr(1600) }; // 0.08 SOL

const FREE_DERP: DerpId = 'gary';

export const SKINS: Skin[] = [
  ...DERP_IDS.map(
    (id): Skin => ({
      id: `derp_${id}`,
      kind: 'derp',
      item: id,
      name: DERPS[id].name,
      description: DERPS[id].tagline,
      priceLamports: id === FREE_DERP ? 0 : DERP_PRICE.sol,
      priceSkr: id === FREE_DERP ? 0 : DERP_PRICE.skr,
      color: DERPS[id].color,
    }),
  ),
  ...HAT_IDS.map(
    (id): Skin => ({
      id: `hat_${id}`,
      kind: 'hat',
      item: id,
      name: HATS[id].name,
      description: HATS[id].tagline,
      priceLamports: id === 'none' ? 0 : HAT_PRICE.sol,
      priceSkr: id === 'none' ? 0 : HAT_PRICE.skr,
      color: '#FFD23F',
    }),
  ),
  ...(Object.keys(BOWS) as BowId[]).map(
    (id): Skin => ({
      id: `bow_${id}`,
      kind: 'bow',
      item: id,
      name: BOWS[id].name,
      description: BOWS[id].tagline,
      priceLamports: id === 'shovel' ? SHOVEL_PRICE.sol : 0,
      priceSkr: id === 'shovel' ? SHOVEL_PRICE.skr : 0,
      color: '#96602D',
    }),
  ),
];

export const productId = (kind: ProductKind, item: string) => `${kind}_${item}`;
export const SHOP_DERPS = SKINS.filter((s) => s.kind === 'derp');
export const SHOP_HATS = SKINS.filter((s) => s.kind === 'hat' && s.item !== 'none');
export const SHOP_BOWS = SKINS.filter((s) => s.kind === 'bow' && s.item !== 'bow');

// Ids from saves made before the product catalogue existed.
const LEGACY_SKIN_IDS: Record<string, string> = { classic: DEFAULT_SKIN_ID };
export const canonicalSkinId = (id: string) => LEGACY_SKIN_IDS[id] ?? id;

export const isFreeSkin = (s: Skin) => s.priceLamports === 0 && s.priceSkr === 0;

// Owned = bought, or free.
export const ownsProduct = (id: string, owned: string[]) => {
  const s = SKINS.find((k) => k.id === id);
  return !!s && (isFreeSkin(s) || owned.includes(id));
};

export const formatSol = (lamports: number) => {
  if (lamports === 0) return 'Free';
  const sol = lamports / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
};
