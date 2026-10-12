"""SHOT 08 - CHASE, Elder Forest. Tilt up a tall fir. Nothing. A shape drops through frame;
whip-pan down; Chase lands in a three-point crouch, his curls a beat late, and looks over his
shoulder straight at us."""
import actions as A
import arenas as AR
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot, key_scale

START, END = 15.0, 19.0
HERO = 'chase'
LOWER = (2.5, 3.9)
CUES = [(0.4, 'creak'), (1.0, 'whoosh'), (1.4, 'land'), (1.5, 'leaves'), (2.3, 'bell')]


def build():
    AR.build_elder_forest(big_tree=(1.6, 3.2, 4.4), clearing=6.5)
    h = K.hero(HERO, (0, 0, 15), yaw=90)
    arm = h['arm']
    fall = A.P_run(0.1); fall.hand_L = (0.5, -0.1, 1.75); fall.hand_R = (-0.5, -0.1, 1.7); fall.hips_rot = (0, 0, 0)
    land = A.P_crouch_land()
    A.apply(h, fall, 0.0); A.apply(h, fall, 1.3)
    A.apply(h, land, 1.42, interp='LINEAR')
    deep = A.P_crouch_land(); deep.hips = (0, 0.05, A.HIP - 0.5)
    A.apply(h, deep, 1.52); A.apply(h, land, 1.75)
    look = A.P_idle(); look.head = (-4, 0, -62); look.spine = (0, 0, -26); look.hand_R = (-0.5, -0.1, 0.9)
    A.apply(h, land, 2.15); A.apply(h, look, 2.4); A.apply(h, look, 4.0)
    key_loc(arm, 0.0, (0, 0, 15), 'LINEAR'); key_loc(arm, 0.98, (0, 0, 15), 'LINEAR'); key_loc(arm, 1.4, (0, 0, 0), 'LINEAR')
    # curls arrive late: the head squashes on impact and springs back
    hd = h['head']
    R = hd.scale.x
    for t, s in ((1.38, (1, 1, 1)), (1.5, (1.08, 1.08, 0.86)), (1.64, (0.95, 0.95, 1.1)), (1.8, (1.02, 1.02, 0.97)), (1.95, (1, 1, 1))):
        key_scale(hd, t, (R * s[0], R * s[1], R * s[2]))
    A.expression(h, 'neutral'); A.expression(h, 'smile', 2.5)
    K.impact_puff('dust', (0, 0, 0.05), 1.42, color='#9AC070', n=14, size=0.05, spread=0.9, life=0.45)
    cam = Cam(lens=28, fstop=2.8)
    cam.at(0.0, (-0.6, -5.2, 0.9), (1.6, 3.2, 6.0), focus=(1.6, 3.2, 7))
    cam.at(0.95, (-0.6, -5.2, 0.9), (1.5, 3.2, 12.0), focus=(1.6, 3.2, 9))
    cam.at(1.14, (-0.6, -5.2, 0.9), (0.6, 1.2, 8.0), focus=(0, 0, 3), interp='LINEAR')
    cam.at(1.4, (-0.6, -5.2, 0.85), (0, 0, 0.8), focus=(0, 0, 1.0), interp='LINEAR')
    cam.at(2.4, (-0.5, -4.6, 0.8), (0, 0, 0.95), focus=(0, -0.2, 1.2))
    cam.at(4.0, (-0.4, -3.9, 0.9), (0, 0, 1.05), focus=(0, -0.3, 1.3), lens=36)
    cam.lens(0.0, 28); cam.lens(2.4, 28)
    cam.shake(1.42, 0.08, 0.3)
    S.grade(bloom=0.4, vignette=0.3)
