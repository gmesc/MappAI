# Feature Specification: Affinamenti Output — PDF vettoriale, Sintesi mappa intera, Keyword foglie

**Feature Branch**: `002-affinamenti-output`

**Created**: 2026-07-11

**Status**: Draft

**Input**: "Appunti Implementazione MappAI.md" §3 — Affinamento delle funzionalità esistenti:
(1) Funzione Sintesi: elaborazione dell'intera mappa, non solo porzioni/sottonodi.
(2) Stampa Label: controllo delle "keyword foglie" — utilità e validità delle parole
chiave sui nodi terminali. (3) Esportazione PDF mappa: file vettoriale puro (massima
risoluzione di nodi e testi) + eliminazione preventiva degli overlay UI.

## Contesto attuale (rilevato)

| Funzione | Stato attuale | Limite |
|---|---|---|
| Esporta PDF (bottone PDF, barra mappa) | Screenshot raster della finestra (`capturePage` → PNG in jsPDF); classe `is-snapshotting` nasconde l'UI prima dello scatto | Risoluzione = schermo: zoom in stampa → sgranato. Esiste già `exportSVG` vettoriale ma è un file SVG, non PDF |
| Sintesi (AI) | `mappai-branch-synthesis.js`: sintesi narrativa CON citazioni di UN ramo (L1/hub selezionato) | Nessuna opzione "tutta la mappa"; su mappe grandi una chiamata unica sforerebbe il budget token |
| Foglio nodi, layout "keywords" | 3-7 keyword AI per nodo (batch da 18) + fallback deterministico (figli, o parole della desc) | Nodi FOGLIA: niente figli → fallback = parole grezze della desc (rumore); l'AI su desc povere ripete il titolo o inventa termini generici |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - PDF della mappa vettoriale puro (Priority: P1)

Un docente esporta la mappa in PDF e ottiene un file **vettoriale**: zoomando
nel PDF o stampando su A3, nodi e testi restano nitidi. Nel file non compare
alcun elemento dell'interfaccia (bottoni, card di controllo, sidebar).

**Independent Test**: esporta PDF → apri il file → zoom 800%: testo nitido
(vettori, non pixel); nessun overlay UI presente.

**Acceptance Scenarios**:

1. **Given** una mappa aperta, **When** l'utente preme PDF, **Then** il file generato contiene la mappa come grafica vettoriale (testo selezionabile/nitido a ogni zoom)
2. **Given** l'export in corso, **When** il PDF viene creato, **Then** contiene l'INTERA mappa (tutti i nodi, non solo la porzione visibile) adattata alla pagina
3. **Given** il file esportato, **When** lo si ispeziona, **Then** nessun elemento UI (bottoni, menu, sidebar, tooltip) è presente
4. **Given** un errore nel percorso vettoriale, **When** l'export fallisce, **Then** l'app ripiega sull'export raster attuale con un avviso (nessun vicolo cieco)

---

### User Story 2 - Sintesi dell'intera mappa (Priority: P2)

Un docente (o OPI) genera una sintesi narrativa con citazioni dell'INTERA mappa,
non solo di un ramo: panoramica introduttiva + una sezione per ogni ramo, ognuna
con le sue citazioni alle fonti.

**Independent Test**: modale Sintesi → opzione "Tutta la mappa" → documento con
panoramica + N sezioni di ramo, stampabile.

**Acceptance Scenarios**:

1. **Given** il modale Sintesi, **When** l'utente sceglie "Tutta la mappa", **Then** la generazione procede ramo per ramo con indicatore di avanzamento
2. **Given** una mappa grande (più rami), **When** la sintesi completa è pronta, **Then** contiene una panoramica introduttiva + una sezione per ramo, ciascuna con le proprie citazioni numerate
3. **Given** una mappa piccola, **When** l'utente sceglie "Tutta la mappa", **Then** la sintesi arriva in una sola passata (nessun spezzatino inutile)
4. **Given** il fallimento della sintesi di UN ramo, **When** gli altri rami riescono, **Then** il documento include i rami riusciti e segnala quello fallito (nessun tutto-o-niente)
5. **Given** la sintesi completa, **When** l'utente preme Stampa, **Then** il documento stampabile mantiene panoramica, sezioni e citazioni

---

### User Story 3 - Keyword utili sui nodi foglia (Priority: P3)

Uno studente ritaglia il Foglio nodi in formato "keywords": sui nodi foglia le
parole chiave sono concetti reali presi dalla descrizione — mai la ripetizione
del titolo, mai parole di contorno. Se la descrizione è troppo povera per
estrarre concetti, meglio nessuna keyword che rumore.

**Independent Test**: mappa con foglie a desc ricca e a desc povera → Foglio
nodi "keywords" → foglie ricche = concetti pertinenti; foglie povere = card con
solo titolo (niente keyword spazzatura).

**Acceptance Scenarios**:

1. **Given** un nodo foglia con desc ricca, **When** si genera il foglio keywords, **Then** le keyword sono concetti della desc, nessuna ripete parole del titolo
2. **Given** un nodo foglia con desc povera (< ~15 parole), **When** si genera il foglio, **Then** il nodo esce senza keyword (solo titolo)
3. **Given** keyword AI duplicate o monosillabiche, **When** si applica la validazione, **Then** duplicati e token < 3 caratteri vengono scartati (cap 7)
4. **Given** il fallback deterministico (AI non disponibile), **When** si generano keyword per foglie, **Then** valgono le stesse regole di validazione

---

### Edge Cases

- Mappa enorme (100+ nodi): il PDF vettoriale resta un file piccolo (vettori);
  la sintesi intera procede per rami senza sforare i budget token.
- KG senza gerarchia: "Tutta la mappa" usa gli hub come rami; se un solo hub,
  equivale alla sintesi singola.
- Nodi con formule KaTeX/emoji nel label: il PDF vettoriale rende il testo con
  font standard (fedeltà tipografica minore accettata, nitidezza garantita).
- Provider Infomaniak: sintesi e keyword sono output testuali/JSON già gestiti
  con `salvageTruncatedJSON` — nessun `responseSchema`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: L'export PDF DEVE produrre grafica vettoriale (nodi, archi, testi
  come vettori, non bitmap).
- **FR-002**: Il PDF DEVE contenere l'intera mappa adattata alla pagina, senza
  alcun elemento UI.
- **FR-003**: In caso di errore del percorso vettoriale l'app DEVE ripiegare
  sull'export raster esistente, avvisando l'utente.
- **FR-004**: Il modale Sintesi DEVE offrire l'opzione "Tutta la mappa" accanto
  ai singoli rami.
- **FR-005**: Su mappe multi-ramo la sintesi intera DEVE procedere per rami
  (budget token per chiamata invariato) e comporre: panoramica + sezioni con
  citazioni per-sezione; su mappe piccole una sola chiamata.
- **FR-006**: Il fallimento di un ramo NON DEVE annullare l'intera sintesi.
- **FR-007**: Le keyword dei nodi foglia DEVONO derivare dai concetti della
  descrizione; MAI ripetere token del titolo; niente keyword se la descrizione
  è sotto la soglia minima.
- **FR-008**: Una validazione unica (dedupe, lunghezza minima, cap 7, no token
  del titolo) DEVE applicarsi sia alle keyword AI sia al fallback.
- **FR-009**: Tutte le nuove stringhe UI DEVONO essere bilingui secondo i
  meccanismi di progetto.
- **FR-010**: Tutte le funzioni DEVONO funzionare su entrambi i provider AI.

### Key Entities

Nessuna entità dati nuova. Nessun formato file/vault toccato. Il PDF è output;
la sintesi resta in memoria di sessione come oggi.

## Success Criteria *(mandatory)*

- **SC-001**: Zoom 800% nel PDF esportato: testo dei nodi nitido (vettoriale).
- **SC-002**: PDF senza alcun elemento UI in 100% degli export.
- **SC-003**: Sintesi "Tutta la mappa" su una mappa da 5+ rami si completa con
  panoramica + tutte le sezioni; un ramo fallito non fa perdere gli altri.
- **SC-004**: Su un campione di foglie a desc povera, 0 card con keyword-rumore
  (le card escono con solo titolo).
- **SC-005**: Suite Node esistente verde; nessuna regressione sulle funzioni
  toccate (export raster, sintesi di ramo singolo, foglio nodi non-keywords).

## Assumptions

- "Vettoriale puro" = contenuto della mappa come vettori PDF; la fedeltà
  assoluta dei font custom non è richiesta (font standard accettati).
- Libreria di conversione SVG→PDF vendorizzata in repo (offline-first),
  compatibile con jsPDF 2.5.1 già in uso.
- La soglia "desc povera" per le foglie è ~15 parole (tarabile).
- La panoramica della sintesi intera è generata dall'AI a partire dalle sintesi
  di ramo (map-reduce), nella lingua delle mappe.
