# Sentence Transformers locale per MappAI — piano di implementazione

Data: 15 settembre 2026. Stato: progetto operativo da implementare nella prossima chat; nessun runtime o modello installato durante la stesura.

Destinatario: agente incaricato di realizzare la funzionalità nel repository `/Users/giacomomeschini/Claude/MappAI re`.

Hardware dichiarato dal docente: MacBook Air M5, 32 GB di memoria. Primo ambiente di consegna: questo Mac, applicazione Electron. Tempi e compatibilità effettiva devono essere misurati, non dedotti dalla scheda hardware.

## 1. Risultato da ottenere

MappAI deve recuperare localmente i passaggi pertinenti del PDF e mostrare al docente le fonti associate a un nodo, una relazione o un materiale. Deve anche trovare altre occorrenze di un concetto nei materiali, comprese formulazioni diverse.

Il primo risultato utilizzabile comprende:

- preparazione dell'indice quando viene importato il PDF, dopo il controllo dell'estrazione;
- persistenza e riuso dell'indice alla riapertura del progetto;
- indicizzazione incrementale di mappa e materiali generati;
- ricerca testuale e semantica, seguita da un reranker;
- azioni nel modale «Mostra i passaggi pertinenti» e «Trova altre occorrenze»;
- citazioni apribili, versioni riconoscibili e funzionamento degradato comprensibile;
- valutazione reale in italiano e istruzioni riproducibili per installazione e uso sul Mac.

L'indice recupera possibili prove. Non certifica la correttezza scientifica, non sostituisce il giudice attuale e non applica correzioni. Una fonte originale può contenere errori; una fonte generata non può provare se stessa. Il controllo indipendente con fonti disciplinari e il lavoro UDL rimangono funzioni distinte.

La traccia UDL da conservare per dopo è [TRACCIA-UDL-revisione-barriere-2026-09-15.md](</Users/giacomomeschini/Claude/MappAI re/docs/TRACCIA-UDL-revisione-barriere-2026-09-15.md>).

## 2. Vincoli del docente da mantenere

- Correggere le logiche dell'applicazione, senza riscrivere i materiali originali dei progetti usati come casi di prova.
- Conservare decisioni, correzioni manuali, bozze e possibilità di riprendere la revisione.
- Conservare preset, quantità e differenza didattica fra MC e aperte.
- Conservare l'impaginazione dei PDF, compreso l'inizio delle soluzioni su una nuova pagina.
- Non inviare automaticamente il testo a un provider cloud quando il motore locale non funziona.
- Non avviare rigenerazioni globali per indicizzare, cercare o aggiornare una singola correzione.
- Distinguere un problema scientifico da un problema di recupero delle fonti o di estrazione.
- La chat di implementazione deve esaminare lo stato Git e preservare le numerose modifiche già presenti. Non ripristinare file né assumere che la copia di lavoro coincida con HEAD.

## 3. Basi esistenti da riutilizzare

Questi riferimenti sono stati verificati nella copia di lavoro del 15 settembre; rileggere le funzioni prima di modificarle. I nomi dei nuovi moduli, più avanti, sono proposte e non file già esistenti.

| File esistente | Punto di integrazione |
|---|---|
| [app.js](</Users/giacomomeschini/Claude/MappAI re/public/js/app.js:560>) | `extractPdfPages`: testo per pagina e titoli. La concatenazione dei frammenti con spazi richiede attenzione prima dell'indicizzazione. |
| [mappai-anchor-core.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-anchor-core.js>) | Recupero lessicale locale e ancoraggi alle pagine: baseline da misurare. |
| [mappai-grounding-core.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-grounding-core.js>) | Fonti, citazioni, controllo degli estratti e distinzione delle rettifiche del docente. |
| [mappai-review-core.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-review-core.js>) | Snapshot delle fonti e registro persistente delle decisioni. |
| [mappai-review-context.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-review-context.js>) | Ricerca delle occorrenze e rappresentazione dei contenuti modificati. |
| [mappai-review.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-review.js>) | Controller del modale e contesto della revisione corrente. |
| [mappai-material-review.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-material-review.js:338>) | Giudice LLM, controllo editoriale e controllo delle affermazioni. Il recupero non modifica automaticamente i suoi esiti. |
| [mappai-material-pipeline.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-material-pipeline.js>) | Bozze, fonti, generazione, revisione e finalizzazione dei materiali. |
| [mappai-generation-support.js](</Users/giacomomeschini/Claude/MappAI re/public/js/mappai-generation-support.js:695>) | Embedding cloud già usati per similarità/deduplicazione dei nodi. Non sono l'indice PDF locale. |
| [main.js](</Users/giacomomeschini/Claude/MappAI re/main.js>) e [preload.js](</Users/giacomomeschini/Claude/MappAI re/public/js/preload.js>) | Processo Electron principale, IPC e `window.electronAPI`. Il renderer ha isolamento del contesto e non ha accesso diretto a Node. |
| [package.json](</Users/giacomomeschini/Claude/MappAI re/package.json>) | Avvio, test ed electron-builder. Le nuove risorse devono essere incluse esplicitamente nella build. |

Leggere anche [regole dei moduli](</Users/giacomomeschini/Claude/MappAI re/docs/rules/06-modules-and-extraction.md>), [regole dei modali](</Users/giacomomeschini/Claude/MappAI re/docs/rules/08-ui-modals-and-icons.md>) e le regole UI pertinenti. Riutilizzare componenti, traduzioni e rendering delle formule esistenti.

## 4. Scelte tecniche iniziali

### Runtime

Usare Python con Sentence Transformers, PyTorch e NumPy. Eseguire in un processo figlio persistente gestito da Electron: il caricamento dei modelli non deve ripetersi a ogni ricerca. Preferire MPS quando disponibile e verificato; fornire CPU come alternativa esplicita. MPS è il percorso PyTorch per GPU Apple; verificare dispositivo e operazioni supportate nella versione installata. [Documentazione PyTorch](https://docs.pytorch.org/docs/main/notes/mps.html)

Per il primo banco usare precisione standard come riferimento. Ottimizzare precisione e batch soltanto dopo aver confrontato qualità, memoria e tempi. Non applicare automaticamente suggerimenti CUDA/FlashAttention al Mac. Sentence Transformers documenta i backend PyTorch, ONNX e OpenVINO e il dispositivo `mps`; non assumere che benchmark su altre GPU valgano su M5. [Backend e prestazioni](https://www.sbert.net/docs/sentence_transformer/usage/efficiency.html)

### Modelli candidati

| Ruolo | Candidato iniziale | Confronto e vincoli |
|---|---|---|
| Embedding | `BAAI/bge-m3` | Multilingue, 1024 dimensioni, fino a 8192 token. Usare inizialmente il percorso dense di Sentence Transformers; le altre modalità del modello non si attivano implicitamente. |
| Reranking | `BAAI/bge-reranker-v2-m3` | Multilingue, valuta coppie query/passaggio. Il punteggio misura pertinenza. |
| Alternativa da misurare | `intfloat/multilingual-e5-base` | 768 dimensioni, limite 512 token. Richiede i prefissi query/passage per il recupero, anche in italiano; per confronti simmetrici seguire la model card. |

Riferimenti: [BGE-M3](https://huggingface.co/BAAI/bge-m3), [reranker](https://huggingface.co/BAAI/bge-reranker-v2-m3), [E5](https://huggingface.co/intfloat/multilingual-e5-base).

Sono candidati, non una classifica già dimostrata per MappAI. Scegliere il default dopo il banco italiano. Registrare versioni delle librerie, revisione esatta dei modelli, tokenizer e configurazione; non inventare oggi un numero di versione non collaudato. I vettori confrontati devono appartenere allo stesso spazio e alla stessa configurazione. Il reranker può essere un modello diverso.

### Archiviazione e ricerca

Per i dossier iniziali usare SQLite per record/metadati e vettori float32 in BLOB, caricati in NumPy per la ricerca esatta. Evitare un server vettoriale e un indice approssimato finché dimensioni e tempi non lo richiedono.

Per la ricerca testuale provare SQLite FTS5/BM25, verificandone la disponibilità nel runtime. Preservare il recupero lessicale esistente come baseline e percorso di ripiego. I simboli e le unità devono avere casi di prova: il tokenizer testuale non garantisce da solo il recupero di Ω o formule. Eventuali alias di ricerca restano separati dal testo originale.

## 5. Architettura proposta

```text
PDF / snapshot delle fonti / bozze correnti
  → estrazione con pagina e provenienza
  → frammenti e record versionati
  → IPC ristretto nel processo principale Electron
  → processo Python locale
       SQLite + ricerca testuale + embedding + reranker
  → risultati con passaggi reali e metadati
  → modale: consulta fonte / mostra occorrenze
```

Usare messaggi JSON su stdin/stdout, uno per riga, senza server HTTP. Stdout contiene solo il protocollo; log su stderr. Avviare con argomenti separati e senza shell. Il renderer non deve poter scegliere un eseguibile, un comando o un percorso arbitrario.

Il processo principale risolve il progetto e i percorsi autorizzati. Richieste con identificativo, versione del progetto, timeout e limiti di dimensione. Validare metodo, tipi e numero di record. Gestire processo terminato, messaggio malformato e risposta tardiva senza applicarla a un'altra revisione.

Una coda seriale iniziale evita contese di memoria. Indicizzare a piccoli batch permette progresso e annullamento fra batch. Alla chiusura dell'app terminare il processo figlio. Un eventuale riavvio automatico deve essere limitato; un guasto persistente produce una diagnosi, non un ciclo infinito.

Possibili file nuovi, da ridurre o accorpare secondo il codice reale: `local-ai/worker.py`, `local-ai/requirements.txt`, un modulo Node per il ciclo di vita del worker e un core JS per gli adattatori dei contenuti. Non introdurre un framework generico di plugin AI.

## 6. Fonti, frammenti e provenienza

Conservare PDF originale, testo grezzo per pagina e testo preparato per la ricerca. La preparazione non deve cambiare silenziosamente negazioni, segni, numeri o parole tecniche. Se normalizza spazi o sillabazione, conservare il collegamento al passaggio grezzo; validare le citazioni contro lo snapshot originale tramite il grounding esistente.

Suddivisione iniziale da tarare: passaggi di circa 200–400 token, delimitati da paragrafi e sezioni, con contesto vicino. Non dividere definizione e condizione necessaria, formula e significato dei simboli, oppure intestazioni e righe della stessa tabella senza conservare il collegamento. Misurare con il tokenizer effettivo, non con un conteggio di caratteri.

Per il reranker considerare il limite dell'intera coppia query/passaggio: nessuna troncatura silenziosa che elimini proprio la condizione da verificare. Se occorre dividere, mantenere provenienza e segnalarlo nel banco.

Se manca il testo o l'ordine è inaffidabile, mostrare le pagine coinvolte. La prima versione deve rilevare il limite e permettere di aprire l'originale; un motore OCR generale e il recupero multimodale completo sono sviluppi successivi. Non dichiarare indicizzato un PDF scansione vuoto.

Record minimo, con nomi indicativi:

```json
{
  "recordId": "identificativo-stabile",
  "projectId": "progetto",
  "origin": "original",
  "sourceId": "fonte-nel-registro-esistente",
  "sourceRevision": "hash-snapshot",
  "page": 3,
  "section": "titolo",
  "rawLocator": { "start": 120, "end": 490 },
  "text": "passaggio preparato per la ricerca",
  "textHash": "hash-contenuto",
  "previousId": null,
  "nextId": null
}
```

`origin` distingue `original`, `reference`, `generated`, `teacher`. Un testo modificato conserva anche l'identità del materiale e il collegamento alla decisione: l'indice non sostituisce il registro delle correzioni. Per fonti esterne importate conservare URL della pagina, titolo, data di acquisizione e testo realmente letto. L'elenco di siti consentiti non è, da solo, una raccolta indicizzata; non includere un crawler nel primo rilascio.

Per contenuti generati aggiungere `itemId`/`nodeId`/`relationId`, ramo, campo, ruolo (domanda, opzione, risposta, criterio), versione della bozza e stato corrente. Indicizzare la relazione completa con i suoi estremi. Indicizzare i campi del JSON, non una serializzazione indistinta di parentesi e chiavi.

Il manifest dell'indice contiene versione dello schema, estrattore, segmentazione, normalizzazione, modello/revisione/tokenizer, dimensioni, prefissi e normalizzazione dei vettori. È una risorsa derivata ricostruibile.

## 7. Ciclo di vita e persistenza

1. All'importazione estrarre e validare il testo; avviare l'indicizzazione in background. Per una nuova generazione l'indice viene preparato dall'inizio, ma un suo guasto non blocca le funzioni già disponibili.
2. Alla comparsa di mappa e bozze aggiungere o aggiornare i loro record. Non aspettare l'esportazione dei PDF.
3. Alla correzione manuale aggiornare solo i record cambiati e invalidare i risultati dipendenti. Esclusioni ed eliminazioni devono scomparire dalla ricerca corrente.
4. Alla riapertura confrontare manifest, snapshot e revisioni. Riutilizzare il lavoro compatibile.
5. Al cambio di modello o configurazione costruire un nuovo indice senza mescolare vettori incompatibili. Pubblicarlo atomicamente soltanto quando coerente.
6. Un annullamento o crash non deve distruggere l'ultimo indice valido. SQLite transazionale e manifest coerente devono rendere la ripresa verificabile.

Conservare runtime, modelli e cache sotto percorsi dell'app nell'area utente; evitare cartelle dei materiali consegnati agli studenti. Risolvere i percorsi da Electron, senza codificare il nome dell'utente. Il riuso fra progetti può riutilizzare vettori per hash, ma non deve mescolare permessi, provenienze o risultati. Per la prima versione è sufficiente una cache per progetto con verifica dello snapshot in caso di copia o spostamento del vault.

## 8. Ricerca e contratto con la revisione

La ricerca a due stadi recupera candidati e poi ne rivaluta la pertinenza. È un meccanismo di selezione delle prove, non di accertamento della verità. [Retrieve & Re-Rank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)

Configurazione iniziale da misurare, non soglie di qualità universali:

- recuperare fino a 20 candidati testuali e 20 semantici;
- fondere per rango, per esempio con Reciprocal Rank Fusion, senza sommare punteggi di scale diverse;
- unire duplicati per ID e rivalutare al massimo 30 candidati;
- mostrare inizialmente 5 passaggi, con possibilità di espandere il contesto;
- includere passaggi vicini quando necessari e registrare i limiti applicati;
- per documenti molto piccoli confrontare anche il reranking diretto di tutti i passaggi.

Due modalità obbligatorie:

- **Prove:** cerca negli originali e nelle fonti di confronto, con filtri di provenienza. Non usa i materiali generati come fonti indipendenti.
- **Occorrenze:** cerca nei materiali correnti e nella mappa, mostrando formato, ramo, ruolo e decisione. È una lista di possibili equivalenze da esaminare, non una sostituzione collettiva automatica.

Distinguere nel risultato stato della ricerca, lista dei passaggi e diagnostica. Stati indicativi: `ready`, `partial`, `unavailable`, `cancelled`, `stale`; una ricerca conclusa senza risultati ha una lista vuota, non un verdetto «falso». Restituire snapshot/versione, testo realmente recuperato e punteggi tecnici; non convertire punteggi in percentuali di correttezza.

I risultati sono dati non fidati: renderizzare testo in modo sicuro; non eseguire HTML o istruzioni contenute nelle fonti. Le future richieste al LLM devono mantenere questa separazione.

La prima integrazione presenta le prove al docente. Ridurre il contesto del giudice LLM è un cambiamento separato, da introdurre solo dopo valutazione: una ricerca mirata può perdere prove importanti, soprattutto per affermazioni di assenza o copertura globale. Conservare il percorso attuale con pagine intere. Un controllo globale deve enumerare tutte le affermazioni previste, non soltanto quelle che hanno ricevuto risultati.

## 9. Esperienza nel modale

Il docente seleziona un nodo, una relazione o una domanda e apre «Mostra i passaggi pertinenti». Ogni scheda mostra fonte, pagina/sezione, estratto, provenienza e comando per aprire il contesto. Nei progetti legacy senza PDF disponibile mostrare il testo archiviato e dichiarare che l'originale non è apribile.

«Trova altre occorrenze» mostra i materiali correnti e porta al loro editor. Una somiglianza non applica correzioni. Le azioni esistenti Accetta/Mantieni/Modifica e il registro decisioni rimangono il punto di applicazione delle proposte.

Stati leggibili: preparazione dell'indice, pronto, aggiornamento, alcune pagine non leggibili, ricerca semantica non disponibile. Se rimane la ricerca testuale, dichiararlo. Nessun nuovo contatore «parti scientificamente verificate» ricavato dall'indice. Progresso annunciato senza rubare il focus; pulsanti utilizzabili da tastiera; traduzioni IT/EN e formule renderizzate con il percorso esistente.

## 10. Installazione, riservatezza e distribuzione

Per sviluppo creare un ambiente virtuale dedicato e uno script di setup ripetibile. Non modificare Python di sistema e non dipendere da runtime interni di Codex. Al primo avvio operativo l'app deve conoscere un interprete compatibile; nella build installata deve usare un runtime gestito dall'app o un'installazione locale esplicitamente configurata. Non assumere che il docente abbia Python nel PATH.

I download iniziali riguardano librerie e pesi, con avanzamento e dimensioni reali visibili. Terminato il setup, verificare recupero e reranking con rete disabilitata e modelli caricati dalla cache. La mancanza di pesi produce uno stato chiaro, non un download ripetuto a ogni ricerca.

Il lavoro locale non invia PDF a un servizio di embedding. L'eventuale uso successivo degli estratti nel giudice cloud resta una trasmissione al provider e va mantenuto riconoscibile. Non aggiungere telemetria dei testi.

Per consegna sul Mac verificare sia avvio da repository sia build Electron arm64, percorsi con spazi, risorse Python fuori dall'archivio ASAR ove necessario, disponibilità dei modelli e chiusura del worker. Prevedere notices delle dipendenze e dei modelli. Firma/notarizzazione e distribuzione pubblica multipiattaforma sono un rilascio successivo; sulle piattaforme non supportate la funzione deve degradare senza rompere MappAI.

## 11. Sequenza di lavoro nella nuova chat

| Fase | Lavoro | Uscita richiesta |
|---|---|---|
| S0 | Leggere regole, stato Git e flusso fonti/bozze; definire casi reali e baseline | Mappa breve dei punti da modificare, campione di valutazione e test iniziali |
| S1 | Worker Python, modelli candidati, MPS/CPU e prova da comando | Recupero reale su un dossier; versioni e prestazioni registrate |
| S2 | Record, cache persistente, ricerca ibrida e reranking | Riapertura, aggiornamento e annullamento verificati |
| S3 | IPC e ciclo di vita Electron | App reattiva, nessun processo orfano, assenza di cloud fallback |
| S4 | Collegamento a importazione, mappa e bozze; prove e occorrenze nel modale | Flusso utilizzabile senza terminale dopo il setup |
| S5 | Banco italiano, test di regressione e build locale arm64 | Rapporto comparativo, default scelto, limiti dichiarati e guida d'uso |

Non dichiarare il lavoro completo a S1: un esempio Python non equivale all'integrazione in MappAI. Per contro, non ampliare S5 a chatbot generale, NLI, fine-tuning o motore UDL.

## 12. Verifica della qualità e criteri di completamento

Preparare inizialmente almeno 60 richieste italiane annotate con i passaggi pertinenti, ripartite fra taratura e un insieme separato di verifica. È un banco iniziale, non una validazione universale. Includere più documenti e separare le parafrasi dello stesso caso per evitare contaminazione fra insiemi. Le etichette devono essere riviste: un LLM non può essere l'unico autore e valutatore delle risposte attese.

Usare copie temporanee dei progetti «Officina Elettrica» e «Officina Project E»; aggiungere un dossier diverso. I percorsi originali sono rispettivamente `/Users/giacomomeschini/Documents/MappAI - file/Mappe/4R/Scienze/Officina Elettrica` e `/Users/giacomomeschini/Documents/MappAI - file/Mappe/4R/Scienze/Officina Project E`.

Confrontare recupero lessicale attuale, dense, ibrido e ibrido con reranker. Misurare Recall@k delle prove, posizione dei risultati pertinenti, casi senza prova, tempi a caldo/a freddo, p50/p95 e memoria. Registrare dispositivo, batch, lunghezze e versioni. Gli evaluator disponibili possono aiutare, ma le annotazioni devono rappresentare il compito MappAI. [Valutazione Sentence Transformers](https://www.sbert.net/docs/package_reference/sentence_transformer/evaluation.html)

Obiettivo iniziale proposto: almeno il 95% delle prove annotate presente nei primi 20 candidati sul banco di verifica, con nessuna regressione nei casi critici rispetto alla baseline. Documentare numerosità e fallimenti; se il target non è raggiunto, non promuovere il recupero a sostituto del contesto completo del giudice. Un aumento di Recall non prova la correttezza delle risposte del LLM.

Casi obbligatori:

- negazione, inversione di soggetto e condizione omessa: recuperare anche il testo contrario, senza etichettarlo come sostegno;
- unità, simboli, formule, sinonimi e termini non equivalenti;
- frammento vicino necessario e coppia troppo lunga per il reranker;
- fonte mancante, PDF scansione, tabella non estratta correttamente;
- doppioni semantici fra formati, senza cancellare ripetizioni utili;
- correzione manuale, esclusione e risposta tardiva dopo cambio revisione;
- un progetto non deve recuperare contenuti privati di un altro;
- crash durante aggiornamento, indice incompatibile/corrotto, modello mancante e annullamento;
- assenza di rete dopo setup e assenza di invii cloud nel percorso locale.

Test tecnici deterministici con worker simulato per protocollo, persistenza e UI; prove separate con modelli reali per qualità e prestazioni. Eseguire i test di regressione pertinenti della revisione e del grounding, poi i controlli richiesti dal repository. Non presentare i test simulati come prova della capacità semantica.

Definition of done: S0–S5 consegnate, indice persistente e incrementale, citazioni apribili, decisioni conservate, default motivato dal banco, uso locale verificato e istruzioni installazione/rimozione/cache. Se la build installata non funziona, dichiarare consegnato soltanto il prototipo di sviluppo.

## 13. Lavori successivi esplicitamente separati

- verifica scientifica indipendente con raccolta di fonti disciplinari e confronto documentato;
- chatbot docente capace di preparare proposte nel registro decisioni;
- NLI multilingue, soltanto dopo confronto su casi reali;
- recupero multimodale e OCR più completo;
- ottimizzazioni di runtime, compressione o indice approssimato quando i dati ne dimostrano l'utilità;
- fine-tuning soltanto con esempi affidabili e un banco di verifica separato; le decisioni del docente non sono automaticamente etichette scientifiche vere;
- progettazione e revisione UDL descritta nella traccia collegata.

## 14. Testo da usare nella nuova chat

> Implementa il piano `/Users/giacomomeschini/Claude/MappAI re/docs/PIANO-sentence-transformers-locale-2026-09-15.md` nel repository MappAI. L'obiettivo è completare S0–S5: Sentence Transformers locale sul mio MacBook Air M5 con 32 GB, indicizzazione persistente del PDF e dei contenuti generati, ricerca ibrida con reranking e integrazione delle prove/occorrenze nel modale. Leggi lo stato attuale e preserva le modifiche già presenti. Usa copie temporanee per i progetti di prova; non correggere i materiali originali, non modificare preset o impaginazione PDF e conserva le decisioni del docente. Esegui il banco italiano e verifica anche l'uso nella build locale arm64. Il documento UDL collegato serve solo come promemoria futuro: non implementarlo in questa fase. Documenta versioni, risultati misurati e limiti senza equiparare pertinenza e correttezza scientifica.
