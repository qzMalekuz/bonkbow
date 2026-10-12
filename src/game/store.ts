import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SKIN_ID, canonicalSkinId, type Currency, type ProductKind } from '@/game/skins';
import { DEFAULT_LOADOUT, ownedLoadout, sanitizeLoadout, type Loadout } from '@/game/cosmetics';
import { DEFAULT_MAP_ID, MAPS, isFreeMap } from '@/game/maps';

// Persistent, device-local game settings, best score, streak and cosmetics
// cache. Product and map OWNERSHIP is server-authoritative (purchases table,
// written only by the verify-purchase edge function); `ownedSkins` (every
// purchased id: derp_*, hat_*, bow_* products and shop maps) here is a cache
// refreshed on sign-in and when the shop opens, so the shop works offline
// once loaded. What the archer wears is `loadout` (derp + hat + bow).

// A purchase whose on-chain transfer went out but whose server verification
// didn't complete (network drop). The shop retries it on open.
export type PendingPurchase = { signature: string; skinId: string; currency: Currency };

type GameSettings = {
  hapticsEnabled: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  highScore: number;
  gamesPlayed: number;
  // Adaptive AI input: lifetime shots + hits (decayed so recent form matters).
  shots: number;
  hits: number;
  // Daily streak: consecutive local days with at least one finished run.
  streak: number;
  lastPlayedDay: string | null; // YYYY-MM-DD local
  ownedSkins: string[];
  equippedMap: string; // maps.ts id: where my duels (and rooms I host) happen
  preferredCurrency: Currency;
  pendingPurchase: PendingPurchase | null;
  // What the archer wears; every part is one I own (or a free one).
  loadout: Loadout;
  // Progression: XP → level, coins from matches, duel record.
  xp: number;
  coins: number;
  wins: number;
  losses: number;
  blockOpponentMessages: boolean;
  setHaptics: (on: boolean) => void;
  setVibration: (on: boolean) => void;
  setSound: (on: boolean) => void;
  setMusic: (on: boolean) => void;
  recordGame: (score: number, shots: number, hits: number) => void;
  // Put on one part (derp, hat or bow); the caller checks ownership.
  equip: (kind: ProductKind, item: string) => void;
  setLoadout: (l: Loadout) => void;
  equipMap: (id: string) => void;
  setOwnedSkins: (ids: string[]) => void;
  addOwnedSkin: (id: string) => void;
  setPreferredCurrency: (c: Currency) => void;
  setPendingPurchase: (p: PendingPurchase | null) => void;
  // Match rewards. Returns the levels gained (for the level-up animation).
  grantRewards: (r: { xp: number; coins: number; won: boolean | null }) => number;
  setBlockOpponentMessages: (on: boolean) => void;
};

// XP needed to go from `level` to the next: 100, 150, 200, …
export const xpForLevel = (level: number) => 100 + (level - 1) * 50;

// Level and progress inside it for a lifetime XP total.
export function levelOf(xp: number) {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level += 1;
  }
  return { level, into: left, need: xpForLevel(level) };
}

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const nextStreak = (streak: number, last: string | null): number => {
  const today = localDay();
  if (last === today) return Math.max(1, streak);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return last === localDay(y) ? streak + 1 : 1;
};

// Hit rate in [0, 1]; 0.5 until there is enough data to mean anything.
export const accuracyOf = (shots: number, hits: number) => (shots < 5 ? 0.5 : hits / shots);

export const useGameStore = create<GameSettings>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      vibrationEnabled: true,
      soundEnabled: true,
      musicEnabled: true,
      highScore: 0,
      gamesPlayed: 0,
      shots: 0,
      hits: 0,
      streak: 0,
      lastPlayedDay: null,
      ownedSkins: [DEFAULT_SKIN_ID],
      equippedMap: DEFAULT_MAP_ID,
      preferredCurrency: 'SKR',
      pendingPurchase: null,
      loadout: DEFAULT_LOADOUT,
      xp: 0,
      coins: 0,
      wins: 0,
      losses: 0,
      blockOpponentMessages: false,
      setHaptics: (hapticsEnabled) => set({ hapticsEnabled }),
      setVibration: (vibrationEnabled) => set({ vibrationEnabled }),
      setSound: (soundEnabled) => set({ soundEnabled }),
      setMusic: (musicEnabled) => set({ musicEnabled }),
      recordGame: (score, shots, hits) =>
        set((s) => ({
          gamesPlayed: s.gamesPlayed + 1,
          highScore: Math.max(s.highScore, score),
          // Exponential decay keeps the AI tuned to how you shoot *lately*.
          shots: s.shots * 0.8 + shots,
          hits: s.hits * 0.8 + hits,
          streak: nextStreak(s.streak, s.lastPlayedDay),
          lastPlayedDay: localDay(),
        })),
      // Unknown ids fall back to the defaults (sanitizeLoadout).
      equip: (kind, item) => set((s) => ({ loadout: sanitizeLoadout({ ...s.loadout, [kind]: item }) })),
      setLoadout: (l) => set({ loadout: sanitizeLoadout(l) }),
      equipMap: (equippedMap) => set({ equippedMap }),
      // Server-authoritative ownership replaces the cache; any worn part or
      // map not in it (signed out, or a different wallet) falls back to a
      // free one.
      setOwnedSkins: (ids) =>
        set((s) => {
          const ownedSkins = Array.from(new Set([DEFAULT_SKIN_ID, ...ids.map(canonicalSkinId)]));
          const l = ownedLoadout(s.loadout, ownedSkins);
          const same = l.derp === s.loadout.derp && l.hat === s.loadout.hat && l.bow === s.loadout.bow;
          const map = MAPS.find((m) => m.id === s.equippedMap);
          const mapOk = !!map && (isFreeMap(map) || ownedSkins.includes(map.id));
          return {
            ownedSkins,
            ...(same ? {} : { loadout: l }),
            ...(mapOk ? {} : { equippedMap: DEFAULT_MAP_ID }),
          };
        }),
      addOwnedSkin: (id) => set((s) => ({ ownedSkins: Array.from(new Set([...s.ownedSkins, canonicalSkinId(id)])) })),
      setPreferredCurrency: (preferredCurrency) => set({ preferredCurrency }),
      setPendingPurchase: (pendingPurchase) => set({ pendingPurchase }),
      grantRewards: ({ xp, coins, won }) => {
        let gained = 0;
        set((s) => {
          gained = levelOf(s.xp + xp).level - levelOf(s.xp).level;
          return {
            xp: s.xp + xp,
            coins: s.coins + coins,
            wins: s.wins + (won === true ? 1 : 0),
            losses: s.losses + (won === false ? 1 : 0),
          };
        });
        return gained;
      },
      setBlockOpponentMessages: (blockOpponentMessages) => set({ blockOpponentMessages }),
    }),
    {
      name: 'monolith.game', // storage key kept so existing installs keep their progress
      version: 7,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 → v2 added streak/accuracy/currency; v3 added sound/music toggles;
      // v4 added loadout, progression and chat settings; v5 and v6 reshaped
      // the old skin catalogue; v7 is the derps: the loadout is
      // { derp, hat, bow } and there is no equipped skin. Anything older
      // becomes the defaults.
      // persist's shallow merge fills new fields from the defaults above.
      migrate: (persisted, version) => {
        if (!persisted) return persisted as GameSettings;
        const s = persisted as GameSettings & { equippedSkin?: string; ownedItems?: string[]; loadout?: Partial<Loadout> & { head?: string } };
        if (version < 7) {
          s.ownedSkins = Array.from(new Set([DEFAULT_SKIN_ID, ...(s.ownedSkins ?? []).map(canonicalSkinId)]));
          // An interrupted purchase is re-verified under its current id.
          if (s.pendingPurchase) s.pendingPurchase = { ...s.pendingPurchase, skinId: canonicalSkinId(s.pendingPurchase.skinId) };
          const worn = canonicalSkinId(s.loadout?.head ?? s.equippedSkin ?? DEFAULT_SKIN_ID);
          const m = /^(derp|hat|bow)_(.+)$/.exec(worn);
          const l = m ? sanitizeLoadout({ ...DEFAULT_LOADOUT, [m[1]]: m[2] }) : DEFAULT_LOADOUT;
          s.loadout = ownedLoadout(l, s.ownedSkins);
          delete s.equippedSkin;
          delete s.ownedItems;
        }
        return s as GameSettings;
      },
    },
  ),
);
