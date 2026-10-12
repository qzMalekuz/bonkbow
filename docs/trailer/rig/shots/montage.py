"""Shared staging for the "four more days" montage: a training line-up of derps, props, and the
title-card frames (painted with Pillow, not rendered) for the cards between days."""
import math
import os

import bpy

import actions as A
import arenas as AR
import derp as D
import scene as S
import shotkit as K
from common import BUILD, hexc, key_loc, key_rot, key_scale, principled

CAST_KIND = {'a': 'bean', 'b': 'pea', 'c': 'slab', 'd': 'egg', 'e': 'pea', 'f': 'bean', 'k': 'slab'}


def spawn(ch, shot, seconds, loc=(0, 0, 0), yaw=0.0, name=None):
    return D.spawn(name or ch, CAST_KIND[ch], shot, ch, seconds, loc=loc, yaw=yaw)


def target_row(col, xs, y=8.0, z=1.0):
    from props import build_target
    out = []
    for i, x in enumerate(xs):
        tg = build_target('target_%d' % i, col, 0.5)
        tg.location = (x, y, z); tg.rotation_euler = (0, 0, 0)
        out.append(tg)
    return out


def whistle_coach(ch, shot, seconds, loc, yaw=180):
    """The coach: a slab head, a cap, a whistle on a string, a clipboard. Also an idiot."""
    h = spawn(ch, shot, seconds, loc=loc, yaw=yaw)
    b = AR.Batch('coach_kit')
    felt = AR.mat('cap_felt', '#C83A3A', rough=0.7)
    b.cyl(felt, (0, 0, 0.0), 0.33, 0.12, segs=20)
    b.cyl(felt, (0, 0, 0.14), 0.3, 0.16, segs=20, radius2=0.26)
    b.box(felt, (0, -0.36, -0.02), (0.5, 0.3, 0.03))
    parts = b.finish(smooth=True)
    cap = bpy.data.objects.new('cap', None); bpy.context.scene.collection.objects.link(cap)
    for p in parts:
        p.parent = cap
    K.follow_bone(cap, h, 'Head', (0, 0.74, 0.02))
    cap.rotation_euler = (math.radians(-90), 0, 0)
    h['cap'] = cap
    return h


def day_card(day, line, seconds, name):
    """Frames for a day card: big scrawled 'DAY 2', a line under it, on paper, with the ink boil."""
    import sys
    sys.path.insert(0, os.path.join(BUILD, '..', 'tools'))
    from PIL import Image
    from derpy import FPS, H, PAPER, W, Pen, text
    out = os.path.join(BUILD, 'shots', name); os.makedirs(out, exist_ok=True)
    n = int(round(seconds * FPS))
    for f in range(1, n + 1):
        t = (f - 1) / FPS
        img = Image.new('RGB', (W, H), (12, 12, 14))
        text(img, day, (W / 2, 330), 210, t, col=(246, 244, 238), seed=200 + f // 9, wob=6)
        if t > 0.25:
            text(img, line, (W / 2, 640), 76, t, col=(246, 244, 238), seed=300, wob=2)
        img.save(os.path.join(out, 'f_%04d.png' % f))
    return n
