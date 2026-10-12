"""The six arenas of the trailer, built from the game's own palettes (src/game3d/themes.ts),
set pieces (Arena.ts) and licensed environment kits (mapProps.ts). Blender axes: the action
plays near the origin, the scenery is behind it toward +Y, cameras usually sit on the -Y side.

Each builder returns a dict of useful anchors for the shots."""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import game_assets as ga
import scene as S
from common import hexc, new_collection, principled
from scene import _rv, _set

# ---- batched primitives (one mesh per material, like the game's Baker) ----------------------------


class Batch:
    def __init__(self, name, col=None):
        self.name = name
        self.col = col or bpy.context.scene.collection
        self.bms = {}

    def _bm(self, mat):
        if mat.name not in self.bms:
            self.bms[mat.name] = (bmesh.new(), mat)
        return self.bms[mat.name][0]

    def _xf(self, loc, rot, scale):
        m = Matrix.Translation(Vector(loc))
        if rot:
            from mathutils import Euler
            m = m @ Euler(rot, 'XYZ').to_matrix().to_4x4()
        if scale:
            s = scale if hasattr(scale, '__len__') else (scale, scale, scale)
            m = m @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        return m

    def box(self, mat, loc, size, rot=None):
        bmesh.ops.create_cube(self._bm(mat), size=1.0, matrix=self._xf(loc, rot, size))

    def cyl(self, mat, loc, radius, depth, rot=None, segs=12, radius2=None):
        bmesh.ops.create_cone(self._bm(mat), cap_ends=True, cap_tris=False, segments=segs, radius1=radius,
                              radius2=radius if radius2 is None else radius2, depth=depth, matrix=self._xf(loc, rot, None))

    def cone(self, mat, loc, radius, depth, rot=None, segs=10):
        bmesh.ops.create_cone(self._bm(mat), cap_ends=True, cap_tris=True, segments=segs, radius1=radius, radius2=0.0, depth=depth,
                              matrix=self._xf(loc, rot, None))

    def sphere(self, mat, loc, radius, scale=None, segs=12):
        s = scale or (1, 1, 1)
        bmesh.ops.create_uvsphere(self._bm(mat), u_segments=segs, v_segments=max(6, segs // 2), radius=radius,
                                  matrix=self._xf(loc, None, s))

    def prism(self, mat, loc, width, depth, height, rot_z=0.0):
        """Gabled roof: a triangular prism, ridge along local X."""
        bm = self._bm(mat)
        w, d, h = width / 2, depth / 2, height
        vs = [(-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0), (-w, 0, h), (w, 0, h)]
        m = self._xf(loc, (0, 0, rot_z), None)
        bv = [bm.verts.new(m @ Vector(v)) for v in vs]
        for f in ((0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)):
            bm.faces.new([bv[i] for i in f])

    def finish(self, smooth=False):
        obs = []
        for name, (bm, mat) in self.bms.items():
            me = bpy.data.meshes.new('%s_%s' % (self.name, name))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat)
            if smooth:
                for p in me.polygons:
                    p.use_smooth = True
            ob = bpy.data.objects.new(me.name, me)
            self.col.objects.link(ob)
            obs.append(ob)
        self.bms = {}
        return obs


def mat(name, color, rough=0.85, **kw):
    return principled(name, hexc(color), rough=rough, **kw)


def emissive(name, color, strength=5.0):
    return principled(name, hexc(color), rough=0.5, emit=hexc(color), emit_str=strength)


def mountains(colors, rnd, z_layers=((75, 18, 34, 16, 28, 14), (120, 30, 55, 26, 40, 12), (175, 45, 80, 40, 60, 10)), span=160, snow=None):
    """Three ranges of cones fading into the haze (Arena.buildMountains)."""
    b = Batch('mountains')
    for li, (y, h0, h1, r0, r1, n) in enumerate(z_layers):
        m = mat('mountain_%d' % li, colors[li], rough=1.0)
        for i in range(n):
            x = -span + rnd.random() * span * 2
            h = h0 + rnd.random() * (h1 - h0)
            r = r0 + rnd.random() * (r1 - r0)
            b.cone(m, (x, y + rnd.random() * 12, h / 2 - 1), r, h, segs=7)
            if snow and h > 40:
                b.cone(mat('mountain_snow', snow, rough=0.9), (x, y + rnd.random() * 0.1, h - h * 0.14 - 1 + 0.2), r * 0.3, h * 0.3, segs=7)
    return b.finish()


def moon(loc, radius, color, strength=6.0, halo=None):
    """Emissive disc facing the origin, with an optional larger soft halo."""
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=radius, fill_type='NGON', location=loc)
    m = bpy.context.object
    m.name = 'moon'
    d = (-Vector(loc)).normalized()
    m.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    mm = bpy.data.materials.new('moon'); mm.use_nodes = True
    nt = mm.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    # mottled surface so it reads as a moon, not a lamp
    tc = nt.nodes.new('ShaderNodeTexCoord'); n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 3.2; n.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Generated'], n.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.3; mr.inputs['From Max'].default_value = 0.75
    mr.inputs['To Min'].default_value = 0.55; mr.inputs['To Max'].default_value = 1.0
    nt.links.new(n.outputs[0], mr.inputs[0])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
    mx.inputs['A'].default_value = hexc(color)
    nt.links.new(mr.outputs[0], mx.inputs['B'])
    nt.links.new(mx.outputs['Result'], em.inputs['Color'])
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    m.data.materials.append(mm)
    m.visible_shadow = False
    return m


def scatter(kit, keys, n, x_range, y_range, s_range, rnd, col, avoid=None, avoid_r=3.0, rot=True):
    """Strew kit props over a rectangle, keeping `avoid` (list of (x, y)) clear."""
    out = []
    tries = 0
    while len(out) < n and tries < n * 20:
        tries += 1
        x = x_range[0] + rnd.random() * (x_range[1] - x_range[0])
        y = y_range[0] + rnd.random() * (y_range[1] - y_range[0])
        if avoid and any((x - ax) ** 2 + (y - ay) ** 2 < avoid_r ** 2 for ax, ay in avoid):
            continue
        s = s_range[0] + rnd.random() * (s_range[1] - s_range[0])
        out.append(ga.place_prop(kit, rnd.choice(keys), (x, y, 0), rnd.random() * math.tau if rot else 0.0, s, col))
    return out


def grass_field(name, x_range, y_range, density, height, color_a, color_b, seed=1, width=0.035, sway=0.06, avoid=None):
    """Long grass as instanced blades on a patch (geometry nodes), swaying with scene time."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x_range[0] + x_range[1]) / 2, (y_range[0] + y_range[1]) / 2, 0.0))
    patch = bpy.context.object
    patch.name = name
    patch.scale = (x_range[1] - x_range[0], y_range[1] - y_range[0], 1)
    bpy.ops.object.transform_apply(scale=True)
    # blade: a tapered, slightly bent strip
    verts, faces = [], []
    segs = 4
    for i in range(segs + 1):
        k = i / segs
        w = width * (1 - k) ** 0.8
        bend = 0.22 * k * k
        verts += [(-w, bend, k), (w, bend, k)]
    for i in range(segs):
        faces.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    bme = bpy.data.meshes.new(name + '_blade'); bme.from_pydata(verts, [], faces); bme.update()
    blade = bpy.data.objects.new(name + '_blade', bme)
    bpy.context.scene.collection.objects.link(blade)
    blade.hide_render = True; blade.hide_viewport = True
    gm = bpy.data.materials.new(name + '_mat'); gm.use_nodes = True
    nt = gm.node_tree; bsdf = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeObjectInfo')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = hexc(color_a); mix.inputs['B'].default_value = hexc(color_b)
    nt.links.new(sep.outputs['Z'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.7
    if 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = 0.0
    # translucency: let the low sun glow through the blades
    if 'Transmission Weight' in bsdf.inputs:
        bsdf.inputs['Transmission Weight'].default_value = 0.0
    gm.use_backface_culling = False
    bme.materials.append(gm)
    ng = bpy.data.node_groups.new(name + '_gn', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gin, gout = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    dist = N.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'RANDOM'
    dist.inputs['Density'].default_value = density; dist.inputs['Seed'].default_value = seed
    L.new(gin.outputs[0], dist.inputs['Mesh'])
    oi = N.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = blade
    inst = N.new('GeometryNodeInstanceOnPoints')
    L.new(dist.outputs['Points'], inst.inputs['Points']); L.new(oi.outputs['Geometry'], inst.inputs['Instance'])
    # random yaw, lean, height; sway = lean oscillating with time and position
    rz = N.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT'; _set(rz, 'Min', 0); _set(rz, 'Max', 6.283)
    rl = N.new('FunctionNodeRandomValue'); rl.data_type = 'FLOAT'; _set(rl, 'Min', -0.22); _set(rl, 'Max', 0.22); rl.inputs['Seed'].default_value = 5
    time = N.new('GeometryNodeInputSceneTime'); pos = N.new('GeometryNodeInputPosition'); sp = N.new('ShaderNodeSeparateXYZ')
    L.new(pos.outputs[0], sp.inputs[0])
    ph = N.new('ShaderNodeMath'); ph.operation = 'MULTIPLY_ADD'; ph.inputs[1].default_value = 1.6
    L.new(time.outputs['Seconds'], ph.inputs[0]); L.new(sp.outputs['X'], ph.inputs[2])
    sn = N.new('ShaderNodeMath'); sn.operation = 'SINE'; L.new(ph.outputs[0], sn.inputs[0])
    sw = N.new('ShaderNodeMath'); sw.operation = 'MULTIPLY_ADD'; sw.inputs[1].default_value = sway
    L.new(sn.outputs[0], sw.inputs[0]); L.new(_rv(rl), sw.inputs[2])
    rot = N.new('ShaderNodeCombineXYZ')
    L.new(sw.outputs[0], rot.inputs['X']); L.new(_rv(rz), rot.inputs['Z'])
    L.new(rot.outputs[0], inst.inputs['Rotation'])
    rh = N.new('FunctionNodeRandomValue'); rh.data_type = 'FLOAT'; _set(rh, 'Min', height * 0.55); _set(rh, 'Max', height); rh.inputs['Seed'].default_value = 9
    sc = N.new('ShaderNodeCombineXYZ'); sc.inputs['X'].default_value = 1; sc.inputs['Y'].default_value = 1
    L.new(_rv(rh), sc.inputs['Z'])
    L.new(sc.outputs[0], inst.inputs['Scale'])
    L.new(inst.outputs[0], gout.inputs[0])
    mod = patch.modifiers.new('grass', 'NODES'); mod.node_group = ng
    return patch


def pine(b, x, y, s, trunk, foliage, foliage2=None, rnd=None):
    """The game's procedural pine: a trunk and three stacked cones."""
    b.cyl(trunk, (x, y, 0.9 * s), 0.16 * s, 1.8 * s, segs=6)
    for i, (r, h, z) in enumerate(((1.25, 2.0, 2.2), (0.95, 1.7, 3.3), (0.62, 1.4, 4.3))):
        b.cone(foliage if i % 2 == 0 or not foliage2 else foliage2, (x, y, z * s), r * s, h * s, segs=8)


def fire(name, loc, scale=1.0, energy=600, color='#FF7A2A', flicker_seed=0, light=True, shadow=False):
    """A brazier flame: stacked emissive blobs plus a flickering point light."""
    b = Batch(name)
    em = emissive('fire_core', '#FFC060', 9)
    em2 = emissive('fire_outer', '#FF5A14', 4)
    x, y, z = loc
    b.sphere(em2, (x, y, z + 0.18 * scale), 0.24 * scale, (1, 1, 1.5), segs=10)
    b.sphere(em, (x, y, z + 0.14 * scale), 0.15 * scale, (1, 1, 1.6), segs=10)
    b.sphere(em2, (x + 0.05 * scale, y, z + 0.46 * scale), 0.11 * scale, (1, 1, 1.9), segs=8)
    obs = b.finish(smooth=True)
    for o in obs:
        o.visible_shadow = False
        # flicker: scale noise
        o.keyframe_insert('scale', frame=1)
        from common import fcurves
        for i, fc in enumerate(fcurves(o.animation_data.action)):
            m = fc.modifiers.new('NOISE'); m.strength = 0.25; m.scale = 3.0; m.phase = flicker_seed * 13.7 + i * 5.1
    li = None
    if light:
        li = S.point(name + '_light', (x, y, z + 0.5 * scale), color, energy, radius=0.35, shadow=shadow)
        li.data.keyframe_insert('energy', frame=1)
        from common import fcurves
        for fc in fcurves(li.data.animation_data.action):
            m = fc.modifiers.new('NOISE'); m.strength = energy * 0.35; m.scale = 2.5; m.phase = flicker_seed * 7.3
    return obs, li


# ---- 1. Colosseum under a blood moon ---------------------------------------------------------------

def build_colosseum(night=True, seed=7, braziers=8, radius=30.0):
    rnd = random.Random(seed)
    col = new_collection('arena')
    if night:
        S.sky('#070B1C', '#7A2E1C', strength=0.5, stars=3.0, ground='#14100E', sharp=1.3)
        S.sun('#FF8448', (0.0, 0.42, -1.0), energy=2.6, angle=4)  # the moon behind the arena wall: warm rim light
        S.sun('#5E7EC8', (-0.6, 0.8, 0.6), energy=1.1, angle=14, name='fill')  # cool night fill from the camera side
        moon_ob = moon((0, 210, 62), 46, '#FF6A30', strength=4.0)
        S.fog('#9A6A58', density=0.0035, anisotropy=0.6)
    else:
        S.sky('#7DB8E8', '#F3E3C3', strength=1.0)
        S.sun('#FFF0D0', (-0.35, 0.8, 0.45), energy=4.0)
        moon_ob = None
    floor = S.ground('#B08A56' if night else '#C9A46A', color2='#8E6C40', noise=0.5, noise_scale=1.4, rough=0.95, name='sand')
    stone = mat('col_stone', '#CDB993'); stone_d = mat('col_stone_dark', '#A8946E'); shade = mat('col_shade', '#2A2016')
    blue = mat('col_banner_blue', '#3A7BC8', rough=0.7); red = mat('col_banner_red', '#C83A3A', rough=0.7)
    b = Batch('colosseum', col)
    n = 56
    R = radius
    seg = math.tau * R / n
    for i in range(n):
        a = i / n * math.tau
        cx, cy = math.cos(a), math.sin(a)
        rz = a + math.pi / 2
        for tier in range(3):
            r = R + tier * 3
            z0 = tier * 6
            b.box(stone_d if tier == 1 else stone, (cx * r, cy * r, z0 + 3), (seg * 1.14 * (r / R), 1.6, 6.05), (0, 0, rz))
            b.box(shade, (cx * (r - 0.82), cy * (r - 0.82), z0 + 2.6), (seg * 0.45, 0.06, 3.4), (0, 0, rz))
            # arch top (half cylinder look): a dark disc above the recess
            b.cyl(shade, (cx * (r - 0.82), cy * (r - 0.82), z0 + 4.3), seg * 0.225, 0.06, (math.pi / 2, 0, rz), segs=16)
            # cornice
            b.box(stone, (cx * (r - 0.15), cy * (r - 0.15), z0 + 5.85), (seg * 1.04, 1.9, 0.3), (0, 0, rz))
        if i % 4 == 0:
            b.box(blue if i % 8 == 0 else red, (cx * (R - 0.95), cy * (R - 0.95), 8.5), (1.4, 0.05, 4.0), (0, 0, rz))
    # broken columns and barrels on the floor edge
    wood = mat('col_wood', '#6B4A2E')
    for i in range(10):
        a = rnd.random() * math.tau
        r = R - 3 - rnd.random() * 5
        if rnd.random() < 0.5:
            h = 1.2 + rnd.random() * 2.6
            b.cyl(stone, (math.cos(a) * r, math.sin(a) * r, h / 2), 0.42, h, segs=12)
        else:
            b.cyl(wood, (math.cos(a) * r, math.sin(a) * r, 0.5), 0.45, 1.0, segs=10)
    b.finish()
    # braziers in a ring round the floor
    fires = []
    iron = mat('col_iron', '#1E1A18', rough=0.6, metal=0.6)
    bb = Batch('braziers', col)
    for i in range(braziers):
        a = (i + 0.5) / braziers * math.tau
        x, y = math.cos(a) * 13.0, math.sin(a) * 13.0
        bb.cyl(iron, (x, y, 0.55), 0.07, 1.1, segs=8)
        bb.cyl(iron, (x, y, 1.18), 0.42, 0.22, segs=12, radius2=0.26)
        fires.append(fire('brazier_%d' % i, (x, y, 1.25), 1.15, energy=1400 if night else 0, flicker_seed=i, light=night, shadow=(i % 2 == 0)))
    bb.finish()
    embers = None
    if night:
        embers = S.particles('embers', 380, (-18, -18, 0), (18, 22, 13), (0.25, 0.1, 0.75), radius=0.022, color='#FF8A30', emit=40, seed=3, sway=0.25, jitter=0.5)
    return dict(col=col, floor=floor, moon=moon_ob, fires=fires, embers=embers, R=R)


# ---- 2. Golden Meadow ------------------------------------------------------------------------------

def build_golden_meadow(seed=11, sunset=False, grass=True, grass_y=(-9, 9), grass_x=(-9, 9), windmill=None, fence_y=6.0, grass_density=220, grass_height=0.95):
    rnd = random.Random(seed)
    col = new_collection('arena')
    if sunset:
        S.sky('#3A5E9E', '#FFB368', strength=1.0, ground='#6E5A2A', sharp=1.6)
        S.sun('#FF9A4A', (-0.9, 0.16, -0.5), energy=5.5, angle=3)
    else:
        S.sky('#4A90D9', '#FFE2B0', strength=1.0, ground='#7A8A3A', sharp=1.8)
        S.sun('#FFC98A', (-0.75, 0.3, -0.45), energy=5.0, angle=2.5)  # low golden-hour sun, behind-left
    S.sun('#9FC8FF', (0.5, 0.6, 0.6), energy=0.7, angle=20, name='fill')
    S.fog('#FFD9A0', density=0.004, anisotropy=0.7)
    S.ground('#6E8B3D', color2='#C9B458', noise=0.6, noise_scale=0.35, name='meadow')
    mountains(['#6F8FA8', '#8FAABF', '#B4C8D8'], rnd)
    b = Batch('meadow', col)
    trunk = mat('pine_trunk', '#4A3525'); fol = mat('pine_foliage', '#3F6B34'); fol2 = mat('pine_foliage_dark', '#2A4A24')
    for i in range(46):
        x = -70 + rnd.random() * 140
        y = 16 + rnd.random() * 46
        pine(b, x, y, 1.6 + rnd.random() * 1.5, trunk, fol, fol2)
    # rocks
    rock = mat('meadow_rock', '#6A6158')
    for i in range(14):
        x, y = -30 + rnd.random() * 60, 6 + rnd.random() * 30
        b.sphere(rock, (x, y, 0.1), 0.5 + rnd.random() * 0.9, (1.3, 1.0, 0.6), segs=8)
    # a split-rail fence across the meadow
    wood = mat('fence_wood', '#7A5A3A', rough=0.8)
    posts = []
    for i in range(-6, 7):
        x = i * 2.2 + 1.0
        b.cyl(wood, (x, fence_y, 0.6), 0.09, 1.2, segs=8)
        posts.append((x, fence_y, 1.0))
        if i < 6:
            b.box(wood, (x + 1.1, fence_y, 0.95), (2.2, 0.07, 0.09))
            b.box(wood, (x + 1.1, fence_y, 0.55), (2.2, 0.07, 0.09))
    b.finish()
    field = None
    if grass:
        field = grass_field('grass', grass_x, grass_y, density=grass_density, height=grass_height, color_a='#4E6E2A', color_b='#E8D070', seed=seed)
        grass_field('grass_far', (-40, 40), (9, 30), density=14, height=0.8, color_a='#5E7E34', color_b='#D8C468', seed=seed + 1, width=0.06)
    mill = None
    if windmill:
        mill = ga.place_prop('valley', 'mill', windmill, math.pi + 0.35, 1.3, col)
    S.particles('pollen', 260, (-12, -10, 0.2), (12, 14, 4), (0.25, 0.05, 0.06), radius=0.012, color='#FFF6C8', emit=6, seed=5, sway=0.3)
    return dict(col=col, posts=posts, grass=field, mill=mill)


# ---- 3. Moonlit Woods ------------------------------------------------------------------------------

def build_moonlit_woods(seed=21, clearing=6.0):
    rnd = random.Random(seed)
    col = new_collection('arena')
    S.sky('#07131F', '#2F6A6A', strength=0.5, stars=4.0, ground='#0E2620', sharp=1.5)
    S.sun('#BFE3FF', (0.25, 0.75, -0.7), energy=4.0, angle=1.0)  # the moon, behind: rim light and beams
    S.sun('#4EA0A8', (-0.5, 0.6, 0.7), energy=0.8, angle=20, name='fill')
    moon_ob = moon((60, 230, 120), 20, '#DDF4FF', strength=9.0)
    S.fog('#3E8A86', density=0.022, anisotropy=0.72)
    S.ground('#1C3A2E', color2='#28504A', noise=0.6, noise_scale=0.5, name='woods_floor', rough=0.95)
    # trees: the grove kit's firs and round trees, lit by the moon
    avoid = [(0, 0)]
    trees = scatter('grove', ['tree_fir_tall', 'tree_fir_tall', 'tree_1_leaf_1'], 70, (-45, 45), (-6, 60), (2.6, 4.2), rnd, col, avoid, clearing)
    scatter('grove', ['tree_fir_tall'], 26, (-40, 40), (-34, -9), (2.8, 4.0), rnd, col, avoid, clearing + 2)
    scatter('grove', ['stone_large_1', 'stone_medium_1'], 24, (-20, 20), (-4, 30), (1.2, 2.6), rnd, col, avoid, 3.5)
    scatter('grove', ['foliage_grasspatch_small_1', 'foliage_grasspatch_small_2'], 420, (-16, 16), (-8, 26), (1.6, 3.0), rnd, col, avoid, 0.8)
    # glowing mushrooms (the theme's signature)
    glow = emissive('mushroom_glow', '#5AE0D0', 6.0)
    shrooms = scatter('grove', ['foliage_mushroom_blue_big'], 40, (-14, 14), (-5, 22), (2.5, 5), rnd, col, avoid, 1.5)
    for i, sob in enumerate(shrooms):
        if i % 3 == 0:
            S.point('shroom_light_%d' % i, (sob.location.x, sob.location.y, 0.8), '#5AE0D0', 18, radius=0.3, shadow=False)
    S.particles('fireflies', 150, (-12, -8, 0.3), (12, 22, 3.5), (0.12, 0.08, 0.03), radius=0.02, color='#D8FF7A', emit=60, seed=8, sway=0.5, jitter=0.6)
    return dict(col=col, moon=moon_ob, trees=trees)


# ---- 4. Elder Forest ------------------------------------------------------------------------------

def build_elder_forest(seed=31, corridor=None, clearing=5.0, big_tree=None):
    """Bright painted-fir forest. `corridor` = ((x0, y0), (x1, y1), half_width): a lane kept clear
    of trunks (the arrow-cam flight path). `big_tree` = (x, y, scale): one hero fir placed exactly."""
    rnd = random.Random(seed)
    col = new_collection('arena')
    S.sky('#2FA8EE', '#BFE8FF', strength=1.1, ground='#4E7A2C', sharp=1.8)
    S.sun('#FFF4D6', (-0.45, 0.8, 0.4), energy=4.6, angle=1.5)
    S.sun('#BFE0FF', (0.6, 0.5, -0.6), energy=0.6, angle=20, name='fill')
    S.fog('#C6E6F6', density=0.004, anisotropy=0.6)
    S.ground('#5E9E34', color2='#86B85A', noise=0.6, noise_scale=0.4, name='forest_floor')
    mountains(['#6E7F95', '#8B9BB0', '#AEBBCB'], rnd, snow='#F4F8FF')
    avoid = [(0, 0)]
    if big_tree:
        avoid.append((big_tree[0], big_tree[1]))
    placed = []

    def clear_of_corridor(x, y):
        if not corridor:
            return True
        (x0, y0), (x1, y1), hw = corridor
        d = Vector((x1 - x0, y1 - y0)); p = Vector((x - x0, y - y0))
        k = max(0, min(1, p.dot(d) / d.length_squared))
        return (p - d * k).length > hw

    tries = 0
    while len(placed) < 150 and tries < 4000:
        tries += 1
        x, y = -60 + rnd.random() * 120, -40 + rnd.random() * 110
        if any((x - ax) ** 2 + (y - ay) ** 2 < clearing ** 2 for ax, ay in avoid) or not clear_of_corridor(x, y):
            continue
        s = 2.4 + rnd.random() * 1.5
        placed.append(ga.place_prop('grove', rnd.choice(['tree_fir_tall', 'tree_fir_tall', 'tree_1_leaf_1']), (x, y, 0), rnd.random() * math.tau, s, col))
    hero_tree = None
    if big_tree:
        hero_tree = ga.place_prop('grove', 'tree_fir_tall', (big_tree[0], big_tree[1], 0), 0.6, big_tree[2], col, name='hero_fir')
    scatter('grove', ['stone_large_1', 'stone_medium_1'], 40, (-30, 30), (-20, 40), (1.2, 2.8), rnd, col, avoid, 3.5)
    scatter('grove', ['tree_stump_1'], 10, (-20, 20), (-12, 30), (2, 2.6), rnd, col, avoid, 2.5)
    scatter('grove', ['foliage_mushroom_blue_big', 'foliage_mushroom_red_small'], 60, (-18, 18), (-12, 28), (2, 4), rnd, col, avoid, 1.2)
    scatter('grove', ['foliage_grasspatch_small_1', 'foliage_grasspatch_small_2'], 700, (-22, 22), (-16, 34), (1.6, 3.2), rnd, col, avoid, 0.8)
    # the dirt road
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.03))
    road = bpy.context.object; road.name = 'road'; road.scale = (2.8, 220, 1)
    rm = bpy.data.materials.new('road'); rm.use_nodes = True
    t = rm.node_tree.nodes.new('ShaderNodeTexImage')
    import os
    from common import ASSETS
    t.image = ga.load_image(os.path.join(ASSETS, 'licensed', 'maps', 'grove_road.jpg'))
    mp = rm.node_tree.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 78, 1)
    tc = rm.node_tree.nodes.new('ShaderNodeTexCoord')
    rm.node_tree.links.new(tc.outputs['UV'], mp.inputs[0]); rm.node_tree.links.new(mp.outputs[0], t.inputs[0])
    rm.node_tree.links.new(t.outputs[0], rm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    rm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    road.data.materials.append(rm)
    road['is_road'] = True
    S.particles('pollen', 220, (-12, -12, 0.3), (12, 20, 6), (0.2, 0.06, 0.04), radius=0.014, color='#FFF6C8', emit=4, seed=6, sway=0.3)
    return dict(col=col, trees=placed, hero_tree=hero_tree, road=road)


# ---- 5. Rainy Town ------------------------------------------------------------------------------

def build_rainy_town(seed=41, rain=True):
    """Night street: timber houses with lit windows, wet cobbles, a neon sign, rain.
    The hero building sits at x in [-4, 4], y = 4: a low roof sloping toward the camera (-Y)
    above a balcony with an iron rail."""
    rnd = random.Random(seed)
    col = new_collection('arena')
    S.sky('#1E2532', '#5B6676', strength=0.35, ground='#1C1E24', sharp=1.4)
    S.sun('#C9D6E8', (0.3, 0.7, -0.5), energy=1.3, angle=6)  # moon behind the roofs
    S.sun('#6E88B8', (-0.4, 0.6, 0.7), energy=0.35, angle=20, name='fill')
    S.fog('#5A6A84', density=0.012, anisotropy=0.5)
    street = S.ground('#2E3138', rough=0.12, metal=0.0, spec=0.9, name='street', color2='#1E2026', noise=0.5, noise_scale=1.2)
    walls = [mat('town_wall_%d' % i, c) for i, c in enumerate(['#6B6560', '#7A6F62', '#5C5A58', '#8A7A66'])]
    timber = mat('town_timber', '#3A2A1E')
    roofs = [mat('town_roof_%d' % i, c, rough=0.35, spec=0.7) for i, c in enumerate(['#2F6B6B', '#7A3B32', '#3E5A6E', '#5A3A3A'])]
    lit = emissive('town_window_lit', '#FFC94D', 9.0)
    dark = mat('town_window_dark', '#1A1C22', rough=0.2)
    b = Batch('town', col)

    def house(cx, y, w, h, d, wall, roof, windows=True):
        b.box(wall, (cx, y, h / 2), (w, d, h))
        b.box(timber, (cx, y - d / 2 - 0.02, h * 0.55), (w, 0.05, 0.12))
        b.box(timber, (cx, y - d / 2 - 0.02, h), (w, 0.05, 0.14))
        b.prism(roof, (cx, y, h), w * 1.06, d * 1.18, d * 0.55)
        if windows:
            cols = max(1, int(w / 1.4))
            for r in range(2):
                for c in range(cols):
                    wx = cx - w / 2 + (c + 0.5) * (w / cols)
                    wz = h * (0.3 if r == 0 else 0.75)
                    b.box(lit if rnd.random() < 0.62 else dark, (wx, y - d / 2 - 0.03, wz), (0.45, 0.04, 0.6))
        if rnd.random() < 0.4:
            b.box(walls[2], (cx + (rnd.random() - 0.5) * w * 0.5, y, h + d * 0.4), (0.4, 0.4, 1.2))

    # two rows of houses behind, one row silhouette in front-left/right for depth
    for row_y, s in ((16, 1.0), (30, 1.3)):
        x = -44
        while x < 44:
            w = (3 + rnd.random() * 3) * s
            h = (3.5 + rnd.random() * 3) * s
            if row_y == 16 and -6 < x + w / 2 < 6:
                x += w + 0.5
                continue
            house(x + w / 2, row_y + rnd.random() * 2, w, h, 3 * s, rnd.choice(walls), rnd.choice(roofs))
            x += w + 0.2 + rnd.random() * 0.8
    # castle wall far back
    castle = mat('town_castle', '#5A5E66')
    b.box(castle, (0, 58, 6), (200, 3, 12))
    for x in range(-90, 91, 3):
        b.box(castle, (x, 58, 12.6), (1.4, 3, 1.2))
    for i in range(5):
        tx = -60 + i * 30 + rnd.random() * 8
        th = 16 + rnd.random() * 8
        b.cyl(castle, (tx, 56, th / 2), 2.6, th, segs=10)
        b.cone(mat('town_tower_roof', '#2F5A62'), (tx, 56, th + 2.4), 3.2, 5, segs=10)
        b.box(lit, (tx, 53.4, th * 0.7), (0.5, 0.05, 0.9))
    # --- the hero building: wall, sloping roof toward the camera, balcony + rail
    hw, hh, hd = 9.0, 5.2, 5.0
    hy = 6.5
    b.box(walls[1], (0, hy, hh / 2), (hw, hd, hh))
    for wx in (-3.0, 0.0, 3.0):
        b.box(lit, (wx, hy - hd / 2 - 0.03, 1.5), (0.7, 0.04, 0.95))
        b.box(timber, (wx, hy - hd / 2 - 0.04, 1.5), (0.8, 0.03, 0.06))
    b.box(timber, (0, hy - hd / 2 - 0.02, hh), (hw, 0.06, 0.16))
    # roof plane sloping down toward -Y: from ridge (y=hy+0.6, z=hh+2.4) to eave (y=hy-hd/2-0.5, z=hh+0.1)
    ridge = Vector((0, hy + 0.8, hh + 2.5)); eave = Vector((0, hy - hd / 2 - 0.55, hh + 0.15))
    slope = eave - ridge
    ang = math.atan2(slope.z, -slope.y)  # tilt about X
    mid = (ridge + eave) / 2
    b.box(roofs[0], tuple(mid), (hw * 1.06, slope.length, 0.14), (-ang, 0, 0))
    b.box(roofs[0], (0, hy + 2.3, hh + 1.35), (hw * 1.06, 3.3, 0.14), (math.atan2(2.5 - 0.15, 3.0), 0, 0))
    # tile ridges on the front slope
    for i in range(1, 9):
        k = i / 9
        p = ridge.lerp(eave, k)
        b.box(mat('town_roof_ridge', '#255858', rough=0.3, spec=0.8), (0, p.y, p.z + 0.07), (hw * 1.06, 0.06, 0.05), (-ang, 0, 0))
    b.box(walls[2], (2.9, hy + 0.3, hh + 2.2), (0.6, 0.6, 1.6))  # chimney
    # balcony: slab at z=3.0 sticking out 1.3 m, with posts and an iron rail at z=4.0
    iron = mat('town_iron', '#15161A', rough=0.35, metal=0.8)
    bal_y = hy - hd / 2 - 0.65
    b.box(mat('town_balcony', '#4A4038'), (0, bal_y, 2.95), (5.0, 1.3, 0.14))
    rail_y = bal_y - 0.6
    b.box(iron, (0, rail_y, 4.0), (5.0, 0.06, 0.06))
    b.box(iron, (0, rail_y, 3.5), (5.0, 0.04, 0.04))
    for i in range(11):
        x = -2.5 + i * 0.5
        b.box(iron, (x, rail_y, 3.5), (0.04, 0.04, 1.0))
    for sx in (-2.5, 2.5):
        b.box(iron, (sx, bal_y, 3.5), (0.05, 1.2, 0.05))
    b.box(mat('town_door', '#2A1E16'), (0, hy - hd / 2 - 0.03, 3.95), (0.9, 0.05, 1.9))
    # hanging signboard on the left
    b.box(iron, (-3.9, hy - hd / 2 - 0.6, 3.3), (0.05, 1.2, 0.05))
    b.box(mat('town_sign', '#5A3A22'), (-3.9, hy - hd / 2 - 0.9, 2.75), (0.08, 1.0, 0.7))
    # parapet posts and chain along the front of the street
    post = mat('town_post', '#3E3F44')
    for x in range(-24, 25, 4):
        b.box(post, (x, -7.5, 0.55), (0.45, 0.45, 1.1))
    b.finish()
    # neon sign on the hero wall (tubes) + its coloured light on the wet street
    neon_p = emissive('neon_pink', '#FF3A8A', 22.0)
    neon_c = emissive('neon_cyan', '#3AE8FF', 22.0)
    nb = Batch('neon', col)
    ny = hy - hd / 2 - 0.08
    # a bow-and-arrow glyph: arc + string + arrow
    for i in range(14):
        a0 = -1.1 + i * (2.2 / 14)
        nb.cyl(neon_p, (3.2 + math.cos(a0) * 0.7 - 0.3, ny, 1.9 + math.sin(a0) * 0.7 + 1.5), 0.035, 0.2, (0, a0, 0), segs=6)
    nb.cyl(neon_c, (3.0, ny, 3.4), 0.03, 1.5, (0, math.pi / 2, 0), segs=6)
    nb.cone(neon_c, (3.85, ny, 3.4), 0.1, 0.22, (0, math.pi / 2, 0), segs=6)
    for o in nb.finish():
        o.visible_shadow = False
    S.point('neon_light_p', (3.0, ny - 0.8, 3.4), '#FF3A8A', 260, radius=0.5)
    S.point('neon_light_c', (-3.6, ny - 0.8, 2.2), '#3AE8FF', 160, radius=0.5)
    # street lamps
    lb = Batch('lamps', col)
    lamp_m = emissive('lamp_glow', '#FFD9A0', 30)
    for x in (-9, 9, -20, 20):
        lb.cyl(iron, (x, -1.5, 2.2), 0.06, 4.4, segs=8)
        lb.sphere(lamp_m, (x, -1.5, 4.5), 0.18, segs=10)
        S.point('lamp_%d' % x, (x, -1.5, 4.4), '#FFC98A', 500, radius=0.3)
    lb.finish()
    rain_ob = None
    if rain:
        rain_ob = S.particles('rain', 2600, (-14, -14, 0), (14, 12, 13), (0.6, -0.4, -15.0), radius=0.008, color='#C8D8E8', emit=1.2, seed=4,
                              stretch=26.0, jitter=0.15, alpha=0.5)
    return dict(col=col, street=street, roof_ridge=ridge, roof_eave=eave, rail=(0, rail_y, 4.0), balcony=(0, bal_y, 3.02), house=(0, hy, hh))


# ---- 6. Snowfall Village ------------------------------------------------------------------------------

def build_snowfall_village(seed=51, snowman_at=(0.0, 0.0), hat=True):
    rnd = random.Random(seed)
    col = new_collection('arena')
    S.sky('#5F9BDA', '#EAF4FC', strength=1.15, ground='#C9D8E8', sharp=1.6)
    S.sun('#FFF4E6', (-0.35, 0.6, 0.55), energy=3.4, angle=3)
    S.sun('#BFD8FF', (0.6, 0.5, -0.5), energy=0.8, angle=20, name='fill')
    S.fog('#DCE8F4', density=0.006, anisotropy=0.4)
    S.ground('#EEF3F8', color2='#C9D8E8', noise=0.5, noise_scale=0.3, name='snow', rough=0.7, spec=0.4)
    mountains(['#8EA4BE', '#A8BACE', '#C6D4E2'], rnd, snow='#FFFFFF')
    avoid = [snowman_at, (0, -3)]
    K = 'snow'
    # cottages in a row behind, fronts toward the camera (-Y)
    cottages = []
    x = -38
    while x < 40:
        y = 13 + rnd.random() * 6
        if abs(x) < 4:
            x += 9
            continue
        cottages.append(ga.place_prop(K, rnd.choice(['cottage1', 'cottage2', 'cottage3']), (x, y, 0), (rnd.random() - 0.5) * 0.5, 4.0, col))
        avoid.append((x, y))
        x += 11 + rnd.random() * 7
    scatter(K, ['pine3', 'pine4', 'pine5', 'pine2'], 34, (-45, 45), (9, 30), (6, 8), rnd, col, avoid, 5)
    scatter(K, ['pine3', 'pine4', 'pine5'], 40, (-60, 60), (30, 70), (7, 10), rnd, col)
    scatter(K, ['tree1', 'tree2', 'deadtree'], 10, (-40, 40), (10, 34), (3.5, 4.5), rnd, col, avoid, 5)
    scatter(K, ['snow1', 'snow2', 'snow3', 'snow4', 'snow5'], 70, (-20, 20), (-8, 14), (4, 7), rnd, col, [snowman_at, (0, -3), (0, 2)], 2.2)
    scatter(K, ['stump1', 'stump2'], 8, (-16, 16), (2, 12), (3.5, 4.5), rnd, col, avoid, 2.5)
    # fence line
    fl = ga.prop_size(K, 'fence_1').x * 2
    for run_x in (-14, 6):
        for k in range(4):
            ga.place_prop(K, rnd.choice(['fence_1', 'fence_2']), (run_x + k * fl, 8.5, 0), 0, 2, col)
    well = ga.place_prop(K, 'well', (7.5, 6.0, 0), 0.4, 3.0, col)
    # the snowman, exactly placed, with a top hat
    sm = ga.place_prop(K, 'snowman', (snowman_at[0], snowman_at[1], 0), math.pi, 3.4, col, name='snowman')
    top = ga.prop_size(K, 'snowman').z * 3.4
    hat_ob = None
    if hat:
        felt = mat('hat_felt', '#15151A', rough=0.6)
        hb = Batch('hat', col)
        hb.cyl(felt, (0, 0, 0.02), 0.34, 0.04, segs=20)
        hb.cyl(felt, (0, 0, 0.22), 0.21, 0.4, segs=20)
        hb.cyl(mat('hat_band', '#B02A2A'), (0, 0, 0.08), 0.215, 0.07, segs=20)
        parts = hb.finish(smooth=True)
        hat_ob = bpy.data.objects.new('top_hat', None)
        col.objects.link(hat_ob)
        for p in parts:
            p.parent = hat_ob
        hat_ob.location = (snowman_at[0], snowman_at[1], top - 0.04)
    snow = S.particles('snowfall', 1500, (-16, -14, 0), (16, 18, 11), (0.25, -0.1, -1.1), radius=0.02, color='#FFFFFF', emit=1.5, seed=6, sway=0.35, jitter=0.4)
    return dict(col=col, snowman=sm, hat=hat_ob, snowman_top=top, cottages=cottages, well=well)


def sleigh(col, loc, rot_z=0.0):
    """A simple wooden sleigh (the kit has none)."""
    b = Batch('sleigh', col)
    wood = mat('sleigh_wood', '#8A3A2A', rough=0.6); run = mat('sleigh_runner', '#3A3A40', rough=0.3, metal=0.8)
    b.box(wood, (0, 0, 0.62), (2.0, 0.9, 0.12))
    b.box(wood, (-0.95, 0, 0.9), (0.1, 0.9, 0.55))
    b.box(wood, (0.6, 0, 0.82), (0.1, 0.9, 0.4))
    for sy in (-0.42, 0.42):
        b.box(run, (0, sy, 0.05), (2.5, 0.06, 0.07))
        b.box(run, (-0.7, sy, 0.32), (0.06, 0.06, 0.55))
        b.box(run, (0.7, sy, 0.32), (0.06, 0.06, 0.55))
        b.box(run, (1.32, sy, 0.2), (0.3, 0.06, 0.07), (0, -0.9, 0))
    parts = b.finish()
    root = bpy.data.objects.new('sleigh', None); col.objects.link(root)
    for p in parts:
        p.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rot_z)
    return root
