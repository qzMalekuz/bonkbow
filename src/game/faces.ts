// Face masks: real-person likenesses (Solana / Seeker community figures)
// worn as a printed visor on a helmet over the stickman's head. Textures
// are 512² PNGs cut from the "archer boys" character sheets
// (archer-boys.pdf, facial-expressions row, neutral face) with the
// background knocked out so the visor shows through around the hair.
// Each mask is locked behind its own paid skin bundle
// (skins.ts) — there is no free or coin path to a face.
//
// NOTE: these are likenesses of real people. Get each person's OK before
// mainnet; swap the texture (and the name) here if anyone declines.
export type FaceId = 'smile' | 'shades' | 'curls' | 'fade' | 'mobile' | 'beard';

export type FaceDef = {
  id: FaceId;
  name: string;
  tagline: string;
  image: number; // require() module id — Image source and TextureLoader input
  opaque?: boolean; // photo crop with no alpha: skip the visor backing tint
};

export const FACES: Record<FaceId, FaceDef> = {
  smile: { id: 'smile', name: 'The Smile', tagline: 'Grin first, aim later.', image: require('../../assets/faces/face_smile.png') },
  shades: { id: 'shades', name: 'Shades', tagline: 'Never seen his eyes. Never missed.', image: require('../../assets/faces/face_shades.png') },
  curls: { id: 'curls', name: 'Curls', tagline: 'Hair by the wind. Shots by him.', image: require('../../assets/faces/face_curls.png') },
  fade: { id: 'fade', name: 'The Fade', tagline: 'Clean cut, clean headshots.', image: require('../../assets/faces/face_fade.png') },
  mobile: { id: 'mobile', name: 'Mobile', tagline: 'Built for the phone in your hand.', image: require('../../assets/faces/face_mobile.png') },
  beard: { id: 'beard', name: 'The Beard', tagline: 'Full beard. Full send.', image: require('../../assets/faces/face_beard.png') },
};

export const FACE_IDS = Object.keys(FACES) as FaceId[];
