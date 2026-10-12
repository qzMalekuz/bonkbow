"""DERP 02 - HE REALISES. Close on his face. He looks at the arrow. At us. At the arrow. Turns
it round, very carefully. Nods, as if that had been difficult."""
import math

import actions as A
import derp as D
import scene as S
from camera import Cam
from common import frame
from props import ARROW_LEN
from shots.s41 import stage

START, END = 2.2, 5.0
CUES = [(1.05, 'tick'), (1.75, 'squeak'), (2.35, 'tick')]


def build():
    h = stage(END - START, 42)
    aim = lambda yaw, pitch=0: A.P_aim(0.56, head_yaw=yaw)
    for t, yaw in ((0.0, 38), (0.4, 38), (0.6, 30), (1.0, 30), (1.12, 6), (1.6, 6), (1.72, 30), (2.25, 30), (2.4, 10), (2.8, 10)):
        A.apply(h, aim(yaw), t)
    # the nod
    hd = h['arm'].pose.bones['Head']
    for t, p in ((2.42, 0), (2.5, 16), (2.58, -4), (2.66, 14), (2.74, 0)):
        hd.rotation_euler.x = -math.radians(p); hd.keyframe_insert('rotation_euler', frame=frame(t))
    # the arrow, turned end for end about its middle
    nk = h['nocked']
    for t, k in ((1.75, 0.0), (2.25, 1.0)):
        nk.rotation_euler = (0, 0, math.pi * (1 - k)); nk.location = (-0.14 + (ARROW_LEN + 0.14) * k, 0, 0)
        nk.keyframe_insert('rotation_euler', frame=frame(t)); nk.keyframe_insert('location', frame=frame(t))
    cam = Cam(lens=50, fstop=2.2)
    cam.dolly(0.0, 2.8, (0.3, -2.9, 1.15), (0.26, -2.6, 1.17), (0.14, 0, 1.15), (0.14, 0, 1.15), focus0=(0.05, -0.3, 1.3), focus1=(0.05, -0.3, 1.3))
    S.grade(bloom=0.6, vignette=0.45)
