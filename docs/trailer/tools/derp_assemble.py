"""Assemble the derp soft-launch trailer: the eight rendered shots in order, with the soundtrack,
loudness-normalised (-14 LUFS). Writes out/bonkbow-softlaunch-20s.mp4.

    python3 tools/derp_assemble.py [--preview]     (--preview: missing frames shown black)
"""
import json, os, re, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); TRAILER = os.path.join(HERE, '..')
BUILD = os.path.join(TRAILER, 'build'); OUT = os.path.join(TRAILER, 'out')
W, H, FPS = 1920, 1080, 30
SHOTS = [int(x) for x in os.environ['SHOTS'].split(',')] if os.environ.get('SHOTS') else [41, 42, 43, 44, 45, 46, 47, 48]
preview = '--preview' in sys.argv
sys.path.insert(0, HERE)
from derpy import Pen, text as scrawl  # noqa: E402
OVERLAY = {51: ('DAY 1', 0.9), 53: ('DAY 2', 0.9), 55: ('DAY 3', 0.9), 57: ('DAY 4', 1.2), 59: ('OCTOBER 12.', 1.6)} if 50 in SHOTS else {}
INTRO = [(0.0, 'the CLOCK IN deadline moved to october 12.'), (1.1, 'the archers got four more days.')] if 50 in SHOTS else []
INTRO_SECONDS = 2.4


def overlay(im, label, k):
    scrawl(im, label, (W / 2, 120 + (1 - min(1.0, k * 6)) * -200), 150, k, col=(255, 255, 255), seed=400, wob=5)
    return im
frames = []
for n in SHOTS:
    if n == 50:
        frames += [('intro', i) for i in range(int(INTRO_SECONDS * FPS))]; continue
    text = open(os.path.join(TRAILER, 'rig', 'shots', 's%02d.py' % n)).read()
    a, b = (float(x) for x in re.search(r'^START, END = ([\d.]+), ([\d.]+)', text, re.M).groups())
    for i in range(1, int(round((b - a) * FPS)) + 1):
        frames.append((n, i, os.path.join(BUILD, 'shots', 's%02d' % n, 'f_%04d.png' % i)))
wav = os.path.join(BUILD, os.environ.get('WAV', 'derp.wav'))
probe = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=I=-14:TP=-2.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
m = json.loads(probe[probe.rindex('{'):probe.rindex('}') + 1])
norm = ('loudnorm=I=-14:TP=-2.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true,alimiter=limit=0.7:level=false:attack=1:release=40:asc=true'
        % (m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))
os.makedirs(OUT, exist_ok=True)
out = os.path.join(BUILD, 'derp_preview.mp4') if preview else os.path.join(OUT, os.environ.get('OUTNAME', 'bonkbow-softlaunch-20s.mp4'))
p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-i', wav, '-af', norm,
                      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
                      '-t', str(len(frames) / FPS), '-movflags', '+faststart', out], stdin=subprocess.PIPE)
for fr in frames:
    if fr[0] == 'intro':
        t = fr[1] / FPS
        im = Image.new('RGB', (W, H), (10, 10, 12))
        for t0, line in INTRO:
            if t >= t0:
                scrawl(im, line, (W / 2, 380 + 180 * INTRO.index((t0, line))), 84 if INTRO.index((t0, line)) == 0 else 96, t, col=(246, 244, 238), seed=500 + INTRO.index((t0, line)), wob=2)
        p.stdin.write(im.tobytes()); continue
    n, i, f = fr
    if os.path.exists(f):
        im = Image.open(f).convert('RGB')
        im = im if im.size == (W, H) else im.resize((W, H), Image.LANCZOS)
    elif preview:
        im = Image.new('RGB', (W, H))
    else:
        raise SystemExit('missing frame: ' + f)
    if n in OVERLAY and i <= OVERLAY[n][1] * FPS:
        im = overlay(im, OVERLAY[n][0], i / FPS)
    p.stdin.write(im.tobytes())
p.stdin.close(); p.wait()
print('wrote', out, len(frames), 'frames')
