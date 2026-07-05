#!/usr/bin/env python3
"""Item-memoria: libro + scroll, 16x16, 2 frame (closed|open), palette LoL.
Sostituiscono i vettoriali _drawBook/_drawScroll. Sheet 32x16 -> sprites/items/.
"""
from PIL import Image

PAL = {
    '.': None,
    'K': "#1a1a1a",   # outline
    'C': "#735f4b",   # copertina/legno brown LoL
    'c': "#463a2e",   # brown scuro (dorso/ombra)
    'P': "#f0ebc0",   # pagine crema
    'p': "#d9b898",   # pergamena/ombra pagina (tan LoL)
    'G': "#bf6979",   # gemma/nastro rosa-magia
}

BOOK_CLOSED = [
    "................",
    "................",
    "....KKKKKKKK....",
    "...KCCCCCCPpK...",
    "...KcCCCCCPpK...",
    "...KcCCGGCPpK...",
    "...KcCCGGCPpK...",
    "...KcCCCCCPpK...",
    "...KcCCCCCPpK...",
    "...KcCCCCCPpK...",
    "...KCCCCCCPpK...",
    "....KKKKKKKK....",
    "................",
    "................",
    "................",
    "................",
]
BOOK_OPEN = [
    "................",
    "................",
    "..KKKKKKKKKKKK..",
    "..KCPPPPPPPPCK..",
    "..KCpPPppPPpCK..",
    "..KCPPPPPPPPCK..",
    "..KCpPPppPPpCK..",
    "..KCPPPPPPPPCK..",
    "..KCpPPppPPpCK..",
    "..KCPPPPPPPPCK..",
    "..KcCCCCCCCCcK..",
    "..KKKKKKKKKKKK..",
    "................",
    "................",
    "................",
    "................",
]
SCROLL_ROLLED = [
    "................",
    "................",
    ".....KKKKKK.....",
    ".....KCCCCK.....",
    ".....KppppK.....",
    ".....KpPPpK.....",
    ".....KGGGGK.....",
    ".....KpPPpK.....",
    ".....KpPPpK.....",
    ".....KppppK.....",
    ".....KCCCCK.....",
    ".....KKKKKK.....",
    "................",
    "................",
    "................",
    "................",
]
SCROLL_OPEN = [
    "................",
    "................",
    "..KKKKKKKKKKKK..",
    "..KCppppppppCK..",
    "..KCpPPpPPppCK..",
    "..KCppppppppCK..",
    "..KCpPPpPPppCK..",
    "..KCppppppppCK..",
    "..KCpPPpPPppCK..",
    "..KCppppppppCK..",
    "..KKKKKKKKKKKK..",
    "................",
    "................",
    "................",
    "................",
    "................",
]
for g in (BOOK_CLOSED, BOOK_OPEN, SCROLL_ROLLED, SCROLL_OPEN):
    assert all(len(r) == 16 for r in g) and len(g) == 16

def hx(h):
    h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 255)

def frame(grid):
    im = Image.new("RGBA", (16,16), (0,0,0,0)); px = im.load()
    for y,row in enumerate(grid):
        for xx,c in enumerate(row):
            col = PAL.get(c)
            if col: px[xx,y] = hx(col)
    return im

def sheet(a, b, path):
    sh = Image.new("RGBA",(32,16),(0,0,0,0))
    sh.paste(frame(a),(0,0)); sh.paste(frame(b),(16,0))
    sh.save(path); print("wrote", path)

ITEMS = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/sprites/items"
sheet(BOOK_CLOSED, BOOK_OPEN, f"{ITEMS}/book.png")
sheet(SCROLL_ROLLED, SCROLL_OPEN, f"{ITEMS}/scroll.png")

# preview 10x
S=10; prev=Image.new("RGBA",(4*16*S+5*8,16*S+16),(20,16,28,255))
for i,g in enumerate([BOOK_CLOSED,BOOK_OPEN,SCROLL_ROLLED,SCROLL_OPEN]):
    f=frame(g).resize((16*S,16*S),Image.NEAREST); prev.paste(f,(8+i*(16*S+8),8),f)
prev.save("/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/palettes/items_preview.png")
print("preview ok")
