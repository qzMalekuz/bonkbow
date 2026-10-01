// Cosmetic catalog. Every archer is the same matte-black 3D stickman
// (game3d/Stickman3D.tsx); a skin layers glossy cosmetics on top of it — a
// hat, a themed bow, quiver/flag colors, an arrow trail and optional glowing
// eyes or a scarf. All procedural meshes, no model assets to license.
//
// Every paid skin can be bought in SOL or in SKR (the Seeker token). SKR is
// the "native" currency of the shop: it's ~20% cheaper and the Seeker skin is
// SKR-only — that's the hackathon's SKR integration in one sentence.
//
// PRICES ARE PLACEHOLDERS. Set real amounts before mainnet, and keep
// supabase/functions/verify-purchase/index.ts's PRICES in sync — the server
// re-checks the paid amount against its own copy, never the client's.
// 1 SOL = 1_000_000_000 lamports. 1 SKR = 1_000_000 base units (6 decimals).
import { SKR_DECIMALS } from '@/solana/config';

// Whole SKR → base units. Kept here (not in solana/skr.ts) so this catalog
// stays free of native imports for the UI-thread game code.
const skr = (whole: number) => Math.round(whole * 10 ** SKR_DECIMALS);

export type Hat = 'none' | 'cap' | 'crown' | 'horns' | 'halo' | 'hood' | 'visor' | 'bandana';

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
  {
    id: 'ranger',
    name: 'Ranger',
    description: 'Forest green with a hood.',
    priceLamports: 20_000_000, // 0.02 SOL — placeholder
    priceSkr: skr(400),
    color: '#52B788',
    accent: '#2D6A4F',
    bow: '#6B4F2A',
    hat: 'hood',
    trail: '#B7E4C7',
    scarf: '#40916C',
  },
  {
    id: 'street',
    name: 'Street',
    description: 'Backwards cap, neon stripes.',
    priceLamports: 30_000_000, // placeholder
    priceSkr: skr(600),
    color: '#C77DFF',
    accent: '#00F5D4',
    bow: '#3A0CA3',
    hat: 'cap',
    trail: '#00F5D4',
  },
  {
    id: 'royal',
    name: 'Royal',
    description: 'Gold crown. Shoots like a king.',
    priceLamports: 50_000_000, // 0.05 SOL — placeholder
    priceSkr: skr(1000),
    color: '#F4D35E',
    accent: '#F4D35E',
    bow: '#C9A227',
    hat: 'crown',
    trail: '#FFE8A3',
    scarf: '#9D0208',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    description: 'Horns. Very intimidating.',
    priceLamports: 50_000_000, // placeholder
    priceSkr: skr(1000),
    color: '#FF7B54',
    accent: '#E63946',
    bow: '#8B2E2E',
    hat: 'horns',
    trail: '#FF7B54',
    eyes: '#FF3B1F',
  },
  {
    id: 'seraph',
    name: 'Seraph',
    description: 'Halo included. Aim still up to you.',
    priceLamports: 80_000_000, // placeholder
    priceSkr: skr(1600),
    color: '#CDE7FF',
    accent: '#FFFFFF',
    bow: '#8ECAE6',
    hat: 'halo',
    trail: '#CDE7FF',
    eyes: '#E0F7FF',
  },
  {
    id: 'seeker',
    name: 'Seeker',
    description: 'SKR only. Visor, teal glow. For the Seeker crowd.',
    priceLamports: 0,
    priceSkr: skr(750),
    color: '#14F195',
    accent: '#14F195',
    bow: '#0B7285',
    hat: 'visor',
    trail: '#14F195',
  },
];

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
