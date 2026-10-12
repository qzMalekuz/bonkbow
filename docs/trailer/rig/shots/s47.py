"""DERP 07 - RAPID CHAOS. Three beats, half a second each: one dodges straight into an arrow;
one falls over mid-draw and looses from the grass; the arrow finds the bullseye anyway, and
someone cannot believe it."""
import math

import actions as A
import arenas as AR
import arrows
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot, key_scale
from props import build_target

START, END = 16.0, 17.6
CUES = [(0.0, 'braam'), (0.1, 'whoosh'), (0.3, 'bonk'), (0.55, 'creak'), (0.78, 'thud'), (0.86, 'twang'), (1.15, 'thock_big'), (1.3, 'pop')]
B1, B2 = 0.53, 1.07
XB, XT, XF = 20.0, 40.0, 44.0


def build():
    env = AR.build_golden_meadow(sunset=True, grass_height=0.28, grass_density=60, grass_y=(-6, 5), grass_x=(-8, 50), fence_y=7.0)
    # 1. the dodge: one decisive hop, exactly the wrong way
    e = D.spawn('e', 'pea', 47, 'e', END - START, loc=(0, 0, 0), yaw=0)
    jump = A.P_idle(); jump.hand_L = (0.6, -0.1, 2.1); jump.hand_R = (-0.6, -0.1, 2.1); jump.foot_L = (0.25, 0, 0.3); jump.foot_R = (-0.2, 0, 0.45)
    A.apply(e, A.P_idle(), 0.0); A.apply(e, jump, 0.16); A.apply(e, jump, 0.36)
    key_loc(e['arm'], 0.06, (0, 0, 0)); key_loc(e['arm'], 0.3, (0.85, 0, 0.35), 'LINEAR'); key_loc(e['arm'], 0.5, (1.3, 0, 0.0), 'LINEAR')
    a1 = arrows.shoot('incoming', (9.0, -0.05, 1.42), (1.15, -0.05, 1.42), 0.08, 0.22, stick=False, visible_before=True)
    b1 = arrows.shoot('bounce', (1.15, -0.05, 1.42), (2.6, -0.4, 3.4), 0.3, 0.25, stick=False, spin=9.0)
    K.glint('star', (1.0, -0.3, 1.5), 0.3, size=0.6, color='#FFF2C0', life=0.25, strength=80)
    # 2. the fall: straight back like a plank, bow still up; the arrow leaves from the grass
    d = D.spawn('d', 'slab', 47, 'd', END - START, loc=(XB, 0, 0), yaw=0)
    A.apply(d, A.P_aim(0.7, head_yaw=70), 0.0); A.apply(d, A.P_aim(1.0, head_yaw=70), 0.84); A.apply(d, A.P_shoot(head_yaw=70), 0.9, interp='LINEAR')
    A.nocked(d, 0.0, True); A.nocked(d, 0.86, False)
    key_rot(d['arm'], B1 + 0.05, (0, 0, 0)); key_rot(d['arm'], 0.78, (0, -86, 0), 'LINEAR'); key_rot(d['arm'], 1.07, (0, -86, 0))
    key_loc(d['arm'], B1 + 0.05, (XB, 0, 0)); key_loc(d['arm'], 0.78, (XB, 0, 0.08), 'LINEAR')
    arrows.shoot('from_grass', (XB + 0.2, -0.13, 0.75), (XB + 9, -0.13, 9.0), 0.86, 0.22, stick=False)
    K.impact_puff('dust', (XB - 0.6, 0, 0.05), 0.78, color='#D8C070', n=10, size=0.04, spread=0.7, life=0.3)
    # 3. bullseye, and a witness
    tg = build_target('target', env['col'], 0.55)
    tg.location = (XT, 0.5, 1.0); tg.rotation_euler = (0, 0, math.pi / 2)
    arrows.shoot('bullseye', (XT - 6, 0.5, 6.0), (XT - 0.07, 0.5, 1.02), 1.07, 0.08, visible_before=False)
    f = D.spawn('f', 'bean', 47, 'f', END - START, loc=(XF, 0, 0), yaw=0)
    gasp = A.P_idle(); gasp.hand_L = (0.5, -0.3, 1.9); gasp.hand_R = (-0.5, -0.3, 1.9)
    A.apply(f, gasp, 0.0)
    cam = Cam(lens=40, fstop=2.8)
    C = 'CONSTANT'
    cam.at(0.0, (0.6, -5.2, 1.1), (0.6, 0, 1.15), focus=(0.5, 0, 1.3), interp='LINEAR'); cam.at(B1 - 2 / 30, (0.7, -4.9, 1.1), (0.8, 0, 1.2), focus=(0.8, 0, 1.3), interp=C)
    cam.at(B1, (XB - 0.2, -5.4, 0.7), (XB - 0.2, 0, 0.8), focus=(XB, 0, 0.9), interp='LINEAR'); cam.at(B2 - 2 / 30, (XB - 0.3, -5.0, 0.6), (XB - 0.3, 0, 0.55), focus=(XB, 0, 0.6), interp=C)
    cam.at(B2, (XT - 2.6, -1.2, 1.1), (XT, 0.5, 1.0), focus=(XT, 0.5, 1.0), interp='LINEAR'); cam.at(1.3 - 2 / 30, (XT - 2.4, -1.1, 1.1), (XT, 0.5, 1.0), focus=(XT, 0.5, 1.0), interp=C)
    cam.at(1.3, (XF + 0.1, -2.6, 1.3), (XF, 0, 1.35), focus=(XF, -0.3, 1.4), interp='LINEAR'); cam.at(1.6, (XF + 0.1, -2.2, 1.32), (XF, 0, 1.36), focus=(XF, -0.3, 1.4))
    cam.shake(0.3, 0.05, 0.15); cam.shake(1.15, 0.05, 0.12)
    S.grade(bloom=0.6, vignette=0.45)
