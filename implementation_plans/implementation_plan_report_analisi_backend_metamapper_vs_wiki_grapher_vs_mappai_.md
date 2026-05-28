# Report Analisi Backend: MetaMapper vs wiki_grapher vs MappAI_Local

## Obiettivo
Analizzare i backend dei progetti legacy (`MetaMapper` e `wiki_grapher`), identificare il migliore e proporre un piano per iniettarlo in `MappAI_Local` modificando il meno possibile il frontend e l'UX attuale.

## 1. Analisi dei Backend Legacy

I due progetti legacy si basano entrambi su un'architettura **Python (FastAPI)** accoppiata direttamente ai binari di `llama.cpp` (`llama-server.exe`).

### MetaMapper
- **Architettura**: Web server in Python con router separati (`generation.py`, `system.py`).
- **Elaborazione**: La generazione della mappa avviene in background. Il server lancia `llama-server` e gestisce l'estrazione semantica.
- **Punto debole**: Logica di deduplicazione e chunking basilare.

### wiki_grapher (Il Migliore)
Il backend di `wiki_grapher` rappresenta un'evoluzione massiccia e sofisticata.
- **`pipelines/base_pipeline.py`**: Divide il testo in piccoli blocchi (chunks) sovrapposti (es. 4000 caratteri) per evitare che il modello esaurisca la context window e generi JSON corrotti.
- **Elaborazione Parallela**: Sfrutta `ThreadPoolExecutor` per inviare prompt multipli in parallelo, abbattendo drasticamente i tempi di generazione.
- **Deduplicazione Fuzzy Aggressiva (`SequenceMatcher`)**: Identifica e unisce i nodi duplicati anche se scritti in modo leggermente diverso (es. "Impero Romano" e "L'impero romano"), unendo i testi e pulendo la mappa finale.
- **Cross-Linking Avanzato**: Identifica se i collegamenti tra i nodi sono gerarchici (padre-figlio) o trasversali (Cross-Link), preparando un grafo perfetto.

> [!IMPORTANT]
> **Il backend di `wiki_grapher` è nettamente superiore all'attuale backend proxy di `MappAI_Local`.**

## 2. Perché i vecchi backend sono migliori dell'attuale `MappAI_Local`?

Attualmente in `MappAI_Local`, il backend (`main.js`) è un **semplice proxy** che gira la richiesta ad Ollama. Tutta la logica "intelligente" di estrazione è caricata sul frontend (`public/js/app.js`), il quale:
1. **Lavora in modo sequenziale**: Estrae L1, aspetta. Estrae il ramo 1, aspetta. Questo causa tempi di attesa enormi e, se una chiamata fallisce, la mappa si rompe.
2. **Nessuna deduplicazione avanzata**: Può generare due nodi quasi identici in due rami diversi, inquinando il canvas visivo.
3. **Peggior gestione del "Contesto Lungo"**: Inviare un PDF di 100 pagine ad Ollama in una singola chiamata può portare a risposte tagliate e allucinazioni. `wiki_grapher` risolve con il chunking.

## 3. Implementazioni Possibili da Iniettare in MappAI_Local

Poiché il vincolo principale è **modificare il meno possibile l'UX e il Frontend**, proporrò due approcci:

### Opzione A: "Iniezione Python" (Sidecar)
Copiamo l'intera cartella `backend` di `wiki_grapher` dentro `MappAI_Local`. Avviamo il server Python insieme a Electron in background. Modifichiamo `app.js` affinché le API puntino al server Python locale (sulla porta 8000) invece che invocare `main.js`.
- **Pro**: Usa esattamente il codice legacy che già funziona.
- **Contro**: Distrugge l'esperienza "one-click" su Mac. Il computer dell'utente dovrebbe avere Python installato e configurato, rompendo l'architettura offline e standalone che abbiamo appena costruito.

### Opzione B: "Rinascita in Node.js" (L'approccio Ottimale)
Tradurre le tre funzionalità "core" di `wiki_grapher` (Chunking, Parallelizzazione, Deduplicazione Fuzzy) direttamente all'interno dell'attuale backend `main.js` di Node.js.
Il frontend invierà un'unica richiesta con l'intero testo a `main.js` (`ipcRenderer.invoke('generate-advanced-map', data)`). Il backend Electron si comporterà come la pipeline Python: dividerà il testo in chunk, farà N chiamate parallele ad Ollama per estrarre la rete neurale, unirà i nodi con una libreria di fuzzy matching (es. `fuzzball` o simile in JS) e restituirà il JSON finale al frontend per disegnarlo.
- **Pro**: Mantiene l'app Node.js/Electron al 100% autonoma, usa Ollama che abbiamo automatizzato, migliora esponenzialmente l'intelligenza dell'AI.
- **Contro**: Richiede di tradurre in JavaScript la logica di `base_pipeline.py`.

---

## Domanda Aperta per l'Utente

**Procedo con l'Opzione B (Traduzione della logica avanzata in Node.js/Electron)?** 
Questo ci permetterà di avere l'incredibile intelligenza e pulizia semantica di `wiki_grapher`, mantenendo la semplicità di installazione e l'interfaccia attuale di `MappAI_Local` perfettamente intatte. Fammi sapere se vuoi optare per la A o la B!
