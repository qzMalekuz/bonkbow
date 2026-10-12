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


# ---- heads: the character sheet's own renders ---------------------------------------------------
# Every head in the film is a cut-out of archer-boys.pdf (assets/heads/, 512 px from hair top to
# chin): the seven turnaround views and the front-view expressions. A head is a camera-facing
# card that shows whichever sheet view matches the angle it is seen from; `bake_heads` picks the
# view (and expression) per frame after a shot is built.
HEAD_DIR = os.path.join(RIG, 'assets', 'heads')
HEAD_H = 1.05            # hair top to chin, metres
BODY_SQUASH = 0.64       # the game's tall stick body, brought to the sheet's chibi proportions
NECK_DROP = 0.03         # how far the sheet's painted collar sinks into the suit's collar
# what the shots call an expression -> the sheet's name for it, best first
EXPR = {'smile': ['e_grin', 'e_smile', 'e_neutral'], 'neutral': ['e_neutral', 'e_smile', 'e_grin'], 'angry': ['e_angry', 'e_scowl'],
        'stern': ['e_scowl', 'e_angry'], 'wink': ['e_wink'], 'shock': ['e_shock']}
REST_EXPR = {'akshay': 'smile', 'mit': 'smile', 'tolly': 'neutral', 'chase': 'neutral', 'mert': 'angry'}
_heads_meta = None
REG = []                 # heroes built in this scene: dicts with root, sprites, expression keys


def heads_meta():
    global _heads_meta
    if _heads_meta is None:
        _heads_meta = json.load(open(os.path.join(HEAD_DIR, 'heads.json')))
    return _heads_meta


def sprite_material(hero, key):
    name = 'head_%s_%s' % (hero, key)
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = load_image(os.path.join(HEAD_DIR, '%s_%s.png' % (hero, key)))
    tex.extension = 'CLIP'
    tint = nt.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.name = 'Tint'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = (1, 1, 1, 1)
    nt.links.new(tex.outputs['Color'], tint.inputs['A'])
    em = nt.nodes.new('ShaderNodeEmission'); em.name = 'Glow'
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(tint.outputs['Result'], em.inputs['Color'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    # crisp edge: alpha pushed through a steep ramp
    ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.clamp = True
    ramp.inputs['From Min'].default_value = 0.35; ramp.inputs['From Max'].default_value = 0.65
    nt.links.new(tex.outputs['Alpha'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'DITHERED'
    return m


def build_head(hero, name, arm, col):
    """The head root (an empty riding the Head bone, facing the camera) and one card per sheet view."""
    meta = heads_meta()[hero]
    s = HEAD_H / 512.0
    anchor = bpy.data.objects.new(name + '_neck', None); col.objects.link(anchor)
    anchor.parent = arm; anchor.parent_type = 'BONE'; anchor.parent_bone = 'Head'
    anchor.location = (0, -arm.data.bones['Head'].length, 0)
    root = bpy.data.objects.new(name + '_head', None); col.objects.link(root)
    root.empty_display_size = 0.2
    cl = root.constraints.new('COPY_LOCATION'); cl.target = anchor
    sprites = {}
    for key, m in meta.items():
        w, h, ax, ay = m['w'], m['h'], m['ax'], m['ay']
        x0, x1 = -ax * s, (w - ax) * s
        z0, z1 = -(h - ay) * s - NECK_DROP, ay * s - NECK_DROP
        me = bpy.data.meshes.new('%s_%s' % (name, key))
        me.from_pydata([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [], [(0, 1, 2, 3)])
        uv = me.uv_layers.new(name='UVMap')
        for li, co in zip(range(4), ((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[li].uv = co
        me.materials.append(sprite_material(hero, key))
        ob = bpy.data.objects.new(me.name, me); col.objects.link(ob)
        ob.parent = root
        ob.visible_shadow = False
        ob.scale = (0, 0, 0)
        sprites[key] = ob
    # an unseen ball so the head still casts a shadow
    bpy.ops.mesh.primitive_uv_sphere_add(radius=HEAD_H * 0.42, segments=16, ring_count=8)
    ball = bpy.context.object; ball.name = name + '_shadow'
    for c in list(ball.users_collection):
        c.objects.unlink(ball)
    col.objects.link(ball)
    ball.parent = root; ball.location = (0, 0, HEAD_H * 0.5)
    ball.visible_camera = False
    if hasattr(ball, 'visible_glossy'):
        ball.visible_glossy = False; ball.visible_diffuse = False; ball.visible_volume_scatter = False
    # which sheet view to show for each direction the face points on screen (degrees, + = screen right)
    views = []
    for key, m in meta.items():
        if key.startswith('e_') or key in ('idle', 'walk', 'run'):
            continue
        views.append((float(m['yaw']), key, False))
    have = {round(v[0]) for v in views}
    for yaw, key, _ in list(views):
        if round(-yaw) not in have and abs(yaw) not in (0, 180):
            views.append((-yaw, key, True))      # the missing side: the same drawing, mirrored
    reg = dict(hero=hero, root=root, anchor=anchor, arm=arm, sprites=sprites, views=views, expr=[(-1.0, REST_EXPR.get(hero, 'neutral'))])
    REG.append(reg)
    root['hero'] = hero
    return root


def set_expression(head_root, name, t=None, fade=0.0):
    """The front-view expression from time t on (None = from the start)."""
    for r in REG:
        if r['root'] == head_root:
            r['expr'].append((-0.5 if t is None else float(t), name))


def bind_camera(cam):
    """Turn every head card to face camera `cam`."""
    for r in REG:
        root = r['root']
        tr = root.constraints.get('face') or root.constraints.new('TRACK_TO')
        tr.name = 'face'
        tr.target = cam
        tr.track_axis = 'TRACK_NEGATIVE_Y'
        tr.up_axis = 'UP_Z'


def _expr_key(r, t):
    name = sorted([e for e in r['expr'] if e[0] <= t + 1e-6], key=lambda e: e[0])[-1][1]
    for k in EXPR.get(name, []) + ['front']:
        if k in r['sprites']:
            return k
    return 'front'


def bake_heads(frames=None):
    """Per frame, show the sheet view that matches the angle each head is seen from. A view is
    held until the camera is clearly past the boundary to the next, so heads do not flicker."""
    from common import FPS
    sc = bpy.context.scene
    cam = sc.camera
    bind_camera(cam)
    frames = list(frames) if frames is not None else list(range(sc.frame_start, sc.frame_end + 1))
    cont = len(frames) > 1 and frames == list(range(frames[0], frames[-1] + 1))
    state = {id(r): None for r in REG}
    shown = {id(r): [] for r in REG}
    for f in frames:
        sc.frame_set(f)
        cpos = cam.matrix_world.translation
        for r in REG:
            arm = r['arm']
            mw = arm.matrix_world @ arm.pose.bones['Head'].matrix
            fwd = mw.to_3x3() @ Vector((0, 0, 1)); fwd.z = 0
            if fwd.length < 1e-6:
                fwd = Vector((0, -1, 0))
            fwd.normalize()
            left = Vector((-fwd.y, fwd.x, 0))
            v = cpos - r['root'].matrix_world.translation; v.z = 0
            az = math.degrees(math.atan2(v.dot(left), v.dot(fwd)))    # camera bearing, + = toward his left
            face = -az                                                  # where the face points on screen
            def dist(y):
                return abs((y - face + 180) % 360 - 180)
            best = min(r['views'], key=lambda vw: dist(vw[0]))
            cur = state[id(r)]
            if cont and cur is not None and dist(cur[0]) < dist(best[0]) + 12:
                best = cur
            state[id(r)] = best
            key, mirror = best[1], best[2]
            if key == 'front':
                key = _expr_key(r, (f - 1) / FPS)
            shown[id(r)].append((f, key, mirror))
    for r in REG:
        prev = {}
        for f, key, mirror in shown[id(r)]:
            for k, ob in r['sprites'].items():
                want = ((-1.0 if mirror else 1.0), 1.0, 1.0) if k == key else (0.0, 0.0, 0.0)
                if prev.get(k) != want:
                    ob.scale = want
                    ob.keyframe_insert('scale', frame=f)
                    prev[k] = want
        for ob in r['sprites'].values():
            if ob.animation_data and ob.animation_data.action:
                from common import fcurves
                for fc in fcurves(ob.animation_data.action):
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'CONSTANT'


def head_glow(value, color=None, hero=None):
    """Brightness of the sheet art (the old scale: 0.42 = full daylight, 0.2 = night) and an
    optional tint so faces sit in the scene's light."""
    strength = 0.52 + value * 1.15
    for m in bpy.data.materials:
        if m.name.startswith('head_') and m.node_tree and 'Glow' in m.node_tree.nodes:
            if hero and not m.name.startswith('head_%s_' % hero):
                continue
            m.node_tree.nodes['Glow'].inputs['Strength'].default_value = strength
            if color:
                m.node_tree.nodes['Tint'].inputs['B'].default_value = hexc(color)


def key_head_glow(hero, t, value):
    from common import frame
    for m in bpy.data.materials:
        if m.name.startswith('head_%s_' % hero) and m.node_tree and 'Glow' in m.node_tree.nodes:
            sk = m.node_tree.nodes['Glow'].inputs['Strength']
            sk.default_value = 0.52 + value * 1.15
            sk.keyframe_insert('default_value', frame=frame(t))


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

    # --- head: the sheet's own renders on a camera-facing card
    head = build_head(hero, name, arm, col)
    arm.scale = (1.0, 1.0, BODY_SQUASH)

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
        pts = np.array(part['p'], dtype=np.float64).reshape(-1, 3) / 1000.0  # millimetres
        for v in pts:
            verts.append(three_to_blender(v))
        if 'c' in part:  # baked: triangle soup, one sRGB hex colour per face
            for f, hx in enumerate(part['c']):
                rgb = np.array([(hx >> 16) & 255, (hx >> 8) & 255, hx & 255], dtype=np.float64) / 255.0
                rgb = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
                vcols.extend([rgb.tolist()] * 3)
                faces.append((base + f * 3, base + f * 3 + 1, base + f * 3 + 2)); mat_ids.append(0); uvs.append(None)
            if not mats:
                mats.append(None)
        else:
            uv = np.array(part['uv'], dtype=np.float64).reshape(-1, 2) / 10000.0 if part.get('uv') else None
            idx = np.array(part['i'], dtype=np.int64).reshape(-1, 3)
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
