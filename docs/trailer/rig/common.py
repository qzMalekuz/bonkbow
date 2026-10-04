"""Shared helpers for the trailer rig: paths, colour, easing, keyframing. Runs inside Blender's Python."""
import math
import os
import sys

import bpy
from mathutils import Euler, Quaternion, Vector

RIG = os.path.dirname(os.path.abspath(__file__))
TRAILER = os.path.dirname(RIG)
ROOT = os.path.dirname(os.path.dirname(TRAILER))  # the game repo
ASSETS = os.path.join(ROOT, 'assets')
BUILD = os.path.join(TRAILER, 'build')
if RIG not in sys.path:
    sys.path.insert(0, RIG)

FPS = 30
W, H = 1920, 1080


def hexc(s, alpha=1.0):
    """'#RRGGBB' (sRGB) -> linear RGBA tuple, the way Blender wants colours."""
    s = s.lstrip('#')
    r, g, b = (int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), alpha)


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = clamp(t)
    return t ** 3


def frame(t):
    """seconds (shot-local) -> integer frame, 1-based."""
    return int(round(t * FPS)) + 1


def key(obj, path, value, t, index=-1, interp='BEZIER'):
    """Set a data path at shot time t (seconds) and keyframe it."""
    if index >= 0:
        getattr(obj, path)[index] = value
    else:
        setattr(obj, path, value)
    obj.keyframe_insert(data_path=path, index=index, frame=frame(t))
    ad = obj.id_data.animation_data if hasattr(obj, 'id_data') else obj.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                if kp.co.x == frame(t):
                    kp.interpolation = interp


def key_loc(obj, t, loc, interp='BEZIER'):
    obj.location = Vector(loc)
    obj.keyframe_insert('location', frame=frame(t))
    set_interp(obj, 'location', t, interp)


def key_rot(obj, t, euler_deg, interp='BEZIER'):
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = Euler([math.radians(a) for a in euler_deg], 'XYZ')
    obj.keyframe_insert('rotation_euler', frame=frame(t))
    set_interp(obj, 'rotation_euler', t, interp)


def key_scale(obj, t, s, interp='BEZIER'):
    obj.scale = Vector(s if hasattr(s, '__len__') else (s, s, s))
    obj.keyframe_insert('scale', frame=frame(t))
    set_interp(obj, 'scale', t, interp)


def key_prop(obj, prop, t, value, interp='BEZIER'):
    obj[prop] = value
    obj.keyframe_insert('["%s"]' % prop, frame=frame(t))
    set_interp(obj, '["%s"]' % prop, t, interp)


def set_interp(obj, path, t, interp):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    f = frame(t)
    for fc in fcurves(ad.action):
        if fc.data_path == path:
            for kp in fc.keyframe_points:
                if abs(kp.co.x - f) < 0.5:
                    kp.interpolation = interp


def fcurves(action):
    """Blender 4.4+ slotted actions keep fcurves under layers; older under action.fcurves."""
    if hasattr(action, 'layers') and action.layers:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out.extend(cb.fcurves)
        return out
    return list(action.fcurves)


def linear_all(obj):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in fcurves(ad.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'


def cycle(obj, path=None):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in fcurves(ad.action):
            if path is None or fc.data_path == path:
                if not any(m.type == 'CYCLES' for m in fc.modifiers):
                    fc.modifiers.new('CYCLES')


def new_collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def empty(name, loc=(0, 0, 0), col=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    (col or bpy.context.scene.collection).objects.link(e)
    return e


def look_at(obj, target, up=(0, 0, 1)):
    """Point -Z of obj at target (cameras/lights look down -Z)."""
    d = (Vector(target) - obj.matrix_world.translation).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def principled(name, color=(0.8, 0.8, 0.8, 1), rough=0.6, metal=0.0, emit=None, emit_str=1.0, spec=0.5, alpha=1.0, subsurface=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = emit
        bsdf.inputs['Emission Strength'].default_value = emit_str
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else None
    if subsurface > 0 and 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
    return m


def mesh_object(name, verts, faces, col=None, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    if mat:
        me.materials.append(mat)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob


def three_to_blender(v):
    """three.js (x, y up, z toward camera) -> Blender (x, -z, y)."""
    return (v[0], -v[2], v[1])


def rotate_y_deg(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)
