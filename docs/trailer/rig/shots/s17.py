"""SHOT 17 - M-IT COUNTERS. Low angle from the street. He drops off the roof edge, draws in the
air, looses, and lands in a three-point crouch in a puddle. Splash."""
import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot

START, END = 43.0, 44.5
CUES = [(0.1, 'creak'), (0.5, 'release'), (0.82, 'splash')]


def build():
    AR.build_rainy_town()
    ga.head_glow(0.24)
    h = K.hero('mit', (0, 2.0, 5.3), yaw=0)
    arm = h['arm']
    air = A.P_aim(0.2, pitch=18, head_yaw=70); air.foot_L = (0.3, -0.1, 0.25); air.foot_R = (-0.28, 0.1, 0.4)
    air2 = A.P_aim(1.0, pitch=18, head_yaw=70); air2.foot_L = (0.3, -0.1, 0.3); air2.foot_R = (-0.28, 0.1, 0.45)
    rel = A.P_shoot(pitch=18, head_yaw=70); rel.foot_L = (0.3, -0.1, 0.2); rel.foot_R = (-0.28, 0.1, 0.3)
    A.apply(h, air, 0.0); A.apply(h, air2, 0.42); A.apply(h, air2, 0.48); A.apply(h, rel, 0.56, interp='LINEAR')
    land = A.P_crouch_land(); land.head = (-6, 0, 0)
    A.apply(h, rel, 0.74); A.apply(h, land, 0.84, interp='LINEAR')
    deep = A.P_crouch_land(); deep.hips = (0, 0.05, A.HIP - 0.52); deep.head = (4, 0, 0)
    A.apply(h, deep, 0.94); A.apply(h, land, 1.15); A.apply(h, land, 1.5)
    A.nocked(h, 0.0, True); A.nocked(h, 0.5, False)
    key_loc(arm, 0.0, (0, 2.6, 5.4), 'LINEAR'); key_loc(arm, 0.42, (0, 0.9, 3.6), 'LINEAR'); key_loc(arm, 0.82, (0, -0.3, 0.0), 'LINEAR')
    A.expression(h, 'wink'); A.expression(h, 'smile', 1.0)
    K.at_frame(0.5)
    tip, d = arrows.release_point(h)
    arrows.shoot('up', tuple(tip), tuple(tip + d * 26), 0.5, 0.7, stick=False)
    K.impact_puff('splash', (0, -0.3, 0.05), 0.82, color='#BFD8F0', n=34, size=0.05, spread=1.7, life=0.5, up=1.6)
    K.impact_puff('splash2', (0, -0.3, 0.05), 0.84, color='#DCEBFA', n=26, size=0.03, spread=2.2, life=0.45, seed=3, up=1.0)
    cam = Cam(lens=24, fstop=2.8)
    cam.at(0.0, (0.9, -5.2, 0.3), (0, 1.8, 5.2), focus=(0, 2, 5.5))
    cam.at(0.82, (0.8, -4.9, 0.3), (0, -0.3, 0.9), focus=(0, -0.3, 1.0), interp='LINEAR')
    cam.at(1.5, (0.6, -4.2, 0.4), (0, -0.3, 1.05), focus=(0, -0.5, 1.2))
    cam.shake(0.83, 0.07, 0.25)
    K.key_light((0, -0.3, 1.2), offset=(2.0, -3.5, 1.5), color='#FFD9B0', energy=110, size=2.0)
    K.rim_light((0, -0.3, 1.4), offset=(-2.2, 2.0, 1.5), color='#FF3A8A', energy=420, size=1.2)
    S.grade(bloom=0.9, vignette=0.45)
