"""DAY 3 - SNOWMAN PRACTICE. He draws on a snowman. Fires. The snowman is untouched; the
arrow comes back from somewhere and the snowman falls on him anyway."""
import math

import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from shots.montage import spawn

START, END = 11.6, 13.6
CUES = [(0.0, 'creak'), (0.7, 'twang'), (1.0, 'silence'), (1.25, 'creak_long'), (1.6, 'thud')]


def build():
    env = AR.build_snowfall_village(snowman_at=(0.0, 3.2), hat=False)
    sm = env['snowman']
    d = spawn('d', 56, END - START, loc=(0.0, -0.8, 0), yaw=-90)       # aiming +Y, at the snowman
    A.apply(d, A.P_aim(0.85, head_yaw=70), 0.0); A.apply(d, A.P_aim(1.0, head_yaw=70), 0.65)
    A.apply(d, A.P_shoot(head_yaw=70), 0.75, interp='LINEAR'); A.apply(d, A.P_shoot(head_yaw=70), 1.3)
    look = A.P_shoot(head_yaw=70); look.head = (-25, 0, 70)
    A.apply(d, look, 1.45); A.apply(d, look, 2.0)
    A.nocked(d, 0.0, True); A.nocked(d, 0.7, False)
    K.at_frame(0.7)
    tip, dr = arrows.release_point(d)
    arrows.shoot('miss', tuple(tip), (tip.x + 2.0, tip.y + 20, tip.z + 6), 0.7, 0.4, stick=False)
    # the snowman tips over onto him (pivot at its base)
    key_rot(sm, 1.2, (0, 0, math.degrees(math.pi))); key_rot(sm, 1.6, (-95, 0, math.degrees(math.pi)), 'LINEAR'); key_rot(sm, 2.0, (-95, 0, math.degrees(math.pi)))
    K.impact_puff('snow', (0, -0.3, 0.6), 1.6, color='#FFFFFF', n=24, size=0.07, spread=1.2, life=0.45, up=0.8)
    cam = Cam(lens=40, fstop=2.8)
    cam.dolly(0.0, 2.0, (3.2, -3.2, 1.1), (2.6, -3.0, 1.0), (0.2, 0.6, 1.0), (0.2, 0.3, 0.9), focus0=(0, -0.8, 1.1), focus1=(0, -0.5, 1.0))
    cam.shake(1.6, 0.05, 0.2)
    S.grade(bloom=0.35, vignette=0.35)
