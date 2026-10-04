"""Camera library. One camera per shot, aimed with a Track-To target so moves are keyed as
"be here, look there". Times are shot seconds."""
import math

import bpy
from mathutils import Vector

from common import FPS, fcurves, frame, key_loc, set_interp
import game_assets as ga


class Cam:
    def __init__(self, lens=35, fstop=2.8, focus=None, name='cam'):
        sc = bpy.context.scene
        self.data = bpy.data.cameras.new(name)
        self.ob = bpy.data.objects.new(name, self.data)
        sc.collection.objects.link(self.ob)
        sc.camera = self.ob
        self.data.lens = lens
        self.data.sensor_width = 36
        self.data.clip_start = 0.05
        self.data.clip_end = 600
        self.target = bpy.data.objects.new(name + '_target', None)
        self.target.empty_display_size = 0.2
        sc.collection.objects.link(self.target)
        tr = self.ob.constraints.new('TRACK_TO')
        tr.target = self.target
        tr.track_axis = 'TRACK_NEGATIVE_Z'
        tr.up_axis = 'UP_Y'
        self.track = tr
        # depth of field follows its own focus empty (rack focus = move it)
        self.focus = bpy.data.objects.new(name + '_focus', None)
        sc.collection.objects.link(self.focus)
        self.data.dof.use_dof = True
        self.data.dof.focus_object = self.focus
        self.data.dof.aperture_fstop = fstop
        self.data.dof.aperture_blades = 7
        ga.bind_camera(self.ob)

    # -- keys -----------------------------------------------------------------
    def at(self, t, pos, look, focus=None, lens=None, interp='BEZIER', roll=None):
        """Camera at `pos` looking at `look` at time t; focus on `focus` (default: look)."""
        key_loc(self.ob, t, pos, interp)
        key_loc(self.target, t, look, interp)
        key_loc(self.focus, t, focus if focus is not None else look, interp)
        if lens is not None:
            self.data.lens = lens
            self.data.keyframe_insert('lens', frame=frame(t))
        if roll is not None:
            self.ob.rotation_euler.z = 0
        return self

    def dolly(self, t0, t1, pos0, pos1, look0, look1=None, focus0=None, focus1=None, lens0=None, lens1=None):
        self.at(t0, pos0, look0, focus0, lens0)
        self.at(t1, pos1, look1 if look1 is not None else look0, focus1 if focus1 is not None else focus0, lens1)
        return self

    def push_in(self, t0, t1, pos0, look, amount=0.3, focus=None):
        p0 = Vector(pos0)
        p1 = p0 + (Vector(look) - p0) * amount
        return self.dolly(t0, t1, p0, p1, look, look, focus, focus)

    def orbit(self, t0, t1, centre, radius, height, a0_deg, a1_deg, look=None, steps=8, focus=None):
        """Arc round `centre` (angle 0 = on -Y, looking toward +Y; positive = counter-clockwise from above)."""
        c = Vector(centre)
        for i in range(steps + 1):
            k = i / steps
            a = math.radians(a0_deg + (a1_deg - a0_deg) * k)
            p = c + Vector((math.sin(a) * radius, -math.cos(a) * radius, height))
            self.at(t0 + (t1 - t0) * k, p, look if look is not None else c, focus, interp='LINEAR' if 0 < i < steps else 'BEZIER')
        return self

    def rack_focus(self, t0, t1, p0, p1):
        key_loc(self.focus, t0, p0); key_loc(self.focus, t1, p1)
        return self

    def fstop(self, t, f):
        self.data.dof.aperture_fstop = f
        self.data.dof.keyframe_insert('aperture_fstop', frame=frame(t))
        return self

    def lens(self, t, mm):
        self.data.lens = mm
        self.data.keyframe_insert('lens', frame=frame(t))
        return self

    def handheld(self, amount=0.02, speed=1.0, seed=0):
        """Noise on the camera position and its look-at target (after all keys are set)."""
        for ob, scale in ((self.ob, amount), (self.target, amount * 0.6)):
            ad = ob.animation_data
            if not ad or not ad.action:
                ob.keyframe_insert('location', frame=1)
                ad = ob.animation_data
            for i, fc in enumerate([f for f in fcurves(ad.action) if f.data_path == 'location']):
                m = fc.modifiers.new('NOISE')
                m.strength = scale * (1.0 if i != 1 else 0.6)
                m.scale = 18.0 / speed
                m.phase = seed * 37.1 + i * 11.3 + (5 if ob is self.target else 0)
                m.depth = 1
        return self

    def whip(self, t0, t1, look0, look1):
        """Fast pan of the look-at target; motion blur does the rest."""
        key_loc(self.target, t0, look0); key_loc(self.target, t1, look1)
        key_loc(self.focus, t0, look0); key_loc(self.focus, t1, look1)
        return self

    def follow(self, obj, offset, t0, t1, look_offset=(0, 0, 0), step=1):
        """Bake the camera to ride along `obj` (arrow-cam): position = obj * offset each frame."""
        sc = bpy.context.scene
        f0, f1 = frame(t0), frame(t1)
        for f in range(f0, f1 + 1, step):
            sc.frame_set(f)
            mw = obj.matrix_world
            p = mw @ Vector(offset)
            l = mw @ Vector(look_offset)
            self.ob.location = p; self.ob.keyframe_insert('location', frame=f)
            self.target.location = l; self.target.keyframe_insert('location', frame=f)
            self.focus.location = l; self.focus.keyframe_insert('location', frame=f)
        for ob in (self.ob, self.target, self.focus):
            for fc in fcurves(ob.animation_data.action):
                for kp in fc.keyframe_points:
                    if f0 <= kp.co.x <= f1:
                        kp.interpolation = 'LINEAR'
        return self

    def shake(self, t, amount=0.06, duration=0.25):
        """A short impact jolt at time t."""
        base = self.ob.location.copy()
        sc = bpy.context.scene
        import random
        rnd = random.Random(int(t * 1000))
        f0 = frame(t)
        n = max(2, int(duration * FPS))
        for i in range(n):
            sc.frame_set(f0 + i)
            k = (1 - i / n) ** 2
            self.ob.location = self.ob.location + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amount * k
            self.ob.keyframe_insert('location', frame=f0 + i)
        return self
