"""SHOT 03 - THE ARENA. Blood moon over the Colosseum; tilt down through the embers to six
bows planted in a ring on the sand."""
import math

import arenas as AR
import scene as S
from camera import Cam
from common import new_collection
from props import build_bow

START, END = 3.0, 5.0
RING = 1.9


def plant_bows(col):
    bows = []
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        b = build_bow('planted_%d' % i, col)
        b.location = (math.cos(a) * RING, math.sin(a) * RING, 0.62)
        b.rotation_euler = (0, 0, a + math.pi)  # string side toward the centre
        bows.append(b)
    return bows


def build():
    AR.build_colosseum()
    plant_bows(new_collection('bows'))
    S.spot('pool', (0, -1, 9), (0, 0, 0), '#FFD0A0', 9000, size_deg=38, blend=0.8)
    cam = Cam(lens=24, fstop=5.6)
    # start on the moon, tilt down to the ring
    cam.at(0.0, (0, -17, 3.2), (0, 60, 24), focus=(0, 0, 1))
    cam.at(1.5, (0, -8.2, 2.2), (0, 0, 0.8), focus=(0, 0, 1))
    cam.at(2.0, (0, -7.4, 2.0), (0, 0, 0.75), focus=(0, 0, 1))
    S.grade(bloom=0.9, vignette=0.4)
