from math import isclose

def rgb(hexv):
    h=hexv.lstrip('#'); return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def lin(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lum(h):
    r,g,b=rgb(h); return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)
def ratio(a,b):
    L1,L2=sorted((lum(a),lum(b)), reverse=True); return (L1+.05)/(L2+.05)
checks=[
    ('ink/canvas','#132124','#f5f7f4',4.5),
    ('text/canvas','#26383b','#f5f7f4',4.5),
    ('muted/canvas','#657477','#f5f7f4',4.5),
    ('white/deep','#f7fbfa','#0a3f3d',4.5),
    ('deep-muted/deep','#c7dad7','#0a3f3d',4.5),
    ('teal/white','#0a817d','#ffffff',4.5),
]
failed=[]
for name,fg,bg,target in checks:
    r=ratio(fg,bg)
    print(f'{name}: {r:.2f}:1 (target {target}:1)')
    if r<target: failed.append((name,r,target))
if failed:
    raise SystemExit('Contrast failures: '+repr(failed))
