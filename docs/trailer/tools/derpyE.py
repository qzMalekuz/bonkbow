"""BONK BOW - "The Extension". Steve is mid-draw when the deadline moves. Twenty-five seconds.
    python3 tools/derpyE.py [--sheet]"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy20 as D  # noqa: E402
import derpy_band as B  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, W, Pen, arrow, bow, clamp, lerp, lp, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, IDLE, LY, RED, RY, S, SH, UP, aim_arms, para, world  # noqa: E402
from derpy30 import STEVE  # noqa: E402
from derpy30c import say  # noqa: E402
from derpy36 import hud, opp, phone  # noqa: E402

DUR = 25.0
DRAW, BUZZ, CHECK, LINE1, SHRUG, LINE2, SLIP, HIT, BOARD, STARE, LINE3, CARD, TITLE = 0.0, 2.2, 2.9, 4.6, 6.6, 7.2, 9.4, 9.85, 11.2, 12.2, 14.0, 16.6, 20.6
SHAKES = [HIT, TITLE + 1.05, TITLE + 1.85]


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if CARD <= t < TITLE:
        u = t - CARD
        text(img, 'submitting october 12.', (W / 2, 360), 110, t, seed=1, wob=3)
        if u > 0.9:
            text(img, 'steve is not ready.', (W / 2, 560), 80, t, seed=2, wob=2)
        if u > 2.0:
            text(img, 'he never will be.', (W / 2, 690), 80, t, seed=3, wob=2)
    elif t >= TITLE:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    else:
        scene(img, pen, t)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def scene(img, pen, t):
    world(pen, t)
    hit = t >= HIT
    hud(img, pen, t, 1.0, 1.0 if not hit else 0.7, 'YOUR TURN' if t < BOARD else 'a hit. somehow.')
    if BOARD <= t:
        k = span(t, BOARD, BOARD + 0.3)
        y = 620 + 40 * (1 - k)
        pen.blob([(700, y - 60), (1220, y - 64), (1224, y + 60), (696, y + 64)], w=8)
        text(img, '1 - 847', (960, y - 30), 76, t, seed=4, wob=2)
        text(img, 'games', (960, y + 105), 36, t, seed=14, wob=1)
    if HIT <= t < HIT + 1.4:
        text(img, '-1', (1280, 60 - 50 * (t - HIT) / 1.4), 64, t, col=RED, seed=5)
    # ---- Steve: at full draw the whole time, until the buzz makes him let go
    d = span(t, DRAW, DRAW + 1.4) if t < SLIP else 0
    buzz = BUZZ <= t < CHECK
    checking = CHECK <= t < SLIP
    arms = aim_arms(d)
    if checking:
        arms = (arms[0], (-60, 10))                          # string hand drops to the pocket; the bow arm stays up
    if t >= SLIP:
        arms = ((90, 88), (-60, 10))
    look = (0.9, -0.1)
    if checking:
        look = (0.3, 0.9) if t < LINE1 else (0.0, 0.0)
    if t >= STARE:
        look = (0.2, -0.9) if t < LINE3 + 0.6 else (0.0, 0.0)
    mouth = 'flat' if t < BUZZ else ('o' if t < LINE1 or (HIT <= t < STARE) else ('smile' if t < SLIP else 'flat'))
    A = stickman(pen, AX, LY, S, t, arms=arms, torso_lean=6, head_tilt=(math.sin(t * 40) * 3 if buzz else (0 if t < STARE else -8)),
                 mouth=mouth, drool=(LINE1 <= t < SLIP), eyes='wide' if (buzz or HIT <= t < STARE) else 'derp', look=look, **STEVE)
    g = A['hands'][0]
    bow(pen, g, 0, 100, pull=d * 0.9)
    if t < SLIP:
        arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
    if buzz:
        text(img, 'bzz', (AX + 120, LY - 500), 56, t, seed=6)
    if CHECK <= t < HIT + 0.3:                                 # the notification pops up beside him
        k = span(t, CHECK, CHECK + 0.25)
        phone(pen, img, (700, 560 + 40 * (1 - k)), t, [(30, 'CLOCK IN'), (36, 'deadline'), (36, 'extended to'), (50, 'OCT 12')])
    if LINE1 <= t < SLIP:
        say(img, (300, 330), 'four more days', t, 7, 50)
        if t >= LINE1 + 0.8:
            say(img, (300, 385), 'to practice.', t, 8, 50)
    if SLIP <= t < HIT:                                        # the arrow was still aimed at him
        k = (t - SLIP) / (HIT - SLIP)
        p, ang = para((AX + 110, LY - SH), (BX - 60, RY - SH + 10), 60, k)
        arrow(pen, p, ang, L=140)
    if t >= LINE3:
        say(img, (330, 360), 'the extension did that.', t, 9, 46)
    # ---- some guy
    if t < SHRUG:
        opp(pen, t, face=dict(mouth='chew' if t < CHECK else 'flat', drool=t < CHECK, eyes='derp', seed=3, look=(0.9, 0.0)))
    elif not hit:
        opp(pen, t, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.0)), arms=((60, 20), (-60, -20)), tilt=8)
        if t >= LINE2:
            say(img, (BX - 40, RY - 440), 'four more days', t, 10, 52)
            if t >= LINE2 + 0.8:
                say(img, (BX - 40, RY - 385), 'to not.', t, 11, 52)
    else:
        G = opp(pen, t, face=dict(mouth='o', drool=False, eyes='wide' if t < STARE + 1.0 else 'derp', seed=3, look=(0.0, 0.0) if t < STARE else (0.9, 0.0)),
                arms=((60, 20), (-60, -20)), tilt=(-12 * span(t, HIT, HIT + 0.1) * (1 - span(t, HIT + 0.4, HIT + 0.8))))
        arrow(pen, (BX - 60, RY - SH + 10), 4, L=140)
        stars(pen, (BX - 60, RY - SH), HIT, t)
        if t < HIT + 0.6:
            text(img, 'bonk', (BX - 320, RY - 540), 92, t, seed=12)
        if HIT + 0.6 <= t < BOARD + 0.8:
            say(img, (BX - 40, RY - 400), 'ow.', t, 13, 60)


CUES = [(DRAW, 'creak'), (BUZZ, 'tick', 0.6), (BUZZ + 0.15, 'tick', 0.6), (BUZZ + 0.3, 'tick', 0.6), (CHECK, 'pop', 0.8), (LINE1, 'toot_hi', 0.35), (LINE1 + 0.8, 'toot_lo', 0.35),
        (SHRUG, 'wrong', 0.5), (LINE2, 'toot_lo', 0.35), (LINE2 + 0.8, 'toot_lo', 0.35), (SLIP, 'twang'), (SLIP + 0.05, 'whoosh', 0.7), (HIT, 'bonk', 1.3), (HIT + 0.6, 'toot_lo', 0.35),
        (BOARD, 'slam', 0.8), (BOARD + 0.3, 'ding', 0.6), (LINE3, 'toot_lo', 0.4), (CARD, 'slam', 0.7), (CARD + 0.9, 'pop', 0.7), (CARD + 2.0, 'pop', 0.7)]
RESTS = [(0, CHECK), (SLIP - 0.2, LINE3 + 1.6), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyE_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyE.wav'); B.render(wav, DUR, CUES, RESTS, band_from=CHECK, title=TITLE)
    out = os.path.join(OUT, 'bonkbow-extension-25s.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
