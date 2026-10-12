"""Score and sound for the 60-second launch trailer. Reuses the instruments of the original
synthesised score (tools/music.py, numpy only) in a new arrangement cut to SCRIPT.md, then
lays the sound effects from each shot's CUES list (rig/shots/sNN.py): the game's own CC0
effects (assets/audio/sfx) plus synthesis. Writes build/audio60.wav.

    python3 tools/audio60.py
"""
import glob
import os
import re
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILER = os.path.join(HERE, '..')
ROOT = os.path.join(TRAILER, '..', '..')
BUILD = os.path.join(TRAILER, 'build')
SFX_DIR = os.path.join(ROOT, 'assets', 'audio', 'sfx')

# ---- instruments from the original score (everything above its arrangement) -------------------
src = open(os.path.join(HERE, 'music.py')).read().split('# ---- arrangement')[0]
src = src.replace('DUR = 41.6', 'DUR = 60.0')
G = {'__file__': os.path.join(HERE, 'music.py')}
exec(src, G)
SR, N, Bus, tt, lp, hp, rng = G['SR'], G['N'], G['Bus'], G['tt'], G['lp'], G['hp'], G['rng']
kick, snare, clap, hat, bass, pizz, stab, lead, boom, riser, drone, trem, heart, tick, roll = (G[k] for k in (
    'kick', 'snare', 'clap', 'hat', 'bass', 'pizz', 'stab', 'lead', 'boom', 'riser', 'drone', 'trem', 'heart', 'tick', 'roll'))
hz = G['hz']

drums, bassb, mus, fxb, dry, sfx = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()
kicks = []
ST = 0.125
BASS_A = [[(0, 38), (3, 38), (6, 41), (8, 38), (10, 33), (12, 36), (14, 37)], [(0, 38), (3, 38), (6, 44), (8, 45), (10, 41), (12, 40), (14, 37)]]
PIZ_A = [[(0, 74), (2, 69), (4, 74), (6, 77), (8, 76), (10, 74), (12, 73), (14, 69)], [(0, 70), (2, 74), (4, 68), (6, 69), (10, 77), (11, 76), (12, 74), (14, 73)]]
ROOTS_B = [38, 34, 31, 33]
CH_B = [(62, 65, 69), (58, 62, 65), (55, 58, 62), (57, 61, 64)]
LEAD = [[(0, 86, 3), (3, 84, 1), (4, 81, 2), (6, 82, 2), (8, 81, 4), (12, 77, 2), (14, 80, 2)], [(0, 81, 3), (3, 77, 1), (4, 74, 2), (6, 76, 2), (8, 77, 2), (10, 76, 2), (12, 73, 4)]]


def groove(t0, t1, kind, with_lead=False, bar0=0, perc=1.0):
    bar, t = bar0, t0
    while t < t1 - 0.01:
        for st in range(16):
            ts = t + st * ST
            if ts >= t1 - 0.01:
                break
            sw = ts + (0.012 if st % 2 else 0)
            if kind == 'A':
                if st in (0, 3, 8, 10): drums.add(kick(), ts, 0.95); kicks.append(ts)
                if st in (4, 12): drums.add(clap(), ts, 0.5); drums.add(snare(), ts, 0.35)
                if st % 2 == 0: drums.add(hat(st == 14), sw, 0.2 if st % 4 else 0.3, 0.3)
                elif st in (7, 15): drums.add(hat(), sw, 0.14, -0.3)
            else:
                if st % 4 == 0 or st == 14: drums.add(kick(), ts, 1.0); kicks.append(ts)
                if st in (4, 12): drums.add(clap(), ts, 0.6 * perc); drums.add(snare(), ts, 0.5 * perc)
                drums.add(hat(st % 4 == 2), sw, (0.26 if st % 4 == 2 else 0.15) * perc, 0.35 if st % 2 else -0.35)
                bassb.add(bass(ROOTS_B[bar % 4] + (12 if st % 2 else 0), ST * 0.9), ts, 0.5)
                if st in (0, 6, 11): mus.add(stab(CH_B[bar % 4], 0.3), ts, 0.4)
                if st in (2, 5, 8, 13): mus.add(pizz(CH_B[bar % 4][(st // 3) % 3] + 12, 0.3, 0.8), ts, 0.36, -0.4 if st % 4 else 0.4)
        if kind == 'A':
            for st, m in BASS_A[bar % 2]:
                if t + st * ST < t1 - 0.01: bassb.add(bass(m, ST * (2.6 if st in (0, 8) else 1.7)), t + st * ST, 0.6)
            for st, m in PIZ_A[bar % 2]:
                if t + st * ST < t1 - 0.01: mus.add(pizz(m, 0.5, 0.7), t + st * ST, 0.5, 0.35 if st % 4 else -0.35)
        if with_lead:
            for st, m, ln in LEAD[bar % 2]:
                if t + st * ST < t1 - 0.01: mus.add(lead(m, ln * ST), t + st * ST, 0.34, 0.1)
        bar += 1; t += 2.0


# ---- ACT I 0-7: mystery ---------------------------------------------------------------------------
dry.add(drone(7.0) * np.clip(tt(7.0) / 1.2, 0, 1) * np.clip((7.0 - tt(7.0)) / 0.05, 0, 1) * (0.6 + 0.4 * tt(7.0) / 7.0), 0.0, 0.34)
for ts, m in ((0.4, 62), (1.5, 50), (2.2, 65), (3.0, 50), (3.75, 68), (4.5, 69)):
    mus.add(pizz(m, 0.9, 0.35), ts, 0.5, -0.2)
dry.add(boom(0.45), 1.5, 0.55); dry.add(boom(0.7), 3.0, 0.75)
mus.add(trem((62, 69, 74), 2.0) * np.clip((2.0 - tt(2.0)) / 0.02, 0, 1), 4.5, 0.3)
fxb.add(riser(1.4, 150, 1400), 5.1, 0.55)
dry.add(boom(), 6.5, 1.0); mus.add(stab((50, 57, 62, 65), 0.5), 6.5, 0.6)
# ---- ACT II 7-31: six entrances, two bars each -----------------------------------------------------
dry.add(boom(0.9), 7.0, 0.8)
for i in range(6):
    t0 = 7.0 + i * 4.0
    groove(t0, t0 + 4.0, 'A', with_lead=(i % 2 == 1), bar0=i * 2)
    if i:
        dry.add(boom(0.5), t0, 0.45); mus.add(stab((62, 65, 69), 0.3), t0, 0.42)
    mus.add(stab((62, 69, 74), 0.25), t0 + 2.5, 0.3)          # the name-tag accent
drums.add(roll(0.5), 30.5, 0.4)
# ---- 31-33: AIM. ---------------------------------------------------------------------------------
dry.add(boom(), 31.0, 1.0); mus.add(stab((49, 56, 61, 64), 0.9), 31.0, 0.6)
dry.add(boom(0.8), 31.33, 0.8)
for ts in (31.75, 32.25):
    dry.add(heart(), ts, 0.9)
fxb.add(riser(1.0, 200, 2600), 32.0, 0.6); drums.add(roll(0.5), 32.5, 0.45)
# ---- ACT III 33-52.5: escalation -----------------------------------------------------------------
dry.add(boom(), 33.0, 0.9)
groove(33.0, 41.0, 'B', with_lead=False, perc=0.8)
groove(41.0, 52.5, 'B', with_lead=True, bar0=4)
for ts in (37.0, 40.5, 44.5, 47.0, 49.0):
    dry.add(boom(0.6), ts, 0.5); mus.add(stab((62, 69, 74, 77), 0.3), ts, 0.4)
fxb.add(riser(1.0, 300, 2200), 51.5, 0.5)
# ---- ACT IV 52.5-58: kick, heartbeat, drone ------------------------------------------------------
dry.add(boom(), 52.5, 1.0)
dry.add(drone(4.6, 26) * np.clip((4.6 - tt(4.6)) / 0.05, 0, 1), 52.5, 0.4)
for i in range(9):
    ts = 52.5 + i * 0.5
    dry.add(heart(), ts, 0.95)
    if i % 2 == 0: drums.add(kick(), ts, 0.8)
mus.add(trem((74, 81), 0.9) * np.clip((0.9 - tt(0.9)) / 0.01, 0, 1), 56.05, 0.3)
mus.add(stab((50, 57, 62, 65, 69, 74), 0.5), 56.95, 0.9)           # six releases as one chord
for i, m in enumerate((62, 65, 69, 74, 77, 81)):
    mus.add(pizz(m, 0.5, 0.9), 56.95 + i * 0.004, 0.4, -0.5 + i * 0.2)
# ---- LOGO 58-60 ------------------------------------------------------------------------------------
dry.add(boom(), 58.0, 1.0); mus.add(stab((50, 57, 62, 65, 69, 74), 1.6), 58.0, 0.85); mus.add(pizz(86, 0.8, 0.9), 58.0, 0.4)
mus.add(stab((38, 50, 57, 62), 1.4), 58.0, 0.5)

# ---- sound effects ---------------------------------------------------------------------------------
_cache = {}


def load(name):
    """A game effect (assets/audio/sfx/<name>.mp3) as a mono float array."""
    if name not in _cache:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SFX_DIR, name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             capture_output=True).stdout
        _cache[name] = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return _cache[name]


def pitch(x, f):
    n = int(len(x) / f)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)


def noise(d):
    return rng.randn(int(d * SR))


def env(d, a=0.01, r=None):
    t = tt(d); r = r or d
    return np.minimum(1, t / a) * np.clip((d - t) / max(1e-3, d * 0.6), 0, 1)


def bandp(x, lo, hi):
    b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def bell(f=1760, d=0.9):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t)) * np.exp(-t * 6) * 0.5


def swish(d=0.5, lo=600, hi=5000):
    return bandp(noise(d), lo, hi) * np.sin(np.pi * tt(d) / d) ** 2 * 2.0


def bed(d, lo, hi, g=1.0):
    return bandp(noise(d), lo, hi) * np.clip(tt(d) / 0.4, 0, 1) * np.clip((d - tt(d)) / 0.3, 0, 1) * g


def crackle(d):
    x = np.zeros(int(d * SR)); n = int(d * 28)
    for i in rng.randint(0, len(x) - 400, n):
        x[i:i + 300] += hp(rng.randn(300), 1500) * np.exp(-np.arange(300) / 40.0) * rng.uniform(0.3, 1.0)
    return x * 0.6 + bed(d, 80, 500, 1.2)


def metal(f=2400, d=0.8):
    t = tt(d)
    return sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (5 + i * 3)) for i, k in enumerate((1, 1.51, 2.27, 3.13))) * 0.3


def thump(d=0.3, f=70):
    t = tt(d)
    return np.sin(2 * np.pi * np.cumsum(f + 60 * np.exp(-t * 30)) / SR) * np.exp(-t * 14)


def click(d=0.05, f=3000):
    return hp(noise(d), f) * np.exp(-tt(d) * 90)


def splash(d=0.7):
    t = tt(d)
    return (lp(noise(d), 2500) * np.exp(-t * 6) + hp(noise(d), 4000) * np.exp(-t * 12) * 0.6) * np.minimum(1, t / 0.005) * 1.6


def steps(d, every=0.18):
    out = np.zeros(int(d * SR) + SR)
    f = load('footstep')
    for i in range(int(d / every)):
        p = int(i * every * SR)
        out[p:p + len(f)] += f * (0.8 + 0.2 * (i % 2))
    return out


def add(*xs):
    """Sum arrays of different lengths."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


SOUNDS = {
    'grass': lambda: (swish(1.3, 1500, 7000) * 0.5, 0.5), 'rustle': lambda: (swish(0.7, 1200, 6000), 0.6), 'leaves': lambda: (swish(0.6, 2000, 8000), 0.4),
    'whip': lambda: (pitch(load('whoosh_fast'), 1.25), 1.0), 'whoosh': lambda: (load('whoosh_fast'), 0.8), 'whoosh_slow': lambda: (pitch(load('arrow_whoosh'), 0.5), 0.8),
    'doppler': lambda: (pitch(load('arrow_whoosh'), 0.62), 1.0), 'wind': lambda: (bed(1.9, 300, 2600), 0.75),
    'thock': lambda: (load('hit_wood'), 1.0), 'thock_big': lambda: (add(load('hit_wood'), thump(0.6, 55) * 0.9), 1.2),
    'crack': lambda: (load('hit_ground') if os.path.exists(os.path.join(SFX_DIR, 'hit_ground.mp3')) else click(), 1.0),
    'bell': lambda: (bell(1760), 0.32), 'glint': lambda: (bell(2637, 1.1), 0.36), 'ping': lambda: (metal(2900, 0.9), 0.75),
    'fog': lambda: (bed(4.0, 120, 900), 0.35), 'hush': lambda: (bed(4.0, 400, 3000), 0.16), 'rain': lambda: (bed(4.0, 1800, 9000), 0.32), 'fire': lambda: (crackle(4.0), 0.5),
    'twig': lambda: (add(click(0.06, 1500), np.pad(click(0.04, 2500), (int(0.03 * SR), 0))), 0.9),
    'step': lambda: (load('footstep'), 0.9), 'run': lambda: (steps(2.4), 0.7), 'crunch': lambda: (add(steps(0.6, 0.15) * 0.8, swish(0.5, 800, 3000) * 0.5), 0.7),
    'creak': lambda: (load('draw_start'), 0.9), 'release': lambda: (load('bow_release'), 1.0), 'release_slow': lambda: (pitch(load('bow_release'), 0.55), 1.0),
    'land': lambda: (add(thump(0.35, 60), load('hit_ground')), 1.0),
    'scrape': lambda: (bandp(noise(0.9), 900, 4200) * env(0.9, 0.05) * 1.6, 0.5), 'clang': lambda: (metal(1100, 0.7), 0.6),
    'flick': lambda: (swish(0.3, 3000, 9000), 0.5), 'pop': lambda: (load('emote_pop'), 0.9), 'snick': lambda: (load('hit_ground'), 0.9),
    'grab': lambda: (click(0.05, 1200), 0.8), 'nock': lambda: (load('draw_tick'), 1.0), 'catch': lambda: (add(thump(0.12, 160), click(0.04, 2000)), 1.0),
    'splash': lambda: (splash(), 0.9), 'heartbeat': lambda: (heart(), 0.0), 'chord': lambda: (load('bow_release'), 1.0),
    'logo_hit': lambda: (load('vs_slam'), 0.9), 'wobble': lambda: (np.sin(2 * np.pi * 38 * tt(0.5)) * np.sin(2 * np.pi * 9 * tt(0.5)) * np.exp(-tt(0.5) * 7), 0.6),
}

silences = []
shots = {}
for path in sorted(glob.glob(os.path.join(TRAILER, 'rig', 'shots', 's[0-9][0-9].py'))):
    text = open(path).read()
    n = int(os.path.basename(path)[1:3])
    if n > 60:
        continue
    m = re.search(r'^START, END = ([\d.]+), ([\d.]+)', text, re.M)
    start, end = float(m.group(1)), float(m.group(2))
    shots[n] = (start, end)
    c = re.search(r'^CUES = (.+)$', text, re.M)
    if not c:
        continue
    for t, name in eval(c.group(1), {'range': range}):
        if name == 'silence':
            silences.append(start + t)
            continue
        if name not in SOUNDS:
            print('no sound for cue', name, 'in shot', n)
            continue
        x, g = SOUNDS[name]()
        if g > 0:
            pan = ((hash(name) % 7) - 3) / 10.0
            sfx.add(np.asarray(x, dtype=np.float64), start + t, g * 0.9, pan)
# shot 4: six bows taken, six thunks
for i, t in enumerate((0.18, 0.40, 0.62, 0.84, 1.06, 1.28)):
    sfx.add(add(thump(0.25, 90), click(0.03, 1800) * 0.5), 5.0 + t, 0.9, -0.5 + i * 0.2)
sfx.add(add(click(0.02, 3000), bell(880, 0.5) * 0.4), 1.02, 0.5)                         # the dew drop
sfx.add(load('draw_start'), 1.55, 0.8); sfx.add(bed(1.5, 200, 1200), 1.5, 0.4)       # string creak, breath
sfx.add(bed(2.0, 150, 1400), 3.0, 0.5); sfx.add(crackle(3.5), 3.0, 0.35)             # arena wind and fire
sfx.add(load('bow_release'), 51.75, 0.8); sfx.add(load('whoosh_fast'), 51.8, 0.6)

# ---- mix ---------------------------------------------------------------------------------------------
duck = np.ones(N)
for k in kicks:
    i = int(k * SR); n = int(0.22 * SR); e = 1 - 0.45 * np.exp(-np.arange(n) / (0.07 * SR))
    duck[i:i + n] = np.minimum(duck[i:i + n], e[:max(0, N - i)])
bassb.b *= duck[:, None]; mus.b *= (0.6 + 0.4 * duck)[:, None]
ir_t = tt(1.6); ir = np.stack([rng.randn(len(ir_t)) * np.exp(-ir_t * 3.6) for _ in (0, 1)], 1)
ir[:, 0] = lp(ir[:, 0], 5000); ir[:, 1] = lp(ir[:, 1], 5000)
send = mus.b * 0.9 + fxb.b * 0.5 + drums.b * 0.12 + sfx.b * 0.25
wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], 1)
wet *= 0.16 / (np.abs(wet).max() + 1e-9) * 4
gate = np.ones(N)


def cut(t0, t1, fade=0.012):
    a, b = int(t0 * SR), min(N, int(t1 * SR)); f = int(fade * SR)
    gate[a:b] = 0; gate[a - f:a] = np.minimum(gate[a - f:a], np.linspace(1, 0, f))
    r = int(0.03 * SR)
    if b + r < N:
        gate[b:b + r] = np.minimum(gate[b:b + r], np.linspace(0, 1, r))


# silence punches: the music drops out under the big dodges, the catch and the ricochet
LEN = {35.3: 0.5, 46.0: 0.4, 49.78: 0.3, 57.1: 0.9}
for t in silences:
    key = min(LEN, key=lambda k: abs(k - t))
    cut(t + 0.04, t + LEN[key] if abs(key - t) < 0.3 else t + 0.3)
cut(57.12, 58.0)          # total silence before the logo
cut(31.0 + 0.9, 31.33)    # breath before AIM.
loop = (drums.b * 0.9 + bassb.b * 0.95 + mus.b * 0.85) * gate[:, None]
sfx_gate = np.ones(N); a, b = int(57.14 * SR), int(58.0 * SR); sfx_gate[a:b] = 0
mix = loop + dry.b * 0.9 * (0.3 + 0.7 * gate[:, None]) + fxb.b * 0.8 * gate[:, None] + wet * np.where(gate[:, None] > 0, 1.0, 0.25) + sfx.b * 0.85 * sfx_gate[:, None]
mix = np.tanh(mix * 0.9); mix /= np.abs(mix).max(); mix *= 0.89
tail = int(0.25 * SR); mix[-tail:] *= np.linspace(1, 0, tail)[:, None]
os.makedirs(BUILD, exist_ok=True)
wavfile.write(os.path.join(BUILD, 'audio60.wav'), SR, (mix * 32767).astype(np.int16))
print('audio60.wav', round(N / SR, 2), 's', 'silences at', [round(s, 2) for s in silences])
