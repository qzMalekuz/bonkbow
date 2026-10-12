"""DAY 1 - THE RUN. Golden meadow at dawn. Four derps jog past in a line with a coach's whistle:
one of them is running backwards, and the one in front trips over nothing."""
import actions as A
import arenas as AR
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from shots.montage import spawn

START, END = 2.4, 4.2
CUES = [(0.0, 'whistle'), (0.1, 'steps'), (1.15, 'thud')]


def build():
    AR.build_golden_meadow(sunset=True, grass_height=0.28, grass_density=200, grass_y=(-6, 5), grass_x=(-10, 10), fence_y=7.0)
    hs = []
    for i, (ch, x0, yaw) in enumerate((('a', -6.5, 90), ('b', -8.0, 90), ('c', -9.5, 90), ('d', -11.0, -90))):   # d runs backwards
        h = spawn(ch, 51, END - START, loc=(x0, 0, 0), yaw=yaw)
        A.run_cycle(h, 0.0, 1.8, cycle=0.4)
        key_loc(h['arm'], 0.0, (x0, 0, 0), 'LINEAR'); key_loc(h['arm'], 1.8, (x0 + 9.0, 0, 0), 'LINEAR')
        hs.append(h)
    # c trips: flat on his face, slides
    c = hs[2]['arm']
    key_rot(c, 1.1, (0, 0, 90)); key_rot(c, 1.25, (0, 90, 90), 'LINEAR'); key_rot(c, 1.8, (0, 90, 90))
    key_loc(c, 1.1, (-9.5 + 5.5, 0, 0), 'LINEAR'); key_loc(c, 1.3, (-9.5 + 6.6, 0, 0.25), 'LINEAR'); key_loc(c, 1.8, (-9.5 + 7.6, 0, 0.0), 'LINEAR')
    K.impact_puff('dust', (-2.0, 0, 0.05), 1.28, color='#D8C070', n=12, size=0.05, spread=0.9, life=0.4)
    cam = Cam(lens=45, fstop=2.8)
    cam.dolly(0.0, 1.8, (-5.0, -4.6, 0.8), (0.5, -4.6, 0.8), (-5.0, 0, 0.85), (0.5, 0, 0.85), focus0=(-5, 0, 1), focus1=(0.5, 0, 1))
    cam.handheld(0.02, speed=1.6)
    S.grade(bloom=0.5, vignette=0.4)
