import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SKIN_ID, SKINS, isFreeSkin, type Currency } from '@/game/skins';
import { DEFAULT_LOADOUT, loadoutForSkin, type Loadout } from '@/game/cosmetics';

// Persistent, device-local game settings, best score, streak and cosmetics
// cache. Skin OWNERSHIP is server-authoritative (purchases table, written only
// by the verify-purchase edge function); `ownedSkins` here is a cache
// refreshed on sign-in and when the shop opens, so the shop works offline
// once loaded.

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
  equippedSkin: string;
  ownedSkins: string[];
  preferredCurrency: Currency;
  pendingPurchase: PendingPurchase | null;
  // "Choose your style" loadout and coin-claimed items.
  loadout: Loadout;
  ownedItems: string[];
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
  equipSkin: (id: string) => void;
  setOwnedSkins: (ids: string[]) => void;
  addOwnedSkin: (id: string) => void;
  setPreferredCurrency: (c: Currency) => void;
  setPendingPurchase: (p: PendingPurchase | null) => void;
  setLoadout: (slot: keyof Loadout, id: string) => void;
  // Spend coins on an item; false when there aren't enough.
  claimItem: (id: string, price: number) => boolean;
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
      equippedSkin: DEFAULT_SKIN_ID,
      ownedSkins: [DEFAULT_SKIN_ID],
      preferredCurrency: 'SKR',
      pendingPurchase: null,
      loadout: DEFAULT_LOADOUT,
      ownedItems: [],
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
      // Equipping a skin bundle from the shop dresses you in its items.
      equipSkin: (equippedSkin) => set((s) => ({ equippedSkin, loadout: loadoutForSkin(equippedSkin) ?? s.loadout })),
      // Server-authoritative ownership replaces the cache; if the equipped skin
      // isn't in it (signed out, or a different wallet), fall back to a free one.
      setOwnedSkins: (ids) =>
        set((s) => {
          const ownedSkins = Array.from(new Set([DEFAULT_SKIN_ID, ...ids]));
          const eq = SKINS.find((k) => k.id === s.equippedSkin);
          const keep = !!eq && (isFreeSkin(eq) || ownedSkins.includes(eq.id));
          return { ownedSkins, equippedSkin: keep ? s.equippedSkin : DEFAULT_SKIN_ID };
        }),
      addOwnedSkin: (id) => set((s) => ({ ownedSkins: Array.from(new Set([...s.ownedSkins, id])) })),
      setPreferredCurrency: (preferredCurrency) => set({ preferredCurrency }),
      setPendingPurchase: (pendingPurchase) => set({ pendingPurchase }),
      setLoadout: (slot, id) => set((s) => ({ loadout: { ...s.loadout, [slot]: id } })),
      claimItem: (id, price) => {
        let ok = false;
        set((s) => {
          if (s.ownedItems.includes(id) || s.coins < price) return s;
          ok = true;
          return { coins: s.coins - price, ownedItems: [...s.ownedItems, id] };
        });
        return ok;
      },
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
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 → v2 added streak/accuracy/currency; v3 added sound/music toggles;
      // v4 added loadout, progression and chat settings.
      // persist's shallow merge fills new fields from the defaults above.
      migrate: (persisted) => persisted as GameSettings,
    },
  ),
);
