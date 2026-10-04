import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SKIN_ID, SKINS, canonicalSkinId, isFreeSkin, type Currency } from '@/game/skins';
import { DEFAULT_LOADOUT, loadoutForSkin, type Loadout } from '@/game/cosmetics';
import { DEFAULT_MAP_ID, MAPS, isFreeMap } from '@/game/maps';

// Persistent, device-local game settings, best score, streak and cosmetics
// cache. Skin and map OWNERSHIP is server-authoritative (purchases table,
// written only by the verify-purchase edge function); `ownedSkins` (every
// purchased id: hero skins and shop maps) here is a cache
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
  equippedMap: string; // maps.ts id: where my duels (and rooms I host) happen
  preferredCurrency: Currency;
  pendingPurchase: PendingPurchase | null;
  // What the archer wears: always the equipped skin's loadout.
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
  equipSkin: (id: string) => void;
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
      equippedSkin: DEFAULT_SKIN_ID,
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
      // Equipping a skin dresses you in its items.
      equipSkin: (equippedSkin) => set((s) => ({ equippedSkin, loadout: loadoutForSkin(equippedSkin) ?? s.loadout })),
      equipMap: (equippedMap) => set({ equippedMap }),
      // Server-authoritative ownership replaces the cache; if the equipped skin
      // or map isn't in it (signed out, or a different wallet), fall back to a
      // free one.
      setOwnedSkins: (ids) =>
        set((s) => {
          const ownedSkins = Array.from(new Set([DEFAULT_SKIN_ID, ...ids.map(canonicalSkinId)]));
          const eq = SKINS.find((k) => k.id === s.equippedSkin);
          const keep = !!eq && (isFreeSkin(eq) || ownedSkins.includes(eq.id));
          const map = MAPS.find((m) => m.id === s.equippedMap);
          const mapOk = !!map && (isFreeMap(map) || ownedSkins.includes(map.id));
          return {
            ownedSkins,
            ...(keep ? {} : { equippedSkin: DEFAULT_SKIN_ID, loadout: DEFAULT_LOADOUT }),
            ...(mapOk ? {} : { equippedMap: DEFAULT_MAP_ID }),
          };
        }),
      addOwnedSkin: (id) => set((s) => ({ ownedSkins: Array.from(new Set([...s.ownedSkins, id])) })),
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
      version: 6,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 → v2 added streak/accuracy/currency; v3 added sound/music toggles;
      // v4 added loadout, progression and chat settings; v5 renamed the hero
      // skins (bro_* → hero_<name>); v6 dropped the coin accessories, so the
      // loadout is re-derived from the equipped skin.
      // persist's shallow merge fills new fields from the defaults above.
      migrate: (persisted, version) => {
        const s = persisted as GameSettings;
        if (version < 5 && s) {
          s.ownedSkins = (s.ownedSkins ?? []).map(canonicalSkinId);
          if (s.equippedSkin) s.equippedSkin = canonicalSkinId(s.equippedSkin);
          if (s.loadout?.head) s.loadout = { ...s.loadout, head: canonicalSkinId(s.loadout.head) };
          if (s.pendingPurchase) s.pendingPurchase = { ...s.pendingPurchase, skinId: canonicalSkinId(s.pendingPurchase.skinId) };
        }
        if (version < 6 && s) {
          s.loadout = loadoutForSkin(s.equippedSkin ?? DEFAULT_SKIN_ID) ?? DEFAULT_LOADOUT;
          delete (s as Partial<GameSettings> & { ownedItems?: string[] }).ownedItems;
        }
        return s;
      },
    },
  ),
);
