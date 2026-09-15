# Ricerca locale di passaggi e occorrenze

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
