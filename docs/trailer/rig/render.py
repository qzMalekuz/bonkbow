"""Render driver.

    blender -b -P rig/render.py -- --shot 6 --frame 45            one frame  -> build/stills/
    blender -b -P rig/render.py -- --shot 6 --frames 1-30 --q review
    blender -b -P rig/render.py -- --shot 6                       whole shot -> build/shots/s06/
    blender -b -P rig/render.py -- --shot 6 --sheet               contact sheet, one frame per 0.5 s
    blender -b -P rig/render.py -- --shot 6 --save                write build/blend/s06.blend (no render)

Quality: draft (half-res, no blur), review (half-res, blur + fog), final (1080p)."""
import importlib
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy

from common import BUILD, FPS


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'q': 'final'}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('sheet', 'save'):
            out[k] = True; i += 1
        else:
            out[k] = a[i + 1]; i += 2
    return out


def main():
    a = args()
    n = int(a['shot'])
    mod = importlib.import_module('shots.s%02d' % n)
    q = a['q']
    import scene as S
    dur = mod.END - mod.START
    sc = S.reset(q, dur)
    t0 = time.time()
    mod.build()
    sc = bpy.context.scene
    sc.frame_end = max(1, int(round(dur * FPS)))
    print('built shot %d in %.1fs, %d frames' % (n, time.time() - t0, sc.frame_end))
    if a.get('save'):
        os.makedirs(os.path.join(BUILD, 'blend'), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, 'blend', 's%02d.blend' % n))
        return
    if a.get('sheet'):
        frames = list(range(1, sc.frame_end + 1, FPS // 2))
        if frames[-1] != sc.frame_end:
            frames.append(sc.frame_end)
        out_dir = os.path.join(BUILD, 'sheet', 's%02d' % n)
    elif 'frame' in a:
        frames = [int(x) for x in a['frame'].split(',')]
        out_dir = os.path.join(BUILD, 'stills')
    elif 'frames' in a:
        lo, hi = a['frames'].split('-')
        frames = list(range(int(lo), int(hi) + 1))
        out_dir = os.path.join(BUILD, 'shots', 's%02d' % n)
    else:
        frames = list(range(1, sc.frame_end + 1))
        out_dir = os.path.join(BUILD, 'shots', 's%02d' % n)
    if 'every' in a:
        frames = frames[::int(a['every'])]
    os.makedirs(out_dir, exist_ok=True)
    for f in frames:
        name = ('s%02d_f%04d.png' % (n, f)) if ('frame' in a or a.get('sheet')) else ('f_%04d.png' % f)
        path = os.path.join(out_dir, name)
        if a.get('skip') and os.path.exists(path):
            continue
        sc.frame_set(f)
        sc.render.filepath = path
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('frame %d  %.1fs  %s' % (f, time.time() - t1, path))
    print('done in %.1fs' % (time.time() - t0))


main()
