"""Hero head sprites, cut straight out of archer-boys.pdf.

Heroes are shown from four sides only (front, right, back, left), so each
head is the sheet's own drawing for that side, plus one front drawing per
facial expression. Every tile is registered to the same head frame (eyes,
head axis and scale line up across tiles), so switching side or expression
never jumps. Writes assets/heroes/<id>_heads.png (an atlas of 512² tiles,
four across) and <id>_heads.json (tile order, chin height).

    python3 scripts/heroes/sprites.py <page-png-dir> [hero ...]
"""
import json
import os
import sys

import cv2
import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(__file__))
import sheets as P  # noqa: E402  (calibration, view cutting, tile registration)

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
T = 512  # tile size
PX = 128  # pixels per head unit
TOP = 2.3  # head-space y at the tile's top row
COLS = 4


def tile_to_view(v):
    """2×3 affine: tile pixel → this view's pixel."""
    k = v.s / PX
    # r = (tx - T/2) / PX ; y = TOP - ty / PX
    # vx = axis_x + s r ; vy = eye_y - s (y - EYE_Y)
    return np.array([[k, 0, v.axis_x - k * T / 2], [0, k, v.eye_y - v.s * (TOP - P.EYE_Y)]], np.float32)


def cut(img, mask, A, chin_y):
    """Warp a view into the tile frame; alpha = its figure mask above the
    collar, feathered by a pixel so the edge is smooth, not stair-stepped."""
    rgb = cv2.warpAffine(img, A, (T, T), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    m = cv2.warpAffine(mask.astype(np.float32), A, (T, T), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=0)
    # Keep the head and a little neck: everything below the collar line goes
    # (the suit's turtleneck covers the join).
    rows = np.arange(T, dtype=np.float32)[:, None]
    neck_row = (TOP - (chin_y - 0.3)) * PX
    m *= np.clip((neck_row - rows) / 6.0, 0, 1)
    # Only the head blob (drop stray bits of bow, arrows, quiver).
    lab, n = ndi.label(m > 0.5)
    if n > 1:
        sizes = ndi.sum(m > 0.5, lab, range(1, n + 1))
        keep = lab == 1 + int(np.argmax(sizes))
        m *= ndi.binary_dilation(keep, iterations=2)
    m = cv2.GaussianBlur(m, (3, 3), 0.8)
    return np.dstack([np.clip(rgb, 0, 255), np.clip(m * 255, 0, 255)]).astype(np.uint8)


def expression_tiles(src, hero, front, chin_y):
    """The sheet's expression drawings, aligned to the front view's frame."""
    c = P.HEROES[hero]
    if not c['tiles']:
        return {}
    page = cv2.cvtColor(cv2.imread(f'{src}/p-{c["page"]}.png'), cv2.COLOR_BGR2RGB)
    H, W, _ = page.shape
    fy0, fy1, fx0, fx1 = c['strip']
    strip = page[int(H * fy0) : int(H * fy1), int(W * fx0) : int(W * fx1)]
    w5 = strip.shape[1] / 5
    tiles = [strip[:, int(k * w5) : int((k + 1) * w5)] for k in range(5)]
    reg = [P.register_tile(t, front) for t in tiles]
    best = max(reg, key=lambda r: r.inliers)
    out = {}
    A_front = tile_to_view(front)
    for name, tile, r in zip(c['tiles'], tiles, reg):
        if r.inliers < 15:
            r = P.register_tile(tile, front, best.M)
        # tile pixel → front pixel (A_front) → expression-drawing pixel (r.M)
        M3 = np.vstack([r.M, [0, 0, 1]]) @ np.vstack([A_front, [0, 0, 1]])
        mask = P.figure_mask(tile)
        out[name] = cut(tile.astype(np.float32), mask, M3[:2].astype(np.float32), chin_y)
    return out


def main():
    src = sys.argv[1]
    heroes = sys.argv[2:] or list(P.HEROES)
    for hero in heroes:
        views, s = P.load_views(src, hero)
        by = {v.name: v for v in views}
        front = by['front']
        chin_y = P.EYE_Y - (front.cut_y - 0.35 * s - front.eye_y) / s
        tiles = {}
        for name in ('right', 'back', 'left'):
            v = by[name]
            tiles[name] = cut(v.img * 255, v.mask, tile_to_view(v), chin_y)
        ex = expression_tiles(src, hero, front, chin_y)
        if not ex:
            ex = {'neutral': cut(front.img * 255, front.mask, tile_to_view(front), chin_y)}
        order = list(ex) + ['right', 'back', 'left']
        allt = {**ex, **tiles}
        rows = (len(order) + COLS - 1) // COLS
        atlas = np.zeros((rows * T, COLS * T, 4), np.uint8)
        for i, name in enumerate(order):
            r, c = divmod(i, COLS)
            atlas[r * T : (r + 1) * T, c * T : (c + 1) * T] = allt[name]
        cv2.imwrite(os.path.join(ROOT, 'assets', 'heroes', f'{hero}_heads.png'), cv2.cvtColor(atlas, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
        meta = {'tiles': order, 'cols': COLS, 'rows': rows, 'tile': T, 'px': PX, 'top': TOP, 'chin': round(float(chin_y), 4)}
        json.dump(meta, open(os.path.join(ROOT, 'assets', 'heroes', f'{hero}_heads.json'), 'w'))
        print(hero, order)


if __name__ == '__main__':
    main()
