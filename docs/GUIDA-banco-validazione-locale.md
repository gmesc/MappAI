# Banco locale di revisione dei passaggi

## Avvio sul Mac

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
conflitto fra finestre, il testo rimane nella schermata: **Scarica copia
annotazioni** permette di conservarlo prima di ricaricare. La copia scaricata è
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
originali. Il banco è uno strumento di sviluppo locale separato dalla build
MappAI arm64; questa fase non cambia il suo installer. Nessuna implementazione UDL.

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
  un caso dubbio; tema chiaro/scuro e layout a 700 pixel CSS.
- Esportazione prodotta dalla UI di QA accettata dall’evaluatore e rieseguita
  con BGE/MPS offline. Le annotazioni di QA sono sintetiche, in una copia in
  `/private/tmp`: **non sono revisioni del docente né nuovi risultati di qualità**.

Comandi: `node --test tests/local-review-bank.test.js` e
`python3.13 local-ai/test_evaluation_metrics.py`. Evidenze tecniche temporanee
in `/private/tmp/mappai-st-eval` e `/private/tmp/mappai-bank-review-qa`.
