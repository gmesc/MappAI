# Contracts — 008-timeline-live

Contratti wire e di modulo. Tutto ciò che non è elencato qui resta INVARIATO
(compatibilità: i client esistenti non vedono differenze con i default).

## 1. live-server — estensioni HTTP

Base: API esistente (`/api/session|status|report|join|answer|finish|phase|release|close`).
Token studente nel QR (`?s=<token>`), `adminToken` per gli endpoint docente.

### 1.1 GET /api/session — campi aggiunti alla risposta

```json
{
  "...esistente": "...",
  "mode": "quiz | build",
  "loginMode": "individual | group",
  "hintMode": "always | onrequest | never",
  "build": { "gaps": [{"year": 1962, "hint": "…"}], "freeAllowed": true, "maxProposals": 3 }
}
```
`build` presente solo in mode build. Nessuna chiave di risposta né `sourceYears`.

### 1.2 POST /api/join — ramo loginMode 'group'

Request: `{ "token": "...", "nick": "I Galli", "deviceId": "..." }`
- 200 → `{ ok, identity: "i-galli", displayName: "I Galli", answers|proposals }`
- 409 `identity-taken` se slug preso da ALTRO device (ripresa stesso device ok)
- Comportamento 'individual': invariato (emojiKey+num contro roster).

### 1.3 POST /api/propose — SOLO mode 'build' (altrimenti 404)

Request: `{ token, identity..., anno, evento, contesto?, gapYear? }`
- 200 → `{ ok, proposal }` (con `flags` calcolati e `status:'pending'`)
- 422 `bad-proposal` (anno fuori 1000..2100, evento vuoto/oltre cap)
- 429 `proposal-cap` (raggiunto maxProposals non-rejected)
- Autosave immediato su `students/<id>.json`.

### 1.4 GET /api/status — aggiunte (admin)

Per identità: `{ ..., proposalCount, pendingCount }`. In build inoltre
`proposals: Proposal[]` (tutte, per la revisione e la proiezione).

### 1.5 POST /api/review — SOLO mode 'build' (admin)

Request: `{ adminToken, proposalId, action: "approve" | "reject" }`
- 200 → `{ ok, proposal }` (status aggiornato, persistito)
- 404 `no-proposal`; 409 `already-reviewed` (idempotenza soft: ripetere la
  stessa action è ok, cambiarla dopo la review è 409)
- NB: l'inserimento nel progetto avviene nel RENDERER (MappAITimeline.add);
  il server è solo il registro dello status.

### 1.6 POST /api/answer — campo aggiunto

`answer.hintUsed: bool?` accettato e persistito (cleanAnswer lo preserva).

### 1.7 Static allowlist

`+ public/live/timeline-build.html` (servita no-cache come le altre pagine studente).

## 2. collab-server — estensione login

`createCollabServer(opts)` accetta `loginMode` ('group' default) e `roster`.

### POST /api/join — ramo loginMode 'individual'

Request: `{ token, emojiKey: "volpe", num: "03", deviceId }`
- 200 → `{ ok, identity: "volpe-03", displayName: "🦊 03 · Nome", color, nodes, links }`
- 401 `not-in-roster`; 409 `identity-taken` (altro device); ripresa stesso device ok.
- Internamente l'identità occupa lo slot "gruppo": nodes/board/status/release/reopen
  funzionano invariati con slug = identityKey.

## 3. mappai-timeline-core.js — API modulo (UMD, puro)

```js
window.MappAITimelineCore = {
  CATEGORIES,                       // le 6 macroAree + colori
  normalizeEvent(raw) → {ok, clean|errors}      // cap/tipi come data-model §1
  eventKey(ev) → "anno|evento-normalizzato"     // chiave dedup condivisa
  buildPool(timelineAI, timelineEvents) → TimelineEvent[]   // merge + dedup
  extractYears(text) → [{year, yearEnd?, raw, context}]     // regex anni/periodi (pura)
  buildGaps(sourceText, pool) → [{year, hint}]  // anni citati e assenti dal pool
  buildQuestions(pool, opts) → Question[]       // opts = wizard §5 data-model;
                                                //   MC deterministica (seed=anno),
                                                //   degradi documentati (R9)
  validateProposal(raw, {maxLen}) → {ok, clean|errors}
  proposalFlags(clean, pool, proposals, sourceYears) → {duplicate?, yearNotInSources?}
  countActive(proposals, identity) → int        // non-rejected per il cap
}
```

## 4. mappai-live-core.js — estensioni (retro-compatibili)

- `gradeAnswer(question, answer)`: ramo `open` gestisce `answerYear/answerYearEnd/
  yearTolerance` (numerico) e `answerTexts` (any-match). Domande senza questi
  campi: comportamento IDENTICO a oggi.
- `cleanAnswer`: preserva `hintUsed` (bool, default assente).
- `publicQuestions`: whitelist + `hint`, `tlYear`; continua a strippare ogni chiave.
- `computeResults`: per studente `hintsUsed`, per domanda `hintCount`;
  `perQuestion` ordinabile per `tlYear`.

## 5. mappai-timeline.js — API rese pubbliche (US1)

```js
window.MappAITimeline = {
  add(ev) → {ok, event|error}       // origin manual|student; persiste col progetto
  remove(id) → {ok}
  list() → TimelineEvent[]
  mergedEventsHtml(opts) → html     // base+manuali, opts.exercise → card-buco
  // interni: _lastBase, _lastMergedCount, _lastGapCount (usati dal popup e dalla proiezione)
}
```
La generazione timeline scrive `appState.db.timelineAI` (pool, R5).

## 6. IPC (main.js) — pass-through

- `live-start-session`: opts aggiunti `mode`, `loginMode`, `hintMode`, `build`
  → inoltrati a createLiveServer nella `session`. Nessun handler nuovo.
- `collab-start-session`: opts aggiunti `loginMode`, `roster` → createCollabServer.

## 7. UI contracts

- Hub Live: 5ª card `calendar-clock` "Timeline" → `window.MappAITimelineLive.openSetup()`.
- Sidebar: bottone `#sidebar-tab-lim` + pannello `#sidebar-panel-lim`
  (kill-switch `mappai_lim_tab='0'` nasconde il tab); `switchSidebarTab('lim')`.
  Dentro: card attività (Lavagna → openCollabHub, Timeline → openSetup) + mount
  point per le dashboard attive (`renderCollabPanel(host)` per la Lavagna;
  pannello proprio per Timeline).
- Proiezione LIM: `MappAITimelineLive.openProjection()` — overlay fullscreen,
  ESC per uscire senza toccare la sessione, refresh ≤5s.
- i18n: chiavi `tl_*` (fallback IT inline + EN); chiavi statiche sidebar
  (`ui_lim_tab`, `tt_lim_tab`) in ENTRAMBI i dizionari.
