"""DAY 2 - THEORY. Close on one of them reading ARCHERY FOR BEGINNERS. The book is upside down.
His eyes are crossed. He turns a page."""
import math

import bpy

import actions as A
import arenas as AR
import scene as S
import shotkit as K
from camera import Cam
from common import hexc, key_rot, principled
from shots.montage import spawn
from shots.s24 import FONT, text

START, END = 8.4, 9.8
CUES = [(0.0, 'hum'), (0.9, 'page')]


def build():
    AR.build_elder_forest(clearing=5.0, seed=36)
    b = spawn('b', 54, END - START, loc=(0, 0, 0), yaw=0)
    p = A.P_idle(); p.hand_L = (0.32, -0.42, 1.25); p.hand_R = (-0.32, -0.42, 1.25); p.elbow_L = (0.8, -0.1, 0.9); p.elbow_R = (-0.8, -0.1, 0.9); p.head = (22, 0, 0)
    A.apply(b, p, 0.0); A.apply(b, p, 1.4)
    cover = principled('book_cover', hexc('#8E2A2A'), rough=0.6); page = principled('book_page', hexc('#F4EEDC'), rough=0.9)
    bk = AR.Batch('book')
    bk.box(cover, (0, 0, 0), (0.62, 0.05, 0.44)); bk.box(page, (0, -0.028, 0), (0.58, 0.02, 0.40))
    parts = bk.finish()
    root = bpy.data.objects.new('book', None); bpy.context.scene.collection.objects.link(root)
    for q in parts:
        q.parent = root
    title = text('book_title', 'ARCHERY\nFOR BEGINNERS', 0.085, FONT, principled('book_ink', hexc('#F4EEDC'), emit=hexc('#F4EEDC'), emit_str=0.4), extrude=0.0, bevel=0.0, loc=(0, 0, 0))
    title.parent = root; title.rotation_euler = (math.pi / 2, 0, math.pi); title.location = (0, -0.03, -0.05)    # the title faces him, upside down
    root.location = (0, -0.5, 1.02); root.rotation_euler = (math.radians(70), 0, 0)
    key_rot(root, 0.9, (70, 0, 0)); key_rot(root, 1.0, (70, -8, 0)); key_rot(root, 1.1, (70, 0, 0))
    cam = Cam(lens=65, fstop=2.0)
    cam.dolly(0.0, 1.4, (0.4, -2.3, 1.35), (0.3, -2.1, 1.35), (0, -0.2, 1.3), (0, -0.2, 1.32), focus0=(0, -0.45, 1.3), focus1=(0, -0.45, 1.3))
    S.grade(bloom=0.4, vignette=0.4)
