# I caratteri di MappAI

Quattro, e sono tutti **dentro l'app**: nessuno arriva da una CDN, perché MappAI si
apre su `file://` e in aula la rete può non esserci.

| id | famiglia | tagli | licenza | da dove |
|---|---|---|---|---|
| `space-mono` | Space Mono | R · B | OFL | i byte erano già nel repo (`js/vendor/spacemono-font.js`) |
| `testme-sans` | **TM Sans** (da TestMe Sans 02) | R · B | OFL | [molotro/TestMe02](https://github.com/molotro/TestMe02) |
| `testme-alt` | **TM Alt** (da TestMe Alt 02) | R · B | OFL | idem — la variante con le lettere-specchio (b d p q) disegnate diverse |
| `atkinson` | Atkinson Hyperlegible | R · B · I · BI | OFL | [googlefonts/atkinson-hyperlegible](https://github.com/googlefonts/atkinson-hyperlegible) |
| — | DejaVu Sans | R · B · I · BI | Bitstream Vera | il **donatore** dei glifi scientifici: non è un carattere scegliibile, ci si prendono solo i disegni che agli altri quattro mancano |

Il catalogo vero — stack CSS, metriche, chi ha il corsivo — sta in
`public/js/mappai-font-core.js`. Qui c'è solo come si producono i file.

## Rigenerare

```bash
python3 tools/font/prepara-font.py      # serve: pip3 install fonttools
```

Scrive `public/fonts/` (i file per lo schermo e la stampa), i moduli base64 in
`public/js/vendor/*-font.js` (per jsPDF) e **stampa le costanti di impaginazione**
da ricopiare nel catalogo. I sorgenti scaricati restano in `sorgenti/`, fuori dal repo.

## Le tre cose da sapere

**0. I glifi scientifici si CUCIONO dentro ogni carattere** (`cuci()`). Nessuno dei
quattro aveva `✓` o i filetti del dossier, e solo Atkinson aveva l'`Ω`: su un foglio fatto
con jsPDF il glifo mancante **spariva senza dirlo** — jsPDF incorpora un font solo e non sa
ripiegare a cascata come il browser. Donatore: **DejaVu Sans**. Due regole, verificate
dallo script: i glifi che c'erano **non si toccano** (le costanti di impaginazione sono
misurate su di loro) e su un monospazio il **passo resta il passo** — ⚠️ tranne filetti e
barre (`U+2500-259F`), che si tirano in larghezza fino al passo invece di centrarsi, o fra
un `├` e il `─` che segue resterebbe un buco e l'albero del dossier uscirebbe tratteggiato.

⚠️ **Da qui il cambio di nome di TestMe → «TM Sans» / «TM Alt»**: cucire dei glifi rende il
font una versione modificata, e la sua OFL dichiara «Reserved Font Name TestMe» (§3: una
versione modificata non può portare quel nome). Space Mono e Atkinson non hanno nomi
riservati e tengono il loro. Gli `id` del catalogo non cambiano mai: sono un dato salvato.

**1. TestMe è OTF (curve `CFF `), jsPDF legge solo `glyf`.** Lo script converte con
cu2qu e verifica che la conversione non abbia cambiato **nessun** advance — se li
cambiasse, l'impaginazione dei fogli calcolata sulle metriche non varrebbe più.
Se un giorno si ripartisse dagli `.otf` originali, l'export PDF ricadrebbe in
Helvetica **in silenzio**.
⚠️ E la conversione deve anche riscrivere l'**intestazione sfnt**: un `.otf` si
annuncia `OTTO` («curve in CFF»), e senza `f.sfntVersion = '\x00\x01\x00\x00'`
il font continua a dichiararsi tale anche dopo. Un `/FontFile2` è un TrueType per
definizione, quindi i lettori PDF lo rifiutano — costato una giornata il 18/8, e
si vedeva solo sui grafi (Chromium era tollerante). C'è il test.

**2. Le metriche sono due per carattere, e non si derivano l'una dall'altra.**
`advance` è per il corpo del testo, `headAdvance` per le testate — che sono
maiuscole *e* spaziate. Il foglio faceva `headAdvance = advance + 0,06`: con Space
Mono regge perché è monospazio, sui caratteri proporzionali no (la somma darebbe
0,56 dove ne servono 0,71 — le testate sborderebbero del 27%).

Le costanti sono misurate sul **testo vero dei vault** su questo disco: se non ci
sono vault, lo script lo dice e salta la misura invece di inventare numeri.

## I simboli scientifici — chiuso il 19/8

```bash
python3 tools/font/copertura-glifi.py     # chi ha quali simboli, e dove farebbe danno
npx electron tools/font/prova-glifi.js    # i due percorsi a confronto su Ω ✓ →
```

Prima della cucitura nessuno dei quattro caratteri aveva `✓` né i filetti del dossier, e
**anche Space Mono** mancava di quindici simboli che l'app usa. Ora `copertura-glifi.py`
risponde «nessuno: tutti i simboli dei fogli jsPDF hanno il loro glifo»; restano fuori solo
💡 e 🎓, che sono **emoji a colori** e le disegna Noto Color Emoji.

I due percorsi di esportazione si comportavano — e si comportano — così:

| percorso | chi ci passa | glifo mancante |
|---|---|---|
| Chromium (HTML → printToPDF) | quiz, domande aperte, sintesi, report | **ripiega** su un carattere di sistema: si vede, in un'altra veste |
| jsPDF | grafi, vista studio, dossier, foglio dei nodi | **sparisce**, e non lo dice nessuno |

⚠️ La riga **non** si tronca (era scritto qui, ed era falso: rimisurato sui PDF veri). Il
filtro sta in `postProcessText` di jsPDF, che scarta i caratteri sopra U+00FF senza glifo.
Chi invece scende sotto U+0100 finisce in `pdfEscape16`, che al primo glifo mancante fa
`return` e **quello sì** tronca la riga: nei quattro caratteri lì sotto ci sono solo i
codici di controllo, ma un carattere futuro con un buco in Latin-1 lo farebbe vedere.

📌 I simboli arrivano da due strade: dal **codice** (le frecce e i filetti che i costruttori
scrivono — `copertura-glifi.py` li legge dai sorgenti) e dal **testo dell'AI**, dove non
c'è nessuna lista da controllare. È la seconda che ha reso obbligatoria la cucitura: si può
decidere di non scrivere un simbolo, non di non riceverlo.

## Provare che arrivano davvero

`public/dev/banco-font.html` (servendo `public/`): misura la larghezza del testo
reso e dice `arrivato: sì/NO` per ciascuno. Serve perché un file che non arriva
non dà errore — il browser ripiega su un carattere di sistema e a occhio non si
distingue.
