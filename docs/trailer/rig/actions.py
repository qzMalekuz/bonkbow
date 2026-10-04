"""Posing and the action library. A hero is driven the way the game drives it (StickmanBody.ts):
hips, spine, head, and four limb end points, solved with two-bone IK. Everything here is in
character space: +X = the archer's right, -Y = forward (the way he faces), +Z = up, metres;
the hips rest at HIP (0.86 m). Times are shot seconds."""
import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from common import FPS, ease, ease_out, frame, key_loc, key_rot, lerp, set_interp
from game_assets import BODY, HEAD_R, HIP
from props import draw_string

SHOULDER = HIP + BODY['torso'] - 0.06 + 0.06  # the suit's shoulder joint height (body.ts SH_Y + spine)
SH_X = 0.3
HEAD_C = HIP + BODY['torso'] + 0.06 - (-0.7853) * HEAD_R  # head centre (akshay chin; all heroes close)
ARM = BODY['upperArm'] + BODY['foreArm']
LEG = BODY['thigh'] + BODY['shin']
HIP_X = 0.125


# ---- control setup -----------------------------------------------------------------------------

def setup_controls(h):
    """IK targets (empties parented to the armature) + constraints. Idempotent."""
    arm = h['arm']
    if arm.get('controls'):
        return h
    col = arm.users_collection[0]
    ctrls = {}

    def ctrl(name, loc):
        e = bpy.data.objects.new('%s_%s' % (arm.name, name), None)
        e.empty_display_size = 0.06
        e.empty_display_type = 'SPHERE'
        e.parent = arm
        e.location = loc
        col.objects.link(e)
        ctrls[name] = e
        return e

    # Rest positions: feet at the soles, hands at the end of the hanging A-pose arms.
    drop = 0.25
    for side, sx in (('L', 1), ('R', -1)):
        ctrl('foot_' + side, (sx * HIP_X, 0, 0.0))
        ctrl('knee_' + side, (sx * HIP_X, -0.8, HIP * 0.5))  # pole: in front
        hx = sx * (SH_X + math.sin(drop) * ARM)
        ctrl('hand_' + side, (hx, 0, SHOULDER - math.cos(drop) * ARM))
        ctrl('elbow_' + side, (sx * (SH_X + 0.6), 0.9, SHOULDER - 0.2))  # pole: behind and out
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    pb = arm.pose.bones
    for side, b in (('L', 'Left'), ('R', 'Right')):
        ik = pb[b + 'ForeArm'].constraints.new('IK')
        ik.target = ctrls['hand_' + side]; ik.pole_target = ctrls['elbow_' + side]
        ik.chain_count = 2; ik.use_tail = True; ik.pole_angle = math.radians(-90)
        ik = pb[b + 'Leg'].constraints.new('IK')
        ik.target = ctrls['foot_' + side]; ik.pole_target = ctrls['knee_' + side]
        ik.chain_count = 2; ik.use_tail = True; ik.pole_angle = math.radians(-90)
        # hands and feet copy their target's orientation (so the bow follows the hand target)
        cr = pb[b + 'Hand'].constraints.new('COPY_ROTATION'); cr.target = ctrls['hand_' + side]
        cr.owner_space = 'WORLD'; cr.target_space = 'WORLD'
        cr = pb[b + 'Foot'].constraints.new('COPY_ROTATION'); cr.target = ctrls['foot_' + side]
        cr.owner_space = 'WORLD'; cr.target_space = 'WORLD'
    for name in ('Root', 'Spine', 'Head'):
        pb[name].rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    arm['controls'] = True
    h['ctrl'] = ctrls
    # The bow hangs from the left hand target: limbs vertical, string toward the archer.
    bow = h['bow']
    bow.parent = ctrls['hand_L']; bow.parent_type = 'OBJECT'
    bow.location = (0, 0, 0)
    bow.rotation_euler = (0, 0, math.radians(-90))  # bow +X (toward target) -> -Y forward
    # Rest pose: hands down, feet planted.
    return h


def _hand_rot(side, aim_dir=None, roll=0.0):
    """Orientation for a hand target. The bow is built along local +X -> world -Y after the
    90 deg yaw; aiming turns the hand so the bow's +X points along `aim_dir`."""
    if aim_dir is None:
        return Euler((0, 0, 0))
    d = Vector(aim_dir).normalized()
    # rotate -Y onto d about Z then pitch
    yaw = math.atan2(d.x, -d.y)
    pitch = math.asin(max(-1, min(1, d.z)))
    q = Euler((0, 0, yaw), 'XYZ').to_quaternion() @ Euler((-pitch, 0, 0), 'XYZ').to_quaternion()
    if roll:
        q = q @ Euler((0, roll, 0), 'XYZ').to_quaternion()
    return q.to_euler('XYZ')


# ---- the pose API --------------------------------------------------------------------------------

class Pose:
    """A full-body key. Positions in character space. Missing values keep the rest."""

    def __init__(self, **kw):
        self.hips = kw.get('hips', (0, 0, HIP))
        self.hips_rot = kw.get('hips_rot', (0, 0, 0))  # pitch (lean fwd +), roll, yaw deg
        self.spine = kw.get('spine', (0, 0, 0))
        self.head = kw.get('head', (0, 0, 0))  # pitch(+ = look down) , roll, yaw(+ = look left)
        self.foot_L = kw.get('foot_L', (HIP_X, 0, 0))
        self.foot_R = kw.get('foot_R', (-HIP_X, 0, 0))
        self.foot_rot_L = kw.get('foot_rot_L', (0, 0, 0))
        self.foot_rot_R = kw.get('foot_rot_R', (0, 0, 0))
        drop = 0.25
        hx = SH_X + math.sin(drop) * ARM
        hz = SHOULDER - math.cos(drop) * ARM
        self.hand_L = kw.get('hand_L', (hx, 0, hz))
        self.hand_R = kw.get('hand_R', (-hx, 0, hz))
        self.hand_rot_L = kw.get('hand_rot_L', (0, 0, 0))
        self.hand_rot_R = kw.get('hand_rot_R', (0, 0, 0))
        self.elbow_L = kw.get('elbow_L', None)
        self.elbow_R = kw.get('elbow_R', None)
        self.knee_L = kw.get('knee_L', None)
        self.knee_R = kw.get('knee_R', None)
        self.draw = kw.get('draw', 0.0)

    def blend(self, other, k):
        out = Pose()
        for a in vars(self):
            va, vb = getattr(self, a), getattr(other, a)
            if va is None or vb is None:
                setattr(out, a, vb if k > 0.5 else va)
            elif isinstance(va, (int, float)):
                setattr(out, a, lerp(va, vb, k))
            else:
                setattr(out, a, tuple(lerp(x, y, k) for x, y in zip(va, vb)))
        return out


def apply(h, p, t, interp='BEZIER'):
    """Keyframe pose p at shot time t."""
    setup_controls(h)
    c = h['ctrl']
    arm = h['arm']
    key_loc(c['foot_L'], t, p.foot_L, interp); key_loc(c['foot_R'], t, p.foot_R, interp)
    key_rot(c['foot_L'], t, p.foot_rot_L, interp); key_rot(c['foot_R'], t, p.foot_rot_R, interp)
    key_loc(c['hand_L'], t, p.hand_L, interp); key_loc(c['hand_R'], t, p.hand_R, interp)
    for side in 'LR':
        r = getattr(p, 'hand_rot_' + side)
        if isinstance(r, Euler):
            c['hand_' + side].rotation_euler = r
            c['hand_' + side].keyframe_insert('rotation_euler', frame=frame(t))
            set_interp(c['hand_' + side], 'rotation_euler', t, interp)
        else:
            key_rot(c['hand_' + side], t, r, interp)
        el = getattr(p, 'elbow_' + side)
        if el is None:
            hx = c['hand_' + side].location
            el = (hx.x + (0.6 if side == 'L' else -0.6), hx.y + 0.9, SHOULDER - 0.2)
        key_loc(c['elbow_' + side], t, el, interp)
        kn = getattr(p, 'knee_' + side)
        if kn is None:
            f = c['foot_' + side].location
            kn = ((HIP_X if side == 'L' else -HIP_X), f.y - 0.9, HIP * 0.5)
        key_loc(c['knee_' + side], t, kn, interp)
    # hips: the Root bone (bone Y = world Z). Pose-space rotations: pitch about bone X.
    pb = arm.pose.bones
    root = pb['Root']
    root.location = (p.hips[0], p.hips[2] - HIP, -p.hips[1])  # bone local: X, Y(up), Z(= -world Y)
    root.rotation_euler = Euler((-math.radians(p.hips_rot[0]), math.radians(p.hips_rot[2]), -math.radians(p.hips_rot[1])), 'XYZ')
    root.keyframe_insert('location', frame=frame(t)); root.keyframe_insert('rotation_euler', frame=frame(t))
    sp = pb['Spine']
    sp.rotation_euler = Euler((-math.radians(p.spine[0]), math.radians(p.spine[2]), -math.radians(p.spine[1])), 'XYZ')
    sp.keyframe_insert('rotation_euler', frame=frame(t))
    hd = pb['Head']
    hd.rotation_euler = Euler((-math.radians(p.head[0]), math.radians(p.head[2]), -math.radians(p.head[1])), 'XYZ')
    hd.keyframe_insert('rotation_euler', frame=frame(t))
    for b in (root, sp, hd):
        pass
    if arm.animation_data and arm.animation_data.action:
        from common import fcurves
        for fc in fcurves(arm.animation_data.action):
            for kp in fc.keyframe_points:
                if abs(kp.co.x - frame(t)) < 0.5:
                    kp.interpolation = interp
    draw_string(h['bow'], t, p.draw)


# ---- named poses from the character sheet -----------------------------------------------------

def P_idle(bow_down=True):
    """Sheet IDLE: standing square, bow in the left hand hanging at the side, right hand relaxed."""
    return Pose(hand_L=(0.42, -0.05, 0.62), hand_rot_L=(0, 0, 0), hand_R=(-0.42, 0.0, 0.66),
                foot_L=(0.17, 0.0, 0), foot_R=(-0.17, 0.02, 0), head=(0, 0, 0))


def P_aim(dir=(0, -1, 0), draw=1.0, crouch=0.0):
    """Sheet AIMING / CROUCH AIM: side-on to the target, bow arm straight out, draw hand at the cheek."""
    d = Vector(dir).normalized()
    side = Vector((d.y, -d.x, 0))  # the archer's left when facing d... we face along d, body turned side-on
    sh = Vector((0, 0, SHOULDER - crouch * 0.42))
    bow_hand = sh + d * (ARM * 0.95) + Vector((0, 0, 0.1 - crouch * 0.05))
    draw_hand = sh - d * 0.02 + Vector((0, 0, 0.17)) + side * 0.0
    # keep the draw hand just outside the big head: push it sideways toward the camera side
    hr = _hand_rot('L', d)
    hips = (0, 0, HIP - crouch * 0.40)
    fL = Vector(d) * 0.28 + Vector((0.16, 0, 0))
    fR = -Vector(d) * 0.18 + Vector((-0.16, 0, 0))
    if crouch > 0.5:
        fR = -Vector(d) * 0.42 + Vector((-0.2, 0, 0))
    return Pose(hand_L=tuple(bow_hand), hand_rot_L=hr, hand_R=tuple(draw_hand), hand_rot_R=hr,
                elbow_R=tuple(sh - d * 0.5 + Vector((0, 0, 0.45))), elbow_L=tuple(sh + d * 0.3 + Vector((0, 0, -0.5))),
                foot_L=tuple(fL), foot_R=tuple(fR), hips=hips, hips_rot=(crouch * 12, 0, 0),
                head=(-4 - crouch * 6, 0, 0), spine=(0, 0, 0), draw=draw,
                knee_R=tuple(-Vector(d) * 0.3 + Vector((-0.2, 0, HIP * 0.5 + 0.3 * crouch))) if crouch > 0.5 else None)


def P_shoot(dir=(0, -1, 0)):
    """The frame after release: bow arm steady, draw hand flung back past the ear."""
    p = P_aim(dir, draw=0.0)
    d = Vector(dir).normalized()
    sh = Vector((0, 0, SHOULDER))
    p.hand_R = tuple(sh - d * 0.42 + Vector((0, 0, 0.26)))
    return p


def P_run(phase, speed=1.0):
    """Sheet RUN: forward lean, big stride, arms pumping. phase in cycles."""
    a = phase * 2 * math.pi
    s = 0.34 * speed
    lift = 0.14 * speed
    fy = math.cos(a) * s
    hips_z = HIP - 0.03 + abs(math.sin(a)) * 0.03
    fL = (HIP_X, -fy, max(0, math.sin(a)) * lift)
    fR = (-HIP_X, fy, max(0, -math.sin(a)) * lift)
    hL = (0.34, 0.25 * math.cos(a + math.pi) - 0.05, SHOULDER - 0.25)
    hR = (-0.34, 0.25 * math.cos(a) - 0.05, SHOULDER - 0.25)
    return Pose(foot_L=fL, foot_R=fR, hand_L=hL, hand_R=hR, hips=(0, -0.04, hips_z), hips_rot=(16, 0, 0),
                head=(-10, 0, 0), elbow_L=(0.6, 0.8, SHOULDER - 0.3), elbow_R=(-0.6, 0.8, SHOULDER - 0.3))


def P_walk(phase):
    a = phase * 2 * math.pi
    s = 0.2
    fL = (HIP_X, -math.cos(a) * s, max(0, math.sin(a)) * 0.06)
    fR = (-HIP_X, math.cos(a) * s, max(0, -math.sin(a)) * 0.06)
    hL = (0.42, 0.1 * math.cos(a + math.pi) - 0.05, 0.62)
    hR = (-0.42, 0.1 * math.cos(a), 0.66)
    return Pose(foot_L=fL, foot_R=fR, hand_L=hL, hand_R=hR, hips=(0, 0, HIP - 0.01 + abs(math.sin(a)) * 0.015), hips_rot=(3, 0, 0))


def P_crouch_land():
    """Sheet-style three-point landing: one knee down, one fist on the ground."""
    return Pose(hips=(0, 0.05, HIP - 0.42), hips_rot=(22, 0, 0), foot_L=(0.22, -0.3, 0), foot_R=(-0.2, 0.35, 0),
                knee_R=(-0.2, 0.2, 0.1), hand_R=(-0.3, -0.35, 0.02), hand_L=(0.45, -0.1, 0.5), head=(-12, 0, 0))


def P_lookback(yaw=70):
    p = P_idle()
    p.head = (-6, 0, yaw)
    p.spine = (0, 0, yaw * 0.25)
    return p


def P_dodge_lean(side=1, amount=1.0):
    """Lean the upper body out of an arrow's path without moving the feet."""
    p = P_idle()
    p.hips = (0.06 * side * amount, 0, HIP - 0.03 * amount)
    p.hips_rot = (0, -22 * side * amount, 0)
    p.spine = (0, -14 * side * amount, 0)
    p.head = (0, -10 * side * amount, 0)
    return p


# ---- helpers used by shots ----------------------------------------------------------------------

def face(h, t, yaw_deg, loc=None):
    """Where the whole character stands and which way he faces (world). yaw 0 = facing -Y."""
    arm = h['arm']
    if loc is not None:
        key_loc(arm, t, loc)
    key_rot(arm, t, (0, 0, yaw_deg))


def expression(h, name, t=None):
    from game_assets import set_expression
    set_expression(h['head'], name, t)


def hold(h, p, t0, t1):
    apply(h, p, t0); apply(h, p, t1)


def run_cycle(h, t0, t1, cycle=0.42, speed=1.0, steps=8):
    """Keyframe a looping run from t0 to t1."""
    t = t0
    phase = 0.0
    while t <= t1 + 1e-6:
        apply(h, P_run(phase, speed), t, interp='LINEAR')
        t += cycle / steps
        phase += 1.0 / steps


def walk_cycle(h, t0, t1, cycle=0.9, steps=8):
    t = t0
    phase = 0.0
    while t <= t1 + 1e-6:
        apply(h, P_walk(phase), t, interp='LINEAR')
        t += cycle / steps
        phase += 1.0 / steps


def move(h, t0, t1, p0, p1, yaw=None, ease_fn=None):
    """Move the armature object from p0 to p1 (world) between t0 and t1."""
    arm = h['arm']
    key_loc(arm, t0, p0); key_loc(arm, t1, p1)
    if yaw is not None:
        key_rot(arm, t0, (0, 0, yaw)); key_rot(arm, t1, (0, 0, yaw))
    if ease_fn == 'linear':
        from common import linear_all
        linear_all(arm)


def draw_sequence(h, t0, t_full, t_release, dir=(0, -1, 0), crouch=0.0, hold_after=0.25):
    """Idle -> draw to full by t_full -> hold -> release at t_release -> shoot pose."""
    apply(h, P_aim(dir, draw=0.0, crouch=crouch), t0)
    apply(h, P_aim(dir, draw=1.0, crouch=crouch), t_full)
    apply(h, P_aim(dir, draw=1.0, crouch=crouch), t_release - 1 / FPS)
    apply(h, P_shoot(dir), t_release + 2 / FPS, interp='LINEAR')
    apply(h, P_shoot(dir), t_release + hold_after)
