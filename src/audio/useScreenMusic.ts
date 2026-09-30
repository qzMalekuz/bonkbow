import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { playMusic, type MusicTrack } from '@/audio/sound';

// Plays a screen's music whenever it gains focus, so navigating back to a
// screen brings its track back with a crossfade.
export function useScreenMusic(track: MusicTrack) {
  useFocusEffect(
    useCallback(() => {
      playMusic(track);
    }, [track]),
  );
}
