import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy
import scene as S
S.reset('review', 1.0)
import head360 as H
from camera import Cam
from common import BUILD, new_collection, look_at
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 480, 480, 100
S.sky('#8FA0B0', '#C8D0D8', strength=1.0); S.sun('#FFFFFF', (-0.4, 0.8, 0.6), energy=3.0)
h = H.build_head360('tolly', 'head', new_collection('h'))
cam = Cam(lens=85, fstop=16)
H.bind_camera(cam.ob)
os.makedirs(os.path.join(BUILD, 'test'), exist_ok=True)
angs = [0, 20, 45, 67, 90, 135, 180, 225, 270, 300, 322, 345]
for i, a in enumerate(angs):
    r = math.radians(a)
    cam.ob.location = (math.sin(r) * 6, -math.cos(r) * 6, 0.5); cam.target.location = (0, 0, 0.5); cam.focus.location = (0, 0, 0.5)
    bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(BUILD, 'test', 'turn_%02d.png' % i); bpy.ops.render.render(write_still=True)
