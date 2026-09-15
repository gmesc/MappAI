# Ricerca locale di passaggi e occorrenze

Aggiornata al 15 settembre 2026, codice `c155242` sul branch `codex/sentence-transformers-locale`. S0–S4 e S5 tecnica consegnate; revisione umana del banco ancora aperta. Build corrente: `dist/banco-flusso-20260915/mac-arm64/MappAI.app` (locale, non firmata/notarizzata).

Documenti collegati: [piano e stato S0–S5](PIANO-sentence-transformers-locale-2026-09-15.md), [misure e limiti](VERIFICA-sentence-transformers-locale-2026-09-15.md), [Banco validazione](GUIDA-banco-validazione-locale.md), [componenti distribuiti](../THIRD-PARTY-NOTICES.md).

## Installazione sul Mac

Richiede macOS arm64 e un'installazione **Python 3.13 arm64** (per esempio Homebrew).
Non usa Python di sistema né runtime di Codex. Dal repository:

```sh
python3.13 local-ai/setup.py
```

Il setup crea `~/Library/Application Support/MappAI/local-ai/runtime`, scarica
le revisioni collaudate dei tre modelli e salva l'interprete assoluto in
`config.json`. Mostra i byte dei pesi selezionati e l'avanzamento. La stessa
installazione serve sviluppo e build Electron. Sono necessari diversi GB liberi:
questa installazione di prova occupava circa **7,4 GB**, inclusi runtime e una
copia PyTorch E5 ridondante scaricata nel primo confronto. Il setup finale evita
quel doppione quando è disponibile safetensors.

Per configurare esplicitamente CPU durante il setup:

```sh
python3.13 local-ai/setup.py --device cpu
```

Dopo il setup si usa l'app senza terminale. Il runtime rimane collegato al Python
3.13 con cui è stato creato: se quell'installazione viene rimossa, ripetere il setup.
I modelli sono opzionali; senza setup rimane la ricerca lessicale già presente.

## Uso

1. Aprire/importare il progetto. Il testo PDF viene estratto con PDF.js locale;
   all’importazione si prepara in background la cache della fonte. L’indice del
   progetto si aggiorna quando sono disponibili fonti e contenuti.
2. Nel modale del nodo, della relazione o della revisione aprire **Passaggi
   pertinenti e occorrenze**. Il pannello è disponibile anche senza segnalazioni
   pendenti. Scrivere una domanda o modificare il testo preselezionato.
3. **Mostra i passaggi pertinenti** cerca soltanto negli originali e nei riferimenti
   importati. Il filtro consente di separarli. Materiali generati e testi del docente
   non diventano fonti indipendenti.
4. **Trova altre occorrenze** cerca nei contenuti correnti, con formato, campo,
   ramo e decisioni. L'apertura nell'editor riguarda un elemento alla volta;
   i materiali già approvati restano consultabili senza creare nuove decisioni.
5. **Apri il contesto** mostra il testo archiviato completo e ricontrolla l'estratto
   contro lo snapshot. **Apri PDF originale** apre l'allegato nel lettore del Mac;
   la pagina è indicata nella scheda. Per le fonti web viene aperto l’URL importato. Il lettore esterno non viene forzato a
   cambiare pagina. Se manca l'allegato, rimane il testo archiviato con avviso.

Sono mostrati prima cinque risultati, espandibili fino a venti. Un annullamento
interrompe tra batch; un batch già in esecuzione deve terminare. Le modifiche
invalidano subito i risultati e aggiornano l'indice dopo un breve intervallo.
Le formule seguono il rendering KaTeX già usato dall'app.

**Pertinenza e correttezza scientifica sono diverse.** Anche un passaggio errato,
contrario alla domanda o privo di una condizione può essere pertinente. Nessun
punteggio diventa percentuale di correttezza. Una lista vuota non significa falso;
una lista piena non significa che esista una prova. Il giudice conserva le pagine
intere e tutte le azioni Accetta/Mantieni/Modifica rimangono nel registro esistente.

## Banco validazione: revisione del recupero

**Cabina → Sviluppo → Banco di validazione** apre una finestra dell’app dedicata alla valutazione dei passaggi. È distinta dal modale che revisiona i materiali del progetto: non applica decisioni né correzioni al progetto.

Il banco usa font, controlli e stile dell’app; offre PDF con zoom e trascinamento, testo ingrandibile con Aa e sidebar richiudibile. Conta separatamente **passaggi valutati** e **casi finalizzati**, mostra i punti mancanti e permette di selezionare citazioni esatte conservando le formulazioni del docente. Il nome è facoltativo.

Per annotare il pacchetto già preparato non servono Python, modelli caricati o server. La prima apertura della build richiede la cartella del banco, poi la ricorda. Per preparare un nuovo pacchetto o ripetere l’inferenza si usano gli strumenti del repository descritti nella [guida del banco](GUIDA-banco-validazione-locale.md). Il confronto in finestra ricalcola le metriche sui risultati già registrati; non rilancia i modelli né li addestra.

Le annotazioni sono dati del docente, non cache: conservare tutta la cartella scelta, incluso `annotations/`. Non cancellarla per ricostruire l’indice della ricerca. La build non incorpora corpus, PDF privati o annotazioni.

## Stato e riservatezza

- Gli avvisi indicano pagine senza testo, possibili tabelle/colonne e alcuni
  problemi riconoscibili di codifica dei simboli. Sono euristiche, non un controllo
  completo dell'estrazione. Per una scansione serve un futuro percorso OCR.
- Senza runtime, MPS o pesi disponibili viene dichiarata la ricerca testuale.
  Non viene chiamato automaticamente un provider cloud.
- Ricerca e reranking caricano esclusivamente pesi locali. Il solo setup scarica
  librerie/modelli. Un eventuale controllo LLM avviato nelle altre funzioni mantiene
  il proprio comportamento e non è trasformato in una funzione locale.
- SQLite e vettori sono una cache per progetto nell'area dell'app, mai nei PDF o
  nelle cartelle di consegna. Originali e decisioni non vengono riscritti dall'indice.

## Configurazione, cache e rimozione

Chiudere l'app prima di modificare
`~/Library/Application Support/MappAI/local-ai/config.json`.

- `device`: `mps` (default verificato) oppure `cpu`.
- `embedding`: `BAAI/bge-m3` (default provvisorio) oppure
  `intfloat/multilingual-e5-base`; il secondo applica i prefissi query/passage.
- `reranker`: `BAAI/bge-reranker-v2-m3`.
- Batch iniziale 4, frammenti 320 token, coppie reranker 1024 token. Non aumentare
  questi limiti senza ripetere le prove. Cambiare configurazione invalida la cache.

Gli indici sono file `<hash-progetto>.sqlite` in `local-ai/indexes/`. A **app
chiusa**, eliminare quella sola cartella per ricostruire una cache corrotta o
incompatibile. Questa cartella include anche le cache preparate all’importazione. Non eliminare `pipeline.json`: contiene le decisioni, non l'indice.
Il cambio configurazione pubblica i nuovi record in un'unica transazione.

Per rimuovere la funzione locale: chiudere l'app e rimuovere la cartella
`~/Library/Application Support/MappAI/local-ai`. I vault rimangono intatti.
Kill-switch dell'interfaccia: preferenza `mappai_local_search_enabled` impostata
su `0` nel localStorage dell'app; `1` la riattiva. Sulle piattaforme senza Electron
rimane la ricerca lessicale; runtime mobile, firma e notarizzazione non sono inclusi.

Vedere [rapporto di verifica](VERIFICA-sentence-transformers-locale-2026-09-15.md)
per misure, limiti del banco e comandi di riproduzione.
