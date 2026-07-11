# Tasks: Lavagna Collaborativa (003-lavagna-collaborativa)

**Input**: spec.md, plan.md (D1–D6)

---

## Phase 1: Setup

Nessuno (riuso infrastruttura esistente).

## Phase 2: Foundational — core puro (blocca server e UI)

- [X] T001 `public/js/mappai-collab-core.js` (UMD): `PALETTE` (8 colori), `SIZES` (s/m/l), `LIMITS`; `sanitizeNick`, `sanitizeText`, `validateStudentNode`, `mergeGroupNodes` (last-write-wins per id, cap 30), `groupColor(i)`, `layerToGraph(rootLabel, nick, nodes)` → JSON mappa MappAI (root L0 + nodi L1 rel "propone").
- [X] T002 `tests/collab-core.test.js`: sanitize (nick corto/lungo/HTML), validate (testo vuoto/81 char, colore fuori palette, taglia sconosciuta, coordinate NaN), merge (update per id, cap, ordina per updatedAt), layerToGraph (root+figli, id stabili, importabile: nodes+links coerenti).

## Phase 3: US1+US2 — server + pagina studente (P1) 🎯 MVP

- [X] T003 [US1] `collab-server.js`: pattern garden-server (ripresa da disco, persist crash-safe, token/adminToken, allowlist D1, redirect `/`); API D2; storage `session.json` + `groups/<slug>.json` + `board.json`.
- [X] T004 [US1] `tests/collab-server.test.js`: boot su porta effimera; join ok / nick occupato 409 / stesso device rientra; nodes merge + validazione 422; board; status admin / 403 senza token; release; STOP+RESTART → ripresa con stesso token e gruppi intatti.
- [X] T005 [US1] `public/collab/student.html` self-contained: join (nick), editor SVG (root al centro, nodi rect trascinabili pointer-events, form testo+chips colore+taglia, edit/delete propri nodi), sync automatico debounce ~800ms con indicatore, "Mostra classe" (board polling 5s, altrui in sola lettura), deviceId in localStorage, mobile-first.
- [X] T006 [US2] `main.js`: IPC `collab-start-session` (dir `~/Documents/MappAI - Lavagna/<slug>/`, porte 8766–8776, `lanUrls`, ripresa), `collab-stop-session`, `collab-session-info`; `public/js/preload.js`: expose.

## Phase 4: US3 — docente: QR, dashboard, overlay layer (P2)

- [X] T007 [US3] `public/js/mappai-collab-teacher.js`: `window.openCollabHub()` — modale pm-*: avvia/ferma sessione (nome = rootNodeLabel), QR grande (qrcode-generator) + URL, istruzioni rete (hotspot/router, MAI rete scolastica bloccata), dashboard gruppi con polling 3s su `127.0.0.1:<port>/api/status`.
- [X] T008 [US3] Overlay layer nello stesso modulo: `g#collab-overlay` sul g della mappa; nodi gruppo a raggiera attorno al root (posizione live); toggle e rinomina per gruppo; zero scritture su `appState.db`; cleanup totale allo spegnimento.
- [X] T009 [US3] `public/index.html`: script tags (vendor qrcode se assente, collab-core, collab-teacher) + voce menu "Lavagna collaborativa" (icona users) nel menu azioni rapide.

## Phase 5: US4 — export layer (P3)

- [X] T010 [US4] Bottone "Esporta layer" per gruppo nel modale docente → `layerToGraph` → download `vault-dinamico-<gruppo>.json` (importabile con Apri/Importa JSON).

## Phase 6: Polish

- [X] T011 i18n stringhe docente (`cl_*` in en_translations.js, fallback IT inline); pagina studente: testi IT (bilingue = follow-up, pagina fuori dal meccanismo data-i18n).
- [X] T012 `npm test` verde (core+server inclusi) + `node --check`.
- [X] T013 CLAUDE.md §11 stato feature.
- [ ] T014 Verifica Electron + 2 device reali: QR → join → nodi → overlay → riavvio a metà → export/import layer. (Richiede l'utente.)
