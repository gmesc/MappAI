#!/usr/bin/env python3
"""Giardini ORGANICI — bordo mare/foresta, zone distinte, zero tile tagliati.
Regole COMPOSITION_RULES pedisseque + feedback: niente perimetro rettangolare."""
import re, base64, io, random, math, sys
from PIL import Image

sys.path.insert(0, '/Users/giacomomeschini/Claude/MappAI BERT/tools/mapgen')
from grass import scatter_tufts, PALETTE as GRASS_PAL

ROOT = '/Users/giacomomeschini/Claude/MappAI BERT'
T = 16
COLS, ROWS = 30, 20
Wpx, Hpx = COLS*T, ROWS*T
TERRA = (195, 147, 100, 255); TERRA_DASH = (203, 158, 114, 255); TERRA_DARK = (185, 138, 92, 255)
FOAM = (125, 95, 65, 255); FOAM_DARK = (82, 58, 35, 255)

OW = Image.open(ROOT + '/public/assets/legendoflua/tilesets/overworld.png').convert('RGBA')
def tile(c, r, strip=False):
    t = OW.crop((c*T, r*T, c*T+T, r*T+T)).copy()
    if strip:
        p = t.load()
        for y in range(T):
            for x in range(T):
                R, G, B, A = p[x, y]
                if R > 238 and G > 238 and B > 238: p[x, y] = (0, 0, 0, 0)
    return t

_SPRJS = open(ROOT + '/tools/assets-manager/map-editor/sprites.js').read()
_SPRC = {}
def sprite(name):
    if name not in _SPRC:
        m = re.search(r'\{"name": "%s", "w": \d+, "h": \d+, "fw": (\d+), "fh": (\d+), "src": "data:image/png;base64,([^"]+)"' % re.escape(name), _SPRJS)
        im = Image.open(io.BytesIO(base64.b64decode(m.group(3)))).convert('RGBA')
        _SPRC[name] = im.crop((0, 0, int(m.group(1)), int(m.group(2))))
    return _SPRC[name]

SHADOW_TREE = Image.open(ROOT + '/public/assets/legendoflua/sprites/effects/shadows/tree.png').convert('RGBA')
SHADOW_LOOT = Image.open(ROOT + '/public/assets/legendoflua/sprites/items/lootShadow.png').convert('RGBA')
NO_SHADOW = {'animal-butterfly'}
TREE_SHADOW = {'tree', 'tree2', 'tree-oak', 'tree-oak-autumn', 'tree-old', 'tree-pine', 'tree-tall', 'tree-tall-autumn', 'bush'}
TREES_GREEN = ['tree-oak', 'tree-tall', 'tree', 'tree-pine']

# riva del mare: stesso overlay del laghetto (chiave = lati dove manca l'acqua)
SHORE = {'u': (16, 6), 'd': (16, 8), 'l': (15, 7), 'r': (17, 7),
         'ul': (15, 6), 'ur': (17, 6), 'dl': (15, 8), 'dr': (17, 8)}
WATER = (16, 1)
# siepe aiuola: LUT edge4 dell'editor (mask U=1,R=2,D=4,L=8)
SIEPE = {15: (2, 14), 14: (2, 13), 7: (1, 14), 13: (3, 14), 11: (2, 15), 6: (1, 13), 12: (3, 13),
         3: (1, 15), 9: (3, 15), 5: (1, 14), 10: (2, 13), 1: (0, 15), 4: (0, 14), 2: (0, 16), 8: (1, 16), 0: (2, 14)}
DAISY = [(2, 11), (3, 11)]                       # solo margherite piene (gli steli [2..3,12] sembrano tagliati)
ROCKD = [(11, 22), (12, 22)]
MURO_TOP, MURO_FRONT = (33, 17), (33, 18)

def blob(cx, cy, rx, ry):
    return lambda x, y: ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1.0

def land_mask(blobs, rnd):
    m = [[any(b(x, y) for b in blobs) for x in range(COLS)] for y in range(ROWS)]
    for _ in range(2):                            # smoothing cellulare + rumore di bordo
        m2 = [row[:] for row in m]
        for y in range(ROWS):
            for x in range(COLS):
                n = sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                        if 0 <= x+dx < COLS and 0 <= y+dy < ROWS and m[y+dy][x+dx])
                if n >= 6: m2[y][x] = True
                elif n <= 3: m2[y][x] = False
                elif rnd.random() < 0.18: m2[y][x] = not m2[y][x]
        m = m2
    return m

class G:
    def __init__(self, name, seed):
        self.name = name; self.rnd = random.Random(seed)
        self.land = [[True]*COLS for _ in range(ROWS)]
        self.terra_cells = set(); self.hedge = {}; self.blocks = []; self.objs = []
        self.flowers = []; self.rocks = []; self.islets = set()
    def O(self, n, x, y): self.objs.append((n, x, y))
    def path_rects(self, rects):
        for (x0, y0, x1, y1) in rects:
            for y in range(y0, y1+1):
                for x in range(x0, x1+1): self.terra_cells.add((x, y))
    def aiuola(self, x0, y0, x1, y1, gap):
        ring = set()
        for x in range(x0, x1+1): ring |= {(x, y0), (x, y1)}
        for y in range(y0, y1+1): ring |= {(x0, y), (x1, y)}
        ring.discard(gap)
        for (x, y) in ring:
            mask = (1 if (x, y-1) in ring else 0) + (2 if (x+1, y) in ring else 0) + \
                   (4 if (x, y+1) in ring else 0) + (8 if (x-1, y) in ring else 0)
            self.hedge[(x, y)] = SIEPE[mask]
        for y in range(y0+1, y1):
            for x in range(x0+1, x1):
                if self.rnd.random() < 0.75: self.flowers.append((x, y))
    def castello(self, fx, fy):
        """castello free-standing: facciata + fascia muro sopra e ai lati (mai tagliato)"""
        assert fy >= 2, 'facciata troppo in alto'
        for dx in range(4): self.blocks.append((16+dx, 4, fx+dx, fy)); self.blocks.append((16+dx, 5, fx+dx, fy+1))
        for x in range(fx-1, fx+5):
            self.blocks.append((MURO_TOP[0], MURO_TOP[1], x, fy-2))
            self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], x, fy-1))
        for y in (fy, fy+1):
            self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], fx-1, y))
            self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], fx+4, y))

def render(g):
    rnd = g.rnd
    img = Image.new('RGBA', (Wpx, Hpx), GRASS_PAL['base'])
    # ── terra path: maschera pixel + frangia organica + R12 + R13 ──
    mask = [[False]*Wpx for _ in range(Hpx)]
    for (x, y) in g.terra_cells:
        for yy in range(y*T, min(y*T+T, Hpx)):
            for xx in range(x*T, min(x*T+T, Wpx)): mask[yy][xx] = True
    def disc(cx, cy, R):
        for yy in range(max(0, cy-R-2), min(Hpx, cy+R+2)):
            for xx in range(max(0, cx-R-2), min(Wpx, cx+R+2)):
                rr = R + rnd.uniform(-1.3, 1.3)
                if (xx-cx)**2 + (yy-cy)**2 <= rr*rr: mask[yy][xx] = False
    def tc(x, y): return (x, y) in g.terra_cells
    for y in range(ROWS-1):
        for x in range(COLS-1):
            q = [tc(x, y), tc(x+1, y), tc(x, y+1), tc(x+1, y+1)]
            if sum(q) == 3: disc((x+1)*T, (y+1)*T, 12)
            elif sum(q) == 1: disc((x+1)*T, (y+1)*T, 6)
    def neigh(X, Y):
        return ((X > 0 and mask[Y][X-1]) or (X < Wpx-1 and mask[Y][X+1]) or
                (Y > 0 and mask[Y-1][X]) or (Y < Hpx-1 and mask[Y+1][X]))
    for p_grow, p_shr in ((0.35, 0.0), (0.0, 0.30)):
        edge = []
        for Y in range(Hpx):
            for X in range(Wpx):
                if not mask[Y][X] and neigh(X, Y) and rnd.random() < p_grow: edge.append((X, Y, True))
                elif mask[Y][X] and rnd.random() < p_shr:
                    if not (mask[Y][max(X-1, 0)] and mask[Y][min(X+1, Wpx-1)] and mask[max(Y-1, 0)][X] and mask[min(Y+1, Hpx-1)][X]):
                        edge.append((X, Y, False))
        for X, Y, v in edge: mask[Y][X] = v
    ip = img.load()
    for Y in range(Hpx):
        for X in range(Wpx):
            if mask[Y][X]: ip[X, Y] = TERRA
    for _ in range(int(Wpx*Hpx*0.004)):
        X, Y = rnd.randint(0, Wpx-3), rnd.randint(0, Hpx-1)
        if mask[Y][X] and mask[Y][X+1]:
            c = TERRA_DASH if rnd.random() < 0.7 else TERRA_DARK
            ip[X, Y] = c; ip[X+1, Y] = c
    for Y in range(1, Hpx):
        for X in range(Wpx):
            if mask[Y][X] and not mask[Y-1][X]:
                if rnd.random() < 0.85: ip[X, Y] = FOAM
                if Y+1 < Hpx and mask[Y+1][X] and rnd.random() < 0.4:
                    ip[X, Y+1] = FOAM if rnd.random() < 0.7 else FOAM_DARK
    # ── ciuffi solo su erba di TERRAFERMA ──
    def is_grass_px(X, Y):
        if mask[Y][X]: return False
        return g.land[Y//T][X//T]
    scatter_tufts(img, allow=is_grass_px, seed=rnd.randint(1, 999))
    # ── mare: acqua + riva (chiave = lati dove manca l'acqua) ──
    def sea(x, y):
        if 0 <= x < COLS and 0 <= y < ROWS: return not g.land[y][x] and (x, y) not in g.islets
        return True                                   # fuori mappa = mare (continua)
    wt = tile(*WATER)
    for y in range(ROWS):
        for x in range(COLS):
            if sea(x, y): img.paste(wt, (x*T, y*T))
    for y in range(ROWS):
        for x in range(COLS):
            if not sea(x, y): continue
            miss = ''
            if not sea(x, y-1): miss += 'u'
            if not sea(x, y+1): miss += 'd'
            if not sea(x-1, y): miss += 'l'
            if not sea(x+1, y): miss += 'r'
            k = miss if miss in SHORE else (next((q for q in SHORE if len(q) == 2 and all(ch in miss for ch in q)), miss[:1]) if miss else '')
            if k and k in SHORE:
                t = tile(*SHORE[k], strip=False)
                img.paste(t, (x*T, y*T), t)
    for (x, y) in g.islets:                           # scogli/isolotti: erba + riva intorno gestita sopra
        img.paste(tile(0, 0), (x*T, y*T))
    # ── siepi aiuola, blocchi castello, decal ──
    for (x, y), (c, r) in g.hedge.items():
        t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    for (c, r, x, y) in g.blocks:
        strip = (16 <= c <= 19 and 4 <= r <= 5)
        t = tile(c, r, strip=strip)
        img.paste(t, (x*T, y*T), t if strip else None)
    for (x, y) in g.flowers:
        c, r = rnd.choice(DAISY); t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    for (x, y) in g.rocks:
        c, r = rnd.choice(ROCKD); t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    # ── oggetti: validazione anti-taglio + anti-acqua, ombre R7, y-sort ──
    for (n, x, y) in g.objs:
        im = sprite(n); fw, fh = im.size
        ax, ay = x*T+8, (y+1)*T
        assert 0 <= ax-fw//2 and ax-fw//2+fw <= Wpx and 0 <= ay-fh and ay <= Hpx, '%s: %s TAGLIATO a (%d,%d)' % (g.name, n, x, y)
        if n != 'animal-duck' and not (x, y) in g.islets:
            assert not sea(x, y), '%s: %s in MARE a (%d,%d)' % (g.name, n, x, y)
    for (n, x, y) in sorted(g.objs, key=lambda o: o[2]):
        im = sprite(n); fw, fh = im.size
        ax, ay = x*T+8, (y+1)*T
        if n not in NO_SHADOW and not sea(x, y):
            sh = SHADOW_TREE if n in TREE_SHADOW else SHADOW_LOOT
            img.paste(sh, (ax-sh.size[0]//2, ay-sh.size[1]+1), sh)
        img.paste(im, (ax-fw//2, ay-fh), im)
    img.resize((Wpx*2, Hpx*2), Image.NEAREST).save(ROOT + '/esercizi/03_organiche_pipeline/' + g.name + '.png')
    print('scritto', g.name)

def forest_fill(g, keep_clear, opening=None):
    """riempie il fuori-radura di alberi PIENAMENTE VISIBILI (anchor 2..27 × 3..18)"""
    rnd = g.rnd
    for y in range(3, ROWS-1):
        for x in range(2, COLS-2):
            if keep_clear(x, y): continue
            if opening and opening(x, y): continue
            if (x*7 + y*3 + (x*y) % 5) % 3 == 0 or rnd.random() < 0.28:
                g.O(rnd.choice(TREES_GREEN), x, y)
