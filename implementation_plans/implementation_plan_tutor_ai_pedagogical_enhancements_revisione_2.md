# Tutor AI Pedagogical Enhancements (Revisione 2)

L'obiettivo è rendere il Tutor AI uno strumento proattivo e metodologico, implementando vere e proprie chat contestuali (sia globali che specifiche per nodo) con logiche didattiche avanzate (metodo socratico, valutazione e feedback costruttivo).

Di seguito il piano di implementazione aggiornato in base alle tue direttive.

## 1. Interfaccia e Posizionamento (UI)

### Modale del Nodo (Tutor Locale)
# Evoluzione SOTA: Verso un Second Brain basato su Markdown

L'obiettivo di questo piano è analizzare e proporre una roadmap tecnica per far evolvere MappAI da uno strumento basato su mappe JSON monolitiche a un ecosistema "Second Brain" basato su un file system di documenti Markdown interconnessi (stile Obsidian/Logseq), mantenendo però la potenza visuale e generativa dell'AI.

## 1. Analisi dei Dubbi Iniziali

**JSON vs Markdown per il LLM:**
Il JSON è fantastico per forzare il LLM a generare strutture rigide (es. l'array di nodi e i link), ma è pessimo per la portabilità a lungo termine e per la gestione di testi lunghi e complessi. Il Markdown, al contrario, è lo standard universale per la conoscenza. 

**Serve un SLM per la traduzione?**
**No, non serve.** Tradurre da JSON a Markdown (e viceversa) non richiede l'uso di un modello IA. Le strutture JSON (titolo del nodo, descrizione, note ereditate) possono essere convertite in Markdown in modo deterministico usando script classici. Un file Markdown può contenere i dati strutturati nell'intestazione (Frontmatter YAML) e il contenuto testuale nel corpo del documento.

**Data Abstraction Layer (DAL)?**
**Sì, assolutamente.** È la chiave di volta del progetto. L'app non deve accorgersi che i file su disco sono Markdown. Il DAL si occuperà di:
- **Lettura:** Leggere una cartella di file Markdown, estrarne i metadati (YAML Frontmatter) e costruire in memoria il classico file JSON (`appState.db`) che D3.js usa per disegnare la mappa.
- **Scrittura:** Prendere le modifiche fatte sulla mappa visuale (JSON in memoria) e sincronizzarle, aggiornando i singoli file Markdown su disco.

**Fork o Refactoring?**
Il passaggio a una struttura "a cartelle" (Vault) rispetto a un "singolo file" (JSON) è un cambiamento architetturale profondo (gestione dei file recenti, caricamento, salvataggio).
> [!TIP]
> **Consiglio:** Meglio un **Branch di Refactoring** pesante o un vero e proprio **Fork (MappAI Brain)**. Questo permette di non rompere l'app attuale finché la nuova architettura non è stabile.

## 2. Nuova Architettura Dati (Il Vault)

Invece di salvare un singolo `Mappa_Concetto.json`, il progetto salverà una cartella (il Vault) strutturata così:

```text
📁 MappAI_Vault_Storia
   📄 index.yaml (Configurazioni globali della mappa)
   📁 Nodi
      📄 Impero_Romano.md
      📄 Caduta_Impero.md
      📄 Cause_Economiche.md
```

**Struttura interna di un Nodo (es. `Impero_Romano.md`):**
```markdown
---
id: "node_12345"
level: 1
group: 0
parent: "node_root"
links_to: ["node_54321", "node_98765"]
---
# Impero Romano

L'Impero Romano è stato uno dei più grandi...

## Fonti
- [Fonte 1 | Autore]: Testo estratto
```

## 3. Implementation Plan (Fasi di Sviluppo)

### Fase 1: Sviluppo del Data Abstraction Layer (DAL) (Backend Node.js)
Creazione di un modulo Node.js (in `main.js` o file separato) che espone via IPC:
- `read-vault(path)`: Legge tutti i `.md` di una cartella, fa il parsing del Frontmatter YAML e del corpo testuale, e restituisce a `app.js` il JSON esatto che si aspetta (`{nodes: [...], links: [...]}`).
- `write-vault(path, db)`: Prende il JSON in memoria e lo frammenta, scrivendo/aggiornando i relativi file `.md`.

### Fase 2: Adattamento Frontend
- Modificare il salvataggio automatico: invece di usare `save-map-json`, si invierà un comando `sync-vault`.
- Rivedere l'interfaccia di apertura progetti: non si aprirà più un singolo file, ma si selezionerà una cartella.

### Fase 3: Riconfigurazione dell'AI Pipeline e Data Flow
- L'intelligenza artificiale **continuerà a generare in formato JSON strutturato**. Questo è il metodo più sicuro e robusto: forzare l'LLM a sputare fuori array di nodi e link assicura che D3.js non vada in crash e che le relazioni topologiche siano perfette. 
- Il flusso sarà: `Caricamento PDF -> Prompt a Gemini -> Gemini restituisce JSON -> Il Frontend disegna la Mappa -> Al Salvataggio, il DAL prende il JSON e genera i file Markdown su disco`.

## 4. Decisioni Architetturali (Approvate)

A seguito della revisione, sono state prese le seguenti decisioni definitive per il refactoring:

1. **Nessuna Retrocompatibilità:** Non scriveremo alcun convertitore per i vecchi file `.json`. Il nuovo progetto partirà "pulito" accettando nativamente solo l'architettura a Vault Markdown.
2. **Esportazione Nativa:** Il sistema sarà focalizzato esclusivamente sul mantenere, gestire ed esportare il formato Markdown (cartelle di file `.md`). Il JSON sarà relegato a un puro meccanismo temporaneo di "passaggio dati" in memoria RAM tra l'IA e il renderizzatore grafico.
3. **Piena Compatibilità del Tutor AI:** Il Tutor AI, la chat, la persistenza e le logiche socratiche continueranno a funzionare **perfettamente**. Il Tutor infatti legge lo stato della mappa in memoria RAM (che rimarrà identico); anzi, se in futuro decideremo di fargli leggere l'intero hard-disk, i file `.md` saranno il "pasto" perfetto per un LLM!
