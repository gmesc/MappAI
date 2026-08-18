# I caratteri di MappAI

Quattro, e sono tutti **dentro l'app**: nessuno arriva da una CDN, perché MappAI si
apre su `file://` e in aula la rete può non esserci.

| id | famiglia | tagli | licenza | da dove |
|---|---|---|---|---|
| `space-mono` | Space Mono | R · B | OFL | i byte erano già nel repo (`js/vendor/spacemono-font.js`) |
| `testme-sans` | TestMe Sans 02 | R · B | OFL | [molotro/TestMe02](https://github.com/molotro/TestMe02) |
| `testme-alt` | TestMe Alt 02 | R · B | OFL | idem — la variante con le lettere-specchio (b d p q) disegnate diverse |
| `atkinson` | Atkinson Hyperlegible | R · B · I · BI | OFL | [googlefonts/atkinson-hyperlegible](https://github.com/googlefonts/atkinson-hyperlegible) |

Il catalogo vero — stack CSS, metriche, chi ha il corsivo — sta in
`public/js/mappai-font-core.js`. Qui c'è solo come si producono i file.

## Rigenerare

```bash
python3 tools/font/prepara-font.py      # serve: pip3 install fonttools
```

Scrive `public/fonts/` (i file per lo schermo e la stampa), i moduli base64 in
`public/js/vendor/*-font.js` (per jsPDF) e **stampa le costanti di impaginazione**
da ricopiare nel catalogo. I sorgenti scaricati restano in `sorgenti/`, fuori dal repo.

## Le due cose da sapere

**1. TestMe è OTF (curve `CFF `), jsPDF legge solo `glyf`.** Lo script converte con
cu2qu e verifica che la conversione non abbia cambiato **nessun** advance — se li
cambiasse, l'impaginazione dei fogli calcolata sulle metriche non varrebbe più.
Se un giorno si ripartisse dagli `.otf` originali, l'export PDF ricadrebbe in
Helvetica **in silenzio**.

**2. Le metriche sono due per carattere, e non si derivano l'una dall'altra.**
`advance` è per il corpo del testo, `headAdvance` per le testate — che sono
maiuscole *e* spaziate. Il foglio faceva `headAdvance = advance + 0,06`: con Space
Mono regge perché è monospazio, sui caratteri proporzionali no (la somma darebbe
0,56 dove ne servono 0,71 — le testate sborderebbero del 27%).

Le costanti sono misurate sul **testo vero dei vault** su questo disco: se non ci
sono vault, lo script lo dice e salta la misura invece di inventare numeri.

## Provare che arrivano davvero

`public/dev/banco-font.html` (servendo `public/`): misura la larghezza del testo
reso e dice `arrivato: sì/NO` per ciascuno. Serve perché un file che non arriva
non dà errore — il browser ripiega su un carattere di sistema e a occhio non si
distingue.
