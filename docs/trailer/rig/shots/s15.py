"""SHOT 15 - BEEMAN DODGES. Profile, half speed. The arrow arrives; he moves his head exactly
enough; it passes between his ear and the bow. The shades do not move."""
import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam

START, END = 39.0, 40.5
CUES = [(0.2, 'doppler')]


def build():
    AR.build_elder_forest(corridor=((0, -34), (0.4, 27), 1.7), big_tree=(0.95, 25.3, 4.4), clearing=3.0, seed=33)
    bee = K.hero('beeman', (0, -30, 0), yaw=90)
    still = A.P_shoot(head_yaw=90); still.hand_R = (-0.35, -0.05, 0.75)
    lean = A.P_shoot(head_yaw=90); lean.hand_R = (-0.35, -0.05, 0.75); lean.head = (0, -19, 90); lean.spine = (0, -7, 8)
    A.apply(bee, still, 0.0); A.apply(bee, still, 0.42); A.apply(bee, lean, 0.72); A.apply(bee, lean, 1.0); A.apply(bee, still, 1.4)
    # the arrow down the lane, close past the camera side of his head
    arrows.shoot('answer', (0.62, -18.0, 1.66), (0.62, -41.0, 1.62), 0.0, 1.5, stick=False)
    cam = Cam(lens=70, fstop=2.0)
    cam.dolly(0.0, 1.5, (5.2, -29.4, 1.3), (5.2, -29.75, 1.3), (0.1, -30.0, 1.3), (0.1, -30.05, 1.3), focus0=(0.3, -30, 1.4), focus1=(0.3, -30, 1.4))
    S.grade(bloom=0.4, vignette=0.35)
