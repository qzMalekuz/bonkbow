"""DAY 1 - TARGET PRACTICE. Five targets in a row. He draws, solemn. The arrow passes between
every one of them and takes the coach's cap off."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot, key_scale
from shots.montage import spawn, target_row, whistle_coach

START, END = 4.2, 6.4
CUES = [(0.0, 'creak'), (0.8, 'twang'), (0.85, 'whoosh'), (1.5, 'pop'), (1.55, 'silence')]
T_REL, T_HIT = 0.8, 1.5


def build():
    env = AR.build_golden_meadow(sunset=True, grass_height=0.28, grass_density=200, grass_y=(-6, 5), grass_x=(-10, 12), fence_y=9.0)
    target_row(env['col'], [2.0, 3.6, 5.2, 6.8, 8.4], y=8.0)
    a = spawn('a', 52, END - START, loc=(0, 0, 0), yaw=-90)        # aiming along +Y
    A.apply(a, A.P_aim(0.8, head_yaw=70), 0.0); A.apply(a, A.P_aim(1.0, head_yaw=70), T_REL - 0.05)
    A.apply(a, A.P_shoot(head_yaw=70), T_REL + 0.05, interp='LINEAR'); A.apply(a, A.P_shoot(head_yaw=70), 2.2)
    A.nocked(a, 0.0, True); A.nocked(a, T_REL, False)
    k = whistle_coach('k', 52, END - START, loc=(4.4, 11.5, 0), yaw=0)
    A.apply(k, A.P_idle(), 0.0); A.apply(k, A.P_idle(), 2.2)
    K.at_frame(T_REL)
    tip, d = arrows.release_point(a)
    hat_z = 1.95
    arrows.shoot('shot', tuple(tip), (4.4, 11.3, hat_z), T_REL, T_HIT - T_REL, stick=False)
    cap = k['cap']
    cap.parent = None
    from mathutils import Vector
    key_loc(cap, 0.0, (4.4, 11.5, hat_z)); key_loc(cap, T_HIT, (4.4, 11.5, hat_z), 'LINEAR'); key_loc(cap, T_HIT + 0.5, (4.4, 14.5, 3.0), 'LINEAR'); key_loc(cap, 2.2, (4.4, 18, 0.0), 'LINEAR')
    key_rot(cap, T_HIT, (0, 0, 0), 'LINEAR'); key_rot(cap, 2.2, (0, 400, 0), 'LINEAR')
    cam = Cam(lens=50, fstop=2.8)
    C = 'CONSTANT'
    cam.at(0.0, (-2.6, -1.5, 1.1), (0.2, 1.5, 1.0), focus=(0, 0, 1.1), interp='LINEAR'); cam.at(T_REL + 0.05, (-2.4, -1.3, 1.1), (0.3, 1.8, 1.0), focus=(0, 0, 1.1), interp=C)
    cam.at(T_REL + 0.07, (0.2, 9.8, 1.5), (4.4, 11.4, 1.6), focus=(4.4, 11.5, 1.6), interp='LINEAR'); cam.at(2.2, (0.6, 9.9, 1.5), (4.4, 11.4, 1.7), focus=(4.4, 11.5, 1.6))
    cam.lens(0.0, 50); cam.lens(T_REL + 0.05, 50); cam.lens(T_REL + 0.07, 60)
    from common import fcurves
    for fc in fcurves(cam.data.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = C
    cam.shake(T_HIT, 0.03, 0.15)
    S.grade(bloom=0.5, vignette=0.4)
