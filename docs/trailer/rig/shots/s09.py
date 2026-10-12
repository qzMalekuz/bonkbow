"""SHOT 09 - M-IT, Rainy Town. Low angle in the rain, neon in the puddles. He slides down the
wet roof, drops onto the balcony rail, stands, shakes the rain out of his hair. Clean."""
import actions as A
import arenas as AR
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from mathutils import Vector

START, END = 19.0, 23.0
HERO = 'mit'
LOWER = (2.6, 3.9)
CUES = [(0.0, 'rain'), (0.25, 'scrape'), (1.2, 'whoosh'), (1.5, 'clang'), (2.35, 'flick'), (2.7, 'bell')]


def build():
    env = AR.build_rainy_town()
    ga.head_glow(0.22)
    ridge, eave, rail = Vector(env['roof_ridge']), Vector(env['roof_eave']), Vector(env['rail'])
    h = K.hero(HERO, tuple(ridge), yaw=0)
    arm = h['arm']
    slide = A.P_idle(); slide.hips = (0, 0.12, A.HIP - 0.36); slide.hips_rot = (-14, 0, 0)
    slide.foot_L = (0.2, -0.42, 0.02); slide.foot_R = (-0.18, -0.2, 0.0); slide.hand_L = (0.5, 0.1, 0.75); slide.hand_R = (-0.5, 0.2, 0.95)
    air = A.P_idle(); air.hips = (0, 0, A.HIP - 0.15); air.foot_L = (0.18, -0.1, 0.2); air.foot_R = (-0.18, 0.05, 0.3)
    air.hand_L = (0.62, -0.1, 1.5); air.hand_R = (-0.6, -0.1, 1.55)
    perch = A.P_idle(); perch.hips = (0, 0.02, A.HIP - 0.42); perch.hips_rot = (10, 0, 0); perch.foot_L = (0.24, 0, 0); perch.foot_R = (-0.24, 0, 0)
    perch.knee_L = (0.7, -0.9, 0.5); perch.knee_R = (-0.7, -0.9, 0.5); perch.hand_L = (0.52, -0.2, 0.55); perch.hand_R = (-0.5, -0.2, 0.5)
    stand = A.P_idle()
    A.apply(h, slide, 0.0); A.apply(h, slide, 1.12)
    A.apply(h, air, 1.3)
    A.apply(h, perch, 1.52, interp='LINEAR'); A.apply(h, perch, 1.7)
    A.apply(h, stand, 2.2)
    # hair shake
    for t, y in ((2.3, 0), (2.38, 26), (2.46, -24), (2.54, 18), (2.62, -12), (2.72, 0)):
        p = A.P_idle(); p.head = (4, 0, y); A.apply(h, p, t, interp='LINEAR')
    A.apply(h, stand, 2.85); A.apply(h, stand, 4.0)
    on_rail = (rail.x, rail.y, rail.z + 0.03)
    key_loc(arm, 0.0, tuple(ridge + Vector((0, -0.5, 0.08))), 'LINEAR')
    key_loc(arm, 1.12, tuple(eave + Vector((0, 0.05, 0.1))), 'LINEAR')
    key_loc(arm, 1.3, tuple((eave + Vector(on_rail)) / 2 + Vector((0, 0, 0.55))), 'LINEAR')
    key_loc(arm, 1.52, on_rail, 'LINEAR')
    A.expression(h, 'neutral'); A.expression(h, 'smile', 2.7)
    K.impact_puff('spray', (rail.x, rail.y, rail.z + 0.05), 1.52, color='#BFD8F0', n=12, size=0.025, spread=0.7, life=0.35)
    K.impact_puff('shake', (rail.x, rail.y, rail.z + 2.0), 2.4, color='#BFD8F0', n=14, size=0.018, spread=0.8, life=0.4, seed=4)
    cam = Cam(lens=55, fstop=2.4)
    cam.at(0.0, (1.6, -8.5, 0.6), (0.1, 5.0, 6.6), focus=tuple(ridge))
    cam.at(1.1, (1.5, -8.4, 0.6), (0.0, 3.5, 5.7), focus=tuple(eave))
    cam.at(1.55, (1.45, -8.3, 0.62), (0.0, 2.6, 4.9), focus=on_rail)
    cam.at(2.4, (0.9, -8.6, 1.6), (0.0, 2.6, 5.5), focus=(0, 2.6, 5.7))
    cam.at(4.0, (0.4, -9.0, 2.6), (0.0, 2.6, 5.72), focus=(0, 2.5, 5.75), lens=125)
    cam.lens(0.0, 55); cam.lens(2.4, 75)
    cam.handheld(0.02, speed=1.4)
    K.key_light((0, 2.6, 5.6), offset=(1.5, -3.5, -1.0), color='#FFD9B0', energy=130, size=2.0)
    K.rim_light((0, 2.6, 5.6), offset=(-2.0, 1.5, 1.5), color='#3AE8FF', energy=300, size=1.2)
    S.grade(bloom=0.9, vignette=0.45)
