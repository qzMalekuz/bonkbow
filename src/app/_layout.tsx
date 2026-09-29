import { Stack, useNavigationContainerRef } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { MobileWalletProvider } from '@wallet-ui/react-native-kit';
import { APP_IDENTITY, CLUSTER } from '@/solana/config';
import { ensureSession } from '@/utils/supabase';
import { useOTAUpdates } from '@/hooks/useOTAUpdates';

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

function RootLayout() {
  const navigationRef = useNavigationContainerRef();

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
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B0B0F' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="game" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="lobby" />
            <Stack.Screen name="shop" />
            <Stack.Screen name="leaderboard" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack>
        </MobileWalletProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
