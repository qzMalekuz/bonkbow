"""SHOT 14 - CHASE ANSWERS. Quarter-speed. He spins out from the tree already drawing and
looses without looking; focus racks from his face to the arrow leaving the bow."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from shots.s13 import HIT, TREE

START, END = 37.0, 39.0
CUES = [(0.0, 'whoosh_slow'), (0.5, 'creak'), (1.15, 'release_slow')]


def build():
    AR.build_elder_forest(corridor=((0, -34), (0.4, 27), 1.7), big_tree=(TREE[0], TREE[1], 4.4), clearing=3.0, seed=33)
    arrows.stuck('stuck', HIT, (0.01, 1, 0.0), white=True)
    ch = K.hero('chase', (1.62, 24.75, 0), yaw=180)
    arm = ch['arm']
    A.apply(ch, A.P_aim(0.15, head_yaw=60), 0.0)
    A.apply(ch, A.P_aim(1.0, head_yaw=88), 0.85); A.apply(ch, A.P_aim(1.0, head_yaw=88), 1.12)
    A.apply(ch, A.P_shoot(head_yaw=88), 1.22, interp='LINEAR'); A.apply(ch, A.P_shoot(head_yaw=88), 2.0)
    A.nocked(ch, 0.0, True); A.nocked(ch, 1.15, False)
    # spins out from behind the trunk: yaw 180 -> -90 (aiming back down the lane, -Y)
    key_loc(arm, 0.0, (1.62, 24.75, 0)); key_loc(arm, 0.8, (-0.1, 24.15, 0))
    key_rot(arm, 0.0, (0, 0, 0)); key_rot(arm, 0.8, (0, 0, -90))
    A.expression(ch, 'angry'); A.expression(ch, 'wink', 0.8)
    K.at_frame(1.15)
    tip, d = arrows.release_point(ch)
    arrows.shoot('answer', tuple(tip), (tip.x - 0.5, tip.y - 9.0, tip.z - 0.1), 1.15, 0.85, stick=False)
    hp = K.head_pos(ch)
    cam = Cam(lens=50, fstop=1.8)
    cam.orbit(0.0, 2.0, (-0.1, 24.15, 1.5), 3.4, 0.2, -20, 9, look=(-0.15, 24.05, 1.3), steps=8)
    cam.rack_focus(0.0, 1.1, tuple(hp), tuple(hp)); cam.rack_focus(1.15, 1.7, tuple(hp), (tip.x, tip.y - 2.6, tip.z))
    S.grade(bloom=0.4, vignette=0.35)
