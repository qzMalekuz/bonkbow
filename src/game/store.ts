import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SKIN_ID, canonicalSkinId, getSkin, isCoinSkin, ownsProduct, type Currency, type ProductKind } from '@/game/skins';
import { DEFAULT_LOADOUT, ownedLoadout, sanitizeLoadout, type Loadout } from '@/game/cosmetics';
import { DEFAULT_MAP_ID, MAPS, isFreeMap } from '@/game/maps';
import { cleanName, summarize, type MatchStats, type RewardSummary } from '@/game/progression';

export { levelOf, xpForLevel } from '@/game/progression';

// Persistent, device-local game settings, best score, streak and cosmetics
// cache. Product and map OWNERSHIP is server-authoritative (purchases table,
// written only by the verify-purchase edge function); `ownedSkins` (every
// purchased id: derp_*, hat_*, bow_* products and shop maps) here is a cache
// refreshed on sign-in and when the shop opens, so the shop works offline
// once loaded. Items bought with coins live in `coinItems` instead, on this
// device only, and never feed `ownedSkins`. What the archer wears is
// `loadout` (derp, clothes, hat, bow, arrows).

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
  // Daily streak: consecutive local days with at least one finished match.
  streak: number;
  lastPlayedDay: string | null; // YYYY-MM-DD local
  lastBonusDay: string | null; // the day the daily coin bonus was last paid
  // What the player calls themselves ('' until they pick a name).
  playerName: string;
  ownedSkins: string[]; // SOL/SKR purchases, server-verified
  coinItems: string[]; // product ids bought with coins
  equippedMap: string; // maps.ts id: where my duels (and rooms I host) happen
  preferredCurrency: Currency;
  pendingPurchase: PendingPurchase | null;
  // What the archer wears; every part is one I own (or a free one).
  loadout: Loadout;
  // Progression (progression.ts): XP → level, coins, duel record.
  xp: number;
  coins: number;
  wins: number;
  losses: number;
  blockOpponentMessages: boolean;
  setHaptics: (on: boolean) => void;
  setVibration: (on: boolean) => void;
  setSound: (on: boolean) => void;
  setMusic: (on: boolean) => void;
  // vs-AI run stats: best score and the adaptive AI's accuracy input.
  recordGame: (score: number, shots: number, hits: number) => void;
  // Put on one part; the caller checks ownership.
  equip: (kind: ProductKind, item: string) => void;
  setLoadout: (l: Loadout) => void;
  equipMap: (id: string) => void;
  setOwnedSkins: (ids: string[]) => void;
  addOwnedSkin: (id: string) => void;
  setPreferredCurrency: (c: Currency) => void;
  setPendingPurchase: (p: PendingPurchase | null) => void;
  // Pays a finished match (XP, coins, daily and level-up bonuses), counts
  // the win or loss and the daily streak. Returns the breakdown.
  finishMatch: (m: MatchStats) => RewardSummary;
  // Spend coins on a coin item. False if it isn't one, is owned, or is too dear.
  buyWithCoins: (id: string) => boolean;
  setPlayerName: (name: string) => void;
  setBlockOpponentMessages: (on: boolean) => void;
};

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
    (set, get) => ({
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
      lastBonusDay: null,
      playerName: '',
      ownedSkins: [DEFAULT_SKIN_ID],
      coinItems: [],
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
          const l = ownedLoadout(s.loadout, ownedSkins, s.coinItems);
          const same = (Object.keys(l) as (keyof Loadout)[]).every((k) => l[k] === s.loadout[k]);
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
      finishMatch: (m) => {
        const s = get();
        const today = localDay();
        const r = summarize(m, s.xp, s.lastBonusDay !== today);
        set({
          xp: s.xp + r.xp,
          coins: s.coins + r.coins,
          wins: s.wins + (m.online && m.outcome !== 'lose' ? 1 : 0),
          losses: s.losses + (m.online && m.outcome === 'lose' ? 1 : 0),
          streak: nextStreak(s.streak, s.lastPlayedDay),
          lastPlayedDay: today,
          lastBonusDay: today,
        });
        return r;
      },
      buyWithCoins: (id) => {
        const s = get();
        const item = getSkin(id);
        if (!item || !isCoinSkin(item) || ownsProduct(id, s.ownedSkins, s.coinItems) || s.coins < item.priceCoins) return false;
        set({ coins: s.coins - item.priceCoins, coinItems: [...s.coinItems, id] });
        return true;
      },
      setPlayerName: (name) => set({ playerName: cleanName(name) }),
      setBlockOpponentMessages: (blockOpponentMessages) => set({ blockOpponentMessages }),
    }),
    {
      name: 'monolith.game', // storage key kept so existing installs keep their progress
      version: 8,
      storage: createJSONStorage(() => AsyncStorage),
      // v1 → v2 added streak/accuracy/currency; v3 added sound/music toggles;
      // v4 added loadout, progression and chat settings; v5 and v6 reshaped
      // the old skin catalogue; v7 is the derps: the loadout is
      // { derp, hat, bow } and there is no equipped skin; v8 adds clothes and
      // arrows to the loadout, coin items and the player name. Anything older
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
          s.loadout = ownedLoadout(l, s.ownedSkins, []);
          delete s.equippedSkin;
          delete s.ownedItems;
        }
        if (version < 8) s.loadout = sanitizeLoadout(s.loadout);
        return s as GameSettings;
      },
    },
  ),
);
