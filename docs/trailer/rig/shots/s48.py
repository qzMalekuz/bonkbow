"""DERP 08 - BRAND PAYOFF. Black. BONK BOW, and the line. One last arrow flies in and misses
the logo completely. Silence. A beat later it comes down from above. Bonk. Cut."""
import math

import bpy

import arrows
import scene as S
from camera import Cam
from common import hexc, key_loc, key_rot, key_scale, principled
from props import build_arrow
from shots.s24 import FONT, FONT_M, text

START, END = 17.6, 20.0
CUES = [(0.0, 'logo_hit'), (0.85, 'whoosh'), (1.0, 'thock'), (1.0, 'silence'), (1.85, 'bonk')]
LINE = "THEY HAVE BOWS. THAT'S ABOUT IT."


def build():
    S.sky('#000000', '#050308', strength=0.15)
    gold = principled('logo_gold', hexc('#FFC53A'), rough=0.32, emit=hexc('#FF9A1E'), emit_str=0.3)
    white = principled('logo_white', hexc('#F4EFE6'), rough=0.5, emit=hexc('#F4EFE6'), emit_str=0.9)
    logo = text('logo', 'BONK BOW', 1.25, FONT, gold, extrude=0.16, bevel=0.03, loc=(0, 0, 0.45), spacing=1.04)
    tag = text('tag', LINE, 0.25, FONT_M, white, extrude=0.01, bevel=0.0, loc=(0, -0.05, -0.62), spacing=1.18)
    for t, s in ((0.0, 2.6), (0.12, 0.94), (0.2, 1.03), (0.3, 1.0)):
        key_scale(logo, t, s)
    key_scale(tag, 0.0, 0.0, interp='CONSTANT'); key_scale(tag, 0.34, 0.0, interp='CONSTANT'); key_scale(tag, 0.36, 1.0)
    S.area('key', (-3, -6, 3.5), (0, 0, 0.3), '#FFFFFF', 1500, size=6)
    S.area('rim', (4, 2.5, 2.5), (0, 0, 0.3), '#FF7A2A', 2400, size=4)
    S.area('under', (0, -4, -3), (0, 0, 0.3), '#6A8CFF', 500, size=6)
    S.particles('embers', 200, (-7, -1.5, -3), (7, 5, 4), (0.1, 0, 0.45), radius=0.016, color='#FF8A30', emit=40, seed=2, sway=0.15, jitter=0.5)
    # the miss: clean past the end of the word, into the dark
    arrows.shoot('miss', (-9.0, -3.0, 1.6), (5.15, 0.6, -1.25), 0.86, 0.14)
    # ...and a second opinion from above: flat onto the top of the letters, then off
    a = build_arrow('late', bpy.context.scene.collection)
    a.rotation_mode = 'XYZ'
    key_scale(a, 0.0, 0.0, interp='CONSTANT'); key_scale(a, 1.6, 1.0, interp='CONSTANT')
    for t, p, r in ((1.6, (0.6, -0.1, 5.0), (0, 80, 0)), (1.85, (0.9, -0.1, 1.12), (0, 6, 0)), (2.05, (1.5, -0.5, 1.7), (30, -40, 30)), (2.4, (2.4, -1.2, -2.6), (90, -140, 80))):
        key_loc(a, t, p, 'LINEAR'); key_rot(a, t, r, 'LINEAR')
    for t, s in ((1.85, 1.0), (1.88, 1.03), (1.96, 0.99), (2.04, 1.0)):
        key_scale(logo, t, s)
    cam = Cam(lens=50, fstop=8.0)
    cam.dolly(0.0, 2.4, (0, -9.8, 0.1), (0, -9.2, 0.1), (0, 0, 0.02), (0, 0, 0.02), focus0=(0, 0, 0.3), focus1=(0, 0, 0.3))
    cam.shake(0.02, 0.12, 0.2); cam.shake(1.0, 0.03, 0.12); cam.shake(1.85, 0.05, 0.15)
    S.grade(bloom=0.55, vignette=0.5)
