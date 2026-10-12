"""SHOT 13 - BEEMAN FIRES. Arrow-cam through the Elder Forest. Chase stands in the open, sees
it, pivots behind a fir at the last moment; the arrow thocks into the trunk beside his curls.
Hold. He looks at the arrow, then at us."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from mathutils import Vector

START, END = 33.0, 37.0
CUES = [(0.0, 'creak'), (0.45, 'release'), (0.5, 'wind'), (2.3, 'thock_big'), (2.3, 'silence'), (3.3, 'bell')]
TREE = (0.95, 25.3)
HIT = (0.62, 24.86, 1.62)
T_REL, T_HIT = 0.45, 2.3


def build():
    AR.build_elder_forest(corridor=((0, -34), (0.4, 27), 1.7), big_tree=(TREE[0], TREE[1], 4.4), clearing=3.0, seed=33)
    bee = K.hero('beeman', (0, -30, 0), yaw=90)
    A.apply(bee, A.P_aim(1.0), 0.0); A.apply(bee, A.P_aim(1.0), T_REL - 0.04)
    A.apply(bee, A.P_shoot(), T_REL + 0.04, interp='LINEAR'); A.apply(bee, A.P_shoot(), 1.0)
    A.nocked(bee, 0.0, True); A.nocked(bee, T_REL, False)
    K.at_frame(0.0)
    tip, d = arrows.release_point(bee)
    arrow = arrows.shoot('shot', tuple(tip), HIT, T_REL, T_HIT - T_REL, white=True, visible_before=True)
    # Chase: standing in the lane, then a sharp pivot behind the fir
    ch = K.hero('chase', (0.15, 24.2, 0), yaw=0)
    arm = ch['arm']
    A.apply(ch, A.P_idle(), 0.0); A.apply(ch, A.P_idle(), 1.75)
    startle = A.P_idle(); startle.hips = (0, 0, A.HIP - 0.08); startle.hand_L = (0.6, -0.2, 1.2); startle.hand_R = (-0.6, -0.2, 1.2)
    A.apply(ch, startle, 1.9)
    lean = A.P_dodge_lean(-1, 0.9)
    A.apply(ch, lean, 2.2, interp='LINEAR')
    A.apply(ch, A.P_idle(), 2.6)
    look_arrow = A.P_idle(); look_arrow.head = (0, 0, -66); look_arrow.spine = (0, 0, -14)
    A.apply(ch, look_arrow, 2.95); A.apply(ch, look_arrow, 3.15)
    side_eye = A.P_idle(); side_eye.head = (0, 0, 0)
    A.apply(ch, side_eye, 3.35); A.apply(ch, side_eye, 4.0)
    key_loc(arm, 0.0, (0.15, 24.2, 0)); key_loc(arm, 1.9, (0.15, 24.2, 0)); key_loc(arm, 2.22, (1.62, 24.75, 0), 'LINEAR')
    key_rot(arm, 0.0, (0, 0, 0)); key_rot(arm, 2.25, (0, 0, 0))
    A.expression(ch, 'neutral'); A.expression(ch, 'shock', 1.8); A.expression(ch, 'angry', 3.3)
    K.impact_puff('bark', HIT, T_HIT, color='#6B4A2E', n=12, size=0.03, spread=0.6, life=0.35)
    cam = Cam(lens=20, fstop=4.0)
    off, look = (-1.25, 0.0, 0.13), (3.0, 0, 0.0)
    # before the release: over Beeman's shoulder, down the lane; then cut onto the arrow
    cam.at(0.0, (-1.9, -33.6, 2.2), (0.3, -24, 0.9), focus=(0.0, -30, 1.3), interp='LINEAR')
    cam.at(T_REL - 2 / 30, (-1.8, -33.3, 2.15), (0.3, -24, 0.9), focus=(0.0, -30, 1.3), interp='CONSTANT')
    cam.follow(arrow, off, T_REL, T_HIT, look_offset=look)
    K.at_frame(T_HIT)
    p = Vector(cam.ob.location)
    cam.at(T_HIT + 0.02, tuple(p), (0.95, 24.9, 1.5), focus=HIT)
    cam.at(2.9, tuple(p + Vector((0.35, -1.3, 0.0))), (1.12, 24.9, 1.42), focus=(1.5, 24.6, 1.45))
    cam.at(4.0, tuple(p + Vector((0.45, -1.5, 0.0))), (1.15, 24.9, 1.42), focus=(1.6, 24.5, 1.45))
    cam.shake(T_HIT, 0.05, 0.2)
    cam.lens(0.0, 20); cam.lens(T_HIT, 20)
    cam.lens(0.0, 32); cam.data.keyframe_insert('lens', frame=1)
    cam.data.lens = 20; cam.data.keyframe_insert('lens', frame=int(T_REL * 30) + 1)
    for fc in __import__('common').fcurves(cam.data.animation_data.action):
        if fc.data_path == 'lens':
            fc.keyframe_points[0].interpolation = 'CONSTANT'; cam.lens(2.9, 30); cam.lens(4.0, 32)
    S.grade(bloom=0.4, vignette=0.35, lens_distort=-0.02)
