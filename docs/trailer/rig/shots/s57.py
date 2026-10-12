"""DAY 4 - UNISON. The colosseum, braziers lit, drums. Six derps in a line draw together, slow
and solemn, the finest they have ever looked. They release as one. Every arrow goes straight up."""
import math

import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from shots.montage import spawn

START, END = 13.6, 16.6
CUES = [(0.0, 'braam'), (0.3, 'creak_long'), (2.3, 'twang'), (2.35, 'whoosh')]
XS = [-3.4, -2.04, -0.68, 0.68, 2.04, 3.4]
Y = 4.0
T_REL = 2.3


def cast(shot, seconds, pitch=84):
    hs = []
    for ch, x in zip('abcdef', XS):
        h = spawn(ch, shot, seconds, loc=(x, Y, 0), yaw=-90)
        hs.append(h)
    return hs


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.2)
    hs = cast(57, END - START)
    for i, h in enumerate(hs):
        A.apply(h, A.P_aim(0.3, pitch=84, head_yaw=70), 0.0); A.apply(h, A.P_aim(1.0, pitch=84, head_yaw=70), 1.9); A.apply(h, A.P_aim(1.0, pitch=84, head_yaw=70), T_REL - 0.03)
        A.apply(h, A.P_shoot(pitch=84, head_yaw=70), T_REL + 0.05, interp='LINEAR'); A.apply(h, A.P_shoot(pitch=84, head_yaw=70), 3.0)
        A.nocked(h, 0.0, True); A.nocked(h, T_REL, False)
        K.key_light((XS[i], Y, 1.2), offset=(-0.8, -5.5, 2.2), color='#FFD0A0', energy=420, size=1.6, name='key_%d' % i)
    K.at_frame(T_REL)
    for i, h in enumerate(hs):
        tip, d = arrows.release_point(h)
        arrows.shoot('up_%d' % i, tuple(tip), (tip.x + 0.1, tip.y + 0.4, tip.z + 30), T_REL, 0.7, stick=False)
    S.sun('#6E8ED8', (0.0, 0.5, 1.0), energy=0.9, angle=20, name='front_fill')
    cam = Cam(lens=40, fstop=4.0)
    cam.dolly(0.0, T_REL, (-6.0, -2.0, 1.2), (0.0, -2.8, 1.3), (-2.0, Y, 1.1), (0, Y, 1.15), focus0=(-2, Y, 1.2), focus1=(0, Y, 1.2))
    cam.at(T_REL + 0.3, (0, -3.2, 1.0), (0, Y, 2.2), focus=(0, Y, 1.5))
    cam.at(3.0, (0, -3.6, 0.9), (0, Y, 3.0), focus=(0, Y, 1.5))
    S.grade(bloom=0.9, vignette=0.45)
