#!/usr/bin/env python3
"""Le 5 STANZE SPECIALI curate del Memory Dungeon nel formato-contratto §19.2
(MEMORY_DUNGEON_DESIGN.md): giardino, radura, stanza-custode, sala-boss,
camera-defrag. Primo produttore mapgen del JSON voxel (niente PNG, niente PIL):
celle sparse (default esterno = floor quota 0) + entità tipizzate + palette-bioma.

Output: tools/voxel-proto/maps/<nome>_voxel.json — verificabili subito nel proto:
  http://localhost:8137/tools/voxel-proto/?map=giardino_voxel
"""
import json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo corrente
OUT = os.path.join(ROOT, 'tools', 'voxel-proto', 'maps')
SEED = 20260706


# ── helpers griglia ──────────────────────────────────────────────────────────
def grid(size):
    return [[{'biome': 'floor', 'quota': 0, 'alt': 0, 'blocca': False}
             for _ in range(size)] for _ in range(size)]

def cell(g, x, z, biome=None, quota=None, alt=None, blocca=None):
    if not (0 <= z < len(g) and 0 <= x < len(g)):
        return
    c = g[z][x]
    if biome is not None: c['biome'] = biome
    if quota is not None: c['quota'] = quota
    if alt is not None: c['alt'] = alt
    if blocca is not None: c['blocca'] = blocca
    elif biome in ('wall', 'water', 'void'): c['blocca'] = True

def border_walls(g, alt=2):
    n = len(g)
    for i in range(n):
        for x, z in ((i, 0), (i, n - 1), (0, i), (n - 1, i)):
            cell(g, x, z, biome='wall', alt=alt)

def water_disk(g, cx, cz, r, rng):
    for z in range(len(g)):
        for x in range(len(g)):
            if ((x - cx) ** 2 + (z - cz) ** 2) ** 0.5 < r:
                cell(g, x, z, biome='water', quota=-(0.35 + rng.random() * 0.35))

def emit(name, size, g, entities, palette, meta, lit=False):
    cells = []
    for z in range(size):
        for x in range(size):
            c = g[z][x]
            if c['biome'] != 'floor' or c['quota'] != 0:   # sparse: il resto è floor di default
                cells.append({'x': x, 'z': z, **c})
    data = {'seed': SEED, 'size': size, 'sub': 3, 'meta': meta, 'lit': lit,
            'palette': palette, 'cells': cells, 'entities': entities}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.json')
    with open(path, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('scritta', path, f'({len(cells)} celle non-default, {len(entities)} entità)')


# Colori Sapiente (ciclati): oltre i 4 storici, verde/oro/turchese/magenta.
SAPIENTE_COLORS = ['sapiente-viola', 'sapiente-rosso', 'sapiente-blu', 'sapiente-ocra',
                   'sapiente-verde', 'sapiente-oro', 'sapiente-turchese', 'sapiente-magenta']

def _place_sapienti(g, n, rng, avoid, spacing=4):
    """N Sapienti su celle floor libere, spaziati e lontani da hero/gatekeeper (avoid)."""
    S = len(g)
    cand = [(x, z) for z in range(1, S - 1) for x in range(1, S - 1)
            if g[z][x]['biome'] == 'floor' and not g[z][x]['blocca']]
    rng.shuffle(cand)
    placed = []
    for (x, z) in cand:
        if len(placed) >= n:
            break
        if any(abs(x - ax) + abs(z - az) < spacing for (ax, az) in avoid + placed):
            continue
        placed.append((x, z))
    return placed

# ── 1. GIARDINO (hub): aperto, lago, N Sapienti (default 6), custode = discesa ──
def giardino(n_sapienti=6):
    S, rng = 20, random.Random(SEED)
    g = grid(S)
    border_walls(g, alt=1)                       # siepe bassa
    water_disk(g, 14.5, 5.5, 2.7, rng)
    for x, z in ((3, 3), (16, 15), (4, 14)):     # rocce basse
        cell(g, x, z, biome='wall', alt=1)
    hero = (9, 17)
    gk = (9, 2)
    ents = [
        {'id': 'hero', 'sprite': 'rogue8x8/Girl-Melee', 'x': hero[0] + 0.5, 'z': hero[1] + 0.5},
        {'id': 'gk', 'type': 'gatekeeper', 'x': gk[0] + 0.5, 'z': gk[1] + 0.2},   # discesa nel dungeon
    ]
    # Sapienti = ambasciatori delle macro-aree, uno per area (qui esempio con n_sapienti)
    for i, (x, z) in enumerate(_place_sapienti(g, n_sapienti, rng, avoid=[hero, gk])):
        ents.append({'id': f'sap{i + 1}', 'type': 'npc', 'sprite': 'rogue8x8/NPC',
                     'name': SAPIENTE_COLORS[i % len(SAPIENTE_COLORS)], 'x': x + 0.5, 'z': z + 0.5})
    for i in range(10):                          # alberi lungo i bordi interni
        side = i % 4
        t = 2.0 + rng.random() * (S - 4)
        x, z = ((t, 1.6), (t, S - 2.6), (1.6, t), (S - 2.6, t))[side]
        ents.append({'id': f'tree{i}', 'type': 'decor', 'name': 'tree', 'x': round(x, 1), 'z': round(z, 1)})
    for i in range(8):
        ents.append({'id': f'fl{i}', 'type': 'decor', 'name': 'flower',
                     'x': round(2.5 + rng.random() * (S - 5), 1), 'z': round(2.5 + rng.random() * (S - 5), 1)})
    emit('giardino_voxel', S, g, ents,
         {'floorA': '#a8c37e', 'floorB': '#87a562', 'wallA': '#7d945c', 'wallB': '#5d7245',
          'waterA': '#5fa8d9', 'waterB': '#2d6da8', 'bg': '#dfe8d0'},
         f'Giardino dei Sapienti — hub, {n_sapienti} Sapienti (§19.5)', lit=True)


# ── 2. RADURA: intermezzo funzioni esecutive, zero pericoli ─────────────────
def radura():
    S, rng = 14, random.Random(SEED + 1)
    g = grid(S)
    border_walls(g, alt=1)
    cell(g, 10, 10, biome='wall', alt=1)
    ents = [
        {'id': 'hero', 'sprite': 'rogue8x8/Girl-Melee', 'x': 6.5, 'z': 11.5},
        {'id': 'tot1', 'type': 'totem', 'x': 4.5, 'z': 5.0},
        {'id': 'tot2', 'type': 'totem', 'x': 9.0, 'z': 4.2},
        {'id': 'tot3', 'type': 'totem', 'x': 6.8, 'z': 7.8},
        {'id': 'stairs', 'type': 'stairs', 'x': 12.0, 'z': 2.0},
    ]
    for i in range(8):
        side = i % 4
        t = 1.8 + rng.random() * (S - 3.6)
        x, z = ((t, 1.5), (t, S - 2.5), (1.5, t), (S - 2.5, t))[side]
        ents.append({'id': f'tree{i}', 'type': 'decor', 'name': 'tree', 'x': round(x, 1), 'z': round(z, 1)})
    emit('radura_voxel', S, g, ents,
         {'floorA': '#b5c98a', 'floorB': '#98af6e', 'wallA': '#8a9d68', 'wallB': '#68794c',
          'waterA': '#5fa8d9', 'waterB': '#2d6da8', 'bg': '#e6ead2'},
         'Radura — scaffolding funzioni esecutive (§19.5)', lit=True)


# ── 3. STANZA DEL CUSTODE: fossato + ponte, beholder al centro ──────────────
def custode():
    S, rng = 13, random.Random(SEED + 2)
    g = grid(S)
    border_walls(g, alt=2)
    for x in range(1, S - 1):                    # fossato a z=8, ponte su x=6
        if x != 6:
            cell(g, x, 8, biome='water', quota=-(0.4 + rng.random() * 0.3))
    ents = [
        {'id': 'hero', 'sprite': 'rogue8x8/Girl-Melee', 'x': 6.5, 'z': 10.5},
        {'id': 'gk', 'type': 'gatekeeper', 'x': 6.5, 'z': 5.0},
        {'id': 'stairs', 'type': 'stairs', 'x': 6.5, 'z': 1.6},
        {'id': 'lan1', 'type': 'decor', 'name': 'lantern', 'x': 2.0, 'z': 2.0},
        {'id': 'lan2', 'type': 'decor', 'name': 'lantern', 'x': 11.0, 'z': 2.0},
    ]
    emit('stanza_custode_voxel', S, g, ents,
         {'floorA': '#9a92a8', 'floorB': '#7c7590', 'wallA': '#6b6378', 'wallB': '#4d4660',
          'waterA': '#4a4670', 'waterB': '#2c294a', 'bg': '#17141f'},
         'Stanza del Custode — gate room (§19.5)')


# ── 4. SALA BOSS: colonne, piattaforma rialzata col Guardiano ────────────────
def boss():
    S, rng = 18, random.Random(SEED + 3)
    g = grid(S)
    border_walls(g, alt=3)
    for x, z in ((5, 6), (12, 6), (5, 11), (12, 11)):     # colonne
        cell(g, x, z, biome='wall', alt=3)
    for x in range(6, 12):                        # piattaforma del Guardiano (quota 1)
        for z in range(1, 5):
            if g[z][x]['biome'] == 'floor':
                cell(g, x, z, quota=1)
    for x in range(7, 11):                        # gradino d'accesso (quota 0.5)
        cell(g, x, 5, quota=0.5)
    ents = [
        {'id': 'hero', 'sprite': 'rogue8x8/Girl-Melee', 'x': 8.5, 'z': 15.5},
        {'id': 'boss', 'type': 'boss', 'x': 8.5, 'z': 2.5},
        {'id': 'br1', 'type': 'decor', 'name': 'brazier', 'x': 5.0, 'z': 5.6},
        {'id': 'br2', 'type': 'decor', 'name': 'brazier', 'x': 12.0, 'z': 5.6},
    ]
    emit('sala_boss_voxel', S, g, ents,
         {'floorA': '#8a6a62', 'floorB': '#6d5049', 'wallA': '#5e4640', 'wallB': '#40302c',
          'waterA': '#8a3a2a', 'waterB': '#571f14', 'bg': '#1a1214'},
         'Sala del Guardiano — boss room (§19.5)')


# ── 5. CAMERA DEL DEFRAG: sala circolare, 5 piedistalli-macro, pila di unit ──
def defrag():
    S, rng = 16, random.Random(SEED + 4)
    g = grid(S)
    cx = cz = (S - 1) / 2
    for z in range(S):                            # sala circolare: fuori = void
        for x in range(S):
            d = ((x - cx) ** 2 + (z - cz) ** 2) ** 0.5
            if d > 7.2:
                cell(g, x, z, biome='void')
            elif d > 6.4:
                cell(g, x, z, biome='wall', alt=2)
    import math
    ents = [
        {'id': 'hero', 'sprite': 'rogue8x8/Girl-Melee', 'x': cx + 0.5, 'z': cz + 2.2},
        {'id': 'pile', 'type': 'decor', 'name': 'pile', 'x': cx + 0.5, 'z': cz + 0.5},
        {'id': 'stairs', 'type': 'stairs', 'x': cx + 0.5, 'z': cz + 4.6},
    ]
    for i in range(5):                            # pentagono di piedistalli (macro-aree)
        a = -math.pi / 2 + i * 2 * math.pi / 5
        ents.append({'id': f'ped{i}', 'type': 'pedestal', 'group': i,
                     'x': round(cx + math.cos(a) * 4.6, 1), 'z': round(cz + math.sin(a) * 4.6, 1)})
    emit('camera_defrag_voxel', S, g, ents,
         {'floorA': '#9fb0c0', 'floorB': '#7f92a5', 'wallA': '#6f8093', 'wallB': '#4e5d6e',
          'waterA': '#5fa8d9', 'waterB': '#2d6da8', 'bg': '#101820'},
         'Camera del Defrag — reveal attivo (§19.4/§19.5)')


if __name__ == '__main__':
    giardino(); radura(); custode(); boss(); defrag()
