#!/usr/bin/env python3
"""Genera tools/assets-manager/map-editor/sprites.js — manifest sprite raggruppati (base64).
Aggiorna il CATALOGO qui sotto e rilancia per includere nuovi asset nell'editor.
"""
import base64, os, json
from PIL import Image

ROOT = "/Users/giacomomeschini/Claude/MappAI BERT"
SPR = f"{ROOT}/public/assets/legendoflua/sprites"
ASSETS = f"{ROOT}/public/assets"
OUT = f"{ROOT}/tools/assets-manager/map-editor/sprites.js"

# (gruppo, [(path_rel, fw, fh)])  — path con @ = relativo a public/assets; fw/fh = dim frame0
CAT = [
 ("Vegetazione", [
   ("environment/tree-oak.png",64,64),("environment/tree-oak-autumn.png",64,64),
   ("environment/tree-tall.png",64,64),("environment/tree-tall-autumn.png",64,64),
   ("environment/tree-pine.png",64,64),("environment/bush.png",64,64),
   ("environment/tree.png",63,62),("environment/tree2.png",63,62),("environment/tree-old.png",63,62)]),
 ("Strutture", [
   ("environment/chestClosed.png",15,19),("environment/chestOpen.png",15,19),
   ("environment/chestBigClosed.png",22,18),("environment/chestBigOpen.png",22,18),
   ("environment/lockedDoor.png",16,24),("environment/breakableRock.png",32,26),
   ("environment/breakableWall.png",16,32),("items/container.png",12,11)]),
 ("Personaggi", [
   ("player/playerSheet1.png",19,21),("npc/merchant.png",16,23),
   ("npc/sapiente-rosso.png",16,23),("npc/sapiente-viola.png",16,23),
   ("enemies/bat.png",16,16),("enemies/skeleton/knife.png",20,24),
   ("enemies/skeleton/mage.png",20,24),("enemies/eye/eye1.png",40,20)]),
 ("Animali", [
   ("environment/animal-cat.png",14,11),("environment/animal-chicken.png",13,12),
   ("environment/animal-duck.png",13,10),("environment/animal-frog.png",13,10),
   ("environment/animal-butterfly.png",13,11)]),
 ("Item", [
   ("items/coin.png",8,8),("items/key.png",8,13),("items/heart.png",11,10),
   ("items/bomb.png",12,12),("items/sword.png",15,6),("items/boomerang.png",16,16),
   ("items/lantern.png",16,16),("items/arrow.png",13,5)]),
 ("Memory/Custom", [
   ("@gatekeeper.png",16,16),("enemies/boss_guardian.png",32,32),
   ("items/book.png",16,16),("items/scroll.png",16,16)]),
]

def load(rel):
    p = ASSETS+"/"+rel[1:] if rel.startswith("@") else SPR+"/"+rel
    if not os.path.exists(p): return None
    w,h = Image.open(p).size
    b = base64.b64encode(open(p,'rb').read()).decode()
    return w,h,"data:image/png;base64,"+b

out = ["// sprite groups embedded — generato da pipeline/gen_sprites.py. NON modificare a mano.",
       "window.SPRITE_GROUPS = ["]
missing = []
for g, items in CAT:
    arr = []
    for rel, fw, fh in items:
        r = load(rel)
        if not r: missing.append(rel); continue
        w,h,src = r
        arr.append({"name": os.path.basename(rel).replace(".png","").lstrip("@"),
                    "w":w,"h":h,"fw":fw,"fh":fh,"src":src})
    out.append(f'  {{ name:{json.dumps(g)}, items:{json.dumps(arr)} }},')
out.append("];")
open(OUT,"w").write("\n".join(out))
print("sprites.js:", os.path.getsize(OUT), "bytes |", sum(len(i) for _,i in CAT), "asset | missing:", missing or "none")
