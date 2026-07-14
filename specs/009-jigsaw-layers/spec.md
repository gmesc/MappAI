# Feature Specification: Jigsaw a Layer Permanenti sulla Mappa Master

**Feature Branch**: `009-jigsaw-layers`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Risponde alla §Domande degli "Appunti Implementazione MappAI": *"Jigsaw:
come gestire l'unione dei lavori dei vari gruppi in un'unica mappa master? È
possibile avere dei layer con toggle per attivarli e la possibilità di
rinominare questi layer?"* Decisioni prese col docente: layer dai vault-copia
Jigsaw · persistiti nel file della mappa master · fusione reversibile.

## Contesto e riuso (rilevato)

Oggi il Jigsaw (`mappai-jigsaw.js`) è completo per il suo flusso attuale:
- **Esporta copie** — un vault per gruppo, editing sbloccato su un ramo.
- **Ricomponi** (`reconcile`) — unisce le copie nel master: i rami lavorati
  SOSTITUISCONO quelli del master, in-place e in modo permanente
  (`appState.db.nodes/links` sovrascritti).
- **Revisione lacune** — confronto copie vs master.

Manca la parte "layer" chiesta dagli Appunti: non c'è modo di vedere il
contributo di ogni gruppo come layer separato, attivarlo/disattivarlo,
rinominarlo, né di fondere in modo reversibile.

Il **motore layer esiste già** nella Lavagna collaborativa
(`mappai-collab-teacher.js`): overlay `g` separato sul canvas, disposto attorno
al root, con toggle mostra/nascondi e rinomina per gruppo, MAI scritto in
`appState.db`. Questa feature porta quel paradigma al Jigsaw e lo rende
persistente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importare i lavori dei gruppi come layer (Priority: P1)

Con la mappa master aperta, il docente sceglie "Importa come layer" e seleziona
la cartella con i vault-copia dei gruppi (gli stessi prodotti da "Esporta
copie"). Ogni copia diventa un layer distinto, col colore del gruppo,
sovrapposto alla mappa. La mappa master originale non cambia.

**Why this priority**: senza l'import dei layer non esiste la feature; è il
punto d'ingresso di tutto.

**Independent Test**: aprire una master, importare una cartella con 2-3
vault-copia, verificare che compaiano 2-3 layer col colore del gruppo sovrapposti
alla mappa e che `appState.db` sia invariato.

**Acceptance Scenarios**:

1. **Given** una mappa master aperta, **When** il docente importa la cartella delle copie, **Then** ogni gruppo appare come layer distinto (nodi/rami del gruppo, colore del gruppo) sovrapposto alla mappa
2. **Given** i layer importati, **When** l'utente ispeziona la mappa master, **Then** `appState.db.nodes/links` è identico a prima dell'import (nessuna contaminazione)
3. **Given** una cartella senza vault validi, **When** si tenta l'import, **Then** un messaggio chiaro spiega che non ci sono copie da importare

---

### User Story 2 - Toggle e rinomina dei layer (Priority: P1)

Il docente gestisce i layer da un pannello: ogni layer ha un interruttore
mostra/nascondi e un'etichetta rinominabile. Spegnere un layer lo nasconde dalla
mappa senza cancellarlo; rinominarlo cambia il nome mostrato.

**Why this priority**: è il cuore della domanda degli Appunti ("toggle + rinomina").

**Independent Test**: con più layer, spegnere/accendere un layer → compare e
scompare dalla mappa; rinominarlo → il nuovo nome resta nel pannello e nel layer.

**Acceptance Scenarios**:

1. **Given** più layer sulla mappa, **When** il docente spegne un layer, **Then** i suoi nodi scompaiono dalla mappa ma il layer resta nell'elenco (riaccendibile)
2. **Given** un layer, **When** il docente ne cambia il nome, **Then** l'etichetta si aggiorna ovunque (pannello e overlay)
3. **Given** più layer attivi, **When** più layer sono accesi insieme, **Then** ognuno mantiene il proprio colore distinto e restano distinguibili

---

### User Story 3 - I layer vivono nel file della mappa (Priority: P1)

I layer, con il loro stato (nome, on/off, contenuto), vengono salvati DENTRO il
file della mappa master. Riaprendo il progetto in un secondo momento, i layer
sono ancora lì, con i nomi e lo stato di visibilità impostati.

**Why this priority**: senza persistenza i layer sono effimeri e il lavoro dei
gruppi va perso alla chiusura; la domanda degli Appunti chiede layer richiamabili.

**Independent Test**: importare layer, rinominarne uno, spegnerne un altro,
salvare, chiudere e riaprire il progetto → i layer, i nomi e gli stati sono
ripristinati.

**Acceptance Scenarios**:

1. **Given** layer importati e configurati (nomi, on/off), **When** si salva la mappa e la si riapre, **Then** i layer ricompaiono con nomi e stato di visibilità invariati
2. **Given** una mappa salvata PRIMA di questa feature (senza layer), **When** la si apre, **Then** si comporta esattamente come oggi (nessun layer, nessun errore) — retrocompatibilità
3. **Given** una mappa con layer, **When** la si esporta/importa come file, **Then** i layer viaggiano col file

---

### User Story 4 - Fondere un layer nel master in modo reversibile (Priority: P2)

Il docente decide che il lavoro di un gruppo va integrato nella mappa vera:
sceglie "Fondi nel master" su quel layer. I nodi/rami del layer entrano nella
gerarchia della master (come fa oggi la Ricomposizione), MA il layer resta come
overlay separato e la fusione si può annullare o il layer ri-nascondere.

**Why this priority**: è il valore finale (portare i contributi nella mappa
ufficiale) ma arriva dopo import/toggle/persistenza; e va fatto in modo
reversibile per non ripetere il rischio del merge distruttivo attuale.

**Independent Test**: fondere un layer → i suoi nodi appaiono nella gerarchia
master; annullare o scollegare → la master torna com'era e il layer resta come
overlay.

**Acceptance Scenarios**:

1. **Given** un layer attivo, **When** il docente sceglie "Fondi nel master", **Then** i nodi/rami del layer entrano nella gerarchia della master (rami lavorati + ponti ratificati, come la Ricomposizione attuale)
2. **Given** una fusione appena fatta, **When** il docente la annulla, **Then** la mappa master torna allo stato precedente alla fusione senza perdite
3. **Given** un layer fuso, **When** si guarda l'elenco layer, **Then** il layer è ancora presente (marcato "fuso"), ri-nascondibile o ri-scollegabile
4. **Given** più layer, **When** si fondono solo quelli attivi/scelti, **Then** i layer spenti non vengono fusi

---

### Edge Cases

- Vault-copia dello stesso gruppo importato due volte: il secondo aggiorna il
  layer esistente invece di duplicarlo.
- Copia con un ramo che non esiste più nel master: il layer si mostra comunque
  come contributo del gruppo (non si perde), la fusione avvisa che il ramo di
  destinazione è cambiato.
- Mappa senza root (KG): i layer si dispongono attorno al centro logico come fa
  l'overlay della Lavagna.
- Molti layer (8+ gruppi): il pannello resta usabile e la mappa leggibile
  (i layer spenti non pesano sul rendering).
- File mappa che diventa grande per via dei layer: gestione della dimensione
  coerente con i limiti già usati per i vault.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il docente DEVE poter importare la cartella dei vault-copia dei
  gruppi e ottenere un layer per gruppo, sovrapposto alla mappa master.
- **FR-002**: L'import e la gestione dei layer NON DEVONO modificare
  `appState.db` della mappa master finché non si esegue una fusione confermata.
- **FR-003**: Ogni layer DEVE avere un interruttore mostra/nascondi e
  un'etichetta rinominabile; lo spegnimento nasconde senza cancellare.
- **FR-004**: Ogni layer DEVE avere un colore distintivo (colore del gruppo) e
  restare distinguibile quando più layer sono attivi.
- **FR-005**: I layer (contenuto, nome, stato on/off, stato "fuso") DEVONO
  essere salvati nel file della mappa master e ripristinati alla riapertura.
- **FR-006**: Le mappe salvate senza layer (precedenti a questa feature) DEVONO
  aprirsi e funzionare come oggi (retrocompatibilità piena).
- **FR-007**: Il docente DEVE poter "fondere nel master" un layer: i suoi
  nodi/rami entrano nella gerarchia della master riusando la logica di
  Ricomposizione esistente (rami lavorati + ponti ratificati).
- **FR-008**: La fusione DEVE essere reversibile: dopo la fusione il layer resta
  come overlay separato e la master può tornare allo stato precedente.
- **FR-009**: Reimportare la copia di un gruppo già presente DEVE aggiornare il
  layer esistente, non crearne un duplicato.
- **FR-010**: La feature DEVE funzionare offline, solo nell'app desktop, senza
  alcun server.
- **FR-011**: La logica pura (parsing copia→layer, merge reversibile,
  serializzazione layer nel file mappa) DEVE vivere in un modulo testabile in Node.
- **FR-012**: Le stringhe UI nuove DEVONO essere bilingui secondo i meccanismi
  di progetto.

### Key Entities

- **Layer**: rappresenta il contributo di un gruppo. Attributi: id/gruppo,
  nome (rinominabile), colore, stato di visibilità (on/off), stato "fuso",
  insieme di nodi/rami del gruppo. Vive nel file della mappa master, mai
  mescolato con i nodi/link della master finché non si fonde.
- **Mappa master**: la mappa di destinazione; guadagna un contenitore `layers`
  opzionale che ne conserva i layer. Senza `layers` = mappa legacy invariata.
- **Vault-copia di gruppo**: l'artefatto già prodotto da "Esporta copie"; è la
  sorgente da cui si costruisce un layer.

## Success Criteria *(mandatory)*

- **SC-001**: Il docente importa i lavori di 3 gruppi e li vede come 3 layer
  distinti sulla mappa in meno di 30 secondi, senza modificare la master.
- **SC-002**: Spegnere/accendere e rinominare un layer si riflette
  immediatamente sulla mappa e nel pannello (nessun ricaricamento).
- **SC-003**: Dopo salvataggio e riapertura del progetto, il 100% dei layer,
  nomi e stati di visibilità è ripristinato.
- **SC-004**: Una mappa creata prima della feature si apre senza layer e senza
  errori (retrocompatibilità).
- **SC-005**: Fondere un layer e poi annullare riporta la master esattamente
  allo stato pre-fusione (nessuna perdita né residuo).
- **SC-006**: Suite di test (core + eventuali) verde.

## Assumptions

- I vault-copia dei gruppi mantengono il formato attuale prodotto da "Esporta
  copie" (con `branchLocks`, nodi, link); il layer si costruisce dal ramo
  lavorato di ogni copia.
- Il colore del layer riusa la palette gruppi già usata dalla Lavagna
  collaborativa (colore stabile per indice di gruppo).
- "Fondere nel master" riusa la logica di `reconcile` esistente, applicata a un
  singolo layer alla volta invece che a tutte le copie in blocco.
- La reversibilità si ottiene tenendo uno snapshot della master prima della
  fusione (stesso principio dello snapshot dello Studio attivo), non
  reintroducendo un motore di undo generale.
- Il contenitore `layers` nel file mappa segue il precedente dei `plots` del
  Knowledge Garden (campo top-level ignorato dai lettori che non lo conoscono).
- L'overlay visivo riusa il motore della Lavagna (`g` separato, toggle,
  rinomina) — questa feature lo generalizza da "gruppi live" a "layer
  persistenti", senza rompere l'uso live esistente.
- La Ricomposizione "in blocco" attuale resta disponibile: questa feature
  aggiunge la via a layer, non rimuove quella esistente.
