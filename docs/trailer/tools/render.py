"""Renders the trailer picture. `render.py` -> build/picture.mp4 (shots rendered in parallel);
`render.py stills <t> <t> ...` -> build/stills/ plus a contact sheet."""
import sys, os, subprocess, warnings
warnings.filterwarnings('ignore')
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__)); BUILD = os.path.join(HERE, '..', 'build')
def seg(i):
    from shots import SHOTS, W, H, FPS
    a, b, f = SHOTS[i]; out = os.path.join(BUILD, 'seg%02d.mp4' % i); n = int(round((b - a) * FPS))
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for k in range(n): p.stdin.write(f(k / FPS, a + k / FPS).convert('RGB').tobytes())
    p.stdin.close(); p.wait(); return out
def still(T):
    from shots import frame
    fr = frame(T).resize((360, 640)); fr.save(os.path.join(BUILD, 'stills', 't%05.2f.png' % T)); return T
if __name__ == '__main__':
    os.makedirs(os.path.join(BUILD, 'stills'), exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == 'stills':
        from PIL import Image
        ts = [float(x) for x in sys.argv[2:]]
        with Pool(8) as p: p.map(still, ts)
        cols = 6; rows = (len(ts) + cols - 1) // cols; cs = Image.new('RGB', (cols * 360, rows * 640))
        for i, T in enumerate(ts): cs.paste(Image.open(os.path.join(BUILD, 'stills', 't%05.2f.png' % T)), ((i % cols) * 360, (i // cols) * 640))
        cs.save(os.path.join(BUILD, 'sheet.png')); sys.exit()
    from shots import SHOTS
    only = [int(x) for x in sys.argv[1:]] or list(range(len(SHOTS)))
    with Pool(8) as p: p.map(seg, only)
    lst = os.path.join(BUILD, 'segs.txt'); open(lst, 'w').write(''.join("file 'seg%02d.mp4'\n" % i for i in range(len(SHOTS))))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', os.path.join(BUILD, 'picture.mp4')], check=True)
