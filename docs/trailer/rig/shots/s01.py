"""SHOT 01 - ARROWHEAD. Macro: a steel arrowhead slides into focus, a drop of dew runs down the
shaft, firelight flickers on the edge."""
import bpy

import scene as S
from camera import Cam
from common import hexc, key_loc, key_scale, principled, fcurves
from props import build_arrow

START, END = 0.0, 1.5


def build():
    S.sky('#000000', '#030203', strength=0.2)
    col = bpy.context.scene.collection
    a = build_arrow('arrow', col)
    a.rotation_euler = (0.5, 0, 0)
    # the arrow drifts forward into the focal plane
    key_loc(a, 0.0, (-0.10, 0, 0)); key_loc(a, 1.5, (0.0, 0, 0))
    # dew: a glossy bead sliding down the shaft toward the head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0075, segments=16, ring_count=10)
    d = bpy.context.object; d.name = 'dew'
    for p in d.data.polygons:
        p.use_smooth = True
    d.data.materials.append(principled('dew', (0.9, 0.95, 1.0, 1), rough=0.02, spec=1.0, metal=0.0))
    d.parent = a
    key_loc(d, 0.0, (-0.34, 0, 0.012)); key_loc(d, 1.5, (-0.105, 0, 0.012))
    key_scale(d, 0.0, (1.5, 1, 1)); key_scale(d, 1.5, (1.9, 1, 0.9))
    # firelight (warm, flickering) from the left, a cold edge from behind
    fire = S.point('fire', (-0.5, -0.5, 0.25), '#FF8A3A', 26, radius=0.08)
    fire.data.keyframe_insert('energy', frame=1)
    for fc in fcurves(fire.data.animation_data.action):
        m = fc.modifiers.new('NOISE'); m.strength = 16; m.scale = 2.2
    S.point('edge', (0.35, 0.5, 0.2), '#7FA8FF', 9, radius=0.05)
    S.area('card', (-0.1, -0.5, 0.7), (-0.05, 0, 0), '#FFD0A0', 22, size=0.9)
    for ch in a.children:
        if ch.name.endswith('_head'):
            ch.scale = (1, 0.32, 1.25)
            ch.data.materials[0] = principled('macro_steel', (0.62, 0.64, 0.68, 1), rough=0.28, metal=0.75)
    S.point('ember_glow', (0.6, 1.6, -0.2), '#FF5A1E', 40, radius=0.6)
    # out-of-focus embers behind
    S.particles('embers', 90, (-1.2, 0.6, -0.6), (1.2, 2.4, 0.8), (0.03, 0, 0.12), radius=0.006, color='#FF8A30', emit=60, seed=2, sway=0.03)
    cam = Cam(lens=100, fstop=1.6)
    cam.dolly(0.0, 1.5, (0.10, -0.62, 0.05), (0.04, -0.56, 0.04), (-0.08, 0, 0.0), (-0.05, 0, 0.0), focus0=(0.25, 0, 0), focus1=(-0.04, 0, 0))
    S.grade(bloom=0.8, vignette=0.5)
