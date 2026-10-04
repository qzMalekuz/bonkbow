import type { FaceId } from '@/game/faces';

// What makes each hero recognisable, as data. HeroHead.ts sculpts a head
// from one of these; the body, bow, quiver, arrows and every animation are
// the shared StickmanRig, so adding a hero is adding an entry here (plus its
// FaceId in faces.ts and a skin in skins.ts).
//
// Looks are read off the character sheets in archer-boys.pdf (page order:
// smile, shades, curls, fade, beard, mobile).

export type HairStyle = 'bald' | 'textured' | 'neat' | 'quiff' | 'curls';
export type BeardStyle = 'none' | 'stubble' | 'short' | 'full' | 'long';

export type HeroSpec = {
  id: FaceId;
  skin: string;
  skull: [number, number, number]; // depth, height, width of the head (× its radius)
  hair: { style: HairStyle; color: string; tint: string }; // tint = lighter strands
  beard: { style: BeardStyle; color: string; tint: string };
  mustache: 'none' | 'thin'; // beards bring their own
  brows: { color: string; weight: number; tilt: number; lift: number }; // tilt > 0 = stern
  eyes: { iris: string; size: number };
  ears: number; // size factor
  glasses: boolean; // wraparound shades: real geometry, hides the eyes
  rest: { smile: number; open: number }; // resting mouth: -1 frown … 1 smile, 0 shut … 1 open
};

export const HERO_SPECS: Record<FaceId, HeroSpec> = {
  // Young, short dark textured hair with faded sides, dark beard, big grin.
  smile: {
    id: 'smile',
    skin: '#DFA075',
    skull: [0.96, 0.97, 1.0],
    hair: { style: 'textured', color: '#17151A', tint: '#2B2830' },
    beard: { style: 'short', color: '#17151A', tint: '#24222A' },
    mustache: 'none',
    brows: { color: '#17151A', weight: 1.15, tilt: 0.05, lift: 0 },
    eyes: { iris: '#5A3520', size: 1.05 },
    ears: 1,
    glasses: false,
    rest: { smile: 0.9, open: 0.62 },
  },
  // Completely bald, big grey beard, dark wraparound sunglasses.
  shades: {
    id: 'shades',
    skin: '#E6A27C',
    skull: [0.98, 1.0, 1.0],
    hair: { style: 'bald', color: '#A9ADB3', tint: '#D5D7DB' },
    beard: { style: 'long', color: '#9EA2A9', tint: '#D2D5DA' },
    mustache: 'none',
    brows: { color: '#8D9197', weight: 0.9, tilt: 0.25, lift: 0.05 },
    eyes: { iris: '#3B2A20', size: 1 },
    ears: 1,
    glasses: true,
    rest: { smile: -0.15, open: 0 },
  },
  // Shoulder-length curly brown hair, thin moustache, serious.
  curls: {
    id: 'curls',
    skin: '#ECB590',
    skull: [0.95, 1.0, 0.95],
    hair: { style: 'curls', color: '#74441F', tint: '#BC8443' },
    beard: { style: 'none', color: '#5A3A22', tint: '#5A3A22' },
    mustache: 'thin',
    brows: { color: '#5A3A22', weight: 0.9, tilt: 0.12, lift: 0 },
    eyes: { iris: '#4A3020', size: 0.95 },
    ears: 0.9,
    glasses: false,
    rest: { smile: -0.1, open: 0 },
  },
  // Swept-up brown hair, short sides, clean-shaven, cheerful.
  fade: {
    id: 'fade',
    skin: '#EFB38D',
    skull: [0.96, 0.98, 0.98],
    hair: { style: 'quiff', color: '#6A4023', tint: '#94603A' },
    beard: { style: 'none', color: '#6A4023', tint: '#6A4023' },
    mustache: 'none',
    brows: { color: '#5C3A22', weight: 0.9, tilt: -0.05, lift: 0.04 },
    eyes: { iris: '#5F7F8E', size: 1 },
    ears: 1.05,
    glasses: false,
    rest: { smile: 0.85, open: 0.58 },
  },
  // Bald, full black beard, heavy stern brows.
  beard: {
    id: 'beard',
    skin: '#E09A68',
    skull: [0.97, 1.0, 1.0],
    hair: { style: 'bald', color: '#141216', tint: '#24222A' },
    beard: { style: 'full', color: '#141216', tint: '#24222A' },
    mustache: 'none',
    brows: { color: '#141216', weight: 1.35, tilt: 0.42, lift: -0.03 },
    eyes: { iris: '#4A2C1A', size: 0.98 },
    ears: 1,
    glasses: false,
    rest: { smile: -0.3, open: 0 },
  },
  // Short dark hair, stubble, compact face, big eyes and ears.
  mobile: {
    id: 'mobile',
    skin: '#E8AB85',
    skull: [0.95, 0.94, 1.02],
    hair: { style: 'neat', color: '#2C2624', tint: '#4A423E' },
    beard: { style: 'stubble', color: '#4A3830', tint: '#4A3830' },
    mustache: 'none',
    brows: { color: '#2C2624', weight: 0.8, tilt: -0.12, lift: 0.03 },
    eyes: { iris: '#4A2E1E', size: 1.14 },
    ears: 1.25,
    glasses: false,
    rest: { smile: 0.4, open: 0 },
  },
};
