"""Build the WHOLE figure in 3D from the body turnaround strip (24 views, one every 15 degrees),
so head, neck, suit, gloves, boots and quiver are all the reference's own art, in one piece.

  cut the 24 full-body views -> matte -> carve the volume the silhouettes agree on -> write the
  voxels and the views; rig/figure360.py meshes the volume and textures it by blending the two
  views nearest the camera.

    python3 build_figure360.py work/sheet4x.png tolly
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, hero = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fig360', hero + '_solid')
os.makedirs(OUT, exist_ok=True)
im = np.array(Image.open(src).convert('RGB')).astype(np.int32)
S = im.shape[1] / 1774.0
y0, y1 = int(236 * S), int(424 * S)             # the body strip (below the title, above the labels)
strip = im[y0:y1]
Hs, W = strip.shape[:2]
# matte: off-white page, plus the soft grey floor shadow under the boots
mn = strip.min(2); mx = strip.max(2)
fg = (mn < 232) | ((mx - mn) > 26)
yy = np.arange(Hs)[:, None]
shadow = (yy > Hs * 0.86) & (mn > 150) & ((mx - mn) < 22)
fg &= ~shadow
bg = ~fg
lab, n = ndi.label(bg)
border = set(np.unique(lab[0])) | set(np.unique(lab[:, 0])) | set(np.unique(lab[:, -1])) | set(np.unique(lab[-1]))
border.discard(0)
obj = ~np.isin(lab, list(border))
obj = ndi.binary_opening(obj, iterations=2)
# pockets of page trapped inside the outline (between bow and string): big near-white islands
white = obj & (mn > 238)
lab, n = ndi.label(white)
if n:
    big = np.nonzero(ndi.sum(white, lab, range(1, n + 1)) > 900)[0] + 1
    obj &= ~np.isin(lab, big)
c0, pitch = 171.0 * S / 4.0, 295.04 * S / 4.0     # the turntable grid, measured on the head strip
T = 768
tiles, masks = [], []
colsum = ndi.uniform_filter1d(obj.sum(0).astype(float), int(2 * S))
bounds = [0]
for i in range(23):
    mid = int(c0 + (i + 0.5) * pitch); r = int(10 * S)
    bounds.append(mid - r + int(np.argmin(colsum[mid - r:mid + r])))
bounds.append(W)
ys_all = np.nonzero(obj.any(1))[0]
top, bot = ys_all.min(), ys_all.max()
print('figure px height', bot - top)
for i in range(24):
    xa, xb = bounds[i], bounds[i + 1]
    m = obj[:, xa:xb]
    lab, n = ndi.label(m)
    k = 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1))))
    m = lab == k
    cx = c0 + pitch * i
    tile = np.zeros((T, T, 4), np.uint8); mk = np.zeros((T, T), bool)
    ys, xs = np.nonzero(m)
    tx = np.round(xs + xa - cx + T / 2).astype(int); ty = ys - bot + (T - 12)      # feet on a common floor line
    ok = (tx >= 0) & (tx < T) & (ty >= 0) & (ty < T)
    mk[ty[ok], tx[ok]] = True
    tile[ty[ok], tx[ok], :3] = np.clip(strip[ys[ok], xs[ok] + xa], 0, 255)
    tiles.append(tile); masks.append(mk)
# an even turntable: 270/285 from the sheet's cleanest left profiles, 300-345 mirrored from 60-15
ORDER = [(i, False) for i in range(18)] + [(19, False), (21, False), (4, True), (3, True), (2, True), (1, True)]
tiles = [tiles[i][:, ::-1].copy() if m else tiles[i] for i, m in ORDER]
masks = [masks[i][:, ::-1].copy() if m else masks[i] for i, m in ORDER]
masks = np.array(masks)

G = 200
R = T / 2.0
lin = (np.arange(G) + 0.5) / G * T - R
X, Y, Z = np.meshgrid(lin, lin, lin, indexing='ij')
ang = np.radians(np.arange(24) * 15.0)
votes = np.zeros(X.shape, np.int16)
for i, a in enumerate(ang):
    u = np.clip((X * np.cos(a) + Y * np.sin(a) + R).astype(int), 0, T - 1)
    v = np.clip((R - Z).astype(int), 0, T - 1)
    votes += masks[i][v, u]
NEED = int(os.environ.get('NEED', 14))
vol = votes >= NEED        # a MAJORITY, not all: the drawings do not agree limb for limb; each view's own outline trims the render
vol = ndi.binary_closing(vol, iterations=2)
lab, n = ndi.label(vol)
vol = lab == (1 + int(np.argmax(ndi.sum(vol, lab, range(1, n + 1)))))
dens = ndi.gaussian_filter(vol.astype(np.float32), 1.3)
np.save(os.path.join(OUT, 'dens.npy'), dens.astype(np.float16))
zs = np.nonzero(vol.any((0, 1)))[0]
for i, t in enumerate(tiles):
    t[..., 3] = (masks[i] * 255).astype(np.uint8)
    rgb = t[..., :3].astype(float); m = masks[i].copy()
    for _ in range(16):      # bleed colour past the outline so blended edges never show the page
        blur = np.stack([ndi.uniform_filter(rgb[..., k] * m, 5) for k in range(3)], 2); ws = ndi.uniform_filter(m.astype(float), 5)
        fill = (~m) & (ws > 0.02)
        rgb[fill] = blur[fill] / ws[fill][:, None]; m = m | fill
    t[..., :3] = np.clip(rgb, 0, 255)
    Image.fromarray(t, 'RGBA').save(os.path.join(OUT, 'v%02d.png' % i))
json.dump(dict(tile=T, grid=G, z_lo=float(lin[zs.min()]), z_hi=float(lin[zs.max()]), px_height=float(bot - top)), open(os.path.join(OUT, 'meta.json'), 'w'))
sh = Image.new('RGB', (T * 8 // 4, T * 3 // 4), (60, 90, 120))
for i, t in enumerate(tiles):
    ti = Image.fromarray(t, 'RGBA'); ti.putalpha(Image.fromarray((masks[i] * 255).astype(np.uint8))); ti = ti.resize((T // 4, T // 4)); sh.paste(ti, ((i % 8) * T // 4, (i // 8) * T // 4), ti)
sh.save('work/fig_mattes.jpg', quality=88)
print('voxels', int(vol.sum()), 'wrote', OUT)
