"""Heads from the character sheets themselves (archer-boys.pdf).

Each hero's head is the volume every turnaround view agrees on (the
intersection of the silhouettes), painted with the sheet's own art projected
back from the views that face each point most squarely. The expression
tiles repaint the face, one texture per expression, so the app can crossfade
between them.

    python3 scripts/heroes/project.py <page-png-dir> <cache-dir> [hero ...] [--paint]

Run by scripts/heroes/build.sh in two passes. The first writes
<cache-dir>/<id>_sdf.bin + .json (signed distance grid, which bake.ts
meshes into assets/heroes/<id>.json); --paint then rasterises that mesh in
uv space and writes assets/heroes/<id>_<expr>.jpg, one texture per sheet
expression (u = angle round the neck, v = elevation).

Head space: units of the skull radius, +x face forward, +y up, +z the
archer's right. Page PNGs: pdftoppm -r 300 -png archer-boys.pdf <dir>/p
"""
import json
import os
import sys

import cv2
import numpy as np
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
EYE_Y = 0.08  # eye line height in head space
EYE_GAP = 0.76  # distance between the pupils in head space
TEX_W, TEX_H = 1024, 512

# Camera azimuth of each turnaround column (radians round the head from the
# face; +π/2 = the archer's right side, +z) and its trust (silhouette slack).
COLUMNS = [('front', 0.0), ('front34', -0.785), ('right', np.pi / 2), ('back', np.pi), ('left', -np.pi / 2), ('back34', -2.356), ('left34', 0.785)]

# Calibration read off the 300 dpi pages: front-view pupils (page px), chin
# row, and which expression tile is which (left to right along the bottom).
HEROES = {
    'akshay': dict(page=1, eyes=((227, 600), (328, 600)), chin=715, strip=(0.705, 0.815, 0.01, 0.47), tiles=['smile', 'neutral', 'angry', 'wink', 'shock']),
    # Page 2 has a dark backdrop and its own layout: four big head views.
    'beeman': dict(page=2, eyes=((227, 2026), (373, 2026)), gap=112, chin=2205, mirror={'left': 'right'}, dark=True, cols=[('front', 0.0, 0, 490), ('front34', -0.785, 490, 960), ('back', np.pi, 960, 1420), ('right', np.pi / 2, 1420, 1950)], tiles=[]),
    'chase': dict(page=3, eyes=((220, 407), (315, 407)), chin=510, strip=(0.735, 0.88, 0.0, 0.52), tiles=['neutral', 'smile', 'angry', 'wink', 'shock']),
    'mit': dict(page=4, eyes=((187, 392), (270, 392)), gap=105, chin=495, strip=(0.735, 0.89, 0.01, 0.49), tiles=['smile', 'neutral', 'angry', 'wink', 'shock']),
    'mert': dict(page=5, eyes=((227, 393), (337, 393)), chin=520, strip=(0.735, 0.89, 0.01, 0.49), tiles=['neutral', 'angry', 'stern', 'wink', 'shock']),
    'tolly': dict(page=6, eyes=((225, 435), (337, 435)), chin=540, strip=(0.735, 0.89, 0.01, 0.49), tiles=['neutral', 'angry', 'wink', 'shock', 'smile']),
}


def background(img, dark=False):
    a = img.astype(int)
    if dark:
        lum = a.mean(2)
        return (lum > 50) & (lum < 120) & ((a.max(2) - a.min(2)) < 16)
    return (a.min(2) > 222) & ((a.max(2) - a.min(2)) < 22)


def figure_mask(img, dark=False):
    """The figure without its bow, string and red fletching. Background is
    only what is backdrop-coloured AND connected to the crop's border, so
    bright skin highlights inside the figure stay figure."""
    a = img.astype(int)
    if dark:
        # The studio grey is flat: key on distance from its own colour (the
        # crop's corners), tight enough to keep a grey beard.
        bgc = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3)]), 0)
        cand = np.abs(a - bgc).max(2) < 14
    else:
        cand = (a.min(2) > 205) & ((a.max(2) - a.min(2)) < 34)
    lab, n = ndi.label(cand)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    fg = ~bg
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV).astype(int)
    red = ((hsv[..., 0] < 8) | (hsv[..., 0] > 170)) & (hsv[..., 1] > 190) & (hsv[..., 2] > 90)
    # Red fletching only where it isn't skin: skin is less saturated.
    fg &= ~red
    fg = ndi.binary_opening(fg, structure=np.ones((11, 11)))
    fg = ndi.binary_fill_holes(fg)
    lab, n = ndi.label(fg)
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    return lab == 1 + int(np.argmax(sizes))


def run_center(row, x):
    if not row[x]:
        xs = np.where(row)[0]
        if len(xs) == 0:
            return x
        x = int(xs[np.argmin(np.abs(xs - x))])
    lo = x
    while lo > 0 and row[lo - 1]:
        lo -= 1
    hi = x
    while hi < len(row) - 1 and row[hi + 1]:
        hi += 1
    return (lo + hi) / 2


class View:
    """One sheet view: crop, mask, and head space → pixel mapping."""

    def __init__(self, img, mask, az, s, eye_y, axis_x, cut_y, neck_r=0.4):
        self.img = img.astype(np.float32) / 255.0
        self.mask = mask
        self.az = az
        self.s = s  # pixels per head unit
        self.eye_y = eye_y  # pixel row of the eye line
        self.axis_x = axis_x  # pixel column of the head's vertical axis
        self.cut_y = cut_y  # rows below this are not head (the body)
        self.neck_r = neck_r  # half-width of the collar, head units
        self.dir = np.array([np.cos(az), 0.0, np.sin(az)])  # toward the camera
        self.right = np.array([np.sin(az), 0.0, -np.cos(az)])  # screen right
        # Signed distance to the silhouette, in head units (+ outside).
        m = mask.astype(np.uint8)
        inside = cv2.distanceTransform(m, cv2.DIST_L2, 5)
        outside = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
        self.sd = ((outside - inside) / s).astype(np.float32)

    def project(self, p):
        """p (..., 3) → pixel x, y."""
        x = self.axis_x + self.s * (p @ self.right)
        y = self.eye_y - self.s * (p[..., 1] - EYE_Y)
        return x, y

    def silhouette(self, p):
        x, y = self.project(p)
        # Outside the crop is outside the head (crops are wider than heads).
        d = cv2.remap(self.sd, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=9.0)
        # Below the chin cut the head continues as a neck column into the collar.
        neck = np.abs(x - self.axis_x) / self.s - self.neck_r
        return np.where(y > self.cut_y, neck, d)

    def sample(self, p):
        x, y = self.project(p)
        return cv2.remap(self.img, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def load_views(src, hero):
    c = HEROES[hero]
    page = cv2.cvtColor(cv2.imread(f'{src}/p-{c["page"]}.png'), cv2.COLOR_BGR2RGB)
    H, W, _ = page.shape
    (ex0, ey0), (ex1, ey1) = c['eyes']
    gap = c.get('gap', ex1 - ex0)
    s = gap / EYE_GAP
    eye_y = (ey0 + ey1) / 2
    chin = c['chin']
    views = []
    dark = c.get('dark', False)
    cols = c.get('cols') or [(name, az, int(W * i / 7), int(W * (i + 1) / 7)) for i, (name, az) in enumerate(COLUMNS)]
    for name, az, x0, x1 in cols:
        y0, y1 = int(eye_y - 2.2 * s), min(H, int(chin + 0.9 * s))
        crop = page[y0:y1, x0:x1]
        mask = figure_mask(crop, dark)
        # The head's axis: centre of the collar just under the chin.
        r = int(chin - y0 + 0.25 * s)
        top_rows = np.where(mask.any(1))[0]
        head_x = int(np.median(np.where(mask[top_rows.min() : int(chin - y0)])[1]))
        axis = run_center(mask[r], head_x)
        if name == 'front':
            axis = (ex0 + ex1) / 2 - x0  # between the pupils
        elif name in ('right', 'left', 'back'):
            # The middle of the head's outline at eye height (the collar row
            # is unreliable: the quiver and strap touch the body there).
            ey = int(eye_y - y0)
            xs = np.where(mask[ey])[0]
            run = xs[np.abs(xs - run_center(mask[ey], head_x)) < 0.9 * s * 1.6]
            axis = (run.min() + run.max()) / 2
        if name == 'front':
            az = c.get('front_az', 0.0)  # M-it's sheet 'front' glances aside
        views.append(View(crop, mask, az, s, eye_y - y0, axis, chin - y0 + 0.35 * s, neck_r=0.42))
        views[-1].name = name
    # A side the sheet doesn't draw is the other side, mirrored.
    for name, src_name in c.get('mirror', {}).items():
        sv = next(v for v in views if v.name == src_name)
        mv = View.__new__(View)
        mv.__dict__.update(sv.__dict__)
        mv.img = sv.img[:, ::-1].copy()
        mv.mask = sv.mask[:, ::-1].copy()
        mv.sd = sv.sd[:, ::-1].copy()
        mv.axis_x = sv.img.shape[1] - 1 - sv.axis_x
        mv.az = -sv.az
        mv.dir = np.array([np.cos(mv.az), 0.0, np.sin(mv.az)])
        mv.right = np.array([np.sin(mv.az), 0.0, -np.cos(mv.az)])
        mv.name = name
        views.append(mv)
    return views, s


def hull_grid(views, step=0.03, smooth=3.2, round_p=2.6):
    lo = np.array([-1.9, -1.6, -1.9])
    hi = np.array([1.9, 2.1, 1.9])
    n = np.ceil((hi - lo) / step).astype(int) + 1
    xs, ys, zs = [lo[k] + step * np.arange(n[k]) for k in range(3)]
    P = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1).reshape(-1, 3)
    d = np.full(len(P), -9.0, np.float32)
    for v in views:
        slack = 0.0 if v.name in ('front', 'right', 'back', 'left') else 0.03
        # remap needs ≤ 32767 points per row: do it in chunks
        out = np.empty(len(P), np.float32)
        for k in range(0, len(P), 30000):
            chunk = P[k : k + 30000]
            out[k : k + 30000] = v.silhouette(chunk[None, :, :])[0]
        d = np.maximum(d, out - slack)
    # Close the bottom: a little below the chin cut the head ends.
    cut = (views[0].eye_y - views[0].cut_y) / views[0].s + EYE_Y
    d = np.maximum(d, (cut - 0.15) - P[:, 1])
    g = d.reshape(n[0], n[1], n[2])
    if smooth:
        g = ndi.gaussian_filter(g, smooth)  # soften the carving facets and boxy corners
    if round_p:
        # Rounded cross-sections with a crisp profile down the middle (nose,
        # lips, chin), then only a light smoothing that keeps that profile.
        g = round_slices(g, lo, step, round_p)
        g = ndi.gaussian_filter(g, 1.0)
    return g, lo, step, n


def round_slices(g, lo, step, p):
    """Silhouettes carve each horizontal slice of the head into roughly a
    rectangle whose front sits at the nose tip across the whole width (the
    side view's profile is extruded). Real heads are rounded, and only the
    middle of the face comes that far forward. Each slice is intersected with
    a superellipse fitted to its extent *beside* the nose (|z| > 0.3), and the
    hull may poke out of it only near the centre line (nose, lips, chin)."""
    out = g.copy()
    xs = lo[0] + step * np.arange(g.shape[0])
    zs = lo[2] + step * np.arange(g.shape[2])
    X, Z = np.meshgrid(xs, zs, indexing='ij')
    for j in range(g.shape[1]):
        inside = g[:, j, :] < 0
        if inside.sum() < 9:
            continue
        ix = np.where(inside.any(1))[0]
        iz = np.where(inside.any(0))[0]
        x0, x1 = xs[ix.min()], xs[ix.max()]
        z0, z1 = zs[iz.min()], zs[iz.max()]
        cz = (z0 + z1) / 2
        az = max((z1 - z0) / 2, step)
        # Front of the slice away from the centre line.
        side = inside & (np.abs(Z - cz) > min(0.3, az * 0.45))
        x1s = xs[np.where(side.any(1))[0].max()] if side.any() else x1
        # The face front beside the nose: as far forward as the side columns
        # allow, rounded off (a cheek, not a wall).
        x1f = min(x1, x1s + 0.08)
        cx = (x0 + x1f) / 2
        ax = max((x1f - x0) / 2, step)
        r = (np.abs((X - cx) / ax) ** p + np.abs((Z - cz) / az) ** p) ** (1 / p)
        shell = (r - 1) * min(ax, az)
        # Near the centre line the hull's own profile wins (nose, lips, chin).
        centre = np.exp(-(((Z - cz) / 0.22) ** 2)) * (X > cx)
        out[:, j, :] = np.maximum(g[:, j, :], shell * (1 - centre) + g[:, j, :] * centre)
    return out


def fit_oblique(views, step=0.03):
    """The sheet's 3/4 drawings are not at exactly 45°. Build the head from
    the four square-on views, paint it from the front and side drawings,
    then for each oblique view find the azimuth and horizontal offset whose
    render best matches that drawing (grey-level correlation over the head;
    the eyes, nose and ears pin the angle where the outline can't)."""
    card = [v for v in views if v.name in ('front', 'right', 'back', 'left')]
    g, lo, st, n = hull_grid(card, step)
    shell = np.argwhere((g < 0) & (g > -2.2 * st))
    P = lo + shell * st
    e = st
    N = np.stack([trilinear(g, lo, st, P + e * np.eye(3)[k]) - trilinear(g, lo, st, P - e * np.eye(3)[k]) for k in range(3)], -1)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    # Colour each surface point from the square-on view that faces it best.
    col = np.zeros(len(P), np.float32)
    best_w = np.zeros(len(P), np.float32)
    for v in card:
        w = np.clip(N @ v.dir, 0, 1)
        x, y = v.project(P)
        grey = cv2.cvtColor((v.img * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        c = ndi.map_coordinates(grey, [y, x], order=1, mode='nearest').astype(np.float32)
        take = w > best_w
        col[take] = c[take]
        best_w[take] = w[take]
    for v in views:
        if v in card:
            continue
        H, W = v.mask.shape
        cut = int(v.cut_y)
        target = cv2.cvtColor((v.img * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)[:cut] / 255
        tmask = v.mask[:cut]
        best = (-2.0, v.az, v.axis_x)
        # Sheet 3/4 views sit 15–50° off the front (or back): search only there.
        sign = np.sign(v.az)
        lo_a, hi_a = (np.radians(25), np.radians(50)) if abs(v.az) < np.pi / 2 else (np.radians(130), np.radians(155))
        for az in sign * np.linspace(lo_a, hi_a, 15):
            d = np.array([np.cos(az), 0.0, np.sin(az)])
            right = np.array([np.sin(az), 0.0, -np.cos(az)])
            vis = (N @ d) > 0.05
            Pv, cv_, depth = P[vis], col[vis], (P[vis] @ d)
            order = np.argsort(depth)  # far to near: near points overwrite
            Pv, cv_ = Pv[order], cv_[order]
            for dx in np.linspace(-0.3, 0.3, 13):
                x = v.axis_x + v.s * (Pv @ right + dx)
                y = v.eye_y - v.s * (Pv[:, 1] - EYE_Y)
                ok = (x >= 0) & (x < W) & (y >= 0) & (y < cut)
                img = np.full((cut, W), np.nan, np.float32)
                img[y[ok].astype(int), x[ok].astype(int)] = cv_[ok]
                m = ~np.isnan(img) & tmask
                if m.sum() < 500:
                    continue
                a_, b_ = img[m], target[m]
                a_ = a_ - a_.mean()
                b_ = b_ - b_.mean()
                ncc = float((a_ * b_).sum() / (np.sqrt((a_ * a_).sum() * (b_ * b_).sum()) + 1e-9))
                if ncc > best[0]:
                    best = (ncc, az, v.axis_x + dx * v.s)
        _, az, ax = best
        v.az = az
        v.dir = np.array([np.cos(az), 0.0, np.sin(az)])
        v.right = np.array([np.sin(az), 0.0, -np.cos(az)])
        v.axis_x = ax
        v.match = best[0]
        print(f'  {v.name}: az {np.degrees(az):.0f}° (match {best[0]:.2f})')


def trilinear(g, lo, step, p):
    q = (p - lo) / step
    return ndi.map_coordinates(g, q.T, order=1, mode='nearest')


def load_mesh(path):
    """Positions, normals, uvs and triangles of a head baked by bake.ts."""
    import base64
    m = json.load(open(path))['head']
    n = m['n']
    q = np.frombuffer(base64.b64decode(m['pos']), np.uint16).reshape(n, 3).astype(np.float64)
    pos = np.array(m['lo']) + q * np.array(m['scale'])
    nor = np.frombuffer(base64.b64decode(m['nor']), np.int8).reshape(n, 3).astype(np.float64)
    nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-9
    uq = np.frombuffer(base64.b64decode(m['uv']), np.uint16).reshape(n, 2).astype(np.float64) / 65535
    uv = np.stack([uq[:, 0] * 2, uq[:, 1]], 1)
    idx = np.frombuffer(base64.b64decode(m['idx']), np.uint32 if m['idx32'] else np.uint16).reshape(-1, 3)
    return pos, nor, uv, idx


def texel_geometry(path):
    """For every texel: the mesh point and normal that sample it (rasterised
    in uv space), and whether any triangle covers it."""
    pos, nor, uv, idx = load_mesh(path)
    P = np.zeros((TEX_H, TEX_W, 3))
    N = np.zeros((TEX_H, TEX_W, 3))
    cov = np.zeros((TEX_H, TEX_W), bool)
    px = uv[:, 0] * TEX_W - 0.5
    py = (1 - uv[:, 1]) * TEX_H - 0.5
    for a, b, c in idx:
        xs = np.array([px[a], px[b], px[c]])
        ys = np.array([py[a], py[b], py[c]])
        x0, x1 = int(np.floor(xs.min())), int(np.ceil(xs.max()))
        y0, y1 = max(0, int(np.floor(ys.min()))), min(TEX_H - 1, int(np.ceil(ys.max())))
        if x1 - x0 > TEX_W / 2:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12:
            continue
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        gx, gy, w0, w1, w2 = gx[inside], gy[inside], w0[inside], w1[inside], w2[inside]
        gx = gx % TEX_W  # the texture repeats across the seam
        P[gy, gx] = w0[:, None] * pos[a] + w1[:, None] * pos[b] + w2[:, None] * pos[c]
        N[gy, gx] = w0[:, None] * nor[a] + w1[:, None] * nor[b] + w2[:, None] * nor[c]
        cov[gy, gx] = True
    N /= np.linalg.norm(N, axis=2, keepdims=True) + 1e-9
    return P.reshape(-1, 3), N.reshape(-1, 3), cov.reshape(-1)


def bake_textures(views, g, lo, step, expr_views, chin, geom=None):
    """Equirect texture about the head centre: for each texel, march in from
    outside to the head surface, then blend the views that see it best."""
    u = (np.arange(TEX_W) + 0.5) / TEX_W
    v = (np.arange(TEX_H) + 0.5) / TEX_H
    U, V = np.meshgrid(u, v)
    az = (U * 2 - 1) * np.pi  # 0 = nose
    el = (0.5 - V) * np.pi
    D = np.stack([np.cos(el) * np.cos(az), np.sin(el), np.cos(el) * np.sin(az)], -1).reshape(-1, 3)
    t = np.full(len(D), 2.6)
    found = np.zeros(len(D), bool)
    for _ in range(400):  # march inward until inside
        d = trilinear(g, lo, step, D * t[:, None])
        hit = (d < 0) & ~found
        found |= hit
        t = np.where(found, t, t - 0.01)
        if found.all():
            break
    P = D * t[:, None]
    # normals from the grid gradient
    e = step
    N = np.stack([trilinear(g, lo, step, P + e * np.eye(3)[k]) - trilinear(g, lo, step, P - e * np.eye(3)[k]) for k in range(3)], -1)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    if geom is not None:
        # The baked mesh's own points: texture and mesh agree exactly.
        gp, gn, cov = geom
        P = np.where(cov[:, None], gp, P)
        N = np.where(cov[:, None], gn, N)

    # Per view: the colour it paints on each texel and how well it sees it.
    def sample_view(vw, boost=1.0):
        q = np.clip(np.nan_to_num(N @ vw.dir), 0, 1)
        vis = np.ones(len(P), bool)  # visible: march toward the camera, stay outside
        for k in range(1, 12):
            vis &= trilinear(g, lo, step, P + N * 0.02 + vw.dir * (0.08 * k)) > -0.01
        x, y = vw.project(P)
        ok = (x >= 0) & (x < vw.img.shape[1] - 1) & (y >= 0) & (y < vw.img.shape[0] - 1)
        if not hasattr(vw, 'paintable'):  # inside its own figure, never its backdrop
            vw.paintable = ndi.gaussian_filter(ndi.binary_erosion(vw.mask, iterations=4).astype(np.float32), 2)
        pa = ndi.map_coordinates(vw.paintable, [y, x], order=1, mode='constant', cval=0.0)
        c = np.empty((len(P), 3), np.float32)
        for k in range(0, len(P), 30000):
            c[k : k + 30000] = vw.sample(P[None, k : k + 30000])[0]
        return c, (q * vis * ok * pa * boost).astype(np.float32)

    # The front drawing is the sheet's best view of the face and the back the
    # best of the back: they own as much as they see well.
    BOOST = {'front': 1.2, 'back': 1.1}
    C, Q = [], []
    for vw in views:
        c, q = sample_view(vw, BOOST.get(vw.name, 1.0))
        C.append(c)
        Q.append(q)
    C = np.stack(C)  # (V, n, 3)
    Q = np.stack(Q)  # (V, n)
    labels = choose_views(C, Q)
    comp = np.take_along_axis(C, labels[None, :, None], 0)[0]
    gain = level_seams(C, labels, comp)
    seen = Q.max(0) > 0.02

    def finish(col):
        # Under the chin is the suit's turtleneck: straps, quiver and fletching
        # the back views show there become suit black (a beard stays).
        sat = col.max(1) - col.min(1)
        lum = col.mean(1)
        beard = (sat < 0.12) & (lum > 0.2) & (np.nan_to_num(N[:, 0]) > 0.3)  # only on the front
        collar = np.clip((chin - 0.04 - P[:, 1]) / 0.08, 0, 1) * ~beard
        col = col * (1 - collar[:, None]) + np.array([0.05, 0.05, 0.06], np.float32) * collar[:, None]
        img = col.reshape(TEX_H, TEX_W, 3)
        empty = ~seen.reshape(TEX_H, TEX_W)
        if empty.any():  # fill unseen texels from the nearest seen one
            idx = ndi.distance_transform_edt(empty, return_distances=False, return_indices=True)
            img = img[idx[0], idx[1]]
        return (np.clip(img, 0, 1) * 255).astype(np.uint8)

    fill = comp + gain  # one consistent paint for whatever a view can't see

    def own(c, q):
        """A view's own drawing wherever it sees the surface (fading out at
        its silhouette), the consistent fill elsewhere."""
        k = np.clip(q / 0.18, 0, 1)[:, None]
        return finish(fill * (1 - k) + c * k)

    out = {'base': finish(fill)}
    vi = {v.name: i for i, v in enumerate(views)}
    for name in ('right', 'back', 'left'):
        if name in vi:
            out[f'v_{name}'] = own(C[vi[name]], Q[vi[name]] / BOOST.get(name, 1.0))
    fi = vi['front']
    front_c, front_q = C[fi], Q[fi] / BOOST['front']
    if not expr_views:
        out['neutral'] = own(front_c, front_q)
    for name, ev in expr_views.items():
        # The expression tile repaints the face where it covers it.
        ec, eq = sample_view(ev)
        k = np.clip(eq / 0.2, 0, 1)[:, None]
        out[name] = own(front_c * (1 - k) + ec * k, np.maximum(front_q, eq))
    return out


def neighbours():
    """Index pairs (p, q) of 4-connected texels on the equirect grid (u wraps)."""
    idx = np.arange(TEX_H * TEX_W).reshape(TEX_H, TEX_W)
    right = (idx, np.roll(idx, -1, axis=1))
    down = (idx[:-1], idx[1:])
    return [(a.ravel(), b.ravel()) for a, b in (right, down)]


def choose_views(C, Q, lam=6.0, iters=8):
    """One view per texel (no blending, so nothing ghosts): each texel wants
    the view that sees it most squarely, and neighbouring texels want views
    that agree there, so seams fall where the drawings match. Iterated
    conditional modes on a Potts-like MRF with colour-difference seam costs."""
    V, n = Q.shape
    data = np.where(Q > 0.02, 1.0 - np.clip(Q, 0, 1.6) / 1.6, 50.0)  # (V, n)
    labels = np.argmin(data, 0)
    pairs = neighbours()
    for _ in range(iters):
        cost = data.copy()
        for p, q in pairs:
            for a, b in ((p, q), (q, p)):
                lb = labels[b]
                # Seam cost if a takes view L while b keeps lb: how much L and
                # lb disagree at both texels.
                cb_a = C[lb, a]
                cb_b = C[lb, b]
                for L in range(V):
                    diff = np.abs(C[L, a] - cb_a).sum(1) + np.abs(C[L, b] - cb_b).sum(1)
                    cost[L, a] += lam * diff * (L != lb) / 3
        new = np.argmin(cost, 0)
        changed = (new != labels).mean()
        labels = new
        if changed < 0.002:
            break
    return labels


def level_seams(C, labels, comp, iters=400):
    """Gradient-domain seam levelling: a smooth colour offset per texel that
    cancels the jumps where two views meet, leaving each view's own detail."""
    from scipy.sparse import coo_matrix, identity
    from scipy.sparse.linalg import cg

    n = len(labels)
    rows, cols, vals = [], [], []
    rhs = np.zeros((n, 3))
    eq = 0
    for p, q in neighbours():
        seam = labels[p] != labels[q]
        # Within a view: offset gradient 0. Across a seam: make the composite's
        # step equal the average of the two views' own steps there.
        target = np.zeros((len(p), 3))
        if seam.any():
            ps, qs = p[seam], q[seam]
            la, lb = labels[ps], labels[qs]
            own = 0.5 * ((C[la, ps] - C[la, qs]) + (C[lb, ps] - C[lb, qs]))
            target[seam] = own - (comp[ps] - comp[qs])
        m = len(p)
        r = eq + np.arange(m)
        rows += [r, r]
        cols += [p, q]
        vals += [np.ones(m), -np.ones(m)]
        rhs = np.concatenate([rhs, target]) if eq else np.concatenate([np.zeros((0, 3)), target])
        eq += m
    A = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(eq, n)).tocsr()
    M = (A.T @ A + 1e-3 * identity(n)).tocsr()
    out = np.zeros((n, 3))
    for ch in range(3):
        b = A.T @ rhs[:, ch]
        out[:, ch], _ = cg(M, b, maxiter=iters)
    return out.astype(np.float32)


def expression_views(src, hero, views):
    """Register each expression tile onto the front view (same face, larger,
    cropped): an affine found by ECC alignment on the neutral-ish tile."""
    c = HEROES[hero]
    out = {}
    if not c['tiles']:
        return out
    page = cv2.cvtColor(cv2.imread(f'{src}/p-{c["page"]}.png'), cv2.COLOR_BGR2RGB)
    H, W, _ = page.shape
    front = views[0]
    # Expression strip: the bottom-left panel, five tiles side by side.
    fy0, fy1, fx0, fx1 = c['strip']
    strip = page[int(H * fy0) : int(H * fy1), int(W * fx0) : int(W * fx1)]
    # The tiles are evenly spaced; split the strip in five.
    w5 = strip.shape[1] / 5
    spans = [np.arange(int(k * w5), int((k + 1) * w5)) for k in range(5)]
    for name, xs in zip(c['tiles'], spans):
        tile = strip[:, xs.min() : xs.max() + 1]
        out[name] = register_tile(tile, front)
    best = max(out.values(), key=lambda t: t.inliers)
    for name, xs in zip(c['tiles'], spans):
        if out[name].inliers < 15:
            out[name] = register_tile(strip[:, xs.min() : xs.max() + 1], front, best.M)
        print(f'  {name}: {out[name].inliers} matches')
    return out


def register_tile(tile, front, prior=None):
    """A View that paints the face from `tile`, aligned to the front view by
    SIFT keypoints and a RANSAC similarity (scale, rotation, shift)."""
    fy = int(front.cut_y)
    fimg = (front.img * 255).astype(np.uint8)[:fy]
    a = cv2.cvtColor(fimg, cv2.COLOR_RGB2GRAY)
    b = cv2.cvtColor(tile, cv2.COLOR_RGB2GRAY)
    sift = cv2.SIFT_create(4000)
    ka, da = sift.detectAndCompute(a, (front.mask[:fy] * 255).astype(np.uint8))
    kb, db = sift.detectAndCompute(b, (~background(tile) * 255).astype(np.uint8))
    m = cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)
    good = [p[0] for p in m if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
    pa = np.float32([ka[g.queryIdx].pt for g in good])
    pb = np.float32([kb[g.trainIdx].pt for g in good])
    M, inl = (None, None) if len(pa) < 3 else cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=5000)
    n_in = int(inl.sum()) if inl is not None else 0
    if prior is not None and (M is None or n_in < 15):
        # Too few matches: start from the best tile's transform (same cell
        # layout) and refine by intensity alignment.
        M = prior.astype(np.float32).copy()
        try:
            _, M = cv2.findTransformECC(a.astype(np.float32) / 255, b.astype(np.float32) / 255, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5), None, 5)
        except cv2.error:
            pass
    if M is None:
        raise RuntimeError('expression tile did not register')
    # front pixel → tile pixel: M @ [x, y, 1]
    v = View(front.img * 255, front.mask, front.az, front.s, front.eye_y, front.axis_x, front.cut_y, front.neck_r)
    v.name = 'front'
    src_img = tile.astype(np.float32) / 255.0
    base_project = v.project

    def project(p):
        x, y = base_project(p)
        return M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2]

    v.project = project
    v.img = src_img
    v.paintable = ndi.gaussian_filter(ndi.binary_erosion(~background(tile), iterations=4).astype(np.float32), 2)
    v.inliers = n_in
    v.M = M
    return v


def main():
    src, cache = sys.argv[1], sys.argv[2]
    os.makedirs(cache, exist_ok=True)
    heroes = [h for h in sys.argv[3:] if not h.startswith('--')] or list(HEROES)
    for hero in heroes:
        views, s = load_views(src, hero)
        fit_oblique(views)
        # Only views the fit placed confidently shape the head; looser ones
        # (curls confuse the fit) still paint the angles they were drawn for.
        paint = [v for v in views if getattr(v, 'match', 1.0) >= 0.44]
        views = [v for v in views if getattr(v, 'match', 1.0) >= 0.7]
        g, lo, step, n = hull_grid(views)
        views = paint
        g.astype(np.float32).tofile(f'{cache}/{hero}_sdf.bin')
        front = views[0]
        chin_y = EYE_Y - (front.cut_y - 0.35 * s - front.eye_y) / s  # head-space height of the chin
        json.dump({'lo': lo.tolist(), 'step': step, 'n': n.tolist(), 'scale': s, 'chin': round(float(chin_y), 4)}, open(f'{cache}/{hero}_sdf.json', 'w'))
        json.dump(sorted(HEROES[hero]['tiles']) or ['neutral'], open(f'{cache}/{hero}_expr.json', 'w'))
        # The kept views and their (fitted) angles: the app picks textures by them.
        json.dump({v.name: round(float(v.az), 4) for v in views}, open(f'{cache}/{hero}_views.json', 'w'))
        mesh_path = os.path.join(ROOT, 'assets', 'heroes', f'{hero}.json')
        if '--paint' not in sys.argv:
            continue  # stage 1 done: bake.ts meshes the grid, then rerun with --paint
        geom = texel_geometry(mesh_path)
        ex = expression_views(src, hero, views)
        front = views[0]
        chin = EYE_Y - (front.cut_y - 0.35 * s - front.eye_y) / s
        tex = bake_textures(views, g, lo, step, ex, chin, geom)
        for name, img in tex.items():
            if name == 'base':
                continue
            cv2.imwrite(os.path.join(ROOT, 'assets', 'heroes', f'{hero}_{name}.jpg'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
        cv2.imwrite(f'{cache}/{hero}_base.png', cv2.cvtColor(tex['base'], cv2.COLOR_RGB2BGR))
        print(hero, 'grid', n.tolist(), 'expressions', list(ex))


if __name__ == '__main__':
    main()
