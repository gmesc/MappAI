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
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    from fontTools import subset
except ImportError:
    sys.exit('manca fontTools:  pip3 install fonttools')

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS  = os.path.join(RADICE, 'public', 'fonts')
VENDOR = os.path.join(RADICE, 'public', 'js', 'vendor')
SORG   = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sorgenti')

TESTME = 'https://raw.githubusercontent.com/molotro/TestMe02/master/'
ATKIN  = 'https://raw.githubusercontent.com/googlefonts/atkinson-hyperlegible/main/fonts/ttf/'

# ── IL DONATORE DEI GLIFI SCIENTIFICI ────────────────────────────────────────
# DejaVu Sans: copre da solo greco, matematica, frecce, filetti, forme e spunte,
# ha i quattro tagli (anche corsivo) e una licenza che permette di prenderne i
# disegni (Bitstream Vera License + aggiunte in pubblico dominio). Un donatore
# solo invece di tre (Noto Sans + Symbols + Math) e' meno cose da tenere allineate.
DEJAVU_ZIP = ('https://github.com/dejavu-fonts/dejavu-fonts/releases/download/'
              'version_2_37/dejavu-fonts-ttf-2.37.zip')
DEJAVU_INT = 'dejavu-fonts-ttf-2.37/ttf/'      # dove stanno i .ttf dentro lo zip
# il taglio del donatore per ogni taglio del carattere: un Omega chiaro dentro un
# testo in grassetto si legge come un errore di stampa, non come un simbolo
DEJAVU_TAGLI = {'-Regular': 'DejaVuSans.ttf', '-Bold': 'DejaVuSans-Bold.ttf',
                '-Italic': 'DejaVuSans-Oblique.ttf',
                '-BoldItalic': 'DejaVuSans-BoldOblique.ttf'}

# ⚠️ TestMe dichiara «Reserved Font Name TestMe» (OFL 1.1 §3): una versione
# MODIFICATA non puo' portare quel nome. Cucire i glifi la rende modificata, e
# quindi la famiglia si rinomina — la derivazione resta scritta nel copyright e
# nella descrizione del selettore, che e' dove la OFL vuole che stia.
# Space Mono e Atkinson non dichiarano nomi riservati: tengono il loro nome.
RINOMINA = {'TestMeSans02': 'TM Sans', 'TestMe Sans': 'TM Sans',
            'TestMeAlt02': 'TM Alt',   'TestMe Alt': 'TM Alt'}

# id catalogo → (nome della famiglia, globale su window, taglio normale, grassetto)
# ⚠️ Il nome della famiglia e' la chiave ESATTA che jsPDF e svg2pdf si aspettano,
# e deve combaciare con `famiglia` in mappai-font-core.js.
MODULI = {
    'space-mono':  ('Space Mono',            'MappAISpaceMono',
                    'SpaceMono-Regular.ttf',  'SpaceMono-Bold.ttf'),
    'testme-sans': ('TM Sans',               'MappAIFont_testme_sans',
                    'TestMeSans-Regular.ttf', 'TestMeSans-Bold.ttf'),
    'testme-alt':  ('TM Alt',                'MappAIFont_testme_alt',
                    'TestMeAlt-Regular.ttf',  'TestMeAlt-Bold.ttf'),
    'atkinson':    ('Atkinson Hyperlegible', 'MappAIFont_atkinson',
                    'Atkinson-Regular.ttf',   'Atkinson-Bold.ttf'),
}

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
    f.recalcTimestamp = False      # o ogni build cambia i byte e sporca il repo
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

# ── la cucitura dei glifi scientifici ───────────────────────────────────────
def donatore():
    """I quattro tagli di DejaVu, scaricati una volta e tenuti in sorgenti/."""
    attesi = {t: os.path.join(SORG, f) for t, f in DEJAVU_TAGLI.items()}
    licenza = os.path.join(FONTS, 'LICENSE-DejaVu.txt')
    # la licenza si riscrive anche se i font sono gia' in cache: deve viaggiare
    # coi disegni, e senza di lei la distribuzione non e' in regola
    if not all(os.path.exists(v) for v in attesi.values()) or not os.path.exists(licenza):
        zip_ = os.path.join(SORG, 'dejavu.zip')
        scarica(DEJAVU_ZIP, zip_)
        import zipfile
        with zipfile.ZipFile(zip_) as z:
            for f in DEJAVU_TAGLI.values():
                open(os.path.join(SORG, f), 'wb').write(z.read(DEJAVU_INT + f))
            open(licenza, 'wb').write(z.read('dejavu-fonts-ttf-2.37/LICENSE'))
    return attesi


def cuci(dest, donatore_ttf, cps):
    """Aggiunge a `dest` i glifi di `cps` che non ha, presi dal donatore.

    ── PERCHE ESISTE ────────────────────────────────────────────────────────
    Nessuno dei quattro caratteri ha la spunta o i filetti del dossier, e solo
    uno ha l Omega. Su un foglio prodotto da jsPDF il glifo che manca non
    ripiega: jsPDF lo SCARTA e non lo dice a nessuno (misurato il 19/8 sui PDF
    veri) — «12 Ω» esce «12 ». E i simboli arrivano anche dal testo dell AI,
    dove non si puo' decidere in anticipo che cosa comparira': l unica difesa
    e' che il carattere il glifo ce l abbia.

    ── LE DUE REGOLE CHE FANNO LA DIFFERENZA ────────────────────────────────
    · i glifi GIA' PRESENTI non si toccano mai. Le costanti di impaginazione
      (advance/headAdvance in mappai-font-core.js) sono misurate su di loro:
      cambiarne uno ricomporrebbe fogli che oggi escono giusti. Lo script lo
      verifica sotto e si ferma se e' successo.
    · su un MONOSPAZIO il passo e' sacro. Space Mono ha un solo advance (612):
      un Omega proporzionale piu' largo sfonderebbe la griglia, e il conto dei
      caratteri per riga di print-layout darebbe una carta sbagliata. Il glifo
      donato si rimpicciolisce fino al passo e ci si centra dentro.
    """
    t = TTFont(dest); d = TTFont(donatore_ttf)
    tcm, dcm, dgs = t.getBestCmap(), d.getBestCmap(), d.getGlyphSet()
    prima = {cp: t['hmtx'][g][0] for cp, g in tcm.items() if g in t['hmtx'].metrics}
    scala = t['head'].unitsPerEm / d['head'].unitsPerEm
    passi = {a for a, _ in t['hmtx'].metrics.values()} - {0}
    mono  = len(passi) == 1
    passo = passi.pop() if mono else 0
    glyf, hmtx = t['glyf'], t['hmtx']
    da_cucire = sorted(cp for cp in cps if cp not in tcm and cp in dcm)
    for cp in da_cucire:
        nome = 'uni%04X' % cp
        if nome not in glyf:
            rec = DecomposingRecordingPen(dgs)   # niente componenti: il glifo
            dgs[dcm[cp]].draw(rec)               # deve reggersi da solo
            avanza = d['hmtx'][dcm[cp]][0] * scala
            s, sx, dx = scala, scala, 0.0
            if mono:
                if 0x2500 <= cp <= 0x259F and avanza > 0:
                    # ⚠️ i filetti e le barre devono TOCCARSI: sono disegnati per
                    # affiancarsi al passo del donatore (602/1000), e centrati in
                    # una cella da 612 lascerebbero 10 unita' di buco fra un «├»
                    # e il «─» che lo segue — l albero del dossier verrebbe
                    # tratteggiato. Si tirano in larghezza fino al passo: l 1,7%
                    # di distorsione non si vede, il buco si', e si vede stampato.
                    sx = scala * (passo / avanza); avanza = passo
                else:
                    if avanza > passo and avanza > 0:
                        s = sx = scala * (passo / avanza); avanza = passo
                    dx = (passo - avanza) / 2
            pen = TTGlyphPen(None)
            rec.replay(TransformPen(pen, (sx, 0, 0, s, dx, 0)))
            g = pen.glyph(); glyf[nome] = g; g.recalcBounds(glyf)
            hmtx[nome] = (int(round(passo if mono else avanza)),
                          g.xMin if g.numberOfContours else 0)
        for tb in t['cmap'].tables:
            if tb.isUnicode(): tb.cmap.setdefault(cp, nome)
    try: t['OS/2'].recalcUnicodeRanges(t)     # chi sceglie i font di sistema
    except Exception: pass                    # legge di qui che cosa copriamo
    _annota(t)
    # senza questo il font cambia byte a ogni rigenerazione (fontTools riscrive
    # la data in `head`) e ogni build sporca il repo con 8 file «modificati»
    t.recalcTimestamp = False
    t.save(dest)

    # la cucitura NON deve aver toccato i glifi che c erano: da li' dipende
    # l impaginazione di ogni foglio gia' stampato
    ri = TTFont(dest); ricm = ri.getBestCmap()
    cambiati = [cp for cp, adv in prima.items()
                if cp in ricm and ri['hmtx'][ricm[cp]][0] != adv]
    if cambiati:
        sys.exit('x %s: la cucitura ha cambiato %d advance esistenti — '
                 'le costanti di impaginazione non varrebbero piu'
                 % (os.path.basename(dest), len(cambiati)))
    mancati = [cp for cp in cps if cp not in ricm and cp in dcm]
    if mancati:
        sys.exit('x %s: %d glifi non sono entrati' % (os.path.basename(dest), len(mancati)))
    return len(da_cucire)


def _annota(f):
    """Dice DENTRO il font che e' stato modificato, e da dove vengono i glifi.

    Non e' burocrazia: la Bitstream Vera License chiede che la nota di copyright
    viaggi con i disegni, e chi apre il PDF con un lettore vede questo campo.
    Dove c e' un nome riservato (TestMe) rinomina anche la famiglia — OFL 1.1 §3.
    """
    NOTA = ('Versione modificata per MappAI: glifi scientifici (greco, matematica, '
            'frecce, filetti, spunte) aggiunti da DejaVu Sans, (c) 2003 Bitstream Inc. '
            '- Bitstream Vera License, vedi LICENSE-DejaVu.txt.')
    nomi = f['name']
    for rec in list(nomi.names):
        try: v = rec.toUnicode()
        except Exception: continue
        nuovo = v
        if rec.nameID in (1, 3, 4, 6, 16, 18, 21, 22):
            for vecchio, dopo in RINOMINA.items():
                nuovo = nuovo.replace(vecchio, dopo)
            if rec.nameID == 6: nuovo = nuovo.replace(' ', '')
        if rec.nameID == 0 and NOTA not in nuovo:
            nuovo = v.rstrip('. ') + '. ' + NOTA
        if rec.nameID == 10:
            nuovo = NOTA
        if nuovo != v:
            nomi.setName(nuovo, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
    if not nomi.getDebugName(10):
        nomi.setName(NOTA, 10, 3, 1, 0x409)


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

# I glifi che un documento si porta DENTRO. Qui il conto e' diverso da quello
# della cucitura: questi byte si ripetono in OGNI foglio del vault, quindi si
# tiene tutto cio' che una scheda scientifica usa davvero (latino esteso,
# diacritici, greco, apici e pedici, matematica, frecce, valute, frazioni) e si
# scelgono a mano i segni dai blocchi grossi invece di prenderli interi.
# Misurato: 49 KB a taglio prima, 96 KB adesso — i simboli costano ~47 KB a
# faccia, e senza di loro una formula stampata perde pezzi in silenzio.
SOTTOINSIEME = ("U+0000-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF,U+0300-036F,"
                "U+0370-03FF,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,"
                "U+2150-218F,U+2190-21FF,U+2200-22FF,"
                # filetti del dossier, forme dei diagrammi, spunte, caselle,
                # i due segni della biologia e i tre della musica
                "U+2500,U+2502,U+250C,U+2510,U+2514,U+2518,U+251C,U+2524,"
                "U+252C,U+2534,U+253C,U+25A0,U+25AA,U+25B2,U+25B6,U+25BC,"
                "U+25C6,U+25CB,U+25CF,U+2610,U+2611,U+2612,U+2640,U+2642,"
                # le barre piene: la timeline disegna gli istogrammi con ▌
                "U+258C-2593,"
                "U+266A,U+266D,U+266F,U+2713,U+2714,U+2715,U+2717,U+270F")


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
    # ⚠️ E si tiene una copia INTATTA in sorgenti/: da quando i glifi si cuciono,
    # il modulo che sta nel repo è già cucito, e ridecodificarlo vorrebbe dire
    # cucire sopra il cucito — cioè non poter più cambiare le regole della
    # cucitura (una rifinitura ai filetti non arriverebbe mai a Space Mono).
    # Gli altri tre non hanno il problema: arrivano da un download.
    os.makedirs(SORG, exist_ok=True)
    sm = open(os.path.join(VENDOR, 'spacemono-font.js'), encoding='utf-8').read()
    for var, nome in (('REGULAR', 'SpaceMono-Regular.ttf'), ('BOLD', 'SpaceMono-Bold.ttf')):
        intatto = os.path.join(SORG, 'intatto-' + nome)
        if not os.path.exists(intatto):
            m = re.search(r'var\s+' + var + r'\s*=\s*"([A-Za-z0-9+/=]+)"', sm)
            if not m: sys.exit(f'✗ {var} non trovato in spacemono-font.js')
            open(intatto, 'wb').write(base64.b64decode(m.group(1)))
        open(os.path.join(FONTS, nome), 'wb').write(open(intatto, 'rb').read())
        print(f'   {nome:26s} ← sorgenti/intatto-{nome}')

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

    # ── 1-bis. i glifi scientifici, cuciti dentro ogni carattere ─────────────
    print('\n── 1-bis. i glifi scientifici cuciti dentro (donatore: DejaVu Sans)\n')
    dona = donatore()
    # la STESSA lista che i documenti si portano dentro (SOTTOINSIEME): un
    # simbolo che si vede a schermo e non nel PDF, o viceversa, sarebbe peggio
    # che non averlo — e due liste da tenere allineate divergono al primo ritocco
    cps = set(subset.parse_unicodes(SOTTOINSIEME))
    for file in sorted(os.listdir(FONTS)):
        if not file.endswith('.ttf'):
            continue
        taglio = next((t for t in ('-BoldItalic', '-BoldOblique', '-Bold', '-Italic')
                       if file.endswith(t + '.ttf')), '-Regular')
        n = cuci(os.path.join(FONTS, file), dona[taglio.replace('Oblique', 'Italic')], cps)
        print(f'   {file:26s} +{n} glifi')

    # ── i moduli base64 per jsPDF (uno per famiglia, caricati a richiesta) ────
    # ⚠️ Space Mono e' in questa lista dal 19/8: prima il suo modulo era scritto
    # a mano e lo script ne DECODIFICAVA i byte. Da quando i glifi si cuciono,
    # un modulo non rigenerato vorrebbe dire schermo con l Omega e PDF senza.
    print('\n── 2. i moduli base64 per jsPDF (uno per famiglia)\n')
    for fam, (nomeFile, globale, reg, bld) in MODULI.items():
        b64r = base64.b64encode(open(os.path.join(FONTS, reg), 'rb').read()).decode()
        b64b = base64.b64encode(open(os.path.join(FONTS, bld), 'rb').read()).decode()
        # ⚠️ Space Mono tiene il nome storico del file: lo citano index.html,
        # mappai-font-core.js e l harness di dev
        dst = os.path.join(VENDOR, ('spacemono' if fam == 'space-mono' else fam) + '-font.js')
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(
'/*\n'
' * ' + fam + '-font.js — ' + nomeFile + ' per jsPDF (base64, SIL OFL +\n'
' * i glifi scientifici da DejaVu Sans, Bitstream Vera License).\n'
' * GENERATO da tools/font/prepara-font.py — non modificare a mano.\n'
' *\n'
' * Perche base64 e non un fetch del .ttf: l app si apre con loadFile, cioe\n'
' * su file://, dove fetch e XHR verso un altro file sono bloccati. Lo stesso\n'
' * motivo per cui spacemono-font.js e fatto cosi.\n'
' * Il modulo si carica A RICHIESTA (MappAIFontCore.caricaPerPdf) — non al boot:\n'
' * sono ~200 KB per famiglia e servono solo a chi esporta un PDF in quel font.\n'
' *\n'
' * window.' + globale + '.registerInto(pdf) → registra normale + bold.\n'
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
'  window.' + globale + ' = { fontName: NOME, registerInto: registerInto };\n'
'})();\n')
        print(f'   {os.path.basename(dst):26s} {os.path.getsize(dst) // 1024} KB')

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
