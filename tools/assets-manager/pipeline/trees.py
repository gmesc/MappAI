#!/usr/bin/env python3
"""Alberi stile Legend of Lua — generati proceduralmente (skill pixel-art-trees).
v3: LUCE DIFFUSA DA DESTRA 45° + volumetrico clusterizzato (noise low-freq).
Fix asimmetria/tronco: jitter seeded (no simmetria), tronco off-center+lean disegnato
SOTTO la chioma (z corretto), flare-radici organico asimmetrico, cerchio-skirt che
connette chioma e tronco. Palette LoL estesa, 64x64 bottom-aligned.
"""
from PIL import Image
import math, random

OUTDIR = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/sprites/environment"
PREV = "/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/palettes/trees_preview.png"

GREEN  = dict(hl="#b6f0a0", fl="#84de92", fm="#78cd85", fs="#60ae8c", ds="#458a6f",
              ol="#1a1a1a", tl="#c39364", tm="#9c7044", td="#6b4d33")
AUTUMN = dict(hl="#d98a6a", fl="#bd555f", fm="#8c3f52", fs="#733453", ds="#532641",
              ol="#1a1a1a", tl="#b39374", tm="#8a6b4f", td="#5e4636")
PINEG  = dict(hl="#7fc98a", fl="#5fae74", fm="#4d9163", fs="#3c7351", ds="#2b5740",
              ol="#1a1a1a", tl="#9c7350", tm="#7a5a3c", td="#5a4230")

def hx(h):
    h = h.lstrip('#'); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 255)

def _lowfreq(W, H, cells, seed):
    rnd = random.Random(seed)
    g = [[rnd.random() for _ in range(cells+2)] for _ in range(cells+2)]
    def s(x, y):
        fx = x/W*cells; fy = y/H*cells
        x0 = int(fx); y0 = int(fy); tx = fx-x0; ty = fy-y0
        tx = tx*tx*(3-2*tx); ty = ty*ty*(3-2*ty)
        a = g[y0][x0]*(1-tx) + g[y0][x0+1]*tx
        b = g[y0+1][x0]*(1-tx) + g[y0+1][x0+1]*tx
        return a*(1-ty) + b*ty
    return s

def gen(circles, trunk_w, trunk_h, pal, seed, W=64, H=64):
    rnd = random.Random(seed)
    # JITTER asimmetrico (rompe la simmetria a specchio)
    cj = [(cx + rnd.randint(-2, 3), cy + rnd.randint(-1, 2), max(3, r + rnd.randint(-1, 1)))
          for (cx, cy, r) in circles]
    px = [[None]*W for _ in range(H)]
    cxC = sum(c[0] for c in cj)/len(cj)
    cyC = sum(c[1] for c in cj)/len(cj)
    lf = _lowfreq(W, H, 7, seed)
    fine = _lowfreq(W, H, 16, seed*3+1)
    def inside(x, y):
        return any((x-cx)**2 + (y-cy)**2 <= r*r for (cx, cy, r) in cj)
    def bright(x, y):
        g = ((x - cxC)/W + (cyC - y)/H)            # luce destra-45°
        best = -9
        for (cx, cy, r) in cj:
            d = math.hypot(x-cx, y-cy)
            if d <= r:
                best = max(best, ((x-cx)+(cy-y))/(2*r) + (1 - d/r)*0.25)
        return 0.9*g + 1.05*best + 0.14*(fine(x, y)-0.5)

    # ─── 1) TRONCO PRIMA (sotto la chioma → z corretto) ───
    tcx = cxC + (rnd.random()-0.5)*3            # leggero off-center
    if trunk_w > 0:
        baseY = H - 3
        topY = baseY - trunk_h
        lean = (rnd.random()-0.5)*4             # leggera inclinazione
        for y in range(topY, baseY):
            t = (y - topY)/max(1, baseY - topY)
            hw = trunk_w/2 * (0.5 + 1.15*(t**1.5))      # stretto su, svasato giù
            cx = tcx + lean*(1-t)
            for x in range(int(cx-hw), int(cx+hw)+1):
                if 0 <= x < W:
                    px[y][x] = pal['tl'] if (x-cx) > hw*0.15 else (pal['tm'] if (x-cx) > -hw*0.5 else pal['td'])
        # FLARE-RADICI organico asimmetrico (lunghezze/altezze diverse per lato)
        roots = [(-1, trunk_w*1.0, 2), (-1, trunk_w*0.5, 0), (1, trunk_w*1.5, 3), (1, trunk_w*0.7, 1)]
        for d, ln, drop in roots:
            ln = ln*(0.7 + rnd.random()*0.7)
            for k in range(int(ln)):
                t = k/max(1, ln)
                xx = int(tcx + d*(trunk_w*0.35 + k))
                yy = min(H-2, baseY - 1 + int(t*drop))
                for wy in range(0, max(1, int((1-t)*2)+1)):
                    if 0 <= xx < W and 0 <= yy-wy < H:
                        px[yy-wy][xx] = pal['td'] if d < 0 else pal['tm']   # lato sx in ombra, dx tono medio
        # TEXTURE CORTECCIA: venature verticali spezzate (low-freq → niente speckle)
        bark = _lowfreq(W, H, 11, seed*5+2)
        for y in range(topY, baseY):
            for x in range(W):
                c = px[y][x]
                if c in (pal['tl'], pal['tm'], pal['td']):
                    n = bark(x, y)
                    if n < 0.30 and c != pal['td']: px[y][x] = pal['td']      # venatura scura
                    elif n > 0.84 and c == pal['tm']: px[y][x] = pal['tl']    # riflesso sul lato luce

    # ─── 2) CHIOMA SOPRA (copre cima tronco → connessa) ───
    for y in range(H):
        for x in range(W):
            if inside(x, y):
                b = bright(x, y)
                px[y][x] = pal['fl'] if b > 0.34 else (pal['fs'] if b < -0.12 else pal['fm'])

    # ─── 2b) MOTTLE: rompe le zone piatte troppo grandi (varietà tonale a grumi) ───
    mott = _lowfreq(W, H, 10, seed*7+3)
    for y in range(H):
        for x in range(W):
            c = px[y][x]; m = mott(x, y); b = bright(x, y)
            if c == pal['fl'] and m < 0.40:
                px[y][x] = pal['fm']                       # grumo-ombra dentro la zona chiara
            elif c == pal['fm']:
                if m > 0.74: px[y][x] = pal['fl']          # grumo-luce dentro il medio
                elif m < 0.24 and b < 0.06: px[y][x] = pal['fs']

    # ─── 3) VOLUMETRICO clusterizzato (low-freq, non speckle) ───
    for y in range(H):
        for x in range(W):
            c = px[y][x]
            if c not in (pal['fl'], pal['fm'], pal['fs']): continue
            b = bright(x, y); n = lf(x, y)
            if c in (pal['fl'], pal['fm']) and b > 0.18 and n > 0.62:
                px[y][x] = pal['hl']
            elif c == pal['fs'] and b < -0.06 and n < 0.34:
                px[y][x] = pal['ds']
    # rim highlight sul bordo illuminato (alto-destra)
    for y in range(H):
        for x in range(W):
            if px[y][x] in (pal['fl'], pal['hl']):
                if (px[y-1][x] if y > 0 else None) is None or (px[y][x+1] if x+1 < W else None) is None:
                    px[y][x] = pal['hl']
    # ombra rim bordo basso-sinistra
    for y in range(H):
        for x in range(W):
            if px[y][x] in (pal['fm'], pal['fs']) and not inside(x-1, y+2):
                px[y][x] = pal['ds'] if px[y][x] == pal['fs'] else pal['fs']
    # despeckle hl/ds isolati
    for y in range(1, H-1):
        for x in range(1, W-1):
            c = px[y][x]
            if c in (pal['hl'], pal['ds']):
                nb = [px[y+dy][x+dx] for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)) if px[y+dy][x+dx] is not None]
                if c not in nb and len(nb) >= 3:
                    px[y][x] = nb[0]

    # ─── 4) outline 1px ───
    filled = [[px[y][x] is not None for x in range(W)] for y in range(H)]
    out = [row[:] for row in px]
    for y in range(H):
        for x in range(W):
            if not filled[y][x] and any(0 <= x+dx < W and 0 <= y+dy < H and filled[y+dy][x+dx]
                                        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(-1,1),(1,1))):
                out[y][x] = pal['ol']
    im = Image.new("RGBA", (W, H), (0,0,0,0)); ld = im.load()
    for y in range(H):
        for x in range(W):
            if out[y][x]: ld[x, y] = hx(out[y][x])
    return im

# chiome ASIMMETRICHE (lopsided, irregolari) + ultimo cerchio = skirt che copre cima tronco
OAK  = [(30,25,15),(17,31,10),(47,28,12),(24,17,9),(42,16,10),(34,34,12),(13,35,6),(51,32,8),(33,43,8)]
TALL = [(31,17,10),(23,27,8),(42,25,9),(33,30,12),(29,40,10),(22,40,6),(43,38,7),(33,45,8)]
PINE = [(34,9,4),(30,16,7),(35,24,10),(30,33,13),(21,31,7),(44,29,7),(19,40,6),(46,41,6),(32,45,8)]
BUSH = [(20,42,10),(44,40,10),(31,36,11),(13,46,6),(51,45,6),(33,48,7)]

SPECS = [
    ("tree-oak",  OAK, 11, 16, GREEN),  ("tree-oak-autumn", OAK, 11, 16, AUTUMN),
    ("tree-tall", TALL, 8, 18, GREEN),  ("tree-tall-autumn", TALL, 8, 18, AUTUMN),
    ("tree-pine", PINE, 9, 15, PINEG),
    ("bush",      BUSH, 0,  0, GREEN),
]
prev = []
for name, circ, tw, th, pal in SPECS:
    im = gen(circ, tw, th, pal, seed=hash(name) & 0xffff)
    im.save(f"{OUTDIR}/{name}.png"); prev.append(im)
print("wrote", len(prev), "alberi (v3: asimmetrici, tronco z-corretto)")

S = 5; pad = 10
W = sum(i.width*S for i in prev) + pad*(len(prev)+1)
Hh = max(i.height*S for i in prev) + 20
m = Image.new("RGBA", (W, Hh), (44, 70, 48, 255)); xo = pad
for i in prev:
    b = i.resize((i.width*S, i.height*S), Image.NEAREST); m.paste(b, (xo, 10), b); xo += i.width*S + pad
m.save(PREV); print("preview ok")
