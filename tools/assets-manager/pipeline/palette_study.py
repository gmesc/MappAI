#!/usr/bin/env python3
"""Studio palette + stile di TUTTI gli asset Legend of Lua.
Estrae istogramma colori globale (sprite vs tileset), identifica outline/ramp,
esporta swatch ordinato per hue/valore + .gpl + stats per il report.
"""
from PIL import Image
from collections import Counter
import glob, os, colorsys

BASE = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua"
OUT = "/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/atlas"
os.makedirs(OUT, exist_ok=True)

def hist(paths):
    c = Counter()
    for p in paths:
        try:
            im = Image.open(p).convert("RGBA")
        except Exception:
            continue
        for (r, g, b, a) in im.getdata():
            if a > 16:
                c[(r, g, b)] += 1
    return c

sprites = glob.glob(f"{BASE}/sprites/**/*.png", recursive=True)
tilesets = glob.glob(f"{BASE}/tilesets/*.png")
spr_h = hist(sprites)
til_h = hist(tilesets)
all_h = spr_h + til_h

print(f"file sprite: {len(sprites)} | tileset: {len(tilesets)}")
print(f"colori unici — sprite: {len(spr_h)} | tileset: {len(til_h)} | totale: {len(all_h)}")

def lum(c): return 0.299*c[0]+0.587*c[1]+0.114*c[2]
# outline = colori molto scuri ad alta frequenza
dark = sorted([(n, c) for c, n in spr_h.items() if lum(c) < 50], reverse=True)[:5]
print("\noutline candidates (scuri freq, sprite):")
for n, c in dark: print(f"  #{c[0]:02x}{c[1]:02x}{c[2]:02x}  x{n}")

print("\ntop 16 colori sprite (per frequenza):")
for c, n in spr_h.most_common(16):
    print(f"  #{c[0]:02x}{c[1]:02x}{c[2]:02x}  x{n}")

def swatch(counter, name, top=120):
    cols = [c for c, _ in counter.most_common(top)]
    def key(c):
        r, g, b = [x/255 for x in c]
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        bucket = round(h*12)
        if s < 0.12: bucket = -1   # grigi a parte
        return (bucket, l)
    cols.sort(key=key)
    cell, perrow = 40, 12
    rows = (len(cols)+perrow-1)//perrow
    img = Image.new("RGB", (perrow*cell, rows*cell), (24, 22, 28))
    px = img.load()
    for i, c in enumerate(cols):
        x0, y0 = (i % perrow)*cell, (i//perrow)*cell
        for yy in range(y0, y0+cell-1):
            for xx in range(x0, x0+cell-1):
                px[xx, yy] = c
    img.save(f"{OUT}/{name}.png")
    img.resize((img.width*2, img.height*2), Image.NEAREST).save(f"{OUT}/{name}@2x.png")
    return cols

spr_cols = swatch(spr_h, "lol_palette_sprites", 96)
til_cols = swatch(all_h, "lol_palette_all", 120)

# .gpl dei colori sprite più usati
with open(f"{OUT}/lol_palette.gpl", "w") as f:
    f.write("GIMP Palette\nName: Legend of Lua (sprites)\nColumns: 12\n#\n")
    for c in spr_cols:
        f.write(f"{c[0]:3d} {c[1]:3d} {c[2]:3d}\t#{c[0]:02x}{c[1]:02x}{c[2]:02x}\n")
print(f"\nswatch: lol_palette_sprites ({len(spr_cols)}), lol_palette_all ({len(til_cols)})  + lol_palette.gpl")
