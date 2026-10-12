"""DERP 06 - SECOND IDIOT. Solemn, at full draw, aiming right. The arrow leaves to the left.
He stays exactly as he was. Then his eyes go after it. Then all of him, slowly. It hits a
target he never knew was there. He celebrates as planned."""
import math

import actions as A
import arenas as AR
import arrows
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from props import build_target

START, END = 13.0, 16.0
CUES = [(0.0, 'braam'), (0.1, 'creak'), (0.6, 'twang'), (0.65, 'whistle'), (1.9, 'thock_big'), (1.9, 'silence'), (2.4, 'pop'), (2.55, 'pop')]
T_REL, T_HIT = 0.6, 1.9
HX = 1.7
TGT = (-2.9, 0.25, 1.0)


def build():
    env = AR.build_golden_meadow(sunset=True, grass_height=0.28, grass_density=200, grass_y=(-6, 5), grass_x=(-8, 7), fence_y=7.0)
    tg = build_target('target', env['col'], 0.55)
    tg.location = TGT; tg.rotation_euler = (0, 0, math.pi / 2)
    c = D.spawn('c', 'egg', 46, 'c', END - START, loc=(HX, 0, 0), yaw=0)
    nk = c['nocked']
    nk.rotation_euler = (0, 0, math.pi); nk.location = (-0.14, 0, 0)        # backwards again
    A.apply(c, A.P_aim(1.0, head_yaw=70), 0.0); A.apply(c, A.P_aim(1.0, head_yaw=70), T_REL - 0.03)
    A.apply(c, A.P_shoot(head_yaw=70), T_REL + 0.04, interp='LINEAR'); A.apply(c, A.P_shoot(head_yaw=70), 1.2)
    A.nocked(c, 0.0, True); A.nocked(c, T_REL, False)
    eyes = A.P_shoot(head_yaw=-55); A.apply(c, eyes, 1.55)                   # only the head, late
    A.apply(c, eyes, 1.75); A.apply(c, A.P_idle(), 2.2)
    key_rot(c['arm'], 1.6, (0, 0, 0)); key_rot(c['arm'], 2.25, (0, 0, -80))  # then the whole of him
    cheer = A.P_idle(); cheer.hand_L = (0.5, -0.1, 2.3); cheer.hand_R = (-0.5, -0.1, 2.3); cheer.elbow_L = (1.0, 0.3, 1.5); cheer.elbow_R = (-1.0, 0.3, 1.5)
    for i, t in enumerate((2.4, 2.55, 2.7, 2.85, 3.0)):
        A.apply(c, cheer if i % 2 == 0 else A.P_idle(), t)
        key_loc(c['arm'], t, (HX, 0, 0.0 if i % 2 else 0.22))
    key_loc(c['arm'], 2.3, (HX, 0, 0))
    arrows.shoot('wrong_way', (HX - 0.2, -0.13, 0.9), (TGT[0] + 0.07, TGT[1], TGT[2] + 0.03), T_REL, T_HIT - T_REL, arc=0.5)
    K.impact_puff('straw', TGT, T_HIT, color='#E8D8A0', n=10, size=0.03, spread=0.6, life=0.3)
    K.rim_light((HX, 0, 1.0), offset=(-3.0, 3.0, 1.5), color='#FF9A4A', energy=380)
    cam = Cam(lens=40, fstop=4.0)
    cam.dolly(0.0, 3.0, (-0.5, -7.4, 1.1), (-0.55, -6.8, 1.1), (-0.6, 0, 1.0), (-0.6, 0, 1.0), focus0=(HX, 0, 1.0), focus1=(HX, 0, 1.0))
    cam.shake(T_HIT, 0.03, 0.15)
    S.grade(bloom=0.6, vignette=0.45)
