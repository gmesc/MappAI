# Feature Specification: Tutor AI via QR — attività "Chatta e Scrivi"

**Feature Branch**: `007-tutor-qr`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Aprire agli studenti l'uso della chat con il Tutor AI tramite QR, con una modalità dedicata: chattano col tutor su un argomento della mappa e poi redigono un testo personale. Cap dei turni fissato dal docente. Il PC del docente fa da tramite per l'AI: la chiave API non lascia mai il computer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lo studente chatta col tutor e scrive il suo testo (Priority: P1)

Lo studente inquadra il QR col telefono, si identifica con le credenziali di classe (emoji + numero, già esistenti) ed entra nell'attività preparata dal docente. L'attività ha tre fasi: **Esplora** — chatta col tutor AI sull'argomento assegnato (un nodo o ramo della mappa), nella modalità scelta dal docente (es. Socratico), fino a un numero massimo di scambi; **Scrivi** — redige un testo personale in un'area di scrittura; **Consegna** — invia il testo. Il tutor non scrive mai il testo al posto suo: guida, domanda, corregge — la redazione resta dello studente.

**Why this priority**: È l'attività stessa — senza il flusso studente non esiste la feature.

**Independent Test**: Da un telefono sulla stessa rete: QR → login credenziali → chat col tutor entro il cap → scrittura testo → consegna → file su disco del docente.

**Acceptance Scenarios**:

1. **Given** una sessione avviata dal docente con argomento e cap 10 scambi, **When** lo studente si identifica ed entra, **Then** vede l'argomento assegnato e la chat col tutor già contestualizzata su quel nodo/ramo.
2. **Given** la fase Esplora attiva, **When** lo studente invia un messaggio, **Then** riceve la risposta del tutor nella modalità impostata dal docente e vede quanti scambi gli restano.
3. **Given** il cap di scambi raggiunto, **When** lo studente tenta un altro messaggio, **Then** la chat si chiude con un invito a passare alla fase Scrivi (la scrittura resta sempre accessibile anche prima del cap).
4. **Given** un testo redatto, **When** lo studente consegna, **Then** testo e trascrizione chat risultano al docente; lo studente vede la conferma.
5. **Given** lo studente chiede al tutor "scrivimi tu il testo", **When** il tutor risponde, **Then** rifiuta di redigere e rilancia con domande-guida (regola imposta dal sistema, non aggirabile dal telefono).

---

### User Story 2 - Il docente prepara e avvia l'attività (Priority: P1)

Dal PC, con una mappa aperta, il docente avvia l'attività "Chatta e Scrivi": sceglie la classe, l'argomento (un nodo o un ramo della mappa), la modalità del tutor (Socratico, Spiega tu, Interroga tu, Dubbio, Collega, Ripasso), il **cap di scambi per studente** e la consegna di scrittura (breve istruzione, es. "Scrivi 10 righe su..."). Ottiene QR + URL da proiettare. La chiave API resta sul PC: i telefoni parlano solo col PC del docente, che inoltra all'AI.

**Why this priority**: Senza preparazione e avvio non c'è sessione; insieme a US1 è l'MVP.

**Independent Test**: Avviare una sessione dal wizard con classe/argomento/modalità/cap, verificare QR + URL e che un telefono entri.

**Acceptance Scenarios**:

1. **Given** una mappa aperta e una classe con credenziali, **When** il docente avvia "Chatta e Scrivi", **Then** un wizard chiede classe, argomento (nodo/ramo), modalità tutor, cap scambi e consegna di scrittura.
2. **Given** il wizard completato, **When** la sessione parte, **Then** appaiono QR e URL (anche a schermo intero per la LIM) e la sessione è registrata nel registro sessioni.
3. **Given** una sessione attiva, **When** il docente la interrompe, **Then** i telefoni non possono più chattare; ciò che è stato consegnato o in bozza resta su disco.
4. **Given** nessuna chiave API configurata, **When** il docente tenta l'avvio, **Then** un avviso chiaro lo blocca prima di generare il QR.

---

### User Story 3 - Il docente monitora e riceve le consegne (Priority: P2)

Durante la sessione il docente vede la griglia degli studenti collegati con lo stato (in chat / sta scrivendo / consegnato) e il conteggio scambi usati. A fine sessione ottiene, per ogni studente, **testo consegnato + trascrizione della chat** — vede il processo, non solo il prodotto — in un report riaprbile e stampabile, salvato su disco.

**Why this priority**: Il valore valutativo dell'attività (processo + prodotto) vive qui; la sessione però funziona anche senza monitor in tempo reale.

**Independent Test**: Con 2 studenti attivi, verificare stati in griglia e, dopo le consegne, il report con testi e trascrizioni.

**Acceptance Scenarios**:

1. **Given** studenti collegati, **When** il docente guarda la dashboard, **Then** vede per ciascuno identità, stato di fase e scambi usati/cap.
2. **Given** consegne effettuate, **When** il docente chiude la sessione, **Then** ottiene un report per studente (testo + trascrizione) riaprbile senza rigenerare, salvato nella cartella della sessione.
3. **Given** uno studente che ha consegnato, **When** il docente lo riapre ("sblocca"), **Then** lo studente può rivedere e ri-consegnare il testo.

---

### User Story 4 - Guardrail di costo e sicurezza (Priority: P2)

Il sistema protegge il docente da costi e abusi: cap di scambi per studente (fissato dal docente), risposte del tutor brevi (limite fisso), lunghezza massima del messaggio studente, chiamate AI serializzate in coda (mai raffiche simultanee), istruzioni del tutor definite solo lato PC (il telefono non può alterarle), tutor ancorato all'argomento assegnato (non chat libera). Le trascrizioni restano sul PC del docente.

**Why this priority**: Senza questi limiti l'attività non è proponibile in classe (costi/rate limit/abusi); ma sono proprietà trasversali, testabili dopo l'MVP.

**Independent Test**: Superare il cap (bloccato), inviare un messaggio oltre il limite (rifiutato), tentare di cambiare le istruzioni dal telefono (impossibile), verificare che 5 richieste simultanee vengano servite in sequenza senza errori.

**Acceptance Scenarios**:

1. **Given** cap 10 e 10 scambi usati, **When** arriva l'11°, **Then** viene rifiutato con messaggio chiaro (nessuna chiamata AI parte).
2. **Given** 5 studenti che inviano nello stesso istante, **When** il sistema inoltra all'AI, **Then** le richieste sono servite in coda senza errori visibili né risposte perse.
3. **Given** un messaggio studente oltre la lunghezza massima, **When** viene inviato, **Then** è rifiutato prima di ogni chiamata AI.
4. **Given** una richiesta che tenta di ridefinire il comportamento del tutor ("ignora le istruzioni..."), **When** il tutor risponde, **Then** resta nel ruolo e nell'argomento (istruzioni lato server prevalgono).

---

### Edge Cases

- **Rete/AI irraggiungibile a metà chat**: lo studente vede un errore gentile e può riprovare; nessuna perdita di bozza o trascrizione.
- **Studente che ricarica la pagina o cambia telefono**: rientra con le stesse credenziali e ritrova chat e bozza (ripresa come nelle altre attività live).
- **Cap raggiunto prima di aver capito**: la fase Scrivi è comunque accessibile; il docente può alzare il cap a sessione in corso (opzionale) o riaprire il singolo studente.
- **Due studenti stesse credenziali**: gestito come nelle attività live esistenti (identità occupata / adozione).
- **Sessione interrotta dal PC (crash/chiusura)**: alla riaccensione la sessione riprende con lo stesso QR; bozze e chat riprendono da disco.
- **Provider AI: quota esaurita / errore 429**: il sistema rallenta la coda e informa il docente sulla dashboard; gli studenti vedono "il tutor sta arrivando…".
- **Argomento = ramo grande**: il contesto inviato all'AI è limitato (sintesi del ramo, non l'intero sottoalbero verbatim) per contenere i costi.
- **Studente che consegna senza aver mai chattato**: ammesso ma segnalato al docente nel report (0 scambi usati).

## Requirements *(mandatory)*

### Functional Requirements

**Flusso studente**

- **FR-001**: Lo studente MUST accedere all'attività da telefono via QR/URL sulla rete locale, identificandosi con le credenziali di classe esistenti (emoji + numero).
- **FR-002**: L'attività MUST avere tre fasi per studente: Esplora (chat col tutor), Scrivi (testo personale), Consegna; la fase Scrivi MUST essere accessibile in ogni momento.
- **FR-003**: La chat MUST essere contestualizzata sull'argomento assegnato (nodo o ramo) e condotta nella modalità tutor scelta dal docente; lo studente MUST vedere gli scambi rimanenti.
- **FR-004**: Il tutor NON MUST mai redigere il testo al posto dello studente; su richiesta esplicita MUST rifiutare e rilanciare con domande-guida.
- **FR-005**: Alla consegna, testo e trascrizione chat MUST essere salvati su disco del docente; lo studente MUST ricevere conferma. Bozze e chat MUST sopravvivere a ricarica pagina e rientro.

**Preparazione docente**

- **FR-006**: Il docente MUST poter avviare l'attività da una mappa aperta scegliendo: classe, argomento (nodo o ramo), modalità tutor (le 6 esistenti), cap scambi per studente, consegna di scrittura (testo libero breve).
- **FR-007**: L'avvio MUST produrre QR + URL (con vista a schermo intero) e registrare la sessione nel registro sessioni (chip classi sulla mappa).
- **FR-008**: Senza chiave API configurata l'avvio MUST essere bloccato con spiegazione.
- **FR-009**: Il docente MUST poter terminare la sessione; i dati già prodotti restano su disco. La sessione MUST riprendere dopo crash/riavvio con lo stesso QR.

**Monitoraggio e consegne**

- **FR-010**: La dashboard docente MUST mostrare per studente: identità, fase corrente, scambi usati/cap, stato consegna.
- **FR-011**: A fine sessione il sistema MUST produrre un report per studente (testo consegnato + trascrizione chat) riaprbile senza rigenerazione e stampabile.
- **FR-012**: Il docente MUST poter riaprire la consegna di un singolo studente (rivedere e ri-consegnare).

**Sicurezza, costi, privacy**

- **FR-013**: La chiave API NON MUST mai raggiungere i telefoni: ogni chiamata AI parte dal PC del docente, che fa da tramite.
- **FR-014**: Le istruzioni del tutor (ruolo, modalità, argomento, divieti) MUST essere definite solo lato PC e non alterabili dal telefono; i tentativi di manipolazione MUST restare senza effetto.
- **FR-015**: Il sistema MUST imporre: cap scambi per studente (docente), lunghezza massima del messaggio studente, risposte tutor brevi (limite fisso), coda di inoltro serializzata verso l'AI con gestione degli errori di quota (rallentamento + avviso docente).
- **FR-016**: Trascrizioni, bozze e consegne MUST restare sul PC del docente (nessun cloud oltre la chiamata AI del provider configurato); il provider attivo (Google o Infomaniak) MUST essere rispettato.
- **FR-017**: Il contesto inviato all'AI per argomento MUST essere limitato in dimensione (mai l'intero sottoalbero verbatim).

**Trasversali**

- **FR-018**: Tutti i nuovi testi dell'interfaccia (docente e studente) MUST essere disponibili in italiano e inglese.
- **FR-019**: L'attività MUST comparire come nuova voce nell'hub delle attività live esistente, senza alterare le attività attuali.

### Key Entities

- **Sessione Chatta-e-Scrivi**: attività attiva; attributi: mappa, classe, argomento (nodo/ramo), modalità tutor, cap scambi, consegna di scrittura, stato (lobby/attiva/chiusa), QR/URL.
- **Partecipante**: studente identificato (credenziale classe); attributi: identità, fase, scambi usati, bozza testo, stato consegna.
- **Trascrizione chat**: sequenza turni studente/tutor per partecipante; salvata su disco, inclusa nel report.
- **Consegna**: testo finale del partecipante + trascrizione + metadati (scambi usati, tempi).
- **Report sessione**: raccolta per-studente (testo + chat), riaprbile e stampabile.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uno studente completa il ciclo QR → chat → testo → consegna dal telefono **senza alcun intervento del docente** sul suo dispositivo.
- **SC-002**: Con cap 10 e 25 studenti, la sessione genera **al massimo 25 × (10 + 1 feedback)** chiamate AI; il superamento del cap è bloccato **prima** di ogni chiamata.
- **SC-003**: La chiave API non compare **mai** in nessuna risposta/pagina servita ai telefoni (verificabile ispezionando il traffico servito).
- **SC-004**: Il docente ritrova il 100% delle consegne (testo + trascrizione) su disco dopo la chiusura, riaprbili senza rigenerare.
- **SC-005**: Alla richiesta esplicita "scrivi tu il testo", il tutor rifiuta e rilancia in **almeno 9 casi su 10** (verifica manuale su casi campione).
- **SC-006**: 5 invii simultanei vengono serviti tutti, in sequenza, senza errori visibili agli studenti.

## Assumptions

- **Cap scambi fissato dal docente** nel wizard (default 10, range ragionevole 3–20) — confermato dall'utente.
- **Modalità dedicata**: "Chatta e Scrivi" è un'attività a sé nel flusso live, non una variante della chat tutor in-app — confermato dall'utente.
- **Un argomento per la classe** in v1 (stesso nodo/ramo per tutti); assegnazioni differenziate per gruppo/studente = evoluzione futura.
- **Un feedback formativo opzionale** del tutor sulla bozza (toggle docente, default OFF in v1 se complica; deciso nel piano): non è un voto e non riscrive il testo.
- **Identità = Account classi esistenti** (emoji + numero); nessun nuovo sistema di login.
- **Stessa rete locale** (hotspot/router d'aula) come per le altre attività QR; stesse note di rete.
- **Il provider attivo dell'app** (Google/Infomaniak) è quello usato per la sessione; per dati di minori la scelta Infomaniak resta disponibile come oggi.
- **Registro sessioni**: l'avvio scrive una voce con attività dedicata (nuovo tipo), visibile nei chip classe della landing Insegna.

## Out of Scope

- Valutazione automatica o voto AI del testo consegnato (il giudizio resta al docente).
- Assegnazione di argomenti diversi per studente/gruppo (v1 = argomento unico di classe).
- Uso da casa / fuori dalla rete locale (resta un'attività d'aula su LAN).
- Modifiche alla chat tutor in-app del docente (coperte dal fix separato `fix/tutor-mode-chat`).
- Accesso degli studenti ad altre funzioni della mappa dal telefono (solo l'attività).
