# MappAI — Architettura attuale e Piano di evoluzione verso il Precision Teaching

> **Documento di progetto**
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Versione: 1.0 — 20 giugno 2026
> Scopo: descrivere l'architettura software attuale di MappAI e l'evoluzione pianificata
> verso un'applicazione di **Precision Teaching** per studenti di scuola media e liceo.
> Questo documento è la base per una presentazione rivolta a **insegnanti e pedagogisti**.

---

## Indice

1. [Visione: dalla mappa allo studio di precisione](#1-visione)
2. [Fondamenti pedagogici](#2-fondamenti-pedagogici)
3. [Architettura software attuale](#3-architettura-software-attuale)
4. [Le attività di studio attuali — UX dettagliata](#4-attività-di-studio-attuali)
5. [Il modello dati che misura l'apprendimento](#5-modello-dati)
6. [Implementazione pianificata — Precision Teaching](#6-implementazione-pianificata)
7. [Le nuove attività di studio — UX dettagliata](#7-nuove-attività-ux)
8. [Privacy, dati e tutela dei minori](#8-privacy)
9. [Roadmap a fasi](#9-roadmap)
10. [Glossario per pedagogisti](#10-glossario)
11. [Appendice tecnica](#11-appendice-tecnica)

---

<a name="1-visione"></a>
## 1. Visione: dalla mappa allo studio di precisione

MappAI nasce come strumento per **trasformare fonti testuali** (PDF, pagine web, video,
documenti, testo libero) in **mappe mentali** e **grafi della conoscenza** generati con
l'intelligenza artificiale. È pensato in particolare per studenti **BES/DSA** (dislessia,
ADHD, ipovisione) e per le figure educative che li accompagnano.

Oggi MappAI sa già fare due cose importanti:

- **costruire** una rappresentazione visiva e gerarchica del sapere;
- **far studiare attivamente** lo studente su quella rappresentazione, con sette attività
  interattive che lo obbligano a ricostruire, nominare, spiegare e ordinare i concetti.

Il passo successivo, oggetto di questo documento, è trasformare MappAI da "strumento di
studio attivo" a vero e proprio **ambiente di Precision Teaching**: un sistema che non solo
fa esercitare lo studente, ma **misura con precisione** quanto un concetto è stato appreso,
**suggerisce l'ordine** in cui studiare i concetti (rispettando i prerequisiti) e **mostra
graficamente i progressi** nel tempo.

L'ispirazione teorica viene dal framework di ricerca **CourseKG** (riconoscimento delle
entità educative con reti neurali BERT-BiGRU-MHSA-CRF e costruzione di grafi della
conoscenza per l'insegnamento di precisione). MappAI adotta oggi i **principi pedagogici e
strutturali** di CourseKG attraverso modelli linguistici di grande scala (LLM), riservando a
una fase futura l'eventuale implementazione del motore neurale specializzato.

---

<a name="2-fondamenti-pedagogici"></a>
## 2. Fondamenti pedagogici

Il progetto integra tre tradizioni pedagogiche complementari.

### 2.1 Mastery Learning (Bloom)

Principio: uno studente affronta un concetto B **solo dopo** aver padroneggiato il suo
prerequisito A. L'apprendimento non procede per calendario, ma per **padronanza
effettiva**. Nel grafo questo si traduce in **relazioni di precursore** (Precursor): archi
che indicano "per capire B devi prima aver capito A".

### 2.2 Precision Teaching (Lindsley)

Principio: l'apprendimento si misura non solo come "giusto/sbagliato", ma come **fluenza**,
ovvero la **frequenza di risposte corrette nel tempo** (risposte corrette al minuto). Una
conoscenza non è davvero acquisita finché non è **fluente**, cioè rapida e automatica, non
solo accurata. Precision Teaching prevede:

- **pinpoint**: la definizione precisa dell'abilità misurata (es. "richiamare la definizione
  del nodo X");
- **timing**: sprint cronometrati brevi e ripetuti;
- **fluency aim**: l'obiettivo di frequenza da raggiungere (es. 20 risposte corrette/min);
- **celeration**: l'andamento della fluenza nel tempo, misurato giorno per giorno.

### 2.3 Tassonomia delle relazioni (CourseKG)

CourseKG codifica i legami logici tra concetti in categorie precise. MappAI le integra nel
proprio vocabolario di relazioni (vedi §6.1), in particolare:

| Relazione | Significato pedagogico |
|---|---|
| **Inclusion** | A contiene logicamente B |
| **Precursor** | A è prerequisito di B (cuore del Mastery Learning) |
| **Identity** | A e B descrivono lo stesso concetto (deduplicazione) |
| **Brother** | A e B sono "fratelli" sotto lo stesso genitore, senza ordine temporale |
| **Correlation** | A e B sono collegati ma non rientrano nelle altre categorie |
| **Inheritance** | A è il concetto-genitore, B il concetto-figlio |
| **Cause-and-effect** | A innesca, B è la conseguenza |

> **Nota di metodo.** Le sette relazioni di CourseKG sono ottime per la **logica dei
> percorsi** (ordine di studio, deduplicazione), ma più grossolane per la **ricchezza
> espressiva** delle mappe. MappAI per questo **non le sostituisce** al proprio vocabolario,
> ma le **integra**, mantenendo dieci famiglie di relazione (vedi §6.1).

---

<a name="3-architettura-software-attuale"></a>
## 3. Architettura software attuale

### 3.1 Stack tecnologico

- **Electron 30** — applicazione desktop multipiattaforma (macOS, Windows, Linux).
- **Node.js** — processo principale (`main.js`): lettura file, chiamate AI, salvataggio vault.
- **Vanilla JavaScript** — interfaccia (nessun framework, nessun bundler).
- **D3.js v7** — grafo interattivo.
- **Tailwind CSS** — stile (via CDN runtime).
- **PDF.js** — lettura PDF; **Mammoth** — lettura DOCX; **Cheerio** — lettura pagine web.
- **KaTeX** — formule matematiche.
- **jsPDF / docx** — esportazione PDF e Word.
- **graphology** — metriche di grafo (centralità, comunità) per l'analisi strutturale.

### 3.2 Struttura del progetto

```
MappAI/
├── main.js                      Processo principale Electron (IPC, file system, AI)
├── public/
│   ├── index.html               Interfaccia utente
│   ├── css/style.css            Stile
│   ├── js/
│   │   ├── app.js               Monolite principale (~14.000 righe)
│   │   ├── mappai-active-study.js   ← Le 7 attività di studio attivo
│   │   ├── mappai-structure-analyzer.js  Analisi strutturale del grafo
│   │   ├── mappai-node-merge.js     Fusione e riassegnazione nodi
│   │   ├── mappai-lenses.js         Filtri semantici per la generazione
│   │   ├── mappai-timeline.js       Vista cronologica
│   │   ├── mappai-quiz-print.js     Stampa quiz e flashcard
│   │   └── ...                       Altri moduli di supporto
│   ├── traduzioni/              Italiano e inglese
│   └── prompts_default.json     Template dei prompt AI
└── prompts_config.json          Configurazione AI attiva
```

### 3.3 Lo stato dell'applicazione

Tutto il sapere visualizzato vive in un unico oggetto di stato, `appState`:

- `appState.db.nodes` — i nodi (concetti) della mappa;
- `appState.db.links` — gli archi (relazioni) tra concetti, ciascuno con un verbo (`rel`);
- `appState.db.sourcesDict` — per ogni nodo, le citazioni testuali dalla fonte;
- `appState.db.studySets` — quiz e flashcard generati;
- `appState.extractionMode` — `mindmap` (gerarchia) o `kg` (grafo relazionale).

### 3.4 I provider di intelligenza artificiale

MappAI funziona con due fornitori AI selezionabili:

- **Google Gemini** — modelli ad ampia finestra di contesto, schema JSON nativo.
- **Infomaniak** — fornitore **svizzero**, conforme al GDPR, adatto a dati educativi sensibili
  (modelli open source ospitati in Svizzera).

Lo sviluppo delle nuove funzioni di Precision Teaching parte su **Google Gemini**, con il
codice già **astratto** per aggiungere Infomaniak in seguito senza riscritture.

### 3.5 La generazione delle mappe

- **MindMap** — mappa gerarchica ad albero, costruita in più passaggi (macro-aree → rami →
  foglie), con descrizioni ricche di studio su ogni nodo.
- **Knowledge Graph** — grafo relazionale con legami laterali tra concetti; in modalità
  "Community" l'AI individua autonomamente i macro-temi (rilevamento di comunità).

### 3.6 Il Vault: dove vive il lavoro dello studente

Ogni progetto è salvato come **Vault** nella cartella Documenti dell'utente
(`~/Documents/MappAI - Vault/`), in formato aperto e ispezionabile:

- `index.yaml` — metadati del progetto;
- `links.json` — le relazioni;
- `Nodi/*.md` — un file Markdown per concetto (compatibile con Obsidian);
- `Studio Attivo/` — lo **storico dei punteggi** delle sessioni di studio.

Questa scelta è importante per le scuole: **i dati restano sul dispositivo**, in formato
leggibile, senza dipendere da un cloud.

---

<a name="4-attività-di-studio-attuali"></a>
## 4. Le attività di studio attuali — UX dettagliata

MappAI mette già a disposizione un modulo di **Studio Attivo**: lo studente non guarda una
mappa già pronta, ma la **(ri)costruisce**. Si parte dal solo nodo centrale e da tutti gli
altri nodi "sciolti"; a seconda dell'attività scelta, lo studente collega, ordina, nomina o
spiega i concetti.

Tutte le attività condividono:

- un **pannello laterale** persistente con titolo, istruzioni, punteggio e i pulsanti
  **Verifica**, **Soluzione**, **Riprova**, **Esci**;
- un meccanismo **completamente reversibile**: all'avvio viene salvata una "fotografia"
  della mappa originale (struttura, livelli, colori, etichette, descrizioni, posizioni);
  uscendo o mostrando la soluzione, la mappa originale viene ripristinata senza perdita di
  dati;
- il **salvataggio del punteggio** nel Vault al termine.

Di seguito le sette attività, ciascuna con obiettivo pedagogico, esperienza dello studente e
dati raccolti.

---

### 4.1 Costruisci la mappa personale — *"i nodi grigi"*

**Obiettivo pedagogico.** Verificare se lo studente possiede una **visione d'insieme**:
sa riconoscere quali concetti sono i grandi temi (rami principali) e come tutto si collega al
concetto centrale.

**Cosa vede lo studente.** Il nodo centrale colorato al centro; tutti gli altri nodi sono
**grigi** e sparpagliati attorno, senza collegamenti.

**Interazione.**
1. Lo studente clicca un nodo: si illumina ("Collega … a …").
2. Clicca un secondo nodo: si crea il collegamento.
3. Un nodo **prende colore** e diventa un ramo principale **solo quando viene collegato**
   (anche indirettamente) al concetto centrale. La profondità nell'albero si ricalcola
   automaticamente.

**Feedback.** Non esiste una sola soluzione corretta: è una mappa **personale**. La verifica
restituisce statistiche — quanti nodi collegati, quanti rami principali, quale profondità —
non un voto.

**Dati raccolti.** Numero di nodi collegati, numero di rami, profondità della mappa.

---

### 4.2 Ricostruisci le gerarchie — *"i nodi colorati"*

**Obiettivo pedagogico.** Verificare la padronanza della **struttura corretta**: ogni
concetto sa tornare al suo ramo giusto.

**Cosa vede lo studente.** Ogni nodo ha **già il colore della sua area tematica**, ma i
collegamenti sono stati rimossi. I nodi sono sparsi.

**Interazione.** Lo studente ricollega i nodi ricostruendo i rami, come in un puzzle a
colori.

**Feedback.** Premendo **Verifica**, il sistema confronta i collegamenti dello studente con
l'albero originale: mostra **quanti collegamenti corretti** su totale (in percentuale) ed
evidenzia **in rosso** i nodi col genitore sbagliato.

**Dati raccolti.** Collegamenti corretti / totali, percentuale di accuratezza.

---

### 4.3 Richiamo: nomina i nodi

**Obiettivo pedagogico.** Allenare il **richiamo attivo** (active recall) delle etichette:
data la struttura, lo studente deve ricordare *come si chiama* ogni concetto.

**Cosa vede lo studente.** La struttura della mappa è intatta e visibile, ma le etichette dei
nodi sono **nascoste** (puntini "• • •"). A lato compare un pannello con **tutte le etichette
mescolate**.

**Interazione.** Lo studente **trascina** un'etichetta sul nodo giusto (oppure la tocca e poi
clicca il nodo). Può ripensarci e rimuovere un'assegnazione.

**Feedback.** Premendo **Confronta**, il sistema mostra quante etichette sono al posto giusto
e segna in rosso gli errori.

**Dati raccolti.** Per ogni nodo: etichetta piazzata, etichetta corretta, esito.

---

### 4.4 Riempi le descrizioni — *"inserimento dei content"*

**Obiettivo pedagogico.** La forma più profonda di studio per uno studente BES/DSA:
**spiegare con parole proprie**. Le descrizioni ricche dei nodi sono lo strumento principale
di studio, e qui lo studente le ricostruisce.

**Cosa vede lo studente.** La struttura è visibile. Cliccando un nodo si apre una finestra:
"Spiega: [nome del concetto]" con un'area di testo.

**Interazione.**
1. Lo studente scrive con parole sue cosa significa il concetto.
2. Preme **Confronta**.
3. Compare la **descrizione della fonte** accanto alla sua.
4. L'**intelligenza artificiale valuta la copertura concettuale** (0–100%): conta i concetti
   chiave colti, non la lunghezza o la forma, con un feedback incoraggiante di 1–2 frasi.
   Se non c'è connessione AI, lo studente **si autovaluta** con un semplice "Sì / No".

**Feedback.** Punteggio percentuale con barra colorata (verde se ≥60%, ambra se da rivedere)
e commento testuale.

**Dati raccolti.** Per ogni nodo: testo dello studente, percentuale di copertura, esito,
testo della fonte, feedback, e se la valutazione è stata fatta dall'AI o in autovalutazione.

---

### 4.5 Trova l'intruso — *"la mappa bugiarda con le foglie spostate"*

**Obiettivo pedagogico.** Allenare il **senso critico** e la conoscenza fine: accorgersi che
un concetto è stato messo nel ramo sbagliato.

**Cosa vede lo studente.** La mappa appare corretta, ma **1 o 2 foglie sono state spostate**
in un ramo a cui non appartengono (la "mappa bugiarda").

**Interazione.** Lo studente individua gli intrusi e li **ricollega al ramo giusto**.

**Feedback.** Premendo **Verifica**, il sistema controlla se gli intrusi sono tornati al loro
genitore originale; segna in rosso quelli ancora fuori posto.

**Dati raccolti.** Intrusi ricollocati correttamente / totali.

---

### 4.6 I verbi delle relazioni

**Obiettivo pedagogico.** Capire **che tipo di legame** unisce due concetti (causa, sequenza,
prerequisito, opposizione…): il livello più alto di comprensione di una mappa.

**Cosa vede lo studente.** La struttura è corretta, ma i **verbi sulle frecce sono nascosti**
(sostituiti da "?").

**Interazione.** Lo studente clicca una freccia e sceglie la **famiglia di relazione** giusta
da un elenco illustrato (con colore, etichetta e parole-chiave di esempio).

**Feedback.** Il sistema confronta la famiglia scelta con quella corretta, **rivela il verbo
originale** sulla freccia e dà un riscontro immediato.

**Dati raccolti.** Per ogni freccia: famiglia scelta, famiglia corretta, esito.

---

### 4.7 Ordina la sequenza

**Obiettivo pedagogico.** Ricostruire l'**ordine cronologico o procedurale** di un processo
(es. le tappe di un evento storico, i passaggi di un esperimento).

**Cosa vede lo studente.** I nodi di un ramo cronologico vengono **mescolati**.

**Interazione.** Lo studente li **ricollega nell'ordine corretto**.

**Feedback.** Premendo **Verifica**, il sistema conta quanti collegamenti rispettano
l'ordine originale.

**Dati raccolti.** Collegamenti nell'ordine giusto / totali.

---

### 4.8 Quiz e flashcard generati dall'AI

Oltre alle sette attività sul grafo, MappAI genera **quiz** (scelta multipla, vero/falso,
risposta aperta) e **flashcard** a partire da un nodo, un ramo o l'intera mappa. Il lettore
("player") di studio mostra le domande una a una, con un **timer opzionale** e il calcolo del
**punteggio finale**; al termine lo studente valuta la difficoltà percepita, per programmare
il **prossimo ripasso** (logica di ripetizione dilazionata già presente).

> **Punto chiave per la presentazione.** MappAI **registra già** i risultati delle sessioni
> (accuratezza, punteggio, dettaglio delle risposte, data e ora) in un archivio locale
> (`Studio Attivo/sessioni.jsonl`). Questo è il **substrato di misurazione** su cui si
> innesta il Precision Teaching: i dati ci sono già, manca la dimensione del **tempo**
> (la fluenza) e la **continuità nel tempo** (la celeration).

---

<a name="5-modello-dati"></a>
## 5. Il modello dati che misura l'apprendimento

### 5.1 Cosa MappAI registra oggi

Per ogni sessione di studio, nel Vault viene salvato:

- una **riga leggibile** nello storico (`Studio Attivo/storico_score.md`):
  `ora · attività · progetto · punteggio (percentuale)`;
- un **record strutturato** (`Studio Attivo/sessioni.jsonl`) con data, ora, attività,
  progetto, punteggio, accuratezza e il **dettaglio voce per voce** (cosa ha risposto lo
  studente, quanto era corretto, valutato da AI o in autovalutazione).

### 5.2 Cosa manca per il Precision Teaching

| Dimensione | Oggi | Da aggiungere |
|---|---|---|
| **Accuratezza** | ✅ registrata | — |
| **Tempo / fluenza** | ⏳ parziale (timer nel player) | risposte corrette al **minuto** per ogni attività cronometrabile |
| **Pinpoint** | ❌ | unità di misura precisa = **nodo × tipo di attività** |
| **Mastery per nodo** | ❌ (solo "da ripassare") | stato di padronanza **per concetto**, a due fasi |
| **Celeration** | ❌ | andamento della fluenza **giorno per giorno** |
| **Fluency aim** | ❌ | obiettivo di frequenza configurabile |
| **Profili** | ❌ (singolo) | **più studenti** sullo stesso dispositivo |

---

<a name="6-implementazione-pianificata"></a>
## 6. Implementazione pianificata — Precision Teaching

### 6.1 Vocabolario delle relazioni esteso (da 8 a 10 famiglie)

MappAI mantiene le otto famiglie di relazione attuali (Causa/Effetto, Dipendenza/Prerequisito,
Sequenza/Processo, Gerarchia/Parte di, Controllo/Regola, Contrasto/Opposto,
Analogia/Similitudine, Altro/Libero) e ne aggiunge due da CourseKG:

- **Identity** ("è lo stesso di") — per riconoscere e **fondere concetti duplicati**;
- **Brother** ("è parallelo a") — per i concetti **fratelli** allo stesso livello.

La relazione **Precursor** è già rappresentata dalla famiglia **Dipendenza/Prerequisito**;
per la logica dei percorsi si considerano "propedeutiche" anche le relazioni di
**Sequenza/Processo**. Nessun verbo ricco viene perso: le sette categorie di CourseKG servono
da **strato logico** per i percorsi, non sostituiscono il vocabolario espressivo.

### 6.2 Il pinpoint: l'unità di misura

L'unità di misura del Precision Teaching in MappAI è il **pinpoint = nodo × tipo di attività**.
Esempi distinti per lo stesso concetto "Fotosintesi":

- *richiamare l'etichetta* di Fotosintesi;
- *spiegare con parole proprie* la Fotosintesi;
- *completare* (cloze) la definizione di Fotosintesi.

Ciascuno ha una **propria curva di fluenza**. Questo permette una diagnosi fine: uno studente
può **riconoscere** un termine ma non saperlo **spiegare**.

### 6.3 La padronanza a due fasi

Un concetto è **padroneggiato** quando supera due soglie in sequenza:

1. **Acquisizione** — accuratezza ≥ soglia (es. 80%): lo studente *sa* la risposta.
2. **Fluenza** — risposte corrette al minuto ≥ *fluency aim*: lo studente la sa *in modo
   rapido e automatico*.

Solo un concetto **fluente** sblocca i concetti che lo hanno come prerequisito.

### 6.4 I percorsi di prerequisiti (il primo obiettivo, MVP)

1. Un'**analisi AI** legge la mappa e propone gli **archi Precursor espliciti** ("per capire
   B serve prima A"), anche tra rami diversi.
2. Una nuova **vista "Percorso di studio"** ordina i concetti rispettando i prerequisiti e
   evidenzia quelli **"pronti da studiare"** (prerequisiti già padroneggiati).
3. Il **gating** (sblocco) è **configurabile dal docente**:
   - *soft* (predefinito): consiglia l'ordine ma non blocca nulla — adatto a BES/DSA, niente
     frustrazione;
   - *hard*: blocca un concetto finché i suoi prerequisiti non sono padroneggiati — Mastery
     Learning rigoroso.

### 6.5 Profili multipli locali

Più studenti possono usare lo stesso dispositivo (una classe a scuola, fratelli a casa).
Ciascun profilo ha i propri dati di padronanza e fluenza, **salvati solo localmente**.

---

<a name="7-nuove-attività-ux"></a>
## 7. Le nuove attività di studio — UX dettagliata

### 7.1 Pratica cronometrata (fluency timing)

**Obiettivo pedagogico.** Trasformare la conoscenza accurata in conoscenza **fluente**.

**Cosa vede lo studente.** Le attività cronometrabili (Ricostruisci gerarchie, Nomina i nodi,
Completa, Costruisci la mappa) acquisiscono uno **sprint a tempo**: un timer breve
(predefinito 1 minuto, configurabile 30 secondi–2 minuti) con un contatore di **risposte
corrette**.

**Interazione.** Lo studente lavora il più velocemente possibile finché scorre il tempo. Al
termine, il sistema calcola le **risposte corrette al minuto**.

**Feedback.** "Hai fatto 14 corrette al minuto — il tuo obiettivo è 20." Una barra mostra la
distanza dall'obiettivo (fluency aim).

> L'attività *Riempi le descrizioni* resta **non cronometrata** (richiede riflessione e
> valutazione AI): contribuisce all'**accuratezza**, non alla fluenza.

### 7.2 Completa la definizione (Cloze) — nuova attività

**Obiettivo pedagogico.** Allenare il recupero di termini-chiave dentro un contesto
(modalità intermedia tra riconoscere e spiegare), ideale per la **fluenza**.

**Cosa vede lo studente.** La descrizione di un nodo con **alcuni termini-chiave mancanti**
(spazi vuoti).

**Interazione.** Lo studente completa gli spazi, a tempo. Auto-correzione immediata sul
termine atteso (con tolleranza per piccole differenze ortografiche, importante per i DSA).

**Feedback.** Conteggio corrette/min e termini sbagliati evidenziati.

### 7.3 Vista "Percorso di studio"

**Obiettivo pedagogico.** Dare allo studente un **ordine sensato** in cui affrontare i
concetti, rispettando i prerequisiti.

**Cosa vede lo studente.**
- Una **linea del percorso** (o il grafo stesso) in cui ogni concetto mostra il suo **stato**:
  🔒 bloccato (prerequisiti non pronti) · ▶️ pronto da studiare · 🔄 in acquisizione ·
  ⚡ fluente/padroneggiato.
- I concetti **"pronti"** sono evidenziati: "Inizia da qui".

**Interazione.** Lo studente clicca un concetto pronto e avvia l'attività di studio
consigliata. Man mano che padroneggia i concetti, se ne sbloccano di nuovi.

**Feedback.** Una barra di avanzamento del percorso ("8 concetti su 20 padroneggiati").
In modalità *soft*, nulla è realmente bloccato: i lucchetti sono **consigli**, non divieti.

### 7.4 Il grafico dei progressi (celeration)

**Obiettivo pedagogico.** Rendere **visibile** la crescita nel tempo — uno dei principi
motivazionali più forti del Precision Teaching.

Due viste selezionabili:

- **Grafico semplice** (predefinito, per lo studente): una linea chiara che mostra la
  fluenza (risposte/min) o la percentuale di padronanza **giorno per giorno**, con scala
  lineare leggibile anche da uno studente di scuola media.
- **Standard Celeration Chart** (per docente/pedagogista): il grafico standard del Precision
  Teaching, a **scala moltiplicativa** (semi-logaritmica), con la *celeration line* e la
  *aim star*. Fedele al metodo, pensato per chi lo conosce.

**Cosa vede lo studente.** "Questa settimana sei passato da 8 a 18 risposte corrette al minuto
su *Fotosintesi*." Ogni punto è un giorno di pratica.

### 7.5 Cruscotto del docente / OPI (via export)

**Obiettivo pedagogico.** Permettere a docenti e OPI (Operatori per l'Inclusione) di seguire i
progressi **senza account cloud** né dati dei minori in rete.

**Interazione.** Lo studente (o il dispositivo) **esporta** un file di riepilogo (o un QR)
con i progressi; il docente lo apre per vedere lo stato di padronanza per concetto, le curve di
fluenza e i punti deboli. Nessun dato lascia il dispositivo senza un gesto esplicito.

---

<a name="8-privacy"></a>
## 8. Privacy, dati e tutela dei minori

- **Tutto in locale per impostazione predefinita.** Progressi, padronanza e fluenza vivono nel
  Vault sul dispositivo dello studente. Nessun dato di un minore viene inviato in rete senza
  un'azione esplicita.
- **Condivisione solo su gesto volontario** (export di un file / QR verso il docente).
- **Formato aperto e ispezionabile** (Markdown, JSON): genitori, docenti e scuola possono
  verificare cosa è salvato.
- **Provider AI conforme disponibile**: per l'elaborazione testuale, Infomaniak offre modelli
  ospitati in **Svizzera**, conformi al GDPR — opzione adatta ai dati educativi.
- **Multi-profilo con separazione locale dei dati**: ogni studente vede solo i propri.

---

<a name="9-roadmap"></a>
## 9. Roadmap a fasi

Ogni fase è **reversibile** (branch dedicato, commit piccoli) e **documentata**.

### Fase 0 — Fondamenta *(nessuna AI, basso rischio)*
- Inizializzazione del controllo di versione e del branch di lavoro.
- Estensione del vocabolario di relazione da 8 a 10 famiglie (Identity, Brother).
- Schema dati per profili multipli e per la padronanza/fluenza per pinpoint.

### Fase 1 — MVP: percorsi di prerequisiti *(punto di partenza)*
- Inferenza AI delle relazioni Precursor.
- Vista "Percorso di studio" con stati e gating configurabile (soft/hard).
- Padronanza per concetto derivata dai dati di sessione già esistenti.

### Fase 2 — Motore della fluenza
- Cronometraggio delle attività contabili → risposte corrette/min.
- Padronanza a due fasi (acquisizione → fluenza).
- Nuova attività **Cloze**.

### Fase 3 — Grafico dei progressi
- Grafico semplice per lo studente + Standard Celeration Chart per il docente.

### Fase 4 — Evoluzioni future
- Modulo neurale specializzato (BERT-BiGRU-MHSA-CRF) per il riconoscimento delle entità.
- Supporto multi-provider completo (Google + Infomaniak).
- Cruscotto docente avanzato.

---

<a name="10-glossario"></a>
## 10. Glossario per pedagogisti

- **Mastery Learning** — apprendimento per padronanza: si avanza solo dopo aver appreso il
  prerequisito.
- **Precision Teaching** — metodologia che misura l'apprendimento come *frequenza di risposte
  corrette nel tempo* (fluenza), con misurazioni quotidiane.
- **Fluenza (fluency)** — rapidità e automatismo di una risposta corretta, oltre alla semplice
  esattezza.
- **Pinpoint** — definizione precisa dell'abilità misurata (in MappAI: un concetto × un tipo di
  attività).
- **Fluency aim** — obiettivo di frequenza (risposte corrette/min) da raggiungere.
- **Celeration** — il *ritmo di miglioramento* della fluenza nel tempo.
- **Precursor / Prerequisito** — concetto che va appreso prima di un altro.
- **Knowledge Graph** — rete di concetti collegati da relazioni tipizzate.
- **Active recall** — richiamo attivo: recuperare dalla memoria invece di rileggere.
- **BES / DSA** — Bisogni Educativi Speciali / Disturbi Specifici dell'Apprendimento.
- **OPI** — Operatore per l'Inclusione: media tra docente e studente.
- **Vault** — l'archivio locale, aperto e ispezionabile, dei progetti e dei progressi.

---

<a name="11-appendice-tecnica"></a>
## 11. Appendice tecnica

### 11.1 File chiave
- `public/js/mappai-active-study.js` — le 7 attività di studio attivo (launcher, snapshot
  reversibile, verifica, salvataggio punteggio).
- `public/js/app.js` — generazione mappe, rendering D3, player quiz/flashcard, definizione
  delle famiglie di relazione (`EDGE_FAMILIES`).
- `main.js` — IPC Electron, scrittura del Vault (incluso `saveStudyRecord`).

### 11.2 Modello dati dello studio attivo (esistente)
- **Snapshot** alla `enter()`: link, livello, gruppo (colore), etichetta, descrizione,
  posizioni → ripristino integrale alla `exit()`.
- **Persistenza punteggio** (`saveStudyScore` → `electronAPI.saveStudyRecord`):
  `Studio Attivo/storico_score.md` (riga leggibile) + `Studio Attivo/sessioni.jsonl`
  (record con `mode`, `accuracy`, `entries`).

### 11.3 Strutture dati nuove (pianificate)
- `ptRelation` — strato logico CourseKG sugli archi (per i percorsi), affiancato al verbo
  ricco esistente.
- `profiles/` nel Vault — un profilo per studente, con stato di padronanza per pinpoint.
- `mastery[pinpoint]` — `{ fase: 'acquisizione'|'fluenza'|'padroneggiato', accuracy, rate,
  storico: [{data, rate, accuracy}] }`.
- `fluencyAim[tipoAttività]` — obiettivo configurabile (default per fascia scolastica).

### 11.4 Principi di sviluppo
- Ogni modifica reversibile (snapshot, branch, commit piccoli).
- Nessun dato di minori in rete senza azione esplicita.
- Google Gemini ora, codice astratto per Infomaniak in seguito.
- Accessibilità BES/DSA come requisito di prima classe, non come aggiunta.

---

*Fine del documento. Questo file è la base per la presentazione a insegnanti e pedagogisti:
le sezioni 1, 2, 4, 7 e 10 sono pensate per un pubblico didattico; le sezioni 3, 5, 6 e 11 per
un pubblico tecnico.*
