"""DAY 2 - MEDITATION. Elder forest. Three derps cross-legged under a fir, eyes shut, finding
their centre. An arrow from nowhere thocks into the trunk above them. Nobody moves. One opens an
eye."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from shots.montage import spawn

START, END = 6.4, 8.4
CUES = [(0.0, 'om'), (1.1, 'whoosh'), (1.25, 'thock'), (1.3, 'silence')]


def sit():
    p = A.P_idle()
    p.hips = (0, 0, 0.42); p.foot_L = (0.42, -0.3, 0.02); p.foot_R = (-0.42, -0.3, 0.02); p.knee_L = (0.6, -0.5, 0.3); p.knee_R = (-0.6, -0.5, 0.3)
    p.hand_L = (0.4, -0.25, 0.75); p.hand_R = (-0.4, -0.25, 0.75); p.foot_rot_L = (0, 0, 80); p.foot_rot_R = (0, 0, -80)
    return p


def build():
    AR.build_elder_forest(big_tree=(0.0, 3.0, 4.4), clearing=4.0, seed=35)
    for ch, x in (('a', -1.5), ('b', 0.0), ('c', 1.5)):
        h = spawn(ch, 53, END - START, loc=(x, 0.4, 0), yaw=0)
        A.apply(h, sit(), 0.0); A.apply(h, sit(), 2.0)
    arrows.shoot('nowhere', (-8, 2.6, 4.0), (-0.35, 2.55, 2.1), 1.1, 0.15)
    K.impact_puff('bark', (-0.35, 2.55, 2.1), 1.25, color='#6B4A2E', n=10, size=0.03, spread=0.5, life=0.3)
    cam = Cam(lens=35, fstop=2.8)
    cam.dolly(0.0, 2.0, (0.3, -5.2, 1.0), (0.2, -4.6, 1.0), (0, 0.4, 0.9), (0, 0.6, 1.0), focus0=(0, 0.4, 0.9), focus1=(0, 0.4, 0.9))
    K.rim_light((0, 0.4, 1.0), offset=(1.5, 3.5, 2.5), color='#FFE8B0', energy=500)
    S.grade(bloom=0.5, vignette=0.4)
