"""Paints the derp stickmen's faces: one square texture per frame, drawn in the same unsteady
ink line as the 2D clip, from the performances in rig/derp_tracks.py. Blender wraps them onto the
3D heads as image sequences.

    python3 tools/derp_faces.py 90        # build/faces/s90_<char>/f_####.png for shot 90
    python3 tools/derp_faces.py all
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'rig'))
import derp_tracks as DT  # noqa: E402

BUILD = os.path.join(HERE, '..', 'build', 'faces')
S = 768
INK = (14, 14, 16, 255)
DROOL = (110, 185, 240, 255)
SKIN = (246, 244, 238, 255)
# where the features sit on each head shape, in texture units (0..1, y down)
LAYOUT = {
    'bean': dict(e1=(0.34, 0.44), e2=(0.68, 0.37), er=0.078, mo=(0.52, 0.66), mw=0.21),
    'pea': dict(e1=(0.42, 0.46), e2=(0.59, 0.45), er=0.05, mo=(0.5, 0.62), mw=0.09),
    'slab': dict(e1=(0.34, 0.42), e2=(0.66, 0.43), er=0.075, mo=(0.5, 0.66), mw=0.19),
    'egg': dict(e1=(0.39, 0.4), e2=(0.62, 0.39), er=0.068, mo=(0.5, 0.66), mw=0.14),
}


class Pen:
    def __init__(self, img, boil, seed):
        self.d = ImageDraw.Draw(img); self.boil = boil; self.n = seed * 1000

    def wob(self, pts, amp):
        self.n += 1
        rnd = random.Random(self.n * 7919 + self.boil * 104729)
        out = []
        for a, b in zip(pts, pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); steps = max(1, int(L / 14))
            for i in range(steps):
                k = i / steps
                out.append((a[0] + (b[0] - a[0]) * k + rnd.uniform(-amp, amp), a[1] + (b[1] - a[1]) * k + rnd.uniform(-amp, amp)))
        out.append(pts[-1])
        return out

    def line(self, pts, w=12, col=INK, amp=2.2):
        q = self.wob(pts, amp)
        self.d.line(q, fill=col, width=w, joint='curve')
        for p in (q[0], q[-1]):
            self.d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=col)

    def blob(self, pts, w=9, fill=(255, 255, 255, 255), col=INK, amp=2.0):
        q = self.wob(pts + [pts[0]], amp)
        self.d.polygon(q, fill=fill)
        self.d.line(q + [q[1]], fill=col, width=w, joint='curve')

    def dot(self, p, r, col=INK):
        self.d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=col)


def paint(kind, p, t, f, seed=0):
    img = Image.new('RGBA', (S, S), SKIN)
    pen = Pen(img, f // 3, seed)
    L = LAYOUT[kind]
    er = L['er'] * S
    eyes = (L['e1'], L['e2'])
    for i, (ex, ey) in enumerate(eyes):
        c = (ex * S, ey * S)
        r = er * (1.0 if i == 0 else 1.22)                      # one eye is always a bit bigger
        pen.blob([(c[0] + math.cos(a) * r * 1.25, c[1] + math.sin(a) * r * 0.9) for a in [k * math.tau / 10 for k in range(10)]], w=9)
        if p['look'] is None:                                    # each eye minds its own business
            lx = math.sin(t * (2.1 if i == 0 else 1.4) + i * 2 + seed) * 0.6
            ly = math.cos(t * (1.3 if i == 0 else 2.6) + i + seed) * 0.5
        else:
            lx, ly = p['look']
        lx += p['cross'] * (0.9 if i == 0 else -0.9)
        lx = max(-1, min(1, lx)); ly = max(-1, min(1, ly))
        pen.dot((c[0] + lx * r * 0.62, c[1] + ly * r * 0.42), r * 0.42)
        # the lid: a heavy line that sinks over the eye, never level with the other one
        lid = p['lids']
        if lid > 0.02:
            y = c[1] - r * 0.95 + lid * r * 1.25
            tilt = (0.25 if i == 0 else -0.3) + p['brow'] * (0.5 if i == 0 else -0.5)
            a = (c[0] - r * 1.5, y - tilt * r * 0.7); b = (c[0] + r * 1.5, y + tilt * r * 0.7)
            ImageDraw.Draw(img).polygon([(a[0], a[1] - r * 1.6), (b[0], b[1] - r * 1.6), b, a], fill=SKIN)
            pen.line([a, b], 11)
    mo = (L['mo'][0] * S, L['mo'][1] * S); mw = L['mw'] * S
    m = p['mouth']
    if m == 'smile':
        pen.line([(mo[0] - mw, mo[1] - 8), (mo[0] - mw * 0.3, mo[1] + 16), (mo[0] + mw * 0.6, mo[1] + 6), (mo[0] + mw, mo[1] - 22)], 16)
    elif m == 'grin':
        top = [(mo[0] - mw * 1.25, mo[1] - 26), (mo[0], mo[1] - 8), (mo[0] + mw * 1.25, mo[1] - 40)]
        bot = [(mo[0] + mw * 1.05, mo[1] + 20), (mo[0], mo[1] + 46), (mo[0] - mw * 1.0, mo[1] + 30)]
        pen.blob(top + bot, w=12)
        for k in (-0.6, -0.2, 0.2, 0.6):                         # teeth, roughly
            x = mo[0] + mw * k
            pen.line([(x, mo[1] - 20 - k * 8), (x + 2, mo[1] + 34)], 6, amp=1.5)
    elif m == 'flat':
        pen.line([(mo[0] - mw * 0.8, mo[1]), (mo[0] + mw * 0.8, mo[1] + 4)], 15)
    elif m == 'o':
        pen.blob([(mo[0] + math.cos(a) * mw * 0.34, mo[1] + 8 + math.sin(a) * mw * 0.44) for a in [k * math.tau / 9 for k in range(9)]], w=10, fill=INK)
    elif m == 'tiny':
        pen.line([(mo[0] - mw * 0.2, mo[1] + 2), (mo[0] + mw * 0.2, mo[1])], 14)
    if p['drool'] > 0.05:
        dl = (0.07 + 0.05 * (math.sin(t * 3 + seed) * 0.5 + 0.5)) * S * p['drool']
        for dx in (-10, 12):
            a = (mo[0] - mw * 0.3 + dx, mo[1] + 22)
            pen.line([a, (a[0] + 3, a[1] + dl)], 8, DROOL, amp=1.5)
    return img


def render(shot, cast, seconds):
    """cast: {char: head kind}. Writes one sequence per character."""
    n = int(round(seconds * DT.FPS))
    for ci, (char, kind) in enumerate(sorted(cast.items())):
        out = os.path.join(BUILD, 's%02d_%s' % (shot, char)); os.makedirs(out, exist_ok=True)
        track = DT.TRACKS[shot][char]
        for f in range(1, n + 1):
            t = (f - 1) / DT.FPS
            paint(kind, DT.sample(track, t), t, f, seed=ci + 1).save(os.path.join(out, 'f_%04d.png' % f))
    print('faces: shot', shot, sorted(cast), n, 'frames')


if __name__ == '__main__':
    import derp_cast as DC
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for shot, (cast, seconds) in sorted(DC.CAST.items()):
        if which == 'all' or int(which) == shot:
            render(shot, cast, seconds)
