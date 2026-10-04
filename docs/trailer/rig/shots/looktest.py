"""Arena look tests: s91..s96 render one hero standing in each arena."""
import actions as A
import arenas as AR
import game_assets as ga
import scene as S
from camera import Cam
from common import new_collection

ARENAS = {91: ('colosseum', 'mert'), 92: ('golden_meadow', 'akshay'), 93: ('moonlit_woods', 'beeman'), 94: ('elder_forest', 'chase'),
          95: ('rainy_town', 'mit'), 96: ('snowfall_village', 'tolly')}


def build(n):
    arena, hero = ARENAS[n]
    kw = {}
    if arena == 'snowfall_village':
        kw = dict(snowman_at=(2.2, 1.0))
    if arena == 'golden_meadow':
        kw = dict(grass_y=(-6, 5), grass_x=(-8, 8))
    env = getattr(AR, 'build_' + arena)(**kw)
    h = ga.build_hero(hero, new_collection('heroes'))
    A.setup_controls(h)
    A.apply(h, A.P_idle(), 0)
    cam = Cam(lens=32, fstop=4.0)
    cam.at(0, (2.2, -7.5, 1.5), (0, 0, 1.25), focus=(0, 0, 1.4))
    S.grade()
    return env, h, cam
