# Implementation Plan: Pipeline «Genera materiali»

**Branch**: `011-pipeline-materiali` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-pipeline-materiali/spec.md`

## Summary

Pipeline a 4 step crash-safe (A mappa → B quiz/flashcard → C fogli nodi → D sintesi+voce) orchestrata sopra i motori ESISTENTI, con archiviazione su disco nel vault dentro cartelle di classe `[sede]-[classe]`. Approccio: la pipeline è un orchestratore sottile (`mappai-material-pipeline.js`) + un core puro testabile (`mappai-pipeline-core.js`); il grosso del lavoro tecnico è rendere «headless» i 3 motori oggi accoppiati alla UI (fogli nodi, sintesi, stampa quiz) e aggiungere 3 capacità al main process (PDF da HTML via `printToPDF`, listing materiali del vault, scansione vault a 2 livelli). Consegna in 3 fasi committabili: fondamenta → pipeline → Insegna.

## Technical Context

**Language/Version**: JavaScript — main process Node (Electron 39.8.10), renderer Vanilla JS a script globali `window.*` (NO bundler, NO ES modules — constitution III)

**Primary Dependencies**: Electron 39 (IPC, `webContents.printToPDF`), jsPDF (fogli nodi, invariato), lamejs (MP3 voce, già vendored), Gemini API + Infomaniak via `fetchModelAPI` (testi), Gemini TTS via `generateGemini` diretto (voce, Google-only), motori esistenti: `startGeneration`, `generateDynamicQuiz` (+ `QUIZ_ANGLES`), `printAllNodeLabels`, `_synthesizeOnce`/`_generateWholeMapSynthesis`, `MappAICausal`, `MappAITune`, `MappAIUsage`, `MappAITeacherProfile`, `MappAIClasses`, `MappAIFilesCore`

**Storage**: filesystem — vault Obsidian-compatibili sotto `mapsBaseDir()` (storico `~/Documents/MappAI - Vault/` o organizzato `<root>/MappAI - file/Mappe/`); materiali in `<vault>/Materiale Studio/`; manifest `<vault>/pipeline.json`; localStorage SOLO per preset (`mappai_material_presets`) e stato UI — MAI per i blob della pipeline (quota)

**Testing**: `node --test` (suite attuale 594/594); nuova logica pura in moduli UMD testabili in Node (constitution VI)

**Target Platform**: desktop Electron (macOS/Windows/Linux). La voce naturale richiede desktop + chiave Google (già così oggi). Niente superfici studente toccate

**Project Type**: desktop-app (Electron, renderer vanilla)

**Performance Goals**: nessun requisito real-time; pipeline = N chiamate AI sequenziali (stima mostrata prima dell'avvio); scrittura su disco per step ≪ 1s; UI mai bloccata (overlay avanzamento)

**Constraints**: crash-safe per step (manifest + ripresa idempotente); zero migrazione dei vault esistenti; dual-provider per i testi (constitution IV), Google-only accettato per la sola voce; retrocompatibilità vault (constitution V); i18n bilingue (constitution VII); click-selezione in Insegna dietro kill-switch (constitution II)

**Scale/Scope**: mappe 30–100 nodi, 3–8 rami L1; per pipeline ~5–20 file prodotti; audio MP3 ~0,5 MB/min (5–15 min tipici); preset ~decine; cartelle classe ~5–15 per docente

## Constitution Check

*GATE: verificato contro constitution v1.0.0 (principi I–VII). Ri-verificato dopo Phase 1 — invariato.*

| Principio | Esito | Note |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ PASS | La pipeline riusa i motori esistenti già conformi (quiz con regole BES/DSA nel prompt, fogli nodi con sillabazione, sintesi con voce). Nessuna nuova superficie di studio: solo orchestrazione + archiviazione |
| II. Reversibilità e gradualità | ✅ PASS | 3 fasi committabili; pipeline = bottone NUOVO (additivo); l'unico cambio di comportamento esistente (click riga Insegna → selezione, FR-020) è dietro kill-switch `mappai_teach_row_select='0'` che ripristina il click-apre storico; manifest e cartelle classe additivi; nessuna migrazione |
| III. Script globali no-build | ✅ PASS | Nuovi moduli `mappai-pipeline-core.js` (UMD puro) + `mappai-material-pipeline.js` (UI), caricati in index.html dopo `app.js`; refactor dei motori = stesse superfici `window.*` con opzioni aggiuntive, mai ES modules |
| IV. Dual-provider AI | ✅ PASS (nota) | Testi (mappa, quiz, keyword, sintesi) via `fetchModelAPI` → entrambi i provider. La VOCE è Google-only: status quo del motore TTS esistente, non una regressione; pre-flight con degrado esplicito (FR-006). Nessun `responseMimeType` nei payload Infomaniak (invariato nei motori riusati) |
| V. Integrità vault (DAL) | ✅ PASS | Scritture additive: `Materiale Studio/` (già preservata da `save-vault`) + `pipeline.json`; percorsi RELATIVI nel manifest; suffisso progressivo anti-sovrascrittura (FR-018); vault legacy flat intoccati e ancora scoperti da `get-all-vaults` esteso (FR-019) |
| VI. Logica pura testata | ✅ PASS | `mappai-pipeline-core.js` UMD puro: naming cartelle/file, schema+transizioni manifest, stima chiamate, validazione risultato step, merge indice materiali → `tests/pipeline-core.test.js`; estensioni a `files-core` in `tests/files-core.test.js`. Suite verde a ogni fase |
| VII. i18n bilingue | ✅ PASS | Stringhe nuove: `window.t('chiave','fallback IT')` + chiave in `en_translations.js`; eventuali `data-i18n` statici in ENTRAMBI i dizionari (regola 13) |

**Esito gate**: PASS — nessuna violazione da giustificare (Complexity Tracking vuoto).

## Project Structure

### Documentation (this feature)

```text
specs/011-pipeline-materiali/
├── spec.md              # Specifica (fatta)
├── plan.md              # Questo file
├── research.md          # Phase 0 — decisioni tecniche consolidate (ricognizione multi-agente 20/7)
├── data-model.md        # Phase 1 — entità: preset, manifest, indice materiali, classe estesa
├── quickstart.md        # Phase 1 — scenari di validazione per fase
├── contracts/
│   ├── ipc-contracts.md         # Nuovi handler IPC + estensioni (main.js/preload.js)
│   ├── pipeline-manifest.md     # Schema pipeline.json@1 + regole di ripresa
│   └── headless-engines.md      # Firme dei motori resi parametrici
└── tasks.md             # Phase 2 (/speckit-tasks — NON prodotto da /speckit-plan)
```

### Source Code (repository root)

```text
# FASE 1 — Fondamenta headless
public/js/mappai-pipeline-core.js      # NUOVO — UMD puro: naming, manifest, stima, validazioni
public/js/mappai-files-core.js         # ESTESO — mapClassFolder(sede, classe), vaultSeq (suffisso progressivo)
public/js/mappai-quiz-print.js         # REFACTOR — builder puri buildQuizSetHtml/buildFlashcardSetHtml (ritornano stringa); window.open resta come consumer
public/js/mappai-print-dossier.js      # REFACTOR — printAllNodeLabels(opts) parametrica (DOM = fallback); output PDF anche base64 per salvataggio su disco
public/js/mappai-branch-synthesis.js   # REFACTOR — espone window.MappAISynthesis { runWholeMap(opts), buildHtml(data), generateAudio(data) } (oggi private nell'IIFE)
main.js                                # NUOVI IPC: 'html-to-pdf' (printToPDF), 'vault-materials-list', 'save-vault-file'; 'get-all-vaults' esteso a 2 livelli
public/js/preload.js                   # Esposizione nuovi IPC
tests/pipeline-core.test.js            # NUOVO
tests/files-core.test.js               # ESTESO

# FASE 2 — Pipeline
public/js/mappai-material-pipeline.js  # NUOVO — modale full-screen, preset, orchestratore a step, riepilogo/riprova
public/js/mappai-live-classes.js       # Campo «sede» nei form renderCreate + renderEdit
public/index.html                      # Bottone «Genera materiali» (Costruisci) + script tag nuovo modulo
public/traduzioni/it_translations.js   # Chiavi statiche (se data-i18n)
public/traduzioni/en_translations.js   # Tutte le chiavi nuove

# FASE 3 — Insegna
public/js/mappai-landing-teach.js      # Selezione mappa (click=seleziona, kill-switch), filtri sezioni, listing materiali da disco
public/js/mappai-teach-core.js         # Helper puri di filtro per mappa (testati)
tests/teach-core.test.js               # ESTESO
```

**Structure Decision**: pattern consolidato del repo — «core puro UMD + modulo UI», entrambi script globali caricati dopo `app.js` (constitution III, VI). Nessuna nuova cartella: moduli in `public/js/`, test in `tests/`, IPC in `main.js`/`preload.js`.

## Complexity Tracking

Nessuna violazione della constitution — tabella vuota.
