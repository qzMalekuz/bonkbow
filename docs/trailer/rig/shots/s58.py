"""DAY 4 - RAIN. They look up. Six arrows come back down, one after another. Six bonks."""
import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_scale
from shots.s57 import XS, Y, cast

START, END = 16.6, 18.6
CUES = [(0.2, 'bonk'), (0.42, 'bonk'), (0.64, 'bonk'), (0.86, 'bonk'), (1.08, 'bonk'), (1.3, 'bonk'), (1.35, 'silence')]


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.2)
    hs = cast(58, END - START)
    for i, h in enumerate(hs):
        look = A.P_shoot(pitch=84, head_yaw=70); look.head = (-30, 0, 70)
        A.apply(h, look, 0.0)
        t_hit = 0.2 + i * 0.22
        A.apply(h, look, t_hit - 0.02)
        after = A.P_idle(); after.head = (6, 0, 0)
        A.apply(h, after, t_hit + 0.08, interp='LINEAR'); A.apply(h, after, 2.0)
        K.at_frame(0.0)
        top = K.head_pos(h); top.z += 0.36
        arrows.shoot('down_%d' % i, (top.x + 0.02, top.y, top.z + 7), (top.x, top.y, top.z - 0.05), t_hit - 0.3, 0.3)
        sk = h['skull']
        for t, s in ((t_hit - 0.02, (1, 1, 1)), (t_hit + 0.04, (1.07, 1.07, 0.86)), (t_hit + 0.14, (0.97, 0.97, 1.05)), (t_hit + 0.24, (1, 1, 1))):
            key_scale(sk, t, s)
        K.glint('star_%d' % i, (top.x, top.y - 0.3, top.z + 0.1), t_hit, size=0.3, color='#FFE8A0', life=0.3)
        K.key_light((XS[i], Y, 1.2), offset=(-0.8, -5.5, 2.2), color='#FFD0A0', energy=420, size=1.6, name='key_%d' % i)
    S.sun('#6E8ED8', (0.0, 0.5, 1.0), energy=0.9, angle=20, name='front_fill')
    cam = Cam(lens=40, fstop=4.0)
    cam.dolly(0.0, 2.0, (0, -3.6, 1.2), (0, -3.9, 1.1), (0, Y, 1.4), (0, Y, 1.15), focus0=(0, Y, 1.5), focus1=(0, Y, 1.2))
    for i in range(6):
        cam.shake(0.2 + i * 0.22, 0.025, 0.12)
    S.grade(bloom=0.9, vignette=0.45)
