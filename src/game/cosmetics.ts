// What an archer wears: a loadout of derp (the head and its habit), hat,
// clothes, bow and arrows, each unlocked by owning its product (skins.ts).
// `lookFor` turns a loadout into everything the 3D rig needs.
import { BOWS, DERPS, DERP_IDS, HAT_IDS, type BowId, type DerpId, type Habit, type HatId, type HeadShape } from '@/game/derps';
import { ARROWS, ARROW_IDS, OUTFITS, OUTFIT_IDS, type ArrowId, type OutfitId } from '@/game/gear';
import { productId, ownsProduct, type ProductKind } from '@/game/skins';

export type Loadout = { derp: DerpId; hat: HatId; outfit: OutfitId; bow: BowId; arrow: ArrowId };
export const DEFAULT_LOADOUT: Loadout = { derp: 'gary', hat: 'none', outfit: 'none', bow: 'bow', arrow: 'classic' };
export const LOADOUT_SLOTS: ProductKind[] = ['derp', 'outfit', 'hat', 'bow', 'arrow'];

// Everything the 3D rig needs to dress an archer.
export type Look = {
  key: string; // changes whenever any visible part changes
  derp: DerpId;
  shape: HeadShape;
  neck: number; // extra neck, metres
  habit: Habit;
  seed: number;
  hat: HatId;
  outfit: OutfitId;
  bow: BowId;
  arrow: ArrowId;
  trail: string; // the streak behind the arrow in flight
  banner: string; // pennant + flag + UI accent
};

export function lookFor(l: Loadout): Look {
  const d = DERPS[l.derp] ?? DERPS.gary;
  const outfit = l.outfit in OUTFITS ? l.outfit : 'none';
  const arrow = l.arrow in ARROWS ? l.arrow : 'classic';
  return {
    key: `${d.id}|${l.hat}|${outfit}|${l.bow}|${arrow}`,
    derp: d.id,
    shape: d.shape,
    neck: d.neck,
    habit: d.habit,
    seed: d.seed,
    hat: l.hat,
    outfit,
    bow: l.bow,
    arrow,
    trail: ARROWS[arrow].trail,
    banner: d.color,
  };
}

// The AI rival's default: Some Guy, bored, no hat.
export const AI_LOOK: Look = lookFor({ ...DEFAULT_LOADOUT, derp: 'someguy' });

const pick = <T>(list: readonly T[], rnd: () => number) => list[Math.floor(rnd() * list.length)];

// Random rival outfits so every matchmade AI opponent looks different. Hats
// are common, clothes and fancy arrows less so; the shovel bow is rare.
export function randomLoadout(rnd: () => number = Math.random): Loadout {
  const derp = pick(DERP_IDS, rnd);
  const hat = rnd() < 0.55 ? pick(HAT_IDS.slice(1), rnd) : 'none';
  const bow: BowId = rnd() < 0.12 ? 'shovel' : rnd() < 0.3 ? pick(['toy', 'candy', 'bone', 'golden'] as BowId[], rnd) : 'bow';
  const outfit: OutfitId = rnd() < 0.4 ? pick(OUTFIT_IDS.slice(1), rnd) : 'none';
  const arrow: ArrowId = rnd() < 0.35 ? pick(ARROW_IDS.slice(1), rnd) : 'classic';
  return { derp, hat, outfit, bow, arrow };
}

// `paid`: SOL/SKR purchases (verified on-chain). `coin`: bought with coins on
// this device. ownsProduct keeps the two apart per product.
export const ownsPart = (l: Loadout, kind: ProductKind, paid: string[], coin: string[]) =>
  ownsProduct(productId(kind, l[kind as keyof Loadout]), paid, coin);

// Keep only the parts this player owns; the rest fall back to the defaults.
export function ownedLoadout(l: Loadout, paid: string[], coin: string[]): Loadout {
  const out = { ...l };
  for (const k of LOADOUT_SLOTS) {
    const key = k as keyof Loadout;
    if (!ownsPart(l, k, paid, coin)) (out as Record<keyof Loadout, string>)[key] = DEFAULT_LOADOUT[key];
  }
  return out;
}

// Remote loadouts come off the network: keep only ids we know.
export function sanitizeLoadout(l: Partial<Loadout> | undefined): Loadout {
  const derp = l?.derp;
  return {
    derp: derp && derp in DERPS ? derp : DEFAULT_LOADOUT.derp,
    hat: l?.hat && (HAT_IDS as string[]).includes(l.hat) ? l.hat : DEFAULT_LOADOUT.hat,
    outfit: l?.outfit && l.outfit in OUTFITS ? l.outfit : DEFAULT_LOADOUT.outfit,
    bow: l?.bow && l.bow in BOWS ? l.bow : DEFAULT_LOADOUT.bow,
    arrow: l?.arrow && l.arrow in ARROWS ? l.arrow : DEFAULT_LOADOUT.arrow,
  };
}
