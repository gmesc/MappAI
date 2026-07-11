# Feature Specification: Lavagna Collaborativa (stile Kahoot/Slido) + Motore Layer

**Feature Branch**: `003-lavagna-collaborativa`

**Created**: 2026-07-11

**Status**: Draft

**Input**: "Appunti Implementazione MappAI.md" §1 (Modalità Collaborativa) + §Domande
(Jigsaw layer). Decisioni già prese col docente (sessione costituzione, 10/7/26):
server LAN sul PC docente (hotspot proprio o rete d'aula — MAI la rete scolastica
obbligatoria); pagina studente custom vanilla (Excalidraw = solo riferimento UX);
identità = nickname per gruppo senza account; motore layer unico che serve overlay
docente E, in prospettiva, il merge Jigsaw (risposta alla domanda del documento:
sì, layer con toggle e rinomina).

## Contesto e riuso (rilevato)

L'infrastruttura del Knowledge Garden (Fase 4, già testata E2E) fornisce il
modello architetturale completo: server HTTP Node puro avviato via IPC dal main
process, token di sessione nel QR, adminToken per il docente, static allowlist
rigida, persistenza crash-safe su disco (`session.json` + una consegna per file),
QR vendored (`qrcode-generator.js`), enumerazione IP LAN (`lanUrls`) in `main.js`.
La lavagna è un fratello architetturale: cambia il dominio (nodi rettangolari 2D
attorno al ROOT invece di parcelle voxel).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Studente contribuisce dal telefono via QR (Priority: P1)

Un gruppo di studenti inquadra il QR proiettato sulla LIM, sceglie un nickname
di gruppo, e si trova in un editor minimale: il tema centrale della mappa al
centro, e la possibilità di creare nodi rettangolari (testo, colore, dimensione),
trascinarli, modificarli e cancellarli. Le modifiche arrivano al docente in
automatico (nessun bottone "invia" da ricordare); un indicatore mostra lo stato
di sincronizzazione. Con "Mostra classe" il gruppo vede anche i nodi degli altri
gruppi (in sola lettura).

**Why this priority**: è il flusso studente — senza questo non esiste la modalità.

**Independent Test**: server avviato headless → browser su
`student.html?s=<token>` → join, crea/edita/trascina nodi → i nodi compaiono in
`GET /api/board`; secondo device vede il board.

**Acceptance Scenarios**:

1. **Given** il QR della sessione, **When** lo studente apre il link e sceglie un nickname libero, **Then** entra nell'editor col tema centrale visibile e il colore assegnato al gruppo
2. **Given** un nickname già in uso da un ALTRO dispositivo, **When** prova a entrare, **Then** riceve un errore chiaro e può scegliere un altro nome; lo STESSO dispositivo rientra invece nel suo gruppo (ripresa)
3. **Given** l'editor, **When** crea un nodo (testo ≤ 80 caratteri, colore dalla palette, taglia S/M/L) e lo trascina, **Then** il nodo appare attorno al tema centrale e si sincronizza da solo entro pochi secondi
4. **Given** nodi inviati, **When** continua a modificarli, **Then** le modifiche sovrascrivono le precedenti (ultimo salvataggio vince), fino a un massimo di 30 nodi per gruppo
5. **Given** "Mostra classe" attivo, **When** altri gruppi contribuiscono, **Then** i loro nodi compaiono (aggiornamento periodico) senza essere modificabili

---

### User Story 2 - Docente avvia la sessione e proietta il QR (Priority: P1)

Con una mappa aperta, il docente avvia la "Lavagna collaborativa": l'app accende
il server locale, mostra QR + indirizzo (anche a schermo intero per la LIM) e una
dashboard con i gruppi collegati e il conteggio dei nodi. Chiusura e riavvio
dell'app NON perdono i contributi (ripresa da disco, stesso token → stesso QR).

**Independent Test**: IPC start → QR/URL corretti; contributi su disco in
`~/Documents/MappAI - Lavagna/<slug>/`; stop+start → sessione ripresa.

**Acceptance Scenarios**:

1. **Given** una mappa aperta, **When** il docente avvia la sessione, **Then** vede QR, URL e dashboard gruppi; il QR ingrandito è leggibile dalla LIM
2. **Given** contributi arrivati, **When** l'app si riavvia e la sessione riparte, **Then** gruppi e nodi sono ancora lì (stesso token, il QR proiettato resta valido)
3. **Given** la sessione attiva, **When** il docente la ferma, **Then** il server si spegne e i dati restano su disco

---

### User Story 3 - Overlay a layer sulla mappa del docente (Priority: P2)

I contributi di ogni gruppo compaiono sulla mappa proiettata come un LAYER
distinto (nodi rettangolari col colore del gruppo, disposti attorno al ROOT).
Il docente attiva/disattiva ogni layer con un toggle, lo rinomina, e la mappa
originale NON viene alterata (l'overlay è sopra, mai dentro `appState.db`).

**Independent Test**: overlay renderizza i gruppi dal board; toggle nasconde/
mostra; rinomina cambia l'etichetta; `appState.db.nodes` invariato prima/dopo.

**Acceptance Scenarios**:

1. **Given** gruppi con nodi, **When** il docente apre la dashboard, **Then** ogni gruppo è un layer con toggle e i nodi compaiono attorno al ROOT col colore del gruppo
2. **Given** un layer spento, **When** il docente lo riaccende, **Then** i nodi ricompaiono aggiornati all'ultimo sync
3. **Given** qualunque operazione sui layer, **When** si ispeziona la mappa, **Then** `appState.db.nodes/links` è identico a prima (zero contaminazione)

---

### User Story 4 - Salvare, richiamare e ri-condividere gli elaborati (Priority: P3)

Il docente salva il layer di un gruppo come mappa MappAI autonoma
(`vault-dinamico-<gruppo>`, formato JSON importabile): può riaprirla, modificarla
con gli strumenti normali dell'app, unirla ad altre con "Unisci Mappe" e
ri-condividerla. La vista "Mostra classe" della pagina studente è la
ri-condivisione live (stesso QR).

**Independent Test**: export layer → JSON con root L0 + nodi studente L1 →
import con "Apri JSON" → mappa valida.

**Acceptance Scenarios**:

1. **Given** un layer con nodi, **When** il docente lo esporta, **Then** ottiene `vault-dinamico-<gruppo>.json` importabile in MappAI (root + nodi del gruppo come figli L1 con relazione "propone")
2. **Given** il JSON esportato, **When** lo importa, **Then** la mappa si apre e si modifica come qualunque mappa

---

### Edge Cases

- Wi-Fi scolastica con client isolation: istruzioni nel modale docente (hotspot
  del PC o router d'aula); il server ascolta su tutte le interfacce.
- Nickname con caratteri strani/HTML: sanitizzati (2–24 caratteri, niente markup).
- Payload oversize o JSON rotto: respinti (cap 1 MB, validazione per nodo).
- Due studenti stesso nickname stesso device (ricarica pagina): ripresa normale.
- Mappa senza root (KG): il tema centrale = `rootNodeLabel` o etichetta di
  fallback; la lavagna funziona comunque (i nodi orbitano il centro).
- Token sbagliato/scaduto: 403 su ogni API; la pagina mostra errore chiaro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il docente DEVE poter avviare/fermare una sessione lavagna dal
  menu con mappa aperta; il server DEVE essere raggiungibile via QR sulla LAN.
- **FR-002**: Gli studenti DEVONO poter entrare con solo nickname di gruppo
  (niente account); nickname unico per dispositivo, ripresa sullo stesso device.
- **FR-003**: I nodi studente DEVONO essere rettangolari con testo (≤80 char),
  colore da palette fissa e taglia S/M/L; modificabili e trascinabili dal
  proprietario; max 30 per gruppo.
- **FR-004**: La sincronizzazione DEVE essere automatica (ultimo scrittore
  vince) e visibile allo studente (indicatore di stato).
- **FR-005**: Ogni gruppo DEVE apparire al docente come layer indipendente:
  toggle on/off, rinomina, colore distintivo. La mappa originale NON DEVE
  essere modificata dall'overlay.
- **FR-006**: I contributi DEVONO sopravvivere a crash/riavvio (persistenza su
  disco per gruppo, ripresa con stesso token).
- **FR-007**: Ogni layer DEVE essere esportabile come mappa MappAI valida
  (`vault-dinamico-<gruppo>.json`) importabile e modificabile.
- **FR-008**: Sicurezza minima di classe: token nel QR su ogni chiamata,
  adminToken mai nel QR, allowlist statica rigida, input sanitizzati.
- **FR-009**: La logica pura (validazione, merge, conversione layer→grafo)
  DEVE vivere in un modulo UMD testato in Node.
- **FR-010**: Stringhe UI bilingui secondo i meccanismi di progetto.

### Key Entities

- **Sessione**: nome mappa, etichetta root, token studente, adminToken, data.
- **Gruppo/Layer**: nickname, colore, deviceId, elenco nodi, revisione,
  ultimo aggiornamento. Un file per gruppo su disco.
- **Nodo studente**: id, testo, colore, taglia, posizione relativa al centro,
  timestamp. MAI mescolato con `appState.db.nodes`.

## Success Criteria *(mandatory)*

- **SC-001**: Uno studente passa da QR a primo nodo inviato in meno di 60 secondi.
- **SC-002**: Un riavvio dell'app a metà attività non perde alcun contributo.
- **SC-003**: Con 8 gruppi attivi la dashboard e l'overlay restano fluidi
  (polling, nessun blocco UI).
- **SC-004**: Il JSON esportato di ogni layer si importa senza errori e produce
  una mappa modificabile.
- **SC-005**: Suite Node estesa (core + server) verde.

## Assumptions

- Realtime = polling (3–5 s), come la dashboard del Garden: per l'uso in classe
  è indistinguibile dal push e azzera la complessità (niente WebSocket in v1).
- Porta 8766 (range 8766–8776) per non collidere col garden-server (8765).
- Anonimato: il nickname è l'unico identificativo; nessun dato personale
  persistito oltre al nickname scelto dal gruppo.
- Il salvataggio "vault-dinamico" v1 è un file JSON mappa (importabile e
  quindi anche salvabile come vault dall'app); la scrittura diretta di una
  cartella vault Markdown è un follow-up.
- Il merge Jigsaw adotterà lo stesso motore layer (contratto condiviso);
  l'integrazione Jigsaw non fa parte di questa feature.
