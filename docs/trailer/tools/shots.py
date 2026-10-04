"""The eleven shots of the Stickchers launch trailer. Each function takes (local time, global time)
and returns a finished 1080x1920 frame."""
from engine import *
BRO, STUB = 'mobile', 'fade'      # brown-haired smiler / stubbled wide-eyed one
def bez(p0, p1, p2, n=18):
    return [((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]) for u in [i / n for i in range(n + 1)]]

# 1 — quiet before the chaos ------------------------------------------------
def S1(t, T):
    cam = Cam(x=lerp(525, 550, ease(t / 3.5)), y=lerp(470, 960, eout(t / 1.7)), z=lerp(1.0, 1.2, ease(t / 3.5)))
    fr = background(cam, T)
    if t > 2.15:
        a = t - 2.15; bx = lerp(1050, 905, eout(a / 0.3)) + math.sin(a * 22) * 8 * math.exp(-a * 6)
        put_head(fr, cam, 'smile', 'smile', bx, 900, 250, rot=-18)
    pillar(fr, cam, 935, 200, 430)
    k, age = pose(t, [(0, 'shades_front'), (1.8, 'shades_idle')])
    put(fr, cam, k, 510, GY + 70, 650, age=age if t >= 1.8 else None, breathe=T)
    fog(fr, T, cam); embers(fr, T)
    return post(fr, T, fade=clamp(t / 0.25))

# 2 — the challenge -----------------------------------------------------------
def S2(t, T):
    cam = Cam(x=lerp(505, 575, t / 3.5), y=900, z=lerp(1.08, 1.16, ease(t / 3.5)))
    fr = background(cam, T); fx = FX()
    k1, a1 = pose(t, [(0, 'shades_idle'), (0.6, 'shades_aiming')])
    put(fr, cam, k1, 250, GY + 40, 520, age=a1 if t >= 0.6 else None, breathe=T)
    k2, a2 = pose(t, [(0, 'smile_idle'), (1.2, 'smile_aiming'), (2.95, 'smile_front')])
    bob = abs(math.sin((t - 2.95) * 9)) * 26 * math.exp(-(t - 2.95) * 2.5) if t >= 2.95 else 0
    put(fr, cam, k2, 830, GY + 40 - bob, 520, flip=(k2 != 'smile_front'), age=a2 if t >= 1.2 else None, breathe=T, ground=GY + 40, amt=0.22)
    if t >= 2.95:
        a = t - 2.95; hx, hy = cam.pt(830, GY - 330)
        for i in range(6):
            an = i * 1.047 + 0.3; r = 150 + 90 * eout(a / 0.25)
            if a < 0.45: fx.star(hx + math.cos(an) * r, hy + math.sin(an) * r * 0.8, 20 * (1 - a / 0.45) + 4, (255, 236, 180, 255))
    fx.flush(fr); fog(fr, T, cam); embers(fr, T)
    if 1.85 <= t < 2.9:
        a = t - 1.85; fr = fr.point(lambda v: int(v * 0.4))
        for i, (hero, ex, y0, dirn, hy) in enumerate((('shades', 'neutral', 500, 1, 250), ('smile', 'angry', 1000, -1, 200))):
            st = Image.new('RGB', (W, 420), (30, 14, 20)); d = ImageDraw.Draw(st, 'RGBA')
            for j in range(34):
                r = random.Random(j + i * 40); yy = r.random() * 420; xx = (r.random() * W * 1.6 - T * 1500 * dirn) % (W * 1.6) - W * 0.3
                d.line((xx, yy, xx + 200 + r.random() * 200, yy), fill=(255, 130, 60, 70), width=3)
            put_head(st, Cam(), hero, ex, 540 + dirn * (-170 + a * 70), hy, 600, glow=0.2)
            d.rectangle((0, 0, W, 6), fill=(255, 150, 80, 255)); d.rectangle((0, 414, W, 420), fill=(255, 150, 80, 255))
            fr.paste(st, (int(dirn * -W * (1 - eout(a / 0.14))), y0))
    return post(fr, T, bars=200, flash=max(0, 0.5 - abs(t - 1.85) * 6) if t >= 1.85 else 0)

# 3 — first arrow ------------------------------------------------------------
def draw_ecu(fr, d, T, tremble=1.0):
    """vector close-up of the drawn bow; d = draw amount 0..1"""
    fx = FX(); j = math.sin(T * 70) * 2.5 * d * tremble
    tipx = 700 - 80 * d; top, bot, ris = (tipx, 300 + j), (tipx, 1620 - j), (850, 960)
    nock = (lerp(700, 250, d) + j, 960)
    fx.line([(-120, 900), (830, 950)], (12, 10, 14, 255), 86)                 # bow arm
    fx.line([(-120, 878), (800, 928)], (150, 84, 52, 150), 5)
    limb = bez(top, (930, 600), ris) + bez(ris, (930, 1320), bot)
    fx.line(limb, (70, 38, 24, 255), 50); fx.line(limb, (126, 70, 40, 255), 36); fx.line([(x + 9, y) for x, y in limb], (190, 118, 70, 255), 8)
    fx.rect((818, 860, 886, 1060), (52, 30, 22, 255), 14)
    for yy in range(872, 1052, 22): fx.line([(820, yy), (884, yy + 8)], (96, 60, 40, 255), 4)
    fx.line([top, nock, bot], (236, 230, 220, 255), 5)
    if d > 0.02:
        fx.arrow(nock[0] + 800, 960, 0, 800, 15, (232, 232, 236))
        gl = max(0, 1 - abs(d - 0.9) * 8)
        if gl > 0: fx.star(nock[0] + 770, 950, 70 * gl, (255, 255, 255, 230))
    fx.circ(858, 960, 70, (10, 9, 12, 255), rx=62); fx.circ(874, 936, 30, (150, 84, 52, 90), rx=12)   # bow hand
    if d > 0.02:
        fx.line([(nock[0] - 30, 990), (nock[0] - 260, 1330), (-140, 1500)], (12, 10, 14, 255), 92)    # draw arm
        fx.circ(nock[0] - 20, 968, 62, (10, 9, 12, 255), rx=70); fx.circ(nock[0] + 14, 940, 26, (150, 84, 52, 100), rx=14)
    fx.flush(fr)
def S3(t, T):
    if t < 1.0:
        cam = Cam(700, 900, 1.5); fr = background(cam, T, blur=9)
        d = ease(t / 0.75) if t < 0.92 else 0.0
        put_head(fr, Cam(), 'shades', 'right', 150 - 30 * d, 760, 900, blur=5, glow=0.15)
        draw_ecu(fr, d, T)
        if t >= 0.92:
            fx = FX(); fx.speed(T, 0, n=30, alpha=200); fx.flush(fr)
        embers(fr, T, 30)
        return post(fr, T, bars=200, flash=max(0, 0.9 - (t - 0.92) * 14) if t >= 0.92 else 0)
    if t < 1.6:
        u = t - 1.0; cam = Cam(540, 940, lerp(1.0, 1.06, u / 0.6)).shake(T, 16 * max(0, 1 - abs(u - 0.2) / 0.2))
        fr = background(cam, T); fx = FX()
        duck = 0.10 * math.exp(-max(0, u - 0.1) * 7) * (1 if u > 0.1 else 0)
        put(fr, cam, 'smile_front', 540, GY + 90, 720, sq=(1 + duck * 0.5, 1 - duck), breathe=T)
        shot(fx, cam, (-500, GY - 655), (1700, GY - 670), u, 0.06, 0.1, hero='shades', L=230, wd=11, stick=False)
        if u > 0.1:
            a = u - 0.1
            for i in range(9):
                r = random.Random(i); hx, hy = cam.pt(500 + r.random() * 90 + a * (300 + r.random() * 500), GY - 620 - r.random() * 30 + a * a * 500)
                if a < 0.45: fx.line([(hx, hy), (hx + 16, hy - 7)], (16, 14, 18, int(255 * (1 - a / 0.45))), 4)
            fx.speed(T, 0, n=18, alpha=int(130 * max(0, 1 - a * 4)))
        fx.flush(fr); fog(fr, T, cam); embers(fr, T)
        return post(fr, T, flash=max(0, 0.6 - u * 8))
    u = t - 1.6; cam = Cam(610, 940, 1.3); fr = background(cam, T, blur=7)
    sc = 1 + 0.45 * (1 - eout(u / 0.18)); tr = math.sin(T * 48) * 4
    put_head(fr, Cam(), 'smile', 'shock', 540 + tr, 870, 880 * sc, glow=0.2)
    fx = FX(); sy = 560 + ease(u / 1.2) * 260; a = int(255 * clamp(u / 0.2) * (1 - clamp((u - 1.0) / 0.3)))
    fx.poly([(800, sy - 44), (826, sy + 12), (774, sy + 12)], (170, 220, 255, a)); fx.circ(800, sy + 12, 26, (170, 220, 255, a)); fx.circ(791, sy + 6, 8, (235, 248, 255, a))
    fx.flush(fr); embers(fr, T, 30)
    fr = post(fr, T, flash=max(0, 0.5 - u * 6))
    text(fr, 'ONE ARENA.', 540, 1590, 160, age=t - 2.0, T=T)
    return fr

# 4 — chaos begins ------------------------------------------------------------
def S4(t, T):
    c = min(3, int(t)); u = t - c; fx = FX(); whip = (1 - eout(u / 0.16)) * (760 if c % 2 else -760)
    if c == 0:
        cam = Cam(540 + whip, 960, 1.04).shake(T, 5); fr = background(cam, T); pillar(fr, cam, 960, 150, 520)
        put(fr, cam, BRO + '_crouch', 230, GY - 20, 330, age=u - 0.25 if u > 0.25 else None, amt=0.1)
        shot(fx, cam, (330, GY - 170), (975, GY - 360), u, 0.25, 0.16, seed=1); fx.flush(fr)
        runner(fr, cam, 'curls', lerp(-150, 1250, u), GY + 110, 600, T)
        for j in range(4): fx.dust(*cam.pt(lerp(-150, 1250, j * 0.25), GY + 110), u - j * 0.25, seed=j, sc=1.3)
    elif c == 1:
        cam = Cam(640 + whip, 960, 1.06).shake(T, 5); fr = background(cam, T); bx = lerp(1500, 900, eout(u))
        if u < 0.42: runner(fr, cam, 'beard', bx, GY + 10, 430, T, flip=True)
        else: put(fr, cam, 'beard_crouch', bx, GY + 10, 300, flip=True, age=u - 0.42, rot=-8); fx.dust(*cam.pt(bx + 60, GY + 10), u - 0.42, seed=5)
        shot(fx, cam, (640, GY - 150), (1900, GY - 300), u, 0.35, 0.2, L=170, wd=9, stick=False); fx.flush(fr)
        put(fr, cam, BRO + ('_crouch' if u < 0.35 else '_crouch'), 390, GY + 170, 700, age=u - 0.35 if u > 0.35 else None, amt=0.12)
    elif c == 2:
        mx = lerp(250, 1000, u); cam = Cam(mx + 130 + whip, 960, 1.05).shake(T, 6); fr = background(cam, T)
        runner(fr, cam, 'beard', mx - 440, GY + 70, 540, T)
        shot(fx, cam, (120, GY - 210), (1700, GY - 500), u, 0.28, 0.24, L=150, wd=8, stick=False); fx.flush(fr)
        if 0.45 <= u < 0.78: put(fr, cam, STUB + '_lookback', mx, GY + 90, 560, age=u - 0.45, flip=True)
        else: runner(fr, cam, STUB, mx, GY + 90, 560, T)
        for j in range(4): fx.dust(*cam.pt(lerp(250, 1000, j * 0.25) - 60, GY + 90), u - j * 0.25, seed=j + 9, sc=1.2)
    else:
        cam = Cam(540 + whip, 960, lerp(1.04, 1.12, u)).shake(T, 5); fr = background(cam, T)
        put(fr, cam, 'curls_crouch', 250, GY + 110, 390, age=u - 0.15 if u > 0.15 else None, amt=0.1)
        shot(fx, cam, (360, GY - 60), (1300, GY - 760), u, 0.15, 0.22, stick=False)
        v = clamp(u / 0.85); sx_ = lerp(120, 880, v); jy = math.sin(v * math.pi) * 430
        shot(fx, cam, (lerp(120, 880, 0.5) + 150, GY + 40 - 430 - 250), (1500, GY + 60), u, 0.42, 0.2, hero='shades', L=150, wd=8, stick=False); fx.flush(fr)
        put(fr, cam, 'shades_shooting' if v < 1 else 'shades_idle', sx_, GY + 60 - jy, 560, rot=lerp(16, -16, v) if v < 1 else 0, ground=GY + 60, pivot='center' if v < 1 else 'feet', age=u - 0.85 if u > 0.85 else None)
        fx.dust(*cam.pt(880, GY + 60), u - 0.85, seed=3, sc=1.4)
    fx.flush(fr); fog(fr, T, cam); embers(fr, T, 60)
    return post(fr, T, blurx=7 if abs(whip) > 110 else 0, flash=max(0, 0.3 - u * 4))

# 5 — character comedy -------------------------------------------------------
def S5(t, T):
    if 3.0 <= t < 3.6:
        u = t - 3.0; cam = Cam(900, 940, 1.5); fr = background(cam, T, blur=7)
        put_head(fr, Cam(), 'beard', 'angry', 540, 900, lerp(820, 930, u / 0.6), glow=0.2); embers(fr, T * 0.4, 30)
        return post(fr, T, bars=200, sat=0.9)
    if t >= 4.1:
        u = t - 4.1; cam = Cam(200, 940, 1.4); fr = background(cam, T, blur=7); sc = 1 + 0.35 * (1 - eout(u / 0.15))
        put_head(fr, Cam(), BRO, 'shock', 540 + math.sin(T * 50) * 5, 900, 860 * sc, glow=0.2); embers(fr, T, 30)
        return post(fr, T, flash=max(0, 0.4 - u * 6))
    if t >= 3.6:
        u = t - 3.6; cam = Cam(lerp(760, 730, u / 0.5), 900, lerp(1.0, 1.08, u / 0.5)); fr = background(cam, T)
        put(fr, cam, 'beard_aiming', 760, GY + 200, 840, flip=True, age=u, amt=0.2); fog(fr, T, cam); embers(fr, T)
        return post(fr, T, bars=200)
    fx = FX(); PX = 735
    if t < 2.1: cam = Cam(540, 960, 1.0)
    else: k = ease((t - 2.1) / 0.9); cam = Cam(lerp(540, 880, k), lerp(960, 1040, k), lerp(1.0, 1.55, k))
    if 1.5 < t < 1.9: cam.shake(T, 14 * (1 - (t - 1.5) / 0.4))
    fr = background(cam, T)
    pillar(fr, cam, PX, 38, GY - 440, base=GY + 40, post=True)
    kb, ab = pose(t, [(0, 'beard_back'), (2.25, 'beard_front34'), (2.55, 'beard_front')])
    put(fr, cam, kb, 930, GY + 40, 450, age=ab if t >= 2.25 else None, breathe=T, amt=0.08)
    kc, ac = pose(t, [(0, 'curls_idle'), (1.22, 'curls_crouch'), (1.95, 'curls_lookback')])
    hum = math.sin(T * 6) * 5 if t < 1.1 else 0
    put(fr, cam, kc, 500, GY + 70, 470 if kc != 'curls_crouch' else 300, flip=(kc == 'curls_crouch'), age=ac if t >= 1.22 else None, rot=hum, breathe=T, amt=0.24)
    kf, af = pose(t, [(0, BRO + '_idle'), (0.45, BRO + '_aiming'), (1.3, BRO + '_shooting')])
    put(fr, cam, kf, 170, GY + 70, 470, age=af if t >= 0.45 else None, breathe=T)
    age = shot(fx, cam, (330, GY - 240), (PX + 12, GY - 350), t, 1.3, 0.2, L=110, seed=4)
    fx.flush(fr); fog(fr, T, cam); embers(fr, T)
    return post(fr, T, flash=max(0, 0.35 - age * 5) if age >= 0 else 0)

# 6 — archery montage ---------------------------------------------------------
MONT = [(STUB + '_shooting', False, 'x', 300), ('curls_crouch', True, 'x', 900), ('beard_shooting', False, 'x', 1500),
        ('smile_shooting', True, 'x', 500), (BRO + '_shooting', False, 'x', 1100), ('shades_crouch', True, 'shades', 700)]
def target(fx, cam, wx, wy, r, wob=0.0):
    x, y = cam.pt(wx + wob, wy); z = cam.z; bx, by = cam.pt(wx, GY + 60)
    fx.line([(x - 60 * z, by), (x, y), (x + 60 * z, by)], (70, 44, 34, 255), 16 * z)
    for k, c in ((1.0, (226, 214, 190)), (0.8, (196, 44, 40)), (0.6, (226, 214, 190)), (0.4, (196, 44, 40)), (0.2, (250, 210, 90))):
        fx.circ(x, y, r * k * z, c + (255,), rx=r * k * z * 0.55)
def S6(t, T):
    fx = FX()
    if t < 3.0:
        c = min(5, int(t / 0.5)); u = (t - c * 0.5) / 0.5; key, flip, hero, cx = MONT[c]; dirn = -1 if flip else 1
        cam = Cam(cx, 940, lerp(1.14, 1.0, eout(u))).shake(T, 7); fr = background(cam, T)
        sl = W * (1 - eout(u / 0.25)) * dirn
        fx.poly([(sl - 200, 1500), (sl + W + 200, 1040), (sl + W + 200, 1260), (sl - 200, 1720)], (214, 50, 44, 150)); fx.flush(fr)
        big = 760 if 'crouch' in key else 1000
        rel = 0.3; rec = -dirn * 26 * math.exp(-max(0, u - rel) * 9) * (1 if u > rel else 0)
        put(fr, cam, key, cx - dirn * 60 + rec, GY + 330, big, flip=flip, age=u * 0.5, amt=0.14, shadow=False)
        shot(fx, cam, (cx + dirn * 250, GY - 300 if 'crouch' not in key else GY - 120), (cx + dirn * 1500, GY - 380), u, rel, 0.22, hero=hero, L=260, wd=13, stick=False)
        if u > rel: fx.speed(T, 0 if dirn > 0 else math.pi, n=16, alpha=int(150 * max(0, 1 - (u - rel) * 3)))
        fx.flush(fr); embers(fr, T, 60)
        return post(fr, T, flash=max(0, 0.55 - u * 5))
    u = t - 3.0; slow = u < 1.5
    ax = lerp(240, 700, u / 1.5) if slow else lerp(700, 1500, ein((u - 1.5) / 0.12)); hit = u - 1.62
    cam = Cam(ax + 60 if slow else lerp(760, 1340, ease((u - 1.5) / 0.22)), 900, lerp(1.22, 1.1, ease(u / 1.5)))
    if hit >= 0: cam.shake(T, 20 * max(0, 1 - hit / 0.3))
    fr = background(cam, T)
    put(fr, cam, STUB + '_shooting', 40, GY + 80, 540, blur=2)
    put(fr, cam, 'smile_crouch', 1040, GY + 80, 380, flip=True)
    wob = math.sin(hit * 50) * 14 * math.exp(-hit * 8) if hit >= 0 else 0
    target(fx, cam, 1560, GY - 400, 170, wob)
    sx, sy = cam.pt(min(ax, 1500) + wob, GY - 400 + (math.sin(u * 7) * 5 if slow else 0))
    fx.arrow(sx, sy, 0, 520 * cam.z, 17 * cam.z, spin=T * 5 if hit < 0 else 1.0, streak=(60 if slow else 700) * (0 if hit >= 0 else 1))
    if slow:
        for i in range(5): fx.line([(sx - 560 * cam.z - i * 46, sy - 30 + i * 15), (sx - 760 * cam.z - i * 46, sy - 30 + i * 15)], (255, 230, 200, 70), 3)
    if hit >= 0: fx.sparks(sx, sy, hit, 8, n=22, sc=1.6, dur=0.38)
    fx.flush(fr); fog(fr, T * (0.2 if slow else 1), cam); embers(fr, T * (0.12 if slow else 1), 70)
    return post(fr, T, bars=180 if slow else 0, sat=0.82 if slow else 1.0, flash=max(0, 0.7 - hit * 6) if hit >= 0 else 0)

# 7 — the six -----------------------------------------------------------------
def S7(t, T):
    cam = Cam(lerp(330, 2230, ease(t / 4.0)), 980, 1.0); fr = background(cam, T); fx = FX(); y = GY + 120; h = 620
    X = [230 + i * 420 for i in range(6)]
    put(fr, cam, 'shades_aiming', X[0], y, h, breathe=T)
    put(fr, cam, 'beard_front', X[1], y, h, breathe=T, rot=math.sin(T * 30) * 0.8)
    k, a = pose(t, [(0, 'smile_front34'), (1.2, 'smile_front')]); put(fr, cam, k, X[2], y, h, age=a if t >= 1.2 else None, breathe=T)
    k, a = pose(t, [(0, STUB + '_idle'), (2.1, STUB + '_aiming')]); put(fr, cam, k, X[3], y, h, age=a if t >= 2.1 else None, breathe=T)
    k, a = pose(t, [(0, 'curls_front34'), (2.7, 'curls_lookback')]); put(fr, cam, k, X[4], y, h, flip=True, age=a if t >= 2.7 else None, breathe=T)
    wx = X[5] + t * 55; put(fr, cam, BRO + '_walk', wx, y - abs(math.sin(T * 7)) * 14, h, rot=-3, ground=y)
    fx.flush(fr); fog(fr, T, cam); embers(fr, T)
    fr = post(fr, T)
    text(fr, 'SIX ARCHERS.', 540, 1630, 160, age=t - 2.0, T=T)
    return fr

# 8 — escalation --------------------------------------------------------------
def S8(t, T):
    fx = FX()
    if t >= 3.05:
        u = t - 3.05; cam = Cam(800, 940, 1.35).shake(T, 6); fr = background(cam, T, blur=6)
        for j in range(5):
            st = (j * 0.19) % 0.9; shot(fx, Cam(), ((-300, 300 + j * 230) if j % 2 else (W + 300, 380 + j * 200)), ((W + 300, 240 + j * 250) if j % 2 else (-300, 300 + j * 260)), u, st, 0.18, L=240, wd=12, stick=False, hero='shades' if j == 2 else 'x')
        fx.flush(fr); fr = fr.filter(ImageFilter.GaussianBlur(3))
        sc = 1 + 0.5 * (1 - eout(u / 0.16)); put_head(fr, Cam(), STUB, 'shock', 540 + math.sin(T * 46) * 4, 860, 860 * sc, glow=0.2); embers(fr, T, 40)
        fr = post(fr, T, flash=max(0, 0.5 - u * 6)); text(fr, 'ZERO CHILL.', 540, 1590, 160, age=u - 0.0, T=T); return fr
    cam = Cam(540, 960, 1.03).shake(T, 9); fr = background(cam, T)
    pillar(fr, cam, 20, 130, 560); pillar(fr, cam, 960, 130, 600)
    kb, ab = pose(t, [(0, 'beard_aiming'), (0.3, 'beard_shooting'), (0.9, 'beard_aiming'), (1.4, 'beard_shooting'), (2.0, 'beard_aiming'), (2.4, 'beard_shooting')])
    put(fr, cam, kb, 930, GY - 70, 360, flip=True, age=ab, amt=0.1)
    ks, as_ = pose(t, [(0, 'shades_aiming'), (0.9, 'shades_crouch'), (1.5, 'shades_aiming'), (2.0, 'shades_crouch')])
    put(fr, cam, ks, 150, GY - 70, 380 if 'aim' in ks else 300, age=as_, amt=0.1)
    for i, t0 in enumerate((0.3, 1.4, 2.4)): shot(fx, cam, (770, GY - 240), (-300, GY - 330 + i * 60), t, t0, 0.2, stick=False)
    for i, t0 in enumerate((0.9, 2.0)): shot(fx, cam, (300, GY - 190), (1400, GY - 420 + i * 150), t, t0, 0.2, hero='shades', stick=False)
    for j in range(7):
        r = random.Random(j * 5 + 1); st = r.random() * 2.8; y0 = GY - 600 + r.random() * 560
        shot(fx, cam, ((-300, y0) if j % 2 else (W + 300, y0)), ((W + 300, y0 + r.uniform(-150, 150)) if j % 2 else (-300, y0 + r.uniform(-150, 150))), t, st, 0.22, L=130, stick=False)
    shot(fx, cam, (30 + 65, GY - 300), (30 + 65, GY - 300), t, 0.0, 0.01, seed=2, spark=False)
    fx.flush(fr)
    kc, ac = pose(t, [(0, 'curls_crouch'), (0.6, 'curls_crouch'), (1.8, 'curls_crouch')])
    put(fr, cam, 'curls_crouch', 540, GY + 60, 320, flip=True, age=ac, amt=0.1)
    for t0 in (0.6, 1.8): shot(fx, cam, (430, GY - 60), (-300, GY - 180), t, t0, 0.2, stick=False)
    v = clamp(t / 2.3); sx_ = lerp(-140, 1260, v); jv = clamp((sx_ - 330) / 420); jy = math.sin(jv * math.pi) * 380 if 0 < jv < 1 else 0
    if jy > 0: put(fr, cam, 'smile_run', sx_, GY + 150 - jy, 440, rot=lerp(14, -22, jv), ground=GY + 150, pivot='center')
    elif v < 1: runner(fr, cam, 'smile', sx_, GY + 150, 440, T)
    fx.dust(*cam.pt(750, GY + 150), t - 1.36, seed=6, sc=1.3)
    kf, af = pose(t, [(0, BRO + '_aiming'), (2.2, BRO + '_shooting')])
    put(fr, cam, kf, 170, GY + 290, 430, age=af if t >= 2.2 else None, rot=lerp(0, 34, eout((t - 2.0) / 0.2)) if t >= 2.0 else 0, ground=GY + 290)
    age = shot(fx, cam, (250, GY - 150), (770, GY + 280), t, 2.2, 0.72, arc=700, L=120, seed=7)
    km, am = pose(t, [(0, STUB + '_aiming'), (2.93, STUB + '_front')])
    put(fr, cam, km, 900, GY + 290, 430, flip=(km != STUB + '_front'), age=am if t >= 2.93 else None, amt=0.26)
    fx.flush(fr); fog(fr, T, cam); embers(fr, T, 80)
    return post(fr, T, rot=math.sin(T * 4) * 1.3)

# 9 — hero moment -------------------------------------------------------------
def S9(t, T):
    if t >= 2.75: return Image.new('RGB', (W, H), (0, 0, 0))
    fx = FX()
    if t < 1.55:
        k = ease(t / 1.5); cam = Cam(lerp(420, 640, k), 900, lerp(1.0, 1.14, k)); fr = background(cam, T * 0.2)
        put(fr, cam, 'shades_aiming', 470, GY + 430, 1000, shadow=False, breathe=T * 0.4)
        gl = max(0, 1 - abs(t - 1.15) / 0.22)
        if gl > 0: gx, gy = cam.pt(300, GY - 395); fx.star(gx, gy, 150 * gl, (255, 255, 255, 240)); fx.star(gx, gy, 60 * gl, (255, 200, 140, 255))
        fx.flush(fr); fog(fr, T * 0.2, cam); embers(fr, T * 0.15, 80)
        return post(fr, T, bars=180, sat=0.72, rot=lerp(-3, 3, k), flash=max(0, 0.9 - (t - 1.5) * 18) if t >= 1.5 else 0)
    u = (t - 1.55) / 1.2; cam = Cam(700, 900, 1.3 + u * 0.5); fr = background(cam, T * 0.3, blur=8)
    r = 12 * math.exp(u * 4.6); cx, cy = 540 + math.sin(T * 30) * 5 * (1 - u), 930
    fx.radial(T, cx, cy, r * 1.3 + 60, n=54, alpha=160)
    for a in (0.5, 2.07, 3.64, 5.2): fx.line([(cx + math.cos(a) * r * 0.3, cy + math.sin(a) * r * 0.3), (cx + math.cos(a) * r * 1.5, cy + math.sin(a) * r * 1.5)], (232, 232, 236, 200), max(2, r * 0.1))
    fx.poly([(cx, cy - r), (cx + r * 0.6, cy), (cx, cy + r), (cx - r * 0.6, cy)], (190, 196, 206, 255))
    fx.poly([(cx, cy - r), (cx + r * 0.6, cy), (cx, cy)], (246, 248, 252, 255)); fx.poly([(cx, cy + r), (cx - r * 0.6, cy), (cx, cy)], (140, 146, 158, 255))
    fx.circ(cx, cy, r * 0.1, (60, 62, 70, 255)); fx.flush(fr)
    return post(fr, T, bars=180, sat=0.8, fade=1 - ein((u - 0.86) / 0.14))

# 10 — game reveal -------------------------------------------------------------
def S10(t, T):
    cam = Cam(540, 960, 1.0); fx = FX(); hit = t - 1.9
    if 0 <= hit < 0.3: cam.shake(T, 12 * (1 - hit / 0.3))
    fr = background(cam, T, moon=(540, 470))
    d0 = ImageDraw.Draw(fr)
    for px in (40, 720):
        d0.rectangle((px, GY - 60, px + 320, H), fill=(44, 30, 40)); d0.rectangle((px - 14, GY - 60, px + 334, GY - 22), fill=(92, 60, 60)); d0.rectangle((px - 14, GY - 22, px + 334, GY - 12), fill=(24, 16, 24))
        for yy in range(GY + 60, H, 110): d0.line((px, yy, px + 320, yy), fill=(30, 20, 30), width=4)
        d0.line((px + 314, GY - 12, px + 314, H), fill=(120, 62, 48), width=6)
    kf, af = pose(t, [(0, BRO + '_idle'), (0.4, BRO + '_aiming'), (1.4, BRO + '_shooting'), (2.2, BRO + '_idle')])
    put(fr, cam, kf, 200, GY - 60, 380, age=af if t >= 0.4 else None, breathe=T)
    rec = math.exp(-hit * 6) * math.sin(hit * 16) * 14 if hit >= 0 else 0
    put(fr, cam, 'curls_idle' if hit < 0 else 'curls_front', 880, GY - 60, 380, flip=hit < 0, rot=-rec, age=hit if hit >= 0 else None, breathe=T)
    P0, P1, ARC = (310, GY - 320), (868, GY - 360), 300
    aim = ease((t - 0.4) / 1.0); wob = (1 - aim) * 160
    if 0.4 <= t < 1.4:
        for i in range(1, 15):
            k = i / 24; x = lerp(P0[0], P1[0] - wob, k); y = lerp(P0[1], P1[1], k) - (ARC + wob * 0.5) * 4 * k * (1 - k)
            fx.circ(x, y, 7 - i * 0.25, (255, 255, 255, int(230 - i * 9)))
        jx, jy = 300, 1560; dx, dy = -150 * aim - 20, 120 * aim + 10
        fx.circ(jx, jy, 120, (255, 255, 255, 34)); fx.line([(jx, jy), (jx + dx, jy + dy)], (255, 190, 120, 200), 6); fx.circ(jx + dx, jy + dy, 46, (255, 255, 255, 150)); fx.circ(jx + dx, jy + dy, 34, (255, 190, 120, 230))
    age = shot(fx, cam, P0, P1, t, 1.4, 0.5, arc=ARC, L=95, wd=5, seed=3)
    hp = lerp(1.0, 0.45, eout(hit / 0.35)) if hit >= 0 else 1.0
    for x0, v, flip in ((60, 0.86, False), (600, hp, True)):
        fx.rect((x0, 300, x0 + 420, 344), (0, 0, 0, 170), 14)
        if flip: fx.rect((x0 + 416 - 412 * v, 304, x0 + 416, 340), (226, 60, 50, 255), 11)
        else: fx.rect((x0 + 4, 304, x0 + 4 + 412 * v, 340), (90, 210, 110, 255), 11)
    for i in range(3): fx.circ(506 + i * 34, 372, 9, (255, 190, 120, 255) if i == 0 else (255, 255, 255, 70))
    fx.flush(fr)
    for hero, cx in ((BRO, 104), ('curls', 976)):
        s = head_src(hero, 'smile' if hero == BRO or hit < 0 else 'shock'); s = s.resize((int(s.width * 84 / s.height), 84), LANC); fr.paste(s, (int(cx - s.width / 2), 196), s)
    d = ImageDraw.Draw(fr, 'RGBA'); d.text((160, 236), 'MOBILE', font=font(46), fill=(255, 255, 255, 240)); d.text((920 - d.textlength('CURLS', font=font(46)), 236), 'CURLS', font=font(46), fill=(255, 255, 255, 240))
    d.text((540 - d.textlength('ROUND 1', font=font(34)) / 2, 246), 'ROUND 1', font=font(34), fill=(255, 190, 120, 255))
    if 0.4 <= t < 1.4: d.text((470, 1530), 'ANGLE %d°   POWER %d%%' % (int(lerp(22, 41, aim)), int(lerp(40, 86, aim))), font=font(34, ARIALB), fill=(255, 255, 255, 210))
    fog(fr, T, cam, k=0.6); embers(fr, T, 36)
    fr = post(fr, T, fade=clamp(t / 0.3), flash=max(0, 0.45 - hit * 6) if hit >= 0 else 0)
    if hit >= 0:
        text(fr, 'HEADSHOT!', 800, 760 - eout(hit / 0.6) * 40, 84, fill=(255, 214, 90, 255), age=hit, T=T, stroke=5, alpha=1 - clamp((hit - 0.8) / 0.25))
        text(fr, '-55', 900, 900 - eout(hit / 0.8) * 110, 70, fill=(255, 90, 80, 255), age=hit - 0.05, T=T, stroke=5, slam=0.2, alpha=1 - clamp((hit - 0.7) / 0.25))
    return fr

# 11 — title -------------------------------------------------------------------
ROW = ['curls', 'beard', 'shades', 'smile', BRO, STUB]
def S11(t, T):
    cam = Cam(540, 960, 1.0); hit = t - 0.72; fx = FX()
    if 0 <= hit < 0.45: cam.shake(T, 18 * (1 - hit / 0.45))
    if 1.1 <= t < 1.4: cam.shake(T, 12 * (1 - (t - 1.1) / 0.3))
    fr = background(cam, T, moon=(540, 600))
    GROUP = [('curls', 190, 0), ('shades', 540, 0), (STUB, 890, 0), ('beard', 185, 1), ('smile', 540, 1), (BRO, 895, 1)]
    for i, (hero, x, front) in enumerate(GROUP):
        wy = GY + (330 if front else 40); h = 520 if front else 450
        j = math.sin(clamp((hit - i * 0.03) / 0.36) * math.pi) * (70 + (i * 37 % 40)) if hit > 0 and hero != 'shades' else 0
        if hero == 'shades': k, a = pose(t, [(0, 'shades_front'), (0.3, 'shades_aiming'), (1.3, 'shades_front')]); put(fr, cam, k, x + (60 if 'aim' in k else 0), wy, h + 30, age=a if t >= 0.3 else None, breathe=T)
        else: put(fr, cam, hero + '_front', x, wy - j, h, ground=wy, age=hit - 0.36 - i * 0.03 if hit > 0.36 else None, breathe=T, amt=0.2)
    shot(fx, cam, (760, GY - 250), (1500, GY - 330), t, 0.5, 0.12, hero='shades', stick=False)
    fx.dust(1060, cam.pt(0, GY + 100)[1], hit, seed=2, sc=3.0); fx.dust(1040, cam.pt(0, GY - 60)[1], hit - 0.05, seed=4, sc=2.4)
    fx.flush(fr); fog(fr, T, cam); embers(fr, T, 70)
    fr = post(fr, T, flash=max(0, 0.8 - (t - 1.1) * 6) if t >= 1.1 else 0)
    if t >= 1.1:
        a = t - 1.1; text(fr, 'STICKCHERS', 540, 560, 190, fill=(255, 236, 214, 255), age=a, T=T, stroke=10, slam=0.8)
        k = eout(a / 0.3); d = ImageDraw.Draw(fr); d.rectangle((540 - 430 * k, 676, 540 + 430 * k, 686), fill=(220, 60, 50))
        f2 = FX(); f2.arrow(540 + 470 * k, 681, 0, 150, 7); f2.flush(fr) if a > 0.05 else None
    text(fr, 'AIM.  SHOOT.  SURVIVE.', 540, 770, 62, age=t - 1.8, T=T, stroke=4, slam=0.25, track=3)
    if t >= 2.4:
        a = t - 2.4; d = ImageDraw.Draw(fr, 'RGBA'); k = eout(a / 0.25)
        d.rounded_rectangle((540 - 250 * k, 1730, 540 + 250 * k, 1838), 54, outline=(255, 190, 120, int(255 * k)), width=5)
        text(fr, 'COMING SOON', 540, 1781, 70, fill=(255, 190, 120, 255), age=a, T=T, stroke=3, slam=0.2, track=4)
    return fr

SHOTS = [(0.0, 3.5, S1), (3.5, 7.0, S2), (7.0, 10.0, S3), (10.0, 14.0, S4), (14.0, 18.5, S5), (18.5, 23.5, S6),
         (23.5, 27.5, S7), (27.5, 31.5, S8), (31.5, 34.5, S9), (34.5, 37.5, S10), (37.5, 41.0, S11)]
DUR = 41.0
def frame(T):
    for a, b, f in SHOTS:
        if a <= T < b: return f(T - a, T)
    return Image.new('RGB', (W, H), (0, 0, 0))
