"""BONK BOW - "Two Days". The channel went quiet; some guy waited; Steve came back stronger. Allegedly.
    python3 tools/derpyF.py [--sheet]"""
import math
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy20 as D  # noqa: E402
import derpy_band as B  # noqa: E402
from derpy import BUILD, FPS, H, OUT, PAPER, W, Pen, arrow, bow, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, LY, RED, RY, S, SH, para, world  # noqa: E402
from derpy30 import STEVE  # noqa: E402
from derpy30c import say  # noqa: E402
from derpy36 import hud, opp  # noqa: E402

DUR = 26.0
INTRO, SCENE, DAY2, BACK, FLEX, TRAINED, WHERE, BENCH, DRAW, SHOT, LAND, STRONGER, CARD, TITLE = 0.0, 2.4, 5.4, 8.6, 10.6, 11.4, 12.6, 13.6, 15.0, 16.6, 18.0, 18.9, 21.0, 24.0
SHAKES = [LAND, TITLE + 1.05, TITLE + 1.85]


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < SCENE:
        text(img, 'we went quiet for two days.', (W / 2, 480), 96, t, seed=1, wob=3)
        if t > 1.2:
            text(img, 'this is why.', (W / 2, 620), 64, t, seed=2, wob=2)
    elif t < CARD:
        scene(img, pen, t)
    elif t < TITLE:
        u = t - CARD
        text(img, "we're back.", (W / 2, 330), 110, t, seed=3, wob=3)
        if u > 0.7:
            text(img, 'the game got better.', (W / 2, 520), 76, t, seed=4, wob=2)
        if u > 1.5:
            text(img, 'steve did not.', (W / 2, 620), 76, t, seed=5, wob=2)
        if u > 2.2:
            text(img, 'submitting october 12.', (W / 2, 800), 56, t, seed=6, wob=2)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def sky(pen, img, t):
    """The sun crosses twice while some guy waits, then parks in its usual spot."""
    if t >= BACK:
        world(pen, t); return
    world(pen, t, sun=False)
    k = (t - SCENE) / (BACK - SCENE) * 2            # 0..2 days
    day = int(k); u = k - day
    a = math.pi * (1 - u)                             # left to right
    cx, cy = 960 + math.cos(a) * 700, 560 - math.sin(a) * 320
    if u < 0.5:
        label = 'day %d' % (day + 1)
        text(img, label, (960, 620), 70, t, seed=30 + day, wob=2)
    pen.blob([(cx + math.cos(b) * 62, cy + math.sin(b) * 62) for b in [i * math.tau / 10 for i in range(10)]], w=8)
    for i in range(8):
        b = i * math.tau / 8 + t * 0.4
        pen.line([(cx + math.cos(b) * 80, cy + math.sin(b) * 80), (cx + math.cos(b) * 112, cy + math.sin(b) * 112)], 6)


def sign(pen, img, t, k=1.0):
    """'back in 2 days' on a post, on Steve's empty cliff. k 1..0 knocks it over as he walks in."""
    px, py = AX, LY
    ang = (1 - k) * 80
    def R(p):
        return (px + (p[0] - px) * math.cos(math.radians(ang)) - (p[1] - py) * math.sin(math.radians(ang)),
                py + (p[0] - px) * math.sin(math.radians(ang)) + (p[1] - py) * math.cos(math.radians(ang)))
    pen.line([R((px, py)), R((px, py - 230))], 9)
    pen.blob([R((px - 190, py - 380)), R((px + 190, py - 384)), R((px + 194, py - 226)), R((px - 194, py - 230))], w=8)
    if k > 0.6:
        text(img, 'back in', (px, py - 335), 44, t, seed=40, wob=1)
        text(img, '2 days', (px, py - 275), 50, t, seed=41, wob=1)


def scene(img, pen, t):
    sky(pen, img, t)
    away = t < BACK + 0.6
    hud(img, pen, t, 1.0, 1.0, '' if t < BACK else ('STEVE. STRONGER.' if t < DRAW else 'YOUR TURN'))
    if t < BACK:
        text(img, '(away)', (160, 175), 40, t, seed=42, wob=1)
    # ---- the sign
    if t < BACK + 0.8:
        sign(pen, img, t, 1.0 - span(t, BACK + 0.35, BACK + 0.8))
    # ---- some guy, waiting
    if t < BACK:
        u = t - SCENE
        yawn = 4.6 < u < 5.6
        G = opp(pen, t, face=dict(mouth='o' if yawn else 'chew', drool=True, eyes='derp', seed=3, look=(0.9, 0.0) if u < 3 else (0.9, -0.4)),
                arms=((60, 20), (-60, -20)) if u < 2 else ((60, 20), (-110, -160)), tilt=(math.sin(t * 3) * 4))
        if 1.0 < u < 2.2:
            say(img, (BX - 40, RY - 440), '...', t, 10, 60)
        if 3.2 < u < 4.6:
            say(img, (BX - 40, RY - 440), 'he said two days.', t, 11, 52)
        if 5.6 < u:
            say(img, (BX - 40, RY - 440), 'that was two days.', t, 12, 52)
    else:
        hit = t >= LAND
        face = dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.0))
        if hit:
            face = dict(mouth='flat', drool=True, eyes='derp', seed=3, look=(0.9, 0.0))
        opp(pen, t, face=face, arms=((60, 20), (-60, -20)), tilt=0)
        if WHERE <= t < BENCH + 0.8:
            say(img, (BX - 40, RY - 440), 'where?', t, 13, 60)
        if STRONGER <= t:
            say(img, (BX - 40, RY - 440), 'stronger.', t, 14, 60)
    # ---- steve walks in, flexes, shoots himself
    if t >= BACK:
        w = span(t, BACK, BACK + 1.6)
        x = -140 + (AX + 140) * w
        step = math.sin(t * 14) * 28 * (1 - w) * (w < 1)
        legs = ((-14 + step, 6), (16 - step, -4))
        arms = ((100, 100), (-30, 20))
        flexing = FLEX <= t < DRAW
        if flexing:
            arms = ((110, 178), (-110, -178))                  # both fists up by the head
        d = span(t, DRAW, DRAW + 1.2) * (t < SHOT)
        aiming = DRAW <= t < SHOT
        if aiming:
            arms = ((180, 180), (165, 178 - 150 * d))          # bow arm straight up, string hand pulls down
        if t >= SHOT:
            arms = ((180, 180), (140, 60))
        mouth = 'smile' if t < LAND else 'o'
        if t >= STRONGER + 0.6:
            mouth = 'flat'
        A = stickman(pen, x, LY, S, t, legs=legs, arms=arms, torso_lean=(8 if flexing else 4), head_tilt=(math.sin(t * 2) * 5 if t < LAND else -10),
                     mouth=mouth, drool=(t < LAND), eyes='wide' if LAND <= t < STRONGER + 0.6 else 'derp', look=(0.9, 0.1) if not aiming else (0.1, -0.9), **STEVE)
        # headband: he is stronger now
        top = A['top']; n = A['neck']
        hy = top[1] + (n[1] - top[1]) * 0.32
        pen.line([(top[0] - 56, hy + 4), (top[0] + 56, hy - 4)], 10, RED)
        pen.line([(top[0] + 50, hy), (top[0] + 96, hy + 50), (top[0] + 70, hy + 30), (top[0] + 100, hy + 70)], 6, RED, amp=2)
        g = A['hands'][0]
        if aiming:
            bow(pen, g, -90, 150, pull=d * 0.9)
            arrow(pen, (g[0], g[1] - 150), -90, L=150 + 110 * d)
        elif t >= SHOT:
            bow(pen, g, -90, 150)
        else:
            bow(pen, (g[0] + 4, g[1] - 8), 80, 150)         # the bigger bow, just held
        if BACK + 0.3 <= t < FLEX:
            text(img, "he's back.", (W / 2, 215), 80, t, seed=50, wob=2)
        if TRAINED <= t < BENCH:
            say(img, (300, 330), 'i trained.', t, 51, 56)
        if BENCH <= t < DRAW + 0.4:
            say(img, (300, 330), 'on a bench.', t, 52, 56)
        if SHOT <= t < LAND:
            k = (t - SHOT) / (LAND - SHOT)
            x0, y0 = g[0], g[1] - 150; x1, y1 = A['top'][0] + 6, A['top'][1] + 12
            y = y0 * (1 - k) + y1 * k - 900 * 4 * k * (1 - k)
            arrow(pen, (x0 * (1 - k) + x1 * k, y), 90 if k > 0.5 else -90, L=150)
        if t >= LAND:
            arrow(pen, (A['top'][0] + 6, A['top'][1] + 12), 92, L=150)
            stars(pen, (A['top'][0], A['top'][1] - 20), LAND, t)
            if t < LAND + 0.7:
                text(img, 'bonk', (AX + 250, LY - 560), 92, t, seed=53)
        if BACK + 0.35 <= t < BACK + 1.2:
            text(img, 'clonk', (AX + 160, LY - 420), 48, t, seed=54)


CUES = [(INTRO, 'slam', 0.7), (INTRO + 1.2, 'pop', 0.7), (SCENE, 'wind', 0.9), (SCENE + 1.0, 'toot_lo', 0.3), (SCENE + 3.2, 'toot_lo', 0.35), (SCENE + 4.6, 'sigh', 0.8),
        (SCENE + 5.6, 'toot_lo', 0.35), (DAY2, 'tick', 0.6), (BACK, 'step', 0.8), (BACK + 0.3, 'step', 0.8), (BACK + 0.6, 'step', 0.8), (BACK + 0.9, 'step', 0.8), (BACK + 1.2, 'step', 0.8),
        (BACK + 0.4, 'thud', 0.8), (BACK + 0.3, 'up', 0.6), (FLEX, 'win', 0.5), (TRAINED, 'toot_hi', 0.35), (WHERE, 'toot_lo', 0.35), (BENCH, 'toot_hi', 0.35), (BENCH + 0.3, 'wrong', 0.4),
        (DRAW, 'creak_long'), (SHOT, 'twang'), (SHOT + 0.05, 'whoosh', 0.7), (LAND - 0.1, 'down', 0.6), (LAND, 'bonk', 1.3), (STRONGER, 'toot_lo', 0.4), (STRONGER + 0.3, 'laugh', 0.4),
        (CARD, 'slam', 0.7), (CARD + 0.7, 'pop', 0.6), (CARD + 1.5, 'pop', 0.6), (CARD + 2.2, 'ding', 0.6)]
RESTS = [(0, BACK), (DRAW - 0.2, STRONGER + 1.2), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyF_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyF.wav'); B.render(wav, DUR, CUES, RESTS, band_from=BACK, title=TITLE)
    out = os.path.join(OUT, 'bonkbow-back-26s.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
