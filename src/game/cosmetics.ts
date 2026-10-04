// "Choose your style": the stickman is always matte black; what you wear on
// top is a loadout of three slots — headgear, bow, arrow trail. The only
// things on offer are the hero characters: each hero's head is unlocked by
// owning that hero's skin from the shop (skins.ts, paid in SOL/SKR and
// verified server-side), and wearing it brings the sheet's recurve and red
// fletching. Everyone else is the plain classic archer. No accessories.
import { AI_SKIN, DEFAULT_SKIN_ID, SKINS, canonicalSkinId, isFreeSkin, type Skin } from '@/game/skins';
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
  | 'face'; // a hero's sculpted head, see faces.ts

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type HeadItem = { id: string; name: string; hat: Hat; color: string; rarity: Rarity; bundle?: string; eyes?: string; face?: FaceId };
export type BowItem = { id: string; name: string; color: string; accent: string; rarity: Rarity; bundle?: string; glow?: boolean };
export type TrailItem = { id: string; name: string; color: string; rarity: Rarity; bundle?: string };
export type Item = HeadItem | BowItem | TrailItem;

// `bundle` = the skin id that unlocks it; no bundle = free for everyone.
export const HEADS: HeadItem[] = [
  { id: 'bare', name: 'Classic', hat: 'none', color: '#FFFFFF', rarity: 'common' },
  // The heroes: purchase-only, one shop skin each.
  ...SKINS.filter((s) => s.face).map(
    (s): HeadItem => ({ id: s.id, name: s.name, hat: 'face', face: s.face, color: s.color, rarity: 'legendary', bundle: s.id }),
  ),
];

// Not picked by the player: the classic archer's bow and trail, and the
// heroes' brown recurve and red fletching from the character sheets.
export const BOWS: BowItem[] = [
  { id: 'oak', name: 'Oak Bow', color: '#8B5A2B', accent: '#E9D8A6', rarity: 'common' },
  { id: 'recurve', name: 'Hero Recurve', color: '#6E3B1F', accent: '#C9A26B', rarity: 'common' },
];

export const TRAILS: TrailItem[] = [
  { id: 'white', name: 'Plain', color: '#FFFFFF', rarity: 'common' },
  { id: 'red', name: 'Red Fletch', color: '#D62828', rarity: 'common' },
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

// Random rival outfits so every matchmade AI opponent looks different: the
// classic archer or one of the heroes, dressed as that skin would be.
export function randomLoadout(rnd: () => number = Math.random): Loadout {
  const head = HEADS[Math.floor(rnd() * HEADS.length)];
  return loadoutForSkin(head.bundle ?? DEFAULT_SKIN_ID) ?? DEFAULT_LOADOUT;
}

export function ownsItem(item: Item, ownedSkins: string[]) {
  return item.bundle ? ownedSkins.includes(item.bundle) : true;
}

// The loadout a skin dresses you in when equipped: a hero's head with the
// sheet's recurve and red fletching, or the plain classic archer.
export function loadoutForSkin(skinId: string): Loadout | null {
  if (skinId === DEFAULT_SKIN_ID) return DEFAULT_LOADOUT;
  const head = HEADS.find((i) => i.bundle === skinId);
  return head ? { head: head.id, bow: 'recurve', trail: 'red' } : null;
}

export function bundleSkin(item: { bundle?: string }): Skin | undefined {
  return item.bundle ? SKINS.find((s) => s.id === item.bundle && !isFreeSkin(s)) : undefined;
}

// Remote loadouts come off the network: keep only ids we know (older builds
// still send the pre-rename hero ids).
export function sanitizeLoadout(l: Partial<Loadout> | undefined): Loadout {
  const head = l?.head ? canonicalSkinId(l.head) : undefined;
  return {
    head: HEADS.some((i) => i.id === head) ? head! : DEFAULT_LOADOUT.head,
    bow: BOWS.some((i) => i.id === l?.bow) ? l!.bow! : DEFAULT_LOADOUT.bow,
    trail: TRAILS.some((i) => i.id === l?.trail) ? l!.trail! : DEFAULT_LOADOUT.trail,
  };
}
