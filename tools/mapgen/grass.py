#!/usr/bin/env python3
"""Generatore erba — Memory Dungeon (stile Legend of Lua).

VALIDATO 2026-06-30. Modulo riusabile e tweakabile (l'utente potrebbe tornarci).
Approccio: base verde PIATTA + fili-ciuffo disegnati e SPARSI a posizione random
(niente griglia). Ogni filo: punta chiara -> base leggermente più scura (gradiente
1-2px), scuro SEMPRE alla base; su ~1/3 dei fili un pixel HIGHLIGHT all'apice
(colpi di luce). Flip SOLO orizzontale (mai verticale: lo scuro deve restare in basso).

Uso:
    from grass import make_grass, scatter_tufts, PALETTE
    img = make_grass(320, 256, seed=1)          # campo erba intero
    scatter_tufts(img, lambda x,y: True, seed=1) # sparge su un'immagine esistente

Per ritoccare lo stile: modifica PALETTE / DENSITY / HIGHLIGHT_RATE / BLADE_HEIGHTS.
"""
from PIL import Image
import random

# ---- parametri tweakabili ----
PALETTE = {
    "base":      (58, 190, 65, 255),   # #3abe41  verde campo (= overworld.png [0,0])
    "shadow":    (52, 168, 63, 255),   # #34a83f  base del filo (ombra LEGGERA, non scura)
    "mid":       (58, 190, 65, 255),   # mid gradiente (= base)
    "tip":       (110, 222, 80, 255),  # punta chiara
    "highlight": (156, 240, 112, 255), # colpo di luce all'apice
}
DENSITY = 0.014        # fili per pixel
HIGHLIGHT_RATE = 0.33  # frazione di fili con apice illuminato
BLADE_HEIGHTS = [2, 2, 3]   # altezze possibili (2px = grad 1px, 3px = grad 2px)
BLADES_PER_TUFT = [1, 1, 2, 3]

def _blade(rnd):
    """Un filo: lista (dx,dy,color), dy=0 in cima, base (dy max) sempre 'shadow'."""
    h = rnd.choice(BLADE_HEIGHTS)
    col = [PALETTE["tip"], PALETTE["shadow"]] if h == 2 else [PALETTE["tip"], PALETTE["mid"], PALETTE["shadow"]]
    if rnd.random() < HIGHLIGHT_RATE:
        col[0] = PALETTE["highlight"]
    return [(0, i, col[i]) for i in range(h)]

def scatter_tufts(img, allow=lambda x, y: True, seed=1, density=DENSITY):
    """Sparge ciuffi su `img` (RGBA, modificata in-place) dove allow(x,y) è True.
    `allow` serve nelle mappe per spargere SOLO sulle celle d'erba (non sulla terra)."""
    GW, GH = img.size
    ip = img.load()
    rnd = random.Random(seed)
    n = int(GW * GH * density)
    for _ in range(n):
        ox = rnd.randint(1, GW - 2); oy = rnd.randint(0, GH - 4)
        fh = rnd.random() < 0.5
        nb = rnd.choice(BLADES_PER_TUFT)
        for k in range(nb):
            bx = ox + (-k * 2 if fh else k * 2)
            for (dx, dy, c) in _blade(rnd):
                X = bx; Y = oy + dy + (1 if k == 1 else 0)
                if 0 <= X < GW and 0 <= Y < GH and allow(X, Y):
                    ip[X, Y] = c
    return img

def make_grass(width_px, height_px, seed=1, density=DENSITY):
    """Campo d'erba intero: base piatta + ciuffi sparsi."""
    img = Image.new("RGBA", (width_px, height_px), PALETTE["base"])
    return scatter_tufts(img, seed=seed, density=density)

if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(__file__), "grass_preview.png")
    make_grass(16 * 16, 10 * 16, seed=1).resize((16 * 16 * 5, 10 * 16 * 5), Image.NEAREST).save(out)
    print("scritto", out)
