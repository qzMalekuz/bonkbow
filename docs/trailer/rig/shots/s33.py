"""TOLLY 360, solid reference pass - the sheet's body views projected onto a 3D figure carved from
them (figure360.build_figure360): one drawing at a time, carried through its 15 degrees by real
geometry. A full, slow orbit in the snow while arrows land around him."""
import math

import bpy

import arenas as AR
import arrows
import figure360 as F
import head360 as H
import scene as S
import shotkit as K
from camera import Cam

START, END = 0.0, 6.0
LANDS = [(1.3, (-1.5, -0.9)), (2.4, (1.3, 0.8)), (3.5, (-0.9, 1.5)), (4.5, (1.6, -1.1))]


def build():
    env = AR.build_snowfall_village(snowman_at=(-8.5, 6.0), hat=False)
    for ob in list(env['col'].objects):
        if ob.location.length < 7.8 and ob.location.z < 0.5:
            bpy.data.objects.remove(ob, do_unlink=True)
    fig = F.build_figure360('tolly', 'tolly_solid', bpy.context.scene.collection, height=1.92)
    # arrows thudding into the snow round him, one after another
    for i, (t, (x, y)) in enumerate(LANDS):
        a = math.atan2(y, x)
        src = (x + math.cos(a + 0.5) * 16, y + math.sin(a + 0.5) * 16, 7.0)
        arrows.shoot('land_%d' % i, src, (x, y, 0.03), t - 0.3, 0.3)
        K.impact_puff('puff_%d' % i, (x, y, 0.05), t, color='#FFFFFF', n=9, size=0.035, spread=0.45, life=0.3, seed=i)
    cam = Cam(lens=45, fstop=5.6)
    H.bind_camera(cam.ob)
    n = 44
    for i in range(n + 1):
        k = i / n
        e = k * k * (3 - 2 * k)
        a = math.radians(360 * e)                    # one full turn, easing in and out, ending front-on
        r = 6.0 - 0.7 * math.sin(k * math.pi)
        cam.at(5.3 * k, (math.sin(a) * r, -math.cos(a) * r, 1.0), (0, 0, 0.98), focus=(0, 0, 1.0), interp='LINEAR' if 0 < i < n else 'BEZIER')
    cam.at(6.0, (0, -5.0, 1.0), (0, 0, 1.0), focus=(0, 0, 1.0))
    for i, (t, _) in enumerate(LANDS):
        cam.shake(t, 0.025, 0.15)
    S.grade(bloom=0.25, vignette=0.3)
