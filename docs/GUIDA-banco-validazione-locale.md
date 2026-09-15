# Banco locale di revisione dei passaggi

## Avvio sul Mac

Nell’app MappAI aprire **Cabina → Sviluppo → Banco di validazione**.
Il banco ha una finestra propria; un secondo clic riporta alla stessa finestra.
Non servono terminale, Node installato separatamente, Python o un server HTTP.

La prima apertura nella build installata chiede la **cartella del banco**, con
`packet.json`, `corpus.json`, `pdf/` e le eventuali `annotations/`.
Per il banco già preparato scegliere **`local-ai-data/review/`** del repository.
La scelta viene ricordata nelle impostazioni dell’app; le revisioni sono lette
e salvate nella stessa cartella, senza importazioni, copie o azzeramenti.
In sviluppo quella cartella viene riconosciuta automaticamente.

**Torna a MappAI**, Esc e la chiusura nativa della finestra attendono il salvataggio.
Esc nel confronto chiude soltanto il confronto. Se il salvataggio fallisce, il
banco resta disponibile: si può scaricare **Copia annotazioni** oppure scegliere
esplicitamente di uscire senza salvare le sole modifiche ancora in memoria.

### Avvio tecnico nel browser, ancora disponibile

Aprire con doppio clic **`local-ai/Avvia banco.command`** nel repository.
Il browser si apre sul banco; lasciare aperta la finestra del terminale che lo avvia.
Per chiuderlo usare Ctrl+C in quella finestra. In alternativa:

```sh
npm run local-ai:review
```

Serve Node.js installato dall’utente. Su questo Mac è stato verificato Node
20.20.2, disponibile tramite nvm. **Durante la revisione non servono Python,
modelli caricati o connessione Internet.** Il server ascolta soltanto su
`127.0.0.1:8766`; il collegamento di avvio contiene una chiave temporanea che viene
tolta dalla barra degli indirizzi e mantenuta nella sessione del browser.
Al riavvio del server usare il nuovo collegamento stampato nel terminale.

## Interfaccia e rapporto con l’app

Il revisore vive ora **in una finestra Electron dell’app MappAI**.
Usa direttamente i fogli di stile del modale MappAI **“Rivedi i materiali”**:
token, colori, campi e bottoni condivisi. Il tema è quello chiaro del modale,
come richiesto; non è presente il cambio tema del primo prototipo.

**Il font segue Cabina → Aspetto e leggibilità**, sia alla prima apertura sia
quando la scelta cambia con il banco già aperto. Catalogo, file locali e variabile
`--app-font` vengono dal modulo `MappAIFont` dell’app; nessun secondo elenco di
caratteri. Vale per campi, pulsanti, passaggi e rapporto; il PDF conserva i propri
caratteri originali. L’avvio tecnico HTTP ha una sessione browser separata e non
riceve le preferenze dell’app Electron.

Riferimenti letti prima dell’integrazione: regole **08**, **09 §2–6**, **10** e
**11**, verificate con `npm run ui` e il censimento dei token. La richiesta
esplicita di mantenere la pelle del modale prevale sul tema scuro delle nuove
pagine descritto nella regola 10. L’ingresso nella Cabina usa la navigazione già
prodotta dal motore; la finestra nativa contiene il banco esistente, senza creare
un nuovo overlay. Il corpo dei bottoni legge `--mm-btn-fs` e la barra laterale
`--mm-console-side`; nessuna nuova palette, famiglia di font o regola globale di stile.

Il banco occupa tutta la finestra. Su desktop i selettori sono nella barra
laterale; PDF e annotazioni hanno pannelli affiancati con scorrimento indipendente.
Le azioni di salvataggio e completamento restano visibili in basso. Nelle
finestre strette i pannelli si dispongono in verticale.

La testata mostra soltanto **Banco validazione** e i comandi della vista.
**Confronta metodi**, **Esporta revisioni** e **Copia annotazioni** sono nella
sidebar. La **maniglia nell’angolo sotto il contatore**, sul confine con la sidebar,
estende l’area di revisione a tutta la larghezza e ripristina selettori e
strumenti con un secondo clic, senza cambiare il caso o le annotazioni.
Usa gli stessi stili di Elabora e Insegna: scorrimento di 280 ms, icona che
cambia verso e ritorno al bordo sinistro quando la navigazione è chiusa.
Rispetta la preferenza di movimento ridotto; la sidebar chiusa è esclusa
dalla navigazione da tastiera. Non è più presente il bottone in testata. Per lo schermo intero si usa il controllo nativo di macOS.
L’ingresso resta nella Cabina: questa finestra usa già tutta la superficie
disponibile, quindi non è stata aggiunta una sezione alla navigazione Crea/Elabora.

L’avanzamento occupa una sola riga alle larghezze desktop. **Da chiarire**
compare sotto il selettore del caso solo quando è maggiore di zero: conta
gli stati esplicitamente lasciati in dubbio nel lotto selezionato, non la
differenza tra casi totali e completati. La distinzione fra pertinenza e
correttezza scientifica resta nell’aiuto espandibile e nel rapporto.

Le barre dei due pannelli mostrano **Fonte** e **Da valutare**, con tutti i
controlli sulla stessa riga alle dimensioni verificate. Le icone Lucide sono
quelle già distribuite con l’app; ogni comando ha nome accessibile e tooltip.
Il selettore PDF mostra **Pag. N**; aprendo la tendina le pagine sono raggruppate
per documento e il tooltip conserva titolo, pagina e totale.

Il PDF si apre **adattato alla larghezza**. La rotellina ingrandisce o riduce
attorno al puntatore; tenendo premuto il tasto sinistro si trascina la pagina.
Il pulsante con le frecce orizzontali ripristina larghezza e posizione iniziale.
Con il PDF a fuoco: **+ / −** regolano lo zoom, le **frecce** spostano e **0**
ripristina. La geometria è quella di `MappAIProiezioneCore`, già usata in
Proietta; una striscia della pagina resta raggiungibile anche trascinandola
verso i bordi. Il cambio pagina riparte dalla larghezza; il ridimensionamento
della finestra mantiene l’adattamento se attivo e rispetta uno zoom manuale.

**Aa x1 → Aa x1,5 → Aa x2 → Aa x1** cambia il testo del passaggio e del suo
estratto essenziale. Conserva il carattere scelto nell’app e non ingrandisce
bottoni e titoli. PDF, zoom e Aa cambiano soltanto la vista: non salvano
revisioni, non modificano il testo annotato, il file PDF o la sua impaginazione.

## Il primo lotto

Il banco apre i **20 casi critici**; il selettore permette di passare a tutti i
60. Nel primo lotto ci sono i sei casi inizialmente annotati senza prova,
IT-018, negazioni, inversioni, condizioni omesse, formule e simboli. Le vecchie
etichette e i ranghi dei modelli non sono mostrati al revisore.

1. Indicare nome o sigla del **revisore**.
2. Leggere la domanda e consultare il PDF. **Mostra pagina** apre la pagina del
   candidato; il selettore permette di consultare il resto del dossier. Il PDF
   completo è anche scaricabile. Le copie mantengono tutti i difetti originali.
3. Valutare ogni passaggio: **Pertinente**, **Parzialmente pertinente** o
   **Non pertinente**. Per i primi due, il campo dell’estratto permette di
   scegliere il testo essenziale: copiarlo esattamente, conservando negazioni,
   soggetto e condizioni. Una sola parola generica non è di norma un riferimento
   sufficiente. I passaggi possono essere pertinenti anche se contraddicono la
   domanda; qui non si certifica la correttezza scientifica.
4. Se manca un passaggio, espandere **Testo archiviato della pagina**, copiare
   l’estratto e usare **Aggiungi un passaggio mancante**. Sono ammesse più
   alternative. Se il testo estratto non permette una citazione fedele al PDF,
   annotare il difetto e lasciare il caso da chiarire, senza correggere la fonte.
5. Confermare di avere consultato PDF e contesto. L’assenza di prova richiede
   una ricerca nel dossier, una motivazione e nessun passaggio pertinente o
   parziale. Una lista di candidati deludenti non dimostra l’assenza.
6. **Completa revisione** include il caso nel confronto. **Lascia da chiarire**
   lo conserva ma lo esclude. Modificare un caso completato lo riapre come bozza.

Le bozze si salvano automaticamente e sono riprese anche dopo il riavvio.
Controllare la scritta “Bozza salvata” prima di chiudere. In caso di errore o
conflitto fra finestre, il testo rimane nella schermata: **Copia annotazioni**
permette di scaricarlo e conservarlo prima di ricaricare. La copia scaricata è
un backup leggibile; non viene reimportata automaticamente.

## Confronto ed esportazione

**Confronta metodi** ricalcola immediatamente le metriche sui ranghi già
registrati: nessuna inferenza nuova. Taratura e verifica restano distinte.

- **Hit@5 / Hit@20:** quota di domande con almeno un passaggio pertinente
  completo nei primi 5 / 20 risultati; gli estratti alternativi sono ammessi.
- **MRR@20:** premia il primo passaggio pertinente quando compare presto.
- Casi senza prova: riportati separatamente, con elenco di quelli per cui
  ciascun metodo restituisce comunque risultati. Non esiste una soglia calibrata
  di “prova assente”.
- Passaggi parziali non contano come riferimenti positivi nelle metriche
  principali. Bozze e casi da chiarire non entrano nel denominatore.

**Esporta revisioni** scarica `bank-reviewed-rN.json`, contenente soltanto casi
completati, riferimenti esatti, revisore, note, revisione e identità del corpus.
**Scarica rapporto JSON** conserva anche i casi mancati e i ranghi per metodo.
Per una nuova inferenza usando il banco esportato:

```sh
"$HOME/Library/Application Support/MappAI/local-ai/runtime/bin/python3" \
  local-ai/evaluate.py --root local-ai-data/review \
  --model BAAI/bge-m3 --bank "/percorso/bank-reviewed-rN.json"
```

L’evaluatore verifica hash del corpus, stato umano dichiarato e offset delle
citazioni. Scrive un rapporto `*-reviewed-rN.json` separato dal banco iniziale.
Il nome del revisore è un’attestazione inserita dall’utente, non una firma
crittografica né una prova automatica della competenza o indipendenza del giudizio.

## Dati, riproduzione e limiti

La cartella **`local-ai-data/review/`**, esclusa da Git, contiene:

- `packet.json`: pacchetto immutabile con fonti, candidati, ranghi e annotazioni
  iniziali conservate; la UI riceve soltanto la parte anonima necessaria;
- `pdf/`: copie binarie dei PDF, verificate con SHA-256 all’apertura;
- `corpus.json`: snapshot esatto usato dal banco;
- `annotations/00000001.json`, ecc.: revisioni complete e immutabili. Un
  salvataggio non sovrascrive quello precedente. Salvare una copia di **tutta
  questa cartella** per trasferire o mettere al sicuro il lavoro.

Nessuna scrittura nei vault, in `pipeline.json`, nei preset o nei materiali
originali. La build MappAI arm64 include interfaccia, collegamento Electron e
font; **non include i PDF privati, il corpus o le annotazioni del banco**.
Questi restano nella cartella scelta dal docente. Nessuna implementazione UDL.

Per rigenerare un pacchetto in una **nuova** cartella, dopo avere predisposto
copie temporanee e risultati del confronto:

```sh
node local-ai/review-bank.cjs prepare /private/tmp/mappai-st-eval /percorso/nuovo-banco
node local-ai/review-bank.cjs serve /percorso/nuovo-banco 8766 --open
```

La preparazione usa Python del runtime per leggere gli indici SQLite esistenti,
senza caricare modelli. La destinazione deve essere nuova: non sovrascrive un
pacchetto con annotazioni già svolte.

I candidati sono l’unione deduplicata dei primi **5** risultati di baseline,
FTS, dense, ibrido e reranker di BGE/E5; l’ordine mescolato resta stabile nel
pacchetto. **747 candidati** nei 60 casi, **247** nel primo lotto; da 7 a 18 per
caso. Il reranker diretto non partecipa a questo confronto salvato perché i suoi
vecchi risultati non contenevano gli ID ordinati. Una nuova inferenza Python
continua a misurarlo quando il corpus è abbastanza piccolo.

Il pool può mancare passaggi validi: aggiungerli dal dossier è essenziale. Restano
i limiti del corpus piccolo (29 frammenti elettrici, 9 storici), della separazione
per soli due dossier e delle annotazioni non esaustive. Il prossimo ampliamento
utile sarà una verifica su dossier nuovi e più grandi, mantenuti separati dalla
taratura. Questo strumento rende possibile la revisione umana; non l’ha svolta.

## Verifiche del 15 settembre 2026

- **1.541 test Node superati, 0 fallimenti, 2 skipped**; escluso il già noto
  `live-server.test.js`. Cinque nuove prove coprono regole, persistenza,
  revisioni concorrenti, isolamento HTTP, identità PDF e metriche.
- **2 test Python nuovi** su riferimenti alternativi, limiti dei frammenti,
  identità del corpus e offset Unicode.
- Browser reale: PDF visualizzato, blocco del completamento incompleto,
  completamento, aggiunta manuale, salvataggio/ripresa e confronto che esclude
  un caso dubbio; layout a 700 pixel CSS.
- Esportazione prodotta dalla UI di QA accettata dall’evaluatore e rieseguita
  con BGE/MPS offline. Le annotazioni di QA sono sintetiche, in una copia in
  `/private/tmp`: **non sono revisioni del docente né nuovi risultati di qualità**.

Aggiornamento grafico successivo: rieseguiti **5 test del banco, tutti superati**.
Nel browser verificati lo stile condiviso, il PDF intero/adattato alla larghezza,
il salvataggio e la ripresa di una nota, il confronto e i layout a **1707, 1400 e
700 pixel CSS**, senza scorrimento orizzontale della pagina e con azioni visibili
in basso. Nessun errore o avviso nella console della sessione di prova. Prove
eseguite sulla copia temporanea; il banco destinato al docente non è stato annotato.
Il solo aggiornamento grafico non aveva cambiato il recupero dei passaggi né
introdotto nuovi risultati di qualità o una verifica della build arm64.

### Integrazione nell’app — 15 settembre 2026

- Build locale **arm64**, MappAI **1.0.0-beta.5**, Electron **41.10.7**,
  electron-builder **26.15.3**. Build di sviluppo non firmata/notarizzata,
  conservata in `dist/banco-validazione-20260915/mac-arm64/MappAI.app`.
- **1.543 test Node superati, 0 fallimenti, 2 saltati**; escluso il già noto
  `live-server.test.js`. **30 test mirati** rieseguiti dopo l’ultima rifinitura
  della chiusura: confini IPC, unicità della finestra, storia immutabile,
  rigetto dei PDF sostituiti, uscita annullata e sincronizzazione dei quattro font.
- Prova nell’app pacchettizzata, con profilo e banco in `/private/tmp`:
  ingresso dalla Cabina, PDF caricato dal pacchetto di dati, apertura in Atkinson,
  passaggio a Space Mono **nella stessa finestra già aperta**, bozza conservata,
  chiusura nativa e riapertura con la nota presente; Esc nel rapporto lascia
  aperto il banco. Le annotazioni di questa prova sono sintetiche, non del docente.
- L’IPC del banco accetta richieste solo dal frame principale della sua finestra;
  il preload dedicato non espone le API generali dell’app. Il renderer riceve la
  stessa vista anonima usata dal browser; modello, ranghi ed etichette iniziali
  restano nascosti durante la revisione. Store, validazione e metriche sono condivisi.

L’integrazione non aggiunge inferenze né cambia il banco italiano: i risultati
precedenti del recupero restano quelli documentati. Queste prove verificano il
funzionamento dell’app, non la pertinenza delle annotazioni o la correttezza scientifica.

### Banco compatto — 15 settembre 2026

- A **1707 × 960 pixel CSS**, con **Space Mono**, testata più avanzamento
  passano da **202,60 a 92,33 px**: **110,27 px** aggiuntivi per l’area di
  lavoro, che passa da **686,73 a 797 px**. Nascondendo la sidebar la larghezza
  del dettaglio passa da **1434,67 a 1706,67 px**. Sono misure di questa
  configurazione, non una garanzia per qualsiasi font, zoom o messaggio di errore.
- Browser verificato a **1707 × 960**, **1400 × 907** e **700 × 600** pixel CSS:
  nessuno scorrimento orizzontale della pagina, azioni finali visibili,
  sidebar reversibile e ripresa della nota dopo ricaricamento. A 700 px i
  pannelli sono verticali e il corpo scorre; la sidebar può essere nascosta.
- Prova sintetica su copia temporanea: con **0/20 completati**, un caso lasciato
  in dubbio mostra **1 da chiarire nel lotto** nella sidebar; tornando a bozza
  il conteggio scompare. Il confronto continua a escludere quel caso.
- **30 test mirati superati, 0 fallimenti**, su banco e font. Nessun errore o
  avviso nella console della sessione browser di prova.
- Ricostruita e aperta la build **arm64** in
  `dist/banco-compatto-20260915/mac-arm64/MappAI.app`: stesse versioni indicate
  sopra, firma locale disabilitata. Verificati ingresso dalla Cabina, nuovo
  titolo, PDF, Space Mono ereditato e area espansa con sidebar nascosta.

Questa modifica riguarda lo spazio dell’interfaccia: non aggiorna le misure
di recupero, non aggiunge revisioni del docente e non modifica i materiali.

### Controlli di lettura — 15 settembre 2026

- Barre **Fonte / Da valutare** entrambe di **54,67 px** in Space Mono alle
  dimensioni **1707 × 960**, **980 × 800** e **700 × 600** pixel CSS. Controlli
  allineati anche con Aa x1,5; pagina senza overflow orizzontale e footer visibile.
- Verificati nel browser rotellina, trascinamento di **+80 / −50 px**, ripristino
  alla larghezza, cambio pagina e ritorno alla pagina del candidato. Testo a
  **14 / 21 / 28 px**, controlli sempre a **12 px**; nessun errore nella console.
- Il PDF viene ridisegnato alla risoluzione dello zoom dopo **120 ms** senza
  ulteriori gesti. Ogni bitmap è limitato a **16 megapixel** e **8192 px per lato**;
  oltre tale risoluzione l’ingrandimento resta disponibile, ma può perdere
  nitidezza. Il dettaglio già assente nelle scansioni non viene ricostruito.
  La scala usa i limiti già presenti in Proietta: **0,05–8**.
- **40 test mirati superati**: persistenza e isolamento del banco, risorse locali,
  font, geometria condivisa, eventi del visualizzatore, cambio pagina durante
  un rendering, ripristino durante uno zoom e gestione degli errori.
- Build locale **arm64**, Electron **41.10.7**, MappAI **1.0.0-beta.5**,
  electron-builder **26.15.3**, in
  `dist/banco-lettura-20260915/mac-arm64/MappAI.app`, non firmata/notarizzata.
  Prova nativa su banco e profilo temporanei: Atkinson scelto nella Cabina e
  applicato al banco, PDF, zoom con rotellina, trascinamento, ripristino con **0**
  e Aa x1,5. Queste prove non attribuiscono giudizi ai materiali del docente.

I controlli di lettura non cambiano recupero, metriche, preset, materiali o
decisioni del docente; pertinenza e correttezza scientifica restano separate.

Consegna: build definitiva aperta con il profilo MappAI esistente e collegata
tramite il selettore nativo a `local-ai-data/review/`. Verificati gli hash dei
**376 materiali originali** e di tutti i file del banco reale: identici, nessuna
annotazione di prova aggiunta. Il vecchio server browser è stato chiuso.

Comandi: `node --test tests/local-review-bank.test.js` e
`python3.13 local-ai/test_evaluation_metrics.py`. Evidenze tecniche temporanee
in `/private/tmp/mappai-st-eval` e `/private/tmp/mappai-bank-review-qa`.

### Maniglia condivisa — 15 settembre 2026

Maniglia 34 × 34 px con la stessa forma, icona e colori delle console.
Il bordo superiore coincide con il bordo inferiore dell’avanzamento; il bordo
sinistro segue la sidebar (272 px, 200 px nelle finestre strette) e torna a
zero quando chiusa. La sidebar resta laterale anche nella finestra minima,
con scorrimento proprio; i documenti diventano verticali sotto 760 px.
La build arm64 aggiornata è in `dist/banco-maniglia-20260915/mac-arm64/MappAI.app`.

Verifiche: 40 test banco/font/PDF e 99 test console/modali superati; prova
nel browser a 1707 e 700 px, apertura/chiusura e riapertura da tastiera;
prova nella build arm64 con font Atkinson e riadattamento del PDF.
