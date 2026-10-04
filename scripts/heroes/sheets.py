"""Reading the character sheets (archer-boys.pdf): per-page calibration
(front-view pupils, chin row, expression strip), cutting the turnaround
views with their figure masks, and registering expression tiles to the
front view. Used by sprites.py.

Head space: units of the head (eye gap = EYE_GAP), +x face forward, +y up,
+z the archer's right. Page PNGs: pdftoppm -r 300 -png archer-boys.pdf <dir>/p
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

# Camera azimuth of each turnaround column (radians round the head from the
# face; +π/2 = the archer's right side, +z).
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
