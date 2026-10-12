"""The derpy films' sound in one place: the oom-pah band with rests, and named cues placed on a
timeline. Each film passes (cues, rests, duration) and gets a wav."""
import os
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy60 as X  # noqa: E402

SR = X.SR
TUNE = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)


def creak(d=0.8, f0=120, f1=260):
    t = X.tt(d); f = f0 + (f1 - f0) * (t / d) + 30 * np.sin(2 * np.pi * 11 * t)
    return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 * np.minimum(1, t / 0.05)


def crack():
    t = X.tt(0.4); r = np.random.RandomState(4)
    return (np.convolve(r.randn(len(t)), np.ones(3) / 3, 'same') * np.exp(-t * 18) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 20)) * 1.2


def coin():
    t = X.tt(1.2); return (np.sin(2 * np.pi * 3200 * t) + 0.5 * np.sin(2 * np.pi * 5100 * t)) * np.exp(-t * 4) * 0.25


def sigh():
    t = X.tt(0.9); r = np.random.RandomState(5)
    return np.convolve(r.randn(len(t)), np.ones(40) / 40, 'same') * np.sin(np.pi * t / 0.9) * 1.1


def glass():
    t = X.tt(0.35); return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * 14) for f in (2800, 4300, 5900)) * 0.18


def beads():
    out = np.zeros(int(0.8 * SR)); r = np.random.RandomState(6)
    for k in range(14):
        i = int(r.uniform(0, 0.6) * SR); t = X.tt(0.08)
        out[i:i + len(t)] += np.sin(2 * np.pi * r.uniform(1800, 3200) * t) * np.exp(-t * 60) * 0.5
    return out


def typewriter(n=8):
    out = np.zeros(int(n * 0.07 * SR) + 4000)
    for k in range(n):
        i = int(k * 0.07 * SR); out[i:i + 300] += X.game('ui_click')[:300] if len(X.game('ui_click')) > 300 else 0
    return out


def wind(d):
    t = X.tt(d); r = np.random.RandomState(7)
    return np.convolve(r.randn(len(t)), np.ones(60) / 60, 'same') * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t)) * np.clip(t / 0.5, 0, 1) * np.clip((d - t) / 0.5, 0, 1) * 2.5


SOUNDS = {
    'twang': lambda: X.game('bow_release'), 'whoosh': lambda: X.game('whoosh_fast'), 'bonk': X.bonk, 'creak': creak, 'creak_long': lambda: creak(1.4, 100, 340),
    'thock': lambda: X.game('hit_wood'), 'thud': lambda: X.game('body_drop'), 'pop': lambda: X.game('emote_pop'), 'slam': lambda: X.game('vs_slam'),
    'tick': lambda: X.game('draw_tick'), 'cheer': lambda: X.game('crowd_cheer'), 'laugh': lambda: X.game('laugh'), 'win': lambda: X.game('jingle_win'),
    'lose': lambda: X.game('jingle_lose'), 'ding': lambda: X.toot(88, 0.4), 'up': lambda: X.slide(300, 2400, 0.7), 'down': lambda: X.slide(2400, 260, 0.5),
    'coin': coin, 'sigh': sigh, 'glass': glass, 'beads': beads, 'type': typewriter, 'crack': crack, 'step': lambda: X.game('footstep'),
    'poke': lambda: X.game('ui_toggle'), 'error': lambda: X.game('ui_error'), 'confirm': lambda: X.game('ui_confirm'), 'nom': lambda: X.game('draw_tick'),
    'toot_lo': lambda: X.toot(60, 0.15), 'toot_hi': lambda: X.toot(84, 0.2), 'wrong': lambda: np.concatenate([X.toot(60, 0.12), X.toot(58.7, 0.3)]),
    'drone': lambda: X.drone(4.0, 26) * np.clip(X.tt(4.0) / 0.5, 0, 1) * np.clip((4.0 - X.tt(4.0)) / 0.5, 0, 1), 'wind': lambda: wind(5.0),
}


def render(path, dur, cues, rests, band_from=0.0, band_to=None, title=None, beat=0.3, swing=5.0, swing_from=None, fanfare_at=None):
    n = int(dur * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = np.asarray(x, dtype=np.float64)[: n - i]; out[i:i + len(x)] += x * g
    band_to = title if band_to is None else band_to
    i = 0; ts = band_from
    while ts < band_to:
        if not any(a <= ts < b for a, b in rests):
            up = swing if (swing_from is not None and ts >= swing_from) else 0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25); add(X.toot(67.3 + up), ts, 0.2)
            add(X.toot(TUNE[i % len(TUNE)] + up, 0.2), ts + 0.15 + (0.04 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    for t, name, *g in cues:
        add(SOUNDS[name](), t, g[0] if g else 1.0)
    if fanfare_at is not None:
        for k, m in enumerate((60, 64, 67, 72)):
            add(X.toot(m, 0.22), fanfare_at + k * 0.12, 0.4)
    if title is not None:
        for k, m in enumerate((48, 55, 60, 64, 67, 72)):
            add(X.tuba(m, 0.5), title + k * 0.045, 0.55)
        add(X.toot(83.4, 0.6), title + 0.3, 0.3)
        add(X.game('whoosh_fast'), title + 0.75, 0.9); add(X.game('hit_wood'), title + 1.05, 1.1)
        add(X.slide(2000, 300, 0.35), title + 1.5, 0.7); add(X.bonk(), title + 1.85, 1.4); add(X.game('laugh'), title + 2.0, 0.45)
    out = np.tanh(out * 0.9); out /= max(1e-6, np.abs(out).max()); out *= 0.85
    out[-int(0.2 * SR):] *= np.linspace(1, 0, int(0.2 * SR))
    wavfile.write(path, SR, (out * 32767).astype(np.int16))


def encode(frame_fn, dur, wav, out):
    import subprocess
    from derpy import FPS, H, W
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(dur), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(dur * FPS)):
        p.stdin.write(frame_fn(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()


def sheet(frame_fn, dur, path, per_sec=2):
    from PIL import Image
    from derpy import FPS
    n = int(dur * per_sec); cols = 9
    sh = Image.new('RGB', (320 * cols, 180 * ((n + cols - 1) // cols)))
    for i in range(n):
        t = i / per_sec + 0.2
        sh.paste(frame_fn(t, int(t * FPS)).resize((320, 180), Image.LANCZOS), ((i % cols) * 320, (i // cols) * 180))
    sh.save(path, quality=86)
