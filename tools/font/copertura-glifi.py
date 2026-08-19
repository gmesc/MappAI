#!/usr/bin/env python3
"""
copertura-glifi.py — quali simboli l'app scrive, e quali caratteri ce l'hanno
-----------------------------------------------------------------------------
    python3 tools/font/copertura-glifi.py

Non è una tabella scritta a mano: LEGGE i costruttori dei documenti per sapere
quali simboli emettono davvero, e interroga i file dei caratteri per sapere chi
li ha. Rieseguirlo dopo aver aggiunto un carattere, o dopo aver messo un simbolo
nuovo in un foglio, dice subito se qualcosa si romperà.

── PERCHÉ ESISTE ────────────────────────────────────────────────────────────
Il 18/8 un quiz di elettricità è uscito con l'ohm in un carattere diverso dal
resto, e da lì si è scoperto che il problema è molto più largo di quel simbolo e
molto più vecchio dei caratteri nuovi: **anche Space Mono**, il carattere storico
con cui è stato prodotto tutto finora, non ha ✓ ✗ → ─ ▶ Ω Δ e altri.

E i due percorsi di esportazione falliscono in modo DIVERSO — misurato, non
dedotto (`tools/font/prova-glifi.js` riproduce la misura):

  · Chromium (HTML → printToPDF: quiz, domande aperte, sintesi, report)
    ripiega su un carattere di sistema. Il simbolo si vede, in un'altra veste.
    Fastidioso, non grave.

  · jsPDF (grafi, vista studio, dossier, foglio dei nodi)
    il glifo SPARISCE, e non lo dice nessuno: «ohm 12 Ω · spunta ✓ · freccia →»
    esce «ohm 12 · spunta · freccia →». Vale per tutti e quattro i caratteri allo
    stesso modo — il filtro sta in jsPDF (`postProcessText`), non nel font.
    ⚠️ Un carattere che avesse un buco SOTTO U+0100 andrebbe peggio: quelli
    jsPDF li lascia passare e `pdfEscape16` TRONCA la riga al primo mancante.

Quindi un simbolo che manca non è un dettaglio tipografico: su un foglio prodotto
da jsPDF può portarsi via del testo, in silenzio.

── ⚠️ IL SECONDO CANALE, CHE QUESTO STRUMENTO NON VEDE ──────────────────────
I simboli arrivano su un foglio da due strade, e questa ne misura una sola:
  · il CODICE — le frecce, le spunte, i filetti che i costruttori scrivono. È
    quella qui sotto, ed è governabile: si può decidere di non usarli.
  · il CONTENUTO — il testo che l'AI scrive nei nodi e nelle domande. Lì può
    comparire qualunque cosa, e infatti il difetto è stato scoperto proprio da
    lì: «12 Ω» in un quiz di elettricità. Per questo canale non c'è una lista
    da controllare, e l'unica difesa è che il carattere ABBIA il glifo.
Su questo secondo canale Atkinson è il più coperto dei quattro (ha Ω e Δ, che
Space Mono e TestMe non hanno): per Scienze e Fisica è la scelta prudente.

── CHE FARSENE ──────────────────────────────────────────────────────────────
Le tre strade, in ordine di quanto costano:
  1. non usare quei simboli nei fogli che passano da jsPDF (il ✓ si può disegnare
     come geometria, la freccia idem: nella vista studio le punte sono GIÀ
     geometria per lo stesso genere di ragione);
  2. sostituirli con caratteri che tutti i font hanno (» invece di →, × invece
     di ✗): un ripiego, ma cambia una convenzione visiva;
  3. cucire i glifi mancanti dentro i font (fontTools li sa copiare da un font
     che li ha): risolve davvero, e va rifatto a ogni aggiornamento dei font.
"""
import glob
import os
import re
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit('manca fontTools:  pip3 install fonttools')

RADICE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JS = os.path.join(RADICE, 'public', 'js')
FONTS = os.path.join(RADICE, 'public', 'fonts')

# I moduli che COSTRUISCONO documenti: è lì che un simbolo finisce su un foglio.
COSTRUTTORI = [
    'mappai-branch-synthesis', 'mappai-quiz-print', 'mappai-causal-chains',
    'mappai-study-doc', 'mappai-timeline', 'mappai-print-dossier', 'mappai-doc-head',
    'mappai-glossary', 'mappai-tutor-reports', 'mappai-live-reports',
    'mappai-studio-draw', 'mappai-d3-render', 'mappai-nodesheet-core', 'mappai-print-layout',
]

# Chi passa da jsPDF: lì un glifo mancante sparisce (o tronca), non ripiega.
VIA_JSPDF = {'mappai-print-dossier', 'mappai-studio-draw', 'mappai-d3-render',
             'mappai-nodesheet-core', 'mappai-print-layout'}

# Punteggiatura tipografica: la usiamo ovunque e tutti i font ce l'hanno.
IGNORA = set(range(0x2018, 0x2020)) | {0x2013, 0x2014, 0x2026, 0xFE0F}


def simboli_usati():
    """I caratteri non-ASCII che i costruttori scrivono dentro le stringhe."""
    out = {}
    for nome in COSTRUTTORI:
        p = os.path.join(JS, nome + '.js')
        if not os.path.exists(p):
            continue
        testo = open(p, encoding='utf-8').read()
        for m in re.finditer(r"""(['"`])((?:[^\\\n]|\\.)*?)\1""", testo):
            for c in m.group(2):
                o = ord(c)
                if o < 0x2000 and o not in (0x03A9, 0x0394):   # greco maiuscolo: ci interessa
                    continue
                if o in IGNORA:
                    continue
                v = out.setdefault(c, {'n': 0, 'dove': set()})
                v['n'] += 1
                v['dove'].add(nome)
    return out


def main():
    caratteri = []
    for f in sorted(glob.glob(os.path.join(FONTS, '*-Regular.ttf'))):
        caratteri.append((os.path.basename(f).replace('-Regular.ttf', ''), set(TTFont(f).getBestCmap())))
    if not caratteri:
        sys.exit('nessun carattere in public/fonts/ — esegui prima prepara-font.py')

    usati = simboli_usati()
    if not usati:
        print('nessun simbolo trovato nei costruttori.')
        return

    print('\nSIMBOLI CHE L\'APP SCRIVE NEI DOCUMENTI, E CHI LI HA\n')
    print('%-3s %-8s %s %-6s %s' % ('', 'codice',
                                    ' '.join('%-12s' % n for n, _ in caratteri), 'via', 'moduli'))
    guai = []
    for c, v in sorted(usati.items(), key=lambda kv: -kv[1]['n']):
        o = ord(c)
        riga = ''.join('%-13s' % ('  sì' if o in cm else '  NO') for _, cm in caratteri)
        jspdf = bool(v['dove'] & VIA_JSPDF)
        manca_a = [n for n, cm in caratteri if o not in cm]
        if manca_a and jspdf:
            guai.append((c, o, manca_a, sorted(v['dove'] & VIA_JSPDF)))
        print(' %-2s U+%04X %s %-6s %s' % (c, o, riga, 'jsPDF' if jspdf else 'html',
                                           ' '.join(sorted(v['dove']))[:44]))

    print('\n⚠️  DOVE FA DANNO — un simbolo che manca su un foglio prodotto da jsPDF')
    print('    sparisce senza dirlo, invece di ripiegare come fa Chromium.\n')
    if not guai:
        print('    nessuno: tutti i simboli dei fogli jsPDF hanno il loro glifo.')
    for c, o, manca_a, dove in guai:
        print('    %-2s U+%04X  manca a: %-34s in %s' % (c, o, ', '.join(manca_a), ', '.join(dove)))
    print('')


if __name__ == '__main__':
    main()
