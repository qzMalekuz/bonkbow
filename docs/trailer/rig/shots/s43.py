"""DERP 03 - THE AIM. Side profile. He draws far too hard: his whole body swings back about the
hips until he is lying on the air, feet off the ground, arms at full stretch, the bow somehow
still dead level. Twang."""
import math

import actions as A
import arrows
import derp as D
import scene as S
import shotkit as K
from camera import Cam
from common import fcurves, key_loc, key_rot
from shots.s41 import stage

START, END = 5.0, 7.4
CUES = [(0.0, 'creak_long'), (0.9, 'creak_long'), (1.5, 'strain'), (2.2, 'twang'), (2.22, 'whoosh'), (2.38, 'thud')]
T_REL = 2.2
HIPZ = 0.52


def lean(h, t, theta, lift, draw, interp='BEZIER'):
    """The whole archer tipped back by theta degrees about his hips and raised by `lift`, while he
    aims `theta` degrees down in his own frame - so the bow stays level in the world."""
    a = math.radians(theta)
    arm = h['arm']
    key_rot(arm, t, (0, -theta, 0), interp)
    key_loc(arm, t, (HIPZ * math.sin(a), 0, HIPZ + lift - HIPZ * math.cos(a)), interp)
    p = A.P_aim(draw, pitch=-theta, head_yaw=70)
    p.head = (theta * 0.55, 0, 70)
    A.apply(h, p, t, interp)
    return p


def build():
    h = stage(END - START, 43, draw=0.56)
    nk = h['nocked']
    nk.rotation_euler = (0, 0, 0); nk.location = (0.82, 0, 0)            # the right way round now
    for t, th, lift, d in ((0.0, 0, 0.0, 0.56), (0.45, 6, 0.0, 0.95), (0.9, 26, 0.02, 1.2), (1.35, 58, 0.14, 1.4), (1.75, 82, 0.26, 1.55), (T_REL - 0.03, 88, 0.3, 1.6)):
        lean(h, t, th, lift, d)
    p = lean(h, T_REL + 0.04, 88, 0.3, 0.0, 'LINEAR')
    lean(h, T_REL + 0.1, 88, 0.3, 0.0)
    # gravity remembers him
    arm = h['arm']
    key_loc(arm, T_REL + 0.2, (HIPZ, 0, 0.06), 'LINEAR')
    A.nocked(h, T_REL, False)
    for ctrl in ('hand_L', 'hand_R'):
        c = h['ctrl'][ctrl]
        for fc in fcurves(c.animation_data.action):
            if fc.data_path == 'location':
                m = fc.modifiers.new('NOISE'); m.strength = 0.012; m.scale = 0.8; m.use_restricted_range = True
                m.frame_start = 26; m.frame_end = int(T_REL * 30); m.blend_in = 20
    K.at_frame(T_REL)
    tip, d = arrows.release_point(h)
    arrows.shoot('away', tuple(tip), (tip.x + 40, tip.y, tip.z + 0.4), T_REL, 0.3, stick=False)
    K.impact_puff('dust', (0.3, 0, 0.05), T_REL + 0.2, color='#D8C070', n=10, size=0.04, spread=0.7, life=0.35)
    cam = Cam(lens=42, fstop=2.8)
    cam.dolly(0.0, 2.4, (0.25, -5.0, 0.8), (0.1, -4.2, 0.8), (0.1, 0, 0.82), (0.0, 0, 0.84), focus0=(0, 0, 0.9), focus1=(0, 0, 0.9))
    cam.shake(T_REL, 0.05, 0.2)
    S.grade(bloom=0.6, vignette=0.45)
