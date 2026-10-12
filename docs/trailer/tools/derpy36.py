"""BONK BOW - "Four More Days". The deadline moved to October 12. Steve has four days to get good.
He uses them. Thirty-six seconds, scrawled, one thing at a time.

    python3 tools/derpy36.py            # out/bonkbow-fourdays-36s.mp4
    python3 tools/derpy36.py --sheet
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
import derpy60 as X  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, W, Pen, arrow, bow, clamp, lerp, lp, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, para, world  # noqa: E402
from derpy30 import STEVE  # noqa: E402
from derpy30c import finger, say  # noqa: E402

DUR = 36.0
NEWS, YOU, D1, D2, D3, D4, OCT, FINGER, FIRE, SIGN, WINS, QUIP, CREDIT, TITLE = 0.0, 3.6, 6.2, 10.6, 14.4, 18.6, 22.2, 24.2, 26.2, 27.0, 28.6, 29.8, 32.0, 33.0
SHAKES = [D1 + 2.2, D3 + 2.9, SIGN, SIGN + 0.55, TITLE + 1.05, TITLE + 1.85]
PHONE = (0, 0)


def hud(img, pen, t, hp_a=1.0, hp_b=1.0, label='', hits=None):
    d = ImageDraw.Draw(img)
    for x0, hp, name in ((60, hp_a, 'steve'), (1340, hp_b, 'some guy')):
        if hp > 0:
            d.rectangle((x0 + 6, 56, x0 + 6 + 508 * hp, 100), fill=RED)
        pen.line([(x0, 50), (x0 + 520, 48), (x0 + 522, 106), (x0 - 2, 108), (x0, 50)], 8)
        text(img, name, (x0 + 110 if name == 'steve' else x0 + 400, 118), 44, t, seed=11 if name == 'steve' else 12, wob=2)
    if label:
        text(img, label, (W / 2, 70), 78, t, seed=21, wob=3)
    if hits is not None:
        text(img, 'hits: %d   bonks: %d' % hits, (W / 2, 170), 50, t, seed=22, wob=2)


def opp(pen, t, face=None, arms=None, tilt=0.0, x=BX, gy=RY, lying=0.0):
    f = face or dict(mouth='chew', drool=True, eyes='derp', seed=3)
    A = stickman(pen, x, gy, S, t, kind='slab', flip=-1, arms=arms or ((60, 150), (-60, -150)), head_tilt=math.sin(t * 20) * 5 * (f.get('mouth') == 'chew') + tilt, lying=lying, **f)
    if f.get('mouth') == 'chew':
        m = (A['neck'][0] - 16, A['neck'][1] - 30); arrow(pen, (m[0] - 90, m[1]), 178, L=170)
    return A


def steve(pen, t, x=AX, gy=LY, arms=((100, 100), (-30, 20)), lean=4, tilt=None, bowang=80, **face):
    f = dict(mouth='smile', drool=True, eyes='derp', look=(0.9, 0.1)); f.update(face)
    A = stickman(pen, x, gy, S, t, arms=arms, torso_lean=lean, head_tilt=(math.sin(t * 2) * 5 if tilt is None else tilt), **f, **STEVE)
    g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), bowang, 90)
    return A


def phone(pen, img, p, t, lines):
    px, py = p
    pen.blob([(px - 150, py - 230), (px + 150, py - 230), (px + 150, py + 230), (px - 150, py + 230)], w=9)
    pen.line([(px - 110, py - 160), (px + 110, py - 160)], 6)
    for i, (sz, s) in enumerate(lines):
        text(img, s, (px, py - 110 + i * 70), sz, t, seed=70 + i, wob=1)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < D1:
        news(img, pen, t)
    elif t < OCT:
        training(img, pen, t)
    elif t < CREDIT:
        october(img, pen, t)
    elif t < TITLE:
        credit(img, pen, t)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def news(img, pen, t):
    world(pen, t)
    hud(img, pen, t)
    buzz = 0.3 < t < 1.0
    holding = t >= 1.0
    A = steve(pen, t, arms=((100, 100), (-30, 20)) if not holding else ((100, 100), (-70, -150)), look=(0.9, 0.1) if not holding else (0.5, 0.9),
              tilt=(math.sin(t * 40) * 3 if buzz else None), mouth='smile' if t < 2.6 else 'o', drool=t < 2.6)
    if buzz:
        text(img, 'bzz', (AX + 120, LY - 480), 56, t, seed=60)
    if holding:
        phone(pen, img, (AX + 420, LY - 250), t, [(34, 'CLOCK IN'), (40, 'deadline'), (40, 'extended to'), (56, 'OCT 12')])
    if t >= 2.0:
        say(img, (AX + 80, LY - 500), 'four more days.', t, 61, 72)
    if t >= 2.9:
        say(img, (AX + 80, LY - 400 + 20), 'to get good.', t, 62, 72)
    if t >= YOU:
        opp(pen, t, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.0)))
        if t >= YOU + 0.3:
            say(img, (BX, RY - 360), 'you?', t, 63, 70)
        if t >= YOU + 1.3:
            say(img, (AX + 80, LY - 500), 'me.', t, 64, 80)
        if t >= YOU + 2.1:
            say(img, (BX, RY - 360), 'ok.', t, 65, 70)
    else:
        opp(pen, t)


def tally(img, pen, t, hits, bonks):
    pen.blob([(1280, 200), (1860, 196), (1864, 330), (1276, 334)], w=8)
    text(img, 'hits: %d    bonks: %d' % (hits, bonks), (1570, 265), 52, t, seed=23, wob=2)


def training(img, pen, t):
    if t < D2:                                               # DAY 1: target practice, on his own ledge
        u = t - D1
        world(pen, t)
        hud(img, pen, t, label='DAY 1')
        tally(img, pen, t, 0, 0)
        from props_scrawl import target
        tx = 540
        target(pen, (tx, LY - 120), 70)
        d = span(u, 0.6, 1.6); rel = u >= 1.7
        A = stickman(pen, AX - 80, LY, S, t, arms=aim_arms(0 if rel else d), torso_lean=6, mouth='o', drool=False, eyes='wide' if d > 0.4 else 'derp', look=(0.9, 0.1), **STEVE)
        g = A['hands'][0]; bow(pen, g, 0, 100, pull=(0 if rel else d) * 0.9)
        if not rel:
            arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        else:
            k = clamp((u - 1.7) / 0.5)
            p, ang = para((g[0] + 46, g[1]), (AX + 40, LY - 4), 40, k)
            arrow(pen, p, ang, L=140)
            if k >= 1:
                stars(pen, (AX + 40, LY - 10), D1 + 2.2, t, n=5, r=60)
        if u > 2.6:
            say(img, (AX - 60, LY - 440), 'close.', t, 80, 70)
        opp(pen, t, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.1)))
    elif t < D3:                                             # DAY 2: theory
        u = t - D2
        X.ground(pen)
        hud(img, pen, t, label='DAY 2')
        tally(img, pen, t, 0, 0)
        flipk = span(u, 1.6, 2.0)
        A = stickman(pen, 760, X.GY, 1.0, t, arms=((60, 20), (-60, -20)), torso_lean=8, head_tilt=18, mouth='flat', drool=False, eyes='derp', look=(0.3, 0.9), **STEVE)
        bx, by = 760 + 10, X.GY - 300
        ang = 90 * flipk
        pts = [rot((bx + x, by + y), ang, (bx, by)) for x, y in ((-170, -110), (170, -110), (170, 110), (-170, 110))]
        pen.blob(pts, w=8, fill=(220, 90, 80))
        layer = Image.new('RGBA', (400, 240), (0, 0, 0, 0))
        text(layer, 'ARCHERY', (200, 60), 56, t, seed=81, wob=1); text(layer, 'for beginners', (200, 130), 40, t, seed=82, wob=1)
        layer = layer.rotate(180 - ang, resample=Image.BICUBIC, expand=False)
        img.paste(layer, (int(bx - 200), int(by - 120)), layer)
        if 0.6 < u < 1.5:
            say(img, (760, X.GY - 700), 'hm.', t, 83, 70)
        if u > 2.4:
            say(img, (760, X.GY - 700), 'hm.', t, 84, 70)
    elif t < D4:                                             # DAY 3: the draw. too hard.
        u = t - D3
        world(pen, t)
        hud(img, pen, t, label='DAY 3')
        tally(img, pen, t, 0, 1 if u >= 2.9 else 0)
        d = span(u, 0.4, 1.6); rel = u >= 1.7; hit = u >= 2.9
        bend = d * (1 - span(u, 1.7, 2.1))
        if not hit:
            A = stickman(pen, AX - 60 * bend, LY, S, t, torso_lean=6 - 62 * bend, hop=26 * bend, legs=((-14 - 30 * bend, 6 + 40 * bend), (16 - 20 * bend, -4 + 30 * bend)),
                         arms=((90 + 90 * bend, 88 + 90 * bend), (lerp(40, -55, 0 if rel else d) + 80 * bend, lerp(120, 96, 0 if rel else d) + 80 * bend)),
                         head_tilt=20 * bend - (28 * span(u, 1.7, 2.1) if rel else 0), mouth='o', drool=False, eyes='wide', look=(0.3, -1.0 if rel else -0.2), **STEVE)
            g = A['hands'][0]; bow(pen, g, 85 * bend, 100, pull=(0 if rel else d) * 1.3)
            if not rel:
                a = math.radians(85 * bend); arrow(pen, (g[0] + math.cos(a) * (46 - 40 * d), g[1] + math.sin(a) * (46 - 40 * d)), 85 * bend, L=140)
            top = (A['top'][0], A['top'][1] + 18)
            if 1.7 <= u < 2.25:
                arrow(pen, (AX - 30, lerp(LY - 400, -260, 1 - (1 - (u - 1.7) / 0.55) ** 2)), -90, L=140)
            elif u >= 2.4:
                k = (u - 2.4) / 0.5
                arrow(pen, lp((top[0] + 10, -220), top, k * k), 92, L=140)
            if 0.9 < u < 1.7 and int(u * 8) % 2 == 0:
                text(img, 'hnng', (AX + 160, LY - 560), 64, t, seed=85)
        else:
            A = stickman(pen, AX, LY, S, t, lying=1.0, mouth='o', drool=False, eyes='shut', **STEVE)
            arrow(pen, (AX - 20, LY - 100), 100, L=140)
            stars(pen, (AX - 20, LY - 120), D3 + 2.9, t)
            if u < 3.5:
                text(img, 'bonk', (AX + 280, LY - 480), 92, t, seed=86)
            if u > 3.5:
                say(img, (AX + 200, LY - 300), 'noted.', t, 87, 64)
        opp(pen, t, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.1)))
    else:                                                    # DAY 4: rest. visualisation.
        u = t - D4
        world(pen, t, sun=False)
        pen.blob([(960 + math.cos(a) * 62, 300 + math.sin(a) * 62) for a in [i * math.tau / 10 for i in range(10)]], w=8, fill=(230, 230, 236))   # the moon
        hud(img, pen, t, label='DAY 4')
        tally(img, pen, t, 0, 1)
        A = stickman(pen, AX, LY, S, t, lying=1.0, flip=1, mouth='smile', drool=True, eyes='shut', **STEVE)
        bow(pen, (AX - 40, LY - 70), 10, 90)
        text(img, 'z', (AX + 180, LY - 300 - (u * 40) % 120), 50, t, seed=88); text(img, 'z', (AX + 260, LY - 380 - (u * 40 + 60) % 120), 60, t, seed=89)
        if u > 0.8:                                          # the dream
            k = span(u, 0.8, 1.2)
            cx, cy = 780, 420
            for i, (dx, dy, r) in enumerate(((-160, 200, 18), (-110, 130, 28), (-40, 70, 40))):
                pen.blob([(cx + dx + math.cos(a) * r * k, cy + dy + math.sin(a) * r * k) for a in [j * math.tau / 8 for j in range(8)]], w=6)
            pen.blob([(cx + math.cos(a) * (300 + 40 * math.sin(a * 3)) * k, cy + math.sin(a) * (170 + 20 * math.cos(a * 4)) * k) for a in [j * math.tau / 18 for j in range(18)]], w=8, amp=4)
            if k >= 1:
                from props_scrawl import target
                target(pen, (cx + 120, cy + 10), 70)
                arrow(pen, (cx + 120, cy + 10), 0, L=150)
                stickman(pen, cx - 170, cy + 130, 0.42, t, arms=UP, mouth='smile', drool=False, eyes='shut', **STEVE)
                if u > 1.8:
                    text(img, 'bullseye', (cx, cy - 100), 56, t, seed=90, wob=2)
        opp(pen, t, face=dict(mouth='smile', drool=True, eyes='shut', seed=3), lying=1.0)
        text(img, 'z', (BX - 140, RY - 240 - (u * 40 + 30) % 120), 50, t, seed=91)


def october(img, pen, t):
    world(pen, t)
    fired = t >= FIRE; signed = t >= SIGN; won = t >= WINS
    hud(img, pen, t, 1.0, 0.0 if won else 1.0, 'OCTOBER 12' if t < FIRE - 1.2 else ('' if not won else 'steve wins'))
    if FIRE - 1.2 <= t and not signed:
        drop = 0
        label_y = 70
        text(img, 'YOUR TURN', (W / 2, label_y), 78, t, seed=21, wob=3)
    elif signed:
        k = span(t, SIGN, SIGN + 0.55)
        if not won:
            layer = Image.new('RGBA', (700, 160), (0, 0, 0, 0))
            text(layer, 'YOUR TURN', (350, 40), 78, t, seed=21, wob=3)
            layer = layer.rotate(-35 * k, resample=Image.BICUBIC)
            img.paste(layer, (int(lerp(W / 2 - 350, BX - 380, k)), int(lerp(40, RY - 420, k * k))), layer)
    if WINS <= t < WINS + 1.2:
        text(img, '-1', (1795, 150 - 60 * (t - WINS) / 1.2), 64, t, col=RED, seed=4)
    d = span(t, FINGER + 0.6, FIRE - 0.15) if not fired else 0
    if not fired:
        A = stickman(pen, AX - 20 * d, LY, S, t, arms=aim_arms(d), torso_lean=6 - 20 * d, legs=((-14 - 15 * d, 6 + 20 * d), (16 - 8 * d, -4 + 15 * d)),
                     mouth='o' if d > 0.2 else 'flat', drool=False, eyes='wide' if d > 0.5 else 'derp', look=(0.9, -0.1) if t < FINGER else (0.0, 0.0) if t < FINGER + 0.5 else (0.9, -0.2), **STEVE)
        g = A['hands'][0]; bow(pen, g, 0, 100, pull=d * 0.9); arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
    else:
        A = stickman(pen, AX, LY, S, t, arms=aim_arms(0), torso_lean=6, mouth='o' if not won else 'smile', drool=won, eyes='wide' if not won else 'derp', look=(0.9, -0.3) if not won else (0.0, 0.0), **STEVE)
        g = A['hands'][0]; bow(pen, g, 0, 100)
    if FINGER <= t < FIRE:
        k = span(t, FINGER, FINGER + 0.6)
        fp = (lerp(1500, AX + 110 + 46 - 40 * d, k), lerp(1000, LY - SH + 20, k))
        finger(pen, fp)
        if t < FINGER + 0.6:
            say(img, (1300, 560), 'ok.', t, 92, 70)
        if t >= FINGER + 0.9:
            n = 14
            for i in range(int(n * span(t, FINGER + 0.9, FINGER + 1.6))):
                p, _ = para((AX + 110, LY - SH), (W / 2, 90), 120, (i + 1) / (n + 1))
                pen.dot(p, 9 - i * 0.25)
    if FIRE <= t < SIGN:
        k = (t - FIRE) / (SIGN - FIRE)
        p, ang = para((AX + 110, LY - SH), (W / 2, 90), 120, k)
        arrow(pen, p, ang, L=140)
    if signed:
        stars(pen, (W / 2, 90), SIGN, t, n=7, r=90)
    # the other guy: watching, then under a sign
    if not won:
        opp(pen, t, face=dict(mouth='flat' if t < SIGN + 0.3 else 'o', drool=False, eyes='derp' if t < SIGN + 0.3 else 'wide', seed=3, look=(0.9, 0.0) if t < SIGN + 0.3 else (0.2, -1.0)),
            tilt=(-25 if SIGN + 0.3 <= t else 0))
    else:
        opp(pen, t, face=dict(mouth='o', drool=False, eyes='shut', seed=3), lying=1.0)
        layer = Image.new('RGBA', (700, 160), (0, 0, 0, 0))
        text(layer, 'YOUR TURN', (350, 40), 78, t, seed=21, wob=3)
        layer = layer.rotate(-35 + math.sin((t - WINS) * 20) * 4 * math.exp(-(t - WINS) * 4), resample=Image.BICUBIC)
        img.paste(layer, (BX - 380, RY - 230), layer)
        stars(pen, (BX - 60, RY - 150), WINS, t)
        if t < WINS + 0.9:
            say(img, (BX + 120, RY - 420), 'ow.', t, 93, 70)
    if t >= QUIP:
        say(img, (AX + 120, LY - 460), 'four days well spent.', t, 94, 64)
    if t >= QUIP + 1.0:
        say(img, (BX - 60, RY - 460), "you didn't practice.", t, 95, 56)
    if t >= QUIP + 1.8:
        say(img, (AX + 120, LY - 340), 'no.', t, 96, 80)


def credit(img, pen, t):
    u = t - CREDIT
    text(img, 'submitting october 12.', (W / 2, 420), 110, t, seed=100, wob=3)
    if u > 0.5:
        text(img, '(probably.)', (W / 2, 600), 70, t, seed=101, wob=2)


def audio(path):
    SR = X.SR; n = int(DUR * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = x[:n - i]; out[i:i + len(x)] += x * g

    def creak(d, f0=120, f1=260):
        t = X.tt(d); f = f0 + (f1 - f0) * (t / d) + 30 * np.sin(2 * np.pi * 11 * t)
        return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 * np.minimum(1, t / 0.05)

    def buzz():
        t = X.tt(0.6); return np.sign(np.sin(2 * np.pi * 160 * t)) * (np.sin(2 * np.pi * 8 * t) > 0) * 0.15

    def snore(d=3.4):
        t = X.tt(d); r = np.random.RandomState(2)
        env = np.clip(np.sin(2 * np.pi * 0.55 * t), 0, 1)
        return np.convolve(r.randn(len(t)), np.ones(30) / 30, 'same') * env * 1.2
    rests = [(0, 1.0), (D1 + 2.2, D1 + 2.7), (D3 + 2.9, D3 + 3.5), (D4, OCT), (SIGN, SIGN + 0.6), (WINS, WINS + 0.5), (QUIP + 1.8, CREDIT), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = 1.0; beat = 0.3
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if ts >= OCT else 0
            soft = 0.6 if ts < D1 else 1.0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5 * soft)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25 * soft); add(X.toot(67.3 + up), ts, 0.2 * soft)
            add(X.toot(tune[i % len(tune)] + up, 0.2), ts + 0.15 + (0.04 if i % 3 == 0 else 0), 0.33 * soft)
        ts += beat; i += 1
    add(buzz(), 0.3, 1.0); add(X.game('ui_open'), 1.0, 0.9); add(X.game('ui_click'), 1.6, 0.6)
    add(X.toot(84, 0.3), 2.0, 0.3); add(X.toot(86.5, 0.5), 2.9, 0.3)
    add(X.toot(60, 0.15), YOU + 0.3, 0.3); add(X.toot(72, 0.2), YOU + 1.3, 0.35); add(X.toot(58, 0.2), YOU + 2.1, 0.3)
    for d0 in (D1, D2, D3, D4, OCT):
        add(X.game('vs_slam'), d0, 0.8)
    add(creak(1.0), D1 + 0.6, 0.8); add(X.game('bow_release'), D1 + 1.7, 1.0); add(X.game('hit_ground'), D1 + 2.2, 1.0); add(X.toot(60, 0.3), D1 + 2.6, 0.3)
    add(X.game('ui_toggle'), D2 + 1.7, 0.8); add(X.toot(60, 0.12), D2 + 0.7, 0.3); add(X.toot(58.7, 0.3), D2 + 2.5, 0.3)
    add(creak(1.2, 100, 340), D3 + 0.4, 0.9)
    for k in range(5):
        add(X.game('draw_tick'), D3 + 0.6 + k * 0.22, 0.7)
    add(X.game('bow_release'), D3 + 1.7, 1.0); add(X.slide(300, 2400, 0.55), D3 + 1.7, 0.8); add(X.slide(2400, 260, 0.5), D3 + 2.4, 0.8); add(X.bonk(), D3 + 2.9, 1.3)
    add(X.toot(62, 0.3), D3 + 3.6, 0.3)
    add(snore(3.5), D4, 0.7); add(X.game('jingle_win')[: int(1.0 * X.SR)], D4 + 1.8, 0.3)
    add(X.game('ui_open'), FINGER, 0.9); add(X.toot(72, 0.2), FINGER + 0.1, 0.3); add(X.game('draw_start'), FINGER + 0.6, 0.9); add(creak(1.3, 100, 320), FINGER + 0.7, 0.8)
    add(X.game('bow_release'), FIRE, 1.1); add(X.game('whoosh_fast'), FIRE, 0.8); add(X.game('hit_wood'), SIGN, 1.1); add(X.slide(600, 150, 0.5), SIGN + 0.05, 0.6)
    add(X.bonk(), SIGN + 0.55, 1.3); add(X.game('body_drop'), SIGN + 0.6, 0.9); add(X.toot(60, 0.3), WINS + 0.3, 0.3)
    add(X.game('jingle_win'), WINS, 0.8)
    add(X.toot(76, 0.5), QUIP + 0.2, 0.25); add(X.toot(64, 0.3), QUIP + 1.1, 0.25); add(X.tuba(36, 0.5), QUIP + 1.8, 0.7)
    add(X.game('emote_pop'), CREDIT, 0.9); add(X.game('emote_pop'), CREDIT + 0.5, 0.8)
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
        sh.save(os.path.join(BUILD, 'derpy36_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy36.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-fourdays-36s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
