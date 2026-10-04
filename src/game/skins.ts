// Cosmetic catalog. Every archer is the same matte-black 3D stickman
// (game3d/Stickman3D.tsx); a skin layers glossy cosmetics on top of it — a
// hat, a themed bow, quiver/flag colors, an arrow trail and optional glowing
// eyes or a scarf. All procedural meshes, no model assets to license.
//
// The shop sells only the hero characters (faces.ts). Every one can be bought
// in SOL or in SKR (the Seeker token), SKR being the shop's "native"
// currency at ~20% under the SOL price.
//
// PRICES ARE PLACEHOLDERS. Set real amounts before mainnet, and keep
// supabase/functions/verify-purchase/index.ts's PRICES in sync — the server
// re-checks the paid amount against its own copy, never the client's.
// 1 SOL = 1_000_000_000 lamports. 1 SKR = 1_000_000 base units (6 decimals).
import { SKR_DECIMALS } from '@/solana/config';
import type { Hat } from '@/game/cosmetics';
import type { FaceId } from '@/game/faces';

// Whole SKR → base units. Kept here (not in solana/skr.ts) so this catalog
// stays free of native imports for the UI-thread game code.
const skr = (whole: number) => Math.round(whole * 10 ** SKR_DECIMALS);

export type Currency = 'SOL' | 'SKR';

export type Skin = {
  id: string;
  name: string;
  description: string;
  priceLamports: number; // 0 = free / default, or not sold for SOL when priceSkr > 0
  priceSkr: number; // SKR base units; 0 = not sold for SKR
  color: string; // signature color: HP bar, flag, quiver, UI
  accent: string; // hat / cosmetic color
  bow: string;
  hat: Hat;
  face?: FaceId; // hat === 'face': which hero head (faces.ts)
  trail: string; // arrow streak color
  eyes?: string; // glowing eyes (emissive) when set
  scarf?: string; // scarf wrapped at the neck, tails flutter
};

export const DEFAULT_SKIN_ID = 'classic';

export const SKINS: Skin[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original stickman.',
    priceLamports: 0,
    priceSkr: 0,
    color: '#F4A261',
    accent: '#F1FAEE',
    bow: '#8B5A2B',
    hat: 'none',
    trail: '#FFFFFF',
  },
  // The heroes: one paid skin per archer-boys.pdf character, each dressing
  // the archer in that hero's head, the sheet's brown recurve and red
  // fletching. Purchase-only — never free, never coins. Same price for all.
  ...([
    ['akshay', 'Akshay', 'Grin first, aim later.', '#14F195'],
    ['beeman', 'Beeman', 'Never seen his eyes. Never missed.', '#9945FF'],
    ['chase', 'Chase', 'Hair by the wind. Shots by him.', '#7FD8C8'],
    ['mit', 'M-it', 'Clean cut, clean headshots.', '#00C2FF'],
    ['mert', 'Mert', 'Full beard. Full send.', '#DC1FFF'],
    ['tolly', 'Tolly', 'Wide eyes. Wider grin. Never misses.', '#19FB9B'],
  ] as [FaceId, string, string, string][]).map(
    ([face, name, description, color]): Skin => ({
      id: `hero_${face}`,
      name,
      description,
      priceLamports: 100_000_000, // 0.1 SOL — placeholder
      priceSkr: skr(2000),
      color,
      accent: color,
      bow: '#6E3B1F',
      hat: 'face',
      face,
      trail: '#D62828',
    }),
  ),
];

// What the shop sells: only the heroes.
export const SHOP_SKINS = SKINS.filter((s) => !!s.face);

// Skin ids from before the heroes were named. Purchases recorded under them
// (server rows, saved state) still count as the hero they were.
const LEGACY_SKIN_IDS: Record<string, string> = {
  bro_smile: 'hero_akshay',
  bro_shades: 'hero_beeman',
  bro_curls: 'hero_chase',
  bro_mobile: 'hero_mit', // the page-4 atlas
  bro_beard: 'hero_mert',
  bro_fade: 'hero_tolly', // the page-6 atlas
};
export const canonicalSkinId = (id: string) => LEGACY_SKIN_IDS[id] ?? id;

// The AI opponent: same black stickman, red bandana, blood-red bow.
export const AI_SKIN: Skin = {
  id: 'ai',
  name: 'Rival',
  description: '',
  priceLamports: 0,
  priceSkr: 0,
  color: '#E63946',
  accent: '#D62828',
  bow: '#5C1A1A',
  hat: 'bandana',
  trail: '#FF6B6B',
};

export const getSkin = (id: string | undefined): Skin =>
  SKINS.find((s) => s.id === id) ?? SKINS[0];

export const isFreeSkin = (s: Skin) => s.priceLamports === 0 && s.priceSkr === 0;

export const formatSol = (lamports: number) => {
  if (lamports === 0) return 'Free';
  const sol = lamports / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
};
