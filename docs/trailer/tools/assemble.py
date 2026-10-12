"""Assemble the launch trailer: rendered shots (build/shots/sNN/f_####.png), title cards,
lower thirds and the gameplay flash, composited frame by frame and piped to ffmpeg with the
soundtrack (build/audio60.wav), loudness-normalised to -14 LUFS / -1 dBTP.

    python3 tools/assemble.py            -> out/stickchers-launch-60.mp4
    python3 tools/assemble.py --cut 30   -> out/stickchers-launch-30.mp4
    python3 tools/assemble.py --cut 15   -> out/stickchers-launch-15.mp4
    python3 tools/assemble.py --preview  -> build/preview.mp4 (missing frames shown black)
"""
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
TRAILER = os.path.join(HERE, '..'); ROOT = os.path.join(TRAILER, '..', '..')
BUILD = os.path.join(TRAILER, 'build'); OUT = os.path.join(TRAILER, 'out')
W, H, FPS = 1920, 1080, 30
SAFE = 0.05
FONT_DIR = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'fredoka')
BOLD = os.path.join(FONT_DIR, '700Bold', 'Fredoka_700Bold.ttf')
MED = os.path.join(FONT_DIR, '500Medium', 'Fredoka_500Medium.ttf')
GOLD = (255, 197, 58)
NAMES = {'akshay': 'AKSHAY', 'beeman': 'BEEMAN', 'chase': 'CHASE', 'mit': 'M-IT', 'mert': 'MERT', 'tolly': 'TOLLY'}
TAGS = {'akshay': 'Grin first, aim later.', 'beeman': 'Never seen his eyes. Never missed.', 'chase': 'Hair by the wind. Shots by him.',
        'mit': 'Clean cut, clean headshots.', 'mert': 'Full beard. Full send.', 'tolly': 'Wide eyes. Wider grin. Never misses.'}


def font(path, size):
    return ImageFont.truetype(path, size)


# ---- shot table (read from the shot files so timing has one source of truth) ------------------------
SHOTS = {}
for f in sorted(os.listdir(os.path.join(TRAILER, 'rig', 'shots'))):
    m = re.match(r's(\d\d)\.py$', f)
    if not m or int(m.group(1)) > 60:
        continue
    text = open(os.path.join(TRAILER, 'rig', 'shots', f)).read()
    se = re.search(r'^START, END = ([\d.]+), ([\d.]+)', text, re.M)
    hero = re.search(r"^HERO = '(\w+)'", text, re.M)
    low = re.search(r'^LOWER = \(([\d.]+), ([\d.]+)\)', text, re.M)
    SHOTS[int(m.group(1))] = dict(start=float(se.group(1)), end=float(se.group(2)), hero=hero and hero.group(1),
                                  lower=low and (float(low.group(1)), float(low.group(2))))

GAMEPLAY = (51.0, 52.5)


def ease_out(k):
    k = max(0.0, min(1.0, k)); return 1 - (1 - k) ** 3


_frames = {}


def shot_frame(n, local_t, preview=False):
    """Rendered frame of shot n at local time (s), as an RGB image."""
    idx = int(round(local_t * FPS)) + 1
    last = int(round((SHOTS[n]['end'] - SHOTS[n]['start']) * FPS))
    idx = max(1, min(last, idx))
    p = os.path.join(BUILD, 'shots', 's%02d' % n, 'f_%04d.png' % idx)
    if not os.path.exists(p):
        if preview:
            return Image.new('RGB', (W, H), (0, 0, 0))
        raise SystemExit('missing frame: %s (render it, or use --preview)' % p)
    im = Image.open(p).convert('RGB')
    return im if im.size == (W, H) else im.resize((W, H), Image.LANCZOS)


def gameplay_frame(local_t):
    """The game's own duel, letterboxed (2000x924 capture fitted to the frame width)."""
    idx = 14 + max(0, min(44, int(round(local_t * FPS))))
    im = Image.open(os.path.join(TRAILER, 'rig', 'assets', 'gameplay', 'f_%04d.jpg' % idx)).convert('RGB')
    h = int(round(im.height * W / im.width))
    im = im.resize((W, h), Image.LANCZOS)
    out = Image.new('RGB', (W, H), (0, 0, 0))
    out.paste(im, (0, (H - h) // 2))
    return out


def spaced(draw, xy, text, fnt, fill, spacing=0, anchor_center=True):
    widths = [draw.textlength(c, font=fnt) for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = xy[0] - total / 2 if anchor_center else xy[0]
    for c, w in zip(text, widths):
        draw.text((x, xy[1]), c, font=fnt, fill=fill)
        x += w + spacing
    return total


def card(text, k_in=1.0, alpha=1.0, size=150, bg=(0, 0, 0), base=None, sub=None):
    """A title card: big spaced bold type, punching in from slightly large."""
    im = base.copy() if base is not None else Image.new('RGB', (W, H), bg)
    scale = 1.0 + 0.35 * (1 - ease_out(k_in))
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(BOLD, int(size * scale))
    bbox = d.textbbox((0, 0), text, font=f)
    th = bbox[3] - bbox[1]
    y = H / 2 - th / 2 - bbox[1]
    if base is not None:  # legibility over picture: soft shadow
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
        spaced(sd, (W / 2, y + 6), text, f, (0, 0, 0, 200), spacing=int(size * 0.07 * scale))
        layer.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    tw = spaced(d, (W / 2, y), text, f, (255, 255, 255, 255), spacing=int(size * 0.07 * scale))
    d.rectangle((W / 2 - 60, y + bbox[3] + 34, W / 2 + 60, y + bbox[3] + 42), fill=GOLD + (255,))
    if alpha < 1:
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    im.paste(layer, (0, 0), layer)
    return im


def lower_third(im, hero, k_in, k_out, name_only=False):
    """NAME / tagline, bottom-left inside the 5% title-safe area."""
    a = ease_out(k_in) * (1 - max(0.0, min(1.0, k_out)))
    if a <= 0:
        return im
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = int(W * SAFE) + 24 - int(46 * (1 - ease_out(k_in)))
    fn, ft = font(BOLD, 92), font(MED, 38)
    name, tag = NAMES[hero], TAGS[hero]
    y_tag = int(H * (1 - SAFE)) - 52
    y_name = y_tag - 104 if not name_only else y_tag - 52
    # soft dark wedge behind the text
    grad = Image.new('L', (W, H), 0)
    gd = ImageDraw.Draw(grad)
    gd.rectangle((0, y_name - 40, 900, H), fill=150)
    grad = grad.filter(ImageFilter.GaussianBlur(90))
    layer.paste(Image.new('RGBA', (W, H), (0, 0, 0, 255)), (0, 0), grad)
    d = ImageDraw.Draw(layer)
    d.rectangle((x - 24, y_name + 14, x - 14, y_tag + (44 if not name_only else -8)), fill=GOLD + (255,))
    spaced(d, (x, y_name), name, fn, (255, 255, 255, 255), spacing=5, anchor_center=False)
    if not name_only:
        d.text((x + 2, y_tag), tag, font=ft, fill=(240, 236, 228, 255))
    layer.putalpha(layer.getchannel('A').point(lambda v: int(v * a)))
    im = im.convert('RGBA'); im.alpha_composite(layer)
    return im.convert('RGB')


def master_frame(T, preview=False):
    """The 60-second master at global time T."""
    if 6.5 <= T < 7.0:
        return card('ONE ARENA.', (T - 6.5) / 0.12)
    if 31.0 <= T < 33.0:
        if 31.33 <= T < 32.5:
            return card('AIM.', (T - 31.33) / 0.12, size=210)
        return Image.new('RGB', (W, H), (0, 0, 0))
    if GAMEPLAY[0] <= T < GAMEPLAY[1]:
        return gameplay_frame(T - GAMEPLAY[0])
    for n, s in SHOTS.items():
        if s['start'] <= T < s['end'] - 1e-6:
            im = shot_frame(n, T - s['start'], preview)
            if n == 4 and T >= 5.72:
                im = card('SIX ARCHERS.', (T - 5.72) / 0.12, base=im)
            if s['lower']:
                lt = T - s['start']
                a, b = s['lower']
                if a <= lt:
                    im = lower_third(im, s['hero'], (lt - a) / 0.22, (lt - b) / 0.12)
            return im
    return Image.new('RGB', (W, H), (0, 0, 0))


# ---- cut-downs: (source start, source end[, name-only lower third]) from the master ------------------------
CUT30 = [(0.0, 1.0), (3.2, 5.0), (5.75, 6.45), (6.5, 7.0)] + [(SH + 2.0, SH + 4.0) for SH in (7, 11, 15, 19, 23, 27)] + \
        [(33.45, 35.0), (35.25, 36.2), (40.9, 42.5), (45.5, 47.0), (49.0, 51.0), (53.1, 56.0), (56.5, 60.0)]
CUT15 = [(3.4, 4.9)] + [(SH + 2.55, SH + 3.55) for SH in (7, 11, 15, 19, 23, 27)] + [(33.5, 34.3), (35.1, 35.7), (43.3, 44.3), (51.4, 52.4), (54.2, 56.0), (56.6, 57.2), (58.0, 60.0)]


def build(cut=None, preview=False):
    os.makedirs(OUT, exist_ok=True)
    if cut is None:
        segs = [(0.0, 60.0)]
        out = os.path.join(BUILD, 'preview.mp4') if preview else os.path.join(OUT, 'stickchers-launch-60.mp4')
    else:
        segs = CUT30 if cut == 30 else CUT15
        out = os.path.join(OUT, 'stickchers-launch-%d.mp4' % cut)
    times = []
    for a, b in segs:
        n = int(round((b - a) * FPS))
        times += [a + i / FPS for i in range(n)]
    if cut:
        want = cut * FPS
        times = times[:want] + [times[-1]] * max(0, want - len(times))
    # audio: the master track, sliced on the same segments with short fades at the joins
    sr, wav = wavfile.read(os.path.join(BUILD, 'audio60.wav'))
    wav = wav.astype(np.float64) / 32768.0
    parts = []
    for a, b in segs:
        x = wav[int(a * sr):int(b * sr)].copy()
        f = int(0.012 * sr)
        if cut and len(x) > 2 * f:
            x[:f] *= np.linspace(0, 1, f)[:, None]; x[-f:] *= np.linspace(1, 0, f)[:, None]
        parts.append(x)
    audio = np.concatenate(parts)[:int(len(times) / FPS * sr)]
    tmp_wav = os.path.join(BUILD, 'assemble_audio.wav')
    wavfile.write(tmp_wav, sr, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
    # two-pass loudness: measure, then apply a linear gain to hit -14 LUFS / -1 dBTP exactly
    import json
    probe = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp_wav, '-af', 'loudnorm=I=-14:TP=-2.5:LRA=11:print_format=json', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    m = json.loads(probe[probe.rindex('{'):probe.rindex('}') + 1])
    norm = ('loudnorm=I=-14:TP=-2.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
            % (m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
           '-i', tmp_wav, '-af', norm + ',alimiter=limit=0.7:level=false:attack=1:release=40:asc=true', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16' if not preview else '24',
           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i, T in enumerate(times):
        im = master_frame(T, preview)
        if cut == 15:  # name tags only
            for n, s in SHOTS.items():
                if s['lower'] and s['start'] <= T < s['end']:
                    im = shot_frame(n, T - s['start'], preview)
                    im = lower_third(im, s['hero'], 1.0, 0.0, name_only=True)
        p.stdin.write(im.tobytes())
        if i % 150 == 0:
            print('frame %d / %d' % (i, len(times)), flush=True)
    p.stdin.close(); p.wait()
    print('wrote', out)


if __name__ == '__main__':
    a = sys.argv[1:]
    build(cut=int(a[a.index('--cut') + 1]) if '--cut' in a else None, preview='--preview' in a)
