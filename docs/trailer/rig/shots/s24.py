"""SHOTS 24 + 25 - LOGO and STING. Black; STICKCHERS slams in with the line AIM. DODGE. OUTPLAY.
One last arrow flies in and buries itself in the I."""
import math
import os

import bpy

import arrows
import scene as S
import shotkit as K
from camera import Cam
from common import ROOT, hexc, key_loc, key_scale, principled

START, END = 58.0, 60.0
CUES = [(0.0, 'logo_hit'), (1.5, 'thock_big'), (1.55, 'wobble')]
FONT = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'fredoka', '700Bold', 'Fredoka_700Bold.ttf')
FONT_M = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'fredoka', '600SemiBold', 'Fredoka_600SemiBold.ttf')


def text(name, body, size, font, mat, extrude=0.06, bevel=0.012, loc=(0, 0, 0), spacing=1.0):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = 3; cu.space_character = spacing
    if os.path.exists(font):
        cu.font = bpy.data.fonts.load(font)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = loc
    cu.materials.append(mat)
    return ob


def build():
    S.sky('#000000', '#050308', strength=0.15)
    gold = principled('logo_gold', hexc('#FFC53A'), rough=0.32, metal=0.0, emit=hexc('#FF9A1E'), emit_str=0.3)
    white = principled('logo_white', hexc('#F4EFE6'), rough=0.5, emit=hexc('#F4EFE6'), emit_str=0.9)
    logo = text('logo', 'STICKCHERS', 1.25, FONT, gold, extrude=0.16, bevel=0.03, loc=(0, 0, 0.35), spacing=1.04)
    tag = text('tag', 'AIM.  DODGE.  OUTPLAY.', 0.3, FONT_M, white, extrude=0.01, bevel=0.0, loc=(0, -0.05, -0.75), spacing=1.25)
    # slam: scale overshoot
    for t, s in ((0.0, 2.6), (0.12, 0.94), (0.2, 1.03), (0.3, 1.0)):
        key_scale(logo, t, s)
    key_scale(tag, 0.0, 0.0, interp='CONSTANT'); key_scale(tag, 0.34, 0.0, interp='CONSTANT'); key_scale(tag, 0.36, 1.0)
    S.area('key', (-3, -6, 3.5), (0, 0, 0.3), '#FFFFFF', 1500, size=6)
    S.area('rim', (4, 2.5, 2.5), (0, 0, 0.3), '#FF7A2A', 2400, size=4)
    S.area('under', (0, -4, -3), (0, 0, 0.3), '#6A8CFF', 500, size=6)
    S.particles('embers', 220, (-7, -1.5, -3), (7, 5, 4), (0.1, 0, 0.45), radius=0.016, color='#FF8A30', emit=40, seed=2, sway=0.15, jitter=0.5)
    # the sting: an arrow into the I (the 3rd letter); found from the logo's width
    bpy.context.view_layer.update()
    w = logo.dimensions.x
    ix = -w / 2 + w * 0.262
    hit = (ix, -0.2, 0.55)
    a = arrows.shoot('sting', (ix - 7.5, -6.0, 2.6), hit, 1.38, 0.12)
    for t, s in ((1.5, 1.0), (1.53, 1.035), (1.6, 0.99), (1.68, 1.0)):
        key_scale(logo, t, s)
    cam = Cam(lens=50, fstop=8.0)
    cam.dolly(0.0, 2.0, (0, -9.6, 0.1), (0, -9.0, 0.1), (0, 0, 0.02), (0, 0, 0.02), focus0=(0, 0, 0.3), focus1=(0, 0, 0.3))
    cam.shake(0.02, 0.12, 0.2); cam.shake(1.5, 0.05, 0.15)
    S.grade(bloom=0.55, vignette=0.5)
