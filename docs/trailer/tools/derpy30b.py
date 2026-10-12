"""BONK BOW, the shovel bow, take two: an arms race. Steve brings the shovel bow; the other guy
answers with a ladder; it goes exactly as well as that sounds. Thirty seconds, a cut every two.

    python3 tools/derpy30b.py            # out/bonkbow-shovel-30s-v2.mp4
    python3 tools/derpy30b.py --sheet
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
import derpy30 as V  # noqa: E402
import derpy60 as X  # noqa: E402
from derpy import BUILD, FPS, H, OUT, PAPER, W, Pen, arrow, bow, clamp, lerp, lp, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, hud, para, world  # noqa: E402
from derpy30 import BIG, STEVE, giant_bow, opponent, shovel  # noqa: E402

DUR = 30.0
CARD, FIRE1, DIG, LOOK, LADDER, LFIRE, BRIDGE, WALK, FACE, FIRE2, UP_, DOWN, SNAP, SLIDE, HI, MONT, PROUD, TITLE = \
    0.0, 2.6, 3.3, 4.5, 7.0, 9.0, 9.4, 10.0, 12.3, 13.3, 13.5, 15.0, 15.2, 16.4, 18.0, 19.0, 23.0, 26.0
SHAKES = [FIRE1, DIG, LFIRE, BRIDGE, FIRE2, SNAP, SLIDE + 0.6, MONT + 0.9, MONT + 2.2, MONT + 3.5, TITLE + 1.05, TITLE + 1.85]
GAP_Y = RY + 520               # the bottom of the gap


def ladder(pen, a, b, rungs=9):
    """A ladder from a to b (its two rails 44 px apart)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * 22, dx / L * 22
    for s in (1, -1):
        pen.line([(a[0] + nx * s, a[1] + ny * s), (b[0] + nx * s, b[1] + ny * s)], 9, (150, 110, 60))
    for i in range(1, rungs):
        k = i / rungs
        p = (a[0] + dx * k, a[1] + dy * k)
        pen.line([(p[0] + nx, p[1] + ny), (p[0] - nx, p[1] - ny)], 7, (150, 110, 60))


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < 1.5:
        text(img, 'the shovel bow.', (W / 2, 380), 150, t, seed=1, wob=4)
        if t > 0.7:
            text(img, '(a comment made us do this.)', (W / 2, 580), 70, t, seed=2, wob=2)
    elif t < MONT:
        duel(img, pen, t)
    elif t < PROUD:
        montage(img, pen, t)
    elif t < TITLE:
        proud(img, pen, t)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-18, 18) * (1 - k)), int(r.uniform(-18, 18) * (1 - k)))); img = out
    return img


def duel(img, pen, t):
    world(pen, t)
    hp_b = 1.0 - (0.03 if t >= SNAP else 0)
    label = 'YOUR TURN' if t < LOOK else ('HIS TURN' if t < FACE else ('YOUR TURN' if t < SLIDE else '...'))
    hud(img, pen, t, hp_b, label, 0, 0)
    if t >= SLIDE and t < SLIDE + 1.2:
        text(img, '-1', (1795, 150 - 60 * (t - SLIDE) / 1.2), 64, t, col=RED, seed=4)
        text(img, '-1', (520, 150 - 60 * (t - SLIDE) / 1.2), 64, t, col=RED, seed=5)
    if SNAP <= t < SNAP + 1.2:
        text(img, '-1', (1795, 150 - 60 * (t - SNAP) / 1.2), 64, t, col=RED, seed=4)
    # ---- the shovel, dug into the far cliff face from 3.3 on, until it comes back down at 15
    if FIRE1 <= t < DIG:
        k = (t - FIRE1) / (DIG - FIRE1)
        p, ang = para((AX + 300, LY - SH), (1290, RY + 120), 260, k)
        shovel(pen, p, ang)
    elif t < FIRE2:
        w = math.sin((t - DIG) * 30) * 8 * math.exp(-(t - DIG) * 4)
        shovel(pen, (1300, RY + 128), 25 + w)
        if t < DIG + 0.6:
            stars(pen, (1290, RY + 120), DIG, t, n=7, r=100)
            text(img, 'DONK', (1150, RY - 180), 100, t, seed=6)
    # ---- the ladder bridge
    if LFIRE <= t < BRIDGE:
        k = (t - LFIRE) / (BRIDGE - LFIRE)
        a = (lerp(BX - 160, 1330, k), lerp(RY - SH, RY - 30, k))
        ang = lerp(-20, 8, k)
        b = (a[0] - math.cos(math.radians(ang)) * 760, a[1] - math.sin(math.radians(ang)) * 760)
        ladder(pen, b, a)
    elif BRIDGE <= t < SNAP:
        ladder(pen, (600, LY + 10), (1330, RY - 30))
    elif t >= SNAP:
        k = span(t, SNAP, SNAP + 0.8)
        ladder(pen, (600, LY + 10), (980 - 100 * k, lerp(LY - 10, GAP_Y - 60, k * k)), rungs=5)
        ladder(pen, (1330, RY - 30), (990 + 60 * k, lerp(RY - 20, GAP_Y - 40, k * k)), rungs=5)
    # ---- Steve (left)
    sx = AX
    sy = LY
    if t >= SLIDE:                                   # his ledge gives up
        k = span(t, SLIDE, SLIDE + 0.9)
        pen.d.polygon([(-30, LY - 20), (660, LY - 20), (660, LY + 420), (-30, LY + 420)], fill=PAPER)
        pen.line([(-30, LY + 10), (260, LY + 30), (330, LY + 160), (290, LY + 420)], 10)
        cy = LY + (GAP_Y - LY) * k * k
        V.chunk(pen, 440, cy, t)
        sx, sy = 440, cy
    if t < FIRE1:
        d = span(t, 1.6, FIRE1 - 0.1)
        A = stickman(pen, sx - 50 * d, sy, S, t, torso_lean=6 - 60 * d, hop=70 * d, legs=((-14 - 40 * d, 6 + 50 * d), (16 - 30 * d, -4 + 40 * d)),
                     arms=((88, 88), (lerp(40, -70, d) + 60 * d, lerp(120, 96, d) + 60 * d)), mouth='o', drool=False, eyes='wide', look=(0.9, -0.2), **STEVE)
        g = A['hands'][0]; giant_bow(pen, g, 0, pull=d * 1.3); shovel(pen, (g[0] + 330 - 230 * d, g[1]), 0)
    elif t < FACE - 1.0 or (t >= SLIDE and t < HI):
        happy = t < LOOK or t >= WALK
        A = stickman(pen, sx, sy, S, t, arms=((100, 100), (-30, 20)), torso_lean=4, head_tilt=math.sin(t * 2) * 5 + (10 * span(t, WALK, WALK + 0.3) if t < SLIDE else 0),
                     mouth='smile' if happy else 'o', drool=happy, eyes='derp' if happy else 'wide', look=(0.9, 0.2) if t < SLIDE else (0.0, 0.0), **STEVE)
        g = A['hands'][0]; giant_bow(pen, (g[0] + 20, g[1]), 0)
    elif t < HI:                                     # reload, point blank, fire straight up
        d = span(t, FACE - 1.0, FIRE2 - 0.1) if t < FIRE2 else 0.0
        up = t >= FIRE2
        A = stickman(pen, sx - 30 * d, sy, S, t, torso_lean=6 - 40 * d, hop=40 * d, legs=((-14 - 30 * d, 6 + 40 * d), (16 - 20 * d, -4 + 30 * d)),
                     arms=((88, 88), (lerp(40, -70, d) + 50 * d, lerp(120, 96, d) + 50 * d)), head_tilt=(-30 if up else 0), mouth='o', drool=False, eyes='wide', look=(0.9, -1.0 if up else -0.2), **STEVE)
        g = A['hands'][0]; giant_bow(pen, g, 0 if not up else -80, pull=d * 1.3)
        if not up:
            shovel(pen, (g[0] + 330 - 230 * d, g[1]), 0)
    else:
        A = stickman(pen, sx, sy, S, t, arms=IDLE, head_tilt=12, mouth='smile', drool=True, eyes='derp', look=(0.9, 0.1), **STEVE)
        g = A['hands'][0]; giant_bow(pen, (g[0] + 20, g[1]), 0)
    # ---- the other guy (right)
    ox, oy, flip = BX, RY, -1
    if WALK <= t < SNAP:                             # across the bridge, and up to Steve's face
        k = span(t, WALK, FACE - 0.3)
        ox = lerp(1330, 640, k); oy = lerp(RY - 20, LY + 10, k) - 40
        if k >= 1:
            ox = 560; oy = LY
        ph = t * 10
        opp = stickman(pen, ox, oy, S, t, kind='slab', flip=-1, legs=((math.sin(ph) * 30 * (k < 1), 6), (-math.sin(ph) * 30 * (k < 1), -4)), torso_lean=8,
                       arms=((60, 150), (-60, -150)), head_tilt=(-28 if t >= UP_ else 0), mouth='chew' if t < UP_ else 'o', drool=t < UP_, eyes='derp' if t < UP_ else 'wide', seed=3,
                       look=(0.8, -1.0 if t >= UP_ else 0.0))
        m = (opp['neck'][0] - 16, opp['neck'][1] - 30); arrow(pen, (m[0] - 90, m[1]), 178, L=170)
    elif t >= SNAP:                                  # down with the ladder
        k = span(t, SNAP, SNAP + 0.7)
        oy = lerp(LY, GAP_Y, k * k); ox = 760 - 80 * k
        if k < 1:
            stickman(pen, ox, oy, S, t, kind='slab', flip=-1, arms=UP, legs=((-50, 50), (60, -60)), head_tilt=math.sin(t * 25) * 20, mouth='o', drool=False, eyes='wide', seed=3)
            if t < SNAP + 0.6:
                text(img, 'aaa', (ox + 200, oy - 400), 80, t, seed=7)
        else:
            hi = t >= HI
            stickman(pen, 680, GAP_Y, S, t, kind='slab', flip=-1, arms=IDLE, head_tilt=math.sin((t - SNAP) * 30) * 12 * math.exp(-(t - SNAP) * 3) + (12 if hi else 0),
                     mouth='smile' if hi else 'o', drool=hi, eyes='derp' if hi else 'wide', seed=3, look=(0.9, 0.0))
            stars(pen, (680, GAP_Y - 190), SNAP + 0.7, t)
    elif t < LADDER:                                 # thinks about it
        lk = t >= LOOK
        looks = [(0.8, 0.5), (0.0, 0.0), (-0.9, 0.5), (0.0, 0.0)]
        li = min(3, int((t - LOOK) / 0.55)) if lk else 0
        opponent(pen, t, face=dict(mouth='flat' if lk else 'chew', drool=not lk, eyes='derp' if not lk else 'wide', seed=3, look=looks[li]) if lk else None,
                 head_tilt=(16 if lk and li in (0, 2) else 0))
        if t >= LOOK + 1.9:
            text(img, 'hm.', (BX + 60, RY - 480), 80, t, seed=8)
    elif t < LFIRE:                                  # loads a ladder
        d = span(t, LADDER + 0.6, LFIRE - 0.1)
        A = stickman(pen, BX, RY, S, t, kind='slab', flip=-1, arms=aim_arms(d), torso_lean=6, mouth='o', drool=False, eyes='wide', seed=3, look=(0.6, 0))
        g = A['hands'][0]; bow(pen, g, 180, 100, pull=d * 0.9)
        la = (g[0] - 46 + 40 * d, g[1])
        ladder(pen, (la[0] + 700, la[1] + 12), la)
        if t > LADDER + 1.5 and int(t * 8) % 2 == 0:
            text(img, 'hnng', (BX - 100, RY - 560), 70, t, seed=9)
    else:
        opponent(pen, t, face=dict(mouth='smile', drool=True, eyes='derp', seed=3, look=(0.8, 0.3)))
    if UP_ <= t < DOWN:                              # the point-blank shovel, up and out of sight, and back
        k = (t - UP_) / (DOWN - UP_)
        y = (LY - SH - 200) - 1500 * math.sin(k * math.pi)
        shovel(pen, (AX + 150, y), -90 if k < 0.5 else 90)
        if t < UP_ + 0.4:
            text(img, 'twang', (AX + 420, LY - 600), 80, t, seed=10)
    if HI <= t < MONT:
        text(img, 'hi.', (680, GAP_Y - 420), 80, t, seed=11)
        if t > HI + 0.35:
            text(img, 'hi.', (440, GAP_Y - 480), 80, t, seed=12)


MONTS = [('chair', 1.1), ('fish', 1.1), ('smaller bow', 1.1), ('the opponent', 0.7)]


def montage(img, pen, t):
    u = t - MONT
    i = 0; acc = 0.0
    for j, (_, d) in enumerate(MONTS):
        if u < acc + d:
            i = j; break
        acc += d
    else:
        i = 3; acc = sum(d for _, d in MONTS[:3])
    v = u - acc
    name = MONTS[i][0]
    world(pen, t, sun=False)
    d = span(v, 0.0, 0.4)
    rel = v >= 0.45
    A = stickman(pen, AX, LY, S, t, torso_lean=6 - 50 * d, hop=50 * d, legs=((-14 - 30 * d, 6 + 40 * d), (16 - 20 * d, -4 + 30 * d)),
                 arms=((88, 88), (lerp(40, -70, 0 if rel else d) + 50 * d, lerp(120, 96, 0 if rel else d) + 50 * d)), mouth='o', drool=False, eyes='wide', look=(0.9, -0.2), **STEVE)
    g = A['hands'][0]; giant_bow(pen, g, 0, pull=(0 if rel else d) * 1.3, tape=True)
    if rel:
        k = clamp((v - 0.45) / 0.5)
        p, ang = para((g[0] + 100, g[1]), (BX - 60, RY - 240), 300, k)
    else:
        k = 0.0
        p, ang = (g[0] + 330 - 230 * d, g[1]), 0
    pen.n += i * 50
    if name == 'chair':
        c = [(-70, -140), (-70, 40), (70, 40), (70, -10), (-70, -10), (-70, 40), (0, 40), (0, 120), (70, 120)]
        pts = [rot((p[0] + x, p[1] + y), ang + 360 * k * (1 if rel else 0), p) for x, y in c]
        pen.line(pts, 9, (140, 90, 40))
    elif name == 'fish':
        pts = [(-110, 0), (-40, -40), (60, -34), (110, 0), (60, 34), (-40, 40), (-110, 0), (-150, -40), (-150, 40), (-110, 0)]
        pen.blob([rot((p[0] + x, p[1] + y), ang + 20 * math.sin(t * 30), p) for x, y in pts[:7]], w=7, fill=(170, 200, 220))
        pen.line([rot((p[0] + x, p[1] + y), ang, p) for x, y in pts[6:]], 7)
        pen.dot(rot((p[0] + 60, p[1] - 10), ang, p), 7)
    elif name == 'smaller bow':
        bow(pen, p, ang + 90 * (0 if rel else 1), 120)
    else:
        stickman(pen, p[0], p[1] + 120 * (0 if rel else 1), S * 0.9, t, kind='slab', flip=-1, lying=(0.9 if not rel else 0), arms=UP if rel else ((60, 150), (-60, -150)),
                 head_tilt=math.sin(t * 20) * 20, mouth='o', drool=False, eyes='wide', seed=3)
    if rel and k >= 1:
        stars(pen, (BX - 60, RY - 240), MONT + acc + 0.95, t)
        text(img, 'bonk', (BX - 300, RY - 520), 92, t, seed=13 + i)
    if not rel or k < 1:
        opponent(pen, t, face=dict(mouth='o' if rel else 'chew', drool=not rel, eyes='wide' if rel else 'derp', seed=3, look=(0.8, -0.3)))
    else:
        stickman(pen, BX, RY, S, t, kind='slab', flip=-1, lying=1.0, mouth='smile', drool=True, eyes='shut', seed=3)
    text(img, name, (W / 2, 120), 90, t, seed=30 + i, wob=3)


def proud(img, pen, t):
    X.ground(pen)
    u = t - PROUD
    A = stickman(pen, 600, X.GY, 0.95, t, torso_lean=-6, neck_len=1.05 + 0.6 * span(u, 0.2, 1.4), arms=((100, 100), (-30, 20)), head_tilt=-8 + math.sin(u * 2.5) * 6,
                 mouth='smile', drool=True, eyes='derp', seed=2, kind='pea', look=(0.3, -0.3))
    g = A['hands'][0]
    giant_bow(pen, (g[0] + 20, g[1] - 20), 0, tape=True)
    shovel(pen, (g[0] + 250, X.GY - 24), 72)
    text(img, 'SHOVEL BOW', (1280, 230), 140, t, seed=30, wob=6)
    if u > 0.6:
        text(img, 'also: ladder bow.', (1280, 440), 76, t, seed=31, wob=3)
    if u > 1.3:
        text(img, "(please don't.)", (1280, 560), 70, t, seed=32, wob=3)


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
    rests = [(0, 1.5), (DIG, DIG + 0.6), (LOOK + 0.3, LADDER), (BRIDGE, BRIDGE + 0.4), (FIRE2, DOWN), (SNAP, HI + 0.9), (TITLE - 0.3, DUR)]
    tune = (72, 74, 71.6, 76, 72.4, 79, 77, 74.5, 76, 72, 74.3, 71, 72, 76.4, 79, 84)
    i = 0; ts = 1.5; beat = 0.24
    while ts < TITLE:
        if not any(a <= ts < b for a, b in rests):
            up = 5 if ts >= MONT else 0
            add(X.tuba((36 if i % 2 == 0 else 43) + up), ts, 0.5)
            if i % 2 == 1:
                add(X.toot(64 + (i % 3) + up), ts, 0.25); add(X.toot(67.3 + up), ts, 0.2)
            add(X.toot(tune[i % len(tune)] + up, 0.18), ts + 0.12 + (0.03 if i % 3 == 0 else 0), 0.33)
        ts += beat; i += 1
    add(X.game('emote_pop'), 0.1, 0.8); add(X.game('emote_pop'), 0.7, 0.9); add(X.game('vs_slam'), 1.5, 0.8)
    add(creak(0.9, 100, 320), 1.6, 0.9); add(X.game('bow_release'), FIRE1, 1.2); add(X.game('whoosh_fast'), FIRE1, 1.0)
    add(X.bonk() * 0.8, DIG, 1.3); add(X.game('hit_ground'), DIG, 1.2); add(crack(), DIG + 0.02, 0.8)
    for k in range(4):
        add(X.game('draw_tick'), LOOK + k * 0.55, 0.6)
    add(X.toot(60, 0.12), LOOK + 1.9, 0.3); add(X.toot(58.7, 0.25), LOOK + 2.1, 0.3)
    add(X.game('emote_pop'), LADDER, 0.9); add(X.game('hit_wood'), LADDER + 0.3, 0.8); add(creak(LFIRE - LADDER - 0.7, 100, 340), LADDER + 0.6, 0.9)
    add(X.game('bow_release'), LFIRE, 1.2); add(X.slide(400, 1400, 0.4), LFIRE, 0.5)
    add(X.game('hit_wood'), BRIDGE, 1.2); add(crack(), BRIDGE + 0.05, 0.6); add(X.game('body_drop'), BRIDGE + 0.1, 0.6)
    for k in range(7):
        add(X.game('footstep'), WALK + k * 0.3, 0.8); add(X.game('hit_wood'), WALK + k * 0.3 + 0.05, 0.25)
    add(creak(FIRE2 - FACE + 1.0 - 0.1, 100, 320), FACE - 1.0, 0.9)
    add(X.game('bow_release'), FIRE2, 1.2); add(X.slide(300, 2400, 0.7), FIRE2, 0.8)
    add(X.slide(2400, 260, 0.6), DOWN - 0.6, 0.8)
    add(crack(), SNAP, 1.3); add(X.game('hit_wood'), SNAP, 1.0); add(X.slide(900, 180, 0.6), SNAP + 0.1, 0.7); add(X.bonk(), SNAP + 0.7, 1.2)
    add(crack(), SLIDE, 1.2); add(X.slide(300, 80, 0.9), SLIDE + 0.1, 0.8); add(X.game('body_drop'), SLIDE + 0.9, 1.1)
    add(X.toot(76, 0.15), HI, 0.3); add(X.toot(76, 0.15), HI + 0.35, 0.3)
    acc = 0.0
    for name, d in MONTS:
        add(X.game('vs_slam'), MONT + acc, 0.6); add(creak(0.4, 120, 330), MONT + acc, 0.7)
        add(X.game('bow_release'), MONT + acc + 0.45, 1.0); add(X.game('whoosh_fast'), MONT + acc + 0.47, 0.8); add(X.bonk(), MONT + acc + 0.95, 1.2)
        acc += d
    add(X.game('vs_slam'), PROUD, 0.9); add(X.game('emote_pop'), PROUD + 0.6, 0.8); add(X.game('emote_pop'), PROUD + 1.3, 0.8); add(X.game('crowd_cheer'), PROUD + 0.2, 0.5)
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
        sh.save(os.path.join(BUILD, 'derpy30b_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy30b.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-shovel-30s-v2.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(DUR * FPS)):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
