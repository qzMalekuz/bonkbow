"""A real 3D head from a 360-degree turnaround (rig/turn360/build_head360.py): the carved mesh,
textured by blending the two sheet views nearest the camera's bearing, so it turns smoothly.
Head space: face toward -Y, +Z up, origin at the neck."""
import json
import math
import os

import bpy

from common import RIG

VIEWS = 24
STEP = 2 * math.pi / VIEWS


def build_head360(hero, name, col, height=1.05):
    """Returns the head object (origin at the neck). `height` = hair top to chin in metres."""
    d = os.path.join(RIG, 'assets', 'head360', hero)
    meta = json.load(open(os.path.join(d, 'head.json')))
    T = meta['tile']
    # the sheet's head (hair top to chin) is ~0.84 of the cut-out's height; the rest is neck
    px = (meta['z_hi'] - meta['z_lo']) * 0.86
    s = height / px
    z_neck = meta['z_lo'] + (meta['z_hi'] - meta['z_lo']) * 0.10
    verts = [(v[0] * s, v[1] * s, (v[2] - z_neck) * s) for v in meta['verts']]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [tuple(f) for f in meta['faces']])
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    m = bpy.data.materials.new(name + '_mat'); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    geo = N.new('ShaderNodeTexCoord')                        # Object = position in head space
    cam = N.new('ShaderNodeCombineXYZ'); cam.name = 'CamPos' # camera world position (driven)
    xf = N.new('ShaderNodeVectorTransform'); xf.vector_type = 'POINT'; xf.convert_from = 'WORLD'; xf.convert_to = 'OBJECT'
    L.new(cam.outputs[0], xf.inputs[0])
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(xf.outputs[0], sep.inputs[0])
    negy = N.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1; L.new(sep.outputs['Y'], negy.inputs[0])
    az = N.new('ShaderNodeMath'); az.operation = 'ARCTAN2'      # bearing: 0 = in front, + = toward +X
    L.new(sep.outputs['X'], az.inputs[0]); L.new(negy.outputs[0], az.inputs[1])
    psep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Object'], psep.inputs[0])
    acc = None
    k = 1.0 / (T * s)                                         # metres -> texture units
    for i in range(VIEWS):
        a = i * STEP
        # u = (x cos a + y sin a) / T + 0.5 + dx ;  v = 0.5 + z / T   (z measured from the tile centre)
        dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        dot.inputs[1].default_value = (math.cos(a), math.sin(a), 0)
        L.new(geo.outputs['Object'], dot.inputs[0])
        u = N.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = k
        u.inputs[2].default_value = 0.5 + meta['dx'][i] / T
        L.new(dot.outputs['Value'], u.inputs[0])
        v = N.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = k
        v.inputs[2].default_value = 0.5 + z_neck / T
        L.new(psep.outputs['Z'], v.inputs[0])
        uv = N.new('ShaderNodeCombineXYZ'); L.new(u.outputs[0], uv.inputs[0]); L.new(v.outputs[0], uv.inputs[1])
        tex = N.new('ShaderNodeTexImage'); tex.extension = 'EXTEND'
        tex.image = bpy.data.images.load(os.path.join(d, 'v%02d.png' % i)); tex.image.colorspace_settings.name = 'sRGB'
        L.new(uv.outputs[0], tex.inputs[0])
        # weight: 1 at this view's bearing, falling to 0 at its neighbours (a hat 15 degrees wide)
        dd = N.new('ShaderNodeMath'); dd.operation = 'SUBTRACT'; dd.inputs[1].default_value = a; L.new(az.outputs[0], dd.inputs[0])
        wr = N.new('ShaderNodeMath'); wr.operation = 'WRAP'; wr.inputs[1].default_value = -math.pi; wr.inputs[2].default_value = math.pi
        L.new(dd.outputs[0], wr.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(wr.outputs[0], ab.inputs[0])
        w = N.new('ShaderNodeMapRange'); w.clamp = True
        # hold the nearest view for most of its sector; crossfade over the middle half of the gap
        w.inputs['From Min'].default_value = STEP * 0.75; w.inputs['From Max'].default_value = STEP * 0.25
        w.interpolation_type = 'SMOOTHSTEP'
        L.new(ab.outputs[0], w.inputs[0])
        mul = N.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'
        L.new(tex.outputs['Color'], mul.inputs[0]); L.new(w.outputs[0], mul.inputs['Scale'])
        if acc is None:
            acc = mul
        else:
            add = N.new('ShaderNodeVectorMath'); add.operation = 'ADD'
            L.new(acc.outputs[0], add.inputs[0]); L.new(mul.outputs[0], add.inputs[1]); acc = add
    # the sheet art carries its own studio shading: show it as is, with a touch of scene light
    bsdf = N.new('ShaderNodeBsdfPrincipled'); bsdf.name = 'HeadBSDF'
    bsdf.inputs['Roughness'].default_value = 0.6
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.15
    L.new(acc.outputs[0], bsdf.inputs['Base Color']); L.new(acc.outputs[0], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 0.72
    L.new(bsdf.outputs[0], out.inputs[0])
    me.materials.append(m)
    ob['is_head360'] = True
    return ob


def bind_camera(cam):
    """Drive every 360 head's CamPos node from camera `cam`."""
    for m in bpy.data.materials:
        n = m.node_tree.nodes.get('CamPos') if m.node_tree else None
        if not n:
            continue
        for i, axis in enumerate('XYZ'):
            try:
                n.inputs[i].driver_remove('default_value')
            except Exception:
                pass
            d = n.inputs[i].driver_add('default_value').driver
            d.type = 'AVERAGE'
            v = d.variables.new(); v.name = 'c'; v.type = 'TRANSFORMS'
            v.targets[0].id = cam; v.targets[0].transform_type = 'LOC_' + axis; v.targets[0].transform_space = 'WORLD_SPACE'
