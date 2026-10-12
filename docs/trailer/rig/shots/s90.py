"""Look test: one derp archer in the golden meadow."""
import actions as A
import arenas as AR
import derp as D
import scene as S
from camera import Cam

START, END = 0.0, 1.0


def build():
    AR.build_golden_meadow(sunset=True, grass_height=0.3, grass_density=200, grass_y=(-6, 6), grass_x=(-8, 8))
    for i, (kind, x, pose) in enumerate((('bean', -1.2, A.P_idle()), ('pea', 0.2, A.P_aim(1.0, head_yaw=70)), ('slab', 1.6, A.P_idle()), ('egg', 2.9, A.P_idle()))):
        h = D.ready(D.build('d%d' % i, kind, shot=90, char='a', frames=30))
        h['arm'].location = (x, 0, 0)
        A.apply(h, pose, 0.0)
        if i == 1:
            A.nocked(h, 0.0, True)
    cam = Cam(lens=50, fstop=4.0)
    cam.at(0, (0.9, -7.5, 0.9), (0.9, 0, 0.85), focus=(0, 0, 1.0))
    S.grade(bloom=0.5, vignette=0.35)
