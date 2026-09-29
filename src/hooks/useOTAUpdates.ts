import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Over-the-air updates. On every foreground, check EAS Update for a new JS
// bundle and download it silently; once it's ready, offer an instant restart
// (Alert → reloadAsync). "Later" keeps the old behavior: applies on the next
// cold start — never force-reload an active session. No-ops in dev and in
// Expo Go (Updates.isEnabled is false there). Push JS-only changes with
// `eas update --branch production`; native changes still need a store build.
async function checkOnce(): Promise<void> {
  if (!Updates.isEnabled) return; // dev client / Expo Go / updates disabled
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) await Updates.fetchUpdateAsync(); // flips isUpdatePending below
  } catch {
    // offline / update server hiccup — silent, retry next foreground
  }
}

// Manual pull for the Settings row. Unlike the silent foreground check, the
// user explicitly asked — so reload immediately once the download lands, and
// surface "up to date" / failure instead of staying quiet.
export async function checkForUpdateAndReload(): Promise<void> {
  if (!Updates.isEnabled) {
    Alert.alert('Unavailable', 'Updates are disabled in development builds.');
    return;
  }
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) {
      Alert.alert("You're up to date", 'No new update is available.');
      return;
    }
    await Updates.fetchUpdateAsync(); // no-op if the background check already downloaded it
    try {
      await Updates.reloadAsync();
    } catch {
      // Reload can be refused (e.g. app just backgrounded). The update IS
      // downloaded — it applies on next cold start, and the pending prompt
      // below offers a restart — so don't blame the network for it.
    }
  } catch {
    Alert.alert('Update failed', 'Could not fetch the update. Check your connection and try again.');
  }
}

export const useOTAUpdates = () => {
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    checkOnce();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkOnce();
    });
    return () => sub.remove();
  }, []);

  // Fires once when the download lands (isUpdatePending flips false → true),
  // so declining doesn't re-prompt every foreground.
  useEffect(() => {
    if (!isUpdatePending) return;
    Alert.alert('Update ready', 'A new version has been downloaded. Restart now to use it?', [
      { text: 'Later', style: 'cancel' }, // applies on next cold start
      { text: 'Restart', onPress: () => Updates.reloadAsync() },
    ]);
  }, [isUpdatePending]);
};
