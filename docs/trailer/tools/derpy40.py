"""BONK BOW - "The Bonk Bow Open". Steve, 1-847, enters a tournament. Every opponent knocks
himself out. In the final, some guy has a shovel bow too, and you aim again. Thirty-six seconds.

    python3 tools/derpy40.py            # out/bonkbow-open-36s.mp4
    python3 tools/derpy40.py --sheet
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy20 as D  # noqa: E402
import derpy30c as C  # noqa: E402
import derpy60 as X  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, W, Pen, arrow, bow, clamp, lerp, lp, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, para, world  # noqa: E402
from derpy30 import BIG, STEVE, giant_bow, shovel  # noqa: E402
from derpy30c import finger, say  # noqa: E402

DUR = 36.0
CARD, BRACKET, R1, R2, R3, QUIP, FINAL, YOU, DRAG, FIRE, CLANG, TROPHY, REMATCH, NO, CREDIT, TITLE = \
    0.0, 2.5, 5.0, 9.0, 13.0, 17.0, 19.0, 20.6, 21.2, 23.6, 24.3, 27.6, 29.0, 30.0, 31.0, 33.0
SHAKES = [R1 + 2.9, R2 + 3.4, R3 + 3.2, CLANG, CLANG + 0.5, CLANG + 0.6, TROPHY, TITLE + 1.05, TITLE + 1.85]
GAP_Y = RY + 520
GOLD = (240, 190, 50)


def trophy(pen, p, s=1.0, tilt=0.0):
    """A cup, drawn by someone who has seen one once."""
    P = lambda x, y: rot((p[0] + x * s, p[1] + y * s), tilt, p)
    pen.blob([P(-60, -140), P(60, -140), P(45, -40), P(15, 0), P(-15, 0), P(-45, -40)], w=8, fill=GOLD)
    for sx in (-1, 1):
        pen.line([P(sx * 58, -125), P(sx * 100, -110), P(sx * 95, -60), P(sx * 48, -55)], 7)
    pen.blob([P(-12, 0), P(12, 0), P(16, 30), P(-16, 30)], w=7, fill=GOLD)
    pen.blob([P(-50, 30), P(50, 30), P(55, 50), P(-55, 50)], w=7, fill=(110, 80, 50))
    text_at = P(0, -90)
    return text_at


def hud(img, pen, t, hp_a, hp_b, name_b, label='', wins=(1, 847), game=None):
    d = ImageDraw.Draw(img)
    for x0, hp, name in ((60, hp_a, 'steve'), (1340, hp_b, name_b)):
        if hp > 0:
            d.rectangle((x0 + 6, 56, x0 + 6 + 508 * hp, 100), fill=RED)
        pen.line([(x0, 50), (x0 + 520, 48), (x0 + 522, 106), (x0 - 2, 108), (x0, 50)], 8)
        text(img, name, (x0 + 110 if name == 'steve' else x0 + 400, 118), 44, t, seed=11 if name == 'steve' else 12, wob=2)
    text(img, 'THE BONK BOW OPEN', (W / 2, 40), 64, t, seed=21, wob=2)
    if label:
        text(img, label, (W / 2, 130), 60, t, seed=23, wob=3)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < BRACKET:
        card(img, pen, t)
    elif t < R1:
        bracket(img, pen, t)
    elif t < R2:
        round1(img, pen, t)
    elif t < R3:
        round2(img, pen, t)
    elif t < QUIP:
        round3(img, pen, t)
    elif t < FINAL:
        quip(img, pen, t)
    elif t < CREDIT:
        final(img, pen, t)
    elif t < TITLE:
        credit(img, pen, t)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-18, 18) * (1 - k)), int(r.uniform(-18, 18) * (1 - k)))); img = out
    return img


def card(img, pen, t):
    text(img, 'THE BONK BOW OPEN', (W / 2, 300), 150, t, seed=1, wob=5)
    trophy(pen, (W / 2, 720), 1.2, math.sin(t * 2) * 4)
    if t > 0.8:
        text(img, '32 archers.  one trophy.', (W / 2, 880), 76, t, seed=2, wob=2)
    if t > 1.6:
        text(img, '(nobody checked if they could shoot.)', (W / 2, 980), 50, t, seed=3, wob=2)


def bracket(img, pen, t):
    u = t - BRACKET
    text(img, 'round 1', (W / 2, 80), 90, t, seed=4, wob=3)
    names = [('steve', 'gary'), ('doug', 'kevin'), ('some guy', 'a tree'), ('tall guy', 'other tall guy')]
    for i, (a, b) in enumerate(names):
        y = 260 + i * 190
        x = 300
        text(img, a, (x, y), 60, t, seed=10 + i, wob=2); text(img, 'vs', (x + 260, y + 4), 44, t, seed=20 + i, wob=1); text(img, b, (x + 540, y), 60, t, seed=30 + i, wob=2)
        pen.line([(x + 760, y + 30), (x + 900, y + 30), (x + 900, y + 30 + (95 if i % 2 == 0 else -95))], 6)
        if i % 2 == 0:
            pen.line([(x + 900, y + 125), (x + 1040, y + 125)], 6)
    pen.line([(1340, 385), (1420, 385), (1420, 765), (1340, 765)], 6); pen.line([(1420, 575), (1530, 575)], 6)
    trophy(pen, (1700, 600), 0.9)
    if u > 1.0:
        k = span(u, 1.0, 1.4)
        pen.line([(200, 240), (200 + 240 * k, 300)], 11, RED, amp=3)    # steve's name, circled by a hopeful hand
        pen.arc((300, 262), 150, 0, 360 * k, 8, RED, n=24, amp=4, sy=0.45)
    if u > 1.7:
        say(img, (W / 2, 1060), '"this is my year."  - steve, 1-847', t, 40, 56)


def steve_idle(pen, t, x=AX, gy=LY, **kw):
    f = dict(mouth='smile', drool=True, eyes='derp', look=(0.9, 0.1)); f.update(kw)
    A = stickman(pen, x, gy, S, t, arms=((100, 100), (-30, 20)), torso_lean=4, head_tilt=math.sin(t * 2) * 5, **f, **STEVE)
    g = A['hands'][0]; giant_bow(pen, (g[0] + 20, g[1]), 0, tape=True)
    return A


def round1(img, pen, t):
    """Gary. accuracy: no. He fires straight up, watches it, and does not move."""
    u = t - R1
    world(pen, t)
    hit = u >= 2.9
    hud(img, pen, t, 1.0, 0.0 if hit else 1.0, 'gary', 'round 1' if not hit else 'steve wins')
    steve_idle(pen, t, look=(0.9, -0.6 if 1.3 < u < 2.9 else 0.1))
    d = span(u, 0.3, 1.1)
    rel = u >= 1.2
    if not hit:
        G = stickman(pen, BX, RY, S, t, kind='bean', flip=-1, arms=aim_arms(0 if rel else d), torso_lean=6, head_tilt=(-28 if rel else 0),
                     mouth='o' if rel else 'smile', drool=not rel, eyes='wide' if rel else 'derp', seed=5, look=(0.2, -1.0 if rel else 0.0))
        g = G['hands'][0]; bow(pen, g, 180 if not rel else 95, 100, pull=(0 if rel else d) * 0.9)
        if not rel:
            arrow(pen, (g[0] - 46 + 40 * d, g[1]), 180, L=140)
        if u < 1.2 and u > 0.4:
            say(img, (BX, RY - 360), 'watch this.', t, 50, 64)
        top = (G['top'][0], G['top'][1] + 18)
        if 1.2 <= u < 1.75:
            arrow(pen, (BX - 30, lerp(RY - 400, -260, 1 - (1 - (u - 1.2) / 0.55) ** 2)), -90, L=140)
        elif u >= 2.35:
            k = (u - 2.35) / 0.55
            arrow(pen, lp((top[0] + 10, -220), top, k * k), 92, L=140)
    else:
        G = stickman(pen, BX, RY, S, t, kind='bean', flip=-1, lying=1.0, mouth='smile', drool=True, eyes='shut', seed=5)
        arrow(pen, (BX - 20, RY - 100), 100, L=140)
        stars(pen, (BX - 20, RY - 120), R1 + 2.9, t)
        if u < 3.5:
            text(img, 'bonk', (BX - 300, RY - 480), 92, t, seed=51)
    if u > 3.4:
        say(img, (AX + 100, LY - 420), 'i did nothing.', t, 52, 60)


def round2(img, pen, t):
    """Doug eats his arrow. Then his bow. Then has nothing."""
    u = t - R2
    world(pen, t)
    out = u >= 3.4
    hud(img, pen, t, 1.0, 0.0 if out else 1.0, 'doug', 'round 2' if not out else 'doug: disqualified')
    steve_idle(pen, t, look=(0.9, 0.0))
    bite = int(u / 0.5)
    Dg = stickman(pen, BX, RY, S, t, kind='slab', flip=-1, arms=((60, 150), (-60, -150)) if u < 3.0 else ((40, -15), (-25, 30)), head_tilt=math.sin(t * 20) * 5 * (u < 3.0),
                  mouth='chew' if u < 3.0 else ('o' if u < 3.6 else 'flat'), drool=u < 3.0, eyes='derp' if u < 3.4 else 'wide', seed=6, look=(0.8, 0.3) if u >= 3.0 else (0, 0))
    m = (Dg['neck'][0] - 16, Dg['neck'][1] - 30)
    if u < 1.5:
        arrow(pen, (m[0] - 90, m[1]), 178, L=int(170 - 150 * span(u, 0.2, 1.4)))
    elif u < 3.0:
        k = span(u, 1.6, 2.9)
        sz = 100 * (1 - k)
        if sz > 8:
            bow(pen, (m[0] - 30, m[1]), 90, sz, pull=0)
    if 0.4 < u < 2.9 and int(u * 4) % 2 == 0:
        text(img, 'nom', (BX + 100, RY - 500), 70, t, seed=60)
    if 3.0 <= u < 3.4:
        say(img, (BX, RY - 360), '...', t, 61, 70)
    if u >= 3.6:
        say(img, (BX, RY - 360), 'oh.', t, 62, 70)
    if out and u < 4.0:
        text(img, '(ate equipment)', (W / 2, 190), 44, t, seed=63, wob=2)


def round3(img, pen, t):
    """Kevin faces the wrong way and shoots the sun. The sun objects."""
    u = t - R3
    sun_hit = u >= 2.0
    down = u >= 3.2
    world(pen, t, sun=False)
    hud(img, pen, t, 1.0, 0.0 if down else 1.0, 'kevin', 'round 3' if not down else 'steve wins')
    steve_idle(pen, t, look=(0.9, -0.5 if 1.0 < u < 3.6 else 0.1))
    sk = span(u, 2.5, 3.2)
    sx, sy = 960 + 500 * sk, 300 + (RY - 300 - 150) * sk * sk
    pen.blob([(sx + math.cos(a) * 62, sy + math.sin(a) * 62) for a in [i * math.tau / 10 for i in range(10)]], w=8, fill=(255, 240, 150))
    for i in range(8):
        a = i * math.tau / 8 + t * (0.4 if not sun_hit else 6)
        pen.line([(sx + math.cos(a) * 84, sy + math.sin(a) * 84), (sx + math.cos(a) * 116, sy + math.sin(a) * 116)], 7)
    if sun_hit:
        for ex in (-22, 22):
            pen.line([(sx + ex - 10, sy - 18), (sx + ex + 10, sy - 2)], 6); pen.line([(sx + ex + 10, sy - 18), (sx + ex - 10, sy - 2)], 6)
        arrow(pen, (sx + 10, sy + 6), -52, L=140)
        if u < 2.5:
            stars(pen, (960, 300), R3 + 2.0, t, n=10, r=150); text(img, 'bonk', (1180, 150), 100, t, seed=70)
    d = span(u, 0.3, 1.1); rel = u >= 1.2
    if not down:
        K = stickman(pen, BX, RY, S, t, kind='bean', flip=1, arms=aim_arms(0 if rel else d), torso_lean=6, head_tilt=(-20 if sun_hit else 0),
                     mouth='o' if sun_hit else 'smile', drool=not sun_hit, eyes='wide' if sun_hit else 'derp', seed=7, look=(0.0, -1.0) if sun_hit else (0.9, 0.0))
        g = K['hands'][0]; bow(pen, g, 0 if not rel else -50, 100, pull=(0 if rel else d) * 0.9)
        if not rel:
            arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        if 0.4 < u < 1.2:
            say(img, (BX, RY - 360), 'got him.', t, 71, 64)
        if 2.6 < u < 3.2:
            say(img, (BX, RY - 360), 'uh.', t, 72, 70)
        if 1.2 <= u < 2.0:
            k = (u - 1.2) / 0.8
            p, ang = para((BX - 150, RY - SH), (960, 320), 260, k)
            arrow(pen, p, ang, L=140)
    else:
        stickman(pen, BX, RY, S, t, kind='bean', flip=1, lying=1.0, mouth='o', drool=False, eyes='shut', seed=7)
        if u < 3.8:
            text(img, 'BONK', (BX - 300, RY - 520), 110, t, seed=73)
        text(img, 'zzz', (BX + 120, RY - 300), 50, t, seed=74)


def quip(img, pen, t):
    u = t - QUIP
    X.ground(pen)
    St = stickman(pen, 700, X.GY, 0.95, t, arms=((100, 100), (-30, 20)), torso_lean=4, mouth='smile', drool=True, eyes='derp', look=(0.0, 0.0), **STEVE)
    g = St['hands'][0]; giant_bow(pen, (g[0] + 20, g[1]), 0, tape=True)
    trophy(pen, (1500, 820), 1.0)
    say(img, (1150, 420), "i haven't fired yet.", t, 80, 80)
    if u > 1.0:
        say(img, (1150, 560), '(the final is next.)', t, 81, 56)


def final(img, pen, t):
    u = t - FINAL
    world(pen, t)
    fired = t >= FIRE; clang = t >= CLANG
    hp_b = 1.0 if t < TROPHY else 0.0
    hud(img, pen, t, 1.0, hp_b, 'some guy', 'THE FINAL' if t < TROPHY else 'steve wins (technically)', wins=(1, 847))
    # the trophy, on a plinth at the edge of steve's ledge, until the shaking knocks it over
    tk = span(t, CLANG + 0.9, TROPHY)
    tp = (560 + 10 * tk - 110 * tk, LY - 70 + 0 * tk)
    # both archers, both with a shovel bow
    for who, x, gy, flip, sd, kind in (('steve', AX, LY, 1, 2, 'pea'), ('guy', BX, RY, -1, 3, 'slab')):
        neck = dict(neck_len=1.05) if who == 'steve' else {}
        if not fired:
            d = span(t, DRAG, FIRE - 0.15) if who == 'steve' else span(t, DRAG + 0.2, FIRE - 0.1)
            look = (0.9, -0.1) if t < YOU else (0.0, 0.0) if who == 'steve' and FIRE - 1.0 < t < FIRE else (0.9, -0.1)
            A = stickman(pen, x - flip * 20 * d, gy, S, t, kind=kind, flip=flip, torso_lean=6 - 30 * d, legs=((-14 - 20 * d, 6 + 30 * d), (16 - 10 * d, -4 + 20 * d)),
                         arms=((88, 88), (lerp(40, -70, d) + 40 * d, lerp(120, 96, d) + 40 * d)), mouth='o' if d > 0.2 else 'flat', drool=False, eyes='wide' if d > 0.5 else 'derp', seed=sd, look=look, **neck)
            g = A['hands'][0]
            giant_bow(pen, g, 0 if flip > 0 else 180, pull=d * 1.3, tape=(who == 'steve'))
            shovel(pen, (g[0] + flip * (330 - 230 * d), g[1]), 0 if flip > 0 else 180)
        else:
            k = clamp((t - FIRE) / 0.5)
            fx = x - flip * (20 + 380 * k * k); fy = gy - 120 - 300 * k
            if t < FIRE + 0.6:
                stickman(pen, fx, fy, S, t, kind=kind, lying=0.9, flip=-flip, arms=UP, legs=((-60, 60), (70, -70)), mouth='o', drool=False, eyes='wide', seed=sd, **neck)
                text(img, 'aaa', (fx, fy - 300), 80, t, seed=90 + sd)
            else:
                lying_x = x + flip * 90
                face = dict(mouth='o', drool=False, eyes='wide', seed=sd, look=(0.0, 0.0)) if t < TROPHY + 0.4 or who == 'guy' else dict(mouth='smile', drool=True, eyes='shut', seed=sd)
                if who == 'guy' and t >= REMATCH:
                    face = dict(mouth='flat', drool=False, eyes='derp', seed=sd, look=(0.9, -0.3))
                stickman(pen, lying_x, gy, S, t, kind=kind, lying=1.0, flip=flip, **face, **neck)
            giant_bow(pen, (x + flip * 40, gy - SH + 60 * k), (0 if flip > 0 else 180) + 25 * math.sin(t * 20) * (1 - k), tape=(who == 'steve'))
    if t < CLANG + 0.9 or True:
        if tk < 1:
            trophy(pen, tp if tk == 0 else (tp[0], tp[1]), 0.85, 0 if not clang else math.sin((t - CLANG) * 25) * 12 * tk)
    if tk >= 1:
        k2 = clamp((t - TROPHY) / 0.0001)
        trophy(pen, (AX - 70, LY - 150), 0.85, 160 + math.sin((t - TROPHY) * 30) * 8 * math.exp(-(t - TROPHY) * 4))
        stars(pen, (AX - 90, LY - 160), TROPHY, t)
        if t < TROPHY + 0.6:
            text(img, 'bonk', (AX + 150, LY - 560), 92, t, seed=95)
    if YOU <= t < DRAG + 0.5:
        say(img, (1300, 560), 'you again.', t, 96, 70)
    if YOU <= t < FIRE:
        k = span(t, YOU, DRAG)
        d = span(t, DRAG, FIRE - 0.15)
        fp = (lerp(1500, AX + 280 - 230 * d, k), lerp(1000, LY - SH + 20, k))
        finger(pen, fp)
    if DRAG + 1.0 < t < FIRE:
        say(img, (AX + 150, LY - 420), 'close enough.', t, 97, 60)
    if FINAL + 0.3 < t < YOU:
        say(img, (W / 2, 420), 'we both have shovels now.', t, 98, 64)
    if FIRE <= t < CLANG:
        k = (t - FIRE) / (CLANG - FIRE)
        shovel(pen, lp((AX + 300, LY - SH), (960, 480), k), 0 + 400 * k)
        shovel(pen, lp((BX - 300, RY - SH), (960, 480), k), 180 - 400 * k)
    elif clang:
        stars(pen, (960, 480), CLANG, t, n=11, r=160)
        k = clamp((t - CLANG) / 0.7)
        for sgn in (-1, 1):
            shovel(pen, (960 + sgn * 60 * k, 480 + 900 * k * k), 90 + sgn * 300 * k)
        if t < CLANG + 0.5:
            text(img, 'CLANG', (960, 300), 110, t, seed=99)
    if t >= REMATCH:
        say(img, (BX + 60, RY - 330), 'rematch?', t, 100, 70)
    if t >= NO:
        say(img, (AX - 60, LY - 330), 'no.', t, 101, 90)


def credit(img, pen, t):
    u = t - CREDIT
    trophy(pen, (W / 2, 520), 1.3, math.sin(t * 2) * 4)
    text(img, 'steve: 2 - 847', (W / 2, 650), 100, t, seed=110, wob=3)
    if u > 0.8:
        text(img, 'the bonk bow open: in the game.', (W / 2, 820), 70, t, seed=111, wob=3)
    if u > 1.4:
        text(img, '(results may vary.)', (W / 2, 920), 50, t, seed=112, wob=2)


def audio(path):
    SR = X.SR; n = int(DUR * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = x[:n - i]; out[i:i + len(x)] += x * g

    def creak(d, f0=120, f1=260):
        t = X.tt(d); f = f0 + (f1 - f0) * (t / d) + 30 * np.sin(2 * np.pi * 11 * t)
        return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 * np.minimum(1, t / 0.05)

    def crack():
        t = X.tt(0.4); r = np.random.RandomState(4)
        return (np.convolve(r.randn(len(t)), np.ones(3) / 3, 'same') * np.exp(-t * 18) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 20)) * 1.2

    def fanfare(t0, g=0.5):
        for k, m in enumerate((60, 64, 67, 72)):
            add(X.toot(m, 0.22), t0 + k * 0.12, g)
    rests = [(0, BRACKET), (R1 + 2.9, R1 + 3.5), (R2 + 3.0, R2 + 3.8), (R3 + 2.0, R3 + 2.5), (R3 + 3.2, R3 + 3.8), (QUIP, FINAL), (FIRE, FIRE + 0.3), (CLANG, TROPHY + 0.9), (REMATCH, NO + 0.8), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = BRACKET; beat = 0.24
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if ts >= FINAL else 0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25); add(X.toot(67.3 + up), ts, 0.2)
            add(X.toot(tune[i % len(tune)] + up, 0.18), ts + 0.12 + (0.03 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    # opening: a grand, slightly wrong fanfare
    for k, m in enumerate((55, 60, 64, 67, 72, 71.5)):
        add(X.tuba(m, 0.4), 0.1 + k * 0.2, 0.55)
    add(X.game('crowd_cheer'), 0.6, 0.5); add(X.game('emote_pop'), 0.8, 0.8); add(X.game('emote_pop'), 1.6, 0.8)
    add(X.game('vs_slam'), BRACKET, 0.8); add(X.game('ui_click'), BRACKET + 1.0, 0.9); add(X.toot(84, 0.3), BRACKET + 1.7, 0.3)
    for r0 in (R1, R2, R3):
        add(X.game('vs_slam'), r0, 0.9)
    add(creak(0.8), R1 + 0.3, 0.8); add(X.game('bow_release'), R1 + 1.2, 1.0); add(X.slide(300, 2400, 0.55), R1 + 1.2, 0.8)
    add(X.slide(2400, 260, 0.55), R1 + 2.35, 0.8); add(X.bonk(), R1 + 2.9, 1.3); fanfare(R1 + 3.1, 0.4); add(X.toot(74, 0.3), R1 + 3.4, 0.3)
    for k in range(6):
        add(X.game('draw_tick'), R2 + 0.4 + k * 0.45, 0.9)
    add(crack(), R2 + 2.0, 0.5); add(X.game('draw_tick'), R2 + 2.4, 0.9)
    add(X.toot(60, 0.12), R2 + 3.0, 0.3); add(X.toot(58.7, 0.3), R2 + 3.2, 0.3); add(X.game('ui_error'), R2 + 3.4, 0.9); add(X.toot(55, 0.5), R2 + 3.6, 0.3)
    add(creak(0.8), R3 + 0.3, 0.8); add(X.game('bow_release'), R3 + 1.2, 1.0); add(X.game('whoosh_fast'), R3 + 1.25, 0.7)
    add(X.bonk(), R3 + 2.0, 1.3); add(X.game('grunt'), R3 + 2.05, 0.6); add(X.slide(1800, 120, 0.7), R3 + 2.5, 0.8); add(X.bonk() * 1.2, R3 + 3.2, 1.4); add(X.game('body_drop'), R3 + 3.2, 1.0)
    fanfare(R3 + 3.5, 0.4)
    add(X.toot(76, 0.5), QUIP + 0.3, 0.25); add(X.toot(74, 0.7), QUIP + 0.8, 0.25); add(X.game('emote_pop'), QUIP + 1.0, 0.7)
    add(X.game('vs_slam'), FINAL, 1.0); add(X.game('crowd_cheer'), FINAL + 0.1, 0.6)
    add(X.game('ui_open'), YOU, 0.9); add(X.game('draw_start'), DRAG, 0.9); add(creak(FIRE - DRAG - 0.3, 100, 340), DRAG + 0.2, 0.9); add(creak(FIRE - DRAG - 0.5, 110, 350), DRAG + 0.4, 0.7)
    for k in range(8):
        add(X.game('draw_tick'), DRAG + 0.3 + k * 0.25, 0.7)
    add(X.toot(60, 0.12), DRAG + 1.1, 0.3); add(X.toot(58.7, 0.25), DRAG + 1.3, 0.3)
    add(X.game('bow_release'), FIRE, 1.2); add(X.game('bow_release'), FIRE + 0.04, 1.1); add(X.game('whoosh_fast'), FIRE, 1.0); add(X.slide(1300, 500, 0.45), FIRE + 0.05, 0.6)
    add(X.clang(), CLANG, 1.3); add(crack(), CLANG + 0.02, 0.6); add(X.game('body_drop'), CLANG + 0.5, 0.9); add(X.game('body_drop'), CLANG + 0.6, 0.9)
    add(X.slide(400, 1200, 0.6), CLANG + 0.9, 0.3); add(crack() * 0.6, CLANG + 1.5, 0.5)
    add(X.bonk(), TROPHY, 1.4); add(X.clang() * 0.4, TROPHY, 0.5); add(X.game('jingle_win'), TROPHY + 0.3, 0.9)
    add(X.toot(79, 0.3), REMATCH, 0.3); add(X.tuba(36, 0.5), NO, 0.7)
    add(X.game('crowd_cheer'), CREDIT, 0.7); add(X.game('emote_pop'), CREDIT + 0.8, 0.9); add(X.game('emote_pop'), CREDIT + 1.4, 0.9)
    for k, m in enumerate((48, 55, 60, 64, 67, 72)):
        add(X.tuba(m, 0.5), TITLE + k * 0.045, 0.55)
    add(X.toot(83.4, 0.6), TITLE + 0.3, 0.3)
    add(X.game('whoosh_fast'), TITLE + 0.75, 0.9); add(X.game('hit_wood'), TITLE + 1.05, 1.1)
    add(X.slide(2000, 300, 0.35), TITLE + 1.5, 0.7); add(X.bonk(), TITLE + 1.85, 1.4); add(X.game('laugh'), TITLE + 2.0, 0.45)
    out = np.tanh(out * 0.9); out /= max(1e-6, np.abs(out).max()); out *= 0.85
    out[-int(0.2 * SR):] *= np.linspace(1, 0, int(0.2 * SR))
    wavfile.write(path, SR, (out * 32767).astype(np.int16))


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        sh = Image.new('RGB', (320 * 9, 180 * 8))
        for i in range(72):
            t = i * 0.5 + 0.25
            sh.paste(frame(t, int(t * FPS)).resize((320, 180), Image.LANCZOS), ((i % 9) * 320, (i // 9) * 180))
        sh.save(os.path.join(BUILD, 'derpy40_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy40.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-open-36s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
