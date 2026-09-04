# CLAUDE.md — MappAI Swiss Edition
> Documento di briefing per Claude Code.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Ultimo aggiornamento: **21 agosto 2026** — questo file è stato **POTATO**: da 5196 righe
> a poche centinaia. Prima era un diario giorno-per-giorno che entrava in contesto a OGNI
> sessione, cioè ~50.000 token pagati prima di qualunque domanda. Ora resta solo ciò che
> serve SEMPRE: che cos'è l'app, com'è fatta, le regole di sviluppo, i puntatori.

## 📍 I QUATTRO DOCUMENTI — chi risponde a che cosa

| Documento | Risponde a | Quando leggerlo |
|---|---|---|
| **questo file** | «Com'è fatta l'app? Che regole seguo?» | sempre in contesto, automatico |
| **[`docs/HANDOFF.md`](docs/HANDOFF.md)** | «Che cosa c'è in `main` ADESSO? Che cosa è acceso, con quale interruttore? Che cosa manca? Come si verifica?» | **PUNTO DI RIPRESA: leggilo per primo, dall'alto**, prima di toccare qualunque cosa |
| **[`GUIDA-ARCHITETTO.md`](GUIDA-ARCHITETTO.md)** | «Quali sono gli invarianti numerati? Le trappole permanenti? Come si scrive un piano qui?» | prima di progettare una feature (`/architetto` la legge da sé) |
| **[`docs/DIARIO-2026.md`](docs/DIARIO-2026.md)** | «PERCHÉ è stato deciso così? Che cosa si è misurato quel giorno?» | a domanda, con `grep` o `/graphify query` |

**Gerarchia in caso di contraddizione:** HANDOFF.md > GUIDA-ARCHITETTO.md > questo file > DIARIO.
Il diario racconta com'erano le cose il giorno in cui è stato scritto; non è manutenuto.

Gli altri `docs/HANDOFF-*.md` (console, manifesto, console-bento, crea-materiali,
maniglia-layout) sono **diari tematici**: stesso statuto del DIARIO, si leggono per il perché
di un filone.

## 🧭 COME CERCARE SENZA BRUCIARE CONTESTO
> Il metodo completo, coi comandi e le trappole, sta in
> **[`docs/COME-USARE-GRAPHIFY.md`](docs/COME-USARE-GRAPHIFY.md)**. Qui il riassunto.
0. **Se il rilievo nomina qualcosa che si LEGGE a schermo** (il titolo di un modale, un'etichetta,
   un messaggio) → **`npm run dove -- "quel testo"`**. Un comando, ~1 s: dà file, riga vera e
   **nome della funzione**, poi interroga il grafo da solo. È il passo 1 e il 2 insieme, ed è la
   strada NORMALE — il grafo indicizza simboli, chi usa l'app ricorda parole.
1. **Domanda sul codice senza un testo a schermo** («dove sta X», «che cosa chiama Y») →
   `graphify query "SIMBOLO"` sul grafo già costruito (`graphify-out/graph.json`, 7983 nodi,
   zero chiamate AI).
2. Il grafo dice **quale file e quale simbolo**; le sue RIGHE invecchiano → `grep -n "function <simbolo>"`
   per la riga vera, poi `sed -n 'A,Bp'` su **≤40 righe**. Mai finestre da 100+ righe.
   L'interprete non è nel PATH: `P=$(cat graphify-out/.graphify_python)` → `$P -m graphify query "..."`.
3. `grep` solo per conferme puntuali, mai a tappeto.
4. Dopo modifiche grosse: `/graphify . --update` **mai nudo** (scansionerebbe 1271 file e
   rifarebbe l'estrazione semantica su piani vecchi e asset) — aggiornamento strutturale sui
   soli file toccati.

---

## 1. CHE COS'È MAPPAI

MappAI è un'applicazione desktop **Electron** per il supporto allo studio,
con focus su studenti **BES/DSA** e professioni educative (OPI — Operatori
per l'Inclusione). Permette di generare mappe mentali e knowledge graph
da fonti testuali (PDF, URL, YouTube, DOCX, testo libero) usando AI.

**Utenti target:**
- Studenti BES/DSA (dislessia, ADHD, ipovisione)
- Docenti di materia
- OPI (Operatori per l'Inclusione) — figura professionale che media
  tra docente e studente, deve padroneggiare i contenuti disciplinari

**Piattaforme:** macOS (Apple Silicon + Intel), Windows, Linux, iPadOS
(via Capacitor — branch separato, non attivo nel repo principale)

**Sito:** https://www.insegnai.ch/mappai.html

---

## 2. ARCHITETTURA

### Stack tecnologico
- **Electron 30** — desktop app
- **Node.js** — main process (`main.js`)
- **Vanilla JS** — renderer process (NO React, NO Vue, NO bundler)
- **D3.js v7** — grafo interattivo
- **Tailwind CSS** — via CDN runtime (play mode), no compilazione
- **jsPDF** — export PDF
- **PDF.js** — lettura PDF
- **KaTeX** — rendering formule matematiche (aggiunto di recente)
- **Axios** — chiamate HTTP in main process

### Struttura cartelle
```
MappAI/
├── main.js              ← Electron main process (964 righe)
├── public/
│   ├── index.html       ← Entry point UI (3.245+ righe)
│   ├── css/
│   │   └── style.css    ← CSS principale (2.724 righe)
│   ├── js/
│   │   ├── app.js       ← CORE (~2.630 righe, era 16.066 — −83,6%): bootstrap,
│   │   │                   appState, provider AI, fetchModelAPI + token/cost,
│   │   │                   sources upload, startGeneration (router), system
│   │   │                   instructions, getDescendantIds/getInheritedDatabase, init
│   │   │  ── Moduli estratti dal monolite (luglio 2026, branch
│   │   │     refactor/app-js-decomposition — caricati DOPO app.js,
│   │   │     scope lessicale globale condiviso, slice byte-identical;
│   │   │     debug-run Electron dopo ogni batch):
│   │   ├── mappai-ui-modals.js      ← toast/alert/prompt custom, MODEL_KB, select modelli, tree view
│   │   ├── mappai-d3-render.js      ← motore render D3 (initD3Visualization, renderGraph+patch, tick, drag)
│   │   ├── mappai-ui-canvas.js      ← showLoadingOverlay, handleNodeClick, source modal, layout, import/export
│   │   ├── mappai-storage-lang.js   ← StorageManager (autosave), progetti salvati, changeLanguage
│   │   ├── mappai-generation-support.js ← crosslink markers, dedup, JSONL, flags, Phase4/5, enrich, validate/split L1
│   │   ├── mappai-pomodoro.js       ← timer Pomodoro + updateStudyStats
│   │   ├── mappai-user-profile.js   ← profili utente (modale, salva, reset)
│   │   ├── mappai-search-finder.js  ← map finder + super finder
│   │   ├── mappai-vault-manager.js  ← lista vault, directLoadVault
│   │   ├── mappai-contextual-ai.js  ← Espandi con AI (testo/PDF → nodi)
│   │   ├── mappai-kg-extraction.js  ← motore KG (single-pass/Community/multi-pass)
│   │   ├── mappai-mm-extraction.js  ← motore MM (iterativa/multi-pass)
│   │   ├── mappai-vault-io.js       ← saveMapVault/loadMapVault/import/demo
│   │   ├── mappai-merge-validate.js ← merge grafi + aiCrossLink + validate link
│   │   ├── mappai-print-dossier.js  ← stampa note MD, etichette, dossier PDF
│   │   ├── mappai-context-menu.js   ← lightbox, menu contestuale, touch
│   │   ├── mappai-edit-modal.js     ← modale edit nodo (editTarget condiviso)
│   │   ├── mappai-flashcards-sr.js  ← spaced repetition, flashcard/quiz nodo
│   │   ├── mappai-ai-tutor.js       ← tutor AI stateful (tutorState condiviso)
│   │   ├── mappai-study-session.js  ← config studio, player, punteggi, report
│   │   ├── mappai-a11y.js           ← sillabazione, interlinea, zoom testo
│   │   ├── storageAdapter.js  ← Storage Electron/Capacitor
│   │   ├── admin_prompts.js   ← Gestione prompt templates
│   │   ├── infomaniak_bridge.js ← Bridge API Infomaniak
│   │   ├── preload.js         ← Electron contextBridge
│   │   ├── mappai-latex.js    ← KaTeX rendering
│   │   ├── mappai-lenses.js   ← Extraction Lenses
│   │   ├── mappai-timeline.js ← Timeline cronologica
│   │   ├── mappai-glossary.js ← Glossario (nascosto)
│   │   ├── mappai-quiz-print.js ← Stampa quiz/flashcard
│   │   ├── mappai-structure-analyzer.js ← Analisi strutturale deterministica
│   │   ├── mappai-node-styling.js ← Ruolo strutturale nodi (keystone, bridge)
│   │   ├── mappai-node-merge.js   ← Fondi con... / Cambia Link
│   │   └── dev-console-metrics.js ← Toolkit metriche dev console (MappAIMetrics)
│   ├── traduzioni/
│   │   ├── it_translations.js
│   │   └── en_translations.js
│   └── prompts_default.json   ← Template AI (caricati da admin_prompts.js)
└── prompts_config.json        ← Config AI attiva
```

### Pattern architetturale
- Tutti i file JS usano **script globali** (`window.*`) — NO ES modules
- I nuovi file (`mappai-*.js`) vengono caricati DOPO `app.js` in `index.html`
- `app.js` espone funzioni come `window.cleanLabel`, `window.getNodeColor`,
  `window.showToast`, `window.showLoadingOverlay` — usate dai nuovi moduli
- `appState` è l'oggetto globale di stato — i nodi sono in `appState.db.nodes`
  (MAI in `appState.nodes` direttamente)
- ⚠️ **`appState` è `let` (NON `var`)** → NON è su `window`. Da moduli esterni
  usare il pattern di `dev-console-metrics.js`:
  ```js
  function _getAppState() {
      try { return (typeof appState !== 'undefined') ? appState : window.appState; }
      catch (e) { return window.appState; }
  }
  ```

---

## 3. PROVIDERS AI

MappAI supporta due provider AI selezionabili dall'utente:

### Google (Gemini)
- Modelli: gemini-2.0-flash, gemini-flash-lite-latest, gemini-pro, ecc.
- Context window: 1M-2M token
- Chiamata: `electronAPI.generateGemini({ apiKey, payload, model })`
- Credenziali: `localStorage.getItem('gemini_api_key')`
- Formato: Gemini native (`contents`, `systemInstruction`, `generationConfig`)
- Supporta: `responseMimeType: "application/json"`, `responseSchema`

### Infomaniak (provider svizzero — GDPR, dati educativi)
- Modelli disponibili su https://www.infomaniak.com/en/hosting/ai-services/open-source-models:
  - **Apertus-70B-Instruct-2509** — modello svizzero (ETH/EPFL), 65.536 token max input, NO function calling
  - **google/gemma-4-31B-it** — 100.000 token max input, function calling nativo
  - **Qwen/Qwen3.5-122B** — 200.000 token max input
  - **moonshotai/Kimi-K2.6** — 256.000 token max input
- Chiamata: `electronAPI.generateInfomaniak({ apiKey, payload, productId })`
- Credenziali: `localStorage.getItem('infomaniak_api_key')` + `productId`
- Bridge: `window.InfomaniakBridge.translatePayload(geminiPayload, model)`
  converte il formato Gemini → OpenAI-compatible
- ⚠️ `responseMimeType: "application/json"` NON supportato nativamente —
  il bridge lo converte in un reminder testuale che altera il contesto
- ⚠️ `responseSchema` causa risposta vuota (0 caratteri) su Kimi-K2.6 — **rimosso
  dalla Fase 1 e Fase 3 su Infomaniak** (4 giugno 2026). Su Google funziona.
- ⚠️ `temperature` è hardcoded a 0.3 nel bridge (ignora il valore del payload)
- ⚠️ Streaming SSE obbligatorio (per bypassare Gateway Timeout)

### Pattern di chiamata standard
```javascript
const apiKey = window.getSystemKey(); // legge la chiave dal provider attivo
if (!apiKey) { showToast("Inserisci API Key", "error"); return; }
const response = await window.fetchModelAPI(payload, apiKey);
const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
```

---

## 4. STATO DELL'APP — appState

```javascript
const appState = {
    sources: [],          // fonti caricate dall'utente
    db: {
        nodes: [],        // ← SEMPRE QUI, mai appState.nodes
        links: [],
        sourcesDict: {},  // { [nodeId]: [{title, source, text}] }
        studySets: [],    // quiz e flashcard generati
        customColors: {},
    },
    aiProvider: 'google'|'infomaniak',
    extractionMode: 'mindmap'|'kg',
    rootNodeLabel: '',    // titolo progetto
    focusTopic: '',       // testo focus + lenses (costruito da updateFocusFromLenses)
    nodes: undefined,     // ← NON ESISTE — usa appState.db.nodes
}
```

---

## 5. FUNZIONALITÀ PRINCIPALI

### Modalità di generazione
1. **MindMap** — mappa gerarchica, multi-pass
   - Fase 1: generazione macro-aree L1
   - Fase 2: espansione rami L2-L5
   - Template: `L1_MACRO_CATEGORIES_IT`, `MIND_MAP_BRANCH_IT`

2. **Knowledge Graph (KG)** — grafo relazionale
   - Entità + relazioni, no gerarchia root obbligatoria
   - Template: `KG_SINGLE_PASS_IT`, `KG_MULTI_PASS_IT`
   - ⚠️ `rootNodeLabel` può essere vuoto — NON bloccare la generazione

### Vault
- Salvato in: `~/Documents/MappAI - Vault/{vaultName}/`
- Struttura: `index.yaml`, `links.json`, `Nodi/*.md`, `Allegati/`
- Compatibile con Obsidian (Markdown con frontmatter YAML)

#### Retrocompatibilità e integrità del vault (DAL Protocol)
Ogni modifica alla logica di persistenza DEVE rispettare questi fallback:

- **`links.json` legacy**: se manca la proprietà `rel`, impostare di default
  `rel = "include"` — evita link vuoti sul canvas per vault creati prima della
  funzione linking words.
- **Fonti nei nodi**: il parser deve gestire entrambi i formati:
  - Nuovo: `- [Titolo | Sorgente]: Testo`
  - Vecchio: `- [Titolo]: Testo` → valorizzare `source = "Originale"` se assente
- **Allegati multimediali**: NON salvare mai percorsi assoluti locali
  (es. `/Users/giacomo/...`) nei markdown. Usare sempre percorsi relativi
  alla cartella del Vault (`../Allegati/nome_file`).

---

## 6. FILE NUOVI AGGIUNTI (sessione 28-30 maggio 2026)

Questi file sono stati creati durante una sessione di sviluppo e vanno
caricati in `index.html` DOPO `app.js` e PRIMA di `admin_prompts.js`:

### `mappai-latex.js`
- KaTeX rendering per formule matematiche
- MutationObserver su `#source-modal-body` per trigger automatico
- Usa delimitatori `$$`, `$`, `\[`, `\(`

### `mappai-lenses.js`
- Sistema "Extraction Lenses" — filtri semantici per guidare l'AI
- `window.MAPPAI_LENSES` — definizione di 13 lenses
- `window.MAPPAI_PRESETS` — preset disciplinari (Storia, Scienze, ecc.)
- `window.activeLenses` — Set delle lenses attive
- `window.buildLensesPrompt()` — costruisce il testo da iniettare nel prompt
- `window.updateFocusFromLenses()` — aggiorna `appState.focusTopic`
- UI: pannello collassabile in `#lenses-panel` vicino al campo `#focus-input`
- ⚠️ Il bottone mostra/nascondi DEVE avere `type="button"` (è dentro un form)

### `mappai-timeline.js`
- Vista timeline cronologica generata con AI
- `window._getTimelineProjectName()` — risolve il nome progetto dinamicamente:
  `appState.rootNodeLabel` → nodo level 0 → `'MappAI'`. Funziona anche su KG
  dove il nodo L0 spesso non esiste.
- `window.openTimelineGeneratorModal()` — modale configurazione con 2 radio:
  **Compatta** (data + label + categoria) e **Con contesto** (+ max 3 frasi dalla fonte)
- `window.generateTimelineWithAI()` — chiama AI, deduplica eventi (chiave: `anno +
  evento normalizzato`), passa `opts.showContext` a `openTimelineView`
- `window.openTimelineView(aiData, mapName, opts)` — renderizza HTML stampabile
- `window._renderTimeline(events, mapName, opts)` — genera HTML finale;
  blocco "CONTESTO DALLA FONTE" condizionale su `opts.showContext`
- Bottone nel menu dropdown "Stampa dossier" → "Crea Timeline"
- ⚠️ Modal costruito via JS: usa classi `.pm-*` da `index.html` + Lucide icons;
  chiamare `window.safeCreateIcons()` dopo `document.body.appendChild(modal)`

### `mappai-glossary.js`
- Glossario termini disciplinari
- **NASCOSTO** — bottone `#card-btn-glossary` ha classe `hidden`
- Funzione `window.openGlossaryView()` esiste ma non è accessibile dalla UI

### `mappai-quiz-print.js`
- Stampa quiz e flashcard come HTML stampabile
- `window.printQuizSet(setId)` — quiz con risposte + foglio verifica
- `window.printFlashcardSet(setId)` — flashcard tagliate 2 colonne
- `window.printAllStudySets()` — stampa tutti i set
- Bottone "stampa" aggiunto a ogni set in `renderStudySets`

### Feature: Dropdown famiglie + Link Bidirezionali (sessione 3 giugno 2026, sera)
Implementate direttamente in `app.js` e `index.html` — nessun nuovo file JS.

#### `window.showLinkFamilyPrompt(srcLabel, tgtLabel, callback)` — app.js ~L.565
Sostituisce il vecchio `showPrompt` nel flusso di creazione manuale link (`linkingState`, ~L.6139).
- Modale `#link-family-modal` (in `index.html`) con lista verticale delle 7 famiglie `EDGE_FAMILIES`
  (colorate, icona + etichetta). Clic su famiglia pre-compila l'input con verbo default
  (`FAMILY_DEFAULT_REL`: causa / richiede / precede / fa parte di / regola / si oppone a).
- Toggle **bidirezionale** (pulsante ↔) — se attivo, passa `bidir=true` al callback.
- Signature callback: `(rel: string, bidir: boolean) → void`.
- `FAMILY_DEFAULT_REL` — costante locale, non esposta su `window`.

#### Link bidirezionali — modello dati e rendering
- **Modello**: `{ source, target, rel, bidirectional: true }` — flag opzionale su `appState.db.links`.
- **`<line>` → `<path>`**: tutti i link sono ora elementi `<path>` (non più `<line>`).
  ⚠️ Il selector `'line.link'` non funziona — usare sempre `'.link'`.
  (già aggiornato in Lente Relazioni ~L.5638 e nel reset lente ~L.5590).
- **Curva Bezier**: link bidirezionali disegnati con `M x1,y1 Q cx,cy x2,y2`,
  offset perpendicolare 40px per distinguerli visivamente dai link monodirezionali.
- **Marker SVG**: aggiunti `arrowhead-rev` e `arrowhead-rev-{famiglia}` con
  `orient="auto-start-reverse"` — puntano verso la sorgente come `marker-start`.
  La Lente Relazioni li applica automaticamente sui link bidirezionali attivi.
- **`tick()`**: usa attributo `d` (path) invece di x1/y1/x2/y2.
  Label posizionata sul midpoint visivo della curva Bezier.

### `mappai-node-merge.js` (NUOVO — sessione 3 giugno 2026; fix group — sera)
- Operazioni di editing strutturale del grafo: **Fondi con...** e **Cambia Link**
- Caricato in `index.html` dopo `mappai-structure-analyzer.js`
- **Fondi con... (`window.mergeState` + `window.executeMerge(A, B)`):**
  - Merge nodo A in nodo B: i figli di A diventano figli di B, A viene eliminato
  - Link uscenti da A → rimappati a B; link entranti in A → rimappati a B
  - Self-loop e duplicati rimossi; `sourcesDict` e `customColors` uniti
  - Livelli del sottoalbero di B ricalcolati ricorsivamente (solo MindMap)
  - **Group propagato** a tutto il sottoalbero di B via `_recalcGroups` (step 7b):
    i figli ex-A mantenevano il vecchio group causando collisioni colore con altri L1
  - Disponibile in entrambe le modalità (MM e KG); visibile anche in studentMode
  - ⚠️ Rischio KG: link paralleli con `rel` diversi → dedup silenzioso (tiene il primo)
- **Cambia Link (`window.relinkState` + `window.executeRelink(A, newParent, rel)`):**
  - Riassegna il genitore di A in MindMap: rimuove tutti i link `target=A`, aggiunge
    il nuovo link `source=newParent, target=A` con relazione scelta da `showLinkFamilyPrompt`
  - Livelli di A e del suo sottoalbero ricalcolati dopo lo spostamento
  - **Group aggiornato** dopo lo spostamento:
    - Se `newParent.level === 0` (A diventa L1): assegna un group intero libero via
      `_nextFreeGroup()`, migra eventuale `customColors` al nuovo group
    - Se A rimane intermedio: eredita `newParent.group`
    - `_recalcGroups(A.id, newGroup, ...)` propaga il group all'intero sottoalbero
  - **Solo MindMap** — voce non appare in KG mode (condizione `extractionMode !== 'kg'`)
  - Visibile anche in studentMode
- Helper privati: `_recalcLevels`, `_recalcGroups`, `_nextFreeGroup`
- Entrambe le funzioni usano il banner `#mode-hint` e si cancellano con ESC o click su sfondo
- Pattern di stato: `{ active: bool, sourceNode: nodeObj }` — stesso pattern di `linkingState`

### `mappai-structure-analyzer.js` (NUOVO — sessione 1 giugno 2026)
- Analisi strutturale DETERMINISTICA del grafo (zero AI calls). Base del
  Piano 1 "modalità Studente" (vedi `ROADMAP_graphify.md`).
- Caricato in `index.html` dopo `mappai-quiz-print.js`.
- Namespace: `window.MappAIStructureAnalyzer`. Uso rapido da console:
  `MappAIStructureAnalyzer.analyzeCurrentMap()` → `{ suggestions, stats }`.
- **Auto-adattivo su due assi** (design chiave):
  - MODALITÀ (`mindmap`/`kg`, da `appState.extractionMode` o `detectMode`):
    le analisi gerarchiche (rami non sviluppati, leaf isolation) girano solo
    sulle MindMap; sui KG il `level` non è semantico.
  - DENSITÀ (`tree-like`/`networked`, soglia `lowConnectivityRatio=1.1`):
    Tarjan (ponti/articolazioni) e betweenness degenerano su un albero (ogni
    arco è un ponte) → attivi solo su grafi con cross-link.
- Analisi: `analyzeGodNodes`, `detectMisplacedNodes`, `detectUnderutilizedClusters`,
  `detectLeafIsolation` (per-livello), `detectLowConnectivity`,
  `detectStructuralKeystones` (Tarjan), `detectMeaningHubs` (betweenness Brandes).
- `stats` include `density`, `mode`, `topology` — usabili come diagnostica del
  motore di generazione (un KG con density < 1.5 è "ad albero", poco utile).

---

## 7. MODELLI INFOMANIAK — VALUTAZIONE (ARCHIVIATO 10 giugno 2026)

> ⚠️ **Lavoro in pausa.** Da questa sessione lo sviluppo si concentra su
> **Google Gemini**. Tutta la valutazione dettagliata di Apertus 70B e
> Mistral Small 119B (benchmark run-by-run, i 5 fix Apertus, la regola
> "Apertus NON regge few-shot JSON in-context", limiti strutturali Mistral)
> è stata archiviata in
> [`docs/model-evaluation/apertus-mistral-infomaniak-evaluation.md`](../docs/model-evaluation/apertus-mistral-infomaniak-evaluation.md)
> per non perdere le conoscenze in vista di una ripresa futura del lavoro
> su questi modelli.

### Raccomandazione per profilo (stato al momento dell'archiviazione)
| Modello | Profilo ottimale | MM | KG | Note |
|---------|-----------------|----|----|------|
| **Gemma-4 31B** | 4a Media, BES/DSA, scienze | ✅ | ⚠️ | Baseline stabile. Label puliti. KG scarso con lenti (anomalia token, vedi sotto). |
| **Mistral Small 119B** | Liceo, storia, doc lunghi | ⚠️ | ⚠️ | Inadatto a benchmark ripetibili — JSON spesso malformato. Dettagli nell'archivio. |
| **Kimi-K2.6** | Corpus lunghi, alta qualità | 🔬 in test | 🔬 | 256K context. Test completo da fare se si riprende il lavoro Infomaniak. |
| **Apertus 70B** | MM semplici (4a Media, BES/DSA) | ✅ | ❌ | PROMOSSO 5/6/26, poi sospeso — 5 fix, benchmark e limiti nell'archivio. |

### Anomalia ancora aperta: KG GEMMA + lenti → 37K token (atteso 65K)
Solo 13 nodi generati. Causa: `extractKnowledgeGraphSinglePass` con `focusTopic`
non vuoto potrebbe troncare il testo sorgente. Riguarda Infomaniak/Gemma — bassa
priorità mentre il focus è su Google. Vedere TODO punto 10 backlog se si riprende.

---

## 8. BUG NOTI E PROBLEMI APERTI

### ✅ Rimosso (21/7/26): template `MIND_MAP_BRANCH` — era codice morto nel pannello admin
**Sintomo:** il template `MIND_MAP_BRANCH_*` appariva nella tab MINDMAPS della dashboard
admin, ma modificarlo NON cambiava le mappe generate → ingannava docente/admin che lo edita.
**Causa:** la Fase 3 (espansione rami MM multi-pass) NON passa da
`fillPromptTemplate("MIND_MAP_BRANCH")`. Costruisce il prompt inline in
[mappai-mm-extraction.js:815](public/js/mappai-mm-extraction.js:815) oppure via
`buildBranchPromptJSONL` in
[mappai-generation-support.js:470](public/js/mappai-generation-support.js:470). Quei prompt
inline hanno feature che il template non esprimeva (catalogo rami fratelli, carta del ramo
ambito/desc/confini, rich-rel, formato JSONL anti-troncamento per Infomaniak) e il
token-budget validato (§11) è tarato su di essi. **Live via `fillPromptTemplate` restano
solo** `L1_MACRO_CATEGORIES` (Fase 1) e `MIND_MAP_FULL_TREE` (modalità iterativa).
**Decisione (utente):** cancellare, non marcare — "future use" illusorio (si ripartirebbe
dal prompt inline, più aggiornato); il template non era fonte di verità di nulla (le regole
di fedeltà vivono in `MM_FIDELITY_RULES_IT`); la storia resta in git.
**Cosa è stato tolto:** gli 8 variant `MIND_MAP_BRANCH_{IT,EN,_INFOMANIAK,_STUDENT…}` da
`prompts_config.json` + `public/prompts_default.json` (verificato zero consumatori a runtime);
`MIND_MAP_BRANCH` dalla categoria MINDMAPS e da `systemPromptsDescriptions` in
`admin_prompts.js`; chiave i18n orfana `admin_prompt_desc_branch` dai due dizionari.
Aggiornato il commento in `mappai-generation-support.js` (~L.540).

### 🟢→🟠 KG povero: causa template RISOLTA, causa C (Infomaniak) ISOLATA
**Sintomo originale:** KG a "stella" — densità ~1.1, 0 cross-link, 68% relazioni
generiche "correlato a". Grafo povero di spunti di ragionamento.
**Diagnosi (1 giugno 2026, con `mappai-structure-analyzer.js`):** due cause.
- **Causa A+B (template) — RISOLTA ✅:** `KNOWLEDGE_GRAPH_SINGLE_IT` chiedeva solo
  link concetto→hub (stella) e non tipizzava le relazioni. Riscritto con blocco
  "RELAZIONI — IL CUORE DEL GRAFO" (link laterali concetto↔concetto obbligatori +
  vocabolario di relazioni di ragionamento + divieto di "correlato a"). Aggiunta
  `window.markKgCrossLinks()` in `app.js` per marcare `isCross` sui link laterali.
  - Risultato Google: densità 1.09→**2.0**, generiche 68%→**0%**, 55 tipi relazione.
  - Backup: `prompts_config.json.bak`, `public/prompts_default.json.bak`.
- **Causa C (Infomaniak) — APERTA 🟠, confermata dai dati:** stesso template,
  Infomaniak GEMMA arriva solo a densità **1.31**, 36% generiche. Aderisce al
  prompt a metà perché `responseMimeType:"application/json"` (payload KG in
  `app.js` ~3438) viene convertito dal bridge in reminder testuale (§10.6).
  **PROSSIMA AZIONE:** branch per rimuovere `responseMimeType`+`responseSchema`
  quando `aiProvider==='infomaniak'`, affidando il parsing a `salvageTruncatedJSON`.
**Fatto:** mirror template su `KNOWLEDGE_GRAPH_SINGLE_STUDENT_IT` + `_EN` ✅ (sessione 2 giugno 2026 sera).

### 🟠 Bug: Gemini Pro tronca risposta KG
**Sintomo:** `"Unexpected end of JSON input"` con modelli Pro
**Causa:** `maxOutputTokens` troppo basso per risposte lunghe
**Fix:** aumentare `maxOutputTokens` a 16384 per modelli Pro

### 🟡 CSS: 703 `!important` in style.css
**Causa:** guerra di specificità tra Tailwind e CSS custom
**Fix parziale:** 2 bug confermati già risolti
(`.grid-cols-2` e `.text-indigo-500`)
**Fix completo:** refactoring CSS progressivo

### 🟡 `salvageTruncatedJSON` — pre-pulizia aggiunta
Aggiunta pulizia markdown, chiavi non quotate, virgole trailing
per robustezza con modelli open source

### 🟡 Focus + Lenses: posizione nel template
`{{focusTopic}}` va sempre **prima** dello schema JSON nel template,
mai dopo. Verificare in `prompts_default.json`.

### ✅ Bug risolto: collisione `group` dopo merge/relink (3 giugno 2026 sera)
**Sintomo:** dopo "Fondi con..." o "Cambia Link", due nodi L1 assumevano lo stesso
colore; il color picker di uno cambiava anche l'altro e i rispettivi branch.
**Causa:** `_recalcLevels` aggiornava solo `node.level`, mai `node.group`.
Se un nodo veniva promosso a L1 via Cambia Link, ereditava il `group` del vecchio
genitore — identico a un L1 esistente. Stesso problema con i figli di A dopo merge
in B (mantenevano `group = A.group` invece di `group = B.group`).
**Fix:** `_recalcGroups()` e `_nextFreeGroup()` in `mappai-node-merge.js`:
- `executeMerge` step 7b: propaga `B.group` a tutto il sottoalbero di B
- `executeRelink`: se A diventa L1 assegna un intero libero via `_nextFreeGroup()`,
  altrimenti eredita `newParent.group`; poi propaga via `_recalcGroups`

---

## 9. PATTERN DI CODICE IMPORTANTI

### Salvataggio file nel vault (Electron)
```javascript
// Usa l'handler IPC save-pdf-to-vault in main.js
await window.electronAPI.savePDFToVault({ base64Data, fileName, vaultPath });
```

### Rendering dopo modifica al DOM
```javascript
// Dopo aver iniettato HTML con KaTeX
window.renderLatexInElement(document.getElementById('source-modal-body'));
// Dopo aver iniettato icone Lucide
window.safeCreateIcons(); // chiamata da 62 funzioni — hub globale
```

### Costruzione payload AI
```javascript
const payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
        // NON aggiungere responseMimeType per Infomaniak
    }
};
const response = await window.fetchModelAPI(payload, window.getSystemKey());
```

### Template prompt con fillPromptTemplate
```javascript
// I template sono in prompts_default.json
// Le variabili usano sintassi {{variabile}}
// focusTopic va PRIMA dello schema JSON nel template
const prompt = window.fillPromptTemplate('NOME_TEMPLATE_IT', {
    rootNodeLabel: appState.rootNodeLabel,
    textParts: textParts.join('\n\n'),
    focusTopic: appState.focusTopic
        ? '\n\nISTRUZIONI AGGIUNTIVE:\n' +
          appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').trim() + '\n'
        : ''
});
```

---

## 9. SKILL DI ANALISI DISPONIBILI

### `/analyze-mm` — analisi metacognitiva vault MindMap
- File: `~/.claude/skills/analyze-mm/SKILL.md`
- **Uso**: `/analyze-mm` (auto-detect) | `/analyze-mm <vault>` | `/analyze-mm <v1> <v2>`
- **Pipeline**: lettura nodi/link → graphify re-analisi → confronto strutturale → report
- **Output sezione tecnica**: metriche strutturali, anomalie, raccomandazioni template
- **Output sezione didattica**: valutazione pedagogica per docente/OPI
- Vault base: `~/Documents/MappAI - Vault/`

### `/graphify` — knowledge graph da qualsiasi input
- File: `~/.claude/skills/graphify/SKILL.md`
- Usato dalla skill analyze-mm per ottenere il "ground truth" semantico dei vault
- **Il repo ha il suo grafo** (agg. **20/8/26**): `graphify-out/graph.json` — **7983 nodi,
  13523 archi, 364 comunità**; etichette del 18/8 conservate (aggiornamento **strutturale**:
  AST sui 49 file cambiati del 20/8 — visione, proiezione, scelta — zero chiamate AI; potati
  i 68 nodi del Cloze pensionato: ⚠️ `prune_sources` confronta percorsi ASSOLUTI coi
  `source_file` RELATIVI del grafo e non morde — potatura fatta a mano sui path relativi). ⚠️ `--update` da solo scansiona TUTTO il repo (1271 file, 2,2 M parole, video
  compresi) e rifarebbe l'estrazione semantica su piani vecchi e asset: il grafo invece
  vive sul corpus CURATO (corpus CURATO: public/js senza vendored/minificati, main.js,
  server LAN, tools/banco-layout, tests, traduzioni + CLAUDE.md e README del banco come
  semantica). Le domande sul codice passano da `graphify query "..."` (fast path, zero
  re-estrazione). Dopo modifiche grosse: `/graphify . --update`. `graph.html` = vista
  interattiva per comunità.

---

## 10. REGOLE DI SVILUPPO

1. **MAI usare `appState.nodes`** — usare sempre `appState.db.nodes`
2. **Nuovi file JS** → caricare in `index.html` dopo `app.js`, prima di `admin_prompts.js`
3. **Nuovi bottoni dentro form** → sempre `type="button"` per evitare submit accidentale
4. **CSS** → modifiche nel blocco `@layer components` in `index.html`, non in `style.css`
5. **JSON.parse su risposta AI** → sempre usare `salvageTruncatedJSON()`, mai `JSON.parse` diretto
6. **Infomaniak** → non usare `responseMimeType: "application/json"` nel payload
7. **Lenses nel prompt** → sanitizzare con `.replace(/[`"{}[\]\\]/g, ' ')` prima dell'iniezione
8. **Test su entrambi i provider** — un fix che funziona solo su Google non è accettabile
9. **Merge/Relink** → dopo `_recalcLevels` chiamare sempre `_recalcGroups`; se un nodo
   diventa L1 usare `_nextFreeGroup()` — mai lasciare che erediti il group del vecchio genitore
10. **Modal dinamici (creati via JS)** → usare classi `.pm-*` da `index.html §11` + Lucide icons;
    chiamare `window.safeCreateIcons()` dopo l'append al DOM
11. **Prompt-modal nuovi** → rispettare la gerarchia `.pm-*`: `pm-icon-wrap` + `pm-title` +
    `pm-subtitle` nell'header; `pm-section` + `pm-section-title` per gruppi opzioni;
    `pm-option` + `pm-option-label` + `pm-option-desc` per radio/checkbox; `pm-btn-cancel` /
    `pm-btn-primary` per i bottoni footer
12. **Linking words (verbi `rel`)** → unica fonte: i `keywords` di `EDGE_FAMILIES` in
    `mappai-relations.js`. Verbo nuovo = 1 riga lì (famiglia giusta) → appare in tutti i
    prompt (`buildRelVocabularyBlock`, placeholder `{{relVocabulary}}` nei template JSON)
    e viene classificato col colore giusto (`REL_FAMILY_MAP` è generata dai keywords).
    MAI hardcodare liste di verbi nei prompt. Dettagli: `docs/rules/07-relations-taxonomy.md`
13. **i18n (UI in inglese, 6 lug 2026)** → tre meccanismi:
    - HTML statico: attributi `data-i18n` / `data-i18n-placeholder` / `data-i18n-title`
      processati da `changeLanguage` (mappai-storage-lang.js). Le chiavi DEVONO esistere
      in ENTRAMBI i dizionari (`public/traduzioni/*_translations.js`), altrimenti lo
      switch EN→IT non ripristina l'italiano.
    - Stringhe nei moduli JS: `window.t('chiave', 'fallback italiano')` (helper in
      `public/traduzioni/i18n-helper.js`, caricato subito dopo i dizionari). Il fallback
      inline È il testo italiano → chiave solo in `en_translations.js`.
    - Moduli UMD testati in Node (jigsaw, palace): usare `_tSafe(k, f)` locale,
      MAI `window.t` diretto (in Node `window` non esiste → test rossi).
    Verifica di coerenza: ogni chiave `data-i18n` in index.html presente in entrambi i
    dizionari; ogni chiave `t()`/`_tSafe()` presente in en_translations.js.
14. **Lingua delle MAPPE (≠ lingua interfaccia, 7 lug 2026)** → impostazione
    `mappai_map_language`: `'ui'` (default, segue l'interfaccia = comportamento storico),
    `'it'`, `'en'`, `'auto'` (lingua delle fonti). Selettore nel modale config AI
    (`#map-language-select`) + onboarding doppia scelta al primo avvio
    (`showLanguageOnboarding`, solo installazioni fresche).
    - Helper (i18n-helper.js): `getMapLanguage()` → 'it'|'en'|'auto';
      `getPromptLanguage()` → lingua dei testi prompt; `relVocab(style)` → vocabolario
      linking words nella lingua giusta ('auto' = doppio IT+EN); `mapLangNote()` →
      istruzione OUTPUT LANGUAGE (vuota per 'it').
    - `fillPromptTemplate` sceglie `_IT`/`_EN` dalla lingua mappe e riempie
      `{{relVocabulary}}` di conseguenza; con 'auto' appende l'istruzione lingua-fonti.
    - Tassonomia BILINGUE: `EDGE_FAMILIES` ha `keywordsEn`/`labelEn`/`defaultRelEn`;
      `REL_FAMILY_MAP` contiene entrambe le lingue → frecce inglesi classificate/colorate.
      `KG_REL_ENUM` è GENERATO dalla tassonomia; lo schema usa `window.getKgRelEnum()`
      (lingua mappe). MAI ri-hardcodare l'enum.
    - Prompt JS: KG Community ha coppia IT/EN completa; Fase 2 KG multi-pass, Fase 3
      JSONL e Fase 4 usano istruzioni IT + `mapLangNote()` (output nella lingua giusta).
    - ⚠️ Le mappe già generate NON vengono ritradotte: il selettore governa solo le
      generazioni successive.
15. **Tabelle di dati (righe multiple con colonne, 19 lug 2026)** → SEMPRE
    `<table class="table-fixed"><colgroup>` con larghezze fisse per colonna, MAI
    CSS grid ripetuto riga-per-riga. Motivo: con grid ogni riga è un contenitore
    a sé — se il contenuto varia (es. n° bottoni diverso tra righe), la colonna
    `auto`/`1fr` si ridimensiona in modo indipendente riga per riga e le intestazioni
    smettono di allinearsi alle celle sottostanti. Con `<table>` header e righe
    condividono lo STESSO layout di colonne per costruzione.
    - Riferimento: `mappai-landing-teach.js` (helper `th()`/`td()`/`fileTable()`/
      `actTable()`) — 4 tabelle della landing Insegna, verificate con harness
      Node (`th` count === `td` count === `<col>` count per ogni tabella).
    - Header e celle **allineati a sinistra di default**; centra (`text-center`)
      SOLO se richiesto esplicitamente per una colonna specifica (es. contatori
      numerici brevi) — mai come default silenzioso, e mai header disallineato
      dalla cella (stesso `text-align` su entrambi).
    - Colonna azioni (icone PLAY/QR/FOLDER/BIN…) → ultima `<col>` a **larghezza
      fissa**, mai `auto`: il numero di bottoni per riga può variare (es. QR
      disabilitato se manca il vault) senza spostare le colonne a sinistra.
    - Date → formato **GG/MM/AAAA** (`fmtDate` in mappai-landing-teach.js),
      mai formati locali (`toLocaleDateString` con mese testuale) per coerenza
      tra tabelle.
    - Eliminazione (BIN) → SEMPRE conferma a **digitazione del nome esatto**
      dell'elemento (pattern `confirmDeleteText`), mai un solo click o un
      confirm generico: previene cancellazioni accidentali su elenchi densi.
    - Prima di aggiungere colonne o spostarne l'ordine, verificare con uno
      script Node che itera l'HTML generato (conteggio `<th>`/`<td>`/`<col>`)
      che l'allineamento resti corretto — un browser reale con licensing
      attivo spesso non è disponibile per la verifica visiva immediata.

16. **Coerenza grafica landing (Costruisci/Elabora/Insegna, 22 lug 2026)** → i tre
    tab della landing DEVONO condividere larghezza, stile bottoni, gerarchia font.
    Design token unici (mai inventarne di nuovi più stretti/di altro colore):
    - **Larghezza contenuto = 1100px.** Il blocco globale in `public/css/style.css`
      (`#landing-view .glass-card>div, #setup-form, .max-w-2xl, .max-w-3xl,
      .teach-section-card, #teach-content>div, #elabora-content>div → max-width:
      1100px !important`) rende la landing piatta e larga. Ogni NUOVA sezione/barra
      di landing usi `.teach-section-card` o `max-w-2xl` (entrambi mappati a 1100),
      MAI un `max-w-[NNNpx]` custom (era il bug INSEGNA/ELABORA a 806/820 → strette).
      Se aggiungi un contenitore diretto sotto `#teach-content`/`#elabora-content`,
      è già coperto dal selettore `>div`.
    - **Bottoni azione grigio→emerald** (stile COSTRUISCI `.btn_quick_action` /
      `.btn_selezione_input`): `bg-slate-100` a riposo, `hover:bg-emerald-400
      hover:text-white`, `text-slate-500 font-bold`, label CENTRATA su due righe
      (`.teach-qs-btn span` = flex + `min-h-[2.4em]` + `leading-tight`). L'accento
      interattivo sui bottoni grigi è SEMPRE `emerald-400`, mai indigo/teal-*.
    - **Header di sezione** = `.teach-section-card` con header
      `text-sm font-bold text-slate-600` + icona Lucide `text-indigo-400` + chevron
      `text-slate-400` (identico al toggle «Progetti salvati» di COSTRUISCI,
      `index.html:1046-1053`). L'indigo è l'accento di icone/link di sezione; il
      grigio-emerald è l'accento dei bottoni-card. Non mischiare i due schemi.
    - **Regola generale**: ogni nuova grafica di landing (sezioni, barre, bottoni,
      modali, font) riusa questi token. Verifica visiva: servire `public/` con un
      http server locale, aprire nel Browser pane, nascondere `#beta-lock-screen`
      lato-DOM e misurare le larghezze (il licensing blocca la vista ma non il DOM).

---

---

## 11. STATO DEL LAVORO

> Il diario giorno-per-giorno di questa sezione (4433 righe, dal maggio 2026 al 20 agosto 2026)
> vive ora in **[`docs/DIARIO-2026.md`](docs/DIARIO-2026.md)**. Qui restano solo le tabelle di
> riferimento che servono sempre.
>
> **👉 Per sapere a che punto è il lavoro: [`docs/HANDOFF.md`](docs/HANDOFF.md).**
> È l'unico documento di STATO, ed è aggiornato. Contiene: che cosa c'è in `main`, gli
> interruttori accesi e spenti, il debito dichiarato, la lista di prova in Electron.

### Flag feature disponibili (tutti gated da localStorage)
> ⚠️ **Questa tabella si è fermata all'estate 2026 e non è più la fonte.** I kill-switch
> vivi — veste manifesto, console, bento, vista studio, indicatore dei lavori, contesto
> della generazione — stanno in **[`docs/HANDOFF.md`](docs/HANDOFF.md) §2**. Quella qui
> sotto riguarda i flag della GENERAZIONE (prompt, fasi, deepening) e resta utile per
> quelli.

| Flag localStorage key | Funzione | Default |
|---|---|---|
| `mappai_jsonl_enabled` | JSONL sezionato in Fase 3 (solo Infomaniak) | OFF |
| `mappai_branch_boundaries_enabled` | Catalogo L1 fratelli nei prompt Fase 3 | OFF |
| `mappai_mm_phase4_enabled` | Merge + cross-link semantici post-gen | OFF |
| `mappai_mm_phase5_enabled` | Riclassificazione L2/L3 mal collocati | OFF |
| `mappai_l1_validation_enabled` | Validazione L1 dopo Fase 1 (conservativa) | OFF |
| `mappai_freeze_chunks` | Freeze: NON salva i chunk verbatim (prep STEP 2) | OFF |
| `mappai_enrich_descs_enabled` | Arricchisce desc sottili (<35 parole) dalla fonte, post-gen | OFF |
| `mappai_l1_split_enabled` | Fase 1.6: spezza macro-aree composte ("Neutralità e Difesa" → 2 atomiche) | OFF |
| `mappai_rich_rel_enabled` | Fase 3: linking words significative su ogni arco (concept-map), non "include" | OFF |
| `mappai_kg_community_mode` | **KG Community (stile MiniMAP)**: single-pass + comunità GraphRAG invece dell'albero forzato. Solo modalità KG | OFF |
| `mappai_deepening_enabled` | Kill-switch generale della **Fase 3.7 deepening** (nodi `_D` di approfondimento). `'false'` = niente pass di approfondimento | ON |
| `mappai_deepen_residue` | Deepening in **modalità residuo+verdetto (P1+P2)**: materiale dalla fonte + scarto delle parafrasi. `'false'` = comportamento legacy (materiale = desc del padre, nessun verdetto anti-parafrasi) | ON |
| `mappai_doc_zoom_<kind>` | **Dimensione dell'anteprima** nell'editor documenti, per tipo (`quiz`/`flashcards`/`synthesis`/`nodesheet`). Gradini 0.85·1·1.15·1.3·1.5; moltiplica lo zoom automatico, non tocca la stampa | 1 |
| `mappai_active_discipline` | **Disciplina attiva** (contesto di generazione, 29/7). Scritta dal modale classe+disciplina; vale solo se coerente con la classe attiva (`effectiveDiscipline`). Governa la cartella `Mappe/<classe>/<disciplina>/` | vuoto |
| `mappai_font_selettore` | **il carattere scegliibile** (18/8). `'0'` → tutto Space Mono e la vista «Aspetto e leggibilità» resta inerte | ON |
| `mappai_font_app` | il carattere dell'app, scritto da Cabina › Aspetto e leggibilità | assente = Space Mono |
| `mappai_visione` | **le fonti iconografiche** (20/8): bottone «Immagini» in CREA, dossier, passo «Da che cosa» in ELABORA. La lettura è di Gemini via `fetchModelAPI` | ON |
| `mappai_a11y_everywhere` | `'1'` = **strumenti compensativi ovunque** (comportamento storico). Di default il bottone a11y vive solo nel contesto di lettura — mappa, schede dei nodi, sidebar/Raccoglitore — e fuori di lì gli effetti si sospendono e si ripristinano al rientro | OFF |

**Comandi console:**
```js
MappAIMetrics.enableJSONL()            MappAIMetrics.disableJSONL()
MappAIMetrics.enableBranchBoundaries() MappAIMetrics.disableBranchBoundaries()
MappAIMetrics.enablePhase4()           MappAIMetrics.disablePhase4()
MappAIMetrics.enablePhase5()           MappAIMetrics.disablePhase5()
MappAIMetrics.enableL1Validation()     MappAIMetrics.disableL1Validation()
MappAIMetrics.enableChunkFreeze()      MappAIMetrics.disableChunkFreeze()
MappAIMetrics.enableEnrichDescs()      MappAIMetrics.disableEnrichDescs()
MappAIMetrics.enableL1Split()          MappAIMetrics.disableL1Split()
MappAIMetrics.enableRichRel()          MappAIMetrics.disableRichRel()
MappAIMetrics.enableCommunityKG()      MappAIMetrics.disableCommunityKG()
MappAIMetrics.report()                 // Markdown in clipboard
```

> 🆕 **KG Community mode (8 giugno 2026) — ispirato a MiniMAP:** nuova funzione
> `extractKnowledgeGraphCommunity` in `app.js` (prima di `extractKnowledgeGraphMultiPass`).
> Routing in `startGeneration` (~L.2551): se `mappai_kg_community_mode==='true'` e mode=kg,
> bypassa single/multi-pass. **Single-pass** (1 sola chiamata, no drift ID), **comunità
> GraphRAG** (l'LLM fa community detection 3-6 macro-temi → niente god-node, rami bilanciati),
> **prompt minimale** (15 righe vs centinaia), **link laterali** concetto↔concetto preservati
> come cross-link. Crea hub sintetici `COMM_<id>` (level 1, desc=summary) per ancorare rendering
> hub-and-spoke + modalità studio. Schema ON anche su Infomaniak (phase=1 in `_kgGenerationConfig`):
> in single-pass un JSON rotto perde tutto → pulizia JSON prioritaria. Pienamente reversibile:
> disattiva il flag e torna al comportamento precedente. Da testare su Google (path ottimale) e
> Infomaniak/GEMMA.

> ⚠️ **Nota schema L1 (7 giugno 2026):** la config attiva è `prompts_config.json` (root),
> non `prompts_default.json`. Entrambi ora chiedono 5 chiavi L1 (`label, rel, ambito, desc,
> confini`) + regola di atomicità + tetto 3-7. Lo `schemaL1` in `app.js` (×2) include i 5
> campi. Se esiste un override utente in `userData/prompts_config.json`, usare "Ripristina
> Default" nell'admin dashboard (CTRL+SHIFT+P,O,I,U) per ricaricare il template aggiornato.
> Carta del ramo (ambito/desc/confini del ramo corrente nel prompt Fase 3) gated dal flag
> esistente `mappai_branch_boundaries_enabled`. Backup template: `*.json.bak`.

**Modello content/desc (rilevante per i modali di studio):**
- `desc` = campo RICCO (paragrafo di studio) → mostrato in tutti i modali, dossier, quiz, tutor.
- `content` = campo breve/legacy, tenuto in sync su edit, usato solo come fallback.
- Tutte le superfici di studio leggono `desc || content` (mai `content || desc`).
- La card sul canvas mostra sempre `label` (né content né desc).

### Branch git attivi
| Branch | Ruolo |
|--------|-------|
| `main` | baseline stabile — default branch |
| `global` | CSS/HTML refactoring (style.css, index.html) |
| `dev` | JS/AI logic (app.js, prompts) — include merge/relink (5/6/26) |
| `feat/structural-suggestions` | branch corrente WIP |
| `feat/kg-hub-extraction` | feature KG link bidirezionali |
| `MappAI_iPad` / `MappAI_iPad_studente` | iPadOS — in standby |

Branch eliminati (3 giugno 2026): `MappAI_studente`, `MappAI_main`, `test-macos-mappai-packaging`.

### Non toccare ora
- Sistema di licensing (machine-id)
- Cartella `ios/` (Capacitor)
- File di build

### Quando si riprenderà il lavoro iPadOS
Quando si lavora su funzionalità che potrebbero essere portate su iPadOS
(branch Capacitor separato), verificare sempre la compatibilità:
- Accesso al file system locale → non supportato su iPadOS, proporre
  alternativa via Capacitor Filesystem API o cloud storage
- IPC Electron (`electronAPI.*`) → non disponibile su iPadOS, usare
  `storageAdapter.js` che già astrae le differenze di piattaforma
- Ogni nuova funzione nativa Electron va documentata con un TODO iPadOS

---

## 12. COMANDI UTILI

```bash
# Avvia l'app in sviluppo
npm start

# Build per distribuzione
npm run dist

# Verifica struttura cartelle
ls -la public/js/

# Cerca pattern nel codice
grep -rn "pattern" public/js/ --include="*.js"
```

---

## 13. CONTESTO PERSONALE

Giacomo è un ex insegnante.
MappAI è il suo progetto principale — ha investito ~900 ore.
Ha già adesioni da professionisti dell'educazione svizzeri.
Lavora come vibecoder usando IDE agentici (Antigravity, Claude Code).
Preferisce approcci graduali, spiegazioni chiare, zero panico.
Ogni modifica deve essere reversibile e ben documentata.
