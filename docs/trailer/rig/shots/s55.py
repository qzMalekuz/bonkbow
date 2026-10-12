"""DAY 3 - THE SNOW SPRINT. Snowfall village. Three derps sprint toward camera through a drift.
The middle one goes under and does not come back up. The other two do not notice."""
import actions as A
import arenas as AR
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc
from shots.montage import spawn

START, END = 9.8, 11.6
CUES = [(0.0, 'whistle'), (0.1, 'steps'), (0.9, 'poof')]


def build():
    AR.build_snowfall_village(snowman_at=(-9, 7), hat=False)
    for ch, x in (('a', -1.6), ('b', 0.0), ('c', 1.6)):
        h = spawn(ch, 55, END - START, loc=(x, 8, 0), yaw=0)
        A.run_cycle(h, 0.0, 1.8, cycle=0.38)
        key_loc(h['arm'], 0.0, (x, 8.5, 0), 'LINEAR'); key_loc(h['arm'], 1.8, (x, -1.5, 0), 'LINEAR')
        if ch == 'b':
            key_loc(h['arm'], 0.85, (x, 3.8, 0), 'LINEAR'); key_loc(h['arm'], 1.05, (x, 3.4, -2.2), 'LINEAR'); key_loc(h['arm'], 1.8, (x, 3.4, -2.2))
    K.impact_puff('poof', (0, 3.6, 0.3), 0.95, color='#FFFFFF', n=30, size=0.08, spread=1.4, life=0.5, up=1.0)
    cam = Cam(lens=35, fstop=2.8)
    cam.dolly(0.0, 1.8, (0.2, -6.5, 0.6), (0.2, -6.0, 0.55), (0, 2.0, 0.9), (0, 0.5, 0.9), focus0=(0, 4, 1), focus1=(0, 0, 1))
    cam.handheld(0.02, speed=1.6)
    S.grade(bloom=0.35, vignette=0.35)
