# Componenti di terze parti

MappAI è distribuito sotto **GNU General Public License v3 o successiva** (vedi `LICENSE`).
Questo vale per il codice scritto per MappAI. I componenti elencati qui sotto sono opera di
terzi, vengono inclusi così come sono e **restano sotto la loro licenza**: la GPL non li
copre e non li sostituisce (GPLv3 §5, «mere aggregation»).

Ultimo controllo: 9 settembre 2026.

## Font

I font sono file di dati inclusi accanto al programma, non parte del programma. Restano
sotto **SIL Open Font License 1.1**. Il testo di ciascuna licenza viaggia con l'app.

| Font | Copyright | Licenza | Testo |
|---|---|---|---|
| Space Mono | 2016 The Space Mono Project Authors | OFL 1.1 | `public/js/vendor/SpaceMono-OFL.txt` |
| Atkinson Hyperlegible | 2020 Braille Institute of America, Inc. | OFL 1.1 | `public/fonts/OFL-Atkinson.txt` |
| TM Sans, TM Alt | 2013 Luciano Perondi, da Titillium © 2008-2011 Accademia di Belle Arti di Urbino | OFL 1.1 | `public/fonts/OFL-TestMe.txt` |
| DejaVu Sans (solo alcuni glifi) | 2003 Bitstream, Inc.; modifiche DejaVu di pubblico dominio | Bitstream Vera License | `public/fonts/LICENSE-DejaVu.txt` |

**Modifiche fatte.** Ai quattro font sono stati aggiunti i glifi scientifici mancanti
(greco, matematica, frecce, filetti, spunte) presi da DejaVu Sans, perché jsPDF non ha un
ripiego quando un glifo manca. Lo strumento che li produce è `tools/font/prepara-font.py`.

⚠️ **Titillium e TestMe hanno un Reserved Font Name** (OFL 1.1 §3): una versione modificata
non può usare quel nome. Per questo le famiglie modificate si chiamano **TM Sans** e
**TM Alt**, non «TestMe». Space Mono e Atkinson Hyperlegible non dichiarano nomi riservati,
quindi le versioni modificate tengono il nome originale, con la derivazione scritta nella
tabella `name` di ogni file.

## Librerie incluse nel repo (`public/js/`)

| Libreria | Licenza |
|---|---|
| D3.js v7 — Mike Bostock | ISC |
| PDF.js — Mozilla Foundation | Apache-2.0 |
| jsPDF — James Hall, yWorks | MIT |
| svg2pdf.js — yWorks | MIT |
| three.js | MIT |
| Lucide icons | ISC |
| Tailwind CSS | MIT |
| qrcode-generator — Kazuhiko Arase | MIT |
| graphology + plugin (bundle `mappai-graphology.min.js`) | MIT |
| **lamejs** — encoder MP3 in JS, da `github.com/zhuker/lamejs` | **LGPL-3.0** |

**lamejs è LGPL-3.0**, non MIT: compatibile con la GPLv3, ma con obblighi propri. Chi
ridistribuisce MappAI deve poter sostituire quella libreria; il sorgente non minificato sta
nel progetto a monte.

## Runtime

Electron (MIT), Node.js (MIT) e Chromium (BSD-3-Clause e altre licenze permissive) sono
inclusi negli installer come ambiente di esecuzione. Le loro note di licenza viaggiano
dentro l'app (`LICENSE.electron.txt`, `LICENSES.chromium.html`).

## Dipendenze npm

Tutte permissive e compatibili con la GPLv3: MIT, ISC, BSD-2-Clause, BSD-3-Clause,
Apache-2.0, BlueOak-1.0.0, Python-2.0, 0BSD, Zlib, WTFPL, CC0-1.0. L'elenco completo con le
versioni si ottiene da `package-lock.json`.

⚠️ Apache-2.0 (PDF.js e alcune dipendenze) è compatibile con la **GPLv3** ma non con la
GPLv2: è una delle ragioni per cui questo progetto usa la versione 3.

## Servizi esterni chiamati a runtime

Non sono ridistribuiti, ma servono a far funzionare l'app:

- **Google Gemini** e **Infomaniak AI** — generazione dei contenuti, con la chiave
  dell'utente e alle condizioni dei rispettivi fornitori.
- **KaTeX** (MIT) e **Noto Color Emoji** (OFL) — caricati da CDN quando c'è rete.

## Dati di terzi: fuori dal repository

Il **Piano di studio della scuola dell'obbligo ticinese** — competenze e traguardi,
pubblicazione ufficiale del Dipartimento dell'educazione, della cultura e dello sport del
Canton Ticino — è materiale di terzi e **non viene ridistribuito**: non sta nel repository e
non finisce negli installer. Se un giorno servisse pubblicarlo, il diritto va verificato
prima con il DECS.
