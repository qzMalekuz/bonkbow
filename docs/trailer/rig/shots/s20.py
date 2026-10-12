"""SHOT 20 - AKSHAY'S TRICK SHOT. Golden sunset. He looses; the arrow pings off a windmill
blade, changes direction and lands in a target behind Beeman. Beeman looks at the arrow, then
at Akshay. Akshay grins. Nobody has lost."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc
from mathutils import Vector
from props import build_target

START, END = 49.0, 51.0
CUES = [(0.3, 'release'), (0.78, 'ping'), (0.78, 'silence'), (1.25, 'thock'), (1.7, 'bell')]
BLADE = Vector((7.0, 13.0, 9.2))
TARGET = Vector((13.0, 0.0, 1.1))


def build():
    env = AR.build_golden_meadow(sunset=True, grass_y=(-7, 7), grass_x=(-12, 16), windmill=(8.5, 16.0, 0), fence_y=24, grass_density=140, grass_height=0.45)
    tg = build_target('target', env['col'], 0.55)
    tg.location = tuple(TARGET); tg.rotation_euler = (0, 0, 1.2)
    ak = K.hero('akshay', (-6, 0, 0), yaw=0)
    A.apply(ak, A.P_aim(1.0, pitch=24), 0.0); A.apply(ak, A.P_aim(1.0, pitch=24), 0.28); A.apply(ak, A.P_shoot(pitch=24), 0.36, interp='LINEAR')
    A.apply(ak, A.P_shoot(pitch=24), 1.4)
    grin = A.P_idle(); grin.head = (0, 0, 0)
    A.apply(ak, grin, 1.5); A.apply(ak, grin, 2.0)
    A.nocked(ak, 0.0, True); A.nocked(ak, 0.3, False)
    A.expression(ak, 'wink'); A.expression(ak, 'smile', 1.3)
    bee = K.hero('beeman', (11.6, -0.5, 0), yaw=0)
    A.apply(bee, A.P_idle(), 0.0); A.apply(bee, A.P_idle(), 1.25)
    look_t = A.P_idle(); look_t.head = (0, 0, 60); look_t.spine = (0, 0, 10)
    A.apply(bee, look_t, 1.38); A.apply(bee, look_t, 1.5)
    K.at_frame(0.3)
    tip, d = arrows.release_point(ak)
    arrow = arrows.path('trick', [tuple(tip), tuple(BLADE), tuple(TARGET + Vector((-0.1, -0.02, 0.05)))], 0.3, 0.95)
    K.glint('ping', tuple(BLADE), 0.78, size=1.6, color='#FFF2C0', life=0.3, strength=120)
    K.impact_puff('straw', tuple(TARGET), 1.25, color='#E8D8A0', n=10, size=0.03, spread=0.6, life=0.3)
    cam = Cam(lens=45, fstop=2.8)
    C = 'CONSTANT'
    # 1: side profile of the release
    cam.at(0.0, (-5.6, -6.5, 1.1), (-5.5, 0, 1.1), focus=(-6, 0, 1.3), interp='LINEAR'); cam.at(0.48, (-5.3, -6.3, 1.1), (-5.0, 0, 1.2), focus=(-6, 0, 1.3), interp=C)
    # 2: up at the windmill for the ping
    cam.at(0.5, (2.5, 3.0, 2.2), (6.6, 12.5, 8.6), focus=tuple(BLADE), interp='LINEAR'); cam.at(0.98, (2.9, 3.4, 2.3), (7.2, 12.8, 8.8), focus=tuple(BLADE), interp=C)
    # 3: the target and Beeman
    cam.at(1.0, (11.4, -6.2, 1.2), (12.3, 0, 1.15), focus=tuple(TARGET), interp='LINEAR'); cam.at(1.48, (11.5, -5.8, 1.2), (12.3, 0, 1.18), focus=(11.6, -0.5, 1.4), interp=C)
    # 4: Akshay, grin
    cam.at(1.5, (-6.2, -4.4, 1.3), (-6, 0, 1.3), focus=(-6, 0, 1.45), interp='LINEAR'); cam.at(2.0, (-6.15, -3.9, 1.32), (-6, 0, 1.32), focus=(-6, 0, 1.45))
    cam.lens(0.0, 45)
    K.rim_light((-6, 0, 1.6), offset=(-2.5, 3.0, 1.5), color='#FF9A4A', energy=500)
    S.grade(bloom=0.6, vignette=0.35)
