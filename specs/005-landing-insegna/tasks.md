# Tasks: Landing "Costruisci / Insegna"

> **STATO (12/7/26): implementazione completa, verificata in browser.**
> Tutte le fasi 1-8 implementate (core+UI+HTML+main.js+archivio+i18n). Suite **379/379** ✅.
> Verificato in browser (static server, license gate bypassato lato-DOM): toggle+persistenza,
> teach mode (chip classe, quick-start picker classe→mappa 3 fasce, modale grade), build mode
> (form + sezione progetti + grade), zero errori console.
> **PENDENTI = solo i task di debug-run Electron vivo** (T010, T017, T021, T023, T027, T030):
> richiedono `npm start` con licenza valida — vedi [quickstart.md](quickstart.md).

**Input**: Design documents from `/specs/005-landing-insegna/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/storage-and-api.md, quickstart.md

**Tests**: inclusi per il core puro (obbligo Constitution VI: logica pura in UMD testata, suite sempre verde). Nessun test DOM: la UI si valida con debug-run Electron (quickstart.md).

**Organization**: task raggruppati per user story; ogni fase è un incremento consegnabile e reversibile da solo (Constitution II).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizzabile (file diversi, nessuna dipendenza da task incompleti)
- **[Story]**: US1..US5 dalla spec

## Path Conventions

Repo Electron a script globali: sorgenti in `public/js/`, test Node in `tests/`, main process in `main.js` (root). Vedi plan.md § Project Structure.

---

## Phase 1: Setup

**Purpose**: scheletri dei due moduli nuovi + caricamento in index.html

- [ ] T001 [P] Crea `public/js/mappai-teach-core.js` — scheletro UMD puro (pattern dei core esistenti: factory esportata su `window.MappAITeachCore` E `module.exports` per Node; zero DOM/localStorage), con firme vuote da contracts §1
- [ ] T002 [P] Crea `public/js/mappai-landing-teach.js` — scheletro UI (`window.MappAITeach = {init, setMode, refresh, quickStart}` stub; guard `_getAppState()`; `_t(k,f)` locale)
- [ ] T003 Aggiungi i due `<script>` in `public/index.html` dopo gli altri moduli mappai-* e prima di `admin_prompts.js` (core PRIMA della UI)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: core puro testato + impalcatura HTML della landing sdoppiata

**⚠️ CRITICAL**: nessuna user story parte prima del completamento di questa fase

- [ ] T004 Implementa in `public/js/mappai-teach-core.js` le funzioni pure di contracts §1: `normGrade` (NFKD, minuscole, ª/°→a, spazi collassati), `registryAdd` (immutabile, cap 400 FIFO), `classesForMap` (dedup, ignora cls null, match projectId poi map), `rankMapsForClass` (3 fasce {started, sameGrade, others}), `buildSetsIndex` (sostituisce le voci del projectId, preserva le altre), `filterByClass` (match per cls / registro / normGrade; activeCls null o "Generico" → invariato)
- [ ] T005 Crea `tests/teach-core.test.js` (node --test): equivalenze normGrade ("1ª  Media" ≡ "1a media", "2°A" ≡ "2a a"), registryAdd cap+non-mutazione, classesForMap con voci legacy senza projectId, rankMapsForClass con progetti senza grade (finiscono in others, totale mai vuoto), buildSetsIndex merge, filterByClass (attiva/Generico/null) — poi `npm test` verde
- [ ] T006 In `public/index.html`: barra toggle statica sotto l'hero (Costruisci/Insegna + toggle filtro classe, `data-i18n`, bottoni `type="button"`); wrapper `#build-content` attorno a TUTTO il contenuto landing esistente sotto l'hero e `#teach-content` vuoto (hidden); dentro `#build-content` sezione collassabile `#build-projects-section` (chiusa di default) con contenitore `#recent-projects-container`; RIMOZIONE del markup drawer `#projects-bar`; chiavi `ui_landing_build`, `ui_landing_teach`, `ui_teach_filter_all`, `ui_teach_filter_class`, `ui_build_projects` (+`tt_*`) in ENTRAMBI `public/traduzioni/it_translations.js` e `public/traduzioni/en_translations.js`

**Checkpoint**: suite verde; landing renderizza (modalità build identica a prima, hero intatta)

---

## Phase 3: User Story 1 — Avvio diretto e doppia modalità (Priority: P1) 🎯 MVP

**Goal**: boot senza launcher, toggle persistito, Costruisci invariato con sezione progetti collassabile, Garden dal menu

**Independent Test**: quickstart §1-§2 (parte non-grade)

- [ ] T007 [US1] In `main.js`: `app.whenReady()` e `app.on('activate')` chiamano `createWindow()`; lettura sync con try/catch di `<userData>/mappai-settings.json` — se `legacyLauncher === true` → `createLauncherWindow()` (comportamento storico); `launcher.html`, `createLauncherWindow`, IPC `launcher-choice`/`launcher-return` INTATTI; commento con kill-switch documentato
- [ ] T008 [US1] In `public/js/mappai-landing-teach.js`: `init()` su DOMContentLoaded — legge `mappai_landing_mode` (default `'build'`), mostra/nasconde `#build-content`/`#teach-content`, aggancia il toggle; `setMode(m)` persiste e commuta; `safeCreateIcons()` dopo ogni render
- [ ] T009 [US1] In `public/js/mappai-storage-lang.js`: `renderRecentProjects(container?, opts?)` retrocompatibile (default = `#recent-projects-container` nella sezione di Costruisci, stesso layout tabellare, azioni Riprendi/Elimina invariate); rimuovi `window.toggleProjectsBar` e ogni riferimento residuo al drawer (grep `projects-bar|toggleProjectsBar` su public/)
- [ ] T010 [US1] Debug-run Electron (`npm start`): boot diretto, toggle persiste al riavvio, primo avvio → Costruisci, hero identica, menu → Knowledge Garden apre Studio, kill-switch `{"legacyLauncher":true}` ripristina il launcher, uscita segreta 5-click funziona, sezione progetti si apre/chiude e carica un progetto

**Checkpoint**: US1 consegnabile da sola (landing nuova, Insegna ancora vuota è accettabile)

---

## Phase 4: User Story 2 — Avvio rapido attività QR (Priority: P1) 🎯 MVP

**Goal**: 3 bottoni quick-start → classe → mappa/documento filtrati → caricamento implicito → wizard; registro sessioni scritto

**Independent Test**: quickstart §4

- [ ] T011 [P] [US2] In `public/js/mappai-live-teacher.js`: esponi `window.MappAILive.openSetup = openLiveSetup` e `window.MappAILive.openMaterials = openMaterialsPanel` (one-liner accanto a publishHtml)
- [ ] T012 [US2] In `public/js/mappai-landing-teach.js`: picker classe (modale `.pm-*` + Lucide + `safeCreateIcons`): lista `MappAIClasses.list()` con nome+grade, opzione "Continua senza classe"; se zero classi → CTA "Crea una classe" (`openClassAccountsModal`) + "Continua senza classe" (FR-021)
- [ ] T013 [US2] In `public/js/mappai-landing-teach.js`: picker mappa a 3 fasce via `MappAITeachCore.rankMapsForClass` (intestazioni fascia: "Già usate con la classe" / "Stesso grade" / "Altre mappe", tutte selezionabili — FR-020); picker documento per Materiali da `MappAIStudyDocs.list()` (filtro classe/grade soft, tutte visibili); empty state con testo esplicito mai bloccante
- [ ] T014 [US2] In `public/js/mappai-landing-teach.js`: `quickStart(kind)` — `'collab'`: classe → mappa → `StorageManager.loadProject(id)` → `window.openCollabHub()`; `'live'`: classe → mappa → `loadProject` → `MappAILive.openSetup()`; `'materials'`: classe → documento → `MappAILive.publishHtml(doc)` → `MappAILive.openMaterials()`; 3 bottoni quick-start renderizzati in cima a `#teach-content` (chiavi `ui_qs_collab/materials/live` nei due dizionari)
- [ ] T015 [US2] Scrittura registro (contracts §5) all'avvio RIUSCITO: in `public/js/mappai-collab-teacher.js` (dopo `collab-start-session` ok), in `public/js/mappai-live-teacher.js` (dopo `live-start-session` ok e alla pubblicazione materiali); helper `_regRead/_regWrite` (localStorage `mappai_session_registry`) in mappai-landing-teach.js esposti come `window.MappAITeach._registry` per i due moduli
- [ ] T016 [US2] Eredità grade (FR-022): in `quickStart`, progetto scelto senza `grade` + classe con grade → scrivi `p.grade` in `tutor_ai_projects`; in `public/js/mappai-storage-lang.js` `saveCurrentProject` PRESERVA `p.grade` esistente nel rebuild di pMeta (altrimenti ogni autosave lo cancellerebbe)
- [ ] T017 [US2] Debug-run Electron quickstart §4: lavagna/live/materiali in ≤4 interazioni, flusso senza classi, registro scritto (`localStorage.mappai_session_registry` da console)

**Checkpoint**: MVP completo (US1+US2) — il docente avvia la lezione in pochi click

---

## Phase 5: User Story 3 — Sezioni Insegna e filtro classe (Priority: P2)

**Goal**: cruscotto Insegna: progetti con chip classi, materiali riapribili, quiz&flashcard da indice, filtro globale

**Independent Test**: quickstart §3

- [ ] T018 [US3] In `public/js/mappai-storage-lang.js` `saveCurrentProject`: scrivi `mappai_studysets_index` via `MappAITeachCore.buildSetsIndex(prev, projectId, mapName, cls, appState.db.studySets||[])` — dopo la guardia Studio-attivo, mai riparsando snapshot (FR-013/FR-014)
- [ ] T019 [US3] In `public/js/mappai-landing-teach.js`: le 3 sezioni collassabili di `#teach-content` — "Progetti esistenti" (`renderRecentProjects(container, {classChips:true})` con chip da `classesForMap`), "Materiali di studio" (righe da `MappAIStudyDocs.list()`: icona kind, titolo, mappa, classe, data; click → `MappAIStudyDocs.get(id)` → `MappAIStudyExport.openPrintable(doc.html)`; delete con conferma), "Quiz & flashcard" (righe da `mappai_studysets_index`; click → `loadProject(projectId)`); empty state esplicito per ognuna; chiavi `ui_teach_projects/materials/sets` nei due dizionari
- [ ] T020 [US3] In `public/js/mappai-landing-teach.js`: toggle filtro "Mostra tutto / Solo classe attiva" (persist `mappai_teach_class_filter`, default `'all'`): applica `MappAITeachCore.filterByClass` alle 3 sezioni; listener `mappai-active-class-changed` → `refresh()`; chip "Generico" = nessun filtro
- [ ] T021 [US3] Debug-run Electron quickstart §3: chip classi dopo una sessione, riapertura documento senza rigenerare, set visibili dopo risalvataggio (e NON prima), filtro classe on/off

**Checkpoint**: Insegna completa come cruscotto

---

## Phase 6: User Story 4 — Grade sui progetti in Costruisci (Priority: P2)

**Goal**: assegnazione/modifica grade per riga nella sezione progetti

**Independent Test**: quickstart §2

- [ ] T022 [US4] In `public/js/mappai-storage-lang.js` (+ eventuale helper in mappai-landing-teach.js): con `opts.gradeMenu` la riga mostra il grade corrente (o "—") con menu al click — voci = grade unici delle classi (`MappAIClasses.list()`, dedup via `normGrade`) + input libero (max 40 char) + "Rimuovi grade"; scrive `p.grade` in `tutor_ai_projects` e ri-renderizza; `event.stopPropagation()` per non innescare il load della riga
- [ ] T023 [US4] Debug-run Electron quickstart §2: assegna grade, riavvio → persiste, la fascia "Stesso grade" del quick-start lo usa

**Checkpoint**: filtro "classe analoga" pienamente alimentato

---

## Phase 7: User Story 5 — Archivio esteso (Priority: P3)

**Goal**: fogli nodi e timeline auto-archiviati; cap 30

**Independent Test**: quickstart §5

- [ ] T024 [US5] In `public/js/mappai-study-export-core.js`: `DOCS_CAP` 12→30; `saveDoc` con allowlist kind `['synthesis','dossier','nodesheet','timeline']` (fallback `'dossier'` per retrocompatibilità) — quota-guard esistente invariata
- [ ] T025 [P] [US5] In `public/js/mappai-print-dossier.js`: dopo la costruzione dell'HTML del Foglio nodi, `MappAIStudyDocs.save({kind:'nodesheet', title, mapName, html})` (stesso pattern di Sintesi/Dossier)
- [ ] T026 [P] [US5] In `public/js/mappai-timeline.js`: in `_renderTimeline`, dopo il fullHtml, `MappAIStudyDocs.save({kind:'timeline', title, mapName, html})`
- [ ] T027 [US5] Debug-run Electron quickstart §5: nuovi kind in sezione Materiali con icone distinte, cap 30 rispettato

---

## Phase 8: Polish & Cross-Cutting

- [ ] T028 [P] Audit i18n (regola 13): ogni chiave `data-i18n` nuova presente in ENTRAMBI i dizionari; ogni chiave `t('lt_*')`/`t('ui_qs_*')` JS presente in `public/traduzioni/en_translations.js`; verifica switch EN→IT→EN sulle etichette nuove
- [ ] T029 [P] `npm test` completo verde + grep di igiene: zero riferimenti residui a `projects-bar`/`toggleProjectsBar` in `public/`, zero `console.error` all'avvio
- [ ] T030 Debug-run Electron completo quickstart §1-§6 (regressioni SC-005: generazione MM/KG, import, vault, hub menu, uscita segreta)
- [ ] T031 Documentare in `CLAUDE.md` (sezione sessione corrente): kill-switch `mappai-settings.json → legacyLauncher`, store nuovi (`mappai_session_registry`, `mappai_studysets_index`, `mappai_landing_mode`, `mappai_teach_class_filter`), cap archivio 30, API esposte (`MappAITeachCore`, `MappAITeach`, `MappAILive.openSetup/openMaterials`)

---

## Dependencies

```
Phase 1 (T001-T003) → Phase 2 (T004-T006) → TUTTE le user story
US1 (T007-T010) ─┐
                 ├→ US2 (T011-T017: usa toggle+sezione Insegna di US1 per i bottoni)
US2 ─────────────┼→ US3 (T018-T021: i chip leggono il registro scritto in T015)
US1 ─────────────┼→ US4 (T022-T023: usa renderRecentProjects parametrizzata di T009)
US5 (T024-T027) — indipendente da US2/US3/US4 (dipende solo da Phase 2; la sezione
                  Materiali di US3 la valorizza ma non la blocca)
Polish (T028-T031) → dopo tutte
```

Ordine consigliato: Phase 1 → 2 → US1 → US2 → US3 → US4 → US5 → Polish.

## Parallel Opportunities

- Phase 1: T001 ∥ T002
- US2: T011 ∥ T012-T013 (file diversi)
- US5: T025 ∥ T026
- Polish: T028 ∥ T029
- US5 può procedere in parallelo a US3/US4 (file disgiunti)

## Implementation Strategy

**MVP = Phase 1 + 2 + US1 + US2** (le due P1): boot pulito + lezione avviata in
≤4 click. Consegnabile e dimostrabile da solo. US3 trasforma Insegna in cruscotto,
US4 affina il ranking, US5 allarga il paniere. Ogni checkpoint: suite verde +
debug-run Electron (Constitution VI/workflow); ogni fase reversibile con revert
del solo batch.
