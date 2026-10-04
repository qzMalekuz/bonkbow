import type { FaceId } from '@/game/faces';

// What each hero wears, read off their character sheet in archer-boys.pdf
// (page = FACES[id].page). The head itself is not described here: it is
// rebuilt from the sheet's own drawings (scripts/heroes/project.py). The
// suit (scripts/heroes/body.ts) uses these outfit details; bake both with
// scripts/heroes/build.sh.

export type HeroSpec = {
  id: FaceId;
  outfit: {
    straps: 'none' | 'single' | 'cross'; // leather straps across the chest
    jacket: 'none' | 'blazer' | 'quilted';
    quiver: boolean; // Beeman carries spare arrows in hand instead
  };
};

export const HERO_SPECS: Record<FaceId, HeroSpec> = {
  akshay: { id: 'akshay', outfit: { straps: 'single', jacket: 'none', quiver: true } },
  beeman: { id: 'beeman', outfit: { straps: 'none', jacket: 'none', quiver: false } },
  chase: { id: 'chase', outfit: { straps: 'single', jacket: 'none', quiver: true } },
  mit: { id: 'mit', outfit: { straps: 'single', jacket: 'blazer', quiver: true } },
  mert: { id: 'mert', outfit: { straps: 'cross', jacket: 'none', quiver: true } },
  tolly: { id: 'tolly', outfit: { straps: 'cross', jacket: 'quilted', quiver: true } },
};
