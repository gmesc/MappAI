# Tasks: Affinamenti Output (002-affinamenti-output)

**Input**: spec.md, plan.md (D1–D3)

**Tests**: nessun test automatico nuovo (Complexity Tracking); suite esistente
deve restare verde.

---

## Phase 1: Setup

- [X] T001 Vendor `public/js/vendor/svg2pdf.umd.min.js` v2.2.4 (jsdelivr, MIT) + caricamento in `public/index.html` dopo `jspdf.umd.min.js`.

## Phase 2: Foundational

Nessuno — le 3 story sono indipendenti.

## Phase 3: US1 — PDF vettoriale (P1) 🎯 MVP

- [X] T002 [US1] In `public/js/mappai-d3-render.js`: rinominare il corpo attuale di `exportPDF` in `_exportPDFRaster()` (fallback, invariato); nuova `exportPDF` vettoriale: clone `#map-svg` + CSS inline (riuso logica exportSVG estratta in helper `_svgCloneWithStyles()`), reset transform zoom sul g clonato, viewBox = `getBBox()` del g originale + margine 40px, jsPDF formato [w,h] bbox, `await pdf.svg(clone, {x:0,y:0,width,height})`, save. Su throw → toast avviso + `_exportPDFRaster()`.
- [X] T003 [US1] `exportSVG` riusa `_svgCloneWithStyles()` (dedup della logica CSS-inline). Comportamento invariato.
- [ ] T004 [US1] Verifica Electron: PDF vettoriale (zoom nitido), intera mappa, zero UI, fallback su errore simulato.

## Phase 4: US2 — Sintesi mappa intera (P2)

- [X] T005 [US2] In `public/js/mappai-branch-synthesis.js`: opzione `__ALL__` "Tutta la mappa (N nodi)" nel select del modale.
- [X] T006 [US2] Flusso `__ALL__`: ≤30 nodi → chiamata unica su tutti i nodi (label = nome mappa). Altrimenti `_generateWholeMapSynthesis()`: loop rami (L1/hub) con overlay progresso (i/n), sezione per ramo via flusso esistente estratto in `_synthesizeOnce(nodes, label)`; ramo fallito → sezione segnaposto; chiamata finale panoramica (prompt inline + `mapLangNote()`, input = sintesi troncate a ~150 parole).
- [X] T007 [US2] Render modale risultato + stampa per la forma multi-sezione: panoramica in testa, poi sezioni "Ramo: X" ciascuna con le SUE citazioni. Forma singola invariata.
- [X] T008 [US2] i18n nuove stringhe via `window.t` + chiavi in `public/traduzioni/en_translations.js` (`bs_all_map`, `bs_overview`, `bs_progress`, `bs_branch_failed`, `bs_whole_title`).
- [ ] T009 [US2] Verifica Electron: mappa multi-ramo → panoramica + sezioni; mappa piccola → passata unica; stampa ok; ramo fallito non azzera il resto.

## Phase 5: US3 — Keyword foglie (P3)

- [X] T010 [US3] In `public/js/mappai-print-dossier.js`: `_cleanKeywords(node, arr)` (trim, dedupe ci, drop token del titolo, drop <3 char, cap 7) applicata a risultati AI E fallback.
- [X] T011 [US3] `_kwCallBatch`: item con flag `leaf` (nessun link uscente) e `descWords`; prompt esteso — foglie: concetti SOLO dalla desc, MAI parole del titolo, desc <15 parole → `[]`. Post-parse: `_cleanKeywords` su ogni voce.
- [X] T012 [US3] `_fallbackKeywords`: per foglie con desc <15 parole → `[]` (niente rumore); risultato passato comunque da `_cleanKeywords`.
- [ ] T013 [US3] Verifica Electron: foglio keywords con foglie ricche/povere secondo acceptance.

## Phase 6: Polish

- [X] T014 `npm test` verde + `node --check` sui file toccati.
- [X] T015 Aggiornare CLAUDE.md §11 (stato feature 002).
