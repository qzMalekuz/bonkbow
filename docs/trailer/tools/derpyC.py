"""BONK BOW - script C, "Steve vs Himself". The opponent is off sick, so Steve plays both sides,
faster and faster, and still loses. About 36 seconds.    python3 tools/derpyC.py [--sheet]"""
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
from derpy36 import opp  # noqa: E402

DUR = 36.0
LOOK, SHRUG, FIRE0, CROSS, ARRIVE, LOOP, DRAW_, CATCH, SELF, ZERO, THUMBS, WALKIN, MISS, WON, LOST, TITLE = \
    1.4, 3.0, 4.6, 5.0, 7.0, 8.0, 21.2, 16.4, 19.3, 21.6, 23.4, 25.6, 27.2, 28.6, 29.8, 32.4
# the back-and-forth: (time he fires, from which side) with the gaps shrinking
SHOTS = []
_t, _gap, _side = ARRIVE + 1.0, 1.7, 1
while _t < DRAW_ - 0.3:
    SHOTS.append((_t, _side)); _t += _gap; _gap = max(0.55, _gap * 0.78); _side = -_side
SHAKES = [SELF + 0.5, ZERO, TITLE + 1.05, TITLE + 1.85]


def hud(img, pen, t, hp_l, hp_r, label=''):
    d = ImageDraw.Draw(img)
    for x0, hp, name in ((60, hp_l, 'steve'), (1340, hp_r, 'also steve')):
        if hp > 0:
            d.rectangle((x0 + 6, 56, x0 + 6 + 508 * hp, 100), fill=RED)
        pen.line([(x0, 50), (x0 + 520, 48), (x0 + 522, 106), (x0 - 2, 108), (x0, 50)], 8)
        text(img, name, (x0 + 110 if name == 'steve' else x0 + 380, 118), 44, t, seed=11 if name == 'steve' else 12, wob=2)
    if label:
        text(img, label, (W / 2, 70), 78, t, seed=21, wob=3)


def sign(pen, img, t):
    pen.line([(BX, RY), (BX, RY - 260)], 9)
    pen.blob([(BX - 190, RY - 400), (BX + 190, RY - 404), (BX + 194, RY - 250), (BX - 194, RY - 246)], w=8)
    text(img, 'sick.', (BX, RY - 365), 54, t, seed=30, wob=2); text(img, 'back tuesday.', (BX, RY - 300), 44, t, seed=31, wob=2)


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    if t >= TITLE:
        D.title(img, pen, t - TITLE + D.TITLE, f)
    else:
        scene(img, pen, t)
    for t0 in SHAKES:
        k = (t - t0) / 0.2
        if 0 <= k < 1:
            r = random.Random(int(t * FPS)); out = Image.new('RGB', (W, H), PAPER)
            out.paste(img, (int(r.uniform(-16, 16) * (1 - k)), int(r.uniform(-16, 16) * (1 - k)))); img = out
    return img


def side_of(t):
    """Which ledge Steve is on at time t during the loop, and how far through the crossing."""
    side, moving, k = 1, False, 0.0
    for i, (ts, sd) in enumerate(SHOTS):
        if t >= ts:
            side = sd
            nxt = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else DRAW_
            gap = nxt - ts
            k = clamp((t - ts - 0.15) / max(0.25, gap - 0.35))
            moving = 0 < k < 1
    return side, moving, k


def scene(img, pen, t):
    world(pen, t)
    hits_l = sum(1 for ts, sd in SHOTS if sd == -1 and t >= ts + 0.35)
    hits_r = sum(1 for ts, sd in SHOTS if sd == 1 and t >= ts + 0.35)
    hp_l = max(0.0, 1.0 - 0.17 * hits_l - (0.3 if t >= SELF + 0.5 else 0)); hp_r = max(0.0, 1.0 - 0.17 * hits_r)
    if t >= ZERO:
        hp_l = hp_r = 0.0
    label = 'YOUR TURN' if t < LOOP else ('YOUR TURN' if t < ZERO else 'DRAW.')
    if LOOP <= t < ZERO:
        label = 'YOUR TURN' if (len([1 for ts, sd in SHOTS if t >= ts]) % 2 == 0) else 'ALSO YOUR TURN'
    hud(img, pen, t, hp_l, hp_r, label)
    if t < WALKIN + 1.0 and not (ARRIVE <= t < WALKIN):
        pass
    if t < CROSS + 0.5:
        sign(pen, img, t)
    # ---- the sign stays on the right ledge, knocked flat once he arrives
    if t >= ARRIVE:
        pen.line([(BX + 40, RY - 6), (BX + 300, RY - 30)], 9); pen.blob([(BX + 120, RY - 90), (BX + 480, RY - 110), (BX + 484, RY - 20), (BX + 124, RY)], w=7)
    # ---- the opening: alone
    if t < FIRE0 - 1.2:
        A = stickman(pen, AX, LY, S, t, arms=((100, 100), (-30, 20)) if t < SHRUG else ((60, 20), (-60, -20)), torso_lean=4, head_tilt=(8 if LOOK < t < SHRUG else 0),
                     mouth='flat' if t > LOOK else 'smile', drool=t <= LOOK, eyes='derp', look=(0.9, 0.0) if t < LOOK else (0.9, -0.3) if t < SHRUG else (0.0, 0.0), **STEVE)
        g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        if SHRUG <= t:
            say(img, (AX + 120, LY - 440), 'ok.', t, 32, 70)
        return
    # ---- the first shot and the walk across
    if t < ARRIVE:
        d = span(t, FIRE0 - 1.2, FIRE0 - 0.1) if t < FIRE0 else 0
        if t < CROSS:
            A = stickman(pen, AX, LY, S, t, arms=aim_arms(d), torso_lean=6, mouth='o', drool=False, eyes='wide', look=(0.9, 0.0), **STEVE)
            g = A['hands'][0]; bow(pen, g, 0, 100, pull=d * 0.9)
            if t < FIRE0:
                arrow(pen, (g[0] + 46 - 40 * d, g[1]), 0, L=140)
        if t >= FIRE0:
            k = clamp((t - FIRE0) / 0.4)
            p, ang = para((AX + 110, LY - SH), (BX - 80, RY - SH + 40), 120, k)
            arrow(pen, p, ang, L=140)
            n = int(16 * k)
            trail = [para((AX + 110, LY - SH), (BX - 80, RY - SH + 40), 120, (i + 1) / 17)[0] for i in range(16)]
            for q in trail[:n]:
                pen.dot(q, 7)
            if t >= CROSS:                      # he walks the trail. do not explain it.
                kk = span(t, CROSS, ARRIVE)
                p2, _ = para((AX + 110, LY - SH), (BX - 80, RY - SH + 40), 120, kk)
                ph = t * 11
                A = stickman(pen, p2[0], p2[1] + SH, S, t, legs=((math.sin(ph) * 30, 6), (-math.sin(ph) * 30, -4)), arms=((-40, -20), (50, 20)), torso_lean=12,
                             mouth='smile', drool=True, eyes='derp', look=(0.9, 0.0), **STEVE)
                g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        return
    # ---- the loop
    if t < ZERO:
        side, moving, k = side_of(t)
        # the arrow currently in flight / the last one stuck
        for ts, sd in SHOTS:
            if ts <= t < ts + 0.35:
                kk = (t - ts) / 0.35
                src = (AX + 110, LY - SH) if sd == 1 else (BX - 110, RY - SH)
                dst = (BX + 20, RY - 200) if sd == 1 else (AX - 20, LY - 200)
                if t >= CATCH and sd == -1 and ts < CATCH + 0.5 < ts + 0.6:
                    dst = (AX + 120, LY - SH)
                p, ang = para(src, dst, 100, kk); arrow(pen, p, ang, L=140)
        if moving:
            src = (AX, LY) if side == 1 else (BX, RY); dst = (BX, RY) if side == 1 else (AX, LY)
            p, _ = para(src, dst, 120, k)
            ph = t * 14
            A = stickman(pen, p[0], p[1], S, t, flip=side, legs=((math.sin(ph) * 32, 6), (-math.sin(ph) * 32, -4)), arms=((-50, -20), (60, 20)), torso_lean=16,
                         mouth='o', drool=False, eyes='wide', look=(0.9, 0.0), **STEVE)
            g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
        else:
            x, gy, flip = (AX, LY, 1) if side == 1 else (BX, RY, -1)
            last = max([ts for ts, sd in SHOTS if t >= ts] + [ARRIVE])
            nxt = min([ts for ts, sd in SHOTS if ts > t] + [DRAW_])
            d = span(t, nxt - 0.6, nxt - 0.08)
            rel = t - last < 0.15
            dodge = SELF - 2.4 < t < SELF - 1.9
            catching = CATCH <= t < CATCH + 0.9
            lean = -18 * flip if dodge else 0
            arms = aim_arms(0 if rel else d) if not catching else ((90, 88), (-30, -60))
            face = dict(mouth='o', drool=False, eyes='wide', look=(0.9, 0.0))
            if t >= SELF + 0.5:
                face = dict(mouth='flat', drool=False, eyes='derp', look=(0.0, 0.0))
            A = stickman(pen, x + (40 * flip if dodge else 0), gy, S, t, flip=flip, arms=arms, torso_lean=6 + lean, mouth=face['mouth'], drool=face['drool'], eyes=face['eyes'],
                         look=face['look'], head_tilt=(math.sin((t - SELF - 0.5) * 30) * 10 * math.exp(-(t - SELF - 0.5) * 4) if t >= SELF + 0.5 else 0), **STEVE)
            g = A['hands'][0]; bow(pen, g, 0 if flip > 0 else 180, 100, pull=(0 if rel or catching else d) * 0.9)
            if not rel and not catching and d > 0.05:
                arrow(pen, (g[0] + flip * (46 - 40 * d), g[1]), 0 if flip > 0 else 180, L=140)
            if catching and t > CATCH + 0.45:
                arrow(pen, (A['hands'][1][0] + 60, A['hands'][1][1]), 0, L=140)
                if t < CATCH + 0.9:
                    text(img, 'got it', (x + 200, gy - 500), 60, t, seed=33)
            if SELF + 0.5 <= t < SELF + 1.1:
                top = (A['top'][0], A['top'][1] + 18)
                arrow(pen, (top[0] + 6, top[1] + 22), 92, L=140); stars(pen, top, SELF + 0.5, t)
                text(img, 'bonk', (x + 250, gy - 540), 92, t, seed=34)
        return
    # ---- draw, thumbs, the real opponent
    A = stickman(pen, AX, LY, S, t, arms=((150, 170), (-20, 40)) if THUMBS <= t else ((100, 100), (-30, 20)), torso_lean=4,
                 mouth='flat' if t < WON else 'smile', drool=t >= WON, eyes='derp', look=(0.0, 0.0) if t < WALKIN else (0.9, 0.0), **STEVE)
    g = A['hands'][0]; bow(pen, (g[0] + 4, g[1] - 8), 80, 90)
    if THUMBS <= t:
        th = A['hands'][0]; pen.line([th, (th[0] + 6, th[1] - 46)], 10)              # thumb up
        th2 = A['hands'][1]; pen.line([th2, (th2[0] + 6, th2[1] + 46)], 10)         # thumb down
        if t < THUMBS + 1.6:
            text(img, 'nice.', (AX + 230, LY - 560), 54, t, seed=35); text(img, 'boo.', (AX - 150, LY - 380), 54, t, seed=36)
    if t >= WALKIN:
        kk = span(t, WALKIN, WALKIN + 1.2)
        x = lerp(W + 120, BX, kk)
        opp(pen, t, x=x, face=dict(mouth='flat', drool=False, eyes='derp', seed=3, look=(0.9, 0.0)), arms=((40, -15), (-25, 30)))
        if t >= MISS:
            say(img, (BX, RY - 360), 'what did i miss.', t, 37, 60)
    if t >= WON:
        say(img, (AX + 110, LY - 460), 'i won.', t, 38, 76)
    if t >= LOST:
        say(img, (AX + 110, LY - 360), 'and lost.', t, 39, 64)


CUES = [(0.0, 'slam', 0.6), (LOOK, 'tick', 0.5), (SHRUG, 'wrong', 0.5), (FIRE0 - 1.2, 'creak'), (FIRE0, 'twang'), (FIRE0 + 0.05, 'whoosh', 0.6), (FIRE0 + 0.4, 'thock', 0.8),
        (ARRIVE, 'thud', 0.7), (CATCH + 0.45, 'tick', 0.9), (CATCH + 0.5, 'pop', 0.7), (SELF + 0.5, 'bonk', 1.3), (ZERO, 'slam'), (ZERO + 0.3, 'lose', 0.8),
        (THUMBS, 'toot_hi', 0.4), (THUMBS + 0.3, 'toot_lo', 0.4), (WALKIN + 0.3, 'step', 0.8), (WALKIN + 0.6, 'step', 0.8), (WALKIN + 0.9, 'step', 0.8),
        (MISS, 'toot_lo', 0.4), (WON, 'toot_hi', 0.4), (LOST, 'toot_lo', 0.5)] + \
       [(ts - 0.5, 'creak', 0.6) for ts, _ in SHOTS] + [(ts, 'twang') for ts, _ in SHOTS] + [(ts + 0.35, 'thock', 0.8) for ts, _ in SHOTS if ts < CATCH] + \
       [(ts + 0.2, 'step', 0.5) for ts, _ in SHOTS]
RESTS = [(0, SHRUG + 0.4), (SELF + 0.5, SELF + 1.0), (ZERO, THUMBS + 0.2), (MISS, LOST + 0.9), (TITLE - 0.3, DUR)]


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if '--sheet' in sys.argv:
        B.sheet(frame, DUR, os.path.join(BUILD, 'derpyC_sheet.jpg')); return
    wav = os.path.join(BUILD, 'derpyC.wav')
    # the band speeds up with him: three passes with shorter beats, stitched by the rests
    B.render(wav, DUR, CUES, RESTS + [(LOOP + 4.0, ZERO)], band_from=SHRUG + 0.4, title=TITLE, beat=0.3)
    import numpy as np
    from scipy.io import wavfile
    sr, base = wavfile.read(wav)
    tmp = os.path.join(BUILD, 'derpyC_fast.wav')
    B.render(tmp, DUR, [], [(0, LOOP + 4.0), (ZERO, DUR)], band_from=LOOP + 4.0, band_to=ZERO, title=None, beat=0.2, swing_from=LOOP + 9.0)
    _, fast = wavfile.read(tmp)
    mix = base.astype(np.float64) + fast.astype(np.float64) * 0.9
    mix = np.tanh(mix / 32767 * 0.9); mix /= max(1e-6, np.abs(mix).max()); mix *= 0.85
    wavfile.write(wav, sr, (mix * 32767).astype(np.int16))
    out = os.path.join(OUT, 'bonkbow-C-vs-himself.mp4'); B.encode(frame, DUR, wav, out); print('wrote', out)


if __name__ == '__main__':
    main()
