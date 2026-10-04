// Hero characters: real-person likenesses (Solana / Seeker community
// figures) built as chibi archers, one per page of archer-boys.pdf. In 3D
// each head is rebuilt from that sheet's own drawings (game3d/HeroHead.ts,
// scripts/heroes/build.sh) on their chibi suit and the shared rig.
// Each also has a 2048×1536 atlas cut from its character sheet (ten 512²
// tiles, four across by three down), which the UI uses for thumbnails
// (ui/FaceThumb.tsx):
//   row 0: smile, neutral, angry, laugh (eyes shut)
//   row 1: shock, right side, back, left side
//   row 2: front 3/4, back 3/4 (both with the face turned to image-right)
// Each hero is its own paid skin in the shop (skins.ts) — there is no free
// or coin path to one.
//
// NOTE: these are likenesses of real people. Get each person's OK before
// mainnet; swap the atlas, spec and name here if anyone declines.
export type FaceId = 'akshay' | 'beeman' | 'chase' | 'mit' | 'mert' | 'tolly';

export type FaceDef = {
  id: FaceId;
  name: string;
  tagline: string;
  page: number; // archer-boys.pdf page
  image: number; // require() module id — atlas; Image source and TextureLoader input
  base: string; // head colour under the tiles (hair, or skin when bald)
};

// Atlas tile indices.
export const TILE = { smile: 0, neutral: 1, angry: 2, laugh: 3, shock: 4, right: 5, back: 6, left: 7, front34: 8, back34: 9 } as const;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 3;

export const FACES: Record<FaceId, FaceDef> = {
  akshay: { id: 'akshay', name: 'Akshay', tagline: 'Grin first, aim later.', page: 1, image: require('../../assets/faces/hero_akshay.png'), base: '#17171A' },
  beeman: { id: 'beeman', name: 'Beeman', tagline: 'Never seen his eyes. Never missed.', page: 2, image: require('../../assets/faces/hero_beeman.png'), base: '#E8A77A' },
  chase: { id: 'chase', name: 'Chase', tagline: 'Hair by the wind. Shots by him.', page: 3, image: require('../../assets/faces/hero_chase.png'), base: '#A9733C' },
  mit: { id: 'mit', name: 'M-it', tagline: 'Clean cut, clean headshots.', page: 4, image: require('../../assets/faces/hero_mit.png'), base: '#7A4E2A' },
  mert: { id: 'mert', name: 'Mert', tagline: 'Full beard. Full send.', page: 5, image: require('../../assets/faces/hero_mert.png'), base: '#E3A072' },
  tolly: { id: 'tolly', name: 'Tolly', tagline: 'Wide eyes. Wider grin. Never misses.', page: 6, image: require('../../assets/faces/hero_tolly.png'), base: '#2E241F' },
};

export const FACE_IDS = Object.keys(FACES) as FaceId[];
