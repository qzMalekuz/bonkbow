"""BONK BOW soft launch, derpy cut: twenty seconds, one duel. Two scrawled stickmen on facing
cliffs take turns the way the game plays - health bars, a turn sign, the dotted aim arc - and get
all of it wrong. Same hand as tools/derpy.py (wobbly ink line that boils, lumpy heads, drool),
same kind of sound (a wonky oom-pah, slide whistles, bonk). Writes out/bonkbow-20s.mp4.

    python3 tools/derpy20.py            # the film
    python3 tools/derpy20.py --sheet    # build/derpy20_sheet.jpg, a frame every 0.5 s
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from derpy import (BUILD, DROOL, FONT, FPS, H, INK, OUT, PAPER, ROOT, W, Pen, arrow, bow, clamp, ease, lerp, lp, span, stars, stickman, text)  # noqa: E402

DUR = 20.0
LY, RY = 830, 770                      # the two ledges' tops
S = 0.62                               # the archers' size in the duel
SH = 255                               # their shoulder height above the ledge
AL = 140                               # arrow length
AX, BX = 330, 1590                     # where the archers stand
RED = (214, 48, 48)
# the beats
T1, A_TURN, A_FIRE, A_THOCK = 2.6, 4.0, 4.3, 4.85
T2, B_FIRE = 6.0, 7.5
T3, BONK = 9.5, 11.4
SD, FIRE2, CLANG = 12.7, 13.7, 14.0
FAILS, TITLE, MISS, BONK2 = 15.6, 17.4, 18.45, 19.25


def para(p0, p1, apex, k):
    """Point and heading (degrees) at k along an arc from p0 to p1 that rises to `apex` pixels."""
    x = lerp(p0[0], p1[0], k); y = lerp(p0[1], p1[1], k) - apex * 4 * k * (1 - k)
    k2 = min(1.0, k + 0.01)
    x2 = lerp(p0[0], p1[0], k2); y2 = lerp(p0[1], p1[1], k2) - apex * 4 * k2 * (1 - k2)
    return (x, y), math.degrees(math.atan2(y2 - y, x2 - x))


def world(pen, t, sun=True):
    """Two cliffs, a gap, scribbled rock, a sun."""
    pen.blob([(-30, LY), (560, LY - 6), (640, LY + 40), (600, LY + 200), (650, H + 40), (-30, H + 40)], w=10)
    pen.blob([(W + 30, RY), (1340, RY + 4), (1270, RY + 50), (1320, RY + 230), (1260, H + 40), (W + 30, H + 40)], w=10)
    for x0, y0, x1, y1 in ((80, LY + 90, 240, LY + 120), (300, LY + 210, 470, LY + 190), (120, LY + 290, 330, LY + 310), (1480, RY + 120, 1700, RY + 100),
                           (1600, RY + 260, 1840, RY + 290), (1400, RY + 330, 1560, RY + 320)):
        pen.line([(x0, y0), (x1, y1)], 6)
    for gx, gy in ((70, LY), (210, LY - 2), (470, LY - 4), (1420, RY + 2), (1730, RY), (1850, RY)):
        pen.line([(gx, gy), (gx - 12, gy - 30)], 6); pen.line([(gx + 6, gy), (gx + 20, gy - 24)], 6)
    if sun:
        pen.blob([(960 + math.cos(a) * 62, 360 + math.sin(a) * 62) for a in [i * math.tau / 10 for i in range(10)]], w=8)
        for i in range(8):
            a = i * math.tau / 8 + t * 0.4
            pen.line([(960 + math.cos(a) * 84, 360 + math.sin(a) * 84), (960 + math.cos(a) * 116, 360 + math.sin(a) * 116)], 7)


def hud(img, pen, t, hp_b=1.0, label='', tilt=0.0, drop=0.0, f=0):
    """The match furniture: two health bars and the turn sign, drawn by the same unsteady hand."""
    for x0, hp, name in ((60, 1.0, 'you'), (1340, hp_b, 'some guy')):
        d = ImageDraw.Draw(img)
        d.rectangle((x0 + 6, 56, x0 + 6 + 508 * hp, 100), fill=RED)
        pen.line([(x0, 50), (x0 + 520, 48), (x0 + 522, 106), (x0 - 2, 108), (x0, 50)], 8)
        text(img, name, (x0 + 110 if name == 'you' else x0 + 400, 118), 44, t, seed=11 if name == 'you' else 12, wob=2)
    if label:
        layer = Image.new('RGBA', (900, 200), (0, 0, 0, 0))
        text(layer, label, (450, 30), 78, t, seed=21, wob=3)
        if tilt:
            layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(140, 70))
        img.paste(layer, (510, int(150 + drop)), layer)


def aim_arms(draw=1.0):
    """Bow arm straight out, string hand drawn back toward the chin."""
    return ((90, 88), (lerp(40, -55, draw), lerp(120, 96, draw)))


IDLE = ((-20, 30), (25, -15))
UP = ((150, 170), (-150, -170))


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    shake = (0, 0)
    for t0 in (A_THOCK, BONK, CLANG, FAILS + 0.32, FAILS + 0.98, FAILS + 1.5, MISS, BONK2):
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); shake = (r.uniform(-14, 14) * (1 - k), r.uniform(-14, 14) * (1 - k))
    if t >= TITLE:
        title(img, pen, t, f)
    elif t >= FAILS:
        fails(img, pen, t, f)
    else:
        duel(img, pen, t, f)
    if shake != (0, 0):
        out = Image.new('RGB', (W, H), PAPER); out.paste(img, (int(shake[0]), int(shake[1]))); img = out
    return img


def duel(img, pen, t, f):
    world(pen, t)
    hp_b = 1.0 if t < BONK else 0.985
    # the turn sign
    if t < 0.8:
        label, tilt, drop = '', 0, 0
    elif t < T2:
        label = 'YOUR TURN'
    elif t < T3:
        label = 'HIS TURN'
    elif t < SD:
        label = 'YOUR TURN'
    else:
        label = 'SUDDEN DEATH'
    tilt = -24 * span(t, CLANG + 0.12, CLANG + 0.3) + (math.sin((t - CLANG) * 9) * 5 * math.exp(-(t - CLANG) * 2) if t > CLANG + 0.12 else 0)
    drop = 26 * span(t, CLANG + 0.12, CLANG + 0.3)
    pop = 1.0
    for t0 in (0.8, T2, T3, SD):
        if 0 <= t - t0 < 0.14:
            drop -= 30 * (1 - (t - t0) / 0.14)
    hud(img, pen, t, hp_b, label if t >= 0.8 else '', tilt, drop, f)
    a_hand, b_hand = (AX + 140, LY - SH), (BX - 140, RY - SH)

    # ---- A (left, "you") ------------------------------------------------------------------------
    a_flip, a_arms, a_lean, a_tilt, a_face = 1, IDLE, 3, math.sin(t * 2.1) * 5, dict(mouth='smile', drool=True, eyes='derp', seed=0)
    a_hop = 0.0
    a_bow = None       # (angle, pull)
    if T1 + 0.6 <= t < T2:                                   # turn 1: a lovely aim, then the other way
        d = span(t, T1 + 0.6, T1 + 1.2)
        turned = t >= A_TURN
        a_flip = -1 if turned else 1
        rel = t >= A_FIRE
        a_arms = aim_arms(0.0 if rel else d)
        a_lean = 6
        a_face = dict(mouth='smile' if rel else 'o', drool=rel, eyes='derp', seed=0, look=(0.6, 0))
        a_bow = (0 if not turned else 180, 0.0 if rel else d)
        if t >= A_THOCK + 0.25:                               # the nod
            a_tilt = 14 * abs(math.sin((t - A_THOCK - 0.25) * 9)) * (1 if t < A_THOCK + 1.0 else 0)
    elif T3 <= t < SD:                                        # turn 3: lunch
        a_arms = ((60, 150), (-60, -150))
        a_tilt = math.sin(t * 20) * 5
        a_face = dict(mouth='chew', drool=True, eyes='derp', seed=0)
    elif SD + 0.25 <= t < FAILS:
        if t < FIRE2:
            a_arms = aim_arms(span(t, SD + 0.3, FIRE2 - 0.15)); a_bow = (0, span(t, SD + 0.3, FIRE2 - 0.15)); a_lean = 6
            a_face = dict(mouth='o', drool=False, eyes='wide', seed=0, look=(0.6, 0))
        elif t < CLANG + 0.35:
            a_arms = aim_arms(0.0); a_bow = (0, 0.0)
            a_face = dict(mouth='o', drool=False, eyes='wide', seed=0, look=(0.6, -0.6))
        else:
            a_arms = UP; a_hop = abs(math.sin((t - CLANG) * 13)) * 30
            a_face = dict(mouth='smile', drool=True, eyes='shut', seed=0)
    if T2 + 1.2 <= t < T3 and t >= B_FIRE:                    # watching B's arrow leave
        a_tilt = -30 * span(t, B_FIRE, B_FIRE + 0.5) * (1 - span(t, 8.9, 9.3))
        a_face = dict(mouth='o', drool=False, eyes='wide', seed=0, look=(0.5, -1.0))
    A = stickman(pen, AX, LY, S, t, kind='bean', flip=a_flip, arms=a_arms, torso_lean=a_lean, head_tilt=a_tilt, hop=a_hop, **a_face)
    if a_bow:
        g = A['hands'][0]
        bow(pen, g, a_bow[0], 100, pull=a_bow[1] * 0.9)
        if t < (A_FIRE if t < T2 else FIRE2):
            dx = 1 if a_bow[0] == 0 else -1
            arrow(pen, (g[0] + dx * (46 - 40 * a_bow[1]), g[1]), a_bow[0], L=AL)
    elif T3 <= t < SD:
        m = (A['neck'][0] + 16, A['neck'][1] - 30)
        arrow(pen, (m[0] + 90, m[1]), 2, L=170)               # eaten like corn
    else:
        g = A['hands'][0]
        bow(pen, (g[0] + 4, g[1] - 8), 80 if a_arms is not UP else 20, 90)

    # ---- B (right, "some guy") --------------------------------------------------------------------
    b_arms, b_lean, b_tilt, b_hop, b_legs = IDLE, 3, math.sin(t * 1.7 + 1) * 5, 0.0, ((-14, 6), (16, -4))
    b_face = dict(mouth='smile', drool=True, eyes='derp', seed=3)
    b_bow = None
    if T2 + 0.5 <= t < T3:                                     # turn 2: far too hard
        d = span(t, T2 + 0.5, B_FIRE - 0.1)
        rel = t >= B_FIRE
        bend = d * (1 - span(t, B_FIRE + 0.5, B_FIRE + 0.9))
        b_lean = -62 * bend
        b_legs = ((-14 - 30 * bend, 6 + 40 * bend), (16 - 20 * bend, -4 + 30 * bend))
        b_hop = 26 * bend
        b_arms = ((90 + 62 * bend + 28 * bend, 88 + 90 * bend), (lerp(40, -55, 0 if rel else d) + 80 * bend, lerp(120, 96, 0 if rel else d) + 80 * bend))
        b_bow = (180 + 85 * bend, 0.0 if rel else d * 1.3)
        b_face = dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.2, -1.0))
        b_tilt = 20 * bend
        if rel:
            b_tilt = -28 * span(t, B_FIRE, B_FIRE + 0.5) * (1 - span(t, 8.9, 9.3))
    elif SD + 0.25 <= t < FAILS:
        if t < FIRE2:
            b_arms = aim_arms(span(t, SD + 0.3, FIRE2 - 0.15)); b_bow = (180, span(t, SD + 0.3, FIRE2 - 0.15)); b_lean = 6
            b_face = dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.6, 0))
        elif t < CLANG + 0.35:
            b_arms = aim_arms(0.0); b_bow = (180, 0.0)
            b_face = dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.6, -0.6))
        else:
            b_arms = UP; b_hop = abs(math.sin((t - CLANG) * 13 + 1)) * 30
            b_face = dict(mouth='smile', drool=True, eyes='shut', seed=3)
    if BONK <= t < BONK + 0.4:
        b_tilt += math.sin((t - BONK) * 36) * 8
    if T1 + 0.6 <= t < T2:                                     # watching A's turn, not really
        b_face = dict(mouth='smile', drool=True, eyes='derp', seed=3)
    Bm = stickman(pen, BX, RY, S, t, kind='slab', flip=-1, arms=b_arms, legs=b_legs, torso_lean=b_lean, head_tilt=b_tilt, hop=b_hop, **b_face)
    if b_bow:
        g = Bm['hands'][0]
        bow(pen, g, b_bow[0], 100, pull=b_bow[1] * 0.9)
        if t < (B_FIRE if t < T3 else FIRE2):
            a = math.radians(b_bow[0])
            arrow(pen, (g[0] + math.cos(a) * (46 - 40 * min(1, b_bow[1])), g[1] + math.sin(a) * (46 - 40 * min(1, b_bow[1]))), b_bow[0], L=AL)
    else:
        g = Bm['hands'][0]
        bow(pen, (g[0] - 4, g[1] - 8), 100 if b_arms is not UP else 160, 90)

    # ---- the aim arc, exactly as the game draws it ---------------------------------------------------
    if T1 <= t < A_FIRE:
        n = 14
        shown = int(n * span(t, T1, T1 + 0.9)) if t < A_TURN else int(n * (1 - span(t, A_TURN, A_TURN + 0.2)))
        for i in range(shown):
            p, _ = para((AX + 110, LY - SH), (BX - 20, RY - SH), 200, (i + 1) / (n + 1))
            pen.dot(p, 9 - i * 0.25)
    # ---- arrows in flight ----------------------------------------------------------------------------
    if A_FIRE <= t < T2 + 3.5:                                 # turn 1: over his own shoulder, into his own ledge
        k = clamp((t - A_FIRE) / (A_THOCK - A_FIRE))
        p, ang = para((AX - 100, LY - SH), (70, LY - 6), 150, k)
        if k < 1:
            arrow(pen, p, ang, L=AL)
        else:
            w = math.sin((t - A_THOCK) * 40) * 12 * math.exp(-(t - A_THOCK) * 6)
            arrow(pen, (70, LY + 14), 112 + w, L=AL)
            stars(pen, (70, LY - 10), A_THOCK, t, n=5, r=70)
    elif t >= T2 + 3.5 and t < FAILS:
        arrow(pen, (70, LY + 14), 112, L=AL)
    if B_FIRE <= t < B_FIRE + 0.6:                             # turn 2: straight up
        k = (t - B_FIRE) / 0.6
        y = lerp(RY - 400, -260, 1 - (1 - k) ** 2)
        arrow(pen, (BX - 30, y), -90, L=AL)
        for i in range(3):
            pen.line([(BX + 10 + i * 14, y + 260 + i * 60), (BX + 10 + i * 14, y + 310 + i * 60)], 5, amp=1.5)
    top = (Bm['top'][0], Bm['top'][1] + 18)
    if BONK - 0.55 <= t < BONK:                                # ...and back, onto its owner
        k = (t - (BONK - 0.55)) / 0.55
        arrow(pen, lp((top[0] + 20, -220), top, k * k), 92, L=AL)
    elif BONK <= t < SD:
        w = math.sin((t - BONK) * 38) * 14 * math.exp(-(t - BONK) * 5)
        arrow(pen, (top[0] + 6, top[1] + 22), 92 + w, L=AL)
        stars(pen, top, BONK, t)
        if t < BONK + 0.6:
            text(img, 'bonk', (top[0] - 250, top[1] - 120), 92, t, seed=3)
        k = (t - BONK) / 1.1                                    # one whole hit point
        if k < 1:
            text(img, '-1', (1795, 150 - 60 * k), 64, t, col=RED, seed=4)
    if FIRE2 <= t < CLANG:                                     # sudden death: both loose, and they meet
        k = (t - FIRE2) / (CLANG - FIRE2)
        mid = (960, 470)
        arrow(pen, lp((AX + 125, LY - SH), mid, k), -12, L=AL)
        arrow(pen, lp((BX - 125, RY - SH), mid, k), 190, L=AL)
    elif CLANG <= t < FAILS:
        k = clamp((t - CLANG) / 0.3)
        stars(pen, (960, 470), CLANG, t, n=9, r=130)
        p, ang = para((960, 470), (870, 215), 30, k)           # one goes up into the sign
        arrow(pen, p, -100 + (0 if k < 1 else math.sin((t - CLANG) * 30) * 8 * math.exp(-(t - CLANG) * 4)), L=AL)
        kk = clamp((t - CLANG) / 0.7)                           # the other finds the gap
        if kk < 1:
            arrow(pen, (lerp(960, 1000, kk), lerp(470, H + 260, kk * kk)), 80 + 200 * kk, L=AL)


def fails(img, pen, t, f):
    """Three cuts, about 0.6 s each."""
    u = t - FAILS
    if u < 0.6:                                                 # 1. the dodge: one decisive hop, the wrong way
        world(pen, t, sun=False)
        k = clamp(u / 0.32)
        hop = math.sin(k * math.pi) * 100
        x = AX + 150 * k
        hit = u >= 0.32
        A = stickman(pen, x, LY, S * 1.1, t, kind='pea', arms=UP if not hit else ((60, 20), (-60, -20)), hop=hop if not hit else 0, lying=span(u, 0.32, 0.45) * 0.0,
                     head_tilt=-40 * span(u, 0.32, 0.42), mouth='o', drool=False, eyes='wide' if not hit else 'shut', seed=6, neck_len=0.5)
        if not hit:
            arrow(pen, (lerp(W + 100, x + 90, k), LY - SH), 180, L=AL)
        else:
            kb = (u - 0.32) / 0.28
            arrow(pen, (x + 40 + 260 * kb, LY - SH - 20 - 300 * kb + 240 * kb * kb), 180 + 700 * kb, L=AL)
            stars(pen, A['top'], FAILS + 0.32, t)
            text(img, 'bonk', (x + 300, LY - 440), 92, t, seed=5)
    elif u < 1.2:                                               # 2. the draw: straight back off the ledge
        world(pen, t, sun=False)
        v = u - 0.6
        fall = span(v, 0.1, 0.45)
        x = BX - 230 - 60 * fall
        y = RY + 620 * span(v, 0.3, 0.6) ** 2
        stickman(pen, x, y, S, t, kind='slab', flip=-1, arms=aim_arms(1.0), lying=fall * 1.25, mouth='o', drool=False, eyes='wide', seed=7)
        if v > 0.36:
            p0 = (x - 80, y - 170)
            ka = (v - 0.36) / 0.24
            arrow(pen, (p0[0] - 500 * ka, p0[1] - 760 * ka), -125, L=AL)
        if v > 0.42:
            text(img, 'aaa', (1050, 800 - 200 * (v - 0.42)), 80, t, seed=8)
    else:                                                       # 3. shooting the camera
        world(pen, t, sun=False)
        v = u - 1.2
        stickman(pen, AX + 120, LY, S, t, kind='bean', arms=aim_arms(0.0), torso_lean=6, mouth='smile', drool=True, eyes='derp', seed=0, look=(0.2, 0.0))
        k = clamp(v / 0.3)
        if k < 1:
            s = lerp(0.2, 3.0, k * k)
            arrow(pen, (lerp(AX + 200, 960, k), lerp(LY - SH, 540, k)), -8, L=int(AL * s))
        else:
            c = (960, 540)
            pen.dot(c, 26)
            r = random.Random(77)
            for i in range(11):                                 # the lens does not survive
                a = i * math.tau / 11 + r.uniform(-0.2, 0.2); L = r.uniform(300, 760)
                mid = (c[0] + math.cos(a) * L * 0.5 + r.uniform(-40, 40), c[1] + math.sin(a) * L * 0.5 + r.uniform(-40, 40))
                pen.line([c, mid, (c[0] + math.cos(a) * L, c[1] + math.sin(a) * L)], 7, amp=2)
            text(img, 'tink', (1250, 300), 84, t, seed=9)


def title(img, pen, t, f):
    u = t - TITLE
    k = span(u, 0.0, 0.14)
    jig = (math.sin((t - BONK2) * 40) * 16 * math.exp(-(t - BONK2) * 6)) if t >= BONK2 else 0
    text(img, 'BONK BOW', (W / 2, 330 + (1 - k) * -520 + jig), 230, t, seed=1, wob=8)
    if u >= 0.35:
        text(img, "they have bows.  that's about it.", (W / 2, 650), 76, t, seed=2, wob=4)
    pen.line([(-20, 1010), (700, 1004), (1300, 1014), (W + 20, 1008)], 9)
    if MISS - 0.3 <= t:                                         # the last arrow: misses the whole title
        kk = clamp((t - (MISS - 0.3)) / 0.3)
        p, ang = para((-260, 520), (1700, 1004), 160, kk)
        if kk < 1:
            arrow(pen, p, ang, L=220)
        else:
            w = math.sin((t - MISS) * 40) * 12 * math.exp(-(t - MISS) * 6)
            arrow(pen, (1700, 1016), 62 + w, L=220)
            stars(pen, (1700, 1000), MISS, t, n=5, r=70)
    if BONK2 - 0.35 <= t:                                       # and one from above, for the logo
        kk = clamp((t - (BONK2 - 0.35)) / 0.35)
        if kk < 1:
            arrow(pen, (1010, lerp(-240, 330, kk * kk)), 90, L=220)
        else:
            kb = clamp((t - BONK2) / 0.5)
            arrow(pen, (1010 + 260 * kb, 330 - 240 * kb + 520 * kb * kb), 90 + 500 * kb, L=220)
            stars(pen, (1010, 330), BONK2, t, n=8, r=150)
            if t < BONK2 + 0.6:
                text(img, 'bonk', (1420, 150), 100, t, seed=6)


# ---- sound: the same daft band, for twenty seconds ---------------------------------------------------------
def audio(path):
    SR = 44100; n = int(DUR * SR); out = np.zeros(n)

    def tt(d):
        return np.arange(int(d * SR)) / SR

    def add(x, t, g=1.0):
        i = int(t * SR)
        if i >= n or i < 0:
            return
        x = x[:n - i]; out[i:i + len(x)] += x * g

    def tuba(m, d=0.22):
        t = tt(d); f = 440 * 2 ** ((m - 69) / 12)
        x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t)
        return np.convolve(x, np.ones(40) / 40, 'same') * np.minimum(1, t / 0.01) * np.exp(-t * 7)

    def toot(m, d=0.16):
        t = tt(d); f = 440 * 2 ** ((m - 69) / 12) * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.01) * np.clip((d - t) / 0.03, 0, 1) * 0.5

    def slide(f0, f1, d):
        t = tt(d); f = f0 * (f1 / f0) ** (t / d)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.clip((d - t) / 0.05, 0, 1) * 0.45

    def bonk():
        t = tt(0.35)
        return np.sin(2 * np.pi * np.cumsum(180 + 500 * np.exp(-t * 30)) / SR) * np.exp(-t * 12)

    def clang():
        t = tt(0.7)
        return sum(np.sin(2 * np.pi * 1400 * k * t) * np.exp(-t * (6 + i * 4)) for i, k in enumerate((1, 1.51, 2.27, 3.13))) * 0.3

    def game(name):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'assets', 'audio', 'sfx', name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             capture_output=True).stdout
        return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

    # the band: oom-pah with a tune that keeps almost landing. It stops for the jokes.
    beat = 0.3
    rests = [(A_THOCK, A_THOCK + 0.6), (B_FIRE + 0.1, T3), (BONK, BONK + 0.9), (CLANG, CLANG + 0.35), (FAILS + 1.5, TITLE), (MISS, BONK2 + 0.2), (19.7, DUR)]

    def playing(ts):
        return not any(a <= ts < b for a, b in rests)
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = 0.0
    while ts < TITLE:
        if playing(ts):
            add(tuba(36 if i % 2 == 0 else 43), ts, 0.5)
            if i % 2 == 1:
                add(toot(64 + (i % 3)), ts, 0.25); add(toot(67.3), ts, 0.2)
            add(toot(tune[i % len(tune)] + (12 if SD <= ts < FAILS and i % 4 == 0 else 0), 0.2), ts + 0.15 + (0.04 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    for t0 in (0.8, T2, T3):                                    # the turn sign
        add(game('emote_pop'), t0, 0.8)
    add(game('draw_start'), T1 + 0.6, 0.8); add(slide(500, 900, 0.9), T1, 0.25)       # the aim arc
    add(slide(700, 300, 0.2), A_TURN, 0.5)                      # he turns round
    add(game('bow_release'), A_FIRE, 1.0); add(game('hit_wood'), A_THOCK, 1.1)
    add(game('draw_start'), T2 + 0.5, 0.8); add(np.interp(np.linspace(0, 1, int(0.9 * SR)), np.linspace(0, 1, len(game('draw_start'))), game('draw_start')), T2 + 0.7, 0.7)
    add(game('bow_release'), B_FIRE, 1.0); add(slide(300, 2400, 0.7), B_FIRE, 0.8)    # up it goes
    add(toot(60, 0.12), 8.5, 0.3); add(toot(58.7, 0.2), 8.72, 0.3)                    # nothing happens: two doubtful notes
    for k in range(5):                                           # lunch
        add(game('draw_tick'), T3 + 0.3 + k * 0.28, 0.9)
    add(slide(2400, 260, 0.55), BONK - 0.55, 0.8); add(bonk(), BONK, 1.3); add(game('emote_pop'), BONK + 0.02, 0.9)
    add(toot(84, 0.1), BONK + 0.55, 0.3)                        # the "-1"
    add(game('vs_slam'), SD, 1.0)
    add(game('draw_start'), SD + 0.3, 0.8); add(game('bow_release'), FIRE2, 1.0); add(game('bow_release'), FIRE2 + 0.03, 0.9)
    add(clang(), CLANG, 1.0); add(game('hit_wood'), CLANG + 0.3, 0.9); add(game('crowd_cheer'), CLANG + 0.4, 0.7)
    add(game('whoosh_fast'), FAILS + 0.1, 0.9); add(bonk(), FAILS + 0.32, 1.2)
    add(game('draw_start'), FAILS + 0.6, 0.7); add(slide(900, 180, 0.5), FAILS + 0.75, 0.7); add(game('body_drop'), FAILS + 1.18, 0.9)
    add(game('bow_release'), FAILS + 1.2, 1.0); add(clang() * np.exp(-tt(0.7) * 6), FAILS + 1.5, 0.9); add(game('hit_head'), FAILS + 1.5, 0.6)
    for k, m in enumerate((48, 55, 60, 64, 67, 72)):             # the title: a proud, wrong fanfare
        add(tuba(m, 0.5), TITLE + k * 0.045, 0.55)
    add(toot(83.4, 0.6), TITLE + 0.3, 0.3)
    add(game('whoosh_fast'), MISS - 0.3, 0.9); add(game('hit_wood'), MISS, 1.1)
    add(slide(2000, 300, 0.35), BONK2 - 0.35, 0.7); add(bonk(), BONK2, 1.4); add(game('laugh'), BONK2 + 0.12, 0.45)
    out = np.tanh(out * 0.9); out /= max(1e-6, np.abs(out).max()); out *= 0.85
    out[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    wavfile.write(path, SR, (out * 32767).astype(np.int16))


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    N = int(DUR * FPS)
    if '--sheet' in sys.argv:
        ts = [i * 0.5 + 0.2 for i in range(int(DUR / 0.5))]
        sh = Image.new('RGB', (384 * 8, 216 * 5))
        for i, t in enumerate(ts):
            sh.paste(frame(t, int(t * FPS)).resize((384, 216), Image.LANCZOS), ((i % 8) * 384, (i // 8) * 216))
        sh.save(os.path.join(BUILD, 'derpy20_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy20.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-20s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(N):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
