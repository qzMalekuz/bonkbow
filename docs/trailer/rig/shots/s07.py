"""SHOT 07 - BEEMAN, Moonlit Woods. Empty fogged forest; he walks in from behind the lens,
passes us, stops, does not turn, draws. The camera slides round to his shades; moonlight glints."""
import math

import actions as A
import arenas as AR
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot

START, END = 11.0, 15.0
HERO = 'beeman'
LOWER = (2.5, 3.9)
CUES = [(0.0, 'fog'), (0.55, 'twig'), (0.7, 'step'), (1.1, 'step'), (1.5, 'step'), (1.9, 'step'), (2.3, 'creak'), (3.2, 'glint')]


def build():
    AR.build_moonlit_woods(clearing=5.5)
    ga.head_glow(0.22)
    h = K.hero(HERO, (0.9, -10.5, 0), yaw=180)
    arm = h['arm']
    A.walk_cycle(h, 0.0, 2.0, cycle=0.8)
    key_loc(arm, 0.0, (0.9, -10.6, 0), 'LINEAR'); key_loc(arm, 2.0, (0.9, -4.6, 0), 'LINEAR')
    key_rot(arm, 0.0, (0, 0, 180)); key_rot(arm, 2.0, (0, 0, 180))
    A.apply(h, A.P_idle(), 2.15)
    A.apply(h, A.P_aim(0.0), 2.45); A.apply(h, A.P_aim(1.0), 3.0); A.apply(h, A.P_aim(1.0), 4.0)
    A.nocked(h, 2.3, True)
    # he aims along his left: with yaw 180 that is world -X
    cam = Cam(lens=32, fstop=2.4)
    cam.at(0.0, (0.0, -8.6, 1.55), (0.6, 6, 2.2), focus=(0.9, -4.6, 1.6))
    cam.at(2.1, (-0.1, -8.4, 1.55), (0.8, -4.6, 1.5), focus=(0.9, -4.6, 1.6))
    cam.at(3.1, (-2.9, -5.6, 1.6), (0.75, -4.6, 1.7), focus=(0.7, -4.6, 1.75), lens=50)
    cam.at(4.0, (-3.3, -5.2, 1.65), (0.75, -4.6, 1.72), focus=(0.7, -4.6, 1.75), lens=58)
    cam.lens(0.0, 32); cam.lens(2.1, 32)
    K.key_light((0.9, -4.6, 1.6), offset=(-3.0, -1.5, 1.5), color='#9FD8E8', energy=260, size=2.0)
    K.at_frame(3.2)
    hp = K.head_pos(h)
    K.glint('glint', (hp.x - 0.36, hp.y - 0.12, hp.z + 0.06), 3.25, size=0.34, color='#DDF4FF')
    S.grade(bloom=0.8, vignette=0.45)
