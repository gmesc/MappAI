# Tasks: MappAI - misuratore

**Input**: Design documents from `/specs/013-misuratore/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **obbligatori, non opzionali.** Il principio VI della costituzione impone logica pura testata in Node; FR-008 e FR-009 esigono determinismo verificabile; SC-010 richiede la suite verde. Lo scenario 2 del quickstart *è* un test.

**Organization**: raggruppati per user story, ciascuna consegnabile e verificabile da sola.

## Format: `[ID] [P?] [Story] Descrizione con percorso`

- **[P]**: parallelizzabile — file diversi, nessuna dipendenza da task incompleti
- **[Story]**: US1…US8, solo nelle fasi di user story

## Path Conventions

Tutti i percorsi sono relativi a `MappAI - misuratore/` nella root del repo, salvo dove indicato. Struttura completa in [plan.md](./plan.md#project-structure).

## Nota sull'ordine delle fasi

L'ordine **non** segue la priorità grezza delle user story: **US8 (profilo di parametri) è promossa prima di US3/US4** perché un'analisi creata senza profilo incorporato nasce già rotta, e l'archivio partirebbe corrotto. Riordinarla dopo significherebbe rigenerare ogni analisi prodotta nel frattempo.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: guscio Electron funzionante e dipendenze in casa.

- [X] T001 Creare `MappAI - misuratore/package.json` con electron ^39, js-yaml, script `start`/`test`/`pack`, autore `giacomo@insegnai.ch`
- [X] T002 Creare `MappAI - misuratore/main.js`: finestra principale 1280×860, caricamento di `public/index.html`, `contextIsolation: true`, `nodeIntegration: false`
- [X] T003 Creare `MappAI - misuratore/preload.js` con `contextBridge.exposeInMainWorld('misAPI', …)` — scheletro vuoto, riempito per canale nelle fasi successive
- [X] T004 Creare `MappAI - misuratore/.gitignore` che esclude `MappAI - misuratore - FILE/` e `node_modules/`
- [X] T005 Implementare in `main.js` la risoluzione della radice dati e il canale IPC `dati-radice`, creando `MappAI - misuratore - FILE/Upload/` e `/Report/` se assenti — **unico punto** in cui il percorso dati è deciso (plan, Complexity Tracking)
- [X] T006 Creare `public/index.html`: tre tab ANALIZZA · ANDAMENTO · METODO con il pattern di commutazione della landing MappAI (FR-047)
- [X] T007 Creare `public/css/misuratore.css` con i token MappAI scritti a mano: contenuto 1100px, bottoni `slate-100` → hover `emerald-400` con label centrata su due righe, header di sezione `slate-600` con icona indigo e chevron, Space Mono con `Noto Color Emoji` **nello stack effettivo**, date GG/MM/AAAA (FR-048, R4)
- [X] T008 [P] Copiare `pdf.min.js` da `public/js/` di MappAI in `public/js/vendor/pdf.min.js` con intestazione di origine e data (R3, R6)
- [X] T009 [P] Vendorizzare Lucide in `public/js/vendor/lucide.min.js` e js-yaml in `public/js/vendor/js-yaml.min.js` (FR-051)
- [X] T010 [P] Copiare tokenizzazione e stemming italiani da `mappai-desc-fidelity.js` in `public/js/riuso/it-tokens.js`, con intestazione origine/commit/data (R6)
- [X] T011 [P] Copiare `EDGE_FAMILIES` da `mappai-relations.js` in `public/js/riuso/edge-families.js`, con intestazione origine/commit/data (R6, FR-030-ter)
- [X] T012 [P] Copiare la normalizzazione degli item di quiz da `mappai-docedit-core.js` in `public/js/riuso/quiz-normalize.js` (R6, FR-024)
- [X] T013 [P] Copiare `safeName` e `isoDate` da `mappai-files-core.js` in `public/js/riuso/files-names.js` (R6)
- [X] T014 Creare `RIUSO.md` con l'inventario delle copie: file d'origine, commit, data, motivo (R6)
- [X] T015 [P] Creare `public/js/i18n/it.js` con tutte le stringhe centralizzate — mai stringhe sparse nel codice, così l'inglese resterà un file in più (plan, Complexity Tracking)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: fondamenta senza cui nessuna user story può partire. **Da completare prima della Phase 3.**

- [X] T016 Definire in `public/js/core/README.md` la convenzione UMD dei core: `module.exports` in Node, `window.Mis<Nome>` nel renderer, zero DOM, zero rete, zero `require` di Electron, nessuna data implicita (contracts/core-api.md)
- [X] T017 Predisporre `tests/` e verificare che `npm test` (`node --test`) esegua un test di prova — file: `tests/smoke.test.js`
- [X] T018 Creare `tests/fixtures/` con nodi, `links.json` e sintesi ridotti estratti da `1A/Funzioni Urbane` e `1B/Funzioni Urbane`, più i due vault interi referenziati per percorso nel test di riferimento
- [X] T019 Creare `public/profili/predefinito.json` = `indice-accessibilita@1` dell'Allegato A: 8 componenti con pesi 22·12·12·8·12·15·9·10, ancoraggi, liste (suffissi di nominalizzazione, connettivi subordinanti, causali, marcatori), soglie, velocità 120/150 — **ogni voce con `definizione`, `motivo`, `limite`** (FR-053, data-model §3)
- [X] T020 Implementare `public/js/core/mis-profile-core.js`: `validate`, `derive`, `fingerprint`, `describe` (contracts/core-api.md)
- [X] T021 Scrivere `tests/profile-core.test.js`: pesi che non sommano a 100 → rifiuto; ancoraggi non monotòni → rifiuto; parametro senza `limite` → rifiuto; `derive` non muta l'originale; `fingerprint` deterministico e insensibile ai soli testi (FR-033-ter)
- [X] T022 Implementare `public/js/app.js`: bootstrap, commutazione dei tre tab, stato dell'applicazione, `safeCreateIcons` dopo ogni append (regola MappAI 10)
- [X] T023 Creare `public/report-viewer.html`: finestra che mostra un report generato dentro l'app, non nel browser di sistema (US2 scenario 5)

**Checkpoint**: l'app si apre, i tre tab commutano, `npm test` è verde, il profilo predefinito è valido.

---

## Phase 3: User Story 2 — Caricare materiale e ritrovare i report (P1)

**Goal**: importare vault, PDF e cartelle di classe in `Upload/`, ed elencare elementi e report.

**Independent Test**: importare i due vault reali, chiudere e riaprire l'app, verificarli ancora elencati e distinti (`1A · Funzioni Urbane` e `1B · Funzioni Urbane`). Quickstart scenario 1.

### Tests for User Story 2

- [ ] T024 [P] [US2] Scrivere `tests/ingest-vault.test.js`: nomi disambiguati con la classe, collisione suffissata ` · 02`, contesto fotografato completo (FR-003, FR-004)
- [X] T025 [P] [US2] Scrivere `tests/riuso-divergenza.test.js`: confronta i verbi di `public/js/riuso/edge-families.js` con l'originale MappAI se raggiungibile, fallendo con l'istruzione di cosa aggiornare; **si salta** se MappAI non è raggiungibile (R6)

### Implementation for User Story 2

- [ ] T026 [US2] Implementare `public/js/ingest/mis-ingest-vault.js`: legge `index.yaml`, `Nodi/*.md`, `links.json`, `pipeline.json`, produce l'Elemento e i corpi (data-model §1, §2)
- [ ] T027 [US2] Implementare in `mis-ingest-vault.js` l'estrazione del corpo del nodo **senza la riga del titolo markdown** — la definizione calibrata in R1, da cui dipendono tutte le cifre di SC-001
- [ ] T028 [US2] Implementare `public/js/ingest/mis-ingest-html.js`: sintesi HTML → blocchi strutturati (titolo · paragrafo · voce-elenco), conservando la struttura invece di appiattire a testo (R9)
- [ ] T029 [US2] Implementare in `main.js` i canali `scegli-vault`, `scegli-pdf`, `scegli-cartella-classe` con `dialog.showOpenDialog` (contracts/ipc)
- [ ] T030 [US2] Implementare in `main.js` il canale `importa`: copia in `Upload/<nome>/originale/`, scrive `elemento.json`, gestisce la collisione con `chiedi`/`sostituisci`/`affianca` (FR-002, FR-003)
- [ ] T031 [US2] Implementare in `main.js` il canale `contesto-mappai`: legge `classi.json` e `consumi-ai.jsonl` **in sola lettura**, restituisce classe, registro, note e righe di consumo nella finestra (FR-004, principio V)
- [ ] T032 [US2] Implementare in `main.js` i canali `elementi-lista`, `elemento-leggi-corpi`, `elemento-elimina` — la lista legge il disco, mai una cache (FR-005, FR-006)
- [ ] T033 [US2] Implementare in `main.js` i canali `report-lista`, `report-salva`, `report-apri`, `report-mostra-cartella`, `report-elimina`, ricostruendo l'elenco da `_dati/` o dal JSON incorporato (FR-006, FR-040)
- [ ] T034 [US2] Esporre in `preload.js` tutti i canali delle fasi T029-T033
- [ ] T035 [US2] Implementare `public/js/ui/ui-analizza.js`: tre bottoni di caricamento nello stile `btn_quick_action`, elenco elementi con selezione multipla, bottone «Avvia analisi»
- [ ] T036 [US2] Implementare in `ui-analizza.js` la tabella degli elementi e quella dei report con `<table class="table-fixed">` + `<colgroup>`, colonna azioni a larghezza fissa in ultima posizione, allineamento a sinistra, date GG/MM/AAAA (FR-049)
- [ ] T037 [US2] Implementare l'eliminazione con **conferma a digitazione del nome esatto** per elementi e report (FR-007, regola MappAI 15) — file: `public/js/ui/ui-analizza.js`
- [ ] T038 [US2] Implementare la deduzione di `materia` e `livello` dal titolo, **modificabile a mano** dall'elenco — mai trattata come un fatto (data-model §1) — file: `public/js/ui/ui-analizza.js`

**Checkpoint**: quickstart scenario 1 supera. US2 è consegnabile da sola.

---

## Phase 4: User Story 1 — Confronto e report deterministico (P1) 🎯 MVP

**Goal**: dai due vault a un report `.html` editoriale con tutte le cifre, senza AI.

**Independent Test**: quickstart scenario 2 — i 30 valori di SC-001 riprodotti, e il report si apre con tabelle, scala Gulpease, coppie appaiate, esclusivi e limiti.

### Tests for User Story 1

- [X] T039 [P] [US1] Scrivere `tests/text-core.test.js`: tokenizzatore (apostrofo dentro, trattino separa), segmentazione per blocco, Gulpease, Flesch-Vacca, sillabe, proxy lessicali letti dal profilo
- [X] T040 [P] [US1] Scrivere `tests/struct-core.test.js`: parsing frontmatter, metriche di grafo, `rel` assente → `include`, parole per nodo con deviazione **di popolazione** (R1, DAL Protocol)
- [X] T041 [US1] Scrivere `tests/riferimento-2026.test.js` — **il test che vale SC-001**: sui due vault reali, i 18 valori strutturali esatti, le 8 righe di parole per nodo, le due deviazioni standard, e per il corpus nodi parole/frasi/parole per frase/parole lunghe esatti con Gulpease entro 0,2. Documentare nel test che nominalizzazioni, connettivi, passive, marcatori e sintesi **non** sono verificabili contro il 2026 e perché (R1)

### Implementation for User Story 1

- [X] T042 [P] [US1] Implementare in `public/js/core/mis-text-core.js` `tokenize` e `splitSentences` con abbreviazioni protette dal profilo e segmentazione per blocco (R1, R9)
- [X] T043 [P] [US1] Implementare in `mis-text-core.js` `countSyllables` a gruppi vocalici con dittonghi e trittonghi, e `fleschVacca` (R2)
- [X] T044 [US1] Implementare in `mis-text-core.js` `gulpease` e `lexicalProfile`, con **tutte le liste lette dal profilo** e mai costanti nel modulo (R1, FR-012)
- [X] T045 [US1] Implementare in `mis-text-core.js` `formatDevices` e `detectLanguage` (FR-016, edge case lingua non italiana)
- [X] T046 [P] [US1] Implementare `public/js/core/mis-struct-core.js`: `parseNode`, `graphMetrics`, `wordsPerNode` (FR-013, FR-014)
- [X] T047 [US1] Implementare in `mis-text-core.js` la stima di tempo di lettura e ascolto con le velocità dal profilo (FR-015)
- [ ] T048 [US1] Implementare `public/js/core/mis-compare-core.js`: `pairConcepts`, `isHomogeneous`, e il calcolo dei Δ per N=2 (FR-017)
- [ ] T049 [US1] Implementare `public/js/report/mis-report-style.js`: foglio editoriale come stringa — colonna 920px, serif nei titoli, carta crema, accenti per elemento, tema chiaro e scuro (FR-050)
- [ ] T050 [US1] Implementare `public/js/report/mis-report-build.js`: testata con data, elementi, modello, preset, versione formula e versione misuratore (FR-042)
- [ ] T051 [US1] Implementare in `mis-report-build.js` le sezioni struttura e parole per nodo, con colonna Δ
- [ ] T052 [US1] Implementare in `mis-report-build.js` la scala Gulpease con le tacche 40/60/80 e un punto per elemento, **distinguibile anche senza colore** (FR-052)
- [ ] T053 [US1] Implementare in `mis-report-build.js` la tabella linguistica di dettaglio, ogni metrica con la propria definizione risolta dal profilo (FR-010)
- [ ] T054 [US1] Implementare in `mis-report-build.js` le viste appaiate a N=2: coppie stesso-concetto a testo integrale, nodi esclusivi per elemento
- [ ] T055 [US1] Implementare in `mis-report-build.js` la resa delle metriche non calcolabili con il **motivo**, mai `0` né cella vuota (FR-011)
- [ ] T056 [US1] Implementare `public/js/report/mis-report-limits.js`: sezione «limiti» generata **dal profilo e da ciò che è accaduto**, senza testi scritti a mano nel builder (FR-041, FR-054)
- [ ] T057 [US1] Implementare l'incorporazione dei dati in `<script type="application/json" id="mis-dati">` e la copia in `Report/_dati/` (FR-039) — file: `public/js/report/mis-report-build.js e main.js`
- [ ] T058 [US1] Garantire che tutte le tabelle larghe scorrano nel proprio contenitore e che il corpo pagina non scorra mai in orizzontale (FR-019) — file: `public/js/report/mis-report-style.js`
- [ ] T059 [US1] Collegare «Avvia analisi» in `ui-analizza.js` alla pipeline completa e all'apertura del report

**Checkpoint**: **MVP raggiunto.** Quickstart scenari 1 e 2 superano. Da qui l'assessment del 24 luglio si rifà in un minuto.

---

## Phase 5: User Story 8 — Metodo dichiarato e parametri ritoccabili (P2)

**Goal**: indice composito, e ogni scelta arbitraria esposta e modificabile senza rompere la storia.

**Independent Test**: quickstart scenario 3 — cambiare la velocità di lettura crea un profilo nuovo, muove l'indice, lascia intatto il report precedente; un profilo incoerente viene rifiutato.

> Promossa qui di proposito: un'analisi senza profilo incorporato nasce rotta.

### Tests for User Story 8

- [ ] T060 [P] [US8] Scrivere `tests/index-core.test.js`: interpolazione sugli ancoraggi, ridistribuzione dei pesi con componenti non calcolabili, fattore di sostanza nei suoi estremi, `computeDelta` sui soli componenti comuni
- [ ] T061 [P] [US8] Scrivere in `tests/index-core.test.js` il caso che **`buildBaseline` lanci** se chiamata senza copertura — è la prova che FR-023 è impossibile da violare

### Implementation for User Story 8

- [X] T062 [P] [US8] Implementare in `mis-struct-core.js` `causalStructure` con `edgeFamilies` **iniettato** e non importato, per rendere testabile la divergenza (FR-030-ter, R6)
- [X] T063 [P] [US8] Implementare in `mis-struct-core.js` `siblingRedundancy` a sovrapposizione di n-grammi, deterministica (FR-027)
- [ ] T064 [US8] Implementare in `mis-text-core.js` il piano lessicale del componente 8: connettivi causali e logici, catene causali esplicite, marcatori di conseguenza e condizione (FR-030-bis)
- [ ] T065 [US8] Implementare `public/js/core/mis-index-core.js`: `scoreComponent` e `computeIndex` con ridistribuzione proporzionale dei pesi (FR-031, FR-033)
- [ ] T066 [US8] Implementare in `mis-index-core.js` `substanceFactor` — minore fra densità per dispositivo e non-ridondanza, limitato a `[0,4 – 1,0]`, applicato **solo** al componente 6 (FR-033-bis)
- [ ] T067 [US8] Implementare in `mis-index-core.js` `computeDelta` e `buildBaseline`, con `buildBaseline` che **lancia** se manca la copertura (FR-021, FR-023)
- [ ] T068 [US8] Implementare in `main.js` i canali `profili-lista`, `profilo-salva` con validazione prima della scrittura, `profilo-ripristina` (FR-055, FR-056)
- [ ] T069 [US8] Implementare `public/js/ui/ui-metodo.js` **generandolo interamente da `mis-profile-core.describe`** — nessun testo descrittivo scritto a mano (FR-054)
- [ ] T070 [US8] Implementare in `ui-metodo.js` la modifica dei parametri con creazione di un profilo derivato e messaggi di rifiuto che nominano il vincolo violato (FR-055, FR-033-ter)
- [ ] T071 [US8] Incorporare il profilo **per intero** in ogni analisi salvata (FR-032, contracts/ipc invariante 1) — file: `public/js/report/mis-report-build.js`
- [ ] T072 [US8] Aggiungere al report il blocco indice: valore, componenti attivi su totali, fattore di sostanza applicato — file: `public/js/report/mis-report-build.js`
- [ ] T073 [US8] Implementare il ricalcolo di un'analisi archiviata con il profilo corrente, che **scrive un nuovo snapshot** senza toccare l'originale (FR-058) — file: `public/js/ui/ui-metodo.js e main.js`

**Checkpoint**: quickstart scenario 3 supera. Da qui ogni analisi nasce con il proprio profilo dentro.

---

## Phase 6: User Story 3 — Baseline fonte → prodotto (P2)

**Goal**: misurare la fonte originale e produrre il Δ, sempre accanto alla copertura.

**Independent Test**: quickstart scenario 4 su `1B/Funzioni Urbane`, che ha `Fonti/09b_funzioni urbane.pdf`.

### Tests for User Story 3

- [ ] T074 [P] [US3] Scrivere `tests/coverage-core.test.js`: quota di frasi coperte, soglia dal profilo, elenco delle scoperte
- [ ] T075 [P] [US3] Scrivere `tests/ingest-pdf.test.js`: ricucitura della sillabazione a fine riga, rilevamento del PDF senza testo sotto le 200 parole

### Implementation for User Story 3

- [ ] T076 [US3] Implementare `public/js/ingest/mis-ingest-pdf.js` con PDF.js vendorizzato e worker disabilitato, producendo blocchi con la pagina (R3)
- [ ] T077 [US3] Implementare in `mis-ingest-pdf.js` la **ricucitura della sillabazione a fine riga** (`amministra-\nzione` → `amministrazione`) — senza, parole lunghe e sillabe si falsano (R3)
- [ ] T078 [US3] Implementare in `main.js` il canale `pdf-estrai`, che restituisce `problema: 'senza-testo'` sotto le 200 parole (US3 scenario 4)
- [ ] T079 [US3] Implementare `public/js/core/mis-coverage-core.js` `sourceCoverage`, riusando tokenizzazione e stemming copiati da MappAI (FR-022, R6)
- [ ] T080 [US3] Collegare la fonte del vault (`Fonti/`) e l'appaiamento manuale di un PDF a un elemento — file: `public/js/ingest/mis-ingest-vault.js e public/js/ui/ui-analizza.js`
- [ ] T081 [US3] Aggiungere al report la sezione «da dove si parte»: metriche della fonte, Δ per componente e complessivo, **numero di componenti comuni dichiarato accanto al Δ** (FR-021) — file: `public/js/report/mis-report-build.js`
- [ ] T082 [US3] Rendere Δ e copertura **nello stesso blocco visivo**, ricevendoli come oggetto unico da `buildBaseline` (FR-023) — file: `public/js/report/mis-report-build.js`
- [ ] T083 [US3] Gestire la fonte non misurabile: nessun Δ, motivo dichiarato fra i limiti, gli altri elementi analizzabili lo stesso — file: `public/js/report/mis-report-build.js`

**Checkpoint**: quickstart scenario 4 supera.

---

## Phase 7: User Story 7 — Costi, più le lenti di verifica (P4)

**Goal**: token, chiamate e CHF per elemento, costo per punto di accessibilità, e le metriche dei set di verifica.

**Independent Test**: quickstart scenario 5 — i totali tornano con `generationUsage` (106.672 e 125.335) e le righe cadono nelle finestre di `pipeline.json`.

### Tests for User Story 7

- [ ] T084 [P] [US7] Scrivere `tests/cost-core.test.js`: abbinamento per finestra, righe contese **non attribuite né divise**, `sospetto` quando lo scarto da `tokenDichiarati` supera la tolleranza (FR-030, R7)
- [ ] T085 [P] [US7] Scrivere `tests/quiz-core.test.js`: le tre forme storiche di item normalizzate, metriche per set, somiglianza dei distrattori (FR-024, FR-026)

### Implementation for User Story 7

- [ ] T086 [P] [US7] Implementare `public/js/core/mis-cost-core.js`: `matchUsage` e `costChf` con tasso dal profilo (FR-029, FR-030)
- [ ] T087 [P] [US7] Implementare `public/js/core/mis-quiz-core.js`: `setMetrics` e `distractorSimilarity`, leggendo i JSON di `Materiale Studio/` e mai i PDF (FR-024, FR-025, FR-026)
- [ ] T088 [US7] Aggiungere al report la sezione dei materiali di verifica, raggruppata per tipo di set — file: `public/js/report/mis-report-build.js`
- [ ] T089 [US7] Aggiungere al report la sezione costi con la finestra di abbinamento **esposta e correggibile** e l'avviso di approssimazione (FR-030) — file: `public/js/report/mis-report-build.js`
- [ ] T090 [US7] Calcolare e rendere il costo per punto di accessibilità, solo quando esiste la baseline — file: `public/js/report/mis-report-build.js`
- [ ] T091 [US7] Implementare la coerenza terminologica assistita dall'AI — l'AI raggruppa le varianti ricevendo **solo le etichette**, il conteggio resta deterministico — marcata come tale nel report (FR-028) — file: `public/js/ai/mis-ai-prose.js`

**Checkpoint**: quickstart scenario 5 supera.

---

## Phase 8: User Story 6 — Confronto a N elementi (P3)

**Goal**: nessun tetto di elementi, e un report che non degenera.

**Independent Test**: quickstart scenario 6 — analisi a 2, 4 e 9 elementi, tutte leggibili senza scorrimento orizzontale su 1280px.

### Tests for User Story 6

- [ ] T092 [P] [US6] Scrivere `tests/compare-core.test.js`: `renderStrategy` alle soglie 2 · 3-6 · 7+, matrice dei concetti, distribuzioni con l'elemento che tocca ciascun estremo

### Implementation for User Story 6

- [ ] T093 [US6] Implementare in `mis-compare-core.js` `renderStrategy` e `distributions` (FR-018)
- [ ] T094 [US6] Implementare in `mis-compare-core.js` la matrice di presenza/assenza dei concetti per la strategia a colonne
- [ ] T095 [US6] Implementare nel builder la resa a N colonne per 3-6 elementi, con i testi integrali raggiungibili a espansione — file: `public/js/report/mis-report-build.js`
- [ ] T096 [US6] Implementare nel builder la resa a distribuzioni per 7+ elementi, più la tabella di drill-down per singolo elemento — file: `public/js/report/mis-report-build.js`
- [ ] T097 [US6] Dichiarare nel report quando il confronto **non è omogeneo** (elementi da fonti diverse), perché lì il raffronto lessicale è confuso — file: `public/js/report/mis-report-build.js`
- [ ] T098 [US6] Verificare su 1280px che a 2, 4 e 9 elementi il corpo pagina non scorra in orizzontale (SC-009) — file: `public/js/report/mis-report-style.js`

**Checkpoint**: quickstart scenario 6 supera.

---

## Phase 9: User Story 5 — ANDAMENTO (P3)

**Goal**: l'archivio delle analisi diventa una risposta alla domanda «MappAI migliora?».

**Independent Test**: quickstart scenario 7 — tre analisi di registri diversi, quattro assi, avviso sotto le 3, serie separate per profili diversi, ricostruzione dopo la cancellazione di `_dati/`.

### Tests for User Story 5

- [ ] T099 [P] [US5] Scrivere `tests/trend-core.test.js`: i quattro assi, avviso di campione insufficiente sotto le 3 analisi, **profili diversi mai fusi nella stessa serie**, avviso per numero di componenti attivi diverso (FR-044, FR-045)

### Implementation for User Story 5

- [ ] T100 [US5] Implementare `public/js/core/mis-trend-core.js` `aggregate` sui quattro assi (FR-043)
- [ ] T101 [US5] Implementare `public/js/ui/ui-andamento.js` con grafici **SVG scritti a mano**, senza librerie (R5)
- [ ] T102 [US5] Affiancare a ogni grafico la **tabella equivalente**, alternativa BES/DSA (principio I, R5) — file: `public/js/ui/ui-andamento.js`
- [ ] T103 [US5] Rendere ogni punto cliccabile, aprendo il report da cui proviene (FR-046) — file: `public/js/ui/ui-andamento.js`
- [ ] T104 [US5] Implementare la ricostruzione dell'indice dal JSON incorporato nei report quando `_dati/` manca o è incompleta (FR-040) — file: `public/js/ui/ui-andamento.js e main.js`
- [ ] T105 [US5] Implementare lo stato vuoto: spiegazione che servono almeno 3 analisi e collegamento ad ANALIZZA, mai una pagina bianca — file: `public/js/ui/ui-andamento.js`

**Checkpoint**: quickstart scenario 7 supera.

---

## Phase 10: User Story 4 — Prosa interpretativa AI (P2 · consegnata per ultima)

**Goal**: le sezioni narrative del report, scritte dall'AI sui soli numeri.

**Independent Test**: quickstart scenario 8 — numeri identici prima e dopo, nessun testo dei corpi nel prompt, cifra inventata segnalata prima del salvataggio.

> Consegnata per ultima perché è l'unica parte che si può togliere del tutto senza perdere il prodotto.

### Tests for User Story 4

- [ ] T106 [P] [US4] Scrivere `tests/ai-prose.test.js`: la proiezione passata al prompt **non contiene** alcun testo dei corpi; `verifyFigures` intercetta una cifra assente dai numeri ammessi (FR-034, FR-036)

### Implementation for User Story 4

- [ ] T107 [US4] Implementare in `public/js/ai/mis-ai-prose.js` una funzione di **proiezione ripulita** dell'Analisi, separata e testata, e far ricevere a `buildPrompt` solo quella — così il testo dei corpi è irraggiungibile per costruzione, non vietato per convenzione (plan, rivalutazione Phase 1)
- [ ] T108 [US4] Implementare `buildPrompt` per titolo, occhiello, osservazione chiave, commenti alle differenze strutturali e idee per il lavoro successivo — file: `public/js/ai/mis-ai-prose.js`
- [ ] T109 [US4] Implementare in `main.js` i canali `ai-prosa`, `ai-chiave-imposta`, `ai-chiave-stato` — **la chiave non lascia mai il main** e non viene mai restituita al renderer
- [ ] T110 [US4] Implementare `verifyFigures` e mostrare le cifre sospette **prima** del salvataggio (FR-036) — file: `public/js/ai/mis-ai-prose.js e public/js/ui/ui-analizza.js`
- [ ] T111 [US4] Rendere le sezioni AI visivamente distinte da quelle di misura nel report (FR-035) — file: `public/js/report/mis-report-build.js`
- [ ] T112 [US4] Gestire l'assenza di chiave: spiegazione di dove inserirla, report deterministico pienamente utilizzabile (FR-037) — file: `public/js/ui/ui-analizza.js`

**Checkpoint**: quickstart scenario 8 supera. Tutte le user story consegnate.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T113 [P] Verificare il **determinismo**: due esecuzioni della stessa analisi differiscono solo per `id` e `creataIl` (FR-009, SC-003) — file: `specs/013-misuratore/quickstart.md`
- [ ] T114 [P] Verificare l'**offline**: rete spenta, quickstart scenario 2 completo, zero richieste esterne nel pannello network (FR-051, SC-008) — file: `specs/013-misuratore/quickstart.md`
- [ ] T115 [P] Verificare che `Mappe/` sia **intatta** dopo una sessione completa, date comprese (principio V) — file: `specs/013-misuratore/quickstart.md`
- [ ] T116 [P] Verificare che nessun testo descrittivo di metrica esista in due posti: cambiare «parola lunga» nel profilo e vederlo cambiare sia in METODO sia nei limiti del report (SC-013) — file: `specs/013-misuratore/quickstart.md`
- [ ] T117 [P] Passata di accessibilità: nessuna informazione dal solo colore, ARIA sui pannelli e sui tab, gestione del focus, contrasto dei grigi ≥4.5:1 (FR-052, principio I) — file: `specs/013-misuratore/quickstart.md`
- [ ] T118 [P] Verificare le prestazioni: due vault sotto i 5 secondi, PDF da 2 MB sotto i 10, ANDAMENTO su 100 analisi sotto i 2 (plan, Performance Goals) — file: `specs/013-misuratore/quickstart.md`
- [ ] T119 Aggiornare `CLAUDE.md` con lo stato della sessione: cosa è fatto, cosa resta da provare in Electron vivo, quali flag (costituzione, Workflow di Sviluppo)
- [ ] T120 Eseguire il quickstart per intero, tutti gli otto scenari più le verifiche trasversali — file: `specs/013-misuratore/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Setup (1) → Foundational (2) → US2 (3) → US1 (4) ← MVP
                                            ↓
                                        US8 (5)
                                       ↙   ↓   ↘
                                  US3 (6) US7 (7) US6 (8)
                                       ↘   ↓   ↙
                                        US5 (9)
                                            ↓
                                        US4 (10) → Polish (11)
```

### User Story Dependencies

- **US2** non dipende da nessuna: è l'ingresso.
- **US1** dipende da US2 (servono elementi importati). È il MVP.
- **US8** dipende da US1 (l'indice ha bisogno delle metriche). Promossa prima di US3/US4 perché ogni analisi deve nascere col profilo dentro.
- **US3**, **US7**, **US6** dipendono da US8 e sono **indipendenti fra loro** — tre filoni paralleli.
- **US5** dipende dall'esistenza di un archivio, quindi da US8 e almeno una delle tre precedenti.
- **US4** dipende da un'analisi completa; ultima perché rimovibile senza perdere il prodotto.

### Opportunità di parallelismo

- **Phase 1**: T008-T013 e T015 in parallelo (file distinti).
- **Phase 4**: T039, T040 in parallelo; T042, T043, T046 in parallelo.
- **Phase 5**: T060, T061 in parallelo; T062, T063 in parallelo.
- **Fasi 6, 7, 8 intere in parallelo** fra loro, una volta chiusa la Phase 5. È il punto di massimo parallelismo del progetto.
- **Phase 11**: T113-T118 tutti in parallelo.

### Esempio — Phase 5 in parallelo

```
# Test insieme:
T060 tests/index-core.test.js   ·   T061 (caso buildBaseline che lancia)
# Poi i due core di struttura insieme:
T062 causalStructure   ·   T063 siblingRedundancy
```

---

## Implementation Strategy

### MVP — Phase 1 → 4

Guscio, import, report deterministico. A quel punto l'assessment del 24 luglio si rifà in un minuto invece che in una sessione, ed è già il valore principale dello strumento. Consegnabile e usabile senza indice, senza AI, senza ANDAMENTO.

### Consegna incrementale

1. **Fasi 1-4** → MVP: confronto e report.
2. **Fase 5** → l'indice e il metodo dichiarato. Da qui l'archivio è sano.
3. **Fasi 6-8** in parallelo → baseline, costi, N elementi.
4. **Fase 9** → l'andamento diventa possibile appena ci sono tre analisi.
5. **Fase 10** → la prosa.
6. **Fase 11** → verifiche trasversali.

### Ordine dei rischi

Il rischio più alto è concentrato presto di proposito. **T041** (il test di riferimento) va scritto appena i core testo e struttura esistono: se le cifre non tornano, tutto il resto poggia su definizioni sbagliate e va scoperto subito, non alla fine.

Il secondo rischio è **T069**: generare METODO dal profilo è più laborioso che scriverlo a mano, e la tentazione di scrivere «solo questo testo» direttamente nella UI è forte. È esattamente ciò che ha reso irriproducibile l'assessment del 2026. T116 esiste per accorgersene.

---

## Notes

- Ogni core puro va sotto `public/js/core/`: zero DOM, zero rete, testato in Node.
- `public/js/riuso/` è codice **non nostro**: si aggiorna guardando l'originale MappAI, non si modifica in loco.
- Commit a fine di ogni fase, con la suite verde.
- Debug-run in Electron dopo ogni fase: i test unitari non coprono l'integrazione UI (costituzione, principio VI).
