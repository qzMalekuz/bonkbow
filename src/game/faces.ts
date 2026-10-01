// Hero characters: real-person likenesses (Solana / Seeker community
// figures) built as chibi archers on the stickman rig. Each one has a
// 2048×1024 texture atlas cut from its archer-boys.pdf character sheet:
// eight 512² tiles, four across by two down —
//   row 0: smile, neutral, angry, laugh (eyes shut)
//   row 1: shock, right side, back, left side
// The rig wraps the expression tile over the front of an oversized head
// and the side/back tiles around the rest, swapping the front tile with
// the archer's mood. Each hero is locked behind its own paid skin bundle
// (skins.ts) — there is no free or coin path to one.
//
// NOTE: these are likenesses of real people. Get each person's OK before
// mainnet; swap the texture (and the name) here if anyone declines.
export type FaceId = 'smile' | 'shades' | 'curls' | 'fade' | 'mobile' | 'beard';

export type FaceDef = {
  id: FaceId;
  name: string;
  tagline: string;
  image: number; // require() module id — atlas; Image source and TextureLoader input
  base: string; // head colour under the tiles (hair, or skin when bald)
};

// Atlas tile indices.
export const TILE = { smile: 0, neutral: 1, angry: 2, laugh: 3, shock: 4, right: 5, back: 6, left: 7 } as const;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

export const FACES: Record<FaceId, FaceDef> = {
  smile: { id: 'smile', name: 'The Smile', tagline: 'Grin first, aim later.', image: require('../../assets/faces/hero_smile.png'), base: '#17171A' },
  shades: { id: 'shades', name: 'Shades', tagline: 'Never seen his eyes. Never missed.', image: require('../../assets/faces/hero_shades.png'), base: '#E8A77A' },
  curls: { id: 'curls', name: 'Curls', tagline: 'Hair by the wind. Shots by him.', image: require('../../assets/faces/hero_curls.png'), base: '#A9733C' },
  fade: { id: 'fade', name: 'The Fade', tagline: 'Clean cut, clean headshots.', image: require('../../assets/faces/hero_fade.png'), base: '#2E241F' },
  mobile: { id: 'mobile', name: 'Mobile', tagline: 'Built for the phone in your hand.', image: require('../../assets/faces/hero_mobile.png'), base: '#7A4E2A' },
  beard: { id: 'beard', name: 'The Beard', tagline: 'Full beard. Full send.', image: require('../../assets/faces/hero_beard.png'), base: '#E3A072' },
};

export const FACE_IDS = Object.keys(FACES) as FaceId[];
