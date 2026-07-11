# Feature Specification: Esposizione orale → mappa ("Esponi l'argomento")

**Feature Branch**: `004-esposizione-orale`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Esposizione orale → mappa: nuova funzionalità 'Esponi l'argomento' per MappAI. Uno studente registra (in-app via microfono) o carica un file audio della propria esposizione orale di un argomento. L'audio viene trascritto (STT via Gemini multimodale su Google; via Whisper su Infomaniak per privacy GDPR svizzera). Tre capacità: (1) MVP — audio come nuovo tipo di fonte; (2) Coverage check — modalità di Studio attivo '🎤 Esponi' con overlay heat sulla mappa e citazioni come prova; (3) Mappa del discorso — generazione libera dal transcript con metriche strutturali deterministiche come feedback formativo. Vincoli: audio mai persistito di default; tolleranza parafrasi; anti-pappagallo; feedback visivo mai percentuale secca (target BES/DSA); taratura tramite classe attiva; test su entrambi i provider. Fuori scope: integrazione MappAI Live (follow-up)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audio come fonte per la generazione (Priority: P1)

Uno studente (o un docente) aggiunge una registrazione audio tra le fonti del
progetto — caricando un file dal disco (es. registrato col telefono) oppure
registrandosi direttamente nell'app col microfono. L'app trascrive l'audio in
testo, mostra il transcript, e da quel momento il transcript si comporta come
qualunque altra fonte testuale: partecipa alla normale generazione di MindMap
o Knowledge Graph. L'audio originale viene eliminato subito dopo la
trascrizione; resta solo il testo.

**Why this priority**: è il mattone abilitante di tutto il resto (senza
trascrizione non esistono le storie 2 e 3) ed è indipendentemente utile da
solo: un docente può generare una mappa dalla registrazione di una propria
lezione, uno studente dalla registrazione di un ripasso a voce. È la fetta
più piccola che consegna valore.

**Independent Test**: caricare un file audio di 3-5 minuti con contenuto
disciplinare noto → il transcript compare tra le fonti → avviare la
generazione MM → la mappa riflette i concetti detti nell'audio. Verificare
che il file audio non sia stato salvato da nessuna parte.

**Acceptance Scenarios**:

1. **Given** progetto sulla landing con fonti vuote, **When** l'utente carica
   un file audio in un formato comune (m4a/mp3/wav), **Then** l'app trascrive,
   mostra il transcript come fonte testuale con titolo riconoscibile, e il
   file audio temporaneo viene eliminato.
2. **Given** microfono disponibile e permesso concesso, **When** l'utente
   registra la propria voce nell'app e ferma la registrazione, **Then**
   l'audio viene trascritto e il transcript entra tra le fonti, senza che
   l'audio venga persistito.
3. **Given** un transcript tra le fonti, **When** l'utente avvia la
   generazione MM o KG, **Then** la generazione procede identica a quella da
   fonte testuale (nessun percorso speciale a valle).
4. **Given** provider Infomaniak selezionato, **When** l'utente trascrive un
   audio, **Then** la trascrizione avviene tramite il servizio del provider
   svizzero (i dati vocali non transitano da provider extra-UE).
5. **Given** il transcript appena prodotto, **When** l'utente lo apre,
   **Then** può leggerlo e correggerlo a mano prima di usarlo (gli errori di
   trascrizione non devono penalizzare lo studente a valle).

---

### User Story 2 - Coverage check "🎤 Esponi" (Priority: P2)

Con una mappa di riferimento aperta (quella su cui ha studiato), lo studente
avvia la modalità di Studio attivo "Esponi l'argomento": si registra mentre
espone a voce l'argomento come farebbe in un'interrogazione (o carica un
audio già registrato). L'app trascrive e valuta, concetto per concetto della
mappa, se lo studente lo ha coperto, coperto parzialmente o non menzionato —
citando come prova le parole esatte dello studente. Il risultato appare come
colorazione dei nodi direttamente sulla mappa (verde = detto, ambra =
parziale, grigio = assente, con segnale non-cromatico ridondante) più un
elenco leggibile delle citazioni. La sessione entra nel percorso di studio
dello studente e aggiorna la sua padronanza per nodo.

**Why this priority**: è il cuore pedagogico della feature — autovalutazione
dell'esposizione orale, il canale in cui molti studenti BES/DSA sono più
forti. Trasforma l'idea da "giocattolo" a strumento: interrogazione simulata
senza ansia, con prove verificabili (le citazioni) invece di un giudizio
opaco.

**Independent Test**: con la mappa demo aperta, registrare un'esposizione che
copre volutamente solo 2 rami su 4 → i nodi dei 2 rami esposti risultano
verdi/ambra con citazioni pertinenti, i nodi degli altri 2 rami grigi; la
padronanza dei nodi coperti aumenta, quella dei nodi assenti no.

**Acceptance Scenarios**:

1. **Given** mappa di riferimento aperta e modalità "Esponi" avviata,
   **When** lo studente registra un'esposizione e conferma, **Then** entro un
   tempo ragionevole ogni concetto della mappa (o del ramo scelto) riceve un
   verdetto coperto/parziale/assente con citazione dal transcript per i
   verdetti coperto e parziale.
2. **Given** lo studente dice "le piante mangiano la luce per crescere",
   **When** la mappa contiene il concetto "fotosintesi", **Then** il concetto
   risulta almeno parzialmente coperto (tolleranza alla parafrasi — le parole
   del ragazzo contano, non il lessico tecnico).
3. **Given** lo studente recita quasi parola per parola la descrizione di un
   nodo, **When** l'app valuta la copertura, **Then** il nodo viene marcato
   come "recitato" (non pieno merito) con l'invito a riformulare con parole
   proprie.
4. **Given** la valutazione completata, **When** lo studente guarda la mappa,
   **Then** vede i nodi colorati per esito CON segnale ridondante non
   cromatico (icona/tratteggio/ARIA) e NESSUNA percentuale secca in
   primo piano; il dettaglio testuale mostra le citazioni come prova.
5. **Given** mappa grande (oltre la soglia di carico cognitivo), **When** lo
   studente avvia "Esponi", **Then** può scegliere di esporre un solo ramo
   (macro-area) invece dell'intera mappa.
6. **Given** la stessa registrazione valutata due volte, **When** si
   confrontano gli esiti, **Then** i verdetti per concetto sono stabili (la
   fiducia dello studente dipende dalla ripetibilità del giudizio).
7. **Given** una classe attiva impostata (es. 2ª media, registro semplice),
   **When** l'app valuta l'esposizione, **Then** il giudizio è tarato sul
   registro della classe (a una 2ª media non si chiede lessico da liceo).
8. **Given** sessione conclusa, **When** lo studente riapre i propri
   progressi, **Then** la sessione di esposizione compare nel percorso di
   studio e la padronanza per nodo riflette gli esiti.

---

### User Story 3 - Mappa del discorso con metriche strutturali (Priority: P3)

Dopo (o indipendentemente da) il coverage check, lo studente può generare la
"mappa del proprio discorso": una mappa costruita liberamente dal transcript
della sua esposizione, affiancata da un feedback formativo in linguaggio
piano derivato da metriche strutturali deterministiche: se la mappa risulta
una "stella" povera di collegamenti significa che lo studente ha elencato
concetti senza collegarli; se le relazioni sono tutte generiche significa che
non ha espresso ragionamenti causali ("perché", "quindi", "a causa di").

**Why this priority**: feedback formativo sulla QUALITÀ della struttura del
discorso, complementare al coverage (che misura solo il COSA). Valore alto ma
dipende dalle fondamenta delle storie 1-2 e ha natura più esplorativa: la
mappa generata è materiale di riflessione, non di valutazione.

**Independent Test**: registrare due esposizioni dello stesso argomento — una
"a elenco" (concetti in fila senza nessi) e una "ragionata" (con nessi
causali espliciti) → la prima produce una mappa a stella con feedback "hai
elencato senza collegare", la seconda una mappa più densa con relazioni
tipizzate e feedback che lo riconosce.

**Acceptance Scenarios**:

1. **Given** un transcript di esposizione disponibile, **When** lo studente
   chiede la mappa del discorso, **Then** l'app genera una mappa dal solo
   transcript e la mostra insieme a un riquadro di feedback in linguaggio
   piano (niente numeri grezzi in primo piano).
2. **Given** un'esposizione "a elenco", **When** la mappa del discorso viene
   analizzata, **Then** il feedback segnala che i concetti sono stati
   nominati ma poco collegati, con un suggerimento concreto (es. "prova a
   dire PERCHÉ un concetto porta all'altro").
3. **Given** la mappa del discorso a video, **When** lo studente la confronta
   con la mappa di riferimento, **Then** può passare dall'una all'altra senza
   perdere la mappa di riferimento (la mappa del discorso non sovrascrive né
   sporca il progetto).
4. **Given** la mappa del discorso generata, **When** lo studente chiude la
   vista, **Then** la mappa del discorso è scartabile senza lasciare tracce
   nel progetto (con possibilità esplicita di salvarla a parte se lo
   desidera).

---

### Edge Cases

- Audio silenzioso, inintelligibile o transcript vuoto → messaggio amichevole
  ("Non ho capito l'audio — riprova in un ambiente più silenzioso"), nessuna
  fonte fantasma aggiunta, nessuna sessione registrata.
- Permesso microfono negato → l'app propone il caricamento file come
  alternativa, senza vicolo cieco.
- Registrazione troppo lunga (oltre il tetto di durata) → avviso PRIMA di
  iniziare e stop automatico con messaggio chiaro al raggiungimento del
  tetto; il già registrato resta utilizzabile.
- File audio in formato non supportato o corrotto → errore leggibile con
  l'elenco dei formati accettati.
- Chiave API assente/scaduta → stesso comportamento amichevole della
  generazione mappe (toast, nessun crash).
- Lingua dell'esposizione diversa dalla lingua della mappa (es. mappa in
  italiano, studente espone in inglese) → la valutazione avviene comunque; la
  copertura non penalizza la lingua di per sé.
- Mappa di riferimento senza descrizioni ricche (nodi con sola label) → il
  coverage valuta sul titolo del concetto; l'anti-recitazione non scatta
  (niente testo da recitare).
- Interruzione a metà (crash, chiusura app) durante registrazione o
  valutazione → nessun file audio orfano lasciato su disco; alla riapertura
  lo stato del progetto è integro.
- Due valutazioni della stessa mappa in sequenza → la seconda sovrascrive
  l'overlay della prima; il percorso di studio registra entrambe le sessioni.
- Studente che espone concetti EXTRA non presenti nella mappa → gli extra non
  penalizzano il coverage; la mappa del discorso (storia 3) li rende visibili
  come ricchezza o come divagazione.

## Requirements *(mandatory)*

### Functional Requirements

**Trascrizione e privacy (storia 1)**

- **FR-001**: Il sistema DEVE accettare l'audio come nuovo tipo di fonte, in
  due modi: caricamento file nei formati comuni (almeno m4a, mp3, wav) e
  registrazione in-app dal microfono.
- **FR-002**: Il sistema DEVE trascrivere l'audio in testo con entrambi i
  provider AI supportati; con il provider svizzero i dati vocali NON devono
  transitare da servizi extra-UE (requisito GDPR per dati educativi).
- **FR-003**: L'audio NON DEVE mai essere persistito di default: qualunque
  copia temporanea viene eliminata subito dopo la trascrizione (anche in caso
  di errore o interruzione). Sopravvive solo il transcript.
- **FR-004**: Il transcript DEVE essere mostrato all'utente e correggibile a
  mano prima dell'uso (generazione o valutazione).
- **FR-005**: Il transcript DEVE entrare nella pipeline di generazione MM/KG
  come normale fonte testuale, senza percorsi speciali a valle.
- **FR-006**: Il sistema DEVE imporre un tetto di durata alla registrazione
  (default: 15 minuti) con avviso preventivo e stop pulito.

**Coverage check (storia 2)**

- **FR-007**: Con una mappa di riferimento aperta, il sistema DEVE valutare
  in un'unica passata la copertura di ogni concetto in scope: esito
  coperto / parziale / assente, con citazione testuale dal transcript come
  prova per gli esiti coperto e parziale.
- **FR-008**: La valutazione DEVE tollerare la parafrasi: un concetto
  espresso con parole proprie (anche imprecise) conta come copertura almeno
  parziale; il lessico tecnico mancante non azzera il merito.
- **FR-009**: Il sistema DEVE riconoscere la recitazione quasi letterale
  della descrizione di un nodo (riuso del rilevatore di somiglianza
  anti-pappagallo esistente) e marcarla come "recitato", distinta dalla
  copertura genuina, con invito a riformulare.
- **FR-010**: L'esito DEVE essere mostrato come overlay sulla mappa (verde =
  coperto, ambra = parziale, grigio = assente) SEMPRE accompagnato da un
  segnale ridondante non cromatico (icona, tratteggio, ARIA) — mai solo
  colore.
- **FR-011**: Il feedback rivolto allo studente NON DEVE esporre percentuali
  secche in primo piano; il dettaglio quantitativo resta disponibile ma
  subordinato al feedback qualitativo (esiti per concetto + citazioni).
- **FR-012**: Su mappe oltre la soglia di carico cognitivo, lo studente DEVE
  poter limitare lo scope a un singolo ramo (macro-area).
- **FR-013**: A parità di transcript, i verdetti per concetto DEVONO essere
  stabili tra valutazioni ripetute (obiettivo di ripetibilità: vedi SC-002).
- **FR-014**: La sessione di esposizione DEVE essere registrata nel percorso
  di studio dello studente (metrica di tipo copertura) e aggiornare la
  padronanza per nodo secondo il meccanismo esistente.
- **FR-015**: La valutazione DEVE essere tarata sul profilo della classe
  attiva quando presente (registro atteso, note della classe), riusando il
  meccanismo di taratura esistente; senza classe attiva il comportamento
  resta neutro.

**Mappa del discorso (storia 3)**

- **FR-016**: Il sistema DEVE poter generare una mappa dal solo transcript
  dell'esposizione ("mappa del discorso"), visualizzata SENZA sovrascrivere
  né modificare il progetto/mappa di riferimento correnti.
- **FR-017**: La mappa del discorso DEVE essere accompagnata da un feedback
  formativo in linguaggio piano derivato da metriche strutturali
  deterministiche (densità dei collegamenti, topologia a stella, quota di
  relazioni generiche), con suggerimenti concreti e mai numeri grezzi in
  primo piano.
- **FR-018**: La mappa del discorso DEVE essere scartabile senza tracce, con
  salvataggio a parte solo su azione esplicita dell'utente.

**Trasversali**

- **FR-019**: Tutte le nuove superfici UI DEVONO essere bilingui (IT/EN) nei
  due dizionari, e i testi generati dall'AI DEVONO rispettare l'impostazione
  lingua-mappe esistente.
- **FR-020**: La funzionalità DEVE stare dietro un interruttore reversibile
  (kill-switch documentato) finché non validata, secondo la prassi del
  progetto.
- **FR-021**: Ogni errore (permessi, formati, rete, chiave API) DEVE produrre
  un messaggio amichevole e recuperabile — mai stati bloccanti o crash.

### Key Entities

- **Registrazione audio**: dato effimero (file caricato o presa microfono);
  esiste solo per la durata della trascrizione; mai persistito di default.
- **Transcript**: testo della trascrizione; correggibile; unico artefatto
  durevole del passaggio audio; si comporta come fonte testuale.
- **Valutazione di copertura**: insieme di verdetti per concetto
  (coperto/parziale/assente/recitato) ciascuno con eventuale citazione-prova;
  riferita a una mappa (o ramo) e a un transcript; alimenta overlay e report.
- **Sessione di esposizione**: registrazione nel percorso di studio (data,
  scope, esiti aggregati, riflessione); aggiorna la padronanza per nodo.
- **Mappa del discorso**: mappa temporanea generata dal transcript; separata
  dal progetto; corredata di metriche strutturali e feedback formativo;
  salvabile solo esplicitamente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uno studente completa il ciclo "registro 5 minuti → vedo
  l'overlay con le citazioni" in meno di 8 minuti totali, senza aiuto di un
  adulto.
- **SC-002**: Rivalutando lo stesso transcript sulla stessa mappa, almeno il
  90% dei concetti riceve lo stesso verdetto (ripetibilità del giudizio).
- **SC-003**: Su un set di prova di parafrasi ("le piante mangiano luce" per
  "fotosintesi"), almeno l'80% delle menzioni parafrasate riceve verdetto
  coperto o parziale — mai assente.
- **SC-004**: La recitazione quasi letterale della descrizione di un nodo
  viene riconosciuta e marcata come tale nel 100% dei casi sopra la soglia di
  somiglianza.
- **SC-005**: Al termine di ogni flusso (successo, errore, interruzione), sul
  disco non resta alcun file audio nel 100% dei casi di default.
- **SC-006**: I tre flussi (fonte audio, coverage, mappa del discorso)
  funzionano con entrambi i provider AI supportati.
- **SC-007**: Nessuna superficie rivolta allo studente mostra una percentuale
  secca come primo elemento di feedback; tutti gli esiti sono comprensibili
  senza percepire i colori (verifica non-cromatica).
- **SC-008**: Le due esposizioni-campione ("a elenco" vs "ragionata") dello
  stesso argomento producono feedback strutturali distinti e coerenti con lo
  stile espositivo nel 100% delle prove.

## Assumptions

- La mappa di riferimento per il coverage esiste già ed è stata studiata
  dallo studente; i suoi nodi hanno tipicamente descrizioni ricche (dove
  mancano, la valutazione degrada con grazia al solo titolo).
- Esposizione tipica: 2-10 minuti di parlato; il tetto di 15 minuti copre il
  caso d'uso scolastico senza spingere verso monologhi ingestibili.
- Il transcript viene conservato con la sessione di studio (è la prova delle
  citazioni); la voce no. Non è richiesto un consenso aggiuntivo perché
  nessun dato vocale viene persistito o condiviso.
- La correzione manuale del transcript prima della valutazione è consentita e
  incoraggiata: gli errori di trascrizione automatica (accenti, nomi propri,
  parlato DSA) non devono diventare penalità di merito.
- La modalità "Esponi" vive nel launcher di Studio attivo accanto alle
  modalità esistenti; ne riusa i meccanismi di sessione, punteggio e
  riflessione finale.
- I concetti extra esposti dallo studente ma assenti dalla mappa non
  penalizzano il coverage (la mappa misura la copertura del programma, non
  vieta l'approfondimento).
- L'integrazione con MappAI Live (esposizioni raccolte da telefono per tutta
  la classe con report docente) è esplicitamente FUORI SCOPE: follow-up
  separato che riuserà transcript e valutazione qui definiti.
- La registrazione in-app avviene sul dispositivo dove gira MappAI (PC del
  docente o dello studente); microfoni esterni/telefoni entrano solo via
  caricamento file.
