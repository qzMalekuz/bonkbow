"""BONK BOW - script A, "The Rematch". Game 849: the 847-time loser gets his rematch and loses in
four brand-new ways. About 38 seconds.    python3 tools/derpyA.py [--sheet]"""
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
from derpy30c import say  # noqa: E402
from derpy36 import hud, opp, steve  # noqa: E402
from derpy30 import STEVE  # noqa: E402

DUR = 38.0
COIN, EDGE, SHOT1, STOP, POKE, DROP, SHOT2, STUCK, SIGH, SHOT3, LOOK, CARD, MOON, SHOT4, HIT, CHECK, BUG, REPORT, CARD2, TITLE = \
    0.6, 2.0, 5.8, 6.1, 8.0, 8.6, 11.0, 12.0, 12.7, 15.2, 15.4, 20.0, 21.6, 25.2, 25.8, 27.0, 28.2, 29.4, 31.2, 34.6
SHAKES = [DROP, STUCK, HIT, TITLE + 1.05, TITLE + 1.85]


def coin(pen, c, r=40, ang=0.0, edge=False):
    if edge:
        pen.blob([(c[0] - 6, c[1] - r), (c[0] + 6, c[1] - r), (c[0] + 6, c[1] + r), (c[0] - 6, c[1] + r)], w=6, fill=(240, 195, 50))
    else:
        pen.blob([(c[0] + math.cos(a) * r * abs(math.cos(ang)), c[1] + math.sin(a) * r) for a in [k * math.tau / 10 for k in range(10)]], w=5, fill=(240, 195, 50))


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if CARD <= t < MOON:
        text(img, 'it never came down.', (W / 2, 500), 110, t, seed=1, wob=3)
    elif MOON <= t < SHOT4:
        night(img, pen, t)
    elif CARD2 <= t < TITLE:
        text(img, 'game 849', (W / 2, 420), 150, t, seed=2, wob=4)
        if t > CARD2 + 0.6:
            text(img, 'is still going.', (W / 2, 620), 90, t, seed=3, wob=2)
    elif t >= TITLE:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    else:
        duel(img, pen, t)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def night(img, pen, t):
    d = ImageDraw.Draw(img); d.rectangle((0, 0, W, H), fill=(18, 18, 26))
    r = random.Random(9)
    for k in range(60):
        x, y = r.uniform(0, W), r.uniform(0, H * 0.8); d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(230, 230, 240))
    k = span(t, MOON, MOON + 0.6)
    c = (960, 480)
    pen.blob([(c[0] + math.cos(a) * 190, c[1] + math.sin(a) * 190) for a in [j * math.tau / 14 for j in range(14)]], w=9, fill=(236, 236, 220), col=(200, 200, 190))
    for cx, cy, cr in ((880, 420, 30), (1010, 540, 42), (1000, 400, 18)):
        pen.blob([(cx + math.cos(a) * cr, cy + math.sin(a) * cr) for a in [j * math.tau / 8 for j in range(8)]], w=5, fill=(210, 210, 195), col=(170, 170, 160))
    if k > 0.3:
        w = math.sin((t - MOON) * 30) * 8 * math.exp(-(t - MOON) * 4)
        arrow(pen, (c[0] - 60, c[1] + 40), 250 + w, L=170)
    text(img, 'the moon.', (W / 2, 880), 70, t, col=(236, 236, 220), seed=4, wob=2)


def duel(img, pen, t):
    world(pen, t)
    hp_b = 1.0 if t < STUCK else 0.97
    hp_a = 1.0
    label = 'GAME 849' if t < COIN else ('' if t < SHOT1 - 1.5 else ('YOUR TURN' if t < SHOT2 - 1.5 else ('HIS TURN' if t < SHOT3 - 1.5 else ('YOUR TURN' if t < SHOT4 - 1.5 else 'HIS TURN'))))
    hud(img, pen, t, hp_a, hp_b, label)
    if HIT <= t:                                   # the bar goes the wrong way
        d = ImageDraw.Draw(img); over = min(1.0, (t - HIT) / 0.4)
        d.rectangle((66, 56, 66 + 508 + 160 * over, 100), fill=RED); pen.line([(574, 50), (574 + 162 * over, 48), (576 + 162 * over, 106), (574, 108)], 8)
        if t < HIT + 1.4:
            text(img, '+1', (640, 150 - 60 * (t - HIT) / 1.4), 64, t, col=(40, 160, 70), seed=5)
    # ---- the coin
    if COIN <= t < SHOT1 - 1.2:
        k = clamp((t - COIN) / 1.4)
        if k < 1:
            p, _ = para((BX - 160, RY - 300), (BX - 230, RY - 40), 420, k)
            coin(pen, p, ang=t * 25)
        else:
            coin(pen, (BX - 230, RY - 40), edge=True)
            if t > EDGE + 1.0:
                say(img, (W / 2, 300), '...', t, 6, 90)
    # ---- Steve
    if t < SHOT1 - 1.4:
        A = steve(pen, t, look=(0.9, 0.3) if t > COIN + 1.2 else (0.9, 0.0), mouth='flat' if t > EDGE else 'smile', drool=t <= EDGE)
    elif t < DROP + 0.6:                          # shot 1: 20 cm, then nothing
        d = span(t, SHOT1 - 1.4, SHOT1 - 0.1) if t < SHOT1 else 0
        poke = span(t, POKE - 0.3, POKE) * (1 - span(t, POKE + 0.3, POKE + 0.6))
        arms = aim_arms(d) if t < STOP + 0.4 else ((90 + 10 * poke, 88 - 20 * poke), (40 - 60 * poke, 120 - 40 * poke))
        A = stickman(pen, AX, LY, S, t, arms=arms, torso_lean=6 + 8 * poke, mouth='o' if t > STOP else 'flat', drool=False, eyes='wide' if t > STOP else 'derp',
                     look=(0.9, 0.1), **STEVE)
        g = A['hands'][0]; bow(pen, g, 0, 100, pull=d * 0.9)
        if t < SHOT1:
            arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        elif t < DROP:
            k = clamp((t - SHOT1) / (STOP - SHOT1))
            arrow(pen, (g[0] + 46 + 110 * k, g[1] + (6 * math.sin(t * 50) if POKE <= t < POKE + 0.3 else 0)), 0, L=140)
            if t >= STOP + 0.05 and t < STOP + 0.4:
                pen.line([(g[0] + 170, g[1] - 70), (g[0] + 166, g[1] + 70)], 4, INK, 1.5); text(img, 'tink', (g[0] + 250, g[1] - 150), 54, t, seed=7)
        else:
            k = clamp((t - DROP) / 0.3)
            arrow(pen, (g[0] + 156, g[1] + 120 * k * k + 20), 0 + 70 * k, L=140)
        if DROP + 0.1 < t:
            say(img, (AX + 100, LY - 440), 'hm.', t, 8, 70)
    elif t < SHOT3 - 1.2:
        A = steve(pen, t, look=(0.9, 0.1), mouth='flat', drool=False)
    elif t < CARD:                                 # shot 2: straight up; and it stays up
        d = span(t, SHOT3 - 1.2, SHOT3 - 0.1) if t < SHOT3 else 0
        rel = t >= SHOT3
        A = stickman(pen, AX, LY, S, t, arms=aim_arms(d), torso_lean=6, head_tilt=(-30 * span(t, LOOK, LOOK + 0.4) if rel else 0), mouth='o', drool=False,
                     eyes='wide', look=(0.2, -1.0) if rel else (0.9, -0.1), **STEVE)
        g = A['hands'][0]; bow(pen, g, 0 if not rel else 95, 100, pull=d * 0.9)
        if not rel:
            arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        elif t < SHOT3 + 0.55:
            arrow(pen, (AX - 30, lerp(LY - 400, -260, 1 - (1 - (t - SHOT3) / 0.55) ** 2)), -90, L=140)
    elif t < BUG:                                  # shot 4 lands on him
        A = stickman(pen, AX, LY, S, t, arms=((100, 100), (-30, 20)), torso_lean=4, head_tilt=(12 * span(t, HIT, HIT + 0.1) * (1 - span(t, HIT + 0.3, HIT + 0.6))),
                     mouth='o' if t > HIT - 0.3 else 'flat', drool=False, eyes='wide' if t > HIT - 0.3 else 'derp', look=(0.9, -0.1) if t < CHECK else (-0.9, -0.9), **STEVE)
        g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        if t >= HIT:
            arrow(pen, (A['neck'][0] + 70, A['neck'][1] - 150), 170, L=140)
            stars(pen, (A['neck'][0] + 40, A['neck'][1] - 150), HIT, t)
            if t < HIT + 0.6:
                text(img, 'bonk', (AX + 300, LY - 560), 92, t, seed=9)
    else:
        A = stickman(pen, AX, LY, S, t, arms=((100, 100), (-30, 20)) if t < BUG + 0.2 else ((120, 90), (-30, 20)), torso_lean=4, mouth='flat', drool=False, eyes='derp',
                     look=(0.0, 0.0), **STEVE)
        g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        arrow(pen, (A['neck'][0] + 70, A['neck'][1] - 150), 170, L=140)
        say(img, (AX + 110, LY - 460), 'bug.', t, 10, 80)
    # ---- some guy
    if t < SHOT2 - 1.0:
        opp(pen, t, face=dict(mouth='flat' if COIN - 0.3 < t else 'chew', drool=t <= COIN - 0.3, eyes='derp', seed=3, look=(0.9, 0.5 if t > COIN else 0.0)),
            arms=((40, -15), (-25, 30)) if COIN - 0.3 < t < COIN + 0.5 else None)
    elif t < SHOT3 - 1.2:                          # shot 2: over the shoulder
        d = span(t, SHOT2 - 1.0, SHOT2 - 0.1) if t < SHOT2 else 0
        rel = t >= SHOT2
        Gy = stickman(pen, BX, RY, S, t, kind='slab', flip=-1, arms=((-60, -30), (lerp(-40, -110, d) if not rel else -40, lerp(-30, -120, d) if not rel else -30)),
                      torso_lean=-6, head_tilt=0, mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.3))
        g = Gy['hands'][0]
        bow(pen, g, 200, 100, pull=d * 0.9)
        if not rel:
            a = math.radians(200); arrow(pen, (g[0] + math.cos(a) * (46 - 40 * d), g[1] + math.sin(a) * (46 - 40 * d)), 200, L=140)
        elif t < STUCK:
            k = (t - SHOT2) / (STUCK - SHOT2)
            p, ang = para((g[0] - 40, g[1] - 20), (BX + 30, RY - 170), 420, k)
            arrow(pen, p, ang, L=140)
        else:
            arrow(pen, (BX + 32, RY - 168), 110, L=140)
            if t < STUCK + 0.5:
                stars(pen, (BX + 40, RY - 180), STUCK, t, n=5, r=70)
            if t >= SIGH:
                say(img, (BX, RY - 360), 'sigh.', t, 11, 64)
    elif t < SHOT4 - 1.3:
        opp(pen, t, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, -1.0 if LOOK <= t else 0.0)), tilt=(-30 * span(t, LOOK, LOOK + 0.4)))
    elif t < CHECK:                                # shot 4: finally hits
        d = span(t, SHOT4 - 1.3, SHOT4 - 0.1) if t < SHOT4 else 0
        rel = t >= SHOT4
        Gy = stickman(pen, BX, RY, S, t, kind='slab', flip=-1, arms=aim_arms(d), torso_lean=6, mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.0))
        g = Gy['hands'][0]; bow(pen, g, 180, 100, pull=d * 0.9)
        if not rel:
            arrow(pen, (g[0] - 46 + 40 * d, g[1]), 180, L=140)
        elif t < HIT:
            k = (t - SHOT4) / (HIT - SHOT4)
            p, ang = para((g[0] - 46, g[1]), (AX + 70, LY - 330), 60, k)
            arrow(pen, p, ang, L=140)
    else:
        opp(pen, t, face=dict(mouth='flat' if t < REPORT else 'tiny', drool=False, eyes='derp', seed=3, look=(0.9, -0.9) if t < BUG else (0.9, 0.0)))
        if t >= REPORT:
            say(img, (BX, RY - 360), 'report it.', t, 12, 64)


CUES = [(COIN, 'coin'), (EDGE, 'tick', 0.6), (EDGE + 1.0, 'wrong', 0.6), (SHOT1 - 1.4, 'creak'), (SHOT1, 'twang'), (STOP, 'glass'), (POKE, 'poke'), (DROP, 'tick'),
        (DROP + 0.1, 'toot_lo', 0.4), (SHOT2 - 1.0, 'creak'), (SHOT2, 'twang'), (SHOT2 + 0.05, 'whoosh', 0.6), (STUCK, 'thock'), (SIGH, 'sigh'),
        (SHOT3 - 1.2, 'creak'), (SHOT3, 'twang'), (SHOT3, 'up'), (LOOK + 1.0, 'wind', 0.6), (CARD, 'slam', 0.7), (MOON, 'ding', 0.4), (MOON + 0.2, 'thock', 0.5),
        (SHOT4 - 1.3, 'creak'), (SHOT4, 'twang'), (HIT, 'bonk', 1.3), (HIT + 0.4, 'confirm', 0.8), (BUG, 'toot_lo', 0.4), (REPORT, 'toot_lo', 0.4), (CARD2, 'slam', 0.8), (CARD2 + 0.6, 'pop', 0.8)]
RESTS = [(0, COIN), (EDGE, SHOT1 - 1.4), (STOP, DROP + 0.6), (STUCK, SIGH + 0.8), (LOOK, MOON + 1.6), (HIT, BUG + 1.8), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyA_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyA.wav'); B.render(wav, DUR, CUES, RESTS, band_from=COIN, title=TITLE, swing_from=SHOT4 - 1.3)
    out = os.path.join(OUT, 'bonkbow-A-rematch.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
