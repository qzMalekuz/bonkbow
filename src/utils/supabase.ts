import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from '@/utils/secureStore';

// Supabase is OPTIONAL for this game: it backs the leaderboard and account
// linking, but the core loop is fully offline. Unlike the paid-app boilerplate
// this does not crash release builds on missing config — it just disables the
// networked features (see isSupabaseConfigured) and warns in dev.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || 'placeholder-key';

export const isSupabaseConfigured =
  supabaseUrl !== 'https://placeholder.supabase.co' && supabaseKey !== 'placeholder-key';

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    'Supabase not configured — leaderboard disabled. Set EXPO_PUBLIC_SUPABASE_URL/KEY in .env.local (and as EAS env vars for cloud builds).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Session at rest is keychain-encrypted, not plaintext AsyncStorage.
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Guest identity: Supabase anonymous sign-in (enable "Allow anonymous
// sign-ins" under Auth → Sign In / Up). Idempotent; returns the user id or null.
export const ensureSession = async (): Promise<string | null> => {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session.user.id;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
};
