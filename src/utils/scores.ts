import { ensureSession, isSupabaseConfigured, supabase } from '@/utils/supabase';

// Best-effort leaderboard write. The device-local high score (game/store.ts)
// is the source of truth for the UI; this just mirrors finished runs to the
// `scores` table when Supabase is configured. The wallet address on the row
// is stamped server-side from the caller's SIWS identity (schema.sql), so a
// guest's runs show up on the board only after they sign in. Never throws.
export const submitScore = async (score: number): Promise<void> => {
  if (!isSupabaseConfigured || score <= 0) return;
  try {
    const userId = await ensureSession();
    if (!userId) return;
    await supabase.from('scores').insert({ user_id: userId, score });
  } catch {
    // offline / RLS / not configured — silently skip
  }
};

export type LeaderboardRow = { wallet_address: string | null; best: number };

export const fetchLeaderboard = async (limit = 20): Promise<LeaderboardRow[]> => {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase.from('leaderboard').select('wallet_address, best').limit(limit);
    if (error || !data) return [];
    return data as LeaderboardRow[];
  } catch {
    return [];
  }
};
