"""SHOT 16 - M-IT ROOFTOP. Fast tracking shot along the wet roofs. Three arrows chase him from
below; he vaults a chimney, slides under a sign, jumps a gap. Each arrow hits where he was."""
import actions as A
import arenas as AR
import arrows
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import key_loc, key_rot

START, END = 40.5, 43.0
CUES = [(0.0, 'run'), (0.5, 'thock'), (0.62, 'whoosh'), (1.2, 'thock'), (1.3, 'scrape'), (1.95, 'thock'), (2.0, 'whoosh')]
RZ, RY = 5.0, 0.0   # rooftop height and centre line


def rooftops():
    b = AR.Batch('roofs')
    slab = AR.mat('roof_slab', '#2F5A5E', rough=0.25, spec=0.8); wall = AR.mat('roof_wall', '#5C5A58'); brick = AR.mat('roof_brick', '#7A4A3A')
    lit = AR.emissive('town_window_lit', '#FFC94D', 9.0); iron = AR.mat('town_iron', '#15161A', rough=0.35, metal=0.8)
    for x0, x1 in ((-14, 6.3), (8.3, 30)):
        cx, w = (x0 + x1) / 2, x1 - x0
        b.box(slab, (cx, RY, RZ - 0.1), (w, 4.2, 0.2))
        b.box(wall, (cx, RY, (RZ - 0.2) / 2), (w - 0.3, 3.8, RZ - 0.2))
        for i in range(int(w // 2.4)):
            b.box(lit, (x0 + 1.4 + i * 2.4, RY - 1.93, 2.6), (0.6, 0.04, 0.85))
    b.box(brick, (-1.0, RY + 0.2, RZ + 0.4), (0.7, 0.7, 0.8))            # chimney to vault
    for sx in (2.6, 4.4):                                                  # sign frame to slide under
        b.box(iron, (sx, RY, RZ + 0.75), (0.08, 0.08, 1.5))
    b.box(AR.mat('roof_sign', '#5A3A22'), (3.5, RY, RZ + 1.2), (1.9, 0.1, 0.6))
    b.box(AR.emissive('neon_cyan', '#3AE8FF', 22.0), (3.5, RY - 0.07, RZ + 1.2), (1.5, 0.03, 0.08))
    return b.finish()


def build():
    AR.build_rainy_town()
    ga.head_glow(0.24)
    rooftops()
    h = K.hero('mit', (-9, RY, RZ), yaw=90)
    arm = h['arm']
    A.run_cycle(h, 0.0, 2.5, cycle=0.36)
    # slide under the sign (1.22-1.6): override with a low slide pose
    slide = A.P_idle(); slide.hips = (0, 0.25, A.HIP - 0.52); slide.hips_rot = (-38, 0, 0); slide.foot_L = (0.16, -0.75, 0.05); slide.foot_R = (-0.16, -0.5, 0.02)
    slide.hand_L = (0.5, 0.3, 0.3); slide.hand_R = (-0.5, 0.4, 0.35); slide.head = (20, 0, 0)
    for t in (1.24, 1.34, 1.44, 1.54):
        A.apply(h, slide, t, interp='LINEAR')
    tuck = A.P_run(0.0); tuck.foot_L = (0.15, -0.3, 0.45); tuck.foot_R = (-0.15, 0.2, 0.5)
    for t in (0.62, 0.72, 2.02, 2.14):
        A.apply(h, tuck, t, interp='LINEAR')
    # travel: 8.8 m/s along +X, with hops over the chimney (x=-1) and the gap (x=7.3)
    v = 8.8
    for i in range(0, 76):
        t = i / 30.0
        x = -6.5 + v * t
        z = RZ
        for (xc, hgt, half) in ((-1.0, 1.25, 1.3), (7.3, 0.9, 1.5)):
            if abs(x - xc) < half:
                z = RZ + hgt * (1 - ((x - xc) / half) ** 2)
        key_loc(arm, t, (x, RY, z), 'LINEAR')
    A.expression(h, 'neutral')
    # three arrows from the street, each landing where he just was
    for i, t_hit in enumerate((0.5, 1.2, 1.95)):
        x_hit = -6.5 + v * (t_hit - 0.13)
        arrows.shoot('chase_%d' % i, (x_hit - 5, RY - 11, 0.5), (x_hit, RY - 0.4, RZ + 0.02), t_hit - 0.3, 0.3)
        K.impact_puff('tile_%d' % i, (x_hit, RY - 0.4, RZ + 0.05), t_hit, color='#BFD8F0', n=8, size=0.03, spread=0.6, life=0.3, seed=i)
    cam = Cam(lens=32, fstop=2.8)
    for i in range(0, 76, 5):
        t = i / 30.0
        x = -6.5 + v * t
        cam.at(t, (x + 1.4, RY - 5.6, RZ + 0.8), (x + 0.5, RY, RZ + 0.95), focus=(x, RY, RZ + 1.1), interp='LINEAR')
    cam.handheld(0.035, speed=2.0)
    K.key_light((2, RY, RZ + 1.5), offset=(0, -6, 2), color='#FFD9B0', energy=2600, size=14)
    S.grade(bloom=0.9, vignette=0.45)
