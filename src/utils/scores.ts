import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-local leaderboard: the best vs-AI runs played on this phone. The
// all-time high score itself lives in game/store.ts; this keeps the top runs
// with their date so the board has rows. Never throws.
const KEY = 'bonkbow.bestRuns';
const KEEP = 20;

export type RunRow = { score: number; at: number };

export const fetchBestRuns = async (): Promise<RunRow[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as RunRow[]) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

export const submitScore = async (score: number): Promise<void> => {
  if (score <= 0) return;
  try {
    const rows = await fetchBestRuns();
    const next = [...rows, { score, at: Date.now() }].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, KEEP);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — the store's high score still updates
  }
};

export const clearBestRuns = () => AsyncStorage.removeItem(KEY).catch(() => {});
