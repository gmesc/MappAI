# Feature Specification: Gestione Lavagna nella sidebar + sblocca gruppo + sidebar ridimensionabile

**Feature Branch**: `006-lavagna-sidebar`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Portare la gestione della sessione Lavagna collaborativa dal popup modale al tab Struttura della sidebar (con opzione di pannello fluttuante staccabile), albero rami collassato di default, controlli per-gruppo inclusa una nuova azione 'sblocca', e sidebar ridimensionabile a mano."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestione della Lavagna senza coprire la mappa (Priority: P1)

Durante una sessione di Lavagna collaborativa il docente gestisce QR, URL e gruppi collegati **dalla sidebar** (tab Struttura) invece che da un popup che copre la mappa. Così vede contemporaneamente la mappa con i contributi degli studenti (overlay) e i controlli. Quando serve proiettare alla LIM, può **staccare** i contenuti come pannello fluttuante collassabile.

**Why this priority**: È il cuore della richiesta — il popup che copre la mappa è il problema principale segnalato dal docente. Senza questo la feature non esiste.

**Independent Test**: Avviare una Lavagna, verificare che QR + URL + lista gruppi appaiano nel tab Struttura, che la mappa resti visibile e aggiornata, e che il pannello si possa staccare/riagganciare.

**Acceptance Scenarios**:

1. **Given** una mappa aperta e nessuna sessione attiva, **When** il docente avvia la condivisione dal tab Struttura, **Then** nel tab appaiono QR, URL e la sezione "gruppi collegati" (inizialmente in attesa), senza aprire alcun popup che copre la mappa.
2. **Given** una sessione attiva con la dashboard nella sidebar, **When** un gruppo si collega e costruisce, **Then** la lista gruppi nella sidebar si aggiorna da sola (entro pochi secondi) e la mappa mostra l'overlay dei contributi.
3. **Given** la dashboard nella sidebar, **When** il docente clicca "stacca come pannello", **Then** i contenuti compaiono in un pannello fluttuante sopra la mappa, collassabile ed espandibile, e restano sincronizzati con i dati live.
4. **Given** il pannello fluttuante aperto, **When** il docente lo collassa, **Then** resta solo un'intestazione minima riespandibile, senza coprire la mappa.

---

### User Story 2 - Sblocca un gruppo che ha consegnato (Priority: P1)

Un gruppo preme "Fatto ✓" (consegna) e ottiene il badge ✓ nella dashboard. Il docente può **sbloccarlo** con un'azione: il badge ✓ sparisce e il gruppo torna "in corso". Gli studenti continuano a costruire come già facevano.

**Why this priority**: Richiesta esplicita del docente; senza sblocco un gruppo che consegna per errore resta segnato come "fatto" per tutta la lezione, falsando il colpo d'occhio sullo stato della classe.

**Independent Test**: Far consegnare un gruppo (badge ✓ compare), premere "sblocca" dal docente, verificare che il badge ✓ sparisca al successivo aggiornamento e che il gruppo possa ancora modificare la propria mappa.

**Acceptance Scenarios**:

1. **Given** un gruppo con badge ✓ (ha premuto Fatto), **When** il docente preme "sblocca" su quel gruppo, **Then** entro il successivo aggiornamento il badge ✓ sparisce e il gruppo risulta "in corso".
2. **Given** un gruppo sbloccato, **When** gli studenti aggiungono o modificano nodi, **Then** i loro contributi continuano ad arrivare e a comparire sull'overlay del docente.
3. **Given** un gruppo sbloccato, **When** il gruppo preme di nuovo "Fatto ✓", **Then** il badge ✓ ricompare.

---

### User Story 3 - Controlli per-gruppo completi nella lista (Priority: P2)

Nella lista dei gruppi collegati, per ogni gruppo il docente dispone di: mostra/nascondi il layer del gruppo sulla mappa, "SOLO" (mostra solo quel gruppo), rinomina l'etichetta del layer, esporta la mappa del gruppo come file importabile, e "sblocca". I controlli già esistenti nel popup restano tutti disponibili nella nuova collocazione.

**Why this priority**: Consolidamento dei controlli esistenti nella nuova UI. Necessario perché il popup viene sostituito — nulla deve andare perso — ma non introduce comportamenti nuovi oltre "sblocca" (US2).

**Independent Test**: Con 2+ gruppi collegati, esercitare ogni controllo (mostra/nascondi, SOLO, rinomina, esporta, sblocca) dalla sidebar e verificare l'effetto su mappa/overlay/file.

**Acceptance Scenarios**:

1. **Given** due gruppi collegati, **When** il docente nasconde il layer del primo, **Then** l'overlay di quel gruppo sparisce dalla mappa e gli altri restano.
2. **Given** due gruppi, **When** il docente attiva "SOLO" su uno, **Then** la mappa mostra solo quel gruppo (e la profondità base si adatta come oggi).
3. **Given** un gruppo, **When** il docente rinomina l'etichetta del layer, **Then** la nuova etichetta appare sull'overlay.
4. **Given** un gruppo con contributi, **When** il docente esporta la mappa del gruppo, **Then** viene prodotto un file importabile in MappAI.

---

### User Story 4 - Albero dei rami collassato di default (Priority: P2)

Il tab Struttura mostra l'albero dei rami della mappa con **tutti i rami collassati** all'apertura, in qualunque mappa. Il docente espande solo i rami che gli servono. In fondo all'albero c'è il pulsante per avviare la condivisione via QR.

**Why this priority**: Riduce il carico visivo (mappe grandi hanno alberi lunghissimi) e prepara lo spazio per la dashboard nella sidebar; è la porta d'ingresso all'avvio sessione.

**Independent Test**: Aprire una mappa con più rami e livelli, verificare che l'albero parta collassato, che l'espansione manuale funzioni, e che il pulsante di avvio condivisione sia in fondo.

**Acceptance Scenarios**:

1. **Given** una mappa con più macro-aree e sottolivelli, **When** il docente apre il tab Struttura, **Then** i rami sono tutti collassati (si vedono le macro-aree di primo livello, non i figli).
2. **Given** l'albero collassato, **When** il docente espande un ramo, **Then** compaiono i suoi figli; gli altri rami restano collassati.
3. **Given** il tab Struttura, **When** il docente scorre in fondo all'albero, **Then** trova il pulsante "avvia condivisione QR".

---

### User Story 5 - Sidebar ridimensionabile a mano (Priority: P3)

Il docente può trascinare il bordo della sidebar per allargarla o stringerla, entro un minimo (l'attuale larghezza minima) e un massimo (metà della finestra dell'app). La larghezza scelta viene ricordata tra le sessioni.

**Why this priority**: Comodità che dà respiro alla dashboard nella sidebar (QR + lista gruppi), ma la feature funziona anche senza; arriva per ultima.

**Independent Test**: Trascinare il bordo della sidebar, verificare i limiti min/max, riavviare l'app e verificare che la larghezza sia mantenuta.

**Acceptance Scenarios**:

1. **Given** la sidebar alla larghezza di default, **When** il docente trascina il bordo verso destra, **Then** la sidebar si allarga fino a metà della finestra e non oltre.
2. **Given** la sidebar allargata, **When** il docente trascina il bordo verso sinistra, **Then** la sidebar si stringe fino alla larghezza minima attuale e non meno.
3. **Given** una larghezza personalizzata, **When** l'app viene chiusa e riaperta, **Then** la sidebar riapre alla larghezza scelta.

---

### Edge Cases

- **Sessione attiva ma tab Struttura chiuso** (il docente è su un altro tab della sidebar): la sessione continua; tornando al tab Struttura la dashboard è aggiornata.
- **Pannello fluttuante + dashboard sidebar contemporanei**: mostrano gli stessi dati live, senza conflitti; un'azione (es. nascondi layer) si riflette in entrambi.
- **Server LAN irraggiungibile per un tick** (riavvio/rete): la lista non si azzera bruscamente; il tick successivo la ripristina.
- **Sblocca su un gruppo già "in corso"** (nessun badge ✓): operazione innocua, nessun effetto negativo.
- **Nessun gruppo collegato**: la sezione mostra "in attesa dei gruppi", il resto (QR, URL, termina) è comunque disponibile.
- **Ridimensionamento sotto il minimo o oltre il 50%**: la larghezza viene bloccata ai limiti, mai fuori.
- **Finestra dell'app ridimensionata dopo aver allargato la sidebar**: la sidebar non deve superare il 50% della nuova larghezza finestra.
- **Ripristino del comportamento precedente** (popup) deve restare possibile in modo documentato e reversibile.

## Requirements *(mandatory)*

### Functional Requirements

**Collocazione dashboard**

- **FR-001**: La gestione della sessione Lavagna (QR, URL, lista gruppi, controlli, termina, apri cartella) MUST essere disponibile nel tab Struttura della sidebar, senza coprire la mappa.
- **FR-002**: Il sistema MUST offrire un comando per staccare gli stessi contenuti come pannello fluttuante collassabile sopra la mappa, sincronizzato con i dati live.
- **FR-003**: Il popup modale attuale MUST essere sostituito da questa doppia modalità; il ripristino del popup MUST restare possibile in modo documentato e reversibile.
- **FR-004**: La lista dei gruppi nella sidebar (e nel pannello fluttuante) MUST aggiornarsi automaticamente durante la sessione, con lo stesso ritmo dell'attuale aggiornamento live.

**Sblocca gruppo**

- **FR-005**: Per ogni gruppo che ha consegnato (badge ✓) il docente MUST poter eseguire "sblocca", che riporta il gruppo allo stato "in corso" (rimuove il ✓).
- **FR-006**: Dopo "sblocca", i contributi successivi del gruppo MUST continuare ad arrivare e a comparire sull'overlay; il gruppo MUST poter consegnare di nuovo.
- **FR-007**: "sblocca" NON MUST bloccare né impedire l'editing dello studente in nessun momento (nessun lock lato studente introdotto da questa feature).

**Controlli per-gruppo**

- **FR-008**: Per ogni gruppo la lista MUST offrire: mostra/nascondi layer, "SOLO", rinomina etichetta, esporta mappa del gruppo (file importabile), "sblocca". I controlli già esistenti MUST restare disponibili con lo stesso comportamento.

**Albero dei rami**

- **FR-009**: L'albero dei rami nel tab Struttura MUST aprirsi con tutti i rami collassati di default, in ogni mappa.
- **FR-010**: L'espansione/collasso manuale dei rami MUST restare disponibile e indipendente per ciascun ramo.
- **FR-011**: In fondo all'elenco dell'albero MUST esserci un pulsante per avviare la condivisione via QR (avvio sessione Lavagna).

**Bottoni sessione**

- **FR-012**: La dashboard MUST offrire "Termina sessione" e "Apri cartella"; NON MUST includere un bottone "Salva" (i contributi sono già persistiti automaticamente e restano dopo la fine sessione).

**Sidebar ridimensionabile**

- **FR-013**: Il docente MUST poter ridimensionare la sidebar trascinandone il bordo.
- **FR-014**: La larghezza MUST restare tra un minimo (l'attuale larghezza minima) e un massimo pari al 50% della larghezza della finestra dell'app, anche quando la finestra viene ridimensionata.
- **FR-015**: La larghezza scelta MUST persistere tra i riavvii.

**Trasversali**

- **FR-016**: Tutti i nuovi testi dell'interfaccia MUST essere disponibili in italiano e inglese.
- **FR-017**: I contributi degli studenti (nodi e collegamenti, incluso il collegamento al concetto centrale) MUST continuare a comparire correttamente sull'overlay della mappa docente in tutte le collocazioni della dashboard.

### Key Entities

- **Sessione Lavagna**: sessione attiva; attributi rilevanti per la UI: URL/QR di accesso, elenco gruppi, stato attiva/chiusa.
- **Gruppo collegato**: contributo di un gruppo; attributi: etichetta/nick, colore, numero nodi e collegamenti, stato "consegnato" (✓) o "in corso", visibilità del layer, focus ("SOLO").
- **Preferenza larghezza sidebar**: valore persistito della larghezza scelta dal docente.
- **Stato albero** (implicito): quali rami sono espansi; all'apertura tutti collassati.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Durante una sessione Lavagna la mappa con i contributi resta **sempre visibile** mentre il docente gestisce QR e gruppi (zero istanti in cui un popup copre la mappa).
- **SC-002**: Il docente sblocca un gruppo consegnato e ne vede lo stato tornare "in corso" in **non più di un ciclo di aggiornamento** (pochi secondi).
- **SC-003**: Nessuna funzione di gestione presente oggi nel popup va persa: mostra/nascondi, SOLO, rinomina, esporta, termina, apri cartella restano tutte disponibili.
- **SC-004**: L'albero dei rami si apre collassato: su una mappa con molti nodi, il docente vede solo le macro-aree di primo livello all'apertura del tab.
- **SC-005**: La sidebar è ridimensionabile tra il minimo attuale e il 50% della finestra, e ricorda la larghezza dopo un riavvio.

## Assumptions

- **"Sblocca" = azzeramento del badge ✓** (stato del gruppo riportato a "in corso"), non un lock/unlock dell'editor studente — scelta esplicita dell'utente.
- Lo studente NON viene bloccato dopo "Fatto" né ora né con questa feature; "sblocca" agisce solo sullo stato visualizzato/registrato lato docente.
- **"Entrambi"**: la dashboard vive nella sidebar E può essere staccata come pannello fluttuante; le due viste condividono gli stessi dati live.
- **Albero collassato sempre**: comportamento applicato a ogni mappa, non solo durante la Lavagna.
- **Nessun bottone Salva**: l'autosalvataggio dei contributi è già garantito dal sistema esistente; la fine sessione conserva i dati.
- La larghezza minima di riferimento è quella attuale della sidebar; il massimo è il 50% della finestra dell'app corrente.
- Fuori scope: modifiche alla pagina studente (lock, zoom/pan) — quest'ultimo è lavoro parallelo di un'altra sessione.

## Out of Scope

- Lock dell'editor studente dopo "Fatto" (l'utente ha scelto "sblocca = azzera badge").
- Modifiche allo zoom/pan o alle taglie della pagina studente (lavoro parallelo).
- Cambiamenti al meccanismo di persistenza dei contributi (già adeguato).
- Ridisegno grafico complessivo della sidebar oltre alla maniglia di ridimensionamento e all'inserimento della dashboard.
