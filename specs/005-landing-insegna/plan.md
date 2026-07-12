# Implementation Plan: Landing "Costruisci / Insegna"

**Branch**: `005-landing-insegna` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-landing-insegna/spec.md`

## Summary

Eliminare il launcher di scelta all'avvio (boot diretto sulla landing MappAI,
kill-switch documentato in `userData/mappai-settings.json`) e sdoppiare la landing
in due modalità con toggle persistito: **Costruisci** (strumenti di generazione
attuali + sezione progetti collassabile con assegnazione grade) e **Insegna**
(sezioni collassabili Progetti/Materiali/Quiz&flashcard con filtro classe attiva +
tre quick-start QR che portano dal click al wizard dell'attività in ≤ 4 interazioni).
Fonti dati nuove: registro sessioni (localStorage), campo `grade` sui progetti,
indice leggero dei set quiz/flashcard scritto al salvataggio, archivio documenti
esteso a fogli nodi e timeline (cap 30). Approccio: 1 modulo core puro UMD testato
(`mappai-teach-core.js`) + 1 modulo UI (`mappai-landing-teach.js`) + ritocchi
chirurgici a main.js, index.html, storage-lang, study-export-core, print-dossier,
timeline, live/collab-teacher.

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer Vanilla JS, script globali `window.*`, NO moduli ES); Node.js (Electron 30 main process)

**Primary Dependencies**: Electron 30, D3.js v7, Tailwind CDN runtime, Lucide icons, qrcode-generator (vendored). Nessuna dipendenza nuova.

**Storage**: localStorage (`tutor_ai_projects` + snapshot per-progetto, `mappai_saved_documents`, nuovi `mappai_session_registry` / `mappai_studysets_index` / `mappai_landing_mode` / `mappai_teach_class_filter`); file `<userData>/mappai-settings.json` (kill-switch launcher, letto dal main)

**Testing**: `npm test` (node --test, suite attuale 361/361); nuovo `tests/teach-core.test.js` per il core puro; debug-run Electron (`npm start`) dopo ogni batch

**Target Platform**: macOS/Windows/Linux desktop (Electron); vincolo architetturale iPadOS (astrazione IPC) annotato, non requisito

**Project Type**: desktop-app (Electron, renderer senza build step)

**Performance Goals**: landing Insegna renderizzata da soli metadati (mai riparsare snapshot progetto, possono pesare MB); quick-start ≤ 4 interazioni (SC-001)

**Constraints**: reversibilità (kill-switch launcher; nuove superfici additive); hero della landing INTATTA; comportamento Costruisci invariato (FR-006); i18n bilingue (regola 13); suite verde

**Scale/Scope**: ~10-50 progetti per docente, ~400 voci registro (cap FIFO), 30 documenti archiviati, ~4-10 classi

## Constitution Check

*GATE: verificato contro Constitution v1.0.0 — PASS (pre-research e post-design).*

| Principio | Esito | Note |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ | Feature lato docente; sezioni collassabili riducono il carico visivo (richiesta anti-sovraccarico già emersa per gli hub); stati vuoti con testo esplicito, mai solo colore; tooltip `data-tip` |
| II. Reversibilità e gradualità | ✅ | Launcher: bypass con kill-switch `mappai-settings.json` documentato, file e IPC intatti; registro/indice/grade = dati additivi; nessun dato esistente migrato distruttivamente |
| III. Script globali, no build | ✅ | `mappai-teach-core.js` (UMD) + `mappai-landing-teach.js` su `window.*`, caricati dopo app.js prima di admin_prompts.js; pattern `_getAppState()`; bottoni `type="button"` |
| IV. Dual-provider AI | ✅ N/A | Nessuna chiamata AI in questa feature (solo riuso di materiali già generati) |
| V. Integrità vault (DAL) | ✅ | Il vault NON viene toccato: grade/registro/indice vivono in localStorage; `p.vault` resta il collegamento esistente |
| VI. Logica pura testata | ✅ | Ranking mappe, normGrade, registro, indice = funzioni pure in UMD con test Node; suite deve restare verde |
| VII. i18n bilingue | ✅ | Chiavi `data-i18n` nei DUE dizionari per l'HTML statico; `window.t(k, fallback IT)` per le stringhe JS |

Nessuna violazione → tabella Complexity Tracking vuota.

## Project Structure

### Documentation (this feature)

```text
specs/005-landing-insegna/
├── spec.md              # Specifica (approvata dall'utente 12/7/26)
├── plan.md              # Questo file
├── research.md          # Fase 0 — decisioni R1-R10
├── data-model.md        # Fase 1 — entità e store
├── quickstart.md        # Fase 1 — guida di validazione manuale
├── contracts/
│   └── storage-and-api.md  # Schemi localStorage + API window.* esposte
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
main.js                                  # MODIFICA: whenReady → createWindow();
                                         #   lettura sync mappai-settings.json (kill-switch)
public/
├── index.html                           # MODIFICA: barra toggle sotto hero; wrapper
│                                        #   #build-content / #teach-content; rimozione
│                                        #   markup drawer #projects-bar; sezione progetti
│                                        #   collassabile in Costruisci; script tag nuovi moduli
├── js/
│   ├── mappai-teach-core.js             # NUOVO (UMD puro): normGrade, registryAdd/prune,
│   │   #   classesForMap, rankMapsForClass, buildSetsIndex, filterByClass
│   ├── mappai-landing-teach.js          # NUOVO (UI): toggle modalità, sezioni Insegna,
│   │   #   picker classe/mappa/documento, quickStart('collab'|'materials'|'live'),
│   │   #   menu grade in Costruisci
│   ├── mappai-storage-lang.js           # MODIFICA: renderRecentProjects parametrizzata
│   │   #   (contenitore + opts gradeMenu/classChips); saveCurrentProject scrive
│   │   #   mappai_studysets_index; campo grade su pMeta
│   ├── mappai-study-export-core.js      # MODIFICA: DOCS_CAP 30; kind nodesheet/timeline
│   ├── mappai-print-dossier.js          # MODIFICA: hook archivio su Foglio nodi
│   ├── mappai-timeline.js               # MODIFICA: hook archivio su _renderTimeline
│   ├── mappai-live-teacher.js           # MODIFICA: espone MappAILive.openSetup/
│   │   #   openMaterials; registryAdd all'avvio sessione live/materiali
│   └── mappai-collab-teacher.js         # MODIFICA: registryAdd all'avvio sessione lavagna
└── traduzioni/
    ├── it_translations.js               # MODIFICA: chiavi data-i18n nuove
    └── en_translations.js               # MODIFICA: chiavi data-i18n + chiavi t()
tests/
└── teach-core.test.js                   # NUOVO: test del core puro
```

**Structure Decision**: si segue l'architettura consolidata del repo — moduli
`mappai-*.js` a script globali nel renderer, logica pura estratta in UMD testabile
(Principio VI), modifiche chirurgiche ai moduli esistenti elencati sopra. Nessuna
nuova cartella; il main process riceve solo il bypass del launcher.

## Design decisions (da research.md)

1. **R1 Launcher**: `whenReady → createWindow()`; kill-switch `{"legacyLauncher":true}`
   in `<userData>/mappai-settings.json` (letto sync con try/catch); `launcher.html`,
   `createLauncherWindow`, IPC `launcher-return` intatti.
2. **R2 Toggle**: wrapper `#build-content`/`#teach-content` sotto hero intatta;
   `mappai_landing_mode` in localStorage, default `build`.
3. **R3 Registro**: `mappai_session_registry` (cap 400 FIFO), scritto all'avvio
   riuscito di Lavagna / Live / Materiali; helper puri nel core.
4. **R4 Grade**: campo libero `grade` su `tutor_ai_projects`; confronto con
   `normGrade` (NFKD, ª→a, case/spazi); menu propone i grade delle classi esistenti.
5. **R5 Indice set**: `mappai_studysets_index` rigenerato per il progetto corrente
   dentro `saveCurrentProject` da `appState.db.studySets` in memoria — mai
   riparsare snapshot. Guardia Studio-attivo già esistente copre l'indice.
6. **R6 Archivio**: cap 12→30; nuovi kind `nodesheet`/`timeline`; hook nei due
   generatori; quota-guard esistente riusata.
7. **R7 Quick-start**: Lavagna e Live richiedono mappa caricata → classe → mappa
   (ranking) → `loadProject` sincrono → hub/wizard. Materiali non richiede mappa →
   classe → documento archiviato → `publishHtml` → pannello QR. `openSetup`/
   `openMaterials` esposte con one-liner su `MappAILive`.
8. **R8 Rendering**: `renderRecentProjects(container, opts)` unica per le due
   modalità (opts: `gradeMenu`, `classChips`); markup drawer rimosso.
9. **R9 Moduli**: 1 core UMD + 1 modulo UI; ordine di load core → UI.
10. **R10 i18n**: regola 13 senza eccezioni.

## Complexity Tracking

Nessuna violazione della costituzione — tabella vuota.
