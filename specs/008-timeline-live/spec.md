# Feature Specification: Timeline Live — completa e costruisci la timeline via QR

**Feature Branch**: `008-timeline-live`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Timeline Live — attività Timeline in MappAI Live (QR) con due modalità (Completa autovalutata / Costruisci discovery con revisione docente), proiezione LIM, login flessibile individuale/gruppi esteso anche alla Lavagna collaborativa, tab sidebar LIM. Include la base in-app: date manuali persistite, editing dal popup timeline, esercizio in-app 'trova le date mancanti'."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correzione e arricchimento della timeline (docente, in-app) (Priority: P1)

La timeline generata dall'AI a volte salta delle date o ne nomina male gli eventi.
Il docente apre la timeline, preme "+ Aggiungi data", compila anno/evento/categoria
(e facoltativamente anno di fine, etichetta e contesto) e la card compare subito al
posto giusto nella cronologia. Può anche rimuovere le date aggiunte. Le date manuali
sono salvate col progetto: sopravvivono alla chiusura dell'app e a ogni rigenerazione
della timeline, dove si fondono con le date estratte dall'AI senza duplicati.
Nello stesso popup esiste una "modalità esercizio" per lo studente singolo: la
timeline mostra card-buco per gli anni che le fonti citano ma che non sono ancora
sulla timeline; lo studente scrive l'evento (con un indizio dal testo della fonte
disponibile su richiesta) e la card si completa.

**Why this priority**: è la fondazione dati di tutta la feature — senza un pool di
date correggibile e persistente, né "Completa" né "Costruisci" hanno materia prima.
Ha valore autonomo immediato (correzione docente) anche senza la parte Live.

**Independent Test**: generare una timeline, aggiungere una data manuale, chiudere e
riaprire il progetto, rigenerare la timeline → la data manuale è ancora presente e
non duplicata. Attivare la modalità esercizio → compaiono card-buco per gli anni
citati dalle fonti e assenti; compilarne una → la card si inserisce nella cronologia.

**Acceptance Scenarios**:

1. **Given** una timeline aperta, **When** il docente aggiunge una data con anno ed
   evento, **Then** la card compare in posizione cronologica corretta, marcata come
   aggiunta manuale, con possibilità di rimuoverla.
2. **Given** un progetto con date manuali salvate, **When** il docente rigenera la
   timeline con l'AI, **Then** le date manuali restano presenti e un evento identico
   (stesso anno, stesso nome) non viene duplicato.
3. **Given** la modalità esercizio attiva, **When** le fonti citano un anno assente
   dalla timeline, **Then** compare una card-buco con quell'anno; lo studente può
   chiedere un indizio (estratto della fonte) e, compilando l'evento, la card si
   trasforma in una card completa attribuita allo studente.
4. **Given** la finestra principale dell'app chiusa o navigata altrove, **When**
   l'utente tenta di modificare le date dal popup timeline, **Then** riceve un
   avviso chiaro invece di un errore silenzioso.

---

### User Story 2 - "Completa la timeline" via QR (autovalutata) (Priority: P1)

Il docente apre MappAI Live, sceglie la nuova attività "Timeline", modalità
"Completa": indica la classe, quante domande, la direzione (dato l'anno → nomina
l'evento; dato l'evento → indica l'anno; mista), il formato risposta (aperta o
scelta multipla), il livello di aiuto (indizio dalla fonte sempre visibile, su
richiesta, o mai) e l'eventuale timer. Gli studenti inquadrano il QR col telefono,
entrano e rispondono. Le risposte si autovalutano: i nomi-evento con confronto
tollerante ai refusi, gli anni con una tolleranza configurabile (es. ±2 anni).
Alla chiusura il docente ottiene i report di classe.

**Why this priority**: è la richiesta principale — trasformare la timeline in
un'attività di studio di classe misurabile, riusando l'infrastruttura Live esistente.

**Independent Test**: con un progetto che ha un pool di date, lanciare "Completa"
con 6 domande miste; da un browser-telefono entrare via QR, rispondere (giuste,
sbagliate, con indizio); chiudere → i report mostrano esiti corretti e uso indizi.

**Acceptance Scenarios**:

1. **Given** un progetto con pool di date sufficiente, **When** il docente completa
   il wizard e avvia, **Then** compare la dashboard con QR e gli studenti entrano
   con le credenziali di classe.
2. **Given** una domanda "dato l'anno → evento" con risposta aperta, **When** lo
   studente scrive il nome dell'evento con un refuso lieve, **Then** la risposta è
   valutata corretta (confronto tollerante).
3. **Given** una domanda "dato l'evento → anno" con tolleranza ±2, **When** lo
   studente risponde con un anno che dista al massimo 2 dall'anno corretto,
   **Then** la risposta è valutata corretta; a distanza 3 o più è sbagliata.
4. **Given** formato scelta multipla, **When** viene costruita una domanda,
   **Then** le opzioni errate provengono da altri eventi del pool (nessuna chiamata
   AI) e la soluzione non è mai inviata al telefono prima della chiusura.
5. **Given** indizio "su richiesta", **When** lo studente apre l'indizio su una
   domanda, **Then** l'uso dell'indizio è registrato su quella risposta e compare
   nei report.
6. **Given** il pool di date vuoto, **When** il docente sceglie l'attività Timeline,
   **Then** vede l'invito a generare prima la timeline (con scorciatoia diretta)
   invece di un wizard inutilizzabile.

---

### User Story 3 - "Costruisci la timeline" via QR con revisione docente (Priority: P2)

Il docente lancia la modalità "Costruisci": gli studenti ricevono i "buchi" — anni
citati dalle fonti ma senza evento nominato — e/o slot di proposta libera
(anno + evento + contesto), secondo l'impostazione scelta. Le proposte arrivano
al docente, che le approva o le boccia dalla dashboard. Ogni proposta approvata
entra nel progetto come data della timeline (attribuita allo studente) e comparirà
nelle prossime timeline stampate. Alla chiusura il docente ottiene un report delle
proposte per studente e la timeline finale della classe stampabile.

**Why this priority**: è la parte "discovery" e collaborativa dell'attività; dipende
dalla base dati (US1) e dall'infrastruttura di sessione già rodata in US2.

**Independent Test**: lanciare "Costruisci" con buchi + proposte libere; da due
browser-telefono proporre eventi (uno per un buco, uno libero); approvarne uno e
bocciarne uno; chiudere → l'approvato è nel progetto e nella timeline successiva,
il report elenca approvati/bocciati/in attesa per studente.

**Acceptance Scenarios**:

1. **Given** la sessione avviata con "date dalla fonte", **When** lo studente apre
   l'attività, **Then** vede i buchi-anno (con indizio dal contesto della fonte
   secondo l'impostazione) e può proporre l'evento.
2. **Given** una proposta inviata, **When** il docente la approva, **Then** la data
   entra nel progetto attribuita allo studente e appare nella successiva timeline
   senza alcuna rigenerazione AI.
3. **Given** una proposta bocciata, **When** si chiude la sessione, **Then** la
   proposta compare nel report come bocciata e non entra nel progetto.
4. **Given** il limite proposte per studente raggiunto, **When** lo studente tenta
   un nuovo invio, **Then** riceve un messaggio chiaro e l'invio è rifiutato.
5. **Given** due studenti che propongono lo stesso evento per lo stesso anno,
   **When** il docente le esamina, **Then** i duplicati sono segnalati e
   l'approvazione di uno non crea doppioni nel progetto.
6. **Given** proposte ancora in attesa alla chiusura, **When** il docente chiude,
   **Then** le proposte in attesa sono conservate nel report (non perse) e non
   entrano nel progetto.

---

### User Story 4 - Proiezione LIM della timeline che cresce (Priority: P2)

Durante "Costruisci", il docente apre una vista a schermo intero da proiettare
sulla LIM: la timeline della classe con il QR di accesso in un angolo. Man mano che
le proposte vengono approvate, le card compaiono sulla proiezione (aggiornamento
automatico a pochi secondi), dando alla classe il senso di costruzione condivisa.

**Why this priority**: valorizza la modalità Costruisci in aula ma non è necessaria
al suo funzionamento (la dashboard basta per condurre l'attività).

**Independent Test**: con una sessione Costruisci attiva, aprire la proiezione,
approvare una proposta dalla dashboard → entro pochi secondi la card compare sulla
proiezione senza interazione manuale.

**Acceptance Scenarios**:

1. **Given** la proiezione aperta, **When** una proposta viene approvata,
   **Then** la card compare sulla proiezione entro 5 secondi, in posizione
   cronologica corretta.
2. **Given** la proiezione aperta, **When** il docente esce dallo schermo intero,
   **Then** torna alla dashboard senza interrompere la sessione.

---

### User Story 5 - Login flessibile: individuale o a gruppi, anche per la Lavagna (Priority: P3)

Al lancio di un'attività Timeline (entrambe le modalità) il docente sceglie come
entrano gli studenti: login individuale (credenziali emoji+numero del roster di
classe, attribuzione per studente nei report) oppure a gruppi (nickname condiviso,
come la Lavagna storica). La stessa scelta viene offerta anche al lancio della
Lavagna collaborativa, che oggi supporta solo i gruppi: con login individuale ogni
studente contribuisce a proprio nome e la dashboard mostra i nomi del roster.

**Why this priority**: flessibilità didattica preziosa (coppie/banchi vs lavoro
individuale) ma le attività funzionano già con un solo schema di login ciascuna.

**Independent Test**: lanciare Timeline a gruppi → il report aggrega per gruppo;
lanciare la Lavagna con login individuale → gli studenti entrano con emoji+numero
e i contributi in dashboard sono attribuiti ai singoli.

**Acceptance Scenarios**:

1. **Given** Timeline lanciata a gruppi, **When** due studenti condividono il
   nickname di gruppo da device diversi, **Then** i contributi confluiscono nel
   gruppo e i report aggregano per gruppo.
2. **Given** Lavagna lanciata con login individuale, **When** uno studente entra
   con le proprie credenziali roster, **Then** il suo contributo è attribuito a lui
   in dashboard; il comportamento storico a gruppi resta il default.
3. **Given** una scelta di login al setup, **When** la sessione è avviata,
   **Then** la scelta non è più modificabile per quella sessione.

---

### User Story 6 - Tab "LIM" nella sidebar per le attività collaborative (Priority: P3)

La sidebar guadagna un tab dedicato alle attività collaborative da LIM: da lì il
docente vede le attività disponibili (Lavagna collaborativa, Timeline live) e,
quando una sessione è attiva, la sua dashboard si monta in quel tab. Il pannello
Lavagna già presente nel tab Struttura resta dov'è (coesistenza, zero regressioni).

**Why this priority**: pura organizzazione dell'interfaccia; tutte le funzioni
restano raggiungibili anche senza il tab.

**Independent Test**: aprire il tab LIM senza sessioni attive → elenco attività con
pulsanti di avvio; avviare la Lavagna → la dashboard compare sia nel tab LIM sia nel
tab Struttura, aggiornate allo stesso tick.

**Acceptance Scenarios**:

1. **Given** nessuna sessione attiva, **When** il docente apre il tab LIM,
   **Then** vede le attività disponibili con avvio diretto.
2. **Given** una sessione Lavagna attiva, **When** il docente guarda il tab LIM e
   il tab Struttura, **Then** entrambe le viste mostrano lo stesso stato dei gruppi.

---

### Edge Cases

- Pool di date insufficiente per il numero di domande richiesto → il wizard
  riduce il numero al massimo disponibile e lo comunica.
- Scelta multipla con pool sotto le 4 voci → meno distrattori (minimo 2 opzioni)
  o passaggio automatico a risposta aperta, comunicato al docente.
- Due eventi diversi nello stesso anno → la domanda "anno → evento" accetta come
  corretto uno qualsiasi degli eventi di quell'anno.
- Evento con periodo (anno inizio-fine) in "evento → anno" → corretto qualunque
  anno dentro il periodo, esteso della tolleranza.
- Risposta non numerica dove è atteso un anno → valutata sbagliata, non errore.
- Telefono che perde la connessione → la risposta rimane sul device e viene
  reinviata (comportamento Live esistente); il rientro con lo stesso device
  ritrova le risposte date.
- Crash o riavvio del PC docente a sessione aperta → la sessione riprende dal
  disco con lo stesso token; i QR già distribuiti restano validi.
- Proposta con anno fuori da ogni fonte (es. refuso 2947) → accettata come
  proposta libera ma segnalata al docente come "anno non citato dalle fonti".
- Editing dal popup con finestra principale chiusa → avviso, nessuna perdita
  silenziosa.
- Progetti salvati prima di questa feature → si aprono senza errori; il pool
  parte vuoto finché non si genera una timeline.

## Requirements *(mandatory)*

### Functional Requirements

**Base dati timeline (US1)**

- **FR-001**: Il sistema DEVE permettere di aggiungere date manuali alla timeline
  (anno obbligatorio, evento obbligatorio; anno di fine, etichetta data, contesto e
  categoria facoltativi) e di rimuoverle.
- **FR-002**: Le date manuali DEVONO essere salvate col progetto e sopravvivere a
  chiusura dell'app, ricaricamento e rigenerazione della timeline.
- **FR-003**: Al render della timeline le date manuali DEVONO fondersi con quelle
  estratte dall'AI, con deduplicazione per anno + nome evento normalizzato.
- **FR-004**: Il pool di date estratte dall'AI DEVE essere salvato col progetto a
  ogni generazione della timeline (sovrascritto), così da essere disponibile per le
  attività Live senza nuove chiamate AI.
- **FR-005**: La modalità esercizio in-app DEVE mostrare card-buco per gli anni
  citati dalle fonti e assenti dalla timeline, con indizio dal contesto della fonte
  disponibile su richiesta; il completamento crea una data attribuita allo studente.
- **FR-006**: Le card manuali e studente DEVONO essere distinguibili visivamente e
  riportare l'origine; le card-buco non compaiono in stampa.

**Attività "Completa la timeline" (US2)**

- **FR-010**: Il wizard DEVE offrire: classe, numero domande, direzione
  (anno→evento / evento→anno / mista, default mista), formato risposta (aperta /
  scelta multipla, default aperta), indizio (sempre / su richiesta / mai, default
  su richiesta), tolleranza anni (esatto / ±2 / ±5, default ±2), ordine
  (cronologico / mescolato, default mescolato), timer facoltativo.
- **FR-011**: Le domande DEVONO essere generate dal pool del progetto (AI + manuali
  + approvate) senza alcuna chiamata AI; con pool vuoto il sistema DEVE proporre di
  generare prima la timeline.
- **FR-012**: La valutazione DEVE essere automatica: confronto tollerante ai refusi
  per i nomi-evento; confronto numerico con tolleranza configurata per gli anni;
  per i periodi è corretto ogni anno nel periodo esteso della tolleranza.
- **FR-013**: Nella scelta multipla i distrattori DEVONO provenire da altri eventi
  del pool; le soluzioni NON DEVONO mai raggiungere il telefono prima della chiusura.
- **FR-014**: L'apertura di un indizio DEVE essere registrata sulla singola risposta
  e riportata nei report.
- **FR-015**: I report esistenti di MappAI Live (heatmap domande + schede studente)
  DEVONO coprire l'attività, con le domande in ordine cronologico nel report e
  l'indicazione dell'uso indizi.

**Attività "Costruisci la timeline" (US3)**

- **FR-020**: Il wizard DEVE offrire: classe, fonte degli item (date dalle fonti /
  proposta libera / entrambe, default entrambe), indizio (come FR-010), numero
  massimo di proposte per studente (default 3), timer facoltativo.
- **FR-021**: Gli studenti DEVONO poter proporre eventi (anno + evento + contesto
  facoltativo) per i buchi e/o liberamente, entro il limite; oltre il limite
  l'invio è rifiutato con messaggio chiaro.
- **FR-022**: Il docente DEVE poter approvare o bocciare ogni proposta; le proposte
  approvate entrano nel progetto come date attribuite allo studente e compaiono
  nelle timeline successive senza rigenerazione AI.
- **FR-023**: Le proposte duplicate (stesso anno + evento equivalente) DEVONO
  essere segnalate; l'approvazione non crea doppioni nel progetto.
- **FR-024**: Alla chiusura DEVE essere prodotto un report con le proposte per
  studente (approvate / bocciate / in attesa) e la timeline finale della classe
  stampabile.
- **FR-025**: Gli anni proposti non citati da alcuna fonte DEVONO essere segnalati
  al docente in fase di revisione.

**Proiezione LIM (US4)**

- **FR-030**: Il docente DEVE poter aprire una vista a schermo intero con la
  timeline della classe e il QR di accesso; le proposte approvate DEVONO comparire
  entro 5 secondi senza interazione.

**Login flessibile (US5)**

- **FR-040**: Al setup di Timeline il docente DEVE poter scegliere login
  individuale (roster emoji+numero) o a gruppi (nickname); la scelta vale per
  tutta la sessione. Default: individuale.
- **FR-041**: Con login a gruppi i report DEVONO aggregare per gruppo; con login
  individuale per studente.
- **FR-042**: La Lavagna collaborativa DEVE offrire la stessa scelta al lancio;
  il default resta il comportamento storico a gruppi, e con login individuale i
  contributi sono attribuiti ai singoli studenti del roster.

**Tab LIM (US6)**

- **FR-050**: La sidebar DEVE offrire un tab dedicato alle attività collaborative
  LIM con elenco attività e avvio diretto; le dashboard attive si montano lì.
- **FR-051**: Il pannello Lavagna nel tab Struttura DEVE restare funzionante e
  sincronizzato con quello del tab LIM.

**Vincoli trasversali**

- **FR-060**: Sessioni riprendibili dopo crash con lo stesso token; salvataggio
  su disco per studente; nessun segreto (chiavi API) servito ai telefoni.
- **FR-061**: Tutte le nuove superfici DEVONO rispettare l'i18n del progetto
  (italiano di default, chiavi inglesi) e i principi di accessibilità
  (segnalazioni non solo cromatiche, carico cognitivo limitato).
- **FR-062**: Le attività esistenti (Studio attivo live, Lavagna, Tutor, Materiali)
  NON DEVONO subire regressioni; la suite di test esistente resta verde.
- **FR-063**: I progetti creati prima della feature DEVONO aprirsi senza errori
  (pool assente = vuoto, nessuna migrazione richiesta).

### Key Entities

- **Data della timeline (evento)**: anno, eventuale anno di fine, etichetta,
  nome evento, contesto, categoria, origine (AI / manuale docente / studente).
  Il pool del progetto = eventi AI dell'ultima generazione + manuali + approvati.
- **Domanda timeline**: derivata da una data del pool; direzione, formato,
  eventuale set di opzioni, chiave di risposta (evento o anno+tolleranza),
  indizio dal contesto; traccia l'uso dell'indizio nella risposta.
- **Proposta**: candidato-data inviato da uno studente o gruppo in Costruisci;
  stato (in attesa / approvata / bocciata), autore, eventuale buco di riferimento.
- **Sessione Timeline live**: attività, modalità, classe, schema di login,
  impostazioni, roster/gruppi, stato per studente, esiti; riprendibile da disco.
- **Report costruzione**: elenco proposte per autore con stato + timeline finale
  di classe stampabile.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Il docente lancia un'attività Timeline (entrambe le modalità) in al
  più 4 interazioni dal menu Live, con pool già disponibile.
- **SC-002**: Uno studente entra via QR e completa un'attività di 8 domande senza
  assistenza del docente sul proprio device.
- **SC-003**: La generazione delle domande e dei distrattori non produce alcuna
  chiamata AI: costo token zero per lanciare le attività a pool esistente.
- **SC-004**: Una data approvata in Costruisci compare nella timeline stampata
  successiva senza rigenerazione, nel 100% dei casi.
- **SC-005**: La valutazione automatica rispetta la tolleranza configurata nel
  100% dei casi di test (refusi lievi accettati sugli eventi, ±N sugli anni,
  periodi inclusi).
- **SC-006**: I report sono disponibili immediatamente alla chiusura e riportano
  per ogni studente esiti e uso degli indizi (Completa) o proposte con stato
  (Costruisci).
- **SC-007**: La proiezione LIM riflette un'approvazione entro 5 secondi.
- **SC-008**: Zero regressioni: l'intera suite di test esistente resta verde e le
  attività live preesistenti funzionano invariate.

## Assumptions

- Studenti e PC docente sono sulla stessa rete locale (hotspot o router di
  classe), come per le attività Live esistenti; nessun accesso internet richiesto
  per lo svolgimento.
- Il roster di classe (credenziali emoji+numero) esiste già tramite gli Account
  classi; l'attività non gestisce la creazione delle classi.
- Dimensione classe come le attività Live esistenti (fino a ~33 identità).
- L'editing delle date dal popup timeline richiede la finestra principale
  dell'app aperta; su piattaforme dove il popup non è disponibile la timeline
  resta consultabile e stampabile (l'editing avviene dall'app).
- Con login individuale nella Lavagna, ogni studente lavora come contributore
  singolo attribuito; le funzioni della Lavagna restano per il resto invariate.
- La proiezione LIM è una vista dell'app sul PC docente collegato alla LIM
  (nessun device aggiuntivo).
- Le categorie evento sono il set già in uso nella timeline (Politica, Economia,
  Militare, Diplomatica, Sociale, Cultura).
- La modalità Costruisci non è autovalutata per costruzione: la qualità è
  giudicata dal docente in revisione; il report non assegna punteggi.
