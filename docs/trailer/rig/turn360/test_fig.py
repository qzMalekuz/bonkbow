import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy
import scene as S
S.reset('review', 1.0)
import figure360 as F, head360 as H
from camera import Cam
from common import BUILD, new_collection
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 360, 620, 100
S.sky('#9FB0C0', '#D8E0E8', strength=1.0); S.sun('#FFFFFF', (-0.4, 0.8, 0.6), energy=3.0); S.ground('#D8DEE6')
f = F.build_figure360('tolly', 'fig', new_collection('h'))
cam = Cam(lens=110, fstop=16)
H.bind_camera(cam.ob)
angs = [0, 6, 9, 15, 21, 24, 36, 39, 96, 99, 186, 189]
for i, a in enumerate(angs):
    r = math.radians(a)
    cam.ob.location = (math.sin(r) * 9, -math.cos(r) * 9, 1.0); cam.target.location = (0, 0, 0.95); cam.focus.location = (0, 0, 1.0)
    bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(BUILD, 'test', 'fig_%02d.png' % i); bpy.ops.render.render(write_still=True)
