"""Score and sound for the derp trailer. The music plays it completely straight - low drone, a
driving string ostinato, brass swells and big drums on the cuts - while the effects are small and
stupid. The music drops out on the punchlines. Instruments come from tools/music.py (numpy only);
effects are the game's CC0 set plus synthesis, placed from each shot's CUES. Writes build/derp.wav.
"""
import glob, os, re, subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__)); TRAILER = os.path.join(HERE, '..'); ROOT = os.path.join(TRAILER, '..', '..')
BUILD = os.path.join(TRAILER, 'build'); SFX = os.path.join(ROOT, 'assets', 'audio', 'sfx')
DUR = float(os.environ.get('DUR', 20.0))
src = open(os.path.join(HERE, 'music.py')).read().split('# ---- arrangement')[0].replace('DUR = 41.6', 'DUR = %s' % DUR)
G = {'__file__': os.path.join(HERE, 'music.py')}; exec(src, G)
SR, N, Bus, tt, lp, hp, rng, hz, saw = (G[k] for k in ('SR', 'N', 'Bus', 'tt', 'lp', 'hp', 'rng', 'hz', 'saw'))
boom, riser, drone, kick, heart = G['boom'], G['riser'], G['drone'], G['kick'], G['heart']
mus, drums, dry, sfx = Bus(), Bus(), Bus(), Bus()
SHOTS = [int(x) for x in os.environ['SHOTS'].split(',')] if os.environ.get('SHOTS') else [41, 42, 43, 44, 45, 46, 47, 48]


def stacc(m, d=0.16):
    """A short bowed-string note: detuned saws through a fast envelope."""
    t = tt(d + 0.08); f = hz(m)
    x = sum(saw(f, t, dt) for dt in (-0.006, 0, 0.007)) / 3
    return lp(x, 2600) * np.minimum(1, t / 0.008) * np.exp(-t * 11) * 1.4


def braam(m, d=1.6):
    """Low brass swell."""
    t = tt(d); f = hz(m)
    x = sum(saw(f * k, t, dt) for k in (1, 2, 3) for dt in (-0.004, 0.005)) / 6
    env = np.minimum(1, t / 0.5) * np.clip((d - t) / 0.5, 0, 1)
    return np.tanh(lp(x, 500 + 900 * env.mean()) * env * 3.0)


def pad(ms, d):
    t = tt(d); x = sum(saw(hz(m), t, dt) for m in ms for dt in (-0.004, 0.004)) / (2 * len(ms))
    return lp(x, 1500) * np.minimum(1, t / 0.8) * np.clip((d - t) / 0.6, 0, 1)


MONTAGE = os.environ.get('SHOTS', '').startswith('50')
# ---- the score: D minor, 150 BPM eighths ----------------------------------------------------------------
T_END = 25.7 if MONTAGE else 17.6
dry.add(drone(T_END, 26) * np.clip(tt(T_END) / 1.5, 0, 1) * np.clip((T_END - tt(T_END)) / 0.03, 0, 1) * (0.5 + 0.5 * tt(T_END) / T_END), 0.0, 0.42)
mus.add(pad((50, 57, 62), 2.2), 0.0, 0.3); mus.add(pad((50, 58, 65), 2.9), 2.2, 0.28)
E = 0.2
OST = [50, 50, 53, 50, 57, 50, 55, 53]
t = 2.6 if MONTAGE else 2.2; i = 0
while t < T_END - 0.05:
    lvl = 0.16 + 0.22 * min(1.0, (t - 2.2) / 12.0)
    mus.add(stacc(OST[i % 8] + (12 if t >= 13.0 and i % 2 else 0)), t, lvl, -0.3 if i % 2 else 0.3)
    if t >= (6.4 if MONTAGE else 7.4):
        mus.add(stacc(OST[i % 8] - 12, 0.2), t, lvl * 0.9)
    if t >= (9.8 if MONTAGE else 13.0) and i % 4 == 0:
        drums.add(kick(), t, 0.8)
    if t >= (13.6 if MONTAGE else 16.0):
        drums.add(kick(), t, 0.9)
    t += E; i += 1
for ts, big in (((2.4, 1.0), (6.4, 0.9), (9.8, 0.9), (13.6, 1.0), (18.6, 1.0), (23.2, 1.0)) if MONTAGE else ((1.3, 0.7), (5.0, 0.9), (7.4, 1.0), (10.2, 0.8), (13.0, 1.0), (16.0, 1.0), (16.53, 0.8), (17.07, 0.9))):
    dry.add(boom(big), ts, 0.9 * big)
for ts, m in (((2.4, 38), (6.4, 41), (9.8, 38), (13.6, 36), (18.6, 38)) if MONTAGE else ((1.3, 38), (5.0, 41), (7.4, 38), (13.0, 36), (16.0, 38))):
    mus.add(braam(m), ts, 0.5)
if MONTAGE:
    mus.add(pad((62, 65, 69, 74), 5.0), 13.6, 0.25); mus.add(pad((62, 67, 70, 74), 4.6), 18.6, 0.3); dry.add(riser(2.2, 180, 2600), 19.0, 0.6)
    mus.add(pad((62, 69, 74, 77), 2.4), 23.2, 0.35); dry.add(boom(), 25.7, 1.0); mus.add(braam(26, 1.2), 25.7, 0.6); mus.add(pad((50, 57, 62, 65, 69), 1.0), 25.7, 0.4)
else:
    mus.add(pad((62, 65, 69, 74), 3.0), 13.0, 0.25); mus.add(pad((62, 67, 70, 74), 1.6), 16.0, 0.3)
    dry.add(riser(1.6, 180, 2600), 16.0, 0.6)
    dry.add(boom(), 17.6, 1.0); mus.add(braam(26, 1.2), 17.6, 0.6); mus.add(pad((50, 57, 62, 65, 69), 1.0), 17.6, 0.4)

# ---- effects ---------------------------------------------------------------------------------------------
_c = {}


def game(name):
    if name not in _c:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SFX, name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
        _c[name] = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return _c[name]


def pitch(x, f):
    return np.interp(np.linspace(0, len(x) - 1, int(len(x) / f)), np.arange(len(x)), x)


def add(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def bonk():
    t = tt(0.3)
    return np.sin(2 * np.pi * np.cumsum(190 + 520 * np.exp(-t * 34)) / SR) * np.exp(-t * 13) + np.sin(2 * np.pi * 950 * t) * np.exp(-t * 60) * 0.3


def squeak():
    t = tt(0.45); f = 900 + 500 * np.sin(2 * np.pi * 2.2 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.clip((0.45 - t) / 0.05, 0, 1) * 0.5


def noise_bed(d, lo, hi):
    b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, rng.randn(int(d * SR))) * np.clip(tt(d) / 0.3, 0, 1) * np.clip((d - tt(d)) / 0.3, 0, 1)


def whistle(d=1.2):
    t = tt(d); f = 2600 - 900 * (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.05) * np.clip((d - t) / 0.2, 0, 1) * 0.25


def click(f=2400, d=0.04):
    t = tt(d); return np.sin(2 * np.pi * f * t) * np.exp(-t * 150)


def bell(f=1760, d=0.9):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t * 5) * 0.5


def thump(d=0.3, f=60):
    t = tt(d); return np.sin(2 * np.pi * np.cumsum(f + 60 * np.exp(-t * 30)) / SR) * np.exp(-t * 14)


SOUNDS = {
    'drone': lambda: (np.zeros(1), 0), 'braam': lambda: (np.zeros(1), 0), 'silence': None,
    'drip': lambda: (add(click(3000, 0.02), click(880, 0.3) * 0.4), 0.6),
    'creak': lambda: (game('draw_start'), 0.9), 'creak_long': lambda: (pitch(game('draw_start'), 0.6), 1.0), 'strain': lambda: (pitch(game('draw_start'), 0.42), 1.0),
    'tick': lambda: (click(), 0.5), 'squeak': lambda: (squeak(), 0.7),
    'twang': lambda: (add(game('bow_release'), np.sin(2 * np.pi * 110 * tt(0.5)) * np.exp(-tt(0.5) * 9) * (1 + 0.5 * np.sin(2 * np.pi * 30 * tt(0.5))) * 0.8), 1.2),
    'whoosh': lambda: (game('whoosh_fast'), 0.9), 'wind': lambda: (noise_bed(2.2, 300, 2600), 0.8), 'whistle': lambda: (whistle(), 0.8),
    'thud': lambda: (add(thump(0.35, 55), game('body_drop')), 1.0), 'step': lambda: (game('footstep'), 1.0),
    'thock': lambda: (game('hit_wood'), 1.1), 'thock_big': lambda: (add(game('hit_wood'), thump(0.6, 55) * 0.9), 1.3),
    'pop': lambda: (game('emote_pop'), 0.9), 'bonk': lambda: (bonk(), 1.5), 'logo_hit': lambda: (game('vs_slam'), 0.9),
    'whistle': lambda: (np.sin(2 * np.pi * 2300 * tt(0.5)) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 28 * tt(0.5)))) * np.clip((0.5 - tt(0.5)) / 0.1, 0, 1), 0.5),
    'steps': lambda: (np.concatenate([np.pad(game('footstep'), (0, int(0.18 * SR)))[: int(0.18 * SR)] for _ in range(9)]), 0.9),
    'om': lambda: (np.sin(2 * np.pi * 110 * tt(1.8)) * (1 + 0.3 * np.sin(2 * np.pi * 4 * tt(1.8))) * np.clip(tt(1.8) / 0.3, 0, 1) * np.clip((1.8 - tt(1.8)) / 0.3, 0, 1), 0.35),
    'hum': lambda: (np.sin(2 * np.pi * 180 * tt(1.0)) * np.sin(2 * np.pi * 3 * tt(1.0)) ** 2, 0.2), 'page': lambda: (hp(rng.randn(int(0.15 * SR)), 2000) * np.exp(-tt(0.15) * 20), 0.5),
    'poof': lambda: (lp(rng.randn(int(0.5 * SR)), 900) * np.exp(-tt(0.5) * 8), 0.9), 'click': lambda: (click(2000, 0.06), 1.0), 'ding': lambda: (bell(1320, 1.2) + bell(1760, 1.2) * 0.6, 0.6),
    'cheer': lambda: (game('crowd_cheer'), 0.9), 'firework': lambda: (add(hp(rng.randn(int(0.4 * SR)), 1500) * np.exp(-tt(0.4) * 12), thump(0.4, 50)), 0.8),
}
silences = []
starts = {}
for n in SHOTS:
    if n == 50:
        continue
    text = open(os.path.join(TRAILER, 'rig', 'shots', 's%02d.py' % n)).read()
    st = float(re.search(r'^START, END = ([\d.]+), ([\d.]+)', text, re.M).group(1)); starts[n] = st
    c = re.search(r'^CUES = (.+)$', text, re.M)
    for tcue, name in (eval(c.group(1)) if c else []):
        if name == 'silence':
            silences.append(st + tcue); continue
        x, g = SOUNDS[name]()
        if g > 0:
            sfx.add(np.asarray(x, dtype=np.float64), st + tcue, g * 0.9, ((hash(name) % 7) - 3) / 12.0)

# ---- mix: the music stops dead on the punchlines ---------------------------------------------------------
gate = np.ones(N)


def cut(t0, t1, fade=0.01, back=0.04):
    a, b = int(t0 * SR), min(N, int(t1 * SR)); f = int(fade * SR); r = int(back * SR)
    gate[a:b] = 0; gate[a - f:a] = np.minimum(gate[a - f:a], np.linspace(1, 0, f))
    if b + r < N:
        gate[b:b + r] = np.minimum(gate[b:b + r], np.linspace(0, 1, r))


LEN = {5.75: 0.5, 7.7: 0.5, 12.6: 0.45, 17.95: 0.6, 26.65: 1.4} if MONTAGE else {9.6: 0.6, 12.2: 0.5, 14.9: 0.42, 18.6: 1.4}
for s_ in silences:
    k = min(LEN, key=lambda q: abs(q - s_))
    cut(s_ + 0.05, s_ + (LEN[k] if abs(k - s_) < 0.2 else 0.35))
ir_t = tt(1.8); ir = np.stack([rng.randn(len(ir_t)) * np.exp(-ir_t * 3.0) for _ in (0, 1)], 1)
ir[:, 0] = lp(ir[:, 0], 4500); ir[:, 1] = lp(ir[:, 1], 4500)
send = (mus.b * 0.9 + drums.b * 0.2 + dry.b * 0.3) * gate[:, None] + sfx.b * 0.2
wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], 1); wet *= 0.2 / (np.abs(wet).max() + 1e-9) * 4
mix = (mus.b * 0.9 + drums.b * 0.9 + dry.b * 0.9) * gate[:, None] + wet * (0.25 + 0.75 * gate[:, None]) + sfx.b * 0.95
mix[int((DUR - 0.05) * SR):] = 0
mix = np.tanh(mix * 0.9); mix /= np.abs(mix).max(); mix *= 0.89
os.makedirs(BUILD, exist_ok=True)
wavfile.write(os.path.join(BUILD, os.environ.get('WAV', 'derp.wav')), SR, (mix * 32767).astype(np.int16))
print('derp.wav', DUR, 's; silences at', [round(x, 2) for x in silences])
