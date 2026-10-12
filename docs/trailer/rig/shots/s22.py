"""SHOT 22 - THE WALK-OUT. The Colosseum again. Six silhouettes walk out of the fog in a line;
it clears left to right and each one does his thing: grin, glint, hair flick, rain shake,
scowl, wide eyes."""
import actions as A
import arenas as AR
import game_assets as ga
import scene as S
import shotkit as K
from camera import Cam
from common import frame, key_loc

START, END = 52.5, 56.0
ORDER = ['akshay', 'beeman', 'chase', 'mit', 'mert', 'tolly']
XS = [-3.4, -2.04, -0.68, 0.68, 2.04, 3.4]
REVEAL = [0.7, 1.1, 1.5, 1.9, 2.3, 2.7]
CUES = [(0.0, 'heartbeat')] + [(0.25 + i * 0.5, 'step') for i in range(7)] + [(1.15, 'glint')]
Y0, Y1 = 11.0, 6.2


def cast(t_end=3.5, walk=True):
    hs = []
    for i, (name, x) in enumerate(zip(ORDER, XS)):
        h = K.hero(name, (x, Y0, 0), yaw=0)
        if walk:
            A.walk_cycle(h, 0.0, t_end, cycle=1.0)
            key_loc(h['arm'], 0.0, (x, Y0, 0), 'LINEAR'); key_loc(h['arm'], t_end, (x, Y1, 0), 'LINEAR')
        hs.append(h)
    return hs


def build():
    AR.build_colosseum(braziers=8)
    ga.head_glow(0.05)
    hs = cast()
    # each hero's key light comes up in turn: the reveal, left to right
    for i, (h, x, t) in enumerate(zip(hs, XS, REVEAL)):
        li = K.key_light((x, 8.0, 1.2), offset=(-0.8, -6.5, 2.2), color='#FFE0C0', energy=0, size=1.6, name='key_%d' % i)
        li.data.energy = 0; li.data.keyframe_insert('energy', frame=frame(t - 0.05))
        li.data.energy = 520; li.data.keyframe_insert('energy', frame=frame(t + 0.3))
    # head glow rises with the reveal so faces come out of silhouette
    for name, t0 in zip(ORDER, REVEAL):
        ga.key_head_glow(name, 0.0, -0.3); ga.key_head_glow(name, t0 - 0.05, -0.3); ga.key_head_glow(name, t0 + 0.3, 0.26)
    a, b, c, m, me, t = hs
    A.expression(a, 'neutral'); A.expression(a, 'smile', REVEAL[0] + 0.15)
    K.at_frame(REVEAL[1] + 0.3)
    hp = K.head_pos(b)
    K.glint('glint', (hp.x - 0.12, hp.y - 0.5, hp.z + 0.12), REVEAL[1] + 0.35, size=0.3, color='#FFE8C8')
    for h, t0 in ((c, REVEAL[2] + 0.1), (m, REVEAL[3] + 0.1)):
        hd = h['arm'].pose.bones['Head']
        for k, y in enumerate((0, 22, -20, 14, -8, 0)):
            hd.rotation_euler = (0, __import__('math').radians(y), 0); hd.keyframe_insert('rotation_euler', frame=frame(t0 + k * 0.07))
    A.expression(m, 'neutral'); A.expression(m, 'smile', REVEAL[3] + 0.5)
    A.expression(me, 'angry')
    A.expression(t, 'neutral'); A.expression(t, 'shock', REVEAL[5] + 0.15)
    # ground fog thinning out
    fogs = S.fog('#C88A6A', density=0.05, anisotropy=0.5, height=2.6, size=70)
    S.sun('#6E8ED8', (0.0, 0.5, 1.0), energy=0.9, angle=20, name='front_fill')
    cam = Cam(lens=40, fstop=4.0)
    cam.dolly(0.0, 3.5, (0, 1.6, 1.1), (0, -2.6, 1.15), (0, 9, 1.1), (0, 6.5, 1.12), focus0=(0, 9, 1.4), focus1=(0, 6.4, 1.4))
    S.grade(bloom=0.9, vignette=0.45)
