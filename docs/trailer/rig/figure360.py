"""The whole reference figure in 3D (rig/turn360/build_figure360.py): the carved volume as a
smooth mesh, textured by blending the two turnaround views nearest the camera's bearing.
Figure space: feet on z = 0, facing -Y."""
import json
import math
import os

import bpy
import numpy as np

from common import RIG

VIEWS = 24
STEP = 2 * math.pi / VIEWS


def _surface(dens, iso=0.5):
    """Boundary of the volume as quads with shared vertices (smoothed afterwards in Blender)."""
    vol = dens > iso
    G = vol.shape[0]
    verts, index, faces = [], {}, []

    def vid(p):
        i = index.get(p)
        if i is None:
            i = len(verts); index[p] = i; verts.append(p)
        return i
    pad = np.pad(vol, 1)
    for axis in range(3):
        for sign in (1, -1):
            nb = np.roll(pad, -sign, axis=axis)
            cells = np.argwhere(pad & ~nb) - 1
            for c in cells:
                x, y, z = int(c[0]), int(c[1]), int(c[2])
                o = [x, y, z]; o[axis] += 1 if sign == 1 else 0
                a1, a2 = (axis + 1) % 3, (axis + 2) % 3
                quad = []
                for d1, d2 in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    p = list(o); p[a1] += d1; p[a2] += d2
                    quad.append(vid(tuple(p)))
                faces.append(quad if sign == 1 else quad[::-1])
    return np.array(verts, dtype=np.float64), faces


def build_figure360(hero, name, col, height=1.92, fade=0.03):
    d = os.path.join(RIG, 'assets', 'fig360', hero + '_solid')
    meta = json.load(open(os.path.join(d, 'meta.json')))
    T, G = meta['tile'], meta['grid']
    dens = np.load(os.path.join(d, 'dens.npy')).astype(np.float32)
    verts, faces = _surface(dens)
    s = height / meta['px_height']
    px = verts / G * T - T / 2.0                      # voxel corners -> tile pixels, origin at the tile centre
    floor = -(T / 2.0 - 12)                           # the feet line
    co = np.stack([px[:, 0] * s, px[:, 1] * s, (px[:, 2] - floor) * s], 1)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in co], [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    # the texture is projected from REST positions, so the smoothing below does not smear it
    rest = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
    rest.data.foreach_set('vector', co.astype(np.float32).ravel())
    sm = ob.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.9; sm.iterations = 24
    m = bpy.data.materials.new(name + '_mat'); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    pos = N.new('ShaderNodeAttribute'); pos.attribute_name = 'rest'
    cam = N.new('ShaderNodeCombineXYZ'); cam.name = 'CamPos'
    xf = N.new('ShaderNodeVectorTransform'); xf.vector_type = 'POINT'; xf.convert_from = 'WORLD'; xf.convert_to = 'OBJECT'
    L.new(cam.outputs[0], xf.inputs[0])
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(xf.outputs[0], sep.inputs[0])
    negy = N.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1; L.new(sep.outputs['Y'], negy.inputs[0])
    az = N.new('ShaderNodeMath'); az.operation = 'ARCTAN2'
    L.new(sep.outputs['X'], az.inputs[0]); L.new(negy.outputs[0], az.inputs[1])
    psep = N.new('ShaderNodeSeparateXYZ'); L.new(pos.outputs['Vector'], psep.inputs[0])
    k = 1.0 / (T * s)
    v0 = 0.5 + floor / T
    acc = None
    for i in range(VIEWS):
        a = i * STEP
        dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = (math.cos(a), math.sin(a), 0)
        L.new(pos.outputs['Vector'], dot.inputs[0])
        u = N.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = k; u.inputs[2].default_value = 0.5
        L.new(dot.outputs['Value'], u.inputs[0])
        v = N.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = k; v.inputs[2].default_value = v0
        L.new(psep.outputs['Z'], v.inputs[0])
        uv = N.new('ShaderNodeCombineXYZ'); L.new(u.outputs[0], uv.inputs[0]); L.new(v.outputs[0], uv.inputs[1])
        tex = N.new('ShaderNodeTexImage'); tex.extension = 'EXTEND'
        tex.image = bpy.data.images.load(os.path.join(d, 'v%02d.png' % i)); tex.image.colorspace_settings.name = 'sRGB'
        L.new(uv.outputs[0], tex.inputs[0])
        dd = N.new('ShaderNodeMath'); dd.operation = 'SUBTRACT'; dd.inputs[1].default_value = a; L.new(az.outputs[0], dd.inputs[0])
        wr = N.new('ShaderNodeMath'); wr.operation = 'WRAP'; wr.inputs[1].default_value = -math.pi; wr.inputs[2].default_value = math.pi
        L.new(dd.outputs[0], wr.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(wr.outputs[0], ab.inputs[0])
        w = N.new('ShaderNodeMapRange'); w.clamp = True; w.interpolation_type = 'SMOOTHSTEP'
        w.inputs['From Min'].default_value = STEP * (0.5 + fade); w.inputs['From Max'].default_value = STEP * (0.5 - fade)
        L.new(ab.outputs[0], w.inputs[0])
        mul = N.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'
        L.new(tex.outputs['Color'], mul.inputs[0]); L.new(w.outputs[0], mul.inputs['Scale'])
        ma = N.new('ShaderNodeMath'); ma.operation = 'MULTIPLY'; L.new(tex.outputs['Alpha'], ma.inputs[0]); L.new(w.outputs[0], ma.inputs[1])
        if acc is None:
            acc, acc_a = mul, ma
        else:
            add = N.new('ShaderNodeVectorMath'); add.operation = 'ADD'
            L.new(acc.outputs[0], add.inputs[0]); L.new(mul.outputs[0], add.inputs[1]); acc = add
            aa = N.new('ShaderNodeMath'); aa.operation = 'ADD'; L.new(acc_a.outputs[0], aa.inputs[0]); L.new(ma.outputs[0], aa.inputs[1]); acc_a = aa
    em = N.new('ShaderNodeEmission'); em.name = 'Glow'
    L.new(acc.outputs[0], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
    # each drawing's own outline trims the shape: outside the art, the surface is see-through
    tr = N.new('ShaderNodeBsdfTransparent')
    ramp = N.new('ShaderNodeMapRange'); ramp.clamp = True
    ramp.inputs['From Min'].default_value = 0.7; ramp.inputs['From Max'].default_value = 0.9   # cut a hair inside the outline: no fringe
    L.new(acc_a.outputs[0], ramp.inputs[0])
    mix = N.new('ShaderNodeMixShader'); L.new(ramp.outputs[0], mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    me.materials.append(m)
    ob.visible_shadow = True
    return ob


# ---- the reference turnaround shown as it is ---------------------------------------------------------
# The sheet's 24 body views, in an even 15-degree turntable. 270 and 285 use the sheet's cleanest left
# profiles and 300-345 the mirrored 60-15 views, because the sheet's own last views are not evenly spaced.
CARD_ORDER = [(i, False) for i in range(18)] + [(19, False), (21, False), (4, True), (3, True), (2, True), (1, True)]


def build_figure_card(hero, name, col, height=1.92, at=(0, 0, 0), fade=0.12):
    """A camera-facing card that shows the reference view for the camera's bearing: each view holds for
    most of its 15 degrees, with a quick crossfade to the next. Feet on z = 0 at `at`, facing -Y."""
    d = os.path.join(RIG, 'assets', 'fig360', hero)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    T = meta['tile']
    s = height / meta['px_height']
    w = T * s
    z0 = -12 * s
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, 0, z0), (w / 2, 0, z0), (w / 2, 0, z0 + w), (-w / 2, 0, z0 + w)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name='UVMap')
    for li, co in zip(range(4), ((0, 0), (1, 0), (1, 1), (0, 1))):
        uvl.data[li].uv = co
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    ob.location = at
    ob.visible_shadow = False
    m = bpy.data.materials.new(name + '_mat'); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    cam = N.new('ShaderNodeCombineXYZ'); cam.name = 'CamPos'
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(cam.outputs[0], sep.inputs[0])
    dx = N.new('ShaderNodeMath'); dx.operation = 'SUBTRACT'; dx.inputs[1].default_value = at[0]; L.new(sep.outputs['X'], dx.inputs[0])
    dy = N.new('ShaderNodeMath'); dy.operation = 'SUBTRACT'; dy.inputs[0].default_value = at[1]; L.new(sep.outputs['Y'], dy.inputs[1])
    az = N.new('ShaderNodeMath'); az.operation = 'ARCTAN2'; L.new(dx.outputs[0], az.inputs[0]); L.new(dy.outputs[0], az.inputs[1])
    uvn = N.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    flip = N.new('ShaderNodeMapping'); flip.inputs['Scale'].default_value = (-1, 1, 1); flip.inputs['Location'].default_value = (1, 0, 0)
    L.new(uvn.outputs[0], flip.inputs[0])
    acc_c = acc_a = None
    for k, (vi, mirror) in enumerate(CARD_ORDER):
        a = k * STEP
        tex = N.new('ShaderNodeTexImage'); tex.extension = 'CLIP'
        tex.image = bpy.data.images.load(os.path.join(d, 'v%02d.png' % vi), check_existing=True); tex.image.colorspace_settings.name = 'sRGB'
        L.new((flip if mirror else uvn).outputs[0], tex.inputs[0])
        dd = N.new('ShaderNodeMath'); dd.operation = 'SUBTRACT'; dd.inputs[1].default_value = a; L.new(az.outputs[0], dd.inputs[0])
        wr = N.new('ShaderNodeMath'); wr.operation = 'WRAP'; wr.inputs[1].default_value = -math.pi; wr.inputs[2].default_value = math.pi
        L.new(dd.outputs[0], wr.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(wr.outputs[0], ab.inputs[0])
        wgt = N.new('ShaderNodeMapRange'); wgt.clamp = True; wgt.interpolation_type = 'SMOOTHSTEP'
        wgt.inputs['From Min'].default_value = STEP * (0.5 + fade); wgt.inputs['From Max'].default_value = STEP * (0.5 - fade)
        L.new(ab.outputs[0], wgt.inputs[0])
        mc = N.new('ShaderNodeVectorMath'); mc.operation = 'SCALE'
        L.new(tex.outputs['Color'], mc.inputs[0]); L.new(wgt.outputs[0], mc.inputs['Scale'])
        ma = N.new('ShaderNodeMath'); ma.operation = 'MULTIPLY'; L.new(tex.outputs['Alpha'], ma.inputs[0]); L.new(wgt.outputs[0], ma.inputs[1])
        if acc_c is None:
            acc_c, acc_a = mc, ma
        else:
            ac = N.new('ShaderNodeVectorMath'); ac.operation = 'ADD'; L.new(acc_c.outputs[0], ac.inputs[0]); L.new(mc.outputs[0], ac.inputs[1]); acc_c = ac
            aa = N.new('ShaderNodeMath'); aa.operation = 'ADD'; L.new(acc_a.outputs[0], aa.inputs[0]); L.new(ma.outputs[0], aa.inputs[1]); acc_a = aa
    em = N.new('ShaderNodeEmission'); em.name = 'Glow'; em.inputs['Strength'].default_value = 1.0
    L.new(acc_c.outputs[0], em.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent')
    ramp = N.new('ShaderNodeMapRange'); ramp.clamp = True
    ramp.inputs['From Min'].default_value = 0.4; ramp.inputs['From Max'].default_value = 0.6
    L.new(acc_a.outputs[0], ramp.inputs[0])
    mix = N.new('ShaderNodeMixShader'); L.new(ramp.outputs[0], mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    me.materials.append(m)
    # a hidden stand-in so he still casts a soft shadow on the snow
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.45)
    sh = bpy.data.meshes.new(name + '_shadow'); bm.to_mesh(sh); bm.free()
    so = bpy.data.objects.new(name + '_shadow', sh); col.objects.link(so)
    so.location = (at[0], at[1], at[2] + 0.95); so.scale = (0.75, 0.6, 2.0)
    so.visible_camera = False
    for attr in ('visible_glossy', 'visible_diffuse', 'visible_volume_scatter', 'visible_transmission'):
        if hasattr(so, attr):
            setattr(so, attr, False)
    return ob


def face_camera(card, cam):
    tr = card.constraints.new('TRACK_TO'); tr.target = cam; tr.track_axis = 'TRACK_NEGATIVE_Y'; tr.up_axis = 'UP_Z'
