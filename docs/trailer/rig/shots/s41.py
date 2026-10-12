"""DERP 01 - BEAUTIFUL OPENING. A macro on a steel arrowhead in sunset light, dew running down
the shaft. Cut wider: the archer is at full, solemn draw - with the arrow in backwards."""
import math

import bpy

import actions as A
import arenas as AR
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_scale, principled
from mathutils import Vector

START, END = 0.0, 2.2
CUES = [(0.0, 'drone'), (0.55, 'drip'), (1.3, 'braam'), (1.35, 'creak')]
CUT = 1.3


def stage(seconds, shot, draw=0.55):
    """The meadow at sunset and archer A at the origin, aiming along +X with the arrow reversed."""
    AR.build_golden_meadow(sunset=True, grass_height=0.28, grass_density=240, grass_y=(-7, 5), grass_x=(-9, 12), fence_y=7.0)
    h = D.spawn('a', 'bean', shot, 'a', seconds)
    A.apply(h, A.P_aim(draw, head_yaw=38), 0.0)
    nk = h['nocked']
    nk.rotation_euler = (0, 0, math.pi); nk.location = (-0.14, 0, 0)   # arrowhead past his fist, at his own nose; fletching at the target
    A.nocked(h, 0.0, True)
    K.rim_light((0, 0, 1.0), offset=(-3.0, 3.0, 1.5), color='#FF9A4A', energy=380)
    return h


def build():
    h = stage(END - START, 41)
    A.apply(h, A.P_aim(0.5, head_yaw=38), 0.0); A.apply(h, A.P_aim(0.58, head_yaw=38), 2.2)
    # the beauty arrow for the macro: its own little set in the same light, gone after the cut
    from props import build_arrow
    hero = build_arrow('beauty', bpy.context.scene.collection)
    hero.location = (4.0, -3.0, 0.75); hero.rotation_euler = (0.5, 0, 0)
    key_scale(hero, 0.0, 1.0, interp='CONSTANT'); key_scale(hero, CUT, 0.0, interp='CONSTANT')
    tip = Vector(hero.location)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.007, segments=16, ring_count=10)
    d = bpy.context.object
    for p in d.data.polygons:
        p.use_smooth = True
    d.data.materials.append(principled('dew', (0.9, 0.95, 1.0, 1), rough=0.02, spec=1.0))
    d.parent = hero
    key_loc(d, 0.0, (-0.30, 0, 0.012)); key_loc(d, 1.3, (-0.11, 0, 0.012))
    for ch in hero.children:
        if ch.name.endswith('_head'):
            ch.scale = (1, 0.32, 1.25)
            ch.data.materials[0] = principled('macro_steel', (0.62, 0.64, 0.68, 1), rough=0.26, metal=0.8)
    S.area('card', tuple(tip + Vector((0.1, -0.6, 0.5))), tuple(tip), '#FFC890', 30, size=0.9)
    cam = Cam(lens=100, fstop=1.8)
    C = 'CONSTANT'
    a = tip + Vector((-0.07, 0, 0.0))
    cam.at(0.0, tuple(a + Vector((0.16, -0.62, 0.03))), tuple(a + Vector((0.08, 0, 0))), focus=tuple(a + Vector((0.25, 0, 0))), interp='LINEAR')
    cam.at(CUT - 2 / 30, tuple(a + Vector((0.06, -0.58, 0.03))), tuple(a), focus=tuple(a), interp=C)
    cam.at(CUT, (0.9, -4.6, 0.95), (0.15, 0, 0.98), focus=(0, 0, 1.1), interp='LINEAR')
    cam.at(2.2, (0.8, -4.25, 0.95), (0.15, 0, 0.98), focus=(0, 0, 1.1))
    cam.lens(0.0, 100); cam.data.keyframe_insert('lens', frame=int(CUT * 30))
    cam.data.lens = 55; cam.data.keyframe_insert('lens', frame=int(CUT * 30) + 1)
    cam.fstop(0.0, 1.8); cam.data.dof.keyframe_insert('aperture_fstop', frame=int(CUT * 30)); cam.data.dof.aperture_fstop = 2.8; cam.data.dof.keyframe_insert('aperture_fstop', frame=int(CUT * 30) + 1)
    from common import fcurves
    for holder in (cam.data,):
        for fc in fcurves(holder.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = C
    S.grade(bloom=0.7, vignette=0.45)
