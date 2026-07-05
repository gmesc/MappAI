#!/usr/bin/env python3
"""Boss "Guardiano della Memoria" — 32x32 x4 frame (sheet 128x32), palette LoL.
Sorcerer-golem incappucciato, due occhi glow, tomo della memoria al petto. Idle = pulse glow.
Simmetrico: si autora la meta sinistra (16 col) e si specchia.
"""
from PIL import Image

PAL = {
    '.': None,
    'K': "#1a1a1a",   # outline
    'F': "#201729",   # interno cappuccio
    'R': "#546799",   # mantello main (slate-viola LoL)
    'r': "#464a73",   # mantello ombra
    'T': "#bf6979",   # trim/accento rosa (frame-driven)
    't': "#f0ebc0",   # highlight crema
    'E': "#f0ebc0",   # occhi (frame-driven)
    'B': "#735f4b",   # copertina tomo (brown LoL)
    'b': "#463a2e",   # tomo scuro
    'P': "#f0ebc0",   # pagine crema
}

# META SINISTRA, 16 col (index 15 = cucitura centrale). Specchiata a destra.
HALF = [
    "................",
    "................",
    "................",
    ".............KKK",
    "............KRRR",
    "...........KRRRR",
    "..........KRRRRR",
    ".........KRRFFFF",
    ".........KRFFEFF",
    ".........KRFFFFF",
    ".........KRRFFFF",
    "........KRRRRRRR",
    ".......KRRRRRRRR",
    "......KRRRRRRRRR",
    "......KRRrRRRRRR",
    "......KRRrRRBBPP",
    "......KRRrRRBPPP",
    "......KRRrRRBBPP",
    "......KRRrRRRTRR",
    ".....KRRrRRRTRRR",
    ".....KRRrRRRTRRR",
    ".....KRRrRRRRRRR",
    "....KRRrRRRRRRRR",
    "....KRRrRRRRRRRR",
    "....KRRrRRRRRRRR",
    "...KRRrRRRRRRRRR",
    "...KRRrRRRRRRRRR",
    "..KRRrRRRRRRRRRR",
    "..KRRRRRRRRRRRRR",
    ".KKKKKKKKKKKKKKK",
    "................",
    "................",
]
assert all(len(r) == 16 for r in HALF) and len(HALF) == 32, "half non 16x32"

def hx(h):
    h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 255)

def grid_full():
    return [row + row[::-1] for row in HALF]   # 32x32 specchiato

def frame(grid, eye, trim):
    im = Image.new("RGBA", (32, 32), (0,0,0,0)); px = im.load()
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            col = PAL.get(c)
            if c == 'E': col = eye
            elif c == 'T': col = trim
            if col: px[x, y] = hx(col)
    return im

FRAMES = [("#f0ebc0","#bf6979"),("#f5f5f5","#d68a93"),("#f0ebc0","#bf6979"),("#cfcdaa","#9a5562")]
G = grid_full()
sheet = Image.new("RGBA", (128, 32), (0,0,0,0))
for i,(e,t) in enumerate(FRAMES):
    sheet.paste(frame(G, e, t), (i*32, 0))
OUT = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/sprites/enemies/boss_guardian.png"
sheet.save(OUT); print("wrote", OUT, sheet.size)

# preview 9x sfondo scuro
S=9; prev=Image.new("RGBA",(128*S+5*8,32*S+16),(20,16,28,255))
for i in range(4):
    f=sheet.crop((i*32,0,i*32+32,32)).resize((32*S,32*S),Image.NEAREST)
    prev.paste(f,(8+i*(32*S+8),8),f)
prev.save("/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/palettes/boss_preview.png")
print("preview ok")
