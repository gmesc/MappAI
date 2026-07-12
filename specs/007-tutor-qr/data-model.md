# Data Model — Tutor AI via QR "Chatta e Scrivi" (007)

Dati su disco del docente (`~/Documents/MappAI - Tutor/<sessione>/`), mai nel
vault. Il telefono tiene solo un mirror di bozza/chat in localStorage per il
rientro. La chiave API vive solo in memoria del main process.

## 1. Sessione — `session.json` (NUOVO)

```js
{
  token: '<student-token>',      // nel QR
  adminToken: '<admin-token>',   // mai nel QR
  map: 'La Fotosintesi',
  cls: '1ª A',
  topic: { kind: 'node'|'branch', id: '<nodeId>', label: 'Opere difensive' },
  mode: 'socratic',              // modalità tutor (le 6 esistenti)
  cap: 10,                       // scambi max per studente (docente)
  writingBrief: 'Scrivi 10 righe su…',
  provider: 'google'|'infomaniak',
  // systemInstruction NON è nel file servito ai telefoni; vive lato server
  phase: 'lobby'|'running'|'closed',
  startedAt, endsAt?: ISO
}
```

**Nota sicurezza**: `adminToken`, `provider`, `systemInstruction`, `apiKey` NON
compaiono mai in `/api/session` servito al telefono (solo `token`, `topic`,
`mode`, `cap`, `writingBrief`, `map`, `cls`). Vedi `publicState`.

## 2. Partecipante — `students/<id>.json` (NUOVO)

```js
{
  id: '<deviceId|identity>',
  identity: { emojiKey: 'volpe', num: '03' },  // credenziale classe
  name: '<opz. da roster>',
  phase: 'chat'|'writing'|'submitted',
  used: 3,                       // scambi consumati (verso cap)
  transcript: [                  // turni chat
    { role: 'user'|'tutor', text: '…', at: ISO }
  ],
  draft: '<testo in bozza>',
  submission: { text: '…', at: ISO } | null,
  updatedAt: ISO
}
```

**Transizioni fase**: `chat → writing` (lo studente passa a scrivere; sempre
possibile) · `writing → submitted` (consegna) · `submitted → writing` (docente
"reopen"). `used` cresce a ogni turno chat accettato; a `used === cap` la chat si
chiude (writing resta).

## 3. Chiave API e system instruction (SOLO in memoria main — NON su disco/HTTP)

All'avvio il renderer passa al main via IPC: `{ apiKey, model|productId,
systemInstruction, provider, cap, maxTokens }`. Il main li tiene per la durata
della sessione e li usa in `callModel`. Non finiscono in `session.json` né in
alcuna risposta HTTP verso i telefoni.

## 4. Report sessione — `results.json` + HTML (NUOVO)

`computeTutorResults(session, students)` (puro) → per studente:
`{ identity, name, used, cap, submissionText, transcript, startedAt, endedAt }`.
`mappai-tutor-reports.js` → HTML stampabile (testo + trascrizione affiancati),
salvato + riaprbile senza rigenerare.

## 5. Registro sessioni (ESISTENTE, feature 005)

All'avvio riuscito: `MappAITeach.logSession({ map, cls, activity: 'tutor' })` →
chip classe sulla landing Insegna. Nessun nuovo store.

## 6. Endpoint ↔ dato (vedi contracts)

```
POST /api/join    → crea/riprende students/<id>.json (identità classe)
POST /api/tutor   → +1 turno: canSpend(cap) → callModel (coda) → transcript += 2 turni
POST /api/draft   → aggiorna draft (autosave scrittura)
POST /api/submit  → submission + phase submitted
GET  /api/status  → (admin) griglia stati: identity, phase, used/cap, submitted
POST /api/reopen  → (admin) phase submitted → writing (ri-consegna)
POST /api/close   → (admin) results.json + report HTML
GET  /api/session → (studente) SOLO campi pubblici (publicState)
```

## Invarianti

1. `apiKey` e `systemInstruction` non compaiono MAI in una risposta servita ai
   telefoni (SC-003 / FR-013 / FR-014).
2. Nessuna chiamata AI parte se `used >= cap` o se il messaggio supera `maxLen`
   (FR-015 / SC-002).
3. Le chiamate AI sono serializzate (coda): mai raffiche simultanee (SC-006).
4. Tutti i dati docente (chat, bozze, consegne, report) restano su disco del PC;
   nessun cloud oltre la chiamata al provider configurato (FR-016).
5. La sessione riprende dopo crash con lo stesso token (FR-009): `session.json` +
   `students/*.json` ricaricati da disco.
6. Il tutor non redige il testo: regola nella system instruction lato server
   (FR-004), non aggirabile dal telefono.
