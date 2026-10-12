"""A clean, smooth chibi body modelled to the character sheet's body turnaround: a vinyl-figure
build of rounded parts (torso, capsule limbs, fist gloves, chunky boots, crossed leather straps,
belt, quiver), each riding one bone of a true chibi skeleton. Same bone names and control rig
as the game suit (actions.py drives it); nothing is squashed.

Space: feet on z = 0, facing -Y, his left = +X. About 1.0 m from the ground to the chin."""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from common import hexc, new_collection, principled

POSE_Z = 0.64          # the pose library is written for the tall game body; heights scale by this
J = {  # rest joints
    'Root': (0, 0, 0.55), 'Spine': (0, 0, 0.59), 'Head': (0, 0, 0.965),
}
DROP = 0.25            # arms hang slightly out (A-pose)
UPPER, FORE = 0.225, 0.215
THIGH, SHIN = 0.275, 0.25
for side, sx in (('Left', 1), ('Right', -1)):
    sh = Vector((sx * 0.3, 0, 0.865)); d = Vector((sx * math.sin(DROP), 0, -math.cos(DROP)))
    J[side + 'Arm'] = tuple(sh); J[side + 'ForeArm'] = tuple(sh + d * UPPER + Vector((0, 0.02, 0))); J[side + 'Hand'] = tuple(sh + d * (UPPER + FORE))
    J[side + 'UpLeg'] = (sx * 0.135, 0, 0.525); J[side + 'Leg'] = (sx * 0.135, -0.02, 0.525 - THIGH); J[side + 'Foot'] = (sx * 0.135, 0, 0.0)
PARENT = {'Spine': 'Root', 'Head': 'Spine', 'LeftArm': 'Spine', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm', 'RightArm': 'Spine',
          'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm', 'LeftUpLeg': 'Root', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg',
          'RightUpLeg': 'Root', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg'}
ORDER = ['Root', 'Spine', 'Head', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg',
         'LeftFoot', 'LeftArm', 'LeftForeArm', 'LeftHand']


def _mesh(name, bm, mat, col, subsurf=0):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if subsurf:
        m = ob.modifiers.new('smooth', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    return ob


def capsule(name, p0, p1, r0, r1, mat, col, flat=1.0, segs=28):
    """A rounded limb from p0 to p1 with radii r0, r1 (`flat` squeezes it front-to-back)."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0; L = axis.length
    bm = bmesh.new()
    rings = 10
    prof = []                                    # (distance along, radius)
    for i in range(rings + 1):
        a = math.pi / 2 * i / rings
        prof.append((-r0 * math.cos(a), r0 * math.sin(a)))
    for i in range(1, 8):
        k = i / 8
        prof.append((L * k, r0 + (r1 - r0) * k))
    for i in range(rings + 1):
        a = math.pi / 2 * i / rings
        prof.append((L + r1 * math.sin(a), r1 * math.cos(a)))
    rot = axis.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    loops = []
    for z, r in prof:
        loop = [bm.verts.new(p0 + (rot @ Vector((math.cos(t) * r, math.sin(t) * r * flat, z)))) for t in [math.tau * j / segs for j in range(segs)]]
        loops.append(loop)
    for a, b in zip(loops, loops[1:]):
        for j in range(segs):
            bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    bm.faces.new(loops[0][::-1]); bm.faces.new(loops[-1])
    return _mesh(name, bm, mat, col)


def blob(name, centre, size, mat, col, rot=None, subsurf=2, bevel=None):
    """A rounded box (subdivided cube): gloves, boots, pelvis."""
    bm = bmesh.new()
    m = Matrix.Translation(Vector(centre))
    if rot:
        m = m @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    m = m @ Matrix.Diagonal((size[0], size[1], size[2], 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return _mesh(name, bm, mat, col, subsurf=subsurf)


def ring(name, centre, rx, ry, minor, mat, col, rot=(0, 0, 0), flat=0.6, segs=64):
    """An elliptical band (strap, belt, collar, cuff)."""
    bm = bmesh.new()
    m = Matrix.Translation(Vector(centre)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    msegs = 10
    loops = []
    for i in range(segs):
        a = math.tau * i / segs
        c = Vector((math.cos(a) * rx, math.sin(a) * ry, 0))
        n = Vector((math.cos(a) * ry, math.sin(a) * rx, 0)).normalized()     # outward normal of the ellipse
        loops.append([bm.verts.new(m @ (c + n * (math.cos(b) * minor * flat) + Vector((0, 0, math.sin(b) * minor)))) for b in [math.tau * j / msegs for j in range(msegs)]])
    for i in range(segs):
        a, b = loops[i], loops[(i + 1) % segs]
        for j in range(msegs):
            bm.faces.new((a[j], b[j], b[(j + 1) % msegs], a[(j + 1) % msegs]))
    return _mesh(name, bm, mat, col)


def lathe(name, profile, mat, col, sy=1.0, segs=40):
    """A body of revolution about Z from (radius, z) pairs, squeezed front-to-back by sy: the torso."""
    bm = bmesh.new()
    loops = [[bm.verts.new((math.cos(t) * r, math.sin(t) * r * sy, z)) for t in [math.tau * j / segs for j in range(segs)]] for r, z in profile]
    for a, b in zip(loops, loops[1:]):
        for j in range(segs):
            bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    bm.faces.new(loops[0][::-1]); bm.faces.new(loops[-1])
    return _mesh(name, bm, mat, col, subsurf=1)


def build(hero='tolly', name=None, col=None, quiver=True):
    """Armature + body parts + bow + quiver. Returns the same dict the game-suit builder does."""
    from props import ARROW_LEN, build_arrow, build_bow, build_quiver
    col = col or new_collection('heroes')
    name = name or hero
    arm_data = bpy.data.armatures.new(name + '_rig')
    arm = bpy.data.objects.new(name, arm_data); col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    kids = {b: [c for c in ORDER if PARENT.get(c) == b] for b in ORDER}
    for b in ORDER:
        e = arm_data.edit_bones.new(b)
        e.head = Vector(J[b])
        if b == 'Root':
            e.tail = e.head + Vector((0, 0, 0.04))
        elif b == 'Spine':
            e.tail = Vector(J['Head'])
        elif b == 'Head':
            e.tail = e.head + Vector((0, 0, 0.4))
        elif kids[b]:
            e.tail = Vector(J[kids[b][0]])
        else:
            par = Vector(J[PARENT[b]])
            e.tail = e.head + (e.head - par).normalized() * 0.1
        eb[b] = e
    for b in ORDER:
        if b in PARENT:
            eb[b].parent = eb[PARENT[b]]
    bpy.ops.object.mode_set(mode='OBJECT')
    arm['pose_z'] = POSE_Z
    arm['hero'] = hero

    suit = principled('v2_suit', hexc('#111113'), rough=0.42, spec=0.5)
    suit_d = principled('v2_suit_dark', hexc('#0A0A0B'), rough=0.3, spec=0.6)        # gloves and boots: a little glossier
    sole = principled('v2_sole', hexc('#1C1C1F'), rough=0.7)
    leather = principled('v2_leather', hexc('#6E3E22'), rough=0.55, spec=0.4)
    leather_d = principled('v2_leather_dark', hexc('#4A2815'), rough=0.6)
    metal = principled('v2_buckle', hexc('#B8A070'), rough=0.3, metal=0.9)
    parts = []

    def add(ob, bone):
        parts.append((ob, bone)); return ob

    # torso: a lathed barrel, a touch wider at the chest, squeezed front-to-back
    add(lathe(name + '_torso', [(0.0, 0.47), (0.14, 0.475), (0.215, 0.52), (0.235, 0.62), (0.24, 0.72), (0.25, 0.80), (0.235, 0.87), (0.17, 0.93), (0.095, 0.958), (0.075, 0.99), (0.0, 0.995)],
              suit, col, sy=0.74), 'Spine')
    add(blob(name + '_pelvis', (0, 0, 0.5), (0.44, 0.31, 0.24), suit, col), 'Root')
    add(ring(name + '_collar', (0, 0, 0.955), 0.088, 0.078, 0.022, suit_d, col, flat=0.8), 'Spine')
    add(ring(name + '_belt', (0, 0, 0.60), 0.236, 0.176, 0.026, leather_d, col, flat=0.4), 'Spine')
    add(blob(name + '_buckle', (0, -0.182, 0.60), (0.06, 0.02, 0.055), metal, col, subsurf=1), 'Spine')
    # the crossed straps: two sashes, shoulder to opposite hip, hugging the torso
    for i, tilt in enumerate((0.72, -0.72)):
        add(ring('%s_strap%d' % (name, i), (0, 0, 0.745), 0.305, 0.188, 0.022, leather, col, rot=(0, tilt, 0), flat=0.35), 'Spine')
    for side, sx in (('Left', 1), ('Right', -1)):
        S_, E_, W_ = Vector(J[side + 'Arm']), Vector(J[side + 'ForeArm']), Vector(J[side + 'Hand'])
        E0 = E_ - Vector((0, 0.02, 0))
        add(capsule('%s_sh_%s' % (name, side), S_ + Vector((-sx * 0.02, 0, 0.0)), S_ + (E0 - S_) * 0.15, 0.1, 0.097, suit, col), side + 'Arm')
        add(capsule('%s_upper_%s' % (name, side), S_, E0, 0.096, 0.088, suit, col), side + 'Arm')
        add(capsule('%s_fore_%s' % (name, side), E0, W_, 0.088, 0.082, suit, col), side + 'ForeArm')
        d = (W_ - E0).normalized()
        add(ring('%s_cuff_%s' % (name, side), W_ - d * 0.02, 0.088, 0.088, 0.014, suit_d, col, rot=tuple(d.to_track_quat('Z', 'Y').to_euler()), flat=0.7), side + 'ForeArm')
        fist = W_ + d * 0.08
        add(blob('%s_glove_%s' % (name, side), fist, (0.215, 0.235, 0.225), suit_d, col, rot=tuple(d.to_track_quat('Z', 'Y').to_euler())), side + 'Hand')
        add(blob('%s_thumb_%s' % (name, side), fist + Vector((-sx * 0.0, -0.095, 0.02)), (0.09, 0.09, 0.12), suit_d, col), side + 'Hand')
        H_, K_, F_ = Vector(J[side + 'UpLeg']), Vector(J[side + 'Leg']), Vector(J[side + 'Foot'])
        K0 = K_ + Vector((0, 0.02, 0))
        add(capsule('%s_thigh_%s' % (name, side), H_, K0, 0.128, 0.118, suit, col), side + 'UpLeg')
        add(capsule('%s_shin_%s' % (name, side), K0, F_ + Vector((0, 0, 0.1)), 0.116, 0.112, suit, col), side + 'Leg')
        # boot: ankle cuff, rounded upper, a slightly wider sole, a strap
        add(blob('%s_boot_%s' % (name, side), F_ + Vector((0, -0.07, 0.115)), (0.33, 0.48, 0.27), suit_d, col), side + 'Foot')
        add(blob('%s_sole_%s' % (name, side), F_ + Vector((0, -0.07, 0.028)), (0.3, 0.44, 0.07), sole, col, subsurf=1), side + 'Foot')
        add(ring('%s_bootcuff_%s' % (name, side), F_ + Vector((0, 0, 0.175)), 0.118, 0.118, 0.016, suit_d, col, flat=0.7), side + 'Leg')
        add(ring('%s_bootstrap_%s' % (name, side), F_ + Vector((0, -0.075, 0.125)), 0.142, 0.165, 0.014, leather_d, col, rot=(math.radians(62), 0, 0), flat=0.45), side + 'Foot')
    bpy.context.view_layer.update()
    for ob, bone in parts:
        ob.parent = arm; ob.parent_type = 'BONE'; ob.parent_bone = bone
        b = arm.data.bones[bone]
        ob.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
    # quiver on the back, slung on the strap
    q = None
    if quiver:
        q = build_quiver(name + '_quiver', col)
        q.scale = (0.78, 0.78, 0.78)
        q.location = (-0.05, 0.235, 0.74); q.rotation_euler = (math.radians(6), math.radians(24), 0)
        bpy.context.view_layer.update()
        b = arm.data.bones['Spine']
        q.parent = arm; q.parent_type = 'BONE'; q.parent_bone = 'Spine'
        q.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
    bow = build_bow(name + '_bow', col)
    nk = build_arrow(name + '_nocked', col)
    nk.parent = bpy.data.objects[bow['nock']]; nk.location = (ARROW_LEN, 0, 0); nk.scale = (0, 0, 0)
    # the head rides the Head bone on an upright empty (Z up, -Y forward)
    head = bpy.data.objects.new(name + '_head', None); col.objects.link(head)
    head.parent = arm; head.parent_type = 'BONE'; head.parent_bone = 'Head'
    head.location = (0, -arm.data.bones['Head'].length, 0); head.rotation_euler = (math.radians(-90), 0, 0)
    return {'arm': arm, 'suit': None, 'head': head, 'bow': bow, 'quiver': q, 'hero': hero, 'nocked': nk}


def finish_controls(h):
    """After actions.setup_controls: the bow sits in the real palm (the arm may not reach a
    far target), turned by the hand control."""
    arm = h['arm']
    mount = bpy.data.objects[arm.name + '_bow_mount']
    cl = mount.constraints[0]
    cl.target = arm; cl.subtarget = 'LeftHand'; cl.head_tail = 0.7
