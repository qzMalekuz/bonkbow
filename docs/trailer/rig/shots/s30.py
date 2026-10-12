"""TOLLY 360 - a six-second character piece. A full smooth orbit round Tolly (a real 3D head
built from his 360-degree turnaround sheet), then he draws, looses, leans out of the way of an
arrow coming back, and looks at us."""
import math

import bpy
from mathutils import Vector

import actions as A
import arenas as AR
import arrows
import game_assets as ga
import head360 as H
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot
from props import build_target

START, END = 0.0, 6.0
T_REL = 3.6


def build():
    env = AR.build_snowfall_village(snowman_at=(-8.5, 6.0), hat=False)
    # keep the orbit clear: nothing from the kit within the camera's circle
    for ob in list(env['col'].objects):
        if ob.location.length < 7.6 and ob.location.z < 0.5:
            bpy.data.objects.remove(ob, do_unlink=True)
    h = K.hero('tolly', (0, 0, 0), yaw=0)
    # swap the sheet-card head for the real 3D one
    reg = [r for r in ga.REG if r['root'] == h['head']][0]
    ga.REG.remove(reg)
    for ob in reg['sprites'].values():
        ob.hide_render = True
    arm, root = h['arm'], h['head']
    turn = bpy.data.objects.new('head_turn', None); bpy.context.scene.collection.objects.link(turn)
    turn.parent = arm; turn.parent_type = 'BONE'; turn.parent_bone = 'Head'
    turn.rotation_euler = (math.radians(-90), 0, 0)
    cr = root.constraints.new('COPY_ROTATION'); cr.target = turn
    head = H.build_head360('tolly', 'tolly_head3d', bpy.context.scene.collection, height=1.05)
    head.parent = root
    head.location = (0, 0, -0.05)
    tg = build_target('target', env['col'], 0.55)
    tg.location = (11.0, -0.3, 1.0); tg.rotation_euler = (0, 0, math.pi / 2)
    # --- performance
    idle = A.P_idle()
    A.apply(h, idle, 0.0); A.apply(h, idle, 2.55)
    A.apply(h, A.P_aim(0.0, head_yaw=72), 2.85); A.apply(h, A.P_aim(1.0, head_yaw=72), 3.3); A.apply(h, A.P_aim(1.0, head_yaw=72), T_REL - 0.03)
    A.apply(h, A.P_shoot(head_yaw=72), T_REL + 0.05, interp='LINEAR'); A.apply(h, A.P_shoot(head_yaw=72), 4.05)
    A.nocked(h, 0.0, False); A.nocked(h, 2.7, True); A.nocked(h, T_REL, False)
    lean = A.P_dodge_lean(-1, 0.5); lean.head = (0, 4, 20)
    A.apply(h, lean, 4.45, interp='LINEAR'); A.apply(h, lean, 4.62)
    end = A.P_idle(); end.head = (-3, 0, 0)
    A.apply(h, end, 5.05); A.apply(h, end, 6.0)
    K.at_frame(T_REL)
    tip, d = arrows.release_point(h)
    arrows.shoot('shot', tuple(tip), (10.92, -0.3, 1.02), T_REL, 0.3)
    K.impact_puff('straw', (10.9, -0.3, 1.02), T_REL + 0.3, color='#E8D8A0', n=8, size=0.03, spread=0.5, life=0.3)
    # the answer: an arrow back down the same line, past his head
    arrows.shoot('back', (14, -0.9, 1.5), (-12, 0.55, 1.42), 4.25, 0.42, stick=False)
    # --- camera: one continuous move at head height (the sheet's views are level)
    cam = Cam(lens=42, fstop=4.0)
    H.bind_camera(cam.ob)
    C = (0, 0, 0.98)
    n = 26
    for i in range(n + 1):
        k = i / n
        e = k * k * (3 - 2 * k)                       # ease in and out of the orbit
        a = math.radians(-20 + 380 * e)               # a full turn, starting and ending front-left
        r = 5.6 - 0.6 * math.sin(k * math.pi)
        cam.at(2.6 * k, (math.sin(a) * r, -math.cos(a) * r, 1.25), C, focus=(0, 0, 1.4), interp='LINEAR' if 0 < i < n else 'BEZIER')
    cam.at(3.3, (-1.4, -5.6, 1.2), (0.5, 0, 0.98), focus=(0, 0, 1.3))
    cam.at(T_REL, (-1.5, -5.7, 1.2), (0.6, 0, 0.98), focus=(0, 0, 1.3))
    cam.at(3.95, (-1.8, -5.9, 1.22), (1.3, 0, 0.98), focus=(0, 0, 1.3))
    cam.at(4.6, (-1.0, -5.5, 1.25), (0.2, 0, 1.0), focus=(0, 0, 1.4))
    cam.at(6.0, (0.0, -5.3, 1.25), (0, 0, 1.02), focus=(0, -0.3, 1.45), lens=46)
    cam.lens(0.0, 42); cam.lens(4.6, 42)
    S.grade(bloom=0.3, vignette=0.3)
