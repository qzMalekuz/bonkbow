"""All six heroes side by side, front-on, plus one aiming: a check against archer-boys.pdf."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import scene as S
S.reset('review', 1.0)
import actions as A, game_assets as ga, shotkit as K
from camera import Cam
from common import BUILD
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 620, 100
S.sky('#8FA0B0', '#C8D0D8', strength=1.0); S.sun('#FFFFFF', (-0.4, 0.8, 0.6), energy=3.5); S.ground('#6A6E74')
for i, name in enumerate(ga.HEROES):
    h = K.hero(name, (i * 1.5 - 4.6, 0, 0), yaw=0, pose=A.P_idle())
h = K.hero('mert', (5.2, 0, 0), yaw=0, pose=A.P_aim(1.0)); A.nocked(h, 0, True); A.expression(h, 'angry')
cam = Cam(lens=60, fstop=16); cam.at(0, (0.3, -17, 1.3), (0.3, 0, 0.95))
ga.bake_heads([1])
sc.render.filepath = os.path.join(BUILD, 'test', 'six_pdf.png'); bpy.ops.render.render(write_still=True)
