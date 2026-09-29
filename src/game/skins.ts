// Cosmetic catalog. Everything is drawn procedurally (see stickman.ts) so a
// skin is just colors + a hat + a bow color — no sprite assets to license.
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

export type Hat = 'none' | 'cap' | 'crown' | 'horns' | 'halo' | 'hood' | 'visor';

export type Currency = 'SOL' | 'SKR';

export type Skin = {
  id: string;
  name: string;
  description: string;
  priceLamports: number; // 0 = free / default, or not sold for SOL when priceSkr > 0
  priceSkr: number; // SKR base units; 0 = not sold for SKR
  body: string; // stroke color for limbs + head
  accent: string; // hat / detail color
  bow: string;
  hat: Hat;
};

export const DEFAULT_SKIN_ID = 'classic';

export const SKINS: Skin[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original stickman.',
    priceLamports: 0,
    priceSkr: 0,
    body: '#F1FAEE',
    accent: '#F1FAEE',
    bow: '#B08968',
    hat: 'none',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    description: 'Forest green with a hood.',
    priceLamports: 20_000_000, // 0.02 SOL — placeholder
    priceSkr: skr(400),
    body: '#95D5B2',
    accent: '#2D6A4F',
    bow: '#6B4F2A',
    hat: 'hood',
  },
  {
    id: 'street',
    name: 'Street',
    description: 'Backwards cap, neon stripes.',
    priceLamports: 30_000_000, // placeholder
    priceSkr: skr(600),
    body: '#C77DFF',
    accent: '#00F5D4',
    bow: '#3A0CA3',
    hat: 'cap',
  },
  {
    id: 'royal',
    name: 'Royal',
    description: 'Gold crown. Shoots like a king.',
    priceLamports: 50_000_000, // 0.05 SOL — placeholder
    priceSkr: skr(1000),
    body: '#FFE8A3',
    accent: '#F4D35E',
    bow: '#C9A227',
    hat: 'crown',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    description: 'Horns. Very intimidating.',
    priceLamports: 50_000_000, // placeholder
    priceSkr: skr(1000),
    body: '#FF7B54',
    accent: '#E63946',
    bow: '#8B2E2E',
    hat: 'horns',
  },
  {
    id: 'seraph',
    name: 'Seraph',
    description: 'Halo included. Aim still up to you.',
    priceLamports: 80_000_000, // placeholder
    priceSkr: skr(1600),
    body: '#CDE7FF',
    accent: '#FFFFFF',
    bow: '#8ECAE6',
    hat: 'halo',
  },
  {
    id: 'seeker',
    name: 'Seeker',
    description: 'SKR only. Visor, teal glow. For the Seeker crowd.',
    priceLamports: 0,
    priceSkr: skr(750),
    body: '#9BF6FF',
    accent: '#14F195',
    bow: '#0B7285',
    hat: 'visor',
  },
];

export const getSkin = (id: string | undefined): Skin =>
  SKINS.find((s) => s.id === id) ?? SKINS[0];

export const isFreeSkin = (s: Skin) => s.priceLamports === 0 && s.priceSkr === 0;

export const formatSol = (lamports: number) => {
  if (lamports === 0) return 'Free';
  const sol = lamports / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
};
