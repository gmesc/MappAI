# Tasks: Lavagna nella sidebar + sblocca gruppo + sidebar ridimensionabile

> **STATO (12/7/26): implementazione completa, verificata in browser statico.**
> Tutte le fasi 1-8 implementate (endpoint+test, renderer multi-host, sidebar+floating,
> sblocca, albero collassato, resize, i18n, doc). Suite **382/382** ✅.
> Verificato in browser: 0 errori console, `renderCollabPanel` costruisce QR+gruppi+bottoni
> con "Sblocca" solo sui gruppi done, tutti i controlli presenti.
> **PENDENTI = solo debug-run Electron vivo** (T009, T012, T014, T018, T021, T024):
> albero collassato su mappa reale, resize drag, pannello fluttuante, sessione end-to-end
> con sblocca + telefono. Serve ricaricare l'app (Cmd+R) per caricare il nuovo codice.

**Input**: Design documents from `/specs/006-lavagna-sidebar/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-and-ui.md, quickstart.md

**Tests**: incluso il test server per `/api/reopen` (Constitution VI). Il resto è UI/DOM → debug-run Electron (quickstart.md).

**Organization**: task per user story; ogni fase è un incremento reversibile (kill-switch).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizzabile (file diversi, nessuna dipendenza)
- **[Story]**: US1..US5 dalla spec

## Path Conventions

Repo Electron a script globali: renderer in `public/js/`, server in `collab-server.js` (root), test Node in `tests/`. Vedi plan.md § Project Structure.

---

## Phase 1: Setup

**Purpose**: scheletri e punti di aggancio

- [ ] T001 [P] Crea `public/js/mappai-sidebar-resize.js` — scheletro UMD-lite (`window.MappAISidebarResize = {init, applyWidth}` stub) e aggiungi il `<script>` in `public/index.html` dopo gli altri moduli mappai-* (prima di admin_prompts.js)
- [ ] T002 [P] In `public/index.html`: aggiungi la maniglia `#sidebar-resizer` sul bordo destro di `#sidebar` e il contenitore `#collab-sidebar-panel` (vuoto, hidden) dentro `#sidebar-panel-structure`, sopra `#tree-view-container`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: endpoint server + refactor del renderer dashboard — base di US1/US2/US3

**⚠️ CRITICAL**: nessuna user story della dashboard parte prima di questo

- [ ] T003 In `collab-server.js`: endpoint `POST /api/reopen` (gate `adminToken`, slug da nick → `g.done=false` + `persistGroup(slug)` + `persist()`, risposta `{ok:true,done:false}`; gruppo inesistente = no-op `{ok:true}`), speculare a `/api/release`
- [ ] T004 In `tests/collab-server.test.js`: test `/api/reopen` — done true→false, gate adminToken (403 senza token), idempotenza su gruppo già in-corso, nick inesistente no-op; poi `npm test` verde
- [ ] T005 In `public/js/mappai-collab-teacher.js`: refactor — estrai da `openDashboard` un builder+wiring `renderCollabPanel(targetEl)` (QR, URL, sezione gruppi, bottoni Termina/Apri cartella) che rende dentro `targetEl`; `renderGroupsList()`/`startPolling()` iterano su TUTTI gli host montati (array `CT.hosts`); `openDashboard` (modale) invocato SOLO se `localStorage.mappai_collab_legacy_modal==='1'`

**Checkpoint**: suite verde; l'endpoint reopen risponde; il renderer è montabile su un contenitore arbitrario

---

## Phase 3: User Story 1 — Dashboard nella sidebar + pannello fluttuante (Priority: P1) 🎯 MVP

**Goal**: gestione Lavagna senza coprire la mappa, con opzione floating

**Independent Test**: quickstart §2, §3

- [ ] T006 [US1] In `public/js/mappai-collab-teacher.js`: `mountSidebarPanel()` — al successo dell'avvio sessione (`openCollabHub`/start) monta `renderCollabPanel(#collab-sidebar-panel)`, mostra la sezione, forza il tab Struttura attivo; allo stop/`collabStopSession` smonta e nasconde la sezione
- [ ] T007 [US1] In `public/js/mappai-collab-teacher.js`: `openFloatingPanel()` + `toggleFloatingCollapse()` — crea `#collab-float-panel` (`position:fixed`, header con titolo + collassa + chiudi), rende `renderCollabPanel` dentro; bottone "stacca"/"riaggancia" nella dashboard sidebar; registra il floating tra `CT.hosts` così il polling lo aggiorna
- [ ] T008 [US1] In `public/index.html` (@layer components / inline): stile `#collab-float-panel` (card fluttuante, z-index sopra mappa, stato collassato = solo header) + stile `#collab-sidebar-panel`; icone Lucide + `safeCreateIcons` dopo il render
- [ ] T009 [US1] Debug-run Electron quickstart §2-§3: avvio sessione → dashboard nel tab Struttura (mappa visibile), gruppo collegato aggiorna la lista, stacca floating, collassa/espandi, azione riflessa in entrambi gli host, kill-switch legacy modal

**Checkpoint**: US1 consegnabile — la mappa non è mai coperta durante la gestione

---

## Phase 4: User Story 2 — Sblocca gruppo consegnato (Priority: P1) 🎯 MVP

**Goal**: riportare "in corso" un gruppo che ha premuto Fatto

**Independent Test**: quickstart §4

- [ ] T010 [US2] In `public/js/mappai-collab-teacher.js`: `reopenGroup(slug)` → `fetch POST http://127.0.0.1:<port>/api/reopen {adminToken, nick}`; al successo forza un tick di polling (o aggiorna localmente `g.done=false`) così il badge sparisce subito
- [ ] T011 [US2] In `renderGroupsList` (mappai-collab-teacher.js): per ogni gruppo con `g.done` mostra il bottone **"sblocca"** accanto al badge ✓ (icona `unlock`); click → `reopenGroup(slug)`; chiavi `cl_reopen`/`cl_reopen_tip`
- [ ] T012 [US2] Debug-run Electron quickstart §4: gruppo preme Fatto (badge ✓) → sblocca → badge sparisce entro un tick → il gruppo continua a inviare nodi → ripreme Fatto → ✓ ricompare

**Checkpoint**: MVP completo (US1+US2)

---

## Phase 5: User Story 3 — Controlli per-gruppo completi (Priority: P2)

**Goal**: nessun controllo perso rispetto al popup

**Independent Test**: quickstart §5

- [ ] T013 [US3] Verifica/porting in `renderCollabPanel`/`renderGroupsList` che TUTTI i controlli esistenti siano presenti nella nuova UI: mostra/nascondi (ON/OFF), SOLO (focus), rinomina etichetta, esporta JSON, + il nuovo "sblocca"; bottoni sessione Termina + Apri cartella; NESSUN bottone "Salva"
- [ ] T014 [US3] Debug-run Electron quickstart §5 con 2+ gruppi: ogni controllo produce l'effetto atteso su mappa/overlay/file; verifica che l'azione si rifletta sia in sidebar sia nel floating

**Checkpoint**: parità funzionale col popup + sblocca

---

## Phase 6: User Story 4 — Albero collassato di default (Priority: P2)

**Goal**: albero rami tutto collassato all'apertura + bottone avvio in fondo

**Independent Test**: quickstart §1

- [ ] T015 [US4] In `public/js/mappai-ui-modals.js`: `window.collapseAllTree()` — popola `window.collapsedTreeNodes` con gli id dei nodi non-foglia (hanno figli) di `appState.db`, poi `renderTreeView()`; no-op se `localStorage.mappai_tree_expanded_default==='1'`
- [ ] T016 [US4] Hook: chiama `collapseAllTree()` dopo il primo render del grafo (in `public/js/mappai-d3-render.js`, dove parte `renderTreeView`) e all'apertura del tab Struttura per una mappa appena caricata (guardia: solo se il Set è vuoto e non già inizializzato per quella mappa)
- [ ] T017 [US4] In `public/index.html`: bottone "avvia condivisione QR" in fondo a `#tree-view-container` (o subito sotto), `type="button"` → `window.openCollabHub()`; chiave `ui_collab_start_qr` in ENTRAMBI i dizionari
- [ ] T018 [US4] Debug-run Electron quickstart §1: albero collassato di default, espansione manuale ok, bottone avvio presente, kill-switch expanded default

**Checkpoint**: tab Struttura pronto come home della Lavagna

---

## Phase 7: User Story 5 — Sidebar ridimensionabile (Priority: P3)

**Goal**: resize manuale con clamp e persistenza

**Independent Test**: quickstart §6

- [ ] T019 [US5] In `public/js/mappai-sidebar-resize.js`: `init()` (aggancia `#sidebar-resizer`, pointerdown/move/up → `applyWidth`) + `applyWidth(px)` (clamp `[320, Math.floor(0.5*innerWidth)]` → `#sidebar.style.setProperty('width', px+'px', 'important')` + persist `mappai_sidebar_width`); al load riapplica il valore salvato; `window.resize` → re-clamp al 50%
- [ ] T020 [US5] In `public/index.html` (@layer components): stile `#sidebar-resizer` (barra ~6px sul bordo destro, cursor `col-resize`, hover evidenziato); assicura che `#sidebar` abbia `position` adatta per ancorare la maniglia
- [ ] T021 [US5] Debug-run Electron quickstart §6: allarga fino al 50% (bloccato), stringi fino a 320 (bloccato), riavvio mantiene la larghezza, resize finestra re-clampa

**Checkpoint**: sidebar comoda per la dashboard

---

## Phase 8: Polish & Cross-Cutting

- [ ] T022 [P] Audit i18n (regola 13): `ui_collab_start_qr` in ENTRAMBI i dizionari; `cl_reopen`/`cl_reopen_tip`/`cl_detach`/`cl_dock`/`cl_collapse` in `en_translations.js`; switch EN→IT→EN sulle etichette nuove
- [ ] T023 [P] `npm test` completo verde + igiene: nessun `console.error` all'avvio; overlay contributi (nodi + link al concetto centrale, fix 003) corretto in sidebar e floating
- [ ] T024 Debug-run Electron completo quickstart §1-§7 (regressioni SC-003/US7: stop/ripresa/apri cartella, altri tab sidebar invariati, mappa sempre visibile)
- [ ] T025 Documentare in `CLAUDE.md`: dashboard Lavagna in sidebar+floating, kill-switch (`mappai_collab_legacy_modal`, `mappai_tree_expanded_default`), store `mappai_sidebar_width`, endpoint `/api/reopen`, API `MappAICollab.renderCollabPanel`/`reopenGroup`, `window.collapseAllTree`, `MappAISidebarResize`

---

## Dependencies

```
Phase 1 (T001-T002) → Phase 2 (T003-T005) → US1/US2/US3
US1 (T006-T009) ─┐
                 ├→ US2 (T010-T012: bottone sblocca dentro renderGroupsList di US1)
US1 ─────────────┼→ US3 (T013-T014: verifica parità nella UI di US1)
US4 (T015-T018) — indipendente (albero); si aggancia al bottone avvio che porta alla dashboard US1
US5 (T019-T021) — indipendente (resize) da tutto il resto (solo Phase 1 per la maniglia)
Polish (T022-T025) → dopo tutte
```

Ordine consigliato: 1 → 2 → US1 → US2 → US3 → US4 → US5 → Polish.

## Parallel Opportunities

- Phase 1: T001 ∥ T002
- US5 (T019-T021) può procedere in parallelo a US1-US4 (file disgiunti: mappai-sidebar-resize.js)
- US4 (albero) in parallelo a US1-US3 (mappai-ui-modals.js vs mappai-collab-teacher.js)
- Polish: T022 ∥ T023

## Implementation Strategy

**MVP = Phase 1 + 2 + US1 + US2** (le due P1): dashboard nella sidebar/floating +
sblocca. Da solo risolve il problema segnalato (popup che copre la mappa) e
aggiunge lo sblocco. US3 consolida i controlli, US4 pulisce l'albero, US5 dà
spazio. Ogni checkpoint: suite verde + debug-run Electron; ogni fase reversibile
con kill-switch / revert del batch.
