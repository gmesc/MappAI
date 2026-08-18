#!/usr/bin/env python3
"""
prepara-font.py — vendorizza i font di MappAI e MISURA le costanti che il
foglio stampabile usa per impaginare.  (18/8/26)

    python3 tools/font/prepara-font.py

Che cosa fa, e perché ognuna delle tre cose:

1. SCARICA i font dai loro repo ufficiali e li scrive in `public/fonts/`.
   L'app si apre con `loadFile` → protocollo `file://`: un webfont da CDN non
   arriva quando in aula non c'è rete, e fino a oggi capitava anche a Space
   Mono (era un `<link>` a fonts.googleapis.com in index.html).

2. CONVERTE gli OTF in TTF.  TestMe ha le curve in `CFF `; il jsPDF
   vendorizzato sa leggere solo `glyf`/`loca`, e senza conversione il foglio
   dei nodi uscirebbe in Helvetica.  La conversione NON tocca le metriche
   (lo script lo verifica: zero advance cambiati), quindi l'impaginazione
   calcolata resta valida.

3. MISURA gli advance sul TESTO VERO dei vault e stampa le due costanti per
   font che vanno in `mappai-font-core.js`:
     · `advance`     — larghezza media riservata a un carattere, in em
     · `headAdvance` — la stessa cosa per le testate, che sono MAIUSCOLE
   Non sono numeri di gusto: `charsPerLine()` in mappai-print-layout.js decide
   l'a-capo contandoli, senza misurare niente nel browser.  Se sono troppo
   piccoli il testo sborda dalla carta; se sono troppo grandi il motore
   rimpicciolisce il corpo più del necessario — che su un font per BES/DSA è
   il risultato rovesciato.
   ⚠️ Sono DUE numeri, non uno.  In maiuscolo l'advance sicuro sale a ~0,615
   per entrambi i font nuovi: derivare la testata dal corpo (come faceva
   `headAdvance = advance + headLetterSpacing`) la farebbe sbordare appena il
   corpo scende sotto 0,555.

Serve fontTools:  pip3 install fonttools
"""
import base64, os, re, sys, glob, subprocess

try:
    from fontTools.ttLib import TTFont, newTable
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools import subset
except ImportError:
    sys.exit('manca fontTools:  pip3 install fonttools')

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS  = os.path.join(RADICE, 'public', 'fonts')
VENDOR = os.path.join(RADICE, 'public', 'js', 'vendor')
SORG   = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sorgenti')

TESTME = 'https://raw.githubusercontent.com/molotro/TestMe02/master/'
ATKIN  = 'https://raw.githubusercontent.com/googlefonts/atkinson-hyperlegible/main/fonts/ttf/'

# id del catalogo → { file destinazione: (url, converti_in_ttf) }
CATALOGO = {
    'testme-sans': {
        'TestMeSans-Regular.ttf': (TESTME + 'TestMeSans02-Regular.otf', True),
        'TestMeSans-Bold.ttf':    (TESTME + 'TestMeSans02-Bold.otf',    True),
    },
    'testme-alt': {
        'TestMeAlt-Regular.ttf': (TESTME + 'TestMeAlt02-Regular.otf', True),
        'TestMeAlt-Bold.ttf':    (TESTME + 'TestMeAlt02-Bold.otf',    True),
    },
    'atkinson': {
        'Atkinson-Regular.ttf':    (ATKIN + 'AtkinsonHyperlegible-Regular.ttf',    False),
        'Atkinson-Bold.ttf':       (ATKIN + 'AtkinsonHyperlegible-Bold.ttf',       False),
        'Atkinson-Italic.ttf':     (ATKIN + 'AtkinsonHyperlegible-Italic.ttf',     False),
        'Atkinson-BoldItalic.ttf': (ATKIN + 'AtkinsonHyperlegible-BoldItalic.ttf', False),
    },
}
LICENZE = {
    'OFL-TestMe.txt':   TESTME + 'OFL-TestMe.txt',
    'OFL-Atkinson.txt': 'https://raw.githubusercontent.com/googlefonts/atkinson-hyperlegible/main/OFL.txt',
}

def scarica(url, dest):
    # curl e non urllib: su questo Mac i certificati di Python non sono
    # installati e ogni https finisce in CERTIFICATE_VERIFY_FAILED.
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    r = subprocess.run(['curl', '-sSL', '--fail', '-o', dest, url],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.getsize(dest):
        sys.exit(f'x download fallito: {url}\n  {r.stderr.strip()}')
    return dest

def otf2ttf(src, dst):
    """CFF → glyf con cu2qu. Le metriche NON cambiano (verificato sotto)."""
    f = TTFont(src); gs = f.getGlyphSet(); ordine = f.getGlyphOrder()
    glyf = newTable('glyf'); glyf.glyphOrder = ordine; glyf.glyphs = {}
    for n in ordine:
        pen = TTGlyphPen(gs)
        gs[n].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyf[n] = pen.glyph()
    f['glyf'] = glyf
    f['loca'] = newTable('loca')
    mx = newTable('maxp'); mx.tableVersion = 0x00010000
    for k, v in dict(maxZones=1, maxTwilightPoints=0, maxStorage=0, maxFunctionDefs=0,
                     maxInstructionDefs=0, maxStackElements=0, maxSizeOfInstructions=0,
                     maxComponentElements=0, maxComponentDepth=0, numGlyphs=len(ordine),
                     maxPoints=0, maxContours=0, maxCompositePoints=0,
                     maxCompositeContours=0).items():
        setattr(mx, k, v)
    f['maxp'] = mx
    if 'CFF ' in f: del f['CFF ']
    # ⚠️ L'INTESTAZIONE DEVE DIRE CHE ORA È UN TRUETYPE.
    # Un .otf si annuncia come 'OTTO', cioè «le curve sono in CFF». Tolta la
    # tabella CFF e costruita glyf, il font è a tutti gli effetti un TrueType —
    # ma senza questa riga continua a DICHIARARSI OTTO, e chi legge crede alla
    # dichiarazione, non ai fatti.
    # Costo pagato il 18/8: l'export dei grafi usciva col carattere di ripiego e
    # i lettori PDF dicevano «Embedded font file may be invalid». Il motivo è
    # che un /FontFile2 È un TrueType per definizione, quindi un font che al suo
    # interno dice OTTO viene rifiutato. Chromium lo tollerava (i quiz uscivano
    # bene), jsPDF no — ed è per questo che il difetto si vedeva solo sui grafi.
    f.sfntVersion = '\x00\x01\x00\x00'
    f['head'].indexToLocFormat = 0
    f['post'].formatType = 2.0
    f['post'].extraNames = []; f['post'].mapping = {}; f['post'].glyphOrder = ordine
    f.save(dst)
    # la conversione deve lasciare le metriche INTATTE: da lì dipende l'impaginazione
    a, b = TTFont(src), TTFont(dst)
    ua, ub = a['head'].unitsPerEm, b['head'].unitsPerEm
    cambiati = sum(1 for n in ordine
                   if n in a['hmtx'].metrics and n in b['hmtx'].metrics
                   and abs(a['hmtx'][n][0] / ua - b['hmtx'][n][0] / ub) > 1e-9)
    if cambiati:
        sys.exit(f'✗ {os.path.basename(dst)}: la conversione ha cambiato {cambiati} advance — '
                 'le costanti di impaginazione non varrebbero più')
    return dst

# ── il corpus: il testo VERO dei vault, se c'è ───────────────────────────────
def corpus():
    titoli, descs = [], []
    base = os.path.expanduser('~/Documents/MappAI - file/Mappe/**/Nodi/*.md')
    for p in glob.glob(base, recursive=True):
        try: txt = open(p, encoding='utf-8').read()
        except Exception: continue
        m = re.search(r'^#\s+(.+)$', txt, re.M)
        if m: titoli.append(m.group(1).strip())
        body = txt.split('---', 2)[2] if txt.startswith('---') else txt
        body = re.sub(r'^#.*$', '', body, flags=re.M).strip()
        if len(body) > 40: descs.append(body[:600])
    return titoli, descs

def advances(path):
    f = TTFont(path, fontNumber=0); upem = f['head'].unitsPerEm; hm = f['hmtx']
    out = {}
    for cp, g in f.getBestCmap().items():
        try: out[chr(cp)] = hm[g][0] / upem
        except Exception: pass
    return out

def acapo(testo, cpl):
    """Identico a lineCount() di mappai-print-layout.js."""
    s = re.sub(r'\s+', ' ', str(testo)).strip()
    if not s: return []
    out, cur = [], ''
    for w in s.split(' '):
        while len(w) > cpl:
            if cur: out.append(cur); cur = ''
            out.append(w[:cpl]); w = w[cpl:]
        if not cur: cur = w
        elif len(cur) + 1 + len(w) <= cpl: cur += ' ' + w
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    return out

RIF = 0.612  # l'advance di Space Mono, con cui il foglio è tarato oggi

def tara(adv, campioni, spaziatura=0.0):
    """Il più stretto che non fa MAI sbordare, sul corpus vero (passo 0.005).

    `spaziatura` = letter-spacing applicato in resa, in em per carattere. Le
    TESTATE sono spaziate (setCharSpace in mappai-print-dossier.js): se non lo
    si conta nella LARGHEZZA, il numero esce ottimista e la testata sborda —
    che e esattamente il difetto che questa misura deve prevenire.
    """
    peggiore = 0.30
    for campione, cpl_rif in campioni:
        a, ok = 1.20, None
        while a > 0.30:
            larghezza = cpl_rif * RIF
            cpl = max(1, int(larghezza / a))
            sborda = any(sum(adv.get(c, .5) for c in riga) + len(riga) * spaziatura > larghezza
                         for t in campione for riga in acapo(t, cpl))
            if not sborda: ok = a
            elif ok is not None: break
            a = round(a - 0.005, 3)
        if ok is None: sys.exit('x nessun advance sicuro: font troppo largo')
        peggiore = max(peggiore, ok)
    return peggiore

# I glifi che un documento scolastico europeo puo contenere. Generoso apposta:
# un glifo mancante in un foglio STAMPATO non si recupera, e il risparmio non
# vale il rischio. Copre latino esteso, diacritici, greco (le lettere della
# fisica), punteggiatura, valute, frazioni, frecce, matematica di base e le
# forme geometriche dei diagrammi.
SOTTOINSIEME = ("U+0000-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF,U+0300-036F,"
                "U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-214F,U+2150-218F,"
                "U+2190-21FF,U+2200-22FF,U+2500-257F,U+25A0-25FF,U+2600-26FF")


def _preparaIncorporabili():
    """I caratteri che finiscono DENTRO i documenti, in base64.

    ── PERCHE SERVE ─────────────────────────────────────────────────────────
    Un documento che chiede i byte del carattere a un percorso non li ottiene
    quasi mai, ed e stato misurato: la finestra che produce il PDF carica
    l HTML come `data:` (origine opaca), e da li un caricamento `file://` e
    BLOCCATO. Risultato: il PDF usciva col carattere di ripiego mentre l app
    lo mostrava giusto. Lo stesso percorso e legato a QUESTA macchina e a
    QUESTA cartella: nell app pacchettizzata, o sul telefono di un allievo che
    apre il foglio via QR, non esiste. Un documento si porta dentro il suo
    carattere, o non ce l ha.

    ── PERCHE SOTTOINSIEME + WOFF, E NON IL TTF INTERO ──────────────────────
    Il .ttf intero costa 433 KB di base64 a documento (TestMe): troppo, per
    una cosa che si ripete in ogni foglio del vault. Il sottoinsieme toglie i
    glifi che una scheda non usera mai, e WOFF li comprime con zlib — che
    Python ha gia. (WOFF2 comprime meglio ma vuole `brotli`, una dipendenza in
    piu per una trentina di KB.) Misurato: 433 KB → 76-101 KB.
    """
    misure = []
    for fam, files in list(CATALOGO.items()) + [('space-mono', {
            'SpaceMono-Regular.ttf': (None, False), 'SpaceMono-Bold.ttf': (None, False)})]:
        pezzi = {}
        for dest in files:
            if not (dest.endswith('-Regular.ttf') or dest.endswith('-Bold.ttf')):
                continue                      # nei documenti servono i due tagli di testo
            src = os.path.join(FONTS, dest)
            opt = subset.Options()
            opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
            f = subset.load_font(src, opt)
            s = subset.Subsetter(options=opt)
            s.populate(unicodes=subset.parse_unicodes(SOTTOINSIEME))
            s.subset(f)
            tmp = os.path.join(SORG, '_sub_' + dest)
            os.makedirs(SORG, exist_ok=True)
            subset.save_font(f, tmp, opt)
            tf = TTFont(tmp); tf.flavor = 'woff'
            woff = tmp.replace('.ttf', '.woff'); tf.save(woff)
            chiave = 'grassetto' if dest.endswith('-Bold.ttf') else 'normale'
            pezzi[chiave] = base64.b64encode(open(woff, 'rb').read()).decode()
        if not pezzi:
            continue
        dst = os.path.join(VENDOR, fam + '-incorpora.js')
        with open(dst, 'w', encoding='utf-8') as fh:
            fh.write(
'/*\n'
' * ' + fam + '-incorpora.js — i byte del carattere da mettere DENTRO un documento.\n'
' * GENERATO da tools/font/prepara-font.py — non modificare a mano.\n'
' *\n'
' * Sottoinsieme dei glifi (latino esteso, greco, punteggiatura, matematica,\n'
' * frecce, forme) compresso in WOFF. Serve perche un documento che chiede il\n'
' * carattere a un percorso non lo ottiene: la finestra che stampa il PDF carica\n'
' * da `data:`, origine opaca, dove un `file://` e bloccato — misurato il 18/8,\n'
' * ed era il motivo per cui il PDF usciva nel carattere sbagliato.\n'
' *\n'
' * window.MappAIInc_' + fam.replace('-', '_') + '.facce(famiglia) → le @font-face con i byte incorporati.\n'
' */\n'
'(function () {\n'
'  "use strict";\n'
'  var N = "' + pezzi.get('normale', '') + '";\n'
'  var G = "' + pezzi.get('grassetto', '') + '";\n'
'  function faccia(fam, b64, peso) {\n'
'    if (!b64) return "";\n'
'    return "@font-face{font-family:\'" + fam + "\';src:url(data:font/woff;base64," + b64 +\n'
'      ") format(\'woff\');font-weight:" + peso + ";font-style:normal;font-display:swap;}";\n'
'  }\n'
'  window.MappAIInc_' + fam.replace('-', '_') + ' = {\n'
'    facce: function (fam) { return faccia(fam, N, 400) + "\\n" + faccia(fam, G, 700); }\n'
'  };\n'
'})();\n')
        misure.append((fam, os.path.getsize(dst)))
        print('   %-26s %5d KB' % (fam + '-incorpora.js', os.path.getsize(dst) / 1024))
    print('\n   (e quanto pesa un documento in piu: circa quel numero)')


def main():
    os.makedirs(FONTS, exist_ok=True)
    print('── 1. i font\n')

    # Space Mono: i byte ce li ha già il modulo base64 dell'export PDF —
    # decodificarli è meglio che riscaricarli: è per costruzione lo STESSO font
    # che finisce nei PDF, quindi schermo e stampa non possono divergere.
    sm = open(os.path.join(VENDOR, 'spacemono-font.js'), encoding='utf-8').read()
    for var, nome in (('REGULAR', 'SpaceMono-Regular.ttf'), ('BOLD', 'SpaceMono-Bold.ttf')):
        m = re.search(r'var\s+' + var + r'\s*=\s*"([A-Za-z0-9+/=]+)"', sm)
        if not m: sys.exit(f'✗ {var} non trovato in spacemono-font.js')
        open(os.path.join(FONTS, nome), 'wb').write(base64.b64decode(m.group(1)))
        print(f'   {nome:26s} ← spacemono-font.js (base64 già nel repo)')

    for fam, files in CATALOGO.items():
        for dest, (url, conv) in files.items():
            grezzo = scarica(url, os.path.join(SORG, os.path.basename(url)))
            out = os.path.join(FONTS, dest)
            if conv:
                otf2ttf(grezzo, out)
                print(f'   {dest:26s} ← {os.path.basename(url)} (CFF → glyf, metriche intatte)')
            else:
                open(out, 'wb').write(open(grezzo, 'rb').read())
                print(f'   {dest:26s} ← {os.path.basename(url)}')

    for nome, url in LICENZE.items():
        scarica(url, os.path.join(FONTS, nome))
        print(f'   {nome:26s} ← licenza')

    # ── i moduli base64 per jsPDF (uno per famiglia, caricati a richiesta) ────
    print('\n── 2. i moduli base64 per jsPDF (uno per famiglia)\n')
    for fam in CATALOGO:
        reg = [f for f in CATALOGO[fam] if f.endswith('-Regular.ttf')][0]
        bld = [f for f in CATALOGO[fam] if f.endswith('-Bold.ttf')][0]
        nomeFile = {'testme-sans': 'TestMe Sans', 'testme-alt': 'TestMe Alt',
                    'atkinson': 'Atkinson Hyperlegible'}[fam]
        b64r = base64.b64encode(open(os.path.join(FONTS, reg), 'rb').read()).decode()
        b64b = base64.b64encode(open(os.path.join(FONTS, bld), 'rb').read()).decode()
        dst = os.path.join(VENDOR, fam + '-font.js')
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(
'/*\n'
' * ' + fam + '-font.js — ' + nomeFile + ' per jsPDF (base64, SIL OFL).\n'
' * GENERATO da tools/font/prepara-font.py — non modificare a mano.\n'
' *\n'
' * Perche base64 e non un fetch del .ttf: l app si apre con loadFile, cioe\n'
' * su file://, dove fetch e XHR verso un altro file sono bloccati. Lo stesso\n'
' * motivo per cui spacemono-font.js e fatto cosi.\n'
' * Il modulo si carica A RICHIESTA (MappAIFontCore.caricaPerPdf) — non al boot:\n'
' * sono ~200 KB per famiglia e servono solo a chi esporta un PDF in quel font.\n'
' *\n'
' * window.MappAIFont_' + fam.replace('-', '_') + '.registerInto(pdf) → registra normale + bold.\n'
' */\n'
'(function () {\n'
'  "use strict";\n'
'  var NOME = ' + repr(nomeFile).replace("'", '"') + ';\n'
'  var REGULAR = "' + b64r + '";\n'
'  var BOLD = "' + b64b + '";\n'
'  function registerInto(pdf) {\n'
'    if (!pdf || typeof pdf.addFileToVFS !== "function") return false;\n'
'    try {\n'
'      pdf.addFileToVFS(NOME + "-Regular.ttf", REGULAR);\n'
'      pdf.addFont(NOME + "-Regular.ttf", NOME, "normal");\n'
'      pdf.addFileToVFS(NOME + "-Bold.ttf", BOLD);\n'
'      pdf.addFont(NOME + "-Bold.ttf", NOME, "bold");\n'
'      return true;\n'
'    } catch (e) { return false; }\n'
'  }\n'
'  window.MappAIFont_' + fam.replace('-', '_') + ' = { fontName: NOME, registerInto: registerInto };\n'
'})();\n')
        print(f'   {fam + "-font.js":26s} {os.path.getsize(dst) // 1024} KB')

    # ── 2-bis. i WOFF da INCORPORARE nei documenti ──────────────────────────
    print('\n── 2-bis. i caratteri da incorporare nei documenti (sottoinsieme + WOFF)\n')
    _preparaIncorporabili()

    # ── 3. le costanti di impaginazione, misurate ────────────────────────────
    print('\n── 3. le costanti per mappai-font-core.js\n')
    titoli, descs = corpus()
    if not titoli:
        print('   ⚠ nessun vault su questo disco: le costanti non si possono misurare.')
        return
    print(f'   corpus: {len(titoli)} titoli · {len(descs)} descrizioni\n')
    prova = [('Space Mono', 'SpaceMono-Regular.ttf'),
             ('TestMe Sans', 'TestMeSans-Regular.ttf'),
             ('TestMe Alt',  'TestMeAlt-Regular.ttf'),
             ('Atkinson',    'Atkinson-Regular.ttf')]
    for nome, file in prova:
        adv = advances(os.path.join(FONTS, file))
        corpo = tara(adv, [(titoli, 22), (descs, 46), (descs, 64)])
        # LS = mappai-print-layout.js headLetterSpacing
        testa = tara(adv, [([t.upper() for t in titoli], 22)], spaziatura=0.06)
        medio = (sum(adv.get(c, 0) for t in descs for c in t) /
                 max(1, sum(len(t) for t in descs)))
        mancanti = sorted({c for t in titoli + descs for c in t
                           if c not in adv and c not in '\n\r\t'})
        print(f'   {nome:12s} advance {corpo:.3f} · headAdvance {testa:.3f} '
              f'(medio reale {medio:.3f})'
              + (f'  ⚠ senza glifo: {"".join(mancanti)}' if mancanti else ''))

if __name__ == '__main__':
    main()
