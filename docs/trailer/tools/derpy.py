"""BONK BOW, derpy cut: five seconds of crude, hand-scrawled stickmen who cannot do archery.
Everything is drawn in code (Pillow) in a wobbly MS-Paint line that "boils" from frame to frame,
with a synthesised oom-pah and sound effects. Writes out/bonkbow-5s.mp4.

    python3 tools/derpy.py            # the film
    python3 tools/derpy.py --sheet    # build/derpy_sheet.jpg, a frame every 0.25 s
"""
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILER = os.path.join(HERE, '..'); ROOT = os.path.join(TRAILER, '..', '..')
BUILD = os.path.join(TRAILER, 'build'); OUT = os.path.join(TRAILER, 'out')
W, H, FPS, DUR = 1920, 1080, 30, 5.0
GROUND = 940
INK = (12, 12, 12)
PAPER = (255, 255, 255)
DROOL = (120, 190, 240)
FONT = '/System/Library/Fonts/Supplemental/Comic Sans MS Bold.ttf'


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def ease(k):
    k = clamp(k); return k * k * (3 - 2 * k)


def span(t, a, b):
    """0 before a, 1 after b, eased between."""
    return ease((t - a) / (b - a)) if b > a else float(t >= b)


def lerp(a, b, k):
    return a + (b - a) * k


def lp(p, q, k):
    return (lerp(p[0], q[0], k), lerp(p[1], q[1], k))


# ---- the wobbly line ----------------------------------------------------------------------------------
class Pen:
    """Draws like an unsteady mouse: every stroke is resampled and nudged, and the nudge changes
    every third frame, so held drawings shimmer."""

    def __init__(self, img, frame):
        self.d = ImageDraw.Draw(img)
        self.img = img
        self.boil = frame // 3
        self.n = 0

    def _wob(self, pts, amp, closed=False):
        self.n += 1
        rnd = random.Random(self.n * 7919 + self.boil * 104729)
        out = []
        P = list(pts) + ([pts[0]] if closed else [])
        for a, b in zip(P, P[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            steps = max(1, int(L / 22))
            for i in range(steps):
                k = i / steps
                out.append((lerp(a[0], b[0], k) + rnd.uniform(-amp, amp), lerp(a[1], b[1], k) + rnd.uniform(-amp, amp)))
        out.append(P[-1] if not closed else out[0])
        return out

    def line(self, pts, w=9, col=INK, amp=3.0):
        self.d.line(self._wob(pts, amp), fill=col, width=w, joint='curve')
        for p in (pts[0], pts[-1]):
            self.d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=col)

    def blob(self, pts, w=9, fill=PAPER, col=INK, amp=3.5):
        q = self._wob(pts, amp, closed=True)
        self.d.polygon(q, fill=fill)
        self.d.line(q + [q[0], q[1]], fill=col, width=w, joint='curve')

    def dot(self, p, r, col=INK):
        self.d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=col)

    def arc(self, c, r, a0, a1, w=9, col=INK, n=14, amp=2.5, sy=1.0):
        self.line([(c[0] + math.cos(math.radians(lerp(a0, a1, i / n))) * r, c[1] + math.sin(math.radians(lerp(a0, a1, i / n))) * r * sy) for i in range(n + 1)], w, col, amp)


def rot(p, deg, o=(0, 0)):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * c - y * s, o[1] + x * s + y * c)


def limb(a, ang1, l1, ang2, l2):
    """Two-bone limb from a: angles in degrees, 0 = straight down, positive = toward +x."""
    b = (a[0] + math.sin(math.radians(ang1)) * l1, a[1] + math.cos(math.radians(ang1)) * l1)
    c = (b[0] + math.sin(math.radians(ang2)) * l2, b[1] + math.cos(math.radians(ang2)) * l2)
    return [a, b, c]


# ---- heads: lumpy, smooth, vacant ------------------------------------------------------------------------
HEADS = {
    # outlines in head units (about -1..1), y down; origin at the neck
    'bean': [(-0.95, -0.25), (-1.05, -0.95), (-0.6, -1.15), (-0.1, -0.85), (0.5, -1.05), (1.15, -1.35), (1.3, -0.8), (1.05, -0.2), (0.45, 0.05), (-0.4, 0.05)],
    'pea': [(-0.3, 0.0), (-0.42, -0.35), (-0.25, -0.62), (0.1, -0.68), (0.4, -0.5), (0.42, -0.15), (0.2, 0.02)],
    'slab': [(-1.0, 0.0), (-1.2, -0.5), (-0.9, -1.0), (-0.2, -1.2), (0.6, -1.15), (1.2, -0.75), (1.25, -0.3), (0.9, 0.05)],
}


def head(pen, kind, neck, s, tilt, t, look=(0, 0), mouth='smile', drool=True, flip=1, eyes='derp', seed=0):
    def P(x, y):
        return rot((neck[0] + x * s * flip, neck[1] + y * s), tilt * flip, neck)
    pen.blob([P(x, y) for x, y in HEADS[kind]])
    if kind == 'bean':
        e1, e2, mo = (-0.35, -0.52), (0.72, -0.78), (0.2, -0.3)
    elif kind == 'pea':
        e1, e2, mo = (-0.14, -0.4), (0.18, -0.42), (0.03, -0.2)
    else:
        e1, e2, mo = (-0.45, -0.62), (0.55, -0.6), (0.05, -0.28)
    er = 0.15 if kind != 'pea' else 0.085
    # each eye minds its own business
    wander = [(math.sin(t * 2.1 + seed) * 0.55 + look[0], math.cos(t * 1.3 + seed) * 0.4 + look[1]),
              (math.sin(t * 1.4 + 2 + seed) * 0.55 - look[0] * 0.3, math.cos(t * 2.6 + 1 + seed) * 0.4 + look[1])]
    for (ex, ey), (wx, wy), big in zip((e1, e2), wander, (1.0, 1.25)):
        c = P(ex, ey)
        if eyes == 'shut':
            pen.line([P(ex - er, ey), P(ex + er, ey)], 7, amp=1.5)
            continue
        r = er * s * big
        pen.blob([(c[0] + math.cos(a) * r * 1.25, c[1] + math.sin(a) * r * 0.85) for a in [i * math.tau / 9 for i in range(9)]], w=6, amp=1.6)
        pr = r * (0.5 if eyes != 'wide' else 0.3)
        pen.dot((c[0] + clamp(wx, -1, 1) * r * 0.55, c[1] + clamp(wy, -1, 1) * r * 0.3), pr)
    # eyelids: heavy, uneven
    if eyes == 'derp':
        pen.line([P(e1[0] - er * 1.4, e1[1] - er * 0.75), P(e1[0] + er * 1.5, e1[1] - er * 0.2)], 7, amp=1.5)
        pen.line([P(e2[0] - er * 1.7, e2[1] - er * 0.35), P(e2[0] + er * 1.7, e2[1] - er * 0.9)], 7, amp=1.5)
    mw = 0.55 if kind != 'pea' else 0.2
    if mouth == 'smile':
        pen.line([P(mo[0] - mw, mo[1] - 0.05), P(mo[0] - mw * 0.2, mo[1] + 0.12), P(mo[0] + mw * 0.7, mo[1] + 0.02), P(mo[0] + mw, mo[1] - 0.18)], 13, amp=2)
    elif mouth == 'o':
        c = P(mo[0], mo[1] + 0.02)
        pen.blob([(c[0] + math.cos(a) * s * 0.16, c[1] + math.sin(a) * s * 0.2) for a in [i * math.tau / 8 for i in range(8)]], w=8, fill=INK, amp=2)
    elif mouth == 'chew':
        k = math.sin(t * 22) * 0.06
        pen.line([P(mo[0] - mw * 0.8, mo[1] + k), P(mo[0], mo[1] + 0.1 - k), P(mo[0] + mw * 0.8, mo[1] + k)], 12, amp=2)
    if drool:
        dl = 0.25 + 0.18 * (math.sin(t * 3 + seed) * 0.5 + 0.5)
        for dx in (-0.04, 0.05):
            a = P(mo[0] - mw * 0.25 + dx, mo[1] + 0.12)
            pen.line([a, (a[0] + 2, a[1] + dl * s)], 5, DROOL, amp=1.5)


def stickman(pen, x, gy, s, t, kind='bean', torso_lean=0.0, arms=((-20, 30), (25, -15)), legs=((-14, 6), (16, -4)), neck_len=0.25, head_tilt=0.0,
             hop=0.0, flip=1, lying=0.0, **face):
    """Returns the hands and head-top so props can be attached. `lying` 0..1 tips him onto his back."""
    leg, tor, arm = 190 * s, 230 * s, 150 * s
    hip = (x, gy - leg * 0.96 - hop)
    piv = (x, gy)

    def T(p):
        # tip over backwards about the hips, which drop to the ground; the legs end up in the air
        if not lying:
            return p
        q = rot(p, -88 * lying * flip, hip)
        return (q[0], q[1] + (gy - hip[1] - 14) * lying)
    sh = (hip[0] + math.sin(math.radians(torso_lean)) * tor * flip, hip[1] - math.cos(math.radians(torso_lean)) * tor)
    neck = (sh[0] + math.sin(math.radians(torso_lean)) * tor * neck_len * flip, sh[1] - tor * neck_len)
    pen.line([T(hip), T(sh), T(neck)], 11)
    for (a1, a2) in legs:
        pen.line([T(p) for p in limb(hip, a1 * flip, leg * 0.5, a2 * flip, leg * 0.5)], 11)
    hands = []
    for (a1, a2) in arms:
        L = [T(p) for p in limb((sh[0], sh[1] + 12 * s), a1 * flip, arm * 0.5, a2 * flip, arm * 0.5)]
        pen.line(L, 10)
        hands.append(L[2])
    n = T(neck)
    head(pen, kind, n, 135 * s, head_tilt - 88 * lying, t, flip=flip, **face)
    return dict(hands=hands, neck=n, hip=T(hip), sh=T(sh), top=rot((n[0], n[1] - 150 * s), (head_tilt - 88 * lying) * flip, n))


def bow(pen, grip, ang, size=150, pull=0.0, string=True):
    """A bow held at `grip`, its belly facing `ang` degrees (0 = right)."""
    pts = [(-math.cos(math.radians(a)) * size * 0.34 + size * 0.34, math.sin(math.radians(a)) * size) for a in (-78, -45, 0, 45, 78)]
    q = [rot((grip[0] + px, grip[1] + py), ang, grip) for px, py in pts]
    pen.line(q, 9, (120, 70, 30))
    if string:
        pen.line([q[0], rot((grip[0] - pull * size * 0.8 + size * 0.28, grip[1]), ang, grip), q[-1]], 4, amp=1.2)
    return q


def arrow(pen, tip, ang, L=210, col=INK):
    """An arrow with its tip at `tip`, pointing along `ang` degrees."""
    tail = (tip[0] - math.cos(math.radians(ang)) * L, tip[1] - math.sin(math.radians(ang)) * L)
    pen.line([tail, tip], 7, (150, 95, 45), amp=1.6)
    for da in (150, -150):
        pen.line([tip, (tip[0] + math.cos(math.radians(ang + da)) * 30, tip[1] + math.sin(math.radians(ang + da)) * 30)], 7, amp=1.2)
    for k in (0.0, 0.1):
        b = lp(tail, tip, k)
        for da in (140, -140):
            pen.line([b, (b[0] + math.cos(math.radians(ang + da)) * 26, b[1] + math.sin(math.radians(ang + da)) * 26)], 5, (210, 40, 40), amp=1.2)
    return tail


def stars(pen, c, t0, t, n=7, r=120):
    k = (t - t0) / 0.45
    if 0 <= k <= 1:
        for i in range(n):
            a = i * math.tau / n + 0.3
            p0 = (c[0] + math.cos(a) * r * (0.35 + 0.5 * k), c[1] + math.sin(a) * r * (0.35 + 0.5 * k))
            p1 = (c[0] + math.cos(a) * r * (0.7 + 0.6 * k), c[1] + math.sin(a) * r * (0.7 + 0.6 * k))
            pen.line([p0, p1], 8, amp=1.5)


def text(img, s, xy, size, t, col=INK, wob=5, seed=0):
    """Scrawled lettering: each letter jitters and tilts on its own."""
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, size)
    widths = [d.textlength(c, font=f) for c in s]
    x = xy[0] - sum(widths) / 2
    for i, (c, w) in enumerate(zip(s, widths)):
        rnd = random.Random(seed * 131 + i * 17 + int(t * FPS) // 3)
        tile = Image.new('RGBA', (int(w) + 60, size + 80), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((30, 20), c, font=f, fill=col + (255,), stroke_width=3, stroke_fill=col + (255,))
        tile = tile.rotate(rnd.uniform(-7, 7), resample=Image.BICUBIC)
        img.paste(tile, (int(x - 30 + rnd.uniform(-wob, wob)), int(xy[1] - 20 + rnd.uniform(-wob, wob))), tile)
        x += w


# ---- the five seconds --------------------------------------------------------------------------------------
T_RAISE, T_LOOSE, T_PEAK, T_BONK, T_TITLE = 0.9, 2.05, 2.75, 3.45, 3.95


def frame(t, f):
    img = Image.new('RGB', (W, H), PAPER)
    pen = Pen(img, f)
    # the ground: one unsteady line, a few scribbled tufts
    pen.line([(-20, GROUND + 6), (500, GROUND - 4), (1100, GROUND + 8), (W + 20, GROUND)], 9)
    for gx in (210, 640, 1010, 1490, 1760):
        pen.line([(gx, GROUND), (gx - 14, GROUND - 34)], 6); pen.line([(gx + 6, GROUND), (gx + 22, GROUND - 28)], 6)
    # a wobbly sun, because every drawing has one
    pen.blob([(1790 + math.cos(a) * 70, 130 + math.sin(a) * 70) for a in [i * math.tau / 10 for i in range(10)]], w=8)
    for i in range(8):
        a = i * math.tau / 8 + t * 0.4
        pen.line([(1790 + math.cos(a) * 92, 130 + math.sin(a) * 92), (1790 + math.cos(a) * 128, 130 + math.sin(a) * 128)], 7)

    fall = span(t, T_LOOSE, T_LOOSE + 0.28)                       # the recoil lays him out
    raise_ = span(t, T_RAISE, T_RAISE + 0.5)
    pull = span(t, T_RAISE + 0.45, T_LOOSE - 0.1) * (1 - span(t, T_LOOSE, T_LOOSE + 0.05))
    bonk = t >= T_BONK
    # --- C: far off, facing the wrong way, arguing with a tuft of grass
    stickman(pen, 150, GROUND - 6, 0.62, t, kind='slab', flip=-1, torso_lean=8 + math.sin(t * 5) * 4, head_tilt=math.sin(t * 9) * 14,
             arms=((70 + math.sin(t * 11) * 25, 110), (40, 20)), mouth='o', drool=False, eyes='wide', seed=5)
    # --- B: eating an arrow like corn; stops to watch the sky
    bx = 1540
    watching = span(t, T_LOOSE + 0.15, T_LOOSE + 0.4) * (1 - span(t, T_BONK, T_BONK + 0.2))
    chew = 1 - watching
    B = stickman(pen, bx, GROUND, 1.12, t, kind='pea', neck_len=0.62 + 0.25 * watching, head_tilt=lerp(math.sin(t * 20) * 5 * chew, -38, watching) + (10 * math.sin(t * 30) if bonk and t < T_BONK + 0.4 else 0),
                 arms=((-55, -150 + 10 * math.sin(t * 20) * chew), (60, 150 - 10 * math.sin(t * 20) * chew)),
                 legs=((-10, 4), (22, -10)), look=(0, -1.2 * watching), mouth='chew' if (chew > 0.5 and not bonk) else ('smile' if bonk else 'o'), drool=chew > 0.5, eyes='derp' if chew > 0.5 else 'wide', seed=2,
                 hop=(abs(math.sin((t - T_BONK) * 14)) * 26 if bonk else 0))
    if chew > 0.5 and not bonk:
        m = (B['neck'][0] + 6, B['neck'][1] - 36)
        arrow(pen, (m[0] + 120, m[1] + 4), 3, L=240)
    else:
        arrow(pen, (B['hands'][1][0] + 20, B['hands'][1][1] - 130), -80, L=170)        # half an arrow, forgotten in his fist
    # --- A: the archer. Holds the bow backwards, belly to his own face.
    ax = 900
    A = stickman(pen, ax, GROUND, 1.28, t, kind='bean', lying=fall, torso_lean=lerp(4, -10, raise_) * (1 - fall),
                 head_tilt=lerp(math.sin(t * 2.2) * 6, -8, raise_) + (math.sin(t * 34) * 9 if bonk and t < T_BONK + 0.35 else 0),
                 arms=((lerp(-24, -96, raise_) + 55 * fall, lerp(20, -100, raise_) + 70 * fall), (lerp(22, -62 + 30 * pull, raise_) - 100 * fall, lerp(-12, -128 + 40 * pull, raise_) - 60 * fall)),
                 legs=((lerp(-14, -24, raise_) + (math.sin(t * 16) * 34 if fall > 0.9 else 0), 6 + 40 * fall), (lerp(16, 24, raise_) + (math.cos(t * 16) * 34 if fall > 0.9 else 0), -4 - 50 * fall)),
                 mouth='smile', drool=True, eyes='shut' if (bonk and t < T_BONK + 0.5) else 'derp', seed=0,
                 look=(0.3, -1.0 * span(t, T_LOOSE + 0.2, T_LOOSE + 0.5) * (1 - span(t, T_BONK, T_BONK + 0.2))))
    grip = A['hands'][0]
    if t < T_LOOSE:
        # bow up, the wrong way round: the string is on the far side and the arrow points at the sky
        ang = lerp(80, 180 - 70 * span(t, T_RAISE + 0.5, T_LOOSE), raise_)
        bow(pen, grip, ang, 190, pull=pull * 0.9)
        if raise_ > 0.6:
            arrow(pen, (grip[0] + 18 + math.sin(t * 40) * 3 * pull, grip[1] - 190 + 40 * pull), -88, L=250)
    else:
        # the bow leaves; so does the arrow, straight up
        k = (t - T_LOOSE)
        bx2, by2 = grip[0] - 200 * min(k, 1.2) * 2.2, grip[1] - 520 * k + 900 * k * k
        if by2 < H + 200 and t < T_LOOSE + 1.3:
            bow(pen, (ax + 160 + 420 * k, GROUND - 420 - 620 * k + 1150 * k * k), 180 + k * 900, 190)
    # the arrow's trip: up out of frame, a pause, then down onto A's smooth head
    top = A['top']
    top = (top[0], top[1] - 62)        # the arrow only pokes into the top of his head: a bonk, nothing worse
    if T_LOOSE <= t < T_PEAK:
        k = (t - T_LOOSE) / (T_PEAK - T_LOOSE)
        arrow(pen, (ax + 20, lerp(GROUND - 640, -300, 1 - (1 - k) ** 2)), -90, L=250)
        for i in range(3):
            yy = lerp(GROUND - 380, 60, k) + i * 70
            pen.line([(ax + 60 + i * 14, yy), (ax + 60 + i * 14, yy + 46)], 5, amp=1.5)
    elif T_PEAK + 0.25 <= t < T_BONK:
        k = (t - T_PEAK - 0.25) / (T_BONK - T_PEAK - 0.25)
        arrow(pen, lp((top[0] + 30, -240), top, k * k), 92, L=250)
    elif bonk:
        wob = math.sin((t - T_BONK) * 38) * 16 * math.exp(-(t - T_BONK) * 5)
        arrow(pen, (top[0] + 8, top[1] + 30), 92 + wob, L=250)
        stars(pen, top, T_BONK, t)
        if t < T_BONK + 0.5:
            text(img, 'bonk', (top[0] + 250, top[1] - 150), 92, t, seed=3)
        # thumbs up from the floor
        th = (A['sh'][0] + 40, A['sh'][1] - 150)
        pen.line([A['sh'], lp(A['sh'], th, 0.6), th], 10)
        pen.line([th, (th[0] + 6, th[1] - 46)], 10)
    # question mark over B while he watches
    if 0.2 < watching and t < T_BONK:
        text(img, '?', (B['neck'][0] + 150, B['neck'][1] - 330), 130, t, seed=9)
    # the title, scrawled
    if t >= T_TITLE:
        k = span(t, T_TITLE, T_TITLE + 0.12)
        pad = Image.new('RGB', (W, H), PAPER)
        img.paste(pad, (0, 0), Image.new('L', (W, H), 0))
        text(img, 'BONK BOW', (720, 40 + (1 - k) * -260), 190, t, seed=1, wob=7)
        if t >= T_TITLE + 0.3:
            text(img, 'aim.  sort of.', (720, 290), 84, t, seed=2, wob=4)
    return img


# ---- sound ---------------------------------------------------------------------------------------------------
def audio(path):
    SR = 44100; n = int(DUR * SR); out = np.zeros(n)
    rng = np.random.RandomState(4)

    def tt(d):
        return np.arange(int(d * SR)) / SR

    def add(x, t, g=1.0):
        i = int(t * SR); x = x[:max(0, n - i)]; out[i:i + len(x)] += x * g

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

    def game(name):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'assets', 'audio', 'sfx', name + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             capture_output=True).stdout
        return np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    # a wonky oom-pah, slightly out of tune with itself
    beat = 0.3
    for i in range(int(T_TITLE / beat)):
        add(tuba(36 if i % 2 == 0 else 43), i * beat, 0.5)
        if i % 2 == 1:
            add(toot(64 + (i % 3)), i * beat, 0.25); add(toot(67.3), i * beat, 0.2)
    for i, m in enumerate((72, 74, 71.6, 76, 72.4, 79, 77, 74.5)):
        add(toot(m, 0.2), 0.15 + i * 0.3 + (0.04 if i % 3 == 0 else 0), 0.35)
    add(game('draw_start'), T_RAISE + 0.4, 0.8)
    add(game('bow_release'), T_LOOSE, 1.0)
    add(slide(300, 2200, T_PEAK - T_LOOSE), T_LOOSE, 0.8)              # up it goes
    add(game('body_drop'), T_LOOSE + 0.22, 0.9)
    add(slide(2200, 250, T_BONK - T_PEAK - 0.25), T_PEAK + 0.25, 0.8)  # and back
    t = tt(0.35)
    add(np.sin(2 * np.pi * np.cumsum(180 + 500 * np.exp(-t * 30)) / SR) * np.exp(-t * 12), T_BONK, 1.2)   # bonk
    add(game('emote_pop'), T_BONK + 0.02, 0.9)
    add(game('laugh'), T_BONK + 0.25, 0.5)
    for i, m in enumerate((48, 55, 60, 64, 67, 72)):                   # the title: a proud, wrong fanfare
        add(tuba(m, 0.5), T_TITLE + i * 0.045, 0.5)
    add(toot(83.4, 0.6), T_TITLE + 0.3, 0.3)
    out = np.tanh(out * 0.9); out /= max(1e-6, np.abs(out).max()); out *= 0.85
    out[-int(0.08 * SR):] *= np.linspace(1, 0, int(0.08 * SR))
    wavfile.write(path, SR, (out * 32767).astype(np.int16))


def main():
    os.makedirs(BUILD, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    N = int(DUR * FPS)
    if '--sheet' in sys.argv:
        ts = [i * 0.25 for i in range(int(DUR / 0.25))]
        sh = Image.new('RGB', (384 * 5, 216 * 4))
        for i, t in enumerate(ts):
            sh.paste(frame(t, int(t * FPS)).resize((384, 216), Image.LANCZOS), ((i % 5) * 384, (i // 5) * 216))
        sh.save(os.path.join(BUILD, 'derpy_sheet.jpg'), quality=88)
        return
    wav = os.path.join(BUILD, 'derpy.wav'); audio(wav)
    out = os.path.join(OUT, 'bonkbow-5s.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav,
                          '-af', 'loudnorm=I=-15:TP=-2:LRA=11', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                          '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(N):
        p.stdin.write(frame(f / FPS, f).tobytes())
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
