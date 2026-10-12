"""SHOT 04 - SIX BOWS. Slow orbit of the ring; as the camera passes each bow a black mitten
reaches in and takes it. Six hands, no faces."""
import math

import bmesh
import bpy
from mathutils import Vector

import arenas as AR
import scene as S
from camera import Cam
from common import hexc, key_loc, key_rot, new_collection, principled
from shots.s03 import RING, plant_bows

START, END = 5.0, 6.5
TAKES = [0.18, 0.40, 0.62, 0.84, 1.06, 1.28]


def mitten(name, col):
    """A hero's forearm and mitten, as on the chibi suit: reaches along its local +X."""
    suit = principled('mitten_suit', hexc('#0E0E10'), rough=0.6)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.085)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.065, radius2=0.07, depth=0.7,
                          matrix=__import__('mathutils').Matrix.Translation((-0.38, 0, 0)) @ __import__('mathutils').Euler((0, math.pi / 2, 0)).to_matrix().to_4x4())
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(suit)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob


def build():
    AR.build_colosseum()
    col = new_collection('bows')
    bows = plant_bows(col)
    S.spot('pool', (0, -1, 9), (0, 0, 0), '#FFD0A0', 9000, size_deg=38, blend=0.8)
    for i, (b, t) in enumerate(zip(bows, TAKES)):
        a = i / 6 * math.tau + math.pi / 6
        out = Vector((math.cos(a), math.sin(a), 0))
        grip = Vector(b.location)
        m = mitten('hand_%d' % i, col)
        m.rotation_euler = (0, 0.25, a + math.pi)  # reaching inward
        key_loc(m, t - 0.16, tuple(grip + out * 1.6 + Vector((0, 0, 0.5))))
        key_loc(m, t, tuple(grip + out * 0.07))
        key_loc(m, t + 0.05, tuple(grip + out * 0.07))
        key_loc(m, t + 0.24, tuple(grip + out * 2.2 + Vector((0, 0, 0.9))))
        key_loc(b, t + 0.05, tuple(grip))
        key_loc(b, t + 0.24, tuple(grip + out * 2.13 + Vector((0, 0, 0.9))))
        key_rot(b, t + 0.05, (0, 0, math.degrees(a + math.pi)))
        key_rot(b, t + 0.24, (25, 0, math.degrees(a + math.pi)))
    cam = Cam(lens=30, fstop=3.2)
    cam.orbit(0.0, 1.5, (0, 0, 0), 4.4, 0.85, -38, 38, look=(0, 0, 0.75), steps=10, focus=(0, -1.2, 0.7))
    S.grade(bloom=0.9, vignette=0.4)
