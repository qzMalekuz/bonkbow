"""Pose test: render named poses next to each other. blender -b -P rig/test_pose.py -- akshay"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import BUILD, new_collection, look_at
import game_assets as ga
import actions as A

hero = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'akshay'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1920, 700; sc.eevee.taa_render_samples = 16
col = new_collection('heroes')
poses = [('idle', A.P_idle()), ('aim', A.P_aim((1, 0, 0), 1.0)), ('shoot', A.P_shoot((1, 0, 0))), ('crouch', A.P_aim((1, 0, 0), 1.0, crouch=1.0)), ('run', A.P_run(0.25)), ('land', A.P_crouch_land()), ('look', A.P_lookback())]
xs = []
for i, (name, p) in enumerate(poses):
    h = ga.build_hero(hero, col, name='%s_%d' % (hero, i))
    A.setup_controls(h)
    h["arm"].location = (i * 1.45 - 4.35, 0, 0)
    A.apply(h, p, 0)
bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.object
m = bpy.data.materials.new('floor'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.35, 0.37, 1); fl.data.materials.append(m)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); sc.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.65, 0.7, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 32
cam.location = (0, -9.5, 1.6); bpy.context.view_layer.update(); look_at(cam, (0, 0, 1.0))
sc.frame_set(1)
os.makedirs(os.path.join(BUILD, 'test'), exist_ok=True)
sc.render.filepath = os.path.join(BUILD, 'test', 'poses_%s.png' % hero)
bpy.ops.render.render(write_still=True)
