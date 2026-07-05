#!/usr/bin/env python3
"""Atlante tileset — render con griglia + righello coordinate [col,row] per identificare i tile.
Genera PNG ispezionabili dei tileset LoL usati dal Memory Dungeon.
"""
from PIL import Image, ImageDraw
import sys, os

BASE = "/Users/giacomomeschini/Claude/MappAI BERT/public/assets/legendoflua/tilesets"
OUT = "/Users/giacomomeschini/Claude/MappAI BERT/tools/assets-manager/atlas"
os.makedirs(OUT, exist_ok=True)

def labeled(name, scale=22, ts=16):
    src = f"{BASE}/{name}.png"
    im = Image.open(src).convert("RGBA")
    cols, rows = im.size[0]//ts, im.size[1]//ts
    M = 22  # margine righello
    big = im.resize((cols*scale, rows*scale), Image.NEAREST)
    cv = Image.new("RGBA", (cols*scale+M, rows*scale+M), (30, 26, 34, 255))
    cv.paste(big, (M, M))
    d = ImageDraw.Draw(cv)
    grid = (255, 255, 255, 40)
    for c in range(cols+1):
        d.line([(M+c*scale, M), (M+c*scale, M+rows*scale)], fill=grid)
    for r in range(rows+1):
        d.line([(M, M+r*scale), (M+cols*scale, M+r*scale)], fill=grid)
    for c in range(cols):
        d.text((M+c*scale+3, 6), str(c), fill=(150, 220, 255, 255))
    for r in range(rows):
        d.text((3, M+r*scale+4), str(r), fill=(150, 220, 255, 255))
    dst = f"{OUT}/{name}_grid.png"
    cv.save(dst)
    print(f"{name}: {cols}x{rows} tiles -> {dst}")
    return cols, rows

if __name__ == "__main__":
    for n in (sys.argv[1:] or ["overworld", "cave", "inner"]):
        labeled(n)
