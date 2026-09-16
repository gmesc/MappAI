#!/usr/bin/env python3
"""
emoji-sottoinsieme.py — costruisce `public/fonts/MappAIEmoji.ttf` (15/9/2026)

    python3 tools/font/emoji-sottoinsieme.py            # scrive il font
    python3 tools/font/emoji-sottoinsieme.py --elenco   # dice solo che cosa entrerebbe

DUE FILE, UNA FAMIGLIA (16/9/2026)
  · `MappAIEmoji.ttf`    — SOLO le 27 dell'identità. È il pacchetto che le pagine
    degli allievi (live/, collab/, tutor/) scaricano dal docente via QR, anche
    senza rete: resta piccolo e non cresce con l'interfaccia.
  · `MappAIEmojiApp.ttf` — le 27 + ogni emoji che il codice dell'APP scrive
    (index.html, js/, css/, traduzioni/) e che Noto possiede. Lo carica solo
    `index.html` (e MappAI studente): offline l'app si vede come online.
  Stessa famiglia 'MappAI Emoji' in entrambi → lo stack non cambia.

PERCHÉ ESISTE
Noto Color Emoji intero pesa **23,9 MB**: più di dieci volte tutti i caratteri
di testo che MappAI spedisce messi insieme. Per questo `index.html` lo lasciava
arrivare da `fonts.googleapis.com` — e in aula senza rete le emoji cadevano su
quelle di sistema. In un punto però l'emoji NON è decorazione: è l'identità di
un allievo (🦊 07) e il codice d'accesso di un gruppo. Lì il glifo deve esserci
sempre, e deve essere lo stesso sul telefono dell'allievo e sul Mac del docente.
La cura non è il font intero: è il SOTTOINSIEME delle emoji che l'app usa
davvero. 27 glifi → **254 KB**.

DA DOVE PRENDE L'ELENCO
Non da una lista scritta qui: dalle DUE fonti di verità del codice, così una
emoji aggiunta là entra nel font al primo rilancio e non si scopre il buco a
lezione iniziata (invariante 6 — una verità, una fonte):
  · `EMOJI_SET`   in public/js/mappai-live-core.js    → identità degli allievi
  · `GROUP_EMOJI` in public/js/mappai-collab-core.js  → codici dei gruppi
⚠️ Dopo aver aggiunto un'emoji a uno dei due, RILANCIARE questo script.
   `tests/emoji-sottoinsieme.test.js` diventa rosso se ci si dimentica.

PERCHÉ SI CHIAMA «MappAI Emoji» E NON «Noto Color Emoji»
Perché convivesse con la CDN servirebbero due @font-face con lo stesso nome, e
il ripiego per le emoji FUORI dal sottoinsieme diventerebbe imprevedibile. Con
un nome suo lo stack è esplicito e leggibile:
    'MappAI Emoji'  →  'Noto Color Emoji' (rete)  →  emoji di sistema
Le 27 si vedono sempre, le altre si comportano come prima.

PERCHÉ SI TIENE LA TABELLA `SVG ` (254 KB invece di 51)
Noto Color Emoji v40 è un font a colori VETTORIALE e porta il disegno due volte:
in `COLR`v1 (che legge Chromium) e in `SVG ` (che legge Safari). Buttando `SVG `
il font scende a 51 KB, ma su un iPad fermo a iOS < 17.4 — e nelle scuole ce ne
sono — le emoji non si vedrebbero. 200 KB su una LAN non sono niente; un
codice d'accesso invisibile blocca la lezione.
"""
import argparse, os, re, subprocess, sys, tempfile

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
USCITA = os.path.join(RADICE, 'public', 'fonts', 'MappAIEmoji.ttf')
USCITA_APP = os.path.join(RADICE, 'public', 'fonts', 'MappAIEmojiApp.ttf')
# Dove l'app scrive emoji. Le pagine degli allievi NO: quelle usano solo le 27.
SORGENTI_APP = ['public/index.html', 'public/js', 'public/css', 'public/traduzioni']
LICENZA = os.path.join(RADICE, 'public', 'fonts', 'OFL-NotoColorEmoji.txt')

# Il CSS di Google Fonts con uno user-agent vecchio risponde col .ttf invece del
# .woff2: ci serve il ttf perché leggere un woff2 vorrebbe brotli, che non è
# installato — e una dipendenza in più per un asset che si rigenera a mano no.
CSS = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji'
UA_VECCHIO = 'Mozilla/4.0'
URL_LICENZA = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/LICENSE'

NOME, PS = 'MappAI Emoji', 'MappAIEmoji-Regular'

FONTI = [
    ('identità allievo', 'public/js/mappai-live-core.js', r'EMOJI_SET\s*=\s*\[(.*?)\n\s*\];'),
    ('codici di gruppo', 'public/js/mappai-collab-core.js', r'GROUP_EMOJI\s*=\s*\[(.*?)\n\s*\];'),
]
# Le emoji stanno sempre in `emoji: '…'`; il resto del blocco è chiavi ASCII.
EMOJI_NEL_BLOCCO = re.compile(r"emoji:\s*'([^']+)'")


def raccogli():
    """→ [(provenienza, [caratteri])]. Legge il CODICE, non una lista a parte."""
    fuori = []
    for etichetta, rel, pattern in FONTI:
        testo = open(os.path.join(RADICE, rel), encoding='utf-8').read()
        blocco = re.search(pattern, testo, re.S)
        if not blocco:
            sys.exit(f'✗ {rel}: non trovo il blocco. È stato rinominato? '
                     f'Aggiorna FONTI in questo script invece di scrivere a mano le emoji.')
        trovate = EMOJI_NEL_BLOCCO.findall(blocco.group(1))
        if not trovate:
            sys.exit(f'✗ {rel}: blocco trovato ma zero `emoji:` dentro.')
        fuori.append((f'{etichetta} ({rel})', trovate))
    return fuori


def distinte(gruppi):
    viste, ordinate = set(), []
    for _, elenco in gruppi:
        for e in elenco:
            if e not in viste:
                viste.add(e); ordinate.append(e)
    return ordinate


def codepoint_app(noto):
    """Ogni codepoint (≥ U+2000: niente cifre né #) che il codice dell'app
    contiene E che Noto possiede. Anche i commenti: qualche glifo in più costa
    meno di un'emoji dimenticata."""
    trovati = set()
    for rel in SORGENTI_APP:
        base = os.path.join(RADICE, rel)
        file = [base] if os.path.isfile(base) else [
            os.path.join(d, f) for d, dirs, fs in os.walk(base)
            if 'vendor' not in d for f in fs
            if f.endswith(('.js', '.css', '.html')) and not f.endswith('.min.js')]
        for f in file:
            trovati.update(ord(c) for c in open(f, encoding='utf-8', errors='ignore').read()
                           if ord(c) >= 0x2000 and ord(c) in noto)
    return trovati


def unicodes(caratteri):
    """Un'emoji può essere una SEQUENZA (bandiere, ZWJ): si prendono tutti i
    codepoint che la compongono, o il glifo non si risolve."""
    cp = []
    for e in caratteri:
        for c in e:
            v = f'U+{ord(c):04X}'
            if v not in cp: cp.append(v)
    return cp


def curl(url, dest, ua=None):
    """curl e non urllib: su questo Mac i certificati di Python non sono
    installati e ogni https finisce in CERTIFICATE_VERIFY_FAILED — stessa
    ragione, e stessa cura, di tools/font/prepara-font.py."""
    cmd = ['curl', '-sSL', '--fail', '--max-time', '180', '-o', dest, url]
    if ua: cmd[1:1] = ['-A', ua]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dest) or not os.path.getsize(dest):
        sys.exit(f'✗ download fallito: {url}\n  {r.stderr.strip()}')
    return os.path.getsize(dest)


def scarica_ttf(dove):
    css_file = dove + '.css'
    curl(CSS, css_file, ua=UA_VECCHIO)
    css = open(css_file, encoding='utf-8').read()
    url = re.search(r'url\((https://[^)]+\.ttf)\)', css)
    if not url:
        sys.exit('✗ Google Fonts non ha risposto con un .ttf. CSS:\n' + css[:400])
    print(f'  scarico {url.group(1)}')
    return curl(url.group(1), dove)


def ritaglia(intero, cp, uscita, descrizione, tmp):
    from fontTools.ttLib import TTFont
    ridotto = os.path.join(tmp, os.path.basename(uscita))
    subprocess.run([sys.executable, '-m', 'fontTools.subset', intero,
                    f'--unicodes={",".join(cp)}', f'--output-file={ridotto}'], check=True)
    f = TTFont(ridotto)
    # Senza questo ogni rilancio riscrive `head.modified` e il .ttf risulta
    # «modificato» pur essendo lo stesso font: il repo si sporca a ogni giro.
    # Stessa cura, stessa ragione, di tools/font/prepara-font.py:160.
    f.recalcTimestamp = False
    for rec in f['name'].names:
        if rec.nameID in (1, 4, 16): rec.string = NOME
        elif rec.nameID == 6: rec.string = PS
    f['name'].setName(
        f'{NOME} — sottoinsieme di Noto Color Emoji (Google), {descrizione}. '
        f'SIL Open Font License 1.1. Rigenerato da tools/font/emoji-sottoinsieme.py.',
        10, 3, 1, 0x409)
    f.save(uscita)
    print(f'✓ {os.path.relpath(uscita, RADICE)}  {os.path.getsize(uscita)/1024:.0f} KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--elenco', action='store_true', help='dice che cosa entrerebbe, senza scrivere')
    arg = ap.parse_args()

    gruppi = raccogli()
    for etichetta, elenco in gruppi:
        print(f'{etichetta}: {len(elenco)} → ' + ' '.join(elenco))
    care = distinte(gruppi)
    cp = unicodes(care)
    print(f'\ndistinte: {len(care)} emoji, {len(cp)} codepoint')
    if arg.elenco:
        return

    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit('✗ serve fontTools:  python3 -m pip install fonttools')

    with tempfile.TemporaryDirectory() as tmp:
        intero = os.path.join(tmp, 'NotoColorEmoji.ttf')
        byte = scarica_ttf(intero)
        print(f'  intero: {byte/1048576:.1f} MB')

        ritaglia(intero, cp, USCITA,
                 f'{len(care)} emoji: gli animali degli ID allievo e i set dei codici di gruppo', tmp)
        noto = TTFont(intero, lazy=True).getBestCmap()
        cp_app = sorted({int(c[2:], 16) for c in cp} | codepoint_app(noto))
        ritaglia(intero, [f'U+{c:04X}' for c in cp_app], USCITA_APP,
                 f"{len(cp_app)} codepoint: le 27 dell'identità + le emoji dell'interfaccia", tmp)

        if not os.path.exists(LICENZA):
            curl(URL_LICENZA, LICENZA)
            print(f'  licenza scritta in {os.path.relpath(LICENZA, RADICE)}')

    g = TTFont(USCITA, lazy=True)
    mancanti = [e for e in care if any(ord(c) not in g.getBestCmap() for c in e)]
    if mancanti:
        sys.exit('✗ nel font finito mancano: ' + ' '.join(mancanti))
    print(f'\n✓ {os.path.relpath(USCITA, RADICE)}  {os.path.getsize(USCITA)/1024:.0f} KB  '
          f'({len(g.getBestCmap())} codepoint, famiglia {g["name"].getDebugName(1)!r})')
    print('  da 23,9 MB a un quarto di megabyte: 27 emoji invece di 1.499.')


if __name__ == '__main__':
    main()
