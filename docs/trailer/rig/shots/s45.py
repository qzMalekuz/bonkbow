"""DERP 05 - HE THINKS HE WON. He turns to us with a huge grin and a thumbs-up: his shot,
obviously. Behind him the arrow slides out of the tree and lands on his head. Bonk. He does
not react at all."""
import math

import actions as A
import arrows
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import frame, key_loc, key_rot, key_scale
from props import build_arrow
from shots.s44 import HIT, STOP, forest

START, END = 10.2, 13.0
CUES = [(0.5, 'tick'), (0.95, 'pop'), (1.55, 'creak'), (2.0, 'bonk'), (2.0, 'silence')]
T_BONK = 2.0


def build():
    forest()
    b = D.spawn('b', 'pea', 45, 'b', END - START, loc=(STOP[0], STOP[1], 0), yaw=-90)
    th = D.thumb(b, 'Right')
    key_scale(th, 0.0, 0.0, interp='CONSTANT'); key_scale(th, 0.95, 1.0, interp='CONSTANT')
    look = A.P_idle(); look.head = (0, 0, 78); look.spine = (0, 0, 10)
    A.apply(b, look, 0.0); A.apply(b, look, 0.2)
    A.apply(b, A.P_idle(), 0.55)
    up = A.P_idle(); up.hand_R = (-0.42, -0.25, 1.9); up.elbow_R = (-1.0, 0.2, 1.2)
    A.apply(b, A.P_idle(), 0.8); A.apply(b, up, 1.0); A.apply(b, up, 2.8)
    key_rot(b['arm'], 0.2, (0, 0, -90)); key_rot(b['arm'], 0.6, (0, 0, 0))            # round to face us
    # the arrow lets go of the tree
    a = build_arrow('fallen', __import__('bpy').context.scene.collection)
    top = (STOP[0] + 0.02, STOP[1], 1.6)
    a.rotation_mode = 'XYZ'
    for t, p, r in ((0.0, HIT, (0, 0, 90)), (1.55, HIT, (0, 0, 90)), (1.7, (HIT[0] + 0.05, HIT[1] - 0.25, HIT[2] - 0.03), (0, 18, 90)),
                    (T_BONK, (top[0] + 0.3, top[1], top[2] + 0.02), (0, 4, 8)), (2.2, (top[0] + 0.75, top[1] - 0.2, top[2] + 0.42), (40, -30, 60)),
                    (2.55, (top[0] + 1.3, top[1] - 0.45, 0.03), (85, -80, 110)), (2.8, (top[0] + 1.3, top[1] - 0.45, 0.03), (85, -80, 110))):
        key_loc(a, t, p, 'LINEAR'); key_rot(a, t, r, 'LINEAR')
    # the bonk goes through him: a tiny squash of the head, nothing else moves
    sk = b['skull']
    for t, s in ((T_BONK - 0.02, (1, 1, 1)), (T_BONK + 0.04, (1.07, 1.07, 0.88)), (T_BONK + 0.14, (0.97, 0.97, 1.05)), (T_BONK + 0.24, (1, 1, 1))):
        key_scale(sk, t, s)
    cam = Cam(lens=50, fstop=2.2)
    cam.dolly(0.0, 2.8, (STOP[0] + 0.15, STOP[1] - 3.4, 1.2), (STOP[0] + 0.1, STOP[1] - 2.9, 1.22), (STOP[0] - 0.1, STOP[1], 1.3), (STOP[0] - 0.1, STOP[1], 1.3),
              focus0=(STOP[0], STOP[1] - 0.2, 1.4), focus1=(STOP[0], STOP[1] - 0.2, 1.4))
    S.grade(bloom=0.4, vignette=0.4)
