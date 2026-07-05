#!/usr/bin/env python3
"""HUBGEN v3 — giardini del Giardino dei Sapienti in JSON schema-v2 (loader-ready) + preview PNG.
H54 emissione v2 · H56 dotazione hub · H57 reachability BFS (validate, loop 4).
Vincolo Giacomo (5/7/26): SOLO tile originali overworld.png; erba lime BANDITA (R3b estesa);
frangia col lato marrone solo contro terra (R18, tabella BROWN_SIDES verificata via pixel).
H66 sentiero = terra battuta orto [1,30]/[2,32] + frangia inversa [0..2,29..33]
H67 acqua = vasca rettangolare [3,7] + schiuma [2..4,6..8] + isola prefab [2..3,9..10]
v3: dimensioni per-istanza (mappe 100x100, round rS)."""
import sys, os, json, random, math
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arcipelago import sprite, SHADOW_LOOT, SHADOW_TREE, NO_SHADOW, TREE_SHADOW, tile as owtile, T

ROOT = '/Users/giacomomeschini/Claude/MappAI BERT'
ERBA = ('overworld', 0, 0)
# R19 (Giacomo 5/7/26): [6,10] NON e' erba pura -> ha terra reale sul lato E (58% banda marrone,
# verificato via pixel). Bandito dal fill random di sfondo: piazzato a caso crea una riga marrone
# orfana in mezzo al prato (bug confermato: 100% dei piazzamenti avevano vicino-E sbagliato).
ERBE = [('overworld',0,0),('overworld',0,9),('overworld',0,10),('overworld',1,10),('overworld',5,10),('overworld',7,10)]
ACQUA = ('overworld', 3, 7)                                  # vasca su erba scura (prefab originale)
# frangia riva sull'ERBA adiacente: chiave = lati dove sta l'ACQUA (schiuma bianca, zero lime)
WFR = {'s':(3,6),'n':(3,8),'e':(2,7),'w':(4,7),'se':(2,6),'sw':(4,6),'ne':(2,8),'nw':(4,8)}
ISLA = {(0,0):(2,9),(1,0):(3,9),(0,1):(2,10),(1,1):(3,10)}   # isola prefab 2x2
SIEPE_LUT = {15:(2,14),14:(2,13),7:(1,14),13:(3,14),11:(2,15),6:(1,13),12:(3,13),
             3:(1,15),9:(3,15),5:(1,14),10:(2,13),1:(0,15),4:(0,14),2:(0,16),8:(1,16),0:(2,14)}
DAISY = [(3,11),(2,12),(3,12)]
ROCKD = [(6,5),(7,5),(9,5)]                                  # sassi bruni naturali (H51)
DECK = [[(8,6),(9,6),(10,6)],[(8,7),(9,7),(10,7)]]           # pontile 3x2 originale
# H66 — sentiero = TERRA BATTUTA dell'orto originale (righe 29-33) + frangia d'erba inversa.
TERRA_C = [(1,30),(2,32)]                                    # terra piena (2 varianti)
# R18 (Giacomo 5/7/26): un tile-frangia si usa SOLO se ogni suo lato marrone tocca terra.
# Mapping VERIFICATO via pixel (lato = marrone se banda 3px >=30% terra).
FRINGE = {'s':(1,29), 'n':(1,31), 'e':(0,30), 'w':(2,30),
          'nw':(0,32), 'ne':(1,32), 'sw':(0,33), 'se':(1,33)}
BROWN_SIDES = {(1,29):'s', (1,31):'n', (0,30):'e', (2,30):'w',
               (0,32):'nw', (1,32):'ne', (0,33):'sw', (1,33):'se'}   # da analisi pixel
PATH_TILES = set(TERRA_C) | set(FRINGE.values())
# H65 — whitelist only-original (tutte coord censite su overworld.png)
OK_GROUND = {(c[1],c[2]) for c in ERBE} | {(ACQUA[1],ACQUA[2])} | PATH_TILES \
    | set(WFR.values()) | set(ISLA.values())
OK_OVER = set(SIEPE_LUT.values()) | set(DAISY) | set(ROCKD) | {t for row in DECK for t in row}
SOLID_GROUND = {'16,1','0,1','33,17','33,18',
                '3,7','3,6','2,7','4,7','3,8','2,9','3,9','2,10','3,10'}   # sync mappai-map-loader.js
SIEPE_OVER = {'%d,%d' % v for v in SIEPE_LUT.values()}
# SOLO alberi UFFICIALI del repo LoL (sprites/environment/): tree, tree2 (chioma rossa), tree-old.
# tree-oak/tall/pine/autumn/bush = sprite INVENTATI (sessione assets-manager) — BANDITI (Giacomo 5/7/26).
SOLID_OBJ = {'tree','tree2','tree-old','lantern','container'}
TREES_GREEN = ['tree','tree','tree','tree','tree','tree-old']    # bosco: tree + ~17% tree-old
NPCS = ('sapiente-viola','sapiente-rosso','merchant','mage','gatekeeper')

class Hub:
    def __init__(self, name, seed, cols=30, rows=20):
        self.name = name; self.rnd = random.Random(seed)
        self.C, self.R = cols, rows
        self.ground = [[self.rnd.choice(ERBE) for _ in range(cols)] for _ in range(rows)]
        self.over = [[None]*cols for _ in range(rows)]
        self.objects = []; self.spawn = None
        self.water = set(); self.pathc = set(); self.deck = set(); self.shorec = set()

    # ---- vasca rettangolare su erba scura (H67) -----------------------------
    # Il set schiuma-su-erba [2..4,6..8] non ha angoli interni ne' tile per gli
    # step: forme RETTANGOLARI (vasca formale, coerente col chiostro giardino1).
    def stagno(self, x0, y0, x1, y1):
        cells = {(x, y) for y in range(y0, y1+1) for x in range(x0, x1+1)}
        for (x, y) in cells: self.ground[y][x] = ACQUA
        self.water |= cells
        for y in range(max(0, y0-1), min(self.R, y1+2)):     # frangia schiuma sull'erba attorno
            for x in range(max(0, x0-1), min(self.C, x1+2)):
                if (x, y) in cells: continue
                key = ('n' if (x, y-1) in cells else '')+('s' if (x, y+1) in cells else '')
                key += ('e' if (x+1, y) in cells else '')+('w' if (x-1, y) in cells else '')
                if not key:
                    for dk, (dx, dy) in (('nw',(-1,-1)),('ne',(1,-1)),('sw',(-1,1)),('se',(1,1))):
                        if (x+dx, y+dy) in cells: key = dk; break
                if key:
                    assert key in WFR, '%s: riva senza tile per %s in (%d,%d)' % (self.name, key, x, y)
                    self.ground[y][x] = ('overworld',) + WFR[key]
                    self.shorec.add((x, y))
        return cells
    def isola(self, x0, y0):
        for (dx, dy), c in ISLA.items():
            p = (x0+dx, y0+dy)
            ok = all((p[0]+ex, p[1]+ey) in self.water for ex in (-1,0,1) for ey in (-1,0,1))
            assert ok, '%s: isola non circondata d acqua in %s' % (self.name, p)
            self.ground[p[1]][p[0]] = ('overworld',) + c

    # ---- sentiero terra battuta (H66) ---------------------------------------
    def route(self, pts, w=3):
        h = w // 2
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            assert x0 == x1 or y0 == y1, 'route: solo segmenti assiali'
            for t in range(max(abs(x1-x0), abs(y1-y0)) + 1):
                x = x0 + (0 if x0 == x1 else t*(1 if x1 > x0 else -1))
                y = y0 + (0 if y0 == y1 else t*(1 if y1 > y0 else -1))
                for dx in range(-h, h+1):
                    for dy in range(-h, h+1):
                        p = (x+dx, y+dy)
                        if 0 <= p[0] < self.C and 0 <= p[1] < self.R: self.pathc.add(p)
        for p in self.pathc:
            assert p not in self.water, '%s: sentiero su acqua %s' % (self.name, p)
            assert p not in self.shorec, '%s: sentiero sulla riva %s' % (self.name, p)

    def _resolve_paths(self):
        while True:                                          # chiudi buchi d'erba a fixpoint (R20:
            add = {(x, y) for y in range(self.R) for x in range(self.C) if (x, y) not in self.pathc  # una chiusura puo' sbloccarne
                   and sum(1 for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)) if (x+dx, y+dy) in self.pathc) >= 3}  # un'altra a cascata)
            if not add: break
            self.pathc |= add
        P = self.pathc
        for (x, y) in P:                                     # terra piena, mix 2 varianti
            self.ground[y][x] = ('overworld',) + (TERRA_C[0] if self.rnd.random() < 0.7 else TERRA_C[1])
        def dirt(x, y):                                      # R20: fuori mappa NON e' mai terra —
            return 0 <= x < self.C and 0 <= y < self.R and (x, y) in P   # solo terra REALE in-bounds
        for y in range(self.R):                              # frangia inversa sull'erba adiacente
            for x in range(self.C):
                if (x, y) in P or self.ground[y][x] not in ERBE: continue
                n, e, s, w = dirt(x,y-1), dirt(x+1,y), dirt(x,y+1), dirt(x-1,y)
                key = ('n' if n else '')+('s' if s else '')  # ordine: n/s prima, poi e/w
                key += ('e' if e else '')+('w' if w else '')
                if key in ('ns','ew','nse','nsw','new','sew','nsew'): key = key[0]  # 3+ lati: tappo semplice
                if key:
                    c = FRINGE[key]
                    # R18: ogni lato marrone del tile DEVE toccare terra
                    D = {'n':(0,-1),'s':(0,1),'e':(1,0),'w':(-1,0)}
                    for side in BROWN_SIDES[c]:
                        assert dirt(x+D[side][0], y+D[side][1]), \
                            '%s: frangia %s in (%d,%d), lato marrone %s contro non-terra (R18)' % (self.name, c, x, y, side)
                    self.ground[y][x] = ('overworld',) + c

    # ---- arredi ------------------------------------------------------------
    def aiuola(self, x0, y0, x1, y1, gap):
        ring = set()
        for x in range(x0, x1+1): ring |= {(x, y0), (x, y1)}
        for y in range(y0, y1+1): ring |= {(x0, y), (x1, y)}
        ring.discard(gap)
        for (x, y) in ring:
            assert (x, y) not in self.water and (x, y) not in self.shorec, \
                '%s: siepe su acqua/riva (%d,%d) (E-R4)' % (self.name, x, y)
            m = (1 if (x,y-1) in ring else 0)+(2 if (x+1,y) in ring else 0)+(4 if (x,y+1) in ring else 0)+(8 if (x-1,y) in ring else 0)
            self.over[y][x] = ('overworld',) + SIEPE_LUT[m]
        for y in range(y0+1, y1):
            for x in range(x0+1, x1):
                if (x, y) not in self.pathc and self.rnd.random() < 0.75:
                    self.over[y][x] = ('overworld',) + self.rnd.choice(DAISY)
    def siepe(self, cells):
        """Siepe su un set libero di celle (LUT edge4, stessa del map-editor)."""
        S = set(cells)
        for (x, y) in S:
            assert (x, y) not in self.water and (x, y) not in self.shorec, \
                '%s: siepe su acqua/riva (%d,%d)' % (self.name, x, y)
            m = (1 if (x,y-1) in S else 0)+(2 if (x+1,y) in S else 0)+(4 if (x,y+1) in S else 0)+(8 if (x-1,y) in S else 0)
            self.over[y][x] = ('overworld',) + SIEPE_LUT[m]
    def cespuglio(self, x, y):
        """Cespuglio UFFICIALE = tile siepe singola [2,14] (composizione dal tileset, no sprite fake)."""
        assert self.ground[y][x] in ERBE and self.over[y][x] is None, \
            '%s: cespuglio su cella occupata (%d,%d)' % (self.name, x, y)
        self.over[y][x] = ('overworld',) + SIEPE_LUT[0]
    def cespugli(self, n, keep_clear=lambda x, y: False):
        """Scatter di cespugli-tile: Chebyshev >=2 dalle siepi (per non fondersi) e tra loro."""
        hedge = {(x, y) for y in range(self.R) for x in range(self.C)
                 if self.over[y][x] and '%d,%d' % (self.over[y][x][1], self.over[y][x][2]) in SIEPE_OVER}
        near_hedge = {(x+dx, y+dy) for (x, y) in hedge for dx in range(-2, 3) for dy in range(-2, 3)}
        placed = []
        tries = 0
        while len(placed) < n and tries < n*300:
            tries += 1
            x = self.rnd.randrange(1, self.C-1); y = self.rnd.randrange(1, self.R-1)
            if keep_clear(x, y) or (x, y) in near_hedge: continue
            if self.ground[y][x] not in ERBE or self.over[y][x] is not None: continue
            if (x, y) in self.pathc or (x, y) in self.water or (x, y) in self.shorec: continue
            if any(max(abs(x-px), abs(y-py)) < 2 for (px, py) in placed): continue
            doppio = self.rnd.random() < 0.4 and x+1 < self.C-1 \
                and self.ground[y][x+1] in ERBE and self.over[y][x+1] is None \
                and (x+1, y) not in near_hedge and (x+1, y) not in self.pathc \
                and not any(max(abs(x+1-px), abs(y-py)) < 2 for (px, py) in placed)
            if doppio:                                       # cespuglio doppio: caps orizzontali del set
                self.over[y][x] = ('overworld',) + SIEPE_LUT[2]      # cap sinistro
                self.over[y][x+1] = ('overworld',) + SIEPE_LUT[8]    # cap destro
                placed += [(x, y), (x+1, y)]
            else:
                self.cespuglio(x, y); placed.append((x, y))
        return placed
    def fiori(self, cells):
        for (x, y) in cells:
            if self.over[y][x] is None and self.ground[y][x] in ERBE and (x, y) not in self.pathc:
                self.over[y][x] = ('overworld',) + self.rnd.choice(DAISY)
    def molo(self, x0, y0):
        for r, row in enumerate(DECK):
            for c, t in enumerate(row):
                assert (x0+c, y0+r) in self.water, '%s: molo fuori dall acqua' % self.name
                self.over[y0+r][x0+c] = ('overworld',) + t
                self.deck.add((x0+c, y0+r))
    def O(self, n, x, y): self.objects.append({'name': n, 'x': x, 'y': y})
    def apertura_sud(self, x):
        self.route([(x, self.R-1), (x, self.R-3)])           # bleed: il path tocca il bordo
        self.O('lantern', x-2, self.R-2); self.O('lantern', x+2, self.R-2)
        self.spawn = (x, self.R-1)
    def cornice(self):                                       # E-R3: margine anti-taglio vivo
        for y in range(self.R):
            for x in range(self.C):
                if not (x < 2 or x >= self.C-2 or y < 3 or y >= self.R-1): continue
                if self.ground[y][x] not in ERBE or self.over[y][x] is not None: continue
                if (x, y) in self.pathc: continue
                r = self.rnd.random()
                if r < 0.08: self.over[y][x] = ('overworld',) + self.rnd.choice(ROCKD)
                elif r < 0.20: self.over[y][x] = ('overworld',) + self.rnd.choice(DAISY)

    # ---- bosco a file sfalsate (H64) + keep-clear automatico (E-R7) ---------
    def bosco(self, keep_clear, density=0.55, band=2, interior=0.3):
        occ = {(o['x'], o['y']) for o in self.objects}
        trees = [(o['x'], o['y']) for o in self.objects if o['name'] in TREE_SHADOW]
        tset = set(trees)
        near = set()                                         # chiome 64px: sbordano 2 celle
        for (px, py) in self.water | self.deck | (occ - tset):
            for dx in range(-2, 3):
                for dy in range(-2, 4):                      # +3 in giu': l'albero DAVANTI occlude
                    near.add((px+dx, py+dy))
        for (px, py) in self.pathc:
            for dx in range(-1, 2):
                for dy in range(-1, 2): near.add((px+dx, py+dy))
        for y in range(3, self.R-1):                         # sprite 64px: y<3 o x<2 = taglio R4
            for x in range(2, self.C-2):
                if keep_clear(x, y) or (x, y) in occ or (x, y) in near: continue
                if self.ground[y][x] not in ERBE or self.over[y][x] is not None: continue   # H61
                d_edge = min(x, y, self.C-1-x, self.R-1-y)
                p = density if d_edge <= band else density*interior
                if self.rnd.random() >= p: continue
                if any(abs(x-tx) <= 1 and abs(y-ty) == 1 for tx, ty in trees): continue     # H64/R17
                self.O(self.rnd.choice(TREES_GREEN), x, y); trees.append((x, y))

    # ---- validazione --------------------------------------------------------
    def walkable(self):
        m = {}
        for y in range(self.R):
            for x in range(self.C):
                s = 0
                g = self.ground[y][x]; o = self.over[y][x]
                if '%d,%d' % (g[1], g[2]) in SOLID_GROUND: s = 1
                if o and '%d,%d' % (o[1], o[2]) in SIEPE_OVER: s = 1
                m[(x, y)] = s
        for ob in self.objects:
            if ob['name'] in SOLID_OBJ: m[(ob['x'], ob['y'])] = 1
        return m
    def valida(self):
        for y in range(self.R):                              # H65 only-original
            for x in range(self.C):
                g = self.ground[y][x]; o = self.over[y][x]
                assert g[0] == 'overworld' and (g[1], g[2]) in OK_GROUND, \
                    '%s: tile ground fuori whitelist %s in (%d,%d)' % (self.name, g, x, y)
                assert o is None or (o[0] == 'overworld' and (o[1], o[2]) in OK_OVER), \
                    '%s: tile over fuori whitelist %s in (%d,%d)' % (self.name, o, x, y)
        for ob in self.objects:                              # E-G2 seam + E-R4 acqua
            p = (ob['x'], ob['y'])
            if ob['name'] == 'animal-duck':
                assert self.ground[p[1]][p[0]] == ACQUA, \
                    '%s: anatra NON in acqua (%d,%d)' % (self.name, p[0], p[1])
            else:
                assert p not in self.water, '%s: %s in acqua %s (E-R4)' % (self.name, ob['name'], p)
                assert p not in self.shorec, '%s: %s sul seam della riva %s (E-G2)' % (self.name, ob['name'], p)
        m = self.walkable()
        sx, sy = self.spawn
        assert m[(sx, sy)] == 0, '%s: spawn su cella solida' % self.name
        seen = {(sx, sy)}; st = [(sx, sy)]
        while st:
            x, y = st.pop()
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                n = (x+dx, y+dy)
                if 0 <= n[0] < self.C and 0 <= n[1] < self.R and n not in seen and m[n] == 0:
                    seen.add(n); st.append(n)
        for ob in self.objects:                              # H57
            if ob['name'] in NPCS:
                p = (ob['x'], ob['y'])
                near = p in seen or any((p[0]+dx, p[1]+dy) in seen for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)))
                assert near, '%s: %s (%d,%d) NON raggiungibile dallo spawn' % (self.name, ob['name'], p[0], p[1])
        pct = len(seen) * 100 // (self.C*self.R)
        print('  %s: raggiungibile %d%% della mappa, %d oggetti, NPC ok' % (self.name, pct, len(self.objects)))

    # ---- output --------------------------------------------------------------
    def salva(self):
        self._resolve_paths()
        self.valida()
        j = {'version': 2, 'tile': T, 'cols': self.C, 'rows': self.R, 'spawn': list(self.spawn),
             'layers': [
                 {'name': 'ground', 'data': [[{'ts': c[0], 'c': c[1], 'r': c[2]} for c in row] for row in self.ground]},
                 {'name': 'over', 'data': [[({'ts': c[0], 'c': c[1], 'r': c[2]} if c else None) for c in row] for row in self.over]}],
             'objects': self.objects}
        json.dump(j, open(ROOT + '/esercizi/04_hub_tilespace/' + self.name + '.json', 'w'))
        img = Image.new('RGBA', (self.C*T, self.R*T), (0, 0, 0, 255))
        for y in range(self.R):
            for x in range(self.C):
                g = self.ground[y][x]; img.paste(owtile(g[1], g[2]), (x*T, y*T))
        for y in range(self.R):
            for x in range(self.C):
                o = self.over[y][x]
                if o:                                        # alpha nativa: NIENTE strip (schiuma riva)
                    t = owtile(o[1], o[2]); img.paste(t, (x*T, y*T), t)
        for ob in sorted(self.objects, key=lambda o: o['y']):
            im = sprite(ob['name']); fw, fh = im.size
            ax, ay = ob['x']*T+8, (ob['y']+1)*T
            if ob['name'] not in NO_SHADOW and self.ground[ob['y']][ob['x']] != ACQUA:
                sh = SHADOW_TREE if ob['name'] in TREE_SHADOW else SHADOW_LOOT
                img.paste(sh, (ax-sh.size[0]//2, ay-sh.size[1]+1), sh)
            x0, y0 = ax-fw//2, ay-fh
            assert 0 <= x0 and x0+fw <= self.C*T and y0 >= -2, '%s: sprite %s tagliato dal canvas (R4)' % (self.name, ob['name'])
            img.paste(im, (x0, max(0, y0)), im)
        scale = 2 if self.C <= 60 else 1                     # 100x100: PNG 1x (1600px) per file gestibili
        img.resize((self.C*T*scale, self.R*T*scale), Image.NEAREST).save(ROOT + '/esercizi/04_hub_tilespace/' + self.name + '.png')
        print('scritto', self.name, '(json+png)')


# ============================== MAPPE rR (30x20) ==============================
def rR_viale():
    h = Hub('rR_hub_viale', 62001)
    h.stagno(18, 6, 25, 11)                                  # vasca 8x6 E
    h.apertura_sud(14)
    h.route([(14, 19), (14, 13), (9, 13), (9, 5)])
    h.aiuola(3, 5, 8, 10, (8, 8))                            # camera del sapiente-viola 6x6, gap E
    h.O('sapiente-viola', 5, 8); h.O('lantern', 4, 6)
    h.O('sapiente-rosso', 16, 8)                             # riva W della vasca
    h.O('merchant', 12, 11); h.O('scroll', 11, 11); h.O('book', 11, 10); h.O('lantern', 13, 11)
    h.O('mage', 22, 14); h.O('tree', 20, 15); h.O('tree', 24, 15)
    h.O('gatekeeper', 9, 4)
    h.O('tree2', 25, 4)                            # unica chioma rossa (R10)
    h.O('animal-duck', 21, 8)                                # egg NE (in acqua)
    h.O('animal-frog', 5, 15)                                # egg SW
    h.O('animal-butterfly', 3, 3)                            # egg NW
    h.fiori([(4,14),(5,14),(4,15),(11,6),(11,7),(12,7)])
    ok = lambda x, y: (x, y) in h.pathc or (x, y) in h.water \
        or (2 <= x <= 9 and 4 <= y <= 11) or (10 <= x <= 14 and 9 <= y <= 12) \
        or (12 <= x <= 16 and 17 <= y <= 19) or (3 <= x <= 6 and 13 <= y <= 16) \
        or (8 <= x <= 10 and 3 <= y <= 5) or (2 <= x <= 4 and 2 <= y <= 4)
    h.bosco(ok)
    h.cornice()
    h.salva()

def rR_stanze():
    h = Hub('rR_hub_stanze', 62002)
    h.stagno(8, 2, 12, 5)                                    # vasca 5x4 NW
    h.apertura_sud(15)
    h.route([(15, 19), (15, 4)])
    h.route([(15, 10), (11, 10), (11, 9), (9, 9)])           # ramo W verso la camera
    h.route([(15, 10), (19, 10), (19, 7), (20, 7)])          # ramo E verso la camera
    h.aiuola(3, 7, 8, 11, (8, 9))                            # camera W (sotto la vasca), gap E
    h.O('sapiente-viola', 5, 9); h.O('lantern', 3, 6)
    h.aiuola(21, 5, 26, 9, (21, 7))                          # camera E, gap W sul ramo
    h.O('sapiente-rosso', 24, 7); h.O('lantern', 27, 4)
    h.O('merchant', 17, 14); h.O('book', 16, 14); h.O('scroll', 17, 13); h.O('lantern', 18, 14)
    h.O('mage', 13, 7)                                       # ancorato alla vasca NW
    h.O('gatekeeper', 15, 3)
    h.O('tree2', 25, 12)                          # unica chioma rossa
    h.O('animal-duck', 9, 3)                                 # egg NW (vasca)
    h.O('animal-cat', 20, 15)                                # egg SE
    h.O('animal-butterfly', 4, 16)                           # egg SW
    h.fiori([(19,12),(19,13),(20,13),(9,15),(9,16),(10,16),(12,8),(13,8)])
    ok = lambda x, y: (x, y) in h.pathc or (x, y) in h.water \
        or (2 <= x <= 9 and 4 <= y <= 10) or (20 <= x <= 27 and 4 <= y <= 10) \
        or (8 <= x <= 14 and 2 <= y <= 8) or (14 <= x <= 19 and 12 <= y <= 16) \
        or (8 <= x <= 11 and 14 <= y <= 17) or (18 <= x <= 21 and 13 <= y <= 16) \
        or (14 <= x <= 16 and 2 <= y <= 4)
    h.bosco(ok)
    h.cornice()
    h.salva()

def rR_lago():
    h = Hub('rR_hub_lago', 62003)
    h.stagno(16, 10, 27, 17)                                 # vasca grande 12x8 SE
    h.isola(22, 12)                                          # isola prefab 2x2
    h.molo(16, 13)                                           # pontile agganciato alla sponda W
    h.apertura_sud(10)
    h.route([(10, 19), (10, 7), (16, 7), (16, 5)])
    h.route([(13, 9), (13, 13)])                             # promenade fino alla testa del molo
    h.aiuola(3, 4, 8, 9, (8, 6))
    h.O('sapiente-viola', 5, 6); h.O('lantern', 9, 4)
    h.O('sapiente-rosso', 14, 12)                            # testa del molo
    h.O('merchant', 13, 7); h.O('book', 12, 7); h.O('scroll', 13, 6); h.O('lantern', 14, 7)
    h.O('mage', 23, 5); h.O('tree', 21, 6); h.O('tree', 25, 6)
    h.O('gatekeeper', 16, 4)
    h.O('tree2', 26, 8)                            # unica chioma rossa
    h.O('animal-duck', 23, 15)                               # egg SE (in acqua)
    h.O('animal-frog', 5, 13)                                # egg SW
    h.O('animal-butterfly', 25, 3)                           # egg NE
    h.fiori([(4,12),(5,12),(5,13),(18,6),(18,7),(19,7),(8,16),(8,17),(9,17)])
    ok = lambda x, y: (x, y) in h.pathc or (x, y) in h.water \
        or (2 <= x <= 9 and 3 <= y <= 10) or (11 <= x <= 19 and 5 <= y <= 13) \
        or (20 <= x <= 27 and 3 <= y <= 9) \
        or (3 <= x <= 7 and 11 <= y <= 14) or (7 <= x <= 12 and 15 <= y <= 18) \
        or (15 <= x <= 17 and 3 <= y <= 5) or (24 <= x <= 26 and 2 <= y <= 4)
    h.bosco(ok)
    h.cornice()
    h.salva()


# ============================== MAPPE rS (100x100) ============================
def _rects(*rs):
    """keep_clear da lista di rettangoli (x0,y0,x1,y1)."""
    def f(x, y):
        return any(x0 <= x <= x1 and y0 <= y <= y1 for (x0, y0, x1, y1) in rs)
    return f

def rS_parco():
    h = Hub('rS_hub_parco', 63001, 100, 100)
    h.stagno(60, 42, 82, 58)                                 # lago grande E
    h.isola(70, 49)
    h.molo(60, 50)                                           # pontile sponda W
    h.stagno(30, 18, 37, 23)                                 # vasca N
    h.apertura_sud(50)
    h.route([(50, 99), (50, 50)])                            # viale S
    h.route([(50, 50), (50, 12)])                            # viale N -> discesa
    h.route([(50, 50), (25, 50)])                            # ramo W -> camera
    h.route([(50, 50), (57, 50)])                            # ramo E -> molo
    h.route([(40, 30), (48, 30)])                            # spur vasca N
    h.aiuola(14, 44, 23, 53, (23, 50))                       # camera sapiente-viola 10x10
    h.O('sapiente-viola', 18, 48); h.O('lantern', 16, 46)
    h.O('sapiente-rosso', 58, 50)                            # testa del molo
    h.O('merchant', 47, 66); h.O('scroll', 47, 65); h.O('book', 46, 66); h.O('lantern', 48, 67)
    h.O('mage', 35, 27)                                      # tra vasca N e spur
    h.O('gatekeeper', 50, 10)
    h.O('tree2', 25, 42)                           # unica chioma rossa (R10)
    h.O('animal-duck', 66, 47)                               # egg NE (nel lago)
    h.O('animal-frog', 20, 75)                               # egg SW
    h.O('animal-butterfly', 15, 15)                          # egg NW
    h.fiori([(20,74),(21,74),(20,76),(45,60),(46,60),(45,61),(56,44),(57,45),
             (30,55),(31,55),(30,56),(60,30),(61,30),(60,31),(70,70),(71,70),(70,71)])
    ok = _rects((12,42,28,56), (55,44,59,56), (27,15,42,26), (65,68,80,80),
                (16,70,26,80), (46,8,54,14), (58,26,66,34), (44,63,49,69),
                (12,12,18,18))
    keep = lambda x, y: (x, y) in h.pathc or (x, y) in h.water or ok(x, y)
    h.bosco(keep, density=0.55, band=5, interior=0.10)
    h.cornice()
    h.salva()

def rS_borgo():
    h = Hub('rS_hub_borgo', 63002, 100, 100)
    h.stagno(25, 25, 34, 32)                                 # vasca NW
    h.stagno(68, 72, 75, 77)                                 # vasca SE
    h.apertura_sud(50)
    h.route([(50, 99), (50, 16)])                            # cardo S-N
    h.route([(20, 55), (80, 55)])                            # decumano W-E
    h.route([(44, 52), (56, 52)])                            # piazza (3 fasce sovrapposte)
    h.route([(44, 58), (56, 58)])
    h.aiuola(12, 50, 19, 57, (19, 55))                       # camera W sul decumano
    h.O('sapiente-viola', 15, 53); h.O('lantern', 14, 51)
    h.aiuola(81, 50, 88, 57, (81, 55))                       # camera E sul decumano
    h.O('sapiente-rosso', 85, 53); h.O('lantern', 86, 51)
    h.O('merchant', 47, 53); h.O('scroll', 46, 53); h.O('book', 46, 52); h.O('lantern', 48, 53)
    h.O('lantern', 53, 57)                                   # seconda lanterna di piazza
    h.O('mage', 30, 35)                                      # ancorato alla vasca NW
    h.O('gatekeeper', 50, 14)
    h.O('tree2', 58, 49)                           # unica chioma rossa
    h.O('animal-duck', 28, 28)                               # egg NW (vasca)
    h.O('animal-frog', 66, 79)                               # egg SE (vasca)
    h.O('animal-butterfly', 25, 75)                          # egg SW
    h.fiori([(22,52),(22,53),(23,53),(60,60),(61,60),(60,61),(35,70),(36,70),(35,71),
             (65,35),(66,35),(65,36),(24,74),(24,76),(26,76)])
    ok = _rects((10,48,21,59), (79,48,90,59), (22,22,38,37), (64,68,79,82),
                (21,71,29,79), (46,12,54,18), (60,28,72,40), (42,50,58,60))
    keep = lambda x, y: (x, y) in h.pathc or (x, y) in h.water or ok(x, y)
    h.bosco(keep, density=0.55, band=5, interior=0.10)
    h.cornice()
    h.salva()

def rS_laghi():
    h = Hub('rS_hub_laghi', 63003, 100, 100)
    h.stagno(30, 20, 60, 35)                                 # lago N
    h.isola(44, 26)
    h.stagno(45, 60, 75, 78)                                 # lago S
    h.molo(52, 60)                                           # pontile sponda N del lago S
    h.apertura_sud(20)
    h.route([(20, 99), (20, 80), (40, 80), (40, 42)])        # risalita W
    h.route([(40, 42), (70, 42), (70, 20)])                  # istmo + salita alla discesa
    h.route([(53, 42), (53, 57)])                            # spur al molo
    h.aiuola(20, 22, 27, 29, (27, 25))                       # camera viola sulla riva W del lago N
    h.O('sapiente-viola', 23, 25); h.O('lantern', 21, 23)
    h.O('sapiente-rosso', 53, 58)                            # testa del molo
    h.O('merchant', 37, 60); h.O('scroll', 37, 59); h.O('book', 36, 60); h.O('lantern', 38, 61)
    h.O('mage', 60, 44); h.O('tree', 58, 45); h.O('tree', 62, 45)
    h.O('gatekeeper', 70, 18)
    h.O('tree2', 50, 50)                           # unica chioma rossa, istmo
    h.O('animal-duck', 65, 70)                               # egg SE (lago S)
    h.O('animal-frog', 25, 33)                               # egg NW
    h.O('animal-butterfly', 12, 75)                          # egg SW
    h.fiori([(24,33),(24,34),(25,34),(48,46),(49,46),(48,47),(78,68),(79,68),(78,69),
             (12,76),(13,76),(12,77)])
    ok = _rects((18,20,29,32), (44,44,66,56), (66,16,74,22), (77,66,82,72),
                (10,72,16,80), (34,57,42,63), (22,30,28,36))
    keep = lambda x, y: (x, y) in h.pathc or (x, y) in h.water or ok(x, y)
    h.bosco(keep, density=0.55, band=5, interior=0.10)
    h.cornice()
    h.salva()

# ================== MAPPE rT (70x70 — SOLO prato + cespugli + siepi) =========
def _ring(x0, y0, x1, y1, gaps=()):
    """Celle del perimetro di un rettangolo, meno i varchi."""
    ring = set()
    for x in range(x0, x1+1): ring |= {(x, y0), (x, y1)}
    for y in range(y0, y1+1): ring |= {(x0, y), (x1, y)}
    return ring - set(gaps)

def rT_anelli():
    h = Hub('rT_prato_anelli', 64001, 70, 70)
    h.spawn = (35, 68)
    A = _ring(17, 15, 53, 55, gaps=[(x, 55) for x in (34, 35, 36)])          # varco S
    B = _ring(24, 22, 46, 48, gaps=[(46, y) for y in (34, 35, 36)])          # varco E
    C = _ring(30, 28, 40, 42, gaps=[(x, 28) for x in (34, 35, 36)])          # varco N
    h.siepe(A | B | C)
    h.cespuglio(35, 37)                                                      # cuore del giardino
    dentro = lambda x, y: 15 <= x <= 55 and 13 <= y <= 57                    # corridoi liberi
    h.cespugli(26, keep_clear=dentro)
    h.salva()

def rT_stanze():
    h = Hub('rT_prato_stanze', 64002, 70, 70)
    h.spawn = (35, 68)
    rooms = [(9, 9, 24, 21, [(24, y) for y in (14, 15)]),                    # NW, varco E
             (45, 9, 60, 21, [(45, y) for y in (14, 15)]),                   # NE, varco W
             (9, 48, 24, 60, [(24, y) for y in (53, 54)]),                   # SW, varco E
             (45, 48, 60, 60, [(45, y) for y in (53, 54)]),                  # SE, varco W
             (27, 27, 43, 42, [(x, 42) for x in (34, 35, 36)])]              # centrale, varco S
    S = set()
    for (x0, y0, x1, y1, gaps) in rooms: S |= _ring(x0, y0, x1, y1, gaps)
    h.siepe(S)
    for (bx, by) in [(12, 12), (57, 12), (12, 57), (57, 57), (35, 33)]:      # un cespuglio per stanza
        h.cespuglio(bx, by)
    in_room = lambda x, y: any(x0-1 <= x <= x1+1 and y0-1 <= y <= y1+1 for (x0, y0, x1, y1, _) in rooms)
    h.cespugli(22, keep_clear=in_room)
    h.salva()

def rT_frangivento():
    h = Hub('rT_prato_frangivento', 64003, 70, 70)
    h.spawn = (35, 68)
    S = set()
    rnd = random.Random(640033)
    for i, y in enumerate((11, 21, 31, 41, 51, 61)):
        x = 6 + (i % 2) * 7                                                  # file sfalsate
        while x < 62:
            seg = rnd.randrange(10, 17)
            gap = rnd.randrange(4, 7)
            for sx in range(x, min(x+seg, 63)): S.add((sx, y))
            x += seg + gap
    h.siepe(S)
    h.cespugli(30)
    h.salva()

if __name__ == '__main__':
    if 'rR' in sys.argv: rR_viale(); rR_stanze(); rR_lago()
    elif 'rT' in sys.argv: rT_anelli(); rT_stanze(); rT_frangivento()
    else: rS_parco(); rS_borgo(); rS_laghi()
