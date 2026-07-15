# Research — Tutor AI via QR "Chatta e Scrivi" (007)

Incognite risolte con esplorazione del codice (12/7/26). Nessun NEEDS CLARIFICATION residuo.

## R1 — Proxy AI: la chiave resta sul PC

**Decisione**: il tutor-server (Node nel main process) NON serve la chiave ai
telefoni. Ogni turno di chat: telefono → `POST /api/tutor` (token studente) →
server → **helper AI condiviso** → provider → risposta al telefono.
`main.js` ha già `generate-gemini` (L197) e `generate-infomaniak` (L227) che
chiamano il provider con `apiKey`. Estraggo un helper `callModel({provider,
apiKey, payload, model|productId})` riusato dagli IPC esistenti E dal
tutor-server (stesso processo → chiamata di funzione, non IPC). La chiave arriva
al server SOLO all'avvio sessione (dal renderer via IPC `tutor-start-session`),
resta in memoria del main per la durata della sessione, MAI in una risposta HTTP.

**Rationale**: riusa il codice AI esistente, un solo punto di chiamata provider,
chiave confinata al main. Copre FR-013.

**Alternative**: telefono chiama il provider (chiave esposta — vietato);
duplicare la logica AI nel server (divergenza). Scartate.

## R2 — Server fratello di live/collab/garden/materiali

**Decisione**: nuovo `tutor-server.js` (repo root) con `createTutorServer(opts)`,
stessi pattern dei fratelli: porta effimera, token studente nel QR + adminToken,
allowlist statica, autosave per-studente su disco, ripresa crash-safe con lo
stesso token. Cartella sessione
`~/Documents/MappAI - Tutor/[mappa]-[classe]-[DD-MM-AAAA]/` con
`session.json`, `students/<id>.json` (chat + bozza + consegna),
`results.json` + report HTML a fine sessione. Porte nuove (es. **8769-8779**,
distinte da garden 8765 / collab 8766 / live 8767 / materiali 8768).

**Rationale**: quinto fratello architetturale — il codebase ha già questo idioma,
conformarsi costa meno che inventare. Copre US1/US2/US3, FR-009 (ripresa).

## R3 — Costruzione del prompt tutor: nel renderer, passato al server

**Decisione**: il renderer costruisce al momento dell'avvio l'**istruzione di
sistema completa** (modalità scelta via `TUTOR_MODE_*` + `SOCRATIC_TUTOR_*` +
contesto argomento + **regola anti-redazione** + eventuale profilo/taratura
classe) con `fillPromptTemplate`, e la passa al server insieme a `provider`,
`apiKey`, `model/productId`, `cap`, `maxTokens`. Il server è "thin": accumula la
history per studente e la inoltra al proxy AI con quella system instruction. Il
telefono invia solo il testo del turno.

**Rationale**: la logica dei prompt vive già SOLO nel renderer (un posto); il
server non deve conoscere i template. Il telefono non può alterare l'istruzione
(FR-014): è fissata all'avvio, lato server.

**Anti-redazione**: alla system instruction si appende una regola forte, es.
"NON scrivere MAI il testo al posto dello studente; se lo chiede, rifiuta e
rilancia con domande-guida". Copre FR-004/FR-014.

## R4 — Cap, coda, limiti (guardrail costi)

**Decisione** (logica pura testabile in `mappai-tutor-core.js` UMD):
- `canSpend(student, cap)` → cap scambi per studente (FR-015, SC-002).
- `validateMessage(text, maxLen)` → rifiuta messaggi troppo lunghi prima di ogni
  chiamata AI.
- `publicState(student)` → strippa la chiave e i campi interni prima di servire
  al telefono (SC-003).
- Coda: nel server, `enqueue(fn)` serializza le chiamate AI (una alla volta) con
  gestione 429 (backoff + flag "provider lento" nella dashboard). Copre SC-006.
`maxOutputTokens` fisso basso (~400, come il tutor Infomaniak) per risposte brevi.

**Rationale**: il cap è il knob del docente; la coda evita raffiche sui rate
limit; la logica pura è testabile in Node (Costituzione VI).

## R5 — Identità e roster: Account classi esistenti

**Decisione**: riuso `mappai-live-core.js` (`EMOJI_SET`, `buildCredentials`,
`normalizeClassName`, gestione identità occupata/adozione) e `MappAIClasses`.
Nessun nuovo login. La pagina studente riusa il pattern di
`public/live/student.html` (login classe/emoji/numero → attività).

**Rationale**: coerenza con Studio attivo live; zero nuovo sistema credenziali.

## R6 — Pagina studente a 3 fasi

**Decisione**: nuova `public/tutor/student.html` self-contained (stile MappAI,
Space Mono, no Tailwind, come le altre pagine studente): login → **Esplora**
(chat col tutor, contatore scambi, retry offline) → **Scrivi** (textarea,
sempre accessibile) → **Consegna** (invia testo + chat). Bozza e chat in
localStorage + autosave server per rientro (FR-005).

## R7 — Report processo+prodotto

**Decisione**: report per-studente = testo consegnato + trascrizione chat,
riusando il pattern dei report live (`mappai-live-reports.js`): HTML stampabile,
salvato su disco, riaprbile senza rigenerare. Dashboard docente con griglia
stati (polling come collab/live). Copre US3, FR-010/FR-011.

## R8 — Hub e registro

**Decisione**: nuova card nell'hub live esistente (`openLiveHub` in
`mappai-live-teacher.js`) → wizard `openTutorSetup`. All'avvio riuscito scrive
il **registro sessioni** (`MappAITeach.logSession`, attività `'tutor'`) → chip
classe sulla landing Insegna (feature 005). Copre FR-007/FR-019.

## R9 — Provider e privacy

**Decisione**: la sessione usa il **provider attivo** dell'app (`aiProvider`
Google/Infomaniak) e la relativa chiave/productId, passati all'avvio. Per dati
di minori resta selezionabile Infomaniak (svizzero) come oggi. Trascrizioni solo
su disco del docente. Copre FR-016 e Costituzione IV (dual-provider).

## R10 — i18n

Regola 13: pagina studente e wizard con stringhe IT + chiavi EN; `data-i18n` per
l'HTML statico dell'hub/wizard nel renderer.
