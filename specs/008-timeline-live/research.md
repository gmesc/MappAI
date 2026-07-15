# Research — 008-timeline-live (Fase 0)

Nessun NEEDS CLARIFICATION nello spec: le decisioni utente sono registrate in
conversazione (13/7/26). Qui le decisioni architetturali con razionale e
alternative scartate.

## R1 — Dove gira la modalità Costruisci: estensione di live-server, non server nuovo

- **Decision**: `live-server.js` guadagna `mode:'build'` (config di sessione) con
  endpoint additivi `/api/propose` (studente) e `/api/review` (admin), attivi solo
  in build. La modalità Completa è una sessione live standard (solo domande nuove).
- **Rationale**: Completa DEVE comunque girare su live-server (è un quiz);
  Costruisci condivide login, roster, autosave per-studente, ripresa crash-safe,
  chiusura. Un server nuovo duplicherebbe ~300 righe e una porta nuova senza
  benefici. Gli endpoint sono mode-guarded → zero rischio per i quiz esistenti.
- **Alternatives considered**: (a) `timeline-server.js` fratello (pattern 1-server-
  per-attività) — scartato: qui l'80% del server è identico, non è una nuova
  famiglia di protocollo come il tutor (chat AI) o il garden (voxel);
  (b) cavalcare collab-server — scartato: manca roster, risposte, report.

## R2 — Grading anni: estensione di gradeAnswer nel live-core, non grader separato

- **Decision**: il question-schema `open` guadagna campi opzionali `answerYear`,
  `answerYearEnd`, `yearTolerance`, `answerTexts` (array per anni con più eventi).
  `gradeAnswer` li gestisce nel ramo `open`: risposta numerica → confronto
  |risposta−anno| ≤ tolleranza (periodi: dentro [inizio−tol, fine+tol]); risposta
  non numerica dove serve un anno → wrong; `answerTexts` → corretto se
  `answerMatches` su uno qualsiasi.
- **Rationale**: il grading vive già tutto in `gradeAnswer` (usato da
  `computeResults` alla chiusura); un grader parallelo spaccherebbe la fonte di
  verità dei report. Campi opzionali = domande esistenti intatte.
- **Alternatives considered**: grader dedicato in timeline-core richiamato dal
  server — scartato: computeResults dovrebbe conoscere due grader.

## R3 — Indizio 💡 sul telefono: testo pubblico, uso tracciato nella risposta

- **Decision**: `publicQuestions` include il campo `hint` (estratto della fonte —
  NON è la soluzione, può viaggiare). Con impostazione "su richiesta" il player
  mostra il bottone 💡; l'apertura setta `hintUsed:true` nella risposta.
  `cleanAnswer` lo preserva, `computeResults` lo aggrega (per studente e per
  domanda), i report lo mostrano.
- **Rationale**: zero round-trip extra; il principio "le soluzioni non
  raggiungono il telefono" resta intatto (l'indizio è contesto, la chiave
  `answerText`/`answerYear` resta strippata).
- **Alternatives considered**: endpoint `/api/hint` che registra lato server —
  scartato: complessità e un punto di fallimento in più per lo stesso dato.

## R4 — Login flessibile: l'identità resta una, cambia la validazione al join

- **Decision**: entrambi i server accettano un `loginMode` di sessione.
  - live-server `loginMode:'group'`: `/api/join` accetta `{nick}` (sanitize+slug
    come collab); l'identità interna è lo slug del gruppo — per il resto del
    server un "gruppo" È uno studente (autosave, risposte, report). I report
    etichettano per gruppo (FR-041).
  - collab-server `loginMode:'individual'`: `/api/join` valida `{emojiKey,num}`
    contro il roster passato all'avvio (riuso di `identityKey` del live-core);
    il "gruppo" interno è l'identità individuale con displayName dal roster.
  - Default invariati: live=individuale, collab=gruppi (FR-042).
- **Rationale**: massimo riuso — nessun secondo modello dati; l'identità è
  sempre "una chiave stabile + un display name". Rispetta la ripresa
  stesso-device e l'adozione post-release già esistenti.
- **Alternatives considered**: modello a doppio livello (gruppo contenente
  membri) — scartato per v1: nessun requisito lo chiede (FR-041 aggrega e basta).

## R5 — Pool date: persistito col progetto, non ricalcolato

- **Decision**: a ogni generazione timeline, gli eventi normalizzati vengono
  scritti in `appState.db.timelineAI` (sovrascritto — ultima generazione vince).
  Pool per le attività = `timelineAI + timelineEvents` (manuali docente +
  approvate studente), deduplicato per anno+evento normalizzato.
  `loadProject` inizializza entrambi ad array vuoto sui progetti legacy.
- **Rationale**: SC-003 (zero token al lancio) e FR-063 (retrocompat). La scelta
  "ultima generazione vince" evita accumuli fantasma tra rigenerazioni; ciò che
  il docente vuole conservare passa dal layer manuale (US1).
- **Alternatives considered**: accumulo storico con merge — scartato: dopo 3
  rigenerazioni il pool divergerebbe dalla timeline visibile (sorpresa docente).

## R6 — Proiezione LIM: vista in-app fullscreen, riuso del render timeline

- **Decision**: overlay fullscreen nel renderer docente (pattern QR-fullscreen
  della Lavagna): polling 3s su `127.0.0.1:<port>/api/status`, le proposte
  approvate vengono fuse nel pool e re-renderizzate riusando
  `MappAITimeline.mergedEventsHtml()` + QR nell'angolo.
- **Rationale**: zero pagina servita nuova, zero doppio motore di render;
  il PC docente è già collegato alla LIM (assunzione di spec).
- **Alternatives considered**: pagina proiettore servita dal server — scartata:
  servirebbe autenticazione admin sul browser e un secondo render HTML.

## R7 — Pagina studente Costruisci: file separato, player quiz intatto

- **Decision**: `public/live/timeline-build.html` self-contained (boot da
  `/api/session`, deviceId in localStorage, stile MappAI come student.html).
  Il QR della sessione build punta a questa pagina. `student.html` riceve SOLO
  l'aggiunta del bottone indizio.
- **Rationale**: il flusso proposte (lista buchi + form + stato revisione) non è
  un quiz; innestarlo nel player da 460 righe lo renderebbe fragile. Pattern già
  usato per materials.html.
- **Alternatives considered**: mode-switch dentro student.html — scartato
  (rischio regressioni sul player usato da 3 attività).

## R8 — US1 (base in-app): re-implementazione del lavoro di sessione 13/7

- **Decision**: il layer `MappAITimeline` (date manuali, merge+dedup, popup
  editing via `window.opener`, esercizio in-app con card-buco) viene
  re-implementato in `mappai-timeline.js` come da sessione del 13/7 (working
  tree riportato all'originale prima del branch 008), con in più: pool
  `timelineAI` (R5) e helper puri estratti in `mappai-timeline-core.js`
  (normalizzazione evento, dedup, estrazione anni — oggi `_extractYearsWithContext`
  duplicherebbe logica non testata).
- **Rationale**: il codice è già stato verificato end-to-end in browser
  (harness 20/20 + popup reale); portarlo nel core lo mette sotto test formale
  (Constitution VI). NB: esiste uno stash utente su main
  ("WIP-parallelo-su-main … timeline …") NON toccato da questa feature.
- **Alternatives considered**: recuperare il codice dallo stash — scartato:
  lo stash è dell'utente, contenuto non ispezionato di proposito.

## R9 — Distrattori MC deterministici

- **Decision**: per una domanda MC, i distrattori sono estratti dal pool:
  direzione anno→evento = altri eventi (preferenza stessa macroArea, poi
  vicinanza temporale, seed deterministico dall'anno per stabilità);
  evento→anno = anni di altri eventi, mai dentro la tolleranza dell'anno
  corretto. Pool < 4 opzioni → minimo 2 opzioni; pool < 2 → la domanda degrada
  ad aperta (comunicato dal wizard, edge case di spec).
- **Rationale**: zero AI (SC-003), riproducibile nei test.
- **Alternatives considered**: distrattori generati dall'AI — scartato (costi,
  latenza, dual-provider da testare, contro SC-003).
