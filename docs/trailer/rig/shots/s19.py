"""SHOT 19 - TOLLY'S SNOW DODGE. Fast and playful, four beats cut inside the shot: he ducks
behind a cottage as an arrow punches through the snowman; pops out by a pine and looses; pops
out by the well and looses; slides out from under a sleigh with a huge grin."""
import math

import bpy

import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot, key_scale

START, END = 47.0, 49.0
CUES = [(0.0, 'crunch'), (0.3, 'thock'), (0.32, 'pop'), (0.85, 'release'), (0.6, 'pop'), (1.3, 'release'), (1.05, 'pop'), (1.55, 'pop'), (1.7, 'bell')]
CUTS = [0.0, 0.6, 1.05, 1.5]


def build():
    env = AR.build_snowfall_village(snowman_at=(0.0, 0.0), hat=False)
    sm = env['snowman']
    sl = AR.sleigh(env['col'], (-7.5, -1.0, 0), 0.0)
    # beat 1: sprinting off to the right as the arrow bursts the snowman
    a = K.hero('tolly', (0.9, 0.2, 0), yaw=90)
    A.run_cycle(a, 0.0, 0.6, cycle=0.3)
    key_loc(a['arm'], 0.0, (0.7, 0.3, 0), 'LINEAR'); key_loc(a['arm'], 0.6, (6.5, 1.5, 0), 'LINEAR')
    A.expression(a, 'shock')
    arrows.shoot('punch', (-9, -6, 2.2), (0.0, 0.0, 1.0), 0.1, 0.2, stick=False)
    key_scale(sm, 0.29, 3.4, interp='CONSTANT'); key_scale(sm, 0.31, 0.0, interp='CONSTANT')
    K.impact_puff('burst', (0, 0, 0.9), 0.3, color='#FFFFFF', n=36, size=0.12, spread=2.2, life=0.5, up=1.0)
    # beat 2: out from behind a pine, loose
    b = K.hero('tolly', (9.0, 4.0, 0), yaw=0)
    A.apply(b, A.P_aim(0.3, head_yaw=80), 0.6); A.apply(b, A.P_aim(1.0, head_yaw=80), 0.8); A.apply(b, A.P_shoot(head_yaw=80), 0.9, interp='LINEAR'); A.apply(b, A.P_shoot(head_yaw=80), 1.1)
    A.nocked(b, 0.0, True); A.nocked(b, 0.85, False)
    key_loc(b['arm'], 0.6, (7.6, 4.0, 0)); key_loc(b['arm'], 0.74, (9.0, 4.0, 0))
    A.expression(b, 'wink')
    arrows.shoot('r1', (9.9, 3.8, 0.92), (24, 3.4, 1.1), 0.85, 0.3, stick=False)
    # beat 3: up from behind the well, loose the other way
    c = K.hero('tolly', (7.5, 7.4, -1.2), yaw=0)
    A.apply(c, A.P_aim(0.5, head_yaw=80), 1.05); A.apply(c, A.P_aim(1.0, head_yaw=80), 1.25); A.apply(c, A.P_shoot(head_yaw=80), 1.35, interp='LINEAR'); A.apply(c, A.P_shoot(head_yaw=80), 1.5)
    A.nocked(c, 0.0, True); A.nocked(c, 1.3, False)
    key_loc(c['arm'], 1.05, (8.3, 7.6, 0)); key_loc(c['arm'], 1.2, (9.9, 7.0, 0))
    A.expression(c, 'wink')
    arrows.shoot('r2', (10.8, 6.8, 0.92), (24, 6.6, 1.1), 1.3, 0.3, stick=False)
    # beat 4: slides out from under the sleigh, grin
    d = K.hero('tolly', (-7.5, -1.0, 0), yaw=0)
    up = A.P_idle(); up.hand_L = (0.6, -0.25, 1.05); up.hand_R = (-0.6, -0.25, 1.05)
    A.apply(d, up, 1.5); A.apply(d, up, 2.0)
    key_loc(d['arm'], 1.5, (-7.5, -0.2, -1.6)); key_loc(d['arm'], 1.74, (-7.5, -0.2, -0.55)); key_loc(d['arm'], 2.0, (-7.5, -0.2, -0.5))
    A.expression(d, 'smile')
    # each Tolly exists only for his own beat
    from common import frame
    for hh, (t0, t1) in ((a, (0.0, 0.6)), (b, (0.6, 1.05)), (c, (1.05, 1.5)), (d, (1.5, 2.1))):
        ob = hh['arm']
        park = bpy.data.objects.new(ob.name + '_park', None); bpy.context.scene.collection.objects.link(park)
        ob.parent = park
        for t, z in ((0.0, 0.0 if t0 == 0 else -80.0), (t0, 0.0), (t1, -80.0)):
            park.location = (0, 0, z); park.keyframe_insert('location', frame=frame(t))
        for fc in __import__('common').fcurves(park.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'
    cam = Cam(lens=35, fstop=2.8)
    C = 'CONSTANT'
    cam.at(0.0, (-1.0, -7.0, 1.4), (1.0, 0.3, 1.0), focus=(0, 0, 1.2), interp='LINEAR'); cam.at(0.58, (1.6, -7.0, 1.4), (4.4, 1.0, 1.2), focus=(3, 0.8, 1.2), interp=C)
    cam.at(0.6, (8.6, -1.6, 1.2), (9.0, 4.0, 1.1), focus=(9.0, 4.0, 1.4), interp='LINEAR'); cam.at(1.03, (8.0, -1.2, 1.2), (9.0, 4.0, 1.12), focus=(9.0, 4.0, 1.4), interp=C)
    cam.at(1.05, (8.6, 1.4, 1.25), (9.2, 7.0, 1.15), focus=(9.8, 7.0, 1.4), interp='LINEAR'); cam.at(1.48, (9.0, 1.8, 1.25), (9.4, 7.0, 1.18), focus=(9.8, 7.0, 1.4), interp=C)
    cam.at(1.5, (-7.4, -5.6, 1.0), (-7.5, -0.4, 1.05), focus=(-7.5, -0.4, 1.2), interp='LINEAR'); cam.at(2.0, (-7.45, -4.6, 1.05), (-7.5, -0.4, 1.12), focus=(-7.5, -0.4, 1.2))
    S.grade(bloom=0.35, vignette=0.3)
