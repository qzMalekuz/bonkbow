"""Original score for the Stickchers trailer, synthesised from scratch with numpy (no samples).
120 BPM, D minor: drone and plucked strings for the stand-off, a sneaky bass groove for the chaos,
and hard stops where the edit goes silent. Writes build/music.wav."""
import os, numpy as np
from scipy import signal
from scipy.io import wavfile
SR = 44100; DUR = 41.6; N = int(DUR * SR)
HERE = os.path.dirname(os.path.abspath(__file__)); BUILD = os.path.join(HERE, '..', 'build')
rng = np.random.RandomState(11)
def hz(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2), 'low'); return signal.lfilter(b, a, x)
def hp(x, f, o=2): b, a = signal.butter(o, f / (SR / 2), 'high'); return signal.lfilter(b, a, x)
def saw(f, t, det=0.0): return 2 * ((f * (1 + det) * t) % 1.0) - 1
class Bus:
    def __init__(s): s.b = np.zeros((N, 2))
    def add(s, x, t, g=1.0, pan=0.0):
        i = int(t * SR)
        if i >= N or i < 0: return
        x = x[:N - i]; l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        s.b[i:i + len(x), 0] += x * g * l * 1.414; s.b[i:i + len(x), 1] += x * g * r * 1.414
# ---- instruments
def kick(p=1.0):
    t = tt(0.4); f = 44 + 120 * np.exp(-t * 34); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5)
    return np.tanh((x + hp(rng.randn(len(t)), 2000) * np.exp(-t * 300) * 0.25) * 1.8) * p
def snare():
    t = tt(0.26); return (hp(rng.randn(len(t)), 1400) * np.exp(-t * 20) * 0.8 + np.sin(2 * np.pi * 196 * t) * np.exp(-t * 34) * 0.6)
def clap():
    t = tt(0.3); n = signal.lfilter(*signal.butter(2, [900 / (SR / 2), 3600 / (SR / 2)], 'band'), rng.randn(len(t)))
    e = sum(np.where(t >= d, np.exp(-(t - d) * 60), 0) for d in (0, 0.011, 0.023)) + np.where(t >= 0.03, np.exp(-(t - 0.03) * 16), 0)
    return n * e * 1.6
def hat(op=False):
    t = tt(0.3 if op else 0.07); return hp(rng.randn(len(t)), 7500, 4) * np.exp(-t * (14 if op else 80)) * 0.5
def bass(m, d):
    t = tt(d + 0.08); f = hz(m); x = saw(f, t) * 0.6 + saw(f, t, 0.006) * 0.4 + np.sign(np.sin(2 * np.pi * f * t)) * 0.25
    x = lp(x, 620, 4) * 1.6 + np.sin(2 * np.pi * f * t) * 0.7
    e = np.minimum(1, t / 0.004) * np.exp(-t * 3.2) * np.clip((d + 0.08 - t) / 0.03, 0, 1); return np.tanh(x * e * 1.5)
def pizz(m, d=0.6, bright=0.5):
    f = hz(m); P = int(SR / f); x = np.zeros(int(d * SR)); x[:P] = lp(rng.uniform(-1, 1, P), 2000 + 6000 * bright)
    a = np.zeros(P + 2); a[0] = 1; a[P] = -0.497; a[P + 1] = -0.497
    y = signal.lfilter([1], a, x); return y / (np.abs(y).max() + 1e-9) * np.exp(-tt(d)[:len(y)] * 5)
def stab(ms, d=0.5):
    t = tt(d); x = sum(saw(hz(m), t, dt) for m in ms for dt in (-0.007, 0, 0.007)) / (3 * len(ms))
    return lp(x, 2600, 2) * np.minimum(1, t / 0.003) * np.exp(-t * 7) * 2.2
def lead(m, d):
    t = tt(d + 0.05); f = hz(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)); ph = np.cumsum(f) / SR
    x = np.sign(np.sin(2 * np.pi * ph)) * 0.5 + (2 * (ph % 1) - 1) * 0.5
    return lp(x, 3200) * np.minimum(1, t / 0.006) * np.exp(-t * 2.5) * np.clip((d + 0.05 - t) / 0.04, 0, 1) * 0.6
def boom(big=1.0):
    t = tt(2.2); f = 34 + 40 * np.exp(-t * 6); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    return np.tanh((x + lp(rng.randn(len(t)), 500) * np.exp(-t * 9) * 1.5 + hp(rng.randn(len(t)), 3000) * np.exp(-t * 26) * 0.25) * 1.6) * big
def riser(d, f0=180, f1=1500):
    t = tt(d); k = t / d; ns = hp(rng.randn(len(t)), 800) * k ** 2.2 * 0.5
    tone = np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** k) / SR) * k ** 2 * 0.25; return ns + tone
def drone(d, m=26):
    t = tt(d); x = sum(saw(hz(m + o), t, dt) for o in (0, 12, 19) for dt in (-0.004, 0.004)) / 6
    return lp(x, 190, 4) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.22 * t)) * 2.4
def trem(ms, d):
    t = tt(d); x = sum(saw(hz(m), t, dt) for m in ms for dt in (-0.005, 0.005)) / (2 * len(ms))
    return lp(x, 3000) * (0.6 + 0.4 * np.sin(2 * np.pi * 13 * t)) * (t / d) ** 1.6
def heart():
    t = tt(0.5); one = np.sin(2 * np.pi * 52 * t) * np.exp(-t * 26)
    return one + np.concatenate([np.zeros(int(0.2 * SR)), one])[:len(t)] * 0.7
def tick(): t = tt(0.04); return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 160)
def boing(up=True, d=0.35):
    t = tt(d); k = t / d; f = (260 * 3.2 ** k) if up else (900 * 0.35 ** k)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) * (1 + 0.3 * np.sin(2 * np.pi * 30 * t))
def roll(d):
    out = np.zeros(int(d * SR) + 12000); s = snare(); n = int(d / 0.0625)
    for i in range(n):
        p = int(i * 0.0625 * SR); out[p:p + len(s)] += s * (0.25 + 0.75 * (i / n) ** 1.5)
    return out
# ---- arrangement
drums, bassb, mus, fxb, dry = Bus(), Bus(), Bus(), Bus(), Bus()
kicks = []
ST = 0.125
BASS_A = [[(0, 38), (3, 38), (6, 41), (8, 38), (10, 33), (12, 36), (14, 37)], [(0, 38), (3, 38), (6, 44), (8, 45), (10, 41), (12, 40), (14, 37)]]
PIZ_A = [[(0, 74), (2, 69), (4, 74), (6, 77), (8, 76), (10, 74), (12, 73), (14, 69)], [(0, 70), (2, 74), (4, 68), (6, 69), (10, 77), (11, 76), (12, 74), (14, 73)]]
ROOTS_B = [38, 34, 31, 33]; CH_B = [(62, 65, 69), (58, 62, 65), (55, 58, 62), (57, 61, 64)]
LEAD = [[(0, 86, 3), (3, 84, 1), (4, 81, 2), (6, 82, 2), (8, 81, 4), (12, 77, 2), (14, 80, 2)], [(0, 81, 3), (3, 77, 1), (4, 74, 2), (6, 76, 2), (8, 77, 2), (10, 76, 2), (12, 73, 4)]]
def groove(t0, t1, kind, with_lead=False, bar0=0):
    bar = bar0; t = t0
    while t < t1 - 0.01:
        for st in range(16):
            ts = t + st * ST
            if ts >= t1 - 0.01: break
            sw = ts + (0.012 if st % 2 else 0)
            if kind == 'A':
                if st in (0, 3, 8, 10): drums.add(kick(), ts, 0.95); kicks.append(ts)
                if st in (4, 12): drums.add(clap(), ts, 0.5); drums.add(snare(), ts, 0.35)
                if st % 2 == 0: drums.add(hat(st == 14), sw, 0.2 if st % 4 else 0.3, 0.3)
                elif st in (7, 15): drums.add(hat(), sw, 0.14, -0.3)
            else:
                if st % 4 == 0 or st == 14: drums.add(kick(), ts, 1.0); kicks.append(ts)
                if st in (4, 12): drums.add(clap(), ts, 0.6); drums.add(snare(), ts, 0.5)
                drums.add(hat(st % 4 == 2), sw, 0.26 if st % 4 == 2 else 0.15, 0.35 if st % 2 else -0.35)
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
# act 1: quiet, then the stand-off
dry.add(drone(10.2) * np.clip(tt(10.2) / 2.0, 0, 1) * np.clip((10.2 - tt(10.2)) / 0.4, 0, 1), 0.0, 0.26)
for ts, m in ((0.5, 62), (1.5, 65), (2.0, 62), (2.75, 68), (3.0, 69)): mus.add(pizz(m, 0.9, 0.35), ts, 0.5, -0.2)
for i in range(6):
    ts = 3.5 + i * 0.5
    if ts < 6.4: dry.add(heart(), ts, 0.6); fxb.add(tick(), ts, 0.25, 0.5); fxb.add(tick(), ts + 0.25, 0.14, -0.5)
mus.add(trem((62, 69, 74), 2.9) * np.clip((2.9 - tt(2.9)) / 0.02, 0, 1), 3.5, 0.3)
for ts, m in ((4.0, 50), (5.0, 53), (5.5, 50), (6.0, 56)): mus.add(pizz(m, 0.8, 0.3), ts, 0.55)
mus.add(boing(True), 6.45, 0.4); mus.add(pizz(86, 0.4, 0.9), 6.45, 0.35)
fxb.add(riser(0.9, 150, 900), 7.02, 0.5); dry.add(boom(0.5), 8.06, 0.7)
mus.add(pizz(38, 1.2, 0.2), 8.6, 0.8); mus.add(pizz(37, 1.2, 0.2), 8.8, 0.7)
dry.add(boom(), 9.0, 0.95); mus.add(stab((50, 57, 62, 65), 0.9), 9.0, 0.6); fxb.add(riser(1.0), 9.0, 0.5); drums.add(roll(0.5), 9.5, 0.4)
# act 2: chaos, comedy pause, montage
dry.add(boom(0.8), 10.0, 0.7); groove(10.0, 15.5, 'A')
for ts in (11.0, 12.0, 13.0): mus.add(stab((62, 65, 69), 0.25), ts, 0.4)
mus.add(pizz(38, 1.4, 0.15), 16.25, 0.7); mus.add(pizz(37, 1.4, 0.15), 16.55, 0.7)
dry.add(drone(1.5, 25) * (tt(1.5) / 1.5) ** 2, 16.6, 0.5); mus.add(boing(False, 0.3), 18.1, 0.3); fxb.add(riser(0.4, 400, 2000), 18.1, 0.3)
dry.add(boom(), 18.5, 0.85); groove(18.5, 21.5, 'B')
for i in range(6): mus.add(stab((62, 69, 74), 0.2), 18.5 + i * 0.5, 0.36)
sl = Bus(); _d, _b, _m = drums, bassb, mus; drums = bassb = mus = sl; groove(21.5, 23.0, 'B', bar0=1); drums, bassb, mus = _d, _b, _m
sl.b = np.stack([lp(sl.b[:, c], 320, 4) for c in (0, 1)], 1) * 0.45
fxb.add(riser(1.5, 120, 700), 21.6, 0.42)
dry.add(boom(), 23.12, 1.0); mus.add(stab((50, 57, 62), 0.6), 23.12, 0.5)
# act 3: the six, escalation, hero shot
groove(23.5, 27.5, 'A', with_lead=True); mus.add(stab((62, 65, 69, 74), 0.5), 25.5, 0.5); dry.add(boom(0.6), 25.5, 0.5)
groove(27.5, 30.55, 'B', with_lead=True); drums.add(roll(1.0), 29.55, 0.42)
dry.add(boom(), 30.55, 1.0); mus.add(stab((49, 56, 61, 64), 0.9), 30.55, 0.6); drums.add(roll(0.9), 30.6, 0.3); fxb.add(riser(0.9), 30.6, 0.4)
dry.add(boom(0.8), 31.5, 0.7); dry.add(drone(2.9, 26) * np.clip((2.9 - tt(2.9)) / 0.3, 0, 1), 31.5, 0.32)
for ts in (31.75, 32.5): dry.add(heart(), ts, 1.0)
mus.add(trem((74, 81), 1.5) * np.clip((1.5 - tt(1.5)) / 0.01, 0, 1), 31.5, 0.25)
fxb.add(riser(1.2, 200, 2600), 33.05, 0.6)
# act 4: the game, the title
dry.add(boom(), 34.5, 0.9); groove(34.5, 37.5, 'A', with_lead=True); mus.add(stab((62, 69, 74, 77), 0.4), 36.4, 0.5)
groove(37.5, 40.5, 'B', with_lead=True, bar0=2); fxb.add(riser(0.6, 300, 1800), 38.0, 0.35)
dry.add(boom(), 38.6, 1.0); mus.add(stab((50, 57, 62, 65, 69), 1.2), 38.6, 0.7)
dry.add(boom(), 40.5, 1.0); mus.add(stab((50, 57, 62, 65, 69, 74), 1.1), 40.5, 0.75); mus.add(pizz(86, 0.8, 0.9), 40.5, 0.4)
# ---- mix: sidechain, reverb, hard stops, master
duck = np.ones(N)
for k in kicks:
    i = int(k * SR); n = int(0.22 * SR); e = 1 - 0.45 * np.exp(-np.arange(n) / (0.07 * SR)); duck[i:i + n] = np.minimum(duck[i:i + n], e[:max(0, N - i)])
bassb.b *= duck[:, None]; mus.b *= (0.6 + 0.4 * duck)[:, None]
ir_t = tt(1.6); ir = np.stack([rng.randn(len(ir_t)) * np.exp(-ir_t * 3.6) for _ in (0, 1)], 1); ir[:, 0] = lp(ir[:, 0], 5000); ir[:, 1] = lp(ir[:, 1], 5000)
send = mus.b * 0.9 + fxb.b * 0.5 + drums.b * 0.12 + sl.b * 0.5
wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], 1); wet *= 0.16 / (np.abs(wet).max() + 1e-9) * 4
gate = np.ones(N)
def cut(t0, t1, fade=0.012):
    a, b = int(t0 * SR), int(t1 * SR); f = int(fade * SR); gate[a:b] = 0; gate[a - f:a] = np.minimum(gate[a - f:a], np.linspace(1, 0, f))
cut(15.52, 16.2); cut(34.27, 34.5); cut(7.94, 8.05)
loop = (drums.b * 0.9 + bassb.b * 0.95 + mus.b * 0.85 + sl.b) * gate[:, None]
mix = loop + dry.b * 0.9 + fxb.b * 0.8 + wet * np.where(gate[:, None] > 0, 1.0, 0.25)
mix = np.tanh(mix * 0.9); mix /= np.abs(mix).max(); mix *= 0.89
tail = int(0.45 * SR); mix[-tail:] *= np.linspace(1, 0, tail)[:, None]
os.makedirs(BUILD, exist_ok=True); wavfile.write(os.path.join(BUILD, 'music.wav'), SR, (mix * 32767).astype(np.int16))
print('music.wav', round(N / SR, 2), 's')
