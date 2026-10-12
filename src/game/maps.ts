// Map catalog. "Classic" is the original set of arenas (a new one each
// match, picked by the seed) and is free. The other three are locked in the
// shop: each is dressed with one of the owner's Unity environment packs
// (game3d/mapProps.ts) and bought in SOL or SKR like a derp or a hat.
//
// The chosen map rides in the match seed's low two bits, so both phones of
// an online match land on the host's map with no protocol change, and a
// guest sees it even without owning it.
//
// PRICES ARE PLACEHOLDERS. Keep supabase/functions/verify-purchase PRICES in
// sync; purchases are recorded under the map id, like skins.
import { SKR_DECIMALS } from '@/solana/config';

const skr = (whole: number) => Math.round(whole * 10 ** SKR_DECIMALS);

export type GameMap = {
  id: string;
  name: string;
  description: string;
  theme: string | null; // MAP_THEMES id (game3d/themes.ts); null = classic rotation
  pack: string; // the Unity Asset Store pack it is built from (credits)
  color: string;
  priceLamports: number;
  priceSkr: number;
};

export const DEFAULT_MAP_ID = 'classic';

// Order matters: the index is what the seed carries. Append only.
export const MAPS: GameMap[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Misty forest, rainy town, colosseum and more: a new arena every duel.',
    theme: null,
    pack: '',
    color: '#F4A261',
    priceLamports: 0,
    priceSkr: 0,
  },
  {
    id: 'map_grove',
    name: 'Elder Forest',
    description: 'Painted firs, mossy stones and a dirt road under a bright sky.',
    theme: 'grove',
    pack: 'Environment Pack: Free Forest Sample (Supercyan)',
    color: '#5EC24A',
    priceLamports: 50_000_000, // 0.05 SOL — placeholder
    priceSkr: skr(1000),
  },
  {
    id: 'map_valley',
    name: 'Windmill Valley',
    description: 'Farmhouses, a watchtower and the old mill at the foot of the mountains.',
    theme: 'valley',
    pack: 'Low Poly Environment (Sky Den Games)',
    color: '#E9B949',
    priceLamports: 50_000_000,
    priceSkr: skr(1000),
  },
  {
    id: 'map_snow',
    name: 'Snowfall Village',
    description: 'Cozy cottages, snowmen and pines in fresh, falling snow.',
    theme: 'snow',
    pack: 'Cozy Snowy Environment - Low Poly (HobiSoLoved)',
    color: '#9CC8F0',
    priceLamports: 50_000_000,
    priceSkr: skr(1000),
  },
];

export const SHOP_MAPS = MAPS.filter((m) => m.theme !== null);

export const getMap = (id: string | undefined): GameMap => MAPS.find((m) => m.id === id) ?? MAPS[0];
export const isFreeMap = (m: GameMap) => m.priceLamports === 0 && m.priceSkr === 0;

// Seeds are non-negative int32s; the low two bits name the map.
export const seedWithMap = (seed: number, mapId: string) => (seed & ~3) | Math.max(0, MAPS.findIndex((m) => m.id === mapId));
export const mapOfSeed = (seed: number): GameMap => MAPS[seed & 3] ?? MAPS[0];
export const randomSeed = (mapId: string) => seedWithMap(Math.floor(Math.random() * 2_147_483_647), mapId);
