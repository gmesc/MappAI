#!/usr/bin/env python3
"""Compositor PEDISSEQUO delle COMPOSITION_RULES per i giardini loop5*.
Legge i JSON del map-editor e ricompone: erba procedurale (R3b/R3c via grass.py),
terra con frange organiche + angoli interni a disco (R12) + ombra direzionale (R13),
asset LoL per laghetto/siepe/facciata, ombre sprite (R7), scala intera (R8)."""
import json, re, base64, io, random, sys, math
import os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grass import scatter_tufts, PALETTE as GRASS_PAL

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo corrente
T = 16
TERRA = (195, 147, 100, 255)      # campionato da ex3_radura (validata)
TERRA_DASH = (203, 158, 114, 255)
TERRA_DARK = (185, 138, 92, 255)
FOAM = (125, 95, 65, 255)         # R13 #7d5f41
FOAM_DARK = (82, 58, 35, 255)     # accento campionato

# ── tileset + sprite ──
OW = Image.open(ROOT + '/public/assets/legendoflua/tilesets/overworld.png').convert('RGBA')
def tile(c, r, strip=False):
    t = OW.crop((c*T, r*T, c*T+T, r*T+T))
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
        fw, fh = int(m.group(1)), int(m.group(2))
        _SPRC[name] = im.crop((0, 0, fw, fh))       # primo frame: gli sheet multi-frame vanno croppati
    return _SPRC[name]

SHADOW_TREE = Image.open(ROOT + '/public/assets/legendoflua/sprites/effects/shadows/tree.png').convert('RGBA')
SHADOW_LOOT = Image.open(ROOT + '/public/assets/legendoflua/sprites/items/lootShadow.png').convert('RGBA')
NO_SHADOW = {'animal-butterfly'}                 # vola
TREE_SHADOW = {'tree', 'tree2', 'tree-oak', 'tree-oak-autumn', 'tree-old', 'tree-pine', 'tree-tall', 'tree-tall-autumn', 'bush'}

def build(json_path, out_name, egg_moves):
    d = json.load(open(json_path))
    cols, rows = d['cols'], d['rows']
    ground = d['layers'][0]['data']; over = d['layers'][1]['data']
    Wpx, Hpx = cols*T, rows*T
    rnd = random.Random(hash(out_name) & 0xffff)

    # classi celle
    is_terra = [[False]*cols for _ in range(rows)]
    for y in range(rows):
        for x in range(cols):
            v = ground[y][x]
            if v and v['ts'] == 'overworld' and (v['c'], v['r']) == (12, 18):
                is_terra[y][x] = True

    # ── 1. erba procedurale (R3b base #3abe41 — i ciuffi arrivano DOPO la terra, solo su erba) ──
    img = Image.new('RGBA', (Wpx, Hpx), GRASS_PAL['base'])

    # ── 2. maschera terra a pixel con frangia organica ──
    mask = [[False]*Wpx for _ in range(Hpx)]
    for y in range(rows):
        for x in range(cols):
            if is_terra[y][x]:
                for yy in range(y*T, y*T+T):
                    for xx in range(x*T, x*T+T): mask[yy][xx] = True
    def neigh(m, X, Y):
        return ((X > 0 and m[Y][X-1]) or (X < Wpx-1 and m[Y][X+1]) or
                (Y > 0 and m[Y-1][X]) or (Y < Hpx-1 and m[Y+1][X]))
    # R12 angoli: dischi d'erba nei concavi (R≈12.2 bumpy), tondino nei convessi
    def disc(m, cx, cy, R, val):
        for yy in range(max(0, cy-R-2), min(Hpx, cy+R+2)):
            for xx in range(max(0, cx-R-2), min(Wpx, cx+R+2)):
                rr = R + rnd.uniform(-1.3, 1.3)
                if (xx-cx)**2 + (yy-cy)**2 <= rr*rr: m[yy][xx] = val
    def cell(x, y):
        return is_terra[y][x] if 0 <= x < cols and 0 <= y < rows else (y >= rows and is_terra[rows-1][x] if 0 <= x < cols else False)
    for y in range(rows-1):
        for x in range(cols-1):
            q = [cell(x, y), cell(x+1, y), cell(x, y+1), cell(x+1, y+1)]
            px, py = (x+1)*T, (y+1)*T
            if sum(q) == 3:            # angolo concavo: disco d'ERBA che smussa il gomito
                disc(mask, px, py, 12, False)
            elif sum(q) == 1:          # punta convessa di terra: tondino che la arrotonda
                disc(mask, px, py, 6, False)
    # frangia: cresci/erodi con rumore (bordo bumpy ±1-2px, R1 niente tagli netti)
    for p_grow, p_shr in ((0.35, 0.0), (0.0, 0.30)):
        edge = []
        for Y in range(Hpx):
            for X in range(Wpx):
                if not mask[Y][X] and neigh(mask, X, Y) and rnd.random() < p_grow: edge.append((X, Y, True))
                elif mask[Y][X] and not (X in (0, Wpx-1)) and rnd.random() < p_shr:
                    if not (mask[Y][max(X-1,0)] and mask[Y][min(X+1,Wpx-1)] and mask[max(Y-1,0)][X] and mask[min(Y+1,Hpx-1)][X]):
                        edge.append((X, Y, False))
        for X, Y, v in edge: mask[Y][X] = v

    ip = img.load()
    for Y in range(Hpx):
        for X in range(Wpx):
            if mask[Y][X]: ip[X, Y] = TERRA
    # texture terra: trattini sparsi (come lo sfondo di ex3_radura)
    for _ in range(int(Wpx*Hpx*0.004)):
        X, Y = rnd.randint(0, Wpx-3), rnd.randint(0, Hpx-1)
        if mask[Y][X] and mask[Y][X+1]:
            c = TERRA_DASH if rnd.random() < 0.7 else TERRA_DARK
            ip[X, Y] = c; ip[X+1, Y] = c
    # ── 3. R13: ombra SOLO dove l'erba sta a NORD della terra ──
    for Y in range(1, Hpx):
        for X in range(Wpx):
            if mask[Y][X] and not mask[Y-1][X]:
                if rnd.random() < 0.85: ip[X, Y] = FOAM
                if Y+1 < Hpx and mask[Y+1][X] and rnd.random() < 0.4:
                    ip[X, Y+1] = FOAM if rnd.random() < 0.7 else FOAM_DARK
    # ── 4. ciuffi SOLO sull'erba (R3c: posizione random, niente griglia) ──
    scatter_tufts(img, allow=lambda X, Y: not mask[Y][X], seed=rnd.randint(1, 999))

    # ── 5. asset LoL: laghetto (ground non-erba non-terra), facciata, overlay ──
    for y in range(rows):
        for x in range(cols):
            v = ground[y][x]
            if not v: continue
            c, r = v['c'], v['r']
            if (c, r) == (12, 18): continue                       # terra: già procedurale
            if r in (9, 10) and c <= 7: continue                  # erba preset: sostituita
            strip = (16 <= c <= 19 and 4 <= r <= 5)               # facciata castello
            t = tile(c, r, strip=strip)
            img.paste(t, (x*T, y*T), t if strip else None)
    for y in range(rows):
        for x in range(cols):
            v = over[y][x]
            if not v: continue
            t = tile(v['c'], v['r'], strip=True)
            img.paste(t, (x*T, y*T), t)

    # ── 6. oggetti: riposiziona egg (R5), ombra per soggetto (R7), y-sort (R6 anchor) ──
    objs = []
    for o in d['objects']:
        x, y = egg_moves.get((o['name'], o['x'], o['y']), (o['x'], o['y']))
        objs.append({'name': o['name'], 'x': x, 'y': y})
    water_cells = {(x, y) for y in range(rows) for x in range(cols)
                   if ground[y][x] and (ground[y][x]['c'], ground[y][x]['r']) == (16, 1)}
    for o in sorted(objs, key=lambda o: o['y']):
        im = sprite(o['name']); fw, fh = im.size
        ax, ay = o['x']*T + 8, (o['y']+1)*T                      # bottom-center (R6)
        if o['name'] not in NO_SHADOW and (o['x'], o['y']) not in water_cells:
            sh = SHADOW_TREE if o['name'] in TREE_SHADOW else SHADOW_LOOT
            img.paste(sh, (ax - sh.size[0]//2, ay - sh.size[1] + 1), sh)
        img.paste(im, (ax - fw//2, ay - fh), im)

    out = img.resize((Wpx*2, Hpx*2), Image.NEAREST)               # R8 scala intera
    out.save(ROOT + '/esercizi/02_giardini_editor/' + out_name + '.png')
    print('scritto', out_name)

if __name__ == '__main__':
    build(ROOT + '/esercizi/02_giardini_editor/loop5a_riva_finale.json', 'loop5a_riva_rules',
          {('book', 24, 2): (24, 4), ('chestClosed', 4, 14): (2, 11), ('lantern', 14, 6): (14, 7)})
    build(ROOT + '/esercizi/02_giardini_editor/loop5b_stanze_finale.json', 'loop5b_stanze_rules',
          {('chestClosed', 27, 2): (27, 5), ('book', 3, 14): (6, 13),
           ('mage', 19, 8): (19, 7), ('lantern', 20, 8): (20, 7)})
    build(ROOT + '/esercizi/02_giardini_editor/loop5c_belvedere_finale.json', 'loop5c_belvedere_rules',
          {('chestClosed', 27, 12): (25, 10)})
