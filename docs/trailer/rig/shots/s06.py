"""SHOT 06 - AKSHAY, Golden Meadow. Low push through long grass; an arrow whips past the lens
and thocks into a fence post; Akshay rises out of the grass with his back to us, turns, grins,
the next arrow already nocked."""
import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam

START, END = 7.0, 11.0
HERO = 'akshay'
LOWER = (2.55, 3.9)
CUES = [(0.0, 'grass'), (0.8, 'whip'), (1.1, 'thock'), (1.5, 'rustle'), (2.45, 'bell')]


def build():
    env = AR.build_golden_meadow(grass_y=(-9, 3.4), grass_x=(-9, 9), fence_y=3.6, grass_height=0.5, grass_density=320)
    post = env['posts'][6]  # x = 1.0
    # the arrow from behind the camera into the post
    arrows.shoot('whip', (0.5, -8.5, 0.8), (post[0], post[1] - 0.09, 1.02), 0.8, 0.3)
    K.impact_puff('chips', (post[0], post[1] - 0.12, 1.02), 1.1, color='#C8A070', n=8, size=0.025, spread=0.45, life=0.3)
    h = K.hero(HERO, (-0.7, 0.4, -1.5), yaw=180)
    arm = h['arm']
    # hidden below the grass, then rising with his back to us
    crouch = A.P_idle(); crouch.hips = (0, 0, A.HIP - 0.3); crouch.head = (14, 0, 0)
    aim = A.P_aim(0.35, head_yaw=0)
    A.apply(h, crouch, 0.0); A.apply(h, crouch, 1.45)
    A.apply(h, A.P_idle(), 2.05)
    A.apply(h, aim, 2.55); A.apply(h, A.P_aim(0.45, head_yaw=0), 4.0)
    A.nocked(h, 0.0, True)
    from common import key_loc, key_rot
    key_loc(arm, 0.0, (-0.7, 0.4, -1.5)); key_loc(arm, 1.45, (-0.7, 0.4, -1.5)); key_loc(arm, 2.1, (-0.7, 0.4, 0.0))
    key_rot(arm, 2.0, (0, 0, 180)); key_rot(arm, 2.6, (0, 0, -8))
    A.expression(h, 'neutral'); A.expression(h, 'smile', 2.45)
    cam = Cam(lens=28, fstop=2.2)
    cam.at(0.0, (0.3, -6.4, 0.3), (0.8, 3.6, 0.8), focus=(1.0, 3.6, 1.0))
    cam.at(0.55, (0.3, -4.9, 0.8), (0.9, 3.6, 0.9), focus=(1.0, 3.6, 1.0))
    cam.at(1.35, (0.25, -4.3, 0.85), (0.9, 3.6, 0.9), focus=(1.0, 3.6, 1.0))
    cam.at(2.3, (-0.2, -4.2, 0.9), (-0.5, 0.4, 1.1), focus=(-0.7, 0.2, 1.4))
    cam.at(4.0, (-0.3, -3.3, 1.1), (-0.45, 0.4, 1.2), focus=(-0.7, 0.0, 1.4), lens=34)
    cam.lens(0.0, 28); cam.lens(2.3, 28)
    cam.handheld(0.012)
    K.rim_light((-0.7, 0.4, 1.6), offset=(-2.5, 3.0, 1.5), color='#FFB060', energy=500)
    S.grade(bloom=0.5, vignette=0.3)
