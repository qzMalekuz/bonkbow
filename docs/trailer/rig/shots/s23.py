"""SHOT 23 - THE VOLLEY. The six stop. Silence. They draw as one and loose together - straight
at the lens. Freeze: six arrows hanging in the air, six faces behind them, a small orbit."""
import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from mathutils import Vector
from shots.s22 import ORDER, XS, Y1, cast

START, END = 56.0, 58.0
CUES = [(0.1, 'creak'), (0.95, 'chord'), (1.1, 'silence')]
T_REL, T_FREEZE = 0.95, 1.12


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.24)
    hs = cast(walk=False)
    for i, (h, x) in enumerate(zip(hs, XS)):
        arm = h['arm']
        arm.location = (x, Y1, 0); arm.rotation_euler = (0, 0, __import__('math').radians(-90))
        A.apply(h, A.P_idle(), 0.0)
        A.apply(h, A.P_aim(0.0, head_yaw=88), 0.3); A.apply(h, A.P_aim(1.0, head_yaw=88), 0.75); A.apply(h, A.P_aim(1.0, head_yaw=88), T_REL - 0.03)
        A.apply(h, A.P_shoot(head_yaw=88), T_REL + 0.05, interp='LINEAR'); A.apply(h, A.P_shoot(head_yaw=88), 2.0)
        A.nocked(h, 0.15, True); A.nocked(h, T_REL, False)
        K.key_light((x, Y1, 1.2), offset=(-0.8, -6.5, 2.2), color='#FFE0C0', energy=520, size=1.6, name='key_%d' % i)
        A.expression(h, {'akshay': 'smile', 'mert': 'angry', 'tolly': 'smile', 'mit': 'smile'}.get(h['hero'], 'neutral'))
    K.at_frame(T_REL)
    for i, h in enumerate(hs):
        tip, d = arrows.release_point(h)
        aim = (Vector((XS[i] * 0.42, -2.4, 0.98 + (0.1 if i % 2 else -0.05))) - tip).normalized()   # converge on the lens
        p1 = tip + aim * 5.4
        p2 = p1 + aim * 0.2                          # then barely drifting: the frozen moment
        a = arrows.shoot('volley_%d' % i, tuple(tip), tuple(p1), T_REL, T_FREEZE - T_REL, white=(h['hero'] == 'beeman'), stick=True, wobble=False)
        from common import frame
        a.location = p2; a.keyframe_insert('location', frame=frame(2.0))
    S.sun('#6E8ED8', (0.0, 0.5, 1.0), energy=0.9, angle=20, name='front_fill')
    cam = Cam(lens=40, fstop=9.0)
    cam.at(0.0, (0, -2.6, 1.15), (0, 6.5, 1.12), focus=(0, Y1, 1.4))
    cam.at(T_FREEZE, (0, -2.4, 1.15), (0, 6, 1.1), focus=(0, 3.0, 1.2))
    cam.orbit(T_FREEZE, 2.0, (0, 3.4, 0), 5.8, 1.15, 0, 12, look=(0, 4.0, 1.08), steps=6, focus=(0, 1.5, 1.1))
    S.grade(bloom=0.9, vignette=0.45)
