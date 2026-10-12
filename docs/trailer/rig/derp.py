"""The derp archers: thin 3D stickmen with lumpy, smooth heads and a scrawled face that is painted
frame by frame (tools/derp_faces.py) and wrapped onto the head. Same skeleton and controls as
body_v2, so the pose library drives them. Black ink outline on the head, like the drawings."""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

import body_v2 as B
from common import BUILD, hexc, new_collection, principled

INK = '#0B0B0D'
HEAD_R = 0.36
# a stick figure's joints: body_v2's skeleton with narrow shoulders and hips
JS = {k: ((v[0] * (0.45 if 'Arm' in k or 'Hand' in k else 0.5), v[1], v[2]) if k not in ('Root', 'Spine', 'Head') else v) for k, v in B.J.items()}
for _s, _sx in (('Left', 1), ('Right', -1)):
    _sh = Vector((_sx * 0.13, 0, 0.865)); _d = Vector((_sx * math.sin(B.DROP), 0, -math.cos(B.DROP)))
    JS[_s + 'Arm'] = tuple(_sh); JS[_s + 'ForeArm'] = tuple(_sh + _d * B.UPPER + Vector((0, 0.02, 0))); JS[_s + 'Hand'] = tuple(_sh + _d * (B.UPPER + B.FORE))
# lumps: (direction x, y, z), size, push
SHAPES = {
    'bean': dict(scale=(1.32, 0.92, 0.86), bumps=[((0.9, -0.1, 0.75), 0.55, 0.42), ((-0.85, 0.0, 0.55), 0.5, 0.2), ((0.05, -0.2, 0.95), 0.5, -0.2), ((0.3, 0.2, -0.9), 0.7, -0.08)]),
    'pea': dict(scale=(0.62, 0.6, 0.66), bumps=[((0.3, 0, 0.9), 0.6, 0.08)]),
    'slab': dict(scale=(1.3, 0.9, 0.78), bumps=[((-0.8, 0, 0.7), 0.6, 0.22), ((0.9, 0, 0.3), 0.6, 0.18), ((0, 0, -1), 0.9, -0.1)]),
    'egg': dict(scale=(0.86, 0.86, 1.18), bumps=[((0.2, 0, 1.0), 0.7, 0.22), ((-0.6, 0, -0.6), 0.6, 0.1)]),
}


def make_armature(name, col):
    arm_data = bpy.data.armatures.new(name + '_rig')
    arm = bpy.data.objects.new(name, arm_data); col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    kids = {b: [c for c in B.ORDER if B.PARENT.get(c) == b] for b in B.ORDER}
    for b in B.ORDER:
        e = arm_data.edit_bones.new(b)
        e.head = Vector(JS[b])
        if b == 'Root':
            e.tail = e.head + Vector((0, 0, 0.04))
        elif b == 'Spine':
            e.tail = Vector(JS['Head'])
        elif b == 'Head':
            e.tail = e.head + Vector((0, 0, 0.4))
        elif kids[b]:
            e.tail = Vector(JS[kids[b][0]])
        else:
            e.tail = e.head + (e.head - Vector(JS[B.PARENT[b]])).normalized() * 0.1
        eb[b] = e
    for b in B.ORDER:
        if b in B.PARENT:
            eb[b].parent = eb[B.PARENT[b]]
    bpy.ops.object.mode_set(mode='OBJECT')
    arm['pose_z'] = B.POSE_Z
    return arm


def head_mesh(name, kind, col):
    sh = SHAPES[kind]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        r = 1.0
        for (bx, by, bz), size, push in sh['bumps']:
            bd = Vector((bx, by, bz)).normalized()
            r += push * math.exp(-((d - bd).length / size) ** 2)
        v.co = Vector((d.x * sh['scale'][0], d.y * sh['scale'][1], d.z * sh['scale'][2])) * r * HEAD_R
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob


def face_material(name, seq_dir, frames):
    """Paper-white skin with the painted face sequence on the front of the head."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    bsdf = N['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.55
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])
    k = 1.0 / (2.0 * HEAD_R)
    u = N.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = k; u.inputs[2].default_value = 0.5; L.new(sep.outputs['X'], u.inputs[0])
    v = N.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = k; v.inputs[2].default_value = 0.5; L.new(sep.outputs['Z'], v.inputs[0])
    uv = N.new('ShaderNodeCombineXYZ'); L.new(u.outputs[0], uv.inputs[0]); L.new(v.outputs[0], uv.inputs[1])
    tex = N.new('ShaderNodeTexImage'); tex.extension = 'EXTEND'
    first = os.path.join(seq_dir, 'f_0001.png')
    img = bpy.data.images.load(first)
    img.source = 'SEQUENCE'; img.colorspace_settings.name = 'sRGB'
    tex.image = img
    tex.image_user.frame_duration = frames; tex.image_user.frame_start = 1; tex.image_user.frame_offset = 0
    tex.image_user.use_auto_refresh = True; tex.image_user.use_cyclic = False
    L.new(uv.outputs[0], tex.inputs[0])
    # only the front half carries the face; the back of the head is plain
    front = N.new('ShaderNodeMapRange'); front.clamp = True
    front.inputs['From Min'].default_value = 0.02; front.inputs['From Max'].default_value = -0.06
    L.new(sep.outputs['Y'], front.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = hexc('#F6F4EE')
    L.new(tex.outputs['Color'], mix.inputs['B']); L.new(front.outputs[0], mix.inputs['Factor'])
    L.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    L.new(mix.outputs['Result'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 0.22
    return m


def build(name, kind='bean', shot=90, char='a', frames=30, col=None, limb=0.03):
    """A derp archer at the origin, facing -Y. Returns the usual hero dict (arm, head, bow, nocked...)."""
    from props import ARROW_LEN, build_arrow, build_bow
    col = col or new_collection('derps')
    arm = make_armature(name, col)
    ink = principled('derp_ink', hexc(INK), rough=0.5, spec=0.4)
    parts = []
    J = {k: Vector(v) for k, v in JS.items()}
    parts.append((B.capsule(name + '_spine', J['Root'] - Vector((0, 0, 0.02)), J['Head'] + Vector((0, 0, 0.1)), limb * 1.15, limb * 1.05, ink, col), 'Spine'))
    for side in ('Left', 'Right'):
        sx = 1 if side == 'Left' else -1
        S_, E_, W_ = J[side + 'Arm'], J[side + 'ForeArm'] - Vector((0, 0.02, 0)), J[side + 'Hand']
        parts.append((B.capsule('%s_ua_%s' % (name, side), Vector((0, 0, S_.z)), S_, limb, limb, ink, col), 'Spine'))     # shoulder bar
        parts.append((B.capsule('%s_upper_%s' % (name, side), S_, E_, limb, limb, ink, col), side + 'Arm'))
        parts.append((B.capsule('%s_fore_%s' % (name, side), E_, W_, limb, limb, ink, col), side + 'ForeArm'))
        d = (W_ - E_).normalized()
        parts.append((B.capsule('%s_hand_%s' % (name, side), W_ + d * 0.03, W_ + d * 0.05, 0.052, 0.052, ink, col), side + 'Hand'))
        H_, K_, F_ = J[side + 'UpLeg'], J[side + 'Leg'] + Vector((0, 0.02, 0)), J[side + 'Foot']
        parts.append((B.capsule('%s_hipbar_%s' % (name, side), J['Root'], H_, limb, limb, ink, col), 'Root'))
        parts.append((B.capsule('%s_thigh_%s' % (name, side), H_, K_, limb, limb, ink, col), side + 'UpLeg'))
        parts.append((B.capsule('%s_shin_%s' % (name, side), K_, F_ + Vector((0, 0, 0.035)), limb, limb, ink, col), side + 'Leg'))
        parts.append((B.capsule('%s_foot_%s' % (name, side), F_ + Vector((0, 0.01, 0.035)), F_ + Vector((0, -0.13, 0.035)), limb * 1.1, limb * 1.1, ink, col), side + 'Foot'))
    bpy.context.view_layer.update()
    for ob, bone in parts:
        ob.parent = arm; ob.parent_type = 'BONE'; ob.parent_bone = bone
        b = arm.data.bones[bone]
        ob.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
    # head: rides the Head bone, upright (Z up, face toward -Y)
    mount = bpy.data.objects.new(name + '_head', None); col.objects.link(mount)
    mount.parent = arm; mount.parent_type = 'BONE'; mount.parent_bone = 'Head'
    mount.location = (0, -arm.data.bones['Head'].length, 0); mount.rotation_euler = (math.radians(-90), 0, 0)
    hd = head_mesh(name + '_skull', kind, col)
    hd.parent = mount
    sz = SHAPES[kind]['scale'][2] * HEAD_R
    hd.location = (0, 0, 0.1 + sz * 0.92)
    seq = os.path.join(BUILD, 'faces', 's%02d_%s' % (shot, char))
    hd.data.materials.append(face_material(name + '_face', seq, frames))
    # ink outline: a slightly larger shell seen only from inside-out
    ol = bpy.data.materials.new(name + '_outline'); ol.use_nodes = True
    nt = ol.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hexc(INK); em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs[0])
    ol.use_backface_culling = True
    hd.data.materials.append(ol)
    so = hd.modifiers.new('outline', 'SOLIDIFY')
    so.thickness = 0.022; so.offset = 1.0; so.use_flip_normals = True; so.material_offset = 1; so.use_rim = False
    bow = build_bow(name + '_bow', col)
    nk = build_arrow(name + '_nocked', col)
    nk.parent = bpy.data.objects[bow['nock']]; nk.location = (ARROW_LEN, 0, 0); nk.scale = (0, 0, 0)
    return {'arm': arm, 'suit': None, 'head': mount, 'skull': hd, 'bow': bow, 'quiver': None, 'hero': name, 'nocked': nk, 'kind': kind}


def ready(h):
    """Controls on, bow in the real palm."""
    import actions as A
    A.GRIP_X = 0.70
    A.setup_controls(h); B.finish_controls(h)
    A.apply(h, A.P_idle(), 0.0)
    return h


def spawn(name, kind, shot, char, seconds, loc=(0, 0, 0), yaw=0.0):
    h = ready(build(name, kind, shot=shot, char=char, frames=max(1, int(round(seconds * 30)))))
    h['arm'].location = loc
    h['arm'].rotation_euler = (0, 0, math.radians(yaw))
    return h


def thumb(h, side='Right'):
    """A thumb for the thumbs-up: a small capsule on the fist, hidden until keyed (scale)."""
    arm = h['arm']
    ink = principled('derp_ink', hexc(INK))
    W_ = Vector(JS[side + 'Hand']); E_ = Vector(JS[side + 'ForeArm'])
    d = (W_ - E_).normalized()
    t = B.capsule(arm.name + '_thumb', W_ + d * 0.04, W_ + d * 0.04 + Vector((0, 0, 0.13)), 0.026, 0.026, ink, arm.users_collection[0])
    bpy.context.view_layer.update()
    b = arm.data.bones[side + 'Hand']
    t.parent = arm; t.parent_type = 'BONE'; t.parent_bone = side + 'Hand'
    t.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
    return t


def park(h, t0, t1):
    """The character exists only between t0 and t1 (for cuts inside one shot)."""
    from common import fcurves, frame
    ob = h['arm']
    p = bpy.data.objects.new(ob.name + '_park', None); bpy.context.scene.collection.objects.link(p)
    ob.parent = p
    for t, z in ((0.0, 0.0 if t0 <= 0 else -90.0), (t0, 0.0), (t1, -90.0)):
        p.location = (0, 0, z); p.keyframe_insert('location', frame=frame(t))
    for fc in fcurves(p.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'
    return p
