"""BONK BOW - "M249". A comment asked for a machine gun. It is a bow game. We tried anyway.
    python3 tools/derpyG.py [--sheet]"""
import math
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derpy20 as D  # noqa: E402
import derpy_band as B  # noqa: E402
from derpy import BUILD, FPS, H, INK, OUT, PAPER, W, Pen, arrow, bow, rot, span, stars, stickman, text  # noqa: E402
from derpy20 import AX, BX, LY, RED, RY, S, world  # noqa: E402
from derpy30 import STEVE  # noqa: E402
from derpy30c import say  # noqa: E402
from derpy36 import hud, opp  # noqa: E402

DUR = 27.0
INTRO, SCENE, CRATE, LAND, FORME, PICKUP, NOTABOW, ISNOW, FIRE, STOP, RAIN, RAINEND, COOL, BOWGAME, ITIS, CARD, TITLE = \
    0.0, 2.8, 3.8, 4.5, 5.2, 6.4, 7.6, 8.8, 10.2, 12.6, 13.2, 14.6, 15.2, 16.6, 17.8, 19.4, 23.0
N_SHOTS = 20
SHOT_DT = (STOP - FIRE) / N_SHOTS
RAIN_N = 9
SHAKES = [LAND] + [RAIN + i * 0.14 for i in range(RAIN_N)] + [TITLE + 1.05, TITLE + 1.85]


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t < SCENE:
        text(img, 'someone in the comments said', (W / 2, 330), 84, t, seed=1, wob=2)
        text(img, '"add m249 gun here."', (W / 2, 470), 112, t, seed=2, wob=4)
        if t > 1.3:
            text(img, 'we said: sounds like a plan.', (W / 2, 700), 76, t, seed=3, wob=2)
    elif t < CARD:
        scene(img, pen, t)
    elif t < TITLE:
        u = t - CARD
        text(img, 'm249: tested.', (W / 2, 300), 110, t, seed=4, wob=3)
        if u > 0.8:
            text(img, "it shoots arrows. we don't know why.", (W / 2, 480), 64, t, seed=5, wob=2)
        if u > 1.7:
            text(img, '0 hits.  1 steve.', (W / 2, 620), 80, t, seed=6, wob=2)
        if u > 2.5:
            text(img, 'thanks @nagmani_twt.', (W / 2, 820), 52, t, seed=7, wob=2)
    else:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    if FIRE <= t < STOP:
        r = random.Random(f); out = Image.new('RGB', (W, H), PAPER)
        out.paste(img, (int(r.uniform(-9, 9)), int(r.uniform(-9, 9)))); img = out
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def gun(pen, grip, ang, t, firing=False):
    """A very big machine gun held at grip, barrel along ang (0 = right). Returns the muzzle."""
    def P(x, y):
        return rot((grip[0] + x, grip[1] + y), ang, grip)
    pen.blob([P(-150, -40), P(190, -46), P(194, 24), P(-146, 30)], w=9)                     # receiver
    pen.line([P(190, -14), P(470, -16)], 12)                                                 # barrel
    pen.line([P(300, -30), P(300, 8)], 8); pen.line([P(380, -30), P(380, 8)], 8)             # barrel bits
    pen.line([P(-150, 20), P(-250, 0), P(-250, -40), P(-150, -20)], 8)                      # stock
    pen.blob([P(-40, 24), P(70, 26), P(72, 110), P(-38, 108)], w=8)                          # ammo box
    pen.line([P(60, 60), P(110, 80), P(100, 40), P(150, 70), P(140, 30), P(190, 60)], 6)    # belt
    pen.line([P(330, 0), P(300, 120)], 8); pen.line([P(330, 0), P(370, 120)], 8)             # bipod, dangling
    pen.line([P(-20, 30), P(-30, 90)], 10)                                                   # grip
    m = P(470, -16)
    if firing:
        k = (t * FPS) % 2
        for i in range(6):
            a = ang + (-50 + i * 20) + k * 7
            pen.line([m, (m[0] + math.cos(math.radians(a)) * (70 + k * 25), m[1] + math.sin(math.radians(a)) * (70 + k * 25))], 7)
    return m


def muzzle_angle(ts):
    """The gun climbs as he fires it: level, then up, then past vertical."""
    k = span(ts, FIRE, STOP)
    return -8 - 120 * k * k


def scene(img, pen, t):
    world(pen, t)
    sx = AX
    if FIRE <= t:
        sx = AX - 110 * span(t, FIRE, STOP)                   # recoil walks him backwards
    rained = t >= RAIN + 0.4
    hp = 1.0 if not rained else max(0.06, 1.0 - 0.94 * span(t, RAIN + 0.4, RAINEND))
    label = 'YOUR TURN' if t < PICKUP else ('STEVE. ARMED.' if t < RAIN else ('uh oh' if t < COOL else 'YOUR TURN'))
    hud(img, pen, t, hp, 1.0, label)
    # ---- the crate
    if CRATE <= t < PICKUP:
        k = span(t, CRATE, LAND)
        cy = -200 + (LY - 60 + 200) * (k * k)
        cx = AX + 240
        pen.blob([(cx - 90, cy - 80), (cx + 90, cy - 84), (cx + 94, cy + 60), (cx - 94, cy + 62)], w=9)
        pen.line([(cx - 90, cy - 80), (cx + 94, cy + 60)], 5); pen.line([(cx + 90, cy - 84), (cx - 94, cy + 62)], 5)
        text(img, 'M249', (cx, cy - 10), 44, t, seed=20, wob=1)
        if k < 1:
            pen.line([(cx - 60, cy - 84), (cx - 120, cy - 230), (cx + 120, cy - 230), (cx + 60, cy - 84)], 7)
            pen.arc((cx, cy - 230), 120, 180, 360, 7)
        elif t < LAND + 0.5:
            text(img, 'thud', (cx + 150, cy - 120), 56, t, seed=21)
    # ---- some guy
    gl = (0.9, 0.0)
    gf = dict(mouth='chew', drool=True, eyes='derp', seed=3, look=gl)
    if t >= PICKUP:
        gf = dict(mouth='flat', drool=False, eyes='derp', seed=3, look=gl)
    if FIRE <= t < STOP + 0.4:
        gf = dict(mouth='o', drool=False, eyes='wide', seed=3, look=(0.9, -0.5 * span(t, FIRE, STOP)))
    if t >= COOL:
        gf = dict(mouth='chew', drool=True, eyes='derp', seed=3, look=(0.9, 0.3))
    opp(pen, t, face=gf, arms=((60, 20), (-60, -20)) if t >= PICKUP else None, tilt=(-6 if FIRE <= t < STOP else 0))
    if NOTABOW <= t < ISNOW + 1.0:
        say(img, (BX - 40, RY - 440), "that's not a bow.", t, 30, 54)
    if COOL <= t < BOWGAME + 0.4:
        say(img, (BX - 40, RY - 440), 'cool gun.', t, 31, 60)
    if ITIS <= t:
        say(img, (BX - 40, RY - 440), 'it is.', t, 32, 60)
    # ---- steve
    lying = 0.0
    armed = PICKUP <= t
    firing = FIRE <= t < STOP
    if not armed:
        arms = ((100, 100), (-30, 20))
        look = (0.9, 0.1) if t < CRATE else (0.9, -0.9) if t < LAND else (0.9, 0.3)
        mouth = 'smile'
        A = stickman(pen, sx, LY, S, t, arms=arms, torso_lean=4, head_tilt=math.sin(t * 2) * 5, mouth=mouth, drool=True, eyes='derp', look=look, **STEVE)
        g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        if FORME <= t < PICKUP:
            say(img, (300, 330), 'for me?', t, 33, 56)
    else:
        ang = muzzle_angle(t) if t >= FIRE else -8
        if t >= STOP:
            ang = muzzle_angle(STOP) if t < RAIN + 0.6 else 60      # after the rain it droops
        lean = 6 if not firing else 6 + 18 * span(t, FIRE, STOP)
        arms = ((100, 70), (70, 110)) if not firing else ((100 - 60 * span(t, FIRE, STOP), 70 - 90 * span(t, FIRE, STOP)), (70, 110))
        if t >= RAIN + 0.6:
            arms = ((20, 10), (-20, -10))
        mouth = 'smile' if t < FIRE else ('o' if t < COOL + 0.6 else 'flat')
        eyes = 'derp' if t < FIRE else ('wide' if t < COOL + 0.6 else 'derp')
        A = stickman(pen, sx, LY, S, t, arms=arms, torso_lean=(-lean if t < RAIN + 0.6 else 0), head_tilt=(-10 if firing else (0 if t < RAIN + 0.6 else 12)), lying=lying,
                     mouth=mouth, drool=(t < FIRE), eyes=eyes, look=(0.9, 0.0) if t < FIRE else (0.3, -0.9), **STEVE)
        g = A['hands'][0]
        if t < RAIN + 0.6:
            gun(pen, (g[0] + 20, g[1] - 10), ang, t, firing)
        else:
            gun(pen, (sx + 420, LY - 70), 4, t, False)          # dropped, barrel over the gap
        if ISNOW <= t < FIRE:
            say(img, (300, 330), 'it is now.', t, 34, 56)
        if firing:
            text(img, 'brrrrrt', (sx + 200, LY - 560), int(84 + 10 * math.sin(t * 50)), t, seed=35, wob=4)
        if BOWGAME <= t:
            say(img, (330, 330), "it's a bow game.", t, 36, 52)
    # ---- the shots: arrows, spraying wherever the muzzle points
    if FIRE <= t < STOP + 1.2:
        for i in range(N_SHOTS):
            ts = FIRE + i * SHOT_DT
            if ts <= t < ts + 1.0:
                a = muzzle_angle(ts) + random.Random(i).uniform(-8, 8)
                gx = AX - 110 * span(ts, FIRE, STOP)
                mx, my = gx + 20 + math.cos(math.radians(a)) * 470, LY - 300 - 10 + math.sin(math.radians(a)) * 470
                d = (t - ts) * 1900
                arrow(pen, (mx + math.cos(math.radians(a)) * d, my + math.sin(math.radians(a)) * d), a, L=120)
    # ---- the rain
    if RAIN <= t:
        for i in range(RAIN_N):
            ti = RAIN + i * 0.14
            r = random.Random(100 + i)
            x = sx + r.uniform(-90, 90); yl = LY - 300 + r.uniform(-120, 180) if i < 6 else LY
            if t >= ti:
                k = span(t, ti, ti + 0.1)
                y = -100 + (yl + 100) * k
                arrow(pen, (x, y), 92 + r.uniform(-12, 12), L=130)
                if ti <= t < ti + 0.5 and i < 6:
                    stars(pen, (x, y - 20), ti, t, n=5, r=70)
        if RAIN <= t < RAINEND + 0.3:
            text(img, 'bonk bonk bonk', (sx + 330, LY - 520), 72, t, seed=37, wob=4)


CUES = [(INTRO, 'slam', 0.7), (INTRO + 1.3, 'pop', 0.7), (CRATE, 'down', 0.6), (LAND, 'thud', 1.2), (LAND, 'crack', 0.8), (FORME, 'toot_hi', 0.35),
        (PICKUP, 'up', 0.6), (PICKUP + 0.2, 'win', 0.5), (NOTABOW, 'toot_lo', 0.35), (ISNOW, 'toot_hi', 0.35), (FIRE - 0.3, 'tick', 0.8)] + \
       [(FIRE + i * SHOT_DT, 'thock', 0.9) for i in range(N_SHOTS)] + [(FIRE + i * SHOT_DT, 'twang', 0.5) for i in range(0, N_SHOTS, 2)] + \
       [(STOP, 'sigh', 0.8), (RAIN - 0.3, 'down', 0.7)] + [(RAIN + i * 0.14, 'bonk', 1.1) for i in range(6)] + [(RAIN + 0.9, 'thud', 0.9)] + \
       [(COOL, 'toot_lo', 0.4), (BOWGAME, 'toot_hi', 0.35), (ITIS, 'toot_lo', 0.4), (ITIS + 0.4, 'laugh', 0.4),
        (CARD, 'slam', 0.7), (CARD + 0.8, 'pop', 0.6), (CARD + 1.7, 'pop', 0.6), (CARD + 2.5, 'ding', 0.6)]
RESTS = [(0, SCENE), (FIRE - 0.3, ITIS + 1.2), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyG_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyG.wav'); B.render(wav, DUR, CUES, RESTS, band_from=SCENE, title=TITLE)
    out = os.path.join(OUT, 'bonkbow-m249-27s.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
