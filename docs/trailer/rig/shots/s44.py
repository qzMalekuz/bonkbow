"""DERP 04 - EPIC ARROW SHOT. Arrow-cam through the Elder Forest. Someone is walking backwards
across the lane for no reason; the arrow parts the air beside his head and thocks into a fir.
Silence. He looks at it."""
import actions as A
import arenas as AR
import arrows
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc
from mathutils import Vector

START, END = 7.4, 10.2
CUES = [(0.0, 'wind'), (0.0, 'braam'), (1.2, 'step'), (1.6, 'step'), (2.0, 'step'), (2.2, 'thock_big'), (2.2, 'silence')]
TREE = (0.95, 25.3)
HIT = (0.62, 24.86, 1.82)
T_HIT = 2.2
STOP = (1.25, 24.2)


def forest():
    AR.build_elder_forest(corridor=((0, -34), (0.4, 27), 1.7), big_tree=(TREE[0], TREE[1], 4.4), clearing=3.0, seed=33)


def build():
    forest()
    arrow = arrows.shoot('shot', (0.0, -30.0, 0.95), HIT, 0.0, T_HIT, visible_before=True)
    b = D.spawn('b', 'pea', 44, 'b', END - START, loc=(-3.0, 23.2, 0), yaw=-90)     # facing -X, walking +X: backwards
    A.walk_cycle(b, 0.0, T_HIT, cycle=0.7)
    key_loc(b['arm'], 0.0, (-3.05, 23.2, 0), 'LINEAR'); key_loc(b['arm'], T_HIT, (STOP[0], STOP[1], 0), 'LINEAR')
    A.apply(b, A.P_idle(), T_HIT + 0.08)
    look = A.P_idle(); look.head = (0, 0, 78); look.spine = (0, 0, 10)          # not at the arrow: at us
    A.apply(b, A.P_idle(), 2.42); A.apply(b, look, 2.62); A.apply(b, look, 2.8)
    K.impact_puff('bark', HIT, T_HIT, color='#6B4A2E', n=12, size=0.03, spread=0.6, life=0.35)
    cam = Cam(lens=20, fstop=4.0)
    cam.follow(arrow, (-1.25, 0.0, 0.13), 0.0, T_HIT, look_offset=(3.0, 0, 0.0))
    K.at_frame(T_HIT)
    p = Vector(cam.ob.location)
    cam.at(T_HIT + 0.02, tuple(p), (0.95, 24.9, 1.55), focus=HIT)
    cam.at(2.8, tuple(p + Vector((0.35, -1.0, -0.2))), (1.0, 24.6, 1.45), focus=(STOP[0], STOP[1], 1.4))
    cam.shake(T_HIT, 0.05, 0.2)
    cam.lens(0.0, 20); cam.lens(T_HIT, 20); cam.lens(2.8, 28)
    S.grade(bloom=0.4, vignette=0.35, lens_distort=-0.02)
