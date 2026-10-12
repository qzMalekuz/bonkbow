// What an archer wears: a loadout of derp (the head and its habit), hat and
// bow, each unlocked by owning its product (skins.ts). `lookFor` turns a
// loadout into everything the 3D rig needs.
import { DERPS, DERP_IDS, HAT_IDS, type BowId, type DerpId, type Habit, type HatId, type HeadShape } from '@/game/derps';
import { productId, ownsProduct } from '@/game/skins';

export type Loadout = { derp: DerpId; hat: HatId; bow: BowId };
export const DEFAULT_LOADOUT: Loadout = { derp: 'gary', hat: 'none', bow: 'bow' };

// Everything the 3D rig needs to dress an archer.
export type Look = {
  key: string; // changes whenever any visible part changes
  derp: DerpId;
  shape: HeadShape;
  neck: number; // extra neck, metres
  habit: Habit;
  seed: number;
  hat: HatId;
  bow: BowId;
  trail: string; // arrow fletching / streak
  banner: string; // pennant + flag + UI accent
};

export function lookFor(l: Loadout): Look {
  const d = DERPS[l.derp] ?? DERPS.gary;
  return {
    key: `${d.id}|${l.hat}|${l.bow}`,
    derp: d.id,
    shape: d.shape,
    neck: d.neck,
    habit: d.habit,
    seed: d.seed,
    hat: l.hat,
    bow: l.bow,
    trail: '#D62828',
    banner: d.color,
  };
}

// The AI rival's default: Some Guy, bored, no hat.
export const AI_LOOK: Look = lookFor({ derp: 'someguy', hat: 'none', bow: 'bow' });

// Random rival outfits so every matchmade AI opponent looks different. Hats
// are common; the shovel bow is rare.
export function randomLoadout(rnd: () => number = Math.random): Loadout {
  const derp = DERP_IDS[Math.floor(rnd() * DERP_IDS.length)];
  const hat = rnd() < 0.55 ? HAT_IDS[1 + Math.floor(rnd() * (HAT_IDS.length - 1))] : 'none';
  const bow: BowId = rnd() < 0.12 ? 'shovel' : 'bow';
  return { derp, hat, bow };
}

// Does this wallet own every part of the loadout?
export function ownsLoadout(l: Loadout, owned: string[]) {
  return ownsProduct(productId('derp', l.derp), owned) && ownsProduct(productId('hat', l.hat), owned) && ownsProduct(productId('bow', l.bow), owned);
}

// Keep only the parts this wallet owns; the rest fall back to the defaults.
export function ownedLoadout(l: Loadout, owned: string[]): Loadout {
  return {
    derp: ownsProduct(productId('derp', l.derp), owned) ? l.derp : DEFAULT_LOADOUT.derp,
    hat: ownsProduct(productId('hat', l.hat), owned) ? l.hat : DEFAULT_LOADOUT.hat,
    bow: ownsProduct(productId('bow', l.bow), owned) ? l.bow : DEFAULT_LOADOUT.bow,
  };
}

// Remote loadouts come off the network: keep only ids we know.
export function sanitizeLoadout(l: Partial<Loadout> | undefined): Loadout {
  const derp = l?.derp;
  return {
    derp: derp && derp in DERPS ? derp : DEFAULT_LOADOUT.derp,
    hat: l?.hat && (HAT_IDS as string[]).includes(l.hat) ? l.hat : DEFAULT_LOADOUT.hat,
    bow: l?.bow === 'shovel' ? 'shovel' : 'bow',
  };
}
