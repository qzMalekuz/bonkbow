"""SHOT 18 - MERT HOLDS THE LINE. Static, frontal, full body. He walks at us; arrows come from
both sides and he only leans: shoulder, head, chest. Each buries in the stone behind him. The
last comes for his face. He catches it. Four frames of silence. Nocks it. Keeps walking."""
import bpy

import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_scale
from props import build_arrow

START, END = 44.5, 47.0
CUES = [(0.25, 'whoosh'), (0.42, 'crack'), (0.6, 'whoosh'), (0.77, 'crack'), (0.95, 'whoosh'), (1.12, 'crack'), (1.35, 'whoosh'), (1.5, 'catch'), (1.5, 'silence'), (1.95, 'nock')]
T_CATCH = 1.5


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.2)
    b = AR.Batch('columns')
    stone = AR.mat('col_stone', '#CDB993')
    cols = [(-2.3, 7.5), (2.3, 7.5), (-3.4, 9.5), (3.4, 9.5)]
    for x, y in cols:
        b.cyl(stone, (x, y, 2.2), 0.55, 4.4, segs=16); b.box(stone, (x, y, 4.5), (1.4, 1.4, 0.3)); b.box(stone, (x, y, 0.12), (1.4, 1.4, 0.24))
    b.finish()
    h = K.hero('mert', (0, 5.6, 0), yaw=0)
    arm = h['arm']
    A.walk_cycle(h, 0.0, 2.5, cycle=0.9)
    key_loc(arm, 0.0, (0, 5.8, 0), 'LINEAR'); key_loc(arm, T_CATCH, (0, 3.0, 0), 'LINEAR'); key_loc(arm, T_CATCH + 0.3, (0, 2.95, 0), 'LINEAR'); key_loc(arm, 2.5, (0, 2.1, 0), 'LINEAR')
    # leans layered over the walk: (time, side)
    for t, side in ((0.4, 1), (0.75, -1), (1.1, 1)):
        p = A.P_dodge_lean(side, 0.85)
        A.apply(h, p, t - 0.05, interp='LINEAR'); A.apply(h, p, t + 0.05, interp='LINEAR')
    # arrows: from the camera side, past him, into the columns
    shots = [((-3.5, -9, 1.7), (cols[1][0] - 0.3, cols[1][1] - 0.5, 1.9), 0.42), ((3.5, -9, 1.9), (cols[0][0] + 0.3, cols[0][1] - 0.5, 2.3), 0.77),
             ((-4.5, -9, 1.3), (cols[3][0] - 0.4, cols[3][1] - 0.45, 1.5), 1.12)]
    for i, (src, dst, t_hit) in enumerate(shots):
        arrows.shoot('side_%d' % i, src, dst, t_hit - 0.2, 0.2)
        K.impact_puff('stone_%d' % i, dst, t_hit, color='#D8C8A8', n=9, size=0.035, spread=0.6, life=0.3, seed=i)
    # the catch: hand snaps up in front of the face
    catch = A.P_idle(); catch.hand_R = (-0.1, -0.5, 1.93); catch.elbow_R = (-1.0, -0.3, 1.3); catch.head = (0, 0, 0)
    A.apply(h, A.P_idle(), T_CATCH - 0.14); A.apply(h, catch, T_CATCH, interp='LINEAR'); A.apply(h, catch, T_CATCH + 0.3)
    K.at_frame(T_CATCH)
    hand = h['ctrl']['hand_R'].matrix_world.translation.copy()
    arrows.shoot('face', (0.3, -9, 1.75), (hand.x - 0.0, hand.y + 0.42, hand.z), T_CATCH - 0.16, 0.16, stick=True, wobble=False, hide_after=T_CATCH + 0.42)
    A.apply(h, A.P_aim(0.0, head_yaw=0), T_CATCH + 0.5); A.apply(h, A.P_aim(1.0, head_yaw=0), 2.2); A.apply(h, A.P_aim(1.0, head_yaw=0), 2.5)
    A.nocked(h, T_CATCH + 0.42, True)
    A.expression(h, 'angry')
    cam = Cam(lens=50, fstop=3.2)
    cam.dolly(0.0, 2.5, (0, -4.6, 0.9), (0, -4.3, 0.95), (0, 3, 1.0), (0, 2.5, 1.02), focus0=(0, 4.5, 1.3), focus1=(0, 2.2, 1.3))
    K.key_light((0, 3.5, 1.6), offset=(-2.5, -4.0, 1.5), color='#FFC89A', energy=420, size=3.0)
    S.grade(bloom=0.9, vignette=0.45)
