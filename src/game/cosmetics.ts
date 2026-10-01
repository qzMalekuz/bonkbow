// "Choose your style": the stickman is always matte black; what you wear on
// top is a loadout of three slots — headgear, bow, arrow trail. Items are
// free, claimed with coins earned in matches (device-local), or unlocked by
// owning a skin bundle from the shop (skins.ts, paid in SOL/SKR and verified
// server-side) — so purchases stay keyed by skin id and the server never
// needs to know about items.
import { AI_SKIN, SKINS, isFreeSkin, type Skin } from '@/game/skins';
import type { FaceId } from '@/game/faces';

export type Hat =
  | 'none'
  | 'headband'
  | 'cap'
  | 'helmet'
  | 'crown'
  | 'horns'
  | 'halo'
  | 'hood'
  | 'visor'
  | 'viking'
  | 'dragon'
  | 'bandana'
  | 'face'; // printed-visor helmet, see faces.ts

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type HeadItem = { id: string; name: string; hat: Hat; color: string; rarity: Rarity; bundle?: string; coins?: number; eyes?: string; face?: FaceId };
export type BowItem = { id: string; name: string; color: string; accent: string; rarity: Rarity; bundle?: string; coins?: number; glow?: boolean };
export type TrailItem = { id: string; name: string; color: string; rarity: Rarity; bundle?: string; coins?: number };
export type Item = HeadItem | BowItem | TrailItem;

// `bundle` = the skin id that unlocks it; `coins` = claimable with coins;
// neither = free for everyone.
export const HEADS: HeadItem[] = [
  { id: 'bare', name: 'Bare', hat: 'none', color: '#FFFFFF', rarity: 'common' },
  { id: 'headband', name: 'Headband', hat: 'headband', color: '#E63946', rarity: 'common' },
  { id: 'helmet', name: 'Camo Helmet', hat: 'helmet', color: '#5B6B3A', rarity: 'rare', coins: 150 },
  { id: 'hood', name: 'Ranger Hood', hat: 'hood', color: '#2D6A4F', rarity: 'rare', bundle: 'ranger' },
  { id: 'cap', name: 'Street Cap', hat: 'cap', color: '#00F5D4', rarity: 'rare', bundle: 'street' },
  { id: 'viking', name: 'Viking Helm', hat: 'viking', color: '#9AA4AE', rarity: 'epic', bundle: 'ranger' },
  { id: 'crown', name: 'Royal Crown', hat: 'crown', color: '#F4D35E', rarity: 'epic', bundle: 'royal' },
  { id: 'horns', name: 'Inferno Horns', hat: 'horns', color: '#E63946', rarity: 'epic', bundle: 'inferno', eyes: '#FF3B1F' },
  { id: 'halo', name: 'Seraph Halo', hat: 'halo', color: '#FFFFFF', rarity: 'legendary', bundle: 'seraph', eyes: '#E0F7FF' },
  { id: 'visor', name: 'Seeker Visor', hat: 'visor', color: '#14F195', rarity: 'legendary', bundle: 'seeker' },
  { id: 'dragon', name: 'Dragon Mask', hat: 'dragon', color: '#6A3FB5', rarity: 'legendary', bundle: 'inferno', eyes: '#FF5AF1' },
  // Solana bros: real faces on a helmet visor. Purchase-only, one bundle each.
  { id: 'bro_smile', name: 'The Smile', hat: 'face', face: 'smile', color: '#14F195', rarity: 'legendary', bundle: 'bro_smile' },
  { id: 'bro_shades', name: 'Shades', hat: 'face', face: 'shades', color: '#9945FF', rarity: 'legendary', bundle: 'bro_shades' },
  { id: 'bro_curls', name: 'Curls', hat: 'face', face: 'curls', color: '#7FD8C8', rarity: 'legendary', bundle: 'bro_curls' },
  { id: 'bro_fade', name: 'The Fade', hat: 'face', face: 'fade', color: '#19FB9B', rarity: 'legendary', bundle: 'bro_fade' },
  { id: 'bro_mobile', name: 'Mobile', hat: 'face', face: 'mobile', color: '#00C2FF', rarity: 'legendary', bundle: 'bro_mobile' },
  { id: 'bro_beard', name: 'The Beard', hat: 'face', face: 'beard', color: '#DC1FFF', rarity: 'legendary', bundle: 'bro_beard' },
];

export const BOWS: BowItem[] = [
  { id: 'oak', name: 'Oak Bow', color: '#8B5A2B', accent: '#E9D8A6', rarity: 'common' },
  { id: 'hunter', name: 'Hunter Recurve', color: '#3B2A1E', accent: '#C1121F', rarity: 'common', coins: 60 },
  { id: 'forest', name: 'Forest Longbow', color: '#6B4F2A', accent: '#52B788', rarity: 'rare', bundle: 'ranger' },
  { id: 'neon', name: 'Neon Bow', color: '#3A0CA3', accent: '#00F5D4', rarity: 'rare', bundle: 'street', glow: true },
  { id: 'gold', name: 'Golden Bow', color: '#C9A227', accent: '#FFF3B0', rarity: 'epic', bundle: 'royal' },
  { id: 'ember', name: 'Ember Bow', color: '#8B2E2E', accent: '#FF7B54', rarity: 'epic', bundle: 'inferno', glow: true },
  { id: 'frost', name: 'Frost Bow', color: '#8ECAE6', accent: '#FFFFFF', rarity: 'legendary', bundle: 'seraph', glow: true },
  { id: 'circuit', name: 'Circuit Bow', color: '#0B7285', accent: '#14F195', rarity: 'legendary', bundle: 'seeker', glow: true },
];

export const TRAILS: TrailItem[] = [
  { id: 'white', name: 'Plain', color: '#FFFFFF', rarity: 'common' },
  { id: 'sun', name: 'Sunstreak', color: '#FFB703', rarity: 'common', coins: 40 },
  { id: 'leaf', name: 'Leaf', color: '#95D5B2', rarity: 'rare', bundle: 'ranger' },
  { id: 'cyan', name: 'Neon', color: '#00F5D4', rarity: 'rare', bundle: 'street' },
  { id: 'gold', name: 'Gilded', color: '#FFE8A3', rarity: 'epic', bundle: 'royal' },
  { id: 'fire', name: 'Inferno', color: '#FF5A1F', rarity: 'epic', bundle: 'inferno' },
  { id: 'holy', name: 'Holy Light', color: '#CDE7FF', rarity: 'legendary', bundle: 'seraph' },
  { id: 'solana', name: 'Seeker', color: '#14F195', rarity: 'legendary', bundle: 'seeker' },
];

export const RARITY_COLORS: Record<Rarity, { bg: string; glow: string; label: string }> = {
  common: { bg: '#9E9E9E', glow: 'rgba(255,255,255,0.25)', label: 'Common' },
  rare: { bg: '#4FA3E0', glow: 'rgba(79,163,224,0.55)', label: 'Rare' },
  epic: { bg: '#9B5DE5', glow: 'rgba(155,93,229,0.6)', label: 'Epic' },
  legendary: { bg: '#F4A261', glow: 'rgba(244,162,97,0.7)', label: 'Legendary' },
};

export type Loadout = { head: string; bow: string; trail: string };
export const DEFAULT_LOADOUT: Loadout = { head: 'bare', bow: 'oak', trail: 'white' };

// Everything the 3D rig needs to dress an archer.
export type Look = {
  key: string; // changes whenever any visible part changes
  hat: Hat;
  hatColor: string;
  face?: FaceId; // only with hat === 'face'
  eyes?: string;
  bowColor: string;
  bowAccent: string;
  bowGlow: boolean;
  trail: string;
  banner: string; // pennant + quiver + UI accent
};

const byId = <T extends { id: string }>(list: T[], id: string, fallback: T) => list.find((i) => i.id === id) ?? fallback;

export function lookFor(l: Loadout): Look {
  const head = byId(HEADS, l.head, HEADS[0]);
  const bow = byId(BOWS, l.bow, BOWS[0]);
  const trail = byId(TRAILS, l.trail, TRAILS[0]);
  // Banner takes the most striking colour on show.
  const banner = head.hat !== 'none' ? head.color : bow.accent;
  return {
    key: `${head.id}|${bow.id}|${trail.id}`,
    hat: head.hat,
    hatColor: head.color,
    face: head.face,
    eyes: head.eyes,
    bowColor: bow.color,
    bowAccent: bow.accent,
    bowGlow: !!bow.glow,
    trail: trail.color,
    banner,
  };
}

// The AI rival: red bandana, dark blood-red bow.
export const AI_LOOK: Look = {
  key: 'ai',
  hat: 'bandana',
  hatColor: AI_SKIN.accent,
  bowColor: AI_SKIN.bow,
  bowAccent: '#E63946',
  bowGlow: false,
  trail: AI_SKIN.trail,
  banner: AI_SKIN.color,
};

// Random rival outfits so every matchmade AI opponent looks different.
export function randomLoadout(rnd: () => number = Math.random): Loadout {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  return { head: pick(HEADS).id, bow: pick(BOWS).id, trail: pick(TRAILS).id };
}

export function ownsItem(item: Item, ownedSkins: string[], ownedItems: string[]) {
  if (item.bundle) return ownedSkins.includes(item.bundle);
  if (item.coins) return ownedItems.includes(item.id);
  return true;
}

// The loadout a skin bundle dresses you in when equipped from the shop.
export function loadoutForSkin(skinId: string): Loadout | null {
  const head = HEADS.find((i) => i.bundle === skinId);
  const bow = BOWS.find((i) => i.bundle === skinId);
  const trail = TRAILS.find((i) => i.bundle === skinId);
  if (!head && !bow && !trail) return null;
  return { head: head?.id ?? 'bare', bow: bow?.id ?? 'oak', trail: trail?.id ?? 'white' };
}

export function bundleSkin(item: { bundle?: string }): Skin | undefined {
  return item.bundle ? SKINS.find((s) => s.id === item.bundle && !isFreeSkin(s)) : undefined;
}

// Remote loadouts come off the network: keep only ids we know.
export function sanitizeLoadout(l: Partial<Loadout> | undefined): Loadout {
  return {
    head: HEADS.some((i) => i.id === l?.head) ? l!.head! : DEFAULT_LOADOUT.head,
    bow: BOWS.some((i) => i.id === l?.bow) ? l!.bow! : DEFAULT_LOADOUT.bow,
    trail: TRAILS.some((i) => i.id === l?.trail) ? l!.trail! : DEFAULT_LOADOUT.trail,
  };
}
