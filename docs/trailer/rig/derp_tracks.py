"""Face performances for the derp trailer: for each shot and character, keys of
(time, {face parameters}). Plain Python with no Blender imports, so both the face painter
(tools/derp_faces.py, Pillow) and the shots (Blender) read the same file.

Parameters (all optional, carried forward from the previous key):
  look   (x, y) -1..1  where both pupils point; None = each eye wanders on its own
  cross  0..1          eyes cross toward the nose
  lids   0..1          how heavy the eyelids are (0 wide open, 1 nearly shut)
  mouth  'smile' | 'grin' | 'flat' | 'o' | 'tiny'
  drool  0..1
  brow   -1..1         -1 worried, +1 stern
Values ease between keys; `mouth` switches at its key.
"""
FPS = 30

TRACKS = {
    90: {'a': [(0.0, dict(look=None, lids=0.55, mouth='smile', drool=1.0, brow=0.0, cross=0.0))]},
    # deadly serious, aiming an arrow that points at his own face
    41: {'a': [(0.0, dict(look=(0.8, 0.05), lids=0.6, mouth='flat', drool=0.0, brow=0.7))]},
    # looks at the arrow, at us, at the arrow; fixes it; is proud
    42: {'a': [(0.0, dict(look=(0.8, 0.05), lids=0.6, mouth='flat', brow=0.7)),
               (0.45, dict(look=(0.45, 0.9), cross=0.75, lids=0.45, brow=0.0)),
               (1.05, dict(look=(0.0, 0.0), cross=0.0, lids=0.12, mouth='tiny', brow=-0.3)),
               (1.65, dict(look=(0.45, 0.9), cross=0.75, lids=0.45, brow=0.0)),
               (2.3, dict(look=(0.0, 0.0), cross=0.0, lids=0.62, mouth='smile', brow=0.5, drool=0.6))]},
    # effort
    43: {'a': [(0.0, dict(look=(0.85, 0.0), lids=0.6, mouth='flat', brow=0.8)),
               (0.9, dict(look=(0.85, -0.2), lids=0.25, mouth='tiny', brow=0.9, cross=0.3)),
               (1.6, dict(look=(0.0, 0.0), lids=0.05, mouth='o', brow=-0.6, cross=0.0)),
               (2.22, dict(look=None, lids=0.5, mouth='smile', brow=0.0, drool=1.0))]},
    # the wanderer: nobody home, then notices an arrow in a tree
    44: {'b': [(0.0, dict(look=None, lids=0.55, mouth='smile', drool=1.0)),
               (2.3, dict(look=(0.0, 0.0), lids=0.08, mouth='tiny', drool=0.3))]},
    # he decides he did that. bonk. nothing changes.
    45: {'b': [(0.0, dict(look=(0.0, 0.0), lids=0.08, mouth='tiny', drool=0.3)),
               (0.55, dict(look=(0.0, 0.0), lids=0.5, mouth='grin', brow=0.6, drool=1.0)),
               (2.0, dict(look=None, lids=0.5, mouth='grin', brow=0.6, drool=1.0))]},
    # the second idiot: solemn, then lost, then astonished, then it was the plan all along
    46: {'c': [(0.0, dict(look=(0.85, 0.0), lids=0.6, mouth='flat', brow=0.8)),
               (1.25, dict(look=(-0.85, 0.0), lids=0.2, mouth='tiny', brow=-0.4)),
               (1.95, dict(look=(0.0, 0.0), lids=0.03, mouth='o', brow=-0.7)),
               (2.4, dict(look=None, lids=0.5, mouth='grin', brow=0.5, drool=1.0))]},
    47: {'e': [(0.0, dict(look=(0.9, 0.0), lids=0.05, mouth='o', brow=-0.6)), (0.32, dict(look=None, lids=0.5, mouth='smile', drool=1.0))],
         'd': [(0.0, dict(look=(0.8, 0.0), lids=0.6, mouth='flat', brow=0.8)), (0.7, dict(look=(0.0, -0.8), lids=0.05, mouth='o', brow=-0.5))],
         'f': [(0.0, dict(look=(0.0, 0.0), lids=0.02, mouth='o', brow=-0.8, cross=0.25))]},
    51: {'a': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8))], 'b': [(0.0, dict(look=None, lids=0.5, mouth='smile', drool=1.0))],
         'c': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8)), (1.15, dict(look=(0.0, 0.0), lids=0.02, mouth='o', brow=-0.8))],
         'd': [(0.0, dict(look=(-0.9, 0.0), lids=0.5, mouth='smile', drool=1.0))]},
    52: {'a': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8)), (1.1, dict(look=None, lids=0.5, mouth='smile', drool=1.0))],
         'k': [(0.0, dict(look=(0.0, 0.0), lids=0.7, mouth='flat', brow=0.9)), (1.5, dict(look=(0.0, -0.9), lids=0.02, mouth='o', brow=-0.6))]},
    53: {'a': [(0.0, dict(look=(0, 0), lids=1.0, mouth='tiny'))], 'b': [(0.0, dict(look=(0, 0), lids=1.0, mouth='tiny')), (1.3, dict(look=(0.0, -0.9), lids=0.5, mouth='tiny'))],
         'c': [(0.0, dict(look=(0, 0), lids=1.0, mouth='smile', drool=1.0))]},
    54: {'b': [(0.0, dict(look=(0.2, 0.9), lids=0.5, mouth='flat', brow=0.6, cross=0.8))]},
    55: {'a': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8))], 'b': [(0.0, dict(look=(0.9, 0.0), lids=0.5, mouth='smile', drool=1.0)), (0.9, dict(look=(0.0, 0.0), lids=0.02, mouth='o'))],
         'c': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8))]},
    56: {'d': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.8)), (1.0, dict(look=(0.0, -0.9), lids=0.02, mouth='o', brow=-0.7))]},
    57: {c: [(0.0, dict(look=(0.9, -0.1), lids=0.6, mouth='flat', brow=0.9)), (2.3, dict(look=(0.0, -0.9), lids=0.02, mouth='o', brow=-0.6))] for c in 'abcdef'},
    58: {c: [(0.0, dict(look=(0.0, -0.9), lids=0.02, mouth='o', brow=-0.6)), (0.2 + i * 0.22, dict(look=None, lids=0.6, mouth='smile', drool=1.0, brow=0.0))] for i, c in enumerate('abcdef')},
    59: {'b': [(0.0, dict(look=(0.9, 0.0), lids=0.6, mouth='flat', brow=0.9)), (2.6, dict(look=(0.9, -0.1), lids=0.2, mouth='tiny', brow=0.9)), (4.0, dict(look=(0.0, 0.0), lids=0.5, mouth='grin', drool=1.0, brow=0.3))]},
    60: {c: [(0.0, dict(look=None, lids=0.5, mouth='grin', drool=1.0))] for c in 'abcdef'},
}


def sample(track, t):
    """The face parameters at time t."""
    cur = dict(look=None, cross=0.0, lids=0.5, mouth='smile', drool=0.0, brow=0.0)
    prev_t, prev = 0.0, dict(cur)
    for kt, kv in track:
        if kt <= t:
            prev = dict(cur); prev_t = kt
            cur.update(kv)
            prev_keys = dict(cur)
        else:
            # ease numeric values toward the next key over the last 0.18 s before it
            k = (t - (kt - 0.18)) / 0.18
            if k > 0:
                k = k * k * (3 - 2 * k)
                nxt = dict(cur); nxt.update(kv)
                for name in ('cross', 'lids', 'drool', 'brow'):
                    cur[name] = cur[name] + (nxt[name] - cur[name]) * k
                if cur['look'] is not None and nxt['look'] is not None:
                    cur['look'] = (cur['look'][0] + (nxt['look'][0] - cur['look'][0]) * k, cur['look'][1] + (nxt['look'][1] - cur['look'][1]) * k)
            break
    return cur
