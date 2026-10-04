"""Final mix: picture + synthesised score + the game's own CC0 sound effects -> out/stickchers-trailer.mp4"""
import subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__)); A = os.path.join(HERE, '..', '..', '..', 'assets', 'audio', 'sfx')
BUILD = os.path.join(HERE, '..', 'build'); OUT = os.path.join(HERE, '..', 'out'); os.makedirs(OUT, exist_ok=True)
ev = []
def e(f, t, v=1.0): ev.append((f, t, v))
def rel(t, v=1.0): e('bow_release', t, v); e('arrow_whoosh', t + 0.02, v)
def steps(t0, t1, dt=0.13, v=0.6):
    t = t0
    while t < t1: e('footstep', t, v); t += dt
# 1-3: stand-off and first arrow
e('draw_start', 1.8, 0.8); e('emote_pop', 2.15, 0.9)
e('draw_start', 4.1, 0.8); e('draw_start', 4.7, 0.8); e('whoosh_fast', 5.33, 0.9); e('emote_pop', 6.45, 1.1)
e('draw_start', 7.05, 1.2)
for t in (7.4, 7.6, 7.78): e('draw_tick', t, 1.6)
rel(7.92, 1.4); e('whoosh_fast', 8.05, 1.3); e('hit_wood', 8.3, 1.1); e('vs_slam', 9.0, 1.0)
# 4: chaos
for t in (10.0, 11.0, 12.0, 13.0): e('whoosh_fast', t, 0.8)
steps(10.05, 10.95); rel(10.25); e('hit_wood', 10.42, 1.1); steps(11.0, 11.4); e('hit_ground', 11.44, 0.9); rel(11.35)
steps(12.0, 12.95); rel(12.28); rel(13.15); rel(13.42); e('hit_ground', 13.86, 1.2)
# 5: comedy
e('draw_start', 14.45, 0.9); rel(15.3, 1.2); e('hit_wood', 15.5, 1.5); e('emote_pop', 16.25, 0.7); e('draw_start', 17.6, 1.5); e('emote_pop', 18.1, 1.0)
# 6: montage and slow-motion arrow
for i in range(6): e('whoosh_fast', 18.5 + i * 0.5, 0.6); rel(18.65 + i * 0.5, 1.0)
e('arrow_whoosh', 21.6, 0.5); e('whoosh_fast', 22.98, 1.2); e('hit_wood', 23.12, 1.6); e('hit_body', 23.12, 1.0)
# 7-8: the six, escalation
e('emote_pop', 24.7, 0.7); e('vs_slam', 25.5, 0.9); e('draw_start', 25.6, 0.8)
steps(27.5, 28.2); e('hit_ground', 28.86, 0.9)
for t in (27.8, 28.1, 28.4, 28.9, 29.3, 29.5, 29.7, 29.9): rel(t, 0.9)
for t in (28.25, 29.1, 29.75): e('hit_wood', t, 0.8)
e('grunt', 29.5, 0.6); e('hit_ground', 30.42, 1.2); e('vs_slam', 30.55, 1.1)
for t in (30.6, 30.78, 30.97, 31.16, 31.35): e('arrow_whoosh', t, 0.7)
# 9: hero shot
e('draw_start', 31.6, 1.4)
for t in (32.2, 32.5, 32.75): e('draw_tick', t, 1.6)
rel(33.0, 1.5); e('whoosh_fast', 33.1, 1.2); e('arrow_whoosh', 33.5, 0.9); e('whoosh_fast', 34.0, 1.2)
# 10: game reveal
e('match_found', 34.55, 1.0); e('draw_start', 34.9, 0.9); rel(35.9, 1.0); e('hit_head', 36.4, 1.3); e('jingle_kill', 36.45, 0.7)
# 11: title
e('draw_start', 37.8, 0.9); rel(38.0, 1.0); e('hit_wood', 38.22, 1.3); e('body_drop', 38.24, 1.2); e('vs_slam', 38.6, 1.3); e('crowd_cheer', 38.8, 0.45); e('ui_confirm', 39.9, 0.9)
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, 'picture.mp4'), '-i', os.path.join(BUILD, 'music.wav'),
       '-stream_loop', '1', '-i', os.path.join(HERE, '..', '..', '..', 'assets', 'audio', 'music', 'amb_fire.mp3')]
fg = ["[1:a]volume=0.82[mus]", "[2:a]atrim=0:41,volume='if(lt(t,10),1.1,0.35)':eval=frame,afade=t=in:d=0.8[amb]"]; labs = ['[mus]', '[amb]']
for i, (f, t, v) in enumerate(ev):
    cmd += ['-i', os.path.join(A, f + '.mp3')]; fg.append("[%d:a]adelay=%d:all=1,volume=%.2f[s%d]" % (i + 3, int(t * 1000), v * 1.25, i)); labs.append('[s%d]' % i)
fg.append(''.join(labs) + "amix=inputs=%d:normalize=0:duration=longest,atrim=0:41,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=40.6:d=0.4,aresample=48000,aformat=channel_layouts=stereo[a]" % len(labs))
out = os.path.join(OUT, 'stickchers-trailer.mp4')
cmd += ['-filter_complex', ';'.join(fg), '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '9M', '-bufsize', '18M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-t', '41', '-movflags', '+faststart', out]
subprocess.run(cmd, check=True); print(len(ev), 'sfx events ->', os.path.normpath(out))
