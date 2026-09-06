#!/usr/bin/env python3
"""Create a short vertical Trek product guide without external video tooling."""
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
from pathlib import Path
from io import BytesIO
import math, os, struct, sys

W, H, FPS, SECONDS = 1080, 1920, 12, 25
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets/trek-mobile-guide.avi"
FRAMES_DIR = Path(os.environ["TREK_FRAMES_DIR"]) if os.environ.get("TREK_FRAMES_DIR") else None
DASH = Path("/Users/vladimirgnatovsky/Downloads/Снимок экрана 2026—09—06 в 14.53.57.png")
COACH = Path("/Users/vladimirgnatovsky/Downloads/Screenshot at Sep 06 11-38-39.png")
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"

BG, PANEL, GREEN, MUTED, BORDER, WHITE = "#070d0f", "#0e171a", "#00e5a0", "#a6b5ae", "#2a413b", "#f4f8f6"
dashboard, coach = Image.open(DASH).convert("RGB"), Image.open(COACH).convert("RGB")

def f(size, bold=False): return ImageFont.truetype(FONT, size, index=1 if bold else 0)
def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)
def alpha(t,a,b,fade=.45): return min(ease((t-a)/fade),ease((b-t)/fade))
def txt(d,s,xy,size,color=WHITE,bold=False,anchor="la",spacing=8):
    d.multiline_text(xy,s,font=f(size,bold),fill=color,anchor=anchor,spacing=spacing)
def grid(d):
    for x in range(0,W,56): d.line((x,0,x,H),fill="#0c1718",width=1)
    for y in range(0,H,56): d.line((0,y,W,y),fill="#0c1718",width=1)
def logo(d,y):
    d.rectangle((72,y,130,y+58),fill=GREEN)
    d.line((88,y+40,114,y+14),fill=BG,width=5); d.line((100,y+14,114,y+14),fill=BG,width=5); d.line((114,y+14,114,y+28),fill=BG,width=5)
    txt(d,"Trek",(150,y+29),42,bold=True,anchor="lm")
def card(d,icon,title,detail,y):
    d.rounded_rectangle((74,y,1006,y+210),26,fill=PANEL,outline=BORDER,width=3)
    d.rounded_rectangle((112,y+44,228,y+160),24,fill="#0c4836")
    txt(d,icon,(170,y+102),46,GREEN,bold=True,anchor="mm")
    txt(d,title,(262,y+70),38,bold=True,anchor="lm")
    txt(d,detail,(262,y+127),27,MUTED,anchor="lm")
def fit(im,box,crop=False):
    x,y,w,h=box
    scale=max(w/im.width,h/im.height) if crop else min(w/im.width,h/im.height)
    resized=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    canvas=Image.new("RGB",(w,h),PANEL)
    canvas.paste(resized,((w-resized.width)//2,(h-resized.height)//2))
    mask=Image.new("L",(w,h)); ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),34,fill=255)
    return canvas,mask,(x,y)
def fade_layer(base,layer,a):
    if a<=0:return base
    return Image.blend(base,layer,max(0,min(1,a)))

def scene(t):
    base=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(base); grid(d)
    layers=[]
    if t<3.4:
        a=alpha(t,0,3.4); im=base.copy(); q=ImageDraw.Draw(im); logo(q,130)
        txt(q,"TREK MOBILE · QUICK GUIDE",(74,600),24,GREEN,bold=True)
        txt(q,"Your money.\nYour pace.",(70,670),102,bold=True,spacing=-5)
        txt(q,"A 25-second tour of the essentials.",(76,990),34,MUTED)
        layers.append((im,a))
    if 3<=t<8:
        a=alpha(t,3,8); im=base.copy(); q=ImageDraw.Draw(im); logo(q,64)
        txt(q,"01  OVERVIEW",(72,170),24,GREEN,bold=True)
        txt(q,"Know your monthly pace\nat a glance.",(72,225),58,bold=True)
        shot,mask,pos=fit(dashboard,(105,470,870,1280),crop=True); im.paste(shot,pos,mask)
        q.rounded_rectangle((105,470,975,1750),34,outline=BORDER,width=3)
        layers.append((im,a))
    if 7.6<=t<12:
        a=alpha(t,7.6,12); im=base.copy(); q=ImageDraw.Draw(im); logo(q,64)
        txt(q,"02  CAPTURE SPENDING",(72,180),24,GREEN,bold=True)
        txt(q,"Add it once.\nTrek does the sorting.",(72,260),64,bold=True)
        card(q,"+","Add a transaction","Amount, category and date in seconds",650)
        card(q,"▣","Scan a receipt","AI reads the total and merchant for you",900)
        card(q,"CSV","Import statements","Categorization and currency conversion",1150)
        layers.append((im,a))
    if 11.6<=t<16:
        a=alpha(t,11.6,16); im=base.copy(); q=ImageDraw.Draw(im); logo(q,64)
        txt(q,"03  PLAN AHEAD",(72,180),24,GREEN,bold=True)
        txt(q,"Give every euro\na clear direction.",(72,260),64,bold=True)
        q.rounded_rectangle((72,640,1008,1040),32,fill=PANEL,outline=BORDER,width=3)
        txt(q,"MONTHLY PLAN",(120,700),24,MUTED,bold=True); txt(q,"€3,000",(120,780),86,GREEN,bold=True)
        txt(q,"Budget assigned",(120,905),30,MUTED)
        card(q,"◎","Goals","Track progress and the pace required",1100)
        card(q,"↻","Recurring","See upcoming bills before they land",1350)
        layers.append((im,a))
    if 15.6<=t<20:
        a=alpha(t,15.6,20); im=base.copy(); q=ImageDraw.Draw(im); logo(q,64)
        txt(q,"04  TREK COACH",(72,180),24,GREEN,bold=True)
        txt(q,"Ask what to change\nthis month.",(72,260),64,bold=True)
        crop=coach.crop((250,120,1750,1190)); shot,mask,pos=fit(crop,(72,610,936,820),crop=True); im.paste(shot,pos,mask)
        q.rounded_rectangle((72,610,1008,1430),34,outline=BORDER,width=3)
        txt(q,"Private guidance from your aggregated budget.",(540,1515),31,MUTED,anchor="ma")
        layers.append((im,a))
    if 19.6<=t<23:
        a=alpha(t,19.6,23); im=base.copy(); q=ImageDraw.Draw(im); logo(q,64)
        txt(q,"05  CRYPTO",(72,180),24,GREEN,bold=True)
        txt(q,"See your portfolio\nnext to your cash flow.",(72,260),64,bold=True)
        card(q,"₿","Bitcoin","Live price · allocation · profit/loss",670)
        card(q,"Ξ","Ethereum","One money view across your assets",920)
        txt(q,"Manual holdings now. Secure exchange sync next.",(540,1280),30,MUTED,anchor="ma")
        layers.append((im,a))
    if t>=22.6:
        a=alpha(t,22.6,25.2,.5); im=base.copy(); q=ImageDraw.Draw(im); logo(q,300)
        txt(q,"Take control of\nyour next month.",(540,620),80,bold=True,anchor="ma")
        q.rounded_rectangle((184,1030,896,1148),10,fill=GREEN)
        txt(q,"OPEN TREK",(540,1089),34,BG,bold=True,anchor="mm")
        txt(q,"trekapp.up.railway.app",(540,1240),28,MUTED,anchor="ma")
        layers.append((im,a))
    for layer,a in layers: base=fade_layer(base,layer,a)
    return base

def chunk(tag,data): return tag+struct.pack("<I",len(data))+data+(b"\0" if len(data)&1 else b"")
frames=W*H*3
avih=struct.pack("<IIIIIIIIII4I",int(1e6/FPS),frames*FPS,0,0x10,FPS*SECONDS,0,1,frames,W,H,0,0,0,0)
strh=struct.pack("<4s4sIHHIIIIIIIIhhhh",b"vids",b"MJPG",0,0,0,0,1,FPS,0,FPS*SECONDS,frames,0xffffffff,0,0,0,W,H)
strf=struct.pack("<IiiHH4sIiiII",40,W,H,1,24,b"MJPG",frames,0,0,0,0)
strl=b"LIST"+struct.pack("<I",4+len(chunk(b"strh",strh))+len(chunk(b"strf",strf)))+b"strl"+chunk(b"strh",strh)+chunk(b"strf",strf)
hdrl=b"LIST"+struct.pack("<I",4+len(chunk(b"avih",avih))+len(strl))+b"hdrl"+chunk(b"avih",avih)+strl
OUT.parent.mkdir(parents=True,exist_ok=True)
if FRAMES_DIR: FRAMES_DIR.mkdir(parents=True,exist_ok=True)
with OUT.open("wb") as out:
    out.write(b"RIFF\0\0\0\0AVI "+hdrl); movi=out.tell(); out.write(b"LIST\0\0\0\0movi"); index=[]
    for n in range(FPS*SECONDS):
        buf=BytesIO(); scene(n/FPS).save(buf,"JPEG",quality=82,subsampling=1); data=buf.getvalue(); pos=out.tell()
        if FRAMES_DIR: (FRAMES_DIR / f"{n:04d}.jpg").write_bytes(data)
        out.write(chunk(b"00dc",data)); index.append((pos-(movi+8),len(data)))
    end=out.tell(); out.seek(movi+4); out.write(struct.pack("<I",end-movi-8)); out.seek(end)
    idx=b"".join(struct.pack("<4sIII",b"00dc",0x10,offset,size) for offset,size in index); out.write(chunk(b"idx1",idx))
    final=out.tell(); out.seek(4); out.write(struct.pack("<I",final-8))
print(OUT)
