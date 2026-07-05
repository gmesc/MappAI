#!/usr/bin/env python3
"""Pipeline retheme (#3) — recolor parametrico di sprite LoL via color-map esatta.
Uso: importa recolor_sheet() o lancia da CLI per generare gli outfit eroe.
Reversibile: scrive SEMPRE file nuovi, non tocca gli originali.
"""
from PIL import Image
from pathlib import Path

def recolor_sheet(src: str, dst: str, cmap: dict[str, str]) -> None:
    """cmap: {'#rrggbb' originale: '#rrggbb' nuovo}. Match esatto su pixel opachi."""
    def h2t(h): h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
    m = {h2t(k): h2t(v) for k, v in cmap.items()}
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and (r, g, b) in m:
                nr, ng, nb = m[(r, g, b)]
                px[x, y] = (nr, ng, nb, a)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst)

# Outfit eroe: tunica = #d73b4a (main) + #9f2c48 (shadow). Resto invariato.
HERO = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/sprites/player/playerSheet1.png"
OUT = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/sprites/player"
OUTFITS = {
    # nome : (main DB32, shadow DB32)
    "Verde":  ("#6abe30", "#37946e"),   # studioso
    "Blu":    ("#5b6ee1", "#3f3f74"),   # mago
    "Viola":  ("#76428a", "#45283c"),   # reale
}

if __name__ == "__main__":
    for name, (main, shadow) in OUTFITS.items():
        dst = f"{OUT}/playerSheet{name}.png"
        recolor_sheet(HERO, dst, {"#d73b4a": main, "#9f2c48": shadow})
        print("wrote", dst)
