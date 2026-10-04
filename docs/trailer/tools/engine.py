"""Rendering engine for the Stickchers launch trailer: parallax arena, rim-lit cut-out
characters from archer-boys.pdf, vector arrows and effects, and film post-processing."""
import math, random, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
W, H, FPS = 1080, 1920, 30
GY = 1300                       # world y of the ground line the characters stand around
HERE = os.path.dirname(os.path.abspath(__file__))
REFS = os.path.join(HERE, '..', 'refs')
FACES = os.path.join(HERE, '..', '..', '..', 'assets', 'faces')
IMPACT = '/System/Library/Fonts/Supplemental/Impact.ttf'
ARIALB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
LANC = Image.LANCZOS

def lerp(a, b, x): return a + (b - a) * x
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x): x = clamp(x); return x * x * (3 - 2 * x)
def eout(x): x = clamp(x); return 1 - (1 - x) ** 3
def ein(x): x = clamp(x); return x ** 3
def pose(t, keys):
    """keys: [(start, name), ...] -> (name, seconds since that pose began)"""
    cur = keys[0]
    for k in keys:
        if t >= k[0]: cur = k
    return cur[1], t - cur[0]
def pop(age, amt=0.16):
    """squash-and-stretch overshoot after a pose change -> (sx, sy)"""
    if age is None or age < 0: return 1.0, 1.0
    k = amt * math.exp(-age * 9) * math.cos(age * 24)
    return 1 - k * 0.6, 1 + k
def font(sz, f=IMPACT): return ImageFont.truetype(f, int(sz))

class Cam:
    def __init__(s, x=540, y=960, z=1.0, rot=0.0, sx=0.0, sy=0.0):
        s.x, s.y, s.z, s.rot, s.sx, s.sy = x, y, z, rot, sx, sy
    def pt(s, wx, wy):
        return ((wx - s.x) * s.z + W / 2 + s.sx, (wy - s.y) * s.z + H / 2 + s.sy)
    def shake(s, T, amp, seed=0.0):
        s.sx += math.sin(T * 61 + seed) * amp + math.sin(T * 37 + seed * 2) * amp * 0.5
        s.sy += math.cos(T * 53 + seed) * amp
        return s

# ------------------------------------------------------------------ arena
_L = {}
def _layers():
    if _L: return _L
    rnd = random.Random(7)
    SKH = H + 1400
    col = Image.new('RGB', (1, SKH)); hz = 700 + GY - 140
    top, mid, hor = (6, 6, 16), (30, 14, 34), (104, 40, 28)
    for y in range(SKH):
        k = clamp(y / hz)
        c = [lerp(top[i], mid[i], k / 0.6) if k < 0.6 else lerp(mid[i], hor[i], ((k - 0.6) / 0.4) ** 1.6) for i in range(3)]
        col.putpixel((0, y), tuple(int(v) for v in c))
    sky = col.resize((W, SKH)); d = ImageDraw.Draw(sky)
    for i in range(260):
        x, y = rnd.random() * W, rnd.random() * (hz - 500); b = int(90 + rnd.random() * 150); r = rnd.choice([1, 1, 1, 2])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(b, b, int(b * 0.9)))
    _L['sky'] = sky
    yy, xx = np.mgrid[0:900, 0:900]; rr = np.hypot(xx - 450, yy - 450) / 445.0
    gl = np.clip(1 - rr, 0, 1) ** 1.7; noise = np.random.RandomState(5).uniform(-0.5, 0.5, (900, 900, 1))   # dither hides banding
    m = Image.fromarray(np.clip(gl[..., None] * np.array([118, 40, 24]) + noise, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(m)
    d.ellipse((250, 250, 650, 650), fill=(214, 96, 52)); d.ellipse((276, 262, 560, 520), fill=(228, 116, 64))
    for cx, cy, r in ((520, 520, 46), (420, 580, 26), (560, 400, 30), (350, 420, 18)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(196, 84, 46))
    _L['moon'] = m.filter(ImageFilter.GaussianBlur(1.2))
    # far ruins (parallax 0.25)
    FW = W + 900; far = Image.new('RGBA', (FW, H), (0, 0, 0, 0)); d = ImageDraw.Draw(far); base = GY - 130
    x = -40
    while x < FW:
        w = rnd.randint(50, 130); h = rnd.randint(120, 520); c = (38 + rnd.randint(0, 8), 20, 30, 255)
        d.rectangle((x, base - h, x + w, base + 10), fill=c)
        if rnd.random() < 0.6: d.rectangle((x - 12, base - h, x + w + 12, base - h + 22), fill=c)
        if rnd.random() < 0.3:
            w2 = rnd.randint(140, 240); d.rectangle((x + w, base - h + 30, x + w + w2, base - h + 70), fill=c)
            d.pieslice((x + w - 10, base - h + 60, x + w + w2 + 10, base - h + 60 + w2), 180, 360, fill=(0, 0, 0, 0))
        x += w + rnd.randint(30, 150)
    _L['far'] = far
    # mid pillars with torches (parallax 0.6)
    MW = W + 2100; midl = Image.new('RGBA', (MW, H), (0, 0, 0, 0)); d = ImageDraw.Draw(midl); base = GY - 50; torches = []
    x = 60
    while x < MW - 100:
        w = rnd.randint(90, 150); h = rnd.randint(380, 760); c = (22, 14, 24, 255)
        d.rectangle((x, base - h, x + w, base + 20), fill=c)
        d.rectangle((x - 16, base - h, x + w + 16, base - h + 30), fill=(28, 18, 30, 255))
        d.rectangle((x - 12, base - 8, x + w + 12, base + 20), fill=(28, 18, 30, 255))
        d.line((x + w - 4, base - h + 30, x + w - 4, base - 8), fill=(120, 58, 40, 255), width=5)
        for yy in range(base - h + 80, base - 20, 90): d.line((x, yy, x + w - 8, yy), fill=(14, 9, 16, 255), width=3)
        if rnd.random() < 0.7:
            tx, ty = x + w // 2, base - min(h - 60, 330)
            d.rectangle((tx - 5, ty, tx + 5, ty + 46), fill=(60, 36, 28, 255))
            d.polygon([(tx - 13, ty), (tx + 13, ty), (tx, ty - 40)], fill=(255, 170, 60, 255))
            d.polygon([(tx - 6, ty), (tx + 6, ty), (tx, ty - 22)], fill=(255, 236, 170, 255))
            torches.append((tx, ty - 14))
        x += w + rnd.randint(260, 520)
    _L['mid'] = midl; _L['torches'] = torches
    # ground
    g = Image.new('RGB', (1, H)); g0, g1 = (64, 36, 42), (10, 8, 14)
    for y in range(H):
        k = clamp(y / 620) ** 0.8; g.putpixel((0, y), tuple(int(lerp(g0[i], g1[i], k)) for i in range(3)))
    g = g.resize((W, H)); d = ImageDraw.Draw(g)
    y = 6.0; step = 10.0
    while y < H:
        d.line((0, y, W, y), fill=(28, 18, 26), width=2); step *= 1.22; y += step
    _L['ground'] = g
    hz_img = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(hz_img)
    d.ellipse((-300, GY - 560, W + 300, GY + 120), fill=(84, 38, 26))
    d.ellipse((240, GY - 60, W + 200, GY + 420), fill=(40, 18, 14))
    _L['haze'] = hz_img.filter(ImageFilter.GaussianBlur(130))
    f = Image.new('RGB', (2 * W, 520), (0, 0, 0)); d = ImageDraw.Draw(f)
    for i in range(18):
        x, y, r = rnd.random() * 2 * W, 120 + rnd.random() * 280, 120 + rnd.random() * 240
        for xx in (x, x - 2 * W, x + 2 * W): d.ellipse((xx - r * 2, y - r * 0.4, xx + r * 2, y + r * 0.4), fill=(52, 26, 22))
    _L['fog'] = f.filter(ImageFilter.GaussianBlur(60))
    rad = Image.new('L', (256, 256), 0); px = rad.load()
    for yy in range(256):
        for xx in range(256):
            r = math.hypot(xx - 127.5, yy - 127.5) / 127.5; px[xx, yy] = int(255 * max(0, 1 - r) ** 2.2)
    _L['rad'] = rad
    vg = Image.new('L', (W, H), 0); ImageDraw.Draw(vg).ellipse((-300, -180, W + 300, H + 180), fill=255)
    vg = vg.filter(ImageFilter.GaussianBlur(240)).point(lambda v: int(60 + v * 195 / 255)); _L['vig'] = Image.merge('RGB', [vg] * 3)
    _L['grain'] = np.random.RandomState(3).normal(0, 1, (H + 64, W + 64)).astype(np.float32)
    return _L

def add_glow(fr, x, y, r, colr, k=1.0):
    r = int(r)
    if r < 4 or x < -r or x > W + r or y < -r or y > H + r: return
    box = (int(x - r), int(y - r), int(x + r), int(y + r)); g = _layers()['rad'].resize((2 * r, 2 * r))
    lay = Image.merge('RGB', [g.point(lambda v, c=c: int(v * c * k / 255)) for c in colr])
    fr.paste(ImageChops.add(fr.crop(box), lay), box)

def background(cam, T, blur=0, moon=(800, 520)):
    L = _layers(); dy = int(960 - cam.y)
    fr = L['sky'].crop((0, 700 - dy, W, 700 - dy + H)).copy()
    mx, my = moon[0] - cam.x * 0.04, moon[1] + dy
    box = (int(mx - 450), int(my - 450), int(mx + 450), int(my + 450)); fr.paste(ImageChops.add(fr.crop(box), L['moon']), box)
    fr.paste(L['far'], (-int((cam.x + 400) * 0.25) % -900 if False else -int(clamp((cam.x + 400) * 0.25, 0, 900)), dy), L['far'])
    if dy == 0: fr = ImageChops.add(fr, L['haze'])
    else: fr = ImageChops.add(fr, ImageChops.offset(L['haze'], 0, 0).transform((W, H), Image.AFFINE, (1, 0, 0, 0, 1, -dy)))
    gy = GY - 140 + dy
    if gy < H:
        fr.paste(L['ground'].crop((0, 0, W, H - max(0, gy))), (0, max(0, gy)))
        d = ImageDraw.Draw(fr)
        for k in range(-9, 10):
            bx = W / 2 + (k * 300 - (cam.x % 300)) * 4.2
            d.line((W / 2 + (bx - W / 2) * 0.02, gy, bx, gy + 700), fill=(30, 19, 27), width=2)
    mxo = -int(clamp((cam.x + 400) * 0.6, 0, 2100)); fr.paste(L['mid'], (mxo, dy), L['mid'])
    for i, (tx, ty) in enumerate(L['torches']):
        fl = 0.8 + 0.2 * math.sin(T * 13 + i * 2.1) * math.sin(T * 7.3 + i)
        add_glow(fr, tx + mxo, ty + dy, 210 * fl, (255, 140, 60), 0.75 * fl)
    if blur: fr = fr.filter(ImageFilter.GaussianBlur(blur))
    z = cam.z
    if z != 1.0 or cam.sx or cam.sy:
        fr = fr.transform((W, H), Image.AFFINE, (1 / z, 0, W / 2 - (W / 2 + cam.sx) / z, 0, 1 / z, H / 2 - (H / 2 + cam.sy) / z), resample=Image.BILINEAR)
    return fr

def fog(fr, T, cam, k=1.0, y=GY - 330):
    f = _layers()['fog']; x = int((T * 26 + cam.x * 0.9) % (W)); sy = int(cam.pt(0, y)[1])
    band = f.crop((x, 0, x + W, 520))
    if k != 1.0: band = band.point(lambda v: int(v * k))
    box = (0, sy, W, sy + 520); fr.paste(ImageChops.add(fr.crop(box), band), box)

def embers(fr, T, n=46, speed=1.0, drift=0.0):
    d = ImageDraw.Draw(fr, 'RGBA')
    for i in range(n):
        r = random.Random(i * 977); x = r.random() * W; sp = (50 + r.random() * 110) * speed; ph = r.random() * H
        y = H - ((T * sp + ph) % H); x = (x + math.sin(T * 1.3 * speed + i) * 26 + drift * (0.4 + r.random())) % W; s = 1.5 + r.random() * 3.2
        a = int((110 + 120 * r.random()) * (0.6 + 0.4 * math.sin(T * 9 + i)))
        d.ellipse((x - s * 2.4, y - s * 2.4, x + s * 2.4, y + s * 2.4), fill=(255, 120, 40, a // 5))
        d.ellipse((x - s, y - s, x + s, y + s), fill=(255, 170 + int(r.random() * 60), 80, a))

def pillar(fr, cam, wx, w, top, base=GY + 70, post=False):
    d = ImageDraw.Draw(fr); x0, y0 = cam.pt(wx, top); x1, y1 = cam.pt(wx + w, base); z = cam.z
    if post:
        d.rectangle((x0, y0, x1, y1), fill=(58, 36, 30)); d.line((x1 - 3 * z, y0, x1 - 3 * z, y1), fill=(150, 84, 52), width=max(2, int(4 * z)))
        d.rectangle((x0 - 4 * z, y0 - 8 * z, x1 + 4 * z, y0 + 6 * z), fill=(70, 44, 34)); return
    d.rectangle((x0, y0, x1, y1), fill=(24, 15, 26))
    d.rectangle((x0 - 20 * z, y0, x1 + 20 * z, y0 + 36 * z), fill=(32, 20, 32))
    d.rectangle((x0 - 14 * z, y1 - 26 * z, x1 + 14 * z, y1), fill=(32, 20, 32))
    d.line((x1 - 5 * z, y0 + 36 * z, x1 - 5 * z, y1 - 26 * z), fill=(140, 66, 44), width=max(2, int(7 * z)))
    yy = y0 + 110 * z
    while yy < y1 - 40 * z: d.line((x0, yy, x1 - 10 * z, yy), fill=(15, 10, 17), width=max(1, int(3 * z))); yy += 100 * z

# ------------------------------------------------------------------ characters
_SRC = {}
def src(key):
    if key not in _SRC:
        im = Image.open(os.path.join(REFS, key + '.png')).convert('RGBA')
        im.putalpha(im.split()[3].filter(ImageFilter.MinFilter(3)))      # trim the pale cut-out fringe
        _SRC[key] = im
    return _SRC[key]
TILE = dict(smile=0, neutral=1, angry=2, laugh=3, shock=4, right=5, back=6, left=7)
# two atlases were cut in a different expression order
TILE_X = dict(fade=dict(smile=0, angry=1, laugh=2, shock=3, neutral=4), beard=dict(neutral=0, smile=0, angry=1, laugh=3, shock=4))
def head_src(hero, expr):
    key = 'head:%s:%s' % (hero, expr)
    if key not in _SRC:
        from scipy import ndimage as ndi
        i = TILE_X.get(hero, {}).get(expr, TILE[expr]); at = Image.open(os.path.join(FACES, 'hero_%s.png' % hero)).convert('RGBA')
        t = at.crop(((i % 4) * 512, (i // 4) * 512, (i % 4) * 512 + 512, (i // 4) * 512 + 512)); a = np.asarray(t)[..., 3] > 40
        lab, n = ndi.label(a); sizes = ndi.sum(a, lab, range(1, n + 1)); keep = lab == (1 + int(np.argmax(sizes)))
        arr = np.asarray(t).copy(); arr[..., 3] = np.where(keep, arr[..., 3], 0); ys, xs = np.where(keep)
        _SRC[key] = Image.fromarray(arr).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return _SRC[key]

def lit(im, glow=0.2, rim=0.75, dark=1.0):
    """adds the warm moon rim light, a cool fill edge and a soft back glow; returns (sprite, pad)"""
    pad = max(10, int(im.height * 0.07)); big = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0)); big.paste(im, (pad, pad))
    a = big.split()[3]; e = max(1, int(im.height / 260))
    warm = ImageChops.subtract(a, ImageChops.offset(a, -e * 2, e)).filter(ImageFilter.GaussianBlur(e * 0.6))
    cool = ImageChops.subtract(a, ImageChops.offset(a, e, 0))
    body = big
    if dark != 1.0:
        r, g, b, aa = big.split(); body = Image.merge('RGBA', [c.point(lambda v: int(v * dark)) for c in (r, g, b)] + [aa])
    wl = Image.new('RGBA', big.size, (255, 168, 92, 0)); wl.putalpha(warm.point(lambda v: int(min(255, v * 1.3) * rim)))
    cl = Image.new('RGBA', big.size, (120, 120, 190, 0)); cl.putalpha(cool.point(lambda v: int(v * 0.28)))
    body = Image.alpha_composite(Image.alpha_composite(body, cl), wl)
    if glow:
        g = Image.new('RGBA', big.size, (255, 140, 70, 0)); g.putalpha(a.filter(ImageFilter.GaussianBlur(pad * 0.5)).point(lambda v: int(v * glow)))
        body = Image.alpha_composite(g, body)
    return body, pad

def _place(fr, im, pad, sx, sy, rot, pivot_feet, blur, alpha):
    """paste sprite so its feet-centre (or centre) sits at screen (sx, sy)"""
    w, h = im.size; hh = (h - 2 * pad) / 2.0
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    if rot:
        im = im.rotate(rot, expand=True, resample=Image.BICUBIC); th = math.radians(rot)
        ax, ay = (hh * math.sin(th), hh * math.cos(th)) if pivot_feet else (0, 0)
    else: ax, ay = (0, hh) if pivot_feet else (0, 0)
    if alpha < 1: im.putalpha(im.split()[3].point(lambda v: int(v * alpha)))
    fr.paste(im, (int(sx - ax - im.width / 2), int(sy - ay - im.height / 2)), im)

def put(fr, cam, key, wx, wy, h, flip=False, rot=0, age=None, breathe=None, sq=(1, 1), ground=None, shadow=True,
        blur=0, alpha=1.0, pivot='feet', glow=0.24, amt=0.16):
    z = cam.z; px, py = pop(age, amt); bs = 1 + (0.012 * math.sin(breathe * 2.6 + wx) if breathe is not None else 0)
    hp = max(8, int(h * z * py * sq[1] * bs)); s = src(key); wp = max(4, int(s.width * h * z / s.height * px * sq[0]))
    im = s.resize((wp, hp), LANC)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if hp > s.height * 1.15: im = im.filter(ImageFilter.UnsharpMask(2, 70, 2))
    sx, sy = cam.pt(wx, wy)
    if shadow:
        gx, gy = cam.pt(wx, wy if ground is None else ground); lift = 0 if ground is None else clamp((ground - wy) / 500)
        sw = wp * (0.42 - 0.2 * lift); d = ImageDraw.Draw(fr, 'RGBA')
        d.ellipse((gx - sw, gy - hp * 0.03, gx + sw, gy + hp * 0.03), fill=(0, 0, 0, int(130 * (1 - 0.6 * lift))))
    im, pad = lit(im, glow=glow)
    _place(fr, im, pad, sx, sy, rot, pivot == 'feet', blur, alpha)

def put_head(fr, cam, hero, expr, wx, wy, size, rot=0, flip=False, blur=0, alpha=1.0, glow=0.3, sq=(1, 1)):
    """head centred at world (wx, wy); size = world height"""
    s = head_src(hero, expr); hp = max(8, int(size * cam.z * sq[1])); wp = max(8, int(s.width * size * cam.z / s.height * sq[0]))
    im = s.resize((wp, hp), LANC)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if hp > s.height * 1.15: im = im.filter(ImageFilter.UnsharpMask(3, 80, 2))
    im, pad = lit(im, glow=glow); sx, sy = cam.pt(wx, wy)
    _place(fr, im, pad, sx, sy, rot, False, blur, alpha)

def runner(fr, cam, hero, wx, wy, h, T, flip=False, rate=9.0, **kw):
    """two-frame run cycle with bob and forward lean"""
    ph = T * rate; key = hero + ('_run' if int(ph) % 2 == 0 else '_walk'); bob = abs(math.sin(ph * math.pi)) * h * 0.05
    put(fr, cam, key, wx, wy - bob, h, flip=flip, rot=(6 if flip else -6), ground=wy, **kw)

# ------------------------------------------------------------------ vector effects (2x supersampled layer)
class FX:
    S = 2
    def __init__(s): s.im = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im); s.used = False
    def flush(s, fr):
        if s.used:
            lay = s.im.resize((W, H), Image.BILINEAR); fr.paste(lay, (0, 0), lay)
            s.im = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im); s.used = False
    def line(s, pts, fill, width): s.used = True; s.d.line([(x * 2, y * 2) for x, y in pts], fill=fill, width=max(1, int(width * 2)), joint='curve')
    def poly(s, pts, fill): s.used = True; s.d.polygon([(x * 2, y * 2) for x, y in pts], fill=fill)
    def circ(s, x, y, r, fill, rx=None): s.used = True; rx = r if rx is None else rx; s.d.ellipse(((x - rx) * 2, (y - r) * 2, (x + rx) * 2, (y + r) * 2), fill=fill)
    def rect(s, box, fill, rad=0):
        s.used = True; b = [v * 2 for v in box]
        s.d.rounded_rectangle(b, rad * 2, fill=fill) if rad else s.d.rectangle(b, fill=fill)
    def arrow(s, tx, ty, ang, L, wd, fletch=(206, 40, 40), spin=None, alpha=255, streak=0):
        """arrow with its tip at screen (tx, ty) pointing along ang"""
        ux, uy = math.cos(ang), math.sin(ang); nx, ny = -uy, ux; bx, by = tx - ux * L, ty - uy * L
        if streak > 0:
            for i in range(7):
                a = int(90 * (1 - i / 7)); s.line([(bx - ux * streak * i / 7, by - uy * streak * i / 7), (bx - ux * streak * (i + 1) / 7, by - uy * streak * (i + 1) / 7)], (255, 226, 196, a), wd * 0.7)
        hl = wd * 3.6
        s.line([(bx, by), (tx - ux * hl * 0.6, ty - uy * hl * 0.6)], (98, 54, 30, alpha), wd)
        s.line([(bx - nx * wd * 0.2, by - ny * wd * 0.2), (tx - ux * hl - nx * wd * 0.2, ty - uy * hl - ny * wd * 0.2)], (178, 112, 66, alpha), wd * 0.4)
        s.poly([(tx, ty), (tx - ux * hl + nx * hl * 0.42, ty - uy * hl + ny * hl * 0.42), (tx - ux * hl * 0.72, ty - uy * hl * 0.72), (tx - ux * hl - nx * hl * 0.42, ty - uy * hl - ny * hl * 0.42)], (214, 220, 230, alpha))
        s.poly([(tx, ty), (tx - ux * hl + nx * hl * 0.42, ty - uy * hl + ny * hl * 0.42), (tx - ux * hl * 0.72, ty - uy * hl * 0.72)], (246, 248, 252, alpha))
        fl = L * 0.2
        for side, ph in ((1, 0.0), (-1, math.pi / 2)):
            k = 1.0 if spin is None else 0.25 + 0.75 * abs(math.cos(spin + ph)); fw = wd * 1.7 * k * side
            s.poly([(bx + ux * fl * 1.15, by + uy * fl * 1.15), (bx + ux * fl * 0.8 + nx * fw, by + uy * fl * 0.8 + ny * fw), (bx - ux * fl * 0.1 + nx * fw, by - uy * fl * 0.1 + ny * fw), (bx + ux * fl * 0.08, by + uy * fl * 0.08)], fletch + (alpha,))
    def sparks(s, x, y, age, seed=0, n=14, colr=(255, 200, 120), sc=1.0, dur=0.4):
        if age < 0 or age > dur: return
        for i in range(n):
            r = random.Random(seed * 131 + i); a = r.random() * 6.283; v = (260 + r.random() * 640) * sc
            px, py = x + math.cos(a) * v * age, y + math.sin(a) * v * age + 900 * age * age * sc
            qx, qy = px - math.cos(a) * v * 0.035, py - math.sin(a) * v * 0.035
            s.line([(qx, qy), (px, py)], colr + (int(255 * (1 - age / dur)),), 3.5 * sc)
    def dust(s, x, y, age, seed=0, sc=1.0, dur=0.55):
        if age < 0 or age > dur: return
        for i in range(6):
            r = random.Random(seed * 17 + i); dx = (r.random() - 0.5) * 150 * sc * eout(age / dur); dy = -r.random() * 60 * sc * eout(age / dur)
            rr = (10 + r.random() * 20) * sc * (0.5 + age / dur); s.circ(x + dx, y + dy, rr, (150, 110, 100, int(120 * (1 - age / dur))))
    def speed(s, T, ang=0.0, n=26, alpha=120, colr=(255, 230, 200), seed=0, length=420):
        ux, uy = math.cos(ang), math.sin(ang)
        for i in range(n):
            r = random.Random(int(T * 30) * 53 + i + seed); x, y = r.random() * W, r.random() * H; L = (0.4 + r.random()) * length
            s.line([(x, y), (x + ux * L, y + uy * L)], colr + (int(alpha * r.random()),), 2 + r.random() * 3)
    def radial(s, T, cx, cy, r0, n=40, alpha=130, colr=(255, 230, 200)):
        for i in range(n):
            r = random.Random(int(T * 30) * 31 + i); a = r.random() * 6.283; r1 = r0 * (1 + r.random() * 0.5); r2 = r1 + 200 + r.random() * 900
            s.line([(cx + math.cos(a) * r1, cy + math.sin(a) * r1), (cx + math.cos(a) * r2, cy + math.sin(a) * r2)], colr + (int(alpha * r.random()),), 3 + r.random() * 5)
    def star(s, x, y, r, colr=(255, 255, 255, 255)):
        s.poly([(x, y - r), (x + r * 0.16, y - r * 0.16), (x + r, y), (x + r * 0.16, y + r * 0.16), (x, y + r), (x - r * 0.16, y + r * 0.16), (x - r, y), (x - r * 0.16, y - r * 0.16)], colr)

FLETCH = dict(shades=(232, 232, 236))
def shot(fx, cam, p0, p1, t, t0, dur, hero='x', arc=0.0, L=120, wd=6, stick=True, seed=0, spark=True):
    """one arrow flying from world p0 to p1; returns seconds since impact (negative before)"""
    if t < t0: return t - (t0 + dur)
    u = clamp((t - t0) / dur); fl = FLETCH.get(hero, (206, 40, 40)); z = cam.z
    def P(u): return lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) - arc * 4 * u * (1 - u)
    x, y = P(u); x2, y2 = P(min(1, u + 0.02)) if u < 0.98 else P(1); x1, y1 = P(max(0, u - 0.02)) if u >= 0.98 else (x, y)
    ang = math.atan2(y2 - y1, x2 - x1); age = t - (t0 + dur); sx, sy = cam.pt(x, y)
    if u < 1: fx.arrow(sx, sy, ang, L * z, wd * z, fl, streak=260 * z)
    elif stick:
        ang += math.radians(9) * math.exp(-age * 9) * math.sin(age * 46); fx.arrow(sx, sy, ang, L * z, wd * z, fl)
        if spark: fx.sparks(sx, sy, age, seed, sc=z)
    return age

# ------------------------------------------------------------------ text and post
_TXT = {}
def text_img(s, size, fill, stroke=7, f=IMPACT, track=0):
    k = (s, size, fill, stroke, f, track)
    if k not in _TXT:
        fo = font(size, f); tmp = ImageDraw.Draw(Image.new('RGBA', (4, 4)))
        ws = [tmp.textlength(c, font=fo) + track for c in s]; tw = int(sum(ws)) + stroke * 4 + 30; th = int(size * 1.5) + stroke * 4
        im = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); sh = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); d = ImageDraw.Draw(im); ds = ImageDraw.Draw(sh); x = stroke * 2 + 10
        for c, w in zip(s, ws):
            ds.text((x + 6, th * 0.14 + 10), c, font=fo, fill=(0, 0, 0, 170), stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
            d.text((x, th * 0.14), c, font=fo, fill=fill, stroke_width=stroke, stroke_fill=(10, 6, 12, 255)); x += w
        _TXT[k] = Image.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)), im)
    return _TXT[k]
def text(fr, s, cx, cy, size, fill=(255, 255, 255, 255), age=None, alpha=1.0, slam=0.55, T=0.0, **kw):
    im = text_img(s, size, fill, **kw); sc = 1.0; ox = oy = 0
    if age is not None:
        if age < 0: return
        sc = 1 + slam * (1 - eout(age / 0.16)); alpha *= clamp(age / 0.05); k = math.exp(-age * 12) * 10; ox, oy = math.sin(T * 90) * k, math.cos(T * 77) * k
    if sc != 1.0: im = im.resize((int(im.width * sc), int(im.height * sc)), Image.BICUBIC)
    if alpha < 1: im = im.copy(); im.putalpha(im.split()[3].point(lambda v: int(v * clamp(alpha))))
    fr.paste(im, (int(cx - im.width / 2 + ox), int(cy - im.height / 2 + oy)), im)

def post(fr, T, bars=0, flash=0.0, sat=1.0, rot=0.0, blurx=0, fade=1.0, grain=4.5, tint=None):
    L = _layers()
    if rot: fr = fr.rotate(rot, resample=Image.BICUBIC).transform((W, H), Image.AFFINE, (0.94, 0, W * 0.03, 0, 0.94, H * 0.03), resample=Image.BILINEAR)
    if blurx: fr = fr.resize((max(8, W // blurx), H), Image.BILINEAR).resize((W, H), Image.BILINEAR)
    sm = fr.resize((W // 6, H // 6), Image.BILINEAR).point(lambda v: int(max(0, v - 150) * 1.6)).filter(ImageFilter.GaussianBlur(5))
    fr = ImageChops.screen(fr, sm.resize((W, H), Image.BILINEAR))
    fr = ImageChops.multiply(fr, L['vig'])
    a = np.asarray(fr).astype(np.float32)
    if sat != 1.0: g = a.mean(axis=2, keepdims=True); a = g + (a - g) * sat
    if tint is not None: a *= np.array(tint, dtype=np.float32)
    a = (a / 255.0) ** 0.98 * 255.0 * 1.03                         # gentle lift so black suits keep detail
    r = random.Random(int(T * FPS)); ox, oy = r.randrange(64), r.randrange(64)
    a += L['grain'][oy:oy + H, ox:ox + W, None] * grain
    if flash > 0: a = a + (np.array([255, 236, 214], dtype=np.float32) - a) * clamp(flash)
    if fade < 1: a *= clamp(fade)
    fr = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if bars:
        d = ImageDraw.Draw(fr); d.rectangle((0, 0, W, bars), fill=(0, 0, 0)); d.rectangle((0, H - bars, W, H), fill=(0, 0, 0))
    return fr
