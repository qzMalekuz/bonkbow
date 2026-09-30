import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useGameStore } from '@/game/store';

// App-wide audio: short sound effects and one looping music track per screen.
// All assets are CC0 (see assets/audio/CREDITS.md). Everything here is
// fire-and-forget and swallows errors so audio can never break gameplay.
// Call from the JS thread only (wrap in runOnJS from worklets).

const SFX = {
  ui_click: require('../../assets/audio/sfx/ui_click.mp3'),
  ui_back: require('../../assets/audio/sfx/ui_back.mp3'),
  ui_toggle: require('../../assets/audio/sfx/ui_toggle.mp3'),
  ui_confirm: require('../../assets/audio/sfx/ui_confirm.mp3'),
  ui_error: require('../../assets/audio/sfx/ui_error.mp3'),
  ui_open: require('../../assets/audio/sfx/ui_open.mp3'),
  draw_start: require('../../assets/audio/sfx/draw_start.mp3'),
  draw_tick: require('../../assets/audio/sfx/draw_tick.mp3'),
  bow_release: require('../../assets/audio/sfx/bow_release.mp3'),
  arrow_whoosh: require('../../assets/audio/sfx/arrow_whoosh.mp3'),
  hit_body: require('../../assets/audio/sfx/hit_body.mp3'),
  hit_head: require('../../assets/audio/sfx/hit_head.mp3'),
  hit_wood: require('../../assets/audio/sfx/hit_wood.mp3'),
  hit_ground: require('../../assets/audio/sfx/hit_ground.mp3'),
  body_drop: require('../../assets/audio/sfx/body_drop.mp3'),
  coins: require('../../assets/audio/sfx/coins.mp3'),
  jingle_kill: require('../../assets/audio/sfx/jingle_kill.mp3'),
  jingle_win: require('../../assets/audio/sfx/jingle_win.mp3'),
  jingle_lose: require('../../assets/audio/sfx/jingle_lose.mp3'),
} as const;

export type Sfx = keyof typeof SFX;

// Mix levels. UI sounds sit well under the game so they stay subtle.
const VOLUME: Record<Sfx, number> = {
  ui_click: 0.3,
  ui_back: 0.3,
  ui_toggle: 0.35,
  ui_confirm: 0.5,
  ui_error: 0.45,
  ui_open: 0.35,
  draw_start: 0.35,
  draw_tick: 0.18,
  bow_release: 0.8,
  arrow_whoosh: 0.45,
  hit_body: 0.9,
  hit_head: 1,
  hit_wood: 0.7,
  hit_ground: 0.6,
  body_drop: 0.7,
  coins: 0.8,
  jingle_kill: 0.6,
  jingle_win: 0.7,
  jingle_lose: 0.7,
};

// Sounds that can overlap themselves (rapid taps, ratchet ticks) get a small
// round-robin pool so a retrigger doesn't cut the previous one off.
const POOL_SIZE: Partial<Record<Sfx, number>> = { ui_click: 3, draw_tick: 3, hit_body: 2 };

const MUSIC = {
  menu: require('../../assets/audio/music/menu.mp3'),
  battle: require('../../assets/audio/music/battle.mp3'),
  shop: require('../../assets/audio/music/shop.mp3'),
} as const;

export type MusicTrack = keyof typeof MUSIC;

const MUSIC_VOLUME = 0.32;
const DUCKED_VOLUME = 0.1;
const FADE_MS = 700;

const soundOn = () => useGameStore.getState().soundEnabled;
const musicOn = () => useGameStore.getState().musicEnabled;

const pools = new Map<Sfx, { players: AudioPlayer[]; next: number }>();
const music = new Map<MusicTrack, AudioPlayer>();
const fades = new Map<AudioPlayer, ReturnType<typeof setInterval>>();

let current: MusicTrack | null = null;
let ducked = false;
let initialized = false;

const attempt = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Audio is decoration; never let it throw into callers.
  }
};

const poolFor = (name: Sfx) => {
  let pool = pools.get(name);
  if (!pool) {
    const n = POOL_SIZE[name] ?? 1;
    pool = { players: Array.from({ length: n }, () => createAudioPlayer(SFX[name])), next: 0 };
    pools.set(name, pool);
  }
  return pool;
};

const musicPlayer = (track: MusicTrack) => {
  let p = music.get(track);
  if (!p) {
    p = createAudioPlayer(MUSIC[track]);
    p.loop = true;
    p.volume = 0;
    music.set(track, p);
  }
  return p;
};

const targetVolume = () => (ducked ? DUCKED_VOLUME : MUSIC_VOLUME);

// Linear volume ramp; pauses the player when it fades to silence.
const fadeTo = (p: AudioPlayer, to: number, ms = FADE_MS) => {
  const prev = fades.get(p);
  if (prev) clearInterval(prev);
  const from = p.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  const id = setInterval(() => {
    i += 1;
    attempt(() => {
      p.volume = from + (to - from) * (i / steps);
    });
    if (i >= steps) {
      clearInterval(id);
      fades.delete(p);
      if (to === 0) attempt(() => p.pause());
    }
  }, 40);
  fades.set(p, id);
};

// Call once at app start. Preloads every clip so the first shot isn't silent.
export function initAudio() {
  if (initialized) return;
  initialized = true;
  // Respect the ringer switch: a game shouldn't blast sound on silent.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  attempt(() => (Object.keys(SFX) as Sfx[]).forEach(poolFor));

  // Pause music in the background; resume on return.
  AppState.addEventListener('change', (state) => {
    if (!current) return;
    const p = musicPlayer(current);
    if (state === 'active') {
      if (musicOn()) {
        attempt(() => p.play());
        fadeTo(p, targetVolume(), 400);
      }
    } else {
      attempt(() => p.pause());
    }
  });

  // React to the Settings toggles immediately.
  useGameStore.subscribe((s, prev) => {
    if (s.musicEnabled === prev.musicEnabled || !current) return;
    const p = musicPlayer(current);
    if (s.musicEnabled) {
      attempt(() => p.play());
      fadeTo(p, targetVolume());
    } else {
      fadeTo(p, 0, 250);
    }
  });
}

export function playSfx(name: Sfx, volume = 1) {
  if (!soundOn()) return;
  attempt(() => {
    const pool = poolFor(name);
    const p = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    p.volume = Math.min(1, VOLUME[name] * volume);
    p.seekTo(0).catch(() => {});
    p.play();
  });
}

// Crossfade to a screen's track. Same track → no-op, so screens can call this
// on every focus without restarting the song.
export function playMusic(track: MusicTrack) {
  if (current === track) {
    if (musicOn()) {
      const p = musicPlayer(track);
      if (!p.playing) attempt(() => p.play());
      fadeTo(p, targetVolume());
    }
    return;
  }
  if (current) fadeTo(musicPlayer(current), 0);
  current = track;
  ducked = false;
  if (!musicOn()) return;
  const p = musicPlayer(track);
  attempt(() => {
    p.volume = 0;
    p.seekTo(0).catch(() => {});
    p.play();
  });
  fadeTo(p, MUSIC_VOLUME);
}

// Lower the music under a jingle or a result screen, then bring it back.
export function duckMusic(on: boolean) {
  ducked = on;
  if (!current || !musicOn()) return;
  fadeTo(musicPlayer(current), targetVolume(), 350);
}
