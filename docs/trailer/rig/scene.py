"""Scene foundation shared by every shot: render settings, sky, sun, fog, particles, the
compositor grade. Arena builders (arenas.py) are assembled from these."""
import math
import random

import bpy
from mathutils import Vector

from common import FPS, H, W, hexc, new_collection, principled

def _rv(node):
    """The live output of a Random Value node (socket layout differs between Blender versions)."""
    for o in node.outputs:
        if o.enabled:
            return o
    return node.outputs[0]


def _set(node, name, value):
    """Set the enabled input called `name` (Random Value keeps one Min/Max per data type)."""
    for i in node.inputs:
        if i.name == name and i.enabled:
            try:
                i.default_value = value
                return
            except Exception:
                pass


QUALITY = {'draft': dict(scale=50, samples=12, mb=False, vol=False), 'review': dict(scale=50, samples=24, mb=True, vol=True),
           'final': dict(scale=100, samples=48, mb=True, vol=True)}


def reset(quality='final', seconds=4.0):
    """Empty file, Eevee, 1920x1080 @ 30, frame range for a shot `seconds` long."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    q = QUALITY[quality]
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = q['scale']
    sc.render.fps = FPS
    sc.frame_start = 1
    sc.frame_end = max(1, int(round(seconds * FPS)))
    ee = sc.eevee
    ee.taa_render_samples = q['samples']
    sc.render.use_motion_blur = q['mb']
    sc.render.motion_blur_shutter = 0.5
    if hasattr(ee, 'motion_blur_steps'):
        ee.motion_blur_steps = 2
    if hasattr(ee, 'use_raytracing'):
        ee.use_raytracing = True
    if hasattr(ee, 'use_shadows'):
        ee.use_shadows = True
    if hasattr(ee, 'volumetric_tile_size'):
        ee.volumetric_tile_size = '8' if quality == 'final' else '16'
        ee.volumetric_samples = 64 if quality == 'final' else 32
        ee.volumetric_end = 120
    if hasattr(ee, 'use_volumetric_shadows'):
        ee.use_volumetric_shadows = True
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.film_transparent = False
    sc['quality'] = quality
    return sc


# ---- sky, light, fog -------------------------------------------------------------------------------

def sky(top, horizon, strength=1.0, ground=None, stars=0.0, horizon_height=0.0, sharp=2.2):
    """Vertical gradient world: `horizon` at eye level blending up to `top`; optional stars."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Incoming'], sep.inputs[0])  # view direction (toward camera): -dir
    neg = nt.nodes.new('ShaderNodeMath'); neg.operation = 'MULTIPLY'; neg.inputs[1].default_value = -1.0
    nt.links.new(sep.outputs['Z'], neg.inputs[0])
    sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = horizon_height
    nt.links.new(neg.outputs[0], sub.inputs[0])
    up = nt.nodes.new('ShaderNodeMapRange'); up.clamp = True
    up.inputs['From Min'].default_value = 0.0; up.inputs['From Max'].default_value = 0.75
    nt.links.new(sub.outputs[0], up.inputs[0])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.0 / sharp
    nt.links.new(up.outputs[0], pw.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = hexc(horizon); mix.inputs['B'].default_value = hexc(top)
    nt.links.new(pw.outputs[0], mix.inputs['Factor'])
    col = mix.outputs['Result']
    if ground:
        dn = nt.nodes.new('ShaderNodeMapRange'); dn.clamp = True
        dn.inputs['From Min'].default_value = 0.0; dn.inputs['From Max'].default_value = -0.25
        nt.links.new(sub.outputs[0], dn.inputs[0])
        m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'
        m2.inputs['B'].default_value = hexc(ground)
        nt.links.new(col, m2.inputs['A']); nt.links.new(dn.outputs[0], m2.inputs['Factor'])
        col = m2.outputs['Result']
    if stars > 0:
        co = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexVoronoi'); noise.inputs['Scale'].default_value = 260
        nt.links.new(co.outputs['Generated'], noise.inputs['Vector'])
        st = nt.nodes.new('ShaderNodeMapRange'); st.clamp = True
        st.inputs['From Min'].default_value = 0.035; st.inputs['From Max'].default_value = 0.0
        nt.links.new(noise.outputs['Distance'], st.inputs[0])
        fade = nt.nodes.new('ShaderNodeMath'); fade.operation = 'MULTIPLY'
        nt.links.new(st.outputs[0], fade.inputs[0]); nt.links.new(pw.outputs[0], fade.inputs[1])
        sm = nt.nodes.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = stars
        nt.links.new(fade.outputs[0], sm.inputs[0])
        add = nt.nodes.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'
        add.inputs['B'].default_value = (1, 1, 1, 1)
        nt.links.new(col, add.inputs['A']); nt.links.new(sm.outputs[0], add.inputs['Factor'])
        col = add.outputs['Result']
    nt.links.new(col, bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return w


def sun(color, direction, energy=3.0, angle=2.0, name='sun'):
    """Sun light shining FROM `direction` (the game's sunDir, three.js axes) toward the scene."""
    from common import three_to_blender
    d = Vector(three_to_blender(direction)).normalized()
    li = bpy.data.lights.new(name, 'SUN')
    li.color = hexc(color)[:3]
    li.energy = energy
    li.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, li)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return ob


def point(name, loc, color, energy, radius=0.2, shadow=True):
    li = bpy.data.lights.new(name, 'POINT')
    li.color = hexc(color)[:3] if isinstance(color, str) else color
    li.energy = energy
    li.shadow_soft_size = radius
    li.use_shadow = shadow
    ob = bpy.data.objects.new(name, li)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


def spot(name, loc, target, color, energy, size_deg=45, blend=0.5, radius=0.3):
    from common import look_at
    li = bpy.data.lights.new(name, 'SPOT')
    li.color = hexc(color)[:3] if isinstance(color, str) else color
    li.energy = energy
    li.spot_size = math.radians(size_deg)
    li.spot_blend = blend
    li.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, li)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    look_at(ob, target)
    return ob


def area(name, loc, target, color, energy, size=2.0):
    from common import look_at
    li = bpy.data.lights.new(name, 'AREA')
    li.color = hexc(color)[:3] if isinstance(color, str) else color
    li.energy = energy
    li.size = size
    ob = bpy.data.objects.new(name, li)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    look_at(ob, target)
    return ob


def fog(color, density=0.01, anisotropy=0.3, height=None, size=140, emission=0.0):
    """Volumetric haze. With `height` the fog is a slab from the ground up to that height
    (ground mist); otherwise it fills the world."""
    sc = bpy.context.scene
    if not sc.get('quality') or sc['quality'] == 'draft':
        density *= 1.0
    name = 'fog_slab' if height else 'fog_world'
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = hexc(color)
    vol.inputs['Density'].default_value = density
    vol.inputs['Anisotropy'].default_value = anisotropy
    if emission > 0:
        vol.inputs['Emission Strength'].default_value = emission
        vol.inputs['Emission Color'].default_value = hexc(color)
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    h = height or 40
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h / 2 - 0.01))
    cube = bpy.context.object
    cube.name = name
    cube.scale = (size, size, h)
    cube.data.materials.append(m)
    cube.display_type = 'WIRE'
    if height:
        # fade the slab's density toward its top
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.clamp = True
        ramp.inputs['From Min'].default_value = 1.0; ramp.inputs['From Max'].default_value = 0.0
        ramp.inputs['To Min'].default_value = 0.0; ramp.inputs['To Max'].default_value = density
        nt.links.new(sep.outputs['Z'], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], vol.inputs['Density'])
    return cube


def ground(color, far=None, size=400, rough=0.9, name='ground', spec=0.2, metal=0.0, noise=0.0, noise_scale=3.0, color2=None):
    """A big ground plane, optionally mottled between two colours."""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    g = bpy.context.object
    g.name = name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    if noise > 0 and color2:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = noise_scale; n.inputs['Detail'].default_value = 4
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs['A'].default_value = hexc(color); mix.inputs['B'].default_value = hexc(color2)
        cr = nt.nodes.new('ShaderNodeMapRange'); cr.clamp = True
        cr.inputs['From Min'].default_value = 0.5 - noise / 2; cr.inputs['From Max'].default_value = 0.5 + noise / 2
        nt.links.new(n.outputs['Fac'] if 'Fac' in n.outputs else n.outputs[0], cr.inputs[0])
        nt.links.new(cr.outputs[0], mix.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = hexc(color)
    g.data.materials.append(m)
    return g


# ---- drifting particles (deterministic: a pure function of the frame) -----------------------------

def particles(name, count, box_min, box_max, velocity, radius=0.02, color='#FFFFFF', emit=0.0, seed=1,
              stretch=1.0, jitter=0.25, sway=0.0, alpha=1.0):
    """`count` small spheres drifting at `velocity` (m/s) inside a box, wrapping round. Positions
    are driven by geometry nodes from scene time, so any frame renders alone and identically.
    `stretch` > 1 elongates them along the velocity (rain streaks)."""
    rnd = random.Random(seed)
    bmin, bmax = Vector(box_min), Vector(box_max)
    size = bmax - bmin
    verts = [(bmin.x + rnd.random() * size.x, bmin.y + rnd.random() * size.y, bmin.z + rnd.random() * size.z) for _ in range(count)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    mat = principled(name + '_mat', hexc(color), rough=0.5, emit=hexc(color) if emit > 0 else None, emit_str=emit, alpha=alpha)
    ng = bpy.data.node_groups.new(name + '_gn', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gin, gout = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    time = N.new('GeometryNodeInputSceneTime')
    pos = N.new('GeometryNodeInputPosition')
    idx = N.new('GeometryNodeInputIndex')
    # per-point speed factor 1 ± jitter
    rv = N.new('FunctionNodeRandomValue'); rv.data_type = 'FLOAT'
    _set(rv, 'Min', 1 - jitter); _set(rv, 'Max', 1 + jitter)
    L.new(idx.outputs[0], rv.inputs['ID'])
    tmul = N.new('ShaderNodeMath'); tmul.operation = 'MULTIPLY'
    L.new(time.outputs['Seconds'], tmul.inputs[0]); L.new(_rv(rv), tmul.inputs[1])
    vel = N.new('ShaderNodeVectorMath'); vel.operation = 'SCALE'
    vel.inputs[0].default_value = velocity
    L.new(tmul.outputs[0], vel.inputs['Scale'])
    add = N.new('ShaderNodeVectorMath'); add.operation = 'ADD'
    L.new(pos.outputs[0], add.inputs[0]); L.new(vel.outputs[0], add.inputs[1])
    cur = add.outputs[0]
    if sway > 0:
        # sideways sine sway, phase per point
        rp = N.new('FunctionNodeRandomValue'); rp.data_type = 'FLOAT'; _set(rp, 'Min', 0); _set(rp, 'Max', 6.283)
        L.new(idx.outputs[0], rp.inputs['ID']); rp.inputs['Seed'].default_value = 7
        ph = N.new('ShaderNodeMath'); ph.operation = 'MULTIPLY_ADD'; ph.inputs[1].default_value = 1.3
        L.new(time.outputs['Seconds'], ph.inputs[0]); L.new(_rv(rp), ph.inputs[2])
        sn = N.new('ShaderNodeMath'); sn.operation = 'SINE'; L.new(ph.outputs[0], sn.inputs[0])
        cs = N.new('ShaderNodeMath'); cs.operation = 'COSINE'; L.new(ph.outputs[0], cs.inputs[0])
        sx = N.new('ShaderNodeMath'); sx.operation = 'MULTIPLY'; sx.inputs[1].default_value = sway; L.new(sn.outputs[0], sx.inputs[0])
        sy = N.new('ShaderNodeMath'); sy.operation = 'MULTIPLY'; sy.inputs[1].default_value = sway * 0.6; L.new(cs.outputs[0], sy.inputs[0])
        comb = N.new('ShaderNodeCombineXYZ'); L.new(sx.outputs[0], comb.inputs[0]); L.new(sy.outputs[0], comb.inputs[1])
        add2 = N.new('ShaderNodeVectorMath'); add2.operation = 'ADD'
        L.new(cur, add2.inputs[0]); L.new(comb.outputs[0], add2.inputs[1])
        cur = add2.outputs[0]
    wrap = N.new('ShaderNodeVectorMath'); wrap.operation = 'WRAP'
    wrap.inputs[1].default_value = tuple(bmax); wrap.inputs[2].default_value = tuple(bmin)
    L.new(cur, wrap.inputs[0])
    sp = N.new('GeometryNodeSetPosition')
    L.new(gin.outputs[0], sp.inputs['Geometry']); L.new(wrap.outputs[0], sp.inputs['Position'])
    m2p = N.new('GeometryNodeMeshToPoints'); L.new(sp.outputs[0], m2p.inputs[0])
    ico = N.new('GeometryNodeMeshIcoSphere'); ico.inputs['Radius'].default_value = radius; ico.inputs['Subdivisions'].default_value = 1
    inst = N.new('GeometryNodeInstanceOnPoints')
    L.new(m2p.outputs[0], inst.inputs['Points']); L.new(ico.outputs[0], inst.inputs['Instance'])
    # random size
    rs = N.new('FunctionNodeRandomValue'); rs.data_type = 'FLOAT'; _set(rs, 'Min', 0.5); _set(rs, 'Max', 1.4)
    rs.inputs['Seed'].default_value = 3
    L.new(idx.outputs[0], rs.inputs['ID'])
    if stretch != 1.0:
        v = Vector(velocity)
        comb = N.new('ShaderNodeCombineXYZ')
        comb.inputs[0].default_value = 1; comb.inputs[1].default_value = 1; comb.inputs[2].default_value = stretch
        L.new(comb.outputs[0], inst.inputs['Scale'])
        if v.length > 1e-6:
            rot = (-v.normalized()).to_track_quat('Z', 'Y').to_euler()
            inst.inputs['Rotation'].default_value = rot
    else:
        L.new(_rv(rs), inst.inputs['Scale'])
    sm = N.new('GeometryNodeSetMaterial'); sm.inputs['Material'].default_value = mat
    L.new(inst.outputs[0], sm.inputs['Geometry'])
    L.new(sm.outputs[0], gout.inputs[0])
    mod = ob.modifiers.new('drift', 'NODES')
    mod.node_group = ng
    return ob


# ---- compositor --------------------------------------------------------------------------------

def grade(bloom=0.6, bloom_threshold=1.0, vignette=0.35, saturation=1.05, contrast=0.0, tint=None, grain=0.0, lens_distort=0.0):
    """Post: bloom, vignette, slight grade. Blender 5 keeps the compositor in a node group."""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new('grade', 'CompositorNodeTree')
    sc.compositing_node_group = ng
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    N, L = ng.nodes, ng.links
    rl = N.new('CompositorNodeRLayers')
    out = N.new('NodeGroupOutput')
    cur = rl.outputs['Image']
    if bloom > 0:
        gl = N.new('CompositorNodeGlare')
        try:
            gl.inputs['Type'].default_value = 'Bloom'
        except Exception:
            pass
        for k, v in (('Threshold', bloom_threshold), ('Strength', bloom), ('Size', 0.6), ('Saturation', 1.0)):
            if k in gl.inputs:
                try:
                    gl.inputs[k].default_value = v
                except Exception:
                    pass
        L.new(cur, gl.inputs['Image'])
        cur = gl.outputs['Image']
    if lens_distort:
        ld = N.new('CompositorNodeLensdist')
        for k, v in (('Distortion', lens_distort), ('Dispersion', 0.012)):
            if k in ld.inputs:
                ld.inputs[k].default_value = v
        L.new(cur, ld.inputs['Image'])
        cur = ld.outputs['Image']
    if saturation != 1.0 or contrast:
        hs = N.new('CompositorNodeHueSat')
        for k, v in (('Saturation', saturation),):
            if k in hs.inputs:
                hs.inputs[k].default_value = v
        L.new(cur, hs.inputs['Image'])
        cur = hs.outputs['Image']
    if tint:
        cb = N.new('CompositorNodeColorBalance')
        try:
            cb.inputs['Gain'].default_value = tint
        except Exception:
            pass
        L.new(cur, cb.inputs['Image'])
        cur = cb.outputs['Image']
    if vignette > 0:
        el = N.new('CompositorNodeEllipseMask')
        for k, v in (('Size', (0.92, 0.92)),):
            if k in el.inputs:
                try:
                    el.inputs[k].default_value = v
                except Exception:
                    pass
        bl = N.new('CompositorNodeBlur')
        for k, v in (('Size', (420.0, 420.0)),):
            if k in bl.inputs:
                try:
                    bl.inputs[k].default_value = v
                except Exception:
                    pass
        L.new(el.outputs[0], bl.inputs['Image'])
        mr = N.new('ShaderNodeMapRange'); mr.clamp = True
        mr.inputs['To Min'].default_value = 1.0 - vignette; mr.inputs['To Max'].default_value = 1.0
        L.new(bl.outputs[0], mr.inputs[0])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        L.new(cur, mx.inputs['A']); L.new(mr.outputs[0], mx.inputs['B'])
        cur = mx.outputs['Result']
    L.new(cur, out.inputs[0])
    return ng
