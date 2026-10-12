"""OCTOBER 12. One archer, alone in the colosseum, drums. The finest draw of his life. Release:
arrow-cam, the beautiful flight, and the arrow hits a giant SUBMIT button. It presses. SUBMITTED."""
import math

import bpy

import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import hexc, key_loc, key_scale, principled
from mathutils import Vector
from shots.montage import spawn
from shots.s24 import FONT, text

START, END = 18.6, 23.2
CUES = [(0.0, 'braam'), (0.4, 'creak_long'), (2.6, 'twang'), (2.62, 'wind'), (3.7, 'click'), (3.9, 'ding')]
T_REL, T_HIT = 2.6, 3.7
BTN = Vector((0.0, 22.0, 1.3))


def button():
    col = bpy.context.scene.collection
    b = AR.Batch('button')
    base = AR.mat('btn_base', '#2A2A30', rough=0.5, metal=0.5)
    b.box(base, (BTN.x, BTN.y + 0.4, 0.0), (3.6, 0.8, 0.5))
    b.cyl(base, (BTN.x, BTN.y + 0.4, 0.3), 0.9, 0.3, (math.pi / 2, 0, 0), segs=48)
    b.finish(smooth=True)
    cap_m = principled('btn_cap', hexc('#D63030'), rough=0.3, emit=hexc('#D63030'), emit_str=0.25)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.75, depth=0.4, location=(BTN.x, BTN.y, BTN.z), rotation=(math.pi / 2, 0, 0), vertices=48)
    cap = bpy.context.object; cap.name = 'btn_cap'; cap.data.materials.append(cap_m)
    for p in cap.data.polygons:
        p.use_smooth = True
    t = text('btn_text', 'SUBMIT', 0.26, FONT, principled('btn_ink', hexc('#FFF4E6'), emit=hexc('#FFF4E6'), emit_str=0.6), extrude=0.0, bevel=0.0, loc=(0, 0, 0))
    t.parent = cap; t.location = (0, -0.26, 0); t.rotation_euler = (math.pi / 2, 0, 0)
    key_loc(cap, T_HIT, tuple(BTN)); key_loc(cap, T_HIT + 0.08, tuple(BTN + Vector((0, 0.3, 0))), 'LINEAR'); key_loc(cap, T_HIT + 0.5, tuple(BTN + Vector((0, 0.3, 0))))
    done = text('done', 'SUBMITTED.', 0.9, FONT, principled('done_ink', hexc('#FFC53A'), emit=hexc('#FF9A1E'), emit_str=0.6), extrude=0.08, bevel=0.015, loc=(BTN.x, BTN.y - 0.2, BTN.z + 2.4))
    key_scale(done, T_HIT + 0.2, 0.0, interp='CONSTANT'); key_scale(done, T_HIT + 0.22, 2.0); key_scale(done, T_HIT + 0.34, 0.95); key_scale(done, T_HIT + 0.42, 1.0)
    S.point('btn_glow', (BTN.x, BTN.y - 1.5, BTN.z + 1), '#FF6A4A', 400, radius=0.6)
    return cap


def build():
    AR.build_colosseum(braziers=8, radius=34)
    ga.head_glow(0.2)
    b = spawn('b', 59, END - START, loc=(0, -6, 0), yaw=-90)
    A.apply(b, A.P_aim(0.2, head_yaw=70), 0.0); A.apply(b, A.P_aim(1.0, head_yaw=70), 2.2); A.apply(b, A.P_aim(1.0, head_yaw=70), T_REL - 0.03)
    A.apply(b, A.P_shoot(head_yaw=70), T_REL + 0.05, interp='LINEAR'); A.apply(b, A.P_shoot(head_yaw=70), 3.5)
    cheer = A.P_idle(); cheer.hand_L = (0.5, -0.1, 2.3); cheer.hand_R = (-0.5, -0.1, 2.3)
    A.apply(b, cheer, 4.0); A.apply(b, cheer, 4.6)
    A.nocked(b, 0.0, True); A.nocked(b, T_REL, False)
    K.key_light((0, -6, 1.2), offset=(-2.5, -4.0, 1.5), color='#FFC89A', energy=420, size=3.0)
    button()
    K.at_frame(T_REL)
    tip, d = arrows.release_point(b)
    arrow = arrows.shoot('the_shot', tuple(tip), (BTN.x - 0.1, BTN.y - 0.3, BTN.z), T_REL, T_HIT - T_REL, visible_before=True)
    K.impact_puff('spark', (BTN.x, BTN.y - 0.3, BTN.z), T_HIT, color='#FFD080', n=14, size=0.03, spread=0.9, life=0.35)
    cam = Cam(lens=50, fstop=2.4)
    cam.dolly(0.0, T_REL, (-2.6, -8.2, 1.0), (-1.4, -8.0, 1.1), (0, -6, 1.0), (0, -6, 1.05), focus0=(0, -6, 1.1), focus1=(0, -6, 1.1), lens0=50, lens1=70)
    cam.follow(arrow, (-1.25, 0.0, 0.13), T_REL + 0.02, T_HIT, look_offset=(3.0, 0, 0))
    K.at_frame(T_HIT)
    p = Vector(cam.ob.location)
    cam.at(T_HIT + 0.02, (BTN.x + 1.2, BTN.y - 6.0, 1.5), (BTN.x, BTN.y, BTN.z + 0.9), focus=tuple(BTN), interp='LINEAR')
    cam.at(4.6, (BTN.x + 1.8, BTN.y - 7.0, 1.8), (BTN.x, BTN.y, BTN.z + 1.2), focus=tuple(BTN))
    cam.lens(0.0, 50); cam.lens(T_REL, 70); cam.lens(T_REL + 0.02, 20); cam.lens(T_HIT, 20); cam.lens(T_HIT + 0.02, 35)
    cam.shake(T_HIT, 0.05, 0.2)
    S.grade(bloom=0.9, vignette=0.45, lens_distort=-0.02)
