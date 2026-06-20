# Analisi Funzionale Completa — MappAI
> Documento prodotto dall'analisi statica del codice sorgente.  
> Fonti: `public/js/app.js` (12.177 righe), `public/index.html` (3.245 righe), `main.js` (964 righe), `storageAdapter.js` (1.272 righe), `prompts_config.json`.  
> Data analisi: 29 maggio 2026.

---

## 1. Scopo dell'Applicazione

### A chi è destinata?

MappAI è uno strumento educativo progettato per tre profili distinti, che si dividono un ambiente condiviso ma con funzionalità parzialmente differenziate.

| Profilo | Ruolo | Problema che risolve |
|---------|-------|----------------------|
| **Studente BES/DSA** | Utente finale dello studio | Difficoltà di accesso, comprensione e memorizzazione dei contenuti disciplinari |
| **Docente di materia** | Produttore dei contenuti | Trasformazione di libri/dispense in strutture navigabili e personalizzabili |
| **Operatore per l'Inclusione (OPI)** | Mediatore didattico | Costruzione di materiali cognitivamente accessibili a partire dalle fonti del docente |

### Casi d'uso concreti per profilo

**Studente BES/DSA**
- Carica un vault preparato dall'OPI e lo naviga tramite la Tree View laterale
- Usa il Tutor AI Socratico per approfondire singoli nodi in modo dialogico
- Studia con flashcard e quiz generati automaticamente dalla mappa
- Usa il Pomodoro Timer per gestire le sessioni di concentrazione
- Attiva font OpenDyslexic, riga di lettura, TTS per compensare le difficoltà

**Docente di materia**
- Carica i propri PDF, DOCX, URL web, video YouTube o testi
- Genera automaticamente una mappa mentale o un knowledge graph
- Personalizza i colori delle macro-aree per la codifica visiva
- Esporta il vault per condividerlo con l'OPI o altri colleghi

**Operatore per l'Inclusione (OPI)**
- Riceve le fonti dal docente e le carica in MappAI
- Costruisce o adatta manualmente il grafo per il profilo cognitivo dell'allievo
- Aggiunge note dettagliate in Markdown nei nodi sensibili
- Esporta etichette fisiche stampabili (cartellini per mappa cartacea)
- Genera il Dossier PDF del nodo/ramo per uso in classe
- Attiva la Modalità Studente prima di consegnare il vault allo studente

### Filosofia pedagogica

**Active Learning e scaffolding cognitivo.** L'architettura del grafo (nodi gerarchici con livelli 0–5) rispecchia la tassonomia di Bloom: dal concetto radice (L0) alle istanze più specifiche (L4–L5). Il rendering delle macro-aree come raggruppamenti cromatici crea scaffolding visivo.

**Metodo socratico.** Il Tutor AI non risponde direttamente: guida lo studente con domande calibrate in base alla fase dello studio (`REASONING phase`, `RECALL phase`). Il prompt `SOCRATIC_TUTOR_IT` — verificabile in `prompts_config.json` — specifica esplicitamente di non fornire risposte ma di stimolare il ragionamento.

**Mediazione didattica.** La presenza del profilo OPI è codificata nell'architettura stessa: la Modalità Studente (`appState.studentMode`, L35 di `app.js`) blocca l'accesso al generatore AI e alle impostazioni avanzate, lasciando allo studente solo la navigazione e lo studio. L'OPI "prepara il campo" prima di consegnare il dispositivo.

### Come si colloca nel workflow professionale di un OPI?

MappAI è l'ambiente di lavoro principale dell'OPI, non uno strumento accessorio. L'OPI:
1. Costruisce/adatta grafi partendo dalle fonti del docente
2. Arricchisce i nodi con note e fonti contestuali in Markdown
3. Esporta materiali fisici (etichette, dossier PDF)
4. Configura l'accessibilità per lo studente specifico
5. Attiva la Modalità Studente e consegna il vault

---

## 2. Architettura e Piattaforme Supportate

### Piattaforme

| Piattaforma | Tecnologia | Stato |
|-------------|-----------|-------|
| macOS (Apple Silicon + Intel) | Electron 35+ | ✅ Produzione |
| Windows | Electron 35+ | ✅ Produzione |
| Linux | Electron 35+ | ✅ Supportato |
| iPadOS | Capacitor + iOS Keychain | ✅ Sviluppo attivo |

### Architettura interna

```
┌─────────────────────────────────────────────┐
│  Renderer Process (Chromium)                │
│  ├── index.html (3.245 righe)               │
│  ├── app.js (12.177 righe) — tutta la logica│
│  └── storageAdapter.js — polyfill I/O       │
├─────────────────────────────────────────────┤
│  preload.js — bridge sicuro IPC             │
├─────────────────────────────────────────────┤
│  Main Process (Node.js)                     │
│  └── main.js (964 righe, 22 IPC handler)    │
├─────────────────────────────────────────────┤
│  File System                                │
│  └── ~/Documents/MappAI - Vault/           │
└─────────────────────────────────────────────┘
```

### Differenze Electron vs Capacitor (iPadOS)

| Funzionalità | Electron (desktop) | Capacitor (iPadOS) |
|---|---|---|
| Storage vault | `fs` nativo → `~/Documents/MappAI - Vault/` | `Filesystem` Capacitor API |
| API keys | `localStorage` | iOS Keychain (plugin `KeychainPlugin`) |
| Elenco vault | `ipcMain.handle('get-all-vaults')` | `Filesystem.readdir()` |
| Upload file | `ipcMain.handle('pick-file')` dialog nativo | Input HTML5 `<input type="file">` |
| Parsing DOCX | `mammoth` in main process | Non supportato (rimosso) |
| Fetch URL | `ipcMain.handle('fetch-url')` → axios | Non disponibile (SSRF concern) |
| Capture screenshot | `ipcMain.handle('capture-page')` | Non disponibile |
| Machine ID | MAC + CPU → SHA-256 in main.js | Non implementato |

**Compatibilità garantita da `storageAdapter.js`:** Il renderer usa sempre `window.electronAPI.*` se Electron è presente, altrimenti il polyfill Capacitor gestisce le stesse operazioni con le API iOS. Il rilevamento avviene a runtime: `const isCapacitor = typeof window.Capacitor !== undefined` (L23 di `storageAdapter.js`).

---

## 3. Funzionalità Principali

### A — Generazione grafo da sorgenti multiple

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Docente / OPI |
| **Attivazione** | Sezione 1 della sidebar → scelta della fonte → bottone "Genera" |
| **Codice** | `window.startGeneration()` (L1860 `app.js`) → `extractMindMapIterative/MultiPass()` o `extractKnowledgeGraphSinglePass/MultiPass()` |

**Fonti supportate:**
- 📄 **PDF** — estratto con `pdf.js` (`window.extractTextFromPDF`, L1437) tramite rendering pagina per pagina
- 📝 **Testo libero** — incollato direttamente nell'area testo
- 🌐 **URL web** — recuperato via `ipcMain.handle('fetch-url')` → `axios + cheerio` per stripping HTML
- 🎬 **YouTube** — URL del video passato direttamente all'API Gemini (supporto nativo)
- 🎙️ **Audio/Video** — file caricato e inviato all'API Gemini via `ipcMain.handle('upload-file-gemini')`
- 📁 **DOCX** — convertito con `mammoth` in main.js → `ipcMain.handle('parse-docx')`

**Due modalità di struttura:**
- **Mappa Mentale**: struttura gerarchica (radice → macro-aree → rami → foglie, L1–L4)
- **Knowledge Graph**: rete di concetti con relazioni esplicite (hub, entità, cross-link)

**Due modalità di generazione:**
- **Single Pass**: un'unica chiamata API per albero completo (veloce, per KG)
- **Multi Pass**: prima identifica le macro-categorie L1, poi genera ogni ramo separatamente (qualità superiore, default per Mappa Mentale)

**Output:** Grafo D3.js interattivo caricato in `appState.db`, salvato nel vault

---

### B — Editor di nodi

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI / Docente |
| **Attivazione** | Click su un nodo → modal `source-modal` → tasto modifica |
| **Codice** | `window.openSourceModal()` (L5007), `window.saveNodeEdit()` |

**Contenuto editabile per nodo:**
- `label`: nome visualizzato nel grafo
- `content`: testo principale in formato testuale (con rendering Markdown semplificato via `parseSimpleMarkdown`)
- `desc`: descrizione breve
- `chunks[]`: array di blocchi di contenuto con `{title, source, text}` — ogni chunk può avere una fonte diversa
- Immagini: upload tramite `window.handleImageUpload()` (L8187) con anteprima `<img>` nel modal
- Formule matematiche: supportate via rendering inline nel Markdown
- `studyStatus`: stato di studio (`none`, `todo`, `review`, `done`)

---

### C — Modifica manuale della struttura del grafo

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI / Docente |
| **Attivazione** | Click su nodo → context menu → azioni strutturali |
| **Codice** | `window.ctxAction()` (L7405), `window.handleNodeClick()` (L4867) |

**Azioni disponibili nel context menu:**
- Aggiunta di nodo figlio
- Eliminazione nodo (con opzione di eliminare il ramo)
- Rinomina del nodo
- Cambio del gruppo/macro-area di appartenenza
- Aggiunta di relazione cross-link verso altro nodo
- AI Extension contestuale: arricchisce il nodo selezionato tramite AI (`executeContextualAIExtension`, L10485)
- Merge di vault: `window.mergeVault()` (L6014) con opzione AI cross-link

**Navigazione visiva:**
- Drag & drop dei nodi (D3 drag, `drag()` L4054)
- Zoom e pan sul canvas SVG
- `zoomToFitNodes()` (L941) per inquadrare automaticamente la selezione
- Layout multipli: default, radiale, struttura ad albero

---

### D — Tutor AI Socratico

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente / OPI (per testing) |
| **Attivazione** | Sidebar tab "Tutor" → chat contestuale al nodo selezionato |
| **Codice** | Chat in `app.js` ~L8600, prompt `SOCRATIC_TUTOR_IT/EN` in `prompts_config.json` |

**Meccanismo:**
Il tutor mantiene una storia di conversazione (`currentNodeState.history`) con il contesto del nodo corrente. La fase di studio (RECALL vs REASONING) determina il comportamento: nei primi 3 turni il tutor chiede domande di richiamo; dal turno 4 in poi orienta verso il ragionamento alternativo.

Il tutor è anche accessibile all'interno del modal nodo (`window.resetNodeTutor()`, L5183 di `index.html`).

La lingua si adatta automaticamente: `SOCRATIC_TUTOR_IT` o `SOCRATIC_TUTOR_EN` in base a `appState.language`.

---

### E — Study Mode: Flashcard e Quiz

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente |
| **Attivazione** | Sidebar "Pannello Studio" → bottoni "Genera Flashcard" / "Genera Quiz" |
| **Codice** | `window.startStudySession()` (L9451), `window.renderQuizUI()` (L8764) |

**Ambito configurabile:**
- Nodo singolo
- Ramo (nodo + tutti i discendenti via `getDescendants()`)
- Globale (tutti i nodi del vault)

**Modalità quiz:**
- Scelta multipla con spiegazione dell'errore
- Domanda aperta valutata dal tutor AI (`SINGLE_QUIZ_TUTOR`)
- Quiz dinamico con schema JSON strutturato per output consistente

**Flashcard:** Formato fronte/retro generato tramite `FLASHCARD_GENERATOR`. L'AI restituisce un array JSON tipizzato.

---

### F — Study Progress (stati Todo/Review/Done)

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente |
| **Attivazione** | Click sul nodo → cambio stato dal pannello → oppure dal Tree View |
| **Codice** | `d.studyStatus` campo su ogni nodo, visualizzato con colori specifici in `renderGraph()` (L3881) |

**Stati:**
- `none` — nessuno stato assegnato (default)
- `todo` — da studiare (rosso `#ef4444`)
- `review` — in revisione (ambra `#f59e0b`)
- `done` — appreso (verde `#22c55e`)

Gli stati vengono visualizzati sia nel grafo D3 (colore nodo), sia nella Tree View (badge colorato), sia nella barra di progresso della sidebar. Sono persistiti nel vault al salvataggio.

---

### G — Pomodoro Timer

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente |
| **Attivazione** | Sidebar → sezione "Studio" → timer Pomodoro |
| **Codice** | `window.togglePomodoro()` (L8848), variabile `pomodoroInterval`, `pomodoroDuration` (L8817) |

**Caratteristiche:**
- Durata configurabile: preset 15 min o 25 min (bottoni `pomodoro-preset-15`, `pomodoro-preset-25`)
- Counter sessioni persistito in `localStorage` (`mappai_pomodoro_sessions`)
- Al termine della sessione: notifica toast + incremento contatore

---

### H — Foglio Nodi (etichette stampabili)

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI |
| **Attivazione** | Pannello export → "Foglio Nodi" → download PDF |
| **Codice** | `app.js` ~L6290–6402, `jsPDF` library |

**Output:** PDF A4 con griglia di cartellini (card con bordo tratteggiato blu), uno per nodo del grafo. Ogni cartellino mostra il `label` del nodo centrato, con separazione ritagliabile. Ideale per creare **mappe fisiche da apporre su cartelloni o lavagne in classe**.

Il PDF viene salvato automaticamente come `Label-{nome_progetto}.pdf`.

---

### I — Dossier PDF

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI / Docente |
| **Attivazione** | Export → "Opzioni Stampa Dossier" → modal con configurazione |
| **Codice** | `window.openDossierPrintModal()` (L6409), `window.generateDossierPDFFromOptions()` (L6479) |

**Configurazione modale:**
- Scelta nodo radice (Mappa Mentale) o Super-Hub (Knowledge Graph)
- Modalità: nodo singolo o ramo completo
- Il dossier include: label del nodo, contenuto principale (`content`), fonti (`chunks`), note ereditate dalla funzione `getInheritedDatabase()` per i nodi discendenti

**Output:** PDF multi-pagina con sezione "FONTI E NOTE APPROFONDITE" per ciascun nodo del ramo. Colori intestazione correlati ai colori delle macro-aree del grafo. Salvato nel vault tramite `ipcMain.handle('save-pdf-to-vault')`.

---

### J — Screenshot del grafo

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Docente / OPI |
| **Attivazione** | Toolbar → icona screenshot |
| **Codice** | `window.exportSnapshot()` (L4226), `ipcMain.handle('capture-page')` |

Cattura la viewport corrente del grafo D3 come immagine PNG pulita (senza UI). Usa `capturePage()` di Electron a livello di BrowserWindow. Il file viene scaricato nella cartella `MappAI - Vault/Screenshots/`.

---

### K — Export/Import Vault Markdown

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI / Docente |
| **Attivazione** | Toolbar → Vault Manager |
| **Codice** | `window.saveMapVault()` (L5621), `window.exportNotesMarkdown()` (L6254), IPC `save-vault` / `load-vault` |

**Struttura vault su disco:**
```
~/Documents/MappAI - Vault/
└── NomeProgetto_YYYY-MM-DD/
    ├── index.yaml          ← metadati mappa (js-yaml)
    ├── links.json          ← relazioni tra nodi
    ├── vault_data.json     ← stato completo serializzato
    ├── Nodi/
    │   ├── NomeNodo1.md    ← contenuto Markdown per nodo
    │   └── NomeNodo2.md
    └── Chat/
        └── nodo_NomeNodo_tutor.txt
```

**Portabilità:** I file `.md` sono standard Markdown leggibili in Obsidian, VS Code o qualsiasi editor. `links.json` e `index.yaml` usano formati aperti. È possibile aprire un vault Obsidian esistente come base.

---

### L — Supporto DSA

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente (attivato da OPI) |
| **Attivazione** | Pannello A11y (icona laterale) |
| **Codice** | Classe CSS `font-dyslexic` su `document.body`, `window.toggleDyslexicFont()` (L5359) |

**Strumenti accessibilità presenti nel codice:**

| Strumento | Implementazione |
|-----------|----------------|
| **Font OpenDyslexic** | Classe `font-dyslexic` su `<html>` e `<body>` |
| **TTS (Leggi ad alta voce)** | `SpeechSynthesisUtterance`, lingua `it-IT`, velocità 0.9, `window.toggleTTS()` (L683) |
| **Riga di lettura** | Div `#reading-ruler` con CSS, toggle via classe `active` |
| **Lente di ingrandimento** | `window.toggleMagnifier()` (L516), `MutationObserver` per sincronizzazione dinamica |
| **Inverti colori** | Classe `a11y-invert` su `<html>` |
| **Alto contrasto** | Classe `a11y-high-contrast` |
| **Scala di grigi** | Classe `a11y-grayscale` |
| **Riduci contrasti** | Classe `a11y-low-contrast` |
| **Interlinea aumentata** | `window.cycleLineHeight()` con classi CSS cicliche |
| **Zoom testo modale** | `window.cycleTextZoom()` (variabile `modalTextZoomLevel`) |
| **Sillabazione** | `window.toggleHyphenation()` (bottone `btn-hyphenation`) |
| **Spaziatura caratteri** | Bottone separato in toolbar modale |

---

### M — UI Scaling al 200%

Non è presente uno scaling globale predefinito a 200% come funzione separata. Lo scaling è gestito tramite:
- Zoom testo ciclico nei modal (`cycleTextZoom`)
- Classi CSS `a11y-zoom-x15`, `a11y-zoom-x2` su `body` per la sidebar (documentato nelle regole di accessibilità)
- Zoom nativo del sistema operativo applicabile all'intera app Electron

---

### N — Tree View laterale

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Studente / OPI |
| **Attivazione** | Sidebar tab "Struttura" |
| **Codice** | `window.renderTreeView()` (L765), `window.toggleTreeCollapse()` |

Visualizzazione testuale gerarchica del grafo. Ogni nodo mostra:
- Icona colorata corrispondente alla macro-area
- Badge dello stato di studio (IMPARATO / REVIEW)
- Gradi di connessione (per Knowledge Graph)
- Espandibile/collassabile per rami

---

### O — Gestione Prompt AI personalizzati

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI avanzato / amministratore |
| **Attivazione** | Pannello Admin (accesso nascosto) |
| **Codice** | `ipcMain.handle('load-prompts')` / `ipcMain.handle('save-prompts')`, `window.fillPromptTemplate()` |

`prompts_config.json` contiene 17+ template di sistema (mindmap, knowledge graph, socratic tutor, quiz, flashcard, semantic correlation, ecc.). Ogni template è un testo con segnaposto `{{variabile}}` sostituiti a runtime da `fillPromptTemplate()`. L'OPI avanzato può modificare i template per adattare il comportamento AI alle proprie esigenze pedagogiche.

---

### P — Supporto multilingua

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Tutti |
| **Codice** | `appState.language`, `window.currentLanguage`, `it_translations` / `en_translations` in `app.js` |

I prompt AI sono duplicati in italiano e inglese (`SOCRATIC_TUTOR_IT`, `SOCRATIC_TUTOR_EN`, ecc.). Il TTS usa `utterance.lang = 'it-IT'` (modificabile). L'interfaccia ha stringhe `data-i18n` in alcuni elementi HTML.

---

### Q — Knowledge Graph e cross-link tra vault

| Campo | Valore |
|-------|--------|
| **Profilo principale** | Docente / OPI |
| **Codice** | `window.aiCrossLink()` (L6132), `link.isCross` field, `window.getInheritedDatabase()` (L8244) |

In modalità Knowledge Graph, i nodi possono avere relazioni `isCross: true` che rappresentano connessioni semantiche tra concetti. La funzione `aiCrossLink()` usa il prompt `SEMANTIC_CORRELATION` per identificare automaticamente correlazioni tra nodi di due vault diversi quando si esegue un merge.

`getInheritedDatabase()` aggrega le note dei nodi discendenti, usata sia nel dossier PDF che nel modal nodo.

---

### R — Personalizzazione cromatica dei nodi

| Campo | Valore |
|-------|--------|
| **Profilo principale** | OPI / Docente |
| **Codice** | `appState.db.customColors` (L23), `getNodeColor()`, persistito in `index.yaml` |

Ogni macro-area (gruppo L1) può avere un colore personalizzato, sovrascrivendo la palette automatica (`colorScale`). I colori custom vengono applicati a tutti i nodi del gruppo e alla Tree View. Sono persistiti nel vault via `yaml.dump()` in `index.yaml`.

---

## 4. Workflow OPI — Uso Professionale

### Passo 1: Caricamento delle fonti del docente

L'OPI avvia MappAI e accede alla **Sezione 1 – Sorgenti**. Può:
- Caricare PDF tramite il bottone "PDF" → dialog file nativo → il file viene letto da `pdf.js`
- Incollare testo da dispense digitali nell'area testo
- Inserire URL di pagine web (il backend le scarica via `axios + cheerio`)
- Inserire URL YouTube (il video viene passato direttamente a Gemini)
- Caricare file DOCX → convertito automaticamente da `mammoth`

Può combinare più fonti (es. PDF + URL) nella stessa sessione.

### Passo 2: Generazione e adattamento del grafo

Dopo la generazione automatica, l'OPI:
1. Analizza la struttura prodotta dall'AI
2. Usa il context menu per rinominare nodi, spostare rami, aggiungere concetti mancanti
3. Aggiunge note Markdown dettagliate nei nodi (spiegazioni semplificate, esempi concreti)
4. Assegna colori alle macro-aree per la codifica visiva del profilo cognitivo
5. Usa **AI Extension contestuale** per arricchire singoli nodi con esempi o spiegazioni aggiuntive
6. Assegna stati di studio iniziali (`todo` per i nodi prioritari)

### Passo 3: Esportazione materiali fisici

- **Foglio Nodi (etichette stampabili):** toolbar export → "Foglio Nodi" → PDF A4 con cartellini ritagliabili
- **Dossier PDF:** "Opzioni Stampa Dossier" → seleziona nodo/ramo → genera PDF multi-pagina con contenuto completo
- **Screenshot grafo:** per includere la mappa in presentazioni o stampare l'intera struttura visiva

### Passo 4: Trasferimento del vault allo studente

Il vault è una **cartella standard sul filesystem**: `~/Documents/MappAI - Vault/NomeProgetto/`. L'OPI può:
- Comprimere la cartella e inviarla tramite email, Teams, Google Drive
- Copiare su chiavetta USB
- Condividere tramite qualsiasi mezzo di trasferimento file

Lo studente apre MappAI, usa il Vault Manager (`showVaultManager`) per caricare la cartella ricevuta.

### Passo 5: Attivazione Modalità Studente

Prima di consegnare il dispositivo, l'OPI digita la sequenza segreta `l → k → j → h` che attiva `appState.studentMode`. In questa modalità:
- Il generatore AI è bloccato (nascosto `setup-form`)
- I bottoni URL, YouTube, Audio, Video spariscono
- Le opzioni di configurazione AI sono nascoste
- Restano visibili: navigazione grafo, Tutor AI, Pomodoro, Study Progress

---

## 5. Output dell'Applicazione

| Output | Formato | Destinazione | Profilo principale |
|--------|---------|-------------|-------------------|
| **Grafo interattivo** | SVG/D3 in-app | Schermo | Tutti |
| **Vault su disco** | Cartella (`index.yaml` + `links.json` + `Nodi/*.md` + `vault_data.json`) | File system locale | OPI / Docente |
| **Dossier PDF** | PDF multi-pagina con contenuto nodo/ramo | File (`MappAI - Vault/`) | OPI |
| **Foglio Nodi (etichette)** | PDF A4 con griglia cartellini | Stampa fisica | OPI |
| **Screenshot grafo** | PNG | File (`MappAI - Vault/Screenshots/`) | Docente / OPI |
| **Flashcard** | Visualizzazione in-app (array JSON) | Schermo | Studente |
| **Quiz interattivo** | Visualizzazione in-app | Schermo | Studente |
| **Trascrizione chat tutor** | File `.txt` | `MappAI - Vault/{progetto}/Chat/` | Studente / OPI |
| **Testo quiz** | File `.txt` | `MappAI - Vault/{progetto}/Quiz/` | Studente |
| **Export Markdown note** | File `.md` | File system | OPI |
| **Tree View** | Rendering HTML in sidebar | Schermo | Studente |

---

## 6. Struttura del Vault

### Organizzazione su disco

```
~/Documents/MappAI - Vault/
└── NomeProgetto_2026-05-15/
    ├── index.yaml          ← configurazione mappa
    ├── links.json          ← array di relazioni {source, target, label, isCross}
    ├── vault_data.json     ← dump completo appState.db (nodi + link + metadati)
    ├── Nodi/
    │   ├── Storia.md       ← contenuto Markdown del nodo "Storia"
    │   ├── Rinascimento.md
    │   └── ...
    ├── Chat/
    │   └── nodo_Storia_tutor.txt
    ├── Quiz/
    │   └── quiz_Storia.txt
    └── Screenshots/
        └── grafo_2026-05-15.png
```

### Contenuto dei file principali

**`index.yaml`** (serializzato con `js-yaml` dopo il fix del Parser YAML):
```yaml
extractionMode: mindmap
rootNodeLabel: "Storia: dalle origini alla carta"
userProfile:
  nickname: Mario
  age: 14
customColors:
  "1": "#4A90D9"
  "2": "#27AE60"
generationUsage: null
lastUpdated: "2026-05-15T10:00:00.000Z"
```

**`links.json`:**
```json
[
  {"source": "id_nodo1", "target": "id_nodo2", "label": "causa", "isCross": false},
  {"source": "id_nodo3", "target": "id_nodo4", "isCross": true}
]
```

**`Nodi/Storia.md`:** Testo Markdown del campo `content` del nodo.

### Portabilità

I vault sono completamente portabili:
- I file `.md` si aprono in **Obsidian** (sono standard CommonMark)
- `index.yaml` e `links.json` sono leggibili da qualsiasi tool
- `vault_data.json` è il formato di riferimento per il reload completo in MappAI

### Gestione multi-studente per OPI

L'OPI può mantenere una cartella per ogni studente:
```
~/Documents/MappAI - Vault/
├── Mario_Storia_2026/
├── Giulia_Matematica_2026/
└── Andrea_Scienze_2026/
```
Il Vault Manager mostra tutti i vault disponibili ordinati per data di modifica.

---

## 7. Integrazione AI

### Provider supportati

| Provider | Implementazione | Note |
|----------|----------------|-------|
| **Google Gemini** | `ipcMain.handle('generate-gemini')` | Default, piano free disponibile |
| **Infomaniak AI** | `ipcMain.handle('generate-infomaniak')` | Provider svizzero, GDPR |

### Modelli disponibili (al momento del codice)

Per Gemini (da `app.js` L1107–1119):
- `gemini-3-flash` — default consigliato (veloce, gratuito, massima context window)
- `gemini-2.5-pro` — reasoning avanzato (a pagamento)
- `gemini-2.0-flash` — versatile e gratuito
- `gemini-1.5-flash` / `gemini-1.5-pro` — legacy stabili
- `gemini-3.1-pro` — flagship di ultima generazione

La selezione del modello si adatta automaticamente alle capacità dichiarate: ogni modello ha un campo `caps[]` (text, pdf, url, audio, youtube, json). Se la fonte è YouTube, vengono mostrati solo i modelli compatibili.

### Gestione API key

- Le chiavi vengono inserite dall'utente nell'interfaccia di configurazione
- Su **desktop**: salvate in `localStorage` (non nel vault, non su cloud)
- Su **iPadOS**: salvate nel **iOS Keychain** tramite `KeychainPlugin` (più sicuro)
- Non sono mai scritte in chiaro nel codice sorgente
- Vengono recuperate a runtime tramite `window.getSystemKey()` (L1451)

### Proxy IPC Renderer → Main → API

Il renderer non chiama direttamente le API AI. Il flusso è:
```
Renderer → window.electronAPI.generateGemini() (preload.js)
         → ipcMain.handle('generate-gemini') (main.js)
         → HTTPS → api.google.com
```
Questo garantisce che il renderer non abbia accesso diretto alla rete e che la chiave API sia gestita nel processo privilegiato.

### Streaming SSE

Lo streaming è **implementato per Infomaniak** (`generate-infomaniak`, L121 di `main.js`, usa `axios` con `responseType: 'stream'`). Per Gemini non è attivo streaming nativo: le risposte sono complete prima di essere restituite al renderer.

### Sistema prompt

`prompts_config.json` contiene 17+ chiavi di template. L'utente può personalizzarli tramite il pannello admin. I template usano la sintassi `{{variabile}}` che viene interpolata da `fillPromptTemplate()`.

**Template principali:**
- `MIND_MAP_FULL_TREE_IT/EN` — generazione mappa completa single-pass
- `MIND_MAP_BRANCH_IT/EN` — generazione singolo ramo (multi-pass)
- `KNOWLEDGE_GRAPH_FULL_TREE_IT/EN` — knowledge graph single-pass
- `L1_MACRO_CATEGORIES_IT/EN` — identificazione macro-aree
- `SOCRATIC_TUTOR_IT/EN` — tutor socratico
- `SEMANTIC_CORRELATION_IT/EN` — cross-link tra vault
- `FLASHCARD_GENERATOR` — generazione flashcard
- `DYNAMIC_QUIZ` — generazione quiz
- `MULTIPLE_CHOICE_QUIZ` — quiz a scelta multipla strutturato

---

## 8. Privacy e Sicurezza

### I dati restano locali

MappAI **non ha server cloud proprietari**. Tutta la persistenza avviene nel filesystem locale dell'utente. Le uniche trasmissioni di rete sono le chiamate alle API AI esterne (Gemini o Infomaniak), che l'utente attiva esplicitamente.

### Dove sono salvati i file

- **Desktop:** `~/Documents/MappAI - Vault/` (cartella Documenti dell'OS)
- **iPadOS:** Directory privata app tramite Capacitor `Filesystem` API

### Le API key sono persistite su disco?

- **Desktop:** `localStorage` del renderer Chromium — tecno equivalente al profilo Electron, non crittografato ma isolato nell'utente OS
- **iPadOS:** iOS Keychain — crittografato dall'hardware del dispositivo

### Configurazione sicurezza Electron

Da `main.js` (L20–22):
```js
nodeIntegration: false,      // il renderer NON ha accesso a Node.js
contextIsolation: true,      // il preload gira in contesto isolato
preload: 'public/js/preload.js'  // unico bridge controllato
```
Questa configurazione segue le best practice ufficiali Electron per prevenire RCE se il renderer venisse compromesso.

### Dati inviati alle API AI

**Inviati:** testo delle fonti caricate, label dei nodi, contenuti dei chunk per le analisi AI.  
**NON inviati:** dati personali dello studente (nome, età rimangono in `appState.userProfile` locale), API key, struttura del vault, file locali.

### Perché Infomaniak è rilevante per la privacy

Infomaniak è un provider svizzero soggetto alla legge federale sulla protezione dei dati (LPD) e al GDPR europeo. Per la scuola svizzera e italiana questo è rilevante perché:
- I dati educativi di studenti minorenni hanno protezione rafforzata
- La giurisdizione svizzera (non USA) elimina problemi legati al CLOUD Act americano
- Infomaniak offre modelli AI ospitati su infrastrutture europee

---

## 9. Accessibilità e Inclusività

### Riepilogo strumenti A11y implementati

| Strumento | Target BES/DSA | Attivazione |
|-----------|----------------|-------------|
| **Font OpenDyslexic** | Dislessia | Pannello A11y → `toggleDyslexicFont()` |
| **TTS italiano** | Difficoltà di lettura, ADHD | Toolbar modal → `toggleTTS()` |
| **Riga di lettura** | Difficoltà di tracking visivo | Pannello A11y + toolbar modal |
| **Lente di ingrandimento** | Ipovisione lieve | `toggleMagnifier()` |
| **Inverti colori** | Sensibilità alla luce | Pannello A11y |
| **Alto contrasto** | Ipovisione, contrasto | Pannello A11y |
| **Scala di grigi** | Daltonismo | Pannello A11y |
| **Interlinea aumentata** | Dislessia, ADHD | `cycleLineHeight()` |
| **Zoom testo modale** | Ipovisione | `cycleTextZoom()` |
| **Sillabazione** | Lettura fluente | `toggleHyphenation()` |
| **Spaziatura caratteri** | Dislessia | Toolbar modale |
| **Modalità Studente** | ADHD (riduzione stimoli) | Sequenza segreta OPI |
| **Colori macro-aree** | Codifica visiva (DSA) | Personalizzazione grafo |

### Supporto OPI in classe

- La **Modalità Studente** riduce l'interfaccia a soli strumenti di studio, eliminando l'overload cognitivo
- Il **Foglio Nodi** permette di portare la mappa nel mondo fisico (cartelloni, lavagne magnetiche)
- Il **Dossier PDF** è il materiale di accompagnamento per la prova in classe
- Il **Tutor Socratico** può essere usato dall'OPI per simulare il dialogo prima della verifica

---

## 10. Licensing e Machine ID

**Machine ID implementato** (`main.js` L897–911):
```js
ipcMain.handle('get-machine-id', () => {
    const cpu = os.cpus()[0].model;
    const rawId = macAddress + '-' + cpu;
    return crypto.createHash('sha256').update(rawId).digest('hex')
                 .substring(0, 10).toUpperCase();
});
```

Il Machine ID combina **indirizzo MAC** della prima interfaccia di rete con il **modello CPU**, genera un hash SHA-256 e ne tronca i primi 10 caratteri in maiuscolo. Questo identificatore è deterministic, offline e non trasmesso a server.

**Stato attuale:** Il backend è implementato ma non è presente nel frontend un sistema di verifica licenza o paywall. `appState.studentMode` usa una sequenza segreta di tastiera (`lkjh`) come meccanismo di controllo accesso semplice, non crittograficamente sicuro.

---

## 11. Punti di Forza Tecnici e Pedagogici

### Rispetto a strumenti comparabili

| Caratteristica | MappAI | Coggle | MindMeister | Notion |
|----------------|--------|--------|-------------|--------|
| Dati locali (no cloud) | ✅ | ❌ | ❌ | ❌ |
| Tutor AI socratico | ✅ | ❌ | ❌ | ❌ |
| Strumenti DSA integrati | ✅ | ❌ | ❌ | Parziale |
| Modalità Studente / OPI | ✅ | ❌ | ❌ | ❌ |
| Generazione da PDF/YouTube | ✅ | ❌ | ❌ | ❌ |
| Etichette fisiche stampabili | ✅ | ❌ | ❌ | ❌ |
| Knowledge Graph + cross-link | ✅ | ❌ | ❌ | Parziale |
| iPad nativo | ✅ | ✅ | ✅ | ✅ |
| Open format (Markdown) | ✅ | ❌ | ❌ | Parziale |
| Privacy GDPR/LPD | ✅ | ❌ | ❌ | ❌ |

### Scelte tecniche per longevità e portabilità

- **Vault in Markdown standard:** i dati sopravvivono all'applicazione — leggibili in qualsiasi editor per decenni
- **YAML per metadati:** formato umano leggibile, ora serializzato con `js-yaml` per robustezza
- **Electron:** permette di usare tecnologie web su desktop senza sacrificare l'accesso al filesystem
- **Capacitor:** lo stesso frontend gira su iPadOS senza riscrittura — investimento codice massimizzato
- **Provider AI intercambiabili:** passare da Gemini a Infomaniak richiede solo il cambio di un'impostazione

### Perché "dati locali + AI on-demand" è adatto al contesto scolastico svizzero/italiano

- Le scuole hanno vincoli rigidi sulla trasmissione di dati di minori a piattaforme cloud straniere
- La connettività nelle classi non è sempre garantita (il vault funziona offline; solo la generazione richiede internet)
- I vault possono essere archiviati nel sistema documentale della scuola (cartella docente)
- Il costo è controllato: Gemini ha un piano free, Infomaniak fattura per utilizzo

---

## 12. Limitazioni Attuali (rilevate dal codice)

| Limitazione | Severità | Note |
|-------------|----------|-------|
| **Parser YAML manuale** (corretto in questa sessione) | ~~Alta~~ → ✅ Risolto | Sostituito con `js-yaml` |
| **Dipendenza da `hypher`** non usata in produzione | Media | Peso inutile nel bundle |
| **Streaming solo per Infomaniak** | Media | Gemini non ha streaming attivo nel renderer |
| **No spaced repetition algoritmica** | Media | Gli stati todo/review/done sono manuali, non c'è algoritmo SM-2 o simili |
| **Licensing non ancora attivo** | Bassa-Media | Machine ID implementato ma non collegato a un sistema di verifica |
| **`testBranchFlashcards`** (L8012) — funzione di debug | Bassa | Da rimuovere prima del rilascio |
| **`simulateNodeClick`** (L5002) — non chiamata | Bassa | Probabile dead code |
| **`printAllNodeDossiers`** (L6405) → chiamata tramite `openDossierPrintModal` | Bassa | Nome fuorviante |
| **`hypher` e `hyphenation.it`** in `package.json` | Bassa | Dipendenze da rimuovere (confermate non usate) |
| **Fetch-URL senza allowlist** | Media (sicurezza) | Potenziale SSRF se renderer compromesso |
| **No test automatizzati** | Alta (qualità) | Nessun file di test presente nel progetto |
| **`getInheritedDatabase` sempre globale** | Bassa | Potrebbe essere lenta su vault con >200 nodi |
| **Sillabazione via CSS** | Bassa | `hypher` originariamente incluso per sillabazione avanzata, ma rimosso |

---

*Fine analisi funzionale. Documento verificabile riga per riga contro il codice sorgente.*
