"""BONK BOW, the shovel bow: thirty seconds. A comment asked for the giant bow with a shovel for
an arrow. Tall Steve has one. It does not go well for anyone, including the cliff. Faster than
the launch film: a cut every couple of seconds, something always in the air.

    python3 tools/derpy30.py            # out/bonkbow-shovel-30s.mp4
    python3 tools/derpy30.py --sheet    # build/derpy30_sheet.jpg, two frames a second
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
from derpy20 import AL, AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, hud, para, world  # noqa: E402

DUR = 30.0
# beats
CARD, DRAG, LOAD, FIRE, DONK, CRUMBLE, SNAP, SHRUG, GUY2, LAUNCH, LAND, TUG, STRING, PROUD, TITLE = \
    0.0, 1.6, 5.0, 8.5, 10.0, 10.3, 12.8, 14.0, 15.0, 16.6, 17.6, 19.0, 21.6, 23.0, 26.0
BIG = 470                       # the bow's half-height
SHOVEL = 560
SHAKES = [FIRE, DONK, CRUMBLE + 0.6, SNAP, LAND, STRING, STRING + 0.6, STRING + 0.9, STRING + 1.2, TITLE + 1.05, TITLE + 1.85]
STEVE = dict(kind='pea', neck_len=1.05, seed=2)


def shovel(pen, tip, ang, L=SHOVEL):
    a = math.radians(ang)
    tail = (tip[0] - math.cos(a) * L, tip[1] - math.sin(a) * L)
    pen.line([tail, tip], 11, (130, 90, 45), amp=1.6)
    pen.line([(tail[0] - math.sin(a) * 26, tail[1] + math.cos(a) * 26), (tail[0] + math.sin(a) * 26, tail[1] - math.cos(a) * 26)], 9, (130, 90, 45))
    b = [(0, -40), (90, -58), (128, 0), (90, 58), (0, 40)]
    pen.blob([(tip[0] + math.cos(a) * bx - math.sin(a) * by, tip[1] + math.sin(a) * bx + math.cos(a) * by) for bx, by in b], w=8, fill=(70, 70, 76))


def giant_bow(pen, grip, ang=0, pull=0.0, broken=0.0, tape=False):
    if broken:
        for s in (1, -1):
            top = (grip[0], grip[1] - s * 6)
            pts = [(-math.cos(math.radians(a)) * BIG * 0.34 + BIG * 0.34, math.sin(math.radians(a)) * BIG) for a in (0, 25, 50, 78)]
            q = [(top[0] + px + broken * 90 * s * 0, top[1] + s * py) for px, py in pts]
            q = [rot((x, y), s * broken * 40, grip) for x, y in q]
            pen.line(q, 12, (120, 70, 30))
        pen.line([(grip[0] - 30, grip[1] - 12), (grip[0] + 24, grip[1] + 10)], 7, (230, 230, 220), amp=4)
        return
    q = bow(pen, grip, ang, BIG, pull=pull)
    if tape:
        for k in (-0.08, 0.0, 0.08):
            pen.line([(grip[0] - 40, grip[1] + k * BIG - 10), (grip[0] + 40, grip[1] + k * BIG + 8)], 10, (150, 150, 160))
    return q


def opponent(pen, t, x=BX, gy=RY, face=None, head_tilt=0.0):
    f = face or dict(mouth='chew', drool=True, eyes='derp', seed=3)
    A = stickman(pen, x, gy, S, t, kind='slab', flip=-1, arms=((60, 150), (-60, -150)), head_tilt=math.sin(t * 20) * 5 + head_tilt, **f)
    m = (A['neck'][0] - 16, A['neck'][1] - 30)
    arrow(pen, (m[0] - 90, m[1]), 178, L=170)
    return A


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < DRAG:
        text(img, 'someone in the comments said:', (W / 2, 360), 100, t, seed=1, wob=2)
        if t > 0.7:
            text(img, '"add this."', (W / 2, 560), 150, t, seed=2, wob=4)
    elif t < GUY2:
        scene_steve(img, pen, t)
    elif t < TUG:
        scene_guy2(img, pen, t)
    elif t < PROUD:
        scene_tug(img, pen, t)
    elif t < TITLE:
        scene_proud(img, pen, t)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-18, 18) * (1 - k)), int(r.uniform(-18, 18) * (1 - k)))); img = out
    return img


def ledge_bite(pen, k):
    """The right ledge loses its corner (drawn after the world: a bite of paper, then a new edge)."""
    if k <= 0:
        return
    pen.d.polygon([(1250, RY - 20), (1620, RY - 20), (1620, RY + 400), (1250, RY + 400)], fill=PAPER)
    pen.line([(1620, RY + 2), (1600, RY + 120), (1530, RY + 260), (1480, RY + 420)], 10)


def chunk(pen, x, y, t):
    pen.blob([(x - 180, y), (x + 180, y - 4), (x + 150, y + 170), (x - 120, y + 190)], w=10)
    pen.line([(x - 60, y + 80), (x + 40, y + 90)], 6)


def scene_steve(img, pen, t):
    world(pen, t)
    hit = t >= DONK
    hp = 1.0 if t < DONK else 0.97
    hud(img, pen, t, hp, 'YOUR TURN' if t < SNAP else 'still your turn', 0, 0)
    # --- the opponent, and the ledge he is about to lose
    fall = span(t, CRUMBLE, CRUMBLE + 0.7)
    if t >= CRUMBLE:
        ledge_bite(pen, 1)
        cy = RY + 470 * fall ** 2
        chunk(pen, BX - 110, cy, t)
        gy = cy
    else:
        gy = RY
    opponent(pen, t, gy=gy, face=(dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.7, 0.6 if fall > 0.5 else -0.4)) if t >= DONK - 0.3 else None),
             head_tilt=(-20 if DONK - 0.3 <= t < DONK else 0) + (math.sin((t - CRUMBLE) * 30) * 10 if CRUMBLE <= t < CRUMBLE + 0.8 else 0))
    if DONK <= t < DONK + 1.2:
        text(img, '-1', (1795, 150 - 60 * (t - DONK) / 1.2), 64, t, col=RED, seed=4)
    if hit:
        w = math.sin((t - DONK) * 30) * 10 * math.exp(-(t - DONK) * 4)
        if t < CRUMBLE:
            shovel(pen, (BX - 60, RY + 6), 70 + w)
        else:
            shovel(pen, (BX - 60, gy + 6), 70 + w)
        stars(pen, (BX - 60, RY), DONK, t, n=9, r=120)
        if t < DONK + 0.6:
            text(img, 'DONK', (BX - 320, RY - 330), 100, t, seed=5)
    # --- Steve
    if t < LOAD:                                   # dragging it in
        k = span(t, DRAG, LOAD - 0.2)
        x = lerp(-200, AX, k)
        ph = t * 10
        A = stickman(pen, x, LY, S, t, legs=((math.sin(ph) * 32, 6), (-math.sin(ph) * 32, -4)), torso_lean=38, arms=((-120, -150), (-110, -130)),
                     head_tilt=20, mouth='flat', drool=True, eyes='derp', look=(0.9, 0.2), **STEVE)
        g = A['hands'][1]
        grip = (g[0] - 160, LY - 40)
        giant_bow(pen, grip, -62)
        shovel(pen, (x + 360, LY - 28), 6)
        if t > DRAG + 0.4 and int(t * 6) % 2 == 0:
            text(img, 'scrrrr', (x - 300, LY - 200), 60, t, seed=6)
    elif t < FIRE:                                 # standing it up, loading, pulling with everything he has
        d = span(t, LOAD + 0.9, FIRE - 0.15)
        bend = d
        up = span(t, LOAD, LOAD + 0.5)
        A = stickman(pen, AX - 60 * bend, LY, S, t, torso_lean=lerp(38, 6, up) - 70 * bend, hop=80 * bend,
                     legs=((-14 - 40 * bend, 6 + 50 * bend), (16 - 30 * bend, -4 + 40 * bend)), arms=((88, 88), (lerp(40, -70, d) + 70 * bend, lerp(120, 96, d) + 60 * bend)),
                     head_tilt=20 * bend, mouth='o' if d > 0.2 else 'flat', drool=d < 0.2, eyes='wide' if d > 0.5 else 'derp', look=(0.9, -0.2), **STEVE)
        g = A['hands'][0]
        grip = (g[0], g[1]) if up >= 1 else (lerp(AX - 20, g[0], up), lerp(LY - 40, g[1], up))
        giant_bow(pen, grip, lerp(-62, 0, up), pull=d * 1.3)
        if up >= 1:
            shovel(pen, (grip[0] + 330 - 230 * d, grip[1]), 0)
        if d > 0.6 and int(t * 8) % 2 == 0:
            text(img, 'hnnng', (AX + 100, LY - 560), 70, t, seed=7)
    elif t >= SNAP - 1.2:                          # back for the bow. it has had enough.
        u = t - (SNAP - 1.2)
        x = lerp(-200, AX - 60, span(u, 0, 0.9))
        broken = t >= SNAP
        shrug = t >= SHRUG
        ph = t * 10
        A = stickman(pen, x, LY, S, t, legs=((math.sin(ph) * 30 * (u < 0.9), 6), (-math.sin(ph) * 30 * (u < 0.9), -4)), torso_lean=8,
                     arms=(((100, 100) if not shrug else (150, 170)), ((20, 40) if not shrug else (-150, -170))),
                     head_tilt=(math.sin((t - SNAP) * 30) * 10 * math.exp(-(t - SNAP) * 4) if broken else 0), mouth='smile' if not broken else 'o', drool=not broken,
                     eyes='derp' if not broken else 'wide', look=(0.0, 0.0) if broken else (0.9, 0.1), **STEVE)
        g = A['hands'][0]
        giant_bow(pen, (g[0] + 20, g[1]) if not shrug else (AX - 20, LY - 40), 0 if not shrug else -80, broken=(1.0 if broken else 0.0))
        if broken and t < SNAP + 0.5:
            text(img, 'crack', (AX + 320, LY - 620), 100, t, seed=14)
            stars(pen, (g[0] + 20, g[1]), SNAP, t, n=7, r=110)
        if shrug and t < SHRUG + 0.8:
            text(img, '?', (x + 200, LY - 660), 120, t, seed=15)
    else:                                          # the release: the shovel one way, Steve the other
        k = clamp((t - FIRE) / 0.5)
        x = lerp(AX - 60, -500, k * k)
        A = stickman(pen, x, LY - 120 - 300 * k, S, t, lying=0.9, flip=-1, arms=UP, legs=((-60, 60), (70, -70)), mouth='o', drool=False, eyes='wide', **STEVE)
        giant_bow(pen, (AX + 40, LY - SH + 60 * k), 0 + 25 * math.sin(t * 20) * (1 - k), pull=0.0)
        if t < FIRE + 0.6:
            text(img, 'aaa', (AX - 200 - 600 * k, LY - 500), 80, t, seed=8)
        if t >= SNAP - 2.0 and not hit:
            pass
    if FIRE <= t < DONK:                           # the shovel's trip
        k = (t - FIRE) / (DONK - FIRE)
        p, ang = para((AX + 300, LY - SH), (BX - 60, RY + 6), 320, k)
        shovel(pen, p, ang + 30 * math.sin(k * 9))


def scene_guy2(img, pen, t):
    """The bow is taped. Someone else has a go, and goes."""
    world(pen, t)
    ledge_bite(pen, 1)
    chunk(pen, BX - 110, RY + 470, t)
    hud(img, pen, t, 0.97, 'STILL YOUR TURN', 0, 0)
    landed = t >= LAND
    opponent(pen, t, gy=RY + 470, face=dict(mouth='o' if not landed else 'smile', drool=landed, eyes='wide' if not landed else 'derp', seed=3, look=(0.8, 0.0)),
             head_tilt=(-15 if landed else 0))
    # Steve stands by, bow taped, offering it
    St = stickman(pen, AX - 230, LY, S, t, arms=((100, 100), (-30, 20)), mouth='smile', drool=True, eyes='derp', look=(0.9, 0.3), **STEVE)
    if t < LAUNCH:
        d = span(t, GUY2 + 0.4, LAUNCH - 0.1)
        bend = d
        A = stickman(pen, AX + 40 - 50 * bend, LY, S, t, kind='bean', torso_lean=6 - 60 * bend, hop=70 * bend, legs=((-14 - 40 * bend, 6 + 50 * bend), (16 - 30 * bend, -4 + 40 * bend)),
                     arms=((88, 88), (lerp(40, -70, d) + 60 * bend, lerp(120, 96, d) + 60 * bend)), mouth='o' if d > 0.3 else 'smile', drool=d < 0.3, eyes='wide' if d > 0.5 else 'derp', seed=9, look=(0.9, -0.2))
        g = A['hands'][0]
        giant_bow(pen, g, 0, pull=d * 1.3, tape=True)
        shovel(pen, (g[0] + 330 - 230 * d, g[1]), 0)
        if d > 0.7 and int(t * 8) % 2 == 0:
            text(img, 'hnnng', (AX + 200, LY - 560), 70, t, seed=7)
    else:
        giant_bow(pen, (AX + 40, LY - SH), 10 * math.sin(t * 25) * math.exp(-(t - LAUNCH) * 3), tape=True)
        shovel(pen, (AX + 60, LY - 20), 80)     # the shovel stays. he does not.
        k = clamp((t - LAUNCH) / (LAND - LAUNCH))
        p, _ = para((AX + 40, LY - SH), (BX - 230, RY + 470), 520, k)
        if k < 1:
            stickman(pen, p[0], p[1] + 280, S, t, kind='bean', hop=0, arms=UP, legs=((-50, 50), (60, -60)), head_tilt=math.sin(t * 20) * 25, mouth='o', drool=False, eyes='wide', seed=9)
            if t < LAUNCH + 0.7:
                text(img, 'AAAA', (p[0] + 100, p[1] - 100), 90, t, seed=10)
        else:
            u = t - LAND
            stickman(pen, BX - 230, RY + 470, S, t, kind='bean', arms=IDLE, head_tilt=math.sin(u * 30) * 14 * math.exp(-u * 4) + (18 if u > 0.6 else 0),
                     mouth='smile' if u > 0.6 else 'o', drool=u > 0.6, eyes='derp' if u > 0.6 else 'wide', seed=9, look=(0.9, 0.1))
            stars(pen, (BX - 230, RY + 470 - 190), LAND, t, n=6, r=90)
            if u > 0.75:
                text(img, 'hi.', (BX - 230, RY + 90), 80, t, seed=11)
            if u > 1.05:
                text(img, 'hi.', (BX + 30, RY + 90), 80, t, seed=12)


def scene_snap(img, pen, t):
    pass


def scene_tug(img, pen, t):
    """Everyone wants a go. The string has other ideas."""
    X.ground(pen)
    grip = (W / 2, X.GY - 400)
    snapped = t >= STRING
    pull = span(t, TUG, STRING - 0.1) * 1.2 if not snapped else 0.0
    giant_bow(pen, grip, 0, pull=pull, tape=True)
    if snapped:
        pen.line([(grip[0] - BIG * 0.3, grip[1] - BIG), (grip[0] - 60, grip[1] - 200 + 120 * math.sin(t * 15))], 5, (230, 230, 220), amp=5)
        pen.line([(grip[0] - BIG * 0.3, grip[1] + BIG), (grip[0] - 80, grip[1] + 240 - 100 * math.sin(t * 13))], 5, (230, 230, 220), amp=5)
        if t < STRING + 0.5:
            text(img, 'TWANG', (W / 2, 160), 120, t, seed=13)
    sx = grip[0] - pull * BIG * 0.8 + BIG * 0.28          # where the string is
    cast = [(-1, 150, 'bean', 14), (-1, 360, 'slab', 15), (1, 150, 'pea', 16)]
    for i, (side, off, kind, sd) in enumerate(cast):
        x0 = sx + side * off
        if not snapped:
            lean = 42 * pull * side
            stickman(pen, x0, X.GY, 0.95, t, kind=kind, flip=-side, torso_lean=-lean, arms=((-100 + 30 * pull, -120), (-90, -110)), legs=((-30 * pull, 20), (40 * pull, -30)),
                     head_tilt=-15 * pull, mouth='o', drool=False, eyes='wide', seed=sd, look=(0.8, 0))
        else:
            u = t - STRING
            tl = 0.55 + i * 0.15
            k = clamp(u / tl)
            dst = (x0 + side * (420 + i * 200), X.GY)
            p, _ = para((x0, X.GY), dst, 380 + i * 60, k)
            if k < 1:
                stickman(pen, p[0], p[1], 0.95, t, kind=kind, flip=-side, arms=UP, legs=((-60, 60), (70, -70)), head_tilt=math.sin(t * 25) * 30, mouth='o', drool=False, eyes='wide', seed=sd)
            else:
                stickman(pen, dst[0], dst[1], 0.95, t, kind=kind, flip=-side, lying=1.0, mouth='smile', drool=True, eyes='shut', seed=sd)
                stars(pen, (dst[0], dst[1] - 120), STRING + tl, t)
                if t < STRING + tl + 0.5:
                    text(img, 'bonk', (dst[0] + side * 180, dst[1] - 420), 92, t, seed=20 + i)
    if TUG + 0.5 < t < STRING and int(t * 8) % 2 == 0:
        text(img, 'hnnng', (W / 2, 160), 80, t, seed=7)


def scene_proud(img, pen, t):
    X.ground(pen)
    u = t - PROUD
    A = stickman(pen, 600, X.GY, 0.95, t, torso_lean=-6, neck_len=1.05 + 0.6 * span(u, 0.2, 1.4), arms=((100, 100), (-30, 20)), head_tilt=-8 + math.sin(u * 2.5) * 6,
                 mouth='smile', drool=True, eyes='derp', seed=2, kind='pea', look=(0.3, -0.3))
    g = A['hands'][0]
    giant_bow(pen, (g[0] + 20, g[1] - 20), 0, tape=True)
    shovel(pen, (g[0] + 250, X.GY - 24), 72)
    text(img, 'SHOVEL BOW', (1280, 260), 140, t, seed=30, wob=6)
    if u > 0.6:
        text(img, 'coming to the game.', (1280, 480), 80, t, seed=31, wob=3)
    if u > 1.3:
        text(img, '(you asked.)', (1280, 600), 70, t, seed=32, wob=3)


# ---- sound ------------------------------------------------------------------------------------------------------
def audio(path):
    SR = X.SR; n = int(DUR * SR); out = np.zeros(n)

    def add(x, t, g=1.0):
        i = int(t * SR)
        if 0 <= i < n:
            x = x[:n - i]; out[i:i + len(x)] += x * g

    def scrape(d):
        t = X.tt(d); r = np.random.RandomState(3)
        return np.convolve(r.randn(len(t)), np.ones(12) / 12, 'same') * (0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)) * np.clip((d - t) / 0.2, 0, 1) * 0.9

    def crack():
        t = X.tt(0.4); r = np.random.RandomState(4)
        return (np.convolve(r.randn(len(t)), np.ones(3) / 3, 'same') * np.exp(-t * 18) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 20)) * 1.2

    def creak(d, f0=120, f1=260):
        t = X.tt(d); f = f0 + (f1 - f0) * (t / d) + 30 * np.sin(2 * np.pi * 11 * t)
        return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 * np.minimum(1, t / 0.05)
    rests = [(0, DRAG), (FIRE, FIRE + 0.4), (DONK, DONK + 0.9), (SNAP, SHRUG + 0.4), (LAUNCH, LAUNCH + 0.3), (LAND, LAND + 0.9), (STRING, STRING + 1.6), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = DRAG; beat = 0.24
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if ts >= GUY2 else 0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25); add(X.toot(67.3 + up), ts, 0.2)
            add(X.toot(tune[i % len(tune)] + up, 0.18), ts + 0.12 + (0.03 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    add(X.game('emote_pop'), 0.1, 0.8); add(X.game('emote_pop'), 0.7, 0.9)
    add(X.game('vs_slam'), DRAG, 0.8); add(scrape(LOAD - DRAG - 0.2), DRAG + 0.3, 0.8)
    for k in range(9):
        add(X.game('footstep'), DRAG + 0.3 + k * 0.33, 0.8)
    add(X.game('hit_wood'), LOAD + 0.5, 0.9); add(X.game('draw_tick'), LOAD + 0.75, 0.9)
    add(creak(FIRE - LOAD - 1.0, 100, 320), LOAD + 0.9, 0.9)
    for k in range(8):
        add(X.game('draw_tick'), LOAD + 1.0 + k * 0.3, 0.6 + k * 0.05)
    add(X.game('bow_release'), FIRE, 1.2); add(X.slide(200, 60, 0.3), FIRE, 0.6); add(X.game('whoosh_fast'), FIRE + 0.02, 1.0)
    add(X.slide(300, 1800, 1.4), FIRE, 0.6); add(X.slide(1300, 500, 0.45), FIRE + 0.05, 0.5)                   # the shovel up; Steve away
    add(X.bonk() * 0.8, DONK, 1.3); add(X.game('hit_ground'), DONK, 1.2); add(crack(), DONK + 0.02, 0.9)
    add(X.toot(84, 0.1), DONK + 0.6, 0.3)
    add(crack(), CRUMBLE, 1.0); add(X.slide(300, 90, 0.8), CRUMBLE + 0.1, 0.7); add(X.game('body_drop'), CRUMBLE + 0.75, 1.1)
    add(crack(), SNAP, 1.3); add(X.game('hit_wood'), SNAP + 0.02, 0.8)
    add(X.toot(60, 0.12), SHRUG, 0.3); add(X.toot(58.7, 0.25), SHRUG + 0.22, 0.3)
    add(X.game('emote_pop'), GUY2, 0.8); add(creak(LAUNCH - GUY2 - 0.5, 100, 340), GUY2 + 0.5, 0.9)
    add(X.game('bow_release'), LAUNCH, 1.2); add(X.slide(200, 2000, 0.9), LAUNCH, 0.8)
    add(X.bonk(), LAND, 1.3); add(X.game('body_drop'), LAND, 0.8)
    add(X.toot(76, 0.15), LAND + 0.8, 0.3); add(X.toot(76, 0.15), LAND + 1.1, 0.3)                            # hi. hi.
    add(creak(STRING - TUG - 0.2, 90, 360), TUG + 0.2, 1.0)
    for k in range(10):
        add(X.game('draw_tick'), TUG + 0.3 + k * 0.24, 0.7)
    add(X.game('bow_release'), STRING, 1.3); add(crack(), STRING, 0.8)
    for k in range(3):
        add(X.slide(900, 200, 0.5 + k * 0.15), STRING, 0.5); add(X.bonk(), STRING + 0.55 + k * 0.15, 1.2)
    add(X.game('vs_slam'), PROUD, 0.9); add(X.game('emote_pop'), PROUD + 0.6, 0.8); add(X.game('emote_pop'), PROUD + 1.3, 0.8)
    add(X.game('crowd_cheer'), PROUD + 0.2, 0.5)
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
        sh.save(os.path.join(BUILD, 'derpy30_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy30.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-shovel-30s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
