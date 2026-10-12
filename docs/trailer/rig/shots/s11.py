"""SHOT 11 - TOLLY, Snowfall Village. Quiet snowfall, a snowman in a top hat. The hat rises;
wide eyes under it. He bursts out of the snow, flicks the hat away; an arrow lands beside him,
he grabs it, nocks it. Huge grin."""
import math

import bpy

import actions as A
import arenas as AR
import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot, key_scale

START, END = 27.0, 31.0
HERO = 'tolly'
LOWER = (2.75, 3.95)
CUES = [(0.0, 'hush'), (0.9, 'creak'), (1.62, 'pop'), (1.95, 'whoosh'), (2.2, 'snick'), (2.55, 'grab'), (3.05, 'bell')]


def build():
    env = AR.build_snowfall_village(snowman_at=(0.0, 0.0))
    sm, hat, top = env['snowman'], env['hat'], env['snowman_top']
    h = K.hero(HERO, (0, 0.75, -0.95), yaw=0)
    arm = h['arm']
    hide = A.P_idle(); hide.hips = (0, 0, A.HIP - 0.3); hide.hand_L = (0.4, 0, 0.5); hide.hand_R = (-0.4, 0, 0.5)
    A.apply(h, hide, 0.0); A.apply(h, hide, 1.55)
    jump = A.P_idle(); jump.hand_L = (0.65, -0.1, 1.7); jump.hand_R = (-0.65, -0.1, 1.75); jump.foot_L = (0.2, 0, 0.15); jump.foot_R = (-0.2, 0, 0.2)
    A.apply(h, jump, 1.72, interp='LINEAR')
    A.apply(h, A.P_idle(), 1.95)
    flick = A.P_idle(); flick.hand_R = (-0.75, -0.1, 2.2); flick.elbow_R = (-1.2, 0.3, 1.4)
    A.apply(h, flick, 2.05); A.apply(h, A.P_idle(), 2.3)
    grab = A.P_idle(); grab.hips = (-0.1, -0.05, A.HIP - 0.3); grab.hips_rot = (14, 0, 0); grab.hand_R = (-0.75, -0.42, 0.55); grab.head = (10, 0, -25)
    A.apply(h, grab, 2.58); A.apply(h, A.P_aim(0.0, head_yaw=0), 2.85)
    A.apply(h, A.P_aim(0.5, head_yaw=0), 3.1); A.apply(h, A.P_aim(0.6, head_yaw=0), 4.0)
    A.nocked(h, 2.85, True)
    # rising behind the snowman (0.9-1.55), then bursting forward through it
    key_loc(arm, 0.0, (0, 0.75, -0.95)); key_loc(arm, 0.9, (0, 0.75, -0.95)); key_loc(arm, 1.55, (0, 0.75, 0.12))
    key_loc(arm, 1.72, (0, 0.1, 0.5), 'LINEAR'); key_loc(arm, 1.95, (0, -0.9, 0.0))
    # the hat: on the snowman, then lifted on his head, until the flick
    hat.scale = (1.25, 1.25, 1.25)
    TOP = 2.0   # his head top above his feet
    for t, p in ((0.0, (0, 0.05, top - 0.04)), (0.9, (0, 0.05, top - 0.04)), (1.55, (0, 0.6, TOP + 0.12)), (1.72, (0, 0.1, TOP + 0.5)), (1.95, (0, -0.9, TOP)), (2.03, (0, -0.9, TOP))):
        key_loc(hat, t, p)
    key_scale(hat, 2.03, 1.25, interp='CONSTANT'); key_scale(hat, 2.05, 0.0, interp='CONSTANT')
    K.at_frame(2.05)
    hw = K.head_pos(h)
    fly = bpy.data.objects.new('hat_fly', None); bpy.context.scene.collection.objects.link(fly)
    for ch in list(hat.children):
        c = ch.copy(); bpy.context.scene.collection.objects.link(c); c.parent = fly
    key_scale(fly, 2.03, 0.0, interp='CONSTANT'); key_scale(fly, 2.05, 1.25, interp='CONSTANT')
    key_loc(fly, 2.05, (hw.x, hw.y, hw.z + 0.55), 'LINEAR'); key_loc(fly, 2.5, (hw.x - 3.2, hw.y + 1.0, hw.z + 1.6), 'LINEAR'); key_loc(fly, 3.0, (hw.x - 6.0, hw.y + 2.0, 0.3), 'LINEAR')
    key_rot(fly, 2.05, (0, 0, 0), 'LINEAR'); key_rot(fly, 3.0, (300, 240, 0), 'LINEAR')
    # the snowman bursts apart
    key_scale(sm, 1.6, 3.4, interp='CONSTANT'); key_scale(sm, 1.63, 0.0, interp='CONSTANT')
    K.impact_puff('burst', (0, 0, 0.9), 1.62, color='#FFFFFF', n=40, size=0.13, spread=2.4, life=0.6, up=1.2)
    K.impact_puff('burst2', (0, -0.2, 0.5), 1.64, color='#F2F6FA', n=30, size=0.07, spread=1.8, life=0.5, seed=5, up=0.8)
    A.expression(h, 'shock'); A.expression(h, 'smile', 3.0)
    # the arrow that lands beside him
    a = arrows.shoot('incoming', (9, -5, 5.5), (-0.85, -1.35, 0.02), 1.95, 0.25, hide_after=2.6)
    K.impact_puff('snowpuff', (-0.85, -1.35, 0.05), 2.2, color='#FFFFFF', n=10, size=0.04, spread=0.5, life=0.3, seed=7)
    cam = Cam(lens=35, fstop=2.8)
    cam.at(0.0, (0.3, -6.5, 1.15), (0, 0, 1.15), focus=(0, 0, 1.3))
    cam.at(1.55, (0.3, -6.3, 1.15), (0, 0, 1.3), focus=(0, 0, 1.4))
    cam.at(2.0, (0.3, -6.0, 1.2), (0, -0.9, 1.15), focus=(0, -0.9, 1.4))
    cam.at(3.1, (0.2, -5.6, 1.2), (0, -0.9, 1.15), focus=(0, -0.9, 1.4))
    cam.at(4.0, (0.1, -4.7, 1.25), (0.1, -0.9, 1.2), focus=(0, -1.1, 1.4), lens=42)
    cam.lens(0.0, 35); cam.lens(3.1, 35)
    cam.shake(1.63, 0.06, 0.25)
    S.grade(bloom=0.35, vignette=0.3)
