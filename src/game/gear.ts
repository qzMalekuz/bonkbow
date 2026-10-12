// Clothes and arrows: the two loadout slots that aren't part of the head.
// Pure data, no renderer: the 3D rig (game3d/Stickman3D.ts) builds the
// clothes on the torso and the arrow mesh from these, the UI draws them in
// SVG (ui/GearThumb.tsx). Like every cosmetic, none of it changes a shot.

// What sits on the torso. `body` tints the whole stick body.
export type Accessory = 'none' | 'scarf' | 'tie' | 'cape' | 'tutu' | 'belt';
export type OutfitId = 'none' | 'scarf' | 'tie' | 'cape' | 'tutu' | 'belt' | 'onesie' | 'gold';

export type OutfitDef = {
  id: OutfitId;
  name: string;
  tagline: string;
  body: string; // stick body colour
  acc: Accessory;
  color: string; // the accessory's main colour (and the UI accent)
  trim: string; // its second colour
};

export const STICK_BLACK = '#0E0E10';

export const OUTFITS: Record<OutfitId, OutfitDef> = {
  none: { id: 'none', name: 'Just Stick', tagline: 'Nothing on. Nothing to hide.', body: STICK_BLACK, acc: 'none', color: '#5A5A66', trim: '#5A5A66' },
  scarf: { id: 'scarf', name: 'Cozy Scarf', tagline: 'Warm neck. Cold shots.', body: STICK_BLACK, acc: 'scarf', color: '#E53935', trim: '#FFFFFF' },
  tie: { id: 'tie', name: 'Office Tie', tagline: 'Dressed for the meeting he is missing.', body: STICK_BLACK, acc: 'tie', color: '#1E88E5', trim: '#0D47A1' },
  cape: { id: 'cape', name: 'Hero Cape', tagline: 'Does not fly. Has tried.', body: STICK_BLACK, acc: 'cape', color: '#C62828', trim: '#FFD23F' },
  tutu: { id: 'tutu', name: 'Tutu', tagline: 'Light on his feet. Heavy on the misses.', body: STICK_BLACK, acc: 'tutu', color: '#FF8FC7', trim: '#FFD1E8' },
  belt: { id: 'belt', name: 'Champ Belt', tagline: 'Never won it. Wears it anyway.', body: STICK_BLACK, acc: 'belt', color: '#FFC400', trim: '#B8860B' },
  onesie: { id: 'onesie', name: 'Blue Onesie', tagline: 'Straight out of bed and into the duel.', body: '#3D6FD6', acc: 'none', color: '#3D6FD6', trim: '#3D6FD6' },
  gold: { id: 'gold', name: 'Gold Suit', tagline: 'Solid gold. Solid miss.', body: '#D4A62A', acc: 'none', color: '#D4A62A', trim: '#FFF0B3' },
};
export const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[];

// An arrow: shaft, fletching and head colours, a tip shape and the colour of
// the glowing trail behind it in flight.
export type ArrowTip = 'point' | 'plunger' | 'pencil';
export type ArrowId = 'classic' | 'fire' | 'ice' | 'neon' | 'candy' | 'pencil' | 'plunger' | 'golden';

export type ArrowDef = {
  id: ArrowId;
  name: string;
  tagline: string;
  shaft: string;
  fletch: string;
  head: string;
  tip: ArrowTip;
  stripes?: string; // alternate shaft bands (candy)
  trail: string;
};

export const ARROWS: Record<ArrowId, ArrowDef> = {
  classic: { id: 'classic', name: 'Arrow', tagline: 'Pointy end first. Usually.', shaft: '#D9C39A', fletch: '#D62828', head: '#C8CCD2', tip: 'point', trail: '#D62828' },
  fire: { id: 'fire', name: 'Fire Arrow', tagline: 'Not actually on fire. Looks it.', shaft: '#3A2A20', fletch: '#FF6A00', head: '#FFB020', tip: 'point', trail: '#FF6A00' },
  ice: { id: 'ice', name: 'Ice Arrow', tagline: 'Cool. Very cool. Same damage.', shaft: '#DDF3FF', fletch: '#7FD8FF', head: '#BDEBFF', tip: 'point', trail: '#7FD8FF' },
  neon: { id: 'neon', name: 'Neon Arrow', tagline: 'You will see it miss from space.', shaft: '#1A1A1A', fletch: '#39FF88', head: '#39FF88', tip: 'point', trail: '#39FF88' },
  candy: { id: 'candy', name: 'Candy Cane', tagline: 'Seasonal. All seasons.', shaft: '#FFFFFF', stripes: '#E53950', fletch: '#FF9EC4', head: '#E53950', tip: 'point', trail: '#FF6FA8' },
  pencil: { id: 'pencil', name: 'Pencil', tagline: 'For the homework he did not do.', shaft: '#FFC72C', fletch: '#FF8FB1', head: '#F1D3A1', tip: 'pencil', trail: '#FFD23F' },
  plunger: { id: 'plunger', name: 'Plunger', tagline: 'Sticks. Emotionally.', shaft: '#C8955A', fletch: '#FFD23F', head: '#E53935', tip: 'plunger', trail: '#FF4D6D' },
  golden: { id: 'golden', name: 'Golden Arrow', tagline: 'Worth more than the shot.', shaft: '#E0B12B', fletch: '#FFFFFF', head: '#FFE27A', tip: 'point', trail: '#FFD23F' },
};
export const ARROW_IDS = Object.keys(ARROWS) as ArrowId[];
