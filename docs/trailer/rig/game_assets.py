"""The game's own models, brought into Blender: hero heads and suits from assets/heroes/*.json
(the same files src/game3d/HeroMesh.ts decodes), the bow and arrows at the rig's dimensions
(src/game3d/Stickman3D.ts, world.ts), and the licensed environment kits (mapProps.ts)."""
import base64
import json
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

from common import ASSETS, RIG, hexc, link, mesh_object, new_collection, principled, three_to_blender

# The trailer's own snapshot of the 3D heroes (taken from the game repo's assets/heroes), so
# the film does not change when the game's hero pipeline does.
HERO_DIR = os.path.join(RIG, 'assets', 'heroes')

HEROES = ['akshay', 'beeman', 'chase', 'mit', 'mert', 'tolly']
NAMES = {'akshay': 'AKSHAY', 'beeman': 'BEEMAN', 'chase': 'CHASE', 'mit': 'M-IT', 'mert': 'MERT', 'tolly': 'TOLLY'}
TAGLINES = {
    'akshay': 'Grin first, aim later.',
    'beeman': 'Never seen his eyes. Never missed.',
    'chase': 'Hair by the wind. Shots by him.',
    'mit': 'Clean cut, clean headshots.',
    'mert': 'Full beard. Full send.',
    'tolly': 'Wide eyes. Wider grin. Never misses.',
}
# world.ts BODY and Stickman3D.ts constants
BODY = dict(thigh=0.44, shin=0.42, torso=0.58, neck=0.07, headR=0.19, upperArm=0.3, foreArm=0.29)
HIP = BODY['thigh'] + BODY['shin']
HERO_HEAD = 2.05
HEAD_R = BODY['headR'] * HERO_HEAD  # 0.3895 m skull radius
ARROW_LEN = 0.82
BOW_R, BOW_HALF = 0.55, 0.72
REST_FACE = {'akshay': 'smile', 'mit': 'smile'}
# Head mesh ids of the views that have a painted texture.
VIEW_FILES = ['right', 'back', 'left']


def b64(s):
    return np.frombuffer(base64.b64decode(s), dtype=np.uint8)


def decode_mesh(m):
    n = m['n']
    q = b64(m['pos']).view(np.uint16)[: n * 3].reshape(n, 3).astype(np.float64)
    pos = np.array(m['lo']) + q * np.array(m['scale'])
    col = b64(m['col'])[: n * 3].reshape(n, 3).astype(np.float64) / 255.0
    col = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)
    ib = b64(m['idx'])
    idx = (ib.view(np.uint32) if m['idx32'] else ib.view(np.uint16)).astype(np.int64)
    uv = None
    if m.get('uv'):
        uq = b64(m['uv']).view(np.uint16)[: n * 2].reshape(n, 2).astype(np.float64)
        uv = np.stack([uq[:, 0] / 65535 * 2, uq[:, 1] / 65535], axis=1)
    return pos, col, idx.reshape(-1, 3), uv


def build_mesh(name, pos, faces, col=None, uv=None, convert=True, vcol=None):
    verts = [three_to_blender(p) if convert else tuple(p) for p in pos]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [tuple(int(i) for i in f) for f in faces])
    me.update()
    if uv is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                layer.data[li].uv = (uv[vi][0], uv[vi][1])
    if vcol is not None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        flat = np.concatenate([vcol, np.ones((len(vcol), 1))], axis=1).astype(np.float32).ravel()
        ca.data.foreach_set('color', flat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    return ob


# ---- head ------------------------------------------------------------------------------------

def load_image(path):
    im = bpy.data.images.get(os.path.basename(path))
    if im is None:
        im = bpy.data.images.load(path)
        im.colorspace_settings.name = 'sRGB'
    return im


def head_material(hero, baked, expressions):
    """Sheet art chosen by camera azimuth, exactly like HeroHead.ts: the front (one texture per
    expression, blended by the object's `expr` weights) and the right/back/left paintings."""
    name = 'head_%s' % hero
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    # Camera position in object space (driven), azimuth round the head's up axis.
    cam = nodes.new('ShaderNodeCombineXYZ')
    cam.name = 'CamPos'
    xf = nodes.new('ShaderNodeVectorTransform')
    xf.vector_type, xf.convert_from, xf.convert_to = 'POINT', 'WORLD', 'OBJECT'
    links.new(cam.outputs[0], xf.inputs[0])
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(xf.outputs[0], sep.inputs[0])
    # Head object space: Blender X = -right(head z), Y = -forward(head x), Z = up.
    # Head azimuth az = atan2(z_head, x_head) = atan2(-X, -Y).
    negx = nodes.new('ShaderNodeMath'); negx.operation = 'MULTIPLY'; negx.inputs[1].default_value = -1
    negy = nodes.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1
    links.new(sep.outputs[0], negx.inputs[0]); links.new(sep.outputs[1], negy.inputs[0])
    az = nodes.new('ShaderNodeMath'); az.operation = 'ARCTAN2'
    links.new(negx.outputs[0], az.inputs[0]); links.new(negy.outputs[0], az.inputs[1])
    uvn = nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    views = []  # (azimuth, colour socket)
    tex_dir = HERO_DIR
    # front = expressions mixed by object props expr_<name>
    front_imgs = []
    for e in expressions:
        p = os.path.join(tex_dir, '%s_%s.jpg' % (hero, e))
        if os.path.exists(p):
            t = nodes.new('ShaderNodeTexImage'); t.image = load_image(p); t.extension = 'REPEAT'; t.name = 'expr_' + e
            links.new(uvn.outputs[0], t.inputs[0])
            front_imgs.append((e, t))
    acc = None
    wsum = None
    for e, t in front_imgs:
        w = nodes.new('ShaderNodeValue'); w.name = 'w_' + e; w.label = 'w_' + e
        w.outputs[0].default_value = 1.0 if e == REST_FACE.get(hero, 'neutral') else 0.0
        mul = nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'
        links.new(t.outputs[0], mul.inputs[0]); links.new(w.outputs[0], mul.inputs['Scale'])
        if acc is None:
            acc, wsum = mul, w
        else:
            add = nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'
            links.new(acc.outputs[0], add.inputs[0]); links.new(mul.outputs[0], add.inputs[1]); acc = add
            ws = nodes.new('ShaderNodeMath'); ws.operation = 'ADD'
            links.new(wsum.outputs[0], ws.inputs[0]); links.new(w.outputs[0], ws.inputs[1]); wsum = ws
    front = nodes.new('ShaderNodeVectorMath'); front.operation = 'DIVIDE'
    wv = nodes.new('ShaderNodeCombineXYZ')
    for i in range(3):
        links.new(wsum.outputs[0], wv.inputs[i])
    links.new(acc.outputs[0], front.inputs[0]); links.new(wv.outputs[0], front.inputs[1])
    views.append((baked['views']['front'], front.outputs[0]))
    for v in VIEW_FILES:
        p = os.path.join(tex_dir, '%s_v_%s.jpg' % (hero, v))
        if os.path.exists(p) and v in baked['views']:
            t = nodes.new('ShaderNodeTexImage'); t.image = load_image(p); t.extension = 'REPEAT'
            links.new(uvn.outputs[0], t.inputs[0])
            views.append((baked['views'][v], t.outputs[0]))
    views.sort(key=lambda x: x[0])
    # Weight each view: 1 inside its sector, crossfading over 10 degrees at the 45 degree boundaries.
    n = len(views)
    TAU = math.pi * 2
    def weight_node(i):
        a0 = views[i][0]
        a1 = views[(i + 1) % n][0]
        am = views[(i - 1) % n][0]
        span_next = (a1 - a0) % TAU or TAU
        span_prev = (a0 - am) % TAU or TAU
        # offset into this view's sector measured from the previous boundary
        d = nodes.new('ShaderNodeMath'); d.operation = 'SUBTRACT'; d.inputs[1].default_value = a0
        links.new(az.outputs[0], d.inputs[0])
        wrap = nodes.new('ShaderNodeMath'); wrap.operation = 'WRAP'; wrap.inputs[1].default_value = -math.pi; wrap.inputs[2].default_value = math.pi
        links.new(d.outputs[0], wrap.inputs[0])
        # rising edge at -span_prev/2 (fade 10deg), falling edge at +span_next/2
        fade = math.radians(10)
        up = nodes.new('ShaderNodeMapRange'); up.clamp = True
        up.inputs['From Min'].default_value = -span_prev / 2 - fade / 2; up.inputs['From Max'].default_value = -span_prev / 2 + fade / 2
        links.new(wrap.outputs[0], up.inputs[0])
        dn = nodes.new('ShaderNodeMapRange'); dn.clamp = True
        dn.inputs['From Min'].default_value = span_next / 2 + fade / 2; dn.inputs['From Max'].default_value = span_next / 2 - fade / 2
        links.new(wrap.outputs[0], dn.inputs[0])
        w = nodes.new('ShaderNodeMath'); w.operation = 'MULTIPLY'
        links.new(up.outputs[0], w.inputs[0]); links.new(dn.outputs[0], w.inputs[1])
        s = nodes.new('ShaderNodeMath'); s.operation = 'MULTIPLY'  # smoothstep-ish
        links.new(w.outputs[0], s.inputs[0]); links.new(w.outputs[0], s.inputs[1])
        return w
    acc = None
    for i, (a, sock) in enumerate(views):
        w = weight_node(i)
        mul = nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'
        links.new(sock, mul.inputs[0]); links.new(w.outputs[0], mul.inputs['Scale'])
        if acc is None:
            acc = mul
        else:
            add = nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'
            links.new(acc.outputs[0], add.inputs[0]); links.new(mul.outputs[0], add.inputs[1]); acc = add
    colour = acc.outputs[0]
    # The sheet art carries its own studio shading: show it mostly as-is, let the scene add a key.
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.55
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25
    links.new(colour, bsdf.inputs['Base Color'])
    links.new(colour, bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 0.42
    links.new(bsdf.outputs[0], out.inputs[0])
    return m


def set_expression(head_obj, name, t=None, fade=0.18):
    """Crossfade the hero's front to expression `name` at shot time t (None = set now)."""
    from common import frame
    m = head_obj.active_material
    nt = m.node_tree
    ws = [n for n in nt.nodes if n.name.startswith('w_')]
    if 'w_' + name not in [n.name for n in ws]:
        name = 'neutral' if 'w_neutral' in [n.name for n in ws] else ws[0].name[2:]
    for n in ws:
        want = 1.0 if n.name == 'w_' + name else 0.0
        if t is None:
            n.outputs[0].default_value = want
        else:
            cur = n.outputs[0].default_value
            n.outputs[0].default_value = cur
            n.outputs[0].keyframe_insert('default_value', frame=frame(t) - 1)
            n.outputs[0].default_value = want
            n.outputs[0].keyframe_insert('default_value', frame=frame(t + fade))


def bind_camera(cam):
    """Point every head shader's CamPos node at camera object `cam` (world location drivers).
    Call once per shot, after the camera exists."""
    for mat in bpy.data.materials:
        if not mat.name.startswith('head_') or not mat.node_tree:
            continue
        n = mat.node_tree.nodes.get('CamPos')
        if not n:
            continue
        for i, axis in enumerate('XYZ'):
            try:
                n.inputs[i].driver_remove('default_value')
            except Exception:
                pass
            fc = n.inputs[i].driver_add('default_value')
            d = fc.driver
            d.type = 'AVERAGE'
            v = d.variables.new(); v.name = 'c'; v.type = 'TRANSFORMS'
            v.targets[0].id = cam
            v.targets[0].transform_type = 'LOC_' + axis
            v.targets[0].transform_space = 'WORLD_SPACE'


# ---- hero ------------------------------------------------------------------------------------

SUIT_SHINE = {'rough': 0.62}


def bone_world_rest(bones):
    """Rest joint positions (three.js model space) by composing the JSON's local transforms."""
    W = []
    for b in bones:
        p = Vector(b['p']); q = Quaternion((b['q'][3], b['q'][0], b['q'][1], b['q'][2]))
        m = Matrix.Translation(p) @ q.to_matrix().to_4x4()
        if b['parent'] >= 0:
            m = W[b['parent']] @ m
        W.append(m)
    return W


def build_hero(hero, col=None, name=None):
    """Armature + skinned chibi suit + sheet head + quiver, standing at the origin facing -Y
    (Blender front). Returns a dict with the objects and useful bone names."""
    col = col or new_collection('heroes')
    name = name or hero
    hdir = HERO_DIR
    body = json.load(open(os.path.join(hdir, '%s_body.json' % hero)))
    baked = json.load(open(os.path.join(hdir, '%s.json' % hero)))

    # --- armature
    arm_data = bpy.data.armatures.new(name + '_rig')
    arm = bpy.data.objects.new(name, arm_data)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    bones = body['bones']
    W = bone_world_rest(bones)
    joints = [Vector(three_to_blender(m.translation)) for m in W]
    # A perfectly straight limb gives Blender's IK solver no preferred bend: nudge the elbows
    # back and the knees forward by 2 cm in the rest pose.
    for i, b in enumerate(bones):
        if b['name'].endswith('ForeArm'):
            joints[i] += Vector((0, 0.02, 0))
        elif b['name'].endswith('Leg') and not b['name'].endswith('UpLeg'):
            joints[i] += Vector((0, -0.02, 0))
    children = {i: [j for j, b in enumerate(bones) if b['parent'] == i] for i in range(len(bones))}
    ebs = {}
    for i, b in enumerate(bones):
        eb = arm_data.edit_bones.new(b['name'])
        eb.head = joints[i]
        if children[i]:
            tail = joints[children[i][0]]
            if b['name'] == 'Root':
                tail = joints[i] + Vector((0, 0, 0.06))
            if b['name'] == 'Spine':
                tail = joints[children[i][0]]  # Head joint
        else:
            # end bones: continue the parent's direction
            par = joints[bones[i]['parent']]
            d = (joints[i] - par)
            d = d.normalized() if d.length > 1e-6 else Vector((0, 0, -1))
            tail = joints[i] + d * 0.1
        if (tail - eb.head).length < 1e-4:
            tail = eb.head + Vector((0, 0, 0.05))
        eb.tail = tail
        ebs[i] = eb
    for i, b in enumerate(bones):
        if b['parent'] >= 0:
            ebs[i].parent = ebs[b['parent']]
    # Spine and Head: Head bone covers the skull.
    hid = [b['name'] for b in bones].index('Head')
    ebs[hid].tail = ebs[hid].head + Vector((0, 0, 0.4))
    bpy.ops.object.mode_set(mode='OBJECT')

    # --- suit mesh, skinned
    pos, colr, faces, _ = decode_mesh(body['mesh'])
    si = b64(body['mesh']['extra'][0]).reshape(-1, 4).astype(np.int64)  # one byte per bone index
    sw = b64(body['mesh']['extra'][1]).reshape(-1, 4).astype(np.float64) / 255.0
    suit = build_mesh(name + '_suit', pos, faces, uv=None, vcol=colr)
    col.objects.link(suit)
    for bi, b in enumerate(bones):
        vg = suit.vertex_groups.new(name=b['name'])
        mask = (si == bi) & (sw > 0)
        idxs = np.nonzero(mask.any(axis=1))[0]
        for vi in idxs:
            w = float(sw[vi][si[vi] == bi].sum())
            vg.add([int(vi)], w, 'REPLACE')
    mod = suit.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    suit.parent = arm
    smat = bpy.data.materials.get('suit')
    if smat is None:
        smat = bpy.data.materials.new('suit'); smat.use_nodes = True
        nt = smat.node_tree
        attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
        bsdf = nt.nodes['Principled BSDF']
        nt.links.new(attr.outputs[0], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = SUIT_SHINE['rough']
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.35
    suit.data.materials.append(smat)

    # --- head: sheet mesh, parented to the Head bone
    hpos, hcol, hfaces, huv = decode_mesh(baked['head'])
    # head space (x fwd, y up, z right) -> model (−z, y, x) -> Blender (−hz, −hx, hy)
    hb = [(-p[2], -p[0], p[1]) for p in hpos]
    head = build_mesh(name + '_head', hb, hfaces, uv=huv, convert=False)
    col.objects.link(head)
    head.scale = (HEAD_R, HEAD_R, HEAD_R)
    head.parent = arm
    head.parent_type = 'BONE'
    head.parent_bone = 'Head'
    # Bone parenting puts the child at the bone's tail; move back to the head joint.
    chin = baked['chin']
    head_joint_y = HIP + BODY['torso'] + BODY['neck']
    centre_y = HIP + BODY['torso'] + 0.06 - chin * HEAD_R  # Stickman3D: torso + COLLAR_TOP - chin * R (+ a little clear of the collar)
    bone_len = 0.4
    head.location = (0, -(bone_len) + (centre_y - head_joint_y), 0)
    # bone space: Y along the bone (up). We need: offset along bone = centre_y - head_joint_y.
    head.location = (0, (centre_y - head_joint_y) - bone_len, 0)
    head.rotation_euler = (math.radians(-90), 0, 0)  # bone Y-up -> object Z-up
    hmat = head_material(hero, baked, baked['expressions'])
    head.data.materials.append(hmat)

    # --- quiver (all but Beeman) on the back
    from props import build_quiver, build_bow, build_spare_arrows
    quiver = None
    if hero != 'beeman':
        quiver = build_quiver(name + '_quiver', col, white=False)
        quiver.parent = arm; quiver.parent_type = 'BONE'; quiver.parent_bone = 'Spine'
        # Spine bone runs from hip+0.06 up to the Head joint (len torso+neck-0.06).
        spine_len = BODY['torso'] + BODY['neck'] - 0.06
        # bone space: X = world X, Y = along the bone (up), Z = world -Y (front); the back is -Z.
        quiver.location = (0.12, 0.28 - spine_len, -0.21)
        quiver.rotation_euler = (math.radians(-90 + 12), 0, math.radians(-22))
    bow = build_bow(name + '_bow', col, white=(hero == 'beeman'))
    bow.parent = arm; bow.parent_type = 'BONE'; bow.parent_bone = 'LeftHand'
    bow.location = (0, 0.05 - 0.1, 0)
    bow['hero'] = hero
    from props import build_arrow, ARROW_LEN as AL
    nk = build_arrow(name + '_nocked', col, white=(hero == 'beeman'))
    nk.parent = bpy.data.objects[bow['nock']]
    nk.location = (AL, 0, 0)  # nock end on the string, tip toward the target
    nk.scale = (0, 0, 0)
    arm['hero'] = hero
    arm['head'] = head.name
    arm['bow'] = bow.name
    return {'arm': arm, 'suit': suit, 'head': head, 'bow': bow, 'quiver': quiver, 'hero': hero, 'nocked': nk}


# ---- licensed environment kits -------------------------------------------------------------------

def kit_material(kit, mats, mi):
    m = mats[mi]
    name = '%s_mat_%d' % (kit, mi)
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.85
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.2
    if m.get('tex'):
        t = mat.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = load_image(os.path.join(ASSETS, 'licensed', 'maps', m['tex']))
        mat.node_tree.links.new(t.outputs[0], bsdf.inputs['Base Color'])
        mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
    else:
        bsdf.inputs['Base Color'].default_value = hexc(m.get('color', '#FFFFFF'))
    return mat


_kits = {}


def kit(kit_id):
    if kit_id not in _kits:
        _kits[kit_id] = json.load(open(os.path.join(ASSETS, 'licensed', 'maps', kit_id + '.json')))
    return _kits[kit_id]


_prop_meshes = {}


def prop_mesh(kit_id, key):
    """A kit prop as a Blender mesh datablock (shared between placements)."""
    k = (kit_id, key)
    if k in _prop_meshes:
        return _prop_meshes[k]
    data = kit(kit_id)
    p = data['props'][key]
    verts, faces, vcols, mat_ids, uvs = [], [], [], [], []
    mats = []
    for part in p['parts']:
        base = len(verts)
        if 'c' in part:  # baked colours, triangle soup
            pts = np.array(part['p'], dtype=np.float64).reshape(-1, 3)
            cs = np.array(part['c'], dtype=np.float64).reshape(-1, 3)
            cs = np.where(cs <= 0.04045, cs / 12.92, ((cs + 0.055) / 1.055) ** 2.4) if cs.max() <= 1.0 else cs / 255
            for v in pts:
                verts.append(three_to_blender(v))
            vcols.extend(cs.tolist())
            for i in range(0, len(pts), 3):
                faces.append((base + i, base + i + 1, base + i + 2)); mat_ids.append(0); uvs.append(None)
            if not mats:
                mats.append(None)
        else:
            pts = np.array(part['p'], dtype=np.float64).reshape(-1, 3)
            uv = np.array(part['uv'], dtype=np.float64).reshape(-1, 2) if part.get('uv') else None
            idx = np.array(part['i'], dtype=np.int64).reshape(-1, 3)
            for v in pts:
                verts.append(three_to_blender(v))
            vcols.extend([[1, 1, 1]] * len(pts))
            mat = kit_material(kit_id, data['mats'], part['mat'])
            if mat not in mats:
                mats.append(mat)
            mi = mats.index(mat)
            for tri in idx:
                faces.append(tuple(int(base + i) for i in tri)); mat_ids.append(mi)
                uvs.append([tuple(uv[i]) for i in tri] if uv is not None else None)
    me = bpy.data.meshes.new('%s_%s' % (kit_id, key))
    me.from_pydata(verts, [], faces)
    me.update()
    if any(u is not None for u in uvs):
        layer = me.uv_layers.new(name='UVMap')
        for poly, u in zip(me.polygons, uvs):
            if u:
                for li, uvv in zip(poly.loop_indices, u):
                    layer.data[li].uv = uvv
    if any(m is None for m in mats):
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        flat = np.concatenate([np.array(vcols), np.ones((len(vcols), 1))], axis=1).astype(np.float32).ravel()
        ca.data.foreach_set('color', flat)
        vmat = bpy.data.materials.get('kit_vcol')
        if vmat is None:
            vmat = bpy.data.materials.new('kit_vcol'); vmat.use_nodes = True
            nt = vmat.node_tree
            attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
            nt.links.new(attr.outputs[0], nt.nodes['Principled BSDF'].inputs['Base Color'])
            nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
        mats = [vmat if m is None else m for m in mats]
    for m in mats:
        me.materials.append(m)
    for poly, mi in zip(me.polygons, mat_ids):
        poly.material_index = mi
        poly.use_smooth = False
    _prop_meshes[k] = me
    return me


def place_prop(kit_id, key, loc, rot_z=0.0, scale=1.0, col=None, name=None):
    me = prop_mesh(kit_id, key)
    ob = bpy.data.objects.new(name or me.name, me)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = (scale, scale, scale)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob


def prop_size(kit_id, key):
    p = kit(kit_id)['props'][key]
    mn, mx = p['min'], p['max']
    return Vector((mx[0] - mn[0], mx[2] - mn[2], mx[1] - mn[1]))  # Blender axes
