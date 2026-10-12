"""SHOT 10 - MERT, Colosseum. Static low angle. A banner burns in the foreground; Mert walks
through the opening that is already burning, embers on his shoulders, scowl locked, and draws
without looking."""
import actions as A
import arenas as AR
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot

START, END = 23.0, 27.0
HERO = 'mert'
LOWER = (2.5, 3.9)
CUES = [(0.0, 'fire'), (0.4, 'step'), (0.85, 'step'), (1.3, 'step'), (1.75, 'step'), (2.2, 'step'), (2.7, 'creak')]


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.2)
    # the burning banner: two torn halves hanging either side of a gap, flames along the edges
    b = AR.Batch('banner')
    cloth = AR.mat('banner_cloth', '#5E1212', rough=0.9); char = AR.mat('banner_char', '#1A0C08', rough=1.0)
    pole = AR.mat('banner_pole', '#2A1E16')
    b.box(pole, (0, 2.2, 5.0), (5.6, 0.12, 0.12))
    for sx in (-1, 1):
        b.box(cloth, (sx * 2.05, 2.2, 2.9), (1.3, 0.04, 4.1))
        b.box(char, (sx * 1.32, 2.2, 2.8), (0.22, 0.05, 3.9))
        b.box(cloth, (sx * 0.9, 2.2, 4.5), (0.7, 0.04, 0.9))
        b.box(char, (sx * 0.6, 2.2, 4.3), (0.2, 0.05, 0.7))
        b.cyl(pole, (sx * 2.75, 2.2, 2.5), 0.08, 5.0, segs=8)
    b.finish()
    i = 0
    for sx in (-1, 1):
        for z in (0.9, 1.9, 2.9, 3.9):
            AR.fire('edge_%d' % i, (sx * (1.3 + 0.06 * (i % 3)), 2.15, z), 0.5 + 0.12 * (i % 2), energy=160, flicker_seed=20 + i, light=(i % 2 == 0))
            i += 1
    S.particles('banner_embers', 160, (-2.5, 0.5, 0.2), (2.5, 3.5, 5.5), (0.1, -0.25, 0.9), radius=0.018, color='#FFA040', emit=50, seed=9, sway=0.2, jitter=0.5)
    h = K.hero(HERO, (0, 7.5, 0), yaw=0)
    arm = h['arm']
    A.walk_cycle(h, 0.0, 2.45, cycle=0.9)
    key_loc(arm, 0.0, (0, 7.6, 0), 'LINEAR'); key_loc(arm, 2.45, (0, 0.6, 0), 'LINEAR')
    A.apply(h, A.P_idle(), 2.6)
    A.apply(h, A.P_aim(0.0, head_yaw=0), 2.85); A.apply(h, A.P_aim(1.0, head_yaw=0), 3.4); A.apply(h, A.P_aim(1.0, head_yaw=0), 4.0)
    A.nocked(h, 2.7, True)
    A.expression(h, 'angry')
    cam = Cam(lens=30, fstop=2.8)
    cam.at(0.0, (0.5, -4.4, 0.55), (0, 2.0, 1.9), focus=(0, 2.2, 2))
    cam.at(2.5, (0.45, -4.2, 0.55), (0, 0.8, 1.6), focus=(0, 0.6, 1.7))
    cam.at(4.0, (0.3, -3.5, 0.75), (0, 0.6, 1.62), focus=(0, 0.5, 1.7), lens=36)
    cam.lens(0.0, 30); cam.lens(2.5, 30)
    K.key_light((0, 0.6, 1.6), offset=(-2.0, -3.0, 1.0), color='#FFC89A', energy=240, size=2.0)
    S.grade(bloom=0.9, vignette=0.45)
