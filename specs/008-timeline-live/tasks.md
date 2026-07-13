# Tasks: Timeline Live — completa e costruisci la timeline via QR

**Input**: Design documents from `/specs/008-timeline-live/`

**Prerequisites**: plan.md, spec.md, research.md (R1-R9), data-model.md, contracts/timeline-live.md

**Tests**: INCLUSI — Constitution VI (logica pura testata, suite `node --test` sempre verde; base attuale 382/382).

**Organization**: task raggruppati per user story; ogni fase è un incremento consegnabile e testabile da solo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizzabile (file diversi, nessuna dipendenza da task incompiuti)
- **[Story]**: US1..US6 dalla spec

## Path Conventions

Repo Electron a script globali: moduli renderer in `public/js/`, server LAN nella root, test in `tests/`, pagine studente in `public/live/`.

---

## Phase 1: Setup

**Purpose**: scheletro del core nuovo e caricamento nel renderer.

- [X] T001 Creare `public/js/mappai-timeline-core.js` — modulo UMD vuoto (pattern di `mappai-live-core.js`: IIFE, `module.exports` + `window.MappAITimelineCore`, `_tSafe` locale) con `CATEGORIES` (6 macroAree + colori, stessi hex del colorMap di `mappai-timeline.js`) e `console.log` di caricamento.
- [X] T002 Registrare lo script in `public/index.html`: `mappai-timeline-core.js` PRIMA di `mappai-timeline.js`; predisporre (commentata o vuota) la riga per `mappai-timeline-teacher.js` dopo `mappai-live-teacher.js`.
- [X] T003 [P] Creare `tests/timeline-core.test.js` con boilerplate `node --test` (require del core via `module.exports`) e un primo test su `CATEGORIES`. Run `npm test` → 383/383.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: primitive pure condivise da TUTTE le story.

**⚠️ CRITICAL**: nessuna story parte prima di questa fase.

- [X] T004 In `public/js/mappai-timeline-core.js`: `normalizeEvent(raw)` (cap/tipi data-model §1, anno 1000..2100, sanitizzazione), `eventKey(ev)` (anno + evento normalizzato: lowercase, accenti piatti, alfanumerico, cap 40) e `normalizeLabel(s)` riusabile.
- [X] T005 In `public/js/mappai-timeline-core.js`: `extractYears(text)` — port PURO di `window._extractYearsWithContext` (range 4 cifre con –/-, anni 1000-2029, contesto ±120 char, dedup per anno) e `buildPool(timelineAI, timelineEvents)` (merge + dedup per `eventKey`, ordine cronologico).
- [X] T006 In `tests/timeline-core.test.js`: test per T004+T005 — normalizzazione (anno mancante/fuori range, evento vuoto, cap), eventKey (accenti/punteggiatura equivalenti), extractYears (range, anno singolo, dedup, contesto), buildPool (dedup AI vs manuale, ordine). Suite verde.

**Checkpoint**: primitive pronte — US1 può partire.

---

## Phase 3: User Story 1 — Base in-app: date manuali, popup editing, esercizio (Priority: P1) 🎯 MVP

**Goal**: pool di date correggibile e persistente + esercizio in-app; fondazione dati di tutto.

**Independent Test**: quickstart §1 — data manuale sopravvive a riapertura e rigenerazione senza duplicati; modalità esercizio mostra card-buco e le completa; avviso se opener chiuso.

- [X] T007 [US1] In `public/js/mappai-timeline.js`: layer `window.MappAITimeline` — `_db()` (init pigro `appState.db.timelineEvents`), `add(ev)` (via `MappAITimelineCore.normalizeEvent`, id `tlm_*`, origin manual|student, `author?`), `remove(id)`, `list()`, `_persist()` (StorageManager.saveCurrentProject); helper `_esc/_fmtDate/_hl/_normalizeManual` (shape render, flag `_manual/_origin/_id`) e `_sourceText()` (desc/content + sourcesDict, cap 60K).
- [X] T008 [US1] In `public/js/mappai-timeline.js`: `_cardHtml` (card evento con tag origine ✏️/🎓 + bottone elimina solo su `_manual`), `_gapCardHtml` (card-buco: input evento, select categoria, 💡 indizio dal contesto, bottone Aggiungi; bordo tratteggiato = segnale non-cromatico), `mergedEventsHtml(opts)` (base `_lastBase` + manuali, dedup `eventKey`, interpolazione gap con `MappAITimelineCore.extractYears(_sourceText())` quando `opts.exercise`, contatori `_lastMergedCount/_lastGapCount`).
- [X] T009 [US1] In `public/js/mappai-timeline.js`: rewire `_renderTimeline` (stash `_lastBase`, HTML iniziale da `mergedEventsHtml`, badge `#tl-count`, container `#tl-container`); CSS aggiunti (`.tl-card-manual`, `.tl-gap` tratteggiata e esclusa da stampa, `.tl-toolbtn`, `.tl-addform`); toolbar popup (+ Aggiungi data, toggle Modalità esercizio, form docente completo) e script popup `tlScript` (TL_refresh/TL_add/TL_del/TL_hint/TL_fillGap via `window.opener.MappAITimeline`, avviso `TL_noOp` se opener assente).
- [X] T010 [US1] Persistenza pool (R5): in `generateTimelineWithAI` dopo la dedup scrivere `appState.db.timelineAI` (eventi normalizzati via core) + `_persist`; stessa scrittura nel path statico di `openTimelineView`. In `public/js/mappai-storage-lang.js` `loadProject`: init robusto `timelineEvents`/`timelineAI` → `[]` (FR-063).
- [X] T011 [P] [US1] Test in `tests/timeline-core.test.js` sul flusso dati US1 (solo parte pura): merge+dedup base/manuali via `buildPool`+`eventKey`, gap = anni fonte assenti dal pool, fill che chiude il gap. Suite verde.
- [X] T012 [US1] Verifica in browser (harness statico stile sessione 13/7: opener stub + popup montato in iframe con `opener` cablato): add/persist/delete, esercizio con gap reali, indizio, fill studente, avviso opener chiuso. Zero errori console.

**Checkpoint**: US1 consegnabile da sola (correzione docente + esercizio singolo).

---

## Phase 4: User Story 2 — "Completa la timeline" via QR (Priority: P1) 🎯 MVP

**Goal**: attività Live autovalutata generata dal pool, zero AI, report con indizi.

**Independent Test**: quickstart §2 — wizard ≤4 interazioni, refuso lieve accettato, ±2 sì / ±3 no, MC senza soluzioni al telefono, colonna indizi nei report, CTA a pool vuoto.

- [X] T013 [US2] In `public/js/mappai-timeline-core.js`: `buildQuestions(pool, opts)` — direzioni anno→evento (answerText + `answerTexts` per anni multi-evento) / evento→anno (`answerYear/answerYearEnd/yearTolerance`) / mista; formato `open|mc` (distrattori deterministici R9: seed=anno, preferenza stessa macroArea poi vicinanza temporale; evento→anno mai dentro tolleranza; pool<4→min 2 opzioni, pool<2→degrado ad aperta con flag `degraded`); `hint` dal contesto; `tlYear`; `expects:'year'` sulle domande-anno; ordine chrono|shuffle (shuffle seedato).
- [X] T014 [P] [US2] Test `buildQuestions` in `tests/timeline-core.test.js`: entrambe le direzioni, multi-evento stesso anno, distrattori mai-corretti e stabili al re-run, degradi, shuffle deterministico col seed, hint presente/assente.
- [X] T015 [US2] In `public/js/mappai-live-core.js` (contracts §4, tutto retro-compatibile): `gradeAnswer` ramo open con `answerYear/answerYearEnd/yearTolerance` (parse numerico, non-numerico→wrong, periodo esteso) e `answerTexts` any-match; `cleanAnswer` preserva `hintUsed`; `publicQuestions` whitelist + `hint`/`tlYear`/`expects`; `computeResults` aggrega `hintsUsed` per studente e `hintCount` per domanda.
- [X] T016 [P] [US2] Test in `tests/live-core.test.js`: anno esatto/±tol/oltre/non-numerico, periodo con tolleranza, answerTexts any-match, hintUsed preservato e aggregato, publicQuestions strippa answerYear/answerTexts ma passa hint — e domande legacy IDENTICHE a prima (snapshot comportamento). Suite verde.
- [X] T017 [US2] `live-server.js` + `main.js`: pass-through campi sessione `activity/mode/loginMode/hintMode` (default 'quiz'/'individual'/'onrequest'); `/api/session` li espone (contracts §1.1); `/api/answer` accetta `hintUsed`. Test minimo in `tests/live-server.test.js` (session esposta, hintUsed persistito nell'autosave).
- [X] T018 [US2] In `public/live/student.html`: bottone 💡 (visibile con `hintMode==='onrequest'` e `q.hint`; `hintMode==='always'` → hint sempre mostrato) che rivela l'estratto e setta `hintUsed:true` sulla risposta corrente; `inputmode=numeric` quando `q.expects==='year'`. Nessun altro cambio al player.
- [X] T019 [US2] Creare `public/js/mappai-timeline-teacher.js` — `window.MappAITimelineLive.openSetup()`: guard pool (`buildPool` vuoto → CTA "Genera prima la Timeline" che apre `openTimelineGeneratorModal`); wizard stile `openLiveSetup` (classe → 2 card modalità → login individuale/gruppi → opzioni Completa: direzione/formato/indizio/tolleranza/ordine/N/timer); genera domande col core e lancia via IPC `live-start-session` (activity 'timeline'); `logSession({activity:'timeline'})` nel registro; dashboard e chiusura riusando l'infrastruttura di `mappai-live-teacher.js` (esporre lì l'hook one-liner `MappAILive.launchExternal(cls, label, qs, timer, extra)`).
- [X] T020 [US2] In `public/js/mappai-live-teacher.js`: 5ª card hub `calendar-clock` "Timeline" → `MappAITimelineLive.openSetup()` (guard `hub_fn_missing` se assente) + export `launchExternal`. In `public/js/mappai-live-reports.js`: domande ordinate per `tlYear` quando presente, colonna/badge "💡 indizi" in heatmap e schede studente.
- [X] T021 [US2] Attivare `mappai-timeline-teacher.js` in `public/index.html` (dopo `mappai-live-teacher.js`); chiavi i18n `tl_*` usate finora (fallback IT inline + blocco EN in `public/traduzioni/en_translations.js`).
- [X] T022 [US2] Verifica E2E in browser CONTRO SERVER REALE (pattern live: `node` avvia `createLiveServer` con domande timeline): login → risposta con refuso → anno ±2/±3 → 💡 su una domanda → close → 2 report con ordine cronologico e indizi. Zero AI calls (mock non necessario: il flusso non ne fa). Suite verde.

**Checkpoint**: MVP completo (US1+US2) — attività autovalutata funzionante.

---

## Phase 5: User Story 3 — "Costruisci la timeline" con revisione (Priority: P2)

**Goal**: proposte studenti → revisione docente → persistenza nel progetto + report dedicato.

**Independent Test**: quickstart §3 — proposta per buco e libera, flag duplicato e anno-non-in-fonte, cap 3, approvata nel progetto e nella stampa successiva, pending conservata nel report.

- [X] T023 [US3] In `public/js/mappai-timeline-core.js`: `buildGaps(sourceText, pool)` (anni citati assenti, con hint), `validateProposal(raw)` (data-model §4), `proposalFlags(clean, pool, proposals, sourceYears)` (duplicate su pool+non-rejected, yearNotInSources), `countActive(proposals, identity)`.
- [X] T024 [P] [US3] Test in `tests/timeline-core.test.js`: gaps corretti, validazione (anno fuori range, evento vuoto/cap), flag duplicato (pool e proposte, bocciata NON conta), yearNotInSources, cap con bocciate che liberano lo slot.
- [ ] T025 [US3] `live-server.js` mode 'build' (contracts §1.3-1.5): config `session.build` (gaps/freeAllowed/maxProposals/sourceYears — sourceYears MAI in `/api/session`); `POST /api/propose` (validazione core, flags, cap→429, autosave `students/<id>.json.proposals`); `POST /api/review` (admin, approve/reject, 404/409, persist); `/api/status` con proposte e conteggi; `/api/close` → results.json con proposte per identità; allowlist statica + `public/live/timeline-build.html` (no-cache); ripresa crash-safe con proposte. `main.js`: pass-through `build`.
- [ ] T026 [P] [US3] Test in `tests/live-server.test.js`: propose ok/422/429, review idempotenza e 409, flags calcolati, propose su mode 'quiz' → 404, stop→restart stesso token con proposte ritrovate, close con pending.
- [ ] T027 [US3] Creare `public/live/timeline-build.html` — pagina studente self-contained stile `student.html` (Space Mono, palette indigo/slate, sfondo puntinato, boot da `/api/session`, deviceId localStorage, retry offline): login (individuale o gruppo secondo `loginMode`), lista buchi con 💡 secondo `hintMode`, form proposta (anno `inputmode=numeric`, evento, contesto), stato proposte (in attesa/approvata ✓/bocciata, anche non-cromatico), cap raggiunto → messaggio chiaro.
- [ ] T028 [US3] In `public/js/mappai-timeline-teacher.js`: path wizard Costruisci (fonte buchi/max proposte/timer; gaps e sourceYears calcolati al setup con `buildGaps`/`extractYears`); dashboard revisione (polling 3s: griglia identità + lista proposte con flag; Approva → `MappAITimeline.add({origin:'student', author})` + `/api/review`; Boccia → `/api/review`); chiusura → report Costruisci + apri cartella.
- [ ] T029 [US3] In `public/js/mappai-live-reports.js`: `buildTimelineWorkshopReportHtml(results)` — sezione per identità (proposte con status e flag) + timeline finale di classe stampabile (riuso stile card dossier timeline). Wire nella chiusura di T028.
- [ ] T030 [US3] Verifica E2E in browser CONTRO SERVER REALE: 2 identità, proposta buco + libera + duplicato + anno inventato, approva/boccia, cap, approvata nel popup timeline del progetto, close → report. Suite verde.

**Checkpoint**: Costruisci consegnabile; il progetto è la fonte di verità delle approvazioni.

---

## Phase 6: User Story 4 — Proiezione LIM (Priority: P2)

**Goal**: timeline di classe che cresce sullo schermo, QR nell'angolo.

**Independent Test**: quickstart §4 — approvazione visibile ≤5s, ESC non tocca la sessione.

- [ ] T031 [US4] In `public/js/mappai-timeline-teacher.js`: `openProjection()` — overlay fullscreen (pattern QR-fullscreen Lavagna), polling 3s su `/api/status`, merge proposte APPROVATE nel pool e re-render via `MappAITimeline.mergedEventsHtml()` (R6), QR in angolo, contatore proposte, ESC→dashboard. Bottone "Proietta sulla LIM" in dashboard Costruisci.
- [ ] T032 [US4] Verifica in browser contro server reale: approvazione dalla dashboard → card in proiezione ≤5s; ESC; riapertura proiezione a metà sessione.

---

## Phase 7: User Story 5 — Login flessibile individuale/gruppi (Priority: P3)

**Goal**: scelta del docente al setup; Lavagna guadagna il login individuale.

**Independent Test**: quickstart §5 — Timeline a gruppi aggrega per gruppo; Lavagna individuale attribuisce ai singoli; default storici invariati.

- [ ] T033 [US5] `live-server.js` loginMode 'group' (contracts §1.2): `/api/join` con `{nick}` (sanitize+slug come collab), identità=slug, displayName=nick, 409 altro-device/ripresa/adozione come da pattern; report labels via displayName. Test in `tests/live-server.test.js` (join group, 409, ripresa; default individual invariato).
- [ ] T034 [P] [US5] `collab-server.js` loginMode 'individual' (contracts §2): opts `loginMode`+`roster`; `/api/join` con `{emojiKey,num}` validato su roster (riuso `identityKey`/`displayName` di live-core — require nel server), 401 not-in-roster, slot-gruppo=identità; default 'group' byte-compatibile. Test in `tests/collab-server.test.js`.
- [ ] T035 [US5] UI: toggle login nel wizard Timeline (T019, default individuale) e scelta login al lancio Lavagna in `public/js/mappai-collab-teacher.js` (default gruppi = storico; individuale → passa roster della classe attiva); dashboard Lavagna mostra displayName. `main.js`: pass-through `loginMode`/`roster` su `collab-start-session`.
- [ ] T036 [US5] Verifica: Timeline a gruppi con 2 device stesso nick (2° → 409) e report per gruppo; Lavagna individuale join emoji+numero; Lavagna senza opzione = identica a 006. Suite verde.

---

## Phase 8: User Story 6 — Tab sidebar LIM (Priority: P3)

**Goal**: casa unica per le attività collaborative; coesistenza con Struttura (006).

**Independent Test**: quickstart §6 — tab con card di avvio; dashboard Lavagna in ENTRAMBI i tab allo stesso tick; kill-switch nasconde il tab.

- [ ] T037 [US6] `public/index.html`: bottone `#sidebar-tab-lim` (icona `presentation`, dopo `#sidebar-tab-tutor`, `data-i18n`) + pannello `#sidebar-panel-lim`; chiavi `ui_lim_tab`/`tt_lim_tab` in ENTRAMBI i dizionari `public/traduzioni/*_translations.js`. `public/js/mappai-ui-modals.js`: caso 'lim' in `switchSidebarTab`; kill-switch `mappai_lim_tab==='0'` → bottone nascosto.
- [ ] T038 [US6] In `public/js/mappai-collab-teacher.js`: `renderLimSidebarTab()` — card attività (Lavagna → `openCollabHub`, Timeline → `MappAITimelineLive.openSetup` con guard) + host mount: sessione Lavagna attiva → `renderCollabPanel(host)` ANCHE nel tab LIM (hosts[] coesistono con Struttura); sessione Timeline attiva → mount mini-dashboard da `mappai-timeline-teacher.js`.
- [ ] T039 [US6] Verifica in browser: tab visibile e popolato, Lavagna avviata → pannelli sincroni in LIM e Struttura, kill-switch, tab study/notes/finder/tutor intatti. Suite verde.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T040 [P] Audit i18n: ogni chiave `tl_*`/`lv_*` nuova presente in `en_translations.js`; chiavi statiche (`ui_lim_tab`, `tt_lim_tab`) in ENTRAMBI i dizionari; nei core UMD solo `_tSafe`.
- [ ] T041 [P] Aggiornare `CLAUDE.md` §11 (stato sessione: architettura, kill-switch `mappai_lim_tab`, cosa resta da testare in Electron) e nota in `docs/` solo se serve (nessun contratto vault toccato).
- [ ] T042 Run completo: `npm test` (tutta la suite verde) + smoke `npm start` (moduli caricano senza errori console). Quickstart Electron+2 device: ESEGUE L'UTENTE (quickstart.md §1-7) — annotare esiti.

---

## Dependencies

```
Setup (T001-T003) → Foundational (T004-T006)
  → US1 (T007-T012)                    ← fondazione dati
      → US2 (T013-T022)                ← MVP con US1
          → US3 (T023-T030)            ← riusa wizard/server di US2
              → US4 (T031-T032)        ← proietta le approvazioni di US3
  → US5 (T033-T036)                    ← dipende solo da Foundational (toggle wizard: T019)
  → US6 (T037-T039)                    ← indipendente (guard su moduli assenti)
Polish (T040-T042) → per ultimo
```

## Parallel Execution Examples

- Dentro US1: T011 [P] (test) in parallelo a T012 (verifica browser).
- Dentro US2: T014 e T016 [P] (test su file diversi) in parallelo; T018 (student.html) in parallelo a T019 (teacher) dopo T015/T017.
- US5: T033 e T034 [P] (server diversi, test diversi).
- Polish: T040 e T041 [P].

## Implementation Strategy

- **MVP** = Fasi 1-4 (US1+US2): consegnabile da solo — correzione in-app + attività autovalutata via QR con report.
- Poi US3→US4 (filiera Costruisci), infine US5/US6 (indipendenti, piccole).
- Dopo OGNI fase: suite verde + verifica browser della fase; debug-run Electron a fine lavori (T042) — Constitution VI.
