# Feature Specification: MappAI - misuratore

**Feature Branch**: `013-misuratore`

**Created**: 2026-07-28

**Status**: Draft — formula dell'indice rivista con Giacomo il 28/07/2026, pronta per `/speckit-plan`

**Input**: User description: "Crea un'app parallela a MappAI in cui svolgere le analisi come quelle riportate nella pagina `assessment-funzioni-urbane-1A-1B.html`. Chiama l'app «MappAI - misuratore» e costruiscila in una nuova cartella all'interno della root `/MappAI re`. Dentro la cartella crea le cartelle necessarie al progetto Electron e poi una sottocartella «MappAI - misuratore - FILE» con due sottocartelle: «Upload» (VAULT o singoli PDF da analizzare) e «Report» (report generati come pagine .html). Landing con tab ANALIZZA: bottoni upload, bottone avvia analisi, sezione con elenco dei report. Applica le regole di layout definite per MappAI."

---

## Visione e principi *(governano tutte le user story)*

Il misuratore è lo **strumento di prova** di MappAI. Oggi la domanda «MappAI rende davvero il materiale più accessibile per uno studente BES/DSA?» ha come unica risposta un documento scritto a mano una volta sola, il 24/07/2026, per una coppia di classi. Il misuratore trasforma quel lavoro artigianale in una pipeline ripetibile, e l'accumulo di analisi ripetute in un argomento difendibile davanti a un direttore, a un OPI o a un ente finanziatore.

**Cinque principi non negoziabili.**

1. **I numeri non li scrive l'AI.** Ogni cifra del report esce da codice deterministico e testato. L'AI riceve la tabella dei numeri già calcolati e scrive solo la prosa interpretativa; non vede mai i testi grezzi quando c'è da contare. Stesso input → stessi numeri, sempre.
2. **Riproducibilità sopra la comodità.** Ogni analisi è uno snapshot congelato: i file misurati vengono copiati in `Upload/`, il contesto necessario (classe, registro, consumi AI, modello) viene fotografato al momento dell'import, e il risultato viene salvato con la versione della formula usata. Un report di sei mesi fa deve poter essere ricalcolato oggi ottenendo le stesse cifre.
3. **Nessun numero senza il suo contrappeso.** Un guadagno di accessibilità ottenuto tagliando contenuto non è un guadagno. Il Δ accessibilità non viene mai mostrato senza la copertura della fonte accanto. Vale come regola di rendering, non come buona intenzione: il builder del report rifiuta di emettere l'uno senza l'altra.
4. **Il misuratore misura MappAI, non il docente.** Quando analizza la fonte originale (la scheda didattica scritta dal docente) la usa come **linea di partenza**, mai come pagella. Il linguaggio del report non qualifica mai la fonte come «scritta male»: dice «la scheda di partenza sta a Gulpease 41, il materiale generato a 57». Coerente con il principio «descrittivo, mai giudicante» della feature 012.
5. **I limiti del metodo sono parte del report, non una nota a piè di pagina.** Ogni report porta con sé la sezione «limiti» con il campione, le soglie arbitrarie, i proxy euristici e ciò che non è stato misurato — come fa la pagina di riferimento al §8. Un report senza quella sezione non viene emesso.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Confronto e report deterministico (Priority: P1)

Giacomo apre il misuratore, carica due vault MappAI (`1A/Funzioni Urbane` e `1B/Funzioni Urbane`), preme «Avvia analisi» e ottiene un report `.html` salvato in `Report/`, che si apre e mostra: cosa varia tra le due generazioni, struttura della mappa, leggibilità, differenze strutturali concrete con i testi appaiati, materiali di verifica, limiti del metodo. Nessuna chiamata AI: il report esce completo di tutti i numeri e di tutte le viste che si possono costruire per regola, con le sole sezioni interpretative assenti.

**Why this priority**: è la ricostruzione automatica della pagina di riferimento, il cuore del prodotto. Senza questa non c'è nulla; con questa sola, Giacomo può già ripetere l'assessment su una coppia nuova in un minuto invece che in una sessione di lavoro.

**Independent Test**: caricare i due vault reali `1A/Funzioni Urbane` e `1B/Funzioni Urbane` e verificare che le cifre prodotte coincidano con quelle della pagina di riferimento (32/43 nodi, 6/7 macro-aree, Gulpease nodi 56,6/56,8, sintesi 49,0/53,4, 46/58 link, 42,4/40,6 parole medie per nodo, dev.std 9,7/7,8).

**Acceptance Scenarios**:

1. **Given** due vault caricati in `Upload/`, **When** Giacomo preme «Avvia analisi», **Then** entro pochi secondi compare un file in `Report/` con nome `AAAA-MM-GG · <titolo>.html` e la sezione elenco della landing lo mostra in cima.
2. **Given** l'analisi conclusa, **When** Giacomo apre il report, **Then** vede le tabelle strutturali e linguistiche con la colonna Δ, la scala Gulpease con le soglie 40/60/80, le coppie di nodi con etichetta identica affiancate a testo integrale, i nodi presenti solo in uno dei due, e la sezione «limiti del metodo».
3. **Given** un elemento senza sintesi (`Materiale Studio/Sintesi*.html` assente), **When** l'analisi gira, **Then** il report emette comunque tutte le sezioni calcolabili e dichiara esplicitamente quali metriche mancano e perché, invece di mostrare celle vuote o zeri.
4. **Given** due vault che non condividono nessuna etichetta di nodo, **When** l'analisi gira, **Then** la sezione delle coppie appaiate non viene emessa e al suo posto compare la spiegazione che i due materiali non hanno concetti confrontabili 1:1.

---

### User Story 2 — Caricare materiale e ritrovare i report (Priority: P1)

Giacomo carica materiale da analizzare con tre bottoni: una cartella vault, uno o più PDF, una cartella di classe intera (che contiene più vault). Il materiale viene copiato in `Upload/`. Sotto, un elenco mostra sia gli elementi caricati (con selezione multipla per comporre l'analisi) sia i report già prodotti, con data, titolo, tipo di analisi e numero di elementi confrontati; da lì si apre un report, si rivela nel Finder, o lo si elimina.

**Why this priority**: senza ingresso e senza archivio, US1 non è utilizzabile due volte. È la landing che l'utente ha descritto.

**Independent Test**: caricare una cartella vault, verificare la copia in `Upload/`, chiudere e riaprire l'app, verificare che l'elemento sia ancora elencato e selezionabile; produrre un report, verificare che compaia nell'elenco con la data corretta.

**Acceptance Scenarios**:

1. **Given** la landing aperta sul tab ANALIZZA, **When** Giacomo preme «Carica vault» e sceglie `Mappe/1A/Funzioni Urbane`, **Then** l'elemento viene copiato in `Upload/` con nome disambiguato `1A · Funzioni Urbane` e compare nell'elenco degli elementi con classe, materia rilevata, data di generazione e conteggio nodi.
2. **Given** due vault omonimi di classi diverse, **When** entrambi vengono caricati, **Then** i due elementi restano distinti e riconoscibili (`1A · Funzioni Urbane` e `1B · Funzioni Urbane`), senza sovrascrittura silenziosa.
3. **Given** un elemento già presente in `Upload/` con lo stesso nome, **When** Giacomo lo ricarica, **Then** l'app chiede se sostituire o affiancare come nuova versione, e in caso di affiancamento suffissa ` · 02`.
4. **Given** un report nell'elenco, **When** Giacomo preme il cestino, **Then** deve digitare il nome esatto del report per confermare (pattern `confirmDeleteText`), e solo allora il file `.html` e il suo dato affiancato vengono rimossi.
5. **Given** l'elenco dei report, **When** Giacomo clicca su una riga, **Then** il report si apre in una finestra dell'app (non nel browser di sistema), con la data mostrata in formato GG/MM/AAAA.

---

### User Story 3 — Baseline fonte → prodotto, con la copertura accanto (Priority: P2)

Per ogni elemento che porta con sé la fonte originale (`Fonti/*.pdf` nel vault, o un PDF caricato a mano e appaiato a un vault), il misuratore misura anche la fonte con le stesse metriche e produce il **Δ accessibilità** — di quanto MappAI ha abbassato la difficoltà rispetto al punto di partenza — sempre affiancato alla **copertura della fonte**, cioè quanta parte del contenuto originale è sopravvissuta nel materiale generato.

**Why this priority**: è la misura che risponde alla domanda vera («MappAI serve a qualcosa?») e l'unica che rende confrontabili analisi su materie diverse, perché normalizza rispetto al punto di partenza. È il presupposto tecnico di US5.

**Independent Test**: analizzare `1B/Funzioni Urbane`, che ha `Fonti/09b_funzioni urbane.pdf`, e verificare che il report mostri le metriche della fonte, quelle del prodotto, il Δ per ogni componente attivo dell'indice, e la percentuale di frasi della fonte coperte da almeno un nodo.

**Acceptance Scenarios**:

1. **Given** un vault con `Fonti/` non vuota, **When** l'analisi gira, **Then** il report apre con una sezione «da dove si parte» che mostra le metriche della fonte e il Δ verso il materiale generato.
2. **Given** il Δ accessibilità calcolato, **When** il report viene costruito, **Then** la copertura della fonte è resa nello stesso blocco visivo — mai in una sezione separata, mai omessa.
3. **Given** una fonte e un prodotto su cui non sono calcolabili gli stessi componenti dell'indice (es. la fonte non ha struttura a nodi), **When** si calcola il Δ, **Then** vengono usati **solo i componenti calcolabili su entrambi i lati**, e il report dichiara quali e quanti (`Δ calcolato su 5 componenti su 7`).
4. **Given** un PDF fonte da cui l'estrazione del testo restituisce meno di 200 parole (PDF scansionato, solo immagini), **When** l'analisi gira, **Then** la baseline non viene calcolata e il report lo dichiara come limite, invece di produrre un Δ costruito su testo spazzatura.

---

### User Story 4 — Prosa interpretativa scritta dall'AI sui soli numeri (Priority: P2)

A analisi conclusa, Giacomo può premere «Scrivi le sezioni interpretative». L'AI riceve **esclusivamente** la tabella dei numeri già calcolati, l'elenco delle viste qualitative già selezionate per regola, e i metadati (registro, note di classe, modello, preset) — mai i testi grezzi da cui contare. Restituisce: il titolo del report, l'occhiello, l'osservazione chiave (il §4 della pagina di riferimento), i commenti alle differenze strutturali e le idee per il lavoro successivo. Il report si rigenera con quelle sezioni; i numeri non cambiano di una virgola.

**Why this priority**: è ciò che separa un tabellone da un documento leggibile e mostrabile. Ma arriva dopo P1 perché il report deve essere utile anche senza chiave API e senza costi.

**Independent Test**: generare un report deterministico, salvare i numeri, lanciare la prosa AI, rigenerare, e verificare per confronto byte-a-byte che tutte le celle numeriche siano identiche prima e dopo.

**Acceptance Scenarios**:

1. **Given** un report deterministico già prodotto, **When** Giacomo lancia la prosa AI, **Then** le sezioni narrative vengono aggiunte e ogni cifra preesistente resta invariata.
2. **Given** nessuna chiave API configurata, **When** Giacomo apre la sezione prosa, **Then** l'app spiega che serve una chiave e dove inserirla, e il report deterministico resta pienamente utilizzabile.
3. **Given** la prosa generata, **When** il report viene letto, **Then** ogni sezione scritta dall'AI è marcata visibilmente come interpretazione, distinta dalle sezioni di misura.
4. **Given** una risposta AI che contiene una cifra non presente nei numeri passati in ingresso, **When** il report viene costruito, **Then** la discrepanza viene segnalata a Giacomo prima del salvataggio invece di finire silenziosamente nel documento.

---

### User Story 5 — ANDAMENTO: MappAI migliora nel tempo? (Priority: P3)

Un secondo tab, **ANDAMENTO**, legge tutte le analisi salvate e costruisce un report longitudinale su quattro assi: nel tempo per data di generazione; per versione di MappAI, modello e preset; per registro di classe (semplice / medio / ricco); per materia e livello scolastico. Ogni punto è cliccabile e apre il report di dettaglio da cui proviene.

**Why this priority**: ha bisogno di un archivio di analisi per dire qualcosa di sensato — con due punti non è un andamento. Va costruito presto ma diventa utile dopo.

**Independent Test**: produrre tre analisi con date e registri diversi, aprire ANDAMENTO e verificare che i tre punti compaiano sull'asse temporale, che il raggruppamento per registro li separi correttamente e che l'avviso di campione insufficiente compaia dove la cella ha meno di 3 analisi.

**Acceptance Scenarios**:

1. **Given** un archivio con N analisi, **When** Giacomo apre ANDAMENTO, **Then** vede la curva dell'indice di accessibilità nel tempo e può cambiare asse di raggruppamento senza rigenerare nulla.
2. **Given** un raggruppamento in cui una cella ha meno di 3 analisi, **When** il report viene reso, **Then** quella cella porta un avviso esplicito di campione insufficiente, e la media non viene presentata come conclusione.
3. **Given** analisi calcolate con versioni diverse della formula dell'indice, **When** vengono plottate insieme, **Then** finiscono in serie distinte con un avviso, mai fuse nella stessa curva.
4. **Given** un file di dato affiancato cancellato a mano, **When** ANDAMENTO viene aperto, **Then** l'indice viene ricostruito rileggendo il JSON incorporato nei report `.html` presenti, senza perdere il punto.
5. **Given** l'archivio vuoto, **When** Giacomo apre ANDAMENTO, **Then** trova una spiegazione di cosa servirà (almeno 3 analisi) e un collegamento al tab ANALIZZA, non una pagina bianca.

---

### User Story 6 — Confronto a N elementi (Priority: P3)

Il confronto non ha tetto di elementi. Il report cambia strategia di resa in base a quanti ne riceve, perché le viste che funzionano a due non funzionano a venti.

**Why this priority**: scelta esplicita dell'utente. Il valore incrementale sopra i due elementi è reale (confrontare tutte le mappe di una classe, o tutte quelle generate con lo stesso modello) ma non è il caso d'uso di partenza.

**Independent Test**: lanciare la stessa analisi con 2, 4 e 9 elementi e verificare che ciascuna produca un report leggibile senza scorrimento orizzontale del corpo pagina.

**Acceptance Scenarios**:

1. **Given** 2 elementi, **When** il report viene reso, **Then** compaiono le viste appaiate integrali: coppie stesso-concetto a testo intero, nodi esclusivi, testi affiancati.
2. **Given** da 3 a 6 elementi, **When** il report viene reso, **Then** le tabelle hanno N colonne e le viste qualitative diventano una matrice di presenza/assenza dei concetti, con i testi integrali raggiungibili a espansione.
3. **Given** 7 o più elementi, **When** il report viene reso, **Then** le metriche sono presentate come distribuzioni (mediana, quartili, minimo e massimo con l'elemento che li tocca) più una tabella di drill-down per singolo elemento, invece di N colonne affiancate.
4. **Given** un numero qualsiasi di elementi, **When** il report viene reso, **Then** le tabelle larghe scorrono dentro il proprio contenitore e il corpo della pagina non scorre mai in orizzontale.

---

### User Story 7 — Costo per punto di accessibilità (Priority: P4)

Il report incrocia il registro consumi AI fotografato all'import con il Δ accessibilità: quante chiamate, quanti token, quanti CHF sono serviti, e quanto costa in token un punto di indice guadagnato.

**Why this priority**: è l'argomento economico, prezioso per la vendita ma inutile senza P1-P3 sotto.

**Independent Test**: analizzare la coppia 1A/1B e verificare che i totali corrispondano a `generationUsage` in `index.yaml` (106.672 e 125.335 token) e che le chiamate contate dal registro cadano nella finestra temporale del `pipeline.json` di ciascun vault.

**Acceptance Scenarios**:

1. **Given** un vault con `generationUsage` in `index.yaml`, **When** l'analisi gira, **Then** il report mostra token e costo in CHF con il tasso di cambio dichiarato e modificabile.
2. **Given** l'abbinamento delle righe del registro consumi fatto per nome progetto e finestra temporale, **When** il report viene reso, **Then** dichiara che l'abbinamento è approssimato e mostra la finestra usata, con la possibilità di correggerla.
3. **Given** due generazioni dello stesso progetto nello stesso giorno con finestre sovrapponibili, **When** l'abbinamento è ambiguo, **Then** il misuratore lo segnala e attribuisce solo le righe non contese, invece di dividere a metà in silenzio.

---

### User Story 8 — Ogni scelta dichiarata, ogni parametro ritoccabile (Priority: P2)

Il misuratore non nasconde nessuna delle sue decisioni arbitrarie. Un tab **METODO** mostra, per ogni metrica, la definizione operativa esatta, la soglia usata, il perché di quella soglia e il suo limite noto — e permette di modificarla. Chi legge un report può risalire da ogni cifra alla regola che l'ha prodotta.

**Why this priority**: senza questo, l'indice è una scatola nera e il report non è difendibile davanti a chi lo contesta — che è precisamente lo scopo dello strumento. Ed è ciò che rende accettabile il fatto che le soglie siano scelte arbitrarie: sono arbitrarie ma esposte.

**Independent Test**: aprire METODO, cambiare la velocità di lettura da 120 a 150 parole al minuto, rigenerare un'analisi esistente, verificare che il tempo di lettura e il componente 7 cambino di conseguenza, che il nuovo report porti un identificativo di profilo diverso, e che il report vecchio resti intatto con il suo profilo originale.

**Acceptance Scenarios**:

1. **Given** il tab METODO aperto, **When** Giacomo cerca una metrica del report, **Then** trova la definizione operativa («parola lunga = 8 caratteri o più»), il valore corrente della soglia, la motivazione della scelta e il limite dichiarato.
2. **Given** un parametro modificato, **When** Giacomo salva, **Then** il misuratore crea un **profilo di parametri** nuovo con un proprio identificativo, e non tocca né i profili precedenti né le analisi già salvate.
3. **Given** analisi prodotte con profili di parametri diversi, **When** ANDAMENTO le plotta, **Then** finiscono in serie distinte con avviso, come già per le versioni della formula.
4. **Given** un report qualsiasi, **When** viene aperto, **Then** contiene al proprio interno il profilo di parametri completo con cui è stato prodotto, così da restare interpretabile anche se nel frattempo i parametri dell'app sono cambiati.
5. **Given** i parametri portati a valori che si contraddicono (un ancoraggio non monotòno, pesi che non sommano a 100), **When** Giacomo salva, **Then** il misuratore rifiuta e spiega quale vincolo è violato.
6. **Given** un profilo modificato che non convince, **When** Giacomo chiede di tornare indietro, **Then** può ripristinare il profilo predefinito senza perdere quello personalizzato.
7. **Given** il tab METODO, **When** Giacomo lo consulta, **Then** i testi descrittivi delle metriche NON sono duplicati nel codice del builder HTML: la pagina METODO e la sezione «limiti» dei report leggono la **stessa** configurazione che governa il calcolo.

---

### Edge Cases

- **Vault senza `links.json`** (progetto legacy o mappa vuota): le metriche di relazione non vengono emesse, le altre sì.
- **Link senza `rel`**: trattati come `include`, coerentemente col DAL Protocol della costituzione.
- **Nodi senza corpo** (solo frontmatter): esclusi dai conteggi di parole, contati nella struttura, dichiarati nel report.
- **PDF protetto da password o corrotto**: l'elemento resta caricato ma marcato come non analizzabile, con il motivo; non blocca l'analisi degli altri.
- **PDF scansionato senza layer testo**: nessun OCR in v1; l'elemento è dichiarato non misurabile.
- **Testo non italiano**: Gulpease e Flesch-Vacca sono tarati sull'italiano. Se il rilevamento di lingua non dice italiano, le metriche di leggibilità vengono emesse con un avviso di validità dubbia, non soppresse.
- **Elemento senza classe associata**: la stratificazione per registro lo colloca in «non dichiarato», mai in una categoria a caso.
- **Analisi di un solo elemento**: ammessa — è il PROFILO, stesse metriche senza colonna Δ.
- **`Upload/` o `Report/` cancellate a mano mentre l'app è aperta**: ricreate al primo accesso, con avviso.
- **Report aperto mentre viene rigenerato con la prosa AI**: la finestra si aggiorna, non si duplica.
- **Formula dell'indice cambiata dopo che esistono analisi**: le analisi vecchie non vengono ricalcolate né riscritte; portano la loro versione e ANDAMENTO le tiene in serie separate. Esiste un comando esplicito «ricalcola l'archivio con la formula corrente» che scrive nuovi snapshot senza distruggere i precedenti.

---

## Requirements *(mandatory)*

### Functional Requirements

**Ingresso e archivio**

- **FR-001**: Il misuratore DEVE accettare come elemento di analisi: una cartella vault MappAI, un singolo PDF, una cartella di classe contenente più vault (import multiplo), e un file HTML di sintesi generato da MappAI.
- **FR-002**: L'import DEVE copiare il materiale in `Upload/`, non referenziarlo: l'analisi non deve poter essere invalidata da una modifica successiva nella cartella d'origine.
- **FR-003**: Il nome dell'elemento in `Upload/` DEVE essere disambiguato con la cartella di classe quando presente (`1A · Funzioni Urbane`), e suffissato ` · 02` in caso di collisione residua.
- **FR-004**: All'import il misuratore DEVE fotografare il contesto necessario alle analisi successive: la voce di classe da `classi.json` (nome, grado, sistema, registro, note), le righe pertinenti di `consumi-ai.jsonl`, `pipeline.json` e `index.yaml`. Il contesto fotografato vive dentro l'elemento in `Upload/`.
- **FR-005**: Gli elementi caricati DEVONO restare disponibili tra un avvio e l'altro dell'app, senza dipendere da `localStorage`.
- **FR-006**: L'elenco dei report DEVE essere costruito leggendo la cartella `Report/` a ogni apertura, non da un indice separato che possa divergere dal disco.
- **FR-007**: L'eliminazione di un report DEVE richiedere la digitazione del suo nome esatto.

**Misura — regole trasversali**

- **FR-008**: Tutti i conteggi e gli indici DEVONO essere prodotti da moduli puri testabili in Node, senza DOM e senza rete.
- **FR-009**: A parità di input, due esecuzioni DEVONO produrre numeri identici. Nessuna metrica può dipendere da ordine di iterazione non deterministico, da orario, o da campionamento casuale.
- **FR-010**: Ogni metrica emessa DEVE dichiarare nel dato la propria definizione operativa (es. «parola lunga = ≥8 caratteri»), in modo che il report possa esporla senza duplicare la conoscenza nel builder HTML.
- **FR-011**: Quando una metrica non è calcolabile, il dato DEVE portare il motivo (`fonte assente`, `meno di 200 parole`, `nessun link`), e il report DEVE renderlo. Mai `0`, mai cella vuota.

**Lente leggibilità e struttura**

- **FR-012**: Il misuratore DEVE calcolare, per ciascun corpo di testo (nodi concatenati, sintesi, quiz, fonte): parole totali, frasi, parole per frase, Gulpease, Flesch-Vacca, percentuale di parole lunghe, nominalizzazioni per 100 parole, connettivi subordinanti per 100 parole, connettivi causali per 100 parole, costruzioni passive per 100 parole, marcatori di esempio e di analogia in totale.
- **FR-013**: Il misuratore DEVE calcolare, per ciascun vault: nodi totali, nodi per livello, numero di macro-aree, profondità massima, numero di link, verbi di relazione distinti, link semanticamente ricchi e quota di link generici.
- **FR-014**: Il misuratore DEVE calcolare le parole per nodo con media, intervallo e deviazione standard, sia complessive sia per livello.
- **FR-015**: Il misuratore DEVE stimare il tempo di lettura e il tempo di ascolto, con le velocità dichiarate nel dato.
- **FR-016**: Il misuratore DEVE rilevare i dispositivi di formato della sintesi: elenchi puntati, sotto-titoli, titoli in forma di domanda, catene causali.

**Lente confronto**

- **FR-017**: Con due o più elementi, il misuratore DEVE individuare i concetti confrontabili 1:1 (etichette identiche a meno di normalizzazione) e i concetti esclusivi di ciascun elemento.
- **FR-018**: Il report DEVE cambiare strategia di resa in funzione del numero di elementi secondo le soglie di US6 (2 · 3-6 · 7+), senza che l'utente debba scegliere.
- **FR-019**: Il corpo della pagina del report NON DEVE mai scorrere in orizzontale, a nessun numero di elementi.

**Lente baseline e copertura**

- **FR-020**: Quando la fonte originale è disponibile e misurabile, il misuratore DEVE calcolare il Δ per ogni componente dell'indice e per l'indice complessivo.
- **FR-021**: Il Δ DEVE essere calcolato solo sui componenti calcolabili su entrambi i lati, e il numero di componenti attivi DEVE comparire nel report accanto al Δ.
- **FR-022**: Il misuratore DEVE calcolare la copertura della fonte come quota di frasi della fonte che trovano corrispondenza lessicale in almeno un nodo, riusando la tokenizzazione e lo stemming italiano già in uso in MappAI, così che i numeri siano coerenti con quelli dell'app principale.
- **FR-023**: Il builder del report DEVE rifiutarsi di emettere il Δ accessibilità senza la copertura nello stesso blocco.

**Lente materiali di verifica**

- **FR-024**: Il misuratore DEVE analizzare i set di quiz e flashcard leggendo i JSON in `Materiale Studio/`, non estraendoli dal PDF, e DEVE gestire le tre forme storiche di item già normalizzate in MappAI.
- **FR-025**: Per ogni set DEVE emettere: numero di item, Gulpease, parole per frase, percentuale di parole lunghe.
- **FR-026**: Per i set a scelta multipla DEVE emettere la somiglianza lessicale media tra distrattori e risposta corretta.

**Lente coerenza e ridondanza**

- **FR-027**: Il misuratore DEVE calcolare la ridondanza fra nodi fratelli come sovrapposizione di n-grammi, in modo puramente deterministico.
- **FR-028**: La coerenza terminologica (stesso concetto sempre chiamato con la stessa parola) DEVE essere prodotta in modo assistito dall'AI — l'AI raggruppa le varianti, il conteggio resta deterministico sul raggruppamento — e DEVE essere marcata come tale nel report.

**Lente costi**

- **FR-029**: Il misuratore DEVE riportare token e chiamate per elemento, e il costo in CHF con tasso di cambio dichiarato e modificabile.
- **FR-030**: L'abbinamento delle righe di consumo a un elemento DEVE essere dichiarato come approssimato, con la finestra temporale usata esposta e correggibile, e le righe contese tra due elementi non DEVONO essere attribuite né divise arbitrariamente.

**Lente nessi logici e causali**

- **FR-030-bis**: Il misuratore DEVE misurare l'esplicitezza dei nessi logici e dei rapporti causa-effetto su due piani: **lessicale** (connettivi causali e logici per 100 parole, catene causali esplicite, marcatori di conseguenza e di condizione) — calcolabile su qualunque testo, fonte compresa — e **strutturale** (quota di legami del grafo con una relazione di famiglia causale, condizionale o oppositiva, distinta dal generico `include`) — calcolabile solo sui vault.
- **FR-030-ter**: La classificazione dei verbi di relazione in famiglie DEVE riusare la tassonomia `EDGE_FAMILIES` di MappAI, così che «causa», «richiede», «si oppone a» siano riconosciuti esattamente come nell'app principale, e un verbo aggiunto là non debba essere ridichiarato qui.

**Indice di accessibilità**

- **FR-031**: Il misuratore DEVE calcolare un indice composito 0-100 secondo la formula descritta nell'Allegato A. Pesi, ancoraggi, soglie e velocità di lettura vivono in un **profilo di parametri** editabile, mai nel codice.
- **FR-032**: Ogni snapshot DEVE registrare il profilo di parametri **per intero**, non per riferimento: un report deve restare interpretabile anche se il profilo dell'app è stato nel frattempo modificato o cancellato.
- **FR-033**: Quando un componente non è calcolabile, il suo peso DEVE essere ridistribuito proporzionalmente sui componenti attivi, e il numero di componenti attivi DEVE comparire accanto all'indice.
- **FR-033-bis**: Il punteggio del componente «dispositivi di scansione» DEVE essere moderato da un **fattore di sostanza** che lo abbassa quando i dispositivi sono gusci vuoti — elenchi con pochissime parole di contenuto — o quando i nodi fratelli sono fortemente ridondanti. La formattazione conta solo se sotto c'è contenuto.
- **FR-033-ter**: Il misuratore DEVE rifiutare un profilo di parametri incoerente: pesi che non sommano a 100, ancoraggi non monotòni, soglie fuori dal dominio della metrica.

**Metodo dichiarato e parametri ritoccabili**

- **FR-053**: Ogni parametro arbitrario DEVE essere dichiarato nel profilo insieme alla propria definizione operativa, alla motivazione della scelta e al limite noto — non solo al valore numerico.
- **FR-054**: Il tab METODO e la sezione «limiti del metodo» dei report DEVONO essere generati **dalla stessa configurazione che governa il calcolo**. Nessun testo descrittivo di una metrica può essere scritto a mano nel builder del report: la documentazione non deve poter divergere dal comportamento.
- **FR-055**: Modificare un parametro DEVE produrre un profilo nuovo con identificativo proprio, senza alterare i profili esistenti né le analisi già salvate.
- **FR-056**: Il profilo predefinito DEVE essere sempre ripristinabile senza perdere i profili personalizzati.
- **FR-057**: ANDAMENTO NON DEVE fondere nella stessa serie analisi prodotte con profili di parametri diversi.
- **FR-058**: Il misuratore DEVE poter **ricalcolare** un'analisi archiviata con il profilo corrente, scrivendo un nuovo snapshot e lasciando intatto quello originale.

**Prosa AI**

- **FR-034**: All'AI DEVONO essere passati esclusivamente i numeri già calcolati, le viste già selezionate e i metadati; mai i testi grezzi quando la richiesta riguarda conteggi.
- **FR-035**: Le sezioni scritte dall'AI DEVONO essere visivamente distinguibili da quelle di misura.
- **FR-036**: Il misuratore DEVE verificare che le cifre citate nella prosa AI esistano tra quelle passate in ingresso, e segnalare le discrepanze prima del salvataggio.
- **FR-037**: L'assenza di chiave API NON DEVE impedire la produzione del report deterministico.

**Report e persistenza**

- **FR-038**: Ogni report DEVE essere un file `.html` autoconsistente in `Report/`, senza dipendenze di rete, apribile anche fuori dall'app.
- **FR-039**: Ogni report DEVE incorporare i propri dati grezzi come JSON dentro il documento, e scriverne una copia in un archivio affiancato per la lettura rapida dell'ANDAMENTO.
- **FR-040**: Se l'archivio affiancato manca o è incompleto, ANDAMENTO DEVE ricostruirlo leggendo il JSON incorporato nei report presenti.
- **FR-041**: Ogni report DEVE contenere la sezione «limiti del metodo», generata a partire da ciò che è realmente accaduto in quell'analisi (metriche mancanti, campione, proxy usati), non da un testo fisso.
- **FR-042**: Ogni report DEVE dichiarare in testata: data, elementi confrontati, modello AI usato per la generazione del materiale, preset, versione della formula dell'indice, versione del misuratore.

**Andamento**

- **FR-043**: ANDAMENTO DEVE offrire i quattro assi di raggruppamento (tempo, versione/modello/preset, registro di classe, materia e livello).
- **FR-044**: Ogni cella con meno di 3 analisi DEVE portare un avviso di campione insufficiente.
- **FR-045**: Analisi con versioni diverse della formula NON DEVONO essere fuse nella stessa serie.
- **FR-046**: Ogni punto DEVE aprire il report di dettaglio da cui proviene.

**Interfaccia**

- **FR-047**: La landing DEVE avere tre tab — ANALIZZA, ANDAMENTO, METODO — con lo stesso pattern di commutazione della landing MappAI.
- **FR-048**: L'interfaccia DEVE rispettare i design token MappAI: larghezza contenuto 1100px, bottoni azione `bg-slate-100` con hover `emerald-400` e label centrata su due righe, header di sezione `text-sm font-bold text-slate-600` con icona Lucide `text-indigo-400` e chevron, sezioni collassabili, date GG/MM/AAAA, Space Mono con `Noto Color Emoji` nello stack effettivo.
- **FR-049**: Gli elenchi di file DEVONO usare `<table class="table-fixed">` con `<colgroup>`, colonna azioni a larghezza fissa in ultima posizione, allineamento a sinistra salvo colonne numeriche brevi.
- **FR-050**: I report generati DEVONO usare il linguaggio visivo editoriale della pagina di riferimento (colonna stretta, serif per i titoli, carta crema, accenti per elemento, tema chiaro e scuro), distinto dai token dell'app.
- **FR-051**: L'app DEVE funzionare completamente offline salvo la chiamata AI opzionale: nessun font, foglio di stile o libreria da CDN.
- **FR-052**: Nessuna informazione DEVE essere veicolata dal solo colore: gli elementi a confronto DEVONO essere distinguibili anche da etichetta o simbolo.

### Key Entities

- **Elemento** — un'unità misurabile caricata in `Upload/`. Ha un tipo (vault · pdf · sintesi), un nome disambiguato, il contesto fotografato all'import (classe, registro, note, modello, preset, consumi, date) e un insieme di corpi di testo estratti.
- **Corpo di testo** — una porzione omogenea misurabile: nodi concatenati, sintesi, singolo set di quiz, fonte originale. Ogni corpo porta le proprie metriche linguistiche.
- **Misura** — l'insieme dei numeri prodotti su un elemento: metriche per corpo, metriche strutturali, indice, componenti attivi, motivi delle metriche mancanti.
- **Confronto** — l'accostamento di N misure: Δ per metrica, concetti appaiati, concetti esclusivi, matrice di presenza.
- **Analisi** — l'oggetto salvato: identificativo, data, tipo (profilo · confronto), elenco degli elementi, misure, confronto, versione dell'indice, versione del misuratore, prosa AI se presente, limiti rilevati.
- **Report** — la resa `.html` di un'analisi, con l'analisi e il profilo di parametri incorporati.
- **Profilo di parametri** — l'insieme completo delle scelte arbitrarie che governano il calcolo: pesi, ancoraggi, soglie, velocità di lettura, dimensione degli n-grammi, finestre di abbinamento, tasso di cambio. Ogni voce porta con sé definizione operativa, motivazione e limite noto. È al tempo stesso ciò che il codice legge per calcolare e ciò da cui la pagina METODO viene generata.
- **Archivio** — l'insieme delle analisi salvate, materia prima dell'ANDAMENTO.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Analizzando i due vault reali `1A/Funzioni Urbane` e `1B/Funzioni Urbane`, il misuratore riproduce le cifre della pagina di riferimento del 24/07/2026 **sulle metriche a definizione univoca**: tutte le metriche strutturali, tutte le righe di parole per nodo comprese le deviazioni standard, e per il corpus dei nodi parole, frasi, parole per frase, percentuale di parole lunghe e Gulpease entro 0,2 punti. Verificato per calibrazione in fase di ricerca — vedi `research.md`. Le metriche a proxy euristico (nominalizzazioni, connettivi, passive, marcatori) e il corpus della sintesi **non** sono riproducibili perché le liste e i confini usati nel 2026 non furono scritti da nessuna parte: il misuratore adotta definizioni proprie, dichiarate nel profilo, e i valori storici corrispondenti restano non comparabili. È esattamente il fallimento che FR-053 esiste per impedire.
- **SC-002**: Un assessment che il 24/07/2026 ha richiesto una sessione di lavoro completa si ottiene in meno di due minuti dal caricamento del primo vault all'apertura del report.
- **SC-003**: Ripetere la stessa analisi due volte produce due report con numeri identici.
- **SC-004**: Un report prodotto oggi resta leggibile e ricalcolabile dopo che i vault d'origine sono stati modificati o cancellati.
- **SC-005**: Nessun report emesso contiene un Δ accessibilità senza la copertura della fonte accanto.
- **SC-006**: Con tre analisi di registri diversi in archivio, ANDAMENTO risponde alla domanda «il registro semplice produce materiale più accessibile?» con una media per registro e l'avviso di campione insufficiente dove serve.
- **SC-007**: Il report generato con la prosa AI ha esattamente gli stessi numeri del report deterministico da cui deriva.
- **SC-008**: L'app funziona senza rete: si carica, si analizza e si legge il report con la connessione spenta.
- **SC-009**: Un report a 9 elementi si legge senza scorrimento orizzontale del corpo pagina su uno schermo da 1280px.
- **SC-010**: La suite di test resta verde e copre i moduli puri di misura con casi costruiti sui vault reali.
- **SC-011**: Per ogni cifra che compare in un report è possibile risalire, dal tab METODO, alla definizione operativa e alla soglia che l'hanno prodotta.
- **SC-012**: Modificare un parametro e rigenerare un'analisi cambia il risultato in modo prevedibile e lascia intatto il report precedente.
- **SC-013**: Nessun testo che descrive una metrica esiste in due posti: cambiare la definizione nella configurazione la cambia sia in METODO sia nei report.

---

## Assumptions

- Il misuratore è un'applicazione Electron **separata**, con il proprio `package.json` e il proprio processo main. Non importa moduli dall'app MappAI a runtime: le porzioni riusate (tokenizzazione e stemming italiano, normalizzazione degli item di quiz, formattazione delle date, sanificazione dei nomi file) vengono **copiate** nel nuovo progetto, con il riferimento al file d'origine annotato. Una dipendenza viva tra le due app renderebbe fragile entrambe.
- I vault analizzati hanno la struttura corrente (`index.yaml`, `Nodi/*.md` con frontmatter, `links.json`, `Materiale Studio/`, `Fonti/`, `pipeline.json`). I formati legacy vengono gestiti in lettura secondo il DAL Protocol, ma non sono il caso di riferimento.
- Il registro di classe (`semplice` · `medio` · `ricco`) e le note vivono in `classi.json` di MappAI e sono la fonte della stratificazione. Un elemento importato senza classe risolvibile è stratificato come «non dichiarato».
- La lingua del materiale è l'italiano. Gulpease e Flesch-Vacca non hanno senso su altre lingue e vengono emessi con avviso.
- La cartella dati vive dentro la cartella di progetto, come richiesto. **Nota tecnica da decidere prima della pacchettizzazione**: dentro un'app impacchettata quel percorso è in sola lettura, quindi al momento della distribuzione la cartella dovrà spostarsi in `~/Documents/MappAI - misuratore - FILE`, con lo stesso pattern di risoluzione già usato da MappAI. Per lo sviluppo si procede come richiesto.
- **Provider AI: solo Google Gemini** (deciso 28/07/2026). Il vincolo dual-provider della costituzione (principio IV) esiste per il GDPR sui dati educativi: qui all'AI arrivano solo numeri aggregati e metadati di classe — mai testi di studenti, mai testi delle schede, mai nominativi. Il misuratore è inoltre uno strumento interno che non tratta dati di allievi identificabili. La deroga è consapevole e circoscritta a questa app; se in futuro all'AI dovessero arrivare testi, va riaperta.
- **Interfaccia in solo italiano** (deciso 28/07/2026). Deroga consapevole al principio VII della costituzione: strumento interno, un solo utilizzatore. Le stringhe restano comunque centralizzate in un dizionario, così che aggiungere l'inglese in seguito non richieda di ripassare il codice.
- La chiave API per la prosa interpretativa viene inserita nel misuratore, non ereditata da MappAI: le due app hanno archivi separati e leggere la chiave altrui sarebbe fragile e opaco.
- Il misuratore misura materiale già generato. Non genera mappe, non modifica i vault, non scrive mai dentro `Mappe/`.

---

## Fuori perimetro (v1)

- **OCR** su PDF scansionati.
- **Analisi linguistica vera** con lemmatizzazione e POS tagging: le metriche restano proxy euristici basati su suffissi e stringhe, e il report lo dichiara come limite, esattamente come la pagina di riferimento.
- **Giudizio umano strutturato** (idea 07 del riferimento): raccogliere la valutazione di un OPI dentro il report è un layer successivo.
- **Misura del layer tipografico** (font, interlinea, spaziatura dei PDF): oggi identico tra gli elementi perché dipende dal preset, quindi non discriminante. Diventa interessante quando si confrontano preset diversi o l'uso di OpenDyslexic/Bionic.
- **Modifica del materiale**: il misuratore osserva, non corregge. Il miglioramento è compito del Co-docente (feature 012).
- **Esportazione PDF del report** e scheda sintetica di una pagina.
- **Interfaccia in inglese**: solo italiano in v1 (Assumptions). Le stringhe restano centralizzate perché aggiungerla dopo non costi una riscrittura.
- **Provider Infomaniak**: solo Google in v1 (Assumptions). Da riaprire se all'AI dovessero mai arrivare testi anziché soli numeri.

---

## Allegato A — Indice di accessibilità `indice-accessibilita@1`

*Profilo predefinito, rivisto con Giacomo il 28/07/2026. Ogni valore qui sotto è un parametro editabile dal tab METODO (US8): la tabella è il default motivato, non una costante di codice.*

Serve un numero unico perché l'ANDAMENTO non può plottare quindici metriche. Ogni componente è normalizzato 0-100 (100 = più accessibile) con ancoraggi **fissi e dichiarati**, mai con punteggi standardizzati sul corpus: uno z-score renderebbe il valore di un'analisi dipendente da quali altre analisi esistono, e la storia cambierebbe a ogni nuovo caricamento. Gli ancoraggi sono interpolazioni lineari a tratti fra i punti indicati.

| # | Componente | Peso | Che cosa misura | Ancoraggi (valore → punteggio) |
|---|---|---|---|---|
| 1 | Leggibilità | **22** | Media di Gulpease e Flesch-Vacca | Gulpease 40→0 · 60→45 · 70→75 · 80→100. Flesch-Vacca 30→0 · 50→45 · 60→75 · 70→100 |
| 2 | Lunghezza delle frasi | **12** | Parole per frase | 25→0 · 18→50 · 12→100 |
| 3 | Densità terminologica | **12** | Media di parole lunghe e nominalizzazioni | Parole lunghe 35%→0 · 25%→50 · 15%→100. Nominalizzazioni 12→0 · 7→50 · 3→100 (per 100 parole) |
| 4 | Carico sintattico | **8** | Connettivi subordinanti + passive per 100 parole | 1,5→0 · 0,8→50 · 0,2→100 |
| 5 | Granularità dei blocchi | **12** | Media e deviazione standard delle parole per nodo | Media 70→0 · 55→50 · 40→100. Dev.std 20→0 · 12→50 · 6→100 |
| 6 | Dispositivi di scansione | **15** | Elenchi, titoli-domanda, sotto-titoli, marcatori di esempio per 1000 parole — **moderati dal fattore di sostanza** | 0→0 · 4→60 · 10→100 (saturante) |
| 7 | Carico temporale | **9** | Tempo di lettura stimato del materiale completo | 30 min→0 · 15 min→50 · 5 min→100 |
| 8 | Nessi logici espliciti | **10** | Quanto le relazioni di causa-effetto sono dichiarate invece che lasciate da inferire | vedi sotto |

Totale: 100.

### Perché questi pesi

La leggibilità resta il componente singolo più pesante (22) perché è l'unica metrica con soglie scolastiche riconosciute, ma non domina più: la revisione del 28/07 ha spostato peso verso i dispositivi di scansione e il carico temporale, che agiscono su ADHD e affaticamento — dimensioni che le formule di leggibilità classiche ignorano del tutto, essendo tarate su lettori senza disturbi specifici.

Lunghezza delle frasi, densità terminologica e granularità pesano uguale (12) perché la pagina di riferimento mostra che agiscono su piani indipendenti: il registro semplice ha migliorato la prima e la terza lasciando invariata la seconda. Un indice che le fondesse nasconderebbe proprio l'osservazione chiave del §4, che è il risultato più interessante emerso finora.

Il carico sintattico pesa poco (8) perché è già in parte catturato dalla lunghezza delle frasi.

I dispositivi di scansione salgono a 15 perché per un lettore ADHD la possibilità di *entrare e uscire* dal testo senza perdere il filo vale quanto la facilità della singola frase — ma questo peso è sostenibile solo grazie al fattore di sostanza descritto sotto, che impedisce di guadagnarlo a vuoto.

Il carico temporale sale a 9 perché il tempo è un vincolo reale e oggi invisibile: un materiale «facile» che richiede quaranta minuti di attenzione continua non è accessibile a chi non ha quaranta minuti di attenzione continua.

### Componente 6 — il fattore di sostanza

Senza correttivo, il componente 6 si può guadagnare spezzettando: cinquanta elenchi puntati da tre parole ciascuno ottengono il punteggio pieno e sono, per contenuto, nulla. Il punteggio grezzo viene quindi moltiplicato per un **fattore di sostanza** compreso fra 0,4 e 1,0, pari al minore fra due sotto-fattori:

- **Densità per dispositivo** — parole di contenuto medie per elenco puntato e per sotto-titolo: ≥8 → 1,0 · 5 → 0,7 · ≤3 → 0,4.
- **Non-ridondanza** — sovrapposizione media di n-grammi fra nodi fratelli (la stessa misura della lente F): ≤0,20 → 1,0 · 0,45 → 0,7 · ≥0,70 → 0,4.

Il fattore non può azzerare il componente: la formattazione, anche povera, aiuta comunque a orientarsi. Ma può dimezzarne l'apporto. È lo stesso principio della copertura rispetto al Δ — un guadagno di forma non vale se sotto non c'è nulla.

### Componente 8 — nessi logici espliciti

Aggiunto su indicazione di Giacomo il 28/07/2026: per uno studente BES/DSA il costo maggiore non è sempre leggere la frase, è **ricostruire il rapporto fra due frasi quando nessuno lo ha dichiarato**. Un testo che dice «le città accumularono capitali. Nacquero le banche» chiede un'inferenza; «le città accumularono capitali, **e per questo** nacquero le banche» non la chiede. Le formule di leggibilità non vedono questa differenza: le due versioni hanno quasi lo stesso Gulpease.

Il componente si calcola su due piani, mediati:

- **Piano lessicale** (calcolabile su qualunque testo, fonte compresa): connettivi causali e logici per 100 parole (`perché`, `quindi`, `per questo`, `di conseguenza`, `infatti`, `così che`, `se… allora`), più le catene causali esplicite già contate nella pagina di riferimento. Ancoraggi: 0,3→0 · 1,0→55 · 2,0→100.
- **Piano strutturale** (solo vault): quota di legami del grafo con una relazione di famiglia causale, condizionale o oppositiva — non il generico `include`. Riusa la tassonomia `EDGE_FAMILIES` di MappAI (FR-030-ter). Ancoraggi: 10%→0 · 35%→55 · 60%→100.

**Attenzione a non confonderlo col componente 4**, che penalizza i connettivi *subordinanti*. Non è una contraddizione ed è un punto delicato: subordinare è un costo sintattico (una frase dentro l'altra, memoria di lavoro sotto pressione), esplicitare un nesso è un guadagno inferenziale. Il testo ideale per questo profilo dichiara molti nessi in coordinazione — «X succede. **Per questo** succede Y.» — non in subordinazione — «X, che avendo prodotto Y, comporta…». I due componenti insieme premiano esattamente quella forma, che è poi la raccomandazione delle linee guida BES/DSA.

### Componenti non calcolabili

Il componente 5 richiede una struttura a nodi: su un PDF fonte non esiste. Il componente 6 richiede un documento con formattazione: su nodi concatenati non ha senso. Il piano strutturale del componente 8 richiede un grafo; su una fonte resta il solo piano lessicale. Quando un componente non è calcolabile il suo peso si ridistribuisce in proporzione sugli altri, e l'indice porta con sé il conteggio dei componenti attivi.

**Nel calcolo del Δ fonte → prodotto si usano solo i componenti attivi su entrambi i lati**, altrimenti si confronterebbero due numeri costruiti su basi diverse.

### Velocità di lettura

**120 parole al minuto** per la lettura (revisione del 28/07: profilo di studente di prima media con difficoltà specifiche, non un lettore adulto competente né uno studente normolettore), **150** per l'ascolto TTS. Entrambe dichiarate nel dato e modificabili.

### Nota sugli ancoraggi di leggibilità

Le soglie Gulpease riconosciute sono 40 (licenza superiore), 60 (licenza media), 80 (licenza elementare). La mappatura adottata **non** fa coincidere la soglia «medie» con la sufficienza: 60 vale 45 punti, e la sufficienza piena (60 punti) cade attorno a Gulpease 66. La ragione è che il destinatario non è lo studente nominale di prima media ma quello con dislessia o ADHD, per cui la soglia nominale è il limite superiore della fatica, non una condizione confortevole. È la scelta più severa fra le due possibili ed è deliberata; se in futuro apparisse punitiva, si sposta dal tab METODO senza toccare il codice e senza riscrivere le analisi già fatte.
