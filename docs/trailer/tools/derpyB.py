"""BONK BOW - script B, "Tutorial". A deadly serious tutorial, taught to someone who cannot be
taught. About 41 seconds.    python3 tools/derpyB.py [--sheet]"""
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
from derpy36 import hud, opp  # noqa: E402
from props_scrawl import target  # noqa: E402

DUR = 41.0
S1, TURN, FINE, S2, PUSH, EAT, AGAIN, S3, ARC, AIM3, FIRE3, S4, DRAW4, REL4, OK4, S5, JUMP, FALL, S6, CARD, TITLE = \
    0.0, 4.0, 5.8, 7.0, 9.6, 11.0, 13.4, 15.0, 16.2, 17.2, 19.6, 22.0, 23.0, 25.6, 27.8, 29.0, 30.0, 32.6, 34.2, 36.2, 37.6
SHAKES = [PUSH + 0.3, FIRE3 + 0.5, REL4 + 0.5, FALL + 0.6, TITLE + 1.05, TITLE + 1.85]
TGT = (BX - 120, RY - 190)


def narrator(img, pen, line, t, t0, seed):
    k = span(t, t0, t0 + 0.2)
    pen.blob([(380, 150 - 60 * (1 - k)), (1540, 146 - 60 * (1 - k)), (1544, 236 - 60 * (1 - k)), (376, 240 - 60 * (1 - k))], w=8, fill=(20, 20, 24))
    n = int(len(line) * span(t, t0, t0 + 0.6)) if t < t0 + 0.6 else len(line)
    text(img, line[:n], (960, 192 - 60 * (1 - k)), 52, t, col=(246, 244, 238), seed=seed, wob=1)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if CARD <= t < TITLE:
        text(img, 'tutorial complete.', (W / 2, 440), 120, t, seed=1, wob=3)
        if t > CARD + 0.5:
            text(img, '(skippable.)', (W / 2, 620), 70, t, seed=2, wob=2)
    elif t >= TITLE:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    else:
        lesson(img, pen, t)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def lesson(img, pen, t):
    world(pen, t)
    hud(img, pen, t, 1.0, 1.0, '')
    target(pen, TGT, 70)
    opp(pen, t, face=dict(mouth='chew', drool=True, eyes='derp', seed=3))
    if t < S2:                                     # step 1: hold the bow
        narrator(img, pen, 'STEP 1: HOLD THE BOW.', t, S1, 10)
        turn = span(t, TURN, TURN + 0.5)
        A = stickman(pen, AX, LY, S, t, arms=((100, 100), (-30, 20)), torso_lean=4, mouth='smile' if t < FINE else 'flat', drool=t < FINE, eyes='derp',
                     look=(0.9, 0.1) if t < TURN - 0.6 else (0.0, 0.0), **STEVE)
        g = A['hands'][0]
        if turn < 1:                               # by the string, upside down: the bow hangs under his fist
            bow(pen, (g[0] + 60, g[1] + 120 - 120 * turn), 180 * (1 - turn) + 180 * turn, 100)
        else:                                      # backwards: belly toward his own face
            bow(pen, (g[0] + 10, g[1]), 180, 100)
        if S1 + 2.6 < t < TURN:
            text(img, '...', (W / 2, 330), 80, t, seed=11)
        if t >= FINE:
            narrator(img, pen, '...FINE.', t, FINE, 12)
    elif t < S3:                                   # step 2: nock the arrow
        narrator(img, pen, 'STEP 2: NOCK THE ARROW.' if t < AGAIN else 'STEP 2 (AGAIN).', t, S2 if t < AGAIN else AGAIN, 13)
        eating = EAT <= t < AGAIN + 0.6
        A = stickman(pen, AX, LY, S, t, arms=((90, 88), (40, 120)) if not eating else ((60, 150), (-60, -150)), torso_lean=6, head_tilt=(math.sin(t * 20) * 5 if eating else 0),
                     mouth='chew' if eating else 'flat', drool=eating, eyes='derp', look=(0.9, 0.1), **STEVE)
        g = A['hands'][0]
        if not eating:
            bow(pen, g, 0, 100)
            if t < PUSH:                           # on the far side of the bow, in front of the string
                arrow(pen, (g[0] + 150, g[1] - 10), 0, L=140)
            else:                                  # pushed through his own fist
                k = span(t, PUSH, PUSH + 0.9)
                arrow(pen, (g[0] + 150 - 230 * k, g[1] - 10), 0, L=140)
                if 0.2 < k < 0.9 and int(t * 10) % 2 == 0:
                    text(img, 'hnng', (AX + 120, LY - 520), 56, t, seed=14)
        else:
            m = (A['neck'][0] + 16, A['neck'][1] - 30)
            arrow(pen, (m[0] + 90, m[1]), 2, L=int(170 - 120 * span(t, EAT + 0.3, AGAIN)))
            bow(pen, (AX - 80, LY - 60), 10, 90)
    elif t < S4:                                   # step 3: aim
        narrator(img, pen, 'STEP 3: AIM.', t, S3, 15)
        n = 16
        shown = int(n * span(t, ARC, ARC + 0.8))
        gone = t >= FIRE3 + 0.5
        pts = [para((AX + 110, LY - SH), TGT, 260, (i + 1) / (n + 1))[0] for i in range(n)]
        apex = pts[7]
        for i, p in enumerate(pts[:shown]):
            if gone:
                k = clamp((t - FIRE3 - 0.5) / 0.6); r = random.Random(i)
                p = (p[0] + r.uniform(-300, 300) * k, p[1] + 500 * k * k + r.uniform(-100, 100) * k)
            pen.dot(p, 9 - i * 0.25)
        ang = -math.degrees(math.atan2(LY - SH - apex[1], apex[0] - (AX + 110)))
        d = span(t, AIM3 + 0.6, FIRE3 - 0.1) if t < FIRE3 else 0
        ta = span(t, AIM3, AIM3 + 0.5)
        a = ang * ta
        A = stickman(pen, AX, LY, S, t, arms=aim_arms(d), torso_lean=6 - 10 * ta, mouth='o' if t > AIM3 else 'flat', drool=False, eyes='wide' if t > AIM3 else 'derp', look=(0.9, -0.6 * ta), **STEVE)
        g = A['hands'][0]; bow(pen, g, -a, 100, pull=d * 0.9)
        if t < FIRE3:
            r = math.radians(-a); arrow(pen, (g[0] + math.cos(r) * (46 - 40 * d), g[1] + math.sin(r) * (46 - 40 * d)), -a, L=140)
        elif t < FIRE3 + 0.5:
            k = (t - FIRE3) / 0.5
            arrow(pen, lp((g[0] + 46, g[1]), apex, k), -a, L=140)
        if gone and t < FIRE3 + 1.1:
            stars(pen, apex, FIRE3 + 0.5, t, n=6, r=70)
        if t > FIRE3 + 1.2:
            narrator(img, pen, 'NOT THE DOTS.', t, FIRE3 + 1.2, 16)
    elif t < S5:                                   # step 4: release
        narrator(img, pen, 'STEP 4: RELEASE.' if t < OK4 else 'STEP 4: ACCEPTABLE.', t, S4 if t < OK4 else OK4, 17)
        d = span(t, DRAW4, REL4 - 0.1) if t < REL4 else 0
        rel = t >= REL4
        A = stickman(pen, AX, LY, S, t, arms=aim_arms(d) if not rel else ((50, 20), (-60, -40)), torso_lean=6, mouth='o' if d > 0.2 or rel else 'flat', drool=False,
                     eyes='wide' if d > 0.5 or rel else 'derp', look=(0.9, -0.1) if not rel else (0.9, -0.4), **STEVE)
        g = A['hands'][0]
        if not rel:
            bow(pen, g, 0, 100, pull=d * 0.9); arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        else:
            arrow(pen, (g[0] + 46, g[1] + 30 * clamp((t - REL4) / 0.3)), 0, L=140)     # the arrow stays with him
            k = clamp((t - REL4) / 0.5)
            p, ang = para((g[0], g[1]), (TGT[0] - 20, TGT[1]), 300, k)
            bow(pen, p, ang + 720 * k, 100)
            if k >= 1:
                stars(pen, TGT, REL4 + 0.5, t, n=7, r=90)
    else:                                          # step 5: celebrate
        narrator(img, pen, 'STEP 5: CELEBRATE.' if t < S6 else 'STEP 6: THERE IS NO STEP 6.', t, S5 if t < S6 else S6, 18)
        bow(pen, (TGT[0] - 20, TGT[1]), 0, 100)
        if t < FALL:
            k = span(t, JUMP, FALL)
            hops = int((t - JUMP) / 0.45) if t >= JUMP else 0
            ph = ((t - JUMP) / 0.45) % 1.0 if t >= JUMP else 0
            x = AX + 70 * hops + 70 * ph
            A = stickman(pen, x, LY, S, t, arms=UP, hop=math.sin(ph * math.pi) * 60 if t >= JUMP else 0, mouth='smile', drool=True, eyes='shut', **STEVE)
        else:
            k = clamp((t - FALL) / 0.8)
            x = AX + 70 * 5 + 120 * k; y = LY + 900 * k * k
            A = stickman(pen, x, y, S, t, arms=UP, legs=((-60, 60), (70, -70)), head_tilt=math.sin(t * 25) * 25, mouth='o', drool=False, eyes='wide', **STEVE)
            if t < FALL + 0.8:
                text(img, 'aaa', (x + 150, y - 350), 80, t, seed=19)


CUES = [(S1, 'type', 0.7), (S1 + 2.6, 'wrong', 0.5), (TURN, 'creak', 0.5), (FINE, 'type', 0.5), (S2, 'type', 0.7), (PUSH + 0.2, 'creak_long', 0.8), (PUSH + 0.3, 'crack', 0.5),
        (EAT + 0.3, 'nom', 0.8), (EAT + 0.7, 'nom', 0.8), (EAT + 1.1, 'nom', 0.8), (EAT + 1.5, 'nom', 0.8), (AGAIN, 'type', 0.6), (AGAIN, 'error', 0.7),
        (S3, 'type', 0.7), (ARC, 'tick', 0.5), (AIM3 + 0.6, 'creak'), (FIRE3, 'twang'), (FIRE3 + 0.5, 'beads'), (FIRE3 + 1.2, 'type', 0.5),
        (S4, 'type', 0.7), (DRAW4, 'creak'), (REL4, 'twang'), (REL4 + 0.05, 'whoosh', 0.7), (REL4 + 0.5, 'thock', 1.2), (REL4 + 0.6, 'ding', 0.6), (OK4, 'type', 0.5),
        (S5, 'type', 0.7), (JUMP, 'cheer', 0.5), (FALL + 0.1, 'down', 0.6), (FALL + 0.8, 'thud'), (S6, 'type', 0.6), (CARD, 'slam', 0.8), (CARD + 0.5, 'pop', 0.8)]
RESTS = [(0, S1 + 1.2), (S1 + 2.5, TURN), (FINE, S2), (PUSH + 0.3, PUSH + 0.8), (AGAIN, AGAIN + 1.0), (FIRE3 + 0.5, S4), (REL4 + 0.5, S5), (FALL + 0.6, CARD + 0.4), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyB_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyB.wav'); B.render(wav, DUR, CUES, RESTS, band_from=S1 + 1.2, title=TITLE, swing_from=S5)
    out = os.path.join(OUT, 'bonkbow-B-tutorial.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
