"""Who is in each derp shot, which head they have, and how long the shot runs (seconds).
Plain Python: read by the face painter and by the shots."""
CAST = {
    90: ({'a': 'bean'}, 1.0),
    41: ({'a': 'bean'}, 2.2),      # macro arrowhead, then: he is holding it backwards
    42: ({'a': 'bean'}, 2.8),      # he works it out
    43: ({'a': 'bean'}, 2.4),      # the draw: far too hard
    44: ({'b': 'pea'}, 2.8),       # arrow-cam; someone wanders into the lane
    45: ({'b': 'pea'}, 2.8),       # he thinks he did that. bonk.
    46: ({'c': 'egg'}, 3.0),       # the second idiot fires the wrong way and hits anyway
    47: ({'d': 'slab', 'e': 'pea', 'f': 'bean'}, 1.6),   # rapid chaos
    # four more days: the training montage
    51: ({'a': 'bean', 'b': 'pea', 'c': 'slab', 'd': 'egg'}, 1.8),     # day 1: the run
    52: ({'a': 'bean', 'k': 'slab'}, 2.2),                             # day 1: target practice, the coach's hat
    53: ({'a': 'bean', 'b': 'pea', 'c': 'slab'}, 2.0),                 # day 2: meditation
    54: ({'b': 'pea'}, 1.4),                                           # day 2: the book
    55: ({'a': 'bean', 'b': 'pea', 'c': 'slab'}, 1.8),                 # day 3: snow sprint
    56: ({'d': 'egg'}, 2.0),                                           # day 3: the snowman
    57: ({'a': 'bean', 'b': 'pea', 'c': 'slab', 'd': 'egg', 'e': 'pea', 'f': 'bean'}, 3.0),   # day 4: unison
    58: ({'a': 'bean', 'b': 'pea', 'c': 'slab', 'd': 'egg', 'e': 'pea', 'f': 'bean'}, 2.0),   # day 4: rain
    59: ({'b': 'pea'}, 4.6),                                           # october 12: the shot
    60: ({'a': 'bean', 'b': 'pea', 'c': 'slab', 'd': 'egg', 'e': 'pea', 'f': 'bean'}, 2.5),   # submitted
}
