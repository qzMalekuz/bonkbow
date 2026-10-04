"""Smoke test: one hero, 3/4 view, grey studio. blender -b -P rig/test_hero.py -- akshay"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import BUILD, hexc, new_collection, look_at
import game_assets as ga

hero = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'akshay'
views = sys.argv[sys.argv.index('--') + 2:] if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2 else ['front34']

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 960, 1080
sc.eevee.taa_render_samples = 24
col = new_collection('heroes')
h = ga.build_hero(hero, col)

# floor + lights
bpy.ops.mesh.primitive_plane_add(size=20)
floor = bpy.context.object
floor.data.materials.append(bpy.data.materials.new('floor'))
floor.data.materials[0].use_nodes = True
floor.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.35, 0.37, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sc.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.65, 0.7, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.8

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam; ga.bind_camera(cam)
cam.data.lens = 50
angles = {'front': 0, 'front34': 35, 'right': 90, 'back': 180, 'left': -90, 'back34': 145}
for v in views:
    a = math.radians(angles[v])
    cam.location = (math.sin(a) * 3.4, -math.cos(a) * 3.4, 1.4)
    bpy.context.view_layer.update()
    look_at(cam, (0, 0, 1.1))
    os.makedirs(os.path.join(BUILD, 'test'), exist_ok=True)
    sc.render.filepath = os.path.join(BUILD, 'test', '%s_%s.png' % (hero, v))
    bpy.ops.render.render(write_still=True)
    print('wrote', sc.render.filepath)
