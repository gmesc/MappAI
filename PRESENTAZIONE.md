# MappAI — Documento di Presentazione

*Applicazione desktop per la costruzione di mappe mentali e knowledge graph a partire da fonti reali, con un'attenzione particolare all'inclusione scolastica.*
Sito di riferimento: [insegnai.ch/mappai](https://www.insegnai.ch/mappai.html)

---

## Che problema risolve

Studiare significa, prima di tutto, **trasformare un testo lineare in una struttura di significato**: capire quali sono i concetti centrali, come si collegano fra loro, cosa dipende da cosa. Per molti studenti questo passaggio è invisibile e automatico; per altri — in particolare per chi ha un disturbo specifico dell'apprendimento (DSA) o un bisogno educativo speciale (BES) — è proprio lì che lo studio si inceppa. Un capitolo di trenta pagine resta un muro indifferenziato di frasi, e l'energia cognitiva si consuma nel decodificare invece che nel comprendere.

MappAI affronta esattamente questo collo di bottiglia. Prende una fonte — un PDF, una pagina web, la trascrizione di un video di YouTube, un documento Word o del testo incollato a mano — e ne ricava una rappresentazione **visiva e gerarchica** dei concetti: una mappa mentale o un *knowledge graph* (letteralmente "grafo della conoscenza", una rete in cui i nodi sono i concetti e gli archi sono le relazioni che li legano). Lo studente non si trova più davanti a un blocco di testo, ma a una struttura navigabile in cui la gerarchia delle idee è esplicita e i collegamenti sono visibili.

Il problema, però, non è solo dello studente. C'è una seconda difficoltà, più organizzativa: **produrre buoni materiali di studio semplificati richiede tempo ed esperienza**. Un docente o un operatore che voglia preparare una mappa, un glossario, una timeline o un quiz per un allievo con DSA deve normalmente farlo a mano, ogni volta da capo. MappAI riduce questo lavoro da ore a minuti, restituendo materiali già strutturati che restano comunque modificabili: l'intelligenza artificiale propone una bozza, l'adulto la corregge e la adatta. L'AI non sostituisce il lavoro pedagogico, lo accelera.

Infine c'è una terza dimensione, spesso trascurata: la **protezione dei dati**. Quando si elaborano materiali scolastici si trattano informazioni che riguardano minori. MappAI permette di scegliere un provider AI con server in Svizzera e conforme al GDPR (il regolamento europeo sulla protezione dei dati personali), così da non spedire contenuti didattici e informazioni sensibili verso infrastrutture su cui non si ha controllo.

Un esempio concreto chiarisce il valore d'uso. Un docente di storia carica le venti pagine del manuale sulla Rivoluzione francese; in pochi minuti MappAI restituisce una mappa con le cause, gli eventi cardine, i protagonisti e le conseguenze, ciascun nodo collegato al passo del testo da cui proviene. Da quella stessa base l'insegnante ricava una timeline degli eventi, un glossario dei termini chiave e un set di flashcard per il ripasso — materiali che, prodotti a mano, avrebbero richiesto un intero pomeriggio. Lo studente con DSA riceve così non un testo da decifrare, ma una struttura su cui orientarsi.

---

## A chi si rivolge

MappAI è pensata per **gli adulti che mediano l'apprendimento**, più che per lo studente lasciato solo davanti allo schermo. I destinatari principali sono quattro.

**Gli insegnanti di materia.** Per loro lo strumento è un acceleratore: trasformano la dispensa o il capitolo del manuale in una mappa che può essere proiettata in classe, distribuita come supporto allo studio o usata come scaletta della lezione. La possibilità di esportare materiali stampabili rende immediato il passaggio dal digitale alla didattica quotidiana.

**Gli OPI — Operatori per l'Inclusione.** È una figura professionale (particolarmente rilevante nel contesto svizzero) che fa da ponte fra il docente e lo studente con bisogni speciali. L'OPI deve **padroneggiare i contenuti disciplinari** per poterli rimediare, cioè riformularli in una forma accessibile. MappAI gli offre una base strutturata su cui lavorare: può partire dalla mappa generata dall'AI e raffinarla in funzione del singolo allievo, anziché ricostruire ogni volta l'impalcatura concettuale da zero.

**I tutor BES/DSA.** Chi affianca individualmente studenti con dislessia, ADHD o ipovisione trova in MappAI uno strumento calibrato sulle loro esigenze: organizzazione visiva delle informazioni, riduzione del carico testuale, materiali che possono essere stampati e annotati. La logica progettuale è quella dell'accessibilità, non un'aggiunta successiva.

**I genitori.** Anche una famiglia che voglia sostenere un figlio nello studio può usare MappAI per costruire insieme a lui mappe e schede, rendendo il pomeriggio di compiti meno frustrante e più collaborativo.

Il filo comune è che MappAI non vuole "fare i compiti al posto di", ma offrire all'adulto-mediatore un'**impalcatura** (in pedagogia si parla di *scaffolding*: il sostegno temporaneo che accompagna l'apprendente fino a quando non è in grado di procedere da solo) su cui costruire un percorso personalizzato.

---

## Caratteristiche e funzioni

Il cuore dell'applicazione è la **generazione assistita di mappe** a partire da fonti eterogenee. L'utente carica il materiale — PDF, URL, video YouTube, DOCX o testo libero — e sceglie una delle due modalità di rappresentazione.

- **MindMap (mappa mentale):** una struttura gerarchica ad albero, costruita con un approccio *multi-pass* (a passaggi successivi): prima l'AI individua le macro-aree, poi espande progressivamente i rami fino al livello di dettaglio desiderato. È la modalità ideale per studiare un capitolo o un argomento dotato di una struttura ordinata.
- **Knowledge Graph (grafo della conoscenza):** una rete relazionale in cui i concetti sono collegati da relazioni *tipizzate* — non un generico "è correlato a", ma legami che esprimono un ragionamento (causa, conseguenza, dipendenza, opposizione). È la modalità più adatta a materie in cui contano i collegamenti trasversali, come la storia o le scienze.

Il grafo è **interattivo**: realizzato con D3.js (una libreria JavaScript per la visualizzazione di dati), permette di spostare i nodi, esplorare i rami e leggere la fonte da cui ogni concetto è stato estratto. Questa **tracciabilità** è un punto importante: ogni nodo conserva il riferimento al testo originale, così l'adulto può verificare che l'AI non abbia "inventato" (in gergo, *allucinato*) un'informazione.

Attorno a questo nucleo sono stati costruiti diversi strumenti didattici:

- **Extraction Lenses** ("lenti di estrazione"): filtri semantici che guidano l'AI a privilegiare certi aspetti del testo — per esempio le date, le definizioni, le relazioni di causa-effetto. Esistono anche preset disciplinari pronti all'uso (Storia, Scienze, ecc.).
- **Timeline cronologica:** estrae automaticamente gli eventi datati da una fonte e li dispone su una linea del tempo stampabile.
- **Glossario:** raccoglie i termini disciplinari con le relative definizioni.
- **Quiz e flashcard:** genera set di domande e schede di ripasso a partire dalla mappa, utili per l'autoverifica.
- **Rendering delle formule matematiche** tramite KaTeX (un motore che trasforma la notazione matematica in formule leggibili), per gestire correttamente le materie scientifiche.
- **Analisi strutturale del grafo:** un modulo *deterministico* (cioè che non usa l'AI, ma calcoli matematici sulla struttura) che individua, per esempio, nodi sovraccarichi, rami poco sviluppati o concetti isolati — una diagnostica della qualità della mappa.

Sul fronte **esportazione**, MappAI è pensata per uscire dallo schermo. I materiali producibili includono:

- **PDF** della mappa e dei materiali, tramite la libreria jsPDF;
- **documenti stampabili in HTML** per quiz (con foglio di verifica separato), flashcard (impaginate su due colonne, già pronte da ritagliare), timeline e glossario;
- un **Vault** in formato Markdown con frontmatter YAML, salvato localmente e **compatibile con Obsidian** (un popolare software di note collegate). Concretamente significa che le mappe non restano prigioniere dell'app: diventano file aperti, leggibili, archiviabili e riutilizzabili con altri strumenti.

---

## Genesi

MappAI nasce da un'esperienza personale e professionale. L'autore, Giacomo Meschini, è un ex insegnante: il progetto è il punto d'incontro fra la sua conoscenza diretta della scuola — e in particolare delle difficoltà degli studenti con bisogni speciali — e un percorso di sviluppo software condotto in prima persona.

Lo strumento è stato costruito con un metodo di lavoro che oggi viene chiamato *vibecoding*: lo sviluppo avviene in dialogo con ambienti di programmazione assistiti dall'intelligenza artificiale (IDE agentici come Claude Code), in cui il programmatore guida, valida e corregge il lavoro generato dall'AI. È un approccio che ha permesso di accumulare diverse centinaia di ore di sviluppo mantenendo il controllo sull'architettura e sulla qualità.

Il progetto non è un esperimento isolato: ha già raccolto l'adesione di professionisti dell'educazione svizzeri, segno che risponde a un'esigenza concreta del settore. Lo sviluppo procede in modo **incrementale e reversibile** — ogni modifica è documentata e annullabile — coerentemente con una filosofia di cautela e cura tipica di chi costruisce strumenti destinati a un contesto delicato come quello scolastico.

---

## Architettura

MappAI è un'**applicazione desktop Electron**. Electron è un framework che consente di costruire programmi per computer usando le tecnologie del web (HTML, CSS, JavaScript): l'app gira quindi nativamente su macOS (sia Apple Silicon sia Intel), Windows e Linux, ed esiste una versione sperimentale per iPadOS realizzata con Capacitor.

L'architettura segue la separazione tipica di Electron in due processi:

- il **main process** (`main.js`), basato su Node.js, gestisce le operazioni di sistema — accesso ai file, salvataggio nel Vault, chiamate di rete verso i servizi AI;
- il **renderer process**, ovvero l'interfaccia utente, scritta in **JavaScript "vanilla"** — cioè puro, senza framework come React o Vue e senza strumenti di compilazione (*bundler*). È una scelta deliberata di semplicità: il codice è caricato direttamente come script globali nel browser interno.

I due processi comunicano in modo controllato attraverso un *contextBridge* (`preload.js`), un canale che espone in modo sicuro solo le funzioni necessarie, senza dare al codice dell'interfaccia accesso diretto al sistema operativo.

Per la visualizzazione si usa **D3.js** (grafo interattivo), **Tailwind CSS** per lo stile, **PDF.js** per leggere i PDF, **jsPDF** per esportarli, **KaTeX** per le formule e **Axios** per le chiamate HTTP. Lo stato dell'applicazione è centralizzato in un oggetto globale (`appState`), in cui nodi e collegamenti della mappa vivono in una struttura `db` dedicata.

Una particolare attenzione è stata dedicata alla **robustezza** nel dialogo con i modelli linguistici. I modelli AI restituiscono i loro risultati in formato JSON (un linguaggio strutturato per lo scambio di dati), ma le risposte possono arrivare troncate o leggermente malformate, soprattutto con i modelli open source. Per questo MappAI non si fida mai ciecamente dell'output: una funzione di "recupero" ripulisce e ripara le risposte imperfette prima di costruire la mappa, evitando che un piccolo difetto di formattazione mandi all'aria un'intera elaborazione. È un dettaglio invisibile all'utente, ma decisivo per l'affidabilità quotidiana dello strumento.

Sul piano dell'AI, MappAI è **multi-provider**. L'utente può scegliere tra **Google Gemini** — modelli con finestre di contesto molto ampie (fino a milioni di *token*, le unità minime di testo che il modello elabora) — e **Infomaniak**, fornitore svizzero che dà accesso a modelli open source ospitati in Svizzera e conformi al GDPR, inclusi modelli sviluppati da ETH ed EPFL. Un *bridge* software traduce automaticamente le richieste dal formato di Google a quello compatibile con Infomaniak, così che l'utente possa cambiare provider senza che cambi il funzionamento dell'app. È in questa flessibilità — qualità dei modelli da un lato, sovranità dei dati dall'altro — che si riflette l'identità del progetto: uno strumento potente, ma costruito attorno al rispetto di chi lo usa.
