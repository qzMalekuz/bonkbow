"""Deterministic arrow flights. Every important arrow is keyed, not simulated, so it arrives
on the intended frame (SCRIPT.md section 12)."""
import math

import bpy
from mathutils import Vector

from common import FPS, frame, key_scale, set_interp
from props import ARROW_LEN, build_arrow


def _orient(v):
    """Euler that points the arrow's +X (tip direction) along v."""
    return Vector(v).normalized().to_track_quat('X', 'Z').to_euler()


def shoot(name, src, dst, t0, duration, arc=0.0, white=False, col=None, stick=True, wobble=True, spin=0.0,
          hide_after=None, steps=None, visible_before=False):
    """Fly an arrow from `src` to `dst` (tip positions) leaving at t0 and landing `duration`
    seconds later. `arc` lifts the middle of the path (metres). After impact it stays stuck in
    place, quivering for a moment. Returns the arrow object."""
    col = col or bpy.context.scene.collection
    a = build_arrow(name, col, white=white)
    src, dst = Vector(src), Vector(dst)
    n = steps or max(2, int(round(duration * FPS)))
    a.rotation_mode = 'XYZ'
    if not visible_before:
        a.scale = (0, 0, 0); a.keyframe_insert('scale', frame=max(1, frame(t0) - 1))   # always the frame before
    key_scale(a, t0, 1.0, interp='CONSTANT')
    prev = None
    for i in range(n + 1):
        k = i / n
        p = src.lerp(dst, k) + Vector((0, 0, arc * 4 * k * (1 - k)))
        # tangent
        k2 = min(1.0, k + 0.01)
        p2 = src.lerp(dst, k2) + Vector((0, 0, arc * 4 * k2 * (1 - k2)))
        d = (p2 - p) if (p2 - p).length > 1e-6 else (dst - src)
        t = t0 + duration * k
        a.location = p
        a.keyframe_insert('location', frame=frame(t))
        e = _orient(d)
        if prev is not None:
            e.make_compatible(prev)
        if spin:
            e.x += spin * k
        a.rotation_euler = e
        a.keyframe_insert('rotation_euler', frame=frame(t))
        prev = e.copy()
    for fc in _fc(a):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    for fc in _fc(a):
        if fc.data_path == 'scale':
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'
    t_hit = t0 + duration
    if stick and wobble:
        base = a.rotation_euler.copy()
        for j, amp in enumerate((0.09, -0.06, 0.035, -0.02, 0.0)):
            a.rotation_euler = (base.x, base.y + amp, base.z + amp * 0.5)
            a.keyframe_insert('rotation_euler', frame=frame(t_hit) + 1 + j * 2)
    if hide_after is not None:
        key_scale(a, hide_after, 0.0, interp='CONSTANT')
    if not stick:
        key_scale(a, t_hit + 1.0 / FPS, 0.0, interp='CONSTANT')
    a['t_hit'] = t_hit
    return a


def _fc(ob):
    from common import fcurves
    return fcurves(ob.animation_data.action) if ob.animation_data and ob.animation_data.action else []


def path(name, points, t0, duration, white=False, col=None, stick=True, hide_after=None):
    """Fly through several points (a ricochet): equal speed per segment length."""
    col = col or bpy.context.scene.collection
    a = build_arrow(name, col, white=white)
    pts = [Vector(p) for p in points]
    lens = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(lens)
    key_scale(a, max(0, t0 - 1.0 / FPS), 0.0, interp='CONSTANT')
    key_scale(a, t0, 1.0, interp='CONSTANT')
    t = t0
    a.rotation_mode = 'XYZ'
    prev = None
    for i in range(len(pts) - 1):
        seg_t = duration * lens[i] / total
        e = _orient(pts[i + 1] - pts[i])
        if prev is not None:
            e.make_compatible(prev)
        for k, tt in ((0.0, t), (1.0, t + seg_t - (1.0 / FPS if i < len(pts) - 2 else 0))):
            a.location = pts[i].lerp(pts[i + 1], k)
            a.keyframe_insert('location', frame=frame(tt))
            a.rotation_euler = e
            a.keyframe_insert('rotation_euler', frame=frame(tt))
        prev = e.copy()
        t += seg_t
    for fc in _fc(a):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT' if fc.data_path == 'scale' else 'LINEAR'
    if hide_after is not None:
        key_scale(a, hide_after, 0.0, interp='CONSTANT')
    if not stick:
        key_scale(a, t0 + duration + 1.0 / FPS, 0.0, interp='CONSTANT')
    a['t_hit'] = t0 + duration
    return a


def stuck(name, tip, direction, col=None, white=False):
    """An arrow already buried in something: tip at `tip`, having flown along `direction`."""
    col = col or bpy.context.scene.collection
    a = build_arrow(name, col, white=white)
    a.location = Vector(tip)
    a.rotation_euler = _orient(direction)
    return a


def release_point(h):
    """World position of the nocked arrow's tip and its direction right now (current frame)."""
    nk = h['nocked']
    mw = nk.matrix_world
    tip = mw.translation.copy()
    # direction from the bow, not the arrow: the nocked arrow is scaled to zero once released
    d = (h['bow'].matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
    return tip, d
