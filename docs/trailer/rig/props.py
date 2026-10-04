"""Hand props at the game's dimensions: the recurve bow (Stickman3D.ts recurveGeo), arrows
(world.ts ARROW_LEN), the quiver, an archery target. Bow space: grip at the origin, +X toward
the target, limbs along ±Z (Blender), string on the −X side."""
import math

import bpy
from mathutils import Vector

from common import hexc, mesh_object, principled

ARROW_LEN = 0.82
BOW_R, BOW_HALF = 0.55, 0.72
BOW_TIP = (-BOW_R + BOW_R * math.cos(BOW_HALF), BOW_R * math.sin(BOW_HALF))
WOOD = '#6B3E1E'
WOOD_LIGHT = '#9A5A2A'
SHAFT = '#C8A070'
FLETCH_RED = '#D8232A'
FLETCH_WHITE = '#F2F2F2'
STEEL = '#B8BCC4'


def curve_object(name, points, radius, mat, col, bevel_res=6, taper=None, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.fill_mode = 'FULL'
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = Vector(p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = closed
    ob = bpy.data.objects.new(name, cu)
    cu.materials.append(mat)
    col.objects.link(ob)
    if taper is not None:
        ob.data.taper_object = taper
    return ob


def build_bow(name, col, white=False):
    """Recurve bow as one parent empty: two limbs (curves), grip, string (curve, re-pointed by
    `draw_string`). The string's nock point is the child empty `<name>_nock`."""
    wood = principled('bow_wood', hexc(WOOD), rough=0.5)
    wood_l = principled('bow_wood_light', hexc(WOOD_LIGHT), rough=0.45)
    grip_m = principled('bow_grip', hexc('#3A2416'), rough=0.8)
    string_m = principled('bow_string', hexc('#ECE6DA'), rough=0.6)
    root = bpy.data.objects.new(name, None)
    root.empty_display_size = 0.1
    col.objects.link(root)
    # upper limb profile from recurveGeo (bow space x,y) -> Blender (x, 0, z)
    T = BOW_TIP
    prof = [(0, 0.06), (-0.01, 0.12), (-0.045, 0.2), (-0.095, 0.27), (-0.135, 0.32), (T[0], T[1]), (T[0] + 0.035, T[1] + 0.035)]
    for s, nm in ((1, 'up'), (-1, 'dn')):
        pts = [(x, 0, y * s) for x, y in prof]
        limb = curve_object('%s_limb_%s' % (name, nm), pts, 0.022, wood, col)
        limb.data.bevel_depth = 0.024
        limb.parent = root
        # lighter back face strip
        stripe = curve_object('%s_stripe_%s' % (name, nm), [(x + 0.012, 0, y * s) for x, y in prof[:-1]], 0.007, wood_l, col)
        stripe.parent = root
        # nock cap at the tip
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=(T[0], 0, T[1] * s), segments=10, ring_count=6)
        cap = bpy.context.object; cap.name = '%s_nock_%s' % (name, nm); cap.data.materials.append(principled('bow_nockcap', hexc('#2A1A10')))
        for c in cap.users_collection:
            c.objects.unlink(cap)
        col.objects.link(cap); cap.parent = root
    # grip: wrapped cylinder at the origin
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.16, location=(0, 0, 0), vertices=12)
    g = bpy.context.object; g.name = name + '_grip'; g.data.materials.append(grip_m)
    for c in list(g.users_collection):
        c.objects.unlink(g)
    col.objects.link(g); g.parent = root
    for p in g.data.polygons:
        p.use_smooth = True
    # string: 3 points (top nock, draw point, bottom nock)
    cu = bpy.data.curves.new(name + '_string', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0045; cu.bevel_resolution = 3; cu.fill_mode = 'FULL'
    sp = cu.splines.new('POLY'); sp.points.add(2)
    sp.points[0].co = (T[0], 0, T[1], 1); sp.points[1].co = (-0.14, 0, 0, 1); sp.points[2].co = (T[0], 0, -T[1], 1)
    st = bpy.data.objects.new(name + '_string', cu); cu.materials.append(string_m)
    col.objects.link(st); st.parent = root
    nock = bpy.data.objects.new(name + '_nock', None); nock.empty_display_size = 0.03
    nock.location = (-0.14, 0, 0); col.objects.link(nock); nock.parent = root
    root['string'] = st.name
    root['nock'] = nock.name
    root['white'] = white
    return root


def draw_string(bow, t, draw):
    """Keyframe the string's middle point at draw 0..1 (0 = rest 0.14 m, 1 = full 0.62 m) at time t."""
    from common import frame
    st = bpy.data.objects[bow['string']]
    x = -(0.14 + 0.48 * draw)
    sp = st.data.splines[0]
    sp.points[1].co = (x, 0, 0, 1)
    sp.points[1].keyframe_insert('co', frame=frame(t))
    nock = bpy.data.objects[bow['nock']]
    nock.location = (x, 0, 0)
    nock.keyframe_insert('location', frame=frame(t))


def build_arrow(name, col, white=False, length=ARROW_LEN):
    """Arrow along +X, tip at the origin, nock at -length. Parent empty returned."""
    shaft_m = principled('arrow_shaft', hexc(SHAFT), rough=0.6)
    head_m = principled('arrow_head', hexc(STEEL), rough=0.3, metal=0.9)
    fl_m = principled('arrow_fletch_white' if white else 'arrow_fletch_red', hexc(FLETCH_WHITE if white else FLETCH_RED), rough=0.7)
    root = bpy.data.objects.new(name, None); root.empty_display_size = 0.05; col.objects.link(root)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.009, depth=length - 0.06, location=(-(length - 0.06) / 2 - 0.05, 0, 0), rotation=(0, math.pi / 2, 0), vertices=8)
    sh = bpy.context.object; sh.name = name + '_shaft'; sh.data.materials.append(shaft_m)
    bpy.ops.mesh.primitive_cone_add(radius1=0.022, radius2=0.0, depth=0.09, location=(-0.045, 0, 0), rotation=(0, math.pi / 2, 0), vertices=6)
    hd = bpy.context.object; hd.name = name + '_head'; hd.data.materials.append(head_m)
    parts = [sh, hd]
    # three fletching vanes
    for i in range(3):
        a = i * 2 * math.pi / 3
        verts = [(-length + 0.02, 0, 0), (-length + 0.14, 0, 0), (-length + 0.11, 0, 0.032), (-length + 0.035, 0, 0.038)]
        f = mesh_object('%s_vane%d' % (name, i), verts, [(0, 1, 2, 3)], col, fl_m, smooth=False)
        f.rotation_euler = (a, 0, 0)
        parts.append(f)
    for p in parts:
        for c in list(p.users_collection):
            c.objects.unlink(p)
        col.objects.link(p)
        p.parent = root
        for poly in p.data.polygons:
            poly.use_smooth = p is sh
    root['white'] = white
    return root


def build_quiver(name, col, white=False):
    """Leather quiver with four arrow tails showing. Local +Z up the quiver."""
    leather = principled('quiver_leather', hexc('#7A4527'), rough=0.75)
    band = principled('quiver_band', hexc('#4E2A15'), rough=0.7)
    root = bpy.data.objects.new(name, None); root.empty_display_size = 0.05; col.objects.link(root)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.085, depth=0.56, location=(0, 0, 0), vertices=14)
    q = bpy.context.object; q.name = name + '_body'; q.data.materials.append(leather)
    for p in q.data.polygons:
        p.use_smooth = True
    parts = [q]
    for z in (0.25, -0.24):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.092, depth=0.045, location=(0, 0, z), vertices=14)
        b = bpy.context.object; b.name = name + '_band'; b.data.materials.append(band); parts.append(b)
    for p in parts:
        for c in list(p.users_collection):
            c.objects.unlink(p)
        col.objects.link(p); p.parent = root
    for i in range(4):
        a = i * 1.7
        ar = build_arrow('%s_spare%d' % (name, i), col, white=white, length=0.5)
        ar.parent = root
        ar.location = (math.cos(a) * 0.035, math.sin(a) * 0.035, 0.52)
        ar.rotation_euler = (0, math.radians(-90), 0)  # tip down into the quiver, fletching up
        # we only need the fletched end visible: tip sits inside the quiver body
        ar.location = (math.cos(a) * 0.035, math.sin(a) * 0.035, -0.2)
    return root


def build_spare_arrows(name, col):
    """Beeman carries two spare arrows, tips down, in the draw hand."""
    root = bpy.data.objects.new(name, None); root.empty_display_size = 0.05; col.objects.link(root)
    for i in range(2):
        a = build_arrow('%s_%d' % (name, i), col, white=True)
        a.parent = root
        a.location = (0.02 * i, 0, 0)
        a.rotation_euler = (0, math.radians(90), 0)
    return root


def build_target(name, col, radius=0.5):
    """Straw archery target on a tripod: rings white/black/blue/red/gold."""
    root = bpy.data.objects.new(name, None); root.empty_display_size = 0.1; col.objects.link(root)
    cols = ['#F2E8C8', '#1A1A1A', '#2E6BD6', '#D8232A', '#F2C230']
    r = radius
    for i, c in enumerate(cols):
        rr = r * (1 - i / 5)
        bpy.ops.mesh.primitive_cylinder_add(radius=rr, depth=0.1 + i * 0.004, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0), vertices=48)
        o = bpy.context.object; o.name = '%s_ring%d' % (name, i); o.data.materials.append(principled('target_%d' % i, hexc(c), rough=0.9))
        for cc in list(o.users_collection):
            cc.objects.unlink(o)
        col.objects.link(o); o.parent = root
    wood = principled('target_wood', hexc('#8A6A40'), rough=0.8)
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=1.4, location=(math.cos(a) * 0.3, math.sin(a) * 0.3, -0.6), vertices=8)
        leg = bpy.context.object; leg.name = '%s_leg%d' % (name, i); leg.data.materials.append(wood)
        leg.rotation_euler = (math.radians(-18) * math.sin(a), math.radians(18) * math.cos(a), 0)
        for cc in list(leg.users_collection):
            cc.objects.unlink(leg)
        col.objects.link(leg); leg.parent = root
    return root
