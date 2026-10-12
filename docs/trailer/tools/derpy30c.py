"""BONK BOW - "Game 848". Thirty seconds with a story: Tall Steve has lost 847 duels in a row. He
reads the comment, builds the shovel bow, and a finger on the screen (that's you) aims it for
him. He wins his first game. Technically.

    python3 tools/derpy30c.py            # out/bonkbow-game848-30s.mp4
    python3 tools/derpy30c.py --sheet
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
import derpy30 as V  # noqa: E402
import derpy60 as X  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, W, Pen, arrow, bow, clamp, lerp, lp, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, para, world  # noqa: E402
from derpy30 import BIG, STEVE, giant_bow, shovel  # noqa: E402

DUR = 32.0
# beats
OPEN, SHOT0, BONK0, PLAN, PHONE, BUILD1, BUILD2, BUILD3, ARRIVE, FINGER, DRAG, SHRUG, FIRE, DONK, HA, CRUMBLE, WIN, CRY, REMATCH, NO, TITLE = \
    0.0, 2.2, 2.75, 3.4, 4.4, 5.6, 6.8, 8.0, 9.2, 12.0, 12.6, 14.6, 15.6, 16.6, 17.0, 17.8, 19.4, 20.6, 22.0, 23.2, 27.4
CREDIT = 24.8
SHAKES = [BONK0, BUILD1 + 0.9, BUILD2 + 0.9, BUILD3 + 0.9, FIRE, DONK, CRUMBLE + 0.7, WIN, TITLE + 1.05, TITLE + 1.85]
GAP_Y = RY + 520


def hud(img, pen, t, hp_a, hp_b, label='', wins=(0, 847), game=848):
    d = ImageDraw.Draw(img)
    for x0, hp, name in ((60, hp_a, 'steve'), (1340, hp_b, 'some guy')):
        if hp > 0:
            d.rectangle((x0 + 6, 56, x0 + 6 + 508 * hp, 100), fill=RED)
        pen.line([(x0, 50), (x0 + 520, 48), (x0 + 522, 106), (x0 - 2, 108), (x0, 50)], 8)
        text(img, name, (x0 + 110 if name == 'steve' else x0 + 400, 118), 44, t, seed=11 if name == 'steve' else 12, wob=2)
    text(img, '%d  -  %d' % wins, (W / 2, 40), 96, t, seed=21, wob=2)
    text(img, 'game %d' % game, (W / 2, 150), 50, t, seed=22, wob=2)
    if label:
        text(img, label, (W / 2, 230), 64, t, seed=23, wob=3)


def say(img, who, line, t, seed, size=70):
    """A line of speech above a character's head (who = (x, y) of the head top)."""
    text(img, line, (who[0], who[1] - 120), size, t, seed=seed, wob=2)


def finger(pen, p, press=1.0):
    """A pointing hand coming in from the bottom right, fingertip at p."""
    base = (p[0] + 90, p[1] + 150)
    pen.line([base, (p[0] + 12, p[1] + 10)], 34, amp=2)
    pen.line([(base[0] + 50, base[1] - 10), (base[0] + 420, base[1] + 420)], 110, amp=2)
    pen.line([(base[0] + 50, base[1] - 10), (base[0] + 420, base[1] + 420)], 90, PAPER, amp=2)
    pen.line([base, (p[0] + 12, p[1] + 10)], 26, PAPER, amp=2)
    pen.dot((p[0] + 8, p[1] + 6), 14, PAPER); pen.arc((p[0] + 8, p[1] + 6), 16, 120, 420, 7)
    for k in range(3):
        a = base[0] + 40 + k * 34; b = base[1] + 30 + k * 10
        pen.line([(a, b), (a - 30, b + 60)], 7, amp=1.5)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < PLAN:
        opening(img, pen, t)
    elif t < BUILD1:
        plan(img, pen, t)
    elif t < ARRIVE:
        build_montage(img, pen, t)
    elif t < WIN:
        game849(img, pen, t)
    elif t < CREDIT:
        ending(img, pen, t)
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


def opp(pen, t, x=BX, gy=RY, yawn=0.0, face=None, arms=None, head_tilt=0.0):
    f = face or dict(mouth='o' if yawn > 0.5 else 'flat', drool=False, eyes='shut' if yawn > 0.5 else 'derp', seed=3)
    A = stickman(pen, x, gy, S, t, kind='slab', flip=-1, arms=arms or ((40, -15), (-25, 30)), head_tilt=-10 * yawn + head_tilt, **f)
    return A


def opening(img, pen, t):
    world(pen, t)
    hit = t >= BONK0
    hud(img, pen, t, 1.0 if not hit else 0.0, 1.0, '' if t < BONK0 + 0.3 else 'some guy wins')
    # the regular: yawning, firing without looking
    yawn = math.sin(t * 2.5) * 0.5 + 0.5
    d = span(t, 0.6, SHOT0 - 0.1) if t < SHOT0 else 0
    A = opp(pen, t, yawn=yawn, arms=aim_arms(d) if t > 0.4 else None, face=dict(mouth='o' if yawn > 0.5 else 'flat', drool=False, eyes='shut', seed=3))
    g = A['hands'][0]
    if t > 0.4:
        bow(pen, g, 180, 100, pull=d * 0.9)
        if t < SHOT0:
            arrow(pen, (g[0] - 46 + 40 * d, g[1]), 180, L=140)
    if t > 1.0 and t < SHOT0:
        say(img, (BX, RY - 360), 'yaaawn', t, 31, 60)
    # Steve, hopeful, then not
    if not hit:
        St = stickman(pen, AX, LY, S, t, arms=((100, 100), (-30, 20)), torso_lean=4, mouth='smile', drool=True, eyes='derp', look=(0.9, 0.0), **STEVE)
        g2 = St['hands'][0]; bow(pen, (g2[0] + 4, g2[1] - 8), 80, 90)
    else:
        u = t - BONK0
        St = stickman(pen, AX + 40, LY, S, t, lying=1.0, mouth='o' if u < 0.5 else 'flat', drool=False, eyes='wide' if u < 0.5 else 'derp', look=(0.0, 0.0), **STEVE)
        arrow(pen, (AX + 10, LY - 110), 100, L=140)
        stars(pen, (AX, LY - 120), BONK0, t)
        if u > 0.25:
            say(img, (AX + 200, LY - 300), 'ow.', t, 32, 60)
    if SHOT0 <= t < BONK0:
        k = (t - SHOT0) / (BONK0 - SHOT0)
        p, ang = para((BX - 160, RY - SH), (AX + 20, LY - 190), 200, k)
        arrow(pen, p, ang, L=140)


def plan(img, pen, t):
    """Close on Steve, still on the floor, with a plan and a phone."""
    X.ground(pen)
    u = t - PLAN
    St = stickman(pen, 560, X.GY, 1.0, t, lying=1.0, flip=1, arms=((60, 20), (-150, -170)) if t >= PHONE else ((60, 20), (-60, -20)),
                  mouth='flat' if u < 0.6 else 'smile', drool=u >= 0.6, eyes='derp', look=(0.0, -0.4) if t < PHONE else (0.6, -0.9), **STEVE)
    if u > 0.2:
        say(img, (640, 420), 'i have a plan.', t, 33, 80)
    if t >= PHONE:
        # the phone, with the comment on it
        px, py = 1480, 560
        pen.blob([(px - 150, py - 230), (px + 150, py - 230), (px + 150, py + 230), (px - 150, py + 230)], w=9)
        pen.line([(px - 110, py - 160), (px + 110, py - 160)], 6)
        text(img, 'add this.', (px, py - 120), 46, t, seed=34, wob=1)
        giant = lambda q: (px - 10 + q[0] * 0.22, py + 60 + q[1] * 0.22)
        bow(pen, giant((0, 0)), 0, 110)
        shovel(pen, giant((300, 0)), 0, L=120)
        for k in range(3):
            pen.line([(px - 100, py + 170 + k * 18), (px + 60 - k * 30, py + 170 + k * 18)], 5)
        if t > PHONE + 0.5:
            say(img, (640, 580), '...yes.', t, 35, 80)


def build_montage(img, pen, t):
    X.ground(pen)
    i = 0 if t < BUILD2 else (1 if t < BUILD3 else 2)
    v = t - (BUILD1, BUILD2, BUILD3)[i]
    cap = ('1. get a big stick', '2. add string', '3. add shovel')[i]
    text(img, cap, (W / 2, 70), 80, t, seed=40 + i, wob=3)
    if i == 0:        # saws a tree; the tree has opinions
        fall = span(v, 0.6, 1.0)
        tx = 1100
        pen.line([(tx, X.GY), (tx, X.GY - 200)], 24, (120, 80, 40))
        top = rot((tx, X.GY - 700), -80 * fall, (tx, X.GY - 200))
        pen.line([(tx, X.GY - 200), top], 22, (120, 80, 40))
        for k in range(5):
            c = lp((tx, X.GY - 200), top, 0.4 + k * 0.14)
            pen.blob([(c[0] + math.cos(a) * 90, c[1] + math.sin(a) * 70) for a in [j * math.tau / 8 for j in range(8)]], w=7, fill=(190, 230, 170))
        sx = 760
        St = stickman(pen, sx, X.GY, 0.9, t, arms=((80 + 30 * math.sin(v * 40), 60), (-20, 10)), mouth='o', drool=False, eyes='wide', look=(0.8, -0.2), **STEVE) if fall < 0.9 else \
            stickman(pen, sx, X.GY, 0.9, t, lying=1.0, mouth='o', drool=False, eyes='shut', **STEVE)
        if fall < 0.9:
            pen.line([(sx + 120, X.GY - 300 + 10 * math.sin(v * 40)), (sx + 300, X.GY - 240 + 10 * math.sin(v * 40))], 8, (160, 160, 170))
        if v > 0.2 and v < 0.6 and int(v * 10) % 2 == 0:
            text(img, 'scrk', (sx + 300, X.GY - 420), 60, t, seed=43)
        if fall >= 0.9:
            stars(pen, (sx, X.GY - 150), BUILD1 + 0.9, t); text(img, 'bonk', (sx + 300, X.GY - 500), 90, t, seed=44)
    elif i == 1:      # the string wins
        St = stickman(pen, 860, X.GY, 0.9, t, arms=((100 + 40 * math.sin(v * 15), 120), (-100 + 40 * math.cos(v * 15), -120)), head_tilt=math.sin(v * 12) * 15,
                      mouth='o', drool=False, eyes='wide', look=(0.3, -0.3), **STEVE)
        giant_bow(pen, (560, X.GY - 420), 0)
        r = random.Random(7)
        pts = [(860 + r.uniform(-180, 180), X.GY - 300 + r.uniform(-220, 220)) for _ in range(14)]
        pen.line(pts, 5, (230, 230, 220), amp=6)
        if v > 0.5:
            say(img, (860, X.GY - 620), 'hm.', t, 45, 70)
    else:             # tape, everywhere
        St = stickman(pen, 760, X.GY, 0.9, t, arms=((100, 100), (-30, 20)), mouth='smile', drool=True, eyes='derp', look=(0.9, 0.0), **STEVE)
        g = St['hands'][0]
        giant_bow(pen, (g[0] + 20, g[1]), 0, tape=v > 0.3)
        shovel(pen, (g[0] + 330, g[1]), 0)
        for k in range(int(v * 6)):
            pen.line([(760 + (k * 53) % 160 - 80, X.GY - 560 + (k * 37) % 90), (760 + (k * 53) % 160 - 20, X.GY - 550 + (k * 37) % 90)], 10, (150, 150, 160))
        if v > 0.9:
            say(img, (760, X.GY - 700), 'perfect.', t, 46, 70)


def game849(img, pen, t):
    world(pen, t)
    ha = HA <= t < CRUMBLE
    crumbled = t >= CRUMBLE
    hp_b = 1.0 if t < CRUMBLE + 0.7 else 0.0
    hud(img, pen, t, 1.0, hp_b, '' if t < CRUMBLE + 0.7 else 'steve wins', game=849)
    # the opponent: mid-yawn, then not
    fall = span(t, CRUMBLE, CRUMBLE + 0.7)
    gy = RY
    if crumbled:
        V.ledge_bite(pen, 1)
        gy = RY + (GAP_Y - RY) * fall ** 2
        V.chunk(pen, BX - 110, gy, t)
    if t < ARRIVE + 1.2:
        opp(pen, t, yawn=1.0)
        if t < ARRIVE + 0.9:
            say(img, (BX, RY - 360), 'yaaa-', t, 31, 60)
    elif ha:
        opp(pen, t, face=dict(mouth='grin', drool=False, eyes='derp', seed=3, look=(0.8, 0.5)), head_tilt=-10)
        say(img, (BX, RY - 360), 'ha.', t, 50, 70)
    elif crumbled:
        opp(pen, t, gy=gy, face=dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.8, 0.8)), head_tilt=math.sin((t - CRUMBLE) * 30) * 12)
        if t < CRUMBLE + 0.6:
            say(img, (BX, RY - 360), 'wait', t, 51, 70)
    else:
        opp(pen, t, face=dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.8, 0.0)))
        if t < ARRIVE + 2.2:
            say(img, (BX, RY - 360), '...', t, 52, 70)
    if t >= DONK:
        w = math.sin((t - DONK) * 30) * 8 * math.exp(-(t - DONK) * 4)
        shovel(pen, (1300, (RY if not crumbled else gy) + 128), 25 + w)
        if t < DONK + 0.5:
            stars(pen, (1290, RY + 120), DONK, t, n=7, r=100); text(img, 'DONK', (1150, RY - 200), 100, t, seed=53)
    # Steve
    if t < ARRIVE + 1.5:                         # drags it in
        k = span(t, ARRIVE, ARRIVE + 1.3)
        x = lerp(-200, AX, k)
        ph = t * 10
        St = stickman(pen, x, LY, S, t, legs=((math.sin(ph) * 32 * (k < 1), 6), (-math.sin(ph) * 32 * (k < 1), -4)), torso_lean=30 * (k < 1) + 6, arms=((-120, -150), (-110, -130)) if k < 1 else ((100, 100), (-30, 20)),
                      mouth='smile', drool=True, eyes='derp', look=(0.9, 0.2), **STEVE)
        g = St['hands'][1 if k < 1 else 0]
        giant_bow(pen, (g[0] - 160, LY - 40) if k < 1 else (g[0] + 20, g[1]), -62 if k < 1 else 0, tape=True)
        shovel(pen, (x + 360, LY - 28), 6)
    elif t < FIRE:                               # you aim it
        d = span(t, DRAG, SHRUG - 0.2)
        St = stickman(pen, AX - 20 * d, LY, S, t, torso_lean=6 - 30 * d, legs=((-14 - 20 * d, 6 + 30 * d), (16 - 10 * d, -4 + 20 * d)),
                      arms=((88, 88), (lerp(40, -70, d) + 40 * d, lerp(120, 96, d) + 40 * d)), head_tilt=0,
                      mouth='o' if t < SHRUG else 'smile', drool=t >= SHRUG, eyes='wide' if t < SHRUG else 'derp', look=(0.9, -0.1) if t < SHRUG else (0.0, 0.0), **STEVE)
        g = St['hands'][0]
        giant_bow(pen, g, 0, pull=d * 1.3, tape=True)
        shovel(pen, (g[0] + 330 - 230 * d, g[1]), 0)
        if t >= FINGER:
            k = span(t, FINGER, DRAG)
            fp = (lerp(1500, g[0] + 300 - 230 * d, k), lerp(1000, g[1] + 20, k))
            finger(pen, fp)
            if t < DRAG + 0.4:
                text(img, 'drag to aim', (1300, 600), 70, t, seed=54, wob=2)
            if t >= DRAG + 0.3:                   # the arc: not at him. under him.
                n = 14
                for i in range(int(n * span(t, DRAG + 0.3, DRAG + 1.0))):
                    p, _ = para((g[0] + 110, g[1]), (1290, RY + 120), 260, (i + 1) / (n + 1))
                    pen.dot(p, 9 - i * 0.25)
        if t >= SHRUG:
            say(img, (AX + 150, LY - 420), 'close enough.', t, 55, 64)
    else:                                        # the release, and the usual
        k = clamp((t - FIRE) / 0.5)
        x = lerp(AX - 20, -400, k * k)
        St = stickman(pen, x, LY - 120 - 300 * k, S, t, lying=0.9, flip=-1, arms=UP, legs=((-60, 60), (70, -70)), mouth='o', drool=False, eyes='wide', **STEVE)
        giant_bow(pen, (AX + 40, LY - SH + 60 * k), 25 * math.sin(t * 20) * (1 - k), tape=True)
        if t < FIRE + 0.6:
            text(img, 'aaa', (AX - 200 - 600 * k, LY - 500), 80, t, seed=56)
        if t >= FIRE + 0.5:
            finger(pen, (1500, 1000))
    if FIRE <= t < DONK:
        k = (t - FIRE) / (DONK - FIRE)
        p, ang = para((AX + 300, LY - SH), (1290, RY + 120), 260, k)
        shovel(pen, p, ang)


def ending(img, pen, t):
    world(pen, t)
    V.ledge_bite(pen, 1)
    V.chunk(pen, BX - 110, GAP_Y, t)
    u = t - WIN
    hud(img, pen, t, 1.0, 0.0, 'steve wins', wins=(1, 847), game=849)
    # confetti, drawn by someone very excited
    r = random.Random(3)
    for k in range(40):
        x = r.uniform(0, W); y = (r.uniform(-200, 900) + u * r.uniform(80, 200)) % 1100 - 100
        pen.line([(x, y), (x + r.uniform(-14, 14), y + r.uniform(10, 30))], 6, (r.choice([RED, (60, 120, 220), (240, 190, 40)])), amp=1)
    # Steve, back on his ledge, having a moment
    cry = t >= CRY
    St = stickman(pen, AX, LY, S, t, arms=UP if u < 1.0 else ((100, 100), (-30, 20)), hop=abs(math.sin(t * 13)) * 26 * (u < 1.0),
                  mouth='smile' if not cry else 'o', drool=not cry, eyes='shut' if cry else 'derp', look=(0.0, 0.0), **STEVE)
    if cry:
        for dx in (-30, 30):
            a = (St['neck'][0] + dx, St['neck'][1] - 150)
            pen.line([a, (a[0] + dx * 0.4, a[1] + 60 + 20 * math.sin(t * 7))], 6, (120, 190, 240))
        say(img, (AX + 100, LY - 440), 'i did it.', t, 60, 70)
    g = St['hands'][0]
    if u >= 1.0:
        giant_bow(pen, (g[0] + 20, g[1]), 0, tape=True)
    # the other guy, from the bottom of the gap
    O = stickman(pen, BX - 80, GAP_Y, S, t, kind='slab', flip=-1, arms=IDLE, head_tilt=14, mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, -0.6))
    if t >= REMATCH:
        say(img, (BX - 80, GAP_Y - 320), 'rematch?', t, 61, 70)
    if t >= NO:
        say(img, (AX + 100, LY - 290), 'no.', t, 62, 90)


def credit(img, pen, t):
    u = t - CREDIT
    text(img, 'someone in the comments said', (W / 2, 300), 90, t, seed=70, wob=2)
    text(img, '"add this."', (W / 2, 430), 120, t, seed=71, wob=4)
    if u > 0.9:
        text(img, 'so we did.', (W / 2, 660), 110, t, seed=72, wob=3)
    if u > 1.6:
        text(img, '(shovel bow: in the game soon.)', (W / 2, 830), 56, t, seed=73, wob=2)


def audio(path):
    SR = X.SR; n = int(DUR * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = x[:n - i]; out[i:i + len(x)] += x * g

    def crack():
        t = X.tt(0.4); r = np.random.RandomState(4)
        return (np.convolve(r.randn(len(t)), np.ones(3) / 3, 'same') * np.exp(-t * 18) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 20)) * 1.2

    def creak(d, f0=120, f1=260):
        t = X.tt(d); f = f0 + (f1 - f0) * (t / d) + 30 * np.sin(2 * np.pi * 11 * t)
        return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 * np.minimum(1, t / 0.05)

    def yawn():
        t = X.tt(1.1); f = 300 + 180 * np.sin(np.pi * t / 1.1)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 1.1) * 0.3

    def saw(d):
        t = X.tt(d); r = np.random.RandomState(8)
        return np.convolve(r.randn(len(t)), np.ones(6) / 6, 'same') * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 5 * t))) * 0.6
    # the band only turns up once there is a plan; sad trombone for the loss, fanfare for the win
    rests = [(0, PLAN), (BONK0, PLAN), (BUILD1 + 0.9, BUILD2), (FIRE, FIRE + 0.3), (DONK, CRUMBLE + 0.9), (WIN, WIN + 0.6), (CRY, NO + 0.9), (CREDIT, CREDIT + 0.9), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = PLAN; beat = 0.24
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if ts >= ARRIVE else 0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25); add(X.toot(67.3 + up), ts, 0.2)
            add(X.toot(tune[i % len(tune)] + up, 0.18), ts + 0.12 + (0.03 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    add(X.game('vs_slam'), 0.05, 0.9); add(yawn(), 1.0, 0.9)
    add(creak(1.4, 100, 240), 0.7, 0.5); add(X.game('bow_release'), SHOT0, 1.0); add(X.game('whoosh_fast'), SHOT0, 0.7)
    add(X.bonk(), BONK0, 1.3); add(X.game('body_drop'), BONK0 + 0.05, 0.9)
    for k, m in enumerate((62, 61, 60, 59)):                       # the sad trombone
        add(X.tuba(m, 0.35), BONK0 + 0.3 + k * 0.3, 0.5)
    add(X.toot(74, 0.3), PLAN + 0.2, 0.35); add(X.game('ui_open'), PHONE, 0.9); add(X.game('ui_click'), PHONE + 0.6, 0.8)
    add(X.toot(84, 0.2), PHONE + 0.5, 0.35); add(X.toot(88, 0.4), PHONE + 0.7, 0.35)
    for b0 in (BUILD1, BUILD2, BUILD3):
        add(X.game('vs_slam'), b0, 0.6)
    add(saw(0.6), BUILD1 + 0.1, 0.9); add(crack(), BUILD1 + 0.6, 1.0); add(X.slide(600, 150, 0.35), BUILD1 + 0.6, 0.6); add(X.bonk(), BUILD1 + 0.9, 1.2)
    for k in range(6):
        add(X.game('draw_tick'), BUILD2 + 0.1 + k * 0.17, 0.7)
    add(X.toot(60, 0.12), BUILD2 + 0.6, 0.3); add(X.toot(58.7, 0.25), BUILD2 + 0.8, 0.3)
    for k in range(5):
        add(X.game('ui_toggle'), BUILD3 + 0.1 + k * 0.17, 0.9)
    add(X.toot(86, 0.25), BUILD3 + 0.95, 0.35)
    add(X.game('vs_slam'), ARRIVE, 0.9)
    for k in range(4):
        add(X.game('footstep'), ARRIVE + 0.2 + k * 0.3, 0.8)
    add(yawn()[: int(0.5 * SR)], ARRIVE + 0.2, 0.9); add(X.game('hit_wood'), ARRIVE + 1.3, 0.8)
    add(X.game('ui_open'), FINGER, 0.9); add(X.game('draw_start'), DRAG, 0.9); add(creak(SHRUG - DRAG - 0.3, 100, 320), DRAG + 0.2, 0.9)
    for k in range(7):
        add(X.game('draw_tick'), DRAG + 0.3 + k * 0.22, 0.7)
    add(X.toot(60, 0.12), SHRUG + 0.1, 0.3); add(X.toot(58.7, 0.25), SHRUG + 0.3, 0.3)
    add(X.game('bow_release'), FIRE, 1.2); add(X.game('whoosh_fast'), FIRE, 1.0); add(X.slide(1300, 500, 0.45), FIRE + 0.05, 0.5)
    add(X.bonk() * 0.8, DONK, 1.3); add(X.game('hit_ground'), DONK, 1.2)
    add(X.game('laugh')[: int(0.7 * SR)], HA, 0.7)
    add(crack(), CRUMBLE, 1.2); add(X.slide(300, 90, 0.8), CRUMBLE + 0.1, 0.8); add(X.game('body_drop'), CRUMBLE + 0.7, 1.1)
    add(X.game('jingle_win'), WIN, 1.0); add(X.game('crowd_cheer'), WIN + 0.1, 0.8)
    add(X.toot(76, 0.5), CRY + 0.3, 0.25); add(X.toot(74, 0.7), CRY + 0.8, 0.25)
    add(X.toot(79, 0.3), REMATCH, 0.3); add(X.tuba(36, 0.5), NO, 0.7)
    add(X.game('emote_pop'), CREDIT, 0.9); add(X.game('emote_pop'), CREDIT + 0.9, 0.9); add(X.game('ui_confirm'), CREDIT + 1.6, 0.9)
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
        sh = Image.new('RGB', (320 * 10, 180 * 6))
        for i in range(60):
            t = i * 0.5 + 0.25
            sh.paste(frame(t, int(t * FPS)).resize((320, 180), Image.LANCZOS), ((i % 10) * 320, (i // 10) * 180))
        sh.save(os.path.join(BUILD, 'derpy30c_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy30c.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-game848-30s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
