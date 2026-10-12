"""Build a real 3D head from a 360-degree turnaround strip (one view every 15 degrees).

  1. cut the 24 head views out of the upscaled sheet and matte them off the white page
  2. carve the head's volume: a point is inside if every silhouette says so (visual hull),
     refining each view's sideways registration against the carved shape
  3. write the surface as a smooth star-shaped mesh (radius per direction) and the 24 views
     as textures; rig/head360.py textures the mesh by blending the two views nearest the camera

    python3 build_head360.py work/sheet4x.png tolly
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, hero = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'head360', hero)
os.makedirs(OUT, exist_ok=True)
im = np.array(Image.open(src).convert('RGB')).astype(np.int32)
S = im.shape[1] / 1774.0                       # scale against the 1x sheet
y0, y1 = int(38 * S), int(150 * S)             # the head strip
strip = im[y0:y1]
fg = strip.min(2) < 236
# background = near-white connected to the strip's top edge
bg = ~fg
lab, n = ndi.label(bg)
border = set(np.unique(lab[0])) | set(np.unique(lab[:, 0])) | set(np.unique(lab[:, -1]))
border.discard(0)
bgmask = np.isin(lab, list(border))
obj = ~bgmask
obj = ndi.binary_opening(obj, iterations=2)
# 24 equal tiles; each head = the largest blob whose centre lies in its tile
W = strip.shape[1]
T = 448                                         # tile size, px
PAD = 20
# The strip is 24 heads on an even grid. Split it at the emptiest column between each pair, then
# place every head by the GRID (the turntable's fixed axis), not by its own outline: the front
# and back views are symmetric, so their outline centres give the grid's origin and pitch.
colsum = ndi.uniform_filter1d(obj.sum(0).astype(float), int(3 * S))
guess0, guess_step = 43 * S, (1730 - 43) * S / 23.0
bounds = [0]
for i in range(23):
    mid = int(guess0 + (i + 0.5) * guess_step); r = int(14 * S)
    bounds.append(mid - r + int(np.argmin(colsum[mid - r:mid + r])))
bounds.append(W)
blobs = []
for i in range(24):
    xa, xb = bounds[i], bounds[i + 1]
    m = obj[:, xa:xb]
    lab, n = ndi.label(m)
    k = 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1))))
    m = lab == k
    ys, xs = np.nonzero(m)
    blobs.append((xa, m, xs.min() + xa, xs.max() + 1 + xa, ys.min()))
c0 = (blobs[0][2] + blobs[0][3]) / 2.0
c12 = (blobs[12][2] + blobs[12][3]) / 2.0
pitch = (c12 - c0) / 12.0
top = min(b[4] for b in blobs)
print('grid origin %.1f pitch %.2f (1x: %.2f)' % (c0, pitch, pitch / S))
tiles, masks = [], []
for i, (xa, m, x0b, x1b, _) in enumerate(blobs):
    cx = c0 + pitch * i                          # the rotation axis for this view
    tile = np.zeros((T, T, 4), np.uint8); mk = np.zeros((T, T), bool)
    h = min(T - PAD, strip.shape[0] - top)
    ys, xs = np.nonzero(m)
    for (yy, xx) in ((ys, xs),):
        tx = np.round(xx + xa - cx + T / 2).astype(int); ty = yy - top + PAD
        ok = (tx >= 0) & (tx < T) & (ty >= 0) & (ty < T)
        mk[ty[ok], tx[ok]] = True
        tile[ty[ok], tx[ok], :3] = np.clip(strip[yy[ok], xx[ok] + xa], 0, 255)
    tiles.append(tile); masks.append(mk)
# The sheet's 285-345 degree drawings are not evenly spaced (the last ones are nearly front-on);
# the face is symmetric, so that side uses the mirror of the clean 15-75 degree views.
for i in range(19, 24):
    tiles[i] = tiles[24 - i][:, ::-1].copy(); masks[i] = masks[24 - i][:, ::-1].copy()
masks = np.array(masks)
# the neck: everything below the chin line is collar; keep it in the texture, not in the shape
print('tiles', len(tiles), 'head px height', int(masks.any(0).any(1).sum()))

# ---- visual hull with registration refinement ---------------------------------------------------------
G = 160                                          # voxels per axis
R = T / 2.0
lin = (np.arange(G) + 0.5) / G * T - R           # voxel centres, px, origin at tile centre
X, Y, Z = np.meshgrid(lin, lin, lin, indexing='ij')   # X right (front view), Y depth, Z up
ang = np.radians(np.arange(24) * 15.0)
dx = np.zeros(24)


def carve(dx, need=24):
    votes = np.zeros(X.shape, np.int16)
    for i, a in enumerate(ang):
        u = X * np.cos(a) + Y * np.sin(a) + R + dx[i]
        v = R - Z
        ui = np.clip(u.astype(int), 0, T - 1); vi = np.clip(v.astype(int), 0, T - 1)
        votes += masks[i][vi, ui]
    return votes >= need


def project(vol, a):
    """Silhouette of the volume seen from view angle a."""
    pts = np.stack([X[vol], Y[vol], Z[vol]], 1)
    u = (pts[:, 0] * np.cos(a) + pts[:, 1] * np.sin(a) + R).astype(int)
    v = (R - pts[:, 2]).astype(int)
    out = np.zeros((T, T), bool)
    ok = (u >= 0) & (u < T) & (v >= 0) & (v < T)
    out[v[ok], u[ok]] = True
    return ndi.binary_closing(out, iterations=2)


for it in range(0):   # registration refinement drifts on this sheet; bbox-centred views carve cleanly
    vol = carve(dx, need=22)                     # tolerant shape, then slide each view onto it
    for i, a in enumerate(ang):
        sil = project(vol, a)
        best, bs = 0, -1
        for s in range(-14, 15):
            sc = (np.roll(sil, s, axis=1) & masks[i]).sum()
            if sc > bs:
                bs, best = sc, s
        dx[i] += best * 0.7
    print('iter', it, 'shift px', np.round(dx, 1).tolist())
vol = carve(dx, need=22)
vol = ndi.binary_closing(vol, iterations=2)
vol = ndi.gaussian_filter(vol.astype(float), 1.6) > 0.5
print('volume voxels', int(vol.sum()))

# ---- star-shaped surface: radius along each direction from the head centre ----------------------------
zs = np.nonzero(vol.any((0, 1)))[0]
z_lo, z_hi = lin[zs.min()], lin[zs.max()]
c = np.array([X[vol].mean(), Y[vol].mean(), (z_lo + z_hi) / 2 + 0.06 * (z_hi - z_lo)])
NU, NV = 128, 72
dens = ndi.gaussian_filter(vol.astype(float), 1.0)
th = (np.arange(NU) / NU) * 2 * np.pi
ph = (np.arange(NV + 1) / NV) * np.pi
rad = np.zeros((NV + 1, NU))
steps = np.linspace(0, R * 1.2, 260)
for j, p in enumerate(ph):
    for i, t in enumerate(th):
        d = np.array([np.sin(p) * np.cos(t), np.sin(p) * np.sin(t), np.cos(p)])
        pts = c[None, :] + steps[:, None] * d[None, :]
        idx = ((pts + R) / T * G - 0.5)
        val = ndi.map_coordinates(dens, idx.T, order=1, mode='constant', cval=0)
        inside = np.nonzero(val > 0.5)[0]
        rad[j, i] = steps[inside.max()] if len(inside) else 1.0
rad = ndi.gaussian_filter(rad, (1.2, 1.2), mode=('nearest', 'wrap'))
verts = []
for j, p in enumerate(ph):
    for i, t in enumerate(th):
        r = rad[j, i]
        verts.append([c[0] + r * np.sin(p) * np.cos(t), c[1] + r * np.sin(p) * np.sin(t), c[2] + r * np.cos(p)])
faces = []
for j in range(NV):
    for i in range(NU):
        a, b = j * NU + i, j * NU + (i + 1) % NU
        cc, d = (j + 1) * NU + (i + 1) % NU, (j + 1) * NU + i
        faces.append([a, d, cc, b])
verts = np.array(verts)
for i, t in enumerate(tiles):
    t[..., 3] = (masks[i] * 255).astype(np.uint8)
    # bleed colour outward past the silhouette so blended edges never pick up the white page
    rgb = t[..., :3].astype(float); m = masks[i]
    for _ in range(12):
        blur = np.stack([ndi.uniform_filter(rgb[..., k] * m, 5) for k in range(3)], 2); wsum = ndi.uniform_filter(m.astype(float), 5)
        fill = (~m) & (wsum > 0.02)
        rgb[fill] = blur[fill] / wsum[fill][:, None]; m = m | fill
    t[..., :3] = np.clip(rgb, 0, 255)
    Image.fromarray(t, 'RGBA').save(os.path.join(OUT, 'v%02d.png' % i))
json.dump(dict(tile=T, verts=np.round(verts, 2).tolist(), faces=faces, dx=np.round(dx, 2).tolist(), z_lo=float(z_lo), z_hi=float(z_hi),
               centre=np.round(c, 2).tolist(), head_px=float(z_hi - z_lo)), open(os.path.join(OUT, 'head.json'), 'w'))
# contact sheet of the mattes for a look
sh = Image.new('RGB', (T * 8 // 2, T * 3 // 2), (60, 90, 120))
for i, t in enumerate(tiles):
    ti = Image.fromarray(t, 'RGBA').resize((T // 2, T // 2)); sh.paste(ti, ((i % 8) * T // 2, (i // 8) * T // 2), ti)
sh.save('work/mattes.jpg', quality=88)
print('wrote', OUT)
