// Hero characters: real-person likenesses (Solana / Seeker community
// figures) built as chibi archers on the stickman rig. In 3D each one is a
// sculpted head (game3d/HeroHead.ts) described by its entry in
// game3d/heroSpecs.ts — hair, beard, glasses, colours — on the shared body.
// Each also has a 2048×1536 atlas cut from its archer-boys.pdf character
// sheet (ten 512² tiles, four across by three down), which the UI uses for
// thumbnails (ui/FaceThumb.tsx):
//   row 0: smile, neutral, angry, laugh (eyes shut)
//   row 1: shock, right side, back, left side
//   row 2: front 3/4, back 3/4 (both with the face turned to image-right)
// Each hero is locked behind its own paid skin bundle (skins.ts) — there is
// no free or coin path to one.
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
export const TILE = { smile: 0, neutral: 1, angry: 2, laugh: 3, shock: 4, right: 5, back: 6, left: 7, front34: 8, back34: 9 } as const;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 3;

export const FACES: Record<FaceId, FaceDef> = {
  smile: { id: 'smile', name: 'The Smile', tagline: 'Grin first, aim later.', image: require('../../assets/faces/hero_smile.png'), base: '#17171A' },
  shades: { id: 'shades', name: 'Shades', tagline: 'Never seen his eyes. Never missed.', image: require('../../assets/faces/hero_shades.png'), base: '#E8A77A' },
  curls: { id: 'curls', name: 'Curls', tagline: 'Hair by the wind. Shots by him.', image: require('../../assets/faces/hero_curls.png'), base: '#A9733C' },
  fade: { id: 'fade', name: 'The Fade', tagline: 'Clean cut, clean headshots.', image: require('../../assets/faces/hero_fade.png'), base: '#2E241F' },
  mobile: { id: 'mobile', name: 'Mobile', tagline: 'Built for the phone in your hand.', image: require('../../assets/faces/hero_mobile.png'), base: '#7A4E2A' },
  beard: { id: 'beard', name: 'The Beard', tagline: 'Full beard. Full send.', image: require('../../assets/faces/hero_beard.png'), base: '#E3A072' },
};

export const FACE_IDS = Object.keys(FACES) as FaceId[];
