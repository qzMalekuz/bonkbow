import { Stack, useNavigationContainerRef } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { LoadingScreen, nextLoadingVariant } from '@/ui/LoadingScreen';
import { lookFor } from '@/game/cosmetics';
import { useGameStore } from '@/game/store';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { MobileWalletProvider } from '@wallet-ui/react-native-kit';
import { APP_IDENTITY, CLUSTER } from '@/solana/config';
import { ensureSession } from '@/utils/supabase';
import { useOTAUpdates } from '@/hooks/useOTAUpdates';
import { initAudio } from '@/audio/sound';

// Preload every sound effect and set the audio session before any screen mounts.
initAudio();

// Records expo-router screen changes as breadcrumbs on Sentry events.
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 1.0,
  integrations: [navigationIntegration],
});

// Keep the splash screen visible while we initialize.
SplashScreen.preventAutoHideAsync();

// Missing key: keep the provider mounted (usePostHog stays safe everywhere)
// but disable the client instead of crashing on an undefined apiKey.
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

// Minimum time the startup loading screen stays up, so it reads as a
// deliberate beat rather than a flash.
const BOOT_MIN_MS = 2200;

function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold });
  const [boot] = useState(() => ({ variant: nextLoadingVariant(), start: Date.now() }));
  const [progress, setProgress] = useState(0.05);
  const [booting, setBooting] = useState(true);
  const loadout = useGameStore((s) => s.loadout);

  // Startup progress: fonts + session, then a short settle so the first
  // 3D screen has compiled its shaders behind the loading art.
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - boot.start;
      const timeK = Math.min(1, elapsed / BOOT_MIN_MS);
      setProgress(Math.min(fontsLoaded ? 1 : 0.6, 0.05 + timeK * 0.95));
      if (fontsLoaded && elapsed >= BOOT_MIN_MS) {
        clearInterval(id);
        setBooting(false);
      }
    }, 80);
    return () => clearInterval(id);
  }, [fontsLoaded, boot]);

  // OTA: check on every foreground, prompt to restart when the download lands.
  useOTAUpdates();

  useEffect(() => {
    if (navigationRef) navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(() => {
    // Guest identity for the leaderboard — silent no-op when Supabase isn't
    // configured. Wallet linking happens on connect (WalletButton → scores).
    ensureSession()
      .then((id) => {
        if (id) Sentry.setUser({ id });
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PostHogProvider
        apiKey={posthogKey || 'phc_placeholder'}
        options={{
          host: 'https://us.i.posthog.com',
          disabled: !posthogKey,
          enableSessionReplay: true,
        }}
        autocapture
      >
        {/* Mobile Wallet Adapter session + @solana/kit RPC client. The auth
            token is cached in AsyncStorage so reconnects are silent. */}
        <MobileWalletProvider cluster={{ id: CLUSTER.id, url: CLUSTER.url }} identity={APP_IDENTITY}>
          <StatusBar hidden />
          <View style={{ flex: 1, backgroundColor: '#0B0B0F' }}>
            {fontsLoaded && (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B0B0F' }, animation: 'fade' }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="match" options={{ gestureEnabled: false }} />
                <Stack.Screen name="game" options={{ gestureEnabled: false }} />
                <Stack.Screen name="result" options={{ gestureEnabled: false }} />
                <Stack.Screen name="style" />
                <Stack.Screen name="lobby" />
                <Stack.Screen name="shop" />
                <Stack.Screen name="leaderboard" />
                <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
              </Stack>
            )}
            {booting && <LoadingScreen variant={boot.variant} progress={progress} look={lookFor(loadout)} />}
          </View>
        </MobileWalletProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
