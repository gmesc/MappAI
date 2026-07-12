# Feature Specification: Landing "Costruisci / Insegna"

**Feature Branch**: `005-landing-insegna`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Restyle profondo della landing page MappAI con doppia modalità Costruisci/Insegna: eliminare il launcher di scelta all'avvio, toggle sulla landing per separare il flusso di preparazione (generazione MM/KG) dal flusso di lezione (materiali già pronti + avvio rapido delle attività QR in pochi click), con sezioni collassabili, filtro per classe attiva, registro sessioni e grade sui grafi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Avvio diretto e doppia modalità (Priority: P1)

Il docente avvia MappAI e si trova direttamente sulla landing dell'app, senza la schermata intermedia di scelta tra MappAI e lo Studio garden. Sulla landing, sotto la sezione hero (logo + bottoni impostazioni/info, che resta identica a oggi), un toggle "Costruisci / Insegna" separa i due flussi di lavoro: "Costruisci" mostra gli strumenti attuali di generazione mappe, "Insegna" mostra i materiali già pronti e gli avvii rapidi. L'app ricorda l'ultima modalità usata; al primo avvio assoluto parte su "Costruisci". Lo Studio garden resta raggiungibile dal bottone "Knowledge Garden" nel menu azioni, come oggi.

**Why this priority**: È lo scheletro di tutto il restyle: senza il boot diretto e il toggle non esistono le due viste. Da solo elimina già il passaggio illogico all'avvio.

**Independent Test**: Avviare l'app da zero e verificare che si apra la landing MappAI in modalità Costruisci; cambiare modalità, riavviare, verificare la persistenza; aprire lo Studio garden dal menu.

**Acceptance Scenarios**:

1. **Given** installazione fresca senza preferenze salvate, **When** l'app viene avviata, **Then** si apre direttamente la landing MappAI in modalità "Costruisci", senza schermata di scelta intermedia.
2. **Given** la landing aperta in "Costruisci", **When** il docente attiva il toggle "Insegna", **Then** l'area sotto l'hero mostra le sezioni della modalità Insegna e la sezione hero resta invariata (stesso logo, stessi bottoni).
3. **Given** il toggle su "Insegna", **When** l'app viene chiusa e riavviata, **Then** la landing si riapre in modalità "Insegna".
4. **Given** la landing in una qualunque modalità, **When** il docente apre il menu azioni e sceglie "Knowledge Garden", **Then** si apre la finestra Studio garden con il comportamento attuale.

---

### User Story 2 - Avvio rapido delle attività QR (Priority: P1)

In modalità "Insegna" il docente trova tre bottoni di avvio rapido: "Lavagna interattiva", "Materiali di studio", "Studio attivo live". Ciascuno apre un popup di scelta della classe (tra quelle create dal docente), poi un menu di scelta della mappa (o dei materiali) filtrato in modo intelligente: prima le mappe già avviate su quella classe, poi quelle con lo stesso grade della classe, poi comunque tutte le altre — il docente non è mai bloccato. Confermata la scelta, l'app carica il progetto e apre direttamente il wizard/hub dell'attività scelta.

**Why this priority**: È il valore centrale della feature: iniziare l'attività in classe in pochi click. Insieme alla US1 costituisce l'MVP.

**Independent Test**: Dalla landing Insegna, avviare una sessione Lavagna su una classe esistente in ≤ 4 click e verificare che il wizard si apra con la mappa scelta caricata.

**Acceptance Scenarios**:

1. **Given** modalità Insegna con almeno una classe creata e almeno un progetto salvato, **When** il docente clicca "Lavagna interattiva", **Then** appare il popup di scelta classe con l'elenco delle classi del docente.
2. **Given** il popup classe con la classe scelta, **When** il docente conferma, **Then** appare l'elenco delle mappe ordinato: prima quelle già avviate su quella classe, poi quelle con lo stesso grade, poi tutte le altre, distinguibili tra loro.
3. **Given** una mappa scelta dall'elenco, **When** il docente conferma, **Then** l'app carica quel progetto e apre direttamente il flusso dell'attività scelta (hub Lavagna / pannello Materiali / wizard Studio attivo live), senza passaggi manuali intermedi.
4. **Given** nessuna classe creata, **When** il docente clicca un bottone di avvio rapido, **Then** il popup propone di creare una classe (rimando alla gestione classi) oppure di continuare senza classe.
5. **Given** una classe mai usata su nessuna mappa e nessun grade assegnato ai grafi, **When** il docente arriva all'elenco mappe, **Then** vede comunque tutte le mappe disponibili con un'indicazione che nessuna è ancora associata alla classe.

---

### User Story 3 - Landing Insegna: materiali pronti e filtro classe (Priority: P2)

In modalità "Insegna" il docente trova tre sezioni collassabili: **Progetti esistenti** (elenco tabellare come l'attuale drawer, con chip delle classi attive su ciascun grafo), **Materiali di studio** (sintesi, dossier, fogli nodi, timeline già generati, con grafo di origine e classe, riapribili senza rigenerare) e **Quiz & flashcard** (elenco dei set già generati con nome, tipo, grafo di origine, classe e data). Accanto al toggle Costruisci/Insegna c'è un secondo toggle globale "Mostra tutto / Solo classe attiva" che filtra tutte le sezioni sulla classe selezionata nel chip di intestazione.

**Why this priority**: Trasforma la landing in un cruscotto di lezione: tutto ciò che è già pronto è visibile e riutilizzabile senza rigenerazioni (tempo e costi AI risparmiati).

**Independent Test**: Generare una sintesi e un set di quiz su una mappa, salvare il progetto con una classe attiva, tornare alla landing Insegna e ritrovare entrambi nelle rispettive sezioni; attivare il filtro classe e verificare che restino solo gli elementi di quella classe.

**Acceptance Scenarios**:

1. **Given** un registro sessioni con sessioni della mappa X sulla classe "1ª A", **When** il docente apre la sezione Progetti esistenti, **Then** la riga della mappa X mostra il chip "1ª A".
2. **Given** il toggle su "Solo classe attiva" con chip "1ª A", **When** il docente scorre le sezioni, **Then** ogni sezione mostra solo gli elementi riferibili alla 1ª A (per registro sessioni, classe di salvataggio o grade).
3. **Given** un documento archiviato (sintesi, dossier, foglio nodi o timeline), **When** il docente lo clicca nella sezione Materiali di studio, **Then** il documento si riapre così com'era, senza alcuna rigenerazione.
4. **Given** un progetto con quiz e flashcard salvato dopo l'introduzione della feature, **When** il docente apre la sezione Quiz & flashcard, **Then** vede ogni set con nome, tipo, grafo di origine, classe e data.
5. **Given** un progetto salvato prima della feature (nessun indice), **When** il docente lo risalva una volta, **Then** i suoi set compaiono nella sezione Quiz & flashcard.

---

### User Story 4 - Progetti in Costruisci con assegnazione grade (Priority: P2)

In modalità "Costruisci" il drawer "Progetti recenti" in fondo alla pagina non c'è più: al suo posto una sezione collassabile (chiusa di default) con lo stesso layout tabellare del drawer (Tipo / Titolo / Classe / Nodi / Creato il / azioni). Su ogni riga il docente può assegnare o modificare il **grade** del grafo (nuovo attributo del progetto, sia MM sia KG). Se un grafo senza grade viene selezionato in modalità Insegna, eredita automaticamente il grade della classe attiva del chip e l'assegnazione viene salvata.

**Why this priority**: Il grade è il dato che rende intelligente il filtro dei quick-start ("classe analoga" = stesso grade); la sezione collassabile libera la landing Costruisci mantenendo l'accesso ai progetti.

**Independent Test**: Aprire la sezione progetti in Costruisci, assegnare un grade a un grafo, riavviare e verificare la persistenza; selezionare in Insegna un grafo senza grade con una classe attiva e verificare l'ereditarietà.

**Acceptance Scenarios**:

1. **Given** modalità Costruisci, **When** il docente guarda la landing, **Then** il drawer inferiore non è presente e al suo posto c'è una sezione collassabile "Progetti", chiusa di default.
2. **Given** la sezione aperta, **When** il docente assegna un grade a un progetto, **Then** il grade persiste dopo riavvio e viene usato dai filtri della modalità Insegna.
3. **Given** un grafo senza grade e una classe attiva con grade "4ª media", **When** il docente seleziona quel grafo in modalità Insegna (elenco o quick-start), **Then** il grafo eredita il grade "4ª media" e l'assegnazione resta salvata.
4. **Given** la sezione progetti in Costruisci, **When** il docente clicca una riga, **Then** il progetto si carica come con l'attuale drawer (comportamento invariato: riprendi, elimina con conferma).

---

### User Story 5 - Archivio documenti esteso (Priority: P3)

L'archivio automatico dei documenti di studio, che oggi conserva solo Sintesi e Dossier, salva anche **Fogli nodi** e **Timeline**. La capienza sale da 12 a 30 documenti, con una protezione: se lo spazio di archiviazione locale si esaurisce, vengono eliminati i documenti più vecchi.

**Why this priority**: Amplia il paniere della sezione "Materiali di studio" ma non blocca nessun altro flusso; può arrivare per ultima.

**Independent Test**: Generare un foglio nodi e una timeline, tornare alla landing Insegna e ritrovarli nella sezione Materiali di studio; superare i 30 documenti e verificare che il più vecchio venga eliminato.

**Acceptance Scenarios**:

1. **Given** una mappa aperta, **When** il docente genera un foglio nodi o una timeline, **Then** il documento viene archiviato automaticamente come oggi accade per sintesi e dossier.
2. **Given** un archivio con 30 documenti, **When** ne viene generato un trentunesimo, **Then** il documento più vecchio viene eliminato e il nuovo archiviato.
3. **Given** spazio di archiviazione locale quasi esaurito, **When** l'archiviazione di un nuovo documento fallisce per quota, **Then** i documenti più vecchi vengono eliminati finché il salvataggio riesce (o l'archiviazione viene saltata senza errori bloccanti per il docente).

---

### Edge Cases

- **Nessuna classe creata**: i quick-start propongono la creazione di una classe o il proseguimento senza classe; le sessioni senza classe non generano chip né righe di registro attribuite a una classe.
- **Registro sessioni vuoto** (primo utilizzo): gli elenchi filtrati mostrano comunque tutte le mappe, con indicazione che nessuna è ancora associata alla classe — il docente non è mai bloccato.
- **Classe eliminata dopo sessioni registrate**: i chip mostrano il nome storico della classe; il filtro per quella classe non è più proponibile tra le classi attive.
- **Progetti salvati prima della feature**: nessun grade, nessun indice quiz — compaiono nelle sezioni via via che vengono risalvati o selezionati (ereditarietà grade); nessuna migrazione automatica.
- **Documento archiviato il cui progetto è stato eliminato**: resta visibile e riapribile (il documento è autonomo); il nome del grafo di origine resta come etichetta storica.
- **Spazio di archiviazione locale esaurito**: l'archiviazione degrada eliminando i documenti più vecchi; mai un errore bloccante durante la lezione.
- **Toggle "Solo classe attiva" con chip su "Generico"**: equivale a "Mostra tutto" (nessun filtro applicabile).
- **Ripristino comportamento precedente**: deve restare possibile con un intervento minimo e documentato (principio di reversibilità), senza reinstallare l'app.

## Requirements *(mandatory)*

### Functional Requirements

**Avvio**

- **FR-001**: All'avvio l'app MUST aprire direttamente la landing MappAI, senza schermata intermedia di scelta.
- **FR-002**: Lo Studio garden MUST restare raggiungibile dal bottone "Knowledge Garden" nel menu azioni, con il comportamento attuale.
- **FR-003**: Il ripristino del comportamento di avvio precedente MUST restare possibile tramite un'impostazione documentata (nessuna rimozione distruttiva).

**Toggle di modalità**

- **FR-004**: La landing MUST offrire un toggle "Costruisci / Insegna" posizionato sotto la sezione hero; la sezione hero (logo + bottoni impostazioni/info) MUST restare identica in entrambe le modalità.
- **FR-005**: La modalità selezionata MUST persistere tra i riavvii; al primo avvio assoluto la modalità MUST essere "Costruisci".

**Modalità Costruisci**

- **FR-006**: La modalità Costruisci MUST mostrare gli attuali strumenti di generazione MM/KG senza modifiche funzionali.
- **FR-007**: Il drawer "Progetti recenti" MUST essere sostituito da una sezione collassabile, chiusa di default, con lo stesso layout tabellare (Tipo / Titolo / Classe / Nodi / Creato il / azioni) e le stesse azioni (riprendi, elimina con conferma).
- **FR-008**: Ogni progetto (MM o KG) MUST poter ricevere un **grade** assegnabile e modificabile dalla sezione progetti; il grade MUST persistere.

**Modalità Insegna — sezioni**

- **FR-009**: La modalità Insegna MUST mostrare tre sezioni collassabili: "Progetti esistenti", "Materiali di studio", "Quiz & flashcard".
- **FR-010**: La sezione "Progetti esistenti" MUST mostrare per ogni grafo i chip delle classi attive su di esso, derivati dal registro sessioni.
- **FR-011**: La sezione "Materiali di studio" MUST elencare i documenti archiviati (sintesi, dossier, fogli nodi, timeline) con titolo, tipo, grafo di origine, classe e data; ogni documento MUST riaprirsi senza rigenerazione.
- **FR-012**: L'archivio automatico dei documenti MUST includere anche fogli nodi e timeline; la capienza MUST salire da 12 a 30 con protezione sulla quota di archiviazione (eliminazione dei più vecchi).
- **FR-013**: La sezione "Quiz & flashcard" MUST elencare i set generati con nome, tipo, grafo di origine, classe e data, leggendo un indice leggero scritto al salvataggio del progetto — senza mai rileggere gli interi salvataggi dei progetti.
- **FR-014**: I progetti salvati prima della feature MUST comparire nella sezione Quiz & flashcard dopo il loro primo risalvataggio (nessuna migrazione automatica).
- **FR-015**: Accanto al toggle di modalità MUST esserci un toggle globale "Mostra tutto / Solo classe attiva" che filtra tutte le sezioni di Insegna sulla classe attiva del chip; con chip su "Generico" il filtro non si applica.

**Registro sessioni**

- **FR-016**: Ogni avvio di sessione Lavagna, Studio attivo live o Materiali MUST registrare una voce {mappa, classe, attività, data} in un registro persistente.
- **FR-017**: Il registro MUST alimentare i chip delle classi sui progetti e l'ordinamento/filtri dei quick-start.

**Avvio rapido QR**

- **FR-018**: La modalità Insegna MUST offrire tre bottoni di avvio rapido: "Lavagna interattiva", "Materiali di studio", "Studio attivo live".
- **FR-019**: Il flusso di ogni avvio rapido MUST essere: popup scelta classe → elenco mappe/materiali filtrato → caricamento automatico del progetto scelto → apertura diretta del wizard/hub dell'attività, senza passaggi manuali intermedi.
- **FR-020**: L'elenco mappe dei quick-start MUST ordinare: (1) mappe già avviate sulla classe scelta (registro), (2) mappe con grade uguale al grade della classe, (3) tutte le altre — tutte selezionabili, il docente non è mai bloccato.
- **FR-021**: Se il docente non ha classi, il popup MUST proporre la creazione di una classe o il proseguimento senza classe.
- **FR-022**: Un grafo senza grade selezionato in modalità Insegna MUST ereditare il grade della classe attiva del chip; l'assegnazione MUST essere salvata.

**Trasversali**

- **FR-023**: Tutti i nuovi testi dell'interfaccia MUST essere disponibili in italiano e inglese secondo le convenzioni bilingue del progetto.
- **FR-024**: Le funzionalità esistenti raggiungibili oggi dalla landing (generazione, apertura progetti, import, hub) MUST restare raggiungibili e invariate nel comportamento.

### Key Entities

- **Progetto salvato**: voce dell'elenco progetti; attributi: identificativo, nome, tipo (MM/KG), numero nodi, data creazione, classe di salvataggio, vault di riferimento, **grade** (nuovo, opzionale).
- **Voce del registro sessioni**: traccia di un'attività avviata; attributi: riferimento alla mappa/progetto, classe (opzionale), tipo attività (lavagna | studio attivo live | materiali), data/ora.
- **Documento archiviato**: materiale di studio riapribile; attributi: titolo, tipo (sintesi | dossier | foglio nodi | timeline), grafo di origine, classe, data, contenuto autonomo.
- **Voce indice Quiz & flashcard**: descrittore leggero di un set; attributi: nome set, tipo (quiz | flashcard), grafo di origine, classe, data. Scritto al salvataggio del progetto, mai derivato rileggendo i salvataggi completi.
- **Classe** (esistente): nome, grade, sistema scolastico, registro linguistico, note — riusata da chip, popup e filtri.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dal lancio dell'app all'apertura del wizard di un'attività QR (lavagna, materiali o studio attivo live) su una mappa già usata con la classe: **al massimo 4 interazioni** dopo il caricamento della landing (bottone quick-start → classe → mappa → conferma).
- **SC-002**: L'avvio dell'app porta alla landing operativa **senza alcuna schermata intermedia** (oggi: 1 schermata di scelta in più).
- **SC-003**: Un materiale di studio generato in una sessione precedente è riapribile dalla landing **senza alcuna rigenerazione** (zero attesa di generazione, zero chiamate AI).
- **SC-004**: Con il filtro "Solo classe attiva" inserito, il **100%** degli elementi mostrati nelle sezioni Insegna è riferibile alla classe attiva (per registro, classe di salvataggio o grade).
- **SC-005**: Nessuna regressione sui flussi esistenti: generazione MM/KG, apertura/riprendi progetti, import, hub e menu funzionano come prima del restyle.

## Assumptions

- **"Classe analoga" = stesso grade** (confermato dall'utente). Il sistema scolastico non entra nel confronto in questa versione.
- **Ereditarietà del grade**: quando un grafo senza grade viene selezionato in Insegna con una classe attiva, il grade della classe viene **salvato sul progetto** (non solo usato al volo), così i filtri successivi ne beneficiano.
- **Scelta "senza classe" nei quick-start**: consentita (la Lavagna usa nickname di gruppo e i Materiali non richiedono login); le sessioni senza classe non producono chip.
- **Registro sessioni parte vuoto**: nessuna ricostruzione retroattiva dalle cartelle delle sessioni passate su disco.
- **Nessuna migrazione per quiz/flashcard esistenti**: i set dei progetti salvati prima della feature compaiono dopo il primo risalvataggio (confermato dall'utente).
- **Capienza archivio 30** (confermata dall'utente), con eliminazione dei documenti più vecchi in caso di spazio esaurito.
- **La numerazione feature è 005**: lo slot 004 è già occupato da `004-esposizione-orale`.

## Out of Scope

- **Conversione delle 7 modalità di Studio Attivo in-app in tipi di domanda live** (feature futura separata): intruso, indice e verbi sono convertibili in domande a scelta multipla con i generatori deterministici esistenti; la sequenza richiederebbe un nuovo tipo di domanda (riordino); le modalità strutturali/spaziali (1-2) non sono adatte al player a domande su telefono.
- **Ritraduzione o riclassificazione retroattiva** dei materiali già generati.
- **Modifiche allo Studio garden / editor voxel**: resta raggiungibile come oggi, nessun cambiamento interno.
- **iPadOS**: il restyle riguarda l'app desktop; l'astrazione per un futuro porting resta un vincolo architetturale, non un requisito di questa feature.
