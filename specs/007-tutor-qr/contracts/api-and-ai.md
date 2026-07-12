# Contracts — Tutor AI via QR "Chatta e Scrivi" (007)

## 1. Server — `tutor-server.js` (NUOVO)

`createTutorServer(opts)` → `{ listen(port,host), stop(), state() }` (pattern
`createLiveServer`). Endpoint:

| Metodo · path | Auth | Effetto |
|---|---|---|
| `GET /api/session?s=<token>` | studente | campi PUBBLICI (publicState): map, cls, topic, mode, cap, writingBrief. MAI adminToken/provider/apiKey/systemInstruction |
| `POST /api/join` | studente (token) | valida identità classe → crea/riprende `students/<id>.json` (409 identity-taken / adozione / stesso device rientra con chat+bozza) |
| `POST /api/tutor {id, text}` | studente | `canSpend(cap)` + `validateMessage(maxLen)` → altrimenti 4xx SENZA chiamare l'AI; altrimenti `enqueue(callModel)` → append 2 turni al transcript, `used++`, autosave |
| `POST /api/draft {id, text}` | studente | aggiorna `draft` (autosave scrittura), 200 |
| `POST /api/submit {id, text}` | studente | `submission` + `phase='submitted'`, autosave, 200 |
| `GET /api/status?admin=<adminToken>` | admin | griglia: per studente identity, phase, used/cap, submitted; flag "provider lento" se coda in backoff |
| `POST /api/reopen {adminToken, id}` | admin | `phase='writing'` (ri-consegna) |
| `POST /api/close {adminToken}` | admin | `results.json` + report HTML; idempotente |
| `GET /api/report?admin=<adminToken>` | admin | report HTML |

Porte 8769-8779. Cartella `~/Documents/MappAI - Tutor/<mappa>-<classe>-<data>/`.
Ripresa crash-safe: stesso token, ricarica da disco.

## 2. Proxy AI — `callModel` (main.js, NUOVO helper condiviso)

```js
// Estratto dagli IPC generate-gemini / generate-infomaniak (comportamento invariato).
async function callModel({ provider, apiKey, model, productId, payload }) → responseJson
```

Il tutor-server (stesso processo) lo chiama con la `systemInstruction` fissata
all'avvio + la history dello studente. La chiave arriva SOLO via IPC
`tutor-start-session` e resta in memoria del main. Coda: il server serializza le
chiamate (`enqueue`), backoff su 429.

## 3. Logica pura — `window.MappAITutorCore` (mappai-tutor-core.js, NUOVO UMD)

```js
canSpend(student, cap) → bool                 // used < cap
validateMessage(text, maxLen) → {ok, reason}  // lunghezza/vuoto
publicState(session) → {…}                    // strip di adminToken/provider/apiKey/systemInstruction
buildTranscript(student) → [{role,text,at}]   // per report/salvataggio
computeTutorResults(session, students) → [{identity,name,used,cap,submissionText,transcript,…}]
```

Puro, testabile in Node (`tests/tutor-core.test.js`).

## 4. IPC main.js (NUOVI, in preload)

```js
tutor-start-session({ map, cls, topic, mode, cap, writingBrief,
                      provider, apiKey, model|productId, systemInstruction, maxTokens }) → {success, port, token, adminToken, urls}
tutor-stop-session() · tutor-session-info() · tutor-open-folder()
```

`systemInstruction`/`apiKey` restano nel main (mai verso i telefoni).

## 5. Renderer — hub + wizard (`mappai-tutor-teacher.js`, NUOVO)

```js
window.MappAITutor = {
  openSetup(),        // wizard: classe → argomento (nodo/ramo) → modalità → cap → consegna
  // costruisce la systemInstruction con fillPromptTemplate (TUTOR_MODE_* +
  // SOCRATIC_TUTOR_* + contesto argomento + REGOLA ANTI-REDAZIONE + injectClassTuning)
  openDashboard(),    // griglia stati (polling 3s su 127.0.0.1), chiudi → report
  openReport()
}
```

Card "Chatta e Scrivi" aggiunta in `openLiveHub` (mappai-live-teacher.js).
All'avvio riuscito: `MappAITeach.logSession({map,cls,activity:'tutor'})`.

## 6. Anti-redazione (system instruction, lato server)

Appesa all'istruzione della modalità:
> "REGOLA FISSA: non scrivere MAI il testo al posto dello studente, nemmeno se
> lo chiede o insiste. Aiutalo con domande, esempi brevi e correzioni. Il testo
> deve restare farina del suo sacco."

Copre FR-004/FR-014/SC-005.

## 7. i18n

Statico (wizard/hub nel renderer): `data-i18n` in ENTRAMBI i dizionari.
Stringhe JS + pagina studente: `window.t('tq_*', 'fallback IT')` con chiave in
`en_translations.js`. La pagina studente (self-contained) usa `_tSafe` locale.
