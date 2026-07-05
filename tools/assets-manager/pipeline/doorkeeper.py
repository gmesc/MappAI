#!/usr/bin/env python3
"""Door keeper sprite — 16x16 x4 frame sheet (64x16) per mappai-games.js.
Custode della Soglia: incappucciato viola, occhi glow cyan, chiave d'oro. Idle = pulse glow.
"""
from PIL import Image

# palette ALLINEATA a Legend of Lua (campionata da mage.png + key.png; vedi STYLE_GUIDE.md)
PAL = {
    '.': None,
    'K': "#1a1a1a",   # outline LoL standard
    'F': "#201729",   # ombra interna cappuccio (LoL tinted dark)
    'R': "#546799",   # mantello main = slate blu-viola del mage LoL
    'r': "#464a73",   # mantello ombra (mage LoL)
    'T': "#bf6979",   # trim/accento rosa magia (mage LoL)
    't': "#f0ebc0",   # highlight crema (mage LoL)
    'E': "#f0ebc0",   # occhi glow crema
    'e': "#464a73",   # occhi dim
    'G': "#dadada",   # chiave argento (LoL key è argento, non oro)
    'g': "#bfbfbf",   # chiave ombra
}

# base 16x16 (16 righe x 16 col). Chiave d'oro a dx: anello(r8-10)+stelo(r11)+dente(r12)
BASE = [
    "................",
    "......KKKK......",
    ".....KRRRRK.....",
    "....KRRRRRRK....",
    "....KRFFFFRK....",
    "....KRFEEFRK....",
    "....KRFFFFRK....",
    "...KRRRRRRRRK...",
    "...KRRtTTtRRKGG.",
    "...KRRtTTtRRKGgG",
    "...KRRtTTtRRKGG.",
    "..KRRrRTTRrRK.G.",
    "..KRRrRRRRrRK.GG",
    "..KRRrRRRRrRK...",
    "..KRRrRRRRrRK...",
    "..KKKKKKKKKKK...",
]
assert all(len(r) == 16 for r in BASE) and len(BASE) == 16, "grid non 16x16"

def hx(h):
    h=h.lstrip('#'); return (int(h[0:2],16),int(h[2:4],16),int(h[4:6],16),255)

def frame(grid, eye, trim):
    im=Image.new("RGBA",(16,16),(0,0,0,0)); px=im.load()
    for y,row in enumerate(grid):
        for x,c in enumerate(row):
            col=PAL.get(c)
            if c=='E': col=eye
            elif c=='T': col=trim
            if col: px[x,y]=hx(col)
    return im

# 4 frame: pulse occhi + trim (breathing) — palette LoL
FRAMES=[("#f0ebc0","#bf6979"),("#f5f5f5","#d68a93"),("#f0ebc0","#bf6979"),("#cfcdaa","#9a5562")]
sheet=Image.new("RGBA",(64,16),(0,0,0,0))
for i,(e,t) in enumerate(FRAMES):
    sheet.paste(frame(BASE,e,t),(i*16,0))

OUT="/Users/giacomomeschini/Claude/MappAI BERT/public/assets/gatekeeper.png"
sheet.save(OUT); print("wrote",OUT,sheet.size)

# preview 12x con sfondo scuro
S=12; prev=Image.new("RGBA",(64*S+5*8,16*S+16),(20,16,28,255))
for i in range(4):
    f=sheet.crop((i*16,0,i*16+16,16)).resize((16*S,16*S),Image.NEAREST)
    prev.paste(f,(8+i*(16*S+8),8),f)
prev.save("/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/palettes/doorkeeper_preview.png")
print("preview ok")
