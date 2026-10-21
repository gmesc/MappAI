#!/usr/bin/env python3
"""
emoji-in-svg.py — estrae ogni emoji di `public/fonts/MappAIEmoji.ttf` in un file SVG,
`public/fonts/emoji/<codepoint-esadecimale>.svg` (packet 0099, 16/10/2026; dal packet 0108
non solo le 27 dell'identità ma tutto il font, decorative comprese)

    python3 tools/font/emoji-in-svg.py

PERCHÉ ESISTE
Il Safari di iOS 27 (e quindi anche Chrome per iOS, che è WebKit) NON disegna le emoji
del font locale nel testo: né la tabella `SVG `, né `COLR` v1 (la disegna sgranata). Sul
canvas invece lo stesso font disegna giusto. Il 16/10 l'iPhone di Giacomo mostrava le
caselle di accesso vuote. Per i motori WebKit `public/js/mappai-emoji-prova.js` mette
al posto del testo l'immagine: queste. Stesso disegno del font (Noto, OFL), stesso stile.

COME
La tabella `SVG ` del font ha documenti con più glifi dentro, in coordinate del font
(1024 unità per em, baseline a y=0, y verso il basso). Per ogni emoji si tiene il suo
gruppo `<g id="glyphN">` e solo i `<defs>` che quel gruppo usa; la viewBox è il quadrato
di avanzamento del glifo, da `-ascent` a `+descent`. L'elenco viene dalla `cmap` del
font: una emoji in più nel font entra al rilancio (invariante 6;
`tests/emoji-immagini.test.js` lo confronta con la cmap e con `CODEPOINTS`).
Un codepoint del font senza disegno SVG (un selettore di variante, un ZWJ) non
ha immagine: si salta, e lo script lo dice.
"""
import os, re, sys
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = os.path.join(RADICE, 'public', 'fonts', 'MappAIEmoji.ttf')
USCITA = os.path.join(RADICE, 'public', 'fonts', 'emoji')
NS = 'http://www.w3.org/2000/svg'
XL = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', NS)
ET.register_namespace('xlink', XL)


def q(tag):
    return '{%s}%s' % (NS, tag)


def usati(el):
    """Gli id che un elemento richiama (href e url(#…))."""
    ids = set()
    for e in el.iter():
        for k, v in e.attrib.items():
            if k.endswith('href') and v.startswith('#'):
                ids.add(v[1:])
            for m in re.finditer(r'url\(#([^)]+)\)', v):
                ids.add(m.group(1))
    return ids


def estrai(font, nome_glifo, gid, doc):
    radice = ET.fromstring(doc)
    gruppo = None
    for e in radice:
        if e.tag == q('g') and e.get('id') == 'glyph%d' % gid:
            gruppo = e
    if gruppo is None:
        raise SystemExit('glifo %d senza gruppo nel documento SVG' % gid)
    defs_tutti = {}
    for d in radice.iter(q('defs')):
        for e in d:
            if e.get('id'):
                defs_tutti[e.get('id')] = e
    richiesti, coda = set(), list(usati(gruppo))
    while coda:
        i = coda.pop()
        if i in richiesti or i not in defs_tutti:
            continue
        richiesti.add(i)
        coda.extend(usati(defs_tutti[i]))
    avanzo = font['hmtx'].metrics[nome_glifo][0]
    asc, disc = font['hhea'].ascent, -font['hhea'].descent
    out = ET.Element(q('svg'), {'version': '1.1', 'viewBox': '0 %d %d %d' % (-asc, avanzo, asc + disc)})
    if richiesti:
        d = ET.SubElement(out, q('defs'))
        for i, e in defs_tutti.items():          # l'ordine del documento originale
            if i in richiesti:
                d.append(e)
    out.append(gruppo)
    return ET.tostring(out, encoding='unicode')


def main():
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    ordine = font.getGlyphOrder()
    doc_per_glifo = {}
    for d in font['SVG '].docList:
        for gid in range(d.startGlyphID, d.endGlyphID + 1):
            doc_per_glifo[gid] = d.data
    os.makedirs(USCITA, exist_ok=True)
    for vecchio in os.listdir(USCITA):
        if vecchio.endswith('.svg'):
            os.remove(os.path.join(USCITA, vecchio))
    totale = 0
    for cp in sorted(cmap):
        nome = cmap[cp]
        gid = ordine.index(nome)
        if gid not in doc_per_glifo:
            print('  U+%04X senza disegno SVG: niente immagine' % cp)
            continue
        svg = estrai(font, nome, gid, doc_per_glifo[gid])
        with open(os.path.join(USCITA, '%x.svg' % cp), 'w', encoding='utf-8') as f:
            f.write(svg)
        totale += len(svg.encode('utf-8'))
    print('%d immagini in %s (%.0f KB)' % (len(cmap), os.path.relpath(USCITA, RADICE), totale / 1024))


if __name__ == '__main__':
    sys.exit(main())
