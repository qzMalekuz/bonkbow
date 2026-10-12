"""BONK BOW launch video, derpy cut: sixty seconds in the scrawled style of tools/derpy.py.

  0:00  a solemn opening - and who it is not about
  0:05  the duel (tools/derpy20.py): turns, health bars, the aim arc, all of it wrong
  0:22  meet the archers
  0:34  the features
  0:46  everyone at once; the sun gets involved
  0:54  title

    python3 tools/derpy60.py            # out/bonkbow-60s.mp4
    python3 tools/derpy60.py --sheet    # build/derpy60_sheet.jpg, a frame a second
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy20 as D  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, ROOT, W, Pen, arrow, bow, clamp, lerp, lp, span, stars, stickman, text  # noqa: E402
from derpy20 import AL, IDLE, LY, RED, RY, UP, aim_arms, para, world  # noqa: E402

DUR = 60.0
INTRO_CUT, DUEL, ROSTER, FEAT, CHAOS, TITLE = 2.4, 5.0, 22.4, 34.4, 46.4, 54.0
GY = 930
SUN_HIT = CHAOS + 3.4
SHAKES = [DUEL + D.A_THOCK, DUEL + D.BONK, DUEL + D.CLANG, DUEL + D.FAILS + 0.32, DUEL + D.FAILS + 0.98, DUEL + D.FAILS + 1.5, FEAT + 1.9, FEAT + 5.2, FEAT + 5.35,
          SUN_HIT, CHAOS + 5.3, TITLE + 1.05, TITLE + 1.85]


def ground(pen):
    pen.line([(-20, GY + 6), (500, GY - 4), (1100, GY + 8), (W + 20, GY)], 9)
    for gx in (140, 520, 1180, 1640, 1830):
        pen.line([(gx, GY), (gx - 14, GY - 34)], 6); pen.line([(gx + 6, GY), (gx + 22, GY - 28)], 6)


def intro(img, pen, t):
    if t < INTRO_CUT:
        if t > 0.25:
            text(img, 'in a world', (W / 2, 300), 160, t, seed=31, wob=2)
        if t > 1.1:
            text(img, 'of legendary archers...', (W / 2, 540), 160, t, seed=32, wob=2)
        return
    ground(pen)
    A = stickman(pen, 700, GY, 1.0, t, kind='bean', arms=((60, 150), (-60, -150)), head_tilt=math.sin(t * 20) * 5, mouth='chew', drool=True, eyes='derp', seed=0)
    arrow(pen, (A['neck'][0] + 170, A['neck'][1] - 45), 2, L=250)
    if t > 3.1:
        text(img, 'these are', (1400, 330), 110, t, seed=33)
        text(img, 'not them.', (1400, 480), 110, t, seed=34)


ROST = [('GARY', 'accuracy: no', 'confidence: yes', 'bean'), ('TALL STEVE', 'neck: too much', 'things hit: 0', 'pea'),
        ('DOUG', 'eats the arrows', '(all of them)', 'slab'), ('KEVIN', 'facing: the wrong way', 'since: always', 'bean')]


def roster(img, pen, t):
    u = t - ROSTER
    i = min(3, int(u / 3)); v = u - i * 3
    name, l1, l2, kind = ROST[i]
    ground(pen)
    x = 560
    slide = (1 - span(v, 0, 0.18)) * 500
    if i == 0:                                       # Gary: full draw, the arrow just falls out
        d = span(v, 0.3, 1.2)
        A = stickman(pen, x, GY, 0.95, t, kind=kind, arms=aim_arms(d), torso_lean=6, mouth='o' if v < 1.5 else 'smile', drool=v >= 1.5, eyes='derp', seed=1, look=(0.6, 0.0 if v < 1.5 else 0.9))
        g = A['hands'][0]
        bow(pen, g, 0, 140, pull=d * 0.9)
        k = span(v, 1.5, 1.9)
        arrow(pen, (g[0] + 60 - 40 * d + 30 * k, lerp(g[1], GY - 8, k * k)), 0 + 8 * k, L=190)
    elif i == 1:                                     # Tall Steve
        stickman(pen, x, GY, 0.72, t, kind=kind, neck_len=1.05 + 0.15 * math.sin(v * 3), head_tilt=math.sin(v * 2.4) * 22, torso_lean=math.sin(v * 2.4) * 4,
                 mouth='smile', drool=True, eyes='derp', seed=2)
        k = (v - 1.2) / 0.5
        if 0 <= k <= 1:                               # an arrow goes straight through where a head should be
            arrow(pen, (lerp(-200, W + 300, k), GY - 350), 0, L=190)
    elif i == 2:                                     # Doug
        A = stickman(pen, x, GY, 0.95, t, kind=kind, arms=((60, 150), (-60, -150)), head_tilt=math.sin(t * 20) * 5, mouth='chew', drool=True, eyes='derp', seed=3)
        arrow(pen, (A['neck'][0] + 150 - 40 * span(v, 0.5, 2.8), A['neck'][1] - 40), 2, L=int(220 - 140 * span(v, 0.5, 2.8)))
    else:                                            # Kevin
        d = span(v, 0.3, 1.2)
        A = stickman(pen, x, GY, 0.95, t, kind=kind, flip=-1, arms=aim_arms(d if v < 1.6 else 0), torso_lean=6, mouth='o' if v < 1.6 else 'smile', drool=v >= 1.6, eyes='derp', seed=4)
        g = A['hands'][0]
        bow(pen, g, 180, 140, pull=(d if v < 1.6 else 0) * 0.9)
        if v < 1.6:
            arrow(pen, (g[0] - 60 + 40 * d, g[1]), 180, L=190)
        else:
            arrow(pen, (g[0] - 60 - 2600 * (v - 1.6), g[1]), 180, L=190)
    text(img, name, (1330 + slide, 250), 170, t, seed=40 + i, wob=5)
    if v > 0.7:
        text(img, l1, (1330, 500), 76, t, seed=50 + i, wob=3)
    if v > 1.4:
        text(img, l2, (1330, 620), 76, t, seed=60 + i, wob=3)


def hat(pen, top, kind):
    x, y = top
    if kind == 0:      # crown
        pen.blob([(x - 70, y + 10), (x - 80, y - 70), (x - 40, y - 30), (x, y - 90), (x + 40, y - 30), (x + 80, y - 70), (x + 70, y + 10)], fill=(250, 205, 60))
    elif kind == 1:    # traffic cone
        pen.blob([(x - 60, y + 10), (x, y - 150), (x + 60, y + 10)], fill=(245, 130, 40)); pen.line([(x - 90, y + 12), (x + 90, y + 12)], 12)
    elif kind == 2:    # bucket
        pen.blob([(x - 80, y - 90), (x + 80, y - 90), (x + 62, y + 20), (x - 62, y + 20)], fill=(150, 170, 190)); pen.arc((x, y - 90), 80, 180, 360, 7, sy=0.7)
    else:              # a nest, with a tenant
        for k in range(6):
            pen.arc((x, y), 80 - k * 4, 180 + k * 5, 360 - k * 4, 6, col=(130, 85, 40), sy=0.45)
        pen.blob([(x - 22, y - 30), (x, y - 62), (x + 26, y - 36), (x + 4, y - 18)], w=6, fill=(250, 220, 80)); pen.line([(x + 24, y - 40), (x + 46, y - 36)], 6, col=(240, 130, 40))


def features(img, pen, t):
    u = t - FEAT
    i = min(3, int(u / 3)); v = u - i * 3
    cap = ['REAL PHYSICS', 'ONLINE MULTIPLAYER', 'HATS', 'SMART A.I.'][i]
    if i == 0:                                       # walks straight off the ledge
        world(pen, t, sun=False)
        x = lerp(330, 720, clamp(v / 1.5))
        fall = span(v, 1.5, 1.9)
        y = LY + 700 * fall ** 2
        ph = v * 9
        stickman(pen, x, y, D.S, t, kind='bean', legs=((math.sin(ph) * 30, 6), (-math.sin(ph) * 30, -4)), arms=IDLE if fall < 0.1 else UP,
                 mouth='smile' if v < 1.45 else 'o', drool=v < 1.45, eyes='derp' if v < 1.45 else 'wide', seed=1)
        if 1.5 < v < 2.6:
            text(img, 'aaa', (760, 520 + 200 * (v - 1.5)), 80, t, seed=71)
    elif i == 1:                                     # both loose; both arrows go up; both come back
        world(pen, t, sun=False)
        fire, back = 0.8, 2.2
        tops = []
        for x, gy, flip, kind, sd in ((D.AX, LY, 1, 'bean', 1), (D.BX, RY, -1, 'slab', 2)):
            d = span(v, 0.1, fire - 0.1) if v < fire else 0
            hit = v >= back + (0.15 if flip < 0 else 0)
            A = stickman(pen, x, gy, D.S, t, kind=kind, flip=flip, arms=aim_arms(d), torso_lean=6, head_tilt=(-26 if fire < v and not hit else 0),
                         mouth='o' if not hit else 'smile', drool=hit, eyes='wide' if not hit else 'shut', seed=sd, look=(0.2, -1.0))
            g = A['hands'][0]
            bow(pen, g, 0 if flip > 0 else 180, 100, pull=d * 0.9)
            top = (A['top'][0], A['top'][1] + 18); tops.append(top)
            if v < fire:
                arrow(pen, (g[0] + flip * (46 - 40 * d), g[1]), 0 if flip > 0 else 180, L=AL)
            elif v < fire + 0.5:
                arrow(pen, (x + flip * 60, lerp(gy - 300, -200, (v - fire) / 0.5)), -90, L=AL)
            else:
                tb = back + (0.15 if flip < 0 else 0)
                k = clamp((v - (tb - 0.4)) / 0.4)
                if v >= tb - 0.4:
                    arrow(pen, lp((top[0] + 10, -200), (top[0] + 4, top[1] + 20), k * k), 92, L=AL)
                if v >= tb:
                    stars(pen, top, FEAT + 3 + tb, t)
        if v >= back:
            text(img, 'bonk', (620, 380), 90, t, seed=72)
        if v >= back + 0.15:
            text(img, 'bonk', (1300, 330), 90, t, seed=73)
    elif i == 2:                                     # hats
        ground(pen)
        A = stickman(pen, W / 2, GY, 0.85, t, kind='bean', mouth='smile', drool=True, eyes='derp', seed=2, head_tilt=math.sin(t * 3) * 4)
        hat(pen, (A['top'][0] + 8, A['top'][1] + 30), min(3, int(v / 0.7)))
        if v > 1.6:
            text(img, '(they do not help)', (W / 2, 250), 70, t, seed=74, wob=3)
    else:                                            # the opponent is busy
        ground(pen)
        bx, by = 1180 + math.sin(v * 2.2) * 260, 520 + math.sin(v * 3.7) * 110
        A = stickman(pen, 760, GY, 0.85, t, kind='slab', mouth='smile', drool=True, eyes='wide', seed=3, head_tilt=-(bx - 1180) / 14,
                     look=(clamp((bx - 900) / 400, -1, 1), clamp((by - 520) / 150, -1, 1)))
        g = A['hands'][0]
        bow(pen, (g[0] + 4, g[1] - 10), 80, 120)
        fl = math.sin(t * 30) * 22                     # a butterfly
        pen.blob([(bx, by), (bx - 34, by - 30 - fl), (bx - 40, by + 16)], w=5, fill=(250, 170, 60)); pen.blob([(bx, by), (bx + 34, by - 30 - fl), (bx + 40, by + 16)], w=5, fill=(250, 170, 60))
        if v > 1.3:
            text(img, "(it's thinking)", (W / 2, 250), 70, t, seed=75, wob=3)
    text(img, cap, (W / 2, 60), 120, t, seed=80 + i, wob=5)


CROWD = [(170, LY, 1, 'bean'), (330, LY, 1, 'pea'), (490, LY, 1, 'slab'), (1430, RY, -1, 'slab'), (1590, RY, -1, 'bean'), (1750, RY, -1, 'pea')]


def chaos(img, pen, t):
    u = t - CHAOS
    hit = t >= SUN_HIT
    world(pen, t, sun=False)
    # the sun, until an arrow finds it
    sk = clamp((t - SUN_HIT - 0.5) / 1.4) if hit else 0
    sx, sy = 960 + 40 * sk, 360 + 900 * sk * sk
    if sy < H + 200:
        pen.blob([(sx + math.cos(a) * 62, sy + math.sin(a) * 62) for a in [i * math.tau / 10 for i in range(10)]], w=8, fill=(255, 240, 150))
        for i in range(8):
            a = i * math.tau / 8 + t * (0.4 if not hit else 6)
            pen.line([(sx + math.cos(a) * 84, sy + math.sin(a) * 84), (sx + math.cos(a) * 116, sy + math.sin(a) * 116)], 7)
        if hit:
            for ex in (-22, 22):                       # it did not enjoy that
                pen.line([(sx + ex - 10, sy - 18), (sx + ex + 10, sy - 2)], 6); pen.line([(sx + ex + 10, sy - 18), (sx + ex - 10, sy - 2)], 6)
            arrow(pen, (sx + 10, sy + 6), -52, L=AL)
            stars(pen, (960, 360), SUN_HIT, t, n=10, r=150)
            if t < SUN_HIT + 0.7:
                text(img, 'bonk', (1180, 200), 100, t, seed=91)
    gone = t >= SUN_HIT + 1.9
    cheer = t >= CHAOS + 6.4
    for i, (x, gy, flip, kind) in enumerate(CROWD):
        ph = (u * 1.6 + i * 0.37) % 1.0
        if cheer:
            stickman(pen, x, gy, 0.5, t, kind=kind, flip=flip, arms=UP, hop=abs(math.sin(t * 13 + i)) * 26, mouth='smile', drool=True, eyes='shut', seed=i)
            continue
        if hit:                                        # everyone watches it go
            stickman(pen, x, gy, 0.5, t, kind=kind, flip=flip, head_tilt=-24 if not gone else 30, mouth='o', drool=False, eyes='wide', seed=i,
                     look=(0.6, -0.8 if not gone else 0.9))
            continue
        d = clamp(ph / 0.7) if ph < 0.75 else 0
        A = stickman(pen, x, gy, 0.5, t, kind=kind, flip=flip, arms=aim_arms(d), torso_lean=6 - 40 * (i % 3 == 1) * d, mouth='o', drool=False, eyes='derp', seed=i)
        g = A['hands'][0]
        bow(pen, g, (0 if flip > 0 else 180) + (i * 37 % 80 - 40), 80, pull=d * 0.9)
    # arrows everywhere, none of them useful
    r = random.Random(5)
    for k in range(26):
        t0 = r.uniform(0.2, 3.3); a_from = r.choice(CROWD); dur = r.uniform(0.5, 0.9)
        dst = (r.uniform(-100, W + 100), r.choice([-200, H + 200, r.uniform(100, 500)]))
        kk = (u - t0) / dur
        if 0 <= kk <= 1 and not (k == 0):
            p, ang = para((a_from[0], a_from[1] - 190), dst, r.uniform(60, 320), kk)
            arrow(pen, p, ang, L=110)
    k = (t - (SUN_HIT - 0.45)) / 0.45                   # the one that matters
    if 0 <= k < 1:
        p, ang = para((330, LY - 190), (970, 366), 120, k)
        arrow(pen, p, ang, L=AL)
    if gone and not cheer and t > SUN_HIT + 2.2:
        text(img, '...', (960, 420), 120, t, seed=92)
    if cheer:
        text(img, 'nice', (960, 380), 130, t, seed=93)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < DUEL:
        intro(img, pen, t)
    elif t < DUEL + D.FAILS:
        D.duel(img, pen, t - DUEL, f)
    elif t < ROSTER:
        D.fails(img, pen, t - DUEL, f)
    elif t < FEAT:
        roster(img, pen, t)
    elif t < CHAOS:
        features(img, pen, t)
    elif t < TITLE:
        chaos(img, pen, t)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
        if t > TITLE + 3.6:
            text(img, 'coming soon.  probably.', (W / 2, 830), 70, t, seed=95, wob=3)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-14, 14) * (1 - k)), int(r.uniform(-14, 14) * (1 - k)))); img = out
    return img


# ---- sound ----------------------------------------------------------------------------------------------------
SR = 44100


def tt(d):
    return np.arange(int(d * SR)) / SR


def tuba(m, d=0.22):
    t = tt(d); f = 440 * 2 ** ((m - 69) / 12)
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t)
    return np.convolve(x, np.ones(40) / 40, 'same') * np.minimum(1, t / 0.01) * np.exp(-t * 7 * 0.22 / d)


def toot(m, d=0.16):
    t = tt(d); f = 440 * 2 ** ((m - 69) / 12) * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.01) * np.clip((d - t) / 0.03, 0, 1) * 0.5


def slide(f0, f1, d):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.clip((d - t) / 0.05, 0, 1) * 0.45


def bonk():
    t = tt(0.35); return np.sin(2 * np.pi * np.cumsum(180 + 500 * np.exp(-t * 30)) / SR) * np.exp(-t * 12)


def clang():
    t = tt(0.7); return sum(np.sin(2 * np.pi * 1400 * k * t) * np.exp(-t * (6 + i * 4)) for i, k in enumerate((1, 1.51, 2.27, 3.13))) * 0.3


_g = {}


def game(name):
    if name not in _g:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'assets', 'audio', 'sfx', name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             capture_output=True).stdout
        _g[name] = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return _g[name]


def audio(path):
    n = int(DUR * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = x[:n - i]; out[i:i + len(x)] += x * g
    o = DUEL
    rests = [(0, INTRO_CUT), (o + D.A_THOCK, o + D.A_THOCK + 0.6), (o + D.B_FIRE + 0.1, o + D.T3), (o + D.BONK, o + D.BONK + 0.9), (o + D.CLANG, o + D.CLANG + 0.35),
             (o + D.FAILS + 1.5, ROSTER), (FEAT + 1.5, FEAT + 3), (FEAT + 5.2, FEAT + 6), (SUN_HIT, CHAOS + 6.4), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    # the solemn bit
    for ts, m in ((0.2, 38), (1.1, 41), (1.9, 37)):
        add(tuba(m, 1.2), ts, 0.7); add(toot(m + 24, 0.9), ts, 0.15)
    add(game('emote_pop'), INTRO_CUT, 1.0)
    i = 0; ts = INTRO_CUT
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if FEAT <= ts < CHAOS else (7 if ts >= CHAOS else 0)          # the band changes key when it gets excited
            add(tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(toot(64 + (i % 3) + up), ts, 0.25); add(toot(67.3 + up), ts, 0.2)
            add(toot(tune[i % len(tune)] + up, 0.2), ts + 0.15 + (0.04 if i % 3 == 0 else 0), 0.33)
            if ts >= CHAOS:
                add(game('footstep'), ts, 0.5); add(game('footstep'), ts + 0.15, 0.35)
        ts += 0.3; i += 1
    for k in range(6):
        add(game('draw_tick'), INTRO_CUT + 0.3 + k * 0.3, 0.8)
    # the duel (as in derpy20)
    for t0 in (0.8, D.T2, D.T3):
        add(game('emote_pop'), o + t0, 0.8)
    add(game('draw_start'), o + D.T1 + 0.6, 0.8); add(slide(500, 900, 0.9), o + D.T1, 0.25); add(slide(700, 300, 0.2), o + D.A_TURN, 0.5)
    add(game('bow_release'), o + D.A_FIRE, 1.0); add(game('hit_wood'), o + D.A_THOCK, 1.1)
    add(game('draw_start'), o + D.T2 + 0.5, 0.8); add(game('bow_release'), o + D.B_FIRE, 1.0); add(slide(300, 2400, 0.7), o + D.B_FIRE, 0.8)
    add(toot(60, 0.12), o + 8.5, 0.3); add(toot(58.7, 0.2), o + 8.72, 0.3)
    for k in range(5):
        add(game('draw_tick'), o + D.T3 + 0.3 + k * 0.28, 0.9)
    add(slide(2400, 260, 0.55), o + D.BONK - 0.55, 0.8); add(bonk(), o + D.BONK, 1.3); add(toot(84, 0.1), o + D.BONK + 0.55, 0.3)
    add(game('vs_slam'), o + D.SD, 1.0); add(game('draw_start'), o + D.SD + 0.3, 0.8)
    add(game('bow_release'), o + D.FIRE2, 1.0); add(game('bow_release'), o + D.FIRE2 + 0.03, 0.9)
    add(clang(), o + D.CLANG, 1.0); add(game('hit_wood'), o + D.CLANG + 0.3, 0.9); add(game('crowd_cheer'), o + D.CLANG + 0.4, 0.7)
    add(game('whoosh_fast'), o + D.FAILS + 0.1, 0.9); add(bonk(), o + D.FAILS + 0.32, 1.2)
    add(slide(900, 180, 0.5), o + D.FAILS + 0.75, 0.7); add(game('body_drop'), o + D.FAILS + 1.18, 0.9)
    add(game('bow_release'), o + D.FAILS + 1.2, 1.0); add(clang() * np.exp(-tt(0.7) * 6), o + D.FAILS + 1.5, 0.9)
    # roster: a pop for each name, a tick for each line
    for k in range(4):
        b = ROSTER + k * 3
        add(game('vs_slam'), b, 0.7); add(game('emote_pop'), b + 0.7, 0.7); add(game('emote_pop'), b + 1.4, 0.7)
    add(game('draw_start'), ROSTER + 0.3, 0.7); add(slide(600, 250, 0.4), ROSTER + 1.5, 0.5); add(game('hit_ground'), ROSTER + 1.9, 1.0)
    add(game('whoosh_fast'), ROSTER + 4.2, 0.9)
    for k in range(7):
        add(game('draw_tick'), ROSTER + 6.5 + k * 0.3, 0.8)
    add(game('draw_start'), ROSTER + 9.3, 0.7); add(game('bow_release'), ROSTER + 10.6, 1.0); add(game('whoosh_fast'), ROSTER + 10.62, 0.8)
    # features
    for k in range(4):
        add(game('vs_slam'), FEAT + k * 3, 0.7)
    add(slide(900, 160, 0.9), FEAT + 1.5, 0.7); add(game('body_drop'), FEAT + 2.5, 1.0)
    add(game('bow_release'), FEAT + 3.8, 1.0); add(game('bow_release'), FEAT + 3.84, 0.9); add(slide(300, 2400, 0.5), FEAT + 3.8, 0.7)
    add(slide(2400, 260, 0.4), FEAT + 4.8, 0.7); add(bonk(), FEAT + 5.2, 1.2); add(bonk() * 0.9, FEAT + 5.35, 1.2)
    for k in range(4):
        add(game('emote_pop'), FEAT + 6 + k * 0.7, 0.9)
    add(toot(60, 0.12), FEAT + 7.7, 0.3); add(toot(58.7, 0.25), FEAT + 7.92, 0.3)
    for k in range(8):
        add(toot(88 + (k % 3) * 2, 0.06), FEAT + 9.2 + k * 0.33, 0.12)
    # chaos
    r = random.Random(5)
    for k in range(22):
        t0 = CHAOS + r.uniform(0.2, 3.3)
        add(game('bow_release'), t0, 0.6); add(game('arrow_whoosh'), t0 + 0.05, 0.4)
    add(bonk(), SUN_HIT, 1.5); add(clang(), SUN_HIT, 0.6); add(slide(1800, 120, 1.4), SUN_HIT + 0.5, 0.8)
    add(game('body_drop'), CHAOS + 5.3, 1.2); add(game('hit_ground'), CHAOS + 5.32, 1.0)
    add(game('crowd_cheer'), CHAOS + 6.4, 1.0); add(game('jingle_win'), CHAOS + 6.4, 0.6)
    # title
    for k, m in enumerate((48, 55, 60, 64, 67, 72)):
        add(tuba(m, 0.5), TITLE + k * 0.045, 0.55)
    add(toot(83.4, 0.6), TITLE + 0.3, 0.3)
    add(game('whoosh_fast'), TITLE + 0.75, 0.9); add(game('hit_wood'), TITLE + 1.05, 1.1)
    add(slide(2000, 300, 0.35), TITLE + 1.5, 0.7); add(bonk(), TITLE + 1.85, 1.4); add(game('laugh'), TITLE + 2.0, 0.45)
    add(game('emote_pop'), TITLE + 3.6, 0.8)
    for k, m in enumerate((60, 64, 67, 72.3)):          # a last, hopeful toot
        add(toot(m, 0.25), TITLE + 4.4 + k * 0.18, 0.3)
    out = np.tanh(out * 0.9); out /= max(1e-6, np.abs(out).max()); out *= 0.85
    out[-int(0.2 * SR):] *= np.linspace(1, 0, int(0.2 * SR))
    wavfile.write(path, SR, (out * 32767).astype(np.int16))


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        sh = Image.new('RGB', (320 * 10, 180 * 6))
        for i in range(60):
            t = i + 0.6
            sh.paste(frame(t, int(t * FPS)).resize((320, 180), Image.LANCZOS), ((i % 10) * 320, (i // 10) * 180))
        sh.save(os.path.join(BUILD, 'derpy60_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy60.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-60s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
