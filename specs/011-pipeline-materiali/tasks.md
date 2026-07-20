# Tasks: Pipeline «Genera materiali»

**Input**: Design documents from `/specs/011-pipeline-materiali/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUSI per la logica pura (constitution VI: core UMD testati in Node, suite sempre verde). Niente TDD cerimoniale sull'UI: ogni fase chiude con checkpoint quickstart + suite.

**Organization**: task raggruppati per user story; Foundational = Fase 1 del piano (fondamenta headless), bloccante per tutte le story.

**⚠️ Vincolo utente (20/7/26)**: TUTTE le funzioni ben separate da `main.js` — gli handler IPC sono wrapper SOTTILI (I/O e finestre, zero logica di dominio); naming, sanitizzazione, manifest, validazioni e assemblaggio dati vivono nei moduli `mappai-*.js` / core UMD puri testabili in Node. Ogni task IPC lo ripete esplicitamente.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: scheletri moduli + baseline verde

- [X] T001 Creare scheletro UMD `public/js/mappai-pipeline-core.js` (pattern di `mappai-files-core.js`: factory UMD, export vuoto, console.log di caricamento) e registrarlo in `public/index.html` dopo `mappai-files-core.js`
- [X] T002 Creare scheletro `public/js/mappai-material-pipeline.js` (IIFE, namespace `window.MappAIPipeline` vuoto) e registrarlo in `public/index.html` dopo `mappai-landing-teach.js`
- [X] T003 Baseline: `npm test` verde (594+) e `node --check` sui due nuovi file — commit di partenza

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: fondamenta headless (Fase 1 del piano) — motori parametrici, IPC sottili, core puri. BLOCCA tutte le user story.

- [X] T004 [P] Estendere `public/js/mappai-files-core.js`: `mapClassFolder(sede, className)` (safeName di `<sede>-<classe>` | fallback `classFolder`), `vaultFolderName(rootLabel)` (fallback 'Mappa'), `sanitizeVaultRelPath(relPath)` (nega `..`/assoluti; consente solo root vault e `Materiale Studio/`) — logica QUI, non in main.js; estendere `tests/files-core.test.js` (con/senza sede, illegali, traversal)
- [X] T005 [P] Implementare `public/js/mappai-pipeline-core.js` (UMD puro, ZERO I/O): `createManifest(config)`, `stepTransition(manifest, step, status, extra)` con guardie (contracts/pipeline-manifest.md), `normalizeOnLoad(manifest)` (running→failed 'interrotto'), validatori `validateMapResult(db, minNodes)` / `validateQuizItems(items)` / `validatePdfB64(b64)` / `validateSynthesis(data)`, `estimateCalls(config, mapStats)`, `buildFileName(kind, label, tuned)` (nomi canonici + ` -VERDE`); nuovo `tests/pipeline-core.test.js` (transizioni ammesse/vietate, crash-detection, forward-compat campi ignoti, stima, nomi)
- [X] T006 `main.js`: handler `html-to-pdf` ({html, options} → BrowserWindow offscreen + `webContents.printToPDF` → {ok, base64}; cleanup in finally; WRAPPER SOTTILE — nessuna logica di dominio) + esposizione `htmlToPdf` in `public/js/preload.js` (contracts/ipc-contracts.md)
- [X] T007 `main.js`: handler `save-vault-file` ({vaultPath, relPath, base64|text} → writeFile; la sanitizzazione arriva da `FilesCore.sanitizeVaultRelPath` — main.js NON reimplementa regole) + esposizione `saveVaultFile` in `public/js/preload.js`
- [X] T008 `main.js`: handler `vault-materials-list` ({vaultPath} → files di `Materiale Studio/` + `pipeline.json` parse tollerante; wrapper sottile) + esposizione `vaultMaterialsList` in `public/js/preload.js`
- [X] T009 `main.js`: estendere `get-all-vaults` a 2 livelli (cartella con `index.yaml` = vault, senza = contenitore classe da scandire 1 livello; lista esclusioni `Chat`/`Quiz e Flashcard`/`Studio Attivo` come costante in `mappai-files-core.js`, main la importa; shape per-vault INVARIATA + campo opzionale `classDir`) — verificare con grep i consumer della risoluzione nome→path (`directLoadVault`, vault-manager)
- [X] T010 [P] Refactor `public/js/mappai-quiz-print.js`: estrarre builder puri `window.buildQuizSetHtml(set, opts)` / `window.buildFlashcardSetHtml(set, opts)` che RITORNANO la stringa HTML; `printQuizSet`/`printFlashcardSet` diventano consumer (window.open+write, output utente invariato) — contracts/headless-engines.md §1
- [X] T011 [P] Refactor `public/js/mappai-print-dossier.js`: `printAllNodeLabels(opts)` parametrica (depth/fmt/layout/bg/tuned/causal/toDisk; DOM = fallback quando opts assente; vincolo 3x4→title preservato; `toDisk` → base64 senza `doc.save`) — contracts/headless-engines.md §2
- [X] T012 [P] Refactor `public/js/mappai-branch-synthesis.js`: esporre `window.MappAISynthesis { runWholeMap({apiKey,tuned,silent}), buildHtml(data), generateAudio(data) }` avvolgendo le private `_generateWholeMapSynthesis`/`_buildSynthesisPrintHtml`/`_generateSynthesisAudioWithCues`; `silent:true` = niente overlay né modale risultato; flusso manuale invariato — contracts/headless-engines.md §3
- [X] T013 [P] Refactor `public/js/mappai-vault-io.js`: estrarre `window.buildVaultMapData()` dall'attuale `saveMapVault` (stessi campi); `saveMapVault` la riusa (comportamento invariato) — contracts/headless-engines.md §4
- [X] T014 [P] `public/js/mappai-usage-core.js`: categoria `pipeline` in CATS con sottovoci `map/quiz_mc/quiz_tf/flashcards/nodesheet/synthesis/tts`; aggiornare `tests/usage-core.test.js` se copre CATS
- [X] T015 Checkpoint Foundational: `node --check` su tutti i file toccati, `npm test` verde, debug-run Electron (`npm start`) — quickstart Fase 1 punti 1-6 (builder da console, htmlToPdf, foglio parametrico, sintesi silent, vault 2 livelli)

**Checkpoint**: fondamenta pronte — le user story possono partire.

---

## Phase 3: User Story 1 — Generare mappa + materiali in un colpo solo (Priority: P1) 🎯 MVP

**Goal**: fonte+classe → modale configurazione → pipeline A-D → tutto archiviato nel vault dentro la cartella di classe, quiz anche PDF.

**Independent Test**: quickstart Fase 2 punto 1 — pipeline completa su una fonte reale, verifica dei file su disco e del manifest 4×done.

- [X] T016 [US1] `public/js/mappai-material-pipeline.js`: modale full-screen «Genera materiali» — classe destinataria (attiva, cambiabile), 3 sezioni attivabili con sotto-opzioni (quiz: tipi V/F+MC+flashcard, perBranch 1-10, angolo da `window.buildQuizAngleOptions`; foglio nodi: maxLevel, fmt 3x4/2x2/2x1, modi multipli, catena; sintesi: audio on/off), toggle «Taratura AI [VERde]» + «Adatta al livello»; classi `.pm-*` + lucide + `safeCreateIcons`, bottoni `type="button"` (constitution, regole 10-11)
- [X] T017 [US1] Pre-flight + stima nel footer del modale: `PipelineCore.estimateCalls(config, mapStats)` ricalcolata a ogni cambio; check chiavi (provider attivo via `getSystemKey`; `gemini_api_key` per l'audio → se assente, audio deselezionato con avviso non bloccante FR-006); guardia «nessuna classe» (scelta esplicita o 'Senza classe')
- [X] T018 [US1] `public/index.html`: bottone «Genera materiali» nella sezione Costruisci accanto a Genera Mappa (visibile con ≥1 fonte caricata) → `MappAIPipeline.openModal()`; script tag già da T002
- [X] T019 [US1] Orchestratore step A in `mappai-material-pipeline.js`: arma `MappAITune.levelArmed` da config → `await startGeneration()` → `PipelineCore.validateMapResult(appState.db)` (MAI fidarsi dell'assenza di errori — research R7) → `folderPath = mapsBaseDir + mapClassFolder(cls.sede, cls.name) + vaultFolderName(rootLabel)` con suffisso `sessionSeq` su collisione → `electronAPI.saveVault({folderPath, mapData: buildVaultMapData()})` → manifest init + transizione A (scrittura via `saveVaultFile` a OGNI transizione, PRIMA dello step successivo)
- [X] T020 [US1] Step B: per ogni ramo L1 (MindMap) o hub (KG) × ogni tipo selezionato → `generateDynamicQuiz({angle, …})` / `FLASHCARD_GENERATOR`; `MappAITune.armed = config.tuned` per la durata dello step (ripristino in finally); set in `appState.db.studySets` + risalvataggio vault (i set persistono); `buildQuizSetHtml(set)` → `htmlToPdf` → `saveVaultFile('Materiale Studio/<buildFileName>')`; manifest B con files+calls
- [X] T021 [US1] Step C: per ogni modo selezionato → `printAllNodeLabels({depth, fmt, layout, bg, tuned, causal, toDisk:{vaultPath}})` → base64 → `saveVaultFile`; manifest C
- [X] T022 [US1] Step D: `MappAISynthesis.runWholeMap({apiKey, tuned, silent:true})` → `validateSynthesis` → `buildHtml(data)` → `saveVaultFile('Materiale Studio/Sintesi….html')`; se audio richiesto: `generateAudio(data)` → MP3 base64 → `saveVaultFile` (fallimento audio = degrado con nota nel manifest, NON step failed — FR-006); manifest D
- [X] T023 [US1] Avanzamento + riepilogo: overlay per step durante l'esecuzione; riepilogo finale con stato per step e «Apri cartella» (shell); lock `MappAIPipeline._running` (una pipeline per volta, Avvia disabilitato); `MappAIUsage.setContext('pipeline', <sub>)` a inizio di ogni step
- [X] T024 [P] [US1] i18n: tutte le stringhe nuove `window.t('mp_*','fallback IT')` + chiavi in `public/traduzioni/en_translations.js`; eventuali `data-i18n` statici in ENTRAMBI i dizionari (regola 13)
- [ ] T025 [US1] Checkpoint US1: quickstart Fase 2 punti 1, 2, 5, 6, 9, 10 (happy path, riuso set in app/Live, degrado voce, collisione ` · 02`, taratura VERDE, consumi) + suite verde

**Checkpoint**: MVP funzionante — pipeline completa su mappa reale.

---

## Phase 4: User Story 2 — Non perdere mai il materiale generato (Priority: P1)

**Goal**: ripresa idempotente dopo crash + riprova per singolo step.

**Independent Test**: quickstart Fase 2 punti 3-4 — kill dell'app a metà step C → ripresa senza rigenerare A/B; rete giù su D → Riprova solo D.

- [ ] T026 [US2] Ripresa in `mappai-material-pipeline.js`: all'apertura di un progetto/vault con `pipeline.json` non tutto-done → `PipelineCore.normalizeOnLoad` (running→failed) → prompt «Riprendi la pipeline?» → orchestratore salta gli step `done` (zero chiamate AI ripetute — verificabile dai `calls` del manifest)
- [ ] T027 [US2] «Riprova» nel riepilogo: bottone sul singolo step `failed` → transizione failed→running → riesecuzione SOLO di quello step; output degli step riusciti intoccati (B/C/D indipendenti — richiedono solo A done)
- [ ] T028 [US2] Audit file-first nell'orchestratore: ogni file entra in `manifest.files` SOLO dopo scrittura riuscita; transizione a `done` dopo l'ultimo file; aggiungere in `tests/pipeline-core.test.js` i casi mancanti (riprova su failed, skip su done, B senza A → vietato)
- [ ] T029 [US2] Checkpoint US2: quickstart Fase 2 punti 3-4 eseguiti dal vivo + suite verde

**Checkpoint**: crash-safety dimostrata.

---

## Phase 5: User Story 3 — Preset riusabili (Priority: P2)

**Goal**: salvare/applicare/gestire configurazioni di output, senza classe.

**Independent Test**: quickstart Fase 2 punto 7 — preset applicato su un'altra classe riproduce le opzioni.

- [ ] T030 [P] [US3] `mappai-pipeline-core.js`: `presetNormalize(record)` (schema v1, opzioni ignote→default, cap 50 FIFO) + `presetFromConfig(config)` (STRIPPA classId/className/sede) — puri, test in `tests/pipeline-core.test.js`
- [ ] T031 [US3] UI preset nel modale (`mappai-material-pipeline.js`): «Salva preset» (nome), tendina/menu gestione (applica, rinomina, elimina) su localStorage `mappai_material_presets`; avviso non bloccante su opzioni degradate; i18n relative
- [ ] T032 [US3] Checkpoint US3: quickstart Fase 2 punto 7 + suite verde

---

## Phase 6: User Story 4 — Sede di lavoro sulla classe (Priority: P2)

**Goal**: campo sede sulla classe → cartelle `[sede]-[classe]`.

**Independent Test**: quickstart Fase 2 punto 8 — nick sede nel profilo → tendina nel form classe → cartella col prefisso.

- [ ] T033 [P] [US4] `public/js/mappai-live-classes.js`: campo `sede` nei DUE form (`renderCreate` E `renderEdit` — form separati, entrambi): tendina da `MappAITeacherProfile.sediList()` + opzione vuota, visibile solo se `sediList().length > 0`; lettura/salvataggio nel handler esistente; i18n chiave `cls_sede`
- [ ] T034 [US4] Wiring pipeline: la config denormalizza `cls.sede` all'avvio e `mapClassFolder(sede, className)` la usa (helper già pronto da T004) — verifica end-to-end del naming con e senza sede
- [ ] T035 [US4] Checkpoint US4: quickstart Fase 2 punto 8 + suite verde

---

## Phase 7: User Story 5 — Insegna: selezione mappa e filtri (Priority: P3)

**Goal**: click riga = seleziona; sezioni filtrate per mappa; materiali della pipeline elencati da disco.

**Independent Test**: quickstart Fase 3 — selezione/deselezione, filtri sulle 3 sezioni, kill-switch, apertura materiali da disco.

- [ ] T036 [P] [US5] `public/js/mappai-teach-core.js`: helper puro `matchesSelectedProject(item, sel)` (match per projectId poi mapName, regole per tipo item) — test in `tests/teach-core.test.js`
- [ ] T037 [US5] `public/js/mappai-landing-teach.js`: click riga in `renderProjects()` = selezione (`MappAITeach._selectedProject`, evidenzia, secondo click deseleziona); apertura SOLO dal bottone «Riprendi»; kill-switch `mappai_teach_row_select='0'` = click-apre storico (constitution II)
- [ ] T038 [US5] `mappai-landing-teach.js`: con selezione attiva filtrare Materiali (mapName), Attività (r.map), File condivisi (nuovo metadato); sezione Materiali fonde l'archivio localStorage con i file su disco via `vaultMaterialsList` (voci derivate per-vault della classe; apertura file disco via IPC shell esistente)
- [ ] T039 [US5] Metadato mappa sui file condivisi caricati dalla pipeline: pass-through `mapName` nell'IPC sharedmat di upload + rendering del chip; i file storici senza metadato appaiono solo senza selezione (FR-023)
- [ ] T040 [US5] Checkpoint US5: quickstart Fase 3 punti 1-5 (selezione, kill-switch, materiali da disco, condivisi, regressioni filtro classe/Costruisci) + i18n nuove stringhe + suite verde

---

## Phase 8: Polish & Cross-Cutting

- [ ] T041 [P] Aggiornare `CLAUDE.md` §11 (stato feature 011: cosa fatto, flag/kill-switch, cosa resta da testare in Electron vivo)
- [ ] T042 Audit i18n completo regola 13 (ogni `data-i18n` in entrambi i dizionari; ogni `t()` in en_translations) + conformità modali (lucide, mai emoji nei titoli)
- [ ] T043 Validazione finale: quickstart.md completo, `npm test` verde, debug-run Electron; verifica che i flussi manuali storici (stampa quiz, foglio nodi da modale, sintesi manuale, saveMapVault con dialog) siano INVARIATI

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → story in ordine di priorità.
- **US1 (MVP)**: richiede TUTTO il Foundational (T004-T015).
- **US2**: richiede US1 (orchestratore + manifest scritti da US1).
- **US3**: richiede US1 (modale); indipendente da US2.
- **US4**: richiede solo T004 (helper naming) + il form classi; testabile senza pipeline (campo+persistenza), il naming end-to-end richiede US1.
- **US5**: richiede T008 (`vault-materials-list`) e materiali su disco per il test completo (US1); il click-selezione (T037) è testabile da solo.
- **Polish**: dopo le story desiderate.

### Parallel Opportunities

- Foundational: T004, T005 (core puri) ∥ T010, T011, T012, T013, T014 (refactor su file diversi); T006-T009 sequenziali su main.js/preload (stesso file).
- US1: T024 (i18n) ∥ ai task orchestratore; T016-T018 (UI) prima di T019-T023.
- T030 (US3), T033 (US4), T036 (US5) sono [P] tra loro (file diversi) una volta chiuso US1.

## Implementation Strategy

**MVP first**: Setup → Foundational → US1 → STOP e validazione quickstart → poi US2 (crash-safety, stessa priorità P1) → US3/US4 → US5 per ultima (cambia un comportamento esistente, kill-switch pronto). Ogni fase: commit + suite verde + parse-check (constitution II/VI). Un commit per task o gruppo logico.
