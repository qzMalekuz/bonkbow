import sys
SRC,OUT,SHEET=sys.argv[1],sys.argv[2],sys.argv[3]  # hi-res page dir, sprite dir, contact sheet
from PIL import Image, ImageDraw
import numpy as np, os
from scipy import ndimage as ndi
names={1:'smile',2:'shades',3:'curls',4:'mobile',5:'beard',6:'fade'}
std={'front':(0.0,0.06,0.145,0.42),'front34':(0.14,0.06,0.275,0.42),'back':(0.42,0.06,0.56,0.42),
     'idle':(0.0,0.46,0.13,0.665),'aiming':(0.125,0.44,0.27,0.665),'shooting':(0.265,0.44,0.425,0.665),
     'walk':(0.45,0.46,0.57,0.665),'run':(0.57,0.46,0.71,0.665),'crouch':(0.72,0.46,0.90,0.665),'lookback':(0.885,0.46,1.0,0.665)}
shades={'front':(0.0,0.05,0.19,0.40),'front34':(0.19,0.05,0.36,0.40),'back':(0.50,0.05,0.66,0.40),
     'idle':(0.82,0.05,1.0,0.40),'aiming':(0.0,0.40,0.22,0.70),'shooting':(0.40,0.40,0.62,0.70),
     'walk':(0.20,0.40,0.38,0.70),'run':(0.80,0.40,1.0,0.70),'crouch':(0.62,0.40,0.83,0.70),'lookback':(0.68,0.05,0.82,0.40)}
exprs_std=[(0.012+i*0.092,0.73,0.012+(i+1)*0.092+0.006,0.905) for i in range(5)]
def cutout(im, dark):
    a=np.asarray(im.convert('RGB')).astype(int)
    if dark:
        # bg is mid grey (~70-85); suit is near black, so key on luminance band + low saturation
        lum=a.mean(2); sat=a.max(2)-a.min(2)
        bg=(lum>52)&(lum<115)&(sat<14)
    else:
        bg=(a.min(2)>198)&((a.max(2)-a.min(2))<26)
    # only background connected to the border counts
    lab,n=ndi.label(bg)
    border=np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]]))
    sizes=ndi.sum(bg,lab,range(1,n+1))
    big=np.array([i+1 for i,sz in enumerate(sizes) if sz>350])
    bgc=np.isin(lab,border[border>0])|np.isin(lab,big)
    fg=~bgc
    fg=ndi.binary_opening(fg,iterations=1)
    lab,n=ndi.label(fg)
    if n==0: return None
    sizes=ndi.sum(fg,lab,range(1,n+1))
    keep=lab==(1+int(np.argmax(sizes)))
    alpha=(ndi.gaussian_filter(keep.astype(float),0.8)*255).clip(0,255).astype('uint8')
    out=np.dstack([np.asarray(im.convert('RGB')),alpha])
    ys,xs=np.where(keep)
    return Image.fromarray(out).crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
for p,n in names.items():
    im=Image.open(f'{SRC}/p-{p}.png'); W,H=im.size
    for k,(x0,y0,x1,y1) in (shades if n=='shades' else std).items():
        c=cutout(im.crop((int(x0*W),int(y0*H),int(x1*W),int(y1*H))), n=='shades')
        if c: c.save(f'{OUT}/{n}_{k}.png')
# contact sheet on dark bg
files=sorted(os.listdir(OUT))
cs=Image.new('RGB',(10*220,6*240),(28,22,34))
for i,n in enumerate(names.values()):
    for j,k in enumerate(std.keys()):
        f=f'{OUT}/{n}_{k}.png'
        if os.path.exists(f):
            s=Image.open(f); s.thumbnail((210,230)); cs.paste(s,(j*220+5,i*240+5),s)
cs.save(SHEET)
