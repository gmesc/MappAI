#!/usr/bin/env python3
"""C5 v2: renderer CAVERNA — tile verificati a contact-sheet (pavimento [0,0..2],
buio [2,1], muro [2,3]/[2,4], statue [6..9,0..2], lago prefab [0..2,7..9])."""
import sys, random
import os
from PIL import Image
sys.path.insert(0, "/private/tmp/claude-501/-Users-giacomomeschini-Claude-MappAI-BERT/a9dc8b97-ef3f-4b65-aad8-c705c64d137c/scratchpad")
from arcipelago import sprite, SHADOW_LOOT, SHADOW_TREE, NO_SHADOW, TREE_SHADOW, T, COLS, ROWS, Wpx, Hpx, coast_blob, capsule

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo corrente
CAVE = Image.open(ROOT + "/public/assets/legendoflua/tilesets/cave.png").convert("RGBA")
def ctile(c, r, strip=False):
    t = CAVE.crop((c*T, r*T, c*T+T, r*T+T)).copy()
    if strip:
        p = t.load()
        def wh(x, y):
            R, G, B, A = p[x, y]
            return A > 0 and R > 238 and G > 238 and B > 238
        st = [(x, y) for x in range(T) for y in (0, T-1) if wh(x, y)] + [(x, y) for y in range(T) for x in (0, T-1) if wh(x, y)]
        seen = set(st)
        while st:
            x, y = st.pop(); p[x, y] = (0, 0, 0, 0)
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < T and 0 <= ny < T and (nx, ny) not in seen and wh(nx, ny):
                    seen.add((nx, ny)); st.append((nx, ny))
    return t
FLOORS = [ctile(0,0), ctile(0,1), ctile(0,2)]
VOID, WTOP, WFRONT = ctile(2,1), ctile(2,3), ctile(2,4)
DECAL = [ctile(5,4,True), ctile(6,4,True)]

def build(name, seed, blobs, tunnels, objs, decals, statue=None, lake=None):
    rnd = random.Random(seed)
    floor_f = lambda X, Y: any(b(X, Y) for b in blobs) or any(t(X, Y) for t in tunnels)
    img = Image.new("RGBA", (Wpx, Hpx), (0, 0, 0, 255))
    fl = [[floor_f(x*T+8, y*T+8) for x in range(COLS)] for y in range(ROWS)]
    for x in range(COLS): fl[ROWS-1][x] = fl[ROWS-1][x] or fl[ROWS-2][x]
    for y in range(ROWS):
        for x in range(COLS):
            img.paste(FLOORS[rnd.randrange(3)] if fl[y][x] else VOID, (x*T, y*T))
    for y in range(ROWS):
        for x in range(COLS):
            if fl[y][x]: continue
            s = y+1 < ROWS and fl[y+1][x]
            near = s or (y > 0 and fl[y-1][x]) or (x > 0 and fl[y][x-1]) or (x+1 < COLS and fl[y][x+1])
            if not near: continue
            img.paste(WFRONT if s else WTOP, (x*T, y*T))
    if lake:                                   # lago sotterraneo prefab 3x3
        lx, ly = lake
        for dy in range(3):
            for dx in range(3):
                assert fl[ly+dy][lx+dx], "%s: lago su roccia" % name
                img.paste(ctile(0+dx, 7+dy), ((lx+dx)*T, (ly+dy)*T))
    for (x, y) in decals:
        assert fl[y][x], "%s: decal su roccia (%d,%d)" % (name, x, y)
        t = rnd.choice(DECAL); img.paste(t, (x*T, y*T), t)
    if statue:                                 # statua-totem 1x3 (guardiano)
        sx, sy = statue
        for dy in range(3):
            t = ctile(6, dy, True); img.paste(t, (sx*T, (sy+dy)*T), t)
    for (n, x, y) in objs:
        assert fl[y][x], "%s: %s su ROCCIA (%d,%d)" % (name, n, x, y)
    for (n, x, y) in sorted(objs, key=lambda o: o[2]):
        im = sprite(n); fw, fh = im.size
        ax, ay = x*T+8, (y+1)*T
        assert 0 <= ax-fw//2 and ax-fw//2+fw <= Wpx and 0 <= ay-fh and ay <= Hpx
        if n not in NO_SHADOW:
            sh = SHADOW_TREE if n in TREE_SHADOW else SHADOW_LOOT
            img.paste(sh, (ax-sh.size[0]//2, ay-sh.size[1]+1), sh)
        img.paste(im, (ax-fw//2, ay-fh), im)
    img.resize((Wpx*2, Hpx*2), Image.NEAREST).save(ROOT + "/esercizi/03_organiche_pipeline/" + name + ".png")
    print("scritto", name)
