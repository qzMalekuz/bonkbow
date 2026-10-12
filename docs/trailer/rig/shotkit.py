"""Small helpers shared by the shot files."""
import math

import bpy
from mathutils import Vector

import actions as A
import game_assets as ga
import scene as S
from common import frame, hexc, key_loc, new_collection


def hero(name, loc=(0, 0, 0), yaw=0.0, pose=None, expr=None, t=0.0):
    """Build a hero with controls, standing at `loc`, facing yaw (0 = -Y), in `pose`."""
    h = ga.build_hero(name, new_collection('heroes'))
    A.setup_controls(h)
    h['arm'].location = loc
    h['arm'].rotation_euler = (0, 0, math.radians(yaw))
    A.apply(h, pose or A.P_idle(), t)
    if expr:
        A.expression(h, expr)
    return h


def key_light(target, offset=(-2.5, -3.5, 3.0), color='#FFE8D0', energy=900, size=2.5, name='key'):
    """Soft area key aimed at `target` (a point), from target + offset."""
    t = Vector(target)
    return S.area(name, tuple(t + Vector(offset)), tuple(t), color, energy, size)


def rim_light(target, offset=(1.5, 3.5, 2.5), color='#BFE0FF', energy=700, size=1.5, name='rim'):
    t = Vector(target)
    return S.area(name, tuple(t + Vector(offset)), tuple(t), color, energy, size)


def head_pos(h):
    """World position of the hero's head centre at the current frame."""
    return h['head'].matrix_world.translation.copy() + Vector((0, 0, ga.HEAD_H * 0.5))


def at_frame(t):
    bpy.context.scene.frame_set(frame(t))
    bpy.context.view_layer.update()


def impact_puff(name, loc, t, color='#E8D8B8', n=10, size=0.06, spread=0.5, life=0.35, seed=1, up=0.4):
    """A burst of small chips/dust flying out from an impact point at time t (keyed, deterministic)."""
    import random
    from common import key_scale, principled
    rnd = random.Random(seed)
    mat = principled(name + '_mat', hexc(color), rough=0.9)
    out = []
    for i in range(n):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size * (0.5 + rnd.random()), location=loc)
        o = bpy.context.object
        o.name = '%s_%d' % (name, i)
        o.data.materials.append(mat)
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized() * spread * (0.4 + rnd.random())
        key_scale(o, max(0, t - 1 / 30), 0.0, interp='CONSTANT')
        key_scale(o, t, 1.0, interp='CONSTANT')
        key_loc(o, t, loc, 'LINEAR')
        key_loc(o, t + life * 0.5, tuple(Vector(loc) + d * 0.7 + Vector((0, 0, up * 0.25))), 'LINEAR')
        key_loc(o, t + life, tuple(Vector(loc) + d + Vector((0, 0, -up * 0.3))), 'LINEAR')
        key_scale(o, t + life, 0.0)
        out.append(o)
    return out


def glint(name, loc, t, size=0.5, color='#FFFFFF', life=0.35, strength=60):
    """A four-point star flash at `loc`, peaking at time t (camera-facing via Track-To)."""
    from common import key_scale, principled
    sc = bpy.context.scene
    mat = principled(name + '_mat', hexc(color), emit=hexc(color), emit_str=strength)
    root = bpy.data.objects.new(name, None); sc.collection.objects.link(root)
    root.location = loc
    for i, rot in enumerate((0.0, math.pi / 2, math.pi / 4, -math.pi / 4)):
        L = 1.0 if i < 2 else 0.45
        verts = [(-L, 0, 0), (0, 0, 0.035), (L, 0, 0), (0, 0, -0.035)]
        me = bpy.data.meshes.new('%s_%d' % (name, i)); me.from_pydata(verts, [], [(0, 1, 2, 3)]); me.materials.append(mat)
        o = bpy.data.objects.new(me.name, me); sc.collection.objects.link(o)
        o.parent = root; o.rotation_euler = (0, rot, 0); o.visible_shadow = False
    tr = root.constraints.new('TRACK_TO'); tr.target = sc.camera; tr.track_axis = 'TRACK_NEGATIVE_Y'; tr.up_axis = 'UP_Z'
    key_scale(root, max(0, t - life * 0.4), 0.0); key_scale(root, t, size); key_scale(root, t + life * 0.6, 0.0)
    return root


def follow_bone(obj, h, bone, offset=(0, 0, 0)):
    """Parent obj to a hero bone (offset in bone space from the bone's head)."""
    arm = h['arm']
    obj.parent = arm; obj.parent_type = 'BONE'; obj.parent_bone = bone
    L = arm.data.bones[bone].length
    obj.location = (offset[0], offset[1] - L, offset[2])
    return obj
