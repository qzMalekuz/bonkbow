"""SHOT 02 - BOWSTRING. ECU on a black mitten at full draw, the string trembling, breath in
the cold air. Slow dolly left. No face."""
import bpy

import actions as A
import arenas as AR
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import fcurves, key_loc, key_scale, principled

START, END = 1.5, 3.0


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.15)
    h = K.hero('mert', (0, 0, 0), yaw=0, pose=A.P_aim(1.0))
    A.nocked(h, 0, True)
    A.apply(h, A.P_aim(0.94), 0.0); A.apply(h, A.P_aim(1.0), 1.5)
    # tremble on the draw hand
    c = h['ctrl']['hand_R']
    for fc in fcurves(c.animation_data.action):
        if fc.data_path == 'location':
            m = fc.modifiers.new('NOISE'); m.strength = 0.006; m.scale = 0.7
    K.at_frame(0.7)
    nock = bpy.data.objects[h['bow']['nock']].matrix_world.translation.copy()
    K.key_light(nock, offset=(-1.2, -1.6, 0.8), color='#FFB070', energy=120, size=0.8)
    K.rim_light(nock, offset=(1.0, 1.4, 0.6), color='#8FB4FF', energy=90, size=0.6)
    # breath: two soft puffs drifting off
    for i, t0 in enumerate((0.35, 0.95)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.05, location=(0, 0, 0))
        p = bpy.context.object; p.name = 'breath_%d' % i
        p.data.materials.append(principled('breath', (0.8, 0.85, 0.95, 1), rough=1.0, alpha=0.10))
        p.visible_shadow = False
        base = nock + __import__('mathutils').Vector((-0.12, -0.16, 0.2))
        key_loc(p, t0, tuple(base)); key_loc(p, t0 + 0.6, tuple(base + __import__('mathutils').Vector((0.22, -0.1, 0.1))))
        key_scale(p, max(0, t0 - 0.04), 0.0); key_scale(p, t0 + 0.1, 0.8); key_scale(p, t0 + 0.6, 2.4)
    cam = Cam(lens=85, fstop=1.8)
    cam.dolly(0.0, 1.5, tuple(nock + __import__('mathutils').Vector((0.38, -0.85, 0.02))), tuple(nock + __import__('mathutils').Vector((0.16, -0.85, 0.03))),
              tuple(nock + __import__('mathutils').Vector((0.14, 0, 0.0))), tuple(nock + __import__('mathutils').Vector((0.08, 0, 0.0))), focus0=tuple(nock), focus1=tuple(nock))
    S.grade(bloom=0.7, vignette=0.45)
