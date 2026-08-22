#!/usr/bin/env python3
"""Foglio di provini della campagna: tutte le immagini di img/ in una griglia, col nome sotto.
   python3 tools/guida-docenti/provini.py  [cartella img]  →  <cartella>/_provini.jpg (e _provini-2.jpg… se serve)"""
import os, sys, math
from PIL import Image, ImageDraw, ImageFont

IMG = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Claude/MappAI - guida docenti/img')
COL, W, H, PAD, PER_FOGLIO = 4, 520, 340, 16, 24
files = sorted(f for f in os.listdir(IMG) if f.lower().endswith(('.png', '.jpg')) and not f.startswith('_provini'))
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
except Exception: font = ImageFont.load_default()
for n, i0 in enumerate(range(0, len(files), PER_FOGLIO), 1):
    gruppo = files[i0:i0 + PER_FOGLIO]
    righe = math.ceil(len(gruppo) / COL)
    foglio = Image.new('RGB', (COL * (W + PAD) + PAD, righe * (H + 40 + PAD) + PAD), 'white')
    d = ImageDraw.Draw(foglio)
    for k, f in enumerate(gruppo):
        im = Image.open(os.path.join(IMG, f)).convert('RGB')
        im.thumbnail((W, H))
        x = PAD + (k % COL) * (W + PAD); y = PAD + (k // COL) * (H + 40 + PAD)
        foglio.paste(im, (x, y))
        d.rectangle([x, y, x + im.width, y + im.height], outline='#999')
        d.text((x, y + H + 8), f[:60], fill='#222', font=font)
    out = os.path.join(IMG, '_provini.jpg' if n == 1 else f'_provini-{n}.jpg')
    foglio.save(out, quality=82)
    print(out, len(gruppo), 'immagini')
