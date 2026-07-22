# Integrazione SlideFly → tab ELABORA di MappAI — piano d'integrazione

> Studio del 22/7/26 (branch `fix/deepening-residuo`). Fonte: `/Users/giacomomeschini/Claude/slidefly-main/slidefly-ui.html` (app HTML self-contained ~3125 righe, stesso autore/stack di MappAI). Copre le 4 richieste utente: #1 ignora header/footer, #3 export scheda evidenziata, #4 export testo adattato (opzioni SlideFly), #5 doc per aree tematiche.

## 1. Cos'è SlideFly
Prende un PDF scolastico e lo rende accessibile BES/DSA: ricostruisce il testo sopra la pagina in font dislessico/bionico con spaziatura regolabile, sostituisce fino a ~20 parole difficili con sinonimi mono-parola (flip-card + definizione) e raggruppa le pagine per tema via Gemini. Non riscrive le frasi: maschera l'originale, ne ridisegna testo e grafiche vettoriali e ci monta sopra un layer tipografico adattato. Stesso stack di MappAI (PDF.js, Gemini, Space Mono/emerald).

## 2. Opzioni SlideFly → già in MappAI?
| # | Opzione SlideFly | Già in MappAI? | Dove / nota |
|---|---|---|---|
| 1 | Testo accessibile (overlay ON/OFF) | Parziale | ELABORA overlay solo highlight (`_mountPdf`/`_paintPdfHighlights`); manca re-typeset |
| 2 | OpenDyslexic / Bionic | No | `mappai-a11y.js` ha sillabazione/interlinea/zoom, non font dislessico/bionic |
| 3 | Fissazione Bionic 1–5 | No | dipende da #2 |
| 4 | Spazio lettere/parole | No | a11y ha solo `cycleLineHeight` |
| 5 | Righello di lettura | Parziale | interlinea sì, righello no |
| 6 | Evidenziatore manuale | Parziale | ELABORA evidenzia per macro-area (deterministico); manca il manuale |
| 7 | Zoom pagina | Sì | `applyTextZoom`/`cycleTextZoom` + zoom canvas PDF.js |
| 8 | Salva PDF | Sì (meglio) | `htmlToPdf` IPC, `openPrintable`, `saveVaultFile`, QR `shareDocQr` (SlideFly usa `window.print()`) |
| 9 | Coesione (slider 1–5) | Sì (superiore) | REGISTRO semplice/medio/ricco + `classTuningPrompt`/`[VERDE]` |
| 10 | Vocaboli flip-card | No | logica AI da portare |
| 11 | Analizza con Gemini | Parziale | MappAI ha fetchModelAPI+salvageTruncatedJSON, 2 provider; mancano i 2 prompt |
| 12 | Raggruppa per tema | Parziale | ELABORA raggruppa già per macro-area |
| 13 | Config API | Sì (meglio) | via main process, mai chiave in querystring |
| 14 | Lingua | Sì | in SlideFly è stub morto |
| 15 | Proxy demo Cloudflare | N/A | non serve; MappAI usa la chiave utente/provider attivo |

**Manca davvero**: layer tipografico accessibile (dislessico/bionic/spaziatura) + sostituzione lessicale flip-card.

## 3. #4 — esportare da ELABORA una versione adattata
**Biforcazione**: ELABORA oggi fa overlay NON distruttivo (highlight sul canvas). La tipografia SlideFly richiede overlay DISTRUTTIVO (whiteout + re-typeset). Due fasi:

- **Fase A — «Documento di studio adattato» (reflow, robusto, MEDIO) → prima.** Pagina HTML stampabile dal testo fonte (`_corpus()`/`sourcesDict`) + semplificazione lessicale AI + raggruppamento per macro-area (già in ELABORA) + tipografia accessibile + highlight per area, esportata con l'infra MappAI. Perde l'impaginazione del PDF originale, ma è pulita, selezionabile, coerente BES/DSA.
- **Fase B — «Fedeltà impaginazione» (whiteout in-place + pdf-lib, ALTO, fragile) → dopo, opzionale.** Overlay completo dentro `_mountPdf` (maschere bianche + ricostruzione vettoriale da `getOperatorList` + `scaleX`/`pageShiftX`) + burn con pdf-lib. Alta fedeltà, tanti edge-case (tabelle/colonne).

**Riusare da MappAI**: `fetchModelAPI`+`getSystemKey`+`salvageTruncatedJSON`; REGISTRO+`classTuningPrompt`/`[VERDE]` come knob di semplificazione; `_coloredSentences`/`_sentColor`/`_groupColorOf` per gli highlight; `openPrintable`/`htmlToPdf`/`saveVaultFile`/`shareDocQr` per l'export; shell da `_buildSynthesisPrintHtml`/`MappAISynthesis.buildHtml` (topbar Space Mono + modalità dislessia + player audio); estendere `mappai-a11y.js`; TTS `MappAISynthesis.generateAudio`.

**Portare da SlideFly**: 2 prompt AI (semplificazione lessicale mono-token `{original,synonym,definition}` max ~20; tematizzazione — opzionale); flip-card vocabolario (match per singolo token normalizzato → vincolo sinonimo mono-parola); `@font-face` OpenDyslexic vendorizzato + classe `render-dyslexic` + slider spaziatura in `em`; Bionic (prefix-bold + fissazione 1–5). Solo Fase B: whiteout masks + ricostruzione vettoriale + pdf-lib.

**Passi Fase A**: (1) modulo `mappai-elabora-adapt.js`; (2) estendere `mappai-a11y.js` (OpenDyslexic, bionic, letter/word-spacing, persistiti localStorage); (3) bottone «Genera versione adattata» → 2 prompt AI (livello dal REGISTRO); (4) costruttore HTML stampabile (shell riusato + corpo reflow + flip-card + highlight per area + appendice glossario + audio); (5) export openPrintable/htmlToPdf + saveVaultFile + shareDocQr, branding MappAI (`giacomo@insegnai.ch`), MAI marchi SlideFly/tuxlab; (6) i18n bilingue + kill-switch.

## 4. Rischi
- Proxy Gemini/`?key=` di SlideFly → NON portare (privacy); usare il canale main-process di MappAI.
- Overlay distruttivo (Fase B) fragile; Fase A lo evita generando un doc reflow separato.
- Layout preservato solo in Fase B (pdf-lib); PDF a colonne/tabelle → rischio disallineamento dietro kill-switch.
- Matching lessicale mono-token: sinonimi multi-parola non agganciano.
- Infomaniak: niente `responseMimeType:"application/json"` (§6); temperature hardcoded 0.3 nel bridge.
- Fedeltà BES/DSA: la sostituzione lessicale AI può alterare il senso → mostrare originale + adattato affiancati (disciplina anti-parafrasi già usata nel deepening / citazioni verbatim del co-docente).

## 5. Sinergie — le 4 richieste = UNA pipeline
Base comune = `openPrintable`+`htmlToPdf`+`saveVaultFile`+`shareDocQr`, shell da `_buildSynthesisPrintHtml`. #1/#3/#4/#5 = varianti di corpo dentro lo stesso shell:
- **#1 (header/footer)** = la cornice dello shell (topbar/piè, paginazione, branding MappAI) → riusabile da tutti gli export. Farlo bene una volta serve #3/#4/#5 gratis.
- **#3 (export evidenziato)** = stesso doc con il layer highlight per macro-area (già calcolato) acceso → un flag.
- **#5 (doc per aree)** = unità organizzatrice = macro-area (il theme-grouping di SlideFly coincide col triage per area di ELABORA); #5 è #4 riordinato per area.
- **Appendice glossario** (originale→semplificato+definizione) = blocco condiviso #4/#5.

**Conclusione**: un solo modulo «Costruttore documento di studio adattato» con parametri (tipografia, highlight on/off, per-area, glossario, audio) copre #3/#4/#5; #1 è la cornice. Progettare prima lo shell (#1) + la pipeline di export, poi appenderci i corpi.

## File chiave MappAI
`public/js/mappai-elabora.js` (`_mountPdf`, `_paintPdfHighlights`, `_coloredSentences`, `_sentColor`, `_groupColorOf`) · `public/js/mappai-a11y.js` (a11y da estendere) · `public/js/mappai-branch-synthesis.js` (`_buildSynthesisPrintHtml`, `MappAISynthesis`) · `public/js/mappai-study-export-core.js` (`openPrintable`) · `public/js/mappai-live-classes.js` (`REGISTERS`) · `public/js/app.js` (`classTuningPrompt`, `[VERDE]`) · `main.js` (`html-to-pdf`, `save-vault-file`).
