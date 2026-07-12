# Tasks: Tutor AI via QR — "Chatta e Scrivi"

**Input**: Design documents from `/specs/007-tutor-qr/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-and-ai.md, quickstart.md

**Tests**: inclusi per la logica pura (`tutor-core`) e per il server (`tutor-server`) — Costituzione VI. UI + chat AI reale = debug-run Electron (quickstart.md).

**Organization**: task per user story; ogni fase è un incremento reversibile (server/moduli additivi, card hub nuova).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizzabile (file diversi, nessuna dipendenza)
- **[Story]**: US1..US4 dalla spec

## Path Conventions

Repo Electron: renderer in `public/js/`, pagina studente in `public/tutor/`, server in `tutor-server.js` (root), main in `main.js`, test in `tests/`. Vedi plan.md § Project Structure.

---

## Phase 1: Setup

**Purpose**: scheletri moduli + registrazione script/preload

- [ ] T001 [P] Crea `public/js/mappai-tutor-core.js` — scheletro UMD (`window.MappAITutorCore` + `module.exports`) con firme vuote da contracts §3
- [ ] T002 [P] Crea `tutor-server.js` — scheletro `createTutorServer(opts)` (pattern `live-server.js`: http puro, porta effimera, `state()`, `listen/stop`) con handler vuoti
- [ ] T003 [P] Crea `public/js/mappai-tutor-teacher.js` e `public/js/mappai-tutor-reports.js` (scheletri UMD/`window.*`) + `<script>` in `public/index.html` dopo i moduli live; crea `public/tutor/student.html` (scheletro self-contained stile pagine studente)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: proxy AI condiviso + logica pura testata + IPC — base di tutte le US

**⚠️ CRITICAL**: nessuna US parte prima di questo

- [ ] T004 In `main.js`: estrai helper `callModel({provider, apiKey, model, productId, payload})` dagli IPC `generate-gemini`/`generate-infomaniak` (comportamento invariato — i due IPC lo richiamano); export interno per il tutor-server
- [ ] T005 In `public/js/mappai-tutor-core.js`: implementa `canSpend`, `validateMessage`, `publicState` (strip adminToken/provider/apiKey/systemInstruction), `buildTranscript`, `computeTutorResults` (contracts §3)
- [ ] T006 [P] Crea `tests/tutor-core.test.js`: cap (used<cap), messaggio vuoto/troppo lungo, publicState NON espone i campi segreti, computeTutorResults (testo+trascrizione, used/cap, submitted); `npm test` verde
- [ ] T007 In `main.js` + `public/js/preload.js`: IPC `tutor-start-session`/`-stop-session`/`-session-info`/`-open-folder`; start crea `createTutorServer` con `{apiKey, model|productId, provider, systemInstruction, cap, maxTokens}` tenuti nel main (mai in risposte HTTP)
- [ ] T008 In `tutor-server.js`: coda `enqueue(fn)` che serializza le chiamate `callModel` (una alla volta) con backoff su 429/errore provider; storage sessione `~/Documents/MappAI - Tutor/<mappa>-<classe>-<data>/` (session.json + students/<id>.json) con autosave e ripresa da disco

**Checkpoint**: suite verde; `callModel` invariato per gli IPC esistenti; server avviabile con chiave confinata al main

---

## Phase 3: User Story 1 — Studente chatta e scrive (Priority: P1) 🎯 MVP

**Goal**: ciclo QR → chat (cap) → scrivi → consegna, dal telefono

**Independent Test**: quickstart §2

- [ ] T009 [US1] In `tutor-server.js`: `GET /api/session` (publicState), `POST /api/join` (identità classe via `mappai-live-core`: 409 identity-taken / adozione / rientro stesso device con chat+bozza)
- [ ] T010 [US1] In `tutor-server.js`: `POST /api/tutor {id,text}` — `canSpend(cap)`+`validateMessage` (altrimenti 4xx SENZA AI) → `enqueue(callModel(systemInstruction+history))` → append 2 turni, `used++`, autosave; `POST /api/draft` (autosave bozza); `POST /api/submit` (submission + phase)
- [ ] T011 [US1] Crea `public/tutor/student.html`: login credenziali classe → **Esplora** (chat, contatore scambi, retry offline) → **Scrivi** (textarea sempre accessibile) → **Consegna**; bozza+chat mirror in localStorage per rientro; stile MappAI, `_tSafe` locale
- [ ] T012 [US1] Debug-run Electron quickstart §2 (con una sessione avviata a mano): login telefono, chat entro il cap, cap → chat chiusa + Scrivi, consegna, rientro ritrova chat+bozza, richiesta "scrivi tu" rifiutata

**Checkpoint**: il flusso studente vive (richiede US2 per l'avvio comodo, ma testabile avviando il server via IPC)

---

## Phase 4: User Story 2 — Docente prepara e avvia (Priority: P1) 🎯 MVP

**Goal**: wizard + QR + registro; chiave mai sui telefoni

**Independent Test**: quickstart §1

- [ ] T013 [US2] In `public/js/mappai-tutor-teacher.js`: `openSetup()` wizard (classe → argomento nodo/ramo → modalità tutor → cap → consegna scrittura); costruisce la `systemInstruction` con `fillPromptTemplate` (`TUTOR_MODE_*` + `SOCRATIC_TUTOR_*` + contesto argomento limitato + **regola anti-redazione** + `injectClassTuning`)
- [ ] T014 [US2] In `mappai-tutor-teacher.js`: avvio via IPC `tutor-start-session` (passa provider+apiKey+model/productId+systemInstruction+cap+maxTokens); QR + URL (fullscreen LIM); blocco con avviso se manca la chiave; al successo `MappAITeach.logSession({map,cls,activity:'tutor'})`
- [ ] T015 [US2] In `public/js/mappai-live-teacher.js`: card **"Chatta e Scrivi"** in `openLiveHub` → `MappAITutor.openSetup()`
- [ ] T016 [US2] Debug-run Electron quickstart §1: wizard completo, QR/URL, sessione registrata (chip Insegna), avvio bloccato senza chiave

**Checkpoint**: MVP completo (US1+US2) — attività avviabile e completabile end-to-end

---

## Phase 5: User Story 3 — Monitor e consegne (Priority: P2)

**Goal**: griglia stati + report processo+prodotto

**Independent Test**: quickstart §4

- [ ] T017 [US3] In `tutor-server.js`: `GET /api/status` (admin: identity, phase, used/cap, submitted, flag provider-lento), `POST /api/reopen` (admin: submitted→writing), `POST /api/close` (results.json + report), `GET /api/report`
- [ ] T018 [US3] In `public/js/mappai-tutor-reports.js`: `buildTutorReportHtml(results)` — per studente testo consegnato + trascrizione affiancati, stampabile (pattern `mappai-live-reports.js`)
- [ ] T019 [US3] In `mappai-tutor-teacher.js`: `openDashboard()` (griglia polling 3s su 127.0.0.1, stati per studente), chiudi → salva+apre report; bottone "sblocca" per-studente (reopen)
- [ ] T020 [US3] Debug-run Electron quickstart §4 con 2 studenti: stati in griglia, chiusura → report testo+trascrizione riaprbile, sblocca → ri-consegna

**Checkpoint**: valutazione processo+prodotto disponibile

---

## Phase 6: User Story 4 — Guardrail costi/sicurezza (Priority: P2)

**Goal**: cap, coda, limiti, istruzioni inviolabili dal telefono

**Independent Test**: quickstart §3

- [ ] T021 [US4] In `tests/tutor-server.test.js`: cap superato → 4xx senza chiamata AI (callModel mockato conta le invocazioni), messaggio oltre maxLen rifiutato, `/api/session` NON contiene apiKey/adminToken/systemInstruction, reopen/close idempotenti; `npm test` verde
- [ ] T022 [US4] In `tutor-server.js`: assicura la coda serializzata (5 richieste concorrenti → callModel invocato in sequenza), backoff su 429 con flag esposto in `/api/status`; `maxOutputTokens` fisso (~400) nel payload; la regola anti-redazione è nella systemInstruction lato server (non nel payload del telefono)
- [ ] T023 [US4] Debug-run Electron quickstart §3: ispezione traffico (nessuna chiave), cap bloccato pre-AI, 5 invii simultanei serviti in sequenza, tentativo di manipolazione istruzioni senza effetto

**Checkpoint**: attività proponibile in classe (costi/rate/abusi sotto controllo)

---

## Phase 7: Polish & Cross-Cutting

- [ ] T024 [P] Debug-run Electron quickstart §5: ripeti il flusso chat con provider **Infomaniak** attivo (risposta testuale, nessun errore) — Costituzione IV
- [ ] T025 [P] Audit i18n (regola 13): `data-i18n` wizard/hub in ENTRAMBI i dizionari; `tq_*` (JS + pagina studente) in `en_translations.js`; switch EN→IT→EN
- [ ] T026 [P] `npm test` completo verde + regressioni: gli IPC `generate-gemini`/`infomaniak` funzionano come prima dopo l'estrazione di `callModel`; altre attività live invariate
- [ ] T027 Documentare in `CLAUDE.md`: quinta attività live, `tutor-server.js` (porte 8769-8779, `MappAI - Tutor/`), helper `callModel`, moduli `MappAITutor*`, IPC `tutor-*`, guardrail (chiave nel main, cap/coda, anti-redazione)

---

## Dependencies

```
Phase 1 (T001-T003) → Phase 2 (T004-T008) → tutte le US
US1 (T009-T012) ─┐
                 ├→ US2 (T013-T016: il wizard avvia il server che US1 serve)
US1+US2 ─────────┼→ US3 (T017-T020: status/report sui dati prodotti da US1)
US1 ─────────────┴→ US4 (T021-T023: guardrail sugli endpoint di US1)
Polish (T024-T027) → dopo tutte
```

Ordine consigliato: 1 → 2 → US1 → US2 → US3 → US4 → Polish.

## Parallel Opportunities

- Phase 1: T001 ∥ T002 ∥ T003
- Phase 2: T006 (test core) ∥ T005 dopo le firme
- US3 (report/dashboard) e US4 (guardrail/test server) toccano file in gran parte disgiunti → parallelizzabili dopo US1
- Polish: T024 ∥ T025 ∥ T026

## Implementation Strategy

**MVP = Phase 1 + 2 + US1 + US2** (le due P1): attività avviabile dal docente e
completabile dallo studente (QR → chat → testo → consegna), con la chiave
confinata al main. US3 aggiunge monitor+report (il valore valutativo), US4
irrobustisce costi/sicurezza. Ogni checkpoint: suite verde + debug-run Electron
(anche con chiamate AI reali su entrambi i provider); ogni fase reversibile.

> ⚠️ Il grosso della verifica richiede l'app Electron viva + un telefono su LAN:
> il browser statico non può esercitare server LAN + chiamate AI reali.
