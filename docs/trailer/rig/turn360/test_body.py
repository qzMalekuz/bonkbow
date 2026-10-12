import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy
import scene as S
S.reset('review', 1.0)
import actions as A, body_v2 as B, head360 as H
from camera import Cam
from common import BUILD
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 640, 100
S.sky('#9FB0C0', '#D8E0E8', strength=1.0); S.sun('#FFFFFF', (-0.5, 0.8, 0.6), energy=3.2); S.ground('#D8DEE6')
S.sun('#BFD8FF', (0.6, 0.4, -0.6), energy=1.2, name='rim')
A.GRIP_X = 0.70
poses = [('idle', A.P_idle(), 0), ('idle', A.P_idle(), 140), ('aim', A.P_aim(1.0, head_yaw=72), 0), ('shoot', A.P_shoot(head_yaw=72), 0), ('lean', A.P_dodge_lean(-1, 0.5), 25), ('run', A.P_run(0.0), 60), ('idle', A.P_idle(), 200)]
for i, (nm, p, yaw) in enumerate(poses):
    h = B.build('tolly', name='t%d' % i); A.setup_controls(h); B.finish_controls(h)
    h['arm'].location = (i * 1.35 - 4.05, 0, 0); h['arm'].rotation_euler = (0, 0, math.radians(yaw))
    A.apply(h, p, 0)
    if nm == 'aim': A.nocked(h, 0, True)
    hd = H.build_head360('tolly', 'head%d' % i, sc.collection, height=1.05); hd.parent = h['head']; hd.location = (0, 0, -0.05)
cam = Cam(lens=60, fstop=16); cam.at(0, (0, -17, 1.1), (0, 0, 0.9)); H.bind_camera(cam.ob)
sc.frame_set(1)
sc.render.filepath = os.path.join(BUILD, 'test', 'body_v2.png'); bpy.ops.render.render(write_still=True)
