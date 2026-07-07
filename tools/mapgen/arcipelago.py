#!/usr/bin/env python3
"""Round A del loop ipotesi→implementazione: mare PIXEL-LEVEL (H16), pontile (H17),
micro-radure egg (H18). Palette costa campionata dai tile LoL."""
import re, base64, io, random, math, sys
import os
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grass import scatter_tufts, PALETTE as GRASS_PAL

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo corrente
T = 16; COLS, ROWS = 30, 20; Wpx, Hpx = COLS*T, ROWS*T
TERRA = (195, 147, 100, 255); TERRA_DASH = (203, 158, 114, 255); TERRA_DARK = (185, 138, 92, 255)
FOAM = (125, 95, 65, 255); FOAM_DARK = (82, 58, 35, 255)
W_BASE = (30, 124, 184, 255); W_WAVE1 = (41, 150, 219, 255); W_WAVE2 = (90, 174, 228, 255)
W_DEEP = (22, 92, 136, 255)            # linea di profondità sotto la riva
SAND1 = (224, 248, 120, 255)           # #e0f878 riva chiara (bordo acqua)
SAND2 = (160, 248, 104, 255)           # #a0f868 fascia verso l'erba

OW = Image.open(ROOT + '/reference/legend-of-lua/maps/_tilesets/overworld.png').convert('RGBA')
def tile(c, r, strip=False):
    t = OW.crop((c*T, r*T, c*T+T, r*T+T)).copy()
    if strip:
        # H19: flood-fill dai bordi — solo il bianco CONNESSO al bordo è sfondo;
        # il bianco interno (petali, dettagli) resta.
        p = t.load()
        def white(x, y):
            R, G, B, A = p[x, y]
            return A > 0 and R > 238 and G > 238 and B > 238
        stack = [(x, y) for x in range(T) for y in (0, T-1) if white(x, y)]
        stack += [(x, y) for y in range(T) for x in (0, T-1) if white(x, y)]
        seen = set(stack)
        while stack:
            x, y = stack.pop()
            p[x, y] = (0, 0, 0, 0)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < T and 0 <= ny < T and (nx, ny) not in seen and white(nx, ny):
                    seen.add((nx, ny)); stack.append((nx, ny))
    return t

_SPRJS = open(ROOT + '/tools/assets-manager/map-editor/sprites.js').read()
_SPRC = {}
def sprite(name):
    if name not in _SPRC:
        m = re.search(r'\{"name": "%s", "w": \d+, "h": \d+, "fw": (\d+), "fh": (\d+), "src": "data:image/png;base64,([^"]+)"' % re.escape(name), _SPRJS)
        im = Image.open(io.BytesIO(base64.b64decode(m.group(3)))).convert('RGBA')
        _SPRC[name] = im.crop((0, 0, int(m.group(1)), int(m.group(2))))
    return _SPRC[name]

SHADOW_TREE = Image.open(ROOT + '/reference/legend-of-lua/sprites/effects/shadows/tree.png').convert('RGBA')
SHADOW_LOOT = Image.open(ROOT + '/reference/legend-of-lua/sprites/items/lootShadow.png').convert('RGBA')
NO_SHADOW = {'animal-butterfly'}
TREE_SHADOW = {'tree', 'tree2', 'tree-oak', 'tree-oak-autumn', 'tree-old', 'tree-pine', 'tree-tall', 'tree-tall-autumn', 'bush'}
TREES_GREEN = ['tree-oak', 'tree-tall', 'tree', 'tree-pine']
SIEPE = {15: (2, 14), 14: (2, 13), 7: (1, 14), 13: (3, 14), 11: (2, 15), 6: (1, 13), 12: (3, 13),
         3: (1, 15), 9: (3, 15), 5: (1, 14), 10: (2, 13), 1: (0, 15), 4: (0, 14), 2: (0, 16), 8: (1, 16), 0: (2, 14)}
DAISY = [(3, 11), (2, 12), (3, 12)]; ROCKD = [(6, 5), (7, 5), (9, 5)]
MURO_TOP, MURO_FRONT = (33, 17), (33, 18)
DECK = [(8, 6), (9, 6), (10, 6), (8, 7), (9, 7), (10, 7)]     # pontile/ponte 3×2

def capsule(x1, y1, x2, y2, w, rnd):
    """istmo: banda di terra lungo il segmento (coordinate CELLA), larghezza w, con wobble"""
    ph = rnd.uniform(0, 6.28)
    def f(px, py):
        cx, cy = px/T, py/T
        dx, dy = x2-x1, y2-y1
        L2 = dx*dx + dy*dy
        t = max(0.0, min(1.0, ((cx-x1)*dx + (cy-y1)*dy) / L2))
        qx, qy = x1 + t*dx, y1 + t*dy
        import math as _m
        ww = w * (1 + 0.25*_m.sin(t*9 + ph))
        return (cx-qx)**2 + (cy-qy)**2 <= ww*ww
    return f

def coast_blob(cx, cy, rx, ry, rnd):
    """ellisse (coordinate CELLA) con bordo perturbato da sinusoidi → costa liscia e organica"""
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    am = [rnd.uniform(0.03, 0.075) for _ in range(3)]
    def f(px, py):
        dx, dy = px/T - cx, py/T - cy
        r = math.hypot(dx/rx, dy/ry)
        th = math.atan2(dy, dx)
        pert = 1 + sum(a*math.sin((k+3)*th + p) for k, (a, p) in enumerate(zip(am, ph)))
        return r <= pert
    return f

class G:
    def __init__(self, name, seed):
        self.name = name; self.rnd = random.Random(seed)
        self.sea_f = lambda px, py: False       # funzione pixel → mare
        self.terra_cells = set(); self.hedge = {}; self.blocks = []; self.objs = []
        self.flowers = []; self.rocks = []; self.deck = []
        self.eggs = []                          # celle egg → micro-radura (H18)
        self.terra_f = None                     # H45: conca di terra da funzione pixel (dislivelli)
    def O(self, n, x, y):
        self.objs.append((n, x, y))
        if n in ('book', 'key', 'chestClosed'): self.eggs.append((x, y))
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
        assert fy >= 2
        for dx in range(4): self.blocks.append((16+dx, 4, fx+dx, fy)); self.blocks.append((16+dx, 5, fx+dx, fy+1))
        for x in range(fx-1, fx+5):
            self.blocks.append((MURO_TOP[0], MURO_TOP[1], x, fy-2)); self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], x, fy-1))
        for y in (fy, fy+1):
            self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], fx-1, y)); self.blocks.append((MURO_FRONT[0], MURO_FRONT[1], fx+4, y))
    def casa(self, tipo, x, y):
        """H29: casa LoL 5×4 come blocco (A=finestre/porta, B=fienile). (x,y)=angolo alto-sx"""
        c0 = 6 if tipo == 'A' else 11
        for dy in range(4):
            for dx in range(5):
                self.blocks.append((c0+dx, 1+dy, x+dx, y+dy))
    def varco(self, cx):
        """H48: spawn naturale — lingua di terra 3-wide che sanguina oltre il bordo sud"""
        self._varco_cells = set()
        for y in range(ROWS-3, ROWS):
            for x in (cx-1, cx, cx+1):
                self.terra_cells.add((x, y)); self._varco_cells.add((x, y))
    def panca(self, x, y):
        """H34: tronco-panchina di 3 celle sul layer decal"""
        self._panche = getattr(self, '_panche', []) + [(x, y)]
    def pontile(self, x, y):
        """H24: richiesta di pontile — l'ancoraggio esatto alla riva avviene in render"""
        self._pontile_req = (x, y)
        for i, (c, r) in enumerate(DECK):
            self.deck.append((c, r, x + i % 3, y + i//3))

def render(g):
    rnd = g.rnd
    img = Image.new('RGBA', (Wpx, Hpx), GRASS_PAL['base'])
    ip = img.load()
    # ── terra path (pipeline validata) ──
    mask = [[False]*Wpx for _ in range(Hpx)]
    if g.terra_f:
        for Y in range(Hpx):
            for X in range(Wpx):
                if g.terra_f(X, Y): mask[Y][X] = True
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
    # ── H16: mare a pixel — spiaggia procedurale (erba→#a0f868→#e0f878→#165c88→acqua) ──
    sea = [[g.sea_f(X, Y) for X in range(Wpx)] for Y in range(Hpx)]
    # H32: gli edifici si creano la loro terraferma (padding 8px attorno a ogni blocco);
    # le bande-spiaggia si ridisegnano da sole attorno al nuovo profilo.
    for (c, r, bx, by) in g.blocks:
        for Y in range(max(0, by*T-8), min(Hpx, by*T+T+8)):
            for X in range(max(0, bx*T-8), min(Wpx, bx*T+T+8)):
                sea[Y][X] = False
    for (bx, by) in getattr(g, '_varco_cells', set()):      # H52: il varco si forza la terraferma
        for Y in range(max(0, by*T-8), min(Hpx, by*T+T+8)):
            for X in range(max(0, bx*T-8), min(Wpx, bx*T+T+8)):
                sea[Y][X] = False
    dl = [[9]*Wpx for _ in range(Hpx)]           # distanza dal mare (lato terra)
    dw = [[9]*Wpx for _ in range(Hpx)]           # distanza dalla terra (lato acqua)
    for Y in range(Hpx):
        for X in range(Wpx):
            n_sea = ((X > 0 and sea[Y][X-1]) or (X < Wpx-1 and sea[Y][X+1]) or
                     (Y > 0 and sea[Y-1][X]) or (Y < Hpx-1 and sea[Y+1][X]))
            n_land = ((X > 0 and not sea[Y][X-1]) or (X < Wpx-1 and not sea[Y][X+1]) or
                      (Y > 0 and not sea[Y-1][X]) or (Y < Hpx-1 and not sea[Y+1][X]))
            if not sea[Y][X] and n_sea: dl[Y][X] = 1
            if sea[Y][X] and n_land: dw[Y][X] = 1
    for d in (2, 3, 4):
        for Y in range(Hpx):
            for X in range(Wpx):
                if not sea[Y][X] and dl[Y][X] == 9:
                    if any(0 <= X+dx < Wpx and 0 <= Y+dy < Hpx and dl[Y+dy][X+dx] == d-1
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): dl[Y][X] = d
                if sea[Y][X] and dw[Y][X] == 9 and d <= 2:
                    if any(0 <= X+dx < Wpx and 0 <= Y+dy < Hpx and dw[Y+dy][X+dx] == d-1
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): dw[Y][X] = d
    for Y in range(Hpx):
        for X in range(Wpx):
            if sea[Y][X]:
                ip[X, Y] = W_DEEP if dw[Y][X] <= 2 else W_BASE
            elif dl[Y][X] <= 2: ip[X, Y] = SAND1
            elif dl[Y][X] <= 4: ip[X, Y] = SAND2
    for _ in range(int(Wpx*Hpx*0.006)):          # onde
        X, Y = rnd.randint(0, Wpx-5), rnd.randint(0, Hpx-1)
        if all(sea[Y][X+i] and dw[Y][X+i] > 2 for i in range(4)):
            c = W_WAVE2 if rnd.random() < 0.5 else W_WAVE1
            for i in range(rnd.choice((3, 4))): ip[X+i, Y] = c
    # ── H26: il blocco castello deve stare INTERAMENTE su terra ──
    for (c, r, x, y) in g.blocks:
        if sea[y*T+8][x*T+8]:
            raise AssertionError('%s: cella castello (%d,%d) sul MARE' % (g.name, x, y))
    # ── H27: niente fiori/sassi sulle celle di edifici, deck e siepi ──
    occup = {(x, y) for (c, r, x, y) in g.blocks} | {(x, y) for (c, r, x, y) in g.deck} | set(g.hedge)
    g.flowers = [c for c in g.flowers if tuple(c) not in occup]
    g.rocks = [c for c in g.rocks if tuple(c) not in occup]
    # ── H24: ancora il pontile alla riva (riga alta su terra, bassa su acqua/sabbia) ──
    if getattr(g, '_pontile_req', None):
        px0, py0 = g._pontile_req
        def deck_ok(dy):
            top = all(not sea[(py0+dy)*T+8][(px0+i)*T+8] for i in range(3))
            bot = all(sea[min((py0+1+dy)*T+8, Hpx-1)][(px0+i)*T+8] or dl[min((py0+1+dy)*T+8, Hpx-1)][(px0+i)*T+8] <= 4 for i in range(3))
            return top and bot
        for dy in (0, 1, -1, 2, -2):
            if 0 <= py0+dy and (py0+dy+1) < ROWS and deck_ok(dy):
                if dy: print('⚠ %s: pontile slittato di %+d righe per ancorarsi alla riva' % (g.name, dy))
                g.deck = [(c, r, x, y+dy) for (c, r, x, y) in g.deck]
                break
    # ── H23: anatre auto-snap alla cella d'acqua più vicina ──
    fixed = []
    for (n, x, y) in g.objs:
        if n == 'animal-duck' and not (sea[min((y+1)*T-4, Hpx-1)][x*T+8] and sea[max((y+1)*T-14, 0)][x*T+8]):
            best = None
            for r in (1, 2):
                for dx in range(-r, r+1):
                    for dy2 in range(-r, r+1):
                        nx, ny = x+dx, y+dy2
                        if 0 <= nx < COLS and 0 <= ny < ROWS and sea[min((ny+1)*T-4, Hpx-1)][nx*T+8] and sea[max((ny+1)*T-14, 0)][nx*T+8]:
                            best = (nx, ny); break
                    if best: break
                if best: break
            if best:
                print('⚠ %s: anatra (%d,%d) → snap in acqua %s' % (g.name, x, y, best))
                x, y = best
            else:
                print('⚠ %s: anatra (%d,%d) senza acqua vicina → droppata' % (g.name, x, y)); continue
        fixed.append((n, x, y))
    g.objs = fixed
    # ── H22: anti-occlusione — nessun critico nel box-canopy di un albero pari o più a sud ──
    CRIT_OCCL = ('sapiente-viola', 'sapiente-rosso', 'mage', 'merchant', 'gatekeeper', 'chestClosed', 'book', 'key')
    def occlusori(nn, xx, yy):
        return [(i2, tx, ty) for i2, (n2, tx, ty) in enumerate(g.objs)
                if n2 in TREE_SHADOW and ty >= yy and ty - yy <= 3 and abs(tx - xx) <= 2]
    for (n, x, y) in list(g.objs):
        if n not in CRIT_OCCL: continue
        if occlusori(n, x, y):
            raise AssertionError('%s: %s (%d,%d) OCCLUSO da chioma' % (g.name, n, x, y))
    # ── ciuffi solo su erba piena ──
    grass_ok = lambda X, Y: not mask[Y][X] and not sea[Y][X] and dl[Y][X] > 4
    scatter_tufts(img, allow=grass_ok, seed=rnd.randint(1, 999), density=0.009)
    scatter_tufts(img, allow=lambda X, Y: grass_ok(X, Y) and dl[Y][X] <= 9,
                  seed=rnd.randint(1, 999), density=0.028)   # H21: orlo costiero più ricco
    scatter_tufts(img, allow=lambda X, Y: not mask[Y][X] and not sea[Y][X] and 2 < dl[Y][X] <= 4,
                  seed=rnd.randint(1, 999), density=0.008)   # H25: ciuffi che sconfinano nella sabbia
    # ── siepi, castello, decal, pontile ──
    for (x, y), (c, r) in g.hedge.items():
        t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    for (c, r, x, y) in g.blocks:
        strip = (16 <= c <= 19 and 4 <= r <= 5) or (6 <= c <= 15 and 1 <= r <= 4)
        t = tile(c, r, strip=strip); img.paste(t, (x*T, y*T), t if strip else None)
    for (x, y) in g.flowers:
        c, r = rnd.choice(DAISY); t = tile(c, r); img.paste(t, (x*T, y*T), t)   # H19: già trasparenti
    for (x, y) in g.rocks:
        c, r = rnd.choice(ROCKD); t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    battigia = [(x, y) for y in range(1, ROWS-1) for x in range(1, COLS-1)
                if 3 <= dl[y*T+8][x*T+8] <= 4 and all(dl[(y+dy)*T+8][(x+dx)*T+8] >= 3
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1) if 0 < x+dx < COLS-1 and 0 < y+dy < ROWS-1)]
    rnd.shuffle(battigia)
    for (bx, by) in battigia[:4]:                           # H31+H49: cluster sulla sabbia ALTA
        for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1))[:rnd.choice((2, 3))]:
            x2, y2 = bx+dx, by+dy
            if 3 <= dl[y2*T+8][x2*T+8] <= 5:
                c, r = rnd.choice(ROCKD); t = tile(c, r, strip=True); img.paste(t, (x2*T, y2*T), t)
    for (px0, py0) in getattr(g, '_panche', []):
        for i, (c, r) in enumerate([(3, 5), (4, 5), (5, 5)]):
            t = tile(c, r, strip=True); img.paste(t, ((px0+i)*T, py0*T), t)
    for (c, r, x, y) in g.deck:
        t = tile(c, r, strip=True); img.paste(t, (x*T, y*T), t)
    # ── oggetti: anti-taglio + anti-mare (pixel), ombre R7, y-sort ──
    deck_cells = {(x, y) for (c, r, x, y) in g.deck}
    CRITICI = ('sapiente-viola', 'sapiente-rosso', 'mage', 'merchant', 'gatekeeper',
               'lantern', 'chestClosed', 'book', 'key')
    keep = []
    for (n, x, y) in g.objs:
        im = sprite(n); fw, fh = im.size
        ax, ay = x*T+8, (y+1)*T
        assert 0 <= ax-fw//2 and ax-fw//2+fw <= Wpx and 0 <= ay-fh and ay <= Hpx, '%s: %s TAGLIATO (%d,%d)' % (g.name, n, x, y)
        if n not in ('animal-duck', 'key') and (x, y) not in deck_cells and sea[ay-4][ax]:
            if n in CRITICI:
                raise AssertionError('%s: %s in MARE (%d,%d)' % (g.name, n, x, y))
            best = None                               # H28+H33: decor → erba più vicina (mai path/edifici)
            blocked = set(g.terra_cells) | {(bx, by) for (c2, r2, bx, by) in g.blocks} | set(g.hedge)
            for (c2, r2, bx, by) in g.blocks:                   # H37: 2 righe dietro gli edifici
                blocked |= {(bx, by-1), (bx, by-2)}
            for rr in (1, 2):
                for dx in range(-rr, rr+1):
                    for dy2 in range(-rr, rr+1):
                        nx, ny = x+dx, y+dy2
                        if (nx, ny) in blocked: continue
                        if 0 <= nx < COLS and 3 <= ny < ROWS and not sea[min((ny+1)*T-4, Hpx-1)][nx*T+8]:
                            best = (nx, ny); break
                    if best: break
                if best: break
            if best:
                print('⚠ %s: decor %s (%d,%d) → snap a terra %s' % (g.name, n, x, y, best))
                keep.append((n, best[0], best[1])); continue
            print('⚠ %s: decor %s in mare (%d,%d) → droppato' % (g.name, n, x, y))
            continue
        keep.append((n, x, y))
    g.objs = keep
    # ── H36: post-snap, un albero snappato che occlude un critico slitta finché libero ──
    CRIT_OCCL = ('sapiente-viola', 'sapiente-rosso', 'mage', 'merchant', 'gatekeeper', 'chestClosed', 'book', 'key')
    for i2 in range(len(g.objs)):
        n2, tx, ty = g.objs[i2]
        if n2 not in TREE_SHADOW: continue
        for (nc, cx2, cy2) in g.objs:
            if nc in CRIT_OCCL and ty >= cy2 and ty - cy2 <= 3 and abs(tx - cx2) <= 2:
                for (ddx, ddy) in ((3, 0), (-3, 0), (0, 3), (3, 3), (-3, 3)):
                    nx2, ny2 = tx+ddx, ty+ddy
                    if 2 <= nx2 <= COLS-3 and 3 <= ny2 <= ROWS-1 and not sea[min((ny2+1)*T-4, Hpx-1)][nx2*T+8]:
                        if not any(na in CRIT_OCCL and ny2 >= ya and ny2 - ya <= 3 and abs(nx2 - xa) <= 2 for (na, xa, ya) in g.objs):
                            print('⚠ %s: albero (%d,%d) → slittato a (%d,%d) per liberare %s' % (g.name, tx, ty, nx2, ny2, nc))
                            g.objs[i2] = (n2, nx2, ny2); tx, ty = nx2, ny2
                            break
                break
    for (n, x, y) in sorted(g.objs, key=lambda o: o[2]):
        im = sprite(n); fw, fh = im.size
        ax, ay = x*T+8, (y+1)*T
        if n not in NO_SHADOW and not sea[min(ay, Hpx-1)-1][ax]:
            sh = SHADOW_TREE if n in TREE_SHADOW else SHADOW_LOOT
            img.paste(sh, (ax-sh.size[0]//2, ay-sh.size[1]+1), sh)
        img.paste(im, (ax-fw//2, ay-fh), im)
    img.resize((Wpx*2, Hpx*2), Image.NEAREST).save(ROOT + '/esercizi/03_organiche_pipeline/' + g.name + '.png')
    print('scritto', g.name)
    return sea

def forest_fill(g, keep_clear, opening=None, density_f=None):
    """H40: density_f(x,y)→probabilità locale (gradiente di bioma); default fisso"""
    rnd = g.rnd
    egg_zone = {(ex+dx, ey+dy) for (ex, ey) in g.eggs for dx in range(-2, 3) for dy in range(-3, 3)}   # H18
    for y in range(3, ROWS):
        for x in range(2, COLS-2):
            if keep_clear(x, y) or (x, y) in egg_zone: continue
            if opening and opening(x, y): continue
            p = density_f(x, y) if density_f else None
            if p is not None:
                if rnd.random() < p: g.O(rnd.choice(TREES_GREEN), x, y)
            elif (x*7 + y*3 + (x*y) % 5) % 3 == 0 or rnd.random() < 0.28:
                g.O(rnd.choice(TREES_GREEN), x, y)
