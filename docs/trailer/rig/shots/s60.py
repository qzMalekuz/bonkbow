"""SUBMITTED. The six celebrate in the colosseum. Fireworks. One firework is an arrow. It finds
someone. Bonk. Nobody minds."""
import math

import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_scale
from shots.s57 import XS, Y, cast

START, END = 23.2, 25.7
CUES = [(0.0, 'cheer'), (0.2, 'firework'), (0.7, 'firework'), (1.2, 'firework'), (1.9, 'bonk')]


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.2)
    hs = cast(60, END - START)
    for i, h in enumerate(hs):
        arm = h['arm']; arm.rotation_euler = (0, 0, 0)
        up = A.P_idle(); up.hand_L = (0.5, -0.1, 2.3); up.hand_R = (-0.5, -0.1, 2.3)
        for k, t in enumerate((0.0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4)):
            A.apply(h, up if k % 2 == 0 else A.P_idle(), t + i * 0.05)
            key_loc(arm, t + i * 0.05, (XS[i], Y, 0.22 if k % 2 == 0 else 0.0))
        K.key_light((XS[i], Y, 1.2), offset=(-0.8, -5.5, 2.2), color='#FFD0A0', energy=420, size=1.6, name='key_%d' % i)
    for j, (t0, x, col) in enumerate(((0.2, -4, '#FF5A5A'), (0.7, 3, '#5AD0FF'), (1.2, -1, '#FFD05A'))):
        K.impact_puff('fw_%d' % j, (x, Y + 6, 9 + j), t0 + 0.4, color=col, n=40, size=0.06, spread=3.0, life=0.9, up=0.0, seed=j)
        K.glint('flash_%d' % j, (x, Y + 6, 9 + j), t0 + 0.4, size=1.5, color=col, life=0.3, strength=120)
    # the one that was an arrow
    K.at_frame(1.0)
    top = K.head_pos(hs[3]); top.z += 0.36
    arrows.shoot('fw_arrow', (top.x + 0.5, top.y + 2, top.z + 9), (top.x, top.y, top.z - 0.05), 1.55, 0.35)
    sk = hs[3]['skull']
    for t, s in ((1.88, (1, 1, 1)), (1.94, (1.07, 1.07, 0.86)), (2.04, (0.97, 0.97, 1.05)), (2.14, (1, 1, 1))):
        key_scale(sk, t, s)
    K.glint('star_h', (top.x, top.y - 0.3, top.z + 0.1), 1.9, size=0.3, color='#FFE8A0', life=0.3)
    S.sun('#6E8ED8', (0.0, 0.5, 1.0), energy=0.9, angle=20, name='front_fill')
    cam = Cam(lens=35, fstop=4.0)
    cam.dolly(0.0, 2.5, (0, -4.6, 1.1), (0, -4.0, 1.2), (0, Y, 1.6), (0, Y, 1.3), focus0=(0, Y, 1.4), focus1=(0, Y, 1.4))
    cam.shake(1.9, 0.03, 0.15)
    S.grade(bloom=1.0, vignette=0.45)
